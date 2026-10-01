/*
 * Native guide: editors.
 * Sources: wysiwygEditor.js, fullScreenEditor.js, editorPopup.js, treeSitterGrammarLoader.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.writing.chapters.push(
    {
        "id": "story-editors",
        "title": "Raw, Markdown and Render editors",
        "blocks": [
            {
                "list": [
                    "Enable Settings → Esobold → Use new editor. Raw shows the saved text directly, Markdown works with text formatting, and Render shows the formatted result.",
                    "Tick Allow Editing to change existing story text. Leaving a Raw field or switching views updates the story; replies, Undo, Redo and Retry also update the editor.",
                    "Markdown, code and reasoning can look different in Render. Converting a formatted view back into text may change some formatting.",
                    "Download a save before major edits. Use Raw to check exact spacing, role tags or code rather than relying only on the formatted preview."
                ]
            },
            {
                "tip": "Only run code you trust. A nicely formatted code block can still change data or perform other actions if you execute it."
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
                    "Enable Settings → GUI → Full screen editor buttons to add expand buttons to supported multiline fields. Edit the larger view, return to the original field, then confirm or save its dialog.",
                    "The popup code editor offers language selection, colored syntax and editing commands. Colored syntax helps reading but does not check whether a program works.",
                    "In the filesystem browser, use Edit on a text file. Save writes the file to the server and refreshes the listing; read any error if saving fails.",
                    "Some popups can be moved or resized and have mobile navigation. Use the popup's Cancel or Close control as appropriate. Closing a window does not undo a file already saved."
                ]
            },
            {
                "tip": "Filesystem editing changes a server file, not a file on your desktop. Check the path and keep a copy before overwriting it."
            }
        ],
        "show": [
            { label: "Editor and UI settings", run: (ctx) => ctx.openSettings("appearance") }
        ]
    },
    {
        "id": "syntax-and-symbol-tools",
        "title": "Code tools: finding symbols and syntax problems",
        "blocks": [
            {
                "table": [
                    [
                        "Tool",
                        "What it does"
                    ],
                    [
                        "fs_code_get_symbols",
                        "Finds named parts of a supported code file, such as functions, and reports their locations."
                    ],
                    [
                        "fs_code_edit_symbol",
                        "Replaces a named part of the code. Check the file and name, and keep a backup before using it."
                    ],
                    [
                        "fs_code_detect_errors",
                        "Reports places where the supported language parser cannot read the code's syntax."
                    ],
                    [
                        "fs_code_detect_warnings",
                        "Reports possible issues using simple code checks; it does not prove that the program works correctly."
                    ]
                ]
            },
            {
                "p": "These are optional tools for working with code files. A parser reads the structure of a supported programming language to find names and syntax errors. Unsupported languages or a failed parser download produce an error instead of a code analysis."
            },
            {
                "tip": "Run the program and its own checks after changing code. Agent → Block write on syntax error can prevent some broken-syntax writes, but it does not check every file format or whether the behavior is correct."
            }
        ]
    }
)

export default function load() {}   