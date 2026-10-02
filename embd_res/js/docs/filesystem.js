/*
 * Native guide: filesystem.
 * Sources: fs.js, fs_browser.js, agent/agent_filesystem.js, dev/fs_array_contract_console_test.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.development.chapters.push(
    {
        "id": "filesystem-browser",
        "title": "Filesystem browser: list, tiles, uploads and downloads",
        "blocks": [
            {
                "list": [
                    "When server file storage is enabled, click Media in the story/chat controls and choose the filesystem button, or visit /fs/ at the server address. Click folder links or the path shown above the files to browse.",
                    "Choose List View for filenames or Tile View for previews of supported images, audio and video. The browser remembers your choice; other file types can still be downloaded.",
                    "Use New Folder, Upload Files or drag files into the browser. Uploading a ZIP extracts it on the server and may replace files with the same paths.",
                    "Download ZIP downloads the current folder. Use Edit for text files. Deleting asks for confirmation; deleting a folder also deletes its contents."
                ]
            },
            {
                "tip": "If file storage is disabled or a request fails, read the displayed error. An empty-looking view after an error may not show the actual folder contents."
            }
        ]
    },
    {
        "id": "filesystem-modes",
        "title": "Server files: temporary memory or persistent disk storage",
        "blocks": [
            {
                "p": "These are startup options for the server owner. Memory mode stores files temporarily in the server's computer memory (RAM); disk mode keeps them in a folder on the server. This is file storage, not the Memory note in Context or your browser Library."
            },
            {
                "table": [
                    [
                        "Launcher option",
                        "Meaning"
                    ],
                    [
                        "--fsmaxsize MB",
                        "Enable file storage with a value greater than zero. In memory mode, this limits stored data; in direct-disk mode, it enables the feature but does not limit disk usage."
                    ],
                    [
                        "--fsdir DIRECTORY",
                        "Choose a folder to preload in memory mode, or the storage folder in direct-disk mode."
                    ],
                    [
                        "--fsdirect",
                        "Store files directly under --fsdir. Without a usable folder, startup falls back to temporary memory storage."
                    ]
                ]
            },
            {
                "list": [
                    "Files changed in memory mode remain in server RAM. They are not saved back to the preload folder, so download files you want to keep before restarting.",
                    "Files changed in disk mode are saved to the chosen folder. Agent changes ask for review outside memory mode; stopping an agent does not undo a completed save or deletion.",
                    "The file browser uses the server's password when required. Paths refer to the managed server storage, not any arbitrary file on your desktop."
                ]
            },
            {
                "tip": "In disk mode, --fsmaxsize is not a disk-space quota. The server owner should monitor free space, restrict access and back up the storage folder."
            }
        ]
    },
    {
        "id": "filesystem-picker",
        "title": "Selecting files for agents and embedding",
        "blocks": [
            {
                "list": [
                    "/fs/?picker=1 opens a file-selection view. Select file or folder tiles, then choose Use selected. Cancel closes without choosing files.",
                    "An agent input dialog may offer text, suggested replies, local uploads or existing server files. Local files upload when you choose Confirm and Continue; existing files are selected by their server paths.",
                    "Selecting a folder does not send every file's text to the AI. The agent needs to list and read the files it requires.",
                    "Embed selected displays supported media in a floating viewer. This is separate from attaching a file to an AI request."
                ]
            },
            {
                "tip": "Check the selected files and destination before confirming an upload or continuing an automated task."
            }
        ]
    },
    {
        "id": "fsclient-reads",
        "title": "FsClient API: paths, reads and result shapes",
        "blocks": [
            {
                "p": "Optional programming reference: FsClient is the interface scripts use to read and change server files. window.fsClient uses the current server; new FsClient(base_url) selects another. Batch methods take an array, a list enclosed in [...], even for one file: [{path: \"/notes.txt\"}]. In the table, ? marks an optional field."
            },
            {
                "table": [
                    [
                        "Call",
                        "What to pass and expect"
                    ],
                    [
                        "metadata([{path}]) / url([{path}])",
                        "Get file details or a serving URL. One successful result is returned directly; several stay in results. A single failed operation throws an error."
                    ],
                    [
                        "content([{path, start?, end?}])",
                        "Read lines numbered from 1, including both start and end. Start defaults to 1; an omitted end reads through the file. Returns line numbers, text and line counts."
                    ],
                    [
                        "write([{path, content}])",
                        "Save a text string, or pass Uint8Array/ArrayBuffer bytes for binary data. A base64 string with isB64:true is still treated as text here."
                    ],
                    [
                        "listEntries(pattern, case_insensitive) / list(...)",
                        "List matching files and folders, or use list for just files."
                    ],
                    [
                        "mode() / getFsMode()",
                        "Get the server storage mode; getFsMode can reuse the cached result."
                    ],
                    [
                        "fetch_raw(path) / download_zip(dir)",
                        "Download file bytes or a folder ZIP. download_info(dir) returns details about the folder download."
                    ]
                ]
            },
            {
                "p": "Read twenty lines: await window.fsClient.content([{ path: \"/notes.txt\", start: 1, end: 20 }]). Save a note: await window.fsClient.write([{ path: \"/notes.txt\", content: \"The ferry leaves at dawn.\" }]). For binary files, pass bytes rather than a base64 string."
            },
            {
                "tip": "For several operations, check every entry in results. One completed request can contain both successful and failed file operations."
            }
        ]
    },
    {
        "id": "fsclient-mutations",
        "title": "FsClient API: edits, moves, directories and archives",
        "blocks": [
            {
                "p": "Optional programming reference: these methods change server files. Each batch method takes an array, a list of operations enclosed in [...]; ? marks an optional field. Check the destination and keep a backup before replacing or deleting anything."
            },
            {
                "table": [
                    [
                        "Call",
                        "What to pass and expect"
                    ],
                    [
                        "write_lines([{path, lines, start_line?, append?}])",
                        "Write lines beginning at start_line, numbered from 1, or append them. Start defaults to 1. This does not replace an arbitrary line range like a patch."
                    ],
                    [
                        "delete([{path}])",
                        "Delete the selected files."
                    ],
                    [
                        "move([{source, destination}]) / copy([{source, destination}])",
                        "Move or copy paths. Check whether existing destination files will be replaced."
                    ],
                    [
                        "mkdir([{path}]) / rmdir([{path}])",
                        "Create or remove server folders."
                    ],
                    [
                        "replace_regex([{path, pattern, replacement}])",
                        "Replace matches using a regular expression, a pattern for finding text."
                    ],
                    [
                        "extract_zip(zip_data, dir, filename)",
                        "Upload ZIP data as a Blob, File or bytes and extract it under dir."
                    ]
                ]
            },
            {
                "p": "metadata, url, content, write, write_lines, delete, move, copy, mkdir, rmdir and replace_regex require a nonempty array. Use [{path: \"/notes.txt\"}], not just {path: \"/notes.txt\"}."
            },
            {
                "tip": "Read the files first, keep a backup and check each result. Deletion and replacement change the stored files immediately."
            }
        ]
    },
    {
        "id": "filesystem-search",
        "title": "Finding exact text and related passages in server files",
        "blocks": [
            {
                "list": [
                    "A regex is a pattern for finding exact text. search(pattern, path_pattern, max_results, case_insensitive) and search_regex(...) return matching lines; an invalid pattern reports an error.",
                    "Semantic search finds related meaning using an embedding model. semantic_search(path, search_query, max_results = 5) needs a nonempty query and server embedding support; the result limit is 1–20.",
                    "search_all_documents(search_query, max_results = 10) searches across available documents for relevant passages. It does not list all files or return every matching raw line.",
                    "Chunk size splits documents into passages; overlap repeats some text between adjacent passages. Embedding prefixes depend on the model. The server reuses prepared search data and updates it when a source file changes."
                ]
            },
            {
                "tip": "Search runs on the server and returns selected passages. Read the original file when you need exact wording or want to edit it."
            }
        ]
    },
    {
        "id": "filesystem-readonly-mounts",
        "title": "Read-only documents and application resources",
        "blocks": [
            {
                "list": [
                    "/INTERNAL_READ_ONLY/Documents exposes the server's configured --admindocsdir documents. /INTERNAL_READ_ONLY/Resources exposes the app's packaged embd_res files. You can read these locations but cannot change them through the managed file tools.",
                    "When available, these folders can appear in listings, searches and downloads. Choose a specific path so you do not accidentally search or export more than you need.",
                    "To edit a copy, save it in a writable server folder instead of changing the read-only original.",
                    "A document may contain incorrect advice or instructions. Review it before running code, following commands or sharing private material from it."
                ]
            }
        ]
    }
)

export default function load() {}   