/**
 * OpenlumaraClient — async wrapper around the OpenLumara WebUI REST API.
 *
 * OpenLumara (formerly OptiClaw) is a Flask-based AI chat backend served at
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

    async _get(path, params) {
        const resp = await fetch(this._url(path, params), {
            headers: this._authHeaders(),
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
        return this._get('/api/status');
    }

    /**
     * Attempt to reconnect to the configured LLM API.
     * @returns {Promise<{success:boolean, error?:string, action?:string}>}
     */
    async reconnect() {
        return this._post('/api/reconnect');
    }

    /**
     * Disconnect from the LLM API.
     * @returns {Promise<{success:boolean}>}
     */
    async disconnect() {
        return this._post('/api/disconnect');
    }

    /**
     * List models available from the connected LLM API.
     * @returns {Promise<{models:Array<{id:string, owned_by:string}>, error?:string}>}
     */
    async listModels() {
        return this._get('/api/models');
    }

    // -------------------------------------------------------------------------
    // Messaging
    // -------------------------------------------------------------------------

    /**
     * Get all messages in the current chat context.
     * @returns {Promise<{messages:Array, count:number, current_chat_id:string|null}>}
     */
    async getMessages() {
        return this._get('/messages');
    }

    /**
     * Get messages added since a specific index (used for polling).
     * @param {number} index - First message index to return.
     * @returns {Promise<{messages:Array, count:number, total:number,
     *   current_chat_id:string|null, current_chat_title:string, current_chat_tags:string[]}>}
     */
    async getMessagesSince(index) {
        return this._get('/messages/since', { index });
    }

    /**
     * Send a message and wait for the full AI response.
     * @param {object} data - Message data forwarded to the backend (at minimum `{role, content}`).
     * @returns {Promise<{response:object, total:number, current_chat:{id:string, title:string}}>}
     */
    async sendMessage(data) {
        return this._post('/send', data);
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
        return this._get('/chats');
    }

    /**
     * Load an existing chat by its ID.
     * @param {string} id
     * @returns {Promise<{success:boolean, chat:{id:string, title:string,
     *   category:string, tags:string[], messages:Array, total:number}}>}
     */
    async loadChat(id) {
        return this._get('/chat/load', { id });
    }

    /**
     * Get the currently active chat and its full message history.
     * @returns {Promise<{success:boolean, chat?:object, current_id?:null}>}
     */
    async getCurrentChat() {
        return this._get('/chat/current');
    }

    /**
     * Rename the currently active chat.
     * @param {string} title
     * @returns {Promise<{success:boolean, title?:string, error?:string}>}
     */
    async renameChat(title) {
        return this._post('/chat/rename', { title });
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
        if (title) body.title = title;
        if (category) body.category = category;
        return this._post('/chat/new', body);
    }

    /**
     * Clear all messages from the current chat without deleting it.
     * @returns {Promise<{success:boolean}>}
     */
    async clearChat() {
        return this._post('/chat/clear');
    }

    /**
     * Delete a saved chat by ID.
     * @param {string} id
     * @returns {Promise<{success:boolean, error?:string}>}
     */
    async deleteChat(id) {
        return this._post('/chat/delete', { id });
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
        return this._get('/settings/load');
    }

    /**
     * Save settings back to the OpenLumara config.
     * @param {object} config
     * @returns {Promise<{success:boolean}>}
     */
    async saveSettings(config) {
        return this._post('/settings/save', config);
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
        return this._post('/server/restart');
    }
}

window.openlumaraClient = new OpenlumaraClient();
