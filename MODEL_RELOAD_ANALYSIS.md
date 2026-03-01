# KoboldCpp — In-Process Model Reload, Park & Unpark

This document describes the **current working implementation** of KoboldCpp's in-process
model management system: how models are parked to RAM, unparked back to GPU, and how the
configuration / model can be swapped entirely without restarting the process.

---

## Overview

KoboldCpp can now swap models and reload configuration **without terminating the HTTP
server process**.  All six inference subsystems support park (free GPU memory) and
unpark (restore to GPU):

| Subsystem | Park mechanism | Unpark mechanism | Notes |
|---|---|---|---|
| **LLM** | `handle.unload_model()` | `load_model(path)` | Full GPU free; reloads from disk |
| **Image gen (SD)** | `handle.sd_unload_model()` | `sd_load_model(...)` | Full GPU free |
| **Transcription (Whisper)** | `handle.whisper_unload_model()` | `whisper_load_model(path)` | Full GPU free |
| **TTS** | `handle.tts_unload_model()` | `tts_load_model(path, wav)` | Full GPU free |
| **Embeddings** | `handle.embeddings_unload_model()` | `embeddings_load_model(path)` | Full GPU free |
| **Music** | Flag only (`music_parked = True`) | Flag cleared | ⚠️ No GPU unload — inference blocked but VRAM not freed |

---

## HTTP API

All admin endpoints require the server to have been started with `--admin`.  If
`--adminpassword` was set, include the header `Authorization: Bearer <password>`.

### `POST /api/admin/park`

Parks (unloads from GPU) one or more subsystems.

**Request body** (optional):
```json
{ "models": ["llm", "sd", "whisper", "tts", "embeddings", "music"] }
```

Omit the body (or omit the `models` key) to park **all** currently-loaded subsystems.
An empty `models` array also parks all.  Valid subsystem names: `llm`, `sd`, `whisper`,
`tts`, `embeddings`, `music` (case-insensitive).

**Response** (success):
```json
{ "success": true }
```

**Response** (unknown subsystem name):
```json
{ "success": false, "error": "Unknown subsystem(s): ['xyz']. Valid values: ['embeddings', 'llm', 'music', 'sd', 'tts', 'whisper']" }
```

---

### `POST /api/admin/unpark`

Reloads one or more subsystems back into GPU memory.  Uses the same request / response
format as `/api/admin/park`.

Omit the body to unpark **all** currently-parked subsystems.

---

### `POST /api/admin/reload_config`

Replaces the running model/configuration in-process.

**Request body**:
```json
{
  "filename": "my_config.kcpps",
  "modelName": "optional_override.gguf"
}
```

| Field | Value | Effect |
|---|---|---|
| `filename` | `"something.kcpps"` or `"something.kcppt"` | Load that config file from `--admindir` |
| `filename` | `"something.gguf"` | Switch to that LLM file from `--admindir`, keeping all other model paths |
| `filename` | `"unload_model"` | Unload everything; server stays up with no model |
| `modelName` | a `.gguf` filename | Override the LLM path with this file from `--admintextmodelsdir` |
| `modelName` | a HuggingFace URL | Only accepted when `--adminallowhf` is set |

**Response**:
```json
{ "success": true }
```

The reload happens asynchronously in a background thread.  The HTTP server continues to
accept requests immediately; a brief period of unavailability occurs only while models
are being reloaded.

---

### `GET /api/extra/version`

The version response includes the current park state of every subsystem:

```json
{
  "result": "KoboldCpp",
  "version": "1.109",
  "llm": true,
  "txt2img": true,
  "parked": {
    "llm":        false,
    "sd":         false,
    "whisper":    false,
    "tts":        false,
    "embeddings": false,
    "music":      false
  }
}
```

---

## Park Behaviour

When a subsystem is parked, the server:

1. **Blocks inference** with HTTP 503 and `"type": "model_parked"` in the error detail.
   This applies to all endpoints that use that subsystem (e.g. `/api/generate` for LLM,
   `/sdapi/v1/txt2img` for SD, `/api/extra/tts/generate` for TTS, etc.).

2. **Retains the model name** in globals (`friendlymodelname`, `fullsdmodelpath`, etc.)
   so that the server can report what is parked and reload it later.

3. **Reports updated capability flags** via `/api/extra/version` — `"llm": false`,
   `"txt2img": false`, etc. while the subsystem is parked, so clients can see the
   current availability.

4. **Park is idempotent** — parking an already-parked subsystem is a no-op.

---

## Unpark Behaviour

When a subsystem is unparked:

- The model is reloaded from the path stored in the corresponding global
  (`args.model_param` for LLM, `fullsdmodelpath` for SD, etc.).
- If the model file is missing the unpark is skipped (Whisper) or the flag is silently
  cleared (SD) — the subsystem is not left in a permanently-broken state.
- If the C++ load call fails the park flag **stays `True`** so the failure is visible
  and retryable.
- After a successful LLM unpark, `cached_chat_template` is refreshed from the C++ layer
  (so the template is never stale after a park/unpark cycle).

---

## Reload Code Flow

### `perform_park_to_ram(subsystems=None)`

```
target = subsystems or ALL_SUBSYSTEMS
for each subsystem in target:
    if subsystem is loaded and not already parked:
        call C unload function
        set <subsystem>_parked = True
```

### `perform_unpark(subsystems=None)`

```
target = subsystems or ALL_SUBSYSTEMS
for each subsystem in target:
    if subsystem is parked:
        call C load function using stored path
        if load OK:  clear <subsystem>_parked flag
        else:        leave flag True (load failure visible)
```

### `perform_in_process_reload(restart_target, restart_model, defaultargs)`

This is called from the background `_inprocess_reload_thread` inside `kcpp_main_process`.
`defaultargs` is `dict(vars(args))` — a snapshot of the current running args.

```
1. perform_park_to_ram()          ← free all GPU memory

2. Select the variant:

   a) restart_target == "unload_model"
      - reload_from_new_args(defaultargs)  ← reset args to defaults
      - args.model_param = None
      - args.nomodel = True
      - clear all NON_LLM_MODEL_ATTRS      ← prevent stale SD/Whisper/TTS/etc. reload

   b) restart_target ends with ".gguf"
      - save NON_LLM_MODEL_ATTRS from current args
      - reload_from_new_args(defaultargs)  ← reset args to defaults
      - args.model_param = os.path.join(admindir, restart_target)
      - restore NON_LLM_MODEL_ATTRS        ← keep SD/Whisper/TTS/etc. paths

   c) restart_target ends with ".kcpps" / ".kcppt"
      - reload_new_config(os.path.join(admindir, restart_target), defaultargs)
        reads JSON, fills missing keys from defaultargs, applies via reload_from_new_args

3. Optional: apply restart_model override from admintextmodelsdir (or HF URL)

4. Reset all park flags to False          ← allow the new loads to proceed
5. Reset all model-path globals to ""     ← will be repopulated below

6. Reload each subsystem whose arg path is non-empty and the file exists:
   LLM → load_model()  → set friendlymodelname, cached_chat_template, has_audio/vision_support
   SD  → sd_load_model() → set fullsdmodelpath, friendlysdmodelname
   Whisper → whisper_load_model() → set fullwhispermodelpath
   TTS → tts_load_model() → set ttsmodelpath
   Embeddings → embeddings_load_model() → set embeddingsmodelpath, friendlyembeddingsmodelname
   Music → music_load_model() → set musicdiffusionmodelpath / musicllmmodelpath
```

### `reload_new_config(filename, defaultargs)`

```
try:
    open filename
    parse JSON
    fill missing keys from defaultargs
    reload_from_new_args(merged_config)
except file-not-found:   print error, return gracefully
except JSON parse error: print error, return gracefully
```

---

## Global State Reference

| Global | Unloaded | Parked | Loaded |
|---|---|---|---|
| `friendlymodelname` | `"inactive"` | model name kept | `"koboldcpp/<name>"` |
| `llm_parked` | `False` | **`True`** | `False` |
| `cached_chat_template` | `None` | `None` | decoded bytes from `handle.get_chat_template()` |
| `has_audio_support` / `has_vision_support` | `False` | `False` | `handle.has_audio_support/vision_support()` |
| `fullsdmodelpath` | `""` | path kept | `os.path.abspath(args.sdmodel)` |
| `friendlysdmodelname` | `"inactive"` | name kept | `sanitize_string(basename)` |
| `sd_parked` | `False` | **`True`** | `False` |
| `fullwhispermodelpath` | `""` | path kept | `os.path.abspath(args.whispermodel)` |
| `whisper_parked` | `False` | **`True`** | `False` |
| `ttsmodelpath` | `""` | path kept | `os.path.abspath(args.ttsmodel)` |
| `tts_parked` | `False` | **`True`** | `False` |
| `embeddingsmodelpath` | `""` | path kept | `os.path.abspath(args.embeddingsmodel)` |
| `friendlyembeddingsmodelname` | `"inactive"` | name kept | `sanitize_string(basename)` |
| `embeddings_parked` | `False` | **`True`** | `False` |
| `musicdiffusionmodelpath` | `""` | path kept | `os.path.abspath(args.musicdiffusion)` |
| `musicllmmodelpath` | `""` | path kept | `os.path.abspath(args.musicllm)` |
| `music_parked` | `False` | **`True`** (flag only — VRAM not freed) | `False` |

The path globals (`fullsdmodelpath`, `ttsmodelpath`, etc.) are **retained** when parked
so that unpark knows where to reload from without needing the original args.

---

## Key Constants

```python
VALID_PARK_SUBSYSTEMS = {"llm", "sd", "whisper", "tts", "embeddings", "music"}

NON_LLM_MODEL_ATTRS = [
    "sdmodel", "whispermodel", "ttsmodel", "ttswavtokenizer",
    "embeddingsmodel", "musicllm", "musicembeddings", "musicdiffusion", "musicvae",
]
```

`NON_LLM_MODEL_ATTRS` is used in two places:
- **`unload_model` target** — cleared to `""` after `reload_from_new_args` so that no
  non-LLM subsystem is accidentally reloaded.
- **`.gguf` LLM switch** — saved before and restored after `reload_from_new_args` so
  that all non-LLM model paths survive the args reset.

The Music attrs have load-time dependencies: `musicdiffusion`, `musicembeddings`, and
`musicvae` must all be non-empty together for the diffusion path; `musicllm` alone
triggers the LLM-only path.  All four must exist as files if provided.  See the
`perform_in_process_reload` Music reload block for the full conditional logic.

Add entries here when new subsystems are introduced.

---

## Music Subsystem Caveat

The Music (ACE-Step) adapter does **not** expose a GPU unload function.  When
`music_parked = True`:
- All music inference endpoints return HTTP 503.
- The VRAM used by the music models is **not freed**.
- On unpark, only the flag is cleared — no reload is needed.

This means parking music is useful for blocking inference (e.g. while another subsystem
is being reloaded) but does not reclaim VRAM.  True GPU-free park for music would
require a CPU-fallback reload path in the C++ adapter (not yet implemented).

---

## Bug History

Six bugs were found and fixed across two sessions by actually running the code:

| # | Bug | Fix |
|---|---|---|
| 1 | `_inprocess_reload_thread` used `vars(default_args)` — undefined in worker subprocess; all reloads silently did nothing | Changed to `dict(vars(args))` |
| 2 | `perform_in_process_reload` only reloaded the LLM after parking; SD/Whisper/TTS/Embeddings/Music were permanently dropped | Added reload blocks for all subsystems |
| 3 | `.gguf` LLM switch called `reload_from_new_args(defaultargs)` which reset `args.sdmodel` etc. to defaults, losing non-LLM models | Save/restore `NON_LLM_MODEL_ATTRS` around the call |
| 4 | `reload_new_config` had `with open(filename)` outside any try/except — `FileNotFoundError` crashed the reload thread | Wrapped in outer try/except |
| 5 | `unload_model` target: `reload_from_new_args(defaultargs)` preserved `args.sdmodel` etc., so SD/Whisper/TTS/Embeddings/Music were reloaded after an explicit unload | Clear all `NON_LLM_MODEL_ATTRS` after setting `nomodel=True` |
| 6 | `perform_unpark` LLM did not refresh `cached_chat_template` after reloading the model | Call `handle.get_chat_template()` and update `cached_chat_template` after successful LLM unpark |

