/*
 * Native guide: context.
 * Sources: contextUsage.js, documentParser.js, embeddingPreset.js, authorNotePositioningUtils.js, runningMemory.js, hearthfireContext.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "context", title: "Context: what the AI can see",
            blocks: [
                { p: "Context is the text the AI receives when answering: your current message, the recent conversation and any notes or reference material added to that request. The AI has a limited amount of room for this text. Adding context does not train or permanently change the model." },
                { p: "Open Context to prepare information that is not in the conversation. Use the Memory, World Info and TextDB tabs according to what you want to add:" },
                { table: [
                    ["Information", "Where to put it", "Example"],
                    ["Stable setting or facts", "Context → Memory → Memory", "“The story takes place in a coastal town. Lena is repairing its lighthouse.”"],
                    ["Opening background or sample dialogue", "Context → Memory → Temporary Memory", "“Earlier today, Lena received a letter asking her to inspect the radio.”"],
                    ["Current style or scene direction", "Context → Memory → Author's Note", "“Keep the scene calm and describe the sounds of the harbor.”"],
                    ["Facts needed when a topic appears", "Context → World Info", "Keyword: “harbor”; entry: “The harbor closes to large ships at dusk.”"],
                    ["Reference documents", "Context → TextDB", "Add harbor_rules.txt containing ferry times and harbor rules, then search for a relevant passage."],
                    ["A character to use in a session", "Hover over the Library tab → New Character; then choose it in Quick Start", "Name: Lena; description: a patient radio mechanic; scenario: repairing the lighthouse."],
                ] },
                { p: "The usage bar beside the connection status shows how much context is being used. Click it for details; keep notes short so there is room for conversation and the next reply." },
            ],
            show: [
                { label: "Context button", run: (ctx) => ctx.highlight("#btn_actmem", "Open the Memory, World Info or TextDB tab") },
                { label: "Context usage", run: (ctx) => ctx.highlight("#contextUsageInline", "Click to see how much room remains for context") },
            ],
        },
    {
        "id": "memory-and-world-info",
        "title": "Memory, World Info and Author’s Note",
        "blocks": [
            {
                "table": [
                    ["Field", "When to use it"],
                    ["Memory", "Facts you want included at the start of each request. Keep the setting and important ongoing details here."],
                    ["Temporary Memory", "Opening background placed before the conversation. As the conversation fills the available space, this older text can be trimmed out; it is not a one-message note."],
                    ["World Info", "Separate entries selected by keywords, such as a place name. Constant entries are included without a keyword; disabled entries are left out. Groups organize related entries and can be imported/exported."],
                    ["Author's Note", "A short reminder placed near recent text, such as a tone or scene direction. The template wraps the note; A/N Strength changes its position."],
                    ["TextDB", "Reference text searched for relevant passages. Selected passages are added to the request rather than the entire document."],
                ]
            },
            {
                "p": "In Context → Memory, write the setting in Memory, opening background in Temporary Memory, and a short current direction in Author's Note. Leave Author's Note Template at its existing value unless you need a different wrapper: <|> is replaced by your note. The Turn-based Author's Note chapter explains placing a note relative to messages."
            },
            {
                "tip": "Check the usage bar after adding notes or lore. Closing a panel only hides it; it does not remove the text you entered."
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
                    "Open Context → TextDB and add a named document. For example, add harbor_rules.txt with a few paragraphs about the town, then search for ferry times. Choose whether conversation history should also be searchable.",
                    "Search may use an embedding model, which turns text into numbers so related passages can be found. Use an appropriate preset for that model; query/document prefixes are short instructions some embedding models require before search text.",
                    "Snippet count controls how many passages are added to the request. Chunk size sets the length of each passage; overlap repeats some text between neighboring passages. Start small and check the context usage bar before increasing them.",
                    "When the server supports document search, results can also include files stored on it. Filesystem regex search is a separate way to find exact text patterns, not the same as searching for related meaning."
                ]
            },
            {
                "tip": "PDF and office-file import may need server-side text conversion. Image reading needs an image-capable model and may miss details. For JSON lorebooks or character cards, use their dedicated Library import options; arbitrary JSON-to-document conversion is broken in this version."
            }
        ]
    },
    {
        "id": "context-budget",
        "title": "Context usage and sliding turns",
        "blocks": [
            {
                "list": [
                    "Click the usage bar beside connection status to see the detailed breakdown, and drag the popup if it covers your work. Show or hide the bar in Settings → GUI.",
                    "The display uses the server's last input-token count when available; otherwise it estimates from text length. A token is a small piece of text used by the model, so estimates can differ between models.",
                    "Settings → Esobold → Turns max content limits how much conversation text is kept. Turns old content ratio chooses how much older conversation to retain. Leave room separately for Memory, World Info, notes, instructions and the next reply.",
                    "Both Turns max content and Turns old content ratio need a nonzero value for this trimming feature to run in this version. Setting the ratio to zero turns this path off; it does not mean “keep only the newest turns”."
                ]
            },
            {
                "tip": "The browser cannot increase the model's actual context limit. If requests are too large, shorten your notes or conversation and leave more space for the reply."
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
                    "Running memory creates automatic summaries to help retain older story details. Enable it in Settings → Esobold if you want this; a check requests a summary after the story has grown by roughly half the configured context window.",
                    "Summaries appear as constant World Info entries. Only a limited set of recent summaries is kept, and starting or loading a session resets the growth check. Review and edit summaries because the AI may omit or change details.",
                    "Summarizing uses extra AI requests. Keep important facts in your own Memory notes and download backups; an automatic summary is not a saved copy of the story.",
                    "Context prewarming, also called Hearthfire context, is an experimental extra request intended to prepare changed context. Its control is hidden because it is buggy in this version; it is not part of the normal setup."
                ]
            }
        ],
        "show": [
            { label: "Running-memory settings", run: (ctx) => ctx.openSettings("esobold") }
        ]
    },
    {
        id: "turn-based-authors-note",
        title: "Turn-based Author's Note",
        blocks: [
            { p: "Use a turn-based note when you want your reminder placed before a particular recent message rather than a fixed distance in the text. It changes what is sent to the AI, not the visible conversation." },
            { list: [
                "Open Context → Memory and enter a short Author's Note, for example “Keep the lighthouse scene quiet and focus on the radio repair.”",
                "In A/N Strength, choose Turn based. The Insert author's note controls appear below it.",
                "Set the number of turns before the end, then choose user, ai or system, or leave the role blank to count all supported turns.",
                "For example, offset 1 with user places the note before the most recent user turn. Offset 2 goes back to the second matching user turn. Offset 0 appends the note at the end of the prepared context.",
            ] },
            { table: [
                ["Usage mode", "What counts as a turn"],
                ["Instruct", "The enabled start/end role tags mark turns. Enable those tags in the Instruct formatting settings. The system role uses the system tag."],
                ["Chat", "The player and AI character names mark turns. Choose user, ai or blank; system is not a separate Chat boundary."],
                ["Adventure", "Action markers count as user turns, regardless of the role selector."],
                ["Story", "Paragraphs separated by a blank line count as turns, regardless of the role selector."],
            ] },
            { tip: "If there are not enough matching turns, the note is placed at the beginning of the prepared context. Start with a small offset. Return to Weak, Medium, Strong or Immediate to use ordinary distance-based placement." },
        ],
        show: [
            { label: "Open the Context controls", run: (ctx) => ctx.highlight("#btn_actmem", "Open Context → Memory, then choose Turn based in A/N Strength") },
        ],
    }
)
