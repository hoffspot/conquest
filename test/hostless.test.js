// A world with no host player (core/host.js RULES; generated/world_server_plan.md §3.2, §4), as
// a world server runs one: its time passed only once everyone in it is resting (by the shortest
// of their rests), a player resting alone among others just waiting on them; its debug commands
// its owners' alone, if anyone's. And in any world, a player who's given no command for a while
// (AFK) marked away at the same step in every copy of it, and after longer sent out of it (never
// the host's own player), their going recorded as any going is
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DAY, elapsedOf, HOUR } from "../client/js/core/daytime.js";
import { AFK, HOST_PLAYER, Host, RULES } from "../client/js/core/host.js";
import { Hosting, Joining, NET_KICKS } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { WorldRunner } from "../client/js/core/runner.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const GUEST = Object.freeze({ hero: { name: "Bryn", shape: {}, look: {}, weapon: "bow", boots: false, race: "human" }, progress: { gold: 50 } });
const MINUTE = 60000;
const SERVED = Object.freeze({ rest: "everyone", debug: "owner" });

// How long the world's been going (ms) when it's a time of day (ms from midnight) on day `day`
const at = (time, day = 1) => day * DAY.length + time - DAY.start;
const clockTo = (host, elapsed) => Object.assign(host.war, { turn: Math.floor(elapsed / MINUTE), clock: elapsed % MINUTE });
const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// A world a server runs (no HOST_PLAYER): its owner and a player in it, out in the wilds west of
// the town, the orc gone
function served(rules = SERVED) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false, rules });

    host.join({ id: "p1", hero: HERO, role: "owner" });
    host.join({ id: "p2", hero: { ...HERO, name: "Bryn" } });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const [middle, radius] = [world.stamp.middle, SETTLEMENT_KINDS[world.start.kind].radius];

    put(host.battle.actor("p1"), [Math.floor(middle[0] - radius - 80), Math.floor(middle[1] - 20)]);
    put(host.battle.actor("p2"), [Math.floor(middle[0] - radius - 80), Math.floor(middle[1] - 14)]);
    clockTo(host, at(30 * MINUTE));
    host.events = [];

    return { host, world };
}

// A world a browser hosts, guests joined to it over links (what's sent queued, both ways), moved
// on by a runner
function together(guests = 1) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const post = [];
    const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
    const joinings = Array.from({ length: guests }, (_, k) => new Joining({ send: (text) => post.push({ from: `p${k + 1}`, text }) }));
    const deliver = () => {
        while (post.length) {
            const { to, from, text } = post.shift();

            if (from) {
                hosting.hear(from, text);
            } else {
                joinings[Number(to.slice(1)) - 1]?.hear(text);
            }
        }
    };

    for (const joining of joinings) {
        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello(GUEST);
        deliver();
    }

    return { host, hosting, joining: joinings[0], joinings, deliver, runner: new WorldRunner(host, { hosting }) };
}

// Everything the copy's been sent played, and what happened in it
function played(joining) {
    const events = [];

    for (let step = joining.step(); step !== null; step = joining.step()) {
        events.push(...(step ?? []));
    }

    return events;
}

describe("a world with no host player (core/host.js RULES)", () => {
    it("keeps its rules with it, each copy and each restored one playing by them; anything unknown as RULES has it", () => {
        const { host } = served();

        assert.deepEqual(RULES, { rest: "host", debug: "host" }, "(a world a browser hosts, to begin with)");
        assert.deepEqual(host.rules, SERVED);
        assert.deepEqual(host.snapshot().rules, SERVED);
        assert.deepEqual(Host.restore(buildWorld({ seed: 2 }), host.snapshot()).rules, SERVED);
        assert.deepEqual(new Host(buildWorld({ seed: 2 }), { populate: false, rules: { rest: "nobody", debug: 1 } }).rules, RULES);
        assert.equal(host.players.get("p1").role, "owner");
        assert.equal(host.players.get("p2").role, "player");
    });

    it("passes its time only once everyone's resting, by the shortest of their rests, each woken and told; one resting alone waits", () => {
        const { host } = served();
        const before = elapsedOf(host.war);

        assert.deepEqual(host.command("p1", { type: "camp", until: { hours: 6 } }), { ok: true });
        assert.equal(elapsedOf(host.war), before, "(no time passed: the other's up)");
        assert.deepEqual(host.players.get("p1").resting, { where: "camp", until: { hours: 6 } });
        assert.ok(host.events.some(({ type, ids, waiting }) => type === "resting" && ids.join() === "p1" && waiting === 1));
        assert.ok(!host.events.some(({ type }) => type === "slept"));

        host.events = [];
        assert.deepEqual(host.command("p2", { type: "camp", until: { hours: 3 } }), { ok: true });
        assert.equal(elapsedOf(host.war) - before, 3 * HOUR, "the shortest rest");

        const slept = host.events.filter(({ type }) => type === "slept");

        assert.deepEqual(slept.map(({ id }) => id).sort(), ["p1", "p2"]);
        assert.ok(slept.every(({ passed, until }) => passed === 3 * HOUR && until.hours === 3));
        assert.ok([...host.players.values()].every(({ resting }) => resting === null));
    });

    it("has one who gets up stop resting (and the time not pass for the rest), and one leaving with everyone else resting pass it", () => {
        const { host } = served();
        const before = elapsedOf(host.war);
        const [x, y] = host.battle.actor("p1").square;

        host.command("p1", { type: "camp", until: { hours: 2 } });
        host.events = [];
        host.command("p1", { type: "move", to: [x, y - 4] });
        assert.equal(host.players.get("p1").resting, null);
        assert.ok(host.events.some(({ type, id }) => type === "rose" && id === "p1"));

        // (Talking, standing still: still resting)
        host.command("p2", { type: "camp", until: { hours: 2 } });
        host.command("p2", { type: "talk", with: null });
        assert.equal(elapsedOf(host.war), before);
        assert.ok(host.players.get("p2").resting);

        host.events = [];
        host.leave("p1");
        assert.equal(elapsedOf(host.war) - before, 2 * HOUR);
        assert.ok(host.events.some(({ type, id, passed }) => type === "slept" && id === "p2" && passed === 2 * HOUR));
    });

    it("lets its owners alone call up a field battle, if its rules allow anyone to; a browser's world, its host's player", () => {
        const owners = served().host;

        assert.equal(owners.debugs("p1"), true);
        assert.equal(owners.debugs("p2"), false);
        assert.deepEqual(owners.command("p2", { type: "fieldBattle", size: 5 }), { ok: false, reason: "command" });
        assert.equal(owners.command("p1", { type: "fieldBattle", size: 5 }).ok, true);

        const none = served({ rest: "everyone", debug: "none" }).host;

        assert.deepEqual(none.command("p1", { type: "fieldBattle", size: 5 }), { ok: false, reason: "command" });

        const browser = new Host(buildWorld({ seed: 2 }), { populate: false });

        browser.join({ id: HOST_PLAYER, hero: HERO });
        browser.join({ id: "guest-1", hero: HERO, role: "owner" });
        assert.equal(browser.debugs(HOST_PLAYER), true);
        assert.equal(browser.debugs("guest-1"), false);
    });
});

describe("players away from the game (core/host.js AFK)", () => {
    it("marks a player away after AFK.mark with no command, at the same step in every copy; back as soon as they do anything", () => {
        const { host, joining, deliver, runner } = together();
        const guest = joining.me;
        const idle = (ms) => {
            for (const copy of [host, joining.host]) {
                for (const player of copy.players.values()) {
                    player.lastCommand = copy.battle.time - ms;
                }
            }
        };

        assert.equal(AFK.mark, 10 * MINUTE);
        assert.equal(AFK.out, 30 * MINUTE);

        // (A step short of it: not yet)
        idle(AFK.mark - 2 * STEP_MS);

        const heard = [];

        runner.advance(STEP_MS, { after: (events) => heard.push(...events) });
        assert.ok(!heard.some(({ type }) => type === "away"));

        runner.advance(STEP_MS, { after: (events) => heard.push(...events) });
        runner.hosting.flush();
        deliver();

        const away = heard.filter(({ type }) => type === "away");
        const awayThere = played(joining).filter(({ type }) => type === "away");

        assert.deepEqual(away.map(({ id }) => id).sort(), [guest, HOST_PLAYER].sort(), "(the host's own player too: marked, never sent out)");
        assert.ok(away.every(({ away: marked }) => marked));
        assert.deepEqual(awayThere, away, "the same, at the same step, in the copy");
        assert.equal(host.players.get(guest).away, true);
        assert.equal(Host.restore(buildWorld({ seed: 2 }), host.snapshot()).players.get(guest).away, true, "(kept with the world)");

        // (Anything at all: back)
        joining.command({ type: "stop" });
        deliver();
        host.events = [];
        runner.advance(STEP_MS);
        assert.equal(host.players.get(guest).away, false);
    });

    it("sends a player out of the world after AFK.out with no command, told why, their going recorded and played in every copy; never the host's own player", () => {
        const { host, joinings, deliver, runner } = together(2);
        const [out, staying] = joinings;
        const kicked = [];
        const closed = [];

        runner.hosting.onKick = (peer) => closed.push(peer);
        out.onKicked = (reason) => kicked.push(reason);
        staying.onKicked = (reason) => kicked.push(`staying: ${reason}`);
        played(out);
        played(staying);

        // (Everyone but the one who stays idle long enough to go: the host's own player too)
        for (const copy of [host, out.host, staying.host]) {
            for (const player of copy.players.values()) {
                player.lastCommand = player.id === staying.me ? copy.battle.time : copy.battle.time - (AFK.out - STEP_MS);
            }
        }

        const heard = [];

        runner.advance(STEP_MS, { after: (events) => heard.push(...events) });
        runner.hosting.flush();
        deliver();

        assert.deepEqual(
            heard.filter(({ type }) => type === "afk").map(({ id }) => id),
            [out.me],
        );
        assert.deepEqual(kicked, ["afk"]);
        assert.deepEqual(closed, ["p1"], "(their link closed after)");
        assert.equal(NET_KICKS.afk, "Disconnected for being away.");
        assert.ok(played(out).some(({ type, id }) => type === "afk" && id === out.me), "(their own copy played up to it, told)");
        assert.equal(host.players.has(out.me), false);
        assert.equal(host.players.has(HOST_PLAYER), true);
        assert.deepEqual([...runner.hosting.players.values()], [staying.me], "(no longer one of those who've joined)");

        played(staying);
        assert.equal(staying.host.players.has(out.me), false, "gone from the copy of one still in it");
        assert.equal(staying.host.checksum(), host.checksum());

        // (Sent out of a world it isn't in: nothing)
        assert.equal(runner.hosting.kick("nobody", "afk"), false);
    });
});
