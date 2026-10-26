// What the player has found of the world: the buildings they've gone into (by key: core/insides.js),
// shown on the minimap and the world map with an icon of what each is; the chunks of the world
// they've set foot in, the rest of the world map hidden under a fog until they have; and the
// adventurers' guild's branches whose portals they can step through to (core/portals.js: by their
// places' ids), each one they've been into; and the signs they've read on the trails out of the
// wild's camps and lairs (core/tracks.js: by their ids), and the homes they've tracked those trails
// to (by the camp's or site's id), marked on their maps; the rings of standing stones they've
// stood in (core/rings.js: by their sites' ids), each one's moon theirs to know; and the places
// worth finding they've seen from high ground (core/sighting.js: by their ids), found without
// going near (`spotted`). In a party, what each finds is found by the others too (Host #share),
// and what each had found before, by the others as they come into it (merge, Host #pool); kept by
// them for good: the places worth finding one of them found first, by whom (`found`), for the
// maps to say.
//
// Kept with the saved game (app/save.js): the buildings as their keys, the chunks as one bit each
// (the world's 128 by 128 chunks in 2 KB), written as base64, the branches, the signs, the homes,
// the rings and the places spotted as their ids, and who found what for them as { place's id:
// name }. One kept from before there were portals has none (`portals` null), till the host works
// out which they'd found (Host join).

import { fromBase64, toBase64 } from "./wire.js";
import { CHUNK, CHUNKS } from "./worldplan/plan.js";

export class Explored {
    /**
     * @param {object} [kept] - As `toJSON` gave it: { entered: [keys], visited: base64, portals: [ids], found: { id: name }, signs: [ids], tracked: [ids], rings: [ids], spotted: [ids] }.
     */
    constructor({ entered = [], visited = "", portals = null, found = {}, signs = [], tracked = [], rings = [], spotted = [] } = {}) {
        this.entered = new Set(entered.filter((key) => typeof key === "string"));
        this.visited = typeof visited === "string" && visited ? fromBase64(visited, (CHUNKS * CHUNKS) / 8) : new Uint8Array((CHUNKS * CHUNKS) / 8);

        /** The guild's branches open to step through to (plan place ids), or null till worked out. */
        this.portals = Array.isArray(portals) ? new Set(portals.filter((id) => typeof id === "string")) : null;

        /** The places another of their party found for them first (plan place ids), by whom (their name). */
        this.found = new Map(found && typeof found === "object" ? Object.entries(found).filter(([, name]) => typeof name === "string") : []);

        /** The trails' signs read (core/tracks.js ids), and the homes tracked (camps' and sites' ids). */
        this.signs = new Set((Array.isArray(signs) ? signs : []).filter((id) => typeof id === "string"));
        this.tracked = new Set((Array.isArray(tracked) ? tracked : []).filter((id) => typeof id === "string"));

        /** The rings of standing stones stood in (their sites' ids: core/rings.js). */
        this.rings = new Set((Array.isArray(rings) ? rings : []).filter((id) => typeof id === "string"));

        /** The places worth finding seen from high ground (plan place ids, and dungeons' sites'). */
        this.spotted = new Set((Array.isArray(spotted) ? spotted : []).filter((id) => typeof id === "string"));

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

    /** A sign on a trail read (core/tracks.js: its id): returns whether it's the first time. */
    read(id) {
        if (typeof id !== "string" || this.signs.has(id)) {
            return false;
        }

        this.signs.add(id);
        this.version++;

        return true;
    }

    /** A camp or lair tracked home (its id), marked on the maps: returns whether it's the first time. */
    track(id) {
        if (typeof id !== "string" || this.tracked.has(id)) {
            return false;
        }

        this.tracked.add(id);
        this.version++;

        return true;
    }

    /** A ring of standing stones stood in (core/rings.js: its site's id): returns whether it's the first time. */
    standIn(id) {
        if (typeof id !== "string" || this.rings.has(id)) {
            return false;
        }

        this.rings.add(id);
        this.version++;

        return true;
    }

    /** A place worth finding (its id) seen from high ground (core/sighting.js): returns whether it's the first time. */
    spot(id) {
        if (typeof id !== "string" || this.spotted.has(id)) {
            return false;
        }

        this.spotted.add(id);
        this.version++;

        return true;
    }

    /**
     * Has the player found a place worth finding (its id; x, y: where it is, metres, the world's):
     * been near it (sighted), or seen it from high ground (spotted). The one rule for it: the maps'
     * icons of places, the rumours of those still to find (core/rumours.js) and the guild's
     * requests to survey them alike.
     */
    knows(id, x, y) {
        return this.spotted.has(id) || this.sighted(x, y);
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
     * Has the player been near somewhere (x, y: metres, the world's): in the chunk it's in, or in
     * one of the eight round it. A place worth finding is found so, or seen from high ground (knows).
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

    /**
     * What another of the player's party has found (`other`: their Explored) found by the player
     * too, for good, as one of them joins the other's party: the chunks they've set foot in, the
     * buildings they've gone into, the places they've seen from high ground and the homes they've
     * tracked. Not the signs read, the rings stood in nor the guild's portals: theirs to have done.
     * Returns what was new to the player: { chunks (how many), entered, spotted, tracked }.
     */
    merge(other) {
        let chunks = 0;

        for (let k = 0; k < this.visited.length; k++) {
            const gained = other.visited[k] & ~this.visited[k];

            for (let bits = gained; bits; bits &= bits - 1) {
                chunks++;
            }

            this.visited[k] |= other.visited[k];
        }

        const gained = (mine, theirs) => [...theirs].filter((id) => !mine.has(id) && mine.add(id));
        const entered = gained(this.entered, other.entered);
        const spotted = gained(this.spotted, other.spotted);
        const tracked = gained(this.tracked, other.tracked);

        if (chunks || entered.length || spotted.length || tracked.length) {
            this.version++;
        }

        return { chunks, entered, spotted, tracked };
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
     * What to keep: { entered: [keys], visited: base64, portals: [ids], found: { id: name }, signs:
     * [ids], tracked: [ids], rings: [ids], spotted: [ids] } (no `portals` till they're worked out,
     * no `found` till another's found something for them, and no signs, homes, rings or places
     * spotted till there are any).
     */
    toJSON() {
        return { entered: [...this.entered], visited: toBase64(this.visited), ...(this.portals ? { portals: [...this.portals] } : {}), ...(this.found.size ? { found: Object.fromEntries(this.found) } : {}), ...(this.signs.size ? { signs: [...this.signs] } : {}), ...(this.tracked.size ? { tracked: [...this.tracked] } : {}), ...(this.rings.size ? { rings: [...this.rings] } : {}), ...(this.spotted.size ? { spotted: [...this.spotted] } : {}) };
    }
}
