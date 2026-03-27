/**
 * TmpfsClient — thin async wrapper around the KoboldCpp in-memory tmpfs API.
 *
 * All paths follow POSIX conventions (e.g. "/dir/file.txt").
 * base_url defaults to the current page origin; pass a different value when
 * talking to a remote KoboldCpp instance.
 *
 * Example:
 *   const fs = new TmpfsClient();
 *   await fs.write('/hello.txt', 'Hello, world!');
 *   const lines = await fs.content('/hello.txt');
 *   console.log(lines);
 */
class TmpfsClient {
    /**
     * @param {string} [base_url] - Root URL of the KoboldCpp instance (default: page origin).
     */
    constructor(base_url) {
        this.base_url = (base_url || window.location.origin).replace(/\/+$/, '');
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

    async _get(path, params) {
        const resp = await fetch(this._url(path, params));
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`tmpfs GET ${path} failed (${resp.status}): ${body}`);
        }
        const ct = resp.headers.get('content-type') || '';
        return ct.includes('application/json') ? resp.json() : resp;
    }

    async _post(path, body_obj) {
        const resp = await fetch(this.base_url + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body_obj),
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`tmpfs POST ${path} failed (${resp.status}): ${body}`);
        }
        return resp.json();
    }

    async _post_form(path, form_data) {
        const resp = await fetch(this.base_url + path, {
            method: 'POST',
            body: form_data,
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`tmpfs POST ${path} failed (${resp.status}): ${body}`);
        }
        return resp.json();
    }

    // -------------------------------------------------------------------------
    // File listing & searching
    // -------------------------------------------------------------------------

    /**
     * List all paths in the tmpfs, optionally filtered by a fnmatch glob pattern.
     * @param {string} [pattern='*']
     * @returns {Promise<string[]>}
     */
    async list(pattern, case_insensitive) {
        const data = await this._get('/api/extra/tmpfs/files', { pattern, case_insensitive });
        return data.paths;
    }

    /**
     * Search file contents for a text/regex pattern.
     * @param {string} pattern - Text pattern to search for inside files.
     * @param {string} [path_pattern='*'] - Glob filter applied to paths.
     * @param {number} [max_results=100]
     * @returns {Promise<Array<{path:string, line:number, text:string}>>}
     */
    async search(pattern, path_pattern, max_results, case_insensitive) {
        const data = await this._get('/api/extra/tmpfs/search', { pattern, path_pattern, max_results, case_insensitive });
        return data.matches;
    }

    // -------------------------------------------------------------------------
    // Metadata
    // -------------------------------------------------------------------------

    /**
     * Get metadata for a single file or overall tmpfs stats (pass empty path).
     * @param {string} [path='']
     * @returns {Promise<object>}
     */
    async metadata(path) {
        return this._get('/api/extra/tmpfs/metadata', { path: path || '' });
    }

    // -------------------------------------------------------------------------
    // Reading files
    // -------------------------------------------------------------------------

    /**
     * Get the public URL for a file stored in the tmpfs.
     * @param {string} path
     * @returns {Promise<{path:string, url:string}>}
     */
    async url(path) {
        return this._get('/api/extra/tmpfs/url', { path });
    }

    /**
     * Read lines from a text file.
     * @param {string} path
     * @param {number} [start=1] - 1-based start line (inclusive).
     * @param {number} [end]     - 1-based end line (inclusive). Omit for all.
     * @returns {Promise<{path:string, start_line:number, end_line:number, total_lines:number, lines:Array<{line:number,text:string}>}>}
     */
    async content(path, start, end) {
        return this._get('/api/extra/tmpfs/content', { path, start, end });
    }

    /**
     * Fetch the raw bytes of a file via the public /tmp/<path> route.
     * @param {string} path
     * @returns {Promise<Response>} Raw fetch Response; call .text(), .json(), .blob(), etc.
     */
    async fetch_raw(path) {
        const url = this._url('/tmp/' + path.replace(/^\/+/, ''));
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`tmpfs fetch_raw ${path} failed (${resp.status})`);
        }
        return resp;
    }

    /**
     * Download the entire tmpfs (or a sub-directory) as a zip file.
     * @param {string} [dir=''] - Optional virtual directory to zip, e.g. "/docs".
     * @returns {Promise<{url:string, file_count:number, size_bytes:number}>}
     */
    async download_info(dir) {
        return this._get('/api/extra/tmpfs/download', { dir: dir || '' });
    }

    /**
     * Fetch the zip archive directly as a Blob.
     * @param {string} [dir=''] - Optional virtual directory prefix to include.
     * @returns {Promise<Blob>}
     */
    async download_zip(dir) {
        const params = {};
        if (dir) { params.dir = dir; }
        const resp = await this._get('/tmp.zip', params);
        return resp.blob();
    }

    // -------------------------------------------------------------------------
    // Writing files
    // -------------------------------------------------------------------------

    /**
     * Write a file. Content may be a string or a Uint8Array / ArrayBuffer.
     * When content is binary (not a string), it is base64-encoded before sending.
     * @param {string} path
     * @param {string|Uint8Array|ArrayBuffer} content
     * @returns {Promise<{success:boolean, path:string, metadata:object}>}
     */
    async write(path, content, isB64 = false) {
        let payload_content;
        if (typeof content === 'string') {
            payload_content = content;
        } else {
            // Binary: encode to base64 so it travels safely over JSON
            const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
            payload_content = bytesToB64(bytes);
            isB64 = true;
        }
        return this._post('/api/extra/tmpfs/write', { path, content: payload_content, isB64 });
    }

    /**
     * Write or patch specific lines in a text file.
     * @param {string}   path
     * @param {string[]} lines       - Replacement lines (without trailing newlines).
     * @param {number}   [start_line=1] - 1-based line number where replacement starts.
     * @param {boolean}  [append=false] - If true, append lines instead of replacing.
     * @returns {Promise<{success:boolean, path:string, metadata:object}>}
     */
    async write_lines(path, lines, start_line, append) {
        return this._post('/api/extra/tmpfs/write_lines', { path, lines, start_line, append });
    }

    // -------------------------------------------------------------------------
    // File management
    // -------------------------------------------------------------------------

    /**
     * Delete a file.
     * @param {string} path
     * @returns {Promise<{success:boolean, path:string}>}
     */
    async delete(path) {
        return this._post('/api/extra/tmpfs/delete', { path });
    }

    /**
     * Move/rename a file.
     * @param {string} source
     * @param {string} destination
     * @returns {Promise<{success:boolean, source:string, destination:string, metadata:object}>}
     */
    async move(source, destination) {
        return this._post('/api/extra/tmpfs/move', { source, destination });
    }

    /**
     * Copy a file.
     * @param {string} source
     * @param {string} destination
     * @returns {Promise<{success:boolean, source:string, destination:string, metadata:object}>}
     */
    async copy(source, destination) {
        return this._post('/api/extra/tmpfs/copy', { source, destination });
    }

    /**
     * Create a directory.
     * @param {string} path
     * @returns {Promise<{success:boolean, path:string}>}
     */
    async mkdir(path) {
        return this._post('/api/extra/tmpfs/mkdir', { path });
    }

    /**
     * Delete a directory and all contents.
     * @param {string} path
     * @returns {Promise<{success:boolean, path:string, removed:number}>}
     */
    async rmdir(path) {
        return this._post('/api/extra/tmpfs/rmdir', { path });
    }

    /**
     * Extract a zip archive into a target directory.
     * This uses the upload endpoint, which auto-extracts .zip files.
     * @param {Blob|File|Uint8Array|ArrayBuffer} zip_data
     * @param {string} [dir='/']
     * @param {string} [filename='archive.zip']
     * @returns {Promise<{success:boolean, written:string[]}>}
     */
    async extract_zip(zip_data, dir = '/', filename = 'archive.zip') {
        const fd = new FormData();
        fd.append('dir', dir || '/');
        let zip_file = zip_data;
        if (!(zip_data instanceof Blob || zip_data instanceof File)) {
            const bytes = zip_data instanceof ArrayBuffer ? new Uint8Array(zip_data) : zip_data;
            zip_file = new Blob([bytes], { type: 'application/zip' });
        }
        fd.append('file', zip_file, filename);
        return this._post_form('/api/extra/tmpfs/upload', fd);
    }
}

window.tmpfsClient = new TmpfsClient()