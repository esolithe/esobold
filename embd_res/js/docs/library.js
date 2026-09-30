/*
 * Native guide: library.
 * Sources: characterManager.js, tavernTool.js, fileUtils.js, autosaveToServer.js, serverSideSaving.js, encryptUtils.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "library", title: "Library and saves",
            blocks: [
                { p: "The Library keeps your characters, saves and lorebooks in the browser, and on the server when Esobold stores data there (Server saves)." },
                { list: [
                    "Import character cards (PNG or JSON), lorebooks, saves and even certain document types. You can also download characters from third party sources, or create a new character yourself!",
                    "Hover over Library for shortcuts: Q.Save (quick save), Download, Load, New Character and Share.",
                    "Items in the Library can be picked in Quick Start.",
                ] },
            ],
            show: [
                { label: "Library", run: (ctx) => ctx.highlight(ctx.navLink("Library"), "Characters, saves and lorebooks; hover for shortcuts") },
                { label: "Open the Library", run: (ctx) => ctx.run(() => showCharacterList()) },
            ],
        },
    {
            id: "quick-start", title: "Quick Start",
            blocks: [
                { p: "Quick Start sets up a session in one step. All choices are optional:" },
                { list: [
                    "a save to start from,",
                    "a main character and additional characters,",
                    "your player character,",
                    "world info / lorebook entries.",
                ] },
                { p: "Pick items from the Library, then press Confirm. Mods can add their own sections to Quick Start." },
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
                        "Main chat/instruct character, additional World Info character, or player identity in Quick Start."
                    ],
                    [
                        "Save/autosave",
                        "A stored session. Loading can replace the active session; autosaves belong to their associated library save/name."
                    ],
                    [
                        "Lorebook / World Info",
                        "Structured keyword-triggered context entries. Import into the Library or selected World Info groups."
                    ],
                    [
                        "Document",
                        "Text or converted document content for document/TextDB workflows. Binary conversion and image analysis require backend support."
                    ],
                    [
                        "Scenario / legacy slot",
                        "Older save/scenario routes remain available when Save options (legacy) is enabled."
                    ]
                ]
            },
            {
                "list": [
                    "Open Library; use its type sections and search to find entries. Favorites are metadata on library items, not a separate copy of the underlying card or save.",
                    "Use the add/upload tile for that section, or create a character through Library → New Character.",
                    "Quick Start keeps optional selections by role. Confirm loads a selected save first, then the main character, additional/player characters as World Info, selected lorebooks, and mod extensions.",
                    "A failed Quick Start selection is reported without pretending that every other selection was rolled back. Check the resulting session before saving."
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
                    "Import compatible PNG or JSON character cards. TavernTool reads embedded PNG text chunks and converts flat legacy and Tavern V2 card data. Changing a card image is not the same as changing its character definition.",
                    "The character creator edits card fields such as identity, description/personality, scenario, greetings and example-message formatting, plus image and character-book data where supported. Review imported fields before using them as instructions.",
                    "Bulk ZIP export gathers downloadable library entries; ZIP import routes each entry through the normal manager import handler. Check rejected or unsupported entries rather than assuming every archive member became a character.",
                    "Duplicate displayed names follow Overwrite character on name collision: replacement when enabled, unique numbered names when disabled. Library storage also uses internal IDs, so a displayed name is not necessarily the storage filename."
                ]
            },
            {
                "tip": "Export before replacing an existing entry. Do not assume that an arbitrary card format or extension is losslessly preserved by V1/V2 conversion."
            }
        ]
    },
    {
        "id": "library-saves",
        "title": "Quick saves, autosaves and browser storage",
        "blocks": [
            {
                "list": [
                    "Hover Library for Q.Save, Download, Load, New Character and Share. Q.Save asks for a name and stores the current full session in the library. Download creates a portable file instead of relying on browser storage.",
                    "Library autosave metadata includes the associated autosave name and retention/sync settings. Server autosave synchronization is periodic, not an immediate transaction after every edit.",
                    "Use Settings → Esobold → Disables save compression locally to trade local load/autosave compression work for larger local data. Sharing and main-server uploads retain their compression route.",
                    "Storage migrations separate IDs from names and import older metadata. If changing origin or namespace, export/import deliberately; do not clear browser data while it is your only copy."
                ]
            },
            {
                "tip": "A successful local save is not proof of a remote backup. Inspect the configured server-save route and keep a downloaded copy."
            }
        ],
        "show": [
            { label: "Library", run: (ctx) => ctx.highlight(ctx.navLink("Library"), "Quick-save and download shortcuts") }
        ]
    },
    {
        "id": "remote-library",
        "title": "Server saves and library synchronization",
        "blocks": [
            {
                "list": [
                    "Server-save availability requires the backend to advertise support. Configure or validate the remote data endpoint and supply the server administration credentials when asked.",
                    "The server-save popup supports listing/filtering entries, loading, uploading a local save or saving the current session, preview thumbnails, type/group metadata and deletion. A remote load changes the active session.",
                    "Library synchronization uploads library metadata and items, and hydration merges remote metadata into the local library. Local edits can prompt for synchronization; they are not automatically a verified remote backup.",
                    "Password-protected save data uses the existing client encrypt/decrypt format. A server administration password and a save-decryption password serve different purposes."
                ]
            },
            {
                "tip": "The reviewed save encryption uses AES-CBC with only 10 PBKDF2 iterations and no authenticated-encryption tag. Treat it as a legacy compatibility format, not modern strong password protection or integrity verification. Do not trust hostile encrypted saves or use this as a secrets vault."
            }
        ]
    }
)
