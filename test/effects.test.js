import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

// Effects draws its blood spots on a canvas: a stand-in that takes every call and does nothing
const nothing = new Proxy(function () {}, { get: () => nothing, apply: () => nothing, set: () => true });

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => nothing }) };

const { Effects, LOOKS } = await import("../client/js/world/effects.js");

// A colour's hue (degrees), saturation and lightness
const hsl = (hex) => {
    const { h, s, l } = new THREE.Color(hex).getHSL({}, THREE.SRGBColorSpace);

    return { hue: h * 360, s, l };
};

describe("spell looks (effects.js)", () => {
    it("has five looks for fireballs, bolts, heals and stuns, each named, none the same as another", () => {
        for (const kind of ["fireball", "bolt", "heal", "stun"]) {
            const looks = LOOKS[kind];

            assert.equal(looks.length, 5, kind);
            assert.equal(new Set(looks.map((look) => look.name)).size, 5, `${kind}: named`);
            assert.equal(new Set(looks.map((look) => JSON.stringify({ ...look, name: null }))).size, 5, `${kind}: all different`);
        }
    });

    it("keeps every look like what it is: fireballs orange and red, bolts violet and blue, heals green", () => {
        const within = (hex, [low, high], what) => {
            const { hue, s } = hsl(hex);

            assert.ok(s > 0.4 && hue >= low && hue <= high, `${what}: hue ${hue.toFixed(0)}°`);
        };

        for (const look of LOOKS.fireball) {
            within(look.core, [0, 45], `${look.name} fireball`);
            [...look.trail.colours, ...look.burst.colours].forEach((colour) => within(colour, [0, 55], `${look.name} fireball's flames`));
            assert.ok(look.size >= 0.09 && look.size <= 0.18, look.name);
            assert.ok(look.burst.size >= 0.8 && look.burst.size <= 1.4, look.name);
        }

        for (const look of LOOKS.bolt) {
            within(look.core, [200, 300], `${look.name} bolt`);
            within(look.trail.colours[1], [200, 300], `${look.name} bolt's sparks`);
            within(look.burst.colours[1], [200, 300], `${look.name} bolt's burst`);
        }

        for (const look of LOOKS.heal) {
            within(look.charge[1], [80, 170], `${look.name} heal in the hand`);
            look.rings.forEach((colour) => within(colour, [70, 170], `${look.name} heal's rings`));

            if (look.burst.colours) {
                within(look.burst.colours[1], [70, 170], `${look.name} heal's light`);
            }
        }

        // Stars round a dazed head: bright, a few of them, close round it
        for (const look of LOOKS.stun) {
            assert.ok(look.stars >= 2 && look.stars <= 5, look.name);
            assert.ok(look.radius >= 0.18 && look.radius <= 0.32, look.name);
            look.colours.forEach((colour) => assert.ok(hsl(colour).l >= 0.6, `${look.name}: bright stars`));
        }
    });
});

describe("spell light (effects.js)", () => {
    let effects;

    before(() => {
        globalThis.performance ??= { now: () => Date.now() };
        effects = new Effects(new THREE.Scene());
    });

    // Fly a projectile in a look along a straight path; how far off the path its ball goes, most
    const flown = (id, kind, look) => {
        effects.launch(id, kind, new THREE.Vector3(0, 1.4, 0), look);

        let off = 0;

        for (let step = 1; step <= 30; step++) {
            effects.fly(id, new THREE.Vector3(0, 1.4, step * 0.25));

            const { position } = effects.flying.get(id).object;

            off = Math.max(off, Math.hypot(position.x, position.y - 1.4));
        }

        return { off, object: effects.flying.get(id).object };
    };

    it("flies each fireball and bolt in its own look: straight, spiralling, jittering, as twins or drawn out", () => {
        const look = (kind, name) => LOOKS[kind].findIndex((style) => style.name === name);
        const blaze = flown("blaze", "fireball", look("fireball", "blaze"));
        const spiral = flown("spiral", "fireball", look("fireball", "spiral"));
        const spark = flown("spark", "bolt", look("bolt", "spark"));
        const twin = flown("twin", "bolt", look("bolt", "twin"));
        const streak = flown("streak", "bolt", look("bolt", "streak"));

        assert.ok(blaze.off < 1e-6, "a blaze keeps to its path");
        assert.ok(Math.abs(spiral.off - LOOKS.fireball[look("fireball", "spiral")].spiral.radius) < 0.01, "a spiral circles it");
        assert.ok(spark.off > 0.01 && spark.off <= 0.07 * Math.SQRT2 + 1e-6, "a spark jitters about it");

        // Twins: two glowing balls (each with its halo), either side of the path
        const balls = twin.object.children.filter((child) => child.children.length);

        assert.equal(balls.length, 1);
        assert.ok(twin.off > 0.03);

        // A streak is drawn out the way it's going
        assert.ok(streak.object.scale.z > 2.5 * streak.object.scale.x);

        // Each trails its sparks or flames
        assert.ok(effects.glow.live.length > 0);
        assert.equal(effects.lookOf("spiral"), look("fireball", "spiral"));
        effects.land("spiral");
        assert.equal(effects.lookOf("spiral"), null);
    });

    it("bursts where a fireball hits in its look's colours, bigger for a roaring one", () => {
        const burst = (look) => {
            effects.glow.live.length = 0;
            effects.glow.free = Array.from({ length: 800 }, (_, i) => 799 - i);
            effects.impact("fire", new THREE.Vector3(0, 1, 0), null, look);

            return effects.glow.live.filter((particle) => particle.from.getHex() !== 0xfff1c4);
        };
        const roaring = LOOKS.fireball.findIndex((style) => style.name === "roaring");
        const comet = LOOKS.fireball.findIndex((style) => style.name === "comet");

        assert.equal(burst(roaring)[0].from.getHex(), new THREE.Color(LOOKS.fireball[roaring].burst.colours[0]).getHex());
        assert.ok(burst(roaring).length > burst(comet).length);
    });

    it("heals in rings on the ground, a second following the first for some looks; stuns with their stars", () => {
        LOOKS.heal.forEach((style, look) => {
            effects.pulses.forEach((pulse) => pulse.ring.removeFromParent());
            effects.pulses = [];
            effects.later = [];
            effects.heal({ x: 0, z: 0 }, 1.7, look);
            assert.equal(effects.pulses.length, 1, style.name);
            effects.update(0.3, 600);
            assert.equal(effects.pulses.length, style.rings.length, style.name);
            assert.equal(effects.pulses.at(-1).ring.material.color.getHex(), new THREE.Color(style.rings.at(-1)).getHex(), style.name);
        });

        LOOKS.stun.forEach((style, look) => {
            const head = new THREE.Object3D();

            effects.stun(new THREE.Vector3(0, 1.6, 0), head, 1.8, 2, look);

            const { stars } = effects.dazed.find((daze) => daze.object === head);

            assert.equal(stars.children.length, style.stars, style.name);
            assert.equal(stars.children[0].material.color.getHex(), new THREE.Color(style.colours[0]).getHex(), style.name);
        });
    });
});
