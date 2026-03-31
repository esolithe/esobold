/**
 * FsClient — thin async wrapper around the KoboldCpp filesystem API.
 *
 * All paths follow POSIX conventions (e.g. "/dir/file.txt").
 * base_url defaults to the current page origin; pass a different value when
 * talking to a remote KoboldCpp instance.
 *
 * Example:
 *   const fs = new FsClient();
 *   await fs.write('/hello.txt', 'Hello, world!');
 *   const lines = await fs.content('/hello.txt');
 *   console.log(lines);
 */
class FsClient {
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
            await this.metadata(path);
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

    _derive_semantic_cache_paths(sourcePath) {
        const normalizedSourcePath = this._normalize_path(sourcePath);
        const sourceName = normalizedSourcePath.split('/').pop() || 'document.txt';
        const dotIndex = sourceName.lastIndexOf('.');
        const baseName = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName;
        const dirPath = normalizedSourcePath.slice(0, normalizedSourcePath.length - sourceName.length).replace(/\/$/, '') || '/';
        return {
            sourcePath: normalizedSourcePath,
            dirPath,
            sourceName,
            baseName,
            rawTextPath: `${dirPath === '/' ? '' : dirPath}/${baseName}_rawtext.txt` || `/${baseName}_rawtext.txt`,
            cachePath: `${dirPath === '/' ? '' : dirPath}/${baseName}_embeddings.json` || `/${baseName}_embeddings.json`,
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

    async _generate_embeddings_for_chunks(chunks, modelName) {
        const generated = [];
        for (let index = 0; index < chunks.length; index += 100) {
            const currentBatch = chunks.slice(index, index + 100);
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
     * Search file contents for a text/regex pattern.
     * @param {string} pattern - Text pattern to search for inside files.
     * @param {string} [path_pattern='*'] - Glob filter applied to paths.
     * @param {number} [max_results=100]
     * @returns {Promise<Array<{path:string, line:number, text:string}>>}
     */
    async search(pattern, path_pattern, max_results, case_insensitive) {
        const data = await this._get('/api/extra/fs/search', { pattern, path_pattern, max_results, case_insensitive });
        return data.matches;
    }

    /**
     * Semantic-search a filesystem .txt or .pdf file using cached embeddings.
     * @param {string} path
     * @param {string} search_query
     * @param {number} [max_results=5]
     * @returns {Promise<Array<{snippet:string, document:string|null, similarity:number}>>}
     */
    async semantic_search(path, search_query, max_results = 5) {
        const sourcePath = this._normalize_path(path);
        const queryText = `${search_query || ''}`.trim();
        const maxResults = Math.max(1, Math.min(20, parseInt(max_results, 10) || 5));
        if (queryText === '') {
            throw new Error('Search query cannot be empty.');
        }
        if (typeof is_using_kcpp_with_embeddings === 'function' && !is_using_kcpp_with_embeddings()) {
            throw new Error('Embeddings are not available for the current endpoint.');
        }

        const sourceMetadata = await this.metadata(sourcePath);
        const lowerPath = sourcePath.toLowerCase();
        const sourceExt = lowerPath.endsWith('.pdf') ? '.pdf' : (lowerPath.endsWith('.txt') ? '.txt' : '');
        if (!['.txt', '.pdf'].includes(sourceExt)) {
            throw new Error('Filesystem semantic search only supports .txt and .pdf files.');
        }
        if (sourceExt === '.txt' && sourceMetadata?.binary) {
            throw new Error('Filesystem semantic search requires a text-readable .txt file.');
        }

        const modelName = `${(typeof get_kcpp_embedding_model === 'function' ? get_kcpp_embedding_model() : '') || ''}`.trim();
        if (modelName === '') {
            throw new Error('No active embedding model is available.');
        }

        const semanticPaths = this._derive_semantic_cache_paths(sourcePath);
        const rawTextExists = await this._path_exists(semanticPaths.rawTextPath);
        let rawText = rawTextExists
            ? await this._read_text_file(semanticPaths.rawTextPath)
            : await this._extract_source_text(sourcePath, sourceExt);
        rawText = `${rawText || ''}`.trim();
        if (rawText === '') {
            throw new Error('No text could be extracted from the selected filesystem file.');
        }
        if (!rawTextExists) {
            await this.write(semanticPaths.rawTextPath, rawText);
        }

        const preset = this._get_embedding_preset(modelName);
        const rawTextHash = cyrb_hash(`${this._prepare_search_text(rawText) || ''}`, 0, 8);
        const chunks = this._chunk_raw_text(rawText, semanticPaths.sourceName, preset.document_prompt);
        if (chunks.length === 0) {
            return [];
        }

        const cacheObject = await this._load_fs_json(semanticPaths.cachePath);
        const models = typeof cacheObject.models === 'object' && cacheObject.models ? cacheObject.models : {};
        let modelCache = typeof models[modelName] === 'object' && models[modelName]
            ? models[modelName]
            : {};
        const shouldInvalidateModelCache = modelCache.rawtext_hash !== rawTextHash
            || `${modelCache.query_prefix || ''}` !== `${preset.query_prompt || ''}`
            || `${modelCache.document_prefix || ''}` !== `${preset.document_prompt || ''}`;
        if (shouldInvalidateModelCache) {
            modelCache = {};
        }

        const existingItems = typeof modelCache.items === 'object' && modelCache.items ? modelCache.items : {};
        const nextItems = {};
        const missingChunks = [];
        for (const chunk of chunks) {
            const cachedItem = existingItems[chunk.hash];
            if (cachedItem && Array.isArray(cachedItem.embedding) && cachedItem.embedding.length > 0
                && `${cachedItem.snippet || ''}` === chunk.snippet
                && `${cachedItem.document || ''}` === `${chunk.document || ''}`) {
                nextItems[chunk.hash] = cachedItem;
            }
            else {
                missingChunks.push(chunk);
            }
        }

        let resolvedModelName = modelName;
        if (missingChunks.length > 0) {
            const generatedItems = await this._generate_embeddings_for_chunks(missingChunks, modelName);
            for (const generatedItem of generatedItems) {
                resolvedModelName = `${generatedItem.modelUsed || resolvedModelName}`.trim() || resolvedModelName;
                nextItems[generatedItem.hash] = generatedItem;
            }
        }
        else if (`${modelCache.model_name || ''}`.trim() !== '') {
            resolvedModelName = `${modelCache.model_name}`.trim();
        }

        const mergedCache = {
            version: 1,
            source_path: semanticPaths.sourcePath,
            rawtext_path: semanticPaths.rawTextPath,
            rawtext_hash: rawTextHash,
            updated_at: new Date().toISOString(),
            models: {
                ...models,
                [modelName]: {
                    model_name: resolvedModelName,
                    query_prefix: `${preset.query_prompt || ''}`,
                    document_prefix: `${preset.document_prompt || ''}`,
                    rawtext_hash: rawTextHash,
                    chunk_size: this._get_chunking_settings().chunkSize,
                    chunk_overlap: this._get_chunking_settings().chunkOverlap,
                    updated_at: new Date().toISOString(),
                    items: nextItems,
                },
            },
        };
        await this.write(semanticPaths.cachePath, JSON.stringify(mergedCache));

        const semanticResult = await this._post('/api/extra/fs/semantic_search', {
            embeddings_cache_path: semanticPaths.cachePath,
            search_query: this._prepare_search_text(queryText),
            max_results: maxResults,
        });
        return Array.isArray(semanticResult?.snippets) ? semanticResult.snippets : [];
    }

    // -------------------------------------------------------------------------
    // Metadata
    // -------------------------------------------------------------------------

    /**
     * Get metadata for a single file or overall filesystem stats (pass empty path).
     * @param {string} [path='']
     * @returns {Promise<object>}
     */
    async metadata(path) {
        return this._get('/api/extra/fs/metadata', { path: path || '' });
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
     * Get the public URL for a file stored in the filesystem.
     * @param {string} path
     * @returns {Promise<{path:string, url:string}>}
     */
    async url(path) {
        return this._get('/api/extra/fs/url', { path });
    }

    /**
     * Read lines from a text file.
     * @param {string} path
     * @param {number} [start=1] - 1-based start line (inclusive).
     * @param {number} [end]     - 1-based end line (inclusive). Omit for all.
     * @returns {Promise<{path:string, start_line:number, end_line:number, total_lines:number, lines:Array<{line:number,text:string}>}>}
     */
    async content(path, start, end) {
        return this._get('/api/extra/fs/content', { path, start, end });
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
     * Write a file. Content may be a string or a Uint8Array / ArrayBuffer.
     * When content is binary (not a string), it is base64-encoded before sending.
     * @param {string} path
     * @param {string|Uint8Array|ArrayBuffer} content
     * @returns {Promise<{success:boolean, path:string, metadata:object}>}
     */
    async write(path, content, isB64 = false) {
        let payload_content;
        if (typeof content === 'string') {
            payload_content = content; // For text content, we can send as-is since the server will handle it as UTF-8 text. The server should be able to detect and decode UTF-8 content correctly without needing base64 encoding, and this avoids unnecessary bloat for purely textual files. If the server encounters decoding issues, we can revisit this decision.
            isB64 = false;
        } else {
            // Binary: encode to base64 so it travels safely over JSON
            const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
            payload_content = bytesToB64(bytes);
            isB64 = true;
        }
        return this._post('/api/extra/fs/write', { path, content: payload_content, isB64 });
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
        return this._post('/api/extra/fs/write_lines', { path, lines, start_line, append });
    }

    // -------------------------------------------------------------------------
    // File management
    // -------------------------------------------------------------------------

    /**
     * Delete one or more files.
     * @param {string[]} paths
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async delete(paths) {
        if (!Array.isArray(paths) || paths.length === 0) {
            throw new Error('delete expects a non-empty array of file paths.');
        }
        return this._post('/api/extra/fs/delete', { paths });
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
     * @param {string[]} path
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async mkdir(path) {
        if (!Array.isArray(path) || path.length === 0) {
            throw new Error('mkdir expects a non-empty array of directory paths.');
        }
        return this._post('/api/extra/fs/mkdir', { path });
    }

    /**
     * Delete one or more directories and all their contents.
     * @param {string[]} paths
     * @returns {Promise<{success:boolean, results:Array}>}
     */
    async rmdir(paths) {
        if (!Array.isArray(paths) || paths.length === 0) {
            throw new Error('rmdir expects a non-empty array of directory paths.');
        }
        return this._post('/api/extra/fs/rmdir', { paths });
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