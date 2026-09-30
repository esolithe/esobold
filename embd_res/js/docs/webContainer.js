/*
 * Native guide: webContainer.
 * Sources: webContainer.js, webContainerUtils.js, agent/agent_webContainer.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "container-overview",
        "title": "WebContainer: browser development environment",
        "blocks": [
            {
                "list": [
                    "WebContainer supplies a browser-contained Node/process filesystem environment. It is not a general host terminal, Python environment, GPU runner or direct SSH session.",
                    "The SDK is loaded as a module; await initialiseWebContainerAPIs() boots the instance and exposes webContainerFS. A supported browser and secure/cross-origin-isolated serving environment are required by the SDK.",
                    "Processes run inside the container. A server-ready event publishes webContainerDevPort and webContainerDevURL; openDevEmbeddedView shows that browser development page.",
                    "createSvelteEnv prepares a development project through the existing npm/process helpers. Package installation can require network access and executes downloaded package code."
                ]
            },
            {
                "tip": "Trust imported project code and dependencies before running them. A contained process can still communicate through exposed network/API capabilities or exported files."
            }
        ]
    },
    {
        "id": "container-processes",
        "title": "Processes, arguments, output and termination",
        "blocks": [
            {
                "table": [
                    [
                        "Helper/tool",
                        "Contract"
                    ],
                    [
                        "process(name).args(...).workingDirectory(...).env(...).spawn()",
                        "Build a spawn request for the container. ArgsHelper also exposes options/output/terminal configuration."
                    ],
                    [
                        "wc_spawn",
                        "Spawn with explicit args/cwd/env, optional terminal dimensions and agent output capture. It presents a command review confirmation."
                    ],
                    [
                        "listDirectoriesRunningProcesses / wc_listProcessesByDirectory",
                        "List tracked process records, optionally selected by working directory."
                    ],
                    [
                        "killProcesses / wc_killProcessesByDirectory",
                        "Terminate tracked processes for the chosen directory."
                    ],
                    [
                        "killAllProcesses / wc_killAllProcesses",
                        "Terminate all tracked container processes, not host processes."
                    ],
                    [
                        "wrapNPM",
                        "Run the existing npm wrapper with container arguments."
                    ]
                ]
            },
            {
                "p": "runContainerProcess tracks the spawned process, streams output, removes finished records and can return captured output plus exit status. A nonzero exit remains a failed command; captured/truncated text is not proof of success."
            },
            {
                "tip": "Do not close a development view and assume its server process stopped. Inspect the tracked process list and terminate it explicitly when needed."
            }
        ]
    },
    {
        "id": "container-files-and-transfers",
        "title": "Container filesystem and backend project transfers",
        "blocks": [
            {
                "table": [
                    [
                        "Direction / tools",
                        "Behavior"
                    ],
                    [
                        "wc_fs_readdir/readFile/writeFile/mkdir/rm",
                        "Operate on the WebContainer filesystem; text encoding and recursive flags come from the operation schema."
                    ],
                    [
                        "wc_loadLocalFileIntoContainerPath / wc_loadLocalDirIntoContainerDir",
                        "Copy from the Esobold backend FsClient root into the browser container. “Local” here does not mean an unrestricted desktop/host path."
                    ],
                    [
                        "wc_loadContainerFileIntoLocal / wc_loadContainerDirIntoLocalDir",
                        "Export container bytes back through FsClient into the backend managed filesystem."
                    ],
                    [
                        "Bulk directory helpers",
                        "Preserve relative directory structure and report copied-file/byte counts; failed copies are not an atomic rollback."
                    ]
                ]
            },
            {
                "list": [
                    "Initialize the container before using transfer helpers. Confirm source/destination paths and overwrite risks in the agent transfer review.",
                    "Use byte reads/writes for binary files. The filesystem API does not turn arbitrary binary content into source text.",
                    "Review exported secrets, generated files and dependency directories before copying a complete project to backend storage. Disk-mode destinations persist."
                ]
            },
            {
                "tip": "A container filesystem and the backend filesystem are separate stores. Closing/reloading the page can lose container state unless it has been exported."
            }
        ]
    },
    {
        "id": "container-preview",
        "title": "Development URLs and browser constraints",
        "blocks": [
            {
                "list": [
                    "wc_getDevEnvUrl reports the last published server URL; wc_openDevEmbeddedView opens it. No URL means a supported dev server has not published readiness yet.",
                    "createDevIframe/openDevEmbeddedView embed the running development page in an existing popup. Closing that popup does not kill the server process.",
                    "Browser support, cross-origin isolation, network access and SDK boot state can fail independently of model and filesystem connectivity.",
                    "The bundled @webcontainer/api modules define the runtime bridge, internal file tree, preview messages and reload handling. They are vendor dependencies; edit application helpers rather than maintaining a second copy of the SDK."
                ]
            },
            {
                "tip": "Do not interpret a rendered preview as a successful build/test or as a secure place to open hostile code."
            }
        ]
    }
)
