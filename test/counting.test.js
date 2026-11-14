// The folk's look for danger, left out on a map that holds no one who could frighten them
// (client/js/core/battle.js Battle.counting, #afraid; generated/multiplayer_scaling_plan.md 1-20).
// No one neutral frightens anyone, so where everyone on a map is neutral the look finds no one;
// the index counts, for each map, those who aren't. What matters is that the count is never out
// of date: danger is brought into a tavern's room of folk by each way there is (walked in at
// the door, set down there, added there, its map written as the host writes one, a stranger no
// longer neutral, one fallen up again), and the folk run from it at the very step they did when
// they looked every time: every step's events and the whole battle after every step, the same
// with the switch on and off. Counts are asked, never times.
//
// Since the folk of a building no player is in stand as they are (Battle.idling, plan 1-22: the
// owner's ruling of 14 November 2026), a tavern's folk take no turn till someone comes in, and
// there is no look for the count to leave out. So these evenings are played as they were when
// this was written, the folk about their rounds unseen (Battle.idling off: its old form, which
// is where the count has its work), and one more as the game plays them now, the same with the
// count kept or not. The count goes when Battle.idling does (test/idling.test.js has its date).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { Battle, FLEE, STEP_MS } from "../client/js/core/battle.js";
import { install, lap, Probes, uninstall } from "../client/js/core/probe.js";
import { encode } from "../client/js/core/wire.js";
import { generateWorld } from "../client/js/core/world.js";

const sha = (text) => createHash("sha1").update(text).digest("hex");
const ROOM = "taproom";

// A wolf out for blood, whom the folk run from (battle.js #frightens); with `more`, what else
// it's made with
const wolf = (square, map, more = {}) => ({ id: "wolf", kind: "beast", name: "Wolf", team: "wild", weapon: "claws", square, map, hp: 400, wild: { temper: "aggressive" }, ...more });

/**
 * An evening in the tavern (core/world.js generateWorld: its taproom and the floor above, a
 * dozen folk between them, all neutral, and the town outside its door), played in acts: each of
 * `acts` is { at: the step it's done before, does(battle, world) }. `first` adds whoever is in
 * the battle before the folk are, so ahead of them in every step. Resolves to every step's
 * events and the battle whole after it (`steps`), the searches counted in each step
 * (`searches`), for each step the ids of the taproom's folk who were afraid and of those
 * upstairs who were (`afraid`, `above`), and of whom anyone in the taproom ever was (`feared`).
 */
function evening({ first = () => {}, acts, steps }) {
    const world = generateWorld({ seed: 1 });
    const battle = new Battle(world, { seed: 1 });
    const played = [];
    const searches = [];
    const afraid = [];
    const above = [];
    const feared = new Set();

    first(battle, world);

    for (const one of world.folk) {
        battle.add({ id: one.id, kind: "folk", name: one.name, team: "folk", square: one.square, map: one.map, ai: "routine", neutral: true, routine: one.routine, role: one.role, facing: one.facing });
    }

    let ticks = 0;
    let counted = 0;
    const probes = install(new Probes({ clock: () => ticks++ }));

    try {
        for (let step = 0; step < steps; step++) {
            for (const act of acts) {
                if (act.at === step) {
                    act.does(battle, world);
                }
            }

            // (Within a pass being timed, as the host steps it: the step's work is counted)
            lap("battle");

            const events = battle.advance(STEP_MS);

            lap(null);

            const now = probes.toJSON().counts["battle.searches"] ?? 0;
            const scared = (map) => battle.actors.filter((actor) => actor.kind === "folk" && actor.map === map && actor.afraid !== null && actor.afraid !== undefined).map(({ id }) => id);

            played.push(`${encode(events)} ${sha(JSON.stringify(battle.snapshot()))}`);
            searches.push(now - counted);
            afraid.push(scared(ROOM));
            above.push(scared("upstairs"));
            scared(ROOM).forEach((id) => feared.add(battle.actor(id).afraid));
            counted = now;
        }
    } finally {
        uninstall();
    }

    return { battle, steps: played, searches, afraid, above, feared };
}

// What `play` gives with the folk about their rounds where no player is, as they were
// (Battle.idling off)
function unseen(play) {
    assert.equal(Battle.idling, true, "Battle.idling is on");
    Battle.idling = false;

    try {
        return play();
    } finally {
        Battle.idling = true;
    }
}

// An evening played with the count kept, and again with the folk looking every time as they
// did; both with the folk about their rounds unseen, or (`held`) standing as they do now
function both(evening, { held = false } = {}) {
    const each = () => {
        const counting = evening();

        assert.equal(Battle.counting, true, "Battle.counting is on");
        Battle.counting = false;

        try {
            return { counting, looking: evening() };
        } finally {
            Battle.counting = true;
        }
    };

    return held ? each() : unseen(each);
}

// Two evenings the same, step for step: the first step that differs said, if any does
function assertSame({ counting, looking }) {
    const differs = counting.steps.findIndex((step, k) => step !== looking.steps[k]);

    assert.equal(differs, -1, `the evenings differ from step ${differs}`);
    assert.equal(counting.steps.length, looking.steps.length);
}

const sum = (list, from, to) => list.slice(from, to).reduce((total, each) => total + each, 0);

// How many searches the count left out between two steps: those made looking every time, less
// those made with the count kept (whatever else searches, a wolf for its prey, does so in both)
const leftOut = ({ counting, looking }, from, to = counting.steps.length) => sum(looking.searches, from, to) - sum(counting.searches, from, to);

// Each of the folk looks about once every FLEE.look, in a step of its own: so `folk` of them
// make this many looks in `steps` steps, give or take one each
const EVERY = FLEE.look / STEP_MS;
const FOLK = { room: 7, above: 5 };

function assertLeftOut(played, from, to, folk, said) {
    const left = leftOut(played, from, to);
    const looks = (folk * (to - from)) / EVERY;

    assert.ok(left >= looks - folk && left <= looks + folk, `${said}: ${left} looks left out between steps ${from} and ${to}, about ${looks} for ${folk} of the folk`);
}

// The first step at which anyone in the taproom was afraid, from `from` on: -1, no one
const firstAfraid = ({ afraid }, from = 0) => afraid.findIndex((ids, k) => k >= from && ids.length > 0);

// A square of the taproom's floor by the middle of it, in sight of its tables
const MIDDLE = [8, 7];

// Two seconds of quiet, then danger
const CALM = 40;

describe("the folk's look for danger, only where someone could frighten them (core/battle.js Battle.counting, plan 1-20)", () => {
    // What every way of bringing danger in must show: the same evening either way, no one
    // looked for till it came (and, the old way, someone looked for all along: it was a look
    // left out), and the room afraid of it within two looks of its coming, as at the same step
    // either way; and no one upstairs, who can't see it
    function assertRan(played, { came, by = "wolf", quiet = CALM }) {
        const { counting, looking } = played;

        assertSame(played);
        assertLeftOut(played, 0, quiet, FOLK.room + FOLK.above, "every look left out while the tavern held only the neutral");

        const first = firstAfraid(counting, came);

        assert.ok(first >= came && first <= came + (2 * FLEE.look) / STEP_MS, `afraid at step ${first}, danger come at ${came}`);
        assert.equal(firstAfraid(looking, came), first, "at the same step as when everyone looks");
        assert.ok(counting.afraid.slice(first).some((ids) => ids.length >= 5), "most of the room afraid");
        assert.ok(counting.feared.has(by) && counting.feared.size === 1, `afraid of ${[...counting.feared]}`);
        assert.ok(counting.above.every((ids) => ids.length === 0), "no one upstairs afraid");

        return first;
    }

    it("has a room of folk run from a wolf that walks in at the door, and looks for no one once it's gone out again", () => {
        // (The wolf out in the town, ahead of the folk in the roster: it comes through the door
        // in the middle of a step, and the folk whose look falls in that step see it there)
        const OUT = 500;
        const played = both(() =>
            evening({
                first: (battle, world) => battle.add(wolf(world.tavern.outside, "town")),
                acts: [
                    { at: CALM, does: (battle) => battle.command("wolf", { type: "enter", link: "tavern-door" }) },
                    { at: OUT, does: (battle) => battle.command("wolf", { type: "enter", link: "tavern-door" }) },
                ],
                steps: 1000,
            }),
        );
        const { counting, looking } = played;
        const cross = (k) => counting.steps.findIndex((step, at) => at >= k && step.includes('"cross"'));
        const [came, went] = [cross(CALM), cross(OUT)];

        assert.ok(came > CALM && went > OUT, `in at step ${came}, out at ${went}`);
        assert.equal(counting.battle.actor("wolf").map, "town");
        assertSame(played);

        // (No one looked for till the step it came in; the room afraid within a look of it)
        assertLeftOut(played, 0, came, FOLK.room + FOLK.above, "before it came in");

        const first = firstAfraid(counting, CALM);

        assert.ok(first >= came && first <= came + FLEE.look / STEP_MS, `afraid at step ${first}, the wolf in at ${came}`);
        assert.equal(firstAfraid(looking, CALM), first);
        assert.ok(counting.afraid.slice(first, went).some((ids) => ids.length >= 5), "most of the room afraid");

        // (Gone: calm again a while after, at the same step either way, and no one looked for
        // from the step after it left, where the old way goes on looking)
        const calm = counting.afraid.findIndex((ids, k) => k > went && ids.length === 0);

        assert.ok(calm > went && calm <= went + (FLEE.calm + FLEE.look) / STEP_MS + 1, `calm at step ${calm}, the wolf out at ${went}`);

        // (While it was in the room only those upstairs looked for no one; and everyone again
        // from the step after it left)
        assertLeftOut(played, came + 1, went, FOLK.above, "while it was in the room");
        assertLeftOut(played, went + 1, counting.steps.length, FOLK.room + FOLK.above, "after it left");
    });

    it("has them run from one set down among them, as the host sets down one carried there by a spell or come in at a door (place)", () => {
        const played = both(() =>
            evening({
                acts: [
                    { at: 0, does: (battle, world) => battle.add(wolf(world.tavern.outside, "town")) },
                    { at: CALM, does: (battle) => assert.ok(battle.place("wolf", ROOM, MIDDLE)) },
                ],
                steps: 240,
            }),
        );

        assertRan(played, { came: CALM });
        assertLeftOut(played, CALM + 1, 240, FOLK.above, "once it was in the room");
    });

    it("has them run from one added among them, as a creature called is (add)", () => {
        const played = both(() => evening({ acts: [{ at: CALM, does: (battle) => battle.add(wolf(MIDDLE, ROOM)) }], steps: 240 }));

        assertRan(played, { came: CALM });
    });

    it("has them run from one whose map was written straight onto it, as the host brings a leader's followers after them (host.js #bring, #bringAlong)", () => {
        const played = both(() =>
            evening({
                first: (battle, world) => battle.add(wolf(world.tavern.outside, "town")),
                acts: [{ at: CALM, does: (battle) => Object.assign(battle.actor("wolf"), { map: ROOM, spawnMap: ROOM, square: [...MIDDLE], x: MIDDLE[0] + 0.5, y: MIDDLE[1] + 0.5, path: [], offPath: false, target: null }) }],
                steps: 240,
            }),
        );

        assertRan(played, { came: CALM });
    });

    it("has them run from a stranger among them who's no longer neutral, and look for no one once it is again (host.js: a band refused, an ambush sprung)", () => {
        const AGAIN = 300;
        const played = both(() =>
            evening({
                acts: [
                    { at: 0, does: (battle) => battle.add(wolf(MIDDLE, ROOM, { neutral: true })) },
                    { at: CALM, does: (battle) => (battle.actor("wolf").neutral = false) },
                    { at: AGAIN, does: (battle) => Object.assign(battle.actor("wolf"), { neutral: true }) },
                ],
                steps: 600,
            }),
        );
        const { counting } = played;

        assertRan(played, { came: CALM });

        // (Neutral again: no one looked for from that step on, and calm at the same step)
        assertLeftOut(played, CALM, AGAIN, FOLK.above, "while it wasn't neutral");
        assertLeftOut(played, AGAIN, 600, FOLK.room + FOLK.above, "once it was neutral again");
        assert.ok(counting.afraid.at(-1).length === 0 && counting.afraid[AGAIN - 1].length > 0);
    });

    it("has them run from one fallen out in the town that's up again at its place among them, in the middle of a step (#respawn)", () => {
        // (Its place the taproom, as a soldier quartered there has it; slain in the town, and up
        // again two seconds on. Ahead of the folk in the roster, so up before their turns)
        const played = both(() =>
            evening({
                first: (battle, world) => {
                    battle.add(wolf(world.tavern.outside, "town"));
                    Object.assign(battle.actor("wolf"), { spawn: [...MIDDLE], spawnMap: ROOM });
                },
                acts: [
                    {
                        at: 10,
                        does: (battle) => {
                            battle.afflict("wolf", "burn", { damage: 100000 });
                        },
                    },
                    { at: 30, does: (battle) => assert.ok(battle.actor("wolf").dead && (battle.actor("wolf").respawnAt = CALM * STEP_MS)) },
                ],
                steps: 240,
            }),
        );
        const up = played.counting.steps.findIndex((step) => step.includes('"respawn"'));

        assert.ok(up >= CALM - 1 && up <= CALM + 1, `up at step ${up}`);
        assert.equal(played.counting.battle.actor("wolf").map, ROOM);
        assertRan(played, { came: up, quiet: up });
        assertLeftOut(played, up + 1, 240, FOLK.above, "once it was up in the room");
    });

    it("has them run from one knocked down among them that's up again where it fell (rise)", () => {
        // (Down in the room, it's still someone there who isn't neutral: the folk look, find no
        // one to fear in one lying dead, and are calm; up again, they run from it)
        const DOWN = 60;
        const UP = 400;
        const played = both(() =>
            evening({
                acts: [
                    { at: CALM, does: (battle) => battle.add(wolf(MIDDLE, ROOM, { rises: 100 })) },
                    {
                        at: DOWN,
                        does: (battle) => {
                            battle.afflict("wolf", "burn", { damage: 100000 });
                        },
                    },
                    { at: UP, does: (battle) => assert.ok(battle.rise("wolf")) },
                ],
                steps: 600,
            }),
        );
        const { counting, looking } = played;

        assertRan(played, { came: CALM });
        assert.ok(counting.afraid[UP - 1].length === 0, "calm while it lay there");
        assertLeftOut(played, CALM, 600, FOLK.above, "all the while it was in the room, down or up");

        const again = firstAfraid(counting, UP);

        assert.ok(again >= UP && again <= UP + FLEE.look / STEP_MS, `afraid again at step ${again}`);
        assert.equal(firstAfraid(looking, UP), again);
    });

    it("looks for no one again once whoever frightened them is taken out (remove)", () => {
        const GONE = 100;
        const played = both(() =>
            evening({
                acts: [
                    { at: CALM, does: (battle) => battle.add(wolf(MIDDLE, ROOM)) },
                    { at: GONE, does: (battle) => battle.remove("wolf") },
                ],
                steps: 400,
            }),
        );

        assertRan(played, { came: CALM });
        assertLeftOut(played, GONE, 400, FOLK.room + FOLK.above, "once it was taken out");
        assert.equal(played.counting.afraid.at(-1).length, 0, "calm again");
    });

    it("counts those who aren't neutral with the index made afresh every time and brought up to date as it was, the same evening", () => {
        const evenings = () =>
            evening({
                acts: [
                    { at: 0, does: (battle) => battle.add(wolf(MIDDLE, ROOM, { neutral: true })) },
                    { at: CALM, does: (battle) => (battle.actor("wolf").neutral = false) },
                    { at: 200, does: (battle) => (battle.actor("wolf").neutral = true) },
                ],
                steps: 400,
            });
        const usual = unseen(evenings);

        for (const name of ["reindexing", "mustering", "indexing", "sparing"]) {
            assert.equal(Battle[name], true);
            Battle[name] = false;

            try {
                const other = unseen(evenings);

                assert.equal(other.steps.findIndex((step, k) => step !== usual.steps[k]), -1, `with Battle.${name} off`);
                assert.deepEqual(other.searches, usual.searches, `the same searches a step, Battle.${name} off`);
            } finally {
                Battle[name] = true;
            }
        }

        // (And the count was kept in each: a neutral wolf's own search is all there is a step
        // till it turns)
        assert.ok(firstAfraid(usual, CALM) >= CALM);
        assert.ok(sum(usual.searches, 0, CALM) <= CALM, `${sum(usual.searches, 0, CALM)} searches before it turned`);
    });

    it("is the same evening kept or not as the game plays it now, the folk standing till someone comes in (Battle.idling): a wolf in at the door, and out", () => {
        const OUT = 500;
        const played = both(
            () =>
                evening({
                    first: (battle, world) => battle.add(wolf(world.tavern.outside, "town")),
                    acts: [
                        { at: CALM, does: (battle) => battle.command("wolf", { type: "enter", link: "tavern-door" }) },
                        { at: OUT, does: (battle) => battle.command("wolf", { type: "enter", link: "tavern-door" }) },
                    ],
                    steps: 1000,
                }),
            { held: true },
        );
        const { counting } = played;
        const came = counting.steps.findIndex((step, at) => at >= CALM && step.includes('"cross"'));
        const went = counting.steps.findIndex((step, at) => at >= OUT && step.includes('"cross"'));

        assertSame(played);
        assert.ok(came > CALM && went > OUT);

        // (No one held looks, so there's nothing for the count to leave out before the wolf
        // comes; in the room with them it frightens them as ever, within a look)
        assert.equal(leftOut(played, 0, came), 0);

        const first = firstAfraid(counting, CALM);

        assert.ok(first >= came && first <= came + 1 + FLEE.look / STEP_MS, `afraid at step ${first}, the wolf in at ${came}`);
        assert.ok(counting.afraid.slice(first, went).some((ids) => ids.length >= 5), "most of the room afraid");
    });
});
