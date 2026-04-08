window.addEventListener('load', () => {
    let topButton = `<li class="nav-item hidden" id="topbtn_remote_mods">
				<a class="nav-link mainnav" href="#" onclick="closeTopNav(); modManager.showModListWarning();" tabindex="0">Third party mods</a>
			</li>`
    topButton += `<li class="nav-item" id="topbtn_server_saves">
			<a class="nav-link mainnav" href="#" onclick="closeTopNav(); showServerSavesPopup();" tabindex="0">Server saves</a>
		</li>`
    topButton += `<li class="nav-item" id="topbtn_data_manager">
			<a class="nav-link mainnav" href="#" onclick="closeTopNav(); showCharacterList(undefined, true);" tabindex="0">Library</a>
            <span id="additionalSameOptions" class="hidden" style="position: absolute;">
                <a id="topbtn_save_current" class="nav-link mainnav" href="#" tabindex="0">Q.Save</a>
                <a id="topbtn_download_current" class="nav-link mainnav" href="#" tabindex="0">Download</a>
                <a id="topbtn_load_new" class="nav-link mainnav" href="#" tabindex="0">Load</a>
                <a id="topbtn_new_character" class="nav-link mainnav" href="#" tabindex="0">New Character</a>
                <a id="topbtn_share" class="nav-link mainnav" href="#" tabindex="0">Share</a>
            </span>
		</li>`
    topButton += `<li class="nav-item" id="topbtn_quick_start">
			<a class="nav-link mainnav" href="#" onclick="closeTopNav(); showQuickStartPopup();" tabindex="0">Quick Start</a>
		</li>`

    document.querySelector("#navbarNavDropdown > ul").innerHTML += topButton;
    treeViewer.showOpenButton();
    updateLegacySaveButtonState();

    let dataElem = document.querySelector("#topbtn_data_manager")
    dataElem.addEventListener("mouseenter", () => {
        document.querySelector("#additionalSameOptions").classList.remove("hidden")
    })
    dataElem.addEventListener("mouseleave", () => {
        document.querySelector("#additionalSameOptions").classList.add("hidden")
    })

    document.querySelector("#topbtn_save_current").addEventListener("click", () => {
        inputBox("Enter a Filename", "Save File", "", "Input Filename", () => {
            let userinput = getInputBoxValue();
            if (userinput != null && userinput.trim() != "") {
                waitingToast.show()
                waitingToast.setText(`Saving data ${userinput}`)
                let data = generate_savefile(true, true, true);
                saveKLiteSaveToIndexDB(userinput, data);
            }
        }, false);
    })

    document.querySelector("#topbtn_download_current").addEventListener("click", () => {
        save_file_button()
    })

    document.querySelector("#topbtn_load_new").addEventListener("click", () => {
        load_file_button()
    })

    document.querySelector("#topbtn_new_character").addEventListener("click", () => {
        try { showCharacterCreator(); } catch (e) { console.error(e); }
    })

    document.querySelector("#topbtn_share").addEventListener("click", () => {
        share_story_button()
    })
})