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

let applyPersistentBackgroundImage = async (imageDataUri) => {
	let selectedImg = `url('${imageDataUri}')`
	document.body.style.backgroundImage = selectedImg
	document.getElementById("gamescreen")?.classList.add("translucentbg")
	document.getElementById("enhancedchatinterface")?.classList.add("transparentbg")
	document.getElementById("enhancedchatinterface_inner")?.classList.add("transparentbg")
	await indexeddb_save("bgimg", imageDataUri)
}

let setBackgroundImageFromFilesystemPath = async (fsImagePath) => {
	if (!window?.fsClient) {
		throw new Error("Filesystem APIs are not available.")
	}

	let normalizedPath = `${fsImagePath || ""}`.trim()
	if (normalizedPath === "") {
		throw new Error("fs_image_path is required")
	}

	await window.fsClient.metadata([{ path: normalizedPath }])
	let rawResp = await window.fsClient.fetch_raw(normalizedPath)
	let imageBlob = await rawResp.blob()
	let mimeType = `${imageBlob?.type || ""}`.toLowerCase()
	let hasImageMime = mimeType.startsWith("image/")
	let normalizedLowerPath = normalizedPath.toLowerCase()
	let hasImageExt = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif", ".ico"].some((ext) => normalizedLowerPath.endsWith(ext))
	if (!hasImageMime && !hasImageExt) {
		throw new Error("fs_image_path must reference an image file")
	}

	let objectUrl = URL.createObjectURL(imageBlob)
	try {
		let maxRes = !!localsettings?.img_allowhd ? 8000 : 1024
		let quality = !!localsettings?.img_allowhd ? 0.95 : 0.5
		let compressedImageUri = await new Promise((resolve, reject) => {
			compressImage(objectUrl, (result) => {
				if (!!result) {
					resolve(result)
				}
				else {
					reject(new Error("Image compression failed"))
				}
			}, false, maxRes, quality)
		})
		await applyPersistentBackgroundImage(compressedImageUri)
		return {
			path: normalizedPath,
			compressed_image_length: `${compressedImageUri || ""}`.length,
		}
	}
	finally {
		URL.revokeObjectURL(objectUrl)
	}
}

export const buildMediaCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		createInstructPrompt,
		requestUserSelectedImageForAgent,
		waitForAgentImageGeneration,
		preparePromptForImageGen,
		objToText,
		resolveKcppVoiceForPayload,
		getKcppVoiceOptionsForCommand,
	} = ctx

	return [
		{
			"name": "describe_clicked_image",
			"description": "Describe an image that the user clicks in chat. Incompatible with filesystem file paths.",
			"args": {
				"question": "<question to ask about image>"
			},
			"enabled": is_using_kcpp_with_vision(),
			"executor": async (action) => {
				let analysisPrompt = "Describe the image in detail. Transcribe and include any text from the image in the description."
				if (!!action?.args?.question) {
					analysisPrompt += `Specifically please focus on:\n\n${action?.args?.question}`
				}
				if (!!analysisPrompt) {
					let selectedImage = await requestUserSelectedImageForAgent(agentRunState, currentChainOfThought, `Please click an image as a source for image analysis`)
					if (!!selectedImage) {
						let analysisResult = await generateAndGetTextFromPrompt(`${createInstructPrompt(analysisPrompt)}${instructendplaceholder}${!!localsettings?.inject_jailbreak_instruct ? localsettings.custom_jailbreak_text : ""}`, undefined, [selectedImage])
						addThought(currentChainOfThought, createSysPrompt, `Image analysed: ${analysisResult}`)
					}
					else {
						addThought(currentChainOfThought, createSysPrompt, `User did not select an image - no image analysed`)
					}
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
			"enabled": localsettings.generate_images_mode == 2,
			"executor": async (action) => {
				let prompt = action?.args?.prompt
				let aspect = action?.args?.aspect
				if (!!prompt) {
					if (!!action?.args?.edit_existing_image) {
						let selectedImage = await requestUserSelectedImageForAgent(agentRunState, currentChainOfThought, `Please click an image as a source for img2img generation`)
						if (!!selectedImage) {
							let imageId = generate_new_image(preparePromptForImageGen(prompt), selectedImage, true, calcImageSizing(aspect))
							await waitForAgentImageGeneration(imageId)
							addThought(currentChainOfThought, createSysPrompt, `Image generated`)
						}
						else {
							addThought(currentChainOfThought, createSysPrompt, `User did not select an image - no image generated`)
						}
					}
					else {
						let imageId = generate_new_image(preparePromptForImageGen(prompt), undefined, true, calcImageSizing(aspect))
						await waitForAgentImageGeneration(imageId)
						addThought(currentChainOfThought, createSysPrompt, `Image generated`)
					}
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `No prompt provided, image not generated`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
		{
			"name": "set_background_image_from_filesystem",
			"description": "Set the UI decorative background image from a filesystem image path and persist it in the same local background setting used by Lite.",
			"args": {
				"fs_image_path": "<absolute filesystem path to an image file>",
			},
			"enabled": typeof is_using_kcpp_with_fs === "function" ? is_using_kcpp_with_fs() : !!window?.fsClient,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				try {
					let fsImagePath = `${action?.args?.fs_image_path || ""}`.trim()
					if (fsImagePath === "") {
						addThought(currentChainOfThought, createSysPrompt, `Background image update failed - fs_image_path is required`)
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let result = await setBackgroundImageFromFilesystemPath(fsImagePath)
					addThought(currentChainOfThought, createSysPrompt, `Background image updated from filesystem path\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `Background image update failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
						if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
						return
					}
					let response = await postKcppJson("/api/extra/music/prepare", { caption })
					let result = await response.json()
					mergeMusicPrepareIntoState(result)
					addThought(currentChainOfThought, createSysPrompt, `Music prepare succeeded and state has been updated\n${objToText(result)}`)
				}
				catch (e) {
					addThought(currentChainOfThought, createSysPrompt, `Music prepare failed - ${e?.message || e}`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
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
			"enabled": localsettings.tts_mode == KCPP_TTS_ID,
			"executor": async (action) => {
				let textToSay = action?.args?.textToSay
				if (!!textToSay) {
					let voiceConfig = await resolveKcppVoiceForPayload(action?.args?.voice)
					await tts_speak(textToSay, false, false, false, voiceConfig.voice)
					addThought(currentChainOfThought, createSysPrompt, `Text has been spoken`)
				}
				else {
					addThought(currentChainOfThought, createSysPrompt, `No text provided, nothing has been said`)
					if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
				}
			}
		},
	]
}
