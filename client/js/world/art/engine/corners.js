// What's merged into the art's one material (town3d.js partsOf: the buildings, the props, the
// insides) in fewer bytes on the graphics card, and on the page till it's sent. A corner was 48
// bytes (where it is, which way it faces, its place in its picture, its colour and its layer, all
// 32-bit floats), and every triangle had three of its own, though a wall's two triangles share two
// corners and a box's faces four each: at the human capital 871,000 corners, 40 MB, of which a
// little over half were unlike any other.
// - Which way a corner faces is kept in three signed bytes (and a fourth, nothing: four bytes a
//   corner, as graphics cards read them without copying them first), not three floats. The lit
//   shaders make it a unit long again, so only its direction counts, and of the directions three
//   bytes can say a near one is looked for (byteNormal): a thirtieth of a degree off on average
//   and never a third, where each side rounded on its own is a sixth off on average. A wall's, a
//   floor's and a roof's at 45 degrees are exact.
// - Corners alike in everything are kept once, and the triangles say which they're drawn from
//   (an index), in the order they were: the same triangles, drawn in the same order.
// Its colour stays in floats: some are over 1 (a tint's), which a byte can't say, and the
// darkest are near 0, where a byte's steps are a quarter of the colour itself and soot and slate
// would come out blotched. Its layer stays a float too: with its shine and its window's seed it's
// up to 33,000, and four bytes whatever it's kept in.

import * as THREE from "three";

// How many whole numbers a corner's kept as, to tell it from the others: where it is (3), which
// way it faces (1: its four bytes), its place in its picture (2), its colour (3) and its layer (1)
const WORDS = 10;

// How many lengths are tried for a normal's bytes: its longest side each whole number from 127 down
const SCALES = 64;

const _bytes = new Int8Array(4);

/**
 * The three signed bytes (-127 to 127, read by the graphics card as -1 to 1) nearest in direction
 * to a vector, written into `into` at `at` (the fourth left 0); not only the vector a unit long
 * with each side rounded on its own, but whichever of the vectors three bytes can hold points most
 * nearly the same way, the shaders making it a unit long again. Nothing for a vector of no length.
 */
export function byteNormal(x, y, z, into = _bytes, at = 0) {
    const longest = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
    const length = Math.sqrt(x * x + y * y + z * z);
    let bx = 0;
    let by = 0;
    let bz = 0;
    let best = -Infinity;

    // (First a unit long, each side rounded on its own; then its longest side each whole number)
    for (let whole = 128; whole > 127 - SCALES && longest > 0; whole--) {
        const scale = whole > 127 ? 127 / length : whole / longest;
        const qx = Math.round(x * scale);
        const qy = Math.round(y * scale);
        const qz = Math.round(z * scale);
        const along = (qx * x + qy * y + qz * z) / (Math.sqrt(qx * qx + qy * qy + qz * qz) * length);

        if (along > best) {
            bx = qx;
            by = qy;
            bz = qz;
            best = along;

            // (Along an axis, or at 45 degrees between two: the very way it points)
            if (along >= 1 - 1e-12) {
                break;
            }
        }
    }

    into[at] = bx;
    into[at + 1] = by;
    into[at + 2] = bz;
    into[at + 3] = 0;

    return into;
}

/**
 * A geometry of the atlas's (atlas.js toAtlas's: not indexed, its `position`, `normal`, `uv`,
 * `color` and `layer` in floats) as it's merged and drawn: its normals in bytes (byteNormal), and
 * its corners that are alike in everything kept once, its triangles drawn from them in the order
 * they were (an index). One that's indexed already keeps its corners as they are, its normals in
 * bytes.
 */
export function sharedCorners(geometry) {
    const { position, normal, uv, color, layer } = geometry.attributes;
    const count = position.count;
    const buffer = new ArrayBuffer(count * WORDS * 4);
    const [floats, words] = [new Float32Array(buffer), new Uint32Array(buffer)];
    const facing = new Int8Array(4);
    const faced = new Uint32Array(facing.buffer);
    let nx = NaN;
    let ny = NaN;
    let nz = NaN;

    // Each corner as ten whole numbers: its floats as they are, bit for bit
    for (let i = 0; i < count; i++) {
        const at = i * WORDS;

        floats[at] = position.array[i * 3];
        floats[at + 1] = position.array[i * 3 + 1];
        floats[at + 2] = position.array[i * 3 + 2];
        floats[at + 4] = uv.array[i * 2];
        floats[at + 5] = uv.array[i * 2 + 1];
        floats[at + 6] = color.array[i * 3];
        floats[at + 7] = color.array[i * 3 + 1];
        floats[at + 8] = color.array[i * 3 + 2];
        floats[at + 9] = layer.array[i];

        // (Its normal's bytes: a face's corners all face one way, so most are the last one's again)
        if (normal && (normal.array[i * 3] !== nx || normal.array[i * 3 + 1] !== ny || normal.array[i * 3 + 2] !== nz)) {
            nx = normal.array[i * 3];
            ny = normal.array[i * 3 + 1];
            nz = normal.array[i * 3 + 2];
            byteNormal(nx, ny, nz, facing);
        }

        words[at + 3] = faced[0];
    }

    // Those alike kept once, at the front of the same numbers, and each triangle's corners which
    // of them: found by a table of where each kind's kept, by its numbers mixed together
    const index = geometry.index ? null : new Uint32Array(count);
    let unique = count;

    if (index) {
        const mask = 2 ** Math.ceil(Math.log2(Math.max(2, count * 2))) - 1;
        const table = new Int32Array(mask + 1).fill(-1);

        unique = 0;

        for (let i = 0; i < count; i++) {
            const at = i * WORDS;
            let mixed = 0x811c9dc5;

            for (let k = 0; k < WORDS; k++) {
                mixed = Math.imul(mixed ^ words[at + k], 0x01000193);
                mixed ^= mixed >>> 15;
            }

            let slot = mixed & mask;
            let found = table[slot];

            while (found !== -1) {
                let k = 0;

                while (k < WORDS && words[found * WORDS + k] === words[at + k]) {
                    k++;
                }

                if (k === WORDS) {
                    break;
                }

                slot = (slot + 1) & mask;
                found = table[slot];
            }

            if (found === -1) {
                found = unique++;
                table[slot] = found;
                words.copyWithin(found * WORDS, at, at + WORDS);
            }

            index[i] = found;
        }
    }

    // Each kept corner's numbers sorted back into what the graphics card's given
    const made = { position: new Float32Array(unique * 3), normal: new Int8Array(unique * 4), uv: new Float32Array(unique * 2), color: new Float32Array(unique * 3), layer: new Float32Array(unique) };
    const normals = new Uint32Array(made.normal.buffer);

    for (let i = 0; i < unique; i++) {
        const at = i * WORDS;

        made.position[i * 3] = floats[at];
        made.position[i * 3 + 1] = floats[at + 1];
        made.position[i * 3 + 2] = floats[at + 2];
        normals[i] = words[at + 3];
        made.uv[i * 2] = floats[at + 4];
        made.uv[i * 2 + 1] = floats[at + 5];
        made.color[i * 3] = floats[at + 6];
        made.color[i * 3 + 1] = floats[at + 7];
        made.color[i * 3 + 2] = floats[at + 8];
        made.layer[i] = floats[at + 9];
    }

    const result = new THREE.BufferGeometry();

    result.setAttribute("position", new THREE.BufferAttribute(made.position, 3));
    result.setAttribute("normal", new THREE.BufferAttribute(made.normal, 4, true));
    result.setAttribute("uv", new THREE.BufferAttribute(made.uv, 2));
    result.setAttribute("color", new THREE.BufferAttribute(made.color, 3));
    result.setAttribute("layer", new THREE.BufferAttribute(made.layer, 1));
    result.setIndex(index ? new THREE.BufferAttribute(index, 1) : geometry.index.clone());

    return result;
}
