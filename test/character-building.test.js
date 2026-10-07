// Characters built a step at a time (client/js/characters: Character.building), so that someone new
// coming into view is spread over frames, not a stall: the same character as built all at once;
// each piece (the skin, the hair, each garment, the garments' pictures) the same step by step;
// the hair grown once; each garment's cut kept for everyone measured alike; a look of eye's
// picture shared; and the skin painted elsewhere (a worker: skins.js), waited for, the same
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { readHumanFiles } from "../scripts/lib/human-data.js";

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
const { isMouth } = await import("../client/js/characters/mouth.js");
const { buildHair, growingHair } = await import("../client/js/characters/hair.js");
const { buildGarment, compositeGarments, compositingGarments, fittingGarment, GARMENTS, paintGarment, paintingGarment, texelMap } = await import("../client/js/characters/garments.js");
const { folkLook } = await import("../client/js/characters/folk.js");
const { paintingSkin, paintSkin, SkinAtlas } = await import("../client/js/characters/skin.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { allAtOnce, allWaiting, NOW, Steps, WAITING } = await import("../client/js/core/steps.js");
const { Skins } = await import("../client/js/characters/skins.js");
const THREE = await import("three");
const { FAR, KEPT, LODS, Lods, lowerDetail } = await import("../client/js/characters/lod.js");

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

// (The game's body: body.js GAME_BODY)
const humanFiles = readHumanFiles();
const human = new HumanData(humanFiles.manifest, humanFiles.data);
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

    it("draws a soldier's things in few meshes: each item's opaque parts in one, the lashes both sides at once", () => {
        const character = new Character(kitOf(), options(soldier));

        for (const item of character.items) {
            const meshes = [];

            item.traverse((node) => node.isMesh && meshes.push(node));
            assert.equal(meshes.length, 1, `${item.name}: ${meshes.map(({ material }) => material.name)}`);
        }

        assert.ok(character.items.length >= 3, character.items.map(({ name }) => name).join());
        assert.ok(character.materials.lashes.forceSinglePass && character.materials.lashes.side === THREE.DoubleSide);
        assert.ok(character.materials.lashes.alphaMap, "the lashes drawn as strands");
    });

    it("moves its face with its expressions (a body with them): its skin, lashes and mouth's inside by its own weights, from the kit's moves, made once", async () => {
        const { expressionData } = await import("../client/js/characters/expressions.js");
        const character = new Character(kitOf(), options(wench));
        const other = new Character(kitOf(), options(soldier));
        const faces = expressionData(human);

        assert.ok(faces && character.expressions && other.expressions);
        assert.notEqual(character.expressions.weights, other.expressions.weights);
        assert.equal(character.geometry.attributes.faceSlot.array, faces.slotOf);
        assert.notEqual(character.geometry.attributes.faceSlot, other.geometry.attributes.faceSlot, "each geometry its own attribute (they're let go of with it)");

        // Its mouth's inside drawn (its own group, with its own material: not from afar, below)
        const mouth = character.geometry.groups.find(({ materialIndex }) => character.mesh.material[materialIndex] === character.materials.mouth);

        assert.equal(mouth?.count, human.renderIndices("mouth").length);
        assert.ok(isMouth(character.materials.mouth) && !isMouth(character.materials.body));

        // Darkening into its own throat (as the shader does: how far in, 0 to 1) from where its
        // own mouth is, as it's shaped: its front teeth lit as they are, darkening a fifth of the
        // way back, at its darkest past two fifths. On the heroine's face its mouth sits a
        // centimetre behind the base body's; on the orc's two and a half in front
        const { PRESETS } = await import("../client/js/characters/presets.js");
        const inside = [...new Set(Array.from(human.renderIndices("mouth"), (r) => human.renderSource[r]))];

        for (const name of ["heroine", "orc"]) {
            other.setShape(PRESETS[name].shape);

            const { front, depth } = other.materials.mouth.userData.shade;
            const z = inside.map((v) => other.positions[v * 3 + 2]);
            const [first, last] = [Math.max(...z), Math.min(...z)];
            const shown = z.map((at) => [(first - at) / (first - last), Math.min(1, Math.max(0, (front.value - at) / depth.value))]);

            assert.ok(shown.every(([back, dark]) => back > 0.1 || dark === 0), `${name}: the front teeth lit`);
            assert.ok(shown.some(([back, dark]) => back > 0.15 && back < 0.3 && dark > 0 && dark < 1), `${name}: darkening a fifth of the way back`);
            assert.ok(shown.every(([back, dark]) => back < 0.4 || dark === 1), `${name}: the throat at its darkest`);
        }

        // Its skin's, lashes' and mouth's shaders add its expressions' moves before skinning
        for (const material of [character.materials.body, character.materials.lashes, character.materials.mouth]) {
            const shader = { uniforms: {}, vertexShader: "#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>", fragmentShader: "void main() {}" };

            material.onBeforeCompile(shader, null);
            assert.equal(shader.uniforms.faceShapes.value, faces.texture);
            assert.equal(shader.uniforms.faceWeights, character.expressions.weights);
            assert.ok(shader.vertexShader.indexOf("faceWeights[ k ]") < shader.vertexShader.indexOf("#include <skinning_vertex>"));
            assert.match(material.customProgramCacheKey(), /face\d+/);
        }

        // A beast's hide (its own body material) shows none
        const beast = new Character(kitOf(), { ...options(soldier), materials: { body: new THREE.MeshStandardMaterial() } });

        assert.equal(beast.expressions, null);
        character.dispose();
        other.dispose();
        beast.dispose();
    });

    it("draws a character smaller on the screen with fewer of its body's and outfit's triangles, a quarter then a tenth or so, over the same vertices, made once for everyone dressed alike", async () => {
        const lods = new Lods();
        const character = new Character(kitOf(), options(soldier));
        const other = new Character(kitOf(), options(soldier));
        let asked = 0;
        const counted = lods.of.bind(lods);

        lods.of = (key, mesh) => counted(key, () => (asked++, mesh()));
        character.lowerDetail(lods);
        other.lowerDetail(lods);
        await Promise.all(lods.made.values());
        await new Promise((resolve) => setTimeout(resolve, 0));

        // (Made once each, the body's and the outfit's at each level and the eyes', for both of them,
        // dressed alike)
        assert.equal(asked, 2 * LODS.length + 1);

        const { geometry } = character;
        const outfit = character.garments.find(({ userData }) => userData.merged);
        const vertices = geometry.attributes.position.count;
        const [full, middle, far] = character.detail.levels;
        const body = human.renderIndices("body").length / 3;

        assert.equal(character.detail.levels.length, LODS.length + 1);
        assert.ok(character.lowBodies[0].length / 3 < body / 3 && character.lowBodies[1].length / 3 < body / 10, `${character.lowBodies.map((low) => low.length / 3)} body triangles`);
        assert.ok(far[0].count > 0 && far[0].count < middle[0].count && middle[0].count < full[0].count, "fewer of the body's shown at each level");
        assert.ok(middle.length === 2 && far.length === 2, "the body and eyes: no lashes, nor the mouth's inside");

        const [whole, outfitMiddle, outfitFar] = outfit.userData.detail;

        assert.ok(outfitFar.count < outfitMiddle.count && outfitMiddle.count < whole.count / 3, "fewer of the outfit's at each level");
        assert.ok(Array.from(geometry.index.array).every((v) => v < vertices), "the same vertices");

        // (A body triangle from afar is made of those shown, not reaching in under the clothes)
        const index = geometry.index.array;
        const shown = new Set(Array.from(index.subarray(full[0].start, full[0].start + full[0].count)));

        for (const level of [middle, far]) {
            assert.ok(Array.from(index.subarray(level[0].start, level[0].start + level[0].count)).every((v) => shown.has(v)));
        }

        // Switched by how tall it is on the screen, not flicking at the edges
        const drawn = () => [character.level, geometry.groups, outfit.geometry.drawRange.start];

        assert.deepEqual(drawn(), [0, full, 0]);
        character.fitDetail(LODS[0].below - 1);
        assert.deepEqual(drawn(), [1, middle, outfitMiddle.start]);
        character.fitDetail((LODS[0].below + LODS[0].above) / 2);
        assert.equal(character.level, 1, "between the two, as it was");
        character.fitDetail(LODS[1].below - 1);
        assert.deepEqual(drawn(), [2, far, outfitFar.start]);
        character.fitDetail((LODS[1].below + LODS[1].above) / 2);
        assert.equal(character.level, 2, "between the two, as it was");
        character.fitDetail(0);
        assert.equal(character.level, 2, "out of view, as it was");
        character.fitDetail(LODS[1].above + 1);
        assert.equal(character.level, 1);
        character.fitDetail(LODS[0].above + 1);
        assert.deepEqual(drawn(), [0, full, 0]);
        // (Straight from far to full)
        character.fitDetail(10);
        character.fitDetail(LODS[0].above + 1);
        assert.equal(character.level, 0);

        // One of a crowd not among the nearest: never in full
        character.fitDetail(LODS[0].above + 1, 1);
        assert.equal(character.level, 1);
        character.fitDetail(LODS[0].above + 1);
        assert.equal(character.level, 0, "in full again once it's among them");

        // Dressed differently: its body's made again, from what it shows now
        const before = asked;

        character.setEquipment(["sword"]);
        assert.equal(character.lowBodies, null, "drawn in full till they're made");
        await Promise.all(lods.made.values());
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.ok(asked > before + LODS.length - 1);
        assert.ok(character.lowBodies && character.detail.levels[2][0].count < character.detail.levels[0][0].count);
        character.dispose();
        other.dispose();
    });

    it("from afar, its eyes, hair, lace and skirts drawn with fewer triangles too; into the shadow maps, everyone with their lower detail", async () => {
        const lods = new Lods();
        const courtesan = new Character(kitOf(), options(folkLook({ role: "courtesan", sex: "f", seed: 5 })));
        const folk = new Character(kitOf(), options(wench));
        // (A player's: not merged, a far hair grown only when it's asked for)
        const hero = new Character(kitOf(), { ...options(wench, false), far: true });
        const plain = new Character(kitOf(), options(wench, false));
        const triangles = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

        for (const character of [courtesan, folk, hero]) {
            character.lowerDetail(lods);
        }

        await Promise.all(lods.made.values());
        await new Promise((resolve) => setTimeout(resolve, 0));

        // The eyes: a tenth or so
        assert.ok(folk.lowEyes.length < human.renderIndices("eyes").length / 5, `${folk.lowEyes.length / 3} eye triangles`);
        assert.ok(folk.detail.levels.slice(1).every((level) => level[1].count === folk.lowEyes.length));

        // Every garment: lace (not drawn at once with the rest), a skirt, a player's each
        assert.ok(courtesan.garments.some(({ name }) => name.startsWith("lace")) && folk.garments.some(({ userData }) => userData.drape));

        for (const character of [courtesan, folk, hero]) {
            for (const mesh of character.garments) {
                const { detail, cheaper } = mesh.userData;

                assert.ok(detail && detail[2].count < detail[1].count && detail[1].count < detail[0].count, mesh.name);
                assert.deepEqual(cheaper.range, detail[2], "and the farthest into the shadow maps");
            }

            assert.ok(character.garments.reduce((low, { userData }) => low + userData.detail[1].count, 0) < character.garments.reduce((full, { userData }) => full + userData.detail[0].count, 0) / 3);
        }

        // The hair: grown far thinner, drawn instead from afar, and into the shadow maps
        const { hairMesh, farHairMesh } = folk;

        assert.ok(triangles(farHairMesh.geometry) < triangles(hairMesh.geometry) / 2);
        assert.ok(hero.farHairMesh, "a player's, asked for");
        assert.equal(plain.farHairMesh, null, "none if not");
        assert.ok(hairMesh.visible && !farHairMesh.visible);
        folk.setDetail(1);
        assert.ok(hairMesh.visible && !farHairMesh.visible, "the middle level, its own hair");
        folk.setDetail(2);
        assert.ok(!hairMesh.visible && farHairMesh.visible);
        folk.setDetail(0);
        assert.equal(hairMesh.userData.cheaper.geometry, farHairMesh.geometry);

        // (Short hair too: near, it keeps more of its strands)
        const short = buildHair(folk, "short", "none", { detail: 0.2 });
        const far = buildHair(folk, "short", "none", { detail: FAR.hair, far: true });

        assert.ok(triangles(far) < triangles(short) / 4, `${triangles(far)} of ${triangles(short)}`);

        // The body into the shadow maps: its farthest level alone (no eyes, lashes or mouth); one
        // never lowered, its body alone in full
        for (const character of [courtesan, folk, hero]) {
            assert.deepEqual(character.mesh.userData.cheaper.groups, [character.detail.levels.at(-1)[0]]);
        }

        assert.deepEqual(plain.mesh.userData.cheaper.groups, [plain.detail.levels[0][0]]);

        for (const character of [courtesan, folk, hero, plain]) {
            character.dispose();
        }
    });

    it("simplifies a mesh to about a quarter of its triangles, keeping its vertices", async () => {
        const indices = human.renderIndices("body");
        const { positions } = human.shape({});
        const at = new Float32Array(human.renderSource.length * 3);

        human.renderSource.forEach((v, r) => at.set(positions.subarray(v * 3, v * 3 + 3), r * 3));

        const lower = await lowerDetail(indices, at, human.uvs);
        const share = lower.length / indices.length;

        assert.ok(share > 0.2 && share <= LODS[0].share + 0.01, `${share}`);
        assert.ok(lower.every((v) => v < human.renderSource.length));
    });

    it("keeps the lower-detail meshes most recently asked for, letting the longest unasked for go", async () => {
        const lods = new Lods();
        const triangle = () => ({ indices: [0, 1, 2], positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1] });
        let asked = 0;
        const ask = (key) => lods.of(key, () => (asked++, triangle()));

        for (let k = 0; k < KEPT; k++) {
            ask(`mesh ${k}`);
        }

        // (The first asked for again, so the second's the longest unasked for)
        ask("mesh 0");
        ask("one more");
        await Promise.all(lods.made.values());

        assert.equal(asked, KEPT + 1, "made once each");
        assert.equal(lods.made.size, KEPT);
        assert.ok(lods.made.has("mesh 0") && !lods.made.has("mesh 1") && lods.made.has("one more"));
        ask("mesh 1");
        assert.equal(asked, KEPT + 2, "made again once it's let go");
        await Promise.all(lods.made.values());
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

    it("comes back to a step waiting on work done elsewhere where nothing's drawn meanwhile, till it's done (or, gone quiet, has it done now)", async () => {
        let done = false;
        const waiting = function* () {
            while (!done) {
                if ((yield WAITING) === NOW) {
                    return "here";
                }
            }

            return "there";
        };
        const there = allWaiting(waiting());

        setTimeout(() => (done = true), 30);
        assert.equal(await there, "there");
        done = false;
        assert.equal(await allWaiting(waiting(), { patience: 30 }), "here");
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

    it("waits for a skin painted in the worker where nothing's drawn meanwhile (the game loading), rather than painting it here", async () => {
        globalThis.Worker = Worker;

        try {
            const kit = { human, atlas, skins: new Skins(atlas) };
            const worker = Worker.last;
            const told = [];
            const post = worker.postMessage.bind(worker);

            worker.postMessage = (data) => told.push(Object.keys(data)[0]) && post(data);

            // (Asked for as it starts, everything else built at once, then waited for: not
            // called off to be painted here)
            const building = allWaiting(Character.building(kit, options(soldier)));

            assert.equal(kit.skins.jobs.size, 1);

            while (kit.skins.jobs.size) {
                await worker.deliver();
            }

            const character = await building;

            assert.equal(kit.skins.jobs.size, 0);
            assert.deepEqual(told, ["id"]);
            assert.equal(hashOf(character), hashOf(new Character(kitOf(), options(soldier))));
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

            const files = readHumanFiles();
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
