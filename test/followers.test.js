// Followers (client/js/core/host.js, core/battle.js; docs/WAR.md M9): an adventurer at a guild
// hired for gold, as many as a player's Command lets them lead; following them, through doors
// too, fighting their enemies near them (what they bring down counting for their leader, whose
// Command grows by it); told to wait, to follow, or to go; one who falls, gone; and all of it kept
// with the character, and with the world
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FOLLOW, STEP_MS } from "../client/js/core/battle.js";
import { HIRES, HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { nearestFree, squareKey, squaresOf } from "../client/js/core/grid.js";
import { decode, encode } from "../client/js/core/wire.js";
import { distanceBetween } from "../client/js/core/weapons.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null, target: null });

// A world with its player in it, before the home guild's adventurers, gold in hand
function atTheGuild({ gold = 200 } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold } });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

    host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
    host.command(HOST_PLAYER, { type: "stop" });
    run(host, 1000);

    return { host, guild, player: host.players.get(HOST_PLAYER), me: host.battle.actor(HOST_PLAYER) };
}

// Hire one of the guild's adventurers (by their place in its folk). Returns what the host said
function hire(host, guild, k = 0) {
    const one = guild.folk.filter(({ role, talk }) => role === "adventurer" || talk === "adventurer")[k];
    const npc = host.battle.actor(one.id);
    const me = host.battle.actor(HOST_PLAYER);

    host.command(HOST_PLAYER, { type: "talk", with: null });
    put(me, npc.map, [npc.square[0], npc.square[1] + 2]);
    assert.equal(host.command(HOST_PLAYER, { type: "talk", with: one.id }).ok, true);

    return { one, result: host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } }) };
}

describe("followers (host.js, battle.js)", () => {
    it("hires an adventurer at the guild for their price, as many as the player can lead", () => {
        const { host, guild, player } = atTheGuild();
        const { one, result } = hire(host, guild);
        const follower = host.battle.actor(result.follower);

        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.price, HIRES[one.look].price);
        assert.equal(player.progress.gold, 200 - result.price);
        assert.deepEqual({ kind: follower.kind, team: follower.team, ai: follower.ai, leader: follower.leader, name: follower.name }, { kind: "follower", team: "human", ai: "follow", leader: HOST_PLAYER, name: one.name });
        assert.equal(follower.weapon, HIRES[one.look].weapon);
        assert.ok(!host.battle.actor(one.id) && !host.folk.has(one.id), "(no longer among the folk)");
        assert.equal(host.mostFollowers(HOST_PLAYER), 1);

        // (No more than they can lead)
        assert.equal(hire(host, guild, 1).result.reason, "company");

        // (Nor for those who aren't for hire, nor without the gold)
        const receptionist = guild.folk.find(({ role }) => role === "receptionist");
        const me = host.battle.actor(HOST_PLAYER);
        const npc = host.battle.actor(receptionist.id);

        put(me, npc.map, [npc.square[0], npc.square[1] + 2]);
        host.command(HOST_PLAYER, { type: "talk", with: receptionist.id });
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } }).reason, "hire");

        const poor = atTheGuild({ gold: 5 });

        assert.equal(hire(poor.host, poor.guild).result.reason, "gold");
    });

    it("follows them, through doors too, and fights their enemies near them: what they bring down counts for their leader", () => {
        const { host, guild, player, me } = atTheGuild();
        const { result } = hire(host, guild);
        const follower = host.battle.actor(result.follower);

        host.command(HOST_PLAYER, { type: "talk", with: null });

        // Out of the guild: the follower along with them
        host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });

        for (let t = 0; t < 30000 && me.map !== "town"; t += 1000) {
            run(host, 1000);
        }

        assert.equal(me.map, "town");
        assert.equal(follower.map, "town", "(brought along)");

        // Off a way (on open ground): they keep up, within a few steps
        put(me, "town", nearestFree(squaresOf(host.world.maps.town), [me.square[0] + 8, me.square[1] + 8], { within: 24 }));
        run(host, 12000);
        assert.ok(distanceBetween(follower.square, me.square) <= FOLLOW.near + 1, `${follower.square} by ${me.square}`);

        // An enemy by them: the follower brings it down, and the player's the richer and more commanding for it
        const open = squaresOf(host.world.maps.town);
        const taken = new Set([squareKey(...me.square)]);
        const spot = ([x, y]) => {
            const square = nearestFree(open, [x, y], { within: 24, taken });

            taken.add(squareKey(...square));

            return square;
        };

        // (Beyond the player's own reach, by the follower, within a few steps of the player)
        const near = ([x, y]) => {
            try {
                return nearestFree(open, [x, y], { within: 2, taken });
            } catch {
                return null;
            }
        };
        const lair = [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 3], [-4, -3], [3, -4], [-3, 4]]
            .map(([dx, dy]) => near([me.square[0] + dx, me.square[1] + dy]))
            .find((square) => square && distanceBetween(square, me.square) >= 4 && distanceBetween(square, me.square) <= 7);

        taken.add(squareKey(...lair));

        put(follower, me.map, spot([lair[0] - 1, lair[1]]));
        host.battle.add({ id: "brigand", kind: "orc", name: "Brigand", weapon: "cleaver", team: "wild", square: lair, map: me.map, ai: null });
        Object.assign(host.battle.actor("brigand"), { hp: 6 });
        Object.assign(follower, { hp: 5000, maxHp: 5000 });

        const [gold, command] = [player.progress.gold, player.progress.skills.command ?? 0];
        const events = run(host, 20000);

        assert.ok(events.some(({ type, by }) => type === "hit" && by === follower.id), "(it fought)");
        assert.ok(events.some(({ type, id, by }) => type === "death" && id === "brigand" && by === follower.id), "(and brought it down)");
        assert.ok(player.progress.gold >= gold);
        assert.ok((player.progress.skills.command ?? 0) > command, "(their Command grows)");
    });

    it("waits when told, follows again, and goes their own way", () => {
        const { host, guild, me } = atTheGuild();
        const { result } = hire(host, guild);
        const follower = host.battle.actor(result.follower);
        const talkTo = () => {
            host.command(HOST_PLAYER, { type: "talk", with: null });
            put(me, follower.map, [follower.square[0], follower.square[1] + 2]);
            assert.equal(host.command(HOST_PLAYER, { type: "talk", with: follower.id }).ok, true);
        };

        talkTo();
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { follower: "wait" } }).ok, true);
        assert.equal(follower.ai, "patrol");
        assert.equal(host.followers.get(follower.id).waiting, true);

        talkTo();
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { follower: "follow" } }).ok, true);
        assert.equal(follower.ai, "follow");

        talkTo();

        const events = [];

        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { follower: "dismiss" } }).ok, true);
        events.push(...run(host, 500));
        assert.ok(!host.battle.actor(follower.id) && !host.followers.has(follower.id));
    });

    it("loses a follower who falls", () => {
        const { host, guild, me } = atTheGuild();
        const { result } = hire(host, guild);
        const follower = host.battle.actor(result.follower);

        host.command(HOST_PLAYER, { type: "talk", with: null });
        host.battle.add({ id: "brigand", kind: "orc", name: "Brigand", weapon: "cleaver", team: "wild", square: [follower.square[0] + 1, follower.square[1]], map: follower.map, ai: null });
        Object.assign(host.battle.actor("brigand"), { hp: 5000, maxHp: 5000 });
        follower.hp = 1;
        put(me, follower.map, [follower.square[0], follower.square[1] + 6]);

        const events = run(host, 20000);

        assert.ok(events.some(({ type, change, follower: id }) => type === "follower" && change === "fallen" && id === follower.id));
        assert.ok(!host.followers.has(follower.id));
    });

    it("keeps its followers with the character, and with the world", () => {
        const { host, guild } = atTheGuild();
        const { one, result } = hire(host, guild);

        host.command(HOST_PLAYER, { type: "talk", with: null });
        run(host, 2000);

        const character = host.characterOf(host.players.get(HOST_PLAYER));

        assert.deepEqual(character.followers, [{ name: one.name, calling: one.look, sex: one.sex, seed: one.seed, people: one.people ?? "human" }]);

        // Carried on exactly
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.followers.keys()], [result.follower]);
        assert.ok(again.hired.has(one.id));
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 3000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }

        // The character in another world: their followers with them
        const elsewhere = new Host(buildWorld({ seed: 5 }), { populate: false });

        elsewhere.join({ id: HOST_PLAYER, hero: HERO, followers: character.followers });

        const [joined] = [...elsewhere.followers.values()];

        assert.equal(joined.name, one.name);
        assert.equal(elsewhere.battle.actor([...elsewhere.followers.keys()][0]).leader, HOST_PLAYER);
    });
});
