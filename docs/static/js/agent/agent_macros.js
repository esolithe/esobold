let isPlainObject = (value) => {
	if (value === null || typeof value !== "object") {
		return false
	}
	if (Array.isArray(value)) {
		return false
	}
	let prototype = Object.getPrototypeOf(value)
	return prototype === Object.prototype || prototype === null
}

let cloneAgentMacroObject = (value) => {
	if (Array.isArray(value)) {
		return value.map(item => cloneAgentMacroObject(item))
	}
	if (isPlainObject(value)) {
		let clone = {}
		Object.keys(value).forEach((key) => {
			clone[key] = cloneAgentMacroObject(value[key])
		})
		return clone
	}
	return value
}

window.getAvailableAgentMacros = () => {
	if (!isPlainObject(localsettings.agentSavedMacros)) {
		let defaultMacros = isPlainObject(window?.eso?.agentMacros) ? cloneAgentMacroObject(window.eso.agentMacros) : {}
		localsettings.agentSavedMacros = defaultMacros
	}
	if (!isPlainObject(localsettings.agentSavedMacros)) {
		localsettings.agentSavedMacros = {}
	}
	return localsettings.agentSavedMacros
}

let getCommandNamesForMacroValidation = (agentRunState) => {
	if (window.eso?.isBuildingMacroValidationCommandNames === true) {
		return []
	}
	window.eso = window.eso || {}
	window.eso.isBuildingMacroValidationCommandNames = true
	try {
		let allCommands = window.eso?.originalGetCommands?.(agentRunState)
		if (!Array.isArray(allCommands)) {
			return []
		}
		let commandNames = allCommands.map(command => `${command?.name || ""}`.trim()).filter(name => name.length > 0)
		return [...new Set(commandNames)]
	}
	finally {
		window.eso.isBuildingMacroValidationCommandNames = false
	}
}

let validateAgentMacroDefinition = (macroName, macroDefinition, agentRunState) => {
	let normalizedMacroName = `${macroName || ""}`.trim()
	if (!/^[A-Za-z0-9_]+$/.test(normalizedMacroName)) {
		return { valid: false, error: "Macro name must match ^[A-Za-z0-9_]+$." }
	}
	if (!isPlainObject(macroDefinition)) {
		return { valid: false, error: "Macro definition must be a plain object." }
	}
	if (!isPlainObject(macroDefinition.planToUse)) {
		return { valid: false, error: "Macro definition must include a planToUse object." }
	}
	let responsePlanOverview = `${macroDefinition.planToUse.responsePlanOverview || ""}`.trim()
	if (responsePlanOverview.length === 0) {
		return { valid: false, error: "Macro planToUse.responsePlanOverview must be a non-empty string." }
	}
	let orderOfActions = macroDefinition.planToUse.orderOfActions
	if (!Array.isArray(orderOfActions) || orderOfActions.length === 0) {
		return { valid: false, error: "Macro planToUse.orderOfActions must be a non-empty array." }
	}
	let availableCommandNames = getCommandNamesForMacroValidation(agentRunState)
	let availableCommandNameSet = new Set(availableCommandNames)
	if (macroDefinition.planToUse.whoToRespondAs !== undefined && typeof macroDefinition.planToUse.whoToRespondAs !== "string") {
		return { valid: false, error: "Macro planToUse.whoToRespondAs must be a string when provided." }
	}
	for (let index = 0; index < orderOfActions.length; index++) {
		let actionDefinition = orderOfActions[index]
		if (!isPlainObject(actionDefinition)) {
			return { valid: false, error: `Macro orderOfActions[${index}] must be a plain object.` }
		}
		let actionName = `${actionDefinition.action || ""}`.trim()
		let objective = `${actionDefinition.objective || ""}`.trim()
		if (actionName.length === 0 || objective.length === 0) {
			return { valid: false, error: `Macro orderOfActions[${index}] must include non-empty action and objective strings.` }
		}
		if (!availableCommandNameSet.has(actionName)) {
			return { valid: false, error: `Macro action '${actionName}' is not a recognized command.` }
		}
	}
	if (macroDefinition.agentPrompt != null && typeof macroDefinition.agentPrompt !== "string") {
		return { valid: false, error: "Macro agentPrompt must be a string when provided." }
	}
	if (macroDefinition.agentName != null && typeof macroDefinition.agentName !== "string") {
		return { valid: false, error: "Macro agentName must be a string when provided." }
	}
	// if (macroDefinition.printToConsole != null && typeof macroDefinition.printToConsole !== "boolean") {
	// 	return { valid: false, error: "Macro printToConsole must be a boolean when provided." }
	// }
	if (macroDefinition.wordCountEnabled != null && typeof macroDefinition.wordCountEnabled !== "boolean") {
		return { valid: false, error: "Macro wordCountEnabled must be a boolean when provided." }
	}
	if (macroDefinition.surpressMessagesToUser != null && typeof macroDefinition.surpressMessagesToUser !== "boolean") {
		return { valid: false, error: "Macro surpressMessagesToUser must be a boolean when provided." }
	}
	if (macroDefinition.isUsingWhitelist != null && typeof macroDefinition.isUsingWhitelist !== "boolean") {
		return { valid: false, error: "Macro isUsingWhitelist must be a boolean when provided." }
	}
	// if (macroDefinition.configOverrides != null) {
	// 	if (!isPlainObject(macroDefinition.configOverrides)) {
	// 		return { valid: false, error: "Macro configOverrides must be an object when provided." }
	// 	}
	// 	let configOverrideKeys = Object.keys(macroDefinition.configOverrides)
	// 	for (let index = 0; index < configOverrideKeys.length; index++) {
	// 		let actionName = configOverrideKeys[index]
	// 		if (!availableCommandNameSet.has(actionName)) {
	// 			return { valid: false, error: `Macro configOverrides contains unknown action '${actionName}'.` }
	// 		}
	// 		let overrideEntry = macroDefinition.configOverrides[actionName]
	// 		if (!isPlainObject(overrideEntry)) {
	// 			return { valid: false, error: `Macro configOverrides['${actionName}'] must be an object.` }
	// 		}
	// 		if (overrideEntry.config !== undefined && typeof overrideEntry.config !== "string") {
	// 			return { valid: false, error: `Macro configOverrides['${actionName}'].config must be a string when provided.` }
	// 		}
	// 		if (overrideEntry.model !== undefined && typeof overrideEntry.model !== "string") {
	// 			return { valid: false, error: `Macro configOverrides['${actionName}'].model must be a string when provided.` }
	// 		}
	// 	}
	// }
	return { valid: true }
}

let saveAgentMacroDefinition = (macroName, macroDefinition, overwrite = false) => {
	let normalizedMacroName = `${macroName || ""}`.trim()
	if (!/^[A-Za-z0-9_]+$/.test(normalizedMacroName)) {
		return { success: false, error: "Macro name must match ^[A-Za-z0-9_]+$." }
	}
	let availableMacros = getAvailableAgentMacros()
	if (!!availableMacros[normalizedMacroName] && !overwrite) {
		return { success: false, error: `Macro '${normalizedMacroName}' already exists. Set overwrite to true to replace it.` }
	}
	availableMacros[normalizedMacroName] = cloneAgentMacroObject(macroDefinition)
	return { success: true, macroName: normalizedMacroName }
}

let formatMacroMessage = (macroName, message) => {
	let normalizedMacroName = `${macroName || ""}`.trim()
	let normalizedMessage = `${message || ""}`.trim()
	return normalizedMacroName.length > 0 ? `Macro: ${normalizedMacroName}: ${normalizedMessage}` : `Macro: ${normalizedMessage}`
}

export const buildMacroCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
	} = ctx

	return [
		{
			"name": "create_macro",
			"description": "Creates or updates a saved macro definition for later execution.",
			"args": {
				"macroName": {
					description: "<macro name>",
					type: "string",
					pattern: "^[A-Za-z0-9_]+$"
				},
				"overwrite": {
					description: "<set true to overwrite an existing macro>",
					type: "boolean",
					optional: true
				},
				"macroDefinition": {
					description: "<macro definition object. Required: planToUse.responsePlanOverview and planToUse.orderOfActions. Optional: planToUse.whoToRespondAs, agentPrompt, agentName, wordCountEnabled, isUsingWhitelist>",
					format: {
						type: "object",
						properties: {
							"planToUse": {
								description: "Planning payload used when the macro is executed.",
								type: "object",
								properties: {
									"whoToRespondAs": {
										description: "Optional explicit speaking persona for the macro response.",
										type: "string"
									},
									"responsePlanOverview": {
										description: "Short concrete overview of what the macro intends to do.",
										type: "string"
									},
									"orderOfActions": {
										description: "Ordered action list executed by the macro.",
										type: "array",
										items: {
											type: "object",
											properties: {
												"action": {
													description: "Command name to run.",
													type: "string",
													enum: getCommandNamesForMacroValidation(agentRunState)
												},
												"objective": {
													description: "Why this action is needed in the macro.",
													type: "string"
												}
											},
											required: ["action", "objective"]
										},
										minItems: 1
									}
								},
								required: ["responsePlanOverview", "orderOfActions"]
							},
							"agentPrompt": {
								description: "Optional system prompt. This should be guidance on the macro without any specific details that would be expected to change per execution. For example, if the macro is for writing an email, the agentPrompt could include instructions on the style and format of the email, while the specific content of the email would be provided in the prompt argument of the run_macro command.",
								type: "string"
							},
							"agentName": {
								description: "Optional speaker name/persona override used for assistant responses.",
								type: "string"
							},
							// "configOverrides": {
							// 	description: "Optional per-action config/model overrides. Keys are command names.",
							// 	type: "object",
							// 	additionalProperties: {
							// 		type: "object",
							// 		properties: {
							// 			"config": {
							// 				type: "string"
							// 			},
							// 			"model": {
							// 				type: "string"
							// 			}
							// 		}
							// 	}
							// },
							// "printToConsole": {
							// 	description: "Optional boolean to print internal logs to console for this macro.",
							// 	type: "boolean"
							// },
							"wordCountEnabled": {
								description: "Optional boolean to enable word counts for this macro run.",
								type: "boolean"
							},
							// "surpressMessagesToUser": {
							// 	description: "Optional boolean to suppress visible user messages for this macro run.",
							// 	type: "boolean"
							// },
							"isUsingWhitelist": {
								description: "Optional boolean. true = only explicitly whitelisted commands can run; false = normal enabled commands.",
								type: "boolean"
							}
						}
					}
				}
			},
			"enabled": true,
			"executor": async (action) => {
				let macroName = `${action?.args?.macroName || ""}`.trim()
				let macroDefinition = action?.args?.macroDefinition
				let overwrite = !!action?.args?.overwrite

				let validationResult = validateAgentMacroDefinition(macroName, macroDefinition, agentRunState)
				if (!validationResult.valid) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `create failed: ${validationResult.error}`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return false
				}

				let macroSaveBody = {
					macroName,
					macroDefinition,
					overwrite,
				}
				macroDefinition.printToConsole = true // Force printToConsole to true for macro creation logs to assist with debugging macro creation issues. This does not affect the printToConsole setting when the macro is executed.
				let shouldSaveMacro = await window.showCommandExecutionConfirmation(
					"Save macro",
					"Please review macro details before saving.",
					JSON.stringify(macroSaveBody, null, 2)
				)
				if (!shouldSaveMacro) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "create cancelled by confirmation dialog."))
					return false
				}

				macroDefinition.surpressMessagesToUser = false // Force surpressMessagesToUser to false for macro creation logs to ensure the user sees the result of their macro creation attempt in the UI. This does not affect the surpressMessagesToUser setting when the macro is executed.;
				macroDefinition.printToConsole = !!macroDefinition.printToConsole // Ensure printToConsole is a boolean after the confirmation dialog
				let saveMacroResult = saveAgentMacroDefinition(macroName, macroDefinition, overwrite)
				if (!saveMacroResult.success) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `create failed: ${saveMacroResult.error}`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return false
				}

				addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "saved successfully."))
				return false
			}
		},
		{
			"name": "run_macro",
			"description": "Loads and executes a saved macro by name, based on prompt.",
			"args": {
				"macroName": {
					description: "<macro name>",
					type: "string",
					pattern: "^[A-Za-z0-9_]+$"
				},
				"prompt": {
					description: "<instruction for this macro execution. It will be added as 'Agent input: ...'>",
					type: "string"
				}
			},
			"enabled": true,
			"executor": async (action) => {
				let macroName = `${action?.args?.macroName || ""}`.trim()
				let macroExecutionPrompt = `${action?.args?.prompt || ""}`.trim()
				let availableMacros = getAvailableAgentMacros()
				let macroDefinition = availableMacros[macroName]
				if (!isPlainObject(macroDefinition)) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "run failed: macro was not found."))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return false
				}
				if (macroExecutionPrompt === null || macroExecutionPrompt.length === 0) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "run failed: no prompt provided for this execution."))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return false
				}

				let validationResult = validateAgentMacroDefinition(macroName, macroDefinition, agentRunState)
				if (!validationResult.valid) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `run failed: ${validationResult.error}`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return false
				}

				if (!isPlainObject(agentRunState._executedMacroNames)) {
					agentRunState._executedMacroNames = {}
				}
				agentRunState._executedMacroNames[macroName] = (agentRunState._executedMacroNames[macroName] || 0) + 1
				if (agentRunState._executedMacroNames[macroName] > 3) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "run failed: exceeded recursion limit."))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return false
				}

				let subAgentRunState = {
					planToUse: macroDefinition.planToUse,
					systemPrompt: agentRunState.systemPrompt,
					agentVisualiser: agentRunState.agentVisualiser,
					agentInitialiser: agentRunState.agentInitialiser,
					agentFinaliser: agentRunState.agentFinaliser,
					skipTaskCompletionCheck: true,
					_executedMacroNames: { ...agentRunState._executedMacroNames },
					configOverrides: {
						...(isPlainObject(agentRunState.configOverrides) ? agentRunState.configOverrides : {}),
						...(isPlainObject(macroDefinition.configOverrides) ? macroDefinition.configOverrides : {})
					}
				}

				if (macroExecutionPrompt.length > 0) {
					subAgentRunState.agentInputPrompt = macroExecutionPrompt
					subAgentRunState.initialPrompt = ""
				}

				if (typeof macroDefinition.agentPrompt === "string" && macroDefinition.agentPrompt.trim().length > 0) {
					subAgentRunState.agentPrompt = macroDefinition.agentPrompt
				} else if (agentRunState.agentPrompt) {
					subAgentRunState.agentPrompt = agentRunState.agentPrompt
				}

				if (typeof macroDefinition.agentName === "string" && macroDefinition.agentName.trim().length > 0) {
					subAgentRunState.agentName = macroDefinition.agentName
				} else if (agentRunState.agentName) {
					subAgentRunState.agentName = agentRunState.agentName
				}

				// if (typeof macroDefinition.printToConsole === "boolean") {
				// 	subAgentRunState.printToConsole = macroDefinition.printToConsole
				// } else {
				// 	subAgentRunState.printToConsole = agentRunState.printToConsole
				// }

				if (typeof macroDefinition.wordCountEnabled === "boolean") {
					subAgentRunState.wordCountEnabled = macroDefinition.wordCountEnabled
				} else {
					subAgentRunState.wordCountEnabled = !!agentRunState.wordCountEnabled
				}

				// if (typeof macroDefinition.surpressMessagesToUser === "boolean") {
				// 	subAgentRunState.surpressMessagesToUser = macroDefinition.surpressMessagesToUser
				// } else {
				// 	subAgentRunState.surpressMessagesToUser = agentRunState.surpressMessagesToUser
				// }

				if (typeof macroDefinition.isUsingWhitelist === "boolean") {
					subAgentRunState.isUsingWhitelist = macroDefinition.isUsingWhitelist
				} else {
					subAgentRunState.isUsingWhitelist = agentRunState.isUsingWhitelist
				}

				addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "executing as sub-agent loop."))
				if (typeof agentRunState.agentVisualiser === "function") {
					await agentRunState.agentVisualiser(objRefAssign({}, agentRunState, {agentRunState}))
				}
				if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
				{
					agentRunState.logger.printPendingLogs()
				}
				await window.execAgentCycle(subAgentRunState)
				addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "sub-agent loop complete."))
				return false
			}
		},
		{
			"name": "run_macro_on_files",
			"description": "Runs a saved macro once for each file in the given list of paths. Directories are expanded to all files within them. Each file is processed as a separate subagent run with the agent input set to 'Run the macro on path: {path}'.",
			"args": {
				"paths": {
					description: "<list of file or directory paths to process>",
					type: "array",
					items: { type: "string" }
				},
				"macroName": {
					description: "<macro name>",
					type: "string",
					pattern: "^[A-Za-z0-9_]+$"
				},
				"prompt": {
					description: "<optional additional instruction appended to each macro execution input>",
					type: "string",
					optional: true
				}
			},
			"enabled": true,
			"executor": async (action) => {
				let macroName = `${action?.args?.macroName || ""}`.trim()
				let subAgentRunStates = []
				try {
					let extraPrompt = `${action?.args?.prompt || ""}`.trim()
					let inputPaths = Array.isArray(action?.args?.paths) ? action.args.paths : []

					let availableMacros = getAvailableAgentMacros()
					let macroDefinition = availableMacros[macroName]
					if (!isPlainObject(macroDefinition)) {
						addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "run failed: macro was not found."))
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return false
					}

					let validationResult = validateAgentMacroDefinition(macroName, macroDefinition, agentRunState)
					if (!validationResult.valid) {
						addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `run failed: ${validationResult.error}`))
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return false
					}

					if (!isPlainObject(agentRunState._executedMacroNames)) {
						agentRunState._executedMacroNames = {}
					}
					agentRunState._executedMacroNames[macroName] = (agentRunState._executedMacroNames[macroName] || 0) + 1
					if (agentRunState._executedMacroNames[macroName] > 3) {
						addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "run failed: exceeded recursion limit."))
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return false
					}

					// Flatten directories: replace each directory path with the files it contains
					let flattenedPaths = []
					for (let inputPath of inputPaths) {
						let normalized = `${inputPath || ""}`.trim()
						if (!normalized) {
							continue
						}
						let expandedFiles = null
						try {
							if (typeof window?.fsClient?.listEntries === "function") {
								let dirPattern = normalized.endsWith("/") ? `${normalized}*` : `${normalized}/*`
								let listing = await window.fsClient.listEntries(dirPattern)
								let dirFiles = Array.isArray(listing?.files) ? listing.files.map(p => `${p || ""}`.trim()).filter(p => !!p) : []
								if (dirFiles.length > 0) {
									expandedFiles = dirFiles
								}
							}
						}
						catch (_e) {
							// treat as file if listing fails
						}
						if (expandedFiles !== null) {
							flattenedPaths.push(...expandedFiles)
						} else {
							flattenedPaths.push(normalized)
						}
					}

					// Deduplicate
					let distinctPaths = [...new Set(flattenedPaths)]

					if (distinctPaths.length === 0) {
						addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "run failed: no paths to process."))
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return false
					}

					// Build one subAgentRunState per path
					for (let path of distinctPaths) {
						let macroExecutionPrompt = `Run the macro on path: ${path}`
						if (extraPrompt.length > 0) {
							macroExecutionPrompt += `\n${extraPrompt}`
						}

						let subAgentRunState = {
							planToUse: macroDefinition.planToUse,
							systemPrompt: agentRunState.systemPrompt,
							agentVisualiser: agentRunState.agentVisualiser,
							agentInitialiser: agentRunState.agentInitialiser,
							agentFinaliser: agentRunState.agentFinaliser,
							skipTaskCompletionCheck: true,
							_executedMacroNames: { ...agentRunState._executedMacroNames },
							configOverrides: {
								...(isPlainObject(agentRunState.configOverrides) ? agentRunState.configOverrides : {}),
								...(isPlainObject(macroDefinition.configOverrides) ? macroDefinition.configOverrides : {})
							},
							agentInputPrompt: macroExecutionPrompt,
							initialPrompt: ""
						}

						if (typeof macroDefinition.agentPrompt === "string" && macroDefinition.agentPrompt.trim().length > 0) {
							subAgentRunState.agentPrompt = macroDefinition.agentPrompt
						} else if (agentRunState.agentPrompt) {
							subAgentRunState.agentPrompt = agentRunState.agentPrompt
						}

						if (typeof macroDefinition.agentName === "string" && macroDefinition.agentName.trim().length > 0) {
							subAgentRunState.agentName = macroDefinition.agentName
						} else if (agentRunState.agentName) {
							subAgentRunState.agentName = agentRunState.agentName
						}

						if (typeof macroDefinition.printToConsole === "boolean") {
							subAgentRunState.printToConsole = macroDefinition.printToConsole
						} else {
							subAgentRunState.printToConsole = agentRunState.printToConsole
						}

						if (typeof macroDefinition.wordCountEnabled === "boolean") {
							subAgentRunState.wordCountEnabled = macroDefinition.wordCountEnabled
						} else {
							subAgentRunState.wordCountEnabled = !!agentRunState.wordCountEnabled
						}

						if (typeof macroDefinition.surpressMessagesToUser === "boolean") {
							subAgentRunState.surpressMessagesToUser = macroDefinition.surpressMessagesToUser
						} else {
							subAgentRunState.surpressMessagesToUser = agentRunState.surpressMessagesToUser
						}

						if (typeof macroDefinition.isUsingWhitelist === "boolean") {
							subAgentRunState.isUsingWhitelist = macroDefinition.isUsingWhitelist
						} else {
							subAgentRunState.isUsingWhitelist = agentRunState.isUsingWhitelist
						}

						subAgentRunStates.push({ path, subAgentRunState })
					}

					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `running on ${distinctPaths.length} file(s).`))
				}
				finally {
					if (typeof agentRunState.agentVisualiser === "function") {
						await agentRunState.agentVisualiser(objRefAssign({}, agentRunState, {agentRunState}))
					}
					if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
					{
						agentRunState.logger.printPendingLogs()
					}
				}
				for (let { path, subAgentRunState } of subAgentRunStates) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `executing sub-agent loop for path: ${path}`))
					if (typeof agentRunState.agentVisualiser === "function") {
						await agentRunState.agentVisualiser(objRefAssign({}, agentRunState, {agentRunState}))
					}
					if (!!agentRunState?.printToConsole && agentRunState?.logger !== undefined)
					{
						agentRunState.logger.printPendingLogs()
					}
					await window.execAgentCycle(subAgentRunState)
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `sub-agent loop complete for path: ${path}`))
				}
				return false
			}
		},
		{
			"name": "get_macro_info",
			"description": "Gets information about saved macros. If macroName is omitted or empty, this lists all available macro names.",
			"args": {
				"macroName": {
					description: "<optional macro name. Leave empty to list all available macros>",
					type: "string",
					optional: true
				}
			},
			"enabled": true,
			"executor": (action) => {
				let macroName = `${action?.args?.macroName || ""}`.trim()
				let availableMacros = getAvailableAgentMacros()

				if (macroName.length === 0) {
					let names = Object.keys(availableMacros)
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage("", `available macros: ${names.length > 0 ? names.join(", ") : "none"}`))
					return false
				}

				let macroDefinition = availableMacros[macroName]
				if (!isPlainObject(macroDefinition)) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "info failed: macro was not found."))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return false
				}

				let validationResult = validateAgentMacroDefinition(macroName, macroDefinition, agentRunState)
				if (!validationResult.valid) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `info failed: ${validationResult.error}`))
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					return false
				}

				// let configOverrideKeys = isPlainObject(macroDefinition.configOverrides) ? Object.keys(macroDefinition.configOverrides) : []
				let summary = {
					macroName,
					responsePlanOverview: macroDefinition.planToUse.responsePlanOverview,
					orderOfActions: macroDefinition.planToUse.orderOfActions,
					hasAgentPrompt: typeof macroDefinition.agentPrompt === "string" && macroDefinition.agentPrompt.trim().length > 0,
					// hasConfigOverrides: configOverrideKeys.length > 0,
					// configOverrideKeys,
				}
				addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `info:\n${JSON.stringify(summary, null, 2)}`))
				return false
			}
		},
	]
}
