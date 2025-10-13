let createGeneratePayload = (prompt) => {
    return {
        "genkey": `KCPPAgent${Math.floor(Math.random() * 1000)}`,
        "max_context_length": localsettings.max_context_length,
        "max_length": localsettings.max_length,
        "min_p": localsettings.min_p,
        "presence_penalty": localsettings.presence_penalty,
        "prompt": replace_placeholders(prompt, false, true),
        "render_special": false,
        "rep_pen": localsettings.rep_pen,
        "rep_pen_range": localsettings.rep_pen_range,
        "rep_pen_slope": localsettings.rep_pen_slope,
        "sampler_order": localsettings.sampler_order,
        "stop_sequence": get_stop_sequences(),
        "temperature": localsettings.temperature,
        "top_p": localsettings.top_p,
        "trim_stop": true
    }
}

let generateFromPrompt = (prompt, grammar = "", images = [], bannedTokens = []) => {
    let payload = createGeneratePayload(prompt)
    if (!!grammar) {
        payload.grammar = grammar
        payload["grammar_retain_state"] = false
        payload["banned_tokens"] = ["{}"].concat(bannedTokens).concat(localsettings.tokenbans.split("||$||"))
    }
    concat_gametext(true, "", "", "", false, true)
    let llavaImages = insertAIVisionImages.concat(images)
    if (is_using_kcpp_with_vision() && llavaImages.length > 0) {
        payload.images = llavaImages;
    }
    let reqOpt = {
        method: 'POST', // or 'PUT'
        headers: get_kobold_header(),
        body: JSON.stringify(payload),
    };
    if (globalabortcontroller) {
        reqOpt.signal = globalabortcontroller.signal;
    }
    let sub_endpt = apply_proxy_url(custom_kobold_endpoint + kobold_custom_gen_endpoint);
    return fetch(sub_endpt, reqOpt)
        .then((response) => response.json())
}

let generateAndGetTextFromPrompt = async (prompt, grammar = "", images = [], bannedTokens = []) => {
    let resp = await generateFromPrompt(prompt, grammar, images, bannedTokens)
    let isRespValid = !!resp?.results && Array.isArray(resp.results) && resp.results.length > 0
    if (isRespValid) {
        return resp.results[0].text
    }
    return null
}

let generateResponseToInstruction = async (prompt) => {
    let formattedPrompt = createInstructPrompt(prompt)
    return await generateAndGetTextFromPrompt(formattedPrompt)
}

let split = (input, ...delimiters) => {
    let output = [], currentString = input, i = 0

    while (currentString.length > 0 && i < 100000) {
        i++
        let splitPositions = delimiters.map(delimiter => currentString.indexOf(delimiter)).filter(pos => pos > -1).sort()
        if (splitPositions.length > 0) {
            let newDel = delimiters.map(delimiter => { let pos = (currentString.substring(delimiter.length, currentString.length)).indexOf(delimiter); return pos > 0 ? pos + delimiter.length : -1 })
            combinedPos = splitPositions.concat(newDel).filter(pos => pos > 0).sort((a, b) => a > b ? 1 : -1)
            let splitPos;
            if (combinedPos.length === 0) {
                splitPos = currentString.length
            }
            else {
                splitPos = combinedPos[0]
            }
            output.push(currentString.substring(0, splitPos))
            currentString = currentString.substring(splitPos)
        }
        else {
            output.push(currentString)
            break
        }
    }
    return output.filter(text => text.length > 0)
}

let listOfExclusions = ["Action taken:", "Action taken (words =", "History search performed:", "Chain of thought complete", "Stop thinking action confirmed",
    "Web search results:", "Text has been added to history", "Formula evaluation result:", "Formula evaluation could not be completed as no formula was provided",
    "Text has been added to history", "Text was empty - nothing added to history", "Search string was empty, no search performed", "Word count is", "Image analysed:",
    "Image generated", "No prompt provided, image not generated", "Text has been spoken", "No text provided, nothing has been said", "Setting overview has been overwritten",
    "No setting overview provided, nothing has been overwritten", "Current state has been overwritten", "No state provided, nothing has been overwritten", "Current order of actions has been cleared",
    "Current order of actions has been overwritten", "No order of actions provided, nothing has been overwritten", "Error - Empty response instead of action. Ensure all responses are valid JSON.",
    "Current state format has been overwritten", "No valid state format provided, nothing has been overwritten", `Text has been added to world info:`, `Text was empty - nothing added to world info`, `Chain of thought had an exception`]

let hideAgentModeCotForAestheticMode = (container = document) => {
    [...container.querySelectorAll("end_of_context_koboldlite_internal > div")]
        .filter(elem => listOfExclusions.find(excludedStart => elem.innerText.trim().indexOf(excludedStart) === 0))
        .forEach(elem => elem.style.display = "none")
}

let originalRenderAestheticUI = render_aesthetic_ui

render_aesthetic_ui = (input, isPreview) => {
    let aestheticHTML = document.createElement("div")
    aestheticHTML.innerHTML = originalRenderAestheticUI(input, isPreview)
    if (isAgentModeEnabledAndSetCorrectly() && !!localsettings?.agentHideCOT) {
        hideAgentModeCotForAestheticMode(aestheticHTML)
    }
    return aestheticHTML.innerHTML
}

var loadingNewGame = true
let originalRepackInstructTurns = repack_instruct_turns, cotOverrideRepack = false;

repack_instruct_turns = (input, usertag, aitag, systag, allow_blank, filterOutActions = (localsettings?.agentHideCOT)) => {
    if (isAgentModeEnabledAndSetCorrectly()) {
        let turns = split(input, usertag, aitag, systag)
        let combined_chunks = turns.map(elem => {
            let out = {}
            if (elem.indexOf(usertag) !== -1) {
                out.source = "human"
                out.myturn = true
            }
            else if (elem.indexOf(aitag) !== -1) {
                out.source = "ai"
                out.myturn = false
            }
            else if (elem.indexOf(systag) !== -1) {
                out.source = "system"
                out.myturn = false
            }
            else {
                out.source = ""
            }
            out.message = elem.replace(usertag, "").replace(aitag, "").replace(systag, "")
            return out
        })

        if (loadingNewGame) {
            loadingNewGame = false
            let suggestionsRegex = new RegExp(`suggestionsToPickFrom: (\\[.*?\\])`, "gm")

            let decodeEntities = (function () {
                // this prevents any overhead from creating the object each time
                let element = document.createElement('div');

                function decodeHTMLEntities(str) {
                    if (str && typeof str === 'string') {
                        // strip script/html tags
                        str = str.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '');
                        str = str.replace(/<\/?\w(?:[^"'>]|"[^"]*"|'[^']*')*>/gmi, '');
                        element.innerHTML = str;
                        str = element.textContent;
                        element.textContent = '';
                    }

                    return str;
                }

                return decodeHTMLEntities;
            })();

            for (let i = combined_chunks.length - 1; i >= 0 && i >= combined_chunks.length - 4; i--) {
                let elem = combined_chunks[i]
                try {
                    let cleanedText = decodeEntities(elem.message)

                    // Hacky way to pick up multiple suggestions (up to 15)
                    let matcher = /suggestionsToPickFrom:[\t\n]*Array:([\t\n]+"(.*?)")([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?([\t\n]+"(.*?)")?/gms

                    let suggestions = []
                    cleanedText.matchAll(matcher).forEach(match => {
                        // Every even pos after 2 will be a suggestion from the matches if returned
                        for (let i = 2; i < match.length; i++) {
                            if (i % 2 === 0 && match[i] !== undefined && match[i] !== null) {
                                suggestions.push(match[i].trim())
                            }
                        }
                    })
                    if (suggestions.length > 0) {
                        setSuggestions(suggestions)
                        break
                    }
                }
                catch (e) {
                    // Suppress errors
                }
            }
        }

        if (filterOutActions) {
            combined_chunks = combined_chunks
                .filter(elem => !listOfExclusions.find(excludedStart => elem.message.trim().indexOf(excludedStart) === 0))
                .map(elem => {
                    if (elem.message.indexOf("Request for user input:") === 0) {
                        elem.message = elem.message.replace("Request for user input:", "").trim()
                    }
                    return elem
                })
        }

        return combined_chunks.map(elem => {
            if (allow_blank || elem.message.trim() != "") {
                return {
                    msg: elem.message,
                    source: elem.source,
                    myturn: elem.myturn
                }
            }
            return null
        }).filter(elem => elem !== null)
    }
    else {
        return originalRepackInstructTurns(input, usertag, aitag, allow_blank)
    }
};

let getLastActions = (amountOfActions = 10) => {
    let exclusions = ["Chain of thought repetition detected - ending", "Chain of thought complete", "plan_actions"]
    // , "Action: {", "Action (words =", "Action taken: ", "Action taken (words ="
    // "Action: {", "Action (words =", "Action taken: ", "Action taken (words ="
    return repack_instruct_turns(concat_gametext(true), `{{[INPUT]}}`, `{{[OUTPUT]}}`, `{{[SYSTEM]}}`, true, false).map(msg => {
        msg.msg = msg.msg.replaceAll("{{[SYSTEM_END]}}", "").replaceAll("{{[INPUT_END]}}", "").replaceAll("{{[OUTPUT_END]}}", "").trim();
        return msg
    }).filter(msg => !/^\n*$/.test(msg.msg) && !!msg.msg && !exclusions.find(exclusion => msg.msg.indexOf(exclusion) !== -1)).splice(-amountOfActions)
}

let getDocumentFromTextDB = (documentName) => {
    regex = `\(\\[DOCUMENT BREAK\\]\\[${documentName}\\]\)\(.*?\)\(\\[DOCUMENT BREAK\\]\)`
    let match = documentdb_data.match(new RegExp(regex, "s"))
    return !!match ? match[2].trim() : null
}

let calcImageSizing = (aspect) => {
    let { iwidth, iheight } = getImageSizing()
    let sizing = [iheight, iwidth];
    switch (aspect) {
        case "landscape":
            if (iwidth == iheight) {
                iwidth -= 256
            }
            sizing = [Math.min(iwidth, iheight), Math.max(iwidth, iheight)]
            break
        case "portrait":
            if (iwidth == iheight) {
                iwidth -= 256
            }
            sizing = [Math.max(iwidth, iheight), Math.min(iwidth, iheight)]
            break
        default:
            if (iwidth != iheight && Math.max(iwidth, iheight) == 1024) {
                iheight = 768
                iwidth = 768
            }
            sizing = [Math.min(iwidth, iheight), Math.min(iwidth, iheight)]
            break
    }
    return sizing
}

let getInitialAgentPrompt = (commands = getEnabledCommands(), max_mem_len) => {
    prompt = ""
    if (!!current_memory) {
        prompt += createSysPrompt(`Setting overview:\n\n${substring_to_boundary(current_memory, max_mem_len)}`)
    }
    return prompt
}

let getFinalAgentPrompt = (commands, currentOrderOfActions, objectiveForCurrentAction, initialPrompt) => {
    let state = getDocumentFromTextDB('State')
    let prompt = []

    let sysPrompt;
    if (!!localsettings.instruct_sysprompt) {
        sysPrompt = localsettings.instruct_sysprompt
    }
    else {
        sysPrompt = `You are a decision making action AI that evaluates thoughts and takes concise, purposeful actions which lead to a response to the user. Ensure you always send at least one response which is visible to the user.`
        if (current_memory.length > 0) {
            sysPrompt += " Ensure responses are in line with the setting overview. Only override the setting overview when the user explicitly instructs you to do so."
        }
        sysPrompt += " Providing suggestions will force you to stop taking actions. Only include suggestions when you have nothing else to do or require user input."
    }
    if (state != null) {
        prompt.push(`Current state: ${state}`)
    }
    let currentAgentWIs = current_wi.filter(wi => !!wi?.wigroup && wi.wigroup === "Agent").map(wi => wi?.comment)
    if (currentAgentWIs.length > 0) {
        prompt.push(`Current unique identifiers for world info: ${currentAgentWIs.join(", ")}`)
    }
    prompt.push(`System prompt for all responses: ${sysPrompt}`)
    if (!!initialPrompt) {
        prompt.push(`Most recent input from user: ${initialPrompt}`)
    }
    if (!!objectiveForCurrentAction) {
        prompt.push(`Objective for current action: ${objectiveForCurrentAction}`)
    }
    // if (currentOrderOfActions.length > 0)
    // {
    // 	prompt.push(`Order of actions: ${currentOrderOfActions.join(" -> ")}`)
    // }
    let basePrompt = prompt.join("\n\n")
    return createSysPrompt(`### Available commands:\n\n${getCommandsAsText(!!commands.find(c => c.name === "plan_actions") ? getEnabledCommands() : commands)}`) + (basePrompt.length > 0 ? createSysPrompt(basePrompt) : "")
}

/**
 * Mostly a copy and paste of the main function - tweaked the format returned along with adding a clean cut off for WI
 */
let getWorldInfoForAgent = (wimatch_context, maxWILength) => {
    //if world info exists, we inject it right after the memory
    //for each matching key
    if (wi_searchdepth > 0) {
        let cutoff = wimatch_context.length - wi_searchdepth;
        cutoff = cutoff < 0 ? 0 : cutoff;
        wimatch_context = wimatch_context.substring(cutoff);
    }
    if (!localsettings.case_sensitive_wi) {
        wimatch_context = wimatch_context.toLowerCase();
    }

    let wistr = "";
    if (current_wi.length > 0) {
        for (var x = 0; x < current_wi.length; ++x) {
            let wi = current_wi[x];

            let shoulduse = false;

            //see if this is a valid wi entry
            if (wi.content == null || wi.content == "") {
                continue;
            }

            if (wi.widisabled) {
                continue;
            }

            if (wi.constant) {
                shoulduse = true;
            } else {
                //see if this is a valid wi entry
                if (wi.key == null || wi.key == "") {
                    continue;
                }

                //selective, but bad secondary key. treat as only 1 key
                let invalidseckey = (wi.selective && (wi.keysecondary == "" || wi.keysecondary == null));
                let invalidantikey = (wi.selective && (wi.keyanti == "" || wi.keyanti == null));

                let wiks = wi.key.split(",");

                if (!wi.selective || (invalidseckey && invalidantikey)) {
                    if (localsettings.case_sensitive_wi) {
                        shoulduse = wiks.some(k => wimatch_context.includes(k.trim()));
                    } else {
                        shoulduse = wiks.some(k => wimatch_context.includes(k.trim().toLowerCase()));
                    }
                } else {
                    let wikanti = [];
                    let wiks2 = [];
                    if (!invalidantikey) {
                        wikanti = wi.keyanti.split(",");
                    }
                    if (!invalidseckey) {
                        wiks2 = wi.keysecondary.split(",");
                    }
                    let t1 = false,
                        t2 = false,
                        t3 = false;
                    if (localsettings.case_sensitive_wi) {
                        t1 = wiks.some(k => wimatch_context.includes(k.trim()));
                        t2 = wiks2.some(k => wimatch_context.includes(k.trim()));
                        t3 = wikanti.some(k => wimatch_context.includes(k.trim()));
                    } else {
                        t1 = wiks.some(k => wimatch_context.includes(k.trim().toLowerCase()));
                        t2 = wiks2.some(k => wimatch_context.includes(k.trim().toLowerCase()));
                        t3 = wikanti.some(k => wimatch_context.includes(k.trim().toLowerCase()));
                    }
                    if (!invalidantikey && !invalidseckey) //all keys valid
                    {
                        shoulduse = (t1 && t2 && !t3);
                    } else if (invalidantikey) {
                        shoulduse = (t1 && t2);
                    } else {
                        shoulduse = (t1 && !t3);
                    }
                }
            }

            // If accessing WI for a character's memory, switch based on the current chat opponent
            if (!!shoulduse && !!getChatOpponentForAgent() && (!!wi.comment && !!wi.wigroup) && (wi.comment.endsWith("_imported_memory") && wi.wigroup === wi.comment.replace("_imported_memory", ""))) {
                shoulduse = (wi.wigroup == localsettings.chatname) || (wi.wigroup == getChatOpponentForAgent())
            }

            if (shoulduse) {
                //check if randomness less than 100%
                if (wi.probability && wi.probability < 100) {
                    let roll = Math.floor(Math.random() * 100) + 1;
                    if (roll < wi.probability) {
                        let tags = (wi.key || "").split(",").concat((wi.keysecondary || "").split(",")).filter(elem => elem.trim() !== "").map(elem => elem.toLowerCase()).filter((elem, pos, arr) => pos === arr.indexOf(elem))
                        let wiString = `[Additional information (tags: ${tags.join(", ")}):\n${wi.content}]\n`
                        if (maxWILength < wistr.lengt + wiString.length) {
                            return wistr
                        }
                        wistr += wiString;
                    }
                } else {
                    //always insert
                    let tags = (wi.key || "").split(",").concat((wi.keysecondary || "").split(",")).filter(elem => elem.trim() !== "").map(elem => elem.toLowerCase()).filter((elem, pos, arr) => pos === arr.indexOf(elem))
                    let wiString = `[Additional information (tags: ${tags.join(", ")}):\n${wi.content}]\n`
                    if (maxWILength < wistr.lengt + wiString.length) {
                        return wistr
                    }
                    wistr += wiString;
                }
            }
        }
    }
    return wistr
}
let actionToText = (action) => {
    let actionAsText = `Name: ${action.name}\n`
    if (!!action.args) {
        let args = Object.keys(action.args).map(key => {
            let value = action.args[key];
            let val = value
            if (typeof value === "object") {
                try {
                    val = `\n${objToText(value, 2)}`
                }
                catch (e) {
                    val = JSON.stringify(value)
                }
            }
            return `\t${key}: ${val}`
        }).join("\n")
        actionAsText += `\nArguments:\n${args}\n`
    }
    else {
        actionAsText += "\nArguments: None\n"
    }
    return actionAsText
}

let currentOrderOfActionsOverall = [], currentOrderOfActionDescriptionsOverall = []
let recentActions = [], maxActionsInHistory = 1000, currentAgentCycle = null, endCurrent = false

let runAgentCycle = async (initialPrompt = undefined) => {

    clearSuggestions()
    endCurrent = false
    // gametext_arr = []
    // render_gametext()
    currentChainOfThought = []
    recentActions = []
    currentOrderOfActionsOverall = []
    currentOrderOfActionDescriptionsOverall = []

    let lastActions = getLastActions(maxActionsInHistory)
    lastActions.forEach(action => {
        switch (action.source) {
            case "system":
                addThought(createSysPrompt, action.msg, false, true);
                break;
            case "ai":
                addThought(createAIPrompt, action.msg, false, true);
                break;
            case "human":
                addThought(createInstructPrompt, action.msg, false, true);
                break;
        }
    })

    let textDBResults = ""
    if (!!initialPrompt) {
        initialPrompt = (localsettings.inject_chatnames_instruct ? `${localsettings.chatname}: ${initialPrompt}` : initialPrompt)
        addThought(createInstructPrompt, initialPrompt)
    }
    else if (!!lastActions && lastActions.length > 0) {
        let humanActions = lastActions.reverse().filter(elem => elem.source === "human")
        let prevInput = (humanActions.length > 0 ? humanActions[0].msg.replace(new RegExp(`^${localsettings.chatname}:\\s*`), "") : "");
        // let firstElem = lastActions.splice(-1); 
        // let prevInput = (firstElem.source === "human" ? firstElem.msg.replace(new RegExp(`^${localsettings.chatname}:\\s*`), "") : ""); 
        if (!!prevInput) {
            initialPrompt = prevInput
        }
    }
    if (!!initialPrompt && documentdb_provider != "0") {
        let contentToSearch = documentdb_data
        if (!!documentdb_searchhistory) {
            contentToSearch += `\n\n[DOCUMENT BREAK][Chatlog history]${concat_gametext(true)}[DOCUMENT BREAK]`
        }
        let ltmSnippets = await DatabaseMinisearch(contentToSearch, initialPrompt, "");
        for (let i = 0; i < ltmSnippets.length; ++i) {
            textDBResults += getInfoSnippet(ltmSnippets[i]);
        }
    }

    let hasAttemptedToCompleteOnce = false
    let lastThoughtWasBlank = false

    Array(...document.getElementsByClassName("stopThinking")).forEach(elem => elem.classList.remove("hidden"))

    currentOrderOfActionsOverall = getDocumentFromTextDB('Order of actions')
    currentOrderOfActionsOverall = !!currentOrderOfActionsOverall ? currentOrderOfActionsOverall.split(",").filter(act => !!act) : []
    currentOrderOfActionDescriptions = []

    // Get current config and model overrides
    // let configOverrides = {}
    let configOverrides = getDocumentFromTextDB("Agent config overrides")
    configOverrides = !!configOverrides ? configOverrides.split("|").map(joined => joined.split("::")).filter(arr => arr.length === 2 || arr.length === 3).reduce((obj, elem) => {
        obj[elem[0]] = {
            config: elem[1],
            model: (elem.length > 2 ? elem[2] : "")
        }
        return obj
    }, {}) : {}
    let manualOverridesForEnabledCommands = Object.keys(configOverrides)

    let originalConfiguration = await reloadUtils.getCurrentConfigAndModel()
    let previousConfig = JSON.parse(JSON.stringify(originalConfiguration))

    for (let i = 0; i < Number(localsettings.agentCOTMax) + 1 && (currentOrderOfActionsOverall.length === 0 || i < currentOrderOfActionsOverall.length + 1) && endCurrent === false; i++) {
        let nextAction = []
        let validCommands = getEnabledCommands(manualOverridesForEnabledCommands).map(command => command.name).filter(name => i != 0 || name != "stop_thinking")
        if (i == 0) {
            nextAction = getReasoningCommand(manualOverridesForEnabledCommands)
        }
        else {
            // Ensure valid commands does not include stop thinking right away to ensure an action of some type is taken
            nextAction = JSON.parse(JSON.stringify(currentOrderOfActionsOverall)).splice(i - 1).filter(acts => acts.split("|").find(act => validCommands.includes(act)))
            nextAction = nextAction.length > 0 ? getCommands().filter(act => nextAction[0].split("|").includes(act.name)) : getEnabledCommands(manualOverridesForEnabledCommands).filter(command => validCommands.includes(command.name))

            // Find any actions which have occured more than the max repeats in settings and remove them from the options
            if (currentOrderOfActionsOverall.length === 0) {
                let actionsOverMaxRepeats = recentActions.map(elem => elem?.command?.name).reduce((o, c) => {
                    let elem = o.find(e => e.name == c)
                    if (elem === undefined) {
                        o.push({ name: c, repeats: 1 })
                    } else {
                        elem.repeats++
                    }
                    return o
                }, []).filter(o => o.repeats >= localsettings.agentCOTRepeatsMax).map(o => o.name)
                nextAction = nextAction.filter(act => !actionsOverMaxRepeats.includes(act.name))
            }
        }


        // Find actions which are identical and have run twice - then remove them from the possible options to run again - applies when plans are not used
        if (currentOrderOfActionsOverall.length === 0) {
            let duplicateActions = recentActions.filter((elem, pos, arr) => arr.findIndex((elem2) => JSON.stringify(elem) === JSON.stringify(elem2)) !== pos).map(elem => elem?.command?.name)
            nextAction = nextAction.filter(act => !duplicateActions.includes(act.name))
        }

        // If no actions present, end cycle
        if (nextAction.length === 0) {
            isCompleted = true
            hasAttemptedToCompleteOnce = true
            continue
        }
        let jsonGrammar = await getCommandsGNBF(nextAction)

        currentChainOfThought = currentChainOfThought.splice(-maxActionsInHistory)
        recentActions = recentActions.splice(-maxActionsInHistory)

        // All content			
        let truncated_context = concat_gametext(true, "", "", "", false, true); //no need to truncate if memory is empty
        truncated_context = truncated_context.replace(/\xA0/g, ' '); //replace non breaking space nbsp

        // Context quantities
        let maxctxlen = localsettings.max_context_length;
        let maxgenamt = localsettings.max_length;
        let max_allowed_characters = getMaxAllowedCharacters(truncated_context, maxctxlen, maxgenamt);
        let max_mem_len = Math.floor(max_allowed_characters * 0.8);
        let max_anote_len = Math.floor(max_allowed_characters * 0.6);
        let max_wi_len = Math.floor(max_allowed_characters * 0.5);

        let history = getInitialAgentPrompt(nextAction, max_mem_len)
        let wiToInclude = createSysPrompt(substring_to_boundary(getWorldInfoForAgent(truncated_context, max_wi_len) + "\n\n" + textDBResults, max_wi_len))
        let anToInclude = !!current_anote ? createSysPrompt(substring_to_boundary(current_anotetemplate.replace("<|>", current_anote), max_anote_len)) : ""

        let promptOverview = currentOrderOfActionDescriptionsOverall.length > 0 ? currentOrderOfActionDescriptionsOverall[i - 1] : null
        if (i === 0) {
            let planningPrompt = "The last action from the user is the instruction. If you need to ask the user for a response, the action ask_user must be used and be put as the final action in the order. When handling images always use actions to get information when needed especially for descriptions. Produces a list of actions to respond to this instruction."
            if (localsettings.inject_chatnames_instruct) {
                planningPrompt += ` You must respond as ${localsettings.chatopponent.split("||$||").join(" or ")} when using the send_message or ask_user actions. Choose the person based on the user's instruction.`
            }
            promptOverview = planningPrompt
        }

        let finalAgentPrompt = getFinalAgentPrompt(nextAction, currentOrderOfActionsOverall, promptOverview, initialPrompt)

        let cotAsText = "", maxLengthOfCot = max_allowed_characters - history.length - wiToInclude.length - anToInclude.length - finalAgentPrompt.length
        for (let j = currentChainOfThought.length - 1; j >= 0; j--) {
            if (cotAsText.length + currentChainOfThought[j].length > maxLengthOfCot) {
                break
            }
            cotAsText = currentChainOfThought[j] + cotAsText
        }

        if (wi_insertlocation === "0") // WI after memory
        {
            history += wiToInclude
            history += substring_to_boundary(current_temp_memory + cotAsText, maxLengthOfCot)
        }
        else {
            history += substring_to_boundary(current_temp_memory + cotAsText, maxLengthOfCot)
            history += wiToInclude
        }
        history += anToInclude
        history += finalAgentPrompt
        // Add the start tag for the AI to guide it to respond as the AI
        history += instructendplaceholder
        // Add jailbreak if present
        if (!!localsettings?.inject_jailbreak_instruct) {
            history += localsettings.custom_jailbreak_text
        }
        let resp = await generateAndGetTextFromPrompt(replace_placeholders(history), jsonGrammar, [], recentActions.map(JSON.stringify))

        try {
            if (resp.trim() == "") {
                // addThought(createSysPrompt, "Error - Empty response instead of action. Ensure all responses are valid JSON.", lastThoughtWasBlank)
                isCompleted = true
                hasAttemptedToCompleteOnce = true
                continue
            }
            lastThoughtWasBlank = false
            let json;
            if (resp.indexOf("stop_thinking") !== -1) {
                isCompleted = true
                hasAttemptedToCompleteOnce = true
                continue
            }
            else {
                json = JSON.parse(resp)
            }
            if (!!json?.command && !!json.command?.name && (json.command.name === "plan_actions" || validCommands.includes(json.command.name))) {
                // If message has been sent before, skip processing it again and let the agent try again
                if (recentActions.find((elem) => JSON.stringify(elem) === JSON.stringify(json)) !== undefined) {
                    recentActions.push(json)
                    continue
                }

                let action = json
                recentActions.push(json)

                let actionSummary = []
                if (wordCountEnabled && !!action?.command?.args?.messages) {
                    let wordCount = action?.command?.args?.messages.flatMap(str => str.split(/\s/g).filter(s => s.length > 0)).length
                    actionSummary.push(`Action taken (words = ${wordCount}):`)
                }
                else {
                    actionSummary.push(`Action taken:`)
                }

                if (i > 0) {
                    actionSummary.push(`Aim: ${promptOverview}`)
                }
                actionSummary.push(`\`\`\`\n${actionToText(action?.command).trim()}\n\`\`\`\n\n`)
                addThought(createAIPrompt, actionSummary.join("\n\n"))

                let isCompleted = false;
                let command = [...getReasoningCommand(), ...getCommands()].find(command => command.name === action.command.name)
                if (!!command && command?.executor !== undefined) {
                    if (configOverrides[action.command.name]) {
                        let overrides = configOverrides[action.command.name]
                        if (previousConfig.config !== overrides.config || previousConfig.model !== overrides.model) {
                            await reloadUtils.reloadAndWait(overrides.config, overrides.model)
                            console.log("Completed reload");
                            previousConfig.config = overrides.config
                            previousConfig.model = overrides.model
                        }
                    }

                    let res = await command.executor(action.command)
                    if (res === true) {
                        isCompleted = true
                        hasAttemptedToCompleteOnce = true
                    }

                    if (previousConfig.config !== originalConfiguration.config || previousConfig.model !== originalConfiguration.model) {
                        await reloadUtils.reloadAndWait(originalConfiguration.config, originalConfiguration.model)
                        previousConfig.config = originalConfiguration.config
                        previousConfig.model = originalConfiguration.model
                        console.log("Completed reload");
                    }
                }

                if (isCompleted) {
                    if (!hasAttemptedToCompleteOnce) {
                        addThought(createAIPrompt, checkFinalThoughtsPrompt)
                        hasAttemptedToCompleteOnce = true
                    }
                    else {
                        addThought(createSysPrompt, "Chain of thought complete", true)
                        break
                    }
                }
            }
            else {
                if (Object.keys(json).length === 0 || json?.command?.name === "None" || json?.command?.name === "null") {
                    if (!hasAttemptedToCompleteOnce) {
                        addThought(createAIPrompt, checkFinalThoughtsPrompt)
                        hasAttemptedToCompleteOnce = true
                    }
                    else {
                        addThought(createSysPrompt, "Chain of thought complete", true)
                        break
                    }
                }
                else {
                    addThought(createSysPrompt, `Invalid command requested: ${JSON.stringify(json)}`)
                    // break
                }
            }
        }
        catch (e) {
            addThought(createSysPrompt, `Chain of thought had an exception: ${e}`)
            console.error(`Agent response which errored: ${resp}`)

            if (resp === null || resp.indexOf("evaluate_formula") === -1) {
                break
            }
        }
    }

    if (previousConfig.config !== originalConfiguration.config || previousConfig.model !== originalConfiguration.model) {
        await reloadUtils.reloadAndWait(originalConfiguration.config, originalConfiguration.model)
        console.log("Completed reload");
    }

    // Render any suggestions generated in the agent logic
    renderSuggestions()
    currentAgentCycle = null
    Array(...document.getElementsByClassName("stopThinking")).forEach(elem => elem.classList.add("hidden"))
    submit_multiplayer(true)
}

// Overrides to lite / UI interactions

let originalPrepareSubmitGeneration = prepare_submit_generation, originalRestartNewGame = restart_new_game;

prepare_submit_generation = async () => {
    if (isAgentModeEnabledAndSetCorrectly()) {
        let inputText = document.getElementById("input_text").value;
        document.getElementById("input_text").value = "";
        // Hack to ensure that images are always saved as new turns		
        localsettings.img_newturn = true
        if (currentAgentCycle !== null) {
            endCurrent = true
            await currentAgentCycle
        }
        currentAgentCycle = runAgentCycle(inputText)
    }
    else {
        originalPrepareSubmitGeneration()
    }
}

restart_new_game = () => {
    loadingNewGame = true
    currentChainOfThought = []
    recentActions = []
    clearSuggestions()
    originalRestartNewGame()
}

let toggleAgent = () => {
    populate_regex_replacers()

    display_settings()
    document.getElementById("agentBehaviour").checked = !document.getElementById("agentBehaviour").checked
    if (!document.getElementById("agentBehaviour").checked) {
        stopAgentThinking()
    }
    else {
        document.getElementById("separate_end_tags").checked = true
        toggle_separate_end_tags()
    }
    confirm_settings()
    updateAgentButtonVisibility();
    render_gametext();
}

let stopAgentThinking = () => {

    endCurrent = true
    Array(...document.getElementsByClassName("stopThinking")).forEach(elem => elem.classList.add("hidden"))
    currentAgentCycle = null
    submit_multiplayer(true)
    trigger_abort_controller()
}

let createStopThinkingButton = () => {

    ["input_text", "cht_inp", "corpo_cht_inp"].forEach(id => {
        let elem = document.createElement("span");
        elem.classList.add("stopThinking");
        document.getElementById(id).parentElement.appendChild(elem)
        elem.innerText = "Stop agent thinking"
        elem.classList.add("hidden")
        if (id === "input_text") {
            elem.style.right = "20px";
            elem.style.bottom = "10px";
        }
        else if (id === "cht_inp") {
            elem.style.right = "100px";
            elem.style.bottom = "0px";
        }
        else if (id === "corpo_cht_inp") {
            elem.style.right = "50px";
            elem.style.bottom = "0px";
        }
        elem.onclick = stopAgentThinking
    })
}

let removeChoiceContainer = () => {
    if (document.getElementById("choiceContainer")) {
        document.getElementById("choiceContainer").remove()
    }
}

let currentSuggestions = []
let setSuggestions = (suggestions) => {
    currentSuggestions = suggestions
}

let clearSuggestions = () => {
    currentSuggestions = []
    removeChoiceContainer()
}

let renderSuggestions = () => {
    removeChoiceContainer()
    if (!!currentSuggestions && currentSuggestions.length > 0) {
        let choiceContainer = document.createElement("span");
        choiceContainer.style.padding = "10px";

        choiceContainer.id = "choiceContainer"
        currentSuggestions.forEach(suggestion => {
            let choice = document.createElement("button");
            choice.classList.add("btn-primary")
            choice.innerText = suggestion;
            choice.onclick = () => {
                if (localsettings.gui_type_instruct == "3") {
                    document.getElementById("corpo_cht_inp").value = suggestion;
                }
                else if (localsettings.gui_type_instruct == "2") {
                    document.getElementById("cht_inp").value = suggestion;
                }
                else {
                    document.getElementById("input_text").value = suggestion;
                }

                // clearSuggestions();
                // document.getElementById("btnsend").onclick();
            }
            choiceContainer.appendChild(choice)
        })

        let cancelChoice = document.createElement("button");
        cancelChoice.classList.add("btn-primary")
        cancelChoice.innerText = "Clear suggestions";
        cancelChoice.onclick = () => {
            clearSuggestions()
        }
        choiceContainer.appendChild(cancelChoice)

        let container, input, sendButton;
        switch (parseInt(localsettings.gui_type_instruct)) {
            case 2:
                container = document.getElementById("chat_msg_body");
                input = document.getElementById("cht_inp");
                sendButton = document.getElementById("chat_msg_send_btn");
                break;
            case 3:
                container = document.getElementById("corpo_body");
                input = document.getElementById("corpo_cht_inp");
                sendButton = document.getElementById("corpo_chat_send_btn");
                break;
            default:
                container = document.getElementById("gametext");
                input = document.getElementById("input_text");
                sendButton = document.getElementById("btnsend");
                break
        }
        container.appendChild(choiceContainer);
    }
}

let originalRenderGametext = render_gametext;

render_gametext = (save = true, forceScroll) => {
    originalRenderGametext(save, forceScroll)
    if (isAgentModeEnabledAndSetCorrectly()) {
        renderSuggestions()
    }
    else {
        removeChoiceContainer()
    }
}


let originalMergeEditField = merge_edit_field;

merge_edit_field = () => {

    removeChoiceContainer()
    originalMergeEditField()
    renderSuggestions()
}

let originalBtnBack = btn_back, originalBtnRedo = btn_redo, originalBtnRetry = btn_retry;

btn_back = () => {
    clearSuggestions()
    originalBtnBack()
}

btn_redo = () => {
    clearSuggestions()
    originalBtnRedo()
}

btn_retry = () => {
    clearSuggestions()
    originalBtnRetry()
}