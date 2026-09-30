/*
 * Native guide: editors.
 * Sources: wysiwygEditor.js, fullScreenEditor.js, editorPopup.js, treeSitterGrammarLoader.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "story-editors",
        "title": "Raw, Markdown and Render editors",
        "blocks": [
            {
                "list": [
                    "Enable Use new editor under Settings → Esobold. The editor adds Raw, Markdown and Render views to the story surface. Raw is the underlying text; the other views interpret or convert presentation.",
                    "Enable Allow Editing to make direct story changes. Raw blur and view synchronization write changes back to the active story; generation, Undo, Redo and Retry keep the visible editor synchronized.",
                    "Rendered Markdown/code/reasoning blocks are display transformations. HTML-to-Markdown conversion is not guaranteed to preserve every original formatting detail.",
                    "Download/save before major edits. If precise delimiters, whitespace or code matter, verify them in Raw rather than trusting a rendered preview."
                ]
            },
            {
                "tip": "Do not paste untrusted executable code into a runnable block or mistake rich rendering for a security boundary."
            }
        ],
        "show": [
            { label: "New editor setting", run: (ctx) => ctx.openSettings("esobold") },
            { label: "Allow Editing", run: (ctx) => ctx.highlight("#allowediting", "Toggle direct story editing") }
        ]
    },
    {
        "id": "popup-and-fullscreen-editors",
        "title": "Popup, fullscreen and filesystem editing",
        "blocks": [
            {
                "list": [
                    "Settings → GUI → Full screen editor buttons adds expand buttons to eligible multiline controls. The expanded editor writes the resulting text back into the original field; still confirm/save the surrounding dialog as appropriate.",
                    "The generic editor popup uses Ace with language selection, syntax highlighting and its normal editing commands. Highlighting is not proof that a program compiles.",
                    "In the filesystem browser, editable nonbinary files have an Edit action. Saving writes through FsClient; errors are reported, and the listing refreshes on successful save.",
                    "PopupUtils supports sizing, modal/backdrop modes, mobile navigation and optional draggable/resizable windows. Escape, Cancel and Close vary by the owning operation; cancelling a popup does not undo writes already completed."
                ]
            },
            {
                "tip": "Filesystem edits target the backend filesystem, not an arbitrary local desktop file. Confirm the path before overwriting."
            }
        ],
        "show": [
            { label: "Editor and UI settings", run: (ctx) => ctx.openSettings("appearance") }
        ]
    },
    {
        "id": "syntax-and-symbol-tools",
        "title": "Syntax trees, symbols and static warnings",
        "blocks": [
            {
                "table": [
                    [
                        "Tool",
                        "Contract"
                    ],
                    [
                        "fs_code_get_symbols",
                        "Parses a supported file and returns named syntax-tree symbols and locations."
                    ],
                    [
                        "fs_code_edit_symbol",
                        "Replaces the located symbol’s text; check the affected path/name and save a backup first."
                    ],
                    [
                        "fs_code_detect_errors",
                        "Returns syntax-tree parse error locations for a supported grammar."
                    ],
                    [
                        "fs_code_detect_warnings",
                        "Runs source heuristics, not a full language server, compiler or security audit."
                    ]
                ]
            },
            {
                "p": "treeSitterGrammarLoader maps filename extensions to bundled WASM grammars, caches loaded parsers, collects symbols/errors and applies heuristic warnings. Unsupported languages and failed grammar loads are reported rather than supplying a complete semantic analysis."
            },
            {
                "tip": "These checks cannot replace a real build or language-aware reference migration. Agent Block write on syntax error adds a supported-language guard; it does not validate all formats or all behavioral changes."
            }
        ]
    }
)
