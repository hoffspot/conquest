// The view feed (core/viewfeed.js; the scaling plan's 3-14): each player's known set, and their
// frames made dark: counted and let go of, lockstep going on as it was beside them
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { Hosting, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { COUNTERS, FLUSH_PASSES } from "../client/js/core/probe.js";
import { cmOf, decodeFrame, NONE, VIEW } from "../client/js/core/view.js";
import { ENTERS, KNOWN, VIEW_MODES, ViewFeed } from "../client/js/core/viewfeed.js";
import { encode } from "../client/js/core/wire.js";
import { startFor } from "../client/js/core/worldplan/plan.js";

const hero = (name, race) => ({ name, race, shape: {}, look: {}, weapon: "sword", boots: false });

// The same rolls every time
function roller(seed) {
    let state = seed;

    return () => (state = (Math.imul(state, 1103515245) + 12345) >>> 0) / 2 ** 32;
}

// A world (seed 2) with a player in the humans' start town and another in the elves', and two who
// join it over a link that only keeps what's sent; played `steps`, everyone sent somewhere near
// every second. Its view feed as `mode` says. Returns its sums, what was sent, and the hosting
function played(steps, mode, each = () => {}) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });
    const sent = [];
    const hosting = new Hosting(host, { send: (peer, text) => sent.push(`${peer} ${text}`) });
    const sums = [];
    const roll = roller(9);
    const homes = ["human", "elf"].map((race, k) => {
        const { at } = startFor(world.plan, race);

        host.join({ id: `p${k + 1}`, hero: hero(`P${k + 1}`, race), square: [Math.round(at[0]), Math.round(at[1])], map: "town" });

        return at;
    });

    host.populate();
    hosting.views.mode = mode;

    // (Before anyone's joined or a step's played, for whoever wants to hear the first frames)
    each(hosting, -1);
    hosting.hear("a", encode({ kind: "hello", version: NET_VERSION, character: { hero: hero("Ann", "human") } }));
    hosting.hear("b", encode({ kind: "hello", version: NET_VERSION, character: { hero: hero("Bea", "orc") } }));

    for (let k = 0; k < steps; k++) {
        if (k % 20 === 0) {
            homes.forEach(([x, y], n) => host.command(`p${n + 1}`, { type: "move", to: [Math.round(x + (roll() - 0.5) * 60), Math.round(y + (roll() - 0.5) * 60)], run: k % 40 === 0 }));
        }

        host.advance(STEP_MS);
        hosting.flush();
        sums.push(host.checksum());
        each(hosting, k);
    }

    return { sums, sent, hosting, host };
}

let made = 0;

// Someone standing somewhere, with what the feed and its frames read
const someone = (x, y, more = {}) => ({ id: `s${made++}`, map: "town", x, y, facing: 0, progress: null, dead: false, running: false, pace: 1.4, attack: null, target: null, order: null, hp: 20, maxHp: 20, ...more });

// A world of them, as far as the feed asks: its players (their heroes among `actors`), who's
// hostile to whom (those marked `foe`, to anyone)
function worldOf(actors, players) {
    const battle = { actors, actor: (id) => actors.find((actor) => actor.id === id) ?? null, hostile: (a, b) => Boolean(a.foe) !== Boolean(b.foe) };

    return { host: { battle, players: new Map(players.map((actor) => [actor.id, {}])) } };
}

// A feed over such a world, dark, each player's frames read as their game would read them:
// `mirrors` (id -> index -> what they've been told), `leaves` (id -> every index told as left)
function feedOf(hosting) {
    const feed = new ViewFeed(hosting);
    const mirrors = new Map();

    feed.mode = "dark";
    feed.onFrame = (id, bytes, step) => {
        const frame = decodeFrame(bytes);
        const mirror = mirrors.get(id) ?? mirrors.set(id, new Map()).get(id);

        assert.ok(frame, "a frame that reads back");
        assert.equal(frame.step, step);
        // (What its budget holds, and beside it those who've left and who's come)
        assert.ok(bytes.length <= feed.budget + KNOWN.most + ENTERS.frame + 8, `${bytes.length} bytes`);

        for (const index of frame.leaves) {
            assert.ok(mirror.delete(index), `${index} left, and was known`);
        }

        for (const { index, ...fields } of frame.records) {
            mirror.set(index, { ...mirror.get(index), ...fields });
        }
    };

    return { feed, mirrors };
}

// Who a player's game has been told of, as characters: by their indexes, through the feed's own table
const toldOf = (feed, mirrors, id) => new Set([...mirrors.get(id).keys()].map((index) => feed.viewers.get(id).byIndex[index]?.actor));

describe("the view feed (core/viewfeed.js)", () => {
    it("is off unless it's turned on, and dark changes nothing of the world or of what lockstep sends: the same sums, the same sendings", () => {
        const off = played(120, "off");
        const dark = played(120, "dark");

        assert.deepEqual(VIEW_MODES, ["off", "dark", "on"]);
        assert.equal(new Hosting(off.host, { send() {} }).views.mode, "off");
        assert.deepEqual(off.hosting.views.totals, { frames: 0, bytes: 0, records: 0, steps: 0 });
        assert.equal(off.hosting.views.viewers.size, 0);
        assert.equal(off.hosting.views.state.size, 0);

        assert.deepEqual(dark.sums, off.sums);
        assert.deepEqual(dark.sent, off.sent);
        assert.ok(dark.hosting.views.totals.frames > 0);
        assert.ok(FLUSH_PASSES.includes("flush.views"));
        assert.ok(["views.frames", "views.bytes", "views.records", "views.known"].every((name) => COUNTERS.includes(name)));
    });

    it("makes every player a frame of what's changed among those near their hero, each record as the character stands that step; all within a budget", () => {
        const told = new Map();
        let records = 0;
        const { hosting, host } = played(200, "dark", (hosting, step) => {
            const feed = hosting.views;
            const { host } = hosting;

            feed.onFrame ??= (id, bytes, at) => {
                const frame = decodeFrame(bytes);
                const viewer = feed.viewers.get(id);

                assert.equal(at, hosting.step());
                assert.ok(bytes.length <= VIEW.budget + (frame.sections.enters ? ENTERS.frame + 8 : 0), `${bytes.length} bytes`);

                for (const record of frame.records) {
                    const { actor } = viewer.byIndex[record.index];

                    if ("x" in record) {
                        assert.deepEqual([record.x, record.y], [cmOf(actor.x), cmOf(actor.y)], `${actor.id} at step ${at}`);
                    }

                    if ("target" in record && record.target !== NONE) {
                        assert.equal(viewer.byIndex[record.target].actor.id, actor.target);
                    }

                    told.set(id, (told.get(id) ?? new Set()).add(actor));
                    records++;
                }
            };

            // (As each player's known set is looked at again: everyone within 160 m of their hero,
            // on its map, is in it; no one beyond 192 m is, but whom it's aiming at)
            for (const viewer of step < 0 ? [] : feed.viewers.values()) {
                if ((hosting.step() + viewer.phase) % KNOWN.every !== 0) {
                    continue;
                }

                const me = host.battle.actor(viewer.id);
                const apart = (actor) => Math.hypot(actor.x - me.x, actor.y - me.y);

                for (const actor of host.battle.actors) {
                    if (actor.map === me.map && apart(actor) <= KNOWN.enter) {
                        assert.ok(viewer.byActor.has(actor), `${actor.id} is ${apart(actor)} m from ${viewer.id} at step ${step}`);
                    }
                }

                for (const { actor } of viewer.list) {
                    assert.ok((actor.map === me.map && apart(actor) <= KNOWN.leave) || actor.id === me.target || actor.target === me.id, `${actor.id} known to ${viewer.id}`);
                }
            }
        });
        const feed = hosting.views;

        // (All four players: the two the world began with, and the two who joined)
        assert.equal(feed.viewers.size, 4);
        assert.equal(host.players.size, 4);
        assert.ok(records > 20, `${records} records`);

        for (const viewer of feed.viewers.values()) {
            assert.ok(viewer.frames > 0 && viewer.list.length >= 1, `${viewer.id}: ${viewer.frames} frames, ${viewer.list.length} known`);
            assert.equal(viewer.byActor.get(host.battle.actor(viewer.id)).index, 0, "their own hero first");
            assert.ok(told.get(viewer.id)?.size >= viewer.list.length, `everyone ${viewer.id} knows of has been told of: ${told.get(viewer.id)?.size} of ${viewer.list.length}`);

            // (A second's bytes, at 20 steps: inside what a client's given)
            assert.ok((viewer.bytes / 200) * (1000 / STEP_MS) <= 20000, `${viewer.id}: ${viewer.bytes} bytes in 200 steps`);
        }

        assert.equal(feed.totals.frames, [...feed.viewers.values()].reduce((sum, viewer) => sum + viewer.frames, 0));
        assert.ok(new Set([...feed.viewers.values()].map(({ phase }) => phase)).size === 4, "each looks again on a step of their own");

        // (Turned off: everything let go of, and nothing more made)
        const before = { ...feed.totals };

        feed.mode = "off";
        host.advance(STEP_MS);
        hosting.flush();
        assert.equal(feed.viewers.size, 0);
        assert.equal(feed.state.size, 0);
        assert.deepEqual(feed.totals, before);
    });

    it("tells of those who leave a player's known set and gives their indexes to those who come, so a game told every frame knows just whom the feed says it does", () => {
        const me = someone(0, 0);
        const near = Array.from({ length: 30 }, (_, k) => someone(10 + k * 5, 0));
        const far = Array.from({ length: 20 }, (_, k) => someone(2000 + k * 3, 50));
        const elsewhere = someone(5, 5, { map: "inside:3" });
        const hosting = worldOf([me, ...near, ...far, elsewhere], [me]);
        const { feed, mirrors } = feedOf(hosting);
        let step = 0;
        const run = (steps) => {
            for (let k = 0; k < steps; k++) {
                feed.flush(step++);
            }
        };

        run(10);

        const viewer = feed.viewers.get(me.id);

        assert.deepEqual(toldOf(feed, mirrors, me.id), new Set([me, ...near]));
        assert.equal(feed.state.size, 31, "only those someone knows of are kept");
        // (The newcomers told of some nine a frame, who each is and then how; then no frames:
        // no one's changed)
        const first = feed.totals.frames;

        assert.ok(first >= 2 && first <= 6, `${first} frames for 31 newcomers`);
        assert.equal(feed.viewers.get(me.id).enters, 31);
        run(5);
        assert.equal(feed.totals.frames, first);

        // (165 m off: not come in. 161 m having been in: not left. Past 192 m: left)
        const edge = someone(165, 0);

        hosting.host.battle.actors.push(edge);
        run(5);
        assert.ok(!viewer.byActor.has(edge));
        edge.x = 159;
        run(5);
        assert.ok(viewer.byActor.has(edge));
        edge.x = 185;
        run(5);
        assert.ok(viewer.byActor.has(edge), "between the two, whoever's in stays in");
        edge.x = 193;
        run(5);
        assert.ok(!viewer.byActor.has(edge));
        assert.deepEqual(toldOf(feed, mirrors, me.id), new Set([me, ...near]));

        // (The hero goes far off, to the others: everyone here leaves, everyone there comes,
        // their indexes those just let go of; and its own stays the first)
        me.x = 2020;
        me.y = 50;
        run(6);
        assert.deepEqual(toldOf(feed, mirrors, me.id), new Set([me, ...far]));
        assert.deepEqual(new Set(viewer.list.map(({ actor }) => actor)), new Set([me, ...far]));
        assert.equal(viewer.byActor.get(me).index, 0);
        assert.ok(viewer.list.every(({ index }) => index < 31), "indexes used again");
        assert.equal(feed.state.size, 21, "those known to no one let go of");

        // (Onto another map: only those there)
        Object.assign(me, { map: "inside:3", x: 4, y: 4 });
        run(6);
        assert.deepEqual(toldOf(feed, mirrors, me.id), new Set([me, elsewhere]));

        // (One gone from the battle altogether leaves like any other)
        hosting.host.battle.actors.splice(hosting.host.battle.actors.indexOf(elsewhere), 1);
        run(6);
        assert.deepEqual(toldOf(feed, mirrors, me.id), new Set([me]));

        // (The player gone from the world: everything of theirs let go of)
        hosting.host.players.delete(me.id);
        run(1);
        assert.equal(feed.viewers.size, 0);
        assert.equal(feed.state.size, 0);
        assert.equal(feed.known.size, 0);
    });

    it("keeps whom the hero's aiming at and whoever's aiming at it however far off, and says whom someone's aiming at once the player knows of them", () => {
        const me = someone(0, 0);
        const quarry = someone(900, 0);
        const hunter = someone(0, 180, { target: me.id });
        const friend = someone(20, 0, { target: null });
        const stranger = someone(170, 0);
        const hosting = worldOf([me, quarry, hunter, friend, stranger], [me]);
        const { feed, mirrors } = feedOf(hosting);
        let step = 0;
        const run = (steps) => {
            for (let k = 0; k < steps; k++) {
                feed.flush(step++);
            }
        };

        me.target = quarry.id;
        friend.target = stranger.id;
        run(6);

        const viewer = feed.viewers.get(me.id);
        const indexOf = (actor) => viewer.byActor.get(actor)?.index;

        assert.deepEqual(toldOf(feed, mirrors, me.id), new Set([me, quarry, hunter, friend]));
        assert.equal(mirrors.get(me.id).get(indexOf(quarry)).x, 90000, "too far for the frame's origin: its place in full");
        assert.equal(mirrors.get(me.id).get(indexOf(me)).target, indexOf(quarry));
        assert.equal(mirrors.get(me.id).get(indexOf(hunter)).target, indexOf(me));
        assert.equal(mirrors.get(me.id).get(indexOf(friend)).target, NONE, "aiming at someone the player doesn't know of");

        // (The stranger comes near: now it can be said whom the friend's aiming at)
        stranger.x = 150;
        run(6);
        assert.equal(mirrors.get(me.id).get(indexOf(friend)).target, indexOf(stranger));

        // (No longer aimed at, nor aiming: each leaves, being too far off to be known of otherwise)
        me.target = null;
        hunter.target = null;
        hunter.y = 400;
        run(6);
        assert.deepEqual(toldOf(feed, mirrors, me.id), new Set([me, friend, stranger]));
    });

    it("holds 256 at the most: those pinned, then those hostile to the hero, then the rest, the nearer first; and two players who know of the same character share its one slot", () => {
        const roll = roller(31);
        const me = someone(0, 0);
        const other = someone(30, 0);
        const crowd = Array.from({ length: 400 }, () => someone((roll() - 0.5) * 200, (roll() - 0.5) * 200));
        const foes = Array.from({ length: 40 }, (_, k) => someone(150, -40 + k * 2, { foe: true }));
        const quarry = someone(155, 80, { foe: true });
        const hosting = worldOf([me, other, ...crowd, ...foes, quarry], [me, other]);
        const { feed, mirrors } = feedOf(hosting);

        me.target = quarry.id;

        for (let step = 0; step < 60; step++) {
            feed.flush(step);
        }

        const viewer = feed.viewers.get(me.id);
        const known = new Set(viewer.list.map(({ actor }) => actor));
        const apart = (actor) => Math.hypot(actor.x - me.x, actor.y - me.y);
        const left = [other, ...crowd].filter((actor) => !known.has(actor));
        const kept = [other, ...crowd].filter((actor) => known.has(actor));

        assert.equal(viewer.list.length, KNOWN.most);
        assert.ok(known.has(me) && known.has(quarry));
        assert.ok(foes.every((foe) => known.has(foe)), "every foe, though each is further off than most of the crowd");
        assert.ok(left.length > 100);
        assert.ok(Math.max(...kept.map(apart)) <= Math.min(...left.map(apart)), "of the rest, the nearer");
        assert.deepEqual(toldOf(feed, mirrors, me.id), known, "and all 256 told of, some nine a frame as they come in");
        assert.ok(new Set(viewer.list.map(({ index }) => index)).size === KNOWN.most);

        // (The other player knows of many of the same: one slot each, whoever knows of them)
        const theirs = new Set(feed.viewers.get(other.id).list.map(({ actor }) => actor));
        const either = new Set([...known, ...theirs]);

        assert.ok([...theirs].filter((actor) => known.has(actor)).length > 100);
        assert.equal(feed.state.size, either.size);
        assert.equal(feed.totals.steps, 60);
    });
});
