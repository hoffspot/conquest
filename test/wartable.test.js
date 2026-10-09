// The war table in each keep's great hall and its battle map (core/wartable.js, app/battlemap.js,
// core/war/war.js sight; docs/WAR.md *The war table*): laid in every keep, read from the square
// before it by a Knight or above of its people (or a people under the same liege); what a people
// and its friends see, round their camps' scouts, armies, reserves, depots and towns; the map
// showing theirs always and everyone else's only where it's seen; and the camps' scouts lifting
// the fog off the maps of their people's players
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { readPlan } from "../client/js/core/interiors.js";
import { keepRooms } from "../client/js/core/insides.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { OPENS, STANDINGS } from "../client/js/core/standing.js";
import { SIGHT } from "../client/js/core/war/armies.js";
import { DEPOT } from "../client/js/core/war/supply.js";
import { STAGES, TURN_MS } from "../client/js/core/war/war.js";
import { atWarTable, beforeWarTable, mayRead, warTableOn } from "../client/js/core/wartable.js";
import { actionsAt, battleMapView, DEPOT_COST, heededText } from "../client/js/app/battlemap.js";
import { reachable } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// A world with the humans and the orcs at war, as far on as it goes; the player a human
function hosted() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });
    const war = host.war;

    host.join({ id: HOST_PLAYER, hero: HERO });
    war.relations["human|orc"] = { state: "hostile", since: 0 };
    war.stage = STAGES.length - 1;

    return { host, war };
}

// A camp of `realm`'s at `at`, up (or going up)
function camped(war, realm, at, { up = true, id = `camp-${900 + war.camps.length}` } = {}) {
    const camp = { id, realm, at: [...at], guard: 6, built: up ? war.turn : null, done: war.turn + 2, toward: null, used: 1e6, skirmished: war.turn };

    war.camps.push(camp);

    return camp;
}

// An army of `realm`'s standing at `at`
function army(war, realm, at, size = 30, id = `force-${900 + war.forces.length}`) {
    const force = { id, realm, kind: "army", size, at: [...at], path: [[...at]], leg: 0, target: null, home: war.realm(realm).seat, mission: "regroup", about: null, camp: null, orders: null, went: size, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 };

    war.forces.push(force);

    return force;
}

const off = ([x, y], dx, dy) => [x + dx, y + dy];

describe("the war table in a keep (core/wartable.js)", () => {
    it("is laid in every keep's great hall, a town's and a castle's, with the square before it clear and reached from the door, near enough to read it from there", () => {
        for (const siteKind of ["town", "castle"]) {
            const [hall] = keepRooms({ siteKind, name: "The keep" });
            const map = readPlan(`keep-${siteKind}`, hall.name, hall.rows, { ground: hall.ground });
            const table = warTableOn(map);
            const [x, y] = beforeWarTable(table);
            const [door] = map.marks.D;

            assert.deepEqual([table.w, table.h], [4, 2], siteKind);
            assert.equal(map.blocked[y][x], 0, `${siteKind}: the square before it's clear`);
            assert.ok(reachable(map, [door[0], door[1] - 1], [x, y]), `${siteKind}: reached from the door`);
            assert.ok(atWarTable(table, x + 0.5, y + 0.5), `${siteKind}: read from there`);
            assert.ok(!atWarTable(table, door[0] + 0.5, door[1] + 0.5), `${siteKind}: not from the door`);
        }
    });

    it("is read by a Knight or above of its people, or of a people under the same liege, and no one else", () => {
        const { war } = hosted();

        assert.equal(OPENS.table, 3);
        assert.equal(mayRead(war, "human", "human", OPENS.table), "ok");
        assert.equal(mayRead(war, "human", "human", OPENS.table - 1), "rank");
        assert.equal(mayRead(war, "human", "orc", 5), "stranger");

        // (The orcs brought under the humans: their keeps the humans' to read, and the humans' theirs)
        war.realm("orc").overlord = "human";
        assert.equal(mayRead(war, "human", "orc", OPENS.table), "ok");
        assert.equal(mayRead(war, "orc", "human", OPENS.table), "ok");
    });
});

describe("what a people sees (war.js sight, sees)", () => {
    it("sees round each of its camps that's up as far as its scout, its armies and reserves out, its depots up and its towns from their edges; its friends' too, not its enemies'", () => {
        const { war } = hosted();
        const seat = war.town(war.realm("orc").seat);
        const camp = camped(war, "human", off(seat.at, 0, 280));
        const going = camped(war, "human", off(seat.at, 600, 0), { up: false });
        const ours = army(war, "human", off(seat.at, -900, 0));
        const theirs = camped(war, "orc", off(seat.at, 0, -280));
        const sight = war.sight("human");
        const of = (id) => sight.find((source) => source.id === id);

        assert.deepEqual([of(camp.id)?.kind, of(camp.id)?.reach], ["scout", SIGHT.scout]);
        assert.equal(of(going.id), undefined, "not a camp going up");
        assert.deepEqual([of(ours.id)?.kind, of(ours.id)?.reach], ["army", SIGHT.army]);
        assert.equal(of(theirs.id), undefined, "not the enemy's");

        const home = war.town(war.realm("human").seat);

        assert.ok(of(home.id)?.reach > SIGHT.holding, "a town's from its edge");
        assert.ok(war.sees("human", off(camp.at, 0, SIGHT.scout - 5), 0, [of(camp.id)]), "within its scout's sight");
        assert.ok(!war.sees("human", off(camp.at, 0, SIGHT.scout + 5), 0, [of(camp.id)]), "not beyond it");

        // (Allies share what they see)
        war.relations["elf|human"] = { state: "allied", since: 0 };

        const elves = army(war, "elf", off(seat.at, 2000, 2000));

        assert.ok(war.sight("human").some(({ id }) => id === elves.id));
    });
});

describe("the battle map (app/battlemap.js battleMapView)", () => {
    it("shows a people's own and its friends' always, and everyone else's only where it's seen now; how strongly an enemy's town is held only where it's seen", () => {
        const { host, war } = hosted();
        const explored = host.players.get(HOST_PLAYER).explored;
        const seat = war.town(war.realm("orc").seat);
        const camp = camped(war, "human", off(seat.at, 0, 280));
        const ours = army(war, "human", off(camp.at, 0, 40), 24);
        const near = army(war, "orc", off(camp.at, 200, 0), 30);
        const far = army(war, "orc", off(seat.at, 0, -1600), 40);

        war.relations["elf|human"] = { state: "allied", since: 0 };

        const allies = army(war, "elf", off(seat.at, -3000, 0), 20);

        assert.ok(!war.sees("human", far.at), "the far one's out of sight");

        const view = battleMapView(war, "human", { explored });
        const shown = (id) => view.forces.find((force) => force.id === id);

        assert.match(shown(ours.id)?.told ?? "", /^Our army, 24 strong of \d+: falling back to its camp to be made up\.$/);
        assert.ok(shown(ours.id).own && shown(ours.id).ours);
        assert.match(shown(near.id)?.told ?? "", /^The Orcish army, 30 strong: /);
        assert.ok(shown(near.id).seen && !shown(near.id).ours);
        assert.equal(shown(far.id), undefined, "the far one isn't shown");
        assert.ok(shown(allies.id)?.ours && !shown(allies.id).own, "their allies' are");
        assert.ok(view.camps.some(({ id, own, up }) => id === camp.id && own && up));
        assert.ok(view.sight.some(({ kind, x, z, reach }) => kind === "scout" && x === camp.at[0] && z === camp.at[1] && reach === SIGHT.scout));

        // (The orcs' seat, seen by the camp's scout: how strongly it's held; another of their
        // towns uncovered but not seen: not how strongly)
        const town = view.towns.find(({ id }) => id === seat.id);

        assert.equal(town.garrison, seat.garrison);
        assert.match(town.told, new RegExp(`^${seat.name}, the Orcish seat: ${seat.garrison} of \\d+ on guard\\.$`));

        const other = war.towns.find((each) => each.owner === "orc" && each.id !== seat.id && !war.sees("human", each.at));

        explored.visit(other.at[0], other.at[1]);

        const again = battleMapView(war, "human", { explored }).towns.find(({ id }) => id === other.id);

        assert.equal(again.garrison, null);
        assert.match(again.told, /we can't see from here\.$/);

        // (Neither seen nor uncovered: not shown at all)
        const unseen = war.towns.find((each) => each.owner === "orc" && !war.sees("human", each.at) && !explored.visitedAt(each.at[0], each.at[1]));

        assert.ok(!battleMapView(war, "human", { explored }).towns.some(({ id }) => id === unseen?.id));
    });

    it("says what their own army and reserve are about, and where their own forces are going", () => {
        const { war } = hosted();
        const reserve = war.reserveOf("human");
        const home = war.town(reserve.home).name;

        reserve.size = 0;
        assert.equal(battleMapView(war, "human").said, `We have no army raised. Our reserve is being made up at ${home}.`);

        reserve.size = 30;
        assert.equal(battleMapView(war, "human").reserve, `Our reserve, 30 strong of ${war.fullOf("human")}: at ${home}.`);

        const seat = war.town(war.realm("orc").seat);
        const marching = army(war, "human", off(seat.at, -800, 0));

        Object.assign(marching, { mission: "attack", target: seat.id, path: [[...marching.at], off(seat.at, -300, 0), off(seat.at, -150, 0)], leg: 0 });

        const shown = battleMapView(war, "human").forces.find(({ id }) => id === marching.id);

        assert.match(shown.told, new RegExp(`attacking ${seat.name}\\.$`));
        assert.equal(shown.way.length, 3);
    });
});

describe("the camps' scouts lifting the fog (host.js)", () => {
    it("uncovers on their people's players' maps what each camp of theirs that's up sees, at each turn of the war; not what the enemy's camps see", () => {
        const { host, war } = hosted();
        const explored = host.players.get(HOST_PLAYER).explored;
        const seat = war.town(war.realm("orc").seat);
        const camp = camped(war, "human", off(seat.at, 0, 280));
        const theirs = camped(war, "orc", off(seat.at, 0, -900));
        const seen = (at) => explored.visitedAt(at[0], at[1]);

        assert.ok(!seen(camp.at) && !seen(off(camp.at, 200, 0)) && !seen(theirs.at), "not yet");

        war.clock = TURN_MS - 100;

        const events = [];

        for (let t = 0; t < 500; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        assert.ok(seen(camp.at) && seen(off(camp.at, 200, 0)) && seen(off(camp.at, 0, -200)), "round the camp");
        assert.ok(!seen(off(camp.at, 0, SIGHT.scout + 120)), "no further than its scout sees");
        assert.ok(!seen(theirs.at), "not the enemy's");
        assert.ok(events.some(({ type, id, scouted }) => type === "explored" && id === HOST_PLAYER && scouted));
    });

    it("uncovers it as a player comes in", () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });
        const seat = host.war.town(host.war.realm("orc").seat);
        const camp = camped(host.war, "human", off(seat.at, 0, 280));
        const player = host.join({ id: HOST_PLAYER, hero: HERO });

        assert.ok(player.explored.visitedAt(camp.at[0], camp.at[1]));
    });
});

// An elf at the war table in the keep of their people's castle, at war with the orcs, as far on as
// the war goes, of rank `rank`
function atTheTable(rank = OPENS.orders) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });
    const war = host.war;

    host.join({ id: HOST_PLAYER, hero: { ...HERO, race: "elf" } });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
    war.relations["elf|orc"] = { state: "hostile", since: 0 };
    war.stage = STAGES.length - 1;

    const site = world.plan.sites.find((each) => each.kind === "castle" && each.race === "elf");

    world.maps.town.sites.heartOf(site);

    const set = world.maps.town.sites.set.get(site.id);
    const keep = world.interiors.buildings.get(`site:${site.id}`);
    const me = host.battle.actor(HOST_PLAYER);
    const out = [Math.floor(set.x + Math.sin(set.facing) * (set.h * 2 + 3)), Math.floor(set.y + Math.cos(set.facing) * (set.h * 2 + 3))];

    Object.assign(me, { hp: 1e6, maxHp: 1e6, map: "town", square: out, x: out[0] + 0.5, y: out[1] + 0.5, path: [], order: null, target: null, spawn: out });
    host.command(HOST_PLAYER, { type: "enter", link: keep.door.id });

    for (let t = 0; t < 60000 && me.map === "town"; t += STEP_MS) {
        host.advance(STEP_MS);
    }

    const [x, y] = beforeWarTable(warTableOn(world.maps[me.map]));

    Object.assign(me, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null });
    host.players.get(HOST_PLAYER).standing.points = STANDINGS[rank].points;

    const order = (orders, realm) => host.command(HOST_PLAYER, { type: "table", orders, ...(realm ? { realm } : {}) });

    return { host, war, me, order };
}

describe("orders and counsel at the war table (host.js #atTable, battlemap.js actionsAt)", () => {
    it("takes a Lord's orders for their people's army there, telling why not when they can't be carried out", () => {
        const { war, me, order } = atTheTable();
        const orcs = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "village");
        const humans = war.towns.find(({ owner }) => owner === "human");

        assert.equal(order({ home: true }).reason, "noArmy");
        assert.equal(order({ raise: true }).ok, true);
        assert.equal(order({ raise: true }).reason, "raised");

        const army = war.armyOf("elf");

        assert.ok(army);
        assert.equal(order({ supply: true }).reason, "mustering");
        assert.equal(order({ attack: humans.id }).reason, "peace");
        assert.equal(order({ attack: orcs.id }).ok, true);
        assert.deepEqual(army.orders, { kind: "attack", about: orcs.id, by: "elf" });
        assert.equal(order({ disband: true }).ok, true);
        assert.equal(war.armyOf("elf"), null);

        // (Not at the table)
        Object.assign(me, { x: me.x + 6 });
        assert.equal(order({ raise: true }).reason, "table");
    });

    it("takes them for a vassal's army too, not anyone else's; none from a Knight, nor from a people serving another", () => {
        const { war, order } = atTheTable();

        war.realm("lizard").overlord = "elf";
        assert.equal(order({ raise: true }, "lizard").ok, true);
        assert.ok(war.armyOf("lizard"));
        assert.equal(order({ raise: true }, "cat").reason, "notOurs");

        war.realm("lizard").overlord = null;
        war.realm("elf").overlord = "orc";
        assert.equal(order({ raise: true }).reason, "serving");

        const knight = atTheTable(OPENS.table);

        assert.equal(knight.order({ raise: true }).reason, "orderRank");
    });

    it("takes a Knight's counsel to march on an enemy's town there", () => {
        const { host, war } = atTheTable(OPENS.march);
        const orcs = war.towns.find(({ owner }) => owner === "orc");
        assert.equal(host.command(HOST_PLAYER, { type: "table", counsel: { march: orcs.id } }).ok, true);
        assert.equal(war.realm("elf").counsel?.march, orcs.id);
        assert.match(heededText({ counsel: { march: orcs.id } }, war), new RegExp(`^Your counsel's heard: ${orcs.name}, next`));
    });

    it("offers on the map what can be done with what's tapped, by rank: orders for the army, the enemy's attacked, supplies from a depot, camp or a depot on the ground; counsel from a Knight", () => {
        const { host, war } = atTheTable();
        const orcs = war.town(war.realm("orc").seat);
        const explored = host.players.get(HOST_PLAYER).explored;
        const lord = () => battleMapView(war, "elf", { rank: OPENS.orders, explored });

        // (The orcs' seat uncovered on the player's map)
        explored.visit(orcs.at[0], orcs.at[1]);

        // (No army: raised at their seat; the ground, a depot built there)
        let view = lord();
        const seat = view.towns.find(({ id }) => id === war.realm("elf").seat);

        assert.deepEqual(view.may, { counsel: true, orders: true });
        assert.deepEqual(view.commands.map(({ realm, army }) => [realm, army]), [["elf", null]]);
        assert.deepEqual(actionsAt(view, seat, null).map(({ orders }) => orders), [{ raise: true }]);
        assert.deepEqual(actionsAt(view, null, [100.4, 200.6]).map(({ label, orders }) => [label, orders]), [[`Build a supply depot here (${DEPOT_COST} gold)`, { depot: [100, 201] }]]);

        // (Raised and out: tapped, home, supplies or disbanded; the ground, camp made there too)
        war.order("elf", { raise: true });

        const army = war.armyOf("elf");

        Object.assign(army, { size: 60, mission: "regroup", at: [orcs.at[0] + 900, orcs.at[1]], path: [[orcs.at[0] + 900, orcs.at[1]]], leg: 0 });
        view = lord();

        const ours = view.forces.find(({ id }) => id === army.id);

        assert.equal(ours.command, "elf");
        assert.deepEqual(actionsAt(view, ours, null).map(({ orders }) => Object.keys(orders)[0]), ["home", "supply", "disband"]);
        assert.deepEqual(actionsAt(view, null, [5, 5]).map(({ orders }) => Object.keys(orders)[0]), ["camp", "depot"]);

        // (The orcs' seat, seen by a camp of theirs: out of its reach, marched on; in it, attacked;
        // counselled)
        war.camps.push({ id: "camp-900", realm: "elf", at: [orcs.at[0], orcs.at[1] + 900], guard: 6, built: war.turn, done: war.turn, toward: null, used: 1e6, skirmished: war.turn });

        const far = lord().towns.find(({ id }) => id === orcs.id);

        assert.deepEqual([far.hostile, far.reach, far.garrison], [true, [], null]);
        assert.deepEqual(actionsAt(lord(), far, null).map(({ label }) => label), ["March on it: make camp before it, then attack", "Counsel marching on it next"]);

        war.camps.at(-1).at = [orcs.at[0], orcs.at[1] + 280];

        const near = lord().towns.find(({ id }) => id === orcs.id);

        assert.deepEqual(near.reach, ["elf"]);
        assert.equal(actionsAt(lord(), near, null)[0].label, "Attack it");

        // (A depot of theirs in reach of the army, with a load: supplies sent from it)
        war.depots.push({ id: "depot-900", realm: "elf", at: [army.at[0] + 200, army.at[1]], guard: DEPOT.guard, built: 0, done: 0, level: 2, toward: null, used: 0, by: null });

        const depot = lord().depots.find(({ id }) => id === "depot-900");

        assert.deepEqual(depot.supplies, ["elf"]);
        assert.deepEqual(actionsAt(lord(), depot, null).map(({ orders }) => orders), [{ supply: "depot-900" }]);

        // (A Knight: counsel only)
        const knight = battleMapView(war, "elf", { rank: OPENS.march, explored });

        assert.deepEqual(knight.may, { counsel: true, orders: false });
        assert.deepEqual(knight.commands, []);
        assert.deepEqual(actionsAt(knight, knight.towns.find(({ id }) => id === orcs.id), null).map(({ counsel }) => counsel), [{ march: orcs.id }]);
        assert.deepEqual(actionsAt(knight, null, [5, 5]), []);
    });
});

