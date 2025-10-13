class TreeViewer {
    getShowAllNodes() {
        return localsettings?.worldTreeShowAll !== undefined ? localsettings?.worldTreeShowAll : false
    }
    getMaxSeparation() {
        return localsettings?.worldTreeDepth !== undefined ? localsettings?.worldTreeDepth : 2
    }

    hideOpenButton() {
        if (document.getElementById("openTreeDiagram")) {
            document.getElementById("openTreeDiagram").remove()
        }
    }

    showOpenButton() {
        this.hideOpenButton()

        let openButton = document.createElement("span"), container = document.createElement("li");
        openButton.id = "openTreeDiagram"
        openButton.title = "World tree"
        openButton.onclick = () => {
            if (this.getShowAllNodes()) {
                this.openTreeView()
            }
            else {
                this.openPaginatedTreeView()
            }
        }
        openButton.style = `
				display: block;
				background-color: black;
				border-radius: 10px;
				height: 20px;
				width: 50px;
				text-align: center;
				background-image: var(--img_worldTree);
				height: 50px;
				background-size: contain;
				background-repeat: no-repeat;
				background-position: center;`

        container.classList.add("nav-item")
        container.appendChild(openButton)
        document.querySelector("#navbarNavDropdown > ul").appendChild(container)
    }

    closeTreeView() {
        if (document.getElementById("treeDiagram")) {
            document.getElementById("treeDiagram").remove()
        }
    }

    getGraphBody(treeToViewOutput = treeHandler.treeToView()) {
        return `---
config:
  theme: dark
---
flowchart TD\n${treeToViewOutput.outputText.trim()}`
    }

    askUserIfTheyWishToLoad(filteredParent, parts) {
        msgboxYesNo(`Do you wish to load from the tree?\n\nPosition: ${filteredParent.querySelector("p").innerText}`, "World tree loader", () => {
            treeHandler.switchToBranchFromSummary(parts[1])
            document.getElementById("treeCloseButton").click()
            if (!!window?.overwriteRawContents) {
                window.overwriteRawContents()
            }
        })
    }

    async openTreeView(graphBody = this.getGraphBody(), clickHandler = this.askUserIfTheyWishToLoad) {
        this.closeTreeView()
        this.hideOpenButton()

        let elem = document.createElement("pre")
        elem.classList.add("mermaid")
        elem.innerHTML = graphBody
        elem.style = `
				background-color: darkcyan;
				position: absolute;
				top: 0;
				height: 80%;
				width: 80%;
				margin: 10%;`

        let container = document.createElement("div")
        container.id = "treeDiagram"
        container.appendChild(elem)

        let closeButton = document.createElement("span")
        closeButton.id = "treeCloseButton"
        closeButton.innerText = "X"
        closeButton.onclick = () => {
            this.closeTreeView()
            this.showOpenButton()
        }
        closeButton.style = `
				position: absolute;
				top: 50%;
				left: 0%;
				color: red;
				background-color: black;
				border-radius: 10px;
				height: 20px;
				width: 50px;
				text-align: center`
        container.appendChild(closeButton)
        document.body.appendChild(container)

        // Example from https://stackoverflow.com/questions/78319916/how-do-i-pan-and-zoom-on-mermaid-output
        await mermaid.run({
            querySelector: '.mermaid',
            postRenderCallback: (id) => {
                const container = document.getElementById("treeDiagram");
                const svgElement = container.querySelector("svg");

                const scaleFactor = 50;
                // Initialize Panzoom
                const panzoomInstance = Panzoom(svgElement, {
                    minScale: 1 / scaleFactor,
                    maxScale: scaleFactor
                });

                // Add mouse wheel zoom
                container.addEventListener("wheel", (event) => {
                    panzoomInstance.zoomWithWheel(event);
                });

                let searchForParent = (elem, matcher, maxDepth = 5, depth = 0) => {
                    if (!!elem?.parentElement) {
                        let parent = elem.parentElement
                        if (matcher(parent)) {
                            return parent
                        }
                        else if (depth < maxDepth) {
                            return searchForParent(parent, matcher, maxDepth, depth + 1)
                        }
                    }
                    return null
                }

                document.getElementsByClassName("mermaid")[0].onclick = (e) => {
                    let target = e?.target
                    if (!!target) {
                        let filteredParent = searchForParent(target, (elem) => {
                            return !!elem?.id?.startsWith("flowchart-")
                        })
                        if (!!filteredParent) {
                            let parts = filteredParent.id.split("-")
                            if (parts.length > 2) {
                                clickHandler(filteredParent, parts)
                            }
                        }
                    }
                }
            }
        })
    }

    async openPaginatedTreeView(path = treeHandler.addTreeBranch(concat_gametext())) {
        if (Object.keys(treeHandler.tree).length !== 0) {
            let cleanedFinalKey = "0", startNode = treeHandler.getNodeFromTree(""), initialPath = []
            if (path.length > 0) {
                let lastKey = path.slice(-1)[0]
                cleanedFinalKey = treeHandler.convertToTreeKey(lastKey)
                let parentPath = path.slice(0, Math.max(0, path.length - this.getMaxSeparation() - 1))
                startNode = treeHandler.getNodeFromTree(parentPath)
                initialPath = parentPath
            }

            let treeDiagram = treeHandler.treeToView(startNode, 0, initialPath, this.getMaxSeparation() * 2)

            let paginatedViewHandler = (filteredParent, parts) => {
                if (filteredParent.classList.contains("active")) {
                    this.askUserIfTheyWishToLoad(filteredParent, parts)
                }
                else if (!!treeHandler.pathMap[parts[1]]) {
                    this.openPaginatedTreeView(treeHandler.pathMap[parts[1]])
                }
            }

            await this.openTreeView(this.getGraphBody(treeDiagram), paginatedViewHandler)

            // Highlight current element
            let currentElem = [...document.querySelectorAll(`g[id^="flowchart-"`)].filter(e => e.querySelector("p").innerText.trim() === cleanedFinalKey.trim())
            if (currentElem.length > 0) {
                currentElem.forEach(elem => elem.classList.add("active"))
                currentElem.forEach(elem => elem.querySelector("rect.label-container").style.fill = "purple")
            }
        }

    }
}

window.treeViewer = new TreeViewer()
treeViewer.showOpenButton()

let prepareSubmitGenerationRef = prepare_submit_generation, submitMultiplayerRef = submit_multiplayer
prepare_submit_generation = async () => {
    if (!!treeHandler.enabled) {
        treeHandler.addTreeBranch(concat_gametext())
        await prepareSubmitGenerationRef()
    }
    else {
        await prepareSubmitGenerationRef()
    }
}

submit_multiplayer = (fullUpdate) => {
    treeHandler.addTreeBranch(concat_gametext())
    submitMultiplayerRef(fullUpdate)
}

let lastPendingResponse = null, waitingForCompletion = false
setInterval(() => {
    if (waitingForCompletion && !pending_response_id) {
        treeHandler.addTreeBranch(concat_gametext())
        waitingForCompletion = false
    }
    else if (!!pending_response_id && !waitingForCompletion) {
        waitingForCompletion = true
    }
}, 1000)

mermaid.initialize({
    maxTextSize: 100000
});