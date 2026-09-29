// Characters built a step at a time (client/js/characters: Character.building), so that someone new
// coming into view is spread over frames, not a stall: the same character as built all at once;
// each piece (the skin, the hair, each garment, the garments' pictures) the same step by step;
// the hair grown once; each garment's cut kept for everyone measured alike; a look of eye's
// picture shared; and the skin painted elsewhere (a worker: skins.js), waited for, the same
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";

// (Some pictures, the eyes', are put on a canvas: enough of one for that in Node, keeping what's
// put on it)
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
const { buildHair, growingHair } = await import("../client/js/characters/hair.js");
const { buildGarment, compositeGarments, compositingGarments, fittingGarment, GARMENTS, paintGarment, paintingGarment, texelMap } = await import("../client/js/characters/garments.js");
const { folkLook } = await import("../client/js/characters/folk.js");
const { paintingSkin, paintSkin, SkinAtlas } = await import("../client/js/characters/skin.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { allAtOnce, NOW, Steps, WAITING } = await import("../client/js/core/steps.js");
const { Skins } = await import("../client/js/characters/skins.js");

// The skin worker (skin-worker.js), run here: what's sent to it copied to it, and what it sends
// back kept till it's delivered
const scope = { sent: [], postMessage: (data) => scope.sent.push(data) };

globalThis.self = scope;
await import("../client/js/characters/skin-worker.js");

class Worker {
    constructor() {
        Worker.last = this;
    }

    postMessage(data) {
        scope.onmessage({ data: structuredClone(data) });
    }

    terminate() {}

    // (What it's painted by now, sent back)
    async deliver() {
        await new Promise((resolve) => setTimeout(resolve, 20));

        for (const data of scope.sent.splice(0)) {
            this.onmessage({ data });
        }
    }
}

const manifest = JSON.parse(readFileSync(new URL("../client/characters/human.json", import.meta.url), "utf8"));
const unpacked = gunzipSync(readFileSync(new URL("../client/characters/human.bin", import.meta.url)));
const human = new HumanData(manifest, unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength));
const atlas = new SkinAtlas(human, {}, 128);
const kitOf = () => ({ human, atlas });

// Everything a character's made of, hashed: each part's geometry and pictures (in any order)
function hashOf(character) {
    const parts = [];

    character.object.updateMatrixWorld(true);
    character.object.traverse((node) => {
        const hash = createHash("sha1").update(node.name ?? "");

        for (const attribute of Object.values(node.geometry?.attributes ?? {})) {
            hash.update(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
        }

        if (node.geometry?.index) {
            hash.update(new Uint8Array(node.geometry.index.array.buffer));
        }

        for (const material of [node.material].flat().filter(Boolean)) {
            for (const slot of ["map", "bumpMap"]) {
                const data = material[slot]?.image?._data ?? material[slot]?.image?.data;

                if (data) {
                    hash.update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
                }
            }
        }

        hash.update(node.matrixWorld.elements.map((v) => v.toFixed(5)).join());
        parts.push(hash.digest("hex"));
    });

    return parts.sort().join();
}

const soldier = soldierLook({ people: "human", weapon: "sword", seed: 3 });
const wench = folkLook({ role: "wench", sex: "f", seed: 5 });
const options = (look, merge = true) => ({ shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.2, merge });

describe("characters built a step at a time (Character.building)", () => {
    it("builds the same character a step at a time as all at once, soldiers, folk and heroes", () => {
        for (const [look, merge] of [[soldier, true], [wench, true], [soldier, false]]) {
            const kit = kitOf();
            const whole = new Character(kit, options(look, merge));
            const steps = Character.building(kitOf(), options(look, merge));
            let step = steps.next();
            let count = 1;

            while (!step.done) {
                step = steps.next();
                count++;
            }

            assert.ok(count > 25, `${count} steps`);
            assert.equal(hashOf(step.value), hashOf(whole));
        }
    });

    it("paints the skin, grows the hair, fits each garment and paints their pictures the same step by step as at once", () => {
        const count = (steps) => {
            let n = 0;
            let step = steps.next();

            while (!step.done) {
                n++;
                step = steps.next();
            }

            return [n, step.value];
        };
        const skin = { ...soldier.look.skin, scalp: 1.4 };
        const [skinSteps, painted] = count(paintingSkin(atlas, skin));
        const whole = paintSkin(atlas, skin);

        assert.ok(skinSteps >= 1);
        assert.deepEqual(painted.data, whole.data);
        assert.deepEqual(painted.bump, whole.bump);

        const character = new Character(kitOf(), options(wench));
        const [hairSteps, hair] = count(growingHair(character, "long", "none", { detail: 0.2 }));

        assert.ok(hairSteps > 1, `${hairSteps} steps of hair`);
        assert.deepEqual(hair.attributes.position.array, buildHair(character, "long", "none", { detail: 0.2 }).attributes.position.array);

        const measures = character.kit.referenceMeasures;
        const [bootSteps, boot] = count(fittingGarment(character, "boots", measures));

        assert.ok(bootSteps > 1);
        assert.deepEqual(boot.geometry.attributes.position.array, buildGarment(character, "boots", measures).geometry.attributes.position.array);

        const map = texelMap(human, 64);
        const [paintSteps, cloth] = count(paintingGarment(map, GARMENTS.chemise));

        assert.ok(paintSteps >= 1);
        assert.deepEqual(cloth.data, paintGarment(map, GARMENTS.chemise).data);

        const layers = [{ data: cloth.data, bump: cloth.bump, inside: new Float32Array(human.vertexCount).fill(1) }];

        assert.deepEqual(count(compositingGarments(map, layers))[1].data, compositeGarments(map, layers).data);
        assert.deepEqual(allAtOnce(compositingGarments(map, layers)).surface, compositeGarments(map, layers).surface);
    });

    it("grows the hair once: none grown again for what's carried, and under a helmet only what's below its rim", () => {
        const folk = new Character(kitOf(), options(wench));
        const helm = soldierLook({ people: "human", weapon: "sword", seed: 1 });
        const helmed = new Character(kitOf(), options(helm));
        const bare = new Character(kitOf(), options({ ...helm, equipment: helm.equipment.filter((id) => !id.startsWith("helm.")) }));

        assert.ok(helm.equipment.includes("helm.human"));
        assert.equal(folk.hairHidden, false, "a tankard hides no hair");
        assert.equal(helmed.hairHidden, true);
        assert.ok(helmed.hairMesh === null || helmed.hairMesh.geometry.attributes.position.count < bare.hairMesh.geometry.attributes.position.count, "only what's below the rim");
    });

    it("keeps each garment's cut for everyone measured alike: fitted again the same, its covers each its own", () => {
        const character = new Character(kitOf(), options(soldier));
        const measures = character.kit.referenceMeasures;
        const [first, again] = [buildGarment(character, "mail.human", measures), buildGarment(character, "mail.human", measures)];

        assert.deepEqual(again.geometry.attributes.position.array, first.geometry.attributes.position.array);
        assert.deepEqual([...again.covers], [...first.covers]);
        assert.ok(first.covers instanceof Set && first.covers !== again.covers);
    });

    it("tells a step waiting on work done elsewhere to do it now, if the steps can't wait; comes back to it later, if they can", () => {
        const told = [];
        const waiting = function* () {
            yield;
            told.push(yield WAITING);
            told.push(yield WAITING);

            return "made";
        };

        assert.equal(allAtOnce(waiting()), "made");
        assert.deepEqual(told.splice(0), [NOW, NOW]);

        const steps = new Steps(waiting());

        assert.equal(steps.take(Infinity, { wait: true }), false);
        assert.ok(steps.waiting);
        assert.equal(steps.take(Infinity, { wait: true }), false, "still waiting");
        assert.equal(steps.take(Infinity), true, "done now, without an end to wait for");
        assert.equal(steps.value, "made");
        assert.deepEqual(told, [undefined, NOW]);
    });

    it("paints a skin in a worker while the rest of them is built, and puts it on when it's back: the same character", async () => {
        globalThis.Worker = Worker;

        try {
            const kit = { human, atlas, skins: new Skins(atlas) };
            const worker = Worker.last;
            const steps = new Steps(Character.building(kit, options(soldier)));

            // (Asked for as it starts; everything else built meanwhile, then waited for)
            assert.equal(steps.take(Infinity, { wait: true }), false);
            assert.ok(steps.waiting);
            assert.equal(kit.skins.jobs.size, 1);
            await worker.deliver();
            assert.equal(steps.take(Infinity, { wait: true }), true);
            assert.equal(kit.skins.jobs.size, 0);
            assert.equal(hashOf(steps.value), hashOf(new Character(kitOf(), options(soldier))));

            // Cat folk's fur and stripes, lizard folk's scales: their fields sent over when first
            // wanted, and painted there the same
            for (const people of ["cat", "lizard"]) {
                const look = soldierLook({ people, weapon: "sword", seed: 3 });
                const furred = new Steps(Character.building(kit, options(look)));

                assert.ok(look.look.skin.fur || look.look.skin.scales, people);
                assert.equal(furred.take(Infinity, { wait: true }), false);
                await worker.deliver();
                assert.equal(furred.take(Infinity, { wait: true }), true);
                assert.equal(hashOf(furred.value), hashOf(new Character(kitOf(), options(look))), people);
            }

            // Can't wait (all at once): painted here, the same, and no longer wanted there
            const now = allAtOnce(Character.building(kit, options(wench)));

            assert.equal(hashOf(now), hashOf(new Character(kitOf(), options(wench))));
            assert.equal(kit.skins.jobs.size, 0);
            await worker.deliver();

            // The worker failing: painted here from then on
            const failing = new Steps(Character.building(kit, options(wench)));

            assert.equal(failing.take(Infinity, { wait: true }), false);
            worker.onerror();
            assert.equal(failing.take(Infinity, { wait: true }), true);
            assert.equal(hashOf(failing.value), hashOf(now));
            assert.equal(kit.skins.ask(wench.look.skin), null);
        } finally {
            delete globalThis.Worker;
        }
    });

    it("works out the skin atlas in the worker (the title needn't wait for it): the page's the same as one worked out here, and skins painted there the same", async () => {
        globalThis.Worker = Worker;

        try {
            const skins = new Skins();
            const worker = Worker.last;
            const told = [];
            const post = worker.postMessage.bind(worker);

            worker.postMessage = (data) => told.push(Object.keys(data)[0]) && post(data);

            const files = { manifest, data: unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength) };
            const ready = skins.analyse(files, human, {}, 128);

            await worker.deliver();

            const made = await ready;
            const worked = new SkinAtlas(human, {}, 128);

            assert.equal(skins.atlas, made);
            assert.deepEqual(made.covered, worked.covered);
            assert.deepEqual(made.gutter, worked.gutter);
            assert.deepEqual(made.normals, worked.normals);
            assert.deepEqual(Object.keys(made.fields).sort(), Object.keys(worked.fields).sort());

            for (const name of Object.keys(worked.fields)) {
                assert.deepEqual(made.fields[name], worked.fields[name], name);
            }

            // (A skin painted there, from the worker's own atlas, nothing of it sent back over)
            const kit = { human, atlas: made, skins };
            const steps = new Steps(Character.building(kit, options(soldier)));

            assert.equal(steps.take(Infinity, { wait: true }), false);
            await worker.deliver();
            assert.equal(steps.take(Infinity, { wait: true }), true);
            assert.equal(hashOf(steps.value), hashOf(new Character(kitOf(), options(soldier))));
            assert.deepEqual(told, ["analyse", "id"]);
        } finally {
            delete globalThis.Worker;
        }

        // (No workers: worked out here, the page shown first)
        const here = await new Skins().analyse(null, human, {}, 128);

        assert.deepEqual(here.fields.cavity, atlas.fields.cavity);
    });

    it("shares a look of eye's picture between those with it, kept a while once none are", () => {
        const kit = kitOf();
        const [one, two] = [new Character(kit, options(wench)), new Character(kit, options(wench))];
        const key = JSON.stringify(wench.look.eyes);

        assert.equal(one.materials.eyes.map, two.materials.eyes.map);

        const entry = [...kit.eyes.values()].find(({ value }) => value === one.materials.eyes.map);

        assert.ok(entry && entry.users === 2, key);
        one.dispose();
        assert.equal(entry.users, 1);
        two.dispose();
        assert.equal(entry.users, 0);
        assert.ok([...kit.eyes.values()].includes(entry), "kept a while");
    });
});
