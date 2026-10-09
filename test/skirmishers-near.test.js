// A camp's scout and skirmishers in the world near a player (client/js/core/host.js CAMP_NEAR,
// SKIRMISH_NEAR with core/war/war.js; docs/WAR.md *The armies near a player*): a camp pitched
// sends its scout out on its round; its skirmishers, when they're due, go out in the world against
// what the war sends them after, the nearest of the enemy's, and fight it out there, each fallen
// one fewer of its guard, the war not reckoning it itself; gone off beyond every player before
// they come to it, the war reckons it; from a camp far off, they set off near what they're after;
// kept with the world
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CAMP_NEAR, HOST_PLAYER, Host, SKIRMISH_NEAR } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { CAMP } from "../client/js/core/war/armies.js";
import { SUPPLY } from "../client/js/core/war/supply.js";
import { STAGES } from "../client/js/core/war/war.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

const atWar = (war) => (war.relations["human|orc"] = { state: "hostile", since: 0 });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        atWar(host.war);
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world with the humans and the orcs at war, as far on as it goes, the player out at `[dx, dy]`
// from the middle of their town, made too strong to fall (they're not who's fought here)
function hosted([dx, dy] = [170, 0]) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });
    const war = host.war;

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
    atWar(war);
    war.stage = STAGES.length - 1;

    const [mx, my] = host.world.stamp.middle;
    const player = host.battle.actor(HOST_PLAYER);

    put(player, [Math.floor(mx + dx), Math.floor(my + dy)]);
    Object.assign(player, { hp: 1e6, maxHp: 1e6 });

    return { host, war, middle: [mx, my] };
}

// An orc camp at `at`, its skirmishers not due till it's said
function camped(war, at, guard = 6) {
    const camp = { id: "camp-900", realm: "orc", at: [...at], guard, built: 0, done: 0, toward: null, used: 1e6, skirmished: war.turn };

    war.camps.push(camp);

    return camp;
}

// A human army standing at `at`
function army(war, at, size = 12, id = "force-900") {
    const force = { id, realm: "human", kind: "army", size, at: [...at], path: [[...at]], leg: 0, target: null, home: war.realm("human").seat, mission: "regroup", about: null, camp: null, orders: null, went: size, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 };

    war.forces.push(force);

    return force;
}

// The camp's skirmishers due: played on till the war's next turn sends them
function due(host, camp) {
    const turn = host.war.turn;
    const events = [];

    camp.skirmished = turn - CAMP.every;

    while (host.war.turn === turn) {
        events.push(...run(host, 500));
    }

    return events;
}

const standing = (host, ids) => ids.filter((id) => host.battle.actor(id) && !host.battle.actor(id).dead);

describe("a camp's scout and skirmishers in the world near a player (host.js CAMP_NEAR, SKIRMISH_NEAR, war.js)", () => {
    it("sends a camp's scout out on its round once it's pitched, the war holding the camp", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const camp = camped(war, [mx + 220, my + 60]);

        run(host, 1000);

        const scout = host.battle.actor(`${camp.id}/scout`);
        const { fire } = host.camps.get(camp.id);

        assert.equal(scout.name, "Orcish scout");
        assert.equal(scout.patrol.length, CAMP_NEAR.rounds);
        assert.ok(scout.patrol.every(([x, y]) => Math.abs(Math.hypot(x + 0.5 - fire[0], y + 0.5 - fire[1]) - CAMP_NEAR.scout) < 4), "its round");
        assert.ok(war.watched.has(camp.id));

        // (Round the camp, a while on, still on its round)
        const from = [scout.x, scout.y];

        run(host, 20000);
        assert.ok(Math.hypot(scout.x - from[0], scout.y - from[1]) > 10, "out on its round");
        assert.ok(Math.hypot(scout.x - fire[0], scout.y - fire[1]) < CAMP_NEAR.scout + 8);
    });

    it("has a pitched camp's skirmishers go out against an enemy's army met near it and fight it out there, each fallen one fewer of its guard, the war not reckoning it itself", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const camp = camped(war, [mx + 220, my + 60]);
        const humans = army(war, [mx + 230, my - 60]);

        run(host, 1000);

        const sent = due(host, camp);
        const told = sent.find(({ type, event }) => type === "war" && event.type === "skirmishers");
        const out = sent.find(({ type }) => type === "skirmishers");

        assert.deepEqual([told?.event.target, told?.event.kind], [humans.id, "army"]);
        assert.ok(out, "out in the world");
        assert.equal(out.ids.length, CAMP.pair);
        assert.ok(out.ids.every((id) => host.battle.actor(id).name === "Orcish skirmisher" && host.soldiers.get(id).camp === camp.id));

        // (Out of its fire)
        const { fire } = host.camps.get(camp.id);

        assert.ok(out.ids.every((id) => Math.hypot(host.battle.actor(id).x - fire[0], host.battle.actor(id).y - fire[1]) < 4));

        // (Up to it, and fighting it out: each of them fallen, one fewer of its guard then and there)
        const events = [];
        let fell = 0;

        for (let t = 0; t < 120000 && host.skirmishers.has(out.skirmish); t += STEP_MS) {
            const guard = camp.guard;
            const step = run(host, STEP_MS);
            const deaths = step.filter(({ type }) => type === "death");

            events.push(...step);

            if (deaths.some(({ id }) => out.ids.includes(id))) {
                fell++;

                if (deaths.length === 1) {
                    assert.equal(camp.guard, guard - 1);
                }
            }
        }

        assert.ok(!host.skirmishers.has(out.skirmish), "done");
        assert.ok(fell > 0 || host.skirmishers.get(out.skirmish)?.fought, "they fought it");
        assert.ok(events.some(({ type, id, by }) => type === "death" && ((out.ids.includes(id) && `${by}`.startsWith(`${humans.id}/`)) || (out.ids.includes(by) && id.startsWith(`${humans.id}/`)))), "with the army");
        assert.ok(!events.some(({ type, event }) => type === "war" && event.type === "skirmish"), "not reckoned by the war");
    });

    it("has the war reckon their falling on what they're after once they've gone off beyond every player before they came to it", () => {
        // (Out east of the humans' town, beyond any of their holdings' reach)
        const { host, war, middle: [mx, my] } = hosted([650, 300]);
        const camp = camped(war, [mx + 700, my + 300]);
        // (The human army far off, beyond the player, but in the camp's reach)
        const far = army(war, [mx + 700, my + 300 + CAMP.skirmish - 100]);

        run(host, 1000);
        assert.ok(!host.armies.has(far.id), "not met");

        const sent = due(host, camp);
        const out = sent.find(({ type }) => type === "skirmishers");

        assert.equal(sent.find(({ type, event }) => type === "war" && event.type === "skirmishers")?.event.target, far.id);

        const events = [];

        for (let k = 0; k < 400 && host.skirmishers.has(out.skirmish); k++) {
            events.push(...run(host, 1000));
        }

        assert.ok(!host.skirmishers.has(out.skirmish), "let go");
        assert.ok(out.ids.every((id) => !host.battle.actor(id)));
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "skirmish" && event.camp === camp.id && event.target === far.id), "reckoned by the war");
    });

    it("sets a far camp's skirmishers off near what they're after when it's near a player: a supply wagon met, its guards fought", () => {
        // (Out east of the humans' town, beyond any of their holdings' reach, a camp out beyond the
        // player, unpitched, and a human supply wagon on its way by them)
        const { host, war, middle: [mx, my] } = hosted([650, 300]);
        const camp = camped(war, [mx + 1050, my + 300]);
        const humans = army(war, [mx - 300, my + 200], 12, "force-901");
        const from = [mx + 680, my + 330];
        const wagon = { id: "force-902", realm: "human", kind: "supply", size: SUPPLY.guards, at: [...from], path: [[...from], [...humans.at]], leg: 0, target: humans.id, home: war.realm("human").seat, mission: "army", about: null, since: 0 };

        war.forces.push(wagon);
        run(host, 1000);
        assert.ok(!host.camps.has(camp.id) && host.supplies.has(wagon.id));

        const sent = due(host, camp);
        const out = sent.find(({ type }) => type === "skirmishers");

        assert.equal(out?.kind, "supply");

        // (A little way off it, on the camp's side)
        const lead = host.battle.actor(out.ids[0]);
        const off = Math.hypot(lead.x - wagon.at[0], lead.y - wagon.at[1]);

        assert.ok(off < SKIRMISH_NEAR.from + 10 && off > SKIRMISH_NEAR.from - 30, `${off} m off`);
        assert.ok(lead.x > wagon.at[0], "on the camp's side");

        // (Up to its guards)
        const fought = () => (host.skirmishers.get(out.skirmish)?.fought ?? null) !== null;

        for (let k = 0; k < 120 && !fought() && host.skirmishers.has(out.skirmish); k++) {
            run(host, 1000);
        }

        assert.ok(fought() || !standing(host, out.ids).length, "came up to it");
    });

    it("keeps the skirmishers out with the world, and carries on from them exactly", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const camp = camped(war, [mx + 220, my + 60]);

        army(war, [mx + 230, my - 60]);
        run(host, 1000);
        due(host, camp);
        run(host, 2000);
        assert.equal(host.skirmishers.size, 1);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.skirmishers.keys()], [...host.skirmishers.keys()]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 3000; t += STEP_MS) {
            atWar(again.war);
            atWar(host.war);
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });
});
