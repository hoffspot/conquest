// A game's session with the server (generated/world_server_plan.md §7.1): given when it enters a
// world, so it can come back on a new connection (a phone moving from Wi-Fi to its mobile
// network) without asking again. 128 random bits, kept only in memory and only as their hash:
// a server that restarts asks everyone again, with their key and ticket.
//
// A session ends when it's been idle too long (SESSION.idle), when it's been going too long
// whatever it does (SESSION.most), or when the key it came in by is revoked or replaced (as
// changing a password does in Satisfactory), or its player's banned.

import { hashOf, isToken, newToken } from "./tokens.js";

/** How long a session lasts (ms): with nothing done in it, and at the most. */
export const SESSION = Object.freeze({ idle: 60 * 60 * 1000, most: 24 * 60 * 60 * 1000 });

export class Sessions {
    constructor({ clock = Date.now } = {}) {
        this.clock = clock;

        /** By the session's hash: { world, player, role, via, made, used }. */
        this.sessions = new Map();
    }

    /** A new session for what's given ({ world, player, role, via }). Returns it (the token: the only time it's seen). */
    start(what) {
        const token = newToken();
        const now = this.clock();

        this.sessions.set(hashOf(token), { ...what, made: now, used: now });

        return token;
    }

    /** The session `token` is, if it's going (and it's used now: not idle); else null. */
    use(token) {
        if (!isToken(token)) {
            return null;
        }

        const hash = hashOf(token);
        const session = this.sessions.get(hash);
        const now = this.clock();

        if (!session) {
            return null;
        }

        if (now - session.used > SESSION.idle || now - session.made > SESSION.most) {
            this.sessions.delete(hash);

            return null;
        }

        session.used = now;

        return { ...session };
    }

    /** The sessions passing `test` ended. Returns those that were ({ world, player, role, via }), to close their connections. */
    end(test) {
        const ended = [];

        for (const [hash, session] of this.sessions) {
            if (test(session)) {
                this.sessions.delete(hash);
                ended.push(session);
            }
        }

        return ended;
    }

    /** Sessions gone idle, or on too long, let go. */
    sweep() {
        const now = this.clock();

        this.end((session) => now - session.used > SESSION.idle || now - session.made > SESSION.most);
    }

    get size() {
        return this.sessions.size;
    }
}
