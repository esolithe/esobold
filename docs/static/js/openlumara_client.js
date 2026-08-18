/**
 * OpenlumaraClient — async wrapper around the OpenLumara WebUI REST API.
 *
 * OpenLumara (formerly OptiClaw) is a FastAPI-based AI chat backend served at
 * a configurable sub-path of the current origin.  By default all requests go
 * to  <origin>/openlumara/...
 *
 * Example:
 *   const ol = new OpenlumaraClient();
 *   const status = await ol.getStatus();
 *   if (status.connected) {
 *       const result = await ol.sendMessage({ role: 'user', content: 'Hello!' });
 *       console.log(result.response);
 *   }
 */
class OpenlumaraClient {
    /**
     * @param {string} [base_url] - Root URL of the OpenLumara instance.
     *   Defaults to `<page-origin>/openlumara`.
     */
    constructor(base_url) {
        this.base_url = (base_url || (window.location.origin + '/openlumara')).replace(/\/+$/, '');
        this._socket = null;
        this._socketListeners = {};
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    _url(path, params) {
        const url = new URL(this.base_url + path);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v !== undefined && v !== null && v !== '') {
                    url.searchParams.set(k, v);
                }
            }
        }
        return url.toString();
    }

    _authHeaders(extraHeaders = {}) {
        let headers = { ...extraHeaders };
        if (typeof window.getOpenLumaraAuthHeader === "function") {
            headers = { ...window.getOpenLumaraAuthHeader(), ...headers };
        }
        return headers;
    }

    _normalizeApiEnvelope(payload) {
        if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'success') && Object.prototype.hasOwnProperty.call(payload, 'data')) {
            return {
                success: !!payload.success,
                data: payload.data,
                raw: payload,
            };
        }

        return {
            success: true,
            data: payload,
            raw: payload,
        };
    }

    _stringifyApiData(value) {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'string') {
            return value;
        }
        try {
            return JSON.stringify(value);
        } catch (_err) {
            return `${value}`;
        }
    }

    _emitSocketEvent(eventName, ...args) {
        let listeners = this._socketListeners?.[eventName];
        if (!listeners || listeners.size === 0) {
            return;
        }
        listeners.forEach(listener => {
            try {
                listener(...args);
            } catch (err) {
                console.error(`OpenLumara socket listener error for ${eventName}:`, err);
            }
        });
    }

    _extractSocketMessages(payload) {
        if (!payload) {
            return [];
        }

        if (Array.isArray(payload.messages)) {
            return payload.messages.filter(msg => !!msg && typeof msg === 'object');
        }

        if (payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)) {
            return [payload.message];
        }

        return [];
    }

    _emitSocketMessageCompatibilityEvents(payload, event) {
        let messages = this._extractSocketMessages(payload);
        if (messages.length === 0) {
            return;
        }

        this._emitSocketEvent('message_batch', {
            type: 'message_batch',
            messages,
            source_type: payload?.type || 'unknown',
            raw: payload,
        }, event);

        // Alias newer single-message events to legacy consumers listening for message_added.
        if (messages.length === 1 && payload?.type !== 'message_added') {
            this._emitSocketEvent('message_added', {
                type: 'message_added',
                message: messages[0],
                source_type: payload?.type || 'unknown',
                raw: payload,
            }, event);
        }
    }

    _buildSocketUrl() {
        const wsUrl = new URL(this.base_url + '/ws');
        wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

        const authHeader = this._authHeaders()?.Authorization || this._authHeaders()?.authorization || '';
        const token = `${authHeader}`.startsWith('Bearer ') ? `${authHeader}`.slice(7).trim() : '';
        if (token) {
            wsUrl.searchParams.set('token', token);
        }

        return wsUrl.toString();
    }

    _waitForSocketOpen(timeoutMs = 8000) {
        if (this.isSocketConnected()) {
            return Promise.resolve(this._socket);
        }

        const socket = this.connectSocket();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('OpenLumara WebSocket did not open in time'));
            }, timeoutMs);

            const onOpen = () => {
                cleanup();
                resolve(socket);
            };

            const onClose = () => {
                cleanup();
                reject(new Error('OpenLumara WebSocket closed before opening'));
            };

            const onError = () => {
                cleanup();
                reject(new Error('OpenLumara WebSocket failed to open'));
            };

            const cleanup = () => {
                clearTimeout(timeout);
                this.offSocket('open', onOpen);
                this.offSocket('close', onClose);
                this.offSocket('error', onError);
            };

            this.onSocket('open', onOpen);
            this.onSocket('close', onClose);
            this.onSocket('error', onError);
        });
    }

    async _sendMessageOverSocket(data, timeoutMs = 120000) {
        const payload = data && typeof data === 'object' ? data : { role: 'user', content: `${data ?? ''}` };
        let contentText = `${payload?.content ?? ''}`;
        if (!contentText.trim()) {
            throw new Error('Cannot send an empty message to OpenLumara.');
        }

        const preState = await this.getMessages().catch(() => ({ messages: [], count: 0 }));
        const previousCount = Number.isInteger(preState?.count)
            ? preState.count
            : (Array.isArray(preState?.messages) ? preState.messages.length : 0);

        const socket = await this._waitForSocketOpen();

        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('OpenLumara WebSocket send timed out'));
            }, timeoutMs);

            const onComplete = () => {
                cleanup();
                resolve();
            };

            const onErrorPayload = (socketPayload) => {
                cleanup();
                const err = socketPayload?.error || socketPayload?.message || 'unknown error';
                reject(new Error(`OpenLumara WebSocket error: ${err}`));
            };

            const onClose = () => {
                cleanup();
                reject(new Error('OpenLumara WebSocket closed before completion'));
            };

            const cleanup = () => {
                clearTimeout(timeout);
                this.offSocket('stream_complete', onComplete);
                this.offSocket('error', onErrorPayload);
                this.offSocket('close', onClose);
            };

            this.onSocket('stream_complete', onComplete);
            this.onSocket('error', onErrorPayload);
            this.onSocket('close', onClose);

            try {
                socket.send(JSON.stringify({ type: 'user_message', content: contentText }));
            } catch (err) {
                cleanup();
                reject(err);
            }
        });

        const postState = await this.getMessages();
        const messages = Array.isArray(postState?.messages) ? postState.messages : [];
        const newMessages = messages.slice(previousCount);
        const assistantMessage = [...newMessages].reverse().find(msg => msg?.role === 'assistant')
            || [...messages].reverse().find(msg => msg?.role === 'assistant')
            || null;

        const currentChat = await this.getCurrentChat().catch(() => ({}));
        const activeChat = currentChat?.chat || {};

        return {
            response: assistantMessage,
            total: Number.isInteger(postState?.count) ? postState.count : messages.length,
            current_chat: {
                id: activeChat?.id || postState?.current_chat_id || null,
                title: activeChat?.title || postState?.current_chat_title || '',
            },
        };
    }

    async _get(path, params) {
        const resp = await fetch(this._url(path, params), {
            headers: this._authHeaders(),
            credentials: 'include',
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`OpenLumara GET ${path} failed (${resp.status}): ${body}`);
        }
        return resp.json();
    }

    async _post(path, body_obj) {
        const resp = await fetch(this.base_url + path, {
            method: 'POST',
            headers: this._authHeaders({ 'Content-Type': 'application/json', 'charset': 'utf-8' }),
            body: JSON.stringify(body_obj ?? {}),
            credentials: 'include',
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`OpenLumara POST ${path} failed (${resp.status}): ${body}`);
        }
        return resp.json();
    }

    async _delete(path, body_obj) {
        const resp = await fetch(this.base_url + path, {
            method: 'DELETE',
            headers: this._authHeaders({ 'Content-Type': 'application/json', 'charset': 'utf-8' }),
            body: JSON.stringify(body_obj ?? {}),
            credentials: 'include',
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`OpenLumara DELETE ${path} failed (${resp.status}): ${body}`);
        }
        return resp.json();
    }

    // -------------------------------------------------------------------------
    // API Status & Connection
    // -------------------------------------------------------------------------

    /**
     * Get detailed API connection status.
     * @returns {Promise<{connected:boolean, server_ok:boolean, model:string|null,
     *   url_configured:boolean, key_configured:boolean, model_configured:boolean,
     *   error?:string, error_type?:string, action?:string}>}
     */
    async getStatus() {
        let connectionPayload = await this._get('/api/check_connection');
        let connection = this._normalizeApiEnvelope(connectionPayload);
        let connected = !!connection.success;

        let model = null;
        let modelCount = 0;
        if (connected) {
            try {
                let modelsResult = await this.listModels();
                let models = Array.isArray(modelsResult?.models) ? modelsResult.models : [];
                modelCount = models.length;
                let first = models[0];
                if (typeof first === 'string') {
                    model = first;
                } else if (first && typeof first === 'object') {
                    model = first.id || first.name || first.model || null;
                }
            } catch (_err) {
                // Best-effort enrichment; status should still work when model listing fails.
            }
        }

        return {
            connected,
            server_ok: connected,
            model,
            model_count: modelCount,
            url_configured: true,
            key_configured: true,
            model_configured: connected,
            error: connected ? undefined : this._stringifyApiData(connection.data) || 'not connected',
            action: connected ? '' : 'Verify OpenLumara API settings and use reconnect.',
        };
    }

    /**
     * Attempt to reconnect to the configured LLM API.
     * @returns {Promise<{success:boolean, error?:string, action?:string}>}
     */
    async reconnect() {
        let payload = await this._post('/api/reconnect');
        let result = this._normalizeApiEnvelope(payload);
        if (!result.success) {
            return {
                success: false,
                error: this._stringifyApiData(result.data) || 'reconnect failed',
            };
        }
        return { success: true };
    }

    /**
     * Disconnect from the LLM API.
     * @returns {Promise<{success:boolean}>}
     */
    async disconnect() {
        return {
            success: false,
            error: 'OpenLumara no longer exposes a dedicated disconnect endpoint.',
        };
    }

    /**
     * List models available from the connected LLM API.
     * @returns {Promise<{models:Array<{id:string, owned_by:string}>, error?:string}>}
     */
    async listModels() {
        let payload = await this._get('/api/models');
        let result = this._normalizeApiEnvelope(payload);
        let models = Array.isArray(result.data) ? result.data : [];
        return {
            models,
            success: result.success,
            error: result.success ? '' : this._stringifyApiData(result.data),
        };
    }

    // -------------------------------------------------------------------------
    // Messaging
    // -------------------------------------------------------------------------

    /**
     * Get all messages in the current chat context.
     * @returns {Promise<{messages:Array, count:number, current_chat_id:string|null}>}
     */
    async getMessages() {
        let current = await this.getCurrentChat();
        let chat = current?.chat || {};
        let messages = Array.isArray(chat?.messages) ? chat.messages : [];
        return {
            messages,
            count: messages.length,
            current_chat_id: chat?.id || null,
            current_chat_title: chat?.title || '',
            success: !!current?.success,
        };
    }

    /**
     * Get messages added since a specific index (used for polling).
     * @param {number} index - First message index to return.
     * @returns {Promise<{messages:Array, count:number, total:number,
     *   current_chat_id:string|null, current_chat_title:string, current_chat_tags:string[]}>}
     */
    async getMessagesSince(index) {
        let state = await this.getMessages();
        let allMessages = Array.isArray(state?.messages) ? state.messages : [];
        let firstIndex = Number.isInteger(index) ? index : 0;
        let filtered = allMessages.filter(msg => Number.isInteger(msg?.index) ? msg.index >= firstIndex : true);

        return {
            messages: filtered,
            count: filtered.length,
            total: allMessages.length,
            current_chat_id: state?.current_chat_id || null,
            current_chat_title: state?.current_chat_title || '',
        };
    }

    /**
     * Send a message and wait for the full AI response over WebSocket.
     * @param {object} data - Message data forwarded to the backend (at minimum `{role, content}`).
     * @returns {Promise<{response:object, total:number, current_chat:{id:string, title:string}}>}
     */
    async sendMessage(data) {
        return this._sendMessageOverSocket(data);
    }

    /**
     * Open a Server-Sent Events stream for an AI response.
     * Returns the raw EventSource-compatible fetch Response; callers are
     * responsible for reading the `data:` lines.
     * Events: `{id}` (start), `{type:"content",text}` (tokens),
     *         `{done:true, total}`, `{error:true, error_data}`, `{cancelled:true}`.
     * @param {object} data - Message data forwarded to the backend.
     * @returns {Promise<Response>}
     */
    async stream(data) {
        const resp = await fetch(this.base_url + '/stream', {
            method: 'POST',
            headers: this._authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(data ?? {}),
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`OpenLumara POST /stream failed (${resp.status}): ${body}`);
        }
        return resp;
    }

    /**
     * Edit a message in the current chat by index.
     * @param {number} index
     * @param {string} content - New message text.
     * @returns {Promise<{success:boolean, total?:number, error?:string}>}
     */
    async editMessage(index, content) {
        return this._post('/edit', { index, content });
    }

    /**
     * Delete a message and all subsequent messages.
     * @param {number} index
     * @returns {Promise<{success:boolean, remaining?:number, error?:string}>}
     */
    async deleteMessage(index) {
        return this._post('/delete', { index });
    }

    /**
     * Cancel an ongoing SSE stream.
     * @param {string} id - Stream ID returned by the initial `{id}` event.
     * @returns {Promise<{success:boolean}>}
     */
    async cancelStream(id) {
        return this._post('/cancel', { id });
    }

    /**
     * Upload a file or image and insert it into the chat context.
     * @param {string} filename
     * @param {string} contentB64 - Base64-encoded file contents (no data-URI prefix).
     * @param {string} mimetype - e.g. "image/png"
     * @param {boolean} [isImage=false]
     * @returns {Promise<{success:boolean, total:number, type:string}>}
     */
    async upload(filename, contentB64, mimetype, isImage = false) {
        return this._post('/upload', {
            filename,
            content: contentB64,
            mimetype,
            is_image: isImage,
        });
    }

    // -------------------------------------------------------------------------
    // Chat Management
    // -------------------------------------------------------------------------

    /**
     * List all saved chats (sorted newest first).
     * @returns {Promise<{chats:Array<{id:string, title:string, category:string,
     *   tags:string[], message_count:number, created:string, updated:string}>}>}
     */
    async listChats() {
        const pageSize = 100;
        let offset = 0;
        let chats = [];
        let hasMore = true;

        while (hasMore) {
            let payload = await this._get('/api/chats', { offset, limit: pageSize });
            let result = this._normalizeApiEnvelope(payload);
            if (!result.success) {
                throw new Error(`OpenLumara list chats failed: ${this._stringifyApiData(result.data)}`);
            }

            let page = Array.isArray(result.data?.messages) ? result.data.messages : [];
            chats.push(...page);

            hasMore = !!result.data?.has_more && page.length > 0;
            offset += page.length;
        }

        return { chats };
    }

    /**
     * Load an existing chat by its ID.
     * @param {string} id
     * @returns {Promise<{success:boolean, chat:{id:string, title:string,
     *   category:string, tags:string[], messages:Array, total:number}}>}
     */
    async loadChat(id) {
        let payload = await this._get(`/api/chat/load/${encodeURIComponent(id)}`);
        let result = this._normalizeApiEnvelope(payload);
        return {
            success: result.success,
            chat: result.success ? result.data : null,
            error: result.success ? '' : this._stringifyApiData(result.data),
        };
    }

    /**
     * Get the currently active chat and its full message history.
     * @returns {Promise<{success:boolean, chat?:object, current_id?:null}>}
     */
    async getCurrentChat() {
        let payload = await this._get('/api/chat/current');
        let result = this._normalizeApiEnvelope(payload);
        return {
            success: result.success,
            chat: result.success ? result.data : null,
            error: result.success ? '' : this._stringifyApiData(result.data),
        };
    }

    /**
     * Rename the currently active chat.
     * @param {string} title
     * @returns {Promise<{success:boolean, title?:string, error?:string}>}
     */
    async renameChat(title) {
        let current = await this.getCurrentChat();
        let chatId = current?.chat?.id;
        if (!chatId) {
            return {
                success: false,
                error: 'No active chat selected.',
            };
        }

        let payload = await this._post(`/api/chat/rename/${encodeURIComponent(chatId)}`, { title });
        let result = this._normalizeApiEnvelope(payload);
        return {
            success: result.success,
            title,
            error: result.success ? '' : this._stringifyApiData(result.data),
        };
    }

    /**
     * Start a new, empty chat.
     * @param {string} [title]
     * @param {string} [category]
     * @returns {Promise<{success:boolean, chat:{id:string, title:string,
     *   category:string, messages:Array}}>}
     */
    async newChat(title, category) {
        const body = {};
        if (category) {
            body.category = category;
        }

        let payload = await this._post('/api/chat/new', body);
        let result = this._normalizeApiEnvelope(payload);
        if (!result.success) {
            return {
                success: false,
                error: this._stringifyApiData(result.data),
            };
        }

        let chatId = null;
        if (typeof result.data === 'string') {
            chatId = result.data;
        } else if (result.data && typeof result.data === 'object') {
            chatId = result.data.id || null;
        }

        if (chatId && title) {
            await this._post(`/api/chat/rename/${encodeURIComponent(chatId)}`, { title });
        }

        let chat = null;
        if (chatId) {
            let loaded = await this.loadChat(chatId);
            if (loaded?.success) {
                chat = loaded.chat;
            }
        }

        if (!chat) {
            let current = await this.getCurrentChat();
            chat = current?.chat || null;
        }

        return {
            success: true,
            chat,
        };
    }

    /**
     * Clear all messages from the current chat without deleting it.
     * @returns {Promise<{success:boolean}>}
     */
    async clearChat() {
        let current = await this.getCurrentChat();
        let currentId = current?.chat?.id;

        if (currentId) {
            let deleted = await this.deleteChat(currentId);
            if (!deleted?.success) {
                return deleted;
            }
        }

        let created = await this.newChat();
        if (!created?.success) {
            return created;
        }

        return {
            success: true,
            replaced_chat_id: currentId || null,
            new_chat_id: created?.chat?.id || null,
        };
    }

    /**
     * Delete a saved chat by ID.
     * @param {string} id
     * @returns {Promise<{success:boolean, error?:string}>}
     */
    async deleteChat(id) {
        let payload = await this._post(`/api/chat/delete/${encodeURIComponent(id)}`, {});
        let result = this._normalizeApiEnvelope(payload);
        return {
            success: result.success,
            error: result.success ? '' : this._stringifyApiData(result.data),
        };
    }

    // -------------------------------------------------------------------------
    // Tags
    // -------------------------------------------------------------------------

    /**
     * Get all unique tags across all saved chats.
     * @returns {Promise<{tags:string[]}>}
     */
    async getTags() {
        return this._get('/chat/tags');
    }

    /**
     * Replace the tag list on the current chat.
     * @param {string[]} tags
     * @returns {Promise<{success:boolean, tags:string[]}>}
     */
    async updateTags(tags) {
        return this._post('/chat/tags', { tags });
    }

    /**
     * Add a single tag to the current chat.
     * @param {string} tag
     * @returns {Promise<{success:boolean, tag:string}>}
     */
    async addTag(tag) {
        return this._post('/chat/tag', { tag });
    }

    /**
     * Remove a single tag from the current chat.
     * @param {string} tag
     * @returns {Promise<{success:boolean, tag:string}>}
     */
    async removeTag(tag) {
        return this._delete('/chat/tag', { tag });
    }

    // -------------------------------------------------------------------------
    // Settings
    // -------------------------------------------------------------------------

    /**
     * Load the full OpenLumara settings/config object.
     * @returns {Promise<object>}
     */
    async loadSettings() {
        let payload = await this._get('/api/settings/load');
        let result = this._normalizeApiEnvelope(payload);
        if (!result.success) {
            throw new Error(`OpenLumara settings load failed: ${this._stringifyApiData(result.data)}`);
        }
        return result.data;
    }

    /**
     * Save settings back to the OpenLumara config.
     * @param {object} config
     * @returns {Promise<{success:boolean}>}
     */
    async saveSettings(config) {
        let payload = await this._post('/api/settings/save', config);
        let result = this._normalizeApiEnvelope(payload);
        return { success: result.success };
    }

    // -------------------------------------------------------------------------
    // Storage Editor
    // -------------------------------------------------------------------------

    /**
     * List all user storage files managed by OpenLumara.
     * @returns {Promise<{files:Array<{path:string, type:string, name:string}>, data_dir:string}>}
     */
    async listStorage() {
        return this._get('/storage/list');
    }

    /**
     * Load a specific storage file.
     * @param {string} file - Relative path to the storage file.
     * @returns {Promise<{success:boolean, type:string, data:object|Array}>}
     */
    async loadStorage(file) {
        return this._get('/storage/load', { file });
    }

    /**
     * Save a storage file (full overwrite).
     * @param {string} file
     * @param {string} type - e.g. "dict" or "list"
     * @param {object|Array} data
     * @returns {Promise<{success:boolean}>}
     */
    async saveStorage(file, type, data) {
        return this._post('/storage/save', { file, type, data });
    }

    /**
     * Delete a key from a dict-type storage file.
     * @param {string} file
     * @param {string} key
     * @returns {Promise<{success:boolean, keys:string[], data:object}>}
     */
    async deleteStorageKey(file, key) {
        return this._post('/storage/delete-key', { file, key });
    }

    /**
     * Add a new key to a dict-type storage file.
     * @param {string} file
     * @param {string} key
     * @returns {Promise<{success:boolean, keys:string[], data:object}>}
     */
    async addStorageKey(file, key) {
        return this._post('/storage/add-key', { file, key });
    }

    // -------------------------------------------------------------------------
    // Server Control
    // -------------------------------------------------------------------------

    /**
     * Restart the OpenLumara server process.
     * @returns {Promise<{success:boolean}>}
     */
    async restartServer() {
        let payload = await this._post('/api/system/restart', {});
        let result = this._normalizeApiEnvelope(payload);
        return { success: result.success };
    }

    // -------------------------------------------------------------------------
    // WebSocket Updates
    // -------------------------------------------------------------------------

    connectSocket() {
        if (this._socket && (this._socket.readyState === WebSocket.OPEN || this._socket.readyState === WebSocket.CONNECTING)) {
            return this._socket;
        }

        const socket = new WebSocket(this._buildSocketUrl());
        this._socket = socket;

        socket.onopen = (event) => {
            this._emitSocketEvent('open', event);
        };

        socket.onmessage = (event) => {
            let payload = null;
            try {
                payload = JSON.parse(event.data);
            } catch (_err) {
                return;
            }

            this._emitSocketEvent('message', payload, event);
            if (payload?.type) {
                this._emitSocketEvent(payload.type, payload, event);
            }

            this._emitSocketMessageCompatibilityEvents(payload, event);
        };

        socket.onerror = (event) => {
            this._emitSocketEvent('error', event);
        };

        socket.onclose = (event) => {
            if (this._socket === socket) {
                this._socket = null;
            }
            this._emitSocketEvent('close', event);
        };

        return socket;
    }

    disconnectSocket() {
        if (this._socket) {
            this._socket.close();
            this._socket = null;
        }
    }

    isSocketConnected() {
        return !!this._socket && this._socket.readyState === WebSocket.OPEN;
    }

    onSocket(eventName, listener) {
        if (!this._socketListeners[eventName]) {
            this._socketListeners[eventName] = new Set();
        }
        this._socketListeners[eventName].add(listener);
    }

    offSocket(eventName, listener) {
        if (!this._socketListeners[eventName]) {
            return;
        }
        this._socketListeners[eventName].delete(listener);
    }
}

window.openlumaraClient = new OpenlumaraClient();
