// What characters can wear and carry, and where it goes.
//
// Every piece of equipment goes in a slot (one piece per slot, so a new helmet replaces the old
// one), in one of two ways:
//
//  - Garments (garments.js) are fitted to the body and skinned to its skeleton: clothing and
//    armour that bends with the body.
//  - Items (items.js) are rigid models on a socket: a point on a bone, placed from the body's
//    shape (the palm of the hand, the middle of the head, the upper back), so a sword sits in any
//    hand. An item can also bring a garment (a backpack's straps), hide parts of the body (a
//    helmet hides the hair) and change how its arm is held when walking (a shield, a staff).

import * as THREE from "three";
import { faceFrame } from "./face.js";
import { GARMENTS } from "./garments.js";

/** The slots, in the order to show them. */
export const SLOTS = Object.freeze([
    { id: "head", label: "Head" },
    { id: "face", label: "Face" },
    { id: "undershirt", label: "Under top" },
    { id: "shirt", label: "Shirt" },
    { id: "chest", label: "Chest" },
    { id: "armour", label: "Armour" },
    { id: "forearms", label: "Forearms" },
    { id: "hands", label: "Hands" },
    { id: "waist", label: "Waist" },
    { id: "underwear", label: "Underwear" },
    { id: "legs", label: "Legs" },
    { id: "shins", label: "Shins" },
    { id: "feet", label: "Feet" },
    { id: "back", label: "Back" },
    { id: "mainHand", label: "Main hand" },
    { id: "offHand", label: "Off hand" },
]);

// Arm poses for carrying things (anatomical angles, degrees), used instead of the arm's swing
const HOLDS = {
    shield: { Arm: { flex: 20, abduct: 14, rotate: 50 }, ForeArm: { flex: 85, pronate: 10 }, Hand: { flex: 10 }, swing: 0.15 },
    staff: { Arm: { flex: 12, abduct: 10, rotate: 10 }, ForeArm: { flex: 78, pronate: 0 }, Hand: { flex: -5, deviate: 10 }, swing: 0.25 },
    bow: { Arm: { flex: 5, abduct: 8 }, ForeArm: { flex: 20, pronate: 0 }, Hand: { flex: 0 }, swing: 0.5 },
    pistol: { Arm: { flex: 0, abduct: 8 }, ForeArm: { flex: 25, pronate: 10 }, Hand: { flex: 0, deviate: -10 }, swing: 0.6 },
    sword: { Arm: { flex: 0, abduct: 9 }, ForeArm: { flex: 20, pronate: 10 }, Hand: { flex: 0, deviate: -20 }, swing: 0.7 },
};

/**
 * Items: slot, model (items.js), socket, an extra turn in the socket (Euler angles, radians),
 * the hold pose for its arm, whether the hand grips it, what it hides and brings.
 */
export const ITEMS = Object.freeze({
    sword: { label: "Arming sword", slot: "mainHand", model: "sword", socket: "rightHand", grips: true, hold: HOLDS.sword },
    staff: { label: "Mage's staff", slot: "mainHand", model: "staff", socket: "rightHand", grips: true, hold: HOLDS.staff },
    pistol: { label: "Flintlock pistol", slot: "mainHand", model: "pistol", socket: "rightHand", grips: true, hold: HOLDS.pistol },
    bow: { label: "Longbow", slot: "offHand", model: "bow", socket: "leftHand", turn: [-1.1, 0, 0], grips: true, hold: HOLDS.bow },
    roundShield: { label: "Round shield", slot: "offHand", model: "roundShield", socket: "leftForearm", hold: HOLDS.shield, grips: true },
    kiteShield: { label: "Kite shield", slot: "offHand", model: "kiteShield", socket: "leftForearm", hold: HOLDS.shield, grips: true },
    nasalHelm: { label: "Nasal helm", slot: "head", model: "nasalHelm", socket: "head", hides: ["hair"] },
    orcHelm: { label: "Horned helm", slot: "head", model: "orcHelm", socket: "head", hides: ["hair"] },
    wizardHat: { label: "Wizard's hat", slot: "head", model: "wizardHat", socket: "head", hides: ["hair"] },
    backpack: { label: "Backpack", slot: "back", model: "backpack", socket: "back", garment: "straps" },
    quiver: { label: "Quiver", slot: "back", model: "quiver", socket: "back", turn: [0.25, 0, 0.5], offset: [0, 0.02, -0.04] },
    musket: { label: "Musket (slung)", slot: "back", model: "musket", socket: "back", turn: [0, 0, 2.5], offset: [0, 0, -0.03] },
    tusks: { label: "Tusks", slot: "face", model: "tusks", socket: "mouth" },
});

/** Every piece of equipment by id: { kind: "garment" | "item", slot, label, ... }. */
export const EQUIPMENT = Object.freeze(Object.fromEntries([
    ...Object.entries(GARMENTS).filter(([, garment]) => !garment.hidden).map(([id, garment]) => [id, { kind: "garment", ...garment }]),
    ...Object.entries(ITEMS).map(([id, item]) => [id, { kind: "item", ...item }]),
]));

/**
 * Where a socket is on a character's (rest-pose) body: { bone (name), position and quaternion
 * (in the bone's space), fit (sizes items need: headRadius, scale) }.
 */
export function socketOn(character, socket) {
    const { rig, human, positions } = character;
    const head = (name) => rig.heads[rig.index.get(name)];
    const frame = (name) => rig.frames[rig.index.get(name)];
    const face = faceFrame(human, positions);
    const fit = { headRadius: headRadius(character, face), scale: face.scale };

    switch (socket) {
        case "rightHand":
        case "leftHand": {
            // In the curled fingers, across the palm: items point along the thumb side (the hand's
            // anatomical +z), their edge along the fingers (-y)
            const side = socket === "leftHand" ? "Left" : "Right";
            const bone = `${side}Hand`;
            const hand = head(`${side}HandMiddle1`).distanceTo(head(bone));
            const palm = side === "Left" ? -1 : 1;
            const position = new THREE.Vector3(palm * 0.022 * face.scale, -hand * 1.05, 0.004).applyQuaternion(frame(bone));
            const quaternion = frame(bone).clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));

            return { bone, position, quaternion, fit };
        }
        case "leftForearm": {
            // Strapped to the outside of the forearm, facing out
            const bone = "LeftForeArm";
            const length = head("LeftHand").distanceTo(head(bone));
            const position = new THREE.Vector3(0.05 * face.scale, -length * 0.55, 0).applyQuaternion(frame(bone));
            const quaternion = frame(bone).clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));

            return { bone, position, quaternion, fit };
        }
        case "head": {
            const middle = new THREE.Vector3(...face.fromFace(0, 0.035, -0.068));

            return { bone: "Head", position: middle.sub(head("Head")), quaternion: new THREE.Quaternion(), fit };
        }
        case "mouth": {
            // Just inside the lower lip, wherever the jaw has moved it: the most forward point of
            // the face below the mouth, a little further in and up
            let lip = null;

            for (let v = 0; v < human.vertexCount; v++) {
                if (human.partOf[v] === 0) {
                    const [x, y, z] = face.toFace(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);

                    if (Math.abs(x) < 0.02 && y < -0.066 && y > -0.095 && (!lip || z > lip[2])) {
                        lip = [x, y, z];
                    }
                }
            }

            const mouth = new THREE.Vector3(...face.fromFace(0, (lip?.[1] ?? -0.08) + 0.004, (lip?.[2] ?? 0.03) - 0.012));

            return { bone: "Head", position: mouth.sub(head("Head")), quaternion: new THREE.Quaternion(), fit };
        }
        case "back": {
            // On the upper back, on the skin's surface
            const chest = head("Spine2");
            let back = Infinity;

            for (let v = 0; v < human.vertexCount; v++) {
                const y = positions[v * 3 + 1];

                if (human.partOf[v] === 0 && Math.abs(positions[v * 3]) < 0.04 && Math.abs(y - (chest.y + 0.02)) < 0.03) {
                    back = Math.min(back, positions[v * 3 + 2]);
                }
            }

            const position = new THREE.Vector3(0, chest.y - 0.02, back - 0.01).sub(chest);

            return { bone: "Spine2", position, quaternion: new THREE.Quaternion(), fit };
        }
        default:
            throw new Error(`No socket "${socket}"`);
    }
}

/** The head's radius round its upper half (for fitting helmets). */
function headRadius(character, face) {
    const { human, positions, rig } = character;
    const headBone = rig.index.get("Head");
    const centre = face.fromFace(0, 0.035, -0.068);
    let sum = 0;
    let count = 0;

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0 && human.skinIndices[v * 4] === headBone && positions[v * 3 + 1] > centre[1]) {
            sum += Math.hypot(positions[v * 3] - centre[0], positions[v * 3 + 1] - centre[1], positions[v * 3 + 2] - centre[2]);
            count++;
        }
    }

    return count ? sum / count : 0.1;
}
