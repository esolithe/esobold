/**
 * FsClient — thin async wrapper around the KoboldCpp filesystem API.
 *
 * All paths follow POSIX conventions (e.g. "/dir/file.txt").
 * base_url defaults to the current page origin; pass a different value when
 * talking to a remote KoboldCpp instance.
 *
 * Example:
 *   const fs = new FsClient();
 *   await fs.write([{ path: '/hello.txt', content: 'Hello, world!' }]);
 *   const lines = await fs.content([{ path: '/hello.txt', start: 1, end: 100 }]);
 *   console.log(lines);
 */
class FsClient {
    // Text file extensions supported for semantic search (treated identically to .txt)
    static SEMANTIC_TEXT_EXTENSIONS = [
        '.txt', '.csv', '.tsv', '.md', '.json', '.xml', '.html', '.htm',
        '.yaml', '.yml', '.log', '.ini', '.cfg', '.conf', '.rst', '.tex',
    ];

    // Number of newly-generated embedding items written per progressive flush
    static EMBEDDING_PROGRESSIVE_WRITE_INTERVAL = 1000;

    /**
     * @param {string} [base_url] - Root URL of the KoboldCpp instance (default: page origin).
     */
    constructor(base_url) {
        this.base_url = (base_url || window.location.origin).replace(/\/+$/, '');
        this.fsModeCache = null;
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    _url(path, params) {
        const url = new URL(this.base_url + path);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (Array.isArray(v)) {
                    for (const item of v) {
                        if (item !== undefined && item !== null && item !== '') {
                            url.searchParams.append(k, item);
                        }
                    }
                } else if (v !== undefined && v !== null && v !== '') {
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
            throw new Error(`fs GET ${path} failed (${resp.status}): ${body}`);
        }
        const ct = resp.headers.get('content-type') || '';
        return ct.includes('application/json') ? resp.json() : resp;
    }

    async _post(path, body_obj) {
        const resp = await fetch(this.base_url + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'charset': 'utf-8' },
            body: JSON.stringify(body_obj),
        });
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            throw new Error(`fs POST ${path} failed (${resp.status}): ${body}`);
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
            throw new Error(`fs POST ${path} failed (${resp.status}): ${body}`);
        }
        return resp.json();
    }

    _normalize_path(path, allowRoot = false) {
        let normalized = `/${`${path || ''}`.replace(/\\/g, '/').replace(/^\/+/, '')}`.replace(/\/+/g, '/');
        normalized = normalized.replace(/\/\.\//g, '/');
        while (normalized.includes('/../')) {
            normalized = normalized.replace(/\/[^/]+\/\.\.\//, '/');
        }
        if (!allowRoot && normalized === '/') {
            throw new Error('Filesystem path must target a file.');
        }
        return normalized;
    }

    async _path_exists(path) {
        try {
            await this.metadata([{ path }]);
            return true;
        }
        catch {
            return false;
        }
    }

    async _read_text_file(path) {
        const resp = await this.fetch_raw(path);
        const buffer = await resp.arrayBuffer();
        return new TextDecoder('utf-8').decode(buffer);
    }

    _prepare_search_text(text) {
        let prepared = `${text || ''}`;
        if (typeof replace_search_placeholders === 'function') {
            return replace_search_placeholders(prepared);
        }
        return prepared;
    }

    _get_embedding_preset(modelName) {
        if (typeof embeddingPresets !== 'object' || !embeddingPresets) {
            return { query_prompt: '', document_prompt: '' };
        }
        const resolvedModelName = `${modelName || ''}`;
        const presetName = Object.keys(embeddingPresets).find((name) => resolvedModelName.includes(name));
        const preset = presetName ? embeddingPresets[presetName] : null;
        return {
            query_prompt: `${preset?.query_prompt || ''}`,
            document_prompt: `${preset?.document_prompt || ''}`,
        };
    }

    _get_chunking_settings() {
        let chunkSize = parseInt(documentdb_chunksize, 10);
        if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
            chunkSize = 1024;
        }
        return {
            chunkSize,
            chunkOverlap: Math.min(chunkSize * 0.5, 500),
        };
    }

    _get_embedding_api_batch_size() {
        const val = parseInt(typeof localsettings !== 'undefined' ? localsettings?.embeddingsBatchSize : 0, 10);
        return Number.isFinite(val) && val > 0 ? val : 100;
    }

    _derive_semantic_cache_paths(sourcePath) {
        const normalizedSourcePath = this._normalize_path(sourcePath);
        const sourceName = normalizedSourcePath.split('/').pop() || 'document.txt';
        const dotIndex = sourceName.lastIndexOf('.');
        const baseName = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName;
        const dirPath = normalizedSourcePath.slice(0, normalizedSourcePath.length - sourceName.length).replace(/\/$/, '') || '/';
        const prefix = dirPath === '/' ? '' : dirPath;
        return {
            sourcePath: normalizedSourcePath,
            dirPath,
            sourceName,
            baseName,
            rawTextPath: `${prefix}/${baseName}_rawtext.txt`,
            cachePath: `${prefix}/${baseName}_embeddings.jsonl`,
        };
    }

    async _extract_text_from_data_url(dataUrl) {
        const reqOpt = {
            method: 'POST',
            headers: get_kobold_header(),
            body: JSON.stringify({ docData: dataUrl }),
        };
        if (globalabortcontroller) {
            reqOpt.signal = globalabortcontroller.signal;
        }
        const sub_endpt = apply_proxy_url(`${custom_kobold_endpoint}/api/extra/extractText`);
        const response = await fetch(sub_endpt, reqOpt);
        const data = await response.json();
        return `${data?.text || ''}`;
    }

    async _extract_source_text(sourcePath, sourceExt) {
        if (sourceExt === '.txt') {
            return await this._read_text_file(sourcePath);
        }
        const rawResp = await this.fetch_raw(sourcePath);
        const bytes = new Uint8Array(await rawResp.arrayBuffer());
        const mimeType = sourceExt === '.pdf' ? 'application/pdf' : 'text/plain';
        const dataUrl = `data:${mimeType};base64,${bytesToB64(bytes)}`;
        if (sourceExt !== '.pdf') {
            // Plain text variant — decode directly without the extractText server round-trip
            return new TextDecoder('utf-8').decode(bytes);
        }
        if (window.documentParser && typeof window.documentParser.extractTextFromB64 === 'function') {
            return `${await window.documentParser.extractTextFromB64(dataUrl) || ''}`;
        }
        return await this._extract_text_from_data_url(dataUrl);
    }

    _chunk_raw_text(rawText, defaultDocumentName, documentPrefix) {
        const preparedText = this._prepare_search_text(rawText);
        const { chunkSize, chunkOverlap } = this._get_chunking_settings();
        const chunks = [];
        let docs = preparedText.split('[DOCUMENT BREAK]');
        if (docs.length === 0) {
            docs = [preparedText];
        }
        for (const rawDoc of docs) {
            let doc = `${rawDoc || ''}`.trim();
            if (!doc) {
                continue;
            }
            let startLoc = 0;
            while (startLoc < doc.length) {
                const actualChunkStart = Math.max(0, startLoc - chunkOverlap);
                const actualChunkEnd = Math.min(doc.length, actualChunkStart + chunkSize);
                const currentSnippet = doc.substring(actualChunkStart, actualChunkEnd).replace(/\n\n/g, '\n').trim();
                if (currentSnippet !== '') {
                    const embeddingInput = `${documentPrefix || ''}${currentSnippet}`;
                    chunks.push({
                        hash: cyrb_hash(`${embeddingInput || ''}`, 0, 8),
                        snippet: currentSnippet,
                        embeddingInput,
                        document: defaultDocumentName,
                    });
                }
                startLoc = actualChunkEnd;
            }
        }
        return chunks;
    }

    async _load_fs_json(path) {
        if (!(await this._path_exists(path))) {
            return {};
        }
        try {
            return JSON.parse(await this._read_text_file(path));
        }
        catch {
            return {};
        }
    }

    /**
     * Load an embeddings cache file, supporting both the legacy JSON format (v1)
     * and the new JSONL format (v2).  Returns { meta, existingHashes } where
     * existingHashes is a Set of hash strings for deduplication without keeping
     * full embedding vectors in JS memory.
     */
    async _load_embeddings_cache(cachePath) {
        if (!(await this._path_exists(cachePath))) {
            return { meta: null, existingHashes: new Set() };
        }
        let rawText = '';
        try {
            rawText = (await this._read_text_file(cachePath)).trim();
        } catch {
            return { meta: null, existingHashes: new Set() };
        }
        if (!rawText) {
            return { meta: null, existingHashes: new Set() };
        }
        // Detect JSONL (v2): first non-empty line contains "type":"meta"
        const firstLine = rawText.split('\n')[0].trim();
        if (firstLine.includes('"type"') && firstLine.includes('"meta"')) {
            const meta = (() => { try { return JSON.parse(firstLine); } catch { return null; } })();
            const existingHashes = new Set();
            for (const line of rawText.split('\n')) {
                const l = line.trim();
                if (!l) continue;
                try {
                    const obj = JSON.parse(l);
                    if (obj.type === 'item' && obj.hash) {
                        existingHashes.add(obj.hash);
                    }
                } catch { /* skip malformed lines */ }
            }
            return { meta, existingHashes };
        }
        // Legacy JSON (v1): parse the whole object and extract hashes
        try {
            const legacyObj = JSON.parse(rawText);
            return { meta: null, existingHashes: new Set(), legacy: legacyObj };
        } catch {
            return { meta: null, existingHashes: new Set() };
        }
    }

    /**
     * Write the JSONL header (meta) line, replacing any existing cache file.
     */
    async _write_embeddings_cache_header(cachePath, metaData) {
        const headerLine = JSON.stringify({ type: 'meta', ...metaData });
        await this.write([{ path: cachePath, content: headerLine + '\n' }]);
    }

    /**
     * Append a batch of embedding items to the JSONL cache file.
     * Each item is written as a single JSON line.
     */
    async _append_embeddings_items(cachePath, items) {
        if (!items || items.length === 0) return;
        const lines = items.map(item => JSON.stringify({ type: 'item', ...item }));
        await this.write_lines([{ path: cachePath, lines, append: true }]);
    }

    async _generate_embeddings_for_chunks(chunks, modelName) {
        const generated = [];
        const apiBatchSize = this._get_embedding_api_batch_size();
        for (let index = 0; index < chunks.length; index += apiBatchSize) {
            const currentBatch = chunks.slice(index, index + apiBatchSize);
            if (typeof showToast === 'function') {
                showToast(`Generating ${index + 1} / ${chunks.length} embeddings...`, 15000);
            }
            const reqOpt = {
                method: 'POST',
                headers: get_kobold_header(),
                body: JSON.stringify({
                    input: currentBatch.map((chunk) => chunk.embeddingInput),
                    truncate: true,
                }),
            };
            if (globalabortcontroller) {
                reqOpt.signal = globalabortcontroller.signal;
            }
            const sub_endpt = apply_proxy_url(`${custom_kobold_endpoint}/api/extra/embeddings`);
            const response = await fetch(sub_endpt, reqOpt);
            if (!response.ok) {
                throw new Error(`Embedding request failed (${response.status})`);
            }
            const payload = await response.json();
            const responseModelName = `${payload?.model || modelName || ''}`.trim() || modelName;
            for (let batchIndex = 0; batchIndex < currentBatch.length; batchIndex++) {
                if (!Array.isArray(payload?.data) || !Array.isArray(payload.data[batchIndex]?.embedding)) {
                    throw new Error('Embedding response was missing expected vectors.');
                }
                generated.push({
                    hash: currentBatch[batchIndex].hash,
                    snippet: currentBatch[batchIndex].snippet,
                    document: currentBatch[batchIndex].document,
                    embedding: payload.data[batchIndex].embedding,
                    modelUsed: responseModelName,
                });
            }
        }
        if (typeof showToast === 'function') {
            showToast('');
        }
        return generated;
    }

    // -------------------------------------------------------------------------
    // File listing & searching
    // -------------------------------------------------------------------------

    /**
     * List filesystem entries, optionally filtered by a fnmatch glob pattern.
     * @param {string} [pattern='*']
     * @returns {Promise<{files:string[], directories:string[]}>}
     */
    async listEntries(pattern, case_insensitive) {
        const data = await this._get('/api/extra/fs/files', { pattern, case_insensitive });
        return {
            files: Array.isArray(data?.files) ? data.files : (Array.isArray(data?.paths) ? data.paths : []),
            directories: Array.isArray(data?.directories) ? data.directories : [],
        };
    }

    /**
     * Legacy file-only listing helper used by older callers.
     * @param {string} [pattern='*']
     * @returns {Promise<string[]>}
     */
    async list(pattern, case_insensitive) {
        const data = await this.listEntries(pattern, case_insensitive);
        return data.files;
    }

    /**
     * Search file contents using a regex pattern.
     * @param {string} pattern - Regex pattern to search for inside files.
     * @param {string} [path_pattern='*'] - Glob filter applied to paths.
     * @param {number} [max_results=100]
     * @returns {Promise<Array<{path:string, line:number, text:string}>>}
     */
    async search(pattern, path_pattern, max_results, case_insensitive) {
        const data = await this._get('/api/extra/fs/search_regex', { pattern, path_pattern, max_results, case_insensitive });
        return data.matches;
    }

    /**
     * Search file contents using a regex pattern.
     * @param {string} pattern - Regex pattern to search for inside files.
     * @param {string} [path_pattern='*'] - Glob filter applied to paths.
     * @param {number} [max_results=100]
     * @returns {Promise<Array<{path:string, line:number, text:string}>>}
     */
    async search_regex(pattern, path_pattern, max_results, case_insensitive) {
        return this.search(pattern, path_pattern, max_results, case_insensitive);
    }

    /**
     * Semantic-search a filesystem text or PDF file using the optimised backend pipeline.
     * The backend handles text extraction, chunking, embedding generation and caching.
     * Cache location is determined server-side:
     *   - /INTERNAL_READ_ONLY/Documents/... → cached into the admindocsdir on disk
     *   - All other paths → cached in the writable filesystem (memory or fsDir direct mode)
     * Supported text extensions: .txt, .csv, .tsv, .md, .json, .xml, .html,
     * .htm, .yaml, .yml, .log, .ini, .cfg, .conf, .rst, .tex
     * @param {string} path
     * @param {string} search_query
     * @param {number} [max_results=5]
     * @returns {Promise<Array<{snippet:string, document:string|null, similarity:number}>>}
     */
    async semantic_search(path, search_query, max_results = 5) {
        const TEXT_EXTENSIONS = FsClient.SEMANTIC_TEXT_EXTENSIONS;

        const sourcePath = this._normalize_path(path);
        const queryText = `${search_query || ''}`.trim();
        const maxResults = Math.max(1, Math.min(20, parseInt(max_results, 10) || 5));
        if (queryText === '') {
            throw new Error('Search query cannot be empty.');
        }
        if (typeof is_using_kcpp_with_embeddings === 'function' && !is_using_kcpp_with_embeddings()) {
            throw new Error('Embeddings are not available for the current endpoint.');
        }

        const lowerPath = sourcePath.toLowerCase();
        const isPdf = lowerPath.endsWith('.pdf');
        const isText = TEXT_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
        if (!isPdf && !isText) {
            throw new Error(`Filesystem semantic search only supports text files (${TEXT_EXTENSIONS.join(', ')}) and .pdf files.`);
        }

        // Delegate all extraction, chunking, embedding and caching to the backend.
        const { chunkSize, chunkOverlap } = this._get_chunking_settings();
        const semanticResult = await this._post('/api/extra/fs/semantic_search', {
            document_path: sourcePath,
            search_query: this._prepare_search_text(queryText),
            max_results: maxResults,
            chunk_size: chunkSize,
            overlap: chunkOverlap,
        });
        return Array.isArray(semanticResult?.snippets) ? semanticResult.snippets : [];
    }

    // -------------------------------------------------------------------------
    // Metadata
    // -------------------------------------------------------------------------

    /**
     * Get metadata for one or more files.
     * @param {Array<{path:string}>} operations
     * @returns {Promise<object>}
     */
    async metadata(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('metadata expects a non-empty operations array.');
        }
        const path = operations.map((op) => `${op?.path || ''}`);
        if (path.some((p) => p.trim() === '')) {
            throw new Error('metadata operations must include non-empty path values.');
        }
        const data = await this._get('/api/extra/fs/metadata', { path });
        if (Array.isArray(data?.results) && data.results.length === 1) {
            if (!data.results[0]?.success) {
                throw new Error(`${data.results[0]?.error || 'Metadata lookup failed.'}`);
            }
            return data.results[0];
        }
        return data;
    }

    /**
     * Get current filesystem backend mode.
     * @returns {Promise<{enabled:boolean, mode:string, source_dir:string}>}
     */
    async mode() {
        return this._get('/api/extra/fs/mode');
    }

    /**
     * Get current filesystem backend mode with client-side caching.
     * @param {boolean} [forceRefresh=false]
     * @returns {Promise<string>}
     */
    async getFsMode(forceRefresh = false) {
        if (!forceRefresh && !!this.fsModeCache) {
            return this.fsModeCache;
        }
        const modeInfo = await this.mode();
        this.fsModeCache = `${modeInfo?.mode || 'unknown'}`.trim().toLowerCase() || 'unknown';
        return this.fsModeCache;
    }

    // -------------------------------------------------------------------------
    // Reading files
    // -------------------------------------------------------------------------

    /**
     * Get the public URL for one or more files.
     * @param {Array<{path:string}>} operations
     * @returns {Promise<{path:string, url:string}>}
     */
    async url(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('url expects a non-empty operations array.');
        }
        const path = operations.map((op) => `${op?.path || ''}`);
        if (path.some((p) => p.trim() === '')) {
            throw new Error('url operations must include non-empty path values.');
        }
        const data = await this._get('/api/extra/fs/url', { path });
        if (Array.isArray(data?.results) && data.results.length === 1) {
            if (!data.results[0]?.success) {
                throw new Error(`${data.results[0]?.error || 'URL lookup failed.'}`);
            }
            return data.results[0];
        }
        return data;
    }

    /**
     * Read line ranges from one or more text files.
     * @param {Array<{path:string,start?:number,end?:number}>} operations
     * @returns {Promise<{path:string, start_line:number, end_line:number, total_lines:number, lines:Array<{line:number,text:string}>}>}
     */
    async content(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('content expects a non-empty operations array.');
        }
        const path = operations.map((op) => `${op?.path || ''}`);
        if (path.some((p) => p.trim() === '')) {
            throw new Error('content operations must include non-empty path values.');
        }
        const startValues = operations.map((op) => op?.start);
        const endValues = operations.map((op) => op?.end);
        const hasPerPathStart = startValues.some((v) => v !== undefined && v !== null);
        const hasPerPathEnd = endValues.some((v) => v !== undefined && v !== null);
        const params = { path };
        if (hasPerPathStart) {
            params.start = startValues.map((v) => (v === undefined || v === null ? 1 : v));
        }
        if (hasPerPathEnd) {
            params.end = endValues.map((v) => (v === undefined || v === null ? 2147483647 : v));
        }
        const data = await this._get('/api/extra/fs/content', params);
        if (Array.isArray(data?.results) && data.results.length === 1) {
            if (!data.results[0]?.success) {
                throw new Error(`${data.results[0]?.error || 'Content lookup failed.'}`);
            }
            return data.results[0];
        }
        return data;
    }

    /**
     * Fetch the raw bytes of a file via the public /fs/<path> route.
     * @param {string} path
     * @returns {Promise<Response>} Raw fetch Response; call .text(), .json(), .blob(), etc.
     */
    async fetch_raw(path) {
        const url = this._url('/fs/' + path.replace(/^\/+/, ''));
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`fs fetch_raw ${path} failed (${resp.status})`);
        }
        return resp;
    }

    /**
     * Download the entire filesystem (or a sub-directory) as a zip file.
     * @param {string} [dir=''] - Optional virtual directory to zip, e.g. "/docs".
     * @returns {Promise<{url:string, file_count:number, size_bytes:number}>}
     */
    async download_info(dir) {
        return this._get('/api/extra/fs/download', { dir: dir || '' });
    }

    /**
     * Fetch the zip archive directly as a Blob.
     * @param {string} [dir=''] - Optional virtual directory prefix to include.
     * @returns {Promise<Blob>}
     */
    async download_zip(dir) {
        const params = {};
        if (dir) { params.dir = dir; }
        const resp = await this._get('/fs.zip', params);
        return resp.blob();
    }

    // -------------------------------------------------------------------------
    // Writing files
    // -------------------------------------------------------------------------

    /**
     * Write one or more files.
     * @param {Array<{path:string,content:string|Uint8Array|ArrayBuffer,isB64?:boolean}>} operations
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async write(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('write expects a non-empty operations array.');
        }
        const payloadOperations = [];
        for (const op of operations) {
            const currentPath = `${op?.path || ''}`;
            if (currentPath.trim() === '') {
                throw new Error('write operations must include non-empty path values.');
            }
            const currentContent = op?.content;
            let currentIsB64 = !!op?.isB64;
            let payloadContent;
            if (typeof currentContent === 'string') {
                payloadContent = currentContent;
                currentIsB64 = false;
            } else {
                const bytes = currentContent instanceof ArrayBuffer ? new Uint8Array(currentContent) : currentContent;
                payloadContent = bytesToB64(bytes);
                currentIsB64 = true;
            }
            payloadOperations.push({
                path: currentPath,
                content: payloadContent,
                isB64: currentIsB64,
            });
        }
        return this._post('/api/extra/fs/write', { operations: payloadOperations });
    }

    /**
     * Write or patch specific lines in one or more text files.
     * @param {Array<{path:string,lines:string|string[],start_line?:number,append?:boolean}>} operations
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async write_lines(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('write_lines expects a non-empty operations array.');
        }
        const payloadOperations = [];
        for (const op of operations) {
            const currentPath = `${op?.path || ''}`;
            if (currentPath.trim() === '') {
                throw new Error('write_lines operations must include non-empty path values.');
            }
            payloadOperations.push({
                path: currentPath,
                lines: op?.lines ?? [],
                start_line: op?.start_line ?? 1,
                append: !!op?.append,
            });
        }
        return this._post('/api/extra/fs/write_lines', { operations: payloadOperations });
    }

    // -------------------------------------------------------------------------
    // File management
    // -------------------------------------------------------------------------

    /**
     * Delete one or more files.
     * @param {Array<{path:string}>} operations
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async delete(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('delete expects a non-empty operations array.');
        }
        if (operations.some((op) => `${op?.path || ''}`.trim() === '')) {
            throw new Error('delete operations must include non-empty path values.');
        }
        return this._post('/api/extra/fs/delete', { operations });
    }

    /**
     * Move/rename one or more files or directories.
     * @param {Array<{source:string, destination:string}>} operations
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async move(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('move expects a non-empty operations array.');
        }
        return this._post('/api/extra/fs/move', { operations });
    }

    /**
     * Copy one or more files or directories.
     * @param {Array<{source:string, destination:string}>} operations
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async copy(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('copy expects a non-empty operations array.');
        }
        return this._post('/api/extra/fs/copy', { operations });
    }

    /**
     * Create one or more directories.
     * @param {Array<{path:string}>} operations
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async mkdir(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('mkdir expects a non-empty operations array.');
        }
        if (operations.some((op) => `${op?.path || ''}`.trim() === '')) {
            throw new Error('mkdir operations must include non-empty path values.');
        }
        return this._post('/api/extra/fs/mkdir', { operations });
    }

    /**
     * Delete one or more directories and all their contents.
     * @param {Array<{path:string}>} operations
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async rmdir(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('rmdir expects a non-empty operations array.');
        }
        if (operations.some((op) => `${op?.path || ''}`.trim() === '')) {
            throw new Error('rmdir operations must include non-empty path values.');
        }
        return this._post('/api/extra/fs/rmdir', { operations });
    }

    /**
     * Replace text in one or more files using per-file regex operations.
     * @param {Array<{path:string, pattern:string, replacement:string}>} operations
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async replace_regex(operations) {
        if (!Array.isArray(operations) || operations.length === 0) {
            throw new Error('replace_regex expects a non-empty operations array.');
        }
        return this._post('/api/extra/fs/replace_regex', { operations });
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
        return this._post_form('/api/extra/fs/upload', fd);
    }
}

window.fsClient = new FsClient()