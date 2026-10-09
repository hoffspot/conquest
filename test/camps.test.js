// The armies' camps come to life near a player (client/js/core/host.js with core/war/war.js and
// core/war/muster.js; docs/WAR.md *Standing armies*): a camp near a player pitched, its guard
// round its fire as sentries, struck once they're far; razed once its guard's all put down; kept
// with the world; and the request to break a camp
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CAMP_NEAR, HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { OPENS, offerRequest, STANDINGS } from "../client/js/core/standing.js";
import { CAMP, campOf } from "../client/js/core/war/muster.js";
import { STAGES, TURN_MS } from "../client/js/core/war/war.js";
import { createRandom } from "../client/js/core/random.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
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

// An orc army's camp outside the player's town, `out` metres past its edge, held by `guard`, at war
// with the humans, as far on as the war can be
function camped(host, { guard = 6, out = 60 } = {}) {
    const war = host.war;
    const home = war.town(host.world.start.id);
    const middle = host.world.stamp.middle;
    const radius = SETTLEMENT_KINDS[host.world.start.kind].radius;
    const at = [middle[0] + radius + out, middle[1] + 5];
    const camp = { id: "camp-900", realm: "orc", at, guard, built: 0, done: 0, toward: home.id, used: 1e6, skirmished: 1e6 };

    war.relations["human|orc"] = { state: "hostile", since: 0 };
    war.stage = STAGES.length - 1;
    war.camps.push(camp);

    return { war, home, camp, middle, radius };
}

describe("the armies' camps come to life (host.js, war.js, muster.js)", () => {
    it("lays a camp out round its fire", () => {
        const camp = { id: "force-7", at: [500, 300] };
        const { fire, tents, posts } = campOf(camp, { sentries: 4 });

        assert.deepEqual(fire, [500, 300]);
        assert.equal(tents.length, CAMP.tents);
        assert.equal(posts.length, 4);
        assert.deepEqual(campOf(camp, { sentries: 4 }), { fire, tents, posts });

        for (const { at } of tents) {
            assert.ok(Math.abs(Math.hypot(at[0] - 500, at[1] - 300) - CAMP.pitch) < 1e-9);
        }

        for (const { at, facing } of posts) {
            // (Facing out: the way away from the fire)
            assert.ok(Math.abs(Math.hypot(at[0] - 500, at[1] - 300) - CAMP.ring) < 1e-9);
            assert.ok(Math.sin(facing) * (at[0] - 500) + Math.cos(facing) * (at[1] - 300) > 0);
        }
    });

    it("pitches a camp near a player, its guard round its fire as sentries, and strikes it once they're far", () => {
        const host = hosted();
        const player = host.battle.actor(HOST_PLAYER);
        const { camp } = camped(host);

        put(player, [Math.floor(camp.at[0] - 40), Math.floor(camp.at[1])]);

        const events = run(host, 1000);
        const pitched = events.find(({ type }) => type === "camp");

        assert.ok(pitched, "(pitched)");
        assert.equal(pitched.camp, camp.id);
        assert.equal(pitched.people, "orc");
        assert.equal(pitched.town, camp.toward);
        assert.equal(pitched.tents.length, CAMP.tents);

        // (Its guard round its fire as sentries, but one: its scout, out on its round)
        const sentries = pitched.ids.filter((id) => id !== `${camp.id}/scout`);
        const scout = host.battle.actor(`${camp.id}/scout`);

        assert.equal(sentries.length, Math.min(CAMP.sentries, camp.guard - 1));
        assert.deepEqual(pitched.ids, [...sentries, scout.id]);
        assert.equal(scout.name, "Orcish scout");
        assert.ok(Math.hypot(scout.x - camp.at[0], scout.y - camp.at[1]) < CAMP_NEAR.scout + CAMP.ring);

        for (const id of sentries) {
            const sentry = host.battle.actor(id);

            assert.equal(sentry.kind, "soldier");
            assert.equal(sentry.team, "orc");
            assert.match(sentry.name, /^Orcish sentry$/);
            assert.ok(Math.hypot(sentry.x - camp.at[0], sentry.y - camp.at[1]) < CAMP.ring + 4);
            assert.ok(host.battle.hostile(sentry, player), "(at war with the player's people)");
            assert.equal(host.soldiers.get(id).camp, camp.id);
        }

        // One falls: its guard the fewer
        const before = camp.guard;
        const sentry = host.battle.actor(pitched.ids[0]);

        const fight = [];

        put(player, [sentry.square[0] + 1, sentry.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: sentry.id });

        // (Till one falls, the player kept from falling first)
        for (let k = 0; k < 40 && !fight.some(({ type, id }) => type === "death" && pitched.ids.includes(id)); k++) {
            Object.assign(player, { hp: 5000, maxHp: 5000 });
            fight.push(...run(host, 500));
        }

        assert.ok(fight.some(({ type, id }) => type === "death" && pitched.ids.includes(id)), "(one of them fell)");
        assert.ok(camp.guard < before);

        // Far off: struck
        put(player, [Math.floor(camp.at[0] - CAMP_NEAR.far - 40), Math.floor(camp.at[1])]);

        const later = run(host, 1000);
        const struck = later.find(({ type }) => type === "strike");

        assert.ok(struck && struck.camp === camp.id);
        assert.ok(!host.camps.has(camp.id));
        assert.ok(pitched.ids.every((id) => !host.battle.actor(id) || host.battle.actor(id).dead));
    });

    it("razes a camp whose guard's all put down by the player's people, and strikes it", () => {
        const host = hosted();
        const player = host.battle.actor(HOST_PLAYER);
        const { war, camp } = camped(host, { guard: 2 });

        put(player, [Math.floor(camp.at[0] - 40), Math.floor(camp.at[1])]);

        const pitched = run(host, 1000).find(({ type }) => type === "camp");
        const events = [];

        Object.assign(player, { hp: 5000, maxHp: 5000 });

        for (const id of pitched.ids) {
            for (let tries = 0; tries < 20 && host.battle.actor(id) && !host.battle.actor(id).dead; tries++) {
                Object.assign(host.battle.actor(id), { hp: 1 });
                put(player, [host.battle.actor(id).square[0] + 1, host.battle.actor(id).square[1]]);
                host.command(HOST_PLAYER, { type: "engage", target: id });
                events.push(...run(host, 1000));
            }
        }

        events.push(...run(host, 1000));
        assert.equal(war.camp(camp.id), null, "(razed)");
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "razed" && event.camp === camp.id && event.by === "human"));
        assert.ok(events.some(({ type, camp: id }) => type === "strike" && id === camp.id));
        assert.ok(!host.camps.has(camp.id));
    });

    it("keeps its camps with the world, and carries on from them exactly", () => {
        const host = hosted();
        const { war, camp } = camped(host);

        put(host.battle.actor(HOST_PLAYER), [Math.floor(camp.at[0] - 60), Math.floor(camp.at[1])]);
        run(host, 1000);
        war.turn = 10;
        run(host, TURN_MS);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.camps.keys()], [...host.camps.keys()]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 4000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });

    it("asks those of rank to break a camp outside their town; done once it's gone and they were there", () => {
        const host = hosted();
        const { war, home, camp } = camped(host);
        const random = createRandom(4);
        const giver = { id: "reeve", name: "Hamon Reeve", title: "the reeve" };
        const offered = new Set();

        for (let k = 0; k < 40; k++) {
            offered.add(offerRequest({ war, realm: "human", town: home.id, post: "hall", giver, rank: OPENS.rout, random })?.kind);
        }

        assert.ok(offered.has("rout"));

        for (let k = 0; k < 40; k++) {
            assert.notEqual(offerRequest({ war, realm: "human", town: home.id, post: "hall", giver, rank: OPENS.rout - 1, random })?.kind, "rout");
        }

        let request = null;

        for (let k = 0; k < 60 && request?.kind !== "rout"; k++) {
            request = offerRequest({ war, realm: "human", town: home.id, post: "hall", giver, rank: OPENS.rout, random });
        }

        const player = host.players.get(HOST_PLAYER);

        player.standing.gain(STANDINGS[OPENS.rout].points);

        const held = player.standing.take(request);

        assert.equal(held.target.force, camp.id);

        // There, then the camp's broken
        put(host.battle.actor(HOST_PLAYER), [Math.floor(camp.at[0] - 30), Math.floor(camp.at[1])]);
        run(host, 1000);
        assert.ok(player.standing.find(held.id).there);
        war.camps.splice(war.camps.indexOf(camp), 1);

        const events = run(host, 1000);

        assert.ok(events.some(({ type, change }) => type === "request" && change === "ready"));
        assert.equal(player.standing.find(held.id).state, "done");
    });
});
