// The war for the continent (client/js/core/war): the six peoples' realms and rulers, the towns
// they hold, their treasuries and the forces they send out, what they think of each other, who
// brings whom under them, how far the war's got and what it lets happen; the roads the forces go
// by; the news of it; all of it the same for a seed, and kept and made again to carry on exactly
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { describeLeader, REALMS, TEMPERAMENTS, TRAITS } from "../client/js/core/war/peoples.js";
import { ACROSS_COUNTRY, Roads } from "../client/js/core/war/roads.js";
import { tell } from "../client/js/core/war/news.js";
import { COUNSEL_TURNS, HOLDINGS, REACH, SERVES, SIEGE, STAGES, TURN_MS, TURNS_PER_STAGE, War } from "../client/js/core/war/war.js";
import { decode, encode } from "../client/js/core/wire.js";
import { planWorld, RACES } from "../client/js/core/worldplan/plan.js";

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);

/** Play a war on, a turn at a time, collecting what happened (and the stage each turn was at). */
function play(war, turns) {
    const events = [];

    for (let k = 0; k < turns; k++) {
        events.push(...war.advance(TURN_MS).map((event) => ({ ...event, stage: war.stage })));
    }

    return events;
}

describe("the war (core/war)", () => {
    let plan;
    let long;

    before(() => {
        plan = planWorld(3);

        // A long war at full might, looked over by several tests
        const war = new War(plan);

        war.setMight(8);
        long = { war, events: play(war, 700) };
    });

    it("gives each people a realm ruled from its capital, its leader's traits rolled about its temperament, the same for a seed", () => {
        const war = new War(plan);
        const again = new War(plan);
        const other = new War(planWorld(4));

        assert.deepEqual(war.realms.map(({ id }) => id), RACES.map(({ id }) => id));

        for (const realm of war.realms) {
            const capital = plan.places.find(({ id }) => id === realm.capital);
            const temperament = TEMPERAMENTS[realm.id];

            assert.equal(capital.kind, "capital");
            assert.equal(capital.race, realm.id);
            assert.equal(realm.seat, realm.capital);
            assert.ok(realm.name.includes(REALMS[realm.id].realm) && realm.name.includes(capital.name), realm.name);
            assert.ok(REALMS[realm.id].titles.includes(realm.leader.title));
            assert.match(realm.leader.name, /^[A-Z][a-z]+$/);

            for (const trait of TRAITS) {
                const value = realm.leader.traits[trait];

                assert.ok(value >= 0 && value <= 1 && Math.abs(value - temperament[trait]) <= temperament.spread + 1e-9, `${realm.id} ${trait} ${value}`);
            }
        }

        assert.deepEqual(again.realms, war.realms);
        assert.notDeepEqual(other.realms.map(({ leader }) => leader), war.realms.map(({ leader }) => leader));
    });

    it("holds every capital, city, town and village, each garrisoned in full by its own people", () => {
        const war = new War(plan);
        const fought = plan.places.filter(({ kind }) => kind in HOLDINGS);

        assert.equal(war.towns.length, fought.length);

        for (const town of war.towns) {
            assert.equal(town.owner, town.race);
            assert.equal(town.garrison, HOLDINGS[town.kind].garrison);
        }

        // A hamlet or farmstead goes with the town nearest it
        const hamlet = plan.places.find(({ kind }) => kind === "hamlet");
        const holding = war.holdingAt(hamlet.at);

        assert.ok(war.towns.every((town) => apart(town.at, hamlet.at) >= apart(holding.at, hamlet.at)));
    });

    it("finds the way between any two places by the roads, across country (slower) where there's none", () => {
        const roads = new Roads(plan);
        const capitals = plan.places.filter(({ kind }) => kind === "capital");

        for (const from of capitals) {
            for (const to of capitals.filter((each) => each !== from)) {
                const route = roads.route(from.id, to.id);

                assert.ok(route, `${from.id} to ${to.id}`);
                assert.ok(apart(route.points[0], from.at) < 1 && apart(route.points.at(-1), to.at) < 40);
                assert.ok(route.length >= apart(from.at, to.at) - 1);
            }
        }

        // Every place can be reached from every capital, somehow
        for (const place of plan.places) {
            assert.ok(roads.route(capitals[0].id, place.id), place.id);
        }

        // Across country counts for more than by road
        const across = [...roads.edges.values()].flat().find(({ kind }) => kind === "across");

        assert.ok(Math.abs(across.length - apart(across.points[0], across.points[1]) * ACROSS_COUNTRY) < 1e-6);
        assert.equal(roads.route("nowhere", capitals[0].id), null);
    });

    it("plays out the same for the same seed, and carries on from a snapshot exactly as it would have", () => {
        const [war, twin] = [new War(plan), new War(plan)];

        for (const each of [war, twin]) {
            each.setMight(5);
        }

        assert.deepEqual(play(twin, 150), play(war, 150));
        assert.equal(encode(twin.snapshot()), encode(war.snapshot()));

        const again = War.restore(plan, decode(encode(war.snapshot())));

        assert.deepEqual(play(again, 150), play(war, 150));
        assert.equal(encode(again.snapshot()), encode(war.snapshot()));
        assert.throws(() => War.restore(plan, { ...war.snapshot(), version: 0 }), /another version/);
    });

    it("moves on a turn at a time, only as play goes on", () => {
        const war = new War(plan);

        assert.deepEqual(war.advance(TURN_MS - 1), []);
        assert.equal(war.turn, 0);
        war.advance(1);
        assert.equal(war.turn, 1);
        war.advance(TURN_MS * 3 + 10);
        assert.equal(war.turn, 4);
        assert.equal(war.clock, 10);
    });

    it("takes nothing in an uneasy peace (only raids), and comes on with the players' might, or with time", () => {
        const war = new War(plan);
        const events = play(war, TURNS_PER_STAGE - 1);

        assert.equal(war.stage, 0);
        assert.ok(!events.some(({ type }) => type === "taken" || type === "assault"));
        assert.ok(events.some(({ type }) => type === "declared"), "(wars are declared)");
        assert.ok(events.some(({ type }) => type === "raid"), "(and raided)");

        play(war, 1);
        assert.equal(war.stage, 1, "(time brings the border wars)");
        war.setMight(4);
        assert.deepEqual(play(war, 1).filter(({ type }) => type === "stage").map(({ stage }) => stage), [2]);
        war.setMight(0);
        play(war, 1);
        assert.equal(war.stage, 2, "(and never goes back)");
    });

    it("takes only what the war's stage allows, and storms a town only after sitting before it a while", () => {
        const takes = long.events.filter(({ type }) => type === "taken");

        assert.ok(takes.length > 10);

        for (const event of long.events.filter(({ type }) => type === "taken" || type === "assault")) {
            const town = long.war.town(event.town);

            assert.ok(STAGES[event.stage].take.includes(town.kind), `${town.kind} in ${STAGES[event.stage].id}`);
        }

        const camped = new Map();

        for (const event of long.events) {
            if (event.type === "camped") {
                camped.set(`${event.realm} ${event.target}`, camped.get(`${event.realm} ${event.target}`) ?? event.turn);
            } else if (event.type === "assault") {
                assert.ok(event.turn - camped.get(`${event.realm} ${event.town}`) >= SIEGE, `${event.realm} at ${event.town}`);
            }
        }
    });

    it("keeps its books: no one below nothing, every town someone's, vassals serving a liege directly, dealings only between lieges", () => {
        const { war } = long;
        const ids = war.realms.map(({ id }) => id);

        for (const town of war.towns) {
            assert.ok(ids.includes(town.owner));
            assert.ok(town.garrison >= 0);
        }

        for (const force of war.forces) {
            assert.ok(force.size >= 0 && war.realm(force.realm).alive);
        }

        for (const realm of war.realms) {
            assert.ok(realm.treasury >= 0);

            if (realm.overlord) {
                assert.equal(war.realm(realm.overlord).overlord, null, "(no vassal of a vassal)");
                assert.equal(war.relation(realm.id, realm.overlord), "overlord");
                assert.equal(war.relation(realm.overlord, realm.id), "vassal");
            }
        }

        for (const key of Object.keys(war.relations)) {
            assert.ok(key.split("|").every((id) => !war.realm(id).overlord), key);
        }
    });

    it("brings a people under whoever takes its rulers' seat: it rules from it again, as their vassal, their friends its friends", () => {
        const war = new War(plan);
        const human = war.realm("human");
        const capital = war.town(human.capital);
        const others = war.towns.filter(({ owner }) => owner === "human").length;

        war.setMight(8);
        war.known.push("human|orc", "cat|human", "cat|orc");
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.relations["cat|human"] = { state: "hostile", since: 0 };
        war.relations["cat|orc"] = { state: "allied", since: 0 };
        war.forces.push({ id: "force-test", realm: "orc", kind: "camp", size: 400, at: [capital.at[0] + 200, capital.at[1]], path: [], leg: 0, target: capital.id, home: war.realm("orc").capital, mission: null, about: null, since: -SIEGE });

        const events = play(war, 1);

        assert.ok(events.some(({ type, town, to }) => type === "taken" && town === capital.id && to === "orc"));
        assert.ok(events.some(({ type, realm, by }) => type === "subjugated" && realm === "human" && by === "orc"));
        assert.equal(human.overlord, "orc");
        assert.equal(capital.owner, "human", "(its seat given back to rule from)");
        assert.equal(war.towns.filter(({ owner }) => owner === "human").length, others);
        assert.ok(war.friendly("human", "orc") && war.friendly("human", "cat"));
        assert.ok(!Object.keys(war.relations).some((key) => key.includes("human")));
        assert.equal(war.liege("human"), "orc");
        assert.ok(war.strength("orc") > war.power("orc"));
    });

    it("pays a vassal's tribute to its liege", () => {
        const war = new War(plan);
        const human = war.realm("human");

        human.overlord = "elf";

        const [before, liege] = [human.treasury, war.realm("elf").treasury];
        const taxes = war.towns.filter(({ owner }) => owner === "human").reduce((sum, { kind }) => sum + HOLDINGS[kind].tax, 0);

        play(war, 1);

        // (Each paid half its taxes over, less its keep)
        assert.ok(human.treasury - before < taxes / 2 + 1e-6);
        assert.ok(war.realm("elf").treasury - liege > taxes / 2 - 30);
    });

    it("sends envoys that make truces and alliances, or are turned away, and may be waylaid on the road", () => {
        const { events } = long;
        const treaties = events.filter(({ type }) => type === "treaty");

        assert.ok(events.some(({ type }) => type === "envoy"));
        assert.ok(treaties.length > 3);
        assert.ok(treaties.some(({ accepted }) => accepted) && treaties.some(({ accepted }) => !accepted));

        // A truce taken: at peace from that turn
        const war = new War(plan);

        war.known.push("elf|human");
        war.relations["elf|human"] = { state: "hostile", since: 0 };
        war.realm("elf").leader.traits.caution = 1;
        war.realm("elf").standing.human = 100;

        const elves = war.town(war.realm("elf").seat);

        war.forces.push({ id: "force-envoy", realm: "human", kind: "envoy", size: 0, at: [...elves.at], path: [elves.at], leg: 0, target: "elf", home: war.realm("human").seat, mission: "truce", about: null, since: 0 });

        const treaty = play(war, 1).find(({ type, from }) => type === "treaty" && from === "human");

        assert.equal(treaty?.mission, "truce");
        assert.equal(war.relation("human", "elf"), treaty.accepted ? "neutral" : "hostile");
    });

    it("remembers grudges and favours, which fade", () => {
        const war = new War(plan);

        war.remember("elf", "orc", -40);
        war.remember("elf", "orc", -80);
        assert.equal(war.realm("elf").standing.orc, -100);
        war.remember("elf", "elf", 50);
        assert.equal(war.realm("elf").standing.elf, undefined);

        play(war, 10);
        assert.ok(war.realm("elf").standing.orc > -100 && war.realm("elf").standing.orc < -50);
    });

    it("hears of fights played out in the world: a garrison or force losing some", () => {
        const war = new War(plan);
        const town = war.towns[0];

        war.loss(town.id, 3.4);
        assert.equal(town.garrison, HOLDINGS[town.kind].garrison - 3);
        war.loss(town.id, 1000);
        assert.equal(town.garrison, 0);
    });

    it("takes a tithe into a realm's treasury", () => {
        const war = new War(plan);
        const before = war.realm("human").treasury;

        assert.equal(war.give("human", 12), true);
        assert.equal(war.realm("human").treasury, before + 12);
        assert.equal(war.give("human", -5), false);
        assert.equal(war.give("nowhere", 5), false);
    });

    it("heeds a player's counsel, if it can be done: marching where they say, seeking peace, or going to war", () => {
        const setUp = () => {
            const war = new War(plan);

            war.setMight(8);

            war.realm("human").treasury = 1e5;

            for (const realm of war.realms) {
                realm.leader.traits = { aggression: 0.5, greed: 0.5, loyalty: 0.5, grudge: 0.5, caution: 0.5 };
            }

            return war;
        };

        // Only fitting counsel, to a realm that decides for itself
        const war = setUp();
        const enemy = war.realms.find(({ id }) => id !== "human" && war.relation("human", id) === "neutral").id;
        const theirs = war.towns.find(({ owner }) => owner === enemy);

        assert.equal(war.counsel("human", { march: theirs.id }, 1), false, "(not at war with them)");
        assert.equal(war.counsel("human", { peace: enemy }, 1), false, "(no war to make peace in)");
        assert.equal(war.counsel("human", { war: enemy }, 0), false, "(counsel that weighs nothing)");
        assert.equal(war.counsel("human", { nonsense: enemy }, 1), false);
        assert.equal(war.counsel("human", { war: enemy }, 1), true);
        assert.deepEqual(war.realm("human").counsel, { war: enemy, weight: 1, until: war.turn + COUNSEL_TURNS });
        assert.equal(tell(war.log.at(-1), war).startsWith("The Humans are counselled to war with"), true);

        war.realm("elf").overlord = "human";
        assert.equal(war.counsel("elf", { war: enemy }, 1), false, "(a vassal's overlord decides)");
        war.realm("elf").overlord = null;

        // Counselled to war, they go to war (sooner or later)
        const events = play(war, COUNSEL_TURNS);

        assert.ok(events.some(({ type, by, on }) => type === "declared" && by === "human" && on === enemy));
        assert.equal(war.realm("human").counsel, null);

        // Counselled to march on the furthest of an enemy's towns: they march there
        const marching = setUp();
        const home = marching.town(marching.realm("human").capital);
        const far = marching.towns.filter(({ owner }) => owner === enemy).sort((a, b) => apart(b.at, home.at) - apart(a.at, home.at))[0];

        marching.relations[["human", enemy].sort().join("|")] = { state: "hostile", since: 0 };
        assert.equal(marching.counsel("human", { march: far.id }, 1), true);

        const marched = play(marching, 3).filter(({ type, realm }) => type === "marched" && realm === "human");

        assert.equal(marched[0]?.target, far.id);
        assert.equal(marching.realm("human").counsel, null);

        // Counselled to peace, they send an envoy for a truce
        const suing = setUp();

        suing.relations[["human", enemy].sort().join("|")] = { state: "hostile", since: 0 };
        assert.equal(suing.counsel("human", { peace: enemy }, 1), true);

        const envoys = play(suing, 10).filter(({ type, from }) => type === "envoy" && from === "human");

        assert.ok(envoys.some(({ to, mission }) => to === enemy && mission === "truce"));

        // Counsel not acted on is let go in time
        const idle = setUp();
        const other = idle.realms.find(({ id }) => id !== "human" && idle.relation("human", id) === "neutral").id;

        idle.realm("human").leader.traits.aggression = 0;
        idle.counsel("human", { war: other }, 0.01);
        play(idle, COUNSEL_TURNS + 2);
        assert.equal(idle.realm("human").counsel, null);
    });

    it("lets a vassal that's served a while rise against its overlord", () => {
        const war = new War(plan);
        const human = war.realm("human");

        Object.assign(human, { overlord: "orc", since: 0 });

        // (Much stronger than its overlord, and hating it)
        for (const town of war.towns.filter(({ owner }) => owner === "human")) {
            town.garrison *= 20;
        }

        human.standing.orc = -100;
        human.treasury = 1e6;

        const early = play(war, SERVES - 1);

        assert.ok(!early.some(({ type }) => type === "rebelled"));

        const later = play(war, 400);
        const rising = later.find(({ type }) => type === "rebelled");

        assert.equal(rising?.from, "orc");
        assert.equal(rising.realm, "human");
    });

    it("tells every kind of thing that happens in words", () => {
        const seen = new Set();

        for (const event of long.events) {
            const words = tell(event, long.war);

            assert.ok(words.length > 20 && !words.includes("undefined") && !words.includes("null") && /^[A-Z]/.test(words), words);
            seen.add(event.type);
        }

        for (const type of ["declared", "marched", "camped", "raid", "assault", "taken", "envoy", "treaty", "subjugated"]) {
            assert.ok(seen.has(type), type);
        }
    });

    it("says what each people's leader is like, the most marked first", () => {
        const war = new War(plan);

        for (const realm of war.realms) {
            const said = describeLeader(realm.leader, realm.id);

            for (const { trait, high, saying } of said) {
                assert.equal(realm.leader.traits[trait] >= 0.5, high);
                assert.equal(typeof saying, "string");
            }
        }

        const orc = { traits: { aggression: 1, greed: 0.5, loyalty: 0.5, grudge: 0.5, caution: 0 } };

        assert.deepEqual(describeLeader(orc, "orc").map(({ trait }) => trait), ["aggression", "caution"]);
    });

    it("meets peoples whose lands or forces come within sight of each other", () => {
        const war = new War(plan);

        for (const key of war.known) {
            const [a, b] = key.split("|");
            const near = war.towns.filter(({ owner }) => owner === a).some((town) => war.towns.filter(({ owner }) => owner === b).some((other) => apart(town.at, other.at) <= REACH.sight));

            assert.ok(near, key);
        }

        assert.equal(war.relation("human", "human"), "self");
    });
});
