# Esobold native guide

Open **Guide** in the Lite top bar. These ordered classic scripts provide 74
chapters in the existing Esobold tab; mods retain their separate guide tabs.
There is no second help renderer or Markdown-to-HTML pipeline.

## Functional areas

| File | Coverage |
| --- | --- |
| `gettingStarted.js` | Connections, modes, writing-session workflow, data and trusted-code boundaries |
| `library.js` | Library/Quick Start, character cards, ZIP import/export, local/server saves and legacy encryption |
| `context.js` | Memory, World Info, Author's Note, TextDB/document retrieval, usage estimates and running memory |
| `storyTree.js` | Branches, Undo/Retry, tree display controls and bounded/full views |
| `generation.js` | Formatting, sampler families, constrained output, stopping and request failures |
| `media.js` | Images, transcription, speech, music, backgrounds and floating content viewers |
| `editors.js` | Raw/Markdown/Render, popup/fullscreen editors, tree-sitter symbols/errors/warnings |
| `filesystem.js` | Actual `/fs/` page, list/tile/picker modes, storage modes, operation-array API, search and read-only mounts |
| `agents.js` | Grammar/OAI protocols, plans, limits, input/files, streaming, continuation and stopping |
| `agentTools.js` | Permission policy and all 80 built-in commands with nested argument schemas and effects |
| `macros.js` | Saved-plan validation, invocation, directory expansion, per-file execution and whitelist behavior |
| `openLumara.js` | Identity, remote chats/messages/storage, streaming and websocket listener |
| `webContainer.js` | Browser runtime, contained processes/files, backend transfers and dev previews |
| `mcp.js` | Dynamic external-tool discovery, schemas, permissions and legacy browser-adapter limitations |
| `administration.js` | Admin configuration, model/config reloads and HF download selection |
| `settings.js` | Fork/agent settings, GUI, themes, fonts and display hooks |
| `mods.js` | Trusted community code and QuickStart/Settings/Guide extension contracts |
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
than editing a reply, and `wordcount` toggles action-summary bookkeeping. A
macro's output-suppression flag is not a per-stage private-draft guarantee. The
legacy browser MCP adapter's hard-coded CPU-info execution is documented, not
presented as a working generic tool bridge.

## Exercised verification

The actual modified Lite page was served through an isolated localhost static
preview and exercised in disposable Chromium; no existing browser state or
model-serving process was changed.

- All 74 chapters rendered at 1280×900 and 390×844, with no article horizontal
  overflow, outer-body overflow or hidden current-chapter selection.
- Native Back/Next, first-page Back disabling, Close and final-page Done worked.
- The selected chapter survived closing/reopening and a full page reload.
- Show-me highlighting hid the guide and Escape restored it.
- Shortcuts opened the six referenced General, GUI, Samplers, Tools, Agent and
  Esobold settings tabs.
- A temporary real `GuideExtension` rendered after Esobold and was unregistered.
- The actual browser-local tool executors were exercised with SFW synthetic
  metadata: stable-ID lore retrieval, separate `State`/`StateFormat` updates,
  TextDB history appends without World Info changes, and word-count bookkeeping
  toggles. The corrected tool/macro/MCP chapters rendered at desktop/mobile
  widths without article overflow; no model request or external MCP call ran.
- Desktop/mobile guide screenshots were visually inspected. Long sidebar,
  table/article scrolling and narrow-screen navigation labels were checked.

The preview deliberately had no backend; its startup backend-connection error
was dismissed. This verifies documentation/UI integration, **not** model
responses, filesystem mutations, remote authentication, WebContainer boot, MCP
execution, model download or administration reloads. Existing experimental/source
limitations are documented rather than silently fixed or presented as working.
