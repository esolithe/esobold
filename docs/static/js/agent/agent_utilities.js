export const buildUtilityCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
	} = ctx

	return [
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
					addThought(currentChainOfThought, createSysPrompt, `Rolled ${numDice} dice with ${numSides} sides: ${results.join(", ")}`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Could not roll dice as the format was incorrect`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					addThought(currentChainOfThought, createSysPrompt, `Got ${numOfTerms} terms from ${tableToUse}: ${results.join(", ")}`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Could not get terms as the format was incorrect`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					addThought(currentChainOfThought, createSysPrompt, `Formula evaluation result: ${math.evaluate(formula)}`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Formula evaluation could not be completed as no formula was provided`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "wordcount",
			"description": "Enables or disables a word count for each 'userInput', 'thought' or 'send_message'.",
			"args": {
				"state": {
					description: "<true or false>",
					type: "boolean"
				}
			},
			"enabled": true,
			"executor": (action) => {
				let wordCountState = action?.args?.state
				agentRunState.wordCountEnabled = !!wordCountState
				addThought(currentChainOfThought, createSysPrompt, `Word count is ${!!wordCountState ? "enabled" : "disabled"}`)
			}
		},
	]
}
