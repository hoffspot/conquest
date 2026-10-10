// The storms of the camps near a player (client/js/core/host.js STORM, with core/war/war.js and
// core/battle.js; docs/WAR.md *A storm near a player*): a camp's army manning its stockade as an
// enemy nears, its shield line and two-handers posted across its openings within it; those storming
// it mustered outside the opening nearest them, a section of its wall hacked at, and broken open in
// the war and the world; held once those storming it are broken (or it's come to nothing), carried
// once those holding it are; and the war's own side of it: sections broken, forces routed, storms
// ended. Kept with the world, carrying on exactly
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DOCTRINES, rolesOf } from "../client/js/core/formation.js";
import { HOST_PLAYER, Host, STORM } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { brokenOf, walkwayOf } from "../client/js/core/war/stockade.js";
import { STAGES, War, WAR_VERSION } from "../client/js/core/war/war.js";
import { decode, encode } from "../client/js/core/wire.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// Run until `found` finds something in what's happened (or `ms` is up): what it found, and all
// that happened
function until(host, ms, found) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));

        const hit = found(events);

        if (hit) {
            return { hit, events };
        }
    }

    return { hit: null, events };
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// An orcish army at its camp, built east of the humans' town, and a human reserve come to storm it
// from the west, the player looking on from further west
function stormed({ army: armySize = 12, reserve: reserveSize = 16 } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const war = host.war;
    const [mx, my] = host.world.stamp.middle;
    const at = [mx + 230, my + 40];

    war.relations["human|orc"] = { state: "hostile", since: 0 };
    war.stage = STAGES.length - 1;

    const camp = { id: "camp-900", realm: "orc", at, guard: 0, built: 0, done: 0, toward: null, used: 1e6, skirmished: 1e6, breaches: 0, broken: [], troubled: null };
    const army = { id: "force-900", realm: "orc", kind: "army", size: armySize, at: [...at], path: [[...at]], leg: 0, target: null, home: war.realm("orc").seat, mission: "camp", about: [...at], camp: camp.id, orders: null, went: armySize, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 };
    const from = [at[0] - 55, at[1] + 4];
    const reserve = { id: "force-901", realm: "human", kind: "reserve", size: reserveSize, at: [...from], path: [[...from], [...at]], leg: 0, target: army.id, home: war.realm("human").seat, mission: "defend", about: null, since: 0 };

    war.camps.push(camp);
    war.forces.push(army, reserve);
    put(host.battle.actor(HOST_PLAYER), [Math.floor(at[0] - 75), Math.floor(at[1] - 20)]);
    Object.assign(host.battle.actor(HOST_PLAYER), { hp: 1e6, maxHp: 1e6 });

    return { host, war, camp, army, reserve };
}

// Where a camp's stockade stands, within its wall ([x0, y0, x1, y1] metres)
function within(war, camp) {
    const squares = war.stockade(camp.id).sections.flatMap(({ wall }) => wall);
    const xs = squares.map(([x]) => x);
    const ys = squares.map(([, y]) => y);

    return [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1];
}

const inside = ([x, y], [x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1;

// Whether a square of the world's is built on (as its chunk has it)
function solid(world, [x, y]) {
    const chunk = world.chunkAt(x, y);

    return chunk.solid[(y - chunk.y0) * 64 + (x - chunk.x0)] === 1;
}
const met = (host, id) => (host.armies.get(id)?.ids ?? []).map((each) => host.battle.actor(each)).filter((actor) => actor && !actor.dead);

describe("the storms of the camps near a player (host.js STORM, war.js)", () => {
    it("mans a camp's stockade against those storming it, who hack at its wall and break it open, in the war and the world; held once they're broken", () => {
        const { host, war, camp, army, reserve } = stormed();
        const started = until(host, 90000, () => host.storms.get(camp.id)?.attackers.includes(reserve.id));

        assert.ok(started.hit, "stormed");

        // Manned: its shield line and two-handers posted within it, held there; those storming it
        // mustering outside it
        started.events.push(...run(host, 3000));

        const box = within(war, camp);
        const melee = met(host, army.id).filter((actor) => ["front", "heavy"].includes(actor.formation.role));

        assert.ok(melee.length > 0);
        assert.ok(melee.every((actor) => actor.formation.post && inside(actor.formation.post, box) && actor.holds), "posted within it");

        const formation = host.battle.formations[host.armies.get(reserve.id).formation];

        assert.ok(formation.to && !inside(formation.to, box), "mustering outside it");

        // Its wall hacked at: a section of it stood up as its stakes, a party set at it
        const hacking = until(host, 30000, (events) => [...started.events, ...events].find(({ type }) => type === "hacking"));

        assert.ok(hacking.hit, "hacking");

        const { section, stakes: id, people, by } = hacking.hit;
        const stakes = host.battle.actor(id);
        const [x0, y0, x1, y1] = stakes.footprint;

        assert.deepEqual([stakes.kind, stakes.team, people, by], ["stakes", "orc", "orc", "human"]);
        assert.ok(war.stockade(camp.id).sections[section].wall.every(([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1), "over its section's wall");
        assert.ok(hacking.hit.ids.length >= STORM.least && hacking.hit.ids.every((each) => host.battle.actor(each).siege === id), "a party at it");
        assert.ok(!brokenOf(camp).includes(section));

        // Hacked through: broken open in the war, and the world
        stakes.hp = 1;

        const breach = until(host, 30000, (events) => events.find(({ type }) => type === "breach"));
        const wall = war.stockade(camp.id).sections[section].wall;

        assert.ok(breach.hit, "breached");
        assert.deepEqual([breach.hit.camp, breach.hit.section, breach.hit.by], [camp.id, section, "human"]);
        assert.deepEqual(brokenOf(camp), [section]);
        assert.equal(camp.breaches, 1);
        assert.ok(breach.events.some(({ type, event }) => type === "war" && event.type === "breached" && event.played));
        assert.ok(breach.events.some(({ type, ids }) => type === "parted" && ids.includes(id)));
        assert.equal(host.battle.actor(id), null);
        assert.ok(wall.every((square) => !solid(host.world.maps.town, square)), "open in the world");

        // Held: those storming it broken, beaten and running; the storm over
        reserve.size = 1;

        const over = until(host, 5000, (events) => events.find(({ type }) => type === "stormed"));

        // (The war's told of it as it goes on)
        over.events.push(...run(host, STEP_MS));

        assert.ok(over.hit, "over");
        assert.deepEqual([over.hit.held, over.hit.by, over.hit.people, over.hit.breaches], [true, "human", "orc", 1]);
        assert.ok(over.events.some(({ type, event }) => type === "war" && event.type === "stormed" && !event.won && event.played));
        assert.ok(war.fleeing(reserve.id));
        assert.ok(!host.storms.has(camp.id));
        assert.ok(met(host, army.id).every((actor) => !actor.formation.post && !actor.holds && !actor.siege), "stood down");
    });

    it("keeps those hacking at its wall at it, though its archers up on the walkway over them shoot down at them", () => {
        const { host, war, camp, army } = stormed();
        const hacking = until(host, 120000, (events) => events.find(({ type }) => type === "hacking"));

        assert.ok(hacking.hit, "hacking");

        const stakes = host.battle.actor(hacking.hit.stakes);
        const [x0, y0, x1, y1] = stakes.footprint;
        const off = (actor) => Math.max(x0 - actor.x, actor.x - x1 - 1, y0 - actor.y, actor.y - y1 - 1, 0);
        const at = until(host, 60000, () => hacking.hit.ids.map((id) => host.battle.actor(id)).find((actor) => actor && !actor.dead && off(actor) < 1.5));

        assert.ok(at.hit, "one of them at its wall");

        // (One of its archers put up on the walkway nearest them, right over them, within reach of
        // their eye but not their blows)
        const hacker = at.hit;
        const archer = met(host, army.id).find((actor) => actor.formation.role === "archer");
        const squares = walkwayOf(war.stockade(camp.id)).flatMap((run) => run.squares.map(({ square }) => square));
        const over = squares.reduce((best, square) => (Math.hypot(square[0] - hacker.square[0], square[1] - hacker.square[1]) < Math.hypot(best[0] - hacker.square[0], best[1] - hacker.square[1]) ? square : best));

        const close = [hacker.square[0] + Math.sign(over[0] - hacker.square[0]), hacker.square[1] + Math.sign(over[1] - hacker.square[1])];

        assert.ok(!inside(close, [x0, y0, x1 + 1, y1 + 1]) && Math.hypot(over[0] - close[0], over[1] - close[1]) <= 2.5, "right over them, against the wall");
        put(hacker, close);
        put(archer, over);
        Object.assign(archer, { hp: 1e6, maxHp: 1e6 });

        for (let t = 0; t < 3000 && !hacker.dead; t += STEP_MS) {
            host.advance(STEP_MS);
            assert.notEqual(hacker.target, archer.id, "not drawn off it after one out of its reach");
        }

        assert.ok(hacker.dead || hacker.target === stakes.id, "still at it");
    });

    it("keeps an army met there mixed as its people's are as it's fewer: not its archers and healers first, at the back of its line", () => {
        const { host, army } = stormed({ army: 20 });

        assert.ok(until(host, 30000, () => met(host, army.id).length === 20).hit, "met");

        const count = (roles) => roles.reduce((counts, role) => ({ ...counts, [role]: (counts[role] ?? 0) + 1 }), {});
        const before = count(met(host, army.id).map(({ formation }) => formation.role));

        assert.ok(before.archer > 0 && before.healer > 0);

        army.size = 12;

        assert.ok(until(host, 5000, () => met(host, army.id).length === 12).hit, "fewer");
        assert.deepEqual(count(met(host, army.id).map(({ formation }) => formation.role)), count(rolesOf(12, DOCTRINES.orc)));
    });

    it("has it carried once those holding it are broken: razed, in the war and the world", () => {
        const { host, war, camp, army, reserve } = stormed();

        assert.ok(until(host, 90000, () => host.storms.get(camp.id)?.attackers.includes(reserve.id)).hit, "stormed");

        army.size = 0;

        const over = until(host, 5000, (events) => events.find(({ type }) => type === "stormed"));

        // (The war's told of it as it goes on)
        over.events.push(...run(host, STEP_MS));

        assert.ok(over.hit, "over");
        assert.deepEqual([over.hit.held, over.hit.by, over.hit.camp], [false, "human", camp.id]);
        assert.ok(over.events.some(({ type, event }) => type === "war" && event.type === "stormed" && event.won && event.played));
        assert.ok(over.events.some(({ type, event }) => type === "war" && event.type === "razed" && event.camp === camp.id));
        assert.equal(war.camp(camp.id), null);
        assert.equal(war.force(army.id), null, "put down to the last");
        assert.ok(!host.storms.has(camp.id));
    });

    it("has those storming it beaten off once it's come to nothing a while (STORM.stall)", () => {
        const { host, war, camp, army, reserve } = stormed();

        assert.ok(until(host, 90000, () => host.storms.get(camp.id)?.attackers.includes(reserve.id)).hit, "stormed");

        // (None to fall on either side, and no stakes to hack at)
        const storm = host.storms.get(camp.id);
        const everyone = () => [...met(host, army.id), ...met(host, reserve.id)];

        for (const actor of everyone()) {
            Object.assign(actor, { hp: 1e9, maxHp: 1e9 });
        }

        if (storm.section) {
            host.battle.remove(storm.section.id);
            storm.section = null;
        }

        storm.next = Infinity;

        const over = until(host, STORM.stall + 5000, (events) => events.find(({ type }) => type === "stormed"));

        assert.ok(over.hit, "over");
        assert.deepEqual([over.hit.held, over.hit.killed, over.hit.lost], [true, 0, 0]);
        over.events.push(...run(host, STEP_MS));
        assert.ok(war.fleeing(reserve.id));
    });

    it("keeps a storm with the world, carrying on exactly", () => {
        const { host, camp } = stormed();

        assert.ok(until(host, 120000, (events) => events.some(({ type }) => type === "hacking")).hit, "hacking");

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.storms.keys()], [camp.id]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 3000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });
});

describe("the war's side of a storm played out in the world (war.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(2);
    });

    // A war with an orcish army at its camp, built, and a human reserve
    function waged() {
        const war = new War(plan);
        const town = war.towns.find(({ owner }) => owner === "human");
        const at = [town.at[0] + 300, town.at[1]];
        const camp = { id: "camp-900", realm: "orc", at, guard: 4, built: 0, done: 0, toward: town.id, used: 1e6, skirmished: 1e6, breaches: 0, broken: [], troubled: null };
        const army = { id: "force-900", realm: "orc", kind: "army", size: 20, at: [...at], path: [[...at]], leg: 0, target: null, home: war.realm("orc").seat, mission: "camp", about: [...at], camp: camp.id, orders: null, went: 20, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 };
        const reserve = { id: "force-901", realm: "human", kind: "reserve", size: 30, at: [at[0] - 40, at[1]], path: [[at[0] - 40, at[1]]], leg: 0, target: army.id, home: town.id, mission: "defend", about: null, since: 0 };

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.camps.push(camp);
        war.forces.push(army, reserve);

        return { war, camp, army, reserve };
    }

    const told = (war, type) => war.advance(0).filter((event) => event.type === type);

    it("breaks a section of a camp's palisade open hacked through in the world, once", () => {
        const { war, camp } = waged();

        assert.equal(war.breach(camp.id, 3, "human"), true);
        assert.deepEqual([camp.broken, camp.breaches], [[3], 1]);
        assert.equal(war.breach(camp.id, 3, "human"), false, "(already broken)");
        assert.equal(war.breach(camp.id, 999, "human"), false, "(no such section)");
        assert.equal(war.breach("camp-nowhere", 0, "human"), false);

        const [event] = told(war, "breached");

        assert.deepEqual([event.realm, event.by, event.camp, event.breaches, event.played], ["orc", "human", camp.id, 1, true]);
    });

    it("has a force routed in the world beaten, getting away: an army to its camp, a reserve home", () => {
        const { war, army, reserve } = waged();

        assert.equal(war.routed(army.id, { by: "human", killed: 14, lost: 3 }), true);
        assert.ok(war.fleeing(army.id));
        assert.equal(army.mission, "regroup");

        assert.equal(war.routed(reserve.id, { by: "orc", killed: 20, lost: 5 }), true);
        assert.ok(war.fleeing(reserve.id));
        assert.equal(reserve.mission, "back");

        const events = told(war, "battle");

        assert.deepEqual(
            events.map(({ realm, against, other, kind, killed, lost, routed, played }) => [realm, against, other, kind, killed, lost, routed, played]),
            [
                ["human", "orc", army.id, "army", 14, 3, true, true],
                ["orc", "human", reserve.id, "reserve", 20, 5, true, true],
            ],
        );
        assert.equal(war.routed("force-nowhere"), false);
    });

    it("ends a storm held, those storming it beaten; or carried, the camp razed and its army sent home", () => {
        const held = waged();

        assert.equal(held.war.stormEnded(held.camp.id, { by: [held.reserve.id], held: true, killed: 2, lost: 12, breaches: 1 }), "held");
        assert.ok(held.war.fleeing(held.reserve.id));
        assert.ok(held.war.camp(held.camp.id));

        const [stormed] = told(held.war, "stormed");

        assert.deepEqual([stormed.realm, stormed.against, stormed.reserve, stormed.army, stormed.won, stormed.breaches, stormed.played], ["human", "orc", held.reserve.id, held.army.id, false, 1, true]);

        const carried = waged();

        assert.equal(carried.war.stormEnded(carried.camp.id, { by: [carried.reserve.id], held: false, killed: 15, lost: 6 }), "carried");
        assert.equal(carried.war.camp(carried.camp.id), null);
        assert.equal(carried.army.mission, "home");
        assert.equal(carried.army.beaten, carried.war.turn);
        assert.ok(told(carried.war, "razed").some((event) => event.camp === carried.camp.id && event.by === "human"));
        assert.equal(carried.war.stormEnded("camp-nowhere", {}), null);
    });

    it("knows which sections an older war's camps had broken open, in their stockades' order", () => {
        const { war, camp } = waged();
        const kept = war.snapshot();

        kept.version = WAR_VERSION - 1;
        Object.assign(kept.camps.find(({ id }) => id === camp.id), { breaches: 2 });
        delete kept.camps.find(({ id }) => id === camp.id).broken;

        assert.deepEqual(War.restore(plan, kept).camp(camp.id).broken, [0, 1]);
    });
});
