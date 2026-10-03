// The lights out of doors at night (client/js/world/lights.js): where a built piece's lights are
// in the world, their flames and glows drawn in one mesh of each, lit as the evening has them, and
// the nearest lighting what's round the player (the view's lamps: view.js lightNear)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { WINDOW_LIGHT } from "../client/js/world/art/engine/atlas.js";
import { fireColour, fireFlicker, fireOf, LIGHTS, lightsMesh, lightsOf, nearestLights, seedOf } from "../client/js/world/lights.js";
import { View } from "../client/js/world/view.js";

describe("the lights out of doors (world/lights.js)", () => {
    it("finds a built piece's lights where they are in the world, as its chimneys' tops are found", () => {
        const piece = new THREE.Group();
        const part = new THREE.Group();

        part.userData.lights = [[10, 20, 30, "torch"], [0, 5, 0, "lantern"]];
        piece.add(part);
        piece.scale.setScalar(0.2);
        piece.position.set(100, 2, 200);
        piece.updateMatrixWorld(true);

        assert.deepEqual(
            lightsOf(piece).map(({ x, y, z, kind }) => [x, y, z, kind].map((v) => (typeof v === "number" ? Number(v.toFixed(6)) : v))),
            [
                [102, 6, 206, "torch"],
                [100, 3, 200, "lantern"],
            ],
        );
    });

    it("draws the flames of those that have them and every one's glow, a mesh of each, lit only as the evening has them", () => {
        const lights = [
            { x: 0, y: 2, z: 0, kind: "torch" },
            { x: 4, y: 2, z: 0, kind: "torch" },
            { x: 9, y: 3, z: 1, kind: "lantern" },
        ];
        const drawn = lightsMesh(lights);
        const flames = drawn.getObjectByName("flames");
        const glows = drawn.getObjectByName("glows");

        assert.equal(lightsMesh([]), null);
        assert.equal(flames.geometry.getAttribute("position").count, 2 * 4, "a square for each torch, none for the lantern");
        assert.equal(flames.geometry.index.count, 2 * 6);
        assert.equal(glows.geometry.getAttribute("position").count, 3, "a glow for each");
        assert.equal(flames.material.uniforms.windowLight, WINDOW_LIGHT, "lit as the windows are");
        assert.equal(glows.material.uniforms.windowLight, WINDOW_LIGHT);
        assert.equal(flames.material.blending, THREE.AdditiveBlending);
        assert.equal(lightsMesh(lights).getObjectByName("flames").material, flames.material, "one material for every chunk's");
        assert.match(flames.material.vertexShader, /windowLight\.x/);
    });

    it("flickers as flames do, each its own way, as deep as its kind's, and gives no light by day", () => {
        for (const [kind, { flicker }] of Object.entries(LIGHTS)) {
            let [least, most] = [Infinity, -Infinity];

            for (let t = 0; t < 30; t += 0.05) {
                const { strength } = fireOf(kind, 0.37, t, 1);

                least = Math.min(least, strength);
                most = Math.max(most, strength);
            }

            assert.ok(least >= 1 - flicker.depth / 2 && most <= 1 + flicker.depth / 2 && most - least > flicker.depth * 0.4, `${kind}: ${least} to ${most}`);
            assert.equal(fireOf(kind, 0.37, 3, 0).strength, 0, "by day");
            assert.notEqual(fireOf(kind, 0.1, 3, 1).strength, fireOf(kind, 0.8, 3, 1).strength, "each its own");
        }

        // (Smooth: no jumps from one frame to the next)
        for (let t = 0; t < 30; t += 1 / 60) {
            assert.ok(Math.abs(fireFlicker(0.37, t + 1 / 60) - fireFlicker(0.37, t)) < 0.25, `at ${t}`);
        }
    });

    it("flickers on the GPU as it's worked out here, however long the game's run (32-bit floats)", () => {
        // (FLICKER_GLSL's sums, each rounded to a 32-bit float as the GPU has them)
        const f = Math.fround;
        const fract = (x) => f(x - Math.floor(x));
        const hash = (n) => {
            let h = fract(f(f(n - f(289 * Math.floor(f(n / 289)))) * f(0.1031)));

            h = f(h * f(h + f(33.33)));
            h = f(h * f(h + h));

            return fract(h);
        };
        const noise = (x) => {
            const i = Math.floor(x);
            const t = f(x - i);
            const u = f(f(t * t) * f(3 - f(2 * t)));

            return f(hash(i) + f(f(hash(f(i + 1)) - hash(i)) * u));
        };
        const gpu = (seed, time) => {
            const t = f(f(time) + f(f(seed) * 61));

            return f(f(f(noise(f(t * f(1.9))) * f(0.45)) + f(noise(f(f(t * f(5.3)) + 17)) * f(0.35))) + f(noise(f(f(t * f(11.7)) + 41)) * f(0.2)));
        };
        let worst = 0;

        for (let time = 0; time < 1000; time += 0.37) {
            for (const seed of [0.05, 0.37, 0.91]) {
                worst = Math.max(worst, Math.abs(gpu(seed, time) - fireFlicker(seed, time)));
            }
        }

        assert.ok(worst < 0.01, `as much as ${worst} apart`);

        const { flames, glows } = Object.fromEntries(lightsMesh([{ x: 0, y: 0, z: 0, kind: "torch" }]).children.map((mesh) => [mesh.name, mesh.material]));

        assert.match(flames.vertexShader, /fireFlicker\(flame\.z, windowLight\.z \* flicker\.x\)/, "the flame by the light's own seed, rate and the drawing's clock");
        assert.match(glows.vertexShader, /fireFlicker\(glow\.z, windowLight\.z \* glow\.w\)/, "and its glow");
        assert.match(flames.vertexShader, /mod\(n, 289\.0\)/);
    });

    it("gives the nearest within their reach, nearest first, as many as asked", () => {
        const lights = [
            { x: 30, y: 0, z: 0, kind: "torch" },
            { x: 3, y: 0, z: 0, kind: "torch" },
            { x: 0, y: 0, z: 8, kind: "lantern" },
            { x: 0, y: 0, z: 1, kind: "lantern" },
        ];
        const near = { x: 0, y: 0, z: 0 };

        assert.deepEqual(nearestLights(lights, near, 2).map(({ light, distance }) => [light.x, light.z, distance]), [[0, 1, 1], [3, 0, 3]]);
        assert.equal(nearestLights(lights, near, 9).length, 3, "the torch 30 m off out of its reach");
    });
});

describe("the nearest lights lighting what's round the player (view.js lightNear)", () => {
    const lamps = () => Array.from({ length: 2 }, () => ({ light: new THREE.PointLight(0xffffff, 0, 12, 2) }));
    const light = (view, lights, near, time = 1.5) => View.prototype.lightNear.call(view, lights, near, time);

    it("lights the view's two lamps from the two nearest at night, out at day, none indoors", () => {
        const view = { indoors: false, lamps: lamps() };
        const lights = [
            { x: 1, y: 2, z: 0, kind: "lantern" },
            { x: 0, y: 2, z: 2, kind: "lantern" },
            { x: 6, y: 2, z: 0, kind: "torch" },
        ];

        WINDOW_LIGHT.value.x = 1;
        light(view, lights, { x: 0, y: 1, z: 0 });
        assert.deepEqual(view.lamps[0].light.position.toArray(), [1, 2, 0], "a lantern's light stays where it hangs");
        assert.deepEqual(view.lamps[1].light.position.toArray(), [0, 2, 2]);
        assert.equal(view.lamps[0].light.distance, LIGHTS.lantern.reach);
        assert.ok(view.lamps.every(({ light: { intensity } }) => intensity > 0));

        // (By day: out)
        WINDOW_LIGHT.value.x = 0;
        light(view, lights, { x: 0, y: 1, z: 0 });
        assert.ok(view.lamps.every(({ light: { intensity } }) => intensity === 0));

        // (Indoors: left to the room's flames)
        WINDOW_LIGHT.value.x = 1;
        view.lamps[0].light.intensity = 0.5;
        light({ ...view, indoors: true }, lights, { x: 0, y: 1, z: 0 });
        assert.equal(view.lamps[0].light.intensity, 0.5);

        // (Fading out towards its reach's edge, so it's handed on unseen)
        const far = { indoors: false, lamps: lamps() };

        light(far, [{ x: LIGHTS.torch.reach * 1.45, y: 1, z: 0, kind: "torch" }], { x: 0, y: 1, z: 0 });
        assert.ok(far.lamps[0].light.intensity < LIGHTS.torch.strength * 0.05);
        WINDOW_LIGHT.value.x = 0;
    });

    it("rises and falls with its flame: stronger, yellower and higher as it flares, weaker and redder as it dies down", () => {
        const view = { indoors: false, lamps: lamps() };
        const torch = { x: 2, y: 3, z: 0, kind: "torch" };
        const seed = seedOf(torch);
        const samples = [];

        WINDOW_LIGHT.value.x = 1;

        for (let time = 0; time < 20; time += 0.1) {
            light(view, [torch], { x: 0, y: 3, z: 0 }, time);

            const { light: lamp } = view.lamps[0];
            const fire = fireOf("torch", seed, time, 1);

            assert.ok(Math.abs(lamp.intensity - LIGHTS.torch.strength * fire.strength) < 1e-9, "as strong as its flame's drawn");
            assert.equal(lamp.color.getHex(), fireColour("torch", fire.flicker).getHex(), "its colour");
            samples.push({ flicker: fire.flicker, intensity: lamp.intensity, height: lamp.position.y, green: lamp.color.g / lamp.color.r });
        }

        const [low, high] = [samples.reduce((a, b) => (b.flicker < a.flicker ? b : a)), samples.reduce((a, b) => (b.flicker > a.flicker ? b : a))];

        assert.ok(high.intensity > low.intensity * 1.2, `${low.intensity} to ${high.intensity}`);
        assert.ok(high.height > low.height && high.height - low.height < 0.1, "a little higher as the flame stands taller");
        assert.ok(high.green > low.green, "yellower");
        WINDOW_LIGHT.value.x = 0;
    });
});
