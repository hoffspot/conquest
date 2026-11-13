// The night's light made from what the battle keeps of who might carry it (client/js/core/host.js
// Host.bearing; generated/multiplayer_scaling_plan.md 1-11, its rest): the torches looked for
// among the soldiers alone, from the battle's own list of them (core/battle.js soldiers), and the
// Light spell's globes looked for only while one may be lasting on someone (lightUntil). Neither
// may ever be behind the battle, so a night of comings and goings plays out the same step for
// step either way, lit by the same lights in the same order: dusk falling and dawn coming in the
// middle of it, a field battle mustered, a town's soldiers let go and mustered again, a soldier
// fallen, one gone in by a door and out again, a hand filled and a hand freed, Lights put on,
// run out, ended, gone with their bearer and kept in a snapshot.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { elapsedOf } from "../client/js/core/daytime.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host } from "../client/js/core/host.js";
import { carriesTorch, LIGHT_REACH, torchesLit } from "../client/js/core/light.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { install, Probes, uninstall } from "../client/js/core/probe.js";
import { createRandom } from "../client/js/core/random.js";
import { decode, encode } from "../client/js/core/wire.js";
import { layoutOf } from "../scripts/load.js";

const PLAYERS = 6;
const STEPS = 1500;
const KEPT = 900;

// With everyone gone through for the light each step, as it was, what `play` gives
function throughEveryone(play) {
    assert.equal(Host.bearing, true, "Host.bearing is on");
    Host.bearing = false;

    try {
        return play();
    } finally {
        Host.bearing = true;
    }
}

// The world's clock put to `elapsed` ms
const at = (host, elapsed) => Object.assign(host.war, { turn: Math.floor(elapsed / 60000), clock: elapsed % 60000 });

// The first moment after `from` (ms of the world, to the second) the torches are lit (`lit`) or
// out, having been the other a second before
function turning(from, lit) {
    let elapsed = Math.ceil(from / 1000) * 1000;

    while (!(torchesLit(elapsed) === lit && torchesLit(elapsed - 1000) !== lit)) {
        elapsed += 1000;
    }

    return elapsed;
}

// The lights of a kind among a step's (their circles are [x, y, reach squared])
const lightsOf = (light, kind) => (light?.lit ?? []).filter(([, , reach]) => reach === LIGHT_REACH[kind] * LIGHT_REACH[kind]);

// Six players (seed 2: four in a town, two in another, all its owners), the clock twenty seconds
// before the torches are lit
function begin() {
    const world = buildWorld({ seed: 2 });
    const homes = layoutOf(world.plan, PLAYERS, "towns");
    const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });

    homes.forEach(({ race, at: square }, k) => host.join({ id: `p${k + 1}`, hero: { name: `P${k + 1}`, race, shape: {}, look: {}, weapon: k % 2 ? "bow" : "sword", boots: false }, square, map: "town", role: "owner" }));
    host.populate();
    at(host, turning(elapsedOf(host.war), true) - 20000);

    return { host, homes, notes: { soldier: {}, away: null } };
}

// The soldiers out in the world and standing, in the battle's order: those with a hand free for
// a torch, or (`free` false) those without
const soldiersOut = (host, free) => host.battle.actors.filter((actor) => actor.kind === "soldier" && actor.map === "town" && !actor.dead && carriesTorch(actor, true) === free);

// Played from step `from` to `to`: each step's events, the world's sum after it and the light
// it was played by. What's done to the world in the middle of it is done by the step it's at,
// and to whoever the world then has, so it's the same whichever step it's carried on from. With
// `ways`, each way the battle finds or takes is put there as it's told ([time, id, way]: what a
// host sends its copies, core/host.js #wire)
function play({ host, homes, notes }, from, to, ways = null) {
    const steps = [];
    const { battle } = host;
    const told = battle.onPath;

    if (ways) {
        battle.onPath = (id, way) => {
            ways.push([battle.time, id, structuredClone(way)]);
            told?.(id, way);
        };
    }

    for (let step = from; step < to; step++) {
        const random = createRandom(step);

        // (Everyone sent somewhere near every five seconds, after the snapshot too. A way found
        // by a world carried on from a snapshot isn't always the way the world it was taken of
        // finds: its navigation mesh begins again with no tiles, and a way goes by what tiles
        // are in (test/spots.test.js). So the one carried on takes the first's ways, as a copy
        // joined to a host does: `carried`, below)
        if (step % 100 === 0) {
            homes.forEach(({ at: [x, y] }, k) => host.players.has(`p${k + 1}`) && battle.actor(`p${k + 1}`).map === "town" && !notes.away?.includes(`p${k + 1}`) && host.command(`p${k + 1}`, { type: "move", to: [Math.round(x + (random.next() - 0.5) * 60), Math.round(y + (random.next() - 0.5) * 60)] }));
        }

        // (A field battle mustered: a dozen soldiers into the battle at once)
        if (step === 100) {
            assert.equal(host.command("p1", { type: "fieldBattle", size: 6, facing: 1 }).ok, true, "(a fight begun)");
        }

        // (Dark by now. A hand filled, and a hand freed)
        if (step === 500) {
            const [armed, bare] = [soldiersOut(host, true)[2], soldiersOut(host, false)[0]];

            notes.soldier = { armed: armed.id, bare: bare.id, was: bare.weapon };
            battle.rearm(armed.id, "bow");
            battle.rearm(bare.id, "sword");
        }

        // (One with a torch struck down; another gone in by a door, to wherever there's an inside)
        if (step === 520) {
            const [fallen, indoors] = soldiersOut(host, true).filter(({ id }) => id !== notes.soldier.bare);
            const inside = Object.keys(battle.maps).find((map) => map !== "town" && battle.actors.some((actor) => actor.map === map));

            Object.assign(notes.soldier, { fallen: fallen.id, indoors: indoors.id, from: [...indoors.square] });
            battle.afflict(fallen.id, "burn", { by: "p1", damage: 1e7 });
            assert.ok(battle.place(indoors.id, inside, battle.actors.find((actor) => actor.map === inside).square), "(a soldier gone indoors)");
        }

        // (Lights: one that runs out, one ended early on a soldier, one whose bearer leaves the
        // world with it, and one that outlasts the snapshot)
        if (step === 560) {
            assert.ok(battle.buff("p1", "light", { ms: 6000 }) && battle.buff(soldiersOut(host, true)[0].id, "light", { ms: 60000 }) && battle.buff("p3", "light", { ms: 60000 }) && battle.buff("p4", "light", { ms: 30000 }));
            notes.soldier.lit = soldiersOut(host, true)[0].id;
        }

        if (step === 640) {
            assert.equal(battle.unbuff(notes.soldier.lit, "light"), true);
        }

        if (step === 660) {
            host.leave("p3");
        }

        // (The two of the second town gone far off: its soldiers let go; then back, and mustered
        // again; and the one indoors out by the door again)
        if (step === 600 || step === 800) {
            const [x, y] = homes[4].at;
            const there = step === 600 ? nearestFree(squaresOf(host.world.maps.town), [Math.round(x - 420), Math.round(y)], { within: 80 }) : [x, y];

            notes.away = step === 600 ? ["p5", "p6"] : null;
            assert.ok(battle.place("p5", "town", there) && battle.place("p6", "town", there), "(the two put elsewhere)");
        }

        if (step === 820) {
            assert.ok(battle.place(notes.soldier.indoors, "town", notes.soldier.from), "(the soldier out again)");
            battle.rearm(notes.soldier.bare, notes.soldier.was);
        }

        // (And the night brought on to twenty seconds before the torches go out)
        if (step === 1000) {
            at(host, turning(elapsedOf(host.war), false) - 20000);
        }

        steps.push([encode(host.advance(STEP_MS)), host.checksum(), encode(battle.light), battle.light, host.mustered.size, battle.actors.length]);
    }

    battle.onPath = told;

    return steps;
}

// The whole night, with what the light's pass went through counted, a snapshot taken at KEPT and
// the ways found after it kept (`ways`), for a world carried on from it to take
function night() {
    const game = begin();
    let ticks = 0;
    const probes = install(new Probes({ clock: () => ticks++ }));

    try {
        const first = play(game, 0, KEPT);
        const kept = encode({ world: game.host.snapshot(), notes: game.notes });

        const ways = [];

        return { game, steps: [...first, ...play(game, KEPT, STEPS, ways)], kept, ways, snapshot: encode(game.host.snapshot()), counts: probes.toJSON().counts };
    } finally {
        uninstall();
    }
}

// Two nights the same, step for step: the first step that differs said, if any does
function assertSame(a, b, from = 0) {
    assert.equal(a.length, b.length, "as many steps");

    const differs = a.findIndex((step, k) => step[0] !== b[k][0] || step[1] !== b[k][1] || step[2] !== b[k][2]);

    assert.equal(differs, -1, `the nights differ from step ${from + differs}${differs < 0 ? "" : told(a[differs]) === told(b[differs]) ? " (the light alone)" : ""}`);
}

const told = ([events, sum]) => `${events}${sum}`;

describe("a night of comings and goings, lit from what the battle keeps and by going through everyone (Host.bearing)", () => {
    let kept;
    let everyone;

    before(() => {
        kept = night();
        everyone = throughEveryone(night);
    });

    it("plays out the same step for step either way, lit by the same lights in the same order, and ends the same", () => {
        assertSame(kept.steps, everyone.steps);
        assert.equal(kept.snapshot, everyone.snapshot, "the world at the end");
    });

    it("had everything in it a list kept beside the battle could be behind on", () => {
        const { steps, game } = kept;
        const { host, notes } = game;
        const lights = steps.map(([, , , light]) => light);
        const torches = lights.map((light) => lightsOf(light, "torch").length);
        const globes = lights.map((light) => lightsOf(light, "globe").length);
        const events = steps.map(([text]) => text).join("");

        // (Dusk fell and dawn came in the middle of it: no torches, torches, none again)
        assert.equal(torches[0], 0, "(not dark yet)");
        assert.ok(lights[0] === null || lights[0].sky > lights[450].sky, "(and darker later)");
        assert.ok(torches[450] > 4, `(${torches[450]} torches near them in the dark)`);
        assert.equal(torches.at(-1), 0, "(the torches out by the end)");
        assert.ok(torches.findLastIndex((count) => count > 0) > 1300, "(lit till near the end)");

        // (A field battle's soldiers came into the battle, and went)
        assert.ok(events.includes('"fieldBattle"'), "(a field battle)");
        assert.ok(steps[100][5] >= steps[99][5] + 12, "(its soldiers added)");

        // (A hand filled, a hand freed, one fallen, one indoors and out again)
        assert.equal(host.battle.actor(notes.soldier.fallen)?.dead ?? true, true, "(a soldier fallen)");
        assert.ok(notes.soldier.armed && notes.soldier.bare && notes.soldier.indoors && notes.soldier.lit);
        assert.ok(torches[519] !== torches[499] || torches[521] !== torches[519], "(the torches changed with them)");

        // (A town's soldiers let go, and mustered again)
        const mustered = steps.map((each) => each[4]);

        assert.ok(Math.min(...mustered.slice(600, 800)) < mustered[599], `(a town's soldiers let go: ${mustered[599]} towns' out, then ${Math.min(...mustered.slice(600, 800))})`);
        assert.ok(mustered[KEPT] > Math.min(...mustered.slice(600, 800)), "(and mustered again)");

        // (Lights put on, run out, ended and gone with their bearer; one outlasting the snapshot)
        assert.equal(globes[559], 0);
        assert.ok(globes[561] >= 3, `(${globes[561]} globes)`);
        assert.ok(globes[700] < globes[561] && globes[700] >= 1, "(some gone: run out, ended, left with)");
        assert.ok(globes[KEPT + 1] >= 1, "(one lasting past the snapshot)");
        assert.equal(globes[1300], 0, "(and none later)");
        assert.equal(host.players.has("p3"), false);
    });

    it("goes through the soldiers, and everyone only while a Light may be lasting, where it went through everyone each step", () => {
        assert.ok(kept.counts["light.actors"] > 0);
        assert.ok(kept.counts["light.actors"] < everyone.counts["light.actors"] * 0.75, `${kept.counts["light.actors"]} gone through, ${everyone.counts["light.actors"]} before`);
        assert.equal(kept.counts["light.pairs"], everyone.counts["light.pairs"], "(the lights measured against players are the same)");
    });

    it("carries on the same from a snapshot taken in the dark with a Light still lasting, either way, its players sent about as before", () => {
        const second = kept.steps.slice(KEPT);

        // (The world carried on is a copy of the first, as one joined to it is: it takes the
        // first's ways as they were found, core/netplay.js Joining.attach, and finds none)
        const carried = (snapshot) => {
            const { world, notes } = decode(snapshot);
            const host = Host.restore(buildWorld({ seed: 2 }), world);
            const taken = [];

            host.replaying();
            host.replay.push(...structuredClone(kept.ways));

            const steps = play({ host, homes: kept.game.homes, notes }, KEPT, STEPS, taken);

            assert.equal(host.replay.length, 0, "(every way of the first's taken)");
            assert.deepEqual(taken, kept.ways, "(and no other)");

            return steps;
        };

        // (Ways there were, the players' among them: the move orders after the snapshot)
        assert.ok(kept.ways.length > 100, `(${kept.ways.length} ways found after the snapshot)`);
        assert.ok(new Set(kept.ways.filter(([, id]) => /^p\d$/.test(id)).map(([time]) => time)).size >= 5, "(players sent about after it, five times and more)");
        assertSame(carried(kept.kept), second, KEPT);
        assertSame(throughEveryone(() => carried(kept.kept)), second, KEPT);
        assert.deepEqual(everyone.ways, kept.ways, "(the same ways found either way)");
    });

    it("keeps the battle's list of its soldiers as going through everyone finds them, whatever's kept in place or made again", () => {
        const { battle } = kept.game.host;
        const through = () => battle.actors.filter((actor) => actor.kind === "soldier");

        assert.ok(through().length > 10);
        assert.deepEqual(battle.soldiers(), through());

        // (One added, one taken out, with the list brought up to date in place; then with it
        // made again each time, Battle.mustering off)
        for (const mustering of [true, false]) {
            Battle.mustering = mustering;

            try {
                battle.add({ id: `recruit-${mustering}`, kind: "soldier", name: "Recruit", weapon: "sword", team: through()[0].team, square: [...through()[0].square], map: "town" });
                assert.deepEqual(battle.soldiers(), through());
                assert.equal(battle.soldiers().at(-1).id, `recruit-${mustering}`);
                battle.remove(through()[1].id);
                assert.deepEqual(battle.soldiers(), through());
                battle.removeAll([through()[0].id, through()[3].id]);
                assert.deepEqual(battle.soldiers(), through());
            } finally {
                Battle.mustering = true;
            }
        }

        // (And the latest a Light lasts is never earlier than any that's on anyone)
        const latest = () => Math.max(-Infinity, ...battle.actors.flatMap(({ buffs }) => buffs.filter(({ kind }) => kind === "light").map(({ until }) => until)));

        assert.ok(battle.lightUntil() >= latest());
        battle.buff(through()[0].id, "light", { ms: 500000 });
        assert.equal(battle.lightUntil(), battle.time + 500000);
        assert.equal(battle.lightUntil(), latest());

        // (Ended early, it's left late, never early; and a battle carried on from a snapshot
        // makes it again of whoever has one)
        battle.unbuff(through()[0].id, "light");
        assert.ok(battle.lightUntil() >= latest());
        battle.buff(through()[2].id, "light", { ms: 7000 });

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(kept.game.host.snapshot()))).battle;

        assert.equal(again.lightUntil(), battle.time + 7000);
        assert.deepEqual(again.soldiers().map(({ id }) => id), through().map(({ id }) => id));
    });
});
