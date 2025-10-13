class PopupUtils {
    popupElem
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

    reset() {
        this.popupElem.classList.add("hidden");
        this.titleElem.innerText = "";
        this.contentElem.innerHTML = "";
        this.buttonsElem.innerHTML = "";
        return this;
    }

    show() {
        this.popupElem.classList.remove("hidden")
        return this;
    }

    title(title) {
        this.titleElem.innerText = title
        return this;
    }

    content(elem) {
        this.contentElem.appendChild(elem)
        return this;
    }

    button(text, onClick) {
        this.buttonsElem.appendChild(this._createButtonForPopup(text, onClick))
        return this;
    }
}

window.addEventListener("load", () => {
    window.popupUtils = new PopupUtils()
})
