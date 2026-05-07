# ToolCall Stream Parser

Generic streaming parser for LLM tool-call output across Jinja chat templates.

---

## Overview

`toolcall_stream_parser.py` solves a single problem: an LLM generates text that encodes a function call in one of many possible wire formats (JSON, XML-attribute, GLM key-value, DeepSeek markup, etc.) and the text arrives as a stream of arbitrary-sized chunks. The parser converts that stream into three clean events regardless of the underlying format:

| Event | Payload | When fired |
|-------|---------|------------|
| `('start',)` | — | The call-open tag has been fully matched |
| `('name', func_name)` | `str` | The function name has been extracted |
| `('args_chunk', fragment)` | `str` | A fragment of valid JSON arguments text is ready |
| `('done',)` | — | The call is complete (end tag matched or JSON closed) |

The caller never needs to know which format the template uses.

---

## Quick start

```python
from esoExtras.toolcall_stream_parser import (
    detect_format, detect_quote_markers, ToolCallStreamParser
)

# rendered = output of getDummyJinjaParsedBody() — a Jinja template rendered
# with a dummy assistant turn that calls 'super_unique_func'.
# tool_segment_tag = the XML/JSON tag that opens a tool-call block in the stream
#                    (e.g. '<tool_call>', '{"name":', '<|python_tag|>', …).

qm   = detect_quote_markers(rendered)          # e.g. ['<|"|>'] for Gemma, [] for most
spec = detect_format(rendered, tool_segment_tag, qm)
parser = ToolCallStreamParser(spec)

args_buf = ""
for token in live_token_stream():
    for event in parser.feed(token):
        if event[0] == 'name':
            send_sse_name_chunk(event[1])
        elif event[0] == 'args_chunk':
            args_buf += event[1]
            send_sse_args_chunk(event[1])

# At end of stream, flush any content still buffered inside the parser.
for event in parser.flush():
    if event[0] == 'args_chunk':
        args_buf += event[1]
        send_sse_args_chunk(event[1])

if parser.is_done or stream_ended_naturally:
    send_sse_finish()
```

---

## API reference

### `detect_quote_markers(rendered) -> List[str]`

Scans the dummy-rendered output for non-standard string-quote sequences (e.g. Gemma's `<|"|>`) and returns them.  Pass the returned list to `detect_format`.  Returns `[]` for all templates that use standard `"` quotes.

### `detect_format(rendered, call_open_tag, quote_markers=[]) -> FormatSpec`

Derives all structural parameters of the wire format from a single rendered dummy output.

| Parameter | Type | Description |
|-----------|------|-------------|
| `rendered` | `str` | Full rendered output containing `super_unique_func` |
| `call_open_tag` | `str` | The tag that opens a tool-call section in the live stream |
| `quote_markers` | `list[str]` | Non-standard quote sequences to normalise to `"` |

Returns a `FormatSpec` dataclass that describes: where the function name sits, which args encoding is used, what terminates the args block, and any quote normalisation to apply.

### `ToolCallStreamParser(spec)`

Stateful incremental parser.  One instance per response.

| Method / Property | Description |
|-------------------|-------------|
| `feed(chunk: str) -> List[Event]` | Process an incoming token string; returns zero or more events immediately |
| `flush() -> List[Event]` | Call once at end-of-stream to emit any remaining buffered content |
| `is_done: bool` | True once a `done` event has been emitted |

`feed()` is safe to call with arbitrarily small chunks (down to single characters).

### `run_all_tests(templates_dir=None) -> bool`

Convenience entry point that runs:
1. All 60 unit tests
2. A streaming mock test against every `.jinja` file in `templates_dir`

Returns `True` if every test passes.  Raises `SystemExit` on unit-test failure.

```bash
# From the esoExtras directory:
python toolcall_stream_parser.py                     # uses ./templates/ by default
python toolcall_stream_parser.py /path/to/templates  # explicit directory
```

---

## Supported formats

The parser auto-detects the format from the rendered output.  Known formats:

| Format | Example | Template families |
|--------|---------|-------------------|
| JSON `{"name": …, "arguments": {…}}` | `{"name": "func", "arguments": {"k": "v"}}` | Most OpenAI-compatible models (Qwen, Llama, Mistral, …) |
| JSON wrapped in XML | `<tool_call>{"name": "func", "arguments": {…}}</tool_call>` | Qwen2.5, GLM-4 (earlier), many others |
| XML open-tag name | `<function=func>{"k":"v"}` | Functionary, some older models |
| DeepSeek markup | `<｜tool▁call▁begin｜>func<｜tool▁sep｜>{"k":"v"}<｜tool▁call▁end｜>` | DeepSeek-V3, R1 distills |
| XML key-value (GLM) | `<tool_call>func\n<arg_key>k</arg_key><arg_value>v</arg_value></tool_call>` | GLM-4, GLM-4-Flash |
| Brace-format (Gemma) | `<\|tool_call\|>call:{"loc":<\|"\|>x<\|"\|>}` | Gemma 4 |
| `<parameter=name>` XML | `<invoke><tool_name>func</tool_name><parameter=k>v</parameter></invoke>` | Claude-style |
| Param-name style | various | Hermes, some fine-tunes |
| Content injection | tool call embedded in `message.content` | LFM2, Granite 3.3 |

---

## Integration in KoboldCpp (`--jinja_stream_toolcall`)

When `--jinja_stream_toolcall` is active, `handle_sse_stream()` uses the parser as follows:

1. **Template rendering** — `getDummyJinjaParsedBody()` renders the active Jinja template with a dummy assistant message that calls `super_unique_func({"loc": "x"})`.

2. **Parser init** (first time a tool-call boundary is detected in the live stream):
   ```python
   qm   = detect_quote_markers(rendered)
   spec = detect_format(rendered, tool_segment_tag, qm)
   parser = ToolCallStreamParser(spec)
   ```
   The parser is stored in `genparams['tc_stream_parser']` and reused across token loop iterations.

3. **Incremental feeding** — each token string from the model is appended to `ec` (the content accumulator). The slice `ec[offset:]` (i.e. the new delta since the last iteration) is fed to `parser.feed()`.

4. **SSE events** emitted on each parser event:
   - `name` → `chat.completion.chunk` with `tool_calls[].function.name` and empty `arguments`
   - `args_chunk` → `chat.completion.chunk` with `tool_calls[].function.arguments` fragment

5. **Completion** — when `parser.is_done` or `streamDone`:
   - `flush()` is called to drain any remaining buffer
   - A final chunk with `finish_reason: "tool_calls"` is sent
   - `[DONE]` is sent and the connection is closed

This replaces the previous hand-rolled XML/JSON state machine with a single generic path that supports all known Jinja template formats.

---

## Adding a new template

If a new Jinja template is added and the parser does not detect it correctly:

1. Add the `.jinja` file to `esoExtras/templates/`
2. Run `python toolcall_stream_parser.py` — the directory test will report the failure and show `mode=` and `args=` diagnostics
3. Identify which detection branch `detect_format` falls into and adjust `TEMPLATE_CONFIG` in `run_jinja_directory_test()` if special handling is needed (e.g. `DICT_ARGS_TEMPLATES`, `CONTENT_TOOL_CALL_TEMPLATES`)
4. If the wire format is genuinely new, add a detection branch to `detect_format` and a corresponding `_args_*` method to `ToolCallStreamParser`

---

## Test policy

**Any change to this file that adds or modifies parsing logic, detection branches, args modes, or public API must include corresponding unit tests in `_run_tests()`.**

Specifically:

- **New detection branch** (`detect_format`): add a `Det-*` test that checks every relevant `FormatSpec` field for at least one representative rendered string.
- **New args mode** (`_args_*` method / `_state` branch in `feed()`): add an E2E test that streams a realistic call through the parser and asserts the reconstructed name and arguments are correct.
- **New quote-marker behaviour**: add a `qm:` test that calls `detect_quote_markers()` directly and a streaming test that exercises the `_qm_tail` buffer (feed the stream one character at a time to catch partial-QM boundary bugs).
- **New public function or class**: add unit tests covering the happy path and at least one edge/failure case.

Do not merge changes that reduce the test count or change passing tests to failing ones.  Run `python toolcall_stream_parser.py` before committing; it must print `All N tests passed.` with N ≥ the previous value.

