// What the game keeps between visits, in the browser's local storage: the player's character
// (and the seed of the world it lives in), what the folk in it remember of them and what they've
// learnt talking (core/dialogue.js), what they've found of the world (core/explored.js: the
// buildings gone into, the chunks set foot in), and settings (the game options, debug mode,
// drawing quality). Kept apart from the character: the world's own state, the war between its
// peoples (core/war/war.js), as it's got to (docs/WAR.md: a world's save is its host's).
//
// Storage can be missing or refuse to work (private browsing, blocked site data), so every read
// and write is guarded: without it the game still plays, it just doesn't remember.

import { ELEMENT_TOMES } from "../core/spells.js";
import { decode, encode } from "../core/wire.js";

const SAVE_KEY = "pellagos.save";
const SETTINGS_KEY = "pellagos.settings";
const TALKS_KEY = "pellagos.talks";
const EXPLORED_KEY = "pellagos.explored";
const WORLD_KEY = "pellagos.world";
const PROGRESS_KEY = "pellagos.progress";
const STANDING_KEY = "pellagos.standing";
const FOLLOWERS_KEY = "pellagos.followers";
const WHEELS_KEY = "pellagos.wheels";
const PIN_KEY = "pellagos.pin";

/** The save format's version: a save from another version is set aside, not misread. */
export const SAVE_VERSION = 1;

/** Settings, and what they are until changed. */
export const SETTINGS_DEFAULTS = Object.freeze({
    debug: false,
    debugFolded: false,
    // The visual quality chosen (Game options: a QUALITY level, world/view.js), or "auto" for the
    // one this device seems to want; and whether less is drawn while the device can't keep up
    // (Adaptive: app/governor.js)
    quality: "auto",
    adaptive: true,
    renderScale: 1,
    shadows: true,
    squares: false,
    navigation: false,
    minimap: true,
    // The thumb stick in the bottom left corner to walk with (app/steering.js): off until it's
    // asked for, since tapping is how the game has always been walked. W, A, S, D steer whether
    // it's shown or not
    stick: false,
    // The zoom buttons in the bottom right corner: off, since pinching and the wheel zoom anyway
    zoom: false,
    // (Summoned by another player: said no to at once, not asked)
    resistSummons: false,
    sound: true,
    // How loud each kind of sound is, 0 to 1 (audio/sound.js VOLUME_DEFAULTS), and the scale
    // they're on: volumes saved on another (louder) scale are forgotten, for the defaults
    effectsVolume: 0.5,
    environmentVolume: 0.4,
    musicVolume: 0.35,
    volumeScale: 2,
});

const VOLUMES = ["effectsVolume", "environmentVolume", "musicVolume"];

function read(key) {
    try {
        const text = globalThis.localStorage?.getItem(key);

        return text ? JSON.parse(text) : null;
    } catch {
        return null;
    }
}

function write(key, value) {
    try {
        globalThis.localStorage?.setItem(key, JSON.stringify(value));

        return true;
    } catch {
        return false;
    }
}

/** Is this a hero the game can play: a name, a body, a look and a weapon it knows? */
export function isHero(hero, weapons) {
    return Boolean(hero && typeof hero.name === "string" && hero.name.trim() && hero.shape?.macro && hero.look?.skin && hero.look?.hair && weapons[hero.weapon]);
}

/** The saved game ({ version, hero, seed, created }), or null for none (or one that's no good). */
export function loadSave(weapons) {
    const save = read(SAVE_KEY);

    return save?.version === SAVE_VERSION && Number.isInteger(save.seed) && isHero(save.hero, weapons) ? save : null;
}

/** Save a hero and the seed of its world. Returns false if the browser wouldn't store it. */
export function writeSave({ hero, seed }) {
    return write(SAVE_KEY, { version: SAVE_VERSION, hero, seed, created: new Date().toISOString() });
}

/**
 * What the folk of a saved game ({ seed, created }) remember of its character, and what it's
 * learnt: { memory: { id: { talks, flags } }, knowledge: [...] }; nothing yet for another game.
 */
export function loadTalks(save) {
    const talks = read(TALKS_KEY);
    const ours = talks && save?.created && talks.created === save.created && talks.seed === save.seed;

    return ours ? { memory: talks.memory ?? {}, knowledge: talks.knowledge ?? [] } : { memory: {}, knowledge: [] };
}

/** Keep what's been said in a saved game (not in one that isn't saved: ?play). */
export function saveTalks(save, { memory, knowledge }) {
    return save?.created ? write(TALKS_KEY, { created: save.created, seed: save.seed, memory, knowledge: [...knowledge] }) : false;
}

/**
 * What the character of a saved game ({ seed, created }) has found of its world (core/explored.js
 * Explored's toJSON: { entered, visited }); nothing yet for another game.
 */
export function loadExplored(save) {
    const explored = read(EXPLORED_KEY);
    const ours = explored && save?.created && explored.created === save.created && explored.seed === save.seed;

    return ours ? { entered: explored.entered ?? [], visited: explored.visited ?? "" } : { entered: [], visited: "" };
}

/** Keep what's been found in a saved game (not in one that isn't saved: ?play). */
export function saveExplored(save, explored) {
    return save?.created ? write(EXPLORED_KEY, { created: save.created, seed: save.seed, ...explored.toJSON() }) : false;
}

/**
 * How what's grown and carried is kept: 2 since the elements' schools were opened by their tomes
 * (core/spells.js ELEMENT_TOMES). Kept before, a character knew every element's first spell.
 */
export const PROGRESS_FORMAT = 2;

/**
 * What the character of a saved game ({ seed, created }) has grown into and carries (core/
 * progress.js Progress's toJSON: { skills, schools, spells, spellXp, gold, pack, gear });
 * nothing yet for another game. (Kept before the elements' tomes: every element open, as it was)
 */
export function loadProgress(save) {
    const progress = read(PROGRESS_KEY);
    const ours = progress && save?.created && progress.created === save.created && progress.seed === save.seed;

    if (!ours) {
        return {};
    }

    const spells = Array.isArray(progress.spells) ? progress.spells : [];

    return {
        skills: progress.skills ?? {},
        schools: progress.schools ?? null,
        spells: (progress.format ?? 1) < PROGRESS_FORMAT ? [...new Set([...spells, ...ELEMENT_TOMES])] : spells,
        spellXp: progress.spellXp ?? {},
        gold: progress.gold,
        pack: progress.pack ?? [],
        gear: progress.gear ?? null,
    };
}

/** Keep what's grown and carried in a saved game (not in one that isn't saved: ?play). */
export function saveProgress(save, progress) {
    return save?.created ? write(PROGRESS_KEY, { created: save.created, seed: save.seed, format: PROGRESS_FORMAT, ...progress.toJSON() }) : false;
}

/**
 * Where a saved game's character stands with their people, and the requests they carry
 * (core/standing.js Standing's toJSON), as kept: {} for none yet, or another game's.
 */
export function loadStanding(save) {
    const standing = read(STANDING_KEY);
    const ours = standing && save?.created && standing.created === save.created && standing.seed === save.seed;

    return ours ? { points: standing.points, claimed: standing.claimed ?? [], requests: standing.requests ?? [], done: standing.done ?? [], next: standing.next } : {};
}

/** Keep where the character stands in a saved game (not in one that isn't saved: ?play). */
export function saveStanding(save, standing) {
    return save?.created ? write(STANDING_KEY, { created: save.created, seed: save.seed, ...standing.toJSON() }) : false;
}

/**
 * The followers a saved game's character leads (docs/WAR.md M9: core/host.js characterOf's
 * followers: [{ name, calling, sex, seed, people }]), as kept: none yet, or another game's.
 */
export function loadFollowers(save) {
    const kept = read(FOLLOWERS_KEY);
    const ours = kept && save?.created && kept.created === save.created && kept.seed === save.seed;

    return ours && Array.isArray(kept.followers) ? kept.followers.filter((one) => one && typeof one.name === "string" && typeof one.calling === "string") : [];
}

/** Keep the followers the character leads, in a saved game. */
export function saveFollowers(save, followers) {
    return save?.created ? write(FOLLOWERS_KEY, { created: save.created, seed: save.seed, followers }) : false;
}

/**
 * What a saved game's character has put on their action wheels (app/wheel.js readWheels), as
 * kept: null for nothing yet (what they start with), or another game's.
 */
export function loadWheels(save) {
    const kept = read(WHEELS_KEY);
    const ours = kept && save?.created && kept.created === save.created && kept.seed === save.seed;

    return ours && kept.wheels && typeof kept.wheels === "object" ? kept.wheels : null;
}

/** Keep what the character's put on their action wheels, in a saved game. */
export function saveWheels(save, wheels) {
    return save?.created ? write(WHEELS_KEY, { created: save.created, seed: save.seed, wheels }) : false;
}

/** Where the character's pinned on the world map, in a saved game ([x, z] metres), or null (none, or another game's). */
export function loadPin(save) {
    const kept = read(PIN_KEY);
    const ours = kept && save?.created && kept.created === save.created && kept.seed === save.seed;

    return ours && Array.isArray(kept.pin) && kept.pin.length === 2 && kept.pin.every(Number.isFinite) ? kept.pin : null;
}

/** Keep where the character's pinned on the world map (or that they've none: null), in a saved game. */
export function savePin(save, pin) {
    return save?.created ? write(PIN_KEY, { created: save.created, seed: save.seed, pin }) : false;
}

/**
 * The war in a saved game's world ({ seed, created }), as it was kept (core/war/war.js snapshot),
 * or null (none yet, or another game's).
 */
export function loadWorld(save) {
    try {
        const text = globalThis.localStorage?.getItem(WORLD_KEY);
        const world = text ? decode(text) : null;

        return world && save?.created && world.created === save.created && world.seed === save.seed ? world.war : null;
    } catch {
        return null;
    }
}

/** Keep the war in a saved game's world (not in one that isn't saved: ?play). */
export function saveWorld(save, war) {
    if (!save?.created) {
        return false;
    }

    try {
        globalThis.localStorage?.setItem(WORLD_KEY, encode({ created: save.created, seed: save.seed, war }));

        return true;
    } catch {
        return false;
    }
}

/** Forget the saved game. */
export function clearSave() {
    try {
        globalThis.localStorage?.removeItem(SAVE_KEY);
    } catch {
        // Nothing to do
    }
}

/** The settings (defaults for anything not set). */
export function loadSettings() {
    const saved = { ...read(SETTINGS_KEY) };

    if (saved.volumeScale !== SETTINGS_DEFAULTS.volumeScale) {
        for (const key of [...VOLUMES, "volumeScale"]) {
            delete saved[key];
        }
    }

    return { ...SETTINGS_DEFAULTS, ...saved };
}

/** Change some settings, keeping the rest. Returns them all. */
export function saveSettings(changes) {
    const settings = { ...loadSettings(), ...changes };

    write(SETTINGS_KEY, settings);

    return settings;
}

/** A seed for a new world. */
export function newSeed(random = Math.random) {
    return 1 + Math.floor(random() * 2147483646);
}
