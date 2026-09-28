// Growing stronger in play (client/js/core/host.js with core/progress.js and the battle): skills
// growing from what the players do, loot on the fallen, buying and selling with the folk who keep
// shops, gear and what it does in a fight, abilities once learnt, what's paid for by talking,
// boons, and the war coming on with the players' might
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { BOUGHT, GROUND_MS, HOST_PLAYER, Host, UNDO_MS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { PACK_SIZE, priceOf, RANKS } from "../client/js/core/progress.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null, target: null });

describe("growing stronger in play (host.js, progress.js)", () => {
    let seed2;

    before(() => {
        seed2 = buildWorld({ seed: 2 });
    });

    // A world with its player in it (as kept: `progress`), the world's own people, and no soldiers
    const hosted = (progress = {}) => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, progress });
        host.populate();

        return host;
    };

    // The player next to the home tavern's barkeep, talking to them
    const atTheBar = (host) => {
        const barkeep = host.battle.actor(host.world.folk.find(({ role }) => role === "barkeep").id);
        const player = host.battle.actor(HOST_PLAYER);

        put(player, barkeep.map, [barkeep.square[0], barkeep.square[1] + 1]);

        return barkeep;
    };

    it("sells the creatures' parts only to the adventurers' guild, for what they're worth", () => {
        const host = hosted({ gold: 0 });
        const barkeep = atTheBar(host);
        const { progress } = host.players.get(HOST_PLAYER);

        progress.stow({ id: "wolfPelt" }, 2);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "sell", index: 0, to: barkeep.id }), { ok: false, reason: "wanted" });
        assert.equal(progress.pack[0].count, 2, "kept");

        // (What the guild pays: all it's worth, not the share a shop gives for its own wares)
        assert.equal(priceOf({ id: "wolfPelt" }, { selling: true }), 7);
        assert.equal(priceOf({ id: "sword" }, { selling: true }), 12);
    });

    it("grows the blade and endurance by fighting the orc, and finds what's on it when it falls", () => {
        const host = hosted();
        const player = host.battle.actor(HOST_PLAYER);
        const orc = host.battle.actor("orc");
        const { progress } = host.players.get(HOST_PLAYER);

        Object.assign(player, { hp: 5000, maxHp: 5000 });
        put(orc, "town", [player.square[0] + 1, player.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: "orc" });

        const events = run(host, 60000);
        const loot = events.find(({ type }) => type === "loot");

        assert.ok(events.some(({ type, id }) => type === "death" && id === "orc"));
        assert.ok(progress.skills.blade >= 50, "(as much as it dealt)");
        assert.ok(progress.skills.endurance > 0, "(and as much as it took)");
        assert.ok(events.some(({ type, tree }) => type === "rank" && tree === "endurance") || progress.rank("endurance") === 0);
        assert.equal(loot?.id, HOST_PLAYER);
        assert.equal(progress.gold, 20 + loot.gold);
        assert.deepEqual(progress.pack.filter(Boolean).map(({ id, quality }) => ({ id, quality })), loot.items);
    });

    it("makes the player stronger as they rank up: blows, hit points, armour, and the weapon and gear they carry", () => {
        const host = hosted({ skills: { blade: 800, endurance: 2000 }, gear: { weapon: { id: "hammer", quality: "masterwork" }, body: { id: "mail", quality: "common" }, shield: null } });
        const player = host.battle.actor(HOST_PLAYER);

        assert.equal(player.weapon, "hammer", "(the weapon they carry, not the one they started with)");
        assert.ok(Math.abs(player.power.melee - 1.3 * 1.3) < 1e-9);
        assert.equal(player.maxHp, 50 + 10 + 30);
        assert.equal(player.maxStamina, 50 + 30);
        assert.ok(Math.abs(player.armor - (0.16 + 0.08)) < 1e-9);
        assert.equal(host.players.get(HOST_PLAYER).hero.weapon, "hammer");
        assert.equal(host.war.might, 3 + 1 + 1, "(the war as mighty as the mightiest player)");

        // Ranking up further: told of, and stronger straight away
        const events = [];
        const { progress } = host.players.get(HOST_PLAYER);

        progress.skills.blade = RANKS[4].xp - 1;
        host.command(HOST_PLAYER, { type: "stop" });
        player.hp = player.maxHp;

        const orc = host.battle.actor("orc");

        put(orc, "town", [player.square[0] + 1, player.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: "orc" });

        for (let t = 0; t < 20000 && progress.rank("blade") < 4; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        assert.deepEqual(events.filter(({ type }) => type === "rank").map(({ tree, rank, title }) => [tree, rank, title]), [["blade", 4, "Master"]]);
        assert.ok(Math.abs(player.power.melee - 1.45 * 1.3) < 1e-9);
        assert.equal(player.maxHp, 50 + 15 + 30);
    });

    it("buys from, and sells to, the folk who keep shops, near them, as far as the gold goes", () => {
        const host = hosted({ gold: 30 });
        const barkeep = atTheBar(host);
        const { progress } = host.players.get(HOST_PLAYER);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", item: { id: "meal" }, from: barkeep.id }), { ok: true });
        assert.equal(progress.gold, 30 - priceOf({ id: "meal" }));
        assert.deepEqual(progress.pack[0], { id: "meal", quality: "common", count: 1 });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", item: { id: "sword" }, from: barkeep.id }), { ok: false, reason: "shop" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", item: { id: "meal" }, from: "orc" }), { ok: false, reason: "far" });

        progress.gold = 1;
        assert.deepEqual(host.command(HOST_PLAYER, { type: "buy", item: { id: "meal" }, from: barkeep.id }), { ok: false, reason: "gold" });

        assert.deepEqual(host.command(HOST_PLAYER, { type: "sell", index: 0, to: barkeep.id }), { ok: true });
        assert.equal(progress.gold, 1 + priceOf({ id: "meal" }, { selling: true }));
        assert.equal(progress.pack[0], null);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "sell", index: 0, to: barkeep.id }), { ok: false, reason: "item" });

        // (Some of a stack sold at once)
        progress.stow({ id: "ale" }, 5);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "sell", index: 0, to: barkeep.id, count: 6 }), { ok: false, reason: "count" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "sell", index: 0, to: barkeep.id, count: 3 }), { ok: true });
        assert.equal(progress.count("ale"), 2);
        assert.ok(progress.skills.trade > 0, "(trading's a skill too)");

        const told = run(host, STEP_MS).filter(({ type }) => type === "bought" || type === "sold").map(({ type }) => type);

        assert.deepEqual(told, ["bought", "sold", "sold"]);
    });

    it("puts on gear from the pack, and uses what's for using", () => {
        const host = hosted({ pack: [{ id: "mail" }, { id: "bow", quality: "fine" }, { id: "potion" }, { id: "kiteShield" }] });
        const player = host.battle.actor(HOST_PLAYER);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: 0 }), { ok: true });
        assert.ok(Math.abs(player.armor - 0.16) < 1e-9);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: 3 }), { ok: true }, "(the kite shield, with the sword)");
        assert.ok(Math.abs(player.armor - 0.26) < 1e-9);

        // A bow: the shield put away, and the player a bowman now
        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: 1 }), { ok: true });
        assert.equal(player.weapon, "bow");
        assert.ok(player.arms.some(({ kind }) => kind === "ranged"));
        assert.ok(Math.abs(player.power.ranged - 1.15) < 1e-9);
        assert.ok(Math.abs(player.armor - 0.16) < 1e-9);

        const shield = host.players.get(HOST_PLAYER).progress.slotOf("kiteShield");

        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: shield }), { ok: false, reason: "shield" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "unequip", slot: "body" }), { ok: true });
        assert.equal(player.armor, 0);

        player.hp = 10;

        const potion = host.players.get(HOST_PLAYER).progress.slotOf("potion");

        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", index: potion }), { ok: true });
        assert.equal(player.hp, 35);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", index: potion }), { ok: false, reason: "item" });

        // (From a wheel: the first of a kind, by its id; none left, none used)
        host.players.get(HOST_PLAYER).progress.stow({ id: "meal" });
        assert.equal(host.players.get(HOST_PLAYER).progress.count("meal"), 1);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", item: "meal" }), { ok: true });
        assert.equal(player.hp, 50);
        assert.equal(host.players.get(HOST_PLAYER).progress.count("meal"), 0);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", item: "meal" }), { ok: false, reason: "item" });

        const gear = run(host, STEP_MS).filter(({ type }) => type === "gear");

        assert.equal(gear.length, 4);
        assert.deepEqual(gear.at(-1).worn, []);
        assert.equal(gear.at(-1).weapon, "bow");
    });

    it("lets a player use the abilities they've learnt, and not before", () => {
        const host = hosted({ skills: { blade: 300 }, schools: { healing: 99 } });
        const player = host.battle.actor(HOST_PLAYER);

        put(host.battle.actor("orc"), "town", [player.square[0] + 1, player.square[1]]);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "hold" }), { ok: false, reason: "unknown" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "mendWounds" }), { ok: false, reason: "unknown" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "aimedShot" }), { ok: false, reason: "unknown" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "powerStrike", target: "orc" }), { ok: true });
        assert.deepEqual(player.empowered, { blow: "melee", factor: 2 });
        assert.equal(player.order.target, "orc");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "powerStrike" }), { ok: false, reason: "cooldown" });

        // The strike lands twice as hard, once
        const events = run(host, 5000);
        const first = events.find(({ type, by }) => type === "hit" && by === HOST_PLAYER);

        assert.ok(first.damage >= 2 * 3, `(${first.damage})`);
        assert.equal(player.empowered, null);

        // Healing grown to its second tier: Mend Wounds
        host.players.get(HOST_PLAYER).progress.growSchool("healing", 300);
        player.hp = 10;
        run(host, 3000);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "mendWounds" }), { ok: true });
    });

    it("pays for what's bought by talking, and does it: ale fills stamina, a blessing's a boon for a while", () => {
        const host = hosted({ gold: 12 });
        const barkeep = atTheBar(host);
        const player = host.battle.actor(HOST_PLAYER);
        const { progress } = host.players.get(HOST_PLAYER);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { buy: "ale", price: 2 } }), { ok: false, reason: "talking" });
        host.command(HOST_PLAYER, { type: "talk", with: barkeep.id });
        player.stamina = 3;
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { buy: "ale", price: 2 } }), { ok: true });
        assert.equal(progress.gold, 10);
        assert.equal(player.stamina, player.maxStamina);

        // A drink for someone else: paid for, not drunk
        player.stamina = 3;
        host.command(HOST_PLAYER, { type: "effect", effect: { buy: "ale", price: 2, for: "them" } });
        assert.equal(player.stamina, 3);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { buy: "blessing", price: 5 } }), { ok: true });
        assert.ok(Math.abs(player.power.melee - 1.05) < 1e-9 && Math.abs(player.armor - 0.03) < 1e-9);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "effect", effect: { rent: "room", price: 10 } }), { ok: false, reason: "gold" });
        assert.equal(progress.gold, 12 - 2 - 2 - 5);

        // The blessing wears off
        run(host, BOUGHT.blessing.boon.ms + STEP_MS);
        assert.equal(player.power.melee, 1);
        assert.ok(progress.skills.talk > 0 && progress.skills.trade > 0);
    });

    it("moves stacks about the pack, splits them, and throws them away, to be taken back a moment after", () => {
        const host = hosted({ pack: [{ id: "potion", count: 5 }, { id: "ale", count: 2 }] });
        const { progress } = host.players.get(HOST_PLAYER);
        const command = (what) => host.command(HOST_PLAYER, what);

        // Split, and put back together
        assert.deepEqual(command({ type: "split", index: 0, count: 2 }), { ok: true });
        assert.deepEqual(progress.pack.slice(0, 3).map((stack) => stack?.count), [3, 2, 2]);
        assert.deepEqual(command({ type: "split", index: 0, count: 1, to: 7 }), { ok: true });
        assert.equal(progress.pack[7].count, 1);
        assert.deepEqual(command({ type: "split", index: 0, count: 2 }), { ok: false, reason: "count" });
        assert.deepEqual(command({ type: "arrange", from: 7, to: 2 }), { ok: true });
        assert.deepEqual(command({ type: "arrange", from: 2, to: 0 }), { ok: true });
        assert.equal(progress.pack[0].count, 5);
        assert.deepEqual(command({ type: "arrange", from: 0, to: 1 }), { ok: true }, "swapped with the ale");
        assert.deepEqual([progress.pack[0].id, progress.pack[1].id], ["ale", "potion"]);
        assert.deepEqual(command({ type: "arrange", from: 9, to: 1 }), { ok: false, reason: "item" });

        // Thrown away, and taken back; too late, gone for good
        assert.deepEqual(command({ type: "discard", index: 1 }), { ok: true, item: { id: "potion", quality: "common", count: 5 } });
        assert.equal(progress.count("potion"), 0);
        assert.deepEqual(command({ type: "undiscard" }), { ok: true });
        assert.deepEqual(progress.pack[1], { id: "potion", quality: "common", count: 5 });
        assert.deepEqual(command({ type: "undiscard" }), { ok: false, reason: "undo" });
        assert.deepEqual(command({ type: "discard", index: 0 }), { ok: true, item: { id: "ale", quality: "common", count: 2 } });
        run(host, UNDO_MS + STEP_MS);
        assert.deepEqual(command({ type: "undiscard" }), { ok: false, reason: "undo" });
        assert.equal(progress.count("ale"), 0);
        assert.deepEqual(command({ type: "discard", index: 0 }), { ok: false, reason: "item" });
        assert.equal(progress.pack.length, PACK_SIZE);
    });

    it("drops things on the ground where the player stands, for anyone near to pick up, for a while", () => {
        const host = hosted({ pack: [{ id: "potion", count: 5 }, { id: "sword", quality: "fine", count: 1 }] });
        const { progress } = host.players.get(HOST_PLAYER);
        const player = host.battle.actor(HOST_PLAYER);
        const command = (what) => host.command(HOST_PLAYER, what);

        // Two draughts dropped, and the fine sword
        const dropped = command({ type: "drop", index: 0, count: 2 });

        assert.equal(dropped.ok, true);
        assert.equal(progress.count("potion"), 3);
        assert.deepEqual(host.ground.get(dropped.ground), { id: dropped.ground, item: { id: "potion", quality: "common", count: 2 }, map: player.map, square: [...player.square], until: host.battle.time + GROUND_MS, by: HOST_PLAYER });
        assert.deepEqual(command({ type: "drop", index: 0, count: 9 }), { ok: false, reason: "count" });

        const sword = command({ type: "drop", index: 1 }).ground;

        assert.equal(progress.count("sword"), 0);
        assert.ok(run(host, STEP_MS).some(({ type, ground }) => type === "dropped" && ground === sword));

        // Picked up from near it (onto the draughts left), not from afar; once
        assert.deepEqual(command({ type: "pickUp", ground: dropped.ground }), { ok: true });
        assert.equal(progress.count("potion"), 5);
        assert.equal(progress.pack[0].count, 5);
        assert.deepEqual(command({ type: "pickUp", ground: dropped.ground }), { ok: false, reason: "gone" });
        put(player, player.map, [player.square[0] + 4, player.square[1]]);
        assert.deepEqual(command({ type: "pickUp", ground: sword }), { ok: false, reason: "far" });

        // Kept with the world; left a while, gone
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.ground.values()], [...host.ground.values()]);
        assert.equal(again.checksum(), host.checksum());
        run(host, GROUND_MS);
        assert.equal(host.ground.size, 0);
        assert.notEqual(again.checksum(), host.checksum());
    });

    it("keeps each player's progress, boons and abilities' readiness with the world, and carries on from it", () => {
        const host = hosted({ skills: { blade: 350 }, gold: 44, pack: [{ id: "potion" }] });

        atTheBar(host);
        host.command(HOST_PLAYER, { type: "ability", ability: "powerStrike" });
        run(host, 1000);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.players.get(HOST_PLAYER).progress.toJSON(), host.players.get(HOST_PLAYER).progress.toJSON());
        assert.deepEqual(again.players.get(HOST_PLAYER).readyAt, host.players.get(HOST_PLAYER).readyAt);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));
        assert.deepEqual(host.characterOf(host.players.get(HOST_PLAYER)).progress.gold, 44);
        assert.ok(seed2.plan);
    });
});
