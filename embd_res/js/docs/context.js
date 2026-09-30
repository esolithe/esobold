/*
 * Native guide: context.
 * Sources: contextUsage.js, documentParser.js, embeddingPreset.js, authorNotePositioningUtils.js, runningMemory.js, hearthfireContext.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "context", title: "Memory, world info and TextDB",
            blocks: [
                { p: "The Context button opens what the AI knows besides the story itself:" },
                { list: [
                    "Memory: text that is always sent, such as a summary or the setting. This is one of the first things the AI always sees.",
                    "World Info: entries that are added when their keywords appear. Groups can be exported and imported as files. Similar to Lorebooks.",
                    "TextDB: documents the AI can search. Upload text, lorebooks or PDFs; with optional embedding support to improve the search.",
                ] },
                { p: "The context usage bar next to the connection status shows how full the AI's context is. Click it for details." },
            ],
            show: [
                { label: "Context button", run: (ctx) => ctx.highlight("#btn_actmem", "Memory, World Info and TextDB") },
                { label: "Context usage", run: (ctx) => ctx.highlight("#contextUsageInline", "How much of the context is used; click for details") },
            ],
        },
    {
        "id": "memory-and-world-info",
        "title": "Memory, World Info and Author’s Note",
        "blocks": [
            {
                "table": [
                    [
                        "Context layer",
                        "Behavior"
                    ],
                    [
                        "Memory / system information",
                        "Persistent text included with the request; keep it concise and relevant."
                    ],
                    [
                        "World Info",
                        "Entry keywords, secondary/anti keys, constant/selective flags, probability, groups and disabled state determine inclusion. Import/export groups independently."
                    ],
                    [
                        "Author’s Note",
                        "Near-context guidance with a template and insertion strength. It is additional prompt content, not a guaranteed behavioral rule."
                    ],
                    [
                        "TextDB",
                        "Retrieved snippets from supplied documents, optionally history and backend filesystem documents."
                    ]
                ]
            },
            {
                "p": "Author’s Note adds a turn-based placement option. Choose a turn offset and delimiter role (user, AI, system where supported, or any). Offset zero appends near the current end; if the requested earlier boundary cannot be found, insertion falls back to the beginning."
            },
            {
                "tip": "Inspect the actual context budget after adding lore or notes. Hiding a panel or reasoning display does not necessarily remove its content from a request."
            }
        ],
        "show": [
            { label: "Context", run: (ctx) => ctx.highlight("#btn_actmem", "Open Memory, World Info and TextDB") }
        ]
    },
    {
        "id": "textdb-workflow",
        "title": "TextDB, documents and retrieval",
        "blocks": [
            {
                "list": [
                    "Open Context and choose the TextDB/document controls. Add or replace a named document, configure retrieval and choose whether history is searchable. Lorebooks and World Info can also be imported into text-document workflows.",
                    "Configure query/document prefixes for the embedding model when needed. The preset helper recognizes several embedding model families, but explicit prefix choices should be checked for the active model.",
                    "Choose the number of snippets, chunk size and overlap appropriate to the context budget. Retrieval adds snippets to a model request; it does not guarantee relevance or factual correctness.",
                    "Search documents can combine TextDB/history snippets with server filesystem document snippets when searchable-doc and embedding capabilities are available. Filesystem regex search remains a distinct non-embedding operation."
                ]
            },
            {
                "tip": "PDF/office/binary text extraction depends on the server converter; image-to-text analysis depends on a vision-capable model and is not lossless OCR. In this source revision DocumentParser.extractTextFromB64’s JSON branch references a helper outside its scope; use the dedicated Library/lorebook import routes rather than assuming arbitrary JSON document conversion works."
            }
        ]
    },
    {
        "id": "context-budget",
        "title": "Context usage and sliding turns",
        "blocks": [
            {
                "list": [
                    "The inline usage bar next to connection status opens a draggable detailed popup. It separates prompt components and unused context; Settings → GUI controls whether the bar is shown.",
                    "The display uses server last_input_count when available, otherwise an approximate character-to-token estimate. Component percentages are estimates, not exact tokenizer accounting for every model.",
                    "Settings → Esobold → Turns max content limits story/agent turn content; reserve space separately for Memory, World Info, notes, system instructions and output. Turns old content ratio controls retained older content in that sliding window.",
                    "In the reviewed crop function both Turns max content and Turns old content ratio must be nonzero for this sliding-window path. A zero ratio is not a “keep only newest turns” guarantee."
                ]
            },
            {
                "tip": "The frontend context setting cannot enlarge the backend/model’s configured context. Leave output headroom and check real token usage when the backend provides it."
            }
        ],
        "show": [
            { label: "Usage bar", run: (ctx) => ctx.highlight("#contextUsageInline", "Open detailed context usage") },
            { label: "Sliding-turn settings", run: (ctx) => ctx.openSettings("esobold") }
        ]
    },
    {
        "id": "running-memory",
        "title": "Running memory and context prewarming",
        "blocks": [
            {
                "list": [
                    "Enable running memory under Settings → Esobold only if you want automatic model-generated summaries. A periodic check triggers when story length has grown by roughly half the configured context window.",
                    "Summaries are stored as constant World Info entries. The implementation retains a bounded set of recent summaries and resets its length baseline on new-game/load operations. Review and edit summaries like other model output.",
                    "Running memory uses additional generation requests and approximate character budgets. It can omit or distort details; it is not a substitute for a curated Memory or a backup.",
                    "Hearthfire context is a hidden experimental option in this revision. Its post-reply hook issues a one-token request to prewarm changed context; the UI intentionally hides it as buggy. It is not a normal supported switch to enable blindly."
                ]
            }
        ],
        "show": [
            { label: "Running-memory settings", run: (ctx) => ctx.openSettings("esobold") }
        ]
    }
)
