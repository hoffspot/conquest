// The trees (client/js/world/art/kits/trees.js): grown from rules for each kind, from a seed
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TREE_VARIANTS } from "../client/js/core/setpieces/pieces.js";
import { growTree, KINDS, plantTrees, SPECIES, treeMaterials, VARIANTS } from "../client/js/world/art/kits/trees.js";

// The corners of a grown part: [x, y, z] for each vertex
const points = ({ position }) => Array.from({ length: position.length / 3 }, (_, k) => position.slice(k * 3, k * 3 + 3));

describe("the trees (trees.js)", () => {
    it("has as many variants as the town's plans pick from, every kind among them", () => {
        assert.equal(VARIANTS.length, TREE_VARIANTS);
        assert.deepEqual([...new Set(VARIANTS.map(([kind]) => kind))].sort(), [...KINDS].sort());
        assert.deepEqual(KINDS, ["oak", "beech", "birch", "pine", "spruce", "poplar", "apple"]);
    });

    it("grows the same tree from the same seed, and a different one from another", () => {
        assert.deepEqual(growTree("oak", 3).wood.position, growTree("oak", 3).wood.position);
        assert.notDeepEqual(growTree("oak", 3).wood.position, growTree("oak", 4).wood.position);
    });

    it("grows each kind to its height, standing on its trunk's foot, its crown round it", () => {
        for (const kind of KINDS) {
            for (const seed of [1, 2, 3]) {
                const tree = growTree(kind, seed);
                const [least, most] = SPECIES[kind].height;
                const wood = points(tree.wood);
                const leaves = points(tree.leaves);
                const top = Math.max(...leaves.map(([, y]) => y));
                const spread = Math.max(...leaves.map(([x, , z]) => Math.hypot(x, z)));

                assert.ok(tree.height >= least && tree.height <= most, `${kind} ${seed}: ${tree.height}`);
                assert.ok(Math.abs(Math.min(...wood.map(([, y]) => y))) < 0.05, `${kind} stands on the ground`);
                assert.ok(top > tree.height * 0.8 && top < tree.height * 1.3, `${kind} ${seed}: its top ${top.toFixed(1)} of ${tree.height.toFixed(1)}`);
                assert.ok(spread > 1.2 && spread < tree.height, `${kind} ${seed}: spread ${spread.toFixed(1)}`);
            }
        }

        // A poplar narrow, an oak broad; an apple tree small
        const shape = (kind) => {
            const leaves = points(growTree(kind, 1).leaves);

            return Math.max(...leaves.map(([x, , z]) => Math.hypot(x, z))) / Math.max(...leaves.map(([, y]) => y));
        };

        assert.ok(shape("poplar") < 0.35, `poplar ${shape("poplar").toFixed(2)}`);
        assert.ok(shape("oak") > 0.45, `oak ${shape("oak").toFixed(2)}`);
        assert.ok(growTree("apple", 1).height < 6);
    });

    it("keeps each tree light enough for a phone: under 3,000 triangles, about 1,600 on average", () => {
        let total = 0;

        for (const [kind, seed] of VARIANTS) {
            const tree = growTree(kind, seed);
            const triangles = (tree.wood.index.length + tree.leaves.index.length) / 3;

            assert.ok(triangles < 3000, `${kind} ${seed}: ${triangles}`);
            total += triangles;
        }

        assert.ok(total / VARIANTS.length < 2000, `on average ${total / VARIANTS.length}`);
    });

    it("draws each kind's bark and leaves from its own place on the pictures they share", () => {
        for (const kind of KINDS) {
            const tree = growTree(kind, 1);
            const cell = KINDS.indexOf(kind);

            for (const part of [tree.wood, tree.leaves]) {
                const us = part.uv.filter((_, k) => k % 2 === 0);

                assert.ok(us.every((u) => u >= cell / KINDS.length && u <= (cell + 1) / KINDS.length), kind);
            }
        }

        const { bark, leaves } = treeMaterials();

        assert.equal(leaves.alphaTest > 0, true);
        assert.equal(leaves.vertexColors, true);
        assert.equal(bark.name, "bark");
    });

    it("plants trees a tile at a time, each where it stands, as big as it's asked", () => {
        const { object, boxes } = plantTrees([
            { x: 5, z: 5, variant: 0 },
            { x: 8, z: 6, variant: 3, size: 1.3, turn: 1 },
            { x: 105, z: 60, variant: 5 },
        ]);

        // Two tiles, the bark and the leaves in each
        assert.equal(object.children.length, 4);
        assert.deepEqual(object.children.map(({ material }) => material.name).sort(), ["bark", "bark", "leaves", "leaves"]);

        boxes.forEach((box, k) => {
            const [x, z] = [[5, 5], [8, 6], [105, 60]][k];

            assert.ok(box.min.x < x && box.max.x > x && box.min.z < z && box.max.z > z, `tree ${k} round its trunk`);
            assert.ok(Math.abs(box.min.y) < 0.05, `tree ${k} on the ground`);
        });

        const [kind, seed] = VARIANTS[3];

        assert.ok(boxes[1].max.y > growTree(kind, seed).height * 1.2, "the bigger one taller");
    });
});
