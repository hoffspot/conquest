// A body's pictures held at the size it's seen at (client/js/characters/pictures.js): its skin,
// its outfit's two (wardrobe.js: by its tallest wearer) and its wounds' (test/wounds.test.js):
// the size chosen at each height on the screen, the smaller picture the next level of the
// bigger, and the swap as it's seen bigger and smaller
import assert from "node:assert/strict";
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
const { halved, halving, PICTURES, pictureSize, reduced, sizedSkin } = await import("../client/js/characters/pictures.js");
const { paintSkin, SkinAtlas } = await import("../client/js/characters/skin.js");
const { Skins } = await import("../client/js/characters/skins.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { OUTFIT_SIZE, tendKit } = await import("../client/js/characters/wardrobe.js");

// The skin worker (skin-worker.js), run here: what's sent to it copied to it, and what it sends
// back kept till it's delivered
const scope = { sent: [], postMessage: (data) => scope.sent.push(data) };

globalThis.self = scope;
await import("../client/js/characters/skin-worker.js");

class Worker {
    postMessage(data) {
        scope.onmessage({ data: structuredClone(data) });
    }

    terminate() {}

    // (What it's painted by now, sent back; till `job`'s is, if one's given)
    async deliver(job = null) {
        for (let k = 0; k < 200; k++) {
            await new Promise((resolve) => setTimeout(resolve, 20));

            for (const data of scope.sent.splice(0)) {
                this.onmessage({ data });
            }

            if (!job || job.skin) {
                break;
            }
        }
    }
}

// (The game's body, its skins 512 a side as on Low and Medium: world/view.js QUALITY)
const humanFiles = readHumanFiles();
const human = new HumanData(humanFiles.manifest, humanFiles.data);
const atlas = new SkinAtlas(human, {}, 512);
const kitOf = () => ({ human, atlas });
const soldier = soldierLook({ people: "human", weapon: "sword", seed: 3 });
const options = (look, more = {}) => ({ shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.1, merge: true, ...more });
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const outfitOf = (character) => character.garments.find(({ name }) => name === "garments").material;
const widths = (character) => [character.materials.body.map.image.width, character.materials.body.bumpMap.image.width, outfitOf(character).map.image.width, outfitOf(character).bumpMap.image.width];

// A picture sent to the graphics card, as three.js tells it (world/release.js lets go of the
// page's copy then, if it's to)
const sent = (texture) => texture.onUpdate?.(texture);

// The frames' clock (ms: ahead of the page's own, which whatever isn't given this one goes by),
// a frame on; and a kit's wardrobe tended to the end of whatever it's making (wardrobe.js tendKit:
// an outfit's pictures made whole again, a little a frame in the game)
let clock = performance.now() + 1e7;
const frame = () => (clock += 16);
const tended = (kit) => tendKit(kit, (clock += 1000), Infinity);

describe("a body's pictures at the size it's seen (pictures.js)", () => {
    it("chooses the size by how tall the body is on the screen: bigger past 120 pixels, smaller again only under 100", () => {
        // (Painted at 512, as on Low and Medium: held at 256, or whole)
        for (const [tall, held, size] of [[0, 256, 256], [60, 256, 256], [100, 256, 256], [119, 256, 256], [120, 256, 512], [121, 256, 512], [900, 256, 512], [121, 512, 512], [100, 512, 512], [99, 512, 256], [0, 512, 256]]) {
            assert.equal(pictureSize(tall, held, 512), size, `${tall} pixels tall, held at ${held}`);
        }

        // (At 1024, as on High: three sizes, each twice as tall as the one before)
        for (const [tall, held, size] of [[119, 256, 256], [120, 256, 512], [239, 256, 512], [240, 256, 1024], [239, 512, 512], [240, 512, 1024], [200, 1024, 1024], [199, 1024, 512], [100, 1024, 512], [99, 1024, 256], [100, 512, 512], [99, 512, 256]]) {
            assert.equal(pictureSize(tall, held, 1024), size, `${tall} pixels tall, held at ${held}, of 1024`);
        }

        // (One painted no bigger than the least is held as it's painted)
        assert.equal(pictureSize(10, 128, 128), 128);
        assert.equal(pictureSize(900, 128, 128), 128);
        assert.deepEqual([PICTURES.least, PICTURES.up, PICTURES.down], [256, 120, 100]);
    });

    it("makes a smaller picture each texel the mean of the four it's made from, a colour's in linear light, as the graphics card makes a picture's next level", () => {
        // (Four alike make one the same, every shade: colour, its alpha, and a byte a texel)
        for (let shade = 0; shade < 256; shade++) {
            assert.deepEqual([...halved(new Uint8Array(16).fill(shade), 2, true)], [shade, shade, shade, shade]);
            assert.deepEqual([...halved(new Uint8Array(4).fill(shade), 2)], [shade]);
        }

        // (Black and white, half and half: 188 in sRGB is half the light; plainly, 128. A colour's
        // alpha, a skin's roughness, plainly too)
        const checks = Uint8Array.from([0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0]);

        assert.deepEqual([...halved(checks, 2, true)], [188, 188, 188, 128]);
        assert.deepEqual([...halved(checks, 2, false)], [128, 128, 128, 128]);
        assert.deepEqual([...halved(Uint8Array.from([10, 20, 30, 41]), 2)], [25]);

        // (Rows and columns in their places: each quarter of a picture its own shade)
        const quarters = new Uint8Array(8 * 8);

        for (let i = 0; i < 64; i++) {
            quarters[i] = 40 * (Math.floor(i / 32) * 2 + (Math.floor(i / 4) % 2)) + 20;
        }

        assert.deepEqual([...reduced(quarters, 8, 2)], [20, 60, 100, 140]);
        assert.ok(same(reduced(quarters, 8, 2), halved(halved(quarters, 8), 4)));

        // (A step at a time, the same)
        const picture = Uint8Array.from({ length: 256 * 256 * 4 }, (_, k) => (k * 7919) % 256);
        const steps = halving(picture, 256, true);
        let step = steps.next();
        let count = 1;

        while (!step.done) {
            step = steps.next();
            count++;
        }

        assert.ok(count >= 4, `${count} steps`);
        assert.ok(same(step.value, halved(picture, 256, true)));
    });

    it("paints a skin at the size asked, and the least size with it to go back to, here and in the worker", async () => {
        const settings = soldier.look.skin;
        const painted = paintSkin(atlas, settings);
        const small = { data: reduced(painted.data, 512, 256, true), bump: reduced(painted.bump, 512, 256, false) };

        // (As it's painted, with no smaller one; smaller; whole with the smaller beside it)
        assert.ok(sizedSkin(painted).data === painted.data && sizedSkin(painted).small === null);
        assert.ok(sizedSkin(painted, 512, 512).small === null && sizedSkin(painted, 256, 256).small === null);
        assert.equal(sizedSkin(painted, 256).width, 256);
        assert.ok(same(sizedSkin(painted, 256).data, small.data) && same(sizedSkin(painted, 256).bump, small.bump));

        const both = sizedSkin(painted, 512, 256);

        assert.ok(both.data === painted.data && both.small.width === 256);
        assert.ok(same(both.small.data, small.data) && same(both.small.bump, small.bump));

        // The worker's, the same
        globalThis.Worker = Worker;

        try {
            const skins = new Skins(atlas);
            const [little, whole] = [skins.ask(settings, { size: 256 }), skins.ask(settings, { size: 512, small: 256 })];
            const unwanted = skins.ask(settings, { size: 512 });

            skins.forget(unwanted);
            await skins.worker.deliver(whole);
            await skins.worker.deliver();
            assert.equal(little.skin.width, 256);
            assert.ok(same(little.skin.data, small.data) && same(little.skin.bump, small.bump) && little.skin.small === null);
            assert.equal(whole.skin.width, 512);
            assert.ok(same(whole.skin.data, painted.data) && same(whole.skin.small.data, small.data) && same(whole.skin.small.bump, small.bump));
            assert.equal(unwanted.skin, null, "one no longer wanted isn't painted");
        } finally {
            delete globalThis.Worker;
        }
    });

    it("builds one of the game's seen small with its skin's and outfit's pictures a quarter the size, the next level of those it's painted at; anyone else's as they're painted", () => {
        const kit = kitOf();
        const [lab, far, near, untold] = [new Character(kit, options(soldier)), new Character(kit, options(soldier, { release: true, tall: 80 })), new Character(kit, options(soldier, { release: true, tall: 300 })), new Character(kit, options(soldier, { release: true }))];

        assert.deepEqual(widths(lab), [512, 512, 512, 512], "a lab's");
        assert.deepEqual(widths(untold), [512, 512, 512, 512], "one not told how it's seen");
        assert.deepEqual(widths(near), [512, 512, 512, 512], "one seen 300 pixels tall");
        assert.equal(far.pictures.wanted, 256);
        near.dispose();
        untold.dispose();
        assert.deepEqual(widths(far), [256, 256, 256, 256], "one seen 80 pixels tall, alone in its outfit now");

        const [body, outfit] = [lab.materials.body, outfitOf(lab)];

        assert.ok(same(far.materials.body.map.image.data, reduced(body.map.image.data, 512, 256, true)), "its skin");
        assert.ok(same(far.materials.body.bumpMap.image.data, reduced(body.bumpMap.image.data, 512, 256, false)), "its skin's bumps");
        assert.ok(same(outfitOf(far).map.image.data, reduced(outfit.map.image.data, 512, 256, true)), "its outfit");
        assert.ok(same(outfitOf(far).bumpMap.image.data, reduced(outfit.bumpMap.image.data, 512, 256, false)), "its outfit's heights, roughness and metalness");
        assert.ok(outfitOf(far) !== outfit, "the lab's has its own, as it's painted, whatever the game's are held at");
        assert.equal(OUTFIT_SIZE, 512);
    });

    it("swaps a body's pictures for bigger ones, in place, as it's seen past 120 pixels tall, and back once it's been under 100 a while", () => {
        const kit = kitOf();
        const whole = new Character(kitOf(), options(soldier));
        const character = new Character(kit, options(soldier, { release: true, tall: 80 }));
        const [skin, bumps, cloth, surface] = [character.materials.body.map, character.materials.body.bumpMap, outfitOf(character).map, outfitOf(character).bumpMap];
        const disposed = new Map([skin, bumps, cloth, surface].map((texture) => [texture, 0]));
        const fit = (tall, seconds, frames = 1) => {
            for (let k = 0; k < frames; k++) {
                character.fitPictures(tall, seconds / frames, frame());
            }
        };

        for (const texture of disposed.keys()) {
            texture.addEventListener("dispose", () => disposed.set(texture, disposed.get(texture) + 1));
            sent(texture);
        }

        // (Sent, the page's copy of each is let go of)
        assert.deepEqual([skin, bumps, cloth, surface].map((texture) => texture.image.data), [null, null, null, null]);

        // Under 120, as it was
        fit(100, 10, 60);
        fit(119, 10, 60);
        assert.deepEqual(widths(character), [256, 256, 256, 256]);
        assert.equal(character.pictures.job, null, "nothing asked for");
        assert.equal(kit.composites.get(character.composite).again, null);

        // Past 120: both asked for (its skin painted here, with no worker, a step each frame; its
        // outfit's made again from its garments', a little each frame), the smaller ones drawn
        // till they come
        fit(121, 0.016);
        assert.ok(character.pictures.job, "its skin asked for");
        assert.ok(kit.composites.get(character.composite).again, "its outfit's being made again");
        assert.deepEqual(widths(character), [256, 256, 256, 256]);

        let frames = 1;

        for (; frames < 2000 && !(skin.image.width === 512 && cloth.image.width === 512); frames++) {
            fit(121, 0.016);
        }

        assert.ok(frames > 8 && frames < 2000, `${frames} frames`);
        assert.deepEqual(widths(character), [512, 512, 512, 512]);
        assert.ok(character.materials.body.map === skin && character.materials.body.bumpMap === bumps && outfitOf(character).map === cloth && outfitOf(character).bumpMap === surface, "the same pictures, in place");
        assert.deepEqual([...disposed.values()], [1, 1, 1, 1], "each smaller one off the graphics card");
        assert.ok(same(skin.image.data, whole.materials.body.map.image.data) && same(bumps.image.data, whole.materials.body.bumpMap.image.data), "its skin as it's painted");
        assert.ok(same(cloth.image.data, outfitOf(whole).map.image.data) && same(surface.image.data, outfitOf(whole).bumpMap.image.data), "its outfit as it's painted");

        // (Sent: the page's copies let go of, the smaller skin kept to go back to)
        for (const texture of disposed.keys()) {
            sent(texture);
        }

        assert.deepEqual([skin, bumps, cloth, surface].map((texture) => texture.image.data), [null, null, null, null]);
        assert.equal(character.pictures.small.width, 256);

        // Between 100 and 120, kept; under 100, kept a while, then swapped back
        fit(101, 60, 600);
        assert.deepEqual(widths(character), [512, 512, 512, 512]);
        fit(99, PICTURES.after - 0.5, 30);
        assert.deepEqual(widths(character), [512, 512, 512, 512], "not yet");
        fit(110, 0.016);
        fit(99, PICTURES.after - 0.5, 30);
        assert.deepEqual(widths(character), [512, 512, 512, 512], "seen bigger meanwhile: the while begun again");
        fit(99, 1, 30);
        assert.deepEqual(widths(character), [256, 256, 256, 256]);
        assert.ok(same(skin.image.data, reduced(whole.materials.body.map.image.data, 512, 256, true)), "its skin the next level again");
        assert.ok(same(cloth.image.data, reduced(outfitOf(whole).map.image.data, 512, 256, true)));
        assert.ok(same(surface.image.data, reduced(outfitOf(whole).bumpMap.image.data, 512, 256, false)));
        assert.equal(character.pictures.small, null);
        assert.deepEqual([...disposed.values()], [2, 2, 2, 2]);
        assert.ok(character.materials.body.map === skin && outfitOf(character).map === cloth);
    });

    it("holds an outfit's pictures by its tallest wearer, and at the least size once no one wears it", () => {
        const kit = kitOf();
        const looks = [1, 2].map((seed) => soldierLook({ people: "human", weapon: "sword", seed }));
        const [far, near] = [new Character(kit, options(looks[0], { release: true, tall: 60 })), new Character(kit, options(looks[1], { release: true, tall: 60 }))];
        const outfit = kit.composites.get(far.composite);

        assert.ok(outfitOf(far) === outfitOf(near) && outfit.users === 2);
        assert.equal(outfitOf(far).map.image.width, 256);
        near.fitPictures(200, 0.016, frame());
        tended(kit);
        assert.equal(outfitOf(far).map.image.width, 512, "one of them seen big");
        far.fitPictures(60, 10, frame());
        assert.equal(outfitOf(far).map.image.width, 512, "the other seen small all the while");
        near.fitPictures(60, PICTURES.after + 1, frame());
        assert.equal(outfitOf(far).map.image.width, 256, "both small");
        near.fitPictures(200, 0.016, frame());
        assert.ok(outfit.again, "being made again");
        near.fitPictures(60, PICTURES.after + 1, frame());
        assert.equal(outfit.again, null, "no longer wanted, before it's made");
        tended(kit);
        assert.equal(outfitOf(far).map.image.width, 256);
        near.fitPictures(200, 0.016, frame());
        tended(kit);
        assert.equal(outfitOf(far).map.image.width, 512);
        near.dispose();
        assert.equal(outfitOf(far).map.image.width, 256, "its tallest wearer gone");
        far.fitPictures(200, 0.016, frame());
        far.dispose();
        tended(kit);
        assert.equal(outfit.users, 0);
        assert.equal(outfit.sized.map.image.width, 256, "kept a while, at its least");
    });

    it("has them whole when asked (for a likeness), however small it's seen, and keeps them so a while", () => {
        const kit = kitOf();
        const character = new Character(kit, options(soldier, { release: true, tall: 60 }));
        const lab = new Character(kit, options(soldier));

        assert.equal(lab.whole(), true, "anyone else's always are");
        assert.equal(character.whole(frame()), false, "asked for");

        let frames = 0;

        for (; frames < 2000 && !character.whole(frame()); frames++) {
            character.fitPictures(60, 0.016, frame());
        }

        assert.ok(frames < 2000);
        assert.deepEqual(widths(character), [512, 512, 512, 512]);

        // (Not asked again: kept whole PICTURES.held seconds, then, seen small still, swapped back)
        for (let k = 0; k < 10; k++) {
            character.fitPictures(60, (PICTURES.held - 0.5) / 10, frame());
        }

        assert.deepEqual(widths(character), [512, 512, 512, 512]);

        for (let k = 0; k < 10; k++) {
            character.fitPictures(60, (PICTURES.after + 1) / 10, frame());
        }

        assert.deepEqual(widths(character), [256, 256, 256, 256]);
    });

    it("asks the skins' worker for a skin of another size, and puts it on when it comes; one no longer wanted forgotten", async () => {
        globalThis.Worker = Worker;

        try {
            const kit = { human, atlas, skins: new Skins(atlas) };
            const whole = new Character(kitOf(), options(soldier));
            const character = new Character(kit, options(soldier, { release: true, tall: 60 }));
            const skin = character.materials.body.map;

            assert.equal(skin.image.width, 256);
            character.fitPictures(200, 0.016, frame());
            assert.ok(character.pictures.job?.asked, "asked of the worker");
            assert.equal(skin.image.width, 256);
            await kit.skins.worker.deliver(character.pictures.job.asked);
            character.fitPictures(200, 0.016, frame());
            assert.equal(skin.image.width, 512);
            assert.ok(same(skin.image.data, whole.materials.body.map.image.data));
            assert.equal(character.pictures.small.width, 256, "the smaller one with it");
            assert.equal(character.pictures.job, null);

            // (Small again before a bigger one comes: not put on, and not painted if not begun)
            character.fitPictures(60, PICTURES.after + 1, frame());
            character.fitPictures(60, 0.016, frame());
            assert.equal(skin.image.width, 256);
            character.fitPictures(200, 0.016, frame());
            assert.ok(character.pictures.job?.asked);
            character.dispose();
            assert.equal(kit.skins.jobs.size, 0);
            await kit.skins.worker.deliver();
        } finally {
            delete globalThis.Worker;
        }
    });
});
