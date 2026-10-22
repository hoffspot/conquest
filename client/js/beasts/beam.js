// A kaiju's atomic breath (a coming model's, shown in lab/model-viewer.js; beasts/model.js's once
// it's in the game): the glow on its spines and body charged up from its tail to its head as it
// draws breath, then a thick beam of blue fire with a white-hot core thrown from between its jaws
// down onto the ground ahead of it, where it bursts: a blinding flare, the ground lit round it with
// rings of light running out over it and a track burnt where it's raked, sparks thrown up and blue
// mist rolling off, its glow at its brightest all the while. Its head and neck are turned a little
// to aim it at the ground ahead, where what it fights would be. All of it is timed to the clip it
// breathes in, by the clip's time (nothing's kept from one moment to the next), so it's the same
// played, paused or stepped back and forth through.

import * as THREE from "three";

/**
 * Each model's breath, by its catalog id: the clip it breathes in; its mouth (its upper lip a point
 * in its head bone's frame, the tip of its upper teeth, as it has no bone of its own; its lower
 * lip's bone and its jaw's hinge); the bones turned to aim it (each a share of the turn); when its
 * glow charges and when it fires (seconds into the clip: its jaws wide open); how far ahead of its
 * mouth it hits the ground (metres: where it first lands, raked on to); and how thick the beam is
 * (its radius, metres, at the mouth and where it lands).
 */
export const BEAMS = Object.freeze({
    "beast-kaiju": Object.freeze({
        clip: "Energy Breath",
        mouth: Object.freeze({ head: "Head", upper: Object.freeze([0, 0.36, -0.15]), lower: "lipjaw", hinge: "Jaw" }),
        neck: Object.freeze([Object.freeze(["Neck002", 0.25]), Object.freeze(["Neck005", 0.3]), Object.freeze(["Head", 0.45])]),
        charge: Object.freeze([0.3, 1.3]),
        fire: Object.freeze([1.3, 4.6]),
        reach: Object.freeze([13, 18]),
        width: Object.freeze([1.2, 2.2]),
    }),
});

// Its colours: the beam's white-hot core, its blue fire and the haze round it; and the blue-white
// its glow turns as it charges
const CORE = new THREE.Color(0.92, 0.97, 1.0);
const FIRE = new THREE.Color(0.12, 0.42, 1.0);
const HAZE = new THREE.Color(0.04, 0.16, 0.75);
const TINT = new THREE.Color(0.15, 0.45, 1.0);

// How far its head and neck are turned to aim it at most (radians)
const MOST_TURN = THREE.MathUtils.degToRad(35);

// How far it's looked along for the ground (metres), and in steps of how far
const FURTHEST = 150;
const STRIDE = 1;

// How big its flares are (metres across: at its mouth, and where it lands), how far out over the
// ground the light where it lands reaches (metres), and how many billows of fire, sparks and puffs
// of mist it throws up there and sparks run along the beam
const MOUTH_FLARE = 7;
const LANDING_FLARE = 20;
const GROUND_GLOW = 18;
const BILLOWS = 150;
const SPARKS = 1200;
const MIST = 170;
const STREAKS = 280;

// Shaders' value noise, between 0 and 1
const NOISE = `
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }`;

// Somewhere off the screen, for what isn't to be drawn
const UNSEEN = "gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return;";

// A material drawn as light, added to what's behind it, by `uniforms` and its shaders
function light(uniforms, vertexShader, fragmentShader) {
    return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
}

// Something drawn where its shader puts it in the world, wherever it's hung (never culled: its
// geometry doesn't say where it is), marked as an effect, not part of the model (lab/inspect.js)
function effect(object, name, order) {
    object.name = name;
    object.frustumCulled = false;
    object.renderOrder = order;
    object.userData.effect = true;

    return object;
}

// The beam: a ribbon from the mouth to where it lands, turned to face the eye along its length
// (each point's x how far along, 0 to 1; its y which edge, -1 or 1)
function beamRibbon() {
    const segments = 96;
    const position = new Float32Array((segments + 1) * 6);
    const index = [];

    for (let i = 0; i <= segments; i++) {
        position.set([i / segments, -1, 0, i / segments, 1, 0], i * 6);

        if (i < segments) {
            index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setIndex(index);

    const material = light(
        { uMouth: { value: new THREE.Vector3() }, uHit: { value: new THREE.Vector3() }, uWidth: { value: new THREE.Vector2() }, uOut: { value: 0 }, uOn: { value: 0 }, uTime: { value: 0 }, uCore: { value: CORE }, uFire: { value: FIRE }, uHaze: { value: HAZE } },
        `
            uniform vec3 uMouth;
            uniform vec3 uHit;
            uniform vec2 uWidth;
            uniform float uOut;
            uniform float uTime;
            varying vec2 vAt;
            void main() {
                vec3 axis = uHit - uMouth;
                float far = max(1e-3, sqrt(dot(axis, axis)));
                float u = position.x * uOut;
                vec3 p = uMouth + axis * u;
                vec3 side = cross(axis / far, normalize(cameraPosition - p));
                side = dot(side, side) < 1e-6 ? vec3(0.0, 1.0, 0.0) : normalize(side);
                // (Thickening from the mouth, swelling as pulses run along it; its haze twice as wide)
                float width = mix(uWidth.x, uWidth.y, pow(u, 0.7)) * (1.0 + 0.1 * sin(u * far * 0.8 - uTime * 40.0));
                p += side * position.y * width * 2.2;
                vAt = vec2(u * far, position.y);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }`,
        `
            uniform float uOn;
            uniform float uTime;
            uniform vec3 uCore;
            uniform vec3 uFire;
            uniform vec3 uHaze;
            varying vec2 vAt;
            ${NOISE}
            void main() {
                float along = vAt.x;
                float churn = noise(vec2(along * 0.35 - uTime * 9.0, vAt.y * 2.5 + uTime * 1.3)) * 0.6 + noise(vec2(along * 1.1 - uTime * 23.0, vAt.y * 6.0)) * 0.4;
                // (How far out from its middle, in the fire's radius: its edges ragged)
                float r = abs(vAt.y) * 2.2 / (0.85 + 0.3 * churn);
                float core = exp(-r * r * 16.0);
                float fire = exp(-r * r * 1.6);
                float haze = exp(-r * r * 0.35) * (1.0 - abs(vAt.y)) * (1.0 - abs(vAt.y));
                // (Bands of light coiling round it, running out from the mouth)
                float coil = pow(0.5 + 0.5 * sin(along * 1.6 - uTime * 55.0 + vAt.y * 7.0), 6.0);
                vec3 colour = uCore * core * 1.4 + uFire * fire * (0.4 + 0.5 * churn + 0.35 * coil) + uHaze * haze * (0.25 + 0.35 * churn);
                gl_FragColor = vec4(colour * uOn * smoothstep(0.0, 1.2, along), 1.0);
            }`,
    );

    return effect(new THREE.Mesh(geometry, material), "beam", 3);
}

// A flare: a burst of light facing the eye, brought a little nearer it than where it is so what
// it's on doesn't cut it (its rays turned by `seed`)
function flare(name, size, seed) {
    const material = light(
        { uAt: { value: new THREE.Vector3() }, uSize: { value: size / 2 }, uOn: { value: 0 }, uTime: { value: 0 }, uSeed: { value: seed }, uCore: { value: CORE }, uFire: { value: FIRE } },
        `
            uniform vec3 uAt;
            uniform float uSize;
            varying vec2 vAt;
            void main() {
                vAt = position.xy;
                vec4 seen = modelViewMatrix * vec4(uAt, 1.0);
                seen.xyz += normalize(-seen.xyz) * uSize * 0.6;
                seen.xy += position.xy * uSize;
                gl_Position = projectionMatrix * seen;
            }`,
        `
            uniform float uOn;
            uniform float uTime;
            uniform float uSeed;
            uniform vec3 uCore;
            uniform vec3 uFire;
            varying vec2 vAt;
            void main() {
                float r = length(vAt);
                if (r > 1.0 || uOn <= 0.0) discard;
                float turn = atan(vAt.y, vAt.x);
                float core = exp(-r * r * 40.0);
                float glow = exp(-r * r * 5.0) * (1.0 - r);
                float rays = pow(max(0.0, sin(turn * 7.0 + uSeed + uTime * 1.7) * sin(turn * 4.0 - uTime * 2.3 + uSeed * 2.0)), 6.0) * (1.0 - r) * exp(-r * 1.5);
                gl_FragColor = vec4((uCore * core * 1.8 + uFire * (glow * 0.7 + rays * 0.8)) * uOn, 1.0);
            }`,
    );

    return effect(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material), name, 4);
}

// The ground lit where it lands: a pool of white-hot light, blue round it, rings of light running
// out from it, and a track glowing where it's raked across the ground since it first landed
function groundGlow() {
    const material = light(
        { uFrom: { value: new THREE.Vector3() }, uAt: { value: new THREE.Vector3() }, uSize: { value: GROUND_GLOW }, uOn: { value: 0 }, uTrack: { value: 0 }, uTime: { value: 0 }, uCore: { value: CORE }, uFire: { value: FIRE } },
        `
            uniform vec3 uFrom;
            uniform vec3 uAt;
            uniform float uSize;
            varying vec2 vWhere;
            void main() {
                vec2 along = uAt.xz - uFrom.xz;
                float far = sqrt(dot(along, along));
                vec2 way = far > 1e-3 ? along / far : vec2(1.0, 0.0);
                vec2 p = (uFrom.xz + uAt.xz) * 0.5 + way * position.x * (far * 0.5 + uSize) + vec2(-way.y, way.x) * position.y * uSize;
                vWhere = p;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, uAt.y + 0.06, p.y, 1.0);
            }`,
        `
            uniform vec3 uFrom;
            uniform vec3 uAt;
            uniform float uSize;
            uniform float uOn;
            uniform float uTrack;
            uniform float uTime;
            uniform vec3 uCore;
            uniform vec3 uFire;
            varying vec2 vWhere;
            ${NOISE}
            void main() {
                float d = length(vWhere - uAt.xz) / uSize;
                vec2 track = uAt.xz - uFrom.xz;
                float h = clamp(dot(vWhere - uFrom.xz, track) / max(dot(track, track), 1e-4), 0.0, 1.0);
                float e = length(vWhere - uFrom.xz - track * h) / uSize;
                float pool = exp(-d * d * 40.0);
                float glow = exp(-d * d * 3.0) * (1.0 - smoothstep(0.6, 1.0, d));
                float rings = 0.0;
                for (int k = 0; k < 3; k++) {
                    float w = fract(uTime * 1.8 + float(k) / 3.0);
                    rings += exp(-pow((d - w) * 12.0, 2.0)) * (1.0 - w) * (1.0 - w);
                }
                float lumps = noise(vWhere * 0.6 + uTime * 0.7);
                vec3 colour = (uCore * pool + uFire * (glow * (0.45 + 0.55 * lumps) + rings * 1.5)) * uOn + uFire * exp(-e * e * 60.0) * (0.4 + 0.4 * lumps) * uTrack;
                gl_FragColor = vec4(colour, 1.0);
            }`,
    );
    const ground = effect(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material), "beam ground", 2);

    material.polygonOffset = true;
    material.polygonOffsetFactor = -4;

    return ground;
}

// A cloud of points, each its own four numbers between 0 and 1 (aSeed), sized on the screen by the
// drawing buffer and the camera (as breath.js's puffs are), placed by its vertex shader
function cloud(name, count, uniforms, vertexShader, fragmentShader, order) {
    const seed = new Float32Array(count * 4);

    for (let i = 0; i < seed.length; i++) {
        const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;

        seed[i] = x - Math.floor(x);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));

    const material = light({ uScale: { value: 500 }, uTime: { value: -1 }, uCore: { value: CORE }, uFire: { value: FIRE }, ...uniforms }, vertexShader, fragmentShader);
    const points = effect(new THREE.Points(geometry, material), name, order);
    const buffer = new THREE.Vector2();

    points.onBeforeRender = (renderer, scene, camera) => {
        material.uniforms.uScale.value = (renderer.getDrawingBufferSize(buffer).y * camera.projectionMatrix.elements[5]) / 2;
    };

    return points;
}

// Where it lands at the moment a spark or a puff was thrown up (`born`, seconds after it began to
// fire): along the track it rakes
const LANDED = `
    uniform vec3 uFrom;
    uniform vec3 uTo;
    uniform float uTime;
    uniform float uLength;
    uniform float uScale;
    attribute vec4 aSeed;
    varying float vAge;
    varying float vSeed;
    vec3 landed(float born) {
        return mix(uFrom, uTo, clamp(born / max(uLength, 1e-3), 0.0, 1.0));
    }`;

// Sparks thrown up where it lands, out every way and up, and on the way the beam was going, falling
function sparks() {
    return cloud(
        "beam sparks",
        SPARKS,
        { uFrom: { value: new THREE.Vector3() }, uTo: { value: new THREE.Vector3() }, uLength: { value: 1 }, uWay: { value: new THREE.Vector3(1, 0, 0) } },
        `
            ${LANDED}
            uniform vec3 uWay;
            void main() {
                float life = mix(0.45, 1.15, aSeed.x);
                float age = mod(uTime + aSeed.y * life, life);
                float born = uTime - age;
                vAge = age / life;
                vSeed = aSeed.w;
                if (uTime < 0.0 || born < 0.0 || born > uLength) { ${UNSEEN} }
                vec3 at = landed(born);
                float turn = aSeed.z * 6.2832;
                float up = mix(0.25, 1.0, fract(aSeed.w * 7.13));
                vec3 thrown = vec3(cos(turn) * sqrt(1.0 - up * up), up, sin(turn) * sqrt(1.0 - up * up));
                vec3 way = normalize(mix(thrown, reflect(uWay, vec3(0.0, 1.0, 0.0)), 0.45 * fract(aSeed.x * 3.7)));
                vec3 p = at + way * mix(8.0, 34.0, pow(fract(aSeed.y * 5.3), 1.5)) * age - vec3(0.0, 7.0, 0.0) * age * age;
                p.y = max(p.y, at.y + 0.1);
                vec4 seen = modelViewMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * seen;
                gl_PointSize = 0.42 * (1.0 - 0.6 * vAge) * uScale / -seen.z;
            }`,
        `
            uniform vec3 uCore;
            uniform vec3 uFire;
            varying float vAge;
            varying float vSeed;
            void main() {
                float r = length(gl_PointCoord - 0.5) * 2.0;
                if (r > 1.0) discard;
                vec3 colour = mix(uCore * 1.6, uFire, smoothstep(0.1, 0.6, vAge));
                gl_FragColor = vec4(colour * (1.0 - r * r) * (1.0 - vAge), 1.0);
            }`,
        5,
    );
}

// Billows of blue-white fire bursting up and out where it lands, swelling as they burn out
function billows() {
    return cloud(
        "beam billows",
        BILLOWS,
        { uFrom: { value: new THREE.Vector3() }, uTo: { value: new THREE.Vector3() }, uLength: { value: 1 } },
        `
            ${LANDED}
            void main() {
                float life = mix(0.45, 0.9, aSeed.x);
                float age = mod(uTime + aSeed.y * life, life);
                float born = uTime - age;
                vAge = age / life;
                vSeed = aSeed.w;
                if (uTime < 0.0 || born < 0.0 || born > uLength) { ${UNSEEN} }
                float turn = aSeed.z * 6.2832;
                float up = mix(0.15, 0.95, aSeed.w);
                vec3 way = vec3(cos(turn) * sqrt(1.0 - up * up), up, sin(turn) * sqrt(1.0 - up * up));
                float gone = mix(4.0, 12.0, aSeed.y) * (1.0 - exp(-2.5 * age)) / 2.5;
                vec4 seen = modelViewMatrix * vec4(landed(born) + way * (0.5 + gone) + vec3(0.0, 0.8, 0.0), 1.0);
                gl_Position = projectionMatrix * seen;
                gl_PointSize = mix(3.0, 5.0, aSeed.z) * (0.6 + 1.6 * pow(vAge, 0.6)) * uScale / -seen.z;
            }`,
        `
            uniform vec3 uCore;
            uniform vec3 uFire;
            varying float vAge;
            varying float vSeed;
            void main() {
                vec2 c = gl_PointCoord - 0.5;
                float r = length(c) * 2.0;
                if (r > 1.0) discard;
                float lumps = 0.65 + 0.35 * sin(atan(c.y, c.x) * 3.0 + vSeed * 20.0 + vAge * 6.0) * sin(r * 7.0 - vSeed * 9.0);
                vec3 colour = mix(uCore, uFire, smoothstep(0.0, 0.3, vAge));
                gl_FragColor = vec4(colour * pow(1.0 - r, 1.5) * lumps * 0.32 * pow(1.0 - vAge, 1.4), 1.0);
            }`,
        4,
    );
}

// Blue mist rolling off where it lands, spreading and rising as it thins
function mist() {
    return cloud(
        "beam mist",
        MIST,
        { uFrom: { value: new THREE.Vector3() }, uTo: { value: new THREE.Vector3() }, uLength: { value: 1 } },
        `
            ${LANDED}
            void main() {
                float life = mix(1.6, 2.9, aSeed.x);
                float age = mod(uTime + aSeed.y * life, life);
                float born = uTime - age;
                vAge = age / life;
                vSeed = aSeed.w;
                if (uTime < 0.0 || born < 0.0 || born > uLength) { ${UNSEEN} }
                float turn = aSeed.z * 6.2832;
                float spread = mix(0.5, 3.0, aSeed.w) + mix(2.0, 7.0, aSeed.y) * (1.0 - exp(-1.2 * age)) / 1.2;
                vec3 p = landed(born) + vec3(cos(turn), 0.0, sin(turn)) * spread + vec3(0.0, mix(0.5, 2.0, aSeed.z) + age * mix(1.2, 3.0, aSeed.w), 0.0);
                vec4 seen = modelViewMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * seen;
                gl_PointSize = mix(3.0, 5.5, aSeed.z) * (1.0 + 1.8 * vAge) * uScale / -seen.z;
            }`,
        `
            uniform vec3 uFire;
            varying float vAge;
            varying float vSeed;
            void main() {
                vec2 c = gl_PointCoord - 0.5;
                float r = length(c) * 2.0;
                if (r > 1.0) discard;
                float lumps = 0.7 + 0.3 * sin(atan(c.y, c.x) * 3.0 + vSeed * 20.0 + vAge * 5.0) * sin(r * 6.0 - vSeed * 9.0);
                gl_FragColor = vec4(mix(uFire, vec3(0.6, 0.8, 1.0), 0.35) * pow(1.0 - r, 1.5) * lumps * 0.28 * (1.0 - vAge) * smoothstep(0.0, 0.15, vAge), 1.0);
            }`,
        1,
    );
}

// Sparks running out along the beam, coiling round it
function streaks() {
    return cloud(
        "beam streaks",
        STREAKS,
        { uMouth: { value: new THREE.Vector3() }, uHit: { value: new THREE.Vector3() }, uWidth: { value: new THREE.Vector2() }, uOut: { value: 0 }, uOn: { value: 0 } },
        `
            uniform vec3 uMouth;
            uniform vec3 uHit;
            uniform vec2 uWidth;
            uniform float uOut;
            uniform float uOn;
            uniform float uTime;
            uniform float uScale;
            attribute vec4 aSeed;
            varying float vAge;
            varying float vSeed;
            void main() {
                float u = fract(aSeed.x + uTime * mix(1.2, 2.4, aSeed.y));
                vAge = u;
                vSeed = aSeed.w;
                if (uOn <= 0.0 || u > uOut) { ${UNSEEN} }
                vec3 axis = uHit - uMouth;
                vec3 way = normalize(axis);
                vec3 a = normalize(abs(way.y) > 0.95 ? cross(way, vec3(1.0, 0.0, 0.0)) : cross(way, vec3(0.0, 1.0, 0.0)));
                vec3 b = cross(way, a);
                float turn = aSeed.w * 6.2832 + u * 9.0 + uTime * 5.0;
                float r = mix(uWidth.x, uWidth.y, u) * mix(0.5, 1.5, aSeed.z);
                vec4 seen = modelViewMatrix * vec4(uMouth + axis * u + (a * cos(turn) + b * sin(turn)) * r, 1.0);
                gl_Position = projectionMatrix * seen;
                gl_PointSize = 0.22 * uScale / -seen.z;
            }`,
        `
            uniform float uOn;
            uniform vec3 uCore;
            uniform vec3 uFire;
            varying float vAge;
            void main() {
                float r = length(gl_PointCoord - 0.5) * 2.0;
                if (r > 1.0) discard;
                gl_FragColor = vec4(mix(uCore * 1.4, uFire, vAge) * (1.0 - r * r) * uOn, 1.0);
            }`,
        5,
    );
}

/**
 * The model's glow (its materials' emissive maps) made to charge and burn: each material that
 * glows given in its place a copy that can, sharing `uniforms` (uCharge: how far from its tail to
 * its head it's lit, 0 to 1, below 0 none of it; uGain: how much brighter, lit; uHeat: how far
 * toward the beam's blue-white, lit; uFace: its face lit by the beam, 0 to 1), measured along it
 * from its tail's tip to its head (`tail`, `span`: where its tail's tip is and the way to its head,
 * over the distance squared, in its meshes' own frame). How to give the meshes back their own.
 */
function charged(model, uniforms) {
    const copies = new Map();
    const meshes = [];

    model.traverse((node) => {
        if (!node.isMesh || !node.material?.emissiveMap) {
            return;
        }

        if (!copies.has(node.material)) {
            const copy = node.material.clone();

            copy.onBeforeCompile = (shader) => {
                Object.assign(shader.uniforms, uniforms);
                shader.vertexShader = shader.vertexShader
                    .replace("#include <common>", "#include <common>\nuniform vec3 uTail;\nuniform vec3 uSpan;\nvarying float vAlong;")
                    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlong = dot(transformed - uTail, uSpan);");
                shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uCharge;\nuniform float uGain;\nuniform float uHeat;\nuniform float uFace;\nuniform vec3 uTint;\nvarying float vAlong;").replace(
                    "#include <emissivemap_fragment>",
                    `#include <emissivemap_fragment>
                    float lit = 1.0 - smoothstep(uCharge - 0.07, uCharge, vAlong);
                    float crest = uCharge < 0.0 || uCharge > 1.2 ? 0.0 : exp(-pow((vAlong - uCharge) / 0.035, 2.0));
                    float bright = max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b));
                    totalEmissiveRadiance = mix(totalEmissiveRadiance, uTint * bright, max(lit, crest) * uHeat) * (1.0 + uGain * lit + 3.0 * crest);
                    totalEmissiveRadiance += diffuseColor.rgb * uTint * uFace * smoothstep(0.86, 0.97, vAlong);`,
                );
            };
            copy.customProgramCacheKey = () => "charged glow";
            copies.set(node.material, copy);
        }

        meshes.push([node, node.material]);
        node.material = copies.get(node.material);
    });

    return () => {
        for (const [mesh, material] of meshes) {
            mesh.material = material;
        }

        for (const copy of copies.values()) {
            copy.dispose();
        }
    };
}

// Where a bone is in a skinned mesh's own frame as it was bound to it
function boundAt(mesh, bone) {
    const i = mesh.skeleton.bones.indexOf(bone);

    return new THREE.Vector3().applyMatrix4(mesh.skeleton.boneInverses[i].clone().invert()).applyMatrix4(mesh.bindMatrixInverse);
}

// How far on between two moments it is, eased (0 before, 1 after)
const between = (t, from, to) => THREE.MathUtils.smoothstep(t, from, to);

/**
 * A model's breath (`setting`: one of BEAMS), for `model` (its scene: its bones and meshes): its
 * `object` to hang on it (or anywhere: it's drawn where it is in the world), and `at(clip, time)`
 * to pose it for that moment of a clip, once the clip's been played to it. `groundAt(x, z)`: the
 * ground's height (metres; 0 if it doesn't say). What it's doing, for scripts: `state`.
 */
export class EnergyBreath {
    constructor(model, setting, { groundAt = () => 0 } = {}) {
        this.model = model;
        this.setting = setting;
        this.groundAt = groundAt;

        const bone = (name) => model.getObjectByName(name);

        this.head = bone(setting.mouth.head);
        this.lower = bone(setting.mouth.lower);
        this.hinge = bone(setting.mouth.hinge);
        this.upper = new THREE.Vector3(...setting.mouth.upper);
        this.neck = setting.neck.map(([name, share]) => [bone(name), share]);

        this.beam = beamRibbon();
        this.mouthFlare = flare("beam mouth", MOUTH_FLARE, 1.3);
        this.landingFlare = flare("beam landing", LANDING_FLARE, 4.7);
        this.ground = groundGlow();
        this.billows = billows();
        this.sparks = sparks();
        this.mist = mist();
        this.streaks = streaks();
        this.parts = [this.beam, this.mouthFlare, this.landingFlare, this.ground, this.billows, this.sparks, this.mist, this.streaks];
        this.object = new THREE.Group();
        this.object.name = "energy breath";
        this.object.userData.effect = true;
        // (Where it's drawn is where it is in the world, wherever it's hung)
        this.object.matrixAutoUpdate = false;
        this.object.matrixWorldAutoUpdate = false;
        this.object.add(...this.parts);

        // (Its glow measured from its tail's tip, the bone furthest from its head, to its head)
        let skinned = null;

        model.traverse((node) => {
            skinned ??= node.isSkinnedMesh ? node : null;
        });

        this.glow = { uCharge: { value: -1 }, uGain: { value: 0 }, uHeat: { value: 0 }, uFace: { value: 0 }, uTint: { value: TINT }, uTail: { value: new THREE.Vector3() }, uSpan: { value: new THREE.Vector3() } };

        if (skinned) {
            const head = boundAt(skinned, this.head);
            const tail = skinned.skeleton.bones.map((b) => boundAt(skinned, b)).reduce((far, at) => (at.distanceToSquared(head) > far.distanceToSquared(head) ? at : far), head);
            const span = head.clone().sub(tail);

            this.glow.uTail.value.copy(tail);
            this.glow.uSpan.value.copy(span.divideScalar(Math.max(1e-6, span.lengthSq())));
        }

        this.unglow = charged(model, this.glow);

        // (How far ahead of where it stands its mouth is, as it stands, in its own measure: as big
        // as it's drawn when it's aimed, #target, however it's scaled as it's made)
        model.updateWorldMatrix(true, true);
        this.ahead = this.#mouth().mouth.sub(model.getWorldPosition(new THREE.Vector3())).dot(this.#forward()) / model.getWorldScale(new THREE.Vector3()).x;

        this.state = { firing: false, glow: 0, aim: 0, hit: null, length: 0 };
    }

    // The way it faces, level (its model faces +z)
    #forward() {
        const way = new THREE.Vector3(0, 0, 1).transformDirection(this.model.matrixWorld);

        way.y = 0;

        return way.lengthSq() > 1e-8 ? way.normalize() : way.set(0, 0, 1);
    }

    // Its mouth in the world as it is now: between its lips, a quarter of the way back to its
    // jaw's hinge; and the way out of it, halfway between its jaws
    #mouth() {
        const upper = this.upper.clone().applyMatrix4(this.head.matrixWorld);
        const lower = new THREE.Vector3().setFromMatrixPosition(this.lower.matrixWorld);
        const hinge = new THREE.Vector3().setFromMatrixPosition(this.hinge.matrixWorld);
        const way = upper.clone().sub(hinge).normalize().add(lower.clone().sub(hinge).normalize()).normalize();

        return { mouth: upper.add(lower).multiplyScalar(0.5).lerp(hinge, 0.25), way };
    }

    // Where it means to hit the ground, so far ahead of its mouth (metres)
    #target(reach) {
        const at = this.model.getWorldPosition(new THREE.Vector3()).addScaledVector(this.#forward(), this.ahead * this.model.getWorldScale(new THREE.Vector3()).x + reach);

        at.y = this.groundAt(at.x, at.z);

        return at;
    }

    // A bone turned by `turn` (in the world), and all it carries with it
    #turnBone(bone, turn) {
        const above = bone.parent.getWorldQuaternion(new THREE.Quaternion());

        bone.quaternion.premultiply(above.clone().invert().multiply(turn).multiply(above));
        bone.updateWorldMatrix(false, true);
    }

    // Its head and neck turned, each its share, so the way out of its mouth is `weight` of the way
    // from where the clip has it toward `target` (MOST_TURN at most); then its head alone, twice,
    // to put right what's left (the mouth moved as they turned)
    #aim(target, weight) {
        const first = this.#mouth();
        const natural = first.way.clone();
        const goal = (mouth) => {
            const want = natural.clone().lerp(target.clone().sub(mouth).normalize(), weight).normalize();
            const angle = natural.angleTo(want);

            return angle > MOST_TURN ? natural.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(natural, want).slerp(new THREE.Quaternion(), 1 - MOST_TURN / angle)) : want;
        };
        const turn = new THREE.Quaternion().setFromUnitVectors(natural, goal(first.mouth));

        for (const [bone, share] of this.neck) {
            this.#turnBone(bone, new THREE.Quaternion().slerp(turn, share));
        }

        for (let again = 0; again < 2; again++) {
            const now = this.#mouth();

            this.#turnBone(this.head, new THREE.Quaternion().setFromUnitVectors(now.way, goal(now.mouth)));
        }
    }

    // Where the way out of its mouth meets the ground, or null if it doesn't, near enough
    #landing(mouth, way) {
        const ahead = (s) => mouth.y + way.y * s - this.groundAt(mouth.x + way.x * s, mouth.z + way.z * s);

        for (let s = STRIDE; s <= FURTHEST; s += STRIDE) {
            if (ahead(s) <= 0) {
                let [near, far] = [s - STRIDE, s];

                for (let i = 0; i < 12; i++) {
                    const middle = (near + far) / 2;

                    [near, far] = ahead(middle) > 0 ? [middle, far] : [near, middle];
                }

                return mouth.clone().addScaledVector(way, far);
            }
        }

        return null;
    }

    /** Posed for `time` seconds into `clip` (once the clip's been played to it): aimed, lit and drawn, or not if it isn't its breath. */
    at(clip, time) {
        const { fire, charge, reach, width } = this.setting;
        const t = clip === this.setting.clip ? time : -1;
        const [f0, f1] = fire;
        const flicker = 0.92 + 0.08 * Math.sin(t * 47) * Math.sin(t * 29 + 1);
        const aim = between(t, f0 - 0.45, f0 - 0.05) * (1 - between(t, f1, f1 + 0.5));
        const raked = Math.min(1, Math.max(0, (t - f0) / (f1 - f0)));

        // (Not its breath: nothing of it drawn, its glow its own, its head as the clip has it)
        this.object.visible = t >= 0;

        if (t < 0) {
            Object.assign(this.state, { firing: false, glow: 0, aim: 0, hit: null, length: 0 });
            this.glow.uCharge.value = -1;
            this.glow.uGain.value = this.glow.uHeat.value = this.glow.uFace.value = 0;

            return;
        }

        this.model.updateWorldMatrix(true, true);

        if (aim > 0) {
            this.#aim(this.#target(reach[0] + (reach[1] - reach[0]) * raked), aim);
        }

        const { mouth, way } = this.#mouth();
        const landing = this.#landing(mouth, way);
        const hit = landing ?? mouth.clone().addScaledVector(way, FURTHEST);
        const on = between(t, f0, f0 + 0.08) * (1 - between(t, f1 - 0.25, f1)) * flicker;
        const out = Math.min(1, Math.max(0, (t - f0) / 0.14));
        const landed = landing && out >= 1 ? between(t, f0 + 0.12, f0 + 0.22) * (1 - between(t, f1 - 0.1, f1 + 0.25)) : 0;
        const after = t > f1 ? Math.exp(-(t - f1) * 1.5) : 1;

        // (Its glow: charged from its tail to its head, then at its brightest as it fires, dying
        // away after)
        const [c0, c1] = charge;
        const heat = between(t, c0, c1) * (t > f1 ? Math.exp(-(t - f1) * 2) : 1);
        const glow = t < c0 ? 0 : t < f0 ? 2 * between(t, c0, f0) : 3.5 * (t > f1 ? Math.exp(-(t - f1) * 2.5) : flicker);

        this.glow.uCharge.value = t < c0 ? -1 : t < c1 ? THREE.MathUtils.lerp(-0.1, 1.3, between(t, c0, c1)) : 3;
        this.glow.uGain.value = glow;
        this.glow.uHeat.value = heat;
        this.glow.uFace.value = 0.9 * on;

        for (const part of [this.beam, this.streaks]) {
            const { uniforms } = part.material;

            uniforms.uMouth.value.copy(mouth);
            uniforms.uHit.value.copy(hit);
            uniforms.uWidth.value.set(...width);
            uniforms.uOut.value = out;
            uniforms.uOn.value = on;
            uniforms.uTime.value = Math.max(0, t);
        }

        this.mouthFlare.material.uniforms.uAt.value.copy(mouth).addScaledVector(way, 0.8);
        this.mouthFlare.material.uniforms.uOn.value = Math.max(0.55 * between(t, f0 - 0.5, f0) * (1 - between(t, f1 - 0.25, f1)), on);
        // (Where it lands now, and the track it's raked from where it first landed: where it last
        // landed once it's stopped, as its head comes back up)
        const from = this.#target(reach[0]);
        const to = this.#target(reach[1]);
        const { uniforms: lit } = this.ground.material;

        this.landingFlare.material.uniforms.uAt.value.copy(t > f1 ? to : hit).y += LANDING_FLARE * 0.18;
        this.landingFlare.material.uniforms.uOn.value = landed * flicker;
        lit.uFrom.value.copy(from);
        lit.uAt.value.copy(t > f1 || !landing ? to : landing);
        lit.uOn.value = landing ? Math.max(landed, t > f1 ? after * 0.6 : 0) * flicker : 0;
        lit.uTrack.value = between(t, f0 + 0.3, f0 + 1) * (t > f1 ? Math.exp(-(t - f1) * 0.8) : 1);

        for (const part of [this.billows, this.sparks, this.mist]) {
            const { uniforms } = part.material;

            uniforms.uFrom.value.copy(from);
            uniforms.uTo.value.copy(to);
            uniforms.uLength.value = f1 - f0;
            uniforms.uTime.value = t < 0 ? -1 : t - f0 - 0.12;
        }

        this.sparks.material.uniforms.uWay.value.copy(way);

        for (const part of [this.mouthFlare, this.landingFlare, this.ground]) {
            part.material.uniforms.uTime.value = Math.max(0, t);
        }

        this.state = { firing: on > 0, glow, aim, hit: landing ? landing.clone().sub(mouth).dot(this.#forward()) : null, length: on > 0 ? hit.distanceTo(mouth) : 0 };
    }

    dispose() {
        this.object.removeFromParent();
        this.unglow();

        for (const part of this.parts) {
            part.geometry.dispose();
            part.material.dispose();
        }
    }
}
