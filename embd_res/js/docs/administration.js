/*
 * Native guide: administration.
 * Sources: reloadUtils.js, hfModelSearcher.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "backend-administration",
        "title": "Backend administration and reload prerequisites",
        "blocks": [
            {
                "table": [
                    [
                        "Launcher option",
                        "Purpose"
                    ],
                    [
                        "--admin",
                        "Enable remote management."
                    ],
                    [
                        "--adminpassword PASSWORD",
                        "Set management authentication; do not put it in shared screenshots or saves."
                    ],
                    [
                        "--admindir DIRECTORY",
                        "Directory of reloadable .kcpps configs."
                    ],
                    [
                        "--admintextmodelsdir DIRECTORY",
                        "Selectable text-model directory, allowing a model override on a config."
                    ],
                    [
                        "--admindatadir DIRECTORY",
                        "Persistent server-side data database directory."
                    ],
                    [
                        "--adminallowhf",
                        "Allow backend-controlled Hugging Face model downloading."
                    ]
                ]
            },
            {
                "list": [
                    "Configure the directories/password in the backend launcher’s admin tab or command line before using remote management. The frontend cannot grant itself missing admin capabilities.",
                    "Config and model selections are related but distinct: a model override can reuse an appropriate configuration rather than requiring one config per file.",
                    "Keep active requests and other users in mind before a reload; loading a model changes the backend for everyone using that service."
                ]
            },
            {
                "tip": "Exposing an admin-enabled service without suitable access controls risks model/state changes and data access. Use trusted configs and server-side authentication."
            }
        ]
    },
    {
        "id": "reload-workflow",
        "title": "Reload configs/models and connection recovery",
        "blocks": [
            {
                "list": [
                    "Select the desired server config and optional model in the administration controls, then request reload. Review that the selected file belongs to the backend’s configured directory.",
                    "ReloadUtils.waitForCompletion waits for outstanding requests; triggerReload posts filename/modelName to the admin reload route; reloadAndWait waits for the server to reconnect.",
                    "The UI refreshes current config/model information and reconnects supported image-backend state after a successful reload. A temporary disconnected state is expected while the model changes.",
                    "Rejected reloads, authentication errors and recovery timeouts are not success. Confirm the reported active config/model and connection before submitting another generation."
                ]
            },
            {
                "tip": "This guide’s browser verification does not load or reload any model. Use the backend’s logs and actual connection state to verify an administration operation."
            }
        ]
    },
    {
        "id": "hf-model-search",
        "title": "Hugging Face search and download choices",
        "blocks": [
            {
                "list": [
                    "When backend HF downloading is enabled, enter a repository/model search term, choose a matching model/repository and select a quantized file. The helper constructs a direct download URL from that selection.",
                    "Check the exact filename, file size, license and architecture before downloading. A text-name match is not evidence that the model fits memory or supports the selected backend/template.",
                    "Choose a quant explicitly: the reviewed helper’s priority loop uses array indices rather than the intended quant-name values, so its default/preferred file choice is not reliable.",
                    "The download destination belongs to the backend’s configured model directory, not the browser’s Library. Model downloads and later reloads are separate operations."
                ]
            },
            {
                "tip": "Check server disk space first. Do not assume a download completed or a new model loaded merely because search returned a result."
            }
        ]
    }
)
