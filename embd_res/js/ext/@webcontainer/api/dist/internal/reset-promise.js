/**
 * @internal
 */
export function resettablePromise() {
    let resolve;
    let promise;
    function reset() {
        promise = new Promise((_resolve) => (resolve = _resolve));
    }
    reset();
    return {
        get promise() {
            return promise;
        },
        resolve(value) {
            return resolve(value);
        },
        reset,
    };
}
