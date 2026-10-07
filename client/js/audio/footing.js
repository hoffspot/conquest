// What a foot lands on, for the sound of the step (sound.js step, synth.js's footsteps): the
// square's ground where something's laid there (setpieces/pieces.js GROUND: boards, cobbles, a
// road, ploughed soil), and out in the world the land's own (core/worldplan BIOMES: overworld.js
// biomeAt): sand on a beach, snow in the snow and the tundra, scree on mountains, badlands and the
// volcano's ash, mud in the marsh, leaf litter in the woods, and grass everywhere else; and up high,
// scree and then snow whatever the land (world/ground.js ALPINE); water where it's waded through.

import { GROUND } from "../core/setpieces/pieces.js";

/** Every kind of footing there's a footstep for (synth.js `step${Name}`). */
export const SURFACES = Object.freeze(["grass", "dirt", "stone", "wood", "sand", "snow", "gravel", "mud", "leaves", "water"]);

/** The land's own footing, by land (core/worldplan BIOMES ids); grass where it's not here. */
export const LAND_FOOTING = Object.freeze({
    beach: "sand",
    sea: "sand",
    lake: "sand",
    snow: "snow",
    tundra: "snow",
    mountain: "gravel",
    badlands: "gravel",
    volcanic: "gravel",
    marsh: "mud",
    woods: "leaves",
    darkwood: "leaves",
    elfwood: "leaves",
    jungle: "leaves",
});

/**
 * How high (metres) the bare scree starts, and then the snow, whatever the land: the middles of
 * the ground's own bands (world/ground.js ALPINE: rock from 130 to 220, snow from 205 to 245).
 */
export const HIGH = Object.freeze({ scree: 175, snow: 225 });

/**
 * The footing (a SURFACES name) on a square: its `ground` (GROUND), and out in the world its land
 * (`land`: a biome's id), how high it is (`height`, metres) and whether it's waded through (`wet`).
 * Boards and cobbles are as laid, wet or not (a bridge's deck); a road is packed dirt but in snow,
 * sand or scree; ploughed soil's dirt but in the marsh's mud or the snow.
 */
export function footing(ground, { land = null, height = 0, wet = false } = {}) {
    if (ground === GROUND.planks) {
        return "wood";
    }

    if (ground === GROUND.cobbles || ground === GROUND.courtyard) {
        return "stone";
    }

    if (wet) {
        return "water";
    }

    const natural = height >= HIGH.snow ? "snow" : height >= HIGH.scree ? "gravel" : (LAND_FOOTING[land] ?? null);

    if (ground === GROUND.road) {
        return ["snow", "sand", "gravel"].includes(natural) ? natural : "dirt";
    }

    if (ground === GROUND.soil) {
        return natural === "mud" || natural === "snow" ? natural : "dirt";
    }

    return natural ?? "grass";
}
