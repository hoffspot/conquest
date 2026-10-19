// The heroes a world keeps for its players (generated/world_server_plan.md §6), in a world kept
// by the server whose heroes stay in it: up to MOST_HEROES for each player, as the game keeps on a
// device (app/save.js MOST_CHARACTERS). Each is a character as the world hands it back when its
// player leaves (core/host.js leave: { hero, talks, explored, progress, standing, followers }, and
// where and how they were), kept in a file of its own:
//
//   heroes/<player-id>/<slot>.json    { saveVersion, writtenBy, savedAt, character }
//
// Kept at the browser's save version (app/save.js SAVE_VERSION), and read through the same code
// the browser reads its own with when it's brought into the world (core/host.js join). One kept by
// a newer server is refused, as everything is (versions.js).

import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { SAVE_VERSION } from "../../client/js/app/save.js";
import { isGuid, withGuid } from "../../client/js/core/guid.js";
import { exists, readJSON, writeJSON } from "./files.js";
import { forward, SERVER_VERSION } from "./versions.js";

/** The most heroes a player has in a world (as on a device). */
export const MOST_HEROES = 6;

/** The steps that bring an older server's kept hero forward: [n] takes it from save version n to n + 1. */
export const HERO_STEPS = Object.freeze({});

// A player's id, as a folder can be named by it (the server's tickets give them)
const PLAYER = /^[A-Za-z0-9_-]{1,64}$/;

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export class KeptHeroes {
    /** @param {string} folder - Where they're kept (a world's heroes/). */
    constructor(folder) {
        this.folder = folder;
    }

    // A player's folder (refused for an id that couldn't be one), and a slot's file in it
    #playerFolder(player) {
        if (typeof player !== "string" || !PLAYER.test(player)) {
            throw new Error(`Not a player's id: ${JSON.stringify(player)}`);
        }

        return path.join(this.folder, player);
    }

    #fileOf(player, slot) {
        if (!Number.isInteger(slot) || slot < 1 || slot > MOST_HEROES) {
            throw new Error(`Not a hero's slot: ${JSON.stringify(slot)} (1 to ${MOST_HEROES})`);
        }

        return path.join(this.#playerFolder(player), `${slot}.json`);
    }

    /** The slots a player's heroes are in (1 to MOST_HEROES), in order. */
    async slotsOf(player) {
        const folder = this.#playerFolder(player);

        if (!(await exists(folder))) {
            return [];
        }

        return (await readdir(folder))
            .map((name) => /^([1-9]\d*)\.json$/.exec(name)?.[1])
            .filter(Boolean)
            .map(Number)
            .filter((slot) => slot <= MOST_HEROES)
            .sort((a, b) => a - b);
    }

    /**
     * A player's heroes, as they're listed for them to choose from: [{ slot, name, race, savedAt,
     * origin (the id of the character it's a copy of: client/js/core/guid.js; or null, one made
     * here) }].
     */
    async list(player) {
        const heroes = [];

        for (const slot of await this.slotsOf(player)) {
            const { character, savedAt } = await this.#read(player, slot);

            heroes.push({ slot, name: character.hero?.name ?? "", race: character.hero?.race ?? "human", savedAt, origin: isGuid(character.hero?.origin) ? character.hero.origin : null });
        }

        return heroes;
    }

    /**
     * The characters copied into the world (a world that takes copies: server/storage/worlds.js
     * CHARACTER_RULES), by whoever: the ids of those its kept heroes are copies of.
     */
    async origins() {
        const found = new Set();

        if (!(await exists(this.folder))) {
            return found;
        }

        for (const player of await readdir(this.folder)) {
            if (!PLAYER.test(player)) {
                continue;
            }

            for (const slot of await this.slotsOf(player)) {
                const origin = (await this.#read(player, slot)).character.hero?.origin;

                if (isGuid(origin)) {
                    found.add(origin);
                }
            }
        }

        return found;
    }

    /**
     * A player's hero in `slot` (the character, as kept), or null if there's none. One kept before
     * characters had ids of their own (client/js/core/guid.js) is given one, and kept with it.
     */
    async get(player, slot) {
        if (!(await exists(this.#fileOf(player, slot)))) {
            return null;
        }

        const { character, savedAt } = await this.#read(player, slot);

        if (!isGuid(character.hero?.guid)) {
            await this.keep(player, character, { slot, when: savedAt ? new Date(savedAt) : new Date() });

            return (await this.#read(player, slot)).character;
        }

        return character;
    }

    /**
     * A player's hero kept: in `slot` (replacing whoever was there), or the first free one; with its
     * own id (client/js/core/guid.js), given one if it hasn't. Returns { ok: true, slot }, or {
     * ok: false, reason: "full" } if they have MOST_HEROES already.
     */
    async keep(player, given, { slot = null, when = new Date() } = {}) {
        if (!isObject(given) || !isObject(given.hero)) {
            throw new Error("Not a character: it has no hero.");
        }

        const character = { ...given, hero: withGuid(given.hero) };

        const taken = await this.slotsOf(player);
        const into = slot ?? Array.from({ length: MOST_HEROES }, (_, k) => k + 1).find((each) => !taken.includes(each)) ?? null;

        if (into === null) {
            return { ok: false, reason: "full" };
        }

        await writeJSON(this.#fileOf(player, into), { saveVersion: SAVE_VERSION, writtenBy: SERVER_VERSION, savedAt: when.toISOString(), character });

        return { ok: true, slot: into };
    }

    /** A player's hero in `slot` forgotten. Returns whether there was one. */
    async forget(player, slot) {
        const file = this.#fileOf(player, slot);

        if (!(await exists(file))) {
            return false;
        }

        await rm(file);

        return true;
    }

    // A kept hero as it's stored: brought forward if an older server kept it, refused if a newer one did
    async #read(player, slot) {
        const file = this.#fileOf(player, slot);
        const { saveVersion, writtenBy = null, savedAt = null, character } = await readJSON(file);

        return { savedAt, character: forward(`The hero kept in ${file}`, character, { found: saveVersion, current: SAVE_VERSION, steps: HERO_STEPS, writtenBy }) };
    }
}
