// The war's messengers in a world (core/host.js, core/missions.js): one sent to a player near an
// enemy camp, walking up and hailing them; answered (taken, or turned down: none again for a
// while); the mission there, done, paid on the spot and their pick of three pieces made; given up
// (standing lost); none to one who's turned messengers away; a party's shared; and the messenger
// kept with the world.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, MESSENGER } from "../client/js/core/host.js";
import { MESSENGER_EVERY, MISSION_FAILED, MISSIONS, rewardOf } from "../client/js/core/missions.js";
import { dueAt, turnsTo } from "../client/js/core/hurry.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { STAGES } from "../client/js/core/war/war.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// Played on till `done` (given each step's events), at most `ms`: the events till then
function until(host, done, ms = 60000) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        const now = host.advance(STEP_MS);

        events.push(...now);

        if (done(now, events)) {
            return events;
        }
    }

    return events;
}

function hosted(seed = 2) {
    const host = new Host(buildWorld({ seed }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    return host;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// An orcish camp 400 m from the start town's edge, at war with the humans, and the player 250 m
// beyond it, out in the open (nearer it than the town it's before)
function camped(host) {
    const war = host.war;
    const middle = host.world.stamp.middle;
    const radius = SETTLEMENT_KINDS[host.world.start.kind].radius;
    const at = [middle[0] + radius + 400, middle[1] + 5];
    const camp = { id: "camp-900", realm: "orc", at, guard: 6, built: 0, done: 0, toward: host.world.start.id, used: 1e6, skirmished: 1e6 };

    war.relations["human|orc"] = { state: "hostile", since: 0 };
    war.stage = STAGES.length - 1;
    war.camps.push(camp);
    put(host.battle.actor(HOST_PLAYER), [Math.floor(at[0] + 250), Math.floor(at[1])]);

    return { war, camp };
}

// The messenger out for the player, played on till they're there: the "arrived" event
function hailed(host) {
    const events = until(host, (now) => now.some(({ type, change }) => type === "messenger" && change === "arrived"), 90000);

    return events.find(({ type, change }) => type === "messenger" && change === "arrived");
}

describe("the war's messengers (host.js, missions.js)", () => {
    it("sends one to a player near an enemy camp, who walks up and hails them with the mission, from their ruler, at their rank", () => {
        const host = hosted();
        const { camp } = camped(host);
        const coming = until(host, (now) => now.some(({ type }) => type === "messenger"), 10000).find(({ type }) => type === "messenger");

        assert.equal(coming.change, "coming");
        assert.deepEqual(coming.players, [HOST_PLAYER]);
        assert.equal(coming.from.kind, "ruler");

        const arrived = hailed(host);
        const me = host.battle.actor(HOST_PLAYER);
        const them = host.battle.actor(arrived.folk);

        assert.ok(arrived, "hailed");
        assert.ok(Math.hypot(them.x - me.x, them.y - me.y) <= MESSENGER.hail + 1);
        assert.equal(arrived.mission.kind, "rout");
        assert.equal(arrived.mission.key, camp.id);
        assert.deepEqual(arrived.mission.reward, rewardOf("rout", 0));
        assert.equal(host.folk.get(arrived.folk).talk, "messenger");
    });

    it("taken, the mission's carried; there, and the camp broken, it's paid on the spot and their pick of three pieces made", () => {
        const host = hosted();
        const { war, camp } = camped(host);
        const player = host.players.get(HOST_PLAYER);
        const arrived = hailed(host);

        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: arrived.folk }).ok, true);

        const answer = host.command(HOST_PLAYER, { type: "effect", effect: { mission: "accept" } });
        const me = host.battle.actor(HOST_PLAYER);

        assert.equal(answer.ok, true);
        assert.equal(answer.mission.state, "open");

        // (Its time from now, the way to the camp besides; held to it from when they'd have got
        // there: core/missions.js chanceOf)
        assert.equal(answer.mission.until, war.turn + MISSIONS.rout.turns + turnsTo([me.x, me.y], answer.mission.target.at));
        assert.equal(answer.mission.due, dueAt([me.x, me.y], answer.mission.target.at, war.turn));
        assert.equal(player.standing.missions.length, 1);
        assert.equal(player.standing.messengerAt, war.turn);
        host.command(HOST_PLAYER, { type: "talk", with: null });

        // (Gone back the way they came, and let go of once out of sight)
        const left = until(host, (now) => now.some(({ type, change }) => type === "messenger" && change === "gone"), 60000);

        assert.ok(left.some(({ type, change }) => type === "messenger" && change === "gone"));
        assert.equal(host.messengers.size, 0);

        // There, then the camp's broken
        put(host.battle.actor(HOST_PLAYER), [Math.floor(camp.at[0] - 30), Math.floor(camp.at[1])]);
        run(host, 1000);
        assert.ok(player.standing.missions[0].there);
        war.camps.splice(war.camps.indexOf(camp), 1);

        const gold = player.progress.gold;
        const points = player.standing.points;
        const won = run(host, 1000).find(({ type, change }) => type === "mission" && change === "won");

        assert.ok(won, "won");
        assert.equal(won.mission.gear.length, 3);
        assert.equal(player.progress.gold - gold, rewardOf("rout", 0).gold);
        assert.equal(player.standing.points - points, rewardOf("rout", 0).standing);
        assert.equal(host.command(HOST_PLAYER, { type: "mission", act: "pick", id: won.mission.id, which: 3 }).ok, false);

        const picked = host.command(HOST_PLAYER, { type: "mission", act: "pick", id: won.mission.id, which: 1 });

        assert.equal(picked.ok, true);
        assert.deepEqual(picked.piece, won.mission.gear[1]);
        assert.equal(player.standing.missions.length, 0);
        assert.equal(player.standing.missionsDone[0].state, "done");
        assert.ok(player.progress.pack.some((stack) => stack?.id === picked.piece.id) || [...host.ground.values()].some(({ bundle }) => bundle.items.some(({ id }) => id === picked.piece.id)));
    });

    it("over while the messenger came (the camp broken): taken, said too late, nothing carried, and no standing lost for it", () => {
        const host = hosted();
        const { war, camp } = camped(host);
        const player = host.players.get(HOST_PLAYER);
        const arrived = hailed(host);
        const points = player.standing.points;

        war.camps.splice(war.camps.indexOf(camp), 1);
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: arrived.folk }).ok, true);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { mission: "accept" } }), { ok: false, reason: "overtaken" });
        assert.equal(player.standing.missions.length, 0);
        assert.equal(player.standing.missionsDone.length, 0);
        assert.equal(player.standing.points, points);
        assert.equal([...host.messengers.values()][0]?.state, "leaving");
    });

    it("too far gone to catch by the time they answer (a convoy, on near the end of its road): said too late, nothing carried, and no standing lost for it", () => {
        const host = hosted();
        const war = host.war;
        const middle = host.world.stamp.middle;
        const at = [middle[0] + SETTLEMENT_KINDS[host.world.start.kind].radius + 400, middle[1] + 5];
        const convoy = { id: "force-990", realm: "orc", kind: "convoy", size: 7, at: [...at], path: [[...at], [at[0] + 3000, at[1]]], leg: 0, target: war.realm("orc").seat, home: war.works.find(({ owner }) => owner === "orc").id, mission: null, about: null, cargo: { stone: 30 }, back: false, since: war.turn };
        const player = host.players.get(HOST_PLAYER);

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = STAGES.length - 1;
        war.forces.push(convoy);
        put(host.battle.actor(HOST_PLAYER), [Math.floor(at[0] - 250), Math.floor(at[1])]);

        const arrived = hailed(host);
        const points = player.standing.points;

        assert.equal(arrived.mission.kind, "plunder");
        Object.assign(convoy, { at: [at[0] + 2900, at[1]] });
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: arrived.folk }).ok, true);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { mission: "accept" } }), { ok: false, reason: "overtaken" });
        assert.equal(player.standing.missions.length, 0);
        assert.equal(player.standing.points, points);
    });

    it("turned down, none comes again for a while; a mission given up costs a little standing", () => {
        const host = hosted();
        const { war } = camped(host);
        const player = host.players.get(HOST_PLAYER);
        const arrived = hailed(host);

        host.command(HOST_PLAYER, { type: "talk", with: arrived.folk });
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { mission: "decline" } }).ok, true);
        assert.equal(player.standing.missions.length, 0);
        host.command(HOST_PLAYER, { type: "talk", with: null });

        const since = war.turn;
        const events = run(host, 20000);

        assert.ok(war.turn - since < MESSENGER_EVERY);
        assert.ok(!events.some(({ type, change }) => type === "messenger" && change === "coming"));

        // (Another, a while after: taken, then given up)
        player.standing.messengerAt = war.turn - MESSENGER_EVERY;

        const again = hailed(host);

        host.command(HOST_PLAYER, { type: "talk", with: again.folk });

        const { mission } = host.command(HOST_PLAYER, { type: "effect", effect: { mission: "accept" } });

        player.standing.gain(20);

        const points = player.standing.points;

        assert.equal(host.command(HOST_PLAYER, { type: "mission", act: "giveUp", id: mission.id }).ok, true);
        assert.equal(points - player.standing.points, MISSION_FAILED);
        assert.equal(player.standing.missionsDone[0].state, "failed");
    });

    it("sends none to a player who's turned messengers away (Game options)", () => {
        const host = hosted();

        camped(host);
        host.players.get(HOST_PLAYER).own = { ...host.players.get(HOST_PLAYER).own, settings: { messengers: false } };

        const events = run(host, 15000);

        assert.ok(!events.some(({ type }) => type === "messenger"));
    });

    it("brings a party one messenger: taken by one, the mission's each of theirs, at their own rank", () => {
        const host = hosted();

        camped(host);
        host.join({ id: "bea", hero: { ...HERO, name: "Bea" } });
        host.command(HOST_PLAYER, { type: "party", do: "invite", who: "bea" });
        host.command("bea", { type: "party", do: "accept" });
        put(host.battle.actor("bea"), [host.battle.actor(HOST_PLAYER).square[0] + 2, host.battle.actor(HOST_PLAYER).square[1]]);
        host.players.get("bea").standing.gain(200);

        const arrived = hailed(host);

        assert.deepEqual([...arrived.players].sort(), [HOST_PLAYER, "bea"].sort());
        host.command(HOST_PLAYER, { type: "talk", with: arrived.folk });
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { mission: "accept" } }).ok, true);

        const [mine] = host.players.get(HOST_PLAYER).standing.missions;
        const [hers] = host.players.get("bea").standing.missions;

        assert.equal(hers.key, mine.key);
        assert.equal(hers.rank, 2);
        assert.ok(hers.reward.gold > mine.reward.gold);
        assert.equal([...host.messengers.values()].filter(({ state }) => state !== "leaving").length, 0);
    });

    it("sends the commander of a reserve the player's come to join to brief them: what they face, their part, and the objective worth more", () => {
        const host = hosted();
        const war = host.war;
        const me = host.battle.actor(HOST_PLAYER);
        const at = [me.x + 120, me.y];

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.forces.push({ id: "force-900", realm: "orc", kind: "army", size: 30, at: [at[0] + 900, at[1]], path: [[at[0] + 900, at[1]]], leg: 0, mission: "attack", target: host.world.start.id });
        war.forces.push({ id: "force-901", realm: "human", kind: "reserve", size: 25, at, path: [[...at]], leg: 0, mission: "defend", target: "force-900", home: host.world.start.id });

        const arrived = hailed(host);

        assert.equal(arrived.mission.kind, "reserve");
        assert.equal(arrived.mission.from.kind, "general");
        host.command(HOST_PLAYER, { type: "talk", with: arrived.folk });
        host.command(HOST_PLAYER, { type: "effect", effect: { mission: "accept" } });
        host.command(HOST_PLAYER, { type: "talk", with: null });

        // (Come to the reserve: its commander comes to brief them)
        put(me, [Math.floor(at[0] - 20), Math.floor(at[1])]);

        const briefing = until(host, (now) => now.some(({ type, change, kind }) => type === "messenger" && change === "arrived" && kind === "briefing"), 90000).find(({ type, change, kind }) => type === "messenger" && change === "arrived" && kind === "briefing");

        assert.ok(briefing, "briefed");
        assert.equal(host.battle.actor(briefing.folk).name, arrived.mission.from.name);
        assert.equal(briefing.mission.briefing.lines.length, 4);
        assert.match(briefing.mission.briefing.lines[0], /30 orcish soldiers are coming at us/);
        host.command(HOST_PLAYER, { type: "talk", with: briefing.folk });
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { briefed: true } }).ok, true);
        assert.equal(host.players.get(HOST_PLAYER).standing.missions[0].briefing.heard, true);
    });

    it("keeps a messenger on the way with the world, and carries on from it", () => {
        const host = hosted();

        camped(host);
        until(host, (now) => now.some(({ type, change }) => type === "messenger" && change === "coming"), 10000);

        const snapshot = host.snapshot();
        const back = Host.restore(buildWorld({ seed: 2 }), snapshot);
        const [one] = [...back.messengers.values()];

        assert.equal(back.messengers.size, 1);
        assert.equal(back.folk.get(one.folk).talk, "messenger");
        assert.deepEqual(back.snapshot().messengers, snapshot.messengers);
    });
});
