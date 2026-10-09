// The shops in the world (docs/WAR.md *Shops*): each people's master shops placed (worldplan/
// settle.js), the specialists' in every town, city and capital and a master's where it's kept,
// houses made over (setpieces/town.js); their shopfronts in each people's look (art/kits/
// shopfront.js); inside, their floors, their keepers selling and talking (core/insides.js,
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
const { keepsShops, layoutTown, SETTLEMENT_KINDS } = await import("../client/js/core/setpieces/town.js");
const { ENTERED, MASTER_SHOPS, SHOP_LANDMARKS, SPECIALISTS } = await import("../client/js/core/setpieces/pieces.js");
const { ENTERABLE, ENTRANCES, SHOP_INSIDES, shopFolkOf, shopRooms } = await import("../client/js/core/insides.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { planWorld } = await import("../client/js/core/worldplan/plan.js");
const { RACES } = await import("../client/js/core/worldplan/races.js");
const { SHOPS } = await import("../client/js/core/progress.js");
const { TREES, treeFor } = await import("../client/js/core/dialogue.js");
const { landmark, LANDMARK_BUILDERS } = await import("../client/js/world/art/kits/landmarks.js");
const { SHOPFRONTS } = await import("../client/js/world/art/kits/shopfront.js");
const { builderFor } = await import("../client/js/world/art/peoples/index.js");
const { ICON_KINDS } = await import("../client/js/app/mapicons.js");
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
                assert.ok(!layoutTown({ seed: 4, kind, people }).pieces.some(({ name }) => SHOP_LANDMARKS.includes(name)), `${people} ${kind}`);
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
    });
});

describe("a shop inside (core/insides.js, core/dialogue.js)", () => {
    it("can be gone into, by its door where its art puts it", () => {
        for (const name of SHOP_LANDMARKS) {
            assert.ok(ENTERED.includes(name) && ENTERABLE.includes(name), name);
            assert.ok(ENTRANCES[name].width >= 1.6 && ENTRANCES[name].depth > 1, name);
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

    it("sets out each trade's own: blades on a swordsmith's tables and in its racks, its grindstone; an armorer's helms, mail and shields; a scribe's books, quills and scrolls; an alchemist's alembics, mortars, flasks and jars; the Emporium's crystal ball and globe", () => {
        const models = (name) => new Set(shopWares(plan(name), name).map(({ model }) => model));
        const wanted = {
            swordsmith: ["sword-arming", "sword-long", "claymore", "dagger", "sword-rack", "grindstone"],
            masterSwordsmith: ["zweihander", "sword-chevalier", "claymore", "sword-rack", "grindstone"],
            armorer: ["barbuta", "great-helm", "hauberk", "shield-heater", "shield-kite"],
            masterArmorer: ["barbuta-visored", "great-helm", "hauberk", "shield-heater", "shield-kite"],
            scriptorium: ["book-open", "books", "quill", "scroll", "hourglass"],
            alchemist: ["alembic", "mortar", "albarello", "bottle-magic", "bottle-magic-2"],
            emporium: ["crystal-ball", "globe-celestial", "skull", "hourglass"],
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

