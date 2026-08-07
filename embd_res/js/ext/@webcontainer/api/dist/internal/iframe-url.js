import { DEFAULT_EDITOR_ORIGIN } from './constants.js';
const params = {};
let editorOrigin = null;
export const iframeSettings = {
    get editorOrigin() {
        if (editorOrigin == null) {
            editorOrigin = new URL(globalThis.WEBCONTAINER_API_IFRAME_URL ?? DEFAULT_EDITOR_ORIGIN).origin;
        }
        return editorOrigin;
    },
    set editorOrigin(newOrigin) {
        editorOrigin = new URL(newOrigin).origin;
    },
    setQueryParam(key, value) {
        params[key] = value;
    },
    get url() {
        const url = new URL(this.editorOrigin);
        url.pathname = '/headless';
        for (const param in params) {
            url.searchParams.set(param, params[param]);
        }
        url.searchParams.set('version', "1.6.4");
        return url;
    },
};
