// A joined game played in one process, for the tests of how a joined player's own hero is drawn
// (app/forecast.js): a host's world and a joined copy of it over a phone's link (half the round
// trip each way, jitter, and now and then everything held up 300 ms as a lost TCP segment holds it:
// the link's state by the time alone, each way its own, the same however much is said), the joined
// game played frame by frame as app/game.js #tick plays it, its hero drawn as game.js draws it, and
// a player steering as app/steering.js sends it (a way and whether running) and doing what they're
// scripted to. Scored against where the host has the hero when what's sent now reaches it.

import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { Hosting, Joining, PACE } from "../client/js/core/netplay.js";
import { createRandom } from "../client/js/core/random.js";
import { Forecast } from "../client/js/app/forecast.js";

// (As app/game.js has them: how many steps a joined game runs on past the last it's had; and the
// stick, as app/steering.js sends it: its turn, how often again, how far ahead)
const RUN_ON = 3;
const FRAME = 1000 / 60;
const STICK = Object.freeze({ turned: 0.12, again: 500, reach: 30 });

/**
 * Played: `world` (as buildWorld made it) hosted, `character` joining it with its copy made on
 * `copyWorld` (another of the same: nothing of the host's shared) over a link of `rtt` ms
 * (`jitter` ms either way; a 300 ms hold-up in a hundredth of its tenths of a second, `stall` 0 for
 * none), for `ms` of the player's `stick` (t, { copy, host }) => { facing, run } or null, and their
 * `actions` ([{ at, command } or { when, every, command }]), after `setup` ({ host, me }). Returns
 * where the hero was drawn and where the host had them, frame by frame, the forecast, and what
 * came of their quick actions.
 */
export function playJoined(world, copyWorld, { character, rtt = 200, jitter = 40, stall = 0.01, ms = 8000, stick = () => null, actions = [], setup = null, stickOptions = STICK }) {
    const host = new Host(world, { populate: false });

    host.join({ id: "host", hero: { name: "Host", shape: {}, look: {}, weapon: "sword", boots: false } });
    host.populate();

    // The link
    let now = 0;
    const lanes = { up: [], down: [] };
    const last = { up: 0, down: 0 };
    const stalls = { up: [], down: [] };

    for (const [lane, seed] of [["up", 17], ["down", 23]]) {
        const random = createRandom(seed);

        for (let at = 0; at < ms + 10000; at += 100) {
            if (random.next() < stall * 2) {
                stalls[lane].push([at, at + 300]);
            }
        }
    }

    const jittered = (lane, at) => createRandom((Math.floor(at / 25) * 2654435761 + (lane === "up" ? 7 : 11)) >>> 0).next();
    const send = (lane, text) => {
        const held = stalls[lane].find(([from, to]) => now >= from && now < to);
        const at = Math.max(last[lane], (held ? held[1] : now) + rtt / 2 + (jittered(lane, now) - 0.5) * jitter);

        last[lane] = at;
        lanes[lane].push({ at, text });
    };
    const hosting = new Hosting(host, { send: (peer, text) => send("down", text) });
    const joining = new Joining({ send: (text) => send("up", text), clock: () => now });
    let hostAt = 0;

    joining.onWelcome = ({ snapshot }) => joining.attach(Host.restore(copyWorld, snapshot));
    joining.hello(character);

    const deliver = () => {
        while (lanes.up.length && lanes.up[0].at <= now) {
            hosting.hear("p1", lanes.up.shift().text);
        }

        while (lanes.down.length && lanes.down[0].at <= now) {
            joining.hear(lanes.down.shift().text);
        }
    };
    const hostTick = () => {
        while (hostAt + STEP_MS <= now) {
            hostAt += STEP_MS;
            host.advance(STEP_MS);
            hosting.flush();
        }
    };

    for (; now < 3000 && !joining.host; now += FRAME) {
        hostTick();
        deliver();
    }

    const me = joining.me;
    const copy = () => joining.host.battle.actor(me);
    const truth = () => host.battle.actor(me);

    setup?.({ host, copyHost: joining.host, me });

    const forecast = new Forecast();

    joining.onSelf = (self) => forecast.heard(self);

    const answers = [];
    const command = (sent) => {
        const then = sent.type === "ability" || sent.type === "cast" ? (result) => answers.push(result?.ok ? "ok" : (result?.reason ?? "?")) : null;
        const { seq } = joining.command(sent, then);

        forecast.sending(seq, sent, now);
    };

    // The stick, as app/steering.js sends it
    let held = null;
    const steer = (wanted) => {
        if (!wanted) {
            if (held) {
                held = null;
                command({ type: "stop" });
            }

            return;
        }

        const turn = held ? Math.abs(Math.atan2(Math.sin(wanted.facing - held.facing), Math.cos(wanted.facing - held.facing))) : Infinity;

        if (turn > stickOptions.turned || wanted.run !== held?.run || now - (held?.at ?? -Infinity) > stickOptions.again) {
            held = { ...wanted, at: now };
            command({ type: "ahead", facing: wanted.facing, run: wanted.run, reach: stickOptions.reach });
        }
    };

    const previous = new Map();
    const start = now;
    const frames = [];
    const fired = new Set();
    let accumulator = 0;
    let pingedAt = 0;

    for (; now < start + ms; now += FRAME) {
        const t = now - start;

        hostTick();
        deliver();
        steer(stick(t, { copy: copy(), host }));

        for (const [k, action] of actions.entries()) {
            if (action.when) {
                if (t - (action.last ?? -Infinity) >= action.every && action.when({ copy: copy(), host, t })) {
                    action.last = t;
                    action.prep?.({ host, copyHost: joining.host, me });
                    command(action.command);
                }
            } else if (t >= action.at && !fired.has(k)) {
                fired.add(k);
                action.prep?.({ host, copyHost: joining.host, me });
                command(action.command);
            }
        }

        // (app/game.js #tick)
        accumulator += FRAME * joining.pace(FRAME);

        while (accumulator >= STEP_MS) {
            if (joining.behind > 0) {
                for (const actor of joining.host.battle.actors) {
                    previous.set(actor.id, { x: actor.x, y: actor.y, map: actor.map });
                }
            }

            if (!joining.step()) {
                accumulator = Math.min(accumulator, STEP_MS * RUN_ON);
                break;
            }

            accumulator -= STEP_MS;
        }

        for (let extra = 0; joining.behind > joining.delay + PACE.behind && extra < PACE.catchUp && joining.step(); extra++) {
            // (Caught up a little at a time)
        }

        if (now - pingedAt >= 1000) {
            pingedAt = now;
            joining.ping();
        }

        // (app/game.js #update: the copy's place between steps; their own hero, the forecast's)
        const actor = copy();
        const before = previous.get(me) ?? actor;
        const alpha = accumulator / STEP_MS;
        const place = forecast.at(joining.host.battle, me, now, joining.lately ?? undefined);
        const at = place && place.map === actor.map ? [place.x, place.y] : before.map === actor.map ? [before.x + (actor.x - before.x) * alpha, before.y + (actor.y - before.y) * alpha] : [actor.x, actor.y];
        const hero = truth();

        frames.push({ t, map: place?.map ?? actor.map, at, host: { x: hero.x, y: hero.y, map: hero.map } });
    }

    return { frames, forecast, answers, host, copyHost: joining.host, joining, me, rtt };
}

/**
 * How the hero looked, after a settling second: the frames they were drawn moving further than
 * anyone runs (`jumps`, and how far over in all, `jumped`), the biggest move in a frame, and how far
 * they were drawn from where the host had them when what's sent then reached it (mean and most).
 */
export function scoreJoined({ frames, rtt }, { fastest = 7.9 * 1.25 } = {}) {
    const hostAt = (t) => frames[Math.min(frames.length - 1, Math.max(0, Math.round(t / FRAME)))].host;
    const room = (fastest * FRAME) / 1000 + 0.01;
    const errors = [];
    let [jumps, jumped, biggest] = [0, 0, 0];

    for (let k = 1; k < frames.length; k++) {
        const [before, frame] = [frames[k - 1], frames[k]];

        if (frame.t < 1000 || before.map !== frame.map) {
            continue;
        }

        const step = Math.hypot(frame.at[0] - before.at[0], frame.at[1] - before.at[1]);

        if (step > room) {
            jumps++;
            jumped += step - room;
        }

        biggest = Math.max(biggest, step);

        const ideal = hostAt(frame.t + rtt / 2);

        if (ideal.map === frame.map) {
            errors.push(Math.hypot(frame.at[0] - ideal.x, frame.at[1] - ideal.y));
        }
    }

    return { jumps, jumped, biggest, mean: errors.reduce((sum, e) => sum + e, 0) / Math.max(1, errors.length), most: Math.max(0, ...errors) };
}
