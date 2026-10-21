/*
 * Guide: a tabbed help window with short chapters (top bar "Guide"). Native feature parts come first;
 * mods add their own tabs with GuideExtension (see modHooks.js).
 * Native chapter content lives in js/docs/*.js, loaded after this renderer in klite.embd.
 *
 * Chapter: { id, title, blocks: [...], show: [{ label, run(ctx) }] }
 * Blocks:  { p: "text" }                           paragraph
 *          { list: ["text", ...] }                 bullet list
 *          { tip: "text" }                         highlighted hint
 *          { table: [["head", "head"], [...]] }    table, first row is the header
 * All text is inserted as text, never as HTML.
 *
 * "Show me" actions get ctx:
 *   ctx.highlight(target, note)  hides the guide, rings the element (selector, element or function returning one) and
 *                                shows the note; the guide comes back when the note ends (click, Escape, a few seconds)
 *   ctx.run(fn)                  closes the guide, then runs fn (for actions that open another dialog)
 *   ctx.openSettings(tabId)      closes the guide and opens the settings dialog on a tab (e.g. "general", "esobold")
 *   ctx.navLink(text)            returns a function finding the top bar link with this text (for highlight)
 *
 * window.eso.guide.open(tabId, chapterId) opens the guide, optionally on a tab / chapter.
 */
const ESO_GUIDE_PARTS = {
    gettingStarted: { id: "getting-started", label: "Getting started", chapters: [] },
    library: { id: "library", label: "Library & saves", chapters: [] },
    context: { id: "context", label: "Context & memory", chapters: [] },
    writing: { id: "writing", label: "Writing & story tree", chapters: [] },
    agents: { id: "agents", label: "Agents & automation", chapters: [] },
    media: { id: "media", label: "Media", chapters: [] },
    development: { id: "development", label: "Files & development", chapters: [] },
    integrations: { id: "integrations", label: "Connections & extensions", chapters: [] },
    settings: { id: "settings", label: "Settings & administration", chapters: [] },
}

class EsoGuide {
    storageKey = "esoGuidePosition"
    containerId = "esoGuideContainer"
    position = { tab: "getting-started", chapters: {} }
    spotlight = null
    hiddenForSpotlight = false

    constructor() {
        try {
            let saved = JSON.parse(localStorage.getItem(this.storageKey) || "null")
            if (saved && typeof saved === "object") {
                this.position = { tab: `${saved.tab || "getting-started"}`, chapters: saved.chapters || {} }
            }
        }
        catch (e) {
            // storage unavailable or corrupt: start at the beginning
        }
    }

    getTabs() {
        let tabs = Object.values(ESO_GUIDE_PARTS)
        window.eso.extensions.getByType(EsoExtensionType.GUIDE).forEach(ext => {
            tabs.push({ id: ext.getId(), label: ext.getLabel(), chapters: ext.getChapters() })
        })
        return tabs.filter(tab => tab.chapters.length > 0)
    }

    resolveTab(tabs) {
        let tab = tabs.find(curr => curr.id === this.position.tab)
        if (!tab) {
            let previousTab = this.position.tab
            let chapterId = this.position.chapters[previousTab]
            tab = tabs.find(curr => curr.chapters.some(chapter => chapter.id === chapterId)) || tabs[0]
            if (tab.chapters.some(chapter => chapter.id === chapterId)) {
                this.position.chapters[tab.id] = chapterId
            }
            delete this.position.chapters[previousTab]
            this.position.tab = tab.id
            this.savePosition()
        }
        return tab
    }

    savePosition() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.position))
        }
        catch (e) {
            // not remembered, the guide still works
        }
    }

    isOpen() {
        return !!document.getElementById(this.containerId)
    }

    open(tabId = null, chapterId = null) {
        this.clearHighlight()
        let tabs = this.getTabs()
        let tab = this.resolveTab(tabs)
        if (tabId) {
            tab = tabs.find(curr => curr.id === tabId) || tab
        }
        if (chapterId && !tab.chapters.some(chapter => chapter.id === chapterId)) {
            tab = tabs.find(curr => curr.chapters.some(chapter => chapter.id === chapterId)) || tab
        }
        this.position.tab = tab.id
        if (chapterId) {
            this.position.chapters[tab.id] = chapterId
        }
        this.savePosition()
        this.render()
    }

    close() {
        this.clearHighlight()
        this.hiddenForSpotlight = false
        document.getElementById(this.containerId)?.remove()
    }

    render() {
        let tabs = this.getTabs()
        let tab = this.resolveTab(tabs)
        let chapterIndex = Math.max(0, tab.chapters.findIndex(curr => curr.id === this.position.chapters[tab.id]))
        let chapter = tab.chapters[chapterIndex]
        let goTo = (tabId, chapterId) => {
            this.position.tab = tabId
            if (chapterId) {
                this.position.chapters[tabId] = chapterId
            }
            this.savePosition()
            this.render()
        }

        let container = document.getElementById(this.containerId)
        if (!container) {
            container = document.createElement("div")
            container.id = this.containerId
            container.classList.add("popupcontainer", "flex")
            document.body.appendChild(container)
        }
        container.replaceChildren()

        let background = document.createElement("div")
        background.classList.add("popupbg", "flex")

        let popup = document.createElement("div")
        popup.classList.add("nspopup", "flexsizebig")
        popup.style.marginTop = "20px"

        let titleBar = document.createElement("div")
        titleBar.classList.add("popuptitlebar")
        let titleText = document.createElement("div")
        titleText.classList.add("popuptitletext")
        titleText.textContent = "Guide"
        titleBar.appendChild(titleText)

        let navWrap = document.createElement("div")
        let nav = document.createElement("ul")
        nav.classList.add("nav", "nav-tabs", "settingsnav")
        tabs.forEach(curr => {
            let item = document.createElement("li")
            if (curr.id === tab.id) {
                item.classList.add("active")
            }
            let link = document.createElement("a")
            link.href = "#"
            link.textContent = curr.label
            link.onclick = (e) => {
                e.preventDefault()
                goTo(curr.id)
            }
            item.appendChild(link)
            nav.appendChild(item)
        })
        navWrap.appendChild(nav)

        let body = document.createElement("div")
        body.classList.add("settingsbody", "esoGuideBody")

        let toc = document.createElement("nav")
        toc.classList.add("esoGuideToc")
        toc.setAttribute("aria-label", "Chapters")
        tab.chapters.forEach((curr, i) => {
            let button = document.createElement("button")
            button.type = "button"
            button.textContent = `${i + 1}. ${curr.title}`
            if (i === chapterIndex) {
                button.setAttribute("aria-current", "page")
            }
            button.onclick = () => goTo(tab.id, curr.id)
            toc.appendChild(button)
        })

        let article = document.createElement("article")
        article.classList.add("esoGuideArticle")
        let counter = document.createElement("div")
        counter.classList.add("esoGuideMuted")
        counter.textContent = `Chapter ${chapterIndex + 1} of ${tab.chapters.length}`
        let heading = document.createElement("h3")
        heading.textContent = chapter.title
        article.append(counter, heading)
        ;(chapter.blocks || []).forEach(block => {
            let elem = this.renderBlock(block)
            if (elem) {
                article.appendChild(elem)
            }
        })

        if (Array.isArray(chapter.show) && chapter.show.length > 0) {
            let showLabel = document.createElement("div")
            showLabel.classList.add("esoGuideMuted")
            showLabel.textContent = "Show me"
            let showRow = document.createElement("div")
            showRow.classList.add("esoGuideRow")
            chapter.show.forEach(action => {
                showRow.appendChild(this.createButton(action.label, () => {
                    try {
                        action.run(this.createContext())
                    }
                    catch (e) {
                        console.error(e)
                    }
                }))
            })
            article.append(showLabel, showRow)
        }

        let chapterNav = document.createElement("div")
        chapterNav.classList.add("esoGuideRow", "esoGuideChapterNav")
        let back = this.createButton("Back", () => goTo(tab.id, tab.chapters[chapterIndex - 1].id))
        back.disabled = chapterIndex === 0
        let spacer = document.createElement("span")
        spacer.style.flex = "1"
        let next = chapterIndex < tab.chapters.length - 1
            ? this.createButton(`Next: ${tab.chapters[chapterIndex + 1].title}`, () => goTo(tab.id, tab.chapters[chapterIndex + 1].id))
            : this.createButton("Done", () => this.close())
        chapterNav.append(back, spacer, next)
        article.appendChild(chapterNav)

        let layout = document.createElement("div")
        layout.classList.add("esoGuideLayout")
        layout.append(toc, article)
        body.appendChild(layout)

        let footer = document.createElement("div")
        footer.classList.add("popupfooter")
        footer.appendChild(this.createButton("Close", () => this.close()))

        popup.append(titleBar, navWrap, body, footer)
        container.append(background, popup)
        container.classList.toggle("hidden", this.hiddenForSpotlight)
        toc.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" })
    }

    renderBlock(block) {
        if (!block || typeof block !== "object") {
            return null
        }
        if (block.p !== undefined) {
            let elem = document.createElement("p")
            elem.textContent = `${block.p}`
            return elem
        }
        if (block.tip !== undefined) {
            let elem = document.createElement("div")
            elem.classList.add("esoGuideTip")
            elem.textContent = `${block.tip}`
            return elem
        }
        if (Array.isArray(block.list)) {
            let elem = document.createElement("ul")
            block.list.forEach(text => {
                let item = document.createElement("li")
                item.textContent = `${text}`
                elem.appendChild(item)
            })
            return elem
        }
        if (Array.isArray(block.table) && block.table.length > 0) {
            let elem = document.createElement("table")
            elem.classList.add("esoGuideTable")
            block.table.forEach((row, i) => {
                let rowElem = document.createElement("tr")
                ;(Array.isArray(row) ? row : [row]).forEach(cell => {
                    let cellElem = document.createElement(i === 0 ? "th" : "td")
                    cellElem.textContent = `${cell}`
                    rowElem.appendChild(cellElem)
                })
                elem.appendChild(rowElem)
            })
            return elem
        }
        return null
    }

    createButton(text, onClick) {
        let button = document.createElement("button")
        button.type = "button"
        button.classList.add("btn", "btn-primary")
        button.textContent = text
        button.onclick = onClick
        return button
    }

    createContext() {
        return {
            highlight: (target, note) => this.highlight(target, note),
            run: (fn) => {
                this.close()
                return fn()
            },
            openSettings: (tabId) => {
                this.close()
                display_settings()
                let tab = document.getElementById(`settingsmenu${tabId}_tab`)
                if (tab) {
                    display_settings_tab([...tab.parentElement.children].indexOf(tab))
                }
            },
            // Several top bar links can share a text (e.g. the hidden legacy "Quick Start"), so prefer a visible one
            navLink: (text) => () => {
                let links = [...document.querySelectorAll("#navbarNavDropdown a.nav-link")].filter(link => link.textContent.trim() === text)
                return links.find(link => link.getClientRects().length > 0) || links[0]
            },
        }
    }

    // Rings an element and shows a short note; the guide is hidden meanwhile and comes back afterwards
    highlight(target, note) {
        this.clearHighlight()
        let elem = null
        try {
            elem = typeof target === "function" ? target() : (typeof target === "string" ? document.querySelector(target) : target)
        }
        catch (e) {
            console.error(e)
        }
        let visible = !!elem && elem.getClientRects().length > 0

        if (this.isOpen()) {
            this.hiddenForSpotlight = true
            document.getElementById(this.containerId).classList.add("hidden")
        }

        let nodes = []
        let noteElem = document.createElement("div")
        noteElem.classList.add("esoGuideNote")
        noteElem.setAttribute("role", "status")
        noteElem.textContent = visible ? `${note || ""}` : "That part of the screen is hidden right now. On a small screen, open the menu first."
        if (visible) {
            elem.scrollIntoView({ block: "nearest", inline: "nearest" })
            let rect = elem.getBoundingClientRect(), pad = 6
            let ring = document.createElement("div")
            ring.classList.add("esoGuideRing")
            ring.style.left = `${Math.round(rect.left - pad)}px`
            ring.style.top = `${Math.round(rect.top - pad)}px`
            ring.style.width = `${Math.round(rect.width + pad * 2)}px`
            ring.style.height = `${Math.round(rect.height + pad * 2)}px`
            nodes.push(ring)
            let below = rect.bottom + 90 < window.innerHeight
            noteElem.style.left = `${Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - 300)))}px`
            noteElem.style.top = `${Math.round(below ? rect.bottom + pad + 8 : Math.max(8, rect.top - pad - 56))}px`
        }
        else {
            noteElem.style.left = "50%"
            noteElem.style.top = "40%"
            noteElem.style.transform = "translateX(-50%)"
        }
        nodes.push(noteElem)
        nodes.forEach(node => document.body.appendChild(node))

        let end = () => this.clearHighlight(true)
        let onKey = (e) => {
            if (e.key === "Escape") {
                end()
            }
        }
        this.spotlight = { nodes, onKey, onDown: end, timer: setTimeout(end, 6000) }
        document.addEventListener("keydown", onKey, true)
        // any click ends the highlight (registered after the click that started it)
        setTimeout(() => {
            if (this.spotlight?.onDown === end) {
                document.addEventListener("pointerdown", end, true)
            }
        }, 0)
        return visible
    }

    clearHighlight(restoreGuide = false) {
        if (this.spotlight) {
            clearTimeout(this.spotlight.timer)
            document.removeEventListener("keydown", this.spotlight.onKey, true)
            document.removeEventListener("pointerdown", this.spotlight.onDown, true)
            this.spotlight.nodes.forEach(node => node.remove())
            this.spotlight = null
        }
        if (restoreGuide && this.hiddenForSpotlight) {
            this.hiddenForSpotlight = false
            document.getElementById(this.containerId)?.classList.remove("hidden")
        }
    }
}

window.eso.guide = new EsoGuide()
