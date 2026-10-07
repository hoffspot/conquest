// Creatures built a step at a time (client/js/beasts/sculpt.js sculpting, beast.js
// dressingCreature): the first time one of a kind's looks is wanted, its body is sculpted and its
// pieces folded over many small steps, the same as all at once, and shared after
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (The creatures' skins paint a canvas: enough of one for them to in Node, every other drawing
// call doing nothing)
const noop = () => {};
const context = () =>
    new Proxy(
        {
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            createLinearGradient: () => ({ addColorStop: noop }),
            createRadialGradient: () => ({ addColorStop: noop }),
            measureText: (text) => ({ width: String(text).length * 10 }),
        },
        { get: (target, key) => (key in target ? target[key] : noop) },
    );

globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: context }) };

const { BeastAvatar, BUILDERS, dressingCreature } = await import("../client/js/beasts/beast.js");
const { LOOKS } = await import("../client/js/beasts/looks.js");
const { fold, sculpting } = await import("../client/js/beasts/sculpt.js");
const { seeded } = await import("../client/js/beasts/shapes.js");
const { GAITS } = await import("../client/js/audio/sound.js");

// Every mesh under a creature's model: what it is, its colour and every number of its geometry
function meshesOf(object) {
    const meshes = [];

    object.traverse((node) => {
        if (node.isMesh) {
            const { attributes, index } = node.geometry;

            meshes.push([node.type, node.material.type, node.material.color?.getHex(), ...Object.entries(attributes).map(([name, { array }]) => `${name}:${array.constructor.name}:${array.join()}`), index?.array.join()]);
        }
    });

    return meshes;
}

// The geometries under a creature's model
function geometriesOf(object) {
    const geometries = [];

    object.traverse((node) => {
        if (node.isMesh) {
            geometries.push(node.geometry);
        }
    });

    return geometries;
}

// Every step taken: how many, and what they made
function stepsOf(steps) {
    let count = 0;
    let step = steps.next();

    while (!step.done) {
        count++;
        step = steps.next();
    }

    return [count, step.value];
}

// A creature's model built as BeastAvatar builds it (its look's builder, then its pieces folded),
// kept under a key of its own
function modelOf(id, key) {
    const plan = BUILDERS[LOOKS[id].body](LOOKS[id], seeded(5), key);

    fold(plan.object, key);

    return plan.object;
}

describe("creatures built a step at a time (sculpt.js, beast.js)", () => {
    it("sculpts a body and folds its pieces over many small steps, the same as all at once", () => {
        // (A sculpted beast; a skeleton, all pieces; a magma slime, sculpted, then made molten)
        for (const id of ["wolf", "skeleton", "magmaSlime"]) {
            const whole = modelOf(id, `${id}:whole`);
            const [steps, stepped] = stepsOf(sculpting(() => modelOf(id, `${id}:stepped`)));

            assert.ok(steps > 5, `${id}: ${steps} steps`);
            assert.deepEqual(meshesOf(stepped), meshesOf(whole), id);
        }
    });

    it("shares a look once it's made: another of it is built at once, and one wanted meanwhile takes up where the first had got to", () => {
        // (Seeds 3, 6 and 9 are one look of a bear; 4 another)
        const first = sculpting(() => new BeastAvatar("bear", { seed: 3 }));

        for (let k = 0; k < 40; k++) {
            first.next();
        }

        const [meanwhile, second] = stepsOf(sculpting(() => new BeastAvatar("bear", { seed: 6 })));
        const [rest, bear] = stepsOf(first);
        const [alone] = stepsOf(sculpting(() => new BeastAvatar("bear", { seed: 4 })));
        const [again] = stepsOf(sculpting(() => new BeastAvatar("bear", { seed: 9 })));

        assert.ok(meanwhile <= alone - 30, `${meanwhile} steps, one alone ${alone}`);
        assert.ok(rest <= 1, `${rest} steps left`);
        assert.equal(again, 0);
        assert.ok(geometriesOf(bear.object).every((geometry, k) => geometry === geometriesOf(second.object)[k]));
    });

    it("builds a beast through its sculpting when it's dressed in steps (dressingCreature)", () => {
        const [steps, puma] = stepsOf(dressingCreature(null, "puma", { seed: 5 }));

        assert.ok(puma instanceof BeastAvatar);
        assert.ok(steps > 20, `${steps} steps`);

        // (What its look shares: another of it, seed 8, built at once)
        assert.ok(geometriesOf(new BeastAvatar("puma", { seed: 8 }).object).every((geometry, k) => geometry === geometriesOf(puma.object)[k]));
    });

    it("lets any other error through, and makes what's wanted there and then after", () => {
        assert.throws(() => stepsOf(sculpting(() => new BeastAvatar("no such creature"))), TypeError);

        // (Not a step at a time any more: a look not made yet, made at once)
        const boar = new BeastAvatar("boar", { seed: 3 });

        assert.ok(geometriesOf(boar.object).length > 1);
    });
});

describe("creatures' footfalls (beast.js gait)", () => {
    it("steps on the feet it has, as heavy as it's big; what floats or flies in a swarm isn't heard", () => {
        const gaits = Object.fromEntries(
            Object.entries(LOOKS)
                .filter(([, { body }]) => body !== "humanoid")
                .map(([id]) => [id, new BeastAvatar(id, { seed: 1 }).gait]),
        );

        for (const [id, { feet, size }] of Object.entries(gaits)) {
            const floats = ["spectre", "wisp", "swarm"].includes(LOOKS[id].body);

            assert.ok(floats ? feet === null : Boolean(GAITS[feet]), `${id}: ${feet}`);
            assert.ok(size > 0 && Number.isFinite(size), `${id}: ${size}`);
        }

        assert.deepEqual([gaits.caveSpider.feet, gaits.slime.feet, gaits.snake.feet, gaits.bogFrog.feet, gaits.wolf.feet, gaits.skeleton.feet], ["legs", "slime", "scales", "webbed", "paws", "feet"]);
        assert.ok(gaits.rat.size < gaits.wolf.size && gaits.wolf.size < gaits.bear.size && gaits.bear.size < gaits.dragon.size, ["rat", "wolf", "bear", "dragon"].map((id) => gaits[id].size.toFixed(2)).join());
        assert.ok(Math.abs(gaits.skeleton.size - 1) < 0.1, "a skeleton's as heavy as a person");
    });
});
