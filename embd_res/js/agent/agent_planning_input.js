export const buildPlanningInputCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		createInstructPrompt,
		objRefAssign,
	} = ctx

	return [
		{
			"name": "userInput",
			"description": "Requests structured input from the user. Use this when you need the user to provide specific information before continuing.",
			"args": {
				"prompt": {
					description: "<question or information request for the user>",
					type: "string"
				},
				"suggestions": {
					description: "<optional suggested replies the user can click>",
					type: "array",
					items: {
						type: "string",
					},
					optional: true
				},
				"continueWithCurrentPlan": {
					description: "<true to continue the current plan with the user's response, false to generate a new plan because the current one is incorrect>",
					type: "boolean",
				}
			},
			"enabled": !!agentRunState?.agentStopOnRequestForInput,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let prompt = (action?.args?.prompt || "").toString().trim()
				if (!prompt) {
					addThought(currentChainOfThought, createSysPrompt, "Request for user input failed - no prompt provided")
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; }
					return true
				}

				let suggestions = action?.args?.suggestions
				if (!Array.isArray(suggestions)) {
					suggestions = []
				}
				suggestions = suggestions.map(String).map(text => text.trim()).filter(text => text.length > 0)

				let continueWithCurrentPlan = !!action?.args?.continueWithCurrentPlan
				addThought(currentChainOfThought, createSysPrompt, `Request for user input: ${prompt}`, true)

				if (typeof window.requestAgentUserInput !== "function") {
					addThought(currentChainOfThought, createSysPrompt, "User input UI is unavailable. Stopping loop.", true)
					agentRunState.skipTaskCompletionCheck = true
					return true
				}

				if (typeof agentRunState.agentVisualiser === "function") {
					await agentRunState.agentVisualiser(objRefAssign({}, agentRunState, {agentRunState}))
				}
				if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
				{
					agentRunState.logger.printPendingLogs()
				}
				
				let response = await window.requestAgentUserInput({
					prompt,
					suggestions
				})

				let userOverrideToStop = !response || response.action === "stop"
				let userInput = (response?.input || "").toString().trim()
				let selectedFiles = Array.isArray(response?.files) ? response.files : []
				let uploadedFilePaths = selectedFiles.map(file => `${file?.path || ""}`.trim()).filter(path => path.length > 0)
				if (uploadedFilePaths.length === 0) {
					let legacyUploadedFilePath = (response?.filePath || "").toString().trim()
					if (!!legacyUploadedFilePath) {
						uploadedFilePaths.push(legacyUploadedFilePath)
					}
				}
				let noInputFromUser = !userInput && uploadedFilePaths.length === 0
				if (userOverrideToStop || noInputFromUser) {
					agentRunState.skipTaskCompletionCheck = true
					addThought(currentChainOfThought, createSysPrompt, "User chose to stop the loop or provided no input", true)
					return true
				}

				let combinedUserInput = userInput
				if (uploadedFilePaths.length > 0) {
					let fileLines = selectedFiles.length > 0 ? selectedFiles.map(file => `- ${file.path}${file?.source === "fs" ? " (selected from FS)" : " (uploaded from local device)"}`) : uploadedFilePaths.map(path => `- ${path}`)
					combinedUserInput = `${combinedUserInput}${combinedUserInput.length > 0 ? "\n\n" : ""}Files available in filesystem:\n${fileLines.join("\n")}`
				}

				let isFinalAction = agentRunState.recentActions.length - (!!agentRunState?.planToUse ? 1 : 0) - 1 === agentRunState.currentOrderOfActionsOverall.length
				if (continueWithCurrentPlan && !isFinalAction)
				{
					addThought(currentChainOfThought, createInstructPrompt, `Input provided by user: ${combinedUserInput}`)
					return false
				}
				else
				{
					agentRunState.skipTaskCompletionCheck = true
					setTimeout(() => {
						window.execAgentCycle(objRefAssign({}, {
							initialPrompt: combinedUserInput,
							printToConsole: !!agentRunState?.printToConsole,
							agentName: agentRunState?.agentName,
							systemPrompt: agentRunState?.systemPrompt,
							agentPrompt: agentRunState?.agentPrompt,
							configOverrides: agentRunState?.configOverrides,
							isUsingWhitelist: agentRunState?.isUsingWhitelist,
							agentStopOnRequestForInput: agentRunState?.agentStopOnRequestForInput,
							surpressMessagesToUser: agentRunState?.surpressMessagesToUser,
							excludeSpecificMessagePrefixes: agentRunState?.excludeSpecificMessagePrefixes
						}))
					}, 10)
					return true
				}
			}
		}
	]
}
