// The peoples' standing armies and defensive reserves (core/war/armies.js, core/war/war.js;
// docs/WAR.md *Standing armies*): how strong each can be, by the age and for a vassal; made up
// from their people's towns in order (garrisons to half, the reserve, the army, the garrisons to
// the full), the reinforcements banding as they go; a reserve out against an enemy army in its own
// lands, and only there; an army raised and mustered over time, sent by a player's orders or its
// rulers', building a camp and attacking only what's in reach of one, taking a town only by putting
// its garrison (and a seat's leaders) to the sword, falling back to be made up; its camps'
// skirmishers; a war kept before them; and a fallen people's rising, which must put a garrison to
// the sword too
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ARMY, CAMP, CLOSE, fullOf, LEADERS, REINFORCE, WATCH_TURNS } from "../client/js/core/war/armies.js";
import { tell } from "../client/js/core/war/news.js";
import { HOLDINGS, RISING, STAGES, TURN_MS, War } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

let plan;

before(() => {
    plan = planWorld(3);
});

// A war as far on as it goes, with no one going to war of their own accord, and `a` and `b` at war
function warOf({ a = "human", b = "orc", stage = STAGES.length - 1, gold = 1e5 } = {}) {
    const war = new War(plan);

    war.stage = stage;

    for (const realm of war.realms) {
        realm.leader.traits = { aggression: 0, greed: 0.5, loyalty: 0.5, grudge: 0.5, caution: 1 };
        realm.treasury = gold;
    }

    war.relations[[a, b].sort().join("|")] = { state: "hostile", since: 0 };
    war.known.push([a, b].sort().join("|"));

    return war;
}

const play = (war, turns) => {
    const events = [];

    for (let k = 0; k < turns; k++) {
        events.push(...war.advance(TURN_MS));
    }

    return events;
};

const coming = (war, force) => war.forces.filter(({ kind, target }) => kind === "reinforcement" && target === force.id).reduce((sum, { size }) => sum + size, 0);
const edgeOf = (id) => plan.places.find((place) => place.id === id).radius ?? 0;

describe("standing armies and reserves (war.js, armies.js)", () => {
    it("is as strong as the age lets it be, a vassal's half its liege's", () => {
        assert.deepEqual(
            STAGES.map(({ army }) => fullOf(army)),
            [20, 40, 60, 80],
        );
        assert.equal(fullOf(1, { vassal: true }), ARMY.size * ARMY.vassal);

        const war = warOf();

        war.realm("elf").overlord = "human";
        assert.equal(war.fullOf("human"), ARMY.size);
        assert.equal(war.fullOf("elf"), ARMY.size / 2);
        war.stage = 1;
        assert.equal(war.fullOf("human"), fullOf(STAGES[1].army));
    });

    it("has a reserve at each people's seat from the start, made up from its towns; no army till one's raised", () => {
        const war = new War(plan);

        for (const realm of war.realms) {
            const reserve = war.reserveOf(realm.id);

            assert.equal(reserve.size, 0);
            assert.deepEqual(reserve.at, war.town(realm.seat).at);
            assert.equal(war.armyOf(realm.id), null);
        }

        play(war, 30);
        assert.ok(war.realms.every(({ id }) => war.reserveOf(id).size + coming(war, war.reserveOf(id)) === war.fullOf(id)), "made up, in the uneasy peace too");
        assert.ok(war.realms.every(({ id }) => !war.armyOf(id)), "no army raised in the uneasy peace");
    });

    it("makes them up in order: its garrisons to half, then its reserve, then its army, then its garrisons to the full", () => {
        const war = warOf();
        const towns = war.towns.filter(({ owner }) => owner === "human");

        for (const town of towns) {
            town.garrison = 0;
        }

        war.order("human", { raise: true });

        const reserve = war.reserveOf("human");
        const army = war.armyOf("human");
        const half = (town) => Math.ceil(HOLDINGS[town.kind].garrison / 2);
        let armyFirst = null;
        let fullFirst = null;

        for (let turn = 1; turn <= 60; turn++) {
            const sentToArmy = coming(war, army) + army.size;

            play(war, 1);

            const reserveShort = reserve.size + coming(war, reserve) < war.fullOf("human");
            const armyShort = army.size + coming(war, army) < war.fullOf("human");

            // (Nothing for the army while the reserve's short; no garrison past half while either is)
            if (coming(war, army) + army.size > sentToArmy) {
                armyFirst ??= turn;
                assert.ok(!reserveShort, `turn ${turn}: the army made up before the reserve`);
                assert.ok(towns.every((town) => town.garrison >= half(town)), `turn ${turn}: before the garrisons were half`);
            }

            if (towns.some((town) => town.garrison > half(town))) {
                fullFirst ??= turn;
                assert.ok(!reserveShort && !armyShort, `turn ${turn}: a garrison past half before the reserve and army`);
            }
        }

        assert.ok(armyFirst && fullFirst && fullFirst >= armyFirst, `${armyFirst}, ${fullFirst}`);
    });

    it("sends its reinforcements from the towns nearest the army, banding together on the way, joining it there", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        const far = war.towns.filter(({ owner }) => owner === "human").sort((a, b) => apart(b.at, seat.at) - apart(a.at, seat.at))[0];

        war.order("human", { raise: true });

        const army = war.armyOf("human");

        // (Out at the furthest of their towns, the reserve made up)
        Object.assign(army, { at: [...far.at], path: [[...far.at]], leg: 0, mission: "muster" });
        war.reserveOf("human").size = war.fullOf("human");

        const events = [];
        let banded = false;

        for (let k = 0; k < 40 && army.size < war.fullOf("human"); k++) {
            const before = war.forces.filter(({ kind, target }) => kind === "reinforcement" && target === army.id).length;

            events.push(...play(war, 1));

            const columns = war.forces.filter(({ kind, target }) => kind === "reinforcement" && target === army.id);

            for (const [k1, a] of columns.entries()) {
                for (const b of columns.slice(k1 + 1)) {
                    assert.ok(apart(a.at, b.at) > REINFORCE.band - 1e-6 || a.home === b.home, "two columns this near band");
                }
            }

            banded ||= columns.length < before;
        }

        assert.equal(army.size, war.fullOf("human"), "made up");
        assert.ok(banded, "(some banded on the way)");
        assert.ok(far.garrison >= Math.ceil(HOLDINGS[far.kind].garrison / 2));
    });

    it("has a vassal's towns make up only its own army and reserve", () => {
        const war = warOf();

        war.realm("elf").overlord = "human";
        war.order("elf", { raise: true });
        war.order("human", { raise: true });
        play(war, 20);

        const elvish = new Set([war.armyOf("elf").id, war.reserveOf("elf").id]);
        const human = new Set([war.armyOf("human").id, war.reserveOf("human").id]);

        for (const column of war.forces.filter(({ kind }) => kind === "reinforcement")) {
            assert.ok(column.realm === "elf" ? elvish.has(column.target) : column.realm !== "human" || human.has(column.target));
        }

        assert.ok(war.armyOf("elf").size + coming(war, war.armyOf("elf")) <= war.fullOf("elf"));
    });

    it("sends its reserve against an enemy army in its own lands, the one attacking a town first; never beyond them", () => {
        const war = warOf();
        const reserve = war.reserveOf("human");
        const town = war.towns.find(({ owner, kind }) => owner === "human" && kind === "town");
        const theirs = war.town(war.realm("orc").seat);

        reserve.size = 60;

        // (An orc army deep in its own lands: the reserve stays home)
        const army = { id: "force-orc", realm: "orc", kind: "army", size: 40, at: [...theirs.at], path: [[...theirs.at]], leg: 0, target: null, home: theirs.id, mission: "muster", about: null, camp: null, orders: null, went: 40, arrived: null, since: 0 };

        war.forces.push(army);
        play(war, 2);
        assert.ok(war.towns.filter(({ owner }) => owner === "human").every((each) => apart(each.at, army.at) > CLOSE.threat));
        assert.notEqual(reserve.mission, "defend");

        // (Before one of their towns: out against it, and fought)
        Object.assign(army, { at: [town.at[0] + 200, town.at[1]], path: [[town.at[0] + 200, town.at[1]]], leg: 0 });

        const events = play(war, 12);

        const battle = events.find(({ type, other }) => type === "battle" && other === reserve.id);

        assert.ok(battle && battle.killed > 0, "fought");

        // (And home again once there's none)
        war.forces.includes(army) && war.forces.splice(war.forces.indexOf(army), 1);
        play(war, 40);
        assert.equal(reserve.mission, "home");
        assert.deepEqual(reserve.at, war.town(war.realm("human").seat).at);
    });

    it("raises an army at its seat, of none at first, made up over time; marches once it's made up enough, builds a camp, and attacks from it", () => {
        const war = warOf();

        // (Its rulers raise it, once at war in the border wars or later)
        war.realm("human").leader.traits.aggression = 0.5;

        const events = play(war, 1);

        assert.ok(events.some(({ type, realm }) => type === "raised" && realm === "human"));

        const army = war.armyOf("human");

        assert.ok(army.size < war.fullOf("human") * ARMY.ready, "made up over time");

        // (Kept at war: no truce)
        const later = [];

        for (let k = 0; k < 120; k++) {
            war.relations["human|orc"] = { state: "hostile", since: 0 };
            later.push(...play(war, 1));
        }

        const marched = later.find(({ type, realm }) => type === "marched" && realm === "human");
        const camped = later.find(({ type, realm }) => type === "camped" && realm === "human");
        const assault = later.find(({ type, realm }) => type === "assault" && realm === "human");

        assert.ok(marched && marched.size >= Math.floor(war.fullOf("human") * ARMY.ready), `marched ${marched?.size} strong`);
        assert.ok(camped && camped.turn >= marched.turn + CAMP.build, "a camp built, taking its time");
        assert.ok(assault && assault.turn >= camped.turn);
        assert.ok(apart(camped.at, war.town(assault.town).at) - edgeOf(assault.town) <= CAMP.reach, "from a camp in reach of it");
        assert.match(tell(marched, war), /^The Humans' army marches on .+, \d+ strong\.$/);
        assert.match(tell(camped, war), /^The Humans have made camp within a march of .+\.$/);
    });

    it("takes a town only by putting its garrison to the sword, and a seat's ruler and captain of its guard too", () => {
        const war = warOf();
        const town = war.towns.find(({ id, owner, kind }) => owner === "orc" && kind === "town" && id !== war.realm("orc").seat);
        const seat = war.town(war.realm("orc").seat);
        const attack = (target, size) => {
            const at = [target.at[0] + edgeOf(target.id) + 100, target.at[1]];

            war.camps.push({ id: `camp-${target.id}`, realm: "human", at, guard: 6, built: 0, done: 0, toward: target.id, used: 1e6, skirmished: 1e6 });
            war.forces = war.forces.filter((force) => !(force.kind === "army" && force.realm === "human"));

            const army = { id: `force-${target.id}`, realm: "human", kind: "army", size, at: [...target.at], path: [[...target.at]], leg: 0, target: target.id, home: war.realm("human").seat, mission: "attack", about: null, camp: `camp-${target.id}`, orders: null, went: size, arrived: null, since: 0 };

            war.forces.push(army);

            return army;
        };

        // (Its garrison put down, a turn's fighting: taken, a few of the army left to hold it)
        town.garrison = 3;
        attack(town, 50);

        const events = play(war, 1);
        const assault = events.find(({ type, town: id }) => type === "assault" && id === town.id);

        assert.ok(assault?.won);
        assert.equal(town.owner, "human");
        assert.equal(town.garrison, Math.ceil(HOLDINGS.town.garrison * 0.5));
        assert.match(tell(events.find(({ type }) => type === "taken"), war), /has fallen to the Humans, its garrison put to the sword/);

        // (A seat with none of its garrison left, and none to be raised: its ruler and captain of the
        // guard fought last)
        seat.garrison = 0;
        war.reserveOf("orc").size = 0;
        war.realm("orc").treasury = 0;
        attack(seat, 60);

        const stormed = play(war, 1).find(({ type, town: id }) => type === "assault" && id === seat.id);

        assert.equal(stormed.killed, LEADERS);
        assert.equal(war.realm("orc").overlord, "human");
    });

    it("waits before a town a player's near a while, for its fight to be played out there; then reckons it here", () => {
        const war = warOf();
        const town = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "village");
        const at = [town.at[0] + edgeOf(town.id) + 100, town.at[1]];

        town.garrison = 4;
        war.camps.push({ id: "camp-w", realm: "human", at, guard: 6, built: 0, done: 0, toward: town.id, used: 1e6, skirmished: 1e6 });
        war.forces.push({ id: "force-w", realm: "human", kind: "army", size: 40, at: [...town.at], path: [[...town.at]], leg: 0, target: town.id, home: war.realm("human").seat, mission: "attack", about: null, camp: "camp-w", orders: null, went: 40, arrived: null, since: 0 });
        war.watch([town.id]);

        const waited = play(war, WATCH_TURNS);

        assert.ok(!waited.some(({ type }) => type === "assault"), "waits");
        assert.equal(town.owner, "orc");
        assert.ok(play(war, 2).some(({ type, town: id }) => type === "assault" && id === town.id), "then reckoned");
    });

    it("falls back to its camp to be made up when it's beaten back too far, and goes at it again once it is", () => {
        const war = warOf();
        const town = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "city");
        const at = [town.at[0] + edgeOf(town.id) + 100, town.at[1]];

        // (As strongly held as the army's strong, behind its walls, and no reserve to come to it)
        town.garrison = 60;
        war.realm("orc").treasury = 0;
        war.reserveOf("orc").size = 0;
        war.camps.push({ id: "camp-f", realm: "human", at, guard: 6, built: 0, done: 0, toward: town.id, used: 1e6, skirmished: 1e6 });
        war.order("human", { raise: true });

        const army = war.armyOf("human");

        Object.assign(army, { size: 60, at: [...at], path: [[...at]], camp: "camp-f", mission: "camp" });
        assert.equal(war.order("human", { attack: town.id }), true);

        // (The orcs kept from raising anyone meanwhile)
        const hold = (turns) => {
            const events = [];

            for (let k = 0; k < turns; k++) {
                war.realm("orc").treasury = 0;
                events.push(...play(war, 1));
            }

            return events;
        };
        const events = hold(6);

        assert.ok(events.some(({ type, army: id }) => type === "fellBack" && id === army.id));
        assert.ok(["regroup", "attack"].includes(army.mission));
        assert.equal(army.orders?.about, town.id, "its orders kept till they're carried out");

        // (Made up again: at it again)
        town.garrison = 1;
        army.size = war.fullOf("human");

        const again = hold(10);

        assert.ok(again.some(({ type, town: id, won }) => type === "assault" && id === town.id && won));
        assert.equal(army.orders, null, "carried out");
    });

    it("takes a player's orders, if they can be carried out: raised, sent to camp, against what's in reach of a camp, home, disbanded into its towns", () => {
        const war = warOf();
        const town = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "village");

        assert.equal(war.order("human", { attack: town.id }), false, "(no army raised)");
        assert.equal(war.order("human", { raise: true }), true);
        assert.equal(war.order("human", { raise: true }), false, "(one at a time)");
        assert.equal(war.order("human", { nonsense: true }), false);

        const army = war.armyOf("human");

        // (No reserve of theirs to come against it)
        war.realm("orc").treasury = 0;
        war.reserveOf("orc").size = 0;
        army.size = 50;
        assert.equal(war.order("human", { attack: town.id }), false, "(no camp in reach of it)");
        assert.equal(war.order("human", { attack: war.towns.find(({ owner }) => owner === "elf").id }), false, "(not at war with them)");

        // (Sent to camp before it: there, it builds one, and holds)
        const site = [Math.round(town.at[0] + edgeOf(town.id) + 150), Math.round(town.at[1])];

        assert.equal(war.order("human", { camp: site }), true);
        assert.deepEqual(army.orders, { kind: "camp", about: site, by: null });

        for (let k = 0; k < 60 && army.orders; k++) {
            war.relations["human|orc"] = { state: "hostile", since: 0 };
            play(war, 1);
        }

        assert.equal(army.orders, null, "carried out");

        const camp = war.camp(army.camp);

        assert.ok(camp && apart(camp.at, site) < 1 && camp.built !== null);

        // (Against the town: in reach now)
        assert.equal(war.order("human", { attack: town.id }), true);

        // (Home; then disbanded, each of it back in the garrisons)
        assert.equal(war.order("human", { home: true }), true);
        assert.equal(army.mission, "home");

        const [left, before] = [army.size, war.power("human")];

        assert.equal(war.order("human", { disband: true }), true);
        assert.equal(war.armyOf("human"), null);
        assert.ok(war.power("human") >= before - left, "back in their towns");
        assert.equal(war.order("human", { home: true }), false);
    });

    it("sends its camps' skirmishers out against the enemy within reach, in pairs, now and then; strikes a camp no army's needed a while", () => {
        const war = warOf();
        const town = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "town");
        const at = [town.at[0] + edgeOf(town.id) + 200, town.at[1]];

        war.camps.push({ id: "camp-s", realm: "human", at, guard: CAMP.guard, built: 0, done: 0, toward: town.id, used: 0, skirmished: 0 });

        const events = play(war, CAMP.every * 6);
        const skirmishes = events.filter(({ type, camp }) => type === "skirmish" && camp === "camp-s");

        assert.ok(skirmishes.length >= 4, `${skirmishes.length}`);
        assert.ok(skirmishes.every(({ killed, lost }) => killed <= CAMP.pair && lost <= CAMP.pair));
        assert.ok(skirmishes.every(({ turn }, k) => !k || turn - skirmishes[k - 1].turn >= CAMP.every));

        // (No army near it a while: struck, its guard home)
        play(war, CAMP.idle);
        assert.equal(war.camp("camp-s"), null);
    });

    it("carries on a war kept before the standing armies: its expeditions, camps and relief home in their garrisons, each people's reserve at its seat", () => {
        const war = new War(plan);
        const town = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "town");
        const older = structuredClone(war.snapshot());

        town.garrison = 2;
        older.version = 4;
        older.towns.find(({ id }) => id === town.id).garrison = 2;
        older.forces = [{ id: "force-1", realm: "orc", kind: "camp", size: 9, at: [0, 0], path: [], leg: 0, target: "x", home: town.id, mission: null, about: null, since: 0 }];
        delete older.camps;
        delete older.nextCamp;

        const again = War.restore(plan, older);

        assert.equal(again.town(town.id).garrison, 11);
        assert.ok(again.forces.every(({ kind }) => kind === "reserve"));
        assert.ok(again.realms.every(({ id }) => again.reserveOf(id)));
        assert.deepEqual(again.camps, []);
    });

    it("has a fallen people's rising put a garrison to the sword to take back a town, or be put down", () => {
        const war = warOf();
        const lizard = war.realm("lizard");
        const old = war.towns.filter(({ race }) => race === "lizard");

        for (const town of old) {
            town.owner = "orc";
        }

        lizard.alive = false;
        lizard.unrest = RISING.ready;

        // (Its least held town's garrison too strong: crushed)
        for (const town of old) {
            town.garrison = 500;
        }

        const crushed = play(war, 1).find(({ type, realm }) => (type === "crushed" || type === "risen") && realm === "lizard");

        assert.equal(crushed?.type, "crushed");
        assert.equal(lizard.alive, false);
        assert.match(tell(crushed, war), /^The Lizard folk rose in .+, and the Orcs put the rising down\.$/);

        // (Weakly held: theirs, those of them left holding it)
        for (const town of old) {
            town.garrison = 1;
        }

        lizard.unrest = RISING.ready;

        const risen = play(war, 1).find(({ type, realm }) => type === "risen" && realm === "lizard");

        assert.ok(risen);
        assert.equal(war.town(risen.town).owner, "lizard");
        assert.ok(lizard.alive && war.town(risen.town).garrison > 0);
        assert.ok(war.reserveOf("lizard"));
    });
});
