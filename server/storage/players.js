// The server's players (generated/multiplayer_scaling_plan.md 6B-1): one record for each player
// who's come into any world here by their own identity (client/js/core/player.js: a key they
// hold, and the id worked out from it), whichever worlds they play in. A world's own players
// (access/world.js) say who may come into it; this says who someone is across all of them, for
// what's decided server-wide later: a ban that holds to a person (6B-10), a mute (6B-5), Nanny
// Mode's hold (6B-21), a passed age check (6B-22).
//
// A record holds: their public key and the name they last went by, when they were first and last
// seen, on how many days and for how many minutes they've played, an age band (null till they're
// asked: 6B-4), their standing and flags (empty till something sets them). It holds no email, no
// birth date and no address.
//
// Written as someone comes in and as they leave; read by nothing yet. One file in the data
// folder, players.json, till the server has a database (6D-2).

import path from "node:path";

import { isPlayerId } from "../../client/js/core/player.js";
import { exists, readJSON, writeJSON } from "./files.js";
import { forward, SERVER_VERSION } from "./versions.js";

/** The file the players are kept in (in the data folder). */
export const PLAYERS_FILE = "players.json";

/** players.json's version: bump it, with a step in PLAYERS_STEPS, when what it holds changes. */
export const PLAYERS_VERSION = 1;

/** The steps that bring an older server's players.json forward: [n] takes it from version n to n + 1. */
export const PLAYERS_STEPS = Object.freeze({});

/** What a record holds, in the order it's written (its id is its key in the file). */
export const PLAYER_FIELDS = Object.freeze(["key", "name", "firstSeen", "lastSeen", "days", "minutes", "ageBand", "standing", "flags"]);

const dayOf = (iso) => iso.slice(0, 10);

export class PlayerStore {
    constructor(file, players, { clock = Date.now } = {}) {
        Object.assign(this, { file, players, clock });
        /** Its writes, one after another: what the last of them came to. */
        this.writing = Promise.resolve();
        /** Why the last write failed, or null. */
        this.error = null;
    }

    /**
     * The players kept in a data folder (`root`): none yet, with no file; an older server's
     * brought forward a step at a time (PLAYERS_STEPS) and written again; a newer server's
     * refused (storage/versions.js).
     */
    static async open(root, { clock = Date.now, steps = PLAYERS_STEPS, version = PLAYERS_VERSION } = {}) {
        const file = path.join(root, PLAYERS_FILE);

        if (!(await exists(file))) {
            return new PlayerStore(file, {}, { clock });
        }

        const { playersVersion, writtenBy = null, players = {} } = await readJSON(file);
        const store = new PlayerStore(file, forward("The server's players", players, { found: playersVersion, current: version, steps, writtenBy }), { clock });

        if (playersVersion < version) {
            await store.#write(version);
        }

        return store;
    }

    #write(version = PLAYERS_VERSION) {
        this.writing = this.writing
            .then(() => writeJSON(this.file, { playersVersion: version, writtenBy: SERVER_VERSION, players: this.players }))
            .then(
                () => {
                    this.error = null;
                },
                (error) => {
                    this.error = error.message;
                },
            );

        return this.writing;
    }

    /** How many players it knows. */
    get size() {
        return Object.keys(this.players).length;
    }

    /** A player's record ({ id, ...PLAYER_FIELDS }), a copy; null for one it doesn't know. */
    get(id) {
        return Object.hasOwn(this.players, id) ? { id, ...structuredClone(this.players[id]) } : null;
    }

    /**
     * Someone come into a world by their own identity ({ id, key, name }: proved already,
     * client/js/core/player.js playerOfProof): known from now if they weren't, and seen now, by
     * the name they give; a day more if it's a day they hadn't played on (UTC). Returns their
     * record, or null for what isn't an identity.
     */
    async seen({ id, key, name } = {}, when = new Date(this.clock())) {
        if (!isPlayerId(id) || typeof key !== "string" || typeof name !== "string") {
            return null;
        }

        const now = when.toISOString();
        const known = Object.hasOwn(this.players, id) ? this.players[id] : null;

        if (known) {
            Object.assign(known, { key, name, days: known.days + (dayOf(known.lastSeen) === dayOf(now) ? 0 : 1), lastSeen: now });
        } else {
            this.players[id] = { key, name, firstSeen: now, lastSeen: now, days: 1, minutes: 0, ageBand: null, standing: {}, flags: {} };
        }

        await this.#write();

        return this.get(id);
    }

    /** So many minutes more played by a player it knows (as they leave a world), to a tenth of one. Written in its turn: `writing` says when. */
    played(id, minutes) {
        if (!Object.hasOwn(this.players, id) || !Number.isFinite(minutes) || minutes <= 0) {
            return;
        }

        this.players[id].minutes = Math.round((this.players[id].minutes + minutes) * 10) / 10;
        this.#write();
    }

    /** Everything written that's to be: awaited as the server stops. */
    flush() {
        return this.writing;
    }
}
