// Houses of any size in four styles, each variant a little different: whitewashed cottages with
// thatched roofs, timber-framed houses, brick houses (after LPC's brick house) and stone
// buildings. Every house has its door and windows on its south side, the side the camera sees.
//
// Sizes are in the art's world pixels, five to a metre: a door is 2 metres tall, a storey about
// 3.5, so people 1.7 metres tall look right beside them.

import { createRandom } from "../../../core/random.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";

const CELL = 20;

// Each style's materials, how likely a hipped roof is, how steep roofs are (their height over
// their span) and how high the walls of one storey are (a second adds TWO_STOREYS as much again)
const STYLES = {
    cottage: { walls: ["plaster", "plaster-white", "plaster-ochre", "plaster-rose"], roofs: ["thatch", "thatch", "thatch-grey"], plinth: "stone-warm", beams: false, hipped: 0.5, pitch: [0.55, 0.65], storey: [16, 18] },
    timber: { walls: ["plaster", "plaster-white", "plaster-ochre"], roofs: ["slate", "clay", "shingles", "clay-orange"], plinth: "stone", beams: true, hipped: 0.15, pitch: [0.5, 0.6], storey: [17, 19] },
    brick: { walls: ["brick", "brick-brown"], roofs: ["slate", "slate-grey", "clay"], plinth: "stone", beams: false, hipped: 0.5, pitch: [0.42, 0.52], storey: [17, 20], quoins: true, chimney: 0.9 },
    stone: { walls: ["stone", "stone-warm"], roofs: ["slate-grey", "slate", "clay", "shingles"], plinth: "stone-dark", beams: false, hipped: 0.3, pitch: [0.45, 0.55], storey: [17, 20], chimney: 0.6 },
};

const TWO_STOREYS = 1.65;

// The stone plinth the walls stand on, and the door (world pixels)
const PLINTH = 2;
const DOOR = { width: 6, height: 10 };

const seedOf = (text) => [...text].reduce((total, character) => (Math.imul(total, 31) + character.charCodeAt(0)) >>> 0, 17);

// A window on the south face at (x, y), `z` being the face
function window(solid, x, y, z, width, height, frame) {
    solid.box(x - width / 2 - 1, y - 1, z, x + width / 2 + 1, y + height + 1, z + 0.5, material(frame));
    solid.box(x - width / 2, y, z + 0.5, x + width / 2, y + height, z + 0.8, material("glass"));
    solid.box(x - 0.4, y, z + 0.8, x + 0.4, y + height, z + 1, material(frame));
    solid.box(x - width / 2 - 1.5, y - 2, z, x + width / 2 + 1.5, y - 1, z + 1.5, material(frame));
}

// Timber framing on the south face: posts, a rail at each floor, and braces
function framing(solid, x0, x1, z, top) {
    const beam = material("timber");
    const posts = Math.max(2, Math.round((x1 - x0) / 9));

    for (let i = 0; i <= posts; i++) {
        const x = x0 + ((x1 - x0) * i) / posts;

        solid.box(x - 0.8, 0, z, x + 0.8, top, z + 0.7, beam);
    }

    solid.box(x0, top - 1.6, z, x1, top, z + 0.7, beam);
    solid.box(x0, top * 0.48, z, x1, top * 0.48 + 1.4, z + 0.7, beam);
}

/** A house filling a w x h footprint (grid squares), in a style, looking like its variant. */
export function house({ w, h, style, variant }) {
    const random = createRandom(seedOf(`${w}x${h}-${style}-${variant}`));
    const look = STYLES[style];
    const solid = new Solid();
    const walls = material(random.pick(look.walls));
    const roofMaterial = material(random.pick(look.roofs));
    const inset = 3;
    const x0 = inset;
    const z0 = inset + (h > 2 ? random.int(0, 2) : 0);
    const x1 = w * CELL - inset;
    const z1 = h * CELL - inset - (h > 2 ? random.int(0, 2) : 0);
    const storeys = w * h >= 9 && random.chance(0.5) ? 2 : 1;
    const top = random.range(...look.storey) * (storeys === 2 ? TWO_STOREYS : 1);
    const ridge = w > h ? "x" : h > w ? "z" : variant % 2 ? "z" : "x";
    const span = ridge === "x" ? z1 - z0 : x1 - x0;
    const pitch = span * random.range(...look.pitch);
    const hipped = random.chance(look.hipped);
    const overhang = style === "cottage" ? 3 : 2;

    // Foundations and walls
    solid.box(x0 - 0.8, 0, z0 - 0.8, x1 + 0.8, PLINTH, z1 + 0.8, material(look.plinth));
    solid.box(x0, PLINTH, z0, x1, top, z1, walls);

    if (look.quoins) {
        const quoin = material("stone-warm");

        for (let y = PLINTH, i = 0; y < top - 2; y += 3.5, i++) {
            const long = i % 2 ? 3.5 : 2;

            for (const x of [x0, x1]) {
                solid.box(x === x0 ? x - 0.5 : x - long, y, z1 - 0.5, x === x0 ? x + long : x + 0.5, y + 3, z1 + 0.6, quoin);
            }
        }
    }

    // The roof, overhanging the walls
    solid.roof(x0 - overhang, z0 - overhang, x1 + overhang, z1 + overhang, top, pitch, { ridge, hipped, material: roofMaterial, gable: walls });

    // A ridge capping along a gabled roof
    if (!hipped) {
        const cap = material("ridge");

        if (ridge === "x") {
            solid.box(x0 - overhang, top + pitch - 0.8, (z0 + z1) / 2 - 1, x1 + overhang, top + pitch + 0.8, (z0 + z1) / 2 + 1, cap);
        } else {
            solid.box((x0 + x1) / 2 - 1, top + pitch - 0.8, z0 - overhang, (x0 + x1) / 2 + 1, top + pitch + 0.8, z1 + overhang, cap);
        }
    }

    if (look.beams) {
        framing(solid, x0, x1, z1, top);
    }

    // The door, and windows either side of it
    const frame = style === "brick" || style === "stone" ? "plaster-white" : "timber";
    const door = x0 + (x1 - x0) * random.range(0.3, 0.7);
    const doorWidth = DOOR.width;
    const doorTop = PLINTH + DOOR.height;

    solid.box(door - doorWidth / 2 - 1, PLINTH, z1, door + doorWidth / 2 + 1, doorTop + 1, z1 + 0.5, material(frame));
    solid.box(door - doorWidth / 2, PLINTH, z1 + 0.5, door + doorWidth / 2, doorTop, z1 + 1, material("planks-dark"));
    solid.box(door - doorWidth / 2 - 1, 0, z1, door + doorWidth / 2 + 1, PLINTH, z1 + 2.5, material(look.plinth));

    // Windows 1 metre square, their sills 1.2 metres up (and upstairs, 1 metre above the floor)
    const windowY = storeys === 2 ? [6, top / TWO_STOREYS + 5] : [6];

    for (const y of windowY) {
        for (let x = x0 + 6; x <= x1 - 6; x += 11) {
            if (y > doorTop || Math.abs(x - door) > doorWidth / 2 + 5) {
                window(solid, x, y, z1, 5, style === "stone" ? 6 : 5, frame);
            }
        }
    }

    // A chimney poking through the roof near one end
    if (random.chance(look.chimney ?? 0.35)) {
        const chimney = material(style === "stone" ? "stone" : "brick");
        const along = random.chance(0.5) ? 0.22 : 0.78;
        const cx = ridge === "x" ? x0 + (x1 - x0) * along : (x0 + x1) / 2 + span * 0.2;
        const cz = ridge === "x" ? (z0 + z1) / 2 - span * 0.18 : z0 + (z1 - z0) * along;

        solid.box(cx - 2.5, top, cz - 2.5, cx + 2.5, top + pitch + 6, cz + 2.5, chimney);
        solid.box(cx - 3, top + pitch + 6, cz - 3, cx + 3, top + pitch + 7.5, cz + 3, material("stone-dark"));
    }

    return solid.toObject();
}
