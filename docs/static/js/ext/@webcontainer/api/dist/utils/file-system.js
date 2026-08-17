import { nullPrototype } from './null-prototype.js';
/**
 * @internal
 */
export function toInternalFileSystemTree(tree) {
    const newTree = { d: {} };
    for (const name of Object.keys(tree)) {
        const entry = tree[name];
        if ('file' in entry) {
            if ('symlink' in entry.file) {
                newTree.d[name] = { f: { l: entry.file.symlink } };
                continue;
            }
            const contents = entry.file.contents;
            const stringContents = typeof contents === 'string' ? contents : toLatin1(contents);
            const binary = typeof contents === 'string' ? {} : { b: true };
            newTree.d[name] = { f: { c: stringContents, ...binary } };
            continue;
        }
        const newEntry = toInternalFileSystemTree(entry.directory);
        newTree.d[name] = newEntry;
    }
    return newTree;
}
/**
 * @internal
 */
export function toExternalFileSystemTree(tree) {
    const newTree = nullPrototype();
    if ('f' in tree) {
        throw new Error('It is not possible to export a single file in the JSON format.');
    }
    if ('d' in tree) {
        for (const name of Object.keys(tree.d)) {
            const entry = tree.d[name];
            if ('d' in entry) {
                newTree[name] = nullPrototype({
                    directory: toExternalFileSystemTree(entry),
                });
            }
            else if ('f' in entry) {
                if ('c' in entry.f) {
                    newTree[name] = nullPrototype({
                        file: nullPrototype({
                            contents: entry.f.b ? fromBinaryString(entry.f.c) : entry.f.c,
                        }),
                    });
                }
                else if ('l' in entry.f) {
                    newTree[name] = nullPrototype({
                        file: nullPrototype({
                            symlink: entry.f.l,
                        }),
                    });
                }
            }
        }
    }
    return newTree;
}
function fromBinaryString(s) {
    const encoded = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
        encoded[i] = s[i].charCodeAt(0);
    }
    return encoded;
}
function toLatin1(bytes) {
    let decoded = '';
    for (let i = 0; i < bytes.length; i++) {
        decoded += String.fromCharCode(bytes[i]);
    }
    return decoded;
}
