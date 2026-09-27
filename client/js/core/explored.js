// What the player has found of the world: the buildings they've gone into (by key: core/insides.js),
// shown on the minimap and the world map with an icon of what each is; and the chunks of the
// world they've set foot in, the rest of the world map hidden under a fog until they have.
//
// Kept with the saved game (app/save.js): the buildings as their keys, the chunks as one bit each
// (the world's 128 by 128 chunks in 2 KB), written as base64.

import { CHUNK, CHUNKS } from "./worldplan/plan.js";

// Base64, by hand (the same in Node and the browser, without Buffer or btoa)
const DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(bytes) {
    let text = "";

    for (let k = 0; k < bytes.length; k += 3) {
        const [a, b = 0, c = 0] = [bytes[k], bytes[k + 1], bytes[k + 2]];
        const n = (a << 16) | (b << 8) | c;

        text += DIGITS[(n >> 18) & 63] + DIGITS[(n >> 12) & 63] + (k + 1 < bytes.length ? DIGITS[(n >> 6) & 63] : "=") + (k + 2 < bytes.length ? DIGITS[n & 63] : "=");
    }

    return text;
}

function fromBase64(text, length) {
    const bytes = new Uint8Array(length);
    let at = 0;

    for (let k = 0; k + 3 < text.length + 1 && at < length; k += 4) {
        const n = [0, 1, 2, 3].reduce((sum, j) => (sum << 6) | Math.max(0, DIGITS.indexOf(text[k + j] ?? "A")), 0);

        for (const byte of [(n >> 16) & 255, (n >> 8) & 255, n & 255]) {
            if (at < length) {
                bytes[at++] = byte;
            }
        }
    }

    return bytes;
}

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
