/*
 * Native guide: settings.
 * Sources: newMenuOptions.js, themeEditor.js, themes.js, april.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "settings", title: "Esobold settings",
            blocks: [
                { p: "Open Settings → Esobold for options specific to this app:" },
                { list: [
                    "World tree and saves: choose how branches are displayed and how local saves are stored. Running memory can create automatic summaries in World Info.",
                    "Conversation context: Turns max content and Turns old content ratio limit the amount of old conversation sent to the AI. This can reduce the time spent reading long prompts.",
                    "Mods: open the manager for optional third-party add-ons.",
                ] },
                { p: "Settings → GUI changes colors, fonts and layout, and has options for the context usage bar and larger editors." },
            ],
            show: [
                { label: "Open Settings → Esobold", run: (ctx) => ctx.openSettings("esobold") },
            ],
        },
    {
        "id": "settings-reference",
        "title": "Esobold settings: behavior, saving and context",
        "blocks": [
            {
                "table": [
                    [
                        "Settings → Esobold",
                        "Behavior"
                    ],
                    [
                        "Disables save compression locally",
                        "Makes local saving quicker by skipping compression; local data takes more space. Shared and main-server uploads remain compressed."
                    ],
                    [
                        "Enable running memory",
                        "Creates summary notes in World Info using extra AI requests. Review the summaries for mistakes."
                    ],
                    [
                        "World tree prune / depth / show all",
                        "Simplifies branches or shows fewer nearby points to keep large trees easier to browse. Show all displays the entire tree."
                    ],
                    [
                        "Use new editor",
                        "Adds Raw, Markdown and Render views. Check Raw after edits if exact formatting matters."
                    ],
                    [
                        "Save options (legacy)",
                        "Shows older save-slot controls kept for compatibility. For normal saves and backups, hover over the Library tab and use Q.Save or Download."
                    ],
                    [
                        "Overwrite character on name collision",
                        "Replaces an existing character with the same displayed name. When off, new entries get numbered names."
                    ],
                    [
                        "Third-party mods",
                        "Opens the add-on manager. Review its warning before allowing third-party code."
                    ],
                    [
                        "Turns max content / Turns old content ratio",
                        "Limit older conversation text included in a request. Both values must be nonzero for this trimming feature."
                    ]
                ]
            },
            {
                "p": "Settings → Agent controls automated plans, repeat/history limits, continuing, streaming replies, input/error handling, saved macros, file-reading limits, syntax checks and the OpenLumara listener. Settings → Tools chooses which groups or individual tools the agent is Allowed to use."
            },
            {
                "tip": "Confirm the dialog after changing settings. Some options also need a model or server feature that may not be available on your current connection."
            }
        ],
        "show": [
            { label: "Esobold behavior settings", run: (ctx) => ctx.openSettings("esobold") },
            { label: "Agent settings", run: (ctx) => ctx.openSettings("esoboldAgent") }
        ]
    },
    {
        "id": "theme-and-gui",
        "title": "Themes, fonts, layout and display controls",
        "blocks": [
            {
                "list": [
                    "Open Settings → GUI for theme colors, the context usage chart, fullscreen text-field buttons and automatic left-panel minimization in Corpo.",
                    "Choose a bundled theme, then adjust available fonts, sizes and colors if needed. These choices change how the page looks, not how the AI generates replies.",
                    "Classic, Messenger, Aesthetic and Corpo arrange the same session differently. Some layouts have different positions or support for agent and embedded-view controls.",
                    "The input box may show changing decorative hints. A hint is not your submitted message and is not a reply from the AI."
                ]
            },
            {
                "tip": "Choose readable text and background colors. If a layout becomes difficult to use, return to a familiar theme or layout; you do not need to change the story."
            }
        ],
        "show": [
            { label: "GUI and theme controls", run: (ctx) => ctx.openSettings("appearance") }
        ]
    }
)
