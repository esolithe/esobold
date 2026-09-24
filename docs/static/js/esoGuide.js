/*
 * Guide: a tabbed help window with short chapters (top bar "Guide"). Esobold's chapters are the first tab;
 * mods add their own tabs with GuideExtension (see modHooks.js).
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
let ESO_GUIDE_CHAPTERS = [
    {
        id: "welcome", title: "Welcome to Eso Lite",
        blocks: [
            { p: "Eso Lite is Esobold's version of KoboldAI Lite: a browser app for writing stories, chatting and working with an AI. It adds a Library, Quick Start, a world tree of your story's branches, agent mode and more." },
            { p: "The chapters are short. Read them in order the first time; the \"Show me\" buttons point at the part of the screen being explained." },
            { tip: "You can come back at any time with Guide in the top bar. Mods can add their own tabs to this window." },
        ],
        show: [
            { label: "Where is the Guide?", run: (ctx) => ctx.highlight("#topbtn_guide", "Opens this guide") },
        ],
    },
    {
        id: "connect", title: "Connect an AI",
        blocks: [
            { p: "Eso Lite does not run a model itself; it talks to one. Use AI in the top bar to choose where the AI runs:" },
            { list: [
                "KoboldCpp or Esobold running on your computer or server (usually connected automatically when Eso Lite is opened from it).",
                "AI Horde: free models run by volunteers; no setup, but slower and with a queue.",
                "Online providers with an API key, such as OpenAI-compatible services or Claude.",
            ] },
            { p: "The connection status is shown on the right of the top bar." },
        ],
        show: [
            { label: "AI", run: (ctx) => ctx.highlight(ctx.navLink("AI"), "Choose where the AI runs") },
            { label: "Connection status", run: (ctx) => ctx.highlight("#connectstatusdiv", "Shows which AI you are connected to") },
        ],
    },
    {
        id: "first-message", title: "Modes and your first message",
        blocks: [
            { p: "Settings → General → Usage mode decides how the AI answers:" },
            { table: [
                ["Mode", "Use it for"],
                ["Instruct", "Giving the AI tasks or questions, like an assistant. Generally, this mode can also be used for chatting with a character - especially if models focus on instruction following (which is many modern models)."],
                ["Chat", "Talking with a character."],
                ["Adventure", "Text adventures: you describe actions, the AI tells what happens."],
                ["Story", "Writing a story together; the AI acts as your cowriter, continuing your text in a freeform way."],
            ] },
            { p: "Type into the box at the bottom and press Submit. Undo removes the last step, Redo brings it back and Retry asks for a new answer. Tick Allow Editing to change the story text directly." },
        ],
        show: [
            { label: "Input box", run: (ctx) => ctx.highlight("#input_text", "Type here, then press Submit") },
            { label: "Undo, Redo, Retry", run: (ctx) => ctx.highlight("#btn_actundo", "Undo, Redo and Retry sit together here") },
            { label: "Open Settings → General", run: (ctx) => ctx.openSettings("general") },
        ],
    },
    {
        id: "library", title: "Library and saves",
        blocks: [
            { p: "The Library keeps your characters, saves and lorebooks in the browser, and on the server when Esobold stores data there (Server saves)." },
            { list: [
                "Import character cards (PNG or JSON), lorebooks, saves and even certain document types. You can also download characters from third party sources, or create a new character yourself!",
                "Hover over Library for shortcuts: Q.Save (quick save), Download, Load, New Character and Share.",
                "Items in the Library can be picked in Quick Start.",
            ] },
        ],
        show: [
            { label: "Library", run: (ctx) => ctx.highlight(ctx.navLink("Library"), "Characters, saves and lorebooks; hover for shortcuts") },
            { label: "Open the Library", run: (ctx) => ctx.run(() => showCharacterList()) },
        ],
    },
    {
        id: "quick-start", title: "Quick Start",
        blocks: [
            { p: "Quick Start sets up a session in one step. All choices are optional:" },
            { list: [
                "a save to start from,",
                "a main character and additional characters,",
                "your player character,",
                "world info / lorebook entries.",
            ] },
            { p: "Pick items from the Library, then press Confirm. Mods can add their own sections to Quick Start." },
        ],
        show: [
            { label: "Open Quick Start", run: (ctx) => ctx.run(() => showQuickStartPopup()) },
        ],
    },
    {
        id: "context", title: "Memory, world info and TextDB",
        blocks: [
            { p: "The Context button opens what the AI knows besides the story itself:" },
            { list: [
                "Memory: text that is always sent, such as a summary or the setting. This is one of the first things the AI always sees.",
                "World Info: entries that are added when their keywords appear. Groups can be exported and imported as files. Similar to Lorebooks.",
                "TextDB: documents the AI can search. Upload text, lorebooks or PDFs; with optional embedding support to improve the search.",
            ] },
            { p: "The context usage bar next to the connection status shows how full the AI's context is. Click it for details." },
        ],
        show: [
            { label: "Context button", run: (ctx) => ctx.highlight("#btn_actmem", "Memory, World Info and TextDB") },
            { label: "Context usage", run: (ctx) => ctx.highlight("#contextUsageInline", "How much of the context is used; click for details") },
        ],
    },
    {
        id: "world-tree", title: "The world tree",
        blocks: [
            { p: "Every reply is recorded in the world tree. When you retry or edit, the story branches; the tree keeps all branches." },
            { p: "Open the tree with the tree icon in the top bar and click a point to load the story from there." },
            { tip: "Settings → Esobold → World tree settings: prune branches, choose how many levels of branches are shown, or show the whole tree (occasionally may have issues on very large saves)." },
        ],
        show: [
            { label: "Tree icon", run: (ctx) => ctx.highlight("#openTreeDiagram", "Opens the world tree") },
        ],
    },
    {
        id: "agent", title: "Agent mode (experimental)",
        blocks: [
            { p: "In agent mode the AI can take several steps and use tools before it answers: search the web, roll dice, evaluate formulas, generate or analyse images, speak through TTS, search the TextDB or ask you for input." },
            { list: [
                "Turn it on under Settings → Agent.",
                "It needs an instruct model with separate start and end tags for all roles (for example ChatML).",
                "Tools such as web search, image generation or TTS must be set up and enabled first.",
                "This mode works well with Esobold (or KoboldCPP)'s Autoswap, allowing the AI to switch model types and tools seamlessly during its multi-step reasoning.",
            ] },
        ],
        show: [
            { label: "Open Settings → Agent", run: (ctx) => ctx.openSettings("esoboldAgent") },
        ],
    },
    {
        id: "settings", title: "Esobold settings",
        blocks: [
            { p: "Settings → Esobold collects Esobold's own options:" },
            { list: [
                "World tree and save settings, including running memory (experimental automatic summaries, stored in World Info).",
                "Context settings: \"Turns max content\" and \"Turns old content ratio\" create a sliding window of turns. It helps large models with slow prompt processing.",
                "Mods: open the third-party mods manager.",
            ] },
            { p: "Settings → GUI has options to customise the theme colours and font sizes, along with context usage bar and editor options." },
        ],
        show: [
            { label: "Open Settings → Esobold", run: (ctx) => ctx.openSettings("esobold") },
        ],
    },
    {
        id: "mods", title: "Mods",
        blocks: [
            { p: "Mods extend Eso Lite. The mods manager (Settings → Esobold → Mods) lists community mods; read the warning before applying one, since a mod runs code in this page." },
            { p: "Mods can add sections to Quick Start, tabs to the settings dialog and tabs to this guide." },
        ],
        show: [
            { label: "Open Settings → Esobold", run: (ctx) => ctx.openSettings("esobold") },
        ],
    },
]

class EsoGuide {
    storageKey = "esoGuidePosition"
    containerId = "esoGuideContainer"
    position = { tab: "esobold", chapters: {} }
    spotlight = null
    hiddenForSpotlight = false

    constructor() {
        try {
            let saved = JSON.parse(localStorage.getItem(this.storageKey) || "null")
            if (saved && typeof saved === "object") {
                this.position = { tab: `${saved.tab || "esobold"}`, chapters: saved.chapters || {} }
            }
        }
        catch (e) {
            // storage unavailable or corrupt: start at the beginning
        }
    }

    getTabs() {
        let tabs = [{ id: "esobold", label: "Esobold", chapters: ESO_GUIDE_CHAPTERS }]
        window.eso.extensions.getByType(EsoExtensionType.GUIDE).forEach(ext => {
            tabs.push({ id: ext.getId(), label: ext.getLabel(), chapters: ext.getChapters() })
        })
        return tabs.filter(tab => tab.chapters.length > 0)
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
        if (tabId) {
            this.position.tab = tabId
        }
        if (chapterId) {
            this.position.chapters[this.position.tab] = chapterId
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
        let tab = tabs.find(curr => curr.id === this.position.tab) || tabs[0]
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
