# Esobold (Esolithe's fork of KoboldCPP)

![Kobold](https://github.com/user-attachments/assets/f5cb4087-bc72-47fc-91a5-29a4d6495648)

Welcome all, this fork focuses on enhanced remote management, server saving and integration in KoboldCPP and Kobold Lite.  Release can be found [here](https://github.com/esolithe/esobold/releases).

It offers the following functionalities:
- Config reloading (Cedo's implementation) enhanced with an option to select a text model to override the config (useful to switch between models using a generic "8B" or "12B" config without needing one for each model).  There is also helper text in Lite to show you the current config and model in use, along with a waiting mechanism to only reload when it's ready.

![411112504-e4d6936f-234f-40d8-8bfe-578c4332089d](https://github.com/user-attachments/assets/de7d4105-ffdd-40c3-bc0e-26041b6ded36)
- Support for downloading models from HF through the UI (based on Cedo's implementation for the launcher) - To use this please tick the box under the admin tab in the launcher, and also ensure you run the exe from the directory where you store your models.

![e5c0d32a-d68f-4c8a-87f7-bdfade892c4f](https://github.com/user-attachments/assets/e5c0d32a-d68f-4c8a-87f7-bdfade892c4f)
![bda67a48-bc40-4815-8628-873c3136a415](https://github.com/user-attachments/assets/bda67a48-bc40-4815-8628-873c3136a415)

- Save / load from server - with or without admin password: It is possible to store saves, scenarios, character cards, lorebooks etc.  The difference with the main KCPP is this option integrates with the scenerio search, offers the ability to upload multiple types of content and does not limit the amount of save uploaded.  Both options can be used together if desired.

![413011334-de6d3101-5621-4c47-a45b-d71f1b436cce](https://github.com/user-attachments/assets/098f64c6-9f6e-4951-b4a9-b4b458ddb7d8)
- Data on the server can be assigned a thumbnail

![418191433-72b95f51-7868-4a4b-bb50-e92605e1a13c](https://github.com/user-attachments/assets/8618d216-42d8-4c34-a859-5c4a1e809136)
![413011254-30449652-2292-406c-8d27-bc04d2389a38](https://github.com/user-attachments/assets/63c3f6af-8695-4d4f-92b1-654ccf006fb4)
- Server save data can be accessed in the scenarios tab (allowing searching by types and names)

![418191036-d773e536-6c09-4b76-828e-6e542e075f0e](https://github.com/user-attachments/assets/81dfea9f-9862-4b52-ba3d-92472a1b758c)
![418190669-f839ed18-0fb9-4319-82d8-03952c5d3f20](https://github.com/user-attachments/assets/2ee0c202-8f68-44d6-aa6f-18ae35f33857)

- Agent thinking (based on prompts from this cool project [here](https://github.com/Wladastic/mini_autogpt))
- Improvements to TextDB, such as VectorDB (embedding) support and document support (including upload of text documents, PDFs (Vic49 / SevenOf9 wrote the parser), OCR using the vision model loaded, and transcription from audio)
- Export / Import of WI groups from files

![8d3e3a9d-08e0-4caf-9ad8-c2d806fec7e0](https://github.com/user-attachments/assets/8d3e3a9d-08e0-4caf-9ad8-c2d806fec7e0)

- Addition of [BlackLite-Tools](https://github.com/PeterPeet/BlackLite-Tools/tree/BlackLite-UICustomizationTool) by Peter for UI styling with a few UX tweaks (open / close tool, saving of themes through reloads, autoload of last theme on opening etc) - this can be found under the advanced settings

## Agent thinking mode (experimental)

An attempt to replicate tool usage / agent logic in Lite.  Essentially, the AI is provided the user input and a list of tools that it can use.  Should work on all UI modes for instruct, along with supporting chat names.

The currently supported options include:
- Sending messages / Asking for additional user input (including AI suggested options like a text adventure)

![c46ce852-8d04-4451-a27e-7eb2cd1ab462](https://github.com/user-attachments/assets/c46ce852-8d04-4451-a27e-7eb2cd1ab462)

- Searching the web

![image](https://github.com/user-attachments/assets/1b5d066c-f71a-4b07-8e92-8a88870ed892)

- Evaluating mathematical formulas
- Rolling dice (can be used for random generation)
![image](https://github.com/user-attachments/assets/91529033-6a21-4cc3-a0c2-730fb68a99af)

- Generating images at different aspect ratios (in KCPP) - Both from text and another image
![image](https://github.com/user-attachments/assets/39bc5433-54f2-4c9e-8422-9e20d4383b71)
![image](https://github.com/user-attachments/assets/97bef072-06d9-47a1-8066-2bcb5c20bc6f)
- Analysing images (in KCPP)
- "Speaking" through TTS (in KCPP)
- Adding data to the TextDB and searching for information in it, along with the chat log
- Knowing the current date
- Enabling a word count on the AI responses
- Supports system prompts, both using and setting it automatically
- Supports setting a "state" parameter which is always inserted at the end of the text.  It is also possible to define the format that the response must use (i.e. {health: 10, mana: 20...})
- Support enforcing a specific action order (i.e. the agent can be set to always roll a dice, then send a response)
- Support for manually preventing the agent from taking specific actions:

```
[DOCUMENT BREAK][Forbidden agent commands]ask_user|roll_dice[DOCUMENT BREAK]
```

- Support for randomly selecting elements from a list of items.  The lists can be defined in the TextDB with:

```
[DOCUMENT BREAK][Table:Genres]Action Fantasy
Horror[DOCUMENT BREAK]
```

- Support for automatically switching models and configs for agent tasks (image gen, image analysis, speech etc) - the text should be "command name::config file::model file".  Multiple overrides can be stored by using "|" to separate them.

```
[DOCUMENT BREAK][Agent config overrides]send_message::12b.kcpps[DOCUMENT BREAK]
```

A full list of the names for enabled commands can be found with the command below in the browser console:

```
getEnabledCommands().map(c => c.name)
```

Using this function requires the following conditions to be met:
- Use an instruct model
- Use separate start and end tags for all roles (tick the option under the instruct settings and ensure they are all filled out, like ChatML)
- Ensure that if you wish the AI to use web searching, TTS or image gen that the respective options are configured and enabled in the UI

## Improvements to TextDB (probably will be upstreamed in the future)
- UI improvements

![image](https://github.com/user-attachments/assets/94b0f24e-360e-4c66-8d40-8b9185117902)
- Importing of lorebooks from the load button as Text DB entries
- Support for ```[DOCUMENT BREAK][Name of document]This is the content of the document``` which allows for user defined groupings of sections
- Support for embedding models running in KCPP - Embeddings are generated on the server based on the text DB content, and then stored in the browser (notification indicates progress - can take some time).

![image](https://github.com/user-attachments/assets/41ec4f1c-5698-4ef3-ba7c-6998cbc1d8f3)

- Upload document support (including upload of text documents, lorebooks, PDFs (Vic49 / SevenOf9 wrote the parser), OCR using the vision model loaded, and transcription from audio)
- Export / Import of WI groups from files
- Addition of search query and chunk prefix support

## Running the fork

Most of the settings are identical to KoboldCPP, but there's a couple of additional options to note in the launcher (admin tab) - admin must be enabled for these to work:
- Model directory: A folder with text model GGUFs you wish to allow switching between - this is an override on top of using a config, so please ensure a config directory is set as well.
- Data directory: A folder server side data is stored (for example saves, character cards etc).

![411112726-0ae7fed6-3baf-43fd-a1d6-bab52319a6ee](https://github.com/user-attachments/assets/8e80b8a3-11fc-4aa0-b4c8-5a9feacf02cb)

If you prefer the arguments:
- To turn on remote management: --admin
- To set a management password: --adminpassword "..."
- To set the reloadable configs directory --admindir "..."
- To set the reloadable models directory (overriding the config model): --admintextmodelsdir "..."
- To sets the data storage directory (where the database storing server side saves are stored): --admindatadir "..."

## User guide

Open **Guide** in the Lite top bar for the native, source-backed Esobold guide.
It covers connections, Library/Quick Start and saving, context/TextDB, story
branches, sampling, media, editors, filesystem operations, agents and all 80
built-in tool definitions, macros, OpenLumara, WebContainer, MCP, remote
administration, themes, mods and browser APIs.

Chapter content is organized by functional area under
[`embd_res/js/docs`](embd_res/js/docs/README.md). The renderer remains in
`esoGuide.js`; the original chapter IDs, saved position and mod-guide tabs are
preserved. Long chapter lists and articles scroll independently, including on
narrow screens.

The [source coverage manifest](embd_res/js/docs/source-map.json) records the 301
existing JavaScript files reviewed at the pinned source revision, distinguishes
first-party modules from bundled dependencies, and identifies the correct
Concedo/KoboldCpp comparison baseline.

---

# KoboldCpp: Run local AI models with a built-in web UI

KoboldCpp is free and open-source software for running GGUF large language models (LLMs) on your own computer. Chat with an AI assistant, write stories, roleplay, or connect other apps to a local API. KoboldCpp runs on CPU or GPU and also includes text, image, video, speech and music generation with compatible models, an integrated agent, a bundled KoboldAI Lite WebUI, and many additional powerful features.

Inspired by **KoboldAI** and built on **llama.cpp**

One executable file, no installation required. Ready-to-run downloads are available for Windows, Linux, and macOS.

**[Download KoboldCpp](https://github.com/LostRuins/koboldcpp/releases/latest) | [Documentation and FAQ](https://github.com/LostRuins/koboldcpp/wiki) | [API reference](https://lite.koboldai.net/koboldcpp_api) | [Discord community](https://koboldai.org/discord)**

![Integrated Web UI](media/preview.png)
![Roleplay Chat Mode](media/preview2.png)
![GUI Launcher](media/preview3.png)
![Messenger Chat Mode](media/preview4.png)
![Image Generation UI](media/preview5.png)
![Assistant UI](media/preview6.png)

## Features
- **Local text generation:** Run any GGUF language model to generate text in chat, adventure, instruct, or story writing modes. Compatible vision models also support image understanding.
- **Image generation and editing:** Supports Stable Diffusion 1.5, SDXL, SD3, Flux, Qwen Image, Ideogram, Z-Image, Klein, Krea2 and more.
- **Video generation:** Supports WAN 2.2, LTX2.3, MiniMax H3 and more.
- **Voice recognition:** Speech-to-text with Whisper, and multimodal audio from Gemma4 E2B and E4B.
- **Speech generation:** Text to speech with Qwen3TTS, Kokoro, OuteTTS, Parler, and Dia.
- **Music generation:** ACE Step 1.5 and ACE Step XL.
- **Tools and agents:** MCP server support, tool calling, web search, retrieval-augmented generation (RAG) through TextDB, and an integrated KoboldCpp Agent for writing and editing code, running programs, and scheduling tasks.
  - To start the agent, select **Launch KoboldCpp Agent** in the launcher's **Admin** tab, or add `--agent` to your launch command.
- **Writing and roleplay tools:** Bundled KoboldAI Lite WebUI includes multiple UI themes, editing tools, memory, world info, author's notes, characters, scenarios, and persistent story saves. Import Tavern character cards and other supported formats from file or external sites. Also includes the classic llama.cpp WebUI.
- **App integrations:** Compatible endpoints for KoboldAI, OpenAI, Ollama, A1111/Forge, ComfyUI, Whisper transcription, XTTS, and OpenAI speech clients. See [APIs and integrations](#apis-and-integrations).
- **Fully Portable** - Single standalone executable for Windows, Linux or macOS, with no installation required and no external dependencies. Runs on CPU or GPU, with full or partial offloading. Can also run on Colab, Docker, also supports other platforms if self-compiled (like Android via Termux and Raspberry PI).

## Phishing Scam Alert ⚠️
- Phishing SCAM Warning: `koboldcpp.com` is a malicious fake site and is not affiliated with this project. You should **ONLY** trust official downloads from the release binaries on the official github at https://github.com/LostRuins/koboldcpp/releases/latest

## Quick start
1. **Download KoboldCpp** for your operating system from the [latest KoboldCpp release](https://github.com/LostRuins/koboldcpp/releases/latest). See the [platform instructions](#download-and-run) below for help choosing a file.
2. **Download a GGUF text model.** Models are separate from the software. If unsure, start with the [example models](#obtaining-a-gguf-model), or open **Get Help** and pick from **Newbie Templates** in the launcher for an easy setup.
3. **Open KoboldCpp** and select your model in the **GGUF Text Model** field. Choose hardware settings suited to your computer. Generally the defaults should work, see [GPU and performance settings](#troubleshooting-and-improving-performance) if needed.
    - Need help launching? See the [platform instructions](#download-and-run).
    - A dedicated GPU is optional; the model size and context length determine how much memory you need.
4. **Click Launch** and wait for the model to load. Keep KoboldCpp running while you use it.
5. **Connect to the Web UI** in your browser once ready at http://localhost:5001

## Download and Run
You should choose the correct KoboldCpp executable from the **Assets** section of the [latest KoboldCpp release](https://github.com/LostRuins/koboldcpp/releases/latest). Here are direct links and a quick overview for each supported platform. Models must be [obtained separately](#obtaining-a-gguf-model)

### Windows
- Download **[`koboldcpp.exe`](https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp.exe)** and double-click it to open the launcher.
- If you do not need NVIDIA CUDA support, **[`koboldcpp-nocuda.exe`](https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp-nocuda.exe)** is a smaller download with CPU and Vulkan support.
- If you're using a PC with an older CPU or GPU, try **[`koboldcpp-oldpc.exe`](https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp-oldpc.exe)** if you encounter compatibility issues.
- KoboldCpp can also be run using the command line, for example `koboldcpp.exe --model "C:\Models\model.gguf"` For more info, please check `koboldcpp.exe --help`
- One liner setup for windows:
```
cmd /c "curl -fLo koboldcpp.exe https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp.exe && koboldcpp.exe"
```

### Linux
- Download **[`koboldcpp-linux-x64`](https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp-linux-x64)** for an x86-64 Linux system. Make it executable with `chmod +x koboldcpp-linux-x64`, then launch it from a terminal in the download folder with `./koboldcpp-linux-x64`.
- Use **[`koboldcpp-linux-x64-nocuda`](https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp-linux-x64-nocuda)** if you do not need CUDA, or try **[`koboldcpp-linux-x64-oldpc`](https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp-linux-x64-oldpc)** for older hardware. Substitute that filename in the commands above.
- For command-line usage see `./koboldcpp-linux-x64 --help`, models can be loaded directly with `./koboldcpp-linux-x64 --model /path/to/model.gguf`
- For other hardware or distributions that cannot run the binaries, see [building from source](#compiling-koboldcpp-from-source-code).
- One liner setup for linux:
```
curl -fLo koboldcpp-linux-x64 https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp-linux-x64 && chmod +x koboldcpp-linux-x64 && ./koboldcpp-linux-x64
```

### macOS
- Download **[`koboldcpp-mac-arm64`](https://github.com/LostRuins/koboldcpp/releases/latest/download/koboldcpp-mac-arm64)** for an Apple Silicon (M-series) ARM64 Mac. Make it executable with `chmod +x koboldcpp-mac-arm64`, then launch it from a terminal in the download folder with `./koboldcpp-mac-arm64`.
- If macOS blocks the app, follow [Apple's instructions to whitelist it in security settings](https://support.apple.com/en-us/102445) under **System Settings** and **Privacy & Security**. A [macOS launch walkthrough](https://youtube.com/watch?v=NOW5dyA_JgY) is also available.
- For command-line usage see `./koboldcpp-mac-arm64 --help`, models can be loaded directly with `./koboldcpp-mac-arm64 --model /path/to/model.gguf`
- Intel Macs require a [source build](#compiling-koboldcpp-from-source-code).

### Android and other platforms
Android users can [install through Termux](#compiling-on-android-termux-installation). Source builds also support platforms such as OpenBSD and Raspberry Pi, see the [build instructions](#compiling-koboldcpp-from-source-code) and [KoboldCpp wiki](https://github.com/LostRuins/koboldcpp/wiki).

## Other ways to run KoboldCpp

### External providers without a local model
- KoboldCpp allows connecting the web UI directly with a supported external AI provider instead of using a local model. Currently, AI Horde, OpenAI Compatible, Anthropic, OpenRouter, Gemini, Grok, Mistral are among the supported services.
- To connect, start with `--nomodel` or select **Allow Launch Without Models** in the launcher's **Loaded Files** tab. Alternatively, you can also use the [online KoboldAI Lite WebUI](https://lite.koboldai.net) directly.

### Cloud GPUs and public demo
- **Run on Google Colab:** Use the [official KoboldCpp Colab GPU Notebook](https://colab.research.google.com/github/LostRuins/koboldcpp/blob/concedo/colab.ipynb). This is an easy way to get started without installing anything in a minute or two. Your usage must comply with Colab's terms.
- **Run on RunPod:** Cloud rental GPUs with variable prices. Launch the [KoboldCpp RunPod image](https://koboldai.org/runpodcpp), or try [SimplePod](https://koboldai.org/simplepod) for smaller models.
- **Public demo:** Try the [KoboldCpp HuggingFace Space](https://koboldai-koboldcpp-tiefighter.hf.space/). Please be considerate of this free shared service.

### Docker
- Caution: The [official KoboldCpp Docker image](https://hub.docker.com/r/koboldai/koboldcpp) is intended for experts only, primarily for cloud GPU rentals. It uses an x86-64 Ubuntu environment internally and expects an NVIDIA or AMD GPU.
- Docker may perform poorly on some Windows or macOS setups, and ARM systems may fail to run it. CPU feature detection can also incorrectly select slower fallback binaries on some systems.
- For local use, you're recommended to start with the [prebuilt binaries](#download-and-run).

## Obtaining a GGUF model
KoboldCpp does not include model files. For local text generation, huggingface.co hosts many GGUF models, including [Bartowski's model collection](https://huggingface.co/bartowski). Image generation, music and audio features use their own model files and settings, and CivitAI has a good source of image models. Start with a smaller model if you are unsure what your computer can run. **Alternatively, click 'Get Help' in the GUI launcher and browse the 'Newbie Templates' (recommended)**

KoboldCpp also retains backward compatibility with legacy GGML `.bin` models, though some newer features may be unavailable.

- General Text Generation: [Qwen3-VL-8B](https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3-VL-8B-Instruct-Q4_K_S.gguf) **(Most Recommended, best all rounder model)**
  - Add [optional Qwen3-VL-8B MMproj file](https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-GGUF/resolve/main/mmproj-BF16.gguf) for vision recognition capabilities.
- Creative Writing and Roleplay: [L3-8B-Stheno-v3.2](https://huggingface.co/bartowski/L3-8B-Stheno-v3.2-GGUF/resolve/main/L3-8B-Stheno-v3.2-Q4_K_S.gguf)
- Lightweight and Fast: [Gemma3-4B](https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf)
  - Add [optional Gemma3-4B MMproj file](https://huggingface.co/koboldcpp/mmproj/resolve/main/gemma3-4b-mmproj-q8.gguf) for vision recognition capabilities.
- Image Generation: [PicX Real](https://huggingface.co/koboldcpp/imgmodel/resolve/main/picx_real_q5_1.gguf)
- Speech Recognition: [Whisper models for Speech-To-Text](https://huggingface.co/koboldcpp/whisper/tree/main)
- Text-To-Speech: [TTS models for Narration](https://huggingface.co/koboldcpp/tts/tree/main)
- This is just a list for noobs to get started! There are hundreds more GGUFs out there!
- [More newbie templates](https://huggingface.co/koboldcpp/newbie-templates) - Contains premade KoboldCpp quick launch templates curated for newbies.
- [More popular templates](https://huggingface.co/koboldcpp/popular-templates) - Contains premade KoboldCpp quick launch templates curated for popularity.
- [More extra templates](https://huggingface.co/koboldcpp/kcppt/tree/main) - Other premade KoboldCpp templates

To enable vision, load the matching MMProj file in **Mmproj File** under the launcher's **Loaded Files** tab, or add `--mmproj /path/to/mmproj.gguf` to your launch command alongside the text model.

To convert your own models, use the [GGUF conversion and quantization tools](https://kcpptools.concedo.workers.dev): run `convert_hf_to_gguf.py`, then `quantize_gguf.exe` to quantize the result.

## Troubleshooting and Improving Performance
KoboldCpp provides many hardware configurations that can affect performance. Generally the default configuration should work decently, however you can make some adjustments to optimize your experience.

- **System runs out of RAM:** Try a smaller model or a shorter context. Reducing GPU layers can increase system RAM usage by moving more model weights off the GPU.
  - **Adjusting Context Size**: Use `--contextsize N` to set the maximum context length: how much text the model can work with at once, measured in tokens. Larger contexts need more memory.
  - **Adjusting Batch Size**: Use `--batchsize N` to adjust prompt-processing batch size. A smaller batch can use less memory but might be slower. Set `-1` to disable batching.
- **GPU runs out of VRAM:** Try fewer GPU layers, a smaller model, or a shorter context. Autofit is an estimate and may need manual adjustment.
- **Generation is slow:** Check that the intended GPU backend is selected and that layers are offloaded. CPU-only generation works, but speed depends on your hardware and model.
  - **GPU Acceleration**: Windows and Linux users with GPUs can use `--usecuda`  flag (Nvidia Only), or `--usevulkan` (AMD, Nvidia, Intel GPUs) for GPU acceleration, make sure you select the correct .exe with CUDA support. This is also selectable in the hardware preset in the GUI launcher.
  - **GPU Layer Offloading**: Add `--gpulayers N` to offload model layers to the GPU. The default, `-1`, enables autofit; `0` disables GPU offloading. Lower the layer count if you run out of GPU memory.
- **An older computer crashes at startup:** Some devices lack newer CPU instruction support. Try an `oldpc` release or use `--noavx2`. See the release notes for hardware compatibility.
- **The browser cannot connect:** Wait for model loading to finish and check the address printed in the terminal. The default is [localhost:5001](http://localhost:5001); a custom `--port` changes it.
- **A model will not load:** Check the terminal error, your available memory, and whether your KoboldCpp version supports the model. You can trigger debug mode with the `--debugmode` flag or launch toggle. Try the latest release and [check the wiki](https://github.com/LostRuins/koboldcpp/wiki) or [create a Github issue](https://github.com/LostRuins/koboldcpp/issues) to report a bug.
- **Model is incoherent:** You might be using an incorrect chat template. Try relaunch with `--jinjatools` to use the included Jinja template, or enable the Jinja toggle in the GUI.
- For more information, be sure to run the program with the `--help` flag.

## APIs and integrations
KoboldCpp serves many APIs alongside multiple bundled web UIs. Simply connect your software With the default port:

| Interface | Base URL |
| --- | --- |
| KoboldCpp Default API base | `http://localhost:5001` |
| OpenAI-compatible API | `http://localhost:5001/v1` |
| Interactive API documentation | `http://localhost:5001/api` |
| KoboldAI Lite web UI | `http://localhost:5001` |
| llama.cpp web UI | `http://localhost:5001/lcpp` |
| StableUI Image Gen UI | `http://localhost:5001/sdui` |
| MusicUI Music Gen UI | `http://localhost:5001/musicui` |

**Additional APIs supported:** KoboldAI, OpenAI, Anthropic, Ollama, AUTOMATIC1111, ComfyUI, XTTS

Image, speech, embedding and music generation require the corresponding models to be loaded. Replace the host and port when connecting to a remote server or using a custom `--port`. For other apps, select a compatible API type and point the app at your running KoboldCpp server.

### KoboldCpp and KoboldAI API Documentation
- Supported endpoints and request formats are described in the [KoboldCpp API reference](https://lite.koboldai.net/koboldcpp_api)

## Compiling KoboldCpp From Source Code
Use a source build if a prebuilt binary does not suit your platform or you want to develop KoboldCpp. Manual builds require Git, Python 3, a C/C++ toolchain, and the development libraries for your chosen GPU backend.

Optional Python runtime dependencies include `customtkinter` and Tk support for the GUI launcher, `jinja2` for chat templates, and `psutil` for system information. Install the Python packages you need in your Python environment with `python -m pip install -r requirements.txt`; Tk may require a separate package from your operating system. The automated Linux build script manages its own dependencies.

Start by cloning the repository and entering its directory:

```bash
git clone https://github.com/LostRuins/koboldcpp.git
cd koboldcpp
```

Run the following build commands from that directory. Use `make -jN` to compile with `N` parallel jobs. For manual builds intended for other machines, add `LLAMA_PORTABLE=1`; this avoids optimizing only for the build machine, but platform and runtime requirements still apply.

### Compiling on Linux

**Automated build:** [koboldcpp.sh](koboldcpp.sh) uses a local micromamba/conda environment to obtain dependencies and build the libraries. Install `curl` and `bzip2` first.

```bash
./koboldcpp.sh             # Build as needed and open the launcher (requires X11)
./koboldcpp.sh --help      # Show command-line options
./koboldcpp.sh rebuild     # Refresh the environment and rebuild after updates
./koboldcpp.sh dist        # Package a standalone binary in dist/
```

To build for other machines, use `KCPP_PORTABLE=1 ./koboldcpp.sh dist`. The packaged binary still depends on the target system's compatibility with the Linux environment used to build it.

**Manual build:** Run `make` for a CPU build, or choose a backend below and install its prerequisites.

| Backend | Build command | Prerequisite |
| --- | --- | --- |
| CPU | `make` | C/C++ toolchain |
| Vulkan | `make LLAMA_VULKAN=1` | Vulkan SDK |
| NVIDIA CUDA | `make LLAMA_CUBLAS=1` | CUDA Toolkit |
| AMD ROCm | `make LLAMA_HIPBLAS=1` | ROCm development libraries |
| CUDA and Vulkan | `make LLAMA_CUBLAS=1 LLAMA_VULKAN=1` | Both toolkits |

After building, launch with `python3 koboldcpp.py --model /path/to/model.gguf`.

### Compiling on Windows

1. Install the standard **x64** version of [w64devkit](https://github.com/skeeto/w64devkit), not the i686 variant.
2. Open its integrated terminal in the repository directory.
3. Run `make` for a CPU build, or `make LLAMA_VULKAN=1` for Vulkan. This produces the DLLs used by `koboldcpp.py`.
4. Launch with `python koboldcpp.py --model "C:\Models\model.gguf"`.

**CUDA builds** require Visual Studio, CMake, and the CUDA Toolkit. Open the project's CMake configuration in Visual Studio, build it, and copy `koboldcpp_cublas.dll` beside `koboldcpp.py`. The Makefile's `LLAMA_CUBLAS=1` option is for Linux. Portable CUDA executables must include matching `cublas`, `cublasLt`, and `cudart` libraries from the same CUDA Toolkit family used for the build.

**Packaging an executable:** Install PyInstaller and the Python modules collected by [make_pyinstaller.bat](make_pyinstaller.bat). Build the CPU and Vulkan libraries with `make LLAMA_VULKAN=1 LLAMA_PORTABLE=1` to provide the script's required DLLs, then run the batch file from a Windows command prompt. It produces `dist/koboldcpp-nocuda.exe`; see the [Windows release workflow](.github/workflows/kcpp-build-release-win.yaml) for CUDA packaging.

If replacing bundled Vulkan libraries, put the matching `.lib` files in `kcpp_src/lib` and their `.dll` files in the repository root, then rebuild. This is an advanced configuration.

### Compiling on macOS

Run `make` for a CPU build. For Metal GPU support, install the Apple command-line developer tools and build with:

```bash
make LLAMA_METAL=1
python3 koboldcpp.py --model /path/to/model.gguf --gpulayers -1
```

### Compiling on OpenBSD

Install GNU Make with `pkg_add gmake`, then use `gmake` for a CPU build. For Vulkan, install `vulkan-loader` (also included as a dependency of `vulkan-tools`) and `shaderc`:

```bash
pkg_add gmake vulkan-loader shaderc
ulimit -d 8388608
gmake LLAMA_VULKAN=1
python3 koboldcpp.py --model /path/to/model.gguf
```

Run package installation with the required system privileges. The `ulimit` setting raises the data-size limit for compilation. If the build reports that `ggml-vulkan-shaders.hpp` is missing, check that `glslc` from `shaderc` is installed.

### Compiling on Android (Termux installation)

Install [Termux from F-Droid](https://f-droid.org/en/packages/com.termux/), then choose an automated or manual setup.

**Automated setup:** Download and run the [Android installer](android_install.sh). Its interactive menu offers installation with a starter model or without a model.

```bash
curl -sSL https://raw.githubusercontent.com/esolithe/esobold/refs/heads/remoteManagement/android_install.sh | sh
```

**Manual setup:** In Termux, install the dependencies, clone the repository if you have not already done so, and build:

```bash
pkg update
pkg upgrade
pkg install openssl wget git python clang make
git clone https://github.com/LostRuins/koboldcpp.git
cd koboldcpp
make
python koboldcpp.py --model /path/to/model.gguf
```

Download a small GGUF model before the final command, and replace the model path with its location. Open [localhost:5001](http://localhost:5001) in your mobile browser once loading completes. For portable ARM builds, `LLAMA_PORTABLE=1` disables native ARM instruction optimizations.

If package installation fails, update your packages or use `termux-change-repo` to choose another mirror. These instructions cover CPU builds; GPU acceleration depends on the device and its drivers.

## Help and community

Start with the [KoboldCpp FAQ and knowledge base](https://github.com/LostRuins/koboldcpp/wiki), then search [existing issues](https://github.com/LostRuins/koboldcpp/issues) and [discussions](https://github.com/LostRuins/koboldcpp/discussions). If you still need help, [open an issue](https://github.com/LostRuins/koboldcpp/issues/new) or join the [KoboldAI Discord](https://koboldai.org/discord).

For troubleshooting, include your operating system, hardware, KoboldCpp version, model filename, launch settings, and relevant error output.

## Third Party Resources
These community projects may be outdated or unmaintained. Contact their maintainers for support.

- **Arch Linux:** AUR packages for [CUDA](https://aur.archlinux.org/packages/koboldcpp-cuda) and [HIPBLAS](https://aur.archlinux.org/packages/koboldcpp-hipblas).
- **Community Docker images:** [korewaChino](https://github.com/korewaChino/koboldCppDocker) and [noneabove1182](https://github.com/noneabove1182/koboldcpp-docker).
- **Nix and NixOS:** Add `koboldcpp` to `environment.systemPackages` or `home.packages`. See the [Nix setup example](examples/nix_example.md) and report packaging problems to [Nixpkgs](https://github.com/NixOS/nixpkgs/issues).
- **AMD ROCm fork:** [YellowRoseCx/koboldcpp-rocm](https://github.com/YellowRoseCx/koboldcpp-rocm). Check its maintenance status; Vulkan in the main release is a starting point for AMD users.
- **Microsoft Word integration:** [GPTLocalhost](https://gptlocalhost.com/demo#KoboldCpp) connects Word to a local KoboldCpp server.


## License
KoboldCpp and KoboldAI Lite are licensed under the **GNU AGPL v3.0**, unless a file states otherwise. Bundled components retain their respective licenses, including the [MIT license for GGML, llama.cpp, and stable-diffusion.cpp](MIT_LICENSE_GGML_SDCPP_LLAMACPP_ONLY.md).

KoboldCpp builds on the work of these projects:
- [GGML](https://github.com/ggml-org/ggml) and [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT)
- [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) (MIT)
- [TTS.cpp](https://github.com/mmwillet/TTS.cpp) (MIT)
- [Qwen3-TTS.cpp](https://github.com/predict-woo/qwen3-tts.cpp) (MIT)
- [acestep.cpp](https://github.com/ServeurpersoCom/acestep.cpp) (MIT)
- [KoboldAI Lite](https://github.com/LostRuins/lite.koboldai.net) (AGPL)

For enquiries, contact **@concedo** on discord, message **u/HadesThrowaway** on reddit, or find **LostRuins** on github.