class HFModelSearcher {
    async searchModelName(searchTerm) {
        let overallSearchTerm = `GGUF ${searchTerm}`, limit = 10, searchUrl = `https://huggingface.co/api/models?search=${encodeURIComponent(overallSearchTerm)}&limit=${limit};`;

        let modelResults = (await (await fetch(searchUrl)).json()).map(res => res?.id)
        return modelResults
    }

    async searchForQuantsFromModel(modelName) {
        if (!modelName) {
            return { quantResults: [], priorityQuantResult: null }
        }
        let quantUrl = `https://huggingface.co/api/models/${modelName}/tree/main?recursive=true`

        let quantResults = (await (await fetch(quantUrl)).json())?.filter(quant => !!quant?.path && quant.path.indexOf(".gguf") !== -1).map(quant => {
            let { path, size } = quant
            return { path, size }
        })

        let priorityQuantResult = null
        if (quantResults.length > 0) {
            priorityQuantResult = quantResults[0].path
            for (let qLevel in ["q4k", "q4_k", "q4", "q3", "q5", "q6", "q8"]) {
                let foundPriorityResult = quantResults.find(quant => quant.path.indexOf(qLevel) !== -1)
                if (!!foundPriorityResult) {
                    priorityQuantResult = foundPriorityResult.path
                    break
                }
            }
        }

        return { quantResults, priorityQuantResult }
    }

    getDirectURLForDownload(modelName, quantName) {
        return `https://huggingface.co/${modelName}/resolve/main/${quantName}`
    }
}

window.hfModelSearcher = new HFModelSearcher()

document.getElementById("adminmodelfromhf").onclick = () => {
    hide_popups()

    let adminHFPopupHTML = `<div class="menutext">
			<b></b>Warning: The model will be downloaded during the restart. This can make the restart take much longer than expected.<br>
			<div>
				<label for="adminhfmodelsearchinput" id="adminhfmodelsearchinputlabel">Model to search for:</label>
				<span style="display: flex;">
					<input title="Model to search for" style="padding:4px; padding: 4px; width: calc(100% - 80px);" class="form-control" id="adminhfmodelsearchinput" />
					<button type="button" style="flex: 1;" class="btn btn-primary" id="adminhfmodelsearch">Search</button>
				</span>
				<label for="adminhfmodelname" id="adminhfmodelnamelabel">Model name:</label>
				<select title="Select model to use" style="padding:4px;" class="form-control" id="adminhfmodelname"></select>
				<label for="adminhfquantname" id="adminhfquantnamelabel">Quant name:</label>
				<select title="Select quant to use" style="padding:4px;" class="form-control" id="adminhfquantname"></select>
			</div>
			<br>
		</div>
		<div class="popupfooter">
			<button type="button" style="width:auto;" class="btn btn-primary" onclick="trigger_admin_reload()">Download and reload KoboldCpp</button>
			<button type="button" class="btn btn-primary" onclick="hide_popups()">Cancel</button>
		</div>`
    msgbox(adminHFPopupHTML, "Search for model from HuggingFace to download and use", true, true)

    let selectForModel = document.getElementById("adminhfmodelname"), selectForQuant = document.getElementById("adminhfquantname");
    document.getElementById("adminhfmodelsearch").onclick = async () => {
        let searchTerm = document.getElementById("adminhfmodelsearchinput").value
        let modelResults = await hfModelSearcher.searchModelName(searchTerm);

        selectForModel.innerHTML = ""
        modelResults.forEach(modelResult => {
            selectForModel.appendChild(new Option(modelResult, modelResult))
        })
        selectForModel.onchange()
    }

    selectForModel.onchange = async () => {
        let modelName = selectForModel.value
        let { quantResults, priorityQuantResult } = await hfModelSearcher.searchForQuantsFromModel(modelName);

        selectForQuant.innerHTML = ""
        quantResults.forEach(quantResult => {
            selectForQuant.appendChild(new Option(`${quantResult.path}: ${Math.ceil(quantResult.size / 1024 / 1024)} MBs`, quantResult.path))
        })

        if (!!priorityQuantResult) {
            selectForQuant.value = priorityQuantResult
        }

        selectForQuant.onchange()
    }

    selectForQuant.onchange = () => {
        if (!!selectForQuant.value) {
            let urlToSet = hfModelSearcher.getDirectURLForDownload(selectForModel.value, selectForQuant.value)
            let modelDropdown = document.getElementById("adminmodeldropdown")
            modelDropdown.appendChild(new Option(urlToSet, urlToSet))
            modelDropdown.value = urlToSet
        }
    }
}