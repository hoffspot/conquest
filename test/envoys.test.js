// Envoys on the roads, and grudges and favours (client/js/core/host.js with core/war/war.js;
// docs/WAR.md M7): an envoy near a player met on the road with their escort, going at their own
// pace, heard at the road's end; struck down, waylaid, and a grudge borne for it; the keep's
// requests to see an envoy there, or stop one; a people's enemy brought down before its soldiers,
// a favour owed; and all of it kept
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { ENVOY, HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { OPENS, offerRequest, progressOf, STANDINGS, whereTo } from "../client/js/core/standing.js";
import { tell } from "../client/js/core/war/news.js";
import { decode, encode } from "../client/js/core/wire.js";
import { regardOf } from "../client/js/app/journal.js";
import { soldierLook } from "../client/js/characters/soldiers.js";

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

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null, target: null });

// An elven envoy on the road just outside the player's town, bound for the humans' seat (their
// road's end `length` metres on), seeking a truce; the player by them
function onTheRoad(host, { realm = "elf", length = 40, mission = "truce" } = {}) {
    const war = host.war;
    const [mx, my] = host.world.stamp.middle;
    const at = [mx + 90, my + 5];
    const path = [at, [at[0] + length / 2, at[1]], [at[0] + length, at[1]]];
    const envoy = { id: "force-950", realm, kind: "envoy", size: 0, at: [...at], path, leg: 0, target: "human", home: war.realm(realm).capital, mission, about: null, since: war.turn };

    war.forces.push(envoy);
    put(host.battle.actor(HOST_PLAYER), [Math.floor(at[0] - 12), Math.floor(at[1] + 8)]);

    return { war, envoy };
}

describe("envoys on the roads, grudges and favours (host.js, war.js)", () => {
    it("meets an envoy near a player on the road, with their escort, and they go at their own pace to be heard at its end", () => {
        const host = hosted();
        const { war, envoy } = onTheRoad(host);
        const events = run(host, 1000);
        const met = events.find(({ type }) => type === "envoy");

        assert.ok(met, "(met)");
        assert.equal(met.ids.length, 1 + ENVOY.escort);
        assert.equal(host.battle.actor(met.ids[0]).name, "Elven envoy");
        assert.equal(host.battle.actor(met.ids[1]).name, "Elven escort");
        assert.equal(host.soldiers.get(met.ids[0]).part, "envoy");
        assert.ok(war.watched.has(envoy.id), "(the war leaves them to the world)");

        // (The war doesn't move them on at its own pace)
        const before = [...envoy.at];

        war.step();
        assert.ok(war.force(envoy.id) && Math.hypot(envoy.at[0] - before[0], envoy.at[1] - before[1]) < 30, "(not 400 m on)");

        // Walked to the road's end: heard
        const later = run(host, 90000);

        assert.ok(later.some(({ type, over }) => type === "envoyed" && over === "arrived"), "(arrived)");
        assert.ok(later.some(({ type, event }) => type === "war" && event.type === "treaty" && event.force === envoy.id));
        assert.ok(!war.force(envoy.id));

        // Far off: let go
        put(host.battle.actor(HOST_PLAYER), [Math.floor(envoy.at[0] - ENVOY.far - 50), Math.floor(envoy.at[1])]);
        assert.ok(run(host, 1000).some(({ type, envoy: id }) => type === "farewell" && id === envoy.id));
        assert.ok(!host.envoys.has(envoy.id) && met.ids.every((id) => !host.battle.actor(id)));
    });

    it("dresses an envoy in robes, with a staff", () => {
        const look = soldierLook({ people: "elf", weapon: "staff", seed: 3, part: "envoy" });

        assert.ok(look.equipment.includes("mageRobe") && look.equipment.includes("staff"));
        assert.ok(soldierLook({ people: "orc", weapon: "staff", seed: 3, part: "envoy" }).equipment.includes("tunic"));
    });

    it("counts an envoy struck down as waylaid, by whoever did it, and their people bear a grudge", () => {
        const host = hosted();
        const { war, envoy } = onTheRoad(host, { realm: "orc", length: 200 });
        const player = host.battle.actor(HOST_PLAYER);

        war.relations["human|orc"] = { state: "hostile", since: 0 };

        const met = run(host, 1000).find(({ type }) => type === "envoy");
        const leader = host.battle.actor(met.ids[0]);

        // (Beside the road, not in the envoy's way)
        Object.assign(player, { hp: 5000, maxHp: 5000 });
        leader.hp = 1;
        put(player, [leader.square[0], leader.square[1] + 1]);
        host.command(HOST_PLAYER, { type: "engage", target: leader.id });

        const grudge = war.realm("orc").standing.human ?? 0;
        const events = run(host, 15000);
        const waylaid = events.find(({ type, event }) => type === "war" && event.type === "waylaid")?.event;

        assert.ok(waylaid, "(waylaid)");
        assert.equal(waylaid.by, "human");
        assert.equal(waylaid.force, envoy.id);
        assert.ok(!war.force(envoy.id));
        assert.ok(war.realm("orc").standing.human < grudge);
        assert.ok(events.some(({ type, over, by }) => type === "envoyed" && over === "waylaid" && by === "human"));
        assert.match(tell(waylaid, war), /waylaid on the road by the Humans/);
        assert.match(tell({ ...waylaid, by: null }, war), /waylaid on the road\.$/);
    });

    it("asks a knight at the keep to see their envoy there, or stop an enemy's; done by how it ends", () => {
        const host = hosted();
        const war = host.war;
        const random = createRandom(9);
        const capital = war.realm("human").seat;
        const giver = { id: "steward", name: "Wat Steward", title: "the steward" };
        const [mx, my] = host.world.stamp.middle;
        const ours = { id: "force-960", realm: "human", kind: "envoy", size: 0, at: [mx + 90, my], path: [[mx + 90, my], [mx + 130, my]], leg: 0, target: "elf", home: capital, mission: "alliance", about: null, since: 0 };
        const theirs = { id: "force-961", realm: "orc", kind: "envoy", size: 0, at: [mx + 2000, my], path: [[mx + 2000, my], [mx + 4000, my]], leg: 0, target: "elf", home: war.realm("orc").capital, mission: "alliance", about: null, since: 0 };

        war.forces.push(ours, theirs);
        war.relations["human|orc"] = { state: "hostile", since: 0 };

        const kinds = (rank, post = "keep") => new Set(Array.from({ length: 80 }, () => offerRequest({ war, realm: "human", town: capital, post, giver, rank, random })?.kind));

        assert.ok(kinds(OPENS.escort).has("escort") && kinds(OPENS.waylay).has("waylay"));
        assert.ok(!kinds(OPENS.escort - 1).has("escort") && !kinds(OPENS.escort, "hall").has("escort"));

        const pick = (kind) => {
            for (let k = 0; k < 200; k++) {
                const request = offerRequest({ war, realm: "human", town: capital, post: "keep", giver, rank: OPENS.escort, random });

                if (request?.kind === kind) {
                    return request;
                }
            }

            return null;
        };
        const player = host.players.get(HOST_PLAYER);

        player.standing.gain(STANDINGS[OPENS.escort].points);

        const escort = player.standing.take(pick("escort"));
        const waylay = player.standing.take(pick("waylay"));

        assert.equal(escort.target.force, ours.id);
        assert.equal(waylay.target.force, theirs.id);
        assert.deepEqual(whereTo(escort, war).at, ours.at);
        assert.equal(progressOf(escort), "Find them on the road.");

        // With them on the road, to its end: done
        put(host.battle.actor(HOST_PLAYER), [Math.floor(mx + 80), Math.floor(my + 6)]);
        run(host, 1000);
        assert.ok(player.standing.find(escort.id).there);
        run(host, 60000);
        assert.ok(!war.force(ours.id));
        assert.equal(player.standing.find(escort.id).state, "done");

        // Theirs waylaid by the humans: done; by no one: it came to nothing
        war.waylaid(theirs.id, "human");
        run(host, 1000);
        assert.equal(player.standing.find(waylay.id).state, "done");
    });

    it("owes a player's people a favour when they bring down a people's enemy before its soldiers' eyes", () => {
        const host = hosted();
        const war = host.war;
        const home = war.town(host.world.start.id);
        const player = host.battle.actor(HOST_PLAYER);

        // The town held by the elves, at war with the orcs; an orc in sight of its guard (beyond
        // its leash: the player's to bring down)
        home.owner = "elf";
        war.relations["elf|orc"] = { state: "hostile", since: 0 };
        run(host, 1000);

        const guard = host.battle.actors.find(({ id }) => id.startsWith(`${home.id}/guard-`));

        host.battle.add({ id: "raider", kind: "soldier", name: "Orcish raider", weapon: "cleaver", team: "orc", square: [guard.square[0] + 18, guard.square[1]], ai: null });
        Object.assign(host.battle.actor("raider"), { hp: 1 });
        Object.assign(player, { hp: 5000, maxHp: 5000 });
        put(player, [guard.square[0] + 19, guard.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: "raider" });

        const before = war.realm("elf").standing.human ?? 0;
        const events = run(host, 10000);

        assert.ok(events.some(({ type, id, by }) => type === "death" && id === "raider" && by === HOST_PLAYER));
        assert.ok(war.realm("elf").standing.human > before, "(the elves owe the humans)");
        assert.deepEqual(regardOf(40), { words: "are much in your debt", tone: "favour" });
        assert.deepEqual(regardOf(-10).tone, "grudge");
        assert.deepEqual(regardOf(0).tone, "none");
    });

    it("keeps the envoys met with the world, and carries on from them exactly", () => {
        const host = hosted();

        onTheRoad(host, { length: 200 });
        run(host, 3000);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.envoys.keys()], [...host.envoys.keys()]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 4000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });
});
