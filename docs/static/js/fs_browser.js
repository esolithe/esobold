/* =====================================================================
   Filesystem Browser — client-side logic
   ===================================================================== */

(function () {
    'use strict';

    const DIR_MARKER_NAME = '.kcpp_dir_marker';
    const VIEW_MODE_KEY = 'kcpp_fs_view_mode';
    const urlParams = new URLSearchParams(window.location.search || '');
    const isPickerMode = urlParams.get('picker') === '1';
    const shouldForceTileView = urlParams.get('view') === 'tile';
    const pickerSelectedEntries = new Map();
    const MEDIA_EXT_RE = {
        image: /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i,
        video: /\.(mp4|webm|mov|mkv|m4v|avi)$/i,
        audio: /\.(mp3|wav|ogg|m4a|flac|aac)$/i,
    };

    let currentViewMode = 'list';

    // ── Utilities ──────────────────────────────────────────────────────

    function formatBytes(n) {
        if (n == null) return '—';
        n = Number(n);
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    }

    function formatDate(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        } catch (_) { return iso; }
    }

    function esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showToast(msg, isError) {
        const t = document.createElement('div');
        t.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => {
            t.classList.add('toast-fading');
            setTimeout(() => t.remove(), 600);
        }, isError ? 4000 : 2500);
    }

    function getFileKind(name) {
        if (MEDIA_EXT_RE.image.test(name)) return 'image';
        if (MEDIA_EXT_RE.video.test(name)) return 'video';
        if (MEDIA_EXT_RE.audio.test(name)) return 'audio';
        return 'other';
    }

    function loadViewMode() {
        try {
            const stored = localStorage.getItem(VIEW_MODE_KEY);
            return stored === 'tile' ? 'tile' : 'list';
        } catch (_) {
            return 'list';
        }
    }

    function saveViewMode(mode) {
        try {
            localStorage.setItem(VIEW_MODE_KEY, mode);
        } catch (_) {
            // Ignore storage failures (private mode/quota).
        }
    }

    function setViewMode(mode) {
        currentViewMode = mode === 'tile' ? 'tile' : 'list';
        saveViewMode(currentViewMode);
        const viewBtn = document.getElementById('btn-view-mode');
        if (viewBtn) {
            const isTile = currentViewMode === 'tile';
            viewBtn.innerHTML = isTile ? '&#8801; List View' : '&#9638; Tile View';
            viewBtn.setAttribute('aria-pressed', String(isTile));
        }
    }

    function pickerQuerySuffix() {
        if (!isPickerMode) {
            return '';
        }
        return '?picker=1&view=tile';
    }

    function notifyPickerParent(type, payload) {
        if (!isPickerMode || !window.parent || window.parent === window) {
            return;
        }
        try {
            window.parent.postMessage(Object.assign({ type }, payload || {}), window.location.origin);
        } catch (_) {}
    }

    function updatePickerSelectionStatus() {
        if (!isPickerMode) {
            return;
        }
        const useBtn = document.getElementById('btn-picker-use-selected');
        const embedBtn = document.getElementById('btn-picker-embed-selected');
        const hint = document.getElementById('picker-selection-hint');
        if (!useBtn || !embedBtn || !hint) {
            return;
        }
        const count = pickerSelectedEntries.size;
        useBtn.disabled = count === 0;
        embedBtn.disabled = count === 0;
        useBtn.textContent = count > 0 ? `Use selected (${count})` : 'Use selected';
        embedBtn.textContent = count > 0 ? `Embed selected (${count})` : 'Embed selected';
        hint.textContent = count > 0
            ? `${count} file${count === 1 ? '' : 's'} selected`
            : 'Select one or more files to continue';
    }

    function setPickerSelection(path, shouldSelect) {
        setPickerEntrySelection(path, false, shouldSelect);
    }

    function setPickerEntrySelection(path, isDirectory, shouldSelect) {
        if (!path) {
            return;
        }
        const key = `${isDirectory ? 'dir' : 'file'}:${path}`;
        if (shouldSelect) {
            pickerSelectedEntries.set(key, { path, isDirectory: !!isDirectory });
        } else {
            pickerSelectedEntries.delete(key);
        }
        updatePickerSelectionStatus();
    }

    function togglePickerSelection(path) {
        togglePickerEntrySelection(path, false);
    }

    function togglePickerEntrySelection(path, isDirectory) {
        if (!path) {
            return;
        }
        const key = `${isDirectory ? 'dir' : 'file'}:${path}`;
        setPickerEntrySelection(path, isDirectory, !pickerSelectedEntries.has(key));
    }

    function bindPickerSelectionHandlers(container) {
        if (!isPickerMode) {
            return;
        }

        container.querySelectorAll('[data-picker-toggle-file]').forEach(elem => {
            elem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                let filePath = elem.dataset.pickerToggleFile || '';
                togglePickerSelection(filePath);
                let isSelected = pickerSelectedEntries.has(`file:${filePath}`);
                elem.classList.toggle('picker-selected', isSelected);
                elem.setAttribute('aria-pressed', String(isSelected));
            });
        });

        container.querySelectorAll('[data-picker-toggle-dir]').forEach(elem => {
            elem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                let dirPath = elem.dataset.pickerToggleDir || '';
                togglePickerEntrySelection(dirPath, true);
                let isSelected = pickerSelectedEntries.has(`dir:${dirPath}`);
                elem.classList.toggle('picker-selected', isSelected);
                elem.setAttribute('aria-pressed', String(isSelected));
            });
        });

        container.querySelectorAll('[data-picker-file-anchor]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                let filePath = anchor.dataset.pickerFileAnchor || '';
                togglePickerSelection(filePath);
                let row = anchor.closest('[data-picker-toggle-file]');
                if (row) {
                    let isSelected = pickerSelectedEntries.has(`file:${filePath}`);
                    row.classList.toggle('picker-selected', isSelected);
                    row.setAttribute('aria-pressed', String(isSelected));
                }
            });
        });

        container.querySelectorAll('[data-picker-dir-anchor]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                // Directory anchors keep native navigation in picker mode.
                e.stopPropagation();
            });
        });

        container.querySelectorAll('[data-picker-select-dir-btn]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                let dirPath = btn.dataset.pickerSelectDirBtn || '';
                togglePickerEntrySelection(dirPath, true);
                let row = btn.closest('[data-picker-toggle-dir]');
                if (row) {
                    let isSelected = pickerSelectedEntries.has(`dir:${dirPath}`);
                    row.classList.toggle('picker-selected', isSelected);
                    row.setAttribute('aria-pressed', String(isSelected));
                }
            });
        });
    }

    // ── Path helpers ───────────────────────────────────────────────────

    /**
     * Derive the logical fs directory from the browser URL.
     * /fs        → /
     * /fs/       → /
     * /fs/foo/   → /foo/
     * /fs/a/b/c/ → /a/b/c/
     */
    function currentFsDir() {
        const loc = window.location.pathname; // e.g. "/fs/subdir/"
        let dir = decodeURIPath(loc.slice(3)); // strip "/fs"
        if (!dir || dir === '/') return '/';
        if (!dir.endsWith('/')) dir += '/';
        return dir;
    }

    function parentOf(dir) {
        if (dir === '/') return null;
        const stripped = dir.endsWith('/') ? dir.slice(0, -1) : dir;
        const idx = stripped.lastIndexOf('/');
        if (idx <= 0) return '/';
        return stripped.slice(0, idx + 1);
    }

    /** Build href for navigating to a fs directory. */
    function dirHref(dir) {
        if (dir === '/') return '/fs/' + pickerQuerySuffix();
        return '/fs' + encodeURIPath(dir.endsWith('/') ? dir : dir + '/') + pickerQuerySuffix();
    }

    /** Build href for a fs file. */
    function fileHref(path) {
        return '/fs' + encodeURIPath(path);
    }

    /**
     * Encode a POSIX path, keeping slashes intact.
     */
    function encodeURIPath(path) {
        return path.split('/').map(s => encodeURIComponent(s)).join('/');
    }

    function decodeURIPath(path) {
        return path.split('/').map(s => {
            try {
                return decodeURIComponent(s);
            } catch (_) {
                return s;
            }
        }).join('/');
    }

    // ── Breadcrumbs ────────────────────────────────────────────────────

    function renderBreadcrumbs(dir) {
        const el = document.getElementById('breadcrumbs');
        const parts = dir === '/' ? [] : dir.replace(/\/$/, '').split('/').filter(Boolean);
        let html = `<a href="${esc(dirHref('/'))}">/ (root)</a>`;
        let accumulated = '/';
        for (let i = 0; i < parts.length; i++) {
            accumulated += parts[i] + '/';
            html += '<span class="crumb-sep">/</span>';
            if (i < parts.length - 1) {
                html += `<a href="${esc(dirHref(accumulated))}">${esc(parts[i])}</a>`;
            } else {
                html += `<span>${esc(parts[i])}</span>`;
            }
        }
        el.innerHTML = html;
    }

    // ── Directory listing ──────────────────────────────────────────────

    /**
     * Extract direct children of `currentDir` from explicit directory + file lists.
     * Returns { dirs: string[], files: string[] }.
     */
    function getChildren(allPaths, allDirectories, currentDir) {
        const prefix = currentDir === '/' ? '/' : currentDir; // e.g. "/foo/"
        const childDirs = new Set();
        const childFiles = [];

        for (const p of allDirectories) {
            if (!p) continue;
            let relDir;
            if (currentDir === '/') {
                relDir = p.replace(/^\/+/, '');
            } else {
                if (!p.startsWith(prefix)) continue;
                relDir = p.slice(prefix.length);
            }
            if (!relDir) continue;
            const slashIdx = relDir.indexOf('/');
            childDirs.add(slashIdx === -1 ? relDir : relDir.slice(0, slashIdx));
        }

        for (const p of allPaths) {
            let relative;
            if (currentDir === '/') {
                relative = p.slice(1); // strip leading /
            } else {
                if (!p.startsWith(prefix)) continue;
                relative = p.slice(prefix.length);
            }
            if (!relative) continue;
            const slashIdx = relative.indexOf('/');
            if (slashIdx > 0) {
                childDirs.add(relative.slice(0, slashIdx));
            } else if (slashIdx === -1) {
                childFiles.push(relative);
            }
        }
        return {
            dirs: [...childDirs].sort((a, b) => a.localeCompare(b)),
            files: childFiles.filter(name => name !== DIR_MARKER_NAME).sort((a, b) => a.localeCompare(b)),
        };
    }

    async function fetchMetadata(path) {
        try {
            const r = await fetch('/api/extra/fs/metadata?path=' + encodeURIComponent(path));
            if (!r.ok) return null;
            const data = await r.json();
            // The metadata endpoint uses fs_batch_apply, which wraps the result as
            // { success, results: [ { path, size_bytes, last_modified, ... } ] }
            if (Array.isArray(data?.results) && data.results.length > 0 && data.results[0]?.success) {
                return data.results[0];
            }
            return null;
        } catch (_) { return null; }
    }

    function tilePreviewHtml(filePath, fileName) {
        const href = esc(fileHref(filePath));
        const kind = getFileKind(fileName);
        if (kind === 'image') {
            if (isPickerMode) {
                return `<div class="tile-preview"><img src="${href}" alt="${esc(fileName)}"></div>`;
            }
            return `<a class="tile-preview" href="${href}" target="_blank" rel="noopener noreferrer"><img src="${href}" alt="${esc(fileName)}"></a>`;
        }
        if (kind === 'video') {
            return `<div class="tile-preview"><video src="${href}" controls preload="metadata"></video></div>`;
        }
        if (kind === 'audio') {
            return `<div class="tile-preview"><audio src="${href}" controls preload="metadata"></audio></div>`;
        }
        return '<div class="tile-preview">&#128196;</div>';
    }

    function bindDeleteHandlers(container, dir) {
        container.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const path = btn.dataset.delete;
                if (!confirm(`Delete "${path}"?`)) return;
                try {
                    const r = await fetch('/api/extra/fs/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ operations: [{ path }] }),
                    });
                    const data = await r.json();
                    if (data.success) {
                        showToast(`Deleted ${path}`, false);
                        renderListing(dir);
                    } else {
                        showToast(`Delete failed: ${data.error || 'unknown error'}`, true);
                    }
                } catch (e) {
                    showToast(`Delete error: ${e}`, true);
                }
            });
        });

        container.querySelectorAll('[data-delete-dir]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const path = btn.dataset.deleteDir;
                if (!confirm(`Delete folder "${path}" and all contents?`)) return;
                try {
                    const r = await fetch('/api/extra/fs/rmdir', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ operations: [{ path }] }),
                    });
                    const data = await r.json();
                    if (data.success) {
                        showToast(`Deleted folder ${path}`, false);
                        renderListing(dir);
                    } else {
                        showToast(`Folder delete failed: ${data.error || 'unknown error'}`, true);
                    }
                } catch (e) {
                    showToast(`Folder delete error: ${e}`, true);
                }
            });
        });
    }

    async function renderListing(dir) {
        const tbody = document.getElementById('listing-body');
        const tileGrid = document.getElementById('tile-grid');
        const emptyNotice = document.getElementById('empty-notice');
        const listContainer = document.getElementById('listing-container');

        tbody.innerHTML = '<tr id="loading-row"><td colspan="4">Loading\u2026</td></tr>';
        tileGrid.innerHTML = '';
        tileGrid.hidden = true;
        listContainer.classList.remove('tile-mode');

        // Fetch all files/directories
        let allPaths = [];
        let allDirectories = [];
        try {
            const r = await fetch('/api/extra/fs/files');
            if (r.ok) {
                const data = await r.json();
                allPaths = Array.isArray(data.files) ? data.files : (Array.isArray(data.paths) ? data.paths : []);
                allDirectories = Array.isArray(data.directories) ? data.directories : [];
            } else {
                const errText = await r.text().catch(() => '');
                let errMsg = `HTTP ${r.status}`;
                try { errMsg = JSON.parse(errText)?.error || errMsg; } catch (_) {}
                tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">Failed to load file list: ${esc(errMsg)}</td></tr>`;
                listContainer.hidden = false;
                emptyNotice.hidden = true;
                return;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">Failed to load file list: ${esc(String(e))}</td></tr>`;
            return;
        }

        const { dirs, files } = getChildren(allPaths, allDirectories, dir);
        const parent = parentOf(dir);

        if (dirs.length === 0 && files.length === 0 && dir === '/') {
            tbody.innerHTML = '';
            listContainer.hidden = true;
            emptyNotice.hidden = false;
            return;
        }

        listContainer.hidden = false;
        emptyNotice.hidden = true;

        // Files metadata for either rendering mode
        const fileMetaPromises = files.map(f => {
            const filePath = dir === '/' ? '/' + f : dir.replace(/\/$/, '') + '/' + f;
            return fetchMetadata(filePath).then(meta => ({ f, filePath, meta }));
        });
        const fileMetas = await Promise.all(fileMetaPromises);

        if (currentViewMode === 'tile') {
            const tiles = [];

            if (parent !== null) {
                tiles.push(`<article class="tile-card entry-parent">
                    <a class="tile-name" href="${esc(dirHref(parent))}">&#128194; ..</a>
                </article>`);
            }

            for (const d of dirs) {
                const childDir = dir === '/' ? '/' + d + '/' : dir + d + '/';
                const isDirSelected = isPickerMode && pickerSelectedEntries.has(`dir:${childDir}`);
                const dirTileClass = `tile-card entry-dir${isDirSelected ? ' picker-selected' : ''}`;
                const dirTileAttrs = isPickerMode ? ` data-picker-toggle-dir="${esc(childDir)}" aria-pressed="${isDirSelected ? 'true' : 'false'}"` : '';
                const dirActions = isPickerMode
                    ? `<div class="tile-actions"><button class="btn btn-secondary" data-picker-select-dir-btn="${esc(childDir)}" title="Select folder">Select folder</button></div>`
                    : `<div class="tile-actions"><button class="btn btn-danger" data-delete-dir="${esc(childDir)}" title="Delete Folder">&#128465;</button></div>`;
                tiles.push(`<article class="${dirTileClass}"${dirTileAttrs}>
                    <div class="tile-preview">&#128193;</div>
                    <div class="tile-meta">
                        <a class="tile-name" href="${esc(dirHref(childDir))}" data-picker-dir-anchor="${esc(childDir)}">${esc(d)}/</a>
                        <div class="tile-sub">Folder</div>
                    </div>
                    ${dirActions}
                </article>`);
            }

            for (const { f, filePath, meta } of fileMetas) {
                const size = meta ? formatBytes(meta.size_bytes != null ? meta.size_bytes : meta.size) : '—';
                const mod = meta ? formatDate(meta.last_modified != null ? meta.last_modified : meta.modified) : '—';
                const isSelected = isPickerMode && pickerSelectedEntries.has(`file:${filePath}`);
                const tileClasses = `tile-card entry-file${isSelected ? ' picker-selected' : ''}`;
                const tileAttributes = isPickerMode ? ` data-picker-toggle-file="${esc(filePath)}" aria-pressed="${isSelected ? 'true' : 'false'}"` : '';
                const nameAnchor = isPickerMode
                    ? `<a class="tile-name" href="#" data-picker-file-anchor="${esc(filePath)}">${esc(f)}</a>`
                    : `<a class="tile-name" href="${esc(fileHref(filePath))}" target="_blank" rel="noopener noreferrer">${esc(f)}</a>`;
                tiles.push(`<article class="${tileClasses}"${tileAttributes}>
                    ${tilePreviewHtml(filePath, f)}
                    <div class="tile-meta">
                        ${nameAnchor}
                        <div class="tile-sub">${esc(size)} | ${esc(mod)}</div>
                    </div>
                    ${isPickerMode ? '<div class="tile-actions"><span class="picker-chip">Tap to select</span></div>' : `<div class="tile-actions"><button class="btn btn-danger" data-delete="${esc(filePath)}" title="Delete">&#128465;</button></div>`}
                </article>`);
            }

            tbody.innerHTML = '';
            tileGrid.innerHTML = tiles.join('');
            tileGrid.hidden = false;
            listContainer.classList.add('tile-mode');
            if (isPickerMode) {
                bindPickerSelectionHandlers(tileGrid);
                updatePickerSelectionStatus();
            } else {
                bindDeleteHandlers(tileGrid, dir);
            }
            return;
        }

        const rows = [];

        if (parent !== null) {
            rows.push(`<tr class="entry-parent">
                <td class="col-name"><a href="${esc(dirHref(parent))}">&#128194; ..</a></td>
                <td class="col-size"></td>
                <td class="col-modified"></td>
                <td class="col-actions"></td>
            </tr>`);
        }

        for (const d of dirs) {
            const childDir = dir === '/' ? '/' + d + '/' : dir + d + '/';
            const isDirSelected = isPickerMode && pickerSelectedEntries.has(`dir:${childDir}`);
            const dirRowClass = `entry-dir${isDirSelected ? ' picker-selected' : ''}`;
            const dirRowAttrs = isPickerMode ? ` data-picker-toggle-dir="${esc(childDir)}" aria-pressed="${isDirSelected ? 'true' : 'false'}"` : '';
            const dirActions = isPickerMode
                ? `<button class="btn btn-secondary" data-picker-select-dir-btn="${esc(childDir)}" title="Select folder">Select folder</button>`
                : `<button class="btn btn-danger" data-delete-dir="${esc(childDir)}" title="Delete Folder">&#128465;</button>`;
            rows.push(`<tr class="${dirRowClass}"${dirRowAttrs}>
                <td class="col-name">&#128193; <a href="${esc(dirHref(childDir))}" data-picker-dir-anchor="${esc(childDir)}">${esc(d)}/</a></td>
                <td class="col-size">—</td>
                <td class="col-modified">—</td>
                <td class="col-actions">${dirActions}</td>
            </tr>`);
        }

        for (const { f, filePath, meta } of fileMetas) {
            const size = meta ? formatBytes(meta.size_bytes != null ? meta.size_bytes : meta.size) : '—';
            const mod = meta ? formatDate(meta.last_modified != null ? meta.last_modified : meta.modified) : '—';
            const isSelected = isPickerMode && pickerSelectedEntries.has(`file:${filePath}`);
            const rowClasses = `entry-file${isSelected ? ' picker-selected' : ''}`;
            const rowAttributes = isPickerMode ? ` data-picker-toggle-file="${esc(filePath)}" aria-pressed="${isSelected ? 'true' : 'false'}"` : '';
            const nameAnchor = isPickerMode
                ? `<a href="#" data-picker-file-anchor="${esc(filePath)}">${esc(f)}</a>`
                : `<a href="${esc(fileHref(filePath))}" target="_blank" rel="noopener noreferrer">${esc(f)}</a>`;
            rows.push(`<tr class="${rowClasses}"${rowAttributes}>
                <td class="col-name">&#128196; ${nameAnchor}</td>
                <td class="col-size">${esc(size)}</td>
                <td class="col-modified">${esc(mod)}</td>
                <td class="col-actions">${isPickerMode ? '<span class="picker-chip">Select</span>' : `<button class="btn btn-danger" data-delete="${esc(filePath)}" title="Delete">&#128465;</button>`}</td>
            </tr>`);
        }

        tbody.innerHTML = rows.join('');
        if (isPickerMode) {
            bindPickerSelectionHandlers(tbody);
            updatePickerSelectionStatus();
        } else {
            bindDeleteHandlers(tbody, dir);
        }
    }

    // ── Upload ─────────────────────────────────────────────────────────

    function setStatus(msg, pct, cls) {
        const bar = document.getElementById('status-bar');
        const pb  = document.getElementById('progress-bar');
        const sm  = document.getElementById('status-msg');
        bar.hidden = false;
        bar.className = cls || '';
        pb.style.width = (pct == null ? 0 : pct) + '%';
        sm.textContent = msg;
    }

    function clearStatus() {
        const bar = document.getElementById('status-bar');
        bar.hidden = true;
        bar.className = '';
        document.getElementById('progress-bar').style.width = '0%';
        document.getElementById('status-msg').textContent = '';
    }

    async function uploadFiles(fileList, dir) {
        if (!fileList || fileList.length === 0) return;

        const total = fileList.length;
        let done = 0;
        let errors = 0;

        setStatus(`Uploading 0 / ${total}…`, 0);

        for (const file of fileList) {
            const fd = new FormData();
            fd.append('dir', dir);
            fd.append('file', file, file.name);

            try {
                const r = await fetch('/api/extra/fs/upload', {
                    method: 'POST',
                    body: fd,
                });
                const data = await r.json().catch(() => ({}));
                if (!r.ok || data.success === false) {
                    errors++;
                    showToast(`Failed to upload "${file.name}": ${data.error || r.status}`, true);
                }
            } catch (e) {
                errors++;
                showToast(`Upload error for "${file.name}": ${e}`, true);
            }

            done++;
            setStatus(`Uploading ${done} / ${total}…`, Math.round((done / total) * 100));
        }

        if (errors === 0) {
            setStatus(`Uploaded ${done} file${done !== 1 ? 's' : ''}`, 100, 'success');
            showToast(`Uploaded ${done} file${done !== 1 ? 's' : ''} to ${dir}`, false);
        } else {
            setStatus(`Done with ${errors} error${errors !== 1 ? 's' : ''}`, 100, 'error');
        }

        setTimeout(clearStatus, 3000);
        renderListing(currentFsDir());
    }

    async function createFolder(dir) {
        const folderName = (prompt('Create folder name (relative to current directory):', '') || '').trim();
        if (!folderName) return;
        const cleanName = folderName.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
        if (!cleanName || cleanName === '.' || cleanName === '..') {
            showToast('Invalid folder name', true);
            return;
        }
        const targetPath = dir === '/' ? ('/' + cleanName) : (dir.replace(/\/$/, '') + '/' + cleanName);
        try {
            const r = await fetch('/api/extra/fs/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ operations: [{ path: targetPath }] }),
            });
            const data = await r.json();
            if (!r.ok || data.success === false) {
                showToast(`Create folder failed: ${data.error || r.status}`, true);
                return;
            }
            showToast(`Created folder ${targetPath}`, false);
            renderListing(currentFsDir());
        } catch (e) {
            showToast(`Create folder error: ${e}`, true);
        }
    }

    // ── Drag and drop ──────────────────────────────────────────────────

    function initDragDrop(dir) {
        const dropzone = document.getElementById('dropzone');
        let dragCounter = 0;

        document.addEventListener('dragenter', e => {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                dragCounter++;
                dropzone.classList.add('drag-over');
                e.preventDefault();
            }
        });

        document.addEventListener('dragleave', e => {
            dragCounter--;
            if (dragCounter <= 0) {
                dragCounter = 0;
                dropzone.classList.remove('drag-over');
            }
        });

        document.addEventListener('dragover', e => {
            if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
            }
        });

        document.addEventListener('drop', e => {
            e.preventDefault();
            dragCounter = 0;
            dropzone.classList.remove('drag-over');
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files.length > 0) {
                uploadFiles(files, dir);
            }
        });
    }

    // ── Init ───────────────────────────────────────────────────────────

    function init() {
        const dir = currentFsDir();
        setViewMode(shouldForceTileView ? 'tile' : loadViewMode());

        if (isPickerMode) {
            document.body.classList.add('fs-picker-mode');
        }

        renderBreadcrumbs(dir);
        renderListing(dir);

        // ZIP download link
        const zipBtn = document.getElementById('btn-zip');
        if (dir === '/') {
            zipBtn.href = '/fs.zip';
        } else {
            zipBtn.href = '/fs.zip?dir=' + encodeURIComponent(dir.replace(/\/$/, ''));
        }

        if (isPickerMode) {
            let uploadLabel = document.getElementById('upload-label');
            let createFolderBtn = document.getElementById('btn-create-folder');
            let headerRight = document.getElementById('header-right');
            let dropzone = document.getElementById('dropzone');

            if (zipBtn) {
                zipBtn.hidden = true;
            }
            if (uploadLabel) {
                uploadLabel.hidden = true;
            }
            if (createFolderBtn) {
                createFolderBtn.hidden = true;
            }
            if (dropzone) {
                dropzone.hidden = true;
            }

            let hint = document.createElement('span');
            hint.id = 'picker-selection-hint';
            hint.className = 'picker-selection-hint';
            hint.textContent = 'Select one or more files to continue';

            let cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.addEventListener('click', () => {
                notifyPickerParent('kcpp-fs-picker-cancel', {});
            });

            let useSelectedBtn = document.createElement('button');
            useSelectedBtn.type = 'button';
            useSelectedBtn.id = 'btn-picker-use-selected';
            useSelectedBtn.className = 'btn btn-primary';
            useSelectedBtn.textContent = 'Use selected';
            useSelectedBtn.disabled = true;
            useSelectedBtn.addEventListener('click', () => {
                notifyPickerParent('kcpp-fs-picker-use-as-text', { files: Array.from(pickerSelectedEntries.values()) });
            });

            let embedSelectedBtn = document.createElement('button');
            embedSelectedBtn.type = 'button';
            embedSelectedBtn.id = 'btn-picker-embed-selected';
            embedSelectedBtn.className = 'btn btn-primary';
            embedSelectedBtn.textContent = 'Embed selected';
            embedSelectedBtn.disabled = true;
            embedSelectedBtn.addEventListener('click', () => {
                notifyPickerParent('kcpp-fs-picker-select', { files: Array.from(pickerSelectedEntries.values()) });
            });

            headerRight.appendChild(hint);
            headerRight.appendChild(cancelBtn);
            headerRight.appendChild(useSelectedBtn);
            headerRight.appendChild(embedSelectedBtn);
            updatePickerSelectionStatus();
        }

        // File input button
        const fileInput = document.getElementById('file-input');
        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files.length > 0) {
                    uploadFiles(fileInput.files, dir);
                    fileInput.value = ''; // reset so same file can be re-selected
                }
            });
        }

        const createFolderBtn = document.getElementById('btn-create-folder');
        if (createFolderBtn) {
            createFolderBtn.addEventListener('click', () => {
                createFolder(currentFsDir());
            });
        }

        const viewModeBtn = document.getElementById('btn-view-mode');
        viewModeBtn.addEventListener('click', () => {
            setViewMode(currentViewMode === 'tile' ? 'list' : 'tile');
            renderListing(currentFsDir());
        });

        if (!isPickerMode) {
            initDragDrop(dir);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
