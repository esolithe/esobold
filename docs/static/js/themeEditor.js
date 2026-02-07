let extractCSSVars = (elem, filter = () => true) => {
    const res = {};

    // https://stackoverflow.com/questions/54004635/how-to-list-all-css-variables-names-values-pairs-from-element
    if ("computedStyleMap" in elem) {
        // Chrome
        const styles = elem.computedStyleMap();
        Array.from(styles).forEach(([prop, val]) => {
            if (prop.startsWith("--") && filter(prop)) {
                res[prop] = val.toString();
            }
        });
    } else {
        // Firefox
        const styles = getComputedStyle(elem);
        for (let i = 0; i < styles.length; i++) {
            const propertyName = styles[i];
            if (propertyName.startsWith("--") && filter(propertyName)) {
                const value = styles.getPropertyValue(propertyName);
                res[propertyName] = value;
            }
        }
    }
    return res;
}

let getThemeVars = () => {
    return extractCSSVars(document.body, c => c.startsWith("--theme"))
}

let cssVarNameToString = (name) => {
    return name.replace(/^--theme_color_/, "").replace(/^--theme_/, "").replaceAll(/_/g, " ").replace(/^./, char => char.toUpperCase())
}

let showThemePopup = () => {    
    let content = document.createElement("div"), themeSelector = document.createElement("select"), fontSelector = document.createElement("select");
    content.style.width = "100%";
    content.style.padding = "10px";
    themeSelector.id = "themeSelector";
    themeSelector.style.width = "90%";
    themeSelector.appendChild(new Option("Current", "Current"))
    Object.entries(themes).forEach(entry => {
        [key, value] = entry;
        themeSelector.appendChild(new Option(key, key))
    })

    fontSelector.id = "fontSelector"
    fontSelector.style.width = "90%";
    fontSelector.appendChild(new Option("Default font", "Helvetica, sans-serif"))
    let otherFonts = ["monospace", "sans-serif", "serif"];
    otherFonts.push(...["Arial", "Times New Roman", "Courier New", "Courier", "Verdana", "Georgia", "Palatino", "Garamond", "Tahoma", "Trebuchet MS"].filter(font => document.fonts.check(`12px ${font}`)))
    otherFonts.forEach(entry => {
        fontSelector.appendChild(new Option(entry, entry))
    })
    let fontFamily = getThemeVars()["--theme_font_family"]
    if (!!fontFamily && otherFonts.includes(fontFamily)) {
        fontSelector.value = getThemeVars()["--theme_font_family"]
    }

    let updateTheme = () => {
        let updatedTheme = [...content.querySelectorAll(".colourSelectorSpan,.sizeSelectorSpan")].reduce((o, elem) => {
            o[elem.dataset["cssVar"]] = elem.dataset["cssValue"]
            return o
        }, {})
        updatedTheme["--theme_font_family"] = fontSelector.value;
        setThemeVars(updatedTheme)
        localsettings.customThemeColours = getThemeVars()
    }
    fontSelector.onchange = updateTheme

    themeSelector.onchange = () => {
        let updatedTheme = themes[themeSelector.value]
        setThemeVars(updatedTheme)
        localsettings.customThemeColours = updatedTheme
        autosave();
        reloadSizes();
        reloadColours();
    }
    content.appendChild(themeSelector)
    content.appendChild(fontSelector)
    let reloadSizes = () => {
        [...content.querySelectorAll("[data-css-var^='--theme_font_size']")].forEach(elem => elem.remove())
        Object.entries(getThemeVars()).forEach(entry => {
            [key, value] = entry;

            if (!key.startsWith("--theme_font_size")) {
                return
            }

            let sizeSpan = document.createElement("span"),
                sizeLabel = document.createElement("label"),
                sizeElem = document.createElement("input");

            sizeSpan.style.cssText = `display: flex; 
			width: 100%;
			justify-content: space-between;
			padding: 10px;
			color: var(--theme_color_fg);`
            sizeSpan.dataset["cssVar"] = key
            sizeSpan.dataset["cssValue"] = value
            sizeSpan.classList.add("sizeSelectorSpan")

            sizeLabel.innerText = cssVarNameToString(key)
            sizeSpan.appendChild(sizeLabel)

            sizeElem.style.cssText = `height: 20px;
			width: 100px;
			border-radius: 50px;
			background: var(--theme_color_input_bg);
			`
            sizeElem.value = value.replace("pt", "")
            sizeElem.type = "number"
            sizeElem.step = 1
            sizeSpan.appendChild(sizeElem)
            let changeHandler = (ev) => {
                sizeSpan.dataset["cssValue"] = `${sizeElem.value}pt`
                updateTheme()
            }
            sizeElem.addEventListener("change", changeHandler)
            sizeElem.addEventListener("input", changeHandler)
            content.appendChild(sizeSpan)
        })
    }
    let reloadColours = () => {
        [...content.querySelectorAll("[data-css-var^='--theme_color']")].forEach(elem => elem.remove())
        Object.entries(getThemeVars()).forEach(entry => {
            [key, value] = entry;

            if (!key.startsWith("--theme_color")) {
                return
            }

            let colourSpan = document.createElement("span"),
                colourLabel = document.createElement("label"),
                colourElem = document.createElement("input");

            colourSpan.style.cssText = `display: flex; 
			width: 100%;
			justify-content: space-between;
			padding: 10px;
			color: var(--theme_color_fg);`
            colourSpan.dataset["cssVar"] = key
            colourSpan.dataset["cssValue"] = value
            colourSpan.classList.add("colourSelectorSpan")

            colourLabel.innerText = cssVarNameToString(key)
            colourSpan.appendChild(colourLabel)

            colourElem = document.createElement("div")
            colourElem.style.cssText = `height: 20px;
			width: 20px;
			border-radius: 50px;
			background-color: ${value};
			border: solid black;
			`
            colourSpan.appendChild(colourElem)
            pickr = Pickr.create({
                el: colourElem,
                default: value,
                theme: 'classic', // or 'monolith', or 'nano'
                components: {

                    // Main components
                    preview: true,
                    opacity: true,
                    hue: true,

                    // Input / output Options
                    interaction: {
                        hex: true,
                        rgba: true,
                        input: true,
                        save: false,
                        cancel: false
                    }
                }
            }).on('change', (color, source, instance) => {
                let cssString = color.toRGBA().toString();
                colourSpan.dataset["cssValue"] = cssString;
                colourSpan.querySelector(".pcr-button").style.setProperty("--pcr-color", cssString);
                updateTheme()
            }).on('cancel', instance => {
                updateTheme()
            });
            content.appendChild(colourSpan)
        })
    }
    reloadSizes();
    reloadColours();

    popupUtils.reset().title("Theme colours").content(content).button("Close", () => {
        autosave();
        popupUtils.reset();
    }).show()
}

window.showThemePopup = showThemePopup