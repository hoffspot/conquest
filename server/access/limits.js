// How much the world server takes, and from whom (generated/world_server_plan.md §7.5, §13): so
// that a stranger, a bot or a broken game can't wear it down or guess their way in.
//
// - Connections at once are counted per return ticket first, then per address (set high: homes
//   behind one carrier-grade NAT address share it), then across the server (Counts).
// - Messages are counted per player (Rate): chat and signalling at about 100 a minute, game
//   commands at more.
// - An address with LIMITS.strikes refused entries or bad requests in LIMITS.strikeWindow is
//   blocked for LIMITS.block, longer each time it happens again within a day (AddressBlocks).
// - Wrong short codes are counted across the server, not per address (a CGNAT address is many
//   homes, and one person can have many addresses): each wrong guess makes the next wait longer,
//   from a second doubling to five minutes, and LIMITS.codeBurn of them within an hour burn every
//   short code there is: the owner's page says so, and makes new ones (CodeGuard). 40 bits can't
//   be guessed that slowly; long keys' 130 can't be at all, so they're only held to the rest.
//
// Each is told the time by a clock (ms), so the tests can move it on.

/** The limits (counts; times in ms). */
export const LIMITS = Object.freeze({
    socketsPerTicket: 3,
    socketsPerAddress: 32,
    players: 64,
    strikes: 20,
    strikeWindow: 10 * 60 * 1000,
    block: 15 * 60 * 1000,
    blockMost: 24 * 60 * 60 * 1000,
    chat: 100,
    commands: 1200,
    codeFirst: 1000,
    codeMost: 5 * 60 * 1000,
    codeBurn: 20,
    codeBurnWindow: 60 * 60 * 1000,
    // How many addresses' strikes are remembered at once (the oldest let go past it)
    remembered: 10000,
});

const DAY = 24 * 60 * 60 * 1000;

/** How many of something are open at once, by what they're counted by (an address, a ticket...), up to `most` each. */
export class Counts {
    constructor(most) {
        this.most = most;
        this.counts = new Map();
    }

    /** One more by `key`, if there's room for it. Returns whether there was (and it's counted). */
    take(key) {
        const count = this.counts.get(key) ?? 0;

        if (count >= this.most) {
            return false;
        }

        this.counts.set(key, count + 1);

        return true;
    }

    /** One by `key` closed. */
    give(key) {
        const count = (this.counts.get(key) ?? 0) - 1;

        if (count > 0) {
            this.counts.set(key, count);
        } else {
            this.counts.delete(key);
        }
    }

    /** How many are open by `key`. */
    count(key) {
        return this.counts.get(key) ?? 0;
    }
}

/** At most `perMinute` messages a minute from each who sends them (a bucket of them, filling again as the minute goes). */
export class Rate {
    constructor(perMinute, { clock = Date.now } = {}) {
        this.perMinute = perMinute;
        this.clock = clock;
        this.buckets = new Map();
    }

    /** Whether one more from `key` is let through now (and it's counted). */
    allow(key) {
        const now = this.clock();
        const bucket = this.buckets.get(key) ?? { left: this.perMinute, at: now };

        bucket.left = Math.min(this.perMinute, bucket.left + ((now - bucket.at) * this.perMinute) / 60000);
        bucket.at = now;
        this.buckets.set(key, bucket);

        if (bucket.left < 1) {
            return false;
        }

        bucket.left -= 1;

        return true;
    }

    /** One that's gone, forgotten. */
    forget(key) {
        this.buckets.delete(key);
    }
}

/** Addresses blocked for a while for too many refused entries or bad requests. */
export class AddressBlocks {
    constructor({ clock = Date.now, limits = LIMITS } = {}) {
        this.clock = clock;
        this.limits = limits;

        /** By address: { strikes (when each was), until (blocked till, or 0), times (blocked within a day), last }. */
        this.addresses = new Map();
    }

    // An address's record, the strikes too old to count let go
    #record(address, now) {
        const record = this.addresses.get(address) ?? { strikes: [], until: 0, times: 0, last: 0 };

        record.strikes = record.strikes.filter((at) => at > now - this.limits.strikeWindow);

        if (record.times && now - record.last > DAY) {
            record.times = 0;
        }

        return record;
    }

    /** One refused entry or bad request from `address`. Returns how long it's now blocked for (ms: 0, it isn't). */
    strike(address) {
        const now = this.clock();
        const record = this.#record(address, now);

        record.strikes.push(now);
        this.addresses.delete(address);
        this.addresses.set(address, record);

        if (record.strikes.length >= this.limits.strikes && record.until <= now) {
            record.times++;
            record.last = now;
            record.until = now + Math.min(this.limits.block * 2 ** (record.times - 1), this.limits.blockMost);
            record.strikes = [];
        }

        while (this.addresses.size > this.limits.remembered) {
            this.addresses.delete(this.addresses.keys().next().value);
        }

        return Math.max(0, record.until - now);
    }

    /** How long `address` is still blocked for (ms: 0, it isn't). */
    blockedFor(address) {
        const record = this.addresses.get(address);

        return record ? Math.max(0, record.until - this.clock()) : 0;
    }

    /** The addresses blocked now, as the management page shows them: { address, until (ms), times }. */
    blocked() {
        const now = this.clock();

        return [...this.addresses].filter(([, record]) => record.until > now).map(([address, { until, times }]) => ({ address, until, times }));
    }

    /** A block lifted (by the server's owner). */
    lift(address) {
        this.addresses.delete(address);
    }
}

/** Wrong short codes, counted across the server: each makes the next guess wait, and too many burn them all. */
export class CodeGuard {
    constructor({ clock = Date.now, limits = LIMITS } = {}) {
        this.clock = clock;
        this.limits = limits;

        // Wrong guesses one after another (since the last right one), when the last was, and when each was within the hour
        this.wrong = 0;
        this.lastWrong = 0;
        this.recent = [];
    }

    /** How long until a guess may be made (ms: 0, now). */
    waitFor() {
        if (!this.wrong) {
            return 0;
        }

        const wait = Math.min(this.limits.codeFirst * 2 ** (this.wrong - 1), this.limits.codeMost);

        return Math.max(0, this.lastWrong + wait - this.clock());
    }

    /** A wrong guess. Returns whether every short code is to be burned for it (and the count's begun again). */
    failed() {
        const now = this.clock();

        this.wrong++;
        this.lastWrong = now;
        this.recent = [...this.recent.filter((at) => at > now - this.limits.codeBurnWindow), now];

        if (this.recent.length >= this.limits.codeBurn) {
            this.recent = [];

            return true;
        }

        return false;
    }

    /** A right one: the next needn't wait. */
    succeeded() {
        this.wrong = 0;
    }
}
