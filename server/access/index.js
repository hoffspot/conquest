// Who may come into the world server's worlds, and what they may do there (generated/
// world_server_plan.md §7): everything the server keeps of it, and the doing of it, in one place.
//
// - The server's own secrets: its admin key, creator keys, what world keys are sealed with
//   (secrets.js).
// - Each world's keys, short codes and players (world.js).
// - Sessions, in memory (sessions.js).
// - The limits: addresses blocked a while, wrong short codes held back and, past too many, every
//   code burned (limits.js).
// - The policy every check goes through (policy.js KeyPolicy).
//
// The server asks the policy who someone is and whether they may (identify, allows); then has
// this do it (enter, redeem, issueKey...), and the policy told what was done (on), for the
// journal. Whatever ends a session (a key revoked or replaced, a player banned) returns the
// sessions it ended, so their connections can be closed, saying why.

import { AddressBlocks, CodeGuard } from "./limits.js";
import { KeyPolicy } from "./policy.js";
import { ServerSecrets } from "./secrets.js";
import { Sessions } from "./sessions.js";
import { shortCodeOf } from "./tokens.js";
import { WorldAccess } from "./world.js";

// What's hashed for a short code that couldn't be one, so a wrong guess takes as long whatever's wrong with it
const NOT_A_CODE = "00000000";

export class Access {
    /**
     * @param {object} secrets - The server's (secrets.js ServerSecrets).
     * @param {object} [options]
     * @param {function} [options.clock] - The time (ms).
     */
    constructor(secrets, { clock = Date.now } = {}) {
        this.secrets = secrets;
        this.clock = clock;
        this.sessions = new Sessions({ clock });
        this.blocks = new AddressBlocks({ clock });
        this.guard = new CodeGuard({ clock });
        this.policy = new KeyPolicy(this);

        // Each world's access (by its id), and the short codes that work across them all (by what proves each: { world, id })
        this.worlds = new Map();
        this.codes = new Map();
    }

    /**
     * What the server keeps of who may come in, from its data folder (`root`): its secrets made
     * the first time (with a new admin key). Returns { access, adminKey } (adminKey: the new
     * key, the first time alone).
     */
    static async open(root, { clock = Date.now, cost } = {}) {
        const { secrets, adminKey } = await ServerSecrets.open(root, { when: new Date(clock()), ...(cost ? { cost } : {}) });

        return { access: new Access(secrets, { clock }), adminKey };
    }

    #now() {
        return new Date(this.clock());
    }

    /** A world's access opened (from its folder), and its short codes known. */
    async addWorld(id, folder) {
        const access = await WorldAccess.open(folder, this.secrets);

        this.worlds.set(id, access);

        for (const [hash, code] of access.codeHashes(this.#now())) {
            this.codes.set(hash, { world: id, id: code });
        }

        return access;
    }

    /** A world gone (deleted): its access, short codes and sessions with it. Returns the sessions ended. */
    removeWorld(id) {
        this.worlds.delete(id);

        for (const [hash, code] of this.codes) {
            if (code.world === id) {
                this.codes.delete(hash);
            }
        }

        return this.sessions.end((session) => session.world === id);
    }

    /** A world's access (world.js WorldAccess), or null if there's no world by that id. */
    world(id) {
        return this.worlds.get(id) ?? null;
    }

    /**
     * Someone the policy's let into a world (`principal`: a player's, KeyPolicy.identify's): a
     * new player given a ticket (and counted against the key they came by), one coming back
     * seen again; and a session started. Returns { session, ticket (new players alone; else
     * null), player (their id in the world), role }.
     */
    async enter(principal) {
        const access = this.world(principal.world);
        const when = this.#now();
        const { role, via, address } = principal;
        let id = principal.player?.id ?? null;
        let ticket = null;

        if (id) {
            await access.seen(id, { address, via, role }, when);
        } else {
            ({ id, ticket } = await access.newPlayer({ role, via, address }, when));

            if (principal.key) {
                await access.used(principal.key.id);
            }
        }

        const session = this.sessions.start({ world: principal.world, player: id, role, via });

        this.policy.on("entered", { world: principal.world, player: id, role, via, label: principal.key?.label ?? access.key(via)?.label ?? via, address, new: Boolean(ticket) });

        return { session, ticket, player: id, role };
    }

    /** A session for the server's admin, or a creator (`principal`), to use /api/v1 with. Returns it. */
    sessionFor(principal) {
        return this.sessions.start({ world: null, player: null, role: principal.kind, via: null, ...(principal.creator ? { creator: principal.creator } : {}) });
    }

    /**
     * A short code traded for the world and key it gives (once a use: plan §7.1). Returns { ok:
     * true, world, key }, or { ok: false, reason: "wait", wait (ms) } if guesses are being held
     * back, or { ok: false, reason: "code" } whatever else is wrong with it (none such, used up,
     * gone past its time, revoked or burned), after as long as any guess takes.
     */
    async redeem(code, { address = null } = {}) {
        const wait = this.guard.waitFor();

        if (wait > 0) {
            return { ok: false, reason: "wait", wait };
        }

        const plain = shortCodeOf(code);
        const hash = await this.secrets.codeHash(plain ?? NOT_A_CODE);
        const found = plain ? this.codes.get(hash) : null;
        const key = found ? await this.world(found.world)?.useCode(found.id, this.#now()) : null;

        if (!key) {
            if (found) {
                this.codes.delete(hash);
            }

            await this.#wrongCode(address);

            return { ok: false, reason: "code" };
        }

        this.guard.succeeded();
        this.policy.on("codeRedeemed", { world: found.world, code: found.id, address });

        return { ok: true, world: found.world, key };
    }

    // A wrong short code: held against everyone's next guess; past too many, every code burned
    async #wrongCode(address) {
        this.policy.on("refused", { why: "code", address });

        if (!this.guard.failed()) {
            return;
        }

        for (const [id, access] of this.worlds) {
            const burned = await access.revokeCodes(null, this.#now());

            if (burned) {
                this.policy.on("codesBurned", { world: id, count: burned });
            }
        }

        this.codes.clear();
    }

    /** A new key for a world (world.js issueKey's options), by `by` (who). Returns issueKey's. */
    async issueKey(world, options, { by = null } = {}) {
        const made = await this.world(world).issueKey(options, this.#now());

        if (made.record) {
            this.policy.on("keyIssued", { world, key: made.record.id, label: made.record.label, role: made.record.role, by });
        }

        return made;
    }

    /** A world's key revoked. Returns { revoked (its record, or null), ended (the sessions in by it) }. */
    async revokeKey(world, id, { by = null } = {}) {
        const access = this.world(world);
        const revoked = await access.revokeKey(id, this.#now());

        if (!revoked) {
            return { revoked: null, ended: [] };
        }

        this.#forgetCodes(world, access);
        this.policy.on("keyRevoked", { world, key: id, label: revoked.label, by });

        return { revoked, ended: this.sessions.end((session) => session.world === world && session.via === id) };
    }

    /** A world's key replaced. Returns { key, record (the new one; or null), ended (the sessions in by the old) }. */
    async replaceKey(world, id, { by = null } = {}) {
        const access = this.world(world);
        const made = await access.replaceKey(id, this.#now());

        if (!made) {
            return { key: null, record: null, ended: [] };
        }

        this.#forgetCodes(world, access);
        this.policy.on("keyReplaced", { world, key: id, by, label: made.record.label, replacedBy: made.record.id });

        return { ...made, ended: this.sessions.end((session) => session.world === world && session.via === id) };
    }

    // The short codes of a world that no longer work, forgotten
    #forgetCodes(world, access) {
        const working = new Set(access.codeHashes(this.#now()).map(([hash]) => hash));

        for (const [hash, code] of this.codes) {
            if (code.world === world && !working.has(hash)) {
                this.codes.delete(hash);
            }
        }
    }

    /** A short code giving one of a world's keys (world.js makeCode's options). Returns { code, record }, or { reason }. */
    async makeCode(world, options, { by = null } = {}) {
        const made = await this.world(world).makeCode(options, this.#now());

        if (made.reason) {
            return made;
        }

        this.codes.set(made.hash, { world, id: made.record.id });
        this.policy.on("codeMade", { world, code: made.record.id, key: made.record.key, by });

        return { code: made.code, record: made.record };
    }

    /** A world's short codes revoked (`ids`, or all). Returns how many. */
    async revokeCodes(world, ids = null) {
        const access = this.world(world);
        const count = await access.revokeCodes(ids, this.#now());

        this.#forgetCodes(world, access);

        return count;
    }

    /** A player banned from a world (ticket for good, address for a day). Returns { banned, ended (their sessions) }. */
    async ban(world, player, { address = null, by = null } = {}) {
        const banned = await this.world(world).ban(player, { address }, this.#now());

        if (!banned) {
            return { banned, ended: [] };
        }

        this.policy.on("banned", { world, player, by });

        return { banned, ended: this.sessions.end((session) => session.world === world && session.player === player) };
    }

    /** A ban lifted. Returns whether there was one. */
    async unban(world, player, { by = null } = {}) {
        const lifted = await this.world(world).unban(player);

        if (lifted) {
            this.policy.on("unbanned", { world, player, by });
        }

        return lifted;
    }
}
