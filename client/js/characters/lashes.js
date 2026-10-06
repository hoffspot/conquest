// The eyelashes' look: each card of lashes (MakeHuman's, a strip along a lid) drawn as strands, by
// a picture of strands laid over it along the lid and out from its root, rather than as a dark
// see-through sheet.
//
// The cards' own texture coordinates are MakeHuman's (for its picture of lashes, which isn't
// shipped), so they're laid out again from the cards' shape, once for a kit: across, the way
// round the eye from one end of the lid to the other; along, from the root (the card's nearest
// the eye's middle, across from it) to the tip, a lower lid's lashes ending about half way out
// (MakeHuman's lower cards are as long as the upper, and a lower lid's lashes are shorter).

import * as THREE from "three";

// How far round the eye (radians) a card's vertices are from those of its column, nearest the
// eye: its root; and how far out a lower lid's lashes reach (of its card)
const COLUMN = 0.1;
const LOWER_REACH = 0.55;

// The picture of strands: its size (texels), how many lashes along a lid, and how thick one is at
// its root (texels); each tapers to its tip, some shorter than the rest (the longest short of the
// top, so past the picture's top, as a lower card's tips are, there's nothing)
const PICTURE = Object.freeze({ width: 512, height: 64, strands: 85, root: 2.2, shortest: 0.6, longest: 0.95 });

const layouts = new WeakMap();
let picture = null;

/**
 * A kit's texture coordinates with its eyelashes' laid out for strands (a copy of `human.uvs`:
 * the rest as they are), made once.
 */
export function lashUVs(human) {
    if (!layouts.has(human)) {
        layouts.set(human, layOut(human));
    }

    return layouts.get(human);
}

function layOut(human) {
    const uvs = Float32Array.from(human.uvs);
    const positions = human.basePositions;
    const lashes = human.renderIndices("lashes");

    if (!lashes.length) {
        return uvs;
    }

    const at = (r) => human.renderSource[r] * 3;

    // The eyes' middles (left and right)
    const middles = new Map();

    for (const r of new Set(human.renderIndices("eyes"))) {
        const side = Math.sign(positions[at(r)]) || 1;
        const middle = middles.get(side) ?? [0, 0, 0, 0];

        for (let k = 0; k < 3; k++) {
            middle[k] += positions[at(r) + k];
        }

        middle[3]++;
        middles.set(side, middle);
    }

    // The cards: the lashes' connected pieces
    const card = new Map();
    const find = (r) => (card.get(r) === r ? r : find(card.get(r)));

    for (const r of lashes) {
        card.set(r, r);
    }

    for (let t = 0; t < lashes.length; t += 3) {
        const a = find(lashes[t]);

        card.set(find(lashes[t + 1]), a);
        card.set(find(lashes[t + 2]), a);
    }

    // Each vertex's way round its eye and distance from its middle
    const vertices = [...new Set(lashes)].map((r) => {
        const side = Math.sign(positions[at(r)]) || 1;
        const [mx, my, mz, n] = middles.get(side) ?? [0, 0, 0, 1];
        const [x, y, z] = [0, 1, 2].map((k) => positions[at(r) + k] - [mx, my, mz][k] / n);

        return { r, card: find(r), round: Math.atan2(x, z), out: Math.hypot(x, y, z), up: y };
    });

    // (A card on a lower lid: most of it below the eye's middle)
    const lower = new Set([...new Set(vertices.map(({ card }) => card))].filter((card) => {
        const on = vertices.filter((vertex) => vertex.card === card);

        return on.filter(({ up }) => up < 0).length > on.length / 2;
    }));

    for (const vertex of vertices) {
        const mates = vertices.filter(({ card }) => card === vertex.card);
        const column = mates.filter(({ round }) => Math.abs(round - vertex.round) < COLUMN);
        const root = Math.min(...column.map(({ out }) => out));
        const tip = Math.max(...column.map(({ out }) => out));
        const first = Math.min(...mates.map(({ round }) => round));
        const last = Math.max(...mates.map(({ round }) => round));

        uvs[vertex.r * 2] = (vertex.round - first) / Math.max(1e-6, last - first);
        uvs[vertex.r * 2 + 1] = (tip > root ? (vertex.out - root) / (tip - root) : 0) / (lower.has(vertex.card) ? LOWER_REACH : 1);
    }

    return uvs;
}

/**
 * The picture of strands (an alpha map: three.js reads its green), across (u) a lid and out from
 * the root (v 0) to the tips (v 1), made once.
 */
export function lashTexture() {
    if (picture) {
        return picture;
    }

    const { width, height, strands, root, shortest, longest } = PICTURE;
    const data = new Uint8Array(width * height * 4);
    // (A fixed scatter, the same every time)
    let seed = 7;
    const random = () => {
        seed = (seed * 16807) % 2147483647;

        return seed / 2147483647;
    };

    for (let s = 0; s < strands; s++) {
        const across = ((s + 0.5 + (random() - 0.5) * 0.7) / strands) * width;
        const lean = (random() - 0.5) * 6;
        const reach = shortest + (longest - shortest) * random();

        for (let y = 0; y < height; y++) {
            const along = (y + 0.5) / height;

            if (along > reach) {
                break;
            }

            const centre = across + lean * along;
            const half = (root / 2) * (1 - along / reach) + 0.35;

            for (let x = Math.floor(centre - half - 1); x <= Math.ceil(centre + half + 1); x++) {
                const cover = Math.max(0, Math.min(1, half + 0.5 - Math.abs(x + 0.5 - centre)));
                const i = (y * width + ((x % width) + width) % width) * 4;
                const value = Math.max(data[i], Math.round(cover * 255));

                data[i] = data[i + 1] = data[i + 2] = data[i + 3] = value;
            }
        }
    }

    picture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    picture.wrapS = THREE.RepeatWrapping;
    picture.magFilter = THREE.LinearFilter;
    picture.minFilter = THREE.LinearMipmapLinearFilter;
    picture.generateMipmaps = true;
    picture.needsUpdate = true;

    return picture;
}
