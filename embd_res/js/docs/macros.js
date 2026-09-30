/*
 * Native guide: macros.
 * Sources: agent/agent_macros.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "macro-workflow",
        "title": "Agent macros: creation, invocation and saved plans",
        "blocks": [
            {
                "list": [
                    "Saved macros are edited in Settings → Agent as a JSON object keyed by macro name. Names accept letters, digits and underscores only. Keep an exported copy of important definitions.",
                    "Invoke a macro using macroName::prompt, through run_macro, or through window.triggerAgentResponse(prompt, macroName). The default macro map is copied into local saved settings on first initialization.",
                    "Each definition needs planToUse with a nonempty responsePlanOverview and nonempty orderOfActions. Each action has an available command name and a nonempty objective; whoToRespondAs, agentPrompt and agentName are optional metadata.",
                    "create_macro validates the definition and refuses an existing name unless overwrite is enabled. The saved JSON setting is also editable directly, so use the validated creation route or carefully check direct edits."
                ]
            },
            {
                "p": "Minimal plan shape: {\"planToUse\":{\"responsePlanOverview\":\"Inspect a requested file\",\"orderOfActions\":[{\"action\":\"fs_content\",\"objective\":\"Read the requested path and report its contents\"}]}}. Actions describe objectives; the agent still chooses the actual command arguments."
            },
            {
                "tip": "A saved macro is executable automation. Review its complete plan and allowed commands before importing or invoking it."
            }
        ],
        "show": [
            { label: "Saved macros", run: (ctx) => ctx.openSettings("esoboldAgent") }
        ]
    },
    {
        "id": "macro-files-and-overrides",
        "title": "Macros over files, whitelist behavior and results",
        "blocks": [
            {
                "list": [
                    "run_macro_on_files takes a path array and a macro name, with an optional prompt. It tries to expand directory paths using listEntries, deduplicates resulting paths and runs the macro once per distinct file. A directory can therefore expand the scope beyond one file; review the selected paths first.",
                    "get_macro_info lists available names or returns one definition. A missing/invalid macro is an error; overwriting requires an explicit choice.",
                    "wordCountEnabled controls action-summary counts. surpressMessagesToUser can suppress a directly invoked macro's whole visualiser, but run_macro does not forward that macro flag in this revision; it is not a per-stage private-draft guarantee. isUsingWhitelist filters candidates, but hard-disabled names remain excluded.",
                    "A macro can request another agent run; repeated automation, network calls and writes remain subject to the selected runtime limits and confirmations. Stop does not restore earlier file or context state."
                ]
            },
            {
                "tip": "Use narrow input paths and a read-only macro before trying a write-oriented batch. Check individual results and any truncation metadata."
            }
        ]
    }
)
