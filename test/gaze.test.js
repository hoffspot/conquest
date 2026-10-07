// Where a character's looking (client/js/characters/gaze.js): its eyes and head turned towards
// something, the head most of the way and the eyes the rest, within their ranges; ahead, glancing
// about, at what's behind it or with nothing to look at; not at all when it's down; and the eyes'
// middles, about which they turn
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readHumanFiles } from "../scripts/lib/human-data.js";

// (The eyes' picture is put on a canvas: enough of one for that in Node)
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
const { Character } = await import("../client/js/characters/character.js");
const { SkinAtlas } = await import("../client/js/characters/skin.js");
const { GAZE } = await import("../client/js/characters/gaze.js");
const { jointAngles } = await import("../client/js/characters/rig.js");

const humanFiles = readHumanFiles();
const human = new HumanData(humanFiles.manifest, humanFiles.data);
const atlas = new SkinAtlas(human, {}, 128);
const DEG = Math.PI / 180;

// A random number generator that's the same every time
function seeded(seed = 1) {
    return () => {
        seed = (seed * 16807) % 2147483647;

        return seed / 2147483647;
    };
}

// Someone standing at the middle of the world facing +z, with a gaze that glances the same way
// every time
function someone() {
    const character = new Character({ human, atlas }, { hairDetail: 0.2 });

    character.gaze.random = seeded(7);

    return character;
}

// A point `turn` degrees to its left and `up` degrees up from its eyes, `far` metres off
function around(character, turn, up = 0, far = 3) {
    const eyes = character.height * 0.935;

    return new THREE.Vector3(Math.sin(turn * DEG) * Math.cos(up * DEG) * far, eyes + Math.sin(up * DEG) * far, Math.cos(turn * DEG) * Math.cos(up * DEG) * far);
}

// Looking for `seconds`, a frame at a time
function look(character, point, seconds = 2) {
    character.gaze.at(point);

    for (let t = 0; t < seconds; t += 1 / 30) {
        character.gaze.update(1 / 30);
    }
}

// How far round (degrees, to its left) and up its head's turned from how it stands at rest, as
// its gaze turns its neck and head
function headTurned(character) {
    const rig = character.rig;
    const head = rig.bone("Head");
    const rest = new THREE.Quaternion();
    const turned = new THREE.Quaternion();

    rig.reset();
    rig.apply();
    character.object.updateMatrixWorld(true);
    head.getWorldQuaternion(rest);
    rig.reset();
    character.gaze.turn();
    rig.apply();
    character.object.updateMatrixWorld(true);
    head.getWorldQuaternion(turned);

    const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(turned.multiply(rest.invert()));

    return { turn: Math.atan2(ahead.x, ahead.z) / DEG, up: Math.asin(ahead.y) / DEG };
}

describe("a character's gaze", () => {
    it("turns its eyes and head towards what it looks at, the head most of the way, the eyes the rest", () => {
        const character = someone();

        look(character, around(character, 40, 10));

        const { head, eyes } = character.gaze;

        assert.ok(Math.abs(head.turn - 40 * GAZE.share) < 1, `head ${head.turn.toFixed(1)}°`);
        assert.ok(Math.abs(head.turn + eyes.turn - 40) < 1, `head and eyes ${(head.turn + eyes.turn).toFixed(1)}°`);
        assert.ok(Math.abs(head.up + eyes.up - 10) < 1, `up ${(head.up + eyes.up).toFixed(1)}°`);

        // (Its eyes turned in the shader by as much, to its left, +x)
        const gazing = new THREE.Vector3(0, 0, 1).applyMatrix3(character.gaze.uniforms.turn.value);

        assert.ok(Math.abs(Math.atan2(gazing.x, gazing.z) / DEG - eyes.turn) < 0.5);
        assert.ok(Math.abs(Math.asin(gazing.y) / DEG - eyes.up) < 0.5);

        // (Its head turned by its neck and head as far, on top of its pose)
        const turned = headTurned(character);

        assert.ok(Math.abs(turned.turn - head.turn) < 3, `head drawn turned ${turned.turn.toFixed(1)}° for ${head.turn.toFixed(1)}°`);
        assert.ok(Math.abs(turned.up - head.up) < 3, `head drawn up ${turned.up.toFixed(1)}° for ${head.up.toFixed(1)}°`);
    });

    it("turns no further than its neck, head and eyes can, and the eyes get there first", () => {
        const character = someone();
        const gaze = character.gaze;

        // (A moment in, the eyes have gone further than the head)
        look(character, around(character, -60), 0.15);
        assert.ok(gaze.eyes.turn < gaze.head.turn * 0.5 && gaze.head.turn < 0, `eyes ${gaze.eyes.turn.toFixed(1)}°, head ${gaze.head.turn.toFixed(1)}°`);

        look(character, around(character, 100, -60), 3);
        assert.ok(gaze.head.turn <= GAZE.head.turn + 1e-6 && gaze.eyes.turn <= GAZE.eyes.turn + 1e-6, `${gaze.head.turn}, ${gaze.eyes.turn}`);
        assert.ok(gaze.head.up >= -GAZE.head.down - 1e-6 && gaze.eyes.up >= -GAZE.eyes.down - 1e-6, `${gaze.head.up}, ${gaze.eyes.up}`);

        // (And its joints within their ranges, turned as far as they go)
        const rig = character.rig;

        rig.reset();
        gaze.turn();

        for (const name of ["Neck", "Head"]) {
            const { kind, side } = rig.joints[rig.index.get(name)];
            const { turn } = jointAngles(kind, side, rig.rotations[rig.index.get(name)]);

            assert.ok(turn <= 30 + 1e-3, `${name} ${turn.toFixed(1)}°`);
        }
    });

    it("looks ahead, glancing about now and then, at what's behind it or with nothing to look at", () => {
        const character = someone();
        const gaze = character.gaze;
        const glances = new Set();

        look(character, around(character, 160), 2);

        for (let k = 0; k < 20; k++) {
            look(character, null, 1);
            glances.add(Math.round(gaze.head.turn + gaze.eyes.turn));
            assert.ok(Math.abs(gaze.head.turn + gaze.eyes.turn) <= GAZE.glance.turn + 0.5, `${(gaze.head.turn + gaze.eyes.turn).toFixed(1)}°`);
        }

        // (Not staring at one thing: it glances about, and as often straight ahead)
        assert.ok(glances.size >= 4, [...glances].join());
    });

    it("doesn't look at anything when it's down, its head and eyes eased back ahead", () => {
        const character = someone();
        const gaze = character.gaze;

        look(character, around(character, 45));
        gaze.on = false;
        look(character, around(character, 45), 2);

        assert.ok(gaze.weight < 0.01 && Math.abs(gaze.head.turn) < 1, `weight ${gaze.weight}, head ${gaze.head.turn}`);

        const gazing = new THREE.Vector3(0, 0, 1).applyMatrix3(gaze.uniforms.turn.value);

        assert.ok(gazing.z > 0.9999);

        // (Its pose left as it is)
        const rig = character.rig;

        rig.reset();
        gaze.turn();
        assert.ok(rig.rotations[rig.index.get("Head")].angleTo(new THREE.Quaternion()) < 0.01);
    });

    it("turns its eyes about their middles: one each side of its face, level, at the front of its head", () => {
        const character = someone();

        look(character, around(character, 20));

        const { left, right } = character.gaze.uniforms;
        const eyes = character.height * 0.935;

        assert.ok(left.value.x > 0.02 && left.value.x < 0.05 && right.value.x < -0.02 && right.value.x > -0.05, `${left.value.x}, ${right.value.x}`);
        assert.ok(Math.abs(left.value.y - right.value.y) < 0.003 && Math.abs(left.value.y - eyes) < 0.05, `${left.value.y}, ${right.value.y}`);
        assert.ok(Math.abs(left.value.z - right.value.z) < 0.003 && left.value.z > 0.05, `${left.value.z}, ${right.value.z}`);

        // (Found again when its body's reshaped)
        const before = left.value.y;

        character.setShape({ macro: { height: 0.9 } });
        look(character, around(character, 20), 0.1);
        assert.notEqual(left.value.y, before);
    });
});
