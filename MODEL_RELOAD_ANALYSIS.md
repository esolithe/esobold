# Analysis: KoboldCPP vs llama.cpp — Barriers to In-Process Model Loading/Unloading

This document analyses the key architectural and code-level differences between KoboldCPP
(`gpttype_adapter.cpp` / `expose.cpp`) and llama.cpp (`src/llama.cpp` / `include/llama.h`)
that prevent swapping models without terminating and restarting the process.

---

## Current Behaviour in KoboldCPP

When a user requests a model reload (via the admin API or the UI), KoboldCPP:

1. Signals the parent Python process through the `global_memory["restart_target"]` flag.
2. The manager loop in `koboldcpp.py` calls `kcpp_instance.terminate()` to kill the entire
   worker process.
3. A brand-new `multiprocessing.Process` is spawned, which loads the shared library from
   scratch, re-initialises every backend, and loads the new model.

This full-process restart is necessary precisely because the C++ layer cannot be cleanly
reset within the same process.

---

## Differences That Block In-Process Reload

### 1. No Unload / Cleanup Function Exists

llama.cpp exposes a complete resource-management lifecycle:

```
llama_backend_init()
llama_model_load_from_file()   →  llama_model_free()
llama_init_from_model()        →  llama_free()
llama_backend_free()
```

KoboldCPP has **no equivalent** of any of the `*_free` calls.
`expose.cpp` exports a `load_model()` function but has no `unload_model()` counterpart.
`gpttype_adapter.cpp` has no `gpttype_unload_model()` or any function that calls
`llama_free`, `llama_model_free`, `clip_free`, or `ggml_threadpool_free`.

---

### 2. The Loaded llama Model Pointer Is a Function-Local Variable

Inside `gpttype_load_model()` the model is declared as a local variable:

```cpp
// gpttype_adapter.cpp ≈ line 2601
llama_model * llamamodel = llama_model_load_from_file(...);
```

Once `gpttype_load_model()` returns, the pointer to the loaded `llama_model` object is
lost — there is no static/global holding it.  Without this pointer it is impossible to
call `llama_model_free(llamamodel)` later.

The inference contexts derived from it (`llama_ctx_v4`, `guidance_ctx`, `draft_ctx`) are
stored as statics, but the underlying model they were created from cannot be freed.

---

### 3. All Contexts Are Static Globals With No Reset Path

```cpp
// gpttype_adapter.cpp ≈ lines 106-114
static llama_context * llama_ctx_v4   = nullptr;
static llama_context * draft_ctx      = nullptr;
static llama_context * guidance_ctx   = nullptr;
static clip_ctx      * clp_ctx_v      = nullptr;
static clip_ctx      * clp_ctx_a      = nullptr;
```

When `gpttype_load_model()` is called a second time it simply overwrites these pointers
with new values.  The previously allocated contexts are never freed, causing a memory and
GPU-memory leak.  On a system with limited VRAM this would prevent the new model from
loading at all.

---

### 4. `llama_backend_init()` Is Called on Every Load

```cpp
// gpttype_adapter.cpp ≈ line 2374  (inside gpttype_load_model, GGUF branch)
llama_backend_init();
```

The llama.cpp header documents this function as *"Call once at the start of the
program"*.  Calling it repeatedly without a matching `llama_backend_free()` between
calls breaks the backend's internal reference-counting / CUDA initialisation logic and
can cause undefined behaviour.

In llama.cpp's own example servers (`llama-server`, `llama-cli`) `llama_backend_init()`
is called once in `main()` and `llama_backend_free()` is called at the very end.

---

### 5. Thread Pools Are Created but Never Freed

```cpp
// gpttype_adapter.cpp ≈ lines 2676-2682
struct ggml_threadpool * threadpool1 = ggml_threadpool_new(&threadpool1_params);
struct ggml_threadpool * threadpool2 = ggml_threadpool_new(&threadpool2_params);
llama_attach_threadpool(llama_ctx_v4, threadpool1, threadpool2);
```

`ggml_threadpool_free()` is never called.  Each model load leaks two thread pools.
Repeated in-process reloads would exhaust OS thread limits.  Before loading a new
context the old thread pools must be detached (`llama_detach_threadpool`) and freed.

---

### 6. Deliberate Memory Leak of `kcpp_params`

```cpp
// gpttype_adapter.cpp ≈ line 2142
kcpp_data = new kcpp_params(); // allocate on heap to avoid linux segfault. yes this leaks memory.
```

Every call to `gpttype_load_model()` allocates a new `kcpp_params` struct on the heap
and never deletes the previous one.  While small relative to model weights, this is an
explicit acknowledgement that the load path was not designed to be called more than once
per process lifetime.

---

### 7. Multimodal (clip) Contexts Are Not Freed

```cpp
// gpttype_adapter.cpp ≈ lines 2726-2730
clip_init_result cres = clip_init(mmproj_filename.c_str(), ctx_clip_params);
clp_ctx_v = cres.ctx_v;
clp_ctx_a = cres.ctx_a;
```

`clip_free(clp_ctx_v)` and `clip_free(clp_ctx_a)` are never called.  Loading a model
with a different (or no) mmproj projector would leak the old clip contexts, which hold
GPU memory for the vision/audio encoder weights.

---

### 8. LoRA Adapter References Are Leaked

```cpp
// gpttype_adapter.cpp ≈ lines 2689-2697
auto adapter = llama_adapter_lora_init(llamamodel, lora_filename.c_str());
loras.push_back(adapter);
llama_set_adapters_lora(llama_ctx_v4, ...);
```

`llama_adapter_lora_free()` (deprecated) / the adapter object itself is never released.

---

### 9. Legacy Model Contexts (GPT-J, GPT-2, NEO-X, MPT) Accumulate

The legacy model contexts are stored as static value-type objects:

```cpp
static gptj_model   gptj_ctx_v3;
static gpt2_model   gpt2_ctx_v3;
static gpt_neox_model neox_ctx_v3;
static mpt_model    mpt_ctx_v3;
```

There are no destructor calls or `free()` equivalents for these custom structs before
re-loading.  The weight tensors held inside them (which may be GPU-allocated) would
leak on a second load.

---

## Summary Comparison Table

| Concern | llama.cpp | KoboldCPP |
|---|---|---|
| Model pointer lifetime | Caller manages; `llama_model_free()` available | Lost after `gpttype_load_model()` returns |
| Context cleanup | `llama_free(ctx)` | Not implemented |
| Backend lifecycle | `init` once / `free` once | `init` every load, `free` never |
| Thread pool cleanup | `ggml_threadpool_free()` available | Not implemented; leaks on every load |
| Multimodal cleanup | Caller calls `clip_free()` | Not implemented |
| LoRA cleanup | `llama_adapter_lora_free()` available | Not implemented |
| Unload API exported | N/A (library, not server) | Not exported from `expose.cpp` |
| Python layer | N/A | Terminates whole process to "unload" |

---

## Changes Required to Enable In-Process Reload

The following changes, in order of dependency, would enable model switching without a
full process restart:

### C++ layer (`gpttype_adapter.cpp` / `expose.cpp`)

1. **Promote `llamamodel` to a static global** so that the pointer survives after
   `gpttype_load_model()` returns and can be passed to `llama_model_free()` later.

2. **Add `gpttype_unload_model()`** that:
   - Calls `llama_detach_threadpool(llama_ctx_v4)` then frees both thread pools.
   - Calls `llama_free(guidance_ctx)` / `llama_free(draft_ctx)` / `llama_free(llama_ctx_v4)`.
   - Calls `llama_model_free()` for the draft model and main model.
   - Calls `clip_free(clp_ctx_v)` and `clip_free(clp_ctx_a)`.
   - Deletes `kcpp_data` and sets it to `nullptr`.
   - Resets all static context/model pointers to `nullptr`.

3. **Move `llama_backend_init()` out of `gpttype_load_model()`** — call it once from
   `load_model()` in `expose.cpp` (guarded by a `static bool backend_initialised` flag)
   so that re-calling `load_model()` does not re-invoke it.

4. **Call `gpttype_unload_model()` at the top of `gpttype_load_model()`** (or from
   `load_model()` in `expose.cpp`) if a model is already loaded, to release all
   resources before loading the new one.

5. **Export `unload_model()` from `expose.cpp`** so the Python layer can call it.

### Python layer (`koboldcpp.py`)

6. **Bind the new `unload_model()` C export** via ctypes alongside the existing
   `load_model` binding.

7. **Replace the process-restart path** in the `restart_target` handler with a direct
   call to `handle.unload_model()` followed by `handle.load_model(new_inputs)`, keeping
   the HTTP server running throughout.  The `fault_recovery_mode` / `terminate()` path
   can be retained as a fallback for catastrophic failures.

---

## Detailed Steps: Replacing the Process-Restart with In-Process Model Switching

This section maps the existing `koboldcpp.py` model-switching logic to the concrete
changes needed to perform the switch in-process, inside the same worker process that is
already serving HTTP requests.

---

### Step A — Understand the Current Switching Flow

The current flow involves **two separate processes**: a manager (outer) and a worker
(inner).

#### Manager process  (`koboldcpp.py`, ≈ line 9340 onwards)

```
while True:
    restart_target = global_memory["restart_target"]
    if restart_target != "":
        kcpp_instance.terminate()           # ← kills the HTTP server
        kcpp_instance.join(timeout=10)
        reload_from_new_args(defaultargs)   # ← mutates global `args`
        # or reload_new_config(targetfilepath, defaultargs)
        # or sets args.nomodel = True  (for "unload_model")
        global_memory["modelOverride"] = modelFilepath  # optional model override
        kcpp_instance = multiprocessing.Process(target=kcpp_main_process, ...)
        kcpp_instance.start()               # ← starts a fresh HTTP server
```

#### Worker process (`kcpp_main_process`, ≈ line 9426)

On startup the worker:
1. Calls `init_library()` to load the shared `.dll` / `.so` and bind ctypes.
2. Calls `load_model(model_filename)` which calls `handle.load_model(inputs)` (C++).
3. Sets Python globals: `friendlymodelname`, `has_audio_support`, `has_vision_support`,
   `cached_chat_template`, `maxctx`, `fullsdmodelpath`, etc.
4. Starts the HTTP server threads (`serve_forever()`).
5. Sets `global_memory["load_complete"] = True`.

The key insight is that **steps 2–3 are the only things that must change** during a
model switch — steps 1 and 4 can remain running throughout.

---

### Step B — Move Model-Reload Signal from Manager to Worker

Instead of the manager terminating the worker and spawning a new one, the reload signal
should be consumed **inside the worker** so that the HTTP server stays alive.

**New signal flow:**

1. The admin API handler (≈ line 5682) continues to write
   `global_memory["restart_target"]` exactly as today — no change needed there.
2. Add a **background reload thread** inside `kcpp_main_process` that polls
   `global_memory["restart_target"]` (or receives a threading `Event`).
3. When the reload thread detects a non-empty `restart_target`, it performs the
   in-process reload (Steps C–E below) instead of exiting.
4. The manager loop is simplified: it no longer needs to terminate/spawn the worker.
   It only needs to handle the rare case where the worker crashes unexpectedly (keeping
   the existing `fault_recovery_mode` path as a safety net).

```python
# New thread added inside kcpp_main_process:
reload_event = threading.Event()

def model_reload_thread():
    while True:
        reload_event.wait()          # blocks until signalled; no polling overhead
        reload_event.clear()
        target = global_memory.get("restart_target", "")
        if target != "":
            perform_in_process_reload(target)

threading.Thread(target=model_reload_thread, daemon=True).start()
```

The admin API handler (≈ line 5682) must also call `reload_event.set()` after writing
`global_memory["restart_target"]` to wake the reload thread immediately with no delay.

---

### Step C — Wait for Any In-Flight Generation to Complete

Before unloading, the worker must ensure no generation is active.

```python
def perform_in_process_reload(restart_target):
    global_memory["restart_target"] = ""      # clear flag immediately
    global_memory["load_complete"] = False    # signal "not ready" to clients

    # Abort any active generation
    handle.abort_generate()

    # Wait for the generation lock to become free
    with modelbusy:                           # blocks until generation finishes
        _do_reload(restart_target)
```

`modelbusy` (≈ line 100) is the `threading.Lock()` already used to serialise
generation requests.  Acquiring it guarantees the C++ model is idle before any C++
resources are freed.

---

### Step D — Update Python-Layer State via Existing Helpers

The existing `reload_from_new_args` and `reload_new_config` functions already translate
a new config file or `.gguf` path into a fully populated global `args` object.  They can
be reused unchanged:

```python
def _do_reload(restart_target):
    global friendlymodelname, has_audio_support, has_vision_support
    global cached_chat_template, maxctx, fullsdmodelpath, friendlysdmodelname

    defaultargs = vars(default_args)   # same as the manager uses today

    if restart_target == "unload_model":
        reload_from_new_args(defaultargs)
        args.model_param = None
        args.model = None
        args.nomodel = True
    elif restart_target.endswith(".gguf"):
        reload_from_new_args(defaultargs)
        args.model_param = os.path.join(os.path.abspath(args.admindir), restart_target)
    else:
        reload_new_config(
            os.path.join(os.path.abspath(args.admindir), restart_target),
            defaultargs
        )

    # Apply optional per-request model override
    if global_memory.get("modelOverride"):
        args.model_param = global_memory["modelOverride"]
        global_memory["modelOverride"] = None

    # Update global_memory bookkeeping (same as the manager does today)
    args.currentConfig = restart_target
    global_memory["currentConfig"] = restart_target
    global_memory["restart_target"] = ""
    global_memory["restart_model"] = ""
```

---

### Step E — Call the C++ Unload then Load

This is where the new C++ API (Steps 1–5 in the previous section) is actually used:

```python
    # --- Unload the current model from C++ ---
    handle.unload_model()                 # NEW: calls gpttype_unload_model() in C++

    # Reset Python model-state globals
    friendlymodelname    = "inactive"
    has_audio_support    = False
    has_vision_support   = False
    cached_chat_template = None
    fullsdmodelpath      = ""
    friendlysdmodelname  = ""

    if args.model_param:
        # --- Load the new model via the existing Python load_model() ---
        modelname = os.path.abspath(args.model_param)
        print(f"In-process reload: Loading {modelname}", flush=True)
        loadok = load_model(modelname)       # reuses the existing Python function
        print(f"Load OK: {loadok}")

        if loadok:
            # Update multimodal flags (same as kcpp_main_process does on startup)
            if args.mmproj:
                has_audio_support  = handle.has_audio_support()
                has_vision_support = handle.has_vision_support()

            # Refresh cached chat template
            ctbytes = handle.get_chat_template()
            cached_chat_template = ctypes.string_at(ctbytes).decode("UTF-8", "ignore")

            # Rebuild friendlymodelname (same logic as kcpp_main_process)
            newname = os.path.splitext(os.path.basename(modelname))[0]
            friendlymodelname = "koboldcpp/" + sanitize_string(newname)
        else:
            print("In-process reload FAILED — no model is now loaded.")

    # Signal that the server is ready again
    global_memory["load_complete"] = True
```

`load_model()` (Python, ≈ line 1623) already reads all relevant fields from `args` and
calls `handle.load_model(inputs)`.  Because `reload_from_new_args` / `reload_new_config`
have already updated `args` in Step D, calling `load_model()` here picks up the new
parameters without any further change to that function.

---

### Step F — Simplify the Manager Loop

Once the worker handles its own reloads, the manager loop no longer needs to
terminate/respawn for normal model switches.  It can be simplified to:

```python
# Manager loop (koboldcpp.py, ≈ line 9340)
while True:
    time.sleep(0.2)
    if not kcpp_instance or not kcpp_instance.is_alive():
        if fault_recovery_mode:
            # existing recovery logic — kept as-is
            ...
        else:
            break  # worker crashed without recovery; exit
    if fault_recovery_mode and global_memory["load_complete"]:
        fault_recovery_mode = False
    # restart_target is now consumed by the worker — no action needed here
```

The `fault_recovery_mode` path (terminate + respawn on crash) remains untouched as a
safety net for unrecoverable C++ failures.

---

### Step G — Handle the `unload_model` (no-model) Case

When `restart_target == "unload_model"` the intent is to serve requests with no text
model loaded (image / audio only, or idle).  After Step E with `args.model_param = None`
the worker skips `load_model()`, leaving `friendlymodelname = "inactive"`.  The HTTP
server continues to run, correctly reporting `"llm": false` from the `/api/extra/version`
capabilities endpoint.

---

### Summary: Python-Layer State Reset Checklist

The following Python globals must be explicitly reset whenever a new model is loaded or
unloaded in-process.  These are all set during `kcpp_main_process` startup and must be
refreshed after each in-process reload:

| Global | Reset value (unload) | Updated value (load) |
|---|---|---|
| `friendlymodelname` | `"inactive"` | `"koboldcpp/" + sanitize_string(basename)` |
| `has_audio_support` | `False` | `handle.has_audio_support()` |
| `has_vision_support` | `False` | `handle.has_vision_support()` |
| `cached_chat_template` | `None` | `handle.get_chat_template()` decoded |
| `fullsdmodelpath` | `""` | unchanged (SD not reloaded) |
| `friendlysdmodelname` | `""` | unchanged (SD not reloaded) |
| `maxctx` | `args.contextsize` | set inside `load_model()` from `args` |
| `global_memory["load_complete"]` | `False` | `True` when done |
| `global_memory["currentModel"]` | `None` | `args.model_param` |
| `global_memory["currentConfig"]` | updated | updated |

Note: `modelbusy`, `requestsinqueue`, `totalgens`, `exitcounter`, and all HTTP server
threads do **not** need to be reset — they persist across model reloads.  The extended
checklist covering all subsystems is in the final section of this document.

---

## Subsystem Analysis: Non-LLM Backends

KoboldCPP runs several backends beyond llama.cpp text generation, each with its own
resource lifecycle.  The sections below analyse each subsystem against the same
in-process-reload criteria and document the specific C++ and Python changes required.

---

### Subsystem 1: Image Generation (sd.cpp / `sdtype_adapter.cpp`)

#### Current State

`sdtype_load_model()` (`otherarch/sdcpp/sdtype_adapter.cpp` ≈ line 206) stores the
active context in a static global:

```cpp
static sd_ctx_t * sd_ctx = nullptr;          // ≈ line 92
static upscaler_ctx_t * upscaler_ctx = nullptr;
static SDParams * sd_params = nullptr;
```

Every call to `sdtype_load_model()` creates a new `SDParams` (heap-allocated) and a
new `sd_ctx_t` via `new_sd_ctx(&params)`, but **neither** the previous `sd_params`
object nor the previous `sd_ctx_t` is freed first.  The old GPU memory for the
diffusion model, VAE, CLIP, and T5-XXL encoders is leaked on each reload.

`free_sd_ctx()` (`otherarch/sdcpp/stable-diffusion.cpp` ≈ line 3356) **already exists**:

```cpp
void free_sd_ctx(sd_ctx_t* sd_ctx) {
    if (sd_ctx->sd != nullptr) {
        delete sd_ctx->sd;
        sd_ctx->sd = nullptr;
    }
    free(sd_ctx);
}
```

This function is declared in `stable-diffusion.h` but is **never called** by
`sdtype_adapter.cpp`.  Adding a call to it (and `delete sd_params`) before
re-initialising is the only C++ change needed.

#### RAM-Offload Capability (Advantage Over LLM)

`sdtype_load_model()` passes `offload_params_to_cpu` to `new_sd_ctx()`.  This is
controlled by `args.sdoffloadcpu` (Python flag `--sdoffloadcpu`, labelled *"Model CPU
Offload"* in the GUI).  When set, `stable-diffusion.cpp` keeps the diffusion model
weights in CPU RAM and copies layers to GPU only during the forward pass
(`offload_params_to_cpu = true`, `keep_vae_on_cpu` and `keep_clip_on_cpu` independently
selectable).

This means that **with `--sdoffloadcpu` enabled, an SD model reload does not require
freeing GPU memory** — only CPU RAM (which is far more abundant) needs to be reallocated.
The swap-in/swap-out is managed internally by ggml; no additional Python change is
needed to exploit this.

#### Changes Required

**C++ layer (`sdtype_adapter.cpp`)**

1. Before creating a new `sd_ctx`, check if one already exists and call `free_sd_ctx()`
   and `delete sd_params` first:

```cpp
// Add at the top of sdtype_load_model(), after existing globals check:
if (sd_ctx != nullptr) {
    free_sd_ctx(sd_ctx);
    sd_ctx = nullptr;
}
if (sd_params != nullptr) {
    delete sd_params;
    sd_params = nullptr;
}
```

2. **Export `sd_unload_model()` from `expose.cpp`** (optional — Step 1 above makes the
   load path self-cleaning, but an explicit unload export allows the Python layer to
   release GPU memory without loading a new model).

**Python layer (`koboldcpp.py`)**

3. In the in-process reload path (Step E above), after `args` is updated, call the
   existing `sd_load_model()` Python function if `args.sdmodel` has changed.  Reset
   the globals:

```python
# Inside _do_reload(), after unloading the LLM:
if args.sdmodel and os.path.exists(args.sdmodel):
    fullsdmodelpath   = os.path.abspath(args.sdmodel)
    friendlysdmodelname = sanitize_string(os.path.splitext(os.path.basename(args.sdmodel))[0])
    loadok = sd_load_model(fullsdmodelpath, ...)  # pass VAE / LORA etc. from args
else:
    fullsdmodelpath   = ""
    friendlysdmodelname = "inactive"
```

---

### Subsystem 2: Voice Transcription (whisper.cpp / `whisper_adapter.cpp`)

#### Current State

`whispertype_load_model()` stores the active context in a static global:

```cpp
static whisper_context * whisper_ctx = nullptr;  // ≈ line 24
```

On every call, `whisper_init_from_file_with_params()` allocates a new context.  The
previous context is **never freed** — `whisper_free(whisper_ctx)` is never called
despite being available in `whisper.h`:

```c
WHISPER_API void whisper_free(struct whisper_context * ctx);
```

Whisper models are typically small (39 MB–1.5 GB) but do hold GPU memory for the
encoder.  A reload without free would double the GPU allocation temporarily.

#### Changes Required

**C++ layer (`whisper_adapter.cpp`)**

1. At the top of `whispertype_load_model()`, free any existing context:

```cpp
if (whisper_ctx != nullptr) {
    whisper_free(whisper_ctx);
    whisper_ctx = nullptr;
}
```

2. Export `whisper_unload_model()` from `expose.cpp` (optional; as with SD, making the
   load path self-cleaning is sufficient).

**Python layer (`koboldcpp.py`)**

3. In the in-process reload path, call `whisper_load_model()` if `args.whispermodel`
   has changed, and reset:

```python
if args.whispermodel and os.path.exists(args.whispermodel):
    fullwhispermodelpath = os.path.abspath(args.whispermodel)
    loadok = whisper_load_model(fullwhispermodelpath)
else:
    fullwhispermodelpath = ""
```

---

### Subsystem 3: Text-to-Speech (`tts_adapter.cpp`)

#### Current State

TTS uses llama.cpp internally, loading two separate model files (text-to-codes and
codes-to-speech).  Like the main text model, both `llama_model` pointers are
**function-local variables**:

```cpp
// ≈ line 612 inside ttstype_load_model()
llama_model * ttcmodel = llama_model_load_from_file(...);
llama_model * ctsmodel = llama_model_load_from_file(...);
```

The corresponding contexts are static globals:

```cpp
static llama_context * ttc_ctx = nullptr;  // ≈ line 475
static llama_context * cts_ctx = nullptr;
```

None of `llama_free(ttc_ctx)`, `llama_free(cts_ctx)`, `llama_model_free(ttcmodel)`, or
`llama_model_free(ctsmodel)` are called before re-loading.  `llama_backend_init()` is
called again on every load (same issue as the main model — it is a call-once function).

For non-llama-based TTS (ttscpp format), the runner (`ttscpp_runner`) is also leaked.

#### Changes Required

These mirror the LLM changes described in the C++ section above:

**C++ layer (`tts_adapter.cpp`)**

1. Promote `ttcmodel` and `ctsmodel` to static globals so they can be freed later.
2. Add a `ttstype_unload_model()` function that calls `llama_free(ttc_ctx)`,
   `llama_free(cts_ctx)`, `llama_model_free(ttcmodel)`, `llama_model_free(ctsmodel)`,
   and resets all static pointers to `nullptr`.  Also clean up `ttscpp_runner` if set.
3. Move `llama_backend_init()` out of `ttstype_load_model()` (or guard it with a static
   flag), consistent with the text model changes.
4. Call `ttstype_unload_model()` at the top of `ttstype_load_model()` if a model is
   already loaded.
5. Export `tts_unload_model()` from `expose.cpp`.

**Python layer (`koboldcpp.py`)**

6. In the in-process reload path, call `tts_load_model()` if `args.ttsmodel` has
   changed, and reset:

```python
if args.ttsmodel and os.path.exists(args.ttsmodel):
    ttsmodelpath = os.path.abspath(args.ttsmodel)
    loadok = tts_load_model(ttsmodelpath, args.ttswavtokenizer)
else:
    ttsmodelpath = ""
```

---

### Subsystem 4: Vector Embeddings (`embeddings_adapter.cpp`)

#### Current State

Embeddings also uses llama.cpp.  The context is a static global:

```cpp
static llama_context * embeddings_ctx = nullptr;  // ≈ line 24
```

The `llama_model` pointer is again function-local (≈ line 130 of
`embeddingstype_load_model()`).  The same three issues apply:

- `llama_free(embeddings_ctx)` and `llama_model_free()` are never called.
- `llama_backend_init()` is called on every load (≈ line 108).
- GPU memory is leaked on each reload.

#### Changes Required

**C++ layer (`embeddings_adapter.cpp`)**

1. Promote the `embeddingsmodel` pointer to a static global.
2. Add `embeddingstype_unload_model()` that calls `llama_free(embeddings_ctx)` and
   `llama_model_free(embeddingsmodel)` and resets pointers.
3. Guard `llama_backend_init()` with a static flag (or remove from this adapter if the
   main text model adapter already owns the backend lifecycle).
4. Call `embeddingstype_unload_model()` at the top of `embeddingstype_load_model()` if
   a model is already loaded.
5. Export `embeddings_unload_model()` from `expose.cpp`.

**Python layer (`koboldcpp.py`)**

6. In the in-process reload path, call `embeddings_load_model()` if
   `args.embeddingsmodel` has changed, and reset:

```python
if args.embeddingsmodel and os.path.exists(args.embeddingsmodel):
    embeddingsmodelpath = os.path.abspath(args.embeddingsmodel)
    loadok = embeddings_load_model(embeddingsmodelpath)
    friendlyembeddingsmodelname = sanitize_string(
        os.path.splitext(os.path.basename(embeddingsmodelpath))[0])
else:
    embeddingsmodelpath = ""
    friendlyembeddingsmodelname = "inactive"
```

---

### Subsystem 5: Music Generation (ACE-Step / `music_adapter.cpp`)

#### Current State — Best-Positioned for In-Process Reload

The music generation backend is the **most advanced** of all subsystems with respect to
in-process memory management.  It already implements full unload/reload internally:

```cpp
// otherarch/acestep/ace-qwen3.cpp ≈ line 1474
void unload_acestep_lm() {
    if (acestep_lm_loaded) {
        acestep_lm_loaded = false;
        qw3lm_free(&acestep_llm);
    }
}

bool load_acestep_lm(std::string model_path, bool lowvram, ...) {
    if (acestep_lm_loaded) { unload_acestep_lm(); }  // self-cleaning!
    ...
}

// otherarch/acestep/dit-vae.cpp ≈ line 596
void unload_acestep_dit_core() { ... dit_ggml_free(&acestep_dit); }
void unload_acestep_dit_others() { ... vae_ggml_free(&vae); ... }

bool load_acestep_dit(...) {
    if (acestep_dit_others_loaded || acestep_dit_core_loaded) {
        unload_acestep_dit_core();
        unload_acestep_dit_others();
    }
    ...
}
```

Furthermore, the `--musiclowvram` flag (`args.musiclowvram`) enables a **runtime RAM
swap** mode where the LLM and diffusion models are swapped to CPU RAM between generation
calls, freeing VRAM when idle.  This is already fully functional:

```cpp
// During generation (ace-qwen3.cpp ≈ line 1696):
if (acestep_lm_lowvram) { unload_acestep_lm(); }
// (dit-vae.cpp ≈ line 950):
if (acestep_dit_lowvram) { unload_acestep_dit_core(); }
```

#### Changes Required

The music backend itself requires **no C++ changes** to support in-process model
switching — it already cleans up before reloading.

The only work is in the Python layer:

**Python layer (`koboldcpp.py`)**

1. In the in-process reload path, call `music_load_model()` if any music model path in
   `args` has changed, and reset the model path globals:

```python
mu_has_llm  = bool(args.musicllm and args.musicllm != "")
mu_has_diff = bool(args.musicdiffusion and args.musicdiffusion != "")
if mu_has_llm or mu_has_diff:
    musicllmpath       = os.path.abspath(args.musicllm) if mu_has_llm else ""
    musicdiffusionpath = os.path.abspath(args.musicdiffusion) if mu_has_diff else ""
    musicembedpath     = os.path.abspath(args.musicembeddings) if args.musicembeddings else ""
    musicvaepath       = os.path.abspath(args.musicvae) if args.musicvae else ""
    loadok = music_load_model(musicllmpath, musicembedpath, musicdiffusionpath, musicvaepath)
    musicdiffusionmodelpath = musicdiffusionpath
    musicllmmodelpath       = musicllmpath
else:
    musicdiffusionmodelpath = ""
    musicllmmodelpath       = ""
```

2. **Recommendation: prioritise music** as the first subsystem to test in-process
   reloading, since the C++ layer is already correct and the risk is minimal.

---

### Subsystem Summary Table

| Subsystem | Source file | `*_free()` exists? | Called on reload? | RAM-offload support | Effort to fix |
|---|---|---|---|---|---|
| **LLM (llama.cpp)** | `gpttype_adapter.cpp` | `llama_free()` / `llama_model_free()` | No | No (use mmap) | High (many statics, backend init) |
| **Image gen (sd.cpp)** | `sdtype_adapter.cpp` | `free_sd_ctx()` ✓ | No | Yes (`--sdoffloadcpu`) | Low (one free call) |
| **Transcription (whisper.cpp)** | `whisper_adapter.cpp` | `whisper_free()` ✓ | No | No | Low (one free call) |
| **TTS** | `tts_adapter.cpp` | `llama_free()` / `llama_model_free()` | No | Via GPU layers (0 = CPU) | Medium (same as LLM) |
| **Embeddings** | `embeddings_adapter.cpp` | `llama_free()` / `llama_model_free()` | No | Via `--embeddingsgpu` (0 = CPU) | Medium (same as LLM) |
| **Music (ACE-Step)** | `music_adapter.cpp` | `qw3lm_free()` / `dit_ggml_free()` ✓ | **Yes ✓** | **Yes** (`--musiclowvram`) | **None** (already correct) |

---

### Recommended Implementation Order

Given the above analysis, the recommended order for implementing in-process reloading
across all subsystems is:

1. **Music** — no C++ changes needed; Python-only; safest starting point.
2. **Image generation** — one `free_sd_ctx()` / `delete sd_params` guard in C++;
   `--sdoffloadcpu` makes VRAM pressure negligible during the reload window.
3. **Transcription (whisper)** — one `whisper_free()` guard; small models, low risk.
4. **Text generation (LLM)** — high effort; many static pointers; dependent on
   `llama_backend_init()` refactor.
5. **TTS / Embeddings** — medium effort; mirror the LLM changes; benefit from GPU-layers
   control (set to 0 for CPU-only, avoiding VRAM contention during reload).

---

### Extended Python-Layer State Reset Checklist

Extending the table from Step E to include all subsystems:

| Global | Reset value (unload) | Updated value (after load) |
|---|---|---|
| `friendlymodelname` | `"inactive"` | `"koboldcpp/" + sanitize_string(basename)` |
| `has_audio_support` | `False` | `handle.has_audio_support()` |
| `has_vision_support` | `False` | `handle.has_vision_support()` |
| `cached_chat_template` | `None` | `handle.get_chat_template()` decoded |
| `maxctx` | `args.contextsize` | set inside `load_model()` from `args` |
| `fullsdmodelpath` | `""` | `os.path.abspath(args.sdmodel)` |
| `friendlysdmodelname` | `"inactive"` | `sanitize_string(basename_no_ext)` |
| `fullwhispermodelpath` | `""` | `os.path.abspath(args.whispermodel)` |
| `ttsmodelpath` | `""` | `os.path.abspath(args.ttsmodel)` |
| `embeddingsmodelpath` | `""` | `os.path.abspath(args.embeddingsmodel)` |
| `friendlyembeddingsmodelname` | `"inactive"` | `sanitize_string(basename_no_ext)` |
| `musicdiffusionmodelpath` | `""` | `os.path.abspath(args.musicdiffusion)` |
| `musicllmmodelpath` | `""` | `os.path.abspath(args.musicllm)` |
| `global_memory["load_complete"]` | `False` | `True` when all models ready |
| `global_memory["currentModel"]` | `None` | `args.model_param` |
| `global_memory["currentConfig"]` | updated | updated |

Capability flags derived from these globals (`has_txt2img`, `has_whisper`, `has_tts`,
`has_music`, `has_embeddings`) are computed dynamically in `get_capabilities()` / the
`/api/extra/version` handler — they do not need to be reset directly.

---

## Two Types of Model Unloading

The previous sections treat "unloading" as a single concept: free all resources and either
reload a different model or remain in a no-model state.  In practice there are **two
distinct operations** with different trade-offs:

| | **Type 1: Full Unload** | **Type 2: Park to RAM** |
|---|---|---|
| VRAM freed? | Yes | Yes |
| CPU RAM freed? | Yes | No — weights kept in RAM |
| Inference possible? | No | **No (explicitly blocked)** |
| Restore to active | Full cold load from disk | VRAM re-allocation + RAM→VRAM copy (faster) |
| Disk I/O on restore | Yes | No (already in RAM) |
| Use case | Permanent model change / free all memory | Temporarily yield GPU to another model |

The requirement is that a **parked model must not accept inference requests** — it merely
waits in RAM ready for rapid restoration.  This is the key distinction from the existing
load-time RAM-offload flags (`--sdoffloadcpu`, `--musiclowvram`), which keep weights in
RAM but still allow inference through automatic per-request GPU swapping.

---

### State Machine

Each model slot can be in one of three states:

```
              park_to_ram()              unpark()
  ┌──────────────────────────┐   ┌──────────────────────────┐
  │                          ▼   │                          │
[Active]  ──park──▶  [Parked (RAM)]  ──unpark──▶  [Active]
  │                          │
  │ full_unload()            │ full_unload()
  ▼                          ▼
[Unloaded]  ◀──────────────────────────────────────────────
  │
  └──── load_model() ──▶  [Active]
```

Transitions:
- **Active → Parked**: release VRAM, block inference, retain weights in CPU RAM.
- **Active → Unloaded**: release both VRAM and RAM entirely.
- **Parked → Active**: reallocate VRAM, copy RAM→VRAM, unblock inference.
- **Parked → Unloaded**: free remaining CPU RAM.
- **Unloaded → Active**: full cold load from disk (same as current "load_model").

---

### Distinction from Existing Load-Time RAM Flags

The existing flags that keep weights in RAM were designed as **permanent load-time
settings**, not runtime state transitions:

| Flag / Mode | Where configured | Inference allowed? | When to use |
|---|---|---|---|
| `--sdoffloadcpu` | load time (`args.sdoffloadcpu`) | **Yes** — auto-swap per request | Low-VRAM machines where SD is always active |
| `--musiclowvram` | load time (`args.musiclowvram`) | **Yes** — reload from disk between requests | Music generation on VRAM-constrained setups |
| **Park to RAM (new)** | runtime API command | **No** — 503 returned | Temporarily freeing GPU for another model |

The park/unpark feature is orthogonal: it is an administrative command issued at runtime
that suspends a model, regardless of whether that model was originally loaded with or
without a RAM-offload flag.

---

### Python-Layer Implementation for Park / Unpark

A new Python global (per subsystem) tracks the parked state.  It is checked at the top
of every inference handler before acquiring `modelbusy`:

```python
# New globals in koboldcpp.py
llm_parked      = False  # text generation model
sd_parked       = False  # image generation model
whisper_parked  = False  # transcription model
tts_parked      = False  # TTS model
embeddings_parked = False  # embeddings model
music_parked    = False  # music generation model
```

An early-exit guard is inserted in each relevant handler:

```python
def perform_park_to_ram(subsystem: str):
    """Park the named subsystem model, freeing VRAM while retaining weights in RAM."""
    global llm_parked, sd_parked, ...
    if subsystem == "llm":
        handle.abort_generate()
        with modelbusy:
            _park_llm()
        llm_parked = True
    elif subsystem == "sd":
        _park_sd()
        sd_parked = True
    # ... etc.

def perform_unpark(subsystem: str):
    """Restore a parked model back to VRAM."""
    global llm_parked, sd_parked, ...
    if subsystem == "llm":
        _restore_llm_to_vram()
        llm_parked = False
    elif subsystem == "sd":
        _restore_sd_to_vram()
        sd_parked = False
```

Inference endpoints return `503 Model Parked` when the relevant flag is set:

```python
# Example guard inside the generation handler
if llm_parked:
    self.send_response(503)
    self.wfile.write(json.dumps({
        "detail": {
            "msg": "Text generation model is parked in RAM. Use /api/admin/unpark to restore.",
            "type": "model_parked",
        }
    }).encode())
    return
```

A new admin endpoint pair is added:

- `POST /api/admin/park?subsystem=<name>` — transitions the named subsystem to Parked.
- `POST /api/admin/unpark?subsystem=<name>` — transitions the named subsystem back to Active.

Subsystem names: `llm`, `sd`, `whisper`, `tts`, `embeddings`, `music`.

---

### Per-Subsystem: Park-to-RAM Feasibility

---

#### Subsystem 1: Text Generation (LLM — llama.cpp)

**Dynamic VRAM→RAM tensor migration**: Not available in llama.cpp's public API.  There
is no `llama_model_push_to_cpu()` or equivalent.  The `n_gpu_layers` parameter is
set at model-load time and cannot be changed on a live `llama_model`.

**Best approximation — sequential re-load to CPU**:

The park operation for the LLM subsystem is a two-step process:

1. **Free VRAM**: call `gpttype_unload_model()` (Step 2 in the C++ changes section).
   This frees the `llama_context`, `llama_model`, clip contexts, and thread pools from
   VRAM.  After this step no GPU memory is held.
2. **Retain in RAM via mmap**: re-invoke `gpttype_load_model()` immediately with
   `n_gpu_layers = 0` and `use_mmap = true`.  With mmap enabled, llama.cpp maps the
   GGUF file into the process's virtual address space.  The OS page cache then retains
   the file contents in RAM — no VRAM is allocated.  The inference path is blocked by the
   `llm_parked` flag, so no forward pass is attempted.

**Quick-restore advantage**: On unpark, reloading with the original `n_gpu_layers`
benefits from the OS file cache.  If the GGUF file is still in the page cache (which is
likely if it was just mmap'd), the GPU tensor upload is substantially faster than a
cold load, since the OS does not need to read from disk.

**Steps required**:

- C++: the same `gpttype_unload_model()` function used for full unload also handles Step 1.
- Python:
  ```python
  def _park_llm():
      handle.unload_model()           # Step 1: free VRAM and all contexts
      _save_llm_args()                # remember current n_gpu_layers etc.
      args_copy = copy.deepcopy(args)
      args_copy.gpulayers = 0         # Step 2: reload with CPU-only
      args_copy.use_mmap = True       # keep file in OS page cache
      _load_model_from_args(args_copy)

  def _restore_llm_to_vram():
      handle.unload_model()           # free CPU-only model
      _load_model_from_args(args)     # reload with original n_gpu_layers
  ```

**Limitation**: the park round-trip requires two full model loads (unload → CPU load →
unload → GPU load).  On restore, the file is already mmap'd (likely still in the page
cache), so the GPU load should be faster than a cold start, but it is not instant.

---

#### Subsystem 2: Image Generation (sd.cpp)

**Dynamic VRAM→RAM tensor migration**: **Fully supported** via the existing
`GGMLRunner` mechanism in `ggml_extend.hpp`.  When a model is loaded with
`offload_params_to_cpu = true`, the `GGMLRunner` maintains two ggml contexts:
`params_ctx` (CPU RAM) and `offload_ctx` (a mirror for VRAM upload).  At the start of
each `compute()` call, `offload_params_to_runtime_backend()` allocates VRAM and
copies RAM→VRAM; after compute, `offload_params_to_params_backend()` copies back and
frees VRAM.

This means **the RAM-park end-state already exists** when `--sdoffloadcpu` is used: the
weights live in `params_ctx` (CPU buffer) and VRAM is only held during an active
generation.

**Park operation (two cases)**:

*Case A — Model loaded with `--sdoffloadcpu`*:
- Weights are already in CPU RAM (`params_backend = CPU`).
- If no generation is currently active, `params_on_runtime_backend == false`, meaning no
  VRAM is held at all.
- Park = set `sd_parked = true` (prevents `compute()` from being reached).
- Zero additional C++ work needed; the desired RAM-park state is the model's normal
  resting state in this mode.

*Case B — Model loaded without `--sdoffloadcpu` (weights in VRAM)*:
- A dynamic move from VRAM to RAM requires new C++ code: allocate a CPU ggml buffer,
  iterate over all model `GGMLRunner` instances, copy each tensor from `params_backend`
  (GPU) to a CPU buffer, then free the GPU `params_buffer`.
- This is non-trivial because `sd_ctx_t` contains several independent `GGMLRunner`
  instances (diffusion model, VAE, CLIP encoders, T5).
- **Recommended approach**: reload with `offload_params_to_cpu = true` (identical to
  Case A) — free the GPU-loaded context and load a new one in CPU mode.  This is one
  extra load but produces a correctly parked context.

**Unpark operation** (both cases, if loaded via Case A or after Case B conversion):
- Clear `sd_parked`.
- Inference resumes; on the next `compute()` call, `offload_params_to_runtime_backend()`
  automatically allocates VRAM and copies weights — no explicit "restore" step needed.
- First-inference latency is slightly higher (tensor copy time), but subsequent
  inferences do not pay this cost because they reuse the in-RAM buffer.

**Summary for SD**:

| Scenario | Park mechanism | Unpark mechanism | VRAM during park |
|---|---|---|---|
| Loaded with `--sdoffloadcpu` | Set `sd_parked = true` | Clear `sd_parked` | Zero |
| Loaded without `--sdoffloadcpu` | Reload with `offload_params_to_cpu=true` + set `sd_parked` | Clear `sd_parked` | Zero |

---

#### Subsystem 3: Voice Transcription (whisper.cpp)

**Dynamic VRAM→RAM migration**: Not available.  `whisper_context_params.use_gpu` is a
load-time setting.

**Park operation**: reload with `use_gpu = false`.
- `whisper_init_from_file_with_params()` accepts `cparams.use_gpu = false` which places
  all encoder tensors in CPU RAM.
- The model file is small (39 MB – 1.5 GB), so the reload is fast regardless.
- Set `whisper_parked = true` after the CPU reload.

**Unpark operation**: reload with `use_gpu = true`.
- If the Whisper model file is still in the OS page cache (very likely given the small
  file size), the GPU load will be faster than a cold start.
- Clear `whisper_parked`.

**C++ required**:
- Add the `whisper_free()` guard to `whispertype_load_model()` (as covered in the
  subsystem analysis section) so that the park re-load does not leak the old context.

---

#### Subsystem 4: Text-to-Speech (tts_adapter.cpp)

**Dynamic VRAM→RAM migration**: Not available (llama.cpp-based, same as LLM).

**Park operation**:
- Call `ttstype_unload_model()` (new function, described in the subsystem section).
- Reload with `n_gpu_layers = 0` (CPU-only mode, i.e., `args.ttsgpu = False`).
- Set `tts_parked = true`.

**Unpark operation**:
- Call `ttstype_unload_model()` to free the CPU-only instance.
- Reload with original `ttsgpu` setting.
- Clear `tts_parked`.

**Note**: TTS models (OuteTTS, Parler-TTS) are relatively small (≤ 5 GB), so the
sequential unload/reload cycle is fast.  Since `use_mmap = true` is typical for
llama-based models, the file stays in the OS page cache.

---

#### Subsystem 5: Vector Embeddings (embeddings_adapter.cpp)

**Dynamic VRAM→RAM migration**: Not available (llama.cpp-based, same as LLM).

**Park operation**:
- Call `embeddingstype_unload_model()` (new function).
- Reload with `gpulayers = 0` (CPU-only; `args.embeddingsgpu = False`).
- Set `embeddings_parked = true`.

**Unpark operation**:
- Call `embeddingstype_unload_model()` to free CPU instance.
- Reload with original `embeddingsgpu` setting.
- Clear `embeddings_parked`.

**Note**: Embedding models are typically 100 MB – 2 GB.  CPU inference for embeddings is
acceptable in most use cases, but the `embeddings_parked` flag prevents any inference
during the parked state so the CPU-loaded model is never actually used for computation.

---

#### Subsystem 6: Music Generation (ACE-Step)

**Current `--musiclowvram` behaviour (not a true park)**:

The `lowvram` flag causes the LM and DiT components to be **fully unloaded after each
generation** and reloaded from disk before the next:

```cpp
// ace-qwen3.cpp ≈ line 1696 (after generation):
if (acestep_lm_lowvram) { unload_acestep_lm(); }   // qw3lm_free() — disk reload next time
// dit-vae.cpp ≈ line 950:
if (acestep_dit_lowvram) { unload_acestep_dit_core(); }
```

This is a **disk-reload pattern**, not a RAM-park: the model files must be read from
disk on the next generation.  It frees VRAM but does not keep weights in RAM between
requests.

**Dynamic VRAM→RAM migration**: The music backend uses its own `backend_init()` which
always picks the best available GPU backend (`ggml_backend_init_best()`).  There is no
built-in CPU-fallback equivalent for the LM or DiT components at runtime.

**True RAM park — two approaches**:

*Approach A — Suspend after the next `lowvram` unload*:
- Enable `lowvram` mode, allow the next generation to complete, then set `music_parked = true`.
- After the post-generation unload, VRAM is free and no weights are in memory.  This is
  effectively a full unload followed by a parked label — not a true RAM park.
- Advantage: no new C++ code required.

*Approach B — Reload to CPU backend*:
- Add a `cpu_only` parameter to `load_acestep_lm()` and `load_acestep_dit()`.
- When `cpu_only = true`, pass `GGML_BACKEND_DEVICE_TYPE_CPU` to
  `ggml_backend_init_by_type()` instead of `ggml_backend_init_best()`.
- This loads both components into CPU RAM.  Inference is blocked by `music_parked`.
- On unpark, free the CPU-loaded models and reload with GPU backend.
- This is the true RAM-park for music and provides a faster restore than Approach A
  (RAM→GPU copy vs. disk read).
- C++ effort: medium (modify `backend.h`'s `backend_init()` to accept a CPU-only flag,
  thread it through `load_acestep_lm/dit()` parameters).

**Recommendation**: implement Approach B alongside the park-to-RAM feature for other
subsystems.  The ACE-Step backend already has the cleanest unload/reload infrastructure,
so adding a CPU-fallback mode is straightforward.

---

### Updated Subsystem Summary Table

| Subsystem | Full unload support | Dynamic park-to-RAM | Best park mechanism | Quick restore? |
|---|---|---|---|---|
| **LLM (llama.cpp)** | Via `gpttype_unload_model()` (new) | No — sequential reload | Unload + CPU reload (`n_gpu_layers=0`, mmap) | Partial (mmap file cache) |
| **Image gen (sd.cpp)** | Via `free_sd_ctx()` (one guard) | **Yes** — when loaded with `--sdoffloadcpu` | Set `sd_parked` flag; no tensor move | **Yes** — first-inference GPU swap |
| **Transcription (whisper)** | Via `whisper_free()` (one guard) | No — load-time choice | Unload + CPU reload (`use_gpu=false`) | Fast (small file, page cache) |
| **TTS** | Via `ttstype_unload_model()` (new) | No — sequential reload | Unload + CPU reload (`n_gpu_layers=0`) | Partial (mmap file cache) |
| **Embeddings** | Via `embeddingstype_unload_model()` (new) | No — sequential reload | Unload + CPU reload (`gpulayers=0`) | Partial (mmap file cache) |
| **Music (ACE-Step)** | Via `unload_acestep_lm/dit()` (exists) | Partial — Approach A (disk-reload after lowvram) | Approach B: CPU backend reload | Approach B: yes (RAM→GPU copy) |

---

### Behaviour While Parked

When a subsystem is parked:

1. **Inference requests are refused with `503`** and a `"model_parked"` type in the
   error detail.  This applies to all endpoints that use the parked subsystem (e.g.,
   `/api/generate` for LLM, `/sdapi/v1/txt2img` for SD, `/api/extra/tts` for TTS).

2. **Status endpoints continue to work**.  The `/api/extra/version` and
   `/api/v1/model` endpoints report the model name but add `"parked": true` to the
   response JSON.

3. **Capability flags are updated**: `has_txt2img`, `has_llm`, `has_tts`, etc. return
   `false` while the corresponding subsystem is parked, so clients do not attempt
   inference.

4. **Memory queries** (`/api/extra/perf`) reflect the freed VRAM, allowing callers to
   verify that the park operation succeeded before loading a new model.

5. **Only one subsystem needs to be parked at a time** for the GPU-sharing use case;
   multiple subsystems can be parked simultaneously if needed.

---

### Updated Python-Layer State Reset Checklist

The following table is extended with park-state columns:

| Global | Full-unload value | Parked value | Active (loaded) value |
|---|---|---|---|
| `friendlymodelname` | `"inactive"` | model name (unchanged) | `"koboldcpp/" + sanitize_string(basename)` |
| `llm_parked` | `False` | **`True`** | `False` |
| `has_audio_support` | `False` | `False` | `handle.has_audio_support()` |
| `has_vision_support` | `False` | `False` | `handle.has_vision_support()` |
| `cached_chat_template` | `None` | `None` (no inference) | `handle.get_chat_template()` decoded |
| `maxctx` | `args.contextsize` | `args.contextsize` | set inside `load_model()` |
| `fullsdmodelpath` | `""` | path retained | `os.path.abspath(args.sdmodel)` |
| `friendlysdmodelname` | `"inactive"` | model name (unchanged) | `sanitize_string(basename_no_ext)` |
| `sd_parked` | `False` | **`True`** | `False` |
| `fullwhispermodelpath` | `""` | path retained | `os.path.abspath(args.whispermodel)` |
| `whisper_parked` | `False` | **`True`** | `False` |
| `ttsmodelpath` | `""` | path retained | `os.path.abspath(args.ttsmodel)` |
| `tts_parked` | `False` | **`True`** | `False` |
| `embeddingsmodelpath` | `""` | path retained | `os.path.abspath(args.embeddingsmodel)` |
| `embeddings_parked` | `False` | **`True`** | `False` |
| `musicdiffusionmodelpath` | `""` | path retained | `os.path.abspath(args.musicdiffusion)` |
| `music_parked` | `False` | **`True`** | `False` |
| `global_memory["load_complete"]` | `False` | `True` (server alive) | `True` |

Note: model name globals (`friendlymodelname`, `fullsdmodelpath`, etc.) are **retained**
in the parked state — the model is still registered, it is just suspended.  This allows
clients to display the model name and park status without reloading metadata.
