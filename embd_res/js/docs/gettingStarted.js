/*
 * Native guide: gettingStarted.
 * Sources: esoWelcome.js, esoGlobals.js, enableAllEndpointsLocally.js, newTopMenuButtons.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "welcome", title: "Welcome to Eso Lite",
            blocks: [
                { p: "Eso Lite is Esobold's version of KoboldAI Lite: a browser app for writing stories, chatting and working with an AI. It adds a Library, Quick Start, a world tree of your story's branches, agent mode and more." },
                { p: "The chapters are short. Read them in order the first time; the \"Show me\" buttons point at the part of the screen being explained." },
                { tip: "You can come back at any time with Guide in the top bar. Mods can add their own tabs to this window." },
            ],
            show: [
                { label: "Where is the Guide?", run: (ctx) => ctx.highlight("#topbtn_guide", "Opens this guide") },
            ],
        },
    {
            id: "connect", title: "Connect an AI",
            blocks: [
                { p: "Eso Lite does not run a model itself; it talks to one. Use AI in the top bar to choose where the AI runs:" },
                { list: [
                    "KoboldCpp or Esobold running on your computer or server (usually connected automatically when Eso Lite is opened from it).",
                    "AI Horde: free models run by volunteers; no setup, but slower and with a queue.",
                    "Online providers with an API key, such as OpenAI-compatible services or Claude.",
                ] },
                { p: "The connection status is shown on the right of the top bar." },
            ],
            show: [
                { label: "AI", run: (ctx) => ctx.highlight(ctx.navLink("AI"), "Choose where the AI runs") },
                { label: "Connection status", run: (ctx) => ctx.highlight("#connectstatusdiv", "Shows which AI you are connected to") },
            ],
        },
    {
            id: "first-message", title: "Modes and your first message",
            blocks: [
                { p: "Settings → General → Usage mode decides how the AI answers:" },
                { table: [
                    ["Mode", "Use it for"],
                    ["Instruct", "Giving the AI tasks or questions, like an assistant. Generally, this mode can also be used for chatting with a character - especially if models focus on instruction following (which is many modern models)."],
                    ["Chat", "Talking with a character."],
                    ["Adventure", "Text adventures: you describe actions, the AI tells what happens."],
                    ["Story", "Writing a story together; the AI acts as your cowriter, continuing your text in a freeform way."],
                ] },
                { p: "Type into the box at the bottom and press Submit. Undo removes the last step, Redo brings it back and Retry asks for a new answer. Tick Allow Editing to change the story text directly." },
            ],
            show: [
                { label: "Input box", run: (ctx) => ctx.highlight("#input_text", "Type here, then press Submit") },
                { label: "Undo, Redo, Retry", run: (ctx) => ctx.highlight("#btn_actundo", "Undo, Redo and Retry sit together here") },
                { label: "Open Settings → General", run: (ctx) => ctx.openSettings("general") },
            ],
        },
    {
        "id": "connection-workflow",
        "title": "Connections, providers and availability",
        "blocks": [
            {
                "list": [
                    "Open AI in the top bar, select an endpoint type, enter its base URL and any required key, then connect. A local Esobold page can use its own backend; remote providers and AI Horde are separate choices.",
                    "Check the connection status before submitting. A reachable server is not proof that image, audio, embeddings, filesystem or administration is enabled.",
                    "For an online provider, choose a model supported by that provider and a matching API format. Instruct formatting and chat-completions tool support are separate concerns."
                ]
            },
            {
                "table": [
                    [
                        "Connection",
                        "What to expect"
                    ],
                    [
                        "Local Esobold/KoboldCpp",
                        "Backend capabilities and version determine which controls appear. Model execution happens on the backend, not in this browser."
                    ],
                    [
                        "AI Horde",
                        "Volunteer workers, model availability, queues and account/API-key settings affect requests. Local access does not make every remote endpoint available."
                    ],
                    [
                        "Online APIs",
                        "The selected provider receives the context and request. Its key, model names, rate limits and supported parameters apply."
                    ]
                ]
            },
            {
                "tip": "The local-endpoint visibility override exposes choices; it does not enable missing server features or bypass server authentication."
            }
        ],
        "show": [
            { label: "AI", run: (ctx) => ctx.highlight(ctx.navLink("AI"), "Configure or change the AI endpoint") },
            { label: "Connection status", run: (ctx) => ctx.highlight("#connectstatusdiv", "Check the active backend and connection state") }
        ]
    },
    {
        "id": "session-workflow",
        "title": "A normal writing session",
        "blocks": [
            {
                "list": [
                    "Choose Usage Mode under Settings → General. Set chat names/opponents or instruct role formatting for that mode.",
                    "Prepare Memory, World Info and any character information before a long session. These are context inputs, not a separately trained model.",
                    "Type a message and Submit. Wait for completion or use the stop/abort control to cancel the active request. Retry generates an alternative; Undo and Redo move through the current history.",
                    "Use Allow Editing for direct story changes. Save or export before large edits, branch switches, imports or backend reloads."
                ]
            },
            {
                "p": "Classic, Messenger and Aesthetic are presentation choices. They do not change which backend model is loaded. Esobold also supports the newer Raw/Markdown/Render editor and the world tree."
            },
            {
                "tip": "Browser state belongs to an origin and storage namespace. Moving between URLs, ports, browsers or local/non-local namespaces can make existing saves appear absent. Keep downloadable backups rather than relying on browser storage alone."
            }
        ],
        "show": [
            { label: "Input", run: (ctx) => ctx.highlight("#input_text", "Enter a message here") },
            { label: "Usage mode and names", run: (ctx) => ctx.openSettings("general") }
        ]
    },
    {
        "id": "data-and-trust",
        "title": "Data, credentials and trusted code",
        "blocks": [
            {
                "list": [
                    "Prompts, Memory, World Info, selected documents and attachments can be sent to the configured model service. Choose material you have permission to process.",
                    "Server saves, OpenLumara, MCP and model-provider credentials are separate services. A GitHub login is not required to read this guide or write local documentation.",
                    "Treat browser storage, imported code, third-party mods, runnable code blocks and external tool servers as trusted-code boundaries. They may see page data or act through configured services.",
                    "Before enabling automated tools, inspect the Allowed checkboxes and the destination of writes, uploads, messages and commands. Stop does not roll back completed side effects."
                ]
            },
            {
                "tip": "A confirmation dialog is a chance to review an action, not a security sandbox. Do not put credentials or private content into public shared saves, screenshots or debug logs."
            }
        ]
    }
)
