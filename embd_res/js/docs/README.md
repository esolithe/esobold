# Esobold native guide

Open **Guide** in the Lite top bar. These ordered classic scripts provide 75
chapters across nine native feature tabs; mods retain their separate guide tabs.
There is no second help renderer or Markdown-to-HTML pipeline.

## Native guide parts

| Tab ID | Label | Topic modules |
| --- | --- | --- |
| `getting-started` | Getting started | `gettingStarted.js` |
| `library` | Library & saves | `library.js` |
| `context` | Context & memory | `context.js` |
| `writing` | Writing & story tree | `storyTree.js`, `generation.js`, `editors.js` |
| `agents` | Agents & automation | `agents.js`, `agentTools.js`, `macros.js` |
| `media` | Media | `media.js` |
| `development` | Files & development | `filesystem.js`, `webContainer.js`, `developerApi.js` |
| `integrations` | Connections & extensions | `openLumara.js`, `mcp.js`, `mods.js` |
| `settings` | Settings & administration | `administration.js`, `settings.js` |

The native parts appear in this order, with each part retaining its modules'
existing loader order. Chapter numbering and Back/Next/Done are local to a part.

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

- `../esoGuide.js` owns rendering and the `ESO_GUIDE_PARTS` native registry.
  Each topic script appends chapter objects with, for example,
  `ESO_GUIDE_PARTS.library.chapters.push(...)` after that renderer loads in
  `../../klite.embd`. Registry keys match tab IDs except `gettingStarted`,
  whose tab ID is `getting-started`.
- Chapter shape: `{ id, title, blocks, show }`. Native block keys are `p`, `list`,
  `tip`, and `table`; the first table row is the header. Text is rendered through
  `textContent`, not executable HTML/Markdown.
- Show-me callbacks use `ctx.highlight`, `ctx.run`, `ctx.openSettings` and
  `ctx.navLink`. Settings IDs are `general`, `appearance`, `samplers`, `media`,
  `tokens`, `tools`, `advanced`, `esoboldAgent`, and `esobold`.
- Preserve stable chapter IDs, including the ten original IDs. Use
  `window.eso.guide.open("context", "turn-based-authors-note")` for a named deep
  link, or `window.eso.guide.open(null, chapterId)` to find a chapter's part.
  A link to a removed tab resolves by chapter ID; no Esobold alias tab is kept.
- `esoGuidePosition` remembers a chapter in each category. A remembered chapter
  from the former single-tab layout moves to its current part when opened.
  Registered `GuideExtension` tabs follow the nine native parts. An explicit
  valid mod tab keeps ownership of its chapter even if a native chapter has the
  same ID.
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