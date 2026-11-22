// A recorded session in a replicated world played again (core/recording.js; the scaling plan's
// 3-32): the bytes a game's link took, with what its game did and its clock, kept in
// test/fixtures/views/1.json.gz (npm run record:view) and given here to a new link with no
// server and no world played. It comes to just what the recording came to; and a recording with
// a frame gone, or a command, doesn't.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { gunzipSync } from "node:zlib";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { EVENT, Recorder, RECORDING_VERSION, replay, spanOf } from "../client/js/core/recording.js";
import { VIEW_VERSION } from "../client/js/core/view.js";
import { Viewing } from "../client/js/core/viewing.js";
import { VIEW_FIXTURE } from "../scripts/record-view.js";

const AGAIN = "made again with `npm run record:view` (contribution.md, the version numbers)";
const recording = JSON.parse(gunzipSync(readFileSync(VIEW_FIXTURE)).toString("utf8"));
// (One world for every link here to be kept in: never stepped, so it's shared between them)
const worlds = new Map();
const attach = (link, welcome) => {
    const key = `${welcome.seed}:${welcome.race}`;

    link.attach(new Host(worlds.get(key) ?? worlds.set(key, buildWorld({ seed: welcome.seed, race: welcome.race })).get(key), { populate: false }), welcome);
};
const count = (events, kind) => events.filter(([, each]) => each === kind).length;

describe("a recorded session in a replicated world (core/recording.js)", () => {
    it("is of this version of the game's views, and of a session worth playing again: walking, a door, a fight, a page hidden and shown", () => {
        assert.equal(recording.version, RECORDING_VERSION);
        assert.equal(recording.view, VIEW_VERSION, `the recording's of view frames of version ${recording.view}: ${AGAIN}`);
        // (Of whatever NET_VERSION it was made at: a link reads a view's welcome and words of any,
        // so a bump for lockstep's sake doesn't ask for it to be made again)
        assert.ok(Number.isInteger(recording.net) && recording.net <= NET_VERSION);

        const { ms, frames } = spanOf(recording);

        assert.ok(ms >= 30000 && frames >= 600, `${ms} ms, ${frames} frames`);
        assert.equal(count(recording.events, EVENT.hello), 1);
        assert.ok(count(recording.events, EVENT.command) >= 5);
        assert.deepEqual(recording.events.filter(([, kind]) => kind === EVENT.away).map(([, , hidden]) => hidden), [true, false]);
        assert.ok(count(recording.events, EVENT.step) >= frames, "a step played for every frame");
        assert.ok(recording.events.every(([time], k) => k === 0 || time >= recording.events[k - 1][0]), "in the order of its clock");
        // (And it came somewhere: its hero and others known of, the fight heard, its view told again)
        assert.ok(recording.end.known.length >= 5 && recording.end.known.some(({ id }) => id === recording.end.me));
        assert.deepEqual(recording.end.faults, []);
        assert.equal(recording.end.resyncs, 1);
        assert.ok(recording.end.heard.hit >= 1 && recording.end.heard.cross >= 2 && recording.end.heard.open >= 1, JSON.stringify(recording.end.heard));
    });

    it("played again with no server comes to what it came to: everyone its mirror knows of where they were, its steps and its game's events the same, each command answered", () => {
        const played = replay(recording, { attach });

        assert.deepEqual(played.end, recording.end);
        assert.ok(played.link.mirror && played.link.host.battle.actor(played.end.me), "its hero's in its world");
        assert.equal(played.end.played * STEP_MS, played.link.host.battle.time, "its world's time is its last frame's");
        // (What it said to its world as it went: its hello, then each command in its turn, and
        // the frames it had seen)
        assert.deepEqual([played.sent[0].kind, played.sent[0].mode, played.sent[0].version], ["hello", "view", NET_VERSION]);

        const commands = recording.events.filter(([, kind]) => kind === EVENT.command).map(([, , command]) => command);

        assert.deepEqual(played.sent.filter(({ kind }) => kind === "command").map(({ command }) => command), commands);
        assert.equal(played.results.length, commands.length, "what came of each was heard");
        assert.ok(played.results.every((result) => result?.ok === true), JSON.stringify(played.results));
        assert.ok(played.sent.filter(({ kind }) => kind === "seen").length >= played.end.frames / 2 - 2);
        assert.ok(played.sent.filter(({ kind }) => kind === "again").length >= 1, "its view asked for again as its page was shown");
    });

    it("is held to: with a frame of its fight gone, or a command, what's played again differs", () => {
        const frames = recording.events.map(([, kind], k) => (kind === EVENT.frame ? k : -1)).filter((k) => k >= 0);
        // (A frame from the middle, where its hero's walking or fighting)
        const gone = frames[Math.floor(frames.length / 3)];
        const without = replay({ ...recording, events: recording.events.filter((_, k) => k !== gone) }, { attach });

        assert.notDeepEqual(without.end, recording.end);
        assert.equal(without.end.frames, recording.end.frames - 1);

        const first = recording.events.findIndex(([, kind]) => kind === EVENT.command);
        const unasked = replay({ ...recording, events: recording.events.filter((_, k) => k !== first) }, { attach });

        // (Its commands are numbered one behind the answers now, and each answer comes before the
        // command of its number is given: none is heard)
        assert.equal(unasked.sent.filter(({ kind }) => kind === "command").length, count(recording.events, EVENT.command) - 1);
        assert.equal(unasked.results.length, 0);
    });

    it("won't play a recording of another format, nor an event of a kind it doesn't know", () => {
        assert.throws(() => replay({ ...recording, version: RECORDING_VERSION + 1 }, { attach }), /A recording of version 2, where 1 is read/);
        assert.throws(() => replay({ ...recording, events: [[0, "?"]] }, { attach }), /of a kind that isn't read/);
    });
});

describe("a link recorded as it's used (core/recording.js Recorder)", () => {
    it("notes what comes to the link and what its game does to it, at the link's own time, and leaves each doing as it did", () => {
        const said = [];
        let now = 100;
        const link = new Viewing({ send: (text) => said.push(JSON.parse(text)), clock: () => now });
        const recorder = new Recorder(link, { clock: () => now });

        link.hello({ hero: { name: "Ann" } }, { hero: "new" });
        now = 150;
        link.ready();
        link.command({ type: "stop" });
        now = 200;
        link.hear('{"kind":"pong","t":150}');
        link.frame(Uint8Array.of(1, 2, 3));
        assert.equal(link.step(), null, "nothing to play before it has a world");
        link.ping();

        const taken = recorder.take();

        assert.deepEqual(taken.events, [
            [100, EVENT.hello, { character: { hero: { name: "Ann" } }, hero: "new" }],
            [150, EVENT.ready],
            [150, EVENT.command, { type: "stop" }],
            [200, EVENT.heard, '{"kind":"pong","t":150}'],
            [200, EVENT.frame, "AQID"],
            [200, EVENT.step],
            [200, EVENT.ping],
        ]);
        assert.deepEqual([taken.version, taken.net, taken.view], [RECORDING_VERSION, NET_VERSION, VIEW_VERSION]);
        // (And the link did each: its hello, ready, command and ping all said)
        assert.deepEqual(said.map(({ kind }) => kind), ["hello", "ready", "command", "ping"]);
        assert.equal(said[0].hero, "new");
        assert.deepEqual(taken.end, { me: null, played: -1, frames: 0, dropped: 0, resyncs: 0, faults: [], known: [], open: [], gold: null, heard: {} });
    });
});
