window.eso.currentlyProcessingFromLumara = Promise.resolve();
window.eso.nextLumaraPollingAuthPromptAt = 0;
window.eso.lumaraSocketEnabled = false;
window.eso.lumaraSocketReconnectIntervalId = null;
window.eso.lumaraSocketConnectInFlight = null;
window.eso.lumaraSocketBoundHandlers = null;
window.eso.lumaraSocketReconnectEveryMs = 60000;
window.eso.lumaraSocketStatus = "disabled";
window.eso.lumaraSocketStatusDetail = "";
window.eso.lumaraActiveStreamText = "";
window.eso.lumaraActiveStreamStartedAt = 0;

let setLumaraSocketStatus = (status, detail = "") => {
    window.eso.lumaraSocketStatus = status
    window.eso.lumaraSocketStatusDetail = `${detail || ""}`
    if (typeof window.updateLumaraListenerStatusIndicator === "function") {
        window.updateLumaraListenerStatusIndicator()
    }
}

let clearLumaraVisualStream = () => {
    window.eso.lumaraActiveStreamText = ""
    window.eso.lumaraActiveStreamStartedAt = 0
    if (typeof window.clearAgentStreamingDisplay === "function") {
        window.clearAgentStreamingDisplay()
        return
    }
    if (typeof window.updateAgentStreamingDisplay === "function") {
        window.updateAgentStreamingDisplay("")
    }
}

let extractLumaraTokenFromSocketPayload = (payload) => {
    let source = payload?.message && typeof payload.message === "object" ? payload.message : payload
    return `${source?.content || source?.text || source?.token || ""}`
}

let appendLumaraVisualToken = (payload) => {
    let token = extractLumaraTokenFromSocketPayload(payload)
    if (!token) {
        return
    }
    if (!window.eso.lumaraActiveStreamStartedAt) {
        window.eso.lumaraActiveStreamStartedAt = Date.now()
        if (window.eso.lumaraSocketEnabled) {
            setLumaraSocketStatus("connected", "streaming")
        }
    }
    window.eso.lumaraActiveStreamText += token
    if (typeof window.updateAgentStreamingDisplay === "function") {
        window.updateAgentStreamingDisplay(window.eso.lumaraActiveStreamText)
    }
}

let finalizeLumaraVisualStream = (statusDetail = "") => {
    if (!window.eso.lumaraActiveStreamStartedAt && !window.eso.lumaraActiveStreamText) {
        return
    }

    clearLumaraVisualStream()

    if (window.eso.lumaraSocketEnabled && openlumaraClient?.isSocketConnected()) {
        setLumaraSocketStatus("connected", statusDetail)
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
    let collapseMessagesByIndex = (messageList) => {
        let byIndex = new Map()
        let noIndex = []
        ;(Array.isArray(messageList) ? messageList : [messageList]).forEach(msg => {
            if (!msg) {
                return
            }
            if (Number.isInteger(msg?.index)) {
                // Keep latest snapshot for each index to avoid replaying delta spam permanently.
                byIndex.set(msg.index, msg)
            } else {
                noIndex.push(msg)
            }
        })
        return [...byIndex.values(), ...noIndex]
    }

    let normalizedMessages = collapseMessagesByIndex(messages)
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

let extractMessagesFromSocketPayload = (payload) => {
    if (!payload) {
        return []
    }

    if (Array.isArray(payload.messages)) {
        return payload.messages.filter(msg => !!msg)
    }

    if (!!payload.message && typeof payload.message === "object") {
        return [payload.message]
    }

    return []
}

let isLumaraDeltaBatchPayload = (payload) => {
    let sourceType = `${payload?.source_type || ""}`.toLowerCase()
    if (sourceType === "token" || sourceType.includes("delta") || sourceType.includes("reasoning") || sourceType.includes("content")) {
        return true
    }

    let rawType = `${payload?.raw?.type || ""}`.toLowerCase()
    if (rawType === "token" || rawType.includes("delta") || rawType.includes("reasoning") || rawType.includes("content")) {
        return true
    }

    let metaType = `${payload?.raw?._meta?.type || ""}`.toLowerCase()
    return metaType === "delta"
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
            finalizeLumaraVisualStream()
            setLumaraSocketStatus("reconnecting", "socket closed")
            scheduleLumaraSocketReconnectLoop()
        },
        onError: () => {
            finalizeLumaraVisualStream()
            setLumaraSocketStatus("error", "socket error")
            scheduleLumaraSocketReconnectLoop()
        },
        onToken: (payload) => {
            let streamPayload = payload?.message && typeof payload.message === "object" ? payload.message : payload
            appendLumaraVisualToken(streamPayload)
        },
        onStreamComplete: async () => {
            finalizeLumaraVisualStream()
            try {
                let lastProcessed = localsettings.lastMessageProcessedFromLumara || 0
                let nextIndex = lastProcessed > 0 ? lastProcessed + 1 : 0
                let history = await openlumaraClient.getMessagesSince(nextIndex)
                let messages = Array.isArray(history?.messages) ? history.messages : []
                if (messages.length > 0) {
                    await processLumaraMessages(messages)
                }
            } catch (err) {
                console.error("Error finalizing Lumara stream from history sync:", err)
            }
        },
        onMessageBatch: async (payload) => {
            if (isLumaraDeltaBatchPayload(payload)) {
                // Token/delta payloads must remain temporary visual stream only.
                return
            }
            let messages = extractMessagesFromSocketPayload(payload)
            if (messages.length === 0) {
                return
            }
            // If completion arrives as a message batch before stream_complete, finalize now.
            if (window.eso.lumaraActiveStreamStartedAt || window.eso.lumaraActiveStreamText) {
                finalizeLumaraVisualStream()
            }
            await processLumaraMessages(messages)
        },
    }

    openlumaraClient.onSocket("open", window.eso.lumaraSocketBoundHandlers.onOpen)
    openlumaraClient.onSocket("close", window.eso.lumaraSocketBoundHandlers.onClose)
    openlumaraClient.onSocket("error", window.eso.lumaraSocketBoundHandlers.onError)
    openlumaraClient.onSocket("token", window.eso.lumaraSocketBoundHandlers.onToken)
    openlumaraClient.onSocket("stream_complete", window.eso.lumaraSocketBoundHandlers.onStreamComplete)
    openlumaraClient.onSocket("message_batch", window.eso.lumaraSocketBoundHandlers.onMessageBatch)
}

let unbindLumaraSocketHandlers = () => {
    if (!window.eso.lumaraSocketBoundHandlers) {
        return
    }

    openlumaraClient.offSocket("open", window.eso.lumaraSocketBoundHandlers.onOpen)
    openlumaraClient.offSocket("close", window.eso.lumaraSocketBoundHandlers.onClose)
    openlumaraClient.offSocket("error", window.eso.lumaraSocketBoundHandlers.onError)
    openlumaraClient.offSocket("token", window.eso.lumaraSocketBoundHandlers.onToken)
    openlumaraClient.offSocket("stream_complete", window.eso.lumaraSocketBoundHandlers.onStreamComplete)
    openlumaraClient.offSocket("message_batch", window.eso.lumaraSocketBoundHandlers.onMessageBatch)
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
    clearLumaraVisualStream()
    window.eso.lumaraSocketEnabled = true
    setLumaraSocketStatus("connecting")
    bindLumaraSocketHandlers()
    let connected = await connectLumaraSocketListener()
    if (!connected) {
        scheduleLumaraSocketReconnectLoop()
    }
}

stopLumaraSocketListener = () => {
    clearLumaraVisualStream()
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
