// What the player has found of the world: the buildings they've gone into (by key: core/insides.js),
// shown on the minimap and the world map with an icon of what each is; the chunks of the world
// they've set foot in, the rest of the world map hidden under a fog until they have; and the
// adventurers' guild's branches whose portals they can step through to (core/portals.js: by their
// places' ids), each one they've been into. In a party, what each finds is found by the others
// too (Host #share), and kept by them for good: the places worth finding one of them found first,
// by whom (`found`), for the maps to say.
//
// Kept with the saved game (app/save.js): the buildings as their keys, the chunks as one bit each
// (the world's 128 by 128 chunks in 2 KB), written as base64, the branches as their ids, and
// who found what for them as { place's id: name }. One kept from before there were portals has
// none (`portals` null), till the host works out which they'd found (Host join).

import { fromBase64, toBase64 } from "./wire.js";
import { CHUNK, CHUNKS } from "./worldplan/plan.js";

export class Explored {
    /**
     * @param {object} [kept] - As `toJSON` gave it: { entered: [keys], visited: base64, portals: [ids], found: { id: name } }.
     */
    constructor({ entered = [], visited = "", portals = null, found = {} } = {}) {
        this.entered = new Set(entered.filter((key) => typeof key === "string"));
        this.visited = typeof visited === "string" && visited ? fromBase64(visited, (CHUNKS * CHUNKS) / 8) : new Uint8Array((CHUNKS * CHUNKS) / 8);

        /** The guild's branches open to step through to (plan place ids), or null till worked out. */
        this.portals = Array.isArray(portals) ? new Set(portals.filter((id) => typeof id === "string")) : null;

        /** The places another of their party found for them first (plan place ids), by whom (their name). */
        this.found = new Map(found && typeof found === "object" ? Object.entries(found).filter(([, name]) => typeof name === "string") : []);

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

    /** Can the player step through a guild's portal to this branch (a plan place's id)? */
    canTravelTo(id) {
        return this.portals?.has(id) ?? false;
    }

    /**
     * A guild's branch (a plan place's id) open to step through to: the player's been in it.
     * Returns whether it's the first time.
     */
    openPortal(id) {
        this.portals ??= new Set();

        if (typeof id !== "string" || this.portals.has(id)) {
            return false;
        }

        this.portals.add(id);
        this.version++;

        return true;
    }

    /** Who found a place (a plan place's id) for the player, if another of their party did first (their name), or null. */
    finderOf(id) {
        return this.found.get(id) ?? null;
    }

    /** Another of the player's party (`name`) found a place for them first (a plan place's id). */
    foundBy(id, name) {
        if (!this.found.has(id)) {
            this.found.set(id, name);
            this.version++;
        }
    }

    /** Has the player been in this chunk (cx, cy: chunks from the world's north-west corner)? */
    isVisited(cx, cy) {
        if (cx < 0 || cy < 0 || cx >= CHUNKS || cy >= CHUNKS) {
            return false;
        }

        const k = cy * CHUNKS + cx;

        return (this.visited[k >> 3] & (1 << (k & 7))) !== 0;
    }

    /** Has the player been in the chunk a point's in (x, y: metres, the world's)? */
    visitedAt(x, y) {
        return this.isVisited(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
    }

    /**
     * Has the player found somewhere (x, y: metres, the world's): been in the chunk it's in, or in
     * one of the eight round it. The one rule for it: the maps' icons of places (app/game.js
     * worldMapView) and the rumours of those still to find (core/rumours.js) alike.
     */
    sighted(x, y) {
        const [cx, cy] = [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];

        return [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => this.isVisited(cx + dx, cy + dy)));
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

    /**
     * What to keep: { entered: [keys], visited: base64, portals: [ids], found: { id: name } } (no
     * `portals` till they're worked out, and no `found` till another's found something for them).
     */
    toJSON() {
        return { entered: [...this.entered], visited: toBase64(this.visited), ...(this.portals ? { portals: [...this.portals] } : {}), ...(this.found.size ? { found: Object.fromEntries(this.found) } : {}) };
    }
}
