// Core logic

let serverSavesPopup = document.getElementById("serverSaves");
let serverSavingPopup = document.getElementById("serverSavingPopup");
let serverSavingTypePopup = document.getElementById("serverSavingTypePopup");
let saveOptions = document.getElementById("saveOptions"), loadSave = document.getElementById("loadFromDB"),
    deleteFromDB = document.getElementById("deleteFromDB"), saveToDB = document.getElementById("saveToDB"),
    saveContent = document.getElementById("saveContent");

let serverSavesLabel = document.getElementById("serverSavesLabel"), serverSavesType = document.getElementById("serverSavesType"),
    serverSavesGroup = document.getElementById("serverSavesGroup"), serverSavesPassword = document.getElementById("serverSavesPassword"),
    saveToDBUpload = document.getElementById("saveToDBUpload"), saveToDBCurrent = document.getElementById("saveToDBCurrent"),
    submitSaveToDB = document.getElementById("submitSaveToDB"), serverSavesPreview = document.getElementById("serverSavesPreview"),
    serverSavesPreviewClear = document.getElementById("serverSavesPreviewClear"),
    serverSavesPreviewContainer = document.getElementById("serverSavesPreviewContainer");

let lastUsedAdminPassword = "", lastUsedSavePassword = "";

getRemoteDataEndpoint = async () => {
    let remoteDataSettings = JSON.parse(await indexeddb_load("remoteDataSettings")), remoteDataURL = custom_kobold_endpoint;
    if (!!remoteDataSettings?.remoteDataStorageUrl && remoteDataSettings.remoteDataStorageUrl.trim().length > 0)
    {
        remoteDataURL = remoteDataSettings.remoteDataStorageUrl.trim()
    }
    return remoteDataURL
}

lastEndpointValidatedForRemoteSaving = null;
validateRemoteDataEndpoint = async () => {
    let remoteDataURL = await getRemoteDataEndpoint()
    return fetch(apply_proxy_url(remoteDataURL + koboldcpp_version_endpoint),
    {
        method: 'GET',
        headers: get_kobold_header(),
    })
    .then(x => x.json())
    .then(data => {
        if (data && data != "" && data.version && data.version != "") {
            lastEndpointValidatedForRemoteSaving = (data.hasServerSaving ? true : false)
        }
    })
}

is_using_kcpp_with_server_saving = () => {
    if (lastEndpointValidatedForRemoteSaving == null)
    {
        // This will fail at first - this is fine as the situations which this should occur in are very low
        validateRemoteDataEndpoint()
    }
    return lastEndpointValidatedForRemoteSaving || false
}

getAuthHeaders = () => {
    let header = {};
    let adminKey = lastUsedAdminPassword;
    if (adminKey != "") {
        header['Authorization'] = 'Bearer ' + adminKey;
    }
    return header;
}

hideAllServerSavingPopups = () => {
    hideServerSavesPopup()
    hideServerSavingTypePopup()
    hideServerSavingPopup()
}

handleError = (e) => {
    console.error(e)
    hideAllServerSavingPopups()
    msgbox(!!e?.message ? e.message : (!!e?.error ? e.error : e))
}

getServerSaves = async (filter = {}) => {
    let remoteEndpoint = await getRemoteDataEndpoint();
    return fetch(`${remoteEndpoint}/api/data/list`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(filter)
    })
        .then(resp => resp.json())
        .catch(e => {
            handleError(e)
        })
}

reloadSaves = () => {
    saveOptions.innerHTML = ""
    return getServerSaves().then(saves => {
        for (save in saves) {
            if (!!saves[save].name) {
                let opt = createStyledSaveOption(saves[save].name, saves[save].name, saves[save].isPublic, saves[save].isEncrypted)
                saveOptions.appendChild(opt)
            }
        }
    })
        .catch(e => {
            handleError(e)
        })
}

createStyledSaveOption = (name, value, isPublic, isEncrypted) => {
    let displayText = `${name} ${!!isPublic ? "(Public)" : "(Private)"} ${!!isEncrypted ? "🔒" : ""}`
    let optElem = new Option(displayText, value)
    optElem.style.color = (!!isPublic ? "red" : "green")
    return optElem
}

reloadSaveMetadata = async () => {
    let remoteEndpoint = await getRemoteDataEndpoint();
    return fetch(`${remoteEndpoint}/api/data/metadata`, {
        method: "POST",
        headers: getAuthHeaders()
    })
        .then(resp => resp.json())
        .then(metadata => {
            let groups = metadata?.group, types = metadata?.type
            if (!!groups) {
                serverSavesGroup.innerHTML = ""
                let defaultOption = createStyledSaveOption("No group", "", false)
                serverSavesGroup.appendChild(defaultOption)
                for (groupName in groups) {
                    let newOption = createStyledSaveOption(groupName, groupName, groups[groupName].isPublic)
                    serverSavesGroup.appendChild(newOption)
                }
            }
            if (!!types) {
                serverSavesType.innerHTML = ""
                for (typeName in types) {
                    if (typeName !== "Manager") {
                        let newOption = new Option(typeName, typeName)
                        serverSavesType.appendChild(newOption)
                    }
                }
            }
        })
}


loadServerSave = async (saveName, isEncrypted) => {
    let remoteEndpoint = await getRemoteDataEndpoint();
    fetch(`${remoteEndpoint}/api/data/get`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ filename: saveName })
    })
        .then(resp => resp.json())
        .then(saveData => {
            if (isEncrypted) {
                inputBox("Please input save password:", "Save Password Required", lastUsedSavePassword, "(Input Save Password)", () => {
                    let userinput = getInputBoxValue();
                    userinput = userinput.trim();
                    if (userinput != null && userinput != "") {
                        lastUsedSavePassword = userinput
                        loadServerFile(saveName, decrypt(lastUsedSavePassword, saveData))
                    }
                }, false, false, true);
            }
            else {
                // import_compressed_story(atob(saveData), false)
                loadServerFile(saveName, saveData)
            }
            hideServerSavesPopup();
        })
        .catch(e => {
            handleError(e)
        })
}
loadSave.onclick = () => {
    isEncrypted = saveOptions.selectedOptions[0].text.endsWith("🔒")
    loadServerSave(saveOptions.value, isEncrypted)
}

saveToDB.onclick = () => {
    showServerSavingTypePopup()
}

deleteFromDB.onclick = async () => {
    let remoteEndpoint = await getRemoteDataEndpoint();
    fetch(`${remoteEndpoint}/api/data/delete`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ filename: saveOptions.value })
    })
        .then(resp => resp.json())
        .then(message => {
            handleResponse(message, () => reloadSaves())
        })
        .catch(e => {
            handleError(e)
        })
}

promptForAdminPassword = (callback) => {
    if (koboldcpp_admin_type == 2 && lastUsedAdminPassword == "") {
        inputBox("Please input admin password:", "Admin Password Required", lastUsedAdminPassword, "(Input Admin Password - leave blank for public)", () => {
            let userinput = getInputBoxValue();
            userinput = userinput.trim();
            // This does not need to be not blank (blank is for public save access)
            if (userinput != null) {
                lastUsedAdminPassword = userinput
                callback()
            }
        }, false, false, true);
    }
    else {
        lastUsedAdminPassword = ""
        callback()
    }
}

showServerSavesPopup = () => {
    if (is_using_kcpp_with_server_saving()) {
        hideAllServerSavingPopups()
        promptForAdminPassword(() => {
            reloadSaves().then(() => {
                serverSavesPopup.classList.remove("hidden")
            })
        })
    }
    else {
        handleError("Server side saving not enabled: Please check admin tab in KCPP launcher")
    }
}

hideServerSavesPopup = () => {
    serverSavesPopup.classList.add("hidden")
}

showServerSavingTypePopup = () => {
    hideAllServerSavingPopups()
    promptForAdminPassword(() => {
        serverSavingTypePopup.classList.remove("hidden")
    })
}

// Thumbnail code from: https://stackoverflow.com/a/61754764
// Creates a thumbnail fitted insize the boundBox (w x h)
generateThumbnail = (file, boundBox) => {
    if (!boundBox || boundBox.length != 2) {
        throw "You need to give the boundBox"
    }
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        throw new Error('Context not available')
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        try {
            img.onerror = reject
            img.onload = function () {
                const scaleRatio = Math.min(...boundBox) / Math.max(img.width, img.height)
                const w = img.width * scaleRatio
                const h = img.height * scaleRatio
                canvas.width = w
                canvas.height = h
                ctx.drawImage(img, 0, 0, w, h)
                return resolve(canvas.toDataURL(file.type))
            }
            if (typeof file === "string") {
                img.src = file
            }
            else {
                img.src = URL.createObjectURL(file)
            }
        }
        finally {
            URL.revokeObjectURL(img.src)
        }
    })
}

let lastThumbnailData = null
saveToDBUpload.onclick = () => {
    promptUserForLocalFile(async (result) => {
        lastThumbnailData = null
        if (result.ext === ".png" || result.ext === ".webp") {
            let dataUrl = await generateThumbnail(result.file, [300, 300])
            lastThumbnailData = dataUrl
        }

        showServerSavingPopup(result.fileName, result.content)
    }, [".png", ".json", ".webp", ".kaistory"])
}

saveToDBCurrent.onclick = () => {
    let defaultsavename = (localsettings.opmode == 1 ? "Untitled Story" : (localsettings.opmode == 2 ? "Untitled Adventure" : (localsettings.opmode == 3 ? "Untitled Chat" : "Untitled Instruct")));
    let savename = defaultsavename + " " + new Date().toLocaleString();
    let newcompressedstory = generate_compressed_story(true, true, true);
    lastThumbnailData = null;
    showServerSavingPopup(savename, btoa(newcompressedstory))
}

hideServerSavingTypePopup = () => {
    serverSavingTypePopup.classList.add("hidden")
}

let lastFileData = ""

let setSaveUploadPreviewThumbnail = () => {
    if (!!lastThumbnailData) {
        serverSavesPreview.src = lastThumbnailData
        serverSavesPreviewClear.style.display = "unset"
    }
    else {
        serverSavesPreview.src = loadImgData
        serverSavesPreviewClear.style.display = "none"
    }
}

serverSavesPreview.onclick = () => {
    promptUserForLocalFile(async (result) => {
        lastThumbnailData = null
        let dataUrl = await generateThumbnail(result.file, [300, 300])
        lastThumbnailData = dataUrl
        setSaveUploadPreviewThumbnail()
    }, [".png", ".jpg", ".jpeg", ".webp", ".gif"])
}

serverSavesPreviewClear.onclick = () => {
    lastThumbnailData = null
    setSaveUploadPreviewThumbnail()
}

showServerSavingPopup = (fileLabel, fileData) => {
    hideAllServerSavingPopups()
    lastFileData = fileData
    serverSavesLabel.value = fileLabel
    serverSavesPassword.value = lastUsedSavePassword
    setSaveUploadPreviewThumbnail()
    reloadSaveMetadata().then(() => {
        serverSavingPopup.classList.remove("hidden")
    })
        .catch(e => {
            handleError(e)
        })
}

hideServerSavingPopup = () => {
    serverSavingPopup.classList.add("hidden")
}

submitSaveToDB.onclick = async () => {
    // /api/data/metadata
    // serverSavesLabel, serverSavesType, serverSavesGroup, serverSavesPassword

    if (serverSavesLabel.value.trim() == "") {
        handleError("When saving you must enter a file label")
    }
    else {
        hideAllServerSavingPopups()
        let isEncrypted = false
        if (serverSavesPassword.value.trim() !== "") {
            lastUsedSavePassword = serverSavesPassword.value.trim()
            lastFileData = encrypt(lastUsedSavePassword, lastFileData)
            isEncrypted = true
        }

        let bodyData = {
            filename: serverSavesLabel.value.trim(),
            data: lastFileData,
            type: "Save",
            isEncrypted: isEncrypted ? "1" : "0",
            group: (serverSavesGroup.value.trim() !== "" ? serverSavesGroup.value.trim() : null),
            type: (serverSavesType.value.trim() !== "" ? serverSavesType.value.trim() : null),
            thumbnail: lastThumbnailData
        }
        lastFileData = ""
        lastThumbnailData = null
        let remoteEndpoint = await getRemoteDataEndpoint();
        fetch(`${remoteEndpoint}/api/data/put`, {
            method: "POST",
            body: JSON.stringify(bodyData),
            headers: getAuthHeaders()
        })
            .then(resp => resp.json())
            .then(message => {
                handleResponse(message)
            })
            .catch(e => {
                handleError(e)
            })
    }
}


handleResponse = (message, successCallback = undefined) => {
    if ((message?.success === undefined && message?.error === undefined) || message?.success === true) {
        if (!!successCallback) {
            successCallback(message)
        }
    }
    else if (message?.success === false) {
        handleError(message)
    }
}

loadServerFile = async (fileName, b64Data) => {
    // Handle compressed saves
    try {
        if (!b64Data.startsWith("data:")) {
            import_compressed_story(atob(b64Data), false)
        }
        else {
            // And other files
            let mimeType = b64Data.split(";base64,")[0].replace("data:", "");
            let resp = await fetch(b64Data), blob = await resp.blob();
            let file = new File([blob], fileName, { type: mimeType })
            load_selected_file(file)
        }
    }
    catch (e) {
        handleError("Unable to load save data - either file is broken or password entered wrongly")
    }
}

let originalLoadSelectedFile = load_selected_file

load_selected_file = (file) => {
    loadingNewGame = true
    originalLoadSelectedFile(file)
}

// Append button with the third party mod button as that's the one place editing the menu

let callbackAfterReload = (callback) => {
    let startTime = Date.now(), intervalId = setInterval(async () => {
        if (await fetch(custom_kobold_endpoint + "/api/admin/health").then(c => c.text()).catch(e => {/*Ignore error*/ }) === "true") {
            clearInterval(intervalId);
            if (typeof callback === "function") {
                callback(Date.now() - startTime)
            }
        }
    }, 1000);
}

// Scenario specific changes

/**
 * Same as the load img, but just copied here to allow JS reuse
 */
let loadImgData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAMAAADXqc3KAAAAAXNSR0IB2cksfwAAAAlwSFlzAAAAnQAAAJ0Bj3LnbgAAADxQTFRF8MQZKbmZ8p0fAAAA8bIc8MIa8MQZq7NIKrmY7cQa0sIs8d2BebRn87wcLL+aJrmZ//8AdbhpAP//c69phZ/jMwAAABR0Uk5T//3/AP+y8v6kbP///xcZUAGrAUn40tQBAAAAp0lEQVR4nHWSiw6DIAwAy1peojLd///rKm3ZZOOiCXLpBRIhB2CCf+JeXUr1RAECATGQ+WN3TFUBKsJmJu0ijOCZo5m7EJzVRrE2c3ZBhoiXCXoYsYm4qejbUSbWo94HXCfZALXF0kVWQVAKP6Xo/hK0RHZcmVnAa+lzketYESBb6dvwPmxDqdX49TiWlIw/JeG6+ViCVsJZCWclnJVwVkLwfwau/+INBncEwpxiohQAAAAASUVORK5CYII="

let originalLoadScenario = complete_load_scenario, originalDisplayScenarios = display_scenarios, originalScenarioSearch = scenario_search, originalPreviewTempScenario = preview_temp_scenario;

complete_load_scenario = () => {
    if (temp_scenario?.serverSave === true) {
        loadServerSave(temp_scenario.serverSaveData.name, temp_scenario.serverSaveData.isEncrypted)
    }
    else {
        originalLoadScenario()
    }
}

let scenarioDropdown = document.getElementById("scenariosearchdropdown");
scenarioDropdown.appendChild(new Option("Server", 50))
display_scenarios = () => {
    if (is_using_kcpp_with_server_saving()) {
        // Clean up scenario DB and the scenario dropdown options
        scenario_db = scenario_db.filter(scenario => !(scenario?.serverSave === true))
        Array.from(scenarioDropdown.children).filter(elem => !/^\d+$/.test(elem.value)).forEach(elem => elem.remove())
        serverSideTypes = []

        promptForAdminPassword(() => {
            /* For scenarios only add: { 
                typeName: "Scenarios"
            }*/
            getServerSaves().then(saves => {
                for (save in saves) {
                    if (!!saves[save].name && saves[save]?.typeName !== "Manager") {
                        let name = saves[save].name, isPublic = saves[save].isPublic, isEncrypted = saves[save].isEncrypted
                        let displayText = `${name} ${!!isPublic ? "(Public)" : "(Private)"} ${!!isEncrypted ? "🔒" : ""}`
                        let typeName = saves[save].typeName
                        if (!Array.from(scenarioDropdown.children).find(elem => elem.value === typeName)) {
                            scenarioDropdown.appendChild(new Option(`${typeName} (Server)`, typeName))
                        }

                        let scenario = {
                            title: displayText,
                            desc: displayText,
                            serverSave: true,
                            serverSaveData: saves[save],
                            serverSaveTypeName: typeName
                        }

                        if (!!saves[save]?.previewContent) {
                            scenario.image = saves[save]?.previewContent,
                                scenario.image_aspect = 1
                        }
                        scenario_db.push(scenario)
                    }
                }

                originalDisplayScenarios()

                let sgrid = document.getElementById("scenariogrid");
                Array.from(document.querySelectorAll("#scenariogrid > button")).filter(schild => schild.name != "").forEach(schild => {
                    let elem = scenario_db[schild.name];
                    scenarioTitle = document.createElement("div")
                    scenarioTitle.innerText = schild.innerText
                    scenarioTitle.classList.add("scenarioTitle")
                    schild.innerText = ""
                    schild.appendChild(scenarioTitle)

                    if (!!elem?.serverSave) {
                        let hasImageAssigned = !!elem?.image
                        if (hasImageAssigned) {
                            schild.style.backgroundImage = `url(${elem?.image})`
                            schild.style.backgroundSize = "contain"
                        }
                        else {
                            schild.style.backgroundImage = `var(--img_load)`
                        }
                        schild.style.backgroundImage += ",linear-gradient(to right, rgb(40, 160, 140), rgb(35, 150, 175))"
                    }
                })

                scenario_search()
            })
                .catch(e => {
                    console.error(e)
                })
        })
    }
    else {
        originalDisplayScenarios()
    }
}

scenario_search = () => {
    originalScenarioSearch()

    let sgrid = document.getElementById("scenariogrid");
    let searchstr = document.getElementById("scenariosearch").value.trim().toLowerCase();
    let sdrop = scenarioDropdown.value;
    let sgrid_nodes = sgrid.children;
    for (let i = 0; i < sgrid_nodes.length; i++) {
        let schild = sgrid_nodes[i];
        let elem = null;
        if (schild.name != "") {
            elem = scenario_db[schild.name];
        }
        if (!!elem?.serverSave) {
            // If the selector is everything, all server data, or the specific type
            let matchesServerSideFilter = sdrop == 0 || sdrop == 50 || (sdrop === elem.serverSaveTypeName)
            let doesSearchTermMatch = searchstr == "" || schild.innerText.trim().toLowerCase().includes(searchstr)
            if (matchesServerSideFilter && doesSearchTermMatch) {
                schild.style.display = "block";
            }
            else {
                schild.style.display = "none";
            }
        }
    }
}

preview_temp_scenario = () => {
    let author = "";
    let image = "";
    if (temp_scenario.author && temp_scenario.author != "") {
        author = "<br><b>Author:</b> " + temp_scenario.author;
    }
    if (temp_scenario.image) {
        temp_scenario.gui_type = 2; //upgrade to aesthetic if we have image
        image = `<img id="tempscenarioimg" style="float:right; width:100px; height:${100 / (temp_scenario.image_aspect ? temp_scenario.image_aspect : 1)}px; padding: 8px;" src="${encodeURI(temp_scenario.image)}"></img>`;
    }
    let modeSelection = temp_scenario?.serverSaveTypeName
    if (!modeSelection) {
        modeSelection = temp_scenario.opmode == 1 ? "Story" : (temp_scenario.opmode == 2 ? "Adventure" : (temp_scenario.opmode == 3 ? "Chat" : "Instruct"))
    }
    document.getElementById("scenariodesc").innerHTML = image + `<p><b><u>` + escape_html(temp_scenario.title) + `</u></b></p>` +
        `<p><b>Mode:</b> ` + modeSelection + author + `</p>`
        + `<p>` + (temp_scenario.desc != "" ? escape_html(temp_scenario.desc).replace(/\n/g, '<br>') : "[No Description Given]") + `</p>`;
}

