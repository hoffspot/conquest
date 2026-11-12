// What's merged into the art's one material in fewer bytes (client/js/world/art/engine/corners.js):
// which way each corner faces in three signed bytes, the nearest in direction they can say; and
// corners alike in everything kept once, the same triangles drawn from them in the same order
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { toAtlas } from "../client/js/world/art/engine/atlas.js";
import { byteNormal, sharedCorners } from "../client/js/world/art/engine/corners.js";
import { buildHouse, planHouse } from "../client/js/world/art/kits/house.js";
import { merge } from "../client/js/world/town3d.js";

// How far the way some bytes point is from a unit vector (degrees)
const off = ([qx, qy, qz], [x, y, z]) => (Math.acos(Math.min(1, (qx * x + qy * y + qz * z) / Math.hypot(qx, qy, qz))) * 180) / Math.PI;

describe("which way a corner faces, in three bytes (corners.js byteNormal)", () => {
    it("says a wall's, a floor's and a 45 degree roof's exactly, and nothing for none", () => {
        const half = Math.SQRT1_2;

        for (const [normal, bytes] of [[[1, 0, 0], [127, 0, 0, 0]], [[0, -1, 0], [0, -127, 0, 0]], [[0, 0, 1], [0, 0, 127, 0]], [[0, half, half], [0, 90, 90, 0]], [[-half, half, 0], [-90, 90, 0, 0]], [[0, 0, 0], [0, 0, 0, 0]]]) {
            assert.deepEqual([...byteNormal(...normal, new Int8Array(4))], bytes, normal.join());
        }

        // (And a vector that isn't a unit long: the way it points, all the same)
        assert.deepEqual([...byteNormal(0, 0.2, 0.2, new Int8Array(4))], [0, 90, 90, 0]);
        assert.deepEqual([...byteNormal(126 / 127, 0, -39 / 127, new Int8Array(4))], [126, 0, -39, 0]);

        // (Into four bytes of many, where it's asked)
        const many = new Int8Array(12).fill(9);

        byteNormal(0, 1, 0, many, 4);
        assert.deepEqual([...many], [9, 9, 9, 9, 0, 127, 0, 0, 9, 9, 9, 9]);
    });

    it("comes within a third of a degree of any way there is to face, a thirtieth on average: never further than each side rounded on its own, which is five times as far on average", () => {
        // (A hundred thousand ways, evenly over the sphere: the same every run)
        let seed = 7;
        const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
        const into = new Int8Array(4);
        const [best, rounded] = [{ most: 0, sum: 0 }, { most: 0, sum: 0 }];
        const count = 100000;

        for (let k = 0; k < count; k++) {
            const [up, round] = [random() * 2 - 1, random() * Math.PI * 2];
            const normal = [Math.sqrt(1 - up * up) * Math.cos(round), up, Math.sqrt(1 - up * up) * Math.sin(round)];
            const [mine, theirs] = [off(byteNormal(...normal, into), normal), off(normal.map((side) => Math.round(side * 127)), normal)];

            assert.ok(into.every((byte) => byte >= -127 && byte <= 127) && into[3] === 0);
            assert.ok(mine <= theirs + 1e-6, `${normal}: ${mine} and ${theirs}`);
            best.most = Math.max(best.most, mine);
            best.sum += mine;
            rounded.most = Math.max(rounded.most, theirs);
            rounded.sum += theirs;
        }

        assert.ok(best.most < 0.31, `${best.most} degrees at most`);
        assert.ok(best.sum / count < 0.035, `${best.sum / count} degrees on average`);
        assert.ok(rounded.most > 0.37 && rounded.sum / count > 0.16, "(rounded side by side)");
    });
});

describe("corners alike kept once (corners.js sharedCorners)", () => {
    // A box as the atlas draws it: not indexed, its corners' colours and layers given
    const boxed = () => {
        const box = new THREE.BoxGeometry(2, 3, 4).toNonIndexed().rotateY(0.3).translate(100.5, 2, -40.25);
        const count = box.attributes.position.count;

        box.setAttribute("color", new THREE.BufferAttribute(Float32Array.from({ length: count * 3 }, (_, k) => 0.003 + 0.34 * (Math.floor(k / 18) % 3)), 3));
        box.setAttribute("layer", new THREE.BufferAttribute(new Float32Array(count).fill(7 + 256 * 4 + 2048 * 16), 1));

        return box;
    };
    // A corner, as it's told apart: where it is, its normal's bytes, its place in its picture, its
    // colour and its layer, to the bit
    const corner = ({ position, uv, color, layer }, normal, i) => [...position.array.subarray(i * 3, i * 3 + 3), ...normal, ...uv.array.subarray(i * 2, i * 2 + 2), ...color.array.subarray(i * 3, i * 3 + 3), layer.array[i]].join();
    // Each triangle's corner as it's drawn, in order: a geometry not shared (its normals put into
    // bytes here), or one that is (through its index)
    const drawn = (geometry) => {
        const { normal } = geometry.attributes;

        if (!geometry.index) {
            return Array.from({ length: normal.count }, (_, i) => corner(geometry.attributes, byteNormal(normal.getX(i), normal.getY(i), normal.getZ(i), new Int8Array(4)).subarray(0, 3), i));
        }

        return Array.from(geometry.index.array, (i) => corner(geometry.attributes, normal.array.subarray(i * 4, i * 4 + 3), i));
    };

    it("draws the same triangles, corner for corner in the same order, from the corners that differ: a box's 36 from 24, in 40 bytes each and not 48", () => {
        const box = boxed();
        const shared = sharedCorners(box);
        const { position, normal, uv, color, layer } = shared.attributes;

        assert.deepEqual([box.attributes.position.count, position.count, shared.index.count], [36, 24, 36]);
        assert.deepEqual(drawn(shared), drawn(box));
        assert.equal(new Set(drawn(shared)).size, 24, "none kept twice");

        // (As the graphics card's given them: its normal four signed bytes read as -1 to 1, the
        // rest the floats they were: a dark colour, one over 1 and a layer of thousands as they are)
        assert.deepEqual([normal.array.constructor, normal.itemSize, normal.normalized], [Int8Array, 4, true]);
        assert.deepEqual([position, uv, color, layer].map(({ array, itemSize, normalized }) => [array.constructor, itemSize, normalized]), [[Float32Array, 3, false], [Float32Array, 2, false], [Float32Array, 3, false], [Float32Array, 1, false]]);
        assert.ok(color.array.includes(Math.fround(0.003)) && layer.array.every((value) => value === 7 + 256 * 4 + 2048 * 16));
        assert.equal(Object.values(shared.attributes).reduce((bytes, { array }) => bytes + array.byteLength, 0), 24 * 40);

        // (Two corners in one place that differ in anything else stay two: a colour, a layer. A
        // face's two triangles are its corners a, b, d and b, c, d: b and d each kept once)
        const other = boxed();

        other.attributes.color.array[1 * 3] += 0.001;
        other.attributes.layer.array[35] += 1;
        assert.equal(sharedCorners(other).attributes.position.count, 26);
        assert.deepEqual(drawn(sharedCorners(other)), drawn(other));
    });

    it("keeps the corners of one that's indexed already as they are, its normals in bytes", () => {
        const box = boxed();
        const indexed = sharedCorners(box);
        const again = new THREE.BufferGeometry();

        for (const name of ["position", "uv", "color", "layer"]) {
            again.setAttribute(name, indexed.attributes[name].clone());
        }

        again.setAttribute("normal", new THREE.BufferAttribute(Float32Array.from({ length: 24 * 3 }, (_, k) => indexed.attributes.normal.array[Math.floor(k / 3) * 4 + (k % 3)] / 127), 3));
        again.setIndex(indexed.index.clone());

        const shared = sharedCorners(again);

        assert.equal(shared.attributes.position.count, 24);
        assert.deepEqual([...shared.index.array], [...indexed.index.array]);
        assert.deepEqual(drawn(shared), drawn(indexed));
    });

    it("a house merged into the atlas is the very triangles its pieces are, each corner's colour, layer and place to the bit, in about half the bytes", () => {
        const house = new THREE.Group();

        house.add(buildHouse(planHouse({ w: 2, h: 2.5, style: "timber", storeys: 2, x: 5, y: 5 })).toObject());
        house.rotation.y = 0.7;
        house.updateMatrixWorld(true);

        // (Every piece of it as the atlas draws it, a corner a triangle's corner: town3d.js partsOf,
        // before any is shared)
        const pieces = [];

        house.traverse((node) => {
            if (node.isMesh) {
                pieces.push(...drawn(toAtlas((node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone()).applyMatrix4(node.matrixWorld), node.material)));
            }
        });

        const [mesh] = merge(house, { atlas: true }).children;
        const triangles = (corners) => Array.from({ length: corners.length / 3 }, (_, t) => corners.slice(t * 3, t * 3 + 3).join(";")).sort();
        const bytes = [...Object.values(mesh.geometry.attributes), mesh.geometry.index].reduce((sum, { array }) => sum + array.byteLength, 0);

        assert.equal(mesh.material.name, "atlas");
        assert.ok(pieces.length > 3000 && pieces.length % 3 === 0);
        assert.equal(mesh.geometry.index.count, pieces.length);
        assert.deepEqual(triangles(drawn(mesh.geometry)), triangles(pieces));
        assert.ok(mesh.geometry.attributes.position.count < pieces.length * 0.7, `${mesh.geometry.attributes.position.count} corners kept of ${pieces.length}`);
        assert.ok(bytes < pieces.length * 48 * 0.6, `${bytes} bytes, ${pieces.length * 48} before`);
        assert.equal(mesh.userData.far <= mesh.geometry.index.count && mesh.userData.far % 3, 0, "what's drawn from afar, counted in its triangles' corners");
    });
});
