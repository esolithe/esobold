---
description: >
  Use when reading, editing, or extending esoExtras/toolcall_stream_parser.py
  or its tests. Covers architecture, how to add new wire formats, the test
  policy, template directory workflow, and notes on planned future work.
applyTo:
  - "esoExtras/toolcall_stream_parser.py"
  - "esoExtras/toolcall_stream_parser.md"
  - "esoExtras/templates/**"
---

# ToolCall Stream Parser — Copilot Instructions

## What this file does

`esoExtras/toolcall_stream_parser.py` is a self-contained streaming parser that
converts any LLM tool-call wire format into a clean sequence of events:

```
('start',)            tool-call boundary detected
('name', func_name)   function name extracted
('args_chunk', frag)  well-formed JSON fragment ready to emit
('done',)             arguments closed
```

It replaces a hand-rolled koboldcpp state machine with a single generic path
that works across all 55 Jinja templates in `esoExtras/templates/`.

---

## Architecture

```
detect_quote_markers(rendered)   →  List[str]
detect_format(rendered, tag, qm) →  FormatSpec        (derived once per request)
ToolCallStreamParser(spec)       →  parser instance
  .feed(chunk)  →  List[Event]                        (called per incoming token)
  .flush()      →  List[Event]                        (called at stream-done)
  .is_done      →  bool
```

### FormatSpec fields (all derived automatically from the rendered dummy output)

| Field | Purpose |
|-------|---------|
| `call_open` | Literal string that opens a tool-call block in the live stream |
| `name_prefix` | Text immediately before the function name |
| `name_suffix` | Character(s) that terminate the name |
| `args_skip_re` | Regex to skip routing tokens between name and args |
| `args_mode` | One of: `json`, `param_eq`, `glm`, `dsml`, `param_name`, `brace` |
| `args_end` | Explicit end-of-args tag (empty → rely on JSON depth) |
| `quote_markers` | Non-standard string delimiters to normalise to `"` (e.g. `['<|"|>']`) |
| `glm_start_state` | Sub-state for the GLM state machine |

### Args modes and their `_args_*` methods

| Mode | Used by | Method |
|------|---------|--------|
| `json` | Most formats | `_args_json()` |
| `param_eq` | `<parameter=k>v</parameter>` | `_args_param_eq()` |
| `glm` | GLM key-value XML | `_args_glm()` |
| `dsml` | DeepSeek V3.2 DSML tags | `_args_dsml()` |
| `param_name` | `<parameter name="k">v</parameter>` | `_args_param_name()` |
| `brace` | Gemma `call:func{k:<\|"\|>v<\|"\|>}` | `_args_brace()` |

### Special template registries (inside `run_jinja_directory_test`)

- **`DICT_ARGS_TEMPLATES`** — templates that use a `dict` for the `arguments`
  field instead of a JSON-encoded string; the directory test adapts accordingly.
- **`CONTENT_TOOL_CALL_TEMPLATES`** — templates that render tool calls into
  `message['content']` rather than `message['tool_calls']`; the directory test
  injects the call via the content field.
- **`NEEDS_NONE_CONTENT`** — templates that require `content=None` in the
  assistant message turn to render correctly.

---

## Quote markers and `_qm_tail`

Some templates (Gemma family) use multi-character sequences like `<|"|>` where
standard JSON `"` would appear.  Two mechanisms handle this:

1. **`detect_quote_markers(rendered)`** — scans the rendered output for a
   symmetric non-standard delimiter surrounding the dummy argument value `x`.
   The regex `([^\w\s,:{}()\[\]=.]{2,12})x\1` allows `"` inside the sequence
   (e.g. `<|"|>`) while the ≥2-char requirement prevents a bare `"` from
   matching.

2. **`_qm_tail`** — when a chunk ends with a partial quote marker prefix (e.g.
   stream is cut between `<|` and `"|>`), the partial prefix is held back in
   `_qm_tail` and prepended to the next chunk.  This makes single-character
   streaming safe.

---

## Test policy (non-negotiable)

**Every change that adds or modifies parsing logic, detection branches, args
modes, or public API MUST include corresponding unit tests in `_run_tests()`.**

Run before committing:

```bash
conda/envs/linux/bin/python3 esoExtras/toolcall_stream_parser.py
# Must print: All N tests passed.  (N must not decrease)
```

### Test naming conventions

| Category | Label prefix | What to assert |
|----------|--------------|---------------|
| Detection | `det:` | Every relevant `FormatSpec` field for one representative rendered string |
| End-to-end streaming | `stream:` | `name` and parsed `args` match expected values |
| Edge case | `edge:` | Boundary: char-by-char, split tokens, empty args, flush() behaviour |
| Quote marker | `qm:` | `detect_quote_markers()` return value AND `_qm_tail` via char-by-char streaming |

---

## How to add support for a new wire format

1. **Get a rendered example.**  Add the new `.jinja` to `esoExtras/templates/`
   and run `python3 toolcall_stream_parser.py` — the directory test prints the
   rendered output for any template it can't yet detect.

2. **Identify the structural pattern** by reading the rendered output:
   - What opens the block? (`call_open`)
   - Where is the name? (prefix / suffix around it)
   - How are args encoded? (JSON, XML attributes, key-value…)
   - Are there non-standard quote markers?

3. **Add a detection branch** in `detect_format()`:
   ```python
   elif '<your_open>' in rendered:
       spec.call_open   = '<your_open>'
       spec.name_prefix = '…'
       spec.name_suffix = '…'
       spec.args_mode   = 'json'   # or new mode
       # etc.
   ```

4. **If the args format is genuinely new**, add a `_args_<mode>()` method to
   `ToolCallStreamParser` and wire it into the `_dispatch()` method.

5. **If the template uses a `dict` args field**, add the filename to
   `DICT_ARGS_TEMPLATES` inside `run_jinja_directory_test`.

6. **If the template uses `message['content']`**, add the filename + config to
   `CONTENT_TOOL_CALL_TEMPLATES`.

7. **Write tests** (required):
   - One `det:` test checking `FormatSpec` fields
   - One `stream:` E2E test feeding realistic tokens
   - If quote markers are involved: one `qm:` test calling
     `detect_quote_markers()` directly + one feeding the stream char-by-char

---

## Template directory comparison (future work)

When the `esoExtras/templates/` directory is updated (new Jinja files or
modified existing ones), the following workflow should identify any new formats
that need parser support:

1. Run `python3 toolcall_stream_parser.py` to get the current baseline:
   `N passed / M failed / R render-err / S skipped`.

2. Drop new `.jinja` files into `esoExtras/templates/`.

3. Re-run.  Any new `FAIL` or `RENDER-ERR` lines identify templates needing
   attention.  `RENDER-ERR` means jinja2 raised an error during rendering (often
   a missing template variable or unknown filter) — fix the render helper first.
   `FAIL` means the format was detected but the name/args extraction is wrong.

4. For each failure, read the rendered output (printed by the directory test)
   and follow the "How to add support" steps above.

**Planned future enhancement**: automatically diff the template directory against
a saved snapshot (`esoExtras/templates/.snapshot`) and report which files are
new/changed, so CI can flag that parser support may need updating.  The snapshot
would be a JSON file mapping `{filename: sha256}` updated by a separate script
or pre-commit hook.

---

## KoboldCpp integration point

The integration lives in `koboldcpp.py` inside `handle_sse_stream()`, gated on
`args.jinja_stream_toolcall`.  Key facts:

- The parser is lazy-initialised **once per request** and stored in
  `genparams['tc_stream_parser']`.
- The input to `feed()` is the delta slice `ec[offset:]` where `ec` is the
  full content accumulator.  The offset is stored in
  `genparams['tc_parser_ec_offset']`.
- `flush()` is called when `streamDone` is True.
- The integration does NOT import koboldcpp internals; the parser is entirely
  self-contained.

---

## Files touched by changes to this module

| File | Why |
|------|-----|
| `esoExtras/toolcall_stream_parser.py` | The parser itself |
| `esoExtras/toolcall_stream_parser.md` | Human-readable docs — keep in sync |
| `esoExtras/templates/*.jinja` | Template files used by the directory test |
| `koboldcpp.py` (~line 7862) | Integration — only touch if the public API changes |

**Do not edit `docs/` files directly** — that folder is generated output.
