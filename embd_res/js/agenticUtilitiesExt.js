let getObjectGNBF = async (object) => {
	let opt = {
		method: 'POST', // or 'PUT'
		headers: get_kobold_header(),
		body: JSON.stringify({ schema: toJsonSchema(object) }),
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

window.generateTextFromAI = async (prompt, keepThinkingTags = false) => {
    let formattedPrompt = createInstructPrompt(prompt)
	let text = await generateAndGetTextFromPrompt(formattedPrompt) || ""
	if (!keepThinkingTags) {
		// Remove any thinking tags from the response, as those are meant for the agent's internal processing and not for display
		text = text.replace(new RegExp(`${localsettings.start_thinking_tag}.*?${localsettings.stop_thinking_tag}`, "is"), "").trim()
	}
	return text
}

window.generateImageFromAI = async (prompt, imageToStartFrom = undefined) => {
    let formattedPrompt = createInstructPrompt(prompt)
	let styledPrompt = `${preparePromptForImageGen(formattedPrompt) || ""}`
	if (!!localsettings.image_styles && localsettings.image_styles !== "") {
		styledPrompt = `${localsettings.image_styles} ${styledPrompt}`
	}
	styledPrompt = styledPrompt.replace(/###/gm, "")
	let negprompt = localsettings.image_negprompt ? (` ### ${localsettings.image_negprompt}`) : ""
	if (localsettings.image_negprompt == "none") {
		negprompt = ""
	}

	let sourceImage = `${imageToStartFrom || ""}`.trim()
	if (sourceImage.startsWith("data:")) {
		sourceImage = sourceImage.split(",")[1] || ""
	}

	let sizing = calcImageSizing("square")
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
		source_image: sourceImage,
	}

	let outputImageBase64 = await new Promise((resolve, reject) => {
		generate_a1111_image(payload, (outputBase64) => {
			if (!!outputBase64) {
				resolve(outputBase64)
			}
			else {
				reject(new Error("Image generation failed."))
			}
		})
	})

	let normalizedOutput = `${outputImageBase64 || ""}`.trim()
	if (normalizedOutput.startsWith("data:")) {
		return normalizedOutput
	}
	return `data:image/png;base64,${normalizedOutput}`
}

let normalizeBase64Data = (input = "") => {
	let value = `${input || ""}`.trim()
	if (value.startsWith("data:")) {
		return value.split(",")[1] || ""
	}
	return value
}

let arrayBufferToDataUrl = (arrayBuffer, mimeType = "application/octet-stream") => {
	let bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0))
	let binary = ""
	for (let index = 0; index < bytes.length; index++) {
		binary += String.fromCharCode(bytes[index])
	}
	let base64 = btoa(binary)
	return `data:${mimeType};base64,${base64}`
}

window.prepareMusicFromAI = async (caption) => {
	let normalizedCaption = `${caption || ""}`.trim()
	if (normalizedCaption === "") {
		throw new Error("caption is required")
	}
	let response = await postKcppJson("/api/extra/music/prepare", { caption: normalizedCaption })
	return await response.json()
}

window.generateMusicFromAI = async (options = {}) => {
	let payload = {
		caption: `${options?.caption || ""}`,
		lyrics: `${options?.lyrics || ""}`,
		bpm: parseInt(options?.bpm ?? 120),
		duration: parseFloat(options?.duration ?? 64),
		keyscale: `${options?.keyscale || "G minor"}`,
		timesignature: `${options?.timesignature || "2"}`,
		vocal_language: `${options?.vocal_language || "en"}`,
		inference_steps: parseInt(options?.inference_steps ?? 8),
	}
	let referenceAudioData = normalizeBase64Data(options?.reference_audio_data || options?.music_reference_audio_data || "")
	if (referenceAudioData !== "") {
		payload.music_reference_audio_data = referenceAudioData
	}
	let response = await postKcppJson("/api/extra/music/generate", payload)
	let audioBuffer = await response.arrayBuffer()
	let mimeType = `${response.headers.get("content-type") || "audio/wav"}`.split(";")[0] || "audio/wav"
	return arrayBufferToDataUrl(audioBuffer, mimeType)
}

window.generateTTSFromAI = async (textToSay, voice = undefined) => {
	let normalizedText = `${textToSay || ""}`.trim()
	if (normalizedText === "") {
		throw new Error("textToSay is required")
	}
	let payload = { input: normalizedText, voice: `${voice || ""}`.trim() || `${localsettings.kcpp_tts_voice || "kobo"}` }
	if (typeof resolveKcppVoiceForPayload === "function") {
		let voiceConfig = await resolveKcppVoiceForPayload(voice)
		payload.voice = voiceConfig.voice
		if (!!voiceConfig.speaker_json) {
			payload.speaker_json = voiceConfig.speaker_json
		}
	}
	let response = await postKcppJson(koboldcpp_tts_endpoint, payload)
	let audioBuffer = await response.arrayBuffer()
	let mimeType = `${response.headers.get("content-type") || "audio/wav"}`.split(";")[0] || "audio/wav"
	return arrayBufferToDataUrl(audioBuffer, mimeType)
}

window.getAvailableVoicesFromAI = async () => {
	let response = await fetch(apply_proxy_url(custom_kobold_endpoint + koboldcpp_voices_endpoint), {
		method: "GET",
		headers: get_kobold_header(),
	})
	if (!response.ok) {
		let bodyText = await response.text().catch(() => "")
		throw new Error(`voice list fetch failed (${response.status}) ${bodyText}`.trim())
	}
	let data = await response.json()
	let voices = Array.isArray(data)
		? data.map(voiceName => `${voiceName || ""}`.trim()).filter(voiceName => voiceName.length > 0)
		: []
	return voices
}

window.generateObjectFromAI = async (prompt, objectStructure = {text: ""}) => {
	let grammar = await getObjectGNBF(objectStructure)
    let formattedPrompt = createInstructPrompt(prompt)
	let resp = await generateAndGetTextFromPrompt(formattedPrompt, grammar)
	try {
		return JSON.parse(resp)
	}
	catch (e) {
		console.error("Failed to parse AI response as JSON:", e, "Response text was:", resp)
		return null
	}
}