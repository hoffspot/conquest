// What a kit keeps on the page of what its characters wear, and lets go of (client/js/characters/
// wardrobe.js, kit.js): an outfit's pictures once they're on the graphics card, but the colour a
// crowd's figure is made from; idle outfits and looks of eye beyond two; a garment's own picture
// a while after it was last used; all that's idle at once, when asked; and how much it holds
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
const { GARMENTS, pointsHeld } = await import("../client/js/characters/garments.js");
const { heldByKit, letGoOfIdle } = await import("../client/js/characters/kit.js");
const { PICTURES, reduced } = await import("../client/js/characters/pictures.js");
const { SkinAtlas } = await import("../client/js/characters/skin.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { heldInWardrobe, IDLE, tendKit } = await import("../client/js/characters/wardrobe.js");
const { figureOf } = await import("../client/js/world/crowd.js");
const { QUALITY } = await import("../client/js/world/view.js");

// (The game's body; skins small, where it's the wardrobe that's looked at, to paint them quickly)
const humanFiles = readHumanFiles();
const human = new HumanData(humanFiles.manifest, humanFiles.data);
const atlas = new SkinAtlas(human, {}, 64);
const kitOf = (skins = atlas) => ({ human, atlas: skins });
const soldier = soldierLook({ people: "human", weapon: "sword", seed: 3 });
const options = (look, more = {}) => ({ shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.1, merge: true, ...more });
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const outfitOf = (character) => character.garments.find(({ name }) => name === "garments").material;
const MB = 1024 * 1024;

// A picture sent to the graphics card, as three.js tells it (world/release.js lets go of the
// page's copy then, if it's to); a body's outfit's two
const sent = (texture) => texture.onUpdate?.(texture);
const drawn = (character) => [outfitOf(character).map, outfitOf(character).bumpMap].forEach(sent);

// The frames' clock (ms), a frame on; the wardrobe tended to the end of whatever it's making, a
// second on; and `seconds` gone by, tended all the while
let clock = performance.now() + 1e7;
const frame = () => (clock += 16);
const tended = (kit) => tendKit(kit, (clock += 1000), Infinity);
const later = (kit, seconds) => {
    for (let k = 0; k < seconds; k++) {
        tended(kit);
    }
};

// An outfit's pictures as they're painted (a lab's, in a kit of its own)
const painted = outfitOf(new Character(kitOf(), options(soldier)));
const paintedSmall = { data: reduced(painted.map.image.data, 512, 256, true), surface: reduced(painted.bumpMap.image.data, 512, 256, false) };

describe("what a kit keeps of what its characters wear (wardrobe.js)", () => {
    it("lets go of an outfit's pictures from the page once they're on the graphics card, keeping its colour at the least size", () => {
        const kit = kitOf();
        const far = new Character(kit, options(soldier, { release: true, tall: 60 }));
        const outfit = kit.composites.get(far.composite);
        const { map, bumpMap } = outfitOf(far);

        // (Made small: as they're painted, they're not kept at all; its colour kept, its
        // heights the picture's own till they're sent)
        assert.equal(outfit.full, null);
        assert.ok(same(outfit.small.data, paintedSmall.data));
        assert.equal(outfit.small.surface, null);
        assert.ok(map.image.data && bumpMap.image.data);
        assert.equal(heldInWardrobe(kit) - heldInWardrobe({ texelMap: kit.texelMap, referenceMeasures: kit.referenceMeasures }) - garmentsHeld(kit), 256 * 256 * 8);
        drawn(far);
        assert.deepEqual([map.image.data, bumpMap.image.data], [null, null], "sent: let go of");
        assert.equal(heldInWardrobe(kit) - heldInWardrobe({ texelMap: kit.texelMap, referenceMeasures: kit.referenceMeasures }) - garmentsHeld(kit), 256 * 256 * 4, "its colour at the least size, and no more");

        // Seen big: made again from its garments' pictures, swapped in, and let go of once sent,
        // its heights at the least size kept meanwhile to go back to
        far.fitPictures(300, 0.016, frame());
        assert.ok(outfit.again);
        tended(kit);
        assert.equal(map.image.width, 512);
        assert.ok(same(map.image.data, painted.map.image.data) && same(bumpMap.image.data, painted.bumpMap.image.data), "as they're painted");
        assert.equal(outfit.full, null, "the picture's own, till they're sent");
        assert.ok(same(outfit.small.surface, paintedSmall.surface));
        drawn(far);
        assert.deepEqual([map.image.data, bumpMap.image.data], [null, null]);
        assert.equal(heldInWardrobe(kit) - heldInWardrobe({ texelMap: kit.texelMap, referenceMeasures: kit.referenceMeasures }) - garmentsHeld(kit), 256 * 256 * 8);

        // Small again: back at once, from what's kept
        far.fitPictures(60, PICTURES.after + 1, frame());
        assert.equal(map.image.width, 256);
        assert.ok(same(map.image.data, paintedSmall.data) && same(bumpMap.image.data, paintedSmall.surface));
        assert.equal(outfit.small.surface, null);

        // One built near has them as they're painted from the first
        const near = new Character(kitOf(), options(soldier, { release: true, tall: 300 }));
        const whole = near.kit.composites.get(near.composite);

        assert.equal(outfitOf(near).map.image.width, 512);
        assert.ok(same(outfitOf(near).map.image.data, painted.map.image.data));
        assert.equal(whole.full, null);
        assert.ok(same(whole.small.surface, paintedSmall.surface));
    });

    it("gives whoever reads an outfit's pictures on the page the colour kept (a crowd's figure is made from it), and all of them when asked", () => {
        const kit = kitOf();
        const worn = new Character(kit, options(soldier, { release: true, tall: 60 }));
        const outfit = kit.composites.get(worn.composite);

        drawn(worn);

        // A crowd's figure's character (world/crowd.js makingTemplate: not `release`)
        const reader = new Character(kit, options(soldier));
        const material = outfitOf(reader);

        assert.ok(material !== outfitOf(worn), "a material of its own");
        assert.equal(material.map.image.width, 256);
        assert.ok(same(material.map.image.data, paintedSmall.data), "the colour kept");
        assert.ok(material.bumpMap === outfitOf(worn).bumpMap, "its heights the game's own picture of them");
        assert.equal(outfit.again, null, "nothing made again for it");
        assert.equal(outfitOf(worn).map.image.width, 256, "nor the game's own made bigger");

        // (Its figure's made from it: its clothes painted from their picture, not coloured flat)
        const figure = figureOf(reader, 256);

        assert.ok(figure.geometry.attributes.position.count > 1000);

        // Drawn close (a bestiary's portrait): whole, at once, in place
        assert.equal(reader.whole(), true);
        assert.ok(outfitOf(reader) === material);
        assert.equal(material.map.image.width, 512);
        assert.ok(same(material.map.image.data, painted.map.image.data) && same(material.bumpMap.image.data, painted.bumpMap.image.data));
        assert.ok(material.bumpMap !== outfitOf(worn).bumpMap);
        assert.equal(outfitOf(worn).map.image.width, 256, "the game's own as they were");

        // (Gone: what it read let go of again)
        let disposed = 0;

        material.map.addEventListener("dispose", () => disposed++);
        reader.dispose();
        assert.equal(disposed, 1);
        assert.deepEqual([outfit.full, outfit.painted, outfit.readers, outfit.users], [null, null, 0, 1]);

        // The figure's character first, the game's own after: as they're painted, kept while it reads them
        const other = kitOf();
        const first = new Character(other, options(soldier));
        const second = new Character(other, options(soldier, { release: true, tall: 60 }));
        const shared = other.composites.get(first.composite);

        assert.equal(outfitOf(first).map.image.width, 512);
        assert.ok(same(outfitOf(first).map.image.data, painted.map.image.data));
        assert.equal(outfitOf(second).map.image.width, 256);
        assert.ok(shared.full, "kept while it's read");
        second.fitPictures(300, 0.016, frame());
        assert.equal(outfitOf(second).map.image.width, 512, "and bigger ones put on from them at once");
        assert.equal(shared.again, null);
        first.dispose();
        assert.deepEqual([shared.full, shared.painted], [null, null]);
    });

    it("keeps an outfit's colour as it's painted where a crowd's figures are made that big (skins of 1024: High), and at the least size where they're no bigger", () => {
        // (What it goes by: a level's figures' pictures are half its skins' size, at most)
        for (const [name, level] of Object.entries(QUALITY)) {
            assert.ok(level.soldiers.picture <= Math.min(512, Math.max(256, level.skin / 2)), name);
        }

        const kit = kitOf(new SkinAtlas(human, {}, 1024));
        const worn = new Character(kit, options(soldier, { release: true, tall: 60 }));
        const outfit = kit.composites.get(worn.composite);

        drawn(worn);
        assert.equal(outfitOf(worn).map.image.width, 256, "held small all the same");
        assert.ok(same(outfit.full.data, painted.map.image.data) && outfit.full.surface === null);

        const reader = new Character(kit, options(soldier));

        assert.equal(outfitOf(reader).map.image.width, 512);
        assert.ok(same(outfitOf(reader).map.image.data, painted.map.image.data));
        assert.ok(outfitOf(reader).bumpMap === outfitOf(worn).bumpMap);
    });

    it("lets go of a garment's own picture 30 seconds after it was last used, and paints it again when it's next wanted", () => {
        const kit = kitOf();
        const one = new Character(kit, options(soldier, { release: true, tall: 60 }));
        const ids = [...kit.garmentMaterials.keys()];
        const mail = kit.garmentMaterials.get("mail");
        const bytes = Uint8Array.from(mail.map.image.data);
        let disposed = 0;

        assert.ok(ids.includes("mail.human") && ids.includes("mail"), ids.join());
        assert.equal(GARMENTS["mail.human"].base, "mail");
        mail.map.addEventListener("dispose", () => disposed++);
        assert.ok(garmentsHeld(kit) > 8 * MB, `${garmentsHeld(kit) / MB} MB of garments' pictures`);

        // (Kept a while, for the next outfit made of them)
        later(kit, PICTURES.garments - 2);
        assert.equal(kit.garmentMaterials.size, ids.length);
        later(kit, 4);
        assert.equal(kit.garmentMaterials.size, 0, "let go of");
        assert.equal(disposed, 1);
        assert.equal(garmentsHeld(kit), 0);

        // Wanted again (its outfit seen big): painted again, the same
        one.fitPictures(300, 0.016, frame());
        tended(kit);
        assert.equal(outfitOf(one).map.image.width, 512);
        assert.ok(same(outfitOf(one).map.image.data, painted.map.image.data), "the outfit's picture from them, as it was");
        assert.ok(same(kit.garmentMaterials.get("mail").map.image.data, bytes));
        assert.ok(kit.garmentMaterials.get("mail") !== mail);
    });

    it("keeps a garment's own picture while anyone draws with it (a player's garments, drawn one by one), and the one a people's make of it is tinted from", () => {
        const kit = kitOf();
        const hero = new Character(kit, options(soldier, { merge: false, release: true }));
        const ids = [...kit.garmentMaterials.keys()];
        const mesh = hero.garments.find(({ name }) => name === "mail.human");

        assert.ok(mesh.material === kit.garmentMaterials.get("mail.human"));
        assert.ok(mesh.material.map === kit.garmentMaterials.get("mail").map, "tinted: its pictures the plain one's");
        later(kit, PICTURES.garments * 3);
        assert.deepEqual([...kit.garmentMaterials.keys()], ids, "drawn with: kept");
        assert.ok(mesh.material.map.image.data, "and its picture on the page (an outfit's may be made from it yet)");
        letGoOfIdle(kit);
        assert.deepEqual([...kit.garmentMaterials.keys()], ids, "nor let go of when what's idle is");

        // (Dressed in something else: what it drew with is let go of, a while after)
        hero.setEquipment(["trousers"]);
        assert.deepEqual(hero.drawn, ["trousers"]);
        later(kit, PICTURES.garments - 2);
        assert.ok(kit.garmentMaterials.has("mail.human") && kit.garmentMaterials.has("mail"));
        later(kit, 4);
        assert.deepEqual([...kit.garmentMaterials.keys()], ["trousers"]);
        hero.dispose();
        later(kit, PICTURES.garments + 2);
        assert.equal(kit.garmentMaterials.size, 0);
    });

    it("keeps two idle outfits and two idle looks of eye; lets go of everything idle at once when asked, and makes it again when it's next wanted", () => {
        const kit = kitOf();
        // (Four peoples' soldiers, each in its own uniform, and a look of eye each)
        const looks = ["elf", "cat", "lizard", "orc"].map((people, k) => {
            const look = soldierLook({ people, weapon: "sword", seed: 1 });

            return { ...look, look: { ...look.look, eyes: { ...look.look.eyes, pupil: 0.2 + k * 0.05 } } };
        });
        const folk = looks.map((look) => new Character(kit, options(look, { release: true, tall: 60 })));
        const kept = new Character(kit, options(soldier, { release: true, tall: 60 }));
        const pictures = folk.map((character) => outfitOf(character).map);
        const disposed = pictures.map(() => 0);

        pictures.forEach((picture, k) => picture.addEventListener("dispose", () => disposed[k]++));
        assert.equal(IDLE, 2);
        assert.equal(kit.composites.size, 5);
        assert.equal(kit.eyes.size, 5);
        assert.ok(pointsHeld(kit.texelMap) > 0, "where each texel is on the body, kept for the next garment painted");

        const before = heldByKit(kit);

        folk.forEach((character) => character.dispose());
        assert.equal(kit.composites.size, 3, "two idle ones kept, and the one worn");
        assert.equal(kit.eyes.size, 3);
        assert.deepEqual(disposed, [1, 1, 0, 0], "the longest unworn let go of");

        letGoOfIdle(kit);
        assert.deepEqual(disposed, [1, 1, 1, 1]);
        assert.deepEqual([...kit.composites.keys()], [kept.composite], "but the one that's worn");
        assert.equal(kit.eyes.size, 1);
        assert.equal(kit.garmentMaterials.size, 0, "no garment's own picture, none being drawn with");
        assert.equal(pointsHeld(kit.texelMap), 0);
        assert.ok(heldByKit(kit) < before - 20 * MB, `${(before / MB).toFixed(1)} MB held before, ${(heldByKit(kit) / MB).toFixed(1)} after`);
        assert.equal(outfitOf(kept).map.image.width, 256, "what's worn as it was");

        // (Wanted again: made again, the same)
        const again = new Character(kit, options(soldier, { release: true, tall: 60 }));
        const lab = new Character(kit, options(looks[0]));

        assert.ok(outfitOf(again) === outfitOf(kept));
        assert.ok(same(outfitOf(lab).map.image.data, outfitOf(new Character(kitOf(), options(looks[0]))).map.image.data));
    });

    it("counts what the kit holds on the page: its garments' and outfits' pictures, its looks of eye's, the body's and the skin atlas's data", () => {
        const kit = kitOf();
        const fixed = heldByKit(kit);

        // (The body's data and the atlas's, before anyone's dressed)
        assert.ok(fixed > 2 * MB && fixed < 40 * MB, `${fixed / MB} MB`);
        assert.equal(heldInWardrobe(kit), 0);

        const worn = new Character(kit, options(soldier, { release: true, tall: 60 }));
        const dressed = heldByKit(kit) - fixed;

        // (Its garments' own pictures, 1.25 MB each of nine; its outfit's at the least size; where
        // each texel is, and what's kept for painting; its eyes')
        assert.ok(dressed > 15 * MB && dressed < 30 * MB, `${dressed / MB} MB`);
        drawn(worn);
        assert.equal(heldByKit(kit) - fixed, dressed - 256 * 256 * 4, "less its outfit's heights, sent");
        letGoOfIdle(kit);

        const left = heldByKit(kit) - fixed;

        assert.ok(left > 3 * MB && left < 9 * MB, `${left / MB} MB: where each texel is, its outfit's colour at 256 and its eyes'`);
        worn.dispose();
        letGoOfIdle(kit);
        assert.equal(heldByKit(kit) - fixed, heldInWardrobe({ texelMap: kit.texelMap, referenceMeasures: kit.referenceMeasures }), "where each texel is on the body and what's measured of it, and no more");
    });
});

// How many bytes of its garments' own pictures a kit holds on the page
function garmentsHeld(kit) {
    const seen = new Set();
    let bytes = 0;

    for (const material of kit.garmentMaterials?.values() ?? []) {
        for (const data of [material.map?.image?.data, material.bumpMap?.image?.data]) {
            if (data && !seen.has(data.buffer)) {
                seen.add(data.buffer);
                bytes += data.buffer.byteLength;
            }
        }
    }

    return bytes;
}
