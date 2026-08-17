/**
 * Implementation of https://www.rfc-editor.org/rfc/rfc7636#section-4.2 that can
 * run in the browser.
 *
 * @internal
 *
 * @param input Code verifier.
 */
export async function S256(input) {
    // input here is assumed to match https://www.rfc-editor.org/rfc/rfc3986#section-2.3
    const ascii = new TextEncoder().encode(input);
    const sha256 = new Uint8Array(await crypto.subtle.digest('SHA-256', ascii));
    // base64url encode, based on https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem
    return btoa(sha256.reduce((binary, byte) => binary + String.fromCodePoint(byte), ''))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
/**
 * Implementation of https://www.rfc-editor.org/rfc/rfc7636#section-4.1 with
 * a slight deviation:
 *
 *  - We use 128 characters (it's expected to be between 43 and 128)
 *  - We use 64 characters instead of 66
 *
 * So the entropy is lower given the space size is 64^128 instead of 66^128.
 * It still satisfies the entropy constraint given that 64^128 > 66^43.
 *
 * @internal
 */
export function newCodeVerifier() {
    const random = new Uint8Array(96);
    crypto.getRandomValues(random);
    let codeVerifier = '';
    for (let i = 0; i < 32; ++i) {
        codeVerifier += nextFourChars(random[3 * i + 0], random[3 * i + 1], random[3 * i + 2]);
    }
    return codeVerifier;
}
function nextFourChars(byte1, byte2, byte3) {
    const char1 = byte1 >> 2;
    const char2 = ((byte1 & 3) << 4) | (byte2 >> 4);
    const char3 = (byte2 & 15) | ((byte3 & 192) >> 2);
    const char4 = byte3 & 63;
    return [char1, char2, char3, char4].map(unreservedCharacters).join('');
}
function unreservedCharacters(code) {
    let offset;
    if (code < 26) {
        offset = code + 65; // [A-Z]
    }
    else if (code < 52) {
        offset = code - 26 + 97; // [a-z]
    }
    else if (code < 62) {
        offset = code - 52 + 48; // [0-9]
    }
    else {
        offset = code === 62 ? 30 /* _ */ : 45 /* - */;
    }
    return String.fromCharCode(offset);
}
