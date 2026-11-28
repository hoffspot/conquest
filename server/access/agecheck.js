// Age checks (generated/multiplayer_scaling_plan.md 6B-22): the one way out of Nanny Mode for a
// player a country's rules put in it (access/nanny.js). The server asks an outside provider
// whether the player is over an age, and keeps only the answer.
//
// How it goes, the same for any provider:
//
//   1. The player asks to begin (`begin`). The server starts a session with the provider, for the
//      age their Nanny Mode needs, and hands the player the provider's own page to go to.
//   2. The player does what the provider asks, on the provider's page. The game sees none of it:
//      no photo, no document, no birth date.
//   3. The player's game asks how it went (`status`), and the server asks the provider. Nothing
//      the player's game says is taken for a result: the server asks the provider itself, by the
//      session it started, and the answer must carry the reference the server gave that session.
//      (A home Mac has no way for a provider to call it; so it asks.)
//
// Kept of a pass, on the server's record of the player (storage/players.js `agecheck`), four
// things: that they passed, the age it was for, the date, and the provider's name. Kept of
// anything else: how many times they've tried lately, so an adult a face estimate misread can try
// another way, three times in thirty days (AGECHECK).
//
// A provider is an adapter (below). None ships: the real one is the plan's 6B-24, deferred by the
// owner. With none, `begin` is refused ("no-provider") and the chat panel says age checks aren't
// set up on this server. The fake one here is for the tests, and is never chosen by a setting: a
// server's owner can't turn on a provider that passes everyone.

import { randomBytes } from "node:crypto";

const DAY = 86400000;

/**
 * How many times a player may begin a check in so many days; how long a session they've begun is
 * good for (minutes); the ages a check can be for.
 */
export const AGECHECK = Object.freeze({ attempts: 3, days: 30, sessionMinutes: 30, least: 13, most: 21 });

/** What a pass keeps, and nothing else. */
export const AGECHECK_FIELDS = Object.freeze(["passed", "threshold", "date", "provider"]);

/**
 * What a provider's adapter is: its `name` (letters, digits and hyphens: kept with a pass, and
 * the name its key goes by in the token store), and two calls.
 *
 * - `begin({ threshold, reference })`: a session started for "is this person over `threshold`?".
 *   `reference` is the server's own word for the session, which the provider gives back with its
 *   answer. Returns `{ id, url }`: the provider's id for the session, and the page the player
 *   goes to (https).
 * - `status(id)`: how that session stands: `{ state: "pending" | "passed" | "failed", reference,
 *   over }`. `over` is the age a pass was for.
 *
 * Returns why something isn't one (a sentence), or null.
 */
export function adapterFault(provider) {
    if (!provider || typeof provider !== "object") {
        return "An age-check provider is an object with a name, begin and status.";
    }

    if (typeof provider.name !== "string" || !/^[a-z0-9-]{2,32}$/.test(provider.name)) {
        return "An age-check provider's name is 2 to 32 lowercase letters, digits and hyphens.";
    }

    return typeof provider.begin === "function" && typeof provider.status === "function" ? null : `The age-check provider ${provider.name} needs begin and status.`;
}

/** The name a provider's key is kept under in the server's token store (storage/tokens.js, or the system's keychain). */
export const keyNameOf = (provider) => `agecheck:${provider}`;

/** A provider's key from the token store (`tokens`: get(name)), or null with none kept: never in the settings, never logged. */
export async function providerKey(tokens, provider) {
    return (await tokens?.get(keyNameOf(provider))) ?? null;
}

/**
 * A provider for the tests: every session pending till the test says how it went (`answer(id,
 * { state, over })`), each answer carrying the session's own reference unless told otherwise
 * (`reference`, to forge one). `begun` lists what was asked of it.
 */
export function fakeProvider({ name = "fake" } = {}) {
    const sessions = new Map();
    let next = 1;

    return {
        name,
        begun: [],
        async begin({ threshold, reference }) {
            const id = `${name}-${next++}`;

            sessions.set(id, { state: "pending", reference, over: threshold });
            this.begun.push({ id, threshold, reference });

            return { id, url: `https://agecheck.invalid/${id}` };
        },
        async status(id) {
            const session = sessions.get(id);

            return session ? { ...session } : { state: "failed", reference: null, over: 0 };
        },
        answer(id, how) {
            Object.assign(sessions.get(id), how);
        },
    };
}

/** Refused: `error` says why in a word (AGE_REFUSED), `message` in a sentence. */
export class AgeRefusal extends Error {
    constructor(error, extra = {}) {
        super(AGE_REFUSED[error]);
        this.name = "AgeRefusal";
        this.error = error;
        Object.assign(this, extra);
    }
}

/** Why a check can't begin, or be asked after. */
export const AGE_REFUSED = Object.freeze({
    "no-provider": "Age checks aren't set up on this server yet, so Nanny Mode can't be turned off here for now.",
    "no-identity": "An age check is kept with your player identity, and the game didn't show it coming in: reload the game and come into the world again.",
    "age-passed": "You've passed an age check here already.",
    "age-tries": "You've tried the age check as often as it's allowed for now. You can try again later.",
    "age-session": "There's no age check of yours under way: start one first.",
    "age-provider": "The age checker couldn't be reached just now. Try again in a little while.",
});

/**
 * The server's age checks. `players` is its record of players (storage/players.js), `provider`
 * an adapter or null, `onPassed(id)` told as someone passes (Nanny Mode lifted for them at once,
 * wherever they are: play.js renanny), `clock` the time (ms).
 */
export class AgeChecks {
    constructor({ players, provider = null, clock = Date.now, onPassed = () => {} } = {}) {
        const fault = provider === null ? null : adapterFault(provider);

        if (fault) {
            throw new TypeError(fault);
        }

        Object.assign(this, { players, provider, clock, onPassed });
        /** The checks under way, by player id: { id (the provider's), reference, threshold, until }. In memory: a restart ends them, and the try stays counted. */
        this.sessions = new Map();
    }

    /** Whether age checks are offered here, and by whom: { offered, provider }. */
    offered() {
        return { offered: this.provider !== null, provider: this.provider?.name ?? null };
    }

    // How many tries a player has left in the days that count, and their record
    #tries(id) {
        const record = this.players.get(id);
        const fresh = record?.attempts && this.clock() - record.attempts.since < AGECHECK.days * DAY ? record.attempts.count : 0;

        return { record, left: Math.max(0, AGECHECK.attempts - fresh) };
    }

    /**
     * A check begun for a player (their id) to show they're over `threshold`: a try counted, a
     * session started with the provider. Returns { url, provider, threshold, left (tries after
     * this one), until (when the session runs out: ms) }. Throws an AgeRefusal.
     */
    async begin(id, threshold) {
        if (!this.provider) {
            throw new AgeRefusal("no-provider");
        }

        const age = Number.isInteger(threshold) ? Math.min(AGECHECK.most, Math.max(AGECHECK.least, threshold)) : AGECHECK.most;
        const { record, left } = this.#tries(id);

        if (!record) {
            throw new AgeRefusal("no-identity");
        }

        if (record.agecheck?.passed === true && record.agecheck.threshold >= age) {
            throw new AgeRefusal("age-passed");
        }

        if (left <= 0) {
            throw new AgeRefusal("age-tries", { left: 0 });
        }

        const reference = randomBytes(18).toString("base64url");
        let begun;

        try {
            begun = await this.provider.begin({ threshold: age, reference });
        } catch {
            throw new AgeRefusal("age-provider");
        }

        // (Only a page of the provider's own, over TLS: nothing else is handed to a player to open)
        if (typeof begun?.id !== "string" || typeof begun.url !== "string" || !/^https:\/\//.test(begun.url)) {
            throw new AgeRefusal("age-provider");
        }

        const now = this.clock();

        this.players.tried(id, now, AGECHECK.days * DAY);
        this.sessions.set(id, { id: begun.id, reference, threshold: age, until: now + AGECHECK.sessionMinutes * 60000 });

        return { url: begun.url, provider: this.provider.name, threshold: age, left: left - 1, until: now + AGECHECK.sessionMinutes * 60000 };
    }

    /**
     * How a player's check stands, asked of the provider: { state: "pending" } while they're at
     * it; { state: "passed", threshold } once (kept on their record, their hold let go of,
     * onPassed told; the session over); { state: "failed", left } for anything else, the session
     * over: a fail, an age under the one asked, an answer that isn't this session's, or a session
     * run out. Throws an AgeRefusal with no session, or with the provider out of reach (the
     * session kept, to ask again).
     */
    async status(id) {
        const session = this.sessions.get(id);

        if (!session) {
            throw new AgeRefusal(this.provider ? "age-session" : "no-provider");
        }

        const failed = () => {
            this.sessions.delete(id);

            return { state: "failed", left: this.#tries(id).left };
        };

        if (this.clock() >= session.until) {
            return failed();
        }

        let answer;

        try {
            answer = await this.provider.status(session.id);
        } catch {
            throw new AgeRefusal("age-provider");
        }

        if (answer?.state === "pending") {
            return { state: "pending" };
        }

        // (A pass is this session's alone, and for the age that was asked or over)
        if (answer?.state !== "passed" || answer.reference !== session.reference || !Number.isFinite(answer.over) || answer.over < session.threshold) {
            return failed();
        }

        this.sessions.delete(id);
        this.players.passed(id, { threshold: session.threshold, date: new Date(this.clock()).toISOString().slice(0, 10), provider: this.provider.name });
        this.onPassed(id);

        return { state: "passed", threshold: session.threshold };
    }

    /**
     * A player's pass taken back, to be checked again (a moderator's: their key can be carried to
     * another device, and so to another person). Their tries begin afresh. Returns whether there
     * was a pass.
     */
    again(id) {
        this.sessions.delete(id);

        const had = this.players.unpassed(id);

        if (had) {
            this.onPassed(id);
        }

        return had;
    }
}
