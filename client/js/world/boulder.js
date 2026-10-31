// A boulder torn out of the ground (core/battle.js BOMBS boulder: the Stone Golem's), as it's
// drawn in the golem's hand (beasts/model.js `carry`) and as it's hurled (spellfx.js lob; the model
// viewer's throw): a lump of weathered brown-grey stone a metre across, its faces broken flat,
// darker in its hollows and lighter on what stands out, one shape for them all.

import * as THREE from "three";

// How much a boulder's faces are pushed in and out (a share of its radius), and how finely it's made
const ROUGH = 0.22;
const DETAIL = 1;

// Its stone's colour, and how much darker its hollows are and lighter what stands out (a share)
const STONE = 0x433d36;
const MOTTLE = 0.28;

let geometry = null;
let material = null;

// A point's own bump in and out, the same for the same point every time (its corners shared by the
// faces round them, so it's one closed lump)
function bump(x, y, z) {
    const a = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const b = Math.sin(x * 4.1 + z * 3.3) * 0.5 + Math.sin(y * 5.7 + x * 2.3) * 0.5;

    return (a - Math.floor(a) - 0.5) * 0.6 + b * 0.4;
}

/** A boulder's shape, a metre across (radius 1, made smaller as it's drawn): one for every boulder. */
export function boulderGeometry() {
    if (!geometry) {
        geometry = new THREE.IcosahedronGeometry(1, DETAIL);

        const position = geometry.attributes.position;
        const point = new THREE.Vector3();
        const colours = new Float32Array(position.count * 3);
        const stone = new THREE.Color(STONE);

        for (let k = 0; k < position.count; k++) {
            point.fromBufferAttribute(position, k);

            const out = bump(Math.round(point.x * 1000) / 1000, Math.round(point.y * 1000) / 1000, Math.round(point.z * 1000) / 1000);
            const r = 1 + ROUGH * out;
            const shade = 1 + MOTTLE * Math.max(-1, Math.min(1, out * 1.6));

            // (A little flatter than it's wide, as a boulder lies)
            position.setXYZ(k, point.x * r, point.y * r * 0.82, point.z * r);
            colours.set([stone.r * shade, stone.g * shade, stone.b * shade], k * 3);
        }

        geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
        geometry.computeVertexNormals();
    }

    return geometry;
}

/** What a boulder's made of: weathered stone (its colour each point's own: boulderGeometry), its faces broken flat. */
export function boulderMaterial() {
    // (Lit less by what's round it than most: rough, dusty stone, as dark as the golem's own)
    material ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true, envMapIntensity: 0.55 });

    return material;
}
