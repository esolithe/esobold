/* =====================================================================
   Tmpfs Browser — client-side logic
   ===================================================================== */

(function () {
    'use strict';

    const DIR_MARKER_NAME = '.kcpp_dir_marker';

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

    // ── Path helpers ───────────────────────────────────────────────────

    /**
     * Derive the logical tmpfs directory from the browser URL.
     * /tmp        → /
     * /tmp/       → /
     * /tmp/foo/   → /foo/
     * /tmp/a/b/c/ → /a/b/c/
     */
    function currentTmpDir() {
        const loc = window.location.pathname; // e.g. "/tmp/subdir/"
        let dir = loc.slice(4); // strip "/tmp"
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

    /** Build href for navigating to a tmpfs directory. */
    function dirHref(dir) {
        if (dir === '/') return '/tmp/';
        return '/tmp' + encodeURIPath(dir.endsWith('/') ? dir : dir + '/');
    }

    /** Build href for a tmpfs file. */
    function fileHref(path) {
        return '/tmp' + encodeURIPath(path);
    }

    /**
     * Encode a POSIX path, keeping slashes intact.
     */
    function encodeURIPath(path) {
        return path.split('/').map(s => encodeURIComponent(s)).join('/');
    }

    // ── Breadcrumbs ────────────────────────────────────────────────────

    function renderBreadcrumbs(dir) {
        const el = document.getElementById('breadcrumbs');
        const parts = dir === '/' ? [] : dir.replace(/\/$/, '').split('/').filter(Boolean);
        let html = '<a href="/tmp/">/ (root)</a>';
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
     * Extract direct children of `currentDir` from a flat list of all
     * tmpfs paths. Returns { dirs: string[], files: string[] }.
     */
    function getChildren(allPaths, currentDir) {
        const prefix = currentDir === '/' ? '/' : currentDir; // e.g. "/foo/"
        const childDirs = new Set();
        const childFiles = [];

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
            const r = await fetch('/api/extra/tmpfs/metadata?path=' + encodeURIComponent(path));
            if (!r.ok) return null;
            return await r.json();
        } catch (_) { return null; }
    }

    async function renderListing(dir) {
        const tbody = document.getElementById('listing-body');
        const emptyNotice = document.getElementById('empty-notice');
        const listContainer = document.getElementById('listing-container');

        tbody.innerHTML = '<tr id="loading-row"><td colspan="4">Loading\u2026</td></tr>';

        // Fetch all paths (flat list)
        let allPaths = [];
        try {
            const r = await fetch('/api/extra/tmpfs/files');
            if (r.ok) {
                const data = await r.json();
                allPaths = data.paths || [];
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">Failed to load file list: ${esc(String(e))}</td></tr>`;
            return;
        }

        const { dirs, files } = getChildren(allPaths, dir);
        const parent = parentOf(dir);

        if (dirs.length === 0 && files.length === 0 && dir === '/') {
            tbody.innerHTML = '';
            listContainer.hidden = true;
            emptyNotice.hidden = false;
            return;
        }

        listContainer.hidden = false;
        emptyNotice.hidden = true;

        const rows = [];

        // Parent link
        if (parent !== null) {
            rows.push(`<tr class="entry-parent">
                <td class="col-name"><a href="${esc(dirHref(parent))}">&#128194; ..</a></td>
                <td class="col-size"></td>
                <td class="col-modified"></td>
                <td class="col-actions"></td>
            </tr>`);
        }

        // Directories (no metadata needed)
        for (const d of dirs) {
            const childDir = dir === '/' ? '/' + d + '/' : dir + d + '/';
            rows.push(`<tr class="entry-dir">
                <td class="col-name">&#128193; <a href="${esc(dirHref(childDir))}">${esc(d)}/</a></td>
                <td class="col-size">—</td>
                <td class="col-modified">—</td>
                <td class="col-actions"><button class="btn btn-danger" data-delete-dir="${esc(childDir)}" title="Delete Folder">&#128465;</button></td>
            </tr>`);
        }

        // Files — fetch metadata in parallel for size/date
        const fileMetaPromises = files.map(f => {
            const filePath = dir === '/' ? '/' + f : dir.replace(/\/$/, '') + '/' + f;
            return fetchMetadata(filePath).then(meta => ({ f, filePath, meta }));
        });
        const fileMetas = await Promise.all(fileMetaPromises);

        for (const { f, filePath, meta } of fileMetas) {
            const size = meta ? formatBytes(meta.size_bytes != null ? meta.size_bytes : meta.size) : '—';
            const mod  = meta ? formatDate(meta.last_modified != null ? meta.last_modified : meta.modified) : '—';
            rows.push(`<tr class="entry-file">
                <td class="col-name">&#128196; <a href="${esc(fileHref(filePath))}" target="_blank" rel="noopener noreferrer">${esc(f)}</a></td>
                <td class="col-size">${esc(size)}</td>
                <td class="col-modified">${esc(mod)}</td>
                <td class="col-actions"><button class="btn btn-danger" data-delete="${esc(filePath)}" title="Delete">&#128465;</button></td>
            </tr>`);
        }

        tbody.innerHTML = rows.join('');

        // Delete handlers
        tbody.querySelectorAll('[data-delete]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const path = btn.dataset.delete;
                if (!confirm(`Delete "${path}"?`)) return;
                try {
                    const r = await fetch('/api/extra/tmpfs/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path }),
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

        // Folder delete handlers
        tbody.querySelectorAll('[data-delete-dir]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const path = btn.dataset.deleteDir;
                if (!confirm(`Delete folder "${path}" and all contents?`)) return;
                try {
                    const r = await fetch('/api/extra/tmpfs/rmdir', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ path }),
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
                const r = await fetch('/api/extra/tmpfs/upload', {
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
        renderListing(currentTmpDir());
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
            const r = await fetch('/api/extra/tmpfs/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: targetPath }),
            });
            const data = await r.json();
            if (!r.ok || data.success === false) {
                showToast(`Create folder failed: ${data.error || r.status}`, true);
                return;
            }
            showToast(`Created folder ${targetPath}`, false);
            renderListing(currentTmpDir());
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
        const dir = currentTmpDir();

        renderBreadcrumbs(dir);
        renderListing(dir);

        // ZIP download link
        const zipBtn = document.getElementById('btn-zip');
        if (dir === '/') {
            zipBtn.href = '/tmp.zip';
        } else {
            zipBtn.href = '/tmp.zip?dir=' + encodeURIComponent(dir.replace(/\/$/, ''));
        }

        // File input button
        const fileInput = document.getElementById('file-input');
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                uploadFiles(fileInput.files, dir);
                fileInput.value = ''; // reset so same file can be re-selected
            }
        });

        const createFolderBtn = document.getElementById('btn-create-folder');
        createFolderBtn.addEventListener('click', () => {
            createFolder(currentTmpDir());
        });

        initDragDrop(dir);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
