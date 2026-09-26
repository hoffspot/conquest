// Actions: movements layered over walking and standing (locomotion.js). They cover:
//  - attacking with each weapon, and standing on guard while fighting;
//  - flinching when hit, differently for each kind of blow (weapons.js: an attack's `reaction`),
//    and from the side it came from;
//  - falling down dead, and lying there;
//  - the tavern's folk: sitting on a bench, raising a tankard and drinking from it, putting one
//    down on a table, and drawing ale from a barrel;
//  - resting: how each role (roles.js: the barkeep, a serving wench, a patron, the madam, the
//    player's adventurer) passes the time, five ways each (RESTS).
//
// An attack is a few key poses timed round the moment that matters: key time 1 is when the blow
// lands (or the arrow or spell is let go: the weapon's hitAt), and 2 is when the attack ends (its
// duration), so the same keys fit an attack of any speed. Between keys everything follows a
// smooth curve through them (Catmull-Rom), and the attack eases in over whatever the character
// was doing and back out again at the end.
//
// A key pose says where the hands are and which way the weapon points; the arms reach there
// themselves (inverse kinematics: Rig.reach), so a sword swings through where an enemy stands
// whatever the body's size. A hand's place is `at` [x, y, z]: the grip, measured from its
// shoulder (which moves as the body twists and leans) in arm lengths, in the character's frame
// (x to its left, y up, z forward, towards whoever it's fighting). `point` is which way the
// weapon (or, empty, the thumb) points, and `edge` which way its edge (a blade's, the knuckles,
// a book's spine) faces. The other hand of a two-handed weapon holds it `on` metres further down. The spine,
// pelvis and the pelvis's `offset` (metres: x left, y up, z forward, which the legs bend to
// follow) are joint angles (rig.js), as are arms left to swing.
//
// A reaction is a function of time (0 to 1 over its length) and of where the blow came from,
// giving angles that are added to the pose, so a flinch during an attack still shows the attack.
// Each reaction's `effect` says what the world shows where the blow lands (world/effects.js).
//
// The Walker calls apply(dt) each frame after setting the walk's joints and before posing the
// bones (Walker.overlay), and place() once the feet are planted (Walker.afterPose), to reach
// the hands.

import * as THREE from "three";
import { ROLES } from "../core/roles.js";
import { Variety } from "../core/variety.js";
import { socketOn } from "./equipment.js";
import { jointRotation } from "./rig.js";

const DEG = Math.PI / 180;
const smooth = (edge0, edge1, x) => {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);
};

// Rises quickly to 1 at `peak` (fraction of the reaction), then settles back to 0 by the end
const pulse = (t, peak) => (t < peak ? smooth(0, peak, t) : 1 - smooth(peak, 1, t));

// The spine's share of a turn or bend, over its three bones
const spine = ({ flex = 0, turn = 0, bend = 0 }) => ({
    Spine: { flex: flex * 0.3, turn: turn * 0.25, bend: bend * 0.3 },
    Spine1: { flex: flex * 0.35, turn: turn * 0.35, bend: bend * 0.35 },
    Spine2: { flex: flex * 0.35, turn: turn * 0.4, bend: bend * 0.35 },
});

// --- Guards: how each weapon is held while fighting ---

const book = { at: [-0.3, -0.55, 0.6], point: [1, 0, 0], edge: [0, 0.35, 1] };
const tankard = { at: [0.12, -0.46, 0.5], point: [0, 1, 0.08] };

// Sitting on a bench: the thighs level and the shins upright, leaning a little over the table,
// the free arm resting on it; the pelvis lowered to the seat (SEAT: metres above the floor, and
// how far the hip joints sit above it) and back from the middle of the square
const SEAT = { height: 0.45, flesh: 0.1, back: 0.14 };
const SITTING = {
    LeftUpLeg: { flex: 88, abduct: 7 },
    RightUpLeg: { flex: 88, abduct: 7 },
    LeftLeg: { flex: 86 },
    RightLeg: { flex: 86 },
    LeftFoot: { flex: 2 },
    RightFoot: { flex: 2 },
    ...spine({ flex: 8 }),
    LeftArm: { flex: 38, abduct: 12 },
    LeftForeArm: { flex: 78, pronate: 40 },
};
const fist = (side) => ({ at: [side * 0.3, 0.02, 0.42], point: [side * 0.7, 0.3, 0], edge: [0, 0.3, 1] });

/** How each weapon is held while fighting, eased into when a fight starts. */
export const GUARDS = Object.freeze({
    sword: { right: { at: [0.25, -0.62, 0.62], point: [0.1, 0.75, 0.65], edge: [0, -0.65, 0.75] }, LeftArm: { flex: 15, abduct: 22 }, LeftForeArm: { flex: 55 } },
    staff: { right: { at: [0.22, -0.58, 0.62], point: [0.05, 0.65, 0.75], edge: [-1, 0, 0] }, left: { on: 0.42 } },
    wand: { right: { at: [0.15, -0.55, 0.65], point: [0.05, 0.55, 0.85], edge: [-1, 0, 0] }, LeftArm: { flex: 10, abduct: 18 }, LeftForeArm: { flex: 40 } },
    grimoire: { left: book, RightArm: { flex: 25, abduct: 18 }, RightForeArm: { flex: 70, pronate: 30 }, RightHand: { flex: -20 } },
    hammer: { right: { at: [0.2, -0.65, 0.55], point: [0.1, 0.75, 0.6], edge: [0, -0.6, 0.8] }, left: { on: 0.38 } },
    bow: { left: { at: [0.12, -0.75, 0.45], point: [0, 1, 0.2], edge: [0.3, 0, 1] }, RightArm: { flex: 10, abduct: 15 }, RightForeArm: { flex: 45 } },
    punch: { right: fist(1), left: fist(-1), ...spine({ flex: 6 }) },
    cleaver: { right: { at: [0.2, -0.6, 0.55], point: [0.1, 0.7, 0.7], edge: [0, -0.6, 0.8] }, LeftArm: { flex: 20, abduct: 25 }, LeftForeArm: { flex: 60 } },
});

// --- Attacks ---

// Where each attack starts and ends: the weapon's guard, the body square to the front
const rest = (guard, extra = {}) => ({ ...spine({}), Hips: { turn: 0 }, offset: [0, 0, 0], ...guard, ...extra });
const SWORD = rest(GUARDS.sword);
const STAFF = rest(GUARDS.staff);
const WAND = rest(GUARDS.wand);
const GRIMOIRE = rest(GUARDS.grimoire);
const HAMMER = rest(GUARDS.hammer);
const BOW = rest(GUARDS.bow, { Head: { turn: 0, flex: 0 } });
const PUNCH = rest(GUARDS.punch);
const CLEAVER = rest(GUARDS.cleaver);
const CAST = { ...spine({}), Head: { flex: 0 }, offset: [0, 0, 0] };

// One way of doing an action: its name and key poses, from and back to `start`
const variant = (name, start, ...keys) => ({ name, keys: [[0, start], ...keys, [2, start]] });

/**
 * Each weapon's attack (weapons.js: an attack's `animation`) and each spell's cast, in five ways
 * (`variants`: { name, keys }), so no two in a row look the same (the character picks one at
 * random, never the one it did last: variety.js). Each is key poses at key times, 1 when the blow
 * lands (or the arrow, bolt or spell is let go) and 2 at the end, starting and ending in the
 * weapon's guard. `alternate` mirrors every other attack (left and right punches).
 */
export const ATTACKS = Object.freeze({
    sword: {
        variants: [
            variant("diagonal slash", SWORD,
                // Up over the right shoulder, turning away...
                [0.62, { right: { at: [-0.2, 0.45, -0.1], point: [0.25, 0.55, -0.8], edge: [0.3, -0.3, 0.9] }, LeftArm: { flex: 25, abduct: 35 }, LeftForeArm: { flex: 45 }, ...spine({ turn: -26, bend: 6 }), Hips: { turn: 10 }, offset: [0, 0, -0.03] }],
                // ...down and across through the enemy, stepping into it
                [1, { right: { at: [0.35, -0.3, 0.85], point: [0.25, -0.15, 1], edge: [0.8, -0.5, 0] }, LeftArm: { flex: 5, abduct: 35 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 10, turn: 20, bend: -4 }), Hips: { turn: -12 }, offset: [0, -0.05, 0.08] }],
                [1.35, { right: { at: [0.7, -0.6, 0.5], point: [0.8, -0.5, 0.2], edge: [0.2, -0.6, -0.8] }, LeftArm: { flex: 0, abduct: 30 }, LeftForeArm: { flex: 35 }, ...spine({ flex: 12, turn: 26 }), Hips: { turn: -15 }, offset: [0, -0.06, 0.07] }]),
            variant("backhand slash", SWORD,
                // Drawn across to the left shoulder, then swept back out to the right
                [0.6, { right: { at: [0.55, 0.25, 0.15], point: [0.5, 0.5, -0.7], edge: [-0.6, -0.2, -0.5] }, LeftArm: { flex: 20, abduct: 30 }, LeftForeArm: { flex: 60 }, ...spine({ turn: 26, bend: -4 }), Hips: { turn: -8 }, offset: [0, 0, -0.03] }],
                [1, { right: { at: [-0.3, -0.25, 0.85], point: [-0.35, -0.1, 1], edge: [-0.85, -0.4, 0] }, LeftArm: { flex: 5, abduct: 40 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 8, turn: -22, bend: 4 }), Hips: { turn: 12 }, offset: [0, -0.04, 0.08] }],
                [1.35, { right: { at: [-0.7, -0.45, 0.45], point: [-0.9, -0.3, 0.1], edge: [-0.2, -0.6, -0.8] }, LeftArm: { flex: 0, abduct: 38 }, LeftForeArm: { flex: 35 }, ...spine({ flex: 10, turn: -28 }), Hips: { turn: 14 }, offset: [0, -0.05, 0.06] }]),
            variant("overhead cut", SWORD,
                // Raised high over the head, the blade back, then brought straight down
                [0.6, { right: { at: [0.1, 0.55, 0], point: [0.05, 0.3, -0.95], edge: [0, 0.95, 0.3] }, LeftArm: { flex: 60, abduct: 20 }, LeftForeArm: { flex: 90 }, ...spine({ flex: -10 }), offset: [0, 0.02, -0.04] }],
                [1, { right: { at: [0.15, -0.35, 0.85], point: [0.05, -0.2, 1], edge: [0, -1, 0.2] }, LeftArm: { flex: 20, abduct: 30 }, LeftForeArm: { flex: 45 }, ...spine({ flex: 18 }), offset: [0, -0.07, 0.1] }],
                [1.35, { right: { at: [0.15, -0.6, 0.7], point: [0.05, -0.55, 0.8], edge: [0, -0.8, -0.55] }, LeftArm: { flex: 15, abduct: 30 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 22 }), offset: [0, -0.08, 0.09] }]),
            variant("thrust", SWORD,
                // Drawn back to the hip, point forward, then lunged straight at the enemy
                [0.6, { right: { at: [-0.05, -0.5, 0.05], point: [0.1, 0.1, 1], edge: [-1, 0, 0.1] }, LeftArm: { flex: 30, abduct: 30 }, LeftForeArm: { flex: 70 }, ...spine({ turn: -20 }), Hips: { turn: 12 }, offset: [0, -0.02, -0.06] }],
                [1, { right: { at: [0.2, -0.15, 1.05], point: [0.05, 0.02, 1], edge: [-1, 0, 0] }, LeftArm: { flex: 0, abduct: 45 }, LeftForeArm: { flex: 25 }, ...spine({ flex: 8, turn: 22 }), Hips: { turn: -14 }, offset: [0, -0.07, 0.16] }],
                [1.35, { right: { at: [0.2, -0.18, 1], point: [0.05, 0, 1], edge: [-1, 0, 0] }, LeftArm: { flex: 0, abduct: 42 }, LeftForeArm: { flex: 28 }, ...spine({ flex: 8, turn: 20 }), Hips: { turn: -12 }, offset: [0, -0.07, 0.14] }]),
            variant("rising cut", SWORD,
                // Low behind on the right, then swept up and across
                [0.6, { right: { at: [-0.45, -0.7, 0.15], point: [-0.3, -0.55, -0.6], edge: [0.2, 0.9, 0] }, LeftArm: { flex: 15, abduct: 35 }, LeftForeArm: { flex: 50 }, ...spine({ flex: 12, turn: -24 }), Hips: { turn: 10 }, offset: [0, -0.06, -0.02] }],
                [1, { right: { at: [0.2, -0.1, 0.85], point: [0.3, 0.55, 0.75], edge: [0.35, 0.8, -0.4] }, LeftArm: { flex: 5, abduct: 40 }, LeftForeArm: { flex: 35 }, ...spine({ flex: 2, turn: 18, bend: -6 }), Hips: { turn: -10 }, offset: [0, -0.02, 0.07] }],
                [1.35, { right: { at: [0.45, 0.35, 0.5], point: [0.4, 0.85, 0.1], edge: [0.3, 0.2, -0.9] }, LeftArm: { flex: 5, abduct: 38 }, LeftForeArm: { flex: 35 }, ...spine({ flex: -4, turn: 24, bend: -8 }), Hips: { turn: -12 }, offset: [0, 0, 0.05] }]),
        ],
    },
    staff: {
        variants: [
            variant("overhead strike", STAFF,
                // Drawn back over the shoulder, then brought down on the enemy
                [0.6, { right: { at: [-0.1, 0.35, 0.05], point: [0.15, 0.55, -0.82], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ flex: -6, turn: -18 }), offset: [0, 0.01, -0.04] }],
                [1, { right: { at: [0.3, -0.3, 0.85], point: [0.05, -0.05, 1], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ flex: 16, turn: 12 }), offset: [0, -0.05, 0.08] }],
                [1.3, { right: { at: [0.3, -0.5, 0.75], point: [0.05, -0.4, 0.9], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ flex: 18, turn: 14 }), offset: [0, -0.06, 0.07] }]),
            variant("sweep", STAFF,
                // Swung back round to the right, then swept flat across
                [0.6, { right: { at: [-0.5, -0.25, 0.2], point: [-0.75, 0.2, -0.55], edge: [0, 1, 0] }, left: { on: 0.42 }, ...spine({ turn: -32 }), Hips: { turn: 12 }, offset: [0, -0.02, -0.03] }],
                [1, { right: { at: [0.15, -0.3, 0.7], point: [0.55, 0.1, 0.85], edge: [0, 1, 0] }, left: { on: 0.42 }, ...spine({ flex: 6, turn: 22 }), Hips: { turn: -12 }, offset: [0, -0.05, 0.08] }],
                [1.35, { right: { at: [0.5, -0.35, 0.45], point: [0.9, 0.05, 0.1], edge: [0, 1, 0] }, left: { on: 0.42 }, ...spine({ flex: 8, turn: 30 }), Hips: { turn: -15 }, offset: [0, -0.05, 0.06] }]),
            variant("thrust", STAFF,
                // Drawn back low, then driven head first at the enemy
                [0.6, { right: { at: [0.05, -0.55, 0.05], point: [0.05, 0.15, 1], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ turn: -14 }), offset: [0, -0.02, -0.07] }],
                [1, { right: { at: [0.15, -0.35, 0.8], point: [0.05, 0.05, 1], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ flex: 10, turn: 12 }), offset: [0, -0.07, 0.16] }],
                [1.3, { right: { at: [0.15, -0.37, 0.78], point: [0.05, 0.03, 1], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ flex: 10, turn: 10 }), offset: [0, -0.07, 0.14] }]),
            variant("rising strike", STAFF,
                // The head low behind, then swung up under the enemy's guard
                [0.6, { right: { at: [-0.35, -0.7, 0.15], point: [-0.3, -0.6, -0.7], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ flex: 14, turn: -18 }), offset: [0, -0.06, -0.02] }],
                [1, { right: { at: [0.2, -0.2, 0.7], point: [0.05, 0.65, 0.75], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ flex: 4, turn: 10 }), offset: [0, -0.03, 0.08] }],
                [1.35, { right: { at: [0.25, 0.05, 0.6], point: [0.05, 0.9, 0.4], edge: [-1, 0, 0] }, left: { on: 0.42 }, ...spine({ flex: -4, turn: 12 }), offset: [0, -0.01, 0.06] }]),
            variant("spinning strike", STAFF,
                // Wound far round to the right, then the whole body turns into the blow
                [0.5, { right: { at: [-0.4, -0.1, -0.1], point: [-0.6, 0.35, -0.7], edge: [0, 1, 0] }, left: { on: 0.42 }, ...spine({ turn: -45, flex: -4 }), Hips: { turn: 25 }, offset: [0, 0, -0.04] }],
                [1, { right: { at: [0.1, -0.15, 0.8], point: [0.45, 0.3, 0.85], edge: [0, 1, 0] }, left: { on: 0.42 }, ...spine({ flex: 8, turn: 30 }), Hips: { turn: -25 }, offset: [0, -0.05, 0.1] }],
                [1.35, { right: { at: [0.55, -0.3, 0.35], point: [0.95, 0.15, -0.1], edge: [0, 1, 0] }, left: { on: 0.42 }, ...spine({ flex: 8, turn: 40 }), Hips: { turn: -30 }, offset: [0, -0.05, 0.07] }]),
        ],
    },
    wand: {
        variants: [
            variant("flick", WAND,
                // Tip up and back, then flicked at the enemy
                [0.65, { right: { at: [-0.1, 0.3, 0.3], point: [0, 0.75, -0.65], edge: [-1, 0, 0] }, ...spine({ turn: -10, flex: -4 }) }],
                [1, { right: { at: [0.12, -0.05, 1.02], point: [0.05, 0.02, 1], edge: [-1, 0, 0] }, ...spine({ turn: 8, flex: 4 }) }],
                [1.45, { right: { at: [0.12, -0.1, 0.98], point: [0.05, -0.08, 1], edge: [-1, 0, 0] }, ...spine({ turn: 8, flex: 4 }) }]),
            variant("jab", WAND,
                // Drawn in to the chest, then jabbed straight out
                [0.6, { right: { at: [0.05, -0.3, 0.35], point: [0, 0.35, 0.9], edge: [-1, 0, 0] }, ...spine({ turn: -8 }), offset: [0, 0, -0.03] }],
                [1, { right: { at: [0.12, -0.02, 1.05], point: [0.02, 0.02, 1], edge: [-1, 0, 0] }, ...spine({ turn: 10, flex: 4 }), offset: [0, -0.02, 0.06] }],
                [1.4, { right: { at: [0.12, -0.04, 1.02], point: [0.02, 0, 1], edge: [-1, 0, 0] }, ...spine({ turn: 10, flex: 4 }), offset: [0, -0.02, 0.05] }]),
            variant("circle", WAND,
                // A circle traced in the air, then pointed
                [0.3, { right: { at: [-0.1, -0.2, 0.65], point: [0, 0.7, 0.7], edge: [-1, 0, 0] }, ...spine({ turn: -4 }) }],
                [0.5, { right: { at: [0.1, 0.12, 0.62], point: [0.2, 0.9, 0.3], edge: [-1, 0, 0] }, ...spine({ turn: 2, flex: -3 }) }],
                [0.75, { right: { at: [0.28, -0.15, 0.58], point: [0.3, 0.6, 0.7], edge: [-1, 0, 0] }, ...spine({ turn: 6 }) }],
                [1, { right: { at: [0.1, -0.05, 1.02], point: [0.03, 0.02, 1], edge: [-1, 0, 0] }, ...spine({ turn: 8, flex: 4 }) }],
                [1.4, { right: { at: [0.1, -0.08, 0.98], point: [0.03, -0.05, 1], edge: [-1, 0, 0] }, ...spine({ turn: 8, flex: 4 }) }]),
            variant("flourish", WAND,
                // Raised high overhead, then snapped down to point
                [0.65, { right: { at: [0.05, 0.55, 0.25], point: [0, 0.9, -0.4], edge: [-1, 0, 0] }, ...spine({ flex: -8 }), offset: [0, 0.02, -0.02] }],
                [1, { right: { at: [0.12, -0.12, 1], point: [0.03, -0.12, 1], edge: [-1, 0, 0] }, ...spine({ flex: 8, turn: 6 }), offset: [0, -0.03, 0.05] }],
                [1.4, { right: { at: [0.12, -0.2, 0.95], point: [0.03, -0.2, 0.98], edge: [-1, 0, 0] }, ...spine({ flex: 8, turn: 6 }), offset: [0, -0.03, 0.04] }]),
            variant("low sweep", WAND,
                // Swept up from low at the side
                [0.65, { right: { at: [-0.3, -0.7, 0.4], point: [-0.2, -0.5, 0.85], edge: [-1, 0, 0] }, ...spine({ flex: 10, turn: -12 }), offset: [0, -0.04, 0] }],
                [1, { right: { at: [0.15, 0.02, 1], point: [0.05, 0.1, 1], edge: [-1, 0, 0] }, ...spine({ turn: 10 }), offset: [0, -0.01, 0.05] }],
                [1.4, { right: { at: [0.15, 0, 0.96], point: [0.05, 0.08, 1], edge: [-1, 0, 0] }, ...spine({ turn: 10 }), offset: [0, -0.01, 0.04] }]),
        ],
    },
    grimoire: {
        variants: [
            variant("throw from the palm", GRIMOIRE,
                // Gathering the fire in the hand, drawn back by the shoulder, then thrown
                [0.55, { left: book, right: { at: [-0.25, 0.05, 0.3], point: [1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ turn: -18, flex: -5 }), offset: [0, 0.01, -0.03] }],
                [0.85, { left: book, right: { at: [-0.22, 0.08, 0.25], point: [1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ turn: -20, flex: -6 }), offset: [0, 0.01, -0.035] }],
                [1, { left: book, right: { at: [0.12, -0.02, 1.02], point: [1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ turn: 12, flex: 8 }), offset: [0, -0.03, 0.07] }],
                [1.5, { left: book, right: { at: [0.12, -0.06, 0.98], point: [1, 0, 0], edge: [0, 1, 0.2] }, ...spine({ turn: 10, flex: 8 }), offset: [0, -0.03, 0.06] }]),
            variant("overhand hurl", GRIMOIRE,
                // Up by the ear, then hurled forward and down
                [0.55, { left: book, right: { at: [-0.15, 0.35, 0], point: [1, 0, 0], edge: [0, 0.6, -0.8] }, ...spine({ turn: -20, flex: -8 }), offset: [0, 0.02, -0.04] }],
                [1, { left: book, right: { at: [0.12, 0, 1], point: [1, 0, 0], edge: [0, 1, 0.2] }, ...spine({ turn: 14, flex: 10 }), offset: [0, -0.04, 0.08] }],
                [1.5, { left: book, right: { at: [0.18, -0.3, 0.85], point: [1, 0, 0], edge: [0, 0.8, 0.5] }, ...spine({ turn: 14, flex: 12 }), offset: [0, -0.04, 0.06] }]),
            variant("side-arm", GRIMOIRE,
                // Down by the right hip, then swung round and let go
                [0.55, { left: book, right: { at: [-0.5, -0.4, 0.1], point: [1, 0, 0.3], edge: [0, 1, 0] }, ...spine({ turn: -28 }), Hips: { turn: 10 }, offset: [0, -0.01, -0.03] }],
                [1, { left: book, right: { at: [0.15, -0.1, 1], point: [1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ turn: 18, flex: 6 }), Hips: { turn: -10 }, offset: [0, -0.03, 0.07] }],
                [1.5, { left: book, right: { at: [0.4, -0.2, 0.8], point: [1, 0, 0], edge: [0, 1, 0.3] }, ...spine({ turn: 22, flex: 6 }), Hips: { turn: -12 }, offset: [0, -0.03, 0.05] }]),
            variant("palm push", GRIMOIRE,
                // Drawn in to the chest, the fire growing, then pushed out at arm's length
                [0.55, { left: book, right: { at: [0.05, -0.1, 0.2], point: [1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ flex: -3 }), offset: [0, 0, -0.03] }],
                [0.8, { left: book, right: { at: [0.08, -0.12, 0.15], point: [1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ flex: -4 }), offset: [0, 0, -0.04] }],
                [1, { left: book, right: { at: [0.1, -0.02, 1.05], point: [1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ flex: 6 }), offset: [0, -0.03, 0.08] }],
                [1.5, { left: book, right: { at: [0.1, -0.05, 1], point: [1, 0, 0], edge: [0, 1, 0.2] }, ...spine({ flex: 6 }), offset: [0, -0.03, 0.07] }]),
            variant("underhand lob", GRIMOIRE,
                // Cupped low, then lobbed up and out
                [0.55, { left: book, right: { at: [-0.2, -0.65, 0.15], point: [1, 0, 0], edge: [0, 0.3, 1] }, ...spine({ flex: 10, turn: -12 }), offset: [0, -0.04, -0.02] }],
                [1, { left: book, right: { at: [0.1, 0.1, 0.95], point: [1, 0, 0], edge: [0, 0.6, 0.8] }, ...spine({ flex: -4, turn: 10 }), offset: [0, 0, 0.06] }],
                [1.5, { left: book, right: { at: [0.12, 0.15, 0.9], point: [1, 0, 0], edge: [0, 0.7, 0.7] }, ...spine({ flex: -4, turn: 10 }), offset: [0, 0, 0.05] }]),
        ],
    },
    hammer: {
        variants: [
            variant("overhead smash", HAMMER,
                // High over the head, arching back, then down with the whole body onto the enemy
                [0.6, { right: { at: [0.1, 0.55, -0.05], point: [0.05, 0.25, -0.97], edge: [0, -1, -0.2] }, left: { on: 0.38 }, ...spine({ flex: -12 }), offset: [0, 0.02, -0.05] }],
                [1, { right: { at: [0.25, -0.2, 0.85], point: [0.05, 0.05, 1], edge: [0, -1, 0] }, left: { on: 0.38 }, ...spine({ flex: 18 }), offset: [0, -0.1, 0.1] }],
                [1.35, { right: { at: [0.25, -0.6, 0.7], point: [0.05, -0.55, 0.85], edge: [0, -0.85, -0.55] }, left: { on: 0.38 }, ...spine({ flex: 28 }), offset: [0, -0.14, 0.1] }]),
            variant("side swing", HAMMER,
                // Swung back round to the right, then flat into the enemy's side
                [0.6, { right: { at: [-0.55, -0.15, -0.05], point: [-0.7, 0.25, -0.65], edge: [0.6, 0, -0.75] }, left: { on: 0.38 }, ...spine({ turn: -35 }), Hips: { turn: 15 }, offset: [0, -0.02, -0.04] }],
                [1, { right: { at: [0.15, -0.3, 0.8], point: [0.45, 0.05, 0.9], edge: [0.9, 0, -0.4] }, left: { on: 0.38 }, ...spine({ flex: 8, turn: 25 }), Hips: { turn: -18 }, offset: [0, -0.06, 0.08] }],
                [1.35, { right: { at: [0.5, -0.45, 0.4], point: [0.9, -0.1, 0.1], edge: [0.1, 0, -1] }, left: { on: 0.38 }, ...spine({ flex: 12, turn: 35 }), Hips: { turn: -20 }, offset: [0, -0.07, 0.06] }]),
            variant("diagonal chop", HAMMER,
                // Up over the right shoulder, then down and across
                [0.6, { right: { at: [-0.35, 0.45, -0.05], point: [-0.35, 0.5, -0.8], edge: [0.3, -0.9, 0.2] }, left: { on: 0.38 }, ...spine({ turn: -22, flex: -8 }), Hips: { turn: 10 }, offset: [0, 0.01, -0.04] }],
                [1, { right: { at: [0.25, -0.35, 0.8], point: [0.25, -0.25, 0.93], edge: [0.3, -0.95, 0] }, left: { on: 0.38 }, ...spine({ flex: 20, turn: 15 }), Hips: { turn: -10 }, offset: [0, -0.1, 0.1] }],
                [1.35, { right: { at: [0.35, -0.65, 0.6], point: [0.35, -0.7, 0.6], edge: [0.2, -0.6, -0.75] }, left: { on: 0.38 }, ...spine({ flex: 26, turn: 18 }), Hips: { turn: -12 }, offset: [0, -0.12, 0.09] }]),
            variant("upswing", HAMMER,
                // Low behind, then swung up under the enemy's chin
                [0.6, { right: { at: [-0.35, -0.8, 0], point: [-0.3, -0.75, -0.6], edge: [0, 0.6, 0.8] }, left: { on: 0.38 }, ...spine({ flex: 18, turn: -15 }), offset: [0, -0.1, -0.03] }],
                [1, { right: { at: [0.15, -0.1, 0.8], point: [0.05, 0.6, 0.8], edge: [0, 0.8, -0.6] }, left: { on: 0.38 }, ...spine({ flex: -2, turn: 10 }), offset: [0, 0, 0.08] }],
                [1.35, { right: { at: [0.2, 0.2, 0.6], point: [0, 0.95, 0.3], edge: [0, 0.3, -0.95] }, left: { on: 0.38 }, ...spine({ flex: -6, turn: 12 }), offset: [0, 0.01, 0.06] }]),
            variant("leaping slam", HAMMER,
                // Rising up on the toes with it high overhead, then slammed down, crouching into it
                [0.55, { right: { at: [0.1, 0.65, -0.1], point: [0.05, 0.1, -0.99], edge: [0, -1, -0.1] }, left: { on: 0.38 }, ...spine({ flex: -16 }), offset: [0, 0.05, -0.06] }],
                [1, { right: { at: [0.25, -0.35, 0.85], point: [0.05, -0.1, 1], edge: [0, -1, 0] }, left: { on: 0.38 }, ...spine({ flex: 26 }), offset: [0, -0.16, 0.14] }],
                [1.4, { right: { at: [0.25, -0.7, 0.65], point: [0.05, -0.7, 0.7], edge: [0, -0.7, -0.7] }, left: { on: 0.38 }, ...spine({ flex: 32 }), offset: [0, -0.18, 0.12] }]),
        ],
    },
    bow: {
        variants: [
            variant("side-on draw", BOW,
                // Up and nocked, side on to the target, the bow at arm's length towards it...
                [0.3, { left: { at: [0.05, 0.05, 1], point: [0, 1, 0.1], edge: [0, 0, 1] }, right: { at: [0.45, 0.08, 0.95] }, RightArm: { flex: 90, abduct: 30 }, RightForeArm: { flex: 90 }, ...spine({ turn: -40 }), Head: { turn: 32, flex: 0 }, offset: [0, 0, 0] }],
                // ...drawn to the chin as the arrow is loosed...
                [1, { left: { at: [0.05, 0.05, 1.02], point: [0, 1, 0.1], edge: [0, 0, 1] }, right: { at: [0.3, 0.28, 0.2] }, RightArm: { flex: 90, abduct: 70 }, RightForeArm: { flex: 140 }, ...spine({ turn: -42, flex: -3 }), Head: { turn: 34, flex: 0 }, offset: [0, -0.02, 0] }],
                // ...and the drawing hand flies back past the ear
                [1.15, { left: { at: [0.05, 0.04, 1.02], point: [0, 1, 0.1], edge: [0, 0, 1] }, right: { at: [0.05, 0.3, -0.12] }, RightArm: { flex: 85, abduct: 85 }, RightForeArm: { flex: 120 }, ...spine({ turn: -42, flex: -3 }), Head: { turn: 34, flex: 0 }, offset: [0, -0.02, 0] }],
                [1.5, { left: { at: [0.05, -0.05, 0.95], point: [0, 1, 0.12], edge: [0, 0, 1] }, right: { at: [0.05, 0.1, -0.05] }, RightArm: { flex: 70, abduct: 80 }, RightForeArm: { flex: 110 }, ...spine({ turn: -36 }), Head: { turn: 28, flex: 0 }, offset: [0, -0.01, 0] }]),
            variant("high draw", BOW,
                // Raised high and drawn back to the ear, leaning back into it
                [0.3, { left: { at: [0.05, 0.22, 0.95], point: [0, 1, 0.05], edge: [0, 0, 1] }, right: { at: [0.45, 0.25, 0.9] }, RightArm: { flex: 110, abduct: 35 }, RightForeArm: { flex: 95 }, ...spine({ turn: -38, flex: -8 }), Head: { turn: 30, flex: -6 }, offset: [0, 0, -0.02] }],
                [1, { left: { at: [0.05, 0.24, 0.98], point: [0, 1, 0.05], edge: [0, 0, 1] }, right: { at: [0.3, 0.45, 0.2] }, RightArm: { flex: 110, abduct: 75 }, RightForeArm: { flex: 140 }, ...spine({ turn: -40, flex: -8 }), Head: { turn: 32, flex: -6 }, offset: [0, -0.01, -0.02] }],
                [1.15, { left: { at: [0.05, 0.23, 0.98], point: [0, 1, 0.05], edge: [0, 0, 1] }, right: { at: [0.05, 0.45, -0.1] }, RightArm: { flex: 105, abduct: 90 }, RightForeArm: { flex: 120 }, ...spine({ turn: -40, flex: -8 }), Head: { turn: 32, flex: -6 }, offset: [0, -0.01, -0.02] }],
                [1.5, { left: { at: [0.05, 0.05, 0.95], point: [0, 1, 0.1], edge: [0, 0, 1] }, right: { at: [0.05, 0.2, -0.05] }, RightArm: { flex: 80, abduct: 80 }, RightForeArm: { flex: 110 }, ...spine({ turn: -34, flex: -4 }), Head: { turn: 26, flex: -3 }, offset: [0, 0, -0.01] }]),
            variant("snap shot", BOW,
                // A quick half draw, hardly turning
                [0.3, { left: { at: [0.08, -0.05, 0.95], point: [0, 1, 0.12], edge: [0, 0, 1] }, right: { at: [0.35, 0, 0.85] }, RightArm: { flex: 80, abduct: 30 }, RightForeArm: { flex: 90 }, ...spine({ turn: -25 }), Head: { turn: 20, flex: 0 }, offset: [0, 0, 0] }],
                [1, { left: { at: [0.08, -0.04, 0.98], point: [0, 1, 0.12], edge: [0, 0, 1] }, right: { at: [0.28, 0.15, 0.35] }, RightArm: { flex: 90, abduct: 55 }, RightForeArm: { flex: 120 }, ...spine({ turn: -28 }), Head: { turn: 22, flex: 0 }, offset: [0, -0.01, 0] }],
                [1.15, { left: { at: [0.08, -0.05, 0.98], point: [0, 1, 0.12], edge: [0, 0, 1] }, right: { at: [0.2, 0.2, 0.1] }, RightArm: { flex: 85, abduct: 70 }, RightForeArm: { flex: 115 }, ...spine({ turn: -28 }), Head: { turn: 22, flex: 0 }, offset: [0, -0.01, 0] }],
                [1.5, { left: { at: [0.08, -0.15, 0.92], point: [0, 1, 0.15], edge: [0, 0, 1] }, right: { at: [0.1, 0.05, 0] }, RightArm: { flex: 60, abduct: 60 }, RightForeArm: { flex: 100 }, ...spine({ turn: -22 }), Head: { turn: 18, flex: 0 }, offset: [0, 0, 0] }]),
            variant("crouching shot", BOW,
                // Dropping low on bent knees to draw and loose
                [0.3, { left: { at: [0.05, 0.05, 1], point: [0, 1, 0.1], edge: [0, 0, 1] }, right: { at: [0.45, 0.08, 0.95] }, RightArm: { flex: 90, abduct: 30 }, RightForeArm: { flex: 90 }, ...spine({ turn: -38, flex: 6 }), Head: { turn: 30, flex: -6 }, offset: [0, -0.2, -0.03] }],
                [1, { left: { at: [0.05, 0.08, 1.02], point: [0, 1, 0.1], edge: [0, 0, 1] }, right: { at: [0.3, 0.3, 0.2] }, RightArm: { flex: 90, abduct: 70 }, RightForeArm: { flex: 140 }, ...spine({ turn: -40, flex: 6 }), Head: { turn: 32, flex: -8 }, offset: [0, -0.24, -0.03] }],
                [1.15, { left: { at: [0.05, 0.07, 1.02], point: [0, 1, 0.1], edge: [0, 0, 1] }, right: { at: [0.05, 0.3, -0.12] }, RightArm: { flex: 85, abduct: 85 }, RightForeArm: { flex: 120 }, ...spine({ turn: -40, flex: 6 }), Head: { turn: 32, flex: -8 }, offset: [0, -0.24, -0.03] }],
                [1.5, { left: { at: [0.05, -0.05, 0.95], point: [0, 1, 0.12], edge: [0, 0, 1] }, right: { at: [0.05, 0.1, -0.05] }, RightArm: { flex: 70, abduct: 80 }, RightForeArm: { flex: 110 }, ...spine({ turn: -34, flex: 3 }), Head: { turn: 26, flex: -4 }, offset: [0, -0.12, -0.02] }]),
            variant("canted draw", BOW,
                // The bow tipped over on its side, drawn to the cheek
                [0.3, { left: { at: [0.02, 0, 1], point: [0.6, 0.8, 0.1], edge: [0, 0, 1] }, right: { at: [0.4, 0.05, 0.92] }, RightArm: { flex: 85, abduct: 30 }, RightForeArm: { flex: 90 }, ...spine({ turn: -34, bend: -6 }), Head: { turn: 28, flex: 0 }, offset: [0, 0, 0] }],
                [1, { left: { at: [0.02, 0.02, 1.02], point: [0.6, 0.8, 0.1], edge: [0, 0, 1] }, right: { at: [0.32, 0.22, 0.22] }, RightArm: { flex: 85, abduct: 65 }, RightForeArm: { flex: 138 }, ...spine({ turn: -36, bend: -6 }), Head: { turn: 30, flex: 0 }, offset: [0, -0.02, 0] }],
                [1.15, { left: { at: [0.02, 0.01, 1.02], point: [0.6, 0.8, 0.1], edge: [0, 0, 1] }, right: { at: [0.08, 0.25, -0.1] }, RightArm: { flex: 80, abduct: 80 }, RightForeArm: { flex: 120 }, ...spine({ turn: -36, bend: -6 }), Head: { turn: 30, flex: 0 }, offset: [0, -0.02, 0] }],
                [1.5, { left: { at: [0.05, -0.05, 0.95], point: [0.3, 0.95, 0.1], edge: [0, 0, 1] }, right: { at: [0.05, 0.1, -0.05] }, RightArm: { flex: 70, abduct: 80 }, RightForeArm: { flex: 110 }, ...spine({ turn: -30, bend: -3 }), Head: { turn: 26, flex: 0 }, offset: [0, -0.01, 0] }]),
        ],
    },
    punch: {
        alternate: true,
        variants: [
            variant("straight", PUNCH,
                // A little pulled back, then straight out, turning into it
                [0.5, { right: { at: [0.25, -0.05, 0.3], point: [0.7, 0.3, 0], edge: [0, 0.3, 1] }, left: fist(-1), ...spine({ flex: 6, turn: -10 }), Hips: { turn: 6 }, offset: [0, -0.01, -0.02] }],
                [1, { right: { at: [0.26, 0.04, 1.03], point: [0.9, 0, 0.1], edge: [0, 0, 1] }, left: fist(-1), ...spine({ flex: 8, turn: 20 }), Hips: { turn: -12 }, offset: [0, -0.03, 0.06] }],
                [1.4, { right: { at: [0.28, 0, 0.75], point: [0.85, 0.15, 0.1], edge: [0, 0.15, 1] }, left: fist(-1), ...spine({ flex: 7, turn: 10 }), Hips: { turn: -6 }, offset: [0, -0.02, 0.03] }]),
            variant("hook", PUNCH,
                // Out wide, then round into the side of the head
                [0.5, { right: { at: [-0.3, -0.05, 0.3], point: [0.6, 0.3, 0.3], edge: [0, 0.3, 1] }, left: fist(-1), ...spine({ flex: 6, turn: -18 }), Hips: { turn: 8 }, offset: [0, -0.01, -0.02] }],
                [1, { right: { at: [0.12, 0.02, 0.85], point: [0.95, 0.1, -0.2], edge: [0.2, 0, 1] }, left: fist(-1), ...spine({ flex: 6, turn: 28 }), Hips: { turn: -14 }, offset: [0, -0.03, 0.05] }],
                [1.4, { right: { at: [0.4, 0, 0.6], point: [0.9, 0.2, -0.3], edge: [0.3, 0.1, 1] }, left: fist(-1), ...spine({ flex: 6, turn: 30 }), Hips: { turn: -15 }, offset: [0, -0.03, 0.04] }]),
            variant("uppercut", PUNCH,
                // Dipping low, then driven up under the chin
                [0.5, { right: { at: [0, -0.55, 0.3], point: [0.6, -0.1, 0.4], edge: [0, 0.3, 1] }, left: fist(-1), ...spine({ flex: 12, turn: -10 }), Hips: { turn: 6 }, offset: [0, -0.06, 0] }],
                [1, { right: { at: [0.18, 0.12, 0.72], point: [0.5, 0.8, 0.1], edge: [0, 0.2, 1] }, left: fist(-1), ...spine({ flex: -4, turn: 16 }), Hips: { turn: -10 }, offset: [0, 0.01, 0.05] }],
                [1.4, { right: { at: [0.2, 0.18, 0.6], point: [0.5, 0.85, 0], edge: [0, 0.1, 1] }, left: fist(-1), ...spine({ flex: -4, turn: 14 }), Hips: { turn: -8 }, offset: [0, 0.01, 0.04] }]),
            variant("body blow", PUNCH,
                // Low and hard into the belly, bending into it
                [0.5, { right: { at: [0.2, -0.3, 0.25], point: [0.7, 0.3, 0], edge: [0, 0.3, 1] }, left: fist(-1), ...spine({ flex: 14, turn: -10 }), Hips: { turn: 6 }, offset: [0, -0.06, -0.02] }],
                [1, { right: { at: [0.25, -0.38, 0.95], point: [0.9, 0.2, 0], edge: [0, 0.1, 1] }, left: fist(-1), ...spine({ flex: 16, turn: 18 }), Hips: { turn: -10 }, offset: [0, -0.08, 0.07] }],
                [1.4, { right: { at: [0.25, -0.35, 0.7], point: [0.85, 0.25, 0], edge: [0, 0.15, 1] }, left: fist(-1), ...spine({ flex: 14, turn: 10 }), Hips: { turn: -6 }, offset: [0, -0.06, 0.04] }]),
            variant("overhand", PUNCH,
                // Looping up and over, then down onto the head
                [0.5, { right: { at: [-0.25, 0.3, 0.15], point: [0.5, 0.6, -0.2], edge: [0, 0.3, 1] }, left: fist(-1), ...spine({ flex: -4, turn: -20 }), Hips: { turn: 8 }, offset: [0, 0, -0.03] }],
                [1, { right: { at: [0.22, 0.02, 1], point: [0.8, -0.2, 0.2], edge: [0, -0.2, 1] }, left: fist(-1), ...spine({ flex: 10, turn: 22 }), Hips: { turn: -12 }, offset: [0, -0.04, 0.07] }],
                [1.4, { right: { at: [0.3, -0.2, 0.75], point: [0.8, -0.1, 0.2], edge: [0, 0, 1] }, left: fist(-1), ...spine({ flex: 12, turn: 14 }), Hips: { turn: -8 }, offset: [0, -0.04, 0.04] }]),
        ],
    },
    cleaver: {
        variants: [
            variant("overhead hack", CLEAVER,
                // Raised high behind the head, then hacked down
                [0.6, { right: { at: [-0.1, 0.5, -0.05], point: [0.15, 0.35, -0.92], edge: [0, 0.9, 0.3] }, LeftArm: { flex: 40, abduct: 35 }, LeftForeArm: { flex: 70 }, ...spine({ flex: -8, turn: -18 }), offset: [0, 0.01, -0.03] }],
                [1, { right: { at: [0.2, -0.3, 0.85], point: [0.05, -0.3, 0.95], edge: [0, -0.95, 0.3] }, LeftArm: { flex: 10, abduct: 40 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 22, turn: 14 }), offset: [0, -0.1, 0.1] }],
                [1.35, { right: { at: [0.3, -0.65, 0.6], point: [0.15, -0.85, 0.4], edge: [0, -0.4, -0.9] }, LeftArm: { flex: 5, abduct: 38 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 25, turn: 16 }), offset: [0, -0.11, 0.09] }]),
            variant("backhand", CLEAVER,
                // Across to the left shoulder, then backhanded out to the right
                [0.6, { right: { at: [0.5, 0.25, 0.15], point: [0.4, 0.55, -0.7], edge: [-0.6, 0.3, -0.4] }, LeftArm: { flex: 30, abduct: 30 }, LeftForeArm: { flex: 60 }, ...spine({ turn: 25 }), Hips: { turn: -8 }, offset: [0, 0, -0.03] }],
                [1, { right: { at: [-0.25, -0.3, 0.85], point: [-0.3, -0.2, 0.95], edge: [-0.9, -0.3, 0] }, LeftArm: { flex: 10, abduct: 42 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 14, turn: -22 }), Hips: { turn: 12 }, offset: [0, -0.07, 0.09] }],
                [1.35, { right: { at: [-0.65, -0.55, 0.45], point: [-0.85, -0.45, 0.2], edge: [-0.3, -0.5, -0.8] }, LeftArm: { flex: 5, abduct: 40 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 16, turn: -28 }), Hips: { turn: 14 }, offset: [0, -0.08, 0.07] }]),
            variant("flat chop", CLEAVER,
                // Swung back out to the right, then chopped flat across
                [0.6, { right: { at: [-0.55, 0.05, -0.05], point: [-0.65, 0.1, -0.7], edge: [0.75, 0, -0.65] }, LeftArm: { flex: 30, abduct: 35 }, LeftForeArm: { flex: 65 }, ...spine({ turn: -32 }), Hips: { turn: 14 }, offset: [0, -0.01, -0.03] }],
                [1, { right: { at: [0.3, -0.2, 0.85], point: [0.35, -0.05, 0.93], edge: [0.93, 0, -0.35] }, LeftArm: { flex: 10, abduct: 40 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 10, turn: 24 }), Hips: { turn: -14 }, offset: [0, -0.07, 0.1] }],
                [1.35, { right: { at: [0.65, -0.35, 0.45], point: [0.9, -0.1, 0.1], edge: [0.1, 0, -1] }, LeftArm: { flex: 5, abduct: 38 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 12, turn: 32 }), Hips: { turn: -16 }, offset: [0, -0.08, 0.08] }]),
            variant("gut rip", CLEAVER,
                // Low at the hip, then ripped upward through the belly
                [0.6, { right: { at: [-0.3, -0.75, 0.1], point: [-0.1, -0.3, 0.95], edge: [0, 0.95, 0.3] }, LeftArm: { flex: 25, abduct: 35 }, LeftForeArm: { flex: 60 }, ...spine({ flex: 16, turn: -14 }), offset: [0, -0.08, -0.02] }],
                [1, { right: { at: [0.15, -0.3, 0.85], point: [0.1, 0.3, 0.95], edge: [0, 0.95, -0.3] }, LeftArm: { flex: 10, abduct: 40 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 10, turn: 12 }), offset: [0, -0.05, 0.1] }],
                [1.35, { right: { at: [0.2, 0.05, 0.7], point: [0.1, 0.7, 0.7], edge: [0, 0.7, -0.7] }, LeftArm: { flex: 5, abduct: 38 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 4, turn: 14 }), offset: [0, -0.02, 0.08] }]),
            variant("stab and rip", CLEAVER,
                // Drawn back, point first, stabbed in, then ripped down
                [0.6, { right: { at: [0, -0.5, 0.05], point: [0.05, 0.05, 1], edge: [0, -1, 0] }, LeftArm: { flex: 30, abduct: 35 }, LeftForeArm: { flex: 65 }, ...spine({ turn: -16 }), Hips: { turn: 8 }, offset: [0, -0.03, -0.06] }],
                [1, { right: { at: [0.18, -0.25, 1.02], point: [0.05, 0, 1], edge: [0, -1, 0] }, LeftArm: { flex: 10, abduct: 42 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 10, turn: 18 }), Hips: { turn: -10 }, offset: [0, -0.08, 0.16] }],
                [1.35, { right: { at: [0.12, -0.65, 0.75], point: [0.05, -0.5, 0.85], edge: [0, -0.85, -0.5] }, LeftArm: { flex: 5, abduct: 40 }, LeftForeArm: { flex: 40 }, ...spine({ flex: 20, turn: 14 }), Hips: { turn: -8 }, offset: [0, -0.1, 0.12] }]),
        ],
    },

    // Spells, cast with the free (left) hand, key 1 when the spell takes effect
    castHeal: {
        variants: [
            variant("lifted up", CAST,
                // The hand gathers the light before the chest, then lifts it up and open
                [0.55, { left: { at: [0.08, -0.35, 0.5], point: [-0.3, 0.3, 0.9], edge: [0, -1, 0.2] }, ...spine({ flex: 6 }), Head: { flex: 8 } }],
                [1, { left: { at: [0.1, 0.35, 0.45], point: [-0.2, 0.9, 0.35], edge: [0, 0.2, 1] }, ...spine({ flex: -6 }), Head: { flex: -14 } }],
                [1.5, { left: { at: [0.12, 0.32, 0.42], point: [-0.2, 0.9, 0.35], edge: [0, 0.2, 1] }, ...spine({ flex: -5 }), Head: { flex: -10 } }]),
            variant("from the heart", CAST,
                // The palm to the heart, the head bowed, then raised to the sky
                [0.5, { left: { at: [-0.25, -0.25, 0.25], point: [-0.8, 0.5, 0.2], edge: [0, 0, 1] }, ...spine({ flex: 4 }), Head: { flex: 14 } }],
                [1, { left: { at: [0.18, 0.5, 0.35], point: [-0.1, 0.95, 0.3], edge: [0, 0.25, 1] }, ...spine({ flex: -8 }), Head: { flex: -18 } }],
                [1.5, { left: { at: [0.18, 0.45, 0.33], point: [-0.1, 0.95, 0.3], edge: [0, 0.25, 1] }, ...spine({ flex: -6 }), Head: { flex: -14 } }]),
            variant("circle", CAST,
                // A circle drawn with the open palm, then opened upward
                [0.35, { left: { at: [0.05, -0.35, 0.55], point: [-0.3, 0.3, 0.9], edge: [0, -1, 0.2] }, ...spine({ flex: 4 }), Head: { flex: 6 } }],
                [0.6, { left: { at: [0.35, -0.1, 0.55], point: [-0.1, 0.5, 0.85], edge: [0, -0.6, 0.6] }, ...spine({ flex: 2 }), Head: { flex: 2 } }],
                [0.8, { left: { at: [0.1, 0.15, 0.6], point: [-0.2, 0.7, 0.6], edge: [0, -0.2, 1] }, ...spine({ flex: 0 }), Head: { flex: -4 } }],
                [1, { left: { at: [0.05, 0.3, 0.55], point: [-0.2, 0.9, 0.35], edge: [0, 0.2, 1] }, ...spine({ flex: -4 }), Head: { flex: -10 } }],
                [1.5, { left: { at: [0.06, 0.28, 0.52], point: [-0.2, 0.9, 0.35], edge: [0, 0.2, 1] }, ...spine({ flex: -4 }), Head: { flex: -8 } }]),
            variant("rising sweep", CAST,
                // Swept up from low at the side, high over the head
                [0.5, { left: { at: [0.55, -0.55, 0.25], point: [0.3, -0.3, 0.9], edge: [0, -1, 0.2] }, ...spine({ flex: 4, bend: 6 }), Head: { flex: 10 } }],
                [1, { left: { at: [0.3, 0.6, 0.35], point: [0.1, 0.95, 0.2], edge: [0, 0.2, 1] }, ...spine({ flex: -6, bend: -2 }), Head: { flex: -16 } }],
                [1.5, { left: { at: [0.28, 0.55, 0.33], point: [0.1, 0.95, 0.2], edge: [0, 0.2, 1] }, ...spine({ flex: -5 }), Head: { flex: -12 } }]),
            variant("from the earth", CAST,
                // Bowing, the palm over the ground, then drawing the light up from it
                [0.5, { left: { at: [0.05, -0.7, 0.55], point: [-0.3, -0.2, 0.9], edge: [0, -1, 0.1] }, ...spine({ flex: 16 }), Head: { flex: 18 } }],
                [1, { left: { at: [0.08, 0.25, 0.5], point: [-0.2, 0.9, 0.35], edge: [0, 0.3, 1] }, ...spine({ flex: -4 }), Head: { flex: -10 } }],
                [1.5, { left: { at: [0.08, 0.22, 0.48], point: [-0.2, 0.9, 0.35], edge: [0, 0.3, 1] }, ...spine({ flex: -3 }), Head: { flex: -8 } }]),
        ],
    },
    castStun: {
        variants: [
            variant("palm thrust", CAST,
                // Drawn back by the left shoulder, then thrust open-palmed at the enemy
                [0.55, { left: { at: [0.28, 0.08, 0.28], point: [-1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ turn: 18, flex: -4 }), offset: [0, 0.01, -0.03] }],
                [1, { left: { at: [-0.1, 0.02, 1.02], point: [-1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ turn: -12, flex: 6 }), offset: [0, -0.02, 0.06] }],
                [1.5, { left: { at: [-0.1, -0.02, 0.98], point: [-1, 0, 0], edge: [0, 1, 0.2] }, ...spine({ turn: -10, flex: 6 }), offset: [0, -0.02, 0.05] }]),
            variant("pointed from above", CAST,
                // Raised high, then pointed down at the enemy
                [0.55, { left: { at: [0.15, 0.5, 0.25], point: [-0.6, 0.6, 0.3], edge: [0, 0.3, 1] }, ...spine({ flex: -6 }), offset: [0, 0.01, -0.02] }],
                [1, { left: { at: [-0.05, 0, 1.02], point: [-1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ flex: 6, turn: -8 }), offset: [0, -0.02, 0.05] }],
                [1.5, { left: { at: [-0.05, -0.04, 0.98], point: [-1, 0, 0], edge: [0, 1, 0.2] }, ...spine({ flex: 6, turn: -8 }), offset: [0, -0.02, 0.04] }]),
            variant("cross-body flick", CAST,
                // Across the chest to the right, then flicked out at the enemy
                [0.55, { left: { at: [-0.35, -0.2, 0.3], point: [-1, 0, 0.1], edge: [0, 1, 0] }, ...spine({ turn: -18 }), offset: [0, 0, -0.02] }],
                [1, { left: { at: [0.05, 0.02, 1], point: [-1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ turn: 10 }), offset: [0, -0.01, 0.04] }],
                [1.5, { left: { at: [0.05, -0.02, 0.96], point: [-1, 0, 0], edge: [0, 1, 0.2] }, ...spine({ turn: 8 }), offset: [0, -0.01, 0.03] }]),
            variant("double push", CAST,
                // Two pushes, the second sending it
                [0.4, { left: { at: [0.1, -0.15, 0.25], point: [-1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ flex: -2 }), offset: [0, 0, -0.02] }],
                [0.65, { left: { at: [0.05, -0.1, 0.6], point: [-1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ flex: 3 }), offset: [0, -0.01, 0.02] }],
                [0.85, { left: { at: [0.1, -0.12, 0.35], point: [-1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ flex: -1 }), offset: [0, 0, -0.01] }],
                [1, { left: { at: [-0.08, 0, 1.05], point: [-1, 0, 0], edge: [0, 1, 0.15] }, ...spine({ flex: 8 }), offset: [0, -0.03, 0.08] }],
                [1.5, { left: { at: [-0.08, -0.03, 1], point: [-1, 0, 0], edge: [0, 1, 0.2] }, ...spine({ flex: 7 }), offset: [0, -0.03, 0.06] }]),
            variant("rising sweep", CAST,
                // Swept up from low at the side to point at the enemy
                [0.55, { left: { at: [0.35, -0.6, 0.4], point: [-0.8, -0.3, 0.3], edge: [0, 1, 0] }, ...spine({ flex: 10, turn: 10 }), offset: [0, -0.03, 0] }],
                [1, { left: { at: [-0.05, 0.08, 1], point: [-1, 0.1, 0], edge: [0, 1, 0.15] }, ...spine({ flex: 2, turn: -10 }), offset: [0, -0.01, 0.05] }],
                [1.5, { left: { at: [-0.05, 0.04, 0.96], point: [-1, 0.05, 0], edge: [0, 1, 0.2] }, ...spine({ flex: 2, turn: -8 }), offset: [0, -0.01, 0.04] }]),
        ],
    },

    // The tavern's folk (one way each)
    toast: {
        variants: [
            // Raising a tankard (held in the right hand, upright) high in a toast, then drinking
            // from it, key 1 at the top of the toast
            variant("toast", { right: tankard, ...spine({}), Head: { flex: 0 } },
                [1, { right: { at: [0.08, 0.38, 0.55], point: [0, 1, 0.2] }, ...spine({ flex: -6 }), Head: { flex: -12 } }],
                [1.25, { right: { at: [0.1, 0.45, 0.52], point: [0.05, 1, 0.15] }, ...spine({ flex: -7 }), Head: { flex: -12 } }],
                [1.6, { right: { at: [0.3, 0.12, 0.24], point: [0.35, 0.55, -0.75] }, ...spine({ flex: -8 }), Head: { flex: -22 } }],
                [1.85, { right: { at: [0.3, 0.13, 0.25], point: [0.35, 0.5, -0.8] }, ...spine({ flex: -8 }), Head: { flex: -24 } }]),
        ],
    },
    serve: {
        variants: [
            // Putting a tankard down on a table in front, leaning over it (key 1 as it touches down)
            variant("serve", { right: tankard, ...spine({}), offset: [0, 0, 0] },
                [1, { right: { at: [0.12, -0.62, 0.78], point: [0, 1, 0.1] }, ...spine({ flex: 22 }), offset: [0, -0.02, 0.03] }],
                [1.3, { right: { at: [0.12, -0.6, 0.76], point: [0, 1, 0.1] }, ...spine({ flex: 20 }), offset: [0, -0.02, 0.03] }]),
        ],
    },
    pour: {
        variants: [
            // Drawing ale: both hands to a barrel's tap in front, the left holding the tankard under it
            variant("pour", { ...spine({}) },
                [0.7, { right: { at: [0.15, -0.35, 0.72], point: [0.9, 0.2, 0.2], edge: [0, -1, 0] }, left: { at: [-0.05, -0.62, 0.7], point: [-0.9, 0, 0.3], edge: [0, 1, 0] }, ...spine({ flex: 14 }) }],
                [1.4, { right: { at: [0.18, -0.4, 0.72], point: [0.9, 0.2, 0.2], edge: [0, -1, 0] }, left: { at: [-0.05, -0.6, 0.7], point: [-0.9, 0, 0.3], edge: [0, 1, 0] }, ...spine({ flex: 14 }) }]),
        ],
    },
});

// --- Resting ---

// A hand on something in front (a table's top, the bar, the counter: `y` arm lengths below the
// shoulder, `z` in front), palm down
const flat = (x, y, z, side = 1) => ({ at: [x, y, z], point: [side, 0, 0.15], edge: [0, -0.15, 1] });

// Where the toast starts from: the tankard held before the chest
const TOASTING = { right: tankard, ...spine({}), Head: { flex: 0 } };

// Arms folded over the chest: each hand tucked under the other arm, the right forearm over the left
const FOLDED = { right: { at: [0.74, -0.36, 0.24], point: [0, 1, 0], edge: [1, 0, 0] }, left: { at: [-0.74, -0.44, 0.22], point: [0, 1, 0], edge: [-1, 0, 0] } };

/**
 * How each role passes the time (roles.js ROLES: the rests' names and timings, in the same order):
 * five ways each, key 1 at the moment that matters, starting and ending in the pose it rests in.
 * Seated patrons rest sitting (the legs are the bench's), the others standing.
 */
export const RESTS = Object.freeze({
    barkeep: [
        variant("wiping the bar", { ...spine({}) },
            // The right hand going round and round on the bar, leaning on the left
            [0.35, { right: flat(0.2, -0.66, 0.72), left: flat(-0.12, -0.68, 0.62, -1), ...spine({ flex: 14 }) }],
            [0.6, { right: flat(0.36, -0.66, 0.62) }],
            [0.8, { right: flat(0.22, -0.66, 0.52) }],
            [1, { right: flat(0.06, -0.66, 0.62) }],
            [1.2, { right: flat(0.2, -0.66, 0.74) }],
            [1.4, { right: flat(0.36, -0.66, 0.62) }],
            [1.6, { right: flat(0.2, -0.66, 0.54), left: flat(-0.12, -0.68, 0.62, -1), ...spine({ flex: 14 }) }]),
        variant("stroking his beard", { ...spine({}), Head: { flex: 0 } },
            // The hand to the chin, stroking the beard down, twice, thinking
            [0.5, { right: { at: [0.34, 0.14, 0.3] }, Head: { flex: -6, bend: -4 } }],
            [0.75, { right: { at: [0.34, -0.02, 0.33] } }],
            [1, { right: { at: [0.34, 0.14, 0.3] } }],
            [1.3, { right: { at: [0.34, -0.03, 0.33] } }],
            [1.6, { right: { at: [0.34, 0.1, 0.31] }, Head: { flex: -4, bend: -2 } }]),
        variant("leaning on the bar", { ...spine({}), Head: { flex: 0 }, offset: [0, 0, 0] },
            // Both hands on the bar, wide apart, leaning on them and looking out over the room
            [0.5, { right: flat(-0.04, -0.62, 0.76), left: flat(0.04, -0.62, 0.76, -1), ...spine({ flex: 30 }), Head: { flex: -20 }, offset: [0, -0.03, 0.07] }],
            [1.6, { right: flat(-0.04, -0.62, 0.76), left: flat(0.04, -0.62, 0.76, -1), ...spine({ flex: 32, turn: 6 }), Head: { flex: -20, turn: 12 }, offset: [0, -0.03, 0.07] }]),
        variant("arms folded", { ...spine({}), Head: { flex: 0 } },
            // Arms folded over the chest, nodding at something said
            [0.5, { ...FOLDED, ...spine({ flex: -4 }), Head: { flex: -4 } }],
            [0.9, { Head: { flex: 8 } }],
            [1.15, { Head: { flex: -2 } }],
            [1.4, { Head: { flex: 8 } }],
            [1.65, { ...FOLDED, ...spine({ flex: -4 }), Head: { flex: -2 } }]),
        variant("rubbing his neck", { ...spine({}), Head: { flex: 0, bend: 0 } },
            // The hand behind the neck, the head bowed, rolled one way and the other
            [0.5, { right: { at: [0.26, 0.12, -0.06] }, ...spine({ flex: 6 }), Head: { flex: 16, bend: 0 } }],
            [1, { right: { at: [0.3, 0.14, -0.06] }, Head: { flex: 10, bend: 12 } }],
            [1.4, { right: { at: [0.24, 0.1, -0.05] }, Head: { flex: 12, bend: -10 } }],
            [1.65, { right: { at: [0.26, 0.12, -0.06] }, ...spine({ flex: 4 }), Head: { flex: 4, bend: 0 } }]),
    ],
    barmaid: [
        variant("wiping her brow", { ...spine({}), Head: { flex: 0 } },
            // The back of the wrist across the forehead, then a sigh
            [0.5, { left: { at: [-0.52, 0.42, 0.26] }, Head: { flex: -6 } }],
            [1, { left: { at: [-0.12, 0.44, 0.24] }, Head: { flex: -8 } }],
            [1.4, { left: { at: [0.02, -0.2, 0.2] }, ...spine({ flex: 6 }), Head: { flex: 10 } }]),
        variant("hand on her hip", { ...spine({}), Head: { bend: 0 }, Hips: { obliquity: 0, turn: 0 }, offset: [0, 0, 0] },
            // A hand on the hip, the hip cocked, the head tilted
            [0.5, { left: { at: [0.08, -0.68, 0.02] }, Hips: { obliquity: 5, turn: -6 }, ...spine({ bend: -6 }), Head: { bend: 10 }, offset: [0.03, -0.01, 0] }],
            [1.6, { left: { at: [0.08, -0.68, 0.02] }, Hips: { obliquity: 6, turn: -8 }, ...spine({ bend: -7 }), Head: { bend: 12 }, offset: [0.035, -0.01, 0] }]),
        variant("tucking back her hair", { ...spine({}), Head: { bend: 0, flex: 0 } },
            // The hand up to the side of the head, tucking the hair back behind the ear
            [0.55, { left: { at: [-0.16, 0.36, 0.14] }, Head: { bend: 10, flex: 4 } }],
            [1, { left: { at: [-0.12, 0.34, -0.02] }, Head: { bend: 12, flex: 2 } }],
            [1.4, { left: { at: [0.02, -0.25, 0.1] }, Head: { bend: 4, flex: 0 } }]),
        variant("a curtsy", { ...spine({}), Head: { flex: 0 }, offset: [0, 0, 0] },
            // Bobbing down, the head bowed, the skirt held out to the side
            [1, { left: { at: [0.34, -0.9, 0.2] }, ...spine({ flex: 17 }), Head: { flex: 20 }, offset: [0, -0.045, -0.03] }],
            [1.3, { left: { at: [0.3, -0.88, 0.18] }, ...spine({ flex: 14 }), Head: { flex: 16 }, offset: [0, -0.035, -0.02] }]),
        variant("stretching her back", { ...spine({}), Head: { flex: 0 }, offset: [0, 0, 0] },
            // A hand to the small of the back, arching back
            [0.5, { left: { at: [-0.22, -0.62, -0.28] }, ...spine({ flex: -6 }), Head: { flex: -6 } }],
            [1, { left: { at: [-0.25, -0.6, -0.3] }, ...spine({ flex: -13 }), Head: { flex: -14 }, offset: [0, 0, 0.03] }],
            [1.5, { left: { at: [-0.22, -0.62, -0.28] }, ...spine({ flex: -8 }), Head: { flex: -6 }, offset: [0, 0, 0.01] }]),
    ],
    patron: [
        variant("a toast", TOASTING, ...ATTACKS.toast.variants[0].keys.slice(1, -1)),
        variant("a long drink", TOASTING,
            // The tankard to the lips and tipped right back, then the mouth wiped on a sleeve
            [0.55, { right: { at: [0.3, 0.1, 0.3], point: [0.2, 0.75, -0.6] }, Head: { flex: -8 } }],
            [1, { right: { at: [0.32, 0.15, 0.24], point: [0.3, 0.3, -0.9] }, ...spine({ flex: -6 }), Head: { flex: -24 } }],
            [1.4, { right: { at: [0.32, 0.17, 0.22], point: [0.3, 0.15, -0.95] }, ...spine({ flex: -8 }), Head: { flex: -28 } }],
            [1.65, { right: tankard, left: { at: [-0.5, 0.22, 0.3] }, ...spine({ flex: 2 }), Head: { flex: 4 } }],
            [1.85, { right: tankard, left: { at: [-0.18, 0.2, 0.3] }, ...spine({ flex: 2 }), Head: { flex: 2 } }]),
        variant("a belly laugh", { ...spine({}), Head: { flex: 0 } },
            // Thrown back laughing, slapping the table, twice
            [0.4, { left: flat(-0.12, -0.36, 0.6, -1), ...spine({ flex: -12 }), Head: { flex: -16 } }],
            [0.7, { left: flat(-0.12, -0.3, 0.6, -1), ...spine({ flex: -8 }), Head: { flex: -12 } }],
            [1, { left: flat(-0.12, -0.56, 0.66, -1), ...spine({ flex: 8 }), Head: { flex: 6 } }],
            [1.25, { left: flat(-0.12, -0.3, 0.6, -1), ...spine({ flex: -10 }), Head: { flex: -14 } }],
            [1.5, { left: flat(-0.12, -0.56, 0.66, -1), ...spine({ flex: 6 }), Head: { flex: 4 } }],
            [1.75, { ...spine({ flex: -4 }), Head: { flex: -6 } }]),
        variant("thumping the table", TOASTING,
            // The tankard banged down on the table, twice, cheering
            [0.45, { right: { at: [0.16, -0.22, 0.58], point: [0, 1, 0.1] }, ...spine({ flex: -4 }), Head: { flex: -8 } }],
            [1, { right: { at: [0.16, -0.58, 0.66], point: [0, 1, 0.1] }, ...spine({ flex: 8 }), Head: { flex: 6 } }],
            [1.25, { right: { at: [0.16, -0.25, 0.6], point: [0, 1, 0.1] }, ...spine({ flex: -2 }), Head: { flex: -6 } }],
            [1.5, { right: { at: [0.16, -0.58, 0.66], point: [0, 1, 0.1] }, ...spine({ flex: 8 }), Head: { flex: 6 } }],
            [1.8, { right: tankard, ...spine({}), Head: { flex: 0 } }]),
        variant("looking about", { ...spine({}), Neck: { turn: 0 }, Head: { turn: 0, flex: 0 } },
            // Over one shoulder, then the other
            [0.6, { ...spine({ turn: 16 }), Neck: { turn: 18 }, Head: { turn: 26, flex: -4 } }],
            [1, { ...spine({ turn: 18 }), Neck: { turn: 20 }, Head: { turn: 28, flex: -4 } }],
            [1.3, { ...spine({ turn: -14 }), Neck: { turn: -18 }, Head: { turn: -26, flex: -2 } }],
            [1.6, { ...spine({ turn: -16 }), Neck: { turn: -20 }, Head: { turn: -28, flex: -2 } }]),
    ],
    madam: [
        variant("fanning herself", { ...spine({}), Head: { flex: 0, bend: 0 } },
            // Fanning her face with her hand, quickly
            [0.4, { right: { at: [0.2, 0.28, 0.36] }, Head: { flex: -6, bend: -4 } }],
            [0.55, { right: { at: [0.34, 0.32, 0.4] } }],
            [0.7, { right: { at: [0.2, 0.28, 0.36] } }],
            [0.85, { right: { at: [0.34, 0.32, 0.4] } }],
            [1, { right: { at: [0.2, 0.28, 0.36] } }],
            [1.2, { right: { at: [0.34, 0.32, 0.4] } }],
            [1.4, { right: { at: [0.2, 0.28, 0.36] } }],
            [1.6, { right: { at: [0.3, 0.3, 0.38] }, Head: { flex: -4, bend: -2 } }]),
        variant("hands on her hips", { ...spine({}), Head: { turn: 0 } },
            // Hands on hips, looking over her house one way and the other
            [0.5, { right: { at: [-0.08, -0.68, 0.02] }, left: { at: [0.08, -0.68, 0.02] }, ...spine({ flex: -3 }), Head: { turn: 0 } }],
            [0.9, { ...spine({ flex: -3, turn: 10 }), Head: { turn: 24 } }],
            [1.3, { ...spine({ flex: -3, turn: -10 }), Head: { turn: -24 } }],
            [1.65, { right: { at: [-0.08, -0.68, 0.02] }, left: { at: [0.08, -0.68, 0.02] }, ...spine({ flex: -3 }), Head: { turn: 0 } }]),
        variant("touching her necklace", { ...spine({}), Head: { flex: 0, bend: 0 } },
            // Fingers to the throat, toying with a necklace, looking down
            [0.6, { left: { at: [-0.28, -0.04, 0.24] }, Head: { flex: 10, bend: 6 } }],
            [1, { left: { at: [-0.24, -0.02, 0.25] }, Head: { flex: 12, bend: 8 } }],
            [1.4, { left: { at: [-0.3, -0.05, 0.24] }, Head: { flex: 8, bend: 4 } }]),
        variant("drumming her fingers", { ...spine({}), RightHand: { flex: 0 } },
            // A hand on the counter in front, drumming it
            [0.5, { right: { at: [0.16, -0.64, 0.7] }, ...spine({ flex: 8 }), RightHand: { flex: -25 } }],
            [0.7, { RightHand: { flex: 10 } }],
            [0.85, { RightHand: { flex: -25 } }],
            [1, { RightHand: { flex: 10 } }],
            [1.15, { RightHand: { flex: -25 } }],
            [1.3, { RightHand: { flex: 10 } }],
            [1.45, { RightHand: { flex: -25 } }],
            [1.6, { right: { at: [0.16, -0.64, 0.7] }, ...spine({ flex: 8 }), RightHand: { flex: 0 } }]),
        variant("smoothing her gown", { ...spine({}), Head: { flex: 0 } },
            // Both hands smoothing down the front of her gown
            [0.5, { right: { at: [0.2, -0.6, 0.24] }, left: { at: [-0.2, -0.6, 0.24] }, ...spine({ flex: 10 }), Head: { flex: 14 } }],
            [1, { right: { at: [0.18, -0.95, 0.28] }, left: { at: [-0.18, -0.95, 0.28] }, ...spine({ flex: 16 }), Head: { flex: 16 } }],
            [1.4, { right: { at: [0.16, -0.8, 0.22] }, left: { at: [-0.16, -0.8, 0.22] }, ...spine({ flex: 4 }), Head: { flex: 4 } }]),
    ],
    adventurer: [
        variant("stretching", { ...spine({}), Head: { flex: 0 } },
            // Both arms up high, the back arched, then down
            [0.55, { right: { at: [0.12, 0.7, 0.2] }, left: { at: [-0.12, 0.7, 0.2] }, ...spine({ flex: -6 }), Head: { flex: -8 } }],
            [1, { right: { at: [0.1, 0.96, 0.08] }, left: { at: [-0.1, 0.96, 0.08] }, ...spine({ flex: -12 }), Head: { flex: -16 } }],
            [1.35, { right: { at: [0.1, 0.94, 0.06] }, left: { at: [-0.1, 0.94, 0.06] }, ...spine({ flex: -13 }), Head: { flex: -16 } }],
            [1.7, { right: { at: [-0.1, 0.2, 0.2] }, left: { at: [0.1, 0.2, 0.2] }, ...spine({ flex: 0 }), Head: { flex: 0 } }]),
        variant("looking about", { ...spine({}), Head: { turn: 0, flex: 0 } },
            // A hand shading the eyes, looking into the distance one way, then the other
            [0.5, { left: { at: [-0.32, 0.4, 0.34] }, Head: { flex: -4 } }],
            [0.8, { ...spine({ turn: 14 }), Head: { turn: 26, flex: -4 } }],
            [1.2, { ...spine({ turn: -14 }), Head: { turn: -26, flex: -4 } }],
            [1.55, { left: { at: [-0.32, 0.4, 0.34] }, ...spine({ turn: 0 }), Head: { turn: 0, flex: -2 } }]),
        variant("rolling the shoulders", { ...spine({}), LeftShoulder: { elevate: 0, protract: 0 }, RightShoulder: { elevate: 0, protract: 0 }, Neck: { bend: 0 } },
            // The shoulders rolled up and back, and the neck stretched one way and the other
            [0.4, { LeftShoulder: { elevate: 22, protract: 14 }, RightShoulder: { elevate: 22, protract: 14 } }],
            [0.7, { LeftShoulder: { elevate: 26, protract: -18 }, RightShoulder: { elevate: 26, protract: -18 } }],
            [1, { LeftShoulder: { elevate: 0, protract: -10 }, RightShoulder: { elevate: 0, protract: -10 }, Neck: { bend: 20 } }],
            [1.35, { LeftShoulder: { elevate: 0, protract: 0 }, RightShoulder: { elevate: 0, protract: 0 }, Neck: { bend: -20 } }],
            [1.65, { Neck: { bend: 0 } }]),
        variant("a yawn", { ...spine({}), Head: { flex: 0 }, LeftShoulder: { elevate: 0 }, RightShoulder: { elevate: 0 } },
            // A hand to the mouth, the head back, the shoulders up
            [0.5, { left: { at: [-0.34, 0.22, 0.32] }, Head: { flex: -12 }, LeftShoulder: { elevate: 12 }, RightShoulder: { elevate: 12 } }],
            [1, { left: { at: [-0.34, 0.24, 0.32] }, ...spine({ flex: -8 }), Head: { flex: -20 }, LeftShoulder: { elevate: 18 }, RightShoulder: { elevate: 18 } }],
            [1.5, { left: { at: [-0.1, -0.3, 0.2] }, ...spine({ flex: 2 }), Head: { flex: 4 }, LeftShoulder: { elevate: 0 }, RightShoulder: { elevate: 0 } }]),
        variant("shifting the weight", { ...spine({}), Hips: { obliquity: 0 }, offset: [0, 0, 0] },
            // From one foot to the other, a thumb in the belt
            [0.5, { left: { at: [-0.26, -0.62, 0.22] }, Hips: { obliquity: -6 }, ...spine({ bend: 5 }), offset: [-0.04, -0.01, 0] }],
            [1, { left: { at: [-0.26, -0.62, 0.22] }, Hips: { obliquity: 6 }, ...spine({ bend: -5 }), offset: [0.04, -0.01, 0] }],
            [1.5, { left: { at: [-0.26, -0.62, 0.22] }, Hips: { obliquity: -3 }, ...spine({ bend: 3 }), offset: [-0.02, 0, 0] }]),
    ],
});

// --- Reactions to being hit ---

/**
 * How a character reacts to each kind of blow: its length (seconds), an effect for the world to
 * show where it lands, and the angles to add at time t (0 to 1), given where the blow came from:
 * `side` is 1 from the character's left, -1 from its right; `front` is 1 from in front, -1 from
 * behind. `offset` moves the pelvis (metres), a knock back or a stagger.
 */
export const REACTIONS = Object.freeze({
    // A cut: twists away from the blade, head snapping away
    slash: {
        length: 0.45,
        effect: "sparks",
        pose: (t, { side, front }) => {
            const e = pulse(t, 0.18);

            return { ...spine({ turn: -side * 22 * e, bend: side * 8 * e, flex: -front * 6 * e }), Neck: { turn: -side * 10 * e }, Head: { turn: -side * 14 * e, flex: -front * 8 * e }, RightArm: { abduct: 12 * e }, LeftArm: { abduct: 12 * e }, offset: [0, -0.02 * e, -front * 0.04 * e] };
        },
    },
    // A blunt blow from a staff: rocks back, head thrown back
    strike: {
        length: 0.4,
        effect: "dust",
        pose: (t, { side, front }) => {
            const e = pulse(t, 0.2);

            return { ...spine({ flex: -front * 16 * e, bend: side * 4 * e }), Head: { flex: -front * 18 * e }, RightArm: { flex: 12 * e, abduct: 10 * e }, LeftArm: { flex: 12 * e, abduct: 10 * e }, offset: [0, 0, -front * 0.06 * e] };
        },
    },
    // Arcane light: a shudder through the whole body
    arcane: {
        length: 0.55,
        effect: "arcane",
        pose: (t, { front }) => {
            const e = pulse(t, 0.1);
            const shake = Math.sin(t * Math.PI * 2 * 7) * e;

            return { ...spine({ flex: -front * 6 * e, bend: 5 * shake, turn: 6 * shake }), Head: { flex: -front * 10 * e, bend: 8 * shake }, RightArm: { abduct: 22 * e, flex: 10 * e }, LeftArm: { abduct: 22 * e, flex: 10 * e }, RightForeArm: { flex: 25 * e }, LeftForeArm: { flex: 25 * e }, offset: [0, -0.03 * e, 0] };
        },
    },
    // Fire: flinches back, arms up to shield the face
    fire: {
        length: 0.7,
        effect: "fire",
        pose: (t, { front }) => {
            const e = pulse(t, 0.22);

            return { ...spine({ flex: -front * 10 * e, turn: 8 * e }), Head: { flex: 10 * e, turn: -14 * e }, RightArm: { flex: 80 * e, abduct: -10 * e }, RightForeArm: { flex: 90 * e }, LeftArm: { flex: 70 * e, abduct: -5 * e }, LeftForeArm: { flex: 100 * e }, offset: [0, -0.05 * e, -front * 0.07 * e] };
        },
    },
    // A hammer blow: doubled over, knees buckling, knocked back
    crush: {
        length: 0.8,
        effect: "impact",
        pose: (t, { side, front }) => {
            const e = pulse(t, 0.2);

            return { ...spine({ flex: front * 28 * e, bend: side * 6 * e }), Head: { flex: front * 12 * e }, RightArm: { flex: 25 * e, abduct: 18 * e }, LeftArm: { flex: 25 * e, abduct: 18 * e }, RightForeArm: { flex: 30 * e }, LeftForeArm: { flex: 30 * e }, offset: [0, -0.14 * e, -front * 0.16 * e] };
        },
    },
    // An arrow: a sharp jolt at the chest
    pierce: {
        length: 0.4,
        effect: "sparks",
        pose: (t, { side, front }) => {
            const e = pulse(t, 0.12);

            return { ...spine({ flex: -front * 12 * e, turn: -side * 10 * e }), Head: { flex: front * 12 * e }, RightArm: { abduct: 14 * e }, LeftArm: { abduct: 14 * e }, offset: [0, -0.02 * e, -front * 0.03 * e] };
        },
    },
    // A punch: the head snaps round
    punch: {
        length: 0.32,
        effect: "impact",
        pose: (t, { side, front }) => {
            const e = pulse(t, 0.15);

            return { ...spine({ turn: -side * 10 * e, flex: -front * 5 * e }), Neck: { turn: -side * 14 * e, bend: side * 8 * e }, Head: { turn: -side * 18 * e, flex: -front * 10 * e }, offset: [0, 0, -front * 0.03 * e] };
        },
    },
    // An orc's cleaver: a heavy cut that staggers
    hack: {
        length: 0.6,
        effect: "sparks",
        pose: (t, { side, front }) => {
            const e = pulse(t, 0.2);

            return { ...spine({ turn: -side * 18 * e, bend: side * 10 * e, flex: front * 8 * e }), Head: { turn: -side * 16 * e, flex: front * 10 * e }, RightArm: { abduct: 15 * e }, LeftArm: { abduct: 15 * e }, offset: [side * 0.04 * e, -0.07 * e, -front * 0.08 * e] };
        },
    },
});

// --- Falling ---

const FALL = { buckle: 0.28, topple: 0.55, settle: 0.35 };

/** How long into a fall the body hits the ground (s): for the sound of it. */
export const FALL_LANDS = FALL.buckle * 0.6 + FALL.topple;

// --- The engine ---

const HANDS = ["right", "left"];
const VECTORS = ["at", "point", "edge"];

// An action's tracks: for each joint it moves (and the pelvis offset, and each hand's place),
// the names of its values and each key's values, filled in from the key before where a key leaves
// them out
function compile(keys) {
    const times = keys.map(([time]) => time);
    const channels = new Map();
    const namesOf = (joint, value) => {
        if (joint === "offset") {
            return ["x", "y", "z"];
        }

        if (HANDS.includes(joint)) {
            return "on" in value ? ["on"] : VECTORS.filter((name) => value[name]).flatMap((name) => [`${name}X`, `${name}Y`, `${name}Z`]);
        }

        return Object.keys(value);
    };

    for (const [, pose] of keys) {
        for (const [joint, value] of Object.entries(pose)) {
            const names = channels.get(joint) ?? new Set();

            for (const name of namesOf(joint, value)) {
                names.add(name);
            }

            channels.set(joint, names);
        }
    }

    const read = (joint, value, name) => {
        if (value === undefined) {
            return undefined;
        }

        if (joint === "offset") {
            return value["xyz".indexOf(name)];
        }

        if (HANDS.includes(joint)) {
            return name === "on" ? value.on : value[name.slice(0, -1)]?.["XYZ".indexOf(name.at(-1))];
        }

        return value[name];
    };

    const tracks = [...channels].map(([joint, nameSet]) => {
        const names = [...nameSet];
        const values = keys.map(() => new Float64Array(names.length));
        let last = null;

        // Each key's values: its own, or the last key's, or (before any) the first that has them
        keys.forEach(([, pose], k) => {
            names.forEach((name, n) => {
                values[k][n] = read(joint, pose[joint], name) ?? last?.[n] ?? NaN;
            });
            last = values[k];
        });

        for (let n = 0; n < names.length; n++) {
            const first = values.find((row) => !Number.isNaN(row[n]))?.[n] ?? 0;

            for (const row of values) {
                if (Number.isNaN(row[n])) {
                    row[n] = first;
                }
            }
        }

        return { joint, names, values };
    });

    return { times, tracks };
}

// A value on the smooth curve through a track's keys at time `time` (Catmull-Rom, with tangents
// from the neighbouring keys, flat at the ends)
function sample(times, values, n, time) {
    const last = times.length - 1;

    if (time <= times[0]) {
        return values[0][n];
    }

    if (time >= times[last]) {
        return values[last][n];
    }

    let k = 0;

    while (times[k + 1] < time) {
        k++;
    }

    const [t0, t1] = [times[k], times[k + 1]];
    const [p0, p1] = [values[k][n], values[k + 1][n]];
    const tangent = (i) => (i <= 0 || i >= last ? 0 : (values[i + 1][n] - values[i - 1][n]) / (times[i + 1] - times[i - 1]));
    const [m0, m1] = [tangent(k) * (t1 - t0), tangent(k + 1) * (t1 - t0)];
    const u = (time - t0) / (t1 - t0);
    const u2 = u * u;
    const u3 = u2 * u;

    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

const COMPILED = new Map([
    ...Object.entries(ATTACKS).map(([name, attack]) => [name, attack.variants.map(({ keys }) => compile(keys))]),
    ...Object.entries(RESTS).map(([role, rests]) => [`rest:${role}`, rests.map(({ keys }) => compile(keys))]),
]);
const GUARD_TRACKS = new Map(Object.entries(GUARDS).map(([name, guard]) => [name, compile([[0, guard]])]));

const MIRROR = { Left: "Right", Right: "Left", left: "right", right: "left" };
const mirrored = (joint) => joint.replace(/^(Left|Right|left|right)/, (side) => MIRROR[side]);

// Angles that change sign when a pose is mirrored left for right (turning and bending the other
// way, the pelvis moved to the other side, hands' x)
const MIRRORED = new Set(["turn", "bend", "obliquity", "atX", "pointX", "edgeX"]);

const _rotation = new THREE.Quaternion();
const _fall = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _across = new THREE.Vector3();
const _frame = new THREE.Quaternion();
const _shoulder = new THREE.Vector3();
const _item = new THREE.Quaternion();
const _hand = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _basis = new THREE.Matrix4();
const _wrist = new THREE.Vector3();

export class Actions {
    /** @param {import("./character.js").Character} character */
    constructor(character) {
        this.character = character;
        this.rig = character.rig;
        this.time = 0;

        /** The attack under way, if any. */
        this.attack = null;
        this.reactions = [];
        this.fall = null;

        /** How the weapon is held on guard (a GUARDS key, or null), and how much (0 to 1). */
        this.guardName = null;
        this.guard = 0;
        this.guardTarget = 0;
        this.attacks = 0;

        // The hands' places to reach this frame, after the feet are planted
        this.reaching = [];
        this.body = null;

        /** Sitting (on a bench), or standing. */
        this.seated = false;

        /** Which way each action was done last, to do it another way next time. */
        this.variety = new Variety();
    }

    /** Sit down (on a bench) or stand. */
    setSeated(on) {
        this.seated = on;
    }

    /** Which weapon's guard to stand in while fighting (a GUARDS key; null for none). */
    setWeapon(name) {
        this.guardName = GUARDS[name] ? name : null;
    }

    /** Stand on guard (fighting) or not; eased into. */
    setGuard(on) {
        this.guardTarget = on && this.guardName ? 1 : 0;
    }

    /**
     * Start an attack (an ATTACKS key), the blow landing `hitAt` seconds in and ending at
     * `duration` seconds: one of its ways (`variant`, or at random, never the way it was done
     * last time). Returns which way.
     */
    startAttack(name, { hitAt, duration, variant = null }) {
        const attack = ATTACKS[name];

        if (!attack) {
            return null;
        }

        const way = variant ?? this.variety.next(name, attack.variants.length);

        this.variety.last.set(name, way);
        this.attacks++;
        this.attack = { name, variant: way, tracks: COMPILED.get(name)[way], start: this.time, hitAt, duration, mirror: Boolean(attack.alternate && this.attacks % 2 === 0) };

        return way;
    }

    /**
     * Rest: one of a role's resting animations (roles.js ROLES, the poses RESTS), `variant` or at
     * random, never the one it did last, timed as the role says. Returns which, or null (a role
     * with no rests). An attack started while resting takes over from it.
     */
    rest(role, { variant = null } = {}) {
        const rests = ROLES[role]?.rests;

        if (!rests || !RESTS[role]) {
            return null;
        }

        const name = `rest:${role}`;
        const way = variant ?? this.variety.next(name, rests.length);
        const { hitAt, duration } = rests[way];

        this.variety.last.set(name, way);
        this.attack = { name, variant: way, tracks: COMPILED.get(name)[way], start: this.time, hitAt, duration, mirror: false, rest: true, stopping: null };

        return way;
    }

    /** Is it resting (one of its role's rests under way, and not already easing out of it)? */
    get resting() {
        return Boolean(this.attack?.rest && !this.attack.stopping);
    }

    /** Stop resting, easing out of it over `seconds` (something's come up). */
    stopResting(seconds = 0.35) {
        if (this.attack?.rest && !this.attack.stopping) {
            this.attack.stopping = { start: this.time, length: seconds };
        }
    }

    /**
     * React to a blow (a REACTIONS key). `from` is where it came from, as an angle in the
     * character's own frame (0 straight ahead, positive to its left).
     */
    react(name, { from = 0 } = {}) {
        const reaction = REACTIONS[name] ?? REACTIONS.strike;

        this.reactions.push({ reaction, start: this.time, side: Math.sin(from) >= 0 ? 1 : -1, front: Math.cos(from) >= 0 ? 1 : -1 });
    }

    /** Fall down dead, away from `from` (an angle as for react). */
    die({ from = 0 } = {}) {
        this.attack = null;
        this.fall = { start: this.time, backwards: Math.cos(from) >= 0 };
        this.guardTarget = 0;
    }

    /** Get back up (alive again): no fall, attack or reactions. */
    revive() {
        this.fall = null;
        this.attack = null;
        this.reactions = [];
        this.guard = 0;
    }

    /** Is anything being done (an attack, a reaction or a fall)? */
    get busy() {
        return Boolean(this.attack || this.reactions.length || this.fall);
    }

    /**
     * Layer the actions over the pose the walk has set (rig.rotations and rig.offset). Returns
     * false while falling or lying dead (the feet aren't to be kept planted).
     */
    apply(dt) {
        this.time += dt;
        this.guard += Math.sign(this.guardTarget - this.guard) * Math.min(Math.abs(this.guardTarget - this.guard), dt * 4);
        this.reaching = [];

        if (this.seated) {
            this.#sit();
        }

        if (this.guard > 0.001 && this.guardName) {
            this.#blend(GUARD_TRACKS.get(this.guardName), 0, smooth(0, 1, this.guard), false);
        }

        if (this.attack) {
            const { tracks, start, hitAt, duration, mirror, stopping = null } = this.attack;
            const elapsed = this.time - start;
            const easing = stopping ? 1 - smooth(0, stopping.length, this.time - stopping.start) : 1;

            if (elapsed >= duration || easing <= 0) {
                this.attack = null;
            } else {
                // Key time: 0 to 1 until the blow lands, 1 to 2 after
                const key = elapsed < hitAt ? elapsed / hitAt : 1 + (elapsed - hitAt) / Math.max(1e-3, duration - hitAt);
                const weight = smooth(0, 0.3, key) * (1 - smooth(1.55, 2, key)) * easing;

                this.#blend(tracks, key, weight, mirror);
            }
        }

        this.reactions = this.reactions.filter((playing) => {
            const t = (this.time - playing.start) / playing.reaction.length;

            if (t >= 1) {
                return false;
            }

            this.#add(playing.reaction.pose(t, playing));

            return true;
        });

        if (this.fall) {
            this.reaching = [];
            this.#fall(this.time - this.fall.start);

            return false;
        }

        // (Sitting, the feet stay where the legs put them)
        return !this.seated;
    }

    // Sit: the legs bent over the seat, the pelvis lowered onto it
    #sit() {
        const rig = this.rig;
        const scale = this.character.height / 1.7;
        const hips = rig.heads[rig.index.get("Hips")].y;

        for (const [joint, angles] of Object.entries(SITTING)) {
            const index = rig.index.get(joint);

            if (index !== undefined) {
                const { kind, side } = rig.joints[index];

                rig.rotations[index].copy(jointRotation(kind, side, angles, _rotation));
            }
        }

        rig.offset.set(0, SEAT.height + SEAT.flesh * scale - hips, -SEAT.back * scale);
    }

    /** Reach the hands to where the actions want them (once the body is posed and the feet planted). */
    place() {
        for (const { hands, weight } of this.reaching) {
            // A hand holding the other's weapon goes second
            const order = HANDS.filter((side) => hands[side]).sort((a, b) => Number("on" in hands[a]) - Number("on" in hands[b]));
            const grips = {};

            for (const side of order) {
                grips[side] = this.#reach(side, hands[side], weight, grips[side === "right" ? "left" : "right"]);
            }
        }
    }

    // Blend the joints towards an action's pose at a key time, by `weight`; hands' places are
    // kept for place()
    #blend({ times, tracks }, key, weight, mirror) {
        const rig = this.rig;
        const hands = {};

        for (const { joint, names, values } of tracks) {
            const value = (n) => {
                const sampled = sample(times, values, n, key);

                return mirror && MIRRORED.has(names[n]) ? -sampled : sampled;
            };

            if (joint === "offset") {
                const [x, y, z] = [0, 1, 2].map((n) => sample(times, values, n, key));

                rig.offset.x += (mirror ? -x : x) * weight;
                rig.offset.y += y * weight;
                rig.offset.z += z * weight;
                continue;
            }

            const name = mirror ? mirrored(joint) : joint;

            if (HANDS.includes(joint)) {
                const hand = {};

                names.forEach((channel, n) => {
                    if (channel === "on") {
                        hand.on = value(n);
                    } else {
                        const vector = channel.slice(0, -1);

                        hand[vector] ??= [0, 0, 0];
                        hand[vector]["XYZ".indexOf(channel.at(-1))] = value(n);
                    }
                });
                hands[name] = hand;
                continue;
            }

            const index = rig.index.get(name);

            if (index === undefined) {
                continue;
            }

            const angles = {};

            names.forEach((angle, n) => (angles[angle] = value(n)));

            const { kind, side } = rig.joints[index];

            jointRotation(kind, side, angles, _rotation);
            rig.rotations[index].slerp(_rotation, weight);
        }

        if (Object.keys(hands).length && weight > 0.001) {
            this.reaching.push({ hands, weight });
        }
    }

    // Add angles (and a pelvis offset) to the pose
    #add(pose) {
        const rig = this.rig;

        for (const [joint, angles] of Object.entries(pose)) {
            if (joint === "offset") {
                rig.offset.x += angles[0];
                rig.offset.y += angles[1];
                rig.offset.z += angles[2];
                continue;
            }

            const index = rig.index.get(joint);

            if (index !== undefined) {
                const { kind, side } = rig.joints[index];

                rig.rotations[index].multiply(jointRotation(kind, side, angles, _rotation));
            }
        }
    }

    // The body's measurements the hands are placed by: each shoulder in the chest's frame, the
    // arms' length, and each hand's socket (where it holds things). Measured again when the body
    // changes shape
    #measure() {
        const character = this.character;

        if (this.body?.positions !== character.positions) {
            const rig = this.rig;
            const head = (name) => rig.heads[rig.index.get(name)];
            const chest = head("Spine2");

            this.body = {
                positions: character.positions,
                shoulders: { right: head("RightArm").clone().sub(chest), left: head("LeftArm").clone().sub(chest) },
                arm: head("RightForeArm").distanceTo(head("RightArm")) + head("RightHand").distanceTo(head("RightForeArm")),
                sockets: { right: socketOn(character, "rightHand"), left: socketOn(character, "leftHand") },
            };
        }

        return this.body;
    }

    // Reach one hand to its place, blending from where the walk and joint angles put it by
    // `weight`. Returns its grip: { position, point, edge } in the world
    #reach(side, hand, weight, other) {
        const rig = this.rig;
        const Side = side === "right" ? "Right" : "Left";
        const body = this.#measure();
        const chest = rig.bone("Spine2");
        const handBone = rig.bone(`${Side}Hand`);
        let grip;

        this.character.object.getWorldQuaternion(_frame);

        if ("on" in hand) {
            if (!other) {
                return null;
            }

            // Further down the other hand's weapon, held the same way
            grip = { position: other.position.clone().addScaledVector(other.point, -hand.on), point: other.point.clone(), edge: other.edge.clone() };
        } else {
            const shoulder = chest.localToWorld(_shoulder.copy(body.shoulders[side]));
            const position = _grip.fromArray(hand.at).multiplyScalar(body.arm).applyQuaternion(_frame).add(shoulder);

            grip = { position: position.clone(), point: null, edge: null };

            if (hand.point) {
                grip.point = new THREE.Vector3().fromArray(hand.point).normalize().applyQuaternion(_frame);

                const edge = new THREE.Vector3().fromArray(hand.edge ?? [0, 0, 1]).applyQuaternion(_frame);

                edge.addScaledVector(grip.point, -edge.dot(grip.point));

                if (edge.lengthSq() < 1e-6) {
                    edge.set(1, 0, 0).addScaledVector(grip.point, -grip.point.x);
                }

                grip.edge = edge.normalize();
            }
        }

        // How the hand turns so what it holds points the way it should: the item's frame in the
        // hand (or, holding nothing, the socket's)
        const item = this.character.items.find((model) => model.parent === handBone);
        const socket = body.sockets[side];
        const itemPosition = item ? item.position : socket.position;
        const saved = [`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`].map((name) => rig.bone(name).quaternion.clone());

        if (grip.point) {
            _item.copy(item ? item.quaternion : socket.quaternion);
            _across.crossVectors(grip.point, grip.edge);
            _basis.makeBasis(_across, grip.point, grip.edge);
            _hand.setFromRotationMatrix(_basis).multiply(_item.invert());
        } else {
            handBone.getWorldQuaternion(_hand);
        }

        // Where the wrist must be for the grip to be there, in the character's space
        _wrist.copy(itemPosition).applyQuaternion(_hand).negate().add(grip.position);
        this.character.object.worldToLocal(_wrist);
        rig.reach(`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`, _wrist);

        if (grip.point) {
            handBone.parent.getWorldQuaternion(_parent);
            handBone.quaternion.copy(_parent.invert().multiply(_hand));
        }

        // Blend with where the arm was
        if (weight < 1) {
            [`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`].forEach((name, i) => {
                const bone = rig.bone(name);

                bone.quaternion.copy(saved[i].slerp(bone.quaternion, weight));
            });
        }

        rig.bone(`${Side}Arm`).updateMatrixWorld(true);

        // Where the grip ended up (for a second hand on the same weapon)
        if (grip.point) {
            handBone.getWorldQuaternion(_hand);
            grip.position.copy(itemPosition).applyQuaternion(_hand).add(handBone.getWorldPosition(_wrist));
            grip.point.set(0, 1, 0).applyQuaternion(_item.copy(item ? item.quaternion : socket.quaternion).premultiply(_hand));
            grip.edge.set(0, 0, 1).applyQuaternion(_item);
        }

        return grip;
    }

    // Falling down: the knees give, the body topples (backwards, or forwards when hit from
    // behind) and lands, arms flung out, then lies still
    #fall(elapsed) {
        const rig = this.rig;
        const { backwards } = this.fall;
        const buckle = smooth(0, FALL.buckle, elapsed);
        const toppling = Math.min(1, Math.max(0, (elapsed - FALL.buckle * 0.6) / FALL.topple));
        const tilt = toppling * toppling; // falling faster and faster
        const landed = elapsed - FALL.buckle * 0.6 - FALL.topple;
        const bounce = landed > 0 ? Math.sin(Math.min(1, landed / FALL.settle) * Math.PI) * 0.06 * (1 - Math.min(1, landed / FALL.settle)) : 0;
        const angle = (tilt - bounce) * 88 * DEG;
        const direction = backwards ? -1 : 1;
        const hips = rig.heads[0].y;

        // Knees and back give way, arms fly out
        const limp = { ...spine({ flex: (backwards ? -8 : 18) * tilt + 14 * buckle * (1 - tilt) }), Neck: { flex: backwards ? -10 : 10 }, Head: { flex: (backwards ? -15 : 5) * tilt }, LeftUpLeg: { flex: 30 * buckle * (1 - tilt) + 8 }, RightUpLeg: { flex: 40 * buckle * (1 - tilt) + 15 }, LeftLeg: { flex: 55 * buckle * (1 - tilt) + 10 }, RightLeg: { flex: 70 * buckle * (1 - tilt) + 25 }, LeftFoot: { flex: -20 }, RightFoot: { flex: -25 }, LeftArm: { abduct: 25 + 50 * tilt, flex: backwards ? 20 : 40 }, RightArm: { abduct: 30 + 45 * tilt, flex: backwards ? 30 : 50 }, LeftForeArm: { flex: 25 }, RightForeArm: { flex: 35 } };

        for (const [joint, angles] of Object.entries(limp)) {
            const index = rig.index.get(joint);
            const { kind, side } = rig.joints[index];

            rig.rotations[index].slerp(jointRotation(kind, side, angles, _rotation), Math.max(buckle, tilt));
        }

        // The whole body turns about the pelvis to lie flat, the pelvis dropping to the ground
        // and ending up behind (or in front of) where the feet were
        _fall.setFromAxisAngle(_axis.set(1, 0, 0), direction * angle);
        rig.rotations[0].premultiply(_fall);
        rig.offset.set(0, -hips * 0.22 * buckle * (1 - tilt) + (0.14 - hips) * tilt, direction * hips * 0.82 * tilt);
    }
}
