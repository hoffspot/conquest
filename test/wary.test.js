// Wary beasts (core/wary.js): the wild's natural beasts minded on first sight of a player by a
// reaction roll, and as minded warning them off, watching or stalking them, keeping away or coming
// up curious; their nerve failing when badly hurt or when their pack's leader falls; and food
// thrown them (battle.js #wary, toss), eaten, leaving the beast fed, or drawing one off a moment,
// or, fed enough, taming a curious one.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { BAIT, eats, MOODS, moodFor, NERVE, nerveOf, REACTION, twoDice, wary, WARY } from "../client/js/core/wary.js";
import { parseGrid } from "./helpers.js";
import { RESEARCH } from "../client/js/core/bestiary.js";

// An open field (nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// Moved on `ms`, step by step: what happened
function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS).map((event) => ({ ...event, at: battle.time })));
    }

    return events;
}

// A battle on an open field whose wary beasts meet the player with `nerve` added to their dice
// (as the host's would: core/host.js #nerve)
const battleOf = (nerve = 0, size = 120) => new Battle(field(size), { seed: 3, nerve: () => nerve });

// One of the wary beasts (`creature`), roaming as the host puts them out, its dice thrown low (two
// ones, every time: its mood the nerve's alone, REACTION)
function beast(battle, id, creature, square, { pack = id, leader = null, packSize = 1, hp = null, stands = false } = {}) {
    const spec = CREATURES[creature];
    const actor = battle.add({ id, kind: "beast", name: spec.name, weapon: spec.weapon, team: WILD, square, ai: "wild", hp: hp ?? spec.hp * 20, speed: spec.speed, chase: spec.chase, wild: { creature, tier: 2, temper: spec.temper, guard: spec.guard ?? 0, roam: 0, leash: 60, pack, leader, menace: true, unique: false, ...traitsOf(creature), reacts: true, packSize, ...(stands ? { stands } : {}) } });

    actor.chance = { next: () => 0, int: (low) => low, state: 0 };

    return actor;
}

// The player, hardy, standing still unless told otherwise
const player = (battle, square) => battle.add({ id: "player", kind: "player", name: "Wren", weapon: "sword", team: "hero", square, hp: 5000, armed: true });

const of = (events, type, id = null) => events.filter((event) => event.type === type && (id === null || event.id === id));
const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe("wary beasts' rules (core/wary.js)", () => {
    it("are the wild's natural beasts, none with hands: each eats meat or feed, and only some can be tamed", () => {
        for (const [creature, beast] of Object.entries(WARY)) {
            assert.ok(CREATURES[creature], creature);
            assert.ok(!CREATURES[creature].hands, creature);
            assert.ok(beast.eats.length > 0 && beast.eats.every((kind) => kind === "meat" || kind === "feed"), creature);
            assert.ok(typeof beast.display === "string", creature);
        }

        assert.ok(wary("wolf") && wary("hart") && !wary("werewolf") && !wary("bandit") && !wary("skeleton"));
        assert.ok(eats("wolf", "meat") && !eats("wolf", "feed") && eats("hart", "feed") && eats("bear", "meat") && eats("bear", "feed"));
    });

    it("reads a reaction roll: two or under, it comes for them; to five, it warns; to eight, watches; to eleven, keeps away; over that, curious (or watching, one that can't be tamed)", () => {
        assert.deepEqual([2, 3, 5, 6, 8, 9, 11, 12].map((roll) => moodFor("wolf", roll)), ["attack", "warn", "warn", "watch", "watch", "avoid", "avoid", "curious"]);
        assert.equal(moodFor("snake", 12), "watch");
        assert.deepEqual(REACTION, { attack: 2, warn: 5, watch: 8, avoid: 11 });

        const low = { next: () => 0 };
        const high = { next: () => 0.9999 };

        assert.equal(twoDice(low), 2);
        assert.equal(twoDice(high), 12);
    });

    it("is swayed by its temper, how a fight with it would go, its pack, the night, its den, light, a hurt player and meat", () => {
        assert.equal(nerveOf("wolf", { temper: "aggressive" }), -3);
        assert.equal(nerveOf("porcupine", { temper: "defensive" }), 2);
        // (An easy kill for them shies; a far stronger beast presses in: core/might.js fightLook)
        assert.equal(nerveOf("wolf", { temper: "aggressive", gap: 30 }), -3 + 3);
        assert.equal(nerveOf("wolf", { temper: "aggressive", gap: -40 }), -3 - 2);
        assert.equal(nerveOf("wolf", { temper: "aggressive", pack: 3, night: true, den: true }), -3 - 1 - 1 - 2);
        // (Fire makes the shy wary; hurt and meat embolden a predator, not a grazer)
        assert.equal(nerveOf("wolf", { temper: "aggressive", lit: true, hurt: true, meat: true }), -3 + 2 - 2 - 1);
        assert.equal(nerveOf("hart", { temper: "territorial", lit: true, hurt: true, meat: true }), -1);
        assert.equal(NERVE.packOf, 3);
    });
});

describe("a wary beast minded on first sight (battle.js #wary)", () => {
    it("warning them off: stands its ground turned to them, its display made every so often, and comes for them once they've stayed too long", () => {
        const battle = battleOf(2);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);
        const me = player(battle, [40, 50]);

        let events = run(battle, 3000);

        assert.equal(wolf.mood.kind, "warn");
        assert.equal(wolf.mood.by, "player");
        assert.ok(of(events, "warning", "wolf").length >= 1);
        assert.equal(of(events, "warning", "wolf")[0].display, "snarl");
        assert.equal(wolf.target, null);
        assert.ok(apart(wolf, me) > 9);

        // (Stayed within twelve metres past six seconds: it charges)
        events = run(battle, MOODS.warn.linger);
        assert.equal(of(events, "charge", "wolf").length, 1);
        assert.equal(wolf.mood.kind, "attack");
        assert.equal(wolf.target, "player");
    });

    it("warning them off: settles once they back off past sixteen metres, and charges one who comes within five", () => {
        const battle = battleOf(2);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);
        const me = player(battle, [40, 50]);

        run(battle, 2000);
        assert.equal(wolf.mood.kind, "warn");

        battle.place("player", "town", [40, 70]);
        let events = run(battle, MOODS.warn.linger + 2000);

        assert.equal(of(events, "warning", "wolf").length, 0);
        assert.equal(of(events, "charge").length, 0);
        assert.equal(wolf.target, null);

        battle.place("player", "town", [Math.floor(wolf.x), Math.floor(wolf.y) + 4]);
        events = run(battle, 500);
        assert.equal(of(events, "charge", "wolf").length, 1);
        assert.equal(wolf.target, me.id);
    });

    it("watching them, one that doesn't hunt: keeps twelve metres off as they come on", () => {
        const battle = battleOf(5);
        const hart = beast(battle, "hart", "hart", [40, 40]);
        const me = player(battle, [40, 50]);

        run(battle, 1000);
        assert.equal(hart.mood.kind, "watch");

        battle.place("player", "town", [40, 46]);
        run(battle, 6000);
        assert.ok(apart(hart, me) >= MOODS.watch.keep - 1, `${apart(hart, me)}`);
        assert.equal(hart.target, null);
    });

    it("stalking them, a predator: following between sixteen and twenty-two metres off, and striking once they're under half their health", () => {
        const battle = battleOf(5);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);
        const me = player(battle, [40, 50]);

        run(battle, 1000);
        assert.equal(wolf.mood.kind, "watch");

        // (They walk off; it keeps after them)
        battle.place("player", "town", [40, 80]);
        run(battle, 12000);

        const far = apart(wolf, me);

        assert.ok(far >= MOODS.watch.stalk[0] - 2 && far <= MOODS.watch.stalk[1] + 2, `${far}`);
        assert.equal(wolf.target, null);

        me.hp = me.maxHp * 0.4;

        const events = run(battle, 500);

        assert.equal(of(events, "charge", "wolf").length, 1);
        assert.equal(wolf.target, "player");
    });

    it("keeping away: going off twenty metres, and again when they come near", () => {
        const battle = battleOf(8);
        const boar = beast(battle, "boar", "boar", [40, 40]);
        const me = player(battle, [40, 50]);

        run(battle, 8000);
        assert.equal(boar.mood.kind, "avoid");
        assert.ok(apart(boar, me) >= MOODS.avoid.away - 2, `${apart(boar, me)}`);
        assert.equal(boar.target, null);
    });

    it("curious: coming up within eight metres, sniffing at them", () => {
        const battle = battleOf(12);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);
        const me = player(battle, [40, 52]);

        const events = run(battle, 8000);

        assert.equal(wolf.mood.kind, "curious");
        assert.ok(apart(wolf, me) <= MOODS.curious.follow + 1, `${apart(wolf, me)}`);
        assert.ok(of(events, "curious", "wolf").length >= 1);
        assert.equal(wolf.target, null);
    });

    it("minded to come for them: after them at once, as any of the wild", () => {
        const battle = battleOf(0);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);

        player(battle, [40, 50]);
        run(battle, 3000);
        assert.equal(wolf.mood.kind, "attack");
        assert.equal(wolf.target, "player");
    });

    it("struck, whatever its mood: it fights back", () => {
        const battle = battleOf(8);
        const boar = beast(battle, "boar", "boar", [40, 40]);

        player(battle, [40, 48]);
        run(battle, 500);
        assert.equal(boar.mood.kind, "avoid");

        // (Caught up with, right by it, and struck)
        battle.place("player", "town", [Math.floor(boar.x), Math.floor(boar.y) + 1]);
        battle.command("player", { type: "engage", target: "boar" });
        run(battle, 3000);
        assert.equal(boar.mood.kind, "attack");
        assert.equal(boar.target, "player");
    });

    it("minded once, its pack with it, as one", () => {
        const battle = battleOf(2);
        const lead = beast(battle, "w1", "wolf", [40, 40], { pack: "pack", packSize: 3 });
        const two = beast(battle, "w2", "wolf", [41, 40], { pack: "pack", leader: "w1", packSize: 3 });
        const three = beast(battle, "w3", "wolf", [39, 40], { pack: "pack", leader: "w1", packSize: 3 });

        player(battle, [40, 50]);
        run(battle, 1000);
        assert.deepEqual([lead, two, three].map(({ mood }) => mood?.kind), ["warn", "warn", "warn"]);
    });
});

describe("a wary beast's nerve (core/wary.js MORALE)", () => {
    it("gone at a quarter of its health: it limps off from them, set on no one, at a slower pace", () => {
        const battle = battleOf(0);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);
        const me = player(battle, [40, 44]);

        run(battle, 3000);
        assert.equal(wolf.target, "player");

        wolf.hp = Math.floor(wolf.maxHp * 0.2);

        const events = run(battle, 4000);

        assert.equal(of(events, "fled", "wolf").length, 1);
        assert.equal(wolf.mood.kind, "flee");
        assert.equal(wolf.target, null);
        assert.equal(of(events.filter(({ at }) => at > battle.time - 3000), "attack", "wolf").length, 0);
        assert.ok(apart(wolf, me) > 6);
    });

    it("limping slower than a player walks: one who goes after it catches it", () => {
        const battle = battleOf(0);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);
        const me = player(battle, [40, 44]);

        run(battle, 3000);
        wolf.hp = Math.floor(wolf.maxHp * 0.2);
        run(battle, 500);
        assert.equal(wolf.mood.kind, "flee");
        assert.ok(wolf.walkPace < me.speed, `${wolf.walkPace} against ${me.speed}`);
    });

    it("never gone for one of a den's, standing its ground there: it fights on", () => {
        const battle = battleOf(0);
        const wolf = beast(battle, "wolf", "wolf", [40, 40], { stands: true });

        player(battle, [40, 44]);
        run(battle, 3000);
        wolf.hp = Math.floor(wolf.maxHp * 0.2);

        const events = run(battle, 4000);

        assert.equal(of(events, "fled", "wolf").length, 0);
        assert.equal(wolf.target, "player");
        assert.ok(of(events, "attack", "wolf").length > 0);
    });

    it("gone for the rest of a pack once its leader falls", () => {
        const battle = battleOf(0);
        // (Its leader felled by a blow, its nerve no time to go)
        const lead = beast(battle, "w1", "wolf", [40, 40], { pack: "pack", packSize: 3, hp: 2 });

        beast(battle, "w2", "wolf", [41, 40], { pack: "pack", leader: "w1", packSize: 3 });
        beast(battle, "w3", "wolf", [39, 40], { pack: "pack", leader: "w1", packSize: 3 });
        player(battle, [40, 46]);
        battle.command("player", { type: "engage", target: "w1" });

        const events = run(battle, 8000);

        assert.ok(lead.dead);
        assert.deepEqual(of(events, "fled").map(({ id }) => id).sort(), ["w2", "w3"]);
    });
});

describe("food thrown to a wary beast (core/wary.js BAIT, battle.js toss)", () => {
    it("meat thrown to a wolf watching them: it goes to it, eats, and leaves them be after, even close by", () => {
        const battle = battleOf(5);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);
        const me = player(battle, [40, 50]);

        run(battle, 1000);
        assert.equal(wolf.mood.kind, "watch");
        assert.equal(battle.toss("player", "wolf", { kind: "meat", reach: BAIT.reach }).ok, true);

        let events = run(battle, 2000);
        const thrown = of(events, "bait", "player")[0];

        assert.equal(thrown.kind, "meat");
        assert.ok(Math.hypot(thrown.x - wolf.x, thrown.y - wolf.y) < 3);

        events = run(battle, BAIT.eat + 3000);
        assert.equal(of(events, "eat", "wolf").length, 1);
        assert.equal(of(events, "ate", "wolf").length, 1);
        assert.equal(wolf.mood.kind, "fed");
        assert.equal(battle.baits.length, 0);

        battle.place("player", "town", [Math.floor(wolf.x), Math.floor(wolf.y) + 3]);
        events = run(battle, 6000);
        assert.equal(of(events, "attack", "wolf").length, 0);
        assert.equal(wolf.target, null);
        assert.ok(me.hp === me.maxHp);
    });

    it("a feed bag thrown to a wolf: left lying (it doesn't eat that); to a hart, eaten", () => {
        const battle = battleOf(5);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);
        const hart = beast(battle, "hart", "hart", [70, 40]);

        player(battle, [40, 50]);
        run(battle, 500);
        battle.toss("player", "wolf", { kind: "feed", reach: BAIT.reach });

        let events = run(battle, 6000);

        assert.equal(of(events, "eat").length, 0);
        assert.equal(battle.baits.length, 1);
        assert.notEqual(wolf.mood?.kind, "fed");

        battle.place("player", "town", [70, 48]);
        run(battle, 1000);
        battle.toss("player", "hart", { kind: "feed", reach: BAIT.reach });
        events = run(battle, BAIT.eat + 3000);
        assert.equal(of(events, "ate", "hart").length, 1);
        assert.equal(hart.mood.kind, "fed");
    });

    it("thrown to a wolf already after them: it's drawn off them a moment, then comes on again", () => {
        const battle = battleOf(0);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);

        player(battle, [40, 50]);
        run(battle, 1500);
        assert.equal(wolf.target, "player");
        assert.equal(battle.toss("player", "wolf", { kind: "meat", reach: BAIT.reach }).ok, true);

        const events = run(battle, BAIT.distract + 4000);
        const ate = of(events, "ate", "wolf")[0];

        assert.ok(ate);
        assert.equal(of(events, "eat", "wolf").length, 1);
        assert.ok(ate.at - of(events, "eat", "wolf")[0].at <= BAIT.distract + STEP_MS);
        assert.equal(wolf.target, "player");
    });

    it("none to throw to: it lands a few strides ahead of the thrower", () => {
        const battle = battleOf(5);
        const me = player(battle, [40, 50]);

        me.facing = 0;
        battle.toss("player", null, { kind: "meat", reach: BAIT.reach });

        const thrown = of(run(battle, 1500), "bait", "player")[0];

        assert.ok(Math.abs(Math.hypot(thrown.x - me.x, thrown.y - me.y) - BAIT.ahead) < 1.5);
    });

    it("a curious wolf fed by them three times: tamed (the host's to make it theirs)", () => {
        const battle = battleOf(12);
        const wolf = beast(battle, "wolf", "wolf", [40, 40]);

        player(battle, [40, 52]);
        run(battle, 6000);
        assert.equal(wolf.mood.kind, "curious");

        const tamed = [];

        for (let k = 0; k < BAIT.tame; k++) {
            assert.equal(battle.toss("player", "wolf", { kind: "meat", reach: BAIT.reach }).ok, true, `${k}`);

            const events = run(battle, BAIT.eat + 3000);

            tamed.push(...of(events, "tamed", "wolf"));

            if (k < BAIT.tame - 1) {
                assert.equal(wolf.mood.kind, "curious");
                assert.equal(wolf.mood.feedings, k + 1);
            }
        }

        assert.equal(tamed.length, 1);
        assert.equal(tamed[0].by, "player");
    });
});

describe("wary beasts in play (core/host.js)", () => {
    const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

    // A world (seed 2) with its player out in the wilds, hard to kill, the orc gone; and a wolf of
    // the wild's by them, roaming as a wary beast (as #rouse puts one out)
    async function hosted({ spells = null } = {}) {
        const { Host, HOST_PLAYER } = await import("../client/js/core/host.js");
        const { buildWorld } = await import("../client/js/core/overworld.js");
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, ...(spells ? { progress: { spells } } : {}) });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const me = host.battle.actor(HOST_PLAYER);
        const [sx, sy] = world.start.at;
        const at = [Math.floor(sx + 300), Math.floor(sy + 300)];

        host.battle.place(HOST_PLAYER, "town", at);
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        const wolf = (id, square) => {
            const spec = CREATURES.wolf;

            host.wild.set(id, { creature: "wolf", tier: 2, pack: id, camp: null, lair: null, master: false });
            host.battle.add({ id, kind: "beast", name: spec.name, weapon: spec.weapon, team: WILD, square, ai: "wild", hp: spec.hp * 20, speed: spec.speed, chase: spec.chase, wild: { creature: "wolf", tier: 2, temper: spec.temper, guard: 0, roam: 0, leash: 60, pack: id, leader: null, menace: true, unique: false, ...traitsOf("wolf"), reacts: true, packSize: 1 } });
            host.battle.place(id, "town", square);

            return host.battle.actor(id);
        };

        return { host, me, at, wolf, HOST_PLAYER, Host, buildWorld };
    }

    const runHost = (host, ms) => {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        return events;
    };

    it("swayed by the host's nerve: a player with the Light about them, to a beast shy of fire, steadier", async () => {
        const { host, me, at, wolf } = await hosted();
        const beast = wolf("w", [at[0], at[1] + 10]);
        const dim = host.battle.nerve(beast, me);

        host.battle.buff(me.id, "light", { ms: 60000 });
        assert.equal(host.battle.nerve(beast, me), dim + NERVE.lit);
    });

    it("bait thrown from the pack to the beast they're set on: taken from the pack, and lying at its feet; meat carved from a beast thrown as meat bait", async () => {
        const { host, me, at, wolf, HOST_PLAYER } = await hosted();
        const beast = wolf("w", [at[0], at[1] + 8]);
        const progress = host.players.get(HOST_PLAYER).progress;

        progress.stow({ id: "meatBait" }, 2);
        progress.stow({ id: "boarMeat" }, 1);

        assert.equal(host.command(HOST_PLAYER, { type: "use", index: progress.slotOf("meatBait"), target: beast.id }).ok, true);

        let events = runHost(host, 1500);

        assert.equal(progress.held("meatBait"), 1);
        assert.ok(events.some((event) => event.type === "used" && event.item.id === "meatBait"));
        assert.equal(events.find((event) => event.type === "bait")?.kind, "meat");

        assert.equal(host.command(HOST_PLAYER, { type: "use", index: progress.slotOf("boarMeat"), target: beast.id, toss: true }).ok, true);
        events = runHost(host, 1500);
        assert.equal(progress.held("boarMeat"), 0);
        assert.ok(events.some((event) => event.type === "used" && event.thrown && event.item.id === "boarMeat"));
        assert.ok(me.hp === me.maxHp);
    });

    it("a curious wolf fed enough: the player's, a companion till it falls (never a time up), one at a time, kept with their character and brought back with it", async () => {
        const { host, at, wolf, HOST_PLAYER, Host, buildWorld } = await hosted();
        const beast = wolf("w", [at[0], at[1] + 6]);
        const progress = host.players.get(HOST_PLAYER).progress;

        beast.mood = { kind: "curious", by: HOST_PLAYER, at: host.battle.time, until: null, spared: false, feedings: BAIT.tame - 1 };
        progress.stow({ id: "meatBait" }, 1);
        host.command(HOST_PLAYER, { type: "use", index: progress.slotOf("meatBait"), target: beast.id });

        const events = runHost(host, BAIT.eat + 3000);
        const tamed = events.find((event) => event.type === "companion" && event.change === "tamed");

        assert.ok(tamed);
        assert.ok(!host.wild.has("w"));

        const companion = host.companions.get(tamed.companion);

        assert.equal(companion.tamed, true);
        assert.equal(companion.until, null);
        assert.deepEqual(host.partyOf(HOST_PLAYER), [{ id: tamed.companion, kind: "tamed" }]);

        const character = host.characterOf(host.players.get(HOST_PLAYER));

        assert.deepEqual(character.followers, [{ tamed: true, creature: "wolf", tier: 2, name: "Wolf" }]);

        // (Brought back with them, joining another world)
        const other = new Host(buildWorld({ seed: 2 }), { populate: false });

        other.join({ id: HOST_PLAYER, ...character });
        assert.deepEqual([...other.companions.values()].map(({ creature, tamed: theirs, until }) => ({ creature, theirs, until })), [{ creature: "wolf", theirs: true, until: null }]);

        // (Never counted in their might: a companion's no part of it, core/might.js)
        assert.equal(other.mightFor(HOST_PLAYER), host.mightFor(HOST_PLAYER));
        assert.ok(Host);
    });

    it("a tamed beast stays theirs through a saved world, and finds them again once they're carried off by magic (where a beast called by a spell is lost)", async () => {
        const { host, at, wolf, HOST_PLAYER, Host, buildWorld } = await hosted({ spells: ["teleport"] });
        const { decode, encode } = await import("../client/js/core/wire.js");
        const { SPELLS } = await import("../client/js/core/spells.js");
        const beast = wolf("w", [at[0], at[1] + 6]);
        const progress = host.players.get(HOST_PLAYER).progress;

        beast.mood = { kind: "curious", by: HOST_PLAYER, at: host.battle.time, until: null, spared: false, feedings: BAIT.tame - 1 };
        progress.stow({ id: "meatBait" }, 1);
        host.command(HOST_PLAYER, { type: "use", index: progress.slotOf("meatBait"), target: beast.id });

        const tamed = runHost(host, BAIT.eat + 3000).find((event) => event.type === "companion" && event.change === "tamed").companion;

        // (The world saved and brought back, as a server keeps it: still theirs, never a time up)
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        runHost(again, 2000);
        assert.deepEqual([...again.companions.keys()], [tamed]);

        // (Carried off by Teleport, far away: it comes after them)
        const me = again.battle.actor(HOST_PLAYER);

        Object.assign(me, { spellReadyAt: 0, spellsReadyAt: {}, mana: 1e6, maxMana: 1e6 });
        assert.deepEqual(again.command(HOST_PLAYER, { type: "cast", spell: "teleport" }), { ok: true });

        const events = runHost(again, SPELLS.teleport.castTime + 3000);

        assert.ok(events.some((event) => event.type === "carried" && event.id === HOST_PLAYER));
        assert.ok(!events.some((event) => event.type === "companion" && event.companion === tamed && event.change === "lost"));

        const follows = again.battle.actor(tamed);

        assert.ok(follows && !follows.dead);
        assert.ok(Math.hypot(follows.x - me.x, follows.y - me.y) < 12, "by them again");
    });

    it("left be, unfought, by a player who walks on: they know its kind the better", async () => {
        const { host, at, wolf, HOST_PLAYER } = await hosted();
        const beast = wolf("w", [at[0], at[1] + 10]);
        const progress = host.players.get(HOST_PLAYER).progress;
        const before = progress.bestiary.entry("wolf").points;

        beast.mood = { kind: "watch", by: HOST_PLAYER, at: host.battle.time, until: null, spared: false, feedings: 0 };
        beast.wild.leash = 400;
        host.battle.place(HOST_PLAYER, "town", [at[0], at[1] - 30]);

        const events = runHost(host, 1000);

        assert.ok(events.some((event) => event.type === "spared" && event.id === "w"));
        assert.equal(progress.bestiary.entry("wolf").points, before + RESEARCH.spared);
    });

    it("making camp: a wolf stalking them near forbids it, and strikes; one fed, or keeping away, doesn't", async () => {
        const { host, at, wolf, HOST_PLAYER } = await hosted();
        const stalker = wolf("s", [at[0], at[1] + 18]);

        stalker.mood = { kind: "watch", by: HOST_PLAYER, at: host.battle.time, until: null, spared: false, feedings: 0 };
        assert.deepEqual(host.command(HOST_PLAYER, { type: "camp" }), { ok: false, reason: "hostiles" });
        assert.equal(stalker.mood.kind, "attack");
        assert.equal(stalker.target, HOST_PLAYER);

        host.battle.remove("s");
        host.wild.delete("s");

        const fed = wolf("f", [at[0], at[1] + 12]);

        fed.mood = { kind: "fed", by: HOST_PLAYER, at: host.battle.time, until: host.battle.time + 60000, spared: false, feedings: 0 };
        assert.equal(host.campRefusal(HOST_PLAYER), null);
    });
});
