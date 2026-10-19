// A character as a file of its own (docs/GAME.md, "Saved characters"): one or more of the
// characters kept on a device, each as save.js exportCharacter gives it (their hero, what they
// carry and know, where and how they were, and their world's war), to keep somewhere safe, to
// carry to another browser or device, or to bring into a world on a server:
//
//   { format: "pellagos.character.1", exportedBy, exported, saveVersion, characters: [...] }
//
// written as the game writes what it keeps (core/wire.js). Read back, each character is brought
// forward a step at a time from the save version it was kept at (save.js SAVE_STEPS, never taken
// away), then salvaged: whatever this version of the game hasn't got (things, spells, skills,
// followers' callings, a people, a weapon, the world they lived in) is left out, or what a new
// character would have put in its place, and each is said. One kept by a newer version of the
// game is refused, saying so.
//
// A world server's kept heroes (server/storage/heroes.js) go the same way: a player takes theirs
// home, or the world's owner exports a player's, as files of this kind (exportOfKept), in the
// world's land and with its war; and one brought into a world from a file is kept as the server
// keeps its own (keptOfExport). A kept hero is salvaged as it's brought into the world too
// (salvageKept).

import { withGuid } from "../core/guid.js";
import { STARTING_WEAPONS } from "../core/weapons.js";
import { HIRES } from "../core/host.js";
import { ITEMS, TREES } from "../core/progress.js";
import { RENAMED, SCHOOLS, SPELLS } from "../core/spells.js";
import { WAR_VERSION } from "../core/war/war.js";
import { decode, encode } from "../core/wire.js";
import { cleanName, defaultHero, HERO_PEOPLES } from "./hero-basics.js";
import { ExportError, exportCharacter, forwardExport, importCharacter, newSeed, PROGRESS_FORMAT, SAVE_VERSION, SOLO_KIND, SOLO_VERSION } from "./save.js";
import { codeVersion } from "./version.js";

/** What a character file says it is. */
export const CHARACTER_FORMAT = "pellagos.character.1";

/** A character file's name ends so. */
export const CHARACTER_EXTENSION = ".pellagos-character";

/** The most of a file that's read as one (bytes): six characters with their worlds are far less. */
export const CHARACTER_LIMIT = 32 * 1024 * 1024;

// Kept of a character that's of the world they lived in: let go of with it
const WORLDLY = ["talks", "explored", "standing", "pin", "place", "told", "world"];

/** Why a file can't be read: `newer` if a newer version of the game made it. */
export class CharacterFileError extends Error {
    constructor(message, { newer = false } = {}) {
        super(message);
        this.newer = newer;
    }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

// An id as said: "oldBlade" as "old blade"
const wordsOf = (id) => String(id).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

// Names as said in a list: "a, b and c"
const listOf = (names) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? ""));

/**
 * Characters (saves, as loadCharacters gives them) as a file: { name, text, count }. Its name is
 * the character's ("Aldric.pellagos-character"), or for several, the day's.
 */
export function characterFile(saves, { when = new Date() } = {}) {
    return fileOf(saves.map((save) => exportCharacter(save)).filter(Boolean), { when });
}

/** Characters' exports (exportCharacter's, or exportOfKept's) as a file: { name, text, count }, as characterFile. */
export function fileOf(characters, { when = new Date() } = {}) {
    const one = characters.length === 1 ? cleanName(characters[0].save.hero?.name).replace(/[^\p{L}\p{M}'-]+/gu, "-") : "";
    const name = `${one || `Pellagos-characters-${when.toISOString().slice(0, 10)}`}${CHARACTER_EXTENSION}`;
    const text = encode({ format: CHARACTER_FORMAT, exportedBy: codeVersion(), exported: when.toISOString(), saveVersion: SAVE_VERSION, characters });

    return { name, text, count: characters.length };
}

/**
 * The characters in a character file (its text; or a single character's export, as save.js
 * exportCharacter gives one), each brought forward and salvaged: [{ name, exported, left }] (left:
 * what was left out of them or put right, said), or [{ name, error }] for one that can't be
 * brought in. Throws CharacterFileError for a file that isn't one, or is in a newer format.
 */
export function readCharacterFile(text) {
    let file;

    try {
        file = decode(String(text));
    } catch {
        throw new CharacterFileError("That isn't a character file: it doesn't read.");
    }

    const format = /^pellagos\.character\.(\d+)$/.exec(file?.format ?? "");

    if (format && Number(format[1]) > 1) {
        throw new CharacterFileError(`That character file is in a newer format (${file.format}), from a newer version of the game: bring it in there, or once this one's updated.`, { newer: true });
    }

    const characters = format ? file.characters : file?.kind === SOLO_KIND ? [file] : null;

    if (!Array.isArray(characters)) {
        throw new CharacterFileError("That isn't a character file.");
    }

    return characters.map((exported) => {
        const name = cleanName(exported?.save?.hero?.name) || "A character";

        try {
            const { exported: salvaged, left } = salvage(forwardExport(exported));

            return { name: salvaged.save.hero.name, exported: salvaged, left };
        } catch (error) {
            return { name, error: error instanceof ExportError ? error.message : `It couldn't be read (${error.message}).` };
        }
    });
}

/**
 * A character's export (exportCharacter's, brought forward: save.js forwardExport) made one this
 * version of the game can play: { exported, left }, `left` saying what was left out of them or
 * put right. Throws ExportError for one with no hero to salvage.
 */
export function salvage(given) {
    const exported = structuredClone(given);
    const left = [];
    const save = exported.save;

    if (!isObject(save.hero)) {
        throw new ExportError("It has no hero.");
    }

    save.hero = heroOf(save.hero, left);

    if (typeof save.created !== "string" || Number.isNaN(Date.parse(save.created))) {
        save.created = new Date().toISOString();
    }

    // (The world they lived in, which can't be found again: a new one, and what was of the old let go)
    if (!Number.isInteger(save.seed) || save.seed < 1) {
        save.seed = newSeed();
        left.push("The world they lived in, which couldn't be read: they start in a new one, with what they carry and their skills.");

        for (const kind of WORLDLY) {
            exported[kind] = null;
        }
    }

    if (isObject(exported.progress)) {
        exported.progress = progressOf(exported.progress, left);
    }

    if (isObject(exported.followers) && Array.isArray(exported.followers.followers)) {
        const gone = exported.followers.followers.filter((one) => !HIRES[one?.calling]);

        exported.followers.followers = exported.followers.followers.filter((one) => HIRES[one?.calling]);

        if (gone.length) {
            left.push(`${listOf(gone.map((one) => `${typeof one?.name === "string" ? one.name : "A follower"} (${wordsOf(one?.calling ?? "nobody")})`))}, who ${gone.length > 1 ? "follow" : "follows"} no more: the game has no such callings now.`);
        }
    }

    // (A war the game can't carry on: a new one, in the same land)
    const war = exported.world?.war;

    if (war && !(Number.isInteger(war.version) && war.version >= 1 && war.version <= WAR_VERSION)) {
        exported.world = null;
        left.push(`Their world's war${Number.isInteger(war.version) && war.version > WAR_VERSION ? ", kept by a newer version of the game," : ", which couldn't be read,"} starts again, in the same land.`);
    }

    // (Each kind of what's kept of them told it's theirs: of the world they're in now, started when they were)
    for (const [kind, value] of Object.entries(exported)) {
        if (kind !== "save" && isObject(value) && "seed" in value) {
            exported[kind] = { ...value, created: save.created, seed: save.seed };
        }
    }

    return { exported, left };
}

// A hero as this version of the game can play them: their name, a people and a weapon it has,
// and a whole look (what's missing as a new hero's)
function heroOf(given, left) {
    const base = defaultHero();
    const hero = structuredClone(given);
    const name = cleanName(hero.name);
    let race = hero.race ?? "human";
    let parts = Array.isArray(hero.parts) ? hero.parts.filter((part) => typeof part === "string").slice(0, 4) : [];
    let weapon = hero.weapon;

    if (!name) {
        left.push("Their name, which couldn't be read: they're called Wanderer.");
    } else if (name !== hero.name) {
        left.push(`Their name, as the game keeps names: ${name}.`);
    }

    if (!HERO_PEOPLES.some(({ id }) => id === race)) {
        left.push(`Their people (${wordsOf(race)}), whom the game no longer has: they're human now.`);
        race = "human";
        parts = [];
    }

    if (!STARTING_WEAPONS.includes(weapon)) {
        left.push(`The weapon they started with (${wordsOf(weapon ?? "none")}), which the game no longer has: a sword.`);
        weapon = "sword";
    }

    const shape = isObject(hero.shape) ? hero.shape : {};
    const look = isObject(hero.look) ? hero.look : {};
    const missing = [isObject(shape.macro), isObject(look.skin), isObject(look.eyes), isObject(look.hair)].some((there) => !there);

    if (missing) {
        left.push("Parts of their look, which were missing: as a new hero's.");
    }

    return {
        ...hero,
        name: name || "Wanderer",
        race,
        parts,
        weapon,
        boots: Boolean(hero.boots),
        shape: { macro: { ...base.shape.macro, ...(isObject(shape.macro) ? shape.macro : {}) }, details: isObject(shape.details) ? shape.details : {} },
        look: {
            skin: { ...base.look.skin, ...(isObject(look.skin) ? look.skin : {}) },
            eyes: { ...base.look.eyes, ...(isObject(look.eyes) ? look.eyes : {}) },
            hair: isObject(look.hair) ? look.hair : base.look.hair,
        },
    };
}

// What a hero carries and has learnt, without what this version of the game hasn't got: things
// (in the pack and worn), spells (one renamed, by its new name), skills and schools of magic
function progressOf(progress, left) {
    const things = new Map();
    const gone = (item) => things.set(item.id, (things.get(item.id) ?? 0) + (Number.isInteger(item.count) && item.count > 0 ? item.count : 1));
    const known = (item) => {
        if (isObject(item) && !ITEMS[item.id]) {
            gone(item);

            return false;
        }

        return true;
    };

    if (Array.isArray(progress.pack)) {
        progress.pack = progress.pack.map((item) => (item && known(item) ? item : null));
    }

    if (isObject(progress.gear)) {
        progress.gear = Object.fromEntries(Object.entries(progress.gear).map(([slot, piece]) => [slot, piece && known(piece) ? piece : null]));
    }

    if (things.size) {
        const count = [...things.values()].reduce((sum, each) => sum + each, 0);

        left.push(`${count} ${count === 1 ? "thing" : "things"} the game no longer has: ${listOf([...things].map(([id, n]) => (n > 1 ? `${wordsOf(id)} ×${n}` : wordsOf(id))))}.`);
    }

    if (Array.isArray(progress.spells)) {
        const spells = progress.spells.map((id) => RENAMED[id] ?? id);
        const lost = spells.filter((id) => !SPELLS[id]);

        progress.spells = [...new Set(spells.filter((id) => SPELLS[id]))];

        if (lost.length) {
            left.push(`The ${lost.length > 1 ? "spells" : "spell"} ${listOf(lost.map(wordsOf))}, which the game no longer has.`);
        }
    }

    if (isObject(progress.spellXp)) {
        progress.spellXp = Object.fromEntries(Object.entries(progress.spellXp).map(([id, xp]) => [RENAMED[id] ?? id, xp]).filter(([id]) => SPELLS[id]));
    }

    // (Healing was a skill before there were schools of magic: Progress makes it the school's)
    const skills = isObject(progress.skills) ? Object.keys(progress.skills).filter((tree) => !TREES[tree] && !(tree === "healing" && !progress.schools)) : [];
    const schools = isObject(progress.schools) ? Object.keys(progress.schools).filter((school) => !SCHOOLS[school]) : [];

    for (const tree of skills) {
        delete progress.skills[tree];
    }

    for (const school of schools) {
        delete progress.schools[school];
    }

    if (skills.length || schools.length) {
        left.push(`What they'd learnt of ${listOf([...skills, ...schools].map(wordsOf))}, which the game no longer teaches.`);
    }

    return progress;
}

/**
 * A hero a world server keeps (server/storage/heroes.js: as core/host.js leave hands one back,
 * with where and how they were) as a character's export, as the game exports one of its own: in
 * the world's land (`seed`), with its war as it was last saved (`war`) if there's one to give,
 * `created` when it was kept.
 */
export function exportOfKept(character, { seed, created = new Date().toISOString(), war = null }) {
    const of = { created, seed };
    const kind = (value, wrap = null) => (value === undefined || value === null ? null : wrap ? { ...of, [wrap]: value } : isObject(value) ? { ...of, ...value } : null);

    return {
        kind: SOLO_KIND,
        version: SOLO_VERSION,
        saveVersion: SAVE_VERSION,
        save: { version: SAVE_VERSION, id: "00000000", hero: character.hero, seed, created, played: created },
        talks: kind(character.talks),
        explored: kind(character.explored),
        progress: isObject(character.progress) ? { ...of, format: PROGRESS_FORMAT, ...character.progress } : null,
        standing: kind(character.standing),
        followers: Array.isArray(character.followers) ? kind(character.followers, "followers") : null,
        wheels: null,
        pin: null,
        place: kind(character.place, "place"),
        vitals: kind(character.vitals, "vitals"),
        messages: null,
        told: null,
        world: war ? { ...of, war } : null,
    };
}

/**
 * A character's export (brought forward and salvaged: readCharacterFile's) as a world server keeps
 * a hero, read as the game reads what it keeps: { hero, talks, explored, progress, standing,
 * followers, place, vitals }; their hero with their own id (core/guid.js: given one, from a file
 * kept before characters had ids). Throws ExportError for one that doesn't read.
 */
export function keptOfExport(exported) {
    const read = importCharacter(exported);

    if (!read) {
        throw new ExportError("It couldn't be read.");
    }

    const { hero, talks, explored, progress, standing, followers, place, vitals } = read;

    return { hero: withGuid(hero), talks, explored, progress, standing, followers, ...(place ? { place } : {}), ...(vitals ? { vitals } : {}) };
}

/**
 * A hero a world server keeps, as this version of the game can play them (in the world's land,
 * `seed`): { character, left }, `left` saying what was left out or put right, as salvage says it.
 */
export function salvageKept(character, { seed }) {
    const { exported, left } = salvage(exportOfKept(character, { seed }));

    return { character: keptOfExport(exported), left };
}
