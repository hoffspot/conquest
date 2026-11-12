// The probes (client/js/core/probe.js; generated/multiplayer_scaling_plan.md 0-1): each pass of
// the host's step timed by name, and its work counted, for whoever measures a world. They measure
// nothing unless installed, and installed they change nothing: a world played with them steps to
// the same sums, and says the very same to those who've joined it, as one played without.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { Hosting, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { count, COUNTERS, FLUSH_PASSES, HOST_PASSES, install, lap, Probes, probing, uninstall } from "../client/js/core/probe.js";
import { encode } from "../client/js/core/wire.js";
import { startFor } from "../client/js/core/worldplan/plan.js";

const hero = (name, race) => ({ name, race, shape: {}, look: {}, weapon: "sword", boots: false });

// A world (seed 2) with a player in the humans' start town and another in the elves', opened to
// two who join it over a link that only keeps what's sent; played `steps`, everyone sent
// somewhere near every second, where those near the players stand sent too (the motion stream).
// Returns its sum after each step, and all that was sent, in order
function played(steps) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });
    const sent = [];
    const hosting = new Hosting(host, { send: (peer, text) => sent.push(`${peer} ${text}`) });
    const sums = [];
    let random = 9;
    const roll = () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32 - 0.5) * 2;
    const homes = ["human", "elf"].map((race, k) => {
        const { at } = startFor(world.plan, race);

        host.join({ id: `p${k + 1}`, hero: hero(`P${k + 1}`, race), square: [Math.round(at[0]), Math.round(at[1])], map: "town" });

        return at;
    });

    host.populate();
    hosting.sendsPlaces = true;
    hosting.hear("a", encode({ kind: "hello", version: NET_VERSION, character: { hero: hero("Ann", "human") } }));
    hosting.hear("b", encode({ kind: "hello", version: NET_VERSION, character: { hero: hero("Bea", "orc") } }));

    for (let k = 0; k < steps; k++) {
        if (k % 20 === 0) {
            homes.forEach(([x, y], n) => host.command(`p${n + 1}`, { type: "move", to: [Math.round(x + roll() * 30), Math.round(y + roll() * 30)] }));
            hosting.hear("a", encode({ kind: "command", seq: k + 1, command: { type: "stick", x: roll(), y: roll() } }));
        }

        host.advance(STEP_MS);
        hosting.flush();
        sums.push(host.checksum());
    }

    return { sums, sent };
}

describe("the probes (core/probe.js)", () => {
    afterEach(() => uninstall());

    it("measure nothing till they're installed, and nothing once they're taken out again", () => {
        assert.equal(probing(), false);
        lap("battle");
        count("steps", 3);
        lap(null);

        const probes = install(new Probes({ clock: () => 0 }));

        assert.equal(probing(), true);
        assert.deepEqual(probes.toJSON(), { passes: {}, counts: {} }, "nothing from before they were installed");
        assert.equal(uninstall(), probes);
        assert.equal(uninstall(), null);
        lap("battle");
        count("steps");
        assert.deepEqual(probes.toJSON(), { passes: {}, counts: {} });
    });

    it("time each pass from its lap to the next, so every moment between the first and the last falls to one of them", () => {
        let now = 100;
        const probes = install(new Probes({ clock: () => now }));

        lap("light");
        now += 2;
        lap("battle");
        now += 30;
        lap("light");
        now += 1;
        lap(null);
        now += 500;
        lap("end");
        now += 4;
        uninstall();
        now += 9;

        assert.deepEqual(probes.toJSON().passes, { battle: { ms: 30, calls: 1 }, end: { ms: 4, calls: 1 }, light: { ms: 3, calls: 2 } });
        assert.equal(probes.total, 37);
    });

    it("count work by name, and forget it all when reset, a pass being timed timed from then", () => {
        let now = 0;
        const probes = install(new Probes({ clock: () => now }));

        count("steps");
        count("wilds.pairs", 40);
        count("wilds.pairs", 2);
        assert.deepEqual(probes.toJSON().counts, { steps: 1, "wilds.pairs": 42 });

        lap("battle");
        now += 5;
        probes.reset();
        now += 3;
        lap(null);
        assert.deepEqual(probes.toJSON(), { passes: { battle: { ms: 3, calls: 0 } }, counts: {} });
    });

    it("leave a world's steps as they were: its sums, and all it says to those who've joined, the same with them and without", () => {
        const steps = 240;
        const without = played(steps);
        let ticks = 0;
        // (A clock that never says the same twice, so anything that read it would come out otherwise)
        const probes = install(new Probes({ clock: () => (ticks += 0.37) }));
        const withProbes = played(steps);

        uninstall();

        assert.equal(without.sums.length, steps);
        assert.deepEqual(withProbes.sums, without.sums);
        assert.deepEqual(withProbes.sent, without.sent);
        assert.ok(new Set(without.sums).size > steps / 2, "(a world that's moving)");

        // (And they did measure it: every step, every pass of the step and of what's sent after
        // it, by the names said; nothing under a name that isn't)
        const { passes, counts } = probes.toJSON();

        assert.equal(counts.steps, steps);
        assert.equal(passes.battle.calls, steps);
        assert.equal(passes.end.calls, steps);
        assert.equal(passes.lookAround.calls, steps / 10, "the passes that look round the players, twice a second");
        assert.ok(passes["flush.ops"].calls >= steps);
        assert.ok(counts.checksums >= steps && counts.snapshots === 2 && counts.sends > steps && counts.sent > 0);
        assert.ok(counts["motion.pairs"] > 0 && counts["wilds.pairs"] >= 0 && counts["lookAround.pairs"] > 0 && counts["muster.pairs"] > 0 && counts["groups.pairs"] > 0 && counts["battle.indexed"] > 0);
        assert.deepEqual(Object.keys(passes).filter((name) => !HOST_PASSES.includes(name) && !FLUSH_PASSES.includes(name)), []);
        assert.deepEqual(HOST_PASSES.filter((name) => !passes[name]), [], "every pass of the step begun");
        assert.deepEqual(FLUSH_PASSES.filter((name) => !passes[name]), []);
        assert.deepEqual(Object.keys(counts).filter((name) => !COUNTERS.includes(name)), []);
    });
});
