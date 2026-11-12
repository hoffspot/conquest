// Garments' pictures painted off the page's thread (client/js/characters: skin-worker.js,
// skins.js, garment-painter.js, garment-pictures.js, wardrobe.js): what the worker paints with
// needs nothing a worker can't have, and its colours are three.js's to the last bit; an outfit's
// two pictures and a garment's own are the page's to the last byte, with nothing of them painted
// or kept on the page; the wardrobe's shared makings wait on them as they did on the page's
// (one making for two wearers, the last taker's closing dropping it); painted here where
// they can't be painted there; and nothing's left behind when a wearer's given up on.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
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
const { folkLook, TOWNSFOLK_PARTS } = await import("../client/js/characters/folk.js");
const { GarmentPainter } = await import("../client/js/characters/garment-painter.js");
const { GARMENTS, linearColour, paintGarment, texelMap } = await import("../client/js/characters/garment-pictures.js");
const { letGoOfIdle } = await import("../client/js/characters/kit.js");
const { PICTURES } = await import("../client/js/characters/pictures.js");
const { SkinAtlas } = await import("../client/js/characters/skin.js");
const { Skins } = await import("../client/js/characters/skins.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { garmentMaterial, referenceMeasures, tendKit } = await import("../client/js/characters/wardrobe.js");
const { allAtOnce, Steps } = await import("../client/js/core/steps.js");

const client = fileURLToPath(new URL("../client/", import.meta.url));

// The skin worker (skin-worker.js), run here: what's sent to it copied to it, and what it sends
// back kept till it's delivered (`sent`). `told`: what it's been sent, each message's first key
const scope = { sent: [], postMessage: (data) => scope.sent.push(data) };

globalThis.self = scope;
await import("../client/js/characters/skin-worker.js");

class Worker {
    constructor() {
        // (One worker's code for them all here: the last one's done with first)
        Worker.last?.terminate();
        Worker.last = this;
        this.told = [];
        this.asked = [];
    }

    postMessage(data) {
        this.told.push(Object.keys(data)[0] === "id" ? Object.keys(data)[1] : Object.keys(data)[0]);

        if (data.id !== undefined) {
            this.asked.push(data.id);
        }

        scope.onmessage({ data: structuredClone(data) });
    }

    // (Stopped: whatever it was asked for no longer painted, nor sent back)
    terminate() {
        for (const id of this.asked.splice(0)) {
            scope.onmessage({ data: { cancel: id } });
        }

        scope.sent.length = 0;
    }

    // (What it's painted by now, sent back)
    async deliver() {
        await new Promise((resolve) => setTimeout(resolve, 5));

        for (const data of scope.sent.splice(0)) {
            this.onmessage({ data });
        }
    }
}

// (The game's body; skins small, where it's the wardrobe that's looked at, to paint them quickly)
const humanFiles = readHumanFiles();
const human = new HumanData(humanFiles.manifest, humanFiles.data);
const atlas = new SkinAtlas(human, {}, 64);

// A kit that paints everything on the page; and one as the game's is, its worker having worked
// the skin atlas out itself, and so with the body there to paint garments on
const pageKit = () => ({ human, atlas });

async function workerKit() {
    globalThis.Worker = Worker;

    try {
        const skins = new Skins();
        const worker = Worker.last;
        const ready = skins.analyse(humanFiles, human, {}, 64);

        await worker.deliver();

        return { kit: { human, atlas: await ready, skins }, worker };
    } finally {
        delete globalThis.Worker;
    }
}

const soldier = soldierLook({ people: "human", weapon: "sword", seed: 3 });
const options = (look, more = {}) => ({ shape: look.shape, look: look.look, equipment: look.equipment, hairDetail: 0.1, merge: true, ...more });
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0;
const outfitOf = (character) => character.garments.find(({ name }) => name === "garments").material;
const sent = (texture) => texture.onUpdate?.(texture);

// Steps taken as the game takes them (waiting on what's painted elsewhere), the worker heard from
// between, till they're done: what they make
async function waited(steps, worker) {
    const taking = steps instanceof Steps ? steps : new Steps(steps);

    while (!taking.take(Infinity, { wait: true })) {
        await worker.deliver();
    }

    return taking.value;
}

// Whether a kit's wardrobe has painted anything on the page, or keeps any garment's own picture
const paintedHere = (kit) => Boolean(kit.texelMap) || (kit.garmentMaterials?.size ?? 0) > 0;

// Nothing of a kit's left being made, asked for or worn
function assertNothingLeft(kit, message) {
    assert.equal(kit.making?.size ?? 0, 0, `${message}: nothing left being made`);
    assert.equal(kit.skins?.jobs.size ?? 0, 0, `${message}: nothing left asked of the worker`);

    for (const outfit of kit.composites?.values() ?? []) {
        assert.deepEqual([outfit.users, outfit.wearers.size, outfit.readers, outfit.again], [0, 0, 0, null], `${message}: no one left wearing ${outfit.key}`);
    }

    for (const [key, { users }] of kit.eyes ?? []) {
        assert.equal(users, 0, `${message}: no one left with the eyes ${key}`);
    }

    for (const [id, { users }] of kit.wardrobe?.garments ?? []) {
        assert.equal(users, 0, `${message}: no one left drawing with ${id}`);
    }
}

describe("garments' pictures painted in the skins' worker", () => {
    it("imports nothing a worker can't have: every module the worker's made of is by its own path, none by the page's import map (three.js)", () => {
        // (A worker has no import map: "three" there is an error that stops it, skins and all)
        const seen = new Set();
        const bare = [];
        const follow = (file) => {
            if (seen.has(file)) {
                return;
            }

            seen.add(file);

            for (const [, specifier] of readFileSync(file, "utf8").matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]*?\s*from\s*)?["']([^"']+)["']/g)) {
                if (/^\.{1,2}\//.test(specifier)) {
                    follow(path.resolve(path.dirname(file), specifier));
                } else {
                    bare.push(`${path.relative(client, file)}: ${specifier}`);
                }
            }
        };

        follow(path.join(client, "js/characters/skin-worker.js"));
        assert.deepEqual(bare, []);
        assert.ok(seen.has(path.join(client, "js/characters/garment-painter.js")) && seen.has(path.join(client, "js/characters/garment-pictures.js")), "the wardrobe's painter, and what it paints with");
        assert.ok(!seen.has(path.join(client, "js/characters/garments.js")), "not what fits them to a body, which is three.js's meshes");
    });

    it("has every garment's colours in linear light as three.js has them, to the last bit", () => {
        const colours = new Set();

        for (const garment of Object.values(GARMENTS)) {
            for (const colour of [garment.colour, garment.trim, garment.accent, garment.emblem?.colour]) {
                if (colour !== undefined) {
                    colours.add(colour);
                }
            }
        }

        assert.ok(colours.size > 60, `${colours.size} colours`);

        for (const colour of [...colours, 0x000000, 0xffffff, 0x0a0b0c, "#fff", "#1a9", "#0A0b0C"]) {
            const { r, g, b } = new THREE.Color(colour);

            assert.deepEqual(linearColour(colour), { r, g, b }, String(colour));
        }

        assert.throws(() => linearColour("red"), /not red/);
    });

    it("paints an outfit's two pictures there, the page's own to the last byte, and nothing of them here: soldiers of three peoples and townsfolk, men and women", async () => {
        const { kit, worker } = await workerKit();
        const looks = [];

        // (A people's own make of a garment is tinted from another's picture: the elves' and the
        // orcs' liveries among these)
        for (const people of ["human", "elf", "orc"]) {
            for (const sex of ["m", "f"]) {
                looks.push([`${people} soldier ${sex}`, soldierLook({ people, weapon: sex === "m" ? "sword" : "bow", seed: 3, sex })]);
            }
        }

        for (const sex of ["m", "f"]) {
            looks.push([`townsfolk ${sex}`, folkLook({ role: "townsfolk", look: TOWNSFOLK_PARTS[1], sex, seed: 11 })]);
        }

        let tinted = 0;

        for (const [name, look] of looks) {
            const there = await waited(Character.building(kit, options(look)), worker);
            const here = new Character(pageKit(), options(look));
            const [a, b] = [outfitOf(there), outfitOf(here)];

            assert.equal(a.map.image.width, 512, name);
            assert.ok(same(a.map.image.data, b.map.image.data), `${name}: its colour`);
            assert.ok(same(a.bumpMap.image.data, b.bumpMap.image.data), `${name}: its heights, roughness and metalness`);
            assert.deepEqual(there.garments.map((mesh) => mesh.name), here.garments.map((mesh) => mesh.name), name);
            tinted += there.garments[0].userData.merged.filter((id) => GARMENTS[id].base).length;

            // (And at the least size they're held at, made there too)
            const [small, smallHere] = [kit.composites.get(there.composite).small, here.kit.composites.get(here.composite).small];

            assert.ok(same(small.data, smallHere.data) && same(small.surface, smallHere.surface), `${name}: at the least size`);
        }

        assert.ok(tinted > 0, "some of them a people's make of a garment, tinted");
        assert.equal(paintedHere(kit), false, "none of it painted on the page, nor any garment's picture kept there");
        assert.equal(worker.told.filter((kind) => kind === "measures").length, 1, "the body's measurements sent over once");
        assert.equal(worker.told.filter((kind) => kind === "outfit").length, kit.composites.size, "each outfit asked for once");
    });

    it("paints a garment's own picture there for one who draws their garments one by one, the page's own to the last byte", async () => {
        const { kit, worker } = await workerKit();
        const there = await waited(Character.building(kit, options(soldier, { merge: false })), worker);
        const here = new Character(pageKit(), options(soldier, { merge: false }));
        const names = there.garments.map((mesh) => mesh.name);

        assert.ok(names.length > 3 && !names.includes("garments"), names.join(" "));
        assert.deepEqual(names, here.garments.map((mesh) => mesh.name));

        for (const [k, mesh] of there.garments.entries()) {
            const [a, b] = [mesh.material, here.garments[k].material];

            assert.ok(same(a.map.image.data, b.map.image.data) && same(a.bumpMap.image.data, b.bumpMap.image.data), mesh.name);
            assert.deepEqual([a.color.toArray(), a.bumpScale, a.roughness, a.metalness], [b.color.toArray(), b.bumpScale, b.roughness, b.metalness], mesh.name);
        }

        assert.equal(kit.texelMap, undefined, "none of it painted on the page");
        assert.ok(worker.told.includes("garment") && !worker.told.includes("outfit"));

        // (Dressed all at once from then: the kit's own pictures of them, painted there, drawn with)
        const again = new Character(kit, options(soldier, { merge: false }));

        assert.ok(again.garments.every((mesh, k) => mesh.material === there.garments[k].material));
        assert.equal(kit.texelMap, undefined);
    });

    it("paints them here where the steps can't wait (all at once), the same, and they're no longer wanted there", async () => {
        const { kit, worker } = await workerKit();
        const now = allAtOnce(Character.building(kit, options(soldier)));
        const here = new Character(pageKit(), options(soldier));

        assert.ok(same(outfitOf(now).map.image.data, outfitOf(here).map.image.data) && same(outfitOf(now).bumpMap.image.data, outfitOf(here).bumpMap.image.data));
        assert.equal(paintedHere(kit), true);
        assert.equal(kit.skins.jobs.size, 0);
        // (Each asked for, and called off: nothing of it painted there, nor sent back)
        assert.equal(worker.told.filter((kind) => kind === "cancel").length, worker.told.filter((kind) => ["settings", "outfit", "garment"].includes(kind)).length);
        await worker.deliver();
        await worker.deliver();
        assert.equal(scope.sent.length, 0);

        // The worker failing while it's waited for: painted here from then on, the same
        const other = await workerKit();
        const failing = new Steps(Character.building(other.kit, options(soldier)));

        assert.equal(failing.take(Infinity, { wait: true }), false);
        assert.ok([...other.kit.skins.jobs.values()].some((job) => job.outfit), "waiting on its outfit's pictures");
        other.worker.onerror();
        assert.equal(failing.take(Infinity, { wait: true }), true);
        assert.ok(same(outfitOf(failing.value).map.image.data, outfitOf(here).map.image.data));
        assert.equal(other.kit.skins.askPicture({ garment: "tunic", size: 512 }, () => referenceMeasures(other.kit)), null);
        scope.sent.length = 0;
    });

    it("paints here what can't be painted there: the page is told, and the worker goes on", async () => {
        const { kit, worker } = await workerKit();
        // (One cut from a design, see-through, is the page's to paint; and one there's no such)
        const jobs = ["laceBraBlack", "no such garment"].map((garment) => kit.skins.askPicture({ garment, size: 512 }, () => referenceMeasures(kit)));

        for (const job of jobs) {
            assert.equal(await waited(kit.skins.taking(job), worker), null);
            assert.match(job.failed, /No picture of its own/);
        }

        assert.equal(kit.skins.jobs.size, 0);
        assert.ok(kit.skins.worker, "the worker's still there");

        const there = await waited(Character.building(kit, options(soldier)), worker);

        assert.ok(same(outfitOf(there).map.image.data, outfitOf(new Character(pageKit(), options(soldier))).map.image.data));

        // A worker without the body (sent the atlas, not having worked it out): never asked
        globalThis.Worker = Worker;

        try {
            const skins = new Skins(atlas);

            assert.equal(skins.askPicture({ garment: "tunic", size: 512 }, () => referenceMeasures(kit)), null);
            assert.deepEqual(Worker.last.told, ["atlas"]);
        } finally {
            delete globalThis.Worker;
        }
    });

    it("makes an outfit's pictures once for two wearers built turn and turn about, each waiting on the one making", async () => {
        const { kit, worker } = await workerKit();
        const [one, two] = [new Steps(Character.building(kit, options(soldier, { release: true, tall: 60 }))), new Steps(Character.building(kit, options(soldier, { release: true, tall: 60 })))];

        while (!one.done || !two.done) {
            one.take(Infinity, { wait: true });
            two.take(Infinity, { wait: true });
            await worker.deliver();
        }

        const outfit = kit.composites.get(one.value.composite);

        assert.equal(worker.told.filter((kind) => kind === "outfit").length, 1);
        assert.ok(outfitOf(one.value) === outfitOf(two.value));
        assert.deepEqual([outfit.users, outfit.wearers.size], [2, 2]);
        assert.equal(kit.making.size, 0);

        // (Held at the size they're seen at, as ever: pictures.js)
        assert.equal(outfitOf(one.value).map.image.width, PICTURES.least);
        one.value.dispose();
        two.value.dispose();
        letGoOfIdle(kit);
        assertNothingLeft(kit, "both gone");
        assert.equal(worker.told.at(-1), "letGo", "and the worker's own pictures of the garments let go of with the kit's");
    });

    it("leaves nothing behind when a wearer's given up on while its outfit's pictures are made there: the making dropped, and no longer wanted of the worker", async () => {
        const { kit, worker } = await workerKit();
        const steps = new Steps(Character.building(kit, options(soldier, { release: true, tall: 60 })));

        assert.equal(steps.take(Infinity, { wait: true }), false);
        assert.deepEqual([...kit.skins.jobs.values()].map((job) => (job.outfit ? "outfit" : "skin")), ["skin", "outfit"]);
        assert.equal(kit.making.size, 1);

        // (Given up on: its steps closed, as the game closes them, app/game.js #giveUpBuilding)
        steps.steps.return();
        assertNothingLeft(kit, "given up on");
        assert.equal(kit.composites.size, 0);
        assert.deepEqual(worker.told.slice(-2).sort(), ["cancel", "cancel"]);
        await worker.deliver();
        await worker.deliver();
        assert.equal(scope.sent.length, 0, "nothing painted for it there");

        // Two waiting on the one making, and one given up on: it goes on for the other
        const [gone, stays] = [new Steps(Character.building(kit, options(soldier, { release: true, tall: 60 }))), new Steps(Character.building(kit, options(soldier, { release: true, tall: 60 })))];

        gone.take(Infinity, { wait: true });
        stays.take(Infinity, { wait: true });
        assert.equal(kit.making.size, 1);
        gone.steps.return();
        assert.equal(kit.making.size, 1, "still being made, for the other");
        assert.equal([...kit.skins.jobs.values()].filter((job) => job.outfit).length, 1);

        const kept = await waited(stays, worker);

        assert.deepEqual([kit.composites.get(kept.composite).users, kit.composites.get(kept.composite).wearers.size], [1, 1]);
        assert.ok(same(outfitOf(kept).map.image.data, kit.composites.get(kept.composite).small.data));
        kept.dispose();
        letGoOfIdle(kit);
        assertNothingLeft(kit, "the other gone too");
    });

    it("leaves nothing behind when a body's given up on at any step of its building: no longer counted wearing its outfit, its eyes or its garments", async () => {
        // (On the page, every step of it: the outfit's pictures and each garment's among them)
        for (const merge of [true, false]) {
            const kit = pageKit();
            let most = Infinity;

            for (let stop = 0; stop < most; stop += 9) {
                const steps = Character.building(kit, options(soldier, { merge, release: true, tall: 60 }));
                let taken = 0;
                let step = null;

                while (taken < stop && !(step = steps.next()).done) {
                    taken++;
                }

                // (Built, with fewer steps than that: all of them, then; and let go of as one built is)
                if (step?.done) {
                    most = taken;
                    step.value.dispose();
                } else {
                    steps.return();
                }

                assertNothingLeft(kit, `given up on after ${taken} steps${merge ? "" : ", garment by garment"}`);
            }

            assert.ok(most > 30 && most < Infinity, `${most} steps`);
        }

        // Waiting on its skin, its outfit worn already (the outfit's pictures the page's, the
        // worker having only the atlas): only dropped, it held its outfit's pictures whole for good
        globalThis.Worker = Worker;

        try {
            const kit = { human, atlas, skins: new Skins(atlas) };
            const steps = new Steps(Character.building(kit, options(soldier, { release: true, tall: 60 })));

            assert.equal(steps.take(Infinity, { wait: true }), false);

            const [outfit] = kit.composites.values();

            assert.deepEqual([outfit.users, outfit.wearers.size, kit.skins.jobs.size], [1, 1, 1]);
            steps.steps.return();
            assertNothingLeft(kit, "given up on waiting on its skin");
            assert.equal(Worker.last.told.at(-1), "cancel");
        } finally {
            delete globalThis.Worker;
            scope.sent.length = 0;
        }
    });

    it("makes an outfit's pictures whole again there for a wearer seen bigger, waited for a frame at a time, and gives it up if they're seen small again first", async () => {
        const { kit, worker } = await workerKit();
        const far = await waited(Character.building(kit, options(soldier, { release: true, tall: 60 })), worker);
        const here = outfitOf(new Character(pageKit(), options(soldier)));
        const outfit = kit.composites.get(far.composite);
        const { map, bumpMap } = outfitOf(far);
        let clock = performance.now() + 1e7;

        [map, bumpMap].forEach(sent);
        assert.equal(map.image.width, PICTURES.least);
        assert.deepEqual([outfit.full, map.image.data], [null, null], "sent, and let go of from the page");

        // Seen big: asked of the worker, and the frames go on meanwhile (nothing of it done here)
        far.fitPictures(300, 0.016, (clock += 16));
        assert.ok(outfit.again);

        for (let frame = 0; frame < 5; frame++) {
            const start = performance.now();

            tendKit(kit, (clock += 16), Infinity);
            assert.ok(performance.now() - start < 50, "a frame doesn't wait on it");
            assert.equal(map.image.width, PICTURES.least);
        }

        assert.equal(worker.told.at(-1), "outfit");
        assert.equal(worker.told.filter((kind) => kind === "outfit").length, 2, "asked for once");

        // Seen small again before they're back: no longer wanted there
        far.fitPictures(60, PICTURES.after + 1, (clock += 16));
        assert.equal(outfit.again, null);
        assert.equal(worker.told.at(-1), "cancel");
        assert.equal(kit.skins.jobs.size, 0);

        // Seen big again, and waited for: as they're painted
        far.fitPictures(300, 0.016, (clock += 16));

        while (map.image.width !== 512) {
            await worker.deliver();
            tendKit(kit, (clock += 16), Infinity);
        }

        assert.ok(same(map.image.data, here.map.image.data) && same(bumpMap.image.data, here.bumpMap.image.data));
        assert.equal(outfit.again, null);
        assert.equal(paintedHere(kit), false);
        far.dispose();
        letGoOfIdle(kit);
        assertNothingLeft(kit, "gone");
    });

    it("keeps each garment's picture there a while after it's last used, as the page's wardrobe does, and lets go of them all when it's told to", () => {
        const painter = new GarmentPainter(human);
        const kit = pageKit();
        const measures = referenceMeasures(kit);

        assert.throws(() => painter.garment("tunic", 128), /measurements/);
        painter.measure(measures);

        // (Small ones, to paint them quickly: the same as the page's at that size)
        const tunic = painter.garment("tunic", 128, 1000);
        const map = texelMap(human, 128);

        assert.ok(same(tunic.data, paintGarment(map, GARMENTS.tunic, measures).data));
        assert.ok(painter.garment("tunic", 128, 2000) === tunic, "kept, and not painted again");
        painter.garment("boots", 128, 20000);

        const held = painter.held;

        assert.ok(held > 2 * (128 * 128 * 5), `${held} bytes`);
        assert.equal(painter.sweep(1000 + PICTURES.garments * 1000), 2);
        assert.equal(painter.sweep(2000 + PICTURES.garments * 1000), 1, "the tunic let go of, its half minute gone");
        assert.ok(painter.garment("tunic", 128, 40000) !== tunic && same(painter.garment("tunic", 128, 40000).data, tunic.data), "painted again, the same");

        // An outfit's from them, as the page puts them together
        const { full, small } = allAtOnce(painter.outfitting(["tunic", "boots"], { size: 128, least: 64, colour: false }, 41000));

        assert.equal(full.data.length, 128 * 128 * 4);
        assert.deepEqual([small.data, small.surface.length], [null, 64 * 64 * 4]);
        assert.ok(["tunic", "boots"].every((id) => !same(full.data, paintGarment(map, GARMENTS[id], measures).data)), "the two of them in one");
        painter.letGo();
        assert.equal(painter.pictures.size, 0);
        assert.ok(painter.held < held - 2 * (128 * 128 * 5), "and what's kept for painting them faster");

        // (The page's own, for one drawn at once: the same picture)
        assert.ok(same(garmentMaterial(kit, "tunic").map.image.data, painter.garment("tunic", 512).data));
    });
});
