// A body's garments, drawn one by one, drawn all at once a while after (client/js/characters/
// character.js `merging`: another player's, a few seconds after they change what they wear,
// app/game.js #outfitting): the same mesh and picture as one dressed all at once from the first;
// one by one till the step that puts them together; its garments' own materials let go of then,
// lace and drapes drawn as they were; and a change of dress meanwhile starting over, nothing kept
// counted for what was begun
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { readHumanFiles } from "../scripts/lib/human-data.js";

// (Some pictures, the eyes', are put on a canvas: enough of one for that in Node)
globalThis.ImageData ??= class {
    constructor(data, width, height) {
        Object.assign(this, { data, width, height });
    }
};

globalThis.document ??= {
    createElement: () => {
        const canvas = { width: 0, height: 0, style: {}, _data: null };
        const context = {
            putImageData: (image) => (canvas._data = image.data),
            getImageData: (x, y, w, h) => ({ data: canvas._data ?? new Uint8ClampedArray(w * h * 4), width: w, height: h }),
            createImageData: (w, h) => new globalThis.ImageData(new Uint8ClampedArray(w * h * 4), w, h),
            createLinearGradient: () => ({ addColorStop() {} }),
            createRadialGradient: () => ({ addColorStop() {} }),
            measureText: () => ({ width: 10 }),
        };

        canvas.getContext = () => new Proxy(context, { get: (target, key) => (key in target ? target[key] : () => {}) });

        return canvas;
    },
};

const { HumanData } = await import("../client/js/characters/body.js");
const { Character } = await import("../client/js/characters/character.js");
const { GARMENTS } = await import("../client/js/characters/garments.js");
const { SkinAtlas } = await import("../client/js/characters/skin.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { allAtOnce } = await import("../client/js/core/steps.js");
const { Wounds } = await import("../client/js/world/wounds.js");

// (The game's body; skins small, where it's the garments that are looked at)
const humanFiles = readHumanFiles();
const human = new HumanData(humanFiles.manifest, humanFiles.data);
const atlas = new SkinAtlas(human, {}, 64);
const kitOf = () => ({ human, atlas });
const soldier = soldierLook({ people: "human", weapon: "sword", seed: 3 });
const orc = soldierLook({ people: "orc", weapon: "axe", seed: 2 });
const options = (look, more = {}) => ({ shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.1, merge: false, ...more });

// A mesh's shape, hashed: its corners, how they're bound, and its triangles in full
function shapeOf(mesh) {
    const hash = createHash("sha1");
    const full = mesh.userData.detail?.[0].count ?? mesh.geometry.index.count;

    for (const name of ["position", "normal", "uv", "skinIndex", "skinWeight"]) {
        const { array } = mesh.geometry.attributes[name];

        hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    }

    hash.update(Uint32Array.from(mesh.geometry.index.array.subarray(0, full)));

    return hash.digest("hex");
}

const outfitOf = (character) => character.garments.find((mesh) => mesh.userData.merged) ?? null;
const drawing = (kit, id) => kit.wardrobe?.garments.get(id)?.users ?? 0;
const wearing = (kit, character) => kit.composites?.get(character.composite)?.users ?? 0;

// Every step of a body's garments being put together taken, but the last: how many it took
function allButLast(steps) {
    let count = 0;
    let step = steps.next();

    while (!step.done) {
        count++;
        step = steps.next();
    }

    return { count, value: step.value };
}

describe("a body's garments, drawn one by one, drawn all at once after (Character.merging)", () => {
    it("draws the same mesh with the same picture as one dressed all at once", () => {
        const kit = kitOf();
        const apart = new Character(kit, options(soldier));
        const names = apart.garments.map(({ name }) => name);

        assert.ok(names.length >= 8, `${names.length} garments drawn one by one`);
        assert.equal(outfitOf(apart), null);
        assert.equal(apart.composite, null);

        for (const id of names) {
            assert.equal(drawing(kit, id), 1, id);
        }

        const { count, value } = allButLast(apart.merging());

        assert.equal(value, true);
        assert.ok(count > 10, `${count} steps`);
        assert.equal(apart.merge, true);
        assert.equal(apart.garments.length, 1);
        assert.deepEqual(outfitOf(apart).userData.merged, names);
        assert.equal(wearing(kit, apart), 1);

        // (Its garments' own materials no longer drawn with: the kit lets go of them in its time)
        for (const id of names) {
            assert.equal(drawing(kit, id), 0, id);
        }

        assert.deepEqual(apart.drawn, []);

        // (Only the one mesh of them on the body)
        assert.deepEqual(apart.object.children.filter((child) => names.includes(child.name)), []);
        assert.equal(apart.object.children.filter((child) => child.name === "garments").length, 1);

        // (As one dressed all at once from the first, in the same kit: the same shape, and the
        // very same material)
        const whole = new Character(kit, options(soldier, { merge: true }));

        assert.equal(shapeOf(outfitOf(apart)), shapeOf(outfitOf(whole)));
        assert.equal(outfitOf(apart).material, outfitOf(whole).material);
        assert.equal(wearing(kit, apart), 2);

        // (And what it carries, what's hidden under its clothes and its hair are as they were)
        assert.deepEqual(apart.items.map(({ name }) => name), whole.items.map(({ name }) => name));
        assert.deepEqual(apart.hidden, whole.hidden);
        assert.equal(apart.hairHidden, whole.hairHidden);

        apart.dispose();
        whole.dispose();
        assert.equal(kit.composites.get(names.join(" ")).users, 0);
    });

    it("is drawn one by one till the one step that puts them together", () => {
        const kit = kitOf();
        const body = new Character(kit, options(soldier));
        const meshes = [...body.garments];
        const steps = body.merging();
        let step = steps.next();
        let before = 0;

        while (!step.done) {
            // (As it was, every step of the way: the same meshes, each with its own material)
            assert.deepEqual(body.garments, meshes);
            assert.ok(meshes.every((mesh) => mesh.parent === body.object));
            assert.equal(body.composite, null);
            before++;
            step = steps.next();
        }

        assert.ok(before > 10);
        assert.equal(step.value, true);
        assert.ok(meshes.every((mesh) => mesh.parent === null));
        assert.equal(body.garments.length, 1);
    });

    it("finds the outfit's picture made, someone else in it: put together in a step", () => {
        const kit = kitOf();
        const guard = new Character(kit, options(soldier, { merge: true }));
        const body = new Character(kit, options(soldier));
        const { count, value } = allButLast(body.merging());

        assert.equal(value, true);
        assert.equal(count, 0);
        assert.equal(outfitOf(body).material, outfitOf(guard).material);
        assert.equal(wearing(kit, body), 2);
    });

    it("starts over when it's dressed again meanwhile, nothing kept counted for what was begun", () => {
        const kit = kitOf();
        const body = new Character(kit, options(soldier));
        const first = body.garments.map(({ name }) => name);
        const begun = body.merging();

        for (let k = 0; k < 6; k++) {
            assert.equal(begun.next().done, false);
        }

        // (Dressed again, one by one: shown at once)
        body.setEquipment(orc.equipment, { merge: false });

        const second = body.garments.map(({ name }) => name);

        assert.equal(body.merge, false);
        assert.equal(outfitOf(body), null);
        assert.notDeepEqual(second, first);

        // (What was begun, taken to its end by whoever still had it: it stops, changing nothing)
        assert.equal(allAtOnce(begun), false);
        assert.equal(body.composite, null);
        assert.equal(outfitOf(body), null);
        assert.deepEqual(body.garments.map(({ name }) => name), second);

        for (const id of new Set([...first, ...second])) {
            assert.equal(drawing(kit, id), second.includes(id) ? 1 : 0, id);
        }

        for (const outfit of kit.composites?.values() ?? []) {
            assert.equal(outfit.users, 0, outfit.key);
        }

        // (Begun again for what it wears now)
        assert.equal(allAtOnce(body.merging()), true);
        assert.deepEqual(outfitOf(body).userData.merged, second);
        assert.equal(wearing(kit, body), 1);
        assert.equal([...kit.composites.values()].filter(({ users }) => users > 0).length, 1);

        // (And dressed again, all at once this time: the outfit before let go of)
        const was = body.composite;

        body.setEquipment(soldier.equipment);
        assert.equal(body.merge, true);
        assert.equal(kit.composites.get(was)?.users ?? 0, 0);
        assert.equal(wearing(kit, body), 1);

        body.dispose();

        for (const outfit of kit.composites.values()) {
            assert.equal(outfit.users, 0, outfit.key);
        }

        for (const [id, use] of kit.wardrobe.garments) {
            assert.equal(use.users, 0, id);
        }
    });

    it("given up on (its steps closed), leaves nothing half made in the kit; but what someone else is still making goes on", () => {
        const kit = kitOf();
        const body = new Character(kit, options(soldier));
        const ids = body.garments.map(({ name }) => name);
        const making = () => [...(kit.making?.keys() ?? [])];
        const begun = body.merging();

        // (Well into the outfit's picture: being made for the kit)
        for (let k = 0; k < 15; k++) {
            assert.equal(begun.next().done, false);
        }

        assert.deepEqual(making(), [`outfit ${ids.join(" ")}`]);
        // (Given up on, as the game does when what it wears changes: app/game.js #forgetOutfit)
        begun.return();
        assert.deepEqual(making(), []);
        assert.equal(kit.composites.has(ids.join(" ")), false);
        assert.equal(body.composite, null);
        assert.equal(body.garments.length, ids.length);

        // (Begun afresh after, it's made and worn as ever)
        assert.equal(allAtOnce(body.merging()), true);
        assert.equal(wearing(kit, body), 1);

        // (Two putting the same outfit together, turn and turn about: one gives up, the other
        // carries on with what they'd made between them, and it's made once)
        const [one, other] = [new Character(kit, options(orc)), new Character(kit, options(orc))];
        const [first, second] = [one.merging(), other.merging()];

        for (let k = 0; k < 8; k++) {
            assert.equal(first.next().done, false);
            assert.equal(second.next().done, false);
        }

        assert.equal(making().length, 1);
        first.return();
        assert.equal(making().length, 1);
        assert.equal(allAtOnce(second), true);
        assert.deepEqual(making(), []);
        assert.equal(wearing(kit, other), 1);
        assert.equal(outfitOf(one), null);
        assert.equal(allAtOnce(one.merging()), true);
        assert.equal(outfitOf(one).material, outfitOf(other).material);
        assert.equal(wearing(kit, one), 2);
    });

    it("stops if the body's let go of meanwhile", () => {
        const kit = kitOf();
        const body = new Character(kit, options(soldier));
        const begun = body.merging();

        begun.next();
        body.dispose();
        assert.equal(allAtOnce(begun), false);
        assert.equal(body.composite, null);

        for (const outfit of kit.composites?.values() ?? []) {
            assert.equal(outfit.users, 0, outfit.key);
        }
    });

    it("leaves lace and what hangs drawn as they were", () => {
        const kit = kitOf();
        const equipment = [...soldier.equipment, "laceBraBlack", "apron"];
        const body = new Character(kit, options({ ...soldier, equipment }));
        const lace = body.garments.find(({ name }) => name === "laceBraBlack");
        const apron = body.garments.find(({ name }) => name === "apron");

        assert.ok(GARMENTS.laceBraBlack.design);
        assert.ok(lace && apron?.userData.drape);
        assert.equal(lace.userData.joins, false);

        const materials = [lace.material, apron.material];

        assert.equal(allAtOnce(body.merging()), true);

        // (The one mesh first, then the lace and the apron, as one dressed all at once has them)
        assert.deepEqual(body.garments.map(({ name }) => name), ["garments", "laceBraBlack", "apron"]);
        assert.ok(!outfitOf(body).userData.merged.includes("laceBraBlack"));
        assert.deepEqual([lace.material, apron.material], materials);
        assert.equal(lace.parent, body.object);
        assert.equal(apron.parent, body.object);
        // (The lace's material still drawn with, the others' not)
        assert.equal(drawing(kit, "laceBraBlack"), 1);
        assert.deepEqual(body.drawn, ["laceBraBlack"]);

        const whole = new Character(kit, options({ ...soldier, equipment }, { merge: true }));

        assert.deepEqual(whole.garments.map(({ name }) => name), ["garments", "laceBraBlack", "apron"]);
        assert.equal(shapeOf(outfitOf(body)), shapeOf(outfitOf(whole)));
    });

    it("puts together each garment's triangles in full, not its lower levels' after them", () => {
        const kit = kitOf();
        const body = new Character(kit, options(soldier));
        const whole = new Character(kit, options(soldier, { merge: true }));

        // (Drawn a while: each mesh has its lower levels' triangles after its own, #lowerGarment)
        for (const mesh of body.garments) {
            const full = mesh.geometry.index.array;
            const all = new full.constructor(full.length + 30);

            all.set(full);
            mesh.geometry.setIndex([...all]);
            mesh.userData.detail = [{ start: 0, count: full.length }, { start: full.length, count: 30 }];
        }

        assert.equal(allAtOnce(body.merging()), true);
        assert.equal(outfitOf(body).geometry.index.count, outfitOf(whole).geometry.index.count);
        assert.equal(shapeOf(outfitOf(body)), shapeOf(outfitOf(whole)));
    });

    it("keeps its wounds: its one mesh drawn with a copy of the outfit's material that shows them, its own, as each garment's was", () => {
        const kit = kitOf();
        const body = new Character(kit, options(soldier));
        const guard = new Character(kit, options(soldier, { merge: true }));
        const wounds = new Wounds(body, { seed: 3 });

        wounds.hit({ reaction: "slash", from: 0, hp: 20, maxHp: 50, before: 45 });
        wounds.update(0);

        // (One by one: each garment drawn with a copy of its material that shows the damage)
        const before = body.garments.map(({ material }) => material);

        assert.ok(before.every((material) => /^wounded-/.test(material.customProgramCacheKey())));
        assert.equal(allAtOnce(body.merging()), true);
        // (Put together: the outfit's own material for the step it's made in, the kit's, as
        // the guard's; then, as the wounds are next looked at, a copy of it that shows them)
        assert.equal(outfitOf(body).material, outfitOf(guard).material);
        wounds.update(0);
        assert.notEqual(outfitOf(body).material, outfitOf(guard).material);
        assert.match(outfitOf(body).material.customProgramCacheKey(), /^wounded-mixed/);
        assert.equal(outfitOf(body).material.map, outfitOf(guard).material.map);
        // (The guard beside it, in the same outfit, unhurt)
        assert.doesNotMatch(outfitOf(guard).material.customProgramCacheKey(), /^wounded-/);
        wounds.dispose();
    });

    it("has nothing to put together with one garment, or with them drawn all at once already", () => {
        const kit = kitOf();
        const bare = new Character(kit, options({ ...soldier, equipment: ["trousers.human"] }));

        assert.equal(allAtOnce(bare.merging()), false);
        assert.deepEqual(bare.garments.map(({ name }) => name), ["trousers.human"]);
        assert.equal(bare.merge, true);

        const whole = new Character(kit, options(soldier, { merge: true }));
        const mesh = outfitOf(whole);

        assert.equal(allAtOnce(whole.merging()), true);
        assert.equal(outfitOf(whole), mesh);
        assert.equal(wearing(kit, whole), 1);
    });

    it("draws one by one again when it's told to, its outfit let go of", () => {
        const kit = kitOf();
        const body = new Character(kit, options(soldier, { merge: true }));
        const key = body.composite;

        body.setEquipment(soldier.equipment, { merge: false });
        assert.equal(body.merge, false);
        assert.equal(outfitOf(body), null);
        assert.equal(kit.composites.get(key).users, 0);
        assert.ok(body.garments.length >= 8);
        assert.ok(body.garments.every((mesh) => mesh.userData.joins === true));
    });
});
