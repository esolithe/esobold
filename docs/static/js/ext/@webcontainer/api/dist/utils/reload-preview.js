/**
 * This function reloads the provided iframe.
 *
 * @param preview The iframe page to reload.
 * @param hardRefreshTimeout The timeout after which the preview is reset if it hasn't responded to the reload event.
 */
export function reloadPreview(preview, hardRefreshTimeout = 200) {
    const { port1, port2 } = new MessageChannel();
    let resolve;
    const promise = new Promise((_resolve) => {
        resolve = _resolve;
    });
    const done = () => {
        resolve();
        port2.close();
    };
    const timeout = setTimeout(() => {
        const iframeSrc = preview.src;
        preview.src = iframeSrc;
        done();
    }, hardRefreshTimeout);
    port2.addEventListener('message', (event) => {
        const data = event.data;
        if (data == null || typeof data !== 'object') {
            return;
        }
        if (data.type === 'LOCALSERVICE_WINDOW_RELOADED') {
            clearTimeout(timeout);
            done();
        }
    });
    preview.contentWindow?.postMessage({
        type: 'LOCALSERVICE_RELOAD_WINDOW',
        callback: port1,
    }, '*', [port1]);
    return promise;
}
