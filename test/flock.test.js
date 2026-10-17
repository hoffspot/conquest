// A creature calling its flock to it (creatures.js `call`: the Ant Monster, the ants' nests' great
// queen): now and then while it's after someone, its call, a motion of its own that strikes no one
// (battle.js #calls, CALL); and the host bringing them (host.js #flock): its kind from behind it,
// a tier or two under it, of its pack, never more of those it's called about it at once than it
// calls at most; in its nest, out with its level's foes, their falls not kept as the nest's own
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { Battle, CALL, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { hypot } from "../client/js/core/exact.js";
import { FLOCK, HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { decode, encode } from "../client/js/core/wire.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// A creature of the wild (creatures.js) in a battle, as the host puts one out (`boss`: as a
// dungeon's boss, host.js #rouse)
function creature(battle, id, kind, square, { hp = 500, boss = false } = {}) {
    const { weapon, speed, chase } = CREATURES[kind];

    return battle.add({ id, kind: "beast", name: CREATURES[kind].name, weapon, team: WILD, square, ai: "wild", hp, speed, chase, armed: true, wild: { creature: kind, tier: 6, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: id, leader: null, menace: true, ...traitsOf(kind, { boss }), ...(boss ? { champion: "boss", regalia: kind } : {}) } });
}

// A battle played on (ms), the player kept alive
function play(battle, ms, me) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        me.hp = me.maxHp;
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

describe("a creature calling its flock (battle.js #calls)", () => {
    it("calls first a while after it sets on someone, then every so often, between blows: its call a motion of its own that strikes no one, told as it goes out", () => {
        const call = traitsOf("antMonster").call;

        assert.equal(call.kind, "ant");
        assert.ok(call.first < call.every && call.count[0] >= 1 && call.count[1] <= call.most, JSON.stringify(call));
        assert.equal(traitsOf("ant").call, undefined, "an ant calls no one");

        const battle = new Battle(field(40), { seed: 5 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [12, 20], hp: 1e5 });
        const queen = creature(battle, "queen", "antMonster", [16, 20], { hp: 1e5 });
        const events = play(battle, call.first + call.every * 2 + CALL.duration, me);
        const calls = events.filter(({ type, id }) => type === "call" && id === "queen");
        const motions = events.filter(({ type, id, attack }) => type === "attack" && id === "queen" && attack === "call");

        // (Twice: a while after it set on the player, as soon as the fight began, then every so
        // often; each as its motion reaches the call, CALL.hitAt in)
        assert.equal(calls.length, 2, JSON.stringify(calls));
        assert.ok(calls[0].time >= call.first && calls[0].time <= call.first + CALL.duration + 1000, `${calls[0].time}`);
        assert.ok(calls[1].time - calls[0].time >= call.every);
        assert.deepEqual(
            calls.map(({ time }) => time),
            motions.map(({ time }) => time + CALL.hitAt),
        );
        assert.deepEqual(calls[0], { type: "call", id: "queen", target: "me", kind: "ant", count: call.count, most: call.most, map: queen.map, x: calls[0].x, y: calls[0].y, time: calls[0].time });
        assert.ok(Math.abs(calls[0].x - queen.x) < 3 && Math.abs(calls[0].y - queen.y) < 3);

        // (Nothing struck by it: no blow of the call's)
        assert.ok(!events.some(({ type, by, attack }) => type === "hit" && by === "queen" && attack === "call"));
        assert.ok(motions.every(({ animation, duration }) => animation === "call" && duration === CALL.duration));
    });

    it("calls oftener and more as a nest's boss", () => {
        const [wild, boss] = [traitsOf("antMonster").call, traitsOf("antMonster", { boss: true }).call];

        assert.equal(boss.kind, wild.kind);
        assert.ok(boss.every < wild.every && boss.most > wild.most && boss.count[1] > wild.count[1], JSON.stringify(boss));
    });
});

describe("a flock brought (host.js #flock)", () => {
    let world;
    let host;
    let me;
    let site;
    let building;
    let delve;

    before(() => {
        world = buildWorld({ seed: 1 });
        host = new Host(world, { populate: false });
        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        me = host.battle.actor(HOST_PLAYER);
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        // (The nearest ants' nest to where the player starts)
        const [sx, sy] = world.start.at;

        site = world.plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme === "nest").sort((a, b) => hypot(a.at[0] - sx, a.at[1] - sy) - hypot(b.at[0] - sx, b.at[1] - sy))[0];
    });

    const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

    function run(ms) {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            me.hp = me.maxHp;
            events.push(...host.advance(STEP_MS));
        }

        return events;
    }

    // Through a door or down a flight: stood where one comes off it on this side, told to go
    // through, and played on till they've crossed
    function cross(link) {
        put(me, link.ends.find(({ map }) => map === me.map).arrive);
        host.command(HOST_PLAYER, { type: "enter", link: link.id });

        for (let t = 0; t < 60000; t += 250) {
            if (run(250).some(({ type, id }) => type === "cross" && id === HOST_PLAYER)) {
                return true;
            }
        }

        return false;
    }

    it("brings ants from behind the Ant Monster, a tier or two under it, of its pack, kept with its level's foes, no more about it at once than it calls at most; their falls not kept as the nest's own", () => {
        assert.ok(site, "an ants' nest in the world");
        assert.equal(buildDungeon({ seed: site.seed, theme: "nest", tier: 1 }).levels.at(-1).packs.find(({ role }) => role === "boss").foes[0].creature, "antMonster");

        // (Into it and down to its bottom level, where its boss is)
        world.maps.town.sites.heartOf(site);
        put(me, world.maps.town.sites.set.get(site.id).entrance.outside);
        run(1500);
        building = world.interiors.buildings.get(`site:${site.id}`);
        delve = host.dungeons.get(site.id);
        assert.ok(cross(building.door));

        for (const flight of building.flights) {
            assert.ok(cross(flight));
        }

        const bottom = building.maps.length - 1;
        const [id, boss] = [...host.wild].find(([, one]) => one.dungeon === site.id && one.champion === "boss");
        const queen = host.battle.actor(id);
        const { most } = queen.wild.call;

        assert.equal(boss.creature, "antMonster");
        assert.equal(queen.map, building.maps[bottom]);

        // (Too tough to fall while it calls; the player beside it, set on)
        Object.assign(queen, { hp: 1e7, maxHp: 1e7 });
        put(me, [queen.square[0] + 2, queen.square[1]]);

        const called = [];

        for (let t = 0; t < 90000 && called.length < 3; t += 1000) {
            put(me, [Math.floor(queen.x) + 2, Math.floor(queen.y)]);
            called.push(...run(1000).filter(({ type, id: by }) => type === "called" && by === id));
        }

        assert.ok(called.length >= 2, `${called.length} calls`);

        for (const { ids, kind } of called) {
            assert.equal(kind, "ant");

            for (const ant of ids) {
                const one = host.wild.get(ant);

                assert.deepEqual([one.creature, one.tier, one.pack, one.called, one.extra, one.dungeon, one.foe], ["ant", Math.max(1, boss.tier - FLOCK.down), boss.pack, id, true, site.id, null]);
                assert.ok(delve.awake[bottom].includes(ant), "out with its level's foes");
            }
        }

        // (Never more of them about it at once than it calls at most)
        const about = () => [...host.wild].filter(([ant, one]) => one.called === id && !host.battle.actor(ant)?.dead).length;

        assert.ok(about() <= most && about() >= 1, `${about()} about it`);

        // (One of them falling: nothing kept of it as the nest's own)
        const dead = [...delve.dead];
        const ant = called[0].ids.find((each) => host.battle.actor(each) && !host.battle.actor(each).dead);

        host.battle.afflict(ant, "poison", { by: HOST_PLAYER, damage: 1e7 });
        run(2000);
        assert.ok(host.battle.actor(ant)?.dead ?? true);
        assert.deepEqual(delve.dead, dead);

        // (Kept in a snapshot)
        const again = Host.restore(buildWorld({ seed: 1 }), decode(encode(host.snapshot())));

        assert.deepEqual(
            [...again.wild].filter(([, one]) => one.called === id),
            [...host.wild].filter(([, one]) => one.called === id),
        );
    });
});
