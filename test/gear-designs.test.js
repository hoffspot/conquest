// The designs swords and kite and tower shields come in (core/gear.js DESIGNS): each a faction's,
// a people's, the sellswords' or the Order of the Bell's, one of its maker's rolled on each as it's
// made, found or bought where they are (the land's people's, a shop's keeper's, a fallen soldier's
// people's or band's), kept with it and sent with what's worn and held; each drawn as one of
// Dragon Motion's shields or swords (characters/liveries.js KIT_DESIGNS, characters/items.js
// HELD_MODELS), the game's own in its place till it's read, and said on its card.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const { ASSETS } = await import("../client/js/app/assets.js");
const { heroEquipment } = await import("../client/js/app/game.js");
const { describe: describeGear } = await import("../client/js/app/gearinfo.js");
const { isScrambled, unscramble } = await import("../client/js/app/scramble.js");
const { EQUIPMENT } = await import("../client/js/characters/equipment.js");
const { buildItem, HELD_MODELS } = await import("../client/js/characters/items.js");
const { designItem, dress, HELD_LOOKS, KIT_DESIGNS, kitModel, lookOf } = await import("../client/js/characters/liveries.js");
const { cachePiece, elitePrize, rollCache } = await import("../client/js/core/caches.js");
const { rollCoffer, rollHoard } = await import("../client/js/core/dungeons/play.js");
const { DESIGNS, GEAR, gearLook, makersOf, rollGear, UNIFORM_PEOPLES } = await import("../client/js/core/gear.js");
const { BANDS } = await import("../client/js/core/invasions.js");
const { Progress, rollLoot, thingOf } = await import("../client/js/core/progress.js");
const { createRandom } = await import("../client/js/core/random.js");
const { rollSpoils } = await import("../client/js/core/spoils.js");
const { madeOf } = await import("../client/js/core/stock.js");
const { LEFT_OUT, licensedModelsHere } = await import("../scripts/licensed-models.js");

const KINDS = ["sword", "kiteShield", "towerShield"];
const MAKERS = new Set([...UNIFORM_PEOPLES, ...Object.keys(BANDS), "bell"]);
const designsOf = (kind) => [...new Set(Object.values(DESIGNS[kind]).flat())];

// Rolls of a piece in seeds 1 to `count`, made by `maker`
const rolls = (kind, maker, count = 400) => Array.from({ length: count }, (each, k) => rollGear(kind, k % 3 ? "common" : "rare", createRandom(k + 1), { maker, level: 1 + (k % 50) }));

describe("the designs swords and shields come in (core/gear.js DESIGNS)", () => {
    it("are each a people's, the sellswords' or the Order of the Bell's, among its kind's looks after the game's own; and each of the pack's 25 shields and 2 swords is one, once", () => {
        for (const kind of KINDS) {
            assert.deepEqual(GEAR[kind].looks, ["own", ...designsOf(kind)], kind);

            for (const [maker, looks] of Object.entries(DESIGNS[kind])) {
                assert.ok(MAKERS.has(maker), `${kind}: ${maker}`);
                assert.ok(looks.length > 0, `${kind}: ${maker}`);
            }

            assert.deepEqual(new Set(Object.keys(KIT_DESIGNS[kind])), new Set(designsOf(kind)), kind);
        }

        const shields = [...Object.values(KIT_DESIGNS.kiteShield), ...Object.values(KIT_DESIGNS.towerShield)].sort((a, b) => a - b);

        assert.deepEqual(shields, Array.from({ length: 25 }, (each, k) => k + 1));
        assert.deepEqual(Object.values(KIT_DESIGNS.sword).sort(), [1, 2]);
        assert.deepEqual(Object.values(KIT_DESIGNS.towerShield).sort((a, b) => a - b), [16, 17, 18, 19, 20]);

        // (Each people with a kite shield of its own, and the humans' crowned and the lizard-folk's
        // dragons theirs)
        for (const people of UNIFORM_PEOPLES) {
            assert.ok(DESIGNS.kiteShield[people]?.length >= 2, people);
        }

        assert.deepEqual(makersOf("kiteShield", "crowned"), ["human"]);
        assert.deepEqual(makersOf("kiteShield", "dragonCrown"), ["lizard"]);
        assert.deepEqual(makersOf("sword", "knightly"), ["human", "bell"]);
        assert.deepEqual(makersOf("kiteShield", "own"), []);
    });

    it("rolls one of its maker's designs on each piece, each of them in its turn; none where its maker has none of their own, so it looks as the game makes it", () => {
        for (const kind of KINDS) {
            for (const [maker, looks] of Object.entries(DESIGNS[kind])) {
                const seen = new Set(rolls(kind, maker).map(({ look }) => look));

                assert.deepEqual(seen, new Set(looks), `${kind} of ${maker}'s make`);
            }

            for (const maker of [null, "bandits", "northmen", "corsairs", "cult"]) {
                assert.ok(rolls(kind, maker, 60).every(({ look }) => look === undefined), `${kind} of ${maker}'s make`);
            }
        }

        assert.ok(rolls("towerShield", "elf", 60).every(({ look }) => look === undefined));
        assert.ok(rolls("sword", "lizard", 60).every(({ look }) => look === undefined));
    });

    it("takes its maker from the people it's made by, unless said; rolls its design last, all else as it was; and none on a unique", () => {
        assert.ok(DESIGNS.kiteShield.orc.includes(rollGear("kiteShield", "common", createRandom(4), { people: "orc" }).look));
        assert.equal(rollGear("kiteShield", "common", createRandom(4), { people: "orc", maker: null }).look, undefined);

        for (let seed = 1; seed <= 40; seed++) {
            const { look, ...made } = rollGear("kiteShield", "masterwork", createRandom(seed), { maker: "human", level: 30 });
            const plain = rollGear("kiteShield", "masterwork", createRandom(seed), { maker: null, level: 30 });

            assert.ok(DESIGNS.kiteShield.human.includes(look));
            assert.deepEqual(made, plain, `seed ${seed}`);
        }

        assert.equal(rollGear("sword", "legendary", createRandom(2), { maker: "human", looked: false }).look, undefined);
    });

    it("makes what's found and bought in its maker's designs: a soldier's or a band's, an orc's, a shopkeeper's people's, a cache's, an elite's and a dungeon's land's, the Order's in their keep; a knight of the Bell's sword his Order's", () => {
        const found = (roll, kind) => {
            for (let seed = 1; seed <= 4000; seed++) {
                const piece = roll(createRandom(seed)).find?.(({ id }) => id === kind) ?? null;

                if (piece) {
                    return piece;
                }
            }

            return null;
        };
        const items = (bundle) => bundle.items;

        assert.equal(found((random) => items(rollLoot("orc", random)), "sword").look, "blackened");
        assert.equal(found((random) => items(rollLoot("raider", random, { maker: "sellswords" })), "sword").look, "blackened");
        assert.equal(found((random) => items(rollLoot("chest", random, { people: "human" })), "sword").look, "knightly");
        assert.equal(found((random) => items(rollLoot("chest", random, { people: "elf" })), "sword").look, undefined);
        assert.ok(DESIGNS.kiteShield.cat.includes(madeOf({ id: "kiteShield" }, createRandom(3), { maker: "cat" }).look));
        assert.equal(madeOf({ id: "kiteShield" }, createRandom(3)).look, undefined);
        assert.ok(DESIGNS.kiteShield.darkElf.includes(found((random) => [cachePiece("fine", random, { maker: "darkElf" })], "kiteShield").look));
        assert.ok(DESIGNS.kiteShield.lizard.includes(found((random) => [elitePrize(3, random, { maker: "lizard" })], "kiteShield").look));
        assert.ok(DESIGNS.towerShield.sellswords.includes(found((random) => items(rollCache(3, random, { maker: "sellswords" })), "towerShield").look));
        assert.ok(DESIGNS.kiteShield.bell.includes(found((random) => items(rollHoard(3, random, { maker: "bell" })), "kiteShield").look));
        assert.equal(found((random) => items(rollCoffer(3, random, { maker: null })), "kiteShield").look, undefined);
        assert.equal(found((random) => items(rollSpoils("bellBrother", 3, random)), "sword").look, "knightly");
        assert.equal(found((random) => items(rollSpoils("bandit", 3, random)), "sword").look, undefined);
    });

    it("keeps its design in the pack and a save, sends it with what's worn and held, and stacks only the same designs; one made before swords and shields had them looks as the game makes it", () => {
        const shield = { ...rollGear("kiteShield", "common", createRandom(7)), look: "redDragon" };
        const sword = { ...rollGear("sword", "common", createRandom(7)), look: "knightly" };

        assert.equal(thingOf(shield).look, "redDragon");
        assert.equal(thingOf({ ...shield, look: "heraldry" }).look, undefined);
        assert.equal(gearLook({ id: "kiteShield" }), "own");

        const progress = new Progress(new Progress({ pack: [shield, sword] }).toJSON());

        progress.gear.offHand = progress.pack.find((item) => item?.id === "kiteShield");
        progress.gear.mainHand = progress.pack.find((item) => item?.id === "sword");

        assert.deepEqual(progress.worn().find(({ id }) => id === "kiteShield"), { id: "kiteShield", look: "redDragon" });
        assert.deepEqual(progress.wielded(), { id: "sword", look: "knightly" });
    });

    it("dresses a hero in their shield's design and puts their sword's in their hand; one in the game's own make as it's made", () => {
        for (const kind of ["kiteShield", "towerShield"]) {
            for (const look of designsOf(kind)) {
                assert.deepEqual(lookOf({ id: kind, look }), [designItem(kind, look)]);
                assert.ok(dress([{ id: kind, look }]).includes(designItem(kind, look)));
            }

            assert.deepEqual(lookOf({ id: kind, look: "own" }), [kind]);
            assert.deepEqual(lookOf({ id: kind }), [kind]);
        }

        for (const look of designsOf("sword")) {
            const equipment = heroEquipment("sword", [], [], { id: "sword", look });

            assert.ok(equipment.includes(HELD_LOOKS.sword[look]) && !equipment.includes("sword"), `${look}: ${equipment}`);
        }

        assert.ok(heroEquipment("sword", [], [], { id: "sword" }).includes("sword"));
        assert.ok(heroEquipment("sword", [{ id: "kiteShield", look: "crowned" }], [], null).includes("kiteShieldCrowned"));
    });

    it("draws each design as its own file of the catalog's licensed entries, held, slung and put away as its kind is; the game's own in its place till it's read", () => {
        for (const kind of KINDS) {
            for (const look of designsOf(kind)) {
                const id = designItem(kind, look);
                const item = EQUIPMENT[id];
                const name = kitModel(kind, look);
                const held = HELD_MODELS[name];
                const entry = ASSETS.models[held?.asset];

                assert.ok(item, id);
                assert.equal(item.model, `held:${name}`);

                for (const key of ["slot", "socket", "hold", "grips", "sling", "sheath"]) {
                    assert.deepEqual(item[key], EQUIPMENT[kind][key], `${id}: ${key}`);
                }

                assert.equal(held.stand, kind, id);
                assert.ok(entry?.licensed && /permission/.test(entry.label), `${id}: ${held?.asset}`);
                assert.ok(entry.files.some(({ path }) => path === `models/gear/${held.file}`), `${id}: ${held.file}`);

                let meshes = 0;

                buildItem(item.model, { headRadius: 0.1 }).traverse((node) => {
                    meshes += node.isMesh ? 1 : 0;
                });
                assert.ok(meshes > 0, `${id}: its stand-in`);
            }
        }

        assert.equal(EQUIPMENT.kiteShieldAzureCross.sling, true);
        assert.equal(EQUIPMENT.towerShieldHeraldry.sling, false);
        assert.equal(ASSETS.models["gear-medieval-shields"].files.length, 25);
        assert.equal(ASSETS.models["gear-medieval-swords"].files.length, 2);
    });

    it("has each design's file one mesh of one material, the pack's piece, textures no bigger than 512 pixels", { skip: licensedModelsHere() ? false : LEFT_OUT }, () => {
        for (const kind of KINDS) {
            for (const [look, number] of Object.entries(KIT_DESIGNS[kind])) {
                const { file } = HELD_MODELS[kitModel(kind, look)];
                const raw = new Uint8Array(readFileSync(new URL(`../client/models/gear/${file}`, import.meta.url)));
                const bytes = isScrambled(raw) ? unscramble(raw) : raw;
                const view = new DataView(bytes.buffer, bytes.byteOffset);
                const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
                const node = `SM_${kind === "sword" ? "Sword" : "Shield"}-${String(number).padStart(2, "0")}`;

                assert.equal(json.meshes.length, 1, file);
                assert.equal(json.materials.length, 1, file);
                assert.ok(json.nodes.some(({ name }) => name === node), `${file}: ${node}`);
                assert.match(json.asset.copyright ?? "", /Dragon Motion/, file);
            }
        }
    });

    it("says on its card what its design is and whose make, and nothing of looks for one in the game's own make", () => {
        for (const kind of KINDS) {
            for (const look of designsOf(kind)) {
                const card = describeGear({ ...rollGear(kind, "common", createRandom(9)), look }, new Progress({}));
                const line = card.lines.find(({ text }) => /^Looks like/.test(text))?.text ?? "";

                assert.match(line, /^Looks like .+, of .+ make$/, `${kind} ${look}: ${line}`);
                assert.ok(!/its kind/.test(line), `${kind} ${look}: ${line}`);
            }

            const own = describeGear(rollGear(kind, "common", createRandom(9)), new Progress({}));

            assert.ok(!own.lines.some(({ text }) => /^Looks like/.test(text)), kind);
        }

        const crowned = describeGear({ ...rollGear("kiteShield", "common", createRandom(9)), look: "crowned" }, new Progress({}));

        assert.ok(crowned.lines.some(({ text }) => text === "Looks like a gold crown, quartered blue and white, of the humans' make"), JSON.stringify(crowned.lines));
    });
});
