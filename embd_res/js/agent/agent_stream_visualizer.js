(() => {
    window.eso = window.eso || {}

    let asString = (value) => (value === null || value === undefined ? "" : `${value}`)
    let hasText = (value) => (typeof value === "string" && value !== "")
    let normalizeTag = (tagValue) => `${tagValue || ""}`.replaceAll("\\n", "\n")

    let getThinkTags = (normalise = false) => {
        let tags = {
            start: `${localsettings?.start_thinking_tag || "<think>"}`,
            stop: `${localsettings?.stop_thinking_tag || "</think>"}`,
        }
        if (!normalise) {
            return tags
        }
        return {
            start: normalizeTag(tags.start),
            stop: normalizeTag(tags.stop),
        }
    }

    let createState = () => {
        return {
            pendingStream: "",
            streamingWasThinking: false,
            lastStopReason: "",
            toolCallsByKey: {},
            toolCallOrder: [],
            lastAnonymousToolKey: null,
            anonymousToolCounter: 0,
        }
    }

    let extractThinkingText = (value) => {
        if (typeof value === "string") {
            return value
        }
        if (Array.isArray(value)) {
            return value
                .map(item => {
                    if (typeof item === "string") {
                        return item
                    }
                    if (typeof item?.text === "string") {
                        return item.text
                    }
                    return ""
                })
                .join("")
        }
        if (typeof value?.text === "string") {
            return value.text
        }
        return ""
    }

    let parseDeltaContentSegments = (deltaContent) => {
        let segments = []

        if (typeof deltaContent === "string") {
            segments.push({ type: "content", text: deltaContent })
            return segments
        }

        if (!Array.isArray(deltaContent)) {
            if (typeof deltaContent?.text === "string") {
                segments.push({ type: "content", text: deltaContent.text })
            }
            return segments
        }

        deltaContent.forEach(part => {
            if (typeof part === "string") {
                segments.push({ type: "content", text: part })
                return
            }

            let partType = `${part?.type || ""}`.toLowerCase()
            if (partType === "thinking") {
                let thinkingText = extractThinkingText(part?.thinking)
                if (!thinkingText && typeof part?.text === "string") {
                    thinkingText = part.text
                }
                if (thinkingText) {
                    segments.push({ type: "thinking", text: thinkingText })
                }
                return
            }

            if (typeof part?.text === "string" && part.text) {
                segments.push({ type: "content", text: part.text })
                return
            }

            if (typeof part?.content === "string" && part.content) {
                segments.push({ type: "content", text: part.content })
            }
        })

        return segments
    }

    let closeThinkingIfNeeded = (state, choice = {}, delta = {}) => {
        if (!state.streamingWasThinking) {
            return
        }

        state.streamingWasThinking = false
        if (hasText(delta?.reasoning_content)) {
            state.pendingStream += delta.reasoning_content
        }
        else if (hasText(delta?.reasoning)) {
            state.pendingStream += delta.reasoning
        }
        else if (hasText(choice?.reasoning)) {
            state.pendingStream += choice.reasoning
        }

        let tags = getThinkTags(true)
        state.pendingStream = `${tags.start}${state.pendingStream}${tags.stop}`
    }

    let appendReasoning = (state, text) => {
        let chunk = asString(text)
        if (!chunk) {
            return
        }
        state.streamingWasThinking = true
        state.pendingStream += chunk
    }

    let appendContent = (state, text) => {
        let chunk = asString(text)
        if (!chunk) {
            return ""
        }
        state.pendingStream += chunk
        return chunk
    }

    let resolveToolCallKey = (state, deltaToolCall) => {
        if (Number.isInteger(deltaToolCall?.index)) {
            return `idx:${deltaToolCall.index}`
        }
        if (deltaToolCall?.id) {
            return `id:${deltaToolCall.id}`
        }
        if (state.lastAnonymousToolKey) {
            return state.lastAnonymousToolKey
        }
        let key = `anon:${state.anonymousToolCounter++}`
        state.lastAnonymousToolKey = key
        return key
    }

    let upsertToolCallDelta = (state, deltaToolCall) => {
        let key = resolveToolCallKey(state, deltaToolCall)
        if (!state.toolCallsByKey[key]) {
            state.toolCallsByKey[key] = {
                id: "",
                type: "function",
                function: {
                    name: "",
                    arguments: "",
                },
            }
            state.toolCallOrder.push(key)
        }

        let entry = state.toolCallsByKey[key]
        if (deltaToolCall?.id) {
            entry.id = deltaToolCall.id
        }

        if (deltaToolCall?.function?.name) {
            entry.function.name += `${deltaToolCall.function.name}`
        }

        if (deltaToolCall?.function?.arguments !== undefined && deltaToolCall?.function?.arguments !== null) {
            entry.function.arguments += `${deltaToolCall.function.arguments}`
        }
    }

    let extractToolCallDeltaTokenText = (deltaToolCalls = []) => {
        if (!Array.isArray(deltaToolCalls) || deltaToolCalls.length === 0) {
            return ""
        }

        let tokens = []
        deltaToolCalls.forEach(tc => {
            let nameFragment = `${tc?.function?.name || ""}`
            if (nameFragment) {
                tokens.push(nameFragment)
            }

            // Tool argument chunks are token deltas and can arrive fragmented.
            let argFragment = `${tc?.function?.arguments || ""}`
            if (argFragment) {
                tokens.push(argFragment)
            }
        })

        return tokens.join("")
    }

    let applyChoiceChunk = (state, choice = {}) => {
        let appendedContent = ""
        let delta = choice?.delta || {}

        if (hasText(choice?.text)) {
            if (state.streamingWasThinking) {
                state.streamingWasThinking = false
                if (hasText(choice?.reasoning)) {
                    state.pendingStream += choice.reasoning
                }
                let tags = getThinkTags(true)
                if ((localsettings?.think_injected === 1) || state.pendingStream.includes(tags.start)) {
                    state.pendingStream += tags.stop
                }
            }
            appendedContent += appendContent(state, choice.text)
        }
        else {
            let contentSegments = parseDeltaContentSegments(delta?.content)
            if (contentSegments.length > 0) {
                contentSegments.forEach(segment => {
                    if (segment.type === "thinking") {
                        appendReasoning(state, segment.text)
                        return
                    }
                    if (state.streamingWasThinking) {
                        closeThinkingIfNeeded(state, choice, delta)
                    }
                    appendedContent += appendContent(state, segment.text)
                })
            }
            else if (hasText(delta?.reasoning_content)) {
                appendReasoning(state, delta.reasoning_content)
            }
            else if (hasText(delta?.reasoning)) {
                appendReasoning(state, delta.reasoning)
            }
            else if (hasText(choice?.reasoning_content)) {
                appendReasoning(state, choice.reasoning_content)
            }
            else if (hasText(choice?.reasoning)) {
                appendReasoning(state, choice.reasoning)
            }
        }

        if (Array.isArray(delta?.tool_calls)) {
            delta.tool_calls.forEach(tc => upsertToolCallDelta(state, tc))
            let toolTokenText = extractToolCallDeltaTokenText(delta.tool_calls)
            if (toolTokenText) {
                if (state.streamingWasThinking) {
                    closeThinkingIfNeeded(state, choice, delta)
                }
                appendedContent += appendContent(state, toolTokenText)
            }
        }

        if (choice?.finish_reason) {
            state.lastStopReason = `${choice.finish_reason}`
        }

        return {
            contentText: appendedContent,
        }
    }

    let finalize = (state, finishReason = null) => {
        if (finishReason !== null && finishReason !== undefined) {
            state.lastStopReason = `${finishReason}`
        }
        if (state.streamingWasThinking && state.pendingStream && (state.lastStopReason === "stop" || state.lastStopReason === "tool_calls")) {
            let tags = getThinkTags(true)
            state.pendingStream = `${tags.start}${state.pendingStream}${tags.stop}`
        }
        state.streamingWasThinking = false
        return state
    }

    let getToolCalls = (state) => {
        return state.toolCallOrder
            .map(key => state.toolCallsByKey[key])
            .filter(call => !!call)
            .map((call, idx) => {
                return {
                    id: call.id || `tool_call_${idx}`,
                    type: "function",
                    function: {
                        name: call?.function?.name || "",
                        arguments: call?.function?.arguments || "",
                    },
                }
            })
    }

    let getRenderableText = (state) => {
        return `${state?.pendingStream || ""}`
    }

    let getRenderableHtml = (state) => {
        let text = getRenderableText(state)
        if (!text) {
            return ""
        }

        if (typeof escape_html === "function" && typeof format_streaming_text === "function") {
            return `<span class="color_pendingtext pending_text">${format_streaming_text(escape_html(text))}</span>`
        }

        let escaped = text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
        return escaped.replaceAll("\n", "<br>")
    }

    window.eso.agentStreamVisualizer = {
        createState,
        applyChoiceChunk,
        finalize,
        getToolCalls,
        getRenderableText,
        getRenderableHtml,
    }
})()
