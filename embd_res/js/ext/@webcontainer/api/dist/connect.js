/**
 * Function to call in a `/webcontainer/connect` path to connect a preview running in a separate tab
 * with webcontainer.
 */
export function setupConnect(options = {}) {
    const currentURL = new URL(window.location.href);
    if (!currentURL.pathname.startsWith('/webcontainer/connect/')) {
        throw new Error(`This function must be used on a '/webcontainer/connect' endpoint. Used in ${currentURL.pathname}`);
    }
    if (!window.opener) {
        throw new Error(`This page must have an opener. You must serve it with appropriate headers`);
    }
    const editorOrigin = new URL(options.editorOrigin ?? 'https://stackblitz.com');
    editorOrigin.pathname = currentURL.pathname;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    // passthrough
    window.addEventListener('message', (event) => {
        if (event.data === 'close') {
            window.close();
            return;
        }
        const transferables = findMessagePorts(event.data);
        if (event.source === window.opener) {
            iframe.contentWindow.postMessage(event.data, '*', transferables);
        }
        else {
            window.opener.postMessage(event.data, '*', transferables);
        }
    });
    iframe.src = editorOrigin.toString();
    document.body.appendChild(iframe);
}
const EMPTY_ARRAY = [];
function findMessagePorts(data) {
    if (!data || typeof data !== 'object') {
        return EMPTY_ARRAY;
    }
    const result = [];
    for (const key in data) {
        const value = data[key];
        if (Object.prototype.toString.call(value) === '[object MessagePort]') {
            result.push(value);
            continue;
        }
        result.push(...findMessagePorts(value));
    }
    return result;
}
