let MAX_TEXT_RETURN_LENGTH = 20000

let bytesToBase64 = (bytes) => {
	let safeBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || [])
	let chunkSize = 0x8000
	let binary = ""
	for (let index = 0; index < safeBytes.length; index += chunkSize) {
		let chunk = safeBytes.subarray(index, index + chunkSize)
		binary += String.fromCharCode.apply(null, chunk)
	}
	return btoa(binary)
}

let truncateText = (text = "", maxLength = MAX_TEXT_RETURN_LENGTH) => {
	let value = `${text || ""}`
	if (value.length <= maxLength) {
		return { text: value, truncated: false }
	}
	return {
		text: value.substring(0, maxLength),
		truncated: true,
	}
}

let WC_EXCLUDED_RECURSIVE_SEGMENTS = [".git", "node_modules"]

let pathContainsExcludedSegment = (path = "") => {
	let normalizedPath = `${path || ""}`.replaceAll("\\", "/")
	let segments = normalizedPath.split("/").map(segment => `${segment || ""}`.trim()).filter(segment => segment.length > 0)
	return segments.some(segment => WC_EXCLUDED_RECURSIVE_SEGMENTS.includes(segment))
}

let normalizeContainerPath = (path = "") => {
	let normalized = `${path || ""}`.trim().replaceAll("\\", "/")
	if (!normalized) {
		return normalized
	}
	normalized = normalized.replace(/\/+/g, "/")
	if (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1)
	}
	return normalized
}

let joinContainerPath = (parentPath = "", name = "") => {
	let normalizedParent = normalizeContainerPath(parentPath)
	let normalizedName = `${name || ""}`.trim().replaceAll("\\", "/").replace(/^\/+/, "")
	if (!normalizedParent) {
		return normalizedName
	}
	if (!normalizedName) {
		return normalizedParent
	}
	if (normalizedParent === "/") {
		return `/${normalizedName}`
	}
	return `${normalizedParent}/${normalizedName}`
}

let direntIsDirectory = (entry) => {
	if (!entry || typeof entry !== "object") {
		return false
	}
	if (typeof entry.isDirectory === "function") {
		return !!entry.isDirectory()
	}
	if (typeof entry.isDirectory === "boolean") {
		return entry.isDirectory
	}
	return entry.type === "directory"
}

let readDirectoryEntriesWithMetadata = async (fs, rootPath, recursive) => {
	let normalizedRootPath = normalizeContainerPath(rootPath)
	if (pathContainsExcludedSegment(normalizedRootPath)) {
		return []
	}

	let pendingDirectories = [normalizedRootPath]
	let visitedDirectories = new Set()
	let results = []

	while (pendingDirectories.length > 0) {
		let currentDirectory = pendingDirectories.shift()
		if (visitedDirectories.has(currentDirectory)) {
			continue
		}
		visitedDirectories.add(currentDirectory)

		let currentEntries = await fs.readdir(currentDirectory, { recursive: false, withFileTypes: true })
		for (let entry of currentEntries) {
			let entryName = `${entry?.name || ""}`.trim()
			if (!entryName) {
				continue
			}
			let fullPath = joinContainerPath(currentDirectory, entryName)
			if (pathContainsExcludedSegment(fullPath)) {
				continue
			}
			let isDirectory = direntIsDirectory(entry)
			results.push({
				name: entryName,
				path: fullPath,
				isDirectory,
			})
			if (recursive && isDirectory && !visitedDirectories.has(fullPath)) {
				pendingDirectories.push(fullPath)
			}
		}
		if (!recursive) {
			break
		}
	}

	return results
}

export const buildWebContainerCommands = (ctx) => {
	let {
		agentRunState,
		currentChainOfThought,
		addThought,
		createSysPrompt,
		objToText,
	} = ctx

	let failAndMaybeReplan = (message) => {
		addThought(currentChainOfThought, createSysPrompt, `WC_TOOL: ${message}`)
		if (localsettings?.agentReplanOnError) {
			agentRunState.replanDueToError = true
			return true
		}
		return false
	}

	let confirmWebContainerAction = async (actionName, payload = {}) => {
		if (typeof window.showCommandExecutionConfirmation !== "function") {
			throw new Error("Command execution confirmation dialog is unavailable.")
		}
		return await window.showCommandExecutionConfirmation(
			"Allow WebContainer action",
			"Please review WebContainer action details before continuing.",
			JSON.stringify({ action: actionName, payload }, null, 2)
		)
	}

	let ensureWebContainerReady = async () => {
		if (typeof window.initialiseWebContainerAPIs !== "function") {
			throw new Error("WebContainer initializer is unavailable.")
		}
		await window.initialiseWebContainerAPIs()
		if (!window.webcontainerInstance || !window.webcontainerInstance.fs) {
			throw new Error("WebContainer filesystem is not initialized.")
		}
		return window.webcontainerInstance.fs
	}

	let runConfirmed = async (actionName, payload, runAction) => {
		let approved = await confirmWebContainerAction(actionName, payload)
		if (!approved) {
			addThought(currentChainOfThought, createSysPrompt, `WC_TOOL: ${actionName} cancelled by confirmation dialog`)
			return false
		}
		let result = await runAction()
		let resultText = typeof result === "string" ? result : objToText(result)
		addThought(currentChainOfThought, createSysPrompt, `WC_TOOL: ${actionName} result\n${resultText}`)
		return false
	}

	let readContainerFileResult = async (fs, path, encoding) => {
		let bytes = new Uint8Array(await fs.readFile(path))
		if (encoding === "base64") {
			let base64Content = bytesToBase64(bytes)
			let limited = truncateText(base64Content)
			return {
				path,
				encoding: "base64",
				bytes: bytes.length,
				content: limited.text,
				truncated: limited.truncated,
			}
		}
		let textContent = new TextDecoder().decode(bytes)
		let limited = truncateText(textContent)
		return {
			path,
			encoding: "text",
			bytes: bytes.length,
			content: limited.text,
			truncated: limited.truncated,
		}
	}

	let writeContainerFile = async (fs, path, content, encoding) => {
		let bytes
		if (encoding === "base64") {
			let binary = atob(content)
			bytes = new Uint8Array(binary.length)
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i)
			}
		}
		else {
			bytes = new TextEncoder().encode(content)
		}
		await fs.writeFile(path, bytes)
		return {
			path,
			encoding,
			bytesWritten: bytes.length,
		}
	}

	return [
		{
			name: "wc_loadLocalDirIntoContainerDir",
			description: "Copy a local filesystem directory into a WebContainer directory using existing utility helpers.",
			args: {
				localDirPath: "<absolute local filesystem directory path>",
				containerDirPath: "<absolute container directory path>",
			},
			enabled: true,
			executor: async (action) => {
				try {
					let localDirPath = `${action?.args?.localDirPath || ""}`.trim()
					let containerDirPath = `${action?.args?.containerDirPath || ""}`.trim()
					if (!localDirPath || !containerDirPath) {
						return failAndMaybeReplan("loadLocalDirIntoContainerDir failed - localDirPath and containerDirPath are required")
					}
					if (typeof window.loadLocalDirIntoContainerDir !== "function") {
						throw new Error("loadLocalDirIntoContainerDir is unavailable")
					}
					return await runConfirmed("loadLocalDirIntoContainerDir", { localDirPath, containerDirPath }, async () => {
						return await window.loadLocalDirIntoContainerDir(localDirPath, containerDirPath)
					})
				}
				catch (e) {
					return failAndMaybeReplan(`loadLocalDirIntoContainerDir failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_loadLocalFileIntoContainerPath",
			description: "Copy a local filesystem file into a WebContainer path using existing utility helpers.",
			args: {
				localFilePath: "<absolute local filesystem file path>",
				containerFilePath: "<absolute container file path>",
			},
			enabled: true,
			executor: async (action) => {
				try {
					let localFilePath = `${action?.args?.localFilePath || ""}`.trim()
					let containerFilePath = `${action?.args?.containerFilePath || ""}`.trim()
					if (!localFilePath || !containerFilePath) {
						return failAndMaybeReplan("loadLocalFileIntoContainerPath failed - localFilePath and containerFilePath are required")
					}
					if (typeof window.loadLocalFileIntoContainerPath !== "function") {
						throw new Error("loadLocalFileIntoContainerPath is unavailable")
					}
					return await runConfirmed("loadLocalFileIntoContainerPath", { localFilePath, containerFilePath }, async () => {
						return await window.loadLocalFileIntoContainerPath(localFilePath, containerFilePath)
					})
				}
				catch (e) {
					return failAndMaybeReplan(`loadLocalFileIntoContainerPath failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_loadContainerDirIntoLocalDir",
			description: "Copy a WebContainer directory into a local filesystem directory using existing utility helpers.",
			args: {
				containerDirPath: "<absolute container directory path>",
				localDirPath: "<absolute local filesystem directory path>",
			},
			enabled: true,
			executor: async (action) => {
				try {
					let containerDirPath = `${action?.args?.containerDirPath || ""}`.trim()
					let localDirPath = `${action?.args?.localDirPath || ""}`.trim()
					if (!containerDirPath || !localDirPath) {
						return failAndMaybeReplan("loadContainerDirIntoLocalDir failed - containerDirPath and localDirPath are required")
					}
					if (typeof window.loadContainerDirIntoLocalDir !== "function") {
						throw new Error("loadContainerDirIntoLocalDir is unavailable")
					}
					return await runConfirmed("loadContainerDirIntoLocalDir", { containerDirPath, localDirPath }, async () => {
						return await window.loadContainerDirIntoLocalDir(containerDirPath, localDirPath)
					})
				}
				catch (e) {
					return failAndMaybeReplan(`loadContainerDirIntoLocalDir failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_loadContainerFileIntoLocal",
			description: "Copy a WebContainer file into a local filesystem path using existing utility helpers.",
			args: {
				containerFilePath: "<absolute container file path>",
				localFilePath: "<absolute local filesystem file path>",
			},
			enabled: true,
			executor: async (action) => {
				try {
					let containerFilePath = `${action?.args?.containerFilePath || ""}`.trim()
					let localFilePath = `${action?.args?.localFilePath || ""}`.trim()
					if (!containerFilePath || !localFilePath) {
						return failAndMaybeReplan("loadContainerFileIntoLocal failed - containerFilePath and localFilePath are required")
					}
					if (typeof window.loadContainerFileIntoLocal !== "function") {
						throw new Error("loadContainerFileIntoLocal is unavailable")
					}
					return await runConfirmed("loadContainerFileIntoLocal", { containerFilePath, localFilePath }, async () => {
						return await window.loadContainerFileIntoLocal(containerFilePath, localFilePath)
					})
				}
				catch (e) {
					return failAndMaybeReplan(`loadContainerFileIntoLocal failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_fs_readdir",
			description: "List WebContainer directory entries. Recursion is handled in JS with non-recursive fs.readdir calls, excludes .git/node_modules, and returns full paths with directory flags.",
			args: {
				path: "<container directory path>",
				recursive: { description: "<whether to recurse>", type: "boolean" },
				withFileTypes: { description: "<deprecated; retained for compatibility>", type: "boolean" },
			},
			enabled: true,
			executor: async (action) => {
				try {
					let path = `${action?.args?.path || ""}`.trim()
					if (!path) {
						return failAndMaybeReplan("fs.readdir failed - path is required")
					}
					let recursive = !!action?.args?.recursive
					let withFileTypes = !!action?.args?.withFileTypes
					return await runConfirmed("fs.readdir", { path, recursive, withFileTypes, excludes: WC_EXCLUDED_RECURSIVE_SEGMENTS }, async () => {
						let fs = await ensureWebContainerReady()
						let entries = await readDirectoryEntriesWithMetadata(fs, path, recursive)
						return {
							path,
							recursive,
							withFileTypesRequested: withFileTypes,
							excludesApplied: [...WC_EXCLUDED_RECURSIVE_SEGMENTS],
							entries,
						}
					})
				}
				catch (e) {
					return failAndMaybeReplan(`fs.readdir failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_fs_readFile",
			description: "Run webcontainerInstance.fs.readFile on one or many container file paths.",
			args: {
				path: "<container file path>",
				operations: {
					description: "<optional array of read operations {path, encoding}>",
					optional: true,
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								path: { type: "string" },
								encoding: { type: "string", enum: ["text", "base64"] },
							},
							required: ["path"],
						},
					}
				},
				encoding: {
					description: "<text|base64>",
					type: "string",
					enum: ["text", "base64"],
				},
			},
			enabled: true,
			executor: async (action) => {
				try {
					let path = `${action?.args?.path || ""}`.trim()
					let operations = Array.isArray(action?.args?.operations) ? action.args.operations : []
					if (!path && operations.length === 0) {
						return failAndMaybeReplan("fs.readFile failed - either path or operations is required")
					}
					let encoding = `${action?.args?.encoding || "text"}`.trim().toLowerCase()
					let normalizedOperations = operations.map((operation) => {
						let operationPath = `${operation?.path || ""}`.trim()
						let operationEncoding = `${operation?.encoding || encoding || "text"}`.trim().toLowerCase()
						return {
							path: operationPath,
							encoding: operationEncoding === "base64" ? "base64" : "text",
						}
					}).filter(operation => operation.path.length > 0)
					if (operations.length > 0 && normalizedOperations.length === 0) {
						return failAndMaybeReplan("fs.readFile failed - operations were provided but no valid operation.path values were found")
					}
					return await runConfirmed("fs.readFile", { path, encoding, operations: normalizedOperations }, async () => {
						let fs = await ensureWebContainerReady()
						if (normalizedOperations.length > 0) {
							let results = []
							for (let operation of normalizedOperations) {
								results.push(await readContainerFileResult(fs, operation.path, operation.encoding))
							}
							return { results }
						}
						return await readContainerFileResult(fs, path, encoding === "base64" ? "base64" : "text")
					})
				}
				catch (e) {
					return failAndMaybeReplan(`fs.readFile failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_fs_writeFile",
			description: "Run webcontainerInstance.fs.writeFile on one or many container file paths.",
			args: {
				path: "<container file path>",
				content: "<file content as text or base64>",
				operations: {
					description: "<optional array of write operations {path, content, encoding}>",
					optional: true,
					format: {
						type: "array",
						items: {
							type: "object",
							properties: {
								path: { type: "string" },
								content: { type: "string" },
								encoding: { type: "string", enum: ["text", "base64"] },
							},
							required: ["path", "content"],
						},
					}
				},
				encoding: {
					description: "<text|base64>",
					type: "string",
					enum: ["text", "base64"],
				},
			},
			enabled: true,
			executor: async (action) => {
				try {
					let path = `${action?.args?.path || ""}`.trim()
					let content = `${action?.args?.content || ""}`
					let operations = Array.isArray(action?.args?.operations) ? action.args.operations : []
					if (!path && operations.length === 0) {
						return failAndMaybeReplan("fs.writeFile failed - either path or operations is required")
					}
					let encoding = `${action?.args?.encoding || "text"}`.trim().toLowerCase()
					let normalizedOperations = operations.map((operation) => {
						let operationPath = `${operation?.path || ""}`.trim()
						let operationContent = `${operation?.content || ""}`
						let operationEncoding = `${operation?.encoding || encoding || "text"}`.trim().toLowerCase()
						return {
							path: operationPath,
							content: operationContent,
							encoding: operationEncoding === "base64" ? "base64" : "text",
						}
					}).filter(operation => operation.path.length > 0)
					if (operations.length > 0 && normalizedOperations.length === 0) {
						return failAndMaybeReplan("fs.writeFile failed - operations were provided but no valid operation.path values were found")
					}
					return await runConfirmed("fs.writeFile", {
						path,
						encoding,
						contentLength: content.length,
						operations: normalizedOperations.map(operation => ({ path: operation.path, encoding: operation.encoding, contentLength: operation.content.length }))
					}, async () => {
						let fs = await ensureWebContainerReady()
						if (normalizedOperations.length > 0) {
							let results = []
							for (let operation of normalizedOperations) {
								results.push(await writeContainerFile(fs, operation.path, operation.content, operation.encoding))
							}
							return { results }
						}
						return await writeContainerFile(fs, path, content, encoding === "base64" ? "base64" : "text")
					})
				}
				catch (e) {
					return failAndMaybeReplan(`fs.writeFile failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_fs_mkdir",
			description: "Run webcontainerInstance.fs.mkdir on a container directory path.",
			args: {
				path: "<container directory path>",
				recursive: { description: "<whether to recurse>", type: "boolean" },
			},
			enabled: true,
			executor: async (action) => {
				try {
					let path = `${action?.args?.path || ""}`.trim()
					if (!path) {
						return failAndMaybeReplan("fs.mkdir failed - path is required")
					}
					let recursive = !!action?.args?.recursive
					return await runConfirmed("fs.mkdir", { path, recursive }, async () => {
						let fs = await ensureWebContainerReady()
						await fs.mkdir(path, { recursive })
						return { path, recursive }
					})
				}
				catch (e) {
					return failAndMaybeReplan(`fs.mkdir failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_fs_rm",
			description: "Run webcontainerInstance.fs.rm on a container path.",
			args: {
				path: "<container file or directory path>",
				recursive: { description: "<whether to recurse>", type: "boolean" },
				force: { description: "<whether to ignore missing paths>", type: "boolean" },
			},
			enabled: true,
			executor: async (action) => {
				try {
					let path = `${action?.args?.path || ""}`.trim()
					if (!path) {
						return failAndMaybeReplan("fs.rm failed - path is required")
					}
					let recursive = !!action?.args?.recursive
					let force = !!action?.args?.force
					return await runConfirmed("fs.rm", { path, recursive, force }, async () => {
						let fs = await ensureWebContainerReady()
						await fs.rm(path, { recursive, force })
						return { path, recursive, force }
					})
				}
				catch (e) {
					return failAndMaybeReplan(`fs.rm failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_spawn",
			description: "Spawn a process in WebContainer using ArgsHelper. Optional capture_output_to_agent mode is disabled by default because it can block on long-running processes.",
			args: {
				processName: "<executable command name>",
				args: {
					description: "<command args as string or array>",
					format: {
						oneOf: [
							{ type: "string" },
							{ type: "array", items: { type: "string" } },
						]
					}
				},
				cwd: "<optional container working directory>",
				env: {
					description: "<optional environment variables map>",
					type: "object",
				},
				output: { description: "<optional spawn output option>", type: "boolean" },
				terminalCols: { description: "<optional terminal columns>", type: "integer" },
				terminalRows: { description: "<optional terminal rows>", type: "integer" },
				capture_output_to_agent: { description: "<optional debug mode; may block>", type: "boolean" },
			},
			enabled: true,
			executor: async (action) => {
				try {
					let processName = `${action?.args?.processName || ""}`.trim()
					if (!processName) {
						return failAndMaybeReplan("spawn failed - processName is required")
					}
					if (typeof window.process !== "function") {
						throw new Error("window.process ArgsHelper is unavailable")
					}
					let argInput = action?.args?.args
					let cwd = `${action?.args?.cwd || ""}`.trim()
					let env = action?.args?.env
					let output = action?.args?.output
					let terminalCols = parseInt(`${action?.args?.terminalCols ?? ""}`, 10)
					let terminalRows = parseInt(`${action?.args?.terminalRows ?? ""}`, 10)
					let captureOutputToAgent = !!action?.args?.capture_output_to_agent

					return await runConfirmed("spawn", {
						processName,
						args: argInput,
						cwd,
						env,
						output,
						terminalCols,
						terminalRows,
						capture_output_to_agent: captureOutputToAgent,
					}, async () => {
						await ensureWebContainerReady()
						let helper = window.process(processName)
						if (Array.isArray(argInput)) {
							helper.args(...argInput)
						}
						else if (`${argInput || ""}`.trim() !== "") {
							helper.args(`${argInput}`)
						}
						if (cwd) {
							helper.workingDirectory(cwd)
						}
						if (!!env && typeof env === "object" && !Array.isArray(env)) {
							helper.env(env)
						}
						if (typeof output === "boolean") {
							helper.output(output)
						}
						if (Number.isFinite(terminalCols) && Number.isFinite(terminalRows) && terminalCols > 0 && terminalRows > 0) {
							helper.terminal(terminalCols, terminalRows)
						}

						if (typeof helper.spawnForAgent === "function") {
							return await helper.spawnForAgent({
								captureOutput: captureOutputToAgent,
								waitForExit: captureOutputToAgent,
							})
						}

						// Fallback: legacy behavior may block until exit.
						let exitCode = await helper.spawn()
						return {
							started: true,
							captureOutput: false,
							waitForExit: true,
							exitCode,
							warning: "spawnForAgent helper unavailable; used legacy spawn path",
						}
					})
				}
				catch (e) {
					return failAndMaybeReplan(`spawn failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_openDevEmbeddedView",
			description: "Open an embedded popup view for the current WebContainer development server URL.",
			args: {},
			enabled: true,
			executor: async () => {
				try {
					if (typeof window.openDevEmbeddedView !== "function") {
						throw new Error("openDevEmbeddedView is unavailable")
					}
					return await runConfirmed("openDevEmbeddedView", { webContainerDevURL: `${window.webContainerDevURL || ""}` }, async () => {
						window.openDevEmbeddedView()
						return {
							opened: true,
							url: `${window.webContainerDevURL || ""}`,
							hasServerUrl: !!window.webContainerDevURL,
						}
					})
				}
				catch (e) {
					return failAndMaybeReplan(`openDevEmbeddedView failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_getDevEnvUrl",
			description: "Query the current WebContainer development environment URL without opening an embedded view.",
			args: {},
			enabled: true,
			executor: async () => {
				try {
					return await runConfirmed("getDevEnvUrl", {
						webContainerDevURL: `${window.webContainerDevURL || ""}`,
						webContainerDevPort: window.webContainerDevPort ?? null,
					}, async () => {
						return {
							url: `${window.webContainerDevURL || ""}`,
							port: window.webContainerDevPort ?? null,
							hasServerUrl: !!window.webContainerDevURL,
						}
					})
				}
				catch (e) {
					return failAndMaybeReplan(`getDevEnvUrl failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_listProcessesByDirectory",
			description: "List directories that currently have tracked WebContainer processes, and optionally indicate whether a target directory is active.",
			args: {
				mapRef: "<optional container directory to check for running processes>",
			},
			enabled: true,
			executor: async (action) => {
				try {
					if (typeof window.listDirectoriesRunningProcesses !== "function") {
						throw new Error("listDirectoriesRunningProcesses is unavailable")
					}
					let mapRef = `${action?.args?.mapRef || ""}`.trim()
					return await runConfirmed("listProcessesByDirectory", { mapRef }, async () => {
						let directories = await window.listDirectoriesRunningProcesses()
						return {
							directories,
							mapRef: mapRef || null,
							hasRunningProcessesInMapRef: mapRef ? directories.includes(mapRef) : null,
						}
					})
				}
				catch (e) {
					return failAndMaybeReplan(`listProcessesByDirectory failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_killProcessesByDirectory",
			description: "Kill tracked WebContainer processes for a specific container directory.",
			args: {
				mapRef: "<container directory with tracked running processes>",
			},
			enabled: true,
			executor: async (action) => {
				try {
					let mapRef = `${action?.args?.mapRef || ""}`.trim()
					if (!mapRef) {
						return failAndMaybeReplan("killProcessesByDirectory failed - mapRef is required")
					}
					if (typeof window.killProcesses !== "function") {
						throw new Error("killProcesses is unavailable")
					}
					return await runConfirmed("killProcessesByDirectory", { mapRef }, async () => {
						window.killProcesses(mapRef)
						return { killed: true, mapRef }
					})
				}
				catch (e) {
					return failAndMaybeReplan(`killProcessesByDirectory failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_killAllProcesses",
			description: "Kill all tracked running WebContainer processes.",
			args: {},
			enabled: true,
			executor: async () => {
				try {
					if (typeof window.killAllProcesses !== "function") {
						throw new Error("killAllProcesses is unavailable")
					}
					return await runConfirmed("killAllProcesses", {}, async () => {
						window.killAllProcesses()
						return { killed: true }
					})
				}
				catch (e) {
					return failAndMaybeReplan(`killAllProcesses failed - ${e?.message || e}`)
				}
			}
		},
		{
			name: "wc_createSvelteEnv",
			description: "Create a Svelte WebContainer environment (npm install + vite template setup). This command automatically spawns a dev server as part of setup.",
			args: {
				projectName: {
					description: "<optional project folder name>",
					type: "string",
					optional: true,
				},
			},
			enabled: true,
			executor: async (action) => {
				try {
					if (typeof window.createSvelteEnv !== "function") {
						throw new Error("createSvelteEnv is unavailable")
					}
					let projectName = `${action?.args?.projectName || "sandboxApp"}`.trim() || "sandboxApp"
					return await runConfirmed("createSvelteEnv", { projectName }, async () => {
						let result = await window.createSvelteEnv(projectName)
						return {
							projectName,
							devServerSpawned: !!result?.devProcess,
							serverReadyInfo: result?.serverReadyInfo || null,
						}
					})
				}
				catch (e) {
					return failAndMaybeReplan(`createSvelteEnv failed - ${e?.message || e}`)
				}
			}
		},
	]
}
