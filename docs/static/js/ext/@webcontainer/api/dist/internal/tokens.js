import { STORAGE_TOKENS_NAME } from './constants.js';
import { TypedEventTarget } from './TypedEventTarget.js';
const IGNORED_ERROR = new Error();
IGNORED_ERROR.stack = '';
const accessTokenChangedListeners = new TypedEventTarget();
/**
 * @internal
 */
export class Tokens {
    origin;
    refresh;
    access;
    expires;
    _revoked = new AbortController();
    constructor(
    // editor origin that those tokens are bound to, mostly used for development
    origin, 
    // token to use to get a new access token
    refresh, 
    // token to provide to webcontainer
    access, 
    // time in UTC when the token expires
    expires) {
        this.origin = origin;
        this.refresh = refresh;
        this.access = access;
        this.expires = expires;
    }
    async activate(onFailedRefresh) {
        if (this._revoked.signal.aborted) {
            throw new Error('Token revoked');
        }
        // if the access token expired we fetch a new one
        if (this.expires < Date.now()) {
            if (!(await this._fetchNewAccessToken())) {
                return false;
            }
        }
        this._sync();
        this._startRefreshTokensLoop(onFailedRefresh);
        return true;
    }
    async revoke(clientId, ignoreRevokeError) {
        this._revoked.abort();
        try {
            const response = await fetch(`${this.origin}/oauth/revoke`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({ token: this.refresh, token_type_hint: 'refresh_token', client_id: clientId }),
                mode: 'cors',
            });
            if (!response.ok) {
                throw new Error(`Failed to logout`);
            }
        }
        catch (error) {
            if (!ignoreRevokeError) {
                throw error;
            }
        }
        clearTokensInStorage();
    }
    static fromStorage() {
        const savedTokens = readTokensFromStorage();
        if (!savedTokens) {
            return null;
        }
        return new Tokens(savedTokens.origin, savedTokens.refresh, savedTokens.access, savedTokens.expires);
    }
    static async fromAuthCode({ editorOrigin, clientId, codeVerifier, authCode, redirectUri, }) {
        const response = await fetch(`${editorOrigin}/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: clientId,
                code: authCode,
                code_verifier: codeVerifier,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }),
            mode: 'cors',
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch token: ${response.status}`);
        }
        const tokenResponse = await response.json();
        assertTokenResponse(tokenResponse);
        const { access_token: access, refresh_token: refresh } = tokenResponse;
        const expires = getExpiresFromTokenResponse(tokenResponse);
        return new Tokens(editorOrigin, refresh, access, expires);
    }
    async _fetchNewAccessToken() {
        try {
            const response = await fetch(`${this.origin}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refresh,
                }),
                mode: 'cors',
                signal: this._revoked.signal,
            });
            if (!response.ok) {
                throw IGNORED_ERROR;
            }
            const tokenResponse = await response.json();
            assertTokenResponse(tokenResponse);
            const { access_token: access, refresh_token: refresh } = tokenResponse;
            const expires = getExpiresFromTokenResponse(tokenResponse);
            this.access = access;
            this.expires = expires;
            this.refresh = refresh;
            return true;
        }
        catch {
            clearTokensInStorage();
            return false;
        }
    }
    _sync() {
        persistTokensInStorage(this);
        fireAccessTokenChanged(this.access);
    }
    async _startRefreshTokensLoop(onFailedRefresh) {
        while (true) {
            const expiresIn = this.expires - Date.now() - 1000;
            await wait(Math.max(expiresIn, 1000));
            if (this._revoked.signal.aborted) {
                return;
            }
            if (!this._fetchNewAccessToken()) {
                onFailedRefresh();
                return;
            }
            this._sync();
        }
    }
}
/**
 * @internal
 */
export function clearTokensInStorage() {
    localStorage.removeItem(STORAGE_TOKENS_NAME);
}
/**
 * @internal
 */
export function addAccessTokenChangedListener(listener) {
    return accessTokenChangedListeners.listen(listener);
}
function readTokensFromStorage() {
    const serializedTokens = localStorage.getItem(STORAGE_TOKENS_NAME);
    if (!serializedTokens) {
        return null;
    }
    try {
        return JSON.parse(serializedTokens);
    }
    catch {
        return null;
    }
}
function persistTokensInStorage(tokens) {
    localStorage.setItem(STORAGE_TOKENS_NAME, JSON.stringify(tokens));
}
function getExpiresFromTokenResponse({ created_at, expires_in }) {
    return (created_at + expires_in) * 1000;
}
function assertTokenResponse(token) {
    if (typeof token !== 'object' || !token) {
        throw new Error('Invalid Token Response');
    }
    if (typeof token.access_token !== 'string' ||
        typeof token.refresh_token !== 'string' ||
        typeof token.created_at !== 'number' ||
        typeof token.expires_in !== 'number') {
        throw new Error('Invalid Token Response');
    }
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function fireAccessTokenChanged(accessToken) {
    accessTokenChangedListeners.fireEvent(accessToken);
}
