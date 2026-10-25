// A joined player's own hero, drawn where the game's own rules will have them (app/forecast.js):
// played over a phone's link (a 300 ms round trip, jitter, and now and then a 300 ms hold-up), it's
// drawn smoothly, never moving further in a frame than a sprinter could (bar a little), near where
// the host will have them, running, stopping and going, sent by a tap, striking a foe as they run
// past it, casting as they run round one, the swing and the cast shown as they begin there, not
// as the copy has them, half a second later (a shot left to the copy). Its battle is its own: the
// copy of the world never strays from the host's. And put somewhere at once (a summons), it's
// drawn there at once.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FORECAST, Forecast } from "../client/js/app/forecast.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { selfOf } from "../client/js/core/selfstate.js";
import { playJoined, scoreJoined } from "./joinedgame.js";

const sword = { hero: { name: "Runner", shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50, skills: { blade: 300 } } };
const wand = { hero: { name: "Caster", shape: {}, look: {}, weapon: "wand", boots: false, race: "human" }, progress: { gold: 50, schools: { fire: 145 }, spells: ["burn"] } };

// The way from where a joiner starts with the longest clear run (seed 2's start town)
function openWay(world) {
    const navigator = navigatorOf(world.maps.town);
    const [x, y] = world.spawns.player;
    const clear = (facing) => {
        const ray = navigator.raycast([x + 0.5, y + 0.5], [x + 0.5 + Math.sin(facing) * 40, y + 0.5 + Math.cos(facing) * 40]);

        return ray ? Math.hypot(ray.point[0] - x - 0.5, ray.point[1] - y - 0.5) : 0;
    };

    return Array.from({ length: 32 }, (_, k) => (k / 32) * Math.PI * 2).sort((a, b) => clear(b) - clear(a))[0];
}

// A foe put `offset` metres from the hero, tough, standing (stunned), on both the host and the copy
const foeAt = (offset) => ({ host, copyHost, me }) => {
    for (const each of [host, copyHost]) {
        const hero = each.battle.actor(me);
        const orc = each.battle.actor("orc");
        const at = [Math.floor(hero.x + offset[0]), Math.floor(hero.y + offset[1])];

        Object.assign(orc, { map: hero.map, x: at[0] + 0.5, y: at[1] + 0.5, square: at, path: [], order: null, hp: 1e6, maxHp: 1e6, patrol: [at], dead: false, respawnAt: Infinity, stunnedUntil: Infinity });
    }
};

// (A quick action's cooldown let go of, on both, to press it often)
const ready = (ability) => ({ host, copyHost, me }) => {
    host.players.get(me).readyAt[ability] = 0;
    copyHost.players.get(me).readyAt[ability] = 0;
};

describe("your hero, drawn where the rules will have them (app/forecast.js)", () => {
    const worlds = () => [buildWorld({ seed: 2 }), buildWorld({ seed: 2 })];
    const LIMITS = Object.freeze({ biggest: 0.7, mean: 1.0 });
    // (Their swings and casts all shown as the forecast began them, a good while before the copy
    // has them, the copy's of each not shown again; and none begun the host didn't, but for one)
    const shownAhead = (name, { shown }) => {
        const ahead = shown.ahead.reduce((sum, ms) => sum + ms, 0) / Math.max(1, shown.ahead.length);

        assert.equal(shown.late, 0, `${name}: ${JSON.stringify(shown)}`);
        assert.ok(shown.claimed >= 2 && shown.begun - shown.claimed <= 1, `${name}: ${JSON.stringify(shown)}`);
        assert.ok(ahead >= 300, `${name}: shown ${ahead.toFixed(0)} ms before the copy's`);
    };
    const within = (name, played) => {
        const score = scoreJoined(played);

        assert.ok(score.biggest < LIMITS.biggest, `${name}: moved ${score.biggest.toFixed(2)} m in a frame at most`);
        assert.ok(score.mean < LIMITS.mean, `${name}: ${score.mean.toFixed(2)} m from where the host has them, on the mean`);

        return score;
    };

    it("is drawn smoothly near where the host will have them, running with the stick, stopping and going, and sent by a tap, over a 300 ms round trip", () => {
        for (const [name, stick, actions] of [
            ["running", (way) => () => ({ facing: way, run: true }), []],
            ["stopping and going", (way) => (t) => (t % 2200 < 1500 ? { facing: way, run: true } : null), []],
            ["sent by a tap", () => () => null, [{ at: 1200, command: null }]],
        ]) {
            const [world, copyWorld] = worlds();
            const way = openWay(world);
            const tap = actions.map((action) => ({ ...action, command: { type: "move", to: [Math.floor(world.spawns.player[0] + Math.sin(way) * 18), Math.floor(world.spawns.player[1] + Math.cos(way) * 18)], run: true } }));
            const played = playJoined(world, copyWorld, { character: sword, rtt: 300, ms: 7000, stick: stick(way), actions: tap });
            const score = within(name, played);
            const ran = played.frames.at(-1).host;

            assert.ok(Math.hypot(ran.x - played.frames[0].host.x, ran.y - played.frames[0].host.y) > 10, `${name}: went some way (${JSON.stringify(score)})`);
        }
    });

    it("holds them as the host does for a power strike struck at a foe as they run past it, and for a burn cast as they run round one, the swing and the cast shown as they begin there", () => {
        {
            const [world, copyWorld] = worlds();
            const way = openWay(world);
            let leg = 1;
            const end = (orc, side) => [orc.x + Math.sin(way) * 6 * side + Math.cos(way), orc.y + Math.cos(way) * 6 * side - Math.sin(way)];
            const played = playJoined(world, copyWorld, {
                character: sword,
                rtt: 300,
                ms: 12000,
                setup: foeAt([Math.sin(way) * 4, Math.cos(way) * 4]),
                stick: (t, { copy, host }) => {
                    const orc = host.battle.actor("orc");

                    if (Math.hypot(end(orc, leg)[0] - copy.x, end(orc, leg)[1] - copy.y) < 1) {
                        leg = -leg;
                    }

                    const [tx, ty] = end(orc, leg);

                    return { facing: Math.atan2(tx - copy.x, ty - copy.y), run: true };
                },
                actions: [
                    { at: 300, command: { type: "engage", target: "orc", stand: true, lock: true } },
                    {
                        when: ({ copy, host }) => {
                            const orc = host.battle.actor("orc");
                            const far = Math.hypot(orc.x - copy.x, orc.y - copy.y);

                            return far < 2.8 && far > 1.6;
                        },
                        every: 1500,
                        prep: ready("powerStrike"),
                        command: { type: "ability", ability: "powerStrike", target: "orc" },
                    },
                ],
            });

            assert.ok(played.answers.filter((answer) => answer === "ok").length >= 3, `struck (${played.answers})`);
            within("striking as they run past", played);
            shownAhead("striking as they run past", played);
        }

        {
            const [world, copyWorld] = worlds();
            const played = playJoined(world, copyWorld, {
                character: wand,
                rtt: 300,
                ms: 10000,
                setup: foeAt([4, 0]),
                stick: (t, { copy, host }) => {
                    const orc = host.battle.actor("orc");
                    const [dx, dy] = [orc.x - copy.x, orc.y - copy.y];
                    const far = Math.hypot(dx, dy);

                    return { facing: Math.atan2(dx, dy) + Math.PI / 2 + (far > 4 ? -0.5 : far < 2.5 ? 0.5 : 0), run: true };
                },
                actions: [{ at: 300, command: { type: "engage", target: "orc", stand: true, lock: true } }, ...[1500, 4000, 6500, 9000].map((at) => ({ at, command: { type: "cast", spell: "burn", target: "orc" } }))],
            });

            assert.ok(played.answers.filter((answer) => answer === "ok").length >= 2, `cast (${played.answers})`);
            within("casting as they run round", played);
            shownAhead("casting as they run round", played);
        }
    });

    it("leaves a shot to the copy: its arrow's the copy's, and the draw goes with it", () => {
        const [world, copyWorld] = worlds();
        const played = playJoined(world, copyWorld, {
            character: { ...sword, hero: { ...sword.hero, weapon: "bow" } },
            rtt: 300,
            ms: 5000,
            setup: foeAt([5, 0]),
            actions: [{ at: 300, command: { type: "engage", target: "orc", stand: true, lock: true } }],
        });

        assert.ok(played.shown.late >= 2, JSON.stringify(played.shown));
        assert.equal(played.shown.begun, 0);
    });

    it("looks ahead with those near them, in the town too (which the host's word leaves out): a blow at a foe beside them struck there", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: "runner", ...sword });
        host.populate();
        foeAt([1, 0])({ host, copyHost: host, me: "runner" });

        const self = selfOf(host.battle.actor("runner"));
        const forecast = new Forecast();

        assert.equal(self.map, undefined);
        forecast.heard({ time: host.battle.time, seq: 0, hero: self, at: 0 });
        forecast.sending(1, { type: "ability", ability: "powerStrike", target: "orc" }, 0);

        for (let now = 0; now <= 400; now += 1000 / 60) {
            forecast.at(host.battle, "runner", now, 200);
        }

        const { battle } = forecast.track;
        const mine = battle.actor("runner");

        assert.ok(battle.actor("orc"), "the orc's in its battle");
        assert.equal((mine.attack?.target ?? mine.striking?.target), "orc");
        assert.equal(host.battle.actor("runner").striking, null, "the host's own hero untouched");
    });

    it("does a command as the host will: at once, as of the host's last step when it comes (one coming between two steps, as of the first)", () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.join({ id: "runner", ...sword });
        host.populate();

        const forecast = new Forecast();
        const time = host.battle.time;

        // (The host's word heard at once; the stick sent so as to reach the host 20 ms after its step)
        forecast.heard({ time, seq: 0, hero: selfOf(host.battle.actor("runner")), at: 0 });
        forecast.sending(1, { type: "ahead", facing: openWay(world), run: true, reach: 30 }, 20 - 200);
        forecast.at(host.battle, "runner", 0, 200);

        const [first, second] = forecast.track.steps;

        assert.equal(second.time, time + STEP_MS);
        assert.ok(Math.hypot(second.x - first.x, second.y - first.y) > 0, "set off in the step after it, not the one after that");
    });

    it("draws them no further ahead than a second's round trip, however long one's taken (one held up while the world's built)", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: "runner", ...sword });
        host.populate();

        const forecast = new Forecast();

        forecast.heard({ time: host.battle.time, seq: 0, hero: selfOf(host.battle.actor("runner")), at: 0 });
        forecast.at(host.battle, "runner", 0, 14700);
        assert.equal(forecast.trip, FORECAST.slowest);
    });

    it("follows a host that plays its steps slower than time goes by (a browser drawing few frames): its time, and what's sent now when it'll have it, at its pace", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: "runner", ...sword });
        host.populate();

        const forecast = new Forecast();
        const hero = selfOf(host.battle.actor("runner"));
        let latest = null;

        // (Ten words a second for ten seconds, its battle a third of a second on at each second)
        for (let now = 0; now <= 10000; now += 100) {
            latest = { time: 1000 + Math.round(now / 3), seq: 0, hero, at: now };
            forecast.heard(latest);
            forecast.at(host.battle, "runner", now, 200);
        }

        // (Its words come at once: the host's time now is the last's. What's sent now reaches it a
        // tenth of a second later, a third of that of its time: not 200 ms of it, nor the ten
        // seconds' drift of a clock taken to keep time)
        assert.ok(Math.abs(forecast.pace - 1 / 3) < 0.02, `its pace ${forecast.pace.toFixed(3)}`);
        assert.ok(Math.abs(forecast.host.time - latest.time) < 50, `its time reckoned ${(forecast.host.time - latest.time).toFixed(0)} ms off`);
        assert.ok(Math.abs(forecast.present - latest.time - 200 / 3) < 50, `what's sent now had ${(forecast.present - latest.time).toFixed(0)} ms of its time on`);
    });

    it("keeps time with a host that does (its pace 1): its words held up, or a link's jitter, don't make it out slower", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: "runner", ...sword });
        host.populate();

        const forecast = new Forecast();
        const hero = selfOf(host.battle.actor("runner"));
        const jitter = (k) => ((k * 7919) % 41) - 20;
        let least = Infinity;

        // (Ten words a second for ten seconds, each 100 ms on its way, give or take 20; one in
        // twenty held up 300 ms)
        for (let k = 0; k <= 100; k++) {
            forecast.heard({ time: k * 100, seq: 0, hero, at: k * 100 + 100 + jitter(k) + (k % 20 === 7 ? 300 : 0) });
            forecast.at(host.battle, "runner", k * 100 + 100, 200);
            least = Math.min(least, forecast.pace);
        }

        assert.ok(least > 0.97, `its pace made out ${least.toFixed(3)} at the least`);
    });

    it("never touches the copy: its world plays on as the host's did, never astray", () => {
        const [world, copyWorld] = worlds();
        const way = openWay(world);
        const played = playJoined(world, copyWorld, { character: sword, rtt: 200, ms: 5000, stick: (t) => ({ facing: way + Math.sin(t / 700), run: true }) });

        assert.equal(played.joining.desyncs, 0);
        assert.equal(played.joining.resyncs, 0);
    });

    it("is put somewhere at once when the host puts them there (a summons, a teleport): drawn there, not slid there", () => {
        const [world, copyWorld] = worlds();
        const way = openWay(world);
        let moved = false;
        const played = playJoined(world, copyWorld, {
            character: sword,
            rtt: 200,
            ms: 4000,
            stick: (t, { host, copy }) => {
                if (t > 2000 && !moved) {
                    moved = true;
                    host.battle.place(copy.id, copy.map, [Math.floor(copy.x) + 30, Math.floor(copy.y)]);
                }

                return t < 1500 ? { facing: way, run: true } : null;
            },
        });
        const last = played.frames.at(-1);

        assert.ok(played.forecast.corrections.snaps >= 1, JSON.stringify(played.forecast.corrections));
        assert.ok(Math.hypot(last.at[0] - last.host.x, last.at[1] - last.host.y) < 1, `drawn where they were put (${last.at} against ${last.host.x}, ${last.host.y})`);
    });
});
