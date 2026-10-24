// The rings of standing stones by night while the moon wakes them (core/rings.js), as a player
// near sees them (app/game.js #moonlit): a pale circle of moonlight on the ground in each one's
// middle, where to step to be carried (core/rings.js RING.middle), and a soft light hanging over
// it, both breathing slowly; the ring tonight's moon is bound to (or every ring, under a full
// moon) the brighter. Drawn for as many as are near at once; additive, no shadows.

import * as THREE from "three";
import { RING } from "../core/rings.js";

/**
 * How it looks: how near the player a ring's drawn (`seen`, metres), its colour, how high its
 * light hangs (metres) and how big it is (metres across), how slowly it breathes (seconds), and
 * how bright the one woken tonight is against the rest (`dim`).
 */
export const MOONLIGHT = Object.freeze({ seen: 80, colour: 0xc8d8ff, over: 1.8, size: 4, every: 4.5, dim: 0.35 });

// A soft round glow, white in the middle, on a canvas
function glowTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");

    canvas.width = canvas.height = size;

    const context = canvas.getContext("2d");
    const middle = size / 2;
    const glow = context.createRadialGradient(middle, middle, 0, middle, middle, middle);

    glow.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    glow.addColorStop(0.35, "rgba(220, 230, 255, 0.45)");
    glow.addColorStop(1, "rgba(200, 215, 255, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

export class MoonGates {
    /** How near the player a ring's drawn (metres). */
    static SEEN = MOONLIGHT.seen;

    /** @param {THREE.Scene} scene - The near pass's (view.js scene). */
    constructor(scene) {
        this.scene = scene;
        this.texture = null;
        this.disc = new THREE.CircleGeometry(RING.middle, 32).rotateX(-Math.PI / 2);

        /** What's drawn, by the ring's id: { sprite, ground, bright, seed }. */
        this.shown = new Map();
    }

    /** The rings to show (`rings`: [{ id, x, y (the ground's height there), z, bright }] world metres); the rest let go. */
    set(rings) {
        const wanted = new Set(rings.map(({ id }) => id));

        for (const [id, drawn] of [...this.shown]) {
            if (!wanted.has(id)) {
                this.scene.remove(drawn.sprite, drawn.ground);
                drawn.sprite.material.dispose();
                drawn.ground.material.dispose();
                this.shown.delete(id);
            }
        }

        for (const { id, x, y, z, bright } of rings) {
            let drawn = this.shown.get(id);

            if (!drawn) {
                this.texture ??= glowTexture();

                const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, color: MOONLIGHT.colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
                const ground = new THREE.Mesh(this.disc, new THREE.MeshBasicMaterial({ map: this.texture, color: MOONLIGHT.colour, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));

                sprite.name = `moonlight ${id}`;
                ground.name = `moonlit ground ${id}`;
                ground.renderOrder = 2;
                drawn = { sprite, ground, bright, seed: this.shown.size * 0.53 };
                this.scene.add(sprite, ground);
                this.shown.set(id, drawn);
            }

            drawn.bright = bright;
            drawn.sprite.position.set(x, y + MOONLIGHT.over, z);
            drawn.ground.position.set(x, y + 0.05, z);
        }
    }

    /** Breathe them (`time`: seconds). */
    update(time) {
        for (const { sprite, ground, bright, seed } of this.shown.values()) {
            const breath = 0.75 + 0.25 * Math.sin(((time / MOONLIGHT.every + seed) % 1) * Math.PI * 2);
            const strength = (bright ? 1 : MOONLIGHT.dim) * breath;

            sprite.material.opacity = 0.8 * strength;
            sprite.scale.setScalar(MOONLIGHT.size * (0.9 + 0.1 * breath));
            ground.material.opacity = 0.55 * strength;
        }
    }

    dispose() {
        this.set([]);
        this.texture?.dispose();
        this.disc.dispose();
    }
}
