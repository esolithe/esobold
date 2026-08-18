/**
 * This function reloads the provided iframe.
 *
 * @param preview The iframe page to reload.
 * @param hardRefreshTimeout The timeout after which the preview is reset if it hasn't responded to the reload event.
 */
export declare function reloadPreview(preview: HTMLIFrameElement, hardRefreshTimeout?: number): Promise<void>;
