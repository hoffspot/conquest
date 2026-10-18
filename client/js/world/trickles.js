// Soil trickling from an ants' nest's roof (interiors3d.js DUNGEON_LOOKS `trickles`): now and then,
// somewhere near the player and under the roof, a thin stream of grains falls from it to the floor
// for a second or two, dust sifting up where it lands, as if something were digging overhead.
// Drawn as the fights' sparks and dust are (effects.js BURSTS: `trickle`, `sift`), in their one
// shared buffer: nothing more to draw; heard where it falls (synth.js soilTrickle: app/game.js
// plays it as one starts, `started`). Only looks and sounds, so it's chosen as it plays (`random`).

import * as THREE from "three";

/**
 * How often a trickle starts (seconds between, least and most; the first sooner after coming in:
 * `first`), how far from the player (metres), how long it runs (seconds), how many bursts of grains
 * a second and of dust where they land, and how high the roof over it must be at least (metres).
 */
export const TRICKLE = Object.freeze({ every: [12, 40], first: [4, 12], near: [2.5, 8], lasts: [1.2, 2.8], grains: 24, sifts: 3, least: 2 });

export class Trickles {
    constructor(random = Math.random) {
        this.random = random;
        // (What's to be drawn this frame: [{ kind (BURSTS'), at }], from a pool of points)
        this.bursts = [];
        this.pool = [];
        this.reset();
    }

    /** As if just come in (a new place): none running, the first a little while off. */
    reset() {
        this.wait = this.#between(TRICKLE.first);
        // (The one running: where, from how high, how long it has left, and the bursts owed; and
        // the one that started this frame, if one did)
        this.running = null;
        this.started = null;
    }

    /**
     * A frame's worth (`dt` seconds) where the player is (`at`: { x, z }, world metres), the roof
     * over a point how high (`roofAt(x, z)`: metres, or null where there's none): the bursts to draw
     * now, [{ kind, at: THREE.Vector3 }] (yours till the next frame).
     */
    update(dt, at, roofAt) {
        this.bursts.length = 0;
        this.started = null;

        if (this.running) {
            const now = this.running;

            now.left -= dt;
            now.grains += dt * TRICKLE.grains;
            now.sifts += dt * TRICKLE.sifts;

            while (now.grains >= 1) {
                now.grains -= 1;
                this.#burst("trickle", now.x + (this.random() - 0.5) * 0.06, now.top, now.z + (this.random() - 0.5) * 0.06);
            }

            while (now.sifts >= 1) {
                now.sifts -= 1;
                this.#burst("sift", now.x, 0.05, now.z);
            }

            if (now.left <= 0) {
                this.running = null;
                this.wait = this.#between(TRICKLE.every);
            }

            return this.bursts;
        }

        this.wait -= dt;

        if (this.wait > 0) {
            return this.bursts;
        }

        // (Somewhere near under the roof, high enough; if nowhere, try again in a moment)
        for (let tries = 0; tries < 6; tries++) {
            const angle = this.random() * Math.PI * 2;
            const away = this.#between(TRICKLE.near);
            const [x, z] = [at.x + Math.cos(angle) * away, at.z + Math.sin(angle) * away];
            const roof = roofAt(x, z);

            if (roof !== null && roof >= TRICKLE.least) {
                this.running = { x, z, top: roof - 0.05, left: this.#between(TRICKLE.lasts), grains: 1, sifts: 0 };
                this.started = this.running;

                return this.bursts;
            }
        }

        this.wait = 1;

        return this.bursts;
    }

    #between([least, most]) {
        return least + this.random() * (most - least);
    }

    #burst(kind, x, y, z) {
        const point = (this.pool[this.bursts.length] ??= { kind, at: new THREE.Vector3() });

        point.kind = kind;
        point.at.set(x, y, z);
        this.bursts.push(point);
    }
}
