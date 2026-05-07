"""
toolcall_stream_parser.py — Generic streaming tool-call parser for KoboldCpp
=============================================================================

Handles streaming extraction of tool calls across all wire formats found in
the 54 Jinja templates in the templates/ directory (37 distinct structural
constructs, documented in ~/.config/Code/User/prompts/jinja-toolcall-formats.md).

Architecture
------------
1.  ToolCallStreamParser.from_rendered(rendered, call_open_tag, quote_markers)
    Analyses the Jinja-rendered dummy output (which contains the placeholder
    function name DUMMY_FUNC = 'super_unique_func') to derive every structural
    pattern for the current model's wire format.  This is cheap (done once per
    request) and requires no special knowledge about which model is loaded.

2.  parser.feed(chunk: str) → List[Event]
    Process one incoming token chunk.  Returns a (possibly empty) list of
    events.  Call for every token from the generation stream.  Never blocks.

3.  parser.flush() → List[Event]
    Call once at stream-done to force-close any open state and emit 'done'.

Events (tuples)
---------------
  ('start',)           — tool-call boundary detected, parser is now active
  ('name', str)        — function name; emit SSE name field immediately
  ('args_chunk', str)  — well-formed JSON fragment; emit as SSE args delta
  ('done',)            — arguments closed; send finish_reason='tool_calls'

Args modes
----------
  json        — standard JSON depth-counting (most formats)
  param_eq    — <parameter=key>value</parameter>  → JSON  (Qwen3-Coder etc.)
  glm         — <arg_key>k</arg_key><arg_value>v</arg_value>  → JSON (GLM)
  dsml        — <｜DSML｜parameter name="k" string="t|f">v</｜DSML｜parameter>
                → JSON  (DeepSeek V3.2)
  param_name  — <parameter name="key">value</parameter>  → JSON  (MiniMax)

Quote markers
-------------
  Gemma uses <|"|> as a string delimiter.  Pass quote_markers=['<|"|>'] to
  transparently replace them with plain '"' before entering JSON mode.  The
  brace-style arg format  call:func{key:<|"|>val<|"|>}  is treated as standard
  JSON once the markers are normalised, so downstream consumers always receive
  valid JSON fragments.

Integration note
----------------
This module is self-contained.  It does NOT import koboldcpp internals.  The
caller is responsible for:
  - Calling getDummyJinjaParsedBody() to obtain `rendered`.
  - Detecting `call_open_tag` from tool_call_pairs (or from rendered).
  - Detecting `quote_markers` from rendered (scan for <|X"|X> patterns).
  - Forwarding events to the SSE emit function.
  - Calling flush() when streamDone is True.

Typical koboldcpp integration sketch:

    parser = ToolCallStreamParser.from_rendered(rendered, tool_segment_tag,
                                                tcQuoteMarkers)
    # ... in token loop:
    for event in parser.feed(tokenStr):
        if event[0] == 'name':
            await emit_initial_sse(name=event[1], tool_call_id=...)
        elif event[0] == 'args_chunk':
            await emit_args_delta(event[1])
        elif event[0] == 'done':
            await emit_finish_reason('tool_calls')
            return
    # ... at streamDone:
    for event in parser.flush():
        ...
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

DUMMY_FUNC: str = 'super_unique_func'

# An event is a tuple whose first element is the event type string.
Event = Tuple


# ---------------------------------------------------------------------------
# Format specification (derived once from the rendered Jinja output)
# ---------------------------------------------------------------------------

@dataclass
class FormatSpec:
    """All structural parameters for one wire format, derived from rendered."""

    # String that marks the start of a tool-call section in the live stream.
    # When call_open is '', the parser enters PRE_NAME immediately.
    call_open: str = ''

    # Literal text immediately before the function name in the stream.
    # The parser scans for this prefix and starts capturing name after it.
    name_prefix: str = ''

    # Character(s) that terminate the function name.
    # The parser emits the ('name', ...) event when this suffix is found.
    name_suffix: str = '"'

    # Optional regex anchored at the start of the buffer between end-of-name
    # and the first byte of the arguments.  Used to skip routing tokens,
    # counter suffixes, or field-name separators.
    # Example: r'[0-9]+<\|tool_call_argument_begin\|>'  (Kimi K2)
    args_skip_re: str = ''

    # How the argument block is encoded.
    # One of: 'json' | 'param_eq' | 'glm' | 'dsml' | 'param_name'
    args_mode: str = 'json'

    # Explicit end-of-arguments marker (empty string → rely on JSON depth).
    args_end: str = ''

    # Custom string delimiters that should be normalised to '"' before
    # entering the args state machine.  Gemma: ['<|"|>'].
    quote_markers: List[str] = field(default_factory=list)

    # Initial sub-state for the GLM args state machine.
    # 'wait'  – normal: scan for <arg_key> open tag first (default).
    # 'key'   – no-newline GLM variant: <arg_key> was consumed as name_suffix,
    #           so the buffer already starts with the key name content.
    glm_start_state: str = 'wait'


# ---------------------------------------------------------------------------
# Format detector
# ---------------------------------------------------------------------------

def detect_format(rendered: str,
                  call_open_tag: str = '',
                  quote_markers: Optional[List[str]] = None) -> FormatSpec:
    """
    Derive a FormatSpec from a rendered Jinja output that contains DUMMY_FUNC.

    Parameters
    ----------
    rendered      : Full rendered output (system turn + dummy assistant turn).
    call_open_tag : Wrapper tag that starts a tool-call block in the stream,
                    e.g. '<|tool_call>' or '<tool_call>'.  Pass '' if unknown.
    quote_markers : Custom string delimiters found in rendered (e.g. ['<|"|>']).
    """
    spec = FormatSpec(call_open=call_open_tag,
                      quote_markers=list(quote_markers or []))

    # Scope to the call section to avoid declaration-section false positives.
    call_section = rendered
    if call_open_tag and call_open_tag in rendered:
        call_section = rendered[rendered.index(call_open_tag):]

    idx = call_section.rfind(DUMMY_FUNC)
    if idx == -1:
        return spec  # unrecognised; caller falls back to passthrough

    prefix = call_section[:idx]           # everything before the function name
    suffix = call_section[idx + len(DUMMY_FUNC):]  # everything after

    # ── GLM: <tool_call>funcName[\n]<arg_key>…  ─────────────────────────────
    if suffix.lstrip().startswith('<arg_key>'):
        # Name follows immediately after the opening tag's '>'.
        spec.name_prefix = _text_after_last_gt(prefix)
        if '\n' in suffix[:8]:
            spec.name_suffix = '\n'
        else:
            # No newline between name and <arg_key> (GLM-4.7-Flash style).
            # Consume the full '<arg_key>' tag as the name terminator so the
            # buffer after name extraction begins with the key content directly.
            # The GLM state machine is initialised in 'key' state accordingly.
            spec.name_suffix = '<arg_key>'
            spec.glm_start_state = 'key'
        spec.args_mode = 'glm'
        # args_end must be the OUTER close tag (e.g. </tool_call>), not one of
        # the inner </arg_key> or </arg_value> tags.  Find the close tag that
        # comes after the last </arg_value> in the suffix.
        _last_av = suffix.rfind('</arg_value>')
        if _last_av != -1:
            _outer = _first_close_tag(suffix[_last_av + 12:])
            spec.args_end = _outer if _outer else ''
        else:
            spec.args_end = _first_close_tag(suffix)
        return spec

    # ── DeepSeek V3.2 DSML: <｜DSML｜invoke name="funcName"> ────────────────
    dsml_m = re.search(r'(<[^>]*?name=")$', prefix)
    if '｜DSML｜parameter' in suffix or (dsml_m and '｜DSML｜' in prefix):
        spec.name_prefix = dsml_m.group(1) if dsml_m else _find_attr_prefix(prefix, 'name="')
        spec.name_suffix = '"'
        spec.args_mode = 'dsml'
        m_end = re.search(r'(</[^>]*?｜DSML｜[^>]*?>)', suffix)
        spec.args_end = m_end.group(1) if m_end else ''
        return spec

    # ── MiniMax: <invoke name="funcName"> … <parameter name="key"> ──────────
    if re.search(r'<invoke\s+name="$', prefix) and '<parameter name=' in suffix:
        spec.name_prefix = '<invoke name="'
        spec.name_suffix = '"'
        spec.args_mode = 'param_name'
        spec.args_end = '</invoke>'
        return spec

    # ── Upstage Solar: <|tool_call:name|>funcName<|tool_call:args|> ─────────
    if suffix.startswith('<|tool_call:args|>') or prefix.endswith('<|tool_call:name|>'):
        spec.name_prefix = '<|tool_call:name|>'
        spec.name_suffix = '<|tool_call:args|>'
        spec.args_mode = 'json'
        spec.args_end = '<|tool_call:end|>'
        return spec

    # ── Kimi K2: functions.funcName:N<|tool_call_argument_begin|> ───────────
    if suffix.startswith(':') and '<|tool_call_argument_begin|>' in suffix:
        spec.name_prefix = 'functions.'
        spec.name_suffix = ':'
        spec.args_skip_re = r'[0-9]+<\|tool_call_argument_begin\|>'
        spec.args_mode = 'json'
        spec.args_end = '<|tool_call_end|>'
        return spec

    # ── DeepSeek R1-Distill: <｜tool▁call▁begin｜>type<｜tool▁sep｜>funcName\n```json\nargs ──
    # Same separator token as V3.1, but placed BEFORE the function name (as a
    # type-separator: "function<｜tool▁sep｜>funcName"), and args are code-fenced.
    _DS1_SEP = '<\uff5ctool\u2581sep\uff5c>'
    if _DS1_SEP in prefix:
        spec.name_prefix = _DS1_SEP  # name follows immediately after <｜tool▁sep｜>
        spec.name_suffix = '\n'
        spec.args_skip_re = r'```json\n'
        spec.args_mode = 'json'
        spec.args_end = '\n```'
        return spec

    # ── DeepSeek V3.1: <｜tool▁call▁begin｜>funcName<｜tool▁sep｜>args… ──────────
    # Distinguishing feature: function name directly follows the begin token,
    # with <｜tool▁sep｜>  (U+FF5C + 'tool' + U+2581 + 'sep' + U+FF5C) as separator.
    if suffix.lstrip().startswith(_DS1_SEP):
        spec.name_prefix = _text_after_last_gt(prefix)  # '' after <｜tool▁call▁begin｜>
        spec.name_suffix = _DS1_SEP
        spec.args_mode = 'json'
        # Extract args_end from the dummy rendered suffix
        after_sep = suffix[len(_DS1_SEP):]
        m_end = re.search(r'\{[^}]*\}(<[^>]+>)', after_sep)
        spec.args_end = m_end.group(1) if m_end else '<\uff5ctool\u2581call\u2581end\uff5c>'
        return spec

    # ── Mistral brackets: [TOOL_CALLS]funcName[CALL_ID]…[ARGS] ──────────────
    # call_open='[TOOL_CALLS]' is already consumed by _h_idle; name follows directly.
    if prefix.rstrip().endswith('[TOOL_CALLS]'):
        spec.name_prefix = ''  # name follows immediately after call_open
        spec.name_suffix = '['  # name ends at next '[' (start of [CALL_ID] or [ARGS])
        spec.args_skip_re = r'(?:CALL_ID\][A-Za-z0-9]+\[ARGS\]|ARGS\])'
        spec.args_mode = 'json'
        spec.args_end = ''
        return spec

    # ── OpenAI GPT-OSS: …to=functions.funcName<|channel|>… ─────────────────
    if 'to=functions.' in prefix or suffix.startswith('<|channel|>'):
        spec.name_prefix = 'to=functions.'
        spec.name_suffix = '<|channel|>'
        spec.args_skip_re = r'[a-z ]+<\|message\|>'
        spec.args_mode = 'json'
        spec.args_end = '<|call|>'
        return spec

    # ── Apertus: <|tools_prefix|>[{"funcName": {  (name as dict key) ─────────
    if re.search(r'\[\{"$', prefix):
        spec.name_prefix = '[{"'
        spec.name_suffix = '"'
        # name_suffix '"' consumes the closing key-quote; buffer starts with
        # ':' (colon after the key), so skip just ':' plus optional whitespace.
        spec.args_skip_re = r':\s*'
        spec.args_mode = 'json'
        spec.args_end = '<|tools_suffix|>'
        return spec

    # ── Cohere R+: "tool_name": "funcName" ──────────────────────────────────
    if '"tool_name"' in call_section and DUMMY_FUNC in call_section:
        spec.name_prefix = '"tool_name": "'
        spec.name_suffix = '"'
        spec.args_skip_re = r'[^{]*"parameters"\s*:\s*'
        spec.args_mode = 'json'
        spec.args_end = ''
        return spec

    # ── Functionary v3.2: >>>funcName\n ─────────────────────────────────────
    if '>>>' in prefix[-10:]:
        spec.name_prefix = '>>>'
        spec.name_suffix = '\n'
        spec.args_mode = 'json'
        spec.args_end = ''
        return spec

    # ── Fireworks: functools[{"name": "funcName" ─────────────────────────────
    if 'functools[' in prefix:
        # Falls through to standard JSON name-field detection below.
        pass

    # ── Gemma brace: call:funcName{key:<|"|>val<|"|>,...} ───────────────────
    stripped_suf = suffix.lstrip()
    colon_m = re.search(r'(\w+:)$', prefix)
    if stripped_suf.startswith('{') and (spec.quote_markers or colon_m):
        spec.name_prefix = colon_m.group(1) if colon_m else ''
        spec.name_suffix = '{'
        # The outer '{' is consumed as name_suffix; brace mode re-emits it and
        # quotes all keys recursively (keys at every depth are bare identifiers).
        spec.args_mode = 'brace'
        # Find the end tag that follows the closing '}' of the args block.
        # Match the outermost { ... } (non-greedy, no nested braces needed for
        # the dummy render) and capture what follows.  Works for both empty
        # args '{}' and non-empty args like '{loc:<|"|>x<|"|>}'.
        m_end = re.search(r'\{[^}]*\}(.+)', call_section[idx:], re.DOTALL)
        if m_end:
            remainder = m_end.group(1).lstrip()
            m_tok = re.match(r'(\S+)', remainder)
            if m_tok:
                spec.args_end = m_tok.group(1)
        return spec

    # ── XML function= tag: <function=funcName> … ────────────────────────────
    # Covers Functionary v3.1, Qwen3-Coder, Qwen3.5, StepFun, NVIDIA-Nano3,
    # ByteDance (outer tag differs but inner is <function=…>).
    if re.search(r'<function=$', prefix):
        spec.name_prefix = '<function='
        spec.name_suffix = '>'
        if '<parameter=' in suffix:
            spec.args_mode = 'param_eq'
        else:
            spec.args_mode = 'json'
        spec.args_end = '</function>'
        return spec

    # ── Standard JSON name field: "name": "funcName" ────────────────────────
    # Covers: standard <tool_call>, Hermes, Qwen 2.5/QwQ/Qwen3-0.6B, Llama 3.x,
    #         Apriel, NVIDIA Nemotron v2, IBM Granite 4.0, GigaChat, Reka,
    #         MiMo-VL, Bielik, DeepSeek D1 (after fenced block), Cohere R7B
    #         (tool_name field is handled above so only "name" reaches here).
    m_name = re.search(r'"name"\s*:\s*"$', prefix)
    if m_name:
        spec.name_prefix = '"name": "'
        spec.name_suffix = '"'
        # Detect whether the model uses "arguments" or "parameters".
        m_args = re.search(r'"(arguments|parameters)"\s*:\s*', suffix)
        args_field = m_args.group(1) if m_args else 'arguments'
        spec.args_skip_re = rf',\s*"{args_field}"\s*:\s*'
        spec.args_mode = 'json'
        spec.args_end = ''
        return spec

    # ── Fallback: JSON passthrough ───────────────────────────────────────────
    spec.args_mode = 'json'
    return spec


# ---------------------------------------------------------------------------
# Internal helpers for detect_format
# ---------------------------------------------------------------------------

def _text_after_last_gt(s: str) -> str:
    """Return the text after the last '>' in s (empty string if none)."""
    i = s.rfind('>')
    return s[i + 1:] if i != -1 else s


def _first_close_tag(s: str) -> str:
    """Return the first </tag> found in s, or ''."""
    m = re.search(r'(</[^>]+>)', s)
    return m.group(1) if m else ''


def _find_attr_prefix(s: str, attr_start: str) -> str:
    """Find the last open-tag prefix in s that ends with attr_start."""
    m = re.search(r'(<[^>]+' + re.escape(attr_start) + r')$', s)
    return m.group(1) if m else attr_start


# ---------------------------------------------------------------------------
# Quote-marker auto-detection
# ---------------------------------------------------------------------------

def detect_quote_markers(rendered: str) -> List[str]:
    """Scan *rendered* for non-standard string-quote markers.

    Some templates (e.g. Gemma) use a multi-character sequence such as
    ``<|"|>`` where a standard JSON double-quote would normally appear.
    This function looks for symmetric non-alphanumeric sequences that
    surround the known dummy argument value ``'x'`` in the rendered output.

    Returns a list of detected quote-marker strings (empty list when standard
    ``"`` quotes are used).
    """
    idx = rendered.find(DUMMY_FUNC)
    if idx == -1:
        return []
    args_region = rendered[idx + len(DUMMY_FUNC):]
    # Match: a non-standard delimiter (≥2 chars, no alnum / whitespace / std
    # JSON structural chars), then the literal 'x', then the same delimiter.
    # Note: " and ' are allowed WITHIN the sequence (e.g. <|"|>) — the ≥2
    # length requirement prevents a bare " or ' from being misdetected.
    m = re.search(r'([^\w\s,:{}()\[\]=.]{2,12})x\1', args_region)
    if m:
        return [m.group(1)]
    return []


# ---------------------------------------------------------------------------
# Streaming parser
# ---------------------------------------------------------------------------

class ToolCallStreamParser:
    """
    Stateful streaming parser.  Instantiate once per tool-call response.

    Call feed(chunk) for every incoming token string.  The parser emits
    events as soon as they are available — it never blocks on future tokens
    except for the minimal number of characters needed to identify a
    structural boundary (a tag name, an attribute value, or a key string).
    Long argument values always stream at per-character granularity.

    Call flush() when the generation stream ends to force-close any open
    state (guards against models that omit the final close token).
    """

    # State constants
    _IDLE      = 'idle'       # scanning for call_open
    _PRENAME   = 'pre_name'   # consuming name_prefix
    _NAME      = 'name'       # accumulating function name chars
    _SKIPARGS  = 'skip_args'  # consuming args_skip_re match
    _ARGS      = 'args'       # in args sub-state-machine
    _DONE      = 'done'

    def __init__(self, spec: FormatSpec):
        self._spec = spec
        self._state = self._IDLE
        self._buf = ''
        self._name = ''
        self._events: List[Event] = []

        # Compiled args_skip regex (None if not needed)
        self._skip_re: Optional[re.Pattern] = (
            re.compile(spec.args_skip_re) if spec.args_skip_re else None
        )

        # ── JSON depth-counting sub-state ────────────────────────────────────
        self._j_depth = 0
        self._j_in_str = False
        self._j_escaped = False

        # ── param_eq sub-state  (<parameter=key>value</parameter>) ───────────
        self._pe_state = 'idle'      # 'idle' | 'key' | 'value'
        self._pe_key = ''
        self._pe_first = True
        self._pe_is_str: Optional[bool] = None
        self._pe_str_opened = False  # True once opening '"' has been streamed
        self._pe_vbuf = ''           # accumulates value chars before close tag
        self._pe_tail = ''           # deferred trailing whitespace for raw JSON
        self._PE_OPEN  = '<parameter='
        self._PE_CLOSE = '</parameter>'

        # ── glm sub-state  (<arg_key>k</arg_key><arg_value>v</arg_value>) ────
        self._glm_state = spec.glm_start_state  # 'wait' | 'key' | 'val_open' | 'val'
        self._glm_key = ''
        self._glm_first = True
        self._glm_vbuf = ''
        self._GLM_KEY_O  = '<arg_key>'
        self._GLM_KEY_C  = '</arg_key>'
        self._GLM_VAL_O  = '<arg_value>'
        self._GLM_VAL_C  = '</arg_value>'

        # ── dsml sub-state  (<｜DSML｜parameter name="k" string="t|f">…) ─────
        self._dsml_state = 'wait'    # 'wait' | 'value'
        self._dsml_key = ''
        self._dsml_is_str: Optional[bool] = None
        self._dsml_first = True
        self._dsml_vbuf = ''
        # Matches the DSML parameter open tag; built lazily on first DSML call.
        self._dsml_open_re: Optional[re.Pattern] = None
        self._dsml_close_re: Optional[re.Pattern] = None

        # ── param_name sub-state  (<parameter name="key">value</parameter>) ──
        self._pn_state = 'wait'      # 'wait' | 'value'
        self._pn_key = ''
        self._pn_first = True
        self._pn_is_str: Optional[bool] = None
        self._pn_vbuf = ''
        self._pn_tail = ''
        self._PN_OPEN_RE = re.compile(r'<parameter\s+name="([^"]+)">')
        self._PN_CLOSE = '</parameter>'

        # ── brace sub-state (Gemma {unquoted_key:value,...} format) ───────────
        # The outer '{' was consumed as name_suffix; _args_brace re-emits it.
        # All keys at every depth are bare identifiers that need quoting.
        self._b_state = 'outer_start'   # see _args_brace for state docs
        self._b_stack: list = []        # stack of {'kind':'obj'|'arr','first':bool}
        self._b_key_buf = ''            # accumulates current unquoted key
        self._b_str_esc = False         # backslash-escape flag inside strings

        # ── Quote-marker split handling ───────────────────────────────────────
        # Tail of previous chunk that might be a prefix of a quote marker.
        # Prepended to the next chunk before replacement runs.
        self._qm_tail: str = ''

    # ── Factory ──────────────────────────────────────────────────────────────

    @classmethod
    def from_rendered(cls,
                      rendered: str,
                      call_open_tag: str = '',
                      quote_markers: Optional[List[str]] = None
                      ) -> 'ToolCallStreamParser':
        """
        Build a parser by analysing the rendered Jinja dummy output.

        Parameters
        ----------
        rendered      : Output of getDummyJinjaParsedBody() (contains DUMMY_FUNC).
        call_open_tag : The outer wrapper tag that begins a tool-call block,
                        e.g. '<|tool_call>' or '<tool_call>'.
        quote_markers : Custom string delimiters found in rendered, e.g. ['<|"|>'].
        """
        spec = detect_format(rendered, call_open_tag, quote_markers)
        return cls(spec)

    # ── Public interface ─────────────────────────────────────────────────────

    @property
    def is_done(self) -> bool:
        """True after a 'done' event has been emitted."""
        return self._state == self._DONE

    @property
    def spec(self) -> FormatSpec:
        return self._spec

    def feed(self, chunk: str) -> List[Event]:
        """
        Process one incoming token chunk.

        Returns a list of events (may be empty).  Never raises; errors result
        in a fallthrough to passthrough mode.
        """
        if not chunk or self._state == self._DONE:
            return []

        # Normalise custom quote markers (e.g. Gemma <|"|> → ").
        # When streaming very small chunks (e.g. one character at a time), a
        # marker such as '<|"|>' (6 chars) may be split across consecutive calls.
        # We solve this by prepending any held-back potential-marker prefix from
        # the previous call before running the replacement.
        if self._spec.quote_markers:
            if self._qm_tail:
                chunk = self._qm_tail + chunk
                self._qm_tail = ''
            for qm in self._spec.quote_markers:
                chunk = chunk.replace(qm, '"')
            # Hold back any tail that could be the start of a quote marker,
            # so that the next call can complete the replacement.
            # Iterate tail lengths from longest-possible down to 1.
            max_qm_len = max(len(qm) for qm in self._spec.quote_markers)
            for tail_len in range(min(max_qm_len - 1, len(chunk)), 0, -1):
                tail = chunk[-tail_len:]
                if any(qm.startswith(tail) for qm in self._spec.quote_markers):
                    self._qm_tail = tail
                    chunk = chunk[:-tail_len]
                    break

        if not chunk:
            return []

        self._events = []
        self._buf += chunk
        self._run()
        return self._events

    def flush(self) -> List[Event]:
        """
        Force-close: finalize any open state and emit 'done'.
        Call once when the generation stream ends.
        """
        if self._state == self._DONE:
            return []
        # Flush any held-back quote-marker tail into the buffer.
        if self._qm_tail:
            self._buf += self._qm_tail
            self._qm_tail = ''
        self._events = []
        closing = self._close_open_args()
        if closing:
            self._events.append(('args_chunk', closing))
        self._state = self._DONE
        self._events.append(('done',))
        return self._events

    # ── Internal dispatch ─────────────────────────────────────────────────────

    def _emit(self, event: Event) -> None:
        self._events.append(event)

    def _emit_args(self, frag: str) -> None:
        if frag:
            self._emit(('args_chunk', frag))

    def _run(self) -> None:
        """Main loop: dispatch to the current state handler."""
        prev_len = -1
        prev_state: Optional[str] = None
        while self._buf and (len(self._buf) != prev_len or self._state != prev_state):
            prev_len = len(self._buf)
            prev_state = self._state
            s = self._state
            if s == self._IDLE:
                self._h_idle()
            elif s == self._PRENAME:
                self._h_prename()
            elif s == self._NAME:
                self._h_name()
            elif s == self._SKIPARGS:
                self._h_skipargs()
            elif s == self._ARGS:
                self._h_args()
                break  # args handler drains the buffer completely each call
            elif s == self._DONE:
                self._buf = ''
                break

    def _h_idle(self) -> None:
        call_open = self._spec.call_open
        if not call_open:
            self._state = self._PRENAME
            return
        idx = self._buf.find(call_open)
        if idx != -1:
            self._buf = self._buf[idx + len(call_open):]
            self._emit(('start',))
            self._state = self._PRENAME
        else:
            # Keep just enough tail in case call_open is split across chunks.
            keep = max(0, len(self._buf) - len(call_open) + 1)
            self._buf = self._buf[keep:]

    def _h_prename(self) -> None:
        prefix = self._spec.name_prefix
        if not prefix:
            self._state = self._NAME
            return
        idx = self._buf.find(prefix)
        if idx != -1:
            self._buf = self._buf[idx + len(prefix):]
            self._state = self._NAME
        else:
            keep = max(0, len(self._buf) - len(prefix) + 1)
            self._buf = self._buf[keep:]

    def _h_name(self) -> None:
        suf = self._spec.name_suffix
        if not suf:
            return  # wait for more data
        idx = self._buf.find(suf)
        if idx != -1:
            self._name += self._buf[:idx]
            self._buf = self._buf[idx + len(suf):]
            self._emit(('name', self._name))
            if self._skip_re:
                self._state = self._SKIPARGS
            else:
                self._state = self._ARGS
        else:
            keep = max(0, len(self._buf) - len(suf) + 1)
            self._name += self._buf[:keep]
            self._buf = self._buf[keep:]

    def _h_skipargs(self) -> None:
        m = self._skip_re.match(self._buf)  # type: ignore[union-attr]
        if m:
            self._buf = self._buf[m.end():]
            self._state = self._ARGS
        elif len(self._buf) > 512:
            # Skip pattern never matched — give up and treat remainder as args.
            self._state = self._ARGS

    def _h_args(self) -> None:
        mode = self._spec.args_mode
        if mode == 'json':
            self._args_json()
        elif mode == 'param_eq':
            self._args_param_eq()
        elif mode == 'glm':
            self._args_glm()
        elif mode == 'dsml':
            self._args_dsml()
        elif mode == 'param_name':
            self._args_param_name()
        elif mode == 'brace':
            self._args_brace()
        else:
            # Unknown format — raw passthrough.
            self._emit_args(self._buf)
            self._buf = ''

    # ── JSON depth-counting args mode ────────────────────────────────────────

    def _args_json(self) -> None:
        """
        Standard JSON depth-counting.  Emits every character as it arrives.
        Stops when the outermost brace/bracket is closed, or when args_end
        is seen (whichever comes first).
        """
        buf = self._buf
        end = self._spec.args_end
        end_len = len(end)
        i = 0
        n = len(buf)

        while i < n:
            # Explicit end-tag check (before processing the character).
            if end and buf[i:i + end_len] == end:
                if i:
                    self._emit_args(buf[:i])
                self._buf = buf[i + end_len:]
                self._finish()
                return

            ch = buf[i]

            if self._j_in_str:
                if self._j_escaped:
                    self._j_escaped = False
                elif ch == '\\':
                    self._j_escaped = True
                elif ch == '"':
                    self._j_in_str = False
                    if self._j_depth == 0:
                        # The args value was a top-level JSON string (double-encoded
                        # formats like Mistral Nemo / Cohere R+ wrap args in "...").
                        # Emit through the closing quote and stop — don't consume
                        # trailing fields like , "id": "..." that follow in the same
                        # JSON object.
                        self._emit_args(buf[:i + 1])
                        self._buf = buf[i + 1:]
                        self._finish()
                        return
            else:
                if ch == '"':
                    self._j_in_str = True
                elif ch in ('{', '['):
                    self._j_depth += 1
                elif ch in ('}', ']'):
                    self._j_depth -= 1
                    if self._j_depth == 0:
                        # Emit up to and including this closing char, then done.
                        self._emit_args(buf[:i + 1])
                        self._buf = buf[i + 1:]
                        self._finish()
                        return

            i += 1

        self._emit_args(buf)
        self._buf = ''

    def _finish(self) -> None:
        self._state = self._DONE
        self._emit(('done',))

    # ── param_eq args mode  (<parameter=key>value</parameter>) ───────────────

    def _args_param_eq(self) -> None:
        buf = self._buf
        end = self._spec.args_end

        while buf:
            stripped = buf.lstrip()

            # End-tag check.
            if end and stripped.startswith(end):
                buf = stripped[len(end):]
                self._buf = buf
                self._close_param_eq()
                return

            if self._pe_state == 'idle':
                if stripped.startswith(self._PE_OPEN):
                    buf = stripped[len(self._PE_OPEN):]
                    self._pe_state = 'key'
                    self._pe_key = ''
                elif end and end.startswith(stripped[:len(end)]):
                    # Possible prefix of end tag — wait.
                    break
                elif len(stripped) > len(self._PE_OPEN) + 2:
                    # Unrecognised content — emit as-is (JSON passthrough).
                    self._emit_args(stripped)
                    buf = ''
                else:
                    break  # wait for more data

            elif self._pe_state == 'key':
                gt = buf.find('>')
                if gt != -1:
                    self._pe_key += buf[:gt]
                    buf = buf[gt + 1:]
                    if self._pe_first:
                        self._emit_args('{' + _jkey(self._pe_key) + ': ')
                        self._pe_first = False
                    else:
                        self._emit_args(', ' + _jkey(self._pe_key) + ': ')
                    self._pe_state = 'value'
                    self._pe_is_str = None
                    self._pe_str_opened = False
                    self._pe_vbuf = ''
                    self._pe_tail = ''
                else:
                    self._pe_key += buf
                    buf = ''

            elif self._pe_state == 'value':
                self._pe_vbuf += buf
                buf = ''
                if self._PE_CLOSE in self._pe_vbuf:
                    raw, remainder = self._pe_vbuf.split(self._PE_CLOSE, 1)
                    self._pe_vbuf = ''
                    self._pe_tail = ''
                    value = raw.strip()
                    if self._pe_is_str is None:
                        self._pe_is_str = _looks_like_string(value)
                    if self._pe_is_str:
                        if self._pe_str_opened:
                            # Opening '"' was already emitted during streaming;
                            # only emit the remaining escaped tail + closing '"'.
                            self._emit_args(_escape(value) + '"')
                        else:
                            self._emit_args('"' + _escape(value) + '"')
                    else:
                        self._emit_args(value)
                    self._pe_state = 'idle'
                    buf = remainder
                else:
                    # Emit the safe prefix (can't be start of close tag).
                    safe_len = max(0, len(self._pe_vbuf) - len(self._PE_CLOSE) + 1)
                    if safe_len:
                        safe = self._pe_vbuf[:safe_len]
                        self._pe_vbuf = self._pe_vbuf[safe_len:]
                        if self._pe_is_str is None and safe.strip():
                            self._pe_is_str = _looks_like_string(safe.lstrip())
                            if self._pe_is_str:
                                self._emit_args('"')  # open JSON string
                                self._pe_str_opened = True
                        if self._pe_is_str:
                            self._emit_args(_escape(safe))
                        else:
                            combined = self._pe_tail + safe
                            self._pe_tail = ''
                            trimmed = combined.rstrip()
                            if len(trimmed) < len(combined):
                                self._pe_tail = combined[len(trimmed):]
                            if trimmed:
                                self._emit_args(trimmed)

        self._buf = buf

    def _close_param_eq(self) -> None:
        if self._pe_first:
            self._emit_args('{}')
        else:
            self._emit_args('}')
        self._finish()

    # ── GLM args mode  (<arg_key>k</arg_key><arg_value>v</arg_value>) ─────────

    def _args_glm(self) -> None:
        """
        GLM encodes each argument as a sequential pair of sibling tags.
        Values are either already JSON-string-quoted ("London") or raw JSON
        (3, true, [1,2]).  We detect from the first character.
        """
        buf = self._buf
        end = self._spec.args_end

        while buf:
            stripped = buf.lstrip()
            if end and stripped.startswith(end):
                buf = stripped[len(end):]
                self._buf = buf
                self._close_glm()
                return

            if self._glm_state == 'wait':
                idx = buf.find(self._GLM_KEY_O)
                if idx != -1:
                    buf = buf[idx + len(self._GLM_KEY_O):]
                    self._glm_state = 'key'
                    self._glm_key = ''
                elif self._GLM_KEY_C in buf:
                    # Buffer starts with key content directly — the <arg_key> open
                    # tag was already consumed (e.g. as args_skip_re or name_suffix
                    # in the no-newline GLM variant).  Skip straight to 'key' state.
                    self._glm_state = 'key'
                    self._glm_key = ''
                    # Don't consume buf; the 'key' sub-handler will process it.
                else:
                    # Keep enough chars so that both the opening tag (GLM_KEY_O) and
                    # the closing tag (GLM_KEY_C, used by the elif above) can be
                    # detected once they are fully buffered.
                    _glm_w_keep = max(len(self._GLM_KEY_O), len(self._GLM_KEY_C))
                    keep = max(0, len(buf) - _glm_w_keep)
                    buf = buf[keep:]
                    break

            elif self._glm_state == 'key':
                idx = buf.find(self._GLM_KEY_C)
                if idx != -1:
                    self._glm_key += buf[:idx]
                    buf = buf[idx + len(self._GLM_KEY_C):]
                    self._glm_state = 'val_open'
                else:
                    keep = max(0, len(buf) - len(self._GLM_KEY_C) + 1)
                    self._glm_key += buf[:keep]
                    buf = buf[keep:]
                    break

            elif self._glm_state == 'val_open':
                idx = buf.find(self._GLM_VAL_O)
                if idx != -1:
                    buf = buf[idx + len(self._GLM_VAL_O):]
                    self._glm_state = 'val'
                    self._glm_vbuf = ''
                else:
                    keep = max(0, len(buf) - len(self._GLM_VAL_O) + 1)
                    buf = buf[keep:]
                    break

            elif self._glm_state == 'val':
                self._glm_vbuf += buf
                buf = ''
                if self._GLM_VAL_C in self._glm_vbuf:
                    raw, remainder = self._glm_vbuf.split(self._GLM_VAL_C, 1)
                    self._glm_vbuf = ''
                    value = raw.strip()
                    # Emit key: value pair.
                    if self._glm_first:
                        self._emit_args('{')
                        self._glm_first = False
                    else:
                        self._emit_args(', ')
                    self._emit_args(_jkey(self._glm_key) + ': ')
                    # GLM already JSON-encodes string values ("London"),
                    # so if the value is already JSON-string-quoted pass as-is.
                    sv = value.lstrip()
                    if sv.startswith('"'):
                        self._emit_args(value)
                    elif sv and (sv[0] in '[{' or sv[0].isdigit() or sv[0] == '-'
                                 or sv.startswith('true') or sv.startswith('false')
                                 or sv.startswith('null')):
                        self._emit_args(value)
                    else:
                        self._emit_args('"' + _escape(value) + '"')
                    self._glm_state = 'wait'
                    buf = remainder
                # else: accumulate until close tag arrives

        self._buf = buf

    def _close_glm(self) -> None:
        if self._glm_first:
            self._emit_args('{}')
        else:
            self._emit_args('}')
        self._finish()

    # ── DSML args mode  (<｜DSML｜parameter name="k" string="t|f">…) ─────────

    def _args_dsml(self) -> None:
        if self._dsml_open_re is None:
            # Build regexes lazily using the fullwidth-pipe characters.
            self._dsml_open_re = re.compile(
                r'<[^>]*?parameter\s+name="([^"]+)"\s+string="(true|false)">'
            )
            self._dsml_close_re = re.compile(r'</[^>]*?parameter>')

        buf = self._buf
        end = self._spec.args_end

        while buf:
            stripped = buf.lstrip()
            if end and stripped.startswith(end):
                buf = stripped[len(end):]
                self._buf = buf
                self._close_dsml()
                return

            if self._dsml_state == 'wait':
                m = self._dsml_open_re.search(buf)
                if m:
                    self._dsml_key = m.group(1)
                    self._dsml_is_str = (m.group(2) == 'true')
                    buf = buf[m.end():]
                    self._dsml_state = 'value'
                    self._dsml_vbuf = ''
                    if self._dsml_first:
                        self._emit_args('{' + _jkey(self._dsml_key) + ': ')
                        self._dsml_first = False
                    else:
                        self._emit_args(', ' + _jkey(self._dsml_key) + ': ')
                    if self._dsml_is_str:
                        self._emit_args('"')
                else:
                    break  # wait for full open tag

            elif self._dsml_state == 'value':
                self._dsml_vbuf += buf
                buf = ''
                assert self._dsml_close_re is not None
                m = self._dsml_close_re.search(self._dsml_vbuf)
                if m:
                    raw = self._dsml_vbuf[:m.start()]
                    remainder = self._dsml_vbuf[m.end():]
                    self._dsml_vbuf = ''
                    if self._dsml_is_str:
                        self._emit_args(_escape(raw))
                        self._emit_args('"')  # close JSON string
                    else:
                        self._emit_args(raw.strip())
                    self._dsml_state = 'wait'
                    buf = remainder
                else:
                    # Emit safe prefix; keep a conservative tail buffer.
                    safe = max(0, len(self._dsml_vbuf) - 40)
                    if safe:
                        chunk = self._dsml_vbuf[:safe]
                        self._dsml_vbuf = self._dsml_vbuf[safe:]
                        if self._dsml_is_str:
                            self._emit_args(_escape(chunk))
                        else:
                            self._emit_args(chunk.rstrip())

        self._buf = buf

    def _close_dsml(self) -> None:
        if self._dsml_first:
            self._emit_args('{}')
        else:
            self._emit_args('}')
        self._finish()

    # ── param_name args mode  (<parameter name="key">value</parameter>) ──────

    def _args_param_name(self) -> None:
        buf = self._buf
        end = self._spec.args_end

        while buf:
            stripped = buf.lstrip()
            if end and stripped.startswith(end):
                buf = stripped[len(end):]
                self._buf = buf
                self._close_pn()
                return

            if self._pn_state == 'wait':
                m = self._PN_OPEN_RE.search(buf)
                if m:
                    self._pn_key = m.group(1)
                    buf = buf[m.end():]
                    self._pn_state = 'value'
                    self._pn_is_str = None
                    self._pn_vbuf = ''
                    self._pn_tail = ''
                    if self._pn_first:
                        self._emit_args('{' + _jkey(self._pn_key) + ': ')
                        self._pn_first = False
                    else:
                        self._emit_args(', ' + _jkey(self._pn_key) + ': ')
                else:
                    break

            elif self._pn_state == 'value':
                self._pn_vbuf += buf
                buf = ''
                if self._PN_CLOSE in self._pn_vbuf:
                    raw, remainder = self._pn_vbuf.split(self._PN_CLOSE, 1)
                    self._pn_vbuf = ''
                    self._pn_tail = ''
                    value = raw.strip()
                    if self._pn_is_str is None:
                        self._pn_is_str = _looks_like_string(value)
                    if self._pn_is_str:
                        self._emit_args('"' + _escape(value) + '"')
                    else:
                        self._emit_args(value)
                    self._pn_state = 'wait'
                    buf = remainder
                else:
                    safe_len = max(0, len(self._pn_vbuf) - len(self._PN_CLOSE) + 1)
                    if safe_len:
                        safe = self._pn_vbuf[:safe_len]
                        self._pn_vbuf = self._pn_vbuf[safe_len:]
                        if self._pn_is_str is None and safe.strip():
                            self._pn_is_str = _looks_like_string(safe.lstrip())
                            if self._pn_is_str:
                                self._emit_args('"')
                        if self._pn_is_str:
                            self._emit_args(_escape(safe))
                        else:
                            combined = self._pn_tail + safe
                            self._pn_tail = ''
                            trimmed = combined.rstrip()
                            if len(trimmed) < len(combined):
                                self._pn_tail = combined[len(trimmed):]
                            if trimmed:
                                self._emit_args(trimmed)

        self._buf = buf

    def _close_pn(self) -> None:
        if self._pn_first:
            self._emit_args('{}')
        else:
            self._emit_args('}')
        self._finish()

    # ── Force-close helper ───────────────────────────────────────────────────

    # ── Brace args mode ({unquoted_key:value,...} — Gemma format) ─────────────

    def _args_brace(self) -> None:
        """
        Parses Gemma's brace format: {unquoted_key:value,...}

        After <|"|> → " normalisation (done by feed() before calling this):
          - String values are already proper JSON strings: "London"
          - Numbers/booleans/nulls are bare: 3  true  false  null
          - Arrays may contain any value type: ["a","b"]  [1,2]
          - Nested objects recurse with the same unquoted-key convention

        This state machine converts the entire structure to valid JSON by
        quoting all bare keys at every nesting depth.  Values are streamed
        character-by-character with zero blocking.

        States
        ------
        outer_start  — first call; emit '{' and initialise the stack
        key          — accumulating an unquoted key string (until ':')
        val          — first non-ws char of a value; dispatch to sub-state
        str          — inside a JSON string value (track escapes, stop on '"')
        scalar       — bare number/bool/null (stop on ',', '}', ']')
        arr_val      — first non-ws char of an array element
        after_val    — after a value closed; expect ',' or '}' or ']'
        """
        buf = self._buf

        if self._b_state == 'outer_start':
            self._emit_args('{')
            self._b_stack = [{'kind': 'obj', 'first': True}]
            self._b_state = 'key'
            self._b_key_buf = ''

        i = 0
        n = len(buf)

        while i < n:
            ch = buf[i]

            if self._b_state == 'key':
                if ch == ':':
                    frame = self._b_stack[-1]
                    key = self._b_key_buf.strip()
                    if frame['first']:
                        self._emit_args('"' + _escape(key) + '":')
                        frame['first'] = False
                    else:
                        self._emit_args(',"' + _escape(key) + '":')
                    self._b_key_buf = ''
                    self._b_state = 'val'
                    i += 1
                elif ch in ('}', ','):
                    # Empty object or malformed — treat as after_val
                    self._b_state = 'after_val'
                    # Don't consume: let after_val re-process it
                else:
                    self._b_key_buf += ch
                    i += 1

            elif self._b_state == 'val':
                if ch in (' ', '\t', '\n', '\r'):
                    i += 1
                    continue
                if ch == '"':
                    self._emit_args('"')
                    self._b_state = 'str'
                    self._b_str_esc = False
                elif ch == '{':
                    self._emit_args('{')
                    self._b_stack.append({'kind': 'obj', 'first': True})
                    self._b_state = 'key'
                    self._b_key_buf = ''
                elif ch == '[':
                    self._emit_args('[')
                    self._b_stack.append({'kind': 'arr', 'first': True})
                    self._b_state = 'arr_val'
                else:
                    self._emit_args(ch)
                    self._b_state = 'scalar'
                i += 1

            elif self._b_state == 'str':
                if self._b_str_esc:
                    # Second char of an escape sequence — emit as-is.
                    self._emit_args(ch)
                    self._b_str_esc = False
                elif ch == '\\':
                    self._emit_args(ch)
                    self._b_str_esc = True
                elif ch == '"':
                    self._emit_args(ch)
                    self._b_state = 'after_val'
                elif ch == '\n':
                    # Literal control characters must be escaped in JSON strings.
                    # Gemma's format_argument macro wraps Python strings with
                    # <|"|> delimiters without escaping, so the model can emit
                    # raw newlines (and other control chars) inside string values.
                    self._emit_args('\\n')
                elif ch == '\r':
                    self._emit_args('\\r')
                elif ch == '\t':
                    self._emit_args('\\t')
                elif ord(ch) < 0x20:
                    self._emit_args('\\u{:04x}'.format(ord(ch)))
                else:
                    self._emit_args(ch)
                i += 1

            elif self._b_state == 'scalar':
                if ch in (',', '}', ']'):
                    # Terminator — don't consume; let after_val handle it
                    self._b_state = 'after_val'
                else:
                    self._emit_args(ch)
                    i += 1

            elif self._b_state == 'arr_val':
                if ch in (' ', '\t', '\n', '\r'):
                    i += 1
                    continue
                if ch == ']':
                    # Empty array or element already emitted
                    self._emit_args(']')
                    self._b_stack.pop()
                    i += 1
                    if not self._b_stack:
                        self._buf = buf[i:]
                        self._finish()
                        return
                    self._b_state = 'after_val'
                elif ch == '"':
                    self._emit_args('"')
                    self._b_state = 'str'
                    self._b_str_esc = False
                    i += 1
                elif ch == '{':
                    self._emit_args('{')
                    self._b_stack.append({'kind': 'obj', 'first': True})
                    self._b_state = 'key'
                    self._b_key_buf = ''
                    i += 1
                elif ch == '[':
                    self._emit_args('[')
                    self._b_stack.append({'kind': 'arr', 'first': True})
                    self._b_state = 'arr_val'
                    i += 1
                else:
                    self._emit_args(ch)
                    self._b_state = 'scalar'
                    i += 1

            elif self._b_state == 'after_val':
                if ch in (' ', '\t', '\n', '\r'):
                    i += 1
                    continue
                if not self._b_stack:
                    i += 1
                    continue
                frame = self._b_stack[-1]
                if frame['kind'] == 'obj':
                    if ch == ',':
                        self._b_state = 'key'
                        self._b_key_buf = ''
                        i += 1
                    elif ch == '}':
                        self._emit_args('}')
                        self._b_stack.pop()
                        i += 1
                        if not self._b_stack:
                            self._buf = buf[i:]
                            self._finish()
                            return
                        # Parent context; stay in after_val
                    else:
                        i += 1  # unexpected; skip
                else:  # arr
                    if ch == ',':
                        self._emit_args(',')
                        self._b_state = 'arr_val'
                        i += 1
                    elif ch == ']':
                        self._emit_args(']')
                        self._b_stack.pop()
                        i += 1
                        if not self._b_stack:
                            self._buf = buf[i:]
                            self._finish()
                            return
                        # Parent context; stay in after_val
                    else:
                        i += 1  # unexpected; skip

            else:
                i += 1  # unknown state; skip

        self._buf = buf[i:]

    def _close_open_args(self) -> str:
        """Return any JSON needed to close the currently open args object."""
        if self._state != self._ARGS:
            return ''
        mode = self._spec.args_mode
        if mode == 'param_eq' and not self._pe_first:
            return '}'
        if mode == 'glm' and not self._glm_first:
            return '}'
        if mode == 'dsml' and not self._dsml_first:
            return '}'
        if mode == 'param_name' and not self._pn_first:
            return '}'
        if mode == 'brace' and self._b_stack:
            # Close all open containers from innermost outward.
            return ''.join('}' if f['kind'] == 'obj' else ']'
                           for f in reversed(self._b_stack))
        return ''


# ---------------------------------------------------------------------------
# Module-level utility functions
# ---------------------------------------------------------------------------

def _escape(s: str) -> str:
    """JSON-escape the characters that must be escaped inside a string value."""
    return (s.replace('\\', '\\\\')
             .replace('"',  '\\"')
             .replace('\n', '\\n')
             .replace('\r', '\\r')
             .replace('\t', '\\t'))


def _jkey(key: str) -> str:
    """Return key as a JSON string literal."""
    return '"' + _escape(key) + '"'


def _looks_like_string(s: str) -> bool:
    """
    Heuristic: return False if s looks like a raw JSON non-string value
    (array, object, number, bool, null).  Return True otherwise.
    """
    sv = s.lstrip()
    if not sv:
        return True
    first = sv[0]
    if first in ('{', '['):
        return False
    if first.isdigit() or first == '-':
        return False
    if sv.startswith('true') or sv.startswith('false') or sv.startswith('null'):
        return False
    return True


# ---------------------------------------------------------------------------
# Self-test  (python -m esoExtras.toolcall_stream_parser  or  python <file>)
# ---------------------------------------------------------------------------

def run_jinja_directory_test(directory: str) -> bool:
    """
    For every *.jinja file in `directory`:

    1.  Render a dummy assistant turn that calls DUMMY_FUNC with {"loc": "x"}.
        Two-pass strategy:
          pass 1 → render([user], add_generation_prompt=True)  → prompt prefix
          pass 2 → render([user, asst], add_generation_prompt=False) → full output
          stream  = full_output[len(prompt):]  (what the model would generate)

    2.  Run detect_format() on the full rendered output to derive a FormatSpec.

    3.  Feed the stream through ToolCallStreamParser:
        • The prefix up to call_open_tag is fed as one bulk chunk (realistic: large
          context tokens arrive early).
        • The call section is fed character-by-character (realistic: small generation
          tokens stream in individually).

    4.  Verify that:
        • A ('name', DUMMY_FUNC) event was received.
        • The accumulated args decode to {"loc": "x"} (handles single-encoded,
          double-encoded / tojson-wrapped, and all non-JSON formats like GLM / DSML
          / param_eq / param_name / brace which the parser normalises to JSON).
        • A ('done',) event was emitted.

    Returns True iff every renderable, tool-capable template passed.

    Templates explicitly marked with call_open=None are skipped (no tool support).
    Templates that fail to render are reported as RENDER-ERR and skipped.
    """
    try:
        import jinja2
    except ImportError:
        print('jinja2 not installed — skipping Jinja directory test')
        return True

    PASS = '\033[92mPASS\033[0m'
    FAIL = '\033[91mFAIL\033[0m'
    SKIP = '\033[93mSKIP\033[0m'
    RERR = '\033[95mRENDER-ERR\033[0m'

    F        = DUMMY_FUNC
    TOOL_ID  = 'eDr1234Sg'          # exactly 9 alphanumeric chars (Mistral validates this)
    TOOL = {
        'type': 'function',
        'function': {
            'name': F, 'description': 'test',
            'parameters': {
                'type': 'object',
                'properties': {'loc': {'type': 'string', 'description': 'location'}},
                'required': ['loc'],
            },
        },
    }

    def _make_asst(content: Optional[str] = '', dict_args: bool = False) -> dict:
        args_val: object = {'loc': 'x'} if dict_args else '{"loc":"x"}'
        return {
            'role': 'assistant',
            'content': content,
            'tool_calls': [{
                'id': TOOL_ID,
                'type': 'function',
                'function': {'name': F, 'arguments': args_val},
            }],
        }

    USER_MSG   = {'role': 'user', 'content': 'hello'}
    ASST_STR   = _make_asst(content='',   dict_args=False)  # string args
    ASST_DICT  = _make_asst(content='',   dict_args=True)   # dict args (GLM, Gemma)
    ASST_NONE  = _make_asst(content=None, dict_args=False)  # content=None (DS R1-Distill Llama)

    # Templates that need dict arguments (not JSON string).
    # GLM validates `arguments is mapping`; Gemma templates render brace format from dict.
    DICT_ARGS_TEMPLATES = {
        'GLM-4.6.jinja',
        'GLM-4.7-Flash.jinja',
        'google-gemma-4-31B-it.jinja',
        'google-gemma-4-31B-it-interleaved.jinja',
    }

    # Templates that ignore tool_calls and only render message['content'].
    # For these, we inject the tool call text directly into the content field.
    # Format: {filename: (call_open_tag, args_field_name)}
    CONTENT_TOOL_CALL_TEMPLATES: dict = {
        # LFM2 uses <tool_call> with "arguments" field
        'LFM2-8B-A1B.jinja':                       ('<tool_call>',   'arguments'),
        'LFM2.5-Instruct.jinja':                    ('<tool_call>',   'arguments'),
        # Granite 3.3 uses <|tool_call|> with "parameters" field
        'ibm-granite-granite-3.3-2B-Instruct.jinja': ('<|tool_call|>', 'parameters'),
    }

    # Templates that need content=None in the assistant message.
    NEEDS_NONE_CONTENT = {
        'deepseek-ai-DeepSeek-R1-Distill-Llama-8B.jinja',
    }

    # ── Jinja environment factory ─────────────────────────────────────────────
    def _make_env() -> 'jinja2.Environment':
        try:
            env = jinja2.Environment(
                trim_blocks=True, lstrip_blocks=True,
                extensions=['jinja2.ext.loopcontrols'],
            )
        except Exception:
            env = jinja2.Environment(trim_blocks=True, lstrip_blocks=True)
        env.globals['raise_exception'] = lambda msg: (_ for _ in ()).throw(ValueError(msg))
        env.globals['strftime_now']     = lambda fmt='': ''
        env.filters['from_json']        = (
            lambda x: (json.loads(x) if isinstance(x, str) else x)
        )
        def _tojson(x, indent=None, ensure_ascii=False, **kw):
            return json.dumps(x, ensure_ascii=ensure_ascii, indent=indent, **kw)
        env.filters['tojson'] = _tojson
        return env

    def _render_safe(env: 'jinja2.Environment', src: str,
                     messages: list, agp: bool,
                     extra_vars: Optional[dict] = None) -> Optional[str]:
        """Return rendered string or None on error."""
        kwargs: dict = dict(
            messages=messages,
            tools=[TOOL],
            functions=[TOOL],
            add_generation_prompt=agp,
            bos_token='',
            eos_token='',
        )
        if extra_vars:
            kwargs.update(extra_vars)
        try:
            return env.from_string(src).render(**kwargs)
        except Exception:
            return None

    # ── Per-template configuration ────────────────────────────────────────────
    # (call_open_tag, quote_markers, agp_false_only)
    #
    # call_open_tag:  passed to detect_format() and used for stream extraction.
    #                 None → template has no tool-call support → SKIP.
    # quote_markers:  custom string delimiters (e.g. Gemma ['<|"|>']).
    # agp_false_only: True → NVIDIA-style; the full render requires AGP=True
    #                 on [user, asst] for the prompt pass (template pops asst).
    TEMPLATE_CONFIG: dict = {
        # filename                                                     call_open                               qm         agp_false_only
        'Apertus-8B-Instruct.jinja':                                 ('<|tools_prefix|>',                    [],        False),
        'Apriel-1.6-15b-Thinker-fixed.jinja':                       ('<tool_calls>',                         [],        False),
        'Bielik-11B-v3.0-Instruct.jinja':                           ('<tool_call>',                          [],        False),
        'ByteDance-Seed-OSS.jinja':                                  ('<seed:tool_call>',                     [],        False),
        'CohereForAI-c4ai-command-r-plus-tool_use.jinja':           ('',                                     [],        False),
        'CohereForAI-c4ai-command-r7b-12-2024-tool_use.jinja':      ('<|START_ACTION|>',                     [],        False),
        'GLM-4.6.jinja':                                             ('<tool_call>',                          [],        False),
        'GLM-4.7-Flash.jinja':                                       ('<tool_call>',                          [],        False),
        'GigaChat3-10B-A1.8B.jinja':                                 ('function call<|role_sep|>',            [],        False),
        'GigaChat3.1-10B-A1.8B.jinja':                              ('<|function_call|>',                    [],        False),
        'HuggingFaceTB-SmolLM3-3B.jinja':                           (None,                                   [],        False),
        'Kimi-K2-Instruct.jinja':                                    ('<|tool_calls_section_begin|>',          [],        False),
        'Kimi-K2-Thinking.jinja':                                    ('<|tool_calls_section_begin|>',          [],        False),
        'LFM2-8B-A1B.jinja':                                        ('<tool_call>',                          [],        False),
        'LFM2.5-Instruct.jinja':                                     ('<tool_call>',                          [],        False),
        'MiMo-VL.jinja':                                             ('<tool_call>',                          [],        False),
        'MiniMax-M2.jinja':                                          ('<minimax:tool_call>',                  [],        False),
        'Mistral-Small-3.2-24B-Instruct-2506.jinja':                ('[TOOL_CALLS]',                         [],        False),
        'NVIDIA-Nemotron-3-Nano-30B-A3B-BF16.jinja':                ('<function=',                           [],        False),
        'NVIDIA-Nemotron-Nano-v2.jinja':                             ('<TOOLCALL>',                           [],        True),
        'NousResearch-Hermes-2-Pro-Llama-3-8B-tool_use.jinja':      ('<tool_call>',                          [],        False),
        'NousResearch-Hermes-3-Llama-3.1-8B-tool_use.jinja':        ('<tool_call>',                          [],        False),
        'Qwen-QwQ-32B.jinja':                                        ('<tool_call>',                          [],        False),
        'Qwen-Qwen2.5-7B-Instruct.jinja':                           ('<tool_call>',                          [],        False),
        'Qwen-Qwen3-0.6B.jinja':                                     ('<tool_call>',                          [],        False),
        'Qwen3-Coder.jinja':                                         ('<tool_call>',                          [],        False),
        'Qwen3.5-4B.jinja':                                          ('<tool_call>',                          [],        False),
        'Reka-Edge.jinja':                                           ('<tool_call>',                          [],        False),
        'StepFun3.5-Flash.jinja':                                    ('<tool_call>',                          [],        False),
        'deepseek-ai-DeepSeek-R1-Distill-Llama-8B.jinja':           ('',                                     [],        False),
        'deepseek-ai-DeepSeek-R1-Distill-Qwen-32B.jinja':           ('',                                     [],        False),
        'deepseek-ai-DeepSeek-V3.1.jinja':                          ('<\uff5ctool\u2581call\u2581begin\uff5c>', [], False),
        'deepseek-ai-DeepSeek-V3.2.jinja':                          ('<\uff5cDSML\uff5cfunction_calls>',      [],        False),
        'fireworks-ai-llama-3-firefunction-v2.jinja':                ('',                                     [],        False),
        'google-gemma-2-2b-it.jinja':                                (None,                                   [],        False),
        'google-gemma-4-31B-it-interleaved.jinja':                   ('<|tool_call>',                         ['<|"|>'], False),
        'google-gemma-4-31B-it.jinja':                               ('<|tool_call>',                         ['<|"|>'], False),
        'ibm-granite-granite-3.3-2B-Instruct.jinja':                ('<|tool_call|>',                        [],        False),
        'ibm-granite-granite-4.0.jinja':                             ('<tool_call>',                          [],        False),
        'llama-cpp-deepseek-r1.jinja':                               ('',                                     [],        False),
        'llama-cpp-rwkv-world.jinja':                                (None,                                   [],        False),
        'meetkai-functionary-medium-v3.1.jinja':                     ('',                                     [],        False),
        'meetkai-functionary-medium-v3.2.jinja':                     ('',                                     [],        False),
        'meta-llama-Llama-3.1-8B-Instruct.jinja':                   ('',                                     [],        False),
        'meta-llama-Llama-3.2-3B-Instruct.jinja':                   ('',                                     [],        False),
        'meta-llama-Llama-3.3-70B-Instruct.jinja':                  ('',                                     [],        False),
        'microsoft-Phi-3.5-mini-instruct.jinja':                     (None,                                   [],        False),
        'mistralai-Ministral-3-14B-Reasoning-2512.jinja':            ('[TOOL_CALLS]',                         [],        False),
        'mistralai-Mistral-Nemo-Instruct-2407.jinja':               ('[TOOL_CALLS]',                         [],        False),
        'moonshotai-Kimi-K2.jinja':                                  ('<|tool_calls_section_begin|>',          [],        False),
        'openai-gpt-oss-120b.jinja':                                 ('',                                     [],        False),
        'stepfun-ai-Step-3.5-Flash.jinja':                           ('<tool_call>',                          [],        False),
        'unsloth-Apriel-1.5.jinja':                                  ('<tool_calls>',                         [],        False),
        'unsloth-mistral-Devstral-Small-2507.jinja':                 ('[TOOL_CALLS]',                         [],        False),
        'upstage-Solar-Open-100B.jinja':                             ('<|tool_call:begin|>',                  [],        False),
    }

    # ── Argument validation ───────────────────────────────────────────────────
    def _validate_args(raw: str) -> tuple:
        """
        Returns (ok: bool, note: str).
        Handles:
          • Single-encoded JSON  {"loc":"x"} → ok
          • Double-encoded       "{\\"loc\\":\\"x\\"}" → decode twice → ok
          • GLM/param_eq/DSML/param_name/brace: parser normalises to JSON → ok
          • Loose substring match as final fallback
        """
        # Attempt 1: exact JSON parse
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and parsed.get('loc') == 'x':
                return True, ''
            if isinstance(parsed, str):
                inner = json.loads(parsed)
                if isinstance(inner, dict) and inner.get('loc') == 'x':
                    return True, 'double-encoded'
        except Exception:
            pass

        # Attempt 2: try the leading JSON prefix (trimmed at first clean boundary)
        try:
            for end in [raw.find('}') + 1, raw.find('"', raw.find('"') + 1) + 1]:
                if 0 < end <= len(raw):
                    candidate = raw[:end]
                    try:
                        parsed = json.loads(candidate)
                        if isinstance(parsed, dict) and parsed.get('loc') == 'x':
                            return True, 'prefix-trimmed'
                        if isinstance(parsed, str):
                            inner = json.loads(parsed)
                            if isinstance(inner, dict) and inner.get('loc') == 'x':
                                return True, 'prefix-trimmed-double'
                    except Exception:
                        pass
        except Exception:
            pass

        # Attempt 3: loose substring check
        if ('"loc"' in raw or "'loc'" in raw) and ('"x"' in raw or "'x'" in raw):
            return True, 'loose-match'

        return False, f'args={raw[:80]!r}'

    # ── Stream extraction ─────────────────────────────────────────────────────
    def _extract_stream(prompt: Optional[str], full: str,
                        spec: 'FormatSpec') -> tuple:
        """
        Return (pre_chunk, call_stream) where:
          pre_chunk   = everything before call_open (fed as one bulk chunk)
          call_stream = from call_open onwards (fed char-by-char)

        Uses rfind (not find) so that call_open tags embedded in the system-prompt
        example section (e.g. DS V3.2, NVIDIA Nemotron) are bypassed in favour of
        the LAST (actual) occurrence.
        """
        call_open   = spec.call_open
        name_prefix = spec.name_prefix

        # ── Two-pass path: full.startswith(prompt) ───────────────────────────
        if prompt and full.startswith(prompt) and len(prompt) < len(full):
            generation = full[len(prompt):]

            if call_open and call_open in generation:
                # Use rfind: if call_open appears multiple times (e.g. tool-list
                # section AND generation), take the last occurrence.
                idx = generation.rfind(call_open)
                return generation[:idx], generation[idx:]

            if not call_open:
                # Functionary 3.2 pattern: name_prefix ('>>>') is the last
                # token of the prompt; the generation starts right after it.
                if (name_prefix
                        and len(prompt) >= len(name_prefix)
                        and prompt.endswith(name_prefix)):
                    return '', name_prefix + generation
                return '', generation

        # ── Fallback: use rfind of call_open in the full render ───────────────
        if call_open and call_open in full:
            idx = full.rfind(call_open)
            return '', full[idx:]

        # ── Last resort: start from around DUMMY_FUNC ─────────────────────────
        idx = full.rfind(F)
        if idx != -1:
            # Walk back to include the name_prefix (if any)
            np_len = len(name_prefix) if name_prefix else 0
            start  = max(0, idx - max(np_len + 5, 20))
            return '', full[start:]

        return '', full

    # ── Event collector ───────────────────────────────────────────────────────
    def _collect(parser: 'ToolCallStreamParser',
                 pre_chunk: str, call_stream: str) -> dict:
        """
        Feed `pre_chunk` as a single bulk token (pre-call-open context),
        then feed `call_stream` character-by-character (model generation).
        """
        result: dict = {'name': None, 'args': '', 'has_done': False, 'event_types': []}

        def _process(ev: tuple) -> None:
            result['event_types'].append(ev[0])
            if ev[0] == 'name':
                result['name'] = ev[1]
            elif ev[0] == 'args_chunk':
                result['args'] += ev[1]
            elif ev[0] == 'done':
                result['has_done'] = True

        if pre_chunk:
            for ev in parser.feed(pre_chunk):
                _process(ev)

        for ch in call_stream:
            if parser.is_done:
                break
            for ev in parser.feed(ch):
                _process(ev)

        for ev in parser.flush():
            _process(ev)

        return result

    # ── Main loop ─────────────────────────────────────────────────────────────
    if not os.path.isdir(directory):
        print(f'run_jinja_directory_test: not a directory: {directory!r}')
        return False

    files = sorted(f for f in os.listdir(directory) if f.endswith('.jinja'))
    if not files:
        print(f'No .jinja files found in {directory!r}')
        return True

    print(f'\nJinja directory test: {directory!r}  ({len(files)} templates)')
    print('=' * 80)

    passed = failed = skipped = render_err = 0
    failures: list = []

    for fn in files:
        path = os.path.join(directory, fn)

        cfg = TEMPLATE_CONFIG.get(fn, ('', [], False))
        call_open, qm, agp_false_only = cfg

        if call_open is None:
            print(f'  {SKIP}  {fn}  [no tool support]')
            skipped += 1
            continue

        try:
            with open(path, encoding='utf-8') as fh:
                src = fh.read()
        except OSError as e:
            print(f'  {SKIP}  {fn}  [read error: {e}]')
            skipped += 1
            continue

        env = _make_env()

        # ── Choose assistant message variant ──────────────────────────────────
        if fn in CONTENT_TOOL_CALL_TEMPLATES:
            # Template only renders message['content']; inject tool call text.
            co_tag, args_field = CONTENT_TOOL_CALL_TEMPLATES[fn]
            content_tc = (f'{co_tag}\n{{"name": "{F}", "{args_field}": {{"loc": "x"}}}}'
                          f'\n</{co_tag.lstrip("<").rstrip(">").split("|")[0]}>')
            # Use a simple </tool_call> or similar close tag (parser finds end by depth)
            content_tc = f'{co_tag}\n{{"name": "{F}", "{args_field}": {{"loc": "x"}}}}\n'
            asst_msg = {'role': 'assistant', 'content': content_tc, 'tool_calls': []}
        elif fn in NEEDS_NONE_CONTENT:
            asst_msg = ASST_NONE
        elif fn in DICT_ARGS_TEMPLATES:
            asst_msg = ASST_DICT
        else:
            asst_msg = ASST_STR

        # ── Pass 1: prompt ────────────────────────────────────────────────────
        p1_msgs = [USER_MSG, asst_msg] if agp_false_only else [USER_MSG]
        prompt = _render_safe(env, src, p1_msgs, agp=True)

        # ── Pass 2: full output ───────────────────────────────────────────────
        full = _render_safe(env, src, [USER_MSG, asst_msg], agp=False)

        # Retry with content=None if needed
        if full is None and asst_msg.get('content') is not None:
            alt = {**asst_msg, 'content': None}
            full = _render_safe(env, src, [USER_MSG, alt], agp=False)
            if full is not None and prompt is None:
                p1_msgs2 = [USER_MSG, alt] if agp_false_only else [USER_MSG]
                prompt = _render_safe(env, src, p1_msgs2, agp=True)

        # Last try: AGP=True (some edge-case templates)
        if full is None:
            full = _render_safe(env, src, [USER_MSG, asst_msg], agp=True)

        if full is None:
            print(f'  {RERR}  {fn}  [render failed]')
            render_err += 1
            continue

        if F not in full:
            print(f'  {SKIP}  {fn}  [tool call not in rendered output]')
            skipped += 1
            continue

        # ── Detect format from the full render ────────────────────────────────
        spec = detect_format(full, call_open, qm)

        # ── Extract stream ────────────────────────────────────────────────────
        pre_chunk, call_stream = _extract_stream(prompt, full, spec)

        if F not in (pre_chunk + call_stream):
            print(f'  {SKIP}  {fn}  [DUMMY_FUNC lost in stream split]')
            skipped += 1
            continue

        # ── Build a fresh parser and stream ───────────────────────────────────
        parser = ToolCallStreamParser(spec)
        result = _collect(parser, pre_chunk, call_stream)

        # ── Validate ──────────────────────────────────────────────────────────
        name_ok = (result['name'] == F)
        args_ok, args_note = _validate_args(result['args']) if name_ok else (False, '')
        done_ok = result['has_done']

        if name_ok and args_ok and done_ok:
            note = f' ({args_note})' if args_note else ''
            print(f'  {PASS}  {fn}  mode={spec.args_mode}{note}')
            passed += 1
        else:
            reasons: list = []
            if not name_ok:
                reasons.append(f'name={result["name"]!r} (expected {F!r})')
            if not args_ok:
                reasons.append(f'args-invalid: {args_note}')
            if not done_ok:
                reasons.append('no done event')
            reason_str = ', '.join(reasons)
            print(f'  {FAIL}  {fn}  mode={spec.args_mode}  [{reason_str}]')
            failed += 1
            failures.append((fn, reason_str, result, spec))

    # ── Summary ───────────────────────────────────────────────────────────────
    print('=' * 80)
    total = len(files)
    print(f'Results: {passed} passed, {failed} failed, '
          f'{render_err} render-err, {skipped} skipped  /  {total} templates')

    if failures:
        print(f'\nFailed templates ({len(failures)}):')
        for fn, reason, result, spec in failures:
            print(f'  {fn}')
            print(f'    reason  : {reason}')
            print(f'    spec    : mode={spec.args_mode!r} '
                  f'call_open={spec.call_open!r} '
                  f'name_prefix={spec.name_prefix!r} '
                  f'name_suffix={spec.name_suffix!r}')
            print(f'    name    : {result["name"]!r}')
            print(f'    args    : {result["args"][:120]!r}')

    print()
    return failed == 0

def _run_tests() -> None:
    """
    Full test suite covering:
      - All 6 args modes (json, param_eq, glm, dsml, brace, param_name)
      - Detection (detect_format) for every model family in the template set
      - End-to-end streaming for every distinct wire format
    """

    def collect(parser: ToolCallStreamParser, tokens: list) -> dict:
        result: dict = {'name': None, 'args': ''}
        for tok in tokens:
            for ev in parser.feed(tok):
                if ev[0] == 'name':
                    result['name'] = ev[1]
                elif ev[0] == 'args_chunk':
                    result['args'] += ev[1]
        for ev in parser.flush():
            if ev[0] == 'args_chunk':
                result['args'] += ev[1]
        return result

    def chk(rendered: str, call_open: str = '', quote_markers=None,
            **fields) -> tuple:
        """Return (ok, spec) where ok is True iff all fields match."""
        s = detect_format(rendered, call_open, quote_markers)
        ok = all(getattr(s, k) == v for k, v in fields.items())
        return ok, s

    PASS = '\033[92mPASS\033[0m'
    FAIL = '\033[91mFAIL\033[0m'

    tests = []

    # ── Test 1: standard JSON ────────────────────────────────────────────────
    rendered1 = '<tool_call>\n{"name": "super_unique_func", "arguments": {"k": "v"}}\n</tool_call>'
    p1 = ToolCallStreamParser.from_rendered(rendered1, '<tool_call>')
    r1 = collect(p1, ['<tool_call>\n{"name": "get', '_weather", "arguments": {"loc": "London", "n": 3}}\n</tool_call>'])
    ok1 = (r1['name'] == 'get_weather' and
           json.loads(r1['args']) == {"loc": "London", "n": 3})
    tests.append(('standard JSON', ok1, r1))

    # ── Test 2: param_eq ────────────────────────────────────────────────────
    rendered2 = '<tool_call><function=super_unique_func><parameter=loc>x</parameter></function></tool_call>'
    p2 = ToolCallStreamParser.from_rendered(rendered2, '<tool_call>')
    r2 = collect(p2, ['<tool_call><function=', 'get_weather><parameter=loc>Lon', 'don</parameter>',
                       '<parameter=n>', '3</parameter></function></tool_call>'])
    ok2 = False
    try:
        parsed2 = json.loads(r2['args'])
        ok2 = (r2['name'] == 'get_weather' and
               parsed2.get('loc') == 'London' and
               str(parsed2.get('n')) == '3')  # parser emits raw '3', json.loads gives int
    except Exception:
        pass
    tests.append(('param_eq', ok2, r2))

    # ── Test 3: GLM ─────────────────────────────────────────────────────────
    rendered3 = '<tool_call>super_unique_func\n<arg_key>k</arg_key>\n<arg_value>"v"</arg_value>\n</tool_call>'
    p3 = ToolCallStreamParser.from_rendered(rendered3, '<tool_call>')
    r3 = collect(p3, ['<tool_call>get_weather\n',
                       '<arg_key>loc</arg_key>\n<arg_value>"London"</arg_value>\n',
                       '<arg_key>n</arg_key>\n<arg_value>3</arg_value>\n</tool_call>'])
    ok3 = False
    try:
        parsed3 = json.loads(r3['args'])
        ok3 = (r3['name'] == 'get_weather' and
               parsed3.get('loc') == 'London' and
               parsed3.get('n') == 3)
    except Exception:
        pass
    tests.append(('GLM', ok3, r3))

    # ── Test 4: DSML ─────────────────────────────────────────────────────────
    # Use U+FF5C (｜) for the DSML token.
    DT = '\uff5cDSML\uff5c'
    rendered4 = (f'<{DT}function_calls>\n'
                 f'<{DT}invoke name="super_unique_func">\n'
                 f'<{DT}parameter name="loc" string="true">x</{DT}parameter>\n'
                 f'</{DT}invoke>\n'
                 f'</{DT}function_calls>')
    p4 = ToolCallStreamParser.from_rendered(rendered4, f'<{DT}function_calls>')
    toks4 = [
        f'<{DT}function_calls>\n',
        f'<{DT}invoke name="get_weather">\n',
        f'<{DT}parameter name="loc" string="true">London</{DT}parameter>\n',
        f'<{DT}parameter name="n" string="false">3</{DT}parameter>\n',
        f'</{DT}invoke>\n',
        f'</{DT}function_calls>',
    ]
    r4 = collect(p4, toks4)
    ok4 = False
    try:
        parsed4 = json.loads(r4['args'])
        ok4 = (r4['name'] == 'get_weather' and
               parsed4.get('loc') == 'London' and
               parsed4.get('n') == 3)
    except Exception:
        pass
    tests.append(('DSML', ok4, r4))

    # ── Test 5a: Gemma brace — flat object with strings and number ───────────
    QM = '<|"|>'
    rendered5 = f'<|tool_call>call:super_unique_func{{}}<tool_call|>'
    p5 = ToolCallStreamParser.from_rendered(rendered5, '<|tool_call>', [QM])
    # Split tokens mid-key and mid-value to exercise streaming
    r5 = collect(p5, [
        f'<|tool_call>call:get_weat',
        f'her{{loc:{QM}Lon',
        f'don{QM},n:3,active:true}}<tool_call|>',
    ])
    ok5 = False
    try:
        parsed5 = json.loads(r5['args'])
        ok5 = (r5['name'] == 'get_weather' and
               parsed5.get('loc') == 'London' and
               parsed5.get('n') == 3 and
               parsed5.get('active') is True)
    except Exception:
        pass
    tests.append(('Gemma brace flat', ok5, r5))

    # ── Test 5b: Gemma brace — nested object and array ───────────────────────
    p5b = ToolCallStreamParser.from_rendered(rendered5, '<|tool_call>', [QM])
    r5b = collect(p5b, [
        f'<|tool_call>call:search{{query:{QM}weather{QM}',
        f',opts:{{limit:5,tags:[{QM}uk{QM},{QM}eu{QM}]}}}}<tool_call|>',
    ])
    ok5b = False
    try:
        parsed5b = json.loads(r5b['args'])
        ok5b = (r5b['name'] == 'search' and
                parsed5b.get('query') == 'weather' and
                isinstance(parsed5b.get('opts'), dict) and
                parsed5b['opts'].get('limit') == 5 and
                parsed5b['opts'].get('tags') == ['uk', 'eu'])
    except Exception:
        pass
    tests.append(('Gemma brace nested', ok5b, r5b))

    # ── Test 6: Kimi K2 ──────────────────────────────────────────────────────
    rendered6 = '<|tool_calls_section_begin|>\n<|tool_call_begin|>functions.super_unique_func:0<|tool_call_argument_begin|>{}<|tool_call_end|>\n<|tool_calls_section_end|>'
    p6 = ToolCallStreamParser.from_rendered(rendered6, '<|tool_calls_section_begin|>')
    r6 = collect(p6, ['<|tool_calls_section_begin|>\n<|tool_call_begin|>functions.',
                       'get_weather:0<|tool_call_argument_begin|>',
                       '{"loc": "London"}<|tool_call_end|>'])
    ok6 = False
    try:
        parsed6 = json.loads(r6['args'])
        ok6 = (r6['name'] == 'get_weather' and parsed6.get('loc') == 'London')
    except Exception:
        pass
    tests.append(('Kimi K2', ok6, r6))

    # ── Test 7: param_name (MiniMax) ─────────────────────────────────────────
    rendered7 = '<minimax:tool_call>\n<invoke name="super_unique_func">\n<parameter name="loc">x</parameter>\n</invoke>\n</minimax:tool_call>'
    p7 = ToolCallStreamParser.from_rendered(rendered7, '<minimax:tool_call>')
    r7 = collect(p7, ['<minimax:tool_call>\n<invoke name="get_weather">\n',
                       '<parameter name="loc">London</parameter>\n',
                       '<parameter name="n">3</parameter>\n</invoke>\n</minimax:tool_call>'])
    ok7 = False
    try:
        parsed7 = json.loads(r7['args'])
        ok7 = (r7['name'] == 'get_weather' and
               parsed7.get('loc') == 'London' and
               str(parsed7.get('n')) == '3')  # parser emits raw '3', json.loads gives int
    except Exception:
        pass
    tests.append(('param_name (MiniMax)', ok7, r7))

    # =========================================================================
    # Detection tests — verify detect_format() returns the correct FormatSpec
    # for every model family in the 54-template set.
    # =========================================================================

    # Shorthand token names for DeepSeek V3.1
    DS1_BEGIN = '<\uff5ctool\u2581call\u2581begin\uff5c>'
    DS1_SEP   = '<\uff5ctool\u2581sep\uff5c>'
    DS1_END   = '<\uff5ctool\u2581call\u2581end\uff5c>'

    # ── Det-8: Ministral-3B — [TOOL_CALLS]funcname[ARGS]{} ──────────────────
    ok8, s8 = chk('[TOOL_CALLS]super_unique_func[ARGS]{}',
                  '[TOOL_CALLS]',
                  name_prefix='', name_suffix='[', args_mode='json')
    ok8 = ok8 and bool(re.search(r'ARGS', s8.args_skip_re))
    tests.append(('detect: Ministral-3B brackets', ok8, {'name': None, 'args': repr(s8)}))

    # ── Det-9: Functionary-3.2 — >>>funcname\n{args} ────────────────────────
    ok9, s9 = chk('>>>super_unique_func\n{}',
                  '',
                  name_prefix='>>>', name_suffix='\n', args_mode='json')
    tests.append(('detect: Functionary-3.2 (>>>)', ok9, {'name': None, 'args': repr(s9)}))

    # ── Det-10: Upstage Solar — <|tool_call:name|>funcname<|tool_call:args|> ─
    ok10, s10 = chk('<|tool_call:begin|>x<|tool_call:name|>super_unique_func<|tool_call:args|>{}<|tool_call:end|>',
                    '<|tool_call:begin|>',
                    name_prefix='<|tool_call:name|>',
                    name_suffix='<|tool_call:args|>',
                    args_end='<|tool_call:end|>',
                    args_mode='json')
    tests.append(('detect: Upstage Solar', ok10, {'name': None, 'args': repr(s10)}))

    # ── Det-11: Cohere R+ — "tool_name": "funcname" ─────────────────────────
    ok11, s11 = chk('"tool_name": "super_unique_func",\n"parameters": {}',
                    '',
                    name_prefix='"tool_name": "', name_suffix='"', args_mode='json')
    ok11 = ok11 and 'parameters' in s11.args_skip_re
    tests.append(('detect: Cohere R+', ok11, {'name': None, 'args': repr(s11)}))

    # ── Det-12: Cohere R7B — <|START_ACTION|>[{..."tool_name":...}] ─────────
    ok12, s12 = chk('<|START_ACTION|>[{"tool_call_id":"0","tool_name":"super_unique_func","parameters":{}}]',
                    '<|START_ACTION|>',
                    name_prefix='"tool_name": "', name_suffix='"', args_mode='json')
    tests.append(('detect: Cohere R7B', ok12, {'name': None, 'args': repr(s12)}))

    # ── Det-13: OpenAI GPT-OSS — to=functions.funcname<|channel|>… ──────────
    ok13, s13 = chk('<|start|>assistant to=functions.super_unique_func<|channel|>commentary json<|message|>{}<|call|>',
                    '',
                    name_prefix='to=functions.', name_suffix='<|channel|>',
                    args_mode='json', args_end='<|call|>')
    tests.append(('detect: OpenAI GPT-OSS', ok13, {'name': None, 'args': repr(s13)}))

    # ── Det-14: Apertus — [{"funcname": {}} name-as-key ─────────────────────
    ok14, s14 = chk('<|tools_prefix|>[{"super_unique_func": {}}]<|tools_suffix|>',
                    '<|tools_prefix|>',
                    name_prefix='[{"', name_suffix='"', args_mode='json',
                    args_skip_re=':\\s*', args_end='<|tools_suffix|>')
    tests.append(('detect: Apertus', ok14, {'name': None, 'args': repr(s14)}))

    # ── Det-15: Llama 3.1 — bare JSON with "parameters" field ────────────────
    ok15, s15 = chk('{"name": "super_unique_func", "parameters": {}}',
                    '',
                    name_prefix='"name": "', name_suffix='"', args_mode='json')
    ok15 = ok15 and 'parameters' in s15.args_skip_re
    tests.append(('detect: Llama-3.1 (parameters field)', ok15, {'name': None, 'args': repr(s15)}))

    # ── Det-16: IBM Granite 3.3 — <|tool_call|>[{"name": ...}] ───────────────
    ok16, _ = chk('<|tool_call|>[{"name": "super_unique_func", "arguments": {}}]',
                  '<|tool_call|>',
                  name_prefix='"name": "', name_suffix='"', args_mode='json')
    tests.append(('detect: Granite-3.3', ok16, {'name': None, 'args': ''}))

    # ── Det-17: IBM Granite 4.0 — <tool_call>{"name": ...} ───────────────────
    ok17, _ = chk('<tool_call>\n{"name": "super_unique_func", "arguments": {}}',
                  '<tool_call>',
                  name_prefix='"name": "', name_suffix='"', args_mode='json')
    tests.append(('detect: Granite-4.0', ok17, {'name': None, 'args': ''}))

    # ── Det-18: GigaChat — <|function_call|>{"name": ...} ────────────────────
    ok18, _ = chk('<|function_call|>{"name": "super_unique_func", "arguments": {}}',
                  '<|function_call|>',
                  name_prefix='"name": "', name_suffix='"', args_mode='json')
    tests.append(('detect: GigaChat', ok18, {'name': None, 'args': ''}))

    # ── Det-19: Apriel — <tool_calls>[{"name": ...}]</tool_calls> ────────────
    ok19, _ = chk('<tool_calls>[{"name": "super_unique_func", "arguments": {}}]</tool_calls>',
                  '<tool_calls>',
                  name_prefix='"name": "', name_suffix='"', args_mode='json')
    tests.append(('detect: Apriel', ok19, {'name': None, 'args': ''}))

    # ── Det-20: Mistral Nemo — [TOOL_CALLS][{"name": ...}] → standard JSON ──
    ok20, _ = chk('[TOOL_CALLS][{"name": "super_unique_func", "arguments": {}}]',
                  '[TOOL_CALLS]',
                  name_prefix='"name": "', name_suffix='"', args_mode='json')
    tests.append(('detect: Mistral Nemo', ok20, {'name': None, 'args': ''}))

    # ── Det-21: Fireworks — functools[{"name": ...}] → standard JSON ─────────
    ok21, _ = chk('functools[{"name": "super_unique_func", "arguments": {}}]',
                  '',
                  name_prefix='"name": "', name_suffix='"', args_mode='json')
    tests.append(('detect: Fireworks functools', ok21, {'name': None, 'args': ''}))

    # ── Det-22: NVIDIA Nemotron v2 — <TOOLCALL>[{"name": ...}]</TOOLCALL> ────
    ok22, _ = chk('<TOOLCALL>[{"name": "super_unique_func", "arguments": {}}]</TOOLCALL>',
                  '<TOOLCALL>',
                  name_prefix='"name": "', name_suffix='"', args_mode='json')
    tests.append(('detect: NVIDIA Nemotron v2', ok22, {'name': None, 'args': ''}))

    # ── Det-23: Functionary-3.1 — <function=funcname>{args}</function> ───────
    ok23, _ = chk('<function=super_unique_func>{}</function>',
                  '',
                  name_prefix='<function=', name_suffix='>', args_mode='json',
                  args_end='</function>')
    tests.append(('detect: Functionary-3.1 (<function=>)', ok23, {'name': None, 'args': ''}))

    # ── Det-24: ByteDance — <seed:tool_call>…<function=funcname>…<parameter=> ─
    ok24, s24 = chk('<seed:tool_call>\n<function=super_unique_func>\n<parameter=loc>London</parameter>\n</function>\n</seed:tool_call>',
                    '<seed:tool_call>',
                    name_prefix='<function=', name_suffix='>', args_mode='param_eq')
    tests.append(('detect: ByteDance (<function=> param_eq)', ok24, {'name': None, 'args': repr(s24)}))

    # ── Det-25: DeepSeek V3.1 — <｜tool▁call▁begin｜>funcname<｜tool▁sep｜>args ─
    ok25, s25 = chk(f'{DS1_BEGIN}super_unique_func{DS1_SEP}{{}}{DS1_END}',
                    DS1_BEGIN,
                    name_prefix='', name_suffix=DS1_SEP,
                    args_mode='json', args_end=DS1_END)
    tests.append(('detect: DeepSeek V3.1', ok25, {'name': None, 'args': repr(s25)}))

    # =========================================================================
    # End-to-end streaming tests for all distinct wire formats
    # =========================================================================

    # ── E2E-8: Ministral-3B brackets streaming ───────────────────────────────
    p8 = ToolCallStreamParser.from_rendered('[TOOL_CALLS]super_unique_func[ARGS]{}', '[TOOL_CALLS]')
    r8 = collect(p8, ['[TOOL_CALLS]get_weather[ARGS]{"loc": "London", "n": 3}'])
    ok8e = False
    try:
        ok8e = (r8['name'] == 'get_weather' and
                json.loads(r8['args']) == {"loc": "London", "n": 3})
    except Exception:
        pass
    tests.append(('stream: Ministral-3B brackets', ok8e, r8))

    # ── E2E-9: Functionary-3.2 >>> streaming ────────────────────────────────
    p9 = ToolCallStreamParser.from_rendered('>>>super_unique_func\n{}', '')
    r9 = collect(p9, ['>>>get_weather\n{"loc": "Lon', 'don", "n": 3}'])
    ok9e = False
    try:
        ok9e = (r9['name'] == 'get_weather' and
                json.loads(r9['args']) == {"loc": "London", "n": 3})
    except Exception:
        pass
    tests.append(('stream: Functionary-3.2 (>>>)', ok9e, r9))

    # ── E2E-10: Upstage Solar streaming ──────────────────────────────────────
    r_up = '<|tool_call:begin|>x<|tool_call:name|>super_unique_func<|tool_call:args|>{}<|tool_call:end|>'
    p10 = ToolCallStreamParser.from_rendered(r_up, '<|tool_call:begin|>')
    r10 = collect(p10, ['<|tool_call:begin|>abc<|tool_call:name|>get_weather',
                         '<|tool_call:args|>{"loc": "London"}<|tool_call:end|>'])
    ok10e = False
    try:
        ok10e = (r10['name'] == 'get_weather' and
                 json.loads(r10['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: Upstage Solar', ok10e, r10))

    # ── E2E-11: OpenAI GPT-OSS streaming ─────────────────────────────────────
    r_gpt = 'to=functions.super_unique_func<|channel|>commentary json<|message|>{}<|call|>'
    p11 = ToolCallStreamParser.from_rendered(r_gpt, '')
    r11 = collect(p11, ['to=functions.get_weather',
                         '<|channel|>commentary json<|message|>',
                         '{"loc": "London"}<|call|>'])
    ok11e = False
    try:
        ok11e = (r11['name'] == 'get_weather' and
                 json.loads(r11['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: OpenAI GPT-OSS', ok11e, r11))

    # ── E2E-12: Apertus name-as-key streaming ────────────────────────────────
    r_apt = '<|tools_prefix|>[{"super_unique_func": {}}]<|tools_suffix|>'
    p12 = ToolCallStreamParser.from_rendered(r_apt, '<|tools_prefix|>')
    r12 = collect(p12, ['<|tools_prefix|>[{"get_weather": {"loc": "London", "n": 3}}]<|tools_suffix|>'])
    ok12e = False
    try:
        ok12e = (r12['name'] == 'get_weather' and
                 json.loads(r12['args']) == {"loc": "London", "n": 3})
    except Exception:
        pass
    tests.append(('stream: Apertus name-as-key', ok12e, r12))

    # ── E2E-13: Cohere R+ streaming ───────────────────────────────────────────
    r_cr = '"tool_name": "super_unique_func",\n"parameters": {"a": 1}'
    p13 = ToolCallStreamParser.from_rendered(r_cr, '')
    r13 = collect(p13, ['"tool_name": "get_weather",\n"parameters": {"loc": "London", "n": 3}'])
    ok13e = False
    try:
        ok13e = (r13['name'] == 'get_weather' and
                 json.loads(r13['args']) == {"loc": "London", "n": 3})
    except Exception:
        pass
    tests.append(('stream: Cohere R+', ok13e, r13))

    # ── E2E-14: DeepSeek V3.1 streaming ──────────────────────────────────────
    r_ds1 = f'{DS1_BEGIN}super_unique_func{DS1_SEP}{{}}{DS1_END}'
    p14 = ToolCallStreamParser.from_rendered(r_ds1, DS1_BEGIN)
    r14 = collect(p14, [DS1_BEGIN, 'get_weather', DS1_SEP,
                         '{"loc": "Lon', 'don", "n": 3}', DS1_END])
    ok14e = False
    try:
        ok14e = (r14['name'] == 'get_weather' and
                 json.loads(r14['args']) == {"loc": "London", "n": 3})
    except Exception:
        pass
    tests.append(('stream: DeepSeek V3.1', ok14e, r14))

    # ── E2E-15: Functionary-3.1 <function=> json streaming ───────────────────
    p15 = ToolCallStreamParser.from_rendered('<function=super_unique_func>{}</function>', '')
    r15 = collect(p15, ['<function=get_weather>{"loc": "London", "n": 3}</function>'])
    ok15e = False
    try:
        ok15e = (r15['name'] == 'get_weather' and
                 json.loads(r15['args']) == {"loc": "London", "n": 3})
    except Exception:
        pass
    tests.append(('stream: Functionary-3.1 (<function=>)', ok15e, r15))

    # ── E2E-16: Mistral Nemo standard-JSON-under-[TOOL_CALLS] ────────────────
    p16 = ToolCallStreamParser.from_rendered(
        '[TOOL_CALLS][{"name": "super_unique_func", "arguments": {}}]', '[TOOL_CALLS]')
    r16 = collect(p16, ['[TOOL_CALLS][{"name": "get_weather", "arguments": {"loc": "London"}}]'])
    ok16e = False
    try:
        ok16e = (r16['name'] == 'get_weather' and
                 json.loads(r16['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: Mistral Nemo', ok16e, r16))

    # ── E2E-17: standard JSON with "parameters" field (Llama 3.1 style) ──────
    p17 = ToolCallStreamParser.from_rendered('{"name": "super_unique_func", "parameters": {}}', '')
    r17 = collect(p17, ['{"name": "get_weather", "parameters": {"loc": "London"}}'])
    ok17e = False
    try:
        ok17e = (r17['name'] == 'get_weather' and
                 json.loads(r17['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: Llama-3.1 (parameters field)', ok17e, r17))

    # =========================================================================
    # Detection tests for mode-specific formats
    # Tests 1-7 exercise detect_format implicitly via from_rendered; these
    # explicitly verify each FormatSpec field for the 6 args modes.
    # =========================================================================

    DT = '\uff5cDSML\uff5c'   # fullwidth pipe — used in DeepSeek V3.2 DSML tokens

    # ── Det-A: GLM (glm mode) ────────────────────────────────────────────────
    okA, sA = chk('<tool_call>super_unique_func\n<arg_key>k</arg_key>\n<arg_value>"v"</arg_value>\n</tool_call>',
                  '<tool_call>',
                  args_mode='glm', name_prefix='', name_suffix='\n')
    tests.append(('detect: GLM mode', okA, {'name': None, 'args': repr(sA)}))

    # ── Det-B: DSML V3.2 (dsml mode) ────────────────────────────────────────
    okB, sB = chk(f'<{DT}function_calls>\n<{DT}invoke name="super_unique_func">\n'
                  f'<{DT}parameter name="k" string="true">v</{DT}parameter>\n</{DT}invoke>',
                  f'<{DT}function_calls>',
                  args_mode='dsml', name_suffix='"')
    okB = okB and 'invoke name="' in sB.name_prefix
    tests.append(('detect: DSML mode', okB, {'name': None, 'args': repr(sB)}))

    # ── Det-C: param_eq (via <function=> branch) ─────────────────────────────
    okC, sC = chk('<function=super_unique_func><parameter=loc>x</parameter></function>',
                  '',
                  args_mode='param_eq', name_prefix='<function=', name_suffix='>',
                  args_end='</function>')
    tests.append(('detect: param_eq mode', okC, {'name': None, 'args': repr(sC)}))

    # ── Det-D: param_name (MiniMax) ──────────────────────────────────────────
    okD, sD = chk('<minimax:tool_call>\n<invoke name="super_unique_func">\n'
                  '<parameter name="k">v</parameter>\n</invoke>\n</minimax:tool_call>',
                  '<minimax:tool_call>',
                  args_mode='param_name', name_prefix='<invoke name="', name_suffix='"',
                  args_end='</invoke>')
    tests.append(('detect: param_name mode', okD, {'name': None, 'args': repr(sD)}))

    # ── Det-E: Gemma brace (brace mode) ─────────────────────────────────────
    QM = '<|"|>'
    okE, sE = chk('<|tool_call>call:super_unique_func{}<tool_call|>',
                  '<|tool_call>', [QM],
                  args_mode='brace', name_prefix='call:', name_suffix='{')
    tests.append(('detect: Gemma brace mode', okE, {'name': None, 'args': repr(sE)}))

    # ── Det-F: Kimi K2 (json mode + skip_re + args_end) ─────────────────────
    r_k2 = ('<|tool_calls_section_begin|>\n<|tool_call_begin|>functions.super_unique_func'
            ':0<|tool_call_argument_begin|>{}<|tool_call_end|>\n<|tool_calls_section_end|>')
    okF, sF = chk(r_k2, '<|tool_calls_section_begin|>',
                  args_mode='json', name_prefix='functions.', name_suffix=':',
                  args_end='<|tool_call_end|>')
    okF = okF and 'tool_call_argument_begin' in sF.args_skip_re
    tests.append(('detect: Kimi K2 (json+skip+end)', okF, {'name': None, 'args': repr(sF)}))

    # =========================================================================
    # End-to-end streaming tests for remaining format families
    # =========================================================================

    # ── E2E-18: Cohere R7B — <|START_ACTION|>[{"tool_name": ...}] ────────────
    r_cr7b = ('<|START_ACTION|>[{"tool_call_id":"0","tool_name":"super_unique_func",'
              '"parameters":{}}]')
    p18 = ToolCallStreamParser.from_rendered(r_cr7b, '<|START_ACTION|>')
    r18 = collect(p18, [
        '<|START_ACTION|>[{"tool_call_id":"0","tool_name": "get_weather",'
        '"parameters": {"loc": "London"}}]',
    ])
    ok18 = False
    try:
        ok18 = (r18['name'] == 'get_weather' and
                json.loads(r18['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: Cohere R7B', ok18, r18))

    # ── E2E-19: IBM Granite 3.3 — <|tool_call|>[{"name": ...}] ──────────────
    p19 = ToolCallStreamParser.from_rendered(
        '<|tool_call|>[{"name": "super_unique_func", "arguments": {}}]', '<|tool_call|>')
    r19 = collect(p19, [
        '<|tool_call|>[{"name": "get_weather", "arguments": {"loc": "London"}}]',
    ])
    ok19 = False
    try:
        ok19 = (r19['name'] == 'get_weather' and
                json.loads(r19['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: Granite-3.3', ok19, r19))

    # ── E2E-20: IBM Granite 4.0 — <tool_call>{"name": ...} ───────────────────
    p20 = ToolCallStreamParser.from_rendered(
        '<tool_call>\n{"name": "super_unique_func", "arguments": {}}', '<tool_call>')
    r20 = collect(p20, [
        '<tool_call>\n{"name": "get_weather", "arguments": {"loc": "London"}}',
    ])
    ok20 = False
    try:
        ok20 = (r20['name'] == 'get_weather' and
                json.loads(r20['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: Granite-4.0', ok20, r20))

    # ── E2E-21: GigaChat — <|function_call|>{"name": ...} ────────────────────
    p21 = ToolCallStreamParser.from_rendered(
        '<|function_call|>{"name": "super_unique_func", "arguments": {}}', '<|function_call|>')
    r21 = collect(p21, [
        '<|function_call|>{"name": "get_weather", "arguments": {"loc": "London"}}',
    ])
    ok21 = False
    try:
        ok21 = (r21['name'] == 'get_weather' and
                json.loads(r21['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: GigaChat', ok21, r21))

    # ── E2E-22: Apriel — <tool_calls>[{"name": ...}]</tool_calls> ────────────
    p22 = ToolCallStreamParser.from_rendered(
        '<tool_calls>[{"name": "super_unique_func", "arguments": {}}]</tool_calls>',
        '<tool_calls>')
    r22 = collect(p22, [
        '<tool_calls>[{"name": "get_weather", "arguments": {"loc": "London", "n": 3}}]',
        '</tool_calls>',
    ])
    ok22 = False
    try:
        ok22 = (r22['name'] == 'get_weather' and
                json.loads(r22['args']) == {"loc": "London", "n": 3})
    except Exception:
        pass
    tests.append(('stream: Apriel', ok22, r22))

    # ── E2E-23: Fireworks — functools[{"name": ...}] (no call_open) ──────────
    p23 = ToolCallStreamParser.from_rendered(
        'functools[{"name": "super_unique_func", "arguments": {}}]', '')
    r23 = collect(p23, [
        'functools[{"name": "get_weather", "arguments": {"loc": "London"}}]',
    ])
    ok23 = False
    try:
        ok23 = (r23['name'] == 'get_weather' and
                json.loads(r23['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: Fireworks functools', ok23, r23))

    # ── E2E-24: NVIDIA Nemotron v2 — <TOOLCALL>[{"name": ...}]</TOOLCALL> ────
    p24 = ToolCallStreamParser.from_rendered(
        '<TOOLCALL>[{"name": "super_unique_func", "arguments": {}}]</TOOLCALL>',
        '<TOOLCALL>')
    r24 = collect(p24, [
        '<TOOLCALL>[{"name": "get_weather", "arguments": {"loc": "London"}}]</TOOLCALL>',
    ])
    ok24 = False
    try:
        ok24 = (r24['name'] == 'get_weather' and
                json.loads(r24['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('stream: NVIDIA Nemotron v2', ok24, r24))

    # ── E2E-25: ByteDance — <seed:tool_call><function=> param_eq ─────────────
    r_bd = ('<seed:tool_call>\n<function=super_unique_func>\n'
            '<parameter=loc>x</parameter>\n</function>\n</seed:tool_call>')
    p25 = ToolCallStreamParser.from_rendered(r_bd, '<seed:tool_call>')
    r25 = collect(p25, [
        '<seed:tool_call>\n<function=get_weather>\n',
        '<parameter=loc>London</parameter>\n',
        '<parameter=n>3</parameter>\n</function>\n</seed:tool_call>',
    ])
    ok25 = False
    try:
        parsed25 = json.loads(r25['args'])
        ok25 = (r25['name'] == 'get_weather' and
                parsed25.get('loc') == 'London' and
                str(parsed25.get('n')) == '3')
    except Exception:
        pass
    tests.append(('stream: ByteDance (param_eq)', ok25, r25))

    # ── E2E-26: DeepSeek R1-Distill — type<｜tool▁sep｜>name\n```json\nargs ────
    _r_ds_r1 = ('<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>'
                'function<\uff5ctool\u2581sep\uff5c>super_unique_func\n```json\n{}\n```'
                '<｜tool▁call▁end｜><｜tool▁calls▁end｜><｜end▁of▁sentence｜>')
    p26 = ToolCallStreamParser.from_rendered(_r_ds_r1, '')
    r26 = collect(p26, [
        '<｜tool▁call▁begin｜>function<\uff5ctool\u2581sep\uff5c>get_weather\n',
        '```json\n{"loc": "London"}\n```<｜tool▁call▁end｜>',
    ])
    ok26 = False
    try:
        ok26 = (r26['name'] == 'get_weather' and
                json.loads(r26['args']) == {'loc': 'London'})
    except Exception:
        pass
    tests.append(('stream: DeepSeek R1-Distill (code-fenced json)', ok26, r26))

    # ── Det-27: DS R1-Distill detection ──────────────────────────────────────
    s_dsr1 = detect_format(_r_ds_r1, '')
    _ds1sep = '<\uff5ctool\u2581sep\uff5c>'
    ok_det27 = (s_dsr1.args_mode == 'json' and s_dsr1.name_suffix == '\n' and
                s_dsr1.name_prefix == _ds1sep and s_dsr1.args_skip_re == r'```json\n')
    tests.append(('det: DeepSeek R1-Distill format spec', ok_det27,
                  {'name': s_dsr1.args_mode,
                   'args': f'np={s_dsr1.name_prefix!r} skip={s_dsr1.args_skip_re!r}'}))

    # =========================================================================
    # Edge-case tests
    # =========================================================================

    # ── Edge-1: Character-by-character streaming (standard JSON) ─────────────
    # Verifies that split-token buffering works correctly end-to-end.
    pe1 = ToolCallStreamParser.from_rendered(
        '<tool_call>\n{"name": "super_unique_func", "arguments": {}}\n</tool_call>',
        '<tool_call>')
    stream_e1 = '<tool_call>\n{"name": "get_weather", "arguments": {"loc": "London"}}\n</tool_call>'
    re1 = collect(pe1, list(stream_e1))   # one char per token
    oke1 = False
    try:
        oke1 = (re1['name'] == 'get_weather' and
                json.loads(re1['args']) == {"loc": "London"})
    except Exception:
        pass
    tests.append(('edge: char-by-char standard JSON', oke1, re1))

    # ── Edge-2: Name split across token boundaries ────────────────────────────
    pe2 = ToolCallStreamParser.from_rendered(
        '<tool_call>\n{"name": "super_unique_func", "arguments": {}}\n</tool_call>',
        '<tool_call>')
    re2 = collect(pe2, [
        '<tool_call>\n{"name": "get',
        '_wea',
        'ther", "arguments": {"loc": "Paris"}}\n</tool_call>',
    ])
    oke2 = False
    try:
        oke2 = (re2['name'] == 'get_weather' and
                json.loads(re2['args']) == {"loc": "Paris"})
    except Exception:
        pass
    tests.append(('edge: name split across tokens', oke2, re2))

    # ── Edge-3: Nested JSON array in args (standard JSON mode) ───────────────
    pe3 = ToolCallStreamParser.from_rendered(
        '<tool_call>\n{"name": "super_unique_func", "arguments": {}}\n</tool_call>',
        '<tool_call>')
    re3 = collect(pe3, [
        '<tool_call>\n{"name": "search", "arguments": {"tags": ["a", "b"], "n": 5}}\n</tool_call>',
    ])
    oke3 = False
    try:
        oke3 = (re3['name'] == 'search' and
                json.loads(re3['args']) == {"tags": ["a", "b"], "n": 5})
    except Exception:
        pass
    tests.append(('edge: nested array in JSON args', oke3, re3))

    # ── Edge-4: Escaped special characters in string values ──────────────────
    # Verifies that backslash, \n, \t inside JSON strings pass through correctly.
    pe4 = ToolCallStreamParser.from_rendered(
        '<tool_call>\n{"name": "super_unique_func", "arguments": {}}\n</tool_call>',
        '<tool_call>')
    re4 = collect(pe4, [
        '<tool_call>\n{"name": "echo", "arguments": {"msg": "line1\\nline2\\ttab\\\\bs"}}\n</tool_call>',
    ])
    oke4 = False
    try:
        a4 = json.loads(re4['args'])
        oke4 = (re4['name'] == 'echo' and
                a4.get('msg') == 'line1\nline2\ttab\\bs')
    except Exception:
        pass
    tests.append(('edge: escaped chars in string args', oke4, re4))

    # ── Edge-5: flush() closes incomplete param_eq stream ────────────────────
    # Simulates a truncated stream (no closing </function> tag received).
    # flush() must emit the closing '}' to produce valid JSON.
    pe5 = ToolCallStreamParser.from_rendered(
        '<function=super_unique_func><parameter=loc>x</parameter></function>', '')
    re5 = collect(pe5, ['<function=get_time><parameter=tz>UTC</parameter>'])
    # No </function> — flush() must have closed the object.
    oke5 = False
    try:
        oke5 = (re5['name'] == 'get_time' and
                json.loads(re5['args']) == {"tz": "UTC"})
    except Exception:
        pass
    tests.append(('edge: flush() closes incomplete param_eq', oke5, re5))

    # ── Edge-6: flush() closes incomplete brace stream ───────────────────────
    QM_e6 = '<|"|>'
    pe6 = ToolCallStreamParser.from_rendered(
        '<|tool_call>call:super_unique_func{}<tool_call|>', '<|tool_call>', [QM_e6])
    re6 = collect(pe6, [f'<|tool_call>call:get_info{{key:{QM_e6}val{QM_e6}'])
    # No closing } or <tool_call|> — flush() must close the object.
    oke6 = False
    try:
        oke6 = (re6['name'] == 'get_info' and
                json.loads(re6['args']) == {"key": "val"})
    except Exception:
        pass
    tests.append(('edge: flush() closes incomplete brace', oke6, re6))

    # ── Edge-6b: Gemma brace — literal control chars in string value ─────────
    # Regression for Gemma-31B: the format_argument macro wraps string values
    # with <|"|> without escaping, so the model can emit literal newlines (and
    # other control chars) inside string arguments.  The brace-mode str state
    # must JSON-escape them rather than emitting them verbatim (which produces
    # invalid JSON consumed by the frontend).
    QM_e6b = '<|"|>'
    pe6b = ToolCallStreamParser.from_rendered(
        '<|tool_call>call:super_unique_func{}<tool_call|>', '<|tool_call>', [QM_e6b])
    # Feed the stream character-by-character to exercise _qm_tail, and include
    # a literal newline and tab between the QM delimiters.
    _literal_nl  = '\n'
    _literal_tab = '\t'
    _stream_e6b = (
        f'<|tool_call>call:write{{content:{QM_e6b}line1{_literal_nl}'
        f'  indented{_literal_tab}tabbed{_literal_nl}end{QM_e6b}}}<tool_call|>'
    )
    re6b = collect(pe6b, list(_stream_e6b))   # char-by-char exercises _qm_tail
    oke6b = False
    try:
        a6b = json.loads(re6b['args'])
        oke6b = (re6b['name'] == 'write' and
                 a6b.get('content') == 'line1\n  indented\ttabbed\nend')
    except Exception:
        pass
    tests.append(('edge: brace str literal control chars escaped', oke6b, re6b))

    # ── Edge-7: Empty args {} (standard JSON) ────────────────────────────────
    pe7 = ToolCallStreamParser.from_rendered(
        '<tool_call>\n{"name": "super_unique_func", "arguments": {}}\n</tool_call>',
        '<tool_call>')
    re7 = collect(pe7, ['<tool_call>\n{"name": "no_args", "arguments": {}}\n</tool_call>'])
    oke7 = False
    try:
        oke7 = (re7['name'] == 'no_args' and json.loads(re7['args']) == {})
    except Exception:
        pass
    tests.append(('edge: empty args {}', oke7, re7))

    # ── Edge-8: Empty args {} (param_eq — no parameters) ────────────────────
    pe8 = ToolCallStreamParser.from_rendered(
        '<function=super_unique_func><parameter=k>v</parameter></function>', '')
    re8 = collect(pe8, ['<function=no_args></function>'])
    oke8 = False
    try:
        oke8 = (re8['name'] == 'no_args' and json.loads(re8['args']) == {})
    except Exception:
        pass
    tests.append(('edge: empty args param_eq', oke8, re8))

    # =========================================================================
    # Quote-marker tests  (detect_quote_markers + _qm_tail split-chunk logic)
    # =========================================================================

    # ── QM-A: detect_quote_markers() finds <|"|> in a Gemma-style rendered ───
    _rendered_qma = '<|tool_call>call:super_unique_func{loc:<|"|>x<|"|>}<tool_call|>'
    _qm_detected_a = detect_quote_markers(_rendered_qma)
    ok_qma = (_qm_detected_a == ['<|"|>'])
    tests.append(('qm: detect_quote_markers finds <|"|>',
                  ok_qma, {'name': None, 'args': repr(_qm_detected_a)}))

    # ── QM-B: detect_quote_markers() returns [] for standard JSON quotes ──────
    _rendered_qmb = '<tool_call>{"name": "super_unique_func", "arguments": {"loc": "x"}}</tool_call>'
    _qm_detected_b = detect_quote_markers(_rendered_qmb)
    ok_qmb = (_qm_detected_b == [])
    tests.append(('qm: detect_quote_markers [] for standard quotes',
                  ok_qmb, {'name': None, 'args': repr(_qm_detected_b)}))

    # ── QM-C: detect_quote_markers() returns [] when DUMMY_FUNC absent ────────
    _qm_no_func = detect_quote_markers('random text with <|"|>x<|"|> but no func name')
    ok_qmc = (_qm_no_func == [])
    tests.append(('qm: detect_quote_markers [] without DUMMY_FUNC',
                  ok_qmc, {'name': None, 'args': repr(_qm_no_func)}))

    # ── QM-D: Full pipeline — auto-detect QM → detect_format → stream ─────────
    # Also exercises _qm_tail by feeding the stream one character at a time.
    _QM_d = '<|"|>'
    _rendered_qmd = f'<|tool_call>call:super_unique_func{{loc:{_QM_d}x{_QM_d}}}<tool_call|>'
    _qm_auto_d = detect_quote_markers(_rendered_qmd)
    _spec_qmd = detect_format(_rendered_qmd, '<|tool_call>', _qm_auto_d)
    _pd = ToolCallStreamParser(_spec_qmd)
    _stream_qmd = f'<|tool_call>call:get_weather{{loc:{_QM_d}London{_QM_d}}}<tool_call|>'
    _rd = collect(_pd, list(_stream_qmd))   # one character per token → exercises _qm_tail
    ok_qmd = False
    try:
        ok_qmd = (_qm_auto_d == [_QM_d] and
                  _rd['name'] == 'get_weather' and
                  json.loads(_rd['args']) == {'loc': 'London'})
    except Exception:
        pass
    tests.append(('qm: auto-detect + char-by-char _qm_tail', ok_qmd, _rd))

    # ── QM-E: _qm_tail — quote marker chunk-split mid-stream ─────────────────
    # Feed the QM split across two tokens: first token ends mid-QM, second
    # begins with the remainder.  The parser must buffer the partial QM tail.
    _QM_e = '<|"|>'
    _rendered_qme = f'<|tool_call>call:super_unique_func{{a:{_QM_e}x{_QM_e}}}<tool_call|>'
    _pe = ToolCallStreamParser.from_rendered(_rendered_qme, '<|tool_call>', [_QM_e])
    _stream_split = [
        '<|tool_call>call:get_weather{loc:<|',   # QM starts but is cut off
        '"|>Paris<|"|>}<tool_call|>',             # QM tail + rest
    ]
    _re = collect(_pe, _stream_split)
    ok_qme = False
    try:
        ok_qme = (_re['name'] == 'get_weather' and
                  json.loads(_re['args']) == {'loc': 'Paris'})
    except Exception:
        pass
    tests.append(('qm: _qm_tail chunk-split mid-QM', ok_qme, _re))

    # ── PE-F: param_eq — chunked value containing literal quote chars ─────────
    # Regression test for the _pe_str_opened bug: when a param_eq value is
    # large enough that the parser emits the opening '"' in the streaming path,
    # and the close tag arrives in a later chunk, the complete-value path must
    # NOT emit a second opening '"'.  Any '"' inside the value must survive as
    # escaped \".
    _rendered_pef = ('<tool_call>\n<function=super_unique_func>\n'
                     '<parameter=loc>\nx\n</parameter>\n</function>\n</tool_call>')
    _spec_pef = detect_format(_rendered_pef, '<tool_call>')
    _pef = ToolCallStreamParser(_spec_pef)
    _stream_pef = [
        '<tool_call>\n<function=plan_actions>\n',
        '<parameter=orderOfActions>\n[{"action": "send_message"}]\n</parameter>\n',
        '<parameter=responsePlanOverview>',
        '\nUser sent a greeting "Hello world". I will respond with a friendly ',
        'hello and offer help with any tasks.\n',
        '</parameter>\n</function>\n</tool_call>',
    ]
    _re_pef = collect(_pef, _stream_pef)
    ok_pef = False
    try:
        _parsed_pef = json.loads(_re_pef['args'])
        ok_pef = (
            _re_pef['name'] == 'plan_actions' and
            isinstance(_parsed_pef.get('orderOfActions'), list) and
            isinstance(_parsed_pef.get('responsePlanOverview'), str) and
            '"Hello world"' in _parsed_pef['responsePlanOverview']
        )
    except Exception:
        pass
    tests.append(('param_eq: chunked value with literal quotes', ok_pef, _re_pef))

    # ── Print results ─────────────────────────────────────────────────────────
    print()
    all_ok = True
    for name, ok, result in tests:
        status = PASS if ok else FAIL
        print(f'  {status}  {name}')
        if not ok:
            all_ok = False
            print(f'       name={result["name"]!r}  args={result["args"]!r}')
    print()
    if all_ok:
        print(f'All {len(tests)} tests passed.')
    else:
        raise SystemExit('Some tests failed.')


def run_all_tests(templates_dir: Optional[str] = None) -> bool:
    """Run all unit tests AND the Jinja directory test in one call.

    Parameters
    ----------
    templates_dir : path to the templates directory.  When *None*, falls back to
                   the ``templates/`` sub-folder next to this file, and then to
                   ``../../templates`` relative to this file.

    Returns
    -------
    True  if every test passes (unit tests + directory scan).
    False if any test fails.
    """
    _run_tests()  # raises SystemExit / prints results
    # Resolve templates directory
    _here = os.path.dirname(os.path.abspath(__file__))
    if templates_dir is None:
        _local = os.path.join(_here, 'templates')
        _up2   = os.path.join(_here, '..', '..', 'templates')
        if os.path.isdir(_local):
            templates_dir = _local
        elif os.path.isdir(_up2):
            templates_dir = _up2
    if templates_dir is None or not os.path.isdir(templates_dir):
        print(f'run_all_tests: no templates directory found (tried {templates_dir!r})')
        return False
    return run_jinja_directory_test(templates_dir)


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        # Directory test mode: python toolcall_stream_parser.py /path/to/templates
        _run_tests()
        ok = run_jinja_directory_test(sys.argv[1])
        if not ok:
            sys.exit(1)
    else:
        ok = run_all_tests()
        if not ok:
            sys.exit(1)
