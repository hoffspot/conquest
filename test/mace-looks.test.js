// A mace's looks: one rolled on each as it's made (core/gear.js GEAR mace `looks`), kept with it
// (core/progress.js thingOf) and sent with what's held (Progress wielded), held as one of the CC0
// maces' models (characters/liveries.js HELD_LOOKS, characters/equipment.js, characters/items.js
// HELD_MODELS) and said on its card (app/gearinfo.js).

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";
import { ASSETS } from "../client/js/app/assets.js";
import { heroEquipment } from "../client/js/app/game.js";
import { describe as describeGear } from "../client/js/app/gearinfo.js";
import { EQUIPMENT } from "../client/js/characters/equipment.js";
import { buildItem, HELD_MODELS } from "../client/js/characters/items.js";
import { HELD_LOOKS } from "../client/js/characters/liveries.js";
import { GEAR, gearLook, rollGear, sameGear } from "../client/js/core/gear.js";
import { Progress, thingOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { makeUnique } from "../client/js/core/rare.js";

const LOOKS = GEAR.mace.looks;

describe("a mace's looks", () => {
    it("rolls one of its five looks on each mace, each about as often as the others; none on a sword no one in particular made (core/gear.js DESIGNS: test/gear-designs.test.js), nor on the Prior's Vespers, which looks as its own", () => {
        const counts = Object.fromEntries(LOOKS.map((look) => [look, 0]));

        assert.equal(LOOKS.length, 5);

        for (let seed = 1; seed <= 1000; seed++) {
            const random = createRandom(seed);
            const mace = rollGear("mace", seed % 3 ? "common" : "rare", random, { level: 1 + (seed % 60) });

            assert.ok(LOOKS.includes(mace.look), `seed ${seed}: ${mace.look}`);
            counts[mace.look] += 1;
        }

        for (const [look, count] of Object.entries(counts)) {
            assert.ok(count > 140 && count < 260, `${look}: ${count} in 1000`);
        }

        assert.equal(rollGear("sword", "common", createRandom(3)).look, undefined);
        assert.equal(makeUnique("vespers", 40, createRandom(5)).look, undefined);
    });

    it("rolls a mace's bonuses as before its looks: the look's the last thing rolled", () => {
        const { look, ...made } = rollGear("mace", "masterwork", createRandom(42), { level: 30 });
        const sword = rollGear("sword", "masterwork", createRandom(42), { level: 30 });

        assert.ok(LOOKS.includes(look));
        assert.deepEqual(made.level, sword.level);
        assert.deepEqual(Object.keys(made.bonuses ?? {}).length, Object.keys(sword.bonuses ?? {}).length);
    });

    it("keeps a mace's look in the pack and in a save, sends it with what's held, stacks only maces that look alike, and draws one found before maces had looks as the first", () => {
        const studded = { ...rollGear("mace", "common", createRandom(7)), look: "studded" };
        const star = { ...studded, look: "star" };

        assert.equal(thingOf(studded).look, "studded");
        assert.equal(thingOf({ ...studded, look: "spoon" }).look, undefined);
        assert.equal(thingOf({ id: "sword", look: "studded" }).look, undefined);
        assert.ok(sameGear(studded, { ...studded }));
        assert.ok(!sameGear(studded, star));

        const progress = new Progress(new Progress({ pack: [studded] }).toJSON());

        assert.equal(progress.pack.find(Boolean).look, "studded");

        progress.gear.mainHand = progress.pack.find(Boolean);
        assert.deepEqual(progress.wielded(), { id: "mace", look: "studded" });
        assert.equal(gearLook({ id: "mace" }), LOOKS[0]);
        assert.equal(gearLook({ id: "sword" }), "own");
        assert.equal(gearLook({ id: "potion" }), null);
    });

    it("holds each look as its CC0 mace's model, the mace made here for one without; the Prior's Vespers as his own", () => {
        for (const look of LOOKS) {
            const id = HELD_LOOKS.mace[look];
            const equipment = heroEquipment("mace", [], [], { id: "mace", look });

            assert.ok(EQUIPMENT[id], `${look}: ${id}`);
            assert.ok(equipment.includes(id) && !equipment.includes("mace"), `${look}: ${equipment}`);
        }

        assert.ok(heroEquipment("mace", [], [], { id: "mace" }).includes(HELD_LOOKS.mace[LOOKS[0]]));
        assert.ok(heroEquipment("mace", [], [], { id: "mace", unique: "vespers" }).includes("vespers"));
        assert.ok(heroEquipment("mace", [], [], null).includes("mace"));
    });

    it("draws each look from a CC0 model in the catalog, held and hung as the mace made here is; with no page to read it from, the mace made here in its place", () => {
        for (const id of Object.values(HELD_LOOKS.mace)) {
            const { model, slot, sheath, hold } = EQUIPMENT[id];
            const name = model.slice("held:".length);
            const entry = ASSETS.models[HELD_MODELS[name]?.asset];

            assert.equal(slot, "mainHand");
            assert.deepEqual([sheath, hold], [EQUIPMENT.mace.sheath, EQUIPMENT.mace.hold], id);
            assert.ok(entry && !entry.licensed && /CC0/.test(entry.label), `${id}: ${HELD_MODELS[name]?.asset}`);
            assert.ok(existsSync(new URL(`../client/${entry.files[0].path}`, import.meta.url)), entry.files[0].path);

            let meshes = 0;

            buildItem(model, { headRadius: 0.1 }).traverse((node) => {
                meshes += node.isMesh ? 1 : 0;
            });
            assert.ok(meshes > 0, `${id}: its stand-in`);
        }
    });

    it("says which look a mace has on its card, and nothing of looks on Vespers", () => {
        const card = describeGear({ ...rollGear("mace", "common", createRandom(9)), look: "morningStar" }, new Progress({}));
        const vespers = describeGear(makeUnique("vespers", 30, createRandom(9)), new Progress({}));

        assert.ok(card.lines.some(({ text }) => /^Looks like a morning star/.test(text)), JSON.stringify(card.lines));
        assert.ok(!vespers.lines.some(({ text }) => /^Looks like/.test(text)));
    });
});
