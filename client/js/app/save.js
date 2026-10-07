// What the game keeps between visits, in the browser's local storage: up to six characters, each
// with the seed of the world it lives in, what the folk in it remember of them and what they've
// learnt talking (core/dialogue.js), what they've found of the world (core/explored.js: the
// buildings gone into, the chunks set foot in), where they were when the game last stopped and
// how they were (hurt, poisoned, blessed: core/host.js vitalsOf); and settings (the game options,
// debug mode, drawing quality), the same whoever's played. Kept apart from each character: their
// world's own state, the war between its peoples (core/war/war.js), as it's got to (docs/WAR.md:
// a world's save is its host's).
//
// Each character's kept under keys of its own, "pellagos.<id>.<kind>" (its save, talks...), and
// "pellagos.characters" says which there are and which was played last. Kept before there could
// be several (SAVE_VERSION 1), the one character had the keys to itself ("pellagos.save"...): it's
// moved under an id of its own the first time it's looked for (migrate).
//
// Storage can be missing or refuse to work (private browsing, blocked site data), so every read
// and write is guarded: without it the game still plays, it just doesn't remember.

import { ELEMENT_TOMES } from "../core/spells.js";
import { decode, encode } from "../core/wire.js";

const ROSTER_KEY = "pellagos.characters";
const SETTINGS_KEY = "pellagos.settings";

// What's kept of each character, each under its own key
const KINDS = Object.freeze(["save", "talks", "explored", "progress", "standing", "followers", "wheels", "pin", "place", "vitals", "world"]);

// A character's id: eight letters and digits
const ID = /^[a-z0-9]{8}$/;

const keyOf = (save, kind) => `pellagos.${save.id}.${kind}`;

/** How many characters are kept at most: making another means replacing one of them. */
export const MOST_CHARACTERS = 6;

/**
 * The save format's version: a save from another version is set aside, not misread. 2 since each
 * character's kept under an id of its own (1: one character, its keys to itself; moved on).
 */
export const SAVE_VERSION = 2;

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
    // (And whether it springs up under the thumb wherever it lands in the bottom left, rather than
    // waiting in its corner)
    stickFloats: false,
    // The zoom buttons in the bottom right corner: off, since pinching and the wheel zoom anyway
    zoom: false,
    // (Summoned by another player: said no to at once, not asked)
    resistSummons: false,
    // The camera (app/game.js cameraSettings): whether it follows round behind the player as they
    // walk; how far a drag turns and tilts it (1, as it's always been: half round across the
    // screen, 60 degrees up or down it); whether dragging up looks down; whether the greater
    // spells shake it
    cameraFollows: true,
    dragSpeed: 1,
    invertTilt: false,
    shake: true,
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

function remove(key) {
    try {
        globalThis.localStorage?.removeItem(key);
    } catch {
        // Nothing to do
    }
}

// What's kept of a saved character (one with an id) of a kind, if it's of their game (its seed,
// and when it was started), or null
function own(save, kind) {
    const kept = save?.id ? read(keyOf(save, kind)) : null;

    return kept && kept.created === save.created && kept.seed === save.seed ? kept : null;
}

/** Is this a hero the game can play: a name, a body, a look and a weapon it knows? */
export function isHero(hero, weapons) {
    return Boolean(hero && typeof hero.name === "string" && hero.name.trim() && hero.shape?.macro && hero.look?.skin && hero.look?.hair && weapons[hero.weapon]);
}

// The characters kept ({ ids, last }: last, the one played last), the one kept before there
// could be several moved in first
function roster() {
    migrate();

    const kept = read(ROSTER_KEY);
    const ids = Array.isArray(kept?.ids) ? [...new Set(kept.ids.filter((id) => typeof id === "string" && ID.test(id)))].slice(0, MOST_CHARACTERS) : [];

    return { ids, last: ids.includes(kept?.last) ? kept.last : null };
}

// A new character's id: none of those kept
function newId(ids, random = Math.random) {
    let id;

    do {
        id = Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join("");
    } while (ids.includes(id));

    return id;
}

// A character as kept ({ version, id, hero, seed, created, played }), or null (none, or one
// that's no good)
function characterOf(id, weapons) {
    const save = read(`pellagos.${id}.save`);

    return save?.version === SAVE_VERSION && save.id === id && Number.isInteger(save.seed) && typeof save.created === "string" && isHero(save.hero, weapons) ? save : null;
}

/** The characters kept that can be played ({ version, id, hero, seed, created, played }), the one played last first. */
export function loadCharacters(weapons) {
    const { ids } = roster();

    return ids
        .map((id) => characterOf(id, weapons))
        .filter(Boolean)
        .sort((a, b) => String(b.played ?? b.created).localeCompare(String(a.played ?? a.created)));
}

/**
 * The character played last (Continue as...: { version, id, hero, seed, created, played }); or,
 * if that one's gone, the latest played of those left; or null for none (or none any good).
 */
export function loadSave(weapons) {
    const { last } = roster();

    return (last && characterOf(last, weapons)) ?? loadCharacters(weapons)[0] ?? null;
}

/**
 * Keep a character ({ hero, seed, created }, and `played`, when they last were), as the one played
 * last. A new one (no `id` yet) is given its id and kept with the others, unless MOST_CHARACTERS
 * are kept already (one of them must go first: forgetCharacter). Returns false if it isn't kept
 * (that, or the browser wouldn't store it).
 */
export function writeSave(save) {
    const { ids } = roster();

    if (!save.id) {
        if (ids.length >= MOST_CHARACTERS) {
            return false;
        }

        save.id = newId(ids);
    }

    save.created ??= new Date().toISOString();

    const kept = write(keyOf(save, "save"), { version: SAVE_VERSION, id: save.id, hero: save.hero, seed: save.seed, created: save.created, played: save.played ?? save.created });

    return kept && write(ROSTER_KEY, { ids: ids.includes(save.id) ? ids : [...ids, save.id], last: save.id });
}

/** A kept character played (now): the one Continue as... carries on with. */
export function playedSave(save) {
    if (!save?.id) {
        return false;
    }

    save.played = new Date().toISOString();

    return writeSave(save);
}

/**
 * Forget a character for good (by id): everything kept of them, their world with it. The one
 * played last becomes the latest played of those left.
 */
export function forgetCharacter(id) {
    const { ids, last } = roster();

    if (!ids.includes(id)) {
        return false;
    }

    for (const kind of KINDS) {
        remove(`pellagos.${id}.${kind}`);
    }

    const left = ids.filter((each) => each !== id);
    const latest = left.map((each) => read(`pellagos.${each}.save`)).filter(Boolean).sort((a, b) => String(b.played ?? b.created).localeCompare(String(a.played ?? a.created)))[0];

    return write(ROSTER_KEY, { ids: left, last: last === id ? (latest?.id ?? null) : last });
}

// The one character kept before there could be several (SAVE_VERSION 1: "pellagos.save",
// "pellagos.talks"... to itself), moved under an id of its own, as the one played last. What was
// kept of it is its if it's of its world (its seed: kept before, a new character's first keys
// could be a moment out from its own, and lost). Moved already (the same character: when it was
// started, its seed), what's left under the old keys is let go; and with six kept already, it
// waits.
function migrate() {
    const old = read("pellagos.save");

    if (!old) {
        return;
    }

    const usable = old.version === 1 && Number.isInteger(old.seed) && typeof old.created === "string" && old.hero && typeof old.hero === "object";
    const kept = read(ROSTER_KEY);
    const ids = Array.isArray(kept?.ids) ? kept.ids.filter((id) => typeof id === "string" && ID.test(id)) : [];
    const moved = ids.some((id) => {
        const save = read(`pellagos.${id}.save`);

        return save?.created === old.created && save?.seed === old.seed;
    });

    if (usable && !moved) {
        if (ids.length >= MOST_CHARACTERS) {
            return;
        }

        const save = { id: newId(ids), seed: old.seed, created: old.created };

        for (const kind of KINDS.filter((each) => each !== "save" && each !== "vitals")) {
            try {
                const text = globalThis.localStorage?.getItem(`pellagos.${kind}`);
                const value = text ? (kind === "world" ? decode(text) : JSON.parse(text)) : null;

                if (value?.seed === old.seed) {
                    const again = { ...value, created: old.created };

                    globalThis.localStorage?.setItem(keyOf(save, kind), kind === "world" ? encode(again) : JSON.stringify(again));
                }
            } catch {
                // (Not kept: nothing of it)
            }
        }

        if (!write(keyOf(save, "save"), { version: SAVE_VERSION, id: save.id, hero: old.hero, seed: old.seed, created: old.created, played: old.created }) || !write(ROSTER_KEY, { ids: [...ids, save.id], last: save.id })) {
            return;
        }
    }

    for (const kind of KINDS) {
        remove(`pellagos.${kind}`);
    }
}

/**
 * What the folk of a saved game ({ seed, created }) remember of its character, and what it's
 * learnt: { memory: { id: { talks, flags } }, knowledge: [...] }; nothing yet for another game.
 */
export function loadTalks(save) {
    const talks = own(save, "talks");

    return talks ? { memory: talks.memory ?? {}, knowledge: talks.knowledge ?? [] } : { memory: {}, knowledge: [] };
}

/** Keep what's been said in a saved game (not in one that isn't saved: ?play). */
export function saveTalks(save, { memory, knowledge }) {
    return save?.id ? write(keyOf(save, "talks"), { created: save.created, seed: save.seed, memory, knowledge: [...knowledge] }) : false;
}

/**
 * What the character of a saved game ({ seed, created }) has found of its world (core/explored.js
 * Explored's toJSON: { entered, visited }); nothing yet for another game.
 */
export function loadExplored(save) {
    const explored = own(save, "explored");

    return explored ? { entered: explored.entered ?? [], visited: explored.visited ?? "" } : { entered: [], visited: "" };
}

/** Keep what's been found in a saved game (not in one that isn't saved: ?play). */
export function saveExplored(save, explored) {
    return save?.id ? write(keyOf(save, "explored"), { created: save.created, seed: save.seed, ...explored.toJSON() }) : false;
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
    const progress = own(save, "progress");

    if (!progress) {
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
    return save?.id ? write(keyOf(save, "progress"), { created: save.created, seed: save.seed, format: PROGRESS_FORMAT, ...progress.toJSON() }) : false;
}

/**
 * Where a saved game's character stands with their people, the requests they carry, and their
 * guild card (core/standing.js Standing's toJSON), as kept: {} for none yet, or another game's.
 */
export function loadStanding(save) {
    const standing = own(save, "standing");

    return standing ? { points: standing.points, claimed: standing.claimed ?? [], requests: standing.requests ?? [], done: standing.done ?? [], next: standing.next, guild: standing.guild ?? null } : {};
}

/** Keep where the character stands in a saved game (not in one that isn't saved: ?play). */
export function saveStanding(save, standing) {
    return save?.id ? write(keyOf(save, "standing"), { created: save.created, seed: save.seed, ...standing.toJSON() }) : false;
}

/**
 * The followers a saved game's character leads (docs/WAR.md M9: core/host.js characterOf's
 * followers: [{ name, calling, sex, seed, people }]), as kept: none yet, or another game's.
 */
export function loadFollowers(save) {
    const kept = own(save, "followers");

    return kept && Array.isArray(kept.followers) ? kept.followers.filter((one) => one && typeof one.name === "string" && typeof one.calling === "string") : [];
}

/** Keep the followers the character leads, in a saved game. */
export function saveFollowers(save, followers) {
    return save?.id ? write(keyOf(save, "followers"), { created: save.created, seed: save.seed, followers }) : false;
}

/**
 * What a saved game's character has put on their action wheels (app/wheel.js readWheels), as
 * kept: null for nothing yet (what they start with), or another game's.
 */
export function loadWheels(save) {
    const kept = own(save, "wheels");

    return kept && kept.wheels && typeof kept.wheels === "object" ? kept.wheels : null;
}

/** Keep what the character's put on their action wheels, in a saved game. */
export function saveWheels(save, wheels) {
    return save?.id ? write(keyOf(save, "wheels"), { created: save.created, seed: save.seed, wheels }) : false;
}

/** Where the character's pinned on the world map, in a saved game ([x, z] metres), or null (none, or another game's). */
export function loadPin(save) {
    const kept = own(save, "pin");

    return kept && Array.isArray(kept.pin) && kept.pin.length === 2 && kept.pin.every(Number.isFinite) ? kept.pin : null;
}

/** Keep where the character's pinned on the world map (or that they've none: null), in a saved game. */
export function savePin(save, pin) {
    return save?.id ? write(keyOf(save, "pin"), { created: save.created, seed: save.seed, pin }) : false;
}

/**
 * Where the character was in a saved game's world when it last stopped ({ x, y, facing }: metres
 * out in the world, radians), or null (none kept, or another game's): where it carries on.
 */
export function loadPlace(save) {
    const kept = own(save, "place");
    const place = kept ? kept.place : null;

    return place && [place.x, place.y, place.facing].every(Number.isFinite) ? { x: place.x, y: place.y, facing: place.facing } : null;
}

/** Keep where the character is in a saved game's world ({ x, y, facing }), to carry on there. */
export function savePlace(save, place) {
    return save?.id && place ? write(keyOf(save, "place"), { created: save.created, seed: save.seed, place: { x: place.x, y: place.y, facing: place.facing } }) : false;
}

/**
 * How the character was in a saved game when it last stopped (core/host.js vitalsOf: their hit
 * points and stamina, what lingered and lasted on them, their boons, their abilities' and spells'
 * waits, each by what was left of it), or null (none kept, or another game's): how they carry
 * on. (What's in it the game checks as it puts it back: host.js restoreVitals)
 */
export function loadVitals(save) {
    const kept = own(save, "vitals");

    return kept?.vitals && typeof kept.vitals === "object" ? kept.vitals : null;
}

/** Keep how the character is in a saved game (host.js vitalsOf), kept with where they are. */
export function saveVitals(save, vitals) {
    return save?.id && vitals ? write(keyOf(save, "vitals"), { created: save.created, seed: save.seed, vitals }) : false;
}

/**
 * The war in a saved game's world ({ seed, created }), as it was kept (core/war/war.js snapshot),
 * or null (none yet, or another game's).
 */
export function loadWorld(save) {
    try {
        const text = save?.id ? globalThis.localStorage?.getItem(keyOf(save, "world")) : null;
        const world = text ? decode(text) : null;

        return world && world.created === save.created && world.seed === save.seed ? world.war : null;
    } catch {
        return null;
    }
}

/** Keep the war in a saved game's world (not in one that isn't saved: ?play). */
export function saveWorld(save, war) {
    if (!save?.id) {
        return false;
    }

    try {
        globalThis.localStorage?.setItem(keyOf(save, "world"), encode({ created: save.created, seed: save.seed, war }));

        return true;
    } catch {
        return false;
    }
}

/** Forget every character kept (and the one kept before there could be several). */
export function clearSave() {
    const { ids } = roster();

    for (const id of ids) {
        forgetCharacter(id);
    }

    remove(ROSTER_KEY);
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
