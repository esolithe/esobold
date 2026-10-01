# Esobold native guide

Open **Guide** in the Lite top bar. These ordered classic scripts provide 75
chapters in the existing Esobold tab; mods retain their separate guide tabs.
There is no second help renderer or Markdown-to-HTML pipeline.

## Functional areas

| File | Coverage |
| --- | --- |
| `gettingStarted.js` | Connections, modes, writing-session workflow, data and add-on precautions |
| `library.js` | Library/Quick Start, character cards, ZIP import/export, local/server saves and basic save encryption |
| `context.js` | Memory, World Info, ordinary/turn-based Author's Note, TextDB retrieval, usage estimates and running memory |
| `storyTree.js` | Branches, Undo/Retry, tree display controls and bounded/full views |
| `generation.js` | Formatting, sampler families, constrained output, stopping and request failures |
| `media.js` | Images, transcription, speech, music, backgrounds and floating content viewers |
| `editors.js` | Raw/Markdown/Render, popup/fullscreen editors, tree-sitter symbols/errors/warnings |
| `filesystem.js` | Actual `/fs/` page, list/tile/picker modes, storage modes, operation-array API, search and read-only mounts |
| `agents.js` | Model/service setup, plans, limits, input/files, streaming, continuation and stopping |
| `agentTools.js` | Allowed tool groups and all 80 built-in commands with argument schemas and effects |
| `macros.js` | Saved-plan validation, invocation, directory expansion, per-file execution and whitelist behavior |
| `openLumara.js` | Identity, remote chats/messages/storage, streaming and websocket listener |
| `webContainer.js` | Browser coding workspace, commands/files, server transfers and development previews |
| `mcp.js` | Dynamic external-tool discovery, schemas, permissions and legacy browser-adapter limitations |
| `administration.js` | Admin configuration, model/config reloads and HF download selection |
| `settings.js` | Fork/agent settings, GUI, themes, fonts and display hooks |
| `mods.js` | Community add-ons and QuickStart/Settings/Guide extension contracts |
| `developerApi.js` | Native guide schema, browser helper APIs, runnable blocks, popups and source coverage |

## Content and integration contract

- `../esoGuide.js` owns rendering and `ESO_GUIDE_CHAPTERS`. Each topic script
  appends chapter objects after that renderer loads in `../../klite.embd`.
- Chapter shape: `{ id, title, blocks, show }`. Native block keys are `p`, `list`,
  `tip`, and `table`; the first table row is the header. Text is rendered through
  `textContent`, not executable HTML/Markdown.
- Show-me callbacks use `ctx.highlight`, `ctx.run`, `ctx.openSettings` and
  `ctx.navLink`. Settings IDs are `general`, `appearance`, `samplers`, `media`,
  `tokens`, `tools`, `advanced`, `esoboldAgent`, and `esobold`.
- Preserve stable chapter IDs, including the ten original IDs. Position is saved
  under `esoGuidePosition`; use `window.eso.guide.open("esobold", chapterId)` for
  an explicit deep link. Registered `GuideExtension` tabs follow Esobold.
- Keep controls, prerequisites, side effects and failure paths source-backed.
  Conditional capabilities are not promises that a backend/model is configured.
- Lead with the purpose, explain unfamiliar terms, give visible control paths and
  use short SFW examples. Match the actual labels, such as **Media** and
  **Hover over the Library tab**.
- Keep programming and tool-input details in optional references. Preserve exact
  identifiers and schemas while rewriting their explanations.
- Describe the normal Library save/backup workflow, not the older server-save
  popup. Explain skipped local compression as a way to make saving faster, and
  save encryption as basic protection rather than a place to store secrets.
- Add a new functional-area script to the existing loader order. Reuse the native
  renderer rather than introducing a competing registry or markup framework.

## Review provenance

[Source coverage](source-map.json) records all **301 existing JavaScript files**
at Esobold `remoteManagement` revision
[`9f88848c2c0a68c1dbef91f5534754736322f620`](https://github.com/esolithe/esobold/tree/9f88848c2c0a68c1dbef91f5534754736322f620):
**63 first-party modules** and **238 dependencies** (210 Ace, 18 WebContainer,
10 other libraries). Each file was structurally examined; first-party workflows,
control logic and APIs were reviewed. The manifest includes declarations,
imports/exports, module IDs, area assignments and command schemas, not copied
prompt/sample literals. Its line locations describe the original pinned source,
not the later documentation additions.

The UI comparison uses the actual
[LostRuins/koboldcpp `concedo` baseline](https://github.com/LostRuins/koboldcpp/tree/4959b8d3695fcf740c1e2d508bedabdea70cbbd44),
pinned to `4959b8d3695fcf740c1e2d508bedabdea70cbbd44`. Esobold's branch named
`upstream` contains llama.cpp and is **not** the KoboldCpp/Lite baseline.
`embd_res/klite.embd` differs by +2,360 / -1,093 lines in 452 zero-context hunks;
330 requested embedded-resource files differ, including 301 JavaScript files.
The served filesystem page is `embd_res/fs_browser.html`, not the older
repository-root file with that name.

Tool effects distinguish the actual stores and operations: `add_to_history`
appends to TextDB, `overwrite_current_state_response` sets `StateFormat` rather
than editing a reply, and `wordcount` toggles action-summary tracking. A
macro's output-suppression flag is not a per-stage private-draft guarantee. The
legacy browser MCP adapter's hard-coded CPU-info execution is documented, not
presented as a working generic tool bridge.

## Exercised verification

The actual Esobold/KoboldCpp instance was exercised through its built-in
Cloudflare remote tunnel, using `koboldcpp.py --nomodel --remotetunnel` and a
disposable Chromium profile. There was no separate gateway or preview renderer.

- All 75 chapters were opened through the native sidebar at 1440×1000 and
  390×844. Chapter titles matched their selections, with no article horizontal
  overflow, outer-body overflow or offscreen current-chapter selection.
- Native Back/Next, first-page Back disabling, Close and final-page Done worked.
- The selected turn-based Author's Note chapter survived closing the guide and
  a full page reload.
- Hovering over the actual Library tab exposed Q.Save, Download, Load,
  New Character and Share.
- The Media show-me shortcut previously pointed to a hidden panel. It now rings
  the visible Media button at both widths; Escape restores the guide.
- Shortcuts opened the six referenced General, GUI, Samplers, Tools, Agent and
  Esobold settings tabs. Settings were cancelled without saving changes.
- Desktop context/tool-reference and narrow-screen Author's Note/highlight
  screenshots were visually inspected. No browser page errors were reported.

This verifies the hosted documentation and native UI integration, not AI
responses, filesystem mutations, remote authentication, WebContainer startup,
MCP execution, model downloads or administration reloads. No model was loaded
and external-service connection offers were declined. Existing experimental
limitations are documented rather than silently fixed or presented as working.
