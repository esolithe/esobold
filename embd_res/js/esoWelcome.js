render_regular_welcome = () => {
    let welcomeHTML = ""
    
    if (perfdata == null) {
        if (document.getElementById("connectstatus").innerHTML == "Offline Mode") {
            welcomeHTML = "Welcome to <span class=\"color_kobotext\">Eso Lite</span>!<br>You are in <span class=\"color_kobotext\">Offline Mode</span>.<br>You will still be able to load and edit stories, but not generate new text."
        } else {
            welcomeHTML = "Welcome to <span class=\"color_kobotext\">Eso Lite</span>!<br><span class=\"color_kobotext\">Attempting to Connect...</span>"
        }
    } else {
        let whorun = "";

        if (custom_kobold_endpoint != "") {
            whorun = "<br>You're using the custom KoboldAI endpoint at <span class=\"color_kobotext\">" + custom_kobold_endpoint + "</span>";
        }
        else if (custom_oai_key != "") {
            whorun = "<br>You're using the OpenAI API";
        }
        else if (custom_claude_key != "") {
            whorun = "<br>You're using the Claude API";
        }
        else if (custom_cohere_key != "") {
            whorun = "<br>You're using the Cohere API";
        }
        else {
            whorun = `<br>Horde <a class="color_kobotext mainnav" href="#" tabindex="${mainmenu_is_untab ? `-1` : `0`}" onclick="get_and_show_workers()">Volunteer(s)</a> are running <span class="color_kobotext">${selected_models.reduce((s, a) => s + a.count, 0)} threads</span> for selected models with a total queue length of <span class="color_kobotext">${selected_models.reduce((s, a) => s + a.queued, 0)}</span> tokens`;
        }
        let nowmode = (localsettings.opmode == 1 ? "Story Mode" : (localsettings.opmode == 2 ? "Adventure Mode" : (localsettings.opmode == 3 ? "Chat Mode" : "Instruct Mode")));
        let selmodelstr = "";
        const maxmodelnames = 7;
        if (selected_models.length > maxmodelnames) {
            let shortenedarr = selected_models.slice(0, maxmodelnames - 1);
            selmodelstr = shortenedarr.reduce((s, a) => s + (s == "" ? "" : ", ") + a.name, "") + " and " + (selected_models.length - (maxmodelnames - 1)) + " others";
        } else {
            selmodelstr = selected_models.reduce((s, a) => s + (s == "" ? "" : ", ") + a.name, "");
        }

        welcomeHTML = `<div><img class="esobold" /></div>` +
            `Welcome to <span class="color_kobotext">Eso Lite</span>!` +
            `<br>You are using the models <span class="color_kobotext">${selmodelstr}</span>${(selected_workers.length == 0 ? `` : ` (Pinned to ${selected_workers.length} worker IDs)`)}.` +
            `${whorun}.` +
            (multiplayer_active ? (!multiplayer_pinged ? `<br><br><span class="color_kobotext">[ Trying to join Multiplayer... ]</span>` : `<br><br><span class="color_kobotext">[ Multiplayer is <b>Active</b>! This session is shared with other server participants.]<br>[ You can leave via exit button in top right corner. ]</span>`) : (is_using_kcpp_with_multiplayer() ? `<br><br>[ <a href="#" tabindex="${mainmenu_is_untab ? `-1` : `0`}" class="color_kobotext mainnav" onclick="join_multiplayer()"><span class="color_kobotext">Multiplayer Available</span> - Click Here To Join</a> ]` : ``)) +
            `<br><br><span class="color_kobotext bolded">${nowmode} Selected</span> - Enter a prompt below to begin!` +
            `<br>Or, <a href="#" tabindex="${mainmenu_is_untab ? `-1` : `0`}" class="color_kobotext mainnav" onclick="document.getElementById('loadfileinput').click()">load a <b>JSON File</b> or a <b>Character Card</b> here.</a>` +
            `<br>Or, <a href="#" tabindex="${mainmenu_is_untab ? `-1` : `0`}" class="color_kobotext mainnav" onclick="display_scenarios()">select a <b>Quick Start Scenario</b> here.</a>` +
            `<br>${(welcome != "" ? `<br><em>${escape_html(welcome)}</em>` : ``)}`;
    }

    //kick out of edit mode
    if (document.getElementById("allowediting").checked) {
        document.getElementById("allowediting").checked = inEditMode = false;
        toggle_editable();
    }
    return welcomeHTML
}