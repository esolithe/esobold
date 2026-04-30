import { getSymbols, editSymbol, detectErrors, detectWarnings, fileExtensionToLanguageName } from '../treeSitterGrammarLoader.js'

const MAX_SYMBOLS_RETURNED = 100

// Validate that `content` (a string) contains no tree-sitter syntax errors.
// Only runs when the file extension is supported and content length <= 100000.
// Returns null on success, or an error message string on failure.
let validateCodeContent = async (fsPath, content) => {
	if (typeof content !== 'string' || content.length > 100000) {
		return null
	}
	let ext = `${fsPath || ""}`.split('.').pop() || ""
	let langName = fileExtensionToLanguageName(ext)
	if (!langName) {
		return null
	}
	let errors = await detectErrors(langName, content)
	if (errors.length > 0) {
		return `syntax errors detected in ${fsPath}:\n${JSON.stringify(errors, null, 2)}`
	}
	return null
}

let normalizeBase64ImageData = (input = "") => {
	let value = `${input || ""}`
	let parts = value.split(",")
	if (parts.length === 2 && parts[0].startsWith("data:")) {
		return parts[1]
	}
	return value
}

let syncFsBasicAuthPasswordFromAdminHeaders = () => {
	if (typeof window.getAuthHeaders !== "function") {
		return
	}
	let headers = window.getAuthHeaders() || {}
	let authHeader = `${headers.Authorization || headers.authorization || ""}`.trim()
	if (!authHeader.toLowerCase().startsWith("bearer ")) {
		return
	}
	window.kcppFsBasicAuthPassword = authHeader.substring(7).trim()
}

let ensureFsAdminPasswordIfRequired = async () => {
	if (typeof window.promptForAdminPassword !== "function") {
		return
	}
	if (typeof koboldcpp_admin_type !== "undefined" && koboldcpp_admin_type !== 2) {
		window.kcppFsBasicAuthPassword = ""
		return
	}
	await new Promise((resolve) => window.promptForAdminPassword(resolve))
	syncFsBasicAuthPasswordFromAdminHeaders()
}

window.getFsClientAuthHeaders = () => {
	let password = `${window.kcppFsBasicAuthPassword || ""}`
	if (password === "") {
		syncFsBasicAuthPasswordFromAdminHeaders()
		password = `${window.kcppFsBasicAuthPassword || ""}`
	}
	if (password === "") {
		return {}
	}
	return {
		Authorization: `Basic ${btoa(`kcpp:${password}`)}`,
	}
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
	await ensureFsAdminPasswordIfRequired()
	let rawResp = await window.fsClient.fetch_raw(fsPath)
	let blob = await rawResp.blob()
	return await blobToDataUrl(blob)
}

let readFsPathAsBase64 = async (fsPath) => {
	return normalizeBase64ImageData(await readFsPathAsDataUrl(fsPath))
}

let writeBase64ToFs = async (fsPath, base64Data) => {
	await ensureFsAdminPasswordIfRequired()
	let bytes = base64ToUint8Array(base64Data)
	return await window.fsClient.write([{ path: fsPath, content: bytes, isB64: true }])
}

let confirmFsMutation = async (mutationName, payload = {}) => {
	await ensureFsAdminPasswordIfRequired()
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

let getAgentFsContentCharLimit = () => {
	let parsedLimit = parseInt(`${localsettings?.agentFsContentCharLimit ?? 5000}`)
	if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
		return 5000
	}
	return parsedLimit
}

let limitFsContentResultForAgent = (result, limit = 5000) => {
	let truncateEntry = (entry) => {
		if (!entry || !Array.isArray(entry.lines)) {
			return entry
		}

		let usedCharacters = 0
		let didTruncate = false
		let truncatedLines = []
		for (let lineObj of entry.lines) {
			let lineContent = `${lineObj?.content ?? ""}`
			if (usedCharacters >= limit) {
				didTruncate = true
				break
			}
			let remainingCharacters = limit - usedCharacters
			if (lineContent.length <= remainingCharacters) {
				truncatedLines.push({ ...lineObj, content: lineContent })
				usedCharacters += lineContent.length
				continue
			}

			truncatedLines.push({ ...lineObj, content: lineContent.substring(0, remainingCharacters) })
			usedCharacters += remainingCharacters
			didTruncate = true
			break
		}

		if (!didTruncate) {
			return entry
		}

		let totalLines = parseInt(`${entry?.total_lines ?? 0}`, 10) || 0
		let startLine = parseInt(`${entry?.start_line ?? 0}`, 10) || 0
		let endLine = parseInt(`${entry?.end_line ?? 0}`, 10) || 0
		let wholeFileWasRequested = totalLines > 0 && startLine <= 1 && endLine >= totalLines
		let fallbackTotalCharacters = Array.isArray(entry.lines)
			? entry.lines.reduce((sum, lineObj) => sum + `${lineObj?.content ?? ""}`.length, 0)
			: 0
		let totalCharacters = parseInt(`${entry?.total_characters ?? fallbackTotalCharacters}`, 10) || fallbackTotalCharacters

		return {
			...entry,
			lines: truncatedLines,
			end_line: truncatedLines.length > 0 ? truncatedLines[truncatedLines.length - 1].line : 0,
			total_characters: totalCharacters,
			truncated_by_agent_char_limit: true,
			agent_content_char_limit: limit,
			returned_content_characters: usedCharacters,
			truncation_note: wholeFileWasRequested
				? `Content truncated to ${limit} characters for agent context. File totals: ${totalLines} lines, ${totalCharacters} characters.`
				: `Content truncated to ${limit} characters for agent context.`,
		}
	}

	if (Array.isArray(result?.results)) {
		return {
			...result,
			results: result.results.map(entry => truncateEntry(entry)),
		}
	}

	return truncateEntry(result)
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
	let htmlExtensions = [".html", ".htm"]
	if (imageExtensions.some((ext) => normalized.endsWith(ext))) {
		return "image"
	}
	if (videoExtensions.some((ext) => normalized.endsWith(ext))) {
		return "video"
	}
	if (audioExtensions.some((ext) => normalized.endsWith(ext))) {
		return "audio"
	}
	if (htmlExtensions.some((ext) => normalized.endsWith(ext))) {
		return "html"
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
	if (kind === "html") {
		let iframeElem = document.createElement("iframe")
		iframeElem.className = "kcpp-fs-embed-content kcpp-fs-embed-iframe"
		iframeElem.frameBorder = "0"
		return iframeElem
	}
	let embedElem = document.createElement("embed")
	embedElem.className = "kcpp-fs-embed-content"
	embedElem.type = "text/html"
	return embedElem
}

let openFsEmbedByName = async (args = {}) => {
	await ensureFsAdminPasswordIfRequired()
	let normalizedName = `${args?.name || ""}`.trim()
	let targetPath = `${args?.file_path || args?.path || ""}`.trim()
	if (normalizedName === "") {
		throw new Error("Missing embed name.")
	}
	if (targetPath === "") {
		throw new Error("Missing filesystem file path.")
	}
	let layout = clampFsEmbedLayout(args)
	let urlInfo = await window.fsClient.url([{ path: targetPath }])
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
				window.open(srcUrl, "_blank")
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

window.openFsEmbedByName = openFsEmbedByName
window.closeFsEmbedByName = closeFsEmbedByName

export const buildFilesystemCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		objToText,
		preparePromptForImageGen,
		requestUserSelectedImageForAgent,
		createInstructPrompt,
		resolveKcppVoiceForPayload,
		getKcppVoiceOptionsForCommand,
	} = ctx

	return [
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
				"fs_input_path": "<optional absolute filesystem path to reference audio>",
				"fs_output_path": "<absolute filesystem output path for generated audio (.wav/.mp3)>"
			},
			"enabled": is_using_kcpp_with_musicgen() && is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let args = action?.args || {}
					let outputPath = `${args.fs_output_path || ""}`.trim()
					if (outputPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_music failed - fs_output_path is required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					let writeResult = await window.fsClient.write([{ path: outputPath, content: new Uint8Array(audioData) }])
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_music result\n${objToText(writeResult)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_music failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_transcribe",
			"description": "Transcribe a .wav audio file from the filesystem using KoboldCpp transcribe endpoint.",
			"args": {
				"path": "<absolute filesystem path to .wav file>",
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
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					description: "<optional array of absolute filesystem image paths to use as inputs>",
					format: {
						type: "array",
						items: { type: "string" }
					}
				},
				"fs_output_path": "<absolute filesystem output path for generated image>"
			},
			"enabled": (localsettings.generate_images_mode == 2) && is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let args = action?.args || {}
					let prompt = `${args.prompt || ""}`.trim()
					let outputPath = `${args.fs_output_path || ""}`.trim()
					if (prompt === "" || outputPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_image failed - prompt and fs_output_path are required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					let outputBase64 = await generateA1111ImageBase64(preparePromptForImageGen(prompt), args.aspect, null, inputImages)
					let writeResult = await writeBase64ToFs(outputPath, outputBase64)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_image result\n${objToText(writeResult)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_image failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "describe_fs_image",
			"description": "Describe an image from a filesystem file path. Incompatible with click-selected chat images.",
			"args": {
				"path": "<absolute filesystem image path>",
				"question": "<optional focus question>"
			},
			"enabled": is_using_kcpp_with_fs() && is_using_kcpp_with_vision(),
			"executor": async (action) => {
				try {
					let fsPath = `${action?.args?.path || ""}`.trim()
					if (fsPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: describe_fs_image failed - path is required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_search",
			"description": "Search file contents in the filesystem using a regex pattern.",
			"args": {
				"pattern": {
					description: "<regex pattern>",
					type: "string"
				},
				"path_pattern": {
					description: "<glob filter for absolute filesystem paths, default *>",
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
					let result = await window.fsClient.search_regex(action?.args?.pattern, action?.args?.path_pattern, action?.args?.max_results, action?.args?.case_insensitive)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: search result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: search failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_semantic_search",
			"description": "Semantic-search a filesystem document. The backend handles text extraction, embedding generation and caching automatically. Supports plain text, PDF, and any other format the backend extraction logic can handle.",
			"args": {
				"path": "<absolute filesystem path to a document file>",
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
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
					}
					else {
						let ltmContent = "Semantic search performed:"
						for (let i = 0; i < result.length; ++i) {
							ltmContent += getInfoSnippet(result[i])
						}
						addThought(currentChainOfThought, createSysPrompt, ltmContent)
					}
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: semantic search failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_metadata",
			"description": "Get metadata for one or more filesystem files using an operations array.",
			"args": {
				"operations": {
					description: "<array of {path} objects; use one entry for a single file>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" }
							},
							required: ["path"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path} objects.")
					}
					let result = await window.fsClient.metadata(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: metadata result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: metadata failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_url",
			"description": "Get public URLs for one or more filesystem files using an operations array.",
			"args": {
				"operations": {
					description: "<array of {path} objects; use one entry for a single file>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" }
							},
							required: ["path"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path} objects.")
					}
					let result = await window.fsClient.url(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: url result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: url failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_content",
			"description": "Read line-based text content from one or more filesystem files using an operations array.",
			"args": {
				"operations": {
					description: "<array of {path, start, end} objects; use one entry for a single file>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" },
								"start": { type: "integer" },
								"end": { type: "integer" }
							},
							required: ["path"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path, start, end} objects.")
					}
					let result = await window.fsClient.content(operations)
					let limitedResult = limitFsContentResultForAgent(result, getAgentFsContentCharLimit())
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: content result\n${objToText(limitedResult)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: content failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_download_info",
			"description": "Get filesystem download information for the full filesystem or one subdirectory.",
			"args": {
				"dir": {
					description: "<optional absolute filesystem directory prefix>",
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
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_write_text",
			"description": "Write plain text content to one or more filesystem files using an operations array.",
			"args": {
				"operations": {
					description: "<array of {path, content} objects; use one entry for a single file>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" },
								"content": { type: "string" }
							},
							required: ["path", "content"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path, content} objects.")
					}
					for (let op of operations) {
						let validationError = await validateCodeContent(op.path, op.content)
						if (validationError) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_text failed - ${validationError}`)
							if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
							return
						}
					}
					let approved = await confirmFsMutation("fs_write_text", { operations })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_text cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.write(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_text result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_text failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_write_lines",
			"description": "Write or append lines in one or more filesystem text files using an operations array.",
			"args": {
				"operations": {
					description: "<array of {path, lines, start_line, append} objects; use one entry for a single file>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" },
								"lines": {
									type: "array",
									items: { type: "string" }
								},
								"start_line": { type: "integer" },
								"append": { type: "boolean" }
							},
							required: ["path", "lines"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path, lines, start_line, append} objects.")
					}
					for (let op of operations) {
						let lineContent = Array.isArray(op.lines) ? op.lines.join('\n') : null
						if (lineContent !== null) {
							let validationError = await validateCodeContent(op.path, lineContent)
							if (validationError) {
								addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_lines failed - ${validationError}`)
								if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
								return
							}
						}
					}
					let approved = await confirmFsMutation("fs_write_lines", { operations })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_lines cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.write_lines(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_lines result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: write_lines failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_delete",
			"description": "Delete one or more filesystem files using an operations array.",
			"args": {
				"operations": {
					description: "<array of {path} objects; use one entry for a single file>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" }
							},
							required: ["path"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path} objects.")
					}
					let approved = await confirmFsMutation("fs_delete", { operations })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.delete(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_move",
			"description": "Move or rename one or more filesystem files or directories using an 'operations' array (use one entry for a single move).",
			"args": {
				"operations": {
					description: "<array of {source, destination} objects; use one entry for a single move>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"source": { type: "string", description: "<absolute source filesystem path>" },
								"destination": { type: "string", description: "<absolute destination filesystem path>" }
							},
							required: ["source", "destination"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {source, destination} objects.")
					}
					let approved = await confirmFsMutation("fs_move", { operations })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.move(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_copy",
			"description": "Copy one or more filesystem files or directories using an 'operations' array (use one entry for a single copy).",
			"args": {
				"operations": {
					description: "<array of {source, destination} objects; use one entry for a single copy>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"source": { type: "string", description: "<absolute source filesystem path>" },
								"destination": { type: "string", description: "<absolute destination filesystem path>" }
							},
							required: ["source", "destination"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {source, destination} objects.")
					}
					let approved = await confirmFsMutation("fs_copy", { operations })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.copy(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_extract_zip",
			"description": "Extract a .zip file from the filesystem into a target filesystem directory.",
			"args": {
				"zip_path": "<absolute filesystem .zip file path>",
				"target_dir": {
					description: "<absolute target directory, default />",
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
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_create_folder",
			"description": "Create one or more filesystem folders using an operations array.",
			"args": {
				"operations": {
					description: "<array of {path} objects; use one entry for a single folder>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" }
							},
							required: ["path"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path} objects.")
					}
					let approved = await confirmFsMutation("fs_create_folder", { operations })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.mkdir(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_delete_folder",
			"description": "Delete one or more filesystem folders using an operations array.",
			"args": {
				"operations": {
					description: "<array of {path} objects; use one entry for a single folder>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" }
							},
							required: ["path"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path} objects.")
					}
					let approved = await confirmFsMutation("fs_delete_folder", { operations })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.rmdir(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_replace_regex",
			"description": "Replace text in one or more filesystem files using an 'operations' array of {path, pattern, replacement} objects (use one entry for a single file).",
			"args": {
				"operations": {
					description: "<array of {path, pattern, replacement} objects; use one entry for a single file>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"path": { type: "string", description: "<absolute filesystem path>" },
								"pattern": { type: "string" },
								"replacement": { type: "string" }
							},
							required: ["path", "pattern", "replacement"]
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (!Array.isArray(operations) || operations.length === 0) {
						throw new Error("operations must be a non-empty array of {path, pattern, replacement} objects.")
					}
					let approved = await confirmFsMutation("fs_replace_regex", { operations })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.replace_regex(operations)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_open_embed",
			"description": `Open or replace a named floating embed window for a filesystem file URL. Position and size are clamped to the viewport and the header can be dragged to reposition. Current viewport: ${window.innerWidth}x${window.innerHeight}px.`,
			"args": {
				"name": "<unique embed name>",
				"file_path": "<absolute filesystem file path>",
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
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
				"fs_output_path": "<absolute filesystem output path for generated audio (.wav)>"
			},
			"enabled": (localsettings.tts_mode == KCPP_TTS_ID) && is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let textToSay = `${action?.args?.textToSay || ""}`.trim()
					let outputPath = `${action?.args?.fs_output_path || ""}`.trim()
					if (textToSay === "" || outputPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_tts failed - textToSay and fs_output_path are required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
					let result = await window.fsClient.write([{ path: outputPath, content: new Uint8Array(audioBuffer) }])
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_tts result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: generate_tts failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_code_get_symbols",
			"description": `Parse a source code file from the filesystem and return all top-level symbols (functions, classes, variables, etc.) it contains. Results are limited to the top ${MAX_SYMBOLS_RETURNED} symbols in the file.`,
			"args": {
				"path": "<absolute filesystem path to the source file>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let fsPath = `${action?.args?.path || ""}`.trim()
					if (fsPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_get_symbols failed - path is required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let ext = fsPath.split('.').pop() || ""
					let langName = fileExtensionToLanguageName(ext)
					if (!langName) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_get_symbols failed - unsupported file extension ".${ext}"`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let contentResult = await window.fsClient.content([{ path: fsPath }])
					let sourceCode = contentResult?.lines?.map(c => c.content).join("\n") || ""
					let symbols = await getSymbols(langName, sourceCode)
					let formattedSymbols = symbols?.filter(c => c?.type !== "lexical_declaration")?.sort((a, b) => {
    						return a.text.length > b.text.length ? -1 : 1
						}).slice(0, MAX_SYMBOLS_RETURNED).map(c => {
							return {type: c.type, name: c.name, startLine: c?.startPosition?.row, endLine: c?.endPosition?.row}
						})?.reduce((c, a) => {
							c[a.name] = c[a.name] || {}
							c[a.name][a.type] = c[a.name][a.type] || []
							c[a.name][a.type].push({startLine: a.startLine, endLine: a.endLine})
							return c
						}, {})
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_get_symbols result\n${objToText(formattedSymbols)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_get_symbols failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_code_edit_symbol",
			"description": "Replace the body of a named symbol (function, class, etc.) in a source code file on the filesystem. The new text is syntax-validated before the file is written; the edit is rejected if the replacement introduces parse errors. The new text only replaces the first body of the symbol, not its declaration or signature.",
			"args": {
				"path": "<absolute filesystem path to the source file>",
				"symbol_name": "<name of the symbol to replace>",
				"new_text": "<replacement source text for the symbol>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let args = action?.args || {}
					let fsPath = `${args.path || ""}`.trim()
					let symbolName = `${args.symbol_name || ""}`.trim()
					let newText = `${args.new_text || ""}`.trim()
					if (fsPath === "" || symbolName === "" || newText === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_edit_symbol failed - path, symbol_name and new_text are required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let ext = fsPath.split('.').pop() || ""
					let langName = fileExtensionToLanguageName(ext)
					if (!langName) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_edit_symbol failed - unsupported file extension ".${ext}"`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let approved = await confirmFsMutation("fs_code_edit_symbol", { path: fsPath, symbol_name: symbolName })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_edit_symbol cancelled by confirmation dialog`)
						return
					}
					let contentResult = await window.fsClient.content([{ path: fsPath }])
					let sourceCode = contentResult?.lines?.map(c => c.content).join("\n") || ""
					let editResult = await editSymbol(langName, sourceCode, symbolName, newText)
					if (!editResult.ok) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_edit_symbol failed - syntax validation rejected the edit\n${objToText(editResult.errors)}`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let writeResult = await window.fsClient.write([{ path: fsPath, content: editResult.result }])
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_edit_symbol result\n${objToText(writeResult)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_edit_symbol failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_code_detect_errors",
			"description": "Parse a source code file from the filesystem and return any syntax errors detected by the tree-sitter grammar.",
			"args": {
				"path": "<absolute filesystem path to the source file>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let fsPath = `${action?.args?.path || ""}`.trim()
					if (fsPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_detect_errors failed - path is required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let ext = fsPath.split('.').pop() || ""
					let langName = fileExtensionToLanguageName(ext)
					if (!langName) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_detect_errors failed - unsupported file extension ".${ext}"`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let contentResult = await window.fsClient.content([{ path: fsPath }])
					let sourceCode = contentResult?.lines?.map(c => c.content).join("\n") || ""
					let errors = await detectErrors(langName, sourceCode)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_detect_errors result (${errors.length} error(s))\n${objToText(errors)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_detect_errors failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "fs_code_detect_warnings",
			"description": "Parse a source code file from the filesystem and return any syntax warnings (missing or unexpected tokens) detected by the tree-sitter grammar.",
			"args": {
				"path": "<absolute filesystem path to the source file>"
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let fsPath = `${action?.args?.path || ""}`.trim()
					if (fsPath === "") {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_detect_warnings failed - path is required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let ext = fsPath.split('.').pop() || ""
					let langName = fileExtensionToLanguageName(ext)
					if (!langName) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_detect_warnings failed - unsupported file extension ".${ext}"`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let contentResult = await window.fsClient.content([{ path: fsPath }])
					let sourceCode = contentResult?.lines?.map(c => c.content).join("\n") || ""
					let warnings = await detectWarnings(langName, sourceCode)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_detect_warnings result (${warnings.length} warning(s))\n${objToText(warnings)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: code_detect_warnings failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
	]
}
