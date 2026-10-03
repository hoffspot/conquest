// The churches built to a grammar (core/setpieces/pieces.js churchOf, world/art/kits/church.js,
// the terrain plan's M7i-1): as grand as their place (a village's parish church, a town's
// church, a city's minster), Romanesque or Gothic; each on the church's lot with its door where
// the temple inside is entered, its patron's sign by it and the Six's sun on its spire; seen from
// afar as tall as it is near to
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
const { ENTRANCES } = await import("../client/js/core/insides.js");
const { churchOf, LANDMARKS, PLOT } = await import("../client/js/core/setpieces/pieces.js");
const { layoutTown, SETTLEMENT_KINDS } = await import("../client/js/core/setpieces/town.js");
const { CAP, CHURCH } = await import("../client/js/world/art/kits/church.js");
const { landmark } = await import("../client/js/world/art/kits/landmarks.js");
const { FAR_CHURCHES, settlementShapes, Shapes } = await import("../client/js/world/far/shapes.js");

const M = 5;
const [W, H] = LANDMARKS.church;

// A church of a grade and build, built: { object, box (metres), triangles, meshes }
async function built(grade, gothic, patron = "seliane") {
    const object = await landmark({ name: "church", w: W, h: H, patron, seed: 9, grade, gothic });
    const box = new THREE.Box3().setFromObject(object);
    const meshes = [];
    let triangles = 0;

    object.traverse((node) => {
        if (node.isMesh) {
            meshes.push(node);
            triangles += (node.geometry.index?.count ?? node.geometry.getAttribute("position").count) / 3;
        }
    });

    return { object, box: { min: box.min.clone().divideScalar(M), max: box.max.clone().divideScalar(M) }, triangles, meshes };
}

const BUILDS = [
    ["parish", false],
    ["church", false],
    ["church", true],
    ["minster", true],
];

describe("a church's grade (core/setpieces/pieces.js churchOf)", () => {
    it("is as grand as its place: a village's parish church, Romanesque; a town's, either; a city's or a capital's minster, Gothic", () => {
        assert.deepEqual(churchOf(SETTLEMENT_KINDS.village.radius, 3), { grade: "parish", gothic: false });
        assert.deepEqual(churchOf(SETTLEMENT_KINDS.village.radius, 4), { grade: "parish", gothic: false });
        assert.deepEqual(churchOf(SETTLEMENT_KINDS.town.radius, 4), { grade: "church", gothic: true });
        assert.deepEqual(churchOf(SETTLEMENT_KINDS.town.radius, 5), { grade: "church", gothic: false });
        assert.deepEqual(churchOf(SETTLEMENT_KINDS.city.radius, 5), { grade: "minster", gothic: true });
        assert.deepEqual(churchOf(SETTLEMENT_KINDS.capital.radius, 6), { grade: "minster", gothic: true });
    });

    it("is given every church a settlement lays out, from its own seed", () => {
        const builds = new Set();

        for (const kind of ["village", "town", "city", "capital"]) {
            for (const seed of [1, 2, 3, 4]) {
                for (const piece of layoutTown({ seed, kind }).pieces.filter(({ name }) => name === "church")) {
                    assert.deepEqual({ grade: piece.grade, gothic: piece.gothic }, churchOf(SETTLEMENT_KINDS[kind].radius, piece.seed), `${kind} ${seed}`);
                    builds.add(`${piece.grade} ${piece.gothic}`);
                }
            }
        }

        assert.equal(builds.size, 4, [...builds].join(", "));
    });
});

describe("the churches built (world/art/kits/church.js)", () => {
    it("stand on the church's lot, each grade grander than the last, in a few thousand triangles", async () => {
        const tops = [];

        for (const [grade, gothic] of BUILDS) {
            const { box, triangles } = await built(grade, gothic);
            const name = `${grade}${gothic ? " (Gothic)" : ""}`;

            assert.ok(triangles > 800 && triangles < 4000, `${name}: ${triangles} triangles`);
            assert.ok(box.min.x > -0.3 && box.min.z > -0.3 && box.max.x < W * PLOT + 0.3 && box.max.z < H * PLOT + 0.5, `${name} within its lot`);
            assert.ok(box.min.y > -0.01, `${name} on the ground`);

            // (As high as its tower and what's on it, the Six's sun over that)
            const own = CHURCH[grade];
            const top = grade === "minster" ? own.top + own.spire : own.top + (gothic ? own.spire : own.tower * CAP);

            assert.ok(box.max.y >= top - 0.01, `${name}: ${box.max.y.toFixed(1)} m high`);
            tops.push(box.max.y);
        }

        assert.ok(tops[0] < tops[1] && tops[1] < tops[2] && tops[2] < tops[3], tops.map((y) => y.toFixed(1)).join(" < "));
    });

    it("have their door where the temple inside is entered, its floor up the steps, the patron's sign by it", async () => {
        const entrance = ENTRANCES.church;

        for (const [grade, gothic] of BUILDS) {
            const { meshes } = await built(grade, gothic, "brannoc");
            const name = `${grade}${gothic ? " (Gothic)" : ""}`;
            const leaf = meshes.filter((mesh) => [mesh.material].flat().some(({ name }) => name === "planks-dark"));

            assert.ok(leaf.length, `${name}: a door`);

            const box = new THREE.Box3();

            for (const mesh of leaf) {
                box.expandByObject(mesh);
            }

            const [min, max] = [box.min.clone().divideScalar(M), box.max.clone().divideScalar(M)];

            assert.ok(Math.abs((min.x + max.x) / 2 - (W * PLOT) / 2) < 0.05, `${name}: in the middle of the front`);
            assert.ok(Math.abs(max.x - min.x - entrance.width) < 0.05, `${name}: ${entrance.width} m wide`);
            assert.ok(Math.abs(min.y - entrance.floor) < 0.05 && Math.abs(max.y - entrance.floor - entrance.height) < 0.05, `${name}: on its floor, ${entrance.height} m high`);
            assert.ok(Math.abs(H * PLOT - max.z - entrance.depth) < 0.35, `${name}: ${(H * PLOT - max.z).toFixed(2)} m in from the front`);

            const names = meshes.flatMap((mesh) => [mesh.material].flat().map(({ name }) => name));

            assert.ok(names.includes("sign Brannoc"), `${name}: its patron's sign`);
            assert.ok(names.includes("gold"), `${name}: the Six's sun`);
            assert.ok(names.includes("leaded"), `${name}: leaded windows`);
        }
    });
});

describe("the churches seen from afar (world/far/shapes.js)", () => {
    it("stand as tall as they're built, a minster with its two towers", () => {
        assert.deepEqual(FAR_CHURCHES.parish.side, CHURCH.parish.tower);
        assert.deepEqual(FAR_CHURCHES.minster.side, CHURCH.minster.tower);

        for (const [look, grade, gothic] of [["parish", "parish", false], ["romanesque", "church", false], ["gothic", "church", true], ["minster", "minster", true]]) {
            const far = FAR_CHURCHES[look];
            const own = CHURCH[grade];

            assert.equal(far.top, own.top, look);
            assert.ok(Math.abs(far.cap - (gothic ? own.spire : own.tower * CAP)) < 0.1, look);
        }

        // (A city's church, alone in a settlement: a minster's two towers, a parish church's one)
        const piece = (grade, gothic) => ({ kind: "landmark", name: "church", x: 50, y: 50, w: W, h: H, facing: 0, grade, gothic });
        const counts = ["parish", "minster"].map((grade) => {
            const shapes = new Shapes();

            settlementShapes(shapes, { pieces: [piece(grade, grade === "minster")], people: "human", origin: [0, 0], heightOf: () => 0 });

            return { triangles: shapes.triangles, high: Math.max(...Array.from({ length: shapes.triangles * 3 }, (_, k) => shapes.positions[k * 3 + 1])) };
        });

        assert.ok(counts[1].triangles > counts[0].triangles, "a minster's second tower");
        assert.ok(Math.abs(counts[0].high - (FAR_CHURCHES.parish.top + FAR_CHURCHES.parish.cap)) < 0.5, `${counts[0].high.toFixed(1)} m`);
        assert.ok(Math.abs(counts[1].high - (FAR_CHURCHES.minster.top + FAR_CHURCHES.minster.cap)) < 0.5, `${counts[1].high.toFixed(1)} m`);
    });
});
