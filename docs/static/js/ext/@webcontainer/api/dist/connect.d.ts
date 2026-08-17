export interface ConnectOptions {
    /**
     * StackBlitz' origin.
     *
     * @default https://stackblitz.com
     */
    editorOrigin?: string;
}
/**
 * Function to call in a `/webcontainer/connect` path to connect a preview running in a separate tab
 * with webcontainer.
 */
export declare function setupConnect(options?: ConnectOptions): void;
