// The fires and the lights out of doors (client/js/world/fire.js, lights.js, firelight.js): every
// fire's flame, its embers and smoke, puffing as fires do; its light rising and falling with it,
// leaning with it, off by day if it's lit only at night; the two that matter most the view's
// lamps, every other near one its own light in the world's materials (view.js lightNear)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { WINDOW_LIGHT } from "../client/js/world/art/engine/atlas.js";
import { fireFlames, fireMaterials, fireOf, FIRES, fireSignal, fireStrength, flameHeight, flamesMesh } from "../client/js/world/fire.js";
import { FIRE_LIGHT, FIRE_LIGHTS, fireLit, LIGHTS, lightNow, lightsMesh, lightsOf, nearestLights, seedOf } from "../client/js/world/lights.js";
import { NIGHT_FIRE, View } from "../client/js/world/view.js";

describe("the fires (world/fire.js)", () => {
    it("puffs as a fire does: about as often as its kind's rate, growing slowly and collapsing quickly, each its own", () => {
        for (const [kind, { rate }] of Object.entries(FIRES)) {
            let [tops, last, rising, falling, up] = [0, 0, 0, 0, false];

            for (let time = 0; time < 60; time += 1 / 480) {
                const { puff } = fireSignal(0.37, rate, time);

                if (puff > last) {
                    rising++;
                    up = true;
                } else if (puff < last) {
                    falling++;
                    tops += up ? 1 : 0;
                    up = false;
                }

                last = puff;
            }

            // (Its puffs counted where it turns from rising to falling: as many a second as its rate,
            // give or take its wandering)
            assert.ok(tops / 60 > rate * 0.6 && tops / 60 < rate * 1.4, `${kind}: ${tops / 60} a second, its rate ${rate}`);
            assert.ok(rising > falling * 1.5, `${kind}: grows more slowly than it collapses (${rising} rising, ${falling} falling)`);
        }

        assert.notDeepEqual(fireSignal(0.1, 5.6, 3), fireSignal(0.8, 5.6, 3), "each its own");
    });

    it("puffs on the GPU as it's worked out here, however long the game's run (32-bit floats)", () => {
        // (FIRE_GLSL's sums, each rounded to a 32-bit float as the GPU has them)
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
        const step = (a, b, x) => {
            const t = Math.min(1, Math.max(0, f(f(x - a) / f(b - a))));

            return f(f(t * t) * f(3 - f(2 * t)));
        };
        const gpu = (seed, rate, time) => {
            const phase = f(f(f(rate) * f(time)) + f(f(0.9) * noise(f(f(f(time) * f(0.37)) + f(f(seed) * 29)))));
            const p = fract(phase);
            const wave = p < 0.72 ? step(0, 0.72, p) : f(1 - step(0.72, 1, p));
            const gust = noise(f(f(f(time) * f(0.23)) + f(f(seed) * 13)));

            return { puff: f(f(wave * f(f(0.55) + f(f(0.9) * hash(f(Math.floor(phase) + Math.floor(f(f(seed) * 97))))))) / f(1.45)), gust: f(gust * gust) };
        };
        let worst = 0;
        let jumps = 0;

        for (let time = 0; time < 1000; time += 0.37) {
            for (const seed of [0.05, 0.37, 0.91]) {
                const [here, there] = [fireSignal(seed, 5.6, time), gpu(seed, 5.6, time)];
                const apart = Math.max(Math.abs(here.puff - there.puff), Math.abs(here.gust - there.gust));

                // (Now and then the two land either side of a puff's end, as the phase's 32-bit
                // rounding has it: a frame's difference, not a drift)
                if (apart > 0.02) {
                    jumps++;
                } else {
                    worst = Math.max(worst, apart);
                }
            }
        }

        // (Its phase, its rate times a clock of up to 1,000 seconds, rounded in 32 bits: a fiftieth
        // of a puff at most, at the steepest of it)
        assert.ok(worst < 0.025, `as much as ${worst} apart`);
        assert.ok(jumps < 10, `${jumps} of 8,100 either side of a puff's end`);
    });

    it("stands its flame taller as it puffs and the breeze gusts; its light far steadier than its flame", () => {
        let [low, high, dim, bright] = [Infinity, 0, Infinity, 0];

        for (let time = 0; time < 120; time += 0.05) {
            const signal = fireSignal(0.37, FIRES.torch.rate, time);

            low = Math.min(low, flameHeight(signal));
            high = Math.max(high, flameHeight(signal));
            dim = Math.min(dim, fireStrength(signal));
            bright = Math.max(bright, fireStrength(signal));
        }

        assert.ok(high - low > 0.4, `the flame: ${low} to ${high}`);
        assert.ok(bright - dim < (high - low) / 2 && bright - dim > 0.1, `the light: ${dim} to ${bright}`);
        assert.equal(fireStrength({ puff: 0.2, gust: 0.9 }, 0), 1, "not flickering at all if it's steady (a flash)");
    });

    it("draws every tongue of a mesh's fires in one mesh, its size in metres, a material for every fire", () => {
        const fires = [
            { x: 0, y: 0, z: 0, kind: "torch" },
            { x: 5, y: 0, z: 0, kind: "fire" },
            { x: 9, y: 0, z: 0, kind: "spell", height: 8, tongues: 12 },
        ];
        const mesh = flamesMesh(fires);
        const corners = (FIRES.torch.tongues + FIRES.fire.tongues) * 7 * 2 + 12 * 13 * 2;

        assert.equal(mesh.geometry.getAttribute("position").count, corners, "a strip of 6 segments a tongue (12 for one taller than a man)");
        assert.equal(mesh.geometry.index.count, ((FIRES.torch.tongues + FIRES.fire.tongues) * 6 + 12 * 12) * 6);
        assert.equal(mesh.material, fireMaterials().flames, "one material for every fire's");
        assert.equal(mesh.material.uniforms.windowLight, WINDOW_LIGHT, "lit as the windows are, by the drawing's clock");
        assert.equal(fireOf({ x: 0, y: 0, z: 0, kind: "torch", scale: 2 }).height, FIRES.torch.height * 2);
        assert.equal(fireOf({ x: 1, y: 2, z: 3, kind: "torch" }).seed, fireOf({ x: 1, y: 2, z: 3, kind: "torch" }).seed, "its seed from where it is");
        assert.match(mesh.material.vertexShader, /fireSignal\(fire\.x, fire\.y, time\)/, "puffing by its own seed and rate");
        assert.match(mesh.material.vertexShader, /cameraPosition/, "turned to the camera, its size in metres whatever the mesh is scaled to");
        assert.equal(flamesMesh([{ x: 0, y: 0, z: 0, kind: "lantern", tongues: 0 }]), null);

        // (A spell's its own copy, its size and its body its own (a body of flame that keeps its
        // colour by day; the world's fires none, adding their light), everything else the same)
        const own = fireFlames(0.3, 1);

        assert.equal(own.uniforms.fireSize.value, 0.3);
        assert.equal(own.uniforms.fireBody.value, 1);
        assert.equal(own.uniforms.windowLight, WINDOW_LIGHT);
        assert.equal(fireMaterials().flames.uniforms.fireSize.value, 1);
        assert.equal(fireMaterials().flames.uniforms.fireBody.value, 0, "the world's fires adding their light, as they did");
        assert.equal(fireFlames(0.5).uniforms.fireBody.value, 0);
        assert.equal(own.vertexShader, fireMaterials().flames.vertexShader, "the same shader, so nothing's compiled again");
        assert.equal(own.fragmentShader, fireMaterials().flames.fragmentShader);
    });
});

describe("the lights out of doors (world/lights.js)", () => {
    it("finds a built piece's lights where they are in the world, and the way out from the wall a torch is on", () => {
        const piece = new THREE.Group();
        const part = new THREE.Group();

        part.userData.lights = [[10, 20, 30, "torch", 0, 1], [0, 5, 0, "lantern"]];
        piece.add(part);
        piece.scale.setScalar(0.2);
        piece.rotation.y = Math.PI / 2;
        piece.position.set(100, 2, 200);
        piece.updateMatrixWorld(true);

        const [torch, lantern] = lightsOf(piece);
        const round = (v) => Number(v.toFixed(6));

        assert.deepEqual([torch.x, torch.y, torch.z].map(round), [106, 6, 198]);
        assert.deepEqual(torch.out.map(round), [1, 0], "turned with the piece");
        assert.equal(lantern.out, null);
        assert.equal(lantern.kind, "lantern");
    });

    it("draws the fires of those whose flames are drawn, their embers and smoke, and every one's glow", () => {
        const lights = [
            { x: 0, y: 2, z: 0, kind: "torch" },
            { x: 4, y: 2, z: 0, kind: "torch" },
            { x: 9, y: 3, z: 1, kind: "lantern" },
            { x: 20, y: 0, z: 0, kind: "fire" },
        ];
        const drawn = lightsMesh(lights);
        const parts = Object.fromEntries(drawn.children.map((child) => [child.name, child]));

        assert.equal(lightsMesh([]), null);
        assert.deepEqual(Object.keys(parts).sort(), ["embers", "fire smoke", "flames", "glows", "torch smoke"]);
        assert.equal(parts.flames.geometry.getAttribute("position").count, (2 * FIRES.torch.tongues + FIRES.fire.tongues) * 14, "no flame for the lantern, behind its glass");
        assert.equal(parts.embers.geometry.getAttribute("position").count, 2 * FIRES.torch.embers + FIRES.fire.embers);
        assert.equal(parts.glows.geometry.getAttribute("position").count, 4, "a glow for each");
        assert.equal(parts.glows.material.uniforms.windowLight, WINDOW_LIGHT);
        assert.equal(lightsMesh(lights).getObjectByName("flames").material, parts.flames.material, "one material for every chunk's");
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

    it("lights rise and fall with their fires: stronger and higher as they puff, leaning with the flame, a torch's out from its wall", () => {
        const torch = { x: 2, y: 3, z: 0, kind: "torch", out: [0, 1] };
        const samples = [];

        for (let time = 0; time < 30; time += 0.1) {
            const now = lightNow(torch, time, 1);
            const signal = fireSignal(seedOf(torch), FIRES.torch.rate, time);

            assert.ok(Math.abs(now.strength - LIGHTS.torch.strength * fireStrength(signal)) < 1e-9, "as strong as its flame burns");
            assert.ok(now.z > torch.z + 0.2, "a little way out from its wall");
            samples.push({ puff: signal.puff, height: now.y, strength: now.strength });
        }

        const [low, high] = [samples.reduce((a, b) => (b.puff < a.puff ? b : a)), samples.reduce((a, b) => (b.puff > a.puff ? b : a))];

        assert.ok(high.height > low.height && high.height - low.height < 0.1, "a little higher as the flame stands taller");
        assert.equal(lightNow(torch, 3, 0).strength, 0, "a torch out by day");
        assert.ok(lightNow({ x: 0, y: 0, z: 0, kind: "fire" }, 3, 0).strength > 0, "a camp fire burning day and night");
        assert.equal(lightNow({ x: 0, y: 0, z: 0, kind: "spell", strength: 20, steady: 0, fade: 0.5 }, 3, 0).strength, 10, "a flash as strong as it's fading, not flickering");
    });
});

describe("the fires lighting what's round them (view.js lightNear, firelight.js)", () => {
    const lamps = () => Array.from({ length: 2 }, () => ({ light: new THREE.PointLight(0xffffff, 0, 12, 2) }));
    const light = (view, lights, near, time = 1.5) => View.prototype.lightNear.call(view, lights, near, time);

    it("lights the view's two lamps from the two that matter most, every other one near its own light in the list", () => {
        const view = { indoors: false, lamps: lamps() };
        const torches = Array.from({ length: 6 }, (_, k) => ({ x: k * 2, y: 2, z: 1, kind: "torch" }));

        WINDOW_LIGHT.value.x = 1;
        light(view, torches, { x: 0, y: 1, z: 0 });
        assert.ok(view.lamps.every(({ light: { intensity } }) => intensity > 0));
        assert.ok(view.lamps[0].light.position.x < 0.5, "the nearest first");
        assert.equal(FIRE_LIGHT.count.value, 4, "the other four in the list");
        assert.ok(FIRE_LIGHT.colour.value[0].r > 0);

        // (A spell's first, wherever it is)
        light(view, [...torches, { x: 9, y: 1, z: 9, kind: "spell", strength: 10, priority: 1 }], { x: 0, y: 1, z: 0 });
        assert.equal(view.lamps[0].light.position.x, 9);

        // (No more in the list than the shaders take)
        light(view, Array.from({ length: 40 }, (_, k) => ({ x: (k % 7) - 3, y: 2, z: Math.floor(k / 7) - 3, kind: "torch" })), { x: 0, y: 1, z: 0 });
        assert.equal(FIRE_LIGHT.count.value, FIRE_LIGHTS);

        // (By day: torches out, none in the list)
        WINDOW_LIGHT.value.x = 0;
        light(view, torches, { x: 0, y: 1, z: 0 });
        assert.ok(view.lamps.every(({ light: { intensity } }) => intensity === 0));
        assert.equal(FIRE_LIGHT.count.value, 0);

        // (Indoors: left to the room's flames)
        WINDOW_LIGHT.value.x = 1;
        view.lamps[0].light.intensity = 0.5;
        light({ ...view, indoors: true }, torches, { x: 0, y: 1, z: 0 });
        assert.equal(view.lamps[0].light.intensity, 0.5);
        assert.equal(FIRE_LIGHT.count.value, 0);

        // (Fading out towards its reach's edge, so it's handed on unseen: by night, NIGHT_FIRE's)
        const far = { indoors: false, lamps: lamps() };
        const [stronger, further] = [1 + NIGHT_FIRE.strength, 1 + NIGHT_FIRE.reach];

        light(far, [{ x: LIGHTS.torch.reach * further * 1.45, y: 1, z: 0, kind: "torch" }], { x: 0, y: 1, z: 0 });
        assert.ok(far.lamps[0].light.intensity < LIGHTS.torch.strength * stronger * 0.05);
        WINDOW_LIGHT.value.x = 0;
    });

    it("lights the dark more strongly and further by night than at dusk, a spell's flash as it's made whatever the hour", () => {
        const near = { x: 0, y: 1, z: 0 };
        const torch = [{ x: 2, y: 2, z: 0, kind: "torch" }];
        const flash = [{ x: 2, y: 2, z: 0, kind: "spell", strength: 4, reach: 8, priority: 1 }];
        const lamp = (lit, lights) => {
            const view = { indoors: false, lamps: lamps() };

            WINDOW_LIGHT.value.x = lit;
            light(view, lights, near);

            return view.lamps[0].light;
        };

        const [dusk, night] = [lamp(0.5, torch), lamp(1, torch)];

        assert.ok(night.intensity > dusk.intensity * 1.3, `${night.intensity} against ${dusk.intensity}`);
        assert.ok(Math.abs(night.distance - LIGHTS.torch.reach * (1 + NIGHT_FIRE.reach)) < 1e-6);
        assert.ok(night.distance > dusk.distance);

        const [flashDusk, flashNight] = [lamp(0.5, flash), lamp(1, flash)];

        assert.equal(flashNight.distance, flashDusk.distance);
        assert.equal(flashNight.distance, 8);
        WINDOW_LIGHT.value.x = 0;
    });

    it("lights every lit material by the list, the way a point light does, nothing behind the wall a torch is on", () => {
        for (const [name, shader] of Object.entries({ standard: THREE.ShaderLib.standard, lambert: THREE.ShaderLib.lambert, phong: THREE.ShaderLib.phong })) {
            const compiled = { uniforms: {}, vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader };

            fireLit(compiled);
            assert.equal(compiled.uniforms.fireAt, FIRE_LIGHT.at, name);
            assert.match(compiled.fragmentShader, new RegExp(`fireAt\\[${FIRE_LIGHTS}\\]`), name);
            assert.match(compiled.fragmentShader, /fireOut\[i\]\.w > 0\.5 && dot\(-toLight\.xz, fireOut\[i\]\.xy\)/, `${name}: nothing behind the wall`);
            assert.match(compiled.vertexShader, /vFireWorld/, name);

            const again = compiled.fragmentShader;

            fireLit(compiled);
            assert.equal(compiled.fragmentShader, again, `${name}: once`);
        }

        // (Every material three.js compiles, unless it says otherwise)
        const plain = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };

        new THREE.MeshLambertMaterial().onBeforeCompile(plain);
        assert.match(plain.fragmentShader, /fireAt\[/);
    });
});
