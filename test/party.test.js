// The player's party (client/js/core/host.js partyOf, #orderUnit; core/battle.js #follow;
// docs/GAME.md): those with them, in order: their hired adventurers, the creatures they've called
// to their side, the dead they've raised; each told to wait, to follow, to fight whoever the
// player's set on, or to go; and what a creature at their side brings down counting for them
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREATURES } from "../client/js/core/creatures.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { nearestFree, squareKey, squaresOf } from "../client/js/core/grid.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SPELLS } from "../client/js/core/spells.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "grimoire", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world with its player in its home guild, gold in hand, a grimoire, and Summon and Zombify known
function atTheGuild() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 500, spells: ["summon", "zombify"], gear: { mainHand: { id: "grimoire", quality: "common" } } } });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

    host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
    host.command(HOST_PLAYER, { type: "stop" });
    run(host, 1000);

    return { host, guild, player: host.players.get(HOST_PLAYER), me: host.battle.actor(HOST_PLAYER) };
}

// One of the guild's adventurers hired: their follower's id
function hire(host, guild) {
    const one = guild.folk.find(({ role, talk }) => role === "adventurer" || talk === "adventurer");
    const npc = host.battle.actor(one.id);
    const me = host.battle.actor(HOST_PLAYER);

    put(me, npc.map, [npc.square[0], npc.square[1] + 2]);
    assert.equal(host.command(HOST_PLAYER, { type: "talk", with: one.id }).ok, true);

    const result = host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } });

    assert.equal(result.ok, true, JSON.stringify(result));
    host.command(HOST_PLAYER, { type: "talk", with: null });

    return result.follower;
}

// A spell cast where the player stands, and the world on till it's done
function cast(host, spell, rest = {}) {
    Object.assign(host.battle.actor(HOST_PLAYER), { spellReadyAt: 0, spellsReadyAt: {} });
    assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell, ...rest }), { ok: true }, spell);

    return run(host, SPELLS[spell].castTime + STEP_MS * 2);
}

// One of the wild's creatures by the player, on their map (struck down if `dead`): its id
function creature(host, id, kind, square, { dead = false, hp = 60 } = {}) {
    const me = host.battle.actor(HOST_PLAYER);

    host.wild.set(id, { creature: kind, tier: 1, pack: id, camp: null, lair: null, master: false });
    host.battle.add({ id, kind: "beast", name: CREATURES[kind].name, weapon: CREATURES[kind].weapon, team: "beasts", square, map: me.map, ai: null, hp, wild: { creature: kind, tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 30, pack: id, leader: null, menace: true, unique: false } });

    if (dead) {
        host.battle.afflict(id, "bleed", { power: 1000 });
        run(host, 2500);
        assert.ok(host.battle.actor(id).dead);
    }

    return id;
}

// A free square a few steps from the player, not `taken`
function near(host, dx, dy, taken = new Set()) {
    const me = host.battle.actor(HOST_PLAYER);
    const square = nearestFree(squaresOf(host.world.maps[me.map] ?? host.world), [me.square[0] + dx, me.square[1] + dy], { within: 6, taken: new Set([squareKey(...me.square), ...taken]) });

    taken.add(squareKey(...square));

    return square;
}

describe("the party (host.js partyOf, #orderUnit)", () => {
    it("is the player's hired adventurers, then the creatures they've called, then the dead they've raised", () => {
        const { host, guild } = atTheGuild();

        // (Raised and called first, the follower hired after: the list's order isn't theirs)
        const wolf = creature(host, "test-wolf", "wolf", near(host, 2, 0), { dead: true });

        cast(host, "zombify", { target: wolf });
        cast(host, "summon");

        const follower = hire(host, guild);

        const party = host.partyOf(HOST_PLAYER);

        assert.deepEqual(party.map(({ kind }) => kind), ["adventurer", "summon", "risen"]);
        assert.equal(party[0].id, follower);
        assert.equal(host.companions.get(party[1].id).risen, false);
        assert.equal(host.companions.get(party[2].id).risen, true);
        assert.deepEqual(host.partyOf("guest-1"), [], "(no one's with anyone else)");
    });

    it("tells any of them to wait, to follow again, or to go: a follower and a called creature alike", () => {
        const { host, guild } = atTheGuild();
        const follower = hire(host, guild);

        cast(host, "summon");

        const [called] = [...host.companions.keys()];

        for (const id of [follower, called]) {
            const unit = host.battle.actor(id);

            assert.equal(host.command(HOST_PLAYER, { type: "order", unit: id, order: "wait" }).ok, true);
            assert.equal(unit.ai, "patrol");
            assert.equal(host.waiting(id), true);

            assert.equal(host.command(HOST_PLAYER, { type: "order", unit: id, order: "follow" }).ok, true);
            assert.equal(unit.ai, "follow");
            assert.equal(host.waiting(id), false);
        }

        // (Gone their own way, each)
        const events = [];

        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: follower, order: "dismiss" }).ok, true);
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: called, order: "dismiss" }).ok, true);
        events.push(...run(host, 200));
        assert.ok(!host.followers.has(follower) && !host.battle.actor(follower));
        assert.ok(!host.companions.has(called) && !host.battle.actor(called));
        assert.deepEqual(host.partyOf(HOST_PLAYER), []);

        // (No one of theirs, or no such order: refused)
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: "orc", order: "wait" }).reason, "follower");
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: follower, order: "wait" }).reason, "follower");
    });

    it("sets one on whoever the player's set on, after them till they're down; refused with no one set on", () => {
        const { host, guild, me } = atTheGuild();
        const follower = hire(host, guild);
        const unit = host.battle.actor(follower);

        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: follower, order: "assist" }).reason, "untargeted");

        // (A brigand off to the side, the player set on it where they stand)
        const taken = new Set();

        put(unit, me.map, near(host, -2, 0, taken));
        host.battle.add({ id: "brigand", kind: "orc", name: "Brigand", weapon: "cleaver", team: "wild", square: near(host, 4, 0, taken), map: me.map, ai: null });
        Object.assign(host.battle.actor("brigand"), { hp: 30, maxHp: 30 });
        Object.assign(unit, { hp: 5000, maxHp: 5000 });
        assert.equal(host.command(HOST_PLAYER, { type: "engage", target: "brigand", stand: true }).ok, true);
        assert.equal(host.command(HOST_PLAYER, { type: "order", unit: follower, order: "assist" }).ok, true);
        assert.equal(unit.assist, "brigand");

        const events = run(host, 20000);

        assert.ok(events.some(({ type, by, id }) => type === "hit" && by === follower && id === "brigand"), "(it went after it)");
        assert.ok(host.battle.actor("brigand").dead);
        assert.equal(unit.assist, null, "(and once it's down, back to following)");
    });

    it("counts what a creature at the player's side brings down for the player: what's on it theirs", () => {
        const { host, me } = atTheGuild();

        cast(host, "summon");

        const [called] = [...host.companions.keys()];
        const unit = host.battle.actor(called);
        const taken = new Set();

        Object.assign(unit, { hp: 5000, maxHp: 5000, power: { ...unit.power, melee: 50, ranged: 50 } });
        put(unit, me.map, near(host, 2, 0, taken));
        host.battle.add({ id: "brigand", kind: "orc", name: "Brigand", weapon: "cleaver", team: "wild", square: near(host, 4, 0, taken), map: me.map, ai: null });
        Object.assign(host.battle.actor("brigand"), { hp: 5, maxHp: 5 });

        const gold = host.players.get(HOST_PLAYER).progress.gold;
        const events = run(host, 20000);

        assert.ok(events.some(({ type, id, by }) => type === "death" && id === "brigand" && by === called), JSON.stringify(events.filter(({ type }) => type === "death")));
        assert.ok(events.some(({ type, id, from }) => type === "loot" && id === HOST_PLAYER && from === "brigand"));
        assert.ok(host.players.get(HOST_PLAYER).progress.gold > gold);
    });
});
