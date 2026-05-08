export const buildOpenlumaraCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		objToText,
	} = ctx

	let formatLumaraMessage = (message) => `Lumara response: ${`${message || ""}`.trim()}`

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

	let ensureLumaraIdentity = async () => {
		if (typeof window.promptForOpenLumaraIdentity !== "function") {
			return true
		}

		let isAuthorized = false
		await window.promptForOpenLumaraIdentity(async () => {
			isAuthorized = true
		}, {
			baseUrl: ol?.base_url,
		})

		return isAuthorized
	}

	/** Shared helper — run an async call, add result to CoT, return the data. */
	let runAndReport = async (label, asyncCall) => {
		let result
		try {
			let authorized = await ensureLumaraIdentity()
			if (!authorized) {
				addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`${label}: authorization was not completed.`))
				return null
			}
			result = await asyncCall()
		} catch (err) {
			addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`${label} error: ${err?.message || err}`))
			return null
		}
		return result
	}

	let streamLumaraResponse = async (message) => {
		let response = await ol.stream({ role: "user", content: message })
		if (!response?.body) {
			throw new Error("stream response did not include a readable body")
		}

		let reader = response.body.getReader()
		let decoder = new TextDecoder()
		let buffer = ""
		let responseText = ""

		let processLine = (line) => {
			if (!line || !line.startsWith("data:")) {
				return
			}

			let payload = line.slice(5).trim()
			if (!payload) {
				return
			}

			let data = null
			try {
				data = JSON.parse(payload)
			} catch (_err) {
				return
			}

			if (data.cancelled) {
				throw new Error("stream cancelled")
			}

			if (data.error) {
				let errorText = data?.error_data?.message || data?.error_data?.error || data.error || "stream error"
				throw new Error(errorText)
			}

			let token = ""
			if (data.type === "content") {
				token = `${data.content || data.text || ""}`
			} else if (!data.type && data.token) {
				token = `${data.token}`
			}

			if (token.length > 0) {
				responseText += token
				updateAgentStreamingDisplay(responseText)
			}
		}

		try {
			while (true) {
				let { done, value } = await reader.read()
				if (done) {
					break
				}

				buffer += decoder.decode(value, { stream: true })
				let lines = buffer.split("\n")
				buffer = lines.pop() || ""
				for (let line of lines) {
					processLine(line)
				}
			}

			buffer += decoder.decode()
			if (buffer.length > 0) {
				for (let line of buffer.split("\n")) {
					processLine(line)
				}
			}
		} finally {
			clearAgentStreamingDisplay()
		}

		return responseText
	}

	let ol = window.openlumaraClient

	return [
		{
			"name": "lumara_status",
			"description": "Check whether OpenLumara is running and its LLM API is connected. Returns the model name and connection details.",
			"args": {},
			"enabled": is_using_kcpp_with_open_lumara(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let result = await runAndReport("getStatus", () => ol.getStatus())
				if (!result) return
				if (result.connected) {
					addThought(currentChainOfThought, createSysPrompt,
						formatLumaraMessage(`status: connected. Model: ${result.model || "unknown"}.`))
				} else {
					addThought(currentChainOfThought, createSysPrompt,
						formatLumaraMessage(`status: not connected. ${result.error || ""} ${result.action || ""}`.trim()))
				}
			}
		},
		{
			"name": "lumara_send",
			"description": "Send a user message to OpenLumara and receive the AI assistant's response. The reply is added to the OpenLumara conversation history and displayed to the user.",
			"args": {
				"message": {
					description: "<the message text to send to OpenLumara>",
					type: "string"
				}
			},
			"enabled": is_using_kcpp_with_open_lumara(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
                const getMessagesSinceLastUserMessageAndShow = async () => {

                    let displayHandled = false;
                    let lastMessageProcessedFromLumara = localsettings.lastMessageProcessedFromLumara
                    let messageHistory = (await openlumaraClient.getMessagesSince(lastMessageProcessedFromLumara !== 0 ? lastMessageProcessedFromLumara + 1 : lastMessageProcessedFromLumara))?.messages;
                    if (!!messageHistory) {
                        let startPoint = messageHistory.reverse().find(msg => msg?.role === "user")?.index;
                        if (startPoint !== null && Number.isInteger(startPoint)) {
                            let messagesToShow = messageHistory.filter(msg => !!msg?.index && msg.index > startPoint).sort((a, b) => a.index > b.index ? 1 : -1)
                            if (messagesToShow.length > 0) {
                                messagesToShow.forEach(msg => {
                                    if (!!msg?.content) {
                                        if (msg.role === "user") {
                                            addThought(currentChainOfThought, createInstructPrompt, `Lumara - user: ${msg.content || ""}`)
                                        } else if (msg.role === "assistant") {
                                            addThought(currentChainOfThought, createAIPrompt, `Lumara: ${msg.content || ""}`)
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
                                                    }
                                                    catch (_err) { }
                                                    toolDetails += `\n\ntool response: ${respContent}`
                                                }
                                            }
                                            addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(toolDetails))
                                        })
                                    }
                                })
                                displayHandled = true;
                            }
							localsettings.lastMessageProcessedFromLumara = messagesToShow.reduce((a, c) => {
								return !!c?.index && c.index > a ? c.index : a
							}, lastMessageProcessedFromLumara)
                        }
                    }
                    return displayHandled;
                }

				let message = `${action?.args?.message || ""}`.trim()
				if (!message) {
					addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`send: no message provided, nothing sent.`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return
				}

    			window.eso.currentlyProcessingFromLumara = window.eso.currentlyProcessingFromLumara.then(async () => {
					try {
						if (!!localsettings?.agentStreamThinking) {
							let responseText = await runAndReport("stream", () => streamLumaraResponse(message))
							if (responseText === null) return
							if (`${responseText}`.trim().length === 0) {
								responseText = "[empty response]"
							}
							let displayHandled = await getMessagesSinceLastUserMessageAndShow()
							if (!displayHandled) {
								addThought(currentChainOfThought, createAIPrompt, `Lumara: ${responseText}`)
							}
						}
						else {
							let result = await runAndReport("sendMessage", () => ol.sendMessage({ role: "user", content: message }))
							if (!result) return
							let responseText = typeof result.response === "string"
								? result.response
								: (result.response?.content || objToText(result.response))
							
							let displayHandled = await getMessagesSinceLastUserMessageAndShow()
							if (!displayHandled) {
								addThought(currentChainOfThought, createAIPrompt, `Lumara: ${responseText}`)
							}
						}
					} catch (err) {
						addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`sendMessage failed ${err?.message || err}`))
						console.error("Error in lumara_send executor:", err)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					} finally {
						return Promise.resolve()
					}
				})
				await window.eso.currentlyProcessingFromLumara;
			}
		},
		{
			"name": "lumara_get_messages",
			"description": "Retrieve the full message history of the current OpenLumara chat.",
			"args": {},
			"enabled": is_using_kcpp_with_open_lumara(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let result = await runAndReport("getMessages", () => ol.getMessages())
				if (!result) return
				let messages = Array.isArray(result.messages) ? result.messages : []
				if (messages.length === 0) {
					addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`chat is empty (0 messages).`))
					return
				}
				let summary = messages.map(m => `[${m.role}] ${`${m.content || ""}`.slice(0, 200)}`).join("\n")
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`chat (${messages.length} messages):\n${summary}`))
			}
		},
		{
			"name": "lumara_list_chats",
			"description": "List all saved chats in OpenLumara, including their IDs, titles, and tags.",
			"args": {},
			"enabled": is_using_kcpp_with_open_lumara(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let result = await runAndReport("listChats", () => ol.listChats())
				if (!result) return
				let chats = Array.isArray(result.chats) ? result.chats : []
				if (chats.length === 0) {
					addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`no saved chats.`))
					return
				}
				let summary = chats.map(c =>
					`- id: ${c.id} | title: "${c.title}" | messages: ${c.message_count} | tags: [${(c.tags || []).join(", ")}]`
				).join("\n")
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`saved chats (${chats.length}):\n${summary}`))
			}
		},
		{
			"name": "lumara_new_chat",
			"description": "Create a new empty chat in OpenLumara, optionally with a title.",
			"args": {
				"title": {
					description: "<title for the new chat>",
					type: "string",
					optional: true
				}
			},
			"enabled": is_using_kcpp_with_open_lumara(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let title = `${action?.args?.title || ""}`.trim() || undefined
				let result = await runAndReport("newChat", () => ol.newChat(title))
				if (!result) return
				let chatTitle = result.chat?.title || title || "New Chat"
				let chatId = result.chat?.id || "unknown"
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`created new chat "${chatTitle}" (id: ${chatId}).`))
			}
		},
		{
			"name": "lumara_load_chat",
			"description": "Load an existing OpenLumara chat by its ID, making it the active chat.",
			"args": {
				"chat_id": {
					description: "<the ID of the chat to load>",
					type: "string"
				}
			},
			"enabled": is_using_kcpp_with_open_lumara(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let chatId = `${action?.args?.chat_id || ""}`.trim()
				if (!chatId) {
					addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`load chat: no chat_id provided.`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return
				}
				let result = await runAndReport("loadChat", () => ol.loadChat(chatId))
				if (!result) return
				if (!result.success) {
					addThought(currentChainOfThought, createSysPrompt,
						formatLumaraMessage(`load chat failed: ${result.error || "unknown error"}.`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return
				}
				let chat = result.chat || {}
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`loaded chat "${chat.title || chatId}" (${chat.total || 0} messages).`))
			}
		},
		{
			"name": "lumara_clear_chat",
			"description": "Clear all messages from the current OpenLumara chat, keeping the chat entry itself.",
			"args": {},
			"enabled": is_using_kcpp_with_open_lumara(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let result = await runAndReport("clearChat", () => ol.clearChat())
				if (!result) return
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`current chat cleared.`))
			}
		},
		{
			"name": "lumara_rename_chat",
			"description": "Rename the currently active OpenLumara chat.",
			"args": {
				"title": {
					description: "<new title for the current chat>",
					type: "string"
				}
			},
			"enabled": is_using_kcpp_with_open_lumara(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let title = `${action?.args?.title || ""}`.trim()
				if (!title) {
					addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`rename chat: no title provided.`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return
				}
				let result = await runAndReport("renameChat", () => ol.renameChat(title))
				if (!result) return
				if (!result.success) {
					addThought(currentChainOfThought, createSysPrompt,
						formatLumaraMessage(`rename chat failed: ${result.error || "unknown error"}.`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return
				}
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`current chat renamed to "${result.title || title}".`))
			}
		},
	]
}
