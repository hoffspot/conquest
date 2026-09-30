// What characters wear and carry kept out of their bodies (client/js/characters: equipment.js,
// items.js, actions.js, locomotion.js): each people's soldiers' shields, helms, quivers, tails and
// what they put away, the weapons they draw and put back, and the folk's tools, through standing,
// walking, running, their guard, their blows and flinches, and their rests, on the real body
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { Actions, ATTACKS, DRAWS, RESTS } from "../client/js/characters/actions.js";
import { HumanData } from "../client/js/characters/body.js";
import { Character, placed } from "../client/js/characters/character.js";
import { EQUIPMENT, socketOn } from "../client/js/characters/equipment.js";
import { folkLook } from "../client/js/characters/folk.js";
import { buildItem } from "../client/js/characters/items.js";
import { Walker, WALK_STYLES } from "../client/js/characters/locomotion.js";
import { Rig } from "../client/js/characters/rig.js";
import { ARMS, soldierLook } from "../client/js/characters/soldiers.js";
import { ROLES } from "../client/js/core/roles.js";

const manifest = JSON.parse(readFileSync(new URL("../client/characters/human.json", import.meta.url), "utf8"));
const unpacked = gunzipSync(readFileSync(new URL("../client/characters/human.bin", import.meta.url)));
const human = new HumanData(manifest, unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength));
const boneNames = human.bones.map(({ name }) => name);

// Each body vertex's heaviest bone
const heaviest = Array.from({ length: human.vertexCount }, (_, v) => {
    const weights = [0, 1, 2, 3].map((k) => human.skinWeights[v * 4 + k]);

    return human.skinIndices[v * 4 + weights.indexOf(Math.max(...weights))];
});

// A body's shape, and an item as fitted, made once for all who share them (the items' meshes
// sharing their geometry, so their points are found once)
const bodies = new Map();
const items = new Map();

function bodyOf(shape) {
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

function built(model, fit) {
    const key = JSON.stringify([model, fit]);

    if (!items.has(key)) {
        items.set(key, buildItem(model, fit));
    }

    return items.get(key).clone();
}

// A character's body and skeleton, and what it wears and carries on their sockets (as Character
// puts them: turned, offset, put away in their sheaths with what they hang in), standing on a
// Walker with Actions over it: no meshes or textures, which need a DOM
function dressed(look, { sheathed = true } = {}) {
    const { positions, normals, joints, height } = bodyOf(look.shape);
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

            model.add(built(part.model, { ...socket.fit, ears: character.equipment.get("ears") === "catEars" }));
            Object.assign(model.userData, { home, socket: part.socket, sway: item.sway ?? 0, hand: /^(left|right)Hand$/.test(part.socket) ? (part.socket.startsWith("left") ? "Left" : "Right") : null });
            model.name = id;

            const sheath = part === item && item.sheath && !item.sheath.worn ? item.sheath : null;

            if (sheath) {
                const place = placed(socketOn(character, sheath.socket), sheath);

                model.userData.sheath = place;

                if (sheath.holder) {
                    const holder = new THREE.Group();

                    holder.add(built(sheath.holder, socket.fit));
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
const CELL = 0.05;
const cellOf = (p) => (Math.floor(p.x / CELL) + 512) * 1048576 + (Math.floor(p.y / CELL) + 512) * 1024 + (Math.floor(p.z / CELL) + 512);
const NEAR = [-2, -1, 0, 1, 2].flatMap((dx) => [-2, -1, 0, 1, 2].flatMap((dy) => [-2, -1, 0, 1, 2].map((dz) => dx * 1048576 + dy * 1024 + dz)));
// (The cells next to a cell: skin found in them within a cell's width is the nearest there is)
const NEXT = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dz) => dx * 1048576 + dy * 1024 + dz)));

// Where each vertex of the posed body's skin is and which way it faces (filled in for those near
// what's worn or carried as it's looked at)
const skinAt = new Float32Array(human.vertexCount * 3);
const skinFacing = new Float32Array(human.vertexCount * 3);

// How far the deepest point of each thing worn or carried is under the skin (metres; below 0,
// clear of it): its points against the nearest point of the posed body's skin (each vertex
// skinned by its bones; looked for within 10 cm), but for the skin it may touch
function depths(character) {
    const { rig, positions, normals } = character;
    const held = [];
    const near = new Set();
    const around = new Set();
    const cells = new Map();
    const point = new THREE.Vector3();

    character.object.updateMatrixWorld(true);

    for (const model of character.items) {
        const may = touches(model);
        const shell = model.children[0]?.userData.shell;

        model.traverse((mesh) => {
            for (const local of mesh.isMesh && mesh.visible ? points(mesh.geometry) : []) {
                // (A tail's root, set into the body where it grows from)
                if ((shell && within(shell, local)) || (model.userData.socket === "tail" && local.length() < ROOT)) {
                    continue;
                }

                const q = point.copy(local).applyMatrix4(mesh.matrixWorld);
                const cell = cellOf(q);

                held.push(q.x, q.y, q.z, cell, model, may);
                near.add(cell);
            }
        });
    }

    near.forEach((cell) => NEAR.forEach((step) => around.add(cell + step)));

    const matrices = rig.bones.map((bone, i) => bone.matrixWorld.clone().multiply(rig.skeleton.boneInverses[i]));
    const at = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] !== 0 || !around.has(cellOf(point.fromArray(positions, v * 3).applyMatrix4(matrices[heaviest[v]])))) {
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

        const cell = cellOf(at);

        if (!cells.has(cell)) {
            cells.set(cell, []);
        }

        cells.get(cell).push(v);
    }

    const deepest = new Map();
    // (The skin next to each cell's points and within reach of them, gathered once for all of them)
    const next = new Map();
    const reach = new Map();
    const gather = (map, cell, steps) => {
        if (!map.has(cell)) {
            const found = [];

            for (const step of steps) {
                for (const v of cells.get(cell + step) ?? []) {
                    found.push(v);
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

    for (let h = 0; h < held.length; h += 6) {
        const [x, y, z, cell, model, may] = [held[h], held[h + 1], held[h + 2], held[h + 3], held[h + 4], held[h + 5]];

        best.distance = Infinity;
        best.v = -1;
        nearest(x, y, z, gather(next, cell, NEXT));

        if (best.distance > CELL * CELL) {
            nearest(x, y, z, gather(reach, cell, NEAR));
        }

        const { v } = best;
        const bone = v >= 0 ? boneNames[heaviest[v]] : null;

        if (bone && !may(bone)) {
            const depth = (skinAt[v * 3] - x) * skinFacing[v * 3] + (skinAt[v * 3 + 1] - y) * skinFacing[v * 3 + 1] + (skinAt[v * 3 + 2] - z) * skinFacing[v * 3 + 2];

            // (Behind the skin nearest it, not off to one side of where that skin faces)
            if (depth > 0 && best.distance - depth * depth > SPREAD * SPREAD) {
                continue;
            }

            if (depth > (deepest.get(model.name)?.depth ?? -Infinity)) {
                deepest.set(model.name, { depth, bone });
            }
        }
    }

    return deepest;
}

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
