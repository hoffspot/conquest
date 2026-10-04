// Actions: movements layered over walking and standing (locomotion.js). They cover:
//  - attacking with each weapon, and standing on guard while fighting;
//  - flinching when hit, differently for each kind of blow (weapons.js: an attack's `reaction`),
//    and from the side it came from;
//  - falling down dead, and lying there;
//  - the tavern's folk: sitting on a bench, raising a tankard and drinking from it, putting one
//    down on a table, drawing ale from a barrel, and a courtesan beckoning the player over;
//  - resting: how each role (roles.js: the barkeep, a serving wench, a patron, the madam, a
//    courtesan, the player's adventurer) passes the time, five ways each (RESTS).
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
import { CLIP_HEIGHT, CLIP_KEYS } from "./clip-keys.js";
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

// A hand on the hip (side 1: the right), the fingers forward over the hip bone, the thumb behind,
// the elbow out to the side
const akimbo = (side) => ({ at: [side * -0.08, -0.68, 0.02], palm: [side * 0.98, -0.12, -0.18], towards: [side * 0.09, -0.52, 0.85], elbow: [-side, -0.2, -0.3], shape: "relaxed" });

// The right hand held out in front, palm up, the index finger curled `index` degrees (beckoning)
const BECKONING = (index) => ({ at: [0.04, -0.12, 0.72], palm: [0, 1, 0.1], towards: [0.05, 0.1, 1], shape: "beckon", index });
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
// Reaching up over a shoulder for what's on the back: the elbow up and forward, the hand by the
// ear (bent further back, an elbow folds past what it can); and the other hand behind the hip
// pushing the lower end of a staff or hammer out and up, and at the left hip holding a scabbard's
// throat (and pulling it back as the blade comes out)
const OVER_RIGHT = [-0.4, 0.8, 0.45];
const OVER_LEFT = [0.4, 0.8, 0.45];
const PUSH_UP = { at: [0.05, -0.8, -0.25], palm: [0, 0.4, -0.9], towards: [0, -0.2, -1], shape: "open", elbow: [0.6, -0.3, -0.75] };
// Crossing the body for a hilt at the left hip: the elbow forward and out, in front of the
// lower ribs, so the forearm passes before the belly, not through it
const CROSS = [-0.55, -0.35, 0.75];
const THROAT = { at: [-0.04, -0.66, 0.12], palm: [-0.9, 0, -0.3], towards: [0, -0.4, 0.9], shape: "relaxed" };
const THROAT_BACK = { at: [-0.04, -0.66, -0.04], palm: [-0.9, 0, -0.3], towards: [0, -0.4, 0.9], shape: "relaxed" };
const REACH_OUT = { at: [-0.15, -0.35, 0.75], pronate: 20, wrist: { flex: -5, deviate: 0 }, shape: "relaxed" };

// The shield arm (a shield strapped to the left forearm: equipment.js), whatever the free hand
// was to do in a fight: the forearm level across the chest, the thumb up and the elbow out, so the
// shield stands upright before the body, its face to the enemy; drawn in and up before the chest
// as the free hand would be drawn in (DRAW_IN), out and lower as it would reach out (REACH_OUT),
// and between, as far as it would reach (`at` z); and drawn in, swung aside to the left
// (`aside`) as the sword hand comes across the body (its `at` x, `across`), out of its way
const SHIELD = { in: [-0.38, -0.05, 0.52], out: [-0.36, -0.15, 0.6], aside: [-0.05, 0, 0.5], across: [0.1, 0.5], elbow: [0.9, -0.45, -0.1], pronate: -55, wrist: { flex: 0, deviate: 0 } };

// A staff or war hammer held upright out at the right side in the one hand while the other casts
// a spell, its foot clear of the legs
const UPRIGHT = { at: [-0.1, -0.5, 0.45], point: [0.05, 1, 0.1], pronate: 10 };
const LEFT_ARM = /^Left(Shoulder|Arm|ForeArm|Hand)/;
const SHIELD_SOCKETS = new Set(["leftForearm", "leftFist"]);

// What a shield held up keeps behind it (the body, but for the arm that bears it: a few hundred
// points of its skin, HELD_POINTS), by how much (metres: what's worn over it), and how far at
// most it's moved out of the way at a time
const SHIELD_CLEAR = 0.025;
const SHIELD_NUDGE = 0.08;
const SHIELD_CROUCH = 1.5;

// What's held kept out of the body through an action (a blow, a draw, a rest): a few hundred points
// of its skin, but for the arms that hold it (HELD_POINTS), each with which way it faces; how near
// the skin what's held comes (metres), how near the grip a part of it is moved with the hand rather
// than turned about the grip (metres), how far it's turned (radians) or the hand moved (metres) at
// most, how many times the arm's reached again; how far apart the points kept of what's held are,
// how long the clusters they're looked at in are, how far from one the skin nearest it is looked
// for, and how far the skin placed by its heaviest bone may be from where it is (metres)
const HELD_POINTS = 700;
const HELD_CLEAR = 0.006;
const HELD_LEVER = 0.1;
const HELD_TURN = 0.6;
const HELD_MOVE = 0.08;
const HELD_TRIES = 3;
const HELD_GRID = 0.025;
const HELD_CLUSTER = 0.08;
const HELD_NEAR = 0.08;
const HELD_ROUGH = 0.03;
// How far off to one side of the nearest skin of its sample a point behind that skin can be (the
// sample's a few centimetres apart; further, and it's beside the skin, not in it)
const HELD_SPREAD = 0.05;
// The forearms and hands kept out of the torso (a hand's place is measured in arm lengths from the
// shoulder, so on a bulkier body than the keys were set on it can come inside it): the points looked
// at along each forearm (elbow to wrist) and hand (wrist to the middle knuckles), how near the
// torso's skin their own skin comes (metres: resting on it, not in it), how far the hand's moved out
// at most (metres) and how many times the arm's reached again
const LIMBS = [
    ["ForeArm", "Hand", [0.25, 0.5, 0.75, 1]],
    ["Hand", "HandMiddle1", [0.5, 1]],
];
const TORSO = /^(Hips|Spine|Spine1|Spine2|Neck)$/;
const LIMB_CLEAR = 0.004;
const LIMB_MOVE = 0.2;
const LIMB_TRIES = 3;
// How much further past their ranges (degrees, Rig.reachArm's strain) moving a hand out may want
// its arm's joints: past that, the move's halved (a hand behind a thick neck rubs nearer it rather
// than the shoulder going round further than it can)
const LIMB_STRAIN = 6;
// (Nor further than sinks what the hand holds into the body by more than this: metres)
const LIMB_SINK = 0.005;
const DRAW_IN = { at: [-0.08, -0.62, 0.32], pronate: 30, shape: "relaxed" };
const SWUNG_BACK = { at: [0.05, -0.85, -0.2], pronate: 10, shape: "relaxed" };

/** How each weapon is held while fighting, eased into when a fight starts. */
export const GUARDS = Object.freeze({
    // (A sword before the right hip, the forearm level and the elbow at the side, the point at the enemy's face)
    sword: { right: { at: [0.1, -0.55, 0.72], point: [0.2, 0.6, 0.78], edge: [-0.35, -0.7, 0.63] }, left: FREE },
    // (Two-handed: the left hand's place too, the shaft lying along the line from it through the right)
    staff: { right: { at: [0.31, -0.57, 0.7] }, left: { on: 0, at: [-0.2, -0.74, 0.65] } },
    wand: { right: { at: [0.1, -0.55, 0.72], point: [0.1, 0.45, 0.9] }, left: FREE },
    grimoire: { left: book, right: { at: [0.22, -0.58, 0.5], pronate: 40, wrist: { flex: 8, deviate: -5 }, shape: "relaxed" } },
    hammer: { right: { at: [0.18, -0.42, 0.65], edge: [0.1, -0.3, 0.95] }, left: { on: 0, at: [-0.35, -0.89, 0.31] } },
    // (The bow low before the body, its back to the enemy, the drawing hand near the string; its
    // lower limb forward, clear of the thigh swinging up running)
    bow: { left: { at: [-0.15, -0.6, 0.62], point: [-0.3, 0.9, 0.2], edge: [0, -0.5, 0.85] }, right: { at: [0.3, -0.6, 0.5], pronate: 40, shape: "relaxed" } },
    punch: { right: fist(1), left: fist(-1), ...spine({ flex: 6 }) },
    // (Kicking: a looser guard, the fists lower, the body upright; the fists kept before the
    // chest as it turns)
    kick: { right: { ...fist(1), at: [0.26, 0.05, 0.4], shape: "fist", chest: 1 }, left: { ...fist(-1), at: [-0.22, -0.02, 0.55], shape: "fist", chest: 1 }, ...spine({ flex: 2 }) },
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

// Kicking (with the right leg; every other kick is mirrored, with the left): the kicking leg's
// joints, from standing (the standing leg is left to keep its foot planted), and how far each
// foot is let go of the ground (`free`: the kicking foot, from as it lifts to as it's down again)
const LEG_DOWN = { RightUpLeg: { flex: 0, abduct: 0, rotate: 0 }, RightLeg: { flex: 0 }, RightFoot: { flex: 0 }, free: { right: 0 } };
const KICK = rest(GUARDS.kick, { Hips: { turn: 0, tilt: 0, obliquity: 0 }, ...LEG_DOWN });
const lifted = (pose) => ({ free: { right: 1 }, ...pose });
const CAST = { ...spine({}), Head: { flex: 0 }, offset: [0, 0, 0] };

// One way of doing an action: its name and key poses, from and back to `start`
const variant = (name, start, ...keys) => ({ name, keys: [[0, start], ...keys, [2, start]] });

// A clip's key poses (clip-keys.js: each key's time and its values in the channels' order: a
// joint's angle, "Spine.flex"; one of a vector's, "right.at.0"; a hand's shape, "right.shape")
function unpack({ channels, keys }) {
    return keys.map(([time, ...values]) => {
        const pose = {};

        channels.forEach((channel, c) => {
            const [joint, name, k] = channel.split(".");

            if (joint === "offset") {
                (pose.offset ??= [0, 0, 0])[name] = values[c];
            } else if (k !== undefined) {
                ((pose[joint] ??= {})[name] ??= [0, 0, 0])[k] = values[c];
            } else {
                (pose[joint] ??= {})[name] = values[c];
            }
        });

        return [time, pose];
    });
}

// One way done as an animator's clip does it (Mesh2Motion's, baked into key poses by
// scripts/bake-clips.js: clip-keys.js): the body and arms as it moves them, the feet where they
// stand (but a kicking leg's), easing out from `settle` (its pelvis's offset is for its body's
// height: `scaled`); a hand kept as `hands` says, not as the clip has it (null: as it is, holding
// a tankard or a sword)
const clipped = (name, clip, { settle = 1.6, hands = {} } = {}) => ({
    name,
    keys: unpack(CLIP_KEYS[clip]).map(([time, pose]) => [time, Object.fromEntries(Object.entries({ ...pose, ...hands }).filter(([, part]) => part !== null))]),
    settle,
    scaled: true,
    clip,
});

// The smith's hammer, raised by the right shoulder (its head back, its face up) and brought down
// flat on the work (the handle level, the face down); the tongs holding the work on the anvil
const HAMMER_UP = { at: [0.05, 0.3, 0.3], point: [-0.41, 0.41, -0.82], edge: [0.18, 0.91, 0.37] };
const HAMMER_DOWN = { at: [0.12, -0.92, 0.5], point: [0.67, 0.33, 0.67], edge: [0.67, -0.67, -0.33] };
const TONGS_ON_ANVIL = { at: [-0.1, -0.72, 0.5], point: [-0.67, -0.33, 0.67], edge: [0.71, 0, 0.71] };

// Both hands on the bellows' lever (side 1: the right), palms down round it: up, or pushed down
const lever = (side, y) => ({ at: [side * -0.02 + (side > 0 ? 0.14 : -0.14), y, 0.62], palm: [0, -1, 0], towards: [side * 0.2, 0, 1], shape: "grip" });

// The right hand on the grindstone's crank, going round (`turn`: 0 to 1)
const crank = (turn) => {
    const angle = turn * Math.PI * 2;

    return { at: [0.12, -0.58 + 0.1 * Math.sin(angle), 0.6 + 0.1 * Math.cos(angle)], palm: [0.8, -0.2, 0], towards: [0, 0, 1], shape: "grip" };
};

// Hands together before the chest in prayer (`y`: how low, arm lengths below the shoulders),
// fingers up; the right hand raised in blessing, palm out; a hand flat on the chest
const PRAYING = (y = -0.42) => ({
    right: { at: [0.28, y, 0.34], palm: [0.89, -0.45, 0], towards: [0.32, 0.63, 0.71], shape: "open" },
    left: { at: [-0.28, y, 0.34], palm: [-0.89, -0.45, 0], towards: [-0.32, 0.63, 0.71], shape: "open" },
});
const BLESSING = { at: [0.05, 0.18, 0.55], palm: [0, 0, 1], towards: [0, 1, 0.1], shape: "open" };
const ON_CHEST = { at: [-0.3, -0.4, 0.2], palm: [0, 0, -1], towards: [-1, 0, 0], shape: "open" };

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
                // Raised over the right shoulder, the head back, then brought down on the enemy,
                // the rear hand drawn back to the left hip (the butt past it, clear of the thighs)
                [0.6, { right: { at: [0.03, 0.41, 0.21] }, left: { on: 0, at: [-0.45, 0.17, 0.32] }, ...spine({ flex: -6, turn: -18 }), offset: [0, 0.01, -0.04] }],
                [1, { right: { at: [0.56, -0.56, 0.61] }, left: { on: 0, at: [-0.08, -0.74, 0.44] }, ...spine({ flex: 16, turn: 12 }), offset: [0, -0.05, 0.08] }],
                [1.3, { right: { at: [0.26, -0.87, 0.58] }, left: { on: 0, at: [0.05, -1.0, 0.1] }, ...spine({ flex: 18, turn: 14 }), offset: [0, -0.06, 0.07] }]),
            variant("sweep", STAFF,
                // Swung back round to the right, then swept flat across to the left, the rear hand
                // at the left hip and the butt behind it
                [0.6, { right: { at: [-0.5, -0.26, 0.3] }, left: { on: 0, at: [-0.14, -0.46, 0.37] }, ...spine({ turn: -32 }), Hips: { turn: 12 }, offset: [0, -0.02, -0.03] }],
                [1, { right: { at: [0.3, -0.5, 0.75] }, left: { on: 0, at: [0.1, -0.75, 0.2] }, ...spine({ flex: 6, turn: 22 }), Hips: { turn: -12 }, offset: [0, -0.05, 0.08] }],
                [1.35, { right: { at: [0.6, -0.5, 0.55] }, left: { on: 0, at: [0.12, -0.75, 0.15] }, ...spine({ flex: 8, turn: 30 }), Hips: { turn: -15 }, offset: [0, -0.05, 0.06] }]),
            variant("thrust", STAFF,
                // Drawn back low, the rear hand at the left hip and the butt past it, then driven
                // head first at the enemy
                [0.6, { right: { at: [0.29, -0.67, 0.57] }, left: { on: 0, at: [0.04, -0.75, -0.03] }, ...spine({ turn: -14 }), offset: [0, -0.02, -0.07] }],
                [1, { right: { at: [0.33, -0.64, 0.77] }, left: { on: 0, at: [0.05, -0.8, 0.35] }, ...spine({ flex: 10, turn: 12 }), offset: [0, -0.07, 0.16] }],
                [1.3, { right: { at: [0.42, -0.76, 0.53] }, left: { on: 0, at: [0.05, -0.8, 0.3] }, ...spine({ flex: 10, turn: 10 }), offset: [0, -0.07, 0.14] }]),
            variant("rising strike", STAFF,
                // The head low behind on the right, then swung up under the enemy's guard
                [0.6, { right: { at: [-0.28, -0.96, 0.17] }, left: { on: 0, at: [-0.02, -0.62, 0.63] }, ...spine({ flex: 14, turn: -18 }), offset: [0, -0.06, -0.02] }],
                [1, { right: { at: [0.34, -0.36, 0.49] }, left: { on: 0, at: [-0.23, -0.97, 0.52] }, ...spine({ flex: 4, turn: 10 }), offset: [0, -0.03, 0.08] }],
                [1.35, { right: { at: [0.18, -0.2, 0.5] }, left: { on: 0, at: [-0.55, -0.54, 0.63] }, ...spine({ flex: -4, turn: 12 }), offset: [0, -0.01, 0.06] }]),
            variant("spinning strike", STAFF,
                // Wound far round to the right, the staff raised back over the right shoulder, then
                // the whole body turns into the blow, the rear hand coming to the left hip
                [0.5, { right: { at: [-0.54, 0.13, 0.03] }, left: { on: 0, at: [-0.4, -0.1, 0.45] }, ...spine({ turn: -45, flex: -4 }), Hips: { turn: 25 }, offset: [0, 0, -0.04] }],
                [1, { right: { at: [0.3, -0.45, 0.75] }, left: { on: 0, at: [0.1, -0.75, 0.2] }, ...spine({ flex: 8, turn: 30 }), Hips: { turn: -25 }, offset: [0, -0.05, 0.1] }],
                [1.35, { right: { at: [0.7, -0.5, 0.45] }, left: { on: 0, at: [0.15, -0.75, 0.15] }, ...spine({ flex: 8, turn: 40 }), Hips: { turn: -30 }, offset: [0, -0.05, 0.07] }]),
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
            // From a clip: the wand raised from the hip and thrust out at the enemy, held as the
            // spell goes, and lowered
            clipped("thrust out", "wandShot"),
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
                [0.6, { right: { at: [0.06, 0.85, 0.2] }, left: { on: 0, at: [-0.62, 0.58, 0.58] }, ...spine({ flex: -12 }), offset: [0, 0.02, -0.05] }],
                [1, { right: { at: [0.48, -0.65, 0.75] }, left: { on: 0, at: [-0.21, -0.82, 0.31] }, ...spine({ flex: 18 }), offset: [0, -0.1, 0.1] }],
                [1.35, { right: { at: [0.62, -0.67, 0.34] }, left: { on: 0, at: [0, -0.62, -0.02] }, ...spine({ flex: 28 }), offset: [0, -0.14, 0.1] }],
                // (Lifted out in front on the way back, clear of the legs)
                [1.7, { right: { at: [0.3, -0.5, 0.75] }, left: { on: 0, at: [-0.25, -0.85, 0.45] }, ...spine({ flex: 12 }), offset: [0, -0.06, 0.05] }]),
            variant("side swing", HAMMER,
                // Swung back round to the right, then flat into the enemy's side, the face first
                [0.6, { right: { at: [-0.41, -0.24, 0.12] }, left: { on: 0, at: [-0.29, -0.68, 0.31] }, ...spine({ turn: -35 }), Hips: { turn: 15 }, offset: [0, -0.02, -0.04] }],
                [1, { right: { at: [0.22, -0.6, 0.42] }, left: { on: 0, at: [-0.46, -0.79, 0.55] }, ...spine({ flex: 8, turn: 25 }), Hips: { turn: -18 }, offset: [0, -0.06, 0.08] }],
                [1.35, { right: { at: [0.56, -0.56, 0.09] }, left: { on: 0, at: [-0.1, -0.8, 0.63] }, ...spine({ flex: 12, turn: 35 }), Hips: { turn: -20 }, offset: [0, -0.07, 0.06] }]),
            variant("diagonal chop", HAMMER,
                // Up over the right shoulder, then down and across
                [0.6, { right: { at: [-0.17, 0.36, 0.36] }, left: { on: 0, at: [-0.6, 0, 0.42] }, ...spine({ turn: -22, flex: -8 }), Hips: { turn: 10 }, offset: [0, 0.01, -0.04] }],
                [1, { right: { at: [0.45, -0.83, 0.57] }, left: { on: 0, at: [-0.32, -1, 0.43] }, ...spine({ flex: 20, turn: 15 }), Hips: { turn: -10 }, offset: [0, -0.1, 0.1] }],
                [1.35, { right: { at: [0.55, -0.75, 0.45] }, left: { on: 0, at: [-0.25, -0.9, 0.45] }, ...spine({ flex: 26, turn: 18 }), Hips: { turn: -12 }, offset: [0, -0.12, 0.09] }],
                // (Lifted out in front on the way back, clear of the legs)
                [1.7, { right: { at: [0.23, -0.47, 0.6] }, left: { on: 0, at: [-0.3, -0.95, 0.25] }, ...spine({ flex: 12, turn: 8 }), Hips: { turn: -5 }, offset: [0, -0.05, 0.04] }]),
            variant("upswing", HAMMER,
                // Low behind, then swung up under the enemy's chin
                [0.6, { right: { at: [-0.12, -0.95, 0.56] }, left: { on: 0, at: [-0.5, -0.6, 0.72] }, ...spine({ flex: 18, turn: -15 }), offset: [0, -0.1, -0.03] }],
                [1, { right: { at: [0.32, -0.56, 0.63] }, left: { on: 0, at: [-0.36, -0.83, 0.47] }, ...spine({ flex: -2, turn: 10 }), offset: [0, 0, 0.08] }],
                [1.35, { right: { at: [0.25, -0.15, 0.46] }, left: { on: 0, at: [-0.45, -0.47, 0.6] }, ...spine({ flex: -6, turn: 12 }), offset: [0, 0.01, 0.06] }]),
            variant("leaping slam", HAMMER,
                // Rising up on the toes with it high overhead, then slammed down, crouching into it
                [0.55, { right: { at: [0.08, 0.84, 0.14] }, left: { on: 0, at: [-0.62, 0.6, 0.53] }, ...spine({ flex: -16 }), offset: [0, 0.05, -0.06] }],
                [1, { right: { at: [0.25, -0.67, 0.78] }, left: { on: 0, at: [-0.31, -0.79, 0.3] }, ...spine({ flex: 26 }), offset: [0, -0.16, 0.14] }],
                [1.4, { right: { at: [0.67, -0.76, 0.02] }, left: { on: 0, at: [0.03, -0.61, -0.23] }, ...spine({ flex: 32 }), offset: [0, -0.18, 0.12] }],
                // (Lifted out in front on the way back, clear of the legs)
                [1.7, { right: { at: [0.2, -0.37, 0.7] }, left: { on: 0, at: [-0.32, -0.87, 0.35] }, ...spine({ flex: 14 }), offset: [0, -0.08, 0.06] }]),
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
                // (Not carried so far across that the forearm comes down on the lead fist)
                [1.4, { right: { at: [0.5, 0.12, 0.6], palm: [0, -1, -0.2], towards: [1, 0, -0.1], elbow: [-1, 0, -0.2] }, left: fist(-1), ...spine({ flex: 6, turn: 30 }), Hips: { turn: -15 }, offset: [0, -0.03, 0.04] }]),
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
            // From clips: a jab with the lead hand (the rear fist kept up at the chin, as a boxer
            // keeps it, not flung out as the clip has it) and a cross from the rear, the body
            // turning into each from a boxer's stance
            clipped("jab", "jab", { hands: { left: { ...fist(-1), shape: "fist", chest: 1 } } }),
            clipped("cross", "cross"),
        ],
    },
    kick: {
        // (The foot lifts off as the knee comes up, and is down again before the end; the body
        // leans away from the kick to balance it, the fists kept up)
        alternate: true,
        variants: [
            variant("front kick", KICK,
                // The knee drawn up high, then the leg snapped straight out into the belly, the
                // toes pointed, leaning back a little, then drawn back in and put down
                [0.25, { free: { right: 1 } }],
                [0.6, lifted({ RightUpLeg: { flex: 94, abduct: 4 }, RightLeg: { flex: 118 }, RightFoot: { flex: -25 }, ...spine({ flex: -2 }), Hips: { tilt: -4 }, offset: [0, -0.03, -0.01] })],
                [1, lifted({ RightUpLeg: { flex: 80, abduct: 2 }, RightLeg: { flex: 4 }, RightFoot: { flex: -40 }, ...spine({ flex: -2 }), Neck: { flex: 6 }, Head: { flex: 8 }, Hips: { tilt: -8 }, offset: [0, -0.08, 0.04] })],
                [1.35, lifted({ RightUpLeg: { flex: 90, abduct: 4 }, RightLeg: { flex: 110 }, RightFoot: { flex: -25 }, ...spine({ flex: -2 }), Hips: { tilt: -4 }, offset: [0, -0.03, 0.01] })],
                [1.7, { ...LEG_DOWN, free: { right: 0.4 }, RightUpLeg: { flex: 20 }, RightLeg: { flex: 30 }, Hips: { tilt: 0 }, offset: [0, -0.01, 0] }],
                [1.85, { free: { right: 0 } }]),
            variant("roundhouse", KICK,
                // Pivoting on the standing foot, the hips turning over and leaning back, the knee
                // brought round and the shin whipped into the enemy's ribs, the chest and head
                // kept turned to them, the kicking side's fist swung down and back
                [0.25, { free: { right: 1 } }],
                [0.6, lifted({ RightUpLeg: { flex: 75, abduct: 35, rotate: -25 }, RightLeg: { flex: 125 }, RightFoot: { flex: -30 }, ...spine({ turn: -15 }), Hips: { turn: -40, tilt: -6 }, offset: [0, -0.03, -0.02] })],
                [1, lifted({ RightUpLeg: { flex: 62, abduct: 45, rotate: -35 }, RightLeg: { flex: 10 }, RightFoot: { flex: -45 }, ...spine({ turn: -25, flex: 4 }), Neck: { turn: -10, flex: 6 }, Head: { turn: -10, flex: 8 }, Hips: { turn: -55, tilt: -18 }, offset: [0, -0.08, 0.01], right: { at: [0.05, -0.62, -0.1], palm: [0.3, 0, -1], towards: [0, -1, 0], shape: "fist" } })],
                [1.35, lifted({ RightUpLeg: { flex: 72, abduct: 35, rotate: -25 }, RightLeg: { flex: 120 }, RightFoot: { flex: -30 }, ...spine({ turn: -15 }), Hips: { turn: -45, tilt: -8 }, offset: [0, -0.03, 0] })],
                [1.7, { ...LEG_DOWN, free: { right: 0.4 }, RightUpLeg: { flex: 25, abduct: 10 }, RightLeg: { flex: 40 }, ...spine({ turn: -4 }), Hips: { turn: -12, tilt: 0 }, offset: [0, -0.01, 0] }],
                [1.85, { free: { right: 0 } }]),
            variant("side kick", KICK,
                // Turned side on, the knee drawn up across the body, then the heel driven
                // straight out into the enemy, the body leaning right away from it
                [0.25, { free: { right: 1 } }],
                [0.6, lifted({ RightUpLeg: { flex: 80, abduct: 20, rotate: -20 }, RightLeg: { flex: 125 }, RightFoot: { flex: 10 }, ...spine({ turn: -25 }), Hips: { turn: -65, tilt: -8 }, offset: [0, -0.03, -0.03] })],
                [1, lifted({ RightUpLeg: { flex: 20, abduct: 45, rotate: -20 }, RightLeg: { flex: 0 }, RightFoot: { flex: 15 }, ...spine({ turn: -35 }), Neck: { turn: -15, flex: 12 }, Head: { turn: -15, flex: 12 }, Hips: { turn: -82, tilt: -28 }, offset: [0, -0.08, -0.03] })],
                [1.35, lifted({ RightUpLeg: { flex: 75, abduct: 25, rotate: -20 }, RightLeg: { flex: 120 }, RightFoot: { flex: 10 }, ...spine({ turn: -28 }), Hips: { turn: -68, tilt: -10 }, offset: [0, -0.03, -0.01] })],
                [1.7, { ...LEG_DOWN, free: { right: 0.4 }, RightUpLeg: { flex: 25, abduct: 8 }, RightLeg: { flex: 40 }, ...spine({ turn: -6 }), Hips: { turn: -15, tilt: 0 }, offset: [0, -0.01, 0] }],
                [1.85, { free: { right: 0 } }]),
            variant("stamp", KICK,
                // The knee raised high, the foot flexed, then stamped down and forward through
                // the enemy's knee, leaning into it
                [0.25, { free: { right: 1 } }],
                [0.6, lifted({ RightUpLeg: { flex: 105, abduct: 8, rotate: 10 }, RightLeg: { flex: 105 }, RightFoot: { flex: 15 }, ...spine({ flex: -2 }), Hips: { tilt: -4 }, offset: [0, -0.01, -0.03] })],
                [1, lifted({ RightUpLeg: { flex: 42, abduct: 6, rotate: 15 }, RightLeg: { flex: 4 }, RightFoot: { flex: 15 }, ...spine({ flex: 10 }), Hips: { tilt: 4 }, offset: [0, -0.07, 0.07] })],
                [1.35, lifted({ RightUpLeg: { flex: 50, abduct: 6, rotate: 10 }, RightLeg: { flex: 40 }, RightFoot: { flex: 5 }, ...spine({ flex: 8 }), Hips: { tilt: 2 }, offset: [0, -0.06, 0.05] })],
                [1.7, { ...LEG_DOWN, free: { right: 0.4 }, RightUpLeg: { flex: 20 }, RightLeg: { flex: 25 }, ...spine({ flex: 3 }), offset: [0, -0.02, 0.02] }],
                [1.85, { free: { right: 0 } }]),
            variant("spinning back kick", KICK,
                // Spun round on the standing foot until the back is to the enemy, the knee
                // tucked, looking over the shoulder; then the heel driven straight back into
                // them, leaning forward away from it; then turned back round to face them. (The
                // pelvis turns about the standing foot; its lean, `tilt`, is about the body's
                // side to side axis before it turned: a lean back, turned round, is forward)
                [0.3, { free: { right: 0.6 }, ...spine({ turn: 10 }), Hips: { turn: 70 }, offset: [0.06, -0.02, 0] }],
                [0.65, lifted({ RightUpLeg: { flex: 70, abduct: 0 }, RightLeg: { flex: 120 }, RightFoot: { flex: 10 }, ...spine({ flex: 6, turn: 30 }), Neck: { turn: 20 }, Head: { turn: 20 }, Hips: { turn: 165, tilt: -8 }, offset: [0.12, -0.05, 0] })],
                [1, lifted({ RightUpLeg: { flex: -30, abduct: -12 }, RightLeg: { flex: 2 }, RightFoot: { flex: 15 }, ...spine({ flex: 12, turn: 45 }), Neck: { turn: 30 }, Head: { turn: 30, flex: 8 }, Hips: { turn: 172, tilt: -28 }, offset: [0.08, -0.12, -0.03] })],
                [1.35, lifted({ RightUpLeg: { flex: 60, abduct: 0 }, RightLeg: { flex: 110 }, RightFoot: { flex: 5 }, ...spine({ flex: 6, turn: 30 }), Neck: { turn: 20 }, Head: { turn: 20 }, Hips: { turn: 160, tilt: -8 }, offset: [0.12, -0.05, 0] })],
                [1.65, { ...LEG_DOWN, free: { right: 0.5 }, RightUpLeg: { flex: 25 }, RightLeg: { flex: 40 }, ...spine({ turn: 8 }), Neck: { turn: 0 }, Head: { turn: 0 }, Hips: { turn: 55, tilt: 0 }, offset: [0.05, -0.02, 0] }],
                [1.85, { free: { right: 0 } }]),
            // From motion capture: the knee drawn up, the foot pushed straight out at the enemy's
            // middle, the body leaning back from it, and down again (the fists kept up before the
            // chest, as a kicker keeps them, not dropped as the clip has them; the rear a little
            // further out than on guard and its elbow out from the ribs, clear of the body as it
            // comes forward again)
            clipped("push kick", "pushKick", { hands: { right: { ...GUARDS.kick.right, at: [0.22, 0.05, 0.5], elbow: [-0.45, -1, 0] }, left: GUARDS.kick.left } }),
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

    // Spells, cast with the free hand (the left; the right, if the left holds a bow), key 1 when
    // the spell takes effect
    castHeal: {
        // (The light gathered in the cupped hand, then lifted up in the open palm, the fingers up)
        cast: true,
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
        cast: true,
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
    // The smithy's folk (one way each, key 1 at the moment that matters). Hammering: three blows
    // on the work on the anvil, the hammer raised and brought down flat, the tongs holding it
    forge: {
        variants: [
            variant("forge", { ...spine({}), Head: { flex: 0 }, offset: [0, 0, 0] },
                [0.5, { right: HAMMER_UP, left: TONGS_ON_ANVIL, ...spine({ flex: 18, turn: -6 }), Head: { flex: 16 }, offset: [0, -0.02, 0.03] }],
                [1, { right: HAMMER_DOWN, left: TONGS_ON_ANVIL, ...spine({ flex: 30, turn: 4 }), Head: { flex: 18 }, offset: [0, -0.04, 0.05] }],
                [1.22, { right: HAMMER_UP, left: TONGS_ON_ANVIL, ...spine({ flex: 18, turn: -6 }) }],
                [1.44, { right: HAMMER_DOWN, left: TONGS_ON_ANVIL, ...spine({ flex: 30, turn: 4 }) }],
                [1.64, { right: HAMMER_UP, left: TONGS_ON_ANVIL, ...spine({ flex: 18, turn: -6 }) }],
                [1.84, { right: HAMMER_DOWN, left: TONGS_ON_ANVIL, ...spine({ flex: 30, turn: 4 }), Head: { flex: 18 }, offset: [0, -0.04, 0.05] }]),
        ],
    },
    // Heating the work: thrust into the forge's coals with the tongs, and turned there
    heat: {
        variants: [
            variant("heat", { ...spine({}), offset: [0, 0, 0] },
                [0.6, { left: { at: [-0.05, -0.45, 0.7], point: [0, 0, 1], edge: [-0.71, -0.71, 0] }, ...spine({ flex: 16 }), offset: [0, -0.02, 0.04] }],
                [1, { left: { at: [-0.05, -0.47, 0.72], point: [-0.45, 0, 0.89], edge: [0.89, 0, 0.45] }, ...spine({ flex: 18 }) }],
                [1.5, { left: { at: [-0.05, -0.45, 0.7], point: [0, 0, 1], edge: [-0.71, -0.71, 0] }, ...spine({ flex: 16 }), offset: [0, -0.02, 0.04] }]),
        ],
    },
    // Quenching it: plunged into the trough with the tongs, hissing, and held there
    quench: {
        variants: [
            variant("quench", { ...spine({}), offset: [0, 0, 0] },
                [0.6, { left: { at: [-0.05, -0.45, 0.62], point: [0, 0, 1], edge: [-0.71, -0.71, 0] }, ...spine({ flex: 14 }) }],
                [1, { left: { at: [-0.1, -0.8, 0.55], point: [-0.67, -0.67, 0.33], edge: [0.74, -0.53, 0.42] }, ...spine({ flex: 30 }), offset: [0, -0.04, 0.04] }],
                [1.5, { left: { at: [-0.1, -0.78, 0.55], point: [-0.58, -0.58, 0.58], edge: [0.71, 0, 0.71] }, ...spine({ flex: 28 }), offset: [0, -0.04, 0.04] }]),
        ],
    },
    // Working the bellows: both hands on the lever, pushing it down and letting it up, thrice
    pump: {
        variants: [
            variant("pump", { ...spine({}) },
                [0.5, { right: lever(1, -0.3), left: lever(-1, -0.3), ...spine({ flex: 8 }) }],
                [1, { right: lever(1, -0.6), left: lever(-1, -0.6), ...spine({ flex: 18 }) }],
                [1.28, { right: lever(1, -0.3), left: lever(-1, -0.3), ...spine({ flex: 8 }) }],
                [1.54, { right: lever(1, -0.6), left: lever(-1, -0.6), ...spine({ flex: 18 }) }],
                [1.8, { right: lever(1, -0.3), left: lever(-1, -0.3), ...spine({ flex: 8 }) }]),
        ],
    },
    // Turning the grindstone's crank, round and round, the other hand on the frame
    crank: {
        variants: [
            variant("crank", { ...spine({}) },
                ...[0.4, 0.55, 0.7, 0.85, 1, 1.15, 1.3, 1.45, 1.6, 1.75].map((time, k) => [time, { right: crank(k / 4), left: { at: [-0.15, -0.62, 0.5], palm: [0, -1, 0], towards: [0, 0, 1], shape: "open" }, ...spine({ flex: 16 }) }])),
        ],
    },
    // A guild's: the receptionist stamping a notice on the counter (the stamp raised and brought
    // down, twice), and filing it on the shelves behind (reaching up); an adventurer reading the
    // quest board (a finger along a notice, the other hand on the hip)
    stamp: {
        variants: [
            variant("stamp", { ...spine({}), Head: { flex: 0 } },
                [0.5, { right: { at: [0.1, -0.35, 0.55], palm: [0.3, -0.9, 0.2], towards: [0, 0, 1], shape: "grip" }, left: { at: [-0.12, -0.66, 0.62], palm: [0, -1, 0], towards: [0.25, 0, 1], shape: "open" }, ...spine({ flex: 12 }), Head: { flex: 16 } }],
                [1, { right: { at: [0.1, -0.64, 0.6], palm: [0.3, -0.9, 0.2], towards: [0, 0, 1], shape: "grip" }, ...spine({ flex: 16 }) }],
                [1.25, { right: { at: [0.1, -0.35, 0.55], palm: [0.3, -0.9, 0.2], towards: [0, 0, 1], shape: "grip" }, ...spine({ flex: 12 }) }],
                [1.5, { right: { at: [0.1, -0.64, 0.6], palm: [0.3, -0.9, 0.2], towards: [0, 0, 1], shape: "grip" }, ...spine({ flex: 16 }), Head: { flex: 18 } }]),
        ],
    },
    file: {
        variants: [
            variant("file", { ...spine({}), Head: { flex: 0 } },
                [0.6, { right: { at: [0.05, 0.45, 0.5], palm: [0, -0.2, 1], towards: [0, 1, 0.1], shape: "relaxed" }, ...spine({ flex: -6 }), Head: { flex: -16 } }],
                [1, { right: { at: [0.05, 0.55, 0.55], palm: [0, -0.2, 1], towards: [0, 1, 0.1], shape: "open" }, ...spine({ flex: -8 }), Head: { flex: -20 } }],
                [1.5, { right: { at: [0.1, 0.1, 0.4], palm: [0, -0.2, 1], towards: [0, 1, 0.1], shape: "relaxed" }, ...spine({}), Head: { flex: -4 } }]),
        ],
    },
    read: {
        variants: [
            variant("read", { ...spine({}), Head: { flex: 0, turn: 0 } },
                [0.6, { right: { at: [0.05, 0.05, 0.62], palm: [0.2, 0, 1], towards: [0, 1, 0.2], shape: "beckon", index: 0 }, left: akimbo(-1), ...spine({ flex: 4 }), Head: { flex: 4, turn: -6 } }],
                [1, { right: { at: [0.18, -0.1, 0.62], palm: [0.2, 0, 1], towards: [0, 1, 0.2], shape: "beckon", index: 0 }, Head: { flex: 8, turn: 6 } }],
                [1.5, { right: { at: [0.05, -0.2, 0.62], palm: [0.2, 0, 1], towards: [0, 1, 0.2], shape: "beckon", index: 0 }, Head: { flex: 10, turn: -4 } }]),
        ],
    },
    // A temple's: the priest blessing the pews (the right hand raised, palm out, and drawn down
    // and across in the sign of the Hearth, the other on the chest), and lighting a candle at a
    // shrine (reaching forward to its wick, bowing a little)
    bless: {
        variants: [
            variant("bless", { ...spine({}), Head: { flex: 0 } },
                [0.6, { right: BLESSING, left: ON_CHEST, ...spine({ flex: -3 }), Head: { flex: -4 } }],
                [1, { right: { ...BLESSING, at: [0.05, 0.28, 0.55] }, left: ON_CHEST, Head: { flex: -6 } }],
                [1.3, { right: { ...BLESSING, at: [0.05, -0.05, 0.55] }, left: ON_CHEST }],
                [1.5, { right: { ...BLESSING, at: [-0.12, 0.12, 0.55] }, left: ON_CHEST }],
                [1.7, { right: { ...BLESSING, at: [0.2, 0.12, 0.55] }, left: ON_CHEST, ...spine({ flex: 4 }), Head: { flex: 6 } }]),
        ],
    },
    light: {
        variants: [
            variant("light", { ...spine({}), Head: { flex: 0 } },
                [0.6, { right: { at: [0.08, -0.5, 0.6], palm: [0.2, -0.4, 0.9], towards: [0, 0.2, 1], shape: "relaxed" }, ...spine({ flex: 16 }), Head: { flex: 14 } }],
                [1, { right: { at: [0.08, -0.56, 0.66], palm: [0.2, -0.4, 0.9], towards: [0, 0.1, 1], shape: "relaxed" }, left: ON_CHEST, ...spine({ flex: 20 }), Head: { flex: 18 } }],
                [1.5, { right: { at: [0.08, -0.5, 0.6], palm: [0.2, -0.4, 0.9], towards: [0, 0.2, 1], shape: "relaxed" }, left: ON_CHEST, ...spine({ flex: 12 }), Head: { flex: 10 } }]),
        ],
    },
    // Beckoning the player over (a courtesan, when she first sees them): facing them, a hand
    // held out palm up, the index finger curling "come here" three times, the other on the hip
    beckon: {
        variants: [
            variant("beckon", { ...spine({}), Head: { bend: 0, flex: 0 }, Hips: { obliquity: 0, turn: 0 }, offset: [0, 0, 0] },
                [0.5, { right: BECKONING(10), left: akimbo(-1), Hips: { obliquity: 6, turn: -6 }, ...spine({ flex: -3, bend: -5 }), Head: { bend: 10, flex: 4 }, offset: [0.03, -0.01, 0] }],
                [0.75, { right: BECKONING(85) }],
                [1, { right: BECKONING(10) }],
                [1.2, { right: BECKONING(85) }],
                [1.4, { right: BECKONING(10) }],
                [1.6, { right: BECKONING(85) }],
                [1.8, { right: BECKONING(20), left: akimbo(-1), Hips: { obliquity: 6, turn: -6 }, ...spine({ flex: -3, bend: -5 }), Head: { bend: 8, flex: 2 }, offset: [0.03, -0.01, 0] }]),
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

// Where the toast starts from: the tankard held before the chest
const TOASTING = { right: tankard, ...spine({}), Head: { flex: 0 } };

// A hand on the front of the thigh, palm to it and the fingers down (the right: trailing down it)
const THIGH_HIGH = { at: [0.06, -0.72, 0.16], palm: [0.25, 0, -0.97], towards: [0, -1, 0.1], shape: "open" };
const THIGH_LOW = { at: [0.05, -0.92, 0.18], palm: [0.25, 0, -0.97], towards: [0, -1, 0.1], shape: "open" };

// A hand flat against the side of the body (side 1: the right), `x` in from the shoulder and `y`
// below it, the fingers forward and down
const flank = (hand, x, y) => ({ at: [hand * x, y, 0.08], palm: [hand * 0.95, 0, -0.3], towards: [0, -0.4, 0.9], shape: "open" });

// Arms folded over the chest: each hand tucked under the other arm, the right forearm over the left
const FOLDED = { right: { at: [0.74, -0.36, 0.24], point: [0, 1, 0], edge: [1, 0, 0] }, left: { at: [-0.74, -0.44, 0.22], point: [0, 1, 0], edge: [-1, 0, 0] } };

// A rest another role has too, under its own name
const renamed = (rest, name) => ({ ...rest, name });

// The smith, both hands full, easing a stiff back: arching it, the shoulders drawn back, the
// head back, the tools kept hanging at the sides (a hand pressed to the small of the back would
// press them into it)
const EASING_THE_BACK = variant("stretching the back", { ...spine({}), Head: { flex: 0 }, LeftShoulder: { protract: 0 }, RightShoulder: { protract: 0 }, offset: [0, 0, 0] },
    [0.5, { ...spine({ flex: -7 }), Head: { flex: -8 }, LeftShoulder: { protract: -12 }, RightShoulder: { protract: -12 } }],
    [1, { ...spine({ flex: -13 }), Head: { flex: -14 }, LeftShoulder: { protract: -18 }, RightShoulder: { protract: -18 }, offset: [0, 0, 0.03] }],
    [1.5, { ...spine({ flex: -8 }), Head: { flex: -6 }, LeftShoulder: { protract: -8 }, RightShoulder: { protract: -8 }, offset: [0, 0, 0.01] }]);

// The smith holding up the work in the tongs to look it over, turning it this way and that
const LOOKING_OVER = variant("looking over the work", { ...spine({}), Head: { flex: 0, turn: 0 } },
    [0.5, { left: { at: [0.02, -0.1, 0.6], point: [0, 0.89, 0.45], edge: [0, -0.45, 0.89] }, Head: { flex: 12, turn: 4 } }],
    [1, { left: { at: [0.04, -0.08, 0.58], point: [0.41, 0.82, 0.41], edge: [-0.09, -0.41, 0.91] }, Head: { flex: 14, turn: 10 } }],
    [1.4, { left: { at: [0.02, -0.1, 0.6], point: [0, 0.89, 0.45], edge: [-0.71, -0.32, 0.63] }, Head: { flex: 12, turn: 2 } }],
    [1.75, { ...spine({}), Head: { flex: 2, turn: 0 } }]);

// A hand behind the back, clasping the other (side 1: the right)
const clasped = (side) => ({ at: [side * 0.12, -0.82, -0.16], palm: [0, 0, -1], towards: [side * 0.3, -0.9, 0], shape: "relaxed" });

// A serving wench's rests (some of them the smith's and the apprentice's too)
const BARMAID_RESTS = [
    variant("wiping her brow", { ...spine({}), Head: { flex: 0 } },
        // The back of the wrist across the forehead, then a sigh
        [0.5, { left: { at: [-0.52, 0.42, 0.26], palm: [0, 0.2, 1], towards: [-1, 0.1, 0], elbow: [0.8, 0.3, 0.3], shape: "relaxed" }, Head: { flex: -6 } }],
        [1, { left: { at: [-0.12, 0.44, 0.24], palm: [0, 0.2, 1], towards: [-1, 0.1, 0], elbow: [0.8, 0.3, 0.3], shape: "relaxed" }, Head: { flex: -8 } }],
        [1.4, { left: { at: [0.02, -0.2, 0.3] }, ...spine({ flex: 6 }), Head: { flex: 10 } }]),
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
];

// The player's rests (some of them the smith's and the apprentice's too)
const ADVENTURER_RESTS = [
    variant("stretching", { ...spine({}), Head: { flex: 0 } },
        // Both arms up high and apart (clear of a hat's brim), the back arched, then down
        [0.55, { right: { at: [-0.08, 0.7, 0.2], palm: [0.67, 0.07, 0.74], towards: [-0.2, 1, -0.05], shape: "open" }, left: { at: [0.08, 0.7, 0.2], palm: [-0.67, 0.07, 0.74], towards: [0.2, 1, -0.05], shape: "open" }, ...spine({ flex: -6 }), Head: { flex: -8 } }],
        [1, { right: { at: [-0.12, 0.95, 0.08], palm: [0.6, 0.4, 0.7], towards: [-0.3, 0.95, -0.25], shape: "open" }, left: { at: [0.12, 0.95, 0.08], palm: [-0.6, 0.4, 0.7], towards: [0.3, 0.95, -0.25], shape: "open" }, ...spine({ flex: -12 }), Head: { flex: -16 } }],
        [1.35, { right: { at: [-0.12, 0.93, 0.06], palm: [0.6, 0.4, 0.7], towards: [-0.3, 0.95, -0.25], shape: "open" }, left: { at: [0.12, 0.93, 0.06], palm: [-0.6, 0.4, 0.7], towards: [0.3, 0.95, -0.25], shape: "open" }, ...spine({ flex: -13 }), Head: { flex: -16 } }],
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
        // From one foot to the other, a thumb in the belt (the hand brought to it from the front,
        // over a sword's hilt there)
        [0.25, { left: { at: [-0.12, -0.72, 0.36], pronate: 30, shape: "relaxed" } }],
        [0.5, { left: { at: [-0.26, -0.62, 0.22], palm: [0, -0.2, -0.98], towards: [-0.2, -0.96, 0.19], shape: "relaxed" }, Hips: { obliquity: -6 }, ...spine({ bend: 5 }), offset: [-0.04, -0.01, 0] }],
        [1, { left: { at: [-0.26, -0.62, 0.22], palm: [0, -0.2, -0.98], towards: [-0.2, -0.96, 0.19], shape: "relaxed" }, Hips: { obliquity: 6 }, ...spine({ bend: -5 }), offset: [0.04, -0.01, 0] }],
        [1.5, { left: { at: [-0.26, -0.62, 0.22], palm: [0, -0.2, -0.98], towards: [-0.2, -0.96, 0.19], shape: "relaxed" }, Hips: { obliquity: -3 }, ...spine({ bend: 3 }), offset: [-0.02, 0, 0] }],
        // (And out of it forward again before it's let fall)
        [1.75, { left: { at: [-0.12, -0.72, 0.36], pronate: 30, shape: "relaxed" }, Hips: { obliquity: 0 }, ...spine({}), offset: [0, 0, 0] }]),
];

// The priest's rests (some of them the acolyte's too)
const PRIEST_RESTS = [
    variant("hands folded in prayer", { ...spine({}), Head: { flex: 0 } },
        // Hands together before the chest, the head bowed, a moment's silence
        [0.5, { ...PRAYING(), Head: { flex: 16 } }],
        [1.6, { ...PRAYING(), ...spine({ flex: 4 }), Head: { flex: 20 } }]),
    variant("arms raised in praise", { ...spine({}), Head: { flex: 0 } },
        // Both arms raised high and wide, palms up, the face lifted
        [0.5, { right: { at: [-0.3, 0.6, 0.4], palm: [0.3, 0.7, 0.6], towards: [-0.3, 0.9, 0.2], shape: "open" }, left: { at: [0.3, 0.6, 0.4], palm: [-0.3, 0.7, 0.6], towards: [0.3, 0.9, 0.2], shape: "open" }, ...spine({ flex: -6 }), Head: { flex: -14 } }],
        [1.4, { right: { at: [-0.32, 0.64, 0.38], palm: [0.3, 0.7, 0.6], towards: [-0.3, 0.9, 0.2], shape: "open" }, left: { at: [0.32, 0.64, 0.38], palm: [-0.3, 0.7, 0.6], towards: [0.3, 0.9, 0.2], shape: "open" }, ...spine({ flex: -8 }), Head: { flex: -18 } }],
        [1.75, { ...spine({}), Head: { flex: 0 } }]),
    variant("a bow of the head", { ...spine({}), Head: { flex: 0 } },
        // Hands folded at the waist, a slow bow
        [0.5, { right: { at: [0.3, -0.72, 0.3], palm: [0.6, 0.2, 0.7], towards: [0.5, -0.3, 0.8], shape: "relaxed" }, left: { at: [-0.28, -0.74, 0.3], palm: [-0.6, 0.2, 0.7], towards: [-0.5, -0.3, 0.8], shape: "relaxed" } }],
        [1, { ...spine({ flex: 18 }), Head: { flex: 24 } }],
        [1.5, { ...spine({ flex: 4 }), Head: { flex: 6 } }]),
    variant("the sign of the Hearth", { ...spine({}), Head: { flex: 0 } },
        // Fingertips to the brow, then the heart, then out palm up to all
        [0.5, { right: { at: [0.3, 0.22, 0.28], palm: [0, 0, -1], towards: [0, 1, 0], shape: "open" }, Head: { flex: 8 } }],
        [1, { right: { at: [0.3, -0.32, 0.24], palm: [0, -0.45, -0.89], towards: [1, 0, 0], shape: "open" }, Head: { flex: 10 } }],
        [1.4, { right: { at: [0, -0.3, 0.62], palm: [0, 1, 0.2], towards: [0, 0, 1], shape: "open" }, Head: { flex: 0 } }]),
    variant("hands clasped behind", { ...spine({}), Head: { flex: 0, turn: 0 } },
        // Hands clasped at the small of the back (held there in every key), looking over the
        // pews one way and the other
        [0.5, { right: clasped(1), left: clasped(-1), ...spine({ flex: -3 }) }],
        [1, { right: clasped(1), left: clasped(-1), Head: { turn: 20 } }],
        [1.5, { right: clasped(1), left: clasped(-1), Head: { turn: -20 } }],
        [1.75, { right: clasped(1), left: clasped(-1), Head: { turn: 0 } }]),
];

/**
 * How each role passes the time (roles.js ROLES: the rests' names and timings, in the same order):
 * five keyed ways each, key 1 at the moment that matters, starting and ending in the pose it rests
 * in, and for many some of an animator's clips' ways after them (CLIP_RESTS). Seated patrons rest
 * sitting (the legs are the bench's), the others standing.
 */
// The barkeep's rests (the innkeeper's too, at the counter upstairs)
const BARKEEP_RESTS = [
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
];

const BASE_RESTS = {
    barkeep: BARKEEP_RESTS,
    innkeeper: BARKEEP_RESTS.map((rest, k) => ({ ...rest, name: ["wiping the counter", "a hand to the chin", "leaning on the counter", "arms folded", "rubbing the neck"][k] })),
    barmaid: BARMAID_RESTS,
    patron: [
        variant("a toast", TOASTING, ...ATTACKS.toast.variants[0].keys.slice(1, -1)),
        variant("a long drink", TOASTING,
            // The tankard's rim to the lips and tipped right back; taken off them forward, then the
            // mouth wiped on a sleeve
            [0.55, { right: { at: [0.2, 0.3, 0.42], point: [0.2, 0.75, -0.6] }, Head: { flex: -8 } }],
            [1, { right: { at: [0.22, 0.45, 0.35], point: [0.3, 0.3, -0.9] }, ...spine({ flex: -6 }), Head: { flex: -24 } }],
            [1.4, { right: { at: [0.18, 0.38, 0.28], point: [0.3, 0.15, -0.95] }, ...spine({ flex: -8 }), Head: { flex: -28 } }],
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
    courtesan: [
        variant("twirling her hair", { ...spine({}), Head: { bend: 0, flex: 0 }, Hips: { obliquity: 0 }, offset: [0, 0, 0] },
            // A lock of hair wound round a finger by the side of the neck, the head tilted to it
            [0.5, { left: { at: [-0.12, 0.3, 0.16], palm: [-0.9, 0, 0.4], towards: [0, 1, 0.1], shape: "beckon", index: 30 }, Hips: { obliquity: 4 }, Head: { bend: 12, flex: 4 }, offset: [-0.02, 0, 0] }],
            [0.75, { left: { at: [-0.09, 0.25, 0.2], palm: [-0.9, 0, 0.4], towards: [0, 1, 0.1], shape: "beckon", index: 70 } }],
            [1, { left: { at: [-0.13, 0.21, 0.16], palm: [-0.9, 0, 0.4], towards: [0, 1, 0.1], shape: "beckon", index: 25 }, Head: { bend: 14, flex: 6 } }],
            [1.25, { left: { at: [-0.09, 0.26, 0.12], palm: [-0.9, 0, 0.4], towards: [0, 1, 0.1], shape: "beckon", index: 70 } }],
            [1.55, { left: { at: [-0.12, 0.3, 0.16], palm: [-0.9, 0, 0.4], towards: [0, 1, 0.1], shape: "beckon", index: 30 }, Hips: { obliquity: 4 }, Head: { bend: 10, flex: 4 }, offset: [-0.02, 0, 0] }]),
        variant("a slow stretch", { ...spine({}), Head: { flex: 0 }, Hips: { obliquity: 0 }, offset: [0, 0, 0] },
            // Both hands behind the head, the elbows out, arching the back and swaying the hips
            [0.6, { right: { at: [0.3, 0.38, -0.02], palm: [0, 0, 1], towards: [1, 0.2, 0], elbow: [-1, 0.6, 0.2], shape: "relaxed" }, left: { at: [-0.3, 0.38, -0.02], palm: [0, 0, 1], towards: [-1, 0.2, 0], elbow: [1, 0.6, 0.2], shape: "relaxed" }, ...spine({ flex: -6 }), Head: { flex: -4 } }],
            [1, { ...spine({ flex: -12, bend: 4 }), Head: { flex: -10 }, Hips: { obliquity: 6 }, offset: [0.03, -0.01, 0] }],
            [1.4, { ...spine({ flex: -11, bend: -4 }), Head: { flex: -8 }, Hips: { obliquity: -6 }, offset: [-0.03, -0.01, 0] }],
            [1.7, { right: { at: [0.3, 0.38, -0.02], palm: [0, 0, 1], towards: [1, 0.2, 0], elbow: [-1, 0.6, 0.2], shape: "relaxed" }, left: { at: [-0.3, 0.38, -0.02], palm: [0, 0, 1], towards: [-1, 0.2, 0], elbow: [1, 0.6, 0.2], shape: "relaxed" }, ...spine({ flex: -4 }), Head: { flex: -2 }, Hips: { obliquity: 0 }, offset: [0, 0, 0] }]),
        variant("a hand on her hip", { ...spine({}), Head: { bend: 0 }, Hips: { obliquity: 0, turn: 0 }, offset: [0, 0, 0] },
            // A hand on the hip, the hip cocked, the other hand trailing slowly down the thigh
            [0.5, { left: akimbo(-1), right: THIGH_HIGH, Hips: { obliquity: 6, turn: -8 }, ...spine({ bend: -6 }), Head: { bend: 10 }, offset: [0.035, -0.01, 0] }],
            [1, { right: THIGH_LOW, Hips: { obliquity: 7, turn: -9 }, Head: { bend: 12 } }],
            [1.4, { right: THIGH_HIGH }],
            [1.7, { left: akimbo(-1), right: THIGH_HIGH, Hips: { obliquity: 6, turn: -8 }, ...spine({ bend: -6 }), Head: { bend: 10 }, offset: [0.035, -0.01, 0] }]),
        variant("blowing a kiss", { ...spine({}), Head: { flex: 0, bend: 0 } },
            // Fingertips to the lips, then the hand swept out towards whoever's watching, opening
            [0.6, { right: { at: [0.26, 0.28, 0.3], palm: [0, 0, -1], towards: [0, 1, 0.1], shape: "relaxed" }, Head: { flex: 4, bend: 6 } }],
            [0.8, { right: { at: [0.26, 0.29, 0.31], palm: [0, 0, -1], towards: [0, 1, 0.1], shape: "relaxed" }, Head: { flex: 6, bend: 6 } }],
            [1, { right: { at: [0.12, 0.2, 0.8], palm: [0.55, 0.8, -0.2], towards: [0, 0.25, 1], shape: "open" }, ...spine({ flex: 4 }), Head: { flex: -2, bend: 4 } }],
            [1.3, { right: { at: [0.1, 0.18, 0.84], palm: [0.55, 0.8, -0.2], towards: [0, 0.25, 1], shape: "open" }, ...spine({ flex: 4 }), Head: { flex: -2, bend: 6 } }],
            [1.6, { right: { at: [0.08, -0.4, 0.3], palm: [0.4, 0, -0.9], towards: [0, -0.8, 0.5], shape: "relaxed" }, ...spine({}), Head: { flex: 0, bend: 2 } }]),
        variant("smoothing down her sides", { ...spine({}), Head: { flex: 0 }, Hips: { obliquity: 0 } },
            // Both hands run slowly down her sides, from the ribs in to the waist and out over the hips
            [0.5, { right: flank(1, 0.09, -0.36), left: flank(-1, 0.09, -0.36), ...spine({ flex: -5 }), Head: { flex: -4 } }],
            [1, { right: flank(1, 0.13, -0.54), left: flank(-1, 0.13, -0.54), ...spine({ flex: -3 }), Hips: { obliquity: 4 } }],
            [1.4, { right: flank(1, 0.02, -0.72), left: flank(-1, 0.02, -0.72), ...spine({ flex: 0 }), Head: { flex: 2 }, Hips: { obliquity: -3 } }],
            [1.65, { right: flank(1, 0.02, -0.76), left: flank(-1, 0.02, -0.76), Hips: { obliquity: 0 } }]),
    ],
    adventurer: ADVENTURER_RESTS,
    smith: [
        renamed(BARMAID_RESTS[0], "wiping the brow"),
        LOOKING_OVER,
        ADVENTURER_RESTS[2],
        EASING_THE_BACK,
        ADVENTURER_RESTS[4],
    ],
    apprentice: [renamed(BARMAID_RESTS[0], "wiping the brow"), ADVENTURER_RESTS[1], ADVENTURER_RESTS[2], ADVENTURER_RESTS[3], ADVENTURER_RESTS[0]],
    priest: PRIEST_RESTS,
    receptionist: [
        variant("a cheerful wave", { ...spine({}), Head: { bend: 0 }, Hips: { obliquity: 0 } },
            // A bright wave, the hand high by the face, the head tilted
            [0.4, { right: { at: [0.02, 0.45, 0.35], palm: [0, 0, 1], towards: [0, 1, 0], shape: "open" }, left: akimbo(-1), Head: { bend: 10 }, Hips: { obliquity: 4 } }],
            [0.7, { right: { at: [-0.12, 0.48, 0.35], palm: [0, 0, 1], towards: [-0.3, 1, 0], shape: "open" } }],
            [0.9, { right: { at: [0.12, 0.48, 0.35], palm: [0, 0, 1], towards: [0.3, 1, 0], shape: "open" } }],
            [1.1, { right: { at: [-0.12, 0.48, 0.35], palm: [0, 0, 1], towards: [-0.3, 1, 0], shape: "open" } }],
            [1.35, { right: { at: [0.1, 0.46, 0.35], palm: [0, 0, 1], towards: [0.2, 1, 0], shape: "open" }, Head: { bend: 12 } }],
            [1.7, { ...spine({}), Head: { bend: 0 }, Hips: { obliquity: 0 } }]),
        variant("chin in her hands", { ...spine({}), Head: { flex: 0, bend: 0 }, offset: [0, 0, 0] },
            // Leaning on the counter, her chin in her hands, swaying a little
            [0.5, { ...PRAYING(0.02), ...spine({ flex: 24 }), Head: { flex: -18, bend: 6 }, offset: [0, -0.04, 0.06] }],
            [1.1, { ...spine({ flex: 26, bend: -4 }), Head: { flex: -16, bend: -8 } }],
            [1.6, { ...PRAYING(0.02), ...spine({ flex: 24, bend: 4 }), Head: { flex: -18, bend: 8 }, offset: [0, -0.04, 0.06] }]),
        variant("a little bow", { ...spine({}), Head: { flex: 0 } },
            // Hands together in front, a quick bow
            [0.4, { right: { at: [0.3, -0.72, 0.3], palm: [0.6, 0.2, 0.7], towards: [0.5, -0.3, 0.8], shape: "relaxed" }, left: { at: [-0.28, -0.74, 0.3], palm: [-0.6, 0.2, 0.7], towards: [-0.5, -0.3, 0.8], shape: "relaxed" } }],
            [1, { ...spine({ flex: 28 }), Head: { flex: 14 } }],
            [1.5, { ...spine({ flex: 2 }), Head: { flex: 0 } }]),
        renamed(BARKEEP_RESTS[0], "tidying the papers"),
        renamed(BARMAID_RESTS[2], "tucking back her hair"),
    ],
    acolyte: [PRIEST_RESTS[0], PRIEST_RESTS[2], ADVENTURER_RESTS[1], PRIEST_RESTS[3], ADVENTURER_RESTS[3]],
    worshipper: [
        variant("praying", { ...spine({}), Head: { flex: 0 } },
            // Hands together in prayer, the head bowed over them
            [0.5, { ...PRAYING(-0.45), ...spine({ flex: 6 }), Head: { flex: 18 } }],
            [1.6, { ...PRAYING(-0.45), ...spine({ flex: 8 }), Head: { flex: 22 } }]),
        variant("head bowed", { ...spine({}), Head: { flex: 0 } },
            // Bowed low, the hands folded in the lap
            [0.5, { right: { at: [0.26, -0.85, 0.42], palm: [0.3, 1, 0], towards: [0, 0, 1], shape: "relaxed" }, left: { at: [-0.26, -0.85, 0.42], palm: [-0.3, 1, 0], towards: [0, 0, 1], shape: "relaxed" }, ...spine({ flex: 14 }), Head: { flex: 30 } }],
            [1.6, { ...spine({ flex: 16 }), Head: { flex: 32 } }]),
        variant("looking up", { ...spine({}), Head: { flex: 0 } },
            // Hands together, looking up to the altar's god
            [0.5, { ...PRAYING(-0.35), ...spine({ flex: -4 }), Head: { flex: -20 } }],
            [1.6, { ...PRAYING(-0.35), ...spine({ flex: -5 }), Head: { flex: -22 } }]),
        variant("the sign of the Hearth", { ...spine({}), Head: { flex: 0 } },
            // Fingertips to the brow, then the heart, then out palm up
            [0.5, { right: { at: [0.3, 0.22, 0.28], palm: [0, 0, -1], towards: [0, 1, 0], shape: "open" }, Head: { flex: 10 } }],
            [1, { right: { at: [0.3, -0.32, 0.24], palm: [0, -0.45, -0.89], towards: [1, 0, 0], shape: "open" }, Head: { flex: 12 } }],
            [1.4, { right: { at: [0.1, -0.35, 0.6], palm: [0, 1, 0.2], towards: [0, 0, 1], shape: "open" }, Head: { flex: 4 } }]),
        variant("hands in the lap", { ...spine({}), Head: { flex: 0 } },
            // Hands open in the lap, palms up, eyes closed
            [0.5, { right: { at: [0.22, -0.88, 0.4], palm: [0, 1, 0], towards: [0, 0, 1], shape: "relaxed" }, left: { at: [-0.22, -0.88, 0.4], palm: [0, 1, 0], towards: [0, 0, 1], shape: "relaxed" }, Head: { flex: 12 } }],
            [1.6, { Head: { flex: 14 } }]),
    ],
};

// The officials of the town halls and keeps (built from the rests of others): a reeve and their
// clerk; a ruler on the throne, their steward, councillors at the table, sentries at the door;
// and petitioners waiting on the benches; a castle's quartermaster and arcanist; an abbey's
// herbalist
const { patron: PATRON, worshipper: WORSHIPPER } = BASE_RESTS;

// Rests as animators' clips have them (clip-keys.js; tried on every body as the keyed ones are):
// talking, both hands going (or seated, as at a table: the tankard held up before the chest as
// the patrons hold it, or with a sword in the right, the left only); scratching the head,
// puzzled (not under a wizard's hat); a hand on the hip, listening; a fist raised in a cheer; an
// arm up high, waving someone over. Gesturing with one arm, the other's left as it hangs (clear
// of a blade at the hip: Character.hung)
const TALKING = clipped("talking", "talking");
const TALKING_SEATED = clipped("talking", "talkingSeated");
const TALKING_DRINKING = clipped("talking", "talkingSeated", { hands: { right: tankard } });
const TALKING_ARMED = clipped("talking", "talkingSeated", { hands: { right: null } });
const HEAD_SCRATCH = clipped("scratching the head", "headScratch", { hands: { left: null } });
const LISTENING = clipped("listening, a hand on the hip", "listening");
const CHEER = clipped("a cheer", "cheer", { hands: { right: null } });
const HAILING = clipped("waving someone over", "hailing", { hands: { left: null } });

const KEYED_RESTS = {
    ...BASE_RESTS,
    reeve: [renamed(BARKEEP_RESTS[3], "arms folded"), LOOKING_OVER, renamed(BARKEEP_RESTS[1], "a hand to the chin"), PRIEST_RESTS[4], renamed(BARKEEP_RESTS[4], "rubbing the neck")],
    clerk: [renamed(BARMAID_RESTS[0], "wiping the brow"), ADVENTURER_RESTS[1], ADVENTURER_RESTS[3], renamed(BARKEEP_RESTS[4], "rubbing the neck"), ADVENTURER_RESTS[4]],
    ruler: [renamed(WORSHIPPER[4], "hands on the knees"), renamed(WORSHIPPER[2], "gazing over the hall"), renamed(PATRON[4], "looking about the hall"), renamed(WORSHIPPER[1], "brooding"), renamed(BARKEEP_RESTS[1], "stroking the chin")],
    steward: [renamed(BARKEEP_RESTS[3], "arms folded"), PRIEST_RESTS[4], renamed(BARKEEP_RESTS[1], "a hand to the chin"), ADVENTURER_RESTS[1], PRIEST_RESTS[2]],
    councillor: [renamed(WORSHIPPER[0], "hands folded"), renamed(WORSHIPPER[1], "deep in thought"), renamed(PATRON[4], "looking about"), renamed(WORSHIPPER[4], "hands in the lap"), renamed(BARKEEP_RESTS[1], "stroking the chin")],
    sentry: [ADVENTURER_RESTS[1], ADVENTURER_RESTS[2], ADVENTURER_RESTS[4], renamed(BARKEEP_RESTS[3], "arms folded"), PRIEST_RESTS[4]],
    petitioner: [renamed(WORSHIPPER[1], "waiting, head bowed"), renamed(PATRON[4], "looking about"), WORSHIPPER[4], renamed(BARKEEP_RESTS[4], "rubbing the neck"), renamed(WORSHIPPER[2], "looking up")],
    // A castle's undercroft's traders: its quartermaster behind the armoury's counter, and its
    // arcanist among their jars
    quartermaster: [renamed(BARKEEP_RESTS[3], "arms folded"), renamed(LOOKING_OVER, "looking over a blade"), renamed(BARKEEP_RESTS[0], "wiping the counter"), ADVENTURER_RESTS[2], renamed(BARKEEP_RESTS[4], "rubbing the neck")],
    arcanist: [PRIEST_RESTS[4], renamed(LOOKING_OVER, "holding a phial to the light"), renamed(BARKEEP_RESTS[1], "stroking the chin"), PRIEST_RESTS[2], ADVENTURER_RESTS[1]],
    // (An abbey's herbalist, as a temple's acolyte at prayer, and among their jars)
    herbalist: [PRIEST_RESTS[0], renamed(LOOKING_OVER, "holding a phial to the light"), PRIEST_RESTS[2], PRIEST_RESTS[4], ADVENTURER_RESTS[1]],
};

// Who rests the clips' ways too, after their own five (those with their hands full, the priests
// at prayer and the courtesans keep to theirs)
const CLIP_RESTS = {
    barkeep: [TALKING],
    innkeeper: [TALKING],
    patron: [TALKING_DRINKING],
    madam: [TALKING],
    apprentice: [HEAD_SCRATCH, TALKING],
    receptionist: [TALKING],
    adventurer: [CHEER, HAILING],
    reeve: [TALKING, LISTENING],
    clerk: [TALKING, HEAD_SCRATCH],
    ruler: [TALKING_ARMED],
    steward: [LISTENING, TALKING],
    councillor: [TALKING_SEATED],
    petitioner: [TALKING_SEATED],
    quartermaster: [TALKING],
    arcanist: [TALKING],
    herbalist: [TALKING],
};

export const RESTS = Object.freeze(Object.fromEntries(Object.entries(KEYED_RESTS).map(([role, rests]) => [role, [...rests, ...(CLIP_RESTS[role] ?? [])]])));

// --- Reactions to being hit ---

/**
 * How a character reacts to each kind of blow: its length (seconds), an effect for the world to
 * show where it lands, and the angles to add at time t (0 to 1), given where the blow came from:
 * `side` is 1 from the character's left, -1 from its right; `front` is 1 from in front, -1 from
 * behind. `offset` moves the pelvis (metres), a knock back or a stagger.
 */
// --- Drawing weapons and putting them away ---

// How long a weapon takes to settle into the hand that's taken it, or into its sheath, unless
// its draw says (s)
const SETTLE = 0.2;

// The weapon's guard, eased into at the end of drawing it (and out of, putting it away)
const guard = (name) => rest(GUARDS[name]);
const EASY = { ...spine({}), Hips: { turn: 0 }, offset: [0, 0, 0] };

/**
 * How each weapon (by its guard: GUARDS) is drawn from where it's put away (equipment.js SHEATHS)
 * and put back, each with a flourish: `draw` and `sheathe`, each { hitAt, duration (s), keys }.
 * Key time 1 is when the hand takes hold of it where it's put away (`sheath`: 1, a hand's place
 * and turn there), or lets go of it there; it moves between the two then. A draw ends in the
 * weapon's guard, and putting it away ends with the hands free. Worn weapons are drawn by making
 * fists and shadow boxing (gauntlets) or kicking (boots), and put away by shaking the hands out.
 */
export const DRAWS = Object.freeze({
    sword: {
        draw: {
            hitAt: 0.32,
            duration: 1.55,
            settle: 0.24,
            keys: [
                [0, EASY],
                // Across to the hilt at the left hip, turning towards it, the other hand at the
                // scabbard's throat...
                [0.55, { right: { at: [0.25, -0.45, 0.6], sheath: 0.35, elbow: CROSS }, left: THROAT, ...spine({ turn: 20 }) }],
                [1, { right: { at: [0.4, -0.65, 0.25], sheath: 1, elbow: CROSS }, left: THROAT, ...spine({ turn: 32, flex: 6 }), Hips: { turn: 8 } }],
                // ...drawn up and out across the body in one sweep...
                [1.14, { right: { at: [0.01, 0.25, 0.6], point: [0.5, 0.45, 0.74], edge: [-0.3, 0.9, -0.3] }, left: REACH_OUT, ...spine({ turn: -12 }), Hips: { turn: -4 } }],
                // ...raised in a salute before the face, then twirled round at the wrist, the
                // point sweeping down and back past the right side and up again...
                [1.3, { right: { at: [0.15, 0.05, 0.4], point: [0, 1, 0.12], edge: [0.1, -0.12, 0.99], elbow: [-0.33, -0.91, -0.26] }, left: FREE, ...spine({}), Hips: { turn: 0 } }],
                [1.45, { right: { at: [0.05, -0.2, 0.62], point: [0.64, -0.35, 0.69], edge: [-0.67, 0.06, 0.74], elbow: [-0.63, -0.76, -0.18] } }],
                [1.6, { right: { at: [-0.12, -0.38, 0.5], point: [-0.17, -0.96, 0.23] } }],
                [1.75, { right: { at: [0.05, -0.15, 0.62], point: [0.1, 0.6, 0.79], edge: [-0.35, -0.7, 0.63], elbow: [-0.1, -0.89, -0.44] } }],
                // ...and on guard
                [2, guard("sword")],
            ],
        },
        sheathe: {
            hitAt: 0.95,
            duration: 1.4,
            settle: 0.24,
            keys: [
                [0, guard("sword")],
                // A salute, a twirl forward...
                [0.3, { right: { at: [0.15, 0.05, 0.4], point: [0, 1, 0.12], edge: [0.1, -0.12, 0.99], elbow: [-0.33, -0.91, -0.26] }, left: FREE }],
                [0.55, { right: { at: [0, -0.13, 0.63], point: [0.2, -0.3, 0.93], edge: [-0.3, -0.9, -0.1] } }],
                // ...then the point round to the scabbard's mouth (the other hand at its throat,
                // guiding it in), the hilt kept out clear of the waist, and slid home
                [0.8, { right: { at: [0.38, -0.4, 0.75], point: [0.2, -0.8, -0.42], edge: [0, -0.55, 0.8], sheath: 0.35, elbow: CROSS }, left: THROAT, ...spine({ turn: 18 }) }],
                [0.9, { right: { at: [0.45, -0.55, 0.6], sheath: 0.7, elbow: CROSS }, ...spine({ turn: 26, flex: 2 }), Hips: { turn: 3 } }],
                [1, { right: { at: [0.4, -0.65, 0.25], sheath: 1, elbow: CROSS }, left: THROAT, ...spine({ turn: 32, flex: 4 }), Hips: { turn: 5 } }],
                // (The hand let go, falling to the side)
                [1.35, { right: { at: [0.1, -0.8, 0.12], pronate: 40, shape: "relaxed" }, left: FREE, ...spine({}), Hips: { turn: 0 } }],
                [2, EASY],
            ],
        },
    },
    wand: {
        draw: {
            hitAt: 0.25,
            duration: 1.3,
            settle: 0.15,
            keys: [
                [0, EASY],
                // Snatched from the belt, flicked up, its tip twirled round in a circle...
                [0.6, { right: { at: [-0.05, -0.72, 0.15], sheath: 0.7 } }],
                [1, { right: { at: [-0.05, -0.8, 0.1], sheath: 1 }, left: FREE }],
                [1.15, { right: { at: [0, -0.1, 0.55], point: [0.1, 0.9, 0.4] } }],
                [1.35, { right: { at: [0.1, 0.18, 0.6], point: [0.6, 0.6, 0.5] } }],
                [1.5, { right: { at: [0.15, 0.25, 0.62], point: [0, 0.3, 0.95] } }],
                [1.65, { right: { at: [0.05, 0.2, 0.6], point: [-0.6, 0.6, 0.5] } }],
                // ...and held up a moment, the tip sparking, then on guard
                [1.8, { right: { at: [0.1, 0.05, 0.65], point: [0.1, 0.8, 0.6] } }],
                [2, guard("wand")],
            ],
        },
        sheathe: {
            hitAt: 0.85,
            duration: 1.2,
            keys: [
                [0, guard("wand")],
                // A last twirl, then tucked back in the belt
                [0.35, { right: { at: [0.1, 0.1, 0.6], point: [0.2, 0.7, 0.7] } }],
                [0.6, { right: { at: [0, -0.4, 0.4], point: [0, -0.8, 0.6] } }],
                [1, { right: { at: [-0.05, -0.8, 0.1], sheath: 1 } }],
                [1.4, { right: { at: [-0.1, -0.85, 0.08], pronate: 40, shape: "relaxed" }, left: FREE }],
                [2, EASY],
            ],
        },
    },
    grimoire: {
        draw: {
            hitAt: 0.3,
            duration: 1.45,
            keys: [
                [0, EASY],
                // Unhooked from the left hip, brought up before the chest and opened...
                [0.6, { left: { at: [0.05, -0.72, 0.12], sheath: 0.7 } }],
                [1, { left: { at: [0.05, -0.8, 0.05], sheath: 1 } }],
                [1.25, { left: { at: [-0.2, -0.3, 0.55], point: [1, 0, 0], edge: [0, 0.6, 0.8] } }],
                // ...and the other hand passed over its pages, palm down, as if reading a spell
                [1.5, { left: { at: [-0.2, -0.3, 0.55], point: [1, 0, 0], edge: [0, 0.6, 0.8] }, right: { at: [0.18, -0.25, 0.58], palm: [0, -1, 0], towards: [-0.3, 0, 1], shape: "open" } }],
                [1.75, { right: { at: [-0.05, -0.25, 0.58], palm: [0, -1, 0.2], towards: [-0.6, 0, 0.8], shape: "open" } }],
                [2, guard("grimoire")],
            ],
        },
        sheathe: {
            hitAt: 0.9,
            duration: 1.3,
            keys: [
                [0, guard("grimoire")],
                // Closed with the other hand, and hung back at the hip
                [0.4, { left: { at: [-0.2, -0.3, 0.55], point: [1, 0, 0], edge: [0, 0.6, 0.8] }, right: { at: [-0.05, -0.2, 0.55], palm: [-0.3, -1, 0], towards: [-0.5, 0, 1], shape: "open" } }],
                [0.7, { left: { at: [0.05, -0.6, 0.2], sheath: 0.5 }, right: { at: [0.2, -0.6, 0.4], pronate: 40, shape: "relaxed" } }],
                [1, { left: { at: [0.05, -0.8, 0.05], sheath: 1 } }],
                [1.4, { left: { at: [0.12, -0.85, 0.08], pronate: 40, shape: "relaxed" } }],
                [2, EASY],
            ],
        },
    },
    staff: {
        draw: {
            hitAt: 0.38,
            duration: 1.7,
            settle: 0.3,
            keys: [
                [0, EASY],
                // Up over the right shoulder to the staff by the ear (the other hand pushing its
                // lower end up from behind the hip), pulled up overhead, its crystal swinging up
                // from behind, over and forward, raised up high...
                [0.3, { right: { at: [-0.25, -0.2, 0.3], pronate: 40, shape: "relaxed", elbow: [-0.85, 0.1, 0.45] } }],
                [0.6, { right: { at: [-0.1, 0.3, 0.12], sheath: 0.6, elbow: OVER_RIGHT }, left: PUSH_UP }],
                [1, { right: { at: [-0.05, 0.4, -0.1], sheath: 1, elbow: OVER_RIGHT }, left: PUSH_UP, Head: { bend: -6 } }],
                [1.2, { right: { at: [0.1, 0.6, 0.15], point: [0.1, 0.3, -0.95] }, left: FREE, ...spine({ flex: -6 }), Head: { bend: 0 } }],
                [1.4, { right: { at: [0.1, 0.45, 0.5], point: [0.72, -0.08, 0.69] }, ...spine({ flex: 2 }) }],
                [1.55, { right: { at: [0.15, 0.15, 0.6], point: [0.2, 0.95, 0.2] }, ...spine({}) }],
                // ...and brought down on guard, the other hand taking it
                [2, guard("staff")],
            ],
        },
        sheathe: {
            hitAt: 1,
            duration: 1.5,
            settle: 0.3,
            keys: [
                [0, guard("staff")],
                // Raised up high in one hand, then swung up and back over the right shoulder
                [0.3, { right: { at: [0.15, 0.15, 0.6], point: [0.2, 0.95, 0.2] }, left: FREE }],
                [0.55, { right: { at: [0.1, 0.6, 0.15], point: [0.1, 0.3, -0.95] }, ...spine({ flex: -6 }) }],
                [0.8, { right: { at: [-0.08, 0.45, 0], sheath: 0.6, elbow: OVER_RIGHT }, ...spine({}) }],
                [1, { right: { at: [-0.05, 0.4, -0.1], sheath: 1, elbow: OVER_RIGHT } }],
                [1.12, { right: { at: [-0.15, 0.15, 0.15], pronate: 40, shape: "relaxed", elbow: [-0.85, 0.1, 0.45] } }],
                [1.35, { right: { at: [-0.1, -0.85, 0.08], pronate: 40, shape: "relaxed" } }],
                [2, EASY],
            ],
        },
    },
    hammer: {
        draw: {
            hitAt: 0.38,
            duration: 1.75,
            settle: 0.3,
            keys: [
                [0, EASY],
                // Up over the right shoulder to the haft by the ear (the other hand pushing its
                // lower end up from behind the hip), heaved up overhead...
                [0.3, { right: { at: [-0.25, -0.2, 0.3], pronate: 40, shape: "relaxed", elbow: [-0.85, 0.1, 0.45] } }],
                [0.6, { right: { at: [-0.1, 0.3, 0.12], sheath: 0.6, elbow: OVER_RIGHT }, left: PUSH_UP }],
                [1, { right: { at: [-0.05, 0.4, -0.1], sheath: 1, elbow: OVER_RIGHT }, left: PUSH_UP, Head: { bend: -6 } }],
                [1.2, { right: { at: [0.1, 0.6, 0.15], point: [0.1, 0.3, -0.95] }, left: FREE, ...spine({ flex: -6 }), Head: { bend: 0 } }],
                // ...swung over and down, its head slapped into the open left palm...
                [1.45, { right: { at: [0.1, 0.4, 0.55], point: [0.87, 0.13, 0.48] }, left: { at: [-0.1, -0.45, 0.62], palm: [0.3, 1, 0], towards: [0.3, 0, 1], shape: "open" }, ...spine({ flex: 4 }) }],
                [1.65, { right: { at: [0.2, -0.55, 0.55], point: [-0.4, 0.14, 0.91] }, left: { at: [-0.1, -0.5, 0.62], palm: [0.3, 1, 0], towards: [0.3, 0, 1], shape: "open" }, ...spine({ flex: 8 }), offset: [0, -0.03, 0] }],
                // ...and on guard
                [2, guard("hammer")],
            ],
        },
        sheathe: {
            hitAt: 1,
            duration: 1.5,
            settle: 0.3,
            keys: [
                [0, guard("hammer")],
                // Hoisted up overhead and put over the right shoulder, onto the back
                [0.4, { right: { at: [0.1, 0.6, 0.15], point: [0.1, 0.3, -0.95] }, left: FREE, ...spine({ flex: -6 }) }],
                [0.75, { right: { at: [-0.08, 0.45, 0], sheath: 0.6, elbow: OVER_RIGHT }, ...spine({}) }],
                [1, { right: { at: [-0.05, 0.4, -0.1], sheath: 1, elbow: OVER_RIGHT } }],
                [1.12, { right: { at: [-0.15, 0.15, 0.15], pronate: 40, shape: "relaxed", elbow: [-0.85, 0.1, 0.45] } }],
                [1.35, { right: { at: [-0.1, -0.85, 0.08], pronate: 40, shape: "relaxed" } }],
                [2, EASY],
            ],
        },
    },
    cleaver: {
        draw: {
            hitAt: 0.34,
            duration: 1.55,
            settle: 0.24,
            keys: [
                [0, EASY],
                // Across the body to the grip at the left hip, the other hand on the belt beside
                // it...
                [0.55, { right: { at: [0.25, -0.45, 0.6], sheath: 0.35, elbow: CROSS }, left: THROAT, ...spine({ turn: 20 }) }],
                [1, { right: { at: [0.4, -0.65, 0.25], sheath: 1, elbow: CROSS }, left: THROAT, ...spine({ turn: 32, flex: 6 }), Hips: { turn: 6 } }],
                // ...ripped up and out across the body, wheeled round over the head...
                [1.15, { right: { at: [0.05, 0.2, 0.65], point: [0.4, 0.65, 0.65] }, left: THROAT_BACK, ...spine({ turn: -10 }), Hips: { turn: -3 } }],
                [1.4, { right: { at: [-0.15, 0.55, 0.3], point: [0.2, 0.9, -0.4] }, left: FREE, ...spine({ flex: -6 }), Hips: { turn: 0 } }],
                // ...and brandished with a snarl
                [1.75, { right: { at: [0.1, 0.12, 0.6], point: [0.2, 0.8, 0.5] }, left: REACH_OUT, ...spine({ flex: 6 }), Neck: { flex: -8 }, Head: { flex: -8 } }],
                [2, guard("cleaver")],
            ],
        },
        sheathe: {
            hitAt: 0.95,
            duration: 1.35,
            settle: 0.24,
            keys: [
                [0, guard("cleaver")],
                // Brought down across the body, the point down to the ring at the left hip and
                // dropped through it
                [0.4, { right: { at: [0.15, -0.1, 0.6], point: [0.2, 0.3, 0.9] }, left: FREE }],
                [0.75, { right: { at: [0.38, -0.4, 0.72], point: [0.2, -0.8, -0.42], edge: [0, -0.55, 0.8], sheath: 0.35, elbow: CROSS }, left: THROAT, ...spine({ turn: 18 }) }],
                [0.88, { right: { at: [0.45, -0.55, 0.6], sheath: 0.7, elbow: CROSS }, ...spine({ turn: 34, flex: 2 }), Hips: { turn: 4 } }],
                [1, { right: { at: [0.4, -0.65, 0.25], sheath: 1, elbow: CROSS }, left: THROAT, ...spine({ turn: 40, flex: 4 }), Hips: { turn: 5 } }],
                // (The hand let go, falling to the side)
                [1.35, { right: { at: [0.1, -0.8, 0.12], pronate: 40, shape: "relaxed" }, left: FREE, ...spine({}), Hips: { turn: 0 } }],
                [2, EASY],
            ],
        },
    },
    bow: {
        draw: {
            hitAt: 0.38,
            duration: 1.65,
            settle: 0.3,
            keys: [
                [0, EASY],
                // Up over the left shoulder to the bow, lifted up out of its sling along its length
                // (so its lower limb comes up clear of the back), then over the shoulder and swung
                // down in front, spinning...
                [0.3, { left: { at: [0.15, -0.1, 0.35], pronate: 40, shape: "relaxed", elbow: [0.85, 0.1, 0.45] } }],
                [0.6, { left: { at: [0.05, 0.25, 0.05], sheath: 0.6, elbow: OVER_LEFT } }],
                [1, { left: { at: [0, 0.2, -0.1], sheath: 1, elbow: OVER_LEFT } }],
                [1.1, { left: { at: [0.18, 0.5, -0.3], point: [-0.2, -0.95, -0.2], elbow: OVER_LEFT } }],
                [1.22, { left: { at: [0.02, 0.55, 0.3], point: [-0.72, 0.27, 0.64], edge: [0.02, 0.99, -0.11], elbow: [0.88, -0.2, 0.43] } }],
                [1.42, { left: { at: [-0.2, -0.2, 0.7], point: [-0.4, 0.85, 0.35], edge: [-0.13, -0.35, 0.93], elbow: [0.95, -0.23, 0.23] } }],
                // ...held upright, its string plucked to try it, then on guard
                [1.62, { left: { at: [-0.15, -0.4, 0.62], point: [0, 1, 0.1], edge: [-0.21, -0.1, 0.97], elbow: [0.56, -0.61, -0.57] }, right: { at: [-0.05, -0.38, 0.45], palm: [-0.9, 0, 0.3], shape: "hook" } }],
                [1.78, { right: { at: [0.02, -0.4, 0.38], palm: [-0.9, 0, 0.3], shape: "hook" } }],
                [2, guard("bow")],
            ],
        },
        sheathe: {
            hitAt: 0.95,
            duration: 1.4,
            settle: 0.3,
            keys: [
                [0, guard("bow")],
                // Raised and slung back over the left shoulder, brought above its sling and slid
                // down into it along its length
                [0.4, { left: { at: [-0.2, 0.45, 0.45], point: [-0.77, 0.32, 0.59], edge: [0.02, 0.99, -0.11], elbow: [0.88, -0.2, 0.43] }, right: { at: [0.2, -0.7, 0.2], pronate: 40, shape: "relaxed" } }],
                [0.58, { left: { at: [0.35, 0.15, 0.3], point: [0.6, 0.6, -0.5] } }],
                [0.75, { left: { at: [0.15, 0.45, -0.3], point: [-0.2, -0.95, -0.1], elbow: OVER_LEFT } }],
                [1, { left: { at: [-0.15, 0.15, -0.25], sheath: 1, elbow: [0.65, 0.75, 0] } }],
                [1.12, { left: { at: [0.3, 0.2, 0.35], pronate: 40, shape: "relaxed", elbow: [0.7, 0.2, -0.6] } }],
                [1.35, { left: { at: [0.1, -0.85, 0.08], pronate: 40, shape: "relaxed" } }],
                [2, EASY],
            ],
        },
    },
    punch: {
        // (Spiked gauntlets are worn: drawn, the fists close; put away, the hands open)
        draw: {
            hitAt: 0.2,
            duration: 1.5,
            keys: [
                [0, EASY],
                // The fists up, then a burst of shadow boxing: a jab, a cross, a hook and an
                // uppercut, bouncing on the toes, and on guard
                [1, { right: fist(1), left: fist(-1), ...spine({ flex: 6 }), offset: [0, -0.02, 0] }],
                [1.15, { left: { at: [-0.25, 0.12, 1.1], palm: [0, -1, 0], towards: [0, 0, 1] }, ...spine({ flex: 6, turn: -14 }), Hips: { turn: 8 }, offset: [0, 0, 0.03] }],
                [1.3, { left: fist(-1), right: { at: [0.28, 0.1, 1.15], palm: [0, -1, 0], towards: [0, 0, 1] }, ...spine({ flex: 8, turn: 20 }), Hips: { turn: -12 }, offset: [0, -0.02, 0.05] }],
                [1.45, { right: fist(1), left: { at: [-0.45, 0.12, 0.72], palm: [0, -1, 0], towards: [-1, 0, 0.25], elbow: [1, 0.05, -0.1] }, ...spine({ flex: 6, turn: -18 }), Hips: { turn: 10 }, offset: [0, 0, 0.02] }],
                [1.6, { left: fist(-1), right: { at: [0.3, 0.12, 0.72], palm: [0.2, 0, -1], towards: [0, 1, 0.15], elbow: [0, -1, 0.2] }, ...spine({ flex: -2, turn: 16 }), Hips: { turn: -10 }, offset: [0, 0.01, 0.03] }],
                [1.8, { right: fist(1), left: fist(-1), ...spine({ flex: 6 }), Hips: { turn: 0 }, offset: [0, -0.03, 0] }],
                [2, guard("punch")],
            ],
        },
        sheathe: {
            hitAt: 0.5,
            duration: 1.25,
            keys: [
                [0, guard("punch")],
                // The fists lowered and opened, and the hands shaken out
                [1, { right: { at: [-0.1, -0.7, 0.3], palm: [0.3, -1, 0], towards: [0, -0.3, 1], shape: "relaxed" }, left: { at: [0.1, -0.7, 0.3], palm: [-0.3, -1, 0], towards: [0, -0.3, 1], shape: "relaxed" }, ...spine({}) }],
                [1.2, { right: { at: [-0.12, -0.72, 0.3], palm: [0.6, -0.8, 0], towards: [0, -0.8, 0.6], shape: "open" }, left: { at: [0.12, -0.72, 0.3], palm: [-0.6, -0.8, 0], towards: [0, -0.8, 0.6], shape: "open" } }],
                [1.4, { right: { at: [-0.1, -0.7, 0.3], palm: [0.3, -1, 0], towards: [0, -0.3, 1], shape: "open" }, left: { at: [0.1, -0.7, 0.3], palm: [-0.3, -1, 0], towards: [0, -0.3, 1], shape: "open" } }],
                [1.6, { right: { at: [-0.12, -0.75, 0.25], palm: [0.6, -0.8, 0], towards: [0, -0.8, 0.6], shape: "relaxed" }, left: { at: [0.12, -0.75, 0.25], palm: [-0.6, -0.8, 0], towards: [0, -0.8, 0.6], shape: "relaxed" } }],
                [2, EASY],
            ],
        },
    },
    kick: {
        // (Spiked boots are worn: drawn is a fighter's stance; put away, standing easy)
        draw: {
            hitAt: 0.2,
            duration: 1.6,
            keys: [
                [0, { ...EASY, ...LEG_DOWN }],
                // Up on guard, then shadow kicks: a snap kick high into the air, the knee
                // driven up, and back down on guard
                [1, { ...rest(GUARDS.kick), ...LEG_DOWN }],
                [1.1, { free: { right: 1 } }],
                [1.25, lifted({ RightUpLeg: { flex: 95, abduct: 4 }, RightLeg: { flex: 8 }, RightFoot: { flex: -40 }, Hips: { tilt: -10 }, offset: [0, -0.07, 0.03] })],
                [1.4, lifted({ RightUpLeg: { flex: 90, abduct: 4 }, RightLeg: { flex: 115 }, RightFoot: { flex: -20 }, Hips: { tilt: -4 }, offset: [0, -0.03, 0] })],
                [1.55, lifted({ RightUpLeg: { flex: 112, abduct: 8 }, RightLeg: { flex: 125 }, RightFoot: { flex: -20 }, ...spine({ flex: 8 }), Hips: { tilt: 0 }, offset: [0, -0.02, 0.03] })],
                [1.75, { ...LEG_DOWN, free: { right: 0.3 }, RightUpLeg: { flex: 15 }, RightLeg: { flex: 20 }, ...spine({ flex: 2 }), offset: [0, -0.02, 0] }],
                [1.85, { free: { right: 0 } }],
                [2, { ...rest(GUARDS.kick), ...LEG_DOWN }],
            ],
        },
        sheathe: {
            hitAt: 0.4,
            duration: 1.2,
            keys: [
                [0, rest(GUARDS.kick)],
                // Standing down: the fists dropped, the shoulders and neck rolled loose
                [1, { right: { at: [-0.05, -0.75, 0.2], palm: [0.3, -1, 0], towards: [0, -0.3, 1], shape: "relaxed" }, left: { at: [0.05, -0.75, 0.2], palm: [-0.3, -1, 0], towards: [0, -0.3, 1], shape: "relaxed" }, ...spine({}) }],
                [1.3, { RightShoulder: { elevate: 12 }, LeftShoulder: { elevate: 12 }, Neck: { bend: 12 }, Head: { bend: 10 } }],
                [1.6, { RightShoulder: { elevate: 0 }, LeftShoulder: { elevate: 0 }, Neck: { bend: -12 }, Head: { bend: -10 } }],
                [2, { ...EASY, RightShoulder: { elevate: 0 }, LeftShoulder: { elevate: 0 }, Neck: { bend: 0 }, Head: { bend: 0 } }],
            ],
        },
    },
});

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
    // A kick: winded, doubling over it and driven back a step, the arms drawn in
    kick: {
        length: 0.55,
        effect: "impact",
        pose: (t, { side, front }) => {
            const e = pulse(t, 0.18);

            return { ...spine({ flex: front * 20 * e, turn: -side * 8 * e }), Head: { flex: front * 10 * e }, RightArm: { flex: 20 * e }, LeftArm: { flex: 20 * e }, RightForeArm: { flex: 35 * e }, LeftForeArm: { flex: 35 * e }, offset: [0, -0.06 * e, -front * 0.11 * e] };
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

// Knocked down (and up again): how much quicker the fall is than a death's, how long getting up
// takes (s, at most half the time down), and the crouch it rises out of (degrees)
const KNOCKED = {
    quicker: 1.35,
    rise: 0.75,
    crouch: {
        ...spine({ flex: 30 }),
        Neck: { flex: -10 },
        LeftUpLeg: { flex: 112 },
        RightUpLeg: { flex: 104 },
        LeftLeg: { flex: 132 },
        RightLeg: { flex: 124 },
        LeftFoot: { flex: 28 },
        RightFoot: { flex: 24 },
        LeftArm: { flex: 55, abduct: 20 },
        RightArm: { flex: 50, abduct: 22 },
        LeftForeArm: { flex: 25 },
        RightForeArm: { flex: 30 },
    },
};

/** How long into a fall the body hits the ground (s): for the sound of it. */
export const FALL_LANDS = FALL.buckle * 0.6 + FALL.topple;

// --- The engine ---

const HANDS = ["right", "left"];
const VECTORS = ["at", "point", "edge", "palm", "towards", "elbow"];

// How the fingers are held, for a hand's `shape` in a key pose: each finger's flexion at its
// three joints (degrees; the ring and little fingers curl a little more, as they do), and the
// thumb's. A pointing hand's index is straight, the others curled into the palm; a beckoning
// hand's index is straight, the others curled loosely; `index` (degrees) curls it ("come here").
// A hook draws a bowstring on the fingers' ends
const CURLS = {
    open: { fingers: [3, 2, 1], thumb: [{ flex: -5, oppose: 15 }, { flex: 0 }, { flex: 0 }] },
    relaxed: { fingers: [16, 24, 12], thumb: [{ flex: 10, oppose: 10 }, { flex: 10 }, { flex: 8 }] },
    cup: { fingers: [28, 36, 22], thumb: [{ flex: 25, oppose: 20 }, { flex: 15 }, { flex: 10 }] },
    grip: { fingers: [76, 84, 58], thumb: [{ flex: 55, oppose: -10 }, { flex: 35 }, { flex: 25 }] },
    fist: { fingers: [88, 98, 62], thumb: [{ flex: 60, oppose: -5 }, { flex: 45 }, { flex: 35 }] },
    point: { fingers: [88, 98, 62], index: [4, 4, 2], thumb: [{ flex: 58, oppose: -5 }, { flex: 45 }, { flex: 30 }] },
    beckon: { fingers: [42, 58, 34], index: [6, 6, 3], thumb: [{ flex: 15, oppose: 15 }, { flex: 15 }, { flex: 10 }] },
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
function compile(rawKeys, { settle = null, scaled = false } = {}) {
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
                ...("on" in value ? ["on", "onto"] : []),
                ...VECTORS.filter((name) => value[name]).flatMap((name) => [`${name}X`, `${name}Y`, `${name}Z`]),
                // (Whether the hand's reached at all: not before the first key that places it, nor
                // after the last; how much it's turned the way its vectors say, and its elbow
                // pointed: 1 in a key that says, 0 in one that leaves it to come naturally; eased
                // between)
                "reach",
                "held",
                "bent",
                ...("pronate" in value ? ["pronate"] : []),
                ...("chest" in value ? ["chest"] : []),
                ...("sheath" in value ? ["sheath"] : []),
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
                case "chest":
                case "sheath":
                    return value[name];
                case "reach":
                    return 1;
                case "held":
                    return value.point || value.palm || "on" in value || value.sheath ? 1 : 0;
                case "onto":
                    return "on" in value ? 1 : 0;
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
                    // (A hand's reached, and reaching for a sheath, only between keys that say)
                    row[n] = names[n] === "reach" || names[n] === "sheath" ? 0 : (values[before ?? after]?.[n] ?? 0);
                } else {
                    const u = (times[k] - times[before]) / (times[after] - times[before]);

                    row[n] = values[before][n] + (values[after][n] - values[before][n]) * u;
                }
            });
        }

        return { joint, names, values };
    });

    // (It eases out after its last key before the end, or from 1.55 if that's sooner; or from where
    // it says. A clip's pelvis offset is for a body as tall as the one it was baked on)
    return { times, tracks, settle: settle ?? Math.max(1.55, times.at(-2) ?? 0), scaled };
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
    ...Object.entries(ATTACKS).map(([name, attack]) => [name, attack.variants.map(({ keys, settle, scaled }) => compile(keys, { settle, scaled }))]),
    ...Object.entries(RESTS).map(([role, rests]) => [`rest:${role}`, rests.map(({ keys, settle, scaled }) => compile(keys, { settle, scaled }))]),
    ...Object.entries(DRAWS).flatMap(([name, { draw, sheathe }]) => [[`draw:${name}`, [compile(draw.keys)]], [`sheathe:${name}`, [compile(sheathe.keys)]]]),
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
const _scale = new THREE.Vector3();
const _item = new THREE.Quaternion();
const _hand = new THREE.Quaternion();
const _basis = new THREE.Matrix4();
const _wrist = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _chest = new THREE.Quaternion();
const _now = new THREE.Quaternion();
const _edge = new THREE.Vector3();
const _yaw = new THREE.Quaternion();
const _shieldInverse = new THREE.Matrix4();
const _local = new THREE.Vector3();
const _lunge = new THREE.Vector3();
const _nudge = new THREE.Vector3();
const _turnBy = new THREE.Quaternion();
const _slice = new THREE.Vector3();
const _lever = new THREE.Vector3();
const _push = new THREE.Vector3();
const _near = [];
const _boneAt = new THREE.Vector3();
const _turned = new THREE.Vector3();
const _moved = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _handTurn = new THREE.Quaternion();
const _heldOut = { turn: new THREE.Vector3(), move: new THREE.Vector3(), push: new THREE.Vector3() };
const _limbFrom = new THREE.Vector3();
const _limbTo = new THREE.Vector3();
const _limbPush = new THREE.Vector3();
const _skinning = Array.from({ length: 64 }, () => new THREE.Matrix4());

// Which of SECTORS ways round a shield's face (in its own frame: its face out along x) a point is
const SECTORS = 16;
const sectorOf = ({ y, z }) => Math.floor(((Math.atan2(y, z) / (Math.PI * 2) + 1) % 1) * SECTORS) % SECTORS;

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
        // (Each time the arms are posed: what's measured against the skin is placed as they are)
        this.posed = 0;
        /** Whether what's held is kept out of the body (not for those seen too small for it to show). */
        this.keepClear = true;

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

        /** How each hand was turned last frame (world), reaching; null: not reaching. */
        this.turned = { right: null, left: null };

        /** How far past their ranges each arm's joints were last asked to go (degrees, for checking poses). */
        this.strain = { right: 0, left: 0 };

        /** How far each foot is let go of the ground this frame, 0 to 1 (kicking: Walker.freed). */
        this.free = { Left: 0, Right: 0 };

        /**
         * A hand holding the other's two-handed weapon this frame: where on its haft it's to close
         * (`wanted`) and where its grip ended up (`held`), in the world, and how far it's gone
         * there (`weight`, 0 to 1); null, not on it (for checking poses: characters/motioncheck.js).
         */
        this.haft = { right: null, left: null };
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
     * last time). Returns which way. Without its `arms` the hands stay as they were (kicking
     * with a weapon in hand, on guard).
     */
    startAttack(name, { hitAt, duration, variant = null, arms = true }) {
        const attack = ATTACKS[name];

        if (!attack) {
            return null;
        }

        const way = variant ?? this.variety.next(name, attack.variants.length);

        this.#swapped();
        this.variety.last.set(name, way);
        this.attacks++;
        // (A spell cast with the right hand, if the left grips something and the right's free)
        const holds = this.character.holds ?? {};
        const righted = Boolean(attack.cast && holds.Left?.grips && !holds.Right);

        // (One cast with a staff or war hammer in the right hand: held upright out of the way)
        const upright = Boolean(attack.cast && holds.Right && ITEMS[this.character.equipment?.get("mainHand")]?.haft);

        this.attack = { name, variant: way, tracks: COMPILED.get(name)[way], start: this.time, hitAt, duration, mirror: Boolean(attack.alternate && this.attacks % 2 === 0) || righted, arms, upright };

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

        this.#swapped();
        this.variety.last.set(name, way);
        this.attack = { name, variant: way, tracks: COMPILED.get(name)[way], start: this.time, hitAt, duration, mirror: false, rest: true, stopping: null };

        return way;
    }

    /**
     * Draw a weapon (`on`), or put it away: the DRAWS action for its guard (`name`), the weapon
     * moving between its sheath and the hand when the hand takes hold of it (Character.sheathe).
     * With no action for it, it moves at once. Returns how long it takes (s), or 0.
     */
    draw(name, on = true) {
        const how = DRAWS[name]?.[on ? "draw" : "sheathe"];

        this.#swapped();

        if (!how) {
            this.character.sheathe?.(!on);

            return 0;
        }

        const action = `${on ? "draw" : "sheathe"}:${name}`;

        this.attack = { name: action, variant: 0, tracks: COMPILED.get(action)[0], start: this.time, hitAt: how.hitAt, duration: how.duration, mirror: false, swap: on ? "draw" : "sheathe", settle: how.settle };

        return how.duration;
    }

    /** Is a weapon being drawn or put away? */
    get drawing() {
        return Boolean(this.attack?.swap);
    }

    // A draw or sheathing cut short: the weapon ends up where it was going
    #swapped() {
        if (this.attack?.swap && !this.attack.swapped) {
            this.attack.swapped = true;
            this.character.sheathe?.(this.attack.swap === "sheathe", { settle: this.attack.settle ?? SETTLE });
        }
    }

    /** Hold one key pose (as an attack's), until something else is done: for trying poses out. */
    holdPose(pose) {
        this.#swapped();
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
        this.#swapped();
        this.attack = null;
        this.fall = { start: this.time, backwards: Math.cos(from) >= 0 };
        this.guardTarget = 0;
    }

    /**
     * Knocked off its feet (away from `from`, an angle as for react) and up again `seconds`
     * later: falling (quicker than a death), a moment on the ground, then sitting up with its feet
     * drawn in under it, and rising.
     */
    knockdown({ from = 0, seconds = 1.5 } = {}) {
        this.#swapped();
        this.attack = null;
        this.reactions = [];
        this.fall = { start: this.time, backwards: Math.cos(from) >= 0, up: seconds };
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

    /** Is anything quick under way: a blow, a weapon drawn or put away, a flinch, a fall till it lies still? */
    get quick() {
        const falling = this.fall && (this.fall.up || this.time - this.fall.start < FALL.buckle + FALL.topple + FALL.settle);

        return Boolean(this.attack || this.reactions.length || falling);
    }

    /**
     * Layer the actions over the pose the walk has set (rig.rotations and rig.offset). Returns
     * false while falling or lying dead (the feet aren't to be kept planted).
     */
    apply(dt) {
        this.time += dt;
        this.posed++;
        this.character.settle?.(dt);
        this.guard += Math.sign(this.guardTarget - this.guard) * Math.min(Math.abs(this.guardTarget - this.guard), dt * 4);
        this.reaching = [];
        this.free.Left = 0;
        this.free.Right = 0;

        if (this.seated) {
            this.#sit();
        }

        if (this.guard > 0.001 && this.guardName) {
            this.#blend(GUARD_TRACKS.get(this.guardName), 0, smooth(0, 1, this.guard), false);
        }

        // (Drawing a weapon or putting it away, it moves when the hand takes hold of it)
        if (this.attack?.swap && this.time - this.attack.start >= this.attack.hitAt) {
            this.#swapped();
        }

        if (this.attack) {
            const { tracks, start, hitAt, duration, mirror, stopping = null, arms = true, rest = false, upright = false } = this.attack;
            const elapsed = this.time - start;
            const easing = stopping ? 1 - smooth(0, stopping.length, this.time - stopping.start) : 1;

            if (elapsed >= duration || easing <= 0) {
                this.attack = null;
            } else {
                // Key time: 0 to 1 until the blow lands, 1 to 2 after (a held pose: always there)
                const key = this.attack.held ? 1 : elapsed < hitAt ? elapsed / hitAt : 1 + (elapsed - hitAt) / Math.max(1e-3, duration - hitAt);
                const weight = this.attack.held ? 1 : smooth(0, 0.3, key) * (1 - smooth(tracks.settle, 2, key)) * easing;

                this.#blend(tracks, key, weight, mirror, arms, rest, upright);
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

        // (Knocked down and up again: done)
        if (this.fall?.up && this.time - this.fall.start >= this.fall.up) {
            this.fall = null;
        }

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

        // (What hangs at the hips swung clear of the legs as they're posed now, or the seat)
        this.character.hang?.(this.time, this.seated);
        // (What's held is kept out of the body as the arm's reached the last time this frame:
        // the arm drawn, not those blended under it)
        const last = Object.fromEntries(HANDS.map((side) => [side, this.reaching.findLastIndex(({ hands }) => hands[side] && (hands[side].reach ?? 1) > 0.001)]));

        this.haft.right = null;
        this.haft.left = null;

        for (const [layer, { hands, weight }] of this.reaching.entries()) {
            // A hand holding the other's weapon goes second; given its own place, the weapon lies
            // along the line through both hands' places
            const order = HANDS.filter((side) => hands[side] && (hands[side].reach ?? 1) > 0.001).sort((a, b) => Number("on" in hands[a]) - Number("on" in hands[b]));
            // (The forearms and hands kept out of the torso, as the arms are reached the last time
            // this frame: each hand moved out, the arm reached again from how it was. Not a
            // two-handed weapon's: moved whole, its second hand came off the haft and the arms
            // strained for no less in the body, so its keys keep it clear)
            const clear = this.keepClear && !order.some((side) => "on" in hands[side]) ? order.filter((side) => layer === last[side]) : [];
            const before = clear.length ? order.map((side) => this.#armPose(side)) : null;
            // (Each reach again starts from the elbow's swivel this one did, not one a move swung it to)
            const swivel = { ...this.swivel };
            const shift = { right: null, left: null };
            const moved = { right: 0, left: 0 };
            // (How strained each moved hand's arm was before it was moved, and how deep in the
            // body what it holds was; the last move, and whether it's been held back)
            const strained = (side) => this.strain[side] ?? 0;
            const sunk = () => this.#sunk("right") + this.#sunk("left");
            const start = {};
            let deep = null;
            const step = { right: null, left: null };
            const held = { right: false, left: false };

            for (let k = 0; ; k++) {
                const grips = {};

                for (const side of order) {
                    const other = side === "right" ? "left" : "right";
                    const second = hands[other] && "on" in hands[other] && hands[other].at ? this.#place(other, hands[other].at, this.#frame(hands[other], new THREE.Quaternion())) : null;

                    grips[side] = this.#reach(side, hands[side], weight * (hands[side].reach ?? 1), grips[other], second, layer === last[side], shift[side]);
                    reached.add(side);
                }

                // (After the last move, only to take it back)
                if (!clear.length || k > LIMB_TRIES) {
                    break;
                }

                // (The skin measured as the arms are now)
                this.posed++;

                const torso = this.#heldSkin("torso");
                const most = LIMB_MOVE * this.#size();
                const final = k === LIMB_TRIES;
                let again = false;

                deep ??= sunk();

                // (Sunk what either hand holds further into the body: the moves taken back too)
                const sinking = HANDS.some((side) => step[side]) && sunk() > deep + LIMB_SINK;

                for (const side of HANDS) {
                    start[side] ??= strained(side);

                    // (Moved so far it strains the arm, or turns what a hand holds into the body:
                    // half the last move taken back, or after the last, all of it, back to a move
                    // that didn't)
                    if (step[side] && (strained(side) > start[side] + LIMB_STRAIN || sinking)) {
                        step[side].multiplyScalar(final ? 1 : 0.5);
                        shift[side].sub(step[side]);
                        step[side] = final ? null : step[side];
                        held[side] = again = true;
                    }
                }

                if (final && !again) {
                    break;
                }

                for (const side of clear) {
                    const push = this.#limbOut(side === "right" ? "Right" : "Left", torso);

                    if (push && moved[side] < most && !held[side] && !final) {
                        push.clampLength(0, most - moved[side]);
                        moved[side] += push.length();
                        shift[side] = (shift[side] ?? new THREE.Vector3()).add(push);
                        step[side] = push.clone();
                        again = true;
                    }
                }

                if (!again) {
                    break;
                }

                order.forEach((side, i) => this.#armPose(side, before[i]));
                Object.assign(this.swivel, swivel);
            }
        }

        // (An arm let go of starts afresh next time)
        for (const side of HANDS) {
            if (!reached.has(side)) {
                this.swivel[side] = null;
                this.turned[side] = null;
            }
        }
    }

    // Blend the joints towards an action's pose at a key time, by `weight`; hands' places are
    // kept for place()
    #blend({ times, tracks, scaled }, key, weight, mirror, arms = true, rest = false, upright = false) {
        const rig = this.rig;
        // (A clip's pelvis offset, as far for a smaller body as it is for it)
        const reach = scaled ? (this.character.height ?? CLIP_HEIGHT) / CLIP_HEIGHT : 1;
        const hands = {};
        // (A shield on the left forearm: held up in a fight; resting, carried as it is, the left
        // arm left out of the rest)
        const shielded = SHIELD_SOCKETS.has(ITEMS[this.character.equipment?.get("offHand")]?.socket);
        const carried = shielded && rest;
        let shieldHand = null;

        for (const { joint, names, values } of tracks) {
            // (The hands and fingers left as they are)
            if (!arms && (HANDS.includes(joint) || DIGIT.test(joint))) {
                continue;
            }

            const value = (n) => {
                const sampled = sample(times, values, n, key);

                return mirror && MIRRORED.has(names[n]) ? -sampled : sampled;
            };

            if (joint === "offset") {
                const [x, y, z] = [0, 1, 2].map((n) => sample(times, values, n, key));

                rig.offset.x += (mirror ? -x : x) * weight * reach;
                // (Seated, a clip's pelvis goes no lower: the bench holds it)
                rig.offset.y += (scaled && this.seated ? 0 : y) * weight * reach;
                rig.offset.z += z * weight * reach;
                continue;
            }

            // (How far each foot is off the ground, following the pose: a kick)
            if (joint === "free") {
                names.forEach((side, n) => {
                    const Side = (mirror ? MIRROR[side] : side) === "left" ? "Left" : "Right";

                    this.free[Side] = Math.max(this.free[Side], Math.min(1, Math.max(0, value(n))) * weight);
                });
                continue;
            }

            const name = mirror ? mirrored(joint) : joint;

            if (HANDS.includes(joint)) {
                const hand = {};

                names.forEach((channel, n) => {
                    if (channel === "reach") {
                        hand.reach = Math.min(1, Math.max(0, value(n)));
                    } else if (channel === "on" || channel === "pronate" || channel === "held" || channel === "bent" || channel === "chest" || channel === "sheath" || channel === "onto") {
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
                // (A hand on the other's weapon in some keys, not in others: on it only nearer
                // those that say, `onto`)
                if (hand.onto !== undefined && hand.onto < 0.5) {
                    delete hand.on;
                }

                if (shielded && name === "left") {
                    shieldHand = carried ? null : hand;
                    continue;
                }

                hands[name] = hand;
                continue;
            }

            // (The shield arm, carrying it, left as it is)
            if (carried && LEFT_ARM.test(name)) {
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

        // (The shield held up before the chest, further out as the free hand would reach, and
        // aside to the left as the sword arm comes across the body, out of its way)
        if (shieldHand) {
            const out = smooth(DRAW_IN.at[2], REACH_OUT.at[2], shieldHand.at?.[2] ?? FREE.at[2]);
            const aside = smooth(SHIELD.across[0], SHIELD.across[1], hands.right?.at?.[0] ?? 0);
            const { elbow, pronate, wrist } = SHIELD;

            hands.left = { at: SHIELD.in.map((near, k) => near + (SHIELD.out[k] - near) * out + (SHIELD.aside[k] - near) * aside * (1 - out)), elbow, pronate, wrist, reach: shieldHand.reach, shield: true };
        }

        if (upright && !hands.right) {
            hands.right = UPRIGHT;
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
                skin: null,
                limbs: null,
            };
        }

        return this.body;
    }

    // An arm's joints as they are (its shoulder, elbow and wrist: [quaternions]), or set back to
    // how they were (`pose`)
    #armPose(side, pose = null) {
        const Side = side === "right" ? "Right" : "Left";
        const names = [`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`];

        if (!pose) {
            return names.map((name) => this.rig.bone(name).quaternion.clone());
        }

        names.forEach((name, i) => this.rig.bone(name).quaternion.copy(pose[i]));
        this.rig.bone(`${Side}Arm`).updateMatrixWorld(true);

        return pose;
    }

    // How far each forearm's and hand's skin is from the line through its bone (metres, as the
    // body's made: the median of its vertices', left and right alike), found once for each body
    #limbs() {
        const body = this.#measure();

        if (!body.limbs) {
            const { human, positions } = this.character;
            const rig = this.rig;
            const point = new THREE.Vector3();
            const closest = new THREE.Vector3();

            body.limbs = Object.fromEntries(
                LIMBS.map(([start, end]) => {
                    const bone = rig.index.get(`Left${start}`);
                    const line = new THREE.Line3(rig.heads[bone], rig.heads[rig.index.get(`Left${end}`)]);
                    const apart = [];

                    for (let v = 0; v < human.vertexCount; v++) {
                        if (human.partOf[v] === 0 && human.skinIndices[v * 4] === bone) {
                            line.closestPointToPoint(point.fromArray(positions, v * 3), true, closest);
                            apart.push(point.distanceTo(closest));
                        }
                    }

                    apart.sort((a, b) => a - b);

                    return [start, apart[Math.floor(apart.length / 2)] ?? 0];
                }),
            );
        }

        return body.limbs;
    }

    // How deep in the body what a hand ("right" or "left") holds is (metres; 0, clear or empty)
    #sunk(side) {
        const handBone = this.rig.bone(side === "right" ? "RightHand" : "LeftHand");
        const item = this.character.items.find((model) => model.parent === handBone);
        const out = item ? this.#heldOut(item, handBone.getWorldPosition(_wrist), this.#heldSkin(side)) : null;

        return out ? out.push.length() : 0;
    }

    // How far a forearm or hand has come into the torso (`Side`'s; `skin`: the torso's), and the
    // push (world) that'd take its deepest point out again, its skin resting on the torso's
    // (LIMB_CLEAR off it); or null, if it's clear
    #limbOut(Side, skin) {
        const rig = this.rig;
        const size = this.#size();
        const limbs = this.#limbs();
        let deepest = 0;

        for (const [start, end, along] of LIMBS) {
            const from = rig.bone(`${Side}${start}`).getWorldPosition(_limbFrom);
            const to = rig.bone(`${Side}${end}`).getWorldPosition(_limbTo);
            const thick = (limbs[start] + LIMB_CLEAR) * size;

            for (const share of along) {
                const at = _slice.copy(from).lerp(to, share);

                this.#nearby(skin, at, thick + HELD_NEAR, _near);

                let nearest = -1;
                let best = (thick + HELD_NEAR) ** 2;

                for (const k of _near) {
                    const apart = skin.exact[k].distanceToSquared(at);

                    if (apart < best) {
                        best = apart;
                        nearest = k;
                    }
                }

                if (nearest < 0) {
                    continue;
                }

                // (How far its skin is past the torso's: its line's depth behind the nearest skin,
                // and its own thickness; only behind that skin, not off to one side of it)
                const behind = _lever.copy(skin.exact[nearest]).sub(at).dot(skin.facing[nearest]);
                const into = behind + thick;

                if (into > deepest && (behind <= 0 || best - behind * behind < HELD_SPREAD ** 2)) {
                    deepest = into;
                    _limbPush.copy(skin.facing[nearest]).multiplyScalar(into);
                }
            }
        }

        return deepest > 0.002 ? _limbPush : null;
    }

    // The shield strapped to the left forearm, if there's one; and, found once, its shape (in its
    // own frame: its face out along x): how far out its rim is each way round (`rim`: SECTORS of
    // it), how far back its back is, in the middle and at the rim (it's dished), and its face in
    // the middle (`front`: its boss's, if it has one)
    #shield() {
        const model = this.character.items.find((item) => item.userData.home?.bone === "LeftForeArm");

        if (model && !model.userData.shape) {
            const rim = new Array(SECTORS).fill(null);
            const point = new THREE.Vector3();
            let [middle, front] = [0, 0];

            model.updateMatrixWorld(true);

            const inverse = model.matrixWorld.clone().invert();

            model.traverse((mesh) => {
                const position = mesh.isMesh ? mesh.geometry.attributes.position : null;

                for (let i = 0; position && i < position.count; i++) {
                    point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);

                    const k = sectorOf(point);
                    const out = Math.hypot(point.y, point.z);

                    if (!rim[k] || out > rim[k].out) {
                        rim[k] = { out, back: point.x };
                    }

                    if (out < 0.08) {
                        [middle, front] = [Math.min(middle, point.x), Math.max(front, point.x)];
                    }
                }
            });

            model.userData.shape = { rim: rim.map((each) => each ?? { out: 0, back: 0 }), middle, front };
        }

        return model ?? null;
    }

    // How far out from its middle a shield reaches (world metres)
    #shieldReach(shield) {
        const { rim, middle, front } = shield.userData.shape;

        return Math.hypot(Math.max(...rim.map(({ out }) => out)), Math.max(Math.abs(middle), Math.abs(front))) * this.#size();
    }

    // How far to move a shield held up (world metres) to keep the body behind it: the skin that's
    // come into it from behind (within its rim, from SHIELD_CLEAR behind its back to halfway
    // through it) put back behind it, the shield moved out along its face (SHIELD_NUDGE at most);
    // or null, if it's clear. (What's before it, the other arm striking, is left before it)
    #clearOf(shield, skin) {
        const { rim, middle, front } = shield.userData.shape;
        const inverse = _shieldInverse.copy(shield.matrixWorld).invert();
        const size = this.#size();
        const clear = SHIELD_CLEAR / size;
        let need = 0;

        for (const at of skin) {
            const q = _local.copy(at).applyMatrix4(inverse);
            const { out, back } = rim[sectorOf(q)];
            const from = Math.hypot(q.y, q.z);

            if (from < out) {
                // (Its back, dished between its middle and its rim)
                const behind = middle + (back - middle) * (from / out) ** 2;
                const into = q.x - (behind - clear);

                if (into > 0 && q.x < (behind + front) / 2) {
                    need = Math.max(need, into);
                }
            }
        }

        return need * size > 0.002 ? _nudge.setFromMatrixColumn(shield.matrixWorld, 0).normalize().multiplyScalar(Math.min(SHIELD_NUDGE, need * size)) : null;
    }

    // Whether the other hand holds on to what this one does (a staff's or a hammer's haft)
    #bothHands(side) {
        const other = side === "right" ? "left" : "right";

        return this.reaching.some(({ hands }) => hands[other] && "on" in hands[other]);
    }

    // Some of the body's skin but what holds something (`holding`: a hand and its forearm,
    // "right" or "left", and the other hand and forearm too on a two-handed haft, "right+" or
    // "left+"; or the shield arm, "shield"), or only the torso's ("torso", which the forearms and
    // hands are kept out of): every so many of its vertices, by their heaviest bones (with how
    // far from each bone its vertices go), placed as they're needed
    #heldSkin(holding) {
        const body = this.#measure();
        const { human, positions } = this.character;
        const rig = this.rig;

        body.held ??= {};

        if (!body.held[holding]) {
            const [Side, Other] = holding.startsWith("right") ? ["Right", "Left"] : ["Left", "Right"];
            const arms = new RegExp(holding === "shield" ? "^Left(Shoulder|Arm|ForeArm|Hand)" : `^${Side}(ForeArm|Hand)${holding.endsWith("+") ? `|^${Other}(ForeArm|Hand)` : ""}`);
            const kept = holding === "torso" ? (name) => TORSO.test(name) : (name) => !arms.test(name);
            const vertices = [];

            for (let v = 0; v < human.vertexCount; v++) {
                if (human.partOf[v] === 0 && kept(human.bones[human.skinIndices[v * 4]].name)) {
                    vertices.push(v);
                }
            }

            const every = Math.max(1, Math.floor(vertices.length / HELD_POINTS));
            const sampled = vertices.filter((_, k) => k % every === 0);
            const heaviest = sampled.map((v) => {
                const weights = [0, 1, 2, 3].map((j) => human.skinWeights[v * 4 + j]);

                return human.skinIndices[v * 4 + weights.indexOf(Math.max(...weights))];
            });
            const bones = new Map();

            sampled.forEach((v, k) => {
                const bone = heaviest[k];
                const apart = _local.fromArray(positions, v * 3).distanceTo(rig.heads[bone]);

                if (!bones.has(bone)) {
                    bones.set(bone, { bone, reach: 0, kept: [] });
                }

                bones.get(bone).kept.push(k);
                bones.get(bone).reach = Math.max(bones.get(bone).reach, apart);
            });

            body.held[holding] = { vertices: sampled, heaviest, bones: [...bones.values()], rough: sampled.map(() => new THREE.Vector3()), placed: new Float64Array(sampled.length).fill(-1), exact: sampled.map(() => new THREE.Vector3()), facing: sampled.map(() => new THREE.Vector3()), done: new Float64Array(sampled.length).fill(-1) };
        }

        // (The bones as they're drawn, once a frame)
        if (body.skinned !== this.posed) {
            rig.root.updateMatrixWorld(true);
            rig.bones.forEach((bone, i) => _skinning[i].multiplyMatrices(bone.matrixWorld, rig.skeleton.boneInverses[i]));
            body.skinned = this.posed;
        }

        return body.held[holding];
    }

    // Which of the skin's vertices (their numbers in `skin`) are within `reach` of `at` (in the
    // world), roughly (of the bones near enough), put where they are exactly (into `into`)
    #nearby(skin, at, reach, into) {
        const { positions } = this.character;

        into.length = 0;

        for (const { bone, reach: out, kept } of skin.bones) {
            if (_boneAt.setFromMatrixPosition(this.rig.bones[bone].matrixWorld).distanceTo(at) > reach + HELD_ROUGH + out) {
                continue;
            }

            const within = (reach + HELD_ROUGH) ** 2;

            for (const k of kept) {
                if (skin.placed[k] !== this.posed) {
                    skin.rough[k].fromArray(positions, skin.vertices[k] * 3).applyMatrix4(_skinning[bone]);
                    skin.placed[k] = this.posed;
                }

                if (skin.rough[k].distanceToSquared(at) < within) {
                    into.push(k);
                    this.#exactly(skin, k);
                }
            }
        }

        return into;
    }

    // Where one of the skin's vertices (`k` of `skin`'s) is now and which way it faces there, moved
    // by all its bones (once a frame)
    #exactly(skin, k) {
        if (skin.done[k] !== this.posed) {
            const { human, positions, normals } = this.character;
            const v = skin.vertices[k];
            const [at, facing] = [skin.exact[k].set(0, 0, 0), skin.facing[k].set(0, 0, 0)];

            for (let j = 0; j < 4; j++) {
                const weight = human.skinWeights[v * 4 + j] / 255;

                if (weight) {
                    const matrix = _skinning[human.skinIndices[v * 4 + j]];

                    at.addScaledVector(_local.fromArray(positions, v * 3).applyMatrix4(matrix), weight);
                    facing.addScaledVector(_local.fromArray(normals, v * 3).transformDirection(matrix), weight);
                }
            }

            facing.normalize();
            skin.done[k] = this.posed;
        }

        return skin.exact[k];
    }

    // What's held's shape (found once): points over it no nearer each other than HELD_GRID (its
    // corners, and along its longer edges: a long haft's corners are only at its ends), in its
    // own frame, in clusters HELD_CLUSTER long along it (each with its middle and how far out its
    // points go from it); and how far from its grip it reaches
    #heldShape(model) {
        if (!model.userData.held) {
            const kept = new Map();
            const inverse = new THREE.Matrix4().copy(model.matrixWorld).invert();
            const relative = new THREE.Matrix4();

            model.traverse((mesh) => {
                const geometry = mesh.isMesh && mesh.visible ? mesh.geometry : null;
                const position = geometry?.attributes.position;
                const count = geometry ? geometry.index?.count ?? position.count : 0;
                const corner = (i) => new THREE.Vector3().fromBufferAttribute(position, geometry.index ? geometry.index.getX(i) : i).applyMatrix4(relative);

                relative.multiplyMatrices(inverse, mesh.matrixWorld);

                for (let t = 0; t + 2 < count; t += 3) {
                    for (let k = 0; k < 3; k++) {
                        const [a, b] = [corner(t + k), corner(t + ((k + 1) % 3))];
                        const steps = Math.max(1, Math.ceil(a.distanceTo(b) / HELD_GRID));

                        for (let n = 0; n < steps; n++) {
                            const point = a.clone().lerp(b, n / steps);

                            kept.set(point.toArray().map((c) => Math.round(c / HELD_GRID)).join(" "), point);
                        }
                    }
                }
            });

            const clusters = new Map();

            for (const point of kept.values()) {
                const k = Math.floor(point.y / HELD_CLUSTER);

                clusters.set(k, [...(clusters.get(k) ?? []), point]);
            }

            model.userData.held = {
                clusters: [...clusters.values()].map((points) => {
                    const at = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);

                    return { at, radius: points.reduce((most, point) => Math.max(most, point.distanceTo(at)), 0), points };
                }),
                reach: [...kept.values()].reduce((most, point) => Math.max(most, point.length()), 0),
            };
        }

        return model.userData.held;
    }

    // How far what's held has come into the body: each point of it against the nearest skin to it
    // (as deep as it is behind that skin, facing out), and what'd take it out again: the turn about
    // the grip (world axis × radians) of the point deepest in away from the grip, the move of the
    // hand of the one deepest in near it, and that point's push; or null (it's clear)
    #heldOut(model, grip, skin) {
        const { clusters } = this.#heldShape(model);
        let [turnDeep, moveDeep] = [0, 0];
        const out = _heldOut;

        out.turn.set(0, 0, 0);
        out.move.set(0, 0, 0);

        for (const cluster of clusters) {
            // (The skin near it at all, roughly; that, exactly)
            const middle = _slice.copy(cluster.at).applyMatrix4(model.matrixWorld);

            this.#nearby(skin, middle, cluster.radius + HELD_NEAR, _near);

            for (let p = 0; _near.length && p < cluster.points.length; p++) {
                const at = _slice.copy(cluster.points[p]).applyMatrix4(model.matrixWorld);
                let nearest = -1;
                let best = HELD_NEAR * HELD_NEAR;

                for (const k of _near) {
                    const apart = skin.exact[k].distanceToSquared(at);

                    if (apart < best) {
                        best = apart;
                        nearest = k;
                    }
                }

                if (nearest < 0) {
                    continue;
                }

                const into = HELD_CLEAR - _lever.copy(at).sub(skin.exact[nearest]).dot(skin.facing[nearest]);

                if (into <= 0.002 || best - (into - HELD_CLEAR) ** 2 > HELD_SPREAD ** 2) {
                    continue;
                }

                _push.copy(skin.facing[nearest]).multiplyScalar(into);
                _lever.copy(at).sub(grip);

                if (_lever.length() > HELD_LEVER) {
                    if (into > turnDeep) {
                        turnDeep = into;
                        // (lever × push / |lever|²: the point moved by the push, across the lever)
                        out.turn.crossVectors(_lever, _push).divideScalar(_lever.lengthSq());
                        out.push.copy(_push);
                    }
                } else if (into > moveDeep) {
                    moveDeep = into;
                    out.move.copy(_push);
                }
            }
        }

        return turnDeep > 0 || moveDeep > 0 ? out : null;
    }

    // Where a hand's place (`at`: arm lengths from its shoulder, in the character's frame) is in the world
    #place(side, at, frame = this.character.object.getWorldQuaternion(new THREE.Quaternion())) {
        const body = this.#measure();
        const shoulder = this.rig.bone("Spine2").localToWorld(_shoulder.copy(body.shoulders[side]));

        return new THREE.Vector3().fromArray(at).multiplyScalar(body.arm * this.#size()).applyQuaternion(frame).add(shoulder);
    }

    // How much bigger than its own measures the character's drawn (a troll's bigger than life, a
    // goblin smaller): its measures (in metres, as its body's made) are this many metres in the world
    #size() {
        return this.character.object.getWorldScale(_scale).x;
    }

    // The frame a hand's place and turn are given in (world): the character's, or turned as far
    // as its chest has turned from it (`chest`: 0 to 1; fists kept up before the chest, spinning)
    #frame(hand, target) {
        this.character.object.getWorldQuaternion(target);

        const share = hand?.chest ?? 0;

        if (share > 0.001) {
            const forward = _forward.set(0, 0, 1).applyQuaternion(this.rig.bone("Spine2").getWorldQuaternion(_chest)).applyQuaternion(_chest.copy(target).invert());

            target.multiply(_yaw.setFromAxisAngle(_up, Math.atan2(forward.x, forward.z) * share));
        }

        return target;
    }

    // Reach one hand to its place as a real arm would (Rig.reachArm: every joint within its
    // range), blending from where the walk and joint angles put it by `weight`. The hand turns so
    // what it holds points the way the pose says (`point`, `edge`), or, empty, so its palm faces
    // `palm` with the fingers `towards` (else relaxed); the arm's `last` reach this frame keeps
    // what it holds out of the body. Returns its grip: { position, point, edge, haft } in the world
    #reach(side, hand, weight, other, second = null, last = true, shift = null) {
        const rig = this.rig;
        const Side = side === "right" ? "Right" : "Left";
        const body = this.#measure();
        const handBone = rig.bone(`${Side}Hand`);
        const handFrame = rig.frames[rig.index.get(`${Side}Hand`)];
        // (What it holds, or will once it's drawn: as it's held, `home`)
        const item = this.character.items.find((model) => model.parent === handBone || (model.userData.hand === Side && model.userData.sheath));
        const socket = body.sockets[side];
        const holding = item?.userData.home ?? item;
        const itemPosition = holding ? holding.position : socket.position;
        const itemQuaternion = holding ? holding.quaternion : socket.quaternion;
        let position;
        let point = null;
        let edge = null;

        this.#frame(hand, _frame);

        if ("on" in hand) {
            if (!other) {
                return null;
            }

            // Further down the other hand's weapon, along it (turned as comes naturally): where
            // it passes nearest this hand's place, or `on` metres down; below the other fist, and
            // where the haft's held (ITEMS: `haft`)
            const size = this.#size();
            const wanted = hand.at ? this.#place(side, hand.at, _frame).sub(other.position).dot(other.point) / size : -hand.on;
            const along = Math.min(other.haft?.[1] ?? -FIST, Math.max(other.haft?.[0] ?? -Infinity, wanted));

            position = other.position.clone().addScaledVector(other.point, along * size);
            point = other.point.clone();

            if (last) {
                this.haft[side] = { wanted: position.clone(), held: null, weight };
            }
        } else {
            position = this.#place(side, hand.at, _frame);

            // (Moved out of the torso: place())
            if (shift) {
                position.add(shift);
            }

            // (A shield held up, crouching or lunging: kept up and out over the thighs as they come up)
            if (hand.shield) {
                const { y, z } = this.rig.offset;
                const size = this.#size();

                position.add(_lunge.set(0, Math.max(0, -y) * SHIELD_CROUCH, Math.max(0, z)).applyQuaternion(_frame).multiplyScalar(size));
            }

            if (second) {
                // Held in both hands: along the line from the other hand's place through this one's
                point = position.clone().sub(second).normalize();
                edge = hand.edge ? new THREE.Vector3().fromArray(hand.edge).applyQuaternion(_frame) : null;
            } else if (hand.point) {
                point = new THREE.Vector3().fromArray(hand.point).normalize().applyQuaternion(_frame);
                edge = hand.edge ? new THREE.Vector3().fromArray(hand.edge).applyQuaternion(_frame) : null;
            }

            // To where what it draws is put away (drawing or sheathing it), holding it pointing
            // the way it lies there, turned about that as strains least (it settles the rest of
            // the way into the hand or sheath, Character.sheathe), and easing from there to how
            // the keys either side turn it
            const away = hand.sheath > 0.001 ? this.character.sheathPose?.(Side) : null;

            if (away) {
                const share = Math.min(1, hand.sheath);

                position.lerp(away.position, share);
                point = point ? point.lerp(away.point, share).normalize() : away.point.clone();

                // (Turned about it as strains least there: the arm reached once just aiming it)
                const arm = [`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`].map((name) => rig.bone(name).quaternion.clone());
                const along = new THREE.Vector3(0, 1, 0).applyQuaternion(_item.copy(handFrame).invert().multiply(itemQuaternion));
                const bend = hand.elbow ? new THREE.Vector3().fromArray(hand.elbow).normalize().applyQuaternion(_frame) : null;

                rig.reachArm(Side, { grip: position, offset: itemPosition.clone().applyQuaternion(_item.copy(handFrame).invert()), aim: { axis: along, toward: point }, hold: 1, pronate: hand.pronate ?? 25, bend, bent: 1, swivel: this.swivel[side] });

                const natural = _edge.set(0, 0, 1).applyQuaternion(handBone.getWorldQuaternion(_now).multiply(itemQuaternion));

                [`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`].forEach((name, i) => rig.bone(name).quaternion.copy(arm[i]));
                rig.bone(`${Side}Arm`).updateMatrixWorld(true);
                edge = (edge ?? natural.clone()).lerp(natural, share);
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
        const reach = (swivel) => rig.reachArm(Side, { grip: position, offset, hand: wanted, aim, hold: held, pronate: hand.pronate ?? 25, wrist: hand.wrist ?? null, bend, bent: hand.bent ?? 1, swivel });
        let solved = reach(this.swivel[side]);

        // (A shield held up: out of the way of the body, if it's come against it, and the arm
        // reached again, SHIELD_NUDGE at most)
        const shield = side === "left" && hand.shield && this.keepClear && last ? this.#shield() : null;
        let nudged = 0;

        for (let k = 0; shield && k < 2 && nudged < SHIELD_NUDGE; k++) {
            rig.bone("LeftArm").updateMatrixWorld(true);

            // (The skin near enough to come against it: all but the shield arm's)
            const skin = this.#heldSkin("shield");
            const near = this.#nearby(skin, shield.getWorldPosition(_wrist), this.#shieldReach(shield), _near);
            const nudge = near.length ? this.#clearOf(shield, near.map((k) => skin.exact[k])) : null;

            if (!nudge) {
                break;
            }

            nudge.clampLength(0, SHIELD_NUDGE - nudged);
            nudged += nudge.length();
            position.add(nudge);
            solved = reach(solved.swivel);
        }

        // (How the hand was turned in the end, for easing from next frame)
        this.turned[side] = handBone.getWorldQuaternion(this.turned[side] ?? new THREE.Quaternion());

        // Blend with where the arm was (joint by joint, as they move)
        if (weight < 1) {
            [`${Side}Arm`, `${Side}ForeArm`, `${Side}Hand`].forEach((name, i) => rig.blendBone(name, saved[i], weight));
            rig.bone(`${Side}Arm`).updateMatrixWorld(true);
        }

        // (What's held through an action: out of the body as it's drawn, if it's come into it:
        // turned about the grip, or the hand moved, less as it nears where it's put away, and the
        // arm reached again from there. Held in both hands, it's moved out whole, not turned, the
        // other hand following it along the haft)
        const both = this.#bothHands(side);
        const clearing = this.keepClear && last && !hand.shield && this.attack && item?.parent === handBone ? 1 - smooth(0.7, 1, hand.sheath ?? 0) : 0;

        if (clearing > 0.001) {
            const holding = both ? `${side}+` : side;
            const [turned, moved] = [_turned.set(0, 0, 0), _moved.set(0, 0, 0)];

            for (let k = 0; k < HELD_TRIES; k++) {
                handBone.getWorldPosition(_wrist);

                const out = this.#heldOut(item, _wrist, this.#heldSkin(holding));

                if (!out) {
                    break;
                }

                // (From how the hand is now: where it grips, and how it's turned)
                const grip = item.getWorldPosition(_grip);
                const turn = handBone.getWorldQuaternion(_handTurn).multiply(handFrame);

                // (A turn about the grip, if there's one to make; if it's still in after that
                // (the wrist turned as far as it goes), the hand moved out as far instead; and for
                // one near the grip, the hand moved. Both hands on it: the deepest point out)
                if (both) {
                    out.move.copy(out.push.lengthSq() > out.move.lengthSq() ? out.push : out.move);
                } else if (out.turn.lengthSq() > 0 && k > 0) {
                    out.move.add(out.push);
                } else if (out.turn.lengthSq() > 0) {
                    const angle = Math.min(out.turn.length() * clearing, HELD_TURN - turned.length());

                    if (angle > 1e-4) {
                        _turnBy.setFromAxisAngle(_axis.copy(out.turn).normalize(), angle);
                        turned.addScaledVector(_axis, angle);
                        turn.premultiply(_turnBy);
                    }
                }

                const step = out.move.multiplyScalar(clearing).clampLength(0, Math.max(0, HELD_MOVE - moved.length()));

                moved.add(step);
                grip.add(step);
                solved = rig.reachArm(Side, { grip, offset, hand: turn, hold: held, pronate: hand.pronate ?? 25, wrist: hand.wrist ?? null, bend, bent: hand.bent ?? 1, swivel: solved.swivel });
            }
        }

        this.swivel[side] = solved.swivel;
        this.strain[side] = solved.strain;

        // Where the grip ended up (for a second hand on the same weapon)
        handBone.getWorldQuaternion(_hand);

        const grip = { position: itemPosition.clone().multiplyScalar(this.#size()).applyQuaternion(_hand).add(handBone.getWorldPosition(_wrist)), point: new THREE.Vector3(), edge: new THREE.Vector3(), haft: ITEMS[item?.name]?.haft ?? null };

        _item.copy(itemQuaternion).premultiply(_hand);
        grip.point.set(0, 1, 0).applyQuaternion(_item);

        if (last && this.haft[side]) {
            this.haft[side].held = grip.position.clone();
        }

        grip.edge.set(0, 0, 1).applyQuaternion(_item);

        return grip;
    }

    // Falling down: the knees give, the body topples (backwards, or forwards when hit from
    // behind) and lands, arms flung out, then lies still
    #fall(time) {
        const rig = this.rig;
        const { backwards, up = 0 } = this.fall;

        // (Knocked down, the fall's quicker; and at the end, getting up: `rise` 0 to 1)
        const elapsed = up ? time * KNOCKED.quicker : time;
        const riseFor = up ? Math.min(KNOCKED.rise, up * 0.5) : 1;
        const rise = up ? Math.min(1, Math.max(0, (time - (up - riseFor)) / riseFor)) : 0;
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

        // Getting up: sitting up (the body turning upright about the pelvis, still on the
        // ground), the feet drawn in under it in a crouch, then rising out of the crouch
        const sit = smooth(0, 0.5, rise);
        const stand = smooth(0.35, 1, rise);
        const crouch = sit * (1 - stand);

        for (const [joint, angles] of Object.entries(limp)) {
            const index = rig.index.get(joint);
            const { kind, side } = rig.joints[index];

            blendRotation(kind, side, rig.rotations[index], jointRotation(kind, side, angles, _rotation), Math.max(buckle, tilt) * (1 - sit), rig.rotations[index]);
        }

        for (const [joint, angles] of Object.entries(crouch > 0 ? KNOCKED.crouch : {})) {
            const index = rig.index.get(joint);
            const { kind, side } = rig.joints[index];

            blendRotation(kind, side, rig.rotations[index], jointRotation(kind, side, angles, _rotation), crouch, rig.rotations[index]);
        }

        // The whole body turns about the pelvis to lie flat, the pelvis dropping to the ground
        // and ending up behind (or in front of) where the feet were (and back, getting up)
        const lying = [-hips * 0.22 * buckle * (1 - tilt) + (0.14 - hips) * tilt, direction * hips * 0.82 * tilt];
        const crouched = [-hips * 0.62, -hips * 0.26];

        _fall.setFromAxisAngle(_axis.set(1, 0, 0), direction * angle * (1 - sit));
        rig.rotations[0].premultiply(_fall);
        rig.offset.set(0, (lying[0] + (crouched[0] - lying[0]) * sit) * (1 - stand), (lying[1] + (crouched[1] - lying[1]) * sit) * (1 - stand));
    }
}
