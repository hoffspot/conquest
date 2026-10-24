// Updates downloaded in the background (generated/game_delivery_plan.md, 3.5). Every so often
// while the game's open, the page asks for itself afresh (index.html) and reads its import map: a
// release whose name isn't this page's is new. Its manifest and catalog (named there by their
// hashes) say the rest of its files. The service worker's asked to download those it doesn't keep,
// one at a time, each checked by its hash and kept (sw.js prefetch), saying how far it's got; once
// they're all there, an update's ready. The page reloads into it at the title screen (or when the
// player chooses), and downloads nothing more.
//
// No Three.js here: this runs before it has downloaded.

import { mappedOf, releaseOf } from "./catalog.js";

/** How often to look for an update while the game's open (ms). */
export const UPDATES = Object.freeze({ every: 15 * 60000 });

// What a page names its release by: its import map, and main.js's script
const MAP = /<script type="importmap">([\s\S]*?)<\/script>/;
const MAIN = /<script type="module" src="(js\/main\.js\?h=[0-9a-f]{10})"><\/script>/;

/**
 * A release's files, as the service worker hears a release (catalog.js releaseOf: its name, `boot`
 * and `assets`), from its page (`html`: index.html's text) and its manifest and catalog, loaded by
 * their hashed addresses (`load`: import() them); null if the page doesn't name them.
 */
export async function releaseFrom(html, base, load = (url) => import(url)) {
    const map = MAP.exec(html)?.[1];
    const main = MAIN.exec(html)?.[1];
    const modules = mappedOf(map, base);
    const manifest = modules.find((url) => /\/js\/app\/manifest\.js\?h=/.test(url));
    const assets = modules.find((url) => /\/js\/app\/assets\.js\?h=/.test(url));

    if (!map || !main || !manifest || !assets) {
        return null;
    }

    const [{ MANIFEST }, { ASSETS }] = await Promise.all([load(manifest), load(assets)]);

    return releaseOf(MANIFEST, ASSETS, base, [...modules, new URL(main, base).href]);
}

export class Updater {
    /**
     * @param {object} options
     * @param {string} options.release - This page's release (its name).
     * @param {string} options.base - Where the page is (document.baseURI).
     * @param {Function} [options.post] - Tells the service worker something (null if there's none).
     * @param {Function} [options.fetch] - fetch().
     * @param {Function} [options.load] - import().
     * @param {Function} [options.now] - The time (ms).
     */
    constructor({ release, base, post = () => false, fetch = (...args) => globalThis.fetch(...args), load = (url) => import(url), now = () => performance.now() }) {
        this.release = release;
        this.base = base;
        this.post = post;
        this.fetch = fetch;
        this.load = load;
        this.now = now;

        /** When it last looked (ms): the page's loading counts, as it's the newest then. */
        this.looked = now();
        this.looking = false;

        /** The release being downloaded ({ release, boot, assets }), once one's found. */
        this.next = null;

        /** The release downloaded, once it's all there: an update's ready. */
        this.ready = null;

        /** Hears how far a download's got ({ done, total }). */
        this.onProgress = () => {};

        /** Hears an update's ready (its release). */
        this.onReady = () => {};
    }

    /** Look for an update if it's been UPDATES.every since the last look (or now, `asked`). */
    async check({ asked = false } = {}) {
        if (this.ready || this.looking || (!asked && this.now() - this.looked < UPDATES.every)) {
            return;
        }

        this.looking = true;
        this.looked = this.now();

        try {
            const response = await this.fetch(new URL("index.html", this.base).href, { cache: "no-store" });

            if (!response.ok) {
                return;
            }

            const next = await releaseFrom(await response.text(), this.base, this.load);

            // (The same release, or one already being downloaded)
            if (!next || next.release === this.release || next.release === this.next?.release) {
                return;
            }

            // (No service worker to download it: it's for the next load as it is)
            if (this.post({ ...next, kind: "prefetch" }) === false) {
                return;
            }

            this.next = next;
        } catch {
            // (Offline, or the page unreadable: looked again next time)
        } finally {
            this.looking = false;
        }
    }

    /** What the service worker says of the download ({ kind: "prefetching" or "prefetched", release, done, total }). */
    heard(message) {
        if (!this.next || message?.release !== this.next.release) {
            return;
        }

        if (message.kind === "prefetching") {
            this.onProgress({ done: message.done, total: message.total });
        } else if (message.kind === "prefetched") {
            this.ready = this.next;
            this.onReady(this.ready);
        } else if (message.kind === "unfetched") {
            // (Not all of it: looked for, and what's left asked for, next time)
            this.next = null;
        }
    }
}
