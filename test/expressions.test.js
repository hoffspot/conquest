// The face's expressions (client/js/characters/expressions.js): Vitruvian's own FACS shapes for
// blinking, smiling and frowning, the mouth opened wide and its visemes for speaking, laid out once
// for the GPU, and a character's face eased towards what it's doing, with its blinks; the mouth's
// inside (teeth, gums and tongue: mouth.js); and the eyelashes (lashes.js), which swing with the
// lids and are drawn as strands
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readHumanData } from "../scripts/lib/human-data.js";
import { expressionData, EXPRESSIONS, Expressions, FACES } from "../client/js/characters/expressions.js";
import { lashTexture, lashUVs } from "../client/js/characters/lashes.js";
import { BODIES, motions } from "../client/js/characters/motioncheck.js";

const vitruvian = readHumanData("vitruvian");
const human = readHumanData("human");

// A random number generator that's the same every time
function seeded(seed = 1) {
    return () => {
        seed = (seed * 16807) % 2147483647;

        return seed / 2147483647;
    };
}

// Where a body's vertices are at rest, and its eyes' middles (left, right)
const at = (data, v) => [0, 1, 2].map((k) => data.basePositions[v * 3 + k]);
const eyes = [...new Set(Array.from(vitruvian.renderIndices("eyes"), (r) => vitruvian.renderSource[r]))];
const eyeMiddle = (side) => {
    const on = eyes.filter((v) => Math.sign(at(vitruvian, v)[0]) === side);

    return [0, 1, 2].map((k) => on.reduce((sum, v) => sum + at(vitruvian, v)[k], 0) / on.length);
};

describe("the face's expressions", () => {
    it("has Vitruvian's own, on its face alone, and none on MakeHuman's body", () => {
        assert.deepEqual([...vitruvian.expressions.keys()], EXPRESSIONS);
        assert.equal(human.expressions.size, 0);
        assert.equal(expressionData(human), null);

        const [, eyeY] = eyeMiddle(1);

        for (const [name, { vertices, deltas }] of vitruvian.expressions) {
            assert.ok(vertices.length > 100, `${name}: ${vertices.length} vertices`);
            assert.equal(deltas.length, vertices.length * 3);

            for (let i = 0; i < vertices.length; i++) {
                const [x, y, z] = at(vitruvian, vertices[i]);
                const move = Math.hypot(deltas[i * 3], deltas[i * 3 + 1], deltas[i * 3 + 2]) * vitruvian.deltaUnit;

                // (The face: from the chin to the top of the forehead, in front of the ears)
                assert.ok(Math.abs(x) < 0.09 && y > eyeY - 0.14 && y < eyeY + 0.13 && z > -0.02, `${name}: vertex ${vertices[i]} at ${[x, y, z].map((value) => value.toFixed(3))}`);
                // (No further than 2 cm: but the mouth opened wide, its jaw dropped 4 or 5)
                assert.ok(move < (name === "open" ? 0.05 : 0.02), `${name}: vertex ${vertices[i]} moves ${move.toFixed(4)} m`);
            }
        }
    });

    it("moves the middle of the face as either side of it: a shape's halves, added up, don't move it twice", () => {
        // (Its largest move on the middle, half way between the eyes (Vitruvian was moved a
        // millimetre or so to stand on MakeHuman's joints), within 0.3 mm of it, and beside it,
        // 1 to 6 mm off it: with the halves' middle moved twice, the brows raised moved it 16 mm,
        // beside it 7)
        const across = (eyeMiddle(1)[0] + eyeMiddle(-1)[0]) / 2;

        for (const [name, { vertices, deltas }] of vitruvian.expressions) {
            let middle = 0;
            let beside = 0;

            for (let i = 0; i < vertices.length; i++) {
                const x = Math.abs(at(vitruvian, vertices[i])[0] - across);
                const move = Math.hypot(deltas[i * 3], deltas[i * 3 + 1], deltas[i * 3 + 2]) * vitruvian.deltaUnit;

                middle = x < 0.0003 ? Math.max(middle, move) : middle;
                beside = x > 0.001 && x < 0.006 ? Math.max(beside, move) : beside;
            }

            assert.ok(middle < beside * 1.25 + 0.0005, `${name}: the middle moves ${(middle * 1000).toFixed(1)} mm, beside it ${(beside * 1000).toFixed(1)}`);
        }
    });

    it("shuts the eyes with a blink: the upper lids come down over them", () => {
        const { vertices, deltas } = vitruvian.expressions.get("blink");
        let lowest = 0;

        for (let i = 0; i < vertices.length; i++) {
            lowest = Math.min(lowest, deltas[i * 3 + 1] * vitruvian.deltaUnit);
        }

        assert.ok(lowest < -0.006, `the lids come down ${(-lowest * 1000).toFixed(1)} mm`);
    });

    it("opens the mouth onto its inside: the jaw drops, and the lower teeth and tongue with it", () => {
        const mouth = new Set(Array.from(vitruvian.renderIndices("mouth"), (r) => vitruvian.renderSource[r]));
        const { vertices, deltas } = vitruvian.expressions.get("open");
        let inside = 0;
        let lowest = 0;

        for (let i = 0; i < vertices.length; i++) {
            if (mouth.has(vertices[i])) {
                inside++;
                lowest = Math.min(lowest, deltas[i * 3 + 1] * vitruvian.deltaUnit);
            }
        }

        assert.ok(mouth.size > 1000 && inside > mouth.size / 3, `${inside} of the mouth's ${mouth.size} vertices move`);
        assert.ok(lowest < -0.02, `the lower teeth come down ${(-lowest * 1000).toFixed(1)} mm`);
    });

    it("keeps the mouth's inside behind the lips, closed, on every people's bodies at the ends of their builds", () => {
        const source = (part) => [...new Set(Array.from(vitruvian.renderIndices(part), (r) => vitruvian.renderSource[r]))];
        const skin = new Set(source("body"));
        const mouth = source("mouth").filter((v) => !skin.has(v));
        const motion = motions().find(({ id }) => id === "draw/sword");

        for (const body of [{ id: "default", shape: {} }, ...BODIES.map((one) => ({ id: one.id, shape: motion.look(one).shape }))]) {
            const { positions } = vitruvian.shape(body.shape);
            const p = (v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
            const [, mouthY] = p(mouth[0]);
            const front = Math.max(...mouth.map((v) => p(v)[2]));
            const near = [...skin].filter((v) => Math.abs(p(v)[0]) < 0.05 && Math.abs(p(v)[1] - mouthY) < 0.06 && p(v)[2] > front - 0.08);

            // (Before each of its vertices, the skin furthest forward there: none's in front of it.
            // Moved a centimetre forward, a few dozen show through, by up to 5 mm)
            for (const v of mouth) {
                const [x, y, z] = p(v);
                let ahead = -Infinity;

                for (const s of near) {
                    const [sx, sy, sz] = p(s);

                    if (Math.abs(sx - x) < 0.0025 && Math.abs(sy - y) < 0.0025) {
                        ahead = Math.max(ahead, sz);
                    }
                }

                assert.ok(ahead === -Infinity || z < ahead + 0.0005, `${body.id}: the mouth's vertex ${v} ${((z - ahead) * 1000).toFixed(1)} mm in front of the lips`);
            }
        }
    });

    it("seats the eyelashes on the lids: each card's roots on the lid's skin, not out in front of it", () => {
        const lashes = [...new Set(Array.from(vitruvian.renderIndices("lashes"), (r) => vitruvian.renderSource[r]))];
        const skin = [];

        for (let v = 0; v < vitruvian.vertexCount; v++) {
            if (vitruvian.partOf[v] === 0 && Math.hypot(...at(vitruvian, v).map((value, k) => value - eyeMiddle(Math.sign(at(vitruvian, v)[0]) || 1)[k])) < 0.02) {
                skin.push(at(vitruvian, v));
            }
        }

        const fromSkin = (v) => Math.min(...skin.map((p) => Math.hypot(...p.map((value, k) => value - at(vitruvian, v)[k]))));
        const fromMiddle = (v) => Math.hypot(...at(vitruvian, v).map((value, k) => value - eyeMiddle(Math.sign(at(vitruvian, v)[0]) || 1)[k]));
        // (The nearest the eye of each: the roots. Measured to the skin's nearest vertex, and the
        // skin's simplified, sparser at the eye's corners: set on the eyes alone, they were 4 to 6
        // mm off it)
        const off = [...lashes].sort((a, b) => fromMiddle(a) - fromMiddle(b)).slice(0, 40).map(fromSkin).sort((a, b) => a - b);

        assert.ok(off[20] < 0.0015, `half the roots ${(off[20] * 1000).toFixed(1)} mm or more off the lid`);
        assert.ok(off[39] < 0.003, `a root ${(off[39] * 1000).toFixed(1)} mm off the lid`);
    });

    it("swings the eyelashes with the lids, each card in one piece (not crumpled)", () => {
        const { vertices, deltas } = vitruvian.expressions.get("blink");
        const moves = new Map(Array.from(vertices, (v, i) => [v, [0, 1, 2].map((k) => deltas[i * 3 + k] * vitruvian.deltaUnit)]));
        const lashes = vitruvian.renderIndices("lashes");
        const moved = (v) => at(vitruvian, v).map((value, k) => value + (moves.get(v)?.[k] ?? 0));
        const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        const stretches = [];
        let down = 0;

        for (let t = 0; t < lashes.length; t += 3) {
            for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
                const [a, b] = [lashes[t + i], lashes[t + j]].map((r) => vitruvian.renderSource[r]);
                const before = distance(at(vitruvian, a), at(vitruvian, b));

                stretches.push(Math.abs(distance(moved(a), moved(b)) - before) / before);
                down = Math.min(down, moves.get(a)?.[1] ?? 0);
            }
        }

        // (Each column of a card turns as the lid's edge does the same way round the eye, its
        // neighbours a little differently: most at the eye's corners, where the edge turns least.
        // Moved as the lid's skin nearest them, an edge stretched by over 500%)
        stretches.sort((a, b) => b - a);
        assert.ok(down < -0.008, `the upper lashes come down ${(-down * 1000).toFixed(1)} mm`);
        assert.ok(stretches[0] < 1.5, `a lash's edge stretched or squeezed by ${(stretches[0] * 100).toFixed(0)}%`);
        assert.ok(stretches[Math.floor(stretches.length / 10)] < 0.25, `a tenth of the lashes' edges stretched or squeezed by ${(stretches[Math.floor(stretches.length / 10)] * 100).toFixed(0)}% or more`);
    });

    it("lays them out for the GPU once for a kit: a slot for each vertex they move, each slot's moves for each", () => {
        const data = expressionData(vitruvian);

        assert.equal(expressionData(vitruvian), data);
        assert.equal(data.slotOf.length, vitruvian.renderSource.length);

        const { width, height } = data.texture.image;

        assert.ok(width * height >= data.slots * EXPRESSIONS.length);

        // Each move where its slot says, and no slot for a vertex nothing moves
        const slotOf = new Map();

        vitruvian.renderSource.forEach((v, r) => slotOf.set(v, data.slotOf[r]));

        EXPRESSIONS.forEach((name, k) => {
            const { vertices, deltas } = vitruvian.expressions.get(name);

            vertices.forEach((v, i) => {
                const texel = (k * data.slots + slotOf.get(v)) * 4;

                for (let a = 0; a < 3; a++) {
                    assert.ok(Math.abs(data.texture.image.data[texel + a] - deltas[i * 3 + a] * vitruvian.deltaUnit) < 1e-7);
                }
            });
        });

        // A slot for every vertex an expression moves, and those whose facing it turns: a lid
        // closed is lit as one (the blink's turns about as far as a quarter turn)
        const anyMoved = new Set(EXPRESSIONS.flatMap((name) => [...vitruvian.expressions.get(name).vertices]));
        let turned = 0;

        vitruvian.renderSource.forEach((v, r) => assert.ok(data.slotOf[r] >= 0 || !anyMoved.has(v)));
        assert.ok(data.slots >= anyMoved.size);

        for (let slot = 0; slot < data.slots; slot++) {
            const at = ((EXPRESSIONS.length + EXPRESSIONS.indexOf("blink")) * data.slots + slot) * 4;

            turned = Math.max(turned, Math.hypot(...data.texture.image.data.subarray(at, at + 3)));
        }

        assert.ok(turned > 0.5 && turned < 2, `the blink turns a normal by ${turned.toFixed(2)}`);
    });
});

describe("a character's face (Expressions)", () => {
    const weight = (face, name) => face.weights.value[EXPRESSIONS.indexOf(name)];
    const play = (face, seconds, actions = {}, dt = 1 / 60) => {
        const seen = [];

        for (let t = 0; t < seconds; t += dt) {
            face.update(dt, actions);
            seen.push(weight(face, "blink"));
        }

        return seen;
    };

    it("blinks now and then: shut fast and opened again, every few seconds", () => {
        const face = new Expressions(seeded(3));
        const seen = play(face, 30);
        let blinks = 0;

        for (let i = 1; i < seen.length; i++) {
            if (seen[i] > 0.95 && seen[i - 1] <= 0.95) {
                blinks++;
            }
        }

        assert.ok(blinks >= 5 && blinks <= 20, `${blinks} blinks in 30 s`);
        assert.ok(seen.filter((value) => value > 0.5).length / seen.length < 0.08, "open most of the time");

        // Not when told not to
        face.blinks = false;
        assert.ok(play(face, 10).slice(30).every((value) => value < 0.01));
    });

    it("shows what it's doing: angry attacking, pained hurt, a smile talked to, eyes half shut dead", () => {
        const attack = { attack: { weapon: "sword" } };

        assert.equal(new Expressions().state(attack), "attacking");
        assert.equal(new Expressions().state({ attack: { rest: true } }), null);
        assert.equal(new Expressions().state({ reactions: [{}] }), "hurt");
        assert.equal(new Expressions().state({ fall: { end: 2 } }), "hurt");
        assert.equal(new Expressions().state({ fall: { end: Infinity } }), "dead");

        const face = new Expressions(seeded(5));

        play(face, 1, attack);
        assert.ok(Math.abs(weight(face, "angry") - FACES.attacking.angry) < 0.01);

        play(face, 1, { reactions: [{}] });
        assert.ok(Math.abs(weight(face, "squint") - FACES.hurt.squint) < 0.01 && weight(face, "angry") < 0.01);

        face.talking = true;

        const brows = [];

        for (let t = 0; t < 8; t += 1 / 60) {
            face.update(1 / 60, {});
            brows.push(weight(face, "browsUp"));
        }

        assert.ok(Math.max(...brows) > 0.3 && Math.min(...brows.slice(60)) < 0.05, "the brows lift now and then");
        assert.ok(Math.abs(weight(face, "smile") - FACES.talking.smile) < 0.01);

        face.talking = false;
        play(face, 2, { fall: { end: Infinity } });
        assert.ok(Math.abs(weight(face, "blink") - FACES.dead.blink) < 0.01, "dead: no blinking, the eyes left a little open");
    });

    it("speaks when talked to: a sound's shape of the mouth each syllable, in phrases, closed between them", () => {
        const face = new Expressions(seeded(11));
        const visemes = ["ah", "eh", "ee", "oo", "f"];
        let changes = 0;
        let closed = 0;
        let last = null;
        let jaw = 0;
        // (How far the jaw's dropped on each sound, at its loudest: the most)
        const dropped = Object.fromEntries(visemes.map((name) => [name, 0]));

        face.blinks = false;
        face.talking = true;

        for (let t = 0; t < 20; t += 1 / 60) {
            face.update(1 / 60, {});

            const loudest = visemes.reduce((best, name) => (weight(face, name) > weight(face, best) ? name : best));

            closed += weight(face, loudest) < 0.05 ? 1 : 0;
            changes += weight(face, loudest) > 0.3 && loudest !== last ? 1 : 0;
            last = weight(face, loudest) > 0.3 ? loudest : last;
            jaw = Math.max(jaw, weight(face, "open"));
            dropped[loudest] = weight(face, loudest) > 0.5 ? Math.max(dropped[loudest], weight(face, "open")) : dropped[loudest];
        }

        // (Syllables, a few a second; pauses between phrases, a third of the time or so; the jaw
        // dropping with each sound, most for an "ah", hardly for an "f", never as wide as a shout)
        assert.ok(changes > 40, `${changes} sounds in 20 s`);
        assert.ok(closed > 60 * 2 && closed < 60 * 12, `the mouth closed ${(closed / 60).toFixed(1)} s of 20`);
        assert.ok(jaw > 0.15 && jaw < 0.4, `the jaw dropped to ${jaw.toFixed(2)}`);
        assert.ok(dropped.ah > dropped.ee && dropped.ee > dropped.f, `the jaw dropped ${JSON.stringify(dropped)}`);

        face.talking = false;
        play(face, 1);
        assert.ok(visemes.every((name) => weight(face, name) < 0.01), "quiet once no longer talked to");
    });

    it("shouts now and then as an attack starts: the mouth open, its lips drawn back from the teeth, held a moment", () => {
        const face = new Expressions(seeded(13));
        let shouts = 0;

        face.blinks = false;

        for (let k = 0; k < 40; k++) {
            const attack = { attack: { weapon: "sword" } };
            let widest = 0;
            let bared = 0;

            for (let t = 0; t < 1; t += 1 / 60) {
                face.update(1 / 60, attack);
                widest = Math.max(widest, weight(face, "open"));
                bared = Math.max(bared, weight(face, "snarl"));
            }

            shouts += widest > 0.45 ? 1 : 0;
            assert.equal(widest > 0.45, bared > 0.7, "the teeth bared with the mouth opened");
        }

        assert.ok(shouts >= 5 && shouts <= 22, `${shouts} war cries in 40 attacks`);
        play(face, 1);
        assert.ok(weight(face, "open") < 0.01 && weight(face, "snarl") < 0.01, "the mouth closed again at rest");
    });

    it("shows its mood at rest: one of its faces, or weights of its own", () => {
        const face = new Expressions(seeded(7));

        face.blinks = false;
        face.mood = "smiling";
        play(face, 1);
        assert.ok(Math.abs(weight(face, "smile") - FACES.smiling.smile) < 0.01);

        face.mood = { sad: 0.7 };
        play(face, 1);
        assert.ok(Math.abs(weight(face, "sad") - 0.7) < 0.01 && weight(face, "smile") < 0.01);
    });
});

describe("the eyelashes' strands (lashes.js)", () => {
    it("lays each card out along its lid and out from its root to its tip, the rest as they are", () => {
        for (const data of [vitruvian, human]) {
            const uvs = lashUVs(data);
            const lashes = new Set(data.renderIndices("lashes"));

            assert.equal(lashUVs(data), uvs);
            assert.equal(uvs.length, data.uvs.length);

            for (let r = 0; r < data.renderSource.length; r++) {
                if (lashes.has(r)) {
                    // (A lower lid's out past the picture's top: shorter)
                    assert.ok(uvs[r * 2] >= 0 && uvs[r * 2] <= 1 && uvs[r * 2 + 1] >= 0 && uvs[r * 2 + 1] <= 2);
                } else {
                    assert.ok(uvs[r * 2] === data.uvs[r * 2] && uvs[r * 2 + 1] === data.uvs[r * 2 + 1]);
                }
            }

            // Roots and tips: the nearer the eye, the nearer the root
            const lashUV = [...lashes].map((r) => uvs[r * 2 + 1]);

            assert.ok(lashUV.filter((v) => v < 0.05).length > 10 && lashUV.filter((v) => v > 0.95).length > 10);
        }
    });

    it("draws strands, thick at their roots and thinning to their tips, with gaps between", () => {
        const { data, width, height } = lashTexture().image;
        const cover = (row) => {
            let sum = 0;

            for (let x = 0; x < width; x++) {
                sum += data[(row * width + x) * 4 + 1] / 255;
            }

            return sum / width;
        };

        assert.equal(lashTexture(), lashTexture());
        assert.ok(cover(0) > 0.25 && cover(0) < 0.75, `at the roots: ${cover(0).toFixed(2)}`);
        assert.ok(cover(height - 1) < cover(Math.floor(height / 2)) && cover(Math.floor(height / 2)) < cover(0));
        assert.equal(cover(height - 1), 0, "nothing at the top, which a lower lid's tips run past");
    });
});
