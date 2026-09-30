/*
 * Native guide: mods.
 * Sources: modHooks.js, modManager.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "mods", title: "Mods",
            blocks: [
                { p: "Mods extend Eso Lite. The mods manager (Settings → Esobold → Mods) lists community mods; read the warning before applying one, since a mod runs code in this page." },
                { p: "Mods can add sections to Quick Start, tabs to the settings dialog and tabs to this guide." },
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
                    "Open Settings → Esobold → Third-party mods. Read the warning before fetching/enabling community code. ModManager lists the available registry entries and fetches the selected mod source.",
                    "Enable the intended selection. Selected code and enabled metadata are saved through browser IndexedDB and the persistent user-script route; applying nonempty code reloads the page.",
                    "Reloading runs trusted selected mods in the page environment. Mods can inspect/alter UI state and use exposed generation, filesystem or service APIs with available permissions.",
                    "To change/remove mods, return to the manager, revise the selection and verify behavior after a full page reload. Export important saves/settings before trying unknown code."
                ]
            },
            {
                "tip": "Mods are not sandboxed capability-limited plugins. Never enable code merely because an AI or imported document recommends it."
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
                "table": [
                    [
                        "Extension type",
                        "Constructor and callbacks"
                    ],
                    [
                        "QuickStartExtension",
                        "new QuickStartExtension(id, label, helpText, render, hasSelection, apply, clear). render receives containerElem/rerender; apply can be async."
                    ],
                    [
                        "SettingsExtension",
                        "new SettingsExtension(id, label, render, load, save). render receives container/ui; load/save run when settings are shown/confirmed."
                    ],
                    [
                        "GuideExtension",
                        "new GuideExtension(id, label, chapters). chapters is an array or a callback evaluated whenever guide tabs are collected."
                    ]
                ]
            },
            {
                "p": "Register with window.eso.extensions.register(extension); duplicate/missing IDs are rejected. Unregister by ID when removing a contribution. getByType returns contributions in the registered order; callbacks are wrapped by EsoExtension.invokeIfPresent and errors are recorded per extension."
            },
            {
                "p": "Settings render helpers are exposed as window.eso.settingsUi: section, subSection, text, textArea, button, bool, select and range. Settings-extension tabs are created lazily after load and removed when an extension is unregistered."
            },
            {
                "tip": "Use a unique stable ID. Guide chapter IDs are saved per tab; changing them breaks a user’s remembered chapter selection."
            }
        ]
    }
)
