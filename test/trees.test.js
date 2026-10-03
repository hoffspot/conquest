// The trees (client/js/world/art/kits/trees.js): grown from rules for each kind, from a seed
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_TREES, homeTree, TREE_KINDS, TREE_VARIANTS } from "../client/js/core/setpieces/pieces.js";
import { growTree, KINDS, PATCH_SIDE, plantTrees, SPECIES, treeMaterials, VARIANTS, Woodland } from "../client/js/world/art/kits/trees.js";

// The corners of a grown part: [x, y, z] for each vertex
const points = ({ position }) => Array.from({ length: position.length / 3 }, (_, k) => position.slice(k * 3, k * 3 + 3));

describe("the trees (trees.js)", () => {
    it("has a variant for every tree the plans pick, every kind among them: anyone's first, then each people's own, then the great lone oak", () => {
        const anyones = ["oak", "beech", "birch", "pine", "spruce", "poplar", "apple"];

        assert.equal(VARIANTS, TREE_KINDS);
        assert.deepEqual([...new Set(VARIANTS.map(([kind]) => kind))].sort(), [...KINDS].sort());
        assert.deepEqual(KINDS, [...anyones, ...Object.values(HOME_TREES), "greatoak"]);
        assert.ok(VARIANTS.slice(0, TREE_VARIANTS).every(([kind]) => anyones.includes(kind)));
        assert.ok(VARIANTS.slice(TREE_VARIANTS).every(([kind]) => Object.values(HOME_TREES).includes(kind) || kind === "greatoak"));
        assert.deepEqual(VARIANTS.slice(-3).map(([kind]) => kind), ["greatoak", "greatoak", "greatoak"]);
    });

    it("gives each people its own trees three times in five, and the humans anyone's", () => {
        for (const [people, kind] of Object.entries(HOME_TREES)) {
            const picked = Array.from({ length: TREE_VARIANTS }, (_, variant) => VARIANTS[homeTree(people, variant)][0]);
            const own = picked.filter((one) => one === kind).length;

            assert.ok(Math.abs(own / picked.length - 0.6) < 0.1, `${people}: ${own} of ${picked.length}`);
            assert.ok(picked.every((one) => one === kind || !Object.values(HOME_TREES).includes(one)), people);
        }

        for (let variant = 0; variant < TREE_VARIANTS; variant++) {
            assert.equal(homeTree("human", variant), variant);
        }
    });

    it("grows the same tree from the same seed, and a different one from another", () => {
        assert.deepEqual(growTree("oak", 3).wood.position, growTree("oak", 3).wood.position);
        assert.notDeepEqual(growTree("oak", 3).wood.position, growTree("oak", 4).wood.position);
    });

    it("grows each kind to its height, rooted where its trunk's foot is, its crown round it", () => {
        for (const kind of KINDS) {
            for (const seed of [1, 2, 3]) {
                const tree = growTree(kind, seed);
                const [least, most] = SPECIES[kind].height;
                const wood = points(tree.wood);
                const leaves = points(tree.leaves);
                const top = Math.max(...leaves.map(([, y]) => y));
                const spread = Math.max(...leaves.map(([x, , z]) => Math.hypot(x, z)));

                assert.ok(tree.height >= least && tree.height <= most, `${kind} ${seed}: ${tree.height}`);
                const below = Math.min(...wood.map(([, y]) => y));

                // (The great lone oak's roots, as thick as an oak's trunk, go deeper)
                assert.ok(below < -0.1 && below > (kind === "greatoak" ? -1.8 : -0.35), `${kind} ${seed}: rooted a little way into the ground (${below.toFixed(2)})`);
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

    it("keeps each tree light enough for a phone: under 3,000 triangles, about 1,900 on average", () => {
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

    it("roots each tree: its foot swells out over its roots, which go into the ground; darker and mossy low down, on a patch of earth", () => {
        for (const kind of KINDS) {
            const tree = growTree(kind, 2);
            const wood = points(tree.wood);
            const trunk = SPECIES[kind].trunk.radius * (tree.height / 10);
            const at = (least, most) => wood.filter(([, y]) => y >= least && y <= most).map(([x, , z]) => Math.hypot(x, z));
            const ground = at(-0.01, 0.01);

            // Wider at the ground than the trunk (and widest over the roots), which run on out
            assert.ok(Math.min(...ground) > trunk * 0.98, `${kind}: its foot round its trunk`);
            assert.ok(Math.max(...ground) > trunk * 1.3, `${kind}: its foot swells out`);
            assert.ok(Math.max(...at(-0.05, 0.05)) > trunk * 1.3 + 0.2, `${kind}: its roots run out over the ground`);

            // Each root ends in the ground, not on it
            assert.ok(Math.max(...wood.filter(([, y]) => y < -0.05).map(([x, , z]) => Math.hypot(x, z))) > trunk * 1.3 + 0.2, `${kind}: its roots go into the ground`);

            // The bark darker at the ground than up the trunk
            const shade = (least, most) => {
                const shares = tree.wood.color.filter((_, k) => k % 3 === 0 && tree.wood.position[k + 1] >= least && tree.wood.position[k + 1] <= most);

                return shares.reduce((sum, share) => sum + share, 0) / shares.length;
            };

            assert.ok(shade(-0.3, 0.05) < 0.75 && shade(1.5, 3) > 0.97, `${kind}: ${shade(-0.3, 0.05).toFixed(2)} at the ground, ${shade(1.5, 3).toFixed(2)} up the trunk`);
            assert.ok(tree.patch.radius > 0.4 && tree.patch.radius <= 2.4, `${kind}: a patch ${tree.patch.radius.toFixed(2)} m round`);
        }
    });

    it("casts each crown's shadow from a shell round its leaves (the leaves cast none), drawn only into the shadows", () => {
        for (const kind of KINDS) {
            const tree = growTree(kind, 1);
            const leaves = points(tree.leaves);
            const shell = points(tree.shell);
            const box = (list) => [0, 1, 2].map((axis) => [Math.min(...list.map((p) => p[axis])), Math.max(...list.map((p) => p[axis]))]);
            const [crown, round] = [box(leaves), box(shell)];

            assert.equal(tree.shell.index.length / 3, 180);

            // Inside the crown, reaching most of the way across it, and never into the ground
            for (const axis of [0, 1, 2]) {
                const [least, most] = crown[axis];
                const [from, to] = round[axis];

                // (Low boughs' leaves come nearer the ground than the shell, which stops above it;
                // and a few centimetres a metre of crown either way is near enough)
                const near = 0.05 + 0.01 * (most - least);

                assert.ok(from >= Math.min(least, 0.15) - near && to <= most + near, `${kind}: its shell inside its crown (axis ${axis})`);
                assert.ok(to - from > (most - least) * 0.5, `${kind}: its shell across most of its crown (axis ${axis}: ${(to - from).toFixed(1)} of ${(most - least).toFixed(1)})`);
            }

            assert.ok(round[1][0] >= 0.15 - 1e-6, `${kind}: its shell above the ground`);
        }

        const { object } = plantTrees([{ x: 5, z: 5, variant: 0 }]);
        const byName = (name) => object.children.filter((mesh) => mesh.name.startsWith(name));
        const [cast] = byName("crown shadows");

        assert.ok(byName("leaves").every((mesh) => !mesh.castShadow && mesh.receiveShadow), "the leaves cast no shadows, but are shaded");
        assert.ok(byName("bark").every((mesh) => mesh.castShadow));
        assert.equal(cast.castShadow, true);
        assert.equal(cast.customDepthMaterial, treeMaterials().dapple, "dappled");

        // Three.js draws the shadows first: the shells in them, then none of them in the view
        cast.onBeforeShadow();
        assert.equal(cast.geometry.drawRange.count, Infinity);
        cast.onBeforeRender();
        assert.equal(cast.geometry.drawRange.count, 0);
    });

    it("plants trees a tile at a time, each where it stands, as big as it's asked", () => {
        const { object, boxes } = plantTrees([
            { x: 5, z: 5, variant: 0 },
            { x: 8, z: 6, variant: 3, size: 1.3, turn: 1 },
            { x: 105, z: 60, variant: 5 },
        ]);

        // Two tiles, the bark and the leaves in each; and all the crowns' shadows, and the patches
        // round their feet, together
        assert.equal(object.children.length, 6);
        assert.deepEqual(object.children.map(({ material }) => material.name).sort(), ["bark", "bark", "crown shadows", "leaves", "leaves", "litter"]);

        const litter = object.children.find(({ name }) => name === "litter");

        assert.equal(litter.geometry.index.count / 3, 3 * PATCH_SIDE * PATCH_SIDE * 2, "a patch round each foot");
        assert.equal(litter.userData.onGround, true, "on the ground: not cut away in front of the player");
        assert.equal(litter.castShadow, false);

        boxes.forEach((box, k) => {
            const [x, z] = [[5, 5], [8, 6], [105, 60]][k];

            assert.ok(box.min.x < x && box.max.x > x && box.min.z < z && box.max.z > z, `tree ${k} round its trunk`);
            assert.ok(Math.abs(box.min.y) < 0.05, `tree ${k} on the ground`);
        });

        const [kind, seed] = VARIANTS[3];

        assert.ok(boxes[1].max.y > growTree(kind, seed).height * 1.2, "the bigger one taller");
    });

    it("keeps each variant once in the world's woodland, drawing it wherever it's planted, and fells a lot at a time", () => {
        const woodland = new Woodland();
        const lot = (x0, count) => Array.from({ length: count }, (_, k) => ({ x: x0 + (k % 10) * 6, z: Math.floor(k / 10) * 6, variant: k % VARIANTS.length, size: 1 + (k % 3) * 0.1, turn: k }));
        const first = woodland.plant(lot(0, 60));
        const second = woodland.plant(lot(64, 60));

        // Every variant's wood and leaves once, and a tree drawn for each planted
        assert.equal(woodland.variants.size, VARIANTS.length);
        assert.equal(woodland.planted, 120);
        assert.equal(woodland.wood.instanceCount, 120);
        assert.equal(woodland.wood.perObjectFrustumCulled, true, "only those in view drawn");
        assert.ok(woodland.wood.castShadow && !woodland.leaves.castShadow);

        // Each where it stands, on the ground, with its shells and patches alone in its lot
        first.boxes.forEach((box, k) => {
            const { x, z } = lot(0, 60)[k];

            assert.ok(box.min.x < x && box.max.x > x && box.min.z < z && box.max.z > z && box.min.y === 0, `tree ${k}`);
        });
        assert.deepEqual(first.object.children.map(({ name }) => name), ["crown shadows", "litter"]);

        // Felled, its trees are gone and its room used again; more than there's room for, and
        // the batches grow
        woodland.fell(first);
        assert.equal(woodland.planted, 60);
        assert.equal(first.object.parent, null);

        const more = woodland.plant(lot(128, 3000));

        assert.equal(woodland.planted, 3060);
        assert.ok(woodland.wood.maxInstanceCount >= 3060);
        woodland.fell(second);
        woodland.fell(more);
        assert.equal(woodland.planted, 0);
        woodland.dispose();
    });
});
