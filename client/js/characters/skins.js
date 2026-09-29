// Skins painted off the page's thread (in a worker: skin-worker.js), for characters built a step at
// a time (Character.building): a skin at 1024 is a couple of hundred milliseconds of painting (a
// phone's at 512 as long), about half of building someone. Asked for as a character's building
// starts, it's painted while the rest of them is built, and taken when it's wanted. The picture is
// the same wherever it's painted (skin.js paintSkin). Where there are no workers (or one fails),
// or where the steps can't wait (all at once), it's painted here, as ever.

import { NOW, WAITING } from "../core/steps.js";
import { paintingSkin, SkinAtlas } from "./skin.js";

export class Skins {
    /**
     * @param {object} [atlas] - The kit's (skin.js SkinAtlas), a copy of whose fields is sent over;
     *   or none yet, for the worker to work out (`analyse`).
     */
    constructor(atlas = null) {
        this.atlas = atlas;
        this.worker = null;
        this.analysed = null;

        // The skins asked for and not yet painted, by id; the atlas's fields sent over so far
        this.jobs = new Map();
        this.sent = new Set();
        this.next = 0;

        if (typeof Worker === "undefined") {
            return;
        }

        try {
            this.worker = new Worker(new URL("./skin-worker.js", import.meta.url), { type: "module" });
        } catch {
            return;
        }

        this.worker.onmessage = ({ data: { id, skin, analysed } }) => {
            if (analysed) {
                this.analysed?.(analysed);

                return;
            }

            const job = this.jobs.get(id);

            this.jobs.delete(id);

            if (job) {
                job.skin = skin;
            }
        };
        // (Painted here, then)
        this.worker.onerror = () => this.dispose();

        if (atlas) {
            this.#send();
        }
    }

    /**
     * Work out the skin atlas for the body (`files`: body.js loadHumanFiles's, of `human`) with its
     * masks at `size`, in the worker (it keeps it, for painting): resolves with the page's own, made
     * from what the worker found. Where there's no worker (or it fails), worked out here, after the
     * page has had a moment to show what it's showing.
     */
    analyse(files, human, masks, size) {
        const here = () => new Promise((resolve) => setTimeout(resolve, 0)).then(() => new SkinAtlas(human, masks, size));
        const found = this.worker
            ? new Promise((resolve, reject) => {
                  this.analysed = resolve;
                  this.failed = reject;
                  this.worker.postMessage({ analyse: { manifest: files.manifest, body: files.data, masks, size } });
              }).then((parts) => {
                  const atlas = new SkinAtlas(human, masks, size, parts);

                  // (What the worker has already: nothing of it to send over)
                  for (const name of Object.keys(parts.fields)) {
                      this.sent.add(name);
                  }

                  return atlas;
              }, here)
            : here();

        return found.then((atlas) => (this.atlas = atlas));
    }

    // Send over whatever of the atlas it hasn't got (its fields for fur and scales are made the
    // first time they're wanted)
    #send() {
        const { size, covered, gutter, fields } = this.atlas;
        const names = Object.keys(fields).filter((name) => !this.sent.has(name));

        if (!names.length) {
            return;
        }

        const atlas = { fields: Object.fromEntries(names.map((name) => [name, fields[name]])) };

        if (!this.sent.size) {
            Object.assign(atlas, { size, covered, gutter: Int32Array.from(gutter) });
        }

        this.worker.postMessage({ atlas });

        for (const name of names) {
            this.sent.add(name);
        }
    }

    /**
     * Start painting a skin (paintSkin's settings) elsewhere, if it can be: a job for `painting`
     * to take, or null.
     */
    ask(settings) {
        if (!this.worker || settings.image) {
            return null;
        }

        // (Fur, stripes and scales: their fields made, the first time, and sent over)
        if (settings.fur || settings.stripes || settings.scales) {
            this.atlas.furAndScales();
            this.#send();
        }

        const job = { id: this.next++, settings, skin: null };

        this.jobs.set(job.id, job);
        this.worker.postMessage({ id: job.id, settings });

        return job;
    }

    /**
     * A skin asked for (`ask`'s job; or, if null, `settings`'), a step at a time: WAITING till
     * it's painted elsewhere, or painted here if the steps can't wait (or it can't be painted
     * elsewhere). Returns it: { width, height, data, bump }.
     */
    *painting(job, settings = job?.settings) {
        while (job && !job.skin && this.worker) {
            if ((yield WAITING) === NOW) {
                break;
            }
        }

        if (job?.skin) {
            return job.skin;
        }

        // (Not wanted there any more, if it's not been started)
        if (job) {
            this.jobs.delete(job.id);
            this.worker?.postMessage({ cancel: job.id });
        }

        return yield* paintingSkin(this.atlas, settings);
    }

    /** Stop painting elsewhere (an atlas being worked out there is worked out here instead). */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
        this.failed?.();
        this.analysed = this.failed = null;
        this.jobs.clear();
    }
}
