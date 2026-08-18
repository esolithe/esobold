/**
 * This type is in a separate module so that localservice can import it
 * without bundling all the other webcontainer specific stuff.
 */
export declare enum PreviewMessageType {
    UncaughtException = "PREVIEW_UNCAUGHT_EXCEPTION",
    UnhandledRejection = "PREVIEW_UNHANDLED_REJECTION",
    ConsoleError = "PREVIEW_CONSOLE_ERROR"
}
