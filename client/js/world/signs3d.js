// The signs along the trails out of the wild's camps and lairs (core/tracks.js), as a hunter sees
// them once they're near (app/game.js): a patch of scuffed earth with a snapped stick across it,
// and, till it's read, a pale glint over it that swells and fades, slower than a treasure's, so
// it's found among the grass. Drawn for as many as are near at once; tapped, found by a ray (`at`).
//
// The glint additive, no shadows: a sprite of a soft ring of light (a texture made once here),
// hung over the grass and drawn over whatever's before it (it's only ever seen near).

import * as THREE from "three";

/**
 * How it looks: the glint's size (metres across), how high over the ground it hangs (metres), how
 * often it swells (seconds), its colour; the scuff's radius and height (metres) and colour; the
 * stick's length (metres) and colour; and how near a tap's ray passes to take it (`tap`, metres).
 */
export const SIGN = Object.freeze({ size: 1.4, over: 0.9, every: 2.6, colour: 0xd8f0c0, scuff: 0.6, rise: 0.035, earth: 0x34271b, stick: 0.7, wood: 0x6a5032, tap: 1.1 });

// A soft ring of light round a bright middle, on a canvas
function ringTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");

    canvas.width = canvas.height = size;

    const context = canvas.getContext("2d");
    const middle = size / 2;
    const glow = context.createRadialGradient(middle, middle, 0, middle, middle, middle);

    glow.addColorStop(0, "rgba(255, 255, 255, 0.9)");
    glow.addColorStop(0.15, "rgba(235, 255, 225, 0.35)");
    glow.addColorStop(0.55, "rgba(215, 245, 200, 0.5)");
    glow.addColorStop(0.7, "rgba(200, 240, 185, 0.12)");
    glow.addColorStop(1, "rgba(200, 240, 185, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

export class TrailSigns {
    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene) {
        this.scene = scene;
        this.texture = null;
        this.scuff = new THREE.SphereGeometry(SIGN.scuff, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, SIGN.rise / SIGN.scuff, 0.7);
        this.stick = new THREE.CylinderGeometry(0.018, 0.026, SIGN.stick, 5).rotateZ(Math.PI / 2);
        this.earth = new THREE.MeshStandardMaterial({ color: SIGN.earth, roughness: 1 });
        this.wood = new THREE.MeshStandardMaterial({ color: SIGN.wood, roughness: 0.9 });

        /** What's drawn, by the sign's id: { group, sprite (null once it's read), at (THREE.Vector3), seed }. */
        this.shown = new Map();
    }

    /**
     * The signs to show (`signs`: [{ id, x, y (the ground's height there), z, read }] world
     * metres), each as it was (and those no longer in it let go): read, no glint over it.
     */
    set(signs) {
        const wanted = new Set(signs.map(({ id }) => id));

        for (const [id, drawn] of [...this.shown]) {
            if (!wanted.has(id)) {
                this.#letGo(drawn);
                this.shown.delete(id);
            }
        }

        for (const { id, x, y, z, read } of signs) {
            let drawn = this.shown.get(id);

            if (!drawn) {
                const group = new THREE.Group();
                const scuff = new THREE.Mesh(this.scuff, this.earth);
                const stick = new THREE.Mesh(this.stick, this.wood);
                const seed = this.shown.size * 0.37;

                group.name = `trail sign ${id}`;
                scuff.receiveShadow = true;
                stick.position.set(0.1, 0.05, -0.05);
                stick.rotation.set(0, 0.6 + seed, 0.12);
                stick.castShadow = true;
                group.add(scuff, stick);
                this.scene.add(group);
                drawn = { group, sprite: null, at: new THREE.Vector3(), seed };
                this.shown.set(id, drawn);
            }

            if (!read && !drawn.sprite) {
                this.texture ??= ringTexture();
                drawn.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, color: SIGN.colour, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
                drawn.sprite.name = `trail sign glint ${id}`;
                drawn.sprite.renderOrder = 5;
                this.scene.add(drawn.sprite);
            } else if (read && drawn.sprite) {
                this.scene.remove(drawn.sprite);
                drawn.sprite.material.dispose();
                drawn.sprite = null;
            }

            drawn.group.position.set(x, y - 0.01, z);
            drawn.sprite?.position.set(x, y + SIGN.over, z);
            drawn.at.set(x, y + 0.2, z);
        }
    }

    /** The sign a ray passes near (a tap's: view.js rayAt): its id, the nearest to the ray's start; or null. */
    at(ray) {
        let found = null;
        let nearest = Infinity;

        for (const [id, { at }] of this.shown) {
            const along = ray.origin.distanceTo(at);

            if (ray.distanceToPoint(at) <= SIGN.tap && along < nearest) {
                [found, nearest] = [id, along];
            }
        }

        return found;
    }

    /** Swell and fade their glints (`time`: seconds). */
    update(time) {
        for (const { sprite, seed } of this.shown.values()) {
            if (sprite) {
                const phase = ((time / SIGN.every + seed) % 1 + 1) % 1;
                const swell = Math.max(0, Math.sin(phase * Math.PI)) ** 2;

                sprite.material.opacity = 0.35 + 0.5 * swell;
                sprite.scale.setScalar(SIGN.size * (0.7 + 0.4 * swell));
            }
        }
    }

    dispose() {
        this.set([]);
        this.texture?.dispose();
        this.scuff.dispose();
        this.stick.dispose();
        this.earth.dispose();
        this.wood.dispose();
    }

    #letGo({ group, sprite }) {
        this.scene.remove(group);

        if (sprite) {
            this.scene.remove(sprite);
            sprite.material.dispose();
        }
    }
}
