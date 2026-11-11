// Downloads everything the game needs before it starts (manifest.js), reading each file as it
// arrives so the loading screen shows how far it has really got: byte by byte, group by group.
//
// Every file is fetched by its hash (path?h=hash, which the service worker keeps for good). Data
// files (the body, masks, models: the TYPES below) are kept in memory too, and handed out from
// there by their names: loadFile() is a stand-in for fetch(), and urlOf() gives a blob URL for
// Three.js's loaders. Code, the fonts and the WebAssembly are only downloaded, for the page to
// import or ask for straight after (the code by the same address, from its import map; the rest
// by name, which the service worker maps to the same copy).
//
// On a visit after the first the service worker keeps nearly all of it. The loader asks it which
// addresses it keeps before it starts (sw.js keptOf), and doesn't ask for those it only downloads:
// they're counted as loaded, from this device, at once. Without that every one was asked for and
// read through, 400 code files and 13 MB of them, only to be counted, and then asked for again as
// the page imported it. What's kept in memory is still read from there (a kept copy, quickly).
//
// No Three.js here: this runs before it has downloaded.

import { hashed } from "./catalog.js";

// How many files to download at once, whatever the site's served by: over HTTP/2 or 3, as many
// as that in one round trip; over HTTP/1.1 the browser keeps to 6 at a time itself, the rest
// waiting their turn, so asking for more costs nothing there (measured: 3.0 s at 16, 3.3 at 6)
const AT_ONCE = 16;

const TYPES = { json: "application/json", bin: "application/octet-stream", jpg: "image/jpeg", png: "image/png", gltf: "model/gltf+json" };

// How long the service worker's given to say what it keeps (ms): it answers from two lists it
// has to hand, in a few ms; one that doesn't know the question (an older release's, still looking
// after the page till this one's takes over) never answers, and everything's asked for as before
const KEPT_WAIT = 1000;

/**
 * Which of `urls` the service worker keeps (sw.js keptOf), as a Set: none if no worker's looking
 * after the page, or it doesn't say within `wait` ms.
 */
export function keptBy(worker, urls, wait = KEPT_WAIT) {
    if (!worker || !urls.length || !globalThis.MessageChannel) {
        return Promise.resolve(new Set());
    }

    return new Promise((resolve) => {
        const channel = new MessageChannel();
        const answered = (kept) => {
            clearTimeout(timer);
            channel.port1.close();
            resolve(new Set(Array.isArray(kept) ? kept : []));
        };
        const timer = setTimeout(answered, wait);

        channel.port1.onmessage = (event) => answered(event.data?.kept);

        try {
            worker.postMessage({ kind: "kept", urls }, [channel.port2]);
        } catch {
            answered();
        }
    });
}

export class Loader {
    /**
     * @param {Array} manifest - Groups of files: [{ id, label, detail, files: [[path, bytes, hash?]] }].
     * @param {object} [options]
     * @param {string} [options.base] - What the paths are relative to (the page).
     * @param {object} [options.worker] - The service worker looking after the page, if one is
     *     (asked what it keeps).
     */
    constructor(manifest, { base = document.baseURI, worker = globalThis.navigator?.serviceWorker?.controller ?? null } = {}) {
        this.base = base;
        this.worker = worker;
        this.groups = manifest.map((group) => ({ ...group, total: group.files.reduce((sum, [, bytes]) => sum + bytes, 0), loaded: 0, done: 0, time: 0, started: 0 }));
        this.total = this.groups.reduce((sum, group) => sum + group.total, 0);
        this.loaded = 0;

        /** Of what's loaded, how much came from this device (what the service worker keeps: sw.js) and how much was downloaded. */
        this.kept = 0;
        this.downloaded = 0;

        /** The file being loaded, and whether it came from this device. */
        this.current = "";
        this.currentKept = false;
        this.files = new Map();
        this.blobs = new Map();
    }

    /** The full URL of a path in the manifest. */
    resolve(path) {
        return new URL(path, this.base).href;
    }

    /**
     * Download everything. `onProgress(loader)` hears as each chunk arrives; read `loaded`,
     * `total`, `current` and each group's `loaded`, `total`, `done` (files) and `time` (ms).
     */
    async load(onProgress = () => {}) {
        const all = this.groups.flatMap((group) => group.files.map(([path, bytes, hash]) => ({ group, path, bytes, hash })));
        const started = performance.now();

        // (What the service worker keeps already, of what's only downloaded (the code, the fonts,
        // the WebAssembly: not the data kept in memory): counted, not asked for)
        const only = new Map(all.filter(({ path, hash }) => hash && !TYPES[path.split(".").pop()]).map((file) => [this.resolve(hashed(file.path, file.hash)), file]));
        const here = new Set([...(await keptBy(this.worker, [...only.keys()]))].map((url) => only.get(url)));
        const queue = [];

        for (const file of all) {
            if (here.has(file)) {
                this.#here(file, onProgress);
            } else {
                queue.push(file);
            }
        }

        const next = async () => {
            while (queue.length) {
                await this.#download(queue.shift(), onProgress);
            }
        };

        await Promise.all(Array.from({ length: AT_ONCE }, next));
        this.time = performance.now() - started;
        this.current = "";
        onProgress(this);
    }

    // A file the service worker keeps, that's only downloaded: all of it loaded, from this device
    #here({ group, path, bytes }, onProgress) {
        group.started ||= performance.now();
        this.current = path;
        this.currentKept = true;
        group.loaded += bytes;
        this.loaded += bytes;
        this.kept += bytes;
        this.#done(group);
        onProgress(this);

        return true;
    }

    // One more of a group's files loaded
    #done(group) {
        group.done++;

        if (group.done === group.files.length) {
            group.time = performance.now() - group.started;
        }
    }

    async #download({ group, path, bytes, hash }, onProgress) {
        const url = this.resolve(path);

        group.started ||= performance.now();
        this.current = path;

        const response = await fetch(hash ? this.resolve(hashed(path, hash)) : url);

        if (!response.ok) {
            throw new Error(`Couldn't download ${path} (${response.status})`);
        }

        // (Data is kept, by its name; code isn't: the page imports it from the cache. A copy the
        // service worker keeps says so: sw.js handed)
        const keep = Boolean(hash && TYPES[path.split(".").pop()]);
        const fromDevice = response.headers.get("X-Pellagos-Kept") === "1";

        this.currentKept = fromDevice;
        const chunks = [];
        let received = 0;

        // Count what arrives (decoded, so it matches the sizes in the manifest), trusting the
        // manifest's size for the total; if a file turns out bigger, it counts only up to that
        const count = (length) => {
            const counted = Math.max(0, Math.min(length, bytes - received));

            received += length;
            group.loaded += counted;
            this.loaded += counted;

            if (fromDevice) {
                this.kept += counted;
            } else {
                this.downloaded += counted;
            }

            onProgress(this);
        };

        if (response.body?.getReader) {
            const reader = response.body.getReader();

            for (;;) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                if (keep) {
                    chunks.push(value);
                }

                count(value.byteLength);
            }
        } else {
            const buffer = await response.arrayBuffer();

            chunks.push(new Uint8Array(buffer));
            count(buffer.byteLength);
        }

        // Whatever the manifest said was left (a file that came smaller)
        if (received < bytes) {
            group.loaded += bytes - received;
            this.loaded += bytes - received;
            this[fromDevice ? "kept" : "downloaded"] += bytes - received;
        }

        if (keep) {
            this.files.set(url, new Blob(chunks, { type: TYPES[path.split(".").pop()] ?? "application/octet-stream" }));
        }

        this.#done(group);
        onProgress(this);
    }

    /** Like fetch(), from what's been downloaded (or the network, for anything else). */
    loadFile = async (url) => {
        const blob = this.files.get(new URL(url, this.base).href);

        return blob ? new Response(blob, { status: 200, headers: { "Content-Type": blob.type } }) : fetch(url);
    };

    /** A URL to read a downloaded file from (a blob URL), or the URL itself. */
    urlOf = (url) => {
        const href = new URL(url, this.base).href;
        const blob = this.files.get(href);

        if (!blob) {
            return url;
        }

        if (!this.blobs.has(href)) {
            this.blobs.set(href, URL.createObjectURL(blob));
        }

        return this.blobs.get(href);
    };
}

/** A size in bytes, for people: "840 KB", "1.4 MB". */
export function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
