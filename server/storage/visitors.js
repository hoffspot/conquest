// What a world whose players bring their own characters (worlds.js CHARACTER_RULES: visiting)
// remembers of each who's visited it: for each player, by their character's own id
// (client/js/core/guid.js), what its folk remember of them and what they've learnt there, what
// they've found of it, where they stand with its peoples and the requests they carry, their
// followers there, and where they were and how when they last left. Who they are and what they
// carry aren't kept here: they're the player's, on their device, brought each time they come
// (docs/SERVER.md, "Visitors"). Kept by player as well as by id, as their ticket says who they
// are, so that what's remembered of a character is only ever theirs: others see a character's id
// as they play beside them. A file each:
//
//   visitors/<player-id>/<character-id>.json    { saveVersion, writtenBy, savedAt, name, memory }
//
// Kept at the browser's save version (app/save.js SAVE_VERSION), and brought forward as kept
// heroes are (heroes.js HERO_STEPS). One kept by a newer server is refused, as everything is
// (versions.js).

import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { SAVE_VERSION } from "../../client/js/app/save.js";
import { isGuid } from "../../client/js/core/guid.js";
import { HERO_STEPS } from "./heroes.js";
import { exists, readJSON, writeJSON } from "./files.js";
import { forward, SERVER_VERSION } from "./versions.js";

/**
 * What a world remembers of a visitor: what's theirs in it, as core/host.js join takes it; and where
 * they'd pinned its map and their markers on it (of what their own game keeps of them, core/host.js
 * OWN, all that's the world's: their wheels, messages and what they've been told once are their
 * device's, as they go from world to world).
 */
export const REMEMBERED = Object.freeze(["talks", "explored", "standing", "followers", "roll", "place", "vitals", "pin", "markers"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// A player's id, as a folder can be named by it (the server's tickets give them: heroes.js)
const PLAYER = /^[A-Za-z0-9_-]{1,64}$/;

export class Visitors {
    /** @param {string} folder - Where they're kept (a world's visitors/). */
    constructor(folder) {
        this.folder = folder;
    }

    // A player's visitor's file, by their character's id (refused for what isn't a player's id or
    // a character's)
    #fileOf(player, guid) {
        if (typeof player !== "string" || !PLAYER.test(player)) {
            throw new Error(`Not a player's id: ${JSON.stringify(player)}`);
        }

        if (!isGuid(guid)) {
            throw new Error(`Not a character's id: ${JSON.stringify(guid)}`);
        }

        return path.join(this.folder, player, `${guid.toLowerCase()}.json`);
    }

    /**
     * What the world remembers of a player's visitor (by their character's id: { talks, explored,
     * standing, followers, place, vitals, pin, markers }, each as it was when they last left), or null if they've
     * never been, or it can't be read.
     */
    async get(player, guid) {
        if (!isGuid(guid) || !(await exists(this.#fileOf(player, guid)))) {
            return null;
        }

        const file = this.#fileOf(player, guid);
        const { saveVersion, writtenBy = null, memory } = await readJSON(file);
        const read = forward(`The visitor kept in ${file}`, memory, { found: saveVersion, current: SAVE_VERSION, steps: HERO_STEPS, writtenBy });

        return isObject(read) ? Object.fromEntries(REMEMBERED.filter((kind) => read[kind] !== undefined && read[kind] !== null).map((kind) => [kind, read[kind]])) : null;
    }

    /**
     * A player's visitor remembered as they leave (their character, as core/host.js leave hands it
     * back, with where and how they were): what's theirs in the world, by their character's own
     * id, and their name, for the world's owner to know them by. What they carry isn't kept.
     * Returns whether they were (not without an id).
     */
    async keep(player, character, { when = new Date() } = {}) {
        const guid = character?.hero?.guid;

        if (!isGuid(guid)) {
            return false;
        }

        const memory = Object.fromEntries(REMEMBERED.filter((kind) => character[kind] !== undefined && character[kind] !== null).map((kind) => [kind, character[kind]]));

        await writeJSON(this.#fileOf(player, guid), { saveVersion: SAVE_VERSION, writtenBy: SERVER_VERSION, savedAt: when.toISOString(), name: typeof character.hero.name === "string" ? character.hero.name : "", memory });

        return true;
    }

    /** A player's visitors the world remembers: [{ guid, name, savedAt }], the latest to leave first. */
    async list(player) {
        const folder = path.join(this.folder, PLAYER.test(player ?? "") ? player : "");

        if (!PLAYER.test(player ?? "") || !(await exists(folder))) {
            return [];
        }

        const found = [];

        for (const name of await readdir(folder)) {
            const guid = name.replace(/\.json$/, "");

            if (name.endsWith(".json") && isGuid(guid)) {
                const { name: who = "", savedAt = null } = await readJSON(path.join(folder, name)).catch(() => ({}));

                found.push({ guid, name: who, savedAt });
            }
        }

        return found.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    }

    /** A player's visitor forgotten (by their character's id). Returns whether the world remembered them. */
    async forget(player, guid) {
        if (!isGuid(guid) || !(await exists(this.#fileOf(player, guid)))) {
            return false;
        }

        await rm(this.#fileOf(player, guid));

        return true;
    }
}
