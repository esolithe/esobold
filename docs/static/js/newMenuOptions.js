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
    let toolsHtml = `<table class="tools-table"><thead><tr><th>Tool</th><th>Allowed</th></tr></thead><tbody>`

    if (commands.length === 0) {
        toolsContainer.innerHTML = "<p>No Esobold agent tools are currently available.</p>"
        return
    }

    commands.forEach((command) => {
        let enabledStatus = command?.enabled ? "enabled" : "disabled"
        let description = command?.description ? command.description.substr(0, 180) : "No description"
        toolsHtml += `
            <tr>
                <td class="tools-info">
                    <div class="tool-title">${command.name} (${enabledStatus})</div>
                    <div class="tool-description">${description}</div>
                </td>
                <td class="tools-checkbox">
                    <input type="checkbox" id="agenttool_${command.name}" value="${command.name}" ${disabledTools.includes(command.name) ? "" : "checked"}/>
                </td>
            </tr>
        `
    })

    toolsHtml += `</tbody></table>`
    toolsContainer.innerHTML = toolsHtml
}

display_settings = () => {
    originalDisplaySettings()
    document.getElementById("agentBehaviour").checked = localsettings.agentBehaviour;
    document.getElementById("agentHideCOT").checked = localsettings.agentHideCOT;
    document.getElementById("agentStopOnRequestForInput").checked = localsettings.agentStopOnRequestForInput;
    document.getElementById("agentCOTMax").value = localsettings.agentCOTMax;
    document.getElementById("agentCOTMaxnumeric").value = localsettings.agentCOTMax;
    document.getElementById("agentAutoContinue").checked = localsettings.agentAutoContinue;
    document.getElementById("agentCOTRepeatsMax").value = localsettings.agentCOTRepeatsMax;
    document.getElementById("agentCOTRepeatsMaxnumeric").value = localsettings.agentCOTRepeatsMax;
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
    localsettings.agentCOTMax = document.getElementById("agentCOTMax").value;
    localsettings.agentAutoContinue = (document.getElementById("agentAutoContinue").checked ? true : false);
    localsettings.agentCOTRepeatsMax = document.getElementById("agentCOTRepeatsMax").value;
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
        localsettings.disabled_agent_tools = [...document.querySelectorAll("#esobold_agent_tools_list_container input[type='checkbox']")].filter(elem => !elem.checked).map(elem => elem.value)

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
    if (localsettings?.agentCOTMax == undefined) {
        localsettings.agentCOTMax = 5
    }
    if (localsettings?.agentCOTRepeatsMax == undefined) {
        localsettings.agentCOTRepeatsMax = 1
    }
    if (localsettings?.agentAutoContinue == undefined) {
        localsettings.agentAutoContinue = true
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
        localsettings.showContextUsageChart = false
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

    lastSettingContainer.before(createNewSubSection("Esobold agent mode settings"))
    let settingLabelElem = createSettingElemBool("agentBehaviour", "Agent behaviour (experimental)", "Allows the AI to use multiple generations and certain tools to see if it can improve results.  This can include web search (if enabled), dice rolling, and formula evaluation.  This mode requires instruct start and end tags for all roles. Image and TTS only is enabled for local KCPP users.")
    settingLabelElem.onclick = () => {
        // if (document.getElementById("agentBehaviour").checked == true && document.getElementById("separate_end_tags").checked != true) {
        //     document.getElementById("separate_end_tags").click()
        // }
    }
    lastSettingContainer.before(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentHideCOT", "Hide agent COT", "Hides agent thinking steps (such as searches)")
    lastSettingContainer.before(settingLabelElem)

    settingLabelElem = createSettingElemRange("agentCOTMax", "Maximum agent actions per plan", "Defines the maximum number of actions the agent can plan ahead", 1, 20, 1, 5)
    lastSettingContainer.before(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentStopOnRequestForInput", "Can agent ask for input?", "Determines if the agent can ask the user for input while executing the plan")
    lastSettingContainer.before(settingLabelElem)

    settingLabelElem = createSettingElementTextArea("agentSavedMacros", "Macros which can be used to trigger the agent with custom logic.", "Macros which can be used to trigger the agent with custom logic. Macros can be invoked by 'macroName::prompt'.")
    settingLabelElem.querySelector("#agentSavedMacros").classList.add("fullScreenTextEditNoAuto")
    lastSettingContainer.before(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentAutoContinue", "Agent continues until completion (experimental)", "After prompting the agent, the maximum amount of actions the agent can take within a single plan are based on the maximum agent actions. If this option is ticked, and the agent thinks the task is not complete it will automatically create a new plan and continue. If this option is unticked, the user will be prompted to decide how to proceed.")
    lastSettingContainer.before(settingLabelElem)

    // Hidden as this is no longer is in use for now
    settingLabelElem = createSettingElemRange("agentCOTRepeatsMax", "Maximum repeated agent actions of a type", "Defines the maximum number of actions the agent can take of the same type without a user input", 1, 20, 1, 1)
    settingLabelElem.style.display = "none"
    lastSettingContainer.before(settingLabelElem)

    lastSettingContainer.before(createNewSubSection("Chat name settings"))

    lastSettingContainer = document.querySelector("#settingsmenuadvanced > .settingitem")
    let toolsSettingsBox = document.querySelector("#settingsmenutools > .settingitem")

    let { settingsBox } = createNewSettingsSection("esobold", "Esobold")

    settingsBox.appendChild(createNewSubSection("Editor settings", true))

    settingLabelElem = createSettingElemBool("useNewEditor", "Use new editor", "Uses the new editor (including a WYSIWYG and markdown view) - has issues with HTML tags and may break")
    settingsBox.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("fullScreenEditorForInputs", "Full screen editor for inputs", "Adds buttons to open a full screen editor for inputs (experimental)")
    settingsBox.append(settingLabelElem)

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

    settingLabelElem = createSettingElemBool("showContextUsageChart", "Show context usage chart", "Shows a floating chart of context usage percentages in the top-right corner.")
    settingsBox.append(settingLabelElem)

    settingsBox.appendChild(createNewSubSection("Misc settings"))

    settingLabelElem = createSettingElemBool("corpoHideLeftPanel", "Left panel in Corpo Theme starts minimised", "If this option is enabled, the left panel in Corpo gets minimised automatically.")
    settingsBox.append(settingLabelElem)

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

    createStopThinkingButton()
})