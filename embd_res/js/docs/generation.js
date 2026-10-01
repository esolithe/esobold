/*
 * Native guide: generation.
 * Sources: esoSampler.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_PARTS.writing.chapters.push(
    {
        "id": "generation-settings",
        "title": "Generation settings and model formatting",
        "blocks": [
            {
                "list": [
                    "Open Settings to set the context limit and reply length for your model. Context is the text sent to the AI; reply length leaves room for its answer. These settings cannot enlarge the model's actual limit.",
                    "In Instruct mode, use the preset intended for your model. A preset supplies the tags that mark user, AI and system text. In Chat mode, check the player and character names.",
                    "Stop sequences are text markers that end a reply. Reply-length limits also stop generation. Hiding reasoning or formatting only changes what you see; it does not stop the AI.",
                    "Sampling controls choose which piece of text comes next in a reply. Open Settings → Samplers and start with a suitable preset, which fills in these controls. Save a custom preset if you want to keep your changes."
                ]
            },
            {
                "tip": "Different services support different settings. If a provider rejects an option or replies use the wrong role, check its supported settings and the model's formatting preset."
            }
        ],
        "show": [
            { label: "General generation settings", run: (ctx) => ctx.openSettings("general") },
            { label: "Sampler settings", run: (ctx) => ctx.openSettings("samplers") }
        ]
    },
    {
        "id": "sampling-controls",
        "title": "Sampling, repetition and output formats",
        "blocks": [
            {
                "table": [
                    [
                        "Family",
                        "What it changes"
                    ],
                    [
                        "Temperature / dynamic temperature",
                        "Changes how predictable word choices are. Lower values favor likely choices; higher values allow more variety. Dynamic temperature varies this within a chosen range."
                    ],
                    [
                        "Top-k, top-p, min-p, top-a, typical, TFS, n-sigma",
                        "Remove less suitable next-word choices in different ways. Using many strict filters together can leave too few choices."
                    ],
                    [
                        "Repetition / presence / DRY penalties",
                        "Discourage repeated words or phrases. Range and slope control how far back the penalty applies; sequence breakers and allowed length affect phrase repetition."
                    ],
                    [
                        "Smoothing, XTC and adaptive-p",
                        "Further adjust which next-word choices remain. Availability and results depend on the model service; leave them at a suitable preset until you need to experiment."
                    ],
                    [
                        "Mirostat",
                        "Adjusts sampling as the reply is generated, using its own target and rate. It can interact differently with the other filters."
                    ],
                    [
                        "Seed and sampler order",
                        "A seed selects a random starting state where supported. Sampler order chooses which adjustments happen first."
                    ],
                    [
                        "Grammar / JSON schemas / token restrictions",
                        "Restrict the reply to a format or allowed pieces of text. JSON is a text format for structured data, such as {\"location\":\"harbor\"}. Format restrictions do not guarantee a correct answer."
                    ]
                ]
            },
            {
                "p": "Esobold includes an additional sampler preset with n-sigma. Its seed value -1 requests random sampling. Treat the preset as a starting point: try a short, repeatable prompt and adjust settings for the model you use."
            },
            {
                "tip": "Change one group of settings at a time and compare answers to the same prompt. Check your prompt and formatting before adding more repetition penalties."
            }
        ]
    },
    {
        "id": "generation-failures",
        "title": "Stopping, empty output and failed requests",
        "blocks": [
            {
                "list": [
                    "If the reply ends immediately, check stop sequences, role tags, end-of-text handling, output-format restrictions and reply length.",
                    "For connection, key or unknown-model errors, check the chosen service's address, key and model name. Wait for reconnection after the server reloads a model.",
                    "Use Stop/Abort to cancel the active request where possible. The waiting indicator clears when the request is aborted.",
                    "Streaming shows text as it arrives. Reasoning and tool calls may arrive separately; wait for the operation's result before treating a tool action as finished."
                ]
            },
            {
                "tip": "Do not keep pressing Submit while a model reloads or a user-input dialog is waiting. Resolve the current operation first."
            }
        ]
    }
)
