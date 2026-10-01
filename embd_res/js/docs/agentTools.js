/*
 * Native guide: agentTools.
 * Sources: agent/agent_groups_loader.js, agent/agent_library_utils.js, agent/agent_media.js, agent/agent_search_web.js, agent/agent_utilities.js, agent/agent_world_state.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.agents.chapters.push(
    {
        "id": "tool-permissions",
        "title": "Choosing which tools the agent can use",
        "blocks": [
            {
                "p": "Tools let the agent do something beyond writing a reply, such as reading a file or generating an image. Open Settings → Tools and choose the groups or individual actions you want to allow."
            },
            {
                "table": [
                    [
                        "Group",
                        "Typical effects"
                    ],
                    [
                        "Messaging / Planning and User Input",
                        "Add conversation turns, plan steps or ask you a question."
                    ],
                    [
                        "Search and Web / World and State",
                        "Find reference information or change setting notes and state entries."
                    ],
                    [
                        "Library",
                        "Find, create or load Library items. Loading changes the current session."
                    ],
                    [
                        "Filesystem / Media",
                        "Read, change or delete server files; create and display media."
                    ],
                    [
                        "Web Container",
                        "Run browser-based development commands and copy projects to or from server file storage."
                    ],
                    [
                        "MCP / Misc",
                        "Use connected external tool services or local helpers such as calculations."
                    ]
                ]
            },
            {
                "list": [
                    "The reference tables list built-in commands. Your available tools depend on the server, loaded models and connected services; external MCP tools can appear separately.",
                    "A macro whitelist limits the choices for that plan. Disabled tools remain excluded even if listed there. Without a whitelist, a configured TextDB exclusion document can remove further commands.",
                    "Allowed controls which tools the AI can choose. It does not replace server passwords or file access rules. Disk writes, container commands and transfers can also ask you to confirm."
                ]
            },
            {
                "tip": "Check where a tool reads, writes or sends data before allowing it. A simple-sounding action can still change files or send private information."
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
                    "add_to_history adds text and keywords to TextDB, not World Info. overwrite_world_information replaces a selected World Info entry; overwrite_setting_overview replaces Memory; overwrite_current_state replaces the TextDB State document. These change saved session notes.",
                    "read_world_information reads a selected entry. search_history finds earlier context, while web_search sends your query to the configured web-search service.",
                    "wordcount turns word-count tracking for action summaries on or off; it does not count an arbitrary draft or limit reply length. roll_dice rolls the chosen dice, and evaluate_formula calculates a mathematical expression.",
                    "get_random_terms_from_table chooses entries from a named TextDB table. get_command_description explains named tools; it does not enable a disabled tool."
                ]
            },
            {
                "tip": "Review state summaries and search results before using them. Keep your own important notes and check a replacement before overwriting them."
            }
        ]
    },
    {
        "id": "catalog-common",
        "title": "Tool reference: messaging, planning, state and search",
        "blocks": [
            {
                "p": "Optional input reference for messaging, planning and session-note tools. You do not need to memorize these fields to use the agent. An argument is information a command needs; ? means optional, string means text, integer means a whole number, boolean means true or false, and an array is a list. Allow the tools you want in Settings → Tools."
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
                        "Get details about the named commands."
                    ],
                    [
                        "get_random_terms_from_table",
                        "numOfTerms: integer; tableToUse: string",
                        "Choose random entries from a named TextDB table."
                    ],
                    [
                        "overwrite_current_state",
                        "text: value",
                        "Replace the TextDB State document."
                    ],
                    [
                        "overwrite_current_state_response",
                        "json",
                        "Set the JSON format for later TextDB State updates (StateFormat); does not edit an AI reply."
                    ],
                    [
                        "overwrite_setting_overview",
                        "text",
                        "Replace Memory with the supplied setting overview."
                    ],
                    [
                        "overwrite_world_information",
                        "uniqueIdentifier; keywords: array; text",
                        "Replace one identified World Info entry."
                    ],
                    [
                        "plan_actions",
                        "whoToRespondAs: string; responsePlanOverview: string; orderOfActions: array<{action: string, objective: string}>",
                        "Choose the reply's speaker and the ordered actions to perform."
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
                        "Turn word-count tracking for action summaries on or off."
                    ]
                ]
            },
            {
                "tip": "Some of these tools replace session notes, add chat messages or send a web-search query. Review the result before repeating an action; an AI summary is not proof that the action succeeded."
            }
        ]
    },
    {
        "id": "catalog-library-macros",
        "title": "Tool reference: Library and macros",
        "blocks": [
            {
                "p": "Optional input reference for finding, creating and loading Library items, and using saved macro plans. ? marks an optional field; string/integer/boolean mean text/whole number/true or false, and an array is a list. Allow the tools you want in Settings → Tools."
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
                        "Check and save a named macro plan."
                    ],
                    [
                        "createCharacter",
                        "name: string; avatar_png_path?: string; creator?: string; character_version?: string; personality?: string; description?: string; first_mes?: string; mes_example?: string; creator_notes?: string; system_prompt?: string; post_history_instructions?: string; tags?: array; alternate_greetings?: array; wi_entries?: array<{key: string, keysecondary?: string, keyanti?: string, content: string, comment?: string, folder?: null, selective?: boolean, constant?: boolean, probability?: string, wigroup?: value, widisabled?: boolean}>; overwrite_existing?: boolean",
                        "Create a character card with optional picture, lore and replacement choice."
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
                        "Find Library entries by wildcard name pattern and item type."
                    ],
                    [
                        "run_macro",
                        "macroName: string; prompt: string",
                        "Execute one saved macro with a prompt."
                    ],
                    [
                        "run_macro_on_files",
                        "paths: array; macroName: string; prompt?: string",
                        "Expand folders, remove duplicate paths and run the macro once per file."
                    ],
                    [
                        "unifiedLoad",
                        "save?: string; mainCharacter?: string; additionalCharacters?: array; playerCharacter?: string; worldInfo?: array",
                        "Load selected save, characters and World Info."
                    ]
                ]
            },
            {
                "tip": "Loading Library items changes the current session. Download important saves before replacing them, and check the selected files before running a macro on several files."
            }
        ]
    },
    {
        "id": "catalog-media",
        "title": "Tool reference: chat media",
        "blocks": [
            {
                "p": "Optional input reference for tools that describe pictures, generate images or speech, prepare music, or change the background. These need the corresponding models or services. ? marks an optional field; string/integer/boolean mean text/whole number/true or false. Allow the tools you want in Settings → Tools."
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
                        "Prepare the music description and generation settings."
                    ],
                    [
                        "set_background_image_from_filesystem",
                        "fs_image_path",
                        "Use an image stored on the server as the background."
                    ]
                ]
            },
            {
                "tip": "Image reading, image generation, speech and music are separate capabilities. Check that the required model or service is available, and download results you want to keep."
            }
        ]
    },
    {
        "id": "catalog-filesystem",
        "title": "Tool reference: managed filesystem",
        "blocks": [
            {
                "p": "Optional input reference for tools that work with files stored on the Esobold server, not arbitrary desktop files. ? means optional; string/integer/boolean mean text/whole number/true or false. An array is a list. For commands with operations: array in the input column, use a list even for one file. Server file storage must be enabled, and the tools must be Allowed in Settings → Tools."
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
                        "Ask an image-capable model about a server image."
                    ],
                    [
                        "fs_close_embed",
                        "name",
                        "Close a named floating viewer."
                    ],
                    [
                        "fs_code_detect_errors",
                        "path",
                        "Report syntax errors in a supported code language."
                    ],
                    [
                        "fs_code_detect_warnings",
                        "path",
                        "Report possible code issues using simple checks."
                    ],
                    [
                        "fs_code_edit_symbol",
                        "path; symbol_name; new_text",
                        "Replace a named part of a code file."
                    ],
                    [
                        "fs_code_get_symbols",
                        "path",
                        "List named parts of a supported code file, such as functions."
                    ],
                    [
                        "fs_content",
                        "operations: array<{path: string, start?: integer, end?: integer}>",
                        "Read selected text lines and report if the response was cut short."
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
                        "Get file details for the selected paths."
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
                        "Replace text matching a regular-expression pattern."
                    ],
                    [
                        "fs_search",
                        "pattern: string; path_pattern: string; max_results: integer; case_insensitive: boolean",
                        "Search managed text with a regular expression."
                    ],
                    [
                        "fs_semantic_search",
                        "path; search_query: string; max_results: integer",
                        "Find document passages with related meaning using embeddings."
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
                        "Save the supplied text to the selected paths."
                    ]
                ]
            },
            {
                "tip": "File edits, replacements and deletions take effect immediately. Read the file and keep a backup first. For several operations, check every result: one request can contain both successful and failed operations."
            }
        ]
    },
    {
        "id": "catalog-lumara",
        "title": "Tool reference: OpenLumara",
        "blocks": [
            {
                "p": "Optional input reference for OpenLumara, the separate chat service. These tools affect its conversations, not your browser Library, and need an OpenLumara connection. ? marks an optional field; string/integer/boolean mean text/whole number/true or false. Allow the tools you want in Settings → Tools."
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
                "tip": "Check the selected OpenLumara conversation before sending, renaming or clearing it. Stopping an Esobold reply does not undo messages or changes already sent to that service."
            }
        ]
    },
    {
        "id": "catalog-container",
        "title": "Tool reference: WebContainer",
        "blocks": [
            {
                "p": "Optional input reference for the WebContainer browser coding workspace. These tools run workspace commands, edit its files and copy projects to or from server storage. ? means optional; string/integer/boolean mean text/whole number/true or false. Batch operations take an array, a list of operations, even for one item. Allow the tools you want in Settings → Tools."
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
                        "Create a Svelte web-app project inside the browser workspace."
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
                "tip": "Workspace files and server files are separate. In transfer tool names, Local means Esobold's server storage, not your desktop. Check both paths and each result before copying or replacing files."
            }
        ]
    }
)

export default function load() {}   