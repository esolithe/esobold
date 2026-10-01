/*
 * Native guide: mods.
 * Sources: modHooks.js, modManager.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.integrations.chapters.push(
    {
            id: "mods", title: "Mods",
            blocks: [
                { p: "Mods are optional add-ons that change or extend Esobold. Open Settings → Esobold → Third-party mods to browse them. Read the warning first: a mod runs code in your browser page." },
                { p: "A mod can add Quick Start choices, settings tabs or extra tabs in this guide. Only enable add-ons from sources you trust." },
            ],
            show: [
                { label: "Open Settings → Esobold", run: (ctx) => ctx.openSettings("esobold") },
            ],
        },
    {
        "id": "mod-manager",
        "title": "Third-party mods: install, persistence and removal",
        "blocks": [
            {
                "list": [
                    "Open Settings → Esobold → Third-party mods and read the warning. The manager lists available community add-ons and fetches the ones you select.",
                    "Enable the selection you want. The browser saves the selected code and choices for later visits; applying code reloads the page.",
                    "Enabled mods run when the page loads. They can read or change interface data and use the page's available AI, file and service functions.",
                    "To remove or change a mod, return to the manager, change the selection and reload the page. Download important saves before trying unfamiliar add-ons."
                ]
            },
            {
                "tip": "A mod is executable code, not just a theme or note. Do not enable one solely because an AI or imported document tells you to."
            }
        ],
        "show": [
            { label: "Third-party mod manager", run: (ctx) => ctx.openSettings("esobold") }
        ]
    },
    {
        "id": "extension-contracts",
        "title": "Extension API: Quick Start, Settings and Guide",
        "blocks": [
            {
                "p": "Optional reference for people writing mods: these extension types add Quick Start choices, settings tabs or guide tabs. Ordinary users do not need to call them."
            },
            {
                "table": [
                    [
                        "Extension type",
                        "Constructor and callbacks"
                    ],
                    [
                        "QuickStartExtension",
                        "new QuickStartExtension(id, label, helpText, render, hasSelection, apply, clear). render gets containerElem/rerender; apply can finish asynchronously."
                    ],
                    [
                        "SettingsExtension",
                        "new SettingsExtension(id, label, render, load, save). render gets container/ui; load and save run when settings open and are confirmed."
                    ],
                    [
                        "GuideExtension",
                        "new GuideExtension(id, label, chapters). Supply a chapter array or a callback that returns chapters when the guide collects its tabs."
                    ]
                ]
            },
            {
                "p": "Register with window.eso.extensions.register(extension) and unregister by ID to remove it. IDs must exist and be unique. getByType returns extensions in registration order; EsoExtension.invokeIfPresent runs callbacks and records errors for the affected extension."
            },
            {
                "p": "window.eso.settingsUi supplies section, subSection, text, textArea, button, bool, select and range helpers. Settings tabs are created after loading when needed, and removed when their extension is unregistered."
            },
            {
                "tip": "Keep extension and chapter IDs unique and stable. The browser remembers the selected guide chapter by ID."
            }
        ]
    }
)

export default function load() {}   