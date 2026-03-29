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

let normalizeBase64ImageData = (input = "") => {
	let value = `${input || ""}`
	let parts = value.split(",")
	if (parts.length === 2 && parts[0].startsWith("data:")) {
		return parts[1]
	}
	return value
}

let base64ToUint8Array = (base64 = "") => {
	let cleanBase64 = `${base64 || ""}`.trim()
	if (cleanBase64 === "") return new Uint8Array(0)
	let binaryString = atob(cleanBase64)
	let bytes = new Uint8Array(binaryString.length)
	for (let index = 0; index < binaryString.length; index++) {
		bytes[index] = binaryString.charCodeAt(index)
	}
	return bytes
}

let blobToDataUrl = async (blob) => {
	return await new Promise((resolve, reject) => {
		let reader = new FileReader()
		reader.onload = () => resolve(`${reader.result || ""}`)
		reader.onerror = () => reject(new Error("Failed to read blob as data URL."))
		reader.readAsDataURL(blob)
	})
}

let readFsPathAsDataUrl = async (fsPath) => {
	let rawResp = await window.fsClient.fetch_raw(fsPath)
	let blob = await rawResp.blob()
	return await blobToDataUrl(blob)
}

let readFsPathAsBase64 = async (fsPath) => {
	return normalizeBase64ImageData(await readFsPathAsDataUrl(fsPath))
}

let writeBase64ToFs = async (fsPath, base64Data) => {
	let bytes = base64ToUint8Array(base64Data)
	return await window.fsClient.write(fsPath, bytes, true)
}

let waitForUserImageSelection = async () => {
	waitingFori2iSelection = true
	await new Promise((resolve) => {
		let intervalId = setInterval(() => {
			if (waitingFori2iSelection === false || endCurrent) {
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

let generateA1111ImageBase64 = async (prompt, aspect, sourceImageBase64 = "", extraImages = []) => {
	let styledPrompt = `${prompt || ""}`
	if (!!localsettings.image_styles && localsettings.image_styles !== "") {
		styledPrompt = `${localsettings.image_styles} ${styledPrompt}`
	}
	styledPrompt = styledPrompt.replace(/###/gm, "")
	let negprompt = localsettings.image_negprompt ? (` ### ${localsettings.image_negprompt}`) : ""
	if (localsettings.image_negprompt == "none") {
		negprompt = ""
	}
	let sizing = calcImageSizing(aspect)
	let { iwidth, iheight } = getImageSizing(sizing)
	let desiredModel = document.getElementById("generate_images_local_model")?.value || localsettings.generate_images_model || ""
	let payload = {
		prompt: `${styledPrompt}${negprompt}`,
		params: {
			cfg_scale: localsettings.img_cfgscale,
			sampler_name: localsettings.img_sampler,
			height: iheight,
			width: iwidth,
			steps: localsettings.img_steps,
			denoising_strength: localsettings.img_img2imgstr,
			clip_skip: localsettings.img_clipskip,
		},
		models: [desiredModel],
		source_image: sourceImageBase64 || "",
	}
	if (!!extraImages && Array.isArray(extraImages) && extraImages.length > 0) {
		payload.extra_images = extraImages
	}
	return await new Promise((resolve, reject) => {
		generate_a1111_image(payload, (outputImageBase64) => {
			if (!!outputImageBase64) {
				resolve(outputImageBase64)
			} else {
				reject(new Error("Image generation failed."))
			}
		})
	})
}

let mergeMusicPrepareIntoState = (prepareResult) => {
	let existingState = `${getDocumentFromTextDB("State") || ""}`.trim()
	let mergedState = null
	try {
		let parsed = JSON.parse(existingState || "{}")
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			parsed = { value: existingState }
		}
		parsed.music_prepare = prepareResult
		mergedState = JSON.stringify(parsed)
	}
	catch {
		mergedState = `${existingState}${existingState.length > 0 ? "\n\n" : ""}[Music Prepare]\n${JSON.stringify(prepareResult)}`
	}
	replaceDocumentFromTextDB("State", mergedState)
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

let wordCountEnabled = false
let getFsEmbedRegistry = () => {
	if (!window.kcppFsEmbeds) {
		window.kcppFsEmbeds = {}
	}
	return window.kcppFsEmbeds
}

let clampFsEmbedLayout = (layout = {}) => {
	let viewportWidth = Math.max(1, window.innerWidth || 1)
	let viewportHeight = Math.max(1, window.innerHeight || 1)
	let minWidth = Math.min(180, viewportWidth)
	let minHeight = Math.min(140, viewportHeight)
	let width = Math.max(minWidth, Math.min(parseInt(layout.width ?? Math.floor(viewportWidth * 0.4)) || minWidth, viewportWidth))
	let height = Math.max(minHeight, Math.min(parseInt(layout.height ?? Math.floor(viewportHeight * 0.4)) || minHeight, viewportHeight))
	let x = Math.max(0, Math.min(parseInt(layout.x ?? 0) || 0, Math.max(0, viewportWidth - width)))
	let y = Math.max(0, Math.min(parseInt(layout.y ?? 0) || 0, Math.max(0, viewportHeight - height)))
	return { x, y, width, height, viewportWidth, viewportHeight }
}

let raiseFsEmbed = (container) => {
	window.kcppFsEmbedZ = (window.kcppFsEmbedZ || 4000) + 1
	container.style.zIndex = `${window.kcppFsEmbedZ}`
}

let closeFsEmbedByName = (name) => {
	let registry = getFsEmbedRegistry()
	let normalizedName = `${name || ""}`.trim()
	if (normalizedName === "") {
		return { success: false, closed: false, reason: "Missing embed name." }
	}
	let existing = registry[normalizedName]
	if (!!existing?.container) {
		existing.container.remove()
	}
	delete registry[normalizedName]
	return { success: true, closed: !!existing, name: normalizedName }
}

let getFsMediaKindByUrl = (url = "") => {
	let normalized = `${url || ""}`.toLowerCase().split("#")[0].split("?")[0]
	let imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif", ".ico"]
	let videoExtensions = [".mp4", ".webm", ".ogv", ".mov", ".m4v"]
	let audioExtensions = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".opus", ".oga", ".ogg"]
	if (imageExtensions.some((ext) => normalized.endsWith(ext))) {
		return "image"
	}
	if (videoExtensions.some((ext) => normalized.endsWith(ext))) {
		return "video"
	}
	if (audioExtensions.some((ext) => normalized.endsWith(ext))) {
		return "audio"
	}
	return "embed"
}

let createFsEmbedContentElement = (kind) => {
	if (kind === "image") {
		let imageElem = document.createElement("img")
		imageElem.className = "kcpp-fs-embed-content kcpp-fs-embed-media"
		imageElem.loading = "lazy"
		imageElem.decoding = "async"
		return imageElem
	}
	if (kind === "video") {
		let videoElem = document.createElement("video")
		videoElem.className = "kcpp-fs-embed-content kcpp-fs-embed-media"
		videoElem.controls = true
		return videoElem
	}
	if (kind === "audio") {
		let audioElem = document.createElement("audio")
		audioElem.className = "kcpp-fs-embed-content kcpp-fs-embed-audio"
		audioElem.controls = true
		return audioElem
	}
	let embedElem = document.createElement("embed")
	embedElem.className = "kcpp-fs-embed-content"
	embedElem.type = "text/html"
	return embedElem
}

let openFsEmbedByName = async (args = {}) => {
	let normalizedName = `${args?.name || ""}`.trim()
	let targetPath = `${args?.file_path || args?.path || ""}`.trim()
	if (normalizedName === "") {
		throw new Error("Missing embed name.")
	}
	if (targetPath === "") {
		throw new Error("Missing filesystem file path.")
	}
	let layout = clampFsEmbedLayout(args)
	let urlInfo = await window.fsClient.url(targetPath)
	let registry = getFsEmbedRegistry()
	let existing = registry[normalizedName]
	let container = existing?.container
	let titleElem = existing?.titleElem
	let contentElem = existing?.contentElem
	let contentKind = existing?.contentKind || "embed"
	let targetUrl = urlInfo?.url || targetPath
	let targetKind = getFsMediaKindByUrl(targetUrl)

	if (!container) {
		container = document.createElement("div")
		container.className = "kcpp-fs-embed-window"
		container.onmousedown = () => raiseFsEmbed(container)

		titleElem = document.createElement("div")
		titleElem.className = "kcpp-fs-embed-title"

		let header = document.createElement("div")
		header.className = "kcpp-fs-embed-header"
		header.addEventListener("mousedown", (e) => {
			if (e.target.closest("button")) return
			e.preventDefault()
			raiseFsEmbed(container)
			let startX = e.clientX - container.offsetLeft
			let startY = e.clientY - container.offsetTop
			let onMouseMove = (me) => {
				let newX = Math.max(0, Math.min(me.clientX - startX, window.innerWidth - container.offsetWidth))
				let newY = Math.max(0, Math.min(me.clientY - startY, window.innerHeight - container.offsetHeight))
				container.style.left = `${newX}px`
				container.style.top = `${newY}px`
			}
			let onMouseUp = () => {
				document.removeEventListener("mousemove", onMouseMove)
				document.removeEventListener("mouseup", onMouseUp)
			}
			document.addEventListener("mousemove", onMouseMove)
			document.addEventListener("mouseup", onMouseUp)
		})

		let expandBtn = document.createElement("button")
		expandBtn.type = "button"
		expandBtn.className = "kcpp-fs-embed-button"
		expandBtn.innerText = "↗"
		expandBtn.title = "Open in new tab"
		expandBtn.onclick = () => {
			let srcUrl = container?.querySelector(".kcpp-fs-embed-content")?.src
			if (!!srcUrl) {
				window.open(srcUrl, "_blank", "noopener,noreferrer")
			}
		}

		let closeBtn = document.createElement("button")
		closeBtn.type = "button"
		closeBtn.className = "kcpp-fs-embed-button"
		closeBtn.innerText = "✕"
		closeBtn.title = "Close"
		closeBtn.onclick = () => closeFsEmbedByName(normalizedName)

		contentElem = createFsEmbedContentElement(targetKind)
		contentKind = targetKind

		header.appendChild(titleElem)
		header.appendChild(expandBtn)
		header.appendChild(closeBtn)
		container.appendChild(header)
		container.appendChild(contentElem)
		document.body.appendChild(container)

		registry[normalizedName] = { container, titleElem, contentElem, contentKind }
	}

	if (contentKind !== targetKind) {
		let nextContentElem = createFsEmbedContentElement(targetKind)
		if (!!contentElem?.parentElement) {
			contentElem.parentElement.replaceChild(nextContentElem, contentElem)
		}
		contentElem = nextContentElem
		contentKind = targetKind
		registry[normalizedName] = { container, titleElem, contentElem, contentKind }
	}

	titleElem.innerText = `${normalizedName} | ${urlInfo?.path || targetPath}`
	container.style.left = `${layout.x}px`
	container.style.top = `${layout.y}px`
	container.style.width = `${layout.width}px`
	container.style.height = `${layout.height}px`
	container.dataset.embedName = normalizedName
	container.dataset.embedPath = `${urlInfo?.path || targetPath}`
	contentElem.src = targetUrl
	raiseFsEmbed(container)

	return {
		success: true,
		name: normalizedName,
		path: urlInfo?.path || targetPath,
		url: urlInfo?.url || targetPath,
		...layout,
	}
}

window.openFsEmbedByName = openFsEmbedByName;
window.closeFsEmbedByName = closeFsEmbedByName;

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

let getAvailableAgentMacros = () => {
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
	let allCommands = getCommands(agentRunState)
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
	if (macroDefinition.printToConsole != null && typeof macroDefinition.printToConsole !== "boolean") {
		return { valid: false, error: "Macro printToConsole must be a boolean when provided." }
	}
	if (macroDefinition.surpressMessagesToUser != null && typeof macroDefinition.surpressMessagesToUser !== "boolean") {
		return { valid: false, error: "Macro surpressMessagesToUser must be a boolean when provided." }
	}
	if (macroDefinition.isUsingWhitelist != null && typeof macroDefinition.isUsingWhitelist !== "boolean") {
		return { valid: false, error: "Macro isUsingWhitelist must be a boolean when provided." }
	}
	if (macroDefinition.configOverrides != null) {
		if (!isPlainObject(macroDefinition.configOverrides)) {
			return { valid: false, error: "Macro configOverrides must be an object when provided." }
		}
		let configOverrideKeys = Object.keys(macroDefinition.configOverrides)
		for (let index = 0; index < configOverrideKeys.length; index++) {
			let actionName = configOverrideKeys[index]
			if (!availableCommandNameSet.has(actionName)) {
				return { valid: false, error: `Macro configOverrides contains unknown action '${actionName}'.` }
			}
			let overrideEntry = macroDefinition.configOverrides[actionName]
			if (!isPlainObject(overrideEntry)) {
				return { valid: false, error: `Macro configOverrides['${actionName}'] must be an object.` }
			}
			if (overrideEntry.config !== undefined && typeof overrideEntry.config !== "string") {
				return { valid: false, error: `Macro configOverrides['${actionName}'].config must be a string when provided.` }
			}
			if (overrideEntry.model !== undefined && typeof overrideEntry.model !== "string") {
				return { valid: false, error: `Macro configOverrides['${actionName}'].model must be a string when provided.` }
			}
		}
	}
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

let getCommands = (agentRunState) => {
	let { currentChainOfThought } = agentRunState
	let confirmFsMutation = async (mutationName, payload = {}) => {
		let mode = await window.fsClient.getFsMode()
		if (mode === "memory") {
			return true
		}
		let details = { mutation: mutationName, mode, payload }
		return await window.showCommandExecutionConfirmation(
			"Allow filesystem write action",
			"Please review filesystem action details before continuing.",
			JSON.stringify(details, null, 2)
		)
	}
	return [
		{
			"name": "send_message",
			"description": "Sends text to the user.",
			"args": {
				"whoToSendMessageAs": {
					description: "<whose perspective is the response written from>",
					pattern: (!!agentRunState?.agentName ? `^${agentRunState.agentName}$` : undefined),
					type: "string",
					skip: !agentRunState?.agentName
				},
				"messages": {
					description: "<text to send>",
					type: "array",
					items: {
						type: "string",
					},
					minItems: 1,
					maxItems: 5
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": (action) => {
				if (!!action?.args?.messages) {
					clearSuggestions()
					action?.args?.messages.forEach(message => {
						if (!!message && message.trim().length > 0)
						{
							addThought(currentChainOfThought, createAIPrompt, agentRunState?.agentName ? `${agentRunState?.agentName}: ${message}` : message)
						}
					})
				}
			}
		},
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
		},
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
					description: "<macro definition object. Required: planToUse.responsePlanOverview and planToUse.orderOfActions. Optional: planToUse.whoToRespondAs, agentPrompt, agentName, configOverrides, printToConsole, surpressMessagesToUser, isUsingWhitelist>",
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
													type: "string"
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
								description: "Optional system-level instruction override while the macro runs.",
								type: "string"
							},
							"agentName": {
								description: "Optional speaker name/persona override used for assistant responses.",
								type: "string"
							},
							"configOverrides": {
								description: "Optional per-action config/model overrides. Keys are command names.",
								type: "object",
								additionalProperties: {
									type: "object",
									properties: {
										"config": {
											type: "string"
										},
										"model": {
											type: "string"
										}
									}
								}
							},
							"printToConsole": {
								description: "Optional boolean to print internal logs to console for this macro.",
								type: "boolean"
							},
							"surpressMessagesToUser": {
								description: "Optional boolean to suppress visible user messages for this macro run.",
								type: "boolean"
							},
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
					return false
				}

				let macroSaveBody = {
					macroName,
					macroDefinition,
					overwrite,
				}
				let shouldSaveMacro = await window.showCommandExecutionConfirmation(
					"Save macro",
					"Please review macro details before saving.",
					JSON.stringify(macroSaveBody, null, 2)
				)
				if (!shouldSaveMacro) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "create cancelled by confirmation dialog."))
					return false
				}

				let saveMacroResult = saveAgentMacroDefinition(macroName, macroDefinition, overwrite)
				if (!saveMacroResult.success) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `create failed: ${saveMacroResult.error}`))
					return false
				}

				addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "saved successfully."))
				return false
			}
		},
		{
			"name": "run_macro",
			"description": "Loads and executes a saved macro by name, optionally with additional agent input.",
			"args": {
				"macroName": {
					description: "<macro name>",
					type: "string",
					pattern: "^[A-Za-z0-9_]+$"
				},
				"prompt": {
					description: "<optional additional instruction for this macro execution. It will be added as 'Agent input: ...'>",
					type: "string",
					optional: true
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
					return false
				}

				let validationResult = validateAgentMacroDefinition(macroName, macroDefinition, agentRunState)
				if (!validationResult.valid) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `run failed: ${validationResult.error}`))
					return false
				}

				if (!isPlainObject(agentRunState._executedMacroNames)) {
					agentRunState._executedMacroNames = {}
				}
				agentRunState._executedMacroNames[macroName] = (agentRunState._executedMacroNames[macroName] || 0) + 1
				if (agentRunState._executedMacroNames[macroName] > 3) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "run failed: exceeded recursion limit."))
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
				} else if (agentRunState.initialPrompt) {
					subAgentRunState.initialPrompt = agentRunState.initialPrompt
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

				addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "executing as sub-agent loop."))
				await window.execAgentCycle(subAgentRunState)
				addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, "sub-agent loop complete."))
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
					return false
				}

				let validationResult = validateAgentMacroDefinition(macroName, macroDefinition, agentRunState)
				if (!validationResult.valid) {
					addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `info failed: ${validationResult.error}`))
					return false
				}

				let configOverrideKeys = isPlainObject(macroDefinition.configOverrides) ? Object.keys(macroDefinition.configOverrides) : []
				let summary = {
					macroName,
					responsePlanOverview: macroDefinition.planToUse.responsePlanOverview,
					orderOfActions: macroDefinition.planToUse.orderOfActions,
					hasAgentPrompt: typeof macroDefinition.agentPrompt === "string" && macroDefinition.agentPrompt.trim().length > 0,
					hasConfigOverrides: configOverrideKeys.length > 0,
					configOverrideKeys,
				}
				addThought(currentChainOfThought, createSysPrompt, formatMacroMessage(macroName, `info:\n${JSON.stringify(summary, null, 2)}`))
				return false
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
				addThought(currentChainOfThought, createSysPrompt, `Web search results: \n${webResp}`)
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
					addThought(currentChainOfThought, createSysPrompt, `Rolled ${numDice} dice with ${numSides} sides: ${results.join(", ")}`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Could not roll dice as the format was incorrect`)
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
					addThought(currentChainOfThought, createSysPrompt, `Text has been added to history`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Text was empty - nothing added to history`)
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
					}
					else {
						let wiContent = "World information search performed:";
						let wiEntries = []
						for (let i = 0; i < wiSnippets.length; ++i) {
							let entry = wiSnippets[i]
							wiEntries.push(`[Info Snippet\nPrimary keys: ${entry?.key || "N/A"}\nSecondary keys: ${entry?.keysecondary || "N/A"}\nContent: ${entry?.content || "N/A"}]`);
						}
						addThought(currentChainOfThought, createSysPrompt, `${wiContent}\n${wiEntries.join("\n\n")}`)
					}
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Unique identifier was empty - no world information found`)
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
					}
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `No valid state format provided, nothing has been overwritten`)
					// Surpress error
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
						addThought(currentChainOfThought, createSysPrompt, `History search performed: Nothing found`)
					}
					else {
						let ltmContent = "History search performed:";
						for (let i = 0; i < ltmSnippets.length; ++i) {
							ltmContent += getInfoSnippet(ltmSnippets[i]);
						}
						addThought(currentChainOfThought, createSysPrompt, ltmContent)
					}
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `Search string was empty, no search performed`)
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
				wordCountEnabled = !!wordCountState
				addThought(currentChainOfThought, createSysPrompt, `Word count is ${wordCountEnabled ? "enabled" : "disabled"}`)
			}
		},
		{
			"name": "describe_clicked_image",
			"description": "Describe an image that the user clicks in chat. Incompatible with filesystem file paths.",
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
					addThought(currentChainOfThought, createSysPrompt, `Please click an image as a source for image analysis`, true)
					let { agentVisualiser } = agentRunState;
					if (typeof agentVisualiser === "function") {
						await agentVisualiser(objRefAssign({}, agentRunState, { agentRunState }))
					}

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
						let analysisResult = await generateAndGetTextFromPrompt(`${createInstructPrompt(analysisPrompt)}${instructendplaceholder}${!!localsettings?.inject_jailbreak_instruct ? localsettings.custom_jailbreak_text : ""}`, undefined, [i2i64])
						addThought(currentChainOfThought, createSysPrompt, `Image analysed: ${analysisResult}`)
					}
					else {
						addThought(currentChainOfThought, createSysPrompt, `User did not select an image - no image analysed`)
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
				let waitForImageGenToComplete = async (imageId) => {
					await new Promise(resolve => {
						let complete = false;
						image_db[imageId].callback = () => complete = true;
						imageIntervalId = setInterval(() => {
							if (complete || endCurrent) {
								clearInterval(imageIntervalId)
								resolve();
							}
						}, 1000)
					})
				}
				if (!!prompt) {
					if (!!action?.args?.edit_existing_image) {
						waitingFori2iSelection = true
						addThought(currentChainOfThought, createSysPrompt, `Please click an image as a source for img2img generation`, true)
						let { agentVisualiser } = agentRunState;
						if (typeof agentVisualiser === "function") {
							await agentVisualiser(objRefAssign({}, agentRunState, { agentRunState }))
						}

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
							let imageId = generate_new_image(preparePromptForImageGen(prompt), i2i64, true, calcImageSizing(aspect))
							await waitForImageGenToComplete(imageId)
							addThought(currentChainOfThought, createSysPrompt, `Image generated`)
						}
						else {
							addThought(currentChainOfThought, createSysPrompt, `User did not select an image - no image generated`)
						}
						i2i64 = undefined;
						waitingFori2iSelection = false;
					}
					else {
						let imageId = generate_new_image(preparePromptForImageGen(prompt), undefined, true, calcImageSizing(aspect))
						await waitForImageGenToComplete(imageId)						
						addThought(currentChainOfThought, createSysPrompt, `Image generated`)
					}
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `No prompt provided, image not generated`)
				}
			}
		},
		{
			"name": "music_prepare",
			"description": "Prepare music generation settings from a caption and store the prepared fields in current state.",
			"args": {
				"caption": "<short description of the song to create>"
			},
			"enabled": is_using_kcpp_with_musicgen(),
			"executor": async (action) => {
				try {
					let caption = `${action?.args?.caption || ""}`.trim()
					if (caption === "") {
						addThought(currentChainOfThought, createSysPrompt, `Music prepare failed - caption is required`)
						return
					}
					let response = await postKcppJson("/api/extra/music/prepare", { caption })
					let result = await response.json()
					mergeMusicPrepareIntoState(result)
					addThought(currentChainOfThought, createSysPrompt, `Music prepare succeeded and state has been updated\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `Music prepare failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_generate_music",
			"description": "Generate music with KoboldCpp music endpoint and save the output audio into the filesystem.",
			"args": {
				"caption": "<song caption>",
				"lyrics": "<song lyrics>",
				"bpm": {
					description: "<beats per minute>",
					type: "integer"
				},
				"duration": {
					description: "<duration in seconds>",
					type: "integer"
				},
				"keyscale": "<musical key>",
				"timesignature": "<time signature>",
				"vocal_language": "<vocal language code>",
				"inference_steps": {
					description: "<diffusion inference steps>",
					type: "integer"
				},
				"fs_input_path": "<optional filesystem reference audio path>",
				"fs_output_path": "<filesystem output path for generated audio (.wav/.mp3)>"
			},
			"enabled": is_using_kcpp_with_musicgen() && is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let args = action?.args || {}
					let outputPath = `${args.fs_output_path || ""}`.trim()
					if (outputPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_music failed - fs_output_path is required`)
						return
					}
					let approved = await confirmFsMutation("fs_generate_music", { fs_output_path: outputPath })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_music cancelled by confirmation dialog`)
						return
					}
					let preparedFromState = {}
					try {
						let parsed = JSON.parse(`${getDocumentFromTextDB("State") || "{}"}`)
						preparedFromState = parsed?.music_prepare || {}
					}
					catch {
						preparedFromState = {}
					}
					let payload = {
						caption: `${args.caption || preparedFromState.caption || ""}`,
						lyrics: `${args.lyrics || preparedFromState.lyrics || ""}`,
						bpm: parseInt(args.bpm ?? preparedFromState.bpm ?? 120),
						duration: parseFloat(args.duration ?? preparedFromState.duration ?? 64),
						keyscale: `${args.keyscale || preparedFromState.keyscale || "G minor"}`,
						timesignature: `${args.timesignature || preparedFromState.timesignature || "2"}`,
						vocal_language: `${args.vocal_language || preparedFromState.vocal_language || "en"}`,
						inference_steps: parseInt(args.inference_steps ?? preparedFromState.inference_steps ?? 8),
					}
					let inputPath = `${args.fs_input_path || ""}`.trim()
					if (inputPath !== "") {
						payload.music_reference_audio_data = await readFsPathAsBase64(inputPath)
					}
					let response = await postKcppJson("/api/extra/music/generate", payload)
					let audioData = await response.arrayBuffer()
					let writeResult = await window.fsClient.write(outputPath, new Uint8Array(audioData))
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_music result\n${objToText(writeResult)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_music failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_transcribe",
			"description": "Transcribe a .wav audio file from the filesystem using KoboldCpp transcribe endpoint.",
			"args": {
				"path": "<filesystem path to .wav file>",
				"prompt": "<optional transcription prompt>",
				"langcode": "<language code or auto>",
				"suppress_non_speech": {
					description: "<true to suppress non-speech noise>",
					type: "boolean"
				}
			},
			"enabled": is_using_kcpp_with_whisper() && is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let fsPath = `${action?.args?.path || ""}`.trim()
					if (!fsPath.toLowerCase().endsWith(".wav")) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: transcribe failed - only .wav files are supported`)
						return
					}
					let dataUrl = await readFsPathAsDataUrl(fsPath)
					let response = await postKcppJson(koboldcpp_transcribe_endpoint, {
						audio_data: dataUrl,
						prompt: `${action?.args?.prompt || ""}`,
						suppress_non_speech: !!action?.args?.suppress_non_speech,
						langcode: `${action?.args?.langcode || "auto"}`,
					})
					let result = await response.json()
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: transcribe result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: transcribe failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_generate_image",
			"description": "Generate an image (txt2img or img2img) and save it into the filesystem.",
			"args": {
				"prompt": "<prompt to generate image with>",
				"aspect": {
					type: "string",
					description: "<aspect ratio - must be \"landscape\", \"portrait\" or \"square\">"
				},
				"fs_input_image_paths": {
					description: "<optional filesystem image paths to use as inputs>",
					type: "array",
					items: { type: "string" }
				},
				"prompt_user_for_image": {
					description: "<prompt user to click an image to use as input>",
					type: "boolean"
				},
				"fs_output_path": "<filesystem output path for generated image>"
			},
			"enabled": (localsettings.generate_images_mode == 2) && is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let args = action?.args || {}
					let prompt = `${args.prompt || ""}`.trim()
					let outputPath = `${args.fs_output_path || ""}`.trim()
					if (prompt === "" || outputPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_image failed - prompt and fs_output_path are required`)
						return
					}
					let approved = await confirmFsMutation("fs_generate_image", { fs_output_path: outputPath })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_image cancelled by confirmation dialog`)
						return
					}
					let inputImages = []
					let inputPaths = Array.isArray(args.fs_input_image_paths) ? args.fs_input_image_paths : []
					for (let index = 0; index < inputPaths.length; index++) {
						let currentPath = `${inputPaths[index] || ""}`.trim()
						if (currentPath !== "") {
							inputImages.push(await readFsPathAsBase64(currentPath))
						}
					}
					if (!!args.prompt_user_for_image) {
						addThought(currentChainOfThought, createSysPrompt, `Please click an image as an additional source for filesystem image generation`, true)
						let { agentVisualiser } = agentRunState;
						if (typeof agentVisualiser === "function") {
							await agentVisualiser(objRefAssign({}, agentRunState, { agentRunState }))
						}
						let selectedImage = await waitForUserImageSelection()
						if (!!selectedImage) {
							inputImages.unshift(normalizeBase64ImageData(selectedImage))
						}
					}
					let sourceImage = inputImages.length > 0 ? inputImages[0] : ""
					let outputBase64 = await generateA1111ImageBase64(preparePromptForImageGen(prompt), args.aspect, sourceImage, inputImages.slice(1))
					let writeResult = await writeBase64ToFs(outputPath, outputBase64)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_image result\n${objToText(writeResult)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_image failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "describe_fs_image",
			"description": "Describe an image from a filesystem file path. Incompatible with click-selected chat images.",
			"args": {
				"path": "<filesystem image path>",
				"question": "<optional focus question>"
			},
			"enabled": is_using_kcpp_with_fs() && is_using_kcpp_with_vision(),
			"executor": async (action) => {
				try {
					let fsPath = `${action?.args?.path || ""}`.trim()
					if (fsPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: describe_fs_image failed - path is required`)
						return
					}
					let analysisPrompt = "Describe the image in detail. Transcribe and include any text from the image in the description."
					if (!!action?.args?.question) {
						analysisPrompt += ` Specifically please focus on:\n\n${action?.args?.question}`
					}
					let base64Image = await readFsPathAsBase64(fsPath)
					let analysisResult = await generateAndGetTextFromPrompt(`${createInstructPrompt(analysisPrompt)}${instructendplaceholder}${!!localsettings?.inject_jailbreak_instruct ? localsettings.custom_jailbreak_text : ""}`, undefined, [base64Image])
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: describe_fs_image result\n${analysisResult}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: describe_fs_image failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_list",
			"description": "List paths in the filesystem, optionally filtered by glob pattern.",
			"args": {
				"pattern": {
					description: "<glob pattern, default *>",
					type: "string"
				},
				"case_insensitive": {
					description: "<true for case-insensitive matching>",
					type: "boolean"
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let normalizeFsListPath = (rawPath = "") => {
						let path = `${rawPath || ""}`.trim()
						if (!path) {
							return null
						}
						let isDirectory = false
						if (path === ".kcpp_dir_marker") {
							path = "/"
							isDirectory = true
						}
						if (path.endsWith("/.kcpp_dir_marker")) {
							path = path.substring(0, path.length - "/.kcpp_dir_marker".length)
							isDirectory = true
						}
						if (path.length > 1 && path.endsWith("/")) {
							path = path.substring(0, path.length - 1)
						}
						if (!path) {
							path = "/"
						}
						return {
							path,
							isDirectory
						}
					}

					let pattern = action?.args?.pattern
					let listing = await window.fsClient.listEntries(pattern, action?.args?.case_insensitive)
					let normalizedEntries = []
					if (Array.isArray(listing?.directories)) {
						normalizedEntries.push(...listing.directories.map(path => ({ path: `${path || ""}`.trim() || "/", isDirectory: true })))
					}
					if (Array.isArray(listing?.files)) {
						normalizedEntries.push(...listing.files.map(path => ({ path: `${path || ""}`.trim(), isDirectory: false })).filter(entry => !!entry.path))
					}
					if (normalizedEntries.length === 0) {
						let legacyPaths = await window.fsClient.list(pattern, action?.args?.case_insensitive)
						normalizedEntries = (Array.isArray(legacyPaths) ? legacyPaths : []).map(normalizeFsListPath).filter(entry => entry !== null)
					}
					let result = Array.from(new Set(normalizedEntries.map(entry => `${entry.path}${entry.isDirectory ? " (directory)" : ""}`))).sort((a, b) => a.localeCompare(b))
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: list result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: list failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_search",
			"description": "Search file contents in the filesystem by text pattern.",
			"args": {
				"pattern": {
					description: "<content pattern>",
					type: "string"
				},
				"path_pattern": {
					description: "<glob path filter, default *>",
					type: "string"
				},
				"max_results": {
					description: "<max result count>",
					type: "integer"
				},
				"case_insensitive": {
					description: "<true for case-insensitive matching>",
					type: "boolean"
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let result = await window.fsClient.search(action?.args?.pattern, action?.args?.path_pattern, action?.args?.max_results, action?.args?.case_insensitive)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: search result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: search failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_semantic_search",
			"description": "Semantic-search a filesystem .txt or .pdf document using cached embeddings.",
			"args": {
				"path": "<filesystem path to a .txt or .pdf file>",
				"search_query": {
					description: "<semantic search query>",
					type: "string"
				},
				"max_results": {
					description: "<max result count, up to 20>",
					type: "integer"
				}
			},
			"enabled": is_using_kcpp_with_fs() && is_using_kcpp_with_embeddings(),
			"executor": async (action) => {
				try {
					let approved = await confirmFsMutation("fs_semantic_search", {
						path: action?.args?.path,
						max_results: action?.args?.max_results,
					})
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: semantic search cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.semantic_search(action?.args?.path, action?.args?.search_query, action?.args?.max_results)
					if (!Array.isArray(result) || result.length === 0) {
						addThought(currentChainOfThought, createSysPrompt, `Semantic search performed: Nothing found`)
					}
					else {
						let ltmContent = "Semantic search performed:";
						for (let i = 0; i < result.length; ++i) {
							ltmContent += getInfoSnippet(result[i]);
						}
						addThought(currentChainOfThought, createSysPrompt, ltmContent)
					}
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: semantic search failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_metadata",
			"description": "Get metadata for a filesystem file.",
			"args": {
				"path": "<file path>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let result = await window.fsClient.metadata(action?.args?.path)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: metadata result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: metadata failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_url",
			"description": "Get the public URL for a filesystem file.",
			"args": {
				"path": "<file path>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let result = await window.fsClient.url(action?.args?.path)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: url result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: url failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_content",
			"description": "Read line-based text content from a filesystem file.",
			"args": {
				"path": "<file path>",
				"start": {
					description: "<start line, 1-based>",
					type: "integer"
				},
				"end": {
					description: "<end line, 1-based>",
					type: "integer"
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let result = await window.fsClient.content(action?.args?.path, action?.args?.start, action?.args?.end)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: content result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: content failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_download_info",
			"description": "Get filesystem download information for the full filesystem or one subdirectory.",
			"args": {
				"dir": {
					description: "<optional directory prefix>",
					type: "string"
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let result = await window.fsClient.download_info(action?.args?.dir)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: download_info result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: download_info failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_write_text",
			"description": "Write plain text content to a filesystem file.",
			"args": {
				"path": "<file path>",
				"content": "<text content>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let content = action?.args?.content
					if (typeof content !== "string") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_text failed - content must be text (binary is not enabled yet)`)
						return
					}
					let approved = await confirmFsMutation("fs_write_text", { path: action?.args?.path })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_text cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.write(action?.args?.path, content)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_text result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_text failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_write_lines",
			"description": "Write or append lines in a filesystem text file.",
			"args": {
				"path": "<file path>",
				"lines": {
					description: "<array of lines>",
					type: "array",
					items: { type: "string" }
				},
				"start_line": {
					description: "<start line, default 1>",
					type: "integer"
				},
				"append": {
					description: "<append mode>",
					type: "boolean"
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let approved = await confirmFsMutation("fs_write_lines", { path: action?.args?.path })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_lines cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.write_lines(action?.args?.path, action?.args?.lines, action?.args?.start_line, action?.args?.append)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_lines result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_lines failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_delete",
			"description": "Delete a filesystem file.",
			"args": {
				"path": "<file path>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let approved = await confirmFsMutation("fs_delete", { path: action?.args?.path })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.delete(action?.args?.path)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_move",
			"description": "Move or rename a filesystem file.",
			"args": {
				"source": "<source path>",
				"destination": "<destination path>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let approved = await confirmFsMutation("fs_move", { source: action?.args?.source, destination: action?.args?.destination })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.move(action?.args?.source, action?.args?.destination)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_copy",
			"description": "Copy a filesystem file.",
			"args": {
				"source": "<source path>",
				"destination": "<destination path>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let approved = await confirmFsMutation("fs_copy", { source: action?.args?.source, destination: action?.args?.destination })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.copy(action?.args?.source, action?.args?.destination)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_extract_zip",
			"description": "Extract a .zip file from the filesystem into a target filesystem directory.",
			"args": {
				"zip_path": "<filesystem .zip file path>",
				"target_dir": {
					description: "<target directory, default />",
					type: "string"
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let zipPath = `${action?.args?.zip_path || ""}`.trim()
					let targetDir = `${action?.args?.target_dir || "/"}`.trim() || "/"
					if (zipPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: extract_zip failed - zip_path is required`)
						return
					}
					let approved = await confirmFsMutation("fs_extract_zip", { zip_path: zipPath, target_dir: targetDir })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: extract_zip cancelled by confirmation dialog`)
						return
					}
					let rawResp = await window.fsClient.fetch_raw(zipPath)
					let zipBlob = await rawResp.blob()
					let fileName = zipPath.split("/").filter(Boolean).pop() || "archive.zip"
					if (!fileName.toLowerCase().endsWith(".zip")) {
						fileName = `${fileName}.zip`
					}
					let result = await window.fsClient.extract_zip(zipBlob, targetDir, fileName)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: extract_zip result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: extract_zip failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_create_folder",
			"description": "Create a filesystem folder.",
			"args": {
				"path": "<folder path>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let approved = await confirmFsMutation("fs_create_folder", { path: action?.args?.path })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.mkdir(action?.args?.path)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_delete_folder",
			"description": "Delete a filesystem folder and all files under it.",
			"args": {
				"path": "<folder path>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let approved = await confirmFsMutation("fs_delete_folder", { path: action?.args?.path })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.rmdir(action?.args?.path)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_open_embed",
			"description": `Open or replace a named floating embed window for a filesystem file URL. Position and size are clamped to the viewport and the header can be dragged to reposition. Current viewport: ${window.innerWidth}x${window.innerHeight}px.`,
			"args": {
				"name": "<unique embed name>",
				"file_path": "<filesystem file path>",
				"x": {
					description: "<x coordinate in pixels>",
					type: "integer"
				},
				"y": {
					description: "<y coordinate in pixels>",
					type: "integer"
				},
				"width": {
					description: "<window width in pixels>",
					type: "integer"
				},
				"height": {
					description: "<window height in pixels>",
					type: "integer"
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let result = await openFsEmbedByName(action?.args || {})
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: open_embed result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: open_embed failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_close_embed",
			"description": "Close a named floating filesystem embed window if it exists. No error is thrown if it is already closed.",
			"args": {
				"name": "<embed name to close>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let result = closeFsEmbedByName(action?.args?.name)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: close_embed result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: close_embed failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "generate_tts",
			"description": "Generate speech with Kobold TTS and play it for the user.",
			"args": {
				"textToSay": "<text to say>",
				"voice": {
					description: "<voice from KoboldCpp speakers list>",
					type: "string",
					enum: getKcppVoiceOptionsForCommand()
				}
			},
			"outputVisibleToUser": true,
			"enabled": localsettings.tts_mode == KCPP_TTS_ID, // Only enabled if local endpoint exists / is in use
			"executor": async (action) => {
				let textToSay = action?.args?.textToSay
				if (!!textToSay) {
					let voiceConfig = await resolveKcppVoiceForPayload(action?.args?.voice)
					await tts_speak(textToSay, false, false, false, voiceConfig.voice)
					addThought(currentChainOfThought, createSysPrompt, `Text has been spoken`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `No text provided, nothing has been said`)
				}
			}
		},
		{
			"name": "fs_generate_tts",
			"description": "Generate TTS audio with Kobold and save it to a filesystem output path.",
			"args": {
				"textToSay": "<text to say>",
				"voice": {
					description: "<voice from KoboldCpp speakers list>",
					type: "string",
					enum: getKcppVoiceOptionsForCommand()
				},
				"fs_output_path": "<filesystem output path for generated audio (.wav)>"
			},
			"enabled": (localsettings.tts_mode == KCPP_TTS_ID) && is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let textToSay = `${action?.args?.textToSay || ""}`.trim()
					let outputPath = `${action?.args?.fs_output_path || ""}`.trim()
					if (textToSay === "" || outputPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_tts failed - textToSay and fs_output_path are required`)
						return
					}
					let approved = await confirmFsMutation("fs_generate_tts", { fs_output_path: outputPath })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_tts cancelled by confirmation dialog`)
						return
					}
					let voiceConfig = await resolveKcppVoiceForPayload(action?.args?.voice)
					let payload = {
						input: textToSay,
						voice: voiceConfig.voice,
					}
					if (!!voiceConfig.speaker_json) {
						payload.speaker_json = voiceConfig.speaker_json
					}
					let response = await postKcppJson(koboldcpp_tts_endpoint, payload)
					let audioBuffer = await response.arrayBuffer()
					let result = await window.fsClient.write(outputPath, new Uint8Array(audioBuffer))
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_tts result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_tts failed - ${e?.message || e}`)
				}
			}
		}
	]
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