// What the game keeps between visits, in the browser's local storage: up to six characters, each
// with the seed of the world it lives in, what the folk in it remember of them and what they've
// learnt talking (core/dialogue.js), what they've found of the world (core/explored.js: the
// buildings gone into, the chunks set foot in), where they were when the game last stopped and
// how they were (hurt, poisoned, blessed: core/host.js vitalsOf), the last messages they were told
// (app/journal.js keepMessage); and settings (the game options,
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

import { isGuid, withGuid } from "../core/guid.js";
import { ELEMENT_TOMES } from "../core/spells.js";
import { MESSAGES_KEPT } from "./journal.js";
import { decode, encode } from "../core/wire.js";

const ROSTER_KEY = "pellagos.characters";
const SETTINGS_KEY = "pellagos.settings";

// What's kept of each character, each under its own key
const KINDS = Object.freeze(["save", "talks", "explored", "progress", "standing", "followers", "wheels", "pin", "place", "vitals", "world", "messages", "told"]);

// A character's id: eight letters and digits
const ID = /^[a-z0-9]{8}$/;

const keyOf = (save, kind) => `pellagos.${save.id}.${kind}`;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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
    // The thumb stick in the bottom left corner to walk with (app/steering.js): on to start with
    // (tapping still walks, anywhere but on its circle), and which defaults it was saved under:
    // saved under the first (when it was off till asked for) it's forgotten, for today's. W, A, S, D
    // steer whether it's shown or not
    stick: true,
    stickDefaults: 2,
    // (And whether it springs up under the thumb wherever it lands in the bottom left, rather than
    // waiting in its corner)
    stickFloats: false,
    // The zoom buttons in the bottom right corner: off, since pinching and the wheel zoom anyway
    zoom: false,
    // Six quick actions across the bottom in a fight, not four with their names (app/quickbar.js):
    // on a narrow screen their names smaller, or only their icons
    quickSix: false,
    // (Summoned by another player: said no to at once, not asked)
    resistSummons: false,
    // (Asked to another player's party: let go unanswered, not asked)
    refuseInvites: false,
    // (Auto-snag: the player's spoils of a fight picked up as they come within reach of them, not
    // left for a tap; off to start with, as it always was. And what of them it takes: the
    // rarities and kinds ticked (host.js SNAG_GRADES, SNAG_KINDS), or null for everything)
    autoSnag: false,
    snagGrades: null,
    snagKinds: null,
    // The camera (app/game.js cameraSettings): whether it follows round behind the player as they
    // walk (off: it stays turned the way it's left); whether in a fight it frames it, three-
    // quarters on and clear of what stands round (the battle cam); how far a drag turns and tilts
    // it (1, as it's always been: half round across the screen, 60 degrees up or down it); whether
    // dragging up looks down; whether the greater spells shake it. And which camera defaults they
    // were saved under: following saved under the first (when it was on by default) is forgotten,
    // for today's
    cameraFollows: false,
    battleCam: true,
    cameraDefaults: 2,
    dragSpeed: 1,
    invertTilt: false,
    shake: true,
    // Full screen while playing (app/fullscreen.js): asked for whenever play starts or carries on
    fullscreen: true,
    sound: true,
    // How loud each kind of sound is, 0 to 1 (audio/sound.js VOLUME_DEFAULTS), and the scale
    // they're on: volumes saved on another (louder) scale are forgotten, for the defaults
    effectsVolume: 0.5,
    environmentVolume: 0.4,
    musicVolume: 0.35,
    volumeScale: 2,
});

const VOLUMES = ["effectsVolume", "environmentVolume", "musicVolume"];

// Where what's kept is read from: the browser's storage, or an export being read as if it were
// (importCharacter)
let reading = null;
const storage = () => reading ?? globalThis.localStorage;

function read(key) {
    try {
        const text = storage()?.getItem(key);

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
// that's no good). One kept before characters had ids of their own (core/guid.js) is given one,
// and kept with it
function characterOf(id, weapons) {
    const save = read(`pellagos.${id}.save`);

    if (!(save?.version === SAVE_VERSION && save.id === id && Number.isInteger(save.seed) && typeof save.created === "string" && isHero(save.hero, weapons))) {
        return null;
    }

    if (!isGuid(save.hero.guid)) {
        save.hero = withGuid(save.hero);
        write(keyOf(save, "save"), save);
    }

    return save;
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
 * are kept already (one of them must go first: forgetCharacter); and its hero, its own id, the
 * same wherever they go, if it hasn't one (core/guid.js). Returns false if it isn't kept (that,
 * or the browser wouldn't store it).
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
    save.hero = isGuid(save.hero?.guid) ? save.hero : withGuid(save.hero);

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
 * Explored's toJSON: { entered, visited, portals }: no `portals` kept from before there were
 * portals, worked out from the rest as they join); nothing yet for another game.
 */
export function loadExplored(save) {
    const explored = own(save, "explored");

    if (!explored) {
        return { entered: [], visited: "" };
    }

    return { entered: explored.entered ?? [], visited: explored.visited ?? "", ...(Array.isArray(explored.portals) ? { portals: explored.portals } : {}) };
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
 * The last messages the character was told across the screen, in a saved game ([{ text, at (ms since
 * 1970), times }], oldest first: journal.js keepMessage), or none (none kept, or another game's).
 */
export function loadMessages(save) {
    const kept = own(save, "messages");
    const messages = Array.isArray(kept?.messages) ? kept.messages : [];

    return messages.filter((message) => typeof message?.text === "string" && message.text && Number.isFinite(message.at) && Number.isInteger(message.times) && message.times >= 1).slice(-MESSAGES_KEPT).map(({ text, at, times }) => ({ text, at, times }));
}

/** Keep the last messages the character was told, in a saved game. */
export function saveMessages(save, messages) {
    return save?.id ? write(keyOf(save, "messages"), { created: save.created, seed: save.seed, messages }) : false;
}

/** What the character's been told once and needn't be again (app/game.js `#once`: "spoils"), in a saved game. */
export function loadTold(save) {
    const kept = own(save, "told");

    return Array.isArray(kept?.told) ? kept.told.filter((each) => typeof each === "string") : [];
}

/** Keep what the character's been told once, in a saved game. */
export function saveTold(save, told) {
    return save?.id ? write(keyOf(save, "told"), { created: save.created, seed: save.seed, told }) : false;
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
        const text = save?.id ? storage()?.getItem(keyOf(save, "world")) : null;
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

/** What a character's export says it is, and its version (exportCharacter). */
export const SOLO_KIND = "pellagos-solo-world";
export const SOLO_VERSION = 1;

/**
 * The steps that bring a character's export (exportCharacter's) from an older save version
 * forward: [n] takes it from version n to n + 1, as the game does with what it keeps itself.
 * Never take one away: a character kept by any version of the game can always be brought in
 * (app/character-file.js; contribution.md).
 */
export const SAVE_STEPS = Object.freeze({
    // (1, the one character kept before there could be several, as migrate moves it: an id of its
    // own, when it was last played, and each kind of its own told when it was started as well as
    // its seed)
    1: (exported) => {
        const save = { ...exported.save, version: 2, id: typeof exported.save?.id === "string" && ID.test(exported.save.id) ? exported.save.id : "00000000", played: exported.save?.played ?? exported.save?.created };
        const kinds = Object.fromEntries(KINDS.filter((kind) => kind !== "save" && isObject(exported[kind])).map((kind) => [kind, { ...exported[kind], created: save.created }]));

        return { ...exported, ...kinds, save };
    },
});

/** Why an export can't be brought in: `newer` if a newer version of the game made it. */
export class ExportError extends Error {
    constructor(message, { newer = false } = {}) {
        super(message);
        this.newer = newer;
    }
}

/**
 * A character's export (exportCharacter's, as any version of the game made it) brought forward to
 * this version's, a step at a time (SAVE_STEPS). Throws ExportError for what isn't one, or one a
 * newer version of the game made.
 */
export function forwardExport(exported) {
    const from = exported?.saveVersion;

    if (exported?.kind !== SOLO_KIND || !Number.isInteger(exported.version) || !Number.isInteger(from) || from < 1 || !isObject(exported.save)) {
        throw new ExportError("It isn't a character the game kept.");
    }

    if (exported.version > SOLO_VERSION || from > SAVE_VERSION) {
        throw new ExportError("It was kept by a newer version of the game: bring it in there, or once this one's updated.", { newer: true });
    }

    let forward = structuredClone(exported);

    for (let at = from; at < SAVE_VERSION; at++) {
        if (!SAVE_STEPS[at]) {
            throw new ExportError(`It was kept by a version of the game this one can't bring forward (save version ${at}).`);
        }

        forward = SAVE_STEPS[at](forward);
        forward.saveVersion = at + 1;
    }

    return forward;
}

/**
 * Everything kept of a character and their world, as one piece of plain data, for taking their
 * world to a world server (generated/world_server_plan.md §5: "bring my world to the server"):
 * { kind, version, saveVersion, save, talks, explored, progress, ..., world (its war) }, each as
 * it's kept here (null where nothing is), or null for a character that isn't kept.
 */
export function exportCharacter(save) {
    if (!save?.id || !own(save, "save")) {
        return null;
    }

    const kept = Object.fromEntries(KINDS.filter((kind) => kind !== "world").map((kind) => [kind, read(keyOf(save, kind))]));
    let world = null;

    try {
        const text = globalThis.localStorage?.getItem(keyOf(save, "world"));

        world = text ? decode(text) : null;
    } catch {
        world = null;
    }

    return { kind: SOLO_KIND, version: SOLO_VERSION, saveVersion: SAVE_VERSION, ...kept, world };
}

/**
 * A character and their world from an export (exportCharacter's), read by the same code the game
 * reads what it keeps with (each kind brought forward as it is here): { save, hero, talks,
 * explored, progress, standing, followers, wheels, pin, place, vitals, messages, told, war }; or
 * null if it isn't an export, or is one from a newer version of the game.
 */
export function importCharacter(given) {
    let exported;

    try {
        exported = forwardExport(given);
    } catch {
        return null;
    }

    const save = exported.save;

    if (save?.version !== SAVE_VERSION || typeof save.id !== "string" || !ID.test(save.id) || !Number.isInteger(save.seed) || typeof save.created !== "string" || typeof save.hero?.name !== "string") {
        return null;
    }

    const items = new Map(KINDS.filter((kind) => kind !== "world" && exported[kind]).map((kind) => [keyOf(save, kind), JSON.stringify(exported[kind])]));

    if (exported.world) {
        items.set(keyOf(save, "world"), encode(exported.world));
    }

    reading = { getItem: (key) => items.get(key) ?? null };

    try {
        return {
            save: { id: save.id, seed: save.seed, created: save.created, played: save.played ?? save.created },
            hero: structuredClone(save.hero),
            talks: loadTalks(save),
            explored: loadExplored(save),
            progress: loadProgress(save),
            standing: loadStanding(save),
            followers: loadFollowers(save),
            wheels: loadWheels(save),
            pin: loadPin(save),
            place: loadPlace(save),
            vitals: loadVitals(save),
            messages: loadMessages(save),
            told: loadTold(save),
            war: loadWorld(save),
        };
    } finally {
        reading = null;
    }
}

/**
 * A character from an export (exportCharacter's, brought forward and salvaged:
 * app/character-file.js) kept on this device as a new character, under an id of its own, with
 * their world and all that's kept of them: { save } (as loadCharacters gives one); or { error:
 * "full" } with MOST_CHARACTERS kept already (one must go first: forgetCharacter), "here" if the
 * same character's kept already (their own id, core/guid.js; or, kept before characters had ids,
 * the same hero started at the same moment in the same world), or "storage" if the browser
 * wouldn't keep them. One without an id of its own is given one.
 */
export function keepCharacter(exported) {
    const { ids, last } = roster();
    const from = exported.save;

    if (ids.some((id) => {
        const kept = read(`pellagos.${id}.save`);

        return (isGuid(from.hero?.guid) && kept?.hero?.guid === from.hero.guid) || (kept?.created === from.created && kept?.seed === from.seed && kept?.hero?.name === from.hero?.name);
    })) {
        return { error: "here" };
    }

    if (ids.length >= MOST_CHARACTERS) {
        return { error: "full" };
    }

    const save = { version: SAVE_VERSION, id: newId(ids), hero: withGuid(from.hero), seed: from.seed, created: from.created, played: from.played ?? from.created };
    let kept = true;

    for (const kind of KINDS.filter((each) => each !== "save" && each !== "world" && isObject(exported[each]))) {
        kept &&= write(keyOf(save, kind), { ...exported[kind], created: save.created, seed: save.seed });
    }

    if (isObject(exported.world) && exported.world.war) {
        try {
            globalThis.localStorage?.setItem(keyOf(save, "world"), encode({ created: save.created, seed: save.seed, war: exported.world.war }));
        } catch {
            kept = false;
        }
    }

    kept &&= write(keyOf(save, "save"), save) && write(ROSTER_KEY, { ids: [...ids, save.id], last });

    if (!kept) {
        for (const kind of KINDS) {
            remove(keyOf(save, kind));
        }

        write(ROSTER_KEY, { ids, last });

        return { error: "storage" };
    }

    return { save };
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

    if (saved.cameraDefaults !== SETTINGS_DEFAULTS.cameraDefaults) {
        delete saved.cameraFollows;
        delete saved.cameraDefaults;
    }

    if (saved.stickDefaults !== SETTINGS_DEFAULTS.stickDefaults) {
        delete saved.stick;
        delete saved.stickDefaults;
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
