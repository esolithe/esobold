/*
 * Native guide: developerApi.
 * Sources: esoGuide.js, agenticUtilitiesExt.js, execCodeBlocks.js, popupUtils.js, waitingToast.js, postSubmitHandler.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "guide-authoring",
        "title": "Maintaining the native guide and chapter modules",
        "blocks": [
            {
                "list": [
                    "esoGuide.js owns rendering/navigation; js/docs/*.js append chapter objects to ESO_GUIDE_CHAPTERS before the top-bar Guide button is available. Each file groups one functional area.",
                    "A chapter is {id, title, blocks, show}. Supported blocks are p, list, tip and table; tables use the first row as headers. Text is inserted with textContent, never as HTML or Markdown.",
                    "show contains {label, run(ctx)} actions. ctx.highlight(target, note) temporarily hides the guide and restores it on click/Escape/timeout; ctx.run(fn) closes the guide and runs an action; ctx.openSettings(tabId) opens a settings tab; ctx.navLink(text) finds a top-bar entry.",
                    "window.eso.guide.open(tabId, chapterId) can deep-link to a chapter. Position is stored under esoGuidePosition. Keep the original IDs and the Esobold-first/mod-tab ordering when changing content."
                ]
            },
            {
                "tip": "Do not create a competing Markdown renderer or a second registry. Add a topic script in klite.embd’s existing ordered loader and use the existing native block schema."
            }
        ]
    },
    {
        "id": "generation-helper-api",
        "title": "Browser generation and agent helper APIs",
        "blocks": [
            {
                "table": [
                    [
                        "Helper",
                        "Behavior"
                    ],
                    [
                        "window.triggerAgentResponse(prompt, macro?)",
                        "Starts execAgentCycle with the prompt, optionally prefixed by the named macro. The first argument is the prompt, not the macro name."
                    ],
                    [
                        "window.generateTextFromAI(prompt, keepThinkingTags = false)",
                        "Formats an instruct request and returns generated text; strips configured reasoning tags unless requested otherwise."
                    ],
                    [
                        "window.generateObjectFromAI(prompt, objectStructure)",
                        "Converts an object structure through the backend JSON-to-GBNF route and parses generated structured text. Requires compatible grammar/backend behavior. Returns null if the generated response cannot be parsed as JSON."
                    ],
                    [
                        "window.generateImageFromAI(prompt, imageToStartFrom?)",
                        "Uses the configured image-generation path, optionally with a starting image."
                    ],
                    [
                        "window.prepareMusicFromAI / generateMusicFromAI",
                        "Prepare music state and generate through the supported music backend."
                    ],
                    [
                        "window.generateTTSFromAI / getAvailableVoicesFromAI",
                        "Generate speech or obtain supported voice choices."
                    ],
                    [
                        "window.execAgentCycle(argsObj)",
                        "Starts a tracked agent cycle with the selected prompt/runtime options; stopAgentThinking cancels its active path."
                    ]
                ]
            },
            {
                "p": "window.eso.currentChatOpponentOverride is an optional request-time opponent override. window.eso.debugStreamingToolcalls enables verbose streaming-tool logging. These globals are application hooks, not isolated per-user secrets or server permission controls."
            },
            {
                "tip": "Generation helpers consume the selected model/service and can incur requests/cost. Do not call them during a documentation-only check or on unreviewed private material."
            }
        ]
    },
    {
        "id": "runnable-code-and-popups",
        "title": "Runnable code blocks and popup utilities",
        "blocks": [
            {
                "list": [
                    "Rendered JavaScript/js and HTML-family code blocks can receive an execution button. JavaScript runs through eval in the page; HTML opens a new window and writes the supplied document.",
                    "Console output is redirected into grouped outPipe/outPipeLog/info/warn/error helpers. It is not a sandboxed diagnostic environment. Only execute code you have reviewed and trust.",
                    "PopupUtils provides reset/title/content/button/buttonGroup/show, sizing, backdrop and draggable/resizable options. Its modal() helper actually enables a draggable/resizable window with no backdrop; do not assume that name enforces blocking isolation.",
                    "WaitingToast tracks transient/locked status; abort hides it. postSubmitHandler checks request completion once per second, updates the world tree and invokes the optional Hearthfire hook."
                ]
            },
            {
                "tip": "A code block generated by a model is still untrusted code. It can access the same browser state and application APIs as other page scripts."
            }
        ]
    },
    {
        "id": "source-coverage",
        "title": "Source coverage, upstream comparison and vendor boundaries",
        "blocks": [
            {
                "p": "This guide was prepared from esolithe/esobold remoteManagement revision 9f88848c2c0a68c1dbef91f5534754736322f620. All 301 existing JavaScript files were structurally examined: 63 first-party modules and 238 bundled dependencies. source-map.json records each file, its area/vendor role, declarations, imports/exports, module IDs and tool schemas without copying prompt/sample literals."
            },
            {
                "p": "The actual Cedo/KoboldCpp baseline is LostRuins/koboldcpp branch concedo, pinned to 4959b8d3695fcf740c1e2d508bedabdea70cbbd44 for this review. Esobold’s branch named upstream contains llama.cpp, not KoboldCpp/Lite, and is not the correct UI-diff baseline. klite.embd differs from the pinned Concedo version by +2,360 / −1,093 lines across 452 zero-context hunks; 330 requested embedded-resource files differ, including 301 JavaScript files."
            },
            {
                "table": [
                    [
                        "Vendor family",
                        "Integrated role"
                    ],
                    [
                        "Ace (210 files)",
                        "Editor core, language modes, themes and web workers used by the popup/fullscreen editors."
                    ],
                    [
                        "@webcontainer/api (18 files)",
                        "Browser Node runtime bridge, file-tree support and preview message/reload protocol."
                    ],
                    [
                        "Other bundled libraries (10 files)",
                        "Markdown/WYSIWYG rendering, Mermaid graphs, pan/zoom, colour picker/filter conversion, ZIP import/export, cryptographic compatibility, mathematical expressions and tree-sitter runtime."
                    ]
                ]
            },
            {
                "table": [
                    [
                        "Functional area file",
                        "First-party source modules"
                    ],
                    [
                        "gettingStarted.js",
                        "esoWelcome.js, esoGlobals.js, enableAllEndpointsLocally.js, newTopMenuButtons.js"
                    ],
                    [
                        "library.js",
                        "characterManager.js, tavernTool.js, fileUtils.js, autosaveToServer.js, serverSideSaving.js, encryptUtils.js"
                    ],
                    [
                        "context.js",
                        "contextUsage.js, documentParser.js, embeddingPreset.js, authorNotePositioningUtils.js, runningMemory.js, hearthfireContext.js"
                    ],
                    [
                        "storyTree.js",
                        "treeHandler.js, treeViewer.js"
                    ],
                    [
                        "generation.js",
                        "esoSampler.js"
                    ],
                    [
                        "media.js",
                        "newMediaButtons.js, embeddedContentViewer.js"
                    ],
                    [
                        "editors.js",
                        "wysiwygEditor.js, fullScreenEditor.js, editorPopup.js, treeSitterGrammarLoader.js"
                    ],
                    [
                        "filesystem.js",
                        "fs.js, fs_browser.js, agent/agent_filesystem.js, dev/fs_array_contract_console_test.js"
                    ],
                    [
                        "agents.js",
                        "agent.js, agentUtils.js, agent/agent_planning_input.js, agent/agent_messaging.js, agent/agent_stream_visualizer.js"
                    ],
                    [
                        "agentTools.js",
                        "agent/agent_groups_loader.js, agent/agent_library_utils.js, agent/agent_media.js, agent/agent_search_web.js, agent/agent_utilities.js, agent/agent_world_state.js"
                    ],
                    [
                        "macros.js",
                        "agent/agent_macros.js"
                    ],
                    [
                        "openLumara.js",
                        "openlumara_client.js, openlumaraAuthUtils.js, agent/agent_openlumara.js, agent/agent_openlumarapolling.js"
                    ],
                    [
                        "webContainer.js",
                        "webContainer.js, webContainerUtils.js, agent/agent_webContainer.js"
                    ],
                    [
                        "mcp.js",
                        "MCPUtils.js"
                    ],
                    [
                        "administration.js",
                        "reloadUtils.js, hfModelSearcher.js"
                    ],
                    [
                        "settings.js",
                        "newMenuOptions.js, themeEditor.js, themes.js, april.js"
                    ],
                    [
                        "mods.js",
                        "modHooks.js, modManager.js"
                    ],
                    [
                        "developerApi.js",
                        "esoGuide.js, agenticUtilitiesExt.js, execCodeBlocks.js, popupUtils.js, waitingToast.js, postSubmitHandler.js"
                    ]
                ]
            },
            {
                "tip": "Inventory and source comparison are not live-service tests. Browser checks for this documentation exercise rendering/navigation/shortcuts, not model generation, filesystem mutations, account login, WebContainer boot or admin reload."
            }
        ]
    }
)
