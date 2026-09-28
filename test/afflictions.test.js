// What lingers after some creatures' blows (client/js/core/afflictions.js, core/battle.js,
// core/host.js; docs/WILDS.md): poison, disease, wither, burning, bleeding and being slowed, each
// hurting now and then or hindering till it wears off; brought on by the blows the creatures'
// weapons say, sometimes; ended at once by the cures the adventurers' guild sells; kept with the
// world.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AFFLICTIONS, CURES, shareOf } from "../client/js/core/afflictions.js";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { ITEMS, SHOPS, wares } from "../client/js/core/progress.js";
import { SPELLS } from "../client/js/core/spells.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { decode, encode } from "../client/js/core/wire.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// An open field: a player alone in it (and whatever else is put there)
function field() {
    const world = { blocked: parseGrid(Array.from({ length: 30 }, () => ".".repeat(30))).map((row) => Uint8Array.from(row)) };
    const battle = new Battle(world, { seed: 3 });

    battle.add({ id: "p", kind: "player", team: "player", square: [5, 5] });

    return { battle, player: battle.actor("p") };
}

describe("what lingers after some blows (afflictions.js)", () => {
    it("names each, with a cure for each sold at the adventurers' guild (but Fear's: a spell's, ended by a spell)", () => {
        const creatures = Object.entries(AFFLICTIONS).filter(([kind]) => kind !== "fear");

        assert.equal(AFFLICTIONS.fear.cure, undefined);
        assert.ok(AFFLICTIONS.fear.flee && SPELLS.embolden.cures.includes("fear") && SPELLS.fear.flee);

        for (const [kind, { label, about, ms, every, damage, cure }] of creatures) {
            assert.ok(label && about && ms > 0, kind);
            assert.ok(every === undefined || (every > 0 && damage > 0 && every <= ms), `${kind}: hurts now and then, or not at all`);
            assert.equal(CURES[cure]?.cure, kind, `${kind}: its cure`);
            assert.deepEqual(ITEMS[cure].use, { cure: kind });
            assert.ok(SHOPS.guild.items.includes(cure), `${kind}: its cure at the guild`);
            assert.ok(wares("guild").some(({ id }) => id === cure));
        }

        assert.deepEqual(Object.keys(CURES).sort(), creatures.map(([, { cure }]) => cure).sort(), "a cure for each, and only those");
        assert.equal(ITEMS.antidote.label, "Cure poison draught");
        assert.equal(ITEMS.cureDisease.label, "Cure disease draught");
        assert.equal(ITEMS.invigorate.label, "Invigorating draught");

        // (The creatures' blows that leave something: each a kind there is, and a chance)
        const afflicting = Object.values(NATURAL).flatMap(({ attacks }) => attacks.flatMap((attack) => attack.either ?? [attack])).filter(({ afflict }) => afflict);

        assert.ok(afflicting.length >= 20);
        assert.ok(afflicting.every(({ afflict }) => AFFLICTIONS[afflict.kind] && afflict.chance > 0 && afflict.chance <= 1));
        assert.deepEqual(new Set(afflicting.map(({ afflict }) => afflict.kind)), new Set(creatures.map(([kind]) => kind)), "every kind brought on by something");
    });

    it("hurts now and then till it wears off, as strong as whoever did it", () => {
        const { battle, player } = field();

        assert.equal(battle.afflict("p", "poison", { by: "x", power: 2 }), true);

        const events = run(battle, AFFLICTIONS.poison.ms + 200);
        const ails = events.filter(({ type }) => type === "ail");

        assert.equal(ails.length, AFFLICTIONS.poison.ms / AFFLICTIONS.poison.every);
        assert.ok(ails.every(({ id, kind, damage, by }) => id === "p" && kind === "poison" && damage === 2 && by === "x"));
        assert.equal(player.hp, player.maxHp - 2 * ails.length);
        assert.deepEqual(events.filter(({ type }) => type === "afflicted").map(({ change }) => change), ["on", "over"]);
        assert.deepEqual(player.afflictions, []);

        // Again while it's on: it lasts from then, as strong as the stronger
        battle.afflict("p", "bleed", { power: 3 });
        run(battle, 3000);
        battle.afflict("p", "bleed", { power: 1 });
        assert.equal(player.afflictions.length, 1);
        assert.equal(player.afflictions[0].damage, 3);
        assert.equal(player.afflictions[0].until, battle.time + AFFLICTIONS.bleed.ms);

        // (Nothing on the dead, or of a kind there isn't)
        assert.equal(battle.afflict("p", "nothing"), false);
    });

    it("brings down whoever it's the last of, as the one who did it", () => {
        const { battle, player } = field();

        battle.add({ id: "spider", kind: "beast", team: "wild", square: [20, 20] });
        player.hp = 1;
        battle.afflict("p", "poison", { by: "spider" });

        const death = run(battle, 2000).find(({ type }) => type === "death");

        assert.deepEqual([death.id, death.by], ["p", "spider"]);
        assert.deepEqual(player.afflictions, [], "gone with them");
    });

    it("slows, weakens healing, and slows the breath coming back, while it lasts", () => {
        const walk = (slowed) => {
            const { battle, player } = field();

            if (slowed) {
                battle.afflict("p", "slow", { look: "web" });
            }

            battle.command("p", { type: "move", to: [25, 5] });
            run(battle, 2000);

            return player.x;
        };

        const [free, webbed] = [walk(false) - 5.5, walk(true) - 5.5];

        assert.ok(Math.abs(webbed / free - AFFLICTIONS.slow.speed) < 0.1, `${webbed} of ${free}`);

        const { battle, player } = field();

        player.hp = 10;
        battle.afflict("p", "wither");
        assert.equal(shareOf(player, "healing"), AFFLICTIONS.wither.healing);
        battle.mend("p", { hp: 20 });
        assert.equal(player.hp, 20, "half the healing");

        battle.afflict("p", "disease");
        player.stamina = 0;
        run(battle, 1000);
        assert.ok(Math.abs(player.stamina - AFFLICTIONS.disease.recovery) < 0.02, `${player.stamina}`);
    });

    it("comes of the creatures' blows as their weapons say", () => {
        const { battle, player } = field();

        player.hp = player.maxHp = 5000;
        battle.add({ id: "snake", kind: "beast", weapon: "snake", team: "wild", square: [6, 5], ai: "wild", hp: 5000, wild: { creature: "snake", tier: 1, temper: "aggressive", guard: 9, roam: 0, leash: 30, pack: "s", leader: null, menace: true } });
        battle.actor("snake").target = "p";

        const events = run(battle, 20000);
        const bites = events.filter(({ type, by }) => type === "hit" && by === "snake").length;
        const poisoned = events.filter(({ type, change, kind }) => type === "afflicted" && change === "on" && kind === "poison").length;

        assert.ok(bites > 5, `${bites} bites`);
        assert.ok(poisoned > 0 && poisoned < bites, `poisoned ${poisoned} times of ${bites}: sometimes`);
    });

    it("is cured at once by its cure, and only then is one used", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, progress: { pack: [{ id: "antidote", count: 2 }, { id: "bandage", count: 1 }] } });

        const { progress } = host.players.get(HOST_PLAYER);
        const actor = host.battle.actor(HOST_PLAYER);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", item: "antidote" }), { ok: false, reason: "unafflicted" });
        assert.equal(progress.count("antidote"), 2, "none used for nothing");

        host.battle.afflict(HOST_PLAYER, "poison");
        host.battle.afflict(HOST_PLAYER, "bleed");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", item: "antidote" }), { ok: true });
        assert.deepEqual(actor.afflictions.map(({ kind }) => kind), ["bleed"], "only what it cures");
        assert.equal(progress.count("antidote"), 1);

        const events = host.advance(STEP_MS);

        assert.ok(events.some(({ type, kind, change }) => type === "afflicted" && kind === "poison" && change === "cured"));
        assert.ok(events.some(({ type, id, item }) => type === "used" && id === HOST_PLAYER && item.id === "antidote"));

        // (Kept with the world: what's still on them carries on from a snapshot)
        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.battle.actor(HOST_PLAYER).afflictions, actor.afflictions);
        assert.deepEqual(again.command(HOST_PLAYER, { type: "use", item: "bandage" }), { ok: true });
        assert.deepEqual(again.battle.actor(HOST_PLAYER).afflictions, []);
    });
});
