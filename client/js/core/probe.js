// What a world's step costs, pass by pass (generated/multiplayer_scaling_plan.md 0-1): named
// timers for each part of the host's step (core/host.js advance) and of what's sent after it
// (core/netplay.js Hosting flush), and counters of the work each does (how many of the world's
// things a pass measured against how many players), for whoever measures a world (scripts/
// load.js) or holds it to a budget (test/budget.test.js).
//
// Nothing's measured unless a Probes is installed: `lap` and `count` are then one comparison
// each, in a game as in a test. Nothing here is read by the rules, so a world steps the same with
// probes installed as without (test/probe.test.js plays one both ways and compares its sums);
// and it reads no clock of its own: whoever installs it gives it one, as core/runner.js is given
// its.
//
// The timers are laps, not pairs: `lap(name)` ends whatever pass was being timed and begins
// `name`'s, and `lap(null)` ends it with none begun, so all of a step's time falls to one name or
// another, and a pass that's left early (a return in its middle) is still ended by the next.
// Passes don't nest: a part of the step called from within another is counted to the one it was
// called from.

/**
 * The passes of the host's step, in the order they're played (core/host.js advance): the light to
 * see by; the rare encounters' time; the battle's own step; what the players did learnt from; the
 * followers kept up and whoever's idle marked away; what's lapsed (invitations, things on the
 * ground, trades); the townsfolk's scrutiny; the players' boons, charms and scrolls; the fallen
 * (what each of the battle's events means to the world); the invasions; who's sheltering; the
 * war; the players' crossings; what they've explored; then, twice a second (RELEVANCE.every), the
 * passes that measure the world against the players, each by its own name; and `end`, what's
 * left of the step.
 */
export const HOST_PASSES = Object.freeze([
    "light",
    "legends",
    "battle",
    "learn",
    "keepUp",
    "idle",
    "lapsed",
    "scrutiny",
    "boons",
    "fallen",
    "invasions",
    "sheltering",
    "war",
    "crossings",
    "explore",
    "lookAround",
    "spotting",
    "muster",
    "townsfolk",
    "wilds",
    "sighting",
    "requests",
    "missions",
    "messengers",
    "end",
]);

/**
 * The passes of what's sent after a step (core/netplay.js Hosting flush): the quiet stopped; the
 * world's sum taken; what's been done written out and sent; where those near the players stand
 * packed and sent, where that's sent; each player's own hero told them; and the world again for
 * whoever's asked.
 */
export const FLUSH_PASSES = Object.freeze(["flush.quiet", "flush.checksum", "flush.ops", "flush.motion", "flush.selves", "flush.worlds"]);

/**
 * The work counted, by name: `steps` played; the battle's index of where everyone stands made
 * again (`battle.indexed`, and over how many: `battle.indexedActors`); the players grouped
 * (`groups.calls`, and the pairs of players measured: `groups.pairs`); those gone through for the
 * light at night (`light.actors`); and for each pass that measures the world against the players,
 * how many of the world's things times how many players' places (`lookAround.pairs`, buildings;
 * `spotting.pairs`, what's to be found; `muster.pairs`, towns and works; `townsfolk.pairs`, the
 * settlements whose folk are out; `wilds.pairs`, the wild's creatures; `motion.pairs`, everyone in
 * the battle, as where they stand is packed); the world's sums and snapshots taken (`checksums`,
 * `snapshots`); and what Hosting sent (`sends`, and their characters: `sent`).
 */
export const COUNTERS = Object.freeze([
    "steps",
    "battle.indexed",
    "battle.indexedActors",
    "groups.calls",
    "groups.pairs",
    "light.actors",
    "lookAround.pairs",
    "spotting.pairs",
    "muster.pairs",
    "townsfolk.pairs",
    "wilds.pairs",
    "motion.pairs",
    "checksums",
    "snapshots",
    "sends",
    "sent",
]);

// The probes installed (a Probes), or null: nothing's measured
let installed = null;

/**
 * The pass being timed ended, and `name`'s begun (null: none). Nothing, with no probes installed.
 */
export function lap(name) {
    if (installed !== null) {
        installed.lap(name);
    }
}

/** `n` more of the work counted under `name`. Nothing, with no probes installed. */
export function count(name, n = 1) {
    if (installed !== null) {
        installed.count(name, n);
    }
}

/** Whether probes are installed: for a count that would itself take working out. */
export function probing() {
    return installed !== null;
}

/** Measure by `probes` (a Probes) from now on, in place of any installed before. Returns them. */
export function install(probes) {
    installed = probes;

    return probes;
}

/** Measure nothing from now on: the pass being timed ended first. Returns what was installed. */
export function uninstall() {
    const probes = installed;

    probes?.lap(null);
    installed = null;

    return probes;
}

/** What's measured: each pass's time and how often it was begun, and each counter's sum. */
export class Probes {
    /**
     * @param {object} options
     * @param {function} options.clock - The time (ms: performance.now, say; a thread's processor
     *   time is too coarse to time a pass by).
     */
    constructor({ clock }) {
        this.clock = clock;

        /** Each pass's time (by name: { ms, calls }), and each counter's sum (by name). */
        this.passes = new Map();
        this.counts = new Map();

        // The pass being timed (its entry in `passes`), and since when
        this.current = null;
        this.since = 0;
    }

    lap(name) {
        const now = this.clock();

        if (this.current !== null) {
            this.current.ms += now - this.since;
        }

        if (name === null) {
            this.current = null;

            return;
        }

        let pass = this.passes.get(name);

        if (pass === undefined) {
            pass = { ms: 0, calls: 0 };
            this.passes.set(name, pass);
        }

        pass.calls++;
        this.current = pass;
        this.since = now;
    }

    count(name, n = 1) {
        this.counts.set(name, (this.counts.get(name) ?? 0) + n);
    }

    /** Everything measured so far forgotten (a pass being timed is timed from now). */
    reset() {
        const timing = this.current === null ? null : [...this.passes].find(([, pass]) => pass === this.current)[0];

        this.passes.clear();
        this.counts.clear();
        this.current = null;

        if (timing !== null) {
            this.lap(timing);
            this.current.calls = 0;
        }
    }

    /** All the passes' time together (ms). */
    get total() {
        let total = 0;

        for (const { ms } of this.passes.values()) {
            total += ms;
        }

        return total;
    }

    /** As plain data: { passes: { name: { ms, calls } }, counts: { name: n } }, each by name in order. */
    toJSON() {
        const byName = (entries) => Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

        return { passes: byName([...this.passes].map(([name, { ms, calls }]) => [name, { ms, calls }])), counts: byName(this.counts) };
    }
}
