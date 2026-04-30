import {Parser, Language} from './ext/web-tree-sitter.js';

// Maps common file extensions to the tree-sitter language name for the
// wasm grammars bundled in embd_res/js/ext/wasm/.
// Available grammars: bash, c, cpp, c_sharp, css, html, java, javascript,
//                     jsdoc, json, php, python, regex
const EXTENSION_TO_LANGUAGE = {
    // Bash / shell
    'sh': 'bash', 'bash': 'bash', 'zsh': 'bash', 'ksh': 'bash',
    // C
    'c': 'c', 'h': 'c',
    // C++
    'cpp': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'c++': 'cpp',
    'hpp': 'cpp', 'hh': 'cpp', 'hxx': 'cpp',
    // C#
    'cs': 'c_sharp',
    // CSS
    'css': 'css',
    // HTML
    'html': 'html', 'htm': 'html',
    // Java
    'java': 'java',
    // JavaScript / TypeScript (TypeScript grammar not bundled; fall back to JS)
    'js': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript',
    'ts': 'javascript', 'tsx': 'javascript', 'jsx': 'javascript',
    // JSDoc (virtual language — used internally by tree-sitter-javascript)
    // JSON
    'json': 'json', 'jsonc': 'json',
    // PHP
    'php': 'php',
    // Python
    'py': 'python', 'pyw': 'python',
    // Regex (virtual language)
};

/**
 * Return the tree-sitter language name for a given file extension (without
 * leading dot, case-insensitive), or `null` if no bundled grammar matches.
 *
 * @param {string} extension  e.g. "js", "py", "cpp"
 * @returns {string|null}
 */
export function fileExtensionToLanguageName(extension) {
    return EXTENSION_TO_LANGUAGE[extension.toLowerCase().replace(/^\./, '')] ?? null;
}

window.fileExtensionToLanguageName = fileExtensionToLanguageName;

await Parser.init();
const parser = new Parser();

let languageLoadPromises = {};

export async function loadGrammar(languageName) {
    const wasmPath = `static/js/ext/wasm/tree-sitter-${languageName}.wasm`;
    if (languageLoadPromises[wasmPath]) {
        return languageLoadPromises[wasmPath];
    }

    const loadPromise = Language.load(wasmPath).then((Language) => {
        parser.setLanguage(Language);
        return Language;
    });

    languageLoadPromises[wasmPath] = loadPromise;
    return loadPromise;
}

export async function prepParserForLanguage(languageName) {
    let language = await loadGrammar(languageName);
    parser.setLanguage(language);
    return parser;
}

// Symbol node types to extract (common across languages)
const SYMBOL_NODE_TYPES = new Set([
    'function_definition', 'function_declaration', 'method_definition', 'method_declaration',
    'class_definition', 'class_declaration', 'class_specifier',
    'variable_declaration', 'variable_declarator', 'lexical_declaration',
    'struct_specifier', 'enum_specifier', 'interface_declaration',
    'namespace_definition', 'module', 'type_alias_declaration',
    'function_item', 'impl_item', 'struct_item', 'enum_item', 'trait_item', // Rust
    'def_statement', 'class_statement', // misc
]);

// Extracts the identifier name from a node by looking for common name child node types
function extractSymbolName(node) {
    for (const child of node.children) {
        if (['identifier', 'name', 'property_identifier', 'type_identifier'].includes(child.type)) {
            return child.text;
        }
    }
    return null;
}

// Walk tree and collect all symbol nodes
function collectSymbols(node, symbols = []) {
    if (SYMBOL_NODE_TYPES.has(node.type)) {
        const name = extractSymbolName(node);
        symbols.push({
            type: node.type,
            name,
            startIndex: node.startIndex,
            endIndex: node.endIndex,
            startPosition: { row: node.startPosition.row, column: node.startPosition.column },
            endPosition: { row: node.endPosition.row, column: node.endPosition.column },
            text: node.text,
        });
    }
    for (const child of node.children) {
        collectSymbols(child, symbols);
    }
    return symbols;
}

/**
 * Parse `sourceCode` with the given language and return an array of symbol descriptors.
 * Each descriptor: { type, name, startIndex, endIndex, startPosition, endPosition, text }
 */
export async function getSymbols(languageName, sourceCode) {
    await prepParserForLanguage(languageName);
    const tree = parser.parse(sourceCode);
    return collectSymbols(tree.rootNode);
}

/**
 * Replace the text of a named symbol in `sourceCode` with `newText`.
 * Matches by `symbolName` (first occurrence).
 *
 * Before applying the replacement the new text is validated by parsing the
 * candidate result and checking for ERROR / missing nodes. If syntax errors
 * are found the edit is rejected and the function returns:
 *   { ok: false, errors: [...], result: null }
 *
 * On success it returns:
 *   { ok: true, errors: [], result: <modified source string> }
 *
 * If the symbol is not found it returns:
 *   { ok: false, errors: [{ message: 'Symbol not found', ... }], result: null }
 */
export async function editSymbol(languageName, sourceCode, symbolName, newText) {
    const symbols = await getSymbols(languageName, sourceCode);
    const match = symbols.find(s => s.name === symbolName);
    if (!match) {
        return { ok: false, errors: [{ kind: 'error', message: `Symbol not found: "${symbolName}"` }], result: null };
    }

    const candidate = sourceCode.slice(0, match.startIndex) + newText + sourceCode.slice(match.endIndex);

    // Validate the candidate by parsing it and collecting syntax errors
    await prepParserForLanguage(languageName);
    const tree = parser.parse(candidate);
    const syntaxErrors = collectErrors(tree.rootNode);
    if (syntaxErrors.length > 0) {
        return { ok: false, errors: syntaxErrors, result: null };
    }

    return { ok: true, errors: [], result: candidate };
}

// Walk tree collecting ERROR nodes
function collectErrors(node, errors = []) {
    if (node.type === 'ERROR' || node.isMissing) {
        errors.push({
            kind: node.isMissing ? 'error' : 'error',
            message: node.isMissing ? `Missing node: ${node.type}` : 'Syntax error',
            startIndex: node.startIndex,
            endIndex: node.endIndex,
            startPosition: { row: node.startPosition.row, column: node.startPosition.column },
            endPosition: { row: node.endPosition.row, column: node.endPosition.column },
            text: node.text,
        });
    }
    for (const child of node.children) {
        collectErrors(child, errors);
    }
    return errors;
}

/**
 * Parse `sourceCode` and return an array of syntax error descriptors.
 * Each descriptor: { kind: 'error', message, startIndex, endIndex, startPosition, endPosition, text }
 */
export async function detectErrors(languageName, sourceCode) {
    await prepParserForLanguage(languageName);
    const tree = parser.parse(sourceCode);
    return collectErrors(tree.rootNode);
}

// Walk tree collecting MISSING nodes (treated as warnings — partial/recoverable issues)
function collectWarnings(node, warnings = []) {
    if (node.isMissing) {
        warnings.push({
            kind: 'warning',
            message: `Missing expected node: ${node.type}`,
            startIndex: node.startIndex,
            endIndex: node.endIndex,
            startPosition: { row: node.startPosition.row, column: node.startPosition.column },
            endPosition: { row: node.endPosition.row, column: node.endPosition.column },
        });
    }
    // Unnamed (anonymous) nodes inside an ERROR are noisy; report the ERROR's children that
    // are not themselves ERROR nodes as potential warnings.
    if (node.type === 'ERROR') {
        for (const child of node.children) {
            if (child.type !== 'ERROR' && !child.isMissing) {
                warnings.push({
                    kind: 'warning',
                    message: `Unexpected token inside error region: "${child.text}"`,
                    startIndex: child.startIndex,
                    endIndex: child.endIndex,
                    startPosition: { row: child.startPosition.row, column: child.startPosition.column },
                    endPosition: { row: child.endPosition.row, column: child.endPosition.column },
                    text: child.text,
                });
            }
        }
    }
    for (const child of node.children) {
        collectWarnings(child, warnings);
    }
    return warnings;
}

/**
 * Parse `sourceCode` and return an array of warning descriptors for missing/unexpected nodes.
 * Each descriptor: { kind: 'warning', message, startIndex, endIndex, startPosition, endPosition, text? }
 */
export async function detectWarnings(languageName, sourceCode) {
    await prepParserForLanguage(languageName);
    const tree = parser.parse(sourceCode);
    return collectWarnings(tree.rootNode);
}

// window.loadGrammar = loadGrammar;
// window.prepParserForLanguage = prepParserForLanguage;
window.fileExtensionToLanguageName = fileExtensionToLanguageName;
window.getSymbols = getSymbols;
window.editSymbol = editSymbol;
window.detectErrors = detectErrors;
window.detectWarnings = detectWarnings;

/**
 * Test code to verify the loader and basic parsing functionality.
 */

// test = `let a = 1
// class Test {
// 	wave()
//   hello()
// }

// let j = (a, j) => {
// return true
// }

// function k(a, b, c) {
// return "test"
// }

// k();
// `
// await getSymbols("javascript", test)

// await editSymbol("javascript", test, "Test", "j = 5")

// await detectErrors("javascript", test)

// await detectWarnings("javascript", test)

// await getSymbols(fileExtensionToLanguageName("js"), test)