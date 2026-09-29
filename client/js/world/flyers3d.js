// What flies over the world outside, now and then: flocks of birds of the land the player's in
// (songbirds and crows over the fields and woods, gulls by the water, vultures circling high over
// dry lands and the mountains, herons over the marsh, parrots over the jungle, geese in a V over
// the tundra and the snow), wyverns over the wild lands they hunt in, and near a dragon's lair,
// while it's there, the dragon itself, circling high. They're only to be seen: no one fights
// them in the air. A wyvern or the dragon that comes down to fight is its battle's creature,
// landing (beasts/beast.js arrive: `takeAloft` hands over one already up there to come down).
//
// Each kind of bird is one instanced mesh (a dozen triangles a bird), its wings beating in the
// shader, each bird's own time; each flock flies across near the player, or circles, and is gone
// once it's far off. The wyverns and the dragon are the creatures as they're drawn on the ground,
// flying: each built a little each frame before it comes (the first of each of its kind's looks
// takes a while to sculpt: beasts/sculpt.js). Every flier is drawn by each player's own game, from
// its own random numbers.

import * as THREE from "three";
import { BeastAvatar } from "../beasts/beast.js";
import { sculpting } from "../beasts/sculpt.js";
import { Steps } from "../core/steps.js";

/**
 * The birds: how big (metres across the wings), their colours (one of them each: sRGB), how many
 * in a flock, how fast they fly (m/s), how high (metres), how fast their wings beat (a second),
 * how much of the time they glide, their shape (wings short, long and narrow, broad; or a heron's
 * neck and legs), and whether they circle (soaring on the air) or fly in a V.
 */
export const BIRDS = Object.freeze({
    songbird: { size: 0.36, colours: [0x6a5a48, 0x8a7458, 0x5a5448], flock: [6, 12], speed: [7, 10], height: [5, 16], beats: [9, 13], glide: 0.25, shape: "short" },
    crow: { size: 0.85, colours: [0x16161a, 0x222228], flock: [3, 6], speed: [8, 10], height: [9, 24], beats: [3.8, 5], glide: 0.3, shape: "short" },
    gull: { size: 1.1, colours: [0xf0f0ec, 0xd8dcdc], flock: [2, 5], speed: [7, 10], height: [10, 28], beats: [2.8, 3.6], glide: 0.6, shape: "long" },
    vulture: { size: 2.4, colours: [0x3a2e24, 0x2c241c], flock: [1, 3], speed: [6, 8], height: [28, 42], beats: [1.4, 1.8], glide: 0.92, shape: "broad", circles: true },
    heron: { size: 1.5, colours: [0xd4d8d8, 0x98a2a8], flock: [1, 2], speed: [6, 8], height: [7, 16], beats: [2, 2.6], glide: 0.2, shape: "heron" },
    parrot: { size: 0.5, colours: [0x2a9a3a, 0xd83a20, 0x2a6ad8, 0xe8c020], flock: [4, 8], speed: [9, 12], height: [7, 18], beats: [9, 12], glide: 0.1, shape: "short" },
    goose: { size: 1.3, colours: [0x6a6258, 0x7a7266], flock: [5, 9], speed: [11, 13], height: [24, 38], beats: [3, 3.6], glide: 0.05, shape: "long", v: true },
});

/** Which birds fly over each land (as likely as each other: listed twice, twice as likely). */
export const LAND_BIRDS = Object.freeze({
    sea: ["gull"],
    lake: ["gull", "goose"],
    beach: ["gull"],
    farmland: ["crow", "songbird", "crow"],
    meadow: ["songbird", "songbird", "crow"],
    woods: ["songbird", "crow"],
    heath: ["crow", "songbird", "vulture"],
    marsh: ["heron", "goose", "heron"],
    elfwood: ["songbird"],
    darkwood: ["crow"],
    savannah: ["vulture", "songbird", "vulture"],
    jungle: ["parrot", "heron", "parrot"],
    badlands: ["vulture", "crow"],
    volcanic: ["crow", "vulture"],
    tundra: ["goose"],
    snow: ["goose", "crow"],
    mountain: ["vulture"],
});

/** The lands wyverns fly over (as creatures.js has them hunt in). */
export const WYVERN_LANDS = Object.freeze(["mountain", "badlands", "volcanic", "snow"]);

/**
 * How often (seconds between tries, and the chance each try) a flock, a wyvern, comes; how many
 * flocks at once at most; how far off they come from and are gone at (metres); and how near a
 * dragon's lair (metres) its dragon's seen circling.
 */
export const FLYING = Object.freeze({ every: [5, 14], chance: 0.7, flocks: 3, wyvern: [40, 110], wyvernChance: 0.5, from: 95, gone: 115, lair: 420 });

/** How high the wyverns and the dragon fly (metres). */
export const ALOFT = Object.freeze({ wyvern: [18, 30], dragon: [28, 40] });

// How long (ms) a frame gives to building a wyvern or dragon that's to come
const HATCHING = 2;

const TAU = Math.PI * 2;
const MOST = 32;

// A bird of a shape, a metre across the wings, facing +z: its body, head and tail, and each wing in
// two parts (the inner and the outer, `wing` 0 at the body to 1 at the tip: how far it beats)
function birdGeometry(shape) {
    const positions = [];
    const wings = [];
    const tri = (a, b, c, w = [0, 0, 0]) => {
        positions.push(...a, ...b, ...c);
        wings.push(...w);
    };
    const [chord, tip, sweep] = { short: [0.2, 0.1, 0.08], long: [0.14, 0.06, 0.12], broad: [0.26, 0.2, 0.02], heron: [0.22, 0.12, 0.05] }[shape];
    const long = shape === "heron" ? 0.42 : 0.22;

    // The body: a slim diamond, nose to tail, and a fanned tail
    const [nose, back, top, under] = [[0, 0, long], [0, 0, -0.24], [0, 0.035, 0.02], [0, -0.04, 0.02]];

    for (const side of [-1, 1]) {
        const flank = [side * 0.045, 0, 0.02];

        tri(nose, flank, top);
        tri(nose, under, flank);
        tri(back, top, flank);
        tri(back, flank, under);
        tri(back, [side * 0.09, 0, -0.34], [0, 0.005, -0.36]);
    }

    // A heron's long legs trailing behind
    if (shape === "heron") {
        tri([0.02, -0.02, -0.2], [-0.02, -0.02, -0.2], [0, -0.03, -0.62]);
    }

    // The wings: inner and outer, swept back towards the tip
    for (const side of [-1, 1]) {
        const root = [[side * 0.04, 0, 0.06], [side * 0.04, 0, 0.06 - chord]];
        const elbow = [[side * 0.26, 0.01, 0.05 - sweep * 0.4], [side * 0.26, 0.01, 0.05 - sweep * 0.4 - chord * 0.9]];
        const end = [[side * 0.5, 0, 0.02 - sweep], [side * 0.5, 0, 0.02 - sweep - tip]];

        tri(root[0], root[1], elbow[0], [0, 0, 0.5]);
        tri(root[1], elbow[1], elbow[0], [0, 0.5, 0.5]);
        tri(elbow[0], elbow[1], end[0], [0.5, 0.5, 1]);
        tri(elbow[1], end[1], end[0], [0.5, 1, 1]);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("wing", new THREE.Float32BufferAttribute(wings, 1));
    geometry.computeVertexNormals();

    return geometry;
}

// A kind of bird's mesh: each bird an instance, its wings beating in the shader by its own
// `flap` (x: where it is in its stroke, radians; y: how hard it's beating, 0 to 1)
function birdMesh(kind) {
    const spec = BIRDS[kind];
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(birdGeometry(spec.shape), material, MOST);
    const flap = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 2), 2);

    // (Each bird's own colour, there from the start: made on the first bird's, it would change the
    // shader, compiled while flying rather than with the rest while loading)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 3).fill(1), 3);

    mesh.geometry.setAttribute("flap", flap);
    material.name = `bird ${kind}`;
    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float wing;\nattribute vec2 flap;").replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
// (Beating: the wing up and down about the body, more at its tip, the outer part lagging; held a
// little up in a glide)
float stroke = sin(flap.x - wing * 0.8) * flap.y + (1.0 - flap.y) * 0.12;
transformed.y += stroke * wing * wing * 0.5 + stroke * wing * 0.12;
transformed.x *= 1.0 - abs(stroke) * wing * 0.12;`,
        );
    };
    material.customProgramCacheKey = () => "bird";
    mesh.name = `birds ${kind}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.userData.flap = flap;

    return mesh;
}

// A number between two, from a random function
const between = (random, [least, most]) => least + random() * (most - least);

/**
 * The fliers over the world outside: add `object` to the scene; each frame `update(dt, time, {
 * x, z }, { outdoors })` with where the player is (metres). `landAt(x, z)`: the land (a BIOMES id)
 * at a point; `lairs()`: the dragons' lairs to show a dragon circling over ([{ at: [x, z] }]:
 * those whose dragon's alive and not on the ground near the player); `random`: the random
 * numbers to use (Math.random).
 */
export class Flyers {
    constructor({ landAt, lairs = () => [], random = Math.random, prepare = null }) {
        this.landAt = landAt;
        this.lairs = lairs;
        this.random = random;

        // (Gets a wyvern or dragon ready to draw, its shaders compiled, before it's first shown:
        // View.prepare)
        this.prepare = prepare;
        this.object = new THREE.Group();
        this.object.name = "flyers";
        this.meshes = new Map(Object.keys(BIRDS).map((kind) => [kind, birdMesh(kind)]));
        this.object.add(...this.meshes.values());

        /** The flocks flying: { kind, birds: [{ offset, phase, colour }], mode, ... }. */
        this.flocks = [];

        /** The wyverns and dragons up in the air: { kind, beast, mode, ... }. */
        this.aloft = [];

        /** A wyvern or dragon being built to come (one at a time): { kind, steps, up(beast, player) }. */
        this.hatching = null;
        this.next = between(random, FLYING.every) * 0.5;
        this.nextWyvern = between(random, FLYING.wyvern);
        this._matrix = new THREE.Matrix4();
        this._quaternion = new THREE.Quaternion();
        this._euler = new THREE.Euler(0, 0, 0, "YXZ");
        this._scale = new THREE.Vector3();
        this._at = new THREE.Vector3();
        this._colour = new THREE.Color();
    }

    /** Step them on `dt` seconds (`time`: seconds), round the player ({ x, z }, metres). */
    update(dt, time, player, { outdoors = true } = {}) {
        this.object.visible = outdoors;

        if (!outdoors) {
            return;
        }

        this.#come(dt, player);

        for (const flock of this.flocks) {
            this.#fly(flock, dt, player);
        }

        this.flocks = this.flocks.filter((flock) => !flock.gone);
        this.#dragon(player);
        this.#hatchOn(player);

        for (const flier of this.aloft) {
            this.#fly(flier, dt, player);
            flier.beast.soar(dt, flier.x, flier.y, flier.z, flier.heading, { beat: flier.beat, bank: flier.bank, climb: flier.climb });
        }

        for (const flier of this.aloft.filter((one) => one.gone)) {
            this.#let(flier);
        }

        this.#draw(time);
    }

    /**
     * Hand over a flier of a kind (a wyvern, a dragon) up in the air within `within` metres of a
     * point (metres) to come down and land there as a creature on the ground: where it is
     * ([x, y, z]), and it's gone from the air; or null if there's none.
     */
    takeAloft(kind, [x, z], within = 160) {
        const flier = this.aloft.find((one) => one.kind === kind && Math.hypot(one.x - x, one.z - z) < within);

        if (!flier) {
            return null;
        }

        this.#let(flier);

        return [flier.x, flier.y, flier.z];
    }

    /**
     * Send a flock of a kind of bird (BIRDS), or a wyvern or a dragon, flying by near the player
     * ({ x, z }) now (for the labs and tests; `circles`: circling over a while).
     */
    send(kind, player, { circles = false } = {}) {
        if (BIRDS[kind]) {
            this.#flock(kind, player);
            this.flocks.at(-1).mode = circles ? "circle" : this.flocks.at(-1).mode;
            Object.assign(this.flocks.at(-1), circles ? this.#course(player, { speed: this.flocks.at(-1).speed, height: BIRDS[kind].height, circles: true }) : {});
        } else {
            this.aloft.push({ kind, beast: this.#beast(new BeastAvatar(kind, { seed: this.#seed() })), ...this.#course(player, { speed: kind === "dragon" ? 13 : 11, height: ALOFT[kind], circles, radius: [24, 36] }) });
        }
    }

    /** How many birds are flying, and wyverns and dragons in the air. */
    get counts() {
        return { flocks: this.flocks.length, birds: this.flocks.reduce((sum, flock) => sum + flock.birds.length, 0), aloft: this.aloft.length };
    }

    // Now and then a flock of the land's birds comes by, or over the wild lands a wyvern
    #come(dt, player) {
        const land = this.landAt(player.x, player.z);

        this.next -= dt;
        this.nextWyvern -= dt;

        if (this.next <= 0) {
            this.next = between(this.random, FLYING.every);

            const kinds = LAND_BIRDS[land] ?? [];

            if (kinds.length && this.flocks.length < FLYING.flocks && this.random() < FLYING.chance) {
                this.#flock(kinds[Math.floor(this.random() * kinds.length)], player);
            }
        }

        if (this.nextWyvern <= 0) {
            this.nextWyvern = between(this.random, FLYING.wyvern);

            if (WYVERN_LANDS.includes(land) && !this.aloft.some(({ kind }) => kind === "wyvern") && !this.hatching && this.random() < FLYING.wyvernChance) {
                const circles = this.random() < 0.5;

                this.#hatch("wyvern", (beast, now) => this.aloft.push({ kind: "wyvern", beast, ...this.#course(now, { speed: 11, height: ALOFT.wyvern, circles, radius: [20, 30] }) }));
            }
        }
    }

    // A flock of a kind of bird, coming from off to one side and flying across near the player
    // (or circling over somewhere near them, a while, before it goes)
    #flock(kind, player) {
        const spec = BIRDS[kind];
        const count = Math.round(between(this.random, spec.flock));
        const spread = spec.size * (spec.v ? 2.2 : 3.5) + 1;
        const birds = Array.from({ length: count }, (_, k) => {
            // (In a V, each behind and to one side of the one before; otherwise a loose cloud)
            const offset = spec.v
                ? new THREE.Vector3((k % 2 ? 1 : -1) * Math.ceil(k / 2) * spread * 0.7, (this.random() - 0.5) * 0.4, -Math.ceil(k / 2) * spread * 0.6)
                : new THREE.Vector3((this.random() - 0.5) * spread * 2, (this.random() - 0.5) * spread * 0.8, (this.random() - 0.5) * spread * 2);

            return { offset, phase: this.random() * TAU, rate: between(this.random, spec.beats) * TAU, colour: spec.colours[Math.floor(this.random() * spec.colours.length)], beat: 1, wobble: this.random() * TAU };
        });

        this.flocks.push({ kind, birds, spec, ...this.#course(player, { speed: between(this.random, spec.speed), height: spec.height, circles: spec.circles && this.random() < 0.8, radius: [16, 30] }) });
    }

    // Where a flier comes from and how it goes: across near the player from off to one side, or
    // circling over a point near them a while
    #course(player, { speed, height, circles = false, radius = [20, 30] }) {
        const from = this.random() * TAU;
        const y = between(this.random, height);

        if (circles) {
            const near = this.random() * 45;
            const about = this.random() * TAU;

            return {
                mode: "circle",
                centre: [player.x + Math.sin(about) * near, player.z + Math.cos(about) * near],
                radius: between(this.random, radius),
                angle: from,
                turn: this.random() < 0.5 ? 1 : -1,
                left: 40 + this.random() * 50,
                x: player.x + Math.sin(from) * FLYING.from,
                z: player.z + Math.cos(from) * FLYING.from,
                y,
                speed,
                heading: from + Math.PI,
                beat: 0.5,
                bank: 0,
                climb: 0,
            };
        }

        // (Across: aimed at a point off to one side of the player, so it passes by, not over)
        const past = (this.random() - 0.5) * 60;
        const [x, z] = [player.x + Math.sin(from) * FLYING.from, player.z + Math.cos(from) * FLYING.from];
        const [tx, tz] = [player.x + Math.cos(from) * past, player.z - Math.sin(from) * past];

        return { mode: "across", x, z, y, speed, heading: Math.atan2(tx - x, tz - z), beat: 0.5, bank: 0, climb: 0, age: 0 };
    }

    // Fly on: across, or round and round, then away; gone once it's far off
    #fly(flier, dt, player) {
        const turnTo = (heading, most) => {
            const turn = Math.atan2(Math.sin(heading - flier.heading), Math.cos(heading - flier.heading));
            const step = Math.max(-most * dt, Math.min(most * dt, turn));

            flier.heading += step;
            flier.bank += (Math.max(-0.6, Math.min(0.6, (step / Math.max(dt, 1e-3)) * 0.6)) - flier.bank) * Math.min(1, dt * 3);
        };

        if (flier.mode === "circle") {
            // (Making for its circle, then round it; after a while, away)
            const [cx, cz] = flier.centre;
            const off = Math.hypot(flier.x - cx, flier.z - cz);
            const along = Math.atan2(flier.x - cx, flier.z - cz);
            const heading = off > flier.radius * 1.3 ? Math.atan2(cx - flier.x, cz - flier.z) : along + (flier.turn * Math.PI) / 2 + (flier.radius - off) * 0.02 * -flier.turn;

            turnTo(heading, 0.9);
            flier.left -= dt;

            if (flier.left <= 0) {
                flier.mode = "across";
                flier.age = 0;
            }
        } else {
            flier.age += dt;
            flier.bank *= 1 - Math.min(1, dt * 2);
        }

        flier.x += Math.sin(flier.heading) * flier.speed * dt;
        flier.z += Math.cos(flier.heading) * flier.speed * dt;

        // (Beating its wings, and gliding a while now and then: as much of the time as its kind
        // glides; a wyvern or a dragon gliding round its circle, beating to go on its way)
        flier.clock = (flier.clock ?? this.random() * 20) + dt;

        const gliding = flier.spec ? 0.5 + 0.5 * Math.sin(flier.clock * 0.55) < flier.spec.glide : flier.mode === "circle" && Math.sin(flier.clock * 0.3) > -0.4;

        flier.beat += ((gliding ? 0.04 : 1) - flier.beat) * Math.min(1, dt * 2.5);

        const far = Math.hypot(flier.x - player.x, flier.z - player.z);

        if (flier.mode === "across" && flier.age > 3 && far > FLYING.gone) {
            flier.gone = true;
        }
    }

    // The dragon circling over its lair's side of the player, while there's one to see (only one)
    #dragon(player) {
        const lair = this.lairs().find(({ at }) => Math.hypot(at[0] - player.x, at[1] - player.z) < FLYING.lair);
        const flying = this.aloft.find(({ kind }) => kind === "dragon");

        if (!lair) {
            if (flying && flying.mode === "circle") {
                flying.mode = "across";
                flying.age = 0;
            }

            return;
        }

        // (Over somewhere between the player and the lair, within sight)
        const [lx, lz] = lair.at;
        const away = Math.hypot(lx - player.x, lz - player.z);
        const share = Math.min(1, 70 / Math.max(away, 1));
        const centre = [player.x + (lx - player.x) * share, player.z + (lz - player.z) * share];

        if (!flying && !this.hatching) {
            this.#hatch("dragon", (beast, now) => this.aloft.push({ kind: "dragon", beast, ...this.#course(now, { speed: 13, height: ALOFT.dragon, circles: true, radius: [30, 40] }), centre, left: Infinity }));
        } else if (flying?.mode === "circle") {
            flying.centre = centre;
        }
    }

    // Which one of its kind a wyvern or dragon is (sizes and colours: BeastAvatar's seed)
    #seed() {
        return 1 + Math.floor(this.random() * 1000);
    }

    // A wyvern or dragon to come: built a step at a time, then sent `up` from where the player is
    #hatch(kind, up) {
        const seed = this.#seed();

        this.hatching = { kind, steps: new Steps(sculpting(() => new BeastAvatar(kind, { seed }))), up };
    }

    // The one being built, built on a little (HATCHING), and sent up once it's built
    #hatchOn(player) {
        const hatching = this.hatching;

        if (hatching?.steps.take(performance.now() + HATCHING)) {
            this.hatching = null;
            hatching.up(this.#beast(hatching.steps.value), player);
        }
    }

    // A wyvern or dragon put in the sky
    #beast(beast) {
        // (So high up, its shadow would fall far off: none, to spare drawing it again)
        beast.object.traverse((node) => {
            node.castShadow = false;
        });
        this.object.add(beast.object);

        // (Shown once it's ready to draw)
        if (this.prepare) {
            const shown = () => (beast.object.visible = true);

            beast.object.visible = false;
            this.prepare(beast.object).then(shown, shown);
        }

        return beast;
    }

    #let(flier) {
        flier.gone = true;
        flier.beast.object.removeFromParent();
        flier.beast.dispose();
        this.aloft = this.aloft.filter((one) => one !== flier);
    }

    // Each kind's birds put where they are, turned the way they fly, their wings where they are
    // in their stroke
    #draw(time) {
        const counts = new Map([...this.meshes.keys()].map((kind) => [kind, 0]));

        for (const flock of this.flocks) {
            const mesh = this.meshes.get(flock.kind);
            const flap = mesh.userData.flap;
            const size = flock.spec.size;

            this._euler.set(-flock.climb, flock.heading, flock.bank);
            this._quaternion.setFromEuler(this._euler);

            for (const bird of flock.birds) {
                const k = counts.get(flock.kind);

                if (k >= MOST) {
                    break;
                }

                // (Each a little off its place in the flock, bobbing)
                this._at.copy(bird.offset).applyQuaternion(this._quaternion);
                this._at.x += flock.x + Math.sin(time * 1.3 + bird.wobble) * 0.3;
                this._at.y += flock.y + Math.sin(time * 1.7 + bird.wobble * 2) * 0.25;
                this._at.z += flock.z;
                this._scale.setScalar(size * (0.9 + (bird.wobble / TAU) * 0.2));
                this._matrix.compose(this._at, this._quaternion, this._scale);
                mesh.setMatrixAt(k, this._matrix);
                mesh.setColorAt(k, this._colour.setHex(bird.colour));
                flap.setXY(k, bird.phase + time * bird.rate, flock.beat);
                counts.set(flock.kind, k + 1);
            }
        }

        for (const [kind, mesh] of this.meshes) {
            mesh.count = counts.get(kind);

            if (mesh.count) {
                mesh.instanceMatrix.needsUpdate = true;
                mesh.instanceColor.needsUpdate = true;
                mesh.userData.flap.needsUpdate = true;
            }
        }
    }

    dispose() {
        for (const flier of [...this.aloft]) {
            this.#let(flier);
        }

        this.hatching = null;

        for (const mesh of this.meshes.values()) {
            mesh.geometry.dispose();
            mesh.material.dispose();
            mesh.dispose();
        }

        this.object.removeFromParent();
    }
}
