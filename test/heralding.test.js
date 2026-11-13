// The look to the war's messengers, sparing what it needn't do (client/js/core/host.js
// Host.heralding; generated/multiplayer_scaling_plan.md 1-31): those in the battle gone through
// once for all the players a messenger might come to, to say who's in a fight, where they were
// gone through for each player; and what's on the war's roads asked whether a player could meet
// it only if it's within a mission's reach of them (core/missions.js missionsNear), where every
// one on a road was asked for every player. Neither changes an answer, so a world plays out the
// same step for step either way: twelve players by an enemy camp, two of them with a fight on
// about them, messengers sent to those who may hear one and to none who's set upon; and a war
// 40 turns old gives every one of a hundred players spread, of every people, the same missions.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host, MESSENGER } from "../client/js/core/host.js";
import { ON_THE_ROAD } from "../client/js/core/hurry.js";
import { MISSION_REACH, missionsNear } from "../client/js/core/missions.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { COUNTERS, install, Probes, uninstall } from "../client/js/core/probe.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { STAGES, TURN_MS } from "../client/js/core/war/war.js";
import { encode } from "../client/js/core/wire.js";
import { RACE } from "../client/js/core/worldplan/plan.js";
import { layoutOf } from "../scripts/load.js";

const PLAYERS = 12;
const id = (k) => `p${k + 1}`;

// A character stood somewhere, as the messengers' own tests stand them (test/messengers.test.js)
const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// The world (seed 2), twelve humans in it, all its owners (so a fight is theirs to begin), with
// an orcish camp 400 m from the start town's edge, at war with them, and the players out in the
// open 250 m beyond it, 30 m from one another; and no messenger looked to till it's said
// (`messengersAt`)
function begin() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules: { rest: "everyone", debug: "owner" } });

    for (let k = 0; k < PLAYERS; k++) {
        host.join({ id: id(k), hero: { name: `P${k + 1}`, race: "human", shape: {}, look: {}, weapon: "sword", boots: false }, role: "owner" });
    }

    host.populate();

    const middle = host.world.stamp.middle;
    const radius = SETTLEMENT_KINDS[host.world.start.kind].radius;
    const at = [middle[0] + radius + 400, middle[1] + 5];

    host.war.relations["human|orc"] = { state: "hostile", since: 0 };
    host.war.stage = STAGES.length - 1;
    host.war.camps.push({ id: "camp-900", realm: "orc", at, guard: 6, built: 0, done: 0, toward: host.world.start.id, used: 1e6, skirmished: 1e6 });

    for (let k = 0; k < PLAYERS; k++) {
        put(host.battle.actor(id(k)), [Math.floor(at[0] + 250 + (k % 4) * 30), Math.floor(at[1] + Math.floor(k / 4) * 30)]);
    }

    host.messengersAt = Infinity;

    return host;
}

// The players someone near is set on, who are set on no one themselves: gone through as the host
// went through everyone for each (core/host.js #beset)
const setUpon = (host) =>
    Array.from({ length: PLAYERS }, (_, k) => host.battle.actor(id(k)))
        .filter((actor) => actor.target === null && host.battle.actors.some((other) => !other.dead && other.target === actor.id && other.map === actor.map && Math.hypot(other.x - actor.x, other.y - actor.y) <= 40))
        .map((actor) => actor.id);

// A game played, its passes' work counted: two of the players begin a fight a second in; the
// messengers are looked to from step `release` on (or, none given, from the first step after
// five seconds at which a player who's set on no one has someone near set on them: which step
// that was is given back), and it's played three looks more. Every step's events and the world's
// sum after it, and all of it at the end
function played(release = null) {
    const steps = [];
    const events = [];
    let ticks = 0;
    const probes = install(new Probes({ clock: () => ticks++ }));
    const host = begin();
    let [released, upon] = [release, []];

    try {
        for (let step = 0; step < (released ?? 1200) + (3 * MESSENGER.every) / STEP_MS; step++) {
            if (step === 20) {
                for (const k of [5, 10]) {
                    assert.equal(host.command(id(k), { type: "fieldBattle", size: 6, facing: Math.PI / 2 }).ok, true, "(a fight begun)");
                }
            }

            if (step === released || (released === null && step >= 100 && setUpon(host).length > 0)) {
                released = step;
                upon = setUpon(host);
                host.messengersAt = 0;
            }

            const happened = host.advance(STEP_MS);

            steps.push([encode(happened), host.checksum()]);
            events.push(...happened);
        }
    } finally {
        uninstall();
    }

    return { host, steps, events, released, upon, snapshot: encode(host.snapshot()), counts: probes.toJSON().counts };
}

describe("who's in a fight as the war's messengers are looked to (Host.heralding)", () => {
    it("plays out the same step for step with the battle gone through once for all the players, and once for each", () => {
        assert.equal(Host.heralding, true, "Host.heralding is on");
        assert.ok(COUNTERS.includes("messengers.actors"));

        const once = played();

        assert.ok(once.released !== null && once.upon.length > 0, "(a player with someone near set on them, as the messengers were looked to)");

        Host.heralding = false;

        let each;

        try {
            each = played(once.released);
        } finally {
            Host.heralding = true;
        }

        assert.equal(once.steps.length, each.steps.length, "as many steps");

        const differs = once.steps.findIndex((step, k) => step[0] !== each.steps[k][0] || step[1] !== each.steps[k][1]);

        assert.equal(differs, -1, `the games differ from step ${differs}`);
        assert.equal(once.snapshot, each.snapshot, "the world at the end");
        assert.deepEqual(each.upon, once.upon);

        // (Messengers came for those who may hear one, and for none who was set upon)
        const coming = once.events.filter(({ type, change }) => type === "messenger" && change === "coming");
        const sentTo = new Set(coming.flatMap(({ players }) => players));

        assert.ok(coming.length >= 4, `(${coming.length} messengers sent)`);
        assert.deepEqual(once.upon.filter((player) => sentTo.has(player)), [], "none to one set upon");
        assert.ok(sentTo.size < PLAYERS, "(nor to everyone)");

        // (And the work: the battle gone through once a look, where it was once for each player
        // who's set on no one and may otherwise hear a messenger)
        const roster = once.host.battle.actors.length;

        assert.ok(once.counts["messengers.actors"] > 0 && once.counts["messengers.actors"] <= 3 * (roster + PLAYERS), `${once.counts["messengers.actors"]} gone through, ${roster} in the battle`);
        assert.ok(each.counts["messengers.actors"] >= 4 * once.counts["messengers.actors"], `${each.counts["messengers.actors"]} before, ${once.counts["messengers.actors"]} now`);
    });

    it("finds the same missions near every one of a hundred players spread, of every people, in a war 40 turns old, with the roads asked only of what's within reach", () => {
        // (The world played with no one in it, as its own rules play it: its war's convoys,
        // wagons, reinforcements and envoys on their roads)
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.populate();

        for (let ms = 0; ms < 40 * TURN_MS; ms += STEP_MS) {
            host.advance(STEP_MS);
        }

        const { war } = host;
        const roads = war.forces.filter((force) => ON_THE_ROAD[force.kind] && (force.size > 0 || force.kind === "envoy"));
        const places = layoutOf(host.world.plan, 100, "spread").map(({ at }) => at);
        const realms = Object.keys(RACE).filter((realm) => war.realm(realm)?.alive);
        const kinds = new Set();
        let [found, beyond] = [0, 0];

        assert.equal(war.turn, 40);
        assert.ok(roads.length >= 20 && realms.length >= 4, `(${roads.length} on the roads, ${realms.length} peoples)`);

        for (const at of places) {
            beyond += roads.filter((force) => Math.hypot(force.at[0] - at[0], force.at[1] - at[1]) > MISSION_REACH).length;

            for (const realm of realms) {
                const sparing = missionsNear({ war, realm, at });

                assert.deepEqual(sparing, missionsNear({ war, realm, at, sparing: false }), `${realm} at ${at}`);
                found += sparing.length;
                sparing.forEach(({ kind }) => kinds.add(kind));
            }
        }

        // (Missions of what's on the roads among them; and most of the roads beyond most players' reach, which is what's spared)
        assert.ok(found > 100, `(${found} missions found)`);
        assert.ok(["plunder", "wagons", "intercept"].some((kind) => kinds.has(kind)), `(of ${[...kinds].join(", ")})`);
        assert.ok(beyond > (roads.length * places.length) / 2, `(${beyond} of ${roads.length * places.length} askings spared)`);
    });
});
