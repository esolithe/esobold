// Functions for the AI to use with embedded content
window.triggerAgentResponse = (prompt, macro = undefined) => {
	let inputText = `${prompt || ""}`.trim()
	if (!!macro) {
		inputText = `${macro}::${inputText}`
	}
	execAgentCycle({
		initialPrompt: inputText,
		printToConsole: true
	})
}

window.generateTextFromAI = async (prompt) => {
	return await generateAndGetTextFromPrompt(prompt)
}

window.generateObjectFromAI = async (prompt, objectStructure = {text: ""}) => {
	let grammar = await getObjectGNBF(objectStructure)
	let resp = await generateAndGetTextFromPrompt(prompt, grammar)
	try {
		return JSON.parse(resp)
	}
	catch (e) {
		console.error("Failed to parse AI response as JSON:", e, "Response text was:", resp)
		return null
	}
}