// The game's page-side modules that need no screen: saving, heroes, the loader
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { cleanName, defaultHero, HERO_PEOPLES, heroOfPeople, HUMAN_TONES, randomHero, suggestName, tonesOf } from "../client/js/app/heroes.js";
import { LOOKS } from "../client/js/characters/peoples.js";
import { formatBytes, Loader } from "../client/js/app/loader.js";
import { ICONS, ITEM_ICONS } from "../client/js/app/icons.js";
import { messagePlace, PARTY_ICON, partyFit, PLATE_SIZE, plateScale } from "../client/js/app/hud.js";
import { memberKind, QUICK_PHRASES, timeLeft, unreadLabel } from "../client/js/app/partypanel.js";
import { buildingsOf, compassTurn, interiorColours, mapColours, Minimap, paintPatch, paintingPatch, treesOf } from "../client/js/app/minimap.js";
import { ACTIONS, actionOf, assignable, DIRECTIONS, directionOf, drawWheel, FLIP, iconOf, offensive, PLACES, QUICK, readWheels, sectorPath, WHEELS } from "../client/js/app/wheel.js";
import { SPELLS } from "../client/js/core/spells.js";
import { EMOTES } from "../client/js/core/emotes.js";
import { ABILITIES, ITEMS, Progress } from "../client/js/core/progress.js";
import { clearSave, forgetCharacter, isHero, loadCharacters, loadExplored, loadMessages, loadPin, loadPlace, loadProgress, loadSave, loadSettings, loadStanding, loadTalks, loadVitals, loadWheels, loadWorld, MOST_CHARACTERS, newSeed, playedSave, SAVE_VERSION, saveExplored, saveMessages, savePin, savePlace, saveProgress, saveSettings, saveStanding, saveTalks, saveVitals, saveWheels, saveWorld, SETTINGS_DEFAULTS, writeSave } from "../client/js/app/save.js";
import { ago, KEPT_FROM, keepMessage, MESSAGES_KEPT } from "../client/js/app/journal.js";
import { encode } from "../client/js/core/wire.js";
import { Standing } from "../client/js/core/standing.js";
import { Explored } from "../client/js/core/explored.js";
import { BEARDS, HAIRSTYLES } from "../client/js/characters/hair.js";
import { MACRO_DEFAULTS } from "../client/js/characters/macro.js";
import { createRandom } from "../client/js/core/random.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { WEAPONS } from "../client/js/core/weapons.js";
import { guardOf, heroEquipment } from "../client/js/app/game.js";
import { BOUGHT } from "../client/js/core/host.js";
import { distanceLabel } from "../client/js/app/worldmap.js";
import { weaponNumbers } from "../client/js/app/creator.js";
import { generateWorld } from "../client/js/core/world.js";
import { buildWorld } from "../client/js/core/overworld.js";

// A stand-in for the browser's local storage (or one that refuses, as in private browsing)
function useStorage({ refuse = false } = {}) {
    const items = new Map();

    globalThis.localStorage = {
        getItem: (key) => {
            if (refuse) {
                throw new Error("SecurityError");
            }

            return items.get(key) ?? null;
        },
        setItem: (key, value) => {
            if (refuse) {
                throw new Error("QuotaExceededError");
            }

            items.set(key, String(value));
        },
        removeItem: (key) => items.delete(key),
    };

    return items;
}

describe("saving (save.js)", () => {
    it("keeps the hero and the seed of their world, and gives them back", () => {
        useStorage();

        const hero = { ...defaultHero(), name: "Wren", weapon: "bow" };
        const made = { hero, seed: 99, created: "2026-10-07T10:00:00.000Z" };

        assert.equal(writeSave(made), true);
        assert.match(made.id, /^[a-z0-9]{8}$/, "given an id of its own");

        const save = loadSave(WEAPONS);

        assert.equal(save.version, SAVE_VERSION);
        assert.deepEqual([save.id, save.seed, save.created], [made.id, 99, made.created], "started when it was made (what's kept of it is marked so)");
        assert.deepEqual(save.hero, hero);

        clearSave();
        assert.equal(loadSave(WEAPONS), null);
    });

    it("sets aside saves it can't play: another version, a nameless hero, an unknown weapon", () => {
        const items = useStorage();
        const hero = { ...defaultHero(), name: "Wren" };
        const id = "abcd1234";
        const created = "2026-10-07T10:00:00.000Z";

        items.set("pellagos.characters", JSON.stringify({ ids: [id], last: id }));

        for (const save of [{ version: 0, hero, seed: 1 }, { version: SAVE_VERSION, hero: { ...hero, name: "  " }, seed: 1 }, { version: SAVE_VERSION, hero: { ...hero, weapon: "rocket" }, seed: 1 }, { version: SAVE_VERSION, hero, seed: "x" }, { version: SAVE_VERSION, hero, seed: 1, id: "other123" }]) {
            items.set(`pellagos.${id}.save`, JSON.stringify({ id, created, ...save }));
            assert.equal(loadSave(WEAPONS), null);
            assert.deepEqual(loadCharacters(WEAPONS), []);
        }

        items.set(`pellagos.${id}.save`, "{ not json");
        assert.equal(loadSave(WEAPONS), null);
        assert.equal(isHero(hero, WEAPONS), true);
    });

    it("keeps up to six characters, each apart from the others; carries on with the one played last; a seventh isn't kept till one's forgotten", () => {
        useStorage();

        const hero = (name) => ({ ...defaultHero(), name });
        const made = ["Ash", "Briar", "Cole", "Dun", "Ember", "Fen"].map((name, i) => ({ hero: hero(name), seed: 10 + i, created: `2026-10-0${i + 1}T10:00:00.000Z` }));

        for (const save of made) {
            assert.equal(writeSave(save), true);
        }

        assert.equal(MOST_CHARACTERS, 6);
        assert.equal(new Set(made.map(({ id }) => id)).size, 6);
        assert.equal(loadSave(WEAPONS).hero.name, "Fen", "the last made, the last played");
        assert.deepEqual(loadCharacters(WEAPONS).map(({ hero: { name } }) => name), ["Fen", "Ember", "Dun", "Cole", "Briar", "Ash"], "the one played last first");

        // Each's own: what one's kept isn't another's
        assert.equal(saveTalks(made[0], { memory: { barkeep: { talks: 1, flags: [] } }, knowledge: new Set() }), true);
        assert.deepEqual(loadTalks(made[1]), { memory: {}, knowledge: [] });
        assert.deepEqual(loadTalks(made[0]).memory, { barkeep: { talks: 1, flags: [] } });

        // Played: the one carried on with
        assert.equal(playedSave(made[2]), true);
        assert.equal(loadSave(WEAPONS).hero.name, "Cole");
        assert.equal(loadCharacters(WEAPONS)[0].hero.name, "Cole");

        // A seventh: not till one's forgotten
        const seventh = { hero: hero("Gale"), seed: 99, created: "2026-10-08T10:00:00.000Z" };

        assert.equal(writeSave(seventh), false);
        assert.equal(seventh.id, undefined);
        assert.equal(loadCharacters(WEAPONS).length, 6);
        assert.equal(forgetCharacter(made[0].id), true);
        assert.equal(writeSave(seventh), true);
        assert.deepEqual(loadCharacters(WEAPONS).map(({ hero: { name } }) => name).sort(), ["Briar", "Cole", "Dun", "Ember", "Fen", "Gale"]);
        assert.equal(loadSave(WEAPONS).hero.name, "Gale");
    });

    it("forgets a character for good, everything kept of them and their world with it; carries on with the latest played of those left", () => {
        const items = useStorage();
        const [ash, briar] = [
            { hero: { ...defaultHero(), name: "Ash" }, seed: 10, created: "2026-10-01T10:00:00.000Z", played: "2026-10-05T10:00:00.000Z" },
            { hero: { ...defaultHero(), name: "Briar" }, seed: 11, created: "2026-10-02T10:00:00.000Z", played: "2026-10-06T10:00:00.000Z" },
        ];

        writeSave(ash);
        writeSave(briar);
        saveProgress(briar, new Progress({ gold: 30 }));
        saveWorld(briar, { version: 1, seed: 11, turn: 3 });
        savePlace(briar, { x: 1, y: 2, facing: 0 });
        saveVitals(briar, { hp: 5 });
        assert.ok([...items.keys()].some((key) => key.startsWith(`pellagos.${briar.id}.`)));

        assert.equal(forgetCharacter(briar.id), true);
        assert.deepEqual([...items.keys()].filter((key) => key.startsWith(`pellagos.${briar.id}.`)), [], "nothing of them left");
        assert.equal(loadSave(WEAPONS).hero.name, "Ash");
        assert.deepEqual([loadProgress(briar), loadWorld(briar), loadPlace(briar), loadVitals(briar)], [{}, null, null, null]);

        // (One that isn't kept: nothing to forget)
        assert.equal(forgetCharacter(briar.id), false);
        assert.equal(forgetCharacter(ash.id), true);
        assert.equal(loadSave(WEAPONS), null);
    });

    it("moves the one character kept before there could be several under an id of its own, all of it, even what was kept a moment out from it; once, however often what's under the old keys comes back", () => {
        const items = useStorage();
        const hero = { ...defaultHero(), name: "Wren" };
        const old = { version: 1, hero, seed: 7, created: "2026-10-01T10:00:00.000Z" };

        items.set("pellagos.save", JSON.stringify(old));
        items.set("pellagos.progress", JSON.stringify({ created: old.created, seed: 7, format: 2, gold: 55, skills: { blade: 40 } }));
        // (Kept a moment out from it, as a new character's first keys could be: its still)
        items.set("pellagos.talks", JSON.stringify({ created: "2026-10-01T10:00:00.001Z", seed: 7, memory: { barkeep: { talks: 3, flags: [] } }, knowledge: ["orc"] }));
        items.set("pellagos.world", encode({ created: old.created, seed: 7, war: { version: 1, seed: 7, turn: 12 } }));
        // (Another world's: not its)
        items.set("pellagos.place", JSON.stringify({ created: old.created, seed: 8, place: { x: 1, y: 2, facing: 0 } }));

        const save = loadSave(WEAPONS);

        assert.deepEqual([save.version, save.hero, save.seed, save.created], [SAVE_VERSION, hero, 7, old.created]);
        assert.equal(loadProgress(save).gold, 55);
        assert.deepEqual(loadTalks(save), { memory: { barkeep: { talks: 3, flags: [] } }, knowledge: ["orc"] });
        assert.equal(loadWorld(save).turn, 12);
        assert.equal(loadPlace(save), null);
        assert.deepEqual([...items.keys()].filter((key) => /^pellagos\.[a-z]+$/.test(key)).sort(), ["pellagos.characters"], "the old keys let go");

        // The old keys back again (as a page's script might put them): the same character, moved already
        saveProgress(save, new Progress({ gold: 80 }));
        items.set("pellagos.save", JSON.stringify(old));
        items.set("pellagos.progress", JSON.stringify({ created: old.created, seed: 7, format: 2, gold: 55 }));

        assert.deepEqual(loadCharacters(WEAPONS).map(({ id }) => id), [save.id]);
        assert.equal(loadProgress(loadSave(WEAPONS)).gold, 80, "what it's grown into since kept");
        assert.equal(items.has("pellagos.progress"), false);
    });

    it("keeps how a saved character was when it last stopped (host.js vitalsOf), to carry on so; not for another", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-10-07T10:00:00.000Z" };
        const vitals = { hp: 30, stamina: 12, afflictions: [{ kind: "poison", left: 4000, damage: 1, look: null }], buffs: [], boons: [{ id: "blessing", left: 50000 }], abilities: {}, spell: 0, spells: {} };

        assert.equal(loadVitals(save), null);
        assert.equal(saveVitals(save, vitals), true);
        assert.deepEqual(loadVitals(save), vitals);
        assert.equal(loadVitals({ ...save, seed: 13 }), null);
        assert.equal(loadVitals({ ...save, id: "other123" }), null);
        assert.equal(saveVitals({ seed: 1 }, vitals), false, "a game not saved (?play) keeps nothing");
        assert.equal(saveVitals(save, null), false);
    });

    it("remembers settings over their defaults", () => {
        useStorage();
        assert.deepEqual(loadSettings(), SETTINGS_DEFAULTS);
        assert.equal(SETTINGS_DEFAULTS.minimap, true, "the minimap starts on");
        assert.equal(SETTINGS_DEFAULTS.sound, true, "and so does the sound");
        assert.deepEqual([SETTINGS_DEFAULTS.dragSpeed, SETTINGS_DEFAULTS.invertTilt, SETTINGS_DEFAULTS.shake], [1, false, true], "and the camera's turning as it's always been");
        assert.deepEqual([SETTINGS_DEFAULTS.cameraFollows, SETTINGS_DEFAULTS.battleCam], [false, true], "not following round behind the player, but framing fights");

        saveSettings({ debug: true });
        saveSettings({ quality: "low" });
        assert.deepEqual(loadSettings(), { ...SETTINGS_DEFAULTS, debug: true, quality: "low" });

        // Volumes are kept on today's scale...
        saveSettings({ musicVolume: 0.2 });
        assert.equal(loadSettings().musicVolume, 0.2);
    });

    it("forgets volumes saved on the old, louder scale, for the new defaults, keeping the rest", () => {
        const items = useStorage();

        items.set("pellagos.settings", JSON.stringify({ minimap: false, effectsVolume: 0.1, environmentVolume: 0.1, musicVolume: 0.1 }));

        const settings = loadSettings();

        assert.equal(settings.minimap, false);
        assert.deepEqual([settings.effectsVolume, settings.environmentVolume, settings.musicVolume], [SETTINGS_DEFAULTS.effectsVolume, SETTINGS_DEFAULTS.environmentVolume, SETTINGS_DEFAULTS.musicVolume]);

        // Set again, they're remembered
        saveSettings({ effectsVolume: 0.3 });
        assert.equal(loadSettings().effectsVolume, 0.3);
    });

    it("forgets following saved when the camera followed by default, for today's default (not following), keeping it once it's set again", () => {
        const items = useStorage();

        items.set("pellagos.settings", JSON.stringify({ minimap: false, cameraFollows: true, effectsVolume: 0.3, volumeScale: 2 }));

        const settings = loadSettings();

        assert.equal(settings.cameraFollows, false);
        assert.deepEqual([settings.minimap, settings.effectsVolume, settings.battleCam], [false, 0.3, true]);

        saveSettings({ cameraFollows: true });
        assert.equal(loadSettings().cameraFollows, true);
    });

    it("keeps what a saved character's grown into: its schools, the spells it's learnt and how far they've grown; a save from before the elements' tomes knows every element's first spell", () => {
        const items = useStorage();
        const save = { id: "abcd1234", seed: 12, created: "2026-10-02T10:00:00.000Z" };
        const progress = new Progress({ schools: { fire: 160, healing: 40 }, spells: ["burn", "dodge", "summon", "zombify"], spellXp: { dodge: 30, summon: 520, zombify: 70 }, gold: 75 });

        assert.equal(saveProgress(save, progress), true);

        const again = new Progress(loadProgress(save));

        assert.deepEqual([again.schools, again.spells, again.spellXp, again.gold], [progress.schools, progress.spells, progress.spellXp, 75]);
        assert.deepEqual(["dodge", "summon", "zombify"].map((spell) => again.levelOf(spell)), [1, 4, 2]);
        assert.ok(again.knows("fireball") && again.opened("fire") && !again.opened("earth"));

        // (Kept before: no format, every element open as it was)
        const before = JSON.parse(items.get("pellagos.abcd1234.progress"));

        delete before.format;
        items.set("pellagos.abcd1234.progress", JSON.stringify({ ...before, spells: ["dodge"] }));

        const old = new Progress(loadProgress(save));

        assert.ok(["burn", "rumble", "hurt", "blister", "fireball", "dodge"].every((spell) => old.knows(spell)));

        // (Another game's: nothing)
        assert.deepEqual(loadProgress({ ...save, seed: 13 }), {});
    });

    it("remembers what the folk remember of a saved character, and what it's learnt; not for another", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const talks = { memory: { barkeep: { talks: 2, flags: ["askedPlace"] } }, knowledge: new Set(["orc"]) };

        assert.deepEqual(loadTalks(save), { memory: {}, knowledge: [] });
        assert.equal(saveTalks(save, talks), true);
        assert.deepEqual(loadTalks(save), { memory: { barkeep: { talks: 2, flags: ["askedPlace"] } }, knowledge: ["orc"] });

        // Another character (or world) starts afresh; a game not saved (?play) keeps nothing
        assert.deepEqual(loadTalks({ ...save, created: "2026-09-27T10:00:00.000Z" }), { memory: {}, knowledge: [] });
        assert.deepEqual(loadTalks({ ...save, seed: 13 }), { memory: {}, knowledge: [] });
        assert.equal(saveTalks({ seed: 1 }, talks), false);
    });

    it("remembers what a saved character has found of its world: the buildings gone into, the chunks set foot in, the guild's branches open to them; not for another", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const explored = new Explored();

        explored.enter("home:tavern");
        explored.visit(5000, 6000);

        assert.deepEqual(new Explored(loadExplored(save)).entered, new Set());
        assert.equal(saveExplored(save, explored), true);

        const back = new Explored(loadExplored(save));

        assert.ok(back.hasEntered("home:tavern") && back.isVisited(Math.floor(5000 / 64), Math.floor(6000 / 64)));
        assert.equal(back.chunksVisited, 1);

        // The guild's branches open to step through to: none kept from before there were portals
        // (worked out as they join: core/portals.js), kept once they are
        assert.equal(back.portals, null);
        assert.equal("portals" in loadExplored(save), false);
        back.openPortal("human-town-2");
        assert.equal(saveExplored(save, back), true);
        assert.deepEqual([...new Explored(loadExplored(save)).portals], ["human-town-2"]);

        // Another character (or world) starts afresh; a game not saved (?play) keeps nothing
        assert.equal(new Explored(loadExplored({ ...save, created: "2026-09-27T10:00:00.000Z" })).chunksVisited, 0);
        assert.equal(new Explored(loadExplored({ ...save, seed: 13 })).entered.size, 0);
        assert.equal(saveExplored({ seed: 1 }, explored), false);
    });

    it("keeps the war in a saved game's world apart from its character, as it was (never yet and all); not for another", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const war = { version: 1, seed: 12, turn: 40, towns: [{ id: "human-town-1", raidedAt: -Infinity }] };

        assert.equal(loadWorld(save), null);
        assert.equal(saveWorld(save, war), true);
        assert.deepEqual(loadWorld(save), war);
        assert.equal(loadWorld(save).towns[0].raidedAt, -Infinity);

        // Another character (or world) starts afresh; a game not saved (?play) keeps nothing
        assert.equal(loadWorld({ ...save, created: "2026-09-27T10:00:00.000Z" }), null);
        assert.equal(loadWorld({ ...save, seed: 13 }), null);
        assert.equal(saveWorld({ seed: 1 }, war), false);
    });

    it("keeps where a saved game's character stands with their people, and what they've been asked; not for another", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const standing = new Standing({ points: 75, claimed: [], requests: [{ kind: "wild", key: "wild", target: { wild: true, need: 2 }, state: "open", count: 1 }], next: 2 });

        assert.deepEqual(loadStanding(save), {});
        assert.equal(saveStanding(save, standing), true);
        assert.deepEqual(new Standing(loadStanding(save)).toJSON(), standing.toJSON());
        assert.deepEqual(loadStanding({ ...save, seed: 13 }), {});
        assert.equal(saveStanding({ seed: 1 }, standing), false);
    });

    it("keeps what a saved game's character has put on their action wheels; not for another", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const wheels = { self: [{ n: "vigor", ne: "item:potion" }, { e: "item:ale" }], enemy: [{ n: "stun" }, { w: "hold" }], quick: ["stun", null, "item:ale", "vigor"], version: 2 };

        assert.equal(loadWheels(save), null);
        assert.equal(saveWheels(save, wheels), true);
        assert.deepEqual(loadWheels(save), wheels);
        assert.deepEqual(readWheels(loadWheels(save)), wheels);
        assert.equal(loadWheels({ ...save, created: "2026-09-27T10:00:00.000Z" }), null);
        assert.equal(saveWheels({ seed: 1 }, wheels), false);
    });

    it("keeps where a saved game's character was when it last stopped, to carry on there; not for another game", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-10-05T10:00:00.000Z" };

        assert.equal(loadPlace(save), null);
        assert.equal(savePlace(save, { x: 3190.25, y: 4892.75, facing: 1.5 }), true);
        assert.deepEqual(loadPlace(save), { x: 3190.25, y: 4892.75, facing: 1.5 });
        assert.equal(loadPlace({ ...save, seed: 13 }), null);
        assert.equal(loadPlace({ ...save, created: "2026-10-06T10:00:00.000Z" }), null);

        // (Nothing kept for a game that isn't saved, or for nowhere)
        assert.equal(savePlace({ seed: 1 }, { x: 1, y: 2, facing: 0 }), false);
        assert.equal(savePlace(save, null), false);
        assert.deepEqual(loadPlace(save), { x: 3190.25, y: 4892.75, facing: 1.5 });
    });

    it("keeps where a saved game's character has pinned on the world map, and that they've taken it away; not for another", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-10-03T10:00:00.000Z" };

        assert.equal(loadPin(save), null);
        assert.equal(savePin(save, [3190.5, 4892.5]), true);
        assert.deepEqual(loadPin(save), [3190.5, 4892.5]);
        assert.equal(loadPin({ ...save, seed: 13 }), null);
        assert.equal(savePin(save, null), true);
        assert.equal(loadPin(save), null);
        assert.equal(savePin({ seed: 1 }, [1, 2]), false);

        // (Anything else kept there isn't a pin)
        globalThis.localStorage.setItem("pellagos.abcd1234.pin", JSON.stringify({ ...save, pin: ["a", 2] }));
        assert.equal(loadPin(save), null);
    });

    it("keeps the last messages a saved game's character was told, the last ten; not for another, nor what isn't one", () => {
        useStorage();

        const save = { id: "abcd1234", seed: 12, created: "2026-10-03T10:00:00.000Z" };
        const told = Array.from({ length: 12 }, (_, k) => ({ text: `Message ${k}`, at: 1000 + k, times: 1 }));

        assert.deepEqual(loadMessages(save), []);
        assert.equal(saveMessages(save, told.slice(0, 3)), true);
        assert.deepEqual(loadMessages(save), told.slice(0, 3));
        assert.deepEqual(loadMessages({ ...save, seed: 13 }), []);
        assert.equal(saveMessages({ seed: 1 }, told), false);

        // (Kept more than ten, only the last ten; anything else kept there let go)
        globalThis.localStorage.setItem("pellagos.abcd1234.messages", JSON.stringify({ ...save, messages: [{ text: 3, at: 1, times: 1 }, ...told, { text: "Bad", at: "now", times: 1 }] }));
        assert.deepEqual(loadMessages(save), told.slice(-MESSAGES_KEPT));
    });

    it("keeps the last ten messages told the player across the screen, not refusals, the same again counted (journal.js)", () => {
        let log = [];

        for (let k = 0; k < 12; k++) {
            log = keepMessage(log, `News ${k}`, 3, k * 1000);
        }

        assert.equal(log.length, MESSAGES_KEPT);
        assert.deepEqual(log[0], { text: "News 2", at: 2000, times: 1 });
        assert.deepEqual(log.at(-1), { text: "News 11", at: 11000, times: 1 });

        // (Refusals and the like, shown less than KEPT_FROM; one shown till the next; and none at all: not kept)
        assert.equal(keepMessage(log, "Can't do that.", KEPT_FROM - 0.4, 12000), log);
        assert.equal(keepMessage(log, "The picture was lost. Waiting for it to come back…", 0, 12000), log);
        assert.equal(keepMessage(log, "", 3, 12000), log);

        // (The same again: counted, its time moved on)
        const again = keepMessage(log, "News 11", 4, 15000);

        assert.equal(again.length, MESSAGES_KEPT);
        assert.deepEqual(again.at(-1), { text: "News 11", at: 15000, times: 2 });
        assert.deepEqual(again.slice(0, -1), log.slice(0, -1));

        assert.equal(ago(0, 30_000), "just now");
        assert.equal(ago(0, 5 * 60_000), "5 min ago");
        assert.equal(ago(0, 2 * 3_600_000 + 1), "2 h ago");
        assert.equal(ago(0, 24 * 3_600_000), "1 day ago");
        assert.equal(ago(0, 3 * 24 * 3_600_000), "3 days ago");
    });

    it("still plays when the browser won't store anything", () => {
        useStorage({ refuse: true });

        assert.equal(writeSave({ hero: defaultHero(), seed: 1 }), false);
        assert.equal(loadSave(WEAPONS), null);
        assert.deepEqual(saveSettings({ debug: true }), { ...SETTINGS_DEFAULTS, debug: true });
    });

    it("makes seeds for new worlds", () => {
        const random = createRandom(5);
        const seeds = Array.from({ length: 50 }, () => newSeed(random.next));

        assert.ok(seeds.every((seed) => Number.isInteger(seed) && seed > 0));
        assert.ok(new Set(seeds).size > 45);
    });
});

describe("heroes (heroes.js)", () => {
    it("starts a new character from the human preset, unnamed, with a sword", () => {
        const hero = defaultHero();

        assert.equal(hero.name, "");
        assert.equal(hero.weapon, "sword");
        assert.deepEqual(Object.keys(hero.shape.macro).sort(), Object.keys(MACRO_DEFAULTS).sort());
    });

    it("makes random characters that are all playable, keeping name and weapon", () => {
        const random = createRandom(11);

        for (let k = 0; k < 40; k++) {
            const hero = randomHero({ ...defaultHero(), name: "Kept", weapon: "wand" }, random.next);
            const { macro, details } = hero.shape;

            assert.equal(hero.name, "Kept");
            assert.equal(hero.weapon, "wand");

            for (const key of ["gender", "muscle", "weight", "height", "bust"]) {
                assert.ok(macro[key] >= 0 && macro[key] <= 1, key);
            }

            assert.ok(Math.abs(macro.african + macro.asian + macro.caucasian - 1) < 1e-9);
            assert.ok(Object.values(details).every((value) => value >= -1 && value <= 1));
            assert.ok(Object.values(HUMAN_TONES).includes(hero.look.skin.tone));
            assert.ok(HAIRSTYLES[hero.look.hair.style] && BEARDS[hero.look.hair.beard]);

            // Beards only on male bodies
            if (macro.gender < 0.5) {
                assert.equal(hero.look.hair.beard, "none");
            }
        }
    });

    it("suggests names to suit the body, and keeps names tidy", () => {
        const random = createRandom(3);
        const woman = { ...defaultHero(), shape: { macro: { ...MACRO_DEFAULTS, gender: 0 }, details: {} } };

        assert.notEqual(suggestName(woman, "", random.next), suggestName(woman, "", random.next) + "x");
        assert.ok(suggestName(woman, "Wren", random.next) !== "Wren");
        assert.equal(cleanName("  Tamsin   Rowe "), "Tamsin Rowe");
        assert.equal(cleanName("<b>Æthel</b>red 3"), "bÆthelbred");
        assert.equal(cleanName("O'Brien-Smith"), "O'Brien-Smith");
        assert.equal(cleanName("x".repeat(40)).length, 20);
        assert.equal(cleanName("   "), "");
    });

    it("makes a hero one of any people (docs/WAR.md M11): looking as one of them, their parts on, their colours; random as one of them", () => {
        const random = createRandom(12);
        const woman = { ...defaultHero(), name: "Kept", weapon: "bow", shape: { ...defaultHero().shape, macro: { ...defaultHero().shape.macro, gender: 0 } } };

        assert.deepEqual(HERO_PEOPLES.map(({ id }) => id), ["human", "elf", "darkElf", "cat", "lizard", "orc"]);

        for (const { id } of HERO_PEOPLES.slice(1)) {
            const hero = heroOfPeople(woman, id, random.next);

            assert.equal(hero.race, id);
            assert.equal(hero.name, "Kept");
            assert.equal(hero.weapon, "bow");
            assert.equal(hero.shape.macro.gender, 0, `${id}: still a woman`);
            assert.deepEqual(hero.parts, { cat: ["catEars", "catTail"], lizard: ["lizardTail"], orc: ["tusks"] }[id] ?? [], id);
            assert.ok(Object.values(tonesOf(id)).map((tone) => tone.toLowerCase()).includes(hero.look.skin.tone.toLowerCase()), `${id}: ${hero.look.skin.tone}`);

            // (Random: another of the same people)
            const again = randomHero(hero, random.next);

            assert.equal(again.race, id);
            assert.deepEqual(again.parts, hero.parts);
        }

        // Back to a human: none of the others' parts
        const human = heroOfPeople(heroOfPeople(woman, "cat", random.next), "human", random.next);

        assert.equal(human.race, "human");
        assert.deepEqual(human.parts, []);
        assert.deepEqual(tonesOf("human"), HUMAN_TONES);
        assert.equal(Object.keys(tonesOf("lizard")).length, LOOKS.lizard.tones.length);
        assert.equal(Object.keys(tonesOf("cat")).length, LOOKS.cat.furs.length);
    });
});

describe("a hero's kit (game.js, creator.js)", () => {
    it("wears leather boots, or spiked boots with any weapon or on their own; a shield with a sword, a spellward with a wand", () => {
        // (Under their gear, a tunic and trousers; on it, what a new character starts with: leather
        // bracers, breeches and boots, spiked if they chose them; with a sword a round shield, with
        // a wand a spellward)
        assert.deepEqual(heroEquipment("sword"), ["tunic", "trousers", "sword", "bracers", "breeches", "boots", "roundShield"]);
        assert.deepEqual(heroEquipment("wand"), ["tunic", "trousers", "wand", "bracers", "breeches", "boots", "spellward"]);
        assert.ok(!heroEquipment("grimoire").includes("spellward"), "(a grimoire, held open in both hands: none)");
        assert.deepEqual(heroEquipment("bow", new Progress({}, { weapon: "bow", boots: true }).worn()), ["tunic", "trousers", "bow", "quiver", "bracers", "breeches", "spikedBoots"]);
        assert.deepEqual(heroEquipment("boots"), ["tunic", "trousers", "spikedBoots", "bracers", "breeches"]);
        assert.deepEqual(heroEquipment("sword", [{ id: "helm", people: "elf" }, { id: "hauberk", people: "elf" }, { id: "ring" }], ["catEars"]), ["tunic", "trousers", "sword", "helm.elf", "mail.elf", "surcoat.elf", "catEars"]);
        assert.equal(guardOf("boots"), "kick");
        assert.equal(guardOf("gauntlets"), "punch");
    });

    it("says what a weapon does, and with spiked boots too, how kicks mix in", () => {
        assert.equal(weaponNumbers("sword"), "4–8 damage up close · 0.9 a second");
        assert.equal(weaponNumbers("sword", true), "3.5–7.5 damage up close (kicks or the weapon)");
        assert.equal(weaponNumbers("bow", true), "3–7 damage up close (kicks) · 1.0 a second; 5–10 damage 13.5 m · 0.7 a second");
        assert.equal(weaponNumbers("boots"), "3–7 damage up close · 1.0 a second");
    });
});

describe("the minimap (minimap.js)", () => {
    const world = generateWorld({ seed: 4 });
    const colours = mapColours(world);
    const colourAt = (x, y) => [...colours.subarray((y * world.width + x) * 4, (y * world.width + x) * 4 + 3)];
    const greenest = ([r, g, b]) => g > r && g > b;

    it("colours every square: the ground, roofs over buildings, trees in the fields", () => {
        assert.equal(colours.length, world.width * world.height * 4);
        assert.ok(colours.every((value, k) => k % 4 !== 3 || value === 255), "solid");

        // Grass is green, roads the colour of earth, the market square grey
        const find = (kind) => {
            for (let y = 0; y < world.height; y++) {
                for (let x = 0; x < world.width; x++) {
                    if (world.ground[y][x] === kind && !world.blocked[y][x]) {
                        return [x, y];
                    }
                }
            }

            return null;
        };
        const [road, cobbles, grass] = [find(GROUND.road), find(GROUND.cobbles), find(GROUND.grass)];

        assert.ok(greenest(colourAt(...grass)));
        assert.ok(colourAt(...road)[0] > colourAt(...road)[2] + 40, "roads are brown");
        assert.ok(Math.abs(colourAt(...cobbles)[0] - colourAt(...cobbles)[2]) < 30, "cobbles are grey");

        // Every building's squares have a roof: not the ground's colour, and not green
        const buildings = buildingsOf(world);

        assert.ok(buildings.length >= 10);

        for (const { corners, ridge } of buildings) {
            // (Its middle: halfway along its ridge)
            const [x, y] = [Math.floor((ridge[0][0] + ridge[1][0]) / 2), Math.floor((ridge[0][1] + ridge[1][1]) / 2)];

            assert.equal(corners.length, 4);
            assert.ok(!greenest(colourAt(x, y)));
            assert.ok(world.blocked[y][x], "buildings block their squares");
        }

        // Trees, where their trunks stand, are dark green
        const trees = treesOf(world);

        assert.equal(trees.length, world.trees.length + world.town.pieces.filter(({ key }) => key.startsWith("tree-")).length);

        for (const { x, y } of world.trees.slice(0, 20)) {
            const [r, g, b] = colourAt(x, y);

            assert.ok(greenest([r, g, b]) && r + g + b < 200, `a tree at ${x}, ${y}`);
        }
    });

    it("finds the buildings and trees of a town set in the world where it's set", () => {
        const placed = buildWorld({ seed: 4 });
        const [dx, dy] = placed.stamp.at;
        const shift = (things) => things.map((thing) => ({ ...thing, x: thing.x + dx, y: thing.y + dy }));
        const moved = ([x, y]) => [x + dx, y + dy];

        assert.deepEqual(
            buildingsOf(placed).map(({ corners }) => corners),
            buildingsOf(placed.home).map(({ corners }) => corners.map(moved)),
        );
        assert.deepEqual(treesOf(placed), shift(treesOf(placed.home)));
    });

    it("colours the floors inside the tavern: the floor, and walls, stairs and furniture on it", () => {
        for (const map of [world.maps.taproom, world.maps.upstairs]) {
            const inside = interiorColours(map);
            const at = ([x, y]) => [...inside.subarray((y * map.width + x) * 4, (y * map.width + x) * 4 + 3)];
            const floor = at(map.marks["."][0]);
            const differs = (a, b) => a.some((value, k) => Math.abs(value - b[k]) > 20);

            assert.equal(inside.length, map.width * map.height * 4);

            for (const piece of map.pieces.filter(({ x, y }) => map.blocked[y][x])) {
                assert.ok(differs(at([piece.x, piece.y]), floor), `${map.id}'s ${piece.kind} stands out from the floor`);
            }
        }
    });

    describe("out in the world", () => {
        // Canvases that keep what's drawn on them, in order: every call and setting (a canvas drawn
        // from, by what was drawn on it; an image's pixels as they are)
        function recording(width = 0, height = 0) {
            const calls = [];
            const what = (value) => (value?.calls ? { canvas: [value.width, value.height, value.calls] } : value instanceof ImageData ? { pixels: [...value.data] } : value);
            const canvas = { width, height, calls, style: {}, hidden: false, clientWidth: 160, clientHeight: 160, addEventListener: () => {}, removeEventListener: () => {} };
            const context = new Proxy(
                {},
                {
                    get: (target, key) => (...args) => calls.push([key, ...args.map(what)]),
                    set: (target, key, value) => calls.push([`${key}=`, value]) > 0,
                },
            );

            canvas.getContext = () => context;

            return canvas;
        }

        class ImageData {
            constructor(data, width, height) {
                Object.assign(this, { data, width, height });
            }
        }

        const world = buildWorld({ seed: 2 });
        const [x, z] = world.spawns.player;

        before(() => {
            globalThis.ImageData = ImageData;
            globalThis.OffscreenCanvas = class {
                constructor(width, height) {
                    return recording(width, height);
                }
            };
        });

        after(() => {
            delete globalThis.ImageData;
            delete globalThis.OffscreenCanvas;
        });

        it("paints a patch round the player the same a step at a time as at once", () => {
            const steps = paintingPatch(world, x - 96, z - 96, 192);
            let count = 0;
            let step = steps.next();

            while (!step.done) {
                count++;
                step = steps.next();
            }

            assert.ok(count > 10, `${count} steps`);
            assert.deepEqual(step.value.calls, paintPatch(world, x - 96, z - 96, 192, step.value.town).calls);
        });

        it("paints the next patch a step at a time while the player's still well inside this one, ahead of them, and shows it before its edge would show", () => {
            const minimap = new Minimap(recording(), world);
            const first = (minimap.draw({ player: { x, z, facing: 0 } }), minimap.patch);
            const patches = [first];
            let steps = 0;

            // (Walking east, a metre a drawing)
            for (let k = 1; k <= 120; k++) {
                const [x0, , across] = [x + k - 64, z - 64, 128];
                const shown = minimap.patch;

                minimap.draw({ player: { x: x + k, z, facing: 0 } });
                steps += minimap.painting ? 1 : 0;

                if (minimap.patch !== shown) {
                    // (Shown while what's shown was still inside the last one: not painted at once)
                    assert.ok(x0 + across <= shown.x + 192, `at ${k} m`);
                    patches.push(minimap.patch);
                }
            }

            assert.ok(patches.length >= 3, `${patches.length} patches`);
            assert.ok(patches.every((patch, k) => !k || patch.x > patches[k - 1].x + 16), "each ahead of the last");
            assert.ok(steps > patches.length, `${steps} drawings painting`);
        });
    });
});

describe("the action wheel (wheel.js, icons.js)", () => {
    it("tells which of eight slices a finger is in, like a compass: none near the middle, then N, NE, E, SE, S, SW, W or NW", () => {
        assert.deepEqual(DIRECTIONS, ["n", "ne", "e", "se", "s", "sw", "w", "nw"]);
        assert.equal(directionOf(0, 0), null);
        assert.equal(directionOf(10, -12, 30), null, "still in the middle");
        assert.equal(directionOf(0, -40), "n");
        assert.equal(directionOf(30, -30), "ne");
        assert.equal(directionOf(40, 5), "e");
        assert.equal(directionOf(28, 32), "se");
        assert.equal(directionOf(-3, 50), "s");
        assert.equal(directionOf(-30, 30), "sw");
        assert.equal(directionOf(-60, -10), "w");
        assert.equal(directionOf(-35, -30), "nw");

        // Slices are an eighth each, cut halfway between (22.5 degrees either side)
        assert.equal(directionOf(Math.sin(0.38) * 50, -Math.cos(0.38) * 50), "n");
        assert.equal(directionOf(Math.sin(0.41) * 50, -Math.cos(0.41) * 50), "ne");
    });

    it("turns over at S: the other seven slices hold what the player puts there", () => {
        assert.equal(FLIP, "s");
        assert.deepEqual(PLACES, ["n", "ne", "e", "se", "sw", "w", "nw"]);
    });

    it("draws each slice as a ring's sector", () => {
        const path = sectorPath(30, 96, -Math.PI * 0.75, -Math.PI * 0.25);

        assert.match(path, /^M-?[\d.]+,-?[\d.]+A96,96 0 0 1 -?[\d.]+,-?[\d.]+L-?[\d.]+,-?[\d.]+A30,30 0 0 0 -?[\d.]+,-?[\d.]+Z$/);
        assert.ok(path.startsWith("M-67.88,-67.88"), path);
    });

    it("starts with Vigor at the top of the player's own wheel (Make camp on its other side, with a wave, a bow, a nod and a cheer), Attack at the top of an enemy's with the elements' first spells and Stun round it, and Fight on a soldier's of a people not friendly to theirs, each with an icon", () => {
        const enemy = { n: "attack", ne: "hurt", nw: "rumble", e: "blister", w: "stun", se: "burn" };
        const self = [{ n: "vigor" }, { n: "camp", nw: "emote:wave", ne: "emote:bow", w: "emote:nod", e: "emote:cheer" }];

        assert.deepEqual(WHEELS, { self, enemy: [enemy, {}], provoke: [{ n: "fight" }], unit: [{ n: "unit:assist", e: "unit:follow", w: "unit:wait", sw: "unit:dismiss" }] });
        assert.deepEqual(readWheels(null), { self, enemy: [enemy, {}], quick: ["vigor", "stun", "burn", "item:potion"], version: 2 });
        assert.deepEqual(actionOf("attack"), { label: "Attack", order: "engage", on: "enemy" }, "walking up to an enemy and fighting them");

        for (const [id, action] of Object.entries(ACTIONS)) {
            assert.ok(SPELLS[action.spell] || ABILITIES[action.ability] || ["engage", "camp"].includes(action.order) || EMOTES[action.emote] || ["assist", "follow", "wait", "dismiss"].includes(action.unit), id);
            assert.equal(typeof action.label, "string");
            assert.ok(["self", "any", "friend", "enemy", "provoke", "unit"].includes(action.on), id);
            assert.match(ICONS[id], /<(path|circle|ellipse)/, `${id} has an icon`);
        }

        // (Crossed swords, to pick a fight)
        assert.equal(ICONS.fight.match(/rotate\(/g).length, 2);

        // Green for healing; gold stars for a stun
        assert.match(ICONS.heal, /url\(#icon-heal-cross\)/);
        assert.match(ICONS.stun, /url\(#icon-stun-star\)/);
        assert.equal(SPELLS.vigor.target, "any", "healing: on anyone");
        assert.equal(SPELLS.burn.target, "enemy");
        assert.equal(SPELLS.stun.target, "enemy");

        // (What one of the party's told, on the wheel held on them: never set by the player, nor a quick action)
        assert.deepEqual(actionOf("unit:assist"), { label: "Attack my target", unit: "assist", on: "unit" });
        assert.ok(!assignable("self", {}).some((key) => key.startsWith("unit:")) && !assignable("quick", {}).some((key) => key.startsWith("unit:")));
        assert.deepEqual(readWheels({ quick: ["unit:wait", null, null, null] }).quick, [null, null, null, null]);

        // (Every emote on the player's own wheel, by its name)
        for (const [name, { label }] of Object.entries(EMOTES)) {
            assert.deepEqual(actionOf(`emote:${name}`), { label, emote: name, on: "self" });
            assert.equal(iconOf(`emote:${name}`), ICONS[`emote:${name}`]);
        }
    });

    it("says how far the world map's pin is: in metres, and past a kilometre in kilometres to a tenth", () => {
        assert.equal(distanceLabel(0), "0 m");
        assert.equal(distanceLabel(640.4), "640 m");
        assert.equal(distanceLabel(1000), "1000 m");
        assert.equal(distanceLabel(1000.4), "1.0 km");
        assert.equal(distanceLabel(1260), "1.3 km");
        assert.equal(distanceLabel(12449), "12.4 km");
    });

    it("has an icon for everything that does someone good, as their plate shows it: each spell that lasts, and each boon bought by talking", () => {
        for (const [id, spell] of Object.entries(SPELLS).filter(([, spell]) => spell.lasts)) {
            assert.match(ICONS[id], /<(path|circle|ellipse)/, `${spell.label} has an icon`);
        }

        for (const { boon } of Object.values(BOUGHT).filter(({ boon }) => boon)) {
            assert.match(ICONS[boon.id], /<(path|circle|ellipse)/, `${boon.label} has an icon`);
        }

        // (And a courtesan's afterglow: host.js COMPANY)
        assert.match(ICONS.afterglow, /<(path|circle|ellipse)/);
    });

    it("gives everything that can be carried an icon, and puts things to use on the player's own wheel by a short name", () => {
        for (const id of Object.keys(ITEMS)) {
            assert.match(ITEM_ICONS[id], /<(path|circle|ellipse|rect)/, `${id} has an icon`);
        }

        assert.deepEqual(actionOf("item:potion"), { label: "Draught", item: "potion", on: "self" });
        assert.equal(actionOf("item:ale").label, "Ale");
        assert.equal(actionOf("item:sword"), null, "gear isn't used from a wheel");
        assert.equal(actionOf("item:nonsense"), null);
        assert.equal(iconOf("item:meal"), ITEM_ICONS.meal);
        assert.equal(iconOf("vigor"), ICONS.vigor);
        assert.equal(iconOf("heal"), ICONS.vigor, "a spell by the name it had before");
    });

    it("offers each wheel what goes on it: the spells known (healing on either), the blows learnt, and the things to use carried", () => {
        const starting = ["vigor", "burn", "rumble", "hurt", "blister", "stun"];

        const emotes = Object.keys(EMOTES).map((name) => `emote:${name}`);

        assert.deepEqual(assignable("self"), ["camp", ...emotes], "nothing not known, but making camp and the emotes");
        assert.deepEqual(assignable("self", { learnt: starting }), ["vigor", "camp", ...emotes]);
        assert.deepEqual(assignable("enemy", { learnt: starting }), ["vigor", "burn", "rumble", "hurt", "blister", "stun", "attack"]);
        assert.deepEqual(assignable("self", { learnt: [...starting, "mendWounds", "powerStrike"], carries: ["potion", "sword", "potion", "ale"] }), ["vigor", "mendWounds", "camp", ...emotes, "item:potion", "item:ale"]);
        assert.deepEqual(assignable("enemy", { learnt: ["mendWounds", "fireball", "hold", "powerStrike", "aimedShot"], carries: ["potion"] }), ["mendWounds", "fireball", "hold", "powerStrike", "aimedShot", "attack"]);
    });

    it("reads the wheels as kept, keeping only what goes on each wheel, in its seven slices, on two sides", () => {
        const kept = { self: [{ n: "heal", ne: "item:potion", s: "heal", e: "stun", w: "nonsense" }, { nw: "greaterHeal" }, { n: "heal" }], enemy: "nonsense" };

        // (Heal and Greater heal, as kept before they were renamed: Vigor and Mend Wounds now)
        assert.deepEqual(readWheels(kept), { self: [{ n: "vigor", ne: "item:potion" }, { nw: "mendWounds" }], enemy: [{ n: "attack", ne: "hurt", nw: "rumble", e: "blister", w: "stun", se: "burn" }, {}], quick: [...QUICK], version: 2 });
        assert.deepEqual(readWheels({ self: [], enemy: [{}, {}], quick: [], version: 2 }), { self: [{}, {}], enemy: [{}, {}], quick: [null, null, null, null], version: 2 });
    });

    it("puts Attack at the top of an enemy's wheel kept from before it was, what was there moved to the first empty slice; once: taken off after, it stays off", () => {
        // (The enemy's wheel as it started then: Burn at the top, moved round to SE)
        const before = { self: [{ n: "vigor" }, {}], enemy: [{ n: "burn", ne: "hurt", nw: "rumble", e: "blister", w: "stun" }, {}], quick: [...QUICK] };

        assert.deepEqual(readWheels(before).enemy, [{ n: "attack", ne: "hurt", nw: "rumble", e: "blister", w: "stun", se: "burn" }, {}]);

        // (Its first side full: onto the other; on it already, left where it is; nothing at the top: just put there)
        const full = { n: "burn", ne: "hurt", e: "blister", se: "stun", sw: "vigor", w: "rumble", nw: "fireball" };

        assert.deepEqual(readWheels({ enemy: [full, { n: "hold" }] }).enemy, [{ ...full, n: "attack" }, { n: "hold", ne: "burn" }]);
        assert.deepEqual(readWheels({ enemy: [{ n: "stun" }, { e: "attack" }] }).enemy, [{ n: "stun" }, { e: "attack" }]);
        assert.deepEqual(readWheels({ enemy: [{}, {}] }).enemy, [{ n: "attack" }, {}]);

        // (Kept since, without it: as kept)
        assert.deepEqual(readWheels({ enemy: [{ n: "stun" }, {}], version: 2 }).enemy, [{ n: "stun" }, {}]);
    });

    it("starts the quick actions with Vigor, Stun, Burn and a draught; reads them as kept, four, each something either wheel can hold", () => {
        assert.deepEqual(QUICK, ["vigor", "stun", "burn", "item:potion"]);

        // (Heal as kept before it was renamed, Vigor now; a fight to pick, gear, nonsense and a
        // fifth left out)
        const kept = { self: [], enemy: [], quick: ["heal", "fight", "item:sword", "powerStrike", "item:ale"] };

        assert.deepEqual(readWheels(kept).quick, ["vigor", null, null, "powerStrike"]);
        assert.deepEqual(readWheels({ quick: "nonsense" }).quick, [...QUICK], "kept wrongly: as they start");
        assert.deepEqual(readWheels({ quick: [null, "item:potion"] }).quick, [null, "item:potion", null, null]);
    });

    it("uses a quick action on the foe if it's an attack, a hex or a blow, and anything else (healing, a ward, a thing to use) on the player", () => {
        for (const key of ["burn", "stun", "hurt", "fireball", "hold", "powerStrike", "aimedShot"]) {
            assert.equal(offensive(key), true, key);
        }

        for (const key of ["vigor", "mendWounds", "item:potion", "item:ale", null, "nonsense"]) {
            assert.equal(offensive(key), false, String(key));
        }

        for (const [id, action] of Object.entries(ACTIONS)) {
            assert.equal(offensive(id), action.on === "enemy", id);
        }
    });

    it("offers the quick actions anything either wheel can hold, once each", () => {
        const learnt = ["vigor", "stun", "burn", "mendWounds", "powerStrike"];
        const emotes = Object.keys(EMOTES).map((name) => `emote:${name}`);

        assert.deepEqual(assignable("quick", { learnt, carries: ["potion", "sword", "potion"] }), ["vigor", "mendWounds", "camp", ...emotes, "item:potion", "burn", "stun", "powerStrike", "attack"]);
        assert.deepEqual(assignable("quick"), ["camp", ...emotes, "attack"]);
    });

    it("draws a side: its slices, what's in each with a count for things to use, and S to turn it over", () => {
        const svg = drawWheel({ slots: { n: "heal", ne: "item:potion" }, side: 0, flip: true, counts: { potion: 3 } });

        assert.equal((svg.match(/class="slice/g) ?? []).length, 8);
        assert.match(svg, /class="slice flip" data-direction="s"/);
        assert.match(svg, />Wheel 2</);
        assert.match(svg, /class="count"[^>]*>3</);
        assert.equal((svg.match(/class="slice empty"/g) ?? []).length, 5);
        assert.match(drawWheel({ slots: {}, side: 1, flip: true }), />Wheel 1</);
        assert.doesNotMatch(drawWheel({ slots: { n: "fight" } }), /flip/);
    });
});

describe("the bars over the others (hud.js)", () => {
    it("puts a message where it goes as a rule if that's clear of those fighting, else the first place that is, staying where it is while that's clear; if none is, over the least of them", () => {
        // (A message 300 by 50 on a screen 1000 wide: its places 28% down, under the buttons, over
        // the quick actions, and at the left and right a little up from half way)
        const places = [
            { x: 500, top: 170 },
            { x: 500, top: 70 },
            { x: 500, top: 420 },
            { x: 160, top: 245 },
            { x: 840, top: 245 },
        ];
        const size = { width: 300, height: 50 };
        const foe = { left: 470, top: 150, right: 530, bottom: 300 };
        const player = { left: 470, top: 300, right: 530, bottom: 480 };

        assert.equal(messagePlace(places, [], size), 0, "no one fighting: where it goes as a rule");
        assert.equal(messagePlace(places, [{ left: 100, top: 150, right: 160, bottom: 300 }], size), 0, "off to the side, clear of it");
        assert.equal(messagePlace(places, [foe], size), 1, "over the foe: up under the buttons");
        assert.equal(messagePlace(places, [foe, { left: 450, top: 40, right: 520, bottom: 140 }], size), 2, "and someone there too: down over the quick actions");
        assert.equal(messagePlace(places, [{ left: 470, top: 40, right: 530, bottom: 300 }, player], size), 3, "the foe and the player one over the other down the middle: off to the left");
        assert.equal(messagePlace(places, [], size, 2), 2, "where it is while that's clear, not back and forth");
        assert.equal(messagePlace(places, [{ left: 450, top: 400, right: 520, bottom: 480 }], size, 2), 0, "and not once it isn't");

        // (Everywhere covered: over the least of them)
        const crowd = [
            { left: 300, top: 40, right: 700, bottom: 480 },
            { left: 0, top: 240, right: 320, bottom: 300 },
            { left: 820, top: 240, right: 1000, bottom: 300 },
        ];

        assert.equal(messagePlace(places, crowd, size), 4);
    });

    it("fits the party's icons down the left side: full size while they fit, shrunk to fit, then as many as fit at their least with a \"+N\" chip for the rest", () => {
        const { most, least, gap } = PARTY_ICON;

        assert.deepEqual({ ...PARTY_ICON }, { most: 44, least: 30, gap: 6, margin: 16 });
        assert.deepEqual(partyFit(0, 300), { size: most, shown: 0, more: 0 }, "no one");
        assert.deepEqual(partyFit(3, 300), { size: most, shown: 3, more: 0 }, "room to spare: full size");

        // (Five in 200 pixels: (200 - 4 gaps) / 5 = 35 each)
        assert.deepEqual(partyFit(5, 200), { size: 35, shown: 5, more: 0 }, "shrunk to fit");
        assert.ok(5 * 35 + 4 * gap <= 200);

        // (Eight in 200: too many even at 30; 5 fit at 30 with their gaps, so 4 and the chip)
        assert.deepEqual(partyFit(8, 200), { size: least, shown: 4, more: 4 }, "the rest on a chip");
        assert.ok(5 * least + 4 * gap <= 200 && 6 * least + 5 * gap > 200);
        assert.deepEqual(partyFit(3, 10), { size: least, shown: 0, more: 3 }, "no room: all on the chip");
    });

    it("says what each of the party is in the party menu: a hired adventurer by calling, a creature called or raised by name with its time left", () => {
        assert.equal(timeLeft(245000), "4:05");
        assert.equal(timeLeft(400), "0:01", "(rounded up: not 0:00 while it's there)");
        assert.equal(timeLeft(-5), "0:00");
        assert.equal(memberKind({ kind: "adventurer", calling: "warrior" }), "Hired warrior");
        assert.equal(memberKind({ kind: "summon", creature: "wolf", left: 61000 }), "Called wolf · 1:01 left");
        assert.equal(memberKind({ kind: "risen", creature: "orc", left: 5000 }), "Risen orc · 0:05 left");
        assert.equal(memberKind({ kind: "unit" }), "With you");
    });

    it("turns the compass (the minimap folded away) for its N to point north as the camera sees it, clockwise from 0 to a full turn", () => {
        const near = (a, b) => Math.abs(a - b) < 1e-9;
        const facing = (x, z) => Math.atan2(x, z);

        assert.ok(near(compassTurn(facing(0, -1)), 0), "looking north: N up");
        assert.ok(near(compassTurn(facing(1, 0)), Math.PI * 1.5), "looking east: N on the left");
        assert.ok(near(compassTurn(facing(0, 1)), Math.PI), "looking south: N down");
        assert.ok(near(compassTurn(facing(-1, 0)), Math.PI / 2), "looking west: N on the right");

        for (let look = -7; look < 7; look += 0.37) {
            const turn = compassTurn(look);

            assert.ok(turn >= 0 && turn < Math.PI * 2, `${look} → ${turn}`);
        }
    });

    it("counts the party chat's unseen lines as a badge does (none, 1 to 9, then 9+), and has its quick phrases each short enough for a tap", () => {
        assert.deepEqual([0, 1, 9, 10, 250].map(unreadLabel), ["", "1", "9", "9+", "9+"]);
        assert.equal(QUICK_PHRASES.length, 8);
        assert.equal(new Set(QUICK_PHRASES).size, QUICK_PHRASES.length);
        assert.ok(QUICK_PHRASES.every((phrase) => phrase.length <= 14), "(a chip each, a few on a row)");
    });

    it("draws a bar full size near the player's character, then smaller and fainter evenly with the distance, gone at the edge of sight", () => {
        const near = (a, b) => Math.abs(a - b) < 1e-9;

        assert.deepEqual({ ...PLATE_SIZE }, { near: 12, far: 60 });

        // (By day: full size within 12 m, gone at 60 m, evenly between)
        assert.equal(plateScale(0), 1);
        assert.equal(plateScale(6), 1);
        assert.equal(plateScale(12), 1, "full size to `near`");
        assert.ok(near(plateScale(36), 0.5), "half way to the edge of sight: half the size");
        assert.ok(near(plateScale(24), 0.75));
        assert.ok(near(plateScale(48), 0.25));
        assert.ok(near(plateScale(13) - plateScale(14), plateScale(50) - plateScale(51)), "evenly with the distance");
        assert.ok([14, 20, 30, 40, 50, 59].every((d, k, all) => !k || plateScale(d) < plateScale(all[k - 1])), "each farther one smaller");
        assert.equal(plateScale(60), 0, "gone at the edge of sight");
        assert.equal(plateScale(200), 0);

        // (In the dark, seeing half as far: gone at 30 m, still full size within 12 m)
        assert.equal(plateScale(12, 0.5), 1);
        assert.ok(near(plateScale(21, 0.5), 0.5));
        assert.equal(plateScale(30, 0.5), 0);
        assert.ok(plateScale(30, 0.5) < plateScale(30), "smaller in the dark than by day as far off");

        // (So dark the edge of sight is nearer than `near`: full size up to it, then gone)
        assert.equal(plateScale(9, 0.15), 1);
        assert.equal(plateScale(9.5, 0.15), 0);
    });
});

describe("the loader (loader.js)", () => {
    // A network that sends each file in chunks (as a stream), whatever the query (as GitHub Pages
    // does), noting what was asked for
    const asked = [];

    function network(files) {
        return async (url) => {
            const bytes = files[new URL(url).pathname.slice(1)];

            asked.push(url);

            if (!bytes) {
                return new Response("missing", { status: 404 });
            }

            const stream = new ReadableStream({
                start(controller) {
                    for (let at = 0; at < bytes.length; at += 1000) {
                        controller.enqueue(bytes.subarray(at, at + 1000));
                    }

                    controller.close();
                },
            });

            return new Response(stream, { status: 200 });
        };
    }

    const manifest = [
        { id: "code", label: "Game code", detail: "", files: [["js/a.js", 2500], ["js/b.js", 1200]] },
        { id: "body", label: "Body", detail: "", files: [["characters/human.bin", 4000, "0123456789"]] },
    ];
    const files = { "js/a.js": new Uint8Array(2500), "js/b.js": new Uint8Array(1200), "characters/human.bin": new Uint8Array(4000).fill(7) };

    it("counts every byte as it arrives, group by group, to the manifest's total", async () => {
        const saved = globalThis.fetch;

        asked.length = 0;

        globalThis.fetch = network(files);

        try {
            const loader = new Loader(manifest, { base: "https://example.org/" });
            const seen = [];

            await loader.load(({ loaded }) => seen.push(loaded));

            assert.equal(loader.total, 7700);
            assert.equal(loader.loaded, 7700);
            assert.ok(seen.length > 7, "heard about each chunk");
            assert.ok(seen.every((loaded, k) => k === 0 || loaded >= seen[k - 1]), "never goes backwards");
            assert.deepEqual(loader.groups.map(({ loaded, done }) => [loaded, done]), [[3700, 2], [4000, 1]]);

            // Data is fetched by its hash; code by its name
            assert.deepEqual(asked.toSorted(), ["https://example.org/characters/human.bin?h=0123456789", "https://example.org/js/a.js", "https://example.org/js/b.js"]);

            // Data is kept to be handed out by its name; code isn't (the page imports it)
            const body = await (await loader.loadFile("https://example.org/characters/human.bin")).arrayBuffer();

            assert.equal(body.byteLength, 4000);
            assert.equal(new Uint8Array(body)[0], 7);
            assert.equal(loader.files.has("https://example.org/js/a.js"), false);
            assert.match(loader.urlOf("https://example.org/characters/human.bin"), /^blob:/);
            assert.equal(loader.urlOf("https://example.org/other.png"), "https://example.org/other.png");
        } finally {
            globalThis.fetch = saved;
        }
    });

    it("says which file it couldn't download", async () => {
        const saved = globalThis.fetch;

        globalThis.fetch = network({});

        try {
            await assert.rejects(new Loader(manifest, { base: "https://example.org/" }).load(), /js\/a\.js \(404\)/);
        } finally {
            globalThis.fetch = saved;
        }
    });

    it("writes sizes for people", () => {
        assert.equal(formatBytes(512), "512 B");
        assert.equal(formatBytes(840 * 1024), "840 KB");
        assert.equal(formatBytes(1.45 * 1024 * 1024), "1.4 MB");
    });
});
