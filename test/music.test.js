// The music: its scores (client/js/audio/score.js, the tavern's, a fight's and each people's) and
// the recordings of real instruments they're played on (instruments.js, samples.js, made by
// scripts/build-music.js)
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { baseFor, INSTRUMENTS, keysOf, sampleFiles, scoreFiles } from "../client/js/audio/instruments.js";
import { SAMPLES } from "../client/js/audio/samples.js";
import { BATTLE, BATTLE_BEATS_PER_BAR, BATTLE_TEMPO } from "../client/js/audio/battle.js";
import { CAT_FOLK } from "../client/js/audio/cat-folk.js";
import { CAVES } from "../client/js/audio/caves.js";
import { CRYPTS } from "../client/js/audio/crypts.js";
import { DARK_ELVES } from "../client/js/audio/dark-elves.js";
import { ELVES } from "../client/js/audio/elves.js";
import { HELL } from "../client/js/audio/hell.js";
import { LAIR } from "../client/js/audio/lair.js";
import { LIZARD_FOLK } from "../client/js/audio/lizard-folk.js";
import { NEST } from "../client/js/audio/nest.js";
import { ORCS } from "../client/js/audio/orcs.js";
import { RUINS } from "../client/js/audio/ruins.js";
import { BEATS_PER_BAR, midi, SCORE, TEMPO } from "../client/js/audio/score.js";
import { SCORES } from "../client/js/audio/scores.js";
import { FIRST, LANDS, PLACES } from "../client/js/audio/sound.js";
import { TAVERN, TAVERN_BEATS_PER_BAR, TAVERN_TEMPO } from "../client/js/audio/tavern.js";
import { harmony } from "../client/js/audio/writing.js";
import { decodeWav, regionsOf, vscoKey } from "../scripts/build-music.js";

const BAR = (BEATS_PER_BAR * 60) / TEMPO;
const MUSIC = new URL("../client/music/", import.meta.url);

describe("the score (score.js)", () => {
    it("is a song four minutes long: intro, verses, choruses, a bridge and an outro", () => {
        assert.equal(TEMPO, 96);
        assert.equal(BEATS_PER_BAR, 3);
        assert.ok(Math.abs(SCORE.length - 240) < 1e-9, `${SCORE.length} s`);
        assert.deepEqual(SCORE.sections.map(({ name }) => name), ["intro", "verse", "chorus", "verse", "chorus", "bridge", "quiet verse", "last chorus", "outro"]);
        assert.equal(SCORE.sections.reduce((bars, section) => bars + section.bars, 0) * BAR, SCORE.length);
        assert.ok(SCORE.sections.every((section, k) => k === 0 || section.bar === SCORE.sections[k - 1].bar + SCORE.sections[k - 1].bars));
    });

    it("writes every note in time, on an instrument, near a recording of it, in order", () => {
        assert.ok(SCORE.notes.length > 1500);

        for (const [k, note] of SCORE.notes.entries()) {
            const instrument = INSTRUMENTS[note.instrument];

            assert.ok(instrument, note.instrument);
            assert.ok(note.time >= 0 && note.time < SCORE.length, `${note.instrument} at ${note.time}`);
            assert.ok(k === 0 || note.time >= SCORE.notes[k - 1].time, "in time order");
            assert.ok(note.duration > 0 && note.velocity > 0 && note.velocity <= 1);

            if (instrument.kinds) {
                assert.ok(instrument.kinds.includes(note.pitch));
            } else {
                // Two semitones from a recording at most, but as far as an instrument's `reach`
                // where it says (the ocarina's lowest: the library's lowest is A4, and F4 plays it
                // four semitones down)
                const most = instrument.reach ?? 2;

                assert.ok(Math.abs(baseFor(note.instrument, note.pitch) - note.pitch) <= most, `${note.instrument} ${note.pitch}`);
            }
        }
    });

    it("has a tune in every section, and a band playing the choruses", () => {
        const melodic = ["recorder", "ocarina", "harp"];

        for (const section of SCORE.sections) {
            const start = section.start;
            const end = start + section.bars * BAR;
            const playing = new Set(SCORE.notes.filter(({ time }) => time >= start && time < end).map(({ instrument }) => instrument));

            assert.ok(melodic.some((name) => playing.has(name)), `${section.name} has a tune`);

            if (section.name.includes("chorus")) {
                assert.ok(playing.size >= 6, `${section.name}: ${[...playing]}`);
            }
        }

        // The bridge's harpsichord arpeggios
        const bridge = SCORE.sections.find(({ name }) => name === "bridge");

        assert.ok(SCORE.notes.some(({ instrument, time }) => instrument === "harpsichord" && time >= bridge.start && time < bridge.start + bridge.bars * BAR));
    });

    it("keeps to D Dorian, but for the A major chord's C sharp and the bridge's B flat", () => {
        const allowed = new Set([2, 4, 5, 7, 9, 11, 0, 1, 10]);
        const pitched = SCORE.notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds);
        const inKey = pitched.filter(({ pitch }) => allowed.has(pitch % 12));

        assert.equal(inKey.length, pitched.length);
        assert.equal(midi("D4"), 62);
        assert.equal(midi("C#5"), 73);
        assert.equal(midi("Bb3"), 58);
    });

    it("ends on A, leading back into D minor at the start: it loops without a seam", () => {
        const lastBar = SCORE.notes.filter(({ time }) => time >= SCORE.length - BAR);
        const firstBar = SCORE.notes.filter(({ time }) => time < BAR);
        const lowest = (notes) => notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds).reduce((low, note) => (note.pitch < low.pitch ? note : low));

        assert.equal(lowest(lastBar).pitch % 12, 9, "an A underneath at the end");
        assert.equal(lowest(firstBar).pitch % 12, 2, "a D underneath at the start");
        assert.ok(SCORE.length - SCORE.notes.at(-1).time + SCORE.notes[0].time < 0.5, "no pause between them");
    });
});

describe("the tavern's music (tavern.js)", () => {
    const bar = (TAVERN_BEATS_PER_BAR * 60) / TAVERN_TEMPO;
    const inSection = (section) => TAVERN.notes.filter(({ time }) => time >= section.start && time < section.start + section.bars * bar);

    it("is a jig in 6/8, about a minute and a half: strains of eight bars, each played twice", () => {
        assert.equal(TAVERN_TEMPO, 108);
        assert.equal(TAVERN_BEATS_PER_BAR, 2);
        assert.deepEqual(TAVERN.sections.map(({ name }) => name), ["intro", "A", "A again", "B", "B again", "C", "C again", "A on the lute", "break", "last A", "last B", "outro"]);
        assert.ok(TAVERN.sections.filter(({ name }) => /^(last )?[ABC]( again)?$/.test(name)).every(({ bars }) => bars === 8));
        assert.equal(TAVERN.sections.reduce((bars, section) => bars + section.bars, 0) * bar, TAVERN.length);
        assert.ok(TAVERN.length > 85 && TAVERN.length < 100, `${TAVERN.length} s`);
        assert.ok(TAVERN.sections.every((section, k) => k === 0 || section.bar === TAVERN.sections[k - 1].bar + TAVERN.sections[k - 1].bars));
    });

    it("is led by the lute in every strain, with a recorder, a frame drum and a tambourine, every note in time and near a recording", () => {
        assert.deepEqual([...new Set(TAVERN.notes.map(({ instrument }) => instrument))].sort(), ["drum", "guitar", "recorder", "tambourine"]);

        for (const section of TAVERN.sections) {
            assert.ok(inSection(section).some(({ instrument }) => instrument === "guitar"), section.name);
        }

        for (const [k, note] of TAVERN.notes.entries()) {
            assert.ok(note.time >= 0 && note.time < TAVERN.length);
            assert.ok(k === 0 || note.time >= TAVERN.notes[k - 1].time, "in time order");
            assert.ok(note.duration > 0 && note.velocity > 0 && note.velocity <= 1);

            if (!INSTRUMENTS[note.instrument].kinds) {
                assert.ok(Math.abs(baseFor(note.instrument, note.pitch) - note.pitch) <= 2, `${note.instrument} ${note.pitch}`);
            }
        }

        // Lively: the drums on every beat of the full strains, and a quaver's lilt in the tune
        const full = TAVERN.sections.find(({ name }) => name === "last B");
        const hits = inSection(full).filter(({ instrument }) => instrument === "drum");

        assert.ok(hits.length >= full.bars * 4);
    });

    it("keeps to D Mixolydian, with a C sharp only over A major and in the B minor strain", () => {
        const pitched = TAVERN.notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds);
        const allowed = new Set([2, 4, 6, 7, 9, 11, 0, 1]);

        assert.ok(pitched.every(({ pitch }) => allowed.has(pitch % 12)));

        const sharp = new Set(TAVERN.sections.filter((section) => inSection(section).some(({ instrument, pitch }) => !INSTRUMENTS[instrument].kinds && pitch % 12 === 1)).map(({ name }) => name));

        assert.deepEqual([...sharp].sort(), ["C", "C again", "break", "intro", "outro"]);
    });

    it("ends on A, leading back into D at the start: it loops without a seam", () => {
        const lowest = (notes) => notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds).reduce((low, note) => (note.pitch < low.pitch ? note : low));

        // (Bars' first notes are played a moment early or late, as players do)
        assert.equal(lowest(TAVERN.notes.filter(({ time }) => time >= TAVERN.length - bar - 0.01)).pitch % 12, 9);
        assert.equal(lowest(TAVERN.notes.filter(({ time }) => time < bar - 0.01)).pitch % 12, 2);
        assert.ok(TAVERN.length - TAVERN.notes.at(-1).time + TAVERN.notes[0].time < 0.5);
    });
});

describe("a fight's music (battle.js)", () => {
    const bar = (BATTLE_BEATS_PER_BAR * 60) / BATTLE_TEMPO;
    const inSection = (section) => BATTLE.notes.filter(({ time }) => time >= section.start && time < section.start + section.bars * bar);
    const pitched = BATTLE.notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds);

    it("is martial, in 4/4 at 132, about a minute and a half: the cellos, the horns' theme, the theme high, a second tune, the drums, everyone, the turn", () => {
        assert.equal(BATTLE_TEMPO, 132);
        assert.equal(BATTLE_BEATS_PER_BAR, 4);
        assert.deepEqual(BATTLE.sections.map(({ name }) => name), ["cellos", "theme", "theme high", "second tune", "drums", "everyone", "turn"]);
        assert.equal(BATTLE.sections.reduce((bars, section) => bars + section.bars, 0) * bar, BATTLE.length);
        assert.ok(BATTLE.length > 80 && BATTLE.length < 100, `${BATTLE.length} s`);
        assert.ok(BATTLE.sections.every((section, k) => k === 0 || section.bar === BATTLE.sections[k - 1].bar + BATTLE.sections[k - 1].bars));
        assert.ok(SCORES.battle === BATTLE && SCORES.town === SCORE && SCORES.tavern === TAVERN);
    });

    it("writes every note in time, on an instrument, near a recording of it, in order", () => {
        assert.ok(BATTLE.notes.length > 1200);

        for (const [k, note] of BATTLE.notes.entries()) {
            const instrument = INSTRUMENTS[note.instrument];

            assert.ok(instrument, note.instrument);
            assert.ok(note.time >= 0 && note.time < BATTLE.length, `${note.instrument} at ${note.time}`);
            assert.ok(k === 0 || note.time >= BATTLE.notes[k - 1].time, "in time order");
            assert.ok(note.duration > 0 && note.velocity > 0 && note.velocity <= 1);

            if (instrument.kinds) {
                assert.ok(instrument.kinds.includes(note.pitch));
            } else {
                assert.ok(Math.abs(baseFor(note.instrument, note.pitch) - note.pitch) <= 2, `${note.instrument} ${note.pitch}`);
            }
        }
    });

    it("opens on the cellos galloping alone, no drums; then drives on: the cellos galloping, the timpani, the march and the horns in every section after", () => {
        const [opening, ...rest] = BATTLE.sections;
        // (Not the theme's first notes, a few milliseconds early as players are)
        const opens = inSection(opening).filter(({ time }) => time < opening.start + opening.bars * bar - 0.05);

        assert.deepEqual([...new Set(opens.map(({ instrument }) => instrument))], ["cello"]);
        assert.equal(opens.length, opening.bars * 8, "a bar's eight quavers, every bar");

        for (const section of rest) {
            const played = new Set(inSection(section).map(({ instrument }) => instrument));

            assert.ok(["cello", "timpani", "snare", "bassdrum", "horn"].every((instrument) => played.has(instrument)), section.name);

            // (The cellos in quavers: a bar's eight, every bar; a hundredth of a second either
            // side of the bars' edges, as the times are added up)
            const cellos = BATTLE.notes.filter(({ instrument, time }) => instrument === "cello" && time >= section.start - 0.01 && time < section.start + section.bars * bar - 0.01);

            assert.equal(cellos.length, section.bars * 8, section.name);
        }
    });

    it("is played softly, never harsh: no drum hit loud, the horns held in their middle register", () => {
        const loudest = (instrument) => Math.max(...BATTLE.notes.filter((note) => note.instrument === instrument).map(({ velocity }) => velocity));

        assert.ok(loudest("snare") < 0.6 && loudest("bassdrum") < 0.8, `${loudest("snare")}, ${loudest("bassdrum")}`);
        assert.ok(loudest("horn") <= 0.9);

        const horns = pitched.filter(({ instrument }) => instrument === "horn").map(({ pitch }) => pitch);

        assert.ok(Math.min(...horns) >= midi("A2") && Math.max(...horns) <= midi("D4"), `${Math.min(...horns)} to ${Math.max(...horns)}`);
    });

    it("keeps to D minor, its A chords major (a C sharp leading home)", () => {
        const allowed = new Set([2, 4, 5, 7, 9, 10, 0, 1]);

        assert.ok(pitched.every(({ pitch }) => allowed.has(pitch % 12)), [...new Set(pitched.map(({ pitch }) => pitch % 12))].join());
    });

    it("ends on A, leading back into D at the start: it loops without a seam", () => {
        const lowest = (notes) => notes.filter(({ instrument }) => !INSTRUMENTS[instrument].kinds).reduce((low, note) => (note.pitch < low.pitch ? note : low));

        assert.equal(lowest(BATTLE.notes.filter(({ time }) => time >= BATTLE.length - bar - 0.01)).pitch % 12, 9);
        assert.equal(lowest(BATTLE.notes.filter(({ time }) => time < bar - 0.01)).pitch % 12, 2);
        assert.ok(BATTLE.length - BATTLE.notes.at(-1).time + BATTLE.notes[0].time < 0.5);
    });
});

describe("each people's music in their own lands (elves.js, dark-elves.js, cat-folk.js, lizard-folk.js, orcs.js)", () => {
    // Each one's score, its people, its tempo and bar (beats), the pitch classes it keeps to, and
    // what plays it
    const PEOPLES = {
        elves: { score: ELVES, people: "elf", tempo: 168, beatsPerBar: 6, keeps: [5, 7, 9, 11, 0, 2, 4] },
        darkElves: { score: DARK_ELVES, people: "darkElf", tempo: 60, beatsPerBar: 4, keeps: [4, 5, 7, 9, 11, 0, 2] },
        catFolk: { score: CAT_FOLK, people: "cat", tempo: 208, beatsPerBar: 8, keeps: [7, 9, 11, 0, 2, 4, 6] },
        lizardFolk: { score: LIZARD_FOLK, people: "lizard", tempo: 176, beatsPerBar: 8, keeps: [9, 11, 0, 2, 4, 6, 7] },
        orcs: { score: ORCS, people: "orc", tempo: 100, beatsPerBar: 4, keeps: [7, 9, 10, 0, 2, 3, 5, 6] },
    };
    const barOf = ({ tempo, beatsPerBar }) => (beatsPerBar * 60) / tempo;
    const inBar = (score, n) => score.notes.filter(({ time }) => time >= n * barOf(score) - 0.02 && time < (n + 1) * barOf(score) - 0.02);
    const bars = (score) => Array.from({ length: Math.round(score.length / barOf(score)) }, (_, n) => inBar(score, n));

    it("is each people's own, heard in their lands (the humans' the town's): a minute and a half to two minutes and a bit, its sections one after another", () => {
        assert.deepEqual(LANDS, { human: "town", elf: "elves", darkElf: "darkElves", cat: "catFolk", lizard: "lizardFolk", orc: "orcs" });

        for (const [name, { score, people, tempo, beatsPerBar }] of Object.entries(PEOPLES)) {
            assert.equal(SCORES[name], score, name);
            assert.equal(LANDS[people], name);
            assert.deepEqual([score.tempo, score.beatsPerBar], [tempo, beatsPerBar], name);
            assert.ok(score.length > 90 && score.length < 140, `${name}: ${score.length} s`);
            assert.ok(Math.abs(score.sections.reduce((all, section) => all + section.bars, 0) * barOf(score) - score.length) < 1e-9, name);
            assert.ok(score.sections.every((section, k) => k === 0 || section.bar === score.sections[k - 1].bar + score.sections[k - 1].bars), name);
        }
    });

    it("writes every note in time, on an instrument, near a recording of it, in order; nothing loud", () => {
        for (const [name, { score }] of Object.entries(PEOPLES)) {
            assert.ok(score.notes.length > 200, name);

            for (const [k, note] of score.notes.entries()) {
                const instrument = INSTRUMENTS[note.instrument];

                assert.ok(instrument, `${name}: ${note.instrument}`);
                assert.ok(note.time >= 0 && note.time < score.length, `${name}: ${note.instrument} at ${note.time}`);
                assert.ok(k === 0 || note.time >= score.notes[k - 1].time, `${name}: in time order`);
                assert.ok(note.duration > 0 && note.velocity > 0 && note.velocity <= 0.9, `${name}: ${note.instrument} at ${note.velocity}`);

                if (instrument.kinds) {
                    assert.ok(instrument.kinds.includes(note.pitch), `${name}: ${note.instrument} ${note.pitch}`);
                } else {
                    assert.ok(Math.abs(baseFor(note.instrument, note.pitch) - note.pitch) <= (instrument.reach ?? 2), `${name}: ${note.instrument} ${note.pitch}`);
                }
            }
        }
    });

    it("keeps to its mode: the elves' F Lydian, the dark elves' E Phrygian, the cat folk's G major (their tunes on its five notes), the lizard folk's A Dorian, the orcs' G minor", () => {
        for (const [name, { score, keeps }] of Object.entries(PEOPLES)) {
            const strays = score.notes.filter(({ instrument, pitch }) => !INSTRUMENTS[instrument].kinds && !keeps.includes(pitch % 12));

            assert.deepEqual(strays, [], name);
        }

        const tunes = CAT_FOLK.notes.filter(({ instrument }) => ["ocarina", "balafon"].includes(instrument));

        assert.ok(tunes.every(({ pitch }) => [7, 9, 11, 2, 4].includes(pitch % 12)), "the cat folk's tunes: G A B D E");
        assert.deepEqual(harmony([[midi("E5"), 1], [null, 1], [midi("B4"), 2]], [7, 9, 11, 2, 4]), [[midi("B4"), 1], [null, 1], [midi("G4"), 2]], "two of the five below");
    });

    it("sounds like its people: the elves' flute, harp and violins with no drums; the dark elves' organ droning on E all through; the cat folk's kalimba and hand drums; the lizard folk's marimba going round over a drone on A; the orcs' brass and war drums", () => {
        const plays = (score) => new Set(score.notes.map(({ instrument }) => instrument));

        assert.ok(["flute", "harp", "violins"].every((instrument) => plays(ELVES).has(instrument)));
        assert.ok([...plays(ELVES)].every((instrument) => !INSTRUMENTS[instrument].kinds), "no drums");

        // (The drone in every bar, never moving, under bells and the flute)
        assert.ok(bars(DARK_ELVES).every((notes) => notes.some(({ instrument, pitch }) => instrument === "pipeorgan" && pitch === midi("E2"))));
        assert.ok(["bells", "flute", "celli", "vibes"].every((instrument) => plays(DARK_ELVES).has(instrument)));

        // (The kalimba every bar but the drums', the hand drums every bar)
        assert.ok(bars(CAT_FOLK).every((notes) => notes.some(({ instrument }) => instrument === "conga") && notes.some(({ instrument }) => instrument === "bongos")));
        assert.ok(bars(CAT_FOLK).filter((notes) => notes.filter(({ instrument }) => instrument === "kalimba").length >= 8).length >= bars(CAT_FOLK).length - 4);

        // (The marimba's figure the same eight quavers each bar, over the drone on A)
        assert.ok(bars(LIZARD_FOLK).every((notes) => notes.filter(({ instrument }) => instrument === "marimba").length >= 8 && notes.some(({ instrument, pitch }) => instrument === "pipeorgan" && pitch === midi("A2"))));

        // (The war drums stamping every bar but the brass's calls, each answered by the drums the
        // bar after; the brass in every section)
        const calls = ORCS.sections.find(({ name }) => name === "the calls");

        assert.ok(bars(ORCS).every((notes, n) => notes.some(({ instrument }) => instrument === "bassdrum") || (n >= calls.bar && n < calls.bar + calls.bars && (n - calls.bar) % 2 === 0)));
        assert.ok(ORCS.sections.every((section) => ORCS.notes.some(({ instrument, time }) => ["horn", "trombone"].includes(instrument) && time >= section.start && time < section.start + section.bars * barOf(ORCS))));
        assert.ok(plays(ORCS).has("toms") && plays(ORCS).has("cello"));
    });
});

describe("each kind of dungeon's music (caves.js, crypts.js, nest.js, lair.js, ruins.js, hell.js)", () => {
    // Each one's score, where it's heard, and the pitch classes it keeps to
    const DUNGEONS = {
        caves: { score: CAVES, places: ["cave"], keeps: [9, 11, 0, 2, 4, 5, 7] },
        crypts: { score: CRYPTS, places: ["crypt"], keeps: [2, 4, 5, 7, 9, 10, 0, 1] },
        nest: { score: NEST, places: ["nest"], keeps: [4, 5, 7, 9, 11, 0, 2, 3, 6, 8, 10, 1] },
        lair: { score: LAIR, places: ["lair"], keeps: [0, 2, 3, 5, 7, 8, 10, 11] },
        ruins: { score: RUINS, places: ["ruin", "tower"], keeps: [2, 4, 5, 7, 9, 10, 0, 1] },
        hell: { score: HELL, places: ["hellBreach", "hellBone", "hellFire", "hellPit"], keeps: [9, 11, 0, 2, 4, 5, 7, 8, 6, 3, 1] },
    };

    it("is each its own, heard where it is (not the land's), every note in time, near a recording (as low as it's played), and soft", () => {
        for (const [name, { score, places }] of Object.entries(DUNGEONS)) {
            assert.equal(SCORES[name], score, name);
            assert.ok(places.every((place) => PLACES[place].score === name), name);
            assert.ok(score.length > 60 && score.length < 170, `${name}: ${score.length} s`);

            for (const shift of score.shifts ?? [0]) {
                for (const note of score.notes) {
                    const instrument = INSTRUMENTS[note.instrument];
                    const pitch = instrument.kinds ? note.pitch : note.pitch + shift;

                    assert.ok(note.time >= 0 && note.time < score.length && note.velocity > 0 && note.velocity <= 0.9, `${name}: ${note.instrument} at ${note.time}`);
                    assert.ok(instrument.kinds ? instrument.kinds.includes(pitch) : Math.abs(baseFor(note.instrument, pitch) - pitch) <= (instrument.reach ?? 2), `${name} (${shift}): ${note.instrument} ${pitch}`);
                }
            }
        }
    });

    it("keeps to its mode: a cave's A minor, a crypt's D minor, the nest's creeping half steps, the lair's C minor, a ruin's D minor (the town's verse, flattened), a hell's A minor and its half steps falling", () => {
        for (const [name, { score, keeps }] of Object.entries(DUNGEONS)) {
            const strays = score.notes.filter(({ instrument, pitch }) => !INSTRUMENTS[instrument].kinds && !keeps.includes(pitch % 12));

            assert.deepEqual(strays, [], name);
        }

        // (A ruin's tune the town's verse, its B naturals flattened)
        const tune = RUINS.notes.filter(({ instrument }) => instrument === "recorder").map(({ pitch }) => pitch);

        assert.ok(tune.length > 40 && tune.every((pitch) => pitch % 12 !== 11));
    });

    it("sounds like its place: a cave dripping, the crypt's bells and organ, the nest's plucked cellos creeping, the lair's great heart, a hell's bass only ever falling, played lower in each realm down", () => {
        const plays = (score) => new Set(score.notes.map(({ instrument }) => instrument));

        assert.ok(["kalimba", "marimba", "celli"].every((instrument) => plays(CAVES).has(instrument)));
        assert.ok(["bells", "pipeorgan", "organ", "flute"].every((instrument) => plays(CRYPTS).has(instrument)));
        assert.ok(plays(NEST).has("pizzicato") && plays(NEST).has("slitdrum"));
        assert.ok(LAIR.notes.filter(({ instrument }) => instrument === "bassdrum").length >= 2 * (LAIR.length / ((4 * 60) / LAIR.tempo)) - 1);

        const falling = HELL.notes.filter(({ instrument }) => instrument === "celli").map(({ pitch }) => pitch);

        assert.ok(falling.every((pitch, k) => k === 0 || pitch <= falling[k - 1] || pitch === midi("A3")), "the cellos' bass never rises but to begin again");
        assert.deepEqual(HELL.shifts, [0, -2, -4, -7]);
    });
});

describe("every score loops without a seam (scores.js)", () => {
    it("starts at once, plays up to its end, and never goes a bar without a new note", () => {
        for (const [name, score] of Object.entries(SCORES)) {
            const bar = (score.beatsPerBar * 60) / score.tempo;
            const times = score.notes.map(({ time }) => time);
            const longest = Math.max(...times.slice(1).map((time, k) => time - times[k]));

            assert.ok(times[0] < 0.05, `${name} starts at ${times[0]}`);
            assert.ok(score.length - times.at(-1) <= bar / 2 + 0.05, `${name}'s last note ${score.length - times.at(-1)} s before its end`);
            assert.ok(longest < bar + 0.05, `${name}: ${longest.toFixed(2)} s without a note`);
        }
    });
});

describe("the instruments (instruments.js, samples.js)", () => {
    it("has recordings of every instrument the music plays, and of every kind of drum hit", () => {
        const played = new Set(Object.values(SCORES).flatMap(({ notes }) => notes).map(({ instrument }) => instrument));

        assert.deepEqual([...played].sort(), Object.keys(INSTRUMENTS).sort());
        assert.deepEqual(Object.keys(SAMPLES).sort(), Object.keys(INSTRUMENTS).sort());

        for (const [name, instrument] of Object.entries(INSTRUMENTS)) {
            if (instrument.kinds) {
                assert.deepEqual(SAMPLES[name].map(({ kind }) => kind), instrument.kinds, name);
            } else {
                assert.ok(keysOf(name).length >= 2, name);
            }
        }
    });

    it("plays each note from the nearest recording (a drum's kind of hit, as it is)", () => {
        assert.deepEqual(keysOf("recorder"), [65, 70, 74, 78, 82, 86]);
        assert.equal(baseFor("recorder", 66), 65);
        assert.equal(baseFor("recorder", 69), 70);
        assert.equal(baseFor("recorder", 81), 82);
        assert.equal(baseFor("drum", "low"), "low");
    });

    it("keeps every recording in client/music, as a small MP3, and nothing else", () => {
        const files = sampleFiles();
        const listed = new Set(files.map(([, url]) => url.pathname.split("/").pop()));
        let bytes = 0;

        assert.equal(files.length, Object.values(SAMPLES).flat().length);
        assert.equal(new Set(files.map(([id]) => id)).size, files.length, "one each");
        assert.deepEqual(readdirSync(MUSIC).sort(), [...listed].sort());

        for (const [id, url] of files) {
            const data = readFileSync(url);

            // An MP3 frame's sync word, and a name that changes with what's in it
            assert.ok(data[0] === 0xff && (data[1] & 0xe0) === 0xe0, `${id}: an MP3`);
            assert.match(url.pathname, /\/[a-z]+-[a-z0-9]+\.[0-9a-f]{8}\.mp3$/);
            assert.ok(statSync(url).size < 40_000, `${id}: small`);
            bytes += data.length;
        }

        // (Downloaded at the start, only the recordings the town's, the tavern's and a fight's
        // play: about 1.2 MB for the town's and the tavern's, and 300 KB more for a fight's; each
        // other score's own the first time it's wanted, under 800 KB, a hell's and the lizard
        // folk's the most; about 3.4 MB in all)
        const sizeOf = (files) => files.reduce((all, [, url]) => all + statSync(url).size, 0);
        const first = new Map(FIRST.flatMap((name) => scoreFiles(SCORES[name])));

        assert.deepEqual(FIRST, ["town", "tavern", "battle"]);
        assert.ok(sizeOf([...first]) < 1_600_000, `${sizeOf([...first])} bytes at the start`);

        for (const [name, score] of Object.entries(SCORES)) {
            const own = scoreFiles(score).filter(([id]) => !first.has(id));

            assert.ok(sizeOf(own) < 800_000, `${name}'s own: ${sizeOf(own)} bytes`);
        }

        // (Every recording some score plays)
        assert.deepEqual(new Set(Object.values(SCORES).flatMap((score) => scoreFiles(score).map(([id]) => id))), new Set(files.map(([id]) => id)));
        assert.ok(bytes < 3_700_000, `${bytes} bytes in all`);
    });
});

describe("making the recordings (scripts/build-music.js)", () => {
    it("reads VSCO 2 CE's notes from its files' names, an octave under the usual names (its C3 is middle C)", () => {
        assert.equal(vscoKey("C3"), 60);
        assert.equal(vscoKey("D2"), 50);
        assert.equal(vscoKey("A#1"), 46);
        assert.equal(vscoKey("A0"), 33);
    });

    it("reads the library's SFZ files: each recording, its note, where it starts, its tuning, and whether it's a note's release", () => {
        const regions = regionsOf(`// Made by a tool
<group>
ampeg_release=0.3

<region>
sample=Recorder/Sus/Alto_F3.wav
pitch_keycenter=65
offset=1002
tune=-2

<group>
trigger=release

<region>
sample=Recorder/Sus/Alto_G#3.wav
pitch_keycenter=68
`);

        assert.deepEqual(regions, [
            { sample: "Recorder/Sus/Alto_F3.wav", key: 65, offset: 1002, tune: -2, trigger: "attack" },
            { sample: "Recorder/Sus/Alto_G#3.wav", key: 68, offset: 0, tune: 0, trigger: "release" },
        ]);
    });

    it("reads its WAV files, 16 and 24 bit, mono and stereo, mixed to one channel", () => {
        // A WAV file of `frames` [left, right] pairs
        const wav = (bits, channels, frames) => {
            const width = bits / 8;
            const data = Buffer.alloc(frames.length * channels * width);

            frames.forEach((frame, n) => frame.slice(0, channels).forEach((value, channel) => data.writeIntLE(Math.round(value * (2 ** (bits - 1) - 1)), (n * channels + channel) * width, width)));

            const format = Buffer.alloc(16);

            format.writeUInt16LE(1, 0);
            format.writeUInt16LE(channels, 2);
            format.writeUInt32LE(44100, 4);
            format.writeUInt32LE(44100 * channels * width, 8);
            format.writeUInt16LE(channels * width, 12);
            format.writeUInt16LE(bits, 14);

            const chunk = (id, body) => Buffer.concat([Buffer.from(id), Buffer.from(Uint32Array.of(body.length).buffer), body]);

            return Buffer.concat([Buffer.from("RIFF"), Buffer.from(Uint32Array.of(0).buffer), Buffer.from("WAVE"), chunk("fmt ", format), chunk("data", data)]);
        };

        const mono = decodeWav(wav(16, 1, [[0.5], [-0.25]]));
        const stereo = decodeWav(wav(24, 2, [[0.5, 0.25], [-1, 0]]));

        assert.equal(mono.rate, 44100);
        assert.ok(Math.abs(mono.samples[0] - 0.5) < 1e-3 && Math.abs(mono.samples[1] + 0.25) < 1e-3);
        assert.ok(Math.abs(stereo.samples[0] - 0.375) < 1e-4 && Math.abs(stereo.samples[1] + 0.5) < 1e-4);
    });
});
