// How a legendary weapon in hand looks (core/legendary.js; docs/GAME.md *Legendary weapons*): its
// effect's element about it all the time, a tinge of its colour glowing in it and motes off it
// (frost misting, embers, grit, sparks, a gold glow), more of them trailing its swings; put away,
// nothing. What it does let loose is the game's to show (game.js #unleashed).
//
// Each frame (update), for those with one in hand: motes off the weapon, as many a second as LOOK
// has it (more mid-blow), from anywhere along it (its bounds in the world, kept a moment).

import * as THREE from "three";
import { EQUIPMENT } from "../characters/equipment.js";

/**
 * Each effect's look: its colour (the weapon's glow), its motes (effects.js BURSTS), how many a
 * second at rest and mid-blow.
 */
export const LOOK = Object.freeze({
    frostbind: { colour: 0x8fd8ff, motes: "legendFrost" },
    cinderburst: { colour: 0xff6a1a, motes: "legendFire" },
    earthsunder: { colour: 0xc8a060, motes: "legendEarth" },
    stormlash: { colour: 0xa8b8ff, motes: "legendStorm" },
    ruinblast: { colour: 0xffc040, motes: "legendRuin" },
    cleave: { colour: 0xc8d4e0, motes: "legendCleave" },
    rate: { rest: 7, blow: 45 },
    glow: 0.45,
});

// How often a weapon's bounds are found again (s)
const BOUNDS_EVERY = 0.2;

const _point = new THREE.Vector3();

export class LegendaryLooks {
    /** @param {import("./effects.js").Effects} effects - What the motes are drawn with. */
    constructor(effects) {
        this.effects = effects;
        // Each wielder's weapon as it's looked after: { model, effect, box, boxIn, due, tinted }
        this.held = new Map();
    }

    /**
     * The weapons in hand this frame (`wielders`: [{ id, effect, avatar, striking }], `striking`
     * mid-blow): each glowing and misting its effect; any no longer in hand let go (their glow
     * taken off). `dt`: seconds since the last frame.
     */
    update(dt, wielders) {
        const seen = new Set();

        for (const { id, effect, avatar, striking } of wielders) {
            const look = LOOK[effect];
            const character = avatar?.character;
            const model = character?.items?.find((item) => EQUIPMENT[item.name]?.slot === "mainHand") ?? null;

            if (!look || !model) {
                continue;
            }

            seen.add(id);

            let one = this.held.get(id);

            if (!one || one.model !== model || one.effect !== effect) {
                if (one) {
                    this.#untint(one);
                }

                one = { model, effect, box: new THREE.Box3(), boxIn: 0, due: 0, tinted: [] };
                this.#tint(one, look.colour);
                this.held.set(id, one);
            }

            // (Put away, or out of sight: nothing off it)
            if (character.sheathed || avatar.object.visible === false || !model.visible) {
                continue;
            }

            one.boxIn -= dt;

            if (one.boxIn <= 0) {
                one.box.setFromObject(model);
                one.boxIn = BOUNDS_EVERY;
            }

            if (one.box.isEmpty()) {
                continue;
            }

            one.due += dt * (striking ? LOOK.rate.blow : LOOK.rate.rest);

            for (; one.due >= 1; one.due--) {
                const { min, max } = one.box;

                _point.set(min.x + Math.random() * (max.x - min.x), min.y + Math.random() * (max.y - min.y), min.z + Math.random() * (max.z - min.z));
                this.effects.burst(look.motes, _point);
            }
        }

        for (const [id, one] of this.held) {
            if (!seen.has(id)) {
                this.#untint(one);
                this.held.delete(id);
            }
        }
    }

    // The weapon glowing its effect's colour: its own materials, each a copy of its own glowing
    // (`emissive`), put back as they were when it's let go
    #tint(one, colour) {
        one.model.traverse((part) => {
            const material = part.isMesh ? part.material : null;

            if (material && !Array.isArray(material) && material.emissive) {
                const glowing = material.clone();

                glowing.emissive = new THREE.Color(colour);
                glowing.emissiveIntensity = LOOK.glow;
                one.tinted.push({ part, was: material, glowing });
                part.material = glowing;
            }
        });
    }

    #untint(one) {
        for (const { part, was, glowing } of one.tinted) {
            if (part.material === glowing) {
                part.material = was;
            }

            glowing.dispose();
        }

        one.tinted = [];
    }

    /** Let every weapon go. */
    dispose() {
        for (const one of this.held.values()) {
            this.#untint(one);
        }

        this.held.clear();
    }
}
