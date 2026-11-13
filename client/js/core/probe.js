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
// called from. Unless it's timed apart: `inner(name)` begins `name`'s within the pass being timed
// and hands back whose that was, and `outer` of that goes on with it (not begun again: its `calls`
// are as they were), so a search or a way found in the middle of a character's turn has its own
// name, and the turn's is what's left (the battle's step: BATTLE_PASSES). Only within a pass:
// with none being timed, between steps, nothing's begun. A Probes made with `inner` false times
// none apart, so each pass has all that was done within it.

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
 * The battle's step by its parts (core/battle.js #step), which is all but a little of the host's
 * `battle` pass (what's left under that name: handing the step's events over). In the order
 * they're played: `battle.muster`, the formations marched and who's after whom noted; each
 * character's turn to decide what to do, by what it is (BATTLE_KINDS: `battle.think.routine` the
 * folk, `.patrol` soldiers and all who stand guard or walk a round, `.wild` the wild's creatures,
 * `.follow` followers, `.other` the players and whatever only stands); each one's walking, by
 * kind the same (`battle.move.routine` ...); `battle.fight`, the blows; and `battle.effects`,
 * what's in the air, on the ground and ailing them. And, timed apart within those (inner): the
 * index of where everyone stands made or brought up to date (`battle.index`); the nearest enemy
 * looked for, and whether one's in a fight at all (`battle.search`); a way found over the
 * navigation mesh (`battle.paths`); and the mesh asked whether a step aside is on it
 * (`battle.mesh`).
 */
export const BATTLE_KINDS = Object.freeze(["routine", "patrol", "wild", "follow", "other"]);

export const BATTLE_PASSES = Object.freeze([
    "battle.muster",
    ...BATTLE_KINDS.map((kind) => `battle.think.${kind}`),
    ...BATTLE_KINDS.map((kind) => `battle.move.${kind}`),
    "battle.fight",
    "battle.effects",
    "battle.index",
    "battle.search",
    "battle.paths",
    "battle.mesh",
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
 * afresh (`battle.indexed`, and over how many: `battle.indexedActors`), or brought up to date in
 * place (`battle.reindexed`, and how many were moved to another cell: `battle.reindexedMoves`);
 * characters taken out of it (`battle.removed`), and how many times everyone still in was gone
 * through to forget them (`battle.forgets`: once for each as it was, once for all those let go
 * together now, core/battle.js forget);
 * who the battle stepped, a step at a time (`battle.actors`, everyone in it; `battle.fallen`, those
 * of them down; and by kind, BATTLE_KINDS: `battle.actors.routine` ...), how many of them walked
 * (`battle.walkers`), in how many strides (`battle.strides`), and how many stood where they were
 * with nowhere to go (`battle.idle`); the nearest enemy looked for (`battle.searches`, and
 * those looked at for it: `battle.searchLooks`), whether one's in a fight asked (`battle.fightAsks`),
 * a player near asked after between looks (`battle.playerAsks`), and the players measured for
 * whoever asks after those near it (`battle.playerPairs`: a soldier set on no one, the folk
 * resting and beckoning, a way to be found); who's near a point asked of
 * the index (`battle.nears`, and how many it gave: `battle.nearFound`); sight lines walked
 * (`battle.sights`); ways found (`battle.paths`, and by kind: `battle.paths.routine` ...); and the
 * mesh asked for its nearest point (`battle.meshAsks`), and how often what it last answered of
 * where a walker stands was given again unasked (`battle.meshKept`); the players grouped
 * (`groups.calls`, and the pairs of players measured: `groups.pairs`); those gone through for the
 * light at night (`light.actors`, and the lights measured against players' places: `light.pairs`); and for each pass that measures the world against the players,
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
    "battle.reindexed",
    "battle.reindexedMoves",
    "battle.removed",
    "battle.forgets",
    "battle.actors",
    "battle.fallen",
    ...BATTLE_KINDS.map((kind) => `battle.actors.${kind}`),
    "battle.walkers",
    "battle.strides",
    "battle.idle",
    "battle.searches",
    "battle.searchLooks",
    "battle.fightAsks",
    "battle.playerAsks",
    "battle.playerPairs",
    "battle.nears",
    "battle.nearFound",
    "battle.sights",
    "battle.paths",
    ...BATTLE_KINDS.map((kind) => `battle.paths.${kind}`),
    "battle.meshAsks",
    "battle.meshKept",
    "groups.calls",
    "groups.pairs",
    "light.actors",
    "light.pairs",
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

/**
 * `name`'s pass begun within the one being timed, and timed apart from it. Returns the name of the
 * pass it was begun within, for `outer`; or undefined, nothing begun: with no probes installed, or
 * none that time a pass's parts apart, or no pass being timed (between steps: a way found for a
 * command as it's heard is no part of a step).
 */
export function inner(name) {
    return installed !== null && installed.inner && installed.name !== null ? installed.within(name) : undefined;
}

/** The pass `inner` was begun within gone on with (what `inner` returned): its part ended. */
export function outer(from) {
    if (from !== undefined && installed !== null) {
        installed.lap(from, true);
    }
}

/**
 * The name of the pass being timed, for `outer` to go on with once what's called has timed its
 * own parts by `lap` (the battle's step, BATTLE_PASSES); or undefined, with no probes installed or
 * no pass being timed.
 */
export function timing() {
    return installed === null || installed.name === null ? undefined : installed.name;
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
     * @param {boolean} [options.inner] - Whether a pass's parts are timed apart from it (`inner`:
     *   they are, unless this is false).
     */
    constructor({ clock, inner: apart = true }) {
        this.clock = clock;
        this.inner = apart;

        /** Each pass's time (by name: { ms, calls }), and each counter's sum (by name). */
        this.passes = new Map();
        this.counts = new Map();

        // The pass being timed (its entry in `passes`, and its name), and since when
        this.current = null;
        this.name = null;
        this.since = 0;
    }

    /** `name`'s pass begun (or, `again`, gone on with: no more `calls`), whatever was being timed ended. */
    lap(name, again = false) {
        const now = this.clock();

        if (this.current !== null) {
            this.current.ms += now - this.since;
        }

        this.name = name;

        if (name === null) {
            this.current = null;

            return;
        }

        let pass = this.passes.get(name);

        if (pass === undefined) {
            pass = { ms: 0, calls: 0 };
            this.passes.set(name, pass);
        }

        pass.calls += again ? 0 : 1;
        this.current = pass;
        this.since = now;
    }

    /** `name`'s pass begun within the one being timed: returns that one's name. */
    within(name) {
        const from = this.name;

        this.lap(name);

        return from;
    }

    count(name, n = 1) {
        this.counts.set(name, (this.counts.get(name) ?? 0) + n);
    }

    /** Everything measured so far forgotten (a pass being timed is timed from now). */
    reset() {
        const timing = this.name;

        this.passes.clear();
        this.counts.clear();
        this.current = null;
        this.name = null;

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
