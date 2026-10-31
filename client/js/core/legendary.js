// A legendary weapon's own effect (docs/GAME.md *Legendary weapons*): one of five, rolled on it as
// it's made (gear.js rollGear), apart from its bonuses. A unique (core/rare.js UNIQUES) may have an
// effect of its own too, whatever it is, worn or held (gear.js effectOf): one of those five, let
// loose by the blows of whoever wears it, or one let loose on them by the blows they take (`ward`:
// Stoneheart's stone skin). Every blow struck with it fills its charge
// (CHARGE: as many blows as it strikes in eight seconds of steady fighting), and the blow that
// lands once it's full lets the effect loose on whoever it struck (battle.js #unleash), for all to
// see: a foe frozen solid, a ring of fire, stone spears from the ground, lightning leaping from foe
// to foe, a blast that throws them. Thirty seconds without fighting and the charge is lost.
//
// How strong an effect is goes with the weapon's level (gear.js levelOf: 1 to 100): its harm in
// proportion to it, a level-10 weapon's a tenth of a level-100's; how long it holds them, how far
// it reaches and throws from a little at the first level to all of it at the highest. A legendary
// weapon made before they had effects has one all the same (effectFor: the same one wherever it's
// asked, from what it is), of its level, the first.
//
// Pure data and arithmetic, no DOM: the battle lets them loose, the pack tells of them
// (app/gearinfo.js), the world shows them (world/effects.js) and the sounds sound them
// (audio/catalog.js).

import { WEAPONS } from "./weapons.js";

/**
 * Each effect: its name, its element (the wards against it: battle.js #warded), what it does, and
 * its numbers, each [at the first level, at the highest] (or, `damage`, the harm at the highest,
 * [least, most], times the wielder's power for their blows, in proportion to the level below it):
 *
 *  - frostbind: the foe frozen solid `freeze` ms, then slowed (core/afflictions.js slow, frost);
 *  - cinderburst: fire bursting from the foe `radius` metres round, setting it burning, and those
 *    near it `near` of the time;
 *  - earthsunder: stone spears from the ground under the foe and `radius` metres round it, throwing
 *    them down `knockdown` ms;
 *  - stormlash: lightning leaping from the foe to as many more as `leaps` within `reach` metres of
 *    the last, `falls` as strong each leap, each stunned `stun` ms;
 *  - ruinblast: a blast at the foe (battle.js #blast), `radius` metres round, everyone in it hurt
 *    (the nearer, the worse) and thrown back `toss` (as Explosion throws: 3 metres a toss);
 *  - stoneheart (a ward, `ward`): every blow on whoever wears it `guard` the lighter, always; and,
 *    its charge full, their skin stone for `skin` ms, every blow on them `harden` the lighter again
 *    and none throwing them down (battle.js #steel); what they're told then, `felt`. A ward is drawn
 *    as its element has it (app/game.js WARD_LOOKS: a shell closing round them), heard as
 *    UNLEASHED_SOUNDS has it or its element's casting. Any ward's numbers are these three;
 *  - cleave (a unique's own, `unique`: Kingsplitter's, never rolled on a legendary weapon; always,
 *    `always`, no charge to it): every blow up close cleaving on through every other foe within
 *    `reach` metres before whoever strikes it (no more than `arc` degrees either side of the way to
 *    whoever it's struck at), each struck `share` as hard (battle.js #cleave).
 */
export const EFFECTS = Object.freeze({
    frostbind: {
        label: "Frostbind",
        element: "water",
        about: "Every so many blows, the foe struck is frozen solid in a shell of ice, then slowed as it thaws.",
        damage: [10, 16],
        freeze: [500, 2000],
    },
    cinderburst: {
        label: "Cinderburst",
        element: "fire",
        about: "Every so many blows, a ring of fire bursts from the foe struck, burning it and those round it.",
        damage: [12, 18],
        radius: [1.2, 2.5],
        near: 0.5,
    },
    earthsunder: {
        label: "Earthsunder",
        element: "earth",
        about: "Every so many blows, stone spears burst from the ground under the foe struck and round it, throwing them down.",
        damage: [12, 18],
        radius: [1, 2],
        knockdown: [400, 1200],
    },
    stormlash: {
        label: "Stormlash",
        element: "air",
        about: "Every so many blows, forked lightning leaps from the foe struck to others near it.",
        damage: [14, 20],
        leaps: [1, 3],
        reach: 6,
        falls: 0.75,
        stun: [150, 400],
    },
    ruinblast: {
        label: "Ruinblast",
        element: null,
        about: "Every so many blows, the blow bursts in an explosion that hurls the foe struck, and those near it, back through the air.",
        damage: [16, 24],
        radius: [1.5, 3.5],
        toss: [0.5, 1.5],
    },
    // (A ward: let loose on whoever wears it by the blows they take, not by those they strike
    // (WARD_CHARGE), and never rolled on a legendary weapon: the Heart of Harrowstone's, rare.js)
    stoneheart: {
        label: "Stoneheart",
        ward: true,
        element: "earth",
        about: "Every blow lands a little lighter on whoever wears it; and every so many blows they take, their skin turns to stone a while, every blow on them blunted and none able to throw them down.",
        // (What the one wearing it's told as it's let loose on them: app/game.js #unleashed)
        felt: "your skin turns to stone!",
        guard: [0.04, 0.1],
        skin: [3000, 6000],
        harden: [0.35, 0.55],
    },
    // (A unique's own, never rolled on a legendary weapon; on every blow, with no charge to fill:
    // Kingsplitter's, rare.js)
    cleave: {
        label: "Cleave",
        unique: true,
        always: true,
        element: null,
        about: "Every blow cleaves on through every other foe before its wielder, each struck nearly as hard as the first.",
        share: [0.5, 0.8],
        reach: 2.6,
        arc: 60,
    },
});

/** The effects let loose by blows struck (EFFECTS but the wards and a unique's own): those rolled on a legendary weapon. */
export const BLOW_EFFECTS = Object.freeze(Object.keys(EFFECTS).filter((id) => !EFFECTS[id].ward && !EFFECTS[id].unique));

/**
 * A ward's charge (EFFECTS `ward`): full after `blows` blows taken (a blow that does harm, not one
 * slipped or caught whole on a shield), lost after CHARGE.idle without fighting, as a weapon's is.
 */
export const WARD_CHARGE = Object.freeze({ blows: 6 });

/**
 * A weapon's charge: full after as many blows as it strikes in `every` ms of steady fighting (its
 * slowest blow's interval: core/weapons.js), at least `least`; lost after `idle` ms without
 * striking or being struck.
 */
export const CHARGE = Object.freeze({ every: 8000, least: 2, idle: 30000 });

/** How many blows fill a weapon's charge (CHARGE): a sword's 7, a war hammer's 5. */
export function chargeOf(weapon) {
    const intervals = (WEAPONS[weapon]?.attacks ?? []).map(({ interval }) => interval);
    const slowest = intervals.length ? Math.max(...intervals) : CHARGE.every;

    return Math.max(CHARGE.least, Math.floor(CHARGE.every / slowest));
}

// The share of the way from an effect's first level to its highest a weapon's level is (0 to 1)
const shareOf = (level) => (Math.max(1, Math.min(100, Number.isFinite(level) ? Math.round(level) : 1)) - 1) / 99;

/** How strong an effect's harm is at a weapon's level: in proportion to it (a level-10's a tenth of a level-100's). */
export const effectStrength = (level) => Math.max(1, Math.min(100, Number.isFinite(level) ? Math.round(level) : 1)) / 100;

/**
 * An effect's numbers at a weapon's level (or a piece's, EFFECTS, each between its first level's
 * and its highest's): { damage: [least, most] (before the wielder's power), freeze, radius, near,
 * knockdown, leaps, reach, falls, stun, toss, guard, skin, harden, share, arc }, those it has.
 */
export function effectAt(id, level = 1) {
    const def = EFFECTS[id];

    if (!def) {
        return null;
    }

    const share = shareOf(level);
    const strength = effectStrength(level);
    const between = ([first, highest]) => first + (highest - first) * share;
    const numbers = def.damage ? { damage: def.damage.map((value) => Math.round(value * strength * 100) / 100) } : {};

    for (const key of ["freeze", "radius", "knockdown", "leaps", "stun", "toss", "guard", "skin", "harden", "share"]) {
        if (def[key]) {
            const value = between(def[key]);

            numbers[key] = key === "leaps" ? Math.round(value) : key === "radius" || key === "toss" || key === "guard" || key === "harden" || key === "share" ? Math.round(value * 100) / 100 : Math.round(value);
        }
    }

    for (const key of ["near", "reach", "falls", "arc"]) {
        if (def[key] !== undefined) {
            numbers[key] = def[key];
        }
    }

    return numbers;
}

/**
 * The effect a legendary weapon made before they had them has (EFFECTS key): one of them, picked
 * by what it is (its kind, name, bonuses), so it's the same wherever it's asked, every game alike.
 */
export function effectFor(item) {
    const ids = BLOW_EFFECTS;
    const text = `${item?.id ?? ""}|${item?.name ?? ""}|${JSON.stringify(item?.affixes ?? [])}|${JSON.stringify(Object.entries(item?.bonuses ?? {}).sort())}`;
    let hash = 2166136261;

    for (let k = 0; k < text.length; k++) {
        hash = Math.imul(hash ^ text.charCodeAt(k), 16777619) >>> 0;
    }

    return ids[hash % ids.length];
}
