// Where a treasure's buried (core/treasure.js), as a hunter sees it once they're near enough
// (TREASURE.seen): a patch of turned earth, and over it a gold glint that twinkles, turning and
// swelling and fading, so it's found among the grass. Drawn for as many as are near at once.
//
// Additive, no shadows: a sprite of a four-pointed star (a texture made once here), hung over the
// tallest grass and drawn over whatever's before it (it's only ever seen near), and a low mound of
// earth.

import * as THREE from "three";

/**
 * How it looks: the glint's size (metres across), how high over the ground it hangs (metres), how
 * often it twinkles (seconds), its colour; the mound's radius and height (metres) and colour.
 */
export const GLINT = Object.freeze({ size: 2.2, over: 1.3, every: 1.4, colour: 0xffd870, mound: 0.9, rise: 0.22, earth: 0x5a4028 });

// A four-pointed star of light, soft-edged, on a canvas (its middle white, its points gold)
function starTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");

    canvas.width = canvas.height = size;

    const context = canvas.getContext("2d");
    const middle = size / 2;
    const glow = context.createRadialGradient(middle, middle, 0, middle, middle, middle);

    glow.addColorStop(0, "rgba(255, 255, 255, 1)");
    glow.addColorStop(0.18, "rgba(255, 236, 170, 0.85)");
    glow.addColorStop(1, "rgba(255, 200, 80, 0)");
    context.fillStyle = glow;
    context.beginPath();

    for (let k = 0; k < 8; k++) {
        const angle = (k * Math.PI) / 4;
        const reach = k % 2 ? middle * 0.22 : middle;

        context.lineTo(middle + Math.cos(angle) * reach, middle + Math.sin(angle) * reach);
    }

    context.closePath();
    context.fill();

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

export class TreasureGlints {
    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene) {
        this.scene = scene;
        this.texture = null;
        this.mound = new THREE.SphereGeometry(GLINT.mound, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, GLINT.rise / GLINT.mound, 1);
        this.earth = new THREE.MeshStandardMaterial({ color: GLINT.earth, roughness: 1 });

        /** What's drawn, by the treasure's id: { sprite, mound }. */
        this.shown = new Map();
    }

    /**
     * The treasures to show (`spots`: [{ id, x, y (the ground's height there), z }] world metres),
     * each as it was (and those no longer in it let go).
     */
    set(spots) {
        const wanted = new Set(spots.map(({ id }) => id));

        for (const [id, drawn] of [...this.shown]) {
            if (!wanted.has(id)) {
                this.scene.remove(drawn.sprite, drawn.mound);
                drawn.sprite.material.dispose();
                this.shown.delete(id);
            }
        }

        for (const { id, x, y, z } of spots) {
            let drawn = this.shown.get(id);

            if (!drawn) {
                this.texture ??= starTexture();

                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, color: GLINT.colour, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
                const mound = new THREE.Mesh(this.mound, this.earth);

                sprite.name = `treasure glint ${id}`;
                sprite.renderOrder = 5;
                mound.name = `treasure mound ${id}`;
                mound.receiveShadow = true;
                drawn = { sprite, mound, seed: this.shown.size * 0.37 };
                this.scene.add(sprite, mound);
                this.shown.set(id, drawn);
            }

            drawn.sprite.position.set(x, y + GLINT.over, z);
            drawn.mound.position.set(x, y - 0.02, z);
        }
    }

    /** Twinkle them (`time`: seconds). */
    update(time) {
        for (const { sprite, seed } of this.shown.values()) {
            const phase = ((time / GLINT.every + seed) % 1 + 1) % 1;
            const twinkle = Math.max(0, Math.sin(phase * Math.PI)) ** 3;

            sprite.material.opacity = 0.45 + 0.55 * twinkle;
            sprite.material.rotation = time * 0.8 + seed * 6;
            sprite.scale.setScalar(GLINT.size * (0.55 + 0.6 * twinkle));
        }
    }

    dispose() {
        this.set([]);
        this.texture?.dispose();
        this.mound.dispose();
        this.earth.dispose();
    }
}
