// The townsfolk out about their business (client/js/core/townsfolk.js; core/host.js #townsfolk;
// characters/folk.js; core/dialogue.js; docs/GAME.md *Townsfolk*): where a settlement's errands
// are, who's out and where their rounds take them, the same every time; out once a player comes
// near, walking from errand to errand, fewer at night, home once every player's far off, kept in
// a snapshot; a castle's folk in its wards; dressed for their calling, carrying what it carries.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { BODY, STEP_MS } from "../client/js/core/battle.js";
import { treeFor, TREES } from "../client/js/core/dialogue.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { loadRecast } from "../client/js/core/navigation/recast.js";
import { buildWorld, CHUNK } from "../client/js/core/overworld.js";
import { ROLES } from "../client/js/core/roles.js";
import { CALLINGS, countOut, CRIERS, crierOf, errandsOf, LINGER, TOWNSFOLK, TOWNSFOLK_REACH, townsfolkOf, wardErrandsOf } from "../client/js/core/townsfolk.js";
import { folkLook, TOWNSFOLK_PARTS } from "../client/js/characters/folk.js";
import { LOOKS } from "../client/js/characters/peoples.js";
import { EQUIPMENT } from "../client/js/characters/equipment.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const hosted = (seed = 2) => {
    const host = new Host(buildWorld({ seed }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    return host;
};

const townsfolkOut = (host) => host.battle.actors.filter(({ id }) => id.startsWith("townsfolk:"));
const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

describe("the townsfolk (townsfolk.js, host.js)", () => {
    before(async () => {
        await loadRecast();
    });

    it("finds a settlement's errands on its ground, where someone can stand: its market, stalls, well, houses, doors, ways out and yards", () => {
        const world = buildWorld({ seed: 2 });
        const town = world.maps.town;
        const squares = squaresOf(town);
        // (As the host finds them: the square someone can stand on nearest each)
        const free = ([x, y]) => {
            try {
                return nearestFree(town, [Math.floor(x), Math.floor(y)], { within: 3 });
            } catch {
                return null;
            }
        };
        const errands = errandsOf(world.town, world.origin, free);

        for (const kind of ["market", "stall", "well", "home", "church", "tavern", "exit", "yard"]) {
            assert.ok(errands[kind].length > 0, kind);
        }

        const all = Object.values(errands).flat();

        assert.equal(new Set(all.map(({ square }) => square.join(","))).size, all.length, "each square once");

        for (const { square, facing } of all) {
            assert.ok(!squares.blocked(...square) && squares.roomy(...square), square.join(","));
            assert.ok(Number.isFinite(facing));
        }
    });

    it("sends each out on a round of errands of its calling's kinds, the same every time, named, as many as the place has by day and fewer at night", () => {
        const errands = Object.fromEntries(Object.keys(LINGER).map((kind, k) => [kind, [{ square: [k, 0], facing: 0 }, { square: [k, 1], facing: 0 }]]));
        const one = townsfolkOf({ place: "a-town", kind: "town", errands, count: countOut("town"), seed: 7 });

        assert.equal(one.length, TOWNSFOLK.town);
        assert.deepEqual(townsfolkOf({ place: "a-town", kind: "town", errands, count: countOut("town"), seed: 7 }), one, "the same every time");
        assert.notDeepEqual(townsfolkOf({ place: "a-town", kind: "town", errands, count: countOut("town"), seed: 8 }), one);
        assert.equal(new Set(one.map(({ id }) => id)).size, one.length);
        assert.equal(new Set(one.map(({ name }) => name)).size, one.length);

        for (const folk of one) {
            const calling = CALLINGS[folk.look];

            assert.ok(calling && !["servant", "groom", "scribe"].includes(folk.look), folk.look);
            assert.match(folk.id, /^townsfolk:a-town\/\d+$/);
            assert.equal(folk.role, "townsfolk");
            assert.equal(folk.routine.order, "alternate");
            assert.ok(folk.routine.stops.length >= 2);
            assert.ok(folk.routine.stops.every(({ group, wait }) => calling.goes.includes(group) && wait[1] > wait[0]));
            assert.equal(new Set(folk.routine.stops.map(({ group }) => group)).size, folk.routine.stops.length, "one of each kind");
            assert.ok(calling.sexes.includes(folk.sex));
            assert.ok(folk.title.length > 3);
        }

        // (A village's are villagers; a castle's its servants, grooms and scribes; fewer at night)
        assert.ok(townsfolkOf({ place: "a-village", kind: "village", errands, count: 5, seed: 7 }).filter(({ look }) => look === "shopper").every(({ title }) => title === "Villager"));
        assert.ok(townsfolkOf({ place: "a-castle", kind: "castle", errands, count: 5, seed: 7 }).every(({ look }) => ["servant", "groom", "scribe"].includes(look)));
        assert.ok(Object.keys(TOWNSFOLK).every((kind) => countOut(kind, true) >= 1 && countOut(kind, true) < countOut(kind) || countOut(kind) === 1));

        // (Nowhere to go but one place: no one)
        assert.deepEqual(townsfolkOf({ place: "a-town", kind: "town", errands: { market: [{ square: [0, 0], facing: 0 }] }, count: 4, seed: 7 }), []);
    });

    it("finds a castle's errands in its wards: its courtyard, its keep's door, its heart", () => {
        const courts = Array.from({ length: 40 }, (_, k) => [100 + (k % 8), 200 + Math.floor(k / 8)]);
        const errands = wardErrandsOf({ courts, heart: [104.5, 202.5], keep: [104.5, 199.5] }, ([x, y]) => [Math.floor(x), Math.floor(y)]);

        assert.ok(errands.court.length >= 8 && errands.court.length <= 14);
        assert.deepEqual(errands.keep.map(({ square }) => square), [[104, 199]]);
        assert.deepEqual(errands.heart.map(({ square }) => square), [[104, 202]]);
    });

    it("brings a town's townsfolk out as the player plays there, walking their errands, and home once they're far off", () => {
        const host = hosted();
        const out = run(host, STEP_MS).filter(({ type }) => type === "townsfolk");
        const folk = townsfolkOut(host);

        assert.deepEqual(out.map(({ place, change }) => [place, change]), [[host.world.start.id, "out"]]);
        assert.equal(folk.length, countOut(host.world.start.kind, false));
        // (And its crier with them: crierOf)
        assert.deepEqual(out[0].ids, [...folk.map(({ id }) => id), `crier:${host.world.start.id}`]);

        for (const one of folk) {
            const kept = host.folk.get(one.id);

            assert.equal(one.kind, "folk");
            assert.equal(one.neutral, true);
            assert.equal(one.ai, "routine");
            assert.equal(kept.role, "townsfolk");
            assert.ok(TOWNSFOLK_PARTS.includes(kept.look));
            assert.ok(squaresOf(host.world.maps.town).roomy(...one.square), "put where there's room");
            assert.ok(!host.canFight(host.battle.actor(HOST_PLAYER), one), "no one to fight");
            // (Running from the enemies of whoever holds the town: battle.js #afraid)
            assert.equal(one.side, host.war.town(host.world.start.id)?.owner ?? kept.people);
        }

        // A minute on: most of them have gone somewhere, most of the time walking
        const from = new Map(folk.map(({ id, x, y }) => [id, [x, y]]));
        let walking = 0;

        for (let t = 0; t < 60000; t += 1000) {
            run(host, 1000);
            walking += townsfolkOut(host).filter(({ path }) => path.length).length;
        }

        const moved = townsfolkOut(host).filter(({ id, x, y }) => Math.hypot(x - from.get(id)[0], y - from.get(id)[1]) > 5);

        assert.ok(moved.length >= folk.length - 1, `${moved.length} of ${folk.length} moved`);
        assert.ok(walking / (60 * folk.length) > 0.4, `walking ${walking / (60 * folk.length)} of the time`);

        // Far off: home again
        const player = host.battle.actor(HOST_PLAYER);
        const [x, y] = player.square;

        put(player, [x - TOWNSFOLK_REACH.far - 200, y]);

        const home = run(host, 1000).filter(({ type }) => type === "townsfolk");

        assert.deepEqual(home.map(({ change }) => change), ["home"]);
        assert.equal(townsfolkOut(host).length, 0);
        assert.ok(folk.every(({ id }) => !host.folk.has(id)));
        assert.ok(!host.battle.actor(`crier:${host.world.start.id}`) && home[0].ids.includes(`crier:${host.world.start.id}`), "the crier home with them");
    });

    it("puts a crier in the square of every village and bigger, between its market's middle and its well, out by night as by day; a herald in a castle's heart; none in a hamlet or a farmstead", () => {
        const errands = Object.fromEntries(Object.keys(LINGER).map((kind, k) => [kind, [{ square: [k, 0], facing: 0 }, { square: [k, 1], facing: 0 }]]));
        const crierAt = (kind, options = {}) => crierOf({ place: `a-${kind}`, kind, people: "elf", name: "Aldmere", errands, seed: 7, ...options });
        const crier = crierAt("town");

        assert.deepEqual(crierAt("town"), crier, "the same every time");
        assert.notDeepEqual(crierAt("town", { seed: 8 }), crier);
        assert.ok(crier.name.length > 2);
        assert.deepEqual([crier.id, crier.role, crier.look, crier.title, crier.people, crier.townName, crier.place], ["crier:a-town", "crier", "crier", "Town crier", "elf", "Aldmere", "a-town"]);
        // (By the market's middle, not on it, where a new hero first stands)
        assert.deepEqual(crier.routine.stops.map(({ group, square }) => [group, square]), [["market", errands.market[1].square], ["well", errands.well[0].square]]);
        assert.ok(crier.routine.stops.every(({ wait }) => wait[1] > wait[0] && wait[0] >= 8000), "lingering long at each");
        assert.deepEqual(crier.square, errands.market[1].square);

        // (Wherever there's a square: a village's crier, a castle's herald, between its heart and its keep)
        assert.equal(crierAt("village").title, "Village crier");
        assert.deepEqual(crierAt("castle", { errands: { heart: errands.heart, keep: errands.keep, court: errands.court } }).routine.stops.map(({ group }) => group), ["heart", "keep"]);
        assert.equal(crierAt("castle", { errands: { heart: errands.heart } }).title, "Herald");
        assert.deepEqual(Object.keys(CRIERS).sort(), ["capital", "castle", "city", "town", "village"]);
        assert.ok(["hamlet", "farmstead"].every((kind) => crierAt(kind) === null));
        assert.equal(crierAt("town", { errands: {} }), null, "nowhere to stand");

        // (In his people's livery and its chain of office, his own plumed hat (none over a cat's
        // ears), his handbell in his right hand; ringing it heard there; his own talk)
        const look = folkLook(crier);

        assert.ok(["livery.elf", "chain", "crierHat", "handbell"].every((id) => look.equipment.includes(id)), look.equipment.join());
        assert.ok(!folkLook({ ...crier, people: "cat" }).equipment.includes("crierHat"));
        assert.equal(EQUIPMENT.handbell.socket, "rightHand");
        assert.equal(EQUIPMENT.crierHat.slot, "head");
        assert.ok(ROLES.crier.rests.length >= 5 && ROLES.crier.rests[0].sound === "newsHeard");
        assert.equal(treeFor({ id: crier.id, role: "crier" }), TREES.crier);
    });

    it("never has them stand in one another, nor in the player, gathered where they're going: by one another; and passing in a narrow way, no longer than a squeeze", () => {
        // (Before, they walked round and round whoever stood where they were going, then squeezed
        // through onto where they stood, and stood there in them: the player too, standing on an
        // errand's square; seconds at a time, every minute or so)
        for (const seed of [1, 2]) {
            const host = hosted(seed);
            const player = host.battle.actor(HOST_PLAYER);
            const overlapping = new Map();
            const [inPlayer, standingIn] = [new Set(), new Set()];
            let longest = 0;

            for (let t = 0; t < 90000; t += STEP_MS) {
                host.advance(STEP_MS);

                const near = host.battle.actors.filter((one) => !one.dead && one.map === player.map && Math.hypot(one.x - player.x, one.y - player.y) < 60);
                const now = new Set();

                for (const [k, one] of near.entries()) {
                    for (const other of near.slice(k + 1)) {
                        if (Math.hypot(one.x - other.x, one.y - other.y) < 2 * BODY - 0.01) {
                            const pair = `${one.id} and ${other.id}`;

                            now.add(pair);
                            overlapping.set(pair, (overlapping.get(pair) ?? 0) + STEP_MS);
                            longest = Math.max(longest, overlapping.get(pair));

                            if (one === player || other === player) {
                                inPlayer.add(pair);
                            } else if (!one.path.length && !other.path.length) {
                                standingIn.add(pair);
                            }
                        }
                    }
                }

                for (const pair of [...overlapping.keys()].filter((pair) => !now.has(pair))) {
                    overlapping.delete(pair);
                }
            }

            assert.deepEqual([...inPlayer], [], `seed ${seed}: in the player`);
            assert.deepEqual([...standingIn], [], `seed ${seed}: standing in one another`);
            assert.ok(longest <= 2000, `seed ${seed}: in one another for ${longest / 1000} s`);
        }
    });

    it("keeps them in a snapshot, as they are, and their looks and errands with them", () => {
        const host = hosted();

        run(host, 5000);

        const copy = Host.restore(host.world, host.snapshot());
        const folk = townsfolkOut(host);

        assert.ok(folk.length > 0);
        assert.deepEqual(townsfolkOut(copy).map(({ id, x, y }) => [id, x, y]), folk.map(({ id, x, y }) => [id, x, y]));
        assert.ok(folk.every(({ id }) => JSON.stringify(copy.folk.get(id)) === JSON.stringify(host.folk.get(id))));

        run(host, 3000);
        run(copy, 3000);
        assert.deepEqual(townsfolkOut(copy).map(({ id, x, y }) => [id, x, y]), townsfolkOut(host).map(({ id, x, y }) => [id, x, y]), "and go on as they would have");
    });

    it("brings a castle's folk out in its wards: its servants, grooms and scribes", () => {
        const host = hosted();
        const citadel = [...host.world.maps.town.sites.set.values()].find((set) => set.citadel);
        const player = host.battle.actor(HOST_PLAYER);

        assert.ok(citadel, "(the humans' citadel)");
        put(player, [Math.floor(citadel.x), Math.floor(citadel.y + citadel.radius + 40)]);

        const out = run(host, 1000).filter(({ type, change }) => type === "townsfolk" && change === "out");
        const castle = out.find(({ place }) => place === citadel.site.id);

        assert.ok(castle, JSON.stringify(out.map(({ place }) => place)));
        assert.ok(castle.ids.length >= 3);

        // (Its herald among them: crierOf)
        for (const id of castle.ids) {
            const one = host.folk.get(id);

            assert.ok(["servant", "groom", "scribe"].includes(one.look) || id === `crier:${citadel.site.id}`, one.look);
            assert.ok(one.routine.stops.every(({ group }) => ["court", "keep", "heart"].includes(group)));
        }

        assert.equal(host.folk.get(`crier:${citadel.site.id}`)?.title, "Herald");
    });

    it("goes on past a castle that couldn't be set down, with no one out there", () => {
        const host = hosted();
        const sites = host.world.maps.town.sites;
        // (Seed 2's dark elves' castle: no room for it where it's planned)
        const castle = host.world.plan.sites.find(({ id }) => id === "castle-9");
        const [x, y] = castle.at.map(Math.floor);

        sites.settle(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
        assert.ok(sites.set.has(castle.id) && sites.set.get(castle.id) === null, "(set down as none)");

        put(host.battle.actor(HOST_PLAYER), [x, y + 40]);

        const out = run(host, 2000).filter(({ type }) => type === "townsfolk");

        assert.ok(out.every(({ place }) => place !== castle.id));
        assert.ok(![...host.folk.keys()].some((id) => id.startsWith(`townsfolk:${castle.id}/`)));
    });

    it("dresses each calling for its work, carrying what it carries, and talks as the townsfolk do", () => {
        const carried = new Set();

        for (const look of TOWNSFOLK_PARTS) {
            for (const sex of ["f", "m"]) {
                for (let seed = 1; seed < 12; seed++) {
                    const { equipment } = folkLook({ role: "townsfolk", look, sex, seed });

                    assert.ok(equipment.every((id) => EQUIPMENT[id]), `${look}: ${equipment.join(", ")}`);
                    equipment.forEach((id) => carried.add(id));
                }
            }
        }

        for (const thing of ["pannier", "sack", "firewood", "jug", "pitchfork", "broom", "walkingStaff", "ledger", "hoe", "basket", "strawHat", "coif", "hood", "smock", "habit", "habitSkirt", "brownTunic", "russetTunic", "blueKirtle", "brownSkirt"]) {
            assert.ok(carried.has(thing), thing);
        }

        // (A cat's ears take no hat)
        assert.ok(!folkLook({ role: "townsfolk", look: "fieldhand", sex: "m", seed: 3, people: "cat" }).equipment.includes("strawHat"));

        assert.equal(treeFor({ id: "townsfolk:x/0", role: "townsfolk" }), TREES.townsfolk);
        assert.ok(ROLES.townsfolk.rests.length >= 5);
    });

    it("makes a look for everyone the folk can be, a man or a woman, of any people (a woman barkeep among them)", () => {
        for (const role of Object.keys(ROLES)) {
            for (const sex of ["f", "m"]) {
                for (const people of ["human", ...Object.keys(LOOKS)]) {
                    const look = folkLook({ role, sex, seed: 3, people });

                    assert.ok(look.equipment.every((id) => EQUIPMENT[id]), `${role} ${sex} ${people}`);
                    assert.ok(Object.values(look.shape.macro).every(Number.isFinite), `${role} ${sex} ${people}: ${JSON.stringify(look.shape.macro)}`);
                }
            }
        }
    });
});
