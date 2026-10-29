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
// Worlds are kept apart from characters (docs/GAME.md, "Characters and worlds on this device"): a
// character can go into any of them, and each keeps its own war. What goes with a character
// wherever they go (CARRIED: who they are, what they've grown into and carry, their wheels, what
// they've been told) is kept under their id; what a world keeps of each character who's been in it
// (PLACED: what its folk remember of them and what they've learnt there, what they've found of it,
// where they stand with its peoples and the requests they carry, their followers there, where they
// were and how), under the id of their place in it; and the world itself ("pellagos.<id>.about":
// its name and seed, and its places) and its war, under the world's. "pellagos.worlds" says which
// worlds there are. Kept before worlds were apart, each character had a world of their own: it's
// made one, under the character's own id, the first time they're looked for (settle), so that
// what was kept of them all stays where it is.
//
// Storage can be missing or refuse to work (private browsing, blocked site data), so every read
// and write is guarded: without it the game still plays, it just doesn't remember.

import { isGuid, withGuid } from "../core/guid.js";
import { markersOf } from "../core/markers.js";
import { ELEMENT_TOMES } from "../core/spells.js";
import { MESSAGES_KEPT } from "./journal.js";
import { decode, encode } from "../core/wire.js";

const ROSTER_KEY = "pellagos.characters";
const WORLDS_KEY = "pellagos.worlds";
const SETTINGS_KEY = "pellagos.settings";

// What's kept of each character, each under its own key (and what an export of them carries)
const KINDS = Object.freeze(["save", "talks", "explored", "progress", "standing", "followers", "wheels", "pin", "markers", "place", "vitals", "world", "messages", "told"]);

// Of them, what goes with a character wherever they go, and what each world keeps of them
const CARRIED = Object.freeze(["save", "progress", "wheels", "messages", "told"]);
const PLACED = Object.freeze(["talks", "explored", "standing", "followers", "pin", "markers", "place", "vitals"]);

// A character's id, a world's and a place's: eight letters and digits, none the same as another's
const ID = /^[a-z0-9]{8}$/;

// The format of what's kept of a world ("pellagos.<id>.about")
const WORLD_VERSION = 1;

const keyOf = (save, kind) => `pellagos.${save.id}.${kind}`;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** How many characters are kept at most: making another means replacing one of them. */
export const MOST_CHARACTERS = 6;

/** How many worlds are kept at most: making another means deleting one of them. */
export const MOST_WORLDS = 8;

/** How many visitors a world on this device remembers at most: past that, the one gone longest's forgotten. */
export const MOST_VISITORS = 12;

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
    // The mouse pointer a sword, showing what a click would do, lit when shaken (app/pointer.js);
    // and larger. With a mouse only: a touch screen has none
    swordPointer: true,
    largePointer: false,
    // The zoom buttons in the bottom right corner: off, since pinching and the wheel zoom anyway
    zoom: false,
    // Six actions on the Action Bar across the bottom in a fight, not four with their names (app/quickbar.js):
    // on a narrow screen their names smaller, or only their icons
    quickSix: false,
    // The Action Bar kept up along the bottom out of a fight too, not only in one and a moment
    // after (app/game.js `quickAlways`): off to start with, as they always were
    quickAlways: false,
    // Hired adventurers saying a word now and then over their heads (app/game.js `chatter`:
    // core/followers.js BARKS): on to start with
    chatter: true,
    // Whom foes are on (app/game.js `showEnmity`: the rings and dots on the enemies list, the
    // counts on the party's icons, a taunt's mark): on to start with
    showEnmity: true,
    // (Summoned by another player: said no to at once, not asked)
    resistSummons: false,
    // (Asked to another player's party: let go unanswered, not asked)
    refuseInvites: false,
    // (Direct messages from another player (core/netplay.js DMS_TAKEN): from the player's party,
    // and from anyone else in the world, not taken, the one saying it told so)
    refusePartyDms: false,
    refuseWorldDms: false,
    // (What's said in the party and to the player shown a few seconds just above the quick
    // actions too, then faded: hud.js chatLine)
    chatOnScreen: true,
    // (The players blocked, in every world: blocksOf)
    blocked: Object.freeze([]),
    // (Auto-snag: the player's spoils of a fight picked up as they come within reach of them, not
    // left for a tap; off to start with, as it always was. And what of them it takes: the
    // rarities and kinds ticked (host.js SNAG_GRADES, SNAG_KINDS), or null for everything)
    autoSnag: false,
    snagGrades: null,
    snagKinds: null,
    // (A crash in a world on a world server: what the debug log kept of it sent to that server as
    // the player comes back in, for its admin to see: app/crash-reports.js)
    sendCrashes: true,
    // (Auto target lock: whoever the player sets on stays their target as they run from it, till it
    // falls or is 40 m off; off, only an enemy's icon held locks on: app/game.js `autoLock`)
    autoLock: true,
    // The camera (app/game.js cameraSettings): whether it follows round behind the player as they
    // walk (off: it stays turned the way it's left; on a touch screen, on: loadSettings); whether
    // in a fight it frames it, three-quarters on and clear of what stands round (the battle cam);
    // whether it turns to look along the way through where walls crowd it (`openWay`); how far a
    // drag turns it and tilts it (1, as it's always been: half round across the screen, 60 degrees
    // up or down it); whether dragging up looks down; whether the greater spells shake it. And
    // which camera defaults they were saved under: following saved under the first (when it was
    // on for everyone) is forgotten, for today's, and under the second (off for everyone) on a
    // touch screen
    cameraFollows: false,
    battleCam: true,
    cameraDefaults: 3,
    openWay: true,
    dragSpeed: 1,
    tiltSpeed: 1,
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

/**
 * The settings for how the player plays, not this device's: what auto-snag does, the target lock,
 * saying no to summons and invites, the battle cam, finding the way through, tilt inverted and
 * the greater spells' shaking. A hero a world server keeps keeps them with them (core/host.js OWN
 * `settings`), so they're the player's on whatever device or browser they come in from (main.js
 * playingJoined); the rest stay this device's: the screen, the sound, the stick, and how the
 * camera's turned by hand and follows, which go by whether it's touched or pointed at with a
 * mouse.
 */
export const PLAY_SETTINGS = Object.freeze(["autoSnag", "snagGrades", "snagKinds", "autoLock", "resistSummons", "refuseInvites", "refusePartyDms", "refuseWorldDms", "battleCam", "openWay", "invertTilt", "shake"]);

/** How many blocked players are kept (in every world together), and the longest word of one kept (blocksOf). */
export const BLOCKS = Object.freeze({ most: 200, length: 120 });

/**
 * Blocked players as they're kept (Game options' Blocked players; app/game.js block): each
 * { world (the world they're blocked in: game.js worldKey), who (who that world knows them as:
 * game.js whoIs), name }, each once (the last kept), the newest last, BLOCKS.most at most;
 * anything else let go.
 */
export function blocksOf(given) {
    const word = (value) => typeof value === "string" && value.length > 0 && value.length <= BLOCKS.length;
    const list = (Array.isArray(given) ? given : []).filter((one) => one !== null && typeof one === "object" && word(one.world) && word(one.who) && typeof one.name === "string").map(({ world, who, name }) => ({ world, who, name: name.slice(0, BLOCKS.length) }));
    const seen = new Set();

    return list
        .reverse()
        .filter(({ world, who }) => !seen.has(`${world} ${who}`) && seen.add(`${world} ${who}`))
        .reverse()
        .slice(-BLOCKS.most);
}

/**
 * Of `given` (settings, or a hero's kept by a world), the play settings (PLAY_SETTINGS) as the
 * game takes them: each the kind its default is (what auto-snag takes, a list of words, or null
 * for everything); the rest left out.
 */
export function playSettingsOf(given) {
    const of = given !== null && typeof given === "object" && !Array.isArray(given) ? given : {};
    const fits = (key, value) => (SETTINGS_DEFAULTS[key] === null ? value === null || (Array.isArray(value) && value.every((one) => typeof one === "string")) : typeof value === typeof SETTINGS_DEFAULTS[key] && (typeof value !== "number" || Number.isFinite(value)));

    return Object.fromEntries(PLAY_SETTINGS.filter((key) => key in of && fits(key, of[key])).map((key) => [key, Array.isArray(of[key]) ? [...of[key]] : of[key]]));
}

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
// could be several moved in first, and each without a world given one of their own
function roster() {
    migrate();

    const listed = charactersListed();

    settle(listed.ids);

    return listed;
}

// The characters kept, as "pellagos.characters" says: { ids, last }
function charactersListed() {
    const kept = read(ROSTER_KEY);
    const ids = Array.isArray(kept?.ids) ? [...new Set(kept.ids.filter((id) => typeof id === "string" && ID.test(id)))].slice(0, MOST_CHARACTERS) : [];

    return { ids, last: ids.includes(kept?.last) ? kept.last : null };
}

// The worlds kept, as "pellagos.worlds" says: their ids
function worldsListed() {
    const kept = read(WORLDS_KEY);

    return Array.isArray(kept?.ids) ? [...new Set(kept.ids.filter((id) => typeof id === "string" && ID.test(id)))].slice(0, MOST_WORLDS) : [];
}

// A world as kept ({ version, id, name, seed, created, played, places: { [a character's id]: {
// id, created } } }: each character's place in it, its own id and when they first came), or null
function worldRecord(id) {
    const world = typeof id === "string" && ID.test(id) ? read(`pellagos.${id}.about`) : null;

    return world?.version === WORLD_VERSION && world.id === id && typeof world.name === "string" && Number.isInteger(world.seed) && typeof world.created === "string" && isObject(world.places) ? world : null;
}

// Every id in use: the characters', the worlds' and their places'
function idsInUse() {
    const worlds = worldsListed();

    return new Set([...charactersListed().ids, ...worlds, ...worlds.flatMap((id) => Object.values(worldRecord(id)?.places ?? {}).map((place) => place?.id))]);
}

// A new id: none of those in use (those given, or every one)
function newId(ids = idsInUse(), random = Math.random) {
    const used = new Set(ids);
    let id;

    do {
        id = Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)]).join("");
    } while (used.has(id));

    return id;
}

// Each character kept without a world (kept before worlds were apart from characters, or new) given
// one of their own, named for them: under their own id, made from their seed when they were, and
// their place in it under their id too, so what's kept of them is theirs there as it was. With
// MOST_WORLDS kept already, they wait (and are asked where to go when they're played).
function settle(ids) {
    for (const id of ids) {
        const save = read(`pellagos.${id}.save`);

        if (save?.version !== SAVE_VERSION || save.id !== id || save.world !== undefined || !Number.isInteger(save.seed) || typeof save.created !== "string") {
            continue;
        }

        const worlds = worldsListed();

        if (!worldRecord(id)) {
            if (worlds.length >= MOST_WORLDS) {
                continue;
            }

            const name = typeof save.hero?.name === "string" && save.hero.name.trim() ? `${save.hero.name.trim()}'s world` : "A world";

            if (!write(`pellagos.${id}.about`, { version: WORLD_VERSION, id, name, seed: save.seed, created: save.created, played: save.played ?? save.created, places: { [id]: { id, created: save.created } } }) || !write(WORLDS_KEY, { ids: [...worlds, id] })) {
                continue;
            }
        }

        write(`pellagos.${id}.save`, { ...save, world: id });
    }
}

// A character as kept ({ version, id, hero, seed, created, played, world }: world, the id of the
// world they're in, null for none), or null (none, or one that's no good). One kept before characters had ids of their own (core/guid.js) is given one,
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

/** The characters kept that can be played ({ version, id, hero, seed, created, played, world }), the one played last first. */
export function loadCharacters(weapons) {
    const { ids } = roster();

    return ids
        .map((id) => characterOf(id, weapons))
        .filter(Boolean)
        .sort((a, b) => String(b.played ?? b.created).localeCompare(String(a.played ?? a.created)));
}

/**
 * The character played last (Continue as...: { version, id, hero, seed, created, played, world }); or,
 * if that one's gone, the latest played of those left; or null for none (or none any good).
 */
export function loadSave(weapons) {
    const { last } = roster();

    return (last && characterOf(last, weapons)) ?? loadCharacters(weapons)[0] ?? null;
}

/**
 * Keep a character ({ hero, seed, created }, and `played`, when they last were; and `world`, the
 * id of the world they're in, or null for none), as the one played last. A new one (no `id` yet)
 * is given its id and kept with the others, unless MOST_CHARACTERS are kept already (one of them
 * must go first: forgetCharacter); and its hero, its own id, the same wherever they go, if it
 * hasn't one (core/guid.js). A new one not given a world is given one of their own, made from
 * their seed, the next time the characters are looked at (settle). Returns false if it isn't kept
 * (that, or the browser wouldn't store it).
 */
export function writeSave(save) {
    const { ids } = roster();

    if (!save.id) {
        if (ids.length >= MOST_CHARACTERS) {
            return false;
        }

        save.id = newId();
    }

    save.created ??= new Date().toISOString();
    save.hero = isGuid(save.hero?.guid) ? save.hero : withGuid(save.hero);

    const kept = write(keyOf(save, "save"), { version: SAVE_VERSION, id: save.id, hero: save.hero, seed: save.seed, created: save.created, played: save.played ?? save.created, ...(save.world !== undefined ? { world: save.world } : {}) });

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
 * Forget a character for good (by id): everything kept of them, and what every world kept of them
 * (their places in it). The worlds stay. The one played last becomes the latest played of those
 * left.
 */
export function forgetCharacter(id) {
    const { ids, last } = roster();

    if (!ids.includes(id)) {
        return false;
    }

    for (const kind of CARRIED) {
        remove(`pellagos.${id}.${kind}`);
    }

    for (const each of worldsListed()) {
        const world = worldRecord(each);
        const place = world?.places[id];

        if (place) {
            forgetPlace(place);
            delete world.places[id];
            write(`pellagos.${each}.about`, world);
        }
    }

    // (Kept before worlds were apart, and never given one: what was kept of them in theirs)
    if (!worldRecord(id)) {
        for (const kind of [...PLACED, "world"]) {
            remove(`pellagos.${id}.${kind}`);
        }
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

        const save = { id: newId(), seed: old.seed, created: old.created };

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

// What a world kept of a character (their place in it: { id, created }) forgotten
function forgetPlace(place) {
    if (typeof place?.id === "string" && ID.test(place.id)) {
        for (const kind of PLACED) {
            remove(`pellagos.${place.id}.${kind}`);
        }
    }
}

/**
 * The worlds kept on this device ({ version, id, name, seed, created, played, places }: places, by
 * character id, theirs in it), the one played in last first. Each character without one yet is
 * given one of their own first (settle).
 */
export function loadWorlds() {
    roster();

    return worldsListed()
        .map((id) => worldRecord(id))
        .filter(Boolean)
        .sort((a, b) => String(b.played ?? b.created).localeCompare(String(a.played ?? a.created)));
}

/** A world kept on this device, by its id ({ version, id, name, seed, created, played, places }), or null. */
export function loadLocalWorld(id) {
    roster();

    return worldRecord(id);
}

/**
 * Make a world on this device ({ name, seed }: seed, a new one if none's given), with nobody in it
 * yet: { world } (as loadWorlds gives one); or { error: "full" } with MOST_WORLDS kept already
 * (one must go first: forgetWorld), "name" without a name, or "storage" if the browser wouldn't
 * keep it.
 */
export function makeWorld({ name, seed = newSeed() } = {}) {
    roster();

    const ids = worldsListed();
    const named = typeof name === "string" ? name.trim().slice(0, 60) : "";

    if (!named) {
        return { error: "name" };
    }

    if (ids.length >= MOST_WORLDS) {
        return { error: "full" };
    }

    const now = new Date().toISOString();
    const world = { version: WORLD_VERSION, id: newId(), name: named, seed: Number.isInteger(seed) && seed >= 1 ? seed : newSeed(), created: now, played: now, places: {} };

    if (!write(`pellagos.${world.id}.about`, world) || !write(WORLDS_KEY, { ids: [...ids, world.id] })) {
        remove(`pellagos.${world.id}.about`);

        return { error: "storage" };
    }

    return { world };
}

/** Give a world kept on this device another name. Returns false if it isn't kept (or has no name). */
export function renameWorld(id, name) {
    const world = loadLocalWorld(id);
    const named = typeof name === "string" ? name.trim().slice(0, 60) : "";

    return Boolean(world && named) && write(`pellagos.${id}.about`, { ...world, name: named });
}

/**
 * Forget a world for good (by id): its war, and what it kept of every character who's been in it
 * (their places). The characters stay, with all they carry and have grown into; those who were in
 * it are in no world till they go into another.
 */
export function forgetWorld(id) {
    const world = loadLocalWorld(id);

    if (!world) {
        return false;
    }

    for (const place of Object.values(world.places)) {
        forgetPlace(place);
    }

    remove(`pellagos.${id}.world`);
    remove(`pellagos.${id}.about`);
    write(WORLDS_KEY, { ids: worldsListed().filter((each) => each !== id) });

    for (const each of charactersListed().ids) {
        const save = read(`pellagos.${each}.save`);

        if (save?.world === id) {
            write(`pellagos.${each}.save`, { ...save, world: null });
        }
    }

    return true;
}

/**
 * Where a character's kept in the world they're in (`save.world`): { world, place, war }: the world
 * (as loadWorlds gives one), and what's kept of them in it and of its war, each as the kinds'
 * functions take it ({ id, created, seed }: loadTalks(place), loadWorld(war)); or null if they're
 * in no world kept here. A character that isn't kept (?play) is their own place and war, kept
 * nowhere.
 */
export function stayOf(save) {
    if (!save?.id) {
        return save ? { world: null, place: save, war: save } : null;
    }

    roster();

    // (Where they are as kept, if they're kept: the save given may be from before they went elsewhere)
    const kept = read(keyOf(save, "save"));

    return stayIn(save, worldRecord(kept?.id === save.id ? kept.world : save.world));
}

// Where a character's kept in a world (as stayOf gives it), or null if they've never been in it
function stayIn(save, world) {
    const place = world?.places[save.id];

    return place ? { world, place: { id: place.id, created: place.created, seed: world.seed }, war: { id: world.id, created: world.created, seed: world.seed } } : null;
}

/**
 * A kept character into a world kept here (by id): their place in it made the first time they go
 * in, and it the world they're in from now. Returns where they're kept in it, as stayOf; or null if
 * either isn't kept.
 */
export function enterWorld(save, id) {
    const world = loadLocalWorld(id);
    const kept = save?.id ? read(keyOf(save, "save")) : null;

    if (!world || kept?.id !== save.id) {
        return null;
    }

    const now = new Date().toISOString();

    world.places[save.id] ??= { id: newId(), created: now };
    world.played = now;
    save.world = id;

    if (!write(`pellagos.${id}.about`, world) || !write(keyOf(save, "save"), { ...kept, world: id })) {
        return null;
    }

    return stayOf(save);
}

// A visitor's place in a world kept here (one of another player's characters, come in while it's
// open to others), by their own id (core/guid.js): { id, created } (as a character's place),
// `visitor` their name and `seen` when they last came or went. Made the first time they come, the
// one gone longest forgotten past MOST_VISITORS. As stayOf's place ({ id, created, seed }), or
// null if the world isn't kept or they've no id.
function visitorPlace(id, hero) {
    const world = loadLocalWorld(id);
    const guid = hero?.guid;

    if (!world || !isGuid(guid)) {
        return null;
    }

    const now = new Date().toISOString();

    if (!world.places[guid]) {
        const visitors = Object.entries(world.places)
            .filter(([, place]) => typeof place?.visitor === "string")
            .sort(([, a], [, b]) => String(a.seen).localeCompare(String(b.seen)));

        for (const [key, place] of visitors.slice(0, Math.max(0, visitors.length + 1 - MOST_VISITORS))) {
            forgetPlace(place);
            delete world.places[key];
        }

        world.places[guid] = { id: newId(), created: now };
    }

    const place = (world.places[guid] = { ...world.places[guid], visitor: typeof hero.name === "string" ? hero.name : "", seen: now });

    return write(`pellagos.${id}.about`, world) ? { id: place.id, created: place.created, seed: world.seed } : null;
}

/**
 * A visitor to a world kept here (one of another player's characters, as core/netplay.js
 * characterFrom brings them, come in while it's open to others: by their own id, core/guid.js) as
 * the world takes them in: who they are and what they carry, theirs; what the world remembers of
 * them from before (what its folk know of them and what they learnt there, what they found of it,
 * where they stand and the requests they carry, their followers, where they were and how, where
 * they'd pinned its map and their markers on it), its own. Remembered nowhere, the first time, with
 * no id, or the world not kept here.
 */
export function visitorOf(id, brought) {
    const place = visitorPlace(id, brought.hero);

    return { hero: brought.hero, progress: brought.progress, talks: loadTalks(place), explored: loadExplored(place), standing: loadStanding(place), followers: loadFollowers(place), roll: loadRoll(place), place: loadPlace(place), vitals: loadVitals(place), pin: loadPin(place), markers: loadMarkers(place) };
}

/**
 * A visitor gone from a world kept here (their character as core/host.js leave hands it back, with
 * where and how they were): what the world knows of them remembered, by their own id, for the next
 * time they come, and where they'd pinned its map and their markers on it. What they carry went
 * with them. Returns whether it's kept.
 */
export function keepVisitor(id, character) {
    const place = visitorPlace(id, character?.hero);

    if (!place) {
        return false;
    }

    const marked = { created: place.created, seed: place.seed };
    const { talks, explored, standing, followers, roll = [], place: where, vitals, pin = null, markers = [] } = character;
    const kept = [
        write(keyOf(place, "talks"), { ...marked, memory: isObject(talks?.memory) ? talks.memory : {}, knowledge: Array.isArray(talks?.knowledge) ? talks.knowledge : [] }),
        write(keyOf(place, "explored"), { ...marked, ...(isObject(explored) ? explored : {}) }),
        write(keyOf(place, "standing"), { ...marked, ...(isObject(standing) ? standing : {}) }),
        write(keyOf(place, "followers"), { ...marked, followers: Array.isArray(followers) ? followers : [], roll: Array.isArray(roll) ? roll : [] }),
        savePlace(place, where),
        saveVitals(place, vitals),
        savePin(place, pin),
        saveMarkers(place, markers),
    ];

    return kept.slice(0, 4).every(Boolean);
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
 * Explored's toJSON: { entered, visited, portals, found, signs, tracked, spotted }: no `portals`
 * kept from before there were portals, worked out from the rest as they join; no `found` till
 * another of their party found something for them; no signs read, homes tracked or places seen
 * from high ground till they've any);
 * nothing yet for another game.
 */
export function loadExplored(save) {
    const explored = own(save, "explored");

    if (!explored) {
        return { entered: [], visited: "" };
    }

    return { entered: explored.entered ?? [], visited: explored.visited ?? "", ...(Array.isArray(explored.portals) ? { portals: explored.portals } : {}), ...(isObject(explored.found) ? { found: explored.found } : {}), ...(Array.isArray(explored.signs) ? { signs: explored.signs } : {}), ...(Array.isArray(explored.tracked) ? { tracked: explored.tracked } : {}), ...(Array.isArray(explored.rings) ? { rings: explored.rings } : {}), ...(Array.isArray(explored.spotted) ? { spotted: explored.spotted } : {}) };
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
 * progress.js Progress's toJSON: { skills, schools, spells, spellXp, gold, pack, gear, invasion,
 * bestiary, legends }); nothing yet for another game. (Kept before the elements' tomes: every element open,
 * as it was)
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
        invasion: progress.invasion ?? null,
        bestiary: progress.bestiary ?? null,
        legends: progress.legends ?? null,
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
 * followers: [{ name, calling, sex, seed, people, and what they've grown into: level, xp,
 * wounds, gear, record... }]: those kept before they grew, fresh ones of theirs), as kept: none
 * yet, or another game's.
 */
export function loadFollowers(save) {
    const kept = own(save, "followers");

    // (And a beast they've tamed: core/wary.js)
    return kept && Array.isArray(kept.followers) ? kept.followers.filter((one) => one && ((typeof one.name === "string" && typeof one.calling === "string") || (one.tamed === true && typeof one.creature === "string"))) : [];
}

/**
 * The roll of the hired adventurers who've parted from a saved game's character (core/host.js
 * #rollCall: [{ name, calling, level, byname, gone, kills, day }]), kept with its followers: none
 * yet, or another game's.
 */
export function loadRoll(save) {
    const kept = own(save, "followers");

    return kept && Array.isArray(kept.roll) ? kept.roll.filter((one) => one && typeof one.name === "string" && typeof one.calling === "string") : [];
}

/** Keep the followers the character leads, and their roll (loadRoll), in a saved game. */
export function saveFollowers(save, followers, roll = []) {
    return save?.id ? write(keyOf(save, "followers"), { created: save.created, seed: save.seed, followers, roll }) : false;
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

/** The character's markers on the world map, in a saved game (core/markers.js markersOf), or none (none kept, or another game's). */
export function loadMarkers(save) {
    return markersOf(own(save, "markers")?.markers);
}

/** Keep the character's markers on the world map, in a saved game. */
export function saveMarkers(save, markers) {
    return save?.id ? write(keyOf(save, "markers"), { created: save.created, seed: save.seed, markers }) : false;
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

/**
 * A saved game's world's legends ({ seed, created }: core/rare.js Legends' toJSON, the rare
 * encounters met there, what's out and each player's clocks), kept with its war; or null (none
 * yet, or another game's).
 */
export function loadLegends(save) {
    try {
        const text = save?.id ? storage()?.getItem(keyOf(save, "world")) : null;
        const world = text ? decode(text) : null;

        return world && world.created === save.created && world.seed === save.seed && isObject(world.legends) ? world.legends : null;
    } catch {
        return null;
    }
}

/**
 * Keep the war in a saved game's world (not in one that isn't saved: ?play), and its legends
 * (core/rare.js Legends' toJSON) with it.
 */
export function saveWorld(save, war, legends = null) {
    if (!save?.id) {
        return false;
    }

    try {
        globalThis.localStorage?.setItem(keyOf(save, "world"), encode({ created: save.created, seed: save.seed, war, legends }));

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
 * Everything kept of a character and a world they've been in (`world`, its id: the one they're in,
 * unless another's given), as one piece of plain data, for taking them to another device or their
 * world to a world server (generated/world_server_plan.md §5: "bring my world to the server"): {
 * kind, version, saveVersion, save, talks, explored, progress, ..., world (its war, its legends
 * and its name) }, each as it's kept here (null where nothing is), as if the world were theirs
 * alone: everything marked with when they were started and the world's seed (save.seed), as a
 * character's export always was. Null for a character that isn't kept. One in no world is
 * exported with none, and their own seed.
 */
export function exportCharacter(save, { world: id } = {}) {
    if (!save?.id || !own(save, "save")) {
        return null;
    }

    const stay = id === undefined ? stayOf(save) : stayIn(save, loadLocalWorld(id));
    const seed = stay?.world.seed ?? save.seed;
    const marked = (value) => (value ? { ...value, created: save.created, seed } : null);
    const character = { ...read(keyOf(save, "save")) };

    delete character.world;
    const kept = Object.fromEntries(
        KINDS.filter((kind) => kind !== "world" && kind !== "save").map((kind) => [kind, PLACED.includes(kind) ? (stay ? marked(own(stay.place, kind)) : null) : marked(own(save, kind))]),
    );
    let world = null;

    try {
        const text = stay ? globalThis.localStorage?.getItem(keyOf(stay.war, "world")) : null;
        const war = text ? decode(text) : null;

        world = war && war.created === stay.war.created && war.seed === stay.war.seed ? { created: save.created, seed, war: war.war, legends: isObject(war.legends) ? war.legends : null, name: stay.world.name } : null;
    } catch {
        world = null;
    }

    return { kind: SOLO_KIND, version: SOLO_VERSION, saveVersion: SAVE_VERSION, save: { ...character, seed }, ...kept, world };
}

/**
 * A character and their world from an export (exportCharacter's), read by the same code the game
 * reads what it keeps with (each kind brought forward as it is here): { save, hero, talks,
 * explored, progress, standing, followers, wheels, pin, place, vitals, messages, told, war, legends }; or
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
            markers: loadMarkers(save),
            place: loadPlace(save),
            vitals: loadVitals(save),
            messages: loadMessages(save),
            told: loadTold(save),
            war: loadWorld(save),
            legends: loadLegends(save),
        };
    } finally {
        reading = null;
    }
}

/**
 * A character from an export (exportCharacter's, brought forward and salvaged:
 * app/character-file.js) kept on this device as a new character, under an id of its own, with
 * all that's kept of them, and the world they came with as a new world here (its name, or theirs
 * if it has none), them in it: { save } (as loadCharacters gives one); or { error: "full" } with
 * MOST_CHARACTERS kept already (one must go first: forgetCharacter), "worlds" with MOST_WORLDS
 * (forgetWorld), "here" if the same character's kept already (their own id, core/guid.js; or,
 * kept before characters had ids, the same hero started at the same moment in the same world), or
 * "storage" if the browser wouldn't keep them. One without an id of its own is given one.
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

    const worlds = worldsListed();

    if (worlds.length >= MOST_WORLDS) {
        return { error: "worlds" };
    }

    // (Their world, and their place in it, under their own id: as a character's own world is)
    const id = newId();
    const save = { version: SAVE_VERSION, id, hero: withGuid(from.hero), seed: from.seed, created: from.created, played: from.played ?? from.created, world: id };
    const named = typeof exported.world?.name === "string" && exported.world.name.trim() ? exported.world.name.trim().slice(0, 60) : `${save.hero.name}'s world`;
    let kept = true;

    for (const kind of KINDS.filter((each) => each !== "save" && each !== "world" && isObject(exported[each]))) {
        kept &&= write(keyOf(save, kind), { ...exported[kind], created: save.created, seed: save.seed });
    }

    if (isObject(exported.world) && exported.world.war) {
        try {
            globalThis.localStorage?.setItem(keyOf(save, "world"), encode({ created: save.created, seed: save.seed, war: exported.world.war, legends: isObject(exported.world.legends) ? exported.world.legends : null }));
        } catch {
            kept = false;
        }
    }

    kept &&= write(keyOf(save, "about"), { version: WORLD_VERSION, id, name: named, seed: save.seed, created: save.created, played: save.played, places: { [id]: { id, created: save.created } } }) && write(WORLDS_KEY, { ids: [...worlds, id] });
    kept &&= write(keyOf(save, "save"), save) && write(ROSTER_KEY, { ids: [...ids, save.id], last });

    if (!kept) {
        for (const kind of [...KINDS, "about"]) {
            remove(keyOf(save, kind));
        }

        write(ROSTER_KEY, { ids, last });
        write(WORLDS_KEY, { ids: worlds });

        return { error: "storage" };
    }

    return { save };
}

/** Forget every character and world kept (and the one character kept before there could be several). */
export function clearSave() {
    const { ids } = roster();

    for (const id of ids) {
        forgetCharacter(id);
    }

    for (const id of worldsListed()) {
        forgetWorld(id);
    }

    remove(ROSTER_KEY);
    remove(WORLDS_KEY);
}

// Whether this device's screen is touched rather than pointed at with a mouse (a phone, a tablet)
function touchScreen() {
    try {
        return Boolean(globalThis.matchMedia?.("(pointer: coarse)").matches);
    } catch {
        return false;
    }
}

/**
 * The settings (defaults for anything not set). On a touch screen (`touch`), Camera follows starts
 * on: touched, the camera's turned by hand less readily than with a mouse.
 */
export function loadSettings({ touch = touchScreen() } = {}) {
    const saved = { ...read(SETTINGS_KEY) };

    if (saved.volumeScale !== SETTINGS_DEFAULTS.volumeScale) {
        for (const key of [...VOLUMES, "volumeScale"]) {
            delete saved[key];
        }
    }

    if (saved.cameraDefaults !== SETTINGS_DEFAULTS.cameraDefaults) {
        // (Kept only where it was off for everyone and is so still: pointed at with a mouse)
        if (saved.cameraDefaults !== 2 || touch) {
            delete saved.cameraFollows;
        }

        delete saved.cameraDefaults;
    }

    if (saved.stickDefaults !== SETTINGS_DEFAULTS.stickDefaults) {
        delete saved.stick;
        delete saved.stickDefaults;
    }

    return { ...SETTINGS_DEFAULTS, cameraFollows: touch, ...saved, blocked: blocksOf(saved.blocked) };
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
