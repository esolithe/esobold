/*
 * Native guide: agentTools.
 * Sources: agent/agent_groups_loader.js, agent/agent_library_utils.js, agent/agent_media.js, agent/agent_search_web.js, agent/agent_utilities.js, agent/agent_world_state.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "tool-permissions",
        "title": "Tool permissions, groups and runtime availability",
        "blocks": [
            {
                "table": [
                    [
                        "Group",
                        "Typical effects"
                    ],
                    [
                        "Messaging / Planning and User Input",
                        "Write chat turns, plan actions or pause for user decisions."
                    ],
                    [
                        "Search and Web / World and State",
                        "Search, retrieve context or overwrite World Info/state entries."
                    ],
                    [
                        "Library",
                        "Inspect/create/load library entries; loads replace parts of the active session."
                    ],
                    [
                        "Filesystem / Media",
                        "Read/write/delete managed files, generate assets and display them."
                    ],
                    [
                        "Web Container",
                        "Run browser-contained processes and transfer projects through the backend filesystem."
                    ],
                    [
                        "MCP / Misc",
                        "Call configured external servers or local utility helpers."
                    ]
                ]
            },
            {
                "list": [
                    "The source catalog below covers built-in definitions, not a promise that all tools are simultaneously available. Builders gate media/filesystem/services on capabilities, and external MCP tools are discovered dynamically.",
                    "Tool metadata’s enabled state or a macro whitelist can select candidates, but disabled_agent_tools still removes names. The non-whitelist path can additionally exclude commands using its configured TextDB document.",
                    "The displayed Allowed checkbox is a frontend policy control, not server authentication or an OS sandbox. Disk-mode writes and WebContainer transfer/process routes have their own confirmations."
                ]
            },
            {
                "tip": "Inspect read/write destinations and sensitive outputs before granting automation. A tool’s friendly name does not reduce its side effects."
            }
        ],
        "show": [
            { label: "Tool groups and Allowed checkboxes", run: (ctx) => ctx.openSettings("tools") }
        ]
    },
    {
        "id": "state-and-search-tools",
        "title": "World state, search and utility tools",
        "blocks": [
            {
                "list": [
                    "add_to_history appends text and keyword labels to the TextDB document store. overwrite_world_information replaces an identified World Info entry; overwrite_setting_overview replaces Memory; overwrite_current_state replaces the TextDB State document. These are stored session-context writes, not private scratch notes.",
                    "read_world_information retrieves an identified entry. search_history searches existing history/context; web_search depends on the configured external search route and sends the query there.",
                    "wordcount enables or disables word-count bookkeeping for action summaries; it does not count an arbitrary supplied draft or enforce a length limit. roll_dice rolls numeric dice; evaluate_formula evaluates a mathematical expression through the bundled math helper.",
                    "get_random_terms_from_table draws entries from a named TextDB table. get_command_description obtains command metadata for the requested names, not a license to run disabled tools."
                ]
            },
            {
                "tip": "Model-created state summaries and search results require review. Never overwrite a curated entry merely because the model calls its own response authoritative."
            }
        ]
    },
    {
        "id": "catalog-common",
        "title": "Tool reference: messaging, planning, state and search",
        "blocks": [
            {
                "p": "Built-in source definitions. ? marks an explicitly optional top-level argument or a nested property not listed as required in its schema; runtime defaults may also apply. Availability and Allowed flags are checked separately. Filesystem and container operation parameters use arrays, never a lone operation object."
            },
            {
                "table": [
                    [
                        "Command",
                        "Arguments / nested operation shape",
                        "Effect"
                    ],
                    [
                        "add_to_history",
                        "text; keywords: array",
                        "Append text and keyword labels to the TextDB document store."
                    ],
                    [
                        "evaluate_formula",
                        "formula",
                        "Evaluate a mathematical expression."
                    ],
                    [
                        "get_command_description",
                        "commandNames: array",
                        "Retrieve metadata for named commands."
                    ],
                    [
                        "get_random_terms_from_table",
                        "numOfTerms: integer; tableToUse: string",
                        "Sample terms from a named TextDB table."
                    ],
                    [
                        "overwrite_current_state",
                        "text: value",
                        "Replace current-state text."
                    ],
                    [
                        "overwrite_current_state_response",
                        "json",
                        "Set the TextDB StateFormat JSON used by later state updates; does not edit an AI reply."
                    ],
                    [
                        "overwrite_setting_overview",
                        "text",
                        "Replace setting-overview context."
                    ],
                    [
                        "overwrite_world_information",
                        "uniqueIdentifier; keywords: array; text",
                        "Replace one identified World Info entry."
                    ],
                    [
                        "plan_actions",
                        "whoToRespondAs: string; responsePlanOverview: string; orderOfActions: array<{action: string, objective: string}>",
                        "Choose the speaker and ordered tool objectives."
                    ],
                    [
                        "read_world_information",
                        "uniqueIdentifier",
                        "Read one identified World Info entry."
                    ],
                    [
                        "roll_dice",
                        "numDice: integer; numSides: integer",
                        "Roll numDice dice with numSides sides."
                    ],
                    [
                        "search_history",
                        "searchString",
                        "Search stored conversation/history context."
                    ],
                    [
                        "send_message",
                        "whoToSendMessageAs: string; messages: array",
                        "Append message(s) as a selected chat speaker."
                    ],
                    [
                        "userInput",
                        "prompt: string; suggestions?: array; continueWithCurrentPlan: boolean",
                        "Pause for text, choices and optional file selections."
                    ],
                    [
                        "web_search",
                        "query",
                        "Send a query through the configured web-search service."
                    ],
                    [
                        "wordcount",
                        "state: boolean",
                        "Enable or disable word-count bookkeeping for action summaries."
                    ]
                ]
            },
            {
                "tip": "Check results and destination state before repeating a write or external action. Schema-valid arguments do not guarantee that a service is enabled or that every batched operation succeeded."
            }
        ]
    },
    {
        "id": "catalog-library-macros",
        "title": "Tool reference: Library and macros",
        "blocks": [
            {
                "p": "Built-in source definitions. ? marks an explicitly optional top-level argument or a nested property not listed as required in its schema; runtime defaults may also apply. Availability and Allowed flags are checked separately. Filesystem and container operation parameters use arrays, never a lone operation object."
            },
            {
                "table": [
                    [
                        "Command",
                        "Arguments / nested operation shape",
                        "Effect"
                    ],
                    [
                        "create_macro",
                        "macroName: string; overwrite?: boolean; macroDefinition: {planToUse?: {whoToRespondAs?: string, responsePlanOverview: string, orderOfActions: array<{action: string, objective: string}>}, agentPrompt?: string, agentName?: string, wordCountEnabled?: boolean, isUsingWhitelist?: boolean}",
                        "Validate and save a named plan definition."
                    ],
                    [
                        "createCharacter",
                        "name: string; avatar_png_path?: string; creator?: string; character_version?: string; personality?: string; description?: string; first_mes?: string; mes_example?: string; creator_notes?: string; system_prompt?: string; post_history_instructions?: string; tags?: array; alternate_greetings?: array; wi_entries?: array<{key: string, keysecondary?: string, keyanti?: string, content: string, comment?: string, folder?: null, selective?: boolean, constant?: boolean, probability?: string, wigroup?: value, widisabled?: boolean}>; overwrite_existing?: boolean",
                        "Create a card, optional avatar/lore and overwrite choice."
                    ],
                    [
                        "get_macro_info",
                        "macroName?: string",
                        "List macros or retrieve one definition."
                    ],
                    [
                        "getLibraryData",
                        "name: string; type?: string",
                        "Retrieve a named library entry."
                    ],
                    [
                        "listLibraryData",
                        "pattern?: string; type?: string",
                        "List/filter library metadata by wildcard/type."
                    ],
                    [
                        "run_macro",
                        "macroName: string; prompt: string",
                        "Execute one saved macro with a prompt."
                    ],
                    [
                        "run_macro_on_files",
                        "paths: array; macroName: string; prompt?: string",
                        "Expand/deduplicate paths and run a macro per file."
                    ],
                    [
                        "unifiedLoad",
                        "save?: string; mainCharacter?: string; additionalCharacters?: array; playerCharacter?: string; worldInfo?: array",
                        "Load selected save, characters and World Info."
                    ]
                ]
            },
            {
                "tip": "Check results and destination state before repeating a write or external action. Schema-valid arguments do not guarantee that a service is enabled or that every batched operation succeeded."
            }
        ]
    },
    {
        "id": "catalog-media",
        "title": "Tool reference: chat media",
        "blocks": [
            {
                "p": "Built-in source definitions. ? marks an explicitly optional top-level argument or a nested property not listed as required in its schema; runtime defaults may also apply. Availability and Allowed flags are checked separately. Filesystem and container operation parameters use arrays, never a lone operation object."
            },
            {
                "table": [
                    [
                        "Command",
                        "Arguments / nested operation shape",
                        "Effect"
                    ],
                    [
                        "describe_clicked_image",
                        "question",
                        "Ask the user to select an image for model analysis."
                    ],
                    [
                        "generate_image",
                        "edit_existing_image: boolean; prompt; aspect: string",
                        "Generate or edit a chat image."
                    ],
                    [
                        "generate_tts",
                        "textToSay; voice: string",
                        "Generate spoken audio with a supported voice."
                    ],
                    [
                        "music_prepare",
                        "caption",
                        "Prepare music caption/state."
                    ],
                    [
                        "set_background_image_from_filesystem",
                        "fs_image_path",
                        "Set persistent background from a managed image path."
                    ]
                ]
            },
            {
                "tip": "Check results and destination state before repeating a write or external action. Schema-valid arguments do not guarantee that a service is enabled or that every batched operation succeeded."
            }
        ]
    },
    {
        "id": "catalog-filesystem",
        "title": "Tool reference: managed filesystem",
        "blocks": [
            {
                "p": "Built-in source definitions. ? marks an explicitly optional top-level argument or a nested property not listed as required in its schema; runtime defaults may also apply. Availability and Allowed flags are checked separately. Filesystem and container operation parameters use arrays, never a lone operation object."
            },
            {
                "table": [
                    [
                        "Command",
                        "Arguments / nested operation shape",
                        "Effect"
                    ],
                    [
                        "describe_fs_image",
                        "path; question",
                        "Analyze a managed image using the vision model."
                    ],
                    [
                        "fs_close_embed",
                        "name",
                        "Close a named floating viewer."
                    ],
                    [
                        "fs_code_detect_errors",
                        "path",
                        "Report supported-grammar parse errors."
                    ],
                    [
                        "fs_code_detect_warnings",
                        "path",
                        "Report heuristic source warnings."
                    ],
                    [
                        "fs_code_edit_symbol",
                        "path; symbol_name; new_text",
                        "Replace the located syntax-tree symbol."
                    ],
                    [
                        "fs_code_get_symbols",
                        "path",
                        "Parse and list named syntax-tree symbols."
                    ],
                    [
                        "fs_content",
                        "operations: array<{path: string, start?: integer, end?: integer}>",
                        "Read text line ranges with agent truncation metadata."
                    ],
                    [
                        "fs_copy",
                        "operations: array<{source: string, destination: string}>",
                        "Copy source paths to destinations."
                    ],
                    [
                        "fs_create_folder",
                        "operations: array<{path: string}>",
                        "Create managed directories."
                    ],
                    [
                        "fs_delete",
                        "operations: array<{path: string}>",
                        "Delete managed files."
                    ],
                    [
                        "fs_delete_folder",
                        "operations: array<{path: string}>",
                        "Remove managed directories recursively."
                    ],
                    [
                        "fs_download_info",
                        "dir: string",
                        "Obtain ZIP download metadata for a directory."
                    ],
                    [
                        "fs_extract_zip",
                        "zip_path; target_dir: string",
                        "Extract an existing managed ZIP into a directory."
                    ],
                    [
                        "fs_generate_image",
                        "prompt; aspect: string; fs_input_image_paths: array<string>; fs_output_path",
                        "Generate/edit images into a managed output file."
                    ],
                    [
                        "fs_generate_music",
                        "caption; lyrics; bpm: integer; duration: integer; keyscale; timesignature; vocal_language; inference_steps: integer; fs_input_path; fs_output_path",
                        "Generate music into a managed output file."
                    ],
                    [
                        "fs_generate_tts",
                        "textToSay; voice: string; fs_output_path",
                        "Generate speech into a managed output file."
                    ],
                    [
                        "fs_list",
                        "pattern: string; case_insensitive: boolean",
                        "List managed files/directories matching a pattern."
                    ],
                    [
                        "fs_metadata",
                        "operations: array<{path: string}>",
                        "Read metadata for operation paths."
                    ],
                    [
                        "fs_move",
                        "operations: array<{source: string, destination: string}>",
                        "Move source paths to destinations."
                    ],
                    [
                        "fs_open_embed",
                        "name; file_path; x: integer; y: integer; width: integer; height: integer",
                        "Open/update a named floating managed-file viewer."
                    ],
                    [
                        "fs_replace_regex",
                        "operations: array<{path: string, pattern: string, replacement: string}>",
                        "Replace regex matches in managed text."
                    ],
                    [
                        "fs_search",
                        "pattern: string; path_pattern: string; max_results: integer; case_insensitive: boolean",
                        "Search managed text with a regular expression."
                    ],
                    [
                        "fs_semantic_search",
                        "path; search_query: string; max_results: integer",
                        "Retrieve embedding-ranked document snippets."
                    ],
                    [
                        "fs_transcribe",
                        "path; prompt; langcode; suppress_non_speech: boolean",
                        "Transcribe a managed audio file."
                    ],
                    [
                        "fs_url",
                        "operations: array<{path: string}>",
                        "Obtain managed file-serving URLs."
                    ],
                    [
                        "fs_write_lines",
                        "operations: array<{path: string, lines: array<string>, start_line?: integer, append?: boolean}>",
                        "Write or append supplied lines."
                    ],
                    [
                        "fs_write_text",
                        "operations: array<{path: string, content: string}>",
                        "Write text operation payloads."
                    ]
                ]
            },
            {
                "tip": "Check results and destination state before repeating a write or external action. Schema-valid arguments do not guarantee that a service is enabled or that every batched operation succeeded."
            }
        ]
    },
    {
        "id": "catalog-lumara",
        "title": "Tool reference: OpenLumara",
        "blocks": [
            {
                "p": "Built-in source definitions. ? marks an explicitly optional top-level argument or a nested property not listed as required in its schema; runtime defaults may also apply. Availability and Allowed flags are checked separately. Filesystem and container operation parameters use arrays, never a lone operation object."
            },
            {
                "table": [
                    [
                        "Command",
                        "Arguments / nested operation shape",
                        "Effect"
                    ],
                    [
                        "lumara_clear_chat",
                        "No arguments",
                        "Clear the current remote conversation."
                    ],
                    [
                        "lumara_get_messages",
                        "No arguments",
                        "Retrieve current remote message history."
                    ],
                    [
                        "lumara_list_chats",
                        "No arguments",
                        "List remote conversations."
                    ],
                    [
                        "lumara_load_chat",
                        "chat_id: string",
                        "Select an existing remote conversation."
                    ],
                    [
                        "lumara_new_chat",
                        "title?: string",
                        "Create/select a new remote conversation."
                    ],
                    [
                        "lumara_rename_chat",
                        "title: string",
                        "Rename the current remote conversation."
                    ],
                    [
                        "lumara_send",
                        "message: string",
                        "Send and stream a remote chat message."
                    ],
                    [
                        "lumara_status",
                        "No arguments",
                        "Read OpenLumara connection/service status."
                    ]
                ]
            },
            {
                "tip": "Check results and destination state before repeating a write or external action. Schema-valid arguments do not guarantee that a service is enabled or that every batched operation succeeded."
            }
        ]
    },
    {
        "id": "catalog-container",
        "title": "Tool reference: WebContainer",
        "blocks": [
            {
                "p": "Built-in source definitions. ? marks an explicitly optional top-level argument or a nested property not listed as required in its schema; runtime defaults may also apply. Availability and Allowed flags are checked separately. Filesystem and container operation parameters use arrays, never a lone operation object."
            },
            {
                "table": [
                    [
                        "Command",
                        "Arguments / nested operation shape",
                        "Effect"
                    ],
                    [
                        "wc_createSvelteEnv",
                        "projectName?: string",
                        "Create a contained Svelte development project."
                    ],
                    [
                        "wc_fs_mkdir",
                        "operations: array<{path: string, recursive?: boolean}>",
                        "Create container directories."
                    ],
                    [
                        "wc_fs_readdir",
                        "operations: array<{path: string, recursive?: boolean, withFileTypes?: boolean}>",
                        "List a container directory."
                    ],
                    [
                        "wc_fs_readFile",
                        "operations: array<{path: string, encoding?: string}>; encoding: string",
                        "Read container files with selected encoding."
                    ],
                    [
                        "wc_fs_rm",
                        "operations: array<{path: string, recursive?: boolean, force?: boolean}>",
                        "Remove container files/directories."
                    ],
                    [
                        "wc_fs_writeFile",
                        "operations: array<{path: string, content: string, encoding?: string}>; encoding: string",
                        "Write container files with selected encoding."
                    ],
                    [
                        "wc_getDevEnvUrl",
                        "No arguments",
                        "Read the current published development URL."
                    ],
                    [
                        "wc_killAllProcesses",
                        "No arguments",
                        "Terminate all tracked container processes."
                    ],
                    [
                        "wc_killProcessesByDirectory",
                        "operations: array<{mapRef: string}>",
                        "Terminate tracked processes for selected directories."
                    ],
                    [
                        "wc_listProcessesByDirectory",
                        "operations: array<{mapRef?: string}>",
                        "List tracked processes for selected directories."
                    ],
                    [
                        "wc_loadContainerDirIntoLocalDir",
                        "operations: array<{containerDirPath: string, localDirPath: string}>",
                        "Export a container directory to backend managed storage."
                    ],
                    [
                        "wc_loadContainerFileIntoLocal",
                        "operations: array<{containerFilePath: string, localFilePath: string}>",
                        "Export a container file to backend managed storage."
                    ],
                    [
                        "wc_loadLocalDirIntoContainerDir",
                        "operations: array<{localDirPath: string, containerDirPath: string}>",
                        "Copy a backend filesystem directory into the container."
                    ],
                    [
                        "wc_loadLocalFileIntoContainerPath",
                        "operations: array<{localFilePath: string, containerFilePath: string}>",
                        "Copy a backend managed file into the container."
                    ],
                    [
                        "wc_openDevEmbeddedView",
                        "No arguments",
                        "Open the current published development preview."
                    ],
                    [
                        "wc_spawn",
                        "processName; args: value; cwd; env: object; output: boolean; terminalCols: integer; terminalRows: integer; capture_output_to_agent: boolean",
                        "Confirm and spawn a contained process with optional output capture."
                    ]
                ]
            },
            {
                "tip": "Check results and destination state before repeating a write or external action. Schema-valid arguments do not guarantee that a service is enabled or that every batched operation succeeded."
            }
        ]
    }
)
