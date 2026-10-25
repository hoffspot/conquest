// Playing together (docs/WAR.md M11: client/js/core/netplay.js, with core/host.js): a world opened
// to others; one who joins sent it as it is, then everything done in it, which they do again on
// their own copy, step for step, and come out the same; their commands done by the host, and
// what came of them heard; players of another people brought in by their own people's town;
// those who leave gone from every copy; a copy gone astray set right, and every copy after a link
// drops; told when the host's stopped; those who can't join told why; the ways the host's
// characters find over the navigation meshes taken by every copy, never found again; where the
// host's characters stand compared every few steps (the motion stream), a copy gone astray found
// at once; the link timed; and steps kept in hand, as many as the host's sendings' unevenness asks;
// and what's said in a party heard by those in it, sent to no one else
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { newGuid } from "../client/js/core/guid.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { Navigation } from "../client/js/core/navigation.js";
import { MOTION } from "../client/js/core/motion.js";
import { CHAT, chatLine, characterFrom, CHECK_EVERY, Hosting, Joining, LATELY, MOST_PLAYERS, NET_KICKS, NET_VERSION, PACE, PLAYOUT, QUIET, SELF, spawnFor, versionShort, versionWords } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { selfOf } from "../client/js/core/selfstate.js";
import { decode, encode } from "../client/js/core/wire.js";
import { startFor } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const guest = (name, race = "human", weapon = "bow") => ({ hero: { name, shape: {}, look: {}, weapon, boots: false, race }, progress: { gold: 50 } });

// A host's world with its player in it, opened to others over a link that carries what's said
// (queued, both ways, as a relay would), and a way to deliver all of it
function opened({ seed = 2 } = {}) {
    const host = new Host(buildWorld({ seed }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const post = [];
    const joiners = new Map();
    const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
    let next = 1;

    // Someone joining (with a clock, if it's to time the link; on a link of their own, unless
    // it's one they had before), their game making its copy of the world when it's welcomed
    const join = (character, { clock, peer = `p${next++}` } = {}) => {
        const joining = new Joining({ send: (text) => post.push({ from: peer, text }), clock });

        joining.onWelcome = ({ seed: worldSeed, race, snapshot }) => {
            joining.attach(Host.restore(buildWorld({ seed: worldSeed, race }), snapshot));
        };
        joiners.set(peer, joining);
        joining.hello(character);
        deliver();

        return { peer, joining };
    };

    const deliver = () => {
        while (post.length) {
            const { to, from, text } = post.shift();

            if (from) {
                hosting.hear(from, text);
            } else {
                joiners.get(to)?.hear(text);
            }
        }
    };

    // The host's world moved on (its steps, as its game plays them), and what's done sent
    const play = (steps) => {
        for (let k = 0; k < steps; k++) {
            host.advance(STEP_MS);
        }

        hosting.flush();
        deliver();
    };

    // A joined game playing all it's been sent: the events it made
    const catchUp = (joining) => {
        const events = [];

        for (let events_ = joining.step(); events_; events_ = joining.step()) {
            events.push(...events_);
        }

        deliver();

        return events;
    };

    return { host, hosting, join, deliver, play, catchUp, post };
}

// Everyone in a world, where they are and how they are
const positions = (host) => host.battle.actors.map(({ id, x, y, hp, map, dead }) => ({ id, x, y, hp, map, dead })).sort((a, b) => a.id.localeCompare(b.id));

describe("playing together (netplay.js)", () => {
    it("sends one who joins the world as it is, then all that's done in it: their copy comes out the same, step for step", () => {
        const { host, join, play, catchUp } = opened();

        play(40);

        const { joining } = join(guest("Bryn"));

        assert.equal(joining.me, "guest-1");
        assert.ok(host.players.has("guest-1"));
        assert.ok(joining.host.players.has("guest-1"));
        assert.deepEqual(positions(joining.host), positions(host));

        // The host's player walks off, the world goes on: the copy plays it all again
        host.command(HOST_PLAYER, { type: "move", to: [host.battle.actor(HOST_PLAYER).square[0] + 6, host.battle.actor(HOST_PLAYER).square[1]] });
        play(60);
        assert.ok(joining.behind > 0);
        catchUp(joining);
        assert.equal(joining.behind, 0);
        assert.equal(joining.host.battle.time, host.battle.time);
        assert.deepEqual(positions(joining.host), positions(host));
        assert.equal(joining.host.checksum(), host.checksum());

        // (Nothing to play: it waits)
        assert.equal(joining.step(), null);
    });

    it("has a joined copy work out the same light at night as the host (core/light.js), seeing as far: the same, step for step", () => {
        const { host, join, play, catchUp } = opened();

        Object.assign(host.war, { turn: 41, clock: 30000 });
        play(10);

        const { joining } = join(guest("Bryn", "human", "sword"));

        host.command(HOST_PLAYER, { type: "move", to: [host.battle.actor(HOST_PLAYER).square[0] + 8, host.battle.actor(HOST_PLAYER).square[1]] });
        play(80);
        catchUp(joining);

        assert.ok(host.battle.light.sky < 1 && host.battle.light.lit.length > 0);
        assert.deepEqual(joining.host.battle.light, host.battle.light);
        assert.deepEqual(positions(joining.host), positions(host));
        assert.equal(joining.host.checksum(), host.checksum());
    });

    it("has a joined copy take the ways the host's characters found, finding none of its own", () => {
        const { host, hosting, join, play, catchUp } = opened();
        const { joining } = join(guest("Bryn"));
        const ways = [];
        const record = host.recorder;

        host.recorder = (op) => {
            if (op[0] === "v") {
                ways.push(op);
            }

            record(op);
        };

        // The host's player and the guest walk off, and the world's people go about their business
        const [x, y] = host.battle.actor(HOST_PLAYER).square;

        host.command(HOST_PLAYER, { type: "move", to: [x + 9, y + 4] });
        joining.command({ type: "move", to: [x - 6, y + 3] });
        hosting.flush();

        // (Counting the ways the copy finds itself)
        const path = Navigation.prototype.path;
        let found = 0;

        try {
            play(CHECK_EVERY * 2);
            Navigation.prototype.path = function (...args) {
                found++;

                return path.apply(this, args);
            };
            catchUp(joining);
        } finally {
            Navigation.prototype.path = path;
        }

        assert.ok(ways.length >= 3, `the host found ${ways.length} ways`);
        assert.ok(ways.every(([, time, id, way]) => Number.isFinite(time) && typeof id === "string" && way.every(([wx, wy]) => wx === Math.round(wx * 100) / 100 && wy === Math.round(wy * 100) / 100)), "each to the centimetre");
        assert.equal(found, 0, "the copy found none of its own");
        assert.deepEqual(joining.host.replay, [], "and took every one");
        assert.deepEqual(positions(joining.host), positions(host));
        assert.equal(joining.host.checksum(), host.checksum());
    });

    it("does a joined player's commands in the host's world, and they hear what came of them", () => {
        const { host, join, play, catchUp, deliver } = opened();
        const { joining } = join(guest("Bryn"));
        const me = host.battle.actor("guest-1");
        const to = [me.square[0], me.square[1] + 5];
        const heard = [];

        const sent = joining.command({ type: "move", to }, (result) => heard.push(result));

        assert.deepEqual(sent, { ok: true, pending: true, seq: 1 });
        deliver();
        assert.deepEqual(heard, [], "(not till it's been done)");
        play(1);
        catchUp(joining);
        assert.deepEqual(heard, [{ ok: true }]);

        // Refused there, refused here
        joining.command({ type: "engage", target: "nobody" }, (result) => heard.push(result));
        deliver();
        play(1);
        catchUp(joining);
        assert.deepEqual(heard[1], { ok: false, reason: "target" });

        // Walked there, in both worlds
        play(80);
        catchUp(joining);
        assert.deepEqual(host.battle.actor("guest-1").square, to);
        assert.deepEqual(joining.host.battle.actor("guest-1").square, to);
        assert.equal(joining.host.checksum(), host.checksum());
    });

    it("tells each joined player alone where their own hero is as the host has them, and the last of their commands done: counted from the first again when they come back", () => {
        const { host, hosting, join, play, deliver } = opened();
        const bryn = join(guest("Bryn"));
        const cai = join(guest("Cai"));

        play(1);

        for (const { joining } of [bryn, cai]) {
            assert.deepEqual(joining.self.hero, selfOf(host.battle.actor(joining.me)));
            assert.equal(joining.self.seq, 0);
        }

        // (Standing as they were, told again once a second all the same)
        play(SELF.again / STEP_MS);
        assert.equal(cai.joining.self.time, host.battle.time);

        const me = host.battle.actor(bryn.joining.me);

        bryn.joining.command({ type: "move", to: [me.square[0], me.square[1] + 5] });
        deliver();
        play(1);
        assert.equal(bryn.joining.self.seq, 1, "(done)");
        assert.equal(cai.joining.self.seq, 0, "(not theirs)");
        assert.ok(bryn.joining.self.hero.order, "(going there)");

        // Gone, and back on the same link: what they send counted from the first again
        hosting.gone(bryn.peer);
        deliver();

        const back = join(guest("Bryn"), { peer: bryn.peer });

        play(1);
        assert.equal(back.joining.self.seq, 0);
    });

    it("stops a joined player's hero where they stand once their game's gone quiet (their link dropped), in every copy; one still talking isn't; heard from again, they go as they ask", () => {
        const { host, join, play, deliver, catchUp } = opened();
        const bryn = join(guest("Bryn"));
        const cai = join(guest("Cai"));
        const far = (who) => {
            const me = host.battle.actor(who.joining.me);

            return [me.square[0] + 30, me.square[1]];
        };

        play(1);
        bryn.joining.command({ type: "move", to: far(bryn) });
        cai.joining.command({ type: "move", to: far(cai) });
        deliver();
        play(1);

        // (Cai's game asks how long a word takes now and then, as a game does; Bryn's has gone)
        for (let k = 0; k < QUIET.ms / STEP_MS + 2; k++) {
            if (k % 20 === 0) {
                cai.joining.ping();
            }

            play(1);
        }

        catchUp(cai.joining);

        for (const battle of [host.battle, cai.joining.host.battle]) {
            assert.equal(battle.actor(bryn.joining.me).order, null, "(Bryn stopped)");
            assert.deepEqual(battle.actor(bryn.joining.me).path, []);
            assert.ok(battle.actor(cai.joining.me).order, "(Cai going on)");
        }

        assert.equal(cai.joining.host.checksum(), host.checksum());

        // (Back: going where they're sent again, and not stopped again while they're heard from)
        bryn.joining.command({ type: "move", to: far(bryn) });
        deliver();
        play(1);
        assert.ok(host.battle.actor(bryn.joining.me).order);
    });

    it("drops a joined player's things on the ground in every copy, for another to pick up there", () => {
        const { host, join, play, catchUp, deliver } = opened();
        const { joining } = join({ ...guest("Bryn"), progress: { gold: 50, pack: [{ id: "potion", count: 4 }] } });
        const heard = [];

        // Two draughts dropped by the one who's joined, where they stand
        joining.command({ type: "drop", index: 0, count: 2 }, (result) => heard.push(result));
        deliver();
        play(1);
        catchUp(joining);
        assert.equal(heard[0].ok, true);
        assert.deepEqual([...host.ground.values()].map(({ item, by }) => ({ item, by })), [{ item: { id: "potion", quality: "common", count: 2 }, by: "guest-1" }]);
        assert.deepEqual([...joining.host.ground.values()], [...host.ground.values()]);
        assert.equal(joining.host.players.get("guest-1").progress.count("potion"), 2);

        // The host's player there picks them up: gone from every copy, in the host's pack
        const [dropped] = host.ground.values();

        assert.deepEqual(host.command(HOST_PLAYER, { type: "move", to: [...dropped.square] }), { ok: true });

        for (let k = 0; k < 40 && host.command(HOST_PLAYER, { type: "pickUp", ground: dropped.id }).ok !== true; k++) {
            play(10);
        }

        play(1);
        catchUp(joining);
        assert.equal(host.ground.size, 0);
        assert.equal(joining.host.ground.size, 0);
        assert.equal(host.players.get(HOST_PLAYER).progress.count("potion"), 2);
        assert.equal(joining.host.checksum(), host.checksum());
    });

    it("brings a player of another people in by their own people's town, of their people", () => {
        const { host, join } = opened();
        const { joining } = join(guest("Syl", "elf"));
        const elf = host.battle.actor("guest-1");
        const town = startFor(host.world.plan, "elf");

        assert.equal(host.players.get("guest-1").realm, "elf");
        assert.equal(elf.team, "elf");
        assert.ok(Math.hypot(elf.x - town.at[0], elf.y - town.at[1]) < 40, `${elf.x}, ${elf.y} by ${town.at}`);
        assert.deepEqual(spawnFor(host.world, "human"), {}, "(the host's people: by the world's start)");
        assert.deepEqual(joining.host.battle.actor("guest-1").square, elf.square);

        // At war with the host's people: enemies; at peace: not
        host.war.relations[["elf", "human"].sort().join("|")] = { state: "hostile", since: 0 };
        assert.ok(host.battle.hostile(elf, host.battle.actor(HOST_PLAYER)));
        host.war.relations[["elf", "human"].sort().join("|")] = { state: "neutral", since: 0 };
        assert.ok(!host.battle.hostile(elf, host.battle.actor(HOST_PLAYER)));
    });

    it("tells every copy of another's coming and going; one who's gone is out of every world, their character kept", () => {
        const { host, hosting, join, play, catchUp } = opened();
        const first = join(guest("Bryn"));
        const left = [];

        hosting.onLeave = (id, peer, character) => left.push({ id, peer, name: character.hero.name });
        play(5);

        const second = join(guest("Cai", "human", "staff"));

        catchUp(first.joining);
        assert.ok(first.joining.host.players.has("guest-2"), "(the first told of the second)");
        assert.ok(second.joining.host.players.has("guest-1"), "(the second sent the first, in the world)");

        hosting.gone(second.peer);
        play(2);
        catchUp(first.joining);
        assert.deepEqual(left, [{ id: "guest-2", peer: second.peer, name: "Cai" }]);
        assert.ok(!host.players.has("guest-2"));
        assert.ok(!first.joining.host.players.has("guest-2"));
        assert.equal(first.joining.host.checksum(), host.checksum());

        // Closed to others: everyone who'd joined out, nothing more recorded
        hosting.stop();
        assert.deepEqual([...host.players.keys()], [HOST_PLAYER]);
        assert.equal(host.recorder, null);
    });

    it("has the same character coming in on another link take theirs over as it stands: the old link told why and let go of, the new one sent the world and told; no one else's, nor the host's", () => {
        const { host, hosting, join, play, catchUp } = opened();
        const ada = { ...guest("Bryn"), hero: { ...guest("Bryn").hero, guid: newGuid() } };
        const kicks = [];
        const left = [];

        hosting.onKick = (peer, reason) => kicks.push({ peer, reason });
        hosting.onLeave = (id) => left.push(id);

        const first = join(ada);
        const told = [];

        first.joining.onKicked = (reason) => told.push(reason);
        play(5);

        // (Hurt, and somewhere of their own, on the first link)
        Object.assign(host.battle.actor("guest-1"), { hp: 7 });

        const where = (id) => ({ hp: host.battle.actor(id).hp, square: [...host.battle.actor(id).square] });
        const before = where("guest-1");
        const second = join(ada);

        catchUp(first.joining);

        // (Taken over: the second link plays them, as they stood; the first told why, its link closed)
        assert.deepEqual([...hosting.players], [[second.peer, "guest-1"]]);
        assert.deepEqual(told, ["elsewhere"]);
        assert.equal(NET_KICKS.elsewhere, "You went into this world on another device, so this one has let go.");
        assert.deepEqual(kicks, [{ peer: first.peer, reason: "elsewhere" }]);
        assert.deepEqual(left, [], "not gone and come again");
        assert.deepEqual(where("guest-1"), before);
        assert.equal(second.joining.me, "guest-1");
        assert.equal(second.joining.took, true, "told it took them over");
        assert.equal(second.joining.host.checksum(), host.checksum());

        // (Another character, or one with no id of its own, comes in as a new guest; nor is the
        // host's own player ever taken over)
        const bryn = join({ ...guest("Bryn"), hero: { ...guest("Bryn").hero, guid: newGuid() } });
        const plain = join(guest("Cai"));
        const host_ = join({ ...guest("Ada"), hero: { ...guest("Ada").hero, guid: host.players.get(HOST_PLAYER).hero.guid ?? newGuid() } });

        assert.deepEqual([bryn, plain, host_].map(({ peer }) => hosting.players.get(peer)), ["guest-2", "guest-3", "guest-4"]);
        assert.equal(kicks.length, 1);
    });

    it("has a player who plays one character at a time (a world server's, under their own id) take theirs over coming in again; coming in with another, the one in the world goes, kept as it goes; another player with a copy of theirs never takes it", () => {
        const { host, hosting, join, play } = opened();
        const kicks = [];
        const left = [];
        const as = (name) => ({ ...guest(name), hero: { ...guest(name).hero, guid: newGuid() } });
        const ada = as("Ada");

        hosting.idOf = () => "player-a";
        hosting.byCharacter = false;
        hosting.onKick = (peer, reason) => kicks.push({ peer, reason });
        hosting.onLeave = (id, peer, character) => left.push({ id, peer, name: character.hero.name });

        const first = join(ada);

        play(3);

        const second = join(ada);

        assert.deepEqual([...hosting.players], [[second.peer, "player-a"]]);
        assert.deepEqual(kicks, [{ peer: first.peer, reason: "elsewhere" }]);
        assert.deepEqual(left, []);

        // (Another of theirs: the one in the world sent off, kept as it goes; this one in)
        const third = join(as("Bryn"));

        assert.deepEqual([...hosting.players], [[third.peer, "player-a"]]);
        assert.deepEqual(kicks.at(-1), { peer: second.peer, reason: "elsewhere" });
        assert.deepEqual(left, [{ id: "player-a", peer: second.peer, name: "Ada" }]);
        assert.equal(host.players.get("player-a").hero.name, "Bryn");
        assert.equal(third.joining.took, false);

        // (Another player, with a copy of that character, their own id: in beside them, not taking theirs)
        const copied = { ...guest("Bryn"), hero: { ...guest("Bryn").hero, guid: host.players.get("player-a").hero.guid } };

        hosting.idOf = () => "player-b";

        const fourth = join(copied);

        assert.deepEqual([...hosting.players], [
            [third.peer, "player-a"],
            [fourth.peer, "player-b"],
        ]);
        assert.equal(fourth.joining.took, false);
    });

    it("sets right a copy gone astray: at the next check it asks for the world again, and carries on from it", () => {
        const { host, join, play, catchUp } = opened();
        const { joining } = join(guest("Bryn"));
        const events = [];

        joining.onState = () => events.push("state");

        // (Something a hair different in the copy)
        joining.host.battle.actor("guest-1").hp -= 3;
        play(CHECK_EVERY);
        catchUp(joining);
        assert.deepEqual(events, ["state"]);
        assert.equal(joining.resyncs, 1);
        assert.equal(joining.astray, false);
        assert.deepEqual(positions(joining.host), positions(host));

        // (And it plays on the same)
        play(CHECK_EVERY);
        catchUp(joining);
        assert.deepEqual(events, ["state"]);
        assert.equal(joining.host.checksum(), host.checksum());
    });

    it("asks for the world as it now is when it's fallen too far behind to catch up step by step (PACE.tooFar), plays none of those steps, and carries on from it", () => {
        const { host, join, play, catchUp, deliver, post } = opened();
        const { joining, peer } = join(guest("Bryn"));
        const states = [];
        const asked = () => post.filter(({ from, text }) => from === peer && decode(text).kind === "again").length;

        joining.onState = () => states.push(joining.host.battle.time);

        // (A little behind: caught up a step at a time, as ever)
        play(PACE.tooFar);
        assert.equal(joining.behind, PACE.tooFar);
        catchUp(joining);
        assert.equal(joining.behind, 0);
        assert.deepEqual([joining.skips, joining.resyncs, states.length], [0, 0, 0]);

        // Too far behind (its page hidden a while, say): none of it played, and the world asked for, once
        play(PACE.tooFar + 1);

        const time = joining.host.battle.time;

        assert.equal(joining.step(), null);
        assert.equal(joining.step(), null);
        assert.equal(joining.farBehind, true);
        assert.equal(joining.skips, 1);
        assert.equal(joining.host.battle.time, time, "(none of the steps played)");
        assert.equal(asked(), 1);

        // (Sent it, at the host's step: what was waiting in it already, and on from there)
        deliver();
        assert.deepEqual(states, [host.battle.time]);
        assert.deepEqual([joining.farBehind, joining.behind, joining.resyncs], [false, 0, 1]);
        assert.equal(joining.host.checksum(), host.checksum());

        play(CHECK_EVERY);
        catchUp(joining);
        assert.equal(joining.desyncs, 0);
        assert.equal(joining.host.checksum(), host.checksum());
        assert.deepEqual(positions(joining.host), positions(host));
    });

    it("sends everyone the world again when the host's link comes back after a drop, what was sent meanwhile lost; one whose own came back asks for it", () => {
        const { host, hosting, join, play, catchUp, post, deliver } = opened();
        const bryn = join(guest("Bryn"));
        const cai = join(guest("Cai"));
        const states = [];

        bryn.joining.onState = () => states.push("bryn");
        cai.joining.onState = () => states.push("cai");
        catchUp(bryn.joining);
        catchUp(cai.joining);

        // The host's link drops: what it sends meanwhile never comes
        for (let k = 0; k < 30; k++) {
            host.advance(STEP_MS);
        }

        hosting.flush();
        post.length = 0;

        // Back: everyone sent the world as it now is, and on they play
        hosting.resync();
        deliver();
        assert.deepEqual(states.sort(), ["bryn", "cai"]);
        play(20);
        catchUp(bryn.joining);
        catchUp(cai.joining);
        assert.equal(bryn.joining.host.checksum(), host.checksum());
        assert.equal(cai.joining.host.checksum(), host.checksum());

        // Bryn's own link drops (and an ask for the world, already made, lost with it): asked again
        host.advance(STEP_MS);
        hosting.flush();
        post.length = 0;
        bryn.joining.astray = true;
        bryn.joining.resync();
        deliver();
        assert.deepEqual(states.sort(), ["bryn", "bryn", "cai"]);
        catchUp(bryn.joining);
        assert.equal(bryn.joining.host.checksum(), host.checksum());
    });

    it("tells everyone who's joined when the host's world is stopped, why, and going again; whoever joins meanwhile with their welcome, and whoever's sent the world again with it, so a lost word can't leave them thinking it's stopped", () => {
        const { hosting, join, post, deliver } = opened();
        const bryn = join(guest("Bryn"));

        hosting.pause("away");
        deliver();
        assert.deepEqual(bryn.joining.paused, { why: "away", by: null });

        // (Said once: saying it again sends nothing; another why, or another who, is said)
        hosting.pause("away");
        assert.equal(post.length, 0);
        hosting.pause("host", "Ada");
        deliver();
        assert.deepEqual(bryn.joining.paused, { why: "host", by: "Ada" });

        // (No more than a why it knows, and a name)
        hosting.pause("bored", 7);
        deliver();
        assert.equal(bryn.joining.paused, null);
        hosting.pause("host", "Ada");
        deliver();

        const cai = join(guest("Cai"));

        assert.deepEqual(cai.joining.paused, { why: "host", by: "Ada" }, "told with their welcome");

        // Going again: Cai's word of it lost (their link down a moment), and the world asked for
        // again as it comes back: going, it says
        hosting.pause(null);
        assert.ok(post.some(({ to }) => to === cai.peer));
        post.splice(0, post.length, ...post.filter(({ to }) => to !== cai.peer));
        deliver();
        assert.equal(bryn.joining.paused, null);
        assert.deepEqual(cai.joining.paused, { why: "host", by: "Ada" });
        cai.joining.resync();
        deliver();
        assert.equal(cai.joining.paused, null);

        // (And so the host's own link back: everyone sent the world, and whether it's stopped)
        hosting.pause("away");
        bryn.joining.paused = null;
        hosting.resync();
        deliver();
        assert.deepEqual(bryn.joining.paused, { why: "away", by: null });
    });

    it("hears a joined player's page hidden or shown, and their menu opened or shut (and if it's for everyone), each said as it changes; and, back on their link, how they are said again, but for a pause for everyone, which ended with it", () => {
        const { hosting, join, post, deliver } = opened();
        const bryn = join(guest("Bryn"));
        const heard = [];

        hosting.onAway = (peer, hidden) => heard.push(["away", peer, hidden]);
        hosting.onHold = (peer, held, everyone) => heard.push(["hold", peer, held, everyone]);

        bryn.joining.away(true);
        bryn.joining.hold(true);
        bryn.joining.hold(true);
        bryn.joining.hold(true, { everyone: true });
        deliver();
        assert.deepEqual(heard, [
            ["away", bryn.peer, true],
            ["hold", bryn.peer, true, false],
            ["hold", bryn.peer, true, true],
        ]);

        // (Everyone, only while it's held; and only from one who's joined)
        heard.length = 0;
        hosting.hear(bryn.peer, encode({ kind: "hold", held: false, everyone: true }));
        hosting.hear("nobody", encode({ kind: "hold", held: true, everyone: true }));
        assert.deepEqual(heard, [["hold", bryn.peer, false, false]]);

        // Back on its link (what it said meanwhile maybe lost): its page and its menu said again;
        // its pause for everyone not asked for again
        heard.length = 0;
        bryn.joining.hold(true, { everyone: true });
        deliver();
        heard.length = 0;
        bryn.joining.away(false);
        post.length = 0;
        bryn.joining.resync();
        deliver();
        assert.deepEqual(heard, [
            ["away", bryn.peer, false],
            ["hold", bryn.peer, true, false],
        ]);
        assert.equal(bryn.joining.everyone, false);
    });

    it("takes out of the world anyone who left while the host's link was down (the relay's word of who's still here)", () => {
        const { host, hosting, join, deliver } = opened();
        const bryn = join(guest("Bryn"));
        const left = [];

        join(guest("Cai"));
        hosting.onLeave = (id) => left.push(id);
        hosting.still([bryn.peer]);
        deliver();
        assert.deepEqual(left, ["guest-2"]);
        assert.ok(host.players.has("guest-1"));
        assert.ok(!host.players.has("guest-2"));
        assert.deepEqual([...hosting.players.keys()], [bryn.peer]);
    });

    it("tells a player turned away for another version which is the newer, and what to do about it", () => {
        const older = NET_VERSION - 1;
        const newer = NET_VERSION + 1;

        // (A player's own world: its host reloads theirs; this game reloads for the newest)
        assert.match(versionWords(older), /^That world plays an older version of the game than yours\. Ask whoever's hosting it to reload/);
        assert.match(versionWords(newer), /^That world plays a newer version of the game than yours\. Reload this page for the newest version\.$/);

        // (A world server: its own page always matches; its owner updates it)
        assert.match(versionWords(older, { server: true }), /^That server plays an older version .* Open the game from the server itself .* or ask its owner to update it\.$/);
        assert.match(versionWords(newer, { server: true }), /^That server plays a newer version .* Reload this page for the newest version, or open the game from the server itself/);

        // (One made before it said its version: which is newer can't be told)
        assert.match(versionWords(undefined, { server: true }), /^That server plays another version of the game than yours\. Open the game from the server itself/);
        assert.deepEqual([older, newer, undefined].map(versionShort), ["An older version of the game", "A newer version of the game: reload this page", "Another version of the game"]);
    });

    it("turns away a game of another version, a character that isn't one, and anyone when the world's full", () => {
        const { hosting, post, deliver } = opened();
        const refusals = [];
        const said = [];
        const hear = (peer) => {
            const joining = new Joining({ send: (text) => post.push({ from: peer, text }) });

            joining.onRefused = (reason, message) => {
                refusals.push(reason);
                said.push(message);
            };

            return joining;
        };

        // (Heard directly: another version, told the host's, for the joiner to say which is the newer)
        hosting.send = (peer, text) => hear(peer).hear(text);
        hosting.hear("p9", encode({ kind: "hello", version: NET_VERSION + 1, character: guest("Old") }));
        hosting.hear("p9", encode({ kind: "hello", version: NET_VERSION, character: { hero: { name: "" } } }));
        assert.deepEqual(refusals, ["version", "character"]);
        assert.equal(said[0].net, NET_VERSION);
        assert.equal(said[1].net, undefined);

        for (let k = 1; k < MOST_PLAYERS; k++) {
            hosting.hear(`q${k}`, encode({ kind: "hello", version: NET_VERSION, character: guest(`G${k}`) }));
        }

        hosting.hear("p10", encode({ kind: "hello", version: NET_VERSION, character: guest("One too many") }));
        assert.deepEqual(refusals, ["version", "character", "full"]);
        deliver();

        // (Nonsense is ignored)
        hosting.hear("p11", "not what's said at all");
        hosting.hear("p11", encode({ kind: "command", seq: 1, command: { type: "stop" } }));
    });

    it("brings a character in safe: its people one there is, its name trimmed, only real followers", () => {
        const safe = characterFrom({ hero: { name: "  Ada the Bold of the Long Marches  ", shape: {}, look: {}, weapon: "sword", race: "goblin", parts: ["catEars", 3] }, followers: [{ name: "Tam", calling: "warrior" }, { name: "Bad", calling: "dragon" }], talks: { knowledge: ["x", 1] } });

        assert.equal(safe.hero.name, "Ada the Bold of the");
        assert.equal(safe.hero.race, "human");
        assert.deepEqual(safe.hero.parts, ["catEars"]);
        assert.deepEqual(safe.followers, [{ name: "Tam", calling: "warrior" }]);
        assert.deepEqual(safe.talks.knowledge, ["x"]);
        assert.equal(characterFrom({ hero: { name: "Ada", shape: {}, look: {}, weapon: "cleaver" } }), null, "(not a weapon a player starts with)");
        assert.equal(characterFrom(null), null);
    });

    it("has every copy compare where the host's characters stand, every few steps: none astray in a long play, one 2 cm off found at once", () => {
        const { host, hosting, join, play, catchUp } = opened();
        const { joining } = join(guest("Bryn"));
        const me = () => host.battle.actor(HOST_PLAYER);
        const kinds = [];

        joining.onState = () => kinds.push("state");

        // (Both players walking about, their commands and the folk's going on)
        for (let round = 0; round < 60; round++) {
            if (round % 10 === 0) {
                host.command(HOST_PLAYER, { type: "move", to: [me().square[0] + (round % 20 ? -5 : 5), me().square[1] + 2], run: round % 30 === 0 });
                joining.command({ type: "move", to: [Math.floor(me().x) + 3, Math.floor(me().y) - 2] });
            }

            play(MOTION.every);
            catchUp(joining);
        }

        assert.equal(joining.motionChecks, 60);
        assert.equal(joining.checks, Math.floor((60 * MOTION.every) / CHECK_EVERY));
        assert.equal(joining.desyncs, 0);
        assert.equal(joining.resyncs, 0);
        assert.deepEqual(kinds, []);
        assert.ok(hosting.sent.motion > 0 && hosting.sent.ops > 0);
        assert.equal(joining.received.motion, hosting.sent.motion);

        // (A hair's difference, never: half a centimetre off is within rounding)
        const index = joining.host.battle.actors.findIndex(({ id }) => id === "guest-1");
        const theirs = joining.host.battle.actors[index];

        // (Their last walk done, however the town's market lies in their way)
        for (let more = 0; more < 20 && theirs.progress !== null; more++) {
            play(MOTION.every);
            catchUp(joining);
        }

        assert.equal(theirs.progress, null, "(standing: the copy's guest stays put, nudged)");
        theirs.x += 0.004;
        play(MOTION.every);
        catchUp(joining);
        assert.equal(joining.desyncs, 0);
        theirs.x -= 0.004;

        // (Two centimetres off: found the next time it's sent, well before the checksum, and set right)
        const checks = joining.checks;

        theirs.x += 0.02;
        play(MOTION.every);
        catchUp(joining);
        assert.equal(joining.desyncs, 1);
        assert.equal(joining.checks, checks, "(no checksum came meanwhile)");
        assert.deepEqual(kinds, ["state"]);
        assert.deepEqual(positions(joining.host), positions(host));

        play(MOTION.every * 4);
        catchUp(joining);
        assert.equal(joining.desyncs, 1);
        assert.equal(joining.host.checksum(), host.checksum());
    });

    it("stamps each sending with the host's step; times a word to the host and back by the joiner's clock", () => {
        const { host, join, play, post, deliver } = opened();
        let now = 1000;
        const { joining } = join(guest("Bryn"), { clock: () => now });
        const heard = [];
        const hear = joining.hear.bind(joining);

        joining.hear = (text) => {
            heard.push(decode(text));
            hear(text);
        };

        play(MOTION.every);
        assert.deepEqual(heard.map(({ kind }) => kind), ["ops", "motion", "self"]);
        assert.ok(heard.every(({ step }) => step === host.battle.time / STEP_MS));
        assert.equal(joining.hostStep, host.battle.time / STEP_MS);

        const pongs = [];

        joining.onPong = (ms) => pongs.push(ms);
        assert.equal(joining.rtt, null);
        joining.ping();
        now += 80;
        deliver();
        assert.equal(joining.rtt, 80);

        joining.ping();
        now += 40;
        deliver();
        assert.equal(joining.rtt, 75, "(smoothed)");
        assert.deepEqual(pongs, [80, 40], "each as it was heard (for the downloader)");
        assert.ok(post.length === 0);
    });

    it("has a joined game tell the host how long a word to it and back's been taking, with each ping: the slowest of them the host's to show", () => {
        const { hosting, join, deliver } = opened();
        let clock = 0;
        const first = join(guest("Bryn"), { clock: () => clock });
        const second = join(guest("Cai"), { clock: () => clock });

        assert.equal(hosting.slowest(), null, "none timed yet");

        // (Each times a round trip; told the next time it pings)
        first.joining.ping();
        clock += 120;
        deliver();
        second.joining.ping();
        clock += 300;
        deliver();
        assert.deepEqual([first.joining.lately, second.joining.lately], [120, 300]);
        first.joining.ping();
        second.joining.ping();
        deliver();

        assert.equal(hosting.slowest(), 300);

        // (Gone: theirs no longer counted)
        hosting.gone(second.peer);
        assert.equal(hosting.slowest(), 120);
    });

    it("says how long a word to the host and back's taken lately by the middle of the latest few round trips, the first held up as the world's built soon forgotten", () => {
        let now = 0;
        const sent = [];
        const joining = new Joining({ send: (text) => sent.push(decode(text)), clock: () => now });
        const trip = (ms) => {
            joining.ping();

            const { t } = sent.at(-1);

            now += ms;
            joining.hear(encode({ kind: "pong", t, step: 0 }));
        };

        assert.equal(joining.lately, null, "none timed yet");
        joining.ping();
        assert.equal(sent.at(-1).rtt, undefined, "nothing to tell the host yet");

        // (The first held up 15 s, the page busy building the world; then a quick link)
        trip(15000);
        assert.equal(joining.lately, 15000);
        trip(40);
        assert.equal(joining.lately, 40, "of two, the quicker");
        trip(60);
        assert.equal(joining.lately, 60);
        assert.ok(joining.rtt > 5000, "smoothed, still slow to forget it");

        // (Told the host with the next ping)
        joining.ping();
        assert.equal(sent.at(-1).rtt, 60);

        // (Only the latest LATELY count: a slow link's slow)
        for (let k = 0; k < LATELY; k++) {
            trip(500 + k);
        }

        assert.equal(joining.lately, 502);
        assert.equal(joining.trips.length, LATELY);
    });

    it("keeps steps in hand to cover how late the host's steps come, all but the latest few: the fewest when they come evenly; more while a link's held up often enough (a phone's), till it's been steady a while; none counted over a pause", () => {
        let now = 0;
        const joining = new Joining({ send: () => {}, clock: () => now });
        let step = 0;
        // (The host sends each step as it's done, each taking 60 ms to come and `late` more: in
        // order, those after one held up coming at once with it)
        const arrive = (late = 0) => {
            step++;
            now = Math.max(now, step * STEP_MS + 60 + late);
            joining.hear(encode({ kind: "ops", step, ops: [["a", STEP_MS, 1]] }));
        };

        for (let k = 0; k < 400; k++) {
            arrive();
        }

        assert.equal(joining.jitter, 0);
        assert.equal(joining.delay, PLAYOUT.least);

        // (Held up a moment once: too seldom to keep more in hand for)
        arrive(300);
        assert.equal(joining.delay, PLAYOUT.least);

        // (Held up 300 ms every second, as a weak mobile signal can be: the 300 ms not all
        // covered, the rest of the way run on, game.js RUN_ON)
        for (let k = 0; k < 400; k++) {
            arrive(k % 20 === 0 ? 300 : 0);
        }

        assert.ok(joining.jitter >= 100 && joining.jitter < 300, `${joining.jitter} ms`);
        assert.equal(joining.delay, Math.ceil(joining.jitter / STEP_MS));

        // (Steadily again: more kept in hand a while, then the fewest)
        for (let k = 0; k < 10; k++) {
            arrive();
        }

        assert.ok(joining.delay > PLAYOUT.least, "for a while after");

        for (let k = 0; k < PLAYOUT.remember / STEP_MS; k++) {
            arrive();
        }

        assert.equal(joining.delay, PLAYOUT.least);

        // (However late they come, no more than the most)
        for (let k = 0; k < 400; k++) {
            arrive(k % 20 === 0 ? 900 : 0);
        }

        assert.equal(joining.delay, PLAYOUT.most);

        // (Over a pause, the host's steps stopped: not late)
        for (let k = 0; k < PLAYOUT.remember / STEP_MS; k++) {
            arrive();
        }

        assert.equal(joining.delay, PLAYOUT.least);
        joining.hear(encode({ kind: "paused", paused: true, why: "away" }));
        now += 30000;
        joining.hear(encode({ kind: "paused", paused: false }));
        arrive(30000);
        arrive(30000);
        assert.equal(joining.delay, PLAYOUT.least);
    });

    it("plays the host's steps a little slower or faster to keep them in hand: seldom stopping when they come unevenly, never far behind", () => {
        // (A copy that does nothing, as a stand-in: only the timing's tried here)
        const stand = { advance: () => [], replay: [], replaying() {} };
        // The host steps every 50 ms, sends what it's done every 100 ms or so (as its frames
        // fall), each sending taking 60 ms and up to 150 more (in order: one never overtakes
        // another); a joined game draws a frame every 1/60 s, playing steps as they're due
        const simulate = (paced) => {
            let now = 0;
            let seed = 7;
            const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
            const joining = new Joining({ send: () => {}, clock: () => now });
            const coming = [];
            let [sentStep, sentAt, last, accumulator, stalls, frames, most] = [0, 0, 0, 0, 0, 0, 0];

            joining.attach(stand);

            for (now = 0; now < 120000; now += 1000 / 60) {
                // (The host's sendings, as they go and come)
                if (now - sentAt >= 100) {
                    const step = Math.floor(now / STEP_MS);

                    last = Math.max(last, now + 60 + random() * 150);
                    coming.push({ at: last, text: encode({ kind: "ops", step, ops: [["a", STEP_MS, step - sentStep]] }) });
                    [sentStep, sentAt] = [step, now];
                }

                while (coming.length && coming[0].at <= now) {
                    joining.hear(coming.shift().text);
                }

                // (The joined game's frame: as game.js #tick plays it)
                const dt = 1000 / 60;

                accumulator += dt * (paced ? joining.pace(dt) : 1);

                while (accumulator >= STEP_MS) {
                    if (!joining.step()) {
                        accumulator = Math.min(accumulator, STEP_MS);
                        stalls += now > 5000 ? 1 : 0;
                        break;
                    }

                    accumulator -= STEP_MS;
                }

                for (let extra = 0; joining.behind > (paced ? joining.delay : 0) + PACE.behind && extra < PACE.catchUp; extra++) {
                    joining.step();
                }

                frames++;
                most = Math.max(most, now > 5000 ? sentStep - (joining.hostStep - joining.behind) : 0);
            }

            return { stalls: stalls / frames, most, delay: joining.delay };
        };

        const asTheyCome = simulate(false);
        const paced = simulate(true);

        assert.ok(paced.stalls < asTheyCome.stalls / 3, `${(paced.stalls * 100).toFixed(1)}% of frames stopped, against ${(asTheyCome.stalls * 100).toFixed(1)}%`);
        assert.ok(paced.delay > PLAYOUT.least && paced.delay <= PLAYOUT.most, `${paced.delay} steps`);
        assert.ok(paced.most <= PLAYOUT.most + PACE.behind + 6, `${paced.most} steps behind at most`);
    });

    it("keeps what it's told of when a world's adopted in place", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });
        const seen = [];

        host.join({ id: HOST_PLAYER, hero: HERO });

        const kept = host.snapshot();

        host.recorder = (op) => seen.push(op[0]);
        host.advance(STEP_MS);
        host.adopt(kept);
        assert.equal(host.battle.time, 0);
        host.advance(STEP_MS);
        assert.deepEqual(seen, ["a", "a"]);
        assert.throws(() => host.adopt({ version: -1 }), /another version/);
    });

    it("says a line to the sayer's party alone: heard by each in it (the sayer too), sent to no one else; tidied, held to its length, too many too quickly held back, and none said out of a party", () => {
        const { host, hosting, join, deliver, play, catchUp } = opened();
        const bryn = join(guest("Bryn"));
        const cass = join(guest("Cass"));
        const heard = { host: [], bryn: [], cass: [] };
        const unsaid = { bryn: [], cass: [] };

        hosting.onChat = (line) => heard.host.push(line);

        for (const [who, { joining }] of [["bryn", bryn], ["cass", cass]]) {
            joining.onChat = (line) => heard[who].push(line);
            joining.onUnsaid = (reason) => unsaid[who].push(reason);
        }

        // (The host and Bryn a party; Cass in none)
        assert.equal(host.command(HOST_PLAYER, { type: "party", do: "invite", who: "guest-1" }).ok, true);
        bryn.joining.command({ type: "party", do: "accept" });
        deliver();
        play(1);
        catchUp(bryn.joining);
        catchUp(cass.joining);
        assert.deepEqual(host.partyFor("guest-1")?.members, [HOST_PLAYER, "guest-1"]);

        const toCass = [];
        const watch = hosting.send;

        hosting.send = (peer, text) => {
            if (peer === cass.peer) {
                toCass.push(text);
            }

            watch(peer, text);
        };

        // The host says a line: the host and Bryn hear it, Cass is never sent it
        assert.deepEqual(hosting.chat("Over here!"), { ok: true });
        deliver();
        assert.deepEqual(heard.host, [{ from: HOST_PLAYER, name: "Ada", text: "Over here!" }]);
        assert.deepEqual(heard.bryn, [{ from: HOST_PLAYER, name: "Ada", text: "Over here!" }]);

        // Bryn says one, run together: tidied, heard by both (Bryn too, as everyone hears it)
        assert.deepEqual(bryn.joining.chat("  On  my\n\tway!  "), { ok: true, pending: true });
        deliver();
        assert.deepEqual(heard.host.at(-1), { from: "guest-1", name: "Bryn", text: "On my way!" });
        assert.deepEqual(heard.bryn.at(-1), { from: "guest-1", name: "Bryn", text: "On my way!" });

        // Cass, in no party: not said, and told why; and nothing to say isn't sent
        assert.deepEqual(cass.joining.chat("Wait for me"), { ok: true, pending: true });
        deliver();
        assert.deepEqual(unsaid.cass, ["unpartied"]);
        assert.deepEqual(cass.joining.chat("   "), { ok: false, reason: "empty" });
        assert.deepEqual(hosting.chat("\u0007"), { ok: false, reason: "empty" });
        assert.deepEqual(heard.cass, []);
        assert.ok(toCass.every((text) => decode(text).kind === "unsaid"), "(nothing said in the party ever sent to Cass)");

        // Held to its length (whole characters), and too many too quickly held back
        assert.equal(chatLine("x".repeat(CHAT.most + 50)).length, CHAT.most);
        assert.equal([...chatLine("🗡".repeat(CHAT.most + 1))].length, CHAT.most);

        for (let k = 1; k < CHAT.burst; k++) {
            assert.deepEqual(hosting.chat(`Line ${k}`), { ok: true });
        }

        assert.deepEqual(hosting.chat("One too many"), { ok: false, reason: "chatty" });
        play(CHAT.burstMs / STEP_MS + 1);
        assert.deepEqual(hosting.chat("Again"), { ok: true });
        deliver();
        assert.equal(heard.bryn.at(-1).text, "Again");

        // (Not done to the world: every copy the same as ever)
        catchUp(bryn.joining);
        catchUp(cass.joining);
        assert.equal(bryn.joining.host.checksum(), host.checksum());
        assert.equal(cass.joining.host.checksum(), host.checksum());
    });
});
