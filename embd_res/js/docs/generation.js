/*
 * Native guide: generation.
 * Sources: esoSampler.js.
 * Chapter/block contract and rendering live in ../esoGuide.js.
 */
ESO_GUIDE_CHAPTERS.push(
    {
        "id": "generation-settings",
        "title": "Generation settings and model formatting",
        "blocks": [
            {
                "list": [
                    "Under Settings, set context and response budgets for the loaded backend/model. The browser setting is a request budget, not a way to allocate a larger backend context.",
                    "For Instruct mode, choose the appropriate instruct preset and role delimiters. Chat names, system text, injected opponent names and stop sequences should agree with the selected template.",
                    "Configure output stopping separately from display: stop sequences and token/output limits can end generation; hiding reasoning or rendered markup is not an output-stopping rule.",
                    "Sampler presets fill parameter controls. Save a custom preset if you want to preserve deliberate tuning rather than continually modifying the built-in entry."
                ]
            },
            {
                "tip": "Check which sampler parameters the selected endpoint accepts. An online provider can ignore or reject local-backend options; a model with a different template can misinterpret an otherwise valid request."
            }
        ],
        "show": [
            { label: "General generation settings", run: (ctx) => ctx.openSettings("general") },
            { label: "Sampler settings", run: (ctx) => ctx.openSettings("samplers") }
        ]
    },
    {
        "id": "sampling-controls",
        "title": "Sampling, penalties and constrained output",
        "blocks": [
            {
                "table": [
                    [
                        "Family",
                        "Purpose and interaction"
                    ],
                    [
                        "Temperature / dynamic temperature",
                        "Controls distribution sharpness; dynamic temperature changes it according to the configured range/exponent."
                    ],
                    [
                        "Top-k, top-p, min-p, top-a, typical, TFS, n-sigma",
                        "Filter candidates by different distribution criteria. Combining aggressive filters can remove useful alternatives."
                    ],
                    [
                        "Repetition / presence / DRY penalties",
                        "Discourage repeated tokens/sequences. Range, slope, sequence breakers and allowed length change what is penalized."
                    ],
                    [
                        "Smoothing, XTC and adaptive-p",
                        "Additional distribution transforms/filtering; effectiveness and support depend on the backend."
                    ],
                    [
                        "Mirostat",
                        "An alternative adaptive sampling route with its own target/rate controls; do not assume all other filters retain the same effect."
                    ],
                    [
                        "Seed and sampler order",
                        "Seed controls randomness where supported; order changes which transforms run first."
                    ],
                    [
                        "Grammar / JSON schemas / token restrictions",
                        "Constrain output form or tokens. They do not establish factual correctness or make an action safe."
                    ]
                ]
            },
            {
                "p": "esoSampler.js adds one fork-specific sampler preset, including n-sigma alongside the inherited sampler settings. It uses sampler_seed = -1 for random sampling. Treat a preset as a starting point, not a model-independent optimum."
            },
            {
                "tip": "Change one family at a time and compare outputs with fixed inputs when evaluating behavior. Avoid stacking many penalties as a substitute for correcting an unsuitable prompt/template."
            }
        ]
    },
    {
        "id": "generation-failures",
        "title": "Stopping, empty output and failed requests",
        "blocks": [
            {
                "list": [
                    "If output stops immediately, inspect stop sequences, role delimiters, EOS handling, grammar validity and the output budget before changing the model.",
                    "A network/authentication/model-name error should be resolved at the selected endpoint. Backend reloads temporarily interrupt generation; wait for connection recovery.",
                    "Stop/abort cancels an outstanding browser request where possible. WaitingToast clears its transient status when the abort controller is triggered.",
                    "A streaming response can carry content, reasoning and tool calls separately. Agent streaming accumulates partial tool-call arguments before execution; partial text is not a complete successful result."
                ]
            },
            {
                "tip": "Do not repeatedly submit during a backend reload or pending user-input dialog. Check the connection and outstanding operation first."
            }
        ]
    }
)
