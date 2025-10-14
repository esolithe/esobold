class PopupUtils {
    popupElem
    popupInternalDiv
    titleBarElem
    titleElem
    contentElem
    buttonsElem
    constructor() {
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
        this.popupElem.classList.add("hidden");
        this.popupElem.querySelectorAll(".scrollToButtons").forEach(elem => elem.remove())
        this.titleElem.innerText = "";
        this.contentElem.innerHTML = "";
        this.buttonsElem.innerHTML = "";
        return this;
    }

    show() {
        this.popupElem.classList.remove("hidden")
        this.autoSize()
        return this;
    }

    autoSize() {
        this.contentElem.style.height = `${this.popupInternalDiv.offsetHeight - this.titleBarElem.offsetHeight - this.buttonsElem.offsetHeight}px`
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
}

window.addEventListener("load", () => {
    window.popupUtils = new PopupUtils()
})

let autoSizeDe = debounce(() => popupUtils.autoSize(), 100);

window.addEventListener("resize", () => {
    autoSizeDe()
})