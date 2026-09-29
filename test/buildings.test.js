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
const { LAYERS, layerOf, paintLayers, toAtlas, toGlow } = await import("../client/js/world/art/engine/atlas.js");
const { material, MATERIALS } = await import("../client/js/world/art/engine/materials.js");
const { paintLayer } = await import("../client/js/world/art/engine/painters.js");
const { ARCHES, inset, openingOutline, Solid } = await import("../client/js/world/art/engine/solid.js");
const { buildHouse, house, planHouse, STYLES } = await import("../client/js/world/art/kits/house.js");
const { EMBLEM_NAMES, paintEmblem } = await import("../client/js/world/art/kits/emblems.js");
const { landmark, LANDMARK_BUILDERS } = await import("../client/js/world/art/kits/landmarks.js");
const { prop, PROP_NAMES } = await import("../client/js/world/art/kits/props.js");
const { merge } = await import("../client/js/world/town3d.js");

const M = 5;

// Every corner and normal of an object's meshes a number (no NaN from a side of no length)
function finite(object) {
    let whole = true;

    object.traverse((node) => {
        if (node.isMesh) {
            whole &&= ["position", "normal"].every((name) => node.geometry.attributes[name]?.array.every(Number.isFinite) ?? true);
        }
    });

    return whole;
}

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

    it("keeps a sign's picture while anything drawn shows it, and lets it go (to be painted again) once nothing does", async () => {
        const { holdSign, isSign, letGoSign, nameBoardTexture, releaseSign } = await import("../client/js/world/art/kits/signs.js");
        const board = nameBoardTexture({ name: "The Kept Sign" });
        let disposed = 0;

        board.addEventListener("dispose", () => disposed++);
        assert.ok(isSign(board));
        assert.equal(nameBoardTexture({ name: "The Kept Sign" }), board, "painted once for all that show it");

        // (Two chunks show it: let go only when both have gone)
        holdSign(board);
        holdSign(board);
        releaseSign(board);
        letGoSign(board);
        assert.equal(disposed, 0);
        assert.equal(nameBoardTexture({ name: "The Kept Sign" }), board);
        releaseSign(board);
        assert.equal(disposed, 1);
        assert.notEqual(nameBoardTexture({ name: "The Kept Sign" }), board, "painted again when wanted again");
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

    it("take every arch's shape, filling the wall round it (each outline seen whole from its middle)", () => {
        for (const arch of ARCHES) {
            for (const [width, height] of [[4, 10], [6, 6], [8, 3]]) {
                const solid = new Solid();
                const outline = openingOutline(arch, 5, 5 + width, 1, 1 + height);

                solid.wall({ origin: [0, 0, 10], across: [1, 0, 0], out: [0, 0, 1] }, 20, 15, [{ u0: 5, u1: 5 + width, v0: 1, v1: 1 + height, depth: 1, back: material("glass"), arch }], material("plaster"));

                // The wall's face, what fills round the arch and its back: the whole wall
                assert.ok(Math.abs(areaFacing(solid, [0, 0, 1]) - 20 * 15) < 1e-3, `${arch} ${width}x${height}`);

                // Within the opening, and anticlockwise all the way round its middle
                const [mu, mv] = [5 + width / 2, 1 + height / 2];

                for (const [i, [u, v]] of outline.entries()) {
                    const [nu, nv] = outline[(i + 1) % outline.length];

                    assert.ok(u >= 5 - 1e-9 && u <= 5 + width + 1e-9 && v >= 1 - 1e-9 && v <= 1 + height + 1e-9, `${arch}: inside`);
                    assert.ok((u - mu) * (nv - mv) - (v - mv) * (nu - mu) >= -1e-9, `${arch}: anticlockwise`);
                }
            }
        }
    });

    it("follow a gable's outline", () => {
        const solid = new Solid();

        solid.wall({ origin: [0, 0, 0], across: [1, 0, 0], out: [0, 0, 1] }, 20, 8, [], material("plaster"), { line: [[0, 0], [10, 8], [20, 0]] });
        assert.ok(Math.abs(areaFacing(solid, [0, 0, 1]) - 80) < 1e-6);
    });

    it("go round a plan of any shape, each side facing out, with its own openings (Solid.walls)", () => {
        const solid = new Solid();
        const octagon = Array.from({ length: 8 }, (_, k) => [30 + 20 * Math.cos((k * Math.PI) / 4), 30 + 20 * Math.sin((k * Math.PI) / 4)]);
        const side = Math.hypot(octagon[1][0] - octagon[0][0], octagon[1][1] - octagon[0][1]);
        const faces = solid.walls(octagon, 2, 15, { 1: [{ u0: side / 2 - 2, u1: side / 2 + 2, v0: 0, v1: 10, depth: 1, back: material("planks-dark") }] }, material("plaster"));

        assert.equal(faces.length, 8);

        for (const { origin, out, length } of faces) {
            // (Facing away from the middle)
            assert.ok((origin[0] - 30) * out[0] + (origin[2] - 30) * out[2] > 0);
            assert.ok(Math.abs(length - side) < 1e-6);
        }

        // Every side whole (the door's back fills its hole), and the door's reveal round it
        const door = faces[1].out;

        assert.ok(Math.abs(areaFacing(solid, door) - side * 15) < 1e-3);
    });
});

describe("shapes turned about an axis (Solid.lathe), lofted, swept and stood up", () => {
    const areaFacingUp = (solid) => {
        let area = 0;

        solid.toObject().traverse((node) => {
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

                area += normal.clone().normalize().y > 0.99 ? normal.length() / 2 : 0;
            }
        });

        return area;
    };

    // Each triangle's normal against the way out from the axis (and up) at its middle
    const facingOut = (solid, cx, cz) => {
        let outward = 0;
        let triangles = 0;

        solid.toObject().traverse((node) => {
            if (!node.isMesh) {
                return;
            }

            const { position } = node.geometry.attributes;
            const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

            for (let i = 0; i < position.count; i += 3) {
                a.fromBufferAttribute(position, i);
                b.fromBufferAttribute(position, i + 1);
                c.fromBufferAttribute(position, i + 2);

                const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
                const middle = a.clone().add(b).add(c).divideScalar(3);

                triangles++;
                outward += normal.dot(new THREE.Vector3(middle.x - cx, 0, middle.z - cz).normalize()) + Math.max(0, normal.y) > 0 ? 1 : 0;
            }
        });

        return { outward, triangles };
    };

    it("makes a dome over a round wall, every face turned out, closed to a point at the top", () => {
        const solid = new Solid();
        const profile = Array.from({ length: 7 }, (_, k) => [20 * Math.cos((k * Math.PI) / 12), 10 + 20 * Math.sin((k * Math.PI) / 12)]);

        solid.lathe(40, 40, [[20, 0], [20, 10], ...profile.slice(1)], material("plaster"), { segments: 12 });

        const { outward, triangles } = facingOut(solid, 40, 40);

        // (The wall's quads, the dome's rings of quads, and its top ring of triangles)
        assert.equal(triangles, 12 * 2 + 12 * 2 * 5 + 12);
        assert.equal(outward, triangles);
    });

    it("turns only part of the way round when asked (a half dome over an apse)", () => {
        const solid = new Solid();

        solid.lathe(0, 0, [[10, 0], [8, 5], [0, 8]], material("thatch"), { segments: 6, from: 0, to: Math.PI });

        const { outward, triangles } = facingOut(solid, 0, 0);

        assert.equal(triangles, 6 * 2 + 6);
        assert.equal(outward, triangles);
    });

    it("lofts a surface through cross-sections, a ring closed to a point capped by triangles (Solid.loft)", () => {
        const solid = new Solid();
        const ring = (r, y) => Array.from({ length: 8 }, (_, k) => [r * Math.cos((k * Math.PI) / 4), y, r * Math.sin((k * Math.PI) / 4)]);

        solid.loft([ring(10, 0), ring(10, 10), ring(0, 16)], material("plaster"));

        const { outward, triangles } = facingOut(solid, 0, 0);

        assert.equal(triangles, 8 * 2 + 8);
        assert.equal(outward, triangles);
    });

    it("runs a rod along a bending path, its faces turned out from the path (Solid.tube)", () => {
        const solid = new Solid();
        const path = Array.from({ length: 6 }, (_, k) => [30 * Math.cos((k * Math.PI) / 5), 30 * Math.sin((k * Math.PI) / 5), 0]);
        let outward = 0;
        let triangles = 0;

        solid.tube(path, [3, 3, 3, 3, 2, 0], material("timber"), { sides: 5 });
        solid.toObject().traverse((node) => {
            if (!node.isMesh) {
                return;
            }

            const { position } = node.geometry.attributes;
            const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

            for (let i = 0; i < position.count; i += 3) {
                a.fromBufferAttribute(position, i);
                b.fromBufferAttribute(position, i + 1);
                c.fromBufferAttribute(position, i + 2);

                const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
                const middle = a.clone().add(b).add(c).divideScalar(3);

                // (Out is away from the nearest point of the path)
                const nearest = path.slice(1).map((p, k) => new THREE.Line3(new THREE.Vector3(...path[k]), new THREE.Vector3(...p)).closestPointToPoint(middle, true, new THREE.Vector3())).reduce((best, point) => (point.distanceTo(middle) < best.distanceTo(middle) ? point : best));

                triangles++;
                outward += normal.dot(middle.clone().sub(nearest)) > 0 ? 1 : 0;
            }
        });

        // (Four lengths of five quads, and the last closing to its tip in triangles)
        assert.equal(triangles, 4 * 5 * 2 + 5);
        assert.equal(outward, triangles);
    });

    it("stands a plan up, its sides leaning in as far as asked and its top the plan moved in (Solid.extrude)", () => {
        const solid = new Solid();
        const square = [[0, 0], [20, 0], [20, 20], [0, 20]];
        const top = solid.extrude(square, 0, 10, material("stone"), { batter: 2 });

        assert.deepEqual(top.map(([x, z]) => [Math.round(x * 1e6) / 1e6, Math.round(z * 1e6) / 1e6]), [[2, 2], [18, 2], [18, 18], [2, 18]]);
        assert.ok(Math.abs(areaFacingUp(solid) - 16 * 16) < 1e-3);
        assert.deepEqual(inset(square, -1).map(([x, z]) => [Math.round(x), Math.round(z)]), [[-1, -1], [21, -1], [21, 21], [-1, 21]]);
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

    it("draws a tinted material from the layer it's tinted from, in its tint, and every light with the one glowing material", () => {
        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 40, 0, 0, 20], 2));

        const red = toAtlas(geometry, material("mud-red"));

        assert.equal(layerOf(material("mud-red")), LAYERS.indexOf("mud"));
        assert.deepEqual([...red.attributes.uv.array], [0, 0, 1, 0, 0, 0.5]);
        assert.ok(Math.abs(red.attributes.color.array[1] - 0.56) < 1e-6);

        // (A light isn't drawn with the atlas, but merged with the others into one mesh)
        assert.equal(layerOf(material("glow-violet")), -1);

        const solid = new Solid();

        solid.box(0, 0, 0, 10, 10, 10, material("glow-violet"));
        solid.box(20, 0, 0, 30, 10, 10, material("glow-lamp"));
        solid.box(40, 0, 0, 50, 10, 10, material("mud"));

        const group = new THREE.Group();

        group.add(solid.toObject());
        group.updateMatrixWorld(true);

        const merged = merge(group, { atlas: true });

        assert.deepEqual(merged.children.map(({ material: { name } }) => name).sort(), ["atlas", "glow"]);
        assert.ok(toGlow(geometry, material("glow-violet")).attributes.color.array[2] > 0.9);
    });
});

describe("each people's buildings (peoples/)", () => {
    it("builds every piece of each people's, within a budget of triangles: houses, landmarks, their own places, walls, gates, towers, and their well and stalls", async () => {
        const { PEOPLE_KITS } = await import("../client/js/world/art/peoples/index.js");
        const { PEOPLE_PLACES } = await import("../client/js/core/setpieces/pieces.js");
        const budget = { house: 6000, landmark: 9000, structure: 14000, wall: 4000, gatehouse: 5000, tower: 4000, prop: 1200 };

        for (const [people, kit] of Object.entries(PEOPLE_KITS)) {
            const pieces = [
                ...kit.GALLERY.houses.map(([type, w, h]) => ({ kind: "house", type, w, h, wealth: 0.7 })),
                ...["tavern", "church", "blacksmith", "guild", "hall", "keep", "market"].map((name) => ({ kind: "landmark", name, w: name === "guild" || name === "market" ? 4 : 3, h: name === "church" ? 4 : 3 })),
                ...Object.entries(PEOPLE_PLACES[people]).map(([name, [w, h]]) => ({ kind: "structure", name, w, h })),
                { kind: "wall", w: 4, h: 1 },
                { kind: "gatehouse", w: 3, h: 2 },
                { kind: "tower", w: 2, h: 2 },
                ...["well", "tent", "barrels"].map((name) => ({ kind: "prop", name, w: name === "barrels" ? 1 : 2, h: name === "barrels" ? 1 : 2 })),
            ];

            assert.deepEqual(kit.GALLERY.structures, PEOPLE_PLACES[people]);

            for (const piece of pieces) {
                const object = await kit[piece.kind]({ ...piece, people, x: 5, y: 7, seed: 3 });
                const triangles = trianglesOf(object);

                assert.ok(triangles > 20 && triangles < budget[piece.kind], `${people} ${piece.kind} ${piece.type ?? piece.name ?? ""}: ${triangles}`);
                assert.ok(finite(object), `${people} ${piece.kind} ${piece.type ?? piece.name ?? ""}: every corner and normal a number`);
            }
        }
    });

    it("builds each people's landmarks whole on a lot of any size a town gives them, small keeps stepping up fewer times", async () => {
        const { PEOPLE_KITS } = await import("../client/js/world/art/peoples/index.js");

        for (const [people, kit] of Object.entries(PEOPLE_KITS)) {
            for (const [w, h] of [[2, 2], [2.5, 2.5], [2.6, 2.5], [3, 3], [4.5, 4]]) {
                for (const name of ["keep", "hall", "tavern", "church", "guild", "market", "blacksmith"]) {
                    const object = await kit.landmark({ kind: "landmark", name, w, h, people, x: 5, y: 7, seed: 3 });

                    assert.ok(finite(object), `${people} ${name} on ${w} by ${h} plots: every corner and normal a number`);
                }
            }
        }
    });

    it("pitches each people's own tents in its war camps: on the ground, a few metres round, the way in towards the fire", async () => {
        const { CAMP_PEOPLES, campTent } = await import("../client/js/world/art/peoples/camp.js");
        const { M } = await import("../client/js/world/art/peoples/kit.js");

        assert.deepEqual([...CAMP_PEOPLES].sort(), ["cat", "darkElf", "elf", "lizard", "orc"]);
        assert.equal(campTent("human"), null);

        for (const people of CAMP_PEOPLES) {
            const tent = campTent(people);
            const box = new THREE.Box3().setFromObject(tent);
            const doors = [];

            tent.traverse((node) => node.isMesh && node.material.name === "shadow" && doors.push(new THREE.Box3().setFromObject(node)));

            assert.ok(trianglesOf(tent) > 60 && trianglesOf(tent) < 600, `${people}: ${trianglesOf(tent)} triangles`);
            assert.ok(box.min.y > -0.1 * M && box.max.y > 1.6 * M && box.max.y < 4.2 * M, `${people}: ${box.min.y / M} to ${box.max.y / M} m high`);
            assert.ok(Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) < 2.1 * M, `${people}: ${box.min.toArray()} to ${box.max.toArray()}`);
            // (The lizard folk's open at the front, under their thatch)
            assert.equal(doors.length, people === "lizard" ? 0 : 1, people);
            assert.ok(doors.every((door) => door.min.z > 0.3 * M), `${people}: its doorway at the front`);
        }
    });

    it("builds each people's insides of its own stuff, its lamps lit its own way", async () => {
        const { readPlan } = await import("../client/js/core/interiors.js");
        const { tavernRooms } = await import("../client/js/core/insides.js");
        const { buildInterior } = await import("../client/js/world/interiors3d.js");
        const taproom = (people) => {
            const [floor] = tavernRooms({ seed: 5, name: "Inside", people, tavern: { storeys: 1 } });
            const map = readPlan(`taproom-${people}`, floor.name, floor.rows, { ground: floor.ground });

            Object.assign(map, { origin: [0, 0], style: floor.style, finish: floor.finish, layout: floor.layout, people });

            return buildInterior(map);
        };
        const namesOf = (inside) => {
            const names = new Set();

            inside.object.traverse((node) => node.isMesh && names.add(node.material.name));

            return names;
        };
        const human = taproom("human");
        const lampOf = (inside) => inside.lights.find(({ kind }) => kind === "lamp").colour;

        assert.ok(namesOf(human).has("stone-inside") && namesOf(human).has("timber-inside-wall"));

        for (const [people, own] of [["cat", "mud-pale-inside"], ["orc", "basalt-inside"], ["lizard", "stone-lime-inside"], ["elf", "marble-inside"], ["darkElf", "stone-black-inside"]]) {
            const inside = taproom(people);
            const names = namesOf(inside);

            assert.ok(names.has(own), `${people}: ${[...names].join(", ")}`);
            assert.ok(!names.has("stone-inside") && !names.has("timber-inside"), `${people}: no flagstones nor oak`);

            inside.dispose();
        }

        assert.notEqual(lampOf(taproom("darkElf")), lampOf(human));
        assert.notEqual(lampOf(taproom("elf")), lampOf(human));
        // (A human's inside afterwards is the humans' again)
        assert.ok(namesOf(taproom("human")).has("stone-inside"));
    });
});
