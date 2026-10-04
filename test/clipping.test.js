// What characters wear and carry kept out of their bodies (client/js/characters: equipment.js,
// items.js, actions.js, locomotion.js): each people's soldiers' shields, helms, quivers, tails and
// what they put away, the weapons they draw and put back, and the folk's tools, through standing,
// walking, running, their guard, their blows and flinches, and their rests, on the real body
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import { ATTACKS, DRAWS, RESTS } from "../client/js/characters/actions.js";
import { HumanData } from "../client/js/characters/body.js";
import { EQUIPMENT } from "../client/js/characters/equipment.js";
import { folkLook } from "../client/js/characters/folk.js";
import { dress, itemDepths } from "../client/js/characters/motioncheck.js";
import { ARMS, soldierLook } from "../client/js/characters/soldiers.js";
import { ROLES } from "../client/js/core/roles.js";

const manifest = JSON.parse(readFileSync(new URL("../client/characters/human.json", import.meta.url), "utf8"));
const unpacked = gunzipSync(readFileSync(new URL("../client/characters/human.bin", import.meta.url)));
const human = new HumanData(manifest, unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength));
// (Dressed and measured as the motion check does: characters/motioncheck.js)
const dressed = (look, options) => dress(human, look, options);
const depths = itemDepths;

// How far into the body anything may go (metres): what cloth over it (a mail sleeve, a surcoat)
// would hide
const SUNK = 0.012;

// Everything worn or carried, looked at over `seconds` every `every` s as the walker goes on (a
// frame at a time, as in the game at 30 frames a second: what eases in eases as it does there)
const FRAME = 1 / 30;

function through(who, { character, walker }, seconds, { speed = 0, every = 0.2 } = {}, label = "") {
    const worst = [];
    const frames = Math.ceil(every / FRAME - 1e-6);

    for (let t = 0; t < seconds - 1e-6; t += every) {
        for (let k = 0; k < frames; k++) {
            walker.update(every / frames, { speed });
        }

        for (const [name, { depth, bone }] of depths(character)) {
            if (depth > SUNK) {
                worst.push(`${who} ${label} at ${(t + every).toFixed(2)} s: ${name} ${(depth * 100).toFixed(1)} cm into the ${bone}`);
            }
        }
    }

    return worst;
}

// Each people's soldiers, with each of their arms, both sexes
const SOLDIERS = Object.entries(ARMS).flatMap(([people, arms]) => [...new Set(arms)].flatMap((weapon) => ["m", "f"].map((sex) => ({ people, weapon, sex, look: soldierLook({ people, weapon, sex, seed: 11, captain: sex === "m" }) }))));
const GUARD = { sword: "sword", bow: "bow", wand: "wand", staff: "staff", hammer: "hammer", cleaver: "cleaver", gauntlets: "punch" };

// The folk who carry things, as the game makes them (interiors.js, insides.js), and the guild's
// adventurers of each calling
const FOLK = [["barmaid", "f"], ["patron", "m"], ["patron", "f"], ["smith", "m"], ["smith", "f"], ["ruler", "m"], ["ruler", "f"], ["sentry", "m"], ["sentry", "f"]].map(([role, sex]) => ({ who: `${role} ${sex}`, role, look: folkLook({ role, sex, seed: 5 }) }));
const ADVENTURERS = ["warrior", "ranger", "mage", "rogue", "cleric"].flatMap((calling) => ["m", "f"].map((sex) => ({ who: `${calling} ${sex}`, role: "adventurer", look: folkLook({ role: "adventurer", look: calling, sex, seed: 5 }) })));

// On guard, the weapon drawn
function onGuard(look, weapon) {
    const fighting = dressed(look, { sheathed: false });

    fighting.actions.setWeapon(GUARD[weapon]);
    fighting.actions.setGuard(true);
    fighting.walker.update(1, { speed: 0 });

    return fighting;
}

describe("what's worn and carried kept out of the body (equipment.js, items.js, actions.js)", () => {
    it("carries each people's soldiers' shields, helms, quivers, tails and put-away arms clear of them, standing, walking and running", () => {
        const worst = SOLDIERS.flatMap(({ people, weapon, sex, look }) => {
            const who = `${people} ${weapon} ${sex}`;

            return [[0, "standing"], [1.3, "walking"], [3.5, "running"]].flatMap(([speed, label]) => through(who, dressed(look), speed ? 1.6 : 1, { speed, every: speed ? 0.1 : 0.5 }, label));
        });

        assert.deepEqual(worst, []);
    });

    it("holds a shield up before the body on guard, through every blow, cast and flinch, and carries it at the side through a sentry's rests", () => {
        // (One of each people's shield-bearers: the two sexes' builds are near alike)
        const shielded = SOLDIERS.filter(({ sex, look }) => sex === "f" && look.equipment.some((id) => /^left(Forearm|Fist)$/.test(EQUIPMENT[id]?.socket)));
        const worst = [];

        assert.ok(shielded.length >= 4, "(every people's who carry one)");

        for (const { people, weapon, sex, look } of shielded) {
            const who = `${people} ${weapon} ${sex}`;

            worst.push(...through(who, onGuard(look, weapon), 1.2, { speed: 1.3 }, "walking on guard"));

            for (const name of [GUARD[weapon], "castStun"]) {
                ATTACKS[name].variants.forEach(({ name: way }, variant) => {
                    const fighting = onGuard(look, weapon);

                    fighting.actions.startAttack(name, { hitAt: 0.5, duration: 1, variant });
                    worst.push(...through(who, fighting, 1, { every: 0.1 }, `${name} (${way})`));
                });
            }

            for (const reaction of ["slash", "crush", "pierce"]) {
                const fighting = onGuard(look, weapon);

                fighting.actions.react(reaction);
                worst.push(...through(who, fighting, 0.6, { every: 0.1 }, `flinching (${reaction})`));
            }

            RESTS.sentry.forEach(({ name: way }, variant) => {
                const resting = dressed(look);

                resting.actions.rest("sentry", { variant });
                worst.push(...through(who, resting, ROLES.sentry.rests[variant].duration, { every: 0.3 }, `resting (${way})`));
            });
        }

        assert.deepEqual(worst, []);
    });

    it("swings every weapon's blows and casts every spell clear of the body, and runs on guard with it", () => {
        // (One of each weapon's wielders: a lizard with a staff, an elf with a bow, a dark elf with
        // a wand, a cat with spiked gauntlets, the cleric with a war hammer; the shield-bearers'
        // blows are above)
        const picked = [["lizard", "staff"], ["elf", "bow"], ["darkElf", "wand"], ["cat", "gauntlets"]].map(([people, weapon]) => SOLDIERS.find((one) => one.people === people && one.weapon === weapon && one.sex === "f"));
        const wielders = [...picked, { people: "adventurer", weapon: "hammer", sex: "f", look: ADVENTURERS.find(({ who }) => who === "cleric f").look }];
        const worst = [];

        for (const { people, weapon, sex, look } of wielders) {
            const who = `${people} ${weapon} ${sex}`;

            worst.push(...through(who, onGuard(look, weapon), 1.2, { speed: 3.5, every: 0.1 }, "running on guard"));

            for (const name of [GUARD[weapon], "castHeal", "castStun"]) {
                ATTACKS[name].variants.forEach(({ name: way }, variant) => {
                    const fighting = onGuard(look, weapon);

                    fighting.actions.startAttack(name, { hitAt: 0.5, duration: 1, variant });
                    worst.push(...through(who, fighting, 1, { every: 0.1 }, `${name} (${way})`));
                });
            }
        }

        assert.ok(wielders.length >= 5, "(each weapon's)");
        assert.deepEqual(worst, []);
    });

    it("draws each people's weapons and puts them back without them passing through the body", () => {
        const worst = [];

        // (One of each people's soldiers with each of their arms: the two sexes' builds are near alike)
        for (const { people, weapon, sex, look } of SOLDIERS.filter(({ sex }) => sex === "f")) {
            const guard = GUARD[weapon];

            if (!DRAWS[guard]?.draw) {
                continue;
            }

            for (const on of [true, false]) {
                const fighting = on ? dressed(look) : onGuard(look, weapon);
                const how = DRAWS[guard][on ? "draw" : "sheathe"];

                fighting.character.sheathe(on);
                fighting.actions.draw(guard, on);
                // (On guard while armed, off guard once putting it away, as in the game)
                fighting.actions.setGuard(on);
                worst.push(...through(`${people} ${weapon} ${sex}`, fighting, how.duration, { every: 0.05 }, on ? "drawing" : "putting away"));
            }
        }

        assert.deepEqual(worst, []);
    });

    it("keeps the folk's tools and the adventurers' gear clear of them as they go about their business", () => {
        const worst = [];

        for (const { who, role, look } of [...FOLK, ...ADVENTURERS]) {
            worst.push(...through(who, dressed(look), 1.2, { speed: 1.3, every: 0.2 }, "walking"));

            ROLES[role].rests.forEach(({ name: way, duration }, variant) => {
                const resting = dressed(look);

                resting.actions.setSeated(Boolean(ROLES[role].seated));
                resting.actions.rest(role, { variant });
                worst.push(...through(who, resting, duration, { every: 0.3 }, `resting (${way})`));
            });
        }

        assert.deepEqual(worst, []);
    });
});
