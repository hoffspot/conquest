// The war's camps and their sorties come to life near a player (client/js/core/host.js with
// core/war/war.js and core/war/muster.js; docs/WAR.md M6): a camp near a player pitched, its
// sentries round its fire, struck once they're far; its raids and assaults on a town a player's
// at played out there, the raiders making for its fields, the attackers into it, their losses
// and the town's the war's; a town whose defenders all fall taken; and the request to break a
// camp
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CAMP_NEAR, HOST_PLAYER, Host, SORTIE } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { OPENS, offerRequest, STANDINGS } from "../client/js/core/standing.js";
import { CAMP, campOf, sortieOf } from "../client/js/core/war/muster.js";
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

// An orc camp outside the player's town, `out` metres past its edge, at war with the humans, as
// far on as the war can be
function camped(host, { size = 20, out = 60, since = 0 } = {}) {
    const war = host.war;
    const home = war.town(host.world.start.id);
    const middle = host.world.stamp.middle;
    const radius = SETTLEMENT_KINDS[host.world.start.kind].radius;
    const at = [middle[0] + radius + out, middle[1] + 5];
    const camp = { id: "force-900", realm: "orc", kind: "camp", size, at, path: [at], leg: 0, target: home.id, home: war.realm("orc").capital, mission: null, about: null, since, sortie: null };

    war.relations["human|orc"] = { state: "hostile", since: 0 };
    war.stage = STAGES.length - 1;
    war.forces.push(camp);

    return { war, home, camp, middle, radius };
}

describe("camps and sorties come to life (host.js, war.js, muster.js)", () => {
    it("lays a camp out round its fire, and a sortie from its town's edge on the camp's side", () => {
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

        const place = { kind: "town", at: [0, 0] };
        const raid = sortieOf(place, { at: [400, 0] }, "raid");
        const assault = sortieOf(place, { at: [400, 0] }, "assault");
        const radius = SETTLEMENT_KINDS.town.radius;

        assert.ok(raid.from[0] > radius + 30 && Math.abs(raid.from[1]) < 1e-9);
        assert.ok(raid.to[0] > radius && raid.to[0] < raid.from[0]);
        assert.ok(assault.to[0] < radius);
    });

    it("pitches a camp near a player, its sentries round its fire, and strikes it once they're far", () => {
        const host = hosted();
        const player = host.battle.actor(HOST_PLAYER);
        const { camp } = camped(host);

        put(player, [Math.floor(camp.at[0] - 40), Math.floor(camp.at[1])]);

        const events = run(host, 1000);
        const pitched = events.find(({ type }) => type === "camp");

        assert.ok(pitched, "(pitched)");
        assert.equal(pitched.camp, camp.id);
        assert.equal(pitched.people, "orc");
        assert.equal(pitched.ids.length, Math.min(CAMP.sentries, Math.ceil(camp.size / 3)));
        assert.equal(pitched.tents.length, CAMP.tents);

        for (const id of pitched.ids) {
            const sentry = host.battle.actor(id);

            assert.equal(sentry.kind, "soldier");
            assert.equal(sentry.team, "orc");
            assert.match(sentry.name, /^Orcish sentry$/);
            assert.ok(Math.hypot(sentry.x - camp.at[0], sentry.y - camp.at[1]) < CAMP.ring + 4);
            assert.ok(host.battle.hostile(sentry, player), "(at war with the player's people)");
            assert.equal(host.soldiers.get(id).camp, camp.id);
        }

        // One falls: the camp the fewer
        const before = camp.size;
        const sentry = host.battle.actor(pitched.ids[0]);

        Object.assign(player, { hp: 5000, maxHp: 5000 });
        put(player, [sentry.square[0] + 1, sentry.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: sentry.id });

        const fight = run(host, 20000);

        assert.ok(fight.some(({ type, id }) => type === "death" && pitched.ids.includes(id)), "(one of them fell)");
        assert.ok(camp.size < before);

        // Far off: struck
        put(player, [Math.floor(camp.at[0] - CAMP_NEAR.far - 40), Math.floor(camp.at[1])]);

        const later = run(host, 1000);
        const struck = later.find(({ type }) => type === "strike");

        assert.ok(struck && struck.camp === camp.id);
        assert.ok(!host.camps.has(camp.id));
        assert.ok(pitched.ids.every((id) => !host.battle.actor(id) || host.battle.actor(id).dead));
    });

    it("plays a raid out: raiders from the camp's side make for the town's fields, stop its taxes, and go back", () => {
        const host = hosted();
        const { war, home, camp } = camped(host, { since: 1000 });

        // (The town's soldiers out, with the player there; a raid the camp's next turn)
        run(host, 1000);
        assert.ok(host.mustered.has(home.id));
        assert.ok(war.watched.has(home.id));

        let sortie = null;

        for (let turn = 0; turn < 30 && !sortie; turn++) {
            sortie = run(host, TURN_MS).find(({ type }) => type === "sortie");
        }

        assert.ok(sortie, "(a raid, sooner or later)");
        assert.equal(sortie.kind, "raid");
        assert.equal(sortie.town, home.id);
        assert.ok(sortie.ids.length >= 1 && sortie.ids.length <= SORTIE.raiders);
        assert.equal(camp.sortie.kind, "raid");

        for (const id of sortie.ids) {
            assert.equal(host.battle.actor(id).team, "orc");
            assert.match(host.battle.actor(id).name, /raider$/);
        }

        // (Straight to the fields, the town's guards held back)
        for (const id of host.mustered.get(home.id).ids) {
            Object.assign(host.battle.actor(id), { dead: true, respawnAt: Infinity });
        }

        const { to } = host.sorties.get(camp.id);

        for (const id of sortie.ids) {
            put(host.battle.actor(id), to);
        }

        const events = run(host, SORTIE.stay + 2000);
        const back = events.find(({ type }) => type === "sortied");

        assert.ok(back, "(done with the fields)");
        assert.equal(back.result, "raided");
        assert.equal(home.raidedAt, war.turn);
        assert.ok(!host.sorties.has(camp.id) && !camp.sortie);
        assert.ok(back.back.every((id) => !host.battle.actor(id)));
    });

    it("plays an assault out: the town whose defenders all fall is taken, and its new holders' soldiers come out", () => {
        const host = hosted();
        const { war, home } = camped(host, { size: 40 });

        run(host, 1000);

        const defenders = [...host.mustered.get(home.id).ids];

        war.turn = 10;

        const sortie = run(host, TURN_MS).find(({ type }) => type === "sortie");

        assert.ok(sortie, "(stormed)");
        assert.equal(sortie.kind, "assault");
        assert.equal(sortie.ids.length, Math.min(SORTIE.attackers, war.force("force-900").sortie.party));

        // The defenders fall (as if to the attackers)
        for (const id of defenders) {
            Object.assign(host.battle.actor(id), { dead: true, respawnAt: Infinity });
        }

        const events = run(host, 2000);
        const over = events.find(({ type }) => type === "sortied");

        assert.equal(over?.result, "taken");
        assert.equal(home.owner, "orc");
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "taken" && event.town === home.id));

        // The new holders' soldiers out
        const next = [...events, ...run(host, 1000)];

        assert.ok(next.some(({ type, town, people }) => type === "muster" && town === home.id && people === "orc"));
    });

    it("throws an assault back when its attackers all fall, the camp broken if it's too few", () => {
        const host = hosted();
        const { war, home, camp } = camped(host, { size: 12 });

        // (No gold for relief, or to fill the garrison up again)
        home.garrison = 6;
        war.realm("human").treasury = 0;
        run(host, 1000);
        war.turn = 10;

        const sortie = run(host, TURN_MS).find(({ type }) => type === "sortie");

        assert.equal(sortie?.kind, "assault");

        // They fall, one by one (the war told of each)
        for (const id of sortie.ids) {
            host.battle.actor(id).hp = 1;
        }

        const player = host.battle.actor(HOST_PLAYER);

        Object.assign(player, { hp: 5000, maxHp: 5000 });

        let over = null;

        for (let k = 0; k < 40 && !over; k++) {
            const target = sortie.ids.map((id) => host.battle.actor(id)).find((actor) => actor && !actor.dead);

            if (target) {
                put(player, [target.square[0] + 1, target.square[1]]);
                host.command(HOST_PLAYER, { type: "engage", target: target.id });
            }

            over = run(host, 3000).find(({ type }) => type === "sortied");
        }

        assert.ok(over, "(over)");
        assert.equal(home.owner, "human");
        assert.equal(over.result, "broken");
        assert.ok(!war.force(camp.id));
    });

    it("reckons the rest of a sortie in the war when no one's near the town any more", () => {
        const host = hosted();
        const { war, home, camp } = camped(host, { size: 40 });

        run(host, 1000);
        war.turn = 10;
        assert.equal(run(host, TURN_MS).find(({ type }) => type === "sortie")?.kind, "assault");

        put(host.battle.actor(HOST_PLAYER), [Math.floor(home.at[0] - 2000), Math.floor(home.at[1])]);

        const events = run(host, 2000);
        const over = events.find(({ type }) => type === "sortied");

        assert.ok(over, "(settled)");
        assert.ok(["taken", "repulsed", "broken"].includes(over.result));
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "assault" && event.town === home.id && !event.played));
        assert.ok(!camp.sortie);
    });

    it("keeps its camps and sorties with the world, and carries on from them exactly", () => {
        const host = hosted();
        const { war, camp } = camped(host, { size: 40 });

        put(host.battle.actor(HOST_PLAYER), [Math.floor(camp.at[0] - 60), Math.floor(camp.at[1])]);
        run(host, 1000);
        war.turn = 10;
        run(host, TURN_MS);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.camps.keys()], [...host.camps.keys()]);
        assert.deepEqual([...again.sorties.keys()], [...host.sorties.keys()]);
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
        war.forces.splice(war.forces.indexOf(camp), 1);

        const events = run(host, 1000);

        assert.ok(events.some(({ type, change }) => type === "request" && change === "ready"));
        assert.equal(player.standing.find(held.id).state, "done");
    });
});
