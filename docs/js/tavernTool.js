// Utils from Peter for Tavern V2 import / export

/**
 * tavern_v2_tool.js — Tavern Cards (V1 & V2)
 * 
 * Supports:
 *  - infoFromBlob / infoFromBytes: detect PNG/JSON, list tEXt keys, version, name.
 *  - extractFromPngBlob/Bytes: get JSON from PNG (tEXt['chara'] base64/plain).
 *  - embedFromJson: JSON (V1/V2) -> PNG Blob (with optional background image, size, title).
 *  - embedIntoPng: PNG bytes + JSON -> PNG bytes (inject tEXt).
 *  - swapImage: replace image pixels in a TavernCard PNG using another image, preserve JSON.
 *  - convertCard: V1<->V2 and output as JSON or PNG (Blob).
 * 
 * Embedding defaults to base64(JSON) in tEXt['chara'] + hints (chara_encoding/spec)
 * to match lite.koboldai importers. You can pass {encoding:'plain'} to write ASCII JSON.
 * 
 */

class TavernTool {
    // ------------------------- Small utils -------------------------
    PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    isPngBytes(bytes) {
        if (!bytes || bytes.length < 8) return false;
        for (let i = 0; i < 8; i++) if (bytes[i] !== this.PNG_SIG[i]) return false;
        return true;
    }

    be32(n) {
        return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
    }

    buildCRCTable() {
        let c, table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c >>> 0;
        }
        return table;
    }
    CRC_TABLE = this.buildCRCTable();
    crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) c = this.CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    detectCardKind(obj) {
        if (obj && obj.spec === 'chara_card_v2' && obj.data) return 'V2';
        const v1 = ["name", "description", "personality", "scenario", "first_mes", "mes_example"];
        if (obj && v1.every(k => k in obj)) return 'V1';
        return 'UNKNOWN';
    }

    wrapV1toV2(v1) {
        return {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: v1.name || '',
                description: v1.description || '',
                personality: v1.personality || '',
                scenario: v1.scenario || '',
                first_mes: v1.first_mes || '',
                mes_example: v1.mes_example || '',
                creator_notes: v1.creator_notes || v1.notes || '',
                system_prompt: v1.system_prompt || '{{original}}',
                post_history_instructions: v1.post_history_instructions || '{{original}}',
                alternate_greetings: v1.alternate_greetings || [],
                character_book: v1.character_book,
                tags: v1.tags || [],
                creator: v1.creator || '',
                character_version: v1.character_version || '1.0.0',
                extensions: v1.extensions || {},
            }
        };
    }

    unwrapV2toV1(v2) {
        const d = v2.data || {};
        return {
            name: d.name || '',
            description: d.description || '',
            personality: d.personality || '',
            scenario: d.scenario || '',
            first_mes: d.first_mes || '',
            mes_example: d.mes_example || '',
            character_book: d.character_book,
            tags: d.tags || [],
            creator: d.creator || '',
            character_version: d.character_version || '1.0.0',
            creator_notes: d.creator_notes || '',
            system_prompt: d.system_prompt || '',
            post_history_instructions: d.post_history_instructions || '',
            alternate_greetings: d.alternate_greetings || [],
            extensions: d.extensions || {},
        };
    }

    async blobToBytes(blob) {
        const buf = await blob.arrayBuffer();
        return new Uint8Array(buf);
    }

    // ------------------------- PNG parsing -------------------------

    /**
     * Parse tEXt and (uncompressed) iTXt chunks.
     * Returns: { list: [ {type, key, text}... ], map: { key: text } }
     * Note: iTXt compressed flag != 0 not supported (skipped).
     */
    parsePngTextChunks(bytes) {
        const out = { list: [], map: {} };
        if (!this.isPngBytes(bytes)) return out;
        let pos = 8;
        while (pos + 8 <= bytes.length) {
            const len = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
            const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
            const dataStart = pos + 8;
            const dataEnd = dataStart + len;
            const next = dataEnd + 4;
            if (dataEnd > bytes.length) break;

            if (type === 'tEXt') {
                const data = bytes.subarray(dataStart, dataEnd);
                const nul = data.indexOf(0);
                if (nul >= 0) {
                    const key = new TextDecoder().decode(data.subarray(0, nul));
                    const text = new TextDecoder().decode(data.subarray(nul + 1));
                    out.list.push({ type, key, text });
                    if (!(key in out.map)) out.map[key] = text;
                }
            } else if (type === 'iTXt') {
                // iTXt layout per spec:
                // keyword (latin1) NUL
                // compression flag (1 byte)
                // compression method (1 byte)
                // language tag (latin1) NUL
                // translated keyword (utf8) NUL
                // text (utf8 or compressed)
                const data = bytes.subarray(dataStart, dataEnd);
                let p = 0;
                const findNul = () => {
                    for (let i = p; i < data.length; i++) if (data[i] === 0) { const s = i; i++; return s; }
                    return -1;
                };
                // keyword
                let nul = data.indexOf(0, p);
                if (nul < 0) { /* skip */ }
                else {
                    const keyword = new TextDecoder('latin1').decode(data.subarray(p, nul)); p = nul + 1;
                    const compFlag = data[p++]; const compMethod = data[p++];
                    // language tag
                    nul = data.indexOf(0, p); if (nul < 0) { /* skip */ } else { /* skip value */ p = nul + 1; }
                    // translated keyword
                    nul = data.indexOf(0, p); if (nul < 0) { /* skip */ } else { /* skip value */ p = nul + 1; }
                    // now text
                    let text = '';
                    if (compFlag === 0) {
                        text = new TextDecoder().decode(data.subarray(p));
                        out.list.push({ type, key: keyword, text });
                        if (!(keyword in out.map)) out.map[keyword] = text;
                    } else {
                        // compressed iTXt not supported (no pako). ignore.
                    }
                }
            }

            if (type === 'IEND') break;
            pos = next;
        }
        return out;
    }

    extractCardFromPngBytes(bytes, keys = ['chara', 'chara_card_v2', 'ai_chara']) {
        const chunks = this.parsePngTextChunks(bytes);
        for (const key of keys) {
            if (key in chunks.map) {
                const raw = chunks.map[key].trim();
                // Try plain JSON first
                if (raw.startsWith('{') && raw.endsWith('}')) {
                    try { return { card: JSON.parse(raw), key, chunks }; } catch { }
                }
                // Then base64 JSON
                try {
                    const s = decodeURIComponent(escape(atob(raw)));
                    return { card: JSON.parse(s), key, chunks };
                } catch { }
                try {
                    const s = atob(raw); // plain b64
                    return { card: JSON.parse(s), key, chunks };
                } catch { }
            }
        }
        return { card: null, key: null, chunks };
    }

    // ------------------------- tEXt embedding -------------------------
    injectTextChunk(pngBytes, keyword, textASCII) {
        const enc = new TextEncoder(); // We'll feed ASCII (base64 or escaped)
        const keyBytes = enc.encode(keyword);
        const textBytes = enc.encode(textASCII);
        const nullSep = new Uint8Array([0]);

        const data = new Uint8Array(keyBytes.length + 1 + textBytes.length);
        data.set(keyBytes, 0);
        data.set(nullSep, keyBytes.length);
        data.set(textBytes, keyBytes.length + 1);

        const typeBytes = enc.encode('tEXt');
        const lenBytes = this.be32(data.length);
        const crcBytes = this.be32(this.crc32(new Uint8Array([...typeBytes, ...data])));

        // Find IEND
        let iendPos = -1;
        for (let i = pngBytes.length - 12; i >= 8; i--) {
            if (pngBytes[i + 4] === 73 && pngBytes[i + 5] === 69 && pngBytes[i + 6] === 78 && pngBytes[i + 7] === 68) { iendPos = i; break; }
        }
        if (iendPos < 0) throw new Error('IEND not found');

        const chunk = new Uint8Array(12 + data.length);
        chunk.set(lenBytes, 0);
        chunk.set(typeBytes, 4);
        chunk.set(data, 8);
        chunk.set(crcBytes, 8 + data.length);

        const out = new Uint8Array(pngBytes.length + chunk.length);
        out.set(pngBytes.subarray(0, iendPos), 0);
        out.set(chunk, iendPos);
        out.set(pngBytes.subarray(iendPos), iendPos + chunk.length);
        return out;
    }

    asciiEscapeJson(obj) {
        const s = JSON.stringify(obj);
        return s.replace(/[\u0080-\uFFFF]/g, ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
    }

    // ------------------------- High-level ops -------------------------
    async infoFromBlob(blob) {
        const bytes = await this.blobToBytes(blob);
        return this.infoFromBytes(bytes);
    }

    infoFromBytes(bytes) {
        if (this.isPngBytes(bytes)) {
            const { card, key, chunks } = this.extractCardFromPngBytes(bytes);
            const kind = card ? this.detectCardKind(card) : null;
            const name = card ? (kind === 'V2' ? (card.data?.name) : card.name) : null;
            return { type: 'PNG', keys: Object.keys(chunks.map), key, kind, name };
        }
        // try JSON
        try {
            const txt = new TextDecoder().decode(bytes);
            const obj = JSON.parse(txt);
            const kind = this.detectCardKind(obj);
            const name = kind === 'V2' ? obj.data?.name : obj.name;
            return { type: 'JSON', kind, name };
        } catch {
            return { type: 'UNKNOWN' };
        }
    }

    async embedFromJson(jsonObj, opts = {}) {
        const {
            width = 512, height = 512, bgImage = null, title = null,
            key = 'chara', encoding = 'base64', hints = true
        } = opts;

        // Normalize to V2 if looks like V1 and caller wants that: leave to caller (convertCard).
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, width, height);

        if (bgImage && typeof bgImage === 'string' && bgImage.startsWith('data:image/')) {
            await new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => { ctx.drawImage(img, 0, 0, width, height); res(); };
                img.onerror = rej; img.src = bgImage;
            });
        } else {
            ctx.fillStyle = '#2d2d2d'; ctx.fillRect(32, 32, width - 64, height - 64);
            const t = title || jsonObj?.data?.name || jsonObj?.name || 'Character';
            ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
            ctx.fillText(t, width / 2, height / 2);
        }

        const baseBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const pngBytes = new Uint8Array(await baseBlob.arrayBuffer());
        return this.embedIntoPng(pngBytes, jsonObj, { key, encoding, hints });
    }

    embedIntoPng(pngBytes, jsonObj, { key = 'chara', encoding = 'base64', hints = true } = {}) {
        let payload;
        if (encoding === 'base64') {
            const jsonString = JSON.stringify(jsonObj);
            payload = btoa(unescape(encodeURIComponent(jsonString)));
        } else {
            payload = this.asciiEscapeJson(jsonObj);
        }
        let out = this.injectTextChunk(pngBytes, key, payload);
        if (hints && encoding === 'base64') {
            out = this.injectTextChunk(out, 'chara_encoding', 'base64');
            if (jsonObj && jsonObj.spec === 'chara_card_v2') {
                out = this.injectTextChunk(out, 'chara_spec', 'chara_card_v2');
            }
        }
        return out;
    }

    async swapImage(cardPngBlob, newImageDataUrl, { width = 512, height = 512, key = 'chara', encoding = 'base64', hints = true, title = null } = {}) {
        const cardBytes = await this.blobToBytes(cardPngBlob);
        const { card, key: foundKey } = this.extractCardFromPngBytes(cardBytes);
        if (!card) throw new Error('No Tavern card JSON in source PNG');

        // Draw new image
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, width, height);
        if (newImageDataUrl) {
            await new Promise((res, rej) => {
                const img = new Image();
                img.onload = () => { ctx.drawImage(img, 0, 0, width, height); res(); };
                img.onerror = rej; img.src = newImageDataUrl;
            });
        } else {
            ctx.fillStyle = '#2d2d2d'; ctx.fillRect(32, 32, width - 64, height - 64);
            const t = title || (this.detectCardKind(card) === 'V2' ? card.data?.name : card.name) || 'Character';
            ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
            ctx.fillText(t, width / 2, height / 2);
        }

        const baseBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const pngBytes = new Uint8Array(await baseBlob.arrayBuffer());
        const bytes = this.embedIntoPng(pngBytes, card, { key: key || foundKey || 'chara', encoding, hints });
        return new Blob([bytes], { type: 'image/png' });
    }

    convertCard(input, { to = 'v2', output = 'json', key = 'chara', encoding = 'base64', hints = true } = {}) {
        // input can be a JS object (JSON) or PNG bytes (Uint8Array)
        let card = null;
        if (input instanceof Uint8Array && this.isPngBytes(input)) {
            const { card: c } = this.extractCardFromPngBytes(input);
            if (!c) throw new Error('No card JSON in PNG input');
            card = c;
        } else if (typeof input === 'object') {
            card = input;
        } else {
            throw new Error('Unsupported input type');
        }

        const kind = this.detectCardKind(card);
        if (to === 'v2' && kind === 'V1') card = this.wrapV1toV2(card);
        if (to === 'v1' && kind === 'V2') card = this.unwrapV2toV1(card);

        if (output === 'json') return card;
        if (output === 'png') {
            // Minimal placeholder image
            const canvas = document.createElement('canvas');
            canvas.width = 512; canvas.height = 512;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 512, 512);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
            const t = (this.detectCardKind(card) === 'V2' ? card.data?.name : card.name) || 'Character';
            ctx.fillText(t, 256, 256);
            return new Promise(res => {
                canvas.toBlob(async blob => {
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    const out = this.embedIntoPng(bytes, card, { key, encoding, hints });
                    res(new Blob([out], { type: 'image/png' }));
                }, 'image/png');
            });
        }
        throw new Error('Invalid output type');
    }
}
window.tavernTool = new TavernTool();