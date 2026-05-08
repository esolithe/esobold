window.eso.lumaraPollingIntervalId = null;

window.setupLumaraPolling = () => {
    if (!!window.eso.lumaraPollingIntervalId) {
        clearInterval(window.eso.lumaraPollingIntervalId)
        window.eso.lumaraPollingIntervalId = null;
    }
    
    if (isAgentModeEnabledAndSetCorrectly() && is_using_kcpp_with_open_lumara() && !!localsettings?.agentLumaraPollingRate && localsettings.agentLumaraPollingRate > 0) {
        window.eso.currentlyProcessingFromLumara = Promise.resolve();
        window.eso.lumaraPollingIntervalId = setInterval(async () => {
            await pollForLatestMessagesFromLumara();
        }, localsettings?.agentLumaraPollingRate * 1000)
    }
}

let corpoHide_render_gametext = render_gametext;
render_gametext = (...args) => {
    corpoHide_render_gametext(...args)
    if (!!localsettings?.corpoHideLeftPanel)
    {
        if (!!window?.eso?.forceCompleteHideOfCorpoLeftPanel) {
            document.querySelector("#corpo_leftpanel").classList.add("hidden")
            document.querySelector(".corpostyle").classList.remove("forceLeftHidden")
        }
        else {
            document.querySelector("#corpo_leftpanel").classList.remove("hidden")
            document.querySelector(".corpostyle").classList.add("forceLeftHidden")
        }
    }
    else
    {
        document.querySelector("#corpo_leftpanel").classList.remove("hidden")
        document.querySelector(".corpostyle").classList.remove("forceLeftHidden")
    }
}

let originalDisplaySettings = display_settings, originalConfirmSettings = confirm_settings;

let getAgentAutoContinueMode = () => {
    let mode = `${localsettings?.agentAutoContinueMode || ""}`
    if (mode === "auto" || mode === "prompt" || mode === "disabled") {
        return mode
    }
    if (typeof localsettings?.agentAutoContinue === "boolean") {
        return localsettings.agentAutoContinue ? "auto" : "prompt"
    }
    return "auto"
}

let DEFAULT_AGENT_TOOL_GROUPS = [
    { key: "messaging", label: "Messaging" },
    { key: "planning_input", label: "Planning and User Input" },
    { key: "search_web", label: "Search and Web" },
    { key: "macros", label: "Macros" },
    { key: "world_state", label: "World and State" },
    { key: "filesystem", label: "Filesystem" },
    { key: "media", label: "Media" },
    { key: "utilities", label: "Utilities" },
    { key: "mcp", label: "MCP Tools" },
    { key: "misc", label: "Misc" },
]

let escapeHtml = (value = "") => {
    return `${value || ""}`
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
}

let sanitizeToolDomId = (value = "") => {
    return `${value || ""}`.replace(/[^A-Za-z0-9_-]/g, "_")
}

let getAgentToolGroupDefinitions = () => {
    let groupDefinitions = Array.isArray(window?.eso?.agentCommandGroupDefinitions) ? window.eso.agentCommandGroupDefinitions : DEFAULT_AGENT_TOOL_GROUPS
    return groupDefinitions.filter(groupDefinition => !!groupDefinition?.key)
}

let getEsoboldAgentCommands = () => {
    if (typeof window?.eso?.originalGetCommands !== "function") {
        return []
    }

    try {
        return window.eso.originalGetCommands({})
    }
    catch (e)
    {
        console.error("Failed to build Esobold agent tools list", e)
        return []
    }
}

let renderEsoboldAgentTools = () => {
    let toolsContainer = document.getElementById("esobold_agent_tools_list_container")
    if (!toolsContainer) {
        return
    }

    let disabledTools = Array.isArray(localsettings?.disabled_agent_tools) ? localsettings.disabled_agent_tools : []
    let commands = getEsoboldAgentCommands()
    let disabledToolsSet = new Set(disabledTools)
    let groupDefinitions = getAgentToolGroupDefinitions()
    let groupLabels = {}
    groupDefinitions.forEach(groupDefinition => {
        groupLabels[groupDefinition.key] = groupDefinition?.label || groupDefinition.key
    })
    let commandsByGroup = {}
    groupDefinitions.forEach(groupDefinition => {
        commandsByGroup[groupDefinition.key] = []
    })
    commands.forEach(command => {
        let groupKey = `${command?.group || "utilities"}`
        if (!Array.isArray(commandsByGroup[groupKey])) {
            commandsByGroup[groupKey] = []
        }
        commandsByGroup[groupKey].push(command)
        if (!groupLabels[groupKey]) {
            groupLabels[groupKey] = groupKey
        }
    })

    if (commands.length === 0) {
        toolsContainer.innerHTML = "<p>No Esobold agent tools are currently available.</p>"
        return
    }

    let toolsHtml = ""
    let orderedGroups = [...groupDefinitions.map(groupDefinition => groupDefinition.key), ...Object.keys(commandsByGroup).filter(groupKey => !groupDefinitions.some(groupDefinition => groupDefinition.key === groupKey))]
    orderedGroups.forEach(groupKey => {
        let groupedCommands = commandsByGroup[groupKey] || []
        if (groupedCommands.length === 0) {
            return
        }
        let groupDomId = sanitizeToolDomId(groupKey)
        toolsHtml += `<table class="tools-table esobold-agent-group-table" data-agent-tool-group="${escapeHtml(groupKey)}" style="margin: 0 0 12px 0;"><thead><tr><th>${escapeHtml(groupLabels[groupKey] || groupKey)}</th><th><div class="esobold-agent-allowed-header" style="display:flex;align-items:center;justify-content:flex-end;gap:8px;white-space:nowrap;"><span>Allowed</span><input type="checkbox" id="agenttoolgroup_${groupDomId}" value="${escapeHtml(groupKey)}" data-agent-tool-group-toggle="true" checked/></div></th></tr></thead><tbody>`

        groupedCommands.forEach((command) => {
            let enabledStatus = command?.enabled ? "enabled" : "disabled"
            let description = command?.description ? command.description : "No description"
            let commandDomId = sanitizeToolDomId(command.name)
            let isChecked = !disabledToolsSet.has(command.name)
            toolsHtml += `
                <tr>
                    <td class="tools-info">
                        <div class="tool-title">${escapeHtml(command.name)} (${enabledStatus})</div>
                        <div class="tool-description">${escapeHtml(description)}</div>
                    </td>
                    <td class="tools-checkbox">
                        <input type="checkbox" id="agenttool_${commandDomId}" value="${escapeHtml(command.name)}" data-agent-tool-checkbox="true" data-agent-tool-group="${escapeHtml(groupKey)}" ${isChecked ? "checked" : ""}/>
                    </td>
                </tr>
            `
        })

        toolsHtml += `</tbody></table>`
    })
    toolsContainer.innerHTML = toolsHtml

    let getGroupCheckbox = (groupKey) => toolsContainer.querySelector(`input[data-agent-tool-group-toggle='true'][value='${CSS.escape(groupKey)}']`)
    let getCommandCheckboxesByGroup = (groupKey) => [...toolsContainer.querySelectorAll(`input[data-agent-tool-checkbox='true'][data-agent-tool-group='${CSS.escape(groupKey)}']`)]

    let refreshGroupState = (groupKey) => {
        let groupCheckbox = getGroupCheckbox(groupKey)
        if (!groupCheckbox) {
            return
        }
        let commandCheckboxes = getCommandCheckboxesByGroup(groupKey)
        if (commandCheckboxes.length === 0) {
            groupCheckbox.checked = true
            groupCheckbox.indeterminate = false
            return
        }
        let allowedCount = commandCheckboxes.filter(commandCheckbox => commandCheckbox.checked).length
        if (allowedCount === 0) {
            groupCheckbox.checked = false
            groupCheckbox.indeterminate = false
            return
        }
        if (allowedCount === commandCheckboxes.length) {
            groupCheckbox.checked = true
            groupCheckbox.indeterminate = false
            return
        }
        groupCheckbox.checked = true
        groupCheckbox.indeterminate = true
    };

    [...toolsContainer.querySelectorAll("input[data-agent-tool-group-toggle='true']")].forEach(groupCheckbox => {
        groupCheckbox.onchange = () => {
            let groupKey = `${groupCheckbox.value || ""}`
            let commandCheckboxes = getCommandCheckboxesByGroup(groupKey)
            commandCheckboxes.forEach(commandCheckbox => {
                commandCheckbox.checked = groupCheckbox.checked
            })
            groupCheckbox.indeterminate = false
        }
    });

    [...toolsContainer.querySelectorAll("input[data-agent-tool-checkbox='true']")].forEach(commandCheckbox => {
        commandCheckbox.onchange = () => {
            let groupKey = `${commandCheckbox?.dataset?.agentToolGroup || ""}`
            refreshGroupState(groupKey)
        }
    });

    orderedGroups.forEach(groupKey => refreshGroupState(groupKey))
}

display_settings = () => {
    originalDisplaySettings()
    document.getElementById("agentBehaviour").checked = localsettings.agentBehaviour;
    document.getElementById("agentHideCOT").checked = localsettings.agentHideCOT;
    document.getElementById("agentStopOnRequestForInput").checked = localsettings.agentStopOnRequestForInput;
    document.getElementById("agentReplanOnError").checked = localsettings.agentReplanOnError;
    document.getElementById("agentCOTMax").value = localsettings.agentCOTMax;
    document.getElementById("agentCOTMaxnumeric").value = localsettings.agentCOTMax;
    document.getElementById("agentAutoContinue").value = getAgentAutoContinueMode();
    document.getElementById("agentCOTRepeatsMax").value = localsettings.agentCOTRepeatsMax;
    document.getElementById("agentCOTRepeatsMaxnumeric").value = localsettings.agentCOTRepeatsMax;
    document.getElementById("agentUseOAITools").checked = localsettings.agentUseOAITools;
    document.getElementById("agentSkipPlanningStep").checked = localsettings.agentSkipPlanningStep;
    document.getElementById("agentMaxActionsInHistory").value = localsettings.agentMaxActionsInHistory;
    document.getElementById("agentMaxActionsInHistorynumeric").value = localsettings.agentMaxActionsInHistory;
    document.getElementById("agentSkipPreviousCOTWhenProcessing").checked = localsettings.agentSkipPreviousCOTWhenProcessing;
    document.getElementById("agentStreamThinking").checked = localsettings.agentStreamThinking;
    document.getElementById("agentFsContentCharLimit").value = localsettings.agentFsContentCharLimit || 5000;
    document.getElementById("agentFsContentCharLimitnumeric").value = localsettings.agentFsContentCharLimit || 5000;
    document.getElementById("agentLumaraPollingRate").value = localsettings.agentLumaraPollingRate || 0;
    document.getElementById("agentLumaraPollingRatenumeric").value = localsettings.agentLumaraPollingRate || 0;
    document.getElementById("disableSaveCompressionLocally").checked = localsettings.disableSaveCompressionLocally;
    document.getElementById("enableRunningMemory").checked = localsettings.enableRunningMemory;
    document.getElementById("worldTreePrune").checked = localsettings.worldTreePrune;
    document.getElementById("worldTreeDepth").value = localsettings.worldTreeDepth;
    document.getElementById("worldTreeShowAll").checked = localsettings.worldTreeShowAll;
    document.getElementById("useNewEditor").checked = localsettings.useNewEditor;
    document.getElementById("legacySaveMechanisms").checked = localsettings.legacySaveMechanisms;
    document.getElementById("showContextUsageChart").checked = localsettings.showContextUsageChart;
    document.getElementById("fullScreenEditorForInputs").checked = localsettings.fullScreenEditorForInputs;
    document.getElementById("corpoHideLeftPanel").checked = localsettings.corpoHideLeftPanel;
    document.getElementById("agentSavedMacros").value = JSON.stringify(localsettings?.agentSavedMacros || window.eso.agentMacros, null, 2)
    renderEsoboldAgentTools()
}

updateLegacySaveButtonState = () => {
    let legacySaveButtons = [...document.querySelectorAll("#topbtn_save_load, #topbtn_server_saves, #topbtn_scenarios")]
    if (localsettings.legacySaveMechanisms) {
        legacySaveButtons.forEach(elem => elem.classList.remove("hidden"));
    }
    else {
        legacySaveButtons.forEach(elem => elem.classList.add("hidden"));
    }
}

confirm_settings = () => {
    localsettings.agentBehaviour = (document.getElementById("agentBehaviour").checked ? true : false);
    localsettings.agentHideCOT = (document.getElementById("agentHideCOT").checked ? true : false);
    localsettings.agentStopOnRequestForInput = (document.getElementById("agentStopOnRequestForInput").checked ? true : false);
    localsettings.agentReplanOnError = (document.getElementById("agentReplanOnError").checked ? true : false);
    localsettings.agentCOTMax = document.getElementById("agentCOTMax").value;
    localsettings.agentAutoContinueMode = `${document.getElementById("agentAutoContinue").value || "auto"}`;
    localsettings.agentAutoContinue = localsettings.agentAutoContinueMode === "auto";
    localsettings.agentCOTRepeatsMax = document.getElementById("agentCOTRepeatsMax").value;
    localsettings.agentUseOAITools = (document.getElementById("agentUseOAITools").checked ? true : false);
    localsettings.agentSkipPlanningStep = (document.getElementById("agentSkipPlanningStep").checked ? true : false);
    localsettings.agentMaxActionsInHistory = document.getElementById("agentMaxActionsInHistory").value;
    localsettings.agentSkipPreviousCOTWhenProcessing = (document.getElementById("agentSkipPreviousCOTWhenProcessing").checked ? true : false);
    localsettings.agentStreamThinking = (document.getElementById("agentStreamThinking").checked ? true : false);
    localsettings.agentFsContentCharLimit = document.getElementById("agentFsContentCharLimit").value || 5000;
    localsettings.agentLumaraPollingRate = document.getElementById("agentLumaraPollingRate").value || 0;
    localsettings.disableSaveCompressionLocally = (document.getElementById("disableSaveCompressionLocally").checked ? true : false);
    localsettings.enableRunningMemory = (document.getElementById("enableRunningMemory").checked ? true : false);
    localsettings.worldTreePrune = (document.getElementById("worldTreePrune").checked ? true : false);
    localsettings.worldTreeDepth = document.getElementById("worldTreeDepth").value;
    localsettings.worldTreeShowAll = (document.getElementById("worldTreeShowAll").checked ? true : false);
    localsettings.useNewEditor = (document.getElementById("useNewEditor").checked ? true : false);
    localsettings.legacySaveMechanisms = (document.getElementById("legacySaveMechanisms").checked ? true : false);
    localsettings.showContextUsageChart = (document.getElementById("showContextUsageChart").checked ? true : false);
    localsettings.fullScreenEditorForInputs = (document.getElementById("fullScreenEditorForInputs").checked ? true : false);
    localsettings.corpoHideLeftPanel = (document.getElementById("corpoHideLeftPanel").checked ? true : false);
    try
    {
        localsettings.disabled_agent_tools = [...document.querySelectorAll("#esobold_agent_tools_list_container input[data-agent-tool-checkbox='true']")].filter(elem => !elem.checked).map(elem => elem.value)

        if (document.getElementById("agentSavedMacros").value === "")
        {
            localsettings.agentSavedMacros = JSON.parse(JSON.stringify(window.eso.agentMacros))
        }
        else
        {
            let obj = JSON.parse(document.getElementById("agentSavedMacros").value)
            localsettings.agentSavedMacros = obj;
        }

        updateEditorState();
        originalConfirmSettings();
        updateLegacySaveButtonState();
        if (window?.contextUsage?.renderContextUsage) {
            window.contextUsage.renderContextUsage();
        }
        
        window.setupLumaraPolling();
    }
    catch (e)
    {
        console.log(e)
        handleError(e)
    }
}

window.addEventListener('load', () => {
    if (localsettings?.agentBehaviour == undefined) {
        localsettings.agentBehaviour = false
    }
    if (localsettings?.agentHideCOT == undefined) {
        localsettings.agentHideCOT = true
    }
    if (localsettings?.agentStopOnRequestForInput == undefined) {
        localsettings.agentStopOnRequestForInput = true
    }
    if (localsettings?.agentReplanOnError == undefined) {
        localsettings.agentReplanOnError = true
    }
    if (localsettings?.agentCOTMax == undefined) {
        localsettings.agentCOTMax = 5
    }
    if (localsettings?.agentCOTRepeatsMax == undefined) {
        localsettings.agentCOTRepeatsMax = 1
    }
    if (localsettings?.agentAutoContinueMode == undefined) {
        if (typeof localsettings?.agentAutoContinue === "boolean") {
            localsettings.agentAutoContinueMode = localsettings.agentAutoContinue ? "auto" : "prompt"
        }
        else {
            localsettings.agentAutoContinueMode = "disabled"
        }
    }
    if (localsettings?.agentAutoContinue == undefined) {
        localsettings.agentAutoContinue = localsettings.agentAutoContinueMode === "auto"
    }
    if (localsettings?.agentUseOAITools == undefined) {
        localsettings.agentUseOAITools = false
    }
    if (localsettings?.agentSkipPlanningStep == undefined) {
        localsettings.agentSkipPlanningStep = false
    }
    if (localsettings?.agentMaxActionsInHistory == undefined) {
        localsettings.agentMaxActionsInHistory = 30
    }
    if (localsettings?.agentSkipPreviousCOTWhenProcessing == undefined) {
        localsettings.agentSkipPreviousCOTWhenProcessing = false
    }
    if (localsettings?.agentStreamThinking == undefined) {
        localsettings.agentStreamThinking = true
    }
    if (localsettings?.agentFsContentCharLimit == undefined) {
        localsettings.agentFsContentCharLimit = 5000
    }
    if (localsettings?.disableSaveCompressionLocally == undefined) {
        localsettings.disableSaveCompressionLocally = true
    }
    if (localsettings?.enableRunningMemory == undefined) {
        localsettings.enableRunningMemory = false
    }
    if (localsettings?.worldTreePrune == undefined) {
        localsettings.worldTreePrune = false
    }
    if (localsettings?.worldTreeDepth == undefined) {
        localsettings.worldTreeDepth = 2
    }
    if (localsettings?.worldTreeShowAll == undefined) {
        localsettings.worldTreeShowAll = false
    }
    if (localsettings?.useNewEditor == undefined) {
        localsettings.useNewEditor = true
    }
    if (localsettings?.fullScreenEditorForInputs == undefined) {
        localsettings.fullScreenEditorForInputs = true
    }
    if (localsettings?.legacySaveMechanisms == undefined) {
        localsettings.legacySaveMechanisms = false
    }
    if (localsettings?.showContextUsageChart == undefined) {
        localsettings.showContextUsageChart = true
    }
    if (localsettings?.customThemeColours == undefined) {
        localsettings.customThemeColours = {}
    }
    if (localsettings?.corpoHideLeftPanel == undefined) {
        localsettings.corpoHideLeftPanel = false
    }
    if (localsettings?.agentSavedMacros == undefined) {
        localsettings.agentSavedMacros = window.eso.agentMacros
    }
    if (!Array.isArray(localsettings?.disabled_agent_tools)) {
        localsettings.disabled_agent_tools = []
    }
    if (localsettings?.lastMessageProcessedFromLumara == undefined) {
        localsettings.lastMessageProcessedFromLumara = 0
    }

    // Overwrite the switching to handle new dynamically added menus
    window.display_settings_tab = (tabIndex) => {
        let settingNav = document.querySelector("#settingscontainer .settingsnav"), settingBody = document.querySelector("#settingscontainer .settingsbody")
        
        settingNav.querySelectorAll("li").forEach(elem => {
            elem.classList.remove("active")
        })
        settingBody.querySelectorAll(".settingsmenu").forEach(elem => {
            elem.classList.add("hidden")
        })


        current_settings_tab_idx = tabIndex
        let sectionButton = document.querySelector(`#settingscontainer .settingsnav :nth-child(${tabIndex + 1})`), sectionBody = document.querySelector(`#${sectionButton.id.replace(/_tab$/, "")}`)
        sectionBody.classList.remove("hidden")
        sectionButton.classList.add("active")
    }

    let createNewSettingsSection = (id, buttonText = id) => {
        let settingNav = document.querySelector("#settingscontainer .settingsnav"), settingBody = document.querySelector("#settingscontainer .settingsbody")
        let sectionButton = document.createElement("li"), sectionBody = document.createElement("div")
        let sectionId = `settingsmenu${id}`

        let settingsBox = document.createElement("div")
        settingsBox.classList.add("settingitem", "wide")

        sectionBody.id = sectionId
        sectionBody.classList.add("settingsmenu", "hidden")
        sectionBody.onchange = sampler_setting_tweaked

        sectionBody.appendChild(settingsBox)
        settingBody.appendChild(sectionBody)

        sectionButton.id = `${sectionId}_tab`
        settingNav.appendChild(sectionButton)

        let sectionLink = document.createElement("a")
        sectionLink.innerText = buttonText
        sectionLink.title = buttonText
        let currentNumberOfTabs = settingNav.querySelectorAll("li").length
        sectionLink.onclick = () => display_settings_tab(currentNumberOfTabs - 1)
        sectionButton.appendChild(sectionLink)

        return { sectionButton, sectionBody, settingsBox }
    }

    let createNewSubSection = (sectonText, isFirst = false) => {
        let headerElem = document.createElement("h3")
        if (isFirst)
        {
            headerElem.style.marginTop = "4px"
        }
        headerElem.innerText = sectonText
        return headerElem
    }

    let createSettingElementText = (inputElemId, labelTitle, labelText, placeholder = "") => {
        let settingLabelElem = document.createElement("div")
        settingLabelElem.classList.add("settinglabel")
        let settingDiv = document.createElement("div")
        settingDiv.classList.add("justifyleft", "settingsmall")
        settingDiv.innerHTML = `${labelTitle} <span class="helpicon">?<span class="helptext">${labelText}</span></span>`
        
        let settingInput = document.createElement("input")
        settingInput.type = "text"
        settingInput.title = labelTitle
        settingInput.id = inputElemId
        settingInput.placeholder = placeholder
        settingInput.style = "margin:0px 0px 0px auto; width: unset;"

        settingLabelElem.append(settingDiv)
        settingLabelElem.append(settingInput)
        return settingLabelElem
    }

    let createSettingElementTextArea = (inputElemId, labelTitle, labelText, placeholder = "") => {
        let settingLabelElem = document.createElement("div")
        settingLabelElem.classList.add("settinglabel")
        let settingDiv = document.createElement("div")
        settingDiv.classList.add("justifyleft", "settingsmall")
        settingDiv.innerHTML = `${labelTitle} <span class="helpicon">?<span class="helptext">${labelText}</span></span>`

        let settingInput = document.createElement("textarea")
        settingInput.title = labelTitle
        settingInput.id = inputElemId
        settingInput.placeholder = placeholder
        settingInput.style = "margin:0px 0px 0px auto; width: unset;"

        settingLabelElem.append(settingDiv)
        settingLabelElem.append(settingInput)
        return settingLabelElem
    }

    let createSettingElemButton = (inputElemId, labelTitle, labelText, onClick) => {
        let settingLabelElem = document.createElement("div")
        settingLabelElem.classList.add("settinglabel")
        let settingDiv = document.createElement("div")
        settingDiv.classList.add("justifyleft", "settingsmall")
        settingDiv.innerHTML = `${labelTitle} <span class="helpicon">?<span class="helptext">${labelText}</span></span>`

        let settingInput = document.createElement("button")
        settingInput.type = "button"
        settingInput.classList.add("btn", "btn-primary")
        settingInput.style.cssText = `padding:2px 3px;
			margin-top:2px;
			font-size: var(--theme_font_size_medium);
			margin:0px 0px 0px auto;
			`
        settingInput.innerText = "Open"
        settingInput.onclick = onClick

        settingLabelElem.append(settingDiv)
        settingLabelElem.append(settingInput)
        return settingLabelElem
    }

    let createSettingElemBool = (inputElemId, labelTitle, labelText) => {
        let settingLabelElem = document.createElement("div")
        settingLabelElem.classList.add("settinglabel")
        let settingDiv = document.createElement("div")
        settingDiv.classList.add("justifyleft", "settingsmall")
        settingDiv.innerHTML = `${labelTitle} <span class="helpicon">?<span class="helptext">${labelText}</span></span>`
        let settingInput = document.createElement("input")
        settingInput.type = "checkbox"
        settingInput.title = labelTitle
        settingInput.id = inputElemId
        settingInput.style = "margin:0px 0px 0px auto;"

        settingLabelElem.append(settingDiv)
        settingLabelElem.append(settingInput)
        return settingLabelElem
    }

    let createSettingElemSelect = (inputElemId, labelTitle, labelText, options = []) => {
        let settingLabelElem = document.createElement("div")
        settingLabelElem.classList.add("settinglabel")
        let settingDiv = document.createElement("div")
        settingDiv.classList.add("justifyleft", "settingsmall")
        settingDiv.innerHTML = `${labelTitle} <span class="helpicon">?<span class="helptext">${labelText}</span></span>`

        let settingInput = document.createElement("select")
        settingInput.title = labelTitle
        settingInput.id = inputElemId
        settingInput.style = "margin:0px 0px 0px auto; width: unset;"
        settingInput.classList.add("form-control")

        options.forEach(option => {
            let optionElem = document.createElement("option")
            optionElem.value = option.value
            optionElem.innerText = option.label
            settingInput.append(optionElem)
        })

        settingLabelElem.append(settingDiv)
        settingLabelElem.append(settingInput)
        return settingLabelElem
    }

    let createSettingElemRange = (inputElemId, labelTitle, labelText, min, max, step, value) => {
        let settingLabelElem = document.createElement("div")
        settingLabelElem.classList.add("settinglabel")
        let settingDiv = document.createElement("div")
        settingDiv.classList.add("justifyleft", "settingsmall")
        settingDiv.innerHTML = `${labelTitle} <span class="helpicon">?<span class="helptext">${labelText}</span></span>`

        let settingInputNumeric = document.createElement("input")
        settingInputNumeric.type = "numeric"
        settingInputNumeric.min = min
        settingInputNumeric.max = max
        settingInputNumeric.step = step
        settingInputNumeric.value = value
        settingInputNumeric.title = labelTitle
        settingInputNumeric.id = `${inputElemId}numeric`
        settingInputNumeric.classList.add("justifyright", "flex-push-right", "settingsmall", "widerinput")
        settingInputNumeric.style = "margin:0px 0px 0px auto;"
        settingLabelElem.append(settingDiv)
        settingLabelElem.append(settingInputNumeric)

        let settingInput = document.createElement("input")
        settingInput.type = "range"
        settingInput.min = min
        settingInput.max = max
        settingInput.step = step
        settingInput.value = value
        settingInput.title = labelTitle
        settingInput.id = inputElemId
        settingInput.style = "margin:0px 0px 0px auto;"

        settingInputNumeric.oninput = () => {
            settingInput.value = settingInputNumeric.value;
        }

        settingInput.oninput = () => {
            settingInputNumeric.value = settingInput.value;
        }

        let inputDiv = document.createElement("div")
        inputDiv.append(settingInput)

        let minMaxDiv = document.createElement("div")
        minMaxDiv.classList.add("settingminmax")
        let minDiv = document.createElement("div")
        minDiv.classList.add("justifyleft")
        minDiv.innerText = min
        let maxDiv = document.createElement("div")
        maxDiv.classList.add("justifyright")
        maxDiv.innerText = max
        minMaxDiv.append(minDiv)
        minMaxDiv.append(maxDiv)

        let settingElem = document.createElement("div")
        settingElem.style.width = "100%"
        settingElem.classList.add("settingitem")
        settingElem.append(settingLabelElem)
        settingElem.append(inputDiv)
        settingElem.append(minMaxDiv)
        return settingElem
    }
    let lastSettingContainer = document.querySelector("#inject_chatnames_instruct").closest(".settinglabel")

    let agentElems = []
    agentElems.push(createNewSubSection("Esobold agent settings"))
    let settingLabelElem = createSettingElemBool("agentBehaviour", "Agent behaviour (experimental)", "Allows the AI to use multiple generations and certain tools to see if it can improve results.  This can include web search (if enabled), dice rolling, and formula evaluation.  This mode requires instruct start and end tags for all roles. Image and TTS only is enabled for local KCPP users.")
    settingLabelElem.onclick = () => {
        // if (document.getElementById("agentBehaviour").checked == true && document.getElementById("separate_end_tags").checked != true) {
        //     document.getElementById("separate_end_tags").click()
        // }
    }
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentHideCOT", "Hide agent COT", "Hides agent thinking steps (such as searches)")
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemRange("agentCOTMax", "Maximum agent actions per plan", "Defines the maximum number of actions the agent can plan ahead", 1, 20, 1, 10)
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentStopOnRequestForInput", "Can agent ask for input?", "Determines if the agent can ask the user for input while executing the plan")
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentReplanOnError", "Replan on command error", "When enabled, if an agent command fails due to invalid or missing input, the thinking loop automatically restarts instead of continuing with a failed step.")
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElementTextArea("agentSavedMacros", "Macros which can be used to trigger the agent with custom logic.", "Macros which can be used to trigger the agent with custom logic. Macros can be invoked by 'macroName::prompt'.")
    settingLabelElem.querySelector("#agentSavedMacros").classList.add("fullScreenTextEditNoAuto")
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemSelect("agentAutoContinue", "Agent continuation mode", "Choose what happens after a chain finishes and may still be incomplete. Automatic asks the AI if it should continue and runs again automatically. Prompt asks you before continuing. Disabled stops immediately without checking task completion.", [
        { value: "auto", label: "Continue automatically" },
        { value: "prompt", label: "Prompt before continuing" },
        { value: "disabled", label: "Disable continuing automatically" },
    ])
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentUseOAITools", "Use OpenAI tools for command selection", "When enabled, the agent uses the OpenAI-compatible /v1/chat/completions endpoint with tool calling to select commands, instead of grammar-constrained generation. Requires a KoboldCpp endpoint that supports the OpenAI tools API. The agent performs a planning step (using plan_actions as a tool) followed by executing each planned step.")
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentSkipPlanningStep", "Skip agent planning step", "When enabled, the agent skips the initial plan_actions step and selects commands directly each cycle. Explicit plans provided by macros still run normally.")
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemRange("agentMaxActionsInHistory", "Maximum actions in history", "Defines the maximum number of previous actions to load into the current context. This value should be higher than the 'Maximum agent actions per plan' option to maintain history.", 0, 50, 1, 30)
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentSkipPreviousCOTWhenProcessing", "Skip previous COT when processing history", "When enabled, hides previous chain of thought entries during history initialization, similar to 'Hide agent COT' but applied only when loading past actions.")
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentStreamThinking", "Stream agent thinking", "When enabled, shows the LLM output tokens as they are generated during each agent step, rather than waiting for the full response. For the standard mode this requires KoboldCpp SSE streaming support (v1.40+). For OAI tools mode, streaming is used automatically.")
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemRange("agentFsContentCharLimit", "FS content character limit", "Maximum file-content characters sent to agent context per file read via fs_content. If content is truncated, the response includes total file lines and characters.", 500, 100000, 100, 5000)
    agentElems.push(settingLabelElem)

    settingLabelElem = createSettingElemRange("agentLumaraPollingRate", "Lumara polling rate", "Defines the rate at which the agent polls Lumara for new messages (in seconds). Zero means no polling.", 0, 1000, 1, 0)
    agentElems.push(settingLabelElem)

    // Hidden as this is no longer is in use for now
    settingLabelElem = createSettingElemRange("agentCOTRepeatsMax", "Maximum repeated agent actions of a type", "Defines the maximum number of actions the agent can take of the same type without a user input", 1, 20, 1, 1)
    settingLabelElem.style.display = "none"
    agentElems.push(settingLabelElem)

    agentSection = createNewSettingsSection("esoboldAgent", "Agent")
    agentElems.forEach(elem => {
        agentSection.settingsBox.appendChild(elem)
    })

    lastSettingContainer = document.querySelector("#settingsmenuadvanced > .settingitem")
    let toolsSettingsBox = document.querySelector("#settingsmenutools > .settingitem")

    let { settingsBox } = createNewSettingsSection("esobold", "Esobold")

    settingsBox.appendChild(createNewSubSection("World tree settings"))

    settingLabelElem = createSettingElemBool("worldTreePrune", "Prune branches on world tree", "Prune branches on world tree to make it easier to navigate.")
    settingsBox.append(settingLabelElem)

    settingLabelElem = createSettingElemRange("worldTreeDepth", "World tree branch depth", "Depth of each branch to display when not showing the entire world tree.", 1, 5, 1, 2)
    settingsBox.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("worldTreeShowAll", "Show all world tree content", "Shows all branches and nodes on the world tree - only use if saves are small")
    settingsBox.append(settingLabelElem)

    settingsBox.appendChild(createNewSubSection("Save settings"))

    settingLabelElem = createSettingElemBool("disableSaveCompressionLocally", "Disables save compression locally", "Disables save compression locally - Improves load / autosave performance with larger saves. The save compression is left enabled for sharing saves or uploading to the main server)")
    settingsBox.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("enableRunningMemory", "Enable running memory", "Enables running memory, an experimental version of autogenerating memory which triggers every time the context length changes by half its maximum. The summaries it generates can be found under world info.")
    settingsBox.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("legacySaveMechanisms", "Save options (legacy)", "Shows buttons for saving to slots and server using the non-data manager UI (legacy)")
    settingsBox.append(settingLabelElem)

    settingsBox.appendChild(createNewSubSection("Misc settings"))

    settingLabelElem = createSettingElemButton("libraryMods", "Mods", "Open the third-party mods manager to browse and apply community mods.", () => modManager.showModListWarning())
    settingsBox.append(settingLabelElem)

    toolsSettingsBox.appendChild(createNewSubSection("Esobold Agent Tools"))

    let esoboldAgentToolsDescription = document.createElement("div")
    esoboldAgentToolsDescription.classList.add("settingsdesctxt")
    esoboldAgentToolsDescription.innerText = "Untick tools here to hard-block them from agent usage even if they would otherwise be enabled or have overrides."
    toolsSettingsBox.append(esoboldAgentToolsDescription)

    let esoboldAgentToolsContainer = document.createElement("div")
    esoboldAgentToolsContainer.id = "esobold_agent_tools_list_container"
    esoboldAgentToolsContainer.classList.add("tools_list_container")
    toolsSettingsBox.append(esoboldAgentToolsContainer)

    settingsBox = document.querySelector("#settingsmenuappearance > .settingitem")
    settingsBox.appendChild(createNewSubSection("Esobold theme settings"))
    settingLabelElem = createSettingElemButton("customThemeColours", "Modify theme colours", "Allows modification of the colours used in the default theme", showThemePopup)
    settingsBox.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("showContextUsageChart", "Show context usage chart", "Shows a compact context usage bar next to the connection status. Click it to open a detailed usage popup.")
    settingsBox.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("corpoHideLeftPanel", "Left panel in Corpo Theme starts minimised", "If this option is enabled, the left panel in Corpo gets minimised automatically.")
    settingsBox.append(settingLabelElem)

    settingsBox.appendChild(createNewSubSection("Editor settings", false))

    settingLabelElem = createSettingElemBool("useNewEditor", "Use new editor", "Uses the new editor (including a WYSIWYG and markdown view) - has issues with HTML tags and may break")
    settingsBox.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("fullScreenEditorForInputs", "Full screen editor for inputs", "Adds buttons to open a full screen editor for inputs (experimental)")
    settingsBox.append(settingLabelElem)

    createStopThinkingButton()
})

window.eso.afterKoboldCppVersionCheck = async () => {
    function injectOpenLumaraButton() {
        const container = document.getElementById('addmediacontainer');
        if (!container || container.querySelector('#btn_open_openlumara')) {
            return;
        }

        const anchor = container.querySelector('.nspopup.flexsizevsmall.high') || container.querySelector('.nspopup');
        if (!anchor) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'menutext';
        wrapper.id = 'btn_open_openlumara';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary bg_purple';
        button.textContent = 'Launch OpenLumara UI';
        button.onclick = function () {
            try {
                if (typeof hide_popups === 'function') {
                    hide_popups();
                }
            } catch (_) {}
            window.open('/openlumara/', '_blank', 'noopener');
        };

        wrapper.appendChild(button);

        const reference = container.querySelector('#btn_open_fsui') || container.querySelector('#btn_open_lcppui');
        if (reference && reference.parentElement) {
            reference.insertAdjacentElement('afterend', wrapper);
        } else {
            anchor.appendChild(wrapper);
        }
    }
    
    if (is_using_kcpp_with_open_lumara()) {
        localsettings.agentLumaraPollingRate = localsettings?.agentLumaraPollingRate || 0
        injectOpenLumaraButton();
    }
    else {
        localsettings.agentLumaraPollingRate = 0
    }
    window.setupLumaraPolling();
}

let previousRestartNewGameLumara = restart_new_game, previousLoadSelectedFileLumara = load_selected_file
restart_new_game = (save = true, keep_memory = false) => {
    previousRestartNewGameLumara(save, keep_memory)
    localsettings.lastMessageProcessedFromLumara = 0
}

load_selected_file = (file) => {
    previousLoadSelectedFileLumara(file)
    localsettings.lastMessageProcessedFromLumara = 0
}