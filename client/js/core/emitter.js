// A minimal event emitter used to keep the simulation free of DOM and audio code.
// The game emits events ("message", "sound", "levelend", ...) and the browser layer listens.
export class Emitter {
    #listeners = new Map();

    on(type, listener) {
        if (!this.#listeners.has(type)) {
            this.#listeners.set(type, new Set());
        }

        this.#listeners.get(type).add(listener);

        // Return an unsubscribe function for convenience
        return () => this.off(type, listener);
    }

    off(type, listener) {
        this.#listeners.get(type)?.delete(listener);
    }

    emit(type, ...args) {
        const listeners = this.#listeners.get(type);

        if (!listeners) {
            return;
        }

        // Copy the listeners so handlers can unsubscribe while the event is being dispatched
        for (const listener of [...listeners]) {
            listener(...args);
        }
    }
}
