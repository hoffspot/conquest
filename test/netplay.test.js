// Playing together (docs/WAR.md M11: client/js/core/netplay.js, with core/host.js): a world opened
// to others; one who joins sent it as it is, then everything done in it, which they do again on
// their own copy, step for step, and come out the same; their commands done by the host, and
// what came of them heard; players of another people brought in by their own people's town;
// those who leave gone from every copy; a copy gone astray set right; those who can't join told why
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { characterFrom, CHECK_EVERY, Hosting, Joining, MOST_PLAYERS, NET_VERSION, spawnFor } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { encode } from "../client/js/core/wire.js";
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

    // Someone joining, their game making its copy of the world when it's welcomed
    const join = (character) => {
        const peer = `p${next++}`;
        const joining = new Joining({ send: (text) => post.push({ from: peer, text }) });

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

    it("does a joined player's commands in the host's world, and they hear what came of them", () => {
        const { host, join, play, catchUp, deliver } = opened();
        const { joining } = join(guest("Bryn"));
        const me = host.battle.actor("guest-1");
        const to = [me.square[0], me.square[1] + 5];
        const heard = [];

        const sent = joining.command({ type: "move", to }, (result) => heard.push(result));

        assert.deepEqual(sent, { ok: true, pending: true });
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

    it("turns away a game of another version, a character that isn't one, and anyone when the world's full", () => {
        const { hosting, post, deliver } = opened();
        const refusals = [];
        const hear = (peer) => {
            const joining = new Joining({ send: (text) => post.push({ from: peer, text }) });

            joining.onRefused = (reason) => refusals.push(reason);

            return joining;
        };

        // (Heard directly: another version)
        hosting.send = (peer, text) => hear(peer).hear(text);
        hosting.hear("p9", encode({ kind: "hello", version: NET_VERSION + 1, character: guest("Old") }));
        hosting.hear("p9", encode({ kind: "hello", version: NET_VERSION, character: { hero: { name: "" } } }));
        assert.deepEqual(refusals, ["version", "character"]);

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
});
