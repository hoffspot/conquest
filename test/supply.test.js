// The armies' supply (core/war/supply.js, core/war/war.js; docs/WAR.md *Supply*): a wagon every few
// turns to each army in the field, from its seat for gold or from a depot nearer it; the wagons that
// don't get through, one after another: an alert, then a tenth deserting, then half, then the army
// broken up; none needed by an army at its seat or a reserve; the depots, built only in another
// people's lands, refilled from the nearest friendly seat, raided by skirmishers, razed by an enemy,
// gone after by a reserve in its own lands; a player's orders for supplies and for a depot; kept in
// a snapshot, and a war kept before them carried on
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { tell } from "../client/js/core/war/news.js";
import { DEPOT, HUNGER, SUPPLY } from "../client/js/core/war/supply.js";
import { TURN_MS, War } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

let plan;

before(() => {
    plan = planWorld(3);
});

// A war in its uneasy peace (no army raised of the rulers' own accord, none made up past what the
// age lets it be), with no one going to war, and the humans and orcs at war (kept so: at war)
function warOf({ gold = 1e5 } = {}) {
    const war = new War(plan);

    for (const realm of war.realms) {
        realm.leader.traits = { aggression: 0, greed: 0.5, loyalty: 0.5, grudge: 0.5, caution: 1 };
        realm.treasury = gold;
    }

    war.relations["human|orc"] = { state: "hostile", since: 0 };
    war.known.push("human|orc");

    return war;
}

// A people's army out in the field at a point, standing there (regrouped, and stronger than the age
// lets it be made up to, so it's sent nowhere and no one's raised for it)
function field(war, realm, at, size = 40) {
    const seat = war.realm(realm).seat;
    const army = { id: `force-${realm}`, realm, kind: "army", size, at: [...at], path: [[...at]], leg: 0, target: null, home: seat, mission: "regroup", about: null, camp: null, orders: null, went: size, arrived: null, supply: { due: war.turn + SUPPLY.every, missed: 0 }, since: war.turn };

    war.forces.push(army);

    return army;
}

const atWar = (war) => (war.relations["human|orc"] = { state: "hostile", since: 0 });

const play = (war, turns, keep = () => {}) => {
    const events = [];

    for (let k = 0; k < turns; k++) {
        atWar(war);
        keep();
        events.push(...war.advance(TURN_MS));
    }

    return events;
};

const toward = (from, to, metres) => {
    const length = apart(from, to);

    return [Math.round(from[0] + ((to[0] - from[0]) / length) * metres), Math.round(from[1] + ((to[1] - from[1]) / length) * metres)];
};

const wagonsTo = (war, id) => war.forces.filter(({ kind, target }) => kind === "supply" && target === id);

describe("the armies' supply (war.js, supply.js)", () => {
    it("sends an army in the field a wagon from its seat every few turns, paid for in gold, that gets there; none to one mustering at its seat, nor to a reserve", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        const army = field(war, "human", [seat.at[0] + 1000, seat.at[1]]);
        const reserve = war.reserveOf("human");
        let sent = null;

        // (Not before it's due)
        play(war, SUPPLY.every - 1);
        assert.equal(wagonsTo(war, army.id).length, 0);

        war.advance(TURN_MS);
        [sent] = wagonsTo(war, army.id);
        assert.ok(sent, "sent when it's due");
        assert.deepEqual([sent.home, sent.mission, sent.size], [seat.id, "army", SUPPLY.guards]);

        // (One at a time: none more while it's on its way; there within a few turns)
        const events = play(war, Math.ceil(1000 / SUPPLY.speed) + 1);

        assert.ok(events.some(({ type, army: id, from }) => type === "supplied" && id === army.id && from === seat.id));
        assert.ok(wagonsTo(war, army.id).length <= 1);
        assert.equal(army.supply.missed, 0);

        // (Back at its seat, mustering: fed there)
        Object.assign(army, { mission: "muster", at: [...seat.at], path: [[...seat.at]] });
        play(war, SUPPLY.every * 3);
        assert.equal(wagonsTo(war, army.id).length, 0);
        assert.ok(war.log.every(({ type, army: id }) => type !== "supplied" || id === army.id));
        assert.ok(!war.forces.some(({ kind, target }) => kind === "supply" && target === reserve.id));
    });

    it("alerts its people the first time a wagon doesn't get through, then a tenth deserts, then half, then the army breaks up; one that gets through ends it", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        const at = [seat.at[0] + 1200, seat.at[1]];
        const army = field(war, "human", at, 60);
        // (An orc army across its way, far too strong for the humans' reserve to go out against,
        // not near enough the humans' army to fight it)
        const across = field(war, "orc", [seat.at[0] + 500, seat.at[1]], 200);
        const losses = [];
        const hold = () => Object.assign(across, { at: [seat.at[0] + 500, seat.at[1]], supply: { due: war.turn + SUPPLY.every, missed: 0 } });

        for (let k = 0; k < 60 && losses.length < 2; k++) {
            losses.push(...play(war, 1, hold).filter(({ type, army: id }) => type === "unsupplied" && id === army.id));
        }

        assert.ok(war.log.some(({ type, realm, by, army: id }) => type === "wagonLost" && realm === "human" && by === "orc" && id === army.id));
        assert.deepEqual(
            losses.map(({ missed, deserted, why }) => [missed, deserted, why]),
            [
                [1, 0, "lost"],
                [2, Math.round(60 * HUNGER[1]), "lost"],
            ],
        );
        assert.equal(army.size, 60 - Math.round(60 * HUNGER[1]));

        // (The way clear: the next gets there, and it's over)
        war.forces.splice(war.forces.indexOf(across), 1);

        const events = play(war, SUPPLY.every + 6);

        assert.ok(events.some(({ type, army: id }) => type === "supplied" && id === army.id));
        assert.equal(army.supply.missed, 0);

        // (Cut off again, four in a row (a wagon past it already may get through first): a tenth
        // gone at the second, half at the third, broken up at the fourth)
        war.forces.push(across);

        const after = [];

        for (let k = 0; k < 80 && war.forces.includes(army); k++) {
            const size = army.size;

            after.push(...play(war, 1, hold).filter(({ army: id, type }) => id === army.id && ["unsupplied", "starved"].includes(type)).map((event) => ({ ...event, size })));
        }

        const last = after.slice(-4);

        assert.deepEqual(
            last.map(({ type, missed }) => [type, missed ?? null]),
            [
                ["unsupplied", 1],
                ["unsupplied", 2],
                ["unsupplied", 3],
                ["starved", null],
            ],
        );
        assert.deepEqual(
            last.map(({ deserted }) => deserted),
            last.map(({ size }, k) => (k < 3 ? Math.round(size * HUNGER[k]) : size)),
        );
        assert.ok(!war.forces.includes(army), "broken up");
        assert.equal(war.armyOf("human"), null);
        assert.match(tell(last[0], war), /The Humans' army's supplies haven't got through\./);
        assert.match(tell(last[1], war), /^Its supplies cut off again, \d+ of the Humans' army have deserted\.$/);
        assert.match(tell(last[3], war), /the Humans' army has broken up/);
    });

    it("counts one not sent for want of gold as one that didn't get through", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        const army = field(war, "human", [seat.at[0] + 800, seat.at[1]]);
        const events = play(war, SUPPLY.every + 1, () => (war.realm("human").treasury = -1e4));
        const unpaid = events.find(({ type, army: id }) => type === "unsupplied" && id === army.id);

        assert.deepEqual([unpaid?.missed, unpaid?.why], [1, "unpaid"]);
        assert.equal(wagonsTo(war, army.id).length, 0);
        assert.match(tell(unpaid, war), /there's no gold to pay for them/);
    });

    it("builds a depot only in another people's lands; up in a while with its first loads; refilled from the nearest friendly seat; supplying an army in reach of it rather than its seat", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        const own = war.towns.find(({ owner, id }) => owner === "human" && id !== seat.id);
        // (Beyond an elven town: the elves neither friends nor enemies)
        const elven = war.towns.filter(({ owner }) => owner === "elf").sort((a, b) => apart(a.at, seat.at) - apart(b.at, seat.at))[0];
        const at = toward(elven.at, seat.at, -300);

        assert.equal(war.order("human", { depot: [own.at[0] + 50, own.at[1]] }), false, "not in its own lands");
        assert.equal(war.order("human", { depot: at }), true);

        const [depot] = war.depots;

        assert.deepEqual([depot.realm, depot.built, depot.guard, depot.level], ["human", null, DEPOT.guard, 0]);

        const events = play(war, DEPOT.build);

        assert.ok(events.some(({ type, depot: id }) => type === "depot" && id === depot.id));
        assert.equal(depot.level, DEPOT.start);
        assert.match(tell(events.find(({ type }) => type === "depot"), war), /^The Humans have set up a supply depot/);

        // (Short: a load from the nearest seat of theirs or a friend's, paid for)
        const refill = war.forces.find(({ kind, target }) => kind === "supply" && target === depot.id) ?? (play(war, 1), war.forces.find(({ kind, target }) => kind === "supply" && target === depot.id));

        assert.ok(refill, "a load on its way");
        assert.equal(refill.home, seat.id);
        assert.equal(refill.mission, "depot");

        const level = depot.level;
        const refilled = play(war, Math.ceil(apart(seat.at, depot.at) / SUPPLY.speed) + 1);

        assert.ok(refilled.some(({ type, depot: id }) => type === "provisioned" && id === depot.id));
        assert.ok(depot.level > level);

        // (An army in reach of it, nearer it than its seat: supplied from it, a load the less)
        const army = field(war, "human", toward(depot.at, elven.at, 200));
        const before = depot.level;

        play(war, SUPPLY.every + 1);

        const wagon = wagonsTo(war, army.id)[0] ?? war.log.findLast(({ type, army: id }) => type === "supplied" && id === army.id);

        assert.equal(wagon.home ?? wagon.from, depot.id);
        assert.ok(depot.level <= before, "a load taken from it");
        assert.ok(depot.used > depot.built);
    });

    it("has its rulers build a depot for an army campaigning far from their seat, behind its camp", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        // (An orc town far enough off that its camp, and the depot behind it, are in the orcs' lands)
        const nearestTo = (point) => war.towns.reduce((best, town) => (!best || apart(town.at, point) < apart(best.at, point) ? town : best), null);
        const far = war.towns
            .filter(({ owner }) => owner === "orc")
            .sort((a, b) => apart(a.at, seat.at) - apart(b.at, seat.at))
            .find((town) => apart(town.at, seat.at) > DEPOT.far + 1000 && nearestTo(toward(town.at, seat.at, 400 + DEPOT.back)).owner === "orc");
        const at = toward(far.at, seat.at, 400);

        assert.ok(apart(at, seat.at) > DEPOT.far);
        war.camps.push({ id: "camp-900", realm: "human", at, guard: 6, built: 0, done: 0, toward: far.id, used: 1e6, skirmished: 1e6 });

        const army = field(war, "human", at);

        army.camp = "camp-900";
        play(war, 1);

        const [depot] = war.depots;

        assert.ok(depot, "built");
        assert.equal(depot.realm, "human");
        assert.equal(depot.toward, far.id);
        assert.ok(Math.abs(apart(depot.at, at) - DEPOT.back) < 2, `${apart(depot.at, at)} m behind its camp`);
        assert.ok(apart(depot.at, seat.at) < apart(at, seat.at), "towards home");

        // (One's enough while it's in reach)
        play(war, 3);
        assert.equal(war.depots.length, 1);
    });

    it("has its rulers build none at peace, nor for an army going home; and strike one no army's drawn on a while", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        const elven = war.towns.filter(({ owner }) => owner === "elf").sort((a, b) => apart(b.at, seat.at) - apart(a.at, seat.at))[0];
        const at = toward(elven.at, seat.at, 400);

        war.camps.push({ id: "camp-900", realm: "human", at, guard: 6, built: 0, done: 0, toward: elven.id, used: 1e6, skirmished: 1e6 });

        const army = field(war, "human", at);

        army.camp = "camp-900";

        // (At peace with everyone: none)
        delete war.relations["human|orc"];
        war.advance(TURN_MS);
        assert.equal(war.depots.length, 0);

        // (At war, but going home: none)
        atWar(war);
        army.mission = "home";
        war.advance(TURN_MS);
        assert.equal(war.depots.length, 0);

        // (A depot no army's drawn on for a while: struck, its guard home)
        assert.ok(war.order("human", { depot: toward(elven.at, seat.at, -200) }));

        const [depot] = war.depots;
        const struck = play(war, DEPOT.build + DEPOT.idle + 2, () => (army.mission = "muster"));

        assert.ok(struck.some(({ type, depot: id }) => type === "struck" && id === depot.id));
        assert.ok(!war.depots.includes(depot));
        assert.match(tell(struck.find(({ type }) => type === "struck"), war), /struck one of their supply depots/);
    });

    it("has a depot raided by skirmishers, gone after by a reserve in its people's lands, and razed by an enemy upon it", () => {
        const war = warOf();
        const theirs = war.town(war.realm("orc").seat);
        const near = war.towns.filter(({ owner, id }) => owner === "orc" && id !== theirs.id).sort((a, b) => apart(a.at, theirs.at) - apart(b.at, theirs.at))[0];
        const at = toward(near.at, theirs.at, -500);
        const depot = { id: "depot-900", realm: "human", at, guard: DEPOT.guard, built: 0, done: 0, level: 4, toward: near.id, used: 0, by: null };

        war.depots.push(depot);

        // (An orc camp beside it: its skirmishers carry off loads)
        war.camps.push({ id: "camp-901", realm: "orc", at: [at[0] + 40, at[1]], guard: 6, built: 0, done: 0, toward: null, used: 1e6, skirmished: -10 });

        const raids = [];

        for (let k = 0; k < 30 && !raids.some(({ killed }) => killed > 0); k++) {
            raids.push(...play(war, 1, () => (war.reserveOf("orc").size = 0)).filter(({ type, target }) => type === "skirmish" && target === depot.id));
        }

        assert.ok(raids.some(({ killed }) => killed > 0), "raided");
        assert.ok(depot.level < 4 + 1);
        assert.match(tell(raids[0], war), /fell on the Humans' supply depot/);

        // (Their reserve, strong enough, goes after it in its own lands)
        war.camps.splice(war.camps.findIndex(({ id }) => id === "camp-901"), 1);

        const reserve = war.reserveOf("orc");

        reserve.size = 40;
        Object.assign(reserve, { at: [...theirs.at], path: [[...theirs.at]], leg: 0 });
        play(war, 1);
        assert.equal(reserve.mission, "defend");
        assert.equal(reserve.target, depot.id);

        // (Upon it: its guard put down, it's razed)
        const events = play(war, 20);
        const razed = events.find(({ type, depot: id }) => type === "razed" && id === depot.id);

        assert.ok(razed, "razed");
        assert.equal(razed.by, "orc");
        assert.ok(!war.depots.includes(depot));
        assert.match(tell(razed, war), /^The Orcs have razed the Humans' supply depot/);
    });

    it("takes a player's orders: supplies sent for now, one at a time; a depot built where they say, so many at most", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        const army = field(war, "human", [seat.at[0] + 900, seat.at[1]]);

        assert.equal(war.order("human", { supply: true }), true);
        assert.equal(wagonsTo(war, army.id).length, 1);
        assert.equal(war.order("human", { supply: true }), false, "one on its way already");

        const elven = war.towns.filter(({ owner }) => owner === "elf");

        for (let k = 0; k < DEPOT.per; k++) {
            assert.equal(war.order("human", { depot: toward(elven[k].at, seat.at, -200) }), true);
        }

        assert.equal(war.order("human", { depot: toward(elven[DEPOT.per].at, seat.at, -200) }), false, "no more than they may keep");
        assert.ok(war.depots.every(({ by }) => by === null));
        assert.ok(war.log.some(({ type, depot }) => type === "ordered" && depot));
    });

    it("keeps its wagons and depots in a snapshot, carrying on the same; a war kept before them carries on, each army's wagon due a while from now", () => {
        const war = warOf();
        const seat = war.town(war.realm("human").seat);
        const elven = war.towns.find(({ owner }) => owner === "elf");

        field(war, "human", [seat.at[0] + 1000, seat.at[1]]);
        assert.ok(war.order("human", { depot: toward(elven.at, seat.at, -200) }));
        play(war, SUPPLY.every + 1);

        const again = War.restore(plan, structuredClone(war.snapshot()));

        play(war, 20);
        play(again, 20);
        assert.deepEqual(again.snapshot(), war.snapshot());

        // (Kept by version 5: no depots, its armies' supply not yet reckoned)
        const older = structuredClone(war.snapshot());

        older.version = 5;
        delete older.depots;
        delete older.nextDepot;

        for (const force of older.forces) {
            delete force.supply;
        }

        older.forces = older.forces.filter(({ kind }) => kind !== "supply");

        const kept = War.restore(plan, older);

        assert.deepEqual(kept.depots, []);
        assert.ok(kept.forces.filter(({ kind }) => kind === "army").every(({ supply }) => supply.missed === 0 && supply.due === kept.turn + SUPPLY.every));
    });
});
