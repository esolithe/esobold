/*
 * Native guide: webContainer.
 * Sources: webContainer.js, webContainerUtils.js, agent/agent_webContainer.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.development.chapters.push(
    {
        "id": "container-overview",
        "title": "WebContainer: an optional browser coding workspace",
        "blocks": [
            {
                "list": [
                    "WebContainer lets you build and preview a JavaScript web app inside your browser. It uses Node.js to run the project; it is not your server terminal and does not run Python, GPU jobs or SSH connections.",
                    "For scripts, await initialiseWebContainerAPIs() starts the workspace and exposes its file interface, webContainerFS. It needs a supported browser and a secure page configured for WebContainer's browser isolation. If it cannot start, check browser and hosting requirements rather than changing the AI model.",
                    "A started development server publishes webContainerDevPort and webContainerDevURL. openDevEmbeddedView opens its preview.",
                    "createSvelteEnv prepares a project using Svelte, a framework for building web pages, and npm, the Node.js package manager. Installing packages may download and run code, so check the project's dependencies first."
                ]
            },
            {
                "tip": "Only run projects and packages you trust. A browser workspace can still use network connections or export files."
            }
        ]
    },
    {
        "id": "container-processes",
        "title": "Running and stopping workspace commands",
        "blocks": [
            {
                "p": "Optional programming reference: these helpers start commands in the browser workspace, show their output and stop them. A process is a running command; arguments are the values or options passed to it."
            },
            {
                "table": [
                    [
                        "Helper/tool",
                        "What it does"
                    ],
                    [
                        "process(name).args(...).workingDirectory(...).env(...).spawn()",
                        "Choose a container command, arguments, working folder and environment values, then start it. ArgsHelper also has output and terminal options."
                    ],
                    [
                        "wc_spawn",
                        "Start a workspace command: args are its arguments, cwd is its working folder, and env contains environment settings. Terminal size and captured output are optional. Review the command confirmation first."
                    ],
                    [
                        "listDirectoriesRunningProcesses / wc_listProcessesByDirectory",
                        "List the workspace's running commands, optionally for a selected folder."
                    ],
                    [
                        "killProcesses / wc_killProcessesByDirectory",
                        "Stop tracked commands for the chosen folder."
                    ],
                    [
                        "killAllProcesses / wc_killAllProcesses",
                        "Stop all tracked workspace commands; host-server processes are unaffected."
                    ],
                    [
                        "wrapNPM",
                        "Run npm with the workspace arguments."
                    ]
                ]
            },
            {
                "p": "runContainerProcess tracks the command, streams its output and removes it from the list when finished. It can return captured output and an exit status. An exit status other than zero reports failure; read the error and any notice that output was cut short."
            },
            {
                "tip": "Closing a preview does not stop its development server. Check the process list and stop the command explicitly when finished."
            }
        ]
    },
    {
        "id": "container-files-and-transfers",
        "title": "Workspace files and copying projects to the server",
        "blocks": [
            {
                "table": [
                    [
                        "Direction / tools",
                        "Behavior"
                    ],
                    [
                        "wc_fs_readdir/readFile/writeFile/mkdir/rm",
                        "Read or change workspace files. Choose text encoding and whether folder operations include their contents."
                    ],
                    [
                        "wc_loadLocalFileIntoContainerPath / wc_loadLocalDirIntoContainerDir",
                        "Copy a file or folder from Esobold's server file storage into the browser workspace. “Local” here means the server storage, not arbitrary desktop files."
                    ],
                    [
                        "wc_loadContainerFileIntoLocal / wc_loadContainerDirIntoLocalDir",
                        "Copy a workspace file or folder back to Esobold's server file storage."
                    ],
                    [
                        "Bulk directory helpers",
                        "Keep the relative folder layout and report copied files and bytes. After a failed copy, check which files arrived before retrying."
                    ]
                ]
            },
            {
                "list": [
                    "Start the workspace before using transfer helpers. Check the source and destination in the agent's transfer confirmation, especially if files may be replaced.",
                    "For pictures or other binary files, read and write bytes rather than treating their contents as text.",
                    "Check for passwords, private files, generated output and large dependency folders before exporting a whole project. Files copied into server disk storage remain there."
                ]
            },
            {
                "tip": "Browser workspace files and server files are separate. Export work you want to keep before closing or reloading the page."
            }
        ]
    },
    {
        "id": "container-preview",
        "title": "Development URLs and browser constraints",
        "blocks": [
            {
                "list": [
                    "wc_getDevEnvUrl returns the running development server's published address; wc_openDevEmbeddedView opens it. If there is no address yet, wait for the server to start or check its output.",
                    "createDevIframe/openDevEmbeddedView opens the preview in a popup. Closing it leaves the development server running.",
                    "Browser support, secure-page isolation, network access and workspace startup can each cause errors even when the AI and server file storage work.",
                    "The bundled @webcontainer/api library handles the workspace connection, files and preview updates. Developers should use the app's existing helpers rather than editing a separate copy of that library."
                ]
            },
            {
                "tip": "A preview shows the app's appearance. Run its own checks for errors, and do not open unreviewed executable code just because it has a preview."
            }
        ]
    }
)
