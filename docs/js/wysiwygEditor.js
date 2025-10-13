const renderGameTextRef = render_gametext, originalBack = btn_back, originalRedo = btn_redo, originalRetry = btn_retry, originalAddThought = addThought;

let enableNewEditor = () => {
    if (document.getElementById("gameEditor") !== null) {
        return
    }

    let gameEditor = document.createElement("div")
    gameEditor.id = "gameEditor"
    gameEditor.style = ""
    document.getElementById("gamescreen").appendChild(gameEditor)

    let gameText = document.getElementById("gametext")

    let markdownUpdate = (markdown) => {
        gameText.textContent = markdown // innerHTML
        merge_edit_field()
        rawTextEditor.innerHTML = gameText.innerHTML
    }
    let editor = new MarkdownWYSIWYG('gameEditor', {
        initialValue: "",
        onUpdate: markdownUpdate
    });

    let rawButton = document.createElement("button")
    rawButton.classList.add("md-tab-button")
    rawButton.innerText = "Raw text"
    gameEditor.querySelector(".md-tabs").prepend(rawButton)

    let mdCodeBlockAndThinkTagHandler = (html) => {
        return html
            .replaceAll(/(```)(?!<textarea>)(.*?)(```)|(`)(?!<textarea>)([^`]*?)(`)/gms, "$1$4<textarea>$2$5</textarea>$3$6")
            .replaceAll(/(?<!<textarea>)(<think>|<\/think>)/gms, "<textarea>$1</textarea>")
            .replaceAll(/<br>/g, "\n")
            .replaceAll(/<span class="txtchunk">(.*?)<\/span>/gms, "$1")
    }

    let htmlToMarkdown = (html) => {
        return editor._htmlToMarkdown(mdCodeBlockAndThinkTagHandler(html))
    }

    let setEditorValueFromHTML = (html) => {
        let markdown = htmlToMarkdown(html)
        if (document?.querySelector(".md-tab-button.active")?.innerText === "WYSIWYG") {
            markdown = markdown.replaceAll(/(<think>|<\/think>)/g, "\\$1")
        }
        editor.setValue(markdown)
    }

    let htmlUpdate = (html) => {
        gameText.textContent = htmlToMarkdown(html) // innerHTML
        merge_edit_field()
        setTimeout(() => setEditorValueFromHTML(gameText.innerHTML), 1)
    }

    let rawTextEditor = document.createElement("span")
    rawTextEditor.id = "rawTextEditor"
    rawTextEditor.contentEditable = true
    rawTextEditor.onclick = click_gametext
    rawTextEditor.onblur = () => {
        htmlUpdate(rawTextEditor.innerHTML)
    }
    rawTextEditor.addEventListener("paste", (e) => pasteEventHandler(e, rawTextEditor));

    let editorContentArea = document.querySelector(".md-editor-content-area")
    editorContentArea.prepend(rawTextEditor)

    let fixMobileSizing = () => {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        let portrait = true
        switch (screen?.orientation?.type) {
            case "landscape-primary":
            case "landscape-secondary":
                portrait = false
                break;
        }
    }

    let scrollToBottom = () => {
        let runFunctionOnAllChildren = (element, func) => {
            let nodes = [...element.childNodes]
            if (nodes.length === 0) {
                func(element)
            } else {
                nodes.forEach(elem => {
                    runFunctionOnAllChildren(elem, func)
                })
            }
        }

        let activeTab = document.querySelector(".md-tab-button.active")
        if (!!activeTab && activeTab.innerText === "Raw text") {
            let texts = [], rawTextElem = document.querySelector("#rawTextEditor")
        }
        fixMobileSizing()

        setTimeout(() => {
            // Scroll to latest message
            [...document.querySelectorAll("#rawTextEditor, .md-editable-area, .md-markdown-area")].forEach(elem => elem.scrollTo(0, elem.scrollHeight));
        }, 1)
    }

    document.querySelectorAll(".md-tab-button").forEach(elem => elem.addEventListener("mouseup", (elem) => {
        document.querySelectorAll(".md-tab-button").forEach(elem => {
            elem.classList.remove("active")
        })
        document.querySelectorAll("#rawTextEditor, .md-editable-area, .md-markdown-area").forEach(elem => elem.style.display = "none")

        elem.target.classList.add("active")

        let toolbarElem = document.getElementsByClassName("md-toolbar")[0];
        if (elem.target.innerText === "Raw text") {
            rawTextEditor.style.display = "block"
            toolbarElem.style.display = "none"
        }
        else if (elem.target.innerText === "WYSIWYG") {
            document.querySelectorAll(".md-editable-area").forEach(elem => elem.style.display = "block")
            toolbarElem.style.display = "flex"
            htmlUpdate(rawTextEditor.innerHTML)
        }
        else if (elem.target.innerText === "Markdown") {
            document.querySelectorAll(".md-markdown-area").forEach(elem => elem.style.display = "block")
            toolbarElem.style.display = "flex"
            htmlUpdate(rawTextEditor.innerHTML)
        }

        scrollToBottom()
    }))
    rawButton.dispatchEvent(new CustomEvent("mouseup", { target: rawButton }))

    render_gametext = (save, forceScroll) => {
        renderGameTextRef(save, forceScroll)
        let isEditable = gameText.contentEditable === "true"
        if (isEditable) {
            removeChoiceContainer()
        }
        if (gameEditor.style.display === "none") {
            rawTextEditor.innerHTML = gameText.innerHTML
            setTimeout(() => {
                setEditorValueFromHTML(rawTextEditor.innerHTML)
            }, 1)
        }
        gameEditor.style.display = !!isEditable ? "block" : "none"
        gameText.style.display = !!isEditable ? "none" : "block"
        scrollToBottom()
    }

    window.overwriteRawContents = async () => {
        rawTextEditor.innerHTML = gameText.innerHTML
        setEditorValueFromHTML(rawTextEditor.innerHTML)
        scrollToBottom()
    }

    btn_back = () => {
        originalBack()
        overwriteRawContents()
    }

    btn_redo = () => {
        originalRedo()
        overwriteRawContents()
    }

    btn_retry = () => {
        originalRetry()
        overwriteRawContents()
    }

    // Handler for agent
    addThought = (wrapperHandler, prompt, onlyDisplay, onlyAdd) => {
        originalAddThought(wrapperHandler, prompt, onlyDisplay, onlyAdd)
        if (gameText.contentEditable === "true") {
            overwriteRawContents()
        }
    }

    // Handler for language support
    let titleRemapper = (params) => {
        let { id, title } = params
        let elem = document.querySelector(`[data-button-id=${id}]`)
        if (!!elem) {
            elem.title = title
        }
    }

    let titlesToRemapToEN = [
        { id: 'h1', title: 'Heading 1' },
        { id: 'h2', title: 'Heading 2' },
        { id: 'h3', title: 'Heading 3' },
        { id: 'bold', title: 'Bold' },
        { id: 'italic', title: 'Italic' },
        { id: 'strikethrough', title: 'Strikethrough' },
        { id: 'link', title: 'Link' },
        { id: 'ul', title: 'Unordered list' },
        { id: 'ol', title: 'Ordered list' },
        { id: 'outdent', title: 'Outdent' },
        { id: 'indent', title: 'Indent' },
        { id: 'blockquote', title: 'Citation' },
        { id: 'hr', title: 'Horizontal rule' },
        { id: 'table', title: 'Insert table' },
        { id: 'codeblock', title: 'Insert code block' },
        { id: 'inlinecode', title: 'Insert inline code' }
    ]

    titlesToRemapToEN.forEach(titleRemapper)

    render_gametext()
}

let disableNewEditor = () => {
    if (document.getElementById("gameEditor") === null) {
        return
    }

    document.getElementById("gameEditor")?.remove()
    document.getElementById("gametext").style.display = "block"
    render_gametext = renderGameTextRef
    btn_back = originalBack
    btn_redo = originalRedo
    btn_retry = originalRetry
    addThought = originalAddThought
    window.overwriteRawContents = undefined
    render_gametext()
}


window.updateEditorState = () => {
    if (!!localsettings?.useNewEditor) {
        lastEditorState = true;
        enableNewEditor()
    }
    else {
        lastEditorState = false
        disableNewEditor()
    }
}

window.addEventListener('load', () => {
    setTimeout(updateEditorState, 1)
});

// updateEditorState();
// enableNewEditor()
// disableNewEditor()