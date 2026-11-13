// The world authority's load (scripts/load.js; generated/multiplayer_scaling_plan.md 0-2): where
// its players are put by each layout, how it knows the navigation can't keep all the tiles they
// want, and what its report holds (its schema), over a short run of a small world. The numbers
// themselves are a machine's (npm run load); what's checked here is the same on any.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { DAY } from "../client/js/core/daytime.js";
import { DELVES } from "../client/js/core/dungeons/play.js";
import { KEEP_TILES, MOST_TILES, TILE } from "../client/js/core/navigation.js";
import { buildWorld, Overworld } from "../client/js/core/overworld.js";
import { BATTLE_KINDS, BATTLE_PASSES, COUNTERS, FLUSH_PASSES, HOST_PASSES, probing } from "../client/js/core/probe.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { ACTIVITY_SCHEMAS, checkReport, doorsOf, failuresOf, layoutOf, LEAVE_SCHEMA, load, LOAD, REPORT_SCHEMA, STEP_SCHEMA, tilesWanted, UNBUILT_SCHEMA, wordsOf } from "../scripts/load.js";
import { AHEAD, Ahead } from "../server/ahead.js";
import { KEEPER } from "../server/keeper.js";

describe("the load's layouts (scripts/load.js layoutOf)", () => {
    let plan;

    before(() => {
        plan = buildWorld({ seed: 2 }).plan;
    });

    it("spread: each player in a settlement of their own, of its people, the same ones every time, none near another", () => {
        const homes = layoutOf(plan, 100, "spread");
        const least = Math.min(...homes.flatMap((a, k) => homes.slice(k + 1).map((b) => Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]))));

        assert.equal(new Set(homes.map(({ place }) => place)).size, 100);
        assert.equal(homes[0].place, startFor(plan, "human").id);
        assert.ok(homes.every(({ race, place }) => plan.places.find(({ id }) => id === place).race === race));
        assert.deepEqual(layoutOf(plan, 100, "spread"), homes);
        assert.deepEqual(layoutOf(plan, 8, "spread"), homes.slice(0, 8), "more players leave the first where they were");
        // (192 m: as far as anything's kept for a player, the plan's view distance)
        assert.ok(least > 192 + 2 * LOAD.roam, `no two within sight of one another, wherever they walk (the nearest two ${Math.round(least)} m apart)`);
    });

    it("towns: four to a town; one-town: all in the humans' first", () => {
        const towns = layoutOf(plan, 25, "towns");
        const counts = new Map();

        towns.forEach(({ place }) => counts.set(place, (counts.get(place) ?? 0) + 1));
        assert.deepEqual([...counts.values()], [4, 4, 4, 4, 4, 4, 1]);
        assert.ok([...counts.keys()].every((id) => LOAD.towns.includes(plan.places.find((place) => place.id === id).kind)));

        const one = layoutOf(plan, 50, "one-town");

        assert.deepEqual([...new Set(one.map(({ place }) => place))], [startFor(plan, "human").id]);
        assert.ok(one.every(({ race }) => race === "human"));
    });

    it("says so when the world hasn't the settlements, or there's no such layout", () => {
        assert.throws(() => layoutOf(plan, plan.places.length + 1, "spread"), /settlements for \d+ players in the spread layout/);
        assert.throws(() => layoutOf(plan, 8, "scattered"), /No layout called scattered: spread, towns, one-town/);
    });

    it("knows how many tiles its players want round them, and when that's more than the navigation takes: not at 25 spread, as it was, but at 50", () => {
        const places = (players) => layoutOf(plan, players, "spread").map(({ at }) => at);
        const eight = tilesWanted(places(8), { tile: TILE, keep: KEEP_TILES });
        const twentyFive = tilesWanted(places(25), { tile: TILE, keep: MOST_TILES, spare: AHEAD.spareTiles });
        const fifty = tilesWanted(places(50), { tile: TILE, keep: MOST_TILES, spare: AHEAD.spareTiles });

        assert.equal(eight.capped, false, `${eight.wanted} wanted, ${KEEP_TILES} kept`);
        assert.ok(twentyFive.wanted > 2 * KEEP_TILES, "more than the 1,024 it kept, whoever was in");
        assert.equal(twentyFive.capped, false, `${twentyFive.wanted} wanted and ${AHEAD.spareTiles} to spare, ${MOST_TILES} taken`);
        assert.equal(fifty.capped, true);
        assert.equal(tilesWanted(places(8), { tile: TILE, keep: eight.wanted + 10, spare: 11 }).capped, true, "what's to spare counted");
        // (Two players in one place want the same tiles)
        assert.equal(tilesWanted([[500, 500], [500, 500]], { tile: 32, keep: 8, reach: 32 }).wanted, 9);
        assert.equal(tilesWanted([[500, 500]], { tile: 32, keep: 8, reach: 32 }).capped, true);
    });
});

describe("the load's report (scripts/load.js load, checkReport)", () => {
    let report;

    before(async () => {
        // (Every step taken for late, `lateOver` 0: what's kept of a late step is then the same
        // on any machine)
        report = await load({ seed: 2, players: 8, layout: "one-town", activity: "fights", seconds: 15, lateOver: 0 });
    });

    it("holds everything its schema says, each of its type, and survives being written out", () => {
        assert.deepEqual(checkReport(report), []);
        assert.deepEqual(checkReport(JSON.parse(JSON.stringify(report))), []);
        assert.equal(report.schema, LOAD.schema);
        assert.deepEqual(report.run, { seed: 2, players: 8, layout: "one-town", activity: "fights", seconds: 15, whole: false, leave: "none", sudden: false, node: process.version, platform: process.platform, arch: process.arch, cpus: report.run.cpus });
        assert.equal(report.built, true);
    });

    it("says what's wrong with one that doesn't", () => {
        const broken = { ...structuredClone(report), named: "most", steps: { ...report.steps, wall: { ...report.steps.wall, p99: NaN } }, passes: { ...report.passes, battle: { ms: 1 } } };

        delete broken.snapshot;

        assert.deepEqual(checkReport(broken).sort(), ["report.named: not a number", "report.passes.battle.calls: missing", "report.passes.battle.mean: missing", "report.passes.battle.share: missing", "report.snapshot: missing", "report.steps.wall.p99: not a number"]);
        assert.deepEqual(checkReport(null), ["report: not an object"]);
    });

    it("played every step asked for with everyone in, heard and sent by the wire alone, and timed each pass by name", () => {
        const steps = (15 * 1000) / STEP_MS;

        assert.equal(report.steps.count, steps);
        assert.equal(report.counts.steps, steps);
        assert.equal(report.joined.players, 8);
        assert.deepEqual(report.problems, []);
        assert.equal(report.warm.settled, true);
        assert.equal(report.navigation.capped, false);

        // (Every pass of the step and of what's sent, under the names core/probe.js gives)
        assert.deepEqual(HOST_PASSES.filter((name) => !report.passes[name]), []);
        assert.deepEqual(FLUSH_PASSES.filter((name) => !report.passes[name]), []);
        assert.equal(report.passes.battle.calls, steps);

        // (The battle's step by its parts, and all of them together; who's in it, by kind: the
        // eight players standing in the one town, the town's folk and soldiers round them)
        assert.deepEqual(Object.keys(report.passes).filter((name) => name.startsWith("battle.") && !BATTLE_PASSES.includes(name)), []);
        assert.equal(report.passes["battle.fight"].calls, steps);
        assert.ok(report.battle.ms >= report.passes["battle.fight"].ms + report.passes.battle.ms && report.battle.share > 0 && report.battle.share < 1);
        assert.deepEqual(Object.keys(report.census), ["player", ...BATTLE_KINDS]);
        assert.equal(report.census.player.all, 8);
        assert.equal(Object.values(report.census).reduce((sum, { all }) => sum + all, 0), report.actors.end);
        assert.ok(report.census.routine.all > 0 && report.census.patrol.all > 0);

        for (const { all, indoors, m30, m60, m120, m250, beyond } of Object.values(report.census)) {
            assert.equal(indoors + m30 + m60 + m120 + m250 + beyond, all);
        }

        assert.equal(report.counts["battle.actors"], BATTLE_KINDS.reduce((sum, kind) => sum + report.counts[`battle.actors.${kind}`], 0));
        assert.deepEqual(Object.keys(report.counts).filter((name) => !COUNTERS.includes(name)), []);
        assert.ok(report.named >= 0.9 && report.named <= 1, `named passes ${report.named} of the steps' time (the plan's 90%)`);
        assert.equal(probing(), false, "the probes taken out again");

        // (What each was sent: what was done, their own hero, and an answer to each asking)
        assert.deepEqual(Object.keys(report.bytes.byKind), ["ops", "pong", "self"]);
        assert.equal(report.bytes.byKind.ops.messages, steps * 8);
        assert.equal(report.bytes.byKind.pong.messages, 15 * 8);
        assert.equal(report.bytes.total, report.bytes.byKind.ops.bytes + report.bytes.byKind.pong.bytes + report.bytes.byKind.self.bytes);
        assert.ok(report.bytes.perPeer.mean > 0 && report.bytes.perPeer.most >= report.bytes.perPeer.mean && report.bytes.perPeer.worstSecond >= report.bytes.perPeer.most);
        assert.equal(report.bytes.up.refused, 0);
        assert.ok(report.snapshot.bytes > 10000 && report.joined.welcome.bytes.mean > 10000);
    });

    it("keeps a late step with its parts: when, how long, each pass's time in it by name and what each counter went up by, the first LOAD.late of them", () => {
        const steps = (15 * 1000) / STEP_MS;
        const { late } = report;

        // (generated/multiplayer_scaling_plan.md 0-13: every step over `over` counted, the
        // first 32 kept)
        assert.equal(LOAD.late, 32);
        assert.deepEqual({ over: late.over, count: late.count, kept: late.kept.length }, { over: 0, count: steps, kept: LOAD.late });
        assert.deepEqual(late.kept.map(({ at }) => at), Array.from({ length: LOAD.late }, (_, k) => k * STEP_MS));

        for (const step of late.kept) {
            assert.deepEqual(checkReport(step, STEP_SCHEMA), []);
            assert.deepEqual(Object.keys(step), Object.keys(STEP_SCHEMA));

            // (Its passes by the names the probes give, the longest first, none of no time;
            // together no more than the step, and most of it)
            const passes = Object.entries(step.passes);
            const named = passes.reduce((sum, [, ms]) => sum + ms, 0);

            assert.deepEqual(passes.map(([name]) => name).filter((name) => ![...HOST_PASSES, ...FLUSH_PASSES, ...BATTLE_PASSES].includes(name)), []);
            assert.ok(passes.every(([, ms], k) => ms > 0 && (k === 0 || ms <= passes[k - 1][1])), "the longest first");
            assert.ok(passes.some(([name]) => name.startsWith("battle.")) && step.passes.battle > 0);
            assert.ok(named <= step.wall + 0.05 && step.hear >= 0 && step.hear <= step.wall, `${named} of ${step.wall}`);

            // (What the counters went up by in that one step: the step itself, everyone in the
            // battle gone through once, and none that didn't change)
            assert.equal(step.counts.steps, 1);
            assert.equal(step.counts["battle.actors"], BATTLE_KINDS.reduce((sum, kind) => sum + (step.counts[`battle.actors.${kind}`] ?? 0), 0));
            assert.ok(Object.values(step.counts).every((n) => n !== 0));
            assert.deepEqual(Object.keys(step.counts).filter((name) => !COUNTERS.includes(name)), []);

            // (And what it made for itself: none, in a town whose ground was made in the warm-up)
            assert.deepEqual(step.made, { chunks: 0, tiles: 0, floors: 0 });
        }

        // (The look round, twice a second, is in the steps it falls in and no other)
        assert.deepEqual(late.kept.filter(({ passes }) => "lookAround" in passes).map(({ at }) => at % 500), [450, 450, 450]);
        assert.equal(late.kept.reduce((sum, { counts }) => sum + counts.steps, 0), LOAD.late);

        // (Held to its schema, each kept step too; and said in a line)
        assert.deepEqual(checkReport({ ...report, late: { ...late, kept: [{ ...late.kept[0], wall: "long" }, late.kept[1]] } }), ["report.late.kept.0.wall: not a number"]);
        assert.deepEqual(checkReport({ ...report, late: { over: 0, count: 0 } }), ["report.late.kept: missing"]);
        assert.ok(wordsOf(report).some((line) => line.startsWith(`Late: ${steps} steps over 0 ms, the first 32 kept: 0.00 s `)), "said in a line");
    });

    it("began the fight it was asked for, ten seconds in", () => {
        assert.deepEqual({ type: report.event.type, at: report.event.at, asked: report.event.asked, ok: report.event.ok }, { type: "fights", at: LOAD.eventAt, asked: 1, ok: true });
        assert.ok(report.event.actors >= 2 * LOAD.fightSize);
        assert.ok(report.actors.most >= report.actors.start + report.event.actors);
    });

    it("fails, for the nightly run, only by what's the same on any machine, or a mean step over a ceiling no working world reaches", () => {
        assert.deepEqual(failuresOf(report), []);
        assert.deepEqual(failuresOf(report, { ceiling: 50 }), []);

        const slow = { ...report, steps: { ...report.steps, cpu: { ...report.steps.cpu, mean: 61.25 } } };
        const out = { ...report, problems: ["2 of the players were sent out of the world", "the navigation takes 4096 tiles at most (core/navigation.js MOST_TILES) and these 50 players want 6050 baked round them"] };

        assert.deepEqual(failuresOf(slow, { ceiling: 50 }), ["the mean step took 61.3 ms of the thread's time, over the ceiling of 50 ms"]);
        assert.deepEqual(failuresOf(slow), [], "no ceiling given, no time judged");
        assert.deepEqual(failuresOf(out, { ceiling: 50 }), ["2 of the players were sent out of the world"], "the navigation's cap is reported, not failed");
        assert.deepEqual(failuresOf({ ...report, named: undefined }), ["report.named: not a number"]);
    });

    it("can be read as lines", () => {
        const words = wordsOf(report);

        assert.match(words[0], /^8 players, one-town, fights, seed 2: 300 steps \(15 s of the world's time\)/);
        assert.ok(words.some((line) => /^The fights at 10 s: begun/.test(line)));
    });
});

describe("the load at night (scripts/load.js load, activity night)", () => {
    let report;

    before(async () => {
        report = await load({ seed: 2, players: 4, layout: "one-town", activity: "night", seconds: 5 });
    });

    it("plays the world to nightfall with no one in it, by its own steps, then times a run that's dark all through", () => {
        assert.deepEqual(checkReport(report), []);
        assert.deepEqual(report.problems, []);
        assert.deepEqual(failuresOf(report, { ceiling: 50 }), []);

        // (A new world starts at minute 18, and night falls at minute 53: 35 turns of its war)
        assert.equal(report.night.waited, DAY.night - DAY.start);
        assert.equal(report.night.turn, 35);
        assert.ok(report.night.from >= DAY.night / 60000 && report.night.from < DAY.night / 60000 + 1, `began at minute ${report.night.from}`);
        assert.ok(report.night.to > report.night.from && report.night.to < report.night.from + 0.1, `ended at minute ${report.night.to}`);
        assert.equal(report.night.dark, true);
        assert.equal(report.joined.players, 4);
    });

    it("has the light to see by in every step: the soldiers gone through for torches, and lights measured against the players", () => {
        const steps = (5 * 1000) / STEP_MS;

        assert.equal(report.steps.count, steps);
        assert.equal(report.passes.light.calls, steps);
        // (Since the rest of 1-11 the battle's soldiers, from the list it keeps of them, where it
        // was its whole roster each step: core/host.js Host.bearing, test/bearing.test.js)
        assert.ok(report.counts["light.actors"] >= steps, "soldiers gone through each step");
        assert.ok(report.counts["light.actors"] < steps * report.actors.start, "and not the battle's whole roster");
        assert.ok(report.counts["light.pairs"] > 0);
        assert.ok(wordsOf(report).some((line) => /^At night: minute 53\.\d+ to minute 53\.\d+ of the day's 60, the war's turn 35; the light to see by /.test(line)));
    });

    it("is held to what a night run reports, and fails if it wasn't dark", () => {
        const { night, ...without } = report;

        assert.deepEqual(Object.keys(night).sort(), Object.keys(ACTIVITY_SCHEMAS.night).sort());
        assert.deepEqual(checkReport(without), ["report.night: missing"]);
        assert.deepEqual(checkReport({ ...report, night: { ...night, dark: "yes" } }), ["report.night.dark: not a boolean"]);
        assert.deepEqual(failuresOf({ ...report, problems: ["the night run wasn't dark from its first step to its last (minute 53 to minute 8 of the day's 60)"] }), ["the night run wasn't dark from its first step to its last (minute 53 to minute 8 of the day's 60)"]);
    });
});

describe("the load over a turn of the war (scripts/load.js load, activity warturn)", () => {
    let report;

    before(async () => {
        report = await load({ seed: 2, players: 4, layout: "one-town", activity: "warturn", seconds: 5, eventAt: 2000 });
    });

    it("waits, untimed, till the war's next turn falls when it's asked for in the run, and the world's saved four steps after as a world server saves it", () => {
        const { warturn } = report;

        assert.deepEqual(checkReport(report), []);
        assert.deepEqual(report.problems, []);
        assert.deepEqual(failuresOf(report, { ceiling: 50 }), []);
        assert.equal(report.steps.count, (5 * 1000) / STEP_MS);
        assert.deepEqual({ played: warturn.played, turns: warturn.turns, at: warturn.turn.at, number: warturn.turn.number }, { played: 0, turns: 1, at: 2000, number: 1 });
        assert.deepEqual({ at: warturn.save.at, after: warturn.save.after, written: warturn.save.written }, { at: 2000 + KEEPER.after * STEP_MS, after: KEEPER.after, written: 1 });
        assert.ok(warturn.save.bytes > 10000 && warturn.save.zipped > 0 && warturn.save.zipped < warturn.save.bytes, `${warturn.save.bytes} bytes written, ${warturn.save.zipped} gzipped`);
        assert.equal(report.passes.war.calls, report.steps.count);
    });

    it("says which of the steps between the two was longest and the pass that took most of it, and what the steps round them were", () => {
        const { warturn } = report;

        assert.ok(warturn.between.after >= 1 && warturn.between.after < KEEPER.after);
        assert.ok([...HOST_PASSES, ...FLUSH_PASSES, ...BATTLE_PASSES].includes(warturn.between.pass), warturn.between.pass);
        assert.deepEqual(Object.keys(warturn.round.before), ["mean", "p50", "p99", "worst", "worstAt"]);
        assert.equal(warturn.all.length, 1);
        assert.deepEqual(Object.keys(warturn.all[0]), ["at", "number", "turn", "between", "save", "boxes", "ahead", "chunks"]);
        assert.deepEqual([warturn.all[0].at, warturn.all[0].number, warturn.all[0].turn, warturn.all[0].save], [2000, 1, warturn.turn.wall, warturn.save.wall]);
        assert.ok(wordsOf(report).some((line) => /^The war's turn 1 at 2 s: its step /.test(line)));
        assert.ok(wordsOf(report).some((line) => /^Its save 4 steps after: that step .* 1 turn in the run$/.test(line)));
    });

    it("says what ground the turn wanted: what the host said it would bring near, what was made ahead for that, and what the steps from the turn to its save made for themselves (generated/multiplayer_scaling_plan.md 1-28)", () => {
        const { warturn } = report;

        // (A new war's first turn brings nothing near four in the humans' first town: nothing
        // said, nothing made ahead for it, and the steps after it make no ground)
        assert.equal(warturn.foreseen, true);
        assert.deepEqual(warturn.ground, { boxes: 0, ahead: 0, steps: { chunks: 0, tiles: 0 } });
        assert.deepEqual([warturn.all[0].boxes, warturn.all[0].ahead, warturn.all[0].chunks], [0, 0, 0]);
        assert.ok(wordsOf(report).some((line) => /^Its ground: turn 1, 0 boxes said to be wanted for what it would bring near and 0 chunks made ahead for them, 0 made by the steps from it to its save$/.test(line)));
        assert.ok(wordsOf({ ...report, warturn: { ...warturn, foreseen: false } }).some((line) => /^Its ground, none made ahead for a turn \(--unforeseen\): turn 1, /.test(line)));
        // (And it leaves the switches as it found them)
        assert.deepEqual([Ahead.turns, Overworld.recently], [true, true]);
    });

    it("is held to what such a run reports, and fails if the turn didn't come or wasn't saved", () => {
        const { warturn, ...without } = report;

        assert.deepEqual(Object.keys(warturn).sort(), Object.keys(ACTIVITY_SCHEMAS.warturn).sort());
        assert.deepEqual(checkReport(without), ["report.warturn: missing"]);
        assert.deepEqual(checkReport({ ...report, warturn: { ...warturn, save: { ...warturn.save, bytes: null }, all: 1 } }).sort(), ["report.warturn.all: not an array", "report.warturn.save.bytes: not a number"]);
        assert.deepEqual(failuresOf({ ...report, problems: ["the war's turn waited for at 2 s didn't come then"] }), ["the war's turn waited for at 2 s didn't come then"]);
        assert.deepEqual(failuresOf({ ...report, problems: ["the war's turn wasn't saved within the run"] }), ["the war's turn wasn't saved within the run"]);
    });
});

describe("the load's join storm (scripts/load.js load, activity joinstorm)", () => {
    let report;

    before(async () => {
        // (All eight in one step: who comes in with whom is then the same on any machine)
        report = await load({ seed: 2, players: 8, layout: "one-town", activity: "joinstorm", seconds: 9, eventAt: 1000, burst: 0 });
    });

    it("has everyone out again once the ground's made, and all say hello at once to a world that lets two come in at a time, as a world server does", () => {
        const { joinstorm } = report;

        assert.deepEqual(checkReport(report), []);
        assert.deepEqual(report.problems, []);
        assert.deepEqual(failuresOf(report, { ceiling: 50 }), []);
        assert.equal(report.joined.players, 8);
        assert.deepEqual(
            { at: joinstorm.at, over: joinstorm.over, welcomes: joinstorm.welcomes, loading: joinstorm.loading, asked: joinstorm.asked, welcomed: joinstorm.welcomed, waiting: joinstorm.waiting },
            { at: 1000, over: 0, welcomes: LOAD.welcomes, loading: LOAD.loading, asked: 8, welcomed: 8, waiting: 0 },
        );
        assert.equal(LOAD.welcomes, 2, "a world server's default (server/storage/worlds.js WORLD_SETTINGS.welcomes)");
    });

    it("says what the steps after everyone went cost, before the first hello: the town's people let go in the look round half a second on (generated/multiplayer_scaling_plan.md 1-27)", () => {
        const { leave } = report;

        assert.deepEqual(Object.keys(leave), Object.keys(LEAVE_SCHEMA));
        assert.deepEqual({ who: leave.who, at: leave.at, left: leave.left, stayed: leave.stayed, sudden: leave.sudden, going: leave.going }, { who: "all", at: 0, left: 8, stayed: 0, sudden: false, going: 0 });
        // (Its steps are those before the storm; none before it: they went before the run began)
        assert.deepEqual([leave.before.count, leave.steps.count], [0, 1000 / STEP_MS]);
        assert.ok(leave.longest.at >= 0 && leave.longest.at < 1000);
        assert.equal(leave.longest.wall, leave.steps.wall.worst);
        // (The one town's buildings closed, its folk, townsfolk and soldiers out of the battle,
        // in the step the look round falls in: three goings through it for them all)
        assert.ok(leave.let.buildings > 4 && leave.let.characters > 2 * leave.let.buildings, JSON.stringify(leave.let));
        assert.equal(leave.let.forgets, 3);
        assert.ok(wordsOf(report).some((line) => line.startsWith("Everyone gone at 0 s (8 left, 0 stayed): the 20 steps after a mean of ")));
        assert.deepEqual(checkReport({ ...report, leave: undefined }), ["report.leave: not an object"]);
    });

    it("takes the world once for each two let in, tells the rest their place as it changes, and the last waits on three pairs' loading", () => {
        const { joinstorm } = report;

        // (Four pairs: four takings, and eight welcomes of them; six told their place, then four, then two)
        assert.equal(joinstorm.snapshots, 4);
        assert.equal(report.bytes.byKind.welcome.messages, 8);
        assert.equal(joinstorm.queued, 12);
        assert.equal(report.bytes.byKind.queued.messages, 12);
        assert.equal(report.counts.snapshots, 4);
        assert.ok(joinstorm.lastWaited >= 3 * LOAD.loading, `the last waited ${joinstorm.lastWaited} ms`);
        assert.equal(joinstorm.waits.worst, joinstorm.lastWaited);
        assert.ok(joinstorm.done >= joinstorm.at + joinstorm.lastWaited && joinstorm.done <= 9000);
        assert.equal(joinstorm.steps.count, (joinstorm.done - joinstorm.at) / STEP_MS);
        assert.ok(joinstorm.steps.over >= 0 && joinstorm.steps.over <= joinstorm.steps.count);
        // (The letting in timed by itself in each of those steps, and the longest of them named)
        assert.deepEqual(Object.keys(joinstorm.admit), ["mean", "p50", "p99", "worst", "worstAt"]);
        assert.ok(joinstorm.longest.at >= joinstorm.at && joinstorm.longest.at < joinstorm.done);
        assert.equal(joinstorm.longest.wall, joinstorm.steps.wall.worst);
        assert.ok([...HOST_PASSES, ...FLUSH_PASSES, ...BATTLE_PASSES].includes(joinstorm.longest.pass), joinstorm.longest.pass);
        assert.ok(wordsOf(report).some((line) => /^The join storm at 1 s: 8 said hello within 0 s, let in 2 at a time, each 1 s making their copy: 8 let in, .* 12 tellings of a place in the line, 4 takings of the world$/.test(line)));
    });

    it("is held to what a storm reports; one still coming in as the run ends is said, and no one's taken for sent out", async () => {
        const { joinstorm, ...without } = report;

        assert.deepEqual(Object.keys(joinstorm).sort(), Object.keys(ACTIVITY_SCHEMAS.joinstorm).sort());
        assert.deepEqual(checkReport(without), ["report.joinstorm: missing"]);
        assert.deepEqual(checkReport({ ...report, joinstorm: { ...joinstorm, steps: { ...joinstorm.steps, over: undefined } } }), ["report.joinstorm.steps.over: not a number"]);

        const short = await load({ seed: 2, players: 8, layout: "one-town", activity: "joinstorm", seconds: 2, eventAt: 1000, burst: 0 });

        assert.deepEqual(checkReport(short), []);
        assert.deepEqual({ asked: short.joinstorm.asked, welcomed: short.joinstorm.welcomed, waiting: short.joinstorm.waiting, done: short.joinstorm.done }, { asked: 8, welcomed: 2, waiting: 6, done: -1 });
        assert.deepEqual(short.problems, ["6 of the storm's 8 hadn't been let in when the run ended (6 still waiting their turn)"]);
        assert.deepEqual(failuresOf(short, { ceiling: 50 }), [], "how far a storm gets is the run's length, not a failure");
    });

    it("brings each back where they were, as a kept hero comes; says what ground the steps made and what was made ahead; and with `cold` makes none ahead for those waiting, nor waits for it", async () => {
        const { ground } = report.joinstorm;

        // (No one "didn't come back to where they were": each stood within LOAD.back of it)
        assert.deepEqual(report.problems, []);
        assert.ok(LOAD.back === 8 && LOAD.looks === 2);
        assert.ok(report.joinstorm.steps.letting >= 0 && report.joinstorm.steps.letting <= report.joinstorm.steps.over);
        assert.equal(ground.ahead, true);

        for (const count of [ground.steps.chunks, ground.steps.tiles, ground.between.chunks, ground.between.tiles]) {
            assert.ok(Number.isInteger(count) && count >= 0, `${count}`);
        }

        assert.ok(wordsOf(report).some((line) => line.startsWith(`Made from the first hello on: ${ground.steps.chunks} chunks of ground and ${ground.steps.tiles} navigation tiles inside steps, ${ground.between.chunks} and ${ground.between.tiles} ahead of them`)));

        // (Into one town, its ground made already, no one waits for any: the line goes as it
        // went, made ahead for or not)
        const cold = await load({ seed: 2, players: 8, layout: "one-town", activity: "joinstorm", seconds: 2, eventAt: 1000, burst: 0, cold: true });

        assert.deepEqual(checkReport(cold), []);
        assert.equal(cold.joinstorm.ground.ahead, false);
        assert.deepEqual({ asked: cold.joinstorm.asked, welcomed: cold.joinstorm.welcomed, waiting: cold.joinstorm.waiting }, { asked: 8, welcomed: 2, waiting: 6 });
        assert.ok(wordsOf(cold).some((line) => line.startsWith("Made from the first hello on (nothing made ahead for those waiting, nor waited for: --cold): ")));
        assert.equal(Ahead.coming, true, "the switch put back");
    });
});

describe("the load's players leaving together (scripts/load.js load, --leave; generated/multiplayer_scaling_plan.md 1-27)", () => {
    let half;
    let sudden;

    before(async () => {
        half = await load({ seed: 2, players: 4, layout: "spread", seconds: 4, eventAt: 1000, leave: "half" });
        sudden = await load({ seed: 2, players: 4, layout: "spread", seconds: 4, eventAt: 1000, leave: "half", sudden: true });
    });

    it("has every other player gone in the one step, the rest playing on, and says what the steps after cost beside those before", () => {
        const { leave } = half;

        assert.deepEqual(checkReport(half), []);
        assert.deepEqual(half.problems, []);
        assert.deepEqual(failuresOf(half, { ceiling: 50 }), []);
        assert.deepEqual(Object.keys(leave), Object.keys(LEAVE_SCHEMA));
        assert.deepEqual({ who: leave.who, at: leave.at, left: leave.left, stayed: leave.stayed, sudden: leave.sudden }, { who: "half", at: 1000, left: 2, stayed: 2, sudden: false });
        assert.deepEqual([half.run.leave, half.run.sudden], ["half", false]);
        assert.equal(half.census.player.all, 2, "two still in as it ended");

        // (The second before, and the three after to the run's end: LOAD.leaving's five at the most)
        assert.equal(LOAD.leaving, 5000);
        assert.deepEqual([leave.before.count, leave.steps.count], [1000 / STEP_MS, 3000 / STEP_MS]);
        assert.ok(leave.steps.over >= 0 && leave.steps.over <= leave.steps.count);
        assert.equal(leave.longest.wall, leave.steps.wall.worst);
        assert.ok(leave.longest.at >= 1000 && leave.longest.at < 4000);
        assert.deepEqual(checkReport(leave.longest, STEP_SCHEMA), []);
        assert.ok(leave.look.worst > 0 && leave.look.worstAt >= 1000);
        // (The going itself timed, in its step's hearing)
        assert.ok(leave.going > 0 && leave.going <= half.steps.wall.worst, "no longer than the step it was in");
        // (Those who stayed went on being sent what's done: every step, each of them)
        assert.ok(half.bytes.byKind.ops.messages >= (1000 / STEP_MS) * 4 + (3000 / STEP_MS) * 2 && half.bytes.byKind.ops.messages < (1000 / STEP_MS) * 4 + (3000 / STEP_MS) * 3, `${half.bytes.byKind.ops.messages} sent of what was done`);
    });

    it("says what was let go in those steps: the two towns' folk, townsfolk and soldiers out of the battle and their buildings closed, in a few goings through it where each one was one", () => {
        const [now, was] = [half.leave.let, sudden.leave.let];

        assert.deepEqual(checkReport(sudden), []);
        assert.equal(sudden.leave.sudden, true);
        assert.deepEqual([sudden.run.leave, sudden.run.sudden], ["half", true]);

        // (The same let go either way: the same world)
        assert.deepEqual({ ...now, forgets: 0, chunks: 0, tiles: 0 }, { ...was, forgets: 0, chunks: 0, tiles: 0 });
        assert.ok(now.buildings > 4, `${now.buildings} buildings closed`);
        assert.ok(now.characters > 2 + now.buildings, `${now.characters} characters out of the battle`);
        assert.equal(half.actors.end, sudden.actors.end);
        assert.ok(half.actors.end < half.actors.start);

        // (As it was, the battle gone through once for each; now once for each who left, once
        // for all the buildings' folk, once for all the townsfolk, and once for each town's
        // soldiers: and a few more, for whoever the steps took out one by one)
        assert.equal(was.forgets, was.characters);
        assert.ok(now.forgets >= 2 && now.forgets <= 12, `${now.forgets} goings through for ${now.characters}`);
        assert.equal(Battle.forgetting, true, "the switches put back");
        assert.equal(Ahead.easing, true);

        // (Few enough chunks round four players that none's let go: the world keeps 256 whoever's in)
        assert.deepEqual([now.chunks, now.tiles, was.chunks, was.tiles], [0, 0, 0, 0]);
        assert.ok(wordsOf(half).some((line) => line.startsWith("Every other player gone at 1 s (2 left, 2 stayed): the 60 steps after a mean of ")));
        assert.ok(wordsOf(half).some((line) => line.includes(`let go in those steps: ${now.characters} characters out of the battle in ${now.forgets} goings through it, ${now.buildings} buildings closed, 0 chunks of ground, 0 navigation tiles`)));
        assert.ok(wordsOf(sudden).some((line) => line.startsWith("Every other player gone at 1 s (2 left, 2 stayed), let go as it was (--sudden): ")));
    });

    it("is held to what such a run reports, and a run too short for them to go says so", async () => {
        const { leave, ...without } = half;

        assert.deepEqual(checkReport(without), ["report.leave: missing"]);
        assert.deepEqual(checkReport({ ...half, leave: { ...leave, let: { ...leave.let, characters: undefined } } }), ["report.leave.let.characters: not a number"]);

        const short = await load({ seed: 2, players: 2, layout: "one-town", seconds: 1, eventAt: 2000, leave: "all" });

        assert.deepEqual(checkReport(short), []);
        assert.deepEqual({ who: short.leave.who, left: short.leave.left, stayed: short.leave.stayed, steps: short.leave.steps.count }, { who: "all", left: 0, stayed: 2, steps: 0 });
        assert.deepEqual(short.problems, ["the run ended before the players were to leave, 2 s in"]);
    });
});

describe("the load's dungeons and buildings (scripts/load.js doorsOf, load, activity dungeons)", () => {
    let report;

    before(async () => {
        report = await load({ seed: 2, players: 8, activity: "dungeons", seconds: 8, eventAt: 1000 });
    });

    it("puts four to a door, every other party by a dungeon's way in, further off than it's made from, the rest in a town", () => {
        const world = buildWorld({ seed: 2 });
        const homes = doorsOf(world, 25);
        const parties = [...new Set(homes.map(({ party }) => party))].map((party) => homes.filter((home) => home.party === party));
        const delves = parties.filter(([{ door }]) => door.kind === "dungeon");
        const towns = parties.filter(([{ door }]) => door.kind === "building");

        assert.deepEqual(parties.map(({ length }) => length), [4, 4, 4, 4, 4, 4, 1]);
        assert.deepEqual(parties.map(([{ door }]) => door.kind), ["dungeon", "building", "dungeon", "building", "dungeon", "building", "dungeon"]);
        assert.equal(new Set(delves.map(([{ door }]) => door.site)).size, 4);
        assert.equal(new Set(towns.map(([{ door }]) => door.town)).size, 3);
        assert.equal(towns[0][0].door.town, startFor(world.plan, "human").id);
        assert.ok(towns.every(([{ door, race }]) => world.plan.places.find(({ id }) => id === door.town).race === race));

        for (const [{ door, at }] of delves) {
            const site = world.plan.sites.find(({ id }) => id === door.site);

            assert.equal(site.kind, "dungeon");
            assert.notEqual(site.theme, "hell");
            assert.ok(Math.hypot(at[0] - site.at[0], at[1] - site.at[1]) > DELVES.near + LOAD.clear, `${door.site}'s party waits where it isn't made from`);
            assert.ok(Math.hypot(at[0] - door.outside[0], at[1] - door.outside[1]) > DELVES.near + LOAD.clear);
        }

        assert.deepEqual(doorsOf(world, 25), homes, "the same every time");
        assert.deepEqual(doorsOf(world, 8), homes.slice(0, 8), "more players leave the first where they were");
        assert.throws(() => doorsOf(world, 2000), /dungeons and \d+ towns to go into, not the 500 doors 2000 players take/);
    });

    it("stands each party at its door in its turn, and they go in by it by their own commands: the dungeon's levels made in the run", () => {
        const { dungeons } = report;

        assert.deepEqual(checkReport(report), []);
        assert.deepEqual(failuresOf(report, { ceiling: 50 }), []);
        assert.deepEqual({ parties: dungeons.parties, doors: dungeons.doors, at: dungeons.at, stagger: dungeons.stagger }, { parties: 2, doors: { dungeons: 1, buildings: 1 }, at: 1000, stagger: LOAD.stagger });
        assert.equal(dungeons.made.dungeons, 1);
        assert.ok(dungeons.made.levels >= 1 && dungeons.made.buildings <= 1);
        assert.ok(!report.problems.some((problem) => /was made before the run|wasn't made in the run|no door off the street|couldn't be stood/.test(problem)), report.problems.join("; "));
        assert.ok(dungeons.entered >= 4 && dungeons.entered <= 8, `${dungeons.entered} got in`);
        assert.ok(dungeons.inside.most >= 4 && dungeons.inside.most <= dungeons.entered);
        assert.ok(dungeons.inside.end <= dungeons.inside.most && dungeons.inside.fallen <= 8);
        // (The dungeon's foes put out: more in the battle than the towns' and the players')
        assert.ok(report.actors.most > report.actors.start);
    });

    it("says what the longest step of each door's coming was and the pass that took most of it, and times the steps with anyone inside", () => {
        const { dungeons } = report;
        const steps = (8 * 1000) / STEP_MS;

        assert.equal(dungeons.before.count, 1000 / STEP_MS);
        assert.ok(dungeons.steps.count > 0 && dungeons.steps.count <= steps - dungeons.before.count);
        assert.ok(dungeons.steps.over >= 0 && dungeons.steps.over <= dungeons.steps.count);
        assert.ok(["dungeon", "building"].includes(dungeons.coming.longest.door));
        assert.ok(dungeons.coming.longest.after >= 0 && dungeons.coming.longest.after < LOAD.stagger);
        assert.ok(dungeons.coming.longest.at >= 1000 && dungeons.coming.longest.at < 1000 + 2 * LOAD.stagger);
        assert.ok([...HOST_PASSES, ...FLUSH_PASSES, ...BATTLE_PASSES].includes(dungeons.coming.longest.pass), dungeons.coming.longest.pass);
        assert.ok([...HOST_PASSES, ...FLUSH_PASSES, ...BATTLE_PASSES].includes(dungeons.steps.longest.pass), dungeons.steps.longest.pass);
        assert.equal(dungeons.steps.longest.wall, dungeons.steps.wall.worst);
        assert.ok(wordsOf(report).some((line) => /^Doors, from 1 s, a party every 2 s: 2 parties at 1 dungeons and 1 buildings; \d got in, /.test(line)));
        assert.ok(wordsOf(report).some((line) => /^Made in the run: 1 dungeons \(\d+ levels\) and [01] buildings\. The longest step of a dungeon's coming: /.test(line)));
    });

    it("has the dungeon's floors made and their navigation baked between steps before its party comes, as a world server does; or, undelved, in its steps as they were, the same parties in by the same doors", async () => {
        const { dungeons } = report;

        // (Every level's floor made ahead, and no tile of a level's navigation baked in a step.
        // A building's floors aren't counted here: whether one's baked in a step or between two
        // goes by how much ground the maker had time for, the machine's speed)
        assert.deepEqual(dungeons.ahead, { levels: true, floors: true, made: dungeons.made.levels, baked: 0 });
        assert.ok(wordsOf(report).some((line) => line.startsWith(`${dungeons.made.levels} of the dungeons' floors made ahead, between steps; 0 tiles of their levels' navigation baked inside steps`)));

        const before = await load({ seed: 2, players: 8, activity: "dungeons", seconds: 8, eventAt: 1000, undelved: true });

        assert.deepEqual(checkReport(before), []);
        assert.deepEqual({ ...before.dungeons.ahead, baked: 0 }, { levels: true, floors: false, made: 0, baked: 0 });
        assert.ok(before.dungeons.ahead.baked > 0, "its first level's navigation baked in a step");
        assert.ok(wordsOf(before).some((line) => /^The dungeons' levels worked out ahead, their floors made in the steps \(--undelved\); \d+ tiles/.test(line)));
        assert.deepEqual([before.dungeons.made, before.dungeons.entered], [dungeons.made, dungeons.entered]);
        assert.equal(Ahead.delving, true, "(and the maker's as it was after)");
    });

    it("is held to what such a run reports, and fails if no one got in or a dungeon wasn't made", () => {
        const { dungeons, ...without } = report;

        assert.deepEqual(Object.keys(dungeons).sort(), Object.keys(ACTIVITY_SCHEMAS.dungeons).sort());
        assert.deepEqual(checkReport(without), ["report.dungeons: missing"]);
        assert.deepEqual(checkReport({ ...report, dungeons: { ...dungeons, inside: { most: 8 } } }).sort(), ["report.dungeons.inside.end: missing", "report.dungeons.inside.fallen: missing"]);
        assert.deepEqual(failuresOf({ ...report, problems: ["no one got in by a door"] }), ["no one got in by a door"]);
        assert.deepEqual(failuresOf({ ...report, problems: ["dungeon-28 wasn't made in the run", "2 of the 8 never got in by their door"] }), ["dungeon-28 wasn't made in the run"]);
    });
});

describe("the load's options", () => {
    it("names every activity the plan lists, all of them built; one that weren't would say so", async () => {
        assert.deepEqual([...LOAD.activities, ...Object.keys(LOAD.unbuilt)].sort(), ["battle", "dungeons", "fights", "hellrift", "invasion", "joinstorm", "night", "stick", "walk", "warturn"]);
        assert.deepEqual(LOAD.activities, ["walk", "stick", "fights", "battle", "invasion", "hellrift", "night", "warturn", "joinstorm", "dungeons"]);
        assert.deepEqual(Object.keys(LOAD.unbuilt), []);
        assert.deepEqual(Object.keys(ACTIVITY_SCHEMAS), ["night", "warturn", "joinstorm", "dungeons"]);

        // (What an unbuilt one's report would hold: nothing judged, nothing failed)
        const unbuilt = { schema: LOAD.schema, run: { seed: 2, players: 8, layout: "spread", activity: "dancing", seconds: 120, whole: false, leave: "none", sudden: false, node: process.version, platform: process.platform, arch: process.arch, cpus: 4 }, built: false, reason: "not built yet: no one knows the steps" };

        assert.deepEqual(checkReport(unbuilt), []);
        assert.deepEqual(checkReport({ ...unbuilt, reason: undefined }, UNBUILT_SCHEMA), ["report.reason: not a string"]);
        assert.deepEqual(failuresOf(unbuilt, { ceiling: 50 }), []);
        assert.deepEqual(wordsOf(unbuilt), ["8 players, spread, dancing, seed 2: not built yet: no one knows the steps"]);
        assert.deepEqual(LOAD.players, [8, 25, 50, 100]);
        assert.deepEqual(LOAD.seeds, [2, 7]);

        for (const activity of Object.keys(LOAD.unbuilt)) {
            const report = await load({ activity });

            assert.equal(report.built, false);
            assert.match(report.reason, /^not built yet: /);
            assert.deepEqual(checkReport(report), []);
            assert.deepEqual(failuresOf(report, { ceiling: 50 }), []);
            assert.match(wordsOf(report)[0], new RegExp(`^8 players, spread, ${activity}, seed 2: not built yet`));
        }
    });

    it("refuses what it doesn't know, saying what it does", async () => {
        await assert.rejects(load({ activity: "dancing" }), /No activity called dancing: walk, stick, fights, battle, invasion, hellrift, night, warturn, joinstorm, dungeons/);
        await assert.rejects(load({ players: 0 }), /--players takes a whole number/);
        await assert.rejects(load({ turns: -1 }), /--turns takes how many turns of the war/);
        await assert.rejects(load({ leave: "some" }), /--leave takes none, half, all/);
        await assert.rejects(load({ activity: "joinstorm", leave: "half" }), /a join storm has everyone gone before it begins/);
        assert.ok(Object.keys(REPORT_SCHEMA).length >= 15);
    });
});
