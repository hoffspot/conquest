// A player's part in their people (docs/WAR.md M4: client/js/core/host.js with core/standing.js
// and the war): the town halls and the keep, their officials, the work they give and what it's
// worth, the requests carried out in the world (letters, tithes, the enemy's soldiers and the wild
// brought down, an enemy scouted, a town held) or failed, standing and its ranks, the armoury's
// gifts, counsel to the rulers, and all of it kept
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, OFFICIALS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { layoutTown } from "../client/js/core/setpieces/town.js";
import { FAILED, OPENS, STANDINGS, TITHE_RATE } from "../client/js/core/standing.js";
import { COUNSEL_TURNS } from "../client/js/core/war/war.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null, target: null });

// A request as the officials make them (standing.js offerRequest), for the tests to hand a player
const request = (kind, fields) => ({ kind, title: kind, from: { id: "home:hall-1/reeve", name: "Reeve", title: "Reeve", town: null, townName: "Home", post: "hall" }, given: 0, state: "open", count: 0, until: 999, reward: { standing: 20, coppers: 10 }, text: "", key: kind, ...fields });

describe("a player's part in their people (host.js, standing.js)", () => {
    let world;

    before(() => {
        world = buildWorld({ seed: 2 });
    });

    // A world with its player in it (standing as kept), and the home town's hall got ready
    const hosted = (standing = {}) => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, standing });

        const hall = host.world.interiors.buildings.get("home:hall-1");

        host.command(HOST_PLAYER, { type: "enter", link: hall.door.id });
        host.command(HOST_PLAYER, { type: "stop" });

        return { host, hall, player: host.players.get(HOST_PLAYER), actor: host.battle.actor(HOST_PLAYER) };
    };

    // The player before one of the folk, talking to them
    const facing = (host, id) => {
        const npc = host.battle.actor(id);
        const actor = host.battle.actor(HOST_PLAYER);

        host.command(HOST_PLAYER, { type: "talk", with: null });
        put(actor, npc.map, [npc.square[0], npc.square[1] + 2]);

        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: id }).ok, true);

        return npc;
    };

    // The capital's keep got ready (its settlement laid out), and the player in it
    const atTheKeep = (host) => {
        const capital = host.world.plan.places.find(({ kind, race }) => kind === "capital" && race === "human");

        host.world.maps.town.settlements.of(capital);

        const keep = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "keep" && place === capital.id);

        host.command(HOST_PLAYER, { type: "enter", link: keep.door.id });
        host.command(HOST_PLAYER, { type: "stop" });

        return keep;
    };

    it("has a town hall in every town and city, and a keep in every capital, the biggest house by its market", () => {
        const hall = world.interiors.make("home:hall-1");

        assert.equal(hall.kind, "hall");
        assert.equal(world.start.kind, "town");

        for (const kind of ["reeve", "clerk"]) {
            assert.ok(hall.folk.some(({ role }) => role === kind), kind);
        }

        assert.deepEqual(Object.keys(OFFICIALS).sort(), ["clerk", "councillor", "reeve", "ruler", "steward"]);

        // (The same seat every time, and only where it should be)
        for (const seed of [1, 2, 3]) {
            const seats = (kind) => layoutTown({ seed, kind }).pieces.filter(({ name }) => name === "hall" || name === "keep").map(({ name }) => name);

            assert.deepEqual(seats("village"), []);
            assert.deepEqual(seats("town"), ["hall"]);
            assert.deepEqual(seats("city"), ["hall"]);
            assert.deepEqual(seats("capital"), ["keep"]);
        }
    });

    it("sits a reeve in the town hall for their people, who gives work to their own and none to strangers", () => {
        const { host, player } = hosted();
        const reeve = facing(host, "home:hall-1/reeve");
        const post = host.postOf(reeve.id);

        assert.deepEqual([post.post, post.town, post.owner, post.work], ["hall", host.world.start.id, "human", true]);

        const asked = host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } });

        assert.equal(asked.ok, true);
        assert.equal(asked.request.from.id, reeve.id);
        assert.ok(asked.request.text.length > 20);

        // (Asking again the same turn: the same)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).request, asked.request);

        const taken = host.command(HOST_PLAYER, { type: "effect", effect: { work: "accept" } });
        const events = run(host, STEP_MS);

        assert.equal(taken.ok, true);
        assert.equal(player.standing.requests.length, 1);
        assert.ok(events.some(({ type, change, id }) => type === "request" && change === "taken" && id === HOST_PLAYER));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "accept" } }).reason, "work");

        // A stranger (an elf) gets nothing from them
        player.realm = "elf";
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).reason, "stranger");
        player.realm = "human";

        // Nor from one of the folk who's no official
        const clerk = facing(host, "home:hall-1/clerk");

        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).reason, "official");
        assert.equal(host.postOf(clerk.id).report, true);
    });

    it("takes a letter from whoever it's for, and a tithe, paying what they're worth: standing, coppers, and a rank when it's reached", () => {
        const { host, player } = hosted({ points: STANDINGS[1].points - 5 });
        const home = host.world.start.id;

        player.progress.gold = 100;
        player.standing.take(request("message", { target: { town: home, name: "Home", at: [0, 0], post: "hall" }, reward: { standing: 12, coppers: 7 } }));
        player.standing.take(request("tithe", { from: { ...request().from, town: home }, target: { coppers: 30 }, reward: { standing: 15, coppers: 0 } }));

        const treasury = host.war.realm("human").treasury;

        facing(host, "home:hall-1/reeve");
        assert.equal(host.dueTo(HOST_PLAYER, "home:hall-1/reeve").length, 2);

        const told = host.command(HOST_PLAYER, { type: "effect", effect: { report: true } });
        const events = run(host, STEP_MS);

        assert.equal(told.ok, true);
        assert.equal(told.reported.length, 2);
        assert.equal(player.progress.gold, 100 + 7 - 30);
        assert.ok(Math.abs(host.war.realm("human").treasury - (treasury + 30 * TITHE_RATE)) < 1e-9);
        assert.equal(player.standing.points, STANDINGS[1].points - 5 + 27);
        assert.deepEqual(player.standing.requests, []);
        assert.deepEqual(
            player.standing.done.map(({ kind, state }) => [kind, state]),
            [["tithe", "done"], ["message", "done"]],
        );
        assert.ok(events.some(({ type, rank, title }) => type === "standing" && rank === 1 && title === "Freeholder"));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { report: true } }).reason, "due");
    });

    it("counts the foes a player brings down for what they were asked: the wild, and the soldiers of a people at war with theirs", () => {
        const { host, player, actor } = hosted();
        const enemy = host.war.realms.find(({ id }) => id !== "human").id;

        host.war.relations[["human", enemy].sort().join("|")] = { state: "hostile", since: 0 };
        player.standing.take(request("wild", { target: { wild: true, need: 1 } }));
        player.standing.take(request("bounty", { target: { realm: enemy, need: 1 } }));

        // Out in the world, the wild's orc and a soldier of theirs beside the player, each nearly dead
        put(actor, "town", host.world.spawns.player);
        Object.assign(actor, { hp: 5000, maxHp: 5000 });
        host.battle.add({ id: "orc", kind: "orc", name: "Orc", weapon: "cleaver", team: "orcs", square: [actor.square[0] + 1, actor.square[1]] });
        host.battle.add({ id: "foe", kind: "soldier", name: "Foe", weapon: "sword", team: enemy, square: [actor.square[0], actor.square[1] + 1] });

        const events = [];

        for (const id of ["orc", "foe"]) {
            host.battle.actor(id).hp = 1;

            if (!host.battle.actor(id).dead) {
                host.command(HOST_PLAYER, { type: "engage", target: id });
                events.push(...run(host, 20000));
            }
        }

        for (const id of ["orc", "foe"]) {
            assert.ok(events.some(({ type, id: fallen, by }) => type === "death" && fallen === id && by === HOST_PLAYER), id);
        }

        assert.deepEqual(
            player.standing.requests.map(({ kind, state, count }) => [kind, state, count]),
            [["wild", "done", 1], ["bounty", "done", 1]],
        );
    });

    it("sees what a player goes near to scout; holds a town with them there till the camp's gone; fails what runs out of time, for standing lost", () => {
        const { host, player, actor } = hosted({ points: 100 });
        const enemy = host.war.realms.find(({ id }) => id !== "human").id;
        const theirs = host.war.towns.find(({ owner }) => owner === enemy);
        const home = host.war.town(host.world.start.id);

        host.war.relations[["human", enemy].sort().join("|")] = { state: "hostile", since: 0 };
        host.war.forces.push({ id: "force-camp", realm: enemy, kind: "camp", size: 10, at: [home.at[0] + 500, home.at[1]], path: [], leg: 0, target: home.id, home: theirs.id, since: 0 });
        player.standing.take(request("scout", { target: { town: theirs.id, name: theirs.name, realm: enemy, at: [...theirs.at] } }));
        player.standing.take(request("defend", { target: { town: home.id, name: home.name, at: [...home.at], camp: "force-camp", realm: enemy }, until: null }));
        player.standing.take(request("wild", { target: { wild: true, need: 3 }, until: host.war.turn - 1 }));

        // Out at home: there to hold it; the one run out of time failed
        put(actor, "town", host.world.spawns.player);

        let events = run(host, 600);

        assert.ok(events.some(({ type, change, request: asked }) => type === "request" && change === "there" && asked.kind === "defend"));
        assert.ok(events.some(({ type, change, request: asked }) => type === "request" && change === "failed" && asked.kind === "wild"));
        assert.equal(player.standing.points, 100 - FAILED);

        // Near the enemy's town: seen
        Object.assign(actor, { x: theirs.at[0] + 50, y: theirs.at[1] });
        events = run(host, 600);
        assert.equal(player.standing.requests.find(({ kind }) => kind === "scout").state, "done");

        // The camp gone, the town still theirs: held
        host.war.forces = host.war.forces.filter(({ id }) => id !== "force-camp");
        events = run(host, 600);
        assert.equal(player.standing.requests.find(({ kind }) => kind === "defend").state, "done");

        // Given up: a little standing lost
        const scouting = player.standing.requests.find(({ kind }) => kind === "scout");

        assert.equal(host.command(HOST_PLAYER, { type: "abandon", request: scouting.id }).ok, true);
        assert.equal(player.standing.points, 100 - 2 * FAILED);
        assert.equal(host.command(HOST_PLAYER, { type: "abandon", request: "nonsense" }).reason, "request");
    });

    it("seats the people's ruler in the keep, and opens its work, armoury and counsel only to those of rank", () => {
        const { host, player } = hosted();
        const keep = atTheKeep(host);
        const leader = host.war.realm("human").leader;
        const ruler = keep.folk.find(({ role }) => role === "ruler");

        assert.equal(ruler.name, leader.name);
        assert.equal(ruler.title, leader.title);
        assert.equal(ruler.people, "human");
        assert.equal(host.battle.actor(ruler.id).name, leader.name);

        // A commoner: turned away
        facing(host, keep.folk.find(({ role }) => role === "steward").id);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).reason, "rank");
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { armoury: true } }).reason, "rank");

        // A retainer: work, and the armoury's gift, once
        player.standing.gain(STANDINGS[OPENS.keep].points);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).ok, true);

        const gift = host.command(HOST_PLAYER, { type: "effect", effect: { armoury: true } });

        assert.deepEqual(gift.item, { id: "mail", quality: "fine" });
        assert.ok(player.progress.pack.some(({ id, quality }) => id === "mail" && quality === "fine"));
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { armoury: true } }).reason, "claimed");

        // Counsel: a knight's, where to march, at the ruler's feet
        const enemy = host.war.realms.find(({ id }) => id !== "human").id;
        const target = host.war.towns.find(({ owner }) => owner === enemy);

        host.war.relations[["human", enemy].sort().join("|")] = { state: "hostile", since: 0 };
        facing(host, ruler.id);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { counsel: { march: target.id } } }).reason, "rank");
        player.standing.gain(STANDINGS[OPENS.march].points);
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { counsel: { peace: enemy } } }).reason, "rank", "(peace takes a lord)");
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { counsel: { march: target.id } } }).ok, true);
        assert.deepEqual(host.war.realm("human").counsel, { march: target.id, weight: 0.4, until: host.war.turn + COUNSEL_TURNS });
    });

    it("seats a governor of the holders' people in a keep taken from its own, and seats them again in a world carried on", () => {
        const { host } = hosted();
        const capital = host.world.plan.places.find(({ kind, race }) => kind === "capital" && race === "human");
        const enemy = host.war.realms.find(({ id }) => id !== "human").id;

        host.war.town(capital.id).owner = enemy;

        const keep = atTheKeep(host);
        const governor = keep.folk.find(({ role }) => role === "ruler");

        assert.equal(governor.title, `Governor of ${host.war.town(capital.id).name}`);
        assert.equal(governor.people, enemy);
        assert.ok(keep.folk.filter(({ role }) => role !== "ruler").every(({ people }) => people === "human"), "(the townsfolk stay)");

        const again = Host.restore(buildWorld({ seed: 2 }), JSON.parse(JSON.stringify(host.snapshot())));
        const seated = again.folk.get(governor.id);

        assert.equal(seated.title, governor.title);
        assert.equal(seated.people, enemy);
    });

    it("keeps a player's standing and requests in their character, and in a snapshot", () => {
        const { host, player } = hosted({ points: 250, claimed: [2] });

        player.standing.take(request("wild", { target: { wild: true, need: 2 } }));

        const kept = host.characterOf(player).standing;

        assert.equal(kept.points, 250);
        assert.deepEqual(kept.claimed, [2]);
        assert.equal(kept.requests[0].kind, "wild");

        const again = Host.restore(buildWorld({ seed: 2 }), JSON.parse(JSON.stringify(host.snapshot())));

        assert.deepEqual(again.players.get(HOST_PLAYER).standing.toJSON(), player.standing.toJSON());
    });
});
