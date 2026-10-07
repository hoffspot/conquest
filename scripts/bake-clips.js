// Bakes animators' clips into key poses for actions.js: Mesh2Motion's human animations
// (github.com/Mesh2Motion/mesh2motion-app, static/animations, CC0; the clips are Quaternius's
// Universal Animation Library, and some motion capture), each retargeted onto our body (bvh.js)
// and turned into the keys every other action is made of, so the arms are reached, kept clear of
// the body and checked as any other action's are:
//
//  - the spine's, neck's, head's and collarbones' joint angles (rig.js), within their ranges;
//  - the pelvis kept over the feet, which stay where the walker plants them (the clips' stand in
//    stances of their own): turned only so far and level, the rest taken up the spine (PELVIS),
//    moved only a little (OFFSET);
//  - a kicking leg's joint angles too, the foot let go of the ground (`free`) while the clip's is
//    off it or moving (locomotion.js);
//  - each hand: where it grips (`at`, arm lengths from its shoulder), how what it holds points
//    (`point`, `edge`) or its palm faces (`palm`, `towards`), and which way its elbow points
//    (`elbow`), from the clip's arm as it moves (not held to the joints' ranges: the arm's
//    reached again, Rig.reachArm, within them); an empty hand's fingers as the nearest `shape`;
//  - timed as actions are: key 1 when the blow lands (the clip's `hit`), 2 at its end;
//  - only as many keys as keep every value within a little of the clip's (KEEP).
//
//     npm run build:clips -- --from=../mesh2motion-app/static/animations
//
// writes client/js/characters/clip-keys.js (and the lab's clips, build-clips.js).

import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import * as THREE from "three";
import { gltfPoses, MESH2MOTION_MATCH, MESH2MOTION_NAMES, retarget } from "../client/js/characters/bvh.js";
import { ITEMS, socketOn } from "../client/js/characters/equipment.js";
import { KNEE, Walker, WALK_STYLES } from "../client/js/characters/locomotion.js";
import { groundPoints, lowestPoint } from "../client/js/characters/grounding.js";
import { jointAngles, limitRotation, Rig } from "../client/js/characters/rig.js";
import { readHumanData } from "./lib/human-data.js";

/** Mesh2Motion's files, by the short names the bakes use. */
const FILES = { base: "human-base-animations.glb", addon: "human-addon-animations.glb", mocap: "human-mocap-animations.glb" };

/**
 * What's baked: { name, from: [[file, clip], ...] (played one after the other: an attack and its
 * recovery), hold: { right, left } (an item's id, "haft": on the other hand's two-handed weapon,
 * or none), hit (seconds into it, or into one of its clips, [which, seconds]: when the blow
 * lands; else as the fastest thing goes fastest), crop ([from, to] seconds: only that part),
 * mirror (left for right), legs ("right" or "left": that leg kicks, as the clip's does, let go
 * of the ground; else the feet stay where they stand), seated (sitting: the pelvis moved only as
 * it moves from where the clip sits at its start), loop (a loop, played round and round: timed
 * evenly, 1 halfway, and kept closer to the clip, LOOP_KEEP) }.
 */
export const BAKES = [
    // Fists: a jab with the lead hand (the clip's left: mirrored, so it's the right's, as every
    // punch is before every other one's mirrored) and a cross with the rear, from a boxer's stance
    { name: "jab", from: [["base", "Punch_Jab"]], hold: {}, hit: 0.27, mirror: true },
    { name: "cross", from: [["base", "Punch_Cross"]], hold: {}, hit: 0.33 },
    // A push kick with the right foot (motion capture): up to the knee, out at the enemy, and down
    { name: "pushKick", from: [["mocap", "Kick_Breach"]], hold: {}, legs: "right", crop: [0, 1.25], hit: 0.8 },
    // A spell from one hand thrust out (the clip's left: mirrored, to the wand's hand)
    { name: "wandShot", from: [["base", "Spell_Simple_Enter"], ["base", "Spell_Simple_Shoot"], ["base", "Spell_Simple_Exit"]], hold: { right: "wand" }, mirror: true, hit: [1, 0.05] },
    // The folk's rests (each `hit` the moment that matters, as the keyed rests' are): talking,
    // both hands going; talking seated, as at a table (the pelvis only as it moves on the seat);
    // scratching the head, puzzled; a hand on the hip, listening; a fist raised in a cheer (motion
    // capture; mirrored, the left raised, clear of a blade at the left hip as the right hangs);
    // and an arm up high, waving someone over (motion capture)
    { name: "talking", from: [["base", "Idle_Talking"]], hold: {}, hit: 1.2 },
    { name: "talkingSeated", from: [["base", "Sitting_Talking"]], hold: {}, hit: 1.2, seated: true },
    { name: "headScratch", from: [["addon", "Confused"]], hold: {}, hit: 1 },
    { name: "listening", from: [["addon", "Idle Listening"]], hold: {}, hit: 0.8 },
    { name: "cheer", from: [["mocap", "Cheer_One_arm"]], hold: {}, hit: 1, mirror: true },
    { name: "hailing", from: [["mocap", "Help_One_Arm"]], hold: {}, hit: 1 },
    // The guards' sway (loops, layered over the keyed guards from their means: actions.js
    // GUARD_SWAYS): a fighter rocking on the balls of the feet, the fists going; a swordsman's
    // weight shifting from foot to foot; a caster breathing, the right hand held out
    { name: "fightIdle", from: [["addon", "Fighting Idle"]], hold: {}, loop: true },
    { name: "swordIdle", from: [["base", "Idle_Sword"]], hold: {}, loop: true },
    { name: "spellIdle", from: [["base", "Spell_Simple_Idle"]], hold: {}, loop: true },
    // Hits and dodges (added from each clip's first pose, the feet planted: actions.js
    // REACTIONS' `clips`, DODGES): struck in the chest, doubling over it; struck in the head; and
    // slipping a blow, ducking to the left (mirrored, to the right) or swaying back and round
    { name: "hitChest", from: [["base", "Hit_Chest"]], hold: {}, hit: 0.2 },
    { name: "hitHead", from: [["base", "Hit_Head"]], hold: {}, hit: 0.2 },
    { name: "dodgeSide", from: [["addon", "Dodge_left"]], hold: {}, hit: 0.3 },
    { name: "dodgeBack", from: [["addon", "Dodge_back"]], hold: {}, hit: 0.5 },
    // Emotes (actions.js EMOTE_WAYS: the player's, and the folk's greetings and cheers): a wave
    // hello, a nod, a shake of the head (both hands up, palms out), and a fist pumped
    { name: "greeting", from: [["addon", "Greeting"]], hold: {}, hit: 1.2 },
    { name: "headNod", from: [["addon", "Head Nod"]], hold: {}, hit: 0.4 },
    { name: "headShake", from: [["addon", "Reject"]], hold: {}, hit: 1 },
    { name: "fistPump", from: [["addon", "Victory Fist Pump"]], hold: {}, hit: 0.9 },
];

// Tried and left out (the motion check, every body: docs/CHARACTERS.md):
//  - the sword's (Sword_Regular_A, _B, _C with their recoveries) and an axe chopping wood
//    (Chop_Tree) for the cleaver: lunges of up to 0.8 m, and the sword arm taken up to 111° behind
//    the body, 27 to 68° past any shoulder's range on every body; Sword_Attack: 9° past, but its
//    sword arm swung straight out to the side before the cut, a flourish, not a fencer's cut;
//  - two hands on a golf club (Golf_Drive) for the staff and the war hammer: the arms 73 to 78°
//    past their range, the hammer into the forearm;
//  - a fighting stance's left jab (Fighting Left Jab): the shoulder 59° past its range; its right
//    jab (Fighting Right Jab): clean, but from the clip's idle with the fists down at the belly;
//  - the bow drawn, held and loosed (Bow Pull Back, Bow Pull Hold, Bow Release): clean on every
//    body, but the string's drawn only to the shoulder, 40 cm from the face, not to an anchor
//    under the jaw as an archer draws it (and as the keyed draws do);
//  - the Spell_Simple clips' two-handed Two-hand Blast, and Attack_Ground_Pound (one hand on its
//    weapon, not two);
//  - for rests: arms folded (Idle_FoldArms: a shoulder past its range on 27 bodies; the keyed
//    one's clean), leaning on a rail (Idle_Rail: hunched over nothing, the bar's lower), shaking
//    off (Idle_ShakeOff: hardly moves), a nod with an arm out (Yes: reads as pointing), drinking
//    (Consume Item: from nothing, and the patrons drink from their tankards already), a salute
//    (Salute: not with a sword in the hand, as the sentries have), sitting still (Sitting_Idle:
//    hardly moves), and those with the legs' part in them (dances, a hunched rest, meditating);
//  - for emotes: a bow (Bow: the hands brought together before the chest, hardly bowing: a bow
//    from the waist is keyed instead), both arms flung up (Victory: one arm up, as the cheer, and
//    the shoulder 74 to 89° past its range on the tallest and bulkiest bodies), and arms flung
//    wide in anger (Angry: the shoulder 13 to 20° past its range);
//  - for the guards' sway: a shield held up (Idle_Shield: hardly moves), a golfer's waggle
//    (Golf_idle) and a pistol held out (Pistol_Idle);
//  - for flinches and parries: knocked off the feet (Hit_Knockback), a crouched block (Defend) and
//    a sword block stepping into it (Sword_Block): their legs are the motion.

/**
 * The falls, played whole (actions.js FALLS): the body, legs and arms as the clip has them, the
 * pelvis turned and moved as far as it goes, each foot planted where it stands while the clip's
 * is and stepping where the clip's steps, and the body kept as high off the ground as the clip's
 * (grounding.js). { name, from (as BAKES'), crop } (crop: [from, to] seconds, only that part).
 */
export const FALLS = [
    // Struck down from in front: staggering back a step, sitting down hard and falling back
    { name: "deathBack", from: [["base", "Death_D"]] },
    // Sinking: a step forward, down onto the knees, and over onto the face
    { name: "deathFront", from: [["addon", "Death_A"]] },
    // Knocked off the feet, thrown back onto the ground (the clip's last frame is its first
    // again, standing: left out)
    { name: "knockedDown", from: [["base", "Hit_Knockback"]], crop: [0, 0.7] },
    // Getting up off the back: the knees drawn up, rolled up to sit, onto a knee and up
    { name: "gettingUp", from: [["base", "LayToIdle"]] },
];

// Each key value's tolerance, by what it is: a key's left out if the curve through the others
// passes this near it (degrees; arm lengths; unit vectors; metres; a foot's freedom; a turn's
// quaternion)
const KEEP = { angle: 3, at: 0.025, vector: 0.08, offset: 0.01, free: 0.2, quaternion: 0.01 };
// (A loop's moves are small, a sway: kept this much closer)
const LOOP_KEEP = 0.25;

// What a foot's moving at (m/s), or how high its lowest point is (m), off the ground
const STEPPING = 0.3;
const LIFTED = 0.025;

// The feet stay where they stand (but a kicking leg's), not where the clip's stand, so the body's
// kept over them: the pelvis turned only so far and kept level (degrees), the rest of its turn,
// tilt and lean taken up the spine as far as each bone goes (the chest as the clip has it); and
// moved only so far (metres: [least, most] to the left, up and forward), as a body over its own
// two feet moves
const PELVIS = { turn: 12, tilt: 0, obliquity: 0 };
const SPINE = {
    turn: { as: "turn", sign: 1, most: { Spine: [-10, 10], Spine1: [-15, 15], Spine2: [-20, 20] } },
    tilt: { as: "flex", sign: 1, most: { Spine: [-10, 35], Spine1: [-8, 25], Spine2: [-7, 20] } },
    obliquity: { as: "bend", sign: -1, most: { Spine: [-12, 12], Spine1: [-12, 12], Spine2: [-11, 11] } },
};
const OFFSET = [[-0.05, 0.05], [-0.06, 0.02], [-0.08, 0.1]];

const SIDES = ["right", "left"];
const BODY = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"];
const LEGS = ["UpLeg", "Leg", "Foot", "ToeBase"].flatMap((part) => [`Left${part}`, `Right${part}`]);
const ARMS = /^(Left|Right)(Arm|ForeArm|Hand)$/;
const FINGERS = ["Index", "Middle", "Ring", "Pinky"];

// The hand shapes (actions.js CURLS) by how curled their fingers are on average (degrees)
const SHAPES = [["open", 2], ["relaxed", 17], ["cup", 29], ["grip", 73], ["fist", 83]];

const round = (value, places) => Number(value.toFixed(places)) + 0;
const vector = (v, places = 2) => v.toArray().map((x) => round(x, places));

// The body the clips are baked on: MakeHuman's, whichever the game plays on (body.js GAME_BODY).
// What's baked is the same on any body (joint angles; hands in arm lengths from the shoulder,
// turned as the body is), and clip-keys.js's keys were baked and motion-checked on it. (Baked on
// Vitruvian before the retarget took the elbow's hinge from the rig, bvh.js, a jab's fists came
// out open: its forearm rests all but straight, and the hinge found from it rolled the arms)
const BAKE_BODY = "human";

/** The reference body (MakeHuman's average adult: BAKE_BODY), rigged, with a walker to find its feet. */
export function referenceBody() {
    const human = readHumanData(BAKE_BODY);
    const { positions, joints } = human.shape({});
    const rig = new Rig(human.bones, human.landmarks?.rest);
    const object = new THREE.Group();
    let height = 0;

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0) {
            height = Math.max(height, positions[v * 3 + 1]);
        }
    }

    object.add(rig.root);
    rig.fit(joints);
    object.updateMatrixWorld(true);

    const character = { human, rig, object, positions, joints, height, holds: {}, items: [] };

    return { character, walker: new Walker(character, WALK_STYLES.natural) };
}

// A Mesh2Motion file: its skeleton (as three.js objects, without the mannequin) and its clips
const io = new NodeIO();
const sources = new Map();

async function source(from, file) {
    if (!sources.has(file)) {
        const document = await io.read(path.join(from, file));
        const skeleton = new THREE.Group();
        const nodes = new Map();
        const copy = (node, parent) => {
            if (node.getMesh()) {
                return;
            }

            const ours = new THREE.Object3D();

            ours.name = node.getName();
            ours.position.fromArray(node.getTranslation());
            ours.quaternion.fromArray(node.getRotation());
            ours.scale.fromArray(node.getScale());
            nodes.set(node, ours);
            parent.add(ours);
            node.listChildren().forEach((child) => copy(child, ours));
        };

        document.getRoot().getDefaultScene().listChildren().forEach((node) => copy(node, skeleton));

        const clips = new Map();

        for (const animation of document.getRoot().listAnimations()) {
            const tracks = animation.listChannels().flatMap((channel) => {
                const node = nodes.get(channel.getTargetNode());
                const property = channel.getTargetPath();
                const sampler = channel.getSampler();
                const times = Array.from(sampler.getInput().getArray());
                const values = Array.from(sampler.getOutput().getArray());

                if (!node || (property !== "rotation" && property !== "translation")) {
                    return [];
                }

                return [property === "rotation" ? new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values) : new THREE.VectorKeyframeTrack(`${node.name}.position`, times, values)];
            });

            clips.set(animation.getName(), new THREE.AnimationClip(animation.getName(), -1, tracks));
        }

        sources.set(file, { skeleton, clips });
    }

    return sources.get(file);
}

// How far apart two poses are (the sum of their joints' turns, radians)
const apart = (a, b) => a.rotations.reduce((sum, rotation, j) => sum + rotation.angleTo(b.rotations[j]), 0);

/**
 * The clips `from` one after another, as poses (bvh.js gltfPoses): each cut where it comes
 * nearest the next one's start (an attack exported as a loop ends where it started, not where
 * its recovery takes over). Also gives the frame each starts at (`starts`).
 */
async function sequence(from, clips) {
    const parts = [];

    for (const [file, name] of clips) {
        const { skeleton, clips: all } = await source(from, FILES[file]);
        const clip = all.get(name);

        if (!clip) {
            throw new Error(`No clip "${name}" in ${FILES[file]}`);
        }

        parts.push(gltfPoses(skeleton.clone(true), clip, { loop: false }));
    }

    const starts = [];
    let count = 0;
    const poses = parts.flatMap(({ poses: each }, k) => {
        const next = parts[k + 1]?.poses[0];

        starts.push(count);

        if (!next) {
            return each;
        }

        let cut = each.length;
        let best = Infinity;

        for (let f = Math.floor(each.length * 0.5); f < each.length; f++) {
            const gap = apart(each[f], next);

            if (gap < best) {
                [best, cut] = [gap, f];
            }
        }

        count += cut;

        return each.slice(0, cut);
    });

    return { ...parts[0], poses, starts };
}

// A rotation mirrored left for right (in the anatomical frame, which mirrors too)
const mirrored = (q) => (q ? new THREE.Quaternion(q.x, -q.y, -q.z, q.w) : null);
const otherSide = (name) => name.replace(/^(Left|Right)/, (side) => (side === "Left" ? "Right" : "Left"));

/**
 * Pose the reference body at a retargeted frame, the lower foot on the ground: as the clip has it
 * (`limit` false), or with every joint but the arms' within its range. Returns where the feet
 * are: { height (of its lowest point), at (the ankle) }, left and right.
 */
function pose({ character, walker }, frame, limit = true) {
    const { rig, object } = character;

    rig.reset();
    frame.rotations.forEach((rotation, b) => {
        if (rotation) {
            const { kind, side } = rig.joints[b];

            rig.rotations[b].copy(rotation);

            if (limit && !ARMS.test(rig.definition[b].name)) {
                limitRotation(kind, side, rig.rotations[b]);
            }
        }
    });
    rig.offset.set(frame.side, frame.height, frame.forward);
    rig.apply();
    object.updateMatrixWorld(true);
    rig.offset.y -= Math.min(walker.footHeight(0), walker.footHeight(1));
    rig.apply();
    object.updateMatrixWorld(true);

    return [0, 1].map((i) => ({ height: walker.footHeight(i), at: rig.bone(i ? "RightFoot" : "LeftFoot").getWorldPosition(new THREE.Vector3()) }));
}

// Where the reference body's ankles are, standing still on its own two feet (the walker's stance)
function standing({ character, walker }) {
    character.rig.reset();
    walker.release();

    for (let k = 0; k < 30; k++) {
        walker.update(1 / 30, { speed: 0 });
    }

    character.object.updateMatrixWorld(true);

    return ["LeftFoot", "RightFoot"].map((name) => ({ at: character.rig.bone(name).getWorldPosition(new THREE.Vector3()) }));
}

/** A hand's part of a key, as the body's posed now: holding `held` (an item's id, "haft", or nothing). */
function handOf(character, side, held) {
    const { rig } = character;
    const Side = side === "right" ? "Right" : "Left";
    const head = (name) => rig.heads[rig.index.get(name)];
    const world = (name) => rig.bone(name).getWorldPosition(new THREE.Vector3());
    const hand = rig.bone(`${Side}Hand`);
    const item = held && held !== "haft" ? ITEMS[held] : null;
    const socket = socketOn(character, item ? item.socket : `${side}Hand`);
    const turn = item?.turn ? new THREE.Quaternion().setFromEuler(new THREE.Euler(...item.turn)) : new THREE.Quaternion();

    // Where it grips, from its shoulder (as actions.js places it: the shoulder carried by the
    // chest), in arm lengths
    const shoulder = rig.bone("Spine2").localToWorld(head(`${Side}Arm`).clone().sub(head("Spine2")));
    const arm = head("RightForeArm").distanceTo(head("RightArm")) + head("RightHand").distanceTo(head("RightForeArm"));
    const grip = hand.localToWorld(socket.position.clone());
    const out = { at: vector(grip.sub(shoulder).divideScalar(arm), 3) };

    // Its elbow, out from the line from the shoulder to the wrist
    const [S, E, W] = [world(`${Side}Arm`), world(`${Side}ForeArm`), world(`${Side}Hand`)];
    const line = W.clone().sub(S).normalize();
    const elbow = E.sub(S);

    elbow.addScaledVector(line, -elbow.dot(line));

    const turned = hand.getWorldQuaternion(new THREE.Quaternion());

    if (held === "haft") {
        return { on: 0, ...out, elbow: vector(elbow.normalize()) };
    }

    if (item) {
        const holding = turned.clone().multiply(socket.quaternion).multiply(turn);

        Object.assign(out, { point: vector(new THREE.Vector3(0, 1, 0).applyQuaternion(holding)), edge: vector(new THREE.Vector3(0, 0, 1).applyQuaternion(holding)) });
    } else {
        // Empty: its palm and fingers (the anatomical frame's x across the palm, y up the fingers)
        const frame = turned.multiply(rig.frames[rig.index.get(`${Side}Hand`)]);
        const x = new THREE.Vector3(1, 0, 0).applyQuaternion(frame);
        const y = new THREE.Vector3(0, 1, 0).applyQuaternion(frame);
        const curl = FINGERS.flatMap((finger) => [1, 2, 3].map((k) => jointAngles(`Hand${finger}`, side === "left" ? 1 : -1, rig.rotations[rig.index.get(`${Side}Hand${finger}${k}`)]).flex));
        const mean = curl.reduce((sum, flex) => sum + flex, 0) / curl.length;

        Object.assign(out, { palm: vector(side === "left" ? x.negate() : x), towards: vector(y.negate()), shape: SHAPES.reduce((best, shape) => (Math.abs(shape[1] - mean) < Math.abs(best[1] - mean) ? shape : best))[0] });
    }

    return { ...out, elbow: vector(elbow.normalize()) };
}

/** A key pose of the body as it's posed now (with the kicking leg's joints, `legs`: "right" or "left"). */
function keyOf({ character }, hold, legs = null) {
    const { rig } = character;
    const pose = {};
    const kicking = legs ? LEGS.filter((name) => name.startsWith(legs === "right" ? "Right" : "Left")) : [];

    for (const name of [...BODY, ...kicking]) {
        const b = rig.index.get(name);
        const { kind, side } = rig.joints[b];
        const angles = jointAngles(kind, side, rig.rotations[b]);

        pose[name] = Object.fromEntries(Object.entries(angles).map(([angle, value]) => [angle, round(value, 1)]));
    }

    for (const [angle, most] of Object.entries(PELVIS)) {
        const { as, sign, most: ranges } = SPINE[angle];
        let over = pose.Hips[angle] - Math.min(most, Math.max(-most, pose.Hips[angle]));

        pose.Hips[angle] = round(pose.Hips[angle] - over, 1);

        for (const [bone, [least, greatest]] of Object.entries(ranges)) {
            const turned = Math.min(greatest, Math.max(least, pose[bone][as] + sign * over));

            over -= sign * (turned - pose[bone][as]);
            pose[bone][as] = round(turned, 1);
        }
    }

    pose.offset = vector(rig.offset, 3);

    for (const side of SIDES) {
        pose[side] = handOf(character, side, hold[side]);
    }

    return pose;
}

// Which feet are off the ground or moving, frame by frame (1 free, 0 planted; walker 0 left, 1 right)
function stepping(frames, frameTime) {
    const free = frames.map(() => [0, 0]);

    for (const i of [0, 1]) {
        frames.forEach(({ feet }, f) => {
            const before = frames[Math.max(0, f - 1)].feet[i].at;
            const after = frames[Math.min(frames.length - 1, f + 1)].feet[i].at;
            const speed = Math.hypot(after.x - before.x, after.z - before.z) / (frameTime * Math.max(1, Math.min(f + 1, frames.length - 1) - Math.max(0, f - 1)));

            free[f][i] = feet[i].height > LIFTED || speed > STEPPING ? 1 : 0;
        });

        // (Not for a frame or two: that's only a wobble)
        for (let f = 1; f < frames.length - 1; f++) {
            if (free[f][i] && !free[f - 1][i] && !free[f + 1][i]) {
                free[f][i] = 0;
            }
        }
    }

    return free;
}

// The frame the fastest of the hands' grips, the tips of what they hold (a forearm's length out)
// and the feet goes fastest
function fastest(frames, frameTime) {
    const ends = frames.map(({ pose, feet }) => [
        ...SIDES.map((side) => {
            const { at, point } = pose[side];

            return new THREE.Vector3(...at).addScaledVector(new THREE.Vector3(...(point ?? [0, 0, 0])), 1.2);
        }),
        ...feet.map(({ at }) => at.clone().multiplyScalar(1 / 0.6)),
    ]);
    let best = { speed: 0, frame: 0 };

    for (let f = 1; f < frames.length - 1; f++) {
        const speed = Math.max(...ends[f].map((end, e) => end.distanceTo(ends[f + 1][e]) + end.distanceTo(ends[f - 1][e]))) / (2 * frameTime);

        if (speed > best.speed) {
            best = { speed, frame: f };
        }
    }

    return best.frame;
}

// A key pose's values, flattened: [[channel, value, kind of value]]
function flatten(pose) {
    const out = [];

    for (const [joint, value] of Object.entries(pose)) {
        if (joint === "offset") {
            value.forEach((x, k) => out.push([`offset.${k}`, x, "offset"]));
        } else if (joint === "turn") {
            value.forEach((x, k) => out.push([`turn.${k}`, x, "quaternion"]));
        } else if (joint === "low") {
            out.push(["low", value, "offset"]);
        } else if (joint === "free") {
            Object.entries(value).forEach(([side, x]) => out.push([`free.${side}`, x, "free"]));
        } else if (SIDES.includes(joint)) {
            for (const [name, v] of Object.entries(value)) {
                if (Array.isArray(v)) {
                    v.forEach((x, k) => out.push([`${joint}.${name}.${k}`, x, name === "at" ? "at" : "vector"]));
                }
            }
        } else {
            Object.entries(value).forEach(([angle, x]) => out.push([`${joint}.${angle}`, x, "angle"]));
        }
    }

    return out;
}

// A value on the smooth curve through keys (as actions.js samples them: Catmull-Rom, flat at the ends)
function curve(times, values, time) {
    const last = times.length - 1;
    let k = 0;

    while (k < last - 1 && times[k + 1] < time) {
        k++;
    }

    const [t0, t1] = [times[k], times[k + 1]];
    const tangent = (i) => (i <= 0 || i >= last ? 0 : (values[i + 1] - values[i - 1]) / (times[i + 1] - times[i - 1]));
    const [m0, m1] = [tangent(k) * (t1 - t0), tangent(k + 1) * (t1 - t0)];
    const u = Math.min(1, Math.max(0, (time - t0) / (t1 - t0)));
    const [u2, u3] = [u * u, u * u * u];

    return (2 * u3 - 3 * u2 + 1) * values[k] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * values[k + 1] + (u3 - u2) * m1;
}

// The frames to keep as keys: the first, the blow and the last, and then whichever's furthest
// from the curve through those kept, until every value's within KEEP of it (and a hand's shape
// changes only at a key)
function reduce(times, poses, must, keep = 1) {
    const flat = poses.map(flatten);
    const channels = flat[0].map(([channel, , kind]) => ({ channel, kind }));
    const values = channels.map((_, c) => flat.map((row) => row[c][1]));
    const kept = new Set(must);

    poses.forEach((pose, f) => {
        if (f > 0 && SIDES.some((side) => pose[side]?.shape !== poses[f - 1][side]?.shape)) {
            kept.add(f);
        }
    });

    for (;;) {
        const keys = [...kept].sort((a, b) => a - b);
        let worst = { over: 1, frame: -1 };

        channels.forEach(({ kind }, c) => {
            const keyTimes = keys.map((f) => times[f]);
            const keyValues = keys.map((f) => values[c][f]);

            times.forEach((time, f) => {
                const over = Math.abs(curve(keyTimes, keyValues, time) - values[c][f]) / (KEEP[kind] * keep);

                if (over > worst.over) {
                    worst = { over, frame: f };
                }
            });
        });

        if (worst.frame < 0) {
            return keys;
        }

        kept.add(worst.frame);
    }
}

/**
 * Bake one clip (a BAKES entry) on the reference body: { source, seconds, hit, channels, keys }
 * (each key its time and its values, in the channels' order).
 */
export async function bake(from, { from: clips, hold, hit = null, crop = null, mirror = false, legs = null, seated = false, loop = false }, body = referenceBody()) {
    const poses = await sequence(from, clips);
    const clip = retarget(poses, body.character.rig, { names: MESH2MOTION_NAMES, match: MESH2MOTION_MATCH, limit: false });
    const { rig } = body.character;
    const frameTime = clip.frameTime;

    // (Only the part of it from crop[0] to crop[1] seconds, if it's cropped)
    const [first, last] = crop ? crop.map((t) => Math.round(t / frameTime)) : [0, clip.frames.length - 1];

    // (Mirrored: each bone takes its other side's turn, mirrored; the pelvis goes the other way)
    const frames = clip.frames.slice(first, last + 1).map((frame) =>
        mirror
            ? { rotations: rig.definition.map(({ name }) => mirrored(frame.rotations[rig.index.get(otherSide(name))])), side: -frame.side, height: frame.height, forward: frame.forward }
            : frame,
    );

    // (Where the feet are, as the clip has its legs; the keys, as ours go)
    const measured = frames.map((frame) => {
        const feet = pose(body, frame, false);
        const height = body.character.rig.offset.y;

        pose(body, frame);

        const key = keyOf(body, hold, legs);

        key.offset[1] = round(height, 3);

        return { pose: key, feet };
    });

    const free = stepping(measured, frameTime);

    // The pelvis where it is over the feet (an animator's figure stands anywhere, ours on its own
    // two feet): as far from where ours stand under it, standing still, as they are at the
    // start, and then as far as those on the ground move; then moved only a little. Seated, only
    // as it moves from where it sits at the start (the bench, not the clip's chair, sets how low)
    const rest = standing(body);
    const under = measured[0].feet.reduce((sum, { at }, i) => sum.add(at).sub(rest[i].at), new THREE.Vector3()).multiplyScalar(0.5);

    measured.forEach(({ pose: key, feet }, f) => {
        const down = f > 0 ? [0, 1].filter((i) => !free[f][i] && !free[f - 1][i]) : [];

        down.forEach((i) => under.addScaledVector(feet[i].at.clone().sub(measured[f - 1].feet[i].at), 1 / down.length));
        key.offset[0] -= under.x;
        key.offset[2] -= under.z;
    });

    const seat = seated ? [...measured[0].pose.offset] : [0, 0, 0];

    for (const { pose: key } of measured) {
        key.offset = key.offset.map((x, k) => round(Math.min(OFFSET[k][1], Math.max(OFFSET[k][0], x - seat[k])), 3));
    }

    // The frame the blow lands: given (seconds into it, or into one of its clips: [which, seconds]),
    // or as the fastest of the hands, what they hold and the feet goes fastest
    // (A loop's halfway, so its key times go evenly)
    const at = loop ? Math.round((measured.length - 1) / 2) : hit === null ? fastest(measured, frameTime) : Math.round((Array.isArray(hit) ? poses.starts[hit[0]] * frameTime + hit[1] : hit) / frameTime) - first;
    const keyed = measured.map(({ pose: each }, f) => (legs ? { ...each, free: { [legs]: free[f][legs === "left" ? 0 : 1] } } : each));
    const times = keyed.map((_, f) => f * frameTime);
    const seconds = times.at(-1);
    const keys = reduce(times, keyed, [0, at, keyed.length - 1], loop ? LOOP_KEEP : 1);
    const channels = flatten(keyed[0]).map(([channel]) => channel);
    const shapes = SIDES.filter((side) => keyed[0][side].shape);
    const places = (channel) => (/\.at\./.test(channel) || channel.startsWith("offset") ? 3 : /\.(point|edge|palm|towards|elbow)\./.test(channel) ? 2 : 1);

    // Key times: 0 to 1 up to the blow, 1 to 2 after it
    const keyTime = (f) => (f === at ? 1 : round(f <= at ? times[f] / times[at] : 1 + (times[f] - times[at]) / (seconds - times[at]), 3));

    return {
        source: clips.map(([, name]) => name).join(" + ") + (crop ? ` (${crop[0]} to ${crop[1]} s)` : "") + (mirror ? ", mirrored" : "") + (seated ? ", seated" : "") + (loop ? ", looped" : ""),
        seconds: round(seconds, 3),
        hit: round(times[at], 3),
        channels: [...channels, ...shapes.map((side) => `${side}.shape`)],
        keys: keys.map((f) => [keyTime(f), ...flatten(keyed[f]).map(([channel, value]) => round(value, places(channel))), ...shapes.map((side) => keyed[f][side].shape)]),
    };
}

// A fall's joints, as the clip has them: the body's, both legs' (but the toes, which the walker
// keeps on the ground) and both arms' (the pelvis's turn kept as a quaternion: it lies down, past
// any angle a standing pelvis turns through)
const FALL_JOINTS = [...BODY.filter((name) => name !== "Hips"), ...LEGS.filter((name) => !name.endsWith("ToeBase")), ...["Arm", "ForeArm", "Hand"].flatMap((part) => [`Left${part}`, `Right${part}`])];
// (A body this low, as a share of how high its pelvis is standing, is down: on its knees or the
// ground, its feet no longer standing on the ground; and its chest this near the lowest it goes
// has landed)
const DOWN = 0.66;
const LANDED = 0.05;
// (How long a foot that's been moved to stand where ours stand takes to go back to where the
// clip's goes, once it's free: s)
const FADE = 0.3;
// (And how far past its range a planted foot may turn its hip before it's let go of: degrees)
const STRAIN = 6;
// (And how far over the ground the reference body's lowest point can be and still be on it, m)
const OVER = 0.04;

// Which of a clip's own feet (its skeleton's, `poses` as `sequence` gives them, frames `first` to
// `last`) are off its floor or moving, frame by frame (1 free, 0 planted; left, right): their
// ankles or balls higher than at rest, or their ankles going along
function clipFeet(poses, first, last, frameTime) {
    const index = new Map(poses.names.map((name, j) => [name, j]));
    const rest = poses.rest.positions;
    const frames = poses.poses.slice(first, last + 1);
    const free = frames.map(() => [0, 0]);

    ["l", "r"].forEach((s, i) => {
        const [ankle, ball] = [index.get(`foot_${s}`), index.get(`ball_${s}`)];

        frames.forEach(({ positions }, f) => {
            const [before, after] = [frames[Math.max(0, f - 1)].positions[ankle], frames[Math.min(frames.length - 1, f + 1)].positions[ankle]];
            const speed = Math.hypot(after.x - before.x, after.z - before.z) / (frameTime * (Math.min(frames.length - 1, f + 1) - Math.max(0, f - 1)));
            const lifted = Math.min(positions[ankle].y - rest[ankle].y, positions[ball].y - rest[ball].y);

            free[f][i] = lifted > LIFTED || speed > STEPPING ? 1 : 0;
        });

        // (Not for a frame or two: that's only a wobble)
        for (let f = 1; f < frames.length - 1; f++) {
            if (free[f][i] && !free[f - 1][i] && !free[f + 1][i]) {
                free[f][i] = 0;
            }
        }
    });

    return free;
}

/**
 * Bake a fall (a FALLS entry) on the reference body: { source, seconds, lands (when it hits the
 * ground: its chest nearly as low as it goes; 0 if it doesn't go down), channels, keys } (each
 * key its time in seconds and its values in the channels' order: each joint's angles, the
 * pelvis's turn and offset, each foot let go of the ground, and how high its lowest point is).
 */
export async function bakeFall(from, { from: clips, crop = null }, body = referenceBody()) {
    const poses = await sequence(from, clips);
    const clip = retarget(poses, body.character.rig, { names: MESH2MOTION_NAMES, match: MESH2MOTION_MATCH, limit: false });
    const { character } = body;
    const { rig, object, positions, human } = character;
    const frameTime = clip.frameTime;
    const [first, last] = crop ? crop.map((t) => Math.round(t / frameTime)) : [0, clip.frames.length - 1];
    const frames = clip.frames.slice(first, last + 1);
    const points = groundPoints(human);
    const standingHips = rig.heads[0].y;
    let ground = null;
    let turn = null;

    // Each frame posed as the clip has it, every joint within its range, the ground where the
    // body's lowest point is at its start; and the ankles put where `ankles` says ([left, right]
    // Vector3s in the world, or nulls: where they are), the legs bent to reach them
    const place = (frame, ankles = null) => {
        const strain = [0, 0];

        rig.reset();
        frame.rotations.forEach((rotation, b) => {
            if (rotation) {
                const { kind, side } = rig.joints[b];

                rig.rotations[b].copy(rotation);
                limitRotation(kind, side, rig.rotations[b]);
            }
        });
        rig.offset.set(frame.side, frame.height, frame.forward);
        rig.apply();
        object.updateMatrixWorld(true);
        ground ??= lowestPoint(rig, positions, points);
        rig.offset.y -= ground;
        rig.apply();
        object.updateMatrixWorld(true);

        if (ankles?.some(Boolean)) {
            ["Left", "Right"].forEach((Side, i) => {
                if (!ankles[i]) {
                    return;
                }

                rig.reach(`${Side}UpLeg`, `${Side}Leg`, `${Side}Foot`, object.worldToLocal(ankles[i].clone()), { pole: KNEE });

                // (Back into joint rotations, each within its range: how far the hip was past its)
                for (const part of ["UpLeg", "Leg", "Foot"]) {
                    const b = rig.index.get(`${Side}${part}`);
                    const { kind, side } = rig.joints[b];

                    rig.rotations[b].copy(rig.frames[rig.definition[b].parent]).invert().multiply(rig.bones[b].quaternion).multiply(rig.frames[b]);

                    const wanted = rig.rotations[b].clone();

                    limitRotation(kind, side, rig.rotations[b]);

                    if (part === "UpLeg") {
                        strain[i] = (wanted.angleTo(rig.rotations[b]) * 180) / Math.PI;
                    }
                }
            });
            rig.apply();
            object.updateMatrixWorld(true);
        }

        return { hips: rig.bone("Hips").getWorldPosition(new THREE.Vector3()).y, ankles: ["LeftFoot", "RightFoot"].map((name) => rig.bone(name).getWorldPosition(new THREE.Vector3())), strain };
    };

    // Each foot planted while the clip's own (its skeleton's, not ours: ours, on another body, can
    // come off the ground where the clip's stands on it) stands still on its floor, and the body's
    // up on them
    const unmoved = frames.map((frame) => place(frame));
    const down = unmoved.map(({ hips }) => hips < standingHips * DOWN);
    const free = clipFeet(poses, first, last, frameTime).map((feet, f) => feet.map((foot) => (down[f] ? 1 : foot)));

    // Standing, its legs bent to stand where ours stand, not where the clip's do (an animator's
    // figure stands wide, ours under the body): from where it stands (its start, or if it starts
    // down, its end), each planted foot kept where ours stands, where it was set down; once it's
    // free (stepping, or down) going where the clip's goes, from as far as it was from it over
    // FADE seconds
    const anchor = down[0] ? frames.length - 1 : 0;
    const stands = standing(body);
    const order = anchor === 0 ? frames.map((_, f) => f) : frames.map((_, f) => frames.length - 1 - f);
    const fitted = () => {
        const ankles = frames.map(() => [null, null]);

        for (const i of [0, 1]) {
            let lock = new THREE.Vector3(stands[i].at.x, unmoved[anchor].ankles[i].y, stands[i].at.z);
            let [off, share, last] = [null, 0, lock];

            for (const f of order) {
                const clip = unmoved[f].ankles[i];

                if (!free[f][i]) {
                    // (Set down where it's got to)
                    lock ??= last.clone();
                    ankles[f][i] = lock.clone().setY(clip.y);
                } else {
                    // (Off: from where it was, going where the clip's goes)
                    if (lock) {
                        [off, share, lock] = [last.clone().sub(clip).setY(0), 1, null];
                    }

                    share = Math.max(0, share - frameTime / FADE);
                    ankles[f][i] = share > 0 ? clip.clone().addScaledVector(off, share) : null;
                }

                last = ankles[f][i] ?? clip;
            }
        }

        return ankles;
    };

    // (A foot that can't be kept where it was set down without its hip turned past its range, as
    // the body sinks onto it, is let go of: it goes with the body, as a falling body's feet do)
    const tried = fitted();

    frames.forEach((frame, f) => {
        const { strain } = place(frame, tried[f]);

        strain.forEach((over, i) => {
            if (over > STRAIN) {
                free[f][i] = 1;
            }
        });
    });

    const ankles = fitted();

    const measured = frames.map((frame, f) => {
        place(frame, ankles[f]);

        const pose = {};

        for (const name of FALL_JOINTS) {
            const b = rig.index.get(name);
            const { kind, side } = rig.joints[b];

            pose[name] = Object.fromEntries(Object.entries(jointAngles(kind, side, rig.rotations[b])).map(([angle, value]) => [angle, round(value, 1)]));
        }

        // (Its turn the same way round as the frame before's, so the keys go smoothly between)
        const q = rig.rotations[0].clone();

        if (turn && q.dot(turn) < 0) {
            q.set(-q.x, -q.y, -q.z, -q.w);
        }

        turn = q;
        pose.turn = q.toArray().map((x) => round(x, 4));
        pose.offset = vector(rig.offset, 3);
        pose.low = round(Math.max(0, lowestPoint(rig, positions, points)), 3);

        const chest = rig.bone("Spine2").getWorldPosition(new THREE.Vector3()).y;

        return { pose, chest };
    });

    // (And while one's planted, the body's lowest point on the ground; where it's down, or off its
    // feet, a little over it as the clip's is: not that little, which is only how the bodies differ)
    measured.forEach(({ pose }, f) => {
        pose.free = { left: free[f][0], right: free[f][1] };
        pose.low = !down[f] && (!free[f][0] || !free[f][1]) ? 0 : round(Math.max(0, pose.low - OVER), 3);
    });

    const keyed = measured.map(({ pose }) => pose);
    const times = keyed.map((_, f) => f * frameTime);
    const lowest = Math.min(...measured.map(({ chest }) => chest));
    const goes = down.some(Boolean) && !down[0];
    const lands = goes ? times[measured.findIndex(({ chest }) => chest <= lowest + LANDED)] : 0;
    const keys = reduce(times, keyed, [0, keyed.length - 1]);
    const channels = flatten(keyed[0]).map(([channel]) => channel);
    const places = (channel) => (channel.startsWith("turn") ? 4 : channel.startsWith("offset") || channel === "low" ? 3 : 1);

    return {
        source: clips.map(([, name]) => name).join(" + ") + (crop ? ` (${crop[0]} to ${crop[1]} s)` : ""),
        seconds: round(times.at(-1), 3),
        lands: round(lands, 3),
        channels,
        keys: keys.map((f) => [round(times[f], 3), ...flatten(keyed[f]).map(([channel, value]) => round(value, places(channel)))]),
    };
}

/** Bake every one of `bakes`, with the clips from `from`: { name: baked }; and the falls (FALLS), `falls`. */
export async function bakeAll(from, bakes = BAKES, falls = FALLS) {
    const body = referenceBody();
    const out = {};
    const fallen = {};

    for (const each of bakes) {
        out[each.name] = await bake(from, each, body);
    }

    for (const each of falls) {
        fallen[each.name] = await bakeFall(from, each, body);
    }

    return { clips: out, falls: fallen };
}

/** The module the bakes are written to: the clips (`clips`) and the falls (`falls`), bakeAll's. */
export function keysModule({ clips, falls }, { height }) {
    const lines = [
        "// Generated by scripts/bake-clips.js (npm run build:clips) from Mesh2Motion's human animations",
        "// (mesh2motion.org, CC0 1.0; the clips are Quaternius's Universal Animation Library): each a",
        "// clip's key poses for actions.js, timed 1 at the blow and 2 at its end, as `channels` (a joint's",
        "// angle, a hand's place or turn, the pelvis's offset, a foot let go of the ground) and each key's",
        "// time and values in their order; and the falls, played whole, each key's time in seconds. Don't",
        "// edit by hand: bake again.",
        "",
        "/** How tall the body they were baked on is (m): the pelvis's offset is for a body this tall. */",
        `export const CLIP_HEIGHT = ${round(height, 3)};`,
        "",
    ];
    const write = (name, baked, fields) => {
        lines.push(`    ${name}: {`, ...fields.map((field) => `        ${field}: ${JSON.stringify(baked[field])},`), "        keys: [");

        for (const key of baked.keys) {
            lines.push(`            ${JSON.stringify(key)},`);
        }

        lines.push("        ],", "    },");
    };

    lines.push("export const CLIP_KEYS = Object.freeze({");
    Object.entries(clips).forEach(([name, baked]) => write(name, baked, ["source", "seconds", "hit", "channels"]));
    lines.push("});", "");
    lines.push(
        "/**",
        " * The falls (actions.js FALLS): each joint's angles, the pelvis's turn (a quaternion) and offset,",
        " * each foot let go of the ground (`free`) and how high the body's lowest point is (`low`), at",
        " * each key's time (seconds); `lands`, when it hits the ground.",
        " */",
        "export const FALL_KEYS = Object.freeze({",
    );
    Object.entries(falls).forEach(([name, baked]) => write(name, baked, ["source", "seconds", "lands", "channels"]));
    lines.push("});", "");

    return lines.join("\n");
}
