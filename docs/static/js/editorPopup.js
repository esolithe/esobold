import "./ext/aceEditor/ace.js";
import "./ext/aceEditor/ext-language_tools.js";
let darkMode = true; // default to dark mode for the editor, since most people use dark mode and the editor looks better in dark mode
window.setupAceEditor = (container = document.body, contents = "", mode = "text") => {
    let themeChoice = darkMode ? "monokai" : "crimson_editor";
    if (!container.querySelector(".esoAceEditor")) {
        let editorDiv = document.createElement("div");
        editorDiv.classList.add("esoAceEditor");
        container.appendChild(editorDiv);

        ace.config.set('basePath', '../static/js/ext/aceEditor');
        window.editor = ace.edit(editorDiv);
        editor.setOptions({
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
        });
    }

    editor.setTheme(`ace/theme/${themeChoice}`);
    editor.session.setMode(`ace/mode/${mode}`);
    editor.setValue(contents);
    editor.clearSelection();
    editor.resize();
}
window.openEditorPopup = (contents = "", mode = "text", options = {}) => {
    let {
        title = "Editor Popup",
        submitLabel = "Submit",
        onSubmit = undefined,
    } = options;
    let popup = document.createElement("div");
    popup.classList.add("esoEditorPopup");

    popupUtils.reset();
    popupUtils.title(title);
    popupUtils.content(popup);
    popupUtils.css("height", "80vh");
    popupUtils.css("width", "80vw");
    popupUtils.button(submitLabel, async () => {
        let editorContent = window.editor.getValue();
        if (typeof onSubmit === "function") {
            await onSubmit(editorContent);
            return;
        }
        console.log("Editor content submitted:", editorContent);
        popupUtils.reset();
    });
    popupUtils.button("Light / Dark Mode", () => {
        darkMode = !darkMode;
        let themeChoice = darkMode ? "monokai" : "crimson_editor";
        editor.setTheme(`ace/theme/${themeChoice}`);
    });
    popupUtils.button("Close", () => {
        popupUtils.reset();
    }); 
    popupUtils.show();

    setupAceEditor(popup, contents, mode);
}
const fileExtensionToAceMode = {
    // JavaScript / TypeScript
    "js": "javascript", "mjs": "javascript", "cjs": "javascript",
    "ts": "typescript",
    "jsx": "jsx", "tsx": "tsx",
    // Web
    "html": "html", "htm": "html", "xhtml": "html",
    "css": "css",
    "scss": "scss", "sass": "sass",
    "less": "less",
    "styl": "stylus",
    "svg": "svg",
    "vue": "vue",
    // Data / Config
    "json": "json", "json5": "json5",
    "yaml": "yaml", "yml": "yaml",
    "toml": "toml",
    "ini": "ini", "properties": "properties",
    "csv": "csv", "tsv": "tsv",
    "xml": "xml",
    "proto": "protobuf",
    // Markup / Docs
    "md": "markdown", "markdown": "markdown",
    "rst": "rst",
    "tex": "latex", "latex": "latex",
    "textile": "textile",
    "asciidoc": "asciidoc", "adoc": "asciidoc",
    // Shell / Script
    "sh": "sh", "bash": "sh", "zsh": "sh",
    "ps1": "powershell", "psm1": "powershell",
    "bat": "batchfile", "cmd": "batchfile",
    // C family
    "c": "c_cpp", "h": "c_cpp",
    "cpp": "c_cpp", "cc": "c_cpp", "cxx": "c_cpp", "hpp": "c_cpp", "hxx": "c_cpp",
    "cs": "csharp",
    "m": "objectivec",
    // JVM
    "java": "java",
    "kt": "kotlin", "kts": "kotlin",
    "scala": "scala",
    "groovy": "groovy",
    // Python
    "py": "python", "pyw": "python",
    // Go / Rust / Zig / Swift / Dart
    "go": "golang",
    "rs": "rust",
    "zig": "zig",
    "swift": "swift",
    "dart": "dart",
    // Ruby / Crystal
    "rb": "ruby",
    "cr": "crystal",
    // PHP
    "php": "php",
    // Functional
    "hs": "haskell", "lhs": "haskell",
    "cabal": "haskell_cabal",
    "ex": "elixir", "exs": "elixir",
    "erl": "erlang", "hrl": "erlang",
    "clj": "clojure", "cljs": "clojure", "cljc": "clojure",
    "fs": "fsharp", "fsi": "fsharp", "fsx": "fsharp",
    "ml": "ocaml", "mli": "ocaml",
    "elm": "elm",
    "lisp": "lisp", "el": "lisp",
    "scm": "scheme",
    // Scripting
    "lua": "lua",
    "r": "r",
    "jl": "julia",
    "coffee": "coffee",
    "pl": "perl", "pm": "perl",
    "tcl": "tcl",
    "vbs": "vbscript",
    "nim": "nim",
    "odin": "odin",
    // SQL
    "sql": "sql",
    "pgsql": "pgsql",
    "plsql": "plsql",
    // DevOps / Infra
    "dockerfile": "dockerfile",
    "tf": "terraform", "tfvars": "terraform",
    "nix": "nix",
    // GLSL / Shaders
    "glsl": "glsl", "vert": "glsl", "frag": "glsl",
    // Misc
    "gitignore": "gitignore",
    "diff": "diff", "patch": "diff",
    "makefile": "makefile",
    "nginx": "nginx",
    "vhd": "vhdl", "vhdl": "vhdl",
    "v": "verilog", "sv": "verilog",
    "hbs": "handlebars",
    "twig": "twig",
    "jade": "jade", "pug": "jade",
    "haml": "haml",
    "dot": "dot",
};
window.openEditorForFileSystem = async (filePath, options = {}) => {
    let {
        title = `Edit ${filePath}`,
        submitLabel = "Save",
        onSaveSuccess = undefined,
        onSaveError = undefined,
    } = options;
    let fileMetadata = await fsClient.metadata([{path:filePath}])
    if (!!fileMetadata && fileMetadata.success && !fileMetadata.binary) {
        let fileExtension = filePath.split(".").splice(-1)[0].toLowerCase();
        let aceMode = fileExtensionToAceMode[fileExtension] ?? "text";
        let fileContents = await fsClient.content([{path:filePath}]);
        if (!!fileContents && fileContents.success) {
            let content = fileContents.lines.map(lineObj => lineObj.content).join("\n");
            window.openEditorPopup(content, aceMode, {
                title,
                submitLabel,
                onSubmit: async (editorContent) => {
                    try {
                        let writeResult = await fsClient.write([{ path: filePath, content: editorContent }]);
                        if (!writeResult?.success) {
                            throw new Error(writeResult?.error || "unknown error");
                        }
                        if (typeof onSaveSuccess === "function") {
                            await onSaveSuccess(writeResult, editorContent);
                        }
                        popupUtils.reset();
                    } catch (error) {
                        if (typeof onSaveError === "function") {
                            await onSaveError(error);
                            return;
                        }
                        throw error;
                    }
                },
            });
        }
    }
}