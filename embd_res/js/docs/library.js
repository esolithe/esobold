/*
 * Native guide: library.
 * Sources: characterManager.js, tavernTool.js, fileUtils.js, autosaveToServer.js, serverSideSaving.js, encryptUtils.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.library.chapters.push(
    {
            id: "library", title: "Library and saves",
            blocks: [
                { p: "The Library holds characters, saved sessions, lorebooks and documents. Local items are stored in your browser. A server Library is available only when the server is configured to store them." },
                { list: [
                    "Import a character card, save or lorebook, or create a character with New Character.",
                    "Hover over the Library tab for Q.Save, Download, Load, New Character and Share.",
                    "Use Quick Start to choose Library items for a new session.",
                ] },
            ],
            show: [
                { label: "Library", run: (ctx) => ctx.highlight(ctx.navLink("Library"), "Hover over the Library tab for save, download and character shortcuts") },
                { label: "Open the Library", run: (ctx) => ctx.run(() => showCharacterList()) },
            ],
        },
    {
            id: "quick-start", title: "Quick Start",
            blocks: [
                { p: "Quick Start combines the Library items you want for a session. Leave any selection blank if you do not need it:" },
                { list: [
                    "A save: continue an existing conversation or story.",
                    "A main character: choose who the AI plays; additional characters add background information.",
                    "Your player character: describe the person you play.",
                    "World Info or lorebooks: add reference notes about places, people or the setting.",
                ] },
                { p: "Choose your items and press Confirm. For example, pick a lighthouse-keeper character and a coastal-town lorebook, without selecting a save, to start a fresh session. Mods may add further choices." },
            ],
            show: [
                { label: "Open Quick Start", run: (ctx) => ctx.run(() => showQuickStartPopup()) },
            ],
        },
    {
        "id": "library-items",
        "title": "Library item types and navigation",
        "blocks": [
            {
                "table": [
                    [
                        "Item",
                        "Use"
                    ],
                    [
                        "Character card",
                        "A description of a character. Quick Start can use it as the main AI character, an additional character or your player identity."
                    ],
                    [
                        "Save/autosave",
                        "A stored conversation or story. Loading it changes the current session. An autosave is an automatically saved copy associated with a Library save."
                    ],
                    [
                        "Lorebook / World Info",
                        "Setting notes selected when their keywords appear, such as a harbor description triggered by “harbor”. Import them into the Library or a World Info group."
                    ],
                    [
                        "Document",
                        "Text the AI can search through TextDB. Some file types need a server to extract their text; reading images also needs an image-capable AI."
                    ],
                    [
                        "Scenario / legacy slot",
                        "Older save and scenario choices, shown when Save options (legacy) is enabled."
                    ]
                ]
            },
            {
                "list": [
                    "Open Library and use the item-type sections and search to find an entry. Marking an item as a favorite makes it easier to find; it does not create another copy.",
                    "Use the add/upload tile for the section you want. To create a character, hover over the Library tab and choose New Character.",
                    "Quick Start loads a selected save first, then adds the main character, additional and player characters, selected lorebooks and any mod choices.",
                    "If a selection fails, read the error and check which items were loaded before saving or continuing."
                ]
            }
        ],
        "show": [
            { label: "Library", run: (ctx) => ctx.highlight(ctx.navLink("Library"), "Browse item types, favorites and search") }
        ]
    },
    {
        "id": "cards-and-imports",
        "title": "Character cards and bulk imports",
        "blocks": [
            {
                "list": [
                    "Import character cards as compatible PNG or JSON files. PNG cards store the character description inside the image file; changing the picture alone does not change that description. Legacy and Tavern V2 cards are supported.",
                    "In New Character, fill in the character's identity, description/personality, scenario, greeting and example messages. For example: name “Lena”, description “A patient radio mechanic”, scenario “Repairing a lighthouse radio”. These give the AI background for the role. Review imported fields before starting.",
                    "ZIP export downloads several Library entries together. ZIP import adds supported entries through the same import process as individual files; review any files reported as rejected.",
                    "Overwrite character on name collision decides what happens when a displayed name already exists: replace it when enabled, or add a numbered name when disabled. Internal Library filenames may differ from displayed names."
                ]
            },
            {
                "tip": "Download a copy before replacing a card. Converting between older and newer card formats may leave out fields that the destination format does not support."
            }
        ]
    },
    {
        "id": "library-saves",
        "title": "Quick saves, autosaves and browser storage",
        "blocks": [
            {
                "list": [
                    "Hover over the Library tab. Q.Save asks for a name and stores the current session in your browser Library. Download saves a file you can keep, copy to another device or import later.",
                    "Autosaves can keep recent copies associated with a Library save. If server synchronization is enabled, uploads happen periodically rather than after every edit.",
                    "For quicker local saving, enable Settings → Esobold → Disables save compression locally. The saved data takes more space as a result. Shared saves and main-server uploads still use compression.",
                    "Before changing browsers or website addresses, download the saves you need and import them in the new Library. Do not clear browser data while it holds your only copy."
                ]
            },
            {
                "tip": "Saving locally does not automatically save to the server. Back up both regularly: download important sessions and check server synchronization if you use it."
            }
        ],
        "show": [
            { label: "Library", run: (ctx) => ctx.highlight(ctx.navLink("Library"), "Quick-save and download shortcuts") }
        ]
    },
    {
        "id": "remote-library",
        "title": "Server Library and synchronization",
        "blocks": [
            {
                "list": [
                    "A server Library keeps supported items on the Esobold server rather than only in your browser. It must be enabled by the server owner; it is separate from loading an AI model.",
                    "Library synchronization sends your Library items and their details to the configured server. When remote items are fetched, their details are added to the local Library.",
                    "Local changes may prompt you to synchronize. Complete the upload and check that the server has your items; keep downloaded copies of important saves as well.",
                    "If a save offers password protection, encryption happens in your browser. The password used to open a save is separate from any password used to access the server."
                ]
            },
            {
                "tip": "Save encryption provides basic protection. Do not store passwords or secrets in a save, and do not rely on it as your only way to protect sensitive information."
            }
        ]
    }
)
