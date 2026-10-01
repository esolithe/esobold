/*
 * Native guide: administration.
 * Sources: reloadUtils.js, hfModelSearcher.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "backend-administration",
        "title": "Server administration: changing models and configuration",
        "blocks": [
            {
                "p": "Administration lets the server owner change loaded models and server settings from the browser. It is optional, affects everyone using that server and is separate from a Cloudflare remote tunnel. A no-model website or remote tunnel does not need admin enabled."
            },
            {
                "table": [
                    [
                        "Launcher option",
                        "Purpose"
                    ],
                    [
                        "--admin",
                        "Enable administration controls on the server."
                    ],
                    [
                        "--adminpassword PASSWORD",
                        "Require a management password. Keep it out of screenshots and shared saves."
                    ],
                    [
                        "--admindir DIRECTORY",
                        "Choose the folder of selectable .kcpps server configuration files."
                    ],
                    [
                        "--admintextmodelsdir DIRECTORY",
                        "Choose the folder of selectable text models. A model can be used with a suitable existing configuration."
                    ],
                    [
                        "--admindatadir DIRECTORY",
                        "Choose the folder for persistent server Library data."
                    ],
                    [
                        "--adminallowhf",
                        "Allow the server to download models from Hugging Face."
                    ]
                ]
            },
            {
                "list": [
                    "The server owner sets these folders and the password in the launcher's admin tab or command line. The browser cannot enable administration that is off at the server.",
                    "A configuration contains server settings; a model file contains the AI weights. Select a compatible pair rather than assuming every model needs a separate configuration.",
                    "Finish active requests and warn other users before reloading. Changing the model interrupts the shared server."
                ]
            },
            {
                "tip": "Only enable administration for people who should manage the server. Use a password, restrict access and load configuration files you trust."
            }
        ]
    },
    {
        "id": "reload-workflow",
        "title": "Reload configs/models and connection recovery",
        "blocks": [
            {
                "list": [
                    "When administration is available, select the server configuration and optional model in its controls, then request Reload. The file must be in the server's configured selection folder.",
                    "Reload waits for active requests to finish, sends your selected configuration and model to the server, then waits for the connection to return.",
                    "After a successful reload, the interface refreshes the active configuration/model and supported image connection. A temporary disconnect is normal while the new model loads.",
                    "If Reload is rejected, the password fails or reconnection times out, read the error. Check the reported active model and connection before sending another message."
                ]
            },
            {
                "tip": "Reloading really changes the server; it is not needed to read this guide. Check server logs and connection status if a reload fails."
            }
        ]
    },
    {
        "id": "hf-model-search",
        "title": "Hugging Face search and download choices",
        "blocks": [
            {
                "list": [
                    "If the server owner allows Hugging Face downloads, search for a model or repository and choose the exact file to download.",
                    "Check the filename, size, license and model type. A quantized model uses less memory than the full version; choose one that fits the server and is supported by its software.",
                    "Select the quantized file yourself. The automatic preferred-file choice is unreliable in this version, so check the exact filename rather than accepting its suggestion.",
                    "Downloads are saved in the server's model folder, not your browser Library. Downloading a file does not also load it as the active model."
                ]
            },
            {
                "tip": "Check free server disk space before downloading. Wait for the download to finish, then load the model separately if needed."
            }
        ]
    }
)
