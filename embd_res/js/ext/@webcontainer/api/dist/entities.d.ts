import type { PreviewMessageType } from './preview-message-types';
export declare type Unsubscribe = () => void;
/**
 * A simple, tree-like structure to describe the contents of a folder to be mounted.
 *
 * @example
 * ```
 * const tree = {
 *   myproject: {
 *     directory: {
 *       'foo.js': {
 *         file: {
 *           contents: 'const x = 1;',
 *         },
 *       },
 *       .envrc: {
 *         file: {
 *           contents: 'ENVIRONMENT=staging'
 *         }
 *       },
 *     },
 *   },
 *   emptyFolder: {
 *     directory: {}
 *   },
 * };
 * ```
 */
export interface FileSystemTree {
    [name: string]: DirectoryNode | FileNode | SymlinkNode;
}
/**
 * Represents a directory, see {@link FileSystemTree}.
 */
export interface DirectoryNode {
    directory: FileSystemTree;
}
/**
 * Represents a file, see {@link FileSystemTree}.
 */
export interface FileNode {
    file: {
        /**
         * The contents of the file, either as a UTF-8 string or as raw binary.
         */
        contents: string | Uint8Array;
    };
}
/**
 * Represents a symlink, see {@link FileSystemTree}.
 */
export interface SymlinkNode {
    file: {
        /**
         * The target of the symlink.
         */
        symlink: string;
    };
}
/**
 * Module to authenticate users. Once authenticated, the WebContainer instance
 * can fetch private packages to which the user has access.
 *
 * If you use this module, you should call `auth.init()` once at application initialization time.
 * If you do server side rendering, it should be called on any page that uses the API.
 *
 * The AuthAPI uses OAuth 2.0 with PKCE and reads parameters from the URL:
 *
 *  - `code`:  This contains the OAuth code needed to get credentials.
 *  - `error`: This contains an error message if authentication fails.
 *             Typically, if the user declines the authorization.
 */
export interface AuthAPI {
    /**
     * Intialize the authentication for use in WebContainer.
     *
     * @param options Options to initialize the authentication of users.
     */
    init(options: AuthInitOptions): {
        status: 'need-auth' | 'authorized';
    } | AuthFailedError;
    /**
     * This starts the OAuth flow, redirecting the current page to the
     * StackBlitz editor to authenticate the user.
     *
     * @param options If `options.popup` is set to true, then instead of redirecting the current page, a popup is opened.
     */
    startAuthFlow(options?: {
        popup?: boolean;
    }): void;
    /**
     * Returns a promise that resolves when the user authorized your application.
     * This promise is guaranteed to never be rejected.
     *
     * If the user never authorizes or declines your application, this promise never
     * resolves.
     *
     * ### Example:
     *
     * ```ts
     * const instance = await WebContainer.boot();
     *
     * // wait until the user is logged in
     * await auth.loggedIn();
     *
     * // we can now fetch packages
     * await instance.spawn('npm', ['install']);
     * ```
     */
    loggedIn(): Promise<void>;
    /**
     * Logout the user and clear any credentials that were saved locally.
     *
     * @param options If `ignoreRevokeError` is set and the revocation failed, the locally-saved credentials are discarded nonetheless.
     */
    logout(options?: {
        ignoreRevokeError?: boolean;
    }): Promise<void>;
    /**
     * Listens for 'logged-out' events, which are emitted when the credentials are revoked, meaning the user needs to re-authenticate.
     */
    on(event: 'logged-out', listener: () => void): Unsubscribe;
    /**
     * Listens for 'auth-failed' events, which are emitted when the user declines authorization in another tab / popup.
     */
    on(event: 'auth-failed', listener: (reason: {
        error: string;
        description: string;
    }) => void): Unsubscribe;
}
/**
 * Options provided to `auth.init(...)`.
 */
export interface AuthInitOptions {
    /**
     * StackBlitz' origin.
     *
     * @default https://stackblitz.com
     */
    editorOrigin?: string;
    /**
     * The client id for this OAuth application.
     */
    clientId: string;
    /**
     * OAuth scope.
     *
     * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.3
     */
    scope: string;
}
/**
 * Authentication error used when authentication fails, likely because the user refused to grant
 * access or because they don't have permission.
 */
export interface AuthFailedError {
    status: 'auth-failed';
    /**
     * A short description of the error.
     */
    error: string;
    /**
     * A detailed description of the error.
     */
    description: string;
}
export declare type PreviewMessage = (UncaughtExceptionMessage | UnhandledRejectionMessage | ConsoleErrorMessage) & BasePreviewMessage;
export interface BasePreviewMessage {
    previewId: string;
    port: number;
    pathname: string;
    search: string;
    hash: string;
}
export interface UncaughtExceptionMessage {
    type: PreviewMessageType.UncaughtException;
    message: string;
    stack: string | undefined;
}
export interface UnhandledRejectionMessage {
    type: PreviewMessageType.UnhandledRejection;
    message: string;
    stack: string | undefined;
}
export interface ConsoleErrorMessage {
    type: PreviewMessageType.ConsoleError;
    args: any[];
    stack: string;
}
export interface ExportOptions {
    /**
     * The format of the export.
     *
     * @default json
     */
    format?: 'json' | 'binary' | 'zip';
    /**
     * Globbing patterns to include files from within excluded folders.
     */
    includes?: string[];
    /**
     * Globbing patterns to exclude files from the export.
     */
    excludes?: string[];
}
export interface PreviewScriptOptions {
    type?: 'module' | 'importmap';
    defer?: boolean;
    async?: boolean;
}
export declare type CodeEventType = 'open' | 'diff';
export interface CodeEventFile {
    filepath: string;
    line?: number;
    column?: number;
}
export interface CodeEvent {
    files: CodeEventFile[];
}
