// The great lone trees (client/js/core/lonetrees.js), planted by the overworld and seen from afar
// alike, and the trees' leaves coloured by their land (client/js/world/canopy.js), near and far
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { CROP, fieldAt } from "../client/js/core/fields.js";
import { LONE_TREES, LONE_VARIANTS, loneTreesNear, loneTreesOf } from "../client/js/core/lonetrees.js";
import { buildWorld, Overworld } from "../client/js/core/overworld.js";
import { TREE_KINDS } from "../client/js/core/setpieces/pieces.js";
import { heightAt } from "../client/js/core/terrain/height.js";
import { BIOME, BIOMES, CELL, CELLS, CHUNK, planWorld, WATER } from "../client/js/core/worldplan/plan.js";
import { CANOPY, canopyTint } from "../client/js/world/canopy.js";
import { FAR_TREES, gatherTrees, TREE_FLOATS } from "../client/js/world/far/trees.js";

const cellAt = (v) => Math.min(CELLS - 1, Math.max(0, Math.floor(v / CELL)));

describe("the great lone trees (lonetrees.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(1);
    });

    it("stand here and there in the open land, two hundred or so a world, the same every time", () => {
        const trees = loneTreesOf(plan);

        assert.ok(trees.length > 150 && trees.length < 350, `${trees.length}`);
        assert.deepEqual(loneTreesOf(planWorld(1)), trees);
        assert.notDeepEqual(loneTreesOf(planWorld(2)), trees);

        for (const { x, y, variant, size } of trees) {
            const k = cellAt(y) * CELLS + cellAt(x);

            assert.ok(Object.keys(LONE_TREES.lands).includes(BIOMES[plan.biome[k]].id), `${x}, ${y}: in ${BIOMES[plan.biome[k]].id}`);
            assert.equal(plan.water[k], WATER.none);
            assert.ok(LONE_VARIANTS.includes(variant) && TREE_KINDS[variant][0] === "greatoak");
            assert.ok(size >= LONE_TREES.size[0] && size <= LONE_TREES.size[1]);

            // Two metres or more inside its chunk, so its trunk's squares are all the chunk's
            assert.ok(x % CHUNK >= 2 && x % CHUNK <= CHUNK - 2 && y % CHUNK >= 2 && y % CHUNK <= CHUNK - 2, `${x}, ${y}`);

            // On ground gentle across its crown
            const heights = [-1, 1].flatMap((dy) => [-1, 1].map((dx) => heightAt(plan, x + dx * LONE_TREES.span, y + dy * LONE_TREES.span)));

            assert.ok(Math.max(...heights) - Math.min(...heights) <= LONE_TREES.rise + 1e-9);

            // Clear of the settlements, the places and the fields' sown strips
            assert.ok(plan.places.every(({ at, radius }) => Math.hypot(at[0] - x, at[1] - y) >= radius + LONE_TREES.keep.place));
            assert.ok(plan.sites.every(({ at }) => Math.hypot(at[0] - x, at[1] - y) >= LONE_TREES.keep.site));

            for (let sy = y - 3; sy < y + 3; sy++) {
                for (let sx = x - 3; sx < x + 3; sx++) {
                    const field = fieldAt(plan.seed, sx, sy);

                    assert.ok(field.crop === CROP.none || plan.biome[cellAt(field.middle[1]) * CELLS + cellAt(field.middle[0])] !== BIOME.farmland, `${x}, ${y}: sown`);
                }
            }
        }

        // One square of `cell` metres apiece, at most
        const squares = new Set(trees.map(({ x, y }) => `${Math.floor(x / LONE_TREES.cell)},${Math.floor(y / LONE_TREES.cell)}`));

        assert.equal(squares.size, trees.length);
    });

    it("are planted by the overworld, their trunks filling sixteen squares, every other tree kept off them; and drawn from afar, the trees round them kept off there too", () => {
        const world = buildWorld({ seed: 1 });
        const overworld = world.maps.town;

        assert.ok(overworld instanceof Overworld);

        // The lone trees in the first chunks that have any, away from the start town
        const chunks = [];

        for (const tree of overworld.loneTrees) {
            const [cx, cy] = [Math.floor(tree.x / CHUNK), Math.floor(tree.y / CHUNK)];

            if (chunks.length < 6 && !chunks.some((chunk) => chunk.cx === cx && chunk.cy === cy) && Math.hypot(tree.x - world.stamp.at[0], tree.y - world.stamp.at[1]) > 600) {
                chunks.push(overworld.chunk(cx, cy));
            }
        }

        let planted = 0;

        for (const chunk of chunks) {
            const lone = chunk.trees.filter((tree) => tree.lone);

            planted += lone.length;

            for (const tree of lone) {
                assert.ok(LONE_VARIANTS.includes(tree.variant));

                for (let y = tree.y - 2; y < tree.y + 2; y++) {
                    for (let x = tree.x - 2; x < tree.x + 2; x++) {
                        const k = (y - chunk.y0) * CHUNK + (x - chunk.x0);

                        assert.equal(chunk.blocked[k], 1, `${x}, ${y} blocked`);
                        assert.equal(chunk.opaque[k], 1, `${x}, ${y} opaque`);
                    }
                }
            }

            // No other tree within `clear` of any lone tree near (planted or not)
            for (const tree of chunk.trees.filter((one) => !one.lone)) {
                for (const one of loneTreesNear(world.plan, [chunk.x0, chunk.y0, chunk.x0 + CHUNK, chunk.y0 + CHUNK], LONE_TREES.clear)) {
                    assert.ok(Math.hypot(one.x - tree.x, one.y - tree.y) >= LONE_TREES.clear, `a tree at ${tree.x}, ${tree.y} by the lone one at ${one.x}, ${one.y}`);
                }
            }
        }

        assert.ok(planted >= 3, `${planted} planted`);

        // From afar: each lone tree a card of its own, as tall as it's grown; none else near it
        const [tree] = overworld.loneTrees.filter(({ x, y }) => Math.hypot(x - world.stamp.at[0], y - world.stamp.at[1]) > 600);
        const cards = gatherTrees(world.plan, { x: tree.x, z: tree.y, reach: 64 });
        const found = [];

        for (let k = 0; k < cards.length; k += TREE_FLOATS) {
            found.push({ x: cards[k], z: cards[k + 2], height: cards[k + 3] });
        }

        const card = found.find(({ x, z }) => x === tree.x && z === tree.y);

        assert.ok(card, "the lone tree from afar");
        assert.ok(Math.abs(card.height - FAR_TREES.greatoak.height * tree.size) < 1e-3);
        assert.ok(found.every(({ x, z }) => (x === tree.x && z === tree.y) || Math.hypot(x - tree.x, z - tree.y) >= LONE_TREES.clear));
    });
});

describe("the trees' leaves coloured by their land (canopy.js)", () => {
    it("gives every land its own colours, the commonest near its leaves' own green", () => {
        for (const [land, choices] of Object.entries(CANOPY)) {
            assert.ok(BIOMES.some((biome) => biome.id === land), land);

            const [[[r, g, b]]] = [...choices].sort((a, c) => c[1] - a[1]);

            assert.ok(Math.max(r, g, b) < 1.6 && Math.min(r, g, b) > 0.5, `${land}: ${[r, g, b]}`);
        }
    });

    it("colours each tree by where it stands, the same every time; golden only on broadleaved trees; the peoples' own trees keep their own colour", () => {
        assert.deepEqual(canopyTint("meadow", "oak", 100, 200), canopyTint("meadow", "oak", 100, 200));

        // A meadow's oaks: mostly green, some warm, some golden (red pushed twice as hard as green
        // or more: a leaf's green is three times its red)
        const oaks = Array.from({ length: 400 }, (_, k) => canopyTint("meadow", "oak", (k % 20) * 4, Math.floor(k / 20) * 4));
        const golden = oaks.filter(([r, g]) => r > g * 2).length;

        assert.ok(golden > 40 && golden < 120, `${golden} of 400 golden`);

        // Its pines never golden
        const pines = Array.from({ length: 400 }, (_, k) => canopyTint("meadow", "pine", (k % 20) * 4, Math.floor(k / 20) * 4));

        assert.ok(pines.every(([r, g]) => r < g * 2));

        // The peoples' own: only a little lighter or darker, the same in each colour
        for (const kind of ["acacia", "ironbark", "willow", "silverbark", "nightspire"]) {
            const [r, g, b] = canopyTint("savannah", kind, 12, 34);

            assert.ok(r === g && g === b && Math.abs(r - 1) <= 0.08 + 1e-9, kind);
        }
    });

    it("colours the trees seen from afar as the near ones", () => {
        const plan = planWorld(1);
        const cards = gatherTrees(plan, { x: 4000, z: 4000, reach: 600 });
        const lightOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((byte) => (byte / 255 <= 0.04045 ? byte / 255 / 12.92 : ((byte / 255 + 0.055) / 1.055) ** 2.4));
        let checked = 0;

        for (let k = 0; k < cards.length && checked < 200; k += TREE_FLOATS) {
            const [x, z, height] = [cards[k], cards[k + 2], cards[k + 3]];
            const land = BIOMES[plan.biome[cellAt(z) * CELLS + cellAt(x)]].id;
            const light = [cards[k + 6], cards[k + 7], cards[k + 8]];

            // (Whichever kind it is, its colour's that kind's light times the land's colour there)
            const matches = Object.entries(FAR_TREES).some(([kind, look]) => {
                const tint = canopyTint(land, kind, x, z);
                const base = lightOf(look.colour);

                return height / look.height > 0.8 && height / look.height < 1.35 && base.every((c, i) => Math.abs(c * tint[i] - light[i]) < 1e-5);
            });

            assert.ok(matches, `the tree at ${x}, ${z} in ${land}`);
            checked++;
        }

        assert.ok(checked > 50, `${checked} checked`);
    });
});
