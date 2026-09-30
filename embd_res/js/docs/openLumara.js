/*
 * Native guide: openLumara.
 * Sources: openlumara_client.js, openlumaraAuthUtils.js, agent/agent_openlumara.js, agent/agent_openlumarapolling.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "lumara-connection",
        "title": "OpenLumara: connection, identity and status",
        "blocks": [
            {
                "list": [
                    "When the backend advertises OpenLumara support, Add Media includes an OpenLumara entry. Authentication is a separate OpenLumara identity/session, not the model-provider key or server-save password.",
                    "If login is required, the identity dialog validates a cached session or asks for username/password. Cancel leaves the requested action unperformed; concurrent requests share one in-flight authentication operation.",
                    "OpenlumaraClient connects through HTTP endpoints and its websocket. getStatus, listModels, reconnect and disconnect report/control the service connection.",
                    "A successful Esobold text-model connection does not prove that OpenLumara is connected, authenticated or using the same model. Check lumara_status and the listener status indicator."
                ]
            },
            {
                "tip": "Do not share session tokens or debug request headers. Clearing the cached OpenLumara token forces a fresh identity check; it does not alter unrelated service credentials."
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
                        "Send a message and receive/stream a response through the OpenLumara service."
                    ],
                    [
                        "lumara_get_messages / getMessagesSince",
                        "Retrieve current history or newer turns; streamed tool requests/results are represented with the assistant turn."
                    ],
                    [
                        "lumara_list_chats / lumara_load_chat",
                        "List/select a remote chat. Loading changes the current remote conversation."
                    ],
                    [
                        "lumara_new_chat / lumara_rename_chat",
                        "Create a conversation or change its title."
                    ],
                    [
                        "lumara_clear_chat / deleteChat",
                        "Clear current messages or delete a chat via the client API; review before destructive use."
                    ],
                    [
                        "editMessage / deleteMessage / upload",
                        "Change remote message history or upload files, with the service’s own permissions."
                    ]
                ]
            },
            {
                "p": "The client also exposes tags, settings and storage CRUD operations plus restartServer. These are service-state changes, not changes to Esobold’s local Library or the host model-provider settings."
            },
            {
                "tip": "Remote changes are not automatically undone by clearing the visible Esobold chat or stopping a generation."
            }
        ]
    },
    {
        "id": "lumara-live-updates",
        "title": "OpenLumara live updates and streaming",
        "blocks": [
            {
                "list": [
                    "Enable the OpenLumara listener under Settings → Agent to receive live websocket updates in the agent UI. Its status indicator distinguishes connection/listening state.",
                    "The listener accumulates message/tool-call deltas into turn snapshots, collapses duplicate message indices and renders completed turns to chat. It is not a new generation request for every displayed fragment.",
                    "Disconnects trigger scheduled reconnect attempts every 60 seconds while the listener is enabled. Turning the listener off stops its reconnect loop and visual stream state.",
                    "Both command-triggered streaming and the background listener share service identity/connection state. Check current chat selection when responses appear in an unexpected conversation."
                ]
            },
            {
                "tip": "The hidden legacy polling-rate slider is not an independent live polling guarantee; this revision’s listener primarily uses websocket events."
            }
        ],
        "show": [
            { label: "OpenLumara listener and status", run: (ctx) => ctx.openSettings("esoboldAgent") }
        ]
    }
)
