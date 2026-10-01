/*
 * Native guide: openLumara.
 * Sources: openlumara_client.js, openlumaraAuthUtils.js, agent/agent_openlumara.js, agent/agent_openlumarapolling.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.integrations.chapters.push(
    {
        "id": "lumara-connection",
        "title": "OpenLumara: connection, identity and status",
        "blocks": [
            {
                "list": [
                    "OpenLumara is a separate service for chats and model operations. Click Media in the story/chat controls to find its entry when your Esobold server supports it. Its login is separate from your AI provider key or server Library password.",
                    "If a login is needed, enter your OpenLumara username/password or use the saved session. Cancel leaves the requested action undone; simultaneous requests use the same login check.",
                    "The client connects to the service and receives live updates. getStatus checks it, listModels lists its models, and reconnect/disconnect change the connection.",
                    "Check lumara_status or the listener indicator before using it. Connecting to an Esobold text model does not also connect you to OpenLumara or select the same model there."
                ]
            },
            {
                "tip": "Keep OpenLumara login details private, including the saved session token that keeps you signed in. Clearing that saved login asks you to sign in again without changing your other service keys."
            }
        ]
    },
    {
        "id": "lumara-chats",
        "title": "OpenLumara chats, messages and uploads",
        "blocks": [
            {
                "table": [
                    [
                        "Operation",
                        "Effect"
                    ],
                    [
                        "lumara_send / sendMessage / stream",
                        "Send a message to OpenLumara and receive its reply, optionally as text arrives."
                    ],
                    [
                        "lumara_get_messages / getMessagesSince",
                        "Read the conversation or newer messages. Tool requests and results are included with the AI turn."
                    ],
                    [
                        "lumara_list_chats / lumara_load_chat",
                        "List chats or select one. Loading changes the conversation used by OpenLumara."
                    ],
                    [
                        "lumara_new_chat / lumara_rename_chat",
                        "Start a new chat or change its title."
                    ],
                    [
                        "lumara_clear_chat / deleteChat",
                        "Clear messages or delete a chat. Keep anything you need before confirming."
                    ],
                    [
                        "editMessage / deleteMessage / upload",
                        "Edit or delete remote messages, or upload a file using the service's permissions."
                    ]
                ]
            },
            {
                "p": "The programming client can also create, read, change and delete tags, settings and stored data, or call restartServer. These actions affect OpenLumara, not your Esobold browser Library or a different provider's settings."
            },
            {
                "tip": "Clearing the visible Esobold conversation or stopping a reply does not undo changes already made in OpenLumara."
            }
        ]
    },
    {
        "id": "lumara-live-updates",
        "title": "OpenLumara live updates and streaming",
        "blocks": [
            {
                "list": [
                    "Enable the OpenLumara listener in Settings → Agent to show incoming service updates. The status indicator shows whether it is connected and listening.",
                    "Updates arrive in small pieces and are combined into conversation turns. Repeated message entries are combined; displaying each piece does not generate a new reply.",
                    "While enabled, the listener tries to reconnect every 60 seconds after a disconnect. Turn it off to stop reconnecting and showing live updates.",
                    "The listener and command-triggered streaming share the same login and connection. Check the selected OpenLumara chat if messages appear in an unexpected conversation."
                ]
            },
            {
                "tip": "The old polling-rate slider is hidden. Live updates mainly arrive through the service connection rather than a separate polling interval."
            }
        ],
        "show": [
            { label: "OpenLumara listener and status", run: (ctx) => ctx.openSettings("esoboldAgent") }
        ]
    }
)
