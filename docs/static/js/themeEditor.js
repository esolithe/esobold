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

let themes = {
    "Select a theme": {},
    "Default (Cedo)": {
        "--theme_color_topmenu": "#32496d",
        "--theme_color_placeholder_text": "#9e9e9e",
        "--theme_color_glow_text": "#94d7ff",
        "--theme_color_tabs_text": "#e0e0e0",
        "--theme_color_tabs_highlight": "#596985",
        "--theme_color_tabs": "#32496d",
        "--theme_color_topbtn_highlight": "#596985",
        "--theme_color_topbtn": "#415577",
        "--theme_color_disabled_fg": "#616773",
        "--theme_color_disabled_bg": "#484d56",
        "--theme_color_input_bg": "#475162",
        "--theme_color_border_highlight": "#82a1bc",
        "--theme_color_border": "#485c6c",
        "--theme_color_highlight": "#596985",
        "--theme_color_input_text": "#e0e0e0",
        "--theme_color_text": "#d1d1d1",
        "--theme_color_footer": "#182330",
        "--theme_color_main": "#32496d",
        "--theme_color_bg_outer": "#182330",
        "--theme_color_bg": "#182330",
        "--theme_color_bg_dark": "#0b141a",
        "--theme_color_topmenu_text": "#d1d1d1",
        "--theme_color_button_bg": "#32496d",
        "--theme_color_button_text": "#d1d1d1"
    },
    "Old colour theme (Cedo)": {
        "--theme_color_topmenu": "#337ab7",
        "--theme_color_glow_text": "#7afaff",
        "--theme_color_tabs_highlight": "#7d7d7d",
        "--theme_color_tabs": "#464646",
        "--theme_color_topbtn_highlight": "#4db4ea",
        "--theme_color_topbtn": "#4787be",
        "--theme_color_disabled_fg": "#a8a8a8",
        "--theme_color_disabled_bg": "#7e7e7e",
        "--theme_color_input_bg": "#474747",
        "--theme_color_border_highlight": "#cccccc",
        "--theme_color_border": "#9e9e9e",
        "--theme_color_highlight": "#286090",
        "--theme_color_text": "#e0e0e0",
        "--theme_color_footer": "#295071",
        "--theme_color_main": "#337ab7",
        "--theme_color_bg": "#263040",
        "--theme_color_bg_outer": "#303030",
        "--theme_color_bg_dark": "#262626",
        "--theme_color_input_text": "#e0e0e0",
        "--theme_color_tabs_text": "#e0e0e0",
        "--theme_color_placeholder_text": "#9e9e9e",
        "--theme_color_topmenu_text": "#e0e0e0",
        "--theme_color_button_bg": "#337ab7",
        "--theme_color_button_text": "#e0e0e0"
    },
    "Night (TwistedShadows)": {
        "--theme_color_bg": "#000000",
        "--theme_color_bg_dark": "#000000",
        "--theme_color_bg_outer": "#000000",
        "--theme_color_border": "#000000",
        "--theme_color_border_highlight": "#ffffff",
        "--theme_color_disabled_bg": "#000000",
        "--theme_color_disabled_fg": "#000000",
        "--theme_color_footer": "#000000",
        "--theme_color_glow_text": "#94d7ff",
        "--theme_color_highlight": "#4d4d4d",
        "--theme_color_input_bg": "#475162",
        "--theme_color_input_text": "#ffffff",
        "--theme_color_main": "#000000",
        "--theme_color_placeholder_text": "#9e9e9e",
        "--theme_color_tabs": "#000000",
        "--theme_color_tabs_highlight": "#596985",
        "--theme_color_tabs_text": "#ffffff",
        "--theme_color_text": "#ffffff",
        "--theme_color_topbtn": "#000000",
        "--theme_color_topbtn_highlight": "#596985",
        "--theme_color_topmenu": "#000000",
        "--theme_color_topmenu_text": "#ffffff",
        "--theme_color_button_bg": "#000000",
        "--theme_color_button_text": "#ffffff"
    },
    "Tako (Lakius)": {
        "--theme_color_bg": "rgba(47.000000000000014, 34, 49.00000000000001, 1)",
        "--theme_color_bg_dark": "rgba(33.00000000000001, 27.000000000000004, 34, 1)",
        "--theme_color_bg_outer": "rgba(22.829514564411603, 15.44173595774038, 25.784626007080078, 1)",
        "--theme_color_border": "rgba(189, 135.99999999999997, 87, 1)",
        "--theme_color_border_highlight": "rgba(230, 141.99999999999991, 58, 1)",
        "--theme_color_disabled_bg": "rgba(72, 77.00000000000001, 86, 1)",
        "--theme_color_disabled_fg": "rgba(97, 103.00000000000001, 115, 1)",
        "--theme_color_footer": "rgba(41.999999999999986, 29.000000000000004, 48, 1)",
        "--theme_color_glow_text": "rgba(160.99999999999991, 96.99999999999999, 165.99999999999997, 1)",
        "--theme_color_highlight": "rgba(255, 164, 51.999999999999986, 1)",
        "--theme_color_input_bg": "rgba(91.99999999999997, 58.99999999999999, 107, 1)",
        "--theme_color_input_text": "rgba(255, 255, 255, 1)",
        "--theme_color_main": "rgba(206, 148.0000000000001, 70.99999999999999, 1)",
        "--theme_color_placeholder_text": "rgba(182.42745535714286, 178.92868360324226, 178.92868360324226, 1)",
        "--theme_color_tabs": "rgba(227.50785418919156, 168.51677424099228, 90.20103017183058, 1)",
        "--theme_color_tabs_highlight": "rgba(220, 143.99999999999997, 28.00000000000001, 1)",
        "--theme_color_tabs_text": "rgba(255, 255, 255, 1)",
        "--theme_color_text": "rgba(255, 255, 255, 1)",
        "--theme_color_topbtn": "rgba(200.00000000000003, 130.99999999999994, 51.00000000000003, 1)",
        "--theme_color_topbtn_highlight": "rgba(217, 137.00000000000006, 7.999999999999989, 1)",
        "--theme_color_topmenu": "rgba(41.55767102869011, 30.678912543109437, 51.22767857142856, 1)",
        "--theme_color_topmenu_text": "rgba(255, 255, 255, 1)",
        "--theme_color_button_bg": "rgba(206, 148.0000000000001, 70.99999999999999, 1)",
        "--theme_color_button_text": "rgba(255, 255, 255, 1)"
    },
    "Aqua blue (Dr. Toaster)": {
        "--theme_color_topmenu": "rgba(0, 42.99999999999997, 54, 1)",
        "--theme_color_placeholder_text": "rgba(197.42672003224254, 212.76565279279438, 212.76565279279438, 1)",
        "--theme_color_glow_text": "rgba(160, 190, 190, 1)",
        "--theme_color_tabs_text": "rgba(160, 190, 190, 1)",
        "--theme_color_tabs_highlight": "rgba(74.99951518279815, 123.08754108170842, 138.20092064993722, 1)",
        "--theme_color_tabs": "rgba(0, 42.99999999999997, 54, 1)",
        "--theme_color_topbtn_highlight": "rgba(35.99999999999999, 71.00000000000004, 81.99999999999999, 1)",
        "--theme_color_topbtn": "rgba(35.99999999999999, 71.00000000000004, 81.99999999999999, 1)",
        "--theme_color_disabled_fg": "#616773",
        "--theme_color_disabled_bg": "#484d56",
        "--theme_color_input_bg": "rgba(6.000000000000007, 50.00000000000004, 61, 1)",
        "--theme_color_border_highlight": "#82a1bc",
        "--theme_color_border": "rgba(124, 142, 142, 1)",
        "--theme_color_highlight": "rgba(126.12097579480334, 157.83261861936177, 167.7991349356515, 1)",
        "--theme_color_input_text": "rgba(160, 190, 190, 1)",
        "--theme_color_text": "rgba(160, 190, 190, 1)",
        "--theme_color_footer": "rgba(0, 42.99999999999997, 54, 1)",
        "--theme_color_main": "rgba(0, 42.99999999999997, 54, 1)",
        "--theme_color_bg_outer": "rgba(99.61690629571874, 116.44981681374678, 117.70984922136579, 1)",
        "--theme_color_bg": "rgba(35.99999999999999, 71.00000000000004, 81.99999999999999, 1)",
        "--theme_color_bg_dark": "rgba(35.999999999999986, 71.00000000000001, 81.99999999999996, 0.68)",
        "--theme_color_topmenu_text": "rgba(160, 190, 190, 1)",
        "--theme_color_button_bg": "rgba(0, 42.99999999999997, 54, 1)",
        "--theme_color_button_text": "rgba(160, 190, 190, 1)"
    },
    "CandyUI (Peter)": {
        "--theme_color_bg": "#182330",
        "--theme_color_bg_dark": "#0b141a",
        "--theme_color_bg_outer": "#182330",
        "--theme_color_border": "#485c6c",
        "--theme_color_border_highlight": "#82a1bc",
        "--theme_color_disabled_bg": "#484d56",
        "--theme_color_disabled_fg": "#616773",
        "--theme_color_footer": "#182330",
        "--theme_color_glow_text": "#94d7ff",
        "--theme_color_highlight": "rgba(0, 191, 255, 0.8)",
        "--theme_color_input_bg": "#475162",
        "--theme_color_input_text": "#e0e0e0",
        "--theme_color_main": "rgba(255, 105, 179.99999999999997, 0.6)",
        "--theme_color_placeholder_text": "#9e9e9e",
        "--theme_color_tabs": "#32496d",
        "--theme_color_tabs_highlight": "rgba(0, 191, 255, 0.8)",
        "--theme_color_tabs_text": "#e0e0e0",
        "--theme_color_text": "#d1d1d1",
        "--theme_color_topbtn": "rgba(255, 105, 179.99999999999997, 0.7)",
        "--theme_color_topbtn_highlight": "rgba(0, 191, 255, 0.8)",
        "--theme_color_topmenu": "rgba(255, 105, 179.99999999999997, 0.7)",
        "--theme_color_topmenu_text": "#d1d1d1",
        "--theme_color_button_bg": "rgba(255, 105, 179.99999999999997, 0.6)",
        "--theme_color_button_text": "#d1d1d1"
    }
}

let showThemePopup = () => {
    let content = document.createElement("div"), themeSelector = document.createElement("select"), fontSelector = document.createElement("select");
    content.style.width = "100%";
    content.style.padding = "10px";
    themeSelector.id = "themeSelector";
    themeSelector.style.width = "90%";
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
			color: var(--theme_color_text);`
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
			color: var(--theme_color_text);`
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
                colourSpan.dataset["cssValue"] = color.toRGBA().toString()
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