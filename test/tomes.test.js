// Spell tomes (client/js/core/spells.js TOMES, rollTome; core/progress.js ITEMS; core/spoils.js
// rollSpoils; core/standing.js offerContract; core/host.js; docs/MAGIC.md): a tome for each spell
// that isn't a school's, read to learn it at once; carried now and then by the creatures with
// hands from the middle tiers on, never by a beast; given by the guild for its harder contracts;
// the rarer, the rarer found and the dearer sold, and only to the guild.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { ITEMS, PACK_SIZE, priceOf, Progress } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { rollTome, SCHOOLS, SPELLS, TOME_RARITY, TOMES, tomeOf } from "../client/js/core/spells.js";
import { PARTS, rollSpoils, TOME_DROP } from "../client/js/core/spoils.js";
import { GUILD_TOMES, offerContract, REQUESTS } from "../client/js/core/standing.js";
import { War } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// How often a creature at a tier carries a tome, over many
function tomesOn(creature, tier, times = 20000) {
    const random = createRandom(7);
    let found = 0;

    for (let k = 0; k < times; k++) {
        found += rollSpoils(creature, tier, random, CREATURES[creature].tiers[0]).items.filter(({ id }) => ITEMS[id].tome).length;
    }

    return found / times;
}

describe("spell tomes (spells.js, progress.js, spoils.js, standing.js, host.js)", () => {
    it("has a tome for every spell that isn't a school's, read to learn it; the rarer, the dearer", () => {
        const schooled = new Set(Object.values(SCHOOLS).flatMap(({ tiers }) => tiers));

        assert.ok(TOMES.length >= 30);

        for (const spell of TOMES) {
            const tome = ITEMS[tomeOf(spell)];

            assert.ok(!schooled.has(spell) && SPELLS[spell].about, spell);
            assert.equal(tome.label, `Tome of ${SPELLS[spell].label}`);
            assert.deepEqual(tome.use, { learn: spell });
            assert.equal(tome.price, SPELLS[spell].price ?? TOME_RARITY[SPELLS[spell].tome].price, "as dear as it's rare (Light's its own: sold at every guild)");
        }

        assert.equal(tomeOf("wizardsWalk"), "tomeWizardsWalk");
        assert.ok(TOME_RARITY.rare.price > TOME_RARITY.uncommon.price && TOME_RARITY.uncommon.price > TOME_RARITY.common.price);

        // (The user's asks: Invisibility, Wizard's Walk and Polymorph rare; Summon and Levitate fairly common)
        assert.deepEqual(["invisibility", "wizardsWalk", "polymorph"].map((id) => SPELLS[id].tome), ["rare", "rare", "rare"]);
        assert.deepEqual(["summon", "levitate"].map((id) => SPELLS[id].tome), ["common", "common"]);
    });

    it("finds each tome as often as its rarity has it", () => {
        const random = createRandom(3);
        const counts = {};
        const times = 30000;

        for (let k = 0; k < times; k++) {
            const tome = rollTome(random);

            counts[SPELLS[tome].tome] = (counts[SPELLS[tome].tome] ?? 0) + 1;
        }

        const weights = Object.fromEntries(Object.keys(TOME_RARITY).map((rarity) => [rarity, TOMES.filter((id) => SPELLS[id].tome === rarity).length * TOME_RARITY[rarity].weight]));
        const total = Object.values(weights).reduce((sum, each) => sum + each, 0);

        for (const rarity of Object.keys(TOME_RARITY)) {
            assert.ok(Math.abs(counts[rarity] / times - weights[rarity] / total) < 0.015, rarity);
        }

        // (A rare one's a fraction as likely as a common one)
        const one = (rarity) => counts[rarity] / TOMES.filter((id) => SPELLS[id].tome === rarity).length;

        assert.ok(one("rare") < one("common") / 3);
    });

    it("has a tome carried now and then by the creatures with hands from the middle tiers on, never by a beast", () => {
        assert.deepEqual(Object.keys(CREATURES).filter((id) => CREATURES[id].hands).sort(), ["bandit", "banditChief", "boggart", "cultist", "frostTroll", "goblin", "ogre", "skeleton", "troll", "wightLord"]);

        // (Not below the middle tiers; rarely there, a little more further out; the perilous
        // places' own far more)
        assert.equal(tomesOn("bandit", TOME_DROP.tier - 1), 0);
        assert.ok(Math.abs(tomesOn("troll", 4) - TOME_DROP.chance) < 0.006);
        assert.ok(tomesOn("ogre", 9) > tomesOn("ogre", 4));
        assert.ok(Math.abs(tomesOn("wightLord", 9, 5000) - TOME_DROP.perilous) < 0.03);

        // (Beasts: never, however far out)
        for (const beast of ["wolf", "bear", "dragon", "wyvern", "caveSpider", "treant"]) {
            assert.equal(tomesOn(beast, 9, 3000), 0, beast);
        }
    });

    it("teaches a tome's spell at once when it's read, the tome gone; a spell known already, the tome kept", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const { progress } = host.players.get(HOST_PLAYER);

        progress.stow({ id: tomeOf("fear") }, 2);
        assert.ok(!progress.knows("fear"));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", index: 0 }), { ok: true });

        const events = run(host, STEP_MS);

        assert.ok(progress.knows("fear"));
        assert.equal(progress.pack[0].count, 1);
        assert.deepEqual(events.filter(({ type }) => type === "learnt").map(({ spell }) => spell), ["fear"]);

        // (Known: not read again)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", index: 0 }), { ok: false, reason: "known" });
        assert.equal(progress.pack[0].count, 1);

        // (And kept)
        assert.deepEqual(new Progress(progress.toJSON()).spells, ["fear"]);
    });

    it("sells a tome only to the adventurers' guild", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const barkeep = host.battle.actor(host.world.folk.find(({ role }) => role === "barkeep").id);
        const me = host.battle.actor(HOST_PLAYER);
        const { progress } = host.players.get(HOST_PLAYER);

        Object.assign(me, { map: barkeep.map, square: [barkeep.square[0], barkeep.square[1] + 1], path: [], order: null });
        Object.assign(me, { x: me.square[0] + 0.5, y: me.square[1] + 0.5 });
        progress.stow({ id: tomeOf("levitate") });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "sell", index: 0, to: barkeep.id }), { ok: false, reason: "wanted" });
        assert.ok(priceOf({ id: tomeOf("polymorph") }, { selling: true }) > priceOf({ id: tomeOf("levitate") }, { selling: true }));
    });

    it("offers a tome from the guild's library with its harder contracts: the camp outside always, a bounty now and then", () => {
        const war = new War(planWorld(3));
        const town = war.towns.find(({ kind, owner }) => kind === "town" && owner === "human");
        const giver = { id: "guild/receptionist", name: "Mirabel Wren", title: "" };
        const random = createRandom(4);

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.forces.push({ id: "force-900", realm: "orc", kind: "camp", size: 20, at: [town.at[0] + 300, town.at[1]], path: [], leg: 0, target: town.id, home: war.realm("orc").capital, since: 0 });

        // (Offered to the rank that opens the camp outside, and a bounty)
        const guildRank = Math.max(REQUESTS.camp.rank, REQUESTS.hunt.rank);
        const offered = Array.from({ length: 400 }, () => offerContract({ war, town: town.id, giver, guildRank, random }));
        const share = (kind) => offered.filter((each) => each.kind === kind && each.reward.tome).length / offered.filter((each) => each.kind === kind).length;

        assert.equal(share("camp"), GUILD_TOMES.camp);
        assert.ok(Math.abs(share("hunt") - GUILD_TOMES.hunt) < 0.12);
        assert.equal(share("beasts"), 0);
        assert.equal(share("parts"), 0);

        const camp = offered.find(({ kind }) => kind === "camp");

        assert.ok(TOMES.includes(camp.reward.tome));
        assert.match(camp.text, new RegExp(`Tome of ${SPELLS[camp.reward.tome].label}`));
    });

    it("gives the tome with the gold when a contract's done: in the pack, or at their feet with no room", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const player = host.players.get(HOST_PLAYER);
        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
        host.command(HOST_PLAYER, { type: "stop" });
        run(host, 1000);

        const receptionist = host.battle.actor(guild.folk.find(({ role }) => role === "receptionist").id);
        const me = host.battle.actor(HOST_PLAYER);

        Object.assign(me, { map: receptionist.map, square: [receptionist.square[0], receptionist.square[1] + 2], path: [], order: null });
        Object.assign(me, { x: me.square[0] + 0.5, y: me.square[1] + 0.5 });
        player.standing.register();

        // A contract taken, done, with a tome to it
        const contract = (tome) => {
            assert.equal(host.command(HOST_PLAYER, { type: "talk", with: receptionist.id }).ok, true);
            assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { work: "ask" } }).ok, true);

            const taken = host.command(HOST_PLAYER, { type: "effect", effect: { work: "accept" } }).request;
            const held = player.standing.find(taken.id);

            Object.assign(held, { state: "done", count: held.target.need ?? 0 });
            held.reward.tome = tome;

            if (held.kind === "parts") {
                player.progress.stow({ id: held.target.part }, held.target.need);
            }

            return held;
        };

        contract("summon");
        assert.equal(host.command(HOST_PLAYER, { type: "effect", effect: { report: true } }).ok, true);
        assert.equal(player.progress.held(tomeOf("summon")), 1);

        // (The pack full: at their feet, for them alone)
        run(host, 1000);
        contract("levitate");

        const parts = Object.keys(PARTS);

        for (let k = 0; player.progress.pack.filter(Boolean).length < PACK_SIZE; k++) {
            player.progress.stow({ id: parts[k] });
        }

        const told = host.command(HOST_PLAYER, { type: "effect", effect: { report: true } });
        const events = run(host, STEP_MS);

        assert.equal(told.ok, true, JSON.stringify(told));
        assert.equal(player.progress.held(tomeOf("levitate")), 0, "no room for it");

        const given = events.find(({ type, given: yes }) => type === "spoils" && yes);
        const dropped = host.ground.get(given.ground);

        assert.equal(dropped.for, HOST_PLAYER);
        assert.deepEqual(dropped.bundle.items.map(({ id }) => id), [tomeOf("levitate")]);
    });
});
