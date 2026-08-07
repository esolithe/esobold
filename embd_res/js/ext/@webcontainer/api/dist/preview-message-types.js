/**
 * This type is in a separate module so that localservice can import it
 * without bundling all the other webcontainer specific stuff.
 */
export var PreviewMessageType;
(function (PreviewMessageType) {
    PreviewMessageType["UncaughtException"] = "PREVIEW_UNCAUGHT_EXCEPTION";
    PreviewMessageType["UnhandledRejection"] = "PREVIEW_UNHANDLED_REJECTION";
    PreviewMessageType["ConsoleError"] = "PREVIEW_CONSOLE_ERROR";
})(PreviewMessageType || (PreviewMessageType = {}));
