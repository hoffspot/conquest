// Downloads everything the game needs before it starts (manifest.js), reading each file as it
// arrives so the loading screen shows how far it has really got: byte by byte, group by group.
//
// Data files (the body, masks, models) are kept in memory and handed out from there: loadFile()
// is a stand-in for fetch(), and urlOf() gives a blob URL for Three.js's loaders. Code is only
// downloaded, into the browser's cache, for the page to import straight after.
//
// No Three.js here: this runs before it has downloaded.

// How many files to download at once
const AT_ONCE = 6;

// Groups whose files are kept (the rest are code, which the page imports from the cache)
const KEPT = new Set(["body", "skin", "models"]);

const TYPES = { json: "application/json", bin: "application/octet-stream", jpg: "image/jpeg", png: "image/png", gltf: "model/gltf+json" };

export class Loader {
    /**
     * @param {Array} manifest - Groups of files: [{ id, label, detail, files: [[path, bytes]] }].
     * @param {object} [options]
     * @param {string} [options.base] - What the paths are relative to (the page).
     */
    constructor(manifest, { base = document.baseURI } = {}) {
        this.base = base;
        this.groups = manifest.map((group) => ({ ...group, total: group.files.reduce((sum, [, bytes]) => sum + bytes, 0), loaded: 0, done: 0, time: 0, started: 0 }));
        this.total = this.groups.reduce((sum, group) => sum + group.total, 0);
        this.loaded = 0;
        this.current = "";
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
        const queue = this.groups.flatMap((group) => group.files.map(([path, bytes]) => ({ group, path, bytes })));
        const started = performance.now();
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

    async #download({ group, path, bytes }, onProgress) {
        const url = this.resolve(path);

        group.started ||= performance.now();
        this.current = path;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Couldn't download ${path} (${response.status})`);
        }

        const keep = KEPT.has(group.id);
        const chunks = [];
        let received = 0;

        // Count what arrives (decoded, so it matches the sizes in the manifest), trusting the
        // manifest's size for the total; if a file turns out bigger, it counts only up to that
        const count = (length) => {
            const counted = Math.max(0, Math.min(length, bytes - received));

            received += length;
            group.loaded += counted;
            this.loaded += counted;
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
        }

        if (keep) {
            this.files.set(url, new Blob(chunks, { type: TYPES[path.split(".").pop()] ?? "application/octet-stream" }));
        }

        group.done++;

        if (group.done === group.files.length) {
            group.time = performance.now() - group.started;
        }

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
