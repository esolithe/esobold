class PopupUtils {
    popupElem
    popupInternalDiv
    titleBarElem
    titleElem
    contentElem
    buttonsElem
    useMobileMenu = false
    createPopup() {
        let popupElem = document.createElement("div");
        popupElem.classList.add("popupcontainer", "flex", "hidden");
        popupElem.id = "popupContainer";
        popupElem.innerHTML = `<div class="popupbg flex"></div>
			<div class="nspopup higher">
				<div class="popuptitlebar">
					<div class="popuptitletext" id="popupTitle"></div>
				</div>
				<div class="popupContent">

				</div>
				<div class="popupfooter">
				</div>
			</div>`
        document.body.appendChild(popupElem)

        this.popupElem = document.getElementById("popupContainer")
        this.popupInternalDiv = popupElem.querySelector(".nspopup")
        this.titleBarElem = popupElem.querySelector(".popuptitlebar")
        this.titleElem = popupElem.querySelector(".popuptitletext")
        this.contentElem = popupElem.querySelector(".popupContent")
        this.buttonsElem = popupElem.querySelector(".popupfooter")
    }

    constructor() {
       this.createPopup()
    }

    _createButtonForPopup(text, onClick) {
        let button = document.createElement("button")
        button.type = "button"
        button.classList.add("btn", "btn-primary")
        button.innerText = text
        button.onclick = onClick
        return button
    }

    _createButtonGroupForPopup(name) {
        let container = document.createElement("div");
        container.classList.add("autoGrid", "buttonGroup")
        container.style.overflowX = "hidden"
        container.style.marginBottom = "10px"

        let buttonGroupText = document.createElement("span")
        buttonGroupText.textContent = name
        container.appendChild(buttonGroupText);
        return container
    }

    reset() {
        this.useMobileMenu = false
        document.getElementById("popupContainer")?.remove()
        this.createPopup()
        this.popupElem.classList.add("hidden")
        return this;
    }

    show() {
        this.popupElem.classList.remove("hidden")
        
        if (this.useMobileMenu)
        {
            this.popupElem.classList.add("mobileMenu")

            let navToggle = this._createButtonForPopup("", () => {
                this.popupElem.classList.toggle("expanded")
                this.autoSize()
            })
            navToggle.classList.add("navtoggler")
            let createLineForNav = () => {
                let span = document.createElement("span")
                span.classList.add("navbar-button-bar")
                return span
            }
            navToggle.append(createLineForNav(), createLineForNav(), createLineForNav())
            this.buttonsElem.append(navToggle)
        }
        this.autoSize()
        return this;
    }

    autoSize() {
        if (document.body.offsetWidth > 800)
        {
            this.popupElem.classList.remove("expanded")
        }
        if (this.useMobileMenu && this.popupElem.classList.contains("expanded"))
        {
            this.contentElem.style.height = "0px";
            this.buttonsElem.style.height = `${this.popupInternalDiv.offsetHeight - this.titleBarElem.offsetHeight}px`;
        }
        else 
        {
            this.buttonsElem.style.height = `unset`;
            this.contentElem.style.height = `${this.popupInternalDiv.offsetHeight - this.titleBarElem.offsetHeight - this.buttonsElem.offsetHeight}px`
        }
    }

    title(title) {
        this.titleElem.innerText = title
        return this;
    }

    content(elem) {
        this.contentElem.appendChild(elem)
        return this;
    }

    lastButtonGroup = null
    button(text, onClick) {
        (this.lastButtonGroup || this.buttonsElem).appendChild(this._createButtonForPopup(text, onClick))
        return this;
    }

    buttonGroup(groupName) {
        this.lastButtonGroup = this._createButtonGroupForPopup(groupName)
        this.buttonsElem.appendChild(this.lastButtonGroup)
        return this;
    }

    resetButtonGroup() {
        // Trick to dereference the last used HTML node
        this.lastButtonGroup = {};
        this.lastButtonGroup = null;
        return this;
    }

    css(param, value, target = this.popupInternalDiv) {
        target.style[param] = value
        return this;
    }

    enableJumpButtons() {
        let scrollDown = this._createButtonForPopup("Scroll to bottom", () => {
            this.contentElem.scrollTop = this.contentElem.scrollHeight
        }), scrollUp = this._createButtonForPopup("Scroll to top", () => {
            this.contentElem.scrollTop = 0
        });
        scrollDown.classList.add("scrollToButtons")
        scrollUp.classList.add("scrollToButtons")
        this.popupInternalDiv.prepend(scrollDown, scrollUp)
    }

    setMobileMenu(useMobileMenu) {
        this.useMobileMenu = useMobileMenu
        return this;
    }
}

window.addEventListener("load", () => {
    window.popupUtils = new PopupUtils()

    window.showCommandExecutionConfirmation = (title, message, content) => {
        if (!!localsettings?.tools_auto_exec) {
            return true
        }

        if (!window.popupUtils) {
            return new Promise(resolve => msgboxYesNo(`${message}\n\n${content}`, title, () => resolve(true), () => resolve(false)))
        }

        return new Promise(resolve => {
            let didResolve = false
            let finalize = (approved) => {
                if (didResolve) {
                    return
                }
                didResolve = true
                document.removeEventListener("keydown", onKeyDown)
                popupUtils.reset()
                resolve(approved)
            }

            let onKeyDown = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault()
                    finalize(false)
                }
            }

            let body = document.createElement("div")

            let info = document.createElement("div")
            info.classList.add("menutext")
            info.style.marginBottom = "10px"
            info.style.whiteSpace = "pre-wrap"
            info.innerText = `${message || "Please review this command before continuing."}`

            let commandContent = ""
            if (typeof content === "string") {
                commandContent = content
            }
            else {
                try {
                    commandContent = JSON.stringify(content, null, 2)
                }
                catch (e) {
                    commandContent = `${content}`
                }
            }

            let textArea = document.createElement("textarea")
            textArea.classList.add("form-control")
            textArea.readOnly = true
            textArea.spellcheck = false
            textArea.wrap = "off"
            textArea.value = commandContent
            textArea.style.width = "100%"
            textArea.style.minHeight = "220px"
            textArea.style.maxHeight = "60vh"
            textArea.style.overflow = "auto"
            textArea.style.resize = "vertical"
            textArea.style.fontFamily = "monospace"

            body.append(info, textArea)

            popupUtils.reset()
                .title(`${title || "Confirm action"}`)
                .content(body)
                .css("min-width", "min(900px, 95vw)")
                .button("Confirm", () => finalize(true))
                .button("Cancel", () => finalize(false))
                .show()

            document.addEventListener("keydown", onKeyDown)
            setTimeout(() => textArea.focus(), 0)
        })
    }
})

if (window?.debounce === undefined) {
    window.debounce = (func, delay) =>{
		let timeout, functionName = func?.prototype?.constructor?.name, debounceVar = `debounce_pending_${functionName || "generic"}`;;
		return function (...args) {
			window[debounceVar] = true
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				window[debounceVar] = false
				func.apply(this, args);
			}, delay);
		};
	}
}
let autoSizeDe = debounce(() => popupUtils.autoSize(), 50);

window.addEventListener("resize", () => {
    autoSizeDe()
})