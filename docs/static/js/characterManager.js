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

let removeFileFromServer = async (remoteEndpoint, fileName) => {
    await fetch(`${remoteEndpoint}/api/data/delete`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ filename: fileName.trim() })
    })
        .then(resp => resp.json())
        .catch(e => {
            handleError(e)
        })
}

let doesObjectHaveKeys = (data) => {
    return typeof data === "object" && Object.keys(data).length > 0
}

let putAllCharacterManagerData = () => {
    popupUtils.reset()

    msgboxYesNo("Are you sure you wish to add / update server data?", "Character manager", () => {
        promptForAdminPassword(() => {
            // Force a prompt for a new password
            window.lastUsedSavePassword = undefined
            promptForSavePassword(async (passwordData) => {
                let { password, isEncrypted } = passwordData
                await updateMetadata()

                let allTasks = await Promise.all([...allCharacterNames.map(async c => {
                    let { name, type, thumbnail } = c, data = await getCharacterData(name, true);
                    if (doesObjectHaveKeys(data))
                    {
                        waitingToast.setText(`Sending data ${name}`)
                        waitingToast.show()
                        data.type = type
                        data.thumbnail = thumbnail
                        data.favorite = !!c?.favorite
                        data = JSON.stringify(data)
                        if (isEncrypted) {
                            data = encrypt(password, data)
                        }

                        // Clear old data
                        let remoteEndpoint = await getRemoteDataEndpoint();
                        await removeFileFromServer(remoteEndpoint, name)

                        // Save to server
                        let bodyData = {
                            filename: name.trim(),
                            data: data,
                            isEncrypted: isEncrypted ? "1" : "0",
                            group: null,
                            type: "Manager",
                            thumbnail: null
                        }
                        await fetch(`${remoteEndpoint}/api/data/put`, {
                            method: "POST",
                            body: JSON.stringify(bodyData),
                            headers: getAuthHeaders()
                        })
                            .then(resp => resp.json())
                            .catch(e => {
                                handleError(e)
                            })
                    }                    

                    return true

                    // decrypt("test", (await Promise.all(putAllCharacterManagerData()))[0].data)
                    // JSON.parse(decrypt("test", (await Promise.all(putAllCharacterManagerData()))[0].data))
                }), (async () => {
                    // Push metadata
                    let name = "allCharacterMetadata", data = allCharacterNames;
                    waitingToast.setText(`Sending data ${name}`)
                    waitingToast.show()
                    data = JSON.stringify(data)
                    if (isEncrypted) {
                        data = encrypt(password, data)
                    }

                    let bodyData = {
                        filename: name,
                        data: data,
                        isEncrypted: isEncrypted ? "1" : "0",
                        group: null,
                        type: "Manager",
                        thumbnail: null
                    }
                    // Clear old data
                    let remoteEndpoint = await getRemoteDataEndpoint();
                    await removeFileFromServer(remoteEndpoint, name)

                    // Save to server
                    await fetch(`${remoteEndpoint}/api/data/put`, {
                        method: "POST",
                        body: JSON.stringify(bodyData),
                        headers: getAuthHeaders()
                    })
                        .then(resp => resp.json())
                        .catch(e => {
                            handleError(e)
                        })
                })()])
                waitingToast.hide()
            });
        })
    })
}

let promptForSavePassword = (callback) => {
    if (window?.lastUsedSavePassword === undefined)
    {
        inputBox("Save password", "Please input save password (or leave blank for no password):", (window.lastUsedSavePassword || ""), "(Input Save Password)", async () => {
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
            window.lastUsedSavePassword = password
            callback({ password, isEncrypted })
        }, false, false, true);
        document.getElementById("inputboxcontainerinput").focus()
    }
    else
    {
        callback({ password: window.lastUsedSavePassword, isEncrypted: window.lastUsedSavePassword !== "" })
    }
}

let loadAllCharacterManagerData = () => {
    popupUtils.reset();
    return new Promise(resolve => {
        validateRemoteDataEndpoint().then(() => {
            if (is_using_kcpp_with_server_saving()) {
                promptForAdminPassword(() => {
                    promptForSavePassword(async (passwordData) => {
                        let { password, isEncrypted } = passwordData
                        await updateMetadata()
                        let name = "allCharacterMetadata"
                        waitingToast.setText(`Receiving data ${name}`)
                        waitingToast.show()
                        let remoteEndpoint = await getRemoteDataEndpoint();
                        let saveData = await fetch(`${remoteEndpoint}/api/data/get`, {
                            method: "POST",
                            headers: getAuthHeaders(),
                            body: JSON.stringify({ filename: name })
                        })
                            .then(resp => resp.json())
                            .catch(e => {
                                console.error(e)
                            })

                        let managerStoredData = []
                        if (!!saveData) {
                            try
                            {
                                let managerData = isEncrypted ? decrypt(password, saveData) : saveData;
                                managerData = JSON.parse(managerData)
                                if (Array.isArray(managerData)) {
                                    managerStoredData = managerData
                                }
                            }
                            catch (e) {
                                console.error(e)
                            }
                        }
                        let managerSaves = await getServerSaves();
                        if (!!managerSaves) {
                            managerSaves = Object.entries(managerSaves).filter((entry) => {
                                let [key, save] = entry
                                return !!save.name && save?.typeName === "Manager"
                            }).map((entry) => {
                                let [key, save] = entry
                                return save.name
                            })
                            for (key of managerSaves)    
                            {
                                if (allCharacterNames.find(c => c.name === key) === undefined) {
                                    let cachedData = managerStoredData.find(data => data.name === key)
                                    if (cachedData !== undefined) {
                                        await indexeddb_save(`character_${key}`)
                                        allCharacterNames.push(cachedData);
                                    }
                                    else
                                    {
                                        await fetch(`${remoteEndpoint}/api/data/get`, {
                                            method: "POST",
                                            headers: getAuthHeaders(),
                                            body: JSON.stringify({ filename: key })
                                        })
                                            .then(resp => resp.json())
                                            .then(saveData => {
                                                let handler = () => {
                                                    let data = !!isEncrypted ? decrypt(window.lastUsedSavePassword, saveData) : saveData;
                                                    data = JSON.parse(data)
                                                    let { name, type, thumbnail, favorite } = data

                                                    if (name !== undefined)
                                                    {
                                                        allCharacterNames.push({ name, type, thumbnail, favorite: !!favorite });
                                                        return indexeddb_save(`character_${data.name}`, JSON.stringify(data))
                                                    }
                                                }
                                                if (isEncrypted && window?.lastUsedSavePassword == undefined) {
                                                    return (new Promise(resolve => promptForSavePassword(resolve))).then(handler)
                                                }
                                                else {
                                                    return handler()
                                                }
                                            }).catch(e => {
                                                console.error(e)
                                            })
                                    }
                                }
                            }
                        }
                        updateCharacterListFromAll()
                        waitingToast.hide()
                        resolve()
                    })
                })
            }
            else {
                updateCharacterListFromAll()
                waitingToast.hide()
                resolve()
            }
        }).catch(e => {
            console.error(e)
            waitingToast.hide()
            resolve()
        })
    })
}

let migrateOldData = async () => {
    let saveKLiteSaveToIndexDBIfNew = (name, data) => {
        let nameToCheck = name.replaceAll(/[^\w()_\-'",!\[\].]/g, " ").replaceAll(/\s+/g, " ").trim();
        if (allCharacterNames.find(meta => nameToCheck === meta.name) === undefined) {
            saveKLiteSaveToIndexDB(name, data)
        }
    }
    let saveKLiteScenarioToIndexDBIfNew = (name, data) => {
        let nameToCheck = name.replaceAll(/[^\w()_\-'",!\[\].]/g, " ").replaceAll(/\s+/g, " ").trim();
        if (allCharacterNames.find(meta => nameToCheck === meta.name) === undefined) {
            saveKLiteScenarioToIndexDB(name, data)
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

    // Handle scenario slots from IndexDB
    let scenariopromises = [];
    for (let i = 0; i < SCENARIO_SLOTS; ++i) {
        scenariopromises.push(Promise.all([indexeddb_load("scenario_" + i + "_meta", ""), indexeddb_load("scenario_" + i + "_data", "")]));
    }
    await Promise.all((await Promise.all(scenariopromises)).map(res => {
        let [sname, sdata] = res
        if (!sname || !sdata) return null
        let story = decompress_story(sdata)
        if (!story) return null
        return { name: sname, data: story }
    }).filter(res => !!res).map(res => saveKLiteScenarioToIndexDBIfNew(res.name, res.data)))

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
    createTextInputSection(contents, "remoteDataStorageUrl", "KCPP URL to use", "Leave blank to use the default - If changed, please reload the page.", remoteDataSettings?.remoteDataStorageUrl)
    createTextInputSection(contents, "autosaveName", "Name to autosave to", "Leave blank to use the default (Autosave)", remoteDataSettings?.autosaveName)
    createNumberInputSection(contents, "autosaveMaxNumber", "Max number of autosaves (zero means autosaving is disabled)", remoteDataSettings?.autosaveMaxNumber, (v) => /^\d{1,2}$/.test(v))
    createCheckboxInputSection(contents, "autosaveRemoteSync", "Sync autosaves with server", remoteDataSettings?.autosaveRemoteSync)
    createSection(contents, "Note", "Autosaves on the server are not encrypted and will be overwritten. Be sure when you enable the remote sync setting.")

    popupUtils.reset().title("Control Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", () => showCharacterList(undefined, false, true)).button("Save", async () => {
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

// Helper strings for lorebook / WI entries (used by tile click handlers)
let lorebookEntryToString = (entry) => {
    return `Primary: ${[...entry?.keys].join(", ")}\nSecondary: ${[...entry?.secondary_keys].join(",")}`;
}
let wiEntryToString = (entry) => {
    return `Primary: ${entry?.key}\nSecondary: ${entry?.keysecondary}`;
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

            popupUtils.reset().title("Scenario Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", () => showCharacterList(undefined, false, true)).button("Load scenario", async () => {
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

let cleanupAllCharacterList = async () => {
    await Promise.all(allCharacterNames.map(async char => { 
        return { 
            name: char.name, 
            valid: doesObjectHaveKeys(await getCharacterData(char.name, true)) 
        } 
    })).then(rows => rows.forEach(data => { 
        if (!data.valid) allCharacterNames = allCharacterNames.filter(c => c.name !== data.name) 
    }))
}

let managerUploadHandler = function (result) {
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
            let checkForIfCharData = (node) => !node.scenarioVersion && (!!node?.name && ((!!node?.description || !!node?.personality) || (node.spec == "chara_card_v2" || node.spec == "chara_card_v3")))
            if (!!data?.data) {
                let nestedData = data.data
                if (checkForIfCharData(nestedData)) {
                    data = nestedData
                }
            }
            if (checkForIfCharData(data)) {
                saveCharacterDataToIndexDB(undefined, data, fileName)
            }
            else {
                if (has_tav_wi_check) {
                    if (wiToAdd?.name !== undefined && wiToAdd.name.trim().length > 0) {
                        wiName = wiToAdd.name
                    }
                    wiToAdd = load_tavern_wi(wiToAdd);
                    if (wiToAdd && wiToAdd.length > 0) {
                        wiToAdd.forEach(wi => wi.wigroup = wiName.replace("'", ""))
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

let maxLengthForSection = 500, halfMaxLengthForSection = Math.floor(maxLengthForSection / 2);
let libraryChangesOccurred = false;

let getCharacterMetaByName = (name) => {
    return (allCharacterNames || []).find(meta => meta?.name === name)
}

let isCharacterFavorite = (name) => {
    return !!getCharacterMetaByName(name)?.favorite
}

let toggleCharacterFavorite = async (name) => {
    let target = getCharacterMetaByName(name)
    if (!target) {
        return false
    }
    target.favorite = !target.favorite
    libraryChangesOccurred = true
    await updateCharacterListFromAll()
    return !!target.favorite
}

const QUICK_START_SELECTION_CONFIG = {
    save: {
        label: "Save",
        itemType: "Save",
        isMulti: false,
        initialSection: "Saves",
        helpText: "Optional. Loads the selected save first and uses it as the starting story state."
    },
    mainCharacter: {
        label: "Main character",
        itemType: "Character",
        isMulti: false,
        initialSection: "Characters",
        helpText: "Optional. Loads this character after the save. Used for character intros and scene setup."
    },
    additionalCharacters: {
        label: "Additional characters",
        itemType: "Character",
        isMulti: true,
        initialSection: "Characters",
        helpText: "Optional. Adds selected characters as world info entries without replacing the main character."
    },
    playerCharacter: {
        label: "Player character",
        itemType: "Character",
        isMulti: false,
        initialSection: "Characters",
        helpText: "Optional. Sets your player name from this character, then adds that character as world info."
    },
    worldInfo: {
        label: "World info",
        itemType: "World Info",
        isMulti: true,
        initialSection: "World Info",
        helpText: "Optional. Loads selected world info or lorebook entries at the end of Quick Start."
    }
}

let quickStartSelection = {
    save: null,
    mainCharacter: null,
    additionalCharacters: [],
    playerCharacter: null,
    worldInfo: []
}

window.quickStartLibrarySelectionContext = null

let getQuickStartSelectionForRole = (role) => {
    if (!Object.prototype.hasOwnProperty.call(quickStartSelection, role)) {
        return []
    }
    let value = quickStartSelection[role]
    return Array.isArray(value) ? [...value] : (!!value ? [value] : [])
}

let isQuickStartNameSelected = (role, name) => {
    return getQuickStartSelectionForRole(role).includes(name)
}

let clearQuickStartSelectionForRole = (role) => {
    let config = QUICK_START_SELECTION_CONFIG[role]
    if (!config) {
        return
    }
    quickStartSelection[role] = config.isMulti ? [] : null
}

let clearAllQuickStartSelections = () => {
    Object.keys(QUICK_START_SELECTION_CONFIG).forEach(role => clearQuickStartSelectionForRole(role))
}

let toggleQuickStartSelectionForRole = (role, name) => {
    let config = QUICK_START_SELECTION_CONFIG[role]
    if (!config) {
        return false
    }

    if (config.isMulti) {
        let current = getQuickStartSelectionForRole(role)
        if (current.includes(name)) {
            quickStartSelection[role] = current.filter(curr => curr !== name)
            return false
        }
        current.push(name)
        quickStartSelection[role] = current
        return true
    }

    if (quickStartSelection[role] === name) {
        quickStartSelection[role] = null
        return false
    }
    quickStartSelection[role] = name
    return true
}

let doesQuickStartHaveSelections = () => {
    return Object.keys(QUICK_START_SELECTION_CONFIG).some(role => getQuickStartSelectionForRole(role).length > 0)
}

let loadWorldInfoFromLibraryByName = async (name) => {
    let charData = await getCharacterData(name)
    let wiToAdd = charData?.data
    if (!Array.isArray(wiToAdd)) {
        return false
    }
    current_wi = current_wi.filter(wi => wi?.folder !== name)
    current_wi.push(...wiToAdd)
    return true
}

let lastObjForRendering = undefined
let applyQuickStartSelection = async () => {
    if (!doesQuickStartHaveSelections()) {
        popupUtils.reset()
        return
    }

    waitingToast.setText("Applying Quick Start")
    waitingToast.show()

    let shouldRefreshManualWIChanges = false
    let nonFatalErrors = []

    try {
        let waitForRenderGametext = () => {
            let ogRender = render_gametext
            return {promise: new Promise(resolve => {
                render_gametext = (...args) => {
                    ogRender(...args)
                    render_gametext = ogRender
                    resolve()
                }
            }), ogRender};
        }
        if (lastObjForRendering !== undefined) {
            render_gametext = lastObjForRendering.ogRender
            lastObjForRendering = undefined
        }
        if (!!quickStartSelection.save) {
            try {
                let saveData = await getCharacterData(quickStartSelection.save)
                if (!!saveData?.data) {
                    try {
                        lastObjForRendering = waitForRenderGametext()
                        kai_json_load(saveData.data, false)
                        await lastObjForRendering.promise
                    }
                    finally {
                        render_gametext = lastObjForRendering.ogRender
                        lastObjForRendering = undefined
                    }                    
                }
            }
            catch (e) {
                nonFatalErrors.push(`Could not load save: ${quickStartSelection.save}`)
                console.error(e)
            }
        }

        if (!!quickStartSelection.mainCharacter) {
            try {
                let characterData = await getCharacterData(quickStartSelection.mainCharacter)
                if (!!characterData?.data) {
                    try {
                        lastObjForRendering= waitForRenderGametext()
                        load_tavern_obj(characterData.data)
                        await lastObjForRendering.promise
                    }
                    finally {
                        render_gametext = lastObjForRendering.ogRender
                        lastObjForRendering = undefined
                    }    
                }
            }
            catch (e) {
                nonFatalErrors.push(`Could not load main character: ${quickStartSelection.mainCharacter}`)
                console.error(e)
            }
        }

        for (let i = 0; i < quickStartSelection.additionalCharacters.length; i++) {
            let name = quickStartSelection.additionalCharacters[i]
            try {
                await window.loadByCharacterNameIntoWI(name)
                shouldRefreshManualWIChanges = true
            }
            catch (e) {
                nonFatalErrors.push(`Could not add additional character to WI: ${name}`)
                console.error(e)
            }
        }

        if (!!quickStartSelection.playerCharacter) {
            try {
                localsettings.chatname = quickStartSelection.playerCharacter
                await window.loadByCharacterNameIntoWI(quickStartSelection.playerCharacter)
                shouldRefreshManualWIChanges = true
            }
            catch (e) {
                nonFatalErrors.push(`Could not add player character to WI: ${quickStartSelection.playerCharacter}`)
                console.error(e)
            }
        }

        for (let i = 0; i < quickStartSelection.worldInfo.length; i++) {
            let name = quickStartSelection.worldInfo[i]
            try {
                let loaded = await loadWorldInfoFromLibraryByName(name)
                if (loaded) {
                    shouldRefreshManualWIChanges = true
                }
            }
            catch (e) {
                nonFatalErrors.push(`Could not load world info: ${name}`)
                console.error(e)
            }
        }

        if (shouldRefreshManualWIChanges) {
            try {
                update_for_sidepanel()
                render_gametext(true)
            }
            catch (e) {
                console.error(e)
            }
        }
    }
    finally {
        waitingToast.hide()
        popupUtils.reset()
        if (libraryChangesOccurred && is_using_kcpp_with_server_saving()) {
            libraryChangesOccurred = false
            msgboxYesNo("Changes were made to the library. Would you like to sync to the server now?", "Library",
                () => { 
                    putAllCharacterManagerData() 
                },
                null)
        }
    }

    if (nonFatalErrors.length > 0) {
        handleError(nonFatalErrors.join("\n"))
    }
}

let openLibraryForQuickStartRole = (role) => {
    let roleConfig = QUICK_START_SELECTION_CONFIG[role]
    if (!roleConfig) {
        return
    }
    window.quickStartLibrarySelectionContext = {
        role,
        itemType: roleConfig.itemType,
        initialSection: roleConfig.initialSection
    }
    showCharacterList(undefined, true, true, window.quickStartLibrarySelectionContext)
}

let showQuickStartPopup = () => {
    let contents = createDetailsContent("Quick Start")

    let createQuickStartSection = (sectionLabel, helpText, contentElem) => {
        let sectionContainer = document.createElement("div")
        sectionContainer.style = "width: 100%; display: flex; flex-direction: column; padding: 10px; gap: 8px;"

        let headerRow = document.createElement("div")
        headerRow.style = "display: flex; align-items: center; gap: 8px;"

        let titleElem = document.createElement("span")
        titleElem.innerText = sectionLabel
        titleElem.style = "font-weight: bold;"
        headerRow.appendChild(titleElem)

        let helpElem = document.createElement("span")
        helpElem.classList.add("helpicon")
        helpElem.innerText = "?"
        let helpTextElem = document.createElement("span")
        helpTextElem.classList.add("helptext")
        helpTextElem.innerText = helpText
        helpElem.appendChild(helpTextElem)
        headerRow.appendChild(helpElem)

        sectionContainer.appendChild(headerRow)
        sectionContainer.appendChild(contentElem)
        contents.appendChild(sectionContainer)
    }

    let createSelectionTile = (name, image = undefined, onClick = undefined) => {
        let tile = document.createElement("span")
        let tileText = document.createElement("b")
        tile.classList.add("containAndScaleImage", "tile", "quick_start_preview_tile")
        tile.style.backgroundImage = !!image ? image : "var(--img_esobold)"
        tile.title = name
        tileText.innerText = name
        tile.appendChild(tileText)
        if (!!onClick) {
            tile.addEventListener("click", onClick)
        }
        return tile
    }

    let createSelectionTilesPreview = (role) => {
        let selected = getQuickStartSelectionForRole(role)
        let tilesWrap = document.createElement("div")
        tilesWrap.classList.add("quick_start_preview_grid")

        if (selected.length === 0) {
            let noneTile = createSelectionTile("(none selected)", "url('/static/img/folder.svg')")
            noneTile.classList.add("quick_start_preview_tile_empty")
            tilesWrap.appendChild(noneTile)
            return tilesWrap
        }

        selected.forEach(name => {
            let meta = getCharacterMetaByName(name)
            let image = !!meta?.thumbnail ? `url(${meta.thumbnail})` : undefined
            let tile = createSelectionTile(name, image, () => {
                toggleQuickStartSelectionForRole(role, name)
                showQuickStartPopup()
            })
            tile.title = `${name} (click to deselect)`
            tilesWrap.appendChild(tile)
        })

        return tilesWrap
    }

    let addChooserSection = (role, sectionLabel) => {
        let sectionWrap = document.createElement("div")
        sectionWrap.style.width = "100%"
        sectionWrap.style.display = "flex"
        sectionWrap.style.flexDirection = "column"
        sectionWrap.style.gap = "8px"

        let row = document.createElement("div")
        row.style.width = "100%"
        row.style.display = "flex"
        row.style.alignItems = "center"
        row.style.justifyContent = "space-between"
        row.style.gap = "10px"
        row.style.flexWrap = "wrap"

        let actions = document.createElement("div")
        actions.style.display = "flex"
        actions.style.gap = "10px"
        actions.style.flexWrap = "wrap"

        let chooseButton = document.createElement("button")
        chooseButton.type = "button"
        chooseButton.classList.add("btn", "btn-primary")
        chooseButton.textContent = "Select in Library"
        chooseButton.addEventListener("click", () => {
            popupUtils.reset()
            openLibraryForQuickStartRole(role)
        })
        actions.appendChild(chooseButton)

        let clearButton = document.createElement("button")
        clearButton.type = "button"
        clearButton.classList.add("btn", "btn-primary")
        clearButton.textContent = "Clear"
        clearButton.addEventListener("click", () => {
            clearQuickStartSelectionForRole(role)
            showQuickStartPopup()
        })
        actions.appendChild(clearButton)

        row.appendChild(actions)
        sectionWrap.appendChild(createSelectionTilesPreview(role))
        sectionWrap.appendChild(row)
        createQuickStartSection(sectionLabel, QUICK_START_SELECTION_CONFIG[role]?.helpText || "Select items from Library. Click selected tiles here to deselect.", sectionWrap)
    }

    let totalSelected = Object.keys(QUICK_START_SELECTION_CONFIG)
        .map(role => getQuickStartSelectionForRole(role).length)
        .reduce((sum, count) => sum + count, 0)

    createSection(contents, "Note", "Selections are optional. Use Library to select / deselect items. You can import from Library and then return here.")
    createSection(contents, "Selected items", `${totalSelected}`)
    addChooserSection("save", "Base settings")
    addChooserSection("mainCharacter", "Main character (used for intro)")
    addChooserSection("additionalCharacters", "Additional characters in scene")
    addChooserSection("playerCharacter", "Player character")
    addChooserSection("worldInfo", "World info / lorebook entries")

    popupUtils.reset().title("Quick Start").content(contents).css("min-height", "50%").css("min-width", "60%")
        .button("Confirm", async () => {
            popupUtils.reset()
            await applyQuickStartSelection()
        })
        .button("Clear all", () => {
            clearAllQuickStartSelections()
            showQuickStartPopup()
        })
        .button("Close", () => popupUtils.reset())
        .show()
}

window.showQuickStartPopup = showQuickStartPopup

// Navigate back to the Library, waiting for any pending background processing to finish first
let waitForLibraryAndShow = () => {
    setTimeout(() => {
         if (!window?.debounce_pending_updateCharacterListFromAll && !window?.pending_encrypt) {
            showCharacterList(undefined, false, true, window.quickStartLibrarySelectionContext)
            return
        }
        let interval = setInterval(() => {
            if (!window?.debounce_pending_updateCharacterListFromAll && !window?.pending_encrypt) {
                clearInterval(interval)
                showCharacterList(undefined, false, true, window.quickStartLibrarySelectionContext)
            }
        }, 100)
    }, 300);
}
let showCharacterList = async (event = undefined, serverLoad = false, isReturn = false, quickStartSelectionContext = undefined) => {
    // Still processing characters
    if (!!window?.debounce_pending_updateCharacterListFromAll || !!window?.pending_encrypt)
    {
        handleError("Please wait - data is still being loaded")
        return
    }

    // Only reset change-tracking when opening fresh (not navigating back from a detail view)
    if (!isReturn) {
        libraryChangesOccurred = false
    }

    if (!!serverLoad)
    {
        await cleanupAllCharacterList()
        await loadAllCharacterManagerData()
    }

    if (!!quickStartSelectionContext) {
        window.quickStartLibrarySelectionContext = quickStartSelectionContext
    }
    let activeQuickStartSelectionContext = window.quickStartLibrarySelectionContext
    let isQuickStartSelectionMode = !!activeQuickStartSelectionContext

    let containers = []

    let applyQuickStartTileStyle = (tileElem, itemType, name) => {
        let tileLabel = tileElem.querySelector("b")
        let baseLabel = isCharacterFavorite(name) ? `★ ${name}` : name
        if (!isQuickStartSelectionMode || activeQuickStartSelectionContext?.itemType !== itemType) {
            tileElem.classList.remove("quick_start_selected")
            if (!!tileLabel) {
                tileLabel.innerText = baseLabel
            }
            return
        }

        if (isQuickStartNameSelected(activeQuickStartSelectionContext.role, name)) {
            tileElem.classList.add("quick_start_selected")
            if (!!tileLabel) {
                tileLabel.innerText = `✓ ${baseLabel}`
            }
            tileElem.title = `${name} (Selected)`
        } else {
            tileElem.classList.remove("quick_start_selected")
            if (!!tileLabel) {
                tileLabel.innerText = baseLabel
            }
            tileElem.title = name
        }
    }

    let refreshQuickStartTileStyles = () => {
        if (!isQuickStartSelectionMode) {
            return
        }
        let allTiles = [...document.querySelectorAll("#popupContainer .tile")]
        allTiles.forEach(tile => {
            let itemType = tile.dataset?.quickStartItemType
            let name = tile.dataset?.quickStartItemName
            if (!!itemType && !!name) {
                applyQuickStartTileStyle(tile, itemType, name)
            }
        })
    }

    let createIcon = (name, image) => {
        let charIcon = document.createElement("span");
        let charText = document.createElement("b");
        charIcon.classList.add("containAndScaleImage", "tile")
        charIcon.style.backgroundImage = !!image ? image : "var(--img_esobold)"
        if (!!image && image.startsWith("url(") && image.indexOf("/static/") !== -1) {
            let filterToUse = colourToCSSFilters(getThemeVars()["--theme_color_fg"]).filter;
            charIcon.style.filter = filterToUse;
        }
        charIcon.title = name
        charText.innerText = isCharacterFavorite(name) ? `★ ${name}` : name
        charIcon.appendChild(charText)
        return charIcon
    }
    let getContainerForType = (containerName, tooltip) => {
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
        if (!!tooltip) {
            container.title = tooltip
        }
        containers.push(container)

        let charIcon = createIcon(containerName, "url('/static/img/folder.svg')")
        charIcon.classList.add("searchExclude", "library_section_header")
        container.appendChild(charIcon);
        return container
    }

    const TYPE_TOOLTIPS = {
        "Scenarios": "Scenarios are pre-built story setups you can load to start a new adventure. Drag and drop scenario files here.",
        "Character": "Character cards define AI personas with description, personality, and world info. Drag and drop character PNG/JSON files here.",
        "World Info": "World info and lorebooks contain lore entries that get injected into the context when triggered. Drag and drop JSON files here.",
        "Save": "Saves store the current story state including chat history and settings. Drag and drop save files here.",
        "Document": "Documents and PDFs are text files added to the knowledge base (TextDB). Drag and drop TXT/PDF files here.",
        "Autosave": "Autosaves are automatic periodic saves of your current session.",
        "All": "Shows all library items across every category. Drag and drop any supported files here.",
        "Bulk": "Bulk operations for managing all library data at once.",
        "Server options": "Options for syncing and controlling the remote KCPP server data store."
    }

    // Open file upload dialog, mark a change, then return to the Library
    let openUploadDialog = () => {
        popupUtils.reset()
        let returnScheduled = false
        promptUserForLocalFile(async (result) => {
            libraryChangesOccurred = true
            managerUploadHandler(result)
            if (!returnScheduled) {
                returnScheduled = true
                // Wait for any pending processing to complete before reopening
                waitForLibraryAndShow()
            }
        }, [".png", ".webp", ".json", ".txt", ".pdf"], true)
    }

    // Open file upload dialog restricted to JSON scenario files
    let openScenarioUploadDialog = () => {
        popupUtils.reset()
        promptUserForLocalFile(async (result) => {
            let { fileName, plaintext } = result
            try {
                let data = JSON.parse(plaintext)
                if (is_kai_json(data)) {
                    libraryChangesOccurred = true
                    saveKLiteScenarioToIndexDB(fileName, data)
                    waitForLibraryAndShow()
                } else {
                    handleError(`${fileName}: File is not a valid scenario save`)
                }
            } catch (e) {
                handleError(`${fileName}: Failed to parse JSON`)
            }
        }, [".json"], false)
    }

    // Create a "+" add tile to prepend to each type container
    let createPlusTile = (tooltip, handler, label) => {
        let plusIcon = createIcon(label || "", "url('/static/img/plus.svg')")
        plusIcon.classList.add("searchExclude")
        plusIcon.title = tooltip || "Add item"
        plusIcon.addEventListener("click", handler)
        return plusIcon
    }

    let searchData = (searchTerm) => {
        let allTiles = [...document.querySelectorAll("#popupContainer .tile")]
        let hidableSections = [...document.querySelectorAll("#popupContainer div.autoGrid:not(.library_toolbar_row)")]
            .filter(elem => elem.dataset.hidden !== "true")
        try {
            let results = allTiles.filter(elem => !elem.title || elem.title.toLowerCase().indexOf(searchTerm) !== -1)
            if (results.length > 0) {
                hidableSections.forEach(elem => elem.style.display = "grid")

                allTiles.forEach(elem => {
                    if (!elem.classList.contains("searchExclude")) {
                        elem.style.display = "none"
                    }
                })
                results.forEach(elem => {
                    if (!elem.classList.contains("searchExclude")) {
                        elem.style.display = "unset"
                    }
                })
                hidableSections.filter(elem => [...elem.querySelectorAll(".tile")].filter(child => child.checkVisibility()).length == 1).forEach(elem => elem.style.display = "none")
            }
            else {
                hidableSections.forEach(elem => elem.style.display = "grid")
                allTiles.forEach(elem => {
                    if (!elem.classList.contains("searchExclude")) {
                        elem.style.display = "unset"
                    }
                })
            }
        }
        catch {
            hidableSections.forEach(elem => elem.style.display = "grid")
            allTiles.forEach(elem => {
                if (!elem.classList.contains("searchExclude")) {
                    elem.style.display = "unset"
                }
            })
        }
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
        let favoriteLabel = isCharacterFavorite(name) ? "Unfavorite" : "Favorite"

        popupUtils.reset().title("Save Options").content(contents).css("min-height", "50%").css("min-width", "50%")
            .button("Back", () => waitForLibraryAndShow())
            .button("Delete autosave", async () => {
                popupUtils.reset()
                msgboxYesNo("Are you sure you wish to delete?", "Autosave manager", async () => {
                    libraryChangesOccurred = true
                    allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                    removeAutosave(name)
                    waitForLibraryAndShow()
                })
            }).button("Close", () => popupUtils.reset()).show();
    }

    // Pre-create all section container shells (header icon only — content is lazy-loaded)
    const ALL_SECTION_TYPES = ["Character", "World Info", "Save", "Document", "Autosave", "Scenarios"]
    ALL_SECTION_TYPES.forEach(type => getContainerForType(type, TYPE_TOOLTIPS[type]))

    // Track which sections have already had their tiles built
    let loadedSections = new Set()

    // Helper: add plus tile(s) to a container (Autosave gets none)
    const NO_PLUS_TYPES = new Set(["Autosave"])
    let addPlusTilesToContainer = (container, typeName) => {
        if (NO_PLUS_TYPES.has(typeName)) return
        let headerIcon = container.firstChild
        if (typeName === "Character") {
            let uploadTile = createPlusTile("Import character from file", openUploadDialog, "Import")
            let createTile = createPlusTile("Create new character", () => { popupUtils.reset(); showCharacterCreator(); }, "Create New")
            if (headerIcon) {
                container.insertBefore(uploadTile, headerIcon.nextSibling)
                container.insertBefore(createTile, uploadTile.nextSibling)
            } else {
                container.appendChild(uploadTile)
                container.appendChild(createTile)
            }
        } else if (typeName === "Scenarios") {
            let importTile = createPlusTile("Import scenario from file", openScenarioUploadDialog, "Import")
            let saveTile = createPlusTile("Save current story as a custom scenario", () => {
                popupUtils.reset()
                inputBox("Enter a name for this custom scenario", "Save as Scenario", "", "Scenario name", () => {
                    let name = getInputBoxValue().trim()
                    if (!name) return
                    libraryChangesOccurred = true
                    let data = generate_savefile(true, true, true)
                    saveKLiteScenarioToIndexDB(name, data)
                    waitForLibraryAndShow()
                })
            }, "Save current")
            if (headerIcon) {
                container.insertBefore(importTile, headerIcon.nextSibling)
                container.insertBefore(saveTile, importTile.nextSibling)
            } else {
                container.appendChild(importTile)
                container.appendChild(saveTile)
            }
        } else if (typeName === "Save") {
            let importTile = createPlusTile("Import save from file", openUploadDialog, "Import")
            let saveTile = createPlusTile("Save current story to Library", () => {
                popupUtils.reset()
                inputBox("Enter a name for this save", "Save current", "", "Save name", () => {
                    let name = getInputBoxValue().trim()
                    if (!name) return
                    libraryChangesOccurred = true
                    let data = generate_savefile(true, true, true)
                    saveKLiteSaveToIndexDB(name, data)
                    waitForLibraryAndShow()
                })
            }, "Save current")
            let downloadTile = createPlusTile("Download current story as a file", () => { save_file_button() }, "Download current")
            if (headerIcon) {
                container.insertBefore(importTile, headerIcon.nextSibling)
                container.insertBefore(saveTile, importTile.nextSibling)
                container.insertBefore(downloadTile, saveTile.nextSibling)
            } else {
                container.appendChild(importTile)
                container.appendChild(saveTile)
                container.appendChild(downloadTile)
            }
        } else {
            let plusTile = createPlusTile(`Import ${typeName.toLowerCase()} from file`, openUploadDialog, "Import")
            if (headerIcon) {
                container.insertBefore(plusTile, headerIcon.nextSibling)
            } else {
                container.appendChild(plusTile)
            }
        }
    }

    // Build tiles for a standard allCharacterNames type (Character / World Info / Save / Document / Autosave)
    let buildSectionContent = (type) => {
        let container = getContainerForType(type, TYPE_TOOLTIPS[type])
        addPlusTilesToContainer(container, type)
        for (let i = 0; i < allCharacterNames.length; i++) {
            let { name, thumbnail } = allCharacterNames[i], itemType = getTypeFromAllCharacterData(allCharacterNames[i]);
            if (itemType !== type) continue
            let charIcon = createIcon(name, !!thumbnail ? `url(${thumbnail})` : undefined)
            charIcon.dataset.quickStartItemType = itemType
            charIcon.dataset.quickStartItemName = name
            applyQuickStartTileStyle(charIcon, itemType, name)
            charIcon.onclick = async () => {
                if (isQuickStartSelectionMode) {
                    if (activeQuickStartSelectionContext?.itemType !== itemType) {
                        handleError(`Please select from ${activeQuickStartSelectionContext?.initialSection || activeQuickStartSelectionContext?.itemType}`)
                        return
                    }
                    toggleQuickStartSelectionForRole(activeQuickStartSelectionContext.role, name)
                    refreshQuickStartTileStyles()
                    return
                }
                popupUtils.reset()
                if (itemType === "Character") {
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
                    let favoriteLabel = isCharacterFavorite(name) ? "Unfavorite" : "Favorite"

                    popupUtils.reset().title("Character Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", () => showCharacterList(undefined, false, true)).button("Load character", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name)
                        load_tavern_obj(charData.data);
                    }).button("Add character to WI", async () => {
                        popupUtils.reset()
                        await window.loadByCharacterNameIntoWI(name)
                    }).button("Add to TextDB", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name)
                        let wiToAdd = importCharacterCardAsWIInternal(charData.data);
                        importWIAsTextDB(name, wiToAdd)
                    }).button("Download character", async () => {
                        popupUtils.reset()
                        
                        let data = await getDownloadDataFromManager(name)
                        if (data !== null)
                        {
                            let { fileName, b64Url } = data
                            downloadB64URL(fileName, b64Url)
                        }
                    }).button(favoriteLabel, async () => {
                        popupUtils.reset()
                        await toggleCharacterFavorite(name)
                        showCharacterList(undefined, false, true)
                    }).button("Delete character", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete?  This will remove the server data if it is stored there as well.", "Library", async () => {
                            if (is_using_kcpp_with_server_saving()) {
                                await new Promise(resolve => promptForAdminPassword(resolve))
                                let remoteEndpoint = await getRemoteDataEndpoint();
                                await removeFileFromServer(remoteEndpoint, name)
                            }
                            libraryChangesOccurred = true
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                            showCharacterList(undefined, false, true)
                        })
                    }).button("Close", () => popupUtils.reset()).show();
                }
                else if (itemType === "World Info") {
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
                    let favoriteLabel = isCharacterFavorite(name) ? "Unfavorite" : "Favorite"

                    popupUtils.reset().title("World Info Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", () => showCharacterList(undefined, false, true)).button("Add to WI", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name)
                        let wiToAdd = charData.data;
                        current_wi = current_wi.filter(wi => wi?.folder !== name)
                        current_wi.push(...wiToAdd)
                    }).button("Add to TextDB", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name)
                        let wiToAdd = charData.data;
                        importWIAsTextDB(name, wiToAdd)
                    }).button("Download world info", async () => {
                        popupUtils.reset()

                        let data = await getDownloadDataFromManager(name)
                        if (data !== null) {
                            let { fileName, b64Url } = data
                            downloadB64URL(fileName, b64Url)
                        }
                    }).button(favoriteLabel, async () => {
                        popupUtils.reset()
                        await toggleCharacterFavorite(name)
                        showCharacterList(undefined, false, true)
                    }).button("Delete world info", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete?  This will remove the server data if it is stored there as well.", "Library", async () => {
                            if (is_using_kcpp_with_server_saving()) {
                                await new Promise(resolve => promptForAdminPassword(resolve))
                                let remoteEndpoint = await getRemoteDataEndpoint();
                                await removeFileFromServer(remoteEndpoint, name)
                            }
                            libraryChangesOccurred = true
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                            showCharacterList(undefined, false, true)
                        })
                    }).button("Close", () => popupUtils.reset()).show();
                }
                else if (itemType === "Save") {
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
                    let favoriteLabel = isCharacterFavorite(name) ? "Unfavorite" : "Favorite"

                    popupUtils.reset().title("Save Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", () => showCharacterList(undefined, false, true)).button("Load save", async () => {
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
                        let data = await getDownloadDataFromManager(name)
                        if (data !== null) {
                            let { fileName, b64Url } = data
                            downloadB64URL(fileName, b64Url)
                        }
                    }).button(favoriteLabel, async () => {
                        popupUtils.reset()
                        await toggleCharacterFavorite(name)
                        showCharacterList(undefined, false, true)
                    }).button("Delete save", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete?  This will remove the server data if it is stored there as well.", "Library", async () => {
                            if (is_using_kcpp_with_server_saving()) {
                                await new Promise(resolve => promptForAdminPassword(resolve))
                                let remoteEndpoint = await getRemoteDataEndpoint();
                                await removeFileFromServer(remoteEndpoint, name)
                            }
                            libraryChangesOccurred = true
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                            showCharacterList(undefined, false, true)
                        })
                    }).button("Close", () => popupUtils.reset()).show();
                }
                else if (itemType === "Document") {
                    let contents = document.createElement("span");
                    contents = createDetailsContent(name);
                    let charData = await getCharacterData(name), { extractedText } = charData;
                    createSection(contents, "Has text been extracted?", !!extractedText ? "True" : "False");
                    let favoriteLabel = isCharacterFavorite(name) ? "Unfavorite" : "Favorite"

                    popupUtils.reset().title("Document Options").content(contents).css("min-height", "50%").css("min-width", "50%").button("Back", () => showCharacterList(undefined, false, true)).button("Add to TextDB", async () => {
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
                        let data = await getDownloadDataFromManager(name)
                        if (data !== null) {
                            let { fileName, b64Url } = data
                            downloadB64URL(fileName, b64Url)
                        }
                    }).button(favoriteLabel, async () => {
                        popupUtils.reset()
                        await toggleCharacterFavorite(name)
                        showCharacterList(undefined, false, true)
                    }).button("Delete document", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete?  This will remove the server data if it is stored there as well.", "Library", async () => {
                            if (is_using_kcpp_with_server_saving())
                            {
                                await new Promise(resolve => promptForAdminPassword(resolve))
                                let remoteEndpoint = await getRemoteDataEndpoint();
                                await removeFileFromServer(remoteEndpoint, name)
                            }
                            libraryChangesOccurred = true
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                            showCharacterList(undefined, false, true)
                        })
                    }).button("Close", () => popupUtils.reset()).show();
                }
                else if (itemType === "Autosave") {
                    autosaveFromClick(name)
                }
                else {
                    popupUtils.reset()
                }
            }
            container.appendChild(charIcon)
        }
    }

    // Builder: Autosave section (local tiles + optional server autosaves)
    let buildAutosaveTiles = async () => {
        buildSectionContent("Autosave")
        if (is_using_kcpp_with_server_saving()) {
            try {
                let autoSaves = await getServerSaves({ typeName: "Autosave" })
                let localAutosaveNames = allCharacterNames.filter(data => data?.type === "Autosave").map(data => data.name)
                Object.keys(autoSaves).filter(saveName => !localAutosaveNames.includes(saveName)).forEach(name => {
                    let charIcon = createIcon(name, undefined)
                    charIcon.onclick = () => autosaveFromClick(name)
                    getContainerForType("Autosave", TYPE_TOOLTIPS["Autosave"]).appendChild(charIcon)
                })
            }
            catch (e) {
                console.error("Could not get server autosaves", e)
            }
        }
    }

    // Builder: Scenarios section (fetches data on first view)
    let buildScenariosTiles = async () => {
        // Add plus tiles first
        addPlusTilesToContainer(getContainerForType("Scenarios", TYPE_TOOLTIPS["Scenarios"]), "Scenarios")

        let scenarios = await getScenariosAndLegacyServerSaves()
        let scenariosContainer = getContainerForType("Scenarios", TYPE_TOOLTIPS["Scenarios"])
        let addCustomScenarioTile = (charMeta) => {
            let { name, thumbnail } = charMeta
            let icon = createIcon(name, !!thumbnail ? `url(${thumbnail})` : undefined)
            icon.onclick = async () => {
                popupUtils.reset()
                let contents = document.createElement("span")
                try {
                    let charData = await getCharacterData(name)
                    let { AI_portrait } = charData
                    let { memory, prompt, tempmemory, worldinfo } = charData?.data || {}
                    let savedSettings = charData?.data?.savedsettings || {}
                    let { chatname, chatopponent } = savedSettings
                    contents = createDetailsContent(name)
                    if (!!AI_portrait) {
                        let imageContainer = document.createElement("span"), imageElem = document.createElement("img")
                        imageElem.src = AI_portrait
                        imageElem.style = "height: 30%; width: 30%; border-radius: 10px;"
                        imageContainer.style = "width: 100%; display: flex; justify-content: space-around; padding: 10px;"
                        imageContainer.appendChild(imageElem)
                        contents.appendChild(imageContainer)
                    }
                    if (!!chatname) createSection(contents, "User", chatname)
                    if (!!chatopponent) createSection(contents, "Characters", chatopponent.split("||$||"))
                    createSection(contents, "Memory", memory)
                    createSection(contents, "Temporary memory", tempmemory)
                    createSection(contents, "First message", prompt)
                    createSection(contents, "World info", worldinfo?.map(entry => wiEntryToString(entry)))
                } catch (e) {
                    console.error(e)
                }
                let favoriteLabel = isCharacterFavorite(name) ? "Unfavorite" : "Favorite"
                popupUtils.reset().title("Scenario Options").content(contents).css("min-height", "50%").css("min-width", "50%")
                    .button("Back", () => showCharacterList(undefined, false, true))
                    .button("Load scenario", async () => {
                        popupUtils.reset()
                        let charData = await getCharacterData(name)
                        kai_scenario_load(charData.data)
                    })
                    .button("Download scenario", async () => {
                        popupUtils.reset()
                        let data = await getDownloadDataFromManager(name)
                        if (data !== null) {
                            let { fileName, b64Url } = data
                            downloadB64URL(fileName, b64Url)
                        }
                    })
                    .button(favoriteLabel, async () => {
                        popupUtils.reset()
                        await toggleCharacterFavorite(name)
                        showCharacterList(undefined, false, true)
                    })
                    .button("Delete scenario", async () => {
                        popupUtils.reset()
                        msgboxYesNo("Are you sure you wish to delete? This will remove the server data if it is stored there as well.", "Library", async () => {
                            if (is_using_kcpp_with_server_saving()) {
                                await new Promise(resolve => promptForAdminPassword(resolve))
                                let remoteEndpoint = await getRemoteDataEndpoint()
                                await removeFileFromServer(remoteEndpoint, name)
                            }
                            libraryChangesOccurred = true
                            allCharacterNames = allCharacterNames.filter(c => c.name !== name)
                            await indexeddb_save(`character_${name}`)
                            updateCharacterListFromAll()
                            showCharacterList(undefined, false, true)
                        })
                    })
                    .button("Close", () => popupUtils.reset()).show()
            }
            scenariosContainer.appendChild(icon)
        }

        let customScenarios = allCharacterNames.filter(data => data?.type === "Scenario" && !!data?.favorite)
        // Favorite custom (user-defined) scenarios stored in the Library
        for (let i = 0; i < customScenarios.length; i++) {
            let charMeta = customScenarios[i]
            if (charMeta.type !== "Scenario") continue
            addCustomScenarioTile(charMeta);
        }

        // scenarios[0..scenario_sources.length-1] are from local scenario_sources files
        for (let i = 0; i < scenario_sources.length && i < scenarios.length; i++) {
            let scenario = scenarios[i]
            if (!scenario) continue
            let icon = createIcon(scenario.name, undefined)
            icon.addEventListener("click", scenario.handler)
            scenariosContainer.appendChild(icon)
        }

        // scenarios[scenario_sources.length..] are from scenario_db (built-in + server)
        for (let i = scenario_sources.length; i < scenarios.length; i++) {
            let scenario = scenarios[i]
            if (!scenario) continue
            if (scenario_db[i - scenario_sources.length]?.serverSaveTypeName === "Autosave") {
                continue
            }
            let image = undefined
            if (scenario?.thumbnail !== undefined) {
                image = `url('${scenario.thumbnail}')`
            }
            let icon = createIcon(scenario.name, image)
            icon.addEventListener("click", scenario.handler)
            scenariosContainer.appendChild(icon);
        }

        customScenarios = allCharacterNames.filter(data => data?.type === "Scenario" && !data?.favorite)
        // Custom (user-defined) scenarios stored in the Library
        for (let i = 0; i < customScenarios.length; i++) {
            let charMeta = customScenarios[i]
            if (charMeta.type !== "Scenario") continue
            addCustomScenarioTile(charMeta);
        }
    }

    // Load a section's content if it has not been built yet
    let loadSectionIfNeeded = async (label) => {
        if (loadedSections.has(label)) return
        loadedSections.add(label)
        if (label === "Autosaves")       { await buildAutosaveTiles() }
        else if (label === "Scenarios")  { await buildScenariosTiles() }
        else if (label === "Characters") { buildSectionContent("Character") }
        else if (label === "World Info") { buildSectionContent("World Info") }
        else if (label === "Saves")      { buildSectionContent("Save") }
        else if (label === "Documents")  { buildSectionContent("Document") }
    }
    // Build the Bulk container (tiles instead of buttons)
    let bulkContainer = document.createElement("div")
    bulkContainer.classList.add("autoGrid", "library_bulk")
    bulkContainer.style.overflowX = "hidden"
    bulkContainer.style.marginBottom = "10px"
    bulkContainer.title = TYPE_TOOLTIPS["Bulk"]

    let bulkHeader = createIcon("Bulk operations", "url('/static/img/folder.svg')")
    bulkHeader.classList.add("searchExclude")
    bulkContainer.appendChild(bulkHeader)

    let addBulkTile = (name, image, tooltip, handler) => {
        let tile = createIcon(name, image)
        tile.title = tooltip
        tile.addEventListener("click", handler)
        bulkContainer.appendChild(tile)
    }

    addBulkTile("Migrate old data", "url('/static/img/upload.svg')", "Migrate data from legacy save slots to the Library", async () => {
        popupUtils.reset()
        waitingToast.setText(`Migrating old data`)
        waitingToast.show()
        await migrateOldData()
        waitingToast.setText(`Migration complete`)
        setTimeout(() => { waitingToast.hide() }, 5000)
    })
    addBulkTile("Delete all", "url('/static/img/bin.svg')", "Delete all local library data (cannot be undone)", async () => {
        popupUtils.reset()
        msgboxYesNo("Are you sure you wish to delete all local data?", "Library", async () => {
            libraryChangesOccurred = true
            waitingToast.setText(`Deleting all local data`)
            waitingToast.show()
            await Promise.all(allCharacterNames.map(elem => indexeddb_save(`character_${elem.name}`)))
            allCharacterNames = []
            await updateCharacterListFromAll()
            waitingToast.hide()
        })
    })
    addBulkTile("Download all", "url('/static/img/download.svg')", "Download all library data as a zip archive", async () => {
        popupUtils.reset()
        msgboxYesNo("Are you sure you wish to download all data?", "Library", async () => {
            waitingToast.setText(`Downloading all data`)
            waitingToast.show()
            await downloadZipExport()
            waitingToast.hide()
        })
    })
    addBulkTile("Upload all", "url('/static/img/upload.svg')", "Upload all library data from a zip archive", async () => {
        popupUtils.reset()
        msgboxYesNo("Are you sure you wish to upload all data from a zip archive?", "Library", async () => {
            libraryChangesOccurred = true
            waitingToast.setText(`Uploading all data from archive`)
            waitingToast.show()
            await uploadZipImport()
            await updateCharacterListFromAll()
            waitingToast.hide()
        })
    })

    // Build the Server options container (tiles instead of buttons)
    let serverContainer = document.createElement("div")
    serverContainer.classList.add("autoGrid", "library_server")
    serverContainer.style.overflowX = "hidden"
    serverContainer.style.marginBottom = "10px"
    serverContainer.title = TYPE_TOOLTIPS["Server options"]

    let serverHeader = createIcon("Server options", "url('/static/img/folder.svg')")
    serverHeader.classList.add("searchExclude")
    serverContainer.appendChild(serverHeader)

    let controlTile = createIcon("Control", "url('/static/img/folder.svg')")
    controlTile.title = "Configure the remote KCPP server data store settings"
    controlTile.addEventListener("click", () => controlRemoteDataStore())
    serverContainer.appendChild(controlTile)

    if (is_using_kcpp_with_server_saving()) {
        let syncTile = createIcon("Sync", "url('/static/img/sync.svg')")
        syncTile.title = "Sync all library data to the server now"
        syncTile.addEventListener("click", () => putAllCharacterManagerData())
        serverContainer.appendChild(syncTile)
    }

    // Build the dropdown type selector toolbar
    let toolbarRow = document.createElement("div")
    toolbarRow.classList.add("settinglabel", "library_toolbar_row")
    toolbarRow.style.marginBottom = "10px"
    toolbarRow.style.display = "flex"
    toolbarRow.style.gap = "10px"
    toolbarRow.style.flexWrap = "wrap"
    toolbarRow.style.alignItems = "center"

    let typeSelect = document.createElement("select")
    typeSelect.classList.add("settinglabel")
    typeSelect.style.flexGrow = "0"
    typeSelect.style.minWidth = "150px"
    typeSelect.style.fontSize = "var(--main_font_size)"
    typeSelect.style.height = "100%"

    const DROPDOWN_OPTIONS = [
        { label: "Saves", containerClass: "Save", tooltip: TYPE_TOOLTIPS["Save"] },
        { label: "Scenarios",     containerClass: "Scenarios",  tooltip: TYPE_TOOLTIPS["Scenarios"] },
        { label: "Characters",    containerClass: "Character",   tooltip: TYPE_TOOLTIPS["Character"] },
        { label: "World Info",    containerClass: "World_Info",  tooltip: TYPE_TOOLTIPS["World Info"] },
        { label: "Documents",     containerClass: "Document",    tooltip: TYPE_TOOLTIPS["Document"] },
        { label: "Autosaves",     containerClass: "Autosave",    tooltip: TYPE_TOOLTIPS["Autosave"] },
        { label: "All",           containerClass: null,          tooltip: TYPE_TOOLTIPS["All"] },
        { label: "Bulk",          containerClass: "_bulk",       tooltip: TYPE_TOOLTIPS["Bulk"] },
        { label: "Server options",containerClass: "_server",     tooltip: TYPE_TOOLTIPS["Server options"] },
    ]

    const LIBRARY_SECTION_KEY = "esobold_library_section"
    let savedSection = localStorage.getItem(LIBRARY_SECTION_KEY)
    let initialSection = DROPDOWN_OPTIONS.some(o => o.label === savedSection) ? savedSection : DROPDOWN_OPTIONS[0].label
    if (isQuickStartSelectionMode && !!activeQuickStartSelectionContext?.initialSection) {
        initialSection = activeQuickStartSelectionContext.initialSection
    }

    for (let opt of DROPDOWN_OPTIONS) {
        let optElem = document.createElement("option")
        optElem.value = opt.label
        optElem.textContent = opt.label
        optElem.title = opt.tooltip
        if (opt.label === initialSection) {
            optElem.selected = true
        }
        typeSelect.appendChild(optElem)
    }
    toolbarRow.appendChild(typeSelect)

    if (isQuickStartSelectionMode) {
        let selectionHint = document.createElement("span")
        selectionHint.classList.add("settinglabel")
        selectionHint.style.flexGrow = "1"
        selectionHint.style.minWidth = "240px"
        selectionHint.innerText = `Quick Start: click tiles to select/deselect ${activeQuickStartSelectionContext?.itemType}`
        toolbarRow.appendChild(selectionHint)
    }

    // Search input (hidden for Bulk / Server options views)
    let searchInput = document.createElement("input")
    searchInput.classList.add("settinglabel", "fullScreenTextEditExclude")
    searchInput.title = "Search library items by name"
    searchInput.placeholder = "Search"
    searchInput.type = "text"
    searchInput.style.flexGrow = "1"
    searchInput.style.minWidth = "100px"
    searchInput.addEventListener("change", () => searchData(searchInput.value.toLowerCase()))
    searchInput.addEventListener("input", () => searchData(searchInput.value.toLowerCase()))
    toolbarRow.appendChild(searchInput)

    // updateView lazily loads section content on first view, then shows/hides containers
    let updateView = async (selectedType) => {
        let isBulk   = selectedType === "Bulk"
        let isServer = selectedType === "Server options"
        let isAll    = selectedType === "All"

        // Load content for the section(s) being shown, if not already built
        if (isAll) {
            await Promise.all(
                DROPDOWN_OPTIONS
                    .filter(o => !["All", "Bulk", "Server options"].includes(o.label))
                    .map(o => loadSectionIfNeeded(o.label))
            )
        } else if (!isBulk && !isServer) {
            await loadSectionIfNeeded(selectedType)
        }

        let opt = DROPDOWN_OPTIONS.find(o => o.label === selectedType)

        containers.forEach(container => {
            let show = false
            if (isAll) {
                show = true
            } else if (!isBulk && !isServer && opt) {
                show = container.classList.contains(opt.containerClass)
            }
            container.style.display = show ? "grid" : "none"
            container.dataset.hidden = show ? "false" : "true"
        })

        bulkContainer.style.display   = isBulk   ? "grid" : "none"
        bulkContainer.dataset.hidden   = isBulk   ? "false" : "true"
        serverContainer.style.display = isServer  ? "grid" : "none"
        serverContainer.dataset.hidden = isServer  ? "false" : "true"

        // Hide search input for Bulk / Server options
        searchInput.style.display = (isBulk || isServer) ? "none" : ""

        // Clear search when switching views
        if (searchInput.value) {
            searchInput.value = ""
            searchData("")
        }
    }

    typeSelect.addEventListener("change", () => {
        if (!isQuickStartSelectionMode) {
            localStorage.setItem(LIBRARY_SECTION_KEY, typeSelect.value)
        }
        updateView(typeSelect.value)
    })

    // Assemble the popup
    popupUtils.reset().title(`Library (${allCharacterNames.length})`).css("height", "80%").css("width", "80%")
    popupUtils.content(toolbarRow)
    containers.forEach(container => popupUtils.content(container))
    popupUtils.content(bulkContainer)
    popupUtils.content(serverContainer)

    // Close button — close popup first, then prompt to sync if changes occurred
    let buttonGroup = popupUtils.resetButtonGroup()
    if (isQuickStartSelectionMode) {
        buttonGroup.button("Back to Quick Start", () => {
            popupUtils.reset()
            window.quickStartLibrarySelectionContext = null
            showQuickStartPopup()
        })
    } else {
        buttonGroup.button("Close", () => {
            popupUtils.reset()
            window.quickStartLibrarySelectionContext = null
            if (libraryChangesOccurred && is_using_kcpp_with_server_saving()) {
                msgboxYesNo("Changes were made to the library. Would you like to sync to the server now?", "Library",
                    () => { putAllCharacterManagerData() },
                    null)
            }
        })
    }
    buttonGroup.show()

    // Apply initial view (from localStorage if available, otherwise first option)
    updateView(initialSection)

    // Attach drop zone to the entire popup content area (active for all views except Bulk / Server options)
    let dropZoneActive = () => typeSelect.value !== "Bulk" && typeSelect.value !== "Server options"

    popupUtils.contentElem.addEventListener("dragover", (e) => {
        if (dropZoneActive()) {
            e.preventDefault()
            e.stopPropagation()
        }
    }, false)

    popupUtils.contentElem.addEventListener("drop", (e) => {
        if (!dropZoneActive()) return
        let files = e.dataTransfer.files
        if (files && files.length > 0) {
            e.preventDefault()
            e.stopPropagation()
            let validFiles = [...files].filter(file => file != null && file.name && file.name !== "" && file.type)
            if (validFiles.length > 0) {
                popupUtils.reset()
                libraryChangesOccurred = true
                let remaining = validFiles.length
                fileInputToFiles(validFiles, (result) => {
                    managerUploadHandler(result)
                    remaining--
                    if (remaining === 0) {
                        waitForLibraryAndShow()
                    }
                })
            }
            else {
                handleError("No valid files selected")
            }
        }
    }, false)

    // Fix colour of bottom border for popup
    popupUtils.buttonsElem.style["paddingBottom"] = "0px"
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
            const existingMeta = (allCharacterNames || []).find(c => c?.name === name);
            allCharacterNames = (allCharacterNames || []).filter(c => c?.name !== name);
            allCharacterNames.push({ name, thumbnail: thumbUrl, type: 'Character', favorite: !!existingMeta?.favorite });
            await updateCharacterListFromAll();

            waitingToast.hide();
            popupUtils.reset();
            libraryChangesOccurred = true;
            showCharacterList(undefined, false, true);
        }
        catch (e) {
            handleError(e);
            waitingToast.hide();
        }
    };

    popupUtils.reset()
        .title('New Character')
        .content(form)
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
    if (!!messageText)
    {
        return extractExampleMessages(messageText).map(c => `Example messages:\n\n${c}`).join("\n\n")
    }
    return "";
}