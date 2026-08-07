class PopupUtils {
    popupElem
    popupBackdropElem
    popupInternalDiv
    titleBarElem
    titleElem
    contentElem
    buttonsElem
    useMobileMenu = false
    useBackdrop = true
    useDraggableWindow = false
    useResizableWindow = false
    _isDragBound = false
    _resizeObserver = null
    _onTitleMouseDown = null
    _needsInitialFloatingPosition = true
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
        this.popupBackdropElem = popupElem.querySelector(".popupbg")
        this.popupInternalDiv = popupElem.querySelector(".nspopup")
        this.titleBarElem = popupElem.querySelector(".popuptitlebar")
        this.titleElem = popupElem.querySelector(".popuptitletext")
        this.contentElem = popupElem.querySelector(".popupContent")
        this.buttonsElem = popupElem.querySelector(".popupfooter")
    }

    constructor() {
       this.createPopup()
    }

    _getPopupDimensions() {
        if (!this.popupInternalDiv) {
            return { width: 1, height: 1 }
        }
        let rect = this.popupInternalDiv.getBoundingClientRect()
        let width = Math.max(1, Math.round(rect.width || this.popupInternalDiv.offsetWidth || 1))
        let height = Math.max(1, Math.round(rect.height || this.popupInternalDiv.offsetHeight || 1))
        return { width, height }
    }

    _centerPopupInViewport() {
        if (!this.popupInternalDiv) {
            return
        }
        let viewportWidth = Math.max(1, window.innerWidth || 1)
        let viewportHeight = Math.max(1, window.innerHeight || 1)
        let { width, height } = this._getPopupDimensions()
        let centeredLeft = Math.max(0, Math.floor((viewportWidth - width) / 2))
        let centeredTop = Math.max(0, Math.floor((viewportHeight - height) / 2))
        this.popupInternalDiv.style.left = `${centeredLeft}px`
        this.popupInternalDiv.style.top = `${centeredTop}px`
    }

    _applyBackdropMode() {
        if (!this.popupBackdropElem) {
            return
        }
        if (this.useBackdrop) {
            this.popupBackdropElem.style.display = ""
            this.popupBackdropElem.style.pointerEvents = "auto"
            this.popupBackdropElem.style.visibility = "visible"
        }
        else {
            this.popupBackdropElem.style.display = "none"
            this.popupBackdropElem.style.pointerEvents = "none"
            this.popupBackdropElem.style.visibility = "hidden"
        }
    }

    _ensurePopupWithinViewport() {
        if (!this.popupInternalDiv) {
            return
        }
        if (!this.useDraggableWindow && !this.useResizableWindow) {
            return
        }

        let viewportWidth = Math.max(1, window.innerWidth || 1)
        let viewportHeight = Math.max(1, window.innerHeight || 1)
        let { width: popupWidth, height: popupHeight } = this._getPopupDimensions()
        let maxLeft = Math.max(0, viewportWidth - popupWidth)
        let maxTop = Math.max(0, viewportHeight - popupHeight)
        let currentLeft = parseInt(this.popupInternalDiv.style.left || "0", 10) || 0
        let currentTop = parseInt(this.popupInternalDiv.style.top || "0", 10) || 0
        let clampedLeft = Math.max(0, Math.min(currentLeft, maxLeft))
        let clampedTop = Math.max(0, Math.min(currentTop, maxTop))
        this.popupInternalDiv.style.left = `${clampedLeft}px`
        this.popupInternalDiv.style.top = `${clampedTop}px`
    }

    _applyWindowInteractionMode() {
        if (!this.popupInternalDiv || !this.titleBarElem) {
            return
        }

        let useFloatingWindow = this.useDraggableWindow || this.useResizableWindow
        let popupIsHidden = !!this.popupElem?.classList.contains("hidden")
        if (useFloatingWindow) {
            this.popupInternalDiv.style.position = "fixed"
            this.popupInternalDiv.style.margin = "0"
            if (!popupIsHidden) {
                if (this._needsInitialFloatingPosition) {
                    this._centerPopupInViewport()
                    this._needsInitialFloatingPosition = false
                }
                this._ensurePopupWithinViewport()
            }
        }
        else {
            this.popupInternalDiv.style.position = ""
            this.popupInternalDiv.style.left = ""
            this.popupInternalDiv.style.top = ""
            this.popupInternalDiv.style.margin = ""
            this._needsInitialFloatingPosition = true
        }

        if (this.useResizableWindow) {
            this.popupInternalDiv.style.resize = "both"
            this.popupInternalDiv.style.overflow = "hidden"
            this.popupInternalDiv.style.minWidth = "180px"
            this.popupInternalDiv.style.minHeight = "140px"
        }
        else {
            this.popupInternalDiv.style.resize = ""
            this.popupInternalDiv.style.overflow = ""
        }

        this.titleBarElem.style.cursor = this.useDraggableWindow ? "move" : ""

        if (this.useDraggableWindow && !this._isDragBound) {
            this._onTitleMouseDown = (e) => {
                if (e.target.closest("button")) return
                e.preventDefault()
                let startX = e.clientX - this.popupInternalDiv.offsetLeft
                let startY = e.clientY - this.popupInternalDiv.offsetTop
                let onMouseMove = (me) => {
                    let { width: popupWidth, height: popupHeight } = this._getPopupDimensions()
                    let maxLeft = Math.max(0, window.innerWidth - popupWidth)
                    let maxTop = Math.max(0, window.innerHeight - popupHeight)
                    let newLeft = Math.max(0, Math.min(me.clientX - startX, maxLeft))
                    let newTop = Math.max(0, Math.min(me.clientY - startY, maxTop))
                    this.popupInternalDiv.style.left = `${newLeft}px`
                    this.popupInternalDiv.style.top = `${newTop}px`
                    this._needsInitialFloatingPosition = false
                }
                let onMouseUp = () => {
                    document.removeEventListener("mousemove", onMouseMove)
                    document.removeEventListener("mouseup", onMouseUp)
                }
                document.addEventListener("mousemove", onMouseMove)
                document.addEventListener("mouseup", onMouseUp)
            }
            this.titleBarElem.addEventListener("mousedown", this._onTitleMouseDown)
            this._isDragBound = true
        }
        if (!this.useDraggableWindow && this._isDragBound && this._onTitleMouseDown) {
            this.titleBarElem.removeEventListener("mousedown", this._onTitleMouseDown)
            this._isDragBound = false
            this._onTitleMouseDown = null
        }

        if (!!window.ResizeObserver) {
            if (!this._resizeObserver && useFloatingWindow) {
                this._resizeObserver = new ResizeObserver(() => {
                    if (this.useMobileMenu) {
                        this.autoSize()
                    }
                    this._ensurePopupWithinViewport()
                })
                this._resizeObserver.observe(this.popupInternalDiv)
            }
            if (this._resizeObserver && !useFloatingWindow) {
                this._resizeObserver.disconnect()
                this._resizeObserver = null
            }
        }
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
        this.useBackdrop = true
        this.useDraggableWindow = false
        this.useResizableWindow = false
        this._needsInitialFloatingPosition = true
        if (this._resizeObserver) {
            this._resizeObserver.disconnect()
            this._resizeObserver = null
        }
        this._isDragBound = false
        this._onTitleMouseDown = null
        document.getElementById("popupContainer")?.remove()
        this.createPopup()
        this.popupElem.classList.add("hidden")
        return this;
    }

    show() {
        this.popupElem.classList.remove("hidden")
        this._applyBackdropMode()
        this._applyWindowInteractionMode()

        if (!this.useMobileMenu)
        {
            this.popupElem.classList.remove("mobileMenu", "expanded")
            this.buttonsElem.style.height = ""
            this.contentElem.style.height = ""
        }
        
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
        this._ensurePopupWithinViewport()
        this.autoSize()
        return this;
    }

    autoSize() {
        if (document.body.offsetWidth > 800)
        {
            this.popupElem.classList.remove("expanded")
        }
        if (!this.useMobileMenu)
        {
            // Outside mobile-menu mode, leave sizing to CSS/content flow.
            this.buttonsElem.style.height = "";
            this.contentElem.style.height = "";
            return
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
        if (!this.useMobileMenu)
        {
            this.popupElem?.classList.remove("mobileMenu", "expanded")
            if (this.buttonsElem) this.buttonsElem.style.height = ""
            if (this.contentElem) this.contentElem.style.height = ""
        }
        return this;
    }

    backdrop(enabled = true) {
        this.useBackdrop = !!enabled
        this._applyBackdropMode()
        return this;
    }

    setDraggableWindow(useDraggableWindow) {
        this.useDraggableWindow = !!useDraggableWindow
        this._applyWindowInteractionMode()
        return this;
    }

    setResizableWindow(useResizableWindow) {
        this.useResizableWindow = !!useResizableWindow
        this._applyWindowInteractionMode()
        return this;
    }

    modal() {
        this.setDraggableWindow(true)
        this.setResizableWindow(true)
        this.backdrop(false)
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
                .setDraggableWindow(true)
                .setResizableWindow(true)
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