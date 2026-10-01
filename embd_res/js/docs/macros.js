/*
 * Native guide: macros.
 * Sources: agent/agent_macros.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.agents.chapters.push(
    {
        "id": "macro-workflow",
        "title": "Agent macros: creation, invocation and saved plans",
        "blocks": [
            {
                "p": "A macro is a saved plan you can reuse, such as reading a selected file and summarizing it. Creating one is optional and involves JSON, a text format for structured settings."
            },
            {
                "list": [
                    "Open Settings → Agent to edit saved macros. The JSON object uses each macro's name as a key; names allow letters, numbers and underscores. Keep a copy of plans you want to reuse.",
                    "Start a macro with macroName::prompt, such as inspect_note::Read /notes.txt and summarize it. Scripts can also use run_macro or window.triggerAgentResponse(prompt, macroName).",
                    "A definition needs planToUse, a nonempty responsePlanOverview, and a nonempty orderOfActions list. Each action needs an available command name and an objective describing what to do. whoToRespondAs, agentPrompt and agentName are optional.",
                    "create_macro checks the definition before saving. It only replaces an existing name if overwrite is enabled. Direct JSON edits need the same care because they do not use that creation check."
                ]
            },
            {
                "p": "Example plan: {\"planToUse\":{\"responsePlanOverview\":\"Inspect a selected note\",\"orderOfActions\":[{\"action\":\"fs_content\",\"objective\":\"Read the requested note and summarize it\"}]}}. The objective tells the agent what to do; the agent still chooses the file-reading arguments."
            },
            {
                "tip": "A macro can run tools and change data. Read its full plan and check its allowed commands before importing or starting it."
            }
        ],
        "show": [
            { label: "Saved macros", run: (ctx) => ctx.openSettings("esoboldAgent") }
        ]
    },
    {
        "id": "macro-files-and-overrides",
        "title": "Running macros on files and limiting their tools",
        "blocks": [
            {
                "list": [
                    "run_macro_on_files takes an array of paths, a macro name and an optional prompt. It expands selected folders, removes duplicate paths and runs once per file. Check the resulting file selection before a batch run.",
                    "Use get_macro_info to list saved names or inspect a definition. Correct missing or invalid definitions before starting; choose overwrite explicitly when replacing one.",
                    "wordCountEnabled enables counts for action summaries. surpressMessagesToUser can hide the agent's progress view when a macro is invoked directly, but nested run_macro does not pass that flag along. isUsingWhitelist limits tool choices; tools that are disabled remain excluded.",
                    "A macro may start another agent run. Repeat limits and confirmation dialogs still apply. Stopping a macro does not undo files or notes already changed."
                ]
            },
            {
                "tip": "Try a read-only plan on one file before using a plan that writes several files. Check each result and any report of text being cut short."
            }
        ]
    }
)
