/*
 * Native guide: agents.
 * Sources: agent.js, agentUtils.js, agent/agent_planning_input.js, agent/agent_messaging.js, agent/agent_stream_visualizer.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
            id: "agent", title: "Agent mode (experimental)",
            blocks: [
                { p: "Agent mode lets the AI take several steps and use tools before replying. For example, it can search reference text, roll dice, calculate a formula, generate an image or ask you a question before continuing." },
                { list: [
                    "Enable it in Settings → Agent.",
                    "Use a model that can follow tool instructions. In Instruct mode, choose a suitable preset with separate start/end tags for user, AI and system messages, such as ChatML. These tags let the model tell the message types apart.",
                    "Set up and allow the tools you need in Settings → Tools. Search, images and speech also require the corresponding services or models.",
                    "Esobold/KoboldCpp Autoswap can switch between configured model types during the task, such as text and image models.",
                ] },
            ],
            show: [
                { label: "Open Settings → Agent", run: (ctx) => ctx.openSettings("esoboldAgent") },
            ],
        },
    {
        "id": "agent-setup",
        "title": "Agent setup: model and service requirements",
        "blocks": [
            {
                "list": [
                    "Enable agent mode in Settings → Agent or its chat control. Select a suitable model and formatting preset so it can distinguish user instructions, AI replies and tool actions.",
                    "The standard route restricts replies to supported command choices. Use OAI tools instead selects OpenAI-compatible tool calling; use it only with a model and service that support that format.",
                    "Open Settings → Tools → Esobold agent tools. Tick Allowed only for actions you want the agent to use; a group checkbox changes all tools in that group.",
                    "Skip initial planning lets the AI choose an action directly each cycle. Saved macro plans can still run. Streaming shows progress while the reply is being prepared."
                ]
            },
            {
                "tip": "The AI may choose an unsuitable action. Allow only the tools it needs, limit file access and read confirmation dialogs before approving changes."
            }
        ],
        "show": [
            { label: "Open agent setup", run: (ctx) => ctx.openSettings("esoboldAgent") },
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
                        "Limits the number of actions the agent can plan ahead."
                    ],
                    [
                        "Maximum repeated actions",
                        "Limits how often the same action type can repeat before the agent needs input."
                    ],
                    [
                        "Maximum actions in history",
                        "Limits previous actions sent with the next request. Use more than the plan length if you want the agent to retain earlier steps."
                    ],
                    [
                        "Replan on error",
                        "Plans again after a command's input is missing or invalid."
                    ],
                    [
                        "Stop on request for input",
                        "Chooses whether the plan pauses when the agent asks you a question."
                    ],
                    [
                        "Stop thinking / abort",
                        "Ends the run and cancels pending requests where possible. Completed writes or messages remain."
                    ]
                ]
            },
            {
                "p": "A cycle sends the conversation and instructions to the AI, chooses a plan or direct response, runs allowed actions, then adds their results before replying. Streaming may deliver text and pieces of tool input separately; the agent waits for a complete tool call before running it."
            },
            {
                "tip": "Continuing automatically or planning again after errors can use more AI requests. Disable those options if you want the agent to stop after a limited run."
            }
        ]
    },
    {
        "id": "agent-input-and-files",
        "title": "Agent input, suggested choices and file attachments",
        "blocks": [
            {
                "list": [
                    "When the agent asks for input, read the question and optional suggested replies. A suggestion fills the text box; Confirm and Continue sends your answer, while Stop loop ends the request.",
                    "You can add local files or select existing server files and folders where supported. Duplicate selections are removed. Local files upload when you confirm; a failed upload leaves the dialog open for correction.",
                    "The file picker lets you select existing entries. Its separate embedded-development action opens a preview instead of attaching file contents.",
                    "A path alone is not a file's text. fs_content reads a limited amount per file and reports if text was cut short; ask for a smaller line range to read the rest."
                ]
            },
            {
                "tip": "After an interrupted multi-file upload, check which paths were uploaded before retrying the remaining files."
            }
        ]
    },
    {
        "id": "agent-continuation",
        "title": "Continuing an agent task and showing progress",
        "blocks": [
            {
                "list": [
                    "Automatic, Prompt and Disabled choose what happens if a plan may still be unfinished. Prompt asks you before continuing; Disabled skips the completion check.",
                    "Automatic continuation does not reliably start the next step in this version. Choose Prompt or continue manually instead.",
                    "Hide agent thinking hides the AI's displayed reasoning. Skip previous COT leaves earlier reasoning text out of the history used by that feature. Neither option stops tools or makes all request data private.",
                    "Streaming needs support from the chosen service and tool format. Progress is displayed as it arrives; debug logs may contain the request and reply."
                ]
            },
            {
                "tip": "Use the explicit Prompt/manual route for continuation, and check each tool result before allowing another step."
            }
        ]
    }
)
