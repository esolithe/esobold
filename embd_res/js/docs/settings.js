/*
 * Native guide: settings.
 * Sources: newMenuOptions.js, themeEditor.js, themes.js, april.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "settings", title: "Esobold settings",
            blocks: [
                { p: "Settings → Esobold collects Esobold's own options:" },
                { list: [
                    "World tree and save settings, including running memory (experimental automatic summaries, stored in World Info).",
                    "Context settings: \"Turns max content\" and \"Turns old content ratio\" create a sliding window of turns. It helps large models with slow prompt processing.",
                    "Mods: open the third-party mods manager.",
                ] },
                { p: "Settings → GUI has options to customise the theme colours and font sizes, along with context usage bar and editor options." },
            ],
            show: [
                { label: "Open Settings → Esobold", run: (ctx) => ctx.openSettings("esobold") },
            ],
        },
    {
        "id": "settings-reference",
        "title": "Fork settings: behavior, saving and context",
        "blocks": [
            {
                "table": [
                    [
                        "Settings → Esobold",
                        "Behavior"
                    ],
                    [
                        "Disable save compression locally",
                        "Keeps local saves uncompressed for load/autosave performance; shared/server upload paths keep their existing compression."
                    ],
                    [
                        "Enable running memory",
                        "Periodically generates summary World Info; experimental, additional model requests."
                    ],
                    [
                        "World tree prune / depth / show all",
                        "Trade graph simplification and bounded neighborhood display against full-tree rendering work."
                    ],
                    [
                        "Use new editor",
                        "Adds Raw/Markdown/Render views; source warns about HTML round-trip issues."
                    ],
                    [
                        "Save options (legacy)",
                        "Shows older slot/server-saving controls alongside the Library."
                    ],
                    [
                        "Overwrite character on name collision",
                        "Replace a same-name character instead of generating a numbered name."
                    ],
                    [
                        "Third-party mods",
                        "Opens the existing mod manager and its trust warning."
                    ],
                    [
                        "Turns max content / Turns old content ratio",
                        "Control approximate story-turn sliding context; zero values bypass this crop path."
                    ]
                ]
            },
            {
                "p": "Settings → Agent holds agent protocol, plan/repeat/history limits, continuation, streaming, input/error behavior, saved macros, filesystem content limit, syntax-write guard and the OpenLumara listener. Settings → Tools controls group/individual Allowed flags."
            },
            {
                "tip": "Confirm settings after editing. A persisted checkbox can still be unavailable or ineffective when the selected backend lacks its capability."
            }
        ],
        "show": [
            { label: "Fork behavior settings", run: (ctx) => ctx.openSettings("esobold") },
            { label: "Agent settings", run: (ctx) => ctx.openSettings("esoboldAgent") }
        ]
    },
    {
        "id": "theme-and-gui",
        "title": "Themes, fonts, layout and display controls",
        "blocks": [
            {
                "list": [
                    "Settings → GUI includes the theme-colour editor, context-usage chart, fullscreen multiline editor buttons, and Corpo’s automatic left-panel minimization.",
                    "The theme editor selects bundled themes, adjusts available fonts, sizes and CSS colour variables through Pickr, and stores customThemeColours. It changes browser presentation, not generation settings.",
                    "Classic/Messenger/Aesthetic/Corpo interfaces have different layouts; features such as agent controls and embedded-view buttons are injected into their supported containers.",
                    "april.js replaces the input placeholder with decorative random hints on load/hover. That hint is not submitted message text and does not mean a model produced a response."
                ]
            },
            {
                "tip": "Keep text/background contrast readable. If a large view becomes hard to navigate, return to a known theme/layout rather than changing the underlying saved story."
            }
        ],
        "show": [
            { label: "GUI and theme controls", run: (ctx) => ctx.openSettings("appearance") }
        ]
    }
)
