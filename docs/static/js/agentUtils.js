let createInstructPrompt = (prompt) => {
	return `${instructstartplaceholder}${prompt}${instructstartplaceholder_end}`
}

let createSysPrompt = (prompt) => {
	return `${instructsysplaceholder}${prompt}${instructsysplaceholder_end}`
}

let createAIPrompt = (prompt) => {
	return `${instructendplaceholder}${prompt}${instructendplaceholder_end}`
}

let currentChainOfThought = []
let addThought = (wrapperHandler, prompt, onlyDisplay = false, onlyAdd = false) => {
	thought = wrapperHandler(prompt)
	if (!onlyDisplay) {
		currentChainOfThought.push(thought)
	}
	if (!onlyAdd) {
		gametext_arr.push(thought.replace(/\\\\/g, ""))
		render_gametext()
	}
}

let waitingFori2iSelection = false, i2i64 = undefined, originalClickImage = click_image;
click_image = (target, imghash) => {
	if (target && waitingFori2iSelection) {
		i2i64 = target.src;
		waitingFori2iSelection = false
	}
	else {
		originalClickImage(target, imghash)
	}
}

let preparePromptForImageGen = (prompt) => {
	return prompt.replaceAll(/\.+/g, ",").replaceAll(/_+/g, " ").replaceAll(/\n+/g, " ")
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

let mostRecentChatOpponent = ""
let resetChatOpponentToRandom = () => {
	mostRecentChatOpponent = getRandomElemFromArray(localsettings.chatopponent.split("||$||"))
	return mostRecentChatOpponent
}

let getChatOpponentForAgent = () => {
	return localsettings.inject_chatnames_instruct ? mostRecentChatOpponent : ""
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
	return output
}

let wordCountEnabled = false
let getCommands = () => {
	return [
		{
			"name": "ask_user",
			"description": "Ask the user for input. Optionally, suggested responses can be provided to the user as well.",
			"args": {
				"whoToSendMessageAs": {
					description: "<whose perspective is the response written from>",
					pattern: (localsettings.inject_chatnames_instruct ? `^${getChatOpponentForAgent()}$` : undefined),
					type: "string",
					skip: !localsettings.inject_chatnames_instruct
				},
				"message": "<message that prompts the user for input>",
				"suggestionsToPickFrom": {
					description: "<suggestions written from the user's perspective which they can pick from for their next action>",
					type: "array",
				}
			},
			"enabled": false,
			"outputVisibleToUser": true,
			"executor": (action) => {
				clearSuggestions()
				let suggestions = action?.args?.suggestionsToPickFrom
				if (!!suggestions && Array.isArray(suggestions)) {
					try {
						setSuggestions(suggestions.map(String))
					}
					catch {
						// Do not care about an error here, it's a nice to have if the suggestions show
					}
				}
				let prompt = localsettings.inject_chatnames_instruct ? `Request for user input by ${action?.args?.whoToSendMessageAs}: ${action?.args?.message}` : `Request for user input: ${action?.args?.message}`
				addThought(createSysPrompt, prompt)
				return currentOrderOfActionsOverall.length === 0
			}
		},
		{
			"name": "send_message",
			"description": "Sends text to the user. When asking for user input include suggestions for them to respond with.",
			"args": {
				"whoToSendMessageAs": {
					description: "<whose perspective is the response written from>",
					pattern: (localsettings.inject_chatnames_instruct ? `^${getChatOpponentForAgent()}$` : undefined),
					type: "string",
					skip: !localsettings.inject_chatnames_instruct
				},
				"messages": {
					description: "<text to send>",
					type: "array",
					items: {
						type: "string",
					},
					minItems: 1,
					maxItems: 5
				},
				"suggestionsToPickFrom": {
					description: "<suggestions written from the user's perspective which they can pick from for their next action>",
					type: "array",
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": (action) => {
				if (!!action?.args?.messages) {
					clearSuggestions()
					action?.args?.messages.forEach(message => {
						addThought(createAIPrompt, localsettings.inject_chatnames_instruct ? `${action?.args?.whoToSendMessageAs}: ${message}` : message)
					})

					let suggestions = action?.args?.suggestionsToPickFrom
					if (!!suggestions && Array.isArray(suggestions)) {
						try {
							let actualSuggestions = suggestions.map(String).filter(text => text.trim().length > 0)
							if (actualSuggestions.length > 0) {
								setSuggestions(actualSuggestions)
								return !!localsettings?.agentStopOnRequestForInput
							}
						}
						catch {
							// Do not care about an error here, it's a nice to have if the suggestions show
						}
					}
				}
			}
		},
		{
			"name": "stop_thinking",
			"description": "Ends the current chain of thought. Can only be used after a \"send_message\" action.",
			"args": null,
			"enabled": false,
			"executor": (action) => {
				addThought(createSysPrompt, `Stop thinking action confirmed`)
				return true
			}
		},
		{
			"name": "web_search",
			"description": "search the web for keyword",
			"args": {
				"query": "<query to research>"
			},
			"enabled": localsettings.websearch_enabled,
			"executor": async (action) => {
				await (new Promise((resolve, reject) => { PerformWebsearch(`${action?.args?.query}`, resolve) }));
				let webResp = objToText(lastSearchResults);
				addThought(createSysPrompt, `Web search results: \n${webResp, 1}`)
			}
		},
		{
			"name": "roll_dice",
			"description": "Rolls a number of dice with the same amount of sides.",
			"args": {
				"numDice": {
					description: "<number of dice>",
					type: "integer"
				},
				"numSides": {
					description: "<number of sides on the dice>",
					type: "integer"
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": (action) => {
				let numDice = action?.args?.numDice
				let numSides = action?.args?.numSides
				if (!!numDice && !!numSides) {
					let results = []
					for (let roll = 0; roll < numDice; roll++) {
						results.push(Math.ceil(Math.random() * numSides))
					}
					addThought(createSysPrompt, `Rolled ${numDice} dice with ${numSides} sides: ${results.join(", ")}`)
				}
				else {
					addThought(createSysPrompt, `Could not roll dice as the format was incorrect`)
				}
			}
		},
		{
			"name": "get_random_terms_from_table",
			"description": "Gets random terms from a user defined table",
			"args": {
				"numOfTerms": {
					description: "<number of terms to get>",
					type: "integer"
				},
				"tableToUse": {
					description: "<number of table to get terms from>",
					type: "string",
					enum: getTableNamesFromTextDB()
				}
			},
			"outputVisibleToUser": true,
			"enabled": getTableNamesFromTextDB().length > 0,
			"executor": (action) => {
				let numOfTerms = action?.args?.numOfTerms
				let tableToUse = action?.args?.tableToUse
				if (!!numOfTerms && !!tableToUse) {
					let results = []
					let tableElems = getDocumentFromTextDB(`Table:${tableToUse}`).split("\n").map(c => c.trim()).filter(c => c.length > 0)
					for (let roll = 0; roll < numOfTerms; roll++) {
						results.push(getRandomElemFromArray(tableElems))
					}
					addThought(createSysPrompt, `Got ${numOfTerms} terms from ${tableToUse}: ${results.join(", ")}`)
				}
				else {
					addThought(createSysPrompt, `Could not get terms as the format was incorrect`)
				}
			}
		},
		{
			"name": "evaluate_formula",
			"description": "Evaluates a mathematical formula and returns the result. All variables must be inputed as numbers, text is not supported.",
			"args": {
				"formula": "<mathematical formula to evaluate>"
			},
			"enabled": true,
			"executor": (action) => {
				let formula = action?.args?.formula
				if (!!formula) {
					addThought(createSysPrompt, `Formula evaluation result: ${math.evaluate(formula)}`)
				}
				else {
					addThought(createSysPrompt, `Formula evaluation could not be completed as no formula was provided`)
				}
			}
		},
		{
			"name": "add_to_history",
			"description": "Adds a block of text to history. It should include any necessary keywords for searching.",
			"args": {
				"text": "<text to add>",
				"keywords": {
					description: "<keywords to help with searching>",
					type: "array",
					itemType: "string",
					minItems: 1,
				}
			},
			"enabled": documentdb_provider != "0",
			"executor": (action) => {
				let textToAdd = action?.args?.text
				let keywords = action?.args?.keywords
				if (!!textToAdd) {
					keywords = !!keywords && Array.isArray(keywords) ? `Keywords: ${keywords.join(", ")}\n\n` : ""
					documentdb_data = `${documentdb_data}[DOCUMENT BREAK]${keywords}${textToAdd}[DOCUMENT BREAK]`
					addThought(createSysPrompt, `Text has been added to history`)
				}
				else {
					addThought(createSysPrompt, `Text was empty - nothing added to history`)
				}
			}
		},
		{
			"name": "overwrite_world_information",
			"description": "Overwrites an entry describing an entity. The information is stored under a unique identifier. This information is included when certain keywords are mentioned. This does not show the information to the user.",
			"args": {
				"uniqueIdentifier": "<unique identifier (such as a characters name, location etc)>",
				"keywords": {
					description: "<keywords to help with searching - at least one must be provided>",
					type: "array",
					itemType: "string",
					minItems: 1,
				},
				"text": "<descriptive text which by itself provides all needed information to define the entity>"
			},
			"enabled": true,
			"executor": (action) => {
				let uniqueIdentifier = action?.args?.uniqueIdentifier
				let keywords = action?.args?.keywords
				let textToAdd = action?.args?.text
				if (!!uniqueIdentifier && !!textToAdd) {
					uniqueIdentifier = uniqueIdentifier.toLowerCase()
					keywords = !!keywords && Array.isArray(keywords) ? keywords : [uniqueIdentifier]
					overwriteWIFromAgent(uniqueIdentifier, keywords, textToAdd)
					addThought(createSysPrompt, `Text has been added to world info: ${uniqueIdentifier}`)
				}
				else {
					addThought(createSysPrompt, `Text was empty - nothing added to world info`)
				}
			}
		},
		{
			"name": "overwrite_setting_overview",
			"description": "Overwrites the existing setting overview with a new set of instructions. Only use this when explicitly requested by the user.",
			"args": {
				"text": "<new overview about the setting>"
			},
			"enabled": true,
			"executor": (action) => {
				let systemPrompt = action?.args?.text
				if (!!systemPrompt) {
					current_memory = `{{[SYSTEM]}}${systemPrompt}{{[SYSTEM_END]}}`
					addThought(createSysPrompt, `Setting overview has been overwritten`)
				}
				else {
					addThought(createSysPrompt, `No setting overview provided, nothing has been overwritten`)
				}
			}
		},
		{
			"name": "overwrite_current_state",
			"description": "Overwrites the existing stored state with new text. The current stored state is sent with every action.",
			"args": {
				"text": {
					description: "<new state>",
					format: getDocumentFromTextDB('StateFormat')
				}
			},
			"enabled": true,
			"executor": (action) => {
				let newState = action?.args?.text
				if (typeof newState === "object") {
					newState = JSON.stringify(newState)
				}
				if (!!newState) {
					replaceDocumentFromTextDB('State', newState)
					addThought(createSysPrompt, `Current state has been overwritten`)
				}
				else {
					addThought(createSysPrompt, `No state provided, nothing has been overwritten`)
				}
			}
		},
		{
			"name": "overwrite_current_state_response",
			"description": "The current state can be overwritten by the overwrite_current_state command. Providing a JSON object to this function will enforce a particular response format when overriding the state.",
			"args": {
				"json": "<format which should be used when overwriting the current state>"
			},
			"enabled": true,
			"executor": (action) => {
				let newStateFormat = action?.args?.json
				try {
					let newStateFormatAsJson = JSON.parse(newStateFormat)
					if (!!newStateFormatAsJson) {
						replaceDocumentFromTextDB('StateFormat', JSON.stringify(newStateFormatAsJson))
						addThought(createSysPrompt, `Current state format has been overwritten`)
					}
					else {
						addThought(createSysPrompt, `No valid state format provided, nothing has been overwritten`)
					}
				}
				catch (e) {
					addThought(createSysPrompt, `No valid state format provided, nothing has been overwritten`)
					// Surpress error
				}
			}
		},
		{
			"name": "overwrite_current_action_chain",
			"description": "Overwrites the existing order of actions. After a user input, the order of actions will be enforced if it is set. Actions must be provided as an array in the order they should be taken. If there are multiple actions which can be taken (an OR), use a '|' delimiter between the options in the string. Provide an empty array to allow free actions.",
			"args": {
				"orderOfActions": {
					description: "<an array of actions to take after a user input>",
					type: "array"
				}
			},
			"enabled": false,
			"executor": (action) => {
				let orderOfActions = action?.args?.orderOfActions
				if (!!orderOfActions && Array.isArray(orderOfActions)) {
					if (orderOfActions.length === 0) {
						replaceDocumentFromTextDB('Order of actions', "")
						addThought(createSysPrompt, `Current order of actions has been cleared`)
					}
					else {
						replaceDocumentFromTextDB('Order of actions', [...orderOfActions.filter(acts => acts.split("|").find(act => getCommands().map(command => command.name).includes(act))), "stop_thinking"].join(","))
						addThought(createSysPrompt, `Current order of actions has been overwritten`)

					}
					return true
				}
				else {
					addThought(createSysPrompt, `No order of actions provided, nothing has been overwritten`)
				}
			}
		},
		{
			"name": "search_history",
			"description": "Searches history for a series of keywords.",
			"args": {
				"searchString": "<string to search for>"
			},
			"enabled": documentdb_provider != "0",
			"executor": async (action) => {
				let searchHistoryString = action?.args?.searchString
				if (!!searchHistoryString) {
					let contentToSearch = documentdb_data
					if (!!documentdb_searchhistory) {
						contentToSearch += `\n\n[DOCUMENT BREAK][Chatlog history]${concat_gametext(true)}[DOCUMENT BREAK]`
					}
					let ltmSnippets = await DatabaseMinisearch(contentToSearch, searchHistoryString, "");
					if (ltmSnippets.length === 0) {
						addThought(createSysPrompt, `History search performed: Nothing found`)
					}
					else {
						let ltmContent = "History search performed:";
						for (let i = 0; i < ltmSnippets.length; ++i) {
							ltmContent += getInfoSnippet(ltmSnippets[i]);
						}
						addThought(createSysPrompt, ltmContent)
					}
				}
				else {
					addThought(createSysPrompt, `Search string was empty, no search performed`)
				}
			}
		},
		{
			"name": "wordcount",
			"description": "Enables or disables a word count for each 'ask_user', 'thought' or 'send_message'.",
			"args": {
				"state": {
					description: "<true or false>",
					type: "boolean"
				}
			},
			"enabled": true,
			"executor": (action) => {
				let wordCountState = action?.args?.state
				wordCountEnabled = !!wordCountState
				addThought(createSysPrompt, `Word count is ${wordCountEnabled ? "enabled" : "disabled"}`)
			}
		},
		{
			"name": "describe_image",
			"description": "Describes a user provided image. It does not provide the original prompt used to generate the image.",
			"args": {
				"question": "<question to ask about image>"
			},
			"enabled": is_using_kcpp_with_vision(), // Only enabled if local endpoint exists / is in use
			"executor": async (action) => {
				let analysisPrompt = "Describe the image in detail. Transcribe and include any text from the image in the description."
				if (!!action?.args?.question) {
					analysisPrompt += `Specifically please focus on:\n\n${action?.args?.question}`
				}
				if (!!analysisPrompt) {
					waitingFori2iSelection = true
					addThought(createSysPrompt, `Please click an image as a source for image analysis`, true)

					let waitForI2ILoop = () => {
						return new Promise((resolve, reject) => {
							let intervalId = setInterval(() => {
								if (waitingFori2iSelection === false || endCurrent) {
									clearInterval(intervalId)
									resolve()
								}
							}, 1000)
						})
					}
					await waitForI2ILoop()
					if (!!i2i64) {
						let parts = i2i64.split(',');
						if (parts.length === 2 && parts[0].startsWith('data:image')) {
							i2i64 = parts[1];
						}
						let analysisResult = await generateAndGetTextFromPrompt(`${createInstructPrompt(analysisPrompt)}${instructendplaceholder}${!!localsettings?.inject_jailbreak_instruct ? localsettings.custom_jailbreak_text : ""}`, undefined, [i2i64])
						addThought(createSysPrompt, `Image analysed: ${analysisResult}`)
					}
					else {
						addThought(createSysPrompt, `User did not select an image - no image analysed`)
					}
					i2i64 = undefined;
					waitingFori2iSelection = false;
				}
			}
		},
		{
			"name": "generate_image",
			"description": "Generates a new image from scratch or edits an existing image. Be specific in the prompt about physical characteristics and settings as names of people may not be known.",
			"args": {
				"edit_existing_image": {
					description: "<edits an existing image when set to true (img2img)>",
					type: "boolean"
				},
				"prompt": "<prompt to generate image with - when editing only mention the changed parts of the image>",
				"aspect": {
					type: "string",
					description: "<aspect ratio - must be \"landscape\", \"portrait\" or \"square\">"
				}
			},
			"outputVisibleToUser": true,
			"enabled": localsettings.generate_images_mode == 2, // Only enabled if local endpoint exists / is in use
			"executor": async (action) => {
				let prompt = action?.args?.prompt
				let aspect = action?.args?.aspect
				if (!!prompt) {
					if (!!action?.args?.edit_existing_image) {
						waitingFori2iSelection = true
						addThought(createSysPrompt, `Please click an image as a source for img2img generation`, true)

						let waitForI2ILoop = () => {
							return new Promise((resolve, reject) => {
								let intervalId = setInterval(() => {
									if (waitingFori2iSelection === false || endCurrent) {
										clearInterval(intervalId)
										resolve()
									}
								}, 1000)
							})
						}
						await waitForI2ILoop()
						if (!!i2i64) {
							generate_new_image(preparePromptForImageGen(prompt), i2i64, true, calcImageSizing(aspect))
							addThought(createSysPrompt, `Image generated`)
						}
						else {
							addThought(createSysPrompt, `User did not select an image - no image generated`)
						}
						i2i64 = undefined;
						waitingFori2iSelection = false;
					}
					else {
						generate_new_image(preparePromptForImageGen(prompt), undefined, true, calcImageSizing(aspect))
						addThought(createSysPrompt, `Image generated`)
					}
				}
				else {
					addThought(createSysPrompt, `No prompt provided, image not generated`)
				}
			}
		},
		{
			"name": "generate_image_based_on_another_image",
			"description": "Generates an image using AI based on a prompt and an input image. Will prompt the user to select an image. Be specific in the prompt about physical characteristics and settings as names of people may not be known.",
			"args": {
				"prompt": "<prompt to generate image with>",
				"aspect": {
					type: "string",
					description: "<aspect ratio - must be \"landscape\", \"portrait\" or \"square\">"
				}
			},
			"enabled": false, // localsettings.generate_images_mode == 2, // Only enabled if local endpoint exists / is in use
			"executor": async (action) => {
				let i2iPrompt = action?.args?.prompt
				if (!!i2iPrompt) {
					waitingFori2iSelection = true
					addThought(createSysPrompt, `Please click an image as a source for img2img generation`, true)

					let waitForI2ILoop = () => {
						return new Promise((resolve, reject) => {
							let intervalId = setInterval(() => {
								if (waitingFori2iSelection === false || endCurrent) {
									clearInterval(intervalId)
									resolve()
								}
							}, 1000)
						})
					}
					await waitForI2ILoop()
					if (!!i2i64) {
						let aspectI2I = action?.args?.aspect
						generate_new_image(preparePromptForImageGen(i2iPrompt), i2i64, true, calcImageSizing(aspectI2I))
						addThought(createSysPrompt, `Image generated`)
					}
					else {
						addThought(createSysPrompt, `User did not select an image - no image generated`)
					}
					i2i64 = undefined;
					waitingFori2iSelection = false;
				}
				else {
					addThought(createSysPrompt, `No prompt provided, image not generated`)
				}
			}
		},
		{
			"name": "speak",
			"description": "Say something to the user using text to speech.",
			"args": {
				"textToSay": "<text to say>"
			},
			"outputVisibleToUser": true,
			"enabled": localsettings.speech_synth == KCPP_TTS_ID, // Only enabled if local endpoint exists / is in use
			"executor": (action) => {
				let textToSay = action?.args?.textToSay
				if (!!textToSay) {
					tts_speak(textToSay)
					addThought(createSysPrompt, `Text has been spoken`)
				}
				else {
					addThought(createSysPrompt, `No text provided, nothing has been said`)
				}
			}
		}
	]
}

let getEnabledCommands = (overrides = []) => {
	let enabledCommands = getCommands().filter(command => !!command?.enabled || overrides.includes(command.name))
	let forbiddenAgentCommands = getDocumentFromTextDB('Forbidden agent commands')
	if (forbiddenAgentCommands !== null) {
		let commandsToExclude = forbiddenAgentCommands.split("|")
		enabledCommands = enabledCommands.filter(command => !commandsToExclude.includes(command.name))
	}
	return enabledCommands
}

let getReasoningCommand = (overrides = []) => {
	return [
		{
			"name": "plan_actions",
			"description": "Defines a list of actions to respond to a user instruction.",
			"args": {
				"whoToRespondAs": {
					description: "<whose perspective is the response going to be written from>",
					enum: (localsettings.inject_chatnames_instruct ? localsettings.chatopponent.split("||$||") : undefined),
					type: "string",
					skip: !localsettings.inject_chatnames_instruct
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
									enum: getEnabledCommands(overrides).map(c => c.name)
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
				currentOrderOfActionsOverall = action?.args?.orderOfActions.map(act => act.action)
				currentOrderOfActionDescriptionsOverall = action?.args?.orderOfActions.map(act => act.objective)
				if (localsettings.inject_chatnames_instruct) {
					if (!!action?.args?.whoToRespondAs) {
						mostRecentChatOpponent = action?.args?.whoToRespondAs
					}
					else {
						mostRecentChatOpponent = resetChatOpponentToRandom()
					}
				}
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
						type: "string"
					}
				}
			}

			args.required.push(arg)
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
			let args = Object.keys(command.args).map(key => {
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

let agentConstraints = `Constraints:
1. Only use commands defined below - no other actions are available.
2. No user assistance unless absolutely necessary.
3. Keep thoughts concise and action - focused.
4. Don't over-analyze simple decisions.
5. Start with simple questions / actions before complex ones.
6. Never repeat recent questions or actions.
7. Check recent history before asking questions.`,
	agentResources = `Resources:
1. Use "ask_user" to tell them to implement new commands if you need one. Do not use ask_user unless absolutely necessary.
2. When responding with None, use null, as otherwise the JSON cannot be parsed.
3. Use "overwrite_current_state" to keep current information.
4. Use "add_to_history" to store background information which may be needed in future.
4. Use "search_history" if the user has an instruction which requires more information.
5. The current date is: ${new Date().toUTCString()}
6. The user may have provided an image for analysis. If the user asks for details about the image, image generation is forbidden.`,
	agentEvaluation = `Performance Evaluation:
1. Continuously assess your actions.
2. Constructively self - criticize your big - picture behavior.
3. Every command has a cost, so be smart and efficient. Aim to complete tasks in the least number of steps, but never sacrifice quality.`,
	json_schema = `RESPOND WITH ONLY VALID JSON CONFORMING TO THE FOLLOWING SCHEMA:
{
	"command": {
		"name": { "type": "string" },
		"args": { "type": "object" }
	}
} `;

let checkFinalThoughtsPrompt = `Action: {"command":{"name":"thought","args":{"message":"I must make sure that I respond to the user with \"send_message\""}}}`