// Others drawn from the mirror (core/drawn.js, core/playout.js, core/mirror.js Ring; the scaling
// plan's 3-19): where a game sent frames draws those they tell of, a little behind the world;
// the plan's measure of it on a bad link; a frame's word that someone was placed; and `?mirror`
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Drawn } from "../client/js/core/drawn.js";
import { Host } from "../client/js/core/host.js";
import { Ring, RING } from "../client/js/core/mirror.js";
import { Joining } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { Playout, PLAYOUT } from "../client/js/core/playout.js";
import { decodeFrame, FIELD, PLACED, ViewState } from "../client/js/core/view.js";
import { ViewFeed } from "../client/js/core/viewfeed.js";
import { startFor } from "../client/js/core/worldplan/plan.js";
import { unexpired } from "./helpers.js";

const hero = (name, race = "human") => ({ name, race, shape: {}, look: {}, weapon: "sword", boots: false });

describe("a ring past its latest telling, and one placed (core/mirror.js Ring)", () => {
    it("carries one that was moving on as it went for RING.carry at the most, and leaves one that wasn't where it was told", () => {
        const ring = new Ring();

        ring.push(1000, 10, 20, 0, { moving: true });
        assert.deepEqual(ring.at(1100, { carry: RING.carry }), { x: 10, y: 20, heading: 0 }, "one telling: no way it was going");

        ring.push(1100, 10.5, 20, 0, { moving: true });
        assert.deepEqual(ring.at(1200, { carry: RING.carry }), { x: 11, y: 20, heading: 0 });
        assert.deepEqual(ring.at(1100 + RING.carry, { carry: RING.carry }), { x: 10.5 + 0.5 * (RING.carry / 100), y: 20, heading: 0 });
        assert.deepEqual(ring.at(9000, { carry: RING.carry }), ring.at(1100 + RING.carry, { carry: RING.carry }), "and no further");
        assert.deepEqual(ring.at(1200), { x: 10.5, y: 20, heading: 0 }, "not carried on unless it's asked for");

        // (Stopped: where it was told)
        ring.push(1150, 10.7, 20, 0, { moving: false });
        assert.deepEqual(ring.at(1300, { carry: RING.carry }), { x: 10.7, y: 20, heading: 0 });

        // (Its last two tellings too far apart to say how it was going)
        ring.push(1150 + RING.apart + 50, 12, 20, 0, { moving: true });
        assert.deepEqual(ring.at(5000, { carry: RING.carry }), { x: 12, y: 20, heading: 0 });
    });

    it("is never drawn between where it was and where it was placed: there till then, and at the new place from then", () => {
        const ring = new Ring();

        ring.push(1000, 10, 20, 0, { moving: true });
        ring.push(1050, 10.2, 20, 0, { moving: true });
        ring.push(1100, 90, 60, 64, { moving: true, placed: true });

        assert.deepEqual(ring.at(1075), { x: 10.2, y: 20, heading: 0 });
        assert.deepEqual(ring.at(1099), { x: 10.2, y: 20, heading: 0 });
        assert.deepEqual(ring.at(1100), { x: 90, y: 60, heading: 64 });
        assert.deepEqual(ring.at(1300, { carry: RING.carry }), { x: 90, y: 60, heading: 64 }, "nor carried on from its placing");

        ring.clear();
        assert.equal(ring.at(1100), null);
    });
});

describe("playout time (core/playout.js)", () => {
    it("draws PLAYOUT.steps behind the soonest frame on a steady link, and further behind by how late the rest come", () => {
        const steady = new Playout({ stepMs: 50 });

        assert.equal(steady.at(0), null, "no frame yet: no time");

        for (let k = 0; k < 60; k++) {
            steady.heard(k * 50, 150 + k * 50);
        }

        assert.equal(steady.delay, 100);
        assert.equal(steady.at(150 + 59 * 50), 59 * 50 - 100);

        // (Frames up to 40 ms late: the delay covers nearly all of them, within its bounds)
        const uneven = new Playout({ stepMs: 50 });
        let random = 9;
        const roll = () => (random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32;

        for (let k = 0; k < 200; k++) {
            uneven.heard(k * 50, 150 + k * 50 + roll() * 40);
        }

        assert.ok(uneven.delay > 125 && uneven.delay <= 141, `${uneven.delay} ms behind`);
        assert.ok(PLAYOUT.least <= uneven.delay && uneven.delay <= PLAYOUT.most);
    });

    it("comes to a new delay without a jump, and jumps only when it's far out (a page that was hidden)", () => {
        const playout = new Playout({ stepMs: 50 });

        playout.heard(0, 100);

        const first = playout.at(100);

        assert.equal(first, -100);

        // (A frame 60 ms late: the delay grows by it, and the time drawn falls back by a tenth of what passes)
        playout.heard(50, 210);
        assert.equal(playout.delay, 160);
        assert.ok(Math.abs(playout.at(200) - (first + 100 - 10)) < 1e-9, "100 ms on, 10 ms of the 60 taken up");
        assert.ok(Math.abs(playout.at(1200) - (1200 - 100 - 160)) < 1e-9, "and all of it in time");

        // (Seconds out: set there at once)
        for (let k = 0; k < PLAYOUT.kept; k++) {
            playout.heard(100000 + k * 50, 5000 + k * 50);
        }

        assert.equal(playout.at(5000 + (PLAYOUT.kept - 1) * 50), 100000 + (PLAYOUT.kept - 1) * 50 - playout.delay);
    });
});

describe("a frame's word that someone was placed (core/view.js FIELD.placed)", () => {
    it("is said of a place further off than anyone goes in the steps since, with that place only", () => {
        const state = new ViewState();
        const actor = { x: 10, y: 10, facing: 0, progress: null, dead: false, running: false, attack: null, target: null, hp: 10, maxHp: 10 };
        const battle = { actor: () => null };
        const slot = state.touch(battle, actor, 5);

        assert.equal(state.changed.placed[slot], 5, "new: everything of it as of now");

        actor.x += (PLACED - 1) / 100;
        state.touch(battle, actor, 6);
        assert.equal(state.changed.placed[slot], 5, "a step's going: walked");

        // (Not looked at for three steps: three steps' going is still walked)
        actor.x += (3 * PLACED - 1) / 100;
        state.touch(battle, actor, 9);
        assert.equal(state.changed.placed[slot], 5);

        actor.y += (PLACED + 1) / 100;
        state.touch(battle, actor, 10);
        assert.equal(state.changed.placed[slot], 10, "further than a step's: placed");
        assert.equal(FIELD.placed, 64);
    });
});

// A world of two players in a town, the first sent frames over a link `oneWay` ms long whose
// frames come up to `jitter` ms late, in the order they were sent (a socket's): its Drawn, what
// the world had of everyone at each step, and the clock
function linked({ oneWay = 150, jitter = 40, seed = 3 } = {}) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });
    const { at } = startFor(world.plan, "human");
    const home = [Math.round(at[0]), Math.round(at[1])];

    host.join({ id: "p1", hero: hero("P1"), square: home, map: "town" });
    host.join({ id: "p2", hero: hero("P2"), square: [home[0] + 3, home[1] + 2], map: "town" });
    host.populate();

    const feed = new ViewFeed({ host });
    const drawn = new Drawn({ stepMs: STEP_MS });
    const sent = [];
    const truth = new Map();
    let random = seed;
    const roll = () => (random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 2 ** 32;
    let last = 0;

    feed.mode = "dark";
    feed.onFrame = (id, bytes) => {
        if (id === "p1") {
            last = Math.max(last, host.battle.time + oneWay + roll() * jitter);
            sent.push([bytes.slice(), last]);
        }
    };
    drawn.begin(host.battle.world);

    return {
        host,
        home,
        drawn,
        truth,
        roll,
        // A step of the world, its frames sent, and where everyone is kept
        step() {
            const events = host.advance(STEP_MS);

            feed.heard(events);
            feed.flush(Math.floor(host.battle.time / STEP_MS));

            for (const actor of host.battle.actors) {
                if (!truth.has(actor.id)) {
                    truth.set(actor.id, []);
                }

                truth.get(actor.id).push([host.battle.time, actor.x, actor.y, actor.map]);
            }
        },
        // The frames that have come by `now` taken
        come(now) {
            while (sent.length && sent[0][1] <= now) {
                drawn.take(...sent.shift());
            }
        },
        // Where the world had someone at a time: between the steps either side (null outside what's kept)
        had(id, time) {
            const kept = truth.get(id) ?? [];
            const k = kept.findIndex(([at]) => at >= time);

            if (k < 1) {
                return null;
            }

            const [a, b] = [kept[k - 1], kept[k]];
            const share = (time - a[0]) / (b[0] - a[0]);

            return { x: a[1] + (b[1] - a[1]) * share, y: a[2] + (b[2] - a[2]) * share, from: a, to: b };
        },
    };
}

describe("others drawn from frames on a bad link (core/drawn.js): the plan's measure", () => {
    it("draws a remote character within 0.3 m (95th percentile) of where the world had it at playout time, at a 300 ms round trip with 40 ms jitter", () => {
        const link = linked({ oneWay: 150, jitter: 40 });
        const { host, home, drawn, roll } = link;
        const errors = { p2: [], all: [] };
        const delays = [];

        for (let k = 0; k < 1200; k++) {
            // (The other player runs about, turning each second or so; the first walks a little)
            if (k % 18 === 0) {
                host.command("p2", { type: "move", to: [Math.round(home[0] + (roll() - 0.5) * 50), Math.round(home[1] + (roll() - 0.5) * 50)], run: k % 36 === 0 });
            }

            if (k % 100 === 0) {
                host.command("p1", { type: "move", to: [Math.round(home[0] + (roll() - 0.5) * 20), Math.round(home[1] + (roll() - 0.5) * 20)], run: false });
            }

            link.step();

            // (Three pictures a step, as a screen draws)
            for (const part of [0, 1 / 3, 2 / 3]) {
                const now = host.battle.time + part * STEP_MS;

                link.come(now);

                const time = drawn.time(now);

                if (time === null || k < 200) {
                    continue;
                }

                delays.push(now - time);

                for (const entry of drawn.mirror.known) {
                    const id = entry?.actor.id;

                    if (!entry || id === "p1") {
                        continue;
                    }

                    const at = drawn.of(id, now);
                    const had = link.had(id, time);

                    // (Fully there, and not across a placing: where it was told and where it was)
                    if (!at || at.alpha < 1 || !had || Math.abs(had.to[1] - had.from[1]) > 3 || Math.abs(had.to[2] - had.from[2]) > 3) {
                        continue;
                    }

                    const error = Math.sqrt((at.x - had.x) * (at.x - had.x) + (at.y - had.y) * (at.y - had.y));

                    errors.all.push(error);

                    if (id === "p2") {
                        errors.p2.push(error);
                    }
                }
            }
        }

        const p95 = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length * 0.95)];
        const mean = (list) => list.reduce((sum, each) => sum + each, 0) / list.length;

        if (process.env.DRAWN_TALLY) {
            console.log(`drawn: p2 ${errors.p2.length} samples, p95 ${p95(errors.p2).toFixed(3)} m, mean ${mean(errors.p2).toFixed(3)}, worst ${Math.max(...errors.p2).toFixed(3)}; all ${errors.all.length}, p95 ${p95(errors.all).toFixed(3)}, worst ${Math.max(...errors.all).toFixed(3)}; behind the clock ${mean(delays).toFixed(0)} ms (delay ${drawn.playout.delay.toFixed(0)}); unknown ${drawn.unknown}`);
        }

        assert.ok(errors.p2.length > 2500 && errors.all.length > 10000, `${errors.p2.length} and ${errors.all.length} samples`);
        assert.ok(p95(errors.p2) <= 0.3, `the other player: ${p95(errors.p2)} m`);
        assert.ok(p95(errors.all) <= 0.3, `everyone: ${p95(errors.all)} m`);
        assert.deepEqual(drawn.mirror.faults, []);

        // (Behind the clock by the link and the delay, and the delay within its bounds)
        assert.ok(drawn.playout.delay >= PLAYOUT.least && drawn.playout.delay <= 150, `${drawn.playout.delay} ms`);
        assert.ok(mean(delays) > 250 && mean(delays) < 310, `${mean(delays)} ms behind the world`);
    });

    it("has someone placed elsewhere there at once, never drawn on the way; fades those who come and go; and says nothing of anyone it's never been told of", () => {
        const link = linked({ oneWay: 60, jitter: 10 });
        const { host, drawn } = link;
        const seen = [];
        let from = null;
        let to = null;

        assert.equal(drawn.ready, false);
        assert.equal(drawn.of("p2", 0), null);

        for (let k = 0; k < 400; k++) {
            if (k === 200) {
                const actor = host.battle.actor("p2");

                from = [actor.x, actor.y];

                for (const [dx, dy] of [[14, 0], [0, 14], [-14, 0], [0, -14], [10, 10], [-10, -10]]) {
                    if (host.battle.place("p2", "town", [Math.floor(actor.x) + dx, Math.floor(actor.y) + dy])) {
                        break;
                    }
                }

                to = [actor.x, actor.y];
                assert.ok(Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) > 9, "set down well away");
            }

            link.step();

            for (const part of [0, 0.5]) {
                const now = host.battle.time + part * STEP_MS;

                link.come(now);

                const at = drawn.of("p2", now);

                if (at) {
                    seen.push({ k, ...at });
                }
            }
        }

        assert.ok(drawn.ready && seen.length > 700);

        // (Coming: seen through at first, wholly there RING.fade on)
        const began = seen.findIndex(({ alpha }) => alpha > 0);
        const whole = seen.findIndex(({ alpha }) => alpha === 1);

        assert.ok(seen[began].alpha < 0.3 && whole > began, "faded in");
        assert.ok(whole - began <= Math.ceil(RING.fade / (STEP_MS / 2)) + 1, `${whole - began} pictures`);

        // (Placed: every picture of them at one place or the other)
        const near = ({ x, y }, [px, py]) => Math.abs(x - px) < 0.5 && Math.abs(y - py) < 0.5;
        const around = seen.filter(({ k }) => k >= 195 && k < 230);

        assert.ok(around.some((at) => near(at, from)) && around.some((at) => near(at, to)));
        assert.ok(around.every((at) => near(at, from) || near(at, to)), "nowhere between");

        // (Gone from the world: where they were, fading, and then not at all)
        const last = seen.at(-1);

        host.leave("p2");
        seen.length = 0;

        for (let k = 0; k < 40; k++) {
            link.step();
            link.come(host.battle.time);
            seen.push(drawn.of("p2", host.battle.time));
        }

        const fading = seen.filter((at) => at && !at.known);

        assert.ok(fading.length >= 4 && fading.some(({ alpha }) => alpha > 0 && alpha < 1), "seen going");
        assert.ok(fading.every((at) => near(at, [last.x, last.y])), "where they were");
        assert.ok(fading.every(({ alpha }, k) => k === 0 || alpha <= fading[k - 1].alpha) && fading.at(-1).alpha === 0);
        assert.equal(seen.at(-1), null, "and let go of");
        assert.equal(drawn.of("nobody", host.battle.time), null);
        assert.ok(drawn.unknown >= 2);
    });

    it("keeps the frames that come before its world's made, and begins with the one that tells of its own hero", () => {
        const link = linked({ oneWay: 0, jitter: 0 });
        const waiting = new Drawn({ stepMs: STEP_MS });
        const frames = [];
        const feedFrames = link.drawn;

        for (let k = 0; k < 20; k++) {
            link.step();
        }

        // (The same frames, come before the world was known)
        link.come(Infinity);
        assert.ok(feedFrames.frames >= 20);

        const other = linked({ oneWay: 0, jitter: 0 });
        const take = other.drawn.take.bind(other.drawn);

        other.drawn.take = (bytes, now) => (frames.push([bytes, now]), take(bytes, now));

        for (let k = 0; k < 20; k++) {
            other.step();
        }

        other.come(Infinity);

        // (A frame that isn't its first, first: let go of; bytes that aren't a frame: nothing)
        waiting.take(frames[5][0], frames[5][1]);
        waiting.take(new Uint8Array([9, 9, 9]), 0);

        for (const [bytes, now] of frames) {
            waiting.take(bytes, now);
        }

        assert.equal(waiting.ready, false, "no world yet");
        waiting.begin(other.host.battle.world);
        assert.equal(waiting.ready, true);
        assert.equal(waiting.frames, frames.length, "all of them taken, from the first that tells of its own hero");
        assert.equal(decodeFrame(frames[0][0]).records[0].placed, true, "and a first telling is a placing");
        assert.deepEqual(waiting.mirror.faults, []);
    });
});

describe("`?mirror` (client/js/main.js, app/game.js)", () => {
    it("is off unless the page's address asks, asks for its frames as a shadow does, and has its day to be gone by", async () => {
        const main = await readFile(new URL("../client/js/main.js", import.meta.url), "utf8");
        const game = await readFile(new URL("../client/js/app/game.js", import.meta.url), "utf8");

        assert.equal(main.match(/params\.has\("mirror"\)/g)?.length, 1);
        assert.match(main, /if \(params\.has\("mirror"\)\) \{\s+joined\.joining\.drawing\(true\);/);
        assert.equal(main.match(/\.drawing\(/g).length, 1, "and nowhere without it");
        assert.equal(game.match(/remote\.drawn\.of\(/g)?.length, 1, "drawn from in one place");
        assert.match(game, /this\.remote\?\.drawn\?\.ready && actor !== mine/, "others only, and only once there are frames");

        // (A joined game: nothing's drawn from frames till it's asked; asked, it asks for frames)
        const said = [];
        const joining = new Joining({ send: (text) => said.push(text), clock: () => 0 });

        assert.equal(joining.drawn, null);
        joining.frame(new Uint8Array([1, 2, 3]));
        joining.drawing(true);
        assert.ok(joining.drawn && joining.shadow && said.length === 1 && /views/.test(said[0]));
        joining.frame(new Uint8Array([1, 2, 3]));
        assert.equal(joining.drawn.ready, false);
        joining.drawing(false);
        assert.equal(joining.drawn, null);

        unexpired("the game's ?mirror", "2027-11-12");
    });
});
