// Who may come into one world (generated/world_server_plan.md §7.1, §7.2, §7.4), in its folder's
// access.json, written only by the server:
//
//   { accessVersion, writtenBy,
//     keys:    [{ id, hash, sealed, label, role, made, expires, uses, used, revoked, replacedBy }]
//     codes:   [{ id, hash, key, made, expires, uses, used, revoked }]
//     players: { <player id>: { ticket, role, via, made, seen, address, banned } }
//     bans:    [{ address, until, player }] }
//
// A world has up to MOST_KEYS keys that work, each labelled ("Tuesday group"), with a role
// (owner, trusted or player: ROLES), and if its owner likes an expiry and a most players it lets
// in. Each is kept as what proves it (tokens.js), and sealed, so its owner can be shown it again.
// A short code gives one of the world's keys, once (or `uses` times), within CODE_MINUTES.
//
// A player who comes in for the first time is given a return ticket (tokens.js newToken), kept as
// its hash, and an id the world knows them by from then on (their kept heroes are kept by it:
// storage/heroes.js). They come back with their ticket, and the key they came with: or the ticket
// alone, while the key they last came with still works. When a key's revoked, or replaced (a new
// one, the same label and role, as a password's changed), everyone who came with it needs a key
// that works to come back; their ticket still says who they are, so their heroes are theirs.
//
// A ban follows the player's ticket for good, and the address they last came from for a day.

import path from "node:path";
import { exists, readJSON, writeJSON } from "../storage/files.js";
import { forward, SERVER_VERSION } from "../storage/versions.js";
import { labelOf } from "./secrets.js";
import { hashOf, isToken, longKeyOf, newLongKey, newShortCode, newToken, randomCrockford, sameHash, shortCodeOf } from "./tokens.js";

/** The file a world's access is kept in (in its folder). */
export const ACCESS_FILE = "access.json";

/** access.json's version: bump it, with a step in ACCESS_STEPS, when what it holds changes. */
export const ACCESS_VERSION = 1;

/** The steps that bring an older server's access.json forward: [n] takes it from version n to n + 1. */
export const ACCESS_STEPS = Object.freeze({});

/** The parts a player can play in a world, most first. "banned" is no part at all. */
export const ROLES = Object.freeze(["owner", "trusted", "player"]);

/** The most keys that work a world can have at once. */
export const MOST_KEYS = 10;

/** How long a short code lasts (minutes): at the least, at the most, and unless its maker says. */
export const CODE_MINUTES = Object.freeze({ least: 15, most: 60, usual: 30 });

/** The most times a short code can be used. */
export const MOST_CODE_USES = 20;

/** How long a ban follows the address a player last came from (hours). */
export const ADDRESS_BAN_HOURS = 24;

/** How a key a player came in by (`via`) is named when it isn't one of the world's: the server's admin made them its owner. */
export const VIA_ADMIN = "admin";

/** Whether `role` is a part (ROLES). */
export const isRole = (role) => ROLES.includes(role);

/** The more of two parts (ROLES: owner over trusted over player). */
export function higherRole(a, b) {
    return ROLES[Math.min(...[a, b].map((role) => (isRole(role) ? ROLES.indexOf(role) : ROLES.length - 1)))];
}

const iso = (when) => when.toISOString();
const past = (at, now) => at !== null && at !== undefined && Date.parse(at) <= now.getTime();

export class WorldAccess {
    /**
     * @param {string} file - Its access.json.
     * @param {object} data - What's in it.
     * @param {object} secrets - The server's (secrets.js ServerSecrets): keys sealed and codes hashed with them.
     */
    constructor(file, data, secrets) {
        this.file = file;
        this.data = data;
        this.secrets = secrets;
    }

    /** A world's access, from its folder: none yet, if it's never had any. */
    static async open(folder, secrets) {
        const file = path.join(folder, ACCESS_FILE);

        if (!(await exists(file))) {
            return new WorldAccess(file, { keys: [], codes: [], players: {}, bans: [] }, secrets);
        }

        const { accessVersion, writtenBy = null, ...data } = await readJSON(file);
        const access = new WorldAccess(file, forward(`Who may come into the world kept in ${folder}`, data, { found: accessVersion, current: ACCESS_VERSION, steps: ACCESS_STEPS, writtenBy }), secrets);

        if (accessVersion < ACCESS_VERSION) {
            await access.#write();
        }

        return access;
    }

    async #write() {
        await writeJSON(this.file, { accessVersion: ACCESS_VERSION, writtenBy: SERVER_VERSION, ...this.data });
    }

    // ---- Keys

    /** Whether a key still works (to come back with): not revoked or replaced, nor past its expiry. */
    static works(key, now = new Date()) {
        return !key.revoked && !past(key.expires, now);
    }

    /** Whether a key still lets someone new in: it works, and hasn't let in its most. */
    static admits(key, now = new Date()) {
        return WorldAccess.works(key, now) && (key.uses === null || key.used < key.uses);
    }

    /** The keys that work, now. */
    working(now = new Date()) {
        return this.data.keys.filter((key) => WorldAccess.works(key, now));
    }

    /**
     * A new key: its label, its role (ROLES), when it stops working (a Date, or null: never), and
     * how many players it lets in (or null: any number). Returns { key (as it's shown), record },
     * or { reason } if it can't be made (MOST_KEYS already work, or the role isn't one).
     */
    async issueKey({ label = null, role = "player", expires = null, uses = null } = {}, when = new Date()) {
        if (!isRole(role)) {
            return { reason: `There's no part called ${JSON.stringify(role)}.` };
        }

        if (uses !== null && !(Number.isInteger(uses) && uses >= 1)) {
            return { reason: "A key lets in one player at the least." };
        }

        if (expires !== null && !(expires instanceof Date && expires > when)) {
            return { reason: "A key's expiry is to come." };
        }

        if (this.working(when).length >= MOST_KEYS) {
            return { reason: `A world has ${MOST_KEYS} keys that work at the most: revoke one first.` };
        }

        const made = this.#newKey();
        const record = {
            id: made.id,
            hash: hashOf(longKeyOf(made.text).plain),
            sealed: this.secrets.seal(made.text),
            label: labelOf(label) ?? `A ${role}'s key`,
            role,
            made: iso(when),
            expires: expires ? iso(expires) : null,
            uses,
            used: 0,
            revoked: null,
            replacedBy: null,
        };

        this.data.keys.push(record);
        await this.#write();

        return { key: made.text, record: WorldAccess.#shown(record) };
    }

    // A long key whose name none of the world's has
    #newKey() {
        const taken = new Set(this.data.keys.map((key) => key.id));

        for (;;) {
            const key = newLongKey();

            if (!taken.has(key.id)) {
                return key;
            }
        }
    }

    /** The key `text` is (its record), if it's one of the world's: working or not. Null if it isn't one. */
    keyOf(text) {
        const key = longKeyOf(text);
        const record = key && this.data.keys.find((each) => each.id === key.id);

        return record && sameHash(hashOf(key.plain), record.hash) ? record : null;
    }

    /** A key by its id (its record), or null. */
    key(id) {
        return this.data.keys.find((key) => key.id === id) ?? null;
    }

    /** A key that works, as it's given (its owner shown it again), or null. */
    showKey(id, now = new Date()) {
        const key = this.key(id);

        return key && WorldAccess.works(key, now) ? this.secrets.unseal(key.sealed) : null;
    }

    /** One more player let in by a key. */
    async used(id) {
        const key = this.key(id);

        if (key) {
            key.used++;
            await this.#write();
        }
    }

    /** A key no longer working (nor its short codes). Returns its record, or null if it wasn't one that worked. */
    async revokeKey(id, when = new Date()) {
        const key = this.key(id);

        if (!key || key.revoked) {
            return null;
        }

        key.revoked = iso(when);

        for (const code of this.data.codes) {
            if (code.key === id && !code.revoked) {
                code.revoked = iso(when);
            }
        }

        await this.#write();

        return WorldAccess.#shown(key);
    }

    /**
     * A key replaced: a new one with its label, role, expiry and uses (as many left), the old one
     * revoked. Returns { key, record } (the new), or null if it wasn't one that worked.
     */
    async replaceKey(id, when = new Date()) {
        const old = this.key(id);

        if (!old || !WorldAccess.works(old, when)) {
            return null;
        }

        await this.revokeKey(id, when);

        const made = await this.issueKey({ label: old.label, role: old.role, expires: old.expires ? new Date(old.expires) : null, uses: old.uses === null ? null : Math.max(1, old.uses - old.used) }, when);

        old.replacedBy = made.record.id;
        await this.#write();

        return made;
    }

    /** The keys (newest last), as the owner's shown them: nothing that proves them. */
    keys() {
        return this.data.keys.map((key) => WorldAccess.#shown(key));
    }

    static #shown({ id, label, role, made, expires, uses, used, revoked, replacedBy }) {
        return { id, label, role, made, expires, uses, used, revoked, replacedBy };
    }

    // ---- Short codes

    /**
     * A new short code giving the key `key` (by its id; one that works), lasting `minutes`
     * (CODE_MINUTES) and `uses` uses. Returns { code (as it's read out), record, hash }, or
     * { reason }.
     */
    async makeCode({ key, minutes = CODE_MINUTES.usual, uses = 1 } = {}, when = new Date()) {
        const given = this.key(key);

        if (!given || !WorldAccess.works(given, when)) {
            return { reason: "A short code gives a key that works." };
        }

        if (!(Number.isInteger(minutes) && minutes >= CODE_MINUTES.least && minutes <= CODE_MINUTES.most)) {
            return { reason: `A short code lasts ${CODE_MINUTES.least} to ${CODE_MINUTES.most} minutes.` };
        }

        if (!(Number.isInteger(uses) && uses >= 1 && uses <= MOST_CODE_USES)) {
            return { reason: `A short code is used 1 to ${MOST_CODE_USES} times.` };
        }

        const code = newShortCode();
        const hash = await this.secrets.codeHash(shortCodeOf(code));
        const record = { id: randomCrockford(6), hash, key, made: iso(when), expires: iso(new Date(when.getTime() + minutes * 60000)), uses, used: 0, revoked: null };

        this.data.codes = this.data.codes.filter((each) => WorldAccess.codeWorks(each, when));
        this.data.codes.push(record);
        await this.#write();

        return { code, record: WorldAccess.#shownCode(record), hash };
    }

    /** Whether a short code still works: not revoked (nor burned), within its time and uses, and its key still working. */
    static codeWorks(code, now = new Date()) {
        return !code.revoked && !past(code.expires, now) && code.used < code.uses;
    }

    /** The short codes that work, by what proves them (hash) to their id. */
    codeHashes(now = new Date()) {
        return this.data.codes.filter((code) => WorldAccess.codeWorks(code, now)).map((code) => [code.hash, code.id]);
    }

    /** A short code by its id (its record), or null. */
    code(id) {
        return this.data.codes.find((code) => code.id === id) ?? null;
    }

    /** A short code used once more. Returns the key it gives (as it's given), or null if it no longer works (or its key doesn't). */
    async useCode(id, now = new Date()) {
        const code = this.code(id);

        if (!code || !WorldAccess.codeWorks(code, now)) {
            return null;
        }

        const key = this.showKey(code.key, now);

        if (!key) {
            return null;
        }

        code.used++;
        await this.#write();

        return key;
    }

    /** Short codes no longer working (`ids`: all that work, if none's named). Returns how many there were. */
    async revokeCodes(ids = null, when = new Date()) {
        const revoking = this.data.codes.filter((code) => WorldAccess.codeWorks(code, when) && (!ids || ids.includes(code.id)));

        for (const code of revoking) {
            code.revoked = iso(when);
        }

        if (revoking.length) {
            await this.#write();
        }

        return revoking.length;
    }

    /** The short codes that work, as the owner's shown them. */
    codes(now = new Date()) {
        return this.data.codes.filter((code) => WorldAccess.codeWorks(code, now)).map((code) => WorldAccess.#shownCode(code));
    }

    static #shownCode({ id, key, made, expires, uses, used, revoked }) {
        return { id, key, made, expires, uses, used, revoked };
    }

    // ---- Players

    /**
     * Someone new in the world: a part (ROLES), and the key they came with (`via`: its id, or
     * VIA_ADMIN). Returns { id, ticket (as it's given them: the only time it is) }.
     */
    async newPlayer({ role, via, address = null }, when = new Date()) {
        let id;

        do {
            id = randomCrockford(10);
        } while (this.data.players[id]);

        const ticket = newToken();

        this.data.players[id] = { ticket: hashOf(ticket), role, via, made: iso(when), seen: iso(when), address };
        await this.#write();

        return { id, ticket };
    }

    /** The player whose return ticket `ticket` is: { id, ...record }, or null. */
    playerByTicket(ticket) {
        if (!isToken(ticket)) {
            return null;
        }

        const hash = hashOf(ticket);
        const found = Object.entries(this.data.players).find(([, player]) => sameHash(hash, player.ticket));

        return found ? { id: found[0], ...found[1] } : null;
    }

    /** A player by their id: { id, ...record }, or null. */
    player(id) {
        const player = Object.hasOwn(this.data.players, id) ? this.data.players[id] : null;

        return player ? { id, ...player } : null;
    }

    /** A player come in again: when, from where, by which key, and in what part. */
    async seen(id, { address = null, via, role }, when = new Date()) {
        const player = this.data.players[id];

        if (player) {
            Object.assign(player, { seen: iso(when), address, via, role });
            await this.#write();
        }
    }

    /** A player given another part (ROLES), by the world's owner: kept whatever key they came by. Returns whether they're a player of it. */
    async setRole(id, role) {
        const player = this.data.players[id];

        if (!player || !isRole(role)) {
            return false;
        }

        player.role = role;
        await this.#write();

        return true;
    }

    /** A new return ticket for a player who's lost theirs (the old no longer works). Returns it, or null if they aren't one. */
    async reissueTicket(id) {
        const player = this.data.players[id];

        if (!player) {
            return null;
        }

        const ticket = newToken();

        player.ticket = hashOf(ticket);
        await this.#write();

        return ticket;
    }

    /**
     * A player banned: by their ticket for good, and the address they last came from (or
     * `address`) for ADDRESS_BAN_HOURS. Returns whether they're a player of it.
     */
    async ban(id, { address = null } = {}, when = new Date()) {
        const player = this.data.players[id];

        if (!player) {
            return false;
        }

        player.banned = { role: player.banned?.role ?? player.role, at: iso(when) };
        player.role = "banned";

        const from = address ?? player.address;

        if (from) {
            this.data.bans = this.data.bans.filter((ban) => !past(ban.until, when) && ban.address !== from);
            this.data.bans.push({ address: from, until: iso(new Date(when.getTime() + ADDRESS_BAN_HOURS * 3600000)), player: id });
        }

        await this.#write();

        return true;
    }

    /** A ban lifted (ticket and address): back to the part they had. Returns whether they were banned. */
    async unban(id) {
        const player = this.data.players[id];

        if (!player?.banned) {
            return false;
        }

        player.role = player.banned.role;
        delete player.banned;
        this.data.bans = this.data.bans.filter((ban) => ban.player !== id);
        await this.#write();

        return true;
    }

    /** Whether `address` is banned from the world, now. */
    addressBanned(address, now = new Date()) {
        return this.data.bans.some((ban) => ban.address === address && !past(ban.until, now));
    }

    /** The players, as the owner's shown them (nothing that proves them). */
    players() {
        return Object.entries(this.data.players).map(([id, { role, via, made, seen, banned = null }]) => ({ id, role, via, made, seen, banned: Boolean(banned) }));
    }
}
