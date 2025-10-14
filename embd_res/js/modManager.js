let msgboxYesNoOriginal = msgboxYesNo
msgboxYesNo = (text, title, onYes, onNo, isHtml = false, checkboxText = "", dynamicSizing = false) => {
    msgboxYesNoOriginal(text, title, onYes, onNo, isHtml, checkboxText)
    if (dynamicSizing) {
        document.querySelector("#yesnocontainer .nspopup").classList.remove("flexsizevsmall")
    }
    else {
        document.querySelector("#yesnocontainer .nspopup").classList.add("flexsizevsmall")
    }
}

// Mod manager
class ModManager {
    async getModList() {
        let modList = await indexeddb_load("modList")
        return modList !== undefined ? JSON.parse(modList) : this.refreshModList()
    }

    async refreshModList() {
        let resp = await fetch("https://raw.githubusercontent.com/esolithe/esobold/refs/heads/remoteManagement/modList.json")
        let modList = await resp.json()
        modList.forEach(mod => mod.enabled = false)
        await indexeddb_save("modList", JSON.stringify(modList))
        return modList
    }

    async getModContent(modId) {
        let modList = await this.getModList()
        let modData = modList.filter(mod => mod.id === modId)
        if (modData.length === 0) {
            return "";
        }
        if (!!modData[0]?.content) {
            return modData[0].content
        }
        let resp = await fetch(modData[0].url)
        let modContent = await resp.text()
        modData[0].content = modContent
        await indexeddb_save("modList", JSON.stringify(modList))
        return modData[0].content
    }

    async enableModList(mods) {
        // Apply mods
        let modList = await this.getModList()
        let userMods = ""
        for (let i = 0; i < mods.length; i++) {
            userMods += await this.getModContent(mods[i]) + "\n"
        }
        modList.forEach(modData => modData.enabled = mods.includes(modData.id))

        await indexeddb_save("modList", JSON.stringify(modList));
        await indexeddb_save("savedusermod", userMods);
        await indexeddb_save("usermodprops", JSON.stringify({ "persist": true }));
        if (userMods != "" && userMods.trim() != "") {
            // var userModScript = new Function(userMods);
            // userModScript();
            window.location.reload();
        }
    }

    showModListWarning(forceRefresh = false) {
        let warningText = "Warning: Clicking yes here will pull down the latest list of available mods for Kobold Lite. This requires an internet connection.";
        msgboxYesNo(warningText, "Retrieve mods from remote list", () => {
            this.showModList()
        })
    }

    async showModList(forceRefresh = false) {
        let modList = forceRefresh ? await this.refreshModList() : await this.getModList();
        let gs = ``;
        if (modList.length > 0) {
            gs = `Here, you can apply remote third-party mod scripts shared by other users.<br><br>`
                + `<span class='color_red'>Caution: These mods will have full access to your story and API keys, so only run third-party mods that you trust!<br><br>`
                + `Mods will always be applied every time you restart for ease of use. If a startup mod breaks KoboldAI Lite, add ?resetmod=1 to the url to uninstall it.</span><br><br>`
                + `Please select the mods you wish to enable.`
                + `<br>`
                + `<table id="modSelection" style="width:90%; margin:8px auto;">`
                + `<th>Mod ID</th><th>Mod name</th><th>Conflicts</th><th>Enabled</th>`;
            for (let i = 0; i < modList.length; ++i) {
                gs += `<tr class="modRow"><td><span class="modIdentifier" style="vertical-align: middle;">` + modList[i].id + `</span></td>`
                    + `<td><span class="modName" style="vertical-align: middle;">` + modList[i].name + `</span></td>`
                    + `<td><span style="vertical-align: middle;">` + (!!modList[i]?.conflicts ? modList[i].conflicts.join(", ") : "") + `</span></td>`
                    + `<td width='24px'><input type="checkbox" id="groupselectitem_` + i + `" style=" vertical-align: top;" ` + (!!modList[i]?.enabled ? "checked" : "") + `></td></tr>`;
            }
            gs += `</table>`;
            gs += `<button class="btn btn-primary" onclick="modManager.showModList(true)" style="margin-bottom: 10px;">Click here to force refresh the mod list (and pull down the latest copies of the mods) - this clears your currently enabled mods</button>`;
        }
        else {
            gs = `No mods are available.`
        }

        // gs += `<br><a href='#' class='color_blueurl' onclick='impersonate_user()'>Make the AI write a response as me (for 1 turn)</a>`;
        msgboxYesNo(gs, "Available remote mods", async () => {
            let modsSelected = [...document.querySelectorAll("#modSelection tr.modRow")].filter(modRow => !!modRow.querySelector("input").checked).map(modRow => modRow.querySelector(".modIdentifier").textContent)
            let validationErrors = []
            modsSelected.forEach(mod => {
                let modData = modList.filter(modObj => modObj.id === mod)[0]
                if (!!modData?.conflicts) {
                    modData.conflicts.forEach(conflict => {
                        if (modsSelected.includes(conflict)) {
                            let conflictName = modList.filter(modObj => modObj.id === conflict)[0].name
                            validationErrors.push(`${modData.name} conflicts with ${conflictName}`)
                        }
                    })
                }
            })

            if (validationErrors.length > 0) {
                msgbox(validationErrors.join("\n"), "Errors when applying mods", false, false, () => this.showModList())
            }
            else {
                msgboxYesNo("Are you sure you wish to use these mods? The page will reload after the mods have been applied.", "Confirm mods", () => {
                    this.enableModList(modsSelected)
                })
            }
        }, () => {
            // Nothing done when it is cancelled
        }, true, "", true)
    }
}

window.modManager = new ModManager();