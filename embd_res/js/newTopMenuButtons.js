window.addEventListener('load', () => {
    let topButton = `<li class="nav-item" id="topbtn_remote_mods">
				<a class="nav-link mainnav" href="#" onclick="closeTopNav(); modManager.showModListWarning();" tabindex="0">Third party mods</a>
			</li>`
    topButton += `<li class="nav-item" id="topbtn_server_saves">
			<a class="nav-link mainnav" href="#" onclick="closeTopNav(); showServerSavesPopup();" tabindex="0">Server saves</a>
		</li>`
    topButton += `<li class="nav-item" id="topbtn_data_manager">
			<a class="nav-link mainnav" href="#" onclick="closeTopNav(); showCharacterList();" tabindex="0">Data</a>
		</li>`

    document.querySelector("#navbarNavDropdown > ul").innerHTML += topButton;
    treeViewer.showOpenButton();
    updateLegacySaveButtonState();
})