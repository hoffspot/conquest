// Detail sliders for faces and physique, each made from MakeHuman's own detail shapes
// ("targets": github.com/makehumancommunity/mpfb2, CC0). A slider runs from -1 to 1: below 0 it
// blends in its "decrease" shapes, above 0 its "increase" shapes. Sliders on paired features
// (ears, cheeks, eyes, hands, feet) move both sides together.
//
// Pure data: used by the character engine and by the build script that packs the shapes.

const both = (name) => [`l-${name}`, `r-${name}`];
const each = (folder, names) => names.map((name) => `${folder}/${name}`);

/**
 * Every detail slider: its id, label, the group it belongs to, and its shapes below 0 (decr) and
 * above 0 (incr). One-way sliders (0 to 1) have no decr shapes.
 */
export const DETAILS = Object.freeze([
    // Head and face
    { id: "headSize", label: "Head size", group: "face", decr: each("head", ["head-scale-horiz-decr", "head-scale-vert-decr", "head-scale-depth-decr"]), incr: each("head", ["head-scale-horiz-incr", "head-scale-vert-incr", "head-scale-depth-incr"]) },
    { id: "headSquare", label: "Square head", group: "face", decr: each("head", ["head-oval"]), incr: each("head", ["head-square"]) },
    { id: "jawWidth", label: "Jaw width", group: "face", decr: each("chin", ["chin-width-decr"]), incr: each("chin", ["chin-width-incr"]) },
    { id: "underbite", label: "Underbite", group: "face", decr: each("chin", ["chin-prognathism-decr"]), incr: each("chin", ["chin-prognathism-incr"]) },
    { id: "chin", label: "Chin", group: "face", decr: each("chin", ["chin-prominent-decr"]), incr: each("chin", ["chin-prominent-incr"]) },
    { id: "cheekbones", label: "Cheekbones", group: "face", decr: each("cheek", both("cheek-bones-decr")), incr: each("cheek", both("cheek-bones-incr")) },
    { id: "browRidge", label: "Brow ridge", group: "face", decr: each("eyebrows", ["eyebrows-trans-backward"]), incr: [...each("eyebrows", ["eyebrows-trans-forward"]), ...each("forehead", ["forehead-nubian-incr"])] },
    { id: "browAngle", label: "Brow angle", group: "face", decr: each("eyebrows", ["eyebrows-angle-down"]), incr: each("eyebrows", ["eyebrows-angle-up"]) },
    { id: "eyeSize", label: "Eye size", group: "face", decr: each("eyes", both("eye-scale-decr")), incr: each("eyes", both("eye-scale-incr")) },
    { id: "noseWidth", label: "Nose width", group: "face", decr: each("nose", ["nose-scale-horiz-decr"]), incr: each("nose", ["nose-scale-horiz-incr", "nose-flaring-incr"]) },
    { id: "noseLength", label: "Nose length", group: "face", decr: each("nose", ["nose-scale-vert-decr"]), incr: each("nose", ["nose-scale-vert-incr"]) },
    { id: "noseHump", label: "Nose hump", group: "face", decr: each("nose", ["nose-hump-decr"]), incr: each("nose", ["nose-hump-incr"]) },
    { id: "noseTip", label: "Nose tip", group: "face", decr: each("nose", ["nose-point-down"]), incr: each("nose", ["nose-point-up"]) },
    { id: "mouthWidth", label: "Mouth width", group: "face", decr: each("mouth", ["mouth-scale-horiz-decr"]), incr: each("mouth", ["mouth-scale-horiz-incr"]) },
    { id: "lips", label: "Full lips", group: "face", decr: each("mouth", ["mouth-upperlip-volume-decr", "mouth-lowerlip-volume-decr"]), incr: each("mouth", ["mouth-upperlip-volume-incr", "mouth-lowerlip-volume-incr"]) },
    { id: "earSize", label: "Ear size", group: "face", decr: each("ears", both("ear-scale-decr")), incr: each("ears", both("ear-scale-incr")) },
    { id: "earPoint", label: "Pointed ears", group: "face", decr: [], incr: each("ears", both("ear-shape-pointed")) },
    { id: "earFlare", label: "Ears stick out", group: "face", decr: each("ears", both("ear-wing-decr")), incr: each("ears", both("ear-wing-incr")) },

    // Physique
    { id: "neck", label: "Neck thickness", group: "body", decr: each("neck", ["measure-neck-circ-decr"]), incr: each("neck", ["measure-neck-circ-incr"]) },
    { id: "shoulders", label: "Shoulder width", group: "body", decr: each("torso", ["measure-shoulder-dist-decr"]), incr: each("torso", ["measure-shoulder-dist-incr"]) },
    { id: "vShape", label: "V-shaped torso", group: "body", decr: each("torso", ["torso-vshape-decr"]), incr: each("torso", ["torso-vshape-incr"]) },
    { id: "belly", label: "Belly", group: "body", decr: each("stomach", ["stomach-pregnant-decr"]), incr: each("stomach", ["stomach-pregnant-incr"]) },
    { id: "armLength", label: "Arm length", group: "body", decr: each("arms", ["measure-upperarm-length-decr", "measure-lowerarm-length-decr"]), incr: each("arms", ["measure-upperarm-length-incr", "measure-lowerarm-length-incr"]) },
    { id: "legLength", label: "Leg length", group: "body", decr: each("legs", ["upperlegs-height-decr", "lowerlegs-height-decr"]), incr: each("legs", ["upperlegs-height-incr", "lowerlegs-height-incr"]) },
    { id: "handSize", label: "Hand size", group: "body", decr: each("hands", both("hand-scale-decr")), incr: each("hands", both("hand-scale-incr")) },
    { id: "footSize", label: "Foot size", group: "body", decr: each("feet", both("foot-scale-decr")), incr: each("feet", both("foot-scale-incr")) },
]);

/** Every detail shape any slider uses (for packing them at build time). */
export function allDetailTargetNames() {
    return [...new Set(DETAILS.flatMap(({ decr, incr }) => [...decr, ...incr]))];
}

/** The detail shapes to blend for these slider settings ({ id: -1 to 1 }): [{ name, weight }]. */
export function detailTargets(settings = {}) {
    const targets = [];

    for (const { id, decr, incr } of DETAILS) {
        const value = Math.max(-1, Math.min(1, settings[id] ?? 0));

        for (const name of value < 0 ? decr : value > 0 ? incr : []) {
            targets.push({ name, weight: Math.abs(value) });
        }
    }

    return targets;
}
