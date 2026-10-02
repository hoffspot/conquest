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
const { atlasMaterial, LAYERS, layerOf, paintLayers, SHINE_STEP, SHINES, shineOf, toAtlas, toGlow, wildsMaterial } = await import("../client/js/world/art/engine/atlas.js");
const { COLOURS, material, MATERIALS, paintPicture, TINTS } = await import("../client/js/world/art/engine/materials.js");
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

describe("faces (Solid.face)", () => {
    it("keep every corner of every triangle as the 32-bit floats it's drawn with, however many there are", () => {
        const solid = new Solid();
        const [positions, uvs, colours] = [[], [], []];

        // (Level quads, each two triangles, their texture across x and z; enough that the room
        // they're kept in grows several times)
        for (let k = 0; k < 120; k++) {
            const [x, z, size] = [k * 1.1 + 0.123456789, -k * 0.7 - 0.987654321, 1 + k / 7];
            const quad = [[x, 2.5, z], [x, 2.5, z + size], [x + size, 2.5, z + size], [x + size, 2.5, z]];
            const tone = [0.9 + k / 1000, 0.8, 0.7 - k / 1000];

            solid.face(quad, material("plaster"), undefined, tone);

            for (const i of [0, 1, 2, 0, 2, 3]) {
                positions.push(...quad[i]);
                uvs.push(quad[i][0], -quad[i][2]);
                colours.push(...tone);
            }
        }

        assert.equal(solid.triangles, 240);

        const [mesh] = solid.toObject().children;

        assert.deepEqual(mesh.geometry.attributes.position.array, Float32Array.from(positions));
        assert.deepEqual(mesh.geometry.attributes.uv.array, Float32Array.from(uvs));
        assert.deepEqual(mesh.geometry.attributes.color.array, Float32Array.from(colours));
        assert.ok(mesh.geometry.attributes.normal.array.every((value, i) => value === (i % 3 === 1 ? 1 : 0)));
    });
});

describe("faces a tone's colour turns across (Solid.face, the tone's bands)", () => {
    // (Darker below 10 world pixels up, turning there)
    const banded = Object.assign((point) => (point[1] < 10 ? [0.5, 0.5, 0.5] : [1, 1, 1]), { bands: [10] });
    const heightsOf = (solid) => new Set([...solid.toObject().children[0].geometry.attributes.position.array].filter((_, i) => i % 3 === 1));

    it("are cut level where it turns, each piece coloured at its own corners", () => {
        const solid = new Solid();

        solid.face([[0, 0, 0], [20, 0, 0], [20, 30, 0], [0, 30, 0]], material("plaster"), undefined, banded);

        assert.equal(solid.triangles, 4);
        assert.deepEqual([...heightsOf(solid)].sort((a, b) => a - b), [0, 10, 30]);
    });

    it("are left whole where they're narrow (a timber), level, or nothing turns across them", () => {
        for (const [points, tone] of [
            [[[0, 0, 0], [2, 0, 0], [2, 30, 0], [0, 30, 0]], banded],
            [[[0, 5, 0], [0, 5, -20], [20, 15, -20], [20, 15, 0]], banded],
            [[[0, 0, 0], [20, 0, 0], [20, 30, 0], [0, 30, 0]], (point) => banded(point)],
        ]) {
            const solid = new Solid();

            solid.face(points, material("plaster"), undefined, tone);
            assert.equal(solid.triangles, 2);
        }
    });

    it("draw houses' walls as they're weathered, not a tenth darker (the dirt at their foot blended up to the shade under the eaves)", () => {
        const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let [drawn, meant, area, off] = [0, 0, 0, 0];

        for (const piece of houses.filter((_, k) => k % 9 === 0)) {
            const solid = buildHouse(planHouse(piece));

            solid.toObject().traverse((node) => {
                if (!node.isMesh) {
                    return;
                }

                const { position, color, normal } = node.geometry.attributes;

                for (let t = 0; t < position.count; t += 3) {
                    const up = normal.getY(t);
                    const corners = [0, 1, 2].map((i) => new THREE.Vector3().fromBufferAttribute(position, t + i));
                    const size = corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0])).length() / 2;

                    if (Math.abs(up) >= 0.45 || size < 1e-6) {
                        continue;
                    }

                    // (Sampled across the triangle: its corners' colours blended, and the weathering there)
                    for (const [a, b] of [[1 / 6, 1 / 6], [2 / 3, 1 / 6], [1 / 6, 2 / 3], [1 / 3, 1 / 3]]) {
                        const weights = [1 - a - b, a, b];
                        const point = corners.reduce((sum, corner, i) => sum.addScaledVector(corner, weights[i]), new THREE.Vector3());
                        const blend = luminance([0, 1, 2].map((c) => weights.reduce((sum, w, i) => sum + w * color.array[(t + i) * 3 + c], 0)));
                        const weathered = luminance(solid.tone(point.toArray(), [normal.getX(t), up, normal.getZ(t)], node.material) ?? [1, 1, 1]);

                        drawn += blend * size;
                        meant += weathered * size;
                        area += size;
                        off += Math.abs(blend - weathered) > 0.08 ? size : 0;
                    }
                }
            });
        }

        assert.ok(Math.abs(drawn / meant - 1) < 0.025, `drawn ${(drawn / area).toFixed(3)} against ${(meant / area).toFixed(3)}`);
        assert.ok(off / area < 0.08, `${((off / area) * 100).toFixed(1)}% of the walls' area more than 0.08 out`);
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

    // Each corner's position and normal, of every triangle
    const cornersOf = (solid) => {
        const corners = [];

        solid.toObject().traverse((node) => {
            if (node.isMesh) {
                const { position, normal } = node.geometry.attributes;

                for (let i = 0; i < position.count; i++) {
                    corners.push({ at: new THREE.Vector3().fromBufferAttribute(position, i), normal: new THREE.Vector3().fromBufferAttribute(normal, i), triangle: Math.floor(i / 3) });
                }
            }
        });

        return corners;
    };

    it("shades round things round: a drum's every corner facing straight out from its axis, a four-sided pyramid (smooth: false) left in facets", () => {
        const drum = new Solid();

        drum.lathe(40, 40, [[20, 0], [20, 30]], material("plaster"), { segments: 8 });

        for (const { at, normal } of cornersOf(drum)) {
            assert.ok(normal.distanceTo(new THREE.Vector3(at.x - 40, 0, at.z - 40).normalize()) < 1e-5);
        }

        const pyramid = new Solid();

        pyramid.lathe(0, 0, [[20, 0], [0, 30]], material("plaster"), { segments: 4, smooth: false });

        const corners = cornersOf(pyramid);

        assert.ok(corners.every(({ normal, triangle }) => normal.distanceTo(corners[triangle * 3].normal) < 1e-6));
    });

    it("keeps an edge where the outline turns sharply (a hut's wall meeting its roof), and shades through where it turns gently (a dome)", () => {
        const hut = new Solid();

        hut.lathe(0, 0, [[20, 0], [20, 20], [0, 40]], material("plaster"), { segments: 12 });

        const eaves = cornersOf(hut).filter(({ at }) => Math.abs(at.y - 20) < 1e-6);

        assert.ok(eaves.some(({ normal }) => Math.abs(normal.y) < 1e-6) && eaves.some(({ normal }) => normal.y > 0.6));

        const dome = new Solid();

        dome.lathe(0, 0, Array.from({ length: 7 }, (_, k) => [20 * Math.cos((k * Math.PI) / 12), 20 * Math.sin((k * Math.PI) / 12)]), material("plaster"), { segments: 12 });

        // (Straight out from its middle, but at its foot and crown, where the outline ends, as
        // the line of it they end: half a step, 7.5°, off)
        for (const { at, normal } of cornersOf(dome)) {
            const within = at.y > 1e-6 && at.y < 20 - 1e-6 ? 0.02 : 0.14;

            assert.ok(normal.distanceTo(at.clone().normalize()) < within, `${at.toArray()}: ${normal.toArray()}`);
        }
    });

    it("shades a rod round from its path, tipped towards its point as it narrows (Solid.tube)", () => {
        const rod = new Solid();

        rod.tube([[0, 0, 0], [30, 0, 0]], 5, material("timber"), { sides: 4 });

        for (const { at, normal } of cornersOf(rod)) {
            assert.ok(normal.distanceTo(new THREE.Vector3(0, at.y, at.z).normalize()) < 1e-5);
        }

        const spike = new Solid();

        spike.tube([[0, 0, 0], [30, 0, 0]], [5, 0], material("iron"), { sides: 4 });
        assert.ok(cornersOf(spike).every(({ normal }) => normal.x > 0.1 && normal.x < 0.3));
    });

    it("shades a lofted surface through where it bends gently (Solid.loft)", () => {
        const vault = new Solid();
        const ring = (x) => Array.from({ length: 9 }, (_, k) => [x, 20 * Math.sin((k * Math.PI) / 8), 20 * Math.cos((k * Math.PI) / 8)]);

        vault.loft([ring(0), ring(30)], material("plaster"), { closed: false, out: (middle) => [0, middle[1], middle[2]] });

        // (Straight out from its axis, but along its edges as the faces there: half a step off)
        for (const { at, normal } of cornersOf(vault)) {
            const within = Math.abs(at.y) > 1e-3 ? 0.03 : 0.2;

            assert.ok(normal.distanceTo(new THREE.Vector3(0, at.y, at.z).normalize()) < within, `${at.toArray()}: ${normal.toArray()}`);
        }
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

describe("materials (engine/materials.js)", () => {
    it("paint a textured one's picture only when it's wanted (drawn, or asked for), once for it and its copies", () => {
        // (A house asks for its materials: none of their pictures painted by it, merged into the
        // atlas as it is out in the world)
        const object = house(houses[1]);
        const textured = new Set();

        object.traverse((node) => {
            if (node.isMesh && node.material.map) {
                textured.add(node.material);
            }
        });

        merge(object, { atlas: true });
        assert.ok(textured.size >= 2, `${textured.size} textured materials`);
        assert.ok([...textured].every((each) => paintPicture(each)), "each painted only when asked");

        // (Painted once, whichever copy asks: a bridge's planks, an inside's walls)
        const plaster = material("plaster");
        const copy = plaster.clone();

        copy.map = plaster.map.clone();

        const picture = copy.map.image;

        assert.equal(picture.width, 128);
        assert.equal(plaster.map.image, picture);
        assert.equal(paintPicture(plaster), false);
        assert.equal(material("plaster"), plaster);
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

    it("draws with the layers prepareAtlas paints, asked for before they're done, rather than painting them again", async () => {
        // (A copy of the module of its own: nothing asked of it yet)
        const { atlasMaterial, prepareAtlas, wildsMaterial } = await import("../client/js/world/art/engine/atlas.js?preparing");
        const painting = prepareAtlas(16);
        const texture = atlasMaterial().userData.uniforms.atlasMap.value;

        assert.equal(texture.image.data, null);
        assert.equal(texture.version, 0, "not to be drawn yet");
        assert.equal(wildsMaterial({ value: 0 }).userData.uniforms.atlasMap.value, texture);

        const painted = await painting;

        assert.equal(texture.image.data, painted);
        assert.deepEqual([texture.image.width, texture.image.depth, painted.length], [16, LAYERS.length, 16 * 16 * 4 * LAYERS.length]);
        assert.equal(texture.version, 1);
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

    it("gives glass, metal and slate their shine with their layer, and a tinted material the shine of the one it's tinted from", () => {
        for (const name of Object.keys(SHINES)) {
            assert.ok(COLOURS[name] || MATERIALS[name], name);
        }

        assert.ok(SHINE_STEP > LAYERS.length, "a layer and its shine told apart");

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));

        const layer = (name) => toAtlas(geometry, material(name)).attributes.layer.array[0];

        assert.equal(TINTS["slate-violet"].from, "slate-grey");
        assert.deepEqual(
            ["glass", "leaded", "iron", "gold", "slate", "slate-violet", "brick", "cloth-gold"].map(layer),
            [
                LAYERS.indexOf("plain") + SHINE_STEP,
                LAYERS.indexOf("leaded") + SHINE_STEP,
                LAYERS.indexOf("plain") + 2 * SHINE_STEP,
                LAYERS.indexOf("plain") + 3 * SHINE_STEP,
                LAYERS.indexOf("slate") + 4 * SHINE_STEP,
                LAYERS.indexOf("slate-grey") + 4 * SHINE_STEP,
                LAYERS.indexOf("brick"),
                LAYERS.indexOf("plain"),
            ],
        );
        assert.equal(shineOf(material("plaster-red")), 0);
        assert.deepEqual(["paint-gold", "cloth-saffron", "cloth-silver"].map((name) => shineOf(material(name))), [0, 0, 0], "gold and silver painted, dyed or woven");
    });

    it("lights what shines with a highlight from each light and the sky reflected, in the buildings' shader (not the wilds')", () => {
        // (Each change made to three.js's own Lambert shader: one that no longer finds what it
        // replaces would leave everything dull, and say nothing)
        const compiled = (made) => {
            const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };

            made.onBeforeCompile(shader);

            return shader;
        };
        const atlas = compiled(atlasMaterial());
        const wilds = compiled(wildsMaterial({ value: 0 }));

        assert.match(atlas.vertexShader, /vShine = floor\(layer \/ 256\.0\)/);
        assert.match(atlas.fragmentShader, /#define RE_Direct RE_Direct_Atlas/);
        assert.match(atlas.fragmentShader, /atlasShine\(diffuseColor\);\n#include <lights_lambert_fragment>/);
        assert.match(atlas.fragmentShader, /#include <lights_fragment_end>\n[^]*getIBLRadiance\(geometryViewDir, geometryNormal, atlasRoughness\)/);
        assert.match(atlas.fragmentShader, /outgoingLight = [^;]*reflectedLight\.directSpecular \+ reflectedLight\.indirectSpecular/);
        assert.doesNotMatch(wilds.fragmentShader, /atlasShine|RE_Direct_Atlas/);
        assert.match(wilds.vertexShader, /vLayer = mod\(layer/);
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
        // (What each is drawn from: the atlas's layers, "wall|stone", walls apart)
        const namesOf = (inside) => {
            const names = new Set();

            inside.object.traverse((node) => {
                for (const layer of (node.isMesh && node.geometry.attributes.layer?.array) || []) {
                    names.add(`${node.material.name === "atlas-inside-wall" ? "wall|" : ""}${LAYERS[layer % SHINE_STEP]}`);
                }
            });

            return names;
        };
        const human = taproom("human");
        const lampOf = (inside) => inside.lights.find(({ kind }) => kind === "lamp").colour;

        assert.ok(namesOf(human).has("stone") && namesOf(human).has("wall|timber"));

        for (const [people, own] of [["cat", "mud"], ["orc", "basalt"], ["lizard", "stone-lime"], ["elf", "marble"], ["darkElf", "stone-black"]]) {
            const inside = taproom(people);
            const names = namesOf(inside);

            assert.ok(names.has(own), `${people}: ${[...names].join(", ")}`);
            assert.ok(!names.has("stone") && !names.has("timber"), `${people}: no flagstones nor oak`);

            inside.dispose();
        }

        assert.notEqual(lampOf(taproom("darkElf")), lampOf(human));
        assert.notEqual(lampOf(taproom("elf")), lampOf(human));
        // (A human's inside afterwards is the humans' again)
        assert.ok(namesOf(taproom("human")).has("stone"));
    });

    it("draws each inside from the atlas, a mesh for its walls and one for the rest, only its daylight, flames, roast and lights apart", async () => {
        const { readPlan } = await import("../client/js/core/interiors.js");
        const { tavernRooms, templeRooms } = await import("../client/js/core/insides.js");
        const { buildInterior } = await import("../client/js/world/interiors3d.js");
        const inside = (rooms, name, extra = {}) => {
            const [floor] = rooms({ seed: 5, name: "Inside", people: "human", tavern: { storeys: 1 }, ...extra });
            const map = readPlan(name, floor.name, floor.rows, { ground: floor.ground });

            Object.assign(map, { origin: [0, 0], style: floor.style, finish: floor.finish, layout: floor.layout, people: "human", ...floor, ...extra });

            return buildInterior(map);
        };
        const apart = /^(window|candle-flame|sconce|sconce-warm|roast|embers|glow-[a-z]+)-inside(-wall)?$/;

        for (const built of [inside(tavernRooms, "taproom-inside"), inside(templeRooms, "temple-inside", { patron: "aurelia" })]) {
            const meshes = [];

            built.object.traverse((node) => node.isMesh && meshes.push(node));

            const atlas = meshes.filter(({ material }) => material.name.startsWith("atlas-inside"));

            assert.ok(meshes.length <= 12, `${meshes.length} meshes`);
            assert.ok(atlas.length >= 2 && atlas.every(({ geometry }) => geometry.attributes.layer));
            assert.ok(meshes.every(({ material }) => !material.map), "nothing painted of its own");
            assert.ok(meshes.every(({ material }) => material.name.startsWith("atlas-inside") || apart.test(material.name) || material.type === "ShaderMaterial"), meshes.map(({ material }) => material.name).join());
            built.dispose();
        }

        // (A god's colour, worked out as it's built, drawn from the plain layer in that colour)
        const god = new THREE.MeshLambertMaterial({ color: 0x5c2e91 });
        const geometry = new THREE.BufferGeometry();

        god.userData.plain = true;
        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));

        const drawn = toAtlas(geometry, god);

        assert.equal(drawn.attributes.layer.array[0], LAYERS.indexOf("plain"));
        assert.deepEqual([...drawn.attributes.color.array.slice(0, 3)].map((c) => c.toFixed(5)), god.color.toArray().map((c) => c.toFixed(5)));
        assert.equal(layerOf(new THREE.MeshLambertMaterial({ color: 0x5c2e91 })), -1, "not unless it says it's plain");
    });

    it("cuts the insides away in front of the player as it draws them from the atlas: textures, relief and shine", async () => {
        const { atlasVariant } = await import("../client/js/world/art/engine/atlas.js");
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
        const extended = [];
        const variant = atlasVariant("atlas-test", (given) => extended.push(given));

        variant.onBeforeCompile(shader);

        assert.deepEqual(extended, [shader], "changed after the atlas's own");
        assert.match(shader.fragmentShader, /atlasShine\(diffuseColor\)/);
        assert.match(shader.fragmentShader, /reliefNormal/);
        assert.equal(variant.userData.uniforms, atlasMaterial().userData.uniforms, "the one atlas");
        assert.notEqual(variant, atlasMaterial());
    });
});

describe("chimney smoke (world/smoke.js)", () => {
    it("rises from the top of every house's chimney, where its stack stands over everything else", async () => {
        const { chimneysOf } = await import("../client/js/world/smoke.js");
        let chimneys = 0;

        for (const piece of houses.slice(0, 80)) {
            const object = house(piece);

            object.updateMatrixWorld(true);

            const tops = chimneysOf(object);

            if (!planHouse(piece).chimney) {
                assert.equal(tops.length, 0, piece.key);
                continue;
            }

            chimneys++;

            const box = new THREE.Box3().setFromObject(object);
            const [[x, y, z, strength]] = tops;

            assert.equal(tops.length, 1, piece.key);
            assert.equal(strength, 1);
            assert.ok(Math.abs(y - box.max.y) < M * 0.1, `${piece.key}: its top at ${y}, the house's ${box.max.y}`);
            assert.ok(x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z, piece.key);
        }

        assert.ok(chimneys > 30, `${chimneys} chimneys`);

        // (Turned and moved as what it's part of is)
        const object = house(houses.find((piece) => planHouse(piece).chimney));
        const group = new THREE.Group();

        object.updateMatrixWorld(true);

        const [[x, y, z]] = chimneysOf(object);

        group.add(object);
        group.scale.setScalar(0.2);
        group.rotation.y = Math.PI / 2;
        group.position.set(100, 10, 200);
        group.updateMatrixWorld(true);

        const [[gx, gy, gz]] = chimneysOf(group);

        assert.ok(Math.abs(gx - (100 + z * 0.2)) < 1e-6 && Math.abs(gy - (10 + y * 0.2)) < 1e-6 && Math.abs(gz - (200 - x * 0.2)) < 1e-6, `${[gx, gy, gz]}`);

        // (The smithy's forge has a thicker column)
        const smithy = await landmark(["town", "city"].flatMap((kind) => [1, 2, 3].flatMap((seed) => layoutTown({ seed, kind }).pieces)).find(({ name }) => name === "blacksmith"));

        smithy.updateMatrixWorld(true);
        assert.ok(chimneysOf(smithy).some(([, , , strength]) => strength > 1), "the forge's");
    });

    it("draws the lit hearths' smoke (most of them; a forge's always) in one mesh of one material, as much as the quality asks", async () => {
        const { SMOKE, SMOKE_SHARE, smokeMaterial, smokeMesh } = await import("../client/js/world/smoke.js");
        const { TREE_WIND } = await import("../client/js/world/art/kits/trees.js");
        const { QUALITY } = await import("../client/js/world/view.js");
        const tops = Array.from({ length: 200 }, (_, k) => [k * 7.3, 12, k * 3.1, 1]);
        const mesh = smokeMesh([...tops, [5, 30, 5, 1.4]]);
        const puffs = mesh.geometry.attributes.position.count / 4;
        const lit = puffs / SMOKE.puffs;

        assert.equal(lit % 1, 0);
        assert.ok(lit > 200 * (SMOKE.lit - 0.12) && lit < 200 * (SMOKE.lit + 0.12) + 1, `${lit} of 201 lit`);
        assert.equal(mesh.geometry.index.count / 3, puffs * 2, "a square a puff");
        assert.ok([...mesh.geometry.attributes.position.array].some((value, k) => k % 3 === 1 && value === 30), "the forge's lit");
        assert.equal(smokeMesh([[5, 30, 5, 1.4]]).geometry.attributes.position.count / 4, SMOKE.puffs);
        assert.equal(smokeMesh([]), null);
        assert.deepEqual([...smokeMesh(tops).geometry.attributes.puff.array], [...smokeMesh(tops).geometry.attributes.puff.array], "the same every time");

        // (One material for all of it, rising in time with the trees' breeze, its share the quality's;
        // reaching as high as it rises)
        assert.equal(mesh.material, smokeMaterial());
        assert.ok(mesh.material.transparent && !mesh.material.depthWrite);
        assert.equal(mesh.material.uniforms.time, TREE_WIND.time);
        assert.equal(mesh.material.uniforms.share, SMOKE_SHARE);
        assert.ok(mesh.geometry.boundingSphere.radius > SMOKE.rise);
        assert.ok(QUALITY.low.smoke > 0 && QUALITY.low.smoke < QUALITY.medium.smoke && QUALITY.medium.smoke < QUALITY.high.smoke && QUALITY.high.smoke === 1);

        // (Each puff's share of a column: dropped evenly, so a column thins rather than breaking up)
        const shares = [...mesh.geometry.attributes.puff.array].filter((_, k) => k % 16 === 3).slice(0, SMOKE.puffs);

        assert.ok(shares.every((share) => share > 0 && share < 1));
        assert.equal(shares.filter((share) => share <= 0.5).length, Math.round(SMOKE.puffs / 2), `${shares}`);
    });
});

describe("banners and flags in the wind (world/cloth.js)", () => {
    it("records the banners and flags the kits hang, turned and moved with what they're on", async () => {
        const { clothOf } = await import("../client/js/world/cloth.js");
        const castle = await import("../client/js/world/art/kits/castle.js");
        const { warBanner } = await import("../client/js/world/art/peoples/orc.js");
        const { COLOURS: PAINTS } = await import("../client/js/world/art/engine/painters.js");
        const { COLOURS: PEOPLES } = await import("../client/js/core/war/peoples.js");
        const big = [...houses].sort((a, b) => b.w * b.h - a.w * a.h)[0];
        const { keep } = await import("../client/js/world/art/kits/landmarks.js");

        // (A capital's keep: the crown's long banners hung on its front, its flags on its front
        // turrets, flying out on the breeze)
        const built = await keep(big);

        built.updateMatrixWorld(true);

        const cloth = clothOf(built);
        const box = new THREE.Box3().setFromObject(built);

        assert.deepEqual(cloth.map(({ kind }) => kind).sort(), ["fly", "fly", "wall", "wall"]);
        assert.ok(cloth.filter(({ kind }) => kind === "wall").every(({ look, out, at }) => look === "human" && out[2] === 1 && Math.abs(at[2] - box.max.z) < M * 2));
        assert.ok(cloth.filter(({ kind }) => kind === "fly").every(({ look, colour, at }) => look === "pennant" && colour === PEOPLES.human && at[1] > box.max.y - M * 3));

        // (Turned and moved as what it's part of is)
        const group = new THREE.Group();

        group.add(built);
        group.scale.setScalar(0.2);
        group.rotation.y = Math.PI / 2;
        group.position.set(100, 10, 200);
        group.updateMatrixWorld(true);

        const [moved] = clothOf(group);
        const [first] = cloth;

        assert.ok(Math.abs(moved.at[0] - (100 + first.at[2] * 0.2)) < 1e-6 && Math.abs(moved.at[1] - (10 + first.at[1] * 0.2)) < 1e-6 && Math.abs(moved.at[2] - (200 - first.at[0] * 0.2)) < 1e-6);
        assert.ok(Math.abs(moved.width - first.width * 0.2) < 1e-9 && Math.abs(moved.drop - first.drop * 0.2) < 1e-9);
        assert.ok(Math.abs(moved.out[0] - first.out[2]) < 1e-9 && Math.abs(moved.out[2] + first.out[0]) < 1e-9);

        // (The castle's: its round and square towers' flags, its keep's, the gatehouse's banner)
        const tops = [castle.tower({ shape: "round", top: "roof" }), castle.tower({ shape: "square", top: "roof" }), castle.keep({ w: 6, h: 5, door: true }), castle.gatehouse({ facing: "s" })];

        assert.deepEqual(tops.map((object) => clothOf(object).map(({ kind }) => kind).sort().join(" ")), ["fly", "fly", "fly fly wall wall", "wall"]);
        assert.deepEqual(clothOf(castle.tower({ shape: "round", top: "battlements" })), []);

        // (An orcs' war banner, ragged and red, hanging from its crossbar, facing the way it's set)
        const solid = new Solid();

        warBanner(solid, 0, 0, 0, M * 4, { facing: Math.PI / 2 });

        const [war] = clothOf(solid.toObject());

        assert.equal(war.kind, "hang");
        assert.equal(war.look, "ragged");
        assert.equal(war.colour, PAINTS["war-red"]);
        assert.ok(Math.abs(war.out[0] - 1) < 1e-9 && Math.abs(war.out[2]) < 1e-9);
    });

    it("draws them in one mesh of one material, each cloth a grid of corners from its own picture, moved by the trees' breeze", async () => {
        const { BREEZE, CLOTH, clothMaterial, clothMesh, clothPicture, LOOKS } = await import("../client/js/world/cloth.js");
        const { TREE_WIND } = await import("../client/js/world/art/kits/trees.js");
        const { SMOKE } = await import("../client/js/world/smoke.js");
        const pieces = [
            { at: [1, 10, 2], out: [0, 0, 1], width: 1, drop: 3, kind: "wall", look: "human" },
            { at: [5, 12, 2], out: [1, 0, 0], width: 1.2, drop: 2, kind: "hang", look: "ragged", colour: 0x8e1b1b },
            { at: [9, 20, 2], width: 2, drop: 0.7, kind: "fly", look: "pennant", colour: "#f0c96a" },
        ];
        const mesh = clothMesh(pieces);
        const { position, sheet, hang, uv, color } = mesh.geometry.attributes;
        const [[ha, hd], [fa, fd]] = [CLOTH.grid.hang, CLOTH.grid.fly];

        assert.equal(position.count, 2 * (ha + 1) * (hd + 1) + (fa + 1) * (fd + 1));
        assert.equal(mesh.geometry.index.count / 3, 2 * (2 * ha * hd + fa * fd));
        assert.equal(mesh.material, clothMaterial());
        assert.equal(mesh.material.map, clothPicture());
        assert.ok(mesh.material.side === THREE.DoubleSide && mesh.material.alphaTest > 0 && !mesh.castShadow);

        // (Every corner of a cloth where its top is, how far across and down it it is, its kind,
        // and its own cell of the picture)
        for (let k = 0; k < position.count; k++) {
            const piece = pieces[k < (ha + 1) * (hd + 1) ? 0 : k < 2 * (ha + 1) * (hd + 1) ? 1 : 2];
            const column = LOOKS.indexOf(piece.look);

            assert.deepEqual([position.getX(k), position.getY(k), position.getZ(k)], piece.at);
            assert.deepEqual([sheet.getZ(k), sheet.getW(k)].map((v) => +v.toFixed(5)), [piece.width, piece.drop]);
            assert.equal(hang.getZ(k), { hang: 0, wall: 1, fly: 2 }[piece.kind]);
            assert.ok(Math.abs(uv.getX(k) - (column + sheet.getX(k)) / LOOKS.length) < 1e-6 && Math.abs(uv.getY(k) - (1 - sheet.getY(k))) < 1e-6);
        }

        // (Across a cloth, left to right as its front's seen; a plain one tinted its colour)
        assert.deepEqual([hang.getX(0), hang.getY(0)], [1, -0]);
        assert.ok(Math.abs(hang.getX((ha + 1) * (hd + 1)) - 0) < 1e-9 && Math.abs(hang.getY((ha + 1) * (hd + 1)) + 1) < 1e-9);
        assert.ok(color.getX((ha + 1) * (hd + 1)) > color.getY((ha + 1) * (hd + 1)) * 3, "red");
        assert.ok(mesh.geometry.boundingSphere.radius > 5);
        assert.equal(clothMesh([]), null);

        // (The breeze blowing the way the chimneys' smoke leans)
        assert.ok(Math.abs(BREEZE[0] * SMOKE.wind[1] - BREEZE[1] * SMOKE.wind[0]) < 1e-9 && Math.abs(Math.hypot(...BREEZE) - 1) < 1e-9);

        // (Its shader: Lambert's, where each corner is and which way it faces worked out from the
        // trees' breeze's time)
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };

        for (const include of ["#include <common>", "#include <beginnormal_vertex>", "#include <begin_vertex>"]) {
            assert.ok(shader.vertexShader.includes(include), include);
        }

        mesh.material.onBeforeCompile(shader);
        assert.equal(shader.uniforms.clothTime, TREE_WIND.time);
        assert.ok(shader.vertexShader.includes("vec3 transformed = clothAt;") && shader.vertexShader.includes("vec3 objectNormal = normalize("));
        assert.ok(!shader.vertexShader.includes("#include <beginnormal_vertex>"));
    });

    it("hangs each town's war banners in its holders' cloth, in one mesh, and takes them down", async () => {
        const { Banners } = await import("../client/js/world/banners3d.js");
        const { LOOKS } = await import("../client/js/world/cloth.js");
        const scene = new THREE.Group();
        const banners = new Banners(scene);

        banners.raise("town-1", "elf", [{ x: 10, z: 20, y: 0, facing: 0 }, { x: 30, z: 20, y: 0, facing: Math.PI }]);

        const cloth = banners.group.getObjectByName("cloth:town-1");
        const { uv, hang } = cloth.geometry.attributes;
        const column = LOOKS.indexOf("elf");

        assert.ok([...Array(uv.count).keys()].every((k) => uv.getX(k) >= column / LOOKS.length - 1e-6 && uv.getX(k) <= (column + 1) / LOOKS.length + 1e-6));
        assert.equal(hang.getZ(0), 0);
        assert.equal(banners.group.children.filter(({ name }) => name === "banner:town-1").length, 2);
        banners.lower("town-1");
        assert.equal(banners.group.children.length, 0);
        banners.dispose();
    });
});

describe("the yards behind the houses (kits/yards.js)", () => {
    const PEOPLES = ["human", "elf", "darkElf", "cat", "lizard", "orc"];
    const yardsOf = (people) => ["village", "town", "city"].flatMap((kind) => layoutTown({ kind, seed: 3, people }).yards);
    // (The materials of what's built, by name)
    const namesOf = (object) => {
        const names = new Set();

        object.traverse((node) => node.isMesh && names.add(node.material.name));

        return names;
    };

    it("fences each people's yards their own way, standing on the ground as it lies", async () => {
        const { FENCES, yard, YARD_LOOKS } = await import("../client/js/world/art/kits/yards.js");
        const STUFF = { wattle: ["wattle"], rails: ["timber-grey"], hedge: ["leafscale-sage"], railing: ["stone-black", "iron-black"], mud: ["mud"], reeds: ["reeds", "bamboo"], stakes: ["bark"] };

        for (const people of PEOPLES) {
            const yards = yardsOf(people);
            const seen = new Set();

            assert.ok(yards.length > 3, `${people}: ${yards.length} yards`);

            for (const one of yards) {
                assert.ok(finite(yard(one)), `${people}: a yard all numbers`);
                namesOf(yard({ ...one, bed: null, line: false })).forEach((name) => seen.add(name));
            }

            // (Its fences of what its people make them of, and nothing of another people's)
            for (const kind of Object.keys(FENCES)) {
                assert.equal(STUFF[kind].every((name) => seen.has(name)), YARD_LOOKS[people].fences.includes(kind), `${people}: ${kind}`);
            }
        }

        // (On ground rising a metre across it, the posts along its right side stand a metre higher
        // than those along its left, and go into the ground there)
        const one = yardsOf("human").find(({ fence }) => fence[0].length && fence[2].length);
        const lowest = (object, side) => {
            const box = new THREE.Box3().setFromObject(object);
            let low = Infinity;

            object.traverse((node) => {
                const position = node.geometry?.attributes.position;

                for (let i = 0; i < (position?.count ?? 0); i++) {
                    const x = position.getX(i);

                    if ((side < 0 && x < box.min.x + M * 0.3) || (side > 0 && x > box.max.x - M * 0.3)) {
                        low = Math.min(low, position.getY(i));
                    }
                }
            });

            return low;
        };
        const level = yard({ ...one, fence: [one.fence[0], [], one.fence[2]], gate: null, bed: null, line: false, x: 0.4, y: 0.6 });
        const sloped = yard({ ...one, fence: [one.fence[0], [], one.fence[2]], gate: null, bed: null, line: false, x: 0.4, y: 0.6, lie: [0, 1, 0, 1] });

        assert.ok(lowest(level, -1) < -M * 0.2 && Math.abs(lowest(level, 1) - lowest(level, -1)) < M * 0.05, "level");
        assert.ok(Math.abs(lowest(sloped, 1) - lowest(sloped, -1) - M) < M * 0.1, "sloped");
    });

    it("hangs a gate open in a yard's gateway, between posts or piers (a hedge just parted), in its people's way", async () => {
        const { FENCES, yard, YARD_LOOKS } = await import("../client/js/world/art/kits/yards.js");
        const { YARD_FENCE } = await import("../client/js/core/setpieces/town.js");
        const count = (object) => {
            let n = 0;

            object.traverse((node) => (n += node.geometry?.attributes.position.count ?? 0));

            return n;
        };

        for (const people of PEOPLES) {
            const gated = yardsOf(people).filter(({ gate }) => gate);

            assert.ok(gated.length > 0, `${people}: gateways`);

            for (const one of gated) {
                const [shut, open] = [yard({ ...one, gate: null, bed: null, line: false }), yard({ ...one, bed: null, line: false })];
                const kind = YARD_LOOKS[people].fences.find((name) => FENCES[name]) ?? null;

                // (Its fence stops either side: the gateway as wide as laid out)
                const runs = one.fence[one.gate.side];

                assert.ok(runs.some(([, to]) => Math.abs(to - (one.gate.at - YARD_FENCE.gate / 2)) < 1e-9) || runs.some(([from]) => Math.abs(from - (one.gate.at + YARD_FENCE.gate / 2)) < 1e-9));

                // (Something drawn there but in a hedge, all numbers)
                assert.ok(finite(open));
                assert.equal(count(open) > count(shut), kind !== "hedge", `${people}: a gate drawn`);
            }
        }
    });

    it("digs a bed raised in its people's edging (or heaped), and grows their crops in it in rows, each standing on its soil", async () => {
        const { PLANTING, plantsOf, yard, YARDS, YARD_LOOKS } = await import("../client/js/world/art/kits/yards.js");
        const { GARDEN_KINDS } = await import("../client/js/world/art/kits/wilds.js");
        const grown = new Set();

        for (const people of PEOPLES) {
            const bedded = yardsOf(people).filter(({ bed }) => bed);
            let plants = 0;

            for (const one of bedded) {
                const names = namesOf(yard({ ...one, fence: [[], [], []], gate: null, line: false }));
                const [w, d] = [one.w * 4, one.h * 4];
                const [s, c] = [Math.sin(one.facing), Math.cos(one.facing)];
                const [u0, v0, u1, v1] = one.bed;

                assert.ok(names.has("soil"), `${people}: soil`);
                assert.equal(names.has(YARD_LOOKS[people].edging), YARD_LOOKS[people].edging !== null, `${people}: edged`);

                // (Each plant one of their crops, in the bed, on its soil over level ground; each row
                // one crop, its plants as far apart as that crop's planted)
                const rows = new Map();

                for (const { crop, x, y, height, seed } of plantsOf(one, () => 0)) {
                    const [u, v] = [(x - one.x) * c - (y - one.y) * s + w / 2, (x - one.x) * s + (y - one.y) * c + d / 2];
                    const across = u1 - u0 >= v1 - v0;
                    const row = (across ? v : u).toFixed(3);

                    assert.ok(YARD_LOOKS[people].crops.includes(crop), `${people} grow ${crop}`);
                    assert.ok(u > u0 && u < u1 && v > v0 && v < v1, `${people}: a ${crop} in its bed`);
                    assert.ok(Math.abs(height - (YARDS.bed - 0.02)) < 1e-9 && seed >= 0 && seed < 1);
                    rows.set(row, [...(rows.get(row) ?? []), { crop, at: across ? u : v }]);
                    grown.add(crop);
                    plants++;
                }

                for (const row of rows.values()) {
                    assert.equal(new Set(row.map(({ crop }) => crop)).size, 1, `${people}: a row of one crop`);

                    for (let k = 1; k < row.length; k++) {
                        assert.ok(Math.abs(row[k].at - row[k - 1].at - PLANTING[row[0].crop]) < 1e-9);
                    }
                }
            }

            assert.ok(!bedded.length || plants > bedded.length * 4, `${people}: ${plants} plants in ${bedded.length} beds`);
            assert.ok(YARD_LOOKS[people].crops.every((crop) => GARDEN_KINDS.includes(crop) && PLANTING[crop] > 0));
        }

        // (Most of what can be grown is, somewhere)
        assert.ok(grown.size >= GARDEN_KINDS.length * 0.7, `${grown.size} crops grown`);
    });

    it("draws what's grown as plants: leaves, stems, flowers and fruit, swaying in the breeze, each its own", async () => {
        const { GARDEN_KINDS, lookGeometry } = await import("../client/js/world/art/kits/wilds.js");
        const TALL = ["bean", "sunflower", "hollyhock"];
        const LEAFY = ["cabbage", "lettuce", "leek", "kale", "carrot", "taro"];

        for (const kind of GARDEN_KINDS) {
            const looks = Array.from({ length: 4 }, (_, k) => lookGeometry(kind, "garden", k));

            for (const geometry of looks) {
                const { color, sway } = geometry.attributes;
                let green = 0;

                for (let i = 0; i < color.count; i++) {
                    green += color.getY(i) > color.getX(i) && color.getY(i) > color.getZ(i) ? 1 : 0;
                }

                // (Green leaves and stems, the leafy crops nearly all leaf; moving most at their tips; as
                // tall as it grows)
                assert.ok(green / color.count > (LEAFY.includes(kind) ? 0.6 : 0.2), `${kind}: ${green} of ${color.count} green`);
                assert.ok(sway.array.some((value) => value > 0.1), `${kind} sways`);
                assert.equal(geometry.boundingBox.max.y > 1, TALL.includes(kind), `${kind}: ${geometry.boundingBox.max.y.toFixed(2)} tall`);
            }

            assert.equal(new Set(looks.map((geometry) => geometry.attributes.position.array.join())).size, looks.length, `${kind}: each look its own`);
        }
    });

    it("hangs washing out on a line across a yard's back, in the breeze; the orcs' hides on a rack", async () => {
        const { clothMesh, CLOTH } = await import("../client/js/world/cloth.js");
        const { yard, YARDS, YARD_LOOKS } = await import("../client/js/world/art/kits/yards.js");
        const { YARD_LINE } = await import("../client/js/core/setpieces/town.js");

        for (const people of PEOPLES) {
            const yards = yardsOf(people);
            const strung = yards.filter(({ line }) => line).map((one) => ({ one, cloth: yard(one).userData.cloth ?? [] }));
            const washed = strung.filter(({ cloth }) => cloth.length);

            // (Only where there's room, and on some of those)
            assert.ok(yards.filter(({ line }) => !line).every((one) => !yard(one).userData.cloth), `${people}: washing only where there's room`);
            assert.ok(washed.length > 0 || strung.length < 3, `${people}: some washing out`);
            assert.ok(washed.length <= strung.length * (YARDS.line + 0.35), `${people}: ${washed.length} of ${strung.length} washed`);

            for (const { one, cloth } of washed) {
                for (const { at, out, width, drop, kind, look, colour } of cloth) {
                    assert.equal(kind, "wash");
                    assert.equal(look, "square");
                    assert.ok(YARD_LOOKS[people].washing.includes(colour), `${people}: washing ${colour}`);
                    assert.deepEqual(out, [0, 0, 1]);
                    // (Pegged out across its back, its foot well off the ground)
                    assert.ok(Math.abs(at[2] - M * YARD_LINE.back) < 1e-9 && at[0] > M * YARD_LINE.side && at[0] < one.w * 20 - M * YARD_LINE.side);
                    assert.ok(at[1] - drop > M * 0.4 && width > 0 && drop > 0, `${people}: washing off the ground`);
                }
            }
        }

        // (Drawn in fewer squares than a banner, swaying as one)
        const mesh = clothMesh([{ at: [0, 2, 0], width: 0.6, drop: 0.8, kind: "wash", look: "square", colour: "#ece5d2" }]);
        const [across, down] = CLOTH.grid.wash;

        assert.equal(mesh.geometry.attributes.position.count, (across + 1) * (down + 1));
        assert.equal(mesh.geometry.attributes.hang.getZ(0), 0);
    });

    it("is the same yard every time, nothing drawn round a yard left open", async () => {
        const { yard } = await import("../client/js/world/art/kits/yards.js");
        const yards = PEOPLES.flatMap(yardsOf);
        const count = (object) => {
            let n = 0;

            object.traverse((node) => (n += node.geometry?.attributes.position.count ?? 0));

            return n;
        };
        const open = yards.filter((one) => one.fence.every((runs) => !runs.length));

        assert.deepEqual(yard(yards[5]).userData, yard(yards[5]).userData);
        assert.equal(count(yard(yards[5])), count(yard(yards[5])));
        assert.ok(open.length > 0 && open.every((one) => count(yard({ ...one, bed: null, line: false })) === 0), `${open.length} open`);
        assert.ok(yards.filter((one) => !open.includes(one)).every((one) => count(yard({ ...one, bed: null, line: false })) > 0));
    });
});
