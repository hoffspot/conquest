// The battle's step made cheaper with nothing changed (client/js/core/battle.js; generated/
// multiplayer_scaling_plan.md 1-16 to 1-20): nothing made to throw away where it needn't be
// (Battle.sparing), the mesh's answer for where a walker stands remembered while it stands there
// (Battle.remembering), fewer goings through everyone (Battle.mustering), the players near
// asked of the index (Battle.indexing), and the folk looking for danger only where someone
// could frighten them (Battle.counting: test/counting.test.js brings danger to them by every
// way). Each plays the old form with its switch off, and a walk through a city's crowd, three
// players among its folk and soldiers with wolves let loose in it, comes out the same step for
// step either way: every step's events, the world's sum as it goes, and all of it at the end.
// Counts are asked, never times.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host } from "../client/js/core/host.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { install, Probes, uninstall } from "../client/js/core/probe.js";
import { encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword", boots: false });
const CITY = "human-city-1";
const PLAYERS = 3;

// Where the players are sent, in turn (metres from the city's middle): through its streets and
// its market, across each other's ways
const WAYS = [
    [18, 6],
    [-14, 12],
    [4, -20],
    [-22, -8],
    [10, 16],
    [0, 0],
];

const sha = (text) => createHash("sha1").update(text).digest("hex");

/**
 * A walk through the city's crowd, `steps` long: three players come into its middle, sent about
 * it every three seconds, wolves let loose among the folk a second in, one player unseen for a
 * while and the wolves set alight. With `churn`, players come and go and one's struck down in the
 * middle of it. With `cap`, the overworld's navigation keeps only that many
 * tiles, so those the walkers leave are let go and baked again as they come back. Resolves to
 * every step's events and the world's sum every tenth step (`steps`), the world at the end
 * (`snapshot`), the work counted (`counts`), how many of the navigation's tiles were let go and
 * put in again (`rebaked`), how many it holds at the end (`tiles`), and every tile put in or
 * let go with the step it was in, and those it holds from the longest unused (`used`).
 */
function cityWalk({ steps = 400, cap = null, churn = false } = {}) {
    const world = buildWorld({ seed: 2 });
    const overworld = world.maps.town;
    const place = world.plan.places.find(({ id }) => id === CITY);
    const host = new Host(world, { populate: false });
    const squares = squaresOf(overworld);
    const at = (dx, dy) => nearestFree(squares, [Math.round(place.at[0] + dx), Math.round(place.at[1] + dy)], { within: 40 });
    const navigation = navigatorOf(overworld);
    const played = [];

    // (How often each tile was put in: more than once, for one let go and baked again; and every
    // tile put in or let go, in order, with the step it was in)
    const added = new Map();
    const tiles = [];
    const [add, drop] = [navigation.add.bind(navigation), navigation.drop.bind(navigation)];
    let playing = 0;

    navigation.add = (tx, ty, data) => {
        if (!navigation.has(tx, ty)) {
            added.set(`${tx},${ty}`, (added.get(`${tx},${ty}`) ?? 0) + 1);
            tiles.push(`${playing}+${tx},${ty}`);
        }

        add(tx, ty, data);
    };

    navigation.drop = (tx, ty) => {
        tiles.push(`${playing}-${tx},${ty}`);
        drop(tx, ty);
    };

    if (cap !== null) {
        navigation.least = cap;
        navigation.keepTiles(cap);
    }

    for (let k = 0; k < PLAYERS; k++) {
        host.join({ id: `p${k + 1}`, hero: { ...HERO, name: `P${k + 1}`, weapon: ["sword", "bow", "staff"][k] }, square: at(k * 6 - 6, k * 4), map: "town" });
    }

    host.populate();

    let ticks = 0;
    const probes = install(new Probes({ clock: () => ticks++ }));

    try {
        for (let step = 0; step < steps; step++) {
            playing = step;

            if (step % 60 === 0) {
                for (let k = 0; k < PLAYERS; k++) {
                    const [dx, dy] = WAYS[(step / 60 + 2 * k) % WAYS.length];

                    if (host.players.has(`p${k + 1}`)) {
                        host.command(`p${k + 1}`, { type: "move", to: at(dx, dy) });
                    }
                }
            }

            // (Wolves among the folk, who run from them; the guards and the players fight them)
            if (step === 20) {
                for (let k = 0; k < 6; k++) {
                    host.battle.add({ id: `wolf-${k}`, kind: "beast", team: "wild", weapon: "claws", square: at(8 + (k % 3) * 2, -6 + Math.floor(k / 3) * 2), ai: "wild", hp: 90, wild: { creature: "wolf", tier: 2, temper: "aggressive", guard: 0, roam: 6, leash: 40, pack: null, leader: null } });
                }
            }

            // (Players coming and going, and one struck down: the list kept of them, #cast)
            if (churn && step === 100) {
                host.join({ id: "p4", hero: { ...HERO, name: "P4" }, square: at(2, 2), map: "town" });
                host.command("p4", { type: "move", to: at(12, -4) });
            }

            if (churn && step === 160) {
                host.battle.afflict("p3", "burn", { by: "wolf-3", damage: 100000 });
            }

            if (churn && step === 220) {
                host.leave("p2");
            }

            if (churn && step === 280) {
                host.join({ id: "p5", hero: { ...HERO, name: "P5", weapon: "bow" }, square: at(-4, 6), map: "town" });
            }

            // (A spell lasting on one, and something ailing others: what #ail goes through)
            if (step === 40) {
                host.battle.buff("p2", "invisibility", { ms: 4000 });
                host.battle.afflict("wolf-0", "burn", { by: "p1", damage: 30 });
                host.battle.afflict("wolf-1", "fear", { by: "p1" });
                host.battle.afflict("p3", "slow", { by: "wolf-2" });
                host.battle.afflict("p1", "venom", { by: "wolf-2" });
            }

            const events = host.advance(STEP_MS);

            played.push(step % 10 === 9 ? [encode(events), host.checksum()] : [encode(events)]);
        }
    } finally {
        uninstall();
    }

    return { host, steps: played, snapshot: sha(encode(host.snapshot())), counts: probes.toJSON().counts, rebaked: [...added.values()].filter((times) => times > 1).length, tiles: navigation.tiles.size, used: `${tiles.join(" ")} | ${[...navigation.tiles.keys()].join(" ")}`, events: played.map(([events]) => events).join("") };
}

// The same walk with one of the battle's switches off (`name`), the old form played
function without(name, walk) {
    assert.equal(Battle[name], true, `Battle.${name} is on`);
    Battle[name] = false;

    try {
        return walk();
    } finally {
        Battle[name] = true;
    }
}

// A walk with the folk of buildings no player's in about their rounds unseen, as they were
// when these walks were written (Battle.idling off: plan 1-22, the owner's ruling of 14
// November 2026, has them stand till someone comes in). The city's taverns and shops are where
// the folk who sit act, and where most of the folk looked about with no one to fear: so what a
// walk must show of those is shown of the old form, and the walk as the game plays it now is
// held to come out the same beside it. And those folk in the battle at all, as they were then:
// made as a building's got ready, 22 m from its door, where they're now made only as a player's
// told to go in (Host.peopling off: plan 1-23, the owner's ruling of the same day), and these
// walkers go into nothing
const unseen = (walk) => peopled(() => without("idling", walk));

// A walk with a building's folk made as it's got ready and kept till it's let go, as they were
function peopled(walk) {
    assert.equal(Host.peopling, true, "Host.peopling is on");
    Host.peopling = false;

    try {
        return walk();
    } finally {
        Host.peopling = true;
    }
}

// Two walks the same, step for step: the first step that differs said, if any does
function assertSame(a, b) {
    const differs = a.steps.findIndex((step, k) => step[0] !== b.steps[k][0] || step[1] !== b.steps[k][1]);

    assert.equal(differs, -1, `the walks differ from step ${differs}`);
    assert.equal(a.snapshot, b.snapshot, "the world at the end");
}

describe("the battle's step with nothing made to throw away (core/battle.js Battle.sparing, plan 1-16)", () => {
    it("walks a city's crowd step for step as the forms that made them did", () => {
        // (As the game plays it now, the folk indoors standing: the same either way. Then with
        // them about their rounds unseen, where the walk has all it's to show)
        assertSame(
            cityWalk(),
            without("sparing", () => cityWalk()),
        );

        const sparing = unseen(() => cityWalk());
        const spendthrift = unseen(() => without("sparing", () => cityWalk()));

        assertSame(sparing, spendthrift);

        // (And it was a crowd walked through: folk about their business and afraid, walkers
        // stepping aside onto the mesh, ways found, wolves fought and one unseen)
        const { counts, events } = sparing;

        assert.ok(counts["battle.actors.routine"] / sparing.steps.length > 30, `${counts["battle.actors.routine"]} of the folk stepped`);
        assert.ok(counts["battle.actors.patrol"] > 0 && counts["battle.actors.wild"] > 0);
        assert.ok(counts["battle.strides"] > 2000, `${counts["battle.strides"]} strides`);
        assert.ok(counts["battle.meshAsks"] > 100, `${counts["battle.meshAsks"]} askings of the mesh`);
        assert.ok(counts["battle.paths.routine"] > 20 && counts["battle.playerAsks"] > 100);
        assert.ok(sparing.host.battle.actors.some((actor) => actor.ai === "routine" && actor.calmAt > 0), "some of the folk were afraid");

        for (const type of ["attack", "hit", "death", "unbuffed", "ail", "afflicted", "act", "rest"]) {
            assert.ok(events.includes(`"type":"${type}"`), `(a "${type}" event)`);
        }
    });
});

describe("the mesh's answer for where a walker stands, remembered (core/battle.js Battle.remembering, plan 1-17)", () => {
    // (So few tiles kept that those the walkers leave are let go, and baked again as they come back)
    const CAP = 6;

    it("walks a city's crowd step for step as asking the mesh every time did, tiles let go and baked again in the middle of it", () => {
        const remembering = cityWalk({ cap: CAP, steps: 300 });
        const asking = without("remembering", () => cityWalk({ cap: CAP, steps: 300 }));

        assertSame(remembering, asking);
        assert.ok(remembering.rebaked > 3, `${remembering.rebaked} tiles let go and baked again`);
        assert.equal(remembering.used, asking.used, "the same tiles put in and let go in the same steps, and used in the same order");
        assert.ok(remembering.tiles <= CAP);

        // (Fewer askings, the rest answered from what it said of the same place before, though
        // every tile baked again has it asked; and with the switch off nothing's remembered)
        const [asked, kept, was] = [remembering.counts["battle.meshAsks"], remembering.counts["battle.meshKept"], asking.counts["battle.meshAsks"]];

        assert.equal(asking.counts["battle.meshKept"] ?? 0, 0);
        assert.equal(asked + kept, was, "every asking made, or spared");
        assert.ok(was > 500 && kept > was / 5, `the mesh asked ${asked} times where it was ${was}`);
    });

    it("walks it the same with every tile kept, at little more than half the askings", () => {
        const remembering = cityWalk();
        const asking = without("remembering", () => cityWalk());
        const [asked, kept, was] = [remembering.counts["battle.meshAsks"], remembering.counts["battle.meshKept"], asking.counts["battle.meshAsks"]];

        assertSame(remembering, asking);
        assert.equal(remembering.rebaked, 0);
        assert.equal(remembering.used, asking.used, "the tiles used in the same order");
        assert.equal(asked + kept, was, "every asking made, or spared");

        // (Each step tried asks of where the walker stands and of where it would step: the first
        // is what's remembered, so half is the most there is to spare)
        assert.ok(was > 1000 && asked <= was * 0.55, `the mesh asked ${asked} times where it was ${was}`);
    });
});

describe("fewer goings through everyone (core/battle.js Battle.mustering, plan 1-18)", () => {
    it("walks a city's crowd step for step as going through everyone for each thing did, players coming, going and falling", () => {
        const mustering = cityWalk({ churn: true });
        const twice = without("mustering", () => cityWalk({ churn: true }));

        assertSame(mustering, twice);

        // (And the players came and went: one fell, one left, two came)
        const { events, host } = mustering;

        assert.deepEqual([...host.players.keys()].sort(), ["p1", "p3", "p4", "p5"]);
        assert.ok(events.includes('"type":"death","time":') && /"type":"death"[^}]*"id":"p3"/.test(events), "(p3 was struck down)");
        assert.equal(host.battle.actors.filter(({ kind }) => kind === "player").length, 4);
    });

    it("counts the same work either way, and makes the index afresh no oftener", () => {
        const [mustering, twice] = [cityWalk({ steps: 200 }), without("mustering", () => cityWalk({ steps: 200 }))];

        assert.deepEqual(mustering.counts, twice.counts);
    });
});

describe("the players near asked of the index (core/battle.js Battle.indexing, plan 1-19)", () => {
    it("walks a city's crowd step for step as going through every player for each asking did, players coming, going and falling", () => {
        const indexed = cityWalk({ churn: true });
        const everyone = without("indexing", () => cityWalk({ churn: true }));

        assertSame(indexed, everyone);

        // (Asked as often, of far fewer: with every player in the one city most are near, but
        // each asking measured them all, and now only those the index has within reach)
        assert.equal(indexed.counts["battle.playerAsks"], everyone.counts["battle.playerAsks"]);
        assert.ok(indexed.counts["battle.playerPairs"] > 0 && indexed.counts["battle.playerPairs"] < everyone.counts["battle.playerPairs"], `${indexed.counts["battle.playerPairs"]} players measured where it was ${everyone.counts["battle.playerPairs"]}`);
    });
});

describe("the folk's look for danger only where someone could frighten them (core/battle.js Battle.counting, plan 1-20)", () => {
    it("walks a city's crowd step for step as the folk looking on every map did, players coming, going and falling", () => {
        // (As the game plays it now, no one indoors looks, and the count leaves next to nothing
        // out: the same walk either way. Then with the folk indoors about their rounds unseen,
        // which is where the count has its work)
        const [now, nowLooking] = [cityWalk({ churn: true }), without("counting", () => cityWalk({ churn: true }))];

        assertSame(now, nowLooking);

        // (And with the folk of the city's buildings in the battle and held, as they were while
        // a building's were made 22 m from its door: Host.peopling off, plan 1-23)
        const [held, heldLooking] = peopled(() => [cityWalk({ churn: true }), without("counting", () => cityWalk({ churn: true }))]);

        assertSame(held, heldLooking);
        assert.ok(held.counts["battle.held"] / held.steps.length > 20, `${held.counts["battle.held"]} held`);
        assert.ok(now.counts["battle.held"] < held.counts["battle.held"], "(fewer to hold, no one made till a door's gone into)");

        const counting = unseen(() => cityWalk({ churn: true }));
        const looking = unseen(() => without("counting", () => cityWalk({ churn: true })));

        assertSame(counting, looking);

        // (Fewer than half the searches, for the folk indoors with no one but folk about them;
        // and nothing else counted differently, the index made and brought up to date no
        // oftener: only the searches and whom they looked at)
        const differing = Object.keys(looking.counts).filter((name) => looking.counts[name] !== counting.counts[name]);

        assert.deepEqual(differing.sort(), ["battle.searchLooks", "battle.searches"]);
        assert.ok(counting.counts["battle.searches"] < looking.counts["battle.searches"] / 2, `${counting.counts["battle.searches"]} searches where there were ${looking.counts["battle.searches"]}`);
        assert.ok(counting.counts["battle.searchLooks"] < looking.counts["battle.searchLooks"]);
    });
});

describe("a player back on their feet in the middle of a step (core/battle.js #upright, plan 1-19)", () => {
    // A player struck down among soldiers who'd go for them, some seeing further than most
    // (#playerSeen), and up again where they fell from: in the step they rise they aren't among
    // the players standing as it began, so no one's drawn to them till the next, whether the
    // players near are asked of the index or all gone through
    const rising = () => {
        const battle = new Battle({ blocked: Array.from({ length: 80 }, () => new Uint8Array(80)) }, { seed: 5 });
        const steps = [];

        battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [40, 40], hp: 60, armed: true });
        battle.add({ id: "far", kind: "player", team: "a", weapon: "bow", square: [8, 8], hp: 60 });

        for (let k = 0; k < 6; k++) {
            battle.add({ id: `s${k}`, kind: "soldier", team: "b", weapon: k % 2 ? "bow" : "sword", square: [34 + k * 2, 47 + (k % 2) * 2], ai: "patrol", patrol: [[34 + k * 2, 47 + (k % 2) * 2]], leash: 30, hp: 4000, ...(k < 3 ? { sight: 20 } : {}) });
        }

        for (let step = 0; step < 1600; step++) {
            steps.push(JSON.stringify([battle.advance(STEP_MS), battle.actors.map((actor) => [actor.x, actor.y, actor.hp, actor.dead, actor.target])]));
        }

        return { steps, events: steps.join("") };
    };

    it("is gone for from the step after, exactly as when every player's gone through", () => {
        const indexed = rising();
        const everyone = without("indexing", rising);
        const differs = indexed.steps.findIndex((step, k) => step !== everyone.steps[k]);

        assert.equal(differs, -1, `the battles differ from step ${differs}`);
        assert.ok(indexed.events.split('"type":"respawn"').length > 2, "(the player fell and rose, more than once)");
        assert.ok(/"type":"death"[^}]*"id":"hero"/.test(indexed.events));
    });
});
