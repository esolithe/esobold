import { Tokens, clearTokensInStorage } from './tokens.js';
import { SEARCH_PARAM_AUTH_CODE, SEARCH_PARAM_ERROR, STORAGE_CODE_VERIFIER_NAME, BROADCAST_CHANNEL_NAME, STORAGE_POPUP_NAME, SEARCH_PARAM_ERROR_DESCRIPTION, } from './constants.js';
import { iframeSettings } from './iframe-url.js';
import { S256, newCodeVerifier } from './code.js';
import { resettablePromise } from './reset-promise.js';
import { TypedEventTarget } from './TypedEventTarget.js';
/**
 * @internal
 */
export const authState = {
    initialized: false,
    bootCalled: false,
    authComplete: resettablePromise(),
    clientId: '',
    oauthScope: '',
    broadcastChannel: null,
    get editorOrigin() {
        return iframeSettings.editorOrigin;
    },
    tokens: null,
};
const authFailedListeners = new TypedEventTarget();
const loggedOutListeners = new TypedEventTarget();
function broadcastMessage(message) {
    if (!authState.broadcastChannel) {
        return;
    }
    authState.broadcastChannel.postMessage(message);
    // check if we are in a popup mode
    if (localStorage.getItem(STORAGE_POPUP_NAME) === 'true' && message.type !== 'auth-logout') {
        localStorage.removeItem(STORAGE_POPUP_NAME);
        // wait a tick to make sure the posted message has been sent
        setTimeout(() => {
            window.close();
        });
    }
}
export const auth = {
    init({ editorOrigin, clientId, scope }) {
        if (authState.initialized) {
            throw new Error('Init should only be called once');
        }
        let enterprise = true;
        if (enterprise && authState.bootCalled) {
            throw new Error('`auth.init` should always be called before `WebContainer.boot`');
        }
        authState.initialized = true;
        authState.tokens = Tokens.fromStorage();
        authState.clientId = clientId;
        authState.oauthScope = scope;
        authState.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        // configure iframe url
        iframeSettings.setQueryParam('client_id', clientId);
        if (editorOrigin) {
            iframeSettings.editorOrigin = new URL(editorOrigin).origin;
        }
        loggedOutListeners.listen(() => authState.authComplete.reset());
        // if authentication or logout are done in another page, we want to reflect the state on this page as well
        authState.broadcastChannel.addEventListener('message', onChannelMessage);
        async function onChannelMessage(event) {
            const typedEvent = event.data;
            if (typedEvent.type === 'auth-complete') {
                authState.tokens = Tokens.fromStorage();
                // we ignore the possible error here because they can't have expired just yet
                await authState.tokens.activate(onFailedTokenRefresh);
                authState.authComplete.resolve();
                return;
            }
            if (typedEvent.type === 'auth-failed') {
                authFailedListeners.fireEvent(typedEvent);
                return;
            }
            if (typedEvent.type === 'auth-logout') {
                loggedOutListeners.fireEvent();
                return;
            }
        }
        if (authState.tokens) {
            const tokens = authState.tokens;
            if (tokens.origin === authState.editorOrigin) {
                /**
                 * Here we assume that the refresh token never expires which
                 * might not be correct. If that is the case though, we will
                 * emit a 'logged-out' event to signal that the user has been
                 * logged out, which could also happen at a later time anyway.
                 *
                 * Because this flow is done entirely locally, we do not broadcast
                 * anything to the other tabs. They should be performing a similar
                 * check.
                 */
                (async () => {
                    const success = await tokens.activate(onFailedTokenRefresh);
                    if (!success) {
                        // if we got new token in the meantime we discard this error
                        if (authState.tokens !== tokens) {
                            return;
                        }
                        loggedOutListeners.fireEvent();
                        return;
                    }
                    authState.authComplete.resolve();
                })();
                return { status: 'authorized' };
            }
            clearTokensInStorage();
            authState.tokens = null;
        }
        const locationURL = new URL(window.location.href);
        const { searchParams } = locationURL;
        const updateURL = () => window.history.replaceState({}, document.title, locationURL);
        // check for errors first, aka the user declined the authorisation or stackblitz did
        if (searchParams.has(SEARCH_PARAM_ERROR)) {
            const error = searchParams.get(SEARCH_PARAM_ERROR);
            const description = searchParams.get(SEARCH_PARAM_ERROR_DESCRIPTION);
            searchParams.delete(SEARCH_PARAM_ERROR);
            searchParams.delete(SEARCH_PARAM_ERROR_DESCRIPTION);
            updateURL();
            broadcastMessage({ type: 'auth-failed', error, description });
            return { status: 'auth-failed', error, description };
        }
        // if there's an auth code
        if (searchParams.has(SEARCH_PARAM_AUTH_CODE)) {
            const authCode = searchParams.get(SEARCH_PARAM_AUTH_CODE);
            const editorOrigin = authState.editorOrigin;
            searchParams.delete(SEARCH_PARAM_AUTH_CODE);
            updateURL();
            const codeVerifier = localStorage.getItem(STORAGE_CODE_VERIFIER_NAME);
            if (!codeVerifier) {
                return { status: 'need-auth' };
            }
            localStorage.removeItem(STORAGE_CODE_VERIFIER_NAME);
            Tokens.fromAuthCode({
                editorOrigin,
                clientId: authState.clientId,
                authCode,
                codeVerifier,
                redirectUri: defaultRedirectUri(),
            })
                .then(async (tokens) => {
                authState.tokens = tokens;
                assertAuthTokens(authState.tokens);
                const success = await authState.tokens.activate(onFailedTokenRefresh);
                // if authentication failed we throw, and we'll mark auth as failed
                if (!success) {
                    throw new Error();
                }
                authState.authComplete.resolve();
                broadcastMessage({ type: 'auth-complete' });
            })
                .catch((error) => {
                // this should never happen unless the rails app is now down for some reason?
                console.error(error);
                // treat it as a logged out event so that the user can retry to login
                loggedOutListeners.fireEvent();
                broadcastMessage({ type: 'auth-logout' });
            });
            return { status: 'authorized' };
        }
        return { status: 'need-auth' };
    },
    async startAuthFlow({ popup } = {}) {
        if (!authState.initialized) {
            throw new Error('auth.init must be called first');
        }
        if (popup) {
            localStorage.setItem(STORAGE_POPUP_NAME, 'true');
            const height = 500;
            const width = 620;
            const left = window.screenLeft + (window.outerWidth - width) / 2;
            const top = window.screenTop + (window.outerHeight - height) / 2;
            window.open(await generateOAuthRequest(), '_blank', `popup,width=${width},height=${height},left=${left},top=${top}`);
        }
        else {
            window.location.href = await generateOAuthRequest();
        }
    },
    async logout({ ignoreRevokeError } = {}) {
        await authState.tokens?.revoke(authState.clientId, ignoreRevokeError ?? false);
        loggedOutListeners.fireEvent();
        broadcastMessage({ type: 'auth-logout' });
    },
    loggedIn() {
        return authState.authComplete.promise;
    },
    on(event, listener) {
        switch (event) {
            case 'auth-failed': {
                return authFailedListeners.listen(listener);
            }
            case 'logged-out': {
                return loggedOutListeners.listen(listener);
            }
            default: {
                throw new Error(`Unsupported event type '${event}'.`);
            }
        }
    },
};
function onFailedTokenRefresh() {
    loggedOutListeners.fireEvent();
    broadcastMessage({ type: 'auth-logout' });
}
function defaultRedirectUri() {
    return window.location.href;
}
async function generateOAuthRequest() {
    const codeVerifier = newCodeVerifier();
    localStorage.setItem(STORAGE_CODE_VERIFIER_NAME, codeVerifier);
    const codeChallenge = await S256(codeVerifier);
    const url = new URL('/oauth/authorize', authState.editorOrigin);
    const { searchParams } = url;
    searchParams.append('response_type', 'code');
    searchParams.append('client_id', authState.clientId);
    searchParams.append('redirect_uri', defaultRedirectUri());
    searchParams.append('scope', authState.oauthScope);
    searchParams.append('code_challenge', codeChallenge);
    searchParams.append('code_challenge_method', 'S256');
    return url.toString();
}
/**
 * @internal
 */
export function assertAuthTokens(tokens) {
    if (!tokens) {
        throw new Error('Oops! Tokens is not defined when it always should be.');
    }
}
