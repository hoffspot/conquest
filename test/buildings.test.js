// The buildings (client/js/world/art): houses laid out and built from their pieces of a town's
// layout, walls with openings let into them, the props, and the atlas they're all drawn with
import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
const { layoutTown } = await import("../client/js/core/setpieces/town.js");
const { GODS } = await import("../client/js/core/lore/gods.js");
const { TRADES } = await import("../client/js/core/setpieces/pieces.js");
const { LAYERS, layerOf, paintLayers, toAtlas } = await import("../client/js/world/art/engine/atlas.js");
const { material, MATERIALS } = await import("../client/js/world/art/engine/materials.js");
const { paintLayer } = await import("../client/js/world/art/engine/painters.js");
const { Solid } = await import("../client/js/world/art/engine/solid.js");
const { buildHouse, house, planHouse, STYLES } = await import("../client/js/world/art/kits/house.js");
const { EMBLEM_NAMES, paintEmblem } = await import("../client/js/world/art/kits/emblems.js");
const { landmark, LANDMARK_BUILDERS } = await import("../client/js/world/art/kits/landmarks.js");
const { prop, PROP_NAMES } = await import("../client/js/world/art/kits/props.js");
const { merge } = await import("../client/js/world/town3d.js");

const M = 5;

function trianglesOf(object) {
    let count = 0;

    object.traverse((node) => {
        if (node.isMesh) {
            const { geometry } = node;

            count += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
        }
    });

    return count;
}

const houses = ["village", "town", "city"].flatMap((kind) => [1, 2, 3, 4].flatMap((seed) => layoutTown({ seed, kind }).pieces.filter((piece) => piece.kind === "house").map((piece) => ({ ...piece, kind, town: seed }))));

describe("houses (kits/house.js)", () => {
    it("are laid out the same every time for the same piece, and differently for another", () => {
        const piece = houses[5];
        const [a, b] = [planHouse(piece), planHouse(piece)];

        assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
        assert.notEqual(JSON.stringify(planHouse({ ...piece, seed: piece.seed + 1 })), JSON.stringify(a));
    });

    it("have the storeys the layout asks for (as many as their style allows), and back buildings one", () => {
        for (const piece of houses) {
            const plan = planHouse(piece);
            const style = STYLES[piece.style];

            assert.equal(plan.levels.length, piece.back ? 1 : Math.min(piece.storeys, style.storeys), `${piece.key} in ${piece.kind} ${piece.town}`);
        }

        const cities = houses.filter(({ kind, back }) => kind === "city" && !back).map((piece) => planHouse(piece).levels.length);
        const villages = houses.filter(({ kind, back }) => kind === "village" && !back).map((piece) => planHouse(piece).levels.length);
        const average = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;

        assert.ok(average(cities) > average(villages) + 0.4, `cities ${average(cities)}, villages ${average(villages)}`);
        assert.ok(houses.some((piece) => planHouse(piece).levels.length === 3));
    });

    it("have a door at the front, a window on every floor of the front, and shops on some", () => {
        let shops = 0;

        for (const piece of houses) {
            const plan = planHouse(piece);
            const front = plan.openings.front;

            assert.equal(front[0].filter(({ kind }) => kind === "door").length, 1, piece.key);

            for (const [s, list] of front.entries()) {
                assert.ok(list.some(({ kind }) => kind === "window" || kind === "shop" || (s === 0 && kind === "door")), `${piece.key} floor ${s}`);
            }

            shops += front[0].some(({ kind }) => kind === "shop") ? 1 : 0;
        }

        assert.ok(shops > 5, `${shops} shops`);
        assert.ok(houses.filter(({ use }) => TRADES.includes(use)).length > shops * 0.8);
    });

    it("let every opening into its wall, clear of the corners and of each other, below the floor above", () => {
        for (const piece of houses) {
            const plan = planHouse(piece);

            for (const [side, storeys] of Object.entries(plan.openings)) {
                for (const [s, list] of storeys.entries()) {
                    const { box, height } = plan.levels[s];
                    const length = side === "front" || side === "back" ? box[1] - box[0] : box[3] - box[2];

                    for (const [k, { u0, u1, v0, v1 }] of list.entries()) {
                        assert.ok(u0 >= M * 0.3 && u1 <= length - M * 0.3 && u1 > u0, `${piece.key} ${side} ${s}: ${u0}-${u1} of ${length}`);
                        assert.ok(v0 >= 0 && v1 <= height - M * 0.3 && v1 > v0, `${piece.key} ${side} ${s}: ${v0}-${v1} of ${height}`);

                        for (const other of list.slice(k + 1)) {
                            assert.ok(u1 <= other.u0 || other.u1 <= u0, `${piece.key} ${side} ${s} openings overlap`);
                        }
                    }
                }
            }
        }
    });

    it("jetty only timber-framed houses of more than one storey", () => {
        for (const piece of houses) {
            const plan = planHouse(piece);

            if (plan.jetty) {
                assert.equal(plan.style, "timber");
                assert.ok(plan.levels.length > 1);
                assert.ok(plan.jetty >= 0.3 * M && plan.jetty <= 0.55 * M);
            }
        }
    });

    it("are built within their lots, a few hundred to a few thousand triangles each, weathered", () => {
        let most = 0;

        for (const piece of houses.filter((_, k) => k % 3 === 0)) {
            const object = house(piece);
            const box = new THREE.Box3().setFromObject(object);
            const triangles = trianglesOf(object);

            most = Math.max(most, triangles);
            assert.ok(triangles > 150 && triangles < 4500, `${piece.key}: ${triangles} triangles`);
            assert.ok(box.min.x > -M && box.min.z > -M && box.max.x < piece.w * 20 + M && box.max.z < piece.h * 20 + M, `${piece.key} spills out of its lot`);
            assert.ok(box.min.y >= 0 && box.max.y < M * 16, `${piece.key} is ${box.max.y / M} m tall`);

            object.traverse((node) => {
                if (node.isMesh) {
                    const colours = node.geometry.attributes.color.array;

                    assert.ok(colours.every((value) => Number.isFinite(value) && value >= 0 && value <= 1.2), piece.key);
                    assert.ok(node.geometry.attributes.position.array.every(Number.isFinite), piece.key);
                }
            });
        }

        assert.ok(most > 1000, `the biggest house is ${most} triangles`);
    });

    it("build barns and stables behind the houses of boards, and other back buildings as houses", () => {
        const backs = houses.filter(({ back }) => back);

        assert.ok(backs.some(({ use }) => use === "barn"));

        for (const piece of backs) {
            const plan = planHouse(piece);

            assert.equal(plan.style === "barn", piece.use === "barn" || piece.use === "stable", piece.key);
        }
    });
});

describe("landmarks (kits/landmarks.js)", () => {
    // Every landmark of some towns and cities, as their layouts have them
    const landmarks = ["town", "city"].flatMap((kind) => [1, 2, 3].flatMap((seed) => layoutTown({ seed, kind }).pieces.filter((piece) => piece.kind === "landmark")));
    const materialsOf = (object) => {
        const names = [];

        object.traverse((node) => {
            if (node.isMesh) {
                names.push(...[node.material].flat().map(({ name }) => name));
            }
        });

        return names;
    };

    it("builds every one a town has, within its lot and a few thousand triangles", async () => {
        const kinds = new Set(landmarks.map(({ name }) => name));

        for (const name of ["tavern", "church", "blacksmith", "guild"]) {
            assert.ok(kinds.has(name), name);
            assert.ok(LANDMARK_BUILDERS[name], name);
        }

        for (const piece of landmarks.filter(({ name }, k) => name !== "market" || k % 3 === 0)) {
            const object = await landmark(piece);
            const box = new THREE.Box3().setFromObject(object);
            const triangles = trianglesOf(object);

            assert.ok(triangles > 100 && triangles < 9000, `${piece.name}: ${triangles} triangles`);
            assert.ok(box.min.x > -M * 1.5 && box.min.z > -M * 1.5 && box.max.x < piece.w * 20 + M * 1.5 && box.max.z < piece.h * 20 + M * 1.5, `${piece.name} spills out of its lot`);
        }
    });

    it("builds a town hall in its street's look and a capital's keep, within their lots, with their boards and signs", async () => {
        const seats = [1, 2].flatMap((seed) => ["town", "capital"].map((kind) => layoutTown({ seed, kind }).pieces.find(({ name }) => name === "hall" || name === "keep")));

        assert.deepEqual(seats.map(({ name }) => name), ["hall", "keep", "hall", "keep"]);

        for (const piece of seats) {
            const object = await landmark(piece);
            const box = new THREE.Box3().setFromObject(object);
            const triangles = trianglesOf(object);
            const names = materialsOf(object);

            assert.ok(triangles > 100 && triangles < 9000, `${piece.name}: ${triangles} triangles`);
            assert.ok(box.min.x > -M * 1.5 && box.min.z > -M * 1.5 && box.max.x < piece.w * 20 + M * 1.5 && box.max.z < piece.h * 20 + M * 1.5, `${piece.name} spills out of its lot`);
            assert.ok(piece.name === "hall" ? names.includes("board hall") && names.includes("sign hall") : names.includes("sign keep"), piece.name);
        }
    });

    it("hangs each tavern's own name and sign, the guild's, and each church's patron's", async () => {
        for (const piece of landmarks.filter(({ name }) => name === "tavern" || name === "guild" || name === "church")) {
            const names = materialsOf(await landmark(piece));

            if (piece.name === "tavern") {
                assert.ok(names.includes(`board ${piece.tavern.name}`) && names.includes(`sign ${piece.tavern.name}`), piece.tavern.name);
            } else if (piece.name === "guild") {
                assert.ok(names.includes("board guild") && names.includes("sign guild"));
            } else {
                assert.ok(GODS[piece.patron], piece.patron);
                assert.ok(names.some((name) => name.includes(GODS[piece.patron].name)), `${piece.patron}: ${names.filter((name) => name.startsWith("sign"))}`);
            }
        }
    });
});

describe("emblems (kits/emblems.js)", () => {
    it("paints every emblem, one of it or several (The Three Bells)", () => {
        const canvas = globalThis.document.createElement("canvas").getContext("2d");

        for (const name of EMBLEM_NAMES) {
            for (const count of [1, 2, 3, 4, 7, 9]) {
                assert.doesNotThrow(() => paintEmblem(canvas, name, { x: 50, y: 50, size: 80, count }), `${count} ${name}`);
            }
        }
    });
});

describe("walls with openings (Solid.wall)", () => {
    // The area of a solid's faces facing `out`
    const areaFacing = (solid, out) => {
        const object = solid.toObject();
        let area = 0;

        object.traverse((node) => {
            if (!node.isMesh) {
                return;
            }

            const { position } = node.geometry.attributes;
            const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

            for (let i = 0; i < position.count; i += 3) {
                a.fromBufferAttribute(position, i);
                b.fromBufferAttribute(position, i + 1);
                c.fromBufferAttribute(position, i + 2);

                const normal = b.clone().sub(a).cross(c.clone().sub(a));

                if (normal.clone().normalize().dot(new THREE.Vector3(...out)) > 0.99) {
                    area += normal.length() / 2;
                }
            }
        });

        return area;
    };

    it("leave a hole for each opening, and fill its back", () => {
        const solid = new Solid();
        const face = { origin: [0, 0, 10], across: [1, 0, 0], out: [0, 0, 1] };
        const openings = [{ u0: 2, u1: 6, v0: 0, v1: 10, depth: 1, back: material("planks-dark") }, { u0: 9, u1: 13, v0: 5, v1: 9, depth: 1, back: material("glass") }];

        solid.wall(face, 20, 15, openings, material("plaster"));

        // The wall's face and the backs, all facing out: the whole wall
        assert.ok(Math.abs(areaFacing(solid, [0, 0, 1]) - 20 * 15) < 1e-6);
    });

    it("follow a gable's outline", () => {
        const solid = new Solid();

        solid.wall({ origin: [0, 0, 0], across: [1, 0, 0], out: [0, 0, 1] }, 20, 8, [], material("plaster"), { line: [[0, 0], [10, 8], [20, 0]] });
        assert.ok(Math.abs(areaFacing(solid, [0, 0, 1]) - 80) < 1e-6);
    });
});

describe("props (kits/props.js)", () => {
    it("builds every prop a town has, a few hundred triangles each at most", () => {
        for (const name of PROP_NAMES) {
            const triangles = trianglesOf(prop({ name, w: name === "well" || name === "tent" ? 2 : 1, h: name === "well" || name === "tent" ? 2 : 1, x: 3, y: 4 }));

            assert.ok(triangles > 10 && triangles < 900, `${name}: ${triangles}`);
        }
    });
});

describe("the atlas (engine/atlas.js)", () => {
    it("has a layer for every material built with (none for the ground's own), and one for plain colours", () => {
        for (const [name, spec] of Object.entries(MATERIALS)) {
            assert.equal(LAYERS.includes(name), !spec.ground, name);
        }

        assert.equal(LAYERS.at(-1), "plain");
        assert.equal(layerOf(material("brick")), LAYERS.indexOf("brick"));
        assert.equal(layerOf(material("iron")), LAYERS.indexOf("plain"));
        assert.equal(layerOf(material("embers")), -1);
    });

    it("paints each layer the same every time, with relief (mortar lower than brick)", () => {
        const [a, b] = [paintLayer("brick", 64), paintLayer("brick", 64)];

        assert.deepEqual(a, b);

        const heights = new Set();

        for (let i = 3; i < a.length; i += 4) {
            heights.add(a[i]);
        }

        assert.ok(heights.size > 10);
        assert.equal(paintLayers(16).length, 16 * 16 * 4 * LAYERS.length);
    });

    it("draws a house as one mesh of the atlas, texture coordinates scaled to each material's", () => {
        const plan = planHouse({ w: 2, h: 2.5, style: "timber", storeys: 2, x: 5, y: 5 });
        const group = new THREE.Group();

        group.add(buildHouse(plan).toObject());
        group.updateMatrixWorld(true);

        const merged = merge(group, { atlas: true });

        assert.equal(merged.children.length, 1);
        assert.equal(merged.children[0].material.name, "atlas");
        assert.ok(merged.children[0].geometry.attributes.layer);

        // A plain colour's texture is white, its colour in its vertices'
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 28, 0, 0, 14], 2));

        const plain = toAtlas(geometry, material("iron"));
        const textured = toAtlas(geometry, material("planks"));

        assert.ok(plain.attributes.color.array[0] < 0.1);
        assert.deepEqual([...textured.attributes.uv.array], [0, 0, 2, 0, 0, 1]);
        assert.equal(textured.attributes.layer.array[0], LAYERS.indexOf("planks"));
    });
});
