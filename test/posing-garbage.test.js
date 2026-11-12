// What posing a body makes each frame, to be thrown away (client/js/characters): keeping a blade
// hung at the hip off the leg (Character.hang), swinging a skirt (drapes.js drapeSkeleton) and
// setting the walk's joints (locomotion.js #setJoints) made a function, a list or an object for
// every question asked, most of what a town's people made each frame; and reading an action's
// keys (actions.js sample) and a stride's curves (gait.js curveAt) made lists, functions and
// iterators of their own. Everything made while bodies walk and fight is sampled here, by the
// function that made it, and each of those held to well under what it made before
import assert from "node:assert/strict";
import { Session } from "node:inspector";
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
const { folkLook } = await import("../client/js/characters/folk.js");
const { soldierLook } = await import("../client/js/characters/soldiers.js");
const { Avatar } = await import("../client/js/world/avatar.js");

// (The game's body, its skin a flat colour: nothing of its pictures matters here)
const humanFiles = readHumanFiles();
const kit = { human: new HumanData(humanFiles.manifest, humanFiles.data), atlas: null };
const body = (look, guard) => {
    const character = new Character(kit, { shape: look.shape, look: look.look, equipment: look.equipment, merge: true, hairDetail: 0.1 });
    const avatar = new Avatar(character, { walk: look.walk, guard, phase: 0 });

    avatar.place(0, 0, 0);
    character.sheathe(true);

    return { character, avatar };
};

// Everything made while `work` runs, collected since or not, by the function that made it
// (bytes, sampled: `named` says which functions are counted, by name and file)
async function made(work, named) {
    const session = new Session();
    const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => (error ? reject(error) : resolve(result))));

    session.connect();
    await post("HeapProfiler.startSampling", { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    work();

    const { profile } = await post("HeapProfiler.stopSampling");
    let bytes = 0;
    const walk = (node) => {
        bytes += named(node.callFrame.functionName, node.callFrame.url) ? node.selfSize : 0;
        node.children.forEach(walk);
    };

    session.disconnect();
    walk(profile.head);

    return bytes;
}

describe("what posing a body makes each frame (Character.hang, drapeSkeleton, the walk's joints)", () => {
    it("makes little keeping a hung blade off the leg, swinging a skirt or setting the walk's joints: no function, list or object for each question asked", async (t) => {
        const soldier = body(soldierLook({ people: "human", weapon: "sword", seed: 3 }), "sword");
        const woman = body(folkLook({ role: "townsfolk", look: "porter", sex: "f", seed: 7 }), null);
        const skirts = [...new Set(woman.character.garments.filter((mesh) => mesh.skeleton !== woman.character.rig.skeleton).map((mesh) => mesh.skeleton))];
        const frames = 600;
        const walk = (count) => {
            for (let k = 0; k < count; k++) {
                for (const { character, avatar } of [soldier, woman]) {
                    avatar.update(1 / 60, 0, avatar.object.position.z + 1.4 / 60, 0, true);
                    character.object.updateMatrixWorld(true);
                }

                skirts.forEach((skeleton) => skeleton.update());
            }
        };

        assert.ok(soldier.character.items.some((item) => item.userData.hangs), "a blade hung at the hip");
        assert.equal(skirts.length, 1, "a skirt, and an apron hung from its bones");

        // (Walked a while first: what's worked out once, a blade's fitting, and the engine's own warming up)
        walk(240);

        const inFile = (file) => (name, url) => url.endsWith(file);
        const each = {
            // (Before, the two of them a frame: 110 KB for the blade, 49 KB for the skirt, 21 KB
            // for the walk's joints. Now 20, 16 and 0.2: the numbers handed from one function to
            // another are what's left. Held to between the two)
            "character.js": [await made(() => walk(frames), inFile("/characters/character.js")), 40],
            "drapes.js": [await made(() => walk(frames), inFile("/characters/drapes.js")), 30],
            "the walk's joints": [await made(() => walk(frames), (name, url) => (url.endsWith("/characters/locomotion.js") && (name === "#setJoints" || name === "" || name === "mixed" || name === "sprinting")) || url.endsWith("/characters/grip.js")), 5],
        };

        for (const [what, [bytes, most]] of Object.entries(each)) {
            t.diagnostic(`${what}: ${(bytes / frames / 1024).toFixed(1)} KB a frame (${most} at most)`);
        }

        for (const [what, [bytes, most]] of Object.entries(each)) {
            assert.ok(bytes / frames / 1024 < most, `${what}: ${(bytes / frames / 1024).toFixed(1)} KB a frame (${most} at most)`);
        }
    });

    it("makes nothing reading an action's keys or a stride's curves: no list, function or iterator for each", async (t) => {
        const soldier = body(soldierLook({ people: "human", weapon: "sword", seed: 3 }), "sword");
        const { character, avatar } = soldier;
        const frames = 600;
        let z = 0;
        // (On guard, sword in hand, a blow every second and a half, walking between: its arms
        // reaching all the while, its guard's and its blows' keys read, its legs' curves)
        const fight = (count) => {
            for (let k = 0; k < count; k++) {
                if (k % 90 === 0) {
                    avatar.actions.startAttack("sword", { hitAt: 380, duration: 760 });
                }

                z += k % 180 < 90 ? 0 : 1.3 / 60;
                avatar.update(1 / 60, 0, z, 0, true);
                character.object.updateMatrixWorld(true);
            }
        };

        avatar.actions.setGuard(true);
        character.sheathe(false, { settle: 0.3 });
        fight(360);

        const actions = (names) => (name, url) => url.endsWith("/characters/actions.js") && names.includes(name);
        const each = {
            // (Before, a frame, for the one of them: 15.7 KB, three lists and a function for
            // every channel of every joint; 0.2 now)
            "an action's keys read (sample)": [await made(() => fight(frames), actions(["sample", "tangent", "tangentAt", "valueAt"])), 2],
            // (Before: 2.4 KB of its own and most of 6.2 KB of iterators, one for each pair of a
            // curve's and each list gone through; 0.1 and 0.2 now)
            "a stride's curves (curveAt)": [await made(() => fight(frames), (name, url) => url.endsWith("/characters/gait.js") && name === "curveAt"), 1],
            "the iterators a frame makes, all told": [await made(() => fight(frames), (name, url) => name === "next" && url === ""), 2],
            // (Told, not held to anything: before, 20 KB for the two arms; now 12 to 15 most
            // runs and 25 in some. What's left is numbers handed to the vectors' own methods
            // and the joints' limits, made on the heap or not as the engine chooses what to
            // build into what, which changes from run to run)
            "an arm's swivel searched for (reachArm)": [await made(() => fight(frames), (name, url) => url.endsWith("/characters/rig.js") && ["evaluate", "tryPhi", "solve", "reachArm", "jointRotation"].includes(name)), Infinity],
        };

        for (const [what, [bytes, most]] of Object.entries(each)) {
            t.diagnostic(`${what}: ${(bytes / frames / 1024).toFixed(1)} KB a frame (${most} at most)`);
        }

        for (const [what, [bytes, most]] of Object.entries(each)) {
            assert.ok(bytes / frames / 1024 < most, `${what}: ${(bytes / frames / 1024).toFixed(1)} KB a frame (${most} at most)`);
        }
    });
});
