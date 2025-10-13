
class WaitingToast {
    #waitingDiv
    #waitingText
    constructor() {
        this.waitingDiv = document.createElement("div")
        this.waitingDiv.classList.add("waitingToast", "hidden")

        let waitingIcon = document.createElement("div")
        waitingIcon.classList.add("imgloader", "waitingIcon")
        this.waitingDiv.appendChild(waitingIcon)

        this.waitingText = document.createElement("div")
        this.waitingText.classList.add("waitingToastText")
        this.waitingDiv.appendChild(this.waitingText)

        document.body.appendChild(this.waitingDiv)
    }

    show() {
        this.waitingDiv.classList.remove("hidden")
    }

    hide() {
        this.waitingDiv.classList.add("hidden")
    }

    setText(text) {
        this.waitingText.innerText = text
    }
}

window.waitingToast = new WaitingToast()

let originalTriggerAbortController = trigger_abort_controller

trigger_abort_controller = () => {
    waitingToast.hide()
    originalTriggerAbortController()
}