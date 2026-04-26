export const buildLibraryUtilsCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		objToText,
	} = ctx

	let LIBRARY_ALLOWED_TYPES = ["Character", "Save", "Autosave", "World Info", "Scenario"]

	let sanitizeLibraryName = (name) => {
		return `${name || ""}`.replaceAll(/[^\w()_\-'",!\[\].]/g, " ").replaceAll(/\s+/g, " ").trim()
	}

	let normalizeStringArray = (arr) => {
		if (!Array.isArray(arr)) {
			return []
		}
		return arr.map(elem => `${elem || ""}`.trim()).filter(elem => elem.length > 0)
	}

	let getLocalLibraryMetadata = async () => {
		let metadataRaw = await indexeddb_load("characterList", "[]")
		let metadata = []
		try {
			metadata = JSON.parse(metadataRaw)
		}
		catch (_e) {
			metadata = []
		}
		if (!Array.isArray(metadata)) {
			metadata = []
		}
		return metadata.filter(entry => typeof entry?.name === "string" && `${entry.name}`.trim() !== "")
	}

	let saveLocalLibraryMetadata = async (metadata) => {
		await indexeddb_save("characterList", JSON.stringify(metadata || []))
		try {
			if (typeof allCharacterNames !== "undefined" && Array.isArray(metadata)) {
				allCharacterNames = [...metadata]
			}
			if (typeof updateCharacterListFromAll === "function") {
				updateCharacterListFromAll()
			}
		}
		catch (_e) {
			// IndexedDB save already completed; UI refresh is best-effort.
		}
	}

	let wildcardToRegex = (pattern) => {
		let normalizedPattern = `${pattern || "*"}`.trim()
		if (normalizedPattern === "") {
			normalizedPattern = "*"
		}
		let escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		let regexSource = `^${escaped.replace(/\*/g, ".*")}$`
		return new RegExp(regexSource, "i")
	}

	let getLocalLibraryEntryByName = async (name) => {
		let metadata = await getLocalLibraryMetadata()
		let normalizedName = sanitizeLibraryName(name)
		let exact = metadata.find(entry => entry?.name === normalizedName)
		if (exact) {
			return exact
		}
		let lowered = normalizedName.toLowerCase()
		let caseInsensitiveMatches = metadata.filter(entry => `${entry?.name || ""}`.toLowerCase() === lowered)
		if (caseInsensitiveMatches.length === 1) {
			return caseInsensitiveMatches[0]
		}
		return undefined
	}

	let getLocalLibraryItem = async (name) => {
		if (typeof getCharacterData === "function") {
			return await getCharacterData(name, true)
		}
		let normalizedName = sanitizeLibraryName(name)
		let raw = await indexeddb_load(`character_${normalizedName}`, "{}")
		try {
			return JSON.parse(raw || "{}")
		}
		catch (_e) {
			return {}
		}
	}

	let isPngBytes = (bytes) => {
		if (!(bytes instanceof Uint8Array) || bytes.length < 8) {
			return false
		}
		let signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
		for (let idx = 0; idx < signature.length; idx++) {
			if (bytes[idx] !== signature[idx]) {
				return false
			}
		}
		return true
	}

	let normalizeWIEntries = (wiEntries = []) => {
		if (!Array.isArray(wiEntries)) {
			return []
		}
		return wiEntries.map((entry, index) => {
			let key = `${entry?.key || ""}`.trim()
			if (key === "") {
				throw new Error(`wi_entries[${index}].key is required.`)
			}
			let content = `${entry?.content || ""}`.trim()
			if (content === "") {
				throw new Error(`wi_entries[${index}].content is required.`)
			}

			let keysecondary = `${entry?.keysecondary || ""}`.trim()
			let keyanti = `${entry?.keyanti || ""}`.trim()
			let comment = entry?.comment === undefined || entry?.comment === null ? "" : `${entry.comment}`
			let folder = entry?.folder === undefined ? null : entry.folder
			if (folder !== null) {
				throw new Error(`wi_entries[${index}].folder must be null when provided.`)
			}
			let selective = !!entry?.selective
			let constant = !!entry?.constant
			let probability = entry?.probability === undefined || entry?.probability === null ? "100" : `${entry?.probability}`
			let wigroup = entry?.wigroup === undefined ? "Agent" : entry?.wigroup
			if (wigroup !== null) {
				wigroup = `${wigroup || ""}`.trim() || "Agent"
			}
			let widisabled = !!entry?.widisabled

			return {
				key,
				keysecondary,
				keyanti,
				content,
				comment,
				folder: null,
				selective,
				constant,
				probability,
				wigroup,
				widisabled,
			}
		})
	}

	let wiEntriesToCharacterBook = (wiEntries = []) => {
		if (!Array.isArray(wiEntries) || wiEntries.length === 0) {
			return null
		}
		let groupName = wiEntries.find(entry => typeof entry?.wigroup === "string" && `${entry.wigroup}`.trim() !== "")?.wigroup || "Agent"
		let uid = 0
		let entries = wiEntries.map(entry => {
			let converted = Object.assign({}, entry, {
				keys: `${entry?.key || ""}`.split(",").map(k => k.trim()).filter(k => k.length > 0),
				secondary_keys: `${entry?.keysecondary || ""}`.split(",").map(k => k.trim()).filter(k => k.length > 0),
				uid: uid++,
			})
			delete converted.key
			delete converted.keysecondary
			delete converted.wigroup
			return converted
		})
		return {
			name: groupName,
			entries,
		}
	}

	let responseText = (data) => {
		let text = typeof data === "string" ? data : objToText(data)
		addThought(currentChainOfThought, createSysPrompt, `Agentic character creator: ${text}`)
		return false
	}

	let responseError = (data) => {
		let text = typeof data === "string" ? data : objToText(data)
		addThought(currentChainOfThought, createSysPrompt, `Agentic character creator: ${text}`)
		if (localsettings?.agentReplanOnError) { agentRunState.replanDueToError = true; return true; }
		return false
	}

	let runWithRenderWait = async (loaderHandler) => {
		if (typeof render_gametext !== "function") {
			await loaderHandler()
			return
		}
		let originalRender = render_gametext
		try {
			await new Promise((resolve, reject) => {
				render_gametext = (...args) => {
					try {
						originalRender(...args)
						resolve()
					}
					catch (e) {
						reject(e)
					}
					finally {
						render_gametext = originalRender
					}
				}
				Promise.resolve(loaderHandler()).catch((e) => {
					render_gametext = originalRender
					reject(e)
				})
			})
		}
		finally {
			render_gametext = originalRender
		}
	}

	return [
		{
			"name": "listLibraryData",
			"description": "List local library metadata with wildcard name filtering. Returns only name and type and always excludes Document entries.",
			"args": {
				"pattern": {
					description: "<case-insensitive wildcard pattern where * matches any sequence>",
					type: "string",
					optional: true,
				},
				"type": {
					description: "<optional library type filter>",
					type: "string",
					enum: LIBRARY_ALLOWED_TYPES,
					optional: true,
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				try {
					let pattern = `${action?.args?.pattern || "*"}`
					let typeFilter = action?.args?.type
					let regex = wildcardToRegex(pattern)
					let metadata = await getLocalLibraryMetadata()
					let results = metadata
						.filter(entry => `${entry?.type || ""}` !== "Document")
						.filter(entry => !typeFilter || entry?.type === typeFilter)
						.filter(entry => regex.test(`${entry?.name || ""}`))
						.map(entry => ({ name: `${entry?.name || ""}`, type: `${entry?.type || ""}` }))
					return responseText({ results })
				}
				catch (e) {
					return responseError({ error: `${e?.message || e}`, type: "validation" })
				}
			}
		},
		{
			"name": "getLibraryData",
			"description": "Get local JSON content for a single library item by name. Document type is not allowed.",
			"args": {
				"name": {
					description: "<library item name>",
					type: "string",
				},
				"type": {
					description: "<optional expected library type>",
					type: "string",
					enum: LIBRARY_ALLOWED_TYPES,
					optional: true,
				}
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				try {
					let requestedName = `${action?.args?.name || ""}`.trim()
					if (requestedName === "") {
						return responseError({ error: "name is required.", type: "validation" })
					}

					let entry = await getLocalLibraryEntryByName(requestedName)
					if (!entry) {
						return responseError({ error: `Library item not found: ${requestedName}`, type: "not_found" })
					}
					if (`${entry?.type || ""}` === "Document") {
						return responseError({ error: "Document type is not allowed for getLibraryData.", type: "forbidden" })
					}

					let typeFilter = action?.args?.type
					if (!!typeFilter && typeFilter !== entry?.type) {
						return responseError({ error: `Type mismatch for ${entry?.name}: expected ${typeFilter}, got ${entry?.type}`, type: "mismatch" })
					}

					let data = await getLocalLibraryItem(entry.name)
					if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
						return responseError({ error: `Library item content not found: ${entry?.name}`, type: "not_found" })
					}

					return responseText({ name: entry.name, type: entry.type, content: data?.data !== undefined ? data.data : data })
				}
				catch (e) {
					return responseError({ error: `${e?.message || e}`, type: "validation" })
				}
			}
		},
		{
			"name": "createCharacter",
			"description": "Create or overwrite a local character using strict typed fields and a filesystem PNG avatar path.",
			"args": {
				"name": { description: "<character name>", type: "string" },
				"avatar_png_path": { description: "<absolute or virtual filesystem path to a PNG avatar>", type: "string", optional: true },
				"creator": { description: "<creator name>", type: "string", optional: true },
				"character_version": { description: "<character version>", type: "string", optional: true },
				"personality": { description: "<character personality>", type: "string", optional: true },
				"description": { description: "<character description>", type: "string", optional: true },
				"first_mes": { description: "<first greeting message>", type: "string", optional: true },
				"mes_example": { description: "<example dialogue>", type: "string", optional: true },
				"creator_notes": { description: "<creator notes>", type: "string", optional: true },
				"system_prompt": { description: "<system prompt>", type: "string", optional: true },
				"post_history_instructions": { description: "<post history instructions>", type: "string", optional: true },
				"tags": { description: "<array of tags>", type: "array", items: { type: "string" }, optional: true },
				"alternate_greetings": { description: "<array of alternate greeting strings>", type: "array", items: { type: "string" }, optional: true },
				"wi_entries": {
					description: "<array of WI entries with required key and content>",
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								"key": { type: "string", description: "<required primary key list, comma-separated>" },
								"keysecondary": { type: "string", description: "<optional secondary key list, comma-separated>" },
								"keyanti": { type: "string", description: "<optional anti-key list, comma-separated>" },
								"content": { type: "string", description: "<required WI content>" },
								"comment": { type: "string", description: "<optional comment>" },
								"folder": { type: "null", description: "<optional null folder field>" },
								"selective": { type: "boolean", description: "<true enables selective key mode requiring primary and secondary match>" },
								"constant": { type: "boolean", description: "<true means this entry is always included>" },
								"probability": { type: "string", description: "<optional probability string; defaults to 100>" },
								"wigroup": { anyOf: [{ type: "string" }, { type: "null" }], description: "<optional WI group string or null; defaults to Agent>" },
								"widisabled": { type: "boolean", description: "<optional disabled flag>" }
							},
							required: ["key", "content"],
							additionalProperties: false,
						}
					},
					optional: true,
				},
				"overwrite_existing": { description: "<true to overwrite an existing character with the same name>", type: "boolean", optional: true },
			},
			"enabled": is_using_kcpp_with_fs(),
			"outputVisibleToUser": true,
			"executor": async (action) => {
				try {
					let args = action?.args || {}
					let name = sanitizeLibraryName(args?.name)
					if (name === "") {
						return responseError({ error: "name is required.", type: "validation" })
					}

					let avatarPath = `${args?.avatar_png_path || ""}`.trim()
					if (avatarPath === "") {
						return responseError({ needsUserInput: true, missing: ["avatar_png_path"], message: "Please provide a filesystem path to a PNG avatar." })
					}

					if (!window?.fsClient) {
						return responseError({ error: "Filesystem APIs are not available.", type: "validation" })
					}

					let metadata = await getLocalLibraryMetadata()
					let overwriteExisting = !!args?.overwrite_existing
					let existing = metadata.find(entry => entry?.name === name)
					if (!!existing && !overwriteExisting) {
						return responseError({ error: `Character already exists: ${name}`, type: "validation" })
					}

					await window.fsClient.metadata([{ path: avatarPath }])
					let rawAvatarResp = await window.fsClient.fetch_raw(avatarPath)
					let avatarBlob = await rawAvatarResp.blob()
					let avatarBytes = new Uint8Array(await avatarBlob.arrayBuffer())
					let isPngExt = avatarPath.toLowerCase().endsWith(".png")
					let isPngMime = `${avatarBlob?.type || ""}`.toLowerCase() === "image/png"
					if (!isPngExt && !isPngMime) {
						return responseError({ error: "avatar_png_path must reference a PNG file.", type: "validation" })
					}
					if (!isPngBytes(avatarBytes)) {
						return responseError({ error: "avatar_png_path does not contain valid PNG bytes.", type: "validation" })
					}

					let normalizedWIEntries = normalizeWIEntries(args?.wi_entries)
					let characterBook = wiEntriesToCharacterBook(normalizedWIEntries)
					let charInner = {
						name,
						description: `${args?.description || ""}`,
						personality: `${args?.personality || ""}`,
						mes_example: `${args?.mes_example || ""}`,
						first_mes: `${args?.first_mes || ""}`,
						creator: `${args?.creator || ""}`,
						creator_notes: `${args?.creator_notes || ""}`,
						system_prompt: `${args?.system_prompt || ""}`,
						post_history_instructions: `${args?.post_history_instructions || ""}`,
						alternate_greetings: normalizeStringArray(args?.alternate_greetings),
						character_book: characterBook,
						tags: normalizeStringArray(args?.tags),
						character_version: `${args?.character_version || "1.0"}`,
					}

					let thumbnail = await generateThumbnail(avatarBlob, [256, 256])
					let pngOut = tavernTool.embedIntoPng(avatarBytes, charInner)
					let text = ""
					for (let index = 0; index < Math.ceil(pngOut.length / 32768.0); index++) {
						text += String.fromCharCode.apply(null, pngOut.slice(index * 32768, Math.min((index + 1) * 32768, pngOut.length)))
					}
					let dataUrl = `data:image/png;base64,${btoa(text)}`

					await indexeddb_save(`character_${name}`, JSON.stringify({ name, data: charInner, image: `${dataUrl}` }))
					let nextMetadata = metadata.filter(entry => entry?.name !== name)
					nextMetadata.push({ name, thumbnail, type: "Character", favorite: !!existing?.favorite })
					nextMetadata.sort((a, b) => {
						if (!!a?.favorite !== !!b?.favorite) {
							return !!a?.favorite ? -1 : 1
						}
						return `${a?.name || ""}` > `${b?.name || ""}` ? 1 : -1
					})
					await saveLocalLibraryMetadata(nextMetadata)
					return responseText({ status: "ok", name, overwritten: !!existing })
				}
				catch (e) {
					return responseError({ error: `${e?.message || e}`, type: "validation" })
				}
			}
		},
		{
			"name": "unifiedLoad",
			"description": "Load save and library entities in strict quick-start order: save, mainCharacter, additionalCharacters, playerCharacter, worldInfo.",
			"args": {
				"save": { description: "<save name>", type: "string", optional: true },
				"mainCharacter": { description: "<main character name>", type: "string", optional: true },
				"additionalCharacters": { description: "<array of additional character names>", type: "array", items: { type: "string" }, optional: true },
				"playerCharacter": { description: "<player character name>", type: "string", optional: true },
				"worldInfo": { description: "<array of world info item names>", type: "array", items: { type: "string" }, optional: true },
			},
			"enabled": true,
			"outputVisibleToUser": true,
			"executor": async (action) => {
				let report = { steps: [] }
				let didMutateWI = false
				let pushStatus = (role, name, status, message = "") => {
					report.steps.push({ role, name, status, message })
				}
				let resolveEntry = async (name) => {
					let trimmed = sanitizeLibraryName(name)
					if (trimmed === "") {
						return { error: "Missing name." }
					}
					let entry = await getLocalLibraryEntryByName(trimmed)
					if (!entry) {
						return { error: `Not found: ${trimmed}` }
					}
					let data = await getLocalLibraryItem(entry.name)
					if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
						return { error: `Content not found: ${entry.name}` }
					}
					return { entry, data }
				}

				try {
					let saveName = `${action?.args?.save || ""}`.trim()
					if (saveName !== "") {
						let resolved = await resolveEntry(saveName)
						if (!!resolved?.error) {
							pushStatus("save", saveName, "error", resolved.error)
						}
						else if (!["Save", "Autosave"].includes(`${resolved.entry?.type || ""}`)) {
							pushStatus("save", saveName, "error", `Type mismatch: expected Save/Autosave, got ${resolved.entry?.type}`)
						}
						else {
							await runWithRenderWait(() => kai_json_load(resolved.data.data, false))
							pushStatus("save", resolved.entry.name, "ok")
						}
					}

					let mainCharacterName = `${action?.args?.mainCharacter || ""}`.trim()
					if (mainCharacterName !== "") {
						let resolved = await resolveEntry(mainCharacterName)
						if (!!resolved?.error) {
							pushStatus("mainCharacter", mainCharacterName, "error", resolved.error)
						}
						else if (`${resolved.entry?.type || ""}` !== "Character") {
							pushStatus("mainCharacter", mainCharacterName, "error", `Type mismatch: expected Character, got ${resolved.entry?.type}`)
						}
						else {
							await runWithRenderWait(() => load_tavern_obj(resolved.data.data))
							pushStatus("mainCharacter", resolved.entry.name, "ok")
						}
					}

					let additionalCharacters = normalizeStringArray(action?.args?.additionalCharacters)
					for (let i = 0; i < additionalCharacters.length; i++) {
						let name = additionalCharacters[i]
						let resolved = await resolveEntry(name)
						if (!!resolved?.error) {
							pushStatus("additionalCharacters", name, "error", resolved.error)
							continue
						}
						if (`${resolved.entry?.type || ""}` !== "Character") {
							pushStatus("additionalCharacters", name, "error", `Type mismatch: expected Character, got ${resolved.entry?.type}`)
							continue
						}
						if (typeof window?.loadByCharacterNameIntoWI !== "function") {
							pushStatus("additionalCharacters", name, "error", "loadByCharacterNameIntoWI is unavailable.")
							continue
						}
						await window.loadByCharacterNameIntoWI(resolved.entry.name)
						didMutateWI = true
						pushStatus("additionalCharacters", resolved.entry.name, "ok")
					}

					let playerCharacterName = `${action?.args?.playerCharacter || ""}`.trim()
					if (playerCharacterName !== "") {
						let resolved = await resolveEntry(playerCharacterName)
						if (!!resolved?.error) {
							pushStatus("playerCharacter", playerCharacterName, "error", resolved.error)
						}
						else if (`${resolved.entry?.type || ""}` !== "Character") {
							pushStatus("playerCharacter", playerCharacterName, "error", `Type mismatch: expected Character, got ${resolved.entry?.type}`)
						}
						else if (typeof window?.loadByCharacterNameIntoWI !== "function") {
							pushStatus("playerCharacter", playerCharacterName, "error", "loadByCharacterNameIntoWI is unavailable.")
						}
						else {
							localsettings.chatname = resolved.entry.name
							await window.loadByCharacterNameIntoWI(resolved.entry.name)
							didMutateWI = true
							pushStatus("playerCharacter", resolved.entry.name, "ok")
						}
					}

					let worldInfoNames = normalizeStringArray(action?.args?.worldInfo)
					for (let i = 0; i < worldInfoNames.length; i++) {
						let name = worldInfoNames[i]
						let resolved = await resolveEntry(name)
						if (!!resolved?.error) {
							pushStatus("worldInfo", name, "error", resolved.error)
							continue
						}
						if (`${resolved.entry?.type || ""}` !== "World Info") {
							pushStatus("worldInfo", name, "error", `Type mismatch: expected World Info, got ${resolved.entry?.type}`)
							continue
						}
						if (!Array.isArray(resolved.data?.data)) {
							pushStatus("worldInfo", name, "error", "World Info payload is not an array.")
							continue
						}
						current_wi = current_wi.filter(wi => wi?.folder !== resolved.entry.name)
						current_wi.push(...resolved.data.data)
						didMutateWI = true
						pushStatus("worldInfo", resolved.entry.name, "ok")
					}

					if (didMutateWI) {
						try {
							if (typeof update_for_sidepanel === "function") {
								update_for_sidepanel()
							}
							if (typeof render_gametext === "function") {
								render_gametext(true)
							}
						}
						catch (_e) {
							// Rendering refresh is best-effort.
						}
					}

					let hasErrors = report.steps.some(step => step?.status === "error")
					return hasErrors ? responseError(report) : responseText(report)
				}
				catch (e) {
					return responseError({ error: `${e?.message || e}`, type: "validation", steps: report.steps })
				}
			}
		},
	]
}