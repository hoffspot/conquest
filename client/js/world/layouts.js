// The settlements a little way ahead of the player, laid out off the page's thread (in a worker:
// layout-worker.js) and given to the world (core/settlements.js give) to take when they're first
// wanted, rather than laid out then: a town takes tens of milliseconds to lay out, a capital a
// couple of hundred (several times that on a phone), which would be a stall as the player comes
// near. The layout is the same either way, so wherever it was laid out, everyone's world agrees.
// Where there are no workers (or one fails), they're laid out when they're wanted, as ever.
//
// A dungeon's levels are worked out the same way, on the same worker (delve: core/dungeons/
// build.js buildDungeon's, tens of milliseconds, a couple of hundred the first time), and given
// to the world's buildings (core/insides.js Interiors give) to take when the dungeon's made, if
// it's made of what they were worked out from.

import { CHUNKS } from "../core/overworld.js";

/** How far ahead (chunks, each way round the player's) settlements are laid out. */
export const AHEAD = 5;

// What a dungeon's made from, as text: to tell one asking from another
const whatOf = ({ seed, theme, tier, generation }) => JSON.stringify([seed, theme, tier, generation]);

export class Layouts {
    /**
     * @param {object} settlements - The world's (core/settlements.js Settlements).
     * @param {object} [interiors] - The world's buildings (core/insides.js Interiors), for the
     *     dungeons' levels worked out here too (delve); none, they aren't.
     */
    constructor(settlements, interiors = null) {
        this.settlements = settlements;
        this.interiors = interiors;

        // The places asked for, by id; and the dungeons, by their building's key: what each was
        // last asked for as (what it's made from, as text)
        this.asked = new Map();
        this.delved = new Map();
        this.worker = null;

        if (typeof Worker === "undefined") {
            return;
        }

        try {
            this.worker = new Worker(new URL("./layout-worker.js", import.meta.url), { type: "module" });
        } catch {
            return;
        }

        this.worker.onmessage = ({ data: { id, spec, town, dungeon, from } }) => {
            // (A dungeon's levels: given, if it's still wanted as what they were worked out from)
            if (dungeon) {
                if (this.delved.get(from.key) === whatOf(from)) {
                    this.interiors?.give(from.key, from, dungeon);
                }

                return;
            }

            const place = this.asked.get(id);

            if (place) {
                this.settlements.give(place, spec, town);
            }
        };
        // (Laid out when they're wanted, then)
        this.worker.onerror = () => this.dispose();
    }

    /** Lay out the settlements near the chunks within AHEAD of a chunk that aren't yet (nearest first). */
    ahead(cx, cy) {
        if (!this.worker) {
            return;
        }

        const wanted = [];

        for (let dy = -AHEAD; dy <= AHEAD; dy++) {
            for (let dx = -AHEAD; dx <= AHEAD; dx++) {
                if (cx + dx < 0 || cy + dy < 0 || cx + dx >= CHUNKS || cy + dy >= CHUNKS) {
                    continue;
                }

                for (const place of this.settlements.near(cx + dx, cy + dy)) {
                    if (!this.asked.has(place.id) && !this.settlements.laid.has(place.id)) {
                        this.asked.set(place.id, place);
                        wanted.push([Math.max(Math.abs(dx), Math.abs(dy)), place]);
                    }
                }
            }
        }

        for (const [, place] of wanted.sort(([a], [b]) => a - b)) {
            this.worker.postMessage({ id: place.id, spec: this.settlements.specOf(place) });
        }
    }

    /**
     * Whether a chunk's better left a moment before it's made: a settlement by it has been asked
     * for here and isn't back yet (laid out where the chunk's made, it's tens of milliseconds, a
     * couple of hundred for a capital).
     */
    pending(cx, cy) {
        const { settlements } = this;

        return Boolean(this.worker) && settlements.near(cx, cy).some((place) => this.asked.has(place.id) && !settlements.laid.has(place.id) && !settlements.given.has(place.id));
    }

    /**
     * The dungeons wanted soon, all of them (core/host.js soon's `dungeons`: each its building's
     * key and what it's made from, { key, seed, theme, tier, generation }): each one's levels
     * worked out, unless they were last asked for as just that (asked for as something else, a
     * mightier finder come near or the dungeon cleared and to be made again, they're worked out
     * again); and what was worked out for one no longer wanted (its finders gone by) let go of.
     */
    delve(dungeons) {
        if (!this.worker || !this.interiors) {
            return;
        }

        const wanted = new Set(dungeons.map(({ key }) => key));

        for (const key of [...this.delved.keys()]) {
            if (!wanted.has(key)) {
                this.delved.delete(key);
                this.interiors.give(key, null, null);
            }
        }

        for (const from of dungeons) {
            const what = whatOf(from);

            if (this.delved.get(from.key) !== what) {
                this.delved.set(from.key, what);
                this.worker.postMessage({ dungeon: { key: from.key, seed: from.seed, theme: from.theme, tier: from.tier, generation: from.generation } });
            }
        }
    }

    /** Stop laying out. */
    dispose() {
        this.worker?.terminate();
        this.worker = null;
    }
}
