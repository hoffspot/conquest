// What lingers on someone after some creatures' blows, drawn on them (core/afflictions.js): a
// spider's web wound round their legs and anchored to the ground, a treant's roots burst up and
// coiled round their feet, ice crusting their feet, a curse's dark motes circling them. Each
// grows on over a moment when it takes hold, and shrinks away when it's over (cured, or worn
// off). The rest (venom's bubbles, a sickness's flies, flames, blood) is particles, from the game
// (app/game.js), and a tint on their skin.

import * as THREE from "three";

// How long (s) one grows on, and goes
const GROW = 0.3;
const GO = 0.4;

// What each's made of (made once, shared)
let parts = null;

function made() {
    if (parts) {
        return parts;
    }

    parts = {
        silk: new THREE.MeshStandardMaterial({ color: 0xf4f2ea, roughness: 0.6, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
        thread: new THREE.LineBasicMaterial({ color: 0xf8f6ee, transparent: true, opacity: 0.7 }),
        bark: new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.95, flatShading: true }),
        moss: new THREE.MeshStandardMaterial({ color: 0x4a5a24, roughness: 1, flatShading: true }),
        ice: new THREE.MeshStandardMaterial({ color: 0xcdeeff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.78, emissive: 0x3a7ab0, emissiveIntensity: 0.35, flatShading: true }),
        mote: new THREE.MeshBasicMaterial({ color: 0xb888ff, transparent: true, opacity: 0.9, toneMapped: false }),
        shade: new THREE.MeshBasicMaterial({ color: 0x1c0a2a, transparent: true, opacity: 0.55, depthWrite: false }),
        shard: new THREE.ConeGeometry(0.035, 0.22, 5),
        orb: new THREE.OctahedronGeometry(0.035),
    };

    return parts;
}

// A random number between two, from a seeded stream (so each's its own, but the same each time)
function stream(seed) {
    let state = seed >>> 0 || 1;

    return (a = 0, b = 1) => {
        state = (state * 1664525 + 1013904223) >>> 0;

        return a + (state / 4294967296) * (b - a);
    };
}

// A web: silk wound round and round up the legs (a spiral of thread, loose and uneven), a few
// sheets of it between, and strands pulled out to the ground round them
function web(height, random) {
    const group = new THREE.Group();
    const { silk, thread } = made();
    const top = height * 0.52;
    const points = [];

    // (The winding: round and round, up and down, each turn a little off)
    for (let turn = 0; turn < 7; turn++) {
        const y0 = random(0.05, top);
        const y1 = random(0.05, top);
        const radius = random(0.13, 0.2);
        const start = random(0, Math.PI * 2);

        for (let k = 0; k < 12; k++) {
            const [a, b] = [start + (k / 12) * Math.PI * 2, start + ((k + 1) / 12) * Math.PI * 2];
            const [ya, yb] = [y0 + ((y1 - y0) * k) / 12, y0 + ((y1 - y0) * (k + 1)) / 12];

            points.push(new THREE.Vector3(Math.cos(a) * radius, ya, Math.sin(a) * radius), new THREE.Vector3(Math.cos(b) * radius, yb, Math.sin(b) * radius));
        }
    }

    // (Strands out to the ground, anchoring it)
    for (let k = 0; k < 9; k++) {
        const angle = (k / 9) * Math.PI * 2 + random(-0.2, 0.2);
        const reach = random(0.45, 0.8);

        points.push(new THREE.Vector3(Math.cos(angle) * 0.17, random(0.1, top), Math.sin(angle) * 0.17), new THREE.Vector3(Math.cos(angle) * reach, 0.01, Math.sin(angle) * reach));
    }

    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), thread));

    // (Sheets of it: a band round the shins, and another round the knees, torn open in places)
    for (const [y, tall] of [
        [0.12, 0.2],
        [top * 0.62, 0.18],
    ]) {
        const band = new THREE.CylinderGeometry(0.19, 0.21, tall, 14, 3, true, random(0, 1), Math.PI * random(1.3, 1.8));
        const wobble = band.attributes.position;

        for (let i = 0; i < wobble.count; i++) {
            wobble.setXYZ(i, wobble.getX(i) * random(0.85, 1.12), wobble.getY(i) + random(-0.02, 0.02), wobble.getZ(i) * random(0.85, 1.12));
        }

        band.computeVertexNormals();

        const sheet = new THREE.Mesh(band, silk);

        sheet.position.y = y;
        group.add(sheet);
    }

    return group;
}

// A tapering root along a curve (a few points), thick at the ground
function root(points, radius, material) {
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, 16, radius, 6, false);
    const position = tube.attributes.position;
    const along = new THREE.Vector3();

    // (Narrowing to a point: each ring drawn in towards the curve, the further along the thinner)
    for (let i = 0; i < position.count; i++) {
        const ring = Math.floor(i / 7);
        const t = ring / 16;

        curve.getPointAt(Math.min(1, t), along);
        position.setXYZ(i, along.x + (position.getX(i) - along.x) * (1 - t * 0.9), along.y + (position.getY(i) - along.y) * (1 - t * 0.9), along.z + (position.getZ(i) - along.z) * (1 - t * 0.9));
    }

    tube.computeVertexNormals();

    return new THREE.Mesh(tube, material);
}

// Roots: burst up from the ground round their feet and coiled up round their legs, clods of
// earth heaped where they came up
function roots(height, random) {
    const group = new THREE.Group();
    const { bark, moss } = made();
    const up = height * 0.45;

    for (let k = 0; k < 6; k++) {
        const angle = (k / 6) * Math.PI * 2 + random(-0.3, 0.3);
        const out = random(0.3, 0.5);
        const twist = random(0.9, 1.6) * (k % 2 ? 1 : -1);
        const points = [];

        // (Out of the ground a way off, in to their legs, then round and up them)
        for (let s = 0; s <= 5; s++) {
            const t = s / 5;
            const radius = out + (0.14 - out) * Math.min(1, t * 2.2);
            const a = angle + twist * t;

            points.push(new THREE.Vector3(Math.cos(a) * radius, -0.05 + up * t ** 1.3, Math.sin(a) * radius));
        }

        group.add(root(points, random(0.03, 0.045), bark));

        const clod = new THREE.Mesh(new THREE.DodecahedronGeometry(random(0.06, 0.09), 0), moss);

        clod.position.set(Math.cos(angle) * out, 0.01, Math.sin(angle) * out);
        clod.scale.y = 0.45;
        group.add(clod);
    }

    return group;
}

// Frost: shards of ice crusting their feet, pointing every way out of the ground
function frost(height, random) {
    const group = new THREE.Group();
    const { ice, shard } = made();

    for (let k = 0; k < 16; k++) {
        const angle = random(0, Math.PI * 2);
        const out = random(0.08, 0.3);
        const spike = new THREE.Mesh(shard, ice);

        spike.position.set(Math.cos(angle) * out, random(0.02, 0.12), Math.sin(angle) * out);
        spike.rotation.set(random(-0.7, 0.7), random(0, Math.PI), random(-0.7, 0.7));
        spike.scale.setScalar(random(0.6, 1.4) * Math.max(0.6, height / 1.8));
        group.add(spike);
    }

    return group;
}

// A curse: dark motes circling them at the chest, and a shadow pooled under them
function curse(height, random) {
    const group = new THREE.Group();
    const { mote, orb, shade } = made();

    for (let k = 0; k < 5; k++) {
        const one = new THREE.Mesh(orb, mote);

        one.userData.phase = (k / 5) * Math.PI * 2 + random(-0.2, 0.2);
        one.userData.rise = random(0.45, 0.75);
        group.add(one);
    }

    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2), shade);

    pool.position.y = 0.02;
    pool.userData.pool = true;
    group.add(pool);
    group.userData.circling = height;

    return group;
}

const MAKERS = { web, roots, frost, curse };

/** What lingers on someone, drawn on them: made, grown on, turned, and let go of. */
export class Ailments3D {
    /** @param {THREE.Object3D} parent - What they're drawn in (the effects' group, the scene). */
    constructor(parent) {
        this.parent = parent;

        /** What's on whom: by the character's id, by the look ({ group, object, age, going }). */
        this.on = new Map();
    }

    /**
     * Something lingering takes hold on a character (its `object`, `height` tall): a look (web,
     * roots, frost, curse). Again while it's on them, it stays.
     */
    add(id, look, object, height) {
        const make = MAKERS[look];

        if (!make) {
            return;
        }

        const theirs = this.on.get(id) ?? new Map();
        const had = theirs.get(look);

        if (had) {
            had.going = null;

            return;
        }

        const group = make(height, stream([...`${id}${look}`].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 7)));

        group.name = `ailment-${look}`;
        group.scale.setScalar(0.001);
        this.parent.add(group);
        theirs.set(look, { group, object, age: 0, going: null });
        this.on.set(id, theirs);
    }

    /** It's over (cured, or worn off): it goes. */
    remove(id, look) {
        const one = this.on.get(id)?.get(look);

        if (one && one.going === null) {
            one.going = 0;
        }
    }

    /** Everything on a character gone at once (they've fallen, or gone). */
    clear(id) {
        for (const { group } of this.on.get(id)?.values() ?? []) {
            group.removeFromParent();
            dispose(group);
        }

        this.on.delete(id);
    }

    /** What's drawn on whom, for the checks: { id: [looks] }. */
    shown() {
        return Object.fromEntries([...this.on].map(([id, theirs]) => [id, [...theirs.keys()]]));
    }

    /** Advance by `dt` seconds: each where its character is now, growing on or going. */
    update(dt) {
        for (const [id, theirs] of this.on) {
            for (const [look, one] of theirs) {
                one.age += dt;

                if (one.going !== null) {
                    one.going += dt;
                }

                const grown = Math.min(1, one.age / GROW);
                const left = one.going === null ? 1 : 1 - one.going / GO;

                if (left <= 0) {
                    one.group.removeFromParent();
                    dispose(one.group);
                    theirs.delete(look);
                    continue;
                }

                const { position } = one.object;

                one.group.position.set(position.x, position.y, position.z);
                one.group.visible = one.object.visible;

                // (Roots burst up out of the ground; the rest swell into being)
                if (look === "roots") {
                    one.group.scale.set(1, Math.max(0.001, easeOut(grown) * left), 1);
                } else {
                    one.group.scale.setScalar(Math.max(0.001, easeOut(grown) * left));
                }

                // (A curse's motes circle, bobbing; its shadow breathes)
                if (look === "curse") {
                    const height = one.group.userData.circling;

                    for (const child of one.group.children) {
                        if (child.userData.pool) {
                            child.scale.setScalar(0.85 + 0.15 * Math.sin(one.age * 2.2));
                        } else {
                            const angle = child.userData.phase + one.age * 1.6;

                            child.position.set(Math.cos(angle) * 0.34, height * child.userData.rise + 0.06 * Math.sin(one.age * 3 + child.userData.phase), Math.sin(angle) * 0.34);
                            child.rotation.y = one.age * 4;
                        }
                    }
                }
            }

            if (!theirs.size) {
                this.on.delete(id);
            }
        }
    }
}

const easeOut = (t) => 1 - (1 - t) ** 3;

// Let go of the geometry made for one (not the shared parts)
function dispose(group) {
    const shared = new Set(Object.values(made()));

    group.traverse((node) => {
        if (node.geometry && !shared.has(node.geometry)) {
            node.geometry.dispose();
        }
    });
}
