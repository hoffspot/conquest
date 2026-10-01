// How the world looks where the player is (world/look.js): a sky, a sun, a mist and a grade for
// every land, blended over the lands round the player and eased as they walk; and the mist and the
// grade as the shaders have them (world/fog.js), put into every material's uniforms once
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { CELL, CELLS, planWorld } from "../client/js/core/worldplan/plan.js";
import { BIOMES } from "../client/js/core/worldplan/races.js";
import { heightAt } from "../client/js/core/terrain/height.js";
import { FAR_LEVELS, farReach } from "../client/js/world/far/levels.js";
import { farHaze, GRADE, hazeAt, MIST } from "../client/js/world/fog.js";
import { Look, LOOKING, LOOKS, lookOfLand } from "../client/js/world/look.js";

// (A look's numbers in a row, to compare)
const numbers = ({ zenith, horizon, sun, strength, mist, grade }) => [...zenith, ...horizon, ...sun, strength, ...mist, ...grade];
const listed = (values) => [...values];

describe("the look of the lands (look.js)", () => {
    let plan;

    before(() => {
        plan = planWorld(1);
    });

    it("has a look for every land: a fair sky, a sun as strong as the day's, a little mist, a light grade", () => {
        for (const { id } of BIOMES) {
            const look = LOOKS[id];

            assert.ok(look, id);
            assert.ok(look.sun[1] >= 2.5 && look.sun[1] <= 4, id);
            assert.ok(look.mist[0] >= 0 && look.mist[0] <= 0.01 && look.mist[2] > 0, id);
            assert.ok(look.grade.slice(0, 3).every((tint) => Math.abs(tint) <= 0.08) && Math.abs(look.grade[3]) <= 0.15, id);

            // (The sky deeper overhead than at the horizon)
            const brightness = (hex) => ((hex >> 16) & 255) + ((hex >> 8) & 255) + (hex & 255);

            assert.ok(brightness(look.zenith) < brightness(look.horizon), id);
        }

        // (The meadow's the day as it was: no grade, the sun as before)
        assert.deepEqual(LOOKS.meadow.grade, [0, 0, 0, 0]);
        assert.equal(LOOKS.meadow.sun[1], 3.5);
    });

    it("is a land's own deep inside it, blended where lands meet, and changes smoothly as the player walks", () => {
        const at = (i, j) => BIOMES[plan.biome[j * CELLS + i]].id;
        const reach = Math.ceil(LOOKING.reach / CELL);
        let inside = null;

        // (A cell with the same land all round it, as far as the look reaches)
        for (let j = 20; j < CELLS - 20 && !inside; j++) {
            for (let i = 20; i < CELLS - 20 && !inside; i++) {
                let same = true;

                for (let dj = -reach; dj <= reach && same; dj++) {
                    for (let di = -reach; di <= reach && same; di++) {
                        same = at(i + di, j + dj) === at(i, j);
                    }
                }

                if (same && at(i, j) !== "meadow") {
                    inside = [i, j];
                }
            }
        }

        assert.ok(inside, "(a land wide enough)");

        const look = new Look(plan);
        const [i, j] = inside;
        const target = look.targetAt((i + 0.5) * CELL, (j + 0.5) * CELL);

        // (The mist's floor over the ground round about: between its lowest and its highest there)
        const FLOOR = 11;
        const grounds = [-2, -1, 0, 1, 2].flatMap((dj) => [-2, -1, 0, 1, 2].map((di) => heightAt(plan, (i + di + 0.5) * CELL, (j + dj + 0.5) * CELL)));
        const offset = LOOKS[at(i, j)].mist[1];

        numbers(lookOfLand(at(i, j))).forEach((value, k) => k === FLOOR || assert.ok(Math.abs(target[k] - value) < 1e-12));
        assert.ok(target[FLOOR] >= Math.min(...grounds) + offset - 1e-9 && target[FLOOR] <= Math.max(...grounds) + offset + 1e-9);

        // Walking a few kilometres a metre at a time, over many lands: never a jump (each number
        // changing by no more than a few hundredths of how much it differs between lands, a metre;
        // the mist's floor, no more than the ground does)
        const all = BIOMES.map(({ id }) => numbers(lookOfLand(id)));
        const ranges = all[0].map((_, k) => Math.max(...all.map((look) => look[k])) - Math.min(...all.map((look) => look[k])) || 1);
        const path = (x) => [x, 3000 + x * 0.3];
        let last = look.targetAt(...path(1000));
        const lands = new Set();
        let most = 0;
        let rising = 0;

        for (let x = 1001; x < 5000; x++) {
            const next = look.targetAt(...path(x));

            most = Math.max(most, ...next.map((value, k) => (k === FLOOR ? 0 : Math.abs(value - last[k]) / ranges[k])));
            rising = Math.max(rising, Math.abs(next[FLOOR] - last[FLOOR]));
            lands.add(at(...path(x).map((metres) => Math.floor(metres / CELL))));
            last = next;
        }

        assert.ok(lands.size >= 3, `(over ${[...lands]})`);
        assert.ok(most < 2 / LOOKING.reach, `(at most ${most} a metre)`);
        assert.ok(rising < 1, `(the mist's floor ${rising} m a metre at most)`);
    });

    it("eases towards the lands' look as the player goes: at once the first time, then over a second or two", () => {
        const look = new Look(plan);
        const [from, to] = [look.targetAt(1000, 1000), look.targetAt(6000, 6000)];
        const k = from.findIndex((value, n) => Math.abs(value - to[n]) > 0.01);

        assert.ok(k >= 0, "(two places that look different)");
        assert.deepEqual(numbers(look.update(1000, 1000, 0.016)), listed(from));

        // (A tenth of a second on, a little of the way; a few seconds on, all but there)
        const share = (value) => (value - from[k]) / (to[k] - from[k]);

        assert.ok(Math.abs(share(numbers(look.update(6000, 6000, 0.1))[k]) - (1 - Math.exp(-0.1 / LOOKING.ease))) < 1e-9);

        for (let t = 0; t < 15; t += 0.1) {
            look.update(6000, 6000, 0.1);
        }

        assert.ok(Math.abs(share(numbers(look.current)[k]) - 1) < 1e-3);
    });
});

describe("the mist and the grade (fog.js)", () => {
    const far = farReach(FAR_LEVELS.medium);
    const mist = { x: 0.004, y: 4, z: 18 };

    it("lies in the low ground: looking along a valley it's thicker than from the heights, and gone with none", () => {
        assert.equal(hazeAt(300, 20, far, { mist: { x: 0, y: 4, z: 18 }, eye: 5, rise: 0 }), hazeAt(300, 20, far));
        assert.ok(hazeAt(300, 20, far, { mist, eye: 5, rise: 0 }) > hazeAt(300, 20, far) + 0.3, "(a valley hazy)");
        assert.ok(hazeAt(300, 20, far, { mist, eye: 250, rise: 0 }) - hazeAt(300, 20, far) < 1e-3, "(the heights clear)");
        // (Looking down into it from above, more than along the heights, less than along the valley)
        const down = hazeAt(300, 20, far, { mist, eye: 250, rise: -245 });

        assert.ok(down > hazeAt(300, 20, far, { mist, eye: 250, rise: 0 }) && down < hazeAt(300, 20, far, { mist, eye: 5, rise: 0 }));
    });

    it("goes through as much mist as the line of sight does: the thickness's integral from the eye to the point", () => {
        for (const [eye, rise] of [
            [30, 40],
            [80, -60],
            [10, 2],
            [12, 0.2],
        ]) {
            const depth = 400;
            const thickness = (height) => Math.exp(-(height - mist.y) / mist.z);
            let sum = 0;

            for (let n = 0; n < 1000; n++) {
                sum += thickness(eye + rise * ((n + 0.5) / 1000)) / 1000;
            }

            const expected = 1 - (1 - hazeAt(depth, 20, far)) * Math.exp(-mist.x * depth * sum);

            assert.ok(Math.abs(hazeAt(depth, 20, far, { mist, eye, rise }) - expected) < 1e-3, `(${eye}, ${rise})`);
        }
    });

    it("is put into every material's uniforms, once: the mist with the fog's, the grade with all of them, shared", () => {
        assert.equal(farHaze(), true);
        assert.equal(farHaze(), true);

        for (const [name, shader] of Object.entries(THREE.ShaderLib)) {
            assert.equal(shader.uniforms.toneGrade, GRADE, name);

            if (shader.uniforms.fogColor) {
                assert.equal(shader.uniforms.fogMist, MIST, name);
            }
        }

        assert.equal(THREE.UniformsLib.fog.fogMist, MIST);
        assert.equal(THREE.ShaderChunk.tonemapping_pars_fragment.split("uniform vec4 toneGrade").length, 2, "(once)");
        assert.match(THREE.ShaderChunk.fog_vertex, /vFogRise/);

        // (A material's copy of the uniforms keeps the very values, so setting them once sets them for all)
        const copied = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms);

        assert.equal(copied.fogMist.value, MIST.value);
        assert.equal(copied.toneGrade.value, GRADE.value);
        assert.deepEqual(GRADE.value, { x: 0, y: 0, z: 0, w: 0 }, "(no grade to start with)");
    });
});
