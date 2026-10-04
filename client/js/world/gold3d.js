// The gold in an open chest (drops3d.js): a heap of coins, made once in code (the user: "The gold
// can look better... how to create a realistic pile of gold"). The coins are let fall one at a
// time onto what's in the chest (a height map of it, a few millimetres a cell), each coming to rest
// on what's under it, tilted as that lies (no steeper than coins lie on a heap), and what it covers
// rises by its thickness; so they lie over one another, as coins heaped up do, a few on edge
// against the others, a few spilt on the chest's rim and the ground by it. They're drawn as one
// mesh, each its own way round, redder or paler or more worn than the next, darker where it's
// buried or by the chest's sides; under them a heap of coins only painted (its colour and normal
// maps: dark in the gaps between them), seen where they leave it bare; a few gems and a goblet in
// it; and the sun glinting off a coin here and there as you look. Close up, each coin's a rim, a
// ring of beads and a cross (its own small textures); further off, fewer sides; further still, the
// painted heap alone.
//
// What makes it gold is mostly what it reflects: under a blue sky, gold's a green-grey, so what
// the coins reflect of the sky is taken as less blue and warmer (goldLit), and the light falling
// on the heap comes back off the coins round about, gold again.
//
// In the chest model's units (drops3d.js CHEST_MODEL): its inside, `inside`, from the middle of
// its floor. Nothing here is the rules': not the same on every browser, nor need it be.

import * as THREE from "three";
import { createRandom } from "../core/random.js";
import { fireLit } from "./firelight.js";

/**
 * The heap: the chest's inside (half across, `x`; half back, `z`) and its rim (`rim`: its height;
 * `out`: half across and back outside), the heap under the coins (`wall`: its height by the
 * chest's sides, `top` in the middle; `lumps`, how much it rises and falls), the coins (`radius`,
 * `thickness`, `sides` round near, and further off; `spacing` between where the first are let
 * fall, as much of a coin across; `over`: as many again let fall on those, as a share of them;
 * `slope`: the steepest a coin lies; `edge`: the share of those over the rest stood on edge, and
 * how steep; `spilt`: on the rim, and on the ground), `cell` (metres of the model's: the height
 * map's), how far off (metres) the coins are drawn with fewer sides (`fewer`) and at all (`near`),
 * how many gems, the glints (how many; how far, radians, from straight up the facets each mirrors
 * the sun in may lean; how big, pixels on a screen a thousand high), and the light (goldLit: `sky`, how much of the sky's colour is seen in
 * the gold and how warmed; `among`, how much of the light falling on the heap comes back off the
 * coins round about; `rough`, how rough the coins are, and at least, further off, so they don't
 * shimmer).
 */
export const GOLD = Object.freeze({
    inside: { x: 0.262, z: 0.162 },
    rim: { height: 0.28, out: [0.298, 0.198] },
    wall: 0.232,
    top: 0.305,
    lumps: 0.008,
    radius: 0.0125,
    thickness: 0.0028,
    sides: [10, 6],
    spacing: 0.95,
    over: 0.3,
    slope: 0.75,
    edge: { share: 0.07, slope: [1.6, 3.2] },
    spilt: { rim: 5, ground: 7 },
    cell: 0.003,
    fewer: 5,
    near: 14,
    gems: 7,
    glints: { count: 48, tilt: 0.95, size: 40 },
    sky: { saturation: 0.4, warmth: [1.08, 0.94, 0.78] },
    among: 0.25,
    rough: { coin: 0.32, far: [0.32, 3, 10] },
});

// Gold, silver and copper as each reflects (linear: the light each gives back, as metal); and the
// gold of the coins, most a little redder or paler, some worn darker, some paler still
const METALS = Object.freeze({
    gold: [1.0, 0.72, 0.3],
    silver: [0.95, 0.93, 0.88],
    copper: [0.955, 0.638, 0.538],
});
const ALLOYS = Object.freeze([
    { share: 0.84, tint: [[0.9, 1], [0.88, 1], [0.85, 1]] },
    { share: 0.08, tint: [[0.72, 0.72], [0.62, 0.62], [0.5, 0.5]] },
    { share: 0.08, tint: [[1, 1], [1.04, 1.04], [1.12, 1.12]] },
]);

// The gems' colours (linear), how big they are (the model's units), and the goblet's (its height,
// its foot sunk in the heap)
const GEMS = Object.freeze({ colours: [[0.55, 0.01, 0.03], [0.02, 0.42, 0.12], [0.03, 0.1, 0.62], [0.32, 0.04, 0.5], [0.6, 0.6, 0.62]], size: [1.1, 1.8] });
const GOBLET = Object.freeze({ height: 0.07, sunk: 0.012, at: [-0.17, 0.06] });

/**
 * The heap of coins let fall (the same for the same seed): `coins` [{ position, normal, spin,
 * colour ([r, g, b], linear) }] in the order they fell, those spilt last; `gems` [{ position,
 * size, turn, tilt, colour }]; the `goblet` ({ position, normal }); `glints` [{ position, facet
 * (a unit vector), phase }]; `height` (u, v) => how high it's heaped there (across and back from
 * the middle), and `under` the same, the heap under the coins.
 */
export function heapOfCoins(seed = 1) {
    const random = createRandom(seed);
    const { inside, radius, thickness, cell } = GOLD;
    const across = Math.ceil((2 * inside.x) / cell) + 1;
    const back = Math.ceil((2 * inside.z) / cell) + 1;
    const lumps = Array.from({ length: 9 }, () => ({ u: random.range(-inside.x, inside.x), v: random.range(-inside.z, inside.z), size: random.range(0.04, 0.09), up: random.range(-1, 1) }));
    const under = (u, v) => heapUnder(u, v, lumps);
    const heights = new Float32Array(across * back);
    const at = (u, v) => {
        const i = Math.min(across - 1, Math.max(0, Math.round((u + inside.x) / cell)));
        const j = Math.min(back - 1, Math.max(0, Math.round((v + inside.z) / cell)));

        return j * across + i;
    };

    for (let j = 0; j < back; j++) {
        for (let i = 0; i < across; i++) {
            heights[j * across + i] = under(i * cell - inside.x, j * cell - inside.z);
        }
    }

    // Where they're let fall: a coin's width apart or so (so they cover it), and as many again,
    // a share of them, anywhere; in no order
    const step = 2 * radius * GOLD.spacing;
    const drops = [];

    for (let v = -inside.z + radius * 0.6; v < inside.z - radius * 0.4; v += step) {
        for (let u = -inside.x + radius * 0.6; u < inside.x - radius * 0.4; u += step) {
            drops.push({ u: u + random.range(-0.45, 0.45) * step, v: v + random.range(-0.45, 0.45) * step, over: false });
        }
    }

    const first = drops.length;

    for (let k = 0; k < first * GOLD.over; k++) {
        drops.push({ u: random.range(-inside.x, inside.x) * 0.92, v: random.range(-inside.z, inside.z) * 0.9, over: true });
    }

    for (let k = first - 1; k > 0; k--) {
        const swap = Math.floor(random.next() * (k + 1));

        [drops[k], drops[swap]] = [drops[swap], drops[k]];
    }

    // (Where under a coin the height's found: its middle, round its edge and half way)
    const around = [[0, 0]];

    for (let k = 0; k < 12; k++) {
        around.push([Math.cos((k / 12) * Math.PI * 2) * radius * 0.95, Math.sin((k / 12) * Math.PI * 2) * radius * 0.95]);
    }

    for (let k = 0; k < 6; k++) {
        around.push([Math.cos(((k + 0.5) / 6) * Math.PI * 2) * radius * 0.5, Math.sin(((k + 0.5) / 6) * Math.PI * 2) * radius * 0.5]);
    }

    const squared = around.reduce((sum, [du]) => sum + du * du, 0);
    const found = new Float32Array(around.length);
    const coins = [];

    for (const drop of drops) {
        const u = Math.min(inside.x - radius * 0.7, Math.max(-inside.x + radius * 0.7, drop.u));
        const v = Math.min(inside.z - radius * 0.7, Math.max(-inside.z + radius * 0.7, drop.v));
        let [slopeU, slopeV] = [0, 0];

        // (The way what's under it lies: its slope across and back, as near as a plane fits it,
        // and not steeper than coins lie; a little more one way or another; or on edge, leant
        // against the rest)
        around.forEach(([du, dv], k) => {
            found[k] = heights[at(u + du, v + dv)];
            slopeU += (du * found[k]) / squared;
            slopeV += (dv * found[k]) / squared;
        });

        const steep = Math.hypot(slopeU, slopeV);

        if (steep > GOLD.slope) {
            slopeU *= GOLD.slope / steep;
            slopeV *= GOLD.slope / steep;
        }

        if (drop.over && random.chance(GOLD.edge.share)) {
            const way = random.range(0, Math.PI * 2);
            const lean = random.range(...GOLD.edge.slope);

            slopeU = Math.cos(way) * lean;
            slopeV = Math.sin(way) * lean;
        } else {
            slopeU += random.range(-0.12, 0.12);
            slopeV += random.range(-0.12, 0.12);
        }

        // (Resting on what's highest under it)
        let rest = -Infinity;

        around.forEach(([du, dv], k) => {
            rest = Math.max(rest, found[k] - slopeU * du - slopeV * dv);
        });

        const normal = new THREE.Vector3(-slopeU, 1, -slopeV).normalize();
        const rise = thickness / normal.y;
        // (What it covers: where it lies over, as seen from above, a little within its edge)
        const reach = radius * 0.92;

        for (let dv = -reach; dv <= reach; dv += cell) {
            for (let du = -reach; du <= reach; du += cell) {
                const along = slopeU * du + slopeV * dv;

                if (du * du + dv * dv + along * along <= reach * reach && Math.abs(u + du) <= inside.x && Math.abs(v + dv) <= inside.z) {
                    const k = at(u + du, v + dv);

                    heights[k] = Math.max(heights[k], rest + along + rise);
                }
            }
        }

        coins.push({ position: new THREE.Vector3(u, rest, v).addScaledVector(normal, thickness / 2), normal, spin: random.range(0, Math.PI * 2), colour: coinColour(random) });
    }

    // Darker, those buried (under the coins let fall after) and those by the chest's sides
    for (const coin of coins) {
        const buried = Math.min(1, Math.max(0, (heights[at(coin.position.x, coin.position.z)] - coin.position.y - thickness) / (thickness * 3)));
        const side = Math.min(inside.x - Math.abs(coin.position.x), inside.z - Math.abs(coin.position.z));
        const shade = (1 - 0.45 * buried) * (0.72 + 0.28 * Math.min(1, side / (radius * 2.5)));

        coin.colour = coin.colour.map((value) => value * shade);
    }

    const glints = [];
    const lying = coins.slice(Math.floor(coins.length * 0.4)).filter((coin) => coin.normal.y > 0.6);

    for (let k = 0; k < GOLD.glints.count && lying.length; k++) {
        const coin = random.pick(lying);
        const tilt = Math.acos(1 - random.next() * (1 - Math.cos(GOLD.glints.tilt)));
        const way = random.range(0, Math.PI * 2);

        glints.push({
            position: coin.position.clone().addScaledVector(coin.normal, thickness * 0.6).add(new THREE.Vector3(random.range(-0.4, 0.4) * radius, 0, random.range(-0.4, 0.4) * radius)),
            facet: new THREE.Vector3(Math.cos(way) * Math.sin(tilt), Math.cos(tilt), Math.sin(way) * Math.sin(tilt)),
            phase: random.next(),
        });
    }

    // A few spilt: on the rim, lying flat or nearly (not its back, the lid's there), and on the
    // ground round its front and sides
    const rimMiddle = [(GOLD.rim.out[0] + inside.x) / 2, (GOLD.rim.out[1] + inside.z) / 2];
    const flat = (u, y, v) => {
        const normal = new THREE.Vector3(random.range(-0.08, 0.08), 1, random.range(-0.08, 0.08)).normalize();

        coins.push({ position: new THREE.Vector3(u, y + thickness / 2, v), normal, spin: random.range(0, Math.PI * 2), colour: coinColour(random) });
    };

    for (let k = 0; k < GOLD.spilt.rim; k++) {
        const side = k % 3;

        if (side === 0) {
            flat(random.range(-0.8, 0.8) * inside.x, GOLD.rim.height, rimMiddle[1]);
        } else {
            flat((side === 1 ? -1 : 1) * rimMiddle[0], GOLD.rim.height, random.range(-0.6, 0.6) * inside.z);
        }
    }

    for (let k = 0; k < GOLD.spilt.ground; k++) {
        const way = random.range(-0.4, Math.PI + 0.4);
        const far = random.range(0.04, 0.2);

        flat(Math.cos(way) * (GOLD.rim.out[0] + far), 0, Math.max(-GOLD.rim.out[1] * 0.5, Math.sin(way) * (GOLD.rim.out[1] + far)));
    }

    const gems = [];

    for (let k = 0; k < GOLD.gems; k++) {
        const [u, v] = [random.range(-0.7, 0.7) * inside.x, random.range(-0.7, 0.7) * inside.z];
        const size = random.range(...GEMS.size);

        gems.push({ position: new THREE.Vector3(u, heights[at(u, v)] + size * 0.002, v), size, turn: random.range(0, Math.PI * 2), tilt: random.range(-0.4, 0.4), colour: GEMS.colours[k % GEMS.colours.length] });
    }

    const [gu, gv] = GOBLET.at;
    const goblet = {
        position: new THREE.Vector3(gu, heights[at(gu, gv)] - GOBLET.sunk, gv),
        normal: new THREE.Vector3((heights[at(gu - 0.02, gv)] - heights[at(gu + 0.02, gv)]) / 0.04, 1, (heights[at(gu, gv - 0.02)] - heights[at(gu, gv + 0.02)]) / 0.04).normalize(),
    };

    return { coins, gems, goblet, glints, height: (u, v) => heights[at(u, v)], under };
}

// A coin's colour (linear: as it reflects): of gold mostly, its alloy's (redder or paler, worn or
// pale), or now and then of silver or copper
function coinColour(random) {
    const metal = random.chance(0.02) ? "silver" : random.chance(0.015) ? "copper" : "gold";

    if (metal !== "gold") {
        return METALS[metal].map((value) => value * 0.85);
    }

    let pick = random.next();
    const alloy = ALLOYS.find(({ share }) => (pick -= share) < 0) ?? ALLOYS[0];

    return METALS.gold.map((value, k) => value * random.range(...alloy.tint[k]));
}

/**
 * The gold's parts, made once (drops3d.js: shared by every open chest): the geometries (`heap`
 * under the coins; `coin` near and `fewer` further off; `gem`; `cup`, the goblet; `glint`, the
 * glints' points), the coins', gems' and goblet's matrices and colours (`coins`, `gems`, `goblet`: an
 * instanced mesh's attributes, the same for each chest's), the materials (`gold`: the coins' and
 * the goblet's; `bed`: the heap's; `jewel`: the gems'; `glints`), and the `textures`.
 */
export function goldParts(seed = 1) {
    const heap = heapOfCoins(seed);
    const faces = coinFaces();
    const turned = new THREE.Quaternion();
    const spin = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const instances = (list, place) => {
        const matrices = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 16), 16);
        const colours = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
        const matrix = new THREE.Matrix4();

        list.forEach((item, k) => {
            place(item, matrix);
            matrix.toArray(matrices.array, k * 16);
            colours.array.set(item.colour, k * 3);
        });

        return { matrices, colours, count: list.length };
    };

    return {
        heap: heapGeometry(heap.under),
        coin: coinGeometry(GOLD.sides[0]),
        fewer: coinGeometry(GOLD.sides[1]),
        gem: gemGeometry(),
        cup: gobletGeometry(),
        glint: glintGeometry(heap.glints),
        coins: instances(heap.coins, (coin, matrix) => matrix.compose(coin.position, turned.setFromUnitVectors(up, coin.normal).multiply(spin.setFromAxisAngle(up, coin.spin)), one)),
        gems: instances(heap.gems, (gem, matrix) => {
            turned.setFromAxisAngle(new THREE.Vector3(Math.cos(gem.turn), 0, Math.sin(gem.turn)), gem.tilt).multiply(spin.setFromAxisAngle(up, gem.turn));
            matrix.compose(gem.position, turned, new THREE.Vector3(gem.size, gem.size, gem.size));
        }),
        goblet: instances([{ ...heap.goblet, colour: METALS.gold }], (goblet, matrix) => matrix.compose(goblet.position, turned.setFromUnitVectors(up, goblet.normal), one)),
        gold: goldLit(new THREE.MeshStandardMaterial({ name: "gold", map: faces.map, normalMap: faces.normal, normalScale: new THREE.Vector2(0.9, 0.9), metalness: 1, roughness: GOLD.rough.coin })),
        bed: goldLit(new THREE.MeshStandardMaterial({ name: "gold-heap", color: new THREE.Color().setRGB(...METALS.gold.map((value) => value * 0.85), THREE.LinearSRGBColorSpace), map: faces.heapColour, normalMap: faces.heap, normalScale: new THREE.Vector2(1.2, 1.2), metalness: 1, roughness: 0.45 })),
        jewel: jewelMaterial(),
        glints: glintMaterial(),
        textures: [faces.map, faces.normal, faces.heap, faces.heapColour],
    };
}

/**
 * The gold drawn in an open chest (in the model's units), from goldParts': the heap under it, and,
 * near enough to be seen, the coins (with fewer sides further off), gems, goblet and glints (a draw
 * each); none of them casting shadows.
 */
export function drawGold(parts) {
    const gold = new THREE.Group();
    const heap = new THREE.Mesh(parts.heap, parts.bed);
    const lod = new THREE.LOD();
    const level = (coin) => {
        const near = new THREE.Group();
        const glints = new THREE.Points(parts.glint, parts.glints);

        near.add(instanced(coin, parts.gold, parts.coins, "coins"), instanced(parts.gem, parts.jewel, parts.gems, "gems"), instanced(parts.cup, parts.gold, parts.goblet, "goblet"), glints);
        glints.name = "glints";
        glints.frustumCulled = false;
        glints.onBeforeRender = glinting;

        return near;
    };

    heap.receiveShadow = true;
    heap.name = "gold-heap";
    lod.addLevel(level(parts.coin), 0);
    lod.addLevel(level(parts.fewer), GOLD.fewer);
    lod.addLevel(new THREE.Object3D(), GOLD.near);
    gold.add(heap, lod);
    gold.name = "gold";

    return gold;
}

// An instanced mesh of these (`instances`: goldParts', their matrices and colours, shared)
function instanced(geometry, material, { matrices, colours, count }, name) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);

    mesh.instanceMatrix = matrices;
    mesh.instanceColor = colours;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.computeBoundingSphere();

    return mesh;
}

/**
 * A material for gold heaped up (its colour each coin's own, or its own), lit as gold is: what it
 * reflects of the sky (the scene's environment) seen less blue and warmer (GOLD `sky`: a blue sky
 * mirrored in gold's a green-grey; it's mostly the other coins and the chest the coins reflect,
 * gold and warm); the light falling on the heap coming back off the coins round about (GOLD
 * `among`: gold twice over, so even in the shade it glows); and no smoother where its bumps are
 * too fine to see, nor further off, than will shimmer (GOLD `rough`: as Toksvig has it, from how
 * short the normal map's averaged normal is). (And lit by the fires near, as all else is:
 * firelight.js.)
 */
export function goldLit(material) {
    const { sky, among, rough } = GOLD;
    const vector = (values) => `vec3(${values.map((value) => value.toFixed(3)).join(", ")})`;

    material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader
            .replace(
                "#include <normal_fragment_maps>",
                `#include <normal_fragment_maps>
#ifdef USE_NORMALMAP_TANGENTSPACE
{
    float shortened = length(texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0);
    float spread = max(0.0, 1.0 - shortened - 0.01) / max(shortened, 0.1);

    roughnessFactor = sqrt(sqrt(min(pow(roughnessFactor, 4.0) + 2.0 * spread, 1.0)));
}
#endif
roughnessFactor = max(roughnessFactor, ${rough.far[0].toFixed(3)} * smoothstep(${rough.far[1].toFixed(1)}, ${rough.far[2].toFixed(1)}, length(vViewPosition)));`,
            )
            .replace(
                "#include <lights_fragment_maps>",
                `#include <lights_fragment_maps>
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
radiance = mix(vec3(dot(radiance, vec3(0.2126, 0.7152, 0.0722))), radiance, ${sky.saturation.toFixed(3)}) * ${vector(sky.warmth)};
#endif`,
            )
            .replace(
                "#include <lights_fragment_end>",
                `#include <lights_fragment_end>
reflectedLight.indirectSpecular += (irradiance + iblIrradiance) * material.specularColorBlended * material.specularColorBlended * ${among.toFixed(3)};`,
            );
        fireLit(shader);
    };
    material.customProgramCacheKey = () => "gold";

    return material;
}

// The gems' material: no light through them (that's another whole drawing), but dark and deep in
// their colour, their facets mirroring the sky sharply, a little of their colour lit from within
// (brighter looking straight in)
function jewelMaterial() {
    const material = new THREE.MeshPhysicalMaterial({ name: "gems", metalness: 0, roughness: 0.04, ior: 1.77, specularIntensity: 1, emissive: 0xffffff, emissiveIntensity: 0.22, envMapIntensity: 1.6, flatShading: true });

    material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
totalEmissiveRadiance *= vColor.rgb;
float facing = saturate(dot(normal, normalize(vViewPosition)));
totalEmissiveRadiance *= 0.4 + 1.6 * facing * facing;
#endif`,
        );
        fireLit(shader);
    };
    material.customProgramCacheKey = () => "gems";

    return material;
}

// The glints: a small four-pointed star where the sun's mirrored in a coin (each its own facet, so
// a few are always near the way it'd be seen, as the eye moves: fading in and out, not flickering),
// as bright as the sun, gone by GOLD `near`
function glintMaterial() {
    return new THREE.ShaderMaterial({
        name: "glints",
        uniforms: { toLight: { value: new THREE.Vector3(0, 1, 0) }, colour: { value: new THREE.Color(0, 0, 0) }, time: { value: 0 }, pixels: { value: 1 } },
        vertexShader: /* glsl */ `
            attribute vec3 facet;
            attribute float phase;
            uniform vec3 toLight;
            uniform float time;
            uniform float pixels;
            varying float vBright;

            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vec3 facing = normalize(mat3(modelMatrix) * facet);
                vec3 toEye = normalize(cameraPosition - world.xyz);
                vec4 seen = viewMatrix * world;
                float bright = smoothstep(0.88, 0.985, dot(reflect(-toLight, facing), toEye));

                bright *= 0.75 + 0.25 * sin(time * 5.0 + phase * 6.2832);
                vBright = bright * (1.0 - smoothstep(${(GOLD.near * 0.65).toFixed(1)}, ${GOLD.near.toFixed(1)}, -seen.z));
                gl_Position = projectionMatrix * seen;
                // (Not hidden by its own coin)
                gl_Position.z -= 0.002 * gl_Position.w;
                gl_PointSize = vBright * pixels * ${GOLD.glints.size.toFixed(1)};
            }`,
        fragmentShader: /* glsl */ `
            uniform vec3 colour;
            varying float vBright;

            void main() {
                vec2 at = gl_PointCoord * 2.0 - 1.0;
                float star = exp(-abs(at.x) * 16.0) * exp(-abs(at.y) * 2.2) + exp(-abs(at.y) * 16.0) * exp(-abs(at.x) * 2.2);
                float lit = (0.9 * star + exp(-dot(at, at) * 12.0)) * vBright;

                if (lit < 0.004) {
                    discard;
                }

                gl_FragColor = vec4(colour * lit * 2.2, 1.0);
            }`,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
    });
}

// The sun the glints mirror (the scene's first light casting shadows from afar), by the scene
const suns = new WeakMap();

// (Before the glints are drawn: the way to the sun, as bright as it is (against a midday's), the
// time, and how many pixels the screen's high)
function glinting(renderer, scene, camera, geometry, material) {
    if (!suns.has(scene)) {
        suns.set(scene, scene.children.find((child) => child.isDirectionalLight && child.castShadow) ?? null);
    }

    const sun = suns.get(scene);
    const { uniforms } = material;

    if (sun) {
        uniforms.toLight.value.subVectors(sun.position, sun.target.position).normalize();
        uniforms.colour.value.copy(sun.color).multiplyScalar(Math.min(1.2, sun.intensity / 3.5));
    } else {
        uniforms.toLight.value.set(0, 1, 0);
        uniforms.colour.value.setRGB(1, 0.86, 0.6);
    }

    uniforms.time.value = performance.now() / 1000;
    uniforms.pixels.value = renderer.domElement.height / 1000;
}

// The heap under the coins: by the chest's sides `wall` high, `top` in the middle, rising and
// falling a little (`lumps`: [{ u, v, size, up }])
function heapUnder(u, v, lumps) {
    const { inside } = GOLD;
    const [x, z] = [Math.abs(u) / inside.x, Math.abs(v) / inside.z];
    const far = Math.min(1, Math.sqrt(Math.sqrt(x ** 4 + z ** 4)));
    const raised = lumps.reduce((sum, lump) => sum + lump.up * Math.exp(-((u - lump.u) ** 2 + (v - lump.v) ** 2) / (lump.size * lump.size)), 0);

    return GOLD.wall + (GOLD.top - GOLD.wall) * (1 - far * far) + GOLD.lumps * raised * (1 - far * far * 0.6);
}

// The heap under the coins as a mesh: a grid over the chest's inside, from wall to wall, a little
// under where the coins lie (its textures seven coins' width a tile)
function heapGeometry(under) {
    const { inside, radius } = GOLD;
    const geometry = new THREE.PlaneGeometry(inside.x * 2, inside.z * 2, 28, 18).rotateX(-Math.PI / 2);
    const corners = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const tile = radius * 14;

    for (let k = 0; k < corners.count; k++) {
        const [u, v] = [corners.getX(k), corners.getZ(k)];

        corners.setY(k, under(u, v) - GOLD.thickness * 0.5);
        uvs.setXY(k, u / tile, v / tile);
    }

    geometry.computeVertexNormals();

    return geometry;
}

// One coin, `sides` round: its two faces (a fan each, their texture a coin's face) and its edge
// (its texture the face's rim)
function coinGeometry(sides) {
    const { radius, thickness } = GOLD;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    const ring = Array.from({ length: sides }, (_, k) => [Math.cos((k / sides) * Math.PI * 2), Math.sin((k / sides) * Math.PI * 2)]);

    for (const face of [1, -1]) {
        const start = positions.length / 3;

        positions.push(0, (face * thickness) / 2, 0);
        normals.push(0, face, 0);
        uvs.push(0.5, 0.5);

        for (const [c, s] of ring) {
            positions.push(c * radius, (face * thickness) / 2, s * radius);
            normals.push(0, face, 0);
            uvs.push(0.5 + c * 0.5, 0.5 + s * 0.5 * face);
        }

        for (let k = 0; k < sides; k++) {
            const [a, b] = [start + 1 + k, start + 1 + ((k + 1) % sides)];

            indices.push(...(face > 0 ? [start, b, a] : [start, a, b]));
        }
    }

    const edge = positions.length / 3;

    for (const [c, s] of ring) {
        for (const face of [1, -1]) {
            positions.push(c * radius, (face * thickness) / 2, s * radius);
            normals.push(c, 0, s);
            uvs.push(0.5 + c * 0.49, 0.5 + s * 0.49);
        }
    }

    for (let k = 0; k < sides; k++) {
        const [a, b] = [edge + k * 2, edge + ((k + 1) % sides) * 2];

        indices.push(a, a + 1, b, b, a + 1, b + 1);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
}

// A cut gem, a hundredth across (its instance scaled up): an eight-sided table and crown, its
// underside to a point; flat faces, 32 triangles
function gemGeometry() {
    const size = 0.01;
    const girdle = [];
    const table = [];
    const corners = [];

    for (let k = 0; k < 8; k++) {
        const [a, b] = [(k / 8) * Math.PI * 2, ((k + 0.5) / 8) * Math.PI * 2];

        girdle.push([Math.cos(a) * size, 0, Math.sin(a) * size]);
        table.push([Math.cos(b) * size * 0.55, size * 0.38, Math.sin(b) * size * 0.55]);
    }

    const triangle = (...points) => points.forEach((point) => corners.push(...point));
    const [top, point] = [[0, size * 0.38, 0], [0, -size * 0.75, 0]];

    for (let k = 0; k < 8; k++) {
        const [g0, g1, t0, before] = [girdle[k], girdle[(k + 1) % 8], table[k], table[(k + 7) % 8]];

        triangle(top, table[(k + 1) % 8], t0);
        triangle(g0, t0, g1);
        triangle(g0, before, t0);
        triangle(g0, g1, point);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
    geometry.computeVertexNormals();

    return geometry.translate(0, size * 0.5, 0);
}

// A goblet (turned: a foot, a stem with a knop, a bowl), GOBLET `height` tall, its texture all the
// coin's plain raised rim
function gobletGeometry() {
    const profile = [[0, 0], [0.032, 0], [0.034, 0.004], [0.012, 0.012], [0.006, 0.03], [0.006, 0.06], [0.012, 0.07], [0.034, 0.09], [0.04, 0.13], [0.036, 0.13], [0.03, 0.095], [0, 0.085]];
    const scale = GOBLET.height / 0.13;
    const geometry = new THREE.LatheGeometry(
        profile.map(([x, y]) => new THREE.Vector2(x * scale, y * scale)),
        12,
    );
    const uvs = geometry.attributes.uv;

    for (let k = 0; k < uvs.count; k++) {
        uvs.setXY(k, 0.5, 0.96);
    }

    return geometry;
}

// The glints' points: where each is, its facet and when it shimmers
function glintGeometry(glints) {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(glints.flatMap(({ position }) => position.toArray()), 3));
    geometry.setAttribute("facet", new THREE.Float32BufferAttribute(glints.flatMap(({ facet }) => facet.toArray()), 3));
    geometry.setAttribute("phase", new THREE.Float32BufferAttribute(glints.map(({ phase }) => phase), 1));
    geometry.computeBoundingSphere();

    return geometry;
}

// A coin's face (64 texels across: a raised rim, a ring of beads, a cross in the field, worn
// bright where it's raised, dark in what's struck down), as its colour (grey: the metal's colour
// is each coin's own) and its normal map; and a heap of coins seen from above (a tile that
// repeats), as its colour (dark in the gaps between them) and its normal map
function coinFaces() {
    const size = 64;
    const raised = new Float32Array(size * size);

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const [x, y] = [((i + 0.5) / size) * 2 - 1, ((j + 0.5) / size) * 2 - 1];
            const r = Math.hypot(x, y);
            const bead = (Math.atan2(y, x) / (Math.PI * 2)) * 28;
            const crossed = r < 0.62 && (Math.abs(x) < 0.12 + 0.12 * r || Math.abs(y) < 0.12 + 0.12 * r);

            raised[j * size + i] = r > 0.98 ? 0.7 : r > 0.86 ? 1 : r > 0.76 ? (Math.hypot(r - 0.81, (bead - Math.round(bead)) * 0.18) < 0.035 ? 0.75 : 0.2) : crossed ? 0.8 : r > 0.66 && r < 0.7 ? 0.55 : 0.3;
        }
    }

    const heap = heapRaised(128);

    return {
        map: texture(greys(raised, (value) => 0.78 + 0.22 * value), size, THREE.SRGBColorSpace),
        normal: texture(normalsOf(raised, size, 3), size, THREE.NoColorSpace),
        heap: texture(normalsOf(heap, 128, 2.2), 128, THREE.NoColorSpace, true),
        heapColour: texture(greys(heap, (value) => (value > 0 ? 0.72 + 0.28 * Math.min(1, value) : 0.42)), 128, THREE.SRGBColorSpace, true),
    };
}

// (RGBA bytes, grey: each value as a shade, 0 to 1)
function greys(values, shade) {
    const bytes = new Uint8Array(values.length * 4);

    values.forEach((value, k) => {
        const grey = Math.round(255 * Math.min(1, Math.max(0, shade(value))));

        bytes.set([grey, grey, grey, 255], k * 4);
    });

    return bytes;
}

// A heap of coins seen from above, as how raised it is (0 in the gaps between them; a tile, `size`
// texels across, that repeats): coins a seventh of it across, laid over one another, each a little
// tilted, its rim raised
function heapRaised(size) {
    const random = createRandom(7);
    const raised = new Float32Array(size * size);
    const radius = size / 14;

    for (let k = 0; k < 90; k++) {
        const [cx, cy, tiltX, tiltY, lift] = [random.next() * size, random.next() * size, random.range(-0.5, 0.5), random.range(-0.5, 0.5), 0.1 + (k / 90) * 0.9];

        for (let dy = -radius - 1; dy <= radius + 1; dy++) {
            for (let dx = -radius - 1; dx <= radius + 1; dx++) {
                const r = Math.hypot(dx, dy) / radius;

                if (r <= 1) {
                    const [i, j] = [(Math.floor(cx + dx) + size) % size, (Math.floor(cy + dy) + size) % size];
                    const height = Math.max(0.02, lift + (tiltX * dx + tiltY * dy) / (radius * 4) + (r > 0.82 ? 0.08 : 0));

                    raised[j * size + i] = Math.max(raised[j * size + i], height);
                }
            }
        }
    }

    return raised;
}

// A normal map (RGBA bytes) from how raised each texel is, `strength` how steep
function normalsOf(raised, size, strength) {
    const normals = new Uint8Array(size * size * 4);
    const height = (i, j) => raised[((j + size) % size) * size + ((i + size) % size)];

    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const [dx, dy] = [(height(i + 1, j) - height(i - 1, j)) * strength, (height(i, j + 1) - height(i, j - 1)) * strength];
            const length = Math.hypot(dx, dy, 1);

            normals.set([Math.round((0.5 - dx / length / 2) * 255), Math.round((0.5 - dy / length / 2) * 255), Math.round((0.5 + 0.5 / length) * 255), 255], (j * size + i) * 4);
        }
    }

    return normals;
}

function texture(data, size, colorSpace, repeat = false) {
    const made = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);

    made.colorSpace = colorSpace;
    made.generateMipmaps = true;
    made.minFilter = THREE.LinearMipmapLinearFilter;
    made.magFilter = THREE.LinearFilter;
    made.anisotropy = 4;

    if (repeat) {
        made.wrapS = THREE.RepeatWrapping;
        made.wrapT = THREE.RepeatWrapping;
    }

    made.needsUpdate = true;

    return made;
}
