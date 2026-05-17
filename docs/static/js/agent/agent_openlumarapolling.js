window.eso.currentlyProcessingFromLumara = Promise.resolve();
window.eso.nextLumaraPollingAuthPromptAt = 0;
window.eso.lumaraSocketEnabled = false;
window.eso.lumaraSocketReconnectIntervalId = null;
window.eso.lumaraSocketConnectInFlight = null;
window.eso.lumaraSocketBoundHandlers = null;
window.eso.lumaraSocketReconnectEveryMs = 60000;
window.eso.lumaraSocketStatus = "disabled";
window.eso.lumaraSocketStatusDetail = "";

let setLumaraSocketStatus = (status, detail = "") => {
    window.eso.lumaraSocketStatus = status
    window.eso.lumaraSocketStatusDetail = `${detail || ""}`
    if (typeof window.updateLumaraListenerStatusIndicator === "function") {
        window.updateLumaraListenerStatusIndicator()
    }
}

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
        // Delay re-prompting from background listener attempts to avoid popup spam.
        window.eso.nextLumaraPollingAuthPromptAt = Date.now() + 30000;
        return false;
    }

    window.eso.nextLumaraPollingAuthPromptAt = 0;
    return true;
}

let clearLumaraSocketReconnectTimer = () => {
    if (window.eso.lumaraSocketReconnectIntervalId) {
        clearInterval(window.eso.lumaraSocketReconnectIntervalId)
        window.eso.lumaraSocketReconnectIntervalId = null
    }
}

let scheduleLumaraSocketReconnectLoop = () => {
    if (!window.eso.lumaraSocketEnabled) {
        return
    }
    if (window.eso.lumaraSocketReconnectIntervalId) {
        return
    }

    setLumaraSocketStatus("reconnecting", "retrying every 60s")

    window.eso.lumaraSocketReconnectIntervalId = setInterval(async () => {
        if (!window.eso.lumaraSocketEnabled) {
            clearLumaraSocketReconnectTimer()
            return
        }
        try {
            await connectLumaraSocketListener()
        } catch (err) {
            console.error("Error reconnecting Lumara socket listener:", err)
        }
    }, window.eso.lumaraSocketReconnectEveryMs)
}

let processLumaraMessages = async (messages) => {
    let formatLumaraMessage = (message) => `Lumara response: ${`${message || ""}`.trim()}`
    let normalizedMessages = (Array.isArray(messages) ? messages : [messages]).filter(message => !!message)
    if (normalizedMessages.length === 0) {
        return
    }

    normalizedMessages.sort((a, b) => {
        let aIndex = Number.isInteger(a?.index) ? a.index : Number.MAX_SAFE_INTEGER
        let bIndex = Number.isInteger(b?.index) ? b.index : Number.MAX_SAFE_INTEGER
        return aIndex > bIndex ? 1 : -1
    })

    window.eso.currentlyProcessingFromLumara = window.eso.currentlyProcessingFromLumara.then(async () => {
        let lastMessageProcessedFromLumara = localsettings.lastMessageProcessedFromLumara || 0
        try {
            let toWrite = []
            normalizedMessages.forEach(msg => {
                if (Number.isInteger(msg?.index) && msg.index <= lastMessageProcessedFromLumara) {
                    return
                }

                if (!!msg?.content) {
                    if (msg.role === "user") {
                        toWrite.push(createInstructPrompt(`Lumara - user: ${msg.content || ""}`))
                    } else if (msg.role === "assistant") {
                        toWrite.push(createAIPrompt(`Lumara: ${msg.content || ""}`))
                    } else if (msg.role === "tool") {
                        let toolResponseDetails = `${msg.content || ""}`
                        try {
                            toolResponseDetails = objToText(JSON.parse(msg.content))
                        } catch (_err) {}
                        toWrite.push(createSysPrompt(formatLumaraMessage(`tool response: ${toolResponseDetails}`)))
                    }
                }

                if (!!msg?.tool_calls && Array.isArray(msg.tool_calls)) {
                    msg.tool_calls.forEach(call => {
                        let toolCallId = call.id;
                        let toolDetails = `tool call: ${objToText(call?.function || call)}`
                        if (!!toolCallId) {
                            let toolResp = normalizedMessages.find(m => m.role === "tool" && m.tool_call_id === toolCallId)
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

                if (Number.isInteger(msg?.index) && msg.index > lastMessageProcessedFromLumara) {
                    lastMessageProcessedFromLumara = msg.index
                }
            })

            if (toWrite.length > 0) {
                toWrite.forEach(wrappedPrompt => gametext_arr.push(wrappedPrompt.replace(/\\\\/g, "")))
                render_gametext()
            }
            localsettings.lastMessageProcessedFromLumara = lastMessageProcessedFromLumara
        } catch (err) {
            console.error("Error processing messages from Lumara socket:", err)
        } finally {
            return Promise.resolve()
        }
    })
    await window.eso.currentlyProcessingFromLumara
}

let bindLumaraSocketHandlers = () => {
    if (window.eso.lumaraSocketBoundHandlers) {
        return
    }

    window.eso.lumaraSocketBoundHandlers = {
        onOpen: () => {
            setLumaraSocketStatus("connected")
            clearLumaraSocketReconnectTimer()
        },
        onClose: () => {
            setLumaraSocketStatus("reconnecting", "socket closed")
            scheduleLumaraSocketReconnectLoop()
        },
        onError: () => {
            setLumaraSocketStatus("error", "socket error")
            scheduleLumaraSocketReconnectLoop()
        },
        onMessageAdded: async (payload) => {
            if (!payload?.message) {
                return
            }
            await processLumaraMessages(payload.message)
        },
    }

    openlumaraClient.onSocket("open", window.eso.lumaraSocketBoundHandlers.onOpen)
    openlumaraClient.onSocket("close", window.eso.lumaraSocketBoundHandlers.onClose)
    openlumaraClient.onSocket("error", window.eso.lumaraSocketBoundHandlers.onError)
    openlumaraClient.onSocket("message_added", window.eso.lumaraSocketBoundHandlers.onMessageAdded)
}

let unbindLumaraSocketHandlers = () => {
    if (!window.eso.lumaraSocketBoundHandlers) {
        return
    }

    openlumaraClient.offSocket("open", window.eso.lumaraSocketBoundHandlers.onOpen)
    openlumaraClient.offSocket("close", window.eso.lumaraSocketBoundHandlers.onClose)
    openlumaraClient.offSocket("error", window.eso.lumaraSocketBoundHandlers.onError)
    openlumaraClient.offSocket("message_added", window.eso.lumaraSocketBoundHandlers.onMessageAdded)
    window.eso.lumaraSocketBoundHandlers = null
}

connectLumaraSocketListener = async () => {
    if (!window.eso.lumaraSocketEnabled || !is_using_kcpp_with_open_lumara()) {
        setLumaraSocketStatus("disabled")
        return false
    }
    if (openlumaraClient.isSocketConnected()) {
        setLumaraSocketStatus("connected")
        clearLumaraSocketReconnectTimer()
        return true
    }
    if (window.eso.lumaraSocketConnectInFlight) {
        return window.eso.lumaraSocketConnectInFlight
    }

    window.eso.lumaraSocketConnectInFlight = (async () => {
        setLumaraSocketStatus("connecting")
        let authorized = await ensureLumaraPollingIdentity()
        if (!authorized) {
            setLumaraSocketStatus("awaiting_auth", "reconnect pending")
            scheduleLumaraSocketReconnectLoop()
            return false
        }

        bindLumaraSocketHandlers()
        try {
            openlumaraClient.connectSocket()
            return true
        } catch (err) {
            console.error("Error connecting Lumara socket listener:", err)
            setLumaraSocketStatus("error", "connect failed")
            scheduleLumaraSocketReconnectLoop()
            return false
        }
    })()

    try {
        return await window.eso.lumaraSocketConnectInFlight
    } finally {
        window.eso.lumaraSocketConnectInFlight = null
    }
}

startLumaraSocketListener = async () => {
    window.eso.currentlyProcessingFromLumara = Promise.resolve()
    window.eso.lumaraSocketEnabled = true
    setLumaraSocketStatus("connecting")
    bindLumaraSocketHandlers()
    let connected = await connectLumaraSocketListener()
    if (!connected) {
        scheduleLumaraSocketReconnectLoop()
    }
}

stopLumaraSocketListener = () => {
    window.eso.lumaraSocketEnabled = false
    clearLumaraSocketReconnectTimer()
    window.eso.lumaraSocketConnectInFlight = null
    unbindLumaraSocketHandlers()
    openlumaraClient.disconnectSocket()
    setLumaraSocketStatus("disabled")
}

pollForLatestMessagesFromLumara = async () => {
    // Legacy shim retained for compatibility with existing setup call sites.
    await connectLumaraSocketListener()
}
