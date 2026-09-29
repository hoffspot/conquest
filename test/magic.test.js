// Magic (client/js/core/spells.js, core/battle.js, core/progress.js, core/host.js;
// docs/MAGIC.md): the schools, Healing and the four elements, each's spells tier by tier; what a
// new character knows, and the spells each school brings as it grows by the spells of it that
// land; each spell's own cooldown; attack spells a match for a creature of their tier in about
// three casts, some round their target or leaping on; healing on anyone, never taken as an
// attack; and the boost a wand or grimoire gives, rolled, rarely high.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, tierPower } from "../client/js/core/creatures.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { BOOSTS, itemLabel, priceOf, Progress, rarityOf, rollBoost, STARTING_BOOST } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { SCHOOLS, SPELL_XP, SPELLS, tierAt } from "../client/js/core/spells.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const open = (width, height) => ({ blocked: parseGrid(Array.from({ length: height }, () => ".".repeat(width))).map((row) => Uint8Array.from(row)) });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// A caster in an open field, and enemies (orcs) where asked, each hardy enough to take a spell
function field(foes = [], { weapon = "sword" } = {}) {
    const battle = new Battle(open(30, 30), { seed: 5 });
    const caster = battle.add({ id: "caster", kind: "player", weapon, team: "hero", square: [5, 15] });

    foes.forEach(([x, y], k) => battle.add({ id: `foe-${k}`, kind: "orc", weapon: "cleaver", team: "orcs", square: [x, y], hp: 5000 }));

    return { battle, caster };
}

describe("magic (spells.js)", () => {
    it("has Healing's five tiers and each element's seven, each tier its own spell, stronger and slower than the last", () => {
        assert.deepEqual(SCHOOLS.healing.tiers.map((id) => SPELLS[id].label), ["Vigor", "Mend Wounds", "Detraumatize", "Renewal", "Astral Heal"]);
        assert.deepEqual(SCHOOLS.fire.tiers.map((id) => SPELLS[id].label), ["Burn", "Fireball", "Burstflame", "Immolate", "Flamefill", "Inferno", "Hellfire"]);
        assert.deepEqual(SCHOOLS.earth.tiers.map((id) => SPELLS[id].label), ["Rumble", "Stone Crush", "Shatterstone", "Engulf", "Earthquake", "Acidify", "Disintegrate"]);
        assert.deepEqual(SCHOOLS.air.tiers.map((id) => SPELLS[id].label), ["Hurt", "Dustgust", "Shockbolt", "Lightning", "Thunderbolt", "Tornado", "Ionize"]);
        assert.deepEqual(SCHOOLS.water.tiers.map((id) => SPELLS[id].label), ["Blister", "Waterbolt", "Steamblast", "Bloodboil", "Iceblade", "Putrify", "Absolute Zero"]);

        for (const [school, { tiers, xp }] of Object.entries(SCHOOLS)) {
            assert.equal(xp.length, tiers.length, school);
            assert.equal(xp[0], 0);

            tiers.forEach((id, k) => {
                const spell = SPELLS[id];

                assert.equal(spell.school, school);
                assert.equal(spell.tier, k + 1);
                assert.ok(spell.about && spell.castTime > 0 && spell.cooldown > 0 && spell.reach > 0, id);

                if (k > 0) {
                    const before = SPELLS[tiers[k - 1]];
                    const strength = (each) => (each.full ? 1000 : ((each.heal ?? each.damage)[0] + (each.heal ?? each.damage)[1]) / 2);

                    assert.ok(strength(spell) > strength(before), `${id} stronger than ${before.label}`);
                    assert.ok(spell.cooldown > before.cooldown, `${id} slower`);

                    // (Each tier takes more than twice what the last did to reach: exponential)
                    assert.ok(xp[k] - xp[k - 1] > 2 * (xp[k - 1] - (xp[k - 2] ?? 0)) * 0.95 || k === 1, `${school} ${k}`);
                }
            });
        }

        // (Healing's on anyone; the elements' on enemies)
        assert.ok(SCHOOLS.healing.tiers.every((id) => SPELLS[id].target === "any"));
        assert.ok(["fire", "earth", "air", "water"].every((school) => SCHOOLS[school].tiers.every((id) => SPELLS[id].target === "enemy" && SPELLS[id].damage)));
        assert.deepEqual([tierAt("fire", 0), tierAt("fire", 149), tierAt("fire", 150), tierAt("fire", 1e6)], [1, 1, 2, 7]);
    });

    it("gives a new character Vigor and each element's first spell, and each school's next as it grows", () => {
        const progress = new Progress();

        assert.deepEqual(progress.known().sort(), ["blister", "burn", "hurt", "rumble", "stun", "vigor"]);
        assert.deepEqual(progress.growSchool("fire", 149), []);
        assert.deepEqual(progress.growSchool("fire", 1), ["fireball"]);
        assert.ok(progress.knows("fireball") && !progress.knows("burstflame"));
        assert.deepEqual(progress.growSchool("healing", 5000), ["mendWounds", "detraumatize", "renewal", "astralHeal"]);
        assert.equal(progress.tierOf("healing"), 5);
        assert.deepEqual(progress.toNextTier("healing"), { xp: 5000, from: 5000, to: null });

        // (Kept, and the healing skill as it was before there were schools: Healing's)
        assert.deepEqual(new Progress(progress.toJSON()).schools, progress.schools);
        assert.equal(new Progress({ skills: { healing: 800 } }).tierOf("healing"), 3);
    });

    it("makes an attack spell of each tier a match for a creature of its tier: about three casts", () => {
        const random = createRandom(3);

        // (The creatures of the wild, their hit points on average, at a tier)
        const roster = Object.values(CREATURES).filter(({ tiers }) => tiers[0] < 9);
        const hp = (tier) => (roster.reduce((sum, { hp: each }) => sum + each, 0) / roster.length) * tierPower(tier);

        for (const school of ["fire", "earth", "air", "water"]) {
            SCHOOLS[school].tiers.forEach((id, k) => {
                const spell = SPELLS[id];
                const tier = 1 + 1.5 * k;
                let total = 0;

                for (let n = 0; n < 500; n++) {
                    total += random.int(spell.damage[0], spell.damage[1]);
                }

                const casts = hp(tier) / (total / 500);

                assert.ok(casts > 2.2 && casts < 4, `${id}: ${casts.toFixed(2)} casts for a tier ${tier} creature`);
            });
        }

        // (The first tier's weak: a new adventurer's)
        assert.ok(SPELLS.burn.damage[1] <= 15 && SPELLS.vigor.heal[1] <= 12);
    });

    it("strikes an enemy with an attack spell, and those round it with one that has an area, but never a friend", () => {
        const { battle, caster } = field([
            [11, 15],
            [12, 15],
            [11, 17],
            [15, 15],
        ]);

        battle.add({ id: "friend", kind: "player", weapon: "sword", team: "hero", square: [11, 16] });

        const hits = (spell) => {
            Object.assign(caster, { spellReadyAt: 0, spellsReadyAt: {} });
            assert.deepEqual(battle.cast("caster", spell, "foe-0"), { ok: true });

            return run(battle, SPELLS[spell].castTime + STEP_MS).filter(({ type, by }) => type === "hit" && by === "caster");
        };

        const burn = hits("burn");

        assert.deepEqual(burn.map(({ id }) => id), ["foe-0"]);
        assert.ok(burn[0].damage >= SPELLS.burn.damage[0] && burn[0].damage <= SPELLS.burn.damage[1]);
        assert.equal(burn[0].spell, "burn");

        // Burstflame: all within 1.5 m of it (but not the friend beside them, nor the one far off)
        const burst = hits("burstflame");

        assert.deepEqual(burst.map(({ id }) => id).sort(), ["foe-0", "foe-1"]);

        // Lightning: on, and leaping to the two nearest, each less
        const lightning = hits("lightning");

        assert.deepEqual(lightning.map(({ id }) => id), ["foe-0", "foe-1", "foe-2"]);

        // (Not on a friend at all)
        Object.assign(caster, { spellReadyAt: 0, spellsReadyAt: {} });
        assert.deepEqual(battle.cast("caster", "burn", "friend"), { ok: false, reason: "friendly" });
    });

    it("leaves what the element does: fire burning, ice slowing, the ground throwing them down, stuns from the air", () => {
        const cast = (spell) => {
            const { battle } = field([[10, 15]]);

            battle.cast("caster", spell, "foe-0");

            return { events: run(battle, SPELLS[spell].castTime + STEP_MS * 2), foe: battle.actor("foe-0") };
        };

        assert.ok(cast("immolate").foe.afflictions.some(({ kind }) => kind === "burn"));
        assert.ok(cast("iceblade").foe.afflictions.some(({ kind, look }) => kind === "slow" && look === "frost"));
        assert.ok(cast("bloodboil").foe.afflictions.some(({ kind }) => kind === "bleed"));
        assert.ok(cast("putrify").foe.afflictions.some(({ kind }) => kind === "disease"));
        assert.ok(cast("earthquake").events.some(({ type, id }) => type === "knockdown" && id === "foe-0"));
        assert.ok(cast("tornado").events.some(({ type, id }) => type === "stunned" && id === "foe-0"));
    });

    it("heals anyone: a friend, one of the folk, even an enemy, without starting a fight; Astral Heal fully, ending all that lingers", () => {
        const { battle, caster } = field([[9, 15]]);
        const foe = battle.actor("foe-0");

        battle.add({ id: "folk", kind: "folk", team: "folk", neutral: true, square: [6, 17] });
        Object.assign(foe, { hp: 10, maxHp: 50 });
        assert.deepEqual(battle.cast("caster", "vigor", "foe-0"), { ok: true });

        const healed = run(battle, SPELLS.vigor.castTime + STEP_MS).find(({ type }) => type === "healed");

        assert.equal(healed.id, "foe-0");
        assert.ok(foe.hp > 10);
        assert.equal(foe.foes.caster, undefined, "healing's no attack");

        battle.actor("folk").hp = 5;
        Object.assign(caster, { spellReadyAt: 0, spellsReadyAt: {} });
        assert.deepEqual(battle.cast("caster", "vigor", "folk"), { ok: true });
        run(battle, SPELLS.vigor.castTime + STEP_MS);
        assert.ok(battle.actor("folk").hp > 5 && !battle.actor("folk").foes?.caster);

        // Astral Heal: full, and everything lingering ended
        Object.assign(caster, { hp: 3, spellReadyAt: 0, spellsReadyAt: {} });
        battle.afflict("caster", "poison");
        battle.afflict("caster", "wither");
        assert.deepEqual(battle.cast("caster", "astralHeal"), { ok: true });
        run(battle, SPELLS.astralHeal.castTime + STEP_MS);
        assert.equal(caster.hp, caster.maxHp);
        assert.deepEqual(caster.afflictions, []);

        // (At full health with nothing lingering, nothing to do; with poison on them, a cure to do)
        Object.assign(caster, { spellReadyAt: 0, spellsReadyAt: {} });
        assert.equal(battle.cast("caster", "renewal").reason, "healthy");
        battle.afflict("caster", "poison");
        assert.deepEqual(battle.cast("caster", "renewal"), { ok: true });
    });

    it("grows a school by the spells of it that land, the more for a higher tier: its next spell told of", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, progress: { schools: { fire: 145 } } });

        const { progress } = host.players.get(HOST_PLAYER);
        const me = host.battle.actor(HOST_PLAYER);
        const [x, y] = me.square;
        const free = [x + 3, y];

        host.battle.add({ id: "target", kind: "orc", weapon: "cleaver", team: "orcs", square: free, hp: 5000 });

        let events = [];

        for (let k = 0; k < 40 && !events.length; k++) {
            events = host.advance(STEP_MS).filter(() => false);
        }

        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "burn", target: "target" }), { ok: true });

        for (let k = 0; k < 30; k++) {
            events.push(...host.advance(STEP_MS));
        }

        assert.equal(progress.schools.fire, 145 + SPELL_XP * 1);
        assert.deepEqual(events.filter(({ type }) => type === "tier").map(({ school, spell, tier }) => ({ school, spell, tier })), [{ school: "fire", spell: "fireball", tier: 2 }]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "fireball", target: "target" }), { ok: true }, "known now");
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "burstflame", target: "target" }), { ok: false, reason: "unknown" });

        // (Blade grows by blows, not by spells)
        assert.equal(progress.skills.blade, 0);
    });

    it("rolls a wand's or grimoire's boost to spells: 10 to 100%, the higher the rarer", () => {
        const random = createRandom(11);
        const rolls = Array.from({ length: 20000 }, () => rollBoost(random));
        const total = BOOSTS.reduce((sum, { weight }) => sum + weight, 0);

        assert.ok(rolls.every((boost) => boost >= 0.1 && boost <= 1 && Math.abs(Math.round(boost * 100) - boost * 100) < 1e-9));

        for (const { band, weight } of BOOSTS) {
            const share = rolls.filter((boost) => boost >= band[0] && (boost < band[1] || band[1] === 1)).length / rolls.length;

            assert.ok(Math.abs(share - weight / total) < 0.02, `${band}: ${share}`);
        }

        assert.equal(rarityOf(0.15), "common");
        assert.equal(rarityOf(0.95), "very rare");
        assert.equal(itemLabel({ id: "wand", boost: 0.34 }), "Wand (+34% spells)");
        assert.ok(priceOf({ id: "wand", boost: 0.9 }, { selling: true }) > priceOf({ id: "wand", boost: 0.15 }, { selling: true }));
    });

    it("makes spells as much stronger as the wand in hand boosts them; wands of different boosts are kept apart", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: { ...HERO, weapon: "wand" }, progress: { gear: { mainHand: { id: "wand", quality: "common", boost: 0.6 } } } });

        const { progress } = host.players.get(HOST_PLAYER);

        assert.ok(Math.abs(host.battle.actor(HOST_PLAYER).power.spell - 1.6) < 1e-9);
        assert.equal(new Progress({}, { weapon: "grimoire" }).gear.mainHand.boost, STARTING_BOOST, "a new character's is a common one");

        progress.stow({ id: "wand", boost: 0.2 });
        progress.stow({ id: "wand", boost: 0.3 });
        progress.stow({ id: "wand", boost: 0.2 });
        assert.deepEqual(progress.pack.filter(Boolean).map(({ boost, count }) => [boost, count]), [
            [0.2, 2],
            [0.3, 1],
        ]);
        assert.equal(progress.held("wand", "common", 0.3), 1);
        assert.ok(progress.remove("wand", 1, "common", 0.3));
        assert.equal(progress.held("wand", null, 0.3), 0);
        assert.equal(progress.held("wand"), 2);
    });
});
