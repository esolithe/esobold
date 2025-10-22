let addFullScreenEditorButtons = () => {
    let excludeTop = [
        "instruct_systag",
        "instruct_sysprompt",
        "instruct_starttag",
        "instruct_endtag",
        "websearch_template",
        "extrastopseq",
        "tokenbans",
        "start_thinking_tag",
        "stop_thinking_tag",
        "guidance_prompt",
        "anotetemplate",
        "inputboxcontainerinputarea",
        "negpromptinput",
        "voice_langcode",
        "instruct_systag_end",
        "instruct_starttag_end",
        "instruct_endtag_end",
        "newlogitbiasval",
        "remoteDataStorageUrl",
        "autosaveName"
    ];
    document.querySelectorAll("input:not([disabled]):not([type='numeric']):not([type='number']):not([type='button']):not([type='range']):not([inputmode='numeric']):not([inputmode='decimal']):not([type='file']):not([type='checkbox']):not([type='color']),textarea:not([disabled]):not([readonly])").forEach(c => {
        // Disable for char creator
        if (c.closest(".characterCreatorGrid") !== null || c.id === "scenariosearch" || c.classList.contains("fullScreenTextEditExclude")) {
            return;
        }
        if (c.checkVisibility()) {
            if (!c.classList.contains("fullScreenEditContent") && !c.classList.contains("fullScreenTextEdit")) {
                // c.style.border = "solid red";
                e = document.createElement("span");
                c.classList.add("fullScreenTextEdit")
                e.classList.add("fullScreenTextEditButton")
                e.onclick = () => {
                    let content = document.createElement("textarea");
                    content.classList.add("fullScreenEditContent");
                    content.value = replaceAll(c.value, "\\n", "\n");
                    content.style.height = "70vh"
                    content.style.width = "70vw"
                    content.style.resize = "none"
                    popupUtils.reset()
                        .title("Fullscreen text edit")
                        .content(content)
                        .button("Ok", () => {
                            c.value = content.value;
                            popupUtils.reset();
                        }).show();
                }
                c.after(e);

                e.style.cssText = `float: right;
					color: white;
					background-image: var(--img_corpo_edit);
					background-size: contain;
					background-repeat: no-repeat;
					height: 20px;
					width: 20px;
					z-index: 2;
					margin-right: 10px;
					${!!c?.id && excludeTop.includes(c.id) ? "" : "margin-top: -20px;"}
					position: relative;`;
                /*
                margin-right: 10px; 
                margin-top: -20px*/
            }
            else {
                if (c?.nextSibling?.classList?.contains("fullScreenTextEditButton")) {
                    c.nextSibling.classList.remove("hidden")
                }
            }
        }
        else {
            if (c?.nextSibling?.classList?.contains("fullScreenTextEditButton")) {
                c.nextSibling.classList.add("hidden")
            }
        }
    })
}

setInterval(() => {
    if (!!localsettings?.fullScreenEditorForInputs) {
        addFullScreenEditorButtons();
    }
    else {
        document.querySelectorAll(".fullScreenTextEditButton").forEach(c => c.remove())
    }
}, 5000)