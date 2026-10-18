// Creatures built a step at a time (client/js/beasts/sculpt.js sculpting, beast.js
// dressingCreature): the first time one of a kind's looks is wanted, its body is sculpted and its
// pieces folded over many small steps, the same as all at once, and shared after
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Group } from "three";

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

const { BeastAvatar, BUILDERS, drawnAsBeast, dressingCreature, skinOf } = await import("../client/js/beasts/beast.js");
const { forgetModels, holdModel, releaseModel, useModel } = await import("../client/js/beasts/model.js");
const { LOOKS } = await import("../client/js/beasts/looks.js");
const { fold, forget, kept, LINGER, sculpting } = await import("../client/js/beasts/sculpt.js");
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

    it("draws a people-shaped kind drawn from a model as a beast once its model's read (a hell's lord), as a character till then; the rest of the people-shaped always as characters", () => {
        assert.equal(drawnAsBeast("puma"), true);
        assert.equal(drawnAsBeast("cultist"), false);
        assert.equal(drawnAsBeast("demonLord"), false);

        // (Its model read: a beast, drawn from it; a cultist still a character)
        useModel("demonLord", { scene: new Group(), animations: [] });
        assert.equal(drawnAsBeast("demonLord"), true);
        assert.equal(drawnAsBeast("cultist"), false);

        // (Let go of again: its stand-in, a character)
        holdModel("demonLord");
        releaseModel("demonLord", 0);
        forgetModels(1e9, 1000);
        assert.equal(drawnAsBeast("demonLord"), false);
    });

    it("draws a hell's fiend as a character till its model's read, then from the model, in one of its three skins by its seed", () => {
        assert.equal(drawnAsBeast("fiend"), false);
        useModel("fiend", { scene: new Group(), animations: [] });
        assert.equal(drawnAsBeast("fiend"), true);

        // (A pack of them in all three: its own red, pale and ash)
        assert.deepEqual(new Set(Array.from({ length: 12 }, (_, seed) => skinOf("fiend", seed + 1))), new Set(["", "pale", "ash"]));

        holdModel("fiend");
        releaseModel("fiend", 0);
        forgetModels(1e9, 1000);
        assert.equal(drawnAsBeast("fiend"), false);
    });

    it("lets any other error through, and makes what's wanted there and then after", () => {
        assert.throws(() => stepsOf(sculpting(() => new BeastAvatar("no such creature"))), TypeError);

        // (Not a step at a time any more: a look not made yet, made at once)
        const boar = new BeastAvatar("boar", { seed: 3 });

        assert.ok(geometriesOf(boar.object).length > 1);
    });
});

// The geometries a creature shares with its look (its sculpted body and its folded pieces: its
// skinned meshes), each marked when it's disposed
function sharedOf(beast) {
    const shared = geometriesOf(beast.object).filter((geometry, k, all) => all.indexOf(geometry) === k && geometry.attributes.skinIndex);

    for (const geometry of shared) {
        geometry.addEventListener("dispose", () => (geometry.userData.disposed = true));
    }

    return shared;
}

describe("a look's body let go of once none of it's been drawn for a while (sculpt.js hold, release, forget)", () => {
    it("keeps it while any of its look is drawn, and LINGER after the last is let go of, then lets it go and makes it again if wanted", () => {
        // (Seeds 1, 4 and 7 are one look of a hyena)
        const [one, two] = [new BeastAvatar("hyena", { seed: 1 }), new BeastAvatar("hyena", { seed: 4 })];
        const shared = sharedOf(one);
        const before = meshesOf(one.object);
        const looks = kept().looks;

        assert.ok(shared.length >= 2, `${shared.length} shared`);

        one.dispose();
        forget(performance.now() + LINGER * 2);
        assert.ok(shared.every((geometry) => !geometry.userData.disposed), "another of its look still drawn");

        two.dispose();
        forget(performance.now() + LINGER - 1000);
        assert.ok(shared.every((geometry) => !geometry.userData.disposed), "not yet");
        assert.equal(kept().looks, looks);

        forget(performance.now() + LINGER + 1000);
        assert.ok(shared.every((geometry) => geometry.userData.disposed));
        assert.equal(kept().looks, looks - 1);

        // (Wanted again: sculpted again, a step at a time, the same as it was)
        const [steps, again] = stepsOf(sculpting(() => new BeastAvatar("hyena", { seed: 1 })));

        assert.ok(steps > 5, `${steps} steps`);
        assert.deepEqual(meshesOf(again.object), before);
        assert.ok(geometriesOf(again.object).every((geometry) => !shared.includes(geometry)));
        again.dispose();
    });

    it("counts each drawn once, however often it's let go of, and keeps a look met again meanwhile", () => {
        // (Seeds 2, 5 and 8 are one look of a boar)
        const [one, two] = [new BeastAvatar("boar", { seed: 2 }), new BeastAvatar("boar", { seed: 5 })];
        const shared = sharedOf(one);

        one.dispose();
        one.dispose();
        forget(performance.now() + LINGER * 2);
        assert.ok(shared.every((geometry) => !geometry.userData.disposed), "the other still drawn");

        // (None drawn, then another of the look built before LINGER is up: kept for it, and after)
        two.dispose();

        const three = new BeastAvatar("boar", { seed: 8 });

        forget(performance.now() + LINGER * 2);
        assert.ok(shared.every((geometry) => !geometry.userData.disposed), "met again");
        assert.ok(geometriesOf(three.object).some((geometry) => shared.includes(geometry)));

        three.dispose();
        forget(performance.now() + LINGER * 2);
        assert.ok(shared.every((geometry) => geometry.userData.disposed));
    });

    it("lets go of its lower levels with it", async () => {
        // (Fewer triangles: the first tenth of the whole one's, made at once)
        const lods = { of: (key, mesh) => Promise.resolve(mesh().indices.slice(0, Math.floor(mesh().indices.length / 30) * 3)) };
        const wolf = new BeastAvatar("wolf", { seed: 2 });

        wolf.lowerDetail(lods);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const lower = wolf.levels.flatMap(({ lower: levels }) => levels ?? []);

        assert.ok(lower.length >= 2, `${lower.length} lower levels`);

        for (const geometry of lower) {
            geometry.addEventListener("dispose", () => (geometry.userData.disposed = true));
        }

        wolf.dispose();
        forget(performance.now() + LINGER * 2);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.ok(lower.every((geometry) => geometry.userData.disposed));
    });

    it("tells what's kept: how many looks, how many none's drawn on, and their bytes", () => {
        // (A look of a puma not built before: seeds 1, 4 and 7)
        const before = kept();
        const puma = new BeastAvatar("puma", { seed: 1 });
        const held = kept();

        puma.dispose();

        const unheld = kept();

        assert.equal(held.looks, before.looks + 1);
        assert.ok(held.bytes > before.bytes + 100000, `${held.bytes - before.bytes} bytes`);
        assert.equal(unheld.unheld, held.unheld + 1);
        forget(performance.now() + LINGER * 2);
        assert.equal(kept().unheld, 0);
        assert.ok(kept().bytes < unheld.bytes);
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
