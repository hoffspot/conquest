// The host (client/js/core/host.js): the one authority over a running world, with any number of
// players, each by id, doing things only by commands it checks; the buildings near any of them
// got ready; and all of it kept as plain data and made again to carry on exactly as it would
// have (battle.js snapshot, random.js state, variety.js, wire.js)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, RELEVANCE } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { TURN_MS, War } from "../client/js/core/war/war.js";
import { createRandom } from "../client/js/core/random.js";
import { Variety } from "../client/js/core/variety.js";
import { decode, encode } from "../client/js/core/wire.js";
import { generateWorld } from "../client/js/core/world.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

/** Run a host for `ms`, a step at a time, collecting what happened. */
function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// What a host is, to compare two (the battle's actors without their private chances' closures)
const stateOf = (host) => encode(host.snapshot());

describe("keeping where things have got to (random.js, variety.js, wire.js)", () => {
    it("carries on a random sequence from its kept state", () => {
        const random = createRandom(42);

        random.next();
        random.next();

        const kept = random.state;
        const ahead = [random.next(), random.next(), random.int(1, 6)];
        const again = createRandom(0);

        again.state = kept;
        assert.deepEqual([again.next(), again.next(), again.int(1, 6)], ahead);
    });

    it("remembers a variety's last choices when kept and given back", () => {
        const random = createRandom(3);
        const variety = new Variety(() => random.next());

        variety.next("slash", 5);
        variety.next("fireball", 3);

        const kept = JSON.parse(JSON.stringify(variety));
        const back = new Variety(() => 0, kept);

        assert.deepEqual([...back.last], [...variety.last]);
        assert.notEqual(back.next("slash", 5), variety.last.get("slash"));
    });

    it("carries numbers JSON can't (never yet, not till then) there and back", () => {
        const value = { a: -Infinity, b: [Infinity, 1, NaN], c: { d: 2, e: "x" }, f: { $: "not a number" } };
        const back = decode(encode(value));

        assert.equal(back.a, -Infinity);
        assert.equal(back.b[0], Infinity);
        assert.ok(Number.isNaN(back.b[2]));
        assert.deepEqual(back.c, { d: 2, e: "x" });
        assert.ok(Number.isNaN(back.f), "(a lone $ is always a number)");
    });
});

describe("a battle kept and made again (battle.js snapshot, restore)", () => {
    it("carries on exactly as it would have: fighting, patrolling, the folk about their business", () => {
        const world = generateWorld({ seed: 7 });
        const battle = new Battle(world, { seed: 7 });

        battle.add({ id: "player", kind: "player", name: "Ada", weapon: "bow", team: "town", square: world.spawns.player });
        battle.add({ id: "orc", kind: "orc", name: "Orc", weapon: "cleaver", team: "orcs", square: world.spawns.orc, ai: "patrol", patrol: world.patrol });

        for (const one of world.folk) {
            battle.add({ id: one.id, kind: "folk", name: one.name, team: "folk", square: one.square, map: one.map, ai: "routine", neutral: true, routine: one.routine, role: one.role, facing: one.facing });
        }

        battle.command("player", { type: "engage", target: "orc", run: true });

        for (let t = 0; t < 6000; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        const copy = Battle.restore(world, decode(encode(battle.snapshot())));
        const [ours, theirs] = [[], []];

        for (let t = 0; t < 30000; t += STEP_MS) {
            ours.push(...battle.advance(STEP_MS));
            theirs.push(...copy.advance(STEP_MS));
        }

        assert.ok(ours.some(({ type }) => type === "hit"), "(there was a fight)");
        assert.deepEqual(theirs, ours);
        assert.equal(encode(copy.snapshot()), encode(battle.snapshot()));
    });
});

describe("the host (host.js)", () => {
    let world;

    before(() => {
        world = buildWorld({ seed: 2 });
    });

    const hosted = (players = [HOST_PLAYER]) => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        for (const id of players) {
            host.join({ id, hero: { ...HERO, name: id } });
        }

        host.populate();

        return host;
    };

    it("puts the world's people in after the first player: the orc and the tavern's folk", () => {
        const host = hosted();

        assert.deepEqual(host.battle.actors.slice(0, 2).map(({ id }) => id), [HOST_PLAYER, "orc"]);
        assert.equal(host.battle.actors.filter(({ kind }) => kind === "folk").length, world.folk.length);
        assert.ok(world.folk.every(({ id }) => host.folk.get(id)?.name));
        assert.equal(host.players.get(HOST_PLAYER).realm, "human");
    });

    it("pauses only with one player: others come in beside them, and take their character with them as they go", () => {
        const host = hosted();

        assert.ok(host.pausable);

        const guest = host.join({ id: "guest", hero: { ...HERO, name: "Bea", weapon: "staff" }, talks: { memory: { barkeep: { talks: 2, flags: [] } }, knowledge: ["rooms"] } });
        const [me, them] = [host.battle.actor(HOST_PLAYER), host.battle.actor("guest")];

        assert.ok(!host.pausable);
        assert.equal(them.kind, "player");
        assert.equal(them.weapon, "staff");
        assert.notDeepEqual(them.square, me.square);
        assert.ok(Math.hypot(them.square[0] - me.square[0], them.square[1] - me.square[1]) < 3);
        assert.ok(guest.talks.knowledge.has("rooms"));
        assert.deepEqual(run(host, STEP_MS).filter(({ type }) => type === "join").map(({ id }) => id), [HOST_PLAYER, "guest"]);

        const kept = host.leave("guest");

        assert.deepEqual(kept.talks, { memory: { barkeep: { talks: 2, flags: [] } }, knowledge: ["rooms"] });
        assert.equal(kept.hero.name, "Bea");
        assert.equal(host.battle.actor("guest"), null);
        assert.ok(host.pausable);
        assert.equal(host.leave("guest"), null);
    });

    it("does only what can be done, for players who are there", () => {
        const host = hosted();
        const [folk] = world.folk;

        assert.deepEqual(host.command("nobody", { type: "stop" }), { ok: false, reason: "player" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "fly" }), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, null), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "move", to: [1.5, 2] }), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "move", to: "there" }), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ahead", facing: NaN }), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "engage", target: folk.id }), { ok: false, reason: "target" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "engage", target: HOST_PLAYER }), { ok: false, reason: "target" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "enter", link: "nowhere" }), { ok: false, reason: "link" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "talk", with: "orc" }), { ok: false, reason: "target" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "talk", with: folk.id }), { ok: false, reason: "far" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { buy: "ale" } }), { ok: false, reason: "talking" });
        assert.equal(host.battle.actor(HOST_PLAYER).order, null);

        const [x, y] = host.battle.actor(HOST_PLAYER).square;

        assert.deepEqual(host.command(HOST_PLAYER, { type: "move", to: [x + 3, y], run: 1 }), { ok: true });
        assert.deepEqual({ ...host.battle.actor(HOST_PLAYER).order, to: null }, { type: "move", to: null, run: true });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "engage", target: "orc" }), { ok: true });
        assert.equal(host.battle.actor(HOST_PLAYER).order.target, "orc");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "vigor" }), { ok: false, reason: "healthy" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "hellfire", target: "orc" }), { ok: false, reason: "unknown" });
    });

    it("shows a player's emote to everyone, standing still for it: only an emote, and not while they're down, mid-blow or dead", () => {
        const host = hosted();
        const player = host.battle.actor(HOST_PLAYER);
        const [x, y] = player.square;

        assert.deepEqual(host.command(HOST_PLAYER, { type: "emote", emote: "dance" }), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "emote", emote: "toString" }), { ok: false, reason: "command" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "move", to: [x + 3, y] }), { ok: true });
        assert.ok(player.path.length);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "emote", emote: "wave" }), { ok: true });
        assert.equal(player.order, null);
        assert.equal(player.path.length, 0, "stopped where they were going");
        assert.deepEqual(
            run(host, STEP_MS).filter(({ type }) => type === "emote").map(({ id, emote }) => ({ id, emote })),
            [{ id: HOST_PLAYER, emote: "wave" }],
        );

        player.downUntil = host.battle.time + 1000;
        assert.deepEqual(host.command(HOST_PLAYER, { type: "emote", emote: "bow" }), { ok: false, reason: "down" });
        player.downUntil = 0;
        player.attack = { attack: 0, target: "orc", start: host.battle.time, struck: false };
        assert.deepEqual(host.command(HOST_PLAYER, { type: "emote", emote: "bow" }), { ok: false, reason: "midst" });
        player.attack = null;
        player.dead = true;
        assert.deepEqual(host.command(HOST_PLAYER, { type: "emote", emote: "bow" }), { ok: false, reason: "dead" });
    });

    it("lets a player talk to one of the folk near them, and keeps what's done by talking", () => {
        const host = hosted();
        const one = world.folk.find(({ map }) => map === "taproom");
        const player = host.battle.actor(HOST_PLAYER);
        const npc = host.battle.actor(one.id);

        Object.assign(player, { map: npc.map, square: [npc.square[0], npc.square[1] + 1], x: npc.square[0] + 0.5, y: npc.square[1] + 1.5 });

        assert.deepEqual(host.command(HOST_PLAYER, { type: "talk", with: one.id }), { ok: true });
        assert.equal(npc.talkingTo, HOST_PLAYER);
        assert.equal(player.talkingTo, one.id);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { buy: "ale", price: 2 } }), { ok: true });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: "ale" }), { ok: false, reason: "command" });
        assert.deepEqual(host.done, [{ buy: "ale", price: 2, by: one.id, player: HOST_PLAYER, at: 0 }]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "talk", with: null }), { ok: true });
        assert.equal(npc.talkingTo, null);
        assert.equal(player.talkingTo, null);

        const events = run(host, STEP_MS).filter(({ type }) => type === "talk" || type === "effect");

        assert.deepEqual(events.map(({ type, with: withId = undefined }) => [type, withId]), [["talk", one.id], ["effect", undefined], ["talk", null]]);
    });

    it("gets the buildings near any player ready, and lets them go once every player's far off", () => {
        const host = hosted([HOST_PLAYER, "guest"]);
        const building = [...host.world.interiors.buildings.values()].find((each) => each.entrance && each.kind === "tavern");
        const [me, guest] = [host.battle.actor(HOST_PLAYER), host.battle.actor("guest")];
        const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null });
        const [start] = [host.world.spawns.player];

        // Both far off: not ready
        put(me, start.map((value) => value - 100));
        put(guest, start.map((value) => value - 101));
        run(host, RELEVANCE.every);
        assert.ok(!host.open.has(building.key));

        // The guest by its door: ready, its folk inside, going about their business
        put(guest, building.door.ends[0].arrive);

        const opened = run(host, RELEVANCE.every).find(({ type, key }) => type === "open" && key === building.key);

        assert.ok(opened?.folk.length >= 6);
        assert.ok(opened.folk.every((id) => host.battle.actor(id)?.map.startsWith(building.key) && host.folk.has(id)));
        assert.ok(building.made);

        // The guest walks off, but the host player's in it: still ready
        const inside = building.maps[0];

        put(me, host.world.maps[inside].marks.D[0]);
        me.map = inside;
        put(guest, start.map((value) => value - 101));
        run(host, RELEVANCE.every * 2);
        assert.ok(host.open.has(building.key));

        // Everyone off: let go, its folk gone (its plans kept)
        me.map = "town";
        put(me, start.map((value) => value - 100));

        const closed = run(host, RELEVANCE.every).find(({ type, key }) => type === "close" && key === building.key);

        assert.deepEqual(closed?.folk, opened.folk);
        assert.ok(opened.folk.every((id) => !host.battle.actor(id) && !host.folk.has(id)));
        assert.ok(host.world.maps[inside]);
    });

    it("gets a building ready the moment a player's told to go in, and marks it on their maps once they have", () => {
        const host = hosted();
        const building = [...host.world.interiors.buildings.values()].find((each) => each.entrance && each.kind === "blacksmith");
        const player = host.battle.actor(HOST_PLAYER);
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5 });
        run(host, STEP_MS);
        assert.ok(host.players.get(HOST_PLAYER).explored.chunksVisited > 0);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }), { ok: true });
        assert.ok(host.open.has(building.key));

        const events = run(host, 2000);

        assert.equal(player.map, building.maps[0]);
        assert.deepEqual(events.filter(({ type, building: key }) => type === "explored" && key).map(({ id, building: key }) => [id, key]), [[HOST_PLAYER, building.key]]);
        assert.ok(host.players.get(HOST_PLAYER).explored.hasEntered(building.key));
    });

    it("walks a player from the start through every door near it, over the navigation mesh, even where a door's square is in the mesh's margin", () => {
        const host = hosted();
        const player = host.battle.actor(HOST_PLAYER);
        const start = host.world.spawns.player;
        const links = host.world.links.filter(({ ends }) => ends.some(({ map, squares }) => map === "town" && Math.hypot(squares[0][0] - start[0], squares[0][1] - start[1]) < 150));
        const through = [];

        assert.ok(links.length >= 4, `${links.length} doors`);

        for (const link of links) {
            Object.assign(player, { map: "town", square: [...start], x: start[0] + 0.5, y: start[1] + 0.5, path: [], order: null });
            host.command(HOST_PLAYER, { type: "enter", link: link.id });

            for (let t = 0; t < 40000 && player.map === "town"; t += STEP_MS) {
                host.advance(STEP_MS);
            }

            through.push(player.map !== "town" && link.id);
        }

        assert.deepEqual(through, links.map(({ id }) => id));
    });

    it("keeps the whole world as plain data, and carries on from it exactly as it would have", () => {
        const host = hosted([HOST_PLAYER, "guest"]);
        const building = [...host.world.interiors.buildings.values()].find((each) => each.entrance && each.kind === "tavern");
        const [x, y] = building.door.ends[0].squares[0];

        // Into a tavern with the guest, the orc after the host player, some talk done
        Object.assign(host.battle.actor("guest"), { square: [x, y], x: x + 0.5, y: y + 0.5 });
        host.command("guest", { type: "enter", link: building.door.id });
        host.command(HOST_PLAYER, { type: "engage", target: "orc" });
        run(host, 4000);

        const kept = encode(host.snapshot());
        const again = Host.restore(buildWorld({ seed: 2 }), decode(kept));

        assert.equal(stateOf(again), kept);
        assert.equal(again.world.maps[building.maps[0]].origin.join(), host.world.maps[building.maps[0]].origin.join());

        // The same commands, the same world after
        const [ours, theirs] = [[], []];

        for (const each of [host, again]) {
            each.command("guest", { type: "move", to: building.door.ends[1].arrive });
        }

        for (let t = 0; t < 20000; t += STEP_MS) {
            ours.push(...host.advance(STEP_MS));
            theirs.push(...again.advance(STEP_MS));
        }

        assert.ok(ours.length > 10);
        assert.deepEqual(theirs, ours);
        assert.equal(stateOf(again), stateOf(host));
        assert.equal(again.players.get("guest").explored.hasEntered(building.key), true);
    });

    it("moves the war on as the world's played, a turn at a time, kept with the world", () => {
        const host = hosted();

        host.war.setMight(8);

        const events = run(host, TURN_MS * 2);
        const turns = events.filter(({ type }) => type === "turn").map(({ turn }) => turn);
        const war = events.filter(({ type }) => type === "war").map(({ event }) => event);

        assert.deepEqual(turns, [1, 2]);
        assert.ok(war.some(({ type }) => type === "stage"), "(its events among the host's)");

        // Kept with the world, and carried on from
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.equal(encode(again.war.snapshot()), encode(host.war.snapshot()));
        host.war.step();
        again.war.step();
        assert.equal(encode(again.war.snapshot()), encode(host.war.snapshot()));

        // (A war kept for another world, or by another version, starts afresh)
        const fresh = new Host(buildWorld({ seed: 2 }), { war: { ...host.war.snapshot(), seed: 99 } });

        assert.equal(fresh.war.turn, 0);
        assert.equal(new Host(buildWorld({ seed: 2 }), { war: { ...host.war.snapshot(), version: 0 } }).war.turn, 0);
        assert.equal(new Host(buildWorld({ seed: 2 }), { war: host.war.snapshot() }).war.turn, 3);
        assert.ok(fresh.war instanceof War);
        assert.equal(new Host(generateWorld({ seed: 2 })).war, null, "(a town on its own has no war)");
    });

    it("won't carry on from a world kept by another version of the game", () => {
        const kept = hosted().snapshot();

        assert.throws(() => Host.restore(buildWorld({ seed: 2 }), { ...kept, version: 0 }), /another version/);
    });
});
