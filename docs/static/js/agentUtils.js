let createInstructPrompt = (prompt) => {
	return `${instructstartplaceholder}${prompt}${instructstartplaceholder_end}`
}

let createSysPrompt = (prompt) => {
	return `${instructsysplaceholder}${prompt}${instructsysplaceholder_end}`
}

let createAIPrompt = (prompt) => {
	return `${instructendplaceholder}${prompt}${instructendplaceholder_end}`
}

let addThought = (currentChainOfThought, wrapperHandler, prompt, onlyDisplay = false, onlyAdd = false) => {
	currentChainOfThought.push({ wrappedPrompt: wrapperHandler(prompt), prompt, onlyDisplay, onlyAdd})
}

let waitingFori2iSelection = false, i2i64 = undefined, originalClickImage = click_image;
click_image = (target, imghash, duplicate_idx) => {
	if (target && waitingFori2iSelection) {
		i2i64 = target.src;
		waitingFori2iSelection = false
	}
	else {
		originalClickImage(target, imghash, duplicate_idx)
	}
}

let preparePromptForImageGen = (prompt) => {
	return prompt.replaceAll(/\.+/g, ",").replaceAll(/_+/g, " ").replaceAll(/\n+/g, " ")
}

let waitForUserImageSelection = async (agentRunState) => {
	waitingFori2iSelection = true
	await new Promise((resolve) => {
		let intervalId = setInterval(() => {
			if (waitingFori2iSelection === false || agentRunState.endCurrent) {
				clearInterval(intervalId)
				resolve()
			}
		}, 1000)
	})
	let selected = `${i2i64 || ""}`
	i2i64 = undefined
	waitingFori2iSelection = false
	return selected
}

let kcppVoiceOptionsCache = ["kobo", "custom", "voicejson"]
let kcppVoiceOptionsFetchPromise = null

let fetchKcppVoiceOptionsForCommand = async (forceRefresh = false) => {
	if (!!kcppVoiceOptionsFetchPromise && !forceRefresh) {
		return await kcppVoiceOptionsFetchPromise
	}
	kcppVoiceOptionsFetchPromise = (async () => {
	let resp = await fetch(apply_proxy_url(custom_kobold_endpoint + koboldcpp_voices_endpoint), {
		method: "GET",
		headers: get_kobold_header(),
	})
	if (!resp.ok) {
		let bodyText = await resp.text().catch(() => "")
		throw new Error(`voice list fetch failed (${resp.status}) ${bodyText}`.trim())
	}
	let data = await resp.json()
	let voices = Array.isArray(data) ? data.map(voice => `${voice || ""}`.trim()).filter(voice => voice.length > 0) : []
	let nextVoices = [...voices, "custom", "voicejson"]
	kcppVoiceOptionsCache = nextVoices.length > 0 ? nextVoices : ["kobo", "custom", "voicejson"]
	return kcppVoiceOptionsCache
	})()
	try {
		return await kcppVoiceOptionsFetchPromise
	}
	finally {
		kcppVoiceOptionsFetchPromise = null
	}
}

let getKcppVoiceOptionsForCommand = () => {
	fetchKcppVoiceOptionsForCommand().catch(() => null)
	return [...kcppVoiceOptionsCache]
}

let resolveKcppVoiceForPayload = async (voiceArg) => {
	let selectedVoice = `${voiceArg || ""}`.trim()
	let availableVoices = await fetchKcppVoiceOptionsForCommand().catch(() => ["kobo", "custom", "voicejson"])
	if (selectedVoice === "") {
		selectedVoice = `${localsettings.kcpp_tts_voice || availableVoices[0] || "kobo"}`.trim()
	}
	if (!["custom", "voicejson"].includes(selectedVoice) && !availableVoices.includes(selectedVoice)) {
		selectedVoice = availableVoices.find(voice => !["custom", "voicejson"].includes(voice)) || localsettings.kcpp_tts_voice || "kobo"
	}
	let payload = {
		voice: selectedVoice,
		speaker_json: undefined,
	}
	if (selectedVoice === "custom") {
		payload.voice = `${document.getElementById("kcpp_tts_voice_custom")?.value || ""}`.trim()
	}
	if (selectedVoice === "voicejson" && !!localsettings.kcpp_tts_json) {
		payload.speaker_json = localsettings.kcpp_tts_json
	}
	return payload
}

let postKcppJson = async (endpoint, payload) => {
	let resp = await fetch(apply_proxy_url(custom_kobold_endpoint + endpoint), {
		method: "POST",
		headers: {
			...get_kobold_header(),
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload || {}),
	})
	if (!resp.ok) {
		let bodyText = await resp.text().catch(() => "")
		throw new Error(`${endpoint} failed (${resp.status}) ${bodyText}`.trim())
	}
	return resp
}

let overwriteWIFromAgent = (uniqueIdentifier, selectionKeys, content) => {
	let baseWI = {
		"key": selectionKeys.join(","),
		"keysecondary": "",
		"keyanti": "",
		"content": content,
		"comment": uniqueIdentifier,
		"folder": null,
		"selective": false,
		"constant": false,
		"probability": "100",
		"wigroup": "Agent",
		"widisabled": false
	}
	current_wi = current_wi.filter(wi => wi?.comment !== uniqueIdentifier)
	current_wi.push(baseWI)
}

let getTableNamesFromTextDB = () => {
	matcher = new RegExp("\\[DOCUMENT BREAK\\]\\[Table:\([^\\]]*?\)\\].*?\\[DOCUMENT BREAK\\]", "gmis")
	return [...documentdb_data.matchAll(matcher)].map(a => a[1])
}

let getRandomElemFromArray = (arr) => {
	return arr[Math.floor(Math.random() * arr.length)]
}

let getRandomChatOpponent = () => {
	return getRandomElemFromArray(localsettings.chatopponent.split("||$||"))
}

let objToText = (obj, depth = 0) => {
	// Hard recursion limit
	if (depth > 1000) {
		return ""
	}
	let baseIndent = "", output = ""
	for (let i = 0; i < depth; i++) {
		baseIndent += "\t"
	}
	if (obj == null)
	{
		output += `${baseIndent}null`
	}
	else
	{
		switch (typeof obj) {
			case "array":
			case "object":
				if (Array.isArray(obj)) {
					output += `${baseIndent}Array:\n${obj.map(elem => `${objToText(elem, depth + 2)}`).join("\n\n")}`
				}
				else {
					let keys = Object.keys(obj)
					output += keys.map(key => {
						return `${baseIndent}${key}:\n${objToText(obj[key], depth + 1)}`
					}).join("\n")
				}
				break
			default:
				output += `${baseIndent}${JSON.stringify(obj)}`
				break
		}
	}
	return output
}

let AGENT_COMMAND_GROUPS = {
	definitions: [
		{ key: "messaging", label: "Messaging", commands: ["send_message"] },
		{ key: "planning_input", label: "Planning and User Input", commands: ["userInput"] },
		{ key: "search_web", label: "Search and Web", commands: ["web_search", "search_history"] },
		{ key: "macros", label: "Macros", commands: ["create_macro", "run_macro", "run_macro_on_files", "get_macro_info"] },
		{ key: "world_state", label: "World and State", commands: ["add_to_history", "overwrite_world_information", "read_world_information", "overwrite_setting_overview", "overwrite_current_state", "overwrite_current_state_response"] },
		{ key: "filesystem", label: "Filesystem", commands: ["fs_generate_music", "fs_transcribe", "fs_generate_image", "describe_fs_image", "fs_list", "fs_search", "fs_semantic_search", "fs_metadata", "fs_url", "fs_content", "fs_download_info", "fs_write_text", "fs_write_lines", "fs_delete", "fs_move", "fs_copy", "fs_extract_zip", "fs_create_folder", "fs_delete_folder", "fs_open_embed", "fs_close_embed", "fs_generate_tts"] },
		{ key: "media", label: "Media", commands: ["describe_clicked_image", "generate_image", "music_prepare", "generate_tts"] },
		{ key: "utilities", label: "Utilities", commands: ["roll_dice", "get_random_terms_from_table", "evaluate_formula", "wordcount"] },
		{ key: "openlumara", label: "OpenLumara", commands: ["lumara_status", "lumara_send", "lumara_get_messages", "lumara_list_chats", "lumara_new_chat", "lumara_load_chat", "lumara_clear_chat", "lumara_rename_chat"] },
		{ key: "mcp", label: "MCP Tools", commands: [] },
		{ key: "misc", label: "Misc", commands: [] },
	],
}

let AGENT_COMMAND_GROUP_BY_NAME = AGENT_COMMAND_GROUPS.definitions.reduce((accumulator, groupDefinition) => {
	let groupKey = `${groupDefinition?.key || ""}`
	let commandNames = Array.isArray(groupDefinition?.commands) ? groupDefinition.commands : []
	commandNames.forEach(commandName => {
		accumulator[`${commandName || ""}`] = groupKey
	})
	return accumulator
}, {})

let getAgentCommandGroupFromName = (commandName) => {
	let normalizedName = `${commandName || ""}`.trim()
	if (normalizedName === "") {
		return "misc"
	}
	if (!!AGENT_COMMAND_GROUP_BY_NAME[normalizedName]) {
		return AGENT_COMMAND_GROUP_BY_NAME[normalizedName]
	}
	if (normalizedName.startsWith("fs_")) {
		return "filesystem"
	}
	return "misc"
}

let withAgentCommandGroups = (commands = []) => {
	return commands.map(command => {
		let group = getAgentCommandGroupFromName(command?.name)
		if (!!command?.group) {
			group = command.group
		}
		return objRefAssign({}, command, {
			group,
		})
	})
}

let groupAgentCommandsByFunctionality = (commands = []) => {
	let groups = {}
	AGENT_COMMAND_GROUPS.definitions.forEach(groupDefinition => {
		groups[groupDefinition.key] = []
	})
	withAgentCommandGroups(commands).forEach(command => {
		let group = command?.group || "utilities"
		if (!Array.isArray(groups[group])) {
			groups[group] = []
		}
		groups[group].push(command)
	})
	return groups
}

window.eso = window.eso || {}
window.eso.agentCommandGroupDefinitions = AGENT_COMMAND_GROUPS.definitions
window.eso.groupAgentCommandsByFunctionality = groupAgentCommandsByFunctionality
let getCommands = (agentRunState) => {
	let { currentChainOfThought } = agentRunState
	let requestUserSelectedImageForAgent = async (runState, chainOfThought, promptText) => {
		addThought(chainOfThought, createSysPrompt, promptText, true)
		let { agentVisualiser } = runState
		if (!!runState?.printToConsole && runState?.logger !== undefined)
		{
			runState.logger.printPendingLogs()
		}
		if (typeof runState.agentVisualiser === "function") {
			await runState.agentVisualiser(objRefAssign({}, runState, { agentRunState: runState }))
		}
		return await waitForUserImageSelection(agentRunState)
	}
	let waitForAgentImageGeneration = async (imageId) => {
		await new Promise(resolve => {
			let complete = false
			image_db[imageId].callback = () => complete = true
			let intervalId = setInterval(() => {
				if (complete || agentRunState.endCurrent) {
					clearInterval(intervalId)
					resolve()
				}
			}, 1000)
		})
	}

	let builderRegistry = window.eso?.agentCommandGroupBuilders || {}
	let sharedCtx = {
		agentRunState,
		currentChainOfThought,
		addThought,
		createAIPrompt,
		createSysPrompt,
		createInstructPrompt,
		objToText,
		objRefAssign,
		preparePromptForImageGen,
		requestUserSelectedImageForAgent,
		waitForAgentImageGeneration,
		resolveKcppVoiceForPayload,
		getKcppVoiceOptionsForCommand,
	}

	let commands = AGENT_COMMAND_GROUPS.definitions.flatMap(groupDefinition => {
		let buildForGroup = builderRegistry[groupDefinition.key]
		if (typeof buildForGroup === "function") {
			return buildForGroup(sharedCtx) || []
		}
		return []
	})

	let groupedCommands = groupAgentCommandsByFunctionality(commands)
	let orderedKeys = [...AGENT_COMMAND_GROUPS.definitions.map(groupDefinition => groupDefinition.key), ...Object.keys(groupedCommands).filter(groupKey => !AGENT_COMMAND_GROUPS.definitions.some(groupDefinition => groupDefinition.key === groupKey))]
	let orderedCommands = []
	orderedKeys.forEach(groupKey => {
		orderedCommands.push(...(groupedCommands[groupKey] || []))
	})
	return orderedCommands
}

window.eso.originalGetCommands = getCommands;

let getEnabledCommands = (agentRunState, overrides = [], isUsingWhitelist = false) => {
	let disabledAgentTools = Array.isArray(localsettings?.disabled_agent_tools) ? localsettings.disabled_agent_tools : []
	let enabledCommands = getCommands(agentRunState).filter(command => (((!isUsingWhitelist && !!command?.enabled) || overrides.includes(command.name)) && !disabledAgentTools.includes(command.name)))
	let forbiddenAgentCommands = getDocumentFromTextDB('Forbidden agent commands')
	if (!isUsingWhitelist && forbiddenAgentCommands !== null) {
		let commandsToExclude = forbiddenAgentCommands.split("|")
		enabledCommands = enabledCommands.filter(command => !commandsToExclude.includes(command.name))
	}
	return enabledCommands
}

let getReasoningCommand = (agentRunState, overrides = [], isUsingWhitelist = false) => {
	let {agentName} = agentRunState
	let whoToRespondAsOptions = !!agentName ? [agentName] : (localsettings.inject_chatnames_instruct ? localsettings.chatopponent.split("||$||") : undefined)
	if (!agentName && localsettings.inject_chatnames_instruct && window.eso.currentChatOpponentOverride !== null) {
		whoToRespondAsOptions = [window.eso.currentChatOpponentOverride]
	}
	window.eso.currentChatOpponentOverride = null;
	return [
		{
			"name": "plan_actions",
			"description": "Defines a list of actions to respond to a user instruction.",
			"args": {
				"whoToRespondAs": {
					description: "<whose perspective is the response going to be written from>",
					enum: whoToRespondAsOptions,
					type: "string",
					skip: !whoToRespondAsOptions
				},
				"responsePlanOverview": {
					type: "string",
					description: "<short overview of what the user asked for, planned actions and why the order makes sense - this must be specific to the last user instruction>"
				},
				"orderOfActions": {
					type: "array",
					description: "<array of actions needed to complete the instruction and their objectives>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								action: {
									type: "string",
									enum: getEnabledCommands(agentRunState, overrides, isUsingWhitelist).map(c => c.name)
								},
								objective: {
									type: "string"
								}
							},
							required: ["action", "objective"]
						},
						minItems: 1,
						maxItems: Number(localsettings.agentCOTMax)
					}
				}
			},
			"enabled": true,
			"executor": (action) => {
				return false
			}
		}
	]
}

let toJsonSchema = (obj, currentRef = {}) => {
	switch (typeof obj) {
		case "string":
			currentRef.type = "string"
			break
		case "number":
		case "bigint":
			currentRef.type = "number"
			break
		case "boolean":
			currentRef.type = "boolean"
			break
		case "object":
			if (Array.isArray(obj)) {
				currentRef.type = "array"
			}
			else {
				currentRef.type = "object"
				currentRef.properties = {}
				currentRef.required = []
				for (key in obj) {
					currentRef.properties[key] = {}
					currentRef.required.push(key)
					toJsonSchema(obj[key], currentRef.properties[key])
				}
			}
			break
		case "function":
		case "undefined":
		case "symbol":
			break
	}

	return currentRef
}

let getCommandsSchema = (commands = getEnabledCommands()) => {
	let baseCommandStructure = {
		"command": {
			"name": "string",
			"args": {}
		}
	}

	let commandsSchema = commands.map(command => {
		let elem = toJsonSchema(baseCommandStructure)
		let args = elem.properties.command.properties.args;
		if (command.args !== null)
		{
			elem.properties.command.properties.name["pattern"] = `^${command.name}$`
			for (arg in command.args) {
				if (!command.args[arg]?.skip) {
					if (typeof command.args[arg] === "object" && !!command.args[arg]?.format) {
						let formatToUse = typeof command.args[arg]?.format === "string" ? toJsonSchema(JSON.parse(command.args[arg]?.format)) : command.args[arg]?.format
						args.properties[arg] = formatToUse
					}
					else if (typeof command.args[arg] === "object" && !!command.args[arg]?.type) {
						args.properties[arg] = {
							type: command.args[arg].type
						}

						let propsToEdit = args.properties[arg]
						if (command.args[arg].type === "array") {
							args.properties[arg].items = {
								"type": "string"
							}
							propsToEdit = args.properties[arg].items

							if (!!command.args[arg]?.itemType) {
								propsToEdit.type = command.args[arg]?.itemType
							}
							if (!!command.args[arg]?.uniqueItems) {
								args.properties[arg].pattern = command.args[arg]?.uniqueItems
							}
						}

						if (!!command.args[arg]?.enum) {
							propsToEdit.enum = command.args[arg]?.enum
						}
						if (!!command.args[arg]?.pattern) {
							propsToEdit.pattern = command.args[arg]?.pattern
						}
					} else {
						args.properties[arg] = {
							type: "string",
						}
					}
				}

				if (!command.args[arg]?.optional) {
					args.required.push(arg)
				}
			}

		}
		else {
			args.properties["noArgs"] = {
				type: "string",
				pattern: `^true$`
			}
			args.required.push("noArgs")
		}
		return elem
	})

	return {
		"anyOf": commandsSchema
	}
}

let getCommandsGNBF = async (commands = getEnabledCommands()) => {
	let opt = {
		method: 'POST', // or 'PUT'
		headers: get_kobold_header(),
		body: JSON.stringify({ schema: getCommandsSchema(commands) }),
	}

	return fetch(`${custom_kobold_endpoint}/api/extra/json_to_grammar`, opt)
		.then((response) => response.json())
		.then(resp => {
			if (!!resp && !!resp?.success) {
				return resp.result
			}
			else {
				// Generic JSON response if it fails
				return "root   ::= object\nvalue  ::= object | array | string | number | (\"true\" | \"false\" | \"null\") ws\n\nobject ::=\n  \"{\" ws (\n            string \":\" ws value\n    (\",\" ws string \":\" ws value)*\n  )? \"}\" ws\n\narray  ::=\n  \"[\" ws (\n            value\n    (\",\" ws value)*\n  )? \"]\" ws\n\nstring ::=\n  \"\\\"\" (\n    [^\"\\\\\\x7F\\x00-\\x1F] |\n    \"\\\\\" ([\"\\\\bfnrt] | \"u\" [0-9a-fA-F]{4}) # escapes\n  )* \"\\\"\" ws\n\nnumber ::= (\"-\"? ([0-9] | [1-9] [0-9]{0,15})) (\".\" [0-9]+)? ([eE] [-+]? [0-9] [1-9]{0,15})? ws\n\n# Optional space: by convention, applied in this grammar after literal chars when allowed\nws ::= | \" \" | \"\\n\" [ \\t]{0,20}"
			}
		})
}

// https://github.com/Wladastic/mini_autogpt is the original repo for these prompts - They have been modified with some attempted improvements.  It is MIT licensed.
let getCommandsAsText = (commands = getEnabledCommands()) => {
	return commands.map(command => {
		let baseCommand = `Command: ${command.name} (command output is ${!!command?.outputVisibleToUser ? "visible" : "invisible"} to the user)\nDescription: ${command.description}`
		if (!!command.args) {
			let args = Object.keys(command.args).filter(key => {
				return !command.args[key]?.skip
			}).map(key => {
				let value = command.args[key];
				return typeof value === "object" ? `\t${key}: ${value.description}` : `\t${key}: ${value}`
			}).join("\n")
			baseCommand += `\nArguments:\n${args}`
		}
		else {
			baseCommand += "\nArguments: None\n"
		}
		return baseCommand
	}).join("\n\n").trim();
}

let checkFinalThoughtsPrompt = `Action: {"command":{"name":"thought","args":{"message":"I must make sure that I respond to the user with \"send_message\""}}}`

let commandsToOAITools = (commands) => {
	return commands.map(command => {
		let properties = {}
		let required = []

		if (command.args !== null) {
			for (let argName in command.args) {
				let argDef = command.args[argName]
				if (argDef?.skip) continue

				let prop = {}
				if (typeof argDef === 'object') {
					if (argDef.description) prop.description = argDef.description
					if (argDef.format) {
						let fmt = typeof argDef.format === 'string' ? JSON.parse(argDef.format) : argDef.format
						Object.assign(prop, fmt)
					} else if (argDef.type) {
						prop.type = argDef.type
						if (argDef.enum) prop.enum = argDef.enum
						if (argDef.type === 'array') {
							prop.items = { type: argDef.itemType || 'string' }
							if (argDef.minItems !== undefined) prop.minItems = argDef.minItems
							if (argDef.maxItems !== undefined) prop.maxItems = argDef.maxItems
						}
						if (argDef.pattern) prop.pattern = argDef.pattern
					} else {
						prop.type = 'string'
					}
				} else {
					prop.type = 'string'
				}

				properties[argName] = prop
				if (!argDef?.optional) required.push(argName)
			}
		}

		let params = { type: 'object', properties }
		if (required.length > 0) params.required = required

		return {
			type: 'function',
			function: {
				name: command.name,
				description: command.description,
				parameters: params
			}
		}
	})
}