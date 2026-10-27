// Crash reports sent to a world server (client/js/app/crash-reports.js): a crash found on loading
// (app/telemetry.js recover) that was in a world on a world server (app/rejoin.js, where the player
// was, written moments before it) waits on the device with the debug log as it then stood, for
// that world alone; small enough for the server to take it; the newest few, and none for long;
// let go of once sent, or all of them when sending's turned off. Not for a friend's world, the
// player's own, or one they'd left.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crashedIn, crashesFor, CRASH_REPORTS, forgetCrashes, keepCrash, letGoCrash, REFUSED_FOR_GOOD, reportOf } from "../client/js/app/crash-reports.js";
import { inWorldOf, keepInWorld, lastInWorld, REJOIN } from "../client/js/app/rejoin.js";
import { SETTINGS_DEFAULTS } from "../client/js/app/save.js";
import { Telemetry, TELEMETRY } from "../client/js/app/telemetry.js";
import { CRASHES } from "../server/storage/crashes.js";

// (As much of localStorage as it uses)
const storage = () => {
    const kept = new Map();

    return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, String(value)), removeItem: (key) => kept.delete(key), kept };
};

const SERVER = Object.freeze({ kind: "server", server: "studio-mac.local:8480", world: "thornwick1", worldName: "Thornwick", serverName: "Tom's Mac mini", hero: 2, character: null, name: "Ada" });
const FRIEND = Object.freeze({ kind: "friend", code: "ABCD", broker: "wss://studio-mac.local:8480/broker", character: "c1", name: "Ada", host: "Wren" });
const HOSTING = Object.freeze({ kind: "hosting", code: "WXYZ", token: "t0k3n", broker: "wss://studio-mac.local:8480/broker", listed: true, character: "c1", name: "Ada" });
const WHERE = Object.freeze({ server: SERVER.server, world: SERVER.world, worldName: "Thornwick", serverName: "Tom's Mac mini" });

const AT = Date.UTC(2026, 9, 27, 11);
const crashAt = (ms) => ({ kind: "crash", summary: "The game stopped while playing and loaded again (reload)", at: new Date(ms).toISOString() });
const logOf = (...events) => ({ build: "b1", code: "abc1234567", built: null, events });

describe("crash reports to a world server (crash-reports.js)", () => {
    it("are sent unless they're turned off, the server refusing more than it lets the game send", () => {
        assert.equal(SETTINGS_DEFAULTS.sendCrashes, true);
        assert.ok(CRASH_REPORTS.bytes + 1024 <= CRASHES.bytes, "room for what's round it");
        assert.ok(CRASH_REPORTS.near >= 2 * REJOIN.every, "where they were is written oftener than that");
        assert.deepEqual(REFUSED_FOR_GOOD, ["bad-request", "too-big", "no-world"]);
    });

    it("know a crash was in a world on a world server from where the player was written moments before it", () => {
        const kept = storage();

        keepInWorld(kept, SERVER, AT - 4000);
        assert.deepEqual(crashedIn(lastInWorld(kept), crashAt(AT)), WHERE);
        assert.deepEqual(crashedIn(lastInWorld(kept), crashAt(AT - 4000 - CRASH_REPORTS.near)), WHERE, "as near before");

        // (Written long before it or after: they'd left it, or weren't in it then)
        assert.equal(crashedIn(lastInWorld(kept), crashAt(AT - 4000 + CRASH_REPORTS.near + 1)), null);
        assert.equal(crashedIn(lastInWorld(kept), crashAt(AT - 4000 - CRASH_REPORTS.near - 1)), null);

        // (A friend's world, their own open to friends, none: nothing to send it to)
        keepInWorld(kept, FRIEND, AT);
        assert.equal(crashedIn(lastInWorld(kept), crashAt(AT)), null);
        keepInWorld(kept, HOSTING, AT);
        assert.equal(crashedIn(lastInWorld(kept), crashAt(AT)), null);
        assert.equal(crashedIn(null, crashAt(AT)), null);
        assert.equal(crashedIn(lastInWorld(storage()), crashAt(AT)), null);
        assert.equal(crashedIn({ ...SERVER, at: AT }, { kind: "crash", at: "never" }), null);
    });

    it("know where the player was however long ago, forgetting nothing, before going back in's asked", () => {
        const kept = storage();

        keepInWorld(kept, SERVER, AT);
        assert.deepEqual(lastInWorld(kept), { ...SERVER, at: AT });
        assert.equal(inWorldOf(kept, AT + REJOIN.within), null, "too long ago to go back in");
        assert.equal(lastInWorld(kept), null, "and forgotten then");
        kept.setItem(REJOIN.key, "{ spoilt");
        assert.equal(lastInWorld(kept), null);
    });

    it("keep the debug log as it stood after the crash: the crash, and what was kept before it", () => {
        const kept = storage();
        const time = { now: 1000, clock: AT - 60000 };
        const before = new Telemetry({ storage: kept, now: () => time.now, clock: () => time.clock, build: "b1", code: "abc1234567" });

        // (Playing in Thornwick, a freeze kept, then the notes written, and the page fell over)
        before.playing = true;
        before.keep("freeze", { summary: "A freeze" });
        keepInWorld(kept, SERVER, time.clock);
        before.alive(() => ({ map: "town" }));

        const later = { now: 200, clock: AT };
        const after = new Telemetry({ storage: kept, now: () => later.now, clock: () => later.clock, build: "b1", code: "abc1234567" });
        const crash = after.recover("reload");
        const waiting = keepCrash(kept, crashedIn(lastInWorld(kept), crash), after.log(), AT);

        assert.deepEqual({ ...waiting, id: null }, { id: null, ...WHERE, at: AT, report: { build: "b1", code: "abc1234567", built: null, events: after.events } });
        assert.deepEqual(waiting.report.events.map(({ kind }) => kind), ["crash", "freeze"]);
        assert.deepEqual(crashesFor(kept, SERVER.server, SERVER.world, AT), [waiting]);
        assert.equal(JSON.parse(after.text()).events.length, 2, "the log copied as ever");
        assert.ok(TELEMETRY.kept <= CRASHES.events, "every event of the log taken by the server");
    });

    it("keep it small enough to send: the oldest events besides the crash left out, none if the crash alone is too big", () => {
        const big = (kind, n) => ({ kind, summary: `${kind} ${n}`, padding: "x".repeat(CRASH_REPORTS.bytes / 3) });
        const crash = { ...crashAt(AT), state: { map: "town" } };
        const whole = logOf(crash, big("freeze", 1), big("slow", 2), big("memory", 3), big("error", 4));
        const sent = reportOf(whole);

        assert.deepEqual(sent.events.map(({ summary }) => summary), [crash.summary, "freeze 1", "slow 2"], "the newest first, the oldest left out");
        assert.ok(new TextEncoder().encode(JSON.stringify(sent)).length <= CRASH_REPORTS.bytes);
        assert.equal(whole.events.length, 5, "the log itself left as it is");
        assert.deepEqual(reportOf(logOf(crash, { kind: "freeze" })), logOf(crash, { kind: "freeze" }), "one that fits, whole");
        assert.equal(reportOf(logOf({ ...crash, padding: "x".repeat(CRASH_REPORTS.bytes) })), null);
        assert.equal(reportOf(logOf({ kind: "freeze" })), null, "no crash in it");
        assert.equal(keepCrash(storage(), null, logOf(crash), AT), null, "nowhere to send it");
    });

    it("keep the newest few, each for its own world, none for long; let go once sent, or all when sending's turned off", () => {
        const kept = storage();
        const other = { ...WHERE, world: "hollowmere" };

        for (let n = 0; n < CRASH_REPORTS.kept + 2; n++) {
            keepCrash(kept, n % 2 ? other : WHERE, logOf(crashAt(AT + n)), AT + n);
        }

        const mine = crashesFor(kept, WHERE.server, WHERE.world, AT + 10);
        const theirs = crashesFor(kept, WHERE.server, "hollowmere", AT + 10);

        assert.equal(mine.length + theirs.length, CRASH_REPORTS.kept, "the newest few, the oldest let go");
        assert.deepEqual(mine.map(({ at }) => at - AT), [2, 4, 6], "the oldest first, to be sent in order");
        assert.deepEqual(theirs.map(({ at }) => at - AT), [3, 5]);
        assert.deepEqual(crashesFor(kept, "another-server:8480", WHERE.world, AT + 10), [], "another server's world of the same id: none");

        // (Sent: let go of; not sent within a while: let go of too)
        letGoCrash(kept, mine[0].id);
        assert.deepEqual(crashesFor(kept, WHERE.server, WHERE.world, AT + 10).map(({ at }) => at - AT), [4, 6]);
        assert.deepEqual(crashesFor(kept, WHERE.server, WHERE.world, AT + 4 + CRASH_REPORTS.within).map(({ at }) => at - AT), [6]);
        keepCrash(kept, WHERE, logOf(crashAt(AT + CRASH_REPORTS.within + 10)), AT + CRASH_REPORTS.within + 10);
        assert.equal(JSON.parse(kept.getItem(CRASH_REPORTS.key)).length, 1, "those waiting too long let go of as another's kept");

        // (Sending turned off: every one waiting let go of)
        forgetCrashes(kept);
        assert.equal(kept.getItem(CRASH_REPORTS.key), null);
        assert.deepEqual(crashesFor(kept, WHERE.server, WHERE.world, AT), []);
        kept.setItem(CRASH_REPORTS.key, "{ spoilt");
        assert.deepEqual(crashesFor(kept, WHERE.server, WHERE.world, AT), []);
    });
});
