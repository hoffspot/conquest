// The game's page-side modules that need no screen: saving, heroes, the loader
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { cleanName, defaultHero, HERO_PEOPLES, heroOfPeople, HUMAN_TONES, randomHero, suggestName, tonesOf } from "../client/js/app/heroes.js";
import { LOOKS } from "../client/js/characters/peoples.js";
import { formatBytes, Loader } from "../client/js/app/loader.js";
import { ICONS, ITEM_ICONS } from "../client/js/app/icons.js";
import { PLATE_SIZE, plateScale } from "../client/js/app/hud.js";
import { buildingsOf, interiorColours, mapColours, Minimap, paintPatch, paintingPatch, treesOf } from "../client/js/app/minimap.js";
import { ACTIONS, actionOf, assignable, DIRECTIONS, directionOf, drawWheel, FLIP, iconOf, offensive, PLACES, QUICK, readWheels, sectorPath, WHEELS } from "../client/js/app/wheel.js";
import { SPELLS } from "../client/js/core/spells.js";
import { ABILITIES, ITEMS, Progress } from "../client/js/core/progress.js";
import { isHero, loadExplored, loadProgress, loadSave, loadSettings, loadStanding, loadTalks, loadWheels, loadWorld, newSeed, SAVE_VERSION, saveExplored, saveProgress, saveSettings, saveStanding, saveTalks, saveWheels, saveWorld, SETTINGS_DEFAULTS, writeSave, clearSave } from "../client/js/app/save.js";
import { Standing } from "../client/js/core/standing.js";
import { Explored } from "../client/js/core/explored.js";
import { BEARDS, HAIRSTYLES } from "../client/js/characters/hair.js";
import { MACRO_DEFAULTS } from "../client/js/characters/macro.js";
import { createRandom } from "../client/js/core/random.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { WEAPONS } from "../client/js/core/weapons.js";
import { guardOf, heroEquipment } from "../client/js/app/game.js";
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

        assert.equal(writeSave({ hero, seed: 99 }), true);

        const save = loadSave(WEAPONS);

        assert.equal(save.version, SAVE_VERSION);
        assert.equal(save.seed, 99);
        assert.deepEqual(save.hero, hero);

        clearSave();
        assert.equal(loadSave(WEAPONS), null);
    });

    it("sets aside saves it can't play: another version, a nameless hero, an unknown weapon", () => {
        const items = useStorage();
        const hero = { ...defaultHero(), name: "Wren" };

        for (const save of [{ version: 0, hero, seed: 1 }, { version: SAVE_VERSION, hero: { ...hero, name: "  " }, seed: 1 }, { version: SAVE_VERSION, hero: { ...hero, weapon: "rocket" }, seed: 1 }, { version: SAVE_VERSION, hero, seed: "x" }]) {
            items.set("pellagos.save", JSON.stringify(save));
            assert.equal(loadSave(WEAPONS), null);
        }

        items.set("pellagos.save", "{ not json");
        assert.equal(loadSave(WEAPONS), null);
        assert.equal(isHero(hero, WEAPONS), true);
    });

    it("remembers settings over their defaults", () => {
        useStorage();
        assert.deepEqual(loadSettings(), SETTINGS_DEFAULTS);
        assert.equal(SETTINGS_DEFAULTS.minimap, true, "the minimap starts on");
        assert.equal(SETTINGS_DEFAULTS.sound, true, "and so does the sound");

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

    it("keeps what a saved character's grown into: its schools, the spells it's learnt and how far they've grown; a save from before the elements' tomes knows every element's first spell", () => {
        const items = useStorage();
        const save = { seed: 12, created: "2026-10-02T10:00:00.000Z" };
        const progress = new Progress({ schools: { fire: 160, healing: 40 }, spells: ["burn", "dodge"], spellXp: { dodge: 30 }, gold: 75 });

        assert.equal(saveProgress(save, progress), true);

        const again = new Progress(loadProgress(save));

        assert.deepEqual([again.schools, again.spells, again.spellXp, again.gold], [progress.schools, progress.spells, progress.spellXp, 75]);
        assert.ok(again.knows("fireball") && again.opened("fire") && !again.opened("earth"));

        // (Kept before: no format, every element open as it was)
        const before = JSON.parse(items.get("pellagos.progress"));

        delete before.format;
        items.set("pellagos.progress", JSON.stringify({ ...before, spells: ["dodge"] }));

        const old = new Progress(loadProgress(save));

        assert.ok(["burn", "rumble", "hurt", "blister", "fireball", "dodge"].every((spell) => old.knows(spell)));

        // (Another game's: nothing)
        assert.deepEqual(loadProgress({ seed: 13, created: save.created }), {});
    });

    it("remembers what the folk remember of a saved character, and what it's learnt; not for another", () => {
        useStorage();

        const save = { seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const talks = { memory: { barkeep: { talks: 2, flags: ["askedPlace"] } }, knowledge: new Set(["orc"]) };

        assert.deepEqual(loadTalks(save), { memory: {}, knowledge: [] });
        assert.equal(saveTalks(save, talks), true);
        assert.deepEqual(loadTalks(save), { memory: { barkeep: { talks: 2, flags: ["askedPlace"] } }, knowledge: ["orc"] });

        // Another character (or world) starts afresh; a game not saved (?play) keeps nothing
        assert.deepEqual(loadTalks({ ...save, created: "2026-09-27T10:00:00.000Z" }), { memory: {}, knowledge: [] });
        assert.deepEqual(loadTalks({ ...save, seed: 13 }), { memory: {}, knowledge: [] });
        assert.equal(saveTalks({ seed: 1 }, talks), false);
    });

    it("remembers what a saved character has found of its world: the buildings gone into, the chunks set foot in; not for another", () => {
        useStorage();

        const save = { seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const explored = new Explored();

        explored.enter("home:tavern");
        explored.visit(5000, 6000);

        assert.deepEqual(new Explored(loadExplored(save)).entered, new Set());
        assert.equal(saveExplored(save, explored), true);

        const back = new Explored(loadExplored(save));

        assert.ok(back.hasEntered("home:tavern") && back.isVisited(Math.floor(5000 / 64), Math.floor(6000 / 64)));
        assert.equal(back.chunksVisited, 1);

        // Another character (or world) starts afresh; a game not saved (?play) keeps nothing
        assert.equal(new Explored(loadExplored({ ...save, created: "2026-09-27T10:00:00.000Z" })).chunksVisited, 0);
        assert.equal(new Explored(loadExplored({ ...save, seed: 13 })).entered.size, 0);
        assert.equal(saveExplored({ seed: 1 }, explored), false);
    });

    it("keeps the war in a saved game's world apart from its character, as it was (never yet and all); not for another", () => {
        useStorage();

        const save = { seed: 12, created: "2026-09-26T10:00:00.000Z" };
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

        const save = { seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const standing = new Standing({ points: 75, claimed: [], requests: [{ kind: "wild", key: "wild", target: { wild: true, need: 2 }, state: "open", count: 1 }], next: 2 });

        assert.deepEqual(loadStanding(save), {});
        assert.equal(saveStanding(save, standing), true);
        assert.deepEqual(new Standing(loadStanding(save)).toJSON(), standing.toJSON());
        assert.deepEqual(loadStanding({ ...save, seed: 13 }), {});
        assert.equal(saveStanding({ seed: 1 }, standing), false);
    });

    it("keeps what a saved game's character has put on their action wheels; not for another", () => {
        useStorage();

        const save = { seed: 12, created: "2026-09-26T10:00:00.000Z" };
        const wheels = { self: [{ n: "vigor", ne: "item:potion" }, { e: "item:ale" }], enemy: [{ n: "stun" }, { w: "hold" }], quick: ["stun", null, "item:ale", "vigor"] };

        assert.equal(loadWheels(save), null);
        assert.equal(saveWheels(save, wheels), true);
        assert.deepEqual(loadWheels(save), wheels);
        assert.deepEqual(readWheels(loadWheels(save)), wheels);
        assert.equal(loadWheels({ ...save, created: "2026-09-27T10:00:00.000Z" }), null);
        assert.equal(saveWheels({ seed: 1 }, wheels), false);
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
    it("wears leather boots, or spiked boots with any weapon or on their own", () => {
        // (Under their gear, a tunic and trousers; on it, what a new character starts with: leather
        // bracers, breeches and boots, spiked if they chose them)
        assert.deepEqual(heroEquipment("sword"), ["tunic", "trousers", "sword", "bracers", "breeches", "boots"]);
        assert.deepEqual(heroEquipment("bow", new Progress({}, { weapon: "bow", boots: true }).worn()), ["tunic", "trousers", "bow", "quiver", "bracers", "breeches", "spikedBoots"]);
        assert.deepEqual(heroEquipment("boots"), ["tunic", "trousers", "spikedBoots", "bracers", "breeches"]);
        assert.deepEqual(heroEquipment("sword", [{ id: "helm", people: "elf" }, { id: "hauberk", people: "elf" }, { id: "ring" }], ["catEars"]), ["tunic", "trousers", "sword", "helm.elf", "mail.elf", "surcoat.elf", "catEars"]);
        assert.equal(guardOf("boots"), "kick");
        assert.equal(guardOf("gauntlets"), "punch");
    });

    it("says what a weapon does, and with spiked boots too, how kicks mix in", () => {
        assert.equal(weaponNumbers("sword"), "4–8 damage up close · 0.9 a second");
        assert.equal(weaponNumbers("sword", true), "3.5–7.5 damage up close (kicks or the weapon)");
        assert.equal(weaponNumbers("bow", true), "3–7 damage up close (kicks) · 1.0 a second; 3–7 damage 9 m · 0.7 a second");
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

    it("starts with Vigor at the top of the player's own wheel, the elements' first spells and Stun on an enemy's, and Fight on a soldier's of a people not friendly to theirs, each with an icon", () => {
        const enemy = { n: "burn", ne: "hurt", nw: "rumble", e: "blister", w: "stun" };

        assert.deepEqual(WHEELS, { self: [{ n: "vigor" }, {}], enemy: [enemy, {}], provoke: [{ n: "fight" }] });
        assert.deepEqual(readWheels(null), { self: [{ n: "vigor" }, {}], enemy: [enemy, {}], quick: ["vigor", "stun", "burn", "item:potion"] });

        for (const [id, action] of Object.entries(ACTIONS)) {
            assert.ok(SPELLS[action.spell] || ABILITIES[action.ability] || action.order === "engage", id);
            assert.equal(typeof action.label, "string");
            assert.ok(["self", "any", "friend", "enemy", "provoke"].includes(action.on), id);
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

        assert.deepEqual(assignable("self"), [], "nothing not known");
        assert.deepEqual(assignable("self", { learnt: starting }), ["vigor"]);
        assert.deepEqual(assignable("enemy", { learnt: starting }), ["vigor", "burn", "rumble", "hurt", "blister", "stun"]);
        assert.deepEqual(assignable("self", { learnt: [...starting, "mendWounds", "powerStrike"], carries: ["potion", "sword", "potion", "ale"] }), ["vigor", "mendWounds", "item:potion", "item:ale"]);
        assert.deepEqual(assignable("enemy", { learnt: ["mendWounds", "fireball", "hold", "powerStrike", "aimedShot"], carries: ["potion"] }), ["mendWounds", "fireball", "hold", "powerStrike", "aimedShot"]);
    });

    it("reads the wheels as kept, keeping only what goes on each wheel, in its seven slices, on two sides", () => {
        const kept = { self: [{ n: "heal", ne: "item:potion", s: "heal", e: "stun", w: "nonsense" }, { nw: "greaterHeal" }, { n: "heal" }], enemy: "nonsense" };

        // (Heal and Greater heal, as kept before they were renamed: Vigor and Mend Wounds now)
        assert.deepEqual(readWheels(kept), { self: [{ n: "vigor", ne: "item:potion" }, { nw: "mendWounds" }], enemy: [{ n: "burn", ne: "hurt", nw: "rumble", e: "blister", w: "stun" }, {}], quick: [...QUICK] });
        assert.deepEqual(readWheels({ self: [], enemy: [{}, {}], quick: [] }), { self: [{}, {}], enemy: [{}, {}], quick: [null, null, null, null] });
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

        assert.deepEqual(assignable("quick", { learnt, carries: ["potion", "sword", "potion"] }), ["vigor", "mendWounds", "item:potion", "burn", "stun", "powerStrike"]);
        assert.deepEqual(assignable("quick"), []);
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
    it("shrinks a bar the farther its character is from the camera than the player, a little more gently than the distance, never past its least", () => {
        const near = (a, b) => Math.abs(a - b) < 1e-9;

        // (The player 11 m from the camera, as the follow camera stands)
        assert.equal(plateScale(6, 11), 1, "nearer than the player: full size");
        assert.equal(plateScale(11, 11), 1);
        assert.ok(near(plateScale(22, 11), 0.5 ** 0.75), "twice as far: three fifths the size");
        assert.ok(plateScale(22, 11) > 0.55 && plateScale(22, 11) < 0.62);
        assert.ok(near(plateScale(44, 11), 0.25 ** 0.75), "four times as far: a little over a third");
        assert.ok(plateScale(14, 11) > 0.8, "a step or two past the player: still easily read");
        assert.ok([16, 20, 24, 32, 40].every((d, k, all) => !k || plateScale(d, 11) < plateScale(all[k - 1], 11)), "each farther one smaller");
        assert.equal(plateScale(200, 11), PLATE_SIZE.least, "never too small to be seen");

        // (Zoomed right in, the camera a few metres off: as if it were `near`, so those beside
        // the player aren't shrunk)
        assert.equal(plateScale(PLATE_SIZE.near, 3), 1);
        assert.ok(near(plateScale(PLATE_SIZE.near * 2, 3), 0.5 ** 0.75));
        assert.ok(near(plateScale(10), (PLATE_SIZE.near / 10) ** 0.75), "no player: from `near`");
    });
});

describe("the loader (loader.js)", () => {
    // A network that sends each file in chunks (as a stream)
    function network(files) {
        return async (url) => {
            const bytes = files[new URL(url).pathname.slice(1)];

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
        { id: "body", label: "Body", detail: "", files: [["characters/human.bin", 4000]] },
    ];
    const files = { "js/a.js": new Uint8Array(2500), "js/b.js": new Uint8Array(1200), "characters/human.bin": new Uint8Array(4000).fill(7) };

    it("counts every byte as it arrives, group by group, to the manifest's total", async () => {
        const saved = globalThis.fetch;

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

            // Data is kept to be handed out; code isn't (the page imports it)
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
