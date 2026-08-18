export const buildOpenlumaraCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		objToText,
	} = ctx

	let formatLumaraMessage = (message) => {
		let body = (message || "").trim();
		return `Lumara response: \n\n\`\`\`\n${body}\n\`\`\`\n\n`
		
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

	let ensureLumaraIdentity = async () => {
		if (typeof window.promptForOpenLumaraIdentity !== "function") {
			return true
		}

		let isAuthorized = false
		await window.promptForOpenLumaraIdentity(async () => {
			isAuthorized = true
		}, {
			baseUrl: window.openlumaraClient?.base_url,
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
		let payload = { role: "user", content: message }
		let socketMessageText = `${payload?.content || ""}`

		let getThinkTagPair = () => {
			let start = `${localsettings?.start_thinking_tag || "<think>"}`
			let stop = `${localsettings?.stop_thinking_tag || "</think>"}`
			return { start, stop }
		}

		let formatLumaraToolCalls = (toolCalls) => {
			if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
				return ""
			}
			let lines = ["[Lumara tool calls]"]
			toolCalls.forEach((call, idx) => {
				let fnName = `${call?.function?.name || call?.name || `tool_${idx + 1}`}`
				let fnArgs = `${call?.function?.arguments || call?.arguments || ""}`.trim()
				let fnResp = `${call?.response || ""}`.trim()
				lines.push(`${idx + 1}. ${fnName}${fnArgs ? `(${fnArgs})` : "()"}`)
				if (fnResp) {
					lines.push(`   response: ${fnResp}`)
				}
			})
			return lines.join("\n")
		}

		let renderTurnStreamToText = (turnObj) => {
			let turnMessages = Array.isArray(turnObj?.messages) ? turnObj.messages : []
			if (turnMessages.length === 0) {
				return ""
			}

			let reasoningParts = []
			let contentParts = []
			let toolSections = []
			let { start, stop } = getThinkTagPair()

			turnMessages.forEach(seg => {
				let segType = `${seg?.type || ""}`.toLowerCase()
				if (segType === "reasoning") {
					let text = `${seg?.reasoning_content || seg?.content || ""}`
					if (text) {
						reasoningParts.push(text)
					}
					return
				}
				if (segType === "tool_calls") {
					let section = formatLumaraToolCalls(seg?.tool_calls || [])
					if (section) {
						toolSections.push(section)
					}
					return
				}
				if (segType === "content") {
					let text = `${seg?.content || ""}`
					if (text) {
						contentParts.push(text)
					}
				}
			})

			let blocks = []
			if (reasoningParts.length > 0) {
				blocks.push(`${start}${reasoningParts.join("\n\n")}${stop}`)
			}
			if (toolSections.length > 0) {
				blocks.push(toolSections.join("\n\n"))
			}
			if (contentParts.length > 0) {
				blocks.push(contentParts.join(""))
			}

			return blocks.join("\n\n").trim()
		}

		let streamViaSocket = async () => {
			let ensureOpenSocket = async () => {
				if (ol.isSocketConnected()) {
					return ol.connectSocket()
				}

				let socket = ol.connectSocket()
				await new Promise((resolve, reject) => {
					let timeout = setTimeout(() => {
						cleanup()
						reject(new Error("OpenLumara WebSocket did not open in time"))
					}, 8000)

					let onOpen = () => {
						cleanup()
						resolve()
					}

					let onClose = () => {
						cleanup()
						reject(new Error("OpenLumara WebSocket closed before opening"))
					}

					let onError = () => {
						cleanup()
						reject(new Error("OpenLumara WebSocket failed to open"))
					}

					let cleanup = () => {
						clearTimeout(timeout)
						ol.offSocket("open", onOpen)
						ol.offSocket("close", onClose)
						ol.offSocket("error", onError)
					}

					ol.onSocket("open", onOpen)
					ol.onSocket("close", onClose)
					ol.onSocket("error", onError)
				})

				return socket
			}

			let responseText = ""
			let latestTurn = null
			let socket = await ensureOpenSocket()

			await new Promise((resolve, reject) => {
				let timeout = setTimeout(() => {
					cleanup()
					reject(new Error("OpenLumara WebSocket stream timed out"))
				}, 120000)

				let onTurnStream = (socketPayload) => {
					let turn = socketPayload?.turns && typeof socketPayload.turns === "object" ? socketPayload.turns : null
					if (!turn) {
						return
					}
					latestTurn = turn
					responseText = renderTurnStreamToText(turn)
					updateAgentStreamingDisplay(responseText)
				}

				let onComplete = () => {
					cleanup()
					resolve()
				}

				let onError = (socketPayload) => {
					cleanup()
					let errText = socketPayload?.error || socketPayload?.message || "stream error"
					reject(new Error(errText))
				}

				let onClose = () => {
					cleanup()
					reject(new Error("OpenLumara WebSocket closed during stream"))
				}

				let cleanup = () => {
					clearTimeout(timeout)
					ol.offSocket("turn_stream", onTurnStream)
					ol.offSocket("stream_complete", onComplete)
					ol.offSocket("error", onError)
					ol.offSocket("close", onClose)
				}

				ol.onSocket("turn_stream", onTurnStream)
				ol.onSocket("stream_complete", onComplete)
				ol.onSocket("error", onError)
				ol.onSocket("close", onClose)

				try {
					socket.send(JSON.stringify({ type: "user_message", content: socketMessageText }))
				} catch (err) {
					cleanup()
					reject(err)
				}
			})

			if ((!responseText || responseText.trim().length === 0) && latestTurn) {
				responseText = renderTurnStreamToText(latestTurn)
			}

			return responseText
		}

		try {
			return await streamViaSocket()
		} finally {
			clearAgentStreamingDisplay()
		}
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
				if (result?.server_ok) {
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
					let thinkStart = `${localsettings?.start_thinking_tag || "<think>"}`
					let thinkStop = `${localsettings?.stop_thinking_tag || "</think>"}`
					let formatToolCalls = (toolCalls) => {
						if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
							return ""
						}
						let lines = ["[Lumara tool calls]"]
						toolCalls.forEach((call, idx) => {
							let fnName = `${call?.function?.name || call?.name || `tool_${idx + 1}`}`
							let fnArgs = `${call?.function?.arguments || call?.arguments || ""}`.trim()
							let fnResp = `${call?.response || ""}`.trim()
							lines.push(`${idx + 1}. ${fnName}${fnArgs ? `(${fnArgs})` : "()"}`)
							if (fnResp) {
								lines.push(`   response: ${fnResp}`)
							}
						})
						return lines.join("\n")
					}

					let buildAssistantText = (msg) => {
						let blocks = []
						let reasoning = `${msg?.reasoning_content || ""}`.trim()
						if (reasoning) {
							blocks.push(`${thinkStart}${reasoning}${thinkStop}`)
						}
						let toolText = formatToolCalls(msg?.tool_calls || [])
						if (toolText) {
							blocks.push(toolText)
						}
						let content = `${msg?.content || ""}`
						if (content) {
							blocks.push(content)
						}
						return blocks.join("\n\n").trim()
					}

					let collapseMessagesByIndex = (messageList) => {
						let byIndex = new Map()
						let noIndex = []
						;(Array.isArray(messageList) ? messageList : [messageList]).forEach(msg => {
							if (!msg) {
								return
							}
							if (Number.isInteger(msg?.index)) {
								byIndex.set(msg.index, msg)
							} else {
								noIndex.push(msg)
							}
						})
						return [...byIndex.values(), ...noIndex]
					}

                    let displayHandled = false;
                    let lastMessageProcessedFromLumara = localsettings.lastMessageProcessedFromLumara
					let messageHistory = (await openlumaraClient.getMessagesSince(lastMessageProcessedFromLumara !== 0 ? lastMessageProcessedFromLumara + 1 : lastMessageProcessedFromLumara))?.messages;
					if (!Array.isArray(messageHistory)) {
						messageHistory = []
					}
					messageHistory = collapseMessagesByIndex(messageHistory)
                    if (!!messageHistory) {
						let startPoint = [...messageHistory].reverse().find(msg => msg?.role === "user" && Number.isInteger(msg?.index))?.index;
                        if (startPoint !== null && Number.isInteger(startPoint)) {
							let messagesToShow = messageHistory.filter(msg => Number.isInteger(msg?.index) && msg.index > startPoint).sort((a, b) => a.index > b.index ? 1 : -1)
                            if (messagesToShow.length > 0) {
                                messagesToShow.forEach(msg => {
									if (!!msg?.content || !!msg?.reasoning_content || (Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0)) {
                                        if (msg.role === "user") {
                                            addThought(currentChainOfThought, createInstructPrompt, `Lumara - user: ${msg.content || ""}`)
                                        } else if (msg.role === "assistant") {
										let assistantText = buildAssistantText(msg)
										if (assistantText) {
											addThought(currentChainOfThought, createAIPrompt, `Lumara: ${assistantText}`)
										}
                                        }
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
