import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

// The spells' textures are drawn on a canvas: a stand-in that takes every call and does nothing
const nothing = new Proxy(function () {}, { get: () => nothing, apply: () => nothing, set: () => true });

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => nothing }) };

const { SPELLS, SCHOOLS } = await import("../client/js/core/spells.js");
const { SpellFx, SPELL_LOOKS } = await import("../client/js/world/spellfx.js");

// A spell cast and landing, played through: how many particles it threw, how far across it reached
// (its widest ring, mark or scattering, metres), and how hard it washed the screen and shook it
function play(spell) {
    let particles = 0;
    const effects = { glow: { emit: (settings) => (particles += settings.count) }, dust: { emit: (settings) => (particles += settings.count) } };
    const fx = new SpellFx(effects, new THREE.Scene());
    const seen = { reach: 0, screen: 0, shake: 0 };
    const at = (x, z, y = 0) => () => new THREE.Vector3(x, y, z);
    const one = (x, z) => ({ feet: at(x, z), point: at(x, z, 1.1), hand: at(x + 0.3, z, 1.2) });
    const [caster, target] = [one(0, 0), one(0, -4)];

    fx.onScreen = (colour, strength) => (seen.screen = Math.max(seen.screen, strength));
    fx.onShake = (amount) => (seen.shake = Math.max(seen.shake, amount));

    for (const [method, reach] of [["ring", (_, { to }) => to], ["decal", (_, { radius }) => radius], ["scatter", (_, __, radius) => radius], ["spikes", (_, { radius }) => radius]]) {
        const own = fx[method].bind(fx);

        fx[method] = (...args) => {
            seen.reach = Math.max(seen.reach, reach(...args) ?? 0);

            return own(...args);
        };
    }

    const { castTime } = SPELLS[spell];

    fx.cast("caster", spell, { hand: caster.hand, feet: caster.feet, target: target.feet, aim: target.point, still: () => true, castTime });

    for (let time = 0; time < castTime / 1000; time += 1 / 30) {
        fx.update(1 / 30);
    }

    fx.land("caster", spell, { caster, target, struck: [one(2, -5)] });

    for (let time = 0; time < 12; time += 1 / 30) {
        fx.update(1 / 30);
    }

    // (What's still showing, besides its lights)
    const left = fx.running.length + fx.group.children.filter((child) => !child.isLight).length;

    fx.clear();

    return { ...seen, particles, left };
}

describe("how spells look (spellfx.js)", () => {
    it("has a look for every spell", () => {
        for (const id of Object.keys(SPELLS)) {
            assert.ok(SPELL_LOOKS[id], id);
        }
    });

    it("plays every spell's cast and landing through, leaving nothing behind", () => {
        for (const id of Object.keys(SPELLS)) {
            assert.equal(play(id).left, 0, id);
        }
    });

    it("makes each element's spells grander the higher their tier, the seventh filling the screen", () => {
        for (const school of ["fire", "earth", "air", "water"]) {
            const spells = Object.entries(SPELLS)
                .filter(([, spell]) => spell.school === school)
                .sort(([, a], [, b]) => a.tier - b.tier)
                .map(([id]) => ({ id, ...play(id) }));
            const [greatest, ...rest] = [spells.at(-1), ...spells.slice(0, -1)];

            assert.equal(SPELLS[greatest.id].tier, SCHOOLS[school].tiers.length, school);

            // (Out past the edges of the screen, the screen washed with its colour and shaking)
            assert.ok(greatest.reach >= 15, `${greatest.id}: reaches ${greatest.reach} m`);
            assert.ok(greatest.screen >= 0.4, `${greatest.id}: washes the screen ${greatest.screen}`);
            assert.ok(greatest.shake >= 0.3, `${greatest.id}: shakes ${greatest.shake}`);

            for (const lesser of rest) {
                assert.ok(greatest.reach >= lesser.reach * 2.5, `${greatest.id} reaches further than ${lesser.id}`);
                assert.ok(greatest.particles > lesser.particles * 1.5, `${greatest.id} (${greatest.particles}) is more than ${lesser.id} (${lesser.particles})`);
            }

            // (The first three tiers no more than a flash; from the fifth, the ground round them too)
            for (const { id, reach } of spells) {
                const { tier } = SPELLS[id];

                assert.ok(tier > 3 || reach < 3, `${id}: reaches ${reach} m`);
                assert.ok(tier < 5 || reach >= 2, `${id}: reaches ${reach} m`);
            }
        }
    });
});
