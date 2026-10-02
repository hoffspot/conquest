// The signs on the buildings (kits/landmarks.js and each people's builders, peoples/*.js): every
// name board on a wall and every sign hanging out from one, of every people's taverns, temples,
// smithies, guilds, halls and keeps, seen from the street with nothing of its own building in
// front of it (a chimney stack, a lamp, a brazier, beam ends, a gable, a bracket's stay), and its
// picture never in the same place as its frame's face (where the two flicker)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (Signs paint a canvas: enough of one for them to in Node, every other drawing call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            createPattern: () => ({}),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const THREE = await import("three");
const { layoutTown } = await import("../client/js/core/setpieces/town.js");
const { builderOf } = await import("../client/js/world/town3d.js");

// Five art pixels to a metre; how far in front of a sign is kept clear (world pixels)
const M = 5;
const REACH = 3 * M;

// Points over a triangle, kept off its edges
const GRID = [];

for (let i = 1; i < 10; i++) {
    for (let j = 1; i + j < 10; j++) {
        GRID.push([i / 10, j / 10]);
    }
}

const caster = new THREE.Raycaster();
const up = new THREE.Vector3(0, 1, 0);
const isSign = (mesh) => /^(sign|board) /.test(mesh.material.name ?? "");

// Each sign of a building (a name board, a hanging sign: its picture's material's name), its
// triangles, whether it's painted on both faces (hanging out from a wall) and its bounds
function signsOf(object) {
    const signs = new Map();

    object.traverse((mesh) => {
        if (mesh.isMesh && isSign(mesh)) {
            const { position } = mesh.geometry.attributes;
            const index = mesh.geometry.index;
            const sign = signs.get(mesh.material.name) ?? { name: mesh.material.name, triangles: [], box: new THREE.Box3() };

            for (let k = 0; k < (index ? index.count : position.count) / 3; k++) {
                sign.triangles.push([0, 1, 2].map((c) => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(k * 3 + c) : k * 3 + c).applyMatrix4(mesh.matrixWorld)));
            }

            sign.box.union(new THREE.Box3().setFromObject(mesh));
            signs.set(mesh.material.name, sign);
        }
    });

    for (const sign of signs.values()) {
        sign.normals = sign.triangles.map(([a, b, c]) => new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize());
        sign.twoFaced = sign.normals.some((n) => sign.normals.some((o) => n.dot(o) < -0.9));
    }

    return [...signs.values()];
}

/**
 * How much of a sign is hidden by the rest of its building, from each way it's seen: a board on a
 * wall straight on, from 30° to either side and from below (someone in the street looking up at
 * it); a sign hanging out from a wall from along the street, 30° and 55° out from the wall. Each
 * point of it is hidden if anything's between it and someone 3 m off that way (cast both ways: a
 * stack round the board hides it as much as one standing before it). And how many of its points
 * have another face in the same place as the picture's (within 8 mm of it, as seen).
 */
function sightOf(object, sign) {
    const meshes = [];

    object.traverse((mesh) => mesh.isMesh && meshes.push(mesh));

    const others = meshes.filter((mesh) => !isSign(mesh));
    const middle = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    const away = new THREE.Vector3().subVectors(sign.box.getCenter(new THREE.Vector3()), middle);
    const views = {};
    let flush = 0;

    sign.triangles.forEach(([a, b, c], k) => {
        const normal = sign.normals[k];
        const side = new THREE.Vector3().crossVectors(up, normal).normalize();
        const turned = (toward, degrees) => normal.clone().multiplyScalar(Math.cos((degrees * Math.PI) / 180)).addScaledVector(toward, Math.sin((degrees * Math.PI) / 180)).normalize();
        // (Out from its wall, for a hanging sign: across it, away from the building)
        const out = new THREE.Vector3(-normal.z, 0, normal.x);

        if (out.dot(away) < 0) {
            out.negate();
        }

        const looks = sign.twoFaced
            ? [["hanging 30", turned(out, 30)], ["hanging 55", turned(out, 55)]]
            : [["straight", normal], ["side", turned(side, 30)], ["side", turned(side, -30)], ["below", turned(up, -20)]];

        for (const [s, t] of GRID) {
            const point = a.clone().addScaledVector(new THREE.Vector3().subVectors(b, a), s).addScaledVector(new THREE.Vector3().subVectors(c, a), t);

            for (const [view, look] of looks) {
                views[view] ??= [0, 0];
                views[view][1]++;
                caster.set(point.clone().addScaledVector(look, 0.02), look);
                caster.far = REACH;

                let hidden = caster.intersectObjects(others, false).length > 0;

                if (!hidden) {
                    caster.set(point.clone().addScaledVector(look, REACH), look.clone().negate());
                    caster.far = REACH - 0.04;
                    hidden = caster.intersectObjects(others, false).length > 0;
                }

                views[view][0] += hidden ? 1 : 0;
            }

            // (Seen straight on: the picture first, nothing else in its place)
            caster.set(point.clone().addScaledVector(normal, M), normal.clone().negate());
            caster.far = M + 0.1;

            const hits = caster.intersectObjects(meshes, false);
            const picture = hits.findIndex(({ object: mesh }) => mesh.material.name === sign.name);

            if (picture >= 0 && hits.some(({ object: mesh, distance }) => mesh.material.name !== sign.name && Math.abs(distance - hits[picture].distance) < 0.04)) {
                flush++;
            }
        }
    });

    return { views: Object.fromEntries(Object.entries(views).map(([view, [hidden, all]]) => [view, hidden / all])), flush };
}

async function built(piece) {
    const object = await builderOf(piece)(piece);

    object.updateMatrixWorld(true);

    return object;
}

// Every sign of a building clear to see (returns how many it has)
function assertClear(object, label) {
    const signs = signsOf(object);

    for (const sign of signs) {
        const { views, flush } = sightOf(object, sign);
        const said = `${label}, ${sign.name}: ${JSON.stringify(views)}`;

        // Straight on, from below and from the street: all of it; from 30° to the side or along
        // the street, nearly all (a column, a post or a lamp standing beside it may hide an edge)
        for (const view of ["straight", "below", "hanging 55"]) {
            assert.equal(views[view] ?? 0, 0, said);
        }

        for (const view of ["side", "hanging 30"]) {
            assert.ok((views[view] ?? 0) <= 0.12, said);
        }

        assert.equal(flush, 0, `${label}, ${sign.name}: its picture in its frame's face at ${flush} points`);
    }

    return signs.length;
}

describe("the signs on the buildings (kits/landmarks.js, peoples/*.js)", () => {
    it("are clear to see from the street, every people's, nothing of the building before them, their pictures in front of their frames", async () => {
        for (const people of ["human", "elf", "darkElf", "orc", "lizard", "cat"]) {
            const signed = new Map();

            for (const piece of layoutTown({ seed: 1, kind: "city", people }).pieces) {
                if ((piece.kind === "landmark" || piece.kind === "hall") && !signed.has(piece.name) && piece.name !== "market" && piece.name !== "windmill") {
                    signed.set(piece.name, assertClear(await built(piece), `${people} ${piece.name}`));
                }
            }

            // (Every people's taverns and guilds have their names up)
            for (const name of ["tavern", "guild"]) {
                assert.ok(signed.get(name) > 0, `${people} ${name}: ${JSON.stringify([...signed])}`);
            }
        }

        const keep = layoutTown({ seed: 1, kind: "capital" }).pieces.find(({ name }) => name === "keep");

        assert.ok(assertClear(await built(keep), "keep") > 0);
    });

    it("never have a chimney stack up the front across a town hall's name board, its gable to the street", async () => {
        const hall = layoutTown({ seed: 1, kind: "town" }).pieces.find(({ name }) => name === "hall");

        // (Halls that put the stack there, before: a brick front, its gable to the street)
        for (const seed of [12, 20, 29]) {
            assert.ok(assertClear(await built({ ...hall, seed, style: "brick" }), `brick hall ${seed}`) > 0);
        }
    });
});
