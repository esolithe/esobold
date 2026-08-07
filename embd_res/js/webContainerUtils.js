window.initialiseWebContainerAPIs = async () => {
    if (!window.webContainer) {
        throw new Error("WebContainer API is unavailable. Ensure embd_res/js/webContainer.js is enabled and loaded.");
    }
    if (!window.webcontainerInstance) {
        console.log("Booting WebContainer instance...");
        window.webcontainerInstance = await window.webContainer.boot();
        window.webContainerFS = window.webcontainerInstance.fs;
        window.webContainerDevPort = null;
        window.webContainerDevURL = null;
        window.webcontainerInstance.on('server-ready', (port, url) => {
            window.webContainerDevPort = port;
            window.webContainerDevURL = url;
            console.log(port, url);
            window.dispatchEvent(new CustomEvent("webcontainer-ready", { detail: { port, url } }));
        });
        console.log("WebContainer instance booted:", window.webcontainerInstance);
    }
}

let runningProcesses = {};
let addRunningProcess = (mapRef, processRef) => {
    let normalizedMapRef = `${mapRef || "/"}`
    if (!(normalizedMapRef in runningProcesses)) {
        runningProcesses[normalizedMapRef] = [];
    }
    runningProcesses[normalizedMapRef].push(processRef)
    return normalizedMapRef
}

let removeRunningProcess = (mapRef, processRef) => {
    let normalizedMapRef = `${mapRef || "/"}`
    if (!(normalizedMapRef in runningProcesses)) {
        return
    }
    runningProcesses[normalizedMapRef] = runningProcesses[normalizedMapRef].filter(p => p !== processRef)
    if (runningProcesses[normalizedMapRef].length === 0) {
        delete runningProcesses[normalizedMapRef]
    }
}

window.runContainerProcess = async (processRef, mapRef = "/", options = {}) => {
    let settings = {
        waitForExit: true,
        captureOutput: false,
        throwOnNonZero: true,
        autoYesPrompt: true,
        maxCapturedChars: 20000,
        ...options,
    }
    let startedProcess = await processRef
    let trackedMapRef = addRunningProcess(mapRef, startedProcess)
    let outputText = ""
    let captureTruncated = false
    let writer = startedProcess.input.getWriter()

    startedProcess.output.pipeTo(new WritableStream({
        write(data) {
            let text = `${data || ""}`
            console.log(text)
            if (settings.captureOutput) {
                let maxChars = parseInt(`${settings.maxCapturedChars ?? 20000}`, 10)
                if (!Number.isFinite(maxChars) || maxChars <= 0) {
                    maxChars = 20000
                }
                if (outputText.length < maxChars) {
                    outputText += text.substring(0, maxChars - outputText.length)
                    if (outputText.length >= maxChars) {
                        captureTruncated = true
                    }
                }
                else {
                    captureTruncated = true
                }
            }
            if (settings.autoYesPrompt && text.indexOf("Ok to proceed? (y)") !== -1) {
                writer.write("y\n")
            }
        }
    })).catch((error) => {
        console.warn("Process output stream closed with error:", error)
    })

    let removeOnExit = () => removeRunningProcess(trackedMapRef, startedProcess)
    startedProcess.exit.then(removeOnExit).catch(removeOnExit)

    if (!settings.waitForExit) {
        return {
            started: true,
            mapRef: trackedMapRef,
            waitingForExit: false,
            captureOutput: !!settings.captureOutput,
        }
    }

    let exitCode = await startedProcess.exit
    removeOnExit()
    if (settings.throwOnNonZero && exitCode !== 0) {
        throw new Error(`Process exited with code ${exitCode}`)
    }
    return {
        started: true,
        mapRef: trackedMapRef,
        waitingForExit: true,
        captureOutput: !!settings.captureOutput,
        output: settings.captureOutput ? outputText : undefined,
        outputTruncated: !!settings.captureOutput ? captureTruncated : undefined,
        exitCode,
    }
}

window.wrapNPM = async (processRef, mapRef = "/") => {
    let result = await window.runContainerProcess(processRef, mapRef, {
        waitForExit: true,
        captureOutput: false,
        throwOnNonZero: false,
        autoYesPrompt: true,
    })
    if (result.exitCode !== 0) {
        throw new Error('Unable to run npm install');
    }
    return result.exitCode;
}

window.listDirectoriesRunningProcesses = () => {
    return Object.keys(runningProcesses);
}

window.killProcesses = (mapRef = "/") => {
    if (mapRef in runningProcesses) {
        runningProcesses[mapRef].forEach(p => p.kill());
        delete runningProcesses[mapRef];
    }
};

window.killAllProcesses = () => {
    for (const mapRef in runningProcesses) {
        runningProcesses[mapRef].forEach(p => p.kill());
    }
    runningProcesses = {};    
}

// SpawnOptions {
//   cwd?: string;
//   env?: Record<string, string | number | boolean>;
//   output?: boolean;
//   terminal?: { cols: number; rows: number };
// }

class ArgsHelper {
    processName = null;
    arguments = [];
    spawnOptions = {};
    constructor(processName) {
        this.processName = processName;
        return this;
    }
    args(...args) {
        if (!Array.isArray(args)) {
            this.arguments = args.split(" ")
        }
        else if (args.length === 1 && typeof args[0] === "string") {
            this.arguments = args[0].split(" ")
        }
        else {
            this.arguments = args;
        }
        return this; 
    }
    options(options) {
        this.spawnOptions = options;
        return this;
    }
    workingDirectory(cwd) {
        this.spawnOptions.cwd = cwd;
        return this;
    }
    env(env) {
        this.spawnOptions.env = env;
        return this;
    }
    output(output) {
        this.spawnOptions.output = output;
        return this;
    }
    terminal(cols, rows) {
        this.spawnOptions.terminal = { cols, rows };
        return this;
    }
    get() {
        return [this.processName, this.arguments, this.spawnOptions];
    }
    spawn() {
        return window.initialiseWebContainerAPIs().then(() => {
            return wrapNPM(webcontainerInstance.spawn(...this.get()), this.spawnOptions?.cwd);
        });
    }
    spawnForAgent(options = {}) {
        return window.initialiseWebContainerAPIs().then(() => {
            return window.runContainerProcess(webcontainerInstance.spawn(...this.get()), this.spawnOptions?.cwd, options);
        });
    }
}

window.process = (processName) => new ArgsHelper(processName);

window.createDevIframe = (url) => {
    if (!url) {
        console.warn("Dev server URL not ready yet.");
        return;
    }
    let iframe = document.createElement("iframe");
    iframe.allow="cross-origin-isolated"
    iframe.src=url
    iframe.height = "100%"
    iframe.width = "100%"
    return iframe;
}

window.openDevEmbeddedView = () => {
  let elem = window.createDevIframe(webContainerDevURL)
  popupUtils.reset()
    .title("Web container view")
    .content(elem)
    .css("top", "10%")
    .css("left", "10%")
    .css("height", "80%")
    .css("width", "80%")
    .button("Refresh", () => window.openDevEmbeddedView())
    .button("Close", () => window.popupUtils.reset())
    .modal(true).show()
}

function blockUntilServerReady() {
    return new Promise((resolve) => {
        let eventResult = null;
        let listener = (event) => {
            eventResult = event.detail;
            console.log("WebContainer dev server is ready:", event.detail);
        }
        window.addEventListener("webcontainer-ready", listener);
        let checkInterval = setInterval(() => {
            if (eventResult) {
                clearInterval(checkInterval);
                window.removeEventListener("webcontainer-ready", listener);
                resolve(eventResult);
            }
        }, 1000);
    });
}

window.createSvelteEnv = async (projectName = "sandboxApp") => {
    window.killProcesses(`./${projectName}`);

    await process("npm").args("install vite@latest").spawn()

    await process("npm").args(`create vite@latest ${projectName} -- --template svelte-ts --no-interactive`).spawn()

    await webcontainerInstance.fs.readdir(".")

    await process("npm").args("install").workingDirectory(`./${projectName}`).spawn()

    await webcontainerInstance.fs.readdir(`./${projectName}`)

    let blockingPromise = blockUntilServerReady();
    let devProcess = process("npm").args("run dev").workingDirectory(`./${projectName}`).spawn()

    console.log("Waiting for dev server to be ready...");
    let serverReadyInfo = await blockingPromise;
    console.log("Dev server is ready:", serverReadyInfo);
    return { devProcess, serverReadyInfo };
}

function ensureLocalFsClient() {
    if (!window.fsClient || typeof window.fsClient !== "object") {
        throw new Error("Local filesystem API is unavailable. Ensure embd_res/js/fs.js is enabled and loaded.");
    }
    return window.fsClient;
}

function ensureWebContainerFs() {
    if (!window.webcontainerInstance || !window.webcontainerInstance.fs) {
        throw new Error("WebContainer filesystem is unavailable. Ensure webcontainerInstance.fs is initialized.");
    }
    return window.webcontainerInstance.fs;
}

function normalizePath(localFs, path, allowRoot = true) {
    return localFs._normalize_path(path, allowRoot);
}

function joinPath(base, segment) {
    return `${base.replace(/\/+$/, "")}/${`${segment || ""}`.replace(/^\/+/, "")}`.replace(/\/+/g, "/");
}

function stripBasePrefix(path, base) {
    if (path === base) {
        return "";
    }
    const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
    return path.slice(baseWithSlash.length);
}

async function ensureContainerDir(containerFs, dirPath) {
    const normalized = `${dirPath || ""}`;
    if (normalized === "/") {
        return;
    }
    await containerFs.mkdir(normalized, { recursive: true });
}

async function ensureLocalDir(localFs, dirPath) {
    const normalized = normalizePath(localFs, dirPath, true);
    if (normalized === "/") {
        return;
    }
    const segments = normalized.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
        current = `${current}/${segment}`;
        try {
            await localFs.mkdir([{ path: current }]);
        }
        catch (err) {
            const message = `${err?.message || ""}`.toLowerCase();
            if (!message.includes("exist") && !message.includes("already")) {
                throw err;
            }
        }
    }
}

async function readContainerFileBytes(containerFs, filePath) {
    return new Uint8Array(await containerFs.readFile(filePath));
}

async function collectLocalDirTree(localFs, rootDir) {
    const pattern = rootDir === "/" ? "/**" : `${rootDir}/**`;
    const result = await localFs.listEntries(pattern);
    return {
        directories: (result?.directories || []).map((path) => normalizePath(localFs, path, true)),
        files: (result?.files || []).map((path) => normalizePath(localFs, path, false)),
    };
}

async function collectContainerDirTree(localFs, containerFs, rootDir) {
    const directories = [];
    const files = [];

    // WebContainer recursive readdir omits reliable parent path context in some cases.
    // Walk recursively in JS while only using single-level readdir calls.
    const queue = [rootDir];
    const visited = new Set();
    while (queue.length > 0) {
        const currentDir = normalizePath(localFs, `${queue.shift() || ""}`, true);
        if (!currentDir || visited.has(currentDir)) {
            continue;
        }
        visited.add(currentDir);

        const entries = await containerFs.readdir(currentDir, { recursive: false, withFileTypes: true });
        for (const entry of entries) {
            const name = `${entry?.name || ""}`.trim();
            if (!name) {
                continue;
            }
            const childPath = normalizePath(localFs, joinPath(currentDir, name), true);
            const isDirectory = typeof entry?.isDirectory === "function"
                ? !!entry.isDirectory()
                : !!entry?.isDirectory;
            if (isDirectory) {
                directories.push(childPath);
                if (!visited.has(childPath)) {
                    queue.push(childPath);
                }
            }
            else {
                files.push(childPath);
            }
        }
    }
    return { directories, files };
}

function updateBulkTransferProgress(prefix, done, total) {
    const safeTotal = Math.max(total, 1);
    const pct = Math.floor((done / safeTotal) * 100);
    waitingToast.setText(`${prefix} ${done}/${total} (${pct}%)`);
    waitingToast.show();
}

window.loadLocalFileIntoContainerPath = async (localFilePath, containerFilePath) => {
    const localFs = ensureLocalFsClient();
    const containerFs = ensureWebContainerFs();
    await initialiseWebContainerAPIs();

    const normalizedLocalFilePath = normalizePath(localFs, localFilePath, false);
    const normalizedContainerFilePath = normalizePath(localFs, containerFilePath, false);
    const containerParentDir = normalizePath(localFs, normalizedContainerFilePath.slice(0, normalizedContainerFilePath.lastIndexOf("/")) || "/", true);

    await ensureContainerDir(containerFs, containerParentDir);
    const localResponse = await localFs.fetch_raw(normalizedLocalFilePath);
    const localBytes = new Uint8Array(await localResponse.arrayBuffer());
    await containerFs.writeFile(normalizedContainerFilePath, localBytes);

    return {
        source: normalizedLocalFilePath,
        destination: normalizedContainerFilePath,
        bytes: localBytes.length,
    };
}

window.loadContainerFileIntoLocal = async (containerFilePath, localFilePath) => {
    const localFs = ensureLocalFsClient();
    const containerFs = ensureWebContainerFs();
    await initialiseWebContainerAPIs();

    const normalizedContainerFilePath = normalizePath(localFs, containerFilePath, false);
    const normalizedLocalFilePath = normalizePath(localFs, localFilePath, false);
    const localParentDir = normalizePath(localFs, normalizedLocalFilePath.slice(0, normalizedLocalFilePath.lastIndexOf("/")) || "/", true);

    await ensureLocalDir(localFs, localParentDir);
    const containerBytes = await readContainerFileBytes(containerFs, normalizedContainerFilePath);
    await localFs.write([{ path: normalizedLocalFilePath, content: containerBytes }]);

    return {
        source: normalizedContainerFilePath,
        destination: normalizedLocalFilePath,
        bytes: containerBytes.length,
    };
}

window.loadLocalDirIntoContainerDir = async (localDirPath, containerDirPath) => {
    const localFs = ensureLocalFsClient();
    const containerFs = ensureWebContainerFs();
    await initialiseWebContainerAPIs();

    const normalizedLocalDirPath = normalizePath(localFs, localDirPath, true);
    const normalizedContainerDirPath = normalizePath(localFs, containerDirPath, true);
    const tree = await collectLocalDirTree(localFs, normalizedLocalDirPath);

    waitingToast.show();
    try {
        await ensureContainerDir(containerFs, normalizedContainerDirPath);
        for (const sourceDir of tree.directories) {
            const relativePath = stripBasePrefix(sourceDir, normalizedLocalDirPath);
            if (!relativePath) {
                continue;
            }
            const targetDir = normalizePath(localFs, joinPath(normalizedContainerDirPath, relativePath), true);
            await ensureContainerDir(containerFs, targetDir);
        }

        let fileCount = 0;
        let byteCount = 0;
        const totalFiles = tree.files.length;
        for (const sourceFile of tree.files) {
            const relativePath = stripBasePrefix(sourceFile, normalizedLocalDirPath);
            const targetFile = normalizePath(localFs, joinPath(normalizedContainerDirPath, relativePath), false);
            const localResponse = await localFs.fetch_raw(sourceFile);
            const localBytes = new Uint8Array(await localResponse.arrayBuffer());
            await containerFs.writeFile(targetFile, localBytes);
            fileCount += 1;
            byteCount += localBytes.length;
            updateBulkTransferProgress("Copying to container", fileCount, totalFiles);
        }

        return {
            source: normalizedLocalDirPath,
            destination: normalizedContainerDirPath,
            filesCopied: fileCount,
            bytesCopied: byteCount,
        };
    }
    finally {
        waitingToast.hide();
    }
}

window.loadContainerDirIntoLocalDir = async (containerDirPath, localDirPath) => {
    const localFs = ensureLocalFsClient();
    const containerFs = ensureWebContainerFs();
    await initialiseWebContainerAPIs();

    const normalizedContainerDirPath = normalizePath(localFs, containerDirPath, true);
    const normalizedLocalDirPath = normalizePath(localFs, localDirPath, true);
    const tree = await collectContainerDirTree(localFs, containerFs, normalizedContainerDirPath);

    try {
        waitingToast.show();
        updateBulkTransferProgress("Copying to local", 0, tree.files.length);
        await ensureLocalDir(localFs, normalizedLocalDirPath);
        for (const sourceDir of tree.directories) {
            const relativePath = stripBasePrefix(sourceDir, normalizedContainerDirPath);
            if (!relativePath) {
                continue;
            }
            const targetDir = normalizePath(localFs, joinPath(normalizedLocalDirPath, relativePath), true);
            await ensureLocalDir(localFs, targetDir);
        }

        let fileCount = 0;
        let byteCount = 0;
        const totalFiles = tree.files.length;
        for (const sourceFile of tree.files) {
            const relativePath = stripBasePrefix(sourceFile, normalizedContainerDirPath);
            const targetFile = normalizePath(localFs, joinPath(normalizedLocalDirPath, relativePath), false);
            const containerBytes = await readContainerFileBytes(containerFs, sourceFile);
            await localFs.write([{ path: targetFile, content: containerBytes }]);
            fileCount += 1;
            byteCount += containerBytes.length;
            updateBulkTransferProgress("Copying to local", fileCount, totalFiles);
        }

        return {
            source: normalizedContainerDirPath,
            destination: normalizedLocalDirPath,
            filesCopied: fileCount,
            bytesCopied: byteCount,
        };
    }
    finally {
        waitingToast.hide();
    }
}

// Test cases for the bulk transfer functions can be added here to verify their functionality in different scenarios, such as copying empty directories, handling large files, and ensuring proper error handling when paths do not exist or permissions are insufficient.

/*
await webContainerFS.rm("/lumara", { recursive: true })

await webContainerFS.rm("/lumu", { recursive: true })

await loadLocalDirIntoContainerDir("/INTERNAL_READ_ONLY/Resources/css", "lumara")

await loadLocalFileIntoContainerPath("/INTERNAL_READ_ONLY/Resources/klite.embd", "lumu/chats.json")

await webContainerFS.readdir(".")
await webContainerFS.readdir("lumu")

await loadContainerDirIntoLocalDir("/lumu", "/tmp/lumu")

await loadContainerFileIntoLocal("/lumara/agent.css", "/tmp/lumu/a.css")
*/

/*

createSvelteEnv()
openDevEmbeddedView()

*/