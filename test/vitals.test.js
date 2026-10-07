// How a player is kept between visits (host.js vitalsOf, restoreVitals): hurt, tired, what lingers
// and lasts on them, their boons, their abilities' and spells' waits, each by what's left of it

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { BOUGHT, COMPANY, HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { ABILITIES, ITEMS } from "../client/js/core/progress.js";
import { SPELLS } from "../client/js/core/spells.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    for (let t = 0; t < ms; t += STEP_MS) {
        host.advance(STEP_MS);
    }
}

// A world with its player in it, a while after it began (its battle's clock not at nought)
function hosted(ms = 1000) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gear: { mainHand: { id: HERO.weapon } } } });
    run(host, ms);

    return host;
}

describe("how a player is kept between visits (host.js vitalsOf, restoreVitals)", () => {
    it("keeps them hurt and tired, poisoned, a spell on them, blessed and boosted, their abilities and spells waiting; and puts each back with what was left of it, on a clock of its own", () => {
        const host = hosted();
        const { battle } = host;
        const actor = battle.actor(HOST_PLAYER);
        const player = host.players.get(HOST_PLAYER);
        const now = battle.time;

        player.boons = [
            { ...BOUGHT.blessing.boon, until: now + 200000 },
            { ...ITEMS.staminaBoost.use.boon, until: now + 60000 },
        ];
        Object.assign(actor, { hp: actor.maxHp - 20, stamina: 30 });
        battle.afflict(HOST_PLAYER, "poison", { damage: 2 });
        battle.buff(HOST_PLAYER, "levitate", { ms: 100000, by: HOST_PLAYER, level: 2 });
        player.readyAt.powerStrike = now + 5000;
        actor.spellReadyAt = now + 1000;
        actor.spellsReadyAt = { levitate: now + 15000 };

        const vitals = JSON.parse(JSON.stringify(host.vitalsOf(HOST_PLAYER)));

        assert.deepEqual(vitals, {
            hp: actor.maxHp - 20,
            stamina: 30,
            afflictions: [{ kind: "poison", left: 9000, damage: 2, look: null }],
            buffs: [{ kind: "levitate", left: 100000, level: 2, own: true }],
            boons: [
                { id: "blessing", left: 200000 },
                { id: "staminaBoost", left: 60000 },
            ],
            abilities: { powerStrike: 5000 },
            spell: 1000,
            spells: { levitate: 15000 },
        });

        // Back another day: a world whose clock's elsewhere
        const again = hosted(7000);
        const back = again.battle.actor(HOST_PLAYER);
        const was = back.maxStamina;

        again.restoreVitals(HOST_PLAYER, vitals);

        assert.deepEqual(again.vitalsOf(HOST_PLAYER), vitals, "each as it was, by what was left of it");
        assert.equal(back.maxStamina, was * 2, "the Stamina Boost's breath");
        assert.equal(back.hp, actor.hp);
        assert.equal(again.battle.buffOf(back, "levitate").by, HOST_PLAYER);

        // And it wears off as it would have: the poison in 9 s, the boost in a minute
        run(again, 9000);
        assert.deepEqual(back.afflictions, []);
        run(again, 52000);
        assert.deepEqual(again.players.get(HOST_PLAYER).boons.map(({ id }) => id), ["blessing"]);
        assert.equal(back.maxStamina, was);
    });

    it("gets a fallen player up whole; lets go of what the game doesn't know, or that would last longer than it can; and of what isn't vitals at all", () => {
        const host = hosted();
        const actor = host.battle.actor(HOST_PLAYER);

        actor.dead = true;
        assert.deepEqual([host.vitalsOf(HOST_PLAYER).hp, host.vitalsOf(HOST_PLAYER).stamina], [null, null]);
        assert.equal(host.vitalsOf("nobody"), null);

        const again = hosted();
        const back = again.battle.actor(HOST_PLAYER);
        const whole = [back.hp, back.stamina];

        again.restoreVitals(HOST_PLAYER, {
            hp: null,
            stamina: null,
            afflictions: [{ kind: "plague", left: 5000 }, { kind: "bleed", left: -1 }, null, "poison"],
            buffs: [{ kind: "levitate", left: SPELLS.levitate.lasts * 10, level: 1 }, { kind: "fireball", left: 5000 }],
            boons: [{ id: "sharpening", left: BOUGHT.sharpening.boon.ms * 3, melee: 100 }, { id: "godhood", left: 5000 }],
            abilities: { powerStrike: ABILITIES.powerStrike.cooldown * 5, flight: 1000 },
            spell: Infinity,
            spells: { levitate: "soon", nothing: 1000 },
        });

        assert.deepEqual([back.hp, back.stamina], whole, "whole");
        assert.deepEqual(back.afflictions, []);
        assert.deepEqual(
            back.buffs.map(({ kind, until }) => [kind, until - again.battle.time]),
            [["levitate", SPELLS.levitate.lasts]],
        );
        assert.deepEqual(
            again.players.get(HOST_PLAYER).boons.map(({ id, melee, until }) => [id, melee, until - again.battle.time]),
            [["sharpening", BOUGHT.sharpening.boon.melee, BOUGHT.sharpening.boon.ms]],
            "as the game has it, not as kept",
        );
        assert.deepEqual(again.players.get(HOST_PLAYER).readyAt, { powerStrike: again.battle.time + ABILITIES.powerStrike.cooldown });
        assert.deepEqual([back.spellReadyAt, back.spellsReadyAt], [again.battle.time, {}]);

        // Hit points no more than they can have now; nothing kept, nothing changes
        again.restoreVitals(HOST_PLAYER, { hp: 10000, stamina: -5 });
        assert.deepEqual([back.hp, back.stamina], [back.maxHp, 0]);

        for (const nothing of [null, undefined, "hurt", 5]) {
            again.restoreVitals(HOST_PLAYER, nothing);
        }

        assert.deepEqual([back.hp, back.stamina], [back.maxHp, 0]);
    });

    it("keeps a courtesan's afterglow with its roll and the pox, each for what was left of its hour; a roll kept is put back as rolls go", () => {
        const host = hosted();
        const now = host.battle.time;

        host.players.get(HOST_PLAYER).boons = [{ id: "afterglow", label: "Afterglow: stamina back 73% faster", recoveryTimes: 1.73, faster: 73, ms: COMPANY.ms, until: now + 1000000 }];
        host.battle.afflict(HOST_PLAYER, "pox", { ms: 2000000 });

        const vitals = JSON.parse(JSON.stringify(host.vitalsOf(HOST_PLAYER)));

        assert.deepEqual(vitals.boons, [{ id: "afterglow", left: 1000000, faster: 73 }]);
        assert.deepEqual(vitals.afflictions.map(({ kind, left }) => [kind, left]), [["pox", 2000000]]);

        const again = hosted();
        const back = again.battle.actor(HOST_PLAYER);
        const kept = () => again.players.get(HOST_PLAYER).boons.map(({ label, recoveryTimes, until }) => [label, recoveryTimes, until - again.battle.time]);

        again.restoreVitals(HOST_PLAYER, vitals);
        assert.deepEqual(kept(), [["Afterglow: stamina back 73% faster", 1.73, 1000000]]);
        assert.equal(back.recovery, 1.73);
        assert.deepEqual(back.afflictions.map(({ kind, until }) => [kind, until - again.battle.time]), [["pox", 2000000]]);

        // (However it was kept: no faster than the fastest roll, no slower than the slowest, no longer than the hour)
        again.restoreVitals(HOST_PLAYER, { boons: [{ id: "afterglow", left: COMPANY.ms * 5, faster: 1000 }] });
        assert.deepEqual(kept(), [["Afterglow: stamina back 100% faster", 2, COMPANY.ms]]);
        again.restoreVitals(HOST_PLAYER, { boons: [{ id: "afterglow", left: 5000, faster: "lots" }, { id: "constructor", left: 5000 }] });
        assert.deepEqual(kept(), [["Afterglow: stamina back 50% faster", 1.5, 5000]]);
    });
});
