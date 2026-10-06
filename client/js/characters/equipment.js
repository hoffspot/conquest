// What characters can wear and carry, and where it goes.
//
// Every piece of equipment goes in a slot (one piece per slot, so a new helmet replaces the old
// one), in one of two ways:
//
//  - Garments (garments.js) are fitted to the body and skinned to its skeleton: clothing and
//    armour that bends with the body.
//  - Drapes (drapes.js) hang from the body: skirts, gowns and aprons, skinned to its skeleton
//    so they swing with the legs.
//  - Items (items.js) are rigid models on a socket: a point on a bone, placed from the body's
//    shape (the palm of the hand, the middle of the head, the upper back), so a sword sits in any
//    hand. An item can also bring a garment (a backpack's straps), hide parts of the body (a
//    helmet hides the hair) and change how its arm is held when walking (a shield, a staff).

import * as THREE from "three";
import { faceFrame } from "./face.js";
import { DRAPES } from "./drapes.js";
import { GARMENTS } from "./garments.js";
import { LIVERIES } from "./liveries.js";

/** The slots, in the order to show them. */
export const SLOTS = Object.freeze([
    { id: "head", label: "Head" },
    { id: "face", label: "Face" },
    { id: "neck", label: "Neck" },
    { id: "undershirt", label: "Under top" },
    { id: "shirt", label: "Shirt" },
    { id: "chest", label: "Chest" },
    { id: "armour", label: "Armour" },
    { id: "surcoat", label: "Surcoat" },
    { id: "forearms", label: "Forearms" },
    { id: "hands", label: "Hands" },
    { id: "waist", label: "Waist" },
    { id: "underwear", label: "Underwear" },
    { id: "legs", label: "Legs" },
    { id: "apron", label: "Apron" },
    { id: "shins", label: "Shins" },
    { id: "feet", label: "Feet" },
    { id: "cloak", label: "Cloak" },
    { id: "back", label: "Back" },
    { id: "ears", label: "Ears" },
    { id: "tail", label: "Tail" },
    { id: "mainHand", label: "Main hand" },
    { id: "offHand", label: "Off hand" },
]);

// A fist (the spiked gauntlets' hold, and a "fist" hand in a key pose: actions.js), as a real one
// closes: each finger curled into the palm in its own plane (rig.js), the four pressed together
// (`spread`: turned at the knuckles towards each other), their tips on the palm, and the thumb
// across the index and middle fingers' middle bones. Every finger alike (`fingers`: degrees at
// each joint), as each one's tip comes down on the palm so, on MakeHuman's body and Vitruvian's,
// the biggest and the smallest: further, they went through the palm and out of the back of the hand
export const FIST_HAND = Object.freeze({ fingers: [65, 75, 65], spread: [10, -4, -9, -14], thumb: [{ flex: 30, oppose: -15 }, { flex: 7 }, { flex: 63 }] });

// Arm poses for carrying things (anatomical angles, degrees), used instead of the arm's swing;
// and how far the fingers curl round what's held (`curl`: the index, middle, ring and little
// fingers, degrees at each joint; a wand is pinched; or a fist's, FIST_HAND) and how the thumb closes
// (`thumb`: its three joints, rig.js JOINTS.thumb; else over the fingers)
const HOLDS = {
    // (Carried at the side: the upper arm down and a little out, the forearm forward, thumb up, so
    // the shield hangs beside the body, its face out)
    shield: { Arm: { flex: 12, abduct: 20, rotate: 10 }, ForeArm: { flex: 80, pronate: 0 }, Hand: { flex: 10 }, swing: 0.15 },
    staff: { Arm: { flex: 12, abduct: 10, rotate: 10 }, ForeArm: { flex: 78, pronate: 0 }, Hand: { flex: -5, deviate: 10 }, swing: 0.25 },
    bow: { Arm: { flex: 5, abduct: 8 }, ForeArm: { flex: 20, pronate: 0 }, Hand: { flex: 0 }, swing: 0.5 },
    pistol: { Arm: { flex: 0, abduct: 8 }, ForeArm: { flex: 25, pronate: 10 }, Hand: { flex: 0, deviate: -10 }, swing: 0.6 },
    sword: { Arm: { flex: 0, abduct: 9 }, ForeArm: { flex: 20, pronate: 10 }, Hand: { flex: 0, deviate: -20 }, swing: 0.7 },
    wand: { Arm: { flex: 4, abduct: 8 }, ForeArm: { flex: 30, pronate: 15 }, Hand: { flex: 0, deviate: -10 }, swing: 0.6, curl: [24, 52, 68, 76], thumb: [{ flex: 35, oppose: 15 }, { flex: 20 }, { flex: 15 }] },
    hammer: { Arm: { flex: 10, abduct: 12, rotate: 10 }, ForeArm: { flex: 72, pronate: 0 }, Hand: { flex: -5, deviate: 8 }, swing: 0.2 },
    book: { Arm: { flex: 22, abduct: 10, rotate: 10 }, ForeArm: { flex: 88, pronate: -80 }, Hand: { flex: -8, deviate: 0 }, swing: 0.12 },
    fist: { Arm: { flex: 4, abduct: 10 }, ForeArm: { flex: 38, pronate: 20 }, Hand: { flex: 0 }, swing: 0.7, ...FIST_HAND },
    tankard: { Arm: { flex: 12, abduct: 8, rotate: 5 }, ForeArm: { flex: 88, pronate: -5 }, Hand: { flex: 0, deviate: 12 }, swing: 0.15 },
    tongs: { Arm: { flex: 10, abduct: 8, rotate: 5 }, ForeArm: { flex: 60, pronate: 10 }, Hand: { flex: 0, deviate: 5 }, swing: 0.2 },
};

/**
 * Where weapons are put away (`sheath`): on a socket (a hip, the back), where the grip goes from
 * it (`at`, metres: x to the character's left, y up, z forward) and which ways the item's point
 * (`point`: along its grip, towards the blade or head) and edge (`edge`) face; what it hangs in
 * (`holder`: a scabbard, always there) and what it needs worn to hang from (`garment`: a belt, a
 * strap across the chest); and how it looks put away, if not as in hand (`model`: a closed book).
 * Worn weapons (`worn`: spiked gauntlets) stay on, the hands just open.
 */
const SHEATHS = {
    // (At the left hip, hung from its frog on the belt round the front of the hip, the scabbard's
    // mouth against the belt just under it, canted as a sword's worn: the hilt up and forward
    // across the front of the hip, in from the arm hanging beside it, where the right hand
    // crossing in front of the belly takes it; the blade down and back at 45°, leaning out a
    // little, past the thigh to behind the calf; the frog as far off the belt as keeps it off that
    // body, swung back as the leg pushes it and held further back by a hand on its pommel:
    // Character.hang; seated, pushed back by the seat to the side of the hip, `seated`)
    sword: { socket: "leftFrog", round: 50, at: [0.008, 0.028, 0.078], point: [0.15, -0.7, -0.7], edge: [0, -0.7, 0.7], holder: "scabbard", garment: "belt", hangs: true, seated: [0.1, -0.08, -0.16] },
    // (At the left hip too, as a messer was worn: hung from a ring on the belt round the front of
    // the hip, the grip forward, the blade down and back past the thigh, its edge forward, hung
    // and swung as the sword is)
    cleaver: { socket: "leftFrog", round: 28, at: [0.008, 0.028, 0.078], point: [0.15, -0.7, -0.7], edge: [0, -0.7, 0.7], garment: "belt", hangs: true, seated: [0.1, -0.08, -0.16] },
    // (Tucked in the belt at the right hip, the tip down)
    wand: { socket: "rightHip", at: [-0.03, 0.05, 0.03], point: [-0.06, -1, -0.12], edge: [0, -0.12, 1], garment: "belt" },
    // (Closed, hanging flat at the left hip, its spine down)
    grimoire: { socket: "leftHip", at: [0.045, -0.07, -0.07], point: [0, 0, 1], edge: [0, -1, 0], model: "grimoireClosed", garment: "belt" },
    // (On the back, slung from the right shoulder: the grip up behind it at about the ear, where
    // a hand reaching up over the shoulder takes it without the elbow folding further than it
    // can, the staff's crystal and the hammer's head down across the back to the left hip; the
    // staff and the hammer angled a little off the back, clear of the buttocks as the back arches)
    staff: { socket: "back", at: [-0.2, 0.28, 0.02], point: [0.28, -0.92, -0.26], edge: [0, 0, 1], garment: "baldric" },
    hammer: { socket: "back", at: [-0.2, 0.28, 0.01], point: [0.28, -0.92, -0.27], edge: [0.95, 0.3, 0], garment: "baldric" },
    // (On the back across the quiver, the grip up behind the left shoulder for the left hand, a
    // limb up past it, the other down to the right hip)
    bow: { socket: "back", at: [0.15, 0.22, -0.08], point: [-0.28, -0.96, -0.06], edge: [0, 0, 1], garment: "baldric" },
    worn: { worn: true },
};

// How far round the front of the hip from its side (degrees) a scabbard's frog hangs it on the
// belt (socketOn: "leftFrog"; a sheath's own `round`, else this)
const FROG_ROUND = 35;

// The peoples whose shields are round, held by a grip behind the boss (items.js)
const ROUND_SHIELDS = new Set(["orc", "lizard"]);

/**
 * A shield slung on the back while the weapons are put away (an item's `sling`: Character.sling,
 * the left hand taking it over the left shoulder, actions.js DRAWS.sling), hung from its strap
 * across the chest (`garment`): its back to the upper back, the middle of its top `top` metres
 * above the back's socket (about the shoulders) and `off` off the skin, leaning out at the bottom
 * (`lean`, radians) clear of the buttocks; `over` further off over what else is on the back (a
 * quiver, a pack). Between the arm and the back it swings round the left side, out of the body's
 * way: out to the left and forward from the arm, and round from behind onto the back (`swing`,
 * metres to the left, up and forward: how far it heads off each way at each end). Each
 * shield says whether it can be slung: round and kite shields, and the
 * elves' leaf, were carried so on the march, by their strap (the guige); not the cat folk's
 * (hide on a stick, carried by the stick, with no strap to sling it by), nor the dark elves'
 * long kite (spikes round its rim, that would gash the arms swinging past them, and it'd reach
 * past the backs of the knees), nor a tower shield, were there one. A new shield says too.
 */
export const SLING = Object.freeze({ socket: "back", top: 0.23, off: 0.065, lean: 0.2, over: 0.1, garment: "baldric", swing: { arm: [0.7, -0.25, 0.2], back: [0.5, 0.05, -0.55] } });

// The peoples whose shields can be slung (SLING)
const SLUNG_SHIELDS = new Set(["human", "elf", "orc", "lizard"]);

/**
 * Items: slot, model (items.js), socket, an extra turn in the socket (Euler angles, radians: a
 * hilt or haft lies across the fist diagonally, along the palm's crease from the index finger's
 * knuckle to the heel of the hand, so a blade leans towards the fingers; a wand is pinched,
 * pointing along them),
 * the hold pose for its arm, whether the hand grips it, what it hides and brings; and for a
 * two-handed haft, where along it the other hand holds it (`haft`: metres along its y from the
 * grip, from and to: a quarterstaff's hands about shoulder width apart, a war hammer's rear hand
 * at the end of the handle).
 */
export const ITEMS = Object.freeze({
    sword: { label: "Arming sword", slot: "mainHand", model: "sword", socket: "rightHand", turn: [0.9, 0, 0], grips: true, hold: HOLDS.sword, sheath: SHEATHS.sword },
    staff: { label: "Mage's staff", slot: "mainHand", model: "staff", socket: "rightHand", turn: [0.25, 0, 0], grips: true, hold: HOLDS.staff, haft: [-0.7, -0.3], sheath: SHEATHS.staff },
    wand: { label: "Wand", slot: "mainHand", model: "wand", socket: "rightHand", turn: [1.45, 0, 0], grips: true, hold: HOLDS.wand, sheath: SHEATHS.wand },
    warHammer: { label: "War hammer", slot: "mainHand", model: "warHammer", socket: "rightHand", turn: [0.25, 0, 0], grips: true, hold: HOLDS.hammer, haft: [-0.22, -0.16], sheath: SHEATHS.hammer },
    cleaver: { label: "Orc cleaver", slot: "mainHand", model: "cleaver", socket: "rightHand", turn: [0.7, 0, 0], grips: true, hold: HOLDS.sword, sheath: SHEATHS.cleaver },
    spikedGauntlets: { label: "Spiked gauntlets", slot: "mainHand", model: "knuckleSpikes", socket: "rightHand", grips: true, hold: HOLDS.fist, garment: "gauntlets", sheath: SHEATHS.worn },
    spikedGauntletLeft: { label: "Spiked gauntlet (left)", slot: "offHand", model: "knuckleSpikes", socket: "leftHand", grips: true, hold: HOLDS.fist, sheath: SHEATHS.worn },
    // (Iron on both feet: over the toes, round the heels and down the shins, each on its bone)
    spikedBoots: {
        label: "Spiked boots",
        slot: "feet",
        garment: "spikedBootLeather",
        parts: ["right", "left"].flatMap((side) => [
            { model: "toeSpike", socket: `${side}Toe` },
            { model: "heelSpur", socket: `${side}Heel` },
            { model: "shinPlate", socket: `${side}Shin` },
        ]),
    },
    grimoire: { label: "Grimoire", slot: "offHand", model: "grimoire", socket: "leftHand", hold: HOLDS.book, sheath: SHEATHS.grimoire },
    pistol: { label: "Flintlock pistol", slot: "mainHand", model: "pistol", socket: "rightHand", grips: true, hold: HOLDS.pistol },
    bow: { label: "Longbow", slot: "offHand", model: "bow", socket: "leftHand", turn: [0.4, 0, 0], grips: true, hold: HOLDS.bow, sheath: SHEATHS.bow },
    roundShield: { label: "Round shield", slot: "offHand", model: "roundShield", socket: "leftFist", hold: HOLDS.shield, grips: true, sling: true },
    kiteShield: { label: "Kite shield", slot: "offHand", model: "kiteShield", socket: "leftForearm", hold: HOLDS.shield, grips: true, sling: true },
    nasalHelm: { label: "Nasal helm", slot: "head", model: "nasalHelm", socket: "head", hides: ["hair"] },
    orcHelm: { label: "Horned helm", slot: "head", model: "orcHelm", socket: "head", hides: ["hair"] },
    wizardHat: { label: "Wizard's hat", slot: "head", model: "wizardHat", socket: "head", hides: ["hair"] },
    crown: { label: "Crown", slot: "head", model: "crown", socket: "head" },
    leatherCap: { label: "Leather cap", slot: "head", model: "leatherCap", socket: "head", hides: ["hair"] },
    // Each people's helm and shield, in their colours (liveries.js: their soldiers' uniform)
    ...Object.fromEntries(Object.keys(LIVERIES).flatMap((people) => [
        [`helm.${people}`, { label: "Helm", slot: "head", model: `helm.${people}`, socket: "head", hides: ["hair"] }],
        [`shield.${people}`, { label: "Shield", slot: "offHand", model: `shield.${people}`, socket: ROUND_SHIELDS.has(people) ? "leftFist" : "leftForearm", hold: HOLDS.shield, grips: true, sling: SLUNG_SHIELDS.has(people) }],
    ])),
    backpack: { label: "Backpack", slot: "back", model: "backpack", socket: "back", garment: "straps" },
    quiver: { label: "Quiver", slot: "back", model: "quiver", socket: "back", turn: [0.25, 0, 0.35], offset: [-0.03, 0.02, -0.085] },
    musket: { label: "Musket (slung)", slot: "back", model: "musket", socket: "back", turn: [0, 0, 2.5], offset: [0, 0, -0.03] },
    tusks: { label: "Tusks", slot: "face", model: "tusks", socket: "mouth" },
    // The other peoples' own (characters/peoples.js), in the colour of their skin or fur
    // (`tinted`): cat folk's ears on top of their heads, their tails, and lizard folk's; a tail
    // sways as they go (`sway`: how far)
    catEars: { label: "Cat's ears", slot: "ears", tinted: true, parts: [{ model: "catEar", socket: "leftEar" }, { model: "catEar", socket: "rightEar" }] },
    catTail: { label: "Cat's tail", slot: "tail", model: "catTail", socket: "tail", tinted: true, sway: 0.35 },
    lizardTail: { label: "Lizard's tail", slot: "tail", model: "lizardTail", socket: "tail", tinted: true, sway: 0.15 },
    tankard: { label: "Tankard of ale", slot: "mainHand", model: "tankard", socket: "rightHand", grips: true, hold: HOLDS.tankard },
    // A smith's tools: the hammer in the right hand, the tongs in the left
    smithHammer: { label: "Smith's hammer", slot: "mainHand", model: "smithHammer", socket: "rightHand", grips: true, hold: HOLDS.hammer },
    // (The tongs' reins across the palm from its heel, so their jaws point along the forearm)
    tongs: { label: "Tongs", slot: "offHand", model: "tongs", socket: "leftHand", turn: [1.1, 0, 0], grips: true, hold: HOLDS.tongs },
});

/** Every piece of equipment by id: { kind: "garment" | "drape" | "item", slot, label, ... }. */
export const EQUIPMENT = Object.freeze(Object.fromEntries([
    ...Object.entries(GARMENTS).filter(([, garment]) => !garment.hidden).map(([id, garment]) => [id, { kind: "garment", ...garment }]),
    ...Object.entries(DRAPES).map(([id, drape]) => [id, { kind: "drape", ...drape }]),
    ...Object.entries(ITEMS).map(([id, item]) => [id, { kind: "item", ...item }]),
]));

/**
 * Where a socket is on a character's (rest-pose) body: { bone (name), position and quaternion
 * (in the bone's space), fit (sizes items need: headRadius, scale) }.
 */
export function socketOn(character, socket, { round = null } = {}) {
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
        case "leftForearm":
        case "leftFist": {
            // Strapped to the outside of the forearm, facing out, standing off it by its straps and
            // the pad the arm rests on: as far as the upper arm is thick and a hand's breadth more
            // (the upper arm, bent up behind it that far off, clears it). A round shield's held by
            // its grip behind the boss, its middle over the fist; a kite's by straps along the forearm
            const bone = "LeftForeArm";
            const length = head("LeftHand").distanceTo(head(bone));
            const along = socket === "leftFist" ? 1.05 : 0.55;
            const position = new THREE.Vector3(limbThickness(character, "LeftArm", "LeftForeArm") + 0.045 * face.scale, -length * along, 0).applyQuaternion(frame(bone));
            const quaternion = frame(bone).clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));

            return { bone, position, quaternion, fit };
        }
        case "leftHip":
        case "rightHip":
        case "leftFrog":
        case "rightFrog": {
            // On the belt (garments.js: a hand's breadth below the waist), for things hung from
            // it: on the outside of the hip, or (a scabbard's frog) round the front of the hip from
            // there (FROG_ROUND); as far out that way as the trunk's skin there goes, and the belt
            const left = socket.startsWith("left");
            const turned = socket.endsWith("Frog") ? ((round ?? FROG_ROUND) * Math.PI) / 180 : 0;
            const [outX, outZ] = [(left ? 1 : -1) * Math.cos(turned), Math.sin(turned)];
            const belt = head("Spine").y - 0.048 * (character.height / 1.7);
            const trunk = new Set(["Hips", "Spine", "LeftUpLeg", "RightUpLeg"].map((name) => rig.index.get(name)));
            let best = null;

            for (let v = 0; v < human.vertexCount; v++) {
                const y = positions[v * 3 + 1];

                // (The trunk's skin, not the hands hanging beside it)
                if (human.partOf[v] === 0 && trunk.has(human.skinIndices[v * 4]) && Math.abs(y - belt) < 0.02) {
                    const [x, z] = [positions[v * 3], positions[v * 3 + 2]];
                    const out = x * outX + z * outZ;

                    if (!best || out > best.out) {
                        best = { out, x, z };
                    }
                }
            }

            const position = new THREE.Vector3(best.x + outX * 0.014, belt, best.z + outZ * 0.014).sub(head("Hips"));

            // (`out`: the way off the body there, along the ground)
            return { bone: "Hips", position, quaternion: new THREE.Quaternion(), fit, out: new THREE.Vector3(outX, 0, outZ) };
        }
        case "rightToe":
        case "leftToe":
        case "rightHeel":
        case "leftHeel":
        case "rightShin":
        case "leftShin": {
            // On the outside of the foot's skin (and the boot's leather over it): over the tips
            // of the toes; round the back of the heel, a little above the sole; down the front
            // of the shin, a little above the ankle
            const Side = socket.startsWith("left") ? "Left" : "Right";
            const part = socket.slice(Side.length);
            const bone = `${Side}${{ Toe: "ToeBase", Heel: "Foot", Shin: "Leg" }[part]}`;
            const extent = boneExtent(character, part === "Toe" ? [`${Side}Foot`, `${Side}ToeBase`] : [bone], part === "Toe" ? (y, z) => z : part === "Heel" ? (y, z) => (y < 0.07 * face.scale ? -z : -Infinity) : null);
            let position;

            if (part === "Toe") {
                const toe = head(`${Side}ToeBase`);

                position = new THREE.Vector3(extent.x, toe.y + 0.004, extent.z - 0.012 * face.scale).sub(toe);
            } else if (part === "Heel") {
                position = new THREE.Vector3(extent.x, 0.045 * face.scale, extent.z - 0.01).sub(head(bone));
            } else {
                // A third of the way up from the ankle to the knee, on the front of the shin
                const knee = head(bone);
                const ankle = head(`${Side}Foot`);
                const y = ankle.y + (knee.y - ankle.y) * 0.4;
                const front = boneExtent(character, [bone], (vy, z) => (Math.abs(vy - y) < 0.03 ? z : -Infinity));

                position = new THREE.Vector3(front.x, y, front.z + 0.012).sub(knee);
            }

            return { bone, position, quaternion: new THREE.Quaternion(), fit };
        }
        case "head": {
            const middle = new THREE.Vector3(...face.fromFace(0, 0.035, -0.068));
            const skull = skullOf(character, middle, fit.headRadius);

            return { bone: "Head", position: middle.sub(head("Head")), quaternion: new THREE.Quaternion(), fit: { ...fit, skull } };
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
        case "leftEar":
        case "rightEar": {
            // On top of the head, to one side, a little behind the crown (a cat's ears): the model
            // leans out to its side (`fit.side`: 1 the character's left)
            const side = socket === "leftEar" ? 1 : -1;
            const at = new THREE.Vector3(...face.fromFace(side * 0.047, 0.1, -0.06));

            return { bone: "Head", position: at.sub(head("Head")), quaternion: new THREE.Quaternion(), fit: { ...fit, side } };
        }
        case "tail": {
            // At the base of the spine, on the skin: the backmost point of the body's middle,
            // just above the buttocks
            const hips = head("Hips");
            let back = Infinity;

            for (let v = 0; v < human.vertexCount; v++) {
                const y = positions[v * 3 + 1];

                if (human.partOf[v] === 0 && Math.abs(positions[v * 3]) < 0.025 && y > hips.y + 0.01 && y < hips.y + 0.06) {
                    back = Math.min(back, positions[v * 3 + 2]);
                }
            }

            const position = new THREE.Vector3(0, hips.y + 0.035, back + 0.012).sub(hips);

            return { bone: "Hips", position, quaternion: new THREE.Quaternion(), fit };
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

/**
 * The furthest point of some bones' skin (what each moves most) by `score(y, z)` (the highest
 * wins; none: the middle of it), in the body's rest pose, at the middle of it across: { x, y, z }.
 */
function boneExtent(character, boneNames, score = null) {
    const { human, positions, rig } = character;
    const bones = new Set(boneNames.map((name) => rig.index.get(name)));
    let best = null;
    let bestScore = -Infinity;
    const sum = [0, 0, 0];
    let count = 0;

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] === 0 && bones.has(human.skinIndices[v * 4])) {
            const [x, y, z] = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];

            sum[0] += x;
            sum[1] += y;
            sum[2] += z;
            count++;

            const value = score ? score(y, z) : -Infinity;

            if (value > bestScore) {
                bestScore = value;
                best = { x, y, z };
            }
        }
    }

    const middle = { x: sum[0] / count, y: sum[1] / count, z: sum[2] / count };

    return best ? { ...best, x: middle.x } : middle;
}

/**
 * How thick a limb is along a bone (`bone` to `end`, the next bone down it: metres from the bone
 * to its skin, as far as it goes round most of its middle half, the joints aside, or of the
 * shares along it `between`): a strong arm's, or an orc's, more than a slight one's.
 */
export function limbThickness(character, name, endName, between = [0.25, 0.75]) {
    const { human, positions, rig } = character;
    const bone = rig.index.get(name);
    const [from, to] = [rig.heads[bone], rig.heads[rig.index.get(endName)]];
    const along = to.clone().sub(from);
    const length = along.length();
    const point = new THREE.Vector3();
    const reach = [];

    along.normalize();

    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] !== 0 || human.skinIndices[v * 4] !== bone) {
            continue;
        }

        point.fromArray(positions, v * 3).sub(from);

        const t = point.dot(along);

        if (t > length * between[0] && t < length * between[1]) {
            reach.push(point.addScaledVector(along, -t).length());
        }
    }

    reach.sort((a, b) => a - b);

    return reach.length ? reach[Math.floor(reach.length * 0.9)] : 0.05;
}

/**
 * How far a head reaches behind its middle (`middle`, where head-wear sits) and before it at each
 * height, near the line down the middle of it (not the ears), and how high it reaches: { at: [[y,
 * back, front]...] (metres from the middle, every 5 mm from a little below it), top }, for
 * head-wear to clear it (items.js).
 */
function skullOf(character, middle, radius) {
    const { human, positions } = character;
    const STEP = 0.005;
    const from = -0.3 * radius;
    const back = [];
    const front = [];
    let top = 0;

    // (The body's skin up there, whichever bones move it: the head's, and the neck's under the rim)
    for (let v = 0; v < human.vertexCount; v++) {
        if (human.partOf[v] !== 0 || positions[v * 3 + 1] - middle.y < from) {
            continue;
        }

        const [x, y, z] = [positions[v * 3] - middle.x, positions[v * 3 + 1] - middle.y, positions[v * 3 + 2] - middle.z];

        top = Math.max(top, y);

        if (Math.abs(x) < 0.35 * radius) {
            const k = Math.floor((y - from) / STEP);

            back[k] = Math.max(back[k] ?? 0, -z);
            front[k] = Math.max(front[k] ?? 0, z);
        }
    }

    return { at: Array.from({ length: Math.max(back.length, front.length) }, (_, k) => [from + (k + 0.5) * STEP, back[k] ?? 0, front[k] ?? 0]), top };
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
