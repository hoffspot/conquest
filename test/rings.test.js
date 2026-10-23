// The rings of standing stones as Lunara's moon roads (client/js/core/rings.js; docs/WILDS.md
// *Moon roads*): each ring bound to one of the moon's eight phases; a night's phase held from
// sunset to sunrise; stepping into a ring's middle by night carrying the player to the ring
// tonight's moon wakes, a full moon letting them choose any ring they've stood in, a new moon
// leaving the stones asleep; the rings stood in kept with what's been found; and a world kept
// from before carried on
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DAY } from "../client/js/core/daytime.js";
import { Explored } from "../client/js/core/explored.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { FULL_MOON, moonRoad, NEW_MOON, nightOf as nightNumber, PHASES, phaseOfNight, RING, ringName, ringNear, ringOf, ringsOf, TRIAL, trialOf } from "../client/js/core/rings.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// How long a world's been going at an hour of a day's night (ms: `hours` after its sunset)
const nightOf = (day, hours = 2) => day * DAY.length - DAY.start + DAY.sets + (hours * DAY.length) / 24;

// The first night whose moon is a phase
const nightWith = (phase) => nightOf(Array.from({ length: 16 }, (_, day) => day).find((day) => phaseOfNight(nightOf(day)) === phase));

// The world's clock set to how long it's been going (its war's turns and the time into the next)
const at = (host, elapsed) => Object.assign(host.war, { turn: Math.floor(elapsed / 60000), clock: elapsed % 60000 });

function world() {
    const built = buildWorld({ seed: 2 });
    const host = new Host(built, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);

    Object.assign(me, { hp: 5000, maxHp: 5000 });

    return { host, me, plan: built.plan, player: host.players.get(HOST_PLAYER) };
}

// Into a ring's middle (its heart, as the host has it), from outside it
function stepInto(host, me, ring) {
    const [x, y] = host.world.maps.town.sites.heartOf(ring.site);

    put(me, [Math.floor(x) + 30, Math.floor(y)]);
    run(host, STEP_MS * 2);
    put(me, [Math.floor(x), Math.floor(y)]);

    return run(host, STEP_MS * 2);
}

describe("the moon roads (core/rings.js)", () => {
    const plan = planWorld(2);
    const rings = ringsOf(plan);

    it("binds each ring to one of the moon's eight phases, each phase one or two, the same every time", () => {
        assert.equal(ringsOf(plan), rings);
        assert.equal(rings.length, plan.sites.filter(({ kind }) => kind === "standing stones").length);
        assert.equal(PHASES.length, 8);

        const counts = PHASES.map((_, phase) => rings.filter((ring) => ring.phase === phase).length);

        assert.ok(counts.every((count) => count >= 1 && count <= 2), JSON.stringify(counts));

        for (const ring of rings) {
            assert.equal(ringOf(plan, ring.site.id), ring);
            assert.equal(ringNear(plan, ring.at), ring);
            assert.match(ringName(plan, ring), /^the stones near .+$/);
        }

        assert.equal(ringOf(plan, "nowhere"), null);
    });

    it("holds a night's moon from sunset to sunrise, a phase a night, round in eight", () => {
        for (let day = 0; day < 16; day++) {
            assert.equal(phaseOfNight(nightOf(day, 1)), phaseOfNight(nightOf(day, 6)), `night ${day}, past midnight`);
            assert.equal(phaseOfNight(nightOf(day + 1)), (phaseOfNight(nightOf(day)) + 1) % 8);
        }
    });

    it("leads from a ring to the one tonight's moon wakes: none under a new moon or a full one", () => {
        for (const from of rings) {
            assert.equal(moonRoad(plan, from, NEW_MOON), null);
            assert.equal(moonRoad(plan, from, FULL_MOON), null);

            for (let phase = 1; phase < 8; phase++) {
                const to = moonRoad(plan, from, phase);

                if (phase === FULL_MOON) {
                    continue;
                }

                assert.ok(to === null || (to.phase === phase && to !== from));
                assert.ok(to !== null || rings.filter((ring) => ring.phase === phase).every((ring) => ring === from), `${from.site.id} under ${PHASES[phase]}`);
            }
        }
    });

    it("by day keeps the ring stood in and tells its moon; by night carries the player down tonight's road", () => {
        const { host, me, player } = world();
        const day = nightOf(1, -8);
        const road = rings.find((ring) => ring.phase !== NEW_MOON && ring.phase !== FULL_MOON);
        const from = rings.find((ring) => ring.phase !== road.phase && moonRoad(plan, ring, road.phase) === road);

        at(host, day);

        const told = stepInto(host, me, from).filter(({ type }) => type === "ring");

        assert.equal(told.length, 1);
        assert.deepEqual({ ring: told[0].ring, phase: told[0].phase, first: told[0].first, night: told[0].night }, { ring: from.site.id, phase: from.phase, first: true, night: false });
        assert.ok(player.explored.rings.has(from.site.id));
        assert.equal(player.inRing, from.site.id);

        // (By night, the moon bound to `road`'s phase: carried there, stood in it)
        at(host, nightWith(road.phase));

        const events = stepInto(host, me, from);
        const carried = events.filter(({ type, why }) => type === "carried" && why === "moon");
        const there = host.world.maps.town.sites.heartOf(road.site);

        assert.equal(carried.length, 1);
        assert.equal(carried[0].ring, road.site.id);
        assert.ok(Math.hypot(me.x - there[0], me.y - there[1]) <= RING.middle + 2, "in its middle");
        assert.equal(player.inRing, road.site.id);
        assert.ok(player.explored.rings.has(road.site.id));

        // (Under a new moon: asleep, nowhere)
        at(host, nightWith(NEW_MOON));
        assert.equal(stepInto(host, me, from).filter(({ type }) => type === "carried").length, 0);
    });

    it("under a full moon carries them to any ring they've stood in, as they choose", () => {
        const { host, me, player } = world();
        const [here, there, never] = rings;

        player.explored.standIn(there.site.id);
        at(host, nightOf(1, -8));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "moonroad", to: there.site.id }), { ok: false, reason: "ring" }, "not in a ring");

        stepInto(host, me, here);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "moonroad", to: there.site.id }), { ok: false, reason: "moonless" }, "by day");

        at(host, nightWith(FULL_MOON));
        stepInto(host, me, here);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "moonroad", to: never.site.id }), { ok: false, reason: "ring" }, "never stood in");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "moonroad", to: there.site.id }), { ok: true });
        assert.equal(player.inRing, there.site.id);
    });

    it("under each full moon wakes Lunara's guardian in one ring, keeping moonsilver: slain, it's taken, and not again that night", () => {
        const { host, me } = world();
        const full = nightWith(FULL_MOON);
        const trial = trialOf(plan, nightNumber(full));

        assert.deepEqual(trialOf(plan, nightNumber(full)), trial, "the same every time");
        assert.ok(rings.includes(trial.ring));
        assert.ok(TRIAL.guardians.includes(trial.guardian));
        assert.notEqual(trialOf(plan, nightNumber(full) + 8).guardian, trial.guardian, "a stag, then a wolf");

        // (By day, nothing; under the full moon, near it: woken, its chest by it)
        const heart = host.world.maps.town.sites.heartOf(trial.ring.site);

        at(host, nightOf(1, -8));
        put(me, [Math.floor(heart[0]), Math.floor(heart[1]) + 20]);
        run(host, 1500);
        assert.equal(host.trials.size, 0);

        at(host, full);

        const woken = run(host, 1500).filter(({ type }) => type === "trial");
        const held = host.trials.get(trial.id);
        const guardian = held && host.battle.actor(held.ids[0]);

        assert.deepEqual(woken.map(({ change, ring }) => ({ change, ring })), [{ change: "woken", ring: trial.ring.site.id }]);
        assert.equal(host.wild.get(guardian.id).creature, trial.guardian.creature);
        assert.equal(guardian.wild.champion, "moon");
        assert.equal(guardian.name, trial.guardian.title);
        assert.ok(host.ground.get(`chest-${trial.id}`)?.locked);

        // (Slain: its moonsilver in the share of the one who slew it; not woken again tonight)
        Object.assign(guardian, { hp: 1 });
        put(me, [Math.floor(guardian.x) + 1, Math.floor(guardian.y)]);
        host.command(HOST_PLAYER, { type: "engage", target: guardian.id });

        const events = run(host, 4000);
        const spoils = events.find(({ type, from }) => type === "spoils" && from === trial.id);

        assert.ok(spoils, "its share for them");
        assert.match(spoils.relic, /^Moonsilver (Torc|Locket|Pendant|Band|Seal) of the Silver Lady$/);
        assert.ok(events.some(({ type, change }) => type === "trial" && change === "fallen"));
        assert.equal(host.trials.size, 0);
        run(host, 1500);
        assert.equal(host.trials.size, 0, "not again tonight");
    });

    it("keeps the rings stood in with what's been found, and carries a world from before on", () => {
        const explored = new Explored();

        assert.equal(explored.standIn("standing-stones-1"), true);
        assert.equal(explored.standIn("standing-stones-1"), false);
        assert.deepEqual([...new Explored(JSON.parse(JSON.stringify(explored))).rings], ["standing-stones-1"]);
        assert.equal("rings" in new Explored().toJSON(), false);

        const { host } = world();
        const old = { ...host.snapshot(), version: 36 };

        old.players = old.players.map(({ inRing: _inRing, ...player }) => player);

        const stepped = SNAPSHOT_STEPS[36](structuredClone(old));

        assert.equal(stepped.version, 37);
        assert.ok(stepped.players.every(({ inRing }) => inRing === null));
        assert.deepEqual(stepped.trials, []);
    });
});
