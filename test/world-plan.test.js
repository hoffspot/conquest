// The world plan (client/js/core/worldplan): an 8 km world laid out from a seed, its peoples each in
// their own climate and lands, their settlements (with guilds), roads, rivers, sites and camps
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { BIOME, BIOMES, campTier, CELL, CELLS, FACTIONS, guildFor, guilds, landAt, layOutWorld, openGround, planWorld, RACES, ROAD, SETTLEMENTS, SITES, startFor, WATER } from "../client/js/core/worldplan/plan.js";
import { Queue } from "../client/js/core/worldplan/queue.js";
import { createRandom } from "../client/js/core/random.js";

const SEEDS = [1, 2, 3];
const plans = new Map();
const at = (x, y) => y * CELLS + x;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// A people's territory: its cells' indices
const territoryOf = (plan, r) => [...plan.territory.keys()].filter((k) => plan.territory[k] === r + 1);

describe("the world plan (worldplan/plan.js)", () => {
    before(() => {
        for (const seed of SEEDS) {
            plans.set(seed, planWorld(seed));
        }
    });

    it("lays out the same world from the same seed, and another from another, quickly; once, shared and frozen", () => {
        const start = performance.now();
        const again = layOutWorld(1);
        const took = performance.now() - start;

        assert.deepEqual(again.places, plans.get(1).places);
        assert.deepEqual([...again.biome], [...plans.get(1).biome]);
        assert.notDeepEqual(plans.get(2).places.map(({ name }) => name), plans.get(1).places.map(({ name }) => name));
        assert.equal(plans.get(1).size, 8192);
        assert.ok(took < 8000, `${took.toFixed(0)} ms`);

        // (Asked for again, the same plan: frozen, so nothing changes it for everyone else)
        assert.equal(planWorld(1), plans.get(1));
        assert.throws(() => {
            plans.get(1).places[0].name = "Elsewhere";
        }, TypeError);
    });

    it("floods and finds its ways lowest first, ties in the order they came (its queue, against a list searched each time)", () => {
        const random = createRandom(5);
        const queue = new Queue();
        const reference = [];
        let order = 0;

        // (Put in and taken out by turns, many keys the same, then emptied)
        for (let round = 0; round < 3000; round++) {
            for (let k = random.int(0, 3); k > 0; k--) {
                const item = { key: random.int(0, 40) / 4, order: order++ };

                queue.push(item, item.key);
                reference.push(item);
            }

            while (queue.size && (round === 2999 || random.next() < 0.4)) {
                const lowest = reference.reduce((best, each) => (each.key < best.key || (each.key === best.key && each.order < best.order) ? each : best));
                const { item, key } = queue.pop();

                assert.equal(item, lowest);
                assert.equal(key, lowest.key);
                reference.splice(reference.indexOf(lowest), 1);
                assert.equal(queue.size, reference.length);
            }
        }

        assert.equal(queue.size, 0);
    });

    it("gives each people its own lands, in its own climate, with wild land between", () => {
        for (const [seed, plan] of plans) {
            const land = [...plan.water.keys()].filter((k) => plan.water[k] !== WATER.sea).length;
            const wild = [...plan.territory.keys()].filter((k) => !plan.territory[k] && plan.water[k] !== WATER.sea).length;

            assert.ok(wild / land > 0.2 && wild / land < 0.5, `seed ${seed}: ${((wild / land) * 100).toFixed(0)}% wild`);

            RACES.forEach((race, r) => {
                const cells = territoryOf(plan, r);
                const mean = (layer) => cells.reduce((sum, k) => sum + layer[k], 0) / cells.length;

                assert.ok(cells.length > 3500, `seed ${seed}: ${race.id} has ${cells.length} cells`);
                assert.ok(Math.abs(mean(plan.temperature) - race.climate.temperature) < 0.15, `seed ${seed}: ${race.id} warmth ${mean(plan.temperature).toFixed(2)}`);
                assert.ok(Math.abs(mean(plan.moisture) - race.climate.moisture) < 0.15, `seed ${seed}: ${race.id} wetness ${mean(plan.moisture).toFixed(2)}`);
            });
        }
    });

    it("gives each people's lands their kinds of land: elves' and dark elves' forests, the cat folk's savannah, and so on", () => {
        const theirs = { human: ["farmland", "meadow", "woods"], elf: ["elfwood"], darkElf: ["darkwood"], cat: ["savannah"], lizard: ["jungle", "marsh"], orc: ["badlands", "volcanic"] };

        for (const [seed, plan] of plans) {
            RACES.forEach((race, r) => {
                const cells = territoryOf(plan, r);
                const share = cells.filter((k) => theirs[race.id].includes(BIOMES[plan.biome[k]].id)).length / cells.length;

                assert.ok(share > 0.5, `seed ${seed}: ${race.id} ${(share * 100).toFixed(0)}% their own land`);
            });
        }
    });

    it("has every kind of land in every world: frozen north, volcano, marsh, mountains, lakes and all", () => {
        for (const [seed, plan] of plans) {
            for (const { id } of BIOMES) {
                assert.ok(plan.biome.includes(BIOME[id]), `seed ${seed}: no ${id}`);
            }

            assert.equal(BIOMES[plan.biome[at(...plan.volcano)]].id, "volcanic");
        }
    });

    it("runs its rivers down to the sea or into lakes", () => {
        for (const [seed, plan] of plans) {
            const rivers = [...plan.water.keys()].filter((k) => plan.water[k] === WATER.river);
            const reached = new Uint8Array(CELLS * CELLS);
            const queue = [...plan.water.keys()].filter((k) => plan.water[k] === WATER.sea);

            queue.forEach((k) => (reached[k] = 1));

            // Up from the sea, through lakes and rivers
            for (let i = 0; i < queue.length; i++) {
                const [x, y] = [queue[i] % CELLS, Math.floor(queue[i] / CELLS)];

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const n = x + dx < 0 || y + dy < 0 || x + dx >= CELLS || y + dy >= CELLS ? -1 : at(x + dx, y + dy);

                        if (n >= 0 && !reached[n] && (plan.water[n] === WATER.river || plan.water[n] === WATER.lake)) {
                            reached[n] = 1;
                            queue.push(n);
                        }
                    }
                }
            }

            const joined = rivers.filter((k) => reached[k]).length / rivers.length;

            assert.ok(rivers.length > 500, `seed ${seed}: ${rivers.length} river cells`);
            assert.ok(joined > 0.9, `seed ${seed}: ${(joined * 100).toFixed(0)}% of the rivers reach the sea`);
        }
    });

    it("gives each people a capital, cities, towns, villages, hamlets and farmsteads in their lands, apart, each with a guild but the hamlets and farmsteads, all named", () => {
        for (const [seed, plan] of plans) {
            const names = new Set(plan.places.map(({ name }) => name));

            assert.equal(names.size, plan.places.length, `seed ${seed}: every name different`);

            RACES.forEach((race, r) => {
                const mine = plan.places.filter((place) => place.race === race.id);
                const count = (kind) => mine.filter((place) => place.kind === kind).length;

                assert.equal(count("capital"), 1);
                assert.ok(count("city") >= 2 && count("city") <= 3, `seed ${seed}: ${race.id} ${count("city")} cities`);
                assert.ok(count("town") >= 4 && count("town") <= 6, `seed ${seed}: ${race.id} ${count("town")} towns`);
                assert.ok(count("village") >= 4, `seed ${seed}: ${race.id} ${count("village")} villages`);
                assert.ok(count("hamlet") >= 3, `seed ${seed}: ${race.id} ${count("hamlet")} hamlets`);
                assert.ok(count("farmstead") >= 1, `seed ${seed}: ${race.id} ${count("farmstead")} farmsteads`);

                for (const place of mine) {
                    const k = at(...place.cell);

                    assert.equal(plan.territory[k], r + 1, `${place.name} in its people's lands`);
                    assert.equal(plan.water[k], WATER.none, `${place.name} on dry land`);
                    assert.equal(place.guild, place.kind !== "hamlet" && place.kind !== "farmstead");
                    assert.match(place.name, /^[A-Z][a-z]+$/);
                    assert.deepEqual(place.at, [(place.cell[0] + 0.5) * CELL, (place.cell[1] + 0.5) * CELL]);

                    for (const other of plan.places.filter((p) => p !== place && (p.race === place.race || p.kind === "hamlet" || p.kind === "farmstead" || place.kind === "hamlet" || place.kind === "farmstead"))) {
                        assert.ok(distance(place.cell, other.cell) >= (SETTLEMENTS[place.kind].apart + SETTLEMENTS[other.kind].apart) / 2 - 1e-9, `${place.name} and ${other.name} apart`);
                    }
                }
            });
        }
    });

    it("joins every settlement to its capital by road, and the capitals by trade roads, over land and bridges", () => {
        for (const [seed, plan] of plans) {
            const linked = new Map(plan.places.map(({ id }) => [id, new Set()]));

            for (const road of plan.roads) {
                linked.get(road.from).add(road.to);
                linked.get(road.to).add(road.from);

                for (const [x, y] of road.cells) {
                    const water = plan.water[at(x, y)];

                    assert.ok(water === WATER.none || water === WATER.river, `seed ${seed}: a road into the water`);
                    assert.ok(plan.road[at(x, y)] >= (road.kind === "track" ? ROAD.track : ROAD.road));
                }

                assert.deepEqual(road.bridges, road.cells.filter(([x, y]) => plan.water[at(x, y)] === WATER.river));
            }

            // Each capital reaches every settlement of its people (but its farmsteads, out in the
            // fields off the roads), and every other capital
            const reach = (from) => {
                const seen = new Set([from]);
                const queue = [from];

                for (let i = 0; i < queue.length; i++) {
                    for (const next of linked.get(queue[i])) {
                        if (!seen.has(next)) {
                            seen.add(next);
                            queue.push(next);
                        }
                    }
                }

                return seen;
            };

            for (const race of plan.races) {
                const reached = reach(race.capital);

                for (const place of plan.places.filter((p) => (p.race === race.id && p.kind !== "farmstead") || p.kind === "capital")) {
                    assert.ok(reached.has(place.id), `seed ${seed}: ${race.capital} to ${place.id}`);
                }
            }

            assert.equal(plan.roads.filter(({ kind }) => kind === "trade").length >= RACES.length - 1, true);
        }
    });

    it("puts ruins, caves, shrines, stones, towers, castles and each people's own buildings between the settlements", () => {
        for (const [seed, plan] of plans) {
            for (const { kind, count } of SITES) {
                const found = plan.sites.filter((site) => site.kind === kind).length;

                assert.ok(found >= Math.ceil(count * 0.8), `seed ${seed}: ${found} of ${count} ${kind}`);
            }

            RACES.forEach((race, r) => {
                for (const kind of [...race.structures, "castle"]) {
                    const site = plan.sites.find((s) => s.kind === kind && s.race === race.id);

                    assert.ok(site, `seed ${seed}: ${race.id}'s ${kind}`);
                    assert.equal(plan.territory[at(...site.cell)], r + 1);
                }
            });

            for (const site of plan.sites) {
                assert.notEqual(plan.water[at(...site.cell)], WATER.sea);
                assert.ok(plan.places.every((place) => distance(place.at, site.at) >= place.radius), `${site.kind} clear of settlements`);
            }

            // Caves are mostly in the hills
            const caves = plan.sites.filter(({ kind }) => kind === "cave");

            assert.ok(caves.filter((cave) => plan.height[at(...cave.cell)] >= 0.5).length / caves.length > 0.6);
        }
    });

    it("scatters enemy camps in the wild, away from settlements, each of a faction that suits the land, its patrols roaming near it", () => {
        for (const [seed, plan] of plans) {
            assert.ok(plan.camps.length >= 60, `seed ${seed}: ${plan.camps.length} camps`);

            let suited = 0;

            for (const camp of plan.camps) {
                const faction = FACTIONS.find(({ id }) => id === camp.faction);

                assert.ok(faction);
                assert.ok(camp.roam >= 180 && camp.roam <= 320 && camp.patrols >= 1 && camp.patrols <= 3);
                assert.ok(plan.places.every((place) => distance(place.at, camp.at) >= place.radius + 320 - 1), `seed ${seed}: ${camp.id} near a settlement`);
                assert.equal(plan.water[at(...camp.cell)], WATER.none);
                suited += faction.biomes.includes(BIOMES[plan.biome[at(...camp.cell)]].id) || faction.near ? 1 : 0;

                for (const other of plan.camps.filter((c) => c !== camp)) {
                    assert.ok(distance(camp.cell, other.cell) >= 14);
                }
            }

            assert.ok(suited / plan.camps.length > 0.8, `seed ${seed}: ${suited} camps suit their land`);
        }
    });

    it("makes camps more dangerous the further they are from where the player started", () => {
        const camp = { at: [4000, 4000] };

        assert.equal(campTier(camp, [4000, 4200]), 1);
        assert.equal(campTier(camp, [4000, 4000 + 2000]), 1);
        assert.equal(campTier(camp, [4000, 4000 + 3000]), 3);
        assert.equal(campTier({ at: [500, 500] }, [7700, 7700]), 8);

        // From every people's start: a few weak camps near, stronger ones further out
        for (const [seed, plan] of plans) {
            for (const race of RACES) {
                const start = startFor(plan, race.id).at;
                const tiers = plan.camps.map((c) => ({ tier: campTier(c, start), far: distance(c.at, start) })).sort((a, b) => a.far - b.far);

                assert.ok(tiers.every(({ tier }, k) => k === 0 || tier >= tiers[k - 1].tier), "never weaker further out");
                assert.ok(tiers.filter(({ tier }) => tier === 1).length >= 2, `seed ${seed}: ${race.id} has ${tiers.filter(({ tier }) => tier === 1).length} tier-1 camps near`);
                assert.ok(tiers.at(-1).tier >= 5, `seed ${seed}: ${race.id}: up to tier ${tiers.at(-1).tier} far off`);
            }
        }
    });

    it("starts a player of each people in one of their towns, near their capital", () => {
        const plan = plans.get(2);

        for (const race of RACES) {
            const town = startFor(plan, race.id);
            const capital = plan.places.find((place) => place.race === race.id && place.kind === "capital");

            assert.equal(town.kind, "town");
            assert.equal(town.race, race.id);
            assert.equal(town.guild, true);
            assert.equal(landAt(plan, ...town.at).race, race.id);

            for (const other of plan.places.filter((place) => place.race === race.id && place.kind === "town")) {
                assert.ok(distance(town.at, capital.at) <= distance(other.at, capital.at));
            }
        }

        assert.throws(() => startFor(plan, "dwarf"));
    });

    it("has a guild branch in every capital, city, town and village, each with open ground round it for the guild's work", () => {
        const plan = plans.get(3);
        const branches = guilds(plan);

        assert.equal(branches.length, plan.places.filter(({ kind }) => kind !== "hamlet" && kind !== "farmstead").length);

        const branch = startFor(plan, "elf");
        const spots = openGround(plan, branch, 7, 6);

        assert.equal(spots.length, 6);
        assert.deepEqual(openGround(plan, branch, 7, 6), spots, "the same from the same seed");

        for (const spot of spots) {
            const land = landAt(plan, ...spot);

            assert.equal(guildFor(plan, ...spot), branch, "in its district");
            assert.equal(land.water, WATER.none);
            assert.equal(land.road, ROAD.none);
            assert.ok(plan.places.every((place) => distance(place.at, spot) >= place.radius + 150));
        }
    });
});
