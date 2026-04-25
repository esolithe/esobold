export const buildWorldStateCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
	} = ctx

	return [
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
					addThought(currentChainOfThought, createSysPrompt, `Text has been added to history`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Text was empty - nothing added to history`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					addThought(currentChainOfThought, createSysPrompt, `Text has been added to world info: ${uniqueIdentifier}`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Text was empty - nothing added to world info`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "read_world_information",
			"description": "Reads an entry describing an entity. The information is stored under a unique identifier. This information is included when certain keywords are mentioned. This does not show the information to the user.",
			"args": {
				"uniqueIdentifier": "<unique identifier (such as a characters name, location etc)>",
			},
			"enabled": true,
			"executor": (action) => {
				let uniqueIdentifier = action?.args?.uniqueIdentifier
				if (!!uniqueIdentifier) {
					uniqueIdentifier = uniqueIdentifier.toLowerCase()
					let wiSnippets = current_wi.filter(wi => wi?.comment === uniqueIdentifier)
					if (wiSnippets.length === 0) {
						addThought(currentChainOfThought, createSysPrompt, `Unique identifer does not exist in world information`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					}
					else {
						let wiContent = "World information search performed:";
						let wiEntries = []
						for (let i = 0; i < wiSnippets.length; ++i) {
							let entry = wiSnippets[i]
							wiEntries.push(`[Info Snippet\nPrimary keys: ${entry?.key || "N/A"}\nSecondary keys: ${entry?.keysecondary || "N/A"}\nContent: ${entry?.content || "N/A"}]`)
						}
						addThought(currentChainOfThought, createSysPrompt, `${wiContent}\n${wiEntries.join("\n\n")}`)
					}
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Unique identifier was empty - no world information found`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					addThought(currentChainOfThought, createSysPrompt, `Setting overview has been overwritten`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `No setting overview provided, nothing has been overwritten`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					addThought(currentChainOfThought, createSysPrompt, `Current state has been overwritten`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `No state provided, nothing has been overwritten`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
						addThought(currentChainOfThought, createSysPrompt, `Current state format has been overwritten`)
					}
					else {
						addThought(currentChainOfThought, createSysPrompt, `No valid state format provided, nothing has been overwritten`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					}
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `No valid state format provided, nothing has been overwritten`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
	]
}
