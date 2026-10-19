// The access hooks (generated/world_server_plan.md §7.5): every check of who may do what on the
// world server goes through one interface, so that other ways of signing in (passkeys, OpenID
// Connect, an allowlist, a "home only" rule) can plug in later without changing worlds:
//
//   identify(request) -> { principal, proofs }       who is asking: from a key, a ticket, a session
//   allows(principal, action, target) -> { yes, role, why }
//   on(event, detail)                                told of what happened: to log, limit or veto
//   admits(principal, world, character) -> { yes, why, character }   a hero brought in
//
// KeyPolicy is the one built in: keys and return tickets (index.js Access keeps them).
//
// A principal is who's asking, as far as what they've shown proves it:
//
//   { kind: "anyone" }
//   { kind: "admin" }                                    the server's admin key
//   { kind: "creator", creator }                         a creator key: makes worlds
//   { kind: "player", world, player, key, role, via }    in one world: `player` (by their ticket,
//                                                        or null: new), `key` (the world's key
//                                                        they showed, or null), their part, and
//                                                        the key they're in by
//   { kind: "refused", why }                             what they showed proved nothing: why
//
// and each says where it came from: `from` ("mac", "home" or "internet") and its `address`.

import { higherRole, OPEN, VIA_ADMIN, WorldAccess } from "./world.js";

/** What may be done, by name. */
export const ACTIONS = Object.freeze(["server.manage", "world.create", "world.enter", "world.manage", "world.delete", "key.issue", "key.revoke", "player.kick", "player.ban", "broker.announce", "broker.connect"]);

/** Why one may not: as /api/v1 says it (plan §12.1). */
export const REFUSED = Object.freeze({
    "no-world": "There's no world here by that name.",
    key: "That key doesn't open this world.",
    banned: "You've been banned from this world.",
    locked: "This world is locked: nobody may come in for now.",
    offline: "This world's offline for upkeep: nobody may come in till it's brought back online.",
    home: "That can only be done from home: the Mac itself or its Wi-Fi.",
    role: "You may not do that in this world.",
    busy: "Too many newcomers have come into this world lately: try again in an hour or so.",
});

// The actions that are a world's owner's (or the server's admin's), and a trusted player's if the world allows it
const OWNERS = new Set(["world.manage", "world.delete", "key.revoke", "player.kick", "player.ban"]);

export class KeyPolicy {
    /** @param {object} access - What the server keeps of who may come in (index.js Access). */
    constructor(access) {
        this.access = access;

        /** Told of each event (event, detail), after the policy's own doing: the journal, say. */
        this.listeners = [];
    }

    /**
     * Who is asking (`request`: { world, key, ticket, session, address, from }): from a session if
     * they have one that's going, else from the key and ticket they showed. Returns { principal,
     * proofs } (proofs: what they showed that proved something).
     */
    identify({ world = null, key = null, ticket = null, session = null, address = null, from = "internet" } = {}) {
        const where = { address, from };

        if (session) {
            const going = this.access.sessions.use(session);

            // (The admin's and a creator's sessions are for no world in particular: what they may do in one, allows says)
            if (!going || (world && going.world !== null && going.world !== world)) {
                return { principal: { kind: "refused", why: "key", ...where }, proofs: [] };
            }

            if (going.world === null) {
                return { principal: { kind: going.role, ...(going.creator ? { creator: going.creator } : {}), ...where }, proofs: ["session"] };
            }

            const access = this.access.world(going.world);
            const player = access?.player(going.player);

            if (!player || player.role === "banned") {
                return { principal: { kind: "refused", why: "banned", ...where }, proofs: ["session"] };
            }

            return { principal: { kind: "player", world: going.world, player, key: null, role: player.role, via: going.via, ...where }, proofs: ["session"] };
        }

        const { secrets } = this.access;

        // (The admin key proves nothing from the internet: there it's never taken, plan §7.3)
        if (key && secrets.isAdmin(key)) {
            return from === "internet" ? { principal: { kind: "refused", why: "home", ...where }, proofs: [] } : this.#admin(world, ticket, where);
        }

        const creator = key ? secrets.creatorOf(key) : null;

        if (creator) {
            return { principal: { kind: "creator", creator, ...where }, proofs: ["key"] };
        }

        if (!world) {
            return { principal: key ? { kind: "refused", why: "key", ...where } : { kind: "anyone", ...where }, proofs: [] };
        }

        const access = this.access.world(world);

        if (!access) {
            return { principal: { kind: "refused", why: "no-world", ...where }, proofs: [] };
        }

        const now = new Date(this.access.clock());
        const shown = key ? access.keyOf(key) : null;
        const player = ticket ? access.playerByTicket(ticket) : null;
        const proofs = [...(shown ? ["key"] : []), ...(player ? ["ticket"] : [])];

        if (player?.role === "banned" || access.addressBanned(address, now)) {
            return { principal: { kind: "refused", why: "banned", ...where }, proofs };
        }

        const opens = shown && WorldAccess.works(shown, now) && (player || WorldAccess.admits(shown, now));

        // (A key that no longer works, with a ticket: as a ticket alone, the key they last came by
        // perhaps another now: their invite links replaced, Access.replaceInvite)
        if (key && !opens && !player) {
            return { principal: { kind: "refused", why: "key", ...where }, proofs };
        }

        if (opens) {
            return { principal: { kind: "player", world, player, key: shown, role: player ? higherRole(player.role, shown.role) : shown.role, via: shown.id, ...where }, proofs };
        }

        // A ticket alone: while the key they last came by still works (or they're the admin's)
        const via = player && (player.via === VIA_ADMIN ? true : access.key(player.via));

        if (player && (via === true || (via && WorldAccess.works(via, now)))) {
            return { principal: { kind: "player", world, player, key: null, role: player.role, via: player.via, ...where }, proofs };
        }

        // An open world: anyone without a key that works comes in by its door (a key of its own,
        // so that their ticket brings them back as any key's does), as a player; no more
        // newcomers an hour than OPEN says, nor from one address
        const door = this.access.isOpen(world) ? access.door(now) : null;

        if (door && WorldAccess.admits(door, now)) {
            const hour = new Date(now.getTime() - 60 * 60 * 1000);

            if (!player && (access.newcomers(door.id, hour) >= OPEN.perHour || (address !== null && access.newcomers(door.id, hour, address) >= OPEN.perAddress))) {
                return { principal: { kind: "refused", why: "busy", ...where }, proofs };
            }

            return { principal: { kind: "player", world, player, key: door, role: door.role, via: door.id, ...where }, proofs: [...proofs, "open"] };
        }

        return { principal: { kind: "refused", why: "key", ...where }, proofs };
    }

    // The admin's key: the server's, and in a world they come into, its owner
    #admin(world, ticket, where) {
        if (!world) {
            return { principal: { kind: "admin", ...where }, proofs: ["key"] };
        }

        const access = this.access.world(world);

        if (!access) {
            return { principal: { kind: "refused", why: "no-world", ...where }, proofs: ["key"] };
        }

        const player = ticket ? access.playerByTicket(ticket) : null;

        return { principal: { kind: "player", world, player, key: null, role: "owner", via: VIA_ADMIN, admin: true, ...where }, proofs: ["key", ...(player ? ["ticket"] : [])] };
    }

    /**
     * Whether `principal` may do `action` (ACTIONS) to `target` ({ world, meta (its world.json),
     * role (a key's role being issued) }). Returns { yes, role (theirs, if it matters), why (REFUSED, if not) }.
     */
    allows(principal, action, target = {}) {
        const no = (why) => ({ yes: false, role: null, why });

        if (!ACTIONS.includes(action)) {
            return no("role");
        }

        if (principal.kind === "refused") {
            return no(principal.why);
        }

        if (action.startsWith("broker.")) {
            return { yes: true, role: null, why: null };
        }

        if (action === "server.manage") {
            if (principal.kind !== "admin") {
                return no("role");
            }

            return principal.from === "internet" ? no("home") : { yes: true, role: "admin", why: null };
        }

        if (action === "world.create") {
            return principal.kind === "admin" || principal.kind === "creator" ? { yes: true, role: principal.kind, why: null } : no("role");
        }

        if (principal.kind === "admin") {
            return principal.from === "internet" ? no("home") : { yes: true, role: "admin", why: null };
        }

        if (principal.kind !== "player" || principal.world !== target.world) {
            return no(principal.kind === "anyone" ? "key" : "role");
        }

        const { role } = principal;

        // (Offline for upkeep, nobody: its owners neither, whose management needs no entering)
        if (action === "world.enter") {
            return target.meta?.state === "offline" ? no("offline") : target.meta?.state === "locked" && role !== "owner" ? no("locked") : { yes: true, role, why: null };
        }

        if (action === "key.issue") {
            const trusted = role === "trusted" && target.meta?.settings?.trustedMayInvite && (target.role ?? "player") === "player";

            return role === "owner" || trusted ? { yes: true, role, why: null } : no("role");
        }

        return OWNERS.has(action) && role === "owner" ? { yes: true, role, why: null } : no("role");
    }

    /** A hero brought into a world (`character`: as netplay.js characterFrom made it): every one, with this policy. */
    admits(_principal, _world, character) {
        return { yes: Boolean(character), why: character ? null : "character", character };
    }

    /**
     * Told of what's happened (`event`: entered, left, refused, keyIssued, keyRevoked, keyReplaced,
     * codeMade, codeRedeemed, codesBurned, banned, unbanned, kicked), with what it was to: refusals
     * counted against their address (limits.js AddressBlocks); then each listener told.
     */
    on(event, detail = {}) {
        if (event === "refused" && detail.address) {
            this.access.blocks.strike(detail.address);
        }

        for (const listener of this.listeners) {
            listener(event, detail);
        }
    }
}
