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
// A key pose says where the hands are and how they're turned; the arms reach there themselves
// as real arms would (Rig.reachArm: the shoulder, the elbow's one-way hinge, the forearm turning
// the palm and the wrist bending, each within its range, the elbow swivelled the way that
// strains least and keeps the wrist nearest straight), so a sword swings through where an enemy
// stands whatever the body's size. A hand's place is `at` [x, y, z]: the grip, measured from its
// shoulder (which moves as the body twists and leans) in arm lengths, in the character's frame
// (x to its left, y up, z forward, towards whoever it's fighting). A hand holding something says
// which way it points (`point`) and which way its edge faces (`edge`: a blade's cutting edge, the
// knuckles, a book's spine); an empty hand, which way its palm faces (`palm`) and its fingers
// point (`towards`), and its fingers' `shape` (CURLS). A hand can ask for its elbow to point a
// way (`elbow`: an archer's, up behind), and say how its forearm and wrist rest when nothing
// turns them (`pronate` degrees, `wrist` { flex, deviate }). The other hand of a two-handed
// weapon holds it `on` metres further down or, given its own place too, where the shaft passes
// through both hands' places. A hand is reached only from the first key that places it to the
// last (easing in and out; the arm is the walk's before and after). A key leaving out a hand's
// turn or its elbow lets them ease back to how they come naturally; any other value it leaves
// out runs on the line between the keys either side that give it. An action eases out after its
// last key before the end (key time 1.55 at the soonest). The spine, pelvis and the pelvis's
// `offset` (metres: x left, y up, z forward, which the legs bend to follow) are joint angles
// (rig.js), as are arms left to swing.
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
import { ITEMS, socketOn } from "./equipment.js";
import { blendRotation, jointRotation } from "./rig.js";

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
// A fist in a boxer's guard (side 1: the right, -1: the left): the rear by the chin, the lead a
// little lower and out in front, the knuckles forward and up, the palm in and the elbow down by
// the ribs
const fist = (side, lead = side < 0) => ({ at: [side * (lead ? 0.24 : 0.28), lead ? 0.1 : 0.2, lead ? 0.62 : 0.42], palm: [side, -0.2, 0], towards: [0, 0.5, 0.85], elbow: [side * 0.25, -1, 0] });

// The free hand (the left, with a weapon in the right), relaxed, the wrist straight and the palm
// turned partly down: before the belly on guard; reaching out towards the enemy as a blow is
// wound up, to balance it; drawn in to the chest as it lands, turning the body into it; or
// swung back to the hip (a lunge)
const FREE = { at: [-0.22, -0.58, 0.5], pronate: 40, wrist: { flex: 8, deviate: -5 }, shape: "relaxed" };
const REACH_OUT = { at: [-0.15, -0.35, 0.75], pronate: 20, wrist: { flex: -5, deviate: 0 }, shape: "relaxed" };
const DRAW_IN = { at: [-0.08, -0.62, 0.32], pronate: 30, shape: "relaxed" };
const SWUNG_BACK = { at: [0.05, -0.85, -0.2], pronate: 10, shape: "relaxed" };

/** How each weapon is held while fighting, eased into when a fight starts. */
export const GUARDS = Object.freeze({
    // (A sword before the right hip, the forearm level and the elbow at the side, the point at the enemy's face)
    sword: { right: { at: [0.1, -0.55, 0.72], point: [0.2, 0.6, 0.78], edge: [-0.35, -0.7, 0.63] }, left: FREE },
    // (Two-handed: the left hand's place too, the shaft lying along the line from it through the right)
    staff: { right: { at: [0.31, -0.57, 0.7] }, left: { on: 0, at: [-0.26, -0.86, 0.41] } },
    wand: { right: { at: [0.1, -0.55, 0.72], point: [0.1, 0.45, 0.9] }, left: FREE },
    grimoire: { left: book, right: { at: [0.22, -0.58, 0.5], pronate: 40, wrist: { flex: 8, deviate: -5 }, shape: "relaxed" } },
    hammer: { right: { at: [0.18, -0.42, 0.65], edge: [0.1, -0.3, 0.95] }, left: { on: 0, at: [-0.35, -0.89, 0.31] } },
    // (The bow low before the body, its back to the enemy, the drawing hand near the string)
    bow: { left: { at: [-0.15, -0.7, 0.55], point: [-0.2, 0.85, 0.5], edge: [0, -0.5, 0.85] }, right: { at: [0.3, -0.6, 0.5], pronate: 40, shape: "relaxed" } },
    punch: { right: fist(1), left: fist(-1), ...spine({ flex: 6 }) },
    cleaver: { right: { at: [0.1, -0.5, 0.65], point: [0.2, 0.7, 0.65], edge: [-0.2, -0.65, 0.73] }, left: FREE },
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
        // (Each key says which way the edge faces too: the true edge leads each cut, the palm up
        // for a forehand and down for a backhand)
        variants: [
            variant("diagonal slash", SWORD,
                // Up by the right shoulder, the blade upright, turning away, the free hand out...
                [0.62, { right: { at: [-0.1, 0.3, 0.1], point: [0.2, 0.75, -0.6], edge: [-0.25, 0.6, 0.75] }, left: REACH_OUT, ...spine({ turn: -26, bend: 6 }), Hips: { turn: 10 }, offset: [0, 0, -0.03] }],
                // ...down and across through the enemy, the arm straightening, stepping into it...
                [1, { right: { at: [0.3, -0.3, 1.08], point: [0.4, 0.05, 0.9], edge: [0.45, -0.85, 0] }, left: DRAW_IN, ...spine({ flex: 10, turn: 20, bend: -4 }), Hips: { turn: -12 }, offset: [0, -0.05, 0.08] }],
                // ...and on down past the left hip
                [1.35, { right: { at: [0.55, -0.7, 0.7], point: [0.7, -0.4, 0.6], edge: [0.3, -0.85, -0.4] }, left: DRAW_IN, ...spine({ flex: 12, turn: 26 }), Hips: { turn: -15 }, offset: [0, -0.06, 0.07] }]),
            variant("backhand slash", SWORD,
                // Drawn across to the left shoulder, the blade back over it, then swept out to the right
                [0.6, { right: { at: [0.55, 0.2, 0.2], point: [0.45, 0.5, -0.75], edge: [0.5, 0.55, 0.67] }, left: { at: [0.05, -0.62, 0.45], pronate: 50, shape: "relaxed" }, ...spine({ turn: 26, bend: -4 }), Hips: { turn: -8 }, offset: [0, 0, -0.03] }],
                [1, { right: { at: [-0.35, -0.32, 1.02], point: [-0.4, 0.15, 0.9], edge: [-0.75, -0.6, 0.1] }, left: { at: [0.1, -0.7, 0.2], pronate: 20, shape: "relaxed" }, ...spine({ flex: 8, turn: -22, bend: 4 }), Hips: { turn: 12 }, offset: [0, -0.04, 0.08] }],
                [1.35, { right: { at: [-0.72, -0.45, 0.6], point: [-0.9, -0.1, 0.4], edge: [-0.3, -0.9, -0.3] }, left: { at: [0.12, -0.72, 0.15], pronate: 20, shape: "relaxed" }, ...spine({ flex: 10, turn: -28 }), Hips: { turn: 14 }, offset: [0, -0.05, 0.06] }]),
            variant("overhead cut", SWORD,
                // Raised high over the head, the blade back, then brought straight down
                [0.6, { right: { at: [0.08, 0.75, 0.05], point: [0.05, 0.05, -1], edge: [-0.04, 1, 0.05] }, left: REACH_OUT, ...spine({ flex: -10 }), offset: [0, 0.02, -0.04] }],
                [1, { right: { at: [0.25, -0.25, 1.1], point: [0.08, 0.25, 0.96], edge: [-0.04, -0.95, 0.32] }, left: DRAW_IN, ...spine({ flex: 18 }), offset: [0, -0.07, 0.1] }],
                [1.35, { right: { at: [0.25, -0.75, 0.8], point: [0.18, -0.2, 0.96], edge: [-0.2, -0.98, -0.09] }, left: DRAW_IN, ...spine({ flex: 22 }), offset: [0, -0.08, 0.09] }]),
            variant("thrust", SWORD,
                // Drawn back to the hip, the elbow behind, point forward, then lunged straight at the enemy
                [0.6, { right: { at: [0, -0.62, 0.3], point: [0.12, 0.15, 1], edge: [-0.44, -0.88, 0.18], elbow: [-0.3, -0.5, -0.8] }, left: REACH_OUT, ...spine({ turn: -20 }), Hips: { turn: 12 }, offset: [0, -0.02, -0.06] }],
                [1, { right: { at: [0.3, -0.28, 1.12], point: [0.1, 0.18, 0.98], edge: [-0.22, -0.95, 0.24] }, left: SWUNG_BACK, ...spine({ flex: 8, turn: 22 }), Hips: { turn: -14 }, offset: [0, -0.07, 0.16] }],
                [1.35, { right: { at: [0.28, -0.3, 1.05], point: [0.1, 0.25, 0.96], edge: [-0.07, -0.94, 0.33] }, left: SWUNG_BACK, ...spine({ flex: 8, turn: 20 }), Hips: { turn: -12 }, offset: [0, -0.07, 0.14] }]),
            variant("rising cut", SWORD,
                // Low at the right side, the point down before the feet, then swept up and across
                [0.6, { right: { at: [-0.3, -0.88, 0.3], point: [0, -0.44, 0.9], edge: [-0.74, -0.6, -0.3] }, left: REACH_OUT, ...spine({ flex: 12, turn: -24 }), Hips: { turn: 10 }, offset: [0, -0.06, -0.02] }],
                [1, { right: { at: [0.2, -0.3, 1], point: [0.3, 0.55, 0.75], edge: [-0.44, -0.63, 0.64] }, left: DRAW_IN, ...spine({ flex: 2, turn: 18, bend: -6 }), Hips: { turn: -10 }, offset: [0, -0.02, 0.07] }],
                [1.35, { right: { at: [0.45, 0.3, 0.6], point: [0.4, 0.88, 0.1], edge: [0.04, -0.05, 1] }, left: DRAW_IN, ...spine({ flex: -4, turn: 24, bend: -8 }), Hips: { turn: -12 }, offset: [0, 0, 0.05] }]),
        ],
    },
    staff: {
        // (Both hands on it: the head beyond the right, the shaft from the left through it)
        variants: [
            variant("overhead strike", STAFF,
                // Raised over the right shoulder, the head back, then brought down on the enemy
                [0.6, { right: { at: [0.03, 0.41, 0.18] }, left: { on: 0, at: [-0.43, 0.14, 0.34] }, ...spine({ flex: -6, turn: -18 }), offset: [0, 0.01, -0.04] }],
                [1, { right: { at: [0.58, -0.56, 0.56] }, left: { on: 0, at: [-0.11, -0.69, 0.49] }, ...spine({ flex: 16, turn: 12 }), offset: [0, -0.05, 0.08] }],
                [1.3, { right: { at: [0.26, -0.92, 0.68] }, left: { on: 0, at: [-0.4, -1.11, 0.13] }, ...spine({ flex: 18, turn: 14 }), offset: [0, -0.06, 0.07] }]),
            variant("sweep", STAFF,
                // Swung back round to the right, then swept flat across to the left
                [0.6, { right: { at: [-0.5, -0.26, 0.3] }, left: { on: 0, at: [-0.12, -0.46, 0.39] }, ...spine({ turn: -32 }), Hips: { turn: 12 }, offset: [0, -0.02, -0.03] }],
                [1, { right: { at: [0.19, -0.69, 0.45] }, left: { on: 0, at: [-0.59, -0.83, 0.49] }, ...spine({ flex: 6, turn: 22 }), Hips: { turn: -12 }, offset: [0, -0.05, 0.08] }],
                [1.35, { right: { at: [0.82, -0.53, 0.06] }, left: { on: 0, at: [0.22, -0.64, 0.48] }, ...spine({ flex: 8, turn: 30 }), Hips: { turn: -15 }, offset: [0, -0.05, 0.06] }]),
            variant("thrust", STAFF,
                // Drawn back low, then driven head first at the enemy
                [0.6, { right: { at: [0.2, -0.62, 0.2] }, left: { on: 0, at: [-0.43, -0.7, -0.23] }, ...spine({ turn: -14 }), offset: [0, -0.02, -0.07] }],
                [1, { right: { at: [0.33, -0.64, 0.77] }, left: { on: 0, at: [-0.28, -0.87, 0.5] }, ...spine({ flex: 10, turn: 12 }), offset: [0, -0.07, 0.16] }],
                [1.3, { right: { at: [0.46, -0.76, 0.57] }, left: { on: 0, at: [-0.23, -0.89, 0.36] }, ...spine({ flex: 10, turn: 10 }), offset: [0, -0.07, 0.14] }]),
            variant("rising strike", STAFF,
                // The head low behind on the right, then swung up under the enemy's guard
                [0.6, { right: { at: [-0.28, -0.9, 0.17] }, left: { on: 0, at: [-0.08, -0.62, 0.57] }, ...spine({ flex: 14, turn: -18 }), offset: [0, -0.06, -0.02] }],
                [1, { right: { at: [0.28, -0.52, 0.63] }, left: { on: 0, at: [-0.35, -0.79, 0.42] }, ...spine({ flex: 4, turn: 10 }), offset: [0, -0.03, 0.08] }],
                [1.35, { right: { at: [0.18, -0.26, 0.5] }, left: { on: 0, at: [-0.55, -0.48, 0.57] }, ...spine({ flex: -4, turn: 12 }), offset: [0, -0.01, 0.06] }]),
            variant("spinning strike", STAFF,
                // Wound far round to the right, then the whole body turns into the blow
                [0.5, { right: { at: [-0.44, -0.08, -0.06] }, left: { on: 0, at: [0.06, -0.55, -0.07] }, ...spine({ turn: -45, flex: -4 }), Hips: { turn: 25 }, offset: [0, 0, -0.04] }],
                [1, { right: { at: [0.25, -0.66, 0.47] }, left: { on: 0, at: [-0.36, -0.9, 0.53] }, ...spine({ flex: 8, turn: 30 }), Hips: { turn: -25 }, offset: [0, -0.05, 0.1] }],
                [1.35, { right: { at: [0.8, -0.77, -0.26] }, left: { on: 0, at: [0.06, -0.99, 0.2] }, ...spine({ flex: 8, turn: 40 }), Hips: { turn: -30 }, offset: [0, -0.05, 0.07] }]),
        ],
    },
    wand: {
        // (Pinched like a pen, pointing along the fingers: cast with the arm reaching out straight at the enemy)
        variants: [
            variant("flick", WAND,
                // Tip up and back, the wrist cocked, then flicked at the enemy
                [0.65, { right: { at: [-0.1, 0.3, 0.3], point: [0, 0.75, -0.65] }, left: FREE, ...spine({ turn: -10, flex: -4 }) }],
                [1, { right: { at: [0.15, -0.12, 1.18], point: [0.05, 0, 1] }, left: DRAW_IN, ...spine({ turn: 8, flex: 4 }) }],
                [1.45, { right: { at: [0.15, -0.16, 1.16], point: [0.05, -0.08, 1] }, left: DRAW_IN, ...spine({ turn: 8, flex: 4 }) }]),
            variant("jab", WAND,
                // Drawn in to the chest, then jabbed straight out
                [0.6, { right: { at: [0.05, -0.3, 0.35], point: [0, 0.35, 0.9] }, left: FREE, ...spine({ turn: -8 }), offset: [0, 0, -0.03] }],
                [1, { right: { at: [0.15, -0.1, 1.19], point: [0.02, 0.02, 1] }, left: DRAW_IN, ...spine({ turn: 10, flex: 4 }), offset: [0, -0.02, 0.06] }],
                [1.4, { right: { at: [0.15, -0.12, 1.17], point: [0.02, 0, 1] }, left: DRAW_IN, ...spine({ turn: 10, flex: 4 }), offset: [0, -0.02, 0.05] }]),
            variant("circle", WAND,
                // A circle traced in the air, then pointed
                [0.3, { right: { at: [-0.1, -0.2, 0.65], point: [0, 0.7, 0.7] }, left: FREE, ...spine({ turn: -4 }) }],
                [0.5, { right: { at: [0.1, 0.12, 0.62], point: [0.2, 0.9, 0.3] }, left: FREE, ...spine({ turn: 2, flex: -3 }) }],
                [0.75, { right: { at: [0.28, -0.15, 0.58], point: [0.3, 0.6, 0.7] }, left: FREE, ...spine({ turn: 6 }) }],
                [1, { right: { at: [0.12, -0.1, 1.18], point: [0.03, 0.02, 1] }, left: DRAW_IN, ...spine({ turn: 8, flex: 4 }) }],
                [1.4, { right: { at: [0.12, -0.13, 1.16], point: [0.03, -0.05, 1] }, left: DRAW_IN, ...spine({ turn: 8, flex: 4 }) }]),
            variant("flourish", WAND,
                // Raised high overhead, then snapped down to point
                [0.65, { right: { at: [0.05, 0.55, 0.25], point: [0, 0.9, -0.4] }, left: REACH_OUT, ...spine({ flex: -8 }), offset: [0, 0.02, -0.02] }],
                [1, { right: { at: [0.15, -0.15, 1.16], point: [0.03, -0.12, 1] }, left: DRAW_IN, ...spine({ flex: 8, turn: 6 }), offset: [0, -0.03, 0.05] }],
                [1.4, { right: { at: [0.15, -0.22, 1.12], point: [0.03, -0.2, 0.98] }, left: DRAW_IN, ...spine({ flex: 8, turn: 6 }), offset: [0, -0.03, 0.04] }]),
            variant("low sweep", WAND,
                // Swept up from low at the side
                [0.65, { right: { at: [-0.3, -0.7, 0.4], point: [-0.2, -0.5, 0.85] }, left: REACH_OUT, ...spine({ flex: 10, turn: -12 }), offset: [0, -0.04, 0] }],
                [1, { right: { at: [0.18, -0.05, 1.18], point: [0.05, 0.1, 1] }, left: DRAW_IN, ...spine({ turn: 10 }), offset: [0, -0.01, 0.05] }],
                [1.4, { right: { at: [0.18, -0.08, 1.16], point: [0.05, 0.08, 1] }, left: DRAW_IN, ...spine({ turn: 10 }), offset: [0, -0.01, 0.04] }]),
        ],
    },
    grimoire: {
        // (The fire gathered in the cupped right hand, then thrown from the open palm)
        variants: [
            variant("throw from the palm", GRIMOIRE,
                // Gathering the fire in the hand, drawn back by the shoulder, then thrown
                [0.55, { left: book, right: { at: [-0.2, 0.05, 0.35], palm: [0.49, 0.87, 0], towards: [-0.09, 0.05, 1], shape: "cup" }, ...spine({ turn: -18, flex: -5 }), offset: [0, 0.01, -0.03] }],
                [0.85, { left: book, right: { at: [-0.18, 0.08, 0.3], palm: [0.4, 0.9, 0], towards: [0, 0.25, 1], shape: "cup" }, ...spine({ turn: -20, flex: -6 }), offset: [0, 0.01, -0.035] }],
                [0.93, { right: { at: [-0.03, 0.03, 0.69], palm: [0.83, 0.14, 0.53], towards: [-0.51, 0.55, 0.66], shape: "cup" } }],
                [1, { left: book, right: { at: [0.12, -0.02, 1.07], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ turn: 12, flex: 8 }), offset: [0, -0.03, 0.07] }],
                [1.5, { left: book, right: { at: [0.12, -0.06, 1.02], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ turn: 10, flex: 8 }), offset: [0, -0.03, 0.06] }]),
            variant("overhand hurl", GRIMOIRE,
                // Up by the ear, then hurled forward and down
                [0.55, { left: book, right: { at: [-0.12, 0.35, 0.1], palm: [0.2, 0.2, 1], towards: [0, 1, -0.2], shape: "cup" }, ...spine({ turn: -20, flex: -8 }), offset: [0, 0.02, -0.04] }],
                [1, { left: book, right: { at: [0.12, 0, 1.04], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ turn: 14, flex: 10 }), offset: [0, -0.04, 0.08] }],
                [1.5, { left: book, right: { at: [0.18, -0.3, 0.95], palm: [0.2, -0.6, 0.8], towards: [0, 0.6, 0.8], shape: "relaxed" }, ...spine({ turn: 14, flex: 12 }), offset: [0, -0.04, 0.06] }]),
            variant("side-arm", GRIMOIRE,
                // Down by the right hip, then swung round and let go
                [0.55, { left: book, right: { at: [-0.45, -0.45, 0.15], pronate: 0, shape: "cup" }, ...spine({ turn: -28 }), Hips: { turn: 10 }, offset: [0, -0.01, -0.03] }],
                [1, { left: book, right: { at: [0.15, -0.1, 1.12], palm: [0.13, -0.34, 0.93], towards: [0.69, 0.71, 0.16], shape: "open" }, ...spine({ turn: 18, flex: 6 }), Hips: { turn: -10 }, offset: [0, -0.03, 0.07] }],
                [1.5, { left: book, right: { at: [0.4, -0.2, 0.85], palm: [0.5, -0.3, 0.8], towards: [0.7, 0, 0.7], shape: "relaxed" }, ...spine({ turn: 22, flex: 6 }), Hips: { turn: -12 }, offset: [0, -0.03, 0.05] }]),
            variant("palm push", GRIMOIRE,
                // Drawn in to the chest, the fire growing, then pushed out at arm's length
                [0.55, { left: book, right: { at: [0.1, -0.1, 0.28], palm: [0.52, 0.13, 0.84], towards: [0.12, 0.97, -0.22], shape: "cup" }, ...spine({ flex: -3 }), offset: [0, 0, -0.03] }],
                [0.8, { left: book, right: { at: [0.12, -0.12, 0.24], palm: [0.52, -0.07, 0.85], towards: [0.23, 0.97, -0.07], shape: "cup" }, ...spine({ flex: -4 }), offset: [0, 0, -0.04] }],
                [0.9, { right: { at: [0.11, -0.07, 0.66], palm: [0.26, -0.17, 0.95], towards: [0.14, 0.98, 0.14], shape: "cup" } }],
                [1, { left: book, right: { at: [0.1, -0.02, 1.08], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ flex: 6 }), offset: [0, -0.03, 0.08] }],
                [1.5, { left: book, right: { at: [0.1, -0.05, 1.04], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ flex: 6 }), offset: [0, -0.03, 0.07] }]),
            variant("underhand lob", GRIMOIRE,
                // Cupped low, then lobbed up and out
                [0.55, { left: book, right: { at: [-0.15, -0.65, 0.25], palm: [0.2, 1, 0.2], towards: [0, 0, 1], shape: "cup" }, ...spine({ flex: 10, turn: -12 }), offset: [0, -0.04, -0.02] }],
                [1, { left: book, right: { at: [0.1, 0.1, 1.08], palm: [0.16, 0.52, 0.84], towards: [-0.97, -0.06, 0.22], shape: "open" }, ...spine({ flex: -4, turn: 10 }), offset: [0, 0, 0.06] }],
                [1.5, { left: book, right: { at: [0.12, 0.15, 1], palm: [0.14, 0.68, 0.72], towards: [-0.79, -0.36, 0.49], shape: "open" }, ...spine({ flex: -4, turn: 10 }), offset: [0, 0, 0.05] }]),
        ],
    },
    hammer: {
        // (Both hands on the haft, the left at its foot, the striking face turned the way the blow goes)
        variants: [
            variant("overhead smash", HAMMER,
                // High over the head, the head hanging back, arching back, then down with the whole body onto the enemy
                [0.6, { right: { at: [0.18, 0.82, 0.22] }, left: { on: 0, at: [-0.27, 0.58, 0.53] }, ...spine({ flex: -12 }), offset: [0, 0.02, -0.05] }],
                [1, { right: { at: [0.45, -0.75, 0.82] }, left: { on: 0, at: [-0.26, -0.92, 0.38] }, ...spine({ flex: 18 }), offset: [0, -0.1, 0.1] }],
                [1.35, { right: { at: [0.62, -0.85, 0.11] }, left: { on: 0, at: [-0.1, -0.82, -0.1] }, ...spine({ flex: 28 }), offset: [0, -0.14, 0.1] }]),
            variant("side swing", HAMMER,
                // Swung back round to the right, then flat into the enemy's side, the face first
                [0.6, { right: { at: [-0.41, -0.07, 0.09] }, left: { on: 0, at: [-0.04, -0.66, -0.07] }, ...spine({ turn: -35 }), Hips: { turn: 15 }, offset: [0, -0.02, -0.04] }],
                [1, { right: { at: [0.19, -0.68, 0.47] }, left: { on: 0, at: [-0.51, -0.89, 0.5] }, ...spine({ flex: 8, turn: 25 }), Hips: { turn: -18 }, offset: [0, -0.06, 0.08] }],
                [1.35, { right: { at: [0.61, -0.59, 0.04] }, left: { on: 0, at: [-0.13, -0.8, 0.38] }, ...spine({ flex: 12, turn: 35 }), Hips: { turn: -20 }, offset: [0, -0.07, 0.06] }]),
            variant("diagonal chop", HAMMER,
                // Up over the right shoulder, then down and across
                [0.6, { right: { at: [-0.3, 0.5, 0.26] }, left: { on: 0, at: [-0.61, 0.1, 0.39] }, ...spine({ turn: -22, flex: -8 }), Hips: { turn: 10 }, offset: [0, 0.01, -0.04] }],
                [1, { right: { at: [0.6, -0.83, 0.62] }, left: { on: 0, at: [-0.22, -1.05, 0.42] }, ...spine({ flex: 20, turn: 15 }), Hips: { turn: -10 }, offset: [0, -0.1, 0.1] }],
                [1.35, { right: { at: [0.71, -0.94, 0.07] }, left: { on: 0, at: [-0.08, -0.93, 0] }, ...spine({ flex: 26, turn: 18 }), Hips: { turn: -12 }, offset: [0, -0.12, 0.09] }]),
            variant("upswing", HAMMER,
                // Low behind, then swung up under the enemy's chin
                [0.6, { right: { at: [0, -0.98, 0.61] }, left: { on: 0, at: [-0.53, -0.6, 0.72] }, ...spine({ flex: 18, turn: -15 }), offset: [0, -0.1, -0.03] }],
                [1, { right: { at: [0.32, -0.51, 0.53] }, left: { on: 0, at: [-0.36, -0.76, 0.32] }, ...spine({ flex: -2, turn: 10 }), offset: [0, 0, 0.08] }],
                [1.35, { right: { at: [0.27, -0.15, 0.51] }, left: { on: 0, at: [-0.45, -0.4, 0.6] }, ...spine({ flex: -6, turn: 12 }), offset: [0, 0.01, 0.06] }]),
            variant("leaping slam", HAMMER,
                // Rising up on the toes with it high overhead, then slammed down, crouching into it
                [0.55, { right: { at: [0.15, 0.89, 0.16] }, left: { on: 0, at: [-0.3, 0.65, 0.53] }, ...spine({ flex: -16 }), offset: [0, 0.05, -0.06] }],
                [1, { right: { at: [0.35, -0.8, 0.82] }, left: { on: 0, at: [-0.36, -0.96, 0.39] }, ...spine({ flex: 26 }), offset: [0, -0.16, 0.14] }],
                [1.4, { right: { at: [0.51, -0.87, 0.09] }, left: { on: 0, at: [-0.18, -0.78, -0.23] }, ...spine({ flex: 32 }), offset: [0, -0.18, 0.12] }]),
        ],
    },
    bow: {
        // (Side on to the enemy, the bow arm straight out towards it, the bow's back facing it;
        // three fingers hooked on the string draw it back to an anchor under the jaw, the palm
        // towards the neck and the elbow up behind in line with the arrow, then let it go and
        // fly back past the ear)
        variants: [
            variant("side-on draw", BOW,
                // Up and nocked, the string taken on the fingers...
                [0.3, { left: { at: [-0.22, 0, 0.8], point: [0, 1, 0.1], edge: [0, -0.1, 1] }, right: { at: [0.22, 0.02, 0.78], palm: [1, 0, 0], shape: "hook" }, ...spine({ turn: -40 }), Hips: { turn: -30 }, Head: { turn: 32, flex: 0 }, offset: [0, 0, 0] }],
                // ...drawn to the jaw as the arrow is loosed...
                [1, { left: { at: [-0.3, 0.1, 1.17], point: [0, 1, 0.05], edge: [0, -0.05, 1] }, right: { at: [0.16, 0.22, 0.41], palm: [1, 0, 0], towards: [0, -0.1, 1], elbow: [-1, 0.15, -0.5], shape: "hook" }, ...spine({ turn: -42, flex: -3 }), Hips: { turn: -30 }, Head: { turn: 34, flex: 0 }, offset: [0, -0.02, 0] }],
                // ...and the drawing hand flies back past the ear, the fingers open
                [1.15, { left: { at: [-0.3, 0.1, 1.17], point: [0, 1, 0.05], edge: [0, -0.05, 1] }, right: { at: [0.05, 0.24, 0.12], pronate: 10, elbow: [-1, 0.1, -0.3], shape: "relaxed" }, ...spine({ turn: -42, flex: -3 }), Hips: { turn: -30 }, Head: { turn: 34, flex: 0 }, offset: [0, -0.02, 0] }],
                [1.5, { left: { at: [-0.28, 0.02, 1.1], point: [0, 1, 0.12], edge: [0, -0.12, 1] }, right: { at: [0.12, 0, 0.12], pronate: 30, shape: "relaxed" }, ...spine({ turn: -36 }), Hips: { turn: -30 }, Head: { turn: 28, flex: 0 }, offset: [0, -0.01, 0] }]),
            variant("high draw", BOW,
                // Raised high and drawn back to the jaw, leaning back into it
                [0.3, { left: { at: [-0.25, 0.18, 0.82], point: [0, 1, 0.05], edge: [0, -0.05, 1] }, right: { at: [0.22, 0.18, 0.75], palm: [1, 0, 0], shape: "hook" }, ...spine({ turn: -38, flex: -8 }), Hips: { turn: -30 }, Head: { turn: 30, flex: -6 }, offset: [0, 0, -0.02] }],
                [1, { left: { at: [-0.3, 0.25, 1.13], point: [0, 1, 0.02], edge: [0, -0.02, 1] }, right: { at: [0.17, 0.27, 0.38], palm: [1, 0, 0], towards: [0, 0.05, 1], elbow: [-1, 0.25, -0.5], shape: "hook" }, ...spine({ turn: -40, flex: -8 }), Hips: { turn: -30 }, Head: { turn: 32, flex: -6 }, offset: [0, -0.01, -0.02] }],
                [1.15, { left: { at: [-0.3, 0.25, 1.13], point: [0, 1, 0.02], edge: [0, -0.02, 1] }, right: { at: [0.06, 0.3, 0.1], pronate: 10, elbow: [-1, 0.2, -0.3], shape: "relaxed" }, ...spine({ turn: -40, flex: -8 }), Hips: { turn: -30 }, Head: { turn: 32, flex: -6 }, offset: [0, -0.01, -0.02] }],
                [1.5, { left: { at: [-0.28, 0.08, 1.08], point: [0, 1, 0.1], edge: [0, -0.1, 1] }, right: { at: [0.15, -0.1, 0.2], pronate: 30, shape: "relaxed" }, ...spine({ turn: -34, flex: -4 }), Hips: { turn: -30 }, Head: { turn: 26, flex: -3 }, offset: [0, 0, -0.01] }]),
            variant("snap shot", BOW,
                // A quick half draw to the cheek, hardly turning
                [0.3, { left: { at: [-0.2, -0.02, 0.85], point: [0, 1, 0.12], edge: [0, -0.12, 1] }, right: { at: [0.4, 0, 0.85], palm: [1, 0, 0], shape: "hook" }, ...spine({ turn: -25 }), Hips: { turn: -30 }, Head: { turn: 20, flex: 0 }, offset: [0, 0, 0] }],
                [1, { left: { at: [-0.25, 0.02, 1.12], point: [0, 1, 0.1], edge: [0, -0.1, 1] }, right: { at: [0.3, 0.14, 0.6], palm: [1, 0, 0], towards: [0, -0.1, 1], elbow: [-1, 0.05, -0.5], shape: "hook" }, ...spine({ turn: -28 }), Hips: { turn: -30 }, Head: { turn: 22, flex: 0 }, offset: [0, -0.01, 0] }],
                [1.15, { left: { at: [-0.25, 0.02, 1.12], point: [0, 1, 0.1], edge: [0, -0.1, 1] }, right: { at: [0.22, 0.16, 0.32], pronate: 10, shape: "relaxed" }, ...spine({ turn: -28 }), Hips: { turn: -30 }, Head: { turn: 22, flex: 0 }, offset: [0, -0.01, 0] }],
                [1.5, { left: { at: [-0.22, -0.08, 1.05], point: [0, 1, 0.15], edge: [0, -0.15, 1] }, right: { at: [0.2, -0.2, 0.3], pronate: 30, shape: "relaxed" }, ...spine({ turn: -22 }), Hips: { turn: -30 }, Head: { turn: 18, flex: 0 }, offset: [0, 0, 0] }]),
            variant("crouching shot", BOW,
                // Dropping low on bent knees to draw and loose
                [0.3, { left: { at: [-0.52, -0.04, 0.86], point: [0, 1, 0.1], edge: [0, -0.1, 1] }, right: { at: [0.2, -0.16, 0.92], palm: [1, 0, 0], shape: "hook" }, ...spine({ turn: -38, flex: 6 }), Hips: { turn: -30 }, Head: { turn: 30, flex: -6 }, offset: [0, -0.2, -0.03] }],
                [1, { left: { at: [-0.3, 0.12, 1.16], point: [0, 1, 0.05], edge: [0, -0.05, 1] }, right: { at: [0.16, 0.2, 0.44], palm: [1, 0, 0], towards: [0, -0.1, 1], elbow: [-1, 0.15, -0.5], shape: "hook" }, ...spine({ turn: -40, flex: 6 }), Hips: { turn: -30 }, Head: { turn: 32, flex: -8 }, offset: [0, -0.24, -0.03] }],
                [1.15, { left: { at: [-0.3, 0.12, 1.16], point: [0, 1, 0.05], edge: [0, -0.05, 1] }, right: { at: [0.05, 0.22, 0.14], pronate: 10, elbow: [-1, 0.1, -0.3], shape: "relaxed" }, ...spine({ turn: -40, flex: 6 }), Hips: { turn: -30 }, Head: { turn: 32, flex: -8 }, offset: [0, -0.24, -0.03] }],
                [1.5, { left: { at: [-0.28, 0.02, 1.08], point: [-0.2, 1, 0.05], edge: [0, -0.12, 1] }, right: { at: [0.12, 0, 0.12], pronate: 30, shape: "relaxed" }, ...spine({ turn: -34, flex: 3 }), Hips: { turn: -30 }, Head: { turn: 26, flex: -4 }, offset: [0, -0.12, -0.02] }]),
            variant("canted draw", BOW,
                // The bow tipped over on its side, drawn to the cheek
                [0.3, { left: { at: [-0.22, -0.02, 0.96], point: [0.6, 0.8, 0.1], edge: [0, -0.1, 1] }, right: { at: [0.24, -0.04, 0.84], palm: [0.8, 0.6, 0], shape: "hook" }, ...spine({ turn: -34, bend: -6 }), Hips: { turn: -30 }, Head: { turn: 28, flex: 0 }, offset: [0, 0, 0] }],
                [1, { left: { at: [-0.3, 0.1, 1.15], point: [0.6, 0.8, 0.05], edge: [0, -0.05, 1] }, right: { at: [0.18, 0.2, 0.42], palm: [0.8, 0.6, 0], towards: [0, -0.1, 1], elbow: [-1, 0.3, -0.5], shape: "hook" }, ...spine({ turn: -36, bend: -6 }), Hips: { turn: -30 }, Head: { turn: 30, flex: 0 }, offset: [0, -0.02, 0] }],
                [1.15, { left: { at: [-0.3, 0.1, 1.15], point: [0.6, 0.8, 0.05], edge: [0, -0.05, 1] }, right: { at: [0.07, 0.24, 0.13], pronate: 10, elbow: [-1, 0.2, -0.3], shape: "relaxed" }, ...spine({ turn: -36, bend: -6 }), Hips: { turn: -30 }, Head: { turn: 30, flex: 0 }, offset: [0, -0.02, 0] }],
                [1.5, { left: { at: [-0.28, 0.02, 1.08], point: [0.3, 0.95, 0.1], edge: [0, -0.1, 1] }, right: { at: [0.12, 0, 0.12], pronate: 30, shape: "relaxed" }, ...spine({ turn: -30, bend: -3 }), Hips: { turn: -30 }, Head: { turn: 26, flex: 0 }, offset: [0, -0.01, 0] }]),
        ],
    },
    punch: {
        // (The fist turns as it lands: palm down for a straight punch, the elbow up level with
        // the fist for a hook, the palm to the body for an uppercut)
        alternate: true,
        variants: [
            variant("straight", PUNCH,
                // A little drawn in, then straight out, turning into it, the palm turning down
                [0.5, { right: { at: [0.3, 0.12, 0.4], palm: [1, -0.2, 0], towards: [0, 0.5, 0.85], elbow: [0.25, -1, 0] }, left: fist(-1), ...spine({ flex: 6, turn: -10 }), Hips: { turn: 6 }, offset: [0, -0.01, -0.02] }],
                [1, { right: { at: [0.28, 0.1, 1.15], palm: [0, -1, 0], towards: [0, 0, 1] }, left: fist(-1), ...spine({ flex: 8, turn: 20 }), Hips: { turn: -12 }, offset: [0, -0.03, 0.06] }],
                [1.4, { right: { at: [0.3, 0.14, 0.78], palm: [0.7, -0.7, 0], towards: [0, 0.2, 1] }, left: fist(-1), ...spine({ flex: 7, turn: 10 }), Hips: { turn: -6 }, offset: [0, -0.02, 0.03] }]),
            variant("hook", PUNCH,
                // Out wide, then round into the side of the head, the elbow up level with the fist
                [0.5, { right: { at: [-0.1, 0.1, 0.3], palm: [0.6, -0.6, 0.4], towards: [0.3, 0.4, 0.85], elbow: [-0.6, -0.8, 0] }, left: fist(-1), ...spine({ flex: 6, turn: -18 }), Hips: { turn: 8 }, offset: [0, -0.01, -0.02] }],
                [1, { right: { at: [0.45, 0.12, 0.72], palm: [0, -1, 0], towards: [1, 0, 0.25], elbow: [-1, 0.05, -0.1] }, left: fist(-1), ...spine({ flex: 6, turn: 28 }), Hips: { turn: -14 }, offset: [0, -0.03, 0.05] }],
                [1.4, { right: { at: [0.6, 0.1, 0.5], palm: [0, -1, -0.2], towards: [1, 0, -0.1], elbow: [-1, 0, -0.2] }, left: fist(-1), ...spine({ flex: 6, turn: 30 }), Hips: { turn: -15 }, offset: [0, -0.03, 0.04] }]),
            variant("uppercut", PUNCH,
                // Dipping low, then driven up under the chin, the palm to the body
                [0.5, { right: { at: [0.1, -0.45, 0.4], palm: [0.9, 0, -0.4], towards: [0, 0.4, 0.9] }, left: fist(-1), ...spine({ flex: 12, turn: -10 }), Hips: { turn: 6 }, offset: [0, -0.06, 0] }],
                [0.75, { right: { at: [0.2, -0.16, 0.56], palm: [0.62, 0.14, -0.77], towards: [0.35, 0.83, 0.43] } }],
                [1, { right: { at: [0.3, 0.12, 0.72], palm: [0.2, 0, -1], towards: [0, 1, 0.15], elbow: [0, -1, 0.2] }, left: fist(-1), ...spine({ flex: -4, turn: 16 }), Hips: { turn: -10 }, offset: [0, 0.01, 0.05] }],
                [1.4, { right: { at: [0.3, 0.18, 0.62], palm: [0.4, 0, -1], towards: [0, 1, 0.1], elbow: [0, -1, 0.1] }, left: fist(-1), ...spine({ flex: -4, turn: 14 }), Hips: { turn: -8 }, offset: [0, 0.01, 0.04] }]),
            variant("body blow", PUNCH,
                // Low and hard into the belly, bending into it
                [0.5, { right: { at: [0.2, -0.3, 0.3], palm: [1, -0.3, 0], towards: [0, 0.2, 1], elbow: [0.2, -1, -0.2] }, left: fist(-1), ...spine({ flex: 14, turn: -10 }), Hips: { turn: 6 }, offset: [0, -0.06, -0.02] }],
                [1, { right: { at: [0.3, -0.38, 1.05], palm: [0.7, -0.7, 0], towards: [0, -0.1, 1] }, left: fist(-1), ...spine({ flex: 16, turn: 18 }), Hips: { turn: -10 }, offset: [0, -0.08, 0.07] }],
                [1.4, { right: { at: [0.28, -0.3, 0.72], palm: [0.9, -0.4, 0], towards: [0, 0.1, 1] }, left: fist(-1), ...spine({ flex: 14, turn: 10 }), Hips: { turn: -6 }, offset: [0, -0.06, 0.04] }]),
            variant("overhand", PUNCH,
                // Looping up and over, then down onto the head, the palm turned out
                [0.5, { right: { at: [-0.15, 0.3, 0.3], palm: [0.5, -0.8, 0], towards: [0.2, 0.5, 0.85] }, left: fist(-1), ...spine({ flex: -4, turn: -20 }), Hips: { turn: 8 }, offset: [0, 0, -0.03] }],
                [1, { right: { at: [0.3, 0.08, 1.08], palm: [-0.3, -0.95, 0], towards: [0, -0.25, 1], elbow: [-0.8, 0.4, 0] }, left: fist(-1), ...spine({ flex: 10, turn: 22 }), Hips: { turn: -12 }, offset: [0, -0.04, 0.07] }],
                [1.4, { right: { at: [0.35, -0.15, 0.78], palm: [0, -1, 0], towards: [0, -0.3, 1] }, left: fist(-1), ...spine({ flex: 12, turn: 14 }), Hips: { turn: -8 }, offset: [0, -0.04, 0.04] }]),
        ],
    },
    cleaver: {
        // (Hacked with the edge leading: palm up for a forehand, down for a backhand)
        variants: [
            variant("overhead hack", CLEAVER,
                // Raised high behind the head, the edge up, then hacked straight down
                [0.6, { right: { at: [0.05, 0.5, 0.05], point: [0.1, 0.4, -0.9], edge: [-0.5, 0.8, 0.3] }, left: REACH_OUT, ...spine({ flex: -8, turn: -18 }), offset: [0, 0.01, -0.03] }],
                [1, { right: { at: [0.3, -0.35, 1], point: [0.14, 0.2, 0.97], edge: [0.27, -0.95, 0.16] }, left: DRAW_IN, ...spine({ flex: 22, turn: 14 }), offset: [0, -0.1, 0.1] }],
                [1.35, { right: { at: [0.3, -0.75, 0.75], point: [0.28, -0.22, 0.94], edge: [0.24, -0.93, -0.29] }, left: DRAW_IN, ...spine({ flex: 25, turn: 16 }), offset: [0, -0.11, 0.09] }]),
            variant("backhand", CLEAVER,
                // Across to the left shoulder, then backhanded out to the right, the palm down
                [0.6, { right: { at: [0.5, 0.2, 0.2], point: [0.4, 0.55, -0.7], edge: [0.45, 0.56, 0.7] }, left: { at: [0.05, -0.62, 0.45], pronate: 50, shape: "relaxed" }, ...spine({ turn: 25 }), Hips: { turn: -8 }, offset: [0, 0, -0.03] }],
                [1, { right: { at: [-0.35, -0.35, 1], point: [-0.13, 0.28, 0.95], edge: [-0.85, -0.53, 0.04] }, left: { at: [0.1, -0.7, 0.2], pronate: 20, shape: "relaxed" }, ...spine({ flex: 14, turn: -22 }), Hips: { turn: 12 }, offset: [0, -0.07, 0.09] }],
                [1.35, { right: { at: [-0.7, -0.5, 0.6], point: [-0.88, 0.33, 0.34], edge: [-0.28, -0.94, 0.19] }, left: { at: [0.12, -0.72, 0.15], pronate: 20, shape: "relaxed" }, ...spine({ flex: 16, turn: -28 }), Hips: { turn: 14 }, offset: [0, -0.08, 0.07] }]),
            variant("flat chop", CLEAVER,
                // Swung back out to the right, then chopped flat across, the palm up
                [0.6, { right: { at: [-0.5, -0.1, 0.1], point: [-0.65, 0.1, -0.7], edge: [-0.7, -0.1, 0.7] }, left: REACH_OUT, ...spine({ turn: -32 }), Hips: { turn: 14 }, offset: [0, -0.01, -0.03] }],
                [1, { right: { at: [0.25, -0.35, 1], point: [-0.21, 0.1, 0.97], edge: [0.97, -0.09, 0.22] }, left: DRAW_IN, ...spine({ flex: 10, turn: 24 }), Hips: { turn: -14 }, offset: [0, -0.07, 0.1] }],
                [1.35, { right: { at: [0.6, -0.45, 0.6], point: [0.38, 0.17, 0.91], edge: [0.92, -0.2, -0.35] }, left: DRAW_IN, ...spine({ flex: 12, turn: 32 }), Hips: { turn: -16 }, offset: [0, -0.08, 0.08] }]),
            variant("gut rip", CLEAVER,
                // Low at the hip, then driven up into the belly, point first
                [0.6, { right: { at: [-0.3, -0.8, 0.2], point: [0.02, -0.23, 0.97], edge: [-0.68, -0.72, -0.16] }, left: REACH_OUT, ...spine({ flex: 16, turn: -14 }), offset: [0, -0.08, -0.02] }],
                [1, { right: { at: [0.25, -0.4, 1], point: [0.17, 0.47, 0.87], edge: [-0.18, -0.85, 0.5] }, left: DRAW_IN, ...spine({ flex: 10, turn: 12 }), offset: [0, -0.05, 0.1] }],
                [1.35, { right: { at: [0.2, -0.2, 0.55], point: [0.12, 0.8, 0.59], edge: [0.03, -0.6, 0.8] }, left: DRAW_IN, ...spine({ flex: 4, turn: 14 }), offset: [0, -0.02, 0.08] }]),
            variant("stab and rip", CLEAVER,
                // Drawn back, point first, stabbed in, then ripped down
                [0.6, { right: { at: [0, -0.58, 0.25], point: [0.05, 0.05, 1], edge: [-0.2, -0.98, 0.05], elbow: [-0.3, -0.5, -0.8] }, left: REACH_OUT, ...spine({ turn: -16 }), Hips: { turn: 8 }, offset: [0, -0.03, -0.06] }],
                [1, { right: { at: [0.3, -0.35, 1.08], point: [0.15, 0.39, 0.91], edge: [-0.06, -0.92, 0.4] }, left: SWUNG_BACK, ...spine({ flex: 10, turn: 18 }), Hips: { turn: -10 }, offset: [0, -0.08, 0.16] }],
                [1.35, { right: { at: [0.15, -0.8, 0.8], point: [0.24, -0.01, 0.97], edge: [-0.3, -0.95, 0.06] }, left: SWUNG_BACK, ...spine({ flex: 20, turn: 14 }), Hips: { turn: -8 }, offset: [0, -0.1, 0.12] }]),
        ],
    },

    // Spells, cast with the free (left) hand, key 1 when the spell takes effect
    castHeal: {
        // (The light gathered in the cupped hand, then lifted up in the open palm, the fingers up)
        variants: [
            variant("lifted up", CAST,
                // The hand gathers the light before the chest, then lifts it up and open
                [0.55, { left: { at: [-0.1, -0.4, 0.5], palm: [-0.2, 1, 0.1], towards: [-0.4, 0, 0.9], shape: "cup" }, ...spine({ flex: 6 }), Head: { flex: 8 } }],
                [0.78, { left: { at: [0, 0, 0.5], palm: [-1, 0.1, 0], towards: [0, 0.7, 0.7], shape: "cup" } }],
                [1, { left: { at: [0.1, 0.4, 0.5], palm: [0, 0.4, 0.9], towards: [-0.1, 1, -0.2], shape: "open" }, ...spine({ flex: -6 }), Head: { flex: -14 } }],
                [1.5, { left: { at: [0.12, 0.36, 0.47], palm: [0, 0.4, 0.9], towards: [-0.1, 1, -0.2], shape: "open" }, ...spine({ flex: -5 }), Head: { flex: -10 } }]),
            variant("from the heart", CAST,
                // The palm to the heart, the head bowed, then raised to the sky
                [0.5, { left: { at: [-0.22, -0.35, 0.25], palm: [0.16, 0.16, -0.97], towards: [-0.8, 0.61, -0.03], shape: "relaxed" }, ...spine({ flex: 4 }), Head: { flex: 14 } }],
                [0.75, { left: { at: [-0.02, 0.1, 0.3], palm: [-0.5, 0, -0.85], towards: [-0.4, 0.9, 0], shape: "relaxed" } }],
                [1, { left: { at: [0.18, 0.55, 0.35], palm: [0, 0.3, 0.95], towards: [0, 1, -0.2], shape: "open" }, ...spine({ flex: -8 }), Head: { flex: -18 } }],
                [1.5, { left: { at: [0.18, 0.5, 0.33], palm: [0, 0.3, 0.95], towards: [0, 1, -0.2], shape: "open" }, ...spine({ flex: -6 }), Head: { flex: -14 } }]),
            variant("circle", CAST,
                // A circle drawn with the open palm, then opened upward
                [0.35, { left: { at: [0, -0.4, 0.6], palm: [0, -1, 0.1], towards: [-0.3, 0, 1], shape: "relaxed" }, ...spine({ flex: 4 }), Head: { flex: 6 } }],
                [0.6, { left: { at: [0.3, -0.15, 0.6], palm: [0, -0.6, 0.8], towards: [-0.2, 0.7, 0.6], shape: "relaxed" }, ...spine({ flex: 2 }), Head: { flex: 2 } }],
                [0.8, { left: { at: [0.1, 0.15, 0.62], palm: [-0.3, 0, 0.95], towards: [-0.3, 1, 0], shape: "open" }, ...spine({ flex: 0 }), Head: { flex: -4 } }],
                [1, { left: { at: [0.05, 0.35, 0.55], palm: [0, 0.4, 0.9], towards: [-0.1, 1, -0.2], shape: "open" }, ...spine({ flex: -4 }), Head: { flex: -10 } }],
                [1.5, { left: { at: [0.06, 0.32, 0.52], palm: [0, 0.4, 0.9], towards: [-0.1, 1, -0.2], shape: "open" }, ...spine({ flex: -4 }), Head: { flex: -8 } }]),
            variant("rising sweep", CAST,
                // Swept up from low at the side, high over the head
                [0.5, { left: { at: [0.45, -0.7, 0.25], pronate: 20, shape: "relaxed" }, ...spine({ flex: 4, bend: 6 }), Head: { flex: 10 } }],
                [1, { left: { at: [0.28, 0.65, 0.35], palm: [0, 0.3, 0.95], towards: [0, 1, -0.2], shape: "open" }, ...spine({ flex: -6, bend: -2 }), Head: { flex: -16 } }],
                [1.5, { left: { at: [0.26, 0.6, 0.33], palm: [0, 0.3, 0.95], towards: [0, 1, -0.2], shape: "open" }, ...spine({ flex: -5 }), Head: { flex: -12 } }]),
            variant("from the earth", CAST,
                // Bowing, the palm over the ground, then drawing the light up from it
                [0.5, { left: { at: [0.05, -0.75, 0.6], palm: [0, -1, 0.1], towards: [-0.2, -0.3, 1], shape: "open" }, ...spine({ flex: 16 }), Head: { flex: 18 } }],
                [1, { left: { at: [0.08, 0.3, 0.5], palm: [-0.45, 0.88, -0.17], towards: [0, 0.19, 0.98], shape: "cup" }, ...spine({ flex: -4 }), Head: { flex: -10 } }],
                [1.5, { left: { at: [0.08, 0.27, 0.48], palm: [-0.45, 0.88, -0.17], towards: [0, 0.19, 0.98], shape: "cup" }, ...spine({ flex: -3 }), Head: { flex: -8 } }]),
        ],
    },
    castStun: {
        // (Thrust at the enemy with the open palm, the fingers up, as if to stop it; or pointed)
        variants: [
            variant("palm thrust", CAST,
                // Drawn back by the left shoulder, then thrust open-palmed at the enemy
                [0.55, { left: { at: [0.2, 0.05, 0.3], palm: [-0.11, 0.28, 0.95], towards: [-0.01, 0.96, -0.28], shape: "relaxed" }, ...spine({ turn: 18, flex: -4 }), offset: [0, 0.01, -0.03] }],
                [1, { left: { at: [-0.1, 0.02, 1.08], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ turn: -12, flex: 6 }), offset: [0, -0.02, 0.06] }],
                [1.5, { left: { at: [-0.1, -0.02, 1.04], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ turn: -10, flex: 6 }), offset: [0, -0.02, 0.05] }]),
            variant("pointed from above", CAST,
                // Raised high, then pointed down at the enemy
                [0.55, { left: { at: [0.15, 0.5, 0.25], palm: [0, 0.3, 0.95], towards: [0, 1, -0.2], shape: "relaxed" }, ...spine({ flex: -6 }), offset: [0, 0.01, -0.02] }],
                [1, { left: { at: [-0.05, 0, 1.16], palm: [-0.3, -0.95, 0], towards: [0, -0.1, 1], shape: "point" }, ...spine({ flex: 6, turn: -8 }), offset: [0, -0.02, 0.05] }],
                [1.5, { left: { at: [-0.05, -0.04, 1.12], palm: [-0.3, -0.95, 0], towards: [0, -0.15, 1], shape: "point" }, ...spine({ flex: 6, turn: -8 }), offset: [0, -0.02, 0.04] }]),
            variant("cross-body flick", CAST,
                // Across the chest to the right, then flicked out at the enemy, the hand opening
                [0.55, { left: { at: [-0.35, -0.2, 0.3], palm: [0, -0.3, -0.95], towards: [-0.7, 0.3, 0.5], shape: "fist" }, ...spine({ turn: -18 }), offset: [0, 0, -0.02] }],
                [1, { left: { at: [0.05, 0.02, 1.06], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ turn: 10 }), offset: [0, -0.01, 0.04] }],
                [1.5, { left: { at: [0.05, -0.02, 1.02], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ turn: 8 }), offset: [0, -0.01, 0.03] }]),
            variant("double push", CAST,
                // Two pushes, the second sending it
                [0.4, { left: { at: [0.1, -0.15, 0.3], palm: [-0.12, -0.06, 0.99], towards: [-0.06, 1, 0.05], shape: "relaxed" }, ...spine({ flex: -2 }), offset: [0, 0, -0.02] }],
                [0.65, { left: { at: [0.05, -0.1, 0.75], palm: [0, 0, 1], towards: [0, 1, 0.1], shape: "open" }, ...spine({ flex: 3 }), offset: [0, -0.01, 0.02] }],
                [0.85, { left: { at: [0.1, -0.12, 0.4], palm: [-0.12, 0.12, 0.99], towards: [-0.04, 0.99, -0.12], shape: "relaxed" }, ...spine({ flex: -1 }), offset: [0, 0, -0.01] }],
                [1, { left: { at: [-0.08, 0, 1.09], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ flex: 8 }), offset: [0, -0.03, 0.08] }],
                [1.5, { left: { at: [-0.08, -0.03, 1.04], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ flex: 7 }), offset: [0, -0.03, 0.06] }]),
            variant("rising sweep", CAST,
                // Swept up from low at the side to thrust at the enemy
                [0.55, { left: { at: [0.35, -0.65, 0.4], palm: [0.3, -0.9, 0.2], towards: [0, -0.2, 1], shape: "relaxed" }, ...spine({ flex: 10, turn: 10 }), offset: [0, -0.03, 0] }],
                [1, { left: { at: [-0.05, 0.08, 1.06], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ flex: 2, turn: -10 }), offset: [0, -0.01, 0.05] }],
                [1.5, { left: { at: [-0.05, 0.04, 1.02], palm: [0, -0.3, 0.95], towards: [0, 0.95, 0.3], shape: "open" }, ...spine({ flex: 2, turn: -8 }), offset: [0, -0.01, 0.04] }]),
        ],
    },

    // The tavern's folk (one way each)
    toast: {
        variants: [
            // Raising a tankard (held in the right hand by its handle) high in a toast, tipping back
            // as it rises (as one held high does), then drinking from it, key 1 at the top of it
            variant("toast", { right: tankard, ...spine({}), Head: { flex: 0 } },
                [1, { right: { at: [0.1, 0.5, 0.55], point: [0.05, 0.8, -0.6] }, ...spine({ flex: -6 }), Head: { flex: -12 } }],
                [1.25, { right: { at: [0.1, 0.54, 0.52], point: [0.05, 0.78, -0.62] }, ...spine({ flex: -7 }), Head: { flex: -12 } }],
                // (Drinking: the rim to the lower lip, the tankard tipped and the head back)
                [1.6, { right: { at: [0.27, 0.46, 0.33], point: [0.35, 0.55, -0.75] }, ...spine({ flex: -8 }), Head: { flex: -22 } }],
                [1.85, { right: { at: [0.21, 0.49, 0.31], point: [0.35, 0.5, -0.8] }, ...spine({ flex: -8 }), Head: { flex: -24 } }]),
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
                // (The right fist round the tap's lever, turning it down; the left round a mug's handle under it)
                [0.7, { right: { at: [0.15, -0.35, 0.72], palm: [1, 0, 0], towards: [0, 0.2, 1], shape: "grip" }, left: { at: [-0.05, -0.62, 0.7], palm: [-1, 0, 0], towards: [0, -0.1, 1], shape: "grip" }, ...spine({ flex: 14 }) }],
                [1.4, { right: { at: [0.18, -0.4, 0.72], palm: [0.85, -0.5, 0], towards: [0, 0, 1], shape: "grip" }, left: { at: [-0.05, -0.6, 0.7], palm: [-1, 0, 0], towards: [0, -0.1, 1], shape: "grip" }, ...spine({ flex: 14 }) }]),
        ],
    },
});

// --- Resting ---

// A hand on something in front (a table's top, the bar, the counter: `y` arm lengths below the
// shoulder, `z` in front), palm down, the fingers forward and a little in (open, or round a rag)
const flat = (x, y, z, side = 1, shape = "open") => ({ at: [x, y, z], palm: [0, -1, 0], towards: [side * 0.25, 0, 1], shape });

// A hand on the hip (side 1: the right), the fingers forward over the hip bone, the thumb behind,
// the elbow out to the side
const akimbo = (side) => ({ at: [side * -0.08, -0.68, 0.02], palm: [side * 0.98, -0.12, -0.18], towards: [side * 0.09, -0.52, 0.85], elbow: [-side, -0.2, -0.3], shape: "relaxed" });

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
            [0.35, { right: flat(0.2, -0.66, 0.72, 1, "relaxed"), left: flat(-0.12, -0.68, 0.62, -1), ...spine({ flex: 14 }) }],
            [0.6, { right: flat(0.36, -0.66, 0.62, 1, "relaxed") }],
            [0.8, { right: flat(0.22, -0.66, 0.52, 1, "relaxed") }],
            [1, { right: flat(0.06, -0.66, 0.62, 1, "relaxed") }],
            [1.2, { right: flat(0.2, -0.66, 0.74, 1, "relaxed") }],
            [1.4, { right: flat(0.36, -0.66, 0.62, 1, "relaxed") }],
            [1.6, { right: flat(0.2, -0.66, 0.54, 1, "relaxed"), left: flat(-0.12, -0.68, 0.62, -1), ...spine({ flex: 14 }) }]),
        variant("stroking his beard", { ...spine({}), Head: { flex: 0 } },
            // The hand to the chin, stroking the beard down, twice, thinking
            [0.5, { right: { at: [0.34, 0.14, 0.3], palm: [0, 0.2, -1], towards: [0.6, 0.8, 0], shape: "cup" }, Head: { flex: -6, bend: -4 } }],
            [0.75, { right: { at: [0.34, -0.02, 0.33], palm: [0, 0.2, -1], towards: [0.6, 0.8, 0], shape: "cup" } }],
            [1, { right: { at: [0.34, 0.14, 0.3], palm: [0, 0.2, -1], towards: [0.6, 0.8, 0], shape: "cup" } }],
            [1.3, { right: { at: [0.34, -0.03, 0.33], palm: [0, 0.2, -1], towards: [0.6, 0.8, 0], shape: "cup" } }],
            [1.6, { right: { at: [0.34, 0.1, 0.31], palm: [0, 0.2, -1], towards: [0.6, 0.8, 0], shape: "cup" }, Head: { flex: -4, bend: -2 } }]),
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
            [0.5, { right: { at: [0.26, 0.16, -0.02], palm: [0, 0, 1], towards: [1, 0.3, 0], elbow: [-0.5, 0.4, 0.8], shape: "relaxed" }, ...spine({ flex: 6 }), Head: { flex: 16, bend: 0 } }],
            [1, { right: { at: [0.3, 0.18, -0.02], palm: [0, 0, 1], towards: [1, 0.3, 0], elbow: [-0.5, 0.4, 0.8], shape: "relaxed" }, Head: { flex: 10, bend: 12 } }],
            [1.4, { right: { at: [0.24, 0.14, -0.01], palm: [0, 0, 1], towards: [1, 0.3, 0], elbow: [-0.5, 0.4, 0.8], shape: "relaxed" }, Head: { flex: 12, bend: -10 } }],
            [1.65, { right: { at: [0.26, 0.16, -0.02], palm: [0, 0, 1], towards: [1, 0.3, 0], elbow: [-0.5, 0.4, 0.8], shape: "relaxed" }, ...spine({ flex: 4 }), Head: { flex: 4, bend: 0 } }]),
    ],
    barmaid: [
        variant("wiping her brow", { ...spine({}), Head: { flex: 0 } },
            // The back of the wrist across the forehead, then a sigh
            [0.5, { left: { at: [-0.52, 0.42, 0.26], palm: [0, 0.2, 1], towards: [-1, 0.1, 0], elbow: [0.8, 0.3, 0.3], shape: "relaxed" }, Head: { flex: -6 } }],
            [1, { left: { at: [-0.12, 0.44, 0.24], palm: [0, 0.2, 1], towards: [-1, 0.1, 0], elbow: [0.8, 0.3, 0.3], shape: "relaxed" }, Head: { flex: -8 } }],
            [1.4, { left: { at: [0.02, -0.2, 0.2] }, ...spine({ flex: 6 }), Head: { flex: 10 } }]),
        variant("hand on her hip", { ...spine({}), Head: { bend: 0 }, Hips: { obliquity: 0, turn: 0 }, offset: [0, 0, 0] },
            // A hand on the hip, the hip cocked, the head tilted
            [0.5, { left: akimbo(-1), Hips: { obliquity: 5, turn: -6 }, ...spine({ bend: -6 }), Head: { bend: 10 }, offset: [0.03, -0.01, 0] }],
            [1.6, { left: akimbo(-1), Hips: { obliquity: 6, turn: -8 }, ...spine({ bend: -7 }), Head: { bend: 12 }, offset: [0.035, -0.01, 0] }]),
        variant("tucking back her hair", { ...spine({}), Head: { bend: 0, flex: 0 } },
            // The hand up to the side of the head, tucking the hair back behind the ear
            [0.55, { left: { at: [-0.16, 0.36, 0.14], palm: [-0.95, 0.07, 0.29], towards: [-0.21, 0.54, -0.82], shape: "relaxed" }, Head: { bend: 10, flex: 4 } }],
            [1, { left: { at: [-0.12, 0.34, -0.02], palm: [-0.99, 0.14, 0], towards: [0.04, 0.3, -0.95], shape: "relaxed" }, Head: { bend: 12, flex: 2 } }],
            [1.4, { left: { at: [0.02, -0.25, 0.1] }, Head: { bend: 4, flex: 0 } }]),
        variant("a curtsy", { ...spine({}), Head: { flex: 0 }, offset: [0, 0, 0] },
            // Bobbing down, the head bowed, the skirt held out to the side
            [1, { left: { at: [0.34, -0.9, 0.2], palm: [-0.5, -0.2, 0.8], towards: [0.3, -0.9, 0.2], shape: "cup" }, ...spine({ flex: 17 }), Head: { flex: 20 }, offset: [0, -0.045, -0.03] }],
            [1.3, { left: { at: [0.3, -0.88, 0.18], palm: [-0.5, -0.2, 0.8], towards: [0.3, -0.9, 0.2], shape: "cup" }, ...spine({ flex: 14 }), Head: { flex: 16 }, offset: [0, -0.035, -0.02] }]),
        variant("stretching her back", { ...spine({}), Head: { flex: 0 }, offset: [0, 0, 0] },
            // The back of a hand pressed to the small of the back, arching back
            [0.5, { left: { at: [0.05, -0.65, -0.2], palm: [0, 0, -1], towards: [-0.3, -0.95, 0], elbow: [0.7, -0.2, -0.7], shape: "relaxed" }, ...spine({ flex: -6 }), Head: { flex: -6 } }],
            [1, { left: { at: [0.03, -0.63, -0.22], palm: [0, 0, -1], towards: [-0.3, -0.95, 0], elbow: [0.7, -0.2, -0.7], shape: "relaxed" }, ...spine({ flex: -13 }), Head: { flex: -14 }, offset: [0, 0, 0.03] }],
            [1.5, { left: { at: [0.05, -0.65, -0.2], palm: [0, 0, -1], towards: [-0.3, -0.95, 0], elbow: [0.7, -0.2, -0.7], shape: "relaxed" }, ...spine({ flex: -8 }), Head: { flex: -6 }, offset: [0, 0, 0.01] }]),
    ],
    patron: [
        variant("a toast", TOASTING, ...ATTACKS.toast.variants[0].keys.slice(1, -1)),
        variant("a long drink", TOASTING,
            // The tankard's rim to the lips and tipped right back; taken off them forward, then the
            // mouth wiped on a sleeve
            [0.55, { right: { at: [0.2, 0.3, 0.42], point: [0.2, 0.75, -0.6] }, Head: { flex: -8 } }],
            [1, { right: { at: [0.22, 0.45, 0.32], point: [0.3, 0.3, -0.9] }, ...spine({ flex: -6 }), Head: { flex: -24 } }],
            [1.4, { right: { at: [0.18, 0.38, 0.24], point: [0.3, 0.15, -0.95] }, ...spine({ flex: -8 }), Head: { flex: -28 } }],
            [1.52, { right: { at: [0.22, 0.22, 0.45], point: [0.2, 0.8, -0.4] }, Head: { flex: -10 } }],
            [1.65, { right: tankard, left: { at: [-0.5, 0.22, 0.3], palm: [0, 0, 1], towards: [-1, 0, 0], shape: "relaxed" }, ...spine({ flex: 2 }), Head: { flex: 4 } }],
            [1.85, { right: tankard, left: { at: [-0.18, 0.2, 0.3], palm: [0, 0, 1], towards: [-1, 0, 0], shape: "relaxed" }, ...spine({ flex: 2 }), Head: { flex: 2 } }]),
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
            [0.4, { right: { at: [0.2, 0.28, 0.36], palm: [0.5, 0, -0.85], towards: [0, 1, 0], shape: "open" }, Head: { flex: -6, bend: -4 } }],
            [0.55, { right: { at: [0.34, 0.32, 0.4], palm: [0.9, 0, -0.4], towards: [0, 1, 0], shape: "open" } }],
            [0.7, { right: { at: [0.2, 0.28, 0.36], palm: [0.5, 0, -0.85], towards: [0, 1, 0], shape: "open" } }],
            [0.85, { right: { at: [0.34, 0.32, 0.4], palm: [0.9, 0, -0.4], towards: [0, 1, 0], shape: "open" } }],
            [1, { right: { at: [0.2, 0.28, 0.36], palm: [0.5, 0, -0.85], towards: [0, 1, 0], shape: "open" } }],
            [1.2, { right: { at: [0.34, 0.32, 0.4], palm: [0.9, 0, -0.4], towards: [0, 1, 0], shape: "open" } }],
            [1.4, { right: { at: [0.2, 0.28, 0.36], palm: [0.5, 0, -0.85], towards: [0, 1, 0], shape: "open" } }],
            [1.6, { right: { at: [0.3, 0.3, 0.38], palm: [0.5, 0, -0.85], towards: [0, 1, 0], shape: "open" }, Head: { flex: -4, bend: -2 } }]),
        variant("hands on her hips", { ...spine({}), Head: { turn: 0 } },
            // Hands on hips, looking over her house one way and the other
            [0.5, { right: akimbo(1), left: akimbo(-1), ...spine({ flex: -3 }), Head: { turn: 0 } }],
            [0.9, { ...spine({ flex: -3, turn: 10 }), Head: { turn: 24 } }],
            [1.3, { ...spine({ flex: -3, turn: -10 }), Head: { turn: -24 } }],
            [1.65, { right: akimbo(1), left: akimbo(-1), ...spine({ flex: -3 }), Head: { turn: 0 } }]),
        variant("touching her necklace", { ...spine({}), Head: { flex: 0, bend: 0 } },
            // Fingers to the throat, toying with a necklace, looking down
            [0.6, { left: { at: [-0.28, -0.04, 0.24], palm: [0, 0, -1], towards: [-0.4, 0.9, 0], shape: "cup" }, Head: { flex: 10, bend: 6 } }],
            [1, { left: { at: [-0.24, -0.02, 0.25], palm: [0, 0, -1], towards: [-0.4, 0.9, 0], shape: "cup" }, Head: { flex: 12, bend: 8 } }],
            [1.4, { left: { at: [-0.3, -0.05, 0.24], palm: [0, 0, -1], towards: [-0.4, 0.9, 0], shape: "cup" }, Head: { flex: 8, bend: 4 } }]),
        variant("drumming her fingers", { ...spine({}) },
            // A hand on the counter in front, drumming it
            [0.5, { right: flat(0.16, -0.64, 0.7, 1, "relaxed"), ...spine({ flex: 8 }) }],
            [0.7, { right: flat(0.16, -0.64, 0.7, 1, "cup") }],
            [0.85, { right: flat(0.16, -0.64, 0.7, 1, "open") }],
            [1, { right: flat(0.16, -0.64, 0.7, 1, "cup") }],
            [1.15, { right: flat(0.16, -0.64, 0.7, 1, "open") }],
            [1.3, { right: flat(0.16, -0.64, 0.7, 1, "cup") }],
            [1.45, { right: flat(0.16, -0.64, 0.7, 1, "open") }],
            [1.6, { right: flat(0.16, -0.64, 0.7, 1, "relaxed"), ...spine({ flex: 8 }) }]),
        variant("smoothing her gown", { ...spine({}), Head: { flex: 0 } },
            // Both hands smoothing down the front of her gown
            [0.5, { right: { at: [0.2, -0.6, 0.24], palm: [0.3, -0.2, -0.94], towards: [-0.03, -0.98, 0.2], shape: "open" }, left: { at: [-0.2, -0.6, 0.24], palm: [-0.3, -0.2, -0.94], towards: [0.03, -0.98, 0.2], shape: "open" }, ...spine({ flex: 10 }), Head: { flex: 14 } }],
            [1, { right: { at: [0.18, -0.95, 0.28], palm: [0.3, 0, -0.95], towards: [0, -1, 0.1], shape: "open" }, left: { at: [-0.18, -0.95, 0.28], palm: [-0.3, 0, -0.95], towards: [0, -1, 0.1], shape: "open" }, ...spine({ flex: 16 }), Head: { flex: 16 } }],
            [1.4, { right: { at: [0.16, -0.8, 0.22], palm: [0.23, -0.15, -0.96], towards: [-0.01, -0.99, 0.15], shape: "relaxed" }, left: { at: [-0.16, -0.8, 0.22], palm: [-0.23, -0.15, -0.96], towards: [0.01, -0.99, 0.15], shape: "relaxed" }, ...spine({ flex: 4 }), Head: { flex: 4 } }]),
    ],
    adventurer: [
        variant("stretching", { ...spine({}), Head: { flex: 0 } },
            // Both arms up high, the back arched, then down
            [0.55, { right: { at: [0.12, 0.7, 0.2], palm: [0.67, 0.07, 0.74], towards: [-0.04, 1, -0.05], shape: "open" }, left: { at: [-0.12, 0.7, 0.2], palm: [-0.67, 0.07, 0.74], towards: [0.04, 1, -0.05], shape: "open" }, ...spine({ flex: -6 }), Head: { flex: -8 } }],
            [1, { right: { at: [0.1, 0.96, 0.08], palm: [0.5, 0.5, 0.7], towards: [0, 1, -0.3], shape: "open" }, left: { at: [-0.1, 0.96, 0.08], palm: [-0.5, 0.5, 0.7], towards: [0, 1, -0.3], shape: "open" }, ...spine({ flex: -12 }), Head: { flex: -16 } }],
            [1.35, { right: { at: [0.1, 0.94, 0.06], palm: [0.5, 0.5, 0.7], towards: [0, 1, -0.3], shape: "open" }, left: { at: [-0.1, 0.94, 0.06], palm: [-0.5, 0.5, 0.7], towards: [0, 1, -0.3], shape: "open" }, ...spine({ flex: -13 }), Head: { flex: -16 } }],
            [1.7, { right: { at: [-0.1, 0.2, 0.2] }, left: { at: [0.1, 0.2, 0.2] }, ...spine({ flex: 0 }), Head: { flex: 0 } }]),
        variant("looking about", { ...spine({}), Head: { turn: 0, flex: 0 } },
            // A hand shading the eyes, looking into the distance one way, then the other
            [0.5, { left: { at: [-0.32, 0.4, 0.34], palm: [0, -1, 0.2], towards: [-0.7, 0, 0.7], elbow: [0.8, 0.2, 0.3], shape: "open" }, Head: { flex: -4 } }],
            [0.8, { ...spine({ turn: 14 }), Head: { turn: 26, flex: -4 } }],
            [1.2, { ...spine({ turn: -14 }), Head: { turn: -26, flex: -4 } }],
            [1.55, { left: { at: [-0.32, 0.4, 0.34], palm: [0, -1, 0.2], towards: [-0.7, 0, 0.7], elbow: [0.8, 0.2, 0.3], shape: "open" }, ...spine({ turn: 0 }), Head: { turn: 0, flex: -2 } }]),
        variant("rolling the shoulders", { ...spine({}), LeftShoulder: { elevate: 0, protract: 0 }, RightShoulder: { elevate: 0, protract: 0 }, Neck: { bend: 0 } },
            // The shoulders rolled up and back, and the neck stretched one way and the other
            [0.4, { LeftShoulder: { elevate: 22, protract: 14 }, RightShoulder: { elevate: 22, protract: 14 } }],
            [0.7, { LeftShoulder: { elevate: 26, protract: -18 }, RightShoulder: { elevate: 26, protract: -18 } }],
            [1, { LeftShoulder: { elevate: 0, protract: -10 }, RightShoulder: { elevate: 0, protract: -10 }, Neck: { bend: 20 } }],
            [1.35, { LeftShoulder: { elevate: 0, protract: 0 }, RightShoulder: { elevate: 0, protract: 0 }, Neck: { bend: -20 } }],
            [1.65, { Neck: { bend: 0 } }]),
        variant("a yawn", { ...spine({}), Head: { flex: 0 }, LeftShoulder: { elevate: 0 }, RightShoulder: { elevate: 0 } },
            // A hand to the mouth, the head back, the shoulders up
            [0.5, { left: { at: [-0.34, 0.22, 0.32], palm: [0, 0, -1], towards: [-0.5, 0.85, 0], shape: "relaxed" }, Head: { flex: -12 }, LeftShoulder: { elevate: 12 }, RightShoulder: { elevate: 12 } }],
            [1, { left: { at: [-0.34, 0.24, 0.32], palm: [0, 0, -1], towards: [-0.5, 0.85, 0], shape: "relaxed" }, ...spine({ flex: -8 }), Head: { flex: -20 }, LeftShoulder: { elevate: 18 }, RightShoulder: { elevate: 18 } }],
            [1.5, { left: { at: [-0.1, -0.3, 0.2] }, ...spine({ flex: 2 }), Head: { flex: 4 }, LeftShoulder: { elevate: 0 }, RightShoulder: { elevate: 0 } }]),
        variant("shifting the weight", { ...spine({}), Hips: { obliquity: 0 }, offset: [0, 0, 0] },
            // From one foot to the other, a thumb in the belt
            [0.5, { left: { at: [-0.26, -0.62, 0.22], palm: [0, -0.2, -0.98], towards: [-0.2, -0.96, 0.19], shape: "relaxed" }, Hips: { obliquity: -6 }, ...spine({ bend: 5 }), offset: [-0.04, -0.01, 0] }],
            [1, { left: { at: [-0.26, -0.62, 0.22], palm: [0, -0.2, -0.98], towards: [-0.2, -0.96, 0.19], shape: "relaxed" }, Hips: { obliquity: 6 }, ...spine({ bend: -5 }), offset: [0.04, -0.01, 0] }],
            [1.5, { left: { at: [-0.26, -0.62, 0.22], palm: [0, -0.2, -0.98], towards: [-0.2, -0.96, 0.19], shape: "relaxed" }, Hips: { obliquity: -3 }, ...spine({ bend: 3 }), offset: [-0.02, 0, 0] }]),
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
const VECTORS = ["at", "point", "edge", "palm", "towards", "elbow"];

// How the fingers are held, for a hand's `shape` in a key pose: each finger's flexion at its
// three joints (degrees; the ring and little fingers curl a little more, as they do), and the
// thumb's. A pointing hand's index is straight; `index` (degrees) curls it (beckoning). A hook
// draws a bowstring on the fingers' ends
const CURLS = {
    open: { fingers: [3, 2, 1], thumb: [{ flex: -5, oppose: 15 }, { flex: 0 }, { flex: 0 }] },
    relaxed: { fingers: [16, 24, 12], thumb: [{ flex: 10, oppose: 10 }, { flex: 10 }, { flex: 8 }] },
    cup: { fingers: [28, 36, 22], thumb: [{ flex: 25, oppose: 20 }, { flex: 15 }, { flex: 10 }] },
    grip: { fingers: [76, 84, 58], thumb: [{ flex: 55, oppose: -10 }, { flex: 35 }, { flex: 25 }] },
    fist: { fingers: [88, 98, 62], thumb: [{ flex: 60, oppose: -5 }, { flex: 45 }, { flex: 35 }] },
    point: { fingers: [88, 98, 62], index: [4, 4, 2], thumb: [{ flex: 58, oppose: -5 }, { flex: 45 }, { flex: 30 }] },
    hook: { fingers: [15, 80, 50], thumb: [{ flex: 15, oppose: 10 }, { flex: 15 }, { flex: 10 }] },
};
const FINGERS = ["Index", "Middle", "Ring", "Pinky"];
const DIGIT = /^(Left|Right)Hand(Index|Middle|Ring|Pinky|Thumb)/;

// A fist's width along what it holds (metres): a second hand holds a haft at least this far from the first
const FIST = 0.09;
const MORE = { Index: 0.92, Middle: 1, Ring: 1.05, Pinky: 1.1 };

// A key pose with its hands' shapes turned into finger joints (a hand with only a shape, its arm
// left to the joint angles, isn't reached; a second hand on a weapon grips it, unless it says)
function withFingers(pose) {
    const out = { ...pose };

    for (const side of HANDS) {
        const hand = pose[side];
        const shape = CURLS[hand?.shape ?? (hand && "on" in hand ? "grip" : null)];

        if (!shape) {
            continue;
        }

        const Side = side === "right" ? "Right" : "Left";

        if (!hand.at && !("on" in hand)) {
            delete out[side];
        }

        for (const finger of FINGERS) {
            const curls = finger === "Index" && shape.index ? shape.index : shape.fingers.map((flex) => flex * MORE[finger]);

            curls.forEach((flex, k) => {
                const extra = finger === "Index" && hand.index !== undefined ? hand.index * [1, 1.1, 0.7][k] : 0;

                out[`${Side}Hand${finger}${k + 1}`] = { flex: Math.min(100, flex + extra), spread: shape === CURLS.open ? [4, 1, -2, -5][FINGERS.indexOf(finger)] : 0 };
            });
        }

        shape.thumb.forEach((angles, k) => (out[`${Side}HandThumb${k + 1}`] = angles));
    }

    return out;
}

// An action's tracks: for each joint it moves (and the pelvis offset, and each hand's place),
// the names of its values and each key's values, filled in where a key leaves them out from the
// keys either side
function compile(rawKeys) {
    const keys = rawKeys.map(([time, pose]) => [time, withFingers(pose)]);
    const times = keys.map(([time]) => time);
    const channels = new Map();
    const namesOf = (joint, value) => {
        if (joint === "offset") {
            return ["x", "y", "z"];
        }

        if (HANDS.includes(joint)) {
            // Its vectors, and how easily the forearm and wrist are held (Rig.reachArm's `pronate`
            // and `wrist`); a second hand on a weapon, how far down it (or its place, `at`)
            return [
                ...("on" in value ? ["on"] : []),
                ...VECTORS.filter((name) => value[name]).flatMap((name) => [`${name}X`, `${name}Y`, `${name}Z`]),
                // (Whether the hand's reached at all: not before the first key that places it, nor
                // after the last; how much it's turned the way its vectors say, and its elbow
                // pointed: 1 in a key that says, 0 in one that leaves it to come naturally; eased
                // between)
                "reach",
                "held",
                "bent",
                ...("pronate" in value ? ["pronate"] : []),
                ...(value.wrist ? ["wristFlex", "wristDeviate"] : []),
            ];
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
            switch (name) {
                case "on":
                case "pronate":
                    return value[name];
                case "reach":
                    return 1;
                case "held":
                    return value.point || value.palm || "on" in value ? 1 : 0;
                case "bent":
                    return value.elbow ? 1 : 0;
                case "wristFlex":
                    return value.wrist?.flex ?? 0;
                case "wristDeviate":
                    return value.wrist?.deviate ?? 0;
                default:
                    return value[name.slice(0, -1)]?.["XYZ".indexOf(name.at(-1))];
            }
        }

        return value[name];
    };

    const tracks = [...channels].map(([joint, nameSet]) => {
        const names = [...nameSet];
        const values = keys.map(() => new Float64Array(names.length));

        // Each key's values: its own, or where the line between the keys either side that have
        // them passes then (or, before the first or after the last, that one's; a hand isn't
        // reached there at all)
        keys.forEach(([, pose], k) => {
            names.forEach((name, n) => {
                values[k][n] = read(joint, pose[joint], name) ?? NaN;
            });
        });

        for (let n = 0; n < names.length; n++) {
            const given = values.flatMap((row, k) => (Number.isNaN(row[n]) ? [] : [k]));

            values.forEach((row, k) => {
                if (!Number.isNaN(row[n])) {
                    return;
                }

                const before = given.findLast((g) => g < k);
                const after = given.find((g) => g > k);

                if (before === undefined || after === undefined) {
                    row[n] = names[n] === "reach" ? 0 : (values[before ?? after]?.[n] ?? 0);
                } else {
                    const u = (times[k] - times[before]) / (times[after] - times[before]);

                    row[n] = values[before][n] + (values[after][n] - values[before][n]) * u;
                }
            });
        }

        return { joint, names, values };
    });

    // (It eases out after its last key before the end, or from 1.55 if that's sooner)
    return { times, tracks, settle: Math.max(1.55, times.at(-2) ?? 0) };
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
const MIRRORED = new Set(["turn", "bend", "obliquity", "atX", "pointX", "edgeX", "palmX", "towardsX", "elbowX"]);

const _rotation = new THREE.Quaternion();
const _fall = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _across = new THREE.Vector3();
const _frame = new THREE.Quaternion();
const _shoulder = new THREE.Vector3();
const _item = new THREE.Quaternion();
const _hand = new THREE.Quaternion();
const _basis = new THREE.Matrix4();
const _wrist = new THREE.Vector3();

/**
 * An empty hand's anatomical frame (world) with its palm facing `palm` and its fingers pointing
 * `towards`. In the anatomical frame the fingers point down its y axis and the palm faces across
 * its x axis (inwards: the left hand's to its right, the right hand's to its left).
 */
function palmFrame(side, palm, towards) {
    const s = side === "left" ? 1 : -1;
    const x = palm.clone().normalize().multiplyScalar(-s);
    const y = towards.clone().normalize().negate();

    y.addScaledVector(x, -y.dot(x));

    if (y.lengthSq() < 1e-6) {
        y.set(0, 1, 0).addScaledVector(x, -x.y);
    }

    y.normalize();

    const z = new THREE.Vector3().crossVectors(x, y);

    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

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

        /** Where each elbow swivelled to last frame (Rig.reachArm), to stay near; null: not reaching. */
        this.swivel = { right: null, left: null };

        /** How far past their ranges each arm's joints were last asked to go (degrees, for checking poses). */
        this.strain = { right: 0, left: 0 };
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

    /** Hold one key pose (as an attack's), until something else is done: for trying poses out. */
    holdPose(pose) {
        this.attack = { name: "pose", variant: 0, tracks: compile([[0, pose], [2, pose]]), start: this.time, hitAt: 1, duration: Infinity, mirror: false, held: true };
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
                // Key time: 0 to 1 until the blow lands, 1 to 2 after (a held pose: always there)
                const key = this.attack.held ? 1 : elapsed < hitAt ? elapsed / hitAt : 1 + (elapsed - hitAt) / Math.max(1e-3, duration - hitAt);
                const weight = this.attack.held ? 1 : smooth(0, 0.3, key) * (1 - smooth(tracks.settle, 2, key)) * easing;

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
        const reached = new Set();

        for (const { hands, weight } of this.reaching) {
            // A hand holding the other's weapon goes second; given its own place, the weapon lies
            // along the line through both hands' places
            const order = HANDS.filter((side) => hands[side] && (hands[side].reach ?? 1) > 0.001).sort((a, b) => Number("on" in hands[a]) - Number("on" in hands[b]));
            const grips = {};

            for (const side of order) {
                const other = side === "right" ? "left" : "right";
                const second = hands[other] && "on" in hands[other] && hands[other].at ? this.#place(other, hands[other].at) : null;

                grips[side] = this.#reach(side, hands[side], weight * (hands[side].reach ?? 1), grips[other], second);
                reached.add(side);
            }
        }

        // (An arm let go of starts afresh next time)
        for (const side of HANDS) {
            if (!reached.has(side)) {
                this.swivel[side] = null;
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
                    if (channel === "reach") {
                        hand.reach = Math.min(1, Math.max(0, value(n)));
                    } else if (channel === "on" || channel === "pronate" || channel === "held" || channel === "bent") {
                        hand[channel] = value(n);
                    } else if (channel === "wristFlex" || channel === "wristDeviate") {
                        hand.wrist ??= { flex: 0, deviate: 0 };
                        hand.wrist[channel === "wristFlex" ? "flex" : "deviate"] = value(n);
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

            // (A hand gripping what it holds keeps its grip, whatever shape the pose gives it)
            if (index === undefined || (DIGIT.test(name) && this.character.holds[name.startsWith("Left") ? "Left" : "Right"]?.grips)) {
                continue;
            }

            const angles = {};

            names.forEach((angle, n) => (angles[angle] = value(n)));

            const { kind, side } = rig.joints[index];

            jointRotation(kind, side, angles, _rotation);
            blendRotation(kind, side, rig.rotations[index], _rotation, weight, rig.rotations[index]);
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

    // Where a hand's place (`at`: arm lengths from its shoulder, in the character's frame) is in the world
    #place(side, at) {
        const body = this.#measure();
        const shoulder = this.rig.bone("Spine2").localToWorld(_shoulder.copy(body.shoulders[side]));

        this.character.object.getWorldQuaternion(_frame);

        return new THREE.Vector3().fromArray(at).multiplyScalar(body.arm).applyQuaternion(_frame).add(shoulder);
    }

    // Reach one hand to its place as a real arm would (Rig.reachArm: every joint within its
    // range), blending from where the walk and joint angles put it by `weight`. The hand turns so
    // what it holds points the way the pose says (`point`, `edge`), or, empty, so its palm faces
    // `palm` with the fingers `towards` (else relaxed). Returns its grip: { position, point, edge, haft }
    // in the world
    #reach(side, hand, weight, other, second = null) {
        const rig = this.rig;
        const Side = side === "right" ? "Right" : "Left";
        const body = this.#measure();
        const handBone = rig.bone(`${Side}Hand`);
        const handFrame = rig.frames[rig.index.get(`${Side}Hand`)];
        const item = this.character.items.find((model) => model.parent === handBone);
        const socket = body.sockets[side];
        const itemPosition = item ? item.position : socket.position;
        const itemQuaternion = item ? item.quaternion : socket.quaternion;
        let position;
        let point = null;
        let edge = null;

        this.character.object.getWorldQuaternion(_frame);

        if ("on" in hand) {
            if (!other) {
                return null;
            }

            // Further down the other hand's weapon, along it (turned as comes naturally): where
            // it passes nearest this hand's place, or `on` metres down; below the other fist, and
            // where the haft's held (ITEMS: `haft`)
            const wanted = hand.at ? this.#place(side, hand.at).sub(other.position).dot(other.point) : -hand.on;
            const along = Math.min(other.haft?.[1] ?? -FIST, Math.max(other.haft?.[0] ?? -Infinity, wanted));

            position = other.position.clone().addScaledVector(other.point, along);
            point = other.point.clone();
        } else {
            position = this.#place(side, hand.at);

            if (second) {
                // Held in both hands: along the line from the other hand's place through this one's
                point = position.clone().sub(second).normalize();
                edge = hand.edge ? new THREE.Vector3().fromArray(hand.edge).applyQuaternion(_frame) : null;
            } else if (hand.point) {
                point = new THREE.Vector3().fromArray(hand.point).normalize().applyQuaternion(_frame);
                edge = hand.edge ? new THREE.Vector3().fromArray(hand.edge).applyQuaternion(_frame) : null;
            }
        }

        // The hand's anatomical frame wanted: holding its item that way (pointing it `point`,
        // its edge `edge`), or its palm and fingers facing theirs; or just which way what it
        // holds points (no edge), or its palm faces (no fingers), the hand turning naturally to
        // it; or none (relaxed)
        let wanted = null;
        let aim = null;
        const inHand = _item.copy(handFrame).invert().multiply(itemQuaternion).clone();

        if (point && !edge) {
            aim = { axis: new THREE.Vector3(0, 1, 0).applyQuaternion(inHand), toward: point };
        } else if (point) {
            edge.addScaledVector(point, -edge.dot(point));

            if (edge.lengthSq() < 1e-6) {
                edge.set(1, 0, 0).addScaledVector(point, -point.x);
            }

            edge.normalize();
            _across.crossVectors(point, edge);
            _basis.makeBasis(_across, point, edge);
            wanted = new THREE.Quaternion().setFromRotationMatrix(_basis).multiply(_item.copy(itemQuaternion).invert()).multiply(handFrame);
        } else if (hand.palm && hand.towards) {
            wanted = palmFrame(side, new THREE.Vector3().fromArray(hand.palm).applyQuaternion(_frame), new THREE.Vector3().fromArray(hand.towards).applyQuaternion(_frame));
        } else if (hand.palm) {
            // (The palm faces across the hand's anatomical frame: the left's to its right, the right's to its left)
            aim = { axis: new THREE.Vector3(side === "left" ? -1 : 1, 0, 0), toward: new THREE.Vector3().fromArray(hand.palm).normalize().applyQuaternion(_frame) };
        }

        const saved = [`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`].map((name) => rig.bone(name).quaternion.clone());
        const offset = itemPosition.clone().applyQuaternion(_item.copy(handFrame).invert());
        const bend = hand.elbow && (hand.bent ?? 1) > 0.001 ? new THREE.Vector3().fromArray(hand.elbow).normalize().applyQuaternion(_frame) : null;
        const held = second || "on" in hand ? 1 : hand.held ?? 1;
        const solved = rig.reachArm(Side, { grip: position, offset, hand: wanted, aim, hold: held, pronate: hand.pronate ?? 25, wrist: hand.wrist ?? null, bend, bent: hand.bent ?? 1, swivel: this.swivel[side] });

        this.swivel[side] = solved.swivel;
        this.strain[side] = solved.strain;

        // Blend with where the arm was (joint by joint, as they move)
        if (weight < 1) {
            [`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`].forEach((name, i) => rig.blendBone(name, saved[i], weight));
            rig.bone(`${Side}Arm`).updateMatrixWorld(true);
        }

        // Where the grip ended up (for a second hand on the same weapon)
        handBone.getWorldQuaternion(_hand);

        const grip = { position: itemPosition.clone().applyQuaternion(_hand).add(handBone.getWorldPosition(_wrist)), point: new THREE.Vector3(), edge: new THREE.Vector3(), haft: ITEMS[item?.name]?.haft ?? null };

        _item.copy(itemQuaternion).premultiply(_hand);
        grip.point.set(0, 1, 0).applyQuaternion(_item);
        grip.edge.set(0, 0, 1).applyQuaternion(_item);

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

            blendRotation(kind, side, rig.rotations[index], jointRotation(kind, side, angles, _rotation), Math.max(buckle, tilt), rig.rotations[index]);
        }

        // The whole body turns about the pelvis to lie flat, the pelvis dropping to the ground
        // and ending up behind (or in front of) where the feet were
        _fall.setFromAxisAngle(_axis.set(1, 0, 0), direction * angle);
        rig.rotations[0].premultiply(_fall);
        rig.offset.set(0, -hips * 0.22 * buckle * (1 - tilt) + (0.14 - hips) * tilt, direction * hips * 0.82 * tilt);
    }
}
