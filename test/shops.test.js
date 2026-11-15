// The shops in the world (docs/WAR.md *Shops*): each people's master shops placed (worldplan/
// settle.js), the specialists' in every town, city and capital and a master's where it's kept, the
// crafters' by the settlement's kind and seed (docs/CRAFTING.md), houses made over and nothing else
// moved (setpieces/town.js); their shopfronts in each people's look (art/kits/shopfront.js);
// inside, their floors, their keepers selling, talking and asked what they'd make (core/insides.js,
// core/dialogue.js), what they sell set out as makers' models and museums' scans
// (world/interiors3d.js shopWares); and their icons on the maps
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// (Textured materials and signs paint a canvas: enough of one for them to in Node, every other
// drawing call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const THREE = await import("three");
const { CRAFTER_SPARE, craftersOf, keepsShops, layoutTown, SETTLEMENT_KINDS } = await import("../client/js/core/setpieces/town.js");
const { CRAFTER_SHOPS, ENTERED, MASTER_SHOPS, SHOP_LANDMARKS, SPECIALISTS } = await import("../client/js/core/setpieces/pieces.js");
const { CRAFTER_TOWNS, CRAFTERS } = await import("../client/js/core/recipes.js");
const { waysOut } = await import("../client/js/core/settlements.js");
const { ENTERABLE, ENTRANCES, entranceSpecOf, SHOP_INSIDES, shopFolkOf, shopRooms } = await import("../client/js/core/insides.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { planWorld } = await import("../client/js/core/worldplan/plan.js");
const { RACES } = await import("../client/js/core/worldplan/races.js");
const { SHOPS } = await import("../client/js/core/progress.js");
const { Conversation, TREES, treeFor } = await import("../client/js/core/dialogue.js");
const { landmark, LANDMARK_BUILDERS } = await import("../client/js/world/art/kits/landmarks.js");
const { SHOPFRONTS } = await import("../client/js/world/art/kits/shopfront.js");
const { builderFor } = await import("../client/js/world/art/peoples/index.js");
const { ICON_KINDS, ICON_NAMES } = await import("../client/js/app/mapicons.js");
const { DUNGEON_PROPS } = await import("../client/js/world/dungeons3d.js");
const { shopWares } = await import("../client/js/world/interiors3d.js");

const PEOPLES = ["human", "elf", "darkElf", "cat", "lizard", "orc"];

function trianglesOf(object) {
    let count = 0;

    object.traverse((node) => {
        if (node.isMesh) {
            count += (node.geometry.index ? node.geometry.index.count : node.geometry.attributes.position.count) / 3;
        }
    });

    return count;
}

function materialsOf(object) {
    const names = [];

    object.traverse((node) => {
        if (node.isMesh) {
            names.push(...[node.material].flat().map(({ name }) => name));
        }
    });

    return names;
}

describe("each people's master shops (worldplan/settle.js)", () => {
    let plans;

    before(() => {
        plans = [1, 2, 3].map((seed) => planWorld(seed));
    });

    it("keeps one of each for each people, in three different villages, towns or cities of theirs", () => {
        for (const plan of plans) {
            for (const { id } of RACES) {
                const kept = plan.places.filter(({ race, master }) => race === id && master);

                assert.deepEqual(kept.map(({ master }) => master).sort(), [...MASTER_SHOPS].sort(), id);
                assert.equal(new Set(kept.map((place) => place.id)).size, MASTER_SHOPS.length, `${id}: no two in one place`);
                assert.ok(kept.every(({ kind }) => ["village", "town", "city"].includes(kind)), `${id}: ${kept.map(({ kind }) => kind)}`);
            }
        }
    });

    it("chooses the same places for the same world, and others for another", () => {
        const masters = (plan) => plan.places.filter(({ master }) => master).map(({ id, master }) => `${id}:${master}`);

        assert.deepEqual(masters(planWorld(2)), masters(plans[1]));
        assert.notDeepEqual(masters(plans[0]), masters(plans[1]));
    });
});

describe("the shops in a settlement (setpieces/town.js)", () => {
    it("keeps the specialists' shops where there's a church, a guild, a blacksmith and a seat: every town, city and capital, no village", () => {
        assert.deepEqual(
            Object.keys(SETTLEMENT_KINDS).filter((kind) => keepsShops(SETTLEMENT_KINDS[kind])),
            ["town", "city", "capital"],
        );

        for (const people of PEOPLES) {
            for (const kind of ["town", "city", "capital"]) {
                const town = layoutTown({ seed: 4, kind, people });
                const out = (piece) => Math.hypot(piece.x - town.centre[0], piece.y - town.centre[1]) / town.radius;

                for (const name of SPECIALISTS) {
                    const shops = town.pieces.filter((piece) => piece.name === name);

                    assert.equal(shops.length, 1, `${people} ${kind}: one ${name}`);
                    assert.equal(shops[0].kind, "landmark");
                    assert.equal(typeof shops[0].seed, "number");
                    // (A city's and a capital's round its market; a town's, with fewer houses on
                    // its streets near it, wherever the nearest are)
                    assert.ok(out(shops[0]) < (kind === "town" ? 1.05 : 0.6), `${people} ${kind}: the ${name} ${out(shops[0]).toFixed(2)} of the way out`);
                }
            }

            for (const kind of ["village", "hamlet", "farmstead"]) {
                assert.ok(!layoutTown({ seed: 4, kind, people }).pieces.some(({ name }) => SPECIALISTS.includes(name) || MASTER_SHOPS.includes(name)), `${people} ${kind}`);
            }
        }
    });

    it("makes over a house for the master's shop kept there, in a village as in a town", () => {
        for (const master of MASTER_SHOPS) {
            for (const kind of ["village", "town", "city"]) {
                const town = layoutTown({ seed: 6, kind, people: "elf", master });

                assert.equal(town.pieces.filter(({ name }) => name === master).length, 1, `${kind} ${master}`);
                assert.ok(!MASTER_SHOPS.filter((other) => other !== master).some((other) => town.pieces.some(({ name }) => name === other)));
            }
        }
    });

    it("is the same every time for a place, its seat and barracks where they'd be", () => {
        const [a, b] = [1, 2].map(() => layoutTown({ seed: 5, kind: "city", master: "emporium" }));
        const without = layoutTown({ seed: 5, kind: "city" });

        assert.deepEqual(a.pieces, b.pieces);

        for (const name of ["hall", "barracks"]) {
            const [x, y] = [a, without].map((town) => town.pieces.find((piece) => piece.name === name));

            assert.deepEqual([x.x, x.y], [y.x, y.y], `${name} unmoved by the master's shop`);
        }
    });
});

describe("the crafters' shops in a settlement (setpieces/town.js craftersOf, docs/CRAFTING.md)", () => {
    const PLACED = ["village", "town", "city", "capital"];
    // (A layout's crafters' shops, in the order they stand among its pieces)
    const craftersIn = (town) => town.pieces.filter(({ name }) => CRAFTER_SHOPS.includes(name)).map(({ name }) => name);

    it("chooses a village one of the leatherworker, the bowyer and the tailor by its seed, a town two, a city two and its jeweller, a capital all four, a hamlet and a farmstead none", () => {
        const seen = { village: new Set(), town: new Set(), city: new Set() };

        for (let seed = 1; seed <= 60; seed++) {
            for (const kind of PLACED) {
                const chosen = craftersOf(kind, seed);
                const { always, some, count } = CRAFTER_TOWNS[kind];

                assert.deepEqual(craftersOf(kind, seed), chosen, `${kind} ${seed}: the same every time`);
                assert.equal(chosen.length, always.length + count, `${kind} ${seed}`);
                assert.ok(always.every((name) => chosen.includes(name)) && chosen.every((name) => always.includes(name) || some.includes(name)), `${kind} ${seed}: ${chosen}`);
                assert.deepEqual(chosen, CRAFTER_SHOPS.filter((name) => chosen.includes(name)), `${kind} ${seed}: in order`);
                seen[kind]?.add(chosen.join());
            }

            assert.deepEqual(craftersOf("capital", seed), [...CRAFTER_SHOPS]);
            assert.ok(craftersOf("city", seed).includes("jeweller") && !craftersOf("town", seed).includes("jeweller") && !craftersOf("village", seed).includes("jeweller"));

            for (const kind of ["hamlet", "farmstead", "castle"]) {
                assert.deepEqual(craftersOf(kind, seed), []);
            }
        }

        // (Every one of the three in a village somewhere, every pair of them in a town)
        assert.equal(seen.village.size, 3);
        assert.equal(seen.town.size, 3);
        assert.equal(seen.city.size, 3);
    });

    it("makes over a house near the market for each crafter a place keeps, as the specialists' are, in every people's settlements", () => {
        let made = 0;

        for (const people of PEOPLES) {
            for (const kind of PLACED) {
                for (const seed of kind === "capital" ? [1, 2] : [1, 2, 3, 4]) {
                    const town = layoutTown({ seed, kind, people });
                    const chosen = craftersOf(kind, seed);
                    const houses = town.pieces.filter((piece) => piece.kind === "house").length;
                    const have = craftersIn(town);

                    // (Each it keeps once; one left out only where it would have left the place no
                    // more than CRAFTER_SPARE houses)
                    assert.equal(new Set(have).size, have.length, `${people} ${kind} ${seed}: ${have}`);
                    assert.ok(have.every((name) => chosen.includes(name)), `${people} ${kind} ${seed}: ${have} of ${chosen}`);
                    assert.ok(have.length === chosen.length || houses <= CRAFTER_SPARE, `${people} ${kind} ${seed}: ${have} of ${chosen}, ${houses} houses left`);

                    for (const piece of town.pieces.filter(({ name }) => CRAFTER_SHOPS.includes(name))) {
                        assert.equal(piece.kind, "landmark");
                        assert.equal(piece.id, `${piece.name}-1`);
                        assert.equal(typeof piece.seed, "number");
                        assert.ok(ENTERED.includes(piece.name) && ENTERABLE.includes(piece.name), piece.name);
                        made++;
                    }
                }
            }
        }

        assert.ok(made > 150, `${made} crafters' shops`);
    });

    it("keeps every kind of shop there is in a capital (the owner's rule): its blacksmiths, the specialists' and the four crafters'", () => {
        for (const seed of [1, 2, 3]) {
            const plan = planWorld(seed);

            for (const place of plan.places.filter(({ kind }) => kind === "capital")) {
                const town = layoutTown({ seed: place.seed, kind: place.kind, exits: waysOut(plan, place), people: place.race ?? "human", master: place.master ?? null });
                const names = town.pieces.filter(({ kind }) => kind === "landmark").map(({ name }) => name);

                for (const name of ["blacksmith", ...SPECIALISTS, ...CRAFTER_SHOPS]) {
                    assert.ok(names.includes(name), `world ${seed}, ${place.race}'s capital: its ${name}`);
                }

                // (Every crafter there but the masters, kept in a village, town or city of theirs)
                assert.ok(Object.keys(CRAFTERS).filter((name) => !MASTER_SHOPS.includes(name)).every((name) => name === "smith" || names.includes(name)));
            }
        }
    });

    it("moves nothing else: laid out as it was before there were crafters, every other building stands where it stood, and each crafter's on a house's lot", () => {
        for (const people of PEOPLES) {
            for (const kind of Object.keys(SETTLEMENT_KINDS)) {
                for (const [seed, master] of [[3, null], [8, ["village", "town", "city"].includes(kind) ? "masterArmorer" : null]]) {
                    const now = layoutTown({ seed, kind, people, master });
                    const before = layoutTown({ seed, kind, people, master, crafters: [] });
                    const where = `${people} ${kind} ${seed}`;

                    assert.deepEqual(craftersIn(before), [], where);

                    for (const key of Object.keys(before).filter((one) => one !== "pieces")) {
                        assert.deepEqual(now[key], before[key], `${where}: its ${key}`);
                    }

                    assert.equal(now.pieces.length, before.pieces.length, where);

                    before.pieces.forEach((was, k) => {
                        const is = now.pieces[k];

                        if (!CRAFTER_SHOPS.includes(is.name)) {
                            assert.deepEqual(is, was, `${where}: ${was.key} as it was`);

                            return;
                        }

                        assert.equal(was.kind, "house", `${where}: the ${is.name} made over from a house`);
                        assert.deepEqual([is.x, is.y, is.w, is.h, is.facing, is.people, is.water, is.style], [was.x, was.y, was.w, was.h, was.facing, was.people, was.water, was.style], `${where}: the ${is.name} on its lot`);
                    });
                }
            }
        }
    });

    it("leaves a village of a few houses as it is: no crafter where it would leave it CRAFTER_SPARE houses or fewer", () => {
        let small = 0;

        for (let seed = 1; seed <= 30; seed++) {
            for (const people of ["lizard", "darkElf"]) {
                const before = layoutTown({ seed, kind: "village", people, crafters: [] });

                if (before.pieces.filter((piece) => piece.kind === "house").length <= CRAFTER_SPARE) {
                    assert.deepEqual(craftersIn(layoutTown({ seed, kind: "village", people })), [], `${people} village ${seed}`);
                    small++;
                }
            }
        }

        assert.ok(small > 0, "a village too small for one");
    });
});

describe("a shop drawn (art/kits/shopfront.js, landmarks.js, art/peoples, app/mapicons.js)", () => {
    it("builds every shop in each people's look, within its lot and a few thousand triangles, its name on a board and its sign by the door", async () => {
        for (const name of SHOP_LANDMARKS) {
            assert.equal(typeof LANDMARK_BUILDERS[name], "function", name);
            assert.ok(SHOPFRONTS[name], name);
        }

        for (const people of PEOPLES) {
            const town = layoutTown({ seed: 3, kind: "city", people, master: "masterSwordsmith" });

            for (const piece of town.pieces.filter(({ name }) => SHOP_LANDMARKS.includes(name))) {
                const build = builderFor(piece) ?? landmark;
                const object = await build(piece);
                const box = new THREE.Box3().setFromObject(object);
                const triangles = trianglesOf(object);
                const over = people === "orc" ? 10 : 7.5;

                assert.ok(triangles > 100 && triangles < 14000, `${people} ${piece.name}: ${triangles} triangles`);
                assert.ok(box.min.x > -7.5 && box.min.z > -7.5 && box.max.x < piece.w * 20 + 7.5 && box.max.z < piece.h * 20 + over, `${people} ${piece.name}: spills out of its lot`);
                assert.ok(materialsOf(object).includes(`board ${piece.name}`), `${people} ${piece.name}: its name`);
                assert.ok(materialsOf(object).includes(`sign ${piece.name}`), `${people} ${piece.name}: its sign`);
            }
        }
    });

    it("marks one gone into on the maps with its own icon", () => {
        for (const name of SHOP_LANDMARKS) {
            assert.ok(ICON_KINDS.includes(name), name);
        }

        assert.deepEqual(CRAFTER_SHOPS.map((name) => ICON_NAMES[name]), ["Bowyer", "Leatherworker", "Tailor", "Jeweller"]);
    });
});

describe("a shop inside (core/insides.js, core/dialogue.js)", () => {
    it("can be gone into, by its door where its art puts it", () => {
        for (const name of SHOP_LANDMARKS) {
            assert.ok(ENTERED.includes(name) && ENTERABLE.includes(name), name);
            assert.ok(ENTRANCES[name].width >= 1.6 && ENTRANCES[name].depth > 1, name);
            // (A human's built of the house kit: its door the kit's, where ENTRANCES has the rest's)
            assert.deepEqual(entranceSpecOf({ kind: "landmark", name }), { ...ENTRANCES[name], width: 1.05, height: 2.06, floor: 0.2 }, name);
        }
    });

    it("has its counter, its shelves or racks along the back wall, what it sells set out, and its door", () => {
        for (const name of SHOP_LANDMARKS) {
            const [floor] = shopRooms({ kind: name, name: "the shop" });
            const map = readPlan(`${name}/shop`, floor.name, floor.rows, { ground: floor.ground });
            const at = (kind) => map.pieces.filter((piece) => piece.kind === kind);

            assert.equal(floor.style, "shop");
            assert.equal(floor.look, name);
            assert.equal(at("counter").length, 1, name);
            assert.ok(map.pieces.some(({ kind, y }) => y === 0 && (kind === "shelves" || kind === "rack")), `${name}: its back wall`);
            assert.ok(at("table").length + at("stand").length + at("rack").length + at("shelves").length >= 4, `${name}: its wares set out`);
            assert.equal(map.marks.D.length, 2, name);
        }
    });

    it("keeps a keeper behind its counter, selling its wares and talking of its trade and today's special", () => {
        for (const name of SHOP_LANDMARKS) {
            const [floor] = shopRooms({ kind: name, name: "the shop" });
            const map = readPlan(`${name}/shop`, floor.name, floor.rows, { ground: floor.ground });
            const folk = shopFolkOf({ kind: name, seed: 7 }, { ...map, id: `${name}/shop` });
            const [counter] = map.pieces.filter(({ kind }) => kind === "counter");

            assert.equal(folk.length, 1);

            const [keeper] = folk;

            assert.equal(keeper.shop, name);
            assert.ok(SHOPS[keeper.shop].daily, `${name}: a daily stock`);
            assert.equal(keeper.title, SHOP_INSIDES[name].title);
            assert.ok(keeper.square[1] < counter.y && keeper.square[0] >= counter.x && keeper.square[0] < counter.x + counter.w, `${name}: behind the counter`);
            assert.ok(keeper.routine.stops.every(({ square: [x, y] }) => !map.blocked[y][x]), `${name}: on the floor`);

            const tree = treeFor({ id: "keeper", role: keeper.role, talk: keeper.talk });

            assert.equal(tree, TREES[name]);
            assert.ok(tree.nodes.more.choices.some(({ do: effects }) => effects?.some(({ shop }) => shop === name)), `${name}: sells`);
            assert.ok(tree.nodes.special.say.some(({ lines }) => lines.some((line) => line.includes("{special}") && line.includes("{specialPrice}"))), `${name}: today's special`);
        }
    });

    it("names a shop for its keeper, or by its own name", () => {
        assert.equal(SHOP_INSIDES.swordsmith.named("Ashdown"), "Ashdown's Blades");
        assert.equal(SHOP_INSIDES.alchemist.named("Rowe"), "Rowe's Apothecary");
        assert.equal(SHOP_INSIDES.emporium.named("Rowe"), "the Mystic Emporium");
        assert.deepEqual(CRAFTER_SHOPS.map((name) => SHOP_INSIDES[name].named("Rowe")), ["Rowe's Bows", "Rowe's Leathers", "Rowe's Tailoring", "Rowe's Jewels"]);
        assert.deepEqual(CRAFTER_SHOPS.map((name) => SHOP_INSIDES[name].title), ["Bowyer", "Leatherworker", "Tailor", "Jeweller"]);
    });

    it("has every crafter's keeper asked what they can make, the crafter named to the game, the talk ending on it as on buying; no one else's", () => {
        // (Each crafter's talk: the smiths', the castle's smith making as a smith, and the shops')
        const talks = { smith: "smith", castleSmith: "smith", ...Object.fromEntries(Object.keys(CRAFTERS).filter((name) => name !== "smith").map((name) => [name, name])) };

        for (const [talk, crafter] of Object.entries(talks)) {
            const tree = TREES[talk];
            const asked = tree.nodes.more.choices.filter(({ say }) => say === "What can you make?");

            assert.equal(asked.length, 1, talk);
            assert.deepEqual(asked[0].do, [{ commission: crafter }], talk);
            assert.equal(asked[0].next, null, talk);

            // (Chosen: the talk's over, and the game told which crafter's)
            const done = [];
            const conversation = new Conversation(tree, { speaker: { id: "keeper", name: "Ada Rowe", title: "Keeper" }, player: { name: "Nessa" }, names: { apprentice: "Wil" }, memory: { talks: 0, flags: [] }, knowledge: new Set(), onEffect: (effect) => done.push(effect), check: () => true });

            conversation.choose(conversation.choices.findIndex(({ text }) => text === "What can you make?"));
            assert.ok(conversation.ended, talk);
            assert.deepEqual(done, [{ commission: crafter }], talk);
        }

        // (No one who doesn't make: an alchemist, a pedlar, a castle's quartermaster and arcanist)
        for (const talk of ["alchemist", "pedlar", "quartermaster", "arcanist", "barkeep"]) {
            const choices = Object.values(TREES[talk].nodes).flatMap(({ choices }) => (Array.isArray(choices) ? choices : []));

            assert.ok(!choices.some(({ do: effects }) => effects?.some((effect) => "commission" in effect)), talk);
        }
    });
});

describe("a shop's wares as models (world/interiors3d.js shopWares, scripts/build-props.js)", () => {
    const plan = (name) => {
        const [floor] = shopRooms({ kind: name, name: "the shop" });

        return readPlan(`${name}/shop`, floor.name, floor.rows, { ground: floor.ground });
    };

    it("sets them out on its counter, tables, benches, lecterns, racks and stands, each one of the catalog's, none on the floor in anyone's way", () => {
        for (const name of SHOP_LANDMARKS) {
            const map = plan(name);
            const wares = shopWares(map, name);

            assert.ok(wares.length >= 8, `${name}: ${wares.length}`);

            for (const { model, x, z } of wares) {
                assert.ok(DUNGEON_PROPS[model], `${name}: no ${model} in the catalog`);
                assert.ok(x > 0 && x < map.width && z > 0 && z < map.height, `${name}: the ${model} at ${x}, ${z} out of the room`);
                assert.ok(map.blocked[Math.floor(z)][Math.floor(x)], `${name}: the ${model} at ${x.toFixed(2)}, ${z.toFixed(2)} in the way`);
            }
        }
    });

    it("sets out each trade's own: blades on a swordsmith's tables and in its racks, its grindstone; an armorer's helms, mail and shields; a scribe's books, quills and scrolls; an alchemist's alembics, mortars, flasks and jars; the Emporium's crystal ball and globe; a bowyer's tools and baskets of fletchings, a leatherworker's sheepskins and knives, a tailor's baskets of thread, a jeweller's cups", () => {
        const models = (name) => new Set(shopWares(plan(name), name).map(({ model }) => model));
        const wanted = {
            swordsmith: ["sword-arming", "sword-long", "claymore", "dagger", "sword-rack", "grindstone"],
            masterSwordsmith: ["zweihander", "sword-chevalier", "claymore", "sword-rack", "grindstone"],
            armorer: ["barbuta", "great-helm", "hauberk", "shield-heater", "shield-kite"],
            masterArmorer: ["barbuta-visored", "great-helm", "hauberk", "shield-heater", "shield-kite"],
            scriptorium: ["book-open", "books", "quill", "scroll", "hourglass"],
            alchemist: ["alembic", "mortar", "albarello", "bottle-magic", "bottle-magic-2"],
            emporium: ["crystal-ball", "globe-celestial", "skull", "hourglass"],
            bowyer: ["hatchet", "saw", "mallet", "basket"],
            leatherworker: ["pelt", "board", "mallet", "dagger", "bucket"],
            tailor: ["basket", "basket-lidded", "candlestick", "pot-flat"],
            jeweller: ["goblet-a", "goblet-b", "goblet-c", "vase-small", "candleholder-a", "bowl-small"],
        };

        for (const [name, want] of Object.entries(wanted)) {
            const have = models(name);

            assert.deepEqual(want.filter((model) => !have.has(model)), [], name);
        }
    });

    it("stands a swordsmith's blades in its racks hilt up, and draws the racks and the grindstone they stand for as models, not as their own art", () => {
        const map = plan("swordsmith");
        const wares = shopWares(map, "swordsmith");
        // (Standing on the floor by the walls: in the racks)
        const racked = wares.filter(({ model, x, y }) => model !== "sword-rack" && (x < 1 || x > map.width - 1) && y < 0.2);

        assert.equal(racked.length, 16);
        assert.ok(racked.every(({ roll, y }) => roll === -Math.PI / 2 && y > 0 && y < 0.2));
        assert.ok(wares.some(({ model, piece }) => model === "grindstone" && piece?.kind === "grindstone"));
        assert.equal(wares.filter(({ piece }) => piece?.kind === "rack").length, 2);
    });
});

