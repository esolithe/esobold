export const buildOpenlumaraCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		objToText,
	} = ctx

	let formatLumaraMessage = (message) => `Lumara response: ${`${message || ""}`.trim()}`

	/** Shared helper — run an async call, add result to CoT, return the data. */
	let runAndReport = async (label, asyncCall) => {
		let result
		try {
			result = await asyncCall()
		} catch (err) {
			addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`${label} error: ${err?.message || err}`))
			return null
		}
		return result
	}

	let ol = window.openlumaraClient

	return [
		{
			"name": "ol_status",
			"description": "Check whether OpenLumara is running and its LLM API is connected. Returns the model name and connection details.",
			"args": {},
			"enabled": true,
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
			"name": "ol_send",
			"description": "Send a user message to OpenLumara and receive the AI assistant's response. The reply is added to the OpenLumara conversation history.",
			"args": {
				"message": {
					description: "<the message text to send to OpenLumara>",
					type: "string"
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let message = `${action?.args?.message || ""}`.trim()
				if (!message) {
					addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`send: no message provided, nothing sent.`))
					return
				}
				let result = await runAndReport("sendMessage", () => ol.sendMessage({ role: "user", content: message }))
				if (!result) return
				let responseText = typeof result.response === "string"
					? result.response
					: (result.response?.content || objToText(result.response))
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`response to "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}":\n${responseText}`))
			}
		},
		{
			"name": "ol_get_messages",
			"description": "Retrieve the full message history of the current OpenLumara chat.",
			"args": {},
			"enabled": true,
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
			"name": "ol_list_chats",
			"description": "List all saved chats in OpenLumara, including their IDs, titles, and tags.",
			"args": {},
			"enabled": true,
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
			"name": "ol_new_chat",
			"description": "Create a new empty chat in OpenLumara, optionally with a title.",
			"args": {
				"title": {
					description: "<title for the new chat>",
					type: "string",
					optional: true
				}
			},
			"enabled": true,
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
			"name": "ol_load_chat",
			"description": "Load an existing OpenLumara chat by its ID, making it the active chat.",
			"args": {
				"chat_id": {
					description: "<the ID of the chat to load>",
					type: "string"
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let chatId = `${action?.args?.chat_id || ""}`.trim()
				if (!chatId) {
					addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`load chat: no chat_id provided.`))
					return
				}
				let result = await runAndReport("loadChat", () => ol.loadChat(chatId))
				if (!result) return
				if (!result.success) {
					addThought(currentChainOfThought, createSysPrompt,
						formatLumaraMessage(`load chat failed: ${result.error || "unknown error"}.`))
					return
				}
				let chat = result.chat || {}
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`loaded chat "${chat.title || chatId}" (${chat.total || 0} messages).`))
			}
		},
		{
			"name": "ol_clear_chat",
			"description": "Clear all messages from the current OpenLumara chat, keeping the chat entry itself.",
			"args": {},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let result = await runAndReport("clearChat", () => ol.clearChat())
				if (!result) return
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`current chat cleared.`))
			}
		},
		{
			"name": "ol_rename_chat",
			"description": "Rename the currently active OpenLumara chat.",
			"args": {
				"title": {
					description: "<new title for the current chat>",
					type: "string"
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let title = `${action?.args?.title || ""}`.trim()
				if (!title) {
					addThought(currentChainOfThought, createSysPrompt, formatLumaraMessage(`rename chat: no title provided.`))
					return
				}
				let result = await runAndReport("renameChat", () => ol.renameChat(title))
				if (!result) return
				if (!result.success) {
					addThought(currentChainOfThought, createSysPrompt,
						formatLumaraMessage(`rename chat failed: ${result.error || "unknown error"}.`))
					return
				}
				addThought(currentChainOfThought, createSysPrompt,
					formatLumaraMessage(`current chat renamed to "${result.title || title}".`))
			}
		},
	]
}
