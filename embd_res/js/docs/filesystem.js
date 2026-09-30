/*
 * Native guide: filesystem.
 * Sources: fs.js, fs_browser.js, agent/agent_filesystem.js, dev/fs_array_contract_console_test.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "filesystem-browser",
        "title": "Filesystem browser: list, tiles, uploads and downloads",
        "blocks": [
            {
                "list": [
                    "Open the filesystem button under Add Media, or visit /fs/ on the backend. Breadcrumbs and directory links navigate the managed filesystem root. The actual page is embd_res/fs_browser.html; the older top-level fs_browser.html is not the embedded route.",
                    "Toggle List View / Tile View. The choice is kept in localStorage under kcpp_fs_view_mode. Tiles preview supported image/audio/video files; unsupported files remain downloadable.",
                    "Use New Folder, Upload Files or drag/drop. ZIP uploads use the server extraction route; review archives before importing because entries can replace existing paths.",
                    "Download ZIP exports the current directory through the backend’s filesystem download route. Edit is available only for metadata.binary === false; deletion asks for confirmation and folder deletion is recursive."
                ]
            },
            {
                "tip": "A backend error or disabled filesystem is displayed in the listing/status area. Empty tiles after an error are not proof that the directory has no files."
            }
        ]
    },
    {
        "id": "filesystem-modes",
        "title": "Filesystem enablement, memory mode and disk mode",
        "blocks": [
            {
                "table": [
                    [
                        "Launcher option",
                        "Meaning"
                    ],
                    [
                        "--fsmaxsize MB",
                        "Must be greater than zero to enable the endpoints. In memory mode it is a size limit; in direct-disk mode it gates enablement, not a disk quota."
                    ],
                    [
                        "--fsdir DIRECTORY",
                        "Preload source in memory mode; configured filesystem root in direct-disk mode."
                    ],
                    [
                        "--fsdirect",
                        "Use direct on-disk storage under --fsdir. Without a usable directory, initialization falls back to memory mode."
                    ]
                ]
            },
            {
                "list": [
                    "Memory-mode mutations update the managed in-memory filesystem. They do not automatically rewrite the directory used to preload it; export wanted files before restarting.",
                    "Disk-mode mutations persist to the configured root. Agent filesystem mutations request a review confirmation outside memory mode; completed operations are not rolled back by stopping the agent.",
                    "Admin authentication is shared through getFsClientAuthHeaders when required. Browser filename/path conventions use POSIX-style paths rooted within this managed filesystem, not unrestricted host paths."
                ]
            },
            {
                "tip": "Direct-disk mode has no enforced disk quota from --fsmaxsize. Monitor free space and protect the configured root with server access controls and backups."
            }
        ]
    },
    {
        "id": "filesystem-picker",
        "title": "Selecting files for agents and embedding",
        "blocks": [
            {
                "list": [
                    "/fs/?picker=1 opens multi-selection mode. Click a file/folder tile or its selection control, then Use selected. Cancel reports cancellation to the parent instead of making a selection.",
                    "An agent input dialog can accept text, suggestion buttons, local file uploads and existing filesystem entries. Local files are uploaded only on Confirm and Continue; existing entries are represented by paths.",
                    "A directory selection identifies a directory; it is not automatically the text of every contained file. The agent must explicitly list/read relevant paths using available tools.",
                    "Embed selected is a separate picker action that opens supported media in floating viewers. It does not submit the file to a model."
                ]
            },
            {
                "tip": "Parent-window messages are origin-checked. Verify selected paths and destinations before confirming uploads or continuing an automated plan."
            }
        ]
    },
    {
        "id": "fsclient-reads",
        "title": "FsClient API: paths, reads and result shapes",
        "blocks": [
            {
                "p": "FsClient is defined in js/fs.js; window.fsClient is the page-origin instance. Construct new FsClient(base_url) for another backend. Public batch path operations take a nonempty array of operation objects, even for a single file."
            },
            {
                "table": [
                    [
                        "Call",
                        "Operation/data shape"
                    ],
                    [
                        "metadata([{path}]) / url([{path}])",
                        "Read metadata or serving URL. A single successful result is unwrapped; several results remain under results. A single failed result throws."
                    ],
                    [
                        "content([{path, start?, end?}])",
                        "Read inclusive 1-based line ranges. Omitted per-file starts default to 1; omitted ends mean through the file. Returns line-number/text pairs and line counts."
                    ],
                    [
                        "write([{path, content}])",
                        "Write text strings or binary Uint8Array/ArrayBuffer bytes. Strings are text; byte inputs are base64-encoded by the client. Passing a base64 string with isB64:true does not make it binary in this implementation."
                    ],
                    [
                        "listEntries(pattern, case_insensitive) / list(...)",
                        "Return separated files/directories or the simpler file list."
                    ],
                    [
                        "mode() / getFsMode()",
                        "Query/cached-query the backend storage mode."
                    ],
                    [
                        "fetch_raw(path) / download_zip(dir)",
                        "Fetch file bytes or a directory ZIP. download_info(dir) obtains download metadata."
                    ]
                ]
            },
            {
                "p": "Example single read: await window.fsClient.content([{ path: \"/notes.txt\", start: 1, end: 20 }]). Example text write: await window.fsClient.write([{ path: \"/notes.txt\", content: \"A short note\" }]). For binary data pass bytes, not a pre-encoded string."
            },
            {
                "tip": "HTTP success is not a batch-wide success guarantee. Inspect each results entry when performing several operations."
            }
        ]
    },
    {
        "id": "fsclient-mutations",
        "title": "FsClient API: edits, moves, directories and archives",
        "blocks": [
            {
                "table": [
                    [
                        "Call",
                        "Operation shape"
                    ],
                    [
                        "write_lines([{path, lines, start_line?, append?}])",
                        "Write supplied lines at a 1-based start_line (default 1), or append. This is not a general diff/replace-range API."
                    ],
                    [
                        "delete([{path}])",
                        "Delete specified files."
                    ],
                    [
                        "move([{source, destination}]) / copy([{source, destination}])",
                        "Move/copy paths; confirm the destination and replacement behavior."
                    ],
                    [
                        "mkdir([{path}]) / rmdir([{path}])",
                        "Create/remove directories through the corresponding backend operation."
                    ],
                    [
                        "replace_regex([{path, pattern, replacement}])",
                        "Apply backend regular-expression replacements."
                    ],
                    [
                        "extract_zip(zip_data, dir, filename)",
                        "Upload a ZIP Blob/File/bytes for extraction under dir."
                    ]
                ]
            },
            {
                "p": "The metadata, url, content, write, write_lines, delete, move, copy, mkdir, rmdir and replace_regex methods reject an empty or non-array operation list. Do not pass a lone object as a shortcut."
            },
            {
                "tip": "Deletion, overwriting and regex replacement are destructive. Preview/read the relevant files, keep backups and inspect per-operation errors."
            }
        ]
    },
    {
        "id": "filesystem-search",
        "title": "Regex search, semantic search and document caches",
        "blocks": [
            {
                "list": [
                    "search(pattern, path_pattern, max_results, case_insensitive) and search_regex(...) use the backend regular-expression route and return matches. A bad regex is an error, not an empty successful search.",
                    "semantic_search(path, search_query, max_results = 5) requires a nonempty query and embedding capability; max_results is clamped to 1–20. The backend converts/chunks the document and manages its embedding cache.",
                    "search_all_documents(search_query, max_results = 10) asks the searchable-doc route for snippets across documents. It is not the same as listing every file or searching raw lines.",
                    "Chunk size/overlap and embedding query/document prefix settings affect retrieval. The server cache uses content hashes and regenerates embeddings when source content changes."
                ]
            },
            {
                "tip": "The client still contains internal cache/chunk helper functions, but its public semantic-search methods delegate execution to the server. Retrieved snippets can be incomplete; read the original file for precise edits."
            }
        ]
    },
    {
        "id": "filesystem-readonly-mounts",
        "title": "Read-only documents and application resources",
        "blocks": [
            {
                "list": [
                    "The managed filesystem exposes /INTERNAL_READ_ONLY/Documents for the backend’s configured --admindocsdir, and /INTERNAL_READ_ONLY/Resources for packaged embd_res application resources. These are read-only mounts, not normal writable directories.",
                    "Listings, regex searches, downloads and searchable-document routes can include these trees when configured/available. Choose a narrow path rather than unintentionally searching/exporting the whole mounted set.",
                    "Attempting to modify read-only mounted content should fail; make a copy into a writable managed path if you need an editable derivative.",
                    "Treat documents and retrieved snippets as untrusted input. Their presence under a server directory does not authorize executing their instructions or exporting private material."
                ]
            }
        ]
    }
)
