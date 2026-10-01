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
                "p": "Optional authoring reference: use this chapter if you are editing Esobold's help or writing a mod. The guide displays plain text and tables; the earlier chapters are for using the app."
            },
            {
                "list": [
                    "esoGuide.js draws the guide and handles chapter navigation. Each js/docs/*.js file adds chapters for one feature area to ESO_GUIDE_CHAPTERS before the top-bar button becomes available.",
                    "A chapter has {id, title, blocks, show}. Use p for paragraphs, list for steps, tip for a short note, and table with a header row. Text is inserted with textContent, not interpreted as HTML or Markdown.",
                    "show contains {label, run(ctx)} buttons. ctx.highlight(target, note) points at a control and restores the guide after click/Escape/timeout; ctx.run(fn) closes it to perform an action; ctx.openSettings(tabId) opens settings; ctx.navLink(text) finds a top-bar entry.",
                    "window.eso.guide.open(tabId, chapterId) opens a chosen chapter. esoGuidePosition remembers it. Keep existing IDs and place Esobold before mod tabs."
                ]
            },
            {
                "tip": "Explain the purpose first, define technical terms, give real visible control paths and use short examples. Add topics through the existing ordered loader and block format rather than another renderer or chapter registry."
            }
        ]
    },
    {
        "id": "generation-helper-api",
        "title": "Browser generation and agent helper APIs",
        "blocks": [
            {
                "p": "Optional programming reference: these browser functions request AI output or start agent work. They use the currently configured services and models."
            },
            {
                "table": [
                    [
                        "Helper",
                        "Behavior"
                    ],
                    [
                        "window.triggerAgentResponse(prompt, macro?)",
                        "Start execAgentCycle with a prompt, optionally using a named macro. Pass the prompt first, not the macro name."
                    ],
                    [
                        "window.generateTextFromAI(prompt, keepThinkingTags = false)",
                        "Send an Instruct request and return text. Keep configured reasoning tags only when keepThinkingTags is true."
                    ],
                    [
                        "window.generateObjectFromAI(prompt, objectStructure)",
                        "Generate a JSON object in the requested shape using server grammar rules (JSON-to-GBNF), then parse it. Requires a compatible server; returns null if the result cannot be parsed."
                    ],
                    [
                        "window.generateImageFromAI(prompt, imageToStartFrom?)",
                        "Generate an image using the configured service, optionally starting from an existing image."
                    ],
                    [
                        "window.prepareMusicFromAI / generateMusicFromAI",
                        "Prepare the music settings and generate a track with the configured music model."
                    ],
                    [
                        "window.generateTTSFromAI / getAvailableVoicesFromAI",
                        "Generate speech or list the available voices."
                    ],
                    [
                        "window.execAgentCycle(argsObj)",
                        "Start a tracked agent run using argsObj. stopAgentThinking stops its active work."
                    ]
                ]
            },
            {
                "p": "window.eso.currentChatOpponentOverride changes the opponent for a request. window.eso.debugStreamingToolcalls enables detailed tool-stream logging. These page-wide settings are not private storage or server access controls."
            },
            {
                "tip": "These functions make real service requests and may cost money. Do not call them just to inspect the guide or send private material you have not reviewed."
            }
        ]
    },
    {
        "id": "runnable-code-and-popups",
        "title": "Runnable code blocks and popup utilities",
        "blocks": [
            {
                "list": [
                    "Rendered JavaScript/js and HTML code blocks may have a Run button. JavaScript executes in the browser page; HTML opens a new window containing that document.",
                    "Console output uses the page's grouped outPipe/outPipeLog/info/warn/error helpers. Only run code you have read and trust; it can access the app's data and functions.",
                    "PopupUtils supplies reset/title/content/button/buttonGroup/show, size and backdrop options. Its modal() helper makes a movable, resizable window without a backdrop; the name does not mean it blocks the rest of the page.",
                    "WaitingToast shows progress while an operation is pending and hides on abort. postSubmitHandler checks completion every second, updates the world tree and may request experimental context prewarming to prepare changed context."
                ]
            },
            {
                "tip": "Review AI-generated code before running it. Like other page scripts, it can read browser state and call the app's available services."
            }
        ]
    },
    {
        "id": "source-coverage",
        "title": "About this guide and its sources",
        "blocks": [
            {
                "p": "This guide covers Esobold's features, based on esolithe/esobold remoteManagement revision 9f88848c2c0a68c1dbef91f5534754736322f620. Its source inventory includes 301 JavaScript files: 63 app modules and 238 bundled libraries. source-map.json records file roles, code declarations, imports/exports, module IDs and tool inputs without copying prompt or sample text."
            },
            {
                "p": "Optional comparison for developers: the KoboldCpp/Lite baseline is LostRuins/koboldcpp branch concedo at 4959b8d3695fcf740c1e2d508bedabdea70cbbd44. Esobold's branch literally named upstream contains llama.cpp, so it is not that interface baseline. The recorded comparison has +2,360 / −1,093 klite.embd lines across 452 change blocks, and 330 differing requested resource files, including 301 JavaScript files."
            },
            {
                "table": [
                    [
                        "Vendor family",
                        "Integrated role"
                    ],
                    [
                        "Ace (210 files)",
                        "Code editor, language highlighting, themes and background helpers for popup/fullscreen editing."
                    ],
                    [
                        "@webcontainer/api (18 files)",
                        "The browser coding workspace, its file tree and preview updates."
                    ],
                    [
                        "Other bundled libraries (10 files)",
                        "Formatted-text editors, tree diagrams, pan/zoom, color tools, ZIP import/export, save encryption, calculations and code parsing."
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
                "tip": "The source inventory describes coverage. Browser guide checks exercise the displayed chapters, navigation and shortcuts; they do not run AI generation, file changes, service logins, workspace startup or model reloads."
            }
        ]
    }
)
