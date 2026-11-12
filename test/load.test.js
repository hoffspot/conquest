// The world authority's load (scripts/load.js; generated/multiplayer_scaling_plan.md 0-2): where
// its players are put by each layout, how it knows the navigation can't keep all the tiles they
// want, and what its report holds (its schema), over a short run of a small world. The numbers
// themselves are a machine's (npm run load); what's checked here is the same on any.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { KEEP_TILES, TILE } from "../client/js/core/navigation.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { COUNTERS, FLUSH_PASSES, HOST_PASSES, probing } from "../client/js/core/probe.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { checkReport, layoutOf, load, LOAD, REPORT_SCHEMA, tilesWanted, wordsOf } from "../scripts/load.js";

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

    it("knows the navigation can't keep the tiles more than eight players spread want round them", () => {
        const places = (players) => layoutOf(plan, players, "spread").map(({ at }) => at);
        const eight = tilesWanted(places(8), { tile: TILE, keep: KEEP_TILES });
        const twentyFive = tilesWanted(places(25), { tile: TILE, keep: KEEP_TILES });

        assert.equal(eight.capped, false, `${eight.wanted} wanted, ${KEEP_TILES} kept`);
        assert.equal(twentyFive.capped, true);
        assert.ok(twentyFive.wanted > 2 * KEEP_TILES);
        // (Two players in one place want the same tiles)
        assert.equal(tilesWanted([[500, 500], [500, 500]], { tile: 32, keep: 8, reach: 32 }).wanted, 9);
        assert.equal(tilesWanted([[500, 500]], { tile: 32, keep: 8, reach: 32 }).capped, true);
    });
});

describe("the load's report (scripts/load.js load, checkReport)", () => {
    let report;

    before(async () => {
        report = await load({ seed: 2, players: 8, layout: "one-town", activity: "fights", seconds: 15 });
    });

    it("holds everything its schema says, each of its type, and survives being written out", () => {
        assert.deepEqual(checkReport(report), []);
        assert.deepEqual(checkReport(JSON.parse(JSON.stringify(report))), []);
        assert.equal(report.schema, LOAD.schema);
        assert.deepEqual(report.run, { seed: 2, players: 8, layout: "one-town", activity: "fights", seconds: 15, node: process.version, platform: process.platform, arch: process.arch, cpus: report.run.cpus });
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

    it("began the fight it was asked for, ten seconds in", () => {
        assert.deepEqual({ type: report.event.type, at: report.event.at, asked: report.event.asked, ok: report.event.ok }, { type: "fights", at: LOAD.eventAt, asked: 1, ok: true });
        assert.ok(report.event.actors >= 2 * LOAD.fightSize);
        assert.ok(report.actors.most >= report.actors.start + report.event.actors);
    });

    it("can be read as lines", () => {
        const words = wordsOf(report);

        assert.match(words[0], /^8 players, one-town, fights, seed 2: 300 steps \(15 s of the world's time\)/);
        assert.ok(words.some((line) => /^The fights at 10 s: begun/.test(line)));
    });
});

describe("the load's options", () => {
    it("names every activity the plan lists: those built, and those that say they aren't yet", async () => {
        assert.deepEqual([...LOAD.activities, ...Object.keys(LOAD.unbuilt)].sort(), ["battle", "dungeons", "fights", "hellrift", "invasion", "joinstorm", "night", "stick", "walk", "warturn"]);
        assert.deepEqual(LOAD.players, [8, 25, 50, 100]);
        assert.deepEqual(LOAD.seeds, [2, 7]);

        for (const activity of Object.keys(LOAD.unbuilt)) {
            const report = await load({ activity });

            assert.equal(report.built, false);
            assert.match(report.reason, /^not built yet: /);
            assert.deepEqual(checkReport(report), []);
            assert.match(wordsOf(report)[0], new RegExp(`^8 players, spread, ${activity}, seed 2: not built yet`));
        }
    });

    it("refuses what it doesn't know, saying what it does", async () => {
        await assert.rejects(load({ activity: "dancing" }), /No activity called dancing: walk, stick, fights, battle, invasion, hellrift, night, warturn, joinstorm, dungeons/);
        await assert.rejects(load({ players: 0 }), /--players takes a whole number/);
        assert.ok(Object.keys(REPORT_SCHEMA).length >= 15);
    });
});
