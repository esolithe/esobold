window.addEventListener("load", () => {
    let aNoteElem = document.querySelector("#anote_strength"), aNoteContainer = aNoteElem.parentElement.parentElement;
    let aNoteTurnStrength = document.createElement("span")
    aNoteTurnStrength.id = "aNoteTurnStrength"
    aNoteTurnStrength.style.color = "var(--theme_color_fg)"
    aNoteTurnStrength.style.float = "right"
    aNoteTurnStrength.style.display = "flex"
    aNoteTurnStrength.style.flexDirection = "column"
    aNoteTurnStrength.style.width = "300px"
    aNoteTurnStrength.style.margin = "20px"
    aNoteTurnStrength.style.rowGap = "10px"
    aNoteTurnStrength.style.padding = "10px"
    aNoteTurnStrength.style.border = "1px solid var(--theme_color_border)"
    aNoteTurnStrength.classList.add("hidden")

    let element = document.createElement("span")
    element.style.flex = 1
    element.innerText = "Insert author's note"
    aNoteTurnStrength.appendChild(element)

    let row = document.createElement("span")
    row.style.flex = 1
    element = document.createElement("input")
    element.id = "anTurnOffset"
    element.classList.add("form-control")
    element.type = "number"
    element.value = 1
    row.appendChild(element)

    element = document.createElement("select")
    element.id = "anTurnType"
    element.classList.add("form-control")
    element.appendChild(new Option("", "all"))
    element.appendChild(new Option("user", "user"))
    element.appendChild(new Option("ai", "ai"))
    element.appendChild(new Option("system", "system"))
    row.appendChild(element)
    aNoteTurnStrength.appendChild(row)
    
    element = document.createElement("span")
    row.style.flex = 1
    element.innerText = " turns before the end."
    aNoteTurnStrength.appendChild(element)

    element = document.createElement("span")
    element.style.flex = 1
    element.innerText = "Note: For instruct start and end tags must be enabled. For instruct / chat it is based on turns.  For adventure mode, turns are always assumed to be the users.  For story mode, it is based on paragraphs split by two new lines."
    aNoteTurnStrength.appendChild(element)
    
    aNoteContainer.appendChild(aNoteTurnStrength)

    aNoteElem.appendChild(new Option("Turn based", "turn"))
    aNoteElem.addEventListener("change", () => {
        if (aNoteElem.value === "turn")
        {
            aNoteTurnStrength.classList.remove("hidden")
        }
        else
        {
            aNoteTurnStrength.classList.add("hidden")
        }
    })
})

function getTurnDelimiters() {
    let delimiterType = anTurnType, mode = Number(localsettings.opmode)
    switch (mode) {
        case 1:
            return ["\n\n"]
        case 2:
            return [">"]
        case 3:
            let user = localsettings.chatname, opponents = localsettings.chatopponent.split("||$||")
            switch (delimiterType) {
                case "user":
                    return [`${user}:`]
                case "ai":
                    return opponents.map(opponent => `${opponent}:`)
                default:
                    return [user, ...opponents].map(opponent => `${opponent}:`)
            }
        case 4:
            switch (delimiterType) {
                case "user":
                    return [localsettings.instruct_starttag, get_instructstartplaceholder()]
                case "ai":
                    return [localsettings.instruct_endtag, get_instructendplaceholder()]
                case "system":
                    return [localsettings.instruct_systag, get_instructsysplaceholder()]
                default:
                    return [localsettings.instruct_starttag, localsettings.instruct_endtag, localsettings.instruct_systag, get_instructstartplaceholder(), get_instructendplaceholder(), get_instructsysplaceholder()]
            }
    }
}

function insertAuthorsNoteToContext(context, authorsNote){
    let userTurnDelimiters = getTurnDelimiters();
    let totalOffset = 0
    let ctxShifted = "" + context
    let i = 0;
    if (anTurnOffset === 0) {
        context += authorsNote
    }
    else {
        for (i = 0; i < anTurnOffset; i++) {
            lastUserDelimiterPos = Math.max(...userTurnDelimiters.map(delimiter => ctxShifted.lastIndexOf(delimiter)))
            if (lastUserDelimiterPos !== -1) {
                totalOffset += ctxShifted.length - lastUserDelimiterPos
                ctxShifted = ctxShifted.substring(0, lastUserDelimiterPos)
            } else {
                break
            }
        }

        if (i > 0 && i === anTurnOffset) {
            context = context.substring(0, Math.max(0, context.length - totalOffset)) + authorsNote + context.substring(Math.min(context.length - totalOffset, context.length))
        } else {
            // Handle if there are not enough turns yet
            context = authorsNote + context
        }
    }

    return context
}