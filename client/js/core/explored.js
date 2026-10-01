// What the player has found of the world: the buildings they've gone into (by key: core/insides.js),
// shown on the minimap and the world map with an icon of what each is; and the chunks of the
// world they've set foot in, the rest of the world map hidden under a fog until they have.
//
// Kept with the saved game (app/save.js): the buildings as their keys, the chunks as one bit each
// (the world's 128 by 128 chunks in 2 KB), written as base64.

import { fromBase64, toBase64 } from "./wire.js";
import { CHUNK, CHUNKS } from "./worldplan/plan.js";

export class Explored {
    /**
     * @param {object} [kept] - As `toJSON` gave it: { entered: [keys], visited: base64 }.
     */
    constructor({ entered = [], visited = "" } = {}) {
        this.entered = new Set(entered.filter((key) => typeof key === "string"));
        this.visited = typeof visited === "string" && visited ? fromBase64(visited, (CHUNKS * CHUNKS) / 8) : new Uint8Array((CHUNKS * CHUNKS) / 8);

        /** Goes up by one whenever anything's found (for what's drawn from it to know to redraw). */
        this.version = 0;
    }

    /** Has the player gone into this building (its key)? */
    hasEntered(key) {
        return this.entered.has(key);
    }

    /** The player's gone into a building (its key): returns whether it's the first time. */
    enter(key) {
        if (this.entered.has(key)) {
            return false;
        }

        this.entered.add(key);
        this.version++;

        return true;
    }

    /** Has the player been in this chunk (cx, cy: chunks from the world's north-west corner)? */
    isVisited(cx, cy) {
        if (cx < 0 || cy < 0 || cx >= CHUNKS || cy >= CHUNKS) {
            return false;
        }

        const k = cy * CHUNKS + cx;

        return (this.visited[k >> 3] & (1 << (k & 7))) !== 0;
    }

    /**
     * The player is at x, y (metres, the world's): the chunk they're in is visited. Returns
     * whether it's the first time.
     */
    visit(x, y) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];

        if (cx < 0 || cy < 0 || cx >= CHUNKS || cy >= CHUNKS || this.isVisited(cx, cy)) {
            return false;
        }

        const k = cy * CHUNKS + cx;

        this.visited[k >> 3] |= 1 << (k & 7);
        this.version++;

        return true;
    }

    /** How many chunks have been visited. */
    get chunksVisited() {
        let count = 0;

        for (const byte of this.visited) {
            for (let bits = byte; bits; bits &= bits - 1) {
                count++;
            }
        }

        return count;
    }

    /** What to keep: { entered: [keys], visited: base64 }. */
    toJSON() {
        return { entered: [...this.entered], visited: toBase64(this.visited) };
    }
}
