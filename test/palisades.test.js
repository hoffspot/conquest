// Pressing the advantage (core/war/war.js, armies.js; docs/WAR.md *Standing armies*): either side
// in the field breaking once it's had enough; an army at its camp behind its palisade, its guard
// beside it, stormed by a reserve strong enough, the camp razed and the army sent home and let go,
// or the palisade breached as hard as it was pressed; breaches mended in quiet for stakes from the
// stores; a reserve following an army beaten back to its camp; and, with no army in its lands, a
// reserve going against the other troubles there
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { ARMY, CAMP, PALISADE } from "../client/js/core/war/armies.js";
import { tell } from "../client/js/core/war/news.js";
import { DUTY, STAGES, TURN_MS, War, WORKED } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

let plan;

before(() => {
    plan = planWorld(3);
});

// A war as far on as it goes, with no one going to war of their own accord, the humans and the orcs
// at war, and (`calm`) the wild's brigands' camps all scattered for good
function warOf({ calm = true } = {}) {
    const war = new War(plan);

    war.stage = STAGES.length - 1;

    for (const realm of war.realms) {
        realm.leader.traits = { aggression: 0, greed: 0.5, loyalty: 0.5, grudge: 0.5, caution: 1 };
        realm.treasury = 1e5;
    }

    war.relations["human|orc"] = { state: "hostile", since: 0 };
    war.known.push("human|orc");

    for (const camp of calm ? plan.camps : []) {
        war.scattered[camp.id] = Infinity;
    }

    return war;
}

const play = (war, turns) => {
    const events = [];

    for (let k = 0; k < turns; k++) {
        events.push(...war.advance(TURN_MS));
    }

    return events;
};

const edgeOf = (id) => plan.places.find((place) => place.id === id).radius ?? 0;

// The humans' army at its camp (built, its guard whole) before an orc town, and the orcs' reserve
// beside it, nothing more raised by either
function atCamp(war, { army: size, reserve: theirs, breaches = 0 }) {
    const town = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "town");
    const at = [town.at[0] + edgeOf(town.id) + 200, town.at[1]];
    const camp = { id: "camp-h", realm: "human", at, guard: CAMP.guard, built: 0, done: 0, toward: town.id, used: 1e6, skirmished: 1e6, breaches, troubled: null };
    const army = { id: "force-human", realm: "human", kind: "army", size, at: [...at], path: [[...at]], leg: 0, target: null, home: war.realm("human").seat, mission: "camp", about: [...at], camp: camp.id, orders: null, went: size, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 };
    const reserve = war.reserveOf("orc");

    war.camps.push(camp);
    war.forces = war.forces.filter((force) => !(force.kind === "army" && force.realm === "human"));
    war.forces.push(army);
    Object.assign(reserve, { size: theirs, at: [at[0] + 150, at[1]], path: [[at[0] + 150, at[1]]], leg: 0 });

    for (const id of ["human", "orc"]) {
        war.realm(id).treasury = 0;
    }

    return { town, camp, army, reserve };
}

describe("pressing the advantage (war.js, armies.js)", () => {
    it("breaks either side in the field once it's had enough: the beaten gets away with what's left of it", () => {
        const war = warOf();
        const town = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "town");
        const at = [town.at[0] + 300, town.at[1]];
        const reserve = war.reserveOf("orc");
        const army = { id: "force-human", realm: "human", kind: "army", size: 60, at: [...at], path: [[...at]], leg: 0, target: null, home: war.realm("human").seat, mission: "attack", about: null, camp: null, orders: null, went: 60, arrived: null, since: 0 };

        war.forces = war.forces.filter((force) => !(force.kind === "army" && force.realm === "human"));
        war.forces.push(army);
        Object.assign(reserve, { size: 30, at: [at[0] + 50, at[1]], path: [[at[0] + 50, at[1]]], leg: 0 });
        war.realm("orc").treasury = 0;

        const battle = play(war, 1).find(({ type, other }) => type === "battle" && other === reserve.id);

        assert.ok(battle?.won, "the army won");
        assert.ok(reserve.size > 0 && reserve.size < 30 * ARMY.rout, `broke with ${reserve.size} left`);
        assert.equal(reserve.mission, "back");
        assert.equal(ARMY.flee, 3);
    });

    it("stands an army at its camp behind its palisade, its guard beside it: stormed by enough, the camp's razed and the army sent home, and let go", () => {
        const war = warOf();
        const { camp, army, reserve } = atCamp(war, { army: 20, reserve: 60 });

        const events = play(war, 1);
        const stormed = events.find(({ type }) => type === "stormed");

        assert.ok(stormed?.won, "stormed");
        assert.equal(stormed.reserve, reserve.id);
        assert.equal(war.camp(camp.id), null, "razed");
        assert.ok(events.some(({ type, camp: id, by }) => type === "razed" && id === camp.id && by === "orc"));
        assert.equal(army.mission, "home");
        assert.match(tell(stormed, war), /^The Orcs' reserve stormed the Humans' camp before .+, and sent their army home\.$/);

        // (On its way home: let go)
        play(war, 2);
        assert.notEqual(reserve.target, army.id, "let go");
    });

    it("storms a camp only at its strength behind the palisade (DEFEND.camp)", () => {
        const war = warOf();
        const { camp, army, reserve } = atCamp(war, { army: 40, reserve: 50 });
        const behind = (army.size + camp.guard) * PALISADE.walls;

        // (Too few for it: not stormed)
        assert.ok(reserve.size < behind);
        assert.ok(!play(war, 1).some(({ type }) => type === "stormed"));
        assert.notEqual(reserve.target, army.id);

        // (As many: stormed, carried or beaten off)
        reserve.size = Math.ceil(behind);

        const stormed = play(war, 1).find(({ type }) => type === "stormed");

        assert.ok(stormed, "stormed");
        assert.equal(war.camp(camp.id) === null, stormed.won);
    });

    it("breaches the palisade of a camp whose assault's beaten off, as hard as it was pressed", () => {
        const war = warOf();
        const { camp, army, reserve } = atCamp(war, { army: 20, reserve: 0 });
        const theirs = { id: "force-orc", realm: "orc", kind: "army", size: 3, at: [camp.at[0] + 50, camp.at[1]], path: [[camp.at[0] + 50, camp.at[1]]], leg: 0, target: null, home: war.realm("orc").seat, mission: "camp", about: null, camp: null, orders: null, went: 3, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 };

        // (Its army away: the orcs' few upon its guard behind the palisade)
        war.forces.splice(war.forces.indexOf(army), 1);
        war.forces = war.forces.filter((force) => !(force.kind === "army" && force.realm === "orc"));
        war.forces.push(theirs);
        reserve.size = 0;

        const battle = play(war, 1).find(({ type, camp: id }) => type === "battle" && id === camp.id);

        assert.ok(battle && !battle.won, "beaten off");
        assert.ok(battle.killed > 0);
        assert.equal(camp.breaches, Math.min(PALISADE.most, Math.floor(battle.killed / CAMP.guard / PALISADE.press + 1e-9)));
        assert.ok(camp.breaches > 0, `${battle.killed} of ${CAMP.guard} brought down`);
        assert.equal(camp.troubled, war.turn);
    });

    it("counts each breach against the palisade, as far as open ground", () => {
        const war = warOf();
        const { camp, army, reserve } = atCamp(war, { army: 40, reserve: 0, breaches: PALISADE.most });

        // (Breached as far as it goes: the camp as strong as its army and guard in the open)
        reserve.size = army.size + camp.guard;
        play(war, 1);
        assert.equal(reserve.target, army.id, "out against it at its strength in the open");
    });

    it("mends its palisade once no enemy's been near a while: a breach a turn, two with its army there, each for its stakes from its people's stores; none with none", () => {
        const war = warOf();
        const { camp, army } = atCamp(war, { army: 30, reserve: 0, breaches: 3 });
        const stores = war.realm("human").stores;

        // (No enemy near it: the humans and the orcs at peace, their army ordered to hold it)
        war.relations["human|orc"] = { state: "neutral", since: 0 };
        army.orders = { kind: "camp", about: [...camp.at] };
        stores.wood = 100;

        // (Its army there: two a turn)
        const mended = play(war, 1).find(({ type }) => type === "mended");

        assert.equal(mended?.mended, PALISADE.army);
        assert.equal(camp.breaches, 1);
        assert.equal(stores.wood, 100 - PALISADE.stakes.wood * PALISADE.army);

        // (Its army gone: one a turn by its guard)
        war.forces.splice(war.forces.indexOf(army), 1);
        camp.breaches = 3;
        play(war, 1);
        assert.equal(camp.breaches, 2);

        // (Fought at: not till it's been quiet a while)
        camp.troubled = war.turn;
        play(war, 1);
        assert.equal(camp.breaches, 2, "not straight after");
        play(war, PALISADE.quiet - 1);
        assert.equal(camp.breaches, 1);

        // (No wood: none)
        stores.wood = 0;
        play(war, 2);
        assert.equal(camp.breaches, 1);
    });

    it("sends its reserve, with no army in its lands, against an enemy's fortification there: battered and razed", () => {
        const war = warOf();
        const town = war.towns.find(({ owner, kind }) => owner === "orc" && kind === "town");
        const reserve = war.reserveOf("orc");

        war.forts.push({ id: "fort-h", kind: "tower", realm: "human", at: [town.at[0] + edgeOf(town.id) + 60, town.at[1]], hp: 1200, about: town.id, toward: town.id, built: 0, by: null, struck: null });
        reserve.size = 60;
        war.realm("orc").treasury = 0;

        const events = play(war, 40);

        assert.ok(events.some(({ type, fort, by }) => type === "razed" && fort === "fort-h" && by === "orc"), "razed");
        assert.equal(war.fort("fort-h"), null);
    });

    it("sends its reserve against its works held by the wild's band: won back, held by a full guard", () => {
        const war = warOf();
        const works = war.works.find(({ owner }) => owner === "orc");
        const reserve = war.reserveOf("orc");

        Object.assign(works, { held: true, band: 6, guard: 0, escort: 0, yard: 0 });
        reserve.size = 60;
        war.realm("orc").treasury = 0;

        const events = play(war, 40);

        assert.ok(events.some(({ type, works: id, realm }) => type === "retaken" && id === works.id && realm === "orc"), "won back");
        assert.ok(!works.held && works.guard === WORKED.guard);
    });

    it("sends its reserve against a brigands' camp in its lands: scattered a while, no ambushes from it meanwhile", () => {
        const war = warOf({ calm: false });
        const reserve = war.reserveOf("orc");
        const orcs = war.towns.filter(({ owner }) => owner === "orc");
        const near = plan.camps.filter(({ faction, at }) => ["bandits", "raiders", "goblins"].includes(faction) && orcs.some((town) => apart(town.at, at) <= 1000));

        assert.ok(near.length, "a brigands' camp in the orcs' lands");
        reserve.size = 60;

        const events = play(war, 60);
        const scattered = events.find(({ type, realm }) => type === "scattered" && realm === "orc");

        assert.ok(scattered, "scattered");
        assert.equal(war.scattered[scattered.camp], scattered.turn + DUTY.scattered);
        assert.match(tell(events.find(({ type, brigands }) => type === "battle" && brigands === scattered.camp), war), /^The Orcs' reserve fell upon the .+ camped in their lands and scattered them\.$/);
    });

    it("keeps the palisades' breaches and the brigands scattered, and carries on from a war kept before them", () => {
        const war = warOf();

        atCamp(war, { army: 30, reserve: 0, breaches: 2 });
        war.scattered = { "camp-x": 99 };

        const again = War.restore(plan, war.snapshot());

        assert.equal(again.camp("camp-h").breaches, 2);
        assert.deepEqual(again.scattered, { "camp-x": 99 });
        assert.deepEqual(again.snapshot(), war.snapshot());

        const older = war.snapshot();

        older.version = 6;
        delete older.scattered;
        assert.deepEqual(War.restore(plan, older).scattered, {});
    });
});
