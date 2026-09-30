/*
 * Native guide: agents.
 * Sources: agent.js, agentUtils.js, agent/agent_planning_input.js, agent/agent_messaging.js, agent/agent_stream_visualizer.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "agent", title: "Agent mode (experimental)",
            blocks: [
                { p: "In agent mode the AI can take several steps and use tools before it answers: search the web, roll dice, evaluate formulas, generate or analyse images, speak through TTS, search the TextDB or ask you for input." },
                { list: [
                    "Turn it on under Settings → Agent.",
                    "It needs an instruct model with separate start and end tags for all roles (for example ChatML).",
                    "Tools such as web search, image generation or TTS must be set up and enabled first.",
                    "This mode works well with Esobold (or KoboldCPP)'s Autoswap, allowing the AI to switch model types and tools seamlessly during its multi-step reasoning.",
                ] },
            ],
            show: [
                { label: "Open Settings → Agent", run: (ctx) => ctx.openSettings("esoboldAgent") },
            ],
        },
    {
        "id": "agent-setup",
        "title": "Agent setup and endpoint requirements",
        "blocks": [
            {
                "list": [
                    "Enable agent behavior in Settings → Agent, or use its chat control. Use a model that can follow the selected tool protocol; correct role start/end tags are required for the grammar/instruct path.",
                    "The standard path generates grammar-constrained command choices. Use OAI tools selects the OpenAI-compatible chat-completions tool-calling path; the endpoint/model must actually support it.",
                    "Settings → Tools → Esobold agent tools groups commands by purpose. Check Allowed only for actions you intend to grant; group checkboxes change their member tools together.",
                    "Skip initial planning chooses commands directly each cycle; explicit macro plans still run. Streaming displays partial progress, not a completed result."
                ]
            },
            {
                "tip": "Model-generated actions are not trusted authorization. Restrict tools, paths, services and user confirmations independently of the model’s wording."
            }
        ],
        "show": [
            { label: "Agent behavior and protocol", run: (ctx) => ctx.openSettings("esoboldAgent") },
            { label: "Allowed agent tools", run: (ctx) => ctx.openSettings("tools") }
        ]
    },
    {
        "id": "agent-cycle",
        "title": "Planning, execution, limits and stopping",
        "blocks": [
            {
                "table": [
                    [
                        "Control",
                        "Effect"
                    ],
                    [
                        "Maximum agent actions per plan",
                        "Bounds how many future actions can be planned."
                    ],
                    [
                        "Maximum repeated actions",
                        "Limits repeats of the same action type before input is needed."
                    ],
                    [
                        "Maximum actions in history",
                        "Caps previous actions included in agent context; keep it larger than the plan length if continuity matters."
                    ],
                    [
                        "Replan on error",
                        "Restarts planning after invalid/missing command input instead of treating a failed step as completed."
                    ],
                    [
                        "Stop on request for input",
                        "Controls the user-input pause route while executing a plan."
                    ],
                    [
                        "Stop thinking / abort",
                        "Marks the run to end and cancels pending generation/input where possible; it does not undo completed writes/messages."
                    ]
                ]
            },
            {
                "p": "A cycle builds context, chooses a plan or direct tool/text response, executes available actions, records their results and finalizes a user-visible response. OAI streaming accumulates interleaved text/reasoning and multiple partial tool-call argument chunks before executing complete calls."
            },
            {
                "tip": "Automatic continuation and error replanning can cause additional requests beyond one plan. Disable them when a bounded run is important."
            }
        ]
    },
    {
        "id": "agent-input-and-files",
        "title": "Agent input, suggested choices and file attachments",
        "blocks": [
            {
                "list": [
                    "userInput shows a prompt and optional suggested answers. Clicking a suggestion fills the input; Confirm and Continue supplies it, while Stop loop ends the pending request.",
                    "When supported, add local files or select existing backend filesystem files/directories. The dialog deduplicates selections and uploads local bytes at confirmation; failures keep the dialog actionable.",
                    "The separate filesystem-picker overlay supports selecting entries or opening the embedded development view. It checks parent-message origin before accepting results.",
                    "A file path in a request does not automatically attach every file’s contents. fs_content has a per-file character limit with truncation metadata; request narrower line ranges for the omitted portion."
                ]
            },
            {
                "tip": "Do not assume an interrupted multi-file upload was rolled back. Check the reported uploaded paths before retrying."
            }
        ]
    },
    {
        "id": "agent-continuation",
        "title": "Continuation, visibility and source limitations",
        "blocks": [
            {
                "list": [
                    "Choose Automatic, Prompt or Disabled for behavior after a plan may still be incomplete. Disabled skips the task-completion check; Prompt asks the user before continuing.",
                    "In this reviewed revision the Automatic branch supplies a string where the later continuation code expects .input, so it does not reliably launch the intended next cycle. Use the explicit Prompt/manual route instead of depending on that option.",
                    "Hide agent thinking and Skip previous COT change visibility/context-history handling. They do not revoke tools, cancel side effects or guarantee removal of all reasoning from a remote service’s request.",
                    "Streaming requires the selected backend/protocol’s streaming support. Agent stream visualizer and OpenLumara stream handling display deltas; debug logs can contain request/response data."
                ]
            },
            {
                "tip": "This guide describes the pinned source, including limits; it does not claim that every experimental toggle is a working automation guarantee."
            }
        ]
    }
)
