// The specialist shops' goods (client/js/core/goods.js, with core/progress.js, core/host.js and
// core/battle.js; docs/WAR.md *Shops*): the six makes things come in, the alchemist's brews, the
// spell scrolls, and the charms carried for luck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionOf, assignable, iconOf } from "../client/js/app/wheel.js";
import { ITEM_ICONS } from "../client/js/app/icons.js";
import { Battle, KINDS, STAMINA_DRAIN, STEP_MS } from "../client/js/core/battle.js";
import { charmRolledOf, charmWords, describe as describeThing } from "../client/js/app/gearinfo.js";
import { elitePrize } from "../client/js/core/caches.js";
import { ROLLS } from "../client/js/core/gear.js";
import { BREWS, CHARM_GRADE, CHARM_KIN, CHARM_ROLLS, CHARMS, charmOf, charmStats, rollCharm, SCROLL_SPELLS, SCROLLS, scrollOf } from "../client/js/core/goods.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { comesInMakes, gradeOf, ITEMS, MAKES, priceOf, Progress, QUALITIES, wareKind } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { SCHOOLS, SPELLS } from "../client/js/core/spells.js";
import { madeOf } from "../client/js/core/stock.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const open = (width, height) => ({ blocked: parseGrid(Array.from({ length: height }, () => ".".repeat(width))).map((row) => Uint8Array.from(row)) });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A world with its player in it (as kept: `progress`), in nothing but their sword
const hosted = (progress = {}) => {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gear: { mainHand: { id: HERO.weapon } }, ...progress } });
    host.populate();

    return host;
};

// The orc beside the player, `away` squares off
const orcBy = (host, away = 1) => {
    const player = host.battle.actor(HOST_PLAYER);
    const orc = host.battle.actor("orc");

    put(orc, player.map, [player.square[0] + away, player.square[1]]);

    return orc;
};

describe("the six makes (progress.js QUALITIES)", () => {
    it("makes things common, fine, masterwork, rare, very rare or legendary: each better made stronger, dearer and rarer", () => {
        const makes = Object.keys(QUALITIES);

        assert.deepEqual(makes, ["common", "fine", "masterwork", "rare", "veryRare", "legendary"]);

        for (const [k, make] of makes.entries()) {
            if (k) {
                const [was, now] = [QUALITIES[makes[k - 1]], QUALITIES[make]];

                assert.ok(now.power > was.power && now.price > was.price && now.might > was.might, make);
                assert.ok(MAKES[make] < MAKES[makes[k - 1]], `${make} rarer`);
            }
        }

        assert.equal(Math.round(Object.values(MAKES).reduce((sum, share) => sum + share, 0) * 1000) / 1000, 1);
        assert.deepEqual(
            makes.map((quality) => QUALITIES[quality].label),
            ["", "Fine", "Masterwork", "Rare", "Very rare", "Legendary"],
        );

        // (A rare sword dearer than a masterwork one, a legendary dearer still)
        const prices = makes.map((quality) => priceOf({ id: "sword", quality }));

        assert.deepEqual([...prices].sort((a, b) => a - b), prices);
    });

    it("has gear and charms come in every make, and a draught, scroll or tome only as rare as it is", () => {
        assert.ok(comesInMakes("sword") && comesInMakes("luckyCoin"));
        assert.ok(!comesInMakes("potion") && !comesInMakes("scrollFireball") && !comesInMakes("greaterPotion"));

        assert.equal(gradeOf({ id: "sword", quality: "rare" }), "rare");
        assert.equal(gradeOf({ id: "sword" }), "common");
        assert.equal(gradeOf({ id: "luckyCoin", quality: "veryRare" }), "veryRare");
        assert.equal(gradeOf({ id: "potion" }), "common");
        assert.equal(gradeOf({ id: "superiorPotion", quality: "legendary" }), "masterwork", "a draught as it was made, whatever's said");
        assert.equal(gradeOf({ id: "phialOfShadows" }), "rare");
        assert.equal(gradeOf({ id: scrollOf("hellfire") }), "legendary");
    });
});

describe("the alchemist's brews (goods.js BREWS)", () => {
    it("brews twenty-two draughts, elixirs and oils, each with what it does, a price, a make and a colour, carried and sold as supplies", () => {
        assert.equal(Object.keys(BREWS).length, 22);

        for (const [id, brew] of Object.entries(BREWS)) {
            assert.equal(ITEMS[id], brew, id);
            assert.ok(brew.use && brew.about && brew.price > 0, id);
            assert.ok(QUALITIES[brew.rarity], `${id} ${brew.rarity}`);
            assert.match(brew.colour, /^#[0-9a-f]{6}$/, id);
            assert.equal(wareKind(id), "supplies", id);
            assert.match(ITEM_ICONS[id], /<(path|circle|ellipse|rect)/, `${id} has an icon`);
        }

        // (Stronger healing, the dearer)
        assert.ok(BREWS.greaterPotion.use.heal < BREWS.superiorPotion.use.heal && BREWS.greaterPotion.price < BREWS.superiorPotion.price);
    });

    it("gives an elixir's boon a while, one of each at a time: an Elixir of Strength's blows 15% stronger, ten minutes", () => {
        const host = hosted({ pack: [{ id: "elixirOfStrength", count: 2 }] });
        const player = host.battle.actor(HOST_PLAYER);
        const playing = host.players.get(HOST_PLAYER);
        const before = player.power.melee;

        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", item: "elixirOfStrength" }), { ok: true });
        assert.equal(Math.round((player.power.melee - before) * 100) / 100, 0.15);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", item: "elixirOfStrength" }), { ok: false, reason: "boosted" });
        assert.equal(playing.progress.pack[0].count, 1, "the second kept");

        const events = run(host, 10 * 60000 + STEP_MS);

        assert.deepEqual(events.filter(({ type }) => type === "boon").map(({ boon, change }) => [boon, change]), [["strength", "on"], ["strength", "off"]]);
        assert.equal(player.power.melee, before);
    });

    it("puts a ward's spell on its drinker half an hour (a warding elixir), Invisibility a minute (a phial of shadows), Light a quarter of an hour (glowcap)", () => {
        const host = hosted({ pack: [{ id: "elixirOfFireWarding" }, { id: "phialOfShadows" }, { id: "glowcapDraught" }] });
        const player = host.battle.actor(HOST_PLAYER);
        const use = (item) => host.command(HOST_PLAYER, { type: "use", item });
        const left = (kind) => (host.battle.buffOf(player, kind)?.until ?? host.battle.time) - host.battle.time;

        assert.deepEqual(use("elixirOfFireWarding"), { ok: true });
        assert.equal(left("resistFire"), 30 * 60000);
        assert.deepEqual(use("glowcapDraught"), { ok: true });
        assert.equal(left("light"), 15 * 60000);
        assert.deepEqual(use("phialOfShadows"), { ok: true });
        assert.equal(left("invisibility"), 60000);
        assert.equal(host.players.get(HOST_PLAYER).progress.pack.filter(Boolean).length, 0, "each drunk");

        run(host, 30 * 60000);
        assert.equal(host.battle.buffOf(player, "resistFire"), null, "worn off");
    });

    it("leaves what an oil's for on a quarter of the blows (fire oil: burning), one oil on a weapon at a time", () => {
        const host = hosted({ pack: [{ id: "fireOil" }, { id: "frostOil" }] });
        const player = host.battle.actor(HOST_PLAYER);
        const orc = orcBy(host);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", item: "fireOil" }), { ok: true });
        assert.deepEqual(player.oil, { kind: "burn", chance: 0.25 });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", item: "frostOil" }), { ok: false, reason: "boosted" });

        Object.assign(player, { hp: 5000, maxHp: 5000 });
        Object.assign(orc, { hp: 5000, maxHp: 5000 });
        host.command(HOST_PLAYER, { type: "engage", target: "orc" });

        const events = run(host, 40000);
        const blows = events.filter(({ type, id, by, spell }) => type === "hit" && id === "orc" && by === HOST_PLAYER && !spell).length;
        const burnt = events.filter(({ type, id, kind, by, change }) => type === "afflicted" && id === "orc" && kind === "burn" && by === HOST_PLAYER && change === "on").length;

        assert.ok(blows >= 12, `${blows} blows`);
        assert.ok(burnt >= 1 && burnt <= blows / 2, `${burnt} of ${blows} set it burning`);

        // (Five minutes on, worn off: no more)
        run(host, 5 * 60000);
        assert.equal(player.oil, null);
    });
});

describe("the spell scrolls (goods.js SCROLLS)", () => {
    it("has a scroll of every school's spell, the Hexes', and the tomes' cast on someone; the greater the spell, the rarer and dearer", () => {
        const schools = Object.values(SCHOOLS).flatMap(({ tiers }) => tiers);

        assert.equal(SCROLL_SPELLS.length, 48);
        assert.ok(schools.every((spell) => SCROLL_SPELLS.includes(spell)));
        assert.ok(SCROLL_SPELLS.includes("stun") && SCROLL_SPELLS.includes("hold"));
        assert.ok(!SCROLL_SPELLS.filter((spell) => !schools.includes(spell)).some((spell) => SPELLS[spell].ward || SPELLS[spell].cures || SPELLS[spell].needs), "no tome's ward, cure or wand's spell");
        assert.ok(!SCROLL_SPELLS.includes("teleport"));

        for (const spell of SCROLL_SPELLS) {
            const scroll = SCROLLS[scrollOf(spell)];

            assert.equal(ITEMS[scrollOf(spell)], scroll);
            assert.deepEqual(scroll.use, { cast: spell });
            assert.equal(scroll.label, `Scroll of ${SPELLS[spell].label}`);
            assert.equal(wareKind(scrollOf(spell)), "tome");
            assert.match(ITEM_ICONS[scrollOf(spell)], /<(path|circle|ellipse|rect)/, `${spell}'s scroll has an icon`);
        }

        const fire = SCHOOLS.fire.tiers.map((spell) => SCROLLS[scrollOf(spell)]);

        assert.deepEqual(
            fire.map(({ rarity }) => rarity),
            ["common", "common", "fine", "masterwork", "rare", "veryRare", "legendary"],
        );
        assert.deepEqual([...fire].sort((a, b) => a.price - b.price), fire);
    });

    it("casts its spell once, read, though its reader's never learnt it: at the enemy named, or the nearest they can see in its reach; refused, it's kept", () => {
        const host = hosted({ pack: [{ id: "scrollFireball", count: 3 }] });
        const player = host.battle.actor(HOST_PLAYER);
        const { progress } = host.players.get(HOST_PLAYER);
        const orc = orcBy(host, 4);
        const read = (target) => host.command(HOST_PLAYER, { type: "use", item: "scrollFireball", ...(target ? { target } : {}) });

        Object.assign(orc, { hp: 5000, maxHp: 5000 });
        assert.equal(progress.knows("fireball"), false);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "fireball", target: "orc" }), { ok: false, reason: "unknown" });

        // (At the orc, named)
        assert.deepEqual(read("orc"), { ok: true });
        assert.equal(progress.held("scrollFireball"), 2);

        let events = run(host, SPELLS.fireball.castTime + 2000);

        assert.ok(events.some(({ type, id, by, spell }) => type === "hit" && id === "orc" && by === HOST_PLAYER && spell === "fireball"));

        // (Again at once: the spell's not ready again yet, and the scroll's kept)
        player.spellReadyAt = host.battle.time + 1000;
        assert.equal(read("orc").ok, false);
        assert.equal(progress.held("scrollFireball"), 2);

        // (None named: the nearest foe in its reach, the orc)
        Object.assign(player, { spellReadyAt: 0, spellsReadyAt: {} });
        assert.deepEqual(read(), { ok: true });
        events = run(host, SPELLS.fireball.castTime + 2000);
        assert.ok(events.some(({ type, id, spell }) => type === "hit" && id === "orc" && spell === "fireball"));
        assert.equal(progress.held("scrollFireball"), 1);
        assert.equal(progress.knows("fireball"), false, "still not learnt");

        // (No one to cast it at: kept)
        Object.assign(player, { spellReadyAt: 0, spellsReadyAt: {} });
        put(orc, "town", [player.square[0] + 60, player.square[1]]);
        assert.equal(read().ok, false);
        assert.equal(progress.held("scrollFireball"), 1);
    });

    it("goes on the wheel its spell would: a scroll cast at an enemy on an enemy's, by its spell's name", () => {
        assert.deepEqual(actionOf("item:scrollFireball"), { label: "Fireball", item: "scrollFireball", on: "enemy" });
        assert.equal(actionOf("item:scrollSwole")?.on, "self");
        assert.equal(iconOf("item:scrollFireball"), ITEM_ICONS.scrollFireball);
        assert.ok(assignable("enemy", { carries: ["scrollFireball", "potion"] }).includes("item:scrollFireball"));
        assert.ok(!assignable("enemy", { carries: ["scrollFireball", "potion"] }).includes("item:potion"));
        assert.ok(!assignable("self", { carries: ["scrollFireball"] }).includes("item:scrollFireball"));
        assert.ok(assignable("self", { carries: ["scrollSwole"] }).includes("item:scrollSwole"));
    });
});

describe("the charms (goods.js CHARMS)", () => {
    it("makes each charm stronger the better made it is, and only the best made of a kind counts, carried", () => {
        assert.deepEqual(Object.keys(CHARM_GRADE), Object.keys(QUALITIES));

        for (const [id, charm] of Object.entries(CHARMS)) {
            assert.equal(ITEMS[id], charm, id);
            assert.equal(wareKind(id), "charm", id);
            assert.match(ITEM_ICONS[id], /<(path|circle|ellipse|rect)/, `${id} has an icon`);
        }

        assert.deepEqual(charmOf("luckyCoin"), { fortune: 0.08 });
        assert.deepEqual(charmOf("luckyCoin", "legendary"), { fortune: 0.2 });
        assert.deepEqual(charmOf("oakHeart", "masterwork"), { hp: 12 });

        const bare = new Progress({}).bonuses();
        const carrying = new Progress({ pack: [{ id: "wolfTooth" }, { id: "wolfTooth", quality: "rare" }, { id: "wolfTooth", quality: "fine" }, { id: "emberStone", quality: "veryRare" }, { id: "sword" }] });

        assert.deepEqual(carrying.charms(), { wolfTooth: { id: "wolfTooth", quality: "rare" }, emberStone: { id: "emberStone", quality: "veryRare" } });
        assert.equal(Math.round((carrying.bonuses().melee - bare.melee) * 10000) / 10000, charmOf("wolfTooth", "rare").melee, "the best, not all three");
        assert.equal(carrying.bonuses().wardFire, 0.16);
    });

    it("rolls more goods on a fine charm or better as it's made: as many as gear of its make has, each different and not its own, in its make's span, most often those that suit it", () => {
        const random = createRandom(7);
        const tally = { kin: 0, all: 0 };

        for (const [id, { charm, kin }] of Object.entries(CHARMS)) {
            assert.equal(kin.length, 3, id);
            assert.ok(kin.every((stat) => CHARM_ROLLS[stat] && !(stat in charm)), `${id}'s kin are goods a charm can have rolled, not its own`);
            assert.deepEqual(rollCharm(id, "common", random), { id, quality: "common" }, "a common one has none");

            for (const quality of ["fine", "masterwork", "rare", "veryRare", "legendary"]) {
                const { count, strength } = ROLLS[quality];

                for (let k = 0; k < 30; k++) {
                    const made = rollCharm(id, quality, random);
                    const stats = Object.keys(made.bonuses);

                    assert.equal(stats.length, count, `${id}, ${quality}`);

                    for (const stat of stats) {
                        const [least, most] = CHARM_ROLLS[stat];
                        const close = Number.isInteger(least) ? 0.5 : 0.005;

                        assert.ok(!(stat in charm), `${id}: never its own good again`);
                        assert.ok(made.bonuses[stat] >= least * strength - close && made.bonuses[stat] <= most * strength + close, `${id}, ${quality}: ${stat} ${made.bonuses[stat]}`);
                        tally.kin += kin.includes(stat) ? 1 : 0;
                        tally.all += 1;
                    }
                }
            }
        }

        // (The first of them suits it three times in four, or by chance; the rest less often, as
        // what suits it is used up)
        assert.ok(tally.kin / tally.all > 0.6 && tally.kin / tally.all < 0.85, `${tally.kin} of ${tally.all} suit their charm`);
        assert.ok(CHARM_KIN > 0.5);
        assert.deepEqual(rollCharm("stormGlass", "rare", createRandom(3)), rollCharm("stormGlass", "rare", createRandom(3)), "the same for the same roll");

        // (Made as it's bought, and as an elite's prize)
        assert.equal(Object.keys(madeOf({ id: "stormGlass", quality: "veryRare" }, createRandom(4)).bonuses).length, 3);
        assert.deepEqual(madeOf({ id: "stormGlass" }, createRandom(4)), { id: "stormGlass", quality: "common" });

        const prizes = Array.from({ length: 400 }, () => elitePrize(3, random)).filter(({ id }) => CHARMS[id]);

        assert.ok(prizes.length > 50);
        assert.ok(prizes.every(({ quality, bonuses = {} }) => Object.keys(bonuses).length === ROLLS[quality].count), JSON.stringify(prizes.slice(0, 3)));
    });

    it("counts what was rolled on a charm carried, its own good too; keeps it in the pack and a save (but what no charm can have); and of two as well made, the first counts", () => {
        const glass = { id: "stormGlass", quality: "veryRare", bonuses: { wardWater: 0.1, stamina: 9 } };
        const other = { id: "stormGlass", quality: "veryRare", bonuses: { endurance: 0.15, hp: 10, wardMagic: 0.06 } };
        const bare = new Progress({}).bonuses();
        const carrying = new Progress({ pack: [glass, other] });

        assert.deepEqual(charmStats(glass), { wardAir: 0.16, wardWater: 0.1, stamina: 9 });
        assert.deepEqual(charmStats({ id: "stormGlass", quality: "veryRare", bonuses: { melee: 0.02, nonsense: 1, hp: "lots" } }), { wardAir: 0.16, melee: 0.02 });
        assert.deepEqual(carrying.charms(), { stormGlass: glass }, "the first of two as well made");

        const bonuses = carrying.bonuses();

        assert.equal(bonuses.wardAir, 0.16);
        assert.equal(bonuses.wardWater, 0.1);
        assert.equal(bonuses.stamina - bare.stamina, 9);
        assert.equal(bonuses.hp, bare.hp, "not the second's");

        // Two rolled unlike don't stack, alike they do; kept as they are, but for what no charm can have
        const pack = new Progress({});

        assert.ok(pack.stow(glass) && pack.stow(other) && pack.stow(glass));
        assert.deepEqual(
            pack.pack.filter(Boolean).map(({ bonuses: rolled, count }) => ({ rolled, count })),
            [
                { rolled: glass.bonuses, count: 2 },
                { rolled: other.bonuses, count: 1 },
            ],
        );

        const kept = new Progress(JSON.parse(JSON.stringify(new Progress({ pack: [{ ...glass, bonuses: { ...glass.bonuses, armor: 0.5, melee: "x" } }] }).toJSON())));

        assert.deepEqual(kept.pack[0], { ...glass, count: 1 });
    });

    it("says what a charm does, its own good and what was rolled on it, and what a shop's could have rolled on it as it's bought", () => {
        const glass = { id: "stormGlass", quality: "veryRare", bonuses: { wardWater: 0.1, stamina: 9 } };
        const progress = new Progress({ pack: [glass] });

        assert.deepEqual(charmWords(glass), ["−16% air's harm", "−10% water's harm", "+9 stamina"]);
        assert.deepEqual(charmWords({ id: "stormGlass", quality: "veryRare" }), ["−16% air's harm"]);

        const carried = describeThing(progress.pack[0], progress, { index: 0, label: "Very rare storm glass" });

        assert.equal(carried.kind, "Charm");
        assert.deepEqual(
            carried.lines.map(({ text, tone }) => [tone, text]),
            [
                ["note", "Wind and lightning hurt you a little less"],
                ["base", "−16% air's harm"],
                ["bonus", "−10% water's harm"],
                ["bonus", "+9 stamina"],
                ["note", "Carried in the pack: of each kind, the best made counts (of two as well made, the first)"],
            ],
        );
        assert.equal(carried.rolls, null);

        // (A shop's: what could be rolled on it, the goods that suit it first, as strong as its make can)
        const ware = describeThing({ id: "stormGlass", quality: "veryRare" }, progress, { label: "Very rare storm glass", ware: true });

        assert.deepEqual(ware.rolls, charmRolledOf({ id: "stormGlass", quality: "veryRare" }));
        assert.deepEqual(ware.rolls, {
            count: 3,
            title: "Comes with 3 more goods, each different, rolled as it's bought:",
            choices: [
                { name: "Likely", text: "−6–11% water's harm" },
                { name: "Likely", text: "−8–17% running's toll" },
                { name: "Likely", text: "+6–11 stamina" },
                { name: "Now and then", text: "any other a charm can give" },
            ],
        });
        assert.equal(charmRolledOf({ id: "luckyCoin", quality: "fine" }).title, "Comes with one more good, rolled as it's bought:");
        assert.equal(charmRolledOf({ id: "luckyCoin", quality: "common" }), null);
    });

    it("counts a charm as soon as it's carried, and no more once it's gone: a heart of oak's hit points", () => {
        const host = hosted({ pack: [{ id: "oakHeart", quality: "masterwork" }] });
        const player = host.battle.actor(HOST_PLAYER);

        assert.equal(player.maxHp, KINDS.player.hp + 12);
        assert.ok(host.command(HOST_PLAYER, { type: "drop", index: 0, count: 1 }).ok);
        assert.equal(player.maxHp, KINDS.player.hp);

        // (And what was rolled on one: a storm glass's stamina and hit points, its wards in the fight)
        const plain = hosted({ pack: [{ id: "stormGlass", quality: "veryRare" }] }).battle.actor(HOST_PLAYER);
        const rolled = hosted({ pack: [{ id: "stormGlass", quality: "veryRare", bonuses: { stamina: 9, hp: 10, wardWater: 0.1 } }] }).battle.actor(HOST_PLAYER);

        assert.equal(rolled.maxStamina - plain.maxStamina, 9);
        assert.equal(rolled.maxHp - plain.maxHp, 10);
        assert.deepEqual([plain.wards.air, plain.wards.water, rolled.wards.air, rolled.wards.water], [0.16, 0, 0.16, 0.1]);
    });

    it("has fire hurt less with an ember stone carried, and every spell with a witch's eye (no more than half off)", () => {
        const struck = (wards) => {
            const battle = new Battle(open(30, 20), { seed: 9 });

            battle.add({ id: "caster", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 10], hp: 500 });
            battle.add({ id: "target", kind: "player", weapon: "sword", team: "hero", square: [10, 10], hp: 5000 });
            battle.actor("target").wards = wards;
            assert.deepEqual(battle.cast("caster", "immolate", "target"), { ok: true });

            const events = [];

            for (let t = 0; t < SPELLS.immolate.castTime + STEP_MS; t += STEP_MS) {
                events.push(...battle.advance(STEP_MS));
            }

            return events.find(({ type, id }) => type === "hit" && id === "target").damage;
        };
        const bare = struck(null);

        assert.equal(struck({ fire: 0.16 }), Math.round(bare * 0.84));
        assert.equal(struck({ water: 0.16 }), bare, "a rime stone's no help against fire");
        assert.equal(struck({ fire: 0.16, magic: 0.1 }), Math.round(bare * 0.74));
        assert.equal(struck({ fire: 0.6 }), Math.round(bare * 0.5), "half at most");
    });

    it("finds more gold on the fallen with a lucky coin carried", () => {
        const fight = (pack) => {
            const host = hosted({ pack });
            const player = host.battle.actor(HOST_PLAYER);

            Object.assign(player, { hp: 5000, maxHp: 5000 });
            orcBy(host);
            host.command(HOST_PLAYER, { type: "engage", target: "orc" });

            return run(host, 60000).find(({ type }) => type === "loot")?.gold;
        };
        const bare = fight([]);

        assert.ok(bare > 0, `${bare}`);
        assert.equal(fight([{ id: "luckyCoin", quality: "legendary" }]), Math.round(bare * 1.2));
    });

    it("has running tire them less with a swiftwind charm carried", () => {
        const ran = (endurance) => {
            const battle = new Battle(open(60, 5), { seed: 1 });
            const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 2] });

            player.endurance = endurance;
            battle.command("player", { type: "move", to: [58, 2], run: true });

            for (let t = 0; t < 2000; t += STEP_MS) {
                battle.advance(STEP_MS);
            }

            return KINDS.player.hp - player.stamina;
        };

        assert.equal(ran(0), 2 * STAMINA_DRAIN);
        assert.equal(Math.round(ran(0.24) * 1000) / 1000, Math.round(2 * STAMINA_DRAIN * 0.76 * 1000) / 1000);
    });
});
