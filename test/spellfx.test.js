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

    it("closes a ward round the whole of whoever it's on (the user: 'Have them at least encapsulate the whole player character'): from under their feet to over their head, the taller the taller they are; rising round them first, then sealed with a flare", () => {
        const shellOn = (height) => {
            const fx = new SpellFx({ glow: { emit: () => {} }, dust: { emit: () => {} } }, new THREE.Scene());
            const feet = () => new THREE.Vector3(3, 0.5, -2);
            const one = { feet, point: () => new THREE.Vector3(3, 0.5 + height * 0.6, -2), hand: feet, height };

            fx.land("caster", "resistFire", { caster: one, target: one });

            const shell = fx.group.getObjectsByProperty("type", "Mesh").find(({ material }) => material.name === "wardShell");
            const span = () => {
                fx.group.updateMatrixWorld(true);

                return new THREE.Box3().setFromObject(shell);
            };
            const steps = (seconds) => {
                for (let time = 0; time < seconds; time += 1 / 30) {
                    fx.update(1 / 30);
                }
            };

            steps(0.3);

            const rising = shell.material.uniforms.reveal.value;

            steps(0.6);

            const sealed = { reveal: shell.material.uniforms.reveal.value, flare: shell.material.uniforms.flare.value, box: span() };

            steps(3);

            return { rising, ...sealed, gone: !fx.group.children.includes(shell.parent) };
        };

        for (const height of [1.7, 2.2]) {
            const { rising, reveal, flare, box, gone } = shellOn(height);

            assert.ok(rising > 0 && rising < 1, `rising round them: ${rising}`);
            assert.ok(reveal >= 1 && flare > 0, "sealed over their head, with a flare");
            assert.ok(box.min.y <= 0.5 && box.max.y >= 0.5 + height * 1.05, `from under their feet to over their head: ${box.min.y} to ${box.max.y}`);
            assert.ok(box.max.x - box.min.x >= 1.4 && box.max.z - box.min.z >= 1.4, "round all of them");
            assert.ok(Math.abs((box.min.x + box.max.x) / 2 - 3) < 0.01 && Math.abs((box.min.z + box.max.z) / 2 + 2) < 0.01, "on them");
            assert.ok(gone, "and gone after");
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

    it("burns the fire spells as fire (world/fire.js), a lick of it at the least to a column reaching the clouds at the greatest, each lighting what's round it", () => {
        const fire = Object.entries(SPELLS)
            .filter(([, spell]) => spell.school === "fire")
            .sort(([, a], [, b]) => a.tier - b.tier)
            .map(([id]) => {
                const effects = { glow: { emit: () => {} }, dust: { emit: () => {} } };
                const fx = new SpellFx(effects, new THREE.Scene(), { lights: [] });
                const at = (x, z, y = 0) => () => new THREE.Vector3(x, y, z);
                const one = (x, z) => ({ feet: at(x, z), point: at(x, z, 1.1), hand: at(x + 0.3, z, 1.2) });
                const seen = { tallest: 0, fires: 0, brightest: 0 };
                const blaze = fx.blaze.bind(fx);

                fx.blaze = (spot, settings) => {
                    seen.tallest = Math.max(seen.tallest, settings.height ?? 1);
                    seen.fires++;

                    return blaze(spot, settings);
                };
                fx.land("caster", id, { caster: one(0, 0), target: one(0, -4) });

                for (let time = 0; time < 1.5; time += 1 / 30) {
                    fx.update(1 / 30);

                    for (const light of fx.lightsNow()) {
                        seen.brightest = Math.max(seen.brightest, light.strength * light.fade);
                        assert.equal(light.priority, 1, `${id}: first of the lights near`);
                    }
                }

                // (Its own flames growing and dying away: a copy of the fires' material each)
                const flames = fx.group.children.filter((child) => child.name === "flames");

                assert.ok(flames.every((mesh) => mesh.material.uniforms.fireSize.value <= 1), id);

                for (let time = 0; time < 12; time += 1 / 30) {
                    fx.update(1 / 30);
                }

                assert.equal(fx.lightsNow().length, 0, `${id}: its lights out once it's done`);
                assert.equal(fx.group.children.filter((child) => child.name === "flames").length, 0, `${id}: its fire gone`);
                fx.clear();

                return { id, ...seen };
            });

        for (let k = 1; k < fire.length; k++) {
            const [lesser, greater] = [fire[k - 1], fire[k]];

            assert.ok(greater.tallest >= lesser.tallest || greater.fires > lesser.fires, `${greater.id} grander than ${lesser.id}`);
            assert.ok(greater.brightest >= lesser.brightest, `${greater.id} (${greater.brightest}) lights more than ${lesser.id} (${lesser.brightest})`);
        }

        assert.ok(fire[0].tallest <= 0.8 && fire[0].fires === 1, "burn: a lick of flame");
        assert.ok(fire.at(-1).tallest >= 20, "hellfire: a column reaching the clouds");
        assert.ok(fire.every(({ brightest }) => brightest > 0), "every one lighting what's round it");
    });

    // A fire spell cast (from its caster at 0, 0) and landing (on its target at 0, -4), played
    // through: the circles drawn round the caster's feet and where it lands ({ tier, radius }),
    // how dark the sky got and is at the end, the flames' bodies (fire.js fireBody), and the
    // circles' pictures made
    function fireSpell(id) {
        const fx = new SpellFx({ glow: { emit: () => {} }, dust: { emit: () => {} } }, new THREE.Scene(), { lights: [] });
        const at = (x, z, y = 0) => () => new THREE.Vector3(x, y, z);
        const one = (x, z) => ({ feet: at(x, z), point: at(x, z, 1.1), hand: at(x + 0.3, z, 1.2) });
        const seen = { cast: [], landed: [], darkest: 0, bodies: new Set() };
        const sigil = fx.sigil.bind(fx);
        const { castTime } = SPELLS[id];
        const step = () => {
            fx.update(1 / 30);
            seen.darkest = Math.max(seen.darkest, fx.darkness());

            for (const mesh of fx.group.children.filter((child) => child.name === "flames")) {
                seen.bodies.add(mesh.material.uniforms.fireBody.value);
            }
        };

        fx.sigil = (centre, settings) => {
            (centre.z === 0 ? seen.cast : seen.landed).push(settings);

            return sigil(centre, settings);
        };
        fx.cast("caster", id, { hand: one(0, 0).hand, feet: one(0, 0).feet, target: one(0, -4).feet, aim: one(0, -4).point, still: () => true, castTime });

        for (let time = 0; time < castTime / 1000; time += 1 / 30) {
            step();
        }

        fx.land("caster", id, { caster: one(0, 0), target: one(0, -4) });

        for (let time = 0; time < 12; time += 1 / 30) {
            step();
        }

        const left = { darkness: fx.darkness(), textures: Object.keys(fx.textures) };

        fx.clear();

        return { id, tier: SPELLS[id].tier, ...seen, ...left };
    }

    const FIRE_SPELLS = Object.entries(SPELLS)
        .filter(([, spell]) => spell.school === "fire")
        .sort(([, a], [, b]) => a.tier - b.tier)
        .map(([id]) => id);

    it("marks each fire spell as a spell (the user: 'The spell circle you had on the ground was a good motif. Maybe one that is increased by tier'): its own tier's circle round the caster's feet as it's cast and where it lands, wider tier by tier", () => {
        const spells = FIRE_SPELLS.map(fireSpell);
        const widest = (circles) => Math.max(0, ...circles.map(({ radius }) => radius));

        assert.equal(spells.length, 7);

        for (const { id, tier, cast, landed, textures } of spells) {
            assert.ok(cast.some((circle) => circle.tier === tier), `${id}: its circle round the caster's feet`);
            assert.ok(landed.some((circle) => circle.tier === tier), `${id}: its circle where it lands`);
            assert.ok(textures.includes(`sigil${tier}`), `${id}: its own tier's circle drawn`);
        }

        for (let k = 1; k < spells.length; k++) {
            const [lesser, greater] = [spells[k - 1], spells[k]];

            assert.ok(widest(greater.landed) > widest(lesser.landed), `${greater.id}'s circle wider than ${lesser.id}'s`);
            assert.ok(widest(greater.cast) > widest(lesser.cast), `${greater.id}'s caster's circle wider than ${lesser.id}'s`);
        }

        assert.ok(widest(spells[0].landed) < 1 && widest(spells.at(-1).landed) >= 12, "from under a metre (Burn) to a dozen (Hellfire)");
    });

    it("keeps the fire spells' colour by day (the user: 'Make sure the fire spells look good in the day too'): their flames bodies of fire (fire.js fireBody), and the sky darkening for the greatest, a little for Inferno, almost black for Hellfire, clearing once they're done", () => {
        for (const { id, tier, bodies, darkest, darkness } of FIRE_SPELLS.map(fireSpell)) {
            assert.deepEqual([...bodies], [1], `${id}: every flame a body of fire`);
            assert.equal(darkness, 0, `${id}: the sky clear again`);

            if (tier === 6) {
                assert.ok(darkest >= 0.3 && darkest <= 0.5, `${id}: the sky a little darker (${darkest})`);
            } else if (tier === 7) {
                assert.ok(darkest >= 0.8, `${id}: the sky almost black (${darkest})`);
            } else {
                assert.equal(darkest, 0, `${id}: the sky as it was`);
            }
        }
    });

    it("lights its flashes and fireballs in flight as lights of its own, not lending the view's lamps", () => {
        const fx = new SpellFx({ glow: { emit: () => {} }, dust: { emit: () => {} } }, new THREE.Scene(), { lights: [] });
        let [x, z] = [0, 0];

        fx.flash(new THREE.Vector3(1, 1, 1), { colour: 0xffffff, intensity: 30, distance: 9, life: 0.4 });
        assert.deepEqual(fx.lightsNow().map(({ strength, reach, fade, steady }) => [strength, reach, fade, steady]), [[28, 9, 1, 0]], "as bright as a flash may be, not flickering");
        fx.update(0.2);
        assert.ok(Math.abs(fx.lightsNow()[0].fade - 0.25) < 1e-9, "fading");
        fx.update(0.3);
        assert.equal(fx.lightsNow().length, 0);

        fx.throw("ball", () => new THREE.Vector3(0, 1, 0), () => new THREE.Vector3(x, 1, z), { travel: 0.5, light: { strength: 6, reach: 7 } });
        x = 4;
        z = -4;
        fx.update(0.25);

        const [ball] = fx.lightsNow();

        assert.ok(ball.x > 1 && ball.z < -1 && ball.strength === 6, "where the fireball is");
        fx.update(0.3);
        assert.equal(fx.lightsNow().length, 0, "out once it's landed");
        assert.equal(fx.group.children.filter((child) => child.isLight).length, 0, "no lights of its own added");
    });
});
