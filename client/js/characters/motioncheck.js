// The motion check (the terrain plan's M8, §10.1): every motion the characters make, on each
// people's bodies at the ends of their builds, holding what they hold, measured for what goes
// wrong, so that only what's wrong needs looking at:
//  - a joint turned past its range (rig.js JOINTS), any frame;
//  - a thing held or worn in the body, and a forearm or hand in the torso;
//  - a planted foot sliding, and a foot in the ground;
//  - a second hand off the haft of the two-handed weapon it holds.
//
// DOM-free: the clipping test (test/clipping.test.js), the check itself (scripts/motion-check.js:
// a report, and a regression against the baseline kept with it fails CI) and its contact sheet
// (motion-sheet.html: each failure drawn as it happened) all use it. A body is made from
// HumanData (body.js), so whatever body comes next (the plan's Vitruvian) is checked the same way.
import * as THREE from "three";
import { ACT_TIMES, ROLES } from "../core/roles.js";
import { SPELLS } from "../core/spells.js";
import { WEAPONS } from "../core/weapons.js";
import { Actions, ATTACKS, DRAWS, REACTIONS } from "./actions.js";
import { Character, placed } from "./character.js";
import { EQUIPMENT, socketOn } from "./equipment.js";
import { folkLook } from "./folk.js";
import { buildItem } from "./items.js";
import { Walker, WALK_STYLES } from "./locomotion.js";
import { LOOKS } from "./peoples.js";
import { limitRotation, Rig } from "./rig.js";
import { ARMS, soldierLook } from "./soldiers.js";

// --- Dressing a body, as Character does, without meshes or textures (which need a DOM) ---

// For each body data (HumanData): its vertices' heaviest bones, its shapes and items made once
const made = new WeakMap();

function madeFor(human) {
    if (!made.has(human)) {
        const heaviest = Array.from({ length: human.vertexCount }, (_, v) => {
            const weights = [0, 1, 2, 3].map((k) => human.skinWeights[v * 4 + k]);

            return human.skinIndices[v * 4 + weights.indexOf(Math.max(...weights))];
        });

        made.set(human, { heaviest, names: human.bones.map(({ name }) => name), bodies: new Map(), items: new Map() });
    }

    return made.get(human);
}

// A body's shape (its skin and joints at rest, its height), made once for all who share it
function bodyOf(human, shape) {
    const { bodies } = madeFor(human);
    const key = JSON.stringify(shape);

    if (!bodies.has(key)) {
        const { positions, joints } = human.shape(shape);
        let height = 0;

        for (let v = 0; v < human.vertexCount; v++) {
            if (human.partOf[v] === 0) {
                height = Math.max(height, positions[v * 3 + 1]);
            }
        }

        bodies.set(key, { positions, normals: human.normals(positions), joints, height });
    }

    return bodies.get(key);
}

// An item as fitted (meshes of it sharing their geometry, so their points are found once)
function built(human, model, fit) {
    const { items } = madeFor(human);
    const key = JSON.stringify([model, fit]);

    if (!items.has(key)) {
        items.set(key, buildItem(model, fit));
    }

    return items.get(key).clone();
}

/**
 * A character's body and skeleton (`human`: HumanData), what it wears and carries on their
 * sockets (as Character puts them: turned, offset, put away in their sheaths with what they hang
 * in), standing on a Walker with Actions over it, as in the game: { character, walker, actions }.
 */
export function dress(human, look, { sheathed = true } = {}) {
    const { positions, normals, joints, height } = bodyOf(human, look.shape);
    const rig = new Rig(human.bones);
    const object = new THREE.Group();

    object.add(rig.root);
    rig.fit(joints);
    object.updateMatrixWorld(true);

    const character = { human, rig, object, positions, normals, joints, height, holds: {}, items: [], equipment: new Map() };
    const ids = look.equipment.filter((id) => EQUIPMENT[id]?.kind === "item");

    for (const method of ["sheathe", "sheathPose", "settle"]) {
        character[method] = Character.prototype[method].bind(character);
    }

    ids.forEach((id) => character.equipment.set(EQUIPMENT[id].slot, id));

    for (const id of ids) {
        const item = EQUIPMENT[id];

        for (const part of item.parts ?? [item]) {
            const socket = socketOn(character, part.socket);
            const home = { bone: socket.bone, position: socket.position.clone(), quaternion: socket.quaternion.clone() };

            if (part.turn) {
                home.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.turn)));
            }

            if (part.offset) {
                home.position.add(new THREE.Vector3(...part.offset));
            }

            const model = new THREE.Group();

            model.add(built(human, part.model, { ...socket.fit, ears: character.equipment.get("ears") === "catEars" }));
            Object.assign(model.userData, { home, socket: part.socket, sway: item.sway ?? 0, hand: /^(left|right)Hand$/.test(part.socket) ? (part.socket.startsWith("left") ? "Left" : "Right") : null });
            model.name = id;

            const sheath = part === item && item.sheath && !item.sheath.worn ? item.sheath : null;

            if (sheath) {
                const place = placed(socketOn(character, sheath.socket), sheath);

                model.userData.sheath = place;

                if (sheath.holder) {
                    const holder = new THREE.Group();

                    holder.add(built(human, sheath.holder, socket.fit));
                    holder.name = `${id}:${sheath.holder}`;
                    Object.assign(holder.userData, { holder: true, home: place, socket: sheath.socket });
                    holder.position.copy(place.position);
                    holder.quaternion.copy(place.quaternion);
                    rig.bone(place.bone).add(holder);
                    character.items.push(holder);
                }
            }

            character.items.push(model);
        }
    }

    character.sheathe(sheathed);

    const walker = new Walker(character, WALK_STYLES[look.walk] ?? WALK_STYLES.natural);
    const actions = new Actions(character);

    walker.overlay = (dt) => actions.apply(dt);
    walker.afterPose = () => actions.place();
    walker.freed = (side) => actions.free[side];
    walker.update(0, { speed: 0 });

    return { character, walker, actions };
}

// --- How far into the body things go ---

// Each model's points (once each, in its own frame): its corners, and points along any edge longer
// than STRIDE (a bowstring's, a haft's), so nothing thin passes through unseen
const pointsOf = new WeakMap();
const STRIDE = 0.02;

function points(geometry) {
    if (!pointsOf.has(geometry)) {
        const seen = new Map();
        const position = geometry.attributes.position;
        const count = geometry.index?.count ?? position.count;
        const corner = (i) => new THREE.Vector3().fromBufferAttribute(position, geometry.index ? geometry.index.getX(i) : i);

        for (let t = 0; t + 2 < count; t += 3) {
            for (let k = 0; k < 3; k++) {
                const [a, b] = [corner(t + k), corner(t + ((k + 1) % 3))];
                const steps = Math.max(1, Math.floor(a.distanceTo(b) / STRIDE));

                for (let s = 0; s < steps; s++) {
                    const point = a.clone().lerp(b, s / steps);

                    seen.set(point.toArray().map((c) => Math.round(c * 500)).join(" "), point);
                }
            }
        }

        pointsOf.set(geometry, [...seen.values()]);
    }

    return pointsOf.get(geometry);
}

// The skin a thing may touch: a hand (and its forearm, at the wrist) what it holds, a forearm
// the shield strapped to it, the head what grows from it (tusks, ears), the hips a tail
function touches({ userData: { socket, holder } }) {
    if (holder) {
        return () => false;
    }

    if (/Hand$/.test(socket)) {
        const forearm = socket.startsWith("left") ? "LeftForeArm" : "RightForeArm";

        return (bone) => bone.includes("Hand") || bone === forearm;
    }

    if (socket === "leftForearm" || socket === "leftFist") {
        return (bone) => bone === "LeftForeArm" || bone.startsWith("LeftHand");
    }

    if (["mouth", "leftEar", "rightEar"].includes(socket)) {
        return (bone) => bone === "Head";
    }

    return socket === "tail" ? (bone) => bone === "Hips" || bone === "Spine" : () => false;
}

// Is a point of head-wear (in its own frame: meshes of it aren't moved in it) hidden within its
// dome or band (items.js: its shell as fitted), a little in from it: the roots of its horns and
// crests, a hat's brim across the head
const within = ({ across, up, back, front, rim, band }, { x, y, z }) => (band ? y >= band[0] && y <= band[1] : y > -rim) && (x / across) ** 2 + (band ? 0 : (y / up) ** 2) + (z / (z < 0 ? back : front)) ** 2 < 0.9 ** 2;

// How far along a tail its root, set into the body, goes (metres)
const ROOT = 0.1;

// How far off to one side of the skin nearest it a point behind that skin can be (the body's
// vertices are a centimetre or two apart; further, and it's beside the skin, not in it)
const SPREAD = 0.03;
// The body's skinned only in the cells (5 cm) round what's looked at
const CELL = 0.05;
const cellOf = (p) => (Math.floor(p.x / CELL) + 512) * 1048576 + (Math.floor(p.y / CELL) + 512) * 1024 + (Math.floor(p.z / CELL) + 512);
const NEAR = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dz) => dx * 1048576 + dy * 1024 + dz)));
// The skin nearest a point's looked for in finer cells, nearest first: in the cells next to the
// point's (skin found there within a cell's width is the nearest there is), then two cells round
// it (5 cm). A point further from the skin than that is clear of it, or so deep in the body that
// the thing it's on went in nearer the skin, where it's found
const FINE = 0.025;
const fineOf = (x, y, z) => (Math.floor(x / FINE) + 512) * 1048576 + (Math.floor(y / FINE) + 512) * 1024 + (Math.floor(z / FINE) + 512);
const ROUND = (r) => Array.from({ length: 2 * r + 1 }, (_, i) => i - r).flatMap((dx, _, all) => all.flatMap((dy) => all.map((dz) => dx * 1048576 + dy * 1024 + dz)));
const RINGS = [[ROUND(1), FINE], [ROUND(2), 2 * FINE]];

// Where each vertex of the posed body's skin is and which way it faces (filled in for those near
// what's looked at, as it's looked at)
const skins = new WeakMap();

function skinOf(human) {
    if (!skins.has(human)) {
        skins.set(human, { at: new Float32Array(human.vertexCount * 3), facing: new Float32Array(human.vertexCount * 3) });
    }

    return skins.get(human);
}

// How far each bone's skin reaches from its head (metres, at rest: its vertices' furthest), for
// each body: a bone whose skin can't reach anything looked at isn't skinned
const reaches = new WeakMap();

function reachOf(character) {
    const { human, rig, positions } = character;

    if (!reaches.has(positions)) {
        const { heaviest } = madeFor(human);
        const reach = new Float32Array(human.bones.length);
        const point = new THREE.Vector3();

        for (let v = 0; v < human.vertexCount; v++) {
            if (human.partOf[v] === 0) {
                const b = heaviest[v];

                reach[b] = Math.max(reach[b], point.fromArray(positions, v * 3).distanceTo(rig.heads[b]));
            }
        }

        reaches.set(positions, reach);
    }

    return reaches.get(positions);
}

// How far the deepest of each key's points is under the skin (metres; below 0, clear of it), for
// each of `groups` ({ held: x, y, z, key, the bones whose skin it may touch, flat; only: the bones
// whose skin counts, or all the body's }): against the nearest point of the posed body's skin
// (each vertex skinned by its bones; looked for within 5 cm), but for the skin it may touch. For
// each group, a Map: key → { depth, bone, at (where that point is: x, y, z) }
function under(character, groups) {
    const { human, rig, positions, normals } = character;
    const { heaviest, names } = madeFor(human);
    const { at: skinAt, facing: skinFacing } = skinOf(human);
    const reach = reachOf(character);
    const near = new Set();
    const boxes = new Map();
    const cells = new Map();
    const point = new THREE.Vector3();

    // (The cells the points are in, and the box round each key's points)
    groups.forEach(({ held }) => {
        for (let h = 0; h < held.length; h += 5) {
            point.set(held[h], held[h + 1], held[h + 2]);
            near.add(cellOf(point));

            if (!boxes.has(held[h + 3])) {
                boxes.set(held[h + 3], new THREE.Box3());
            }

            boxes.get(held[h + 3]).expandByPoint(point);
        }
    });

    const around = new Set();

    near.forEach((cell) => NEAR.forEach((step) => around.add(cell + step)));

    // Only the bones whose skin reaches within 10 cm of a box round what's looked at (what's skinned
    // further from it isn't looked at)
    const matrices = rig.bones.map((bone, i) => bone.matrixWorld.clone().multiply(rig.skeleton.boneInverses[i]));
    const sphere = new THREE.Sphere();
    const skinned = rig.bones.map((bone, i) => {
        sphere.set(bone.getWorldPosition(point), reach[i] + 2 * CELL);

        return [...boxes.values()].some((box) => box.intersectsSphere(sphere));
    });
    const at = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] !== 0 || !skinned[heaviest[v]] || !around.has(cellOf(point.fromArray(positions, v * 3).applyMatrix4(matrices[heaviest[v]])))) {
            continue;
        }

        at.set(0, 0, 0);
        normal.set(0, 0, 0);

        for (let k = 0; k < 4; k++) {
            const weight = human.skinWeights[v * 4 + k] / 255;
            const matrix = matrices[human.skinIndices[v * 4 + k]];

            if (weight) {
                at.addScaledVector(point.fromArray(positions, v * 3).applyMatrix4(matrix), weight);
                normal.addScaledVector(point.fromArray(normals, v * 3).transformDirection(matrix), weight);
            }
        }

        at.toArray(skinAt, v * 3);
        normal.normalize().toArray(skinFacing, v * 3);

        const cell = fineOf(at.x, at.y, at.z);

        if (!cells.has(cell)) {
            cells.set(cell, []);
        }

        cells.get(cell).push(v);
    }

    return groups.map(({ held, only = null }) => {
        const deepest = new Map();
        // (The skin round each cell's points, at each distance, gathered once for all of them)
        const gathered = RINGS.map(() => new Map());
        const gather = (map, cell, steps) => {
            if (!map.has(cell)) {
                const found = [];

                for (const step of steps) {
                    for (const v of cells.get(cell + step) ?? []) {
                        if (!only || only.has(names[heaviest[v]])) {
                            found.push(v);
                        }
                    }
                }

                map.set(cell, found);
            }

            return map.get(cell);
        };
        const best = { distance: Infinity, v: -1 };
        const nearest = (x, y, z, list) => {
            for (const v of list) {
                const distance = (skinAt[v * 3] - x) ** 2 + (skinAt[v * 3 + 1] - y) ** 2 + (skinAt[v * 3 + 2] - z) ** 2;

                if (distance < best.distance) {
                    best.distance = distance;
                    best.v = v;
                }
            }
        };

        for (let h = 0; h < held.length; h += 5) {
            const x = held[h];
            const y = held[h + 1];
            const z = held[h + 2];
            const cell = fineOf(x, y, z);

            best.distance = Infinity;
            best.v = -1;

            for (let r = 0; r < RINGS.length && best.distance > (r ? RINGS[r - 1][1] ** 2 : -1); r++) {
                nearest(x, y, z, gather(gathered[r], cell, RINGS[r][0]));
            }

            const { v } = best;
            const bone = v >= 0 ? names[heaviest[v]] : null;

            if (bone && !held[h + 4](bone)) {
                const depth = (skinAt[v * 3] - x) * skinFacing[v * 3] + (skinAt[v * 3 + 1] - y) * skinFacing[v * 3 + 1] + (skinAt[v * 3 + 2] - z) * skinFacing[v * 3 + 2];

                // (Behind the skin nearest it, not off to one side of where that skin faces)
                if (depth > 0 && best.distance - depth * depth > SPREAD * SPREAD) {
                    continue;
                }

                if (depth > (deepest.get(held[h + 3])?.depth ?? -Infinity)) {
                    deepest.set(held[h + 3], { depth, bone, at: [x, y, z] });
                }
            }
        }

        return deepest;
    });
}

// The points of everything worn or carried (x, y, z, its name, the skin it may touch; flat)
function itemPoints(character) {
    const held = [];
    const point = new THREE.Vector3();

    for (const model of character.items) {
        const may = touches(model);
        const shell = model.children[0]?.userData.shell;

        model.traverse((mesh) => {
            for (const local of mesh.isMesh && mesh.visible ? points(mesh.geometry) : []) {
                // (A tail's root, set into the body where it grows from)
                if ((shell && within(shell, local)) || (model.userData.socket === "tail" && local.length() < ROOT)) {
                    continue;
                }

                point.copy(local).applyMatrix4(mesh.matrixWorld);
                held.push(point.x, point.y, point.z, model.name, may);
            }
        });
    }

    return held;
}

// The torso, which a forearm or hand mustn't pass into
const TORSO = new Set(["Hips", "Spine", "Spine1", "Spine2", "Neck"]);
const ANYWHERE = () => false;
// Where along each forearm (elbow to wrist) and hand (wrist to its middle knuckles) its line is looked at
const LIMBS = [
    ["ForeArm", "Hand", [0.25, 0.5, 0.75, 1]],
    ["Hand", "HandMiddle1", [0.5, 1]],
];

// The points along each forearm's and hand's line ("LeftForeArm" and the like; flat, as itemPoints')
function limbPoints({ rig }) {
    const held = [];
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();

    for (const Side of ["Left", "Right"]) {
        for (const [start, end, along] of LIMBS) {
            rig.bone(`${Side}${start}`).getWorldPosition(from);
            rig.bone(`${Side}${end}`).getWorldPosition(to);

            for (const share of along) {
                const point = from.clone().lerp(to, share);

                held.push(point.x, point.y, point.z, `${Side}${start}`, ANYWHERE);
            }
        }
    }

    return held;
}

// A limb's line's depth under the torso's skin, made its skin's: less how far that is from the line
function thickened(character, deepest) {
    const thick = thickness(character);

    for (const [limb, found] of deepest) {
        found.depth += thick[limb.replace(/^(Left|Right)/, "")];
    }

    return deepest;
}

/**
 * How far the deepest point of each thing worn or carried is under the skin (metres; below 0,
 * clear of it), but for the skin it may touch: a Map, its name → { depth, bone, at }.
 */
export function itemDepths(character) {
    character.object.updateMatrixWorld(true);

    return under(character, [{ held: itemPoints(character) }])[0];
}

/**
 * How far into the torso each forearm and hand goes (metres; below 0, clear of it): the deepest
 * point along its line under the torso's skin, less how far its own skin is from that line. A
 * Map: "LeftForeArm" and the like → { depth, bone, at }.
 */
export function limbDepths(character) {
    character.object.updateMatrixWorld(true);

    return thickened(character, under(character, [{ held: limbPoints(character), only: TORSO }])[0]);
}

/** Both (itemDepths, limbDepths), the body skinned once for them: { items, limbs }. */
export function depths(character) {
    character.object.updateMatrixWorld(true);

    const [items, limbs] = under(character, [{ held: itemPoints(character) }, { held: limbPoints(character), only: TORSO }]);

    return { items, limbs: thickened(character, limbs) };
}

// How far each limb's skin is from its line (metres, at rest: the median of its vertices' distances
// from the line through its bone; left and right alike), once for each body
const thicknesses = new WeakMap();

function thickness(character) {
    const { human, rig, positions } = character;

    if (!thicknesses.has(positions)) {
        const { heaviest } = madeFor(human);
        const found = {};

        for (const [start, end] of LIMBS) {
            const head = rig.heads[rig.index.get(`Left${start}`)];
            const tail = rig.heads[rig.index.get(`Left${end}`)];
            const line = new THREE.Line3(head, tail);
            const bone = rig.index.get(`Left${start}`);
            const closest = new THREE.Vector3();
            const point = new THREE.Vector3();
            const distances = [];

            for (let v = 0; v < human.vertexCount; v++) {
                if (human.partOf[v] === 0 && heaviest[v] === bone) {
                    line.closestPointToPoint(point.fromArray(positions, v * 3), true, closest);
                    distances.push(point.distanceTo(closest));
                }
            }

            distances.sort((a, b) => a - b);
            found[start] = distances[Math.floor(distances.length / 2)] ?? 0;
        }

        thicknesses.set(positions, found);
    }

    return thicknesses.get(positions);
}

// The joints looked at: all but the fingers' and thumbs' (curled as each grip and rest has them,
// their two movements together turn them a little about themselves, which their ranges, having
// no twist, would take off; how they close round what's held is the grip's measure and the hands'
// tests')
const HANDLESS = new Set(["finger", "thumb"]);

/**
 * How far the joint turned furthest past its range is (degrees), and which: { degrees, bone }
 * (`bones`: the body's, with their parents).
 */
export function jointExcess(rig, bones) {
    let worst = { degrees: 0, bone: null };

    for (let i = 0; i < rig.bones.length; i++) {
        const p = bones[i].parent;
        const { kind, side } = rig.joints[i] ?? {};

        if (p < 0 || !kind || HANDLESS.has(kind)) {
            continue;
        }

        _turned.copy(rig.frames[p]).invert().multiply(rig.bones[i].quaternion).multiply(rig.frames[i]);

        const degrees = (_turned.angleTo(limitRotation(kind, side, _limited.copy(_turned))) * 180) / Math.PI;

        if (degrees > worst.degrees) {
            worst = { degrees, bone: rig.bones[i].name };
        }
    }

    return worst;
}

const _turned = new THREE.Quaternion();
const _limited = new THREE.Quaternion();

// --- What's wrong, and how much is too much ---

/**
 * What each measure is, its unit, and how much of it is too much: a joint past its range
 * (degrees), something held or worn in the body, a forearm or hand in the torso, a planted foot
 * sliding, a foot in the ground, a second hand off its haft (metres). Set from the contact sheet:
 * a joint a degree or two past its range doesn't show (a short body's knee straightened 2° past
 * its), well past it it does; a forearm or hand resting on the body comes out at up to about
 * 2.5 cm (its thickness is its skin's median distance from its line, so its flat side is nearer),
 * one sunk into it from 3 cm; things held or worn are held to the clipping test's 1.2 cm.
 */
export const MEASURES = Object.freeze({
    joint: { label: "joint past its range", unit: "°", scale: 1, limit: 3 },
    item: { label: "held or worn thing in the body", unit: "cm", scale: 100, limit: 0.012 },
    limb: { label: "forearm or hand in the torso", unit: "cm", scale: 100, limit: 0.03 },
    slide: { label: "planted foot sliding", unit: "cm", scale: 100, limit: 0.01 },
    ground: { label: "foot in the ground", unit: "cm", scale: 100, limit: 0.005 },
    grip: { label: "second hand off its haft", unit: "cm", scale: 100, limit: 0.035 },
});

// --- The bodies: each people's, at the ends of their builds ---

// Each people's builds, as far as they go: the humans' every calling's (folk.js PARTS: height as
// folkLook makes it), the elves', dark elves', cat folk's and lizard folk's (peoples.js LOOKS),
// the orcs' round PRESETS.orc (peoples.js orcLook)
const BUILDS = {
    human: { m: { height: [0.4, 0.62], weight: [0.35, 0.9], muscle: [0.35, 0.95], belly: [0, 0.9] }, f: { height: [0.4, 0.62], weight: [0.35, 0.8], muscle: [0.35, 0.8], bust: [0.35, 0.9] } },
    ...Object.fromEntries(Object.entries(LOOKS).map(([people, { build }]) => [people, build])),
    orc: { m: { height: [0.58, 0.74], weight: [0.73, 0.96], muscle: [0.8, 1] }, f: { height: [0.52, 0.68], weight: [0.73, 0.96], muscle: [0.8, 1], bust: [0.35, 0.6] } },
};

const middle = ([least, most]) => (least + most) / 2;

// The ends of a build: thinnest and shortest a woman, bulkiest either, tallest a man (as each
// people's are made: the women slighter)
const ENDS = [
    ["thinnest", "f", (b) => ({ weight: b.weight[0], muscle: b.muscle[0], height: middle(b.height), bust: b.bust?.[0] })],
    ["shortest", "f", (b) => ({ weight: middle(b.weight), muscle: middle(b.muscle), height: b.height[0], bust: b.bust && middle(b.bust) })],
    ["bulkiest", "f", (b) => ({ weight: b.weight[1], muscle: b.muscle[1], height: middle(b.height), bust: b.bust?.[1] })],
    ["bulkiest", "m", (b) => ({ weight: b.weight[1], muscle: b.muscle[1], height: middle(b.height), belly: b.belly?.[1] })],
    ["tallest", "m", (b) => ({ weight: middle(b.weight), muscle: middle(b.muscle), height: b.height[1] })],
];

/** The bodies checked: each people's at the ends of their build, { id, people, sex, end, macro, belly }. */
export const BODIES = Object.freeze(
    Object.keys(BUILDS).flatMap((people) =>
        ENDS.map(([end, sex, measure]) => {
            const build = BUILDS[people][sex] ?? BUILDS[people].m;
            const { belly, ...macro } = measure(build);

            return Object.freeze({ id: `${people}-${end}-${sex}`, people, sex, end, macro: Object.fromEntries(Object.entries(macro).filter(([, value]) => value !== undefined)), belly: belly ?? null });
        }),
    ),
);

// A look made as `body`'s: its people's and sex's, its shape at the end of their build
function shaped(look, body) {
    const shape = structuredClone(look.shape);

    Object.assign(shape.macro, body.macro);

    if (body.belly !== null) {
        shape.details = { ...shape.details, belly: body.belly };
    }

    return { ...look, shape };
}

// --- The motions: everything the characters do ---

// Each weapon's guard and blows (actions.js GUARDS, ATTACKS), as soldiers carry it (soldiers.js)
const WEAPON_GUARD = { sword: "sword", staff: "staff", wand: "wand", grimoire: "grimoire", hammer: "hammer", bow: "bow", gauntlets: "punch", boots: "kick", cleaver: "cleaver" };
// A spell's cast (a heal's, a hex's), as long as the game's are: from its hands raised to the
// spell flying, and as long again and more while it's let go (app/game.js)
const CASTS = { castHeal: SPELLS.mendWounds.castTime / 1000, castStun: SPELLS.shockbolt.castTime / 1000 };
// The frame (s): every motion's played as in the game, at 30 frames a second
export const FRAME = 1 / 30;

// A soldier of `body`'s people with `weapon`, shaped as the body is
const soldier = (body, weapon) => shaped(soldierLook({ people: body.people, weapon, sex: body.sex, seed: 11, captain: body.sex === "m" }), body);
// One of the folk in `role` of `body`'s people (null, if there are none of that sex in it)
const folk = (body, role) => {
    try {
        return shaped(folkLook({ role, sex: body.sex, seed: 5, people: body.people }), body);
    } catch {
        return null;
    }
};
// Two seconds at `speed`, a frame at a time (into the stride, past setting off)
const pace = (walker, speed) => {
    for (let k = 0; k < 2 / FRAME && speed; k++) {
        walker.update(FRAME, { speed });
    }
};
// On guard, `weapon` drawn, a second to settle
const onGuard = (weapon) => ({ sheathed: false, start: ({ actions, walker }) => {
    actions.setWeapon(WEAPON_GUARD[weapon]);
    actions.setGuard(true);
    walker.update(1, { speed: 0 });
} });

/**
 * Every motion: { id, group, look(body) → a look or null (not for this body), seconds, speed,
 * sheathed, start(dressed, body) }: standing, setting off, walking and running; on guard with each weapon, still,
 * walking and running; each weapon's blows and each spell's casts, every way; drawing and putting
 * away each weapon; every flinch; falling dead and knocked down; the folk's acts; and every rest
 * of every role.
 */
export function motions() {
    const list = [];
    const first = (body) => ARMS[body.people]?.[0] ?? "sword";

    // Standing, setting off from standing, and walking and running at their pace (two seconds
    // into it first)
    for (const [name, speed, seconds, settled] of [["stand", 0, 1, false], ["start", 1.3, 1.5, false], ["walk", 1.3, 2, true], ["run", 3.5, 1.6, true]]) {
        list.push({ id: `gait/${name}`, group: "gait", look: (body) => soldier(body, first(body)), seconds, speed, sheathed: true, start: ({ walker }) => settled && pace(walker, speed) });
    }

    for (const weapon of Object.keys(WEAPON_GUARD)) {
        const guard = WEAPON_GUARD[weapon];

        for (const [name, speed, seconds] of [["still", 0, 1], ["walk", 1.3, 1.2], ["run", 3.5, 1.2]]) {
            const { start } = onGuard(weapon);

            list.push({
                id: `guard/${weapon}/${name}`,
                group: "guard",
                look: (body) => soldier(body, weapon),
                seconds,
                speed,
                sheathed: false,
                start: (dressed) => {
                    start(dressed);
                    pace(dressed.walker, speed);
                },
            });
        }

        const { hitAt, duration } = WEAPONS[weapon].attacks[0];

        ATTACKS[guard].variants.forEach(({ name: way }, variant) => {
            const { start } = onGuard(weapon);

            list.push({
                id: `attack/${weapon}/${variant}`,
                label: way,
                group: "attack",
                look: (body) => soldier(body, weapon),
                seconds: duration / 1000 + 0.3,
                speed: 0,
                sheathed: false,
                start: (dressed) => {
                    start(dressed);
                    dressed.actions.startAttack(guard, { hitAt: hitAt / 1000, duration: duration / 1000, variant });
                },
            });
        });

        // Drawing it and putting it away (on guard while armed, off guard once putting it away, as in the game)
        for (const on of DRAWS[guard]?.draw ? [true, false] : []) {
            const how = DRAWS[guard][on ? "draw" : "sheathe"];

            list.push({
                id: `${on ? "draw" : "sheathe"}/${weapon}`,
                group: "draw",
                look: (body) => soldier(body, weapon),
                seconds: how.duration + 0.2,
                speed: 0,
                sheathed: on,
                start: (dressed) => {
                    if (!on) {
                        onGuard(weapon).start(dressed);
                    }

                    dressed.character.sheathe(on);
                    dressed.actions.draw(guard, on);
                    dressed.actions.setGuard(on);
                },
            });
        }
    }

    for (const [cast, hitAt] of Object.entries(CASTS)) {
        ATTACKS[cast].variants.forEach(({ name: way }, variant) => {
            list.push({
                id: `cast/${cast}/${variant}`,
                label: way,
                group: "cast",
                look: (body) => soldier(body, first(body)),
                seconds: hitAt * 1.7 + 0.3,
                speed: 0,
                sheathed: false,
                start: (dressed, body) => {
                    onGuard(first(body)).start(dressed);
                    dressed.actions.startAttack(cast, { hitAt, duration: hitAt * 1.7, variant });
                },
            });
        });
    }

    for (const reaction of Object.keys(REACTIONS)) {
        list.push({
            id: `flinch/${reaction}`,
            group: "flinch",
            look: (body) => soldier(body, first(body)),
            seconds: REACTIONS[reaction].length + 0.2,
            speed: 0,
            sheathed: false,
            start: (dressed, body) => {
                onGuard(first(body)).start(dressed);
                dressed.actions.react(reaction);
            },
        });
    }

    for (const [name, fall] of [["dead", (actions) => actions.die({ from: 0 })], ["dead-from-behind", (actions) => actions.die({ from: Math.PI })], ["knocked-down", (actions) => actions.knockdown({ from: 0, seconds: 1.5 })]]) {
        list.push({ id: `fall/${name}`, group: "fall", look: (body) => soldier(body, first(body)), seconds: 3, speed: 0, sheathed: true, start: ({ actions }) => fall(actions) });
    }

    for (const [act, { hitAt, duration, by }] of Object.entries(ACT_TIMES)) {
        // (Sat down or standing a second first, as the game's folk are before they do anything)
        list.push({
            id: `act/${act}`,
            group: "act",
            look: (body) => folk(body, by),
            seconds: duration + 0.2,
            speed: 0,
            sheathed: true,
            start: ({ actions, walker }) => {
                actions.setSeated(Boolean(ROLES[by]?.seated));
                walker.update(1, { speed: 0 });
                actions.startAttack(act, { hitAt, duration });
            },
        });
    }

    for (const [role, { rests, seated }] of Object.entries(ROLES)) {
        (rests ?? []).forEach(({ name: way, duration }, variant) => {
            list.push({
                id: `rest/${role}/${variant}`,
                label: way,
                group: "rest",
                look: (body) => folk(body, role),
                seconds: duration,
                speed: 0,
                sheathed: true,
                start: ({ actions, walker }) => {
                    actions.setSeated(Boolean(seated));
                    walker.update(1, { speed: 0 });
                    actions.rest(role, { variant });
                },
            });
        });
    }

    // (What's in the body's looked for every tenth of a second in quick motions, every 0.3 s in
    // slow ones: a fall, an act, a rest; the joints, feet and hands every frame)
    for (const motion of list) {
        motion.every = ["fall", "act", "rest"].includes(motion.group) ? 0.3 : 0.1;
    }

    return list;
}

// --- Playing one, and measuring it ---

/**
 * Play `motion` on `body` (human: HumanData), measuring it every frame (and what's in the body
 * every `every` s, the motion's): the worst of each measure, when and where, { joint: { value, t,
 * what, at: [x, y, z] }, ... }.
 * `until` (s): stop there, and give back the posed character too (to draw it: the contact sheet).
 */
export function play(human, motion, body, { every = motion.every ?? 0.1, until = Infinity } = {}) {
    const look = motion.look(body);

    if (!look) {
        return null;
    }

    const dressed = dress(human, look, { sheathed: motion.sheathed });
    const { character, walker, actions } = dressed;
    const worst = {};
    // (The worst of each measure: how much, when, what, and where, x, y, z to the millimetre)
    const note = (kind, value, t, what, at) => {
        if (value > (worst[kind]?.value ?? -Infinity)) {
            worst[kind] = { value, t: Math.round(t * 1000) / 1000, what, at: at.map((c) => Math.round(c * 1000) / 1000) };
        }
    };
    const where = new THREE.Vector3();
    const planted = [null, null];
    const end = Math.min(motion.seconds, until);
    let next = every;

    motion.start(dressed, body);

    for (let t = FRAME; t <= end + 1e-6; t += FRAME) {
        walker.update(FRAME, { speed: motion.speed });

        const { degrees, bone } = jointExcess(character.rig, human.bones);

        note("joint", degrees, t, bone, bone ? character.rig.bone(bone).getWorldPosition(where).toArray() : [0, 0, 0]);

        for (const i of [0, 1]) {
            const side = i ? "right" : "left";
            const foot = walker.feet[i];

            note("ground", -walker.footHeight(i), t, `${side} foot`, walker.footPoint(i).toArray());

            if (foot.planted) {
                const point = walker.footPoint(i, foot.pivot);

                if (planted[i]?.pivot !== foot.pivot) {
                    planted[i] = { pivot: foot.pivot, x: point.x, z: point.z };
                }

                note("slide", Math.hypot(point.x - planted[i].x, point.z - planted[i].z), t, `${side} foot (${foot.pivot})`, point.toArray());
            } else {
                planted[i] = null;
            }
        }

        for (const side of ["left", "right"]) {
            const haft = actions.haft[side];

            if (haft?.held && haft.weight > 0.99) {
                note("grip", haft.held.distanceTo(haft.wanted), t, `${side} hand`, haft.held.toArray());
            }
        }

        if (t >= next - 1e-6) {
            next += every;

            const { items, limbs } = depths(character);

            for (const [name, { depth, bone, at }] of items) {
                note("item", depth, t, `${name} in the ${bone}`, at);
            }

            for (const [limb, { depth, bone, at }] of limbs) {
                note("limb", depth, t, `${limb} in the ${bone}`, at);
            }
        }
    }

    return until < Infinity ? { worst, dressed } : { worst };
}

/** What's wrong with a motion's worst: [kind, { value, t, what }] past each measure's limit. */
export function failures(worst) {
    return Object.entries(worst ?? {}).filter(([kind, { value }]) => value > MEASURES[kind].limit);
}
