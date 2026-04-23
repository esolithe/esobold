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

window.generateTextFromAI = async (prompt) => {
    let formattedPrompt = createInstructPrompt(prompt)
	return await generateAndGetTextFromPrompt(formattedPrompt)
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