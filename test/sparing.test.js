// The battle's step made cheaper with nothing changed (client/js/core/battle.js; generated/
// multiplayer_scaling_plan.md 1-16 to 1-19): nothing made to throw away where it needn't be
// (Battle.sparing), the mesh's answer for where a walker stands remembered while it stands there
// (Battle.remembering), fewer goings through everyone (Battle.mustering), and the players near
// asked of the index (Battle.indexing). Each plays the old form with its switch off, and a walk
// through a city's crowd, three players among its folk and soldiers with wolves let loose in it,
// comes out the same step for step either way: every step's events, the world's sum as it goes,
// and all of it at the end. Counts are asked, never times.
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
 * while and the wolves set alight. With `cap`, the overworld's navigation keeps only that many
 * tiles, so those the walkers leave are let go and baked again as they come back. Resolves to
 * every step's events and the world's sum every tenth step (`steps`), the world at the end
 * (`snapshot`), the work counted (`counts`), and what the navigation baked (`baked`).
 */
function cityWalk({ steps = 400, cap = null } = {}) {
    const world = buildWorld({ seed: 2 });
    const overworld = world.maps.town;
    const place = world.plan.places.find(({ id }) => id === CITY);
    const host = new Host(world, { populate: false });
    const squares = squaresOf(overworld);
    const at = (dx, dy) => nearestFree(squares, [Math.round(place.at[0] + dx), Math.round(place.at[1] + dy)], { within: 40 });
    const navigation = navigatorOf(overworld);
    const played = [];

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
            if (step % 60 === 0) {
                for (let k = 0; k < PLAYERS; k++) {
                    const [dx, dy] = WAYS[(step / 60 + 2 * k) % WAYS.length];

                    host.command(`p${k + 1}`, { type: "move", to: at(dx, dy) });
                }
            }

            // (Wolves among the folk, who run from them; the guards and the players fight them)
            if (step === 20) {
                for (let k = 0; k < 6; k++) {
                    host.battle.add({ id: `wolf-${k}`, kind: "beast", team: "wild", weapon: "claws", square: at(8 + (k % 3) * 2, -6 + Math.floor(k / 3) * 2), ai: "wild", hp: 90, wild: { creature: "wolf", tier: 2, temper: "aggressive", guard: 0, roam: 6, leash: 40, pack: null, leader: null } });
                }
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

    return { host, steps: played, snapshot: sha(encode(host.snapshot())), counts: probes.toJSON().counts, baked: navigation.baked, events: played.map(([events]) => events).join("") };
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

// Two walks the same, step for step: the first step that differs said, if any does
function assertSame(a, b) {
    const differs = a.steps.findIndex((step, k) => step[0] !== b.steps[k][0] || step[1] !== b.steps[k][1]);

    assert.equal(differs, -1, `the walks differ from step ${differs}`);
    assert.equal(a.snapshot, b.snapshot, "the world at the end");
}

describe("the battle's step with nothing made to throw away (core/battle.js Battle.sparing, plan 1-16)", () => {
    it("walks a city's crowd step for step as the forms that made them did", () => {
        const sparing = cityWalk();
        const spendthrift = without("sparing", () => cityWalk());

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
