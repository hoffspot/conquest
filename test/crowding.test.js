// A crowd's followers (core/host.js RULES `followers`, CROWDING; the scaling plan's 2-17): in a
// world shared by strangers, with more than six players together no one takes on more than one
// hired adventurer or calls more than one creature (those already with them stay); and no one's
// followers come into a town's buildings: they wait outside, out of sight. A world's own setting
// relaxes it (server/reopen.js relaxedFor)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CROWDING, HOST_PLAYER, Host, presetRules, REFUSALS, RULE_CHOICES, RULES } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SPELLS } from "../client/js/core/spells.js";
import { relaxedFor, rulesFor } from "../server/reopen.js";
import { WORLD_SETTINGS } from "../server/storage/worlds.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world with its player by their home guild's door, gold in hand, a grimoire and Summon known,
// and `others` more players standing with them
function world(rules, others = 0, followers = []) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false, ...(rules ? { rules } : {}) });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 5000, spells: ["summon"], gear: { mainHand: { id: "grimoire", quality: "common" } } }, followers });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");
    const me = host.battle.actor(HOST_PLAYER);

    // (As many as they like to lead, but for a crowd: not held to a new character's one)
    host.mostFollowers = () => 5;

    const gather = () => {
        for (let k = 1; k <= others; k++) {
            if (!host.players.has(`p${k}`)) {
                host.join({ id: `p${k}`, hero: { ...HERO, name: `Guest ${k}` } });
            }

            put(host.battle.actor(`p${k}`), me.map, [me.square[0] + k, me.square[1]]);
            host.battle.actor(`p${k}`).stunnedUntil = Infinity;
        }
    };

    gather();

    return { host, guild, me, gather };
}

// Into the guild (or out of it again), by its door, walked to: what happened on the way
function through({ host, guild }) {
    const events = [];

    assert.equal(host.command(HOST_PLAYER, { type: "enter", link: guild.door.id }).ok, true);

    for (let s = 0; s < 240 && !events.some(({ type, id }) => type === "cross" && id === HOST_PLAYER); s++) {
        events.push(...run(host, 500));
    }

    assert.ok(events.some(({ type, id }) => type === "cross" && id === HOST_PLAYER), "through the door");

    return events;
}

// One of the guild's adventurers asked to follow: the command's result
function hire(host, guild, k = 0) {
    const one = guild.folk.filter(({ role, talk }) => role === "adventurer" || talk === "adventurer")[k];
    const npc = host.battle.actor(one.id);
    const me = host.battle.actor(HOST_PLAYER);

    put(me, npc.map, [npc.square[0], npc.square[1] + 2]);
    assert.equal(host.command(HOST_PLAYER, { type: "talk", with: one.id }).ok, true);

    const result = host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } });

    host.command(HOST_PLAYER, { type: "talk", with: null });

    return result;
}

function summon(host) {
    Object.assign(host.battle.actor(HOST_PLAYER), { spellReadyAt: 0, spellsReadyAt: {} });
    assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "summon" }), { ok: true });

    return run(host, SPELLS.summon.castTime + STEP_MS * 2).filter(({ type }) => type === "companion");
}

const called = (host) => [...host.companions].filter(([, one]) => one.leader === HOST_PLAYER).length;

describe("a crowd's followers (host.js RULES followers, CROWDING)", () => {
    it("is every follower unless a world says, one hired and one called past six together in a world shared by strangers, and a world's own setting relaxes it", () => {
        assert.equal(RULES.followers, "free");
        assert.deepEqual(RULE_CHOICES.followers, { of: ["free", "limited"], shared: "limited", slice: "2-17", built: true });
        assert.deepEqual(CROWDING, { players: 6, reach: 80, hired: 1, called: 1 });
        assert.equal(presetRules("shared").followers, "limited");
        assert.equal(presetRules("company").followers, "free");
        assert.ok(REFUSALS.crowded.includes("more than six"));

        assert.deepEqual(WORLD_SETTINGS.freeFollowers.default, false);
        assert.deepEqual(relaxedFor({ settings: {} }), {});
        assert.deepEqual(relaxedFor({ settings: { freeFollowers: true } }), { followers: "free" });
        assert.equal(rulesFor({ settings: { preset: "shared" } }).followers, "limited");
        assert.equal(rulesFor({ settings: { preset: "shared", freeFollowers: true } }).followers, "free");
        assert.equal(rulesFor({ settings: { preset: "company", freeFollowers: true } }).followers, "free");

        const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules: { followers: "limited" } });

        host.preset("shared", { rules: relaxedFor({ settings: { freeFollowers: true } }) });
        assert.equal(host.rules.followers, "free", "(a kept world, as it's opened)");
        host.preset("shared");
        assert.equal(host.rules.followers, "limited");
    });

    it("in a crowd, by the rule: a first hired adventurer taken on, none past the one they have; out of a crowd, or by no such rule, as many as they can lead", () => {
        const HIRED = [{ name: "Hireling", calling: "warrior", sex: "m", seed: 1, level: 1 }];
        const alone = world({ followers: "limited" }, 6);

        // (Into the guild, its folk there; the others with them by it still)
        through(alone);
        alone.gather();
        assert.equal(hire(alone.host, alone.guild).ok, true, "with none: the first, crowd or no");

        // (With one already, come into the world with them: no more in a crowd)
        const crowd = world({ followers: "limited" }, 6, HIRED);

        through(crowd);
        crowd.gather();
        assert.deepEqual(hire(crowd.host, crowd.guild), { ok: false, reason: "crowded" });
        assert.equal(crowd.host.partyOf(HOST_PLAYER).length, 1, "the one they had, with them still");

        // (Six together, one too few for a crowd; and seven with no such rule)
        for (const few of [world({ followers: "limited" }, 5, HIRED), world(undefined, 6, HIRED)]) {
            through(few);
            few.gather();
            assert.equal(hire(few.host, few.guild).ok, true);
        }
    });

    it("in a crowd, by the rule: a first creature called, no second while it's there, the caster told; out of a crowd the first goes to make room, as ever", () => {
        const crowd = world({ followers: "limited" }, 6);

        assert.deepEqual(summon(crowd.host).map(({ change }) => change), ["called"]);
        assert.equal(called(crowd.host), 1);

        const [first] = [...crowd.host.companions.keys()];
        const told = summon(crowd.host);

        assert.deepEqual(told.map(({ id, change }) => [id, change]), [[HOST_PLAYER, "crowded"]]);
        assert.deepEqual([...crowd.host.companions.keys()], [first], "the one they had, with them still");

        const few = world({ followers: "limited" }, 5);

        summon(few.host);
        assert.deepEqual(summon(few.host).map(({ change }) => change).sort(), ["called", "replaced"]);
    });

    it("by the rule, no one's followers come into a town's buildings: they wait outside out of sight, told of, and are in sight again as their leader comes out; by no such rule, in with them", () => {
        const limited = world({ followers: "limited" });

        summon(limited.host);

        const [companion] = [...limited.host.companions.keys()];
        const beast = limited.host.battle.actor(companion);
        const went = through(limited);

        assert.notEqual(limited.me.map, "town", "inside");
        assert.deepEqual(went.filter(({ type, change }) => type === "companion" && change === "outside").map(({ id, count }) => [id, count]), [[HOST_PLAYER, 1]]);
        assert.equal(beast.map, "town", "left outside");
        assert.equal(beast.hidden, true, "out of sight, and in no one's way");

        run(limited.host, 3000);
        assert.equal(beast.map, "town");
        assert.equal(beast.hidden, true);

        through(limited);
        assert.equal(limited.me.map, "town", "out again");
        assert.equal(beast.hidden, undefined, "in sight again");

        const free = world(undefined);

        summon(free.host);

        const other = free.host.battle.actor([...free.host.companions.keys()][0]);

        through(free);
        assert.equal(other.map, free.me.map, "in with them");
        assert.notEqual(other.hidden, true);
    });
});
