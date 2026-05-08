(() => {
    const AUTH_STATE_KEY = "openLumaraAuthState";

    let ensureAuthState = () => {
        if (!window[AUTH_STATE_KEY]) {
            window[AUTH_STATE_KEY] = {
                token: "",
                username: "",
                authInFlight: null,
            };
        }
        return window[AUTH_STATE_KEY];
    };

    let normalizeBaseUrl = (baseUrl) => {
        let resolved = `${baseUrl || (window.location.origin + "/openlumara")}`.trim();
        return resolved.replace(/\/+$/, "");
    };

    let formatHttpError = async (resp, contextLabel) => {
        let body = "";
        try {
            body = await resp.text();
        } catch (_err) {}
        return `${contextLabel} failed (${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""})${body ? `: ${body}` : ""}`;
    };

    let validateCachedToken = async (baseUrl, token) => {
        if (!token) {
            return false;
        }
        try {
            let resp = await fetch(`${baseUrl}/api/health`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                },
            });
            return resp.status === 200;
        } catch (_err) {
            return false;
        }
    };

    let loginAndCacheToken = async (baseUrl, username, password) => {
        let authState = ensureAuthState();
        let resp = await fetch(`${baseUrl}/api/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "charset": "utf-8",
            },
            body: JSON.stringify({ username, password }),
        });

        if (!resp.ok) {
            let errText = await formatHttpError(resp, "OpenLumara login");
            throw new Error(errText);
        }

        let body = await resp.json();
        let token = `${body?.token || ""}`.trim();
        if (!token) {
            throw new Error("OpenLumara login succeeded but no token was returned.");
        }

        authState.token = token;
        authState.username = username;
        return token;
    };

    let promptForCredentials = (initialUsername = "") => {
        return new Promise((resolve) => {
            if (!window.popupUtils) {
                resolve(null);
                return;
            }

            let body = document.createElement("div");

            let info = document.createElement("div");
            info.classList.add("menutext");
            info.style.marginBottom = "10px";
            info.innerText = "Please input your OpenLumara username and password.";

            let usernameInput = document.createElement("input");
            usernameInput.type = "text";
            usernameInput.classList.add("form-control");
            usernameInput.placeholder = "Username";
            usernameInput.value = `${initialUsername || ""}`;
            usernameInput.style.width = "100%";
            usernameInput.style.marginBottom = "10px";

            let passwordInput = document.createElement("input");
            passwordInput.type = "password";
            passwordInput.classList.add("form-control");
            passwordInput.placeholder = "Password";
            passwordInput.style.width = "100%";

            body.append(info, usernameInput, passwordInput);

            let didResolve = false;
            let finalize = (value) => {
                if (didResolve) {
                    return;
                }
                didResolve = true;
                document.removeEventListener("keydown", onKeyDown);
                popupUtils.reset();
                resolve(value);
            };

            let onKeyDown = (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    finalize({
                        username: `${usernameInput.value || ""}`.trim(),
                        password: `${passwordInput.value || ""}`,
                    });
                }
            };

            popupUtils.reset()
                .title("OpenLumara Login")
                .content(body)
                .css("min-width", "min(520px, 95vw)")
                .button("Confirm", () => {
                    finalize({
                        username: `${usernameInput.value || ""}`.trim(),
                        password: `${passwordInput.value || ""}`,
                    });
                })
                .button("Cancel", () => finalize(null))
                .show();

            document.addEventListener("keydown", onKeyDown);
            setTimeout(() => usernameInput.focus(), 0);
        });
    };

    window.clearOpenLumaraAuthToken = () => {
        let authState = ensureAuthState();
        authState.token = "";
    };

    window.getOpenLumaraAuthHeader = () => {
        let authState = ensureAuthState();
        if (!authState.token) {
            return {};
        }
        return {
            "Authorization": `Bearer ${authState.token}`,
        };
    };

    window.promptForOpenLumaraIdentity = async (callback, opts = {}) => {
        let authState = ensureAuthState();
        let baseUrl = normalizeBaseUrl(opts?.baseUrl);

        if (!window.is_using_kcpp_with_open_lumara_authenticated()) {
            if (typeof callback === "function") {
                await callback();
            }
            return true;
        }

        if (authState.authInFlight) {
            return authState.authInFlight;
        }

        authState.authInFlight = (async () => {
            if (authState.token) {
                let tokenIsValid = await validateCachedToken(baseUrl, authState.token);
                if (tokenIsValid) {
                    if (typeof callback === "function") {
                        await callback();
                    }
                    return true;
                }
                authState.token = "";
            }

            let creds = await promptForCredentials(authState.username || "");
            if (!creds) {
                return false;
            }

            let username = `${creds.username || ""}`.trim();
            let password = `${creds.password || ""}`;

            if (!username || !password) {
                if (typeof handleError === "function") {
                    handleError("OpenLumara login requires both username and password.");
                }
                return false;
            }

            try {
                await loginAndCacheToken(baseUrl, username, password);
                if (typeof callback === "function") {
                    await callback();
                }
                return true;
            } catch (err) {
                if (typeof handleError === "function") {
                    handleError(err);
                } else {
                    console.error(err);
                }
                return false;
            }
        })();

        try {
            return await authState.authInFlight;
        } finally {
            authState.authInFlight = null;
        }
    };
})();