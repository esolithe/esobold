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
threads do **not** need to be reset — they persist across model reloads.
