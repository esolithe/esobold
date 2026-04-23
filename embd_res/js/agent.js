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
    llavaImages = llavaImages.filter((elem, pos, arr) => arr.indexOf(elem) === pos)
    if (is_using_kcpp_with_vision() && llavaImages.length > 0) {
        payload.images = llavaImages.map(str => str.includes("base64,")?str.split("base64,")[1]:str);
    }
    payload.params = {}
    payload = finalize_submit_payload(payload, !!prompt)
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

let generateAndStreamFromKCPP = async (prompt, grammar, bannedTokens, onToken) => {
    let payload = createGeneratePayload(prompt)
    if (!!grammar) {
        payload.grammar = grammar
        payload["grammar_retain_state"] = false
        payload["banned_tokens"] = ["{}"].concat(bannedTokens).concat(localsettings.tokenbans.split("||$||"))
    }
    concat_gametext(true, "", "", "", false, true)
    payload.params = {}
    payload = finalize_submit_payload(payload, !!prompt)

    let accum = ""
    await new Promise((resolve, reject) => {
        let reqOpt = {
            method: 'POST',
            headers: get_kobold_header(),
            body: JSON.stringify(payload)
        }
        if (globalabortcontroller) reqOpt.signal = globalabortcontroller.signal

        fetch(apply_proxy_url(custom_kobold_endpoint + "/api/extra/generate/stream"), reqOpt)
            .then(resp => {
                if (!resp.ok) return resp.text().then(t => { throw new Error("Stream failed: " + t) })
                return resp
            })
            .then(resp => {
                resp.body
                    .pipeThrough(new TextDecoderStream())
                    .pipeThrough(new TransformStream({
                        start(ctrl) { ctrl.buf = '' },
                        transform(chunk, ctrl) {
                            ctrl.buf += chunk
                            let evs = [], m
                            while ((m = /^event: (.*)\ndata: (.*)(\r?\n){2}/m.exec(ctrl.buf)) !== null) {
                                try { evs.push({ event: m[1], data: JSON.parse(m[2]) }) } catch (e) { }
                                ctrl.buf = ctrl.buf.substring(m.index + m[0].length)
                            }
                            if (evs.length) ctrl.enqueue(evs)
                        }
                    }))
                    .pipeTo(new WritableStream({
                        write(events) {
                            for (let ev of events) {
                                if (ev.event === 'message' && ev.data?.token !== undefined) {
                                    accum += ev.data.token
                                    if (ev.data.token && typeof onToken === 'function') onToken(ev.data.token)
                                }
                            }
                        },
                        close() { resolve(accum) },
                        abort(err) { reject(err) }
                    }))
            })
            .catch(reject)
    })
    return accum
}

let callOAIChatCompletions = async (messages, tools, toolChoice) => {
    let payload = {
        model: (localsettings.custom_oai_model || ""),
        messages,
        tools,
        tool_choice: toolChoice || "auto",
        temperature: localsettings.temperature,
        max_tokens: localsettings.max_length,
        stream: false
    }
    let reqOpt = {
        method: 'POST',
        headers: get_kobold_header(),
        body: JSON.stringify(payload)
    }
    if (globalabortcontroller) reqOpt.signal = globalabortcontroller.signal

    let resp = await fetch(apply_proxy_url(custom_kobold_endpoint + "/v1/chat/completions"), reqOpt)
        .then(r => r.json())

    if (!resp?.choices || !resp.choices.length) return null
    let choice = resp.choices[0]
    let message = choice.message
    return {
        content: message.content || null,
        tool_calls: message.tool_calls || null,
        finish_reason: choice.finish_reason
    }
}

let callOAIChatCompletionsStream = async (messages, tools, toolChoice, onToken) => {
    let payload = {
        model: (localsettings.custom_oai_model || ""),
        messages,
        tools,
        tool_choice: toolChoice || "auto",
        temperature: localsettings.temperature,
        max_tokens: localsettings.max_length,
        stream: true
    }
    let reqOpt = {
        method: 'POST',
        headers: get_kobold_header(),
        body: JSON.stringify(payload)
    }
    if (globalabortcontroller) reqOpt.signal = globalabortcontroller.signal

    let content = ""
    let tool_calls_accum = []
    let finish_reason = null

    await new Promise((resolve, reject) => {
        fetch(apply_proxy_url(custom_kobold_endpoint + "/v1/chat/completions"), reqOpt)
            .then(resp => {
                if (!resp.ok) return resp.text().then(t => { throw new Error("OAI stream failed: " + t) })
                return resp
            })
            .then(resp => {
                resp.body
                    .pipeThrough(new TextDecoderStream())
                    .pipeThrough(new TransformStream({
                        start(ctrl) { ctrl.buf = '' },
                        transform(chunk, ctrl) {
                            ctrl.buf += chunk
                            let evs = [], m
                            while ((m = /^data: ?(.*)(\r?\n){2}/m.exec(ctrl.buf)) !== null) {
                                let raw = m[1].trim()
                                if (raw !== '[DONE]') {
                                    try { evs.push(JSON.parse(raw)) } catch (e) { }
                                }
                                ctrl.buf = ctrl.buf.substring(m.index + m[0].length)
                            }
                            if (evs.length) ctrl.enqueue(evs)
                        }
                    }))
                    .pipeTo(new WritableStream({
                        write(events) {
                            for (let ev of events) {
                                let delta = ev?.choices?.[0]?.delta
                                if (!delta) continue
                                if (delta.content) {
                                    content += delta.content
                                    if (typeof onToken === 'function') onToken(delta.content)
                                }
                                if (delta.tool_calls) {
                                    for (let tc of delta.tool_calls) {
                                        let idx = tc.index || 0
                                        if (!tool_calls_accum[idx]) {
                                            tool_calls_accum[idx] = {
                                                id: tc.id || "",
                                                type: "function",
                                                function: { name: "", arguments: "" }
                                            }
                                        }
                                        if (tc.id) tool_calls_accum[idx].id = tc.id
                                        if (tc.function?.name) tool_calls_accum[idx].function.name += tc.function.name
                                        if (tc.function?.arguments) tool_calls_accum[idx].function.arguments += tc.function.arguments
                                    }
                                }
                                if (ev?.choices?.[0]?.finish_reason) {
                                    finish_reason = ev.choices[0].finish_reason
                                }
                            }
                        },
                        close() { resolve() },
                        abort(err) { reject(err) }
                    }))
            })
            .catch(reject)
    })

    return {
        content: content || null,
        tool_calls: tool_calls_accum.length > 0 ? tool_calls_accum : null,
        finish_reason
    }
}

let buildAgentContextState = (agentRunState, textDBResults, currentChainOfThought, commands, promptOverview) => {
    let truncated_context = concat_gametext(true, "", "", "", false, true)
    truncated_context = truncated_context.replace(/\xA0/g, ' ')

    let maxctxlen = localsettings.max_context_length
    let maxgenamt = localsettings.max_length
    let max_allowed_characters = getMaxAllowedCharacters(truncated_context, maxctxlen, maxgenamt)
    let max_mem_len = Math.floor(max_allowed_characters * 0.8)
    let max_anote_len = Math.floor(max_allowed_characters * 0.6)
    let max_wi_len = Math.floor(max_allowed_characters * 0.5)

    let systemPromptText = !!agentRunState?.systemPrompt ? substring_to_boundary(agentRunState.systemPrompt, max_mem_len) : ""
    let worldInfoForAgent = getWorldInfoForAgent(agentRunState, truncated_context, max_wi_len)
    let wiAndTextDbText = substring_to_boundary((worldInfoForAgent || "") + "\n\n" + (textDBResults || ""), max_wi_len)
    let authorsNoteText = !!current_anote ? substring_to_boundary(current_anotetemplate.replace("<|>", current_anote), max_anote_len) : ""

    let history = getInitialAgentPrompt(agentRunState, max_mem_len)
    let wiToInclude = createSysPrompt(wiAndTextDbText)
    let anToInclude = !!authorsNoteText ? createSysPrompt(authorsNoteText) : ""
    let finalAgentPrompt = getFinalAgentPrompt(agentRunState, commands, promptOverview)
    let maxLengthOfCot = max_allowed_characters - history.length - wiToInclude.length - anToInclude.length - finalAgentPrompt.length
    let cotAsText = ""
    for (let j = currentChainOfThought.length - 1; j >= 0; j--) {
        if (!!(currentChainOfThought[j]?.onlyDisplay)) {
            continue
        }
        if (cotAsText.length + currentChainOfThought[j].wrappedPrompt.length > maxLengthOfCot) {
            break
        }
        cotAsText = currentChainOfThought[j].wrappedPrompt + cotAsText
    }
    let agentRequestBody = substring_to_boundary(current_temp_memory + cotAsText, maxLengthOfCot)

    return {
        truncated_context,
        max_allowed_characters,
        max_mem_len,
        max_anote_len,
        max_wi_len,
        maxLengthOfCot,
        systemPromptText,
        history,
        worldInfoForAgent,
        wiAndTextDbText,
        authorsNoteText,
        wiToInclude,
        anToInclude,
        finalAgentPrompt,
        agentRequestBody
    }
}

let buildOAIBaseMessages = (agentRunState, contextState, persistedMessages = [], appendedMessages = []) => {
    let messages = []

    let systemParts = []
    if (!!contextState?.systemPromptText) {
        systemParts.push(`Setting overview:\n\n${contextState.systemPromptText}`)
    }

    let contextBlock = contextState?.agentRequestBody || ""
    let wiBlock = contextState?.wiAndTextDbText || ""
    if (wi_insertlocation === "0") {
        if (wiBlock) systemParts.push(wiBlock)
        if (contextBlock) systemParts.push(contextBlock)
    }
    else {
        if (contextBlock) systemParts.push(contextBlock)
        if (wiBlock) systemParts.push(wiBlock)
    }

    let isANoteTurnBased = "turn" === anote_strength
    if (!!contextState?.authorsNoteText) {
        if (isANoteTurnBased && systemParts.length > 0) {
            let mergedContext = insertAuthorsNoteToContext(systemParts.join("\n\n"), `\n\n${contextState.authorsNoteText}`)
            systemParts = [mergedContext]
        }
        else {
            systemParts.push(contextState.authorsNoteText)
        }
    }

    let state = getDocumentFromTextDB('State')
    if (state) systemParts.push(`Current state: ${state}`)

    let currentAgentWIs = current_wi.filter(wi => !!wi?.wigroup && wi.wigroup === "Agent").map(wi => wi?.comment)
    if (currentAgentWIs.length > 0) {
        systemParts.push(`Current unique identifiers for world info: ${currentAgentWIs.join(", ")}`)
    }
    let availableAgentMacros = getAvailableAgentMacros()
    if (Object.keys(availableAgentMacros).length > 0) {
        systemParts.push(`All available agent macros: ${Object.keys(availableAgentMacros).join(", ")}`)
    }
    systemParts.push(`Current date/time (UTC): ${new Date().toUTCString()}`)
    systemParts.push(`System prompt for all responses: ${agentRunState.agentPrompt}`)

    if (!!contextState?.finalAgentPrompt) {
        systemParts.push(contextState.finalAgentPrompt)
    }

    if (systemParts.length > 0) {
        messages.push({ role: "system", content: systemParts.join("\n\n") })
    }

    let excludeFromHistory = Array.isArray(agentRunState.excludeSpecificMessagePrefixes) ? [...agentRunState.excludeSpecificMessagePrefixes] : []
    if (!!localsettings?.agentSkipPreviousCOTWhenProcessing) {
        excludeFromHistory = excludeFromHistory.concat(listOfExclusions)
    }
    let history = getLastActions(localsettings.agentMaxActionsInHistory, excludeFromHistory)
    history.forEach(turn => {
        let role = turn.myturn ? "user" : "assistant"
        if (turn.source === "system") role = "system"
        messages.push({ role, content: turn.msg })
    })

    if (agentRunState.initialPrompt) {
        let lastMsg = messages[messages.length - 1]
        let promptContent = agentRunState.initialUser
            ? `${agentRunState.initialUser}: ${agentRunState.initialPrompt}`
            : agentRunState.initialPrompt
        if (!lastMsg || lastMsg.role !== "user" || !lastMsg.content.includes(agentRunState.initialPrompt)) {
            messages.push({ role: "user", content: promptContent })
        }
    }

    if (Array.isArray(persistedMessages) && persistedMessages.length > 0) {
        messages = messages.concat(persistedMessages)
    }

    if (Array.isArray(appendedMessages) && appendedMessages.length > 0) {
        messages = messages.concat(appendedMessages)
    }

    let getMessageLength = (message) => `${message?.content || ""}`.length
    let totalMessageLength = messages.reduce((sum, message) => sum + getMessageLength(message), 0)
    while (messages.length > 1 && totalMessageLength > contextState.max_allowed_characters) {
        totalMessageLength -= getMessageLength(messages[1])
        messages.splice(1, 1)
    }

    return {
        messages,
        oaiContext: contextState
    }
}

let updateAgentContextUsage = async (contextState, textDBResults) => {
    if (!window?.contextUsage || !contextState) {
        return
    }
    contextUsage.reset()
    contextUsage.setUsage("tempMemory", current_temp_memory.length)
    contextUsage.setUsage("textDB", (textDBResults || "").length)
    contextUsage.setUsage("worldInfo", (contextState.worldInfoForAgent || "").length)
    contextUsage.calculateOverspillUsage("worldInfo", "textDB", contextState.max_wi_len)
    contextUsage.setUsage("memory", (contextState.history || "").length)
    contextUsage.setUsage("authorsNote", (contextState.anToInclude || "").length)
    contextUsage.setUsage("systemPrompt", (contextState.finalAgentPrompt || "").length)
    contextUsage.setUsage("context", (contextState.agentRequestBody || "").length)
    contextUsage.calculateOverspillUsage("context", "tempMemory", contextState.maxLengthOfCot)
    await contextUsage.renderContextUsage()
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

let listOfExclusions = ["Action taken:", "Action taken (words =", "History search performed:", "Semantic search performed:", "Chain of thought complete",
    "Web search results:", "Text has been added to history", "Formula evaluation result:", "Formula evaluation could not be completed as no formula was provided",
    "Text has been added to history", "Text was empty - nothing added to history", "Search string was empty, no search performed", "Word count is", "Image analysed:",
    "FS_TOOL:", "Lumara response: ", "Response cut off due to length. Ending chain of thought.",
    "Image generated", "No prompt provided, image not generated", "Text has been spoken", "No text provided, nothing has been said", "Setting overview has been overwritten",
    "No setting overview provided, nothing has been overwritten", "Current state has been overwritten", "No state provided, nothing has been overwritten", "Error - Empty response instead of action. Ensure all responses are valid JSON.",
    "Current state format has been overwritten", "No valid state format provided, nothing has been overwritten", 
    `Text has been added to world info:`, `Text was empty - nothing added to world info`, `Chain of thought had an exception`, "Tool call response (hidden from user):", "Tool call response error (hidden from user):",
    "Unique identifer does not exist in world information", "World information search performed:", "Unique identifier was empty - no world information found", "Agent input:", "Macro:"]

window.agentListOfExclusions = listOfExclusions;

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

repack_instruct_turns = (input, usertag, aitag, systag, allow_blank, filterOutActions = (localsettings?.agentHideCOT), excludeSpecificMessagePrefixes = []) => {
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

        combined_chunks = combined_chunks
            .filter(elem => !excludeSpecificMessagePrefixes.find(excludedStart => elem.message.trim().indexOf(excludedStart) === 0))

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

let getLastActions = (amountOfActions = 10, excludeSpecificMessagePrefixes = []) => {
    let exclusions = ["Chain of thought repetition detected - ending", "Chain of thought complete", "plan_actions"]
    // , "Action: {", "Action (words =", "Action taken: ", "Action taken (words ="
    // "Action: {", "Action (words =", "Action taken: ", "Action taken (words ="
    return repack_instruct_turns(concat_gametext(true), `{{[INPUT]}}`, `{{[OUTPUT]}}`, `{{[SYSTEM]}}`, true, false, excludeSpecificMessagePrefixes).map(msg => {
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

let getInitialAgentPrompt = (agentRunState, max_mem_len) => {
    prompt = ""
    if (!!agentRunState?.systemPrompt) {
        prompt += createSysPrompt(`Setting overview:\n\n${substring_to_boundary(agentRunState.systemPrompt, max_mem_len)}`)
    }
    return prompt
}

let getFinalAgentPrompt = (agentRunState, commands, objectiveForCurrentAction) => {
    let { manualOverridesForEnabledCommands, agentPrompt, isUsingWhitelist, initialPrompt, agentInputPrompt } = agentRunState
    
    let state = getDocumentFromTextDB('State')
    let prompt = []

    let isPlanningStep = !!commands.find(c => c.name === "plan_actions") 
    if (!isPlanningStep) {
        let enabledCommands = getEnabledCommands(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist).map(cmd => {
            return cmd.name
        }).join(", ");
        prompt.push(`All enabled commands: ${enabledCommands}`)
    }
    let availableAgentMacros = getAvailableAgentMacros()
    if (Object.keys(availableAgentMacros).length > 0) {
        let macroNames = Object.keys(availableAgentMacros).join(", ")
        prompt.push(`All available agent macros: ${macroNames}`)
    }
    if (is_using_kcpp_with_fs()) {
        prompt.push(`KCPP with file system access is enabled.`)
        let embeddedFunctionGuidance = [
            `Embedded content can call three helper functions. Use the right one for the task:`,
            `1) triggerAgentResponse(prompt, macro?)`,
            `- Purpose: Start a full agent cycle that can use planning, tools, and macros.`,
            `- Use when: The embedded UI needs the agent to take actions or continue a workflow.`,
            `- Inputs: prompt is required text. macro is optional and should be a valid macro name.`,
            `- Behavior: If macro is provided, the runtime sends "<macro>::<prompt>" to the agent.`,
            `- Example:`,
            "```js",
            `(window?.opener || window?.parent).triggerAgentResponse("Summarize the current scene and suggest 3 next actions.")`,
            `(window?.opener || window?.parent).triggerAgentResponse("Find latest weather and report it.", "searchWeb")`,
            "```",
            `2) generateTextFromAI(prompt)`,
            `- Purpose: Get plain text from the model directly without launching an agent cycle.`,
            `- Use when: You only need a direct textual result and no command/tool execution.`,
            `- Inputs: prompt is required text.`,
            `- Behavior: Returns a text string (or null on failure).`,
            `- Example:`,
            "```js",
            `let summary = await (window?.opener || window?.parent).generateTextFromAI("Write a one-paragraph summary of this page.")`,
            `if (summary) document.querySelector("#summary").textContent = summary`,
            "```",
            `3) generateObjectFromAI(prompt, objectStructure?)`,
            `- Purpose: Get structured JSON that matches a target shape.`,
            `- Use when: Embedded content needs machine-readable output for UI logic.`,
            `- Inputs: prompt is required text. objectStructure is an optional example schema shape.`,
            `- Behavior: Uses grammar-constrained generation and returns a parsed object (or null on parse failure).`,
            `- Example:`,
            "```js",
            `let schemaShape = { title: "", priority: "", tags: [""], isBlocking: false }`,
            `let task = await (window?.opener || window?.parent).generateObjectFromAI(`,
            `  "Extract task details from the user message.",`,
            `  schemaShape`,
            `)`,
            `if (task) renderTaskCard(task)`,
            "```",
            `Rules:`,
            `- Prefer generateObjectFromAI for data that will be parsed or rendered as structured fields.`,
            `- Prefer generateTextFromAI for simple prose output.`,
            `- Prefer triggerAgentResponse only when an actual agent loop/action workflow is needed.`
        ].join("\n")
        prompt.push(`When using content from the file system in web pages, links or media within a created HTML page should be accessed using relative links. For example, an image "test.png" in the same directory is accessed via src="./test.png". Absolute links should be resolved by using the "{host}/fs/test.png" and only used when providing the user links to the page directly.`)
        prompt.push(embeddedFunctionGuidance)
    }

    if (state != null) {
        prompt.push(`Current state: ${state}`)
    }
    let currentAgentWIs = current_wi.filter(wi => !!wi?.wigroup && wi.wigroup === "Agent").map(wi => wi?.comment)
    if (currentAgentWIs.length > 0) {
        prompt.push(`Current unique identifiers for world info: ${currentAgentWIs.join(", ")}`)
    }
    prompt.push(`Current date/time (UTC): ${new Date().toUTCString()}`)
    prompt.push(`System prompt for all responses: ${agentPrompt}`)
    if (!!initialPrompt) {
        prompt.push(`Most recent input from user: ${initialPrompt}`)
    }
    if (!!agentInputPrompt) {
        prompt.push(`Most recent input from agent: ${agentInputPrompt}`)
    }
    if (!!objectiveForCurrentAction) {
        prompt.push(`Objective for current action: ${objectiveForCurrentAction}`)
    }
    // if (currentOrderOfActions.length > 0)
    // {
    // 	prompt.push(`Order of actions: ${currentOrderOfActions.join(" -> ")}`)
    // }
    let basePrompt = prompt.join("\n\n")
    return createSysPrompt(`### Available commands:\n\n${getCommandsAsText(isPlanningStep ? getEnabledCommands(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist) : commands)}`) + (basePrompt.length > 0 ? createSysPrompt(basePrompt) : "")
}

/**
 * Mostly a copy and paste of the main function - tweaked the format returned along with adding a clean cut off for WI
 */
let getWorldInfoForAgent = (agentRunState, wimatch_context, maxWILength) => {
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
            if (!!shoulduse && !!agentRunState.agentName && (!!wi.comment && !!wi.wigroup) && (wi.comment.endsWith("_imported_memory") && wi.wigroup === wi.comment.replace("_imported_memory", ""))) {
                shoulduse = (wi.wigroup == localsettings.chatname) || (wi.wigroup == agentRunState.agentName)
            }

            if (shoulduse) {
                //check if randomness less than 100%
                if (wi.probability && wi.probability < 100) {
                    let roll = Math.floor(Math.random() * 100) + 1;
                    if (roll < wi.probability) {
                        let tags = (wi.key || "").split(",").concat((wi.keysecondary || "").split(",")).filter(elem => elem.trim() !== "").map(elem => elem.toLowerCase()).filter((elem, pos, arr) => pos === arr.indexOf(elem))
                        let wiString = `[Additional information (tags: ${tags.join(", ")}):\n${wi.content}]\n`
                        if (maxWILength < wistr.length + wiString.length) {
                            return wistr
                        }
                        wistr += wiString;
                    }
                } else {
                    //always insert
                    let tags = (wi.key || "").split(",").concat((wi.keysecondary || "").split(",")).filter(elem => elem.trim() !== "").map(elem => elem.toLowerCase()).filter((elem, pos, arr) => pos === arr.indexOf(elem))
                    let wiString = `[Additional information (tags: ${tags.join(", ")}):\n${wi.content}]\n`
                    if (maxWILength < wistr.length + wiString.length) {
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

let currentAgentCycle = [];

window.objRefAssign = (target, ...sources) => {
    sources.forEach(source => {
        if (typeof source === "object") {
            Object.keys(source).forEach(key => {
                if (target[key] === undefined) {
                    target[key] = source[key]
                }
            })
        }
    })
    return target
}

window.objRefOverride = (target, ...sources) => {
    sources.forEach(source => {
        if (typeof source === "object") {
            Object.keys(source).forEach(key => {
                target[key] = source[key]
            })
        }
    })
    return target
}

let logAgentFunctionCall = (agentPhase, agentRunState) => {
    let { interactionId, logger } = agentRunState
    logger.debug(`Agent ${agentPhase} #${interactionId}:`, agentRunState)
}

let genericAgentInitialiser = async (agentRunState) => {
    // Make no changes to the initial values by default
    logAgentFunctionCall("initialiser", agentRunState)
}

let genericAgentVisualiser = async (visualiserParams) => {
    logAgentFunctionCall("visualiser", visualiserParams)
    let { currentChainOfThought, interactionId, cotProcessedUntil, printToConsole, agentRunState } = visualiserParams
    let cotIndex = cotProcessedUntil || agentRunState?.cotProcessedUntil || 0
    let currCOT = currentChainOfThought || agentRunState?.currentChainOfThought || []

    if (!!agentRunState && currCOT.length > 0) {
        currentChainOfThought.slice(cotIndex).forEach(elem => {
            let { wrappedPrompt, onlyAdd } = elem;
            if (!onlyAdd) {
                gametext_arr.push(wrappedPrompt.replace(/\\\\/g, ""))
                render_gametext()
            }
        })
        agentRunState.cotProcessedUntil = currentChainOfThought.length
    }
}

let genericAgentFinaliser = async (agentRunState) => {
    logAgentFunctionCall("finaliser", agentRunState)
    renderSuggestions()
    submit_multiplayer(true)
    agentRunState.logger.debug(`Agent loop #${agentRunState?.interactionId} completed`)
}

let voidAgentVisualiser = async (visualiserParams) => {
    logAgentFunctionCall("visualiser", visualiserParams)
    let { currentChainOfThought, agentRunState } = visualiserParams
    agentRunState.cotProcessedUntil = currentChainOfThought.length
    clearSuggestions();
}

window.eso.agentUtilityMethods = {
    genericAgentInitialiser, genericAgentVisualiser, genericAgentFinaliser, voidAgentVisualiser
}

window.eso.agentMacros = {
    "echo": {
        printToConsole: true,
        planToUse: {
            "responsePlanOverview": "The user has sent a message. I must simply respond with the exact same message.",
            "orderOfActions": [
                {
                    "action": "send_message",
                    "objective": "Replying with the users message"
                }
            ]
        },
        agentName: null,
    },
    "imageGen": {
        printToConsole: true,
        planToUse: {
            "responsePlanOverview": "The user has sent an image prompt. I must generate an image based on this prompt.",
            "orderOfActions": [{
                "action": "generate_image",
                "objective": "Generate an image based on the user provided prompt"
            }]
        },
        // configOverrides: {
        //     "generate_image": {
        //         config: "ZImageAnim.kcpps"
        //     }
        // }
    },
    "tellAJoke": {
        printToConsole: true,
        planToUse: {
            "responsePlanOverview": "The user has asked me to tell a joke. If they include a prompt, base it on that.",
            "orderOfActions": [
                {
                    "action": "send_message",
                    "objective": "Tell the user a funny joke."
                }
            ]
        }
    },
    "override": {
        printToConsole: true,
        // planToUse: {
        //     "responsePlanOverview": "The user has told me an instruction which overrules the current scene, world setting or other details. The instruction must be acted upon without limitations to ensure its objective is met.",
        //     "orderOfActions": [
        //         {
        //             "action": "send_message",
        //             "objective": "Implement the action, replying with a confirmation of the override in brackets. Then continue with the response if needed (such as the override calling for changes which require your last response to be rewritten."
        //         }
        //     ]
        // },
        agentPrompt: "The user has told me an instruction which overrules the current scene, world setting or other details. The instruction must be acted upon without limitations to ensure its objective is met.\n\nImplement the action, replying with a confirmation of the override in brackets. Then continue with the response if needed (such as the override calling for changes which require your last response to be rewritten."
    },
    "searchWeb": {
        printToConsole: true,
        planToUse: {
            "responsePlanOverview": "The user has asked me to search the web. If they include a prompt, base the search on answering their question.",
            "orderOfActions": [
                {
                    "action": "web_search",
                    "objective": "Search the web for details about the prompt"
                },
                {
                    "action": "send_message",
                    "objective": "Summarise the search results. Include links to the sources."
                }
            ]
        }
    },
    "lumara": {
        printToConsole: true,
        planToUse: {
            responsePlanOverview: "Send a message to the OpenLumara system.",
            orderOfActions: [
                {
                    "action": "lumara_send",
                    "objective": "Send the message specified by the user to the OpenLumara system."
                }
            ]
        },
    },
}

class AgentLogger {
    internalLogs = []
    addToInternalLogs(type, ...args) {
        this.internalLogs.push({ type, args })
    }
    printPendingLogs() {
        this.internalLogs.forEach(log => {
            switch (log.type) {
                case "warn":
                    console.warn(...log.args)
                    break;
                case "debug":
                    console.debug(...log.args)
                    break;
                case "error":
                    console.error(...log.args)
                    break;
                case "log":
                default:
                    console.log(...log.args)
                    break;
            }
        })
        this.internalLogs = []
    }
    log(...args) {
        this.addToInternalLogs("log", ...args)
    }
    warn(...args) {
        this.addToInternalLogs("warn", ...args)
    }
    debug(...args) {
        this.addToInternalLogs("debug", ...args)
    }
    error(...args) {
        this.addToInternalLogs("error", ...args)
    }
}

let getActionSummaryText = (command, promptOverview, wordCountEnabled) => {
    let actionSummary = []
    if (wordCountEnabled && !!command?.args?.messages) {
        let wordCount = command?.args?.messages.flatMap(str => str.split(/\s/g).filter(s => s.length > 0)).length
        actionSummary.push(`Action taken (words = ${wordCount}):`)
    }
    else {
        actionSummary.push(`Action taken:`)
    }

    if (!!promptOverview) {
        actionSummary.push(`Aim: ${promptOverview}`)
    }
    actionSummary.push(`\`\`\`\n${actionToText(command).trim()}\n\`\`\`\n\n`)
    return actionSummary.join("\n\n")
}

let removeTrailingEmptyAiStartTags = () => {
    if (!Array.isArray(gametext_arr) || gametext_arr.length === 0) {
        return false
    }

    let aiStartOnly = `${instructendplaceholder || ""}`
    let aiEmptyWrapped = `${instructendplaceholder || ""}${instructendplaceholder_end || ""}`
    let lastIndex = gametext_arr.length - 1
    let lastEntry = `${gametext_arr[lastIndex] || ""}`

    if (lastEntry.trim().length === 0 || lastEntry.trim() === aiStartOnly.trim() || lastEntry.trim() === aiEmptyWrapped.trim()) {
        gametext_arr.pop()
        return true
    }

    if (aiEmptyWrapped.length > 0 && lastEntry.endsWith(aiEmptyWrapped)) {
        let updatedEntry = lastEntry.slice(0, -aiEmptyWrapped.length).trimEnd()
        if (updatedEntry.length === 0) {
            gametext_arr.pop()
        } else {
            gametext_arr[lastIndex] = updatedEntry
        }
        return true
    }

    if (aiStartOnly.length > 0 && lastEntry.endsWith(aiStartOnly)) {
        let updatedEntry = lastEntry.slice(0, -aiStartOnly.length).trimEnd()
        if (updatedEntry.length === 0) {
            gametext_arr.pop()
        } else {
            gametext_arr[lastIndex] = updatedEntry
        }
        return true
    }

    return false
}

let runAgentCycle = async (agentRunState = {}) => {
    try
    {
        clearSuggestions()
        if (removeTrailingEmptyAiStartTags()) {
            render_gametext(false)
        }
        let textToCheckForMacro = ""
        if (!!agentRunState?.initialPrompt) {
            textToCheckForMacro = agentRunState.initialPrompt
        }
        else {
            let latestReply = getLastActions(1)
            if (latestReply.length > 0 && latestReply[0]?.source === "human")
            {
                textToCheckForMacro = latestReply[0]?.msg || ""
            }
        }
        let macroContent = {}
        if (/^\w+::/.test(textToCheckForMacro)) {
            let macro = textToCheckForMacro.substring(0, textToCheckForMacro.indexOf("::"))
            let macros = JSON.parse(JSON.stringify(localsettings.agentSavedMacros || window.eso.agentMacros))
            if (macros[macro] !== undefined) {
                macroContent = macros[macro]
                macroContent.macroUsed = macro
            }
        }
        agentRunState = objRefAssign(macroContent, agentRunState)
        updateCycleRef(agentRunState.interactionId, agentRunState)

        if (!!agentRunState?.surpressMessagesToUser)
        {
            agentRunState.agentVisualiser = voidAgentVisualiser
        }

        // gametext_arr = []
        // render_gametext()
        agentRunState = objRefOverride({
            macroUsed: undefined,
            excludeSpecificMessagePrefixes: [],
            agentInitialiser: genericAgentInitialiser,
            agentVisualiser: genericAgentVisualiser,
            agentFinaliser: genericAgentFinaliser,
            printToConsole: true,
            wordCountEnabled: false,
            agentName: "",
            initialUser: "",
            systemPrompt: current_memory,
            configOverrides: {},
            isUsingWhitelist: false,
            agentStopOnRequestForInput: !!localsettings?.agentStopOnRequestForInput,
            surpressMessagesToUser: false
        }, agentRunState, {
            logger: new AgentLogger(),
            cotProcessedUntil: 0,
            errors: []
        })
        updateCycleRef(agentRunState.interactionId, agentRunState)

        if (!!agentRunState?.agentPrompt) {
            // Do nothing as it has an override
        }
        else if (!!localsettings.instruct_sysprompt) {
            agentRunState.agentPrompt = localsettings.instruct_sysprompt
        }
        else {
            let sysPrompt = `You are a decision making action AI that evaluates thoughts and takes concise, purposeful actions which lead to a response to the user. Ensure you always send at least one response which is visible to the user.`
            if (!!agentRunState?.systemPrompt) {
                sysPrompt += " Ensure responses are in line with the setting overview. Only override the setting overview when the user explicitly instructs you to do so."
            }
            sysPrompt += " Providing suggestions will force you to stop taking actions. Only include suggestions when you have nothing else to do or require user input."
            agentRunState.agentPrompt = sysPrompt
        }

        let { interactionId, initialPrompt, excludeSpecificMessagePrefixes, agentInitialiser, agentVisualiser, agentFinaliser, printToConsole, logger, configOverrides, isUsingWhitelist, macroUsed } = agentRunState
        let currentChainOfThought = []
        let recentActions = []
        let currentOrderOfActionsOverall = []
        let currentOrderOfActionDescriptionsOverall = []

        let excludeFromHistory = Array.isArray(excludeSpecificMessagePrefixes) ? [...excludeSpecificMessagePrefixes] : []
        if (!!localsettings?.agentSkipPreviousCOTWhenProcessing) {
            excludeFromHistory = excludeFromHistory.concat(listOfExclusions)
        }

        let lastActions = getLastActions(localsettings.agentMaxActionsInHistory, excludeFromHistory)
        lastActions.forEach(action => {
            switch (action.source) {
                case "system":
                    addThought(currentChainOfThought, createSysPrompt, action.msg, false, true);
                    break;
                case "ai":
                    addThought(currentChainOfThought, createAIPrompt, action.msg, false, true);
                    break;
                case "human":
                    addThought(currentChainOfThought, createInstructPrompt, action.msg, false, true);
                    break;
            }
        })

        if (!agentRunState?.initialUser && localsettings.inject_chatnames_instruct) {
            agentRunState.initialUser = localsettings.chatname
        }

        let textDBResults = ""
        if (typeof agentRunState?.agentInputPrompt === "string" && agentRunState.agentInputPrompt.trim().length > 0) {
            addThought(currentChainOfThought, createInstructPrompt, `Agent input: ${agentRunState.agentInputPrompt.trim()}`)
        }
        else if (!!initialPrompt) {
            // When using a macro, the user must see the text with the macro prefix but the AI must not
            let macroFreePrompt = initialPrompt.indexOf(`${macroUsed}::`) === 0 ? initialPrompt.substring(macroUsed.length + 2) : initialPrompt;
            addThought(currentChainOfThought, createInstructPrompt, (!!agentRunState?.initialUser ? `${agentRunState.initialUser}: ${macroFreePrompt}` : macroFreePrompt), false, true)
            addThought(currentChainOfThought, createInstructPrompt, (!!agentRunState?.initialUser ? `${agentRunState.initialUser}: ${initialPrompt}` : initialPrompt), true, false)
            initialPrompt = macroFreePrompt;
        }
        else if (!!lastActions && lastActions.length > 0) {
            let humanActions = lastActions.reverse().filter(elem => elem.source === "human")
            let prevInput = (humanActions.length > 0 ? humanActions[0].msg.replace(new RegExp(`^${localsettings.chatname}:\\s*`), "") : "");
            if (!!prevInput) {
                let macroFreePrompt = prevInput.indexOf(`${macroUsed}::`) === 0 ? prevInput.substring(macroUsed.length + 2) : prevInput;
                initialPrompt = macroFreePrompt
            }
        }

        objRefOverride(agentRunState, { initialPrompt })
        let textDBSearchString = null
        if (!!initialPrompt) {
            textDBSearchString = initialPrompt.trim()
        }
        else if (typeof agentRunState?.agentInputPrompt === "string" && agentRunState.agentInputPrompt.trim().length > 0) {
            textDBSearchString = agentRunState.agentInputPrompt.trim()
        }
        if (!!initialPrompt && documentdb_provider != "0") {
            let contentToSearch = documentdb_data
            if (!!documentdb_searchhistory) {
                contentToSearch += `\n\n[DOCUMENT BREAK][Chatlog history]${concat_gametext(true)}[DOCUMENT BREAK]`
            }
            let ltmSnippets = await DatabaseMinisearch(contentToSearch, textDBSearchString, "");
            let searchDocumentsEnabled = documentdb_searchdocuments && is_using_kcpp_with_searchable_docs() && window.fsClient;
            // Merge document directory search results if enabled
            if (searchDocumentsEnabled)
            {
                try {
                    let docSnippets = await window.fsClient.search_all_documents(textDBSearchString, documentdb_numresults);
                    if (Array.isArray(docSnippets) && docSnippets.length > 0)
                    {
                        // Normalise scores: text DB results use .similarity (embeddings) or .match (minisearch)
                        const getScore = s => (s.similarity ?? s.match ?? 0);
                        let combined = [...ltmSnippets, ...docSnippets];
                        combined.sort((a, b) => getScore(b) - getScore(a));
                        ltmSnippets = combined.slice(0, documentdb_numresults);
                    }
                } catch(docErr) {
                    console.log("Document search failed:", docErr);
                }
            }

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

        let manualOverridesForEnabledCommands = [];
        if (!configOverrides || Object.keys(configOverrides).length === 0) {
            configOverrides = getDocumentFromTextDB("Agent config overrides")
            configOverrides = !!configOverrides ? configOverrides.split("|").map(joined => joined.split("::")).filter(arr => arr.length === 2 || arr.length === 3).reduce((obj, elem) => {
                obj[elem[0]] = {
                    config: elem[1],
                    model: (elem.length > 2 ? elem[2] : "")
                }
                return obj
            }, {}) : {}
        }
        manualOverridesForEnabledCommands = Object.keys(configOverrides)
        let shouldSkipPlanningStep = !agentRunState?.planToUse && !!localsettings?.agentSkipPlanningStep

        let originalConfiguration = await reloadUtils.getCurrentConfigAndModel()
        let previousConfig = JSON.parse(JSON.stringify(originalConfiguration))

        agentRunState = objRefAssign({
            initialPrompt: initialPrompt,
            currentChainOfThought,
            recentActions,
            currentOrderOfActionsOverall,
            currentOrderOfActionDescriptionsOverall,
            lastActions,
            originalConfiguration,
            configOverrides,
            manualOverridesForEnabledCommands
        }, agentRunState)
        updateCycleRef(agentRunState.interactionId, agentRunState)
        if (agentInitialiser !== undefined) {
            await agentInitialiser(agentRunState)
        }
        if (typeof agentRunState?.agentVisualiser === "function") {
            await agentRunState.agentVisualiser(objRefAssign({}, agentRunState, {agentRunState}))
        }
        if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
        {
            agentRunState.logger.printPendingLogs()
        }

        if (!!agentRunState?.planToUse && typeof agentRunState.planToUse === "object") {
            currentOrderOfActionsOverall = agentRunState.planToUse.orderOfActions.map(act => act.action)
            currentOrderOfActionDescriptionsOverall = agentRunState.planToUse.orderOfActions.map(act => act.objective)
            objRefOverride(agentRunState, { currentOrderOfActionsOverall, currentOrderOfActionDescriptionsOverall })
            let argsObject = !!agentRunState.agentName ? objRefAssign({ whoToRespondAs: agentRunState.agentName }, agentRunState.planToUse) : agentRunState.planToUse
            let completePlanObject = {
                name: "plan_actions",
                args: argsObject
            }
            addThought(currentChainOfThought, createAIPrompt, getActionSummaryText(completePlanObject, null, false))
        }

        if (!!localsettings?.agentUseOAITools) {
            // ── OAI Tools mode ──────────────────────────────────────────────────────────
            let oaiPersistedMessages = []
            let isCompleted = false

            let executeOAICommand = async (commandName, commandArgs, toolCallId, promptOverview) => {
                let action = { name: commandName, args: commandArgs }
                let command = [...getReasoningCommand(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist), ...getCommands(agentRunState)].find(c => c.name === commandName)
                addThought(currentChainOfThought, createAIPrompt, getActionSummaryText(action, promptOverview, !!agentRunState?.wordCountEnabled))

                let toolResultText = "Done."
                if (!!command && command?.executor !== undefined) {
                    try {
                        let res = await command.executor(action)
                        if (res === true) isCompleted = true
                        if (typeof res === "string") toolResultText = res
                    } catch (e) {
                        toolResultText = `Error: ${e}`
                        agentRunState.errors.push(e)
                    }
                }
                if (typeof agentRunState?.agentVisualiser === "function") {
                    await agentRunState.agentVisualiser(objRefAssign({ agentRunState }, agentRunState))
                }
                if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
                {
                    agentRunState.logger.printPendingLogs()
                }
                return toolResultText
            }

            let planningPrompt = "The last action from the user is the instruction. If you need to ask the user for a response, use userInput as the final action. Produce a list of actions to respond to this instruction."
            if (!!agentRunState?.agentName) {
                planningPrompt += ` You must respond as ${agentRunState.agentName} when using the send_message or userInput actions.`
            } else if (localsettings.inject_chatnames_instruct) {
                planningPrompt += ` You must respond as ${localsettings.chatopponent.split("||$||").join(" or ")} when using the send_message or userInput actions.`
            }

            if (!agentRunState?.planToUse && !shouldSkipPlanningStep) {
                // Planning step: use plan_actions as the only tool
                let planningTools = commandsToOAITools(getReasoningCommand(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist))
                currentChainOfThought = currentChainOfThought.splice(-localsettings.agentMaxActionsInHistory)
                recentActions = recentActions.splice(-localsettings.agentMaxActionsInHistory)
                objRefOverride(agentRunState, { currentChainOfThought, recentActions })

                let planningContext = buildAgentContextState(
                    agentRunState,
                    textDBResults,
                    currentChainOfThought,
                    getReasoningCommand(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist),
                    planningPrompt
                )
                let planningBuild = buildOAIBaseMessages(agentRunState, planningContext, oaiPersistedMessages, [{ role: "user", content: planningPrompt }])
                await updateAgentContextUsage(planningBuild.oaiContext, textDBResults)
                let planningMessages = planningBuild.messages

                clearAgentStreamingDisplay()
                let streamAccum = ""
                let planResult = await (localsettings?.agentStreamThinking
                    ? callOAIChatCompletionsStream(planningMessages, planningTools, { type: "function", function: { name: "plan_actions" } }, (tok) => {
                        streamAccum += tok
                        updateAgentStreamingDisplay(streamAccum)
                    })
                    : callOAIChatCompletions(planningMessages, planningTools, { type: "function", function: { name: "plan_actions" } })
                ).catch(e => { agentRunState.errors.push(e); return null })
                await contextUsage.triggerRerenderFromServerPerfEndpoint()
                clearAgentStreamingDisplay()

                if (!planResult || !planResult.tool_calls || planResult.tool_calls.length === 0) {
                    addThought(currentChainOfThought, createSysPrompt, "Chain of thought complete", true)
                    isCompleted = true
                } else {
                    let tc = planResult.tool_calls[0]
                    let planArgs = {}
                    try { planArgs = JSON.parse(tc.function.arguments) } catch (e) { }

                    if (!!planArgs?.orderOfActions) {
                        currentOrderOfActionsOverall = planArgs.orderOfActions.map(a => a.action)
                        currentOrderOfActionDescriptionsOverall = planArgs.orderOfActions.map(a => a.objective)
                        if (!agentRunState?.agentName && localsettings.inject_chatnames_instruct && !!planArgs?.whoToRespondAs) {
                            agentRunState.agentName = planArgs.whoToRespondAs
                        }
                        objRefOverride(agentRunState, { currentOrderOfActionsOverall, currentOrderOfActionDescriptionsOverall })
                    }

                    let planSummaryAction = { name: "plan_actions", args: planArgs }
                    addThought(currentChainOfThought, createAIPrompt, getActionSummaryText(planSummaryAction, null, false))
                    if (typeof agentRunState?.agentVisualiser === "function") {
                        await agentRunState.agentVisualiser(objRefAssign({ agentRunState }, agentRunState))
                    }
                    if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
                    {
                        agentRunState.logger.printPendingLogs()
                    }

                    oaiPersistedMessages.push({ role: "assistant", content: planResult.content || null, tool_calls: planResult.tool_calls })
                    oaiPersistedMessages.push({ role: "tool", content: JSON.stringify(planArgs), tool_call_id: tc.id || "plan_call" })
                }
            }

            // Execution steps
            for (let i = 0; i < Number(localsettings.agentCOTMax) && !isCompleted && agentRunState.endCurrent === false; i++) {
                Array(...document.getElementsByClassName("stopThinking")).forEach(elem => elem.classList.remove("hidden"))

                let validCommands = getEnabledCommands(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist).map(c => c.name)
                if (i === 0 && currentOrderOfActionsOverall.length === 0) {
                    validCommands = validCommands.filter(name => name !== "stop_thinking")
                }
                let plannedCommandName = currentOrderOfActionsOverall.length > i ? currentOrderOfActionsOverall[i] : null
                let plannedCommand = plannedCommandName ? getCommands(agentRunState).find(c => c.name === plannedCommandName) : null

                // After exhausting all planned steps, stop - don't fall into free-choice mode
                if (currentOrderOfActionsOverall.length > 0 && !plannedCommandName) {
                    break
                }
                // If a command was planned but can't be found, log and skip
                if (plannedCommandName && !plannedCommand) {
                    addThought(currentChainOfThought, createSysPrompt, `Planned command not found: ${plannedCommandName}`)
                    break
                }

                let execTools, execToolChoice

                if (plannedCommand) {
                    execTools = commandsToOAITools([plannedCommand])
                    execToolChoice = { type: "function", function: { name: plannedCommand.name } }
                } else {
                    let enabledCmds = getEnabledCommands(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist).filter(command => validCommands.includes(command.name))
                    execTools = commandsToOAITools(enabledCmds)
                    execToolChoice = "auto"
                }

                let promptOverview = currentOrderOfActionDescriptionsOverall.length > i ? currentOrderOfActionDescriptionsOverall[i] : null
                currentChainOfThought = currentChainOfThought.splice(-localsettings.agentMaxActionsInHistory)
                recentActions = recentActions.splice(-localsettings.agentMaxActionsInHistory)
                objRefOverride(agentRunState, { currentChainOfThought, recentActions })

                let contextCommands = plannedCommand ? [plannedCommand] : getEnabledCommands(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist)
                let executionContext = buildAgentContextState(
                    agentRunState,
                    textDBResults,
                    currentChainOfThought,
                    contextCommands,
                    promptOverview
                )
                let oaiBuild = buildOAIBaseMessages(agentRunState, executionContext, oaiPersistedMessages, promptOverview ? [{ role: "user", content: `Objective for this action: ${promptOverview}` }] : [])
                await updateAgentContextUsage(oaiBuild.oaiContext, textDBResults)
                let oaiMessages = oaiBuild.messages

                clearAgentStreamingDisplay()
                let streamAccum = ""
                let execResult = await (localsettings?.agentStreamThinking
                    ? callOAIChatCompletionsStream(oaiMessages, execTools, execToolChoice, (tok) => {
                        streamAccum += tok
                        updateAgentStreamingDisplay(streamAccum)
                    })
                    : callOAIChatCompletions(oaiMessages, execTools, execToolChoice)
                ).catch(e => { agentRunState.errors.push(e); return null })
                await contextUsage.triggerRerenderFromServerPerfEndpoint()
                clearAgentStreamingDisplay()

                if (!execResult) break

                if (execResult.content && (!execResult.tool_calls || execResult.tool_calls.length === 0)) {
                    if (execResult.finish_reason === "length") {
                        addThought(currentChainOfThought, createSysPrompt, "Response cut off due to length. Ending chain of thought.", true)
                    }
                    else {
                        // Model responded with content, not a tool call - treat as send_message
                        addThought(currentChainOfThought, createAIPrompt, execResult.content)
                        oaiPersistedMessages.push({ role: "assistant", content: execResult.content })
                    }
                    if (typeof agentRunState?.agentVisualiser === "function") {
                        await agentRunState.agentVisualiser(objRefAssign({ agentRunState }, agentRunState))
                    }
                    if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
                    {
                        agentRunState.logger.printPendingLogs()
                    }
                    isCompleted = true
                    break
                }

                if (!execResult.tool_calls || execResult.tool_calls.length === 0) break

                let tc = execResult.tool_calls[0]
                let cmdArgs = {}
                try { cmdArgs = JSON.parse(tc.function.arguments) } catch (e) { }

                if (tc.function.name === "stop_thinking") {
                    isCompleted = true
                    break
                }

                if (!validCommands.includes(tc.function.name) && tc.function.name !== "plan_actions" && tc.function.name !== "stop_thinking") {
                    addThought(currentChainOfThought, createSysPrompt, `Invalid command requested: ${tc.function.name}`)
                    break
                }

                let toolResult = await executeOAICommand(tc.function.name, cmdArgs, tc.id, promptOverview)

                oaiPersistedMessages.push({ role: "assistant", content: execResult.content || null, tool_calls: execResult.tool_calls })
                oaiPersistedMessages.push({ role: "tool", content: toolResult, tool_call_id: tc.id || "tool_call" })

                if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
                {
                    agentRunState.logger.printPendingLogs()
                }
            }

            if (!isCompleted) {
                addThought(currentChainOfThought, createSysPrompt, "Chain of thought complete", true)
                if (typeof agentRunState?.agentVisualiser === "function") {
                    await agentRunState.agentVisualiser(objRefAssign({ agentRunState }, agentRunState))
                }
                if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
                {
                    agentRunState.logger.printPendingLogs()
                }
            }
        } else {
        let isCompleted = false
        let standardLoopStartIndex = (!!agentRunState?.planToUse || shouldSkipPlanningStep) ? 1 : 0
        for (let i = standardLoopStartIndex; i < Number(localsettings.agentCOTMax) + 1 && (currentOrderOfActionsOverall.length === 0 || i < currentOrderOfActionsOverall.length + 1) && agentRunState.endCurrent === false; i++) {
            Array(...document.getElementsByClassName("stopThinking")).forEach(elem => elem.classList.remove("hidden"))

            let nextAction = []
            let isInitialActionSelection = i === standardLoopStartIndex
            let validCommands = getEnabledCommands(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist).map(command => command.name).filter(name => !isInitialActionSelection || name != "stop_thinking")
            if (i == 0) {
                nextAction = getReasoningCommand(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist)
            }
            else {
                // Ensure valid commands does not include stop thinking right away to ensure an action of some type is taken
                nextAction = JSON.parse(JSON.stringify(currentOrderOfActionsOverall)).splice(i - 1).filter(acts => acts.split("|").find(act => validCommands.includes(act)))
                nextAction = nextAction.length > 0 ? getCommands(agentRunState).filter(act => nextAction[0].split("|").includes(act.name)) : getEnabledCommands(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist).filter(command => validCommands.includes(command.name))

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

            currentChainOfThought = currentChainOfThought.splice(-localsettings.agentMaxActionsInHistory)
            recentActions = recentActions.splice(-localsettings.agentMaxActionsInHistory)
            objRefOverride(agentRunState, { currentChainOfThought, recentActions })

            let promptOverview = currentOrderOfActionDescriptionsOverall.length > 0 ? currentOrderOfActionDescriptionsOverall[i - 1] : null
            if (i === 0) {
                let planningPrompt = "The last action from the user is the instruction. If you need to ask the user for a response, the action userInput must be used and be put as the final action in the order. When handling images always use actions to get information when needed especially for descriptions. Use describe_clicked_image only for images the user clicks in chat, and use describe_fs_image only when a fs file path is available. Produces a list of actions to respond to this instruction."
                if (!!agentRunState?.agentName) {
                    planningPrompt += ` You must respond as ${agentRunState.agentName} when using the send_message or userInput actions. Choose the person based on the user's instruction.`
                }
                else if (localsettings.inject_chatnames_instruct) {
                    planningPrompt += ` You must respond as ${localsettings.chatopponent.split("||$||").join(" or ")} when using the send_message or userInput actions. Choose the person based on the user's instruction.`
                }
                promptOverview = planningPrompt
            }

            let contextState = buildAgentContextState(agentRunState, textDBResults, currentChainOfThought, nextAction, promptOverview)
            let history = contextState.history
            let wiToInclude = contextState.wiToInclude
            let anToInclude = contextState.anToInclude
            let finalAgentPrompt = contextState.finalAgentPrompt
            let agentRequestBody = contextState.agentRequestBody
            await updateAgentContextUsage(contextState, textDBResults)

            if (wi_insertlocation === "0") // WI after memory
            {
                history += wiToInclude
                history += agentRequestBody
            }
            else {
                history += agentRequestBody
                history += wiToInclude
            }
            let isANoteTurnBased = "turn" === anote_strength
            if (!isANoteTurnBased)
            {
                history += anToInclude
            }
            history += finalAgentPrompt
            // Add the start tag for the AI to guide it to respond as the AI
            history += instructendplaceholder
            // Add jailbreak if present
            if (!!localsettings?.inject_jailbreak_instruct) {
                history += localsettings.custom_jailbreak_text
            }
            if (isANoteTurnBased)
            {
                history = insertAuthorsNoteToContext(history, anToInclude)
            }
            let finalAgentHistory = replace_placeholders(history)
            if (window?.contextUsage) {
                contextUsage.setUsage("context", finalAgentHistory.length);
                await contextUsage.renderContextUsage();
            }
            clearAgentStreamingDisplay()
            let streamAccum = ""
            let resp = await (localsettings?.agentStreamThinking && is_using_kcpp_with_sse()
                ? generateAndStreamFromKCPP(finalAgentHistory, jsonGrammar, recentActions.map(JSON.stringify), (tok) => {
                    streamAccum += tok
                    updateAgentStreamingDisplay(streamAccum)
                })
                : generateAndGetTextFromPrompt(finalAgentHistory, jsonGrammar, [], recentActions.map(JSON.stringify))
            )
            await contextUsage.triggerRerenderFromServerPerfEndpoint()
            clearAgentStreamingDisplay()

            try {
                if (resp.trim() == "") {
                    // addThought(currentChainOfThought, createSysPrompt, "Error - Empty response instead of action. Ensure all responses are valid JSON.", lastThoughtWasBlank)
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

                    addThought(currentChainOfThought, createAIPrompt, getActionSummaryText(action?.command, i > 0 ? promptOverview : null, !!agentRunState?.wordCountEnabled))

                    let isCompleted = false;
                    let command = [...getReasoningCommand(agentRunState, manualOverridesForEnabledCommands, isUsingWhitelist), ...getCommands(agentRunState)].find(command => command.name === action.command.name)
                    if (!!command && command?.executor !== undefined) {
                        if (configOverrides[action.command.name]) {
                            let overrides = configOverrides[action.command.name]
                            if (!!overrides?.config) {
                                if (previousConfig.config !== overrides.config || previousConfig.model !== overrides.model) {
                                    await reloadUtils.reloadAndWait(overrides.config, overrides.model)
                                    logger.debug("Completed reload");
                                    previousConfig.config = overrides.config
                                    previousConfig.model = overrides.model
                                }
                            }
                        }

                        let res = await command.executor(action.command)
                        if (action.command?.name === "plan_actions") {
                            currentOrderOfActionsOverall = action.command?.args?.orderOfActions.map(act => act.action)
                            currentOrderOfActionDescriptionsOverall = action.command?.args?.orderOfActions.map(act => act.objective)
                            if (!agentRunState?.agentName && localsettings.inject_chatnames_instruct) {
                                if (!!action?.args?.whoToRespondAs) {
                                    agentRunState.agentName = action?.args?.whoToRespondAs
                                }
                                else {
                                    agentRunState.agentName = getRandomChatOpponent()
                                }
                            }
                            objRefOverride(agentRunState, { currentOrderOfActionsOverall, currentOrderOfActionDescriptionsOverall })
                        }

                        if (typeof agentRunState?.agentVisualiser === "function") {
                            // Render any suggestions generated in the agent logic
                            let visualiserParams = objRefAssign({
                                command,
                                action,
                                agentRunState
                            }, agentRunState)
                            await agentRunState.agentVisualiser(visualiserParams)
                        }
                        if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
                        {
                            agentRunState.logger.printPendingLogs()
                        }
                        if (res === true) {
                            isCompleted = true
                            hasAttemptedToCompleteOnce = true
                        }

                        if (previousConfig.config !== originalConfiguration.config || previousConfig.model !== originalConfiguration.model) {
                            await reloadUtils.reloadAndWait(originalConfiguration.config, originalConfiguration.model)
                            previousConfig.config = originalConfiguration.config
                            previousConfig.model = originalConfiguration.model
                            logger.debug("Completed reload");
                        }
                    }

                    if (isCompleted) {
                        if (!hasAttemptedToCompleteOnce) {
                            addThought(currentChainOfThought, createAIPrompt, checkFinalThoughtsPrompt)
                            hasAttemptedToCompleteOnce = true
                        }
                        else {
                            addThought(currentChainOfThought, createSysPrompt, "Chain of thought complete", true)
                            break
                        }
                    }
                }
                else {
                    if (Object.keys(json).length === 0 || json?.command?.name === "None" || json?.command?.name === "null") {
                        if (!hasAttemptedToCompleteOnce) {
                            addThought(currentChainOfThought, createAIPrompt, checkFinalThoughtsPrompt)
                            hasAttemptedToCompleteOnce = true
                        }
                        else {
                            addThought(currentChainOfThought, createSysPrompt, "Chain of thought complete", true)
                            break
                        }
                    }
                    else {
                        addThought(currentChainOfThought, createSysPrompt, `Invalid command requested: ${JSON.stringify(json)}`)
                        // break
                    }
                }
            }
            catch (e) {
                agentRunState.errors.push(e)
                addThought(currentChainOfThought, createSysPrompt, `Chain of thought had an exception: ${e}`)
                logger.error(`Agent response which errored: ${resp}`, e)

                if (resp === null || resp.indexOf("evaluate_formula") === -1) {
                    break
                }
            }

            if (printToConsole) {
                logger.printPendingLogs()
            }
        }
        } // end standard (non-OAI-tools) loop

        if (previousConfig.config !== originalConfiguration.config || previousConfig.model !== originalConfiguration.model) {
            await reloadUtils.reloadAndWait(originalConfiguration.config, originalConfiguration.model)
            agentRunState.log("Completed reload");
        }
    }
    catch (e) {
        agentRunState.errors.push(e)
        if (agentRunState?.logger !== undefined) {
            agentRunState.logger.error(`Agent loop errored:`, e)
        }
        else {
            console.error(`Agent loop errored:`, e)
        }
    }
    try
    {
        // Handle visualiser one last time to show any final thoughts or suggestions after completion        
        if (typeof agentRunState?.agentVisualiser === "function") {
            await agentRunState.agentVisualiser(objRefAssign({}, agentRunState, {agentRunState}))
        }

        // Handle finaliser
        if (typeof agentRunState?.agentFinaliser === "function") {
            await agentRunState.agentFinaliser(agentRunState)
        }

        await askUserToRetryIncompleteTask(agentRunState)
    }
    catch (e)
    {
        agentRunState.errors.push(e)
        if (agentRunState?.logger !== undefined)
        {
            agentRunState.logger.error(`Agent finaliser errored:`, e)
        }
        else {
            console.error(`Agent finaliser errored:`, e)
        }
        console.error(`Agent run state during error:`, agentRunState)
    }
    if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
    {
        agentRunState.logger.printPendingLogs()
    }
    if (window?.backgroundAgentLoop !== true) {
        Array(...document.getElementsByClassName("stopThinking")).forEach(elem => elem.classList.add("hidden"))
    }
    return agentRunState
}

// window.runAgentCycle = runAgentCycle;

// Test object for overriding the argsObj
/*
{
    initialPrompt: null,
    printToConsole: true,
    planToUse: {
        "responsePlanOverview": "The user wants to say hello to the world and mention the date. There is no other information needed so just send a greeting as me.",
        "orderOfActions": [
            {
                "action": "send_message",
                "objective": "Sending the users a greeting message after they asked for one. I should include the date."
            }
        ]
    },
    agentName: "Bash Terminal",
    systemPrompt: "The year is 1984.",
    agentPrompt: "For each message Bash Terminal sends, it must end the message with an emoji."
}
*/

window.execAgentCycle = (argsObj) => {
    let interactionId = window.crypto.randomUUID()
    let agentCycleArgs = objRefAssign({interactionId, endCurrent: false}, argsObj)
    let cycle = { id: interactionId, status: runAgentCycle(agentCycleArgs), args: agentCycleArgs }
    currentAgentCycle.push(cycle)
    return cycle.status
}

window.updateCycleRef = (interactionId, agentRunState) => {
    let cycle = currentAgentCycle.find(c => c.id === interactionId)
    if (cycle) {
        cycle.agentRunState = agentRunState
    }
}

// Overrides to lite / UI interactions

let originalPrepareSubmitGeneration = prepare_submit_generation, originalRestartNewGame = restart_new_game;

prepare_submit_generation = async () => {
    if (isAgentModeEnabledAndSetCorrectly()) {
        if (pendingAgentUserInputRequest && !pendingAgentUserInputRequest.resolved) {
            await resolvePendingAgentUserInputFromMainInput("continue")
            return
        }

        let { input } = getAgentInputUiTargets()
        let inputText = `${input?.value || ""}`
        if (input) {
            input.value = ""
        }
        // Hack to ensure that images are always saved as new turns		
        localsettings.img_newturn = true
        if (currentAgentCycle.length > 0) {
            await stopAgentThinking()
        }
        execAgentCycle({
            initialPrompt: inputText,
            printToConsole: true
        })
    }
    else {
        originalPrepareSubmitGeneration()
    }
}

restart_new_game = (save = true, keep_memory = false) => {
    loadingNewGame = true
    stopAgentThinking()
    if (pendingAgentUserInputRequest && !pendingAgentUserInputRequest.resolved) {
        completePendingAgentUserInputRequest({ action: "stop" })
    }
    clearSuggestions()
    originalRestartNewGame(save, keep_memory)
}

window.interactByDuration = (elem, durationCallback) => {
  let startTime;
  elem.addEventListener('mousedown', () => {
    startTime = new Date()
  })
  elem.addEventListener('mouseup', () => {
    let endTime = new Date(),
      duration = endTime - startTime
    durationCallback(duration)
  })
}

let toggleAgentCOT = () => {
    populate_regex_replacers()

    display_settings();
    document.getElementById("agentHideCOT").checked = !document.getElementById("agentHideCOT").checked
    confirm_settings();
    updateAgentButtonVisibility();
    render_gametext();
}

let toggleAgent = () => {
    populate_regex_replacers()

    display_settings();
    document.getElementById("agentBehaviour").checked = !document.getElementById("agentBehaviour").checked
    if (!document.getElementById("agentBehaviour").checked) {
        stopAgentThinking()
    }
    else {
        // document.getElementById("separate_end_tags").checked = true
        // toggle_separate_end_tags()
    }
    confirm_settings();
    updateAgentButtonVisibility();
    render_gametext();
}

window.addEventListener("load", () => {
    let durationHandler = (duration) => {
        if (duration >= 500) {
            toggleAgentCOT()
        }
        else {
            toggleAgent()
        }
    }
    interactByDuration(document.querySelector("#btn_toggleAgent"), durationHandler)
    interactByDuration(document.querySelector("#btn_toggleAgentAesthetic"), durationHandler)
})

let stopAgentThinking = async (agentRunState = null) => {
    if (pendingAgentUserInputRequest && !pendingAgentUserInputRequest.resolved) {
        completePendingAgentUserInputRequest({ action: "stop" })
    }
    if (agentRunState !== null) {
        agentRunState.endCurrent = true
    }
    else if (currentAgentCycle.length > 0) {
        currentAgentCycle.forEach(c => {
            c.agentRunState.endCurrent = true
        })
    }
    trigger_abort_controller()
    if (agentRunState !== null) {
        await Promise.all(currentAgentCycle.filter(c => c.id === agentRunState.interactionId).map(c => c.status))
        currentAgentCycle = currentAgentCycle.filter(c => c.id !== agentRunState.interactionId)
    }
    else if (currentAgentCycle.length > 0) {
        await Promise.all(currentAgentCycle.map(c => c.status))
        currentAgentCycle = []
        if (window?.intervalIdForBackgroundAgent !== undefined)
        {
            clearInterval(window.intervalIdForBackgroundAgent)
        }
        Array(...document.getElementsByClassName("stopThinking")).forEach(elem => elem.classList.add("hidden"))
        await contextUsage.triggerRerenderFromServerPerfEndpoint()
        clearAgentStreamingDisplay()
    }
    submit_multiplayer(true)
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
        elem.onclick = () => stopAgentThinking();

        let streamElem = document.createElement("div");
        streamElem.classList.add("agentStreamingDisplay", "hidden");
        streamElem.dataset.inputId = id;
        document.getElementById(id).parentElement.appendChild(streamElem);
    })
}

let updateAgentStreamingDisplay = (text) => {
    document.querySelectorAll(".agentStreamingDisplay").forEach(elem => {
        elem.textContent = text || ""
        if (text) {
            elem.classList.remove("hidden")
            elem.scrollTop = elem.scrollHeight
        }
        else elem.classList.add("hidden")
    })
}

let clearAgentStreamingDisplay = () => {
    updateAgentStreamingDisplay("")
}

let removeChoiceContainer = () => {
    if (document.getElementById("choiceContainer")) {
        document.getElementById("choiceContainer").remove()
    }
}

let getAgentInputUiTargets = () => {
    switch (parseInt(localsettings.gui_type_instruct)) {
        case 1:
        case 2:
            return {
                container: document.getElementById("chat_msg_body"),
                input: document.getElementById("cht_inp"),
                sendButton: document.getElementById("chat_msg_send_btn")
            }
        case 3:
            return {
                container: document.getElementById("corpo_body"),
                input: document.getElementById("corpo_cht_inp"),
                sendButton: document.getElementById("corpo_chat_send_btn")
            }
        default:
            return {
                container: document.getElementById("gametext"),
                input: document.getElementById("input_text"),
                sendButton: document.getElementById("btnsend")
            }
    }
}

let currentSuggestions = []
let setSuggestions = (suggestions) => {
    currentSuggestions = suggestions
}

let clearSuggestions = () => {
    currentSuggestions = []
    if (pendingAgentUserInputRequest && !pendingAgentUserInputRequest.resolved) {
        renderSuggestions()
        return
    }
    removeChoiceContainer()
}

let removeAgentUserInputPopup = () => {
    if (document.getElementById("agentUserInputOverlay")) {
        document.getElementById("agentUserInputOverlay").remove()
    }
}

let sanitizeAgentUploadFilename = (name = "") => {
    let safeName = `${name || "upload.bin"}`.trim().toLowerCase()
    if (safeName === "") {
        safeName = "upload.bin"
    }
    safeName = safeName.replace(/\s+/g, "_")
    safeName = safeName.replace(/[^a-z0-9._-]/g, "-")
    safeName = safeName.replace(/-+/g, "-")
    safeName = safeName.replace(/^[-_.]+/, "")
    safeName = safeName.replace(/[-_.]+$/, "")
    return safeName || "upload.bin"
}

let buildAgentUploadFsPath = (fileName = "upload.bin") => {
    let now = new Date()
    let stamp = `${now.getUTCFullYear()}${`${now.getUTCMonth() + 1}`.padStart(2, "0")}${`${now.getUTCDate()}`.padStart(2, "0")}_${`${now.getUTCHours()}`.padStart(2, "0")}${`${now.getUTCMinutes()}`.padStart(2, "0")}${`${now.getUTCSeconds()}`.padStart(2, "0")}`
    let randomSuffix = `${Math.floor(Math.random() * 1000000)}`.padStart(6, "0")
    return `/agent_uploads/${stamp}_${randomSuffix}_${sanitizeAgentUploadFilename(fileName)}`
}

let pendingAgentUserInputRequest = null
let pendingAgentUserInputRequestId = 0
let pendingAgentFsPickerRequest = null

let removeAgentFsPickerOverlay = () => {
    if (document.getElementById("agentFsPickerOverlay")) {
        document.getElementById("agentFsPickerOverlay").remove()
    }
}

let closeAgentFsPickerRequest = (selectedFiles = null) => {
    if (!pendingAgentFsPickerRequest) {
        return
    }
    if (typeof pendingAgentFsPickerRequest.cleanup === "function") {
        pendingAgentFsPickerRequest.cleanup()
    }
    let resolve = pendingAgentFsPickerRequest.resolve
    pendingAgentFsPickerRequest = null
    resolve(Array.isArray(selectedFiles) ? selectedFiles : null)
}

let openAgentFsPickerPopup = () => {
    if (pendingAgentFsPickerRequest) {
        return Promise.resolve(null)
    }

    return new Promise((resolve) => {
        removeAgentFsPickerOverlay()

        let overlay = document.createElement("div")
        overlay.id = "agentFsPickerOverlay"
        overlay.classList.add("agent-user-input-overlay", "agent-fs-picker-overlay")

        let popup = document.createElement("div")
        popup.classList.add("agent-user-input-popup", "agent-fs-picker-popup")

        let header = document.createElement("div")
        header.classList.add("agent-user-input-header")
        header.innerText = "Select files from filesystem"

        let closeButton = document.createElement("button")
        closeButton.type = "button"
        closeButton.classList.add("btn-primary", "agent-fs-picker-close")
        closeButton.innerText = "Close"
        closeButton.onclick = () => {
            closeAgentFsPickerRequest(null)
        }
        header.appendChild(closeButton)

        let body = document.createElement("div")
        body.classList.add("agent-user-input-body", "agent-fs-picker-body")

        let iframe = document.createElement("iframe")
        iframe.classList.add("agent-fs-picker-frame")
        iframe.src = "/fs/?picker=1&view=tile"
        iframe.title = "Filesystem picker"

        body.appendChild(iframe)
        popup.appendChild(header)
        popup.appendChild(body)
        overlay.appendChild(popup)
        document.body.appendChild(overlay)

        let onMessage = (event) => {
            if (event.origin !== window.location.origin) {
                return
            }
            let type = `${event?.data?.type || ""}`
            if (type === "kcpp-fs-picker-cancel") {
                closeAgentFsPickerRequest(null)
            }
            if (type === "kcpp-fs-picker-use-as-text") {
                // Handle "Use selected" - add file paths to game text array
                let selected = Array.isArray(event?.data?.files)
                    ? event.data.files.map(entry => {
                        if (typeof entry === "string") {
                            let path = entry.trim()
                            return path.length > 0 ? { path, isDirectory: false, source: "fs" } : null
                        }
                        let path = `${entry?.path || ""}`.trim()
                        if (path.length === 0) {
                            return null
                        }
                        return {
                            path,
                            isDirectory: !!entry?.isDirectory,
                            source: "fs"
                        }
                    }).filter(entry => entry !== null)
                    : []
                
                // Add selected files to game text array
                if (selected.length > 0 && typeof gametext_arr !== 'undefined' && typeof render_gametext === 'function') {
                    // Format file paths similar to agent_planning_input.js
                    let fileLines = selected.map(file => `- ${file.path}${file?.source === "fs" ? " (selected from FS)" : " (uploaded from local device)"}`)
                    let formattedText = `User has selected the following files available in filesystem:\n${fileLines.join("\n")}`
                    
                    // Use createInstructPrompt if available to format it properly
                    let wrappedPrompt = typeof createInstructPrompt === 'function' 
                        ? createInstructPrompt(formattedText)
                        : formattedText
                    
                    // Add to game text array and render
                    gametext_arr.push(wrappedPrompt.replace(/\\\\/g, ""))
                    render_gametext()
                }
                
                // Close the picker
                closeAgentFsPickerRequest(null)
            }
            if (type === "kcpp-fs-picker-select") {
                let selected = Array.isArray(event?.data?.files)
                    ? event.data.files.map(entry => {
                        if (typeof entry === "string") {
                            let path = entry.trim()
                            return path.length > 0 ? { path, isDirectory: false } : null
                        }
                        let path = `${entry?.path || ""}`.trim()
                        if (path.length === 0) {
                            return null
                        }
                        return {
                            path,
                            isDirectory: !!entry?.isDirectory
                        }
                    }).filter(entry => entry !== null)
                    : []
                closeAgentFsPickerRequest(selected)
            }
        }

        window.addEventListener("message", onMessage)
        pendingAgentFsPickerRequest = {
            resolve,
            cleanup: () => {
                window.removeEventListener("message", onMessage)
                removeAgentFsPickerOverlay()
            }
        }
    })
}

let completePendingAgentUserInputRequest = (result) => {
    let request = pendingAgentUserInputRequest
    if (!request || request.resolved) {
        return
    }
    request.resolved = true
    if (Array.isArray(request.cleanupHandlers) && request.cleanupHandlers.length > 0) {
        request.cleanupHandlers.forEach(handler => {
            try {
                handler()
            }
            catch {}
        })
    }
    pendingAgentUserInputRequest = null
    closeAgentFsPickerRequest(null)
    removeAgentUserInputPopup()
    renderSuggestions()
    request.resolve(result)
}

let getPendingSelectedFileKey = (entry) => {
    if (entry.source === "fs") {
        return `fs:${entry.path}`
    }
    return `local:${entry.fileName}:${entry.fileSize}:${entry.fileLastModified}`
}

let addFilesToPendingAgentRequest = (entries = []) => {
    if (!pendingAgentUserInputRequest) {
        return 0
    }
    let existingKeys = pendingAgentUserInputRequest.selectedFiles.map(getPendingSelectedFileKey)
    let addedCount = 0
    entries.forEach(entry => {
        let key = getPendingSelectedFileKey(entry)
        if (!existingKeys.includes(key)) {
            pendingAgentUserInputRequest.selectedFiles.push(entry)
            existingKeys.push(key)
            addedCount++
        }
    })
    renderSuggestions()
    return addedCount
}

let getPendingAgentSelectionSummary = (selectedFiles = []) => {
    let localFiles = 0
    let fsFiles = 0
    let fsDirectories = 0

    selectedFiles.forEach(entry => {
        if (entry?.source === "fs") {
            if (!!entry?.isDirectory) {
                fsDirectories++
            }
            else {
                fsFiles++
            }
            return
        }
        localFiles++
    })

    let parts = []
    if (localFiles > 0) {
        parts.push(`${localFiles} local file${localFiles === 1 ? "" : "s"}`)
    }
    if (fsFiles > 0) {
        parts.push(`${fsFiles} FS file${fsFiles === 1 ? "" : "s"}`)
    }
    if (fsDirectories > 0) {
        parts.push(`${fsDirectories} FS director${fsDirectories === 1 ? "y" : "ies"}`)
    }

    return {
        total: localFiles + fsFiles + fsDirectories,
        text: parts.join(", ")
    }
}

let preparePendingAgentUserInputFiles = async (request) => {
    let preparedFiles = []
    let canUseFsUpload = !!request.enableFileUpload && !!request.isFsEnabled && typeof window?.fsClient?.write === "function"

    for (let i = 0; i < request.selectedFiles.length; i++) {
        let currentFile = request.selectedFiles[i]
        if (currentFile.source === "fs") {
            preparedFiles.push({
                source: "fs",
                fileName: currentFile.fileName,
                path: currentFile.path,
            })
            continue
        }

        if (!canUseFsUpload) {
            throw new Error("Local file upload is unavailable because filesystem upload is not supported by the current endpoint.")
        }

        request.fileStatus = `Uploading file ${i + 1}/${request.selectedFiles.length}: ${currentFile.fileName}`
        renderSuggestions()
        let uploadPath = buildAgentUploadFsPath(currentFile.fileName)
        let bytes = new Uint8Array(await currentFile.localFile.arrayBuffer())
        await window.fsClient.write([{ path: uploadPath, content: bytes, isB64: true }])
        preparedFiles.push({
            source: "local",
            fileName: currentFile.fileName,
            path: uploadPath,
        })
    }

    if (preparedFiles.length > 0) {
        request.fileStatus = `Prepared file path${preparedFiles.length === 1 ? "" : "s"}:\n${preparedFiles.map(file => file.path).join("\n")}`
        renderSuggestions()
    }

    return preparedFiles
}

let resolvePendingAgentUserInputFromMainInput = async (action = "continue") => {
    let request = pendingAgentUserInputRequest
    if (!request || request.resolved || request.isResolving) {
        return
    }

    if (action === "stop") {
        completePendingAgentUserInputRequest({ action: "stop" })
        return
    }

    request.isResolving = true
    renderSuggestions()

    try {
        let { input } = getAgentInputUiTargets()
        let inputText = `${input?.value || ""}`
        let preparedFiles = request.enableFileUpload ? await preparePendingAgentUserInputFiles(request) : []
        if (input) {
            input.value = ""
        }
        completePendingAgentUserInputRequest({
            action: "continue",
            input: inputText,
            files: preparedFiles,
            filePaths: preparedFiles.map(file => file.path),
            filePath: preparedFiles[0]?.path || "",
            fileName: preparedFiles[0]?.fileName || "",
        })
    }
    catch (e) {
        request.fileStatus = `File upload failed: ${e?.message || e}`
        request.isResolving = false
        renderSuggestions()
    }
}

let createAgentUserInputInline = ({ prompt, suggestions = [], enableFileUpload = true }) => {
    let { input, sendButton } = getAgentInputUiTargets()
    if (!input) {
        return createAgentUserInputPopup({ prompt, suggestions, enableFileUpload })
    }

    if (pendingAgentUserInputRequest && !pendingAgentUserInputRequest.resolved) {
        completePendingAgentUserInputRequest({ action: "stop" })
    }

    return new Promise((resolve) => {
        pendingAgentUserInputRequestId++
        let isFsEnabled = is_using_kcpp_with_fs()
        pendingAgentUserInputRequest = {
            id: pendingAgentUserInputRequestId,
            prompt: `${prompt || "Please provide input"}`,
            suggestions: Array.isArray(suggestions) ? suggestions.map(String).map(text => text.trim()).filter(text => text.length > 0) : [],
            enableFileUpload: !!enableFileUpload,
            isFsEnabled,
            selectedFiles: [],
            fileStatus: "",
            isResolving: false,
            resolved: false,
            cleanupHandlers: [],
            resolve,
        }

        let requestId = pendingAgentUserInputRequest.id
        let submitFromPendingRequest = async (e) => {
            if (!pendingAgentUserInputRequest || pendingAgentUserInputRequest.id !== requestId || pendingAgentUserInputRequest.resolved) {
                return
            }
            if (e) {
                e.preventDefault()
                if (typeof e.stopImmediatePropagation === "function") {
                    e.stopImmediatePropagation()
                }
                e.stopPropagation()
            }
            await resolvePendingAgentUserInputFromMainInput("continue")
        }

        let onInputKeyDown = async (e) => {
            if (e.key !== "Enter") {
                return
            }
            await submitFromPendingRequest(e)
        }

        input.addEventListener("keydown", onInputKeyDown, true)
        pendingAgentUserInputRequest.cleanupHandlers.push(() => {
            input.removeEventListener("keydown", onInputKeyDown, true)
        })

        if (sendButton) {
            sendButton.addEventListener("click", submitFromPendingRequest, true)
            pendingAgentUserInputRequest.cleanupHandlers.push(() => {
                sendButton.removeEventListener("click", submitFromPendingRequest, true)
            })
        }

        renderSuggestions()
        input.focus()
    })
}

let createAgentUserInputPopup = ({ prompt, suggestions = [], enableFileUpload = true }) => {
    removeAgentUserInputPopup()
    return new Promise((resolve) => {
        let overlay = document.createElement("div")
        overlay.id = "agentUserInputOverlay"
        overlay.classList.add("agent-user-input-overlay")

        let card = document.createElement("div")
        card.classList.add("agent-user-input-popup")

        let title = document.createElement("div")
        title.classList.add("agent-user-input-header")
        title.innerText = "Agent input required"

        let body = document.createElement("div")
        body.classList.add("agent-user-input-body")

        let promptText = document.createElement("div")
        promptText.innerText = prompt || "Please provide input"

        let suggestionsContainer = document.createElement("div")
        suggestionsContainer.classList.add("agent-user-input-suggestions")

        let fileSection = document.createElement("details")
        fileSection.classList.add("agent-user-input-file-section")

        let fileSectionSummary = document.createElement("summary")
        fileSectionSummary.classList.add("agent-user-input-file-section-summary")
        fileSectionSummary.innerText = "Files (optional)"

        let fileSectionBody = document.createElement("div")
        fileSectionBody.classList.add("agent-user-input-file-section-body")

        let input = document.createElement("input")
        input.type = "text"
        input.placeholder = "Type your response..."
        input.classList.add("agent-user-input-text")

        let capabilityText = document.createElement("div")
        capabilityText.classList.add("agent-user-input-status")

        let localFileRow = document.createElement("div")
        localFileRow.classList.add("agent-user-input-controls")

        let fileInput = document.createElement("input")
        fileInput.type = "file"
        fileInput.classList.add("agent-user-input-file")
        fileInput.multiple = true
        fileInput.style.display = "none"
        fileInput.setAttribute("aria-hidden", "true")

        let addLocalFilesButton = document.createElement("button")
        addLocalFilesButton.type = "button"
        addLocalFilesButton.classList.add("btn-primary")
        addLocalFilesButton.innerText = "Add local files"

        let fsSelect = document.createElement("select")
        fsSelect.classList.add("agent-user-input-fs-select")
        fsSelect.multiple = true
        fsSelect.size = 6

        let addFsFilesButton = document.createElement("button")
        addFsFilesButton.type = "button"
        addFsFilesButton.classList.add("btn-primary")
        addFsFilesButton.innerText = "Add FS files"

        let refreshFsFilesButton = document.createElement("button")
        refreshFsFilesButton.type = "button"
        refreshFsFilesButton.classList.add("btn-primary")
        refreshFsFilesButton.innerText = "Refresh FS list"

        let selectedFilesContainer = document.createElement("div")
        selectedFilesContainer.classList.add("agent-user-input-selected-files")

        let selectedFilesStatus = document.createElement("div")
        selectedFilesStatus.classList.add("agent-user-input-status")

        let fileStatus = document.createElement("div")
        fileStatus.classList.add("agent-user-input-status")

        let controls = document.createElement("div")
        controls.classList.add("agent-user-input-controls")

        let confirmAndContinue = document.createElement("button")
        confirmAndContinue.classList.add("btn-primary")
        confirmAndContinue.innerText = "Confirm and continue loop"

        let stopLoop = document.createElement("button")
        stopLoop.classList.add("btn-primary")
        stopLoop.innerText = "Stop loop"

        let isFsEnabled = is_using_kcpp_with_fs()
        let hasFsWrite = typeof window?.fsClient?.write === "function"
        let hasFsList = typeof window?.fsClient?.listEntries === "function"
        let canUseFsUpload = !!enableFileUpload && hasFsWrite && isFsEnabled
        let canSelectFsFiles = !!enableFileUpload && hasFsList && isFsEnabled
        let selectedFiles = []

        if (enableFileUpload) {
            let unavailableCapabilities = []
            if (!canUseFsUpload) {
                unavailableCapabilities.push("local file upload")
            }
            if (!canSelectFsFiles) {
                unavailableCapabilities.push("FS file selection")
            }
            if (unavailableCapabilities.length > 0) {
                capabilityText.innerText = `${unavailableCapabilities.join(" and ")} ${unavailableCapabilities.length === 1 ? "is" : "are"} unavailable because filesystem access is not supported by the current endpoint.`
            }
        }

        let completeOnce = (result) => {
            removeAgentUserInputPopup()
            resolve(result)
        }

        let getSelectedFileKey = (entry) => {
            if (entry.source === "fs") {
                return `fs:${entry.path}`
            }
            return `local:${entry.fileName}:${entry.fileSize}:${entry.fileLastModified}`
        }

        let updateFileSectionSummary = () => {
            if (!enableFileUpload) {
                return
            }

            let summaryText = "Files (optional)"
            if (selectedFiles.length > 0) {
                summaryText = `Files (${selectedFiles.length} selected)`
            }
            fileSectionSummary.innerText = summaryText
        }

        let renderSelectedFiles = () => {
            selectedFilesContainer.innerHTML = ""
            if (selectedFiles.length === 0) {
                selectedFilesStatus.innerText = "No files selected."
                updateFileSectionSummary()
                return
            }

            selectedFilesStatus.innerText = `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected.`
            selectedFiles.forEach((entry, index) => {
                let item = document.createElement("div")
                item.classList.add("agent-user-input-selected-file")

                let label = document.createElement("div")
                label.classList.add("agent-user-input-selected-file-label")
                if (entry.source === "fs") {
                    label.innerText = `FS: ${entry.path}`
                }
                else {
                    label.innerText = `Local: ${entry.fileName}`
                }

                let removeButton = document.createElement("button")
                removeButton.type = "button"
                removeButton.classList.add("agent-user-input-remove-file")
                removeButton.innerText = "x"
                removeButton.onclick = () => {
                    selectedFiles.splice(index, 1)
                    renderSelectedFiles()
                }

                item.appendChild(label)
                item.appendChild(removeButton)
                selectedFilesContainer.appendChild(item)
            })
            updateFileSectionSummary()
        }

        let addSelectedFiles = (entries = []) => {
            let existingKeys = selectedFiles.map(getSelectedFileKey)
            let addedCount = 0
            entries.forEach(entry => {
                let key = getSelectedFileKey(entry)
                if (!existingKeys.includes(key)) {
                    selectedFiles.push(entry)
                    existingKeys.push(key)
                    addedCount++
                }
            })
            renderSelectedFiles()
            return addedCount
        }

        let normalizeFsSelectablePath = (rawPath = "") => {
            let path = `${rawPath || ""}`.trim()
            let isDirectory = false
            if (!path) {
                return null
            }
            if (path === ".kcpp_dir_marker") {
                path = "/"
                isDirectory = true
            }

            if (path.endsWith("/.kcpp_dir_marker")) {
                path = path.substring(0, path.length - "/.kcpp_dir_marker".length)
                isDirectory = true
            }

            if (path.length > 1 && path.endsWith("/")) {
                path = path.substring(0, path.length - 1)
            }
            if (!path) {
                path = "/"
            }
            return {
                path,
                isDirectory,
                displayPath: `${path}${isDirectory ? " (directory)" : ""}`
            }
        }

        let loadFsFiles = async () => {
            if (!canSelectFsFiles) {
                return
            }

            fsSelect.innerHTML = ""
            fileStatus.innerText = "Loading FS files..."
            try {
                let normalizedEntries = []
                let listing = await window.fsClient.listEntries("*")
                if (Array.isArray(listing?.directories)) {
                    normalizedEntries.push(...listing.directories.map(path => ({
                        path: `${path || ""}`.trim() || "/",
                        isDirectory: true,
                        displayPath: `${(`${path || ""}`.trim() || "/")} (directory)`
                    })))
                }
                if (Array.isArray(listing?.files)) {
                    normalizedEntries.push(...listing.files.map(path => ({
                        path: `${path || ""}`.trim(),
                        isDirectory: false,
                        displayPath: `${`${path || ""}`.trim()}`
                    })).filter(entry => !!entry.path))
                }
                if (normalizedEntries.length === 0) {
                    let fsPaths = await window.fsClient.list("*")
                    normalizedEntries = Array.isArray(fsPaths)
                        ? fsPaths.map(String).map(normalizeFsSelectablePath).filter(entry => entry !== null)
                        : []
                }
                let uniqueEntries = []
                let seenDisplayPaths = []
                normalizedEntries.forEach(entry => {
                    if (!seenDisplayPaths.includes(entry.displayPath)) {
                        seenDisplayPaths.push(entry.displayPath)
                        uniqueEntries.push(entry)
                    }
                })
                uniqueEntries.sort((a, b) => a.displayPath.localeCompare(b.displayPath))

                if (uniqueEntries.length === 0) {
                    fileStatus.innerText = "No files are currently available in FS."
                    return
                }

                uniqueEntries.forEach(entry => {
                    let option = document.createElement("option")
                    option.value = entry.path
                    option.dataset.isDirectory = entry.isDirectory ? "true" : "false"
                    option.innerText = entry.displayPath
                    fsSelect.appendChild(option)
                })
                fileStatus.innerText = `Loaded ${uniqueEntries.length} FS path${uniqueEntries.length === 1 ? "" : "s"}.`
            }
            catch (e) {
                fileStatus.innerText = `Failed to load FS files: ${e?.message || e}`
            }
        }

        renderSelectedFiles()

        suggestions.forEach(suggestion => {
            let button = document.createElement("button")
            button.classList.add("btn-primary")
            button.innerText = suggestion
            button.onclick = () => {
                input.value = suggestion
                input.focus()
            }
            suggestionsContainer.appendChild(button)
        })

        addLocalFilesButton.onclick = () => {
            fileInput.click()
        }

        fileInput.onchange = () => {
            let filesToAdd = Array.from(fileInput.files || []).map(file => ({
                source: "local",
                fileName: file.name,
                fileSize: file.size,
                fileLastModified: file.lastModified,
                localFile: file,
            }))
            let addedCount = addSelectedFiles(filesToAdd)
            fileStatus.innerText = addedCount > 0 ? `Added ${addedCount} local file${addedCount === 1 ? "" : "s"}.` : "Selected local files were already in the list."
            fileInput.value = ""
        }

        addFsFilesButton.onclick = () => {
            let selectedFsPaths = Array.from(fsSelect.selectedOptions || []).map(option => {
                let normalized = normalizeFsSelectablePath(option.value || "")
                if (normalized === null) {
                    return null
                }
                let isDirectory = option.dataset.isDirectory === "true"
                normalized.isDirectory = isDirectory
                normalized.displayPath = `${normalized.path}${isDirectory ? " (directory)" : ""}`
                return normalized
            }).filter(entry => entry !== null)
            let addedCount = addSelectedFiles(selectedFsPaths.map(entry => ({
                source: "fs",
                isDirectory: entry.isDirectory,
                path: entry.displayPath,
                fileName: entry.path.split("/").filter(part => part.length > 0).slice(-1)[0] || entry.path,
            })))
            fileStatus.innerText = addedCount > 0 ? `Added ${addedCount} FS file${addedCount === 1 ? "" : "s"}.` : "Selected FS files were already in the list."
        }

        refreshFsFilesButton.onclick = loadFsFiles

        confirmAndContinue.onclick = async () => {
            confirmAndContinue.disabled = true
            try {
                let preparedFiles = []
                for (let i = 0; i < selectedFiles.length; i++) {
                    let currentFile = selectedFiles[i]
                    if (currentFile.source === "fs") {
                        preparedFiles.push({
                            source: "fs",
                            fileName: currentFile.fileName,
                            path: currentFile.path,
                        })
                        continue
                    }

                    if (!canUseFsUpload) {
                        throw new Error("Local file upload is unavailable because filesystem upload is not supported by the current endpoint.")
                    }

                    fileStatus.innerText = `Uploading file ${i + 1}/${selectedFiles.length}: ${currentFile.fileName}`
                    let uploadPath = buildAgentUploadFsPath(currentFile.fileName)
                    let bytes = new Uint8Array(await currentFile.localFile.arrayBuffer())
                    await window.fsClient.write([{ path: uploadPath, content: bytes, isB64: true }])
                    preparedFiles.push({
                        source: "local",
                        fileName: currentFile.fileName,
                        path: uploadPath,
                    })
                }

                if (preparedFiles.length > 0) {
                    fileStatus.innerText = `Prepared file path${preparedFiles.length === 1 ? "" : "s"}:\n${preparedFiles.map(file => file.path).join("\n")}`
                }

                completeOnce({
                    action: "continue",
                    input: input.value || "",
                    files: preparedFiles,
                    filePaths: preparedFiles.map(file => file.path),
                    filePath: preparedFiles[0]?.path || "",
                    fileName: preparedFiles[0]?.fileName || "",
                })
            }
            catch (e) {
                fileStatus.innerText = `File upload failed: ${e?.message || e}`
                confirmAndContinue.disabled = false
            }
        }

        stopLoop.onclick = () => {
            completeOnce({ action: "stop" })
        }

        input.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault()
                confirmAndContinue.click()
            }
        }

        body.appendChild(promptText)
        if (suggestions.length > 0) {
            body.appendChild(suggestionsContainer)
        }
        body.appendChild(input)
        if (enableFileUpload) {
            if (capabilityText.innerText.trim().length > 0) {
                fileSectionBody.appendChild(capabilityText)
            }
            if (canUseFsUpload) {
                localFileRow.appendChild(addLocalFilesButton)
                localFileRow.appendChild(fileInput)
            }
            if (canSelectFsFiles) {
                localFileRow.appendChild(addFsFilesButton)
                localFileRow.appendChild(refreshFsFilesButton)
            }
            if (localFileRow.childElementCount > 0) {
                fileSectionBody.appendChild(localFileRow)
            }
            if (canSelectFsFiles) {
                fileSectionBody.appendChild(fsSelect)
            }
            fileSectionBody.appendChild(selectedFilesContainer)
            fileSectionBody.appendChild(selectedFilesStatus)
            if (canUseFsUpload || canSelectFsFiles) {
                fileSectionBody.appendChild(fileStatus)
            }
            fileSection.appendChild(fileSectionSummary)
            fileSection.appendChild(fileSectionBody)
            body.appendChild(fileSection)
        }
        controls.appendChild(confirmAndContinue)
        controls.appendChild(stopLoop)
        body.appendChild(controls)
        card.appendChild(title)
        card.appendChild(body)
        overlay.appendChild(card)
        document.body.appendChild(overlay)
        if (canSelectFsFiles) {
            loadFsFiles()
        }
        input.focus()
    })
}

window.requestAgentUserInput = createAgentUserInputInline

let getTaskCompletionCheckGrammar = async () => {
    let completionSchema = {
        type: "object",
        properties: {
            isTaskComplete: {
                type: "boolean"
            },
            objectiveForContinuing: {
                type: "string",
                description: "If the task is not complete, provide a concise objective that the agent should aim to complete in the next cycle. This field can be left empty if the task is complete."
            }
        },
        required: ["isTaskComplete"]
    }

    let opt = {
        method: "POST",
        headers: get_kobold_header(),
        body: JSON.stringify({ schema: completionSchema }),
    }

    return fetch(`${custom_kobold_endpoint}/api/extra/json_to_grammar`, opt)
        .then((response) => response.json())
        .then(resp => {
            if (!!resp && !!resp?.success) {
                return resp.result
            }
            return ""
        })
        .catch(() => "")
}

let checkIfTaskComplete = async (agentRunState) => {
    if (!!localsettings?.agentUseOAITools) {
        return checkIfTaskCompleteOAI(agentRunState)
    }
    try {
        let excludeFromHistory = !!localsettings?.agentSkipPreviousCOTWhenProcessing ? listOfExclusions : []
        let latestActions = getLastActions(localsettings.agentMaxActionsInHistory, excludeFromHistory)
        let latestActionsText = latestActions.map(action => `${action.source}: ${action.msg}`).join("\n")
        let objective = agentRunState?.agentInputPrompt || agentRunState?.initialPrompt || ""

        let completionPrompt = createSysPrompt("You are validating whether the current task objective has been completed. Return only a JSON object with the boolean field isTaskComplete. If the task is not complete, also provide a concise objective in the string field objectiveForContinuing that the agent should aim to complete in the next cycle. This field can be left empty if the task is complete.")
            + createInstructPrompt(`Task objective:\n${objective}\n\nRecent actions and outputs:\n${latestActionsText}\n\nDecide if the task is complete.`)

        let grammar = await getTaskCompletionCheckGrammar()
        let response = await generateAndGetTextFromPrompt(completionPrompt, grammar)
        if (!!response) {
            let parsed = JSON.parse(response)
            if (typeof parsed?.isTaskComplete === "boolean") {
                return parsed;
            }
        }
    }
    catch {
        // suppress completion checker errors
    }
    return null
}

let checkIfTaskCompleteOAI = async (agentRunState) => {
    try {
        let excludeFromHistory = !!localsettings?.agentSkipPreviousCOTWhenProcessing ? listOfExclusions : []
        let latestActions = getLastActions(localsettings.agentMaxActionsInHistory, excludeFromHistory)
        let latestActionsText = latestActions.map(action => `${action.source}: ${action.msg}`).join("\n")
        let objective = agentRunState?.agentInputPrompt || agentRunState?.initialPrompt || ""

        let completionTool = [{
            type: "function",
            function: {
                name: "report_task_completion",
                description: "Report whether the current task objective has been completed.",
                parameters: {
                    type: "object",
                    properties: {
                        isTaskComplete: {
                            type: "boolean",
                            description: "True if the task objective has been fully completed, false otherwise."
                        },
                        objectiveForContinuing: {
                            type: "string",
                            description: "If the task is not complete, provide a concise objective the agent should aim to complete in the next cycle. Leave empty if the task is complete."
                        }
                    },
                    required: ["isTaskComplete"]
                }
            }
        }]

        let messages = [
            { role: "system", content: "You are validating whether the current task objective has been completed." },
            { role: "user", content: `Task objective:\n${objective}\n\nRecent actions and outputs:\n${latestActionsText}\n\nDecide if the task is complete.` }
        ]

        let result = await callOAIChatCompletions(messages, completionTool, { type: "function", function: { name: "report_task_completion" } })
        if (result?.tool_calls?.length > 0) {
            let args = {}
            try { args = JSON.parse(result.tool_calls[0].function.arguments) } catch (e) { }
            if (typeof args?.isTaskComplete === "boolean") {
                return args
            }
        }
    }
    catch {
        // suppress completion checker errors
    }
    return null
}

let askUserToRetryIncompleteTask = async (agentRunState) => {
    if (!!agentRunState?.skipTaskCompletionCheck || agentRunState.endCurrent) {
        return
    }
    let autoContinueMode = `${localsettings?.agentAutoContinueMode || ""}`
    if (autoContinueMode !== "auto" && autoContinueMode !== "prompt" && autoContinueMode !== "disabled") {
        autoContinueMode = typeof localsettings?.agentAutoContinue === "boolean" && localsettings.agentAutoContinue ? "auto" : "prompt"
    }
    if (autoContinueMode === "disabled") {
        return
    }

    let isTaskComplete = await checkIfTaskComplete(agentRunState), continuePrompt = isTaskComplete?.isTaskComplete === false && !!isTaskComplete?.objectiveForContinuing ? isTaskComplete.objectiveForContinuing : agentRunState?.agentPrompt
    if (isTaskComplete?.isTaskComplete !== false) {
        return
    }

    let retryResult, shouldAutoContinue = autoContinueMode === "auto";
    if (shouldAutoContinue)
    {
        retryResult = "continue"
    }
    else
    {
        retryResult = await createAgentUserInputPopup({
            prompt: "Task may be incomplete. Do you want the agent to run again? You can add details before continuing.",
            suggestions: [],
            enableFileUpload: false,
        })
    }

    if (!retryResult || retryResult.action === "stop") {
        return
    }

    let retryInput = (retryResult.input || "Please continue and complete the task.").trim()
    if (!!retryInput) {
        window.execAgentCycle(objRefAssign({}, {
            initialPrompt: shouldAutoContinue ? "" : retryInput,
            printToConsole: !!agentRunState?.printToConsole,
            agentName: agentRunState?.agentName,
            systemPrompt: agentRunState?.systemPrompt,
            agentPrompt: continuePrompt,
            configOverrides: agentRunState?.configOverrides,
            isUsingWhitelist: agentRunState?.isUsingWhitelist,
            agentStopOnRequestForInput: agentRunState?.agentStopOnRequestForInput,
            surpressMessagesToUser: agentRunState?.surpressMessagesToUser,
            excludeSpecificMessagePrefixes: agentRunState?.excludeSpecificMessagePrefixes
        }))
    }
}

let renderSuggestions = () => {
    removeChoiceContainer()
    let hasPendingAgentInput = !!pendingAgentUserInputRequest && !pendingAgentUserInputRequest.resolved
    if ((!!currentSuggestions && currentSuggestions.length > 0) || hasPendingAgentInput) {
        let choiceContainer = document.createElement("span");
        choiceContainer.style.padding = "10px";

        choiceContainer.id = "choiceContainer"

        if (hasPendingAgentInput) {
            let request = pendingAgentUserInputRequest
            let canUseFsUpload = !!request.enableFileUpload && !!request.isFsEnabled && typeof window?.fsClient?.write === "function"
            let canSelectFsFiles = !!request.enableFileUpload && !!request.isFsEnabled

            let inlineWrap = document.createElement("div")
            inlineWrap.id = "agentInlineInputRequest"
            inlineWrap.classList.add("agent-user-input-inline")

            let title = document.createElement("div")
            title.classList.add("agent-user-input-header")
            title.innerText = "Agent input required"
            inlineWrap.appendChild(title)

            let promptText = document.createElement("div")
            promptText.classList.add("agent-user-input-status")
            promptText.innerText = request.prompt || "Please provide input"
            inlineWrap.appendChild(promptText)

            if (request.suggestions.length > 0) {
                let pendingSuggestions = document.createElement("div")
                pendingSuggestions.classList.add("agent-user-input-suggestions")
                request.suggestions.forEach(suggestion => {
                    let button = document.createElement("button")
                    button.type = "button"
                    button.classList.add("btn-primary")
                    button.innerText = suggestion
                    button.onclick = () => {
                        let { input } = getAgentInputUiTargets()
                        if (input) {
                            input.value = suggestion
                            input.focus()
                        }
                    }
                    pendingSuggestions.appendChild(button)
                })
                inlineWrap.appendChild(pendingSuggestions)
            }

            if (request.enableFileUpload) {
                let fileActions = document.createElement("div")
                fileActions.classList.add("agent-user-input-controls")

                let localInput = document.createElement("input")
                localInput.type = "file"
                localInput.multiple = true
                localInput.style.display = "none"
                localInput.setAttribute("aria-hidden", "true")

                if (canUseFsUpload) {
                    let addLocalButton = document.createElement("button")
                    addLocalButton.type = "button"
                    addLocalButton.classList.add("btn-primary")
                    addLocalButton.innerText = "Add local files"
                    addLocalButton.onclick = () => {
                        localInput.click()
                    }
                    fileActions.appendChild(addLocalButton)
                }

                localInput.onchange = () => {
                    let filesToAdd = Array.from(localInput.files || []).map(file => ({
                        source: "local",
                        fileName: file.name,
                        fileSize: file.size,
                        fileLastModified: file.lastModified,
                        localFile: file,
                    }))
                    let addedCount = addFilesToPendingAgentRequest(filesToAdd)
                    if (pendingAgentUserInputRequest) {
                        pendingAgentUserInputRequest.fileStatus = addedCount > 0
                            ? `Added ${addedCount} local file${addedCount === 1 ? "" : "s"}.`
                            : "Selected local files were already in the list."
                    }
                    localInput.value = ""
                    renderSuggestions()
                }

                fileActions.appendChild(localInput)

                if (canSelectFsFiles) {
                    let addFsButton = document.createElement("button")
                    addFsButton.type = "button"
                    addFsButton.classList.add("btn-primary")
                    addFsButton.innerText = "Browse FS"
                    addFsButton.onclick = async () => {
                        let selectedEntries = await openAgentFsPickerPopup()
                        if (!pendingAgentUserInputRequest || !Array.isArray(selectedEntries)) {
                            return
                        }
                        let entries = selectedEntries.map(entry => ({
                            source: "fs",
                            isDirectory: !!entry.isDirectory,
                            path: `${entry.path}${entry.isDirectory ? " (directory)" : ""}`,
                            fileName: entry.path.split("/").filter(part => part.length > 0).slice(-1)[0] || entry.path,
                        }))
                        let addedCount = addFilesToPendingAgentRequest(entries)
                        if (pendingAgentUserInputRequest) {
                            pendingAgentUserInputRequest.fileStatus = addedCount > 0
                                ? `Added ${addedCount} FS file${addedCount === 1 ? "" : "s"}.`
                                : "Selected FS files were already in the list."
                        }
                        renderSuggestions()
                    }

                    fileActions.appendChild(addFsButton)
                }

                if (!canUseFsUpload && !canSelectFsFiles) {
                    let capabilityText = document.createElement("div")
                    capabilityText.classList.add("agent-user-input-status")
                    capabilityText.innerText = "File upload and FS file selection are unavailable because filesystem access is not supported by the current endpoint."
                    inlineWrap.appendChild(capabilityText)
                }

                inlineWrap.appendChild(fileActions)

                let selectedFilesContainer = document.createElement("div")
                selectedFilesContainer.classList.add("agent-user-input-selected-files")
                request.selectedFiles.forEach((entry, index) => {
                    let item = document.createElement("div")
                    item.classList.add("agent-user-input-selected-file")

                    let label = document.createElement("div")
                    label.classList.add("agent-user-input-selected-file-label")
                    if (entry.source === "fs") {
                        label.innerText = entry.isDirectory ? `FS directory: ${entry.path}` : `FS: ${entry.path}`
                    }
                    else {
                        label.innerText = `Local: ${entry.fileName}`
                    }

                    let removeButton = document.createElement("button")
                    removeButton.type = "button"
                    removeButton.classList.add("agent-user-input-remove-file")
                    removeButton.innerText = "x"
                    removeButton.onclick = () => {
                        if (!pendingAgentUserInputRequest) {
                            return
                        }
                        pendingAgentUserInputRequest.selectedFiles.splice(index, 1)
                        renderSuggestions()
                    }

                    item.appendChild(label)
                    item.appendChild(removeButton)
                    selectedFilesContainer.appendChild(item)
                })
                inlineWrap.appendChild(selectedFilesContainer)
            }

            let statusText = document.createElement("div")
            statusText.classList.add("agent-user-input-status")
            if (request.fileStatus) {
                statusText.innerText = request.fileStatus
            }
            else {
                let selectionSummary = getPendingAgentSelectionSummary(request.selectedFiles)
                statusText.innerText = selectionSummary.total > 0
                    ? `${selectionSummary.total} selected: ${selectionSummary.text}.`
                    : "Type a response in the main input box, then press Enter or Continue."
            }
            inlineWrap.appendChild(statusText)

            let controls = document.createElement("div")
            controls.classList.add("agent-user-input-controls")

            let continueButton = document.createElement("button")
            continueButton.type = "button"
            continueButton.classList.add("btn-primary")
            continueButton.innerText = request.isResolving ? "Preparing..." : "Continue"
            continueButton.disabled = !!request.isResolving
            continueButton.onclick = async () => {
                await resolvePendingAgentUserInputFromMainInput("continue")
            }

            let stopButton = document.createElement("button")
            stopButton.type = "button"
            stopButton.classList.add("btn-primary")
            stopButton.innerText = "Stop"
            stopButton.disabled = !!request.isResolving
            stopButton.onclick = async () => {
                await resolvePendingAgentUserInputFromMainInput("stop")
            }

            controls.appendChild(continueButton)
            controls.appendChild(stopButton)
            inlineWrap.appendChild(controls)

            choiceContainer.appendChild(inlineWrap)
        }

        currentSuggestions.forEach(suggestion => {
            let choice = document.createElement("button");
            choice.classList.add("btn-primary")
            choice.innerText = suggestion;
            choice.onclick = () => {
                let { input } = getAgentInputUiTargets()
                if (input) {
                    input.value = suggestion
                }

                // clearSuggestions();
                // document.getElementById("btnsend").onclick();
            }
            choiceContainer.appendChild(choice)
        })

        if (!!currentSuggestions && currentSuggestions.length > 0) {
            let cancelChoice = document.createElement("button");
            cancelChoice.classList.add("btn-primary")
            cancelChoice.innerText = "Clear suggestions";
            cancelChoice.onclick = () => {
                clearSuggestions()
            }
            choiceContainer.appendChild(cancelChoice)
        }

        let { container } = getAgentInputUiTargets()
        if (container) {
            container.appendChild(choiceContainer)
        }
    }
}

let originalRenderGametext = render_gametext;

render_gametext = (save = true, forceScroll) => {
    originalRenderGametext(save, forceScroll)
    if (isAgentModeEnabledAndSetCorrectly()) {
        renderSuggestions()
    }
    else {
        if (pendingAgentUserInputRequest && !pendingAgentUserInputRequest.resolved) {
            completePendingAgentUserInputRequest({ action: "stop" })
        }
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

let isEditModeActive = () => {
    let allowEditingToggle = document.getElementById("allowediting")
    let isLegacyEditMode = !!window?.inEditMode || !!allowEditingToggle?.checked
    let isWysiwygEditMode = document.getElementById("gametext")?.contentEditable === "true"
    return isLegacyEditMode || isWysiwygEditMode
}

let shouldSkipHiddenCotOnBackRedo = () => {
    return isAgentModeEnabledAndSetCorrectly() && !!localsettings?.agentHideCOT && !isEditModeActive()
}

let unwrapAgentHistorySegment = (segment = "") => {
    let value = `${segment || ""}`
    let wrappers = [
        [instructstartplaceholder, instructstartplaceholder_end],
        [instructendplaceholder, instructendplaceholder_end],
        [instructsysplaceholder, instructsysplaceholder_end],
    ]
    for (let i = 0; i < wrappers.length; i++) {
        let [startTag, endTag] = wrappers[i]
        if (value.indexOf(startTag) === 0 && value.endsWith(endTag)) {
            return value.substring(startTag.length, value.length - endTag.length)
        }
    }
    return value
}

let shouldHideAgentTurnFromVisibleHistory = (message = "") => {
    let trimmedMessage = `${message || ""}`.trim()
    return !!listOfExclusions.find(excludedStart => trimmedMessage.indexOf(excludedStart) === 0)
}

let deriveVisibleHistorySegments = (historySegments = []) => {
    return historySegments.reduce((segments, segment) => {
        let unwrapped = unwrapAgentHistorySegment(segment)
        if (shouldHideAgentTurnFromVisibleHistory(unwrapped)) {
            return segments
        }
        if (unwrapped.indexOf("Request for user input:") === 0) {
            unwrapped = unwrapped.replace("Request for user input:", "").trim()
        }
        segments.push(unwrapped)
        return segments
    }, [])
}

let buildHistorySignature = (segments = []) => {
    return JSON.stringify(segments)
}

let getHistorySignatures = () => {
    let fullSegments = Array.isArray(gametext_arr) ? [...gametext_arr] : []
    let visibleSegments = deriveVisibleHistorySegments(fullSegments)
    return {
        full: buildHistorySignature(fullSegments),
        visible: buildHistorySignature(visibleSegments)
    }
}

let isTopHistorySegmentHiddenCot = () => {
    if (!Array.isArray(gametext_arr) || gametext_arr.length === 0) {
        return false
    }
    let topSegment = gametext_arr[gametext_arr.length - 1]
    let unwrapped = unwrapAgentHistorySegment(topSegment)
    return shouldHideAgentTurnFromVisibleHistory(unwrapped)
}

let runUndoRedoSkippingHiddenCot = (singleStepHandler, isUndo = false) => {
    // Outside agent hide-COT mode (or while editing), preserve native single-step behavior.
    if (!shouldSkipHiddenCotOnBackRedo()) {
        singleStepHandler()
        return
    }

    // Snapshot history before first step so we can determine what changed.
    let before = getHistorySignatures()
    singleStepHandler()
    let after = getHistorySignatures()

    // If the underlying history did not move, stop immediately.
    let historyChanged = after.full !== before.full
    if (!historyChanged) {
        return
    }

    // Visible history changed after the first step:
    // - redo: this is the intended target, stop
    // - undo: continue clearing newly exposed hidden COT at the top in one click
    if (after.visible !== before.visible) {
        if (!isUndo) {
            return
        }
        // For undo, also clear any now-exposed hidden COT turns so one click is enough.
        let cleanupSteps = 200
        while (cleanupSteps > 0 && isTopHistorySegmentHiddenCot()) {
            cleanupSteps--
            before = after
            singleStepHandler()
            after = getHistorySignatures()
            historyChanged = after.full !== before.full
            // Stop if another step cannot move history further.
            if (!historyChanged) {
                break
            }
        }
        return
    }

    // First step changed only hidden history.
    // Keep stepping until we hit a visible boundary or history no longer changes.
    let maxSteps = 200
    for (let i = 0; i < maxSteps; i++) {
        before = after
        singleStepHandler()
        after = getHistorySignatures()
        historyChanged = after.full !== before.full
        if (!historyChanged) {
            break
        }
        let visibleChanged = after.visible !== before.visible
        if (visibleChanged) {
            break
        }
    }
}

btn_back = () => {
    clearSuggestions()
    runUndoRedoSkippingHiddenCot(originalBtnBack, true)
}

btn_redo = () => {
    clearSuggestions()
    runUndoRedoSkippingHiddenCot(originalBtnRedo, false)
}

btn_retry = () => {
    clearSuggestions()
    originalBtnRetry()
}