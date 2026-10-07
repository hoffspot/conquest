// Weapons held in one hand or two, and shields (client/js/core/weapons.js, core/gear.js,
// core/progress.js, core/battle.js, core/host.js; docs/WAR.md, "Gear" and "Shields"): the
// two-handed weapons doing half as much again in a fight for the shield they can't carry, a
// grimoire's spells a quarter stronger than a wand's; each shield's share of a blow rolled when it's
// made, the more robust and the better made the more; blows from in front caught on it as often as
// the Shield skill has it (one in ten to one in two), spells only on a spellward; the soldiers and
// hired warriors with shields blocking too; a shield bash; and new characters with a sword or a
// wand starting with a shield
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { AFFIXES, affixesFor, BLOCK_MOST, blockMost, GEAR, handsOf, offHandFits, rollBlock, rollGear, SHIELD_ARMS, SHIELDS } from "../client/js/core/gear.js";
import { HIRES, HOST_PLAYER, Host, NPC_SHIELDS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { itemLabel, priceOf, Progress, RANKS, STARTING_SHIELDS, TREES } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { WEAPONS } from "../client/js/core/weapons.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const open = (width, height) => ({ blocked: parseGrid(Array.from({ length: height }, () => ".".repeat(width))).map((row) => Uint8Array.from(row)) });
const near = (a, b, within = 1e-9) => Math.abs(a - b) < within;

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// What a weapon's blows do in a fight, a second (its first attack's)
const perSecond = (id) => {
    const { damage: [least, most], interval } = WEAPONS[id].attacks[0];

    return ((least + most) / 2 / interval) * 1000;
};

// A player with a sword setting on a knight who stands still, unarmed (facing them, or away), carrying a shield
function duel(shield, { away = false, seed = 5, ms = 8000 } = {}) {
    const battle = new Battle(open(10, 10), { seed });

    battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [4, 4] });
    battle.add({ id: "knight", kind: "orc", weapon: null, team: "orcs", square: [4, 5], facing: away ? 0 : Math.PI, hp: 10000, shield });

    return { battle, events: run(battle, ms) };
}

describe("weapons in one hand or two (weapons.js, gear.js, progress.js)", () => {
    it("has the two-handed weapons do half as much again as a sword in a fight: the hammer twice its blow, slower; the staff quicker, its blows less than the hammer's", () => {
        assert.equal(handsOf("sword"), 1);

        for (const id of ["hammer", "staff", "gauntlets"]) {
            const share = perSecond(id) / perSecond("sword");

            assert.equal(handsOf(id), 2, id);
            assert.ok(share > 1.4 && share < 1.6, `${id}: ${share.toFixed(2)} a sword's`);
        }

        const [sword, hammer, staff] = ["sword", "hammer", "staff"].map((id) => WEAPONS[id].attacks[0]);

        assert.deepEqual(hammer.damage, sword.damage.map((value) => value * 2), "a hammer's blow, twice a sword's");
        assert.ok(hammer.interval > sword.interval, "slower");
        assert.ok(staff.interval < sword.interval, "a staff quicker than a sword");
        assert.ok(staff.damage[1] < hammer.damage[1], "and its blows lighter than a hammer's");

        // (The bow's arrows half as much again as they were, 3 to 7 every 1.4 seconds)
        assert.ok(near(perSecond("bow") / (5 / 1.4), 1.5, 0.01));
    });

    it("makes a grimoire's spells a quarter stronger than a wand's as strong, on everything else that strengthens them", () => {
        const spells = (id) => new Progress({ gear: { mainHand: { id, boost: 0.3 }, head: { id: "wizardHat" } } }).bonuses().spell;

        assert.ok(near(spells("wand"), 0.3 + 0.05));
        assert.ok(near(1 + spells("grimoire"), (1 + 0.3 + 0.05) * 1.25));
        assert.equal(handsOf("grimoire"), 2, "(held open in both hands: no shield)");
    });

    it("lets a sword take any shield, a wand only a spellward, and nothing held in both hands any", () => {
        for (const shield of SHIELDS) {
            assert.equal(offHandFits("sword", shield), null, shield);
            assert.equal(offHandFits("wand", shield), GEAR[shield].spells ? null : "ward", shield);
            assert.equal(offHandFits("grimoire", shield), "twoHanded", shield);
            assert.equal(offHandFits("hammer", shield), "twoHanded", shield);
        }

        assert.deepEqual(SHIELDS, ["roundShield", "kiteShield", "towerShield", "spellward", "shield"]);
        assert.deepEqual(SHIELD_ARMS, ["sword", "cleaver"]);
    });
});

describe("shields (gear.js, progress.js)", () => {
    it("rolls how much of a blow each shield takes as it's made: half the most its make can to all of it, the more robust the more, a spellward half a tower shield's", () => {
        assert.deepEqual(BLOCK_MOST, { common: 0.5, fine: 0.65, masterwork: 0.8, legendary: 1 });
        assert.equal(blockMost("towerShield", "legendary"), 1);
        assert.equal(blockMost("towerShield", "common"), 0.5);
        assert.equal(blockMost("spellward", "legendary"), 0.5, "(half a tower shield's)");
        assert.equal(blockMost("spellward", "common"), 0.25);
        assert.ok(blockMost("roundShield", "fine") < blockMost("kiteShield", "fine") && blockMost("kiteShield", "fine") < blockMost("towerShield", "fine"));

        const random = createRandom(9);

        for (const id of SHIELDS) {
            for (const quality of Object.keys(BLOCK_MOST)) {
                const rolls = Array.from({ length: 200 }, () => rollBlock(id, quality, random));
                const most = blockMost(id, quality);
                const average = rolls.reduce((sum, roll) => sum + roll, 0) / rolls.length;

                assert.ok(rolls.every((roll) => roll >= Math.floor(most * 50) / 100 && roll <= most && near(roll * 100, Math.round(roll * 100), 1e-6)), `${quality} ${id}`);
                assert.ok(average > most * 0.6 && average < most * 0.75, `${quality} ${id}: the higher the rarer (${average.toFixed(2)} of ${most})`);
            }
        }

        // (Made as any gear is: its roll with it, named for it and worth more the higher it is)
        const made = rollGear("kiteShield", "masterwork", createRandom(3));

        assert.ok(made.boost >= 0.32 && made.boost <= 0.64);
        assert.match(itemLabel(made), new RegExp(`\\(blocks ${Math.round(made.boost * 100)}%\\)$`));
        assert.ok(priceOf({ id: "kiteShield", quality: "common", boost: 0.4 }) > priceOf({ id: "kiteShield", quality: "common", boost: 0.2 }));
        assert.equal(priceOf({ id: "kiteShield", quality: "common", boost: 0.2 }), priceOf({ id: "kiteShield", quality: "common" }));
    });

    it("keeps each shield's roll, no more than its make can, and gives one made before shields blocked an average one", () => {
        const progress = new Progress({ pack: [{ id: "towerShield", quality: "common", boost: 0.9, count: 1 }, { id: "kiteShield", quality: "fine", count: 1 }] });

        assert.equal(progress.pack[0].boost, 0.5, "(a common one's most)");
        assert.equal(progress.pack[1].boost, Math.round(blockMost("kiteShield", "fine") * (2 / 3) * 100) / 100);
    });

    it("can be made Stalwart (more often blocking) or of the Ram (a harder shield bash); a spellward with the spells' bonuses instead", () => {
        for (const id of SHIELDS) {
            const can = affixesFor(id);

            assert.ok(can.includes("stalwart"), id);
            assert.equal(can.includes("ram"), !GEAR[id].spells, id);
            assert.equal(can.includes("arcane") && can.includes("mending") && can.includes("binding"), Boolean(GEAR[id].spells), id);
        }

        assert.ok(!affixesFor("sword").includes("stalwart") && !affixesFor("quiver").includes("stalwart"));
        assert.equal(AFFIXES.stalwart.stat, "block");
        assert.equal(AFFIXES.ram.stat, "bash");
    });

    it("starts a new character with a sword with a round shield, and with a wand with a spellward; none with anything else", () => {
        assert.deepEqual(STARTING_SHIELDS, { sword: "roundShield", wand: "spellward" });

        for (const weapon of ["sword", "wand", "grimoire", "hammer", "staff", "bow", "gauntlets", "boots"]) {
            const { offHand } = new Progress({}, { weapon }).gear;

            assert.equal(offHand?.id ?? null, STARTING_SHIELDS[weapon] ?? null, weapon);

            if (offHand) {
                assert.equal(offHand.quality, "common");
                assert.ok(near(offHand.boost, Math.round(blockMost(offHand.id) * (2 / 3) * 100) / 100), weapon);
            }
        }
    });

    it("blocks one blow in ten untrained, and one in two as a Legend of the Shield skill, a shield's own Stalwart on top, to a point", () => {
        assert.deepEqual(TREES.shield.bonus.block, [0.1, 0.18, 0.26, 0.34, 0.42, 0.5]);
        assert.equal(TREES.shield.abilities[2], "shieldBash");

        const untrained = new Progress({}, { weapon: "sword" });

        assert.deepEqual(untrained.guard(), { chance: 0.1, share: 0.2, spells: false });
        assert.deepEqual(new Progress({}, { weapon: "wand" }).guard(), { chance: 0.1, share: 0.17, spells: true });
        assert.equal(new Progress({}, { weapon: "hammer" }).guard(), null);

        const legend = new Progress({ skills: { shield: RANKS.at(-1).xp }, gear: { mainHand: { id: "sword" }, offHand: { id: "towerShield", quality: "legendary", boost: 0.9, bonuses: { block: 0.2 }, affixes: ["stalwart"] } } });

        assert.deepEqual(legend.guard(), { chance: 0.6, share: 0.9, spells: false }, "(no more than three in five)");
    });
});

describe("blocking in a fight (battle.js)", () => {
    it("catches a blow from in front on a shield, all of it taken by one that takes all, and lets nothing linger", () => {
        const { battle, events } = duel({ chance: 1, share: 1, spells: false });
        const blocked = events.filter(({ type, id }) => type === "blocked" && id === "knight");

        assert.ok(blocked.length >= 4, `${blocked.length} blocked`);
        assert.ok(blocked.every(({ by, damage, share }) => by === "player" && damage === 0 && share === 1));
        assert.ok(!events.some(({ type, id }) => type === "hit" && id === "knight"), "nothing got through");
        assert.equal(battle.actor("knight").hp, 10000);
    });

    it("takes its share off a blow caught on it, the rest getting through", () => {
        const { events } = duel({ chance: 1, share: 0.5, spells: false });
        const blocked = events.filter(({ type, id }) => type === "blocked" && id === "knight");
        const hits = events.filter(({ type, id }) => type === "hit" && id === "knight");

        assert.ok(blocked.length >= 4);
        assert.equal(hits.length, blocked.length);
        assert.ok(blocked.every(({ damage, of }) => damage === Math.round(of * 0.5) && of >= 4 && of <= 8));
        assert.deepEqual(hits.map(({ damage }) => damage), blocked.map(({ damage }) => damage));
    });

    it("never catches a blow from behind", () => {
        const { events } = duel({ chance: 1, share: 1, spells: false }, { away: true });

        assert.ok(!events.some(({ type }) => type === "blocked"));
        assert.ok(events.filter(({ type, id }) => type === "hit" && id === "knight").length >= 4);
    });

    it("catches about as many as its chance has it", () => {
        const { events } = duel({ chance: 0.3, share: 1, spells: false }, { ms: 90000 });
        const blocked = events.filter(({ type, id }) => type === "blocked" && id === "knight").length;
        const hit = events.filter(({ type, id }) => type === "hit" && id === "knight").length;

        assert.ok(blocked / (blocked + hit) > 0.15 && blocked / (blocked + hit) < 0.45, `${blocked} of ${blocked + hit}`);
    });

    it("catches a spell only on a spellward", () => {
        const cast = (spells) => {
            const battle = new Battle(open(10, 10), { seed: 6 });

            battle.add({ id: "mage", kind: "player", weapon: "wand", team: "hero", square: [4, 2] });
            battle.add({ id: "knight", kind: "orc", weapon: null, team: "orcs", square: [4, 6], facing: Math.PI, hp: 10000, shield: { chance: 1, share: 1, spells } });
            Object.assign(battle.actor("mage"), { armed: true });
            assert.deepEqual(battle.cast("mage", "burn", "knight"), { ok: true });

            return run(battle, 3000).filter(({ id, spell }) => id === "knight" && spell === "burn");
        };

        assert.deepEqual(cast(false).map(({ type }) => type), ["hit"]);
        assert.deepEqual(cast(true).map(({ type }) => type), ["blocked"]);
    });

    it("stuns whoever a shield bash lands on", () => {
        const battle = new Battle(open(10, 10), { seed: 7 });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [4, 4] });
        battle.add({ id: "knight", kind: "orc", weapon: null, team: "orcs", square: [4, 5], facing: 0, hp: 10000 });
        battle.empower("player", "melee", 1, { stun: 2000 });

        const events = run(battle, 2500);
        const hit = events.find(({ type, id }) => type === "hit" && id === "knight");
        const stunned = events.find(({ type }) => type === "stunned");

        assert.ok(hit && stunned);
        assert.equal(stunned.ability, "shieldBash");
        assert.equal(stunned.until, hit.time + 2000);
        assert.equal(battle.actor("player").empowered, null, "(spent)");
    });
});

describe("shields in play (host.js)", () => {
    const world = buildWorld({ seed: 2 });

    const hosted = (progress = {}, hero = HERO) => {
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero, progress });
        host.populate();

        return host;
    };

    it("gives the player's shield to the battle, as often as their skill has it, and grows the skill with each blow caught on it", () => {
        const host = hosted();
        const player = host.battle.actor(HOST_PLAYER);
        const orc = host.battle.actor("orc");
        const { progress } = host.players.get(HOST_PLAYER);

        assert.deepEqual(player.shield, { chance: 0.1, share: 0.2, spells: false });
        assert.equal(hosted({}, { ...HERO, weapon: "hammer" }).battle.actor(HOST_PLAYER).shield, null);

        Object.assign(player, { hp: 5000, maxHp: 5000 });
        Object.assign(orc, { hp: 5000, maxHp: 5000, square: [player.square[0], player.square[1] + 1], x: player.x, y: player.y + 1, path: [], order: null });
        host.command(HOST_PLAYER, { type: "engage", target: "orc" });

        const events = [];

        for (let t = 0; t < 60000; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        const blocked = events.filter(({ type, id }) => type === "blocked" && id === HOST_PLAYER).length;

        assert.ok(blocked > 0, "caught some of the orc's blows");
        assert.equal(progress.skills.shield, blocked * 20);
    });

    it("has a people's soldiers with a sword or a cleaver block with their shield, their captains better; a hired warrior too", () => {
        const host = hosted();

        // (The player in the town: its soldiers out)
        for (let t = 0; t < 1000; t += STEP_MS) {
            host.advance(STEP_MS);
        }

        const soldiers = [...host.soldiers.entries()].map(([id, { weapon, captain }]) => ({ actor: host.battle.actor(id), weapon, captain })).filter(({ actor }) => actor);

        assert.ok(soldiers.length > 0);

        for (const { actor, weapon, captain } of soldiers) {
            assert.deepEqual(actor.shield, SHIELD_ARMS.includes(weapon) ? NPC_SHIELDS[captain ? "captain" : "soldier"] : null, actor.id);
        }

        assert.ok(soldiers.some(({ actor }) => actor.shield), "(some carry one)");
        assert.equal(HIRES.warrior.shield, true);
        assert.ok(Object.entries(HIRES).every(([calling, { shield }]) => Boolean(shield) === (calling === "warrior")));
    });

    it("bashes with the shield once the Shield skill's second rank is reached, only with a shield in the other hand", () => {
        const host = hosted({ skills: { shield: RANKS[2].xp } });
        const player = host.battle.actor(HOST_PLAYER);
        const { progress } = host.players.get(HOST_PLAYER);

        assert.ok(progress.abilities().includes("shieldBash"));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "shieldBash" }), { ok: true });
        assert.deepEqual(player.empowered, { blow: "melee", factor: 1, stun: 2000 });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "ability", ability: "shieldBash" }), { ok: false, reason: "cooldown" });

        // (Without a shield, refused; untrained, unknown)
        const bare = hosted({ skills: { shield: RANKS[2].xp }, gear: { mainHand: { id: "sword" } } });

        assert.deepEqual(bare.command(HOST_PLAYER, { type: "ability", ability: "shieldBash" }), { ok: false, reason: "unshielded" });
        assert.deepEqual(hosted().command(HOST_PLAYER, { type: "ability", ability: "shieldBash" }), { ok: false, reason: "unknown" });

        // (A shield of the Ram: harder, and longer)
        const ram = hosted({ skills: { shield: RANKS[2].xp }, gear: { mainHand: { id: "sword" }, offHand: { id: "kiteShield", bonuses: { bash: 0.25 }, affixes: ["ram"] } } });

        ram.command(HOST_PLAYER, { type: "ability", ability: "shieldBash" });
        assert.deepEqual(ram.battle.actor(HOST_PLAYER).empowered, { blow: "melee", factor: 1.25, stun: 2500 });
    });
});
