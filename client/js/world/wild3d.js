// What the wild's wary beasts and the director's ambushes show of themselves (core/wary.js,
// core/ambush.js), each of a few plain shapes, made once and shared:
// - eyes shining in the dark: a hunting beast out beyond the light at night, two pale points where
//   its eyes are, turned to whoever's looking (EyeShine);
// - food thrown to a beast: a bundle of raw meat, or a sack of feed with apples at its neck, arcing
//   through the air and lying where it landed till it's eaten (BaitLook);
// - an ambush's signs: the earth turned over the dead lying under it, webs strung across the way
//   over the spiders, a goblins' snare drawn tight round whoever stepped in it, and bony hands
//   breaking the earth as the dead rise (AmbushProps).

import * as THREE from "three";

/**
 * How they look: eyes (`eyes`: their colour, how big each point is in metres, how far apart, how
 * far off they're seen at most, and how dark it must be: daylight under `dark`); bait (`meat`,
 * `bone`, `sack`, `tie`, `red` and `green` apples' colours, how high it arcs: `arc` metres); the
 * signs of an ambush (`earth`, `clod`, `web`, `rope`, `bone` colours; the turned earth's `mound`
 * radius; the hands' `rise` seconds up and `stay` seconds before they sink).
 */
export const WILD_LOOK = Object.freeze({
    eyes: Object.freeze({ colour: 0xfff2a8, size: 0.16, apart: 0.09, far: 42, dark: 0.35 }),
    meat: 0xa83a30,
    bone: 0xefe6d0,
    sack: 0xb89a64,
    tie: 0x6a4a22,
    red: 0xc8402c,
    green: 0x8ab83a,
    arc: 1.6,
    earth: 0x3e2c1c,
    clod: 0x2a1c10,
    web: 0xf2f2ea,
    rope: 0x8a6a3a,
    mound: 2.4,
    rise: 0.9,
    stay: 1.4,
});

// A soft round dot, white, for each eye's point
function dotTexture() {
    const canvas = document.createElement("canvas");

    canvas.width = canvas.height = 32;

    const context = canvas.getContext("2d");
    const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);

    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.35, "rgba(255,255,255,0.8)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 32, 32);

    return new THREE.CanvasTexture(canvas);
}

/** Hunting beasts' eyes shining in the dark (as many pairs as `most`), drawn over everything. */
export class EyeShine {
    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene, most = 32) {
        this.scene = scene;
        this.most = most;
        this.positions = new Float32Array(most * 2 * 3);
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setDrawRange(0, 0);
        this.material = new THREE.PointsMaterial({ color: WILD_LOOK.eyes.colour, size: WILD_LOOK.eyes.size, sizeAttenuation: true, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 10;
        this.points.name = "eyeshine";
        scene.add(this.points);
    }

    /**
     * The eyes to show now: [{ x, y, z (where its head is, world metres), facing (radians from
     * south, towards east), glow (0 to 1: how brightly) }]; none, none shown.
     */
    show(eyes) {
        const count = Math.min(eyes.length, this.most);
        const apart = WILD_LOOK.eyes.apart;

        for (let k = 0; k < count; k++) {
            const { x, y, z, facing } = eyes[k];
            // (Either side of where it faces: its left and its right)
            const [sx, sz] = [Math.cos(facing) * apart, -Math.sin(facing) * apart];

            this.positions.set([x + sx, y, z + sz, x - sx, y, z - sz], k * 6);
        }

        this.geometry.setDrawRange(0, count * 2);
        this.geometry.attributes.position.needsUpdate = true;
        this.material.opacity = count ? Math.max(...eyes.slice(0, count).map(({ glow }) => glow)) : 0;
        this.points.visible = count > 0;
    }

    dispose() {
        this.scene.remove(this.points);
        this.geometry.dispose();
        this.material.map?.dispose();
        this.material.dispose();
    }
}

/** Food thrown to the wild's beasts: in the air, and where it lies till it's eaten. */
export class BaitLook {
    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene) {
        this.scene = scene;
        this.parts = null;

        /** What's drawn, by the bait's id: its group. */
        this.shown = new Map();
    }

    // The shapes and their stuff, made the first time any's drawn
    #make() {
        const stuff = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });

        this.parts = {
            lump: new THREE.SphereGeometry(0.15, 10, 8),
            bone: new THREE.CylinderGeometry(0.025, 0.03, 0.22, 6),
            sack: new THREE.CylinderGeometry(0.1, 0.17, 0.26, 9),
            neck: new THREE.TorusGeometry(0.1, 0.02, 5, 10),
            apple: new THREE.SphereGeometry(0.055, 8, 6),
            meat: stuff(WILD_LOOK.meat, 0.6),
            boneStuff: stuff(WILD_LOOK.bone),
            sackStuff: stuff(WILD_LOOK.sack, 0.95),
            tie: stuff(WILD_LOOK.tie),
            red: stuff(WILD_LOOK.red, 0.5),
            green: stuff(WILD_LOOK.green, 0.5),
        };
    }

    // One bait's group: a bundle of meat with a bone through it, or a sack of feed tied at its neck,
    // apples at its mouth
    #group(kind) {
        const parts = this.parts;
        const group = new THREE.Group();

        if (kind === "meat") {
            const lump = new THREE.Mesh(parts.lump, parts.meat);
            const bone = new THREE.Mesh(parts.bone, parts.boneStuff);

            lump.scale.set(1.3, 0.6, 1);
            lump.position.y = 0.08;
            bone.rotation.z = Math.PI / 2.4;
            bone.position.set(0.12, 0.1, 0.03);
            group.add(lump, bone);
        } else {
            const sack = new THREE.Mesh(parts.sack, parts.sackStuff);
            const neck = new THREE.Mesh(parts.neck, parts.tie);

            sack.position.y = 0.13;
            neck.rotation.x = Math.PI / 2;
            neck.position.y = 0.25;
            group.add(sack, neck);

            for (const [x, z, stuff] of [[0.03, 0.02, parts.red], [-0.04, -0.03, parts.green]]) {
                const apple = new THREE.Mesh(parts.apple, stuff);

                apple.position.set(x, 0.31, z);
                group.add(apple);
            }
        }

        group.name = `bait-${kind}`;

        return group;
    }

    /**
     * The bait to show (`baits`: core/battle.js baits on the map shown: { id, kind, x, y, from,
     * thrown, lands }), at the battle's `time` (ms): arcing from where it was thrown till it lands,
     * then lying there, on the ground (`groundAt(x, z)`: its height there); those gone let go.
     */
    set(baits, time, groundAt) {
        const wanted = new Set(baits.map(({ id }) => id));

        for (const [id, group] of [...this.shown]) {
            if (!wanted.has(id)) {
                this.scene.remove(group);
                this.shown.delete(id);
            }
        }

        if (!baits.length) {
            return;
        }

        if (!this.parts) {
            this.#make();
        }

        for (const bait of baits) {
            let group = this.shown.get(bait.id);

            if (!group) {
                group = this.#group(bait.kind);
                this.shown.set(bait.id, group);
                this.scene.add(group);
            }

            const flight = Math.max(1, bait.lands - bait.thrown);
            const t = Math.min(1, Math.max(0, (time - bait.thrown) / flight));
            const [fx, fz] = bait.from ?? [bait.x, bait.y];
            const [x, z] = [fx + (bait.x - fx) * t, fz + (bait.y - fz) * t];
            const ground = groundAt?.(x, z) ?? 0;

            // (In the air: rising from the thrower's hand and falling to where it lands, tumbling)
            group.position.set(x, ground + (t < 1 ? 1.2 * (1 - t) + 4 * WILD_LOOK.arc * t * (1 - t) : 0), z);
            group.rotation.set(t < 1 ? t * 6 : 0, (bait.id * 1.7) % (Math.PI * 2), 0);
        }
    }

    dispose() {
        for (const group of this.shown.values()) {
            this.scene.remove(group);
        }

        this.shown.clear();

        for (const part of Object.values(this.parts ?? {})) {
            part.dispose?.();
        }
    }
}

/** An ambush's signs: the turned earth over the dead, webs over the spiders, a snare, and hands rising. */
export class AmbushProps {
    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene) {
        this.scene = scene;
        this.parts = null;

        /** The signs lying there, by the ambush's id: its group. */
        this.shown = new Map();

        /** The hands rising and the snares drawn tight, a while: [{ group, kind, at (s), until (s) }]. */
        this.moments = [];
    }

    #make() {
        const stuff = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...extra });

        this.parts = {
            mound: new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2),
            clod: new THREE.DodecahedronGeometry(0.12, 0),
            palm: new THREE.BoxGeometry(0.12, 0.16, 0.04),
            finger: new THREE.BoxGeometry(0.025, 0.12, 0.025),
            loop: new THREE.TorusGeometry(0.34, 0.025, 6, 18),
            earth: stuff(WILD_LOOK.earth),
            clodStuff: stuff(WILD_LOOK.clod),
            bone: stuff(WILD_LOOK.bone, { roughness: 0.7 }),
            rope: stuff(WILD_LOOK.rope),
            web: new THREE.LineBasicMaterial({ color: WILD_LOOK.web, transparent: true, opacity: 0.75 }),
        };
    }

    // The turned earth over the dead lying in wait: a low mound of dark soil, clods strewn on it
    #mound() {
        const group = new THREE.Group();
        const mound = new THREE.Mesh(this.parts.mound, this.parts.earth);

        mound.scale.set(WILD_LOOK.mound, 0.14, WILD_LOOK.mound);
        group.add(mound);

        for (let k = 0; k < 9; k++) {
            const clod = new THREE.Mesh(this.parts.clod, this.parts.clodStuff);
            const angle = k * 2.4;
            const far = 0.4 + ((k * 0.37) % 1) * (WILD_LOOK.mound - 0.5);

            clod.position.set(Math.cos(angle) * far, 0.08, Math.sin(angle) * far);
            clod.rotation.set(k, k * 2, 0);
            group.add(clod);
        }

        return group;
    }

    // Webs strung across the way over the spiders: a few, each threads from a middle out to its
    // anchors and rings round between them
    #webs() {
        const group = new THREE.Group();

        for (let w = 0; w < 4; w++) {
            const angle = w * 1.6 + 0.4;
            const [cx, cz] = [Math.cos(angle) * 3.2, Math.sin(angle) * 3.2];
            const points = [];
            const spokes = 7;

            for (let s = 0; s < spokes; s++) {
                const a = (s / spokes) * Math.PI * 2;
                const [dx, dy] = [Math.cos(a), Math.sin(a)];

                points.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx * 0.7, dy * 0.7, 0));

                for (const ring of [0.25, 0.45, 0.65]) {
                    const b = ((s + 1) / spokes) * Math.PI * 2;

                    points.push(new THREE.Vector3(dx * ring, dy * ring, 0), new THREE.Vector3(Math.cos(b) * ring, Math.sin(b) * ring, 0));
                }
            }

            const web = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), this.parts.web);

            web.position.set(cx, 0.9, cz);
            web.rotation.y = angle;
            group.add(web);
        }

        return group;
    }

    // A bony hand, its fingers splayed
    #hand() {
        const group = new THREE.Group();
        const palm = new THREE.Mesh(this.parts.palm, this.parts.bone);

        group.add(palm);

        for (let k = 0; k < 4; k++) {
            const finger = new THREE.Mesh(this.parts.finger, this.parts.bone);

            finger.position.set(-0.045 + k * 0.03, 0.13, 0);
            finger.rotation.z = (k - 1.5) * 0.12;
            group.add(finger);
        }

        return group;
    }

    /**
     * The signs lying where ambushes are laid (`laid`: [{ id, style ("dead": its turned earth,
     * "spiders": its webs), x, z }]), each on the ground (`groundAt(x, z)`); those gone let go.
     */
    set(laid, groundAt) {
        const wanted = new Set(laid.map(({ id }) => id));

        for (const [id, group] of [...this.shown]) {
            if (!wanted.has(id)) {
                this.scene.remove(group);
                this.shown.delete(id);
            }
        }

        if (!laid.length) {
            return;
        }

        if (!this.parts) {
            this.#make();
        }

        for (const { id, style, x, z } of laid) {
            if (!this.shown.has(id)) {
                const group = style === "dead" ? this.#mound() : this.#webs();

                group.position.set(x, groundAt?.(x, z) ?? 0, z);
                group.name = `ambush-${style}`;
                this.shown.set(id, group);
                this.scene.add(group);
            }
        }
    }

    /** Bony hands breaking the earth at (x, z) as one of the dead rises (`now`: seconds, the clock `update` is given). */
    hands(x, z, ground, now) {
        if (!this.parts) {
            this.#make();
        }

        for (const side of [-1, 1]) {
            const hand = this.#hand();

            hand.position.set(x + side * 0.25, ground - 0.4, z + side * 0.1);
            hand.rotation.set(0, side * 0.4, side * 0.15);
            hand.name = "risingHand";
            this.scene.add(hand);
            this.moments.push({ group: hand, kind: "hand", at: now, until: now + WILD_LOOK.rise + WILD_LOOK.stay, ground });
        }
    }

    /** A snare drawn tight round whoever stepped in it, at (x, z), for `seconds`. */
    snare(x, z, ground, now, seconds) {
        if (!this.parts) {
            this.#make();
        }

        const loop = new THREE.Mesh(this.parts.loop, this.parts.rope);

        loop.rotation.x = Math.PI / 2;
        loop.position.set(x, ground + 0.12, z);
        loop.name = "snare";
        this.scene.add(loop);
        this.moments.push({ group: loop, kind: "snare", at: now, until: now + seconds, ground });
    }

    /** On a frame (`now`: seconds): the hands rising, then sinking back; the snares let go once they're done. */
    update(now) {
        this.moments = this.moments.filter((moment) => {
            if (now >= moment.until) {
                this.scene.remove(moment.group);

                return false;
            }

            if (moment.kind === "hand") {
                const t = now - moment.at;
                const up = Math.min(1, t / WILD_LOOK.rise) - Math.max(0, (t - WILD_LOOK.rise - WILD_LOOK.stay * 0.6) / (WILD_LOOK.stay * 0.4));

                moment.group.position.y = moment.ground - 0.4 + 0.75 * Math.max(0, up);
            }

            return true;
        });
    }

    dispose() {
        for (const group of this.shown.values()) {
            this.scene.remove(group);
        }

        for (const { group } of this.moments) {
            this.scene.remove(group);
        }

        this.shown.clear();
        this.moments = [];

        for (const part of Object.values(this.parts ?? {})) {
            part.dispose?.();
        }
    }
}
