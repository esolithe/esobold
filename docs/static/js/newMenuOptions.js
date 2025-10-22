

let originalDisplaySettings = display_settings, originalConfirmSettings = confirm_settings;

display_settings = () => {
    originalDisplaySettings()
    document.getElementById("agentBehaviour").checked = localsettings.agentBehaviour;
    document.getElementById("agentHideCOT").checked = localsettings.agentHideCOT;
    document.getElementById("agentStopOnRequestForInput").checked = localsettings.agentStopOnRequestForInput;
    document.getElementById("agentCOTMax").value = localsettings.agentCOTMax;
    document.getElementById("agentCOTMaxnumeric").value = localsettings.agentCOTMax;
    document.getElementById("agentCOTRepeatsMax").value = localsettings.agentCOTRepeatsMax;
    document.getElementById("agentCOTRepeatsMaxnumeric").value = localsettings.agentCOTRepeatsMax;
    document.getElementById("disableSaveCompressionLocally").checked = localsettings.disableSaveCompressionLocally;
    document.getElementById("enableRunningMemory").checked = localsettings.enableRunningMemory;
    document.getElementById("worldTreePrune").checked = localsettings.worldTreePrune;
    document.getElementById("worldTreeDepth").value = localsettings.worldTreeDepth;
    document.getElementById("worldTreeShowAll").checked = localsettings.worldTreeShowAll;
    document.getElementById("useNewEditor").checked = localsettings.useNewEditor;
    document.getElementById("legacySaveMechanisms").checked = localsettings.legacySaveMechanisms;
    document.getElementById("fullScreenEditorForInputs").checked = localsettings.fullScreenEditorForInputs;
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
    localsettings.agentCOTRepeatsMax = document.getElementById("agentCOTRepeatsMax").value;
    localsettings.disableSaveCompressionLocally = (document.getElementById("disableSaveCompressionLocally").checked ? true : false);
    localsettings.enableRunningMemory = (document.getElementById("enableRunningMemory").checked ? true : false);
    localsettings.worldTreePrune = (document.getElementById("worldTreePrune").checked ? true : false);
    localsettings.worldTreeDepth = document.getElementById("worldTreeDepth").value;
    localsettings.worldTreeShowAll = (document.getElementById("worldTreeShowAll").checked ? true : false);
    localsettings.useNewEditor = (document.getElementById("useNewEditor").checked ? true : false);
    localsettings.legacySaveMechanisms = (document.getElementById("legacySaveMechanisms").checked ? true : false);
    localsettings.fullScreenEditorForInputs = (document.getElementById("fullScreenEditorForInputs").checked ? true : false);
    updateEditorState();
    originalConfirmSettings();
    updateLegacySaveButtonState();
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
    if (localsettings?.customThemeColours == undefined) {
        localsettings.customThemeColours = {}
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
    let lastSettingContainer = document.querySelector("#settingsmenuformat > .settingitem:last-child")

    let settingLabelElem = createSettingElemBool("agentBehaviour", "Agent behaviour (experimental)", "Allows the AI to use multiple generations and certain tools to see if it can improve results.  This can include web search (if enabled), dice rolling, and formula evaluation.  This mode requires instruct start and end tags for all roles. Image and TTS only is enabled for local KCPP users.")
    settingLabelElem.onclick = () => {
        if (document.getElementById("agentBehaviour").checked == true && document.getElementById("separate_end_tags").checked != true) {
            document.getElementById("separate_end_tags").click()
        }
    }
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentHideCOT", "Hide agent COT (experimental)", "Hides agent thinking steps (such as searches)")
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemRange("agentCOTMax", "Maximum agent actions", "Defines the maximum number of actions the agent can take without a user input", 1, 20, 1, 5)
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("agentStopOnRequestForInput", "Stop on request for input from agent", "Stops the current agent processing if it asks for user input")
    lastSettingContainer.append(settingLabelElem)

    // Hidden as this is no longer is in use for now
    settingLabelElem = createSettingElemRange("agentCOTRepeatsMax", "Maximum repeated agent actions of a type", "Defines the maximum number of actions the agent can take of the same type without a user input", 1, 20, 1, 1)
    settingLabelElem.style.display = "none"
    lastSettingContainer.append(settingLabelElem)

    lastSettingContainer = document.querySelector("#settingsmenuadvanced > .settingitem:nth-last-child(-n+2)")
    settingLabelElem = createSettingElemBool("disableSaveCompressionLocally", "Disables save compression locally", "Disables save compression locally - Improves load / autosave performance with larger saves. The save compression is left enabled for sharing saves or uploading to the main server)")
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("enableRunningMemory", "Enable running memory", "Enables running memory, an experimental version of autogenerating memory which triggers every time the context length changes by half its maximum. The summaries it generates can be found under world info.")
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("worldTreePrune", "Prune branches on world tree", "Prune branches on world tree to make it easier to navigate.")
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemRange("worldTreeDepth", "World tree branch depth", "Depth of each branch to display when not showing the entire world tree.", 1, 5, 1, 2)
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("worldTreeShowAll", "Show all world tree content", "Shows all branches and nodes on the world tree - only use if saves are small")
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("useNewEditor", "Use new editor", "Uses the new editor (including a WYSIWYG and markdown view) - has issues with HTML tags and may break")
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("fullScreenEditorForInputs", "Full screen editor for inputs", "Adds buttons to open a full screen editor for inputs (experimental)")
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemBool("legacySaveMechanisms", "Save options (legacy)", "Shows buttons for saving to slots and server using the non-data manager UI (legacy)")
    lastSettingContainer.append(settingLabelElem)

    settingLabelElem = createSettingElemButton("customThemeColours", "Modify theme colours", "Allows modification of the colours used in the default theme", showThemePopup)
    lastSettingContainer.append(settingLabelElem)

    createStopThinkingButton()
})