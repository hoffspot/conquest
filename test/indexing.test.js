// What the host asks of everyone in the battle and of the wild's table, asked of an index
// (client/js/core/host.js Host.indexing; generated/multiplayer_scaling_plan.md 1-8, its rest):
// the bodies about a place counted among those the battle's own index has near it (core/battle.js
// within), and the wild's creatures gone through once for all the packs' members, not once for
// each pack. Neither changes an answer, so a world plays out the same step for step either way:
// a pack reinforced in the middle of its fight and the body budget reached about it, a hell
// rift's tears pouring packs while their packs fall, and 25 players in fours with fights and the
// wild about them, carried on from a snapshot.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { DAY, dayOf } from "../client/js/core/daytime.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { dueOf, HELL_RIFT } from "../client/js/core/hellrift.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { install, Probes, uninstall } from "../client/js/core/probe.js";
import { createRandom } from "../client/js/core/random.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { BODIES } from "../client/js/core/strength.js";
import { decode, encode } from "../client/js/core/wire.js";
import { layoutOf } from "../scripts/load.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// How many more players a small game has, each in a settlement of their own: enough in the battle
// that the index is asked (core/battle.js within: more in it than cells about a place)
const OTHERS = 16;

// A character stood somewhere, as the tests of the wild stand them (test/creatures.test.js): the
// battle's next step finds them there
const put = (actor, [x, y]) => Object.assign(actor, { square: [Math.floor(x), Math.floor(y)], x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, path: [], order: null, target: null, spawn: [Math.floor(x), Math.floor(y)] });

// What `play` gives with everyone and all the wild gone through, as it was
function throughEveryone(play) {
    assert.equal(Host.indexing, true, "Host.indexing is on");
    Host.indexing = false;

    try {
        return play();
    } finally {
        Host.indexing = true;
    }
}

// A game played with what its passes went through counted: `script(host, step)` plays it, a step
// at a time (`step()`: one step, its events given back). Every step's events and the world's sum
// after it, all of it at the end, and the counts
function played(script) {
    const steps = [];
    const events = [];
    let ticks = 0;
    const probes = install(new Probes({ clock: () => ticks++ }));
    let host;

    try {
        host = script((game) => {
            const happened = game.advance(STEP_MS);

            steps.push([encode(happened), game.checksum()]);
            events.push(...happened);

            return happened;
        });
    } finally {
        uninstall();
    }

    return { host, steps, events, snapshot: encode(host.snapshot()), counts: probes.toJSON().counts };
}

// Two games the same, step for step: the first step that differs said, if any does
function assertSame(a, b) {
    assert.equal(a.steps.length, b.steps.length, "as many steps");

    const differs = a.steps.findIndex((step, k) => step[0] !== b.steps[k][0] || step[1] !== b.steps[k][1]);

    assert.equal(differs, -1, `the games differ from step ${differs}`);
    assert.equal(a.snapshot, b.snapshot, "the world at the end");
}

// The bodies about a place as going through everyone counts them (core/host.js #bodiesNear's
// test), and as counting those the battle's index gives does
function bodies(host, map, [x, y], near = null) {
    const test = (actor) => !actor.dead && actor.map === map && (actor.kind === "player" || actor.kind === "follower" || host.wild.has(actor.id) || host.companions.has(actor.id)) && Math.hypot(actor.x - x, actor.y - y) <= BODIES.reach;

    return (near ? near.map((k) => host.battle.actors[k]) : host.battle.actors).filter(test).map(({ id }) => id).sort();
}

// The index asked from outside (battle.within) leaves out no one a test of everyone would pass:
// about everyone in the battle, and a way off from each, on every map anyone's on. How many
// askings it answered (it answers only while it's the battle's as it stands, and then only where
// there are fewer cells to look in than characters in the battle)
function assertWithin(host, random) {
    const { battle } = host;
    let asked = 0;

    for (const actor of battle.actors.filter((each, k) => k % 7 === 0)) {
        for (const reach of [0, 3, BODIES.reach, 200]) {
            const at = [actor.x + (random.next() - 0.5) * 2 * reach, actor.y + (random.next() - 0.5) * 2 * reach];
            const near = battle.within(actor.map, at[0], at[1], reach);

            if (!near) {
                continue;
            }

            assert.equal(new Set(near).size, near.length, "no one twice");

            const through = battle.actors.filter((other) => other.map === actor.map && Math.hypot(other.x - at[0], other.y - at[1]) <= reach);
            const found = new Set(near.map((k) => battle.actors[k]));

            assert.deepEqual(through.filter((other) => !found.has(other)).map(({ id }) => id), [], `everyone within ${reach} m of ${at} on ${actor.map}`);
            asked++;
        }

        assert.deepEqual(bodies(host, actor.map, [actor.x, actor.y], battle.within(actor.map, actor.x, actor.y, BODIES.reach)), bodies(host, actor.map, [actor.x, actor.y]));
        assert.equal(battle.within(actor.map, actor.x, actor.y, Infinity), null, "(no reach: everyone's gone through)");
    }

    return asked;
}

// The same over the next steps of a world, at each step the index answers after: how many askings
// it answered in all
function assertWithinPlayed(host, random, steps = 60) {
    let asked = 0;

    for (let step = 0; step < steps; step++) {
        host.advance(STEP_MS);
        asked += assertWithin(host, random);
    }

    return asked;
}

describe("a pack reinforced in the middle of its fight, and the body budget reached (Host.indexing)", () => {
    // One player out in the wilds (and sixteen more in settlements of their own, so the battle
    // is one the index is asked of: more in it than cells about a place), a pack put out about
    // them and set on; three more come to stand beside them, and the pack's reinforced; two more,
    // and it's reinforced again, now several strong; one of it falls and one of the players
    // goes; then the hired stood about them till the budget's all but full, and two more come
    const game = () =>
        played((step) => {
            const world = buildWorld({ seed: 2 });
            const host = new Host(world, { populate: false });
            const run = (ms) => Array.from({ length: ms / STEP_MS }, () => step(host)).flat();
            const come = (names) =>
                names.forEach((name, k) => {
                    host.join({ id: name, hero: { ...HERO, name } });
                    Object.assign(host.battle.actor(name), { hp: 1e6, maxHp: 1e6 });
                    put(host.battle.actor(name), [me.square[0] + 1 + Math.floor(k / 3), me.square[1] + (k % 3)]);
                });
            const tough = () => [...host.wild].filter(([, one]) => one.pack === fighting).forEach(([id]) => Object.assign(host.battle.actor(id) ?? {}, { hp: 1e5, maxHp: 1e5 }));

            host.join({ id: HOST_PLAYER, hero: HERO });
            layoutOf(world.plan, OTHERS, "spread").forEach(({ race, at }, k) => host.join({ id: `p${k + 1}`, hero: { ...HERO, name: `P${k + 1}`, race }, square: at, map: "town" }));
            host.populate();
            Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

            const me = host.battle.actor(HOST_PLAYER);
            const { middle } = world.stamp;

            put(me, [middle[0] - SETTLEMENT_KINDS[world.start.kind].radius - 80, middle[1] - 20]);
            Object.assign(me, { hp: 1e6, maxHp: 1e6 });
            run(5000);

            const fighting = [...host.packs.keys()][0];
            const foe = [...host.wild].filter(([, one]) => one.pack === fighting).map(([id]) => host.battle.actor(id)).find((actor) => actor && !actor.dead);

            tough();
            host.command(HOST_PLAYER, { type: "engage", target: foe.id });

            for (let s = 0; s < 30 && foe.target !== HOST_PLAYER; s++) {
                run(1000);
            }

            assert.equal(foe.target, HOST_PLAYER, "(the pack set on them)");
            come(["Bea", "Cy", "Di"]);
            run(3000);
            tough();
            come(["Eve", "Fay"]);
            run(3000);
            tough();

            // (One of the pack struck down, and one of those who came gone from the world: the
            // wild's table and the battle's list both other than they were)
            const fallen = [...host.wild].filter(([id, one]) => one.pack === fighting && id !== foe.id).map(([id]) => id)[0];

            host.battle.afflict(fallen, "burn", { by: HOST_PLAYER, damage: 1e7 });
            run(1000);
            host.leave("Di");
            run(2000);

            // (The budget all but filled with the hired, about where the players stand)
            // (Some way off, so asking the index less far than the budget reaches would miss them)
            for (let k = bodies(host, "town", [me.x, me.y]).length; k < BODIES.most - 3; k++) {
                host.battle.add({ id: `hireling-${k}`, kind: "follower", name: "Hireling", weapon: "sword", team: me.team, square: [me.square[0] + 20 + (k % 8), me.square[1] + 20 + Math.floor(k / 8)], map: "town", hp: 1e5, power: { melee: 1, ranged: 1 }, armor: 0 });
            }

            // (More come beside them: the side's grown again, with room for one more of the pack)
            come(["Gus", "Hal", "Ida"]);
            run(6000);

            return host;
        });

    let indexed;

    before(() => {
        indexed = game();
    });

    it("plays out the same step for step with the index asked and with everyone gone through", () => {
        const everyone = throughEveryone(game);

        assertSame(indexed, everyone);

        // (And there was something to get wrong: a pack reinforced, one of it fallen, the budget
        // reached, the wild about them)
        const { events, host, counts } = indexed;

        const reinforced = events.filter(({ type }) => type === "reinforced");

        assert.ok(reinforced.length >= 3 && reinforced.every(({ ids }) => ids.length >= 1), `(a pack reinforced, ${reinforced.length} times)`);
        assert.ok(reinforced.at(-1).time > host.battle.time - 7000 && reinforced.at(-1).ids.length <= 3, "(the last time, with the budget all but full)");
        assert.ok(host.battle.actors.length > 21 * 21, `(${host.battle.actors.length} in the battle: more than the cells about a place)`);
        assert.ok(events.filter(({ type }) => type === "roused").length >= 3, "(packs put out)");
        assert.ok(bodies(host, "town", [host.battle.actor(HOST_PLAYER).x, host.battle.actor(HOST_PLAYER).y]).length >= BODIES.most, "(the budget reached about them)");
        assert.ok(host.packs.size > 0 && host.wild.size > 0);

        // (Fewer gone through: the wild's creatures once a look, where it was once for each pack;
        // and for the bodies about a place those near it, where it was everyone)
        assert.ok(counts["packs.wild"] > 0 && counts["bodies.actors"] > 0, "(both counted)");
        assert.ok(counts["packs.wild"] < everyone.counts["packs.wild"], `${counts["packs.wild"]} of the wild gone through for the packs, ${everyone.counts["packs.wild"]} before`);
        assert.equal(counts["bodies.asks"], everyone.counts["bodies.asks"], "(as many askings)");
        assert.ok(counts["bodies.actors"] < everyone.counts["bodies.actors"], `${counts["bodies.actors"]} gone through for the bodies about, ${everyone.counts["bodies.actors"]} before`);
    });

    it("leaves no one out whom going through everyone would count: any place, any reach, every map", () => {
        const { host } = indexed;

        // (Some gone indoors, so there's more than one map with anyone on it)
        assert.ok(new Set(host.battle.actors.map(({ map }) => map)).size > 1, "(more maps than one)");
        const asked = assertWithinPlayed(host, createRandom(3));

        assert.ok(asked > 40, `(${asked} askings answered by the index)`);

        // (It answers only while it's the battle's as it stands: not once someone's been put
        // somewhere, added or taken out, till the battle's brought it up to date again)
        const { battle } = host;
        const me = battle.actor(HOST_PLAYER);
        const answers = () => battle.within("town", me.x, me.y, BODIES.reach) !== null;
        const stepped = () => {
            let steps = 0;

            do {
                host.advance(STEP_MS);
            } while (!answers() && ++steps < 200);

            assert.ok(answers(), "(the index up to date after a step)");
        };

        stepped();
        assert.ok(battle.place("hireling-40", "town", [me.square[0] - 30, me.square[1] - 30]), "(one put elsewhere)");
        assert.equal(answers(), false, "(behind: one put somewhere)");
        stepped();
        battle.add({ id: "latecomer", kind: "follower", name: "Hireling", weapon: "sword", team: me.team, square: [me.square[0] + 3, me.square[1] - 9], map: "town", hp: 1e5, power: { melee: 1, ranged: 1 }, armor: 0 });
        assert.equal(answers(), false, "(behind: one added)");
        stepped();
        battle.remove("latecomer");
        assert.equal(answers(), false, "(behind: one taken out)");
        stepped();
        assert.ok(assertWithin(host, createRandom(6)) > 40);

        // (And with everyone gone through inside the battle too, Battle.indexing off, it
        // answers none: whoever asks goes through everyone)
        Battle.indexing = false;

        try {
            assert.equal(assertWithinPlayed(host, createRandom(4), 5), 0);
        } finally {
            Battle.indexing = true;
        }
    });
});

describe("a hell rift's tears pouring packs, their packs falling, the budget reached (Host.indexing)", () => {
    const game = () =>
        played((step) => {
            const world = buildWorld({ seed: 2 });
            const host = new Host(world, { populate: false });
            const run = (ms) => Array.from({ length: ms / STEP_MS }, () => step(host)).flat();

            host.join({ id: HOST_PLAYER, hero: HERO });
            layoutOf(world.plan, OTHERS, "spread").forEach(({ race, at }, k) => host.join({ id: `p${k + 1}`, hero: { ...HERO, name: `P${k + 1}`, race }, square: at, map: "town" }));
            host.populate();
            Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

            const me = host.battle.actor(HOST_PLAYER);

            Object.assign(me, { hp: 1e7, maxHp: 1e7 });

            // (The world's clock put on to the day's rift)
            const day = dayOf(HELL_RIFT.first) + 1;
            const opens = day * DAY.length - DAY.start + dueOf(host.battle.seed, day) + 1000;

            Object.assign(host.war, { turn: Math.floor(opens / 60000), clock: opens % 60000 });
            run(2000);

            const open = host.hellRifts.open;

            assert.ok(open, "(a rift open)");

            const tear = open.tears[0];

            put(me, [tear.at[0] + 20, tear.at[1]]);

            const poured = run(4000).filter((event) => event.type === "hellRift" && event.change === "poured");

            assert.ok(poured.length >= 1, "(a pack out of the tear)");

            // (Its first pack struck down, all of it: the tear's rid of it, and pours another)
            for (const id of poured[0].ids) {
                host.battle.afflict(id, "burn", { by: HOST_PLAYER, damage: 1e7 });
            }

            // (Each tear's next pack's time brought on, not waited for)
            const due = () => open.tears.forEach((each) => (each.next = host.battle.time));

            due();
            run(3000);

            // (Those packs struck down too; then the budget about the tear all but filled with
            // the player's own, some way off: room for one more)
            for (const [id, one] of [...host.wild]) {
                if (one.hellRift && host.battle.actor(id) && !host.battle.actor(id).dead) {
                    host.battle.afflict(id, "burn", { by: HOST_PLAYER, damage: 1e7 });
                }
            }

            run(1000);

            for (let k = bodies(host, "town", tear.at).length; k < BODIES.most - 1; k++) {
                host.battle.add({ id: `hireling-${k}`, kind: "follower", name: "Hireling", weapon: "sword", team: me.team, square: [Math.floor(tear.at[0]) + 30 + (k % 8), Math.floor(tear.at[1]) + 10 + Math.floor(k / 8)], map: "town", hp: 1e6, power: { melee: 1, ranged: 1 }, armor: 0 });
            }

            due();
            run(3000);
            due();
            run(3000);

            return host;
        });

    it("plays out the same step for step with the index asked and with everyone gone through", () => {
        const [indexed, everyone] = [game(), throughEveryone(game)];

        assertSame(indexed, everyone);

        const poured = indexed.events.filter((event) => event.type === "hellRift" && event.change === "poured");

        assert.ok(poured.length >= 3, `(${poured.length} packs poured)`);
        assert.equal(poured.at(-1).ids.length, 1, "(the last held to the budget's room)");
        assert.ok(indexed.host.battle.actors.length > 21 * 21, `(${indexed.host.battle.actors.length} in the battle)`);
        assert.ok(indexed.counts["packs.wild"] > 0 && indexed.counts["packs.wild"] <= everyone.counts["packs.wild"]);
        assert.ok(indexed.counts["bodies.actors"] > 0 && indexed.counts["bodies.actors"] < everyone.counts["bodies.actors"], `${indexed.counts["bodies.actors"]} gone through for the bodies about, ${everyone.counts["bodies.actors"]} before`);
    });
});

describe("a world of 25 players in fours, with fights and the wild about them (Host.indexing)", () => {
    const PLAYERS = 25;
    const STEPS = 800;

    // The world (seed 2), its 25 players four to a town, all its owners (so the fights are
    // theirs to begin), one in four out in the wilds 300 m from their town
    const begin = () => {
        const world = buildWorld({ seed: 2 });
        const homes = layoutOf(world.plan, PLAYERS, "towns");
        const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });
        const out = homes.map(({ race, at }, k) => ({ race, at: k % 4 === 3 ? nearestFree(squaresOf(world.maps.town), [Math.round(at[0] - 300), Math.round(at[1])], { within: 60 }) : at }));

        out.forEach(({ race, at }, k) => host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: k % 3 ? "sword" : "bow", boots: false }, square: at, map: "town", role: "owner" }));
        host.populate();

        return { host, homes: out };
    };

    // Played from step `from` to `to`: everyone sent somewhere near every five seconds, five
    // fights of six a side begun ten seconds in
    const play = ({ host, homes }, from, to) => {
        const steps = [];

        for (let step = from; step < to; step++) {
            const random = createRandom(step);

            if (step % 100 === 0) {
                homes.forEach(({ at }, k) => host.command(`p${k + 1}`, { type: "move", to: [Math.round(at[0] + (random.next() - 0.5) * 80), Math.round(at[1] + (random.next() - 0.5) * 80)] }));
            }

            if (step === 200) {
                for (let k = 0; k < PLAYERS; k += 5) {
                    assert.equal(host.command(`p${k + 1}`, { type: "fieldBattle", size: 6, facing: k }).ok, true, "(a fight begun)");
                }
            }

            steps.push([encode(host.advance(STEP_MS)), host.checksum()]);
        }

        return steps;
    };

    it("plays out the same step for step either way, and carried on from a snapshot at 20 s", () => {
        const indexed = begin();
        const first = play(indexed, 0, STEPS / 2);
        const kept = encode(indexed.host.snapshot());
        const second = play(indexed, STEPS / 2, STEPS);

        const everyone = throughEveryone(() => {
            const game = begin();

            return { steps: play(game, 0, STEPS), snapshot: encode(game.host.snapshot()) };
        });

        assertSame({ steps: [...first, ...second], snapshot: encode(indexed.host.snapshot()) }, everyone);

        const events = [...first, ...second].map(([text]) => text).join("");

        assert.ok(events.includes('"fieldBattle"') && events.includes('"attack"'), "(fights)");
        assert.ok(indexed.host.wild.size > 0 && indexed.host.packs.size > 0 && events.includes('"roused"'), "(the wild put out about them, in packs)");

        // (Carried on from the snapshot, the index made of a battle put back: the second half again)
        const again = { host: Host.restore(buildWorld({ seed: 2 }), decode(kept)), homes: indexed.homes };

        play(again, STEPS / 2, STEPS).forEach((step, k) => assert.deepEqual(step, second[k], `step ${STEPS / 2 + k}, carried on`));

        // (And the index, asked over the steps after, leaves no one out)
        const asked = assertWithinPlayed(indexed.host, createRandom(5), 20);

        assert.ok(asked > 100, `(${asked} askings answered by the index)`);
    });
});
