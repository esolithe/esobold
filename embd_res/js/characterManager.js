let updateMetadata = async () => {
    let remoteEndpoint = await getRemoteDataEndpoint();
    await fetch(`${remoteEndpoint}/api/data/metadata`, {
        method: "POST",
        body: "{}",
        headers: getAuthHeaders()
    })
        .catch(e => {
            handleError(e)
        })

}

let getAutosavesForName = async (charName, shouldAlsoSave = false) => {
    let remoteDataSettings = JSON.parse(await indexeddb_load("remoteDataSettings"))
    if (!!remoteDataSettings) {
        let { autosaveMaxNumber, autosaveRemoteSync } = remoteDataSettings;
        let existingAutosaves = await getCharacterData(charName)
        if (!Array.isArray(existingAutosaves?.data)) {
            existingAutosaves = []
        }
        else {
            existingAutosaves = existingAutosaves.data
        }
        if (is_using_kcpp_with_server_saving() && autosaveRemoteSync) {
            await updateMetadata()
            try {
                await new Promise((resolve) => promptForAdminPassword(resolve));
                let autoSaves = await getServerSaves({ typeName: "Autosave" })
                if (autoSaves[charName] !== undefined) {
                    let remoteEndpoint = await getRemoteDataEndpoint();
                    let autosaveData = await fetch(`${remoteEndpoint}/api/data/get`, {
                        method: "POST",
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ filename: charName })
                    })
                        .then(resp => resp.json())
                        .then(JSON.parse)

                    existingAutosaves.push(...autosaveData)
                }
            }
            catch (e) {
                console.error("Cannot retrieve autosaves from server", e)
            }
        }
        if (shouldAlsoSave) {
            let save = generate_savefile(true, true, true)
            existingAutosaves.push(save)
        }
        existingAutosaves = existingAutosaves.filter((v, i, a) => i === a.findIndex(c => c.saveCreationDate === v.saveCreationDate))
        // Sort from newest to oldest
        existingAutosaves = existingAutosaves.sort((a, b) => {
            try {
                return new Date(a?.saveCreationDate) > new Date(b?.saveCreationDate) ? -1 : 1
            }
            catch (e) {
                console.error("Cannot sort autosave dates", e)
                return 0;
            }
        })
        while (existingAutosaves.length > autosaveMaxNumber) {
            existingAutosaves.pop();
        }
        return existingAutosaves
    }
    return []
}

let saveAutosaveToServer = async (charName, existingAutosaves = undefined) => {
    let remoteDataSettings = JSON.parse(await indexeddb_load("remoteDataSettings"))
    if (!!remoteDataSettings) {
        let { remoteDataStorageUrl, autosaveMaxNumber, autosaveRemoteSync } = remoteDataSettings;
        if (is_using_kcpp_with_server_saving() && autosaveRemoteSync) {
            try {
                let remoteEndpoint = await getRemoteDataEndpoint();
                await fetch(`${remoteEndpoint}/api/data/delete`, {
                    method: "POST",
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ filename: charName })
                })
                    .catch(e => {

                    })

                if (existingAutosaves !== undefined) {
                    let bodyData = {
                        filename: charName,
                        data: JSON.stringify(existingAutosaves),
                        type: "Autosave",
                        isEncrypted: "0",
                        thumbnail: null
                    };
                    let remoteEndpoint = await getRemoteDataEndpoint();
                    fetch(`${remoteEndpoint}/api/data/put`, {
                        method: "POST",
                        body: JSON.stringify(bodyData),
                        headers: getAuthHeaders()
                    })
                        .then(resp => resp.json())
                        .catch(e => {
                            handleError(e)
                        })
                }
            }
            catch (e) {
                console.error("Cannot sent autosaves to server", e)
            }
        }
    }
}

let syncAutosave = async (autosaveName, shouldAlsoSave = false) => {
    let charName = autosaveName.replaceAll(/[^\w()_\-'",!\[\].]/g, " ").replaceAll(/\s+/g, " ").trim().replace(" (Auto)", "") + " (Auto)"
    let existingAutosaves = await getAutosavesForName(charName, shouldAlsoSave)
    await saveKLiteAutosaveToIndexDB(charName, existingAutosaves)
    await saveAutosaveToServer(charName, existingAutosaves)
    return existingAutosaves
}

let removeAutosave = async (autosaveName) => {
    let charName = autosaveName.replaceAll(/[^\w()_\-'",!\[\].]/g, " ").replaceAll(/\s+/g, " ").trim().replace(" (Auto)", "") + " (Auto)"
    await indexeddb_save(`character_${charName}`)
    updateCharacterListFromAll()
    await saveAutosaveToServer(charName, undefined)
}

let putAllCharacterManagerData = () => {
    popupUtils.reset()

    msgboxYesNo("Are you sure you wish to overwrite server data?", "Character manager", () => {
        promptForAdminPassword(() => {
            inputBox("Save password", "Please input save password (or leave blank for no password):", "", "(Input Save Password)", async () => {
                await updateMetadata()

                let managerSaves = Object.entries(await getServerSaves()).filter(entry => {
                    [key, value] = entry;
                    return value.typeName === "Manager"
                })

                await Promise.all(managerSaves.map(async entry => {
                    let [key, value] = entry
                    let remoteEndpoint = await getRemoteDataEndpoint();
                    await fetch(`${remoteEndpoint}/api/data/delete`, {
                        method: "POST",
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ filename: value.name })
                    })
                        .then(resp => resp.json())
                        .catch(e => {
                            handleError(e)
                        })
                }))

                let userinput = getInputBoxValue(), password = "";
                userinput = userinput.trim();
                if (userinput != null && userinput != "") {
                    password = userinput
                }

                let isEncrypted = false;
                if (password.trim() !== "") {
                    password = password.trim()
                    isEncrypted = true
                }
                let allTasks = await Promise.all(allCharacterNames.map(async c => {
                    let { name, type, thumbnail } = c, data = await getCharacterData(name);
                    waitingToast.setText(`Sending data ${name}`)
                    waitingToast.show()
                    if (thumbnail !== undefined) {
                        data.thumbnail = thumbnail
                    }
                    if (type !== undefined) {
                        data.type = type
                    }
                    data = JSON.stringify(data)
                    if (isEncrypted) {
                        data = encrypt(password, data)
                    }

                    let bodyData = {
                        filename: name.trim(),
                        data: data,
                        type: "Save",
                        isEncrypted: isEncrypted ? "1" : "0",
                        group: null,
                        type: "Manager",
                        thumbnail: null
                    }
                    let remoteEndpoint = await getRemoteDataEndpoint();
                    await fetch(`${remoteEndpoint}/api/data/put`, {
                        method: "POST",
                        body: JSON.stringify(bodyData),
                        headers: getAuthHeaders()
                    })
                        .then(resp => resp.json())
                        .catch(e => {
                            handleError(e)
                        })

                    return true

                    // decrypt("test", (await Promise.all(putAllCharacterManagerData()))[0].data)
                    // JSON.parse(decrypt("test", (await Promise.all(putAllCharacterManagerData()))[0].data))
                }))
                waitingToast.hide()
            }, false, false, true);
        })
    })
}

let loadAllCharacterManagerData = () => {
    popupUtils.reset()

    promptForAdminPassword(() => {
        inputBox("Save password", "Please input save password (or leave blank for no password):", "", "(Input Save Password)", async () => {

            await updateMetadata()

            let userinput = getInputBoxValue(), password = "";
            userinput = userinput.trim();
            if (userinput != null && userinput != "") {
                password = userinput
            }

            let isEncrypted = false;
            if (password.trim() !== "") {
                password = password.trim()
                isEncrypted = true
            }
            let managerSaves = Object.entries(await getServerSaves()).filter(entry => {
                [key, value] = entry;
                return value.typeName === "Manager"
            })

            await Promise.all(managerSaves.map(async entry => {
                let [key, value] = entry
                waitingToast.setText(`Receiving data ${value.name}`)
                waitingToast.show()
                let remoteEndpoint = await getRemoteDataEndpoint();
                await fetch(`${remoteEndpoint}/api/data/get`, {
                    method: "POST",
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ filename: value.name })
                })
                    .then(resp => resp.json())
                    .then(saveData => {
                        let managerData = isEncrypted ? decrypt(password, saveData) : saveData;
                        managerData = JSON.parse(managerData)
                        let { type, thumbnail } = managerData
                        delete managerData["type"]
                        delete managerData["thumbnail"]
                        return indexeddb_save(`character_${managerData.name}`, JSON.stringify(managerData)).then(() => {
                            let charOverview = { name: managerData.name, type: type }
                            if (thumbnail !== undefined) {
                                charOverview.thumbnail = thumbnail
                            }
                            allCharacterNames = allCharacterNames.filter(c => c.name !== managerData.name)
                            allCharacterNames.push(charOverview);
                            updateCharacterListFromAllDe();
                        })
                    })
                    .catch(e => {
                        handleError(e)
                    })

                return true
            }))
            waitingToast.hide()
        }, false, false, true);
    })
}

let migrateOldData = async () => {
    let saveKLiteSaveToIndexDBIfNew = (name, data) => {
        let nameToCheck = name.replaceAll(/[^\w()_\-'",!\[\].]/g, " ").replaceAll(/\s+/g, " ").trim();
        if (allCharacterNames.find(meta => nameToCheck === meta.name) === undefined) {
            saveKLiteSaveToIndexDB(name, data)
        }
    }

    // Handle saves from IndexDB slots
    let slotpromises = [];
    for (let i = 0; i < SAVE_SLOTS; ++i) {
        slotpromises.push(Promise.all([indexeddb_load("slot_" + i + "_meta", ""), indexeddb_load("slot_" + i + "_data", "")]));
    }
    await Promise.all((await Promise.all(slotpromises)).map(res => {
        [name, data] = res
        return {
            name,
            data: data
        }
    }).filter(res => !!res.name && !!res.data).map(res => saveKLiteSaveToIndexDBIfNew(res.name, JSON.parse(res.data))))

    // Handle saves from server slots
    let fetchDataForSlot = (slot) => {
        return fetch(apply_proxy_url(custom_kobold_endpoint + koboldcpp_savedata_load_endpoint), {
            method: 'POST', // or 'PUT'
            headers: get_kobold_header(),
            body: JSON.stringify({
                "slot": slot,
            }),
        })
            .then((response) => response.json())
            .then((resp) => {
                if (!resp.success || !resp.data) {
                    return "";
                } else {
                    let data = decompress_story(resp.data.data)
                    return {
                        name: slot,
                        data: data
                    };
                }
            })
            .catch((error) => {
                console.error('Error:', error);
            });
    }

    let netsaveslotlabels = []
    if (is_using_kcpp_with_savedatafile()) {
        //grab saves
        netsaveslotlabels = fetch(apply_proxy_url(custom_kobold_endpoint + koboldcpp_savedata_list_endpoint), {
            method: 'POST', // or 'PUT'
            headers: get_kobold_header(),
        })
            .then((response) => response.json())
            .then((data) => {
                return Promise.all(data.filter(name => !!name).map(fetchDataForSlot))
            })
            .catch((error) => {
                console.error('Error:', error);
            });
    }

    let netSaveNames = await netsaveslotlabels
    if (netSaveNames.length > 0) {
        await Promise.all(netSaveNames.map(res => saveKLiteSaveToIndexDBIfNew(res.name, res.data)))
    }
}

let createSection = (containerElem, section, textOrElem) => {
    if (!!textOrElem && (textOrElem.length > 0 || textOrElem instanceof Element)) {
        let sectionContainer = document.createElement("span");
        sectionContainer.style = "width: 100%; display: flex; padding: 10px;";
        let sectionTitle = document.createElement("span"), sectionElem;
        sectionTitle.innerText = section;
        sectionTitle.style = "padding-right: 5px; font-weight: bold;"
        sectionContainer.appendChild(sectionTitle);
        if (textOrElem instanceof Element) {
            sectionElem = textOrElem
        }
        else if (Array.isArray(textOrElem)) {
            sectionElem = document.createElement("ul");
            textOrElem.forEach(listContent => {
                let listElem = document.createElement("li");
                let summaryOfKey = listContent.length > maxLengthForSection ? `${listContent.substr(0, halfMaxLengthForSection).trim()}...${listContent.substr(-halfMaxLengthForSection).trim()}` : listContent.trim();
                listElem.innerText = summaryOfKey
                if (listContent.length !== summaryOfKey.length) {
                    let isShown = false
                    listElem.onclick = () => {
                        isShown = !isShown
                        listElem.innerText = isShown ? listContent : summaryOfKey
                    }
                    listElem.title = "Click to show / hide full content"
                }
                sectionElem.appendChild(listElem)
            })
        }
        else {
            sectionElem = document.createElement("span");
            let summaryOfKey = textOrElem.length > maxLengthForSection ? `${textOrElem.substr(0, halfMaxLengthForSection).trim()}...${textOrElem.substr(-halfMaxLengthForSection).trim()}` : textOrElem.trim();
            sectionElem.innerText = summaryOfKey
            if (textOrElem.length !== summaryOfKey.length) {
                let isShown = false
                sectionElem.onclick = () => {
                    isShown = !isShown
                    sectionElem.innerText = isShown ? textOrElem : summaryOfKey
                }
                sectionElem.title = "Click to show / hide full content"
            }
        }
        sectionContainer.appendChild(sectionElem);
        containerElem.appendChild(sectionContainer);
    }
}

let createDetailsContent = (name) => {
    let contents = document.createElement("div");
    contents.style.color = "white";
    contents.style.padding = "5px";
    let titleElem = document.createElement("span");
    titleElem.classList.add("popuptitletext");
    titleElem.innerText = name;
    titleElem.style.borderBottom = "solid";
    contents.appendChild(titleElem);
    return contents;
}

let createTextInputSection = (container, id, sectionName, placeholder, value = "") => {
    let input = document.createElement("input")
    input.id = id
    input.type = "text"
    input.placeholder = placeholder
    input.value = value
    input.style.width = "inherit"
    createSection(container, sectionName, input)
}

let createCheckboxInputSection = (container, id, sectionName, value = false) => {
    let input = document.createElement("input")
    input.id = id
    input.type = "checkbox"
    input.checked = value
    createSection(container, sectionName, input)
}

let createNumberInputSection = (container, id, sectionName, value = "", validation = undefined) => {
    let input = document.createElement("input")
    input.id = id
    input.type = "number"
    input.value = value
    input.style.width = "inherit"
    if (!!validation) {
        input.lastInput = input.value
        input.addEventListener("input", () => {
            if (validation(input.value)) {
                input.lastInput = input.value
            }
            else {
                input.value = input.lastInput
            }
        })
    }
    createSection(container, sectionName, input)
}

let createButtonInputSection = (container, id, sectionName, buttonText, clickHandler = undefined) => {
    let input = document.createElement("button")
    input.id = id
    input.type = "button"
    input.classList.add("btn", "btn-primary")
    input.textContent = buttonText
    input.addEventListener("click", (e) => {
        if (!!clickHandler) {
            clickHandler(e)
        }
    })
    createSection(container, sectionName, input)
}

indexeddb_load("remoteDataSettings").then(data => {
    if (data === undefined) {
        indexeddb_save("remoteDataSettings", JSON.stringify({
            remoteDataStorageUrl: "",
            autosaveName: "Autosave",
            autosaveMaxNumber: 1,
            autosaveRemoteSync: false
        }))
    }
})

let controlRemoteDataStore = async () => {
    let remoteDataSettings = JSON.parse(await indexeddb_load("remoteDataSettings"))

    let contents = createDetailsContent("Remote KCPP settings")
    createTextInputSection(contents, "remoteDataStorageUrl", "KCPP URL to use", "Leave blank to use the default", remoteDataSettings?.remoteDataStorageUrl)
    createTextInputSection(contents, "autosaveName", "Name to autosave to", "Leave blank to use the default (Autosave)", remoteDataSettings?.autosaveName)
    createNumberInputSection(contents, "autosaveMaxNumber", "Max number of autosaves (zero means autosaving is disabled)", remoteDataSettings?.autosaveMaxNumber, (v) => /^\d{1,2}$/.test(v))
    createCheckboxInputSection(contents, "autosaveRemoteSync", "Sync autosaves with server", remoteDataSettings?.autosaveRemoteSync)
    createSection(contents, "Note", "Autosaves on the server are not encrypted and will be overwritten. Be sure when you enable the remote sync setting.")

    popupUtils.reset().title("Control Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", showCharacterList).button("Save", async () => {
        let data = {
            remoteDataStorageUrl: document.querySelector("#remoteDataStorageUrl").value,
            autosaveName: document.querySelector("#autosaveName").value,
            autosaveMaxNumber: document.querySelector("#autosaveMaxNumber").value,
            autosaveRemoteSync: document.querySelector("#autosaveRemoteSync").checked
        }
        popupUtils.reset()
        await indexeddb_save("remoteDataSettings", JSON.stringify(data))
        if (data.autosaveRemoteSync) {
            lastEndpointValidatedForRemoteSaving = null;
            await validateRemoteDataEndpoint();
            let autosaveNames = allCharacterNames.filter(data => data?.type === "Autosave").map(data => data.name)
            for (let i = 0; i < autosaveNames.length; i++) {
                await syncAutosave(autosaveNames[i])
            }
        }
    }).show()
}

let getScenariosAndLegacyServerSaves = async () => {
    preview_temp_scenario = () => {

        popupUtils.reset()
        try {
            let { memory, prompt, tempmemory, worldinfo, chatname, chatopponent, AI_portrait } = temp_scenario;
            contents = createDetailsContent(temp_scenario.title);
            let image = AI_portrait || temp_scenario?.image
            if (!!image) {
                let imageContainer = document.createElement("span"), imageElem = document.createElement("img");
                imageElem.src = image;
                imageElem.style = "height: 30%; width: 30%; border-radius: 10px;"
                imageContainer.style = "width: 100%; display: flex; justify-content: space-around; padding: 10px;";
                imageContainer.appendChild(imageElem);
                contents.appendChild(imageContainer);
            }
            if (!!chatname) {
                createSection(contents, "User", chatname);
            }
            if (!!chatopponent) {
                createSection(contents, "Characters", chatopponent.split("||$||"));
            }
            createSection(contents, "Characters", memory);
            createSection(contents, "Memory", memory);
            createSection(contents, "Temporary memory", tempmemory);
            createSection(contents, "First message", prompt);
            createSection(contents, "World info", worldinfo?.map(entry => {
                return wiEntryToString(entry);
            }));

            popupUtils.reset().title("Scenario Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", showCharacterList).button("Load scenario", async () => {
                popupUtils.reset()
                confirm_scenario_verify(() => {
                    hide_popups();
                    complete_load_scenario();
                    temp_scenario = null;
                })
            }).show()
        }
        catch (e) {
            handleError(e)
        }
    }

    if (is_using_kcpp_with_server_saving()) {
        // Clean up scenario DB and the scenario dropdown options
        scenario_db = scenario_db.filter(scenario => !(scenario?.serverSave === true))
        Array.from(scenarioDropdown.children).filter(elem => !/^\d+$/.test(elem.value)).forEach(elem => elem.remove())
        serverSideTypes = []

        await new Promise((resolve) => promptForAdminPassword(resolve));

        let saves = await getServerSaves()
        for (save in saves) {
            if (!!saves[save].name && saves[save]?.typeName !== "Manager") {
                let name = saves[save].name, isPublic = saves[save].isPublic, isEncrypted = saves[save].isEncrypted
                let displayText = `${name} ${!!isPublic ? "(Public)" : "(Private)"} ${!!isEncrypted ? "🔒" : ""}`
                let typeName = saves[save].typeName
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
    }

    let scenarios = [];
    for (let i = 0; i < scenario_sources.length; ++i) {
        scenarios.push({
            name: scenario_sources[i].name,
            handler: () => {
                popupUtils.reset()
                import_scenario(scenario_sources[i])
            }
        })
    }

    for (let i = 0; i < scenario_db.length; ++i) {
        let curr = scenario_db[i];
        scenarios.push({
            name: curr.title,
            handler: async () => {
                temp_scenario = curr
                preview_temp_scenario()
            },
            thumbnail: curr?.image
        })
    }

    return scenarios
}

window.loadByCharacterNameIntoWI = async (name) => {
    let charData = await getCharacterData(name)
    let wiToAdd = importCharacterCardAsWIInternal(charData.data);
    wiToAdd.forEach(wi => wi.folder = name)
    current_wi = current_wi.filter(wi => wi?.folder !== name)
    current_wi.push(...wiToAdd)
    let chatMode = localsettings.opmode == 3 || (localsettings.opmode == 4 && localsettings.inject_chatnames_instruct)
    let isNameAlreadyInScene = (nameToCheck) => (localsettings?.chatname == nameToCheck || localsettings.chatopponent.split("||$||").includes(nameToCheck))
    if (chatMode && !isNameAlreadyInScene(name)) {
        localsettings.chatopponent += `||$||${name}`
    }
}

let maxLengthForSection = 500, halfMaxLengthForSection = Math.floor(maxLengthForSection / 2);
let showCharacterList = async () => {
    // Still processing characters
    if (!!window?.debounce_pending_updateCharacterListFromAll || !!window?.pending_encrypt)
    {
        handleError("Please wait - data is still being loaded")
        return
    }

    let containers = []

    let createIcon = (name, image) => {
        let charIcon = document.createElement("span");
        let charText = document.createElement("b");
        charIcon.classList.add("containAndScaleImage", "tile")
        charIcon.style.backgroundImage = !!image ? image : "var(--img_esobold)"
        charIcon.title = name
        charText.innerText = name
        charIcon.appendChild(charText)
        return charIcon
    }
    let getContainerForType = (containerName) => {
        let containerNameAsClass = containerName.replaceAll(/\s/g, "_")
        let existingContainer = containers.find(container => container.classList.contains(containerNameAsClass));
        if (!!existingContainer) {
            return existingContainer;
        }

        let container = document.createElement("div");
        container.classList.add("autoGrid")
        container.style.overflowX = "hidden"
        container.style.marginBottom = "10px"
        container.classList.add(containerNameAsClass)
        containers.push(container)

        let charIcon = createIcon(containerName, "var(--img_load)")
        charIcon.classList.add("searchExclude")
        container.appendChild(charIcon);
        return container
    }

    let uploadFileHandler = function (result) {
        let { file, fileName, ext, content, plaintext, dataArr } = result;
        waitingToast.setText(`Loading data ${fileName}`)
        waitingToast.show()
        if (ext === ".png") {
            let arr = new Uint8Array(dataArr)
            let res = convertTavernPng(arr)
            if (res === null) {
                waitingToast.hide()
                handleError(`${fileName}: PNG is not valid`)
            }
        }
        else if (ext === ".webp") {
            let arr = new Uint8Array(dataArr)
            let res = getTavernExifJSON(arr)
            if (res === null) {
                waitingToast.hide()
                handleError(`${fileName}: WEBP is not valid`)
            }
        }
        else if (ext === ".txt") {
            let arr = new Uint8Array(dataArr)
            let res = getTavernExifJSON(arr)
            saveDocumentToIndexDB(fileName, arr, "text/plain")
        }
        else if (ext === ".pdf") {
            let arr = new Uint8Array(dataArr)
            saveDocumentToIndexDB(fileName, arr, "application/pdf")
        }
        else {
            let data = JSON.parse(plaintext);
            if (is_kai_json(data) && !data?.scenarioVersion) {
                // Handle as a regular KLite save
                saveKLiteSaveToIndexDB(fileName, data)
            }
            else {
                let wiToAdd = data, has_tav_wi_check = has_tavern_wi_check(wiToAdd), wiName = fileName;
                if (!data.scenarioVersion && (data.name != null || data.description != null ||
                    data.personality != null || (data.spec == "chara_card_v2" || data.spec == "chara_card_v3") || has_tav_wi_check)) {
                    saveCharacterDataToIndexDB(undefined, data, fileName)
                }
                else
                {
                    if (has_tav_wi_check) {
                        if (wiToAdd?.name !== undefined && wiToAdd.name.trim().length > 0) {
                            wiName = wiToAdd.name
                        }
                        wiToAdd = load_tavern_wi(wiToAdd);
                        if (wiToAdd && wiToAdd.length > 0) {
                            wiToAdd.forEach(wi => wi.wigroup = fileName.replace("'", ""))
                        }
                    }
                    else {
                        try {
                            let hasNoGeneralWI = wiToAdd.length === 0 || wiToAdd.find(wi => wi?.wigroup === undefined || wi.wigroup.trim() === null || wi.wigroup === "" || wi.wigroup === "General") === undefined;
                            if (hasNoGeneralWI) {
                                let wiAllHaveSameGroup = wiToAdd.find((e, p, a) => a.find(c => c?.wigroup !== e.wigroup)) === undefined
                                if (wiAllHaveSameGroup) {
                                    wiName = wiToAdd[0].wigroup
                                }
                            }
                        }
                        catch (e) {
                            console.error(e)
                        }
                    }
                    if (Array.isArray(wiToAdd)) {
                        wiToAdd = wiToAdd.filter(wi => wi?.key !== undefined)
                        if (wiToAdd.length > 0) {
                            saveLorebookToIndexDB(wiName, wiToAdd, JSON.parse(plaintext))
                        }
                    }
                    else {
                        waitingToast.hide()
                        handleError(`${fileName}: JSON does not contain WI or lorebook`)
                    }
                }
            }
        }
    }

    let scenarios = await getScenariosAndLegacyServerSaves()

    let dragIcon = createIcon("Click or drag characters, saves, lorebooks, world info or PDFs here to add")
    dragIcon.classList.add("searchExclude")
    dragIcon.addEventListener("click", () => {
        popupUtils.reset()
        promptUserForLocalFile(async (result) => {
            uploadFileHandler(result)
        }, [".png", ".webp", ".json", ".txt", ".pdf"], true)
    })
    getContainerForType("Drop zone").appendChild(dragIcon);
    getContainerForType("Drop zone").addEventListener(
        "dragover",
        (e) => {
            e.preventDefault();
            e.stopPropagation();
        },
        false
    );
    getContainerForType("Drop zone").addEventListener(
        "drop",
        (e) => {
            let draggedData = e.dataTransfer;
            let files = draggedData.files;
            console.log(files);
            if (files && files.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                let allowedTypes = ["image/png", "image/webp", "application/json", "text/plain", "application/pdf"]
                let validFiles = [...files].filter(file => {
                    return file != null && file.name && file.name != "" && (file.type)
                })
                if (validFiles.length > 0) {
                    popupUtils.reset()
                    fileInputToFiles(validFiles, uploadFileHandler)
                }
                else {
                    handleError("No valid files selected")
                }
            };
        },
        false
    );

    let searchData = (searchTerm) => {
        let allTiles = [...document.querySelectorAll("#popupContainer .tile")], hidableSections = [...document.querySelectorAll("div.autoGrid:not(.Drop_zone)")];
        try {
            let results = [...document.querySelectorAll(`#popupContainer .tile`)].filter(elem => !elem.title || elem.title.toLowerCase().indexOf(searchTerm) !== -1);
            if (results.length > 0) {
                hidableSections.forEach(elem => elem.style.display = "grid")

                allTiles.forEach(elem => {
                    if (!elem.classList.contains("searchExclude")) {
                        elem.style.display = "none"
                    }
                })
                results.forEach(elem => elem.style.display = "unset")
                hidableSections.filter(elem => [...elem.querySelectorAll(".tile")].filter(child => child.checkVisibility()).length == 1).forEach(elem => elem.style.display = "none")
            }
            else {
                hidableSections.forEach(elem => elem.style.display = "grid")
                allTiles.forEach(elem => elem.style.display = "unset")
            }
        }
        catch {
            hidableSections.forEach(elem => elem.style.display = "grid")
            allTiles.forEach(elem => elem.style.display = "unset")
        }
    }

    let createSearchInput = () => {
        let containerDiv = document.createElement("div"), label = document.createElement("div"), inputContainer = document.createElement("div"), input = document.createElement("input");
        containerDiv.classList.add("settinglabel")
        label.title = "Search data by name"
        label.textContent = "Search"
        label.classList.add("justifyleft", "settingsmall")
        inputContainer.classList.add("justifyleft", "settingsmall")
        input.classList.add("settinglabel", "fullScreenTextEditExclude")
        input.title = "Search"
        input.placeholder = "Search"
        input.type = "text"
        input.style.width = "100%"
        input.addEventListener("change", () => {
            searchData(input.value.toLowerCase())
        })
        input.addEventListener("input", () => {
            searchData(input.value.toLowerCase())
        })
        inputContainer.appendChild(input)
        containerDiv.append(label, inputContainer)
        getContainerForType("Drop zone").appendChild(containerDiv);
    }

    let autosaveFromClick = async (name) => {
        let contents;
        try {
            let data = await syncAutosave(name);
            contents = createDetailsContent(name);
            data.forEach(autosave => {
                createButtonInputSection(contents, undefined, "Autosave", autosave.saveCreationDate, () => {
                    popupUtils.reset()
                    kai_json_load(autosave)
                })
            })
        }
        catch (e) {
            console.error(e)
        }
        createButtonInputSection

        popupUtils.reset().title("Save Options").content(contents).css("min-height", "50%").css("min-width", "50%")
            .button("Delete autosave", async () => {
                popupUtils.reset()
                msgboxYesNo("Are you sure you wish to delete?", "Autosave manager", async () => {
                    allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                    removeAutosave(name)
                })
            }).button("Close", () => popupUtils.reset()).show();
    }

    if (allCharacterNames.length === 0) {
        let charIcon = createIcon("No data added yet (please add some!)")
        charIcon.classList.add("searchExclude")
        getContainerForType("Data").appendChild(charIcon);
    }
    else {
        let lorebookEntryToString = (entry) => {
            return `Primary: ${[...entry?.keys].join(", ")}\nSecondary: ${[...entry?.secondary_keys].join(",")}`;
        }
        let wiEntryToString = (entry) => {
            return `Primary: ${entry?.key}\nSecondary: ${entry?.keysecondary}`;
        }
        let downloadB64URL = (name, data) => {
            let a = document.createElement("a");
            a.href = data
            a.download = `${name}`
            a.click();
            a.remove();
        }
        let jsObjToBytes = (data) => {
            let bytes = new TextEncoder().encode(JSON.stringify(data)), text = "";
            for (var i = 0; i < Math.ceil(bytes.length / 32768.0); i++) {
                text += String.fromCharCode.apply(null, bytes.slice(i * 32768, Math.min((i + 1) * 32768, bytes.length)))
            }
            return text
        }
        createSearchInput()
        for (let i = 0; i < allCharacterNames.length; i++) {
            let { name, thumbnail } = allCharacterNames[i], type = getTypeFromAllCharacterData(allCharacterNames[i]);
            let charIcon = createIcon(name, !!thumbnail ? `url(${thumbnail})` : undefined)
            charIcon.onclick = async () => {
                if (type === "Character") {
                    let contents = document.createElement("span");
                    try {
                        let data = await getCharacterData(name), { image } = data;
                        let { description, first_mes, mes_example, alternate_greetings, character_book, tags, creator, creator_notes, personality } = (data)?.data;
                        contents = createDetailsContent(name);
                        if (!!image) {
                            let imageContainer = document.createElement("span"), imageElem = document.createElement("img");
                            imageElem.src = image;
                            imageElem.style = "height: 30%; width: 30%; border-radius: 10px;"
                            imageContainer.style = "width: 100%; display: flex; justify-content: space-around; padding: 10px;";
                            imageContainer.appendChild(imageElem);
                            contents.appendChild(imageContainer);
                        }
                        createSection(contents, "Creator", creator);
                        createSection(contents, "Tags", tags);
                        createSection(contents, "Creators notes", creator_notes);
                        createSection(contents, "Memory", description);
                        createSection(contents, "Temporary memory", formatExampleMessages(mes_example));
                        createSection(contents, "Alternative greetings", [first_mes, ...(alternate_greetings || [])]);
                        createSection(contents, "Personality", personality);
                        createSection(contents, "World info", character_book?.entries?.map(entry => {
                            return lorebookEntryToString(entry);
                        }));
                    }
                    catch (e) {
                        console.error(e)
                    }

                    popupUtils.reset().title("Character Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", showCharacterList).button("Load character", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name)
                        load_tavern_obj(charData.data);
                    }).button("Add character to WI", async () => {
                        popupUtils.reset()
                        await window.loadByCharacterNameIntoWI(name)
                    }).button("Download character", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name);
                        if (!!charData?.image) {
                            downloadB64URL(`${name}.png`, charData.image)
                        }
                        else
                        {
                            try {
                                downloadB64URL(`${name}.json`, `data:application/json;base64,${btoa(jsObjToBytes(charData.data))}`)
                            }
                            catch (e) {
                                handleError(e)
                            }
                        }
                    }).button("Delete character", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete?", "Character manager", async () => {
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                        })
                    }).button("Close", () => popupUtils.reset()).show();
                }
                else if (type === "World Info") {
                    let contents = document.createElement("span");
                    try {
                        let data = await getCharacterData(name);
                        contents = createDetailsContent(name);
                        createSection(contents, "World info", data?.data?.map(entry => {
                            return wiEntryToString(entry);
                        }));
                    }
                    catch (e) {
                        console.error(e)
                    }

                    popupUtils.reset().title("World Info Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", showCharacterList).button("Add to WI", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name)
                        let wiToAdd = charData.data;
                        current_wi = current_wi.filter(wi => wi?.folder !== name)
                        current_wi.push(...wiToAdd)
                    }).button("Download world info", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name), { originalData } = charData;
                        if (!!originalData) {
                            try {
                                downloadB64URL(`${name}.json`, `data:application/json;base64,${btoa(jsObjToBytes(originalData))}`)
                            }
                            catch (e) {
                                handleError(e)
                            }
                        }
                        else {
                            handleError("Could not download file")
                        }
                    }).button("Delete world info", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete?", "Character manager", async () => {
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                        })
                    }).button("Close", () => popupUtils.reset()).show();
                }
                else if (type === "Save") {
                    let contents = document.createElement("span");
                    try {
                        let data = await getCharacterData(name), { AI_portrait } = data;
                        let { memory, prompt, tempmemory, worldinfo } = (data)?.data, { chatname, chatopponent } = (data)?.data?.savedsettings;
                        contents = createDetailsContent(name);
                        if (!!AI_portrait) {
                            let imageContainer = document.createElement("span"), imageElem = document.createElement("img");
                            imageElem.src = AI_portrait;
                            imageElem.style = "height: 30%; width: 30%; border-radius: 10px;"
                            imageContainer.style = "width: 100%; display: flex; justify-content: space-around; padding: 10px;";
                            imageContainer.appendChild(imageElem);
                            contents.appendChild(imageContainer);
                        }
                        if (!!chatname) {
                            createSection(contents, "User", chatname);
                        }
                        if (!!chatopponent) {
                            createSection(contents, "Characters", chatopponent.split("||$||"));
                        }
                        createSection(contents, "Characters", memory);
                        createSection(contents, "Memory", memory);
                        createSection(contents, "Temporary memory", tempmemory);
                        createSection(contents, "First message", prompt);
                        createSection(contents, "World info", worldinfo?.map(entry => {
                            return wiEntryToString(entry);
                        }));
                    }
                    catch (e) {
                        console.error(e)
                    }

                    popupUtils.reset().title("Save Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", showCharacterList).button("Load save", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name)
                        kai_json_load(charData.data, false);
                    }).button("Overwrite save", async () => {
                        popupUtils.reset()
                        waitingToast.setText(`Overwriting data ${name}`)
                        waitingToast.show()
                        let data = generate_savefile(true, true, true);
                        saveKLiteSaveToIndexDB(name, data);
                    }).button("Download save", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name), { data } = charData;
                        if (!!data) {
                            try {
                                let bytes = new TextEncoder().encode(JSON.stringify(data)), text = "";
                                for (var i = 0; i < Math.ceil(bytes.length / 32768.0); i++) {
                                    text += String.fromCharCode.apply(null, bytes.slice(i * 32768, Math.min((i + 1) * 32768, bytes.length)))
                                }
                                downloadB64URL(`${name}.json`, `data:application/json;base64,${btoa(text)}`)
                            }
                            catch (e) {
                                handleError(e)
                            }
                        }
                        else {
                            handleError("Could not download file")
                        }
                    }).button("Delete save", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete?", "Character manager", async () => {
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                        })
                    }).button("Close", () => popupUtils.reset()).show();
                }
                else if (type === "Document") {
                    let contents = document.createElement("span");
                    contents = createDetailsContent(name);
                    let charData = await getCharacterData(name), { extractedText } = charData;
                    createSection(contents, "Has text been extracted?", !!extractedText ? "True" : "False");

                    popupUtils.reset().title("Document Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", showCharacterList).button("Add to TextDB", async () => {
                        popupUtils.reset()
                        waitingToast.setText(`Extracting text to add to TextDB`)
                        waitingToast.show()
                        let charData = await getCharacterData(name), { extractedText } = charData;
                        if (extractedText !== undefined) {
                            replaceDocumentFromTextDB(name, extractedText)
                        }
                        else {
                            let extractedText = await documentParser.extractTextFromB64(charData.data)
                            if (!!extractedText) {
                                charData.extractedText = extractedText
                                await indexeddb_save(`character_${name}`, JSON.stringify(charData))
                                updateCharacterListFromAll()
                                replaceDocumentFromTextDB(name, extractedText)
                            }
                        }
                        waitingToast.hide()
                    }).button("Download document", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name), { data, dataType } = charData;
                        if (!!data) {
                            try {
                                let ext = ".txt"
                                switch (dataType) {
                                    case "application/pdf":
                                        ext = ".pdf"
                                        break
                                }
                                downloadB64URL(`${name}${ext}`, data)
                            }
                            catch (e) {
                                handleError(e)
                            }
                        }
                        else {
                            handleError("Could not download file")
                        }
                    }).button("Delete document", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete?", "Character manager", async () => {
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                        })
                    }).button("Close", () => popupUtils.reset()).show();
                }
                else if ("Autosave") {
                    autosaveFromClick(name)
                }
                else {
                    popupUtils.reset()
                }
            }
            getContainerForType(type).appendChild(charIcon)
        }
    }

    if (is_using_kcpp_with_server_saving()) {
        try {
            let autoSaves = await getServerSaves({ typeName: "Autosave" })
            let localAutosaveNames = allCharacterNames.filter(data => data?.type === "Autosave").map(data => data.name)
            Object.keys(autoSaves).filter(saveName => !localAutosaveNames.includes(saveName)).forEach(name => {
                let charIcon = createIcon(name, undefined)
                charIcon.onclick = () => autosaveFromClick(name)
                getContainerForType("Autosave").appendChild(charIcon)
            })
        }
        catch (e) {
            console.error("Could not get server autosaves", e)
        }
    }

    // Add icons for scenarios and legacy server data
    for (let i = scenario_sources.length; i < scenarios.length; i++) {
        let scenario = scenarios[i]
        if (scenario_db[i - scenario_sources.length]?.serverSaveTypeName === "Autosave") {
            continue
        }
        let image = undefined
        if (scenario?.thumbnail !== undefined) {
            image = `url('${scenario.thumbnail}')`
        }
        let icon = createIcon(scenario.name, image)
        icon.addEventListener("click", scenario.handler)
        getContainerForType("Scenarios").appendChild(icon);
    }

    popupUtils.reset().title(`Data List (${allCharacterNames.length})`).css("height", "80%").css("width", "80%").setMobileMenu(true)
    containers.forEach(container => popupUtils.content(container))

    popupUtils.buttonGroup("Add")
        .button("New character", () => { try { showCharacterCreator(); } catch (e) { console.error(e); } })
        .button("Save", () => {
            popupUtils.reset()
            inputBox("Enter a Filename", "Save File", "", "Input Filename", () => {
                let userinput = getInputBoxValue();
                if (userinput != null && userinput.trim() != "") {
                    waitingToast.setText(`Saving data ${userinput}`)
                    waitingToast.show()
                    let data = generate_savefile(true, true, true);
                    saveKLiteSaveToIndexDB(userinput, data);
                }
            }, false);
        })
        .button("Download", () => {
            popupUtils.reset()
            save_file_button()
        })
        .button("Share", () => {
            popupUtils.reset()
            share_story_button()
        })
        .button("Mods", () => {
            popupUtils.reset()
            modManager.showModListWarning()
        })


    popupUtils.buttonGroup("Bulk").button("Migrate old data", async () => {
        popupUtils.reset()
        waitingToast.setText(`Migrating old data`)
        waitingToast.show()
        await migrateOldData()
        waitingToast.setText(`Migration complete`)
        setTimeout(() => {
            waitingToast.hide()
        }, 5000)
    }).button("Delete all", async () => {
        popupUtils.reset()
        msgboxYesNo("Are you sure you wish to delete all data?", "Character manager", async () => {
            waitingToast.setText(`Deleting all data`)
            waitingToast.show()
            await Promise.all(allCharacterNames.map(elem => indexeddb_save(`character_${elem.name}`)))
            allCharacterNames = []
            await updateCharacterListFromAll()
            waitingToast.hide()
        })
    })

    popupUtils.buttonGroup("Esobold Server")
        .button("Control", () => controlRemoteDataStore())
    if (is_using_kcpp_with_server_saving()) {
        popupUtils
            .button("Overwrite", () => putAllCharacterManagerData())
            .button("Load", () => loadAllCharacterManagerData())
    }
    popupUtils.resetButtonGroup().button("Close", () => popupUtils.reset()).show();
}

// Native character creator popup for esobold
function showCharacterCreator() {
    const form = document.createElement('div');
    form.classList.add("characterCreatorGrid")

    const makeLabel = (text) => {
        const l = document.createElement('label');
        l.innerText = text;
        return l;
    };
    const makeInput = (type = 'text') => {
        const i = document.createElement('input');
        i.type = type;
        i.classList.add('textbox');
        return i;
    };
    const makeArea = () => {
        const a = document.createElement('textarea');
        a.classList.add('textbox');
        a.rows = 4;
        return a;
    };
    const addOption = (select, value, text) => {
        const o = document.createElement('option');
        o.value = value;
        o.text = text;
        select.appendChild(o);
    };

    const nameInp = makeInput();
    const creatorInp = makeInput();
    const versionInp = makeInput();
    versionInp.placeholder = '1.0';
    const tagsInp = makeInput();
    tagsInp.placeholder = 'comma,separated,tags';
    const personalityArea = makeArea();
    const descriptionArea = makeArea();
    const mesExampleArea = makeArea();
    const firstMesArea = makeArea();
    firstMesArea.rows = 3;
    const altGreetingsArea = makeArea();
    altGreetingsArea.placeholder = 'One greeting per line';
    const creatorNotesArea = makeArea();
    const systemPromptArea = makeArea();
    const postHistoryArea = makeArea();

    // World Info group selector
    const wiGroupSelect = document.createElement('select');
    wiGroupSelect.classList.add('textbox');
    const wiCustomGroup = makeInput();
    wiCustomGroup.placeholder = 'Or enter custom WI group (optional)';
    addOption(wiGroupSelect, '', '— No WI group —');
    try {
        const potentialWIGroups = (current_wi || []).map(w => {
            return (w?.wigroup || '').trim()
        }).filter(x => x.length > 0);
        const distinctWIGroups = [...new Set(potentialWIGroups)].sort();
        distinctWIGroups.forEach(g => addOption(wiGroupSelect, g, g));
    }
    catch (e) {
        handleError(e)
    }

    // Image upload and preview
    let imageFile = null, imagePreview = document.createElement('img');
    imagePreview.style.maxHeight = '120px';
    imagePreview.style.borderRadius = '8px';
    imagePreview.style.display = 'none';
    const imageInp = makeInput('file');
    imageInp.accept = 'image/png';
    imageInp.onchange = () => {
        const f = imageInp.files?.[0];
        if (!f) {
            return;
        }
        imageFile = f;
        try {
            const url = URL.createObjectURL(f);
            imagePreview.src = url;
            imagePreview.style.display = '';
            // best-effort revoke after load
            imagePreview.onload = () => {
                try {
                    URL.revokeObjectURL(url);
                }
                catch (e) {
                    handleError(e)
                }
            };
        }
        catch (e) {
            handleError(e)
        }
    };

    // Layout: two columns
    const col = () => {
        const d = document.createElement('div');
        d.style.display = 'flex';
        d.style.flexDirection = 'column';
        d.style.gap = '8px';
        return d;
    };
    const leftCol = col();
    const rightCol = col();
    const add = (container, label, control, extra = null) => {
        container.append(label, control);
        if (extra) {
            container.append(extra);
        }
    };

    // Left (primary)
    add(leftCol, makeLabel('Name'), nameInp);
    add(leftCol, makeLabel('Creator'), creatorInp);
    add(leftCol, makeLabel('Version'), versionInp);
    add(leftCol, makeLabel('Tags'), tagsInp);
    add(leftCol, makeLabel('Personality'), personalityArea);
    add(leftCol, makeLabel('Memory / Description'), descriptionArea);
    add(leftCol, makeLabel('First message'), firstMesArea);

    // Right (secondary)
    add(rightCol, makeLabel('Example dialogue'), mesExampleArea);
    add(rightCol, makeLabel('Alternate greetings (one per line)'), altGreetingsArea);
    add(rightCol, makeLabel('Creator notes'), creatorNotesArea);
    add(rightCol, makeLabel('System prompt'), systemPromptArea);
    add(rightCol, makeLabel('Post history instructions'), postHistoryArea);
    add(rightCol, makeLabel('World Info group'), wiGroupSelect, wiCustomGroup);
    add(rightCol, makeLabel('Avatar image'), imageInp, imagePreview);

    form.append(leftCol, rightCol);

    const doSave = async () => {
        const name = (nameInp.value || '').trim();
        if (!name) {
            alert('Character must have a name.');
            return;
        }
        if (!imageFile) {
            alert('Please choose an avatar image.');
            return;
        }

        // Confirm overwrite if needed
        const exists = (allCharacterNames || []).some(c => c?.name === name);
        if (exists && !confirm(`Character "${name}" exists. Overwrite?`)) {
            return;
        }

        // Build Tavern v2-compatible inner data object (esobold stores inner fields)
        const tags = (tagsInp.value || '')
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        const altGreetings = (altGreetingsArea.value || '')
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        const selectedGroup = (wiCustomGroup.value || '').trim() || wiGroupSelect.value;
        let character_book = null;
        if (selectedGroup) {
            try {
                const entries = (current_wi || []).filter(e => (e?.wigroup || '') === selectedGroup);
                let id = 0, convertedEntries = entries.map(entry => {
                    let convertedEntry = Object.assign(entry, {
                        keys: entry?.key?.split(",").filter(k => k !== "") || [],
                        secondary_keys: entry?.keysecondary?.split(",").filter(k => k !== "") || [],
                        uid: id++
                    });
                    delete convertedEntry?.key;
                    delete convertedEntry?.keysecondary;
                    delete convertedEntry?.wigroup;
                    return convertedEntry;
                })
                character_book = { name: selectedGroup, entries: convertedEntries };
            }
            catch (e) {
                handleError(e)
            }
        }

        const charInner = {
            name,
            description: descriptionArea.value || '',
            personality: personalityArea.value || '',
            mes_example: mesExampleArea.value || '',
            first_mes: firstMesArea.value || '',
            creator: creatorInp.value || '',
            creator_notes: creatorNotesArea.value || '',
            system_prompt: systemPromptArea.value || '',
            post_history_instructions: postHistoryArea.value || '',
            alternate_greetings: altGreetings,
            character_book,
            tags,
            character_version: (versionInp.value || '1.0')
        };

        try {
            waitingToast.setText(`Saving character ${name}`);
            waitingToast.show();

            // Thumbnail and full image
            const thumbUrl = await generateThumbnail(imageFile, [256, 256]);

            const pngBytes = await new Promise((resolve, reject) => {
                const fr = new FileReader(), fileByteArray = [];
                fr.onerror = reject;
                fr.onloadend = (e) => {
                    if (e.target.readyState == FileReader.DONE) {
                        resolve(new Uint8Array(e.target.result))
                    }
                    reject()
                }
                fr.readAsArrayBuffer(imageFile);
            });

            const pngOut = tavernTool.embedIntoPng(pngBytes, charInner);
            var text = '';
            // Stack size limits apply, so does it in bulk but within reason
            for (var i = 0; i < Math.ceil(pngOut.length / 32768.0); i++) {
                text += String.fromCharCode.apply(null, pngOut.slice(i * 32768, Math.min((i + 1) * 32768, pngOut.length)))
            }
            let dataUrl = `data:image/png;base64,${btoa(text)}`

            const toSave = { name, data: charInner, image: String(dataUrl) };
            await indexeddb_save(`character_${name}`, JSON.stringify(toSave));

            // Update list
            allCharacterNames = (allCharacterNames || []).filter(c => c?.name !== name);
            allCharacterNames.push({ name, thumbnail: thumbUrl, type: 'Character' });
            await updateCharacterListFromAll();

            waitingToast.hide();
            popupUtils.reset();
            showCharacterList();
        }
        catch (e) {
            handleError(e);
            waitingToast.hide();
        }
    };

    popupUtils.reset()
        .title('New Character')
        .content(form)
        .button('Back', showCharacterList)
        .button('Save', doSave)
        .button('Close', () => popupUtils.reset())
        .show();
}

// Backwards-compat for existing button in scenarios
function character_creator() {
    try {
        hide_popups();
        showCharacterCreator();
    }
    catch (e) {
        handleError(e);
    }
}

window.extractExampleMessages = (messagesText) => {
    return messagesText.split("<START>").filter(c => !!c).map(c => c.trim())
}

window.formatExampleMessages = (messageText) => {
    return extractExampleMessages(messageText).map(c => `Example messages:\n\n${c}`).join("\n\n")
}