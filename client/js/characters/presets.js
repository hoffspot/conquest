// Ready-made characters: the player's human (male or female) and the orc enemy. Each is a body
// shape, a look, equipment and a way of walking, all of which can be changed after.
//
// The orc is the same body and skeleton as the human, pushed to the limits: huge muscle, a broad
// square head with a jutting jaw, heavy brow and pointed ears, green warty skin and war paint,
// yellow eyes, tusks, and a hunched, heavy-footed walk (WALK_STYLES.orc).

import { HAIR_COLOURS, SKIN_TONES } from "./skin.js";

export const PRESETS = Object.freeze({
    hero: {
        label: "Human",
        shape: {
            macro: { gender: 1, muscle: 0.62, weight: 0.45, height: 0.56, african: 0.2, asian: 0.2, caucasian: 0.6 },
            details: { jawWidth: 0.3, chin: 0.2, browRidge: 0.2, shoulders: 0.2, vShape: 0.3, neck: 0.2 },
        },
        look: {
            skin: { tone: SKIN_TONES.light, blush: 0.45, brows: 0.65 },
            eyes: { iris: "#5a6f7e" },
            hair: { style: "short", beard: "stubble", colour: HAIR_COLOURS.darkBrown },
        },
        equipment: ["briefs", "shirt", "trousers", "boots", "belt", "jerkin", "sword", "roundShield"],
        walk: "natural",
    },
    heroine: {
        label: "Heroine",
        shape: {
            macro: { gender: 0, muscle: 0.55, weight: 0.42, height: 0.55, african: 0.3, asian: 0.2, caucasian: 0.5 },
            details: { cheekbones: 0.3, lips: 0.2, noseWidth: -0.2 },
        },
        look: {
            skin: { tone: SKIN_TONES.olive, blush: 0.5, brows: 0.5, freckles: 0.3 },
            eyes: { iris: "#4f6b3a" },
            hair: { style: "ponytail", beard: "none", colour: HAIR_COLOURS.auburn },
        },
        equipment: ["briefs", "chestWrap", "tunic", "breeches", "boots", "belt", "bracers", "bow", "quiver"],
        walk: "natural",
    },
    orc: {
        label: "Orc",
        shape: {
            macro: { gender: 1, muscle: 1, weight: 0.88, height: 0.68, african: 0.45, asian: 0.2, caucasian: 0.35 },
            details: {
                underbite: 1,
                jawWidth: 1,
                chin: 0.5,
                browRidge: 1,
                browAngle: -0.7,
                headSquare: 0.8,
                cheekbones: 0.7,
                eyeSize: -0.6,
                noseWidth: 1,
                noseLength: -0.5,
                noseHump: -0.6,
                noseTip: 0.7,
                mouthWidth: 0.6,
                lips: 0.5,
                earPoint: 1,
                earSize: 0.5,
                earFlare: 0.7,
                neck: 1,
                shoulders: 0.9,
                vShape: 0.7,
                belly: 0.2,
                armLength: 0.5,
                handSize: 0.7,
                footSize: 0.4,
            },
        },
        look: {
            skin: { tone: SKIN_TONES.orc, variation: 1.8, blush: 0.25, warts: 0.6, veins: 0.35, brows: 0.95, browColour: "#15130c", lips: "#4d5a33", warpaint: "#2b1712" },
            eyes: { iris: "#d4a21c", sclera: "#ded2a0", pupil: 0.24 },
            hair: { style: "topknot", beard: "none", colour: HAIR_COLOURS.black },
        },
        equipment: ["loincloth", "breeches", "bracers", "belt", "tusks", "sabatons"],
        walk: "orc",
    },
});
