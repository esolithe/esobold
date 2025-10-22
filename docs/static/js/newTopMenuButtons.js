window.addEventListener('load', () => {
    let topButton = `<li class="nav-item hidden" id="topbtn_remote_mods">
				<a class="nav-link mainnav" href="#" onclick="closeTopNav(); modManager.showModListWarning();" tabindex="0">Third party mods</a>
			</li>`
    topButton += `<li class="nav-item" id="topbtn_server_saves">
			<a class="nav-link mainnav" href="#" onclick="closeTopNav(); showServerSavesPopup();" tabindex="0">Server saves</a>
		</li>`
    topButton += `<li class="nav-item" id="topbtn_data_manager">
			<a class="nav-link mainnav" href="#" onclick="closeTopNav(); showCharacterList();" tabindex="0">Data</a>
            <span id="additionalSameOptions" class="hidden" style="position: absolute;">
                <a id="topbtn_save_current" class="nav-link mainnav" href="#" tabindex="0">Q.Save</a>
                <a id="topbtn_download_current" class="nav-link mainnav" href="#" tabindex="0">Download</a>
            </span>
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
})