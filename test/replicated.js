// A mirror for each player of a Host (core/mirror.js; the scaling plan's 3-16), for any test
// that plays one: `mirrored(host)` has the view feed make every player's frames after each
// advance (core/viewfeed.js, dark), a mirror take them, and the mirror held to the host's own
// battle. A test that plays an ambush, an invasion or a trade is then a test of replication
// too, for a little of its time; it fails as soon as a mirror and the world disagree.
//
// What's held, each time the host's advanced:
//   - who a mirror knows of is just who the feed says that player's been told of, by index;
//   - of each, whatever's been told since it last changed is as the world has it: where it is to
//     the centimetre, its heading, how it's going, its health, whom it aims at;
//   - the mirror was told nothing that couldn't be so (its `faults`);
//   - and reading a mirror's character for what the wire never says throws (strict).
import assert from "node:assert/strict";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { Mirror } from "../client/js/core/mirror.js";
import { NONE } from "../client/js/core/view.js";
import { ViewFeed } from "../client/js/core/viewfeed.js";

const FIELDS = ["place", "heading", "going", "health", "target"];

/**
 * What every mirror made in this process has done, in all: the hosts mirrored, the times they
 * were held to their worlds, the frames taken, the most any mirror knew of at once.
 * `MIRROR_TALLY=1` says it as the process ends, to see that a test file's mirrors had work.
 */
export const tally = { hosts: 0, checked: 0, frames: 0, most: 0 };

if (process.env.MIRROR_TALLY) {
    process.on("exit", () => console.log(`mirrors: ${JSON.stringify(tally)}`));
}

/** How a player's mirror and the world differ, as lines: none, if they agree. */
export function mismatches(host, feed, mirrors) {
    const found = [];

    for (const viewer of feed.viewers.values()) {
        // (A player with no hero in the battle just now is made no frames)
        if (!host.battle.actor(viewer.id)) {
            continue;
        }

        const mirror = mirrors.get(viewer.id);
        const say = (line) => found.push(`${viewer.id}: ${line}`);

        if (!mirror) {
            if (viewer.list.some(({ who }) => who)) {
                say("told of someone, and has no mirror");
            }

            continue;
        }

        mirror.faults.forEach(say);

        for (let index = 0; index < mirror.known.length; index++) {
            const [entry, held] = [viewer.byIndex[index], mirror.known[index]];

            if (Boolean(entry?.who) !== Boolean(held)) {
                say(`${index} is ${entry?.who ? `${entry.actor.id}, whom the mirror doesn't know of` : `${held.actor.id} in the mirror, and no one's`}`);
                continue;
            }

            if (!held) {
                continue;
            }

            // (Read as a game would: only what the wire's said, or it throws)
            const actor = mirror.actor(index);

            if (actor.id !== entry.actor.id) {
                say(`${index} is ${entry.actor.id}, and ${actor.id} in the mirror`);
                continue;
            }

            if (entry.sent < 0 || entry.slot < 0) {
                continue;
            }

            const { state } = feed;
            const fresh = Object.fromEntries(FIELDS.map((field) => [field, state.changed[field][entry.slot] <= entry.sent]));
            const aimed = viewer.byActor.get(state.target[entry.slot]);
            const target = aimed?.entered ? aimed.index : NONE;

            if (fresh.place && (Math.round(actor.x * 100) !== state.x[entry.slot] || Math.round(actor.y * 100) !== state.y[entry.slot])) {
                say(`${actor.id} is at ${actor.x}, ${actor.y} in the mirror, and at ${state.x[entry.slot] / 100}, ${state.y[entry.slot] / 100}`);
            }

            if (fresh.heading && held.heading !== state.heading[entry.slot]) {
                say(`${actor.id} faces ${held.heading} in the mirror, and ${state.heading[entry.slot]}`);
            }

            if (fresh.going && (held.going !== state.going[entry.slot] || held.speed !== state.speed[entry.slot])) {
                say(`${actor.id} goes ${held.going} at ${held.speed} in the mirror, and ${state.going[entry.slot]} at ${state.speed[entry.slot]}`);
            }

            if (fresh.health && held.health !== state.health[entry.slot]) {
                say(`${actor.id} has ${held.health} of its health in the mirror, and ${state.health[entry.slot]}`);
            }

            if (fresh.target && held.target !== target) {
                say(`${actor.id} aims at ${held.target} in the mirror, and at ${target}`);
            }
        }
    }

    return found;
}

/**
 * Mirrors on a host's players from now on: after each `host.advance`, every player's frames are
 * made and taken, and the test fails if a mirror and the world disagree. Returns { feed, mirrors
 * (by player id), checked (how many times they were held to it) }.
 */
export function mirrored(host, { budget = null } = {}) {
    const feed = new ViewFeed({ host });
    const mirrors = new Map();
    const told = { feed, mirrors, checked: 0 };
    const advance = host.advance;

    feed.mode = "dark";

    if (budget !== null) {
        feed.budget = budget;
    }

    feed.onFrame = (id, bytes) => {
        if (!mirrors.has(id)) {
            mirrors.set(id, new Mirror(new Battle(host.battle.world, { seed: host.battle.seed }), { strict: true, stepMs: STEP_MS }));
        }

        assert.ok(mirrors.get(id).apply(bytes), `${id}'s mirror couldn't read a frame`);
        tally.frames++;
        tally.most = Math.max(tally.most, mirrors.get(id).size);
    };

    tally.hosts++;

    // (Not a field of the host's that anything that goes through its fields would find)
    Object.defineProperty(host, "advance", {
        configurable: true,
        writable: true,
        enumerable: false,
        value(...given) {
            const events = advance.apply(host, given);

            feed.heard(events);
            feed.flush(Math.floor(host.battle.time / STEP_MS));

            const found = mismatches(host, feed, mirrors);

            told.checked++;
            tally.checked++;
            assert.deepEqual(found.slice(0, 8), [], `a mirror and the world disagree at ${host.battle.time} ms (${found.length} ways)`);

            return events;
        },
    });

    return told;
}
