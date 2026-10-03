// How much light there is to see by (the terrain plan's M7e, §9 Day and night: "everyone sees less
// far at night (the rules' sight range scaled by how much light's about: the sky's, and within
// reach of a torch, a lit window, a fire or a Light globe, the day's), so a hero with a torch or
// Light sees an ambush before it sees them; guards keep their posts lit"). The host works out the
// light each step from what everyone has (the war's clock, the world's plan, who's where), so every
// player's copy of the world sees alike; the battle's sight goes by it (battle.js canSee).
//
// Exact maths only (it's the rules').

import { daylight, moonPhase, timeOfDay } from "./daytime.js";
import { SETTLEMENTS } from "./worldplan/plan.js";

/**
 * How far one sees at night, a share of the battle's SIGHT where nothing's lit: by a moonless
 * night's light, and a full moon's.
 */
export const NIGHT_SIGHT = Object.freeze({ dark: 0.35, moon: 0.55 });

/**
 * How far round it each light lets one see as by day (metres): a carried torch, a war camp's fire,
 * a fire on the ground (a spell's: as far again as it burns), a settlement's streets, lit by its
 * windows and lamps and its guards' braziers, as far again past its edge, and the Light spell's
 * globe.
 */
export const LIGHT_REACH = Object.freeze({ torch: 9, camp: 14, fire: 6, settlement: 10, globe: 12 });

/** The weapons that leave a soldier a hand free to carry a torch at night (a shield's by day). */
export const TORCH_HANDS = new Set(["sword", "cleaver", "wand"]);

/** How far round a player the lights that matter are looked for (metres). */
export const LIGHT_NEAR = 80;

/**
 * How light the sky makes it, a share of SIGHT, when the world's been going `elapsed` ms: the
 * day's, or by night the moon's, fuller the fuller it is.
 */
export function skyLight(elapsed) {
    const full = 1 - Math.abs(moonPhase(elapsed) - 0.5) * 2;

    return Math.max(daylight(timeOfDay(elapsed)), NIGHT_SIGHT.dark + (NIGHT_SIGHT.moon - NIGHT_SIGHT.dark) * full);
}

/** Is it dark enough for torches (soldiers carry them, as the windows are lit: half through the dusk to half through the dawn)? */
export function torchesLit(elapsed) {
    return daylight(timeOfDay(elapsed)) < 0.5;
}

/** Does a battle's actor carry a torch now (`dark`: torchesLit's): a soldier with a hand free? */
export function carriesTorch(actor, dark) {
    return dark && actor.kind === "soldier" && !actor.dead && TORCH_HANDS.has(actor.weapon);
}

/**
 * What's lit for the battle's sight now ({ sky, lit }: the sky's light, a share of SIGHT, and the
 * circles round the lights near the players on the overworld, [x, y, reach²]): the world's
 * settlements, war camps' fires (`camps`: their middles, [x, y]), fires on the ground (`fires`:
 * { x, y, radius }), those carrying torches (`torches`: [x, y]) and those with the Light spell's
 * globe over them (`globes`: [x, y]). By day, nothing's needed.
 */
export function lighting({ elapsed, plan = null, players = [], camps = [], fires = [], torches = [], globes = [] }) {
    const sky = skyLight(elapsed);
    const lit = [];

    if (sky >= 1) {
        return { sky, lit };
    }

    const near = ([x, y], beyond) => players.some((player) => (player[0] - x) * (player[0] - x) + (player[1] - y) * (player[1] - y) <= (LIGHT_NEAR + beyond) * (LIGHT_NEAR + beyond));
    const circle = ([x, y], reach) => lit.push([x, y, reach * reach]);

    for (const place of plan?.places ?? []) {
        const reach = (SETTLEMENTS[place.kind]?.radius ?? 40) + LIGHT_REACH.settlement;

        if (near(place.at, reach)) {
            circle(place.at, reach);
        }
    }

    for (const at of camps) {
        if (near(at, LIGHT_REACH.camp)) {
            circle(at, LIGHT_REACH.camp);
        }
    }

    for (const { x, y, radius } of fires) {
        if (near([x, y], radius + LIGHT_REACH.fire)) {
            circle([x, y], radius + LIGHT_REACH.fire);
        }
    }

    for (const at of torches) {
        if (near(at, LIGHT_REACH.torch)) {
            circle(at, LIGHT_REACH.torch);
        }
    }

    for (const at of globes) {
        if (near(at, LIGHT_REACH.globe)) {
            circle(at, LIGHT_REACH.globe);
        }
    }

    return { sky, lit };
}

/** How far one can see someone at a square ([x, y] on the overworld), a share of SIGHT: as by day if it's lit, else as the sky has it. */
export function sightAt(light, [x, y]) {
    if (!light || light.sky >= 1) {
        return 1;
    }

    for (const [cx, cy, reach2] of light.lit) {
        if ((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) <= reach2) {
            return 1;
        }
    }

    return light.sky;
}
