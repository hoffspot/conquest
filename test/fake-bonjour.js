// A Wi-Fi of fake Bonjour responders, for the tests (test/nearby.test.js, e2e/nearby.spec.js): what
// each server on it advertises, the others browsing find, each name made unique as a responder
// does; looked up, each host gives the address it's been given; and, told to, every one refuses
// as macOS would (platform/bonjour.js's refusals).

import { EventEmitter } from "node:events";
import { refusal } from "../server/platform/bonjour.js";

// A Wi-Fi of fake responders: what each advertises, the others browsing find (each name made unique, as a responder does)
export class FakeNetwork {
    constructor() {
        this.adverts = new Map();
        this.browsers = new Set();
        this.addresses = new Map();
        this.refuse = null;
    }

    #handle(stop) {
        const handle = new EventEmitter();

        handle.stop = () => {
            handle.stopped = true;
            stop?.();
        };

        return handle;
    }

    /** A host's address on it (as the server's lookup asks it). */
    async lookup(host) {
        return { address: this.addresses.get(host) ?? null };
    }

    /** The Bonjour (platform/ bonjour()'s way) of a machine on it, known as `host`. */
    bonjour(host) {
        return {
            advertise: ({ name, port, txt }) => {
                let taken = name;

                for (let n = 2; this.adverts.has(taken); n++) {
                    taken = `${name} (${n})`;
                }

                const handle = this.#handle(() => {
                    if (this.adverts.get(taken)?.handle === handle) {
                        this.adverts.delete(taken);
                        this.browsers.forEach((browser) => browser.emit("lost", { name: taken }));
                    }
                });

                setTimeout(() => {
                    if (handle.stopped) {
                        return;
                    }

                    if (this.refuse) {
                        handle.emit("refused", refusal(this.refuse));

                        return;
                    }

                    this.adverts.set(taken, { name: taken, host, port, txt, handle });
                    handle.emit("registered", taken);
                    this.browsers.forEach((browser) => browser.emit("found", { name: taken }));
                }, 1);

                return handle;
            },
            browse: () => {
                const handle = this.#handle(() => this.browsers.delete(handle));

                setTimeout(() => {
                    if (handle.stopped) {
                        return;
                    }

                    if (this.refuse) {
                        handle.emit("refused", refusal(this.refuse));

                        return;
                    }

                    this.browsers.add(handle);
                    this.adverts.forEach(({ name }) => handle.emit("found", { name }));
                }, 1);

                return handle;
            },
            resolve: async (name) => {
                const advert = this.adverts.get(name);

                if (!advert) {
                    throw { code: "gone", message: `${name} is gone.` };
                }

                return { host: advert.host, port: advert.port, txt: advert.txt };
            },
        };
    }
}
