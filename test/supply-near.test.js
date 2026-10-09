// The armies' supply in the world near a player (client/js/core/host.js WAGON_NEAR with
// core/war/war.js; docs/WAR.md *The armies near a player*): a supply wagon on its way near a player
// met, its ox and wagon laden with its supplies, its guards of its people beside it, going at a
// convoy's pace for its army where it is now, the war told where it's got to and holding it
// meanwhile; there, its load its army's and it's gone; its guards put down, it's taken (a load that
// didn't get through), a little gold for the player, the wagon left standing; a supply depot near a
// player pitched with its stores, its guard put down there razing it; let go once every player's
// far; kept with the world
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CONVOY_NEAR, HOST_PLAYER, Host, WAGON_NEAR } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { DEPOT, SUPPLY } from "../client/js/core/war/supply.js";
import { STAGES, TURN_MS } from "../client/js/core/war/war.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world with the humans and the orcs at war, as far on as it goes, the player out in the field
// east of their town; an orc army standing further east, its last load missed, and a wagon on its
// way to it, near the player
function hosted() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });
    const war = host.war;

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
    war.relations["human|orc"] = { state: "hostile", since: 0 };
    war.known.push("human|orc");
    war.stage = STAGES.length - 1;

    const [mx, my] = host.world.stamp.middle;
    const at = [mx + 400, my + 30];
    const from = [mx + 200, my + 30];
    const seat = war.realm("orc").seat;
    const army = { id: "force-900", realm: "orc", kind: "army", size: 30, at: [...at], path: [[...at]], leg: 0, target: null, home: seat, mission: "regroup", about: null, camp: null, orders: null, went: 30, arrived: null, supply: { due: 1e6, missed: 1 }, since: 0 };
    const wagon = { id: "force-901", realm: "orc", kind: "supply", size: SUPPLY.guards, at: [...from], path: [[...from], [...at]], leg: 0, target: army.id, home: seat, mission: "army", about: null, since: 0 };

    war.forces.push(army, wagon);
    put(host.battle.actor(HOST_PLAYER), [Math.floor(mx + 170), Math.floor(my)]);

    return { host, war, army, wagon, middle: [mx, my] };
}

// Everyone of `ids` put down by the player, made too strong to lose
function putDown(host, ids) {
    const player = host.battle.actor(HOST_PLAYER);
    const events = [];

    Object.assign(player, { hp: 50000, maxHp: 50000 });

    for (const id of ids) {
        Object.assign(host.battle.actor(id) ?? {}, { hp: 1 });
    }

    for (let k = 0; k < 60 && ids.some((id) => host.battle.actor(id) && !host.battle.actor(id).dead); k++) {
        const left = ids.map((id) => host.battle.actor(id)).find((one) => one && !one.dead);

        put(player, [left.square[0] + 1, left.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: left.id });
        events.push(...run(host, 1500));
    }

    return events;
}

describe("the armies' supply in the world near a player (host.js WAGON_NEAR, war.js)", () => {
    it("meets a supply wagon near a player, laden, its guards beside it, making for its army at a convoy's pace, the war told and holding it; there, its load its army's and it's gone", () => {
        const { host, war, army, wagon } = hosted();
        const events = run(host, 1000);
        const met = host.supplies.get(wagon.id);
        const told = events.find(({ type, wagon: id }) => type === "supply" && id === wagon.id);

        assert.ok(met, "met");
        assert.deepEqual([told.people, told.over, told.ids, told.wagons], ["orc", "met", met.ids, [met.wagon]]);

        // (Its ox and wagon, laden with its supplies; its guards of its people)
        const cart = host.battle.actor(met.wagon);

        assert.deepEqual([cart.kind, cart.team, cart.neutral, host.wagons.get(met.wagon).load], ["wagon", "orc", true, "supplies"]);
        assert.equal(met.ids.length, SUPPLY.guards);
        assert.ok(met.ids.every((id) => host.battle.actor(id).team === "orc" && host.soldiers.get(id).supply === wagon.id));

        // (Making for its army at a convoy's pace, the war told where it's got to)
        const from = [cart.x, cart.y];

        run(host, 10000);

        const went = cart.x - from[0];

        assert.ok(went > 5 && went < CONVOY_NEAR.pace * 10 + 1, `${went} m`);
        assert.ok(Math.hypot(wagon.at[0] - cart.x, wagon.at[1] - cart.y) < 2, "the war where it's got to");

        // (A turn of the war: it doesn't move it on itself)
        const before = [...wagon.at];

        war.advance(TURN_MS);
        assert.deepEqual(wagon.at, before);

        // (There: its army's load, and it's gone)
        const there = [];

        for (let k = 0; k < 30 && host.supplies.has(wagon.id); k++) {
            there.push(...run(host, 10000));
        }

        assert.ok(!war.force(wagon.id), "delivered");
        assert.equal(army.supply.missed, 0, "its army's supplied");
        assert.ok(there.some(({ type, event }) => type === "war" && event.type === "supplied" && event.army === army.id));
        assert.ok(there.some(({ type, supply }) => type === "parted" && supply === wagon.id));
        assert.ok(!host.battle.actor(met.wagon) && met.ids.every((id) => !host.battle.actor(id)));
    });

    it("is taken once a player at war with its people puts its guards down: a load its army didn't get, gold for the player, the wagon left standing", () => {
        const { host, war, army, wagon } = hosted();

        run(host, 1000);

        const met = host.supplies.get(wagon.id);
        const events = putDown(host, [...met.ids]);

        assert.ok(!war.force(wagon.id), "taken");
        assert.equal(met.over, "taken");
        assert.equal(army.supply.missed, 2, "its army's missed another");
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "wagonLost" && event.by === "human"));
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "unsupplied" && event.army === army.id && event.missed === 2));
        assert.ok(events.some(({ type, wagon: id, over, by }) => type === "supply" && id === wagon.id && over === "taken" && by === "human"));

        const spoils = events.find(({ type, creature }) => type === "spoils" && creature === "supply");

        assert.ok(spoils, "a share for the player");
        assert.equal(host.ground.get(spoils.ground).bundle.gold, WAGON_NEAR.worth);

        const cart = host.battle.actor(met.wagon);

        assert.ok(cart && !cart.ai && !cart.path.length, "left standing");

        // (Let go once the player's far, as any)
        put(host.battle.actor(HOST_PLAYER), [Math.floor(cart.x - WAGON_NEAR.far - 20), Math.floor(cart.y)]);
        run(host, 1000);
        assert.ok(!host.supplies.has(wagon.id) && !host.battle.actor(met.wagon));
    });

    it("pitches a supply depot near a player with its stores, the war holding it; its guard put down there, it's razed", () => {
        const { host, war, wagon, middle: [mx, my] } = hosted();
        const depot = { id: "depot-900", realm: "orc", at: [mx + 150, my - 40], guard: DEPOT.guard, built: 0, done: 0, level: DEPOT.start, toward: null, used: war.turn, by: null };

        // (No wagon in it)
        war.forces.splice(war.forces.indexOf(wagon), 1);
        war.depots.push(depot);

        const events = run(host, 1000);
        const pitched = host.camps.get(depot.id);
        const told = events.find(({ type, camp }) => type === "camp" && camp === depot.id);

        assert.ok(pitched, "pitched");
        assert.equal(told.stores.length, 2);
        assert.ok(told.stores.every(({ at: [x, y] }) => Math.hypot(x - told.fire[0], y - told.fire[1]) < 4), "by its fire");
        assert.equal(pitched.ids.length, DEPOT.guard);
        assert.ok(war.watched.has(depot.id), "the war holding it");

        const razed = putDown(host, [...pitched.ids]);

        assert.ok(!war.depot(depot.id), "razed");
        assert.ok(razed.some(({ type, event }) => type === "war" && event.type === "razed" && event.depot === depot.id && event.by === "human"));

        run(host, 500);
        assert.ok(!host.camps.has(depot.id), "struck");
    });

    it("keeps the wagons met with the world, carrying on exactly", () => {
        const { host, wagon } = hosted();

        run(host, 3000);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.supplies.keys()], [wagon.id]);
        assert.deepEqual([...again.wagons.keys()], [...host.wagons.keys()]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 4000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });
});
