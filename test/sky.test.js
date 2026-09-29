// The sky and what flies in it (client/js/world/sky.js, flyers3d.js), and the winged creatures
// flying and landing (client/js/beasts/beast.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (The beasts' skins paint a canvas: enough of one for them to in Node, every other drawing call
// doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const THREE = await import("three");
const { Sky, SKY_COLOURS, CLOUDS } = await import("../client/js/world/sky.js");
const { ALOFT, BIRDS, FLYING, Flyers, LAND_BIRDS, WYVERN_LANDS } = await import("../client/js/world/flyers3d.js");
const { BeastAvatar } = await import("../client/js/beasts/beast.js");
const { BIOMES } = await import("../client/js/core/worldplan/plan.js");

// Random numbers the same every time
function seeded(seed) {
    let state = seed >>> 0;

    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

        return state / 4294967296;
    };
}

// Fly them on for `seconds`, the player standing at `at`
function run(flyers, seconds, at = { x: 0, z: 0 }, options = {}) {
    for (let t = 0; t < seconds; t += 0.1) {
        flyers.update(0.1, t, at, options);
    }
}

describe("the sky (sky.js)", () => {
    it("is a dome round the camera, drawn behind everything, its horizon the haze's colour", () => {
        const sky = new Sky(new THREE.Vector3(-0.55, 1, 0.65));
        const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 150);

        camera.position.set(12, 3, -40);
        sky.update(camera, 7);

        const { material, geometry } = sky.object;

        geometry.computeBoundingSphere();
        assert.ok(geometry.boundingSphere.radius < camera.far, "inside the camera's far plane");
        assert.deepEqual(sky.object.position.toArray(), [12, 3, -40]);
        assert.equal(material.depthWrite, false);
        assert.equal(material.fog, false);
        assert.equal(material.side, THREE.BackSide);
        assert.ok(sky.object.renderOrder < 0);
        assert.equal(sky.uniforms.time.value, 7);
        assert.equal(SKY_COLOURS.horizon, 0xa9c8de);
        assert.ok(CLOUDS.from < CLOUDS.thick);
        sky.dispose();
    });
});

describe("what flies in the sky (flyers3d.js)", () => {
    it("has birds for every land, each a dozen triangles or so", () => {
        for (const { id } of BIOMES) {
            assert.ok(LAND_BIRDS[id]?.length, id);

            for (const kind of LAND_BIRDS[id]) {
                assert.ok(BIRDS[kind], `${id}: ${kind}`);
            }
        }

        const flyers = new Flyers({ landAt: () => "meadow" });

        for (const mesh of flyers.meshes.values()) {
            const triangles = mesh.geometry.attributes.position.count / 3;

            assert.ok(triangles >= 12 && triangles <= 24, `${mesh.name}: ${triangles}`);
            assert.ok(mesh.geometry.attributes.wing && mesh.geometry.attributes.flap, mesh.name);
        }

        flyers.dispose();
    });

    it("sends flocks of the land's birds by now and then, never too many, gone once they're far off", () => {
        const flyers = new Flyers({ landAt: () => "beach", random: seeded(3) });
        const seen = new Set();
        let most = 0;

        for (let t = 0; t < 240; t += 0.1) {
            flyers.update(0.1, t, { x: 0, z: 0 });
            most = Math.max(most, flyers.flocks.length);
            flyers.flocks.forEach((flock) => seen.add(flock.kind));

            for (const flock of flyers.flocks) {
                assert.ok(Math.hypot(flock.x, flock.z) < FLYING.gone + 30, `${flock.kind} at ${flock.x.toFixed(0)}, ${flock.z.toFixed(0)}`);
                assert.ok(flock.y >= BIRDS[flock.kind].height[0] - 1 && flock.y <= BIRDS[flock.kind].height[1] + 1);
            }
        }

        assert.deepEqual([...seen], ["gull"]);
        assert.ok(most >= 1 && most <= FLYING.flocks, `at most ${most}`);
        assert.equal(flyers.meshes.get("gull").count, flyers.counts.birds);
        flyers.dispose();
    });

    it("sends a wyvern over the wild lands they hunt in now and then, and none over a meadow", () => {
        for (const [land, expected] of [["mountain", true], ["meadow", false]]) {
            const flyers = new Flyers({ landAt: () => land, random: seeded(7) });
            let wyverns = 0;

            for (let t = 0; t < 600; t += 0.1) {
                flyers.update(0.1, t, { x: 0, z: 0 });
                wyverns = Math.max(wyverns, flyers.aloft.filter(({ kind }) => kind === "wyvern").length);

                for (const flier of flyers.aloft) {
                    assert.ok(flier.y >= ALOFT.wyvern[0] && flier.y <= ALOFT.wyvern[1]);
                }
            }

            assert.equal(wyverns > 0, expected, land);
            assert.ok(wyverns <= 1);
            assert.ok(WYVERN_LANDS.includes(land) === expected);
            flyers.dispose();
        }
    });

    it("near a dragon's lair, the dragon circles within sight of the player; handed over to land, it's gone from the air", () => {
        let lairs = [{ at: [300, 0] }];
        const flyers = new Flyers({ landAt: () => "volcanic", lairs: () => lairs, random: seeded(11) });

        run(flyers, 60);

        const dragons = flyers.aloft.filter(({ kind }) => kind === "dragon");

        assert.equal(dragons.length, 1);

        const [dragon] = dragons;

        assert.ok(Math.hypot(dragon.x, dragon.z) < 130, `${dragon.x.toFixed(0)}, ${dragon.z.toFixed(0)}`);
        assert.ok(dragon.x > 0, "on its lair's side of the player");
        assert.ok(dragon.y >= ALOFT.dragon[0] && dragon.y <= ALOFT.dragon[1]);

        // (Coming down to land: where it is, and no longer in the air)
        const from = flyers.takeAloft("dragon", [dragon.x, dragon.z]);

        assert.deepEqual(from, [dragon.x, dragon.y, dragon.z]);
        assert.equal(flyers.aloft.filter(({ kind }) => kind === "dragon").length, 0);
        assert.equal(flyers.takeAloft("dragon", [0, 0]), null);

        // (Its lair far off, or its dragon slain or on the ground: it flies away and is gone)
        run(flyers, 10);
        lairs = [];
        flyers.send("dragon", { x: 0, z: 0 }, { circles: true });
        run(flyers, 60);
        assert.equal(flyers.aloft.filter(({ kind }) => kind === "dragon").length, 0);
        flyers.dispose();
    });

    it("hides them all indoors", () => {
        const flyers = new Flyers({ landAt: () => "meadow" });

        flyers.update(0.1, 0, { x: 0, z: 0 }, { outdoors: false });
        assert.equal(flyers.object.visible, false);
        flyers.update(0.1, 0, { x: 0, z: 0 }, { outdoors: true });
        assert.equal(flyers.object.visible, true);
        flyers.dispose();
    });
});

describe("winged creatures flying and landing (beast.js)", () => {
    it("comes down out of the sky to where its actor is, gliding lower all the way, and lands", () => {
        const wyvern = new BeastAvatar("wyvern", { seed: 3 });

        assert.equal(wyvern.winged, true);
        wyvern.place(10, 20, 0);
        wyvern.arrive({ from: [40, 30, 20], duration: 4 });

        let last = Infinity;

        for (let t = 0; t < 4.5; t += 1 / 60) {
            wyvern.update(1 / 60, 10, 20, 1);
            assert.ok(wyvern.object.position.y <= last + 1e-6, "lower all the way");
            last = wyvern.object.position.y;
        }

        assert.equal(wyvern.arriving, false);
        assert.deepEqual(wyvern.object.position.toArray().map((v) => Math.round(v * 100) / 100), [10, 0, 20]);
        assert.ok(Math.abs(wyvern.facing - 1) < 0.05, "facing the way its actor does");
    });

    it("soars where it's put, its wings spread; a creature without wings doesn't come down out of the sky", () => {
        const dragon = new BeastAvatar("dragon", { seed: 2 });

        dragon.soar(0.1, 5, 30, 7, 1.2, { beat: 0.6, bank: 0.3 });
        assert.deepEqual(dragon.object.position.toArray(), [5, 30, 7]);
        assert.ok(Math.abs(dragon.object.rotation.z - 0.3) < 1e-9 && Math.abs(dragon.object.rotation.y - 1.2) < 1e-9);

        const wolf = new BeastAvatar("wolf", { seed: 1 });

        wolf.place(0, 0, 0);
        wolf.arrive();
        assert.equal(wolf.winged, false);
        assert.equal(wolf.arriving, false);
    });
});
