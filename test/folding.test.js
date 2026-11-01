// Arms folded (characters/actions.js RESTS `handFree`, place's CLEAR_KEEP; beasts/beast.js
// restWaysOf): a sentry folding the arms with no jump in the hands as they're kept out of the
// body, on the bodies they jumped worst on; the wilds' people-shaped, their weapon always in hand,
// never folding their arms round it nor clasping their hands behind them, in the game or the model
// viewer; and every way an orc raider with its cleaver passes the time without a jump in its hands
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readHumanData, readHumanFiles } from "../scripts/lib/human-data.js";

// (Pictures put on a canvas: enough of one for that in Node)
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

const THREE = await import("three");
const { HumanData } = await import("../client/js/characters/body.js");
const { SkinAtlas } = await import("../client/js/characters/skin.js");
const { RESTS } = await import("../client/js/characters/actions.js");
const { BODIES, dress, FRAME, motions } = await import("../client/js/characters/motioncheck.js");
const { dressCreature, restsOf, restWaysOf } = await import("../client/js/beasts/beast.js");
const { ROLES } = await import("../client/js/core/roles.js");
const { WEAPONS } = await import("../client/js/core/weapons.js");

const files = readHumanFiles();
const human = new HumanData(files.manifest, files.data);
const kit = { human, atlas: new SkinAtlas(human, {}, 128) };

const FOLDED = RESTS.sentry.findIndex(({ name }) => name === "arms folded");
const CLASPED = RESTS.sentry.findIndex(({ name }) => name === "hands clasped behind");

// A people-shaped creature (a LOOKS id) as the game draws it, with its weapon in hand or none
function creature(id, weapon, seed = 1) {
    const avatar = dressCreature(kit, id, { seed, equipment: weapon ? WEAPONS[weapon].equipment : [], guard: weapon ? WEAPONS[weapon].attacks[0].animation : null });

    avatar.place(0, 0, 0);

    return avatar;
}

// The most either hand's step changed from one frame to the next (centimetres, at 60 frames a
// second) as `avatar` stood through a sentry's rest (`variant`): a hand jumping (moving a few
// centimetres one frame, and back or on the next) as against moving smoothly
function jumpiest(avatar, variant) {
    const dt = 1 / 60;
    const hands = ["RightHand", "LeftHand"].map((name) => avatar.character.rig.skeleton.bones.find((bone) => bone.name === name));
    const places = [];

    for (let k = 0; k < 120; k++) {
        avatar.update(dt, 0, 0, 0, true);
    }

    // (Only this rest: not another of its own as it stands on)
    avatar.rest = () => {};
    avatar.actions.rest("sentry", { variant });

    for (let k = 0; k < ROLES.sentry.rests[variant].duration * 60; k++) {
        avatar.update(dt, 0, 0, 0, true);
        avatar.character.object.updateMatrixWorld(true);
        places.push(hands.map((bone) => bone.getWorldPosition(new THREE.Vector3())));
    }

    let most = 0;

    for (let k = 2; k < places.length; k++) {
        for (let side = 0; side < 2; side++) {
            const [a, b, c] = [places[k - 2][side], places[k - 1][side], places[k][side]];
            const change = c.clone().sub(b).sub(b.clone().sub(a)).length();

            most = Math.max(most, change * 100);
        }
    }

    return most;
}

// The most either hand's step changed from one frame to the next (centimetres) as a motion of the
// motion check's (its id) was played on one of its bodies (its id), as the check plays it
// (motioncheck.js play: 30 frames a second)
function jumpOf(id, bodyId) {
    const motion = motions().find((each) => each.id === id);
    const body = BODIES.find(({ id: each }) => each === bodyId);
    const dressed = dress(readHumanData(), motion.look(body), { sheathed: motion.sheathed });
    const hands = ["RightHand", "LeftHand"].map((name) => dressed.character.rig.bone(name));
    const places = [];

    motion.start(dressed, body);

    for (let t = FRAME; t <= motion.seconds + 1e-6; t += FRAME) {
        dressed.walker.update(FRAME, { speed: motion.speed });
        dressed.character.object.updateMatrixWorld(true);
        places.push(hands.map((bone) => bone.getWorldPosition(new THREE.Vector3())));
    }

    let most = 0;

    for (let k = 2; k < places.length; k++) {
        for (let side = 0; side < 2; side++) {
            const [a, b, c] = [places[k - 2][side], places[k - 1][side], places[k][side]];

            most = Math.max(most, c.clone().sub(b).sub(b.clone().sub(a)).length() * 100);
        }
    }

    return most;
}

describe("arms folded (actions.js, beast.js restWaysOf)", () => {
    it("folds a sentry's arms with no jump in either hand as it's kept out of the body: no step more than 6.5 cm off the last at 30 frames a second, on the bodies it jumped worst on", () => {
        // (Standing at rest, each frame's moves out of the body begun from the last frame's, kept if
        // that leaves no harm, CLEAR_KEEP: begun from none, a move taken back as it strained the arm
        // left the hand 20 cm from where it was, and back the next frame: 37, 36 and 26 cm off the
        // last. With none kept out of the body at all, the fold's own moves step up to 4.2 cm off
        // the last)
        for (const body of ["orc-bulkiest-f", "orc-shortest-f", "human-bulkiest-m"]) {
            const most = jumpOf(`rest/sentry/${FOLDED}`, body);

            assert.ok(most < 6.5, `${body}: a hand's step ${most.toFixed(2)} cm off the last`);
        }
    });

    it("has an orc raider with its cleaver pass the time with no jump in either hand: no step more than 3 cm off the last, in any of its ways", () => {
        // (Its arms folded round the cleaver, as it had them, its cleaver hand pushed out of the body
        // and back: 8.2 cm off the last)
        for (const variant of restWaysOf("orcRaider", true)) {
            const most = jumpiest(creature("orcRaider", "cleaver"), variant);

            assert.ok(most < 3, `${RESTS.sentry[variant].name}: a hand's step ${most.toFixed(2)} cm off the last`);
        }
    });

    it("never has one of the wilds' people-shaped fold its arms round the weapon in its hand, nor clasp its hands behind it: a sentry's other ways, and all of them for one unarmed", () => {
        const all = RESTS.sentry.map((_, variant) => variant);

        assert.ok(RESTS.sentry[FOLDED].handFree && RESTS.sentry[CLASPED].handFree);
        assert.equal(restsOf("orcRaider"), "sentry");
        assert.deepEqual(restWaysOf("orcRaider", true), all.filter((variant) => variant !== FOLDED && variant !== CLASPED));
        assert.deepEqual(restWaysOf("goblin", false), all);

        // (A bandit's an adventurer's ways, none of them wanting the hand free)
        assert.deepEqual(restWaysOf("bandit", true), RESTS.adventurer.map((_, variant) => variant));

        // (Left to itself, an armed raider passes the time only so, again and again)
        const raider = creature("orcRaider", "cleaver");
        const chosen = new Set();

        for (let k = 0; k < 24; k++) {
            raider.rest();
            chosen.add(raider.actions.attack.variant);
        }

        assert.deepEqual([...chosen].sort(), restWaysOf("orcRaider", true));
    });
});
