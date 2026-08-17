/**
 * @internal
 */
export function nullPrototype(source) {
    const prototype = Object.create(null);
    if (!source) {
        return prototype;
    }
    return Object.assign(prototype, source);
}
