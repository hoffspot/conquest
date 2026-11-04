// What lays a scene set into the land into it past its own art (world/landmarkdress.js): its
// heights read from its art; its ground darkened round what stands on it, not under what hangs
// over it; its rocks and walls darkened at their feet; boulders and scree of our own rocks along
// its crag's foot, on the world's land or its own bare terrain, never on its road; and mist lying
// low in its chasm, drawn with the near world or the far land by how far off each puff is.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { scenesIn } from "../client/js/core/terrain/height.js";
import { growsAt, onItsRoad, toWorld } from "../client/js/core/terrain/scenes.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";
import { contactFor, DRESS, dressUniforms, footed, footOf, heightAt, heightsOf, landOf, mistOf, puffsOf, screeOf } from "../client/js/world/landmarkdress.js";

// A box of a material, `from` to `to` ([x, y, z] metres)
function box(name, from, to) {
    const size = to.map((v, k) => v - from[k]);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ name }));

    mesh.position.set(...from.map((v, k) => v + size[k] / 2));

    return mesh;
}

// A scene's art made up: a terrain 20 m square at 0, a rock 4 m across standing on it (0 to 3 m
// up), a wall on the rock (3 to 8), and a slab hanging over the terrain (10 to 11), all of it moved
// by its own middle as the landmark has it
function art() {
    const object = new THREE.Group();

    object.add(box("M_Ground", [-10, -0.5, -10], [10, 0, 10]), box("M_Rock1", [0, 0, 0], [4, 3, 4]), box("M_I_1", [0.2, 3, 0.2], [0.8, 8, 0.8]), box("M_II_2", [-8, 10, -8], [-6, 11, -6]));
    object.position.set(-5, 0, 7);

    return object;
}

// Bellhaven's heights as its art has them, made from its ground's patches (scenes.js `ground`:
// the top of its terrain, and of all else over it), each metre: what's over its terrain its rock
// where it stands a metre over it, standing on it
function bellhavenHeights(scene) {
    const { ground } = scene;
    const origin = [scene.box[0], scene.box[1]];
    const size = [scene.box[2] - scene.box[0], scene.box[3] - scene.box[1]];
    const NONE = -1000;
    const grids = { terrain: new Float32Array(size[0] * size[1]).fill(NONE), rock: new Float32Array(size[0] * size[1]).fill(NONE), all: new Float32Array(size[0] * size[1]).fill(NONE), low: new Float32Array(size[0] * size[1]).fill(Infinity) };

    for (let j = 0; j < size[1]; j++) {
        for (let i = 0; i < size[0]; i++) {
            const [px, pz] = [Math.floor((origin[0] + i + 0.5 - ground.origin[0]) / ground.square), Math.floor((origin[1] + j + 0.5 - ground.origin[1]) / ground.square)];

            if (px < 0 || pz < 0 || px >= ground.size[0] || pz >= ground.size[1]) {
                continue;
            }

            const [k, p] = [j * size[0] + i, pz * ground.size[0] + px];
            const [top, over] = [ground.has[p] ? ground.top[p] : NONE, ground.over[p]];

            grids.terrain[k] = top;
            grids.all[k] = Number.isNaN(over) ? top : Math.max(top, over);
            grids.rock[k] = !Number.isNaN(over) && over - top > 1 ? over : top;
            grids.low[k] = Number.isNaN(over) ? Infinity : top;
        }
    }

    return { origin, size, square: 1, ...grids };
}

describe("a scene's dressing in the world (world/landmarkdress.js)", () => {
    let plan;
    let placed;
    let heights;

    before(() => {
        plan = planWorld(1);
        [placed] = scenesIn(plan);
        heights = bellhavenHeights(placed.scene);
    });

    it("reads its art's heights each metre: its terrain's top, its terrain's and rocks', all of it, and the lowest of what isn't its terrain", () => {
        const read = heightsOf(art(), [-10, -10, 10, 10], new Set(["M_Ground"]));
        const at = (grid, x, z) => heightAt(read, grid, x, z);

        assert.deepEqual([read.origin, read.size, read.square], [[-10, -10], [20, 20], DRESS.square]);
        // (Bare terrain: its own top, nothing over it)
        assert.deepEqual([at("terrain", 7, 7), at("rock", 7, 7), at("all", 7, 7)], [0, 0, 0]);
        assert.equal(read.low[(7 + 10) * 20 + 7 + 10], Infinity);
        // (The rock, the wall on it: their tops, the rock's foot on the terrain)
        assert.deepEqual([at("terrain", 2.5, 2.5), at("rock", 2.5, 2.5), at("all", 2.5, 2.5)], [0, 3, 3]);
        assert.deepEqual([at("rock", 0.5, 0.5), at("all", 0.5, 0.5)], [3, 8]);
        assert.ok(read.low[(2 + 10) * 20 + 2 + 10] <= 0.01);
        // (The slab hanging over the terrain, its foot 10 m up)
        assert.deepEqual([at("terrain", -7, -7), at("rock", -7, -7), at("all", -7, -7)], [0, 0, 11]);
        assert.ok(Math.abs(read.low[(-7 + 10) * 20 - 7 + 10] - 10) < 0.01);
        // (Nothing out past it)
        assert.equal(at("all", 30, 0), -1000);
    });

    it("darkens the ground round what stands on it, as the world's is round its rocks, and not under what hangs over it", () => {
        const read = heightsOf(art(), [-10, -10, 10, 10], new Set(["M_Ground"]));
        const contact = contactFor({ scene: { box: [-10, -10, 10, 10], middle: [0, 0] }, at: [100, 200], cos: 1, sin: 0 }, read);
        const { data, width } = contact.texture.image;
        const [x0, y0] = contact.area;
        const at = (x, z) => data[(200 + z - y0) * width + (100 + x - x0)] / 255;

        assert.ok(at(2, 2) > 0.1, `by the rock: ${at(2, 2)}`);
        assert.ok(at(2, 2) <= DRESS.feet.most + 0.01, `as most: ${at(2, 2)}`);
        assert.equal(at(-7, -7), 0);
        assert.equal(at(9, -9), 0);
    });

    it("darkens its rocks and walls at their feet: copies of their materials, not faded with the near world, rocks up from the terrain, walls up from the terrain or rock", () => {
        const uniforms = dressUniforms(heightsOf(art(), [-10, -10, 10, 10], new Set(["M_Ground"])), new THREE.Matrix4());
        const stone = new THREE.MeshStandardMaterial({ name: "M_Rock1" });
        const [rock, wall] = [footed(stone, "rock", uniforms), footed(stone, "wall", uniforms)];

        assert.notEqual(rock, stone);
        assert.equal(stone.defines.NO_NEAR_FADE, undefined);
        assert.deepEqual([rock.defines.NO_NEAR_FADE, rock.defines.LANDMARK_FEET_ON, wall.defines.LANDMARK_FEET_ON], ["", "below.r", "below.g"]);
        assert.notEqual(rock.customProgramCacheKey(), wall.customProgramCacheKey());

        const { image, type, format } = uniforms.landmarkHeights.value;

        assert.deepEqual([image.width, image.height, type, format], [20, 20, THREE.HalfFloatType, THREE.RGFormat]);
        assert.deepEqual(uniforms.landmarkArea.value.toArray(), [-10, -10, 20, 20]);
    });

    it("strews boulders and scree along Bellhaven's crag's foot: near its rocks, on the world's land or its own bare terrain, never on its road", () => {
        const foot = footOf(placed, heights, landOf(plan));

        assert.ok(foot.length > 1000, `${foot.length}`);

        for (const { at, height, far } of foot) {
            const [x, y] = toWorld(placed, ...at);

            assert.ok(far > 0 && far <= DRESS.scree.reach);
            assert.ok(!onItsRoad(placed.scene, ...at), `${at}`);
            assert.ok(Number.isFinite(height));
            assert.ok(growsAt(placed, x, y) || heights.all[Math.floor(at[1] - heights.origin[1]) * heights.size[0] + Math.floor(at[0] - heights.origin[0])] - heightAt(heights, "terrain", ...at) < 0.3);
        }

        const scree = screeOf(placed, heights, landOf(plan), 7);

        assert.ok(scree.boulders > DRESS.scree.boulders / 2 && scree.boulders <= DRESS.scree.boulders, `${scree.boulders}`);
        assert.equal(scree.far.geometry, scree.near.children[0].geometry);
        // (The boulders not faded with the near world, as the castle isn't; the scree, small, is)
        assert.equal(scree.far.material.defines.NO_NEAR_FADE, "");
        assert.notEqual(scree.far.material, scree.near.children[0].material);
        assert.equal(scree.near.children[1].material.defines?.NO_NEAR_FADE, undefined);
        assert.ok(scree.near.children[1].geometry.index.count > 0);

        // (All of it in the scene's box, or a little past it)
        scree.far.geometry.computeBoundingBox();

        const { min, max } = scree.far.geometry.boundingBox;
        const { box: extent } = placed.scene;

        assert.ok(min.x > extent[0] - 12 && max.x < extent[2] + 12 && min.z > extent[1] - 12 && max.z < extent[3] + 12, `${min.toArray()} ${max.toArray()}`);
        // (The same strewing for the same seed)
        assert.equal(screeOf(placed, heights, landOf(plan), 7).boulders, scree.boulders);
    });

    it("lays mist low in Bellhaven's chasm, over its floor and lower walls, each puff drawn with the near world or the far land by how far off it is; none where a scene has no chasm", () => {
        const mist = DRESS.mist.bellhaven;
        const puffs = puffsOf("bellhaven", heights, 3);

        assert.equal(puffs.length, mist.puffs);

        for (const { at, size, phase } of puffs) {
            const ground = heightAt(heights, "terrain", at[0], at[2]);

            assert.ok(at[0] >= mist.box[0] && at[0] <= mist.box[2] && at[2] >= mist.box[1] && at[2] <= mist.box[3], `${at}`);
            assert.ok(ground <= mist.low, `${ground}`);
            assert.ok(at[1] - ground >= mist.over[0] && at[1] - ground <= mist.over[1]);
            assert.ok(size >= mist.size[0] && size <= mist.size[1] && phase >= 0 && phase < 1);
        }

        const uniforms = dressUniforms(heights, new THREE.Matrix4());
        const drawn = mistOf("bellhaven", heights, uniforms, 3);

        assert.equal(drawn.puffs, mist.puffs);
        assert.equal(drawn.far.geometry, drawn.near.geometry);
        assert.equal(drawn.geometry.instanceCount, mist.puffs);
        assert.deepEqual([drawn.far.material.defines.MIST_FAR, drawn.near.material.defines.MIST_NEAR, drawn.near.material.defines.NO_NEAR_FADE], ["", "", ""]);
        assert.equal(drawn.near.material.uniforms.landmarkHeights, uniforms.landmarkHeights);
        assert.deepEqual(puffsOf("nowhere", heights, 3), []);
        assert.equal(mistOf("nowhere", heights, uniforms, 3), null);
    });
});
