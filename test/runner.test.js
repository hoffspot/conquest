// A world played on (client/js/core/runner.js; generated/world_server_plan.md §3): moved on in
// whole steps as time's given it, what's left over kept for the next; what's done sent to those
// who've joined every RUNNER.flushEvery of its time; told of the war's turns as they come; the
// steps timed, if it's given a clock; the navigation round each player out in the world asked for
// ahead, again once they've gone far enough; and, run with no browser at all (as the world server
// will run it), a world joined over a link that plays on the same, step for step, for a long while
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { Hosting, Joining } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { RUNNER, StepTimes, WorldRunner } from "../client/js/core/runner.js";
import { TURN_MS } from "../client/js/core/war/war.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const GUEST = Object.freeze({ hero: { name: "Bryn", shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });

// A host that only counts its steps (and can be told a turn's come)
function counting() {
    const host = { steps: 0, turns: [], battle: { time: 0, actors: [] }, war: { turn: 0 } };

    host.advance = (ms) => {
        host.steps++;
        host.battle.time += ms;

        return host.turns.includes(host.steps) ? [{ type: "turn" }] : [];
    };

    return host;
}

describe("the world runner (core/runner.js)", () => {
    it("plays the whole steps the time it's given makes, keeping what's left over for the next", () => {
        const host = counting();
        const runner = new WorldRunner(host);

        assert.equal(runner.advance(STEP_MS * 2.5), 2);
        assert.equal(runner.lag, STEP_MS / 2);
        assert.equal(runner.advance(STEP_MS / 2), 1);
        assert.equal(runner.lag, 0);
        assert.equal(host.steps, 3);
        assert.equal(runner.time, STEP_MS * 3);
    });

    it("tells whoever draws the world before each step, and of what happened after it, in order", () => {
        const host = counting();
        const runner = new WorldRunner(host);
        const heard = [];

        host.turns = [2];
        runner.advance(STEP_MS * 3, { before: () => heard.push(`before ${host.steps + 1}`), after: (events) => heard.push(`after ${host.steps}: ${events.length}`) });
        assert.deepEqual(heard, ["before 1", "after 1: 0", "before 2", "after 2: 1", "before 3", "after 3: 0"]);
    });

    it("sends what's been done to those who've joined every flushEvery of its time, not every step", () => {
        const host = counting();
        const flushed = [];
        const runner = new WorldRunner(host, { hosting: { flush: () => flushed.push(runner.time) } });

        for (let k = 0; k < 10; k++) {
            runner.advance(STEP_MS);
        }

        assert.equal(STEP_MS * 10, 5 * RUNNER.flushEvery, "(ten steps, five sendings' worth)");
        assert.deepEqual(flushed, [100, 200, 300, 400, 500]);

        // Not opened to others: nothing sent
        runner.hosting = null;
        runner.advance(RUNNER.flushEvery * 2);
        assert.equal(flushed.length, 5);
    });

    it("tells of each turn of the war as it comes, with the war", () => {
        const host = counting();
        const turns = [];
        const runner = new WorldRunner(host, { onTurn: (war) => turns.push(war) });

        host.turns = [3, 7];
        runner.advance(STEP_MS * 10);
        assert.deepEqual(turns, [host.war, host.war]);
    });

    it("times its steps by the clock it's given: the mean, the worst and when, the 99th percentile", () => {
        const host = counting();
        let now = 0;
        const runner = new WorldRunner(host, { clock: () => now });
        const slow = 7;

        host.advance = ((advance) => (ms) => {
            now += host.steps + 1 === slow ? 40 : 1;

            return advance(ms);
        })(host.advance);

        runner.advance(STEP_MS * 10);

        const times = runner.times.toJSON();

        assert.equal(times.count, 10);
        assert.equal(times.worst, 40);
        assert.equal(times.worstAt, slow * STEP_MS);
        assert.equal(times.mean, (9 + 40) / 10);
        assert.equal(times.p99, 40);
        assert.equal(new WorldRunner(host).times, null, "(no clock, not timed)");
    });

    it("keeps only the last steps' times for the percentile, every step for the mean and the worst", () => {
        const times = new StepTimes(4);

        for (const ms of [50, 1, 1, 1, 1, 1]) {
            times.add(ms, 0);
        }

        assert.equal(times.recent.length, 4);
        assert.equal(times.percentile(0.99), 1);
        assert.equal(times.worst, 50);
        assert.equal(times.count, 6);
    });

    it("asks for the navigation round each player out in the world, again once they've gone far enough, and sends the next tile off", () => {
        const actors = [
            { id: "player", kind: "player", map: "town", x: 100, y: 100 },
            { id: "guest-1", kind: "player", map: "town", x: 500, y: 500 },
            { id: "inside", kind: "player", map: "tavern", x: 5, y: 5 },
            { id: "fallen", kind: "player", map: "town", x: 50, y: 50, dead: true },
            { id: "orc", kind: "orc", map: "town", x: 300, y: 300 },
        ];
        const runner = new WorldRunner({ battle: { actors } });
        const asked = [];
        let pumped = 0;
        const baker = { around: (x, y, reach) => asked.push([x, y, reach]), pump: () => pumped++ };

        runner.bakeAhead(baker);
        assert.deepEqual(asked, [[100, 100, RUNNER.bakeReach], [500, 500, RUNNER.bakeReach]]);

        // Moved a little: not again; far enough: again
        actors[0].x += RUNNER.bakeAgain - 1;
        runner.bakeAhead(baker);
        assert.equal(asked.length, 2);
        actors[0].x += 2;
        runner.bakeAhead(baker);
        assert.deepEqual(asked.at(-1), [actors[0].x, 100, RUNNER.bakeReach]);
        assert.equal(pumped, 3);
    });

    it("runs a world with no browser, one who's joined it over a link playing on the same for a long while: never astray, the same at the end", { timeout: 120000 }, () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        // The link: what's sent queued, both ways, as a relay would carry it
        const post = [];
        const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
        const joining = new Joining({ send: (text) => post.push({ from: "p1", text }) });
        const deliver = () => {
            while (post.length) {
                const { to, from, text } = post.shift();

                if (from) {
                    hosting.hear(from, text);
                } else if (to === "p1") {
                    joining.hear(text);
                }
            }
        };

        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello(GUEST);
        deliver();
        assert.ok(joining.host, "(welcomed)");

        // The players sent about now and then, as players are; the world played on two war turns
        // and more, a second at a time, the copy playing all it's been sent after each
        const runner = new WorldRunner(host, { hosting });
        const guest = joining.me;
        const seconds = Math.ceil((2 * TURN_MS) / 1000) + 30;

        for (let second = 0; second < seconds; second++) {
            if (second % 20 === 0) {
                const [x, y] = host.battle.actor(HOST_PLAYER).square;

                host.command(HOST_PLAYER, { type: "move", to: [x + ((second / 20) % 2 ? -6 : 6), y] });
                joining.command({ type: "move", to: [x + ((second / 20) % 2 ? 6 : -6), y + 4] });
                deliver();
            }

            runner.advance(1000);
            deliver();

            while (joining.step()) {
                // (Played)
            }

            assert.equal(joining.astray, false, `astray at ${second} s`);
        }

        runner.hosting.flush();
        deliver();

        while (joining.step()) {
            // (Played)
        }

        assert.ok(host.war.turn >= 2, `(${host.war.turn} turns)`);
        assert.equal(joining.host.battle.time, host.battle.time);
        assert.equal(joining.host.checksum(), host.checksum());
        assert.ok(joining.host.battle.actor(guest), "(the guest in the copy)");
    });
});
