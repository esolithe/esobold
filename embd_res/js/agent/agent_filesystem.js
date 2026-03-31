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
					let outputBase64 = await generateA1111ImageBase64(preparePromptForImageGen(prompt), args.aspect, null, inputImages)
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
						let ltmContent = "Semantic search performed:"
						for (let i = 0; i < result.length; ++i) {
							ltmContent += getInfoSnippet(result[i])
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
			"description": "Delete one or more filesystem files. Pass a single path via 'path', or an array of paths via 'paths' to delete multiple files at once.",
			"args": {
				"path": {
					description: "<file path, used when deleting a single file>",
					type: "string"
				},
				"paths": {
					description: "<array of file paths, used when deleting multiple files>",
					type: "array",
					items: { type: "string" }
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let paths = action?.args?.paths
					if (Array.isArray(paths)) {
						let approved = await confirmFsMutation("fs_delete", { paths })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.delete_many(paths)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete result\n${objToText(result)}`)
					} else {
						let approved = await confirmFsMutation("fs_delete", { path: action?.args?.path })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.delete(action?.args?.path)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete result\n${objToText(result)}`)
					}
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_move",
			"description": "Move or rename filesystem files or directories. Pass 'source' and 'destination' for a single operation, or an 'operations' array of {source, destination} objects to move multiple items at once. Supports moving both files and directories.",
			"args": {
				"source": {
					description: "<source file or directory path, used for a single move>",
					type: "string"
				},
				"destination": {
					description: "<destination file or directory path, used for a single move>",
					type: "string"
				},
				"operations": {
					description: "<array of {source, destination} objects for moving multiple items>",
					type: "array",
					items: {
						type: "object",
						properties: {
							"source": { type: "string" },
							"destination": { type: "string" }
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (Array.isArray(operations)) {
						let approved = await confirmFsMutation("fs_move", { operations })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.move_many(operations)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move result\n${objToText(result)}`)
					} else {
						let approved = await confirmFsMutation("fs_move", { source: action?.args?.source, destination: action?.args?.destination })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.move(action?.args?.source, action?.args?.destination)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move result\n${objToText(result)}`)
					}
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: move failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_copy",
			"description": "Copy filesystem files or directories. Pass 'source' and 'destination' for a single copy, or an 'operations' array of {source, destination} objects to copy multiple items at once. Supports copying both files and directories.",
			"args": {
				"source": {
					description: "<source file or directory path, used for a single copy>",
					type: "string"
				},
				"destination": {
					description: "<destination file or directory path, used for a single copy>",
					type: "string"
				},
				"operations": {
					description: "<array of {source, destination} objects for copying multiple items>",
					type: "array",
					items: {
						type: "object",
						properties: {
							"source": { type: "string" },
							"destination": { type: "string" }
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					if (Array.isArray(operations)) {
						let approved = await confirmFsMutation("fs_copy", { operations })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.copy_many(operations)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy result\n${objToText(result)}`)
					} else {
						let approved = await confirmFsMutation("fs_copy", { source: action?.args?.source, destination: action?.args?.destination })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.copy(action?.args?.source, action?.args?.destination)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: copy result\n${objToText(result)}`)
					}
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
			"description": "Create one or more filesystem folders. Pass 'path' as an array of folder paths (use a one-item array for a single folder).",
			"args": {
				"path": {
					description: "<array of folder paths; use one-item array for single folder>",
					type: "array",
					items: { type: "string" }
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let pathArg = action?.args?.path
					if (!Array.isArray(pathArg) || pathArg.length === 0) {
						throw new Error("path must be a non-empty array of folder paths.")
					}
					let approved = await confirmFsMutation("fs_create_folder", { path: pathArg })
					if (!approved) {
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder cancelled by confirmation dialog`)
						return
					}
					let result = await window.fsClient.mkdir(pathArg)
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder result\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: create_folder failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_delete_folder",
			"description": "Delete one or more filesystem folders and all files under them. Pass a single path via 'path', or an array of paths via 'paths' to delete multiple folders at once.",
			"args": {
				"path": {
					description: "<folder path, used when deleting a single folder>",
					type: "string"
				},
				"paths": {
					description: "<array of folder paths, used when deleting multiple folders>",
					type: "array",
					items: { type: "string" }
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let paths = action?.args?.paths
					if (Array.isArray(paths)) {
						let approved = await confirmFsMutation("fs_delete_folder", { paths })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.rmdir_many(paths)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder result\n${objToText(result)}`)
					} else {
						let approved = await confirmFsMutation("fs_delete_folder", { path: action?.args?.path })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.rmdir(action?.args?.path)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder result\n${objToText(result)}`)
					}
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: delete_folder failed - ${e?.message || e}`)
				}
			}
		},
		{
			"name": "fs_replace_regex",
			"description": "Replace text in one or more filesystem text files using a regular expression pattern. Pass 'path' with 'pattern' and 'replacement' for a single file, 'paths' (array) with shared 'pattern' and 'replacement' to apply the same substitution to multiple files, or 'operations' (array of {path, pattern, replacement}) for per-file patterns.",
			"args": {
				"path": {
					description: "<file path, used when replacing in a single file>",
					type: "string"
				},
				"paths": {
					description: "<array of file paths, used when applying the same pattern to multiple files>",
					type: "array",
					items: { type: "string" }
				},
				"pattern": {
					description: "<regular expression pattern string>",
					type: "string"
				},
				"replacement": {
					description: "<replacement string, may use back-references such as \\1>",
					type: "string"
				},
				"operations": {
					description: "<array of {path, pattern, replacement} objects for per-file patterns>",
					type: "array",
					items: {
						type: "object",
						properties: {
							"path": { type: "string" },
							"pattern": { type: "string" },
							"replacement": { type: "string" }
						}
					}
				}
			},
			"enabled": is_using_kcpp_with_fs(),
			"executor": async (action) => {
				try {
					let operations = action?.args?.operations
					let paths = action?.args?.paths
					if (Array.isArray(operations)) {
						let approved = await confirmFsMutation("fs_replace_regex", { operations })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient._post('/api/extra/fs/replace_regex', { operations })
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex result\n${objToText(result)}`)
					} else if (Array.isArray(paths)) {
						let approved = await confirmFsMutation("fs_replace_regex", { paths, pattern: action?.args?.pattern, replacement: action?.args?.replacement })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.replace_regex_many(paths, action?.args?.pattern, action?.args?.replacement)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex result\n${objToText(result)}`)
					} else {
						let approved = await confirmFsMutation("fs_replace_regex", { path: action?.args?.path, pattern: action?.args?.pattern, replacement: action?.args?.replacement })
						if (!approved) {
							addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex cancelled by confirmation dialog`)
							return
						}
						let result = await window.fsClient.replace_regex(action?.args?.path, action?.args?.pattern, action?.args?.replacement)
						addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex result\n${objToText(result)}`)
					}
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `FS_TOOL: replace_regex failed - ${e?.message || e}`)
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
		},
	]
}
