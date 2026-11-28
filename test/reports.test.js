// Reports of players and the chat log they read (generated/multiplayer_scaling_plan.md 6B-6):
// server/access/reports.js, server/storage/chatlog.js. The world's side is core/netplay.js
// Session's (test/netplay.test.js), and the whole of it a server's (test/world-server.test.js).

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { REPORT_WHYS } from "../client/js/core/netplay.js";
import { REPORT_WORDS } from "../client/js/app/partypanel.js";
import { keyOf, Reports, REPORTS, REPORTS_FILE } from "../server/access/reports.js";
import { CHAT_CHANNELS, ChatLog, CHATLOG, channelOf } from "../server/storage/chatlog.js";

const MINUTE = 60000;
const DAY = 86400000;

describe("reports of players and the chat log (server/access/reports.js, server/storage/chatlog.js)", () => {
    let root;
    let now;
    const clock = () => now;
    const fresh = async () => mkdtemp(path.join(root, "server-"));

    before(async () => {
        root = await mkdtemp(path.join(os.tmpdir(), "pellagos-reports-"));
    });

    after(async () => {
        await rm(root, { recursive: true, force: true });
    });

    it("keeps what's said a line a day's file, scrubbed, with who said it and to whom; gives a report the latest lines between two players; and deletes a day's file once it's thirty days old", async () => {
        const folder = await fresh();

        now = Date.parse("2026-11-01T12:00:00Z");

        const log = await ChatLog.open(folder, { clock });

        assert.deepEqual(CHATLOG, { folder: "chat", days: 30, recent: 400 });
        assert.deepEqual(CHAT_CHANNELS, ["party", "squad", "dm", "shout", "area"]);
        assert.deepEqual([{}, { shout: true }, { area: true }, { squad: true }, { dm: "world" }].map(channelOf), ["party", "shout", "area", "squad", "dm"]);

        // A line: kept as it's written, anything shaped like a key or a whole address taken out
        const kept = log.add("w1", { from: "A", identity: "id-a", name: "Ada", channel: "shout", text: "My key is ABCDE-FGHIJ-KLMNO and I'm at 203.0.113.77", to: ["B", "C", 7] });

        assert.deepEqual(kept, { at: "2026-11-01T12:00:00.000Z", from: "A", identity: "id-a", name: "Ada", channel: "shout", text: "My key is [key] and I'm at 203.0.113.x", to: ["B", "C"] });
        log.add("w1", { from: "B", name: "Bryn", channel: "dm", text: "Leave me be", to: ["A"] });
        log.add("w1", { from: "C", name: "Cass", channel: "area", text: "Hello!", quick: 13, to: ["A", "B"] });
        log.add("w2", { from: "A", name: "Ada", channel: "party", text: "Elsewhere", to: ["B"] });
        // (What isn't a line, or a world's id that could leave the folder: nothing)
        assert.equal(log.add("w1", { from: "A", channel: "megaphone", text: "No", to: [] }), null);
        assert.equal(log.add("../w1", { from: "A", channel: "shout", text: "No", to: [] }), null);
        await log.flush();
        assert.equal(log.error, null);

        const day = (await readFile(path.join(folder, "chat", "w1", "2026-11-01.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));

        assert.deepEqual(day.map((line) => [line.from, line.channel, line.quick ?? null]), [["A", "shout", null], ["B", "dm", null], ["C", "area", 13]]);
        assert.deepEqual(await readdir(path.join(folder, "chat")), ["w1", "w2"]);

        // Between two: said by one and gone to the other, in that world, the latest `most`
        assert.deepEqual(log.between("w1", "A", "B").map((line) => line.from), ["A", "B"]);
        assert.deepEqual(log.between("w1", "B", "C").map((line) => line.from), ["C"]);
        assert.deepEqual(log.between("w1", "A", "B", 1).map((line) => line.from), ["B"]);
        assert.deepEqual(log.between("w3", "A", "B"), []);

        // (Only so many of a world's latest in memory)
        for (let line = 0; line < CHATLOG.recent + 5; line++) {
            log.add("w4", { from: "A", channel: "shout", text: `Line ${line}`, to: ["B"] });
        }

        assert.deepEqual([log.recent.get("w4").length, log.recent.get("w4")[0].text], [CHATLOG.recent, "Line 5"]);

        // Thirty days on: the day's file still there on the thirtieth, gone the day after (as
        // the next day's first line is written, and as the log's opened)
        now += 30 * DAY;
        log.add("w1", { from: "A", channel: "shout", text: "A month on", to: [] });
        await log.flush();
        assert.deepEqual(await readdir(path.join(folder, "chat", "w1")), ["2026-11-01.jsonl", "2026-12-01.jsonl"]);
        now += DAY;
        log.add("w1", { from: "A", channel: "shout", text: "And a day", to: [] });
        await log.flush();
        assert.deepEqual(await readdir(path.join(folder, "chat", "w1")), ["2026-12-01.jsonl", "2026-12-02.jsonl"]);
        now += 40 * DAY;
        await mkdir(path.join(folder, "chat", "w9"), { recursive: true });
        await writeFile(path.join(folder, "chat", "w9", "notes.txt"), "not a day's file");
        await ChatLog.open(folder, { clock });
        assert.deepEqual(await readdir(path.join(folder, "chat", "w1")), []);
        assert.deepEqual(await readdir(path.join(folder, "chat", "w9")), ["notes.txt"], "(only a day's file is ever deleted)");
    });

    it("takes five reports an hour from one player; mutes whoever three different players report within ten minutes, till one's reviewed and the mute lifted; keeps reports twelve months, across a restart", async () => {
        const folder = await fresh();
        const one = (player, identity = null) => ({ player, identity, name: `Hero ${player}` });

        now = Date.parse("2026-11-01T12:00:00Z");

        let reports = await Reports.open(folder, { clock });
        const make = (by, about, why = "abuse", world = "w1") => reports.make({ world, by, about, why, lines: [{ from: about.player, text: "Words" }], places: { by: { x: 1, y: 2, map: "town" }, about: { x: 3, y: 4, map: "town" } } });

        assert.deepEqual(REPORTS, { hour: 5, hourMs: 3600000, lines: 20, reporters: 3, withinMs: 600000, months: 12, most: 2000 });
        assert.deepEqual([keyOf({ world: "w1", player: "A" }), keyOf({ world: "w1", player: "A", identity: "id-a" })], ["w1/A", "id-a"]);
        assert.deepEqual(reports.counts(), { waiting: 0, muted: 0 });

        // One made: kept whole
        assert.deepEqual(make(one("B"), one("A"), "underage"), { ok: true, id: "r1", muted: false });
        assert.deepEqual(reports.list().reports[0], {
            id: "r1", at: "2026-11-01T12:00:00.000Z", world: "w1", why: "underage",
            by: { player: "B", identity: null, name: "Hero B" }, about: { player: "A", identity: null, name: "Hero A" },
            lines: [{ from: "A", text: "Words" }], places: { by: { x: 1, y: 2, map: "town" }, about: { x: 3, y: 4, map: "town" } }, reviewed: null,
        });
        assert.ok(REPORT_WHYS.every((why) => make(one("Z"), one(`Y-${why}`), why).ok), "(for every reason there is)");
        // (For no reason there is, or of themselves: by who they are, not the name they came in by)
        assert.deepEqual(make(one("B"), one("A"), "because"), { ok: false, reason: "reportWhy" });
        assert.deepEqual(make(one("B"), one("B")), { ok: false, reason: "reportWho" });
        assert.deepEqual(make(one("B", "id-b"), one("Q", "id-b")), { ok: false, reason: "reportWho" });

        // Five an hour from one player (Z made five above, one for each reason): the sixth refused, till the hour's out
        assert.deepEqual(make(one("Z"), one("A")), { ok: false, reason: "reportMany" });
        assert.deepEqual(make(one("Z", "id-z"), one("A")), { ok: true, id: "r7", muted: false }, "(someone else, by who they are)");
        now += 61 * MINUTE;
        assert.equal(make(one("Z"), one("K")).ok, true);

        // Three different players of the same one within ten minutes: muted. The same player
        // again counts once, and one long ago not at all
        assert.equal(reports.isMuted("w1/A"), false);
        assert.deepEqual([make(one("C"), one("A")).muted, make(one("C"), one("A")).muted, make(one("D"), one("A")).muted], [false, false, false]);
        now += 9 * MINUTE;
        assert.deepEqual(make(one("E"), one("A")), { ok: true, id: "r12", muted: true });
        assert.equal(reports.isMuted("w1/A"), true);
        assert.equal(reports.isMuted("w2/A"), false, "(with no identity of their own, they're who they are in that world)");
        assert.deepEqual(make(one("F"), one("A")).muted, false, "(muted once)");
        assert.deepEqual(reports.list().muted, [{ key: "w1/A", since: new Date(now).toISOString(), name: "Hero A", reports: ["r9", "r10", "r11", "r12"] }]);

        // By their own identity: muted in every world of the server
        for (const by of ["C", "D", "E"]) {
            make(one(by), one("M", "id-m"), "spam", by === "E" ? "w2" : "w1");
        }

        assert.equal(reports.isMuted("id-m"), true);
        assert.deepEqual(reports.counts(), { waiting: reports.list().reports.length, muted: 2 });

        // Written, and read again by a server started later
        await reports.flush();
        assert.equal(reports.error, null);
        assert.equal(JSON.parse(await readFile(path.join(folder, REPORTS_FILE), "utf8")).reportsVersion, 1);
        reports = await Reports.open(folder, { clock });
        assert.equal(reports.isMuted("w1/A"), true);
        assert.equal(make(one("G"), one("A")).id, "r17", "(ids go on from where they were)");

        // Reviewed: marked so, the mute kept unless it's lifted; lifted on a second look
        assert.equal(await reports.review("r999", { by: "the admin" }), null);

        const kept = await reports.review("r12", { by: "the admin" });

        assert.deepEqual([kept.lifted, kept.report.reviewed], [false, { at: new Date(now).toISOString(), by: "the admin", lift: false }]);
        assert.equal(reports.isMuted("w1/A"), true);
        assert.equal((await reports.review("r12", { by: "the admin", lift: true })).lifted, true);
        assert.equal(reports.isMuted("w1/A"), false);
        assert.equal(reports.list({ waiting: true }).reports.some((report) => report.id === "r12"), false);
        assert.equal(reports.counts().muted, 1);

        // Twelve months on: let go of, as the server's started; a mute stays till it's lifted
        now += REPORTS.months * 30 * DAY + DAY;
        reports = await Reports.open(folder, { clock });
        assert.deepEqual([reports.list().reports.length, reports.isMuted("id-m")], [0, true]);

        // (The owner's runbook, by the numbers the code goes by, and the reasons by the Players tab's words)
        const runbook = await readFile(new URL("../docs/MODERATION.md", import.meta.url), "utf8");

        for (const words of ["## Reports from players", `**${["Zero", "One", "Two", "Three", "Four", "Five"][REPORTS.hour]} reports an hour**`, "**Three different players**", "**within ten minutes**", `last ${REPORTS.lines} lines`, `${CHATLOG.days} days old`, `kept ${REPORTS.months} months`, "/api/v1/server/reports", ...Object.values(REPORT_WORDS)]) {
            assert.ok(runbook.includes(words), words);
        }

        assert.deepEqual(Object.keys(REPORT_WORDS), REPORT_WHYS);
        assert.deepEqual([REPORTS.reporters, REPORTS.withinMs], [3, 10 * MINUTE]);

        // (A file of a version it doesn't read: refused, never read as none)
        await writeFile(path.join(folder, REPORTS_FILE), JSON.stringify({ reportsVersion: 2, reports: [] }));
        await assert.rejects(Reports.open(folder, { clock }), /version 2/);
    });
});
