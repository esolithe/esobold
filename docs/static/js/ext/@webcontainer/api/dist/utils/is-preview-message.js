import { PreviewMessageType } from '../preview-message-types.js';
const PREVIEW_MESSAGE_TYPES = [
    PreviewMessageType.ConsoleError,
    PreviewMessageType.UncaughtException,
    PreviewMessageType.UnhandledRejection,
];
export function isPreviewMessage(data) {
    if (data == null || typeof data !== 'object') {
        return false;
    }
    if (!('type' in data) || !PREVIEW_MESSAGE_TYPES.includes(data.type)) {
        return false;
    }
    return true;
}
