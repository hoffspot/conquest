// What the game keeps between visits, in the browser's local storage: the player's character
// (and the seed of the world it lives in), and settings (the game options, debug mode, drawing
// quality).
//
// Storage can be missing or refuse to work (private browsing, blocked site data), so every read
// and write is guarded: without it the game still plays, it just doesn't remember.

const SAVE_KEY = "pellagos.save";
const SETTINGS_KEY = "pellagos.settings";

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
    // How loud each kind of sound is, 0 to 1 (audio/sound.js VOLUME_DEFAULTS)
    effectsVolume: 0.8,
    environmentVolume: 0.5,
    musicVolume: 0.35,
});

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
    return { ...SETTINGS_DEFAULTS, ...read(SETTINGS_KEY) };
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
