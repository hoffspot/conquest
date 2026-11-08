// Horses: bought at a stable (host.js #stableService), each kept as a mount whistle (core/progress.js
// ITEMS mountWhistle) that calls it up out of a magic circle and sends it back down; ridden, it
// carries its rider faster and takes the blows aimed at them, till it falls and throws them
// (battle.js mount, #ride; host.js #whistle). Everything here is the same on every machine.

/** The model a horse is drawn from (beasts/model.js MODELS: no creature, but a player's mount). */
export const HORSE_MODEL = "horse";

/** What a stable asks: for a horse, and to bring a fallen one back (gold). */
export const STABLE = Object.freeze({ price: 400, revive: 100 });

/**
 * A horse's coats: its model's own, bay brown, and its other four (the catalog's
 * beast-horse-skins: "" is the model's own).
 */
export const COATS = Object.freeze(["bay", "gray", "dapple", "palomino", "white"]);

/**
 * Its manes and tails, the model's two (`part`: the light hair, or the long dark mane), each tinted
 * one of its colours (`tints`, sRGB hex: the hair's texture is grey, its colour the tint's).
 */
export const MANES = Object.freeze({
    light: { part: "ManeLight", tints: Object.freeze(["#f2ead8", "#d8c49a", "#bfb7a8"]) },
    dark: { part: "ManeDark", tints: Object.freeze(["#2a211b", "#4a3426", "#6b4a2e", "#1c1a19"]) },
});

// What its coat favours (a palomino and a white horse a light mane more often than not, a bay a dark)
const LIGHT = Object.freeze({ bay: 0.25, gray: 0.45, dapple: 0.4, palomino: 0.8, white: 0.75 });

/** Horses' names, one picked for each bought. */
export const HORSE_NAMES = Object.freeze([
    "Ash", "Bramble", "Briar", "Cinder", "Clover", "Comet", "Corrie", "Dapple", "Dusk", "Ember",
    "Fennel", "Flint", "Gale", "Ginger", "Hazel", "Heath", "Juniper", "Kestrel", "Larkspur", "Maple",
    "Marigold", "Meadow", "Mistral", "Nutmeg", "Oakley", "Pepper", "Quill", "Rowan", "Russet", "Saffron",
    "Sorrel", "Sparrow", "Storm", "Tansy", "Thistle", "Thorn", "Willow", "Wren", "Yarrow", "Zephyr",
]);

/**
 * How long each part of calling, mounting, dismounting and sending a horse back takes (ms), and how
 * it rides:
 * - `rise`: the horse rising out of its circle; `mount`: the rider getting up into the saddle (the
 *   pack's mounting clip is 1.77 s); `dismount`, `hop`: getting down (to fight: twice as fast);
 *   `sink`: the horse sinking back into its circle;
 * - `fall`: a horse fallen in a fight, dying and lying, before it sinks away (`sink`);
 * - `beside`: how far (m) from its rider it rises (at their side, the horse's left: the mounting
 *   clip's rider stands so far from its middle), and they get down;
 * - `thrown`: how far its rider's thrown off (TOSS's throw times this);
 * - `walk`, `run`: how many times faster than on foot it carries them, walking (at a trot: 3.7 m/s
 *   at a walking pace of 1.7) and running flat out (at a gallop: 13.4 m/s to a run's 7.9), and in
 *   between as far as they've got from one to the other (carried); ridden, a run takes none of
 *   their stamina, which comes back as it does at a walk (battle.js #move);
 * - `health`: its hit points, its rider's times this (rising as theirs do).
 */
export const MOUNT = Object.freeze({ rise: 1300, mount: 1800, dismount: 1800, hop: 900, sink: 1200, fall: 4000, beside: 0.55, thrown: 0.7, walk: 2.2, run: 1.7, health: 1.5 });

/**
 * How many times as fast as on foot a horse carries its rider going at `pace` (m/s, as they'd go
 * on foot): MOUNT.walk at their walking pace (`walk`) or slower, MOUNT.run at their run's
 * (`sprint`) and faster, and in between as far as they've got from the one to the other.
 */
export function carried(pace, walk, sprint) {
    const run = sprint > walk ? Math.min(1, Math.max(0, (pace - walk) / (sprint - walk))) : 0;

    return MOUNT.walk + (MOUNT.run - MOUNT.walk) * run;
}

/** A mount's phases: what it's doing, in order (`fallen` after riding, when it's struck down). */
export const PHASES = Object.freeze(["rising", "mounting", "riding", "dismounting", "sinking", "fallen"]);

// The phases in which it's under its rider (taking their blows), and those in which its rider's held
// where they are (getting up or down, or waiting on it to rise: not while it sinks, they're down)
const UNDER = new Set(["rising", "mounting", "riding"]);
const HELD = new Set(["rising", "mounting", "dismounting"]);

/** Whether a mount (an actor's `mount`) takes the blows aimed at its rider. */
export const carries = (mount) => Boolean(mount && UNDER.has(mount.phase));

/** Whether its rider's held where they are (getting up or down, or their horse rising for them). */
export const holds = (mount) => Boolean(mount && HELD.has(mount.phase));

/** Whether a mount's out (rising, ridden, being got down from), not yet going (sinking, fallen). */
export const out = (mount) => Boolean(mount && (UNDER.has(mount.phase) || mount.phase === "dismounting"));

/** How long (ms) a phase lasts (a dismount quick or not), or Infinity (riding). */
export function phaseLength(mount) {
    switch (mount.phase) {
        case "rising":
            return MOUNT.rise;
        case "mounting":
            return MOUNT.mount;
        case "dismounting":
            return mount.quick ? MOUNT.hop : MOUNT.dismount;
        case "sinking":
            return MOUNT.sink;
        case "fallen":
            return MOUNT.fall + MOUNT.sink;
        default:
            return Infinity;
    }
}

/** The phase after this one (null: it's gone). */
export function nextPhase(phase) {
    return { rising: "mounting", mounting: "riding", dismounting: "sinking" }[phase] ?? null;
}

/** A horse's hit points, carrying a rider with `maxHp`. */
export const horseHealth = (maxHp) => Math.max(1, Math.round(maxHp * MOUNT.health));

/**
 * A horse, bought at a stable: `{ id, name, coat, mane, tint, fallen }`, drawn from `random`
 * (core/random.js: next()) with `id` its own (a whistle's: unique in its owner's pack).
 */
export function horseFrom(random, id) {
    const pick = (list) => list[Math.min(list.length - 1, Math.floor(random.next() * list.length))];
    const coat = pick(COATS);
    const mane = random.next() < LIGHT[coat] ? "light" : "dark";

    return { id, name: pick(HORSE_NAMES), coat, mane, tint: pick(MANES[mane].tints), fallen: false };
}

/** A horse as it's kept (a whistle's `horse`): only what a horse has, of the kinds it has; or null. */
export function horseOf(value) {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || !value.id) {
        return null;
    }

    const mane = MANES[value.mane] ? value.mane : "dark";

    return {
        id: value.id.slice(0, 40),
        name: typeof value.name === "string" && value.name ? value.name.slice(0, 24) : HORSE_NAMES[0],
        coat: COATS.includes(value.coat) ? value.coat : COATS[0],
        mane,
        tint: MANES[mane].tints.includes(value.tint) ? value.tint : MANES[mane].tints[0],
        fallen: Boolean(value.fallen),
    };
}
