export class TypedEventTarget {
    _bus = new EventTarget();
    listen(listener) {
        function wrappedListener(event) {
            listener(event.data);
        }
        this._bus.addEventListener('message', wrappedListener);
        return () => this._bus.removeEventListener('message', wrappedListener);
    }
    fireEvent(data) {
        this._bus.dispatchEvent(new MessageEvent('message', { data }));
    }
}
