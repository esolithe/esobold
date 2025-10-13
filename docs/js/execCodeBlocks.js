// Exec code block usermod

let extractCodeFromElem = (el) => {
    const codeContainer = el.parentElement.querySelector('pre code');
    let innercode = codeContainer.innerText;
    //remove common language descriptiors from the start
    let langsmatched = ["javascript", "js", "html", "xhtml"];
    for (let i = 0; i < langsmatched.length; ++i) {
        let matcher = langsmatched[i] + "\n";
        if (innercode.startsWith(matcher)) {
            innercode = innercode.substring(matcher.length);
            return {
                elem: el,
                lang: langsmatched[i],
                code: innercode
            }
        }
    }
    return null
}

let execJS = (code) => {
    window.outPipe = (type = "Log:", ...args) => {
        console.groupCollapsed(type, ...args);
        console.groupEnd();
    };
    window.outPipeLog = (...args) => {
        outPipe("Log:", ...args)
    };
    window.outPipeInfo = (...args) => {
        outPipe("Info:", ...args)
    };
    window.outPipeWarn = (...args) => {
        outPipe("Warn:", ...args)
    };
    window.outPipeError = (...args) => {
        outPipe("Error:", ...args)
    };
    console.groupCollapsed("Preparing to execute script")
    console.log(code)
    console.groupEnd()

    console.groupCollapsed("Executing script");
    let evalResult = null;
    try {
        let scriptBody = code.trim().replace(/^javascript|^js/, "").replace(/console\.log\(/gi, "outPipeLog(").replace(/console\.info\(/gi, "outPipeInfo(").replace(/console\.warn\(/gi, "outPipeWarn(").replace(/console\.error\(/gi, "outPipeError(");
        evalResult = eval?.(`${scriptBody}`);
    } catch (e) {
        evalResult = e;
    }
    if (!!evalResult) {
        outPipeLog(`Eval result: ${evalResult}`);
    }
    console.groupEnd()
}

let execHTML = (code) => {
    const newWindow = window.open('about:blank', '_blank');
    newWindow.document.write(code);
    newWindow.document.close()
}

let handleExecCode = (meta) => {
    let {
        elem,
        lang,
        code
    } = meta;

    switch (lang) {
        case "javascript":
        case "js":
            execJS(code);
            break;
        case "html":
        case "xhtml":
            execHTML(code);
            break;
    }
}

let updateExecScriptButtons = () => {
    let scripts = [...document.querySelectorAll("button.unselectable[title=Copy]")].filter(el => el.checkVisibility() && !el.classList.contains("execScriptAdded")).map(el => extractCodeFromElem(el))

    scripts.forEach(meta => {
        let elem = meta?.elem
        if (!!elem) {
            let button = document.createElement("button")
            button.title = "Execute code block"
            button.classList.add("unselectable")
            button.onclick = () => handleExecCode(meta)
            button.style.color = "black"
            button.style.display = "flex"
            button.style.float = "right"
            button.innerText = "⚡"
            elem.classList.add("execScriptAdded")
            elem.parentElement.prepend(button)
        }
    })
}

setInterval(updateExecScriptButtons, 15 * 1000);
setTimeout(updateExecScriptButtons, 5 * 1000);