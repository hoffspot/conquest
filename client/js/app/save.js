// What the game keeps between visits, in the browser's local storage: the player's character
// (and the seed of the world it lives in), what the folk in it remember of them and what they've
// learnt talking (core/dialogue.js), and settings (the game options, debug mode, drawing
// quality).
//
// Storage can be missing or refuse to work (private browsing, blocked site data), so every read
// and write is guarded: without it the game still plays, it just doesn't remember.

const SAVE_KEY = "pellagos.save";
const SETTINGS_KEY = "pellagos.settings";
const TALKS_KEY = "pellagos.talks";

/** The save format's version: a save from another version is set aside, not misread. */
export const SAVE_VERSION = 1;

/** Settings, and what they are until changed. */
export const SETTINGS_DEFAULTS = Object.freeze({
    debug: false,
    debugFolded: false,
    quality: "auto",
    renderScale: 1,
    shadows: true,
    squares: false,
    minimap: true,
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
