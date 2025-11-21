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
    },
    "Cherry pink (Rose22)": {
        "--theme_color_bg_dark": "rgba(0, 0, 0, 1)",
        "--theme_color_bg": "rgba(20.999999999999996, 20.999999999999996, 20.999999999999996, 1)",
        "--theme_color_bg_outer": "rgba(0, 0, 0, 1)",
        "--theme_color_main": "rgba(108, 34.00000000000002, 73.99999999999991, 1)",
        "--theme_color_footer": "rgba(44.0937662124634, 12.263633626230636, 29.477889004499335, 1)",
        "--theme_color_text": "rgba(255, 168, 226.00000000000003, 1)",
        "--theme_color_input_text": "rgba(255, 168, 226.00000000000003, 1)",
        "--theme_color_highlight": "rgba(186, 14.999999999999986, 108.00000000000007, 1)",
        "--theme_color_border": "rgba(186, 14.999999999999986, 108.00000000000007, 1)",
        "--theme_color_border_highlight": "rgba(190.18751621246338, 52.16586645804335, 127.23027246483323, 1)",
        "--theme_color_input_bg": "rgba(79, 3.0000000000000075, 53.99999999999997, 1)",
        "--theme_color_disabled_bg": "rgba(59.99999999999999, 0, 40.000000000000014, 1)",
        "--theme_color_disabled_fg": "rgba(22.84368515014646, 0, 15.22912343343098, 1)",
        "--theme_color_topbtn": "rgba(148, 49.999999999999986, 102.99999999999987, 1)",
        "--theme_color_topbtn_highlight": "rgba(148, 49.999999999999986, 102.99999999999987, 1)",
        "--theme_color_tabs": "rgba(83.99999999999999, 7.999999999999998, 49, 1)",
        "--theme_color_tabs_highlight": "rgba(211.43743515014648, 51.513018057873325, 137.78803254186283, 1)",
        "--theme_color_tabs_text": "rgba(230, 116, 192.00000000000006, 1)",
        "--theme_color_glow_text": "rgba(243.31243515014648, 152.68922485482943, 201.60971890805374, 1)",
        "--theme_color_placeholder_text": "#9e9e9e",
        "--theme_color_topmenu": "rgba(0, 0, 0, 1)",
        "--theme_color_topmenu_text": "rgba(255, 168, 226.00000000000003, 1)",
        "--theme_color_button_bg": "rgba(148, 49.999999999999986, 102.99999999999987, 1)",
        "--theme_color_button_text": "rgba(255, 99.99999999999999, 202.99999999999994, 1)",
    },
    "Light Dark Blue (Peter)": {
        "--theme_color_bg": "rgba(255,255,255,1)",
        "--theme_color_bg_dark": "rgba(247,249,252,1)",
        "--theme_color_bg_outer": "rgba(243,246,251,1)",
        "--theme_color_border": "#D1D9E6",
        "--theme_color_border_highlight": "rgba(122,167,255,1)",
        "--theme_color_disabled_bg": "rgba(239,241,245,1)",
        "--theme_color_disabled_fg": "#A8B2C1",
        "--theme_color_footer": "rgba(241,244,251,1)",
        "--theme_color_glow_text": "rgba(14,165,165,1)",
        "--theme_color_highlight": "rgba(252,229,136,1)",
        "--theme_color_input_bg": "rgba(255,255,255,1)",
        "--theme_color_input_text": "#111827",
        "--theme_color_main": "rgba(37,99,235,1)",
        "--theme_color_placeholder_text": "#9CA3AF",
        "--theme_color_tabs": "rgba(234,241,251,1)",
        "--theme_color_tabs_highlight": "rgba(214,231,255,1)",
        "--theme_color_tabs_text": "#374151",
        "--theme_color_text": "rgba(31,41,55,1)",
        "--theme_color_topbtn": "rgba(234,241,251,1)",
        "--theme_color_topbtn_highlight": "rgba(215,229,255,1)",
        "--theme_color_topmenu": "rgba(255,255,255,1)",
        "--theme_color_topmenu_text": "rgba(31,41,55,1)",
        "--theme_color_button_bg": "rgba(37,99,235,1)",
        "--theme_color_button_text": "#FFFFFF"
    },
    "Light Lite Blue (Peter)": {
        "--theme_color_bg": "#FFFFFF",
        "--theme_color_bg_dark": "#F7F9FB",
        "--theme_color_bg_outer": "#F3F6FA",
        "--theme_color_border": "#E1E6EF",
        "--theme_color_border_highlight": "#007ACC",
        "--theme_color_disabled_bg": "#EEF1F6",
        "--theme_color_disabled_fg": "#9AA3B2",
        "--theme_color_footer": "#F5F7FA",
        "--theme_color_glow_text": "#0EA5A5",
        "--theme_color_highlight": "#FFE599",
        "--theme_color_input_bg": "#FFFFFF",
        "--theme_color_input_text": "#111827",
        "--theme_color_main": "#007ACC",
        "--theme_color_placeholder_text": "#9CA3AF",
        "--theme_color_tabs": "#F1F5FB",
        "--theme_color_tabs_highlight": "#E0ECFF",
        "--theme_color_tabs_text": "#374151",
        "--theme_color_text": "#1F2937",
        "--theme_color_topbtn": "#EDF4FF",
        "--theme_color_topbtn_highlight": "#D6E7FF",
        "--theme_color_topmenu": "#FFFFFF",
        "--theme_color_topmenu_text": "#1F2937",
        "--theme_color_button_bg": "#007ACC",
        "--theme_color_button_text": "#FFFFFF"
    },
    "Light Lavender (Peter)": {
        "--theme_color_bg": "#FAF7FF",
        "--theme_color_bg_dark": "#F8F4FF",
        "--theme_color_bg_outer": "#F5F0FF",
        "--theme_color_border": "#E3DDF3",
        "--theme_color_border_highlight": "#6D5BD0",
        "--theme_color_disabled_bg": "#F2EDFA",
        "--theme_color_disabled_fg": "#A59CC2",
        "--theme_color_footer": "#F6F2FF",
        "--theme_color_glow_text": "#7C3AED",
        "--theme_color_highlight": "#FDE68A",
        "--theme_color_input_bg": "#FFFFFF",
        "--theme_color_input_text": "#2E2640",
        "--theme_color_main": "#6D5BD0",
        "--theme_color_placeholder_text": "#9E8FBF",
        "--theme_color_tabs": "#EEE9FF",
        "--theme_color_tabs_highlight": "#E2D9FF",
        "--theme_color_tabs_text": "#3F335F",
        "--theme_color_text": "#2E2640",
        "--theme_color_topbtn": "#EFE9FF",
        "--theme_color_topbtn_highlight": "#E1D6FF",
        "--theme_color_topmenu": "#FAF7FF",
        "--theme_color_topmenu_text": "#2E2640",
        "--theme_color_button_bg": "#6D5BD0",
        "--theme_color_button_text": "#FFFFFF"
    },
    "Light Sand (Peter)": {
        "--theme_color_bg": "#FBF7F0",
        "--theme_color_bg_dark": "#F4EFE6",
        "--theme_color_bg_outer": "#F1E9DD",
        "--theme_color_border": "#E2D8C8",
        "--theme_color_border_highlight": "#C08A2E",
        "--theme_color_disabled_bg": "#EDE4D6",
        "--theme_color_disabled_fg": "#B1A58E",
        "--theme_color_footer": "#F4EADC",
        "--theme_color_glow_text": "#0B8B6C",
        "--theme_color_highlight": "#FFE8B0",
        "--theme_color_input_bg": "#FFFFFF",
        "--theme_color_input_text": "#2F2A1D",
        "--theme_color_main": "#C37D2F",
        "--theme_color_placeholder_text": "#9B9079",
        "--theme_color_tabs": "#F6F0E6",
        "--theme_color_tabs_highlight": "#EDE1D0",
        "--theme_color_tabs_text": "#4D4331",
        "--theme_color_text": "#3F3A28",
        "--theme_color_topbtn": "#F1E7D7",
        "--theme_color_topbtn_highlight": "#EADCC6",
        "--theme_color_topmenu": "#FBF7F0",
        "--theme_color_topmenu_text": "#3F3A28",
        "--theme_color_button_bg": "#C37D2F",
        "--theme_color_button_text": "#FFFFFF"
    },
    "Light Coffee Cream (Peter)": {
        "--theme_color_bg": "#F7F2E7",
        "--theme_color_bg_dark": "#F2EAD9",
        "--theme_color_bg_outer": "#EFE2C9",
        "--theme_color_border": "#E4D9C7",
        "--theme_color_border_highlight": "#BFA06A",
        "--theme_color_disabled_bg": "#ECE2D3",
        "--theme_color_disabled_fg": "#B0A492",
        "--theme_color_footer": "#F0E6D7",
        "--theme_color_glow_text": "#0E7C86",
        "--theme_color_highlight": "#FFE3A3",
        "--theme_color_input_bg": "#FFFFFF",
        "--theme_color_input_text": "#2F2E2B",
        "--theme_color_main": "#D4B47B",
        "--theme_color_placeholder_text": "#9C907D",
        "--theme_color_tabs": "#F3EBDD",
        "--theme_color_tabs_highlight": "#EADFCB",
        "--theme_color_tabs_text": "#3E3A33",
        "--theme_color_text": "#3B3A36",
        "--theme_color_topbtn": "#EFE5D3",
        "--theme_color_topbtn_highlight": "#E8D8BF",
        "--theme_color_topmenu": "#FAF4EA",
        "--theme_color_topmenu_text": "#3E3A33",
        "--theme_color_button_bg": "#C9A566",
        "--theme_color_button_text": "#FFFFFF"
    },
    "Mostly black (Peter)": {
        "--theme_color_bg": "#151617",
        "--theme_color_bg_dark": "#0e0e10",
        "--theme_color_bg_outer": "#101012",
        "--theme_color_border": "#2a2a2d",
        "--theme_color_border_highlight": "#7c3aed",
        "--theme_color_disabled_bg": "#1c1c1f",
        "--theme_color_disabled_fg": "#6b6b6b",
        "--theme_color_footer": "#111114",
        "--theme_color_glow_text": "#7dd46c",
        "--theme_color_highlight": "#3b1f4c",
        "--theme_color_input_bg": "#121217",
        "--theme_color_input_text": "#eaedf2",
        "--theme_color_main": "#7c3aed",
        "--theme_color_placeholder_text": "#8a8f98",
        "--theme_color_tabs": "#19181d",
        "--theme_color_tabs_highlight": "#271f33",
        "--theme_color_tabs_text": "#e6e6e9",
        "--theme_color_text": "#e5e7eb",
        "--theme_color_topbtn": "#1e1a22",
        "--theme_color_topbtn_highlight": "#282033",
        "--theme_color_topmenu": "#151417",
        "--theme_color_topmenu_text": "#e6e6ea",
        "--theme_color_button_bg": "#7c3aed",
        "--theme_color_button_text": "#ffffff"
    },
    "Dark navy (Peter)": {
        "--theme_color_bg": "#0f274f",
        "--theme_color_bg_dark": "#0a2046",
        "--theme_color_bg_outer": "#0a1e3c",
        "--theme_color_border": "#23314a",
        "--theme_color_border_highlight": "#3b82f6",
        "--theme_color_disabled_bg": "#12203b",
        "--theme_color_disabled_fg": "#5b6b86",
        "--theme_color_footer": "#0c1b34",
        "--theme_color_glow_text": "#22d3ee",
        "--theme_color_highlight": "#1f3b6e",
        "--theme_color_input_bg": "#0f1e3a",
        "--theme_color_input_text": "#e6eef9",
        "--theme_color_main": "#2563eb",
        "--theme_color_placeholder_text": "#8da3c4",
        "--theme_color_tabs": "#0d1b34",
        "--theme_color_tabs_highlight": "#12254a",
        "--theme_color_tabs_text": "#dce6f9",
        "--theme_color_text": "#e5ecf6",
        "--theme_color_topbtn": "#0d223d",
        "--theme_color_topbtn_highlight": "#163054",
        "--theme_color_topmenu": "#0b1a32",
        "--theme_color_topmenu_text": "#e6eef9",
        "--theme_color_button_bg": "#1d4ed8",
        "--theme_color_button_text": "#ffffff"
    },
    "Ink blue (Peter)": {
        "--theme_color_bg": "#0d141e",
        "--theme_color_bg_dark": "#050c18",
        "--theme_color_bg_outer": "#0a121b",
        "--theme_color_border": "#1f2a3a",
        "--theme_color_border_highlight": "#38bdf8",
        "--theme_color_disabled_bg": "#111927",
        "--theme_color_disabled_fg": "#6b7a8f",
        "--theme_color_footer": "#08111a",
        "--theme_color_glow_text": "#67e8f9",
        "--theme_color_highlight": "#16324a",
        "--theme_color_input_bg": "#0f1824",
        "--theme_color_input_text": "#e8f0fa",
        "--theme_color_main": "#0ea5e9",
        "--theme_color_placeholder_text": "#8ea2b8",
        "--theme_color_tabs": "#0b131e",
        "--theme_color_tabs_highlight": "#142235",
        "--theme_color_tabs_text": "#dce7f3",
        "--theme_color_text": "#e6eef9",
        "--theme_color_topbtn": "#0b1622",
        "--theme_color_topbtn_highlight": "#122233",
        "--theme_color_topmenu": "#0b141e",
        "--theme_color_topmenu_text": "#e6eef9",
        "--theme_color_button_bg": "#0284c7",
        "--theme_color_button_text": "#ffffff"
    },
    "Dark charcoal (Peter)": {
        "--theme_color_bg": "#1a1a1a",
        "--theme_color_bg_dark": "#141414",
        "--theme_color_bg_outer": "#121212",
        "--theme_color_border": "#2a2a2a",
        "--theme_color_border_highlight": "#5fa36a",
        "--theme_color_disabled_bg": "#202020",
        "--theme_color_disabled_fg": "#7a7a7a",
        "--theme_color_footer": "#141414",
        "--theme_color_glow_text": "#10b981",
        "--theme_color_highlight": "#244024",
        "--theme_color_input_bg": "#1b1b1b",
        "--theme_color_input_text": "#e7e7e7",
        "--theme_color_main": "#5fa36a",
        "--theme_color_placeholder_text": "#969696",
        "--theme_color_tabs": "#181a18",
        "--theme_color_tabs_highlight": "#212a21",
        "--theme_color_tabs_text": "#e5e7eb",
        "--theme_color_text": "#e5e5e5",
        "--theme_color_topbtn": "#1a1a1a",
        "--theme_color_topbtn_highlight": "#232323",
        "--theme_color_topmenu": "#161616",
        "--theme_color_topmenu_text": "#eaeaea",
        "--theme_color_button_bg": "#5fa36a",
        "--theme_color_button_text": "#ffffff"
    },
    "Dark brown (Peter)": {
        "--theme_color_bg": "#201a13",
        "--theme_color_bg_dark": "#1b1510",
        "--theme_color_bg_outer": "#1a140e",
        "--theme_color_border": "#3a2c1d",
        "--theme_color_border_highlight": "#d6a354",
        "--theme_color_disabled_bg": "#2a2218",
        "--theme_color_disabled_fg": "#8f7a5c",
        "--theme_color_footer": "#1a150f",
        "--theme_color_glow_text": "#eab308",
        "--theme_color_highlight": "#3a2a1b",
        "--theme_color_input_bg": "#221b14",
        "--theme_color_input_text": "#f3ede4",
        "--theme_color_main": "#c0843a",
        "--theme_color_placeholder_text": "#a59078",
        "--theme_color_tabs": "#211a13",
        "--theme_color_tabs_highlight": "#2a2219",
        "--theme_color_tabs_text": "#ecdcc9",
        "--theme_color_text": "#f1e7da",
        "--theme_color_topbtn": "#261e15",
        "--theme_color_topbtn_highlight": "#2f2519",
        "--theme_color_topmenu": "#1f180f",
        "--theme_color_topmenu_text": "#f1e7da",
        "--theme_color_button_bg": "#b7791f",
        "--theme_color_button_text": "#ffffff"
    },
    "Dark olive (Peter)": {
        "--theme_color_bg": "#20211c",
        "--theme_color_bg_dark": "#1a1b17",
        "--theme_color_bg_outer": "#1c1d19",
        "--theme_color_border": "#2e2f27",
        "--theme_color_border_highlight": "#9ca37a",
        "--theme_color_disabled_bg": "#26271f",
        "--theme_color_disabled_fg": "#898a78",
        "--theme_color_footer": "#1a1b17",
        "--theme_color_glow_text": "#93c5aa",
        "--theme_color_highlight": "#3a3c2c",
        "--theme_color_input_bg": "#23241f",
        "--theme_color_input_text": "#eaeaDA",
        "--theme_color_main": "#9ca37a",
        "--theme_color_placeholder_text": "#9a9b87",
        "--theme_color_tabs": "#21221d",
        "--theme_color_tabs_highlight": "#2b2d22",
        "--theme_color_tabs_text": "#e7e7d6",
        "--theme_color_text": "#e8e9d9",
        "--theme_color_topbtn": "#26271f",
        "--theme_color_topbtn_highlight": "#2e3025",
        "--theme_color_topmenu": "#1f201b",
        "--theme_color_topmenu_text": "#e8e9d9",
        "--theme_color_button_bg": "#8d9467",
        "--theme_color_button_text": "#ffffff"
    },
    "Dark gray (Peter)": {
        "--theme_color_bg": "#1a1a1a",
        "--theme_color_bg_dark": "#151515",
        "--theme_color_bg_outer": "#121212",
        "--theme_color_border": "#2a2a2a",
        "--theme_color_border_highlight": "#60a5fa",
        "--theme_color_disabled_bg": "#222222",
        "--theme_color_disabled_fg": "#8a8a8a",
        "--theme_color_footer": "#171717",
        "--theme_color_glow_text": "#22d3ee",
        "--theme_color_highlight": "#1f2937",
        "--theme_color_input_bg": "#1e1e1e",
        "--theme_color_input_text": "#eaeaea",
        "--theme_color_main": "#3b82f6",
        "--theme_color_placeholder_text": "#9ca3af",
        "--theme_color_tabs": "#171717",
        "--theme_color_tabs_highlight": "#202020",
        "--theme_color_tabs_text": "#e5e7eb",
        "--theme_color_text": "#e5e7eb",
        "--theme_color_topbtn": "#1c1c1c",
        "--theme_color_topbtn_highlight": "#242424",
        "--theme_color_topmenu": "#1a1a1a",
        "--theme_color_topmenu_text": "#ededed",
        "--theme_color_button_bg": "#3b82f6",
        "--theme_color_button_text": "#ffffff"
    },
    "Dark red (Peter)": {
        "--theme_color_bg": "#2a090a",
        "--theme_color_bg_dark": "#1a0405",
        "--theme_color_bg_outer": "#240707",
        "--theme_color_border": "#5b2325",
        "--theme_color_border_highlight": "#f87171",
        "--theme_color_disabled_bg": "#341012",
        "--theme_color_disabled_fg": "#b27575",
        "--theme_color_footer": "#220809",
        "--theme_color_glow_text": "#fca5a5",
        "--theme_color_highlight": "#3a1214",
        "--theme_color_input_bg": "#2e0c0e",
        "--theme_color_input_text": "#fdebeb",
        "--theme_color_main": "#dc2626",
        "--theme_color_placeholder_text": "#c9a1a1",
        "--theme_color_tabs": "#2a0a0b",
        "--theme_color_tabs_highlight": "#371113",
        "--theme_color_tabs_text": "#f9dada",
        "--theme_color_text": "#fceaea",
        "--theme_color_topbtn": "#2e0c0d",
        "--theme_color_topbtn_highlight": "#3a1213",
        "--theme_color_topmenu": "#2a090a",
        "--theme_color_topmenu_text": "#fceaea",
        "--theme_color_button_bg": "#b91c1c",
        "--theme_color_button_text": "#ffffff"
    },
    "Dark teal (Peter)": {
        "--theme_color_bg": "#0b232b",
        "--theme_color_bg_dark": "#061f27",
        "--theme_color_bg_outer": "#071b21",
        "--theme_color_border": "#12333b",
        "--theme_color_border_highlight": "#06b6d4",
        "--theme_color_disabled_bg": "#0e2a33",
        "--theme_color_disabled_fg": "#6ba3af",
        "--theme_color_footer": "#081f25",
        "--theme_color_glow_text": "#22d3ee",
        "--theme_color_highlight": "#163a43",
        "--theme_color_input_bg": "#0f2a33",
        "--theme_color_input_text": "#e6f7fa",
        "--theme_color_main": "#14b8a6",
        "--theme_color_placeholder_text": "#91b0b7",
        "--theme_color_tabs": "#081f26",
        "--theme_color_tabs_highlight": "#0d2b34",
        "--theme_color_tabs_text": "#d8eef2",
        "--theme_color_text": "#e6f7fa",
        "--theme_color_topbtn": "#0c2a33",
        "--theme_color_topbtn_highlight": "#113742",
        "--theme_color_topmenu": "#0a252d",
        "--theme_color_topmenu_text": "#e6f7fa",
        "--theme_color_button_bg": "#0ea5a5",
        "--theme_color_button_text": "#ffffff"
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