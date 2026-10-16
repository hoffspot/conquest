// A character as a file of its own (client/js/app/character-file.js; docs/GAME.md, "Saved
// characters"): characters exported as one file and read back as they were, kept on the device as
// new ones beside the rest (refused where they're kept already, or where there's no room); one
// kept by an older version of the game brought forward a step at a time (save.js SAVE_STEPS,
// never taken away), and whatever this version hasn't got left out and said; and what isn't one,
// or is a newer game's, refused, saying so.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CHARACTER_EXTENSION, CHARACTER_FORMAT, characterFile, CharacterFileError, readCharacterFile } from "../client/js/app/character-file.js";
import { defaultHero } from "../client/js/app/heroes.js";
import { exportCharacter, forgetCharacter, keepCharacter, loadCharacters, loadFollowers, loadProgress, loadTalks, loadWorld, MOST_CHARACTERS, SAVE_STEPS, SAVE_VERSION, saveFollowers, saveProgress, saveTalks, saveWorld, SOLO_KIND, writeSave } from "../client/js/app/save.js";
import { Progress } from "../client/js/core/progress.js";
import { WEAPONS } from "../client/js/core/weapons.js";
import { decode, encode } from "../client/js/core/wire.js";

let items;

beforeEach(() => {
    items = new Map();
    globalThis.localStorage = { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) };
});

afterEach(() => {
    delete globalThis.localStorage;
});

// A character kept on the device, as the game keeps one: their hero, what they carry, what the
// folk of their world remember of them, who follows them and their world's war
function character(name, { seed = 7, gold = 40 } = {}) {
    const save = { hero: { ...defaultHero(), name, race: "human" }, seed };

    assert.ok(writeSave(save));
    saveProgress(save, new Progress({ skills: { blade: 120 }, spells: ["vigor"], gold, pack: [{ id: "potion", count: 3 }] }, save.hero));
    saveTalks(save, { memory: { barkeep: { talks: 2, flags: ["ale"] } }, knowledge: ["the road north"] });
    saveFollowers(save, [{ name: "Hob", calling: "warrior", sex: "m", seed: 4, people: "human" }]);
    saveWorld(save, { version: 9, turn: 12, seed });

    return save;
}

describe("a character file", () => {
    it("holds the characters exported, read back as they were and kept as new ones beside the rest; not where they're kept already, nor with no room", () => {
        const ada = character("Ada", { seed: 7, gold: 40 });
        const bram = character("Bram", { seed: 8, gold: 90 });
        const file = characterFile([ada, bram], { when: new Date("2026-10-16T12:00:00Z") });
        const kept = decode(file.text);

        assert.equal(file.name, `Pellagos-characters-2026-10-16${CHARACTER_EXTENSION}`);
        assert.equal(characterFile([ada]).name, `Ada${CHARACTER_EXTENSION}`);
        assert.equal(file.count, 2);
        assert.equal(kept.format, CHARACTER_FORMAT);
        assert.equal(kept.saveVersion, SAVE_VERSION);
        assert.deepEqual(kept.characters.map((one) => one.save.hero.name), ["Ada", "Bram"]);

        const read = readCharacterFile(file.text);

        assert.deepEqual(read.map(({ name, left }) => ({ name, left })), [{ name: "Ada", left: [] }, { name: "Bram", left: [] }]);
        assert.deepEqual(keepCharacter(read[0].exported), { error: "here" }, "Ada's kept already");

        forgetCharacter(ada.id);

        const { save } = keepCharacter(read[0].exported);

        assert.notEqual(save.id, ada.id, "kept under an id of its own");
        assert.deepEqual(loadCharacters(WEAPONS).map((one) => one.hero.name).sort(), ["Ada", "Bram"]);
        assert.equal(loadProgress(save).gold, 40);
        assert.deepEqual(loadTalks(save).knowledge, ["the road north"]);
        assert.equal(loadFollowers(save)[0].name, "Hob");
        assert.equal(loadWorld(save).turn, 12, "their world's war with them");

        for (let k = loadCharacters(WEAPONS).length; k < MOST_CHARACTERS; k++) {
            character(`Filler ${k}`, { seed: 100 + k });
        }

        forgetCharacter(bram.id);
        character("Cara", { seed: 99 });
        assert.deepEqual(keepCharacter(read[1].exported), { error: "full" });
    });

    it("brings a character kept by an older version of the game forward, and leaves out what this version hasn't got, saying so", () => {
        const created = "2025-01-02T03:04:05.000Z";
        const hero = { ...defaultHero(), name: "Old Bram!", race: "dwarf", weapon: "halberd" };

        delete hero.look.eyes;

        // (Kept at save version 1, the one character the game kept before there could be several:
        // no id, and each kind told its seed alone)
        const old = {
            kind: SOLO_KIND,
            version: 1,
            saveVersion: 1,
            save: { version: 1, hero, seed: 5, created },
            progress: { seed: 5, format: 2, skills: { blade: 300, juggling: 50 }, schools: { healing: 10, shadow: 4 }, spells: ["heal", "moonwalk"], gold: 99, pack: [{ id: "potion", count: 2 }, { id: "oldBlade", count: 3 }, null, { id: "tinHat" }], gear: { mainHand: { id: "sword" }, head: { id: "tinHat" } } },
            followers: { seed: 5, followers: [{ name: "Hob", calling: "warrior" }, { name: "Pip", calling: "jester" }] },
            talks: { seed: 5, memory: {}, knowledge: ["the old mill"] },
            world: { seed: 5, war: { version: 99 } },
        };
        const [read] = readCharacterFile(encode({ format: CHARACTER_FORMAT, characters: [old] }));
        const { exported, left } = read;

        assert.equal(read.name, "Old Bram");
        assert.equal(exported.saveVersion, SAVE_VERSION);
        assert.equal(exported.save.version, SAVE_VERSION);
        assert.equal(exported.save.hero.race, "human");
        assert.equal(exported.save.hero.weapon, "sword");
        assert.ok(exported.save.hero.look.eyes.iris, "their look made whole");
        assert.equal(exported.progress.created, created, "each kind told when it was started, as migrate tells it");
        assert.deepEqual(exported.progress.spells, ["vigor"], "Heal by its new name");
        assert.deepEqual(exported.progress.pack, [{ id: "potion", count: 2 }, null, null, null]);
        assert.equal(exported.progress.gear.head, null);
        assert.deepEqual(exported.progress.skills, { blade: 300 });
        assert.deepEqual(exported.followers.followers.map((one) => one.name), ["Hob"]);
        assert.equal(exported.world, null);
        assert.deepEqual(left, [
            "Their name, as the game keeps names: Old Bram.",
            "Their people (dwarf), whom the game no longer has: they're human now.",
            "The weapon they started with (halberd), which the game no longer has: a sword.",
            "Parts of their look, which were missing: as a new hero's.",
            "5 things the game no longer has: old blade ×3 and tin hat ×2.",
            "The spell moonwalk, which the game no longer has.",
            "What they'd learnt of juggling and shadow, which the game no longer teaches.",
            "Pip (jester), who follows no more: the game has no such callings now.",
            "Their world's war, kept by a newer version of the game, starts again, in the same land.",
        ]);

        // (Kept, and played as any other: what they carry, as the game reads it)
        const { save } = keepCharacter(exported);
        const progress = new Progress(loadProgress(save), save.hero);

        assert.equal(loadCharacters(WEAPONS)[0].hero.name, "Old Bram");
        assert.equal(progress.gold, 99);
        assert.equal(progress.schools.healing, 10);
        assert.deepEqual(loadTalks(save).knowledge, ["the old mill"]);
    });

    it("starts a character whose world can't be read in a new one, with what they carry", () => {
        const exported = exportCharacter(character("Ada", { gold: 55 }));
        const [read] = readCharacterFile(encode({ ...exported, save: { ...exported.save, seed: "lost" } }));

        assert.ok(Number.isInteger(read.exported.save.seed) && read.exported.save.seed > 0);
        assert.equal(read.exported.talks, null);
        assert.equal(read.exported.world, null);
        assert.equal(read.exported.progress.gold, 55);
        assert.deepEqual(read.left, ["The world they lived in, which couldn't be read: they start in a new one, with what they carry and their skills."]);
    });

    it("refuses what isn't one, a file in a newer format, and a character a newer version of the game kept", () => {
        const exported = exportCharacter(character("Ada"));

        assert.throws(() => readCharacterFile("not a character"), CharacterFileError);
        assert.throws(() => readCharacterFile(encode({ format: "pellagos.world.1" })), /isn't a character file/);
        assert.throws(() => readCharacterFile(encode({ format: "pellagos.character.2", characters: [] })), (error) => error.newer && /newer format \(pellagos\.character\.2\)/.test(error.message));

        const [newer, heroless, fine] = readCharacterFile(encode({ format: CHARACTER_FORMAT, characters: [{ ...exported, saveVersion: SAVE_VERSION + 1 }, { ...exported, save: { ...exported.save, hero: null } }, exported] }));

        assert.match(newer.error, /kept by a newer version of the game/);
        assert.equal(newer.name, "Ada");
        assert.equal(heroless.error, "It has no hero.");
        assert.equal(fine.name, "Ada", "(the rest read all the same)");
    });

    it("can bring any version of the game's characters forward: no step's ever taken away", () => {
        for (let version = 1; version < SAVE_VERSION; version++) {
            assert.equal(typeof SAVE_STEPS[version], "function", `the step from save version ${version}`);
        }
    });
});
