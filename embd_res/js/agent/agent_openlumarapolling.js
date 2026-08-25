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
window.eso.lumaraActiveTurnStream = null;

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
    window.eso.lumaraActiveTurnStream = null
    if (typeof window.clearAgentStreamingDisplay === "function") {
        window.clearAgentStreamingDisplay()
        return
    }
    if (typeof window.updateAgentStreamingDisplay === "function") {
        window.updateAgentStreamingDisplay("")
    }
}

let getLumaraThinkTags = () => {
    return {
        start: `${localsettings?.start_thinking_tag || "<think>"}`,
        stop: `${localsettings?.stop_thinking_tag || "</think>"}`,
    }
}

let normalizeLumaraValue = (value) => {
    if (value === null || value === undefined) {
        return ""
    }
    if (typeof value === "string") {
        return value
    }
    if (typeof value === "object" && typeof value?.content === "string") {
        return value.content
    }
    try {
        return JSON.stringify(value)
    } catch (_err) {
        return `${value}`
    }
}

let getLumaraContentText = (value) => {
    return normalizeLumaraValue(value).trim()
}

let formatLumaraToolCallRequestsText = (toolCalls) => {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return ""
    }
    let lines = ["[Lumara tool calls]"]
    toolCalls.forEach((call, idx) => {
        let fnName = `${call?.function?.name || call?.name || `tool_${idx + 1}`}`
        let fnArgs = normalizeLumaraValue(call?.function?.arguments ?? call?.arguments).trim()
        lines.push(`${idx + 1}. ${fnName}${fnArgs ? `(${fnArgs})` : "()"}`)
    })
    return lines.join("\n")
}

let formatLumaraToolCallResponsesText = (toolCalls) => {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        return ""
    }

    let responseLines = []
    toolCalls.forEach((call, idx) => {
        let fnName = `${call?.function?.name || call?.name || `tool_${idx + 1}`}`
        let fnResp = normalizeLumaraValue(call?.response ?? call?.result ?? call?.output)
        if (!fnResp.trim()) {
            return
        }
        responseLines.push(`${idx + 1}. ${fnName}: ${fnResp}`)
    })

    if (responseLines.length === 0) {
        return ""
    }

    return ["[Lumara tool responses]", ...responseLines].join("\n")
}

let createLumaraTurnSnapshot = () => {
    return {
        role: "assistant",
        turn_id: "",
        reasoning_content: "",
        content: "",
        tool_calls: [],
    }
}

let applyLumaraTurnToSnapshot = (snapshot, turnObj) => {
    if (!snapshot || !turnObj || typeof turnObj !== "object") {
        return
    }

    let segments = Array.isArray(turnObj?.messages) ? turnObj.messages : [turnObj]
    segments.forEach(seg => {
        if (!seg || typeof seg !== "object") {
            return
        }

        if (`${seg?.role || ""}`) {
            snapshot.role = `${seg.role}`
        }
        if (`${seg?.turn_id || ""}`) {
            snapshot.turn_id = `${seg.turn_id}`
        }

        let segType = `${seg?.type || ""}`.toLowerCase()
        if (segType === "reasoning") {
            let txt = normalizeLumaraValue(seg?.reasoning_content ?? seg?.content)
            if (txt) {
                snapshot.reasoning_content = txt
            }
            return
        }
        if (segType === "content") {
            let txt = getLumaraContentText(seg?.content)
            if (txt) {
                snapshot.content = txt
            }
            return
        }
        if (segType === "tool_calls") {
            if (Array.isArray(seg?.tool_calls)) {
                snapshot.tool_calls = seg.tool_calls
            }
            return
        }

        // Snapshot-style payloads can omit type and include direct fields.
        let snapshotReasoning = normalizeLumaraValue(seg?.reasoning_content)
        if (snapshotReasoning) {
            snapshot.reasoning_content = snapshotReasoning
        }

        let snapshotContent = getLumaraContentText(seg?.content)
        if (snapshotContent) {
            snapshot.content = snapshotContent
        }

        if (Array.isArray(seg?.tool_calls)) {
            snapshot.tool_calls = seg.tool_calls
        }
    })
}

let extractLumaraTurnFromPayload = (payload) => {
    let turn = payload?.turn
    if (turn && typeof turn === "object") {
        return turn
    }

    turn = payload?.turns
    if (turn && typeof turn === "object") {
        return turn
    }

    turn = payload?.raw?.turn
    if (turn && typeof turn === "object") {
        return turn
    }

    turn = payload?.raw?.turns
    if (turn && typeof turn === "object") {
        return turn
    }

    return null
}

let renderLumaraSnapshotToBlocks = (snapshot) => {
    let tags = getLumaraThinkTags()
    let blocks = []

    let reasoning = `${snapshot?.reasoning_content || ""}`.trim()
    if (reasoning) {
        blocks.push(`${tags.start}${reasoning}${tags.stop}`)
    }

    let toolCallPart = formatLumaraToolCallRequestsText(snapshot?.tool_calls || [])
    if (toolCallPart) {
        blocks.push(toolCallPart)
    }

    let toolResponsePart = formatLumaraToolCallResponsesText(snapshot?.tool_calls || [])
    if (toolResponsePart) {
        blocks.push(toolResponsePart)
    }

    let content = `${snapshot?.content || ""}`.trim()
    if (content) {
        blocks.push(content)
    }

    return blocks.filter(block => `${block || ""}`.trim().length > 0)
}

let renderLumaraTurnToBlocks = (turnObj) => {
    if (!turnObj || typeof turnObj !== "object") {
        return []
    }

    let snapshot = createLumaraTurnSnapshot()
    applyLumaraTurnToSnapshot(snapshot, turnObj)
    return renderLumaraSnapshotToBlocks(snapshot)
}

let renderLumaraTurnToText = (turnObj) => {
    return renderLumaraTurnToBlocks(turnObj).join("\n\n").trim()
}

let renderLumaraTurnToUi = (turnObj) => {
    if (!turnObj || typeof turnObj !== "object") {
        return
    }

    if (!window.eso.lumaraActiveTurnStream || typeof window.eso.lumaraActiveTurnStream !== "object") {
        window.eso.lumaraActiveTurnStream = createLumaraTurnSnapshot()
    }
    applyLumaraTurnToSnapshot(window.eso.lumaraActiveTurnStream, turnObj)

    let rendered = renderLumaraTurnToText(window.eso.lumaraActiveTurnStream)
    if (!rendered) {
        return
    }
    window.eso.lumaraActiveStreamText = rendered
    if (!window.eso.lumaraActiveStreamStartedAt) {
        window.eso.lumaraActiveStreamStartedAt = Date.now()
        if (window.eso.lumaraSocketEnabled) {
            setLumaraSocketStatus("connected", "streaming")
        }
    }
    if (typeof window.updateAgentStreamingDisplay === "function") {
        window.updateAgentStreamingDisplay(rendered)
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

let turnHasRenderableAssistantData = (turnObj) => {
    if (!turnObj) {
        return false
    }
    let role = `${turnObj?.role || "assistant"}`.toLowerCase()
    if (role && role !== "assistant") {
        return false
    }
    return renderLumaraTurnToBlocks(turnObj).length > 0
}

let emitLumaraTurnToChat = async (turnObj) => {
    if (!turnHasRenderableAssistantData(turnObj)) {
        return false
    }

    let blocksToWrite = renderLumaraTurnToBlocks(turnObj)
    if (blocksToWrite.length === 0) {
        return false
    }

    window.eso.currentlyProcessingFromLumara = window.eso.currentlyProcessingFromLumara.then(async () => {
        try {
            blocksToWrite.forEach(block => {
                gametext_arr.push(createAIPrompt(`Lumara: ${block}`).replace(/\\\\/g, ""))
            })
            render_gametext()
        } catch (err) {
            console.error("Error rendering Lumara turn stream to chat:", err)
        } finally {
            return Promise.resolve()
        }
    })
    await window.eso.currentlyProcessingFromLumara
    return true
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
    let formatLumaraMessage = (message) => {
		let body = (message || "").trim();
		return `Lumara response: \n\n\`\`\`\n${body}\n\`\`\`\n\n`
		
	}
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

    let thinkStart = `${localsettings?.start_thinking_tag || "<think>"}`
    let thinkStop = `${localsettings?.stop_thinking_tag || "</think>"}`

    let buildAssistantBlocks = (msg, toolResponsesById) => {
        let blocks = []
        let reasoning = normalizeLumaraValue(msg?.reasoning_content).trim()
        if (reasoning) {
            blocks.push(`${thinkStart}${reasoning}${thinkStop}`)
        }

        let requestBlock = formatLumaraToolCallRequestsText(msg?.tool_calls || [])
        if (requestBlock) {
            blocks.push(requestBlock)
        }

        let responseLines = []
        ;(Array.isArray(msg?.tool_calls) ? msg.tool_calls : []).forEach((call, idx) => {
            let fnName = `${call?.function?.name || call?.name || `tool_${idx + 1}`}`
            let toolCallId = `${call?.id || ""}`.trim()
            let responseFromToolMessage = ""
            if (toolCallId) {
                responseFromToolMessage = normalizeLumaraValue(toolResponsesById.get(toolCallId)?.content)
            }
            let responseFromCall = normalizeLumaraValue(call?.response ?? call?.result ?? call?.output)
            let finalResponse = `${responseFromToolMessage || responseFromCall || ""}`.trim()
            if (!finalResponse) {
                return
            }
            responseLines.push(`${idx + 1}. ${fnName}: ${finalResponse}`)
        })
        if (responseLines.length > 0) {
            blocks.push(["[Lumara tool responses]", ...responseLines].join("\n"))
        }

        let content = getLumaraContentText(msg?.content)
        if (content) {
            blocks.push(content)
        }
        return blocks.filter(block => `${block || ""}`.trim().length > 0)
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
            let toolResponsesById = new Map()
            normalizedMessages.forEach(msg => {
                if (`${msg?.role || ""}` === "tool" && !!msg?.tool_call_id) {
                    toolResponsesById.set(`${msg.tool_call_id}`, msg)
                }
            })

            normalizedMessages.forEach(msg => {
                if (Number.isInteger(msg?.index) && msg.index <= lastMessageProcessedFromLumara) {
                    return
                }

                if (`${msg?.role || ""}` === "user" && !!msg?.content) {
                        toWrite.push(createInstructPrompt(`Lumara - user: ${msg.content || ""}`))
                }

                if (`${msg?.role || ""}` === "assistant") {
                    let assistantBlocks = buildAssistantBlocks(msg, toolResponsesById)
                    assistantBlocks.forEach(block => {
                        toWrite.push(createAIPrompt(`Lumara: ${block}`))
                    })
                }

                if (`${msg?.role || ""}` === "tool" && !msg?.tool_call_id) {
                    let fallbackName = `${msg?.name || "lumara_tool"}`
                    let fallbackContent = getLumaraContentText(msg?.content)
                    if (fallbackContent) {
                        let fallbackBlock = `[Lumara tool responses]\n1. ${fallbackName}: ${fallbackContent}`
                        toWrite.push(createAIPrompt(`Lumara: ${fallbackBlock}`))
                    }
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

let mapSocketBatchMessagesToLumaraMessages = (payload) => {
    let socketMessages = Array.isArray(payload?.messages) ? payload.messages : []
    if (socketMessages.length === 0) {
        return []
    }

    let mapped = []
    socketMessages.forEach(msg => {
        if (!msg || typeof msg !== "object") {
            return
        }

        let msgType = `${msg?.type || ""}`.toLowerCase()
        if (msgType === "user_message") {
            let content = normalizeLumaraValue(msg?.content)
            if (!`${content}`.trim()) {
                return
            }
            let mappedMsg = {
                role: "user",
                content,
            }
            if (Number.isInteger(msg?.index)) {
                mappedMsg.index = msg.index
            }
            mapped.push(mappedMsg)
        }
    })

    return mapped
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
        onTurnStream: (payload) => {
            let turn = extractLumaraTurnFromPayload(payload)
            if (!turn) {
                return
            }
            renderLumaraTurnToUi(turn)
        },
        onStreamComplete: async () => {
            try {
                if (window.eso.lumaraActiveTurnStream) {
                    await emitLumaraTurnToChat(window.eso.lumaraActiveTurnStream)
                }
            } catch (err) {
                console.error("Error finalizing Lumara turn stream:", err)
            }
            finalizeLumaraVisualStream()
        },
        onMessageBatch: async (payload) => {
            let sourceType = `${payload?.source_type || ""}`.toLowerCase()
            if (sourceType === "turn_stream") {
                let turn = extractLumaraTurnFromPayload(payload)
                if (!turn) {
                    return
                }
                renderLumaraTurnToUi(turn)
                return
            }

            if (sourceType === "user_message_added") {
                let mappedMessages = mapSocketBatchMessagesToLumaraMessages(payload)
                if (mappedMessages.length > 0) {
                    await processLumaraMessages(mappedMessages)
                }
                return
            }
        },
    }

    openlumaraClient.onSocket("open", window.eso.lumaraSocketBoundHandlers.onOpen)
    openlumaraClient.onSocket("close", window.eso.lumaraSocketBoundHandlers.onClose)
    openlumaraClient.onSocket("error", window.eso.lumaraSocketBoundHandlers.onError)
    openlumaraClient.onSocket("turn_stream", window.eso.lumaraSocketBoundHandlers.onTurnStream)
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
    openlumaraClient.offSocket("turn_stream", window.eso.lumaraSocketBoundHandlers.onTurnStream)
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
