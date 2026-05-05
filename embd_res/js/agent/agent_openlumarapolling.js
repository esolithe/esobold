window.eso.currentlyProcessingFromLumara = Promise.resolve();
window.eso.maxPolledMessagesFromLumara = 10;
window.eso.nextLumaraPollingAuthPromptAt = 0;

ensureLumaraPollingIdentity = async () => {
    if (typeof window.promptForOpenLumaraIdentity !== "function") {
        return true;
    }

    let now = Date.now();
    if (now < (window.eso.nextLumaraPollingAuthPromptAt || 0)) {
        return false;
    }

    let isAuthorized = false;
    await window.promptForOpenLumaraIdentity(async () => {
        isAuthorized = true;
    }, {
        baseUrl: openlumaraClient?.base_url,
    });

    if (!isAuthorized) {
        // Delay re-prompting from background polling to avoid popup spam.
        window.eso.nextLumaraPollingAuthPromptAt = Date.now() + 30000;
        return false;
    }

    window.eso.nextLumaraPollingAuthPromptAt = 0;
    return true;
}

pollForLatestMessagesFromLumara = async () => {
    let formatLumaraMessage = (message) => `Lumara response: ${`${message || ""}`.trim()}`

    let displayHandled = false;
    window.eso.currentlyProcessingFromLumara = window.eso.currentlyProcessingFromLumara.then(async () => {
        try {
            let authorized = await ensureLumaraPollingIdentity();
            if (!authorized) {
                return;
            }

            let lastMessageProcessedFromLumara = localsettings.lastMessageProcessedFromLumara
            let messageHistory = (await openlumaraClient.getMessagesSince(lastMessageProcessedFromLumara !== 0 ? lastMessageProcessedFromLumara + 1 : lastMessageProcessedFromLumara))?.messages;
            if (!!messageHistory) {
                let messagesToShow = messageHistory.splice(-window.eso.maxPolledMessagesFromLumara).sort((a, b) => a.index > b.index ? 1 : -1)
                if (messagesToShow.length > 0) {
                    let toWrite = []
                    messagesToShow.forEach(msg => {
                    if (!!msg?.content) {
                        if (msg.role === "user") {
                        toWrite.push(createInstructPrompt(`Lumara - user: ${msg.content || ""}`))
                        } else if (msg.role === "assistant") {
                        toWrite.push(createAIPrompt(`Lumara: ${msg.content || ""}`))
                        }
                    }
                    if (!!msg?.tool_calls && Array.isArray(msg.tool_calls)) {
                        msg.tool_calls.forEach(call => {
                            let toolCallId = call.id;
                            let toolDetails = `tool call: ${objToText(call?.function || call)}`
                            if (!!toolCallId) {
                                let toolResp = messagesToShow.find(m => m.role === "tool" && m.tool_call_id === toolCallId);
                                if (!!toolResp) {
                                let respContent = `${toolResp.content || ""}`
                                try {
                                    respContent = objToText(JSON.parse(toolResp.content))
                                } catch (_err) {}
                                toolDetails += `\n\ntool response: ${respContent}`
                                }
                            }
                            toWrite.push(createSysPrompt(formatLumaraMessage(toolDetails)))
                        })
                    }
                    })
                    if (toWrite.length > 0) {
                        toWrite.forEach(wrappedPrompt => gametext_arr.push(wrappedPrompt.replace(/\\\\/g, "")))
                        render_gametext()
                    }
                    displayHandled = true;
                }
                localsettings.lastMessageProcessedFromLumara = messagesToShow.reduce((a, c) => {
                    return !!c?.index && c.index > a ? c.index : a
                }, lastMessageProcessedFromLumara)
            }
        } catch (err) {
            console.error("Error polling messages from Lumara:", err)
        } finally {
            return Promise.resolve()
        }
    })
    await window.eso.currentlyProcessingFromLumara;
}