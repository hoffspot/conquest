// The game's page-side modules that need no screen: saving, heroes, the loader
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanName, defaultHero, HUMAN_TONES, randomHero, suggestName } from "../client/js/app/heroes.js";
import { formatBytes, Loader } from "../client/js/app/loader.js";
import { buildingsOf, mapColours, treesOf } from "../client/js/app/minimap.js";
import { isHero, loadSave, loadSettings, newSeed, SAVE_VERSION, saveSettings, SETTINGS_DEFAULTS, writeSave, clearSave } from "../client/js/app/save.js";
import { BEARDS, HAIRSTYLES } from "../client/js/characters/hair.js";
import { MACRO_DEFAULTS } from "../client/js/characters/macro.js";
import { createRandom } from "../client/js/core/random.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";
import { WEAPONS } from "../client/js/core/weapons.js";
import { generateWorld } from "../client/js/core/world.js";

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

        for (const { x, y, w, h } of buildings) {
            const middle = colourAt(x + Math.floor(w / 2), y + Math.floor(h / 2));

            assert.ok(!greenest(middle));
            assert.ok(world.blocked[y + Math.floor(h / 2)][x + Math.floor(w / 2)], "buildings block their squares");
        }

        // Trees, where their trunks stand, are dark green
        const trees = treesOf(world);

        assert.equal(trees.length, world.trees.length + world.town.pieces.filter(({ key }) => key.startsWith("tree-")).length);

        for (const { x, y } of world.trees.slice(0, 20)) {
            const [r, g, b] = colourAt(x, y);

            assert.ok(greenest([r, g, b]) && r + g + b < 200, `a tree at ${x}, ${y}`);
        }
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
