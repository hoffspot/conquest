// The war for the continent (client/js/core/war): the six peoples' realms and rulers, the towns
// they hold, their treasuries and the forces they send out, what they think of each other, who
// brings whom under them, how far the war's got and what it lets happen; the roads the forces go
// by; the news of it; all of it the same for a seed, and kept and made again to carry on exactly
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { describeLeader, REALMS, TEMPERAMENTS, TRAITS } from "../client/js/core/war/peoples.js";
import { ACROSS_COUNTRY, Roads } from "../client/js/core/war/roads.js";
import { FORTS } from "../client/js/core/war/forts.js";
import { tell } from "../client/js/core/war/news.js";
import { CONVOY, COUNSEL_TURNS, HOLDINGS, OVERRUN, REACH, RESOURCES, SERVES, STAGES, TAKEN, TRIBUTE, TURN_MS, TURNS_PER_STAGE, War, WORKED } from "../client/js/core/war/war.js";
import { CAMP } from "../client/js/core/war/armies.js";
import { decode, encode } from "../client/js/core/wire.js";
import { planWorld, RACES, WORKS } from "../client/js/core/worldplan/plan.js";

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

    it("takes nothing in an uneasy peace (no army raised), and comes on with the players' might, or with time", () => {
        const war = new War(plan);
        const events = play(war, TURNS_PER_STAGE - 1);

        assert.equal(war.stage, 0);
        assert.ok(!events.some(({ type }) => type === "taken" || type === "assault" || type === "raised"));
        assert.ok(events.some(({ type }) => type === "declared"), "(wars are declared)");
        assert.ok(war.realms.every(({ id }) => war.reserveOf(id)?.size > 0), "(and each people's reserve made up at its seat)");

        play(war, 1);
        assert.equal(war.stage, 1, "(time brings the border wars)");
        war.setMight(4);
        assert.deepEqual(play(war, 1).filter(({ type }) => type === "stage").map(({ stage }) => stage), [2]);
        war.setMight(0);
        play(war, 1);
        assert.equal(war.stage, 2, "(and never goes back)");
    });

    it("takes only what the war's stage allows, by an army putting its garrison to the sword, from a camp in reach of it", () => {
        const takes = long.events.filter(({ type }) => type === "taken");

        assert.ok(takes.length > 10);
        assert.ok(takes.every(({ how }) => how === "army"), "(no other way, the players aside)");

        for (const event of long.events.filter(({ type }) => type === "taken" || type === "assault")) {
            const town = long.war.town(event.town);

            assert.ok(STAGES[event.stage].take.includes(town.kind), `${town.kind} in ${STAGES[event.stage].id}`);
        }

        // (Each assault from a camp of its people's built within reach of the town's edge before it)
        const camps = [];
        const edge = (id) => plan.places.find((place) => place.id === id).radius ?? 0;

        for (const event of long.events) {
            if (event.type === "camped") {
                camps.push(event);
            } else if (event.type === "assault") {
                const town = long.war.town(event.town);

                assert.ok(
                    camps.some(({ realm, at }) => realm === event.realm && apart(at, town.at) - edge(town.id) <= CAMP.reach),
                    `${event.realm} at ${event.town}`,
                );
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

        for (const camp of war.camps) {
            assert.ok(camp.guard >= 0 && war.realm(camp.realm).alive);
        }

        // (An army and a reserve at most each, a vassal's no stronger than a vassal keeps)
        for (const realm of war.realms.filter(({ alive }) => alive)) {
            assert.ok(war.forces.filter(({ kind, realm: id }) => kind === "army" && id === realm.id).length <= 1);
            assert.equal(war.forces.filter(({ kind, realm: id }) => kind === "reserve" && id === realm.id).length, 1);
            assert.ok((war.reserveOf(realm.id)?.size ?? 0) <= Math.max(war.fullOf(realm.id), 80));
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

        // (An orc army at the walls, from its camp before them, its leaders and all put to the sword)
        const at = [capital.at[0] + 200, capital.at[1]];

        war.camps.push({ id: "camp-test", realm: "orc", at, guard: 6, built: 0, done: 0, toward: capital.id, used: 0, skirmished: 0 });
        war.forces.push({ id: "force-test", realm: "orc", kind: "army", size: 600, at: [...capital.at], path: [[...capital.at]], leg: 0, target: capital.id, home: war.realm("orc").capital, mission: "attack", about: null, camp: "camp-test", orders: null, went: 600, arrived: null, since: 0 });
        war.reserveOf("human").size = 70;
        war.armyOf("human") ?? war.order("human", { raise: true });
        war.armyOf("human").size = 70;

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

        // (Its army and reserve cut to what a vassal keeps, the rest back in its towns)
        assert.ok(war.armyOf("human").size <= war.fullOf("human") && war.reserveOf("human").size <= war.fullOf("human"));
        assert.equal(war.fullOf("human"), war.fullOf("orc") / 2);
        assert.equal(war.town(capital.id).garrison > 0, true);
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

    it("hears of fights played out in the world: a garrison or force losing some; a town's whole garrison put down, it's theirs who did it", () => {
        const war = new War(plan);
        const town = war.towns.find(({ owner, kind }) => owner === "human" && kind === "village");

        assert.equal(war.loss(town.id, 3.4), null);
        assert.equal(town.garrison, HOLDINGS[town.kind].garrison - 3);
        war.loss(town.id, 1000);
        assert.equal(town.garrison, 0);
        assert.equal(town.owner, "human", "(by no one)");

        // (By a people at war with its holders, once the age lets a village be taken: theirs, held by a few)
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        town.garrison = 2;
        assert.equal(war.loss(town.id, 2, { by: "orc" }), null, "(not yet: the uneasy peace)");
        assert.equal(town.owner, "human");
        war.stage = 1;
        town.garrison = 2;
        assert.equal(war.loss(town.id, 2, { by: "orc" }), "taken");
        assert.deepEqual([town.owner, town.garrison], ["orc", Math.ceil(HOLDINGS.village.garrison * TAKEN)]);
        assert.equal(war.log.at(-1).how, "played");

        // (A camp's guard put down: razed)
        war.camps.push({ id: "camp-x", realm: "human", at: [0, 0], guard: 3, built: 0, done: 0, toward: null, used: 0, skirmished: 0 });
        assert.equal(war.loss("camp-x", 3, { by: "orc" }), "razed");
        assert.equal(war.camp("camp-x"), null);
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

        // Counselled to war, they go to war (sooner or later): the rest kept from declaring wars of
        // their own meanwhile, so it's the counsel that brings it on
        for (const realm of war.realms.filter(({ id }) => id !== "human")) {
            realm.leader.traits.aggression = 0;
        }

        const events = play(war, COUNSEL_TURNS);

        assert.ok(events.some(({ type, by, on }) => type === "declared" && by === "human" && on === enemy));
        assert.equal(war.realm("human").counsel, null);

        // Counselled to march on the furthest of an enemy's towns: their army, once it's ready, marches there
        const marching = setUp();
        const home = marching.town(marching.realm("human").capital);
        const far = marching.towns.filter(({ owner }) => owner === enemy).sort((a, b) => apart(b.at, home.at) - apart(a.at, home.at))[0];

        marching.relations[["human", enemy].sort().join("|")] = { state: "hostile", since: 0 };
        marching.order("human", { raise: true });
        marching.armyOf("human").size = 80;
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

        for (const type of ["declared", "raised", "marched", "camped", "skirmish", "battle", "assault", "taken", "envoy", "treaty", "subjugated"]) {
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

describe("the works in the war (core/war: docs/WAR.md *The works*)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    // A war at peace and staying so, at the stage `stage`: no one going to war of their own accord
    const quiet = (stage = 0) => {
        const war = new War(plan);

        war.stage = stage;

        for (const realm of war.realms) {
            realm.leader.traits = { aggression: 0, greed: 0, loyalty: 0.5, grudge: 0.5, caution: 1 };
        }

        return war;
    };
    const atWar = (war, a, b) => {
        war.relations[[a, b].sort().join("|")] = { state: "hostile", since: 0 };
        war.known.push([a, b].sort().join("|"));
    };

    it("gives each people its two lumber mills, mines and quarries, held and guarded by them, its convoys' guards home, its stores empty", () => {
        const war = new War(plan);

        assert.equal(war.works.length, RACES.length * 6);

        for (const realm of war.realms) {
            const own = war.works.filter(({ owner }) => owner === realm.id);

            assert.deepEqual(realm.stores, Object.fromEntries(RESOURCES.map((resource) => [resource, 0])));
            assert.deepEqual(own.map(({ kind }) => kind).sort(), WORKS.flatMap(({ kind, count }) => Array(count).fill(kind)).sort());
            assert.ok(own.every((works) => works.race === realm.id && works.guard === WORKED.guard && works.escort === CONVOY.guards + 1 && works.yard === 0 && !works.held && works.name));
        }

        // (Their guards and convoys' count among their forces, and are paid for)
        assert.equal(war.power("human"), war.towns.filter(({ owner }) => owner === "human").reduce((sum, { garrison }) => sum + garrison, 0) + 6 * (WORKED.guard + CONVOY.guards + 1));
    });

    it("fills each works' yard, sends a convoy of it to its people's seat, into their stores, and back for more", () => {
        const war = quiet();
        const works = war.works.find(({ owner, kind }) => owner === "elf" && kind === "quarry");
        const elves = war.realm("elf");
        const events = [];

        // (A wagon's load waiting after a few turns: a convoy sets out with it and its guards)
        for (let k = 0; k < 12 && !war.forces.some(({ kind, home }) => kind === "convoy" && home === works.id); k++) {
            events.push(...play(war, 1));
        }

        const convoy = war.forces.find(({ kind, home }) => kind === "convoy" && home === works.id);

        assert.ok(convoy, "a convoy set out");
        assert.deepEqual(Object.keys(convoy.cargo), ["stone"]);
        assert.ok(convoy.cargo.stone >= CONVOY.load && convoy.cargo.stone <= CONVOY.wagons * CONVOY.load);
        assert.equal(convoy.size, CONVOY.guards + 1);
        assert.equal(works.escort, 0);
        assert.equal(convoy.target, elves.seat);

        // (There, its stone in the elves' stores, but for what their council's spent on their
        // fortifications the while: built, and kept up; then home, its guards home)
        const carried = convoy.cargo.stone;
        let spent = 0;

        for (let k = 0; k < Math.ceil(convoy.path.length * 3); k++) {
            const turn = play(war, 1);

            events.push(...turn);
            spent += turn.filter(({ type, realm }) => type === "built" && realm === "elf").reduce((sum, { kind }) => sum + (FORTS[kind].cost.stone ?? 0), 0);
            spent += war.forts.filter(({ realm }) => realm === "elf").reduce((sum, { kind }) => sum + (FORTS[kind].upkeep.stone ?? 0), 0);
        }

        assert.ok(elves.stores.stone + spent >= carried, `${elves.stores.stone} stone, ${spent} spent`);
        assert.ok(events.some(({ type, works: id, cargo }) => type === "delivered" && id === works.id && cargo.stone === carried));
        assert.ok(!war.forces.includes(convoy) || convoy.back);
        assert.match(tell(events.find(({ type }) => type === "delivered"), war), /^A convoy of \d+ (wood|stone|metal) from the .+ (lumber mill|mine|quarry) has reached the .+ seat\.$/);
    });

    it("pays a vassal's tribute to its liege from what its convoys bring in", () => {
        const war = quiet();
        const convoy = { id: "force-99", realm: "cat", kind: "convoy", size: 7, at: [...war.town(war.realm("cat").seat).at], path: [war.town(war.realm("cat").seat).at], leg: 0, target: war.realm("cat").seat, home: war.works.find(({ owner }) => owner === "cat").id, mission: null, about: null, cargo: { metal: 40 }, back: false, since: 0 };

        war.realm("cat").overlord = "orc";
        war.forces.push(convoy);
        play(war, 1);
        assert.equal(war.realm("cat").stores.metal >= 40 * (1 - TRIBUTE), true);
        assert.equal(war.realm("orc").stores.metal >= 40 * TRIBUTE, true);
    });

    it("sends its army to seize an enemy's works once the war's far enough on, and holds it then", () => {
        const war = quiet(WORKED.from);
        const theirs = war.works.filter(({ owner }) => owner === "darkElf");

        atWar(war, "human", "darkElf");
        // (Greedy, but at war with no more than them: warlike enough for one war at a time)
        war.realm("human").leader.traits = { aggression: 0.2, greed: 1, loyalty: 0.5, grudge: 0.5, caution: 0 };
        war.realm("human").treasury = 1e4;

        // (Their towns too strong to want: their works the weakest near)
        for (const town of war.towns.filter(({ owner }) => owner === "darkElf")) {
            town.garrison = 500;
        }

        // (Kept at war: no truce before they get there)
        const events = [];

        for (let k = 0; k < 90; k++) {
            atWar(war, "human", "darkElf");
            events.push(...play(war, 1));
        }

        const seized = events.find(({ type, to }) => type === "seized" && to === "human");

        assert.ok(events.some(({ type, realm, target }) => type === "marched" && realm === "human" && theirs.some(({ id }) => id === target)), "marched on their works");
        assert.ok(seized, "seized one");
        assert.equal(war.workAt(seized.works).owner, "human");
        assert.ok(war.realm("darkElf").standing.human < 0, "a grudge for it");
        assert.match(tell(seized, war), /^The Humans have seized the .+ from the Dark elves\.$/);
    });

    it("loses a works to the wild's bands now and then, the likelier its guard's empty; its people send a force to win it back", () => {
        const war = quiet();
        const works = war.works.find(({ owner }) => owner === "lizard");

        works.guard = 0;

        // (Unguarded: overrun before long)
        const events = [];

        for (let k = 0; k < 400 && !works.held; k++) {
            events.push(...play(war, 1));
            works.guard = 0;
        }

        assert.ok(works.held, "overrun");
        assert.equal(works.band, OVERRUN.band);
        assert.equal(works.yard, 0);
        assert.match(tell(events.find(({ type, works: id }) => type === "overrun" && id === works.id), war), /^Brigands have overrun the .+\. Nothing comes out of it for the Lizard folk now\.$/);

        // (Its people send a force to win it back, out of their nearest town's garrison, or their
        // reserve, and do)
        war.realm("lizard").treasury = 1e4;

        const after = [];
        let sent = false;

        for (let k = 0; k < 30; k++) {
            after.push(...play(war, 1));
            sent ||= war.reserveOf("lizard").target === works.id;
        }

        sent ||= after.some(({ type, realm, target, mission }) => type === "marched" && realm === "lizard" && target === works.id && mission === "retake");
        assert.ok(sent, "a force sent");
        assert.ok(after.some(({ type, works: id }) => type === "retaken" && id === works.id), "won back");
        assert.ok(!works.held && works.guard > 0 && works.owner === "lizard");
    });

    it("hears of a works won in the world: cleared of the wild for its people, or seized from an enemy", () => {
        const war = quiet();
        const [mine, theirs] = [war.works.find(({ owner }) => owner === "human"), war.works.find(({ owner }) => owner === "orc")];

        // (Cleared: back to its own people, a favour; still held while any of the band stands)
        Object.assign(mine, { held: true, band: 3, guard: 0 });
        assert.equal(war.win(mine.id, "elf"), null);
        war.loss(mine.id, 3);
        assert.equal(mine.band, 0);
        assert.equal(war.win(mine.id, "elf"), "cleared");
        assert.ok(!mine.held && mine.owner === "human" && mine.guard === OVERRUN.held);
        assert.ok(war.realm("human").standing.elf > 0);

        // (An enemy's: seized, once its guard's all down; not a friend's)
        assert.equal(war.win(theirs.id, "elf"), null, "not at war with them");
        atWar(war, "elf", "orc");
        assert.equal(war.win(theirs.id, "elf"), null, "its guard's standing");
        war.loss(theirs.id, WORKED.guard);
        assert.equal(war.win(theirs.id, "elf"), "seized");
        assert.equal(theirs.owner, "elf");
        assert.ok(war.log.some(({ type, works, played }) => type === "seized" && works === theirs.id && played));
    });

    it("has a convoy fallen on by an enemy passing: its goods half theirs if it's beaten", () => {
        const war = quiet();
        const works = war.works.find(({ owner }) => owner === "human");
        const convoy = { id: "force-98", realm: "human", kind: "convoy", size: 2, at: [...works.at], path: [works.at, war.town(war.realm("human").seat).at], leg: 0, target: war.realm("human").seat, home: works.id, mission: null, about: null, cargo: { wood: 60 }, back: false, since: 0 };

        atWar(war, "human", "orc");
        war.realm("orc").leader.traits.aggression = 1;
        war.forces.push(convoy, { id: "force-97", realm: "orc", kind: "army", size: 30, at: [works.at[0] + 50, works.at[1]], path: [[works.at[0] + 50, works.at[1]]], leg: 0, target: null, home: war.realm("orc").seat, mission: "camp", about: null, camp: null, orders: null, went: 30, arrived: null, since: 0 });

        let events = [];

        for (let k = 0; k < 10 && war.forces.includes(convoy); k++) {
            convoy.at = [...works.at];
            convoy.leg = 0;
            events = [...events, ...play(war, 1)];
        }

        const fell = events.find(({ type }) => type === "ambushed");

        assert.ok(fell && !fell.beaten, "fallen on and beaten");
        assert.equal(war.realm("orc").stores.wood, 30);
        assert.match(tell(fell, war), /^The Humans' convoy from the .+ was fallen on by the Orcs, and its goods carried off\.$/);
    });

    it("carries on a war kept before there were works: every works its people's, every store empty", () => {
        const war = new War(plan);

        play(war, 5);

        const kept = war.snapshot();

        delete kept.works;
        kept.version = 1;

        for (const realm of kept.realms) {
            delete realm.stores;
        }

        const again = War.restore(plan, kept);

        assert.equal(again.works.length, war.works.length);
        assert.ok(again.realms.every(({ stores }) => stores && RESOURCES.every((resource) => stores[resource] === 0)));
        assert.doesNotThrow(() => play(again, 5));
    });
});
