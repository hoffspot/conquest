// Crafting, stage 2 (docs/CRAFTING.md *The five stages*): the seven new blows a crafted weapon
// strikes (core/materials.js ON_BLOW) as bonuses there are (core/gear.js STATS), kept on what's
// made and totalled with the rest of a hero's gear, no more than BLOW_CAP (core/progress.js
// thingOf, bonuses), said on a card (app/gearinfo.js), counted in a hero's might (core/might.js,
// strength.js) and let loose in a fight (core/battle.js #onBlow: the actor's `blows`, host.js
// #outfit), each a hit of its own on a blow that did harm; and the host's crafters (core/host.js
// #craft, #salvage, #salvageJunk), making and breaking down at every crafter there is, a capital's
// to the legendary (the owner's ruling), refused in the doc's order with nothing changed, all of
// it or nothing, told, and the same on every copy of the world (NET_VERSION 231).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blowWorded, describe as describeItem, totals } from "../client/js/app/gearinfo.js";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CRAFT_REFUSALS, craftItem, craftRefusal, inCapital, ingredientsOf, junkSalvage, previewOf, recipesAt, salvageOf, salvagesAt, takesFrom } from "../client/js/core/crafting.js";
import { STATS } from "../client/js/core/gear.js";
import { HOST_PLAYER, Host, REFUSALS, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { BLOW_CAP, ON_BLOW, UNHOLY } from "../client/js/core/materials.js";
import { fighterOf, heroValue, mightOf } from "../client/js/core/might.js";
import { Hosting, Joining, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { isJunk, PACK_SIZE, Progress, thingOf } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { makeUnique } from "../client/js/core/rare.js";
import { CAPITAL_BEST, CRAFTERS, RECIPES } from "../client/js/core/recipes.js";
import { WARD } from "../client/js/core/spells.js";
import { BLOWS_COUNTED, onBlow, weaponHarm } from "../client/js/core/strength.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const BLOWS = Object.keys(ON_BLOW);
const stack = (id, count = 1, quality = "common") => ({ ...thingOf({ id, quality }), count });
const junk = (id, count = 1, quality = "common") => ({ ...stack(id, count, quality), junk: true });
// (What's in a pack, by slot: [slot, id, count, junk] each)
const laid = (pack) => pack.flatMap((each, slot) => (each ? [[slot, each.id, each.count, isJunk(each)]] : []));
// (A pack filled to the brim with meals, but for what's given, in its places)
const brimming = (...given) => Array.from({ length: PACK_SIZE }, (each, slot) => given[slot] ?? stack("meal"));

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });
const quietly = (work) => {
    const warn = console.warn;

    console.warn = () => {};

    try {
        return work();
    } finally {
        console.warn = warn;
    }
};

// ---- The new blows in a fight -----------------------------------------------------------------

// A fight on open ground: the player, a sword in hand (or `weapon`), striking with `blows` (and
// anything else of theirs, `mine`), set on a foe that stands and takes it beside them (anything
// else of it, `foe`: its armour, wards, kind), for `ms`. What came of it: { battle, events,
// landed: each of the player's blows that landed and the hits of its own that came of it, in
// order ([{ hit, after }]) }
function fight(blows, { foe = {}, mine = {}, weapon = "sword", ms = 8000, seed = 8, before = () => {}, engage = true } = {}) {
    const battle = new Battle({ blocked: Array.from({ length: 16 }, () => new Uint8Array(16)) }, { seed });

    battle.add({ id: "player", kind: "player", weapon, team: "hero", square: [4, 4] });
    battle.add({ id: "foe", kind: "orc", weapon: "cleaver", team: "orcs", square: weapon === "bow" ? [9, 4] : [5, 4], hp: 100000, ...foe });
    Object.assign(battle.actor("player"), blows ? { blows } : {}, mine);
    before(battle);

    if (engage) {
        battle.command("player", { type: "engage", target: "foe" });
    }

    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return { battle, events, landed: landedOf(events) };
}

// Each hit of the player's (a blow, a shot or a spell) and the hits of its own that came of it, in
// order: [{ hit, after }]
function landedOf(events) {
    const landed = [];

    for (const event of events) {
        if (event.type !== "hit" || event.by !== "player") {
            continue;
        }

        if (BLOWS.includes(event.attack)) {
            assert.ok(landed.length, `${event.attack} after a blow`);
            landed.at(-1).after.push(event);
        } else {
            landed.push({ hit: event, after: [] });
        }
    }

    return landed;
}

const HORSE = Object.freeze({ id: "h1", name: "Bramble", coat: "dapple", mane: "dark", tint: "#2a211b", fallen: false });

// (A strong hand, so a share of a blow's harm is more than a point or two)
const STRONG = Object.freeze({ power: { melee: 10, ranged: 10, heal: 1, stun: 1, spell: 1, bash: 1 } });

describe("the new blows as bonuses (gear.js STATS, progress.js bonuses and thingOf, app/gearinfo.js)", () => {
    it("are bonuses there are, each a share and its label ON_BLOW's, kept on a piece as it's carried, its own name with them", () => {
        for (const [stat, { label }] of Object.entries(ON_BLOW)) {
            assert.deepEqual(STATS[stat], { label, share: true }, stat);
        }

        const sword = craftItem("sword", ["adamantiteIngot", "wyvernScale", "demonHorn"], createRandom(7), { level: 60 });
        const kept = thingOf(sword);

        assert.ok(kept.bonuses.fireBlow > 0 && kept.bonuses.stormBlow > 0, JSON.stringify(kept));
        assert.deepEqual(kept.bonuses, sword.bonuses, "(all it's made with kept)");
        assert.equal(kept.name, "Adamantite Demon Sword");
        assert.deepEqual(new Progress(new Progress({ pack: [{ ...kept, count: 1 }] }).toJSON()).pack[0].bonuses, sword.bonuses, "(and kept with the hero)");
    });

    it("are totalled with the rest of a hero's gear, a weapon's and a quiver's together, no more than BLOW_CAP each; none, nothing", () => {
        assert.equal(BLOW_CAP, 0.4);

        const plain = new Progress({ gear: { mainHand: { id: "sword" } } }).bonuses();

        for (const stat of BLOWS) {
            assert.equal(plain[stat], 0, stat);
        }

        const one = new Progress({ gear: { mainHand: { id: "sword", bonuses: { fireBlow: 0.12, holyBlow: 0.3 } } } }).bonuses();

        assert.equal(one.fireBlow, 0.12);
        assert.equal(one.holyBlow, 0.3);
        assert.equal(one.frostBlow, 0);

        const both = new Progress({ gear: { mainHand: { id: "bow", bonuses: { fireBlow: 0.3, venomBlow: 0.1 } }, offHand: { id: "quiver", bonuses: { fireBlow: 0.3, venomBlow: 0.15 } } } }).bonuses();

        assert.equal(both.fireBlow, BLOW_CAP, "(0.6 all told: held to the cap)");
        assert.ok(Math.abs(both.venomBlow - 0.25) < 1e-9);
    });

    it("are said on a card, what each does besides, and among the totals beside the paperdoll; and in what putting one on would change", () => {
        const progress = new Progress({ gear: { mainHand: { id: "sword" } }, pack: [{ ...thingOf({ id: "sword", quality: "fine", bonuses: { fireBlow: 0.12, holyBlow: 0.2, melee: 0.05 }, name: "Steel Demon Sword" }), count: 1 }] });
        const card = describeItem(progress.pack[0], progress, { index: 0 });
        const said = card.lines.map(({ text }) => text);

        assert.ok(said.includes("+12% of each blow's harm again as fire, setting the foe struck burning as often"), said.join(" | "));
        assert.ok(said.includes("+20% of each blow's harm again as holy fire, on the restless dead and demons alone"), said.join(" | "));
        assert.ok(said.includes("+5% melee damage"));
        assert.ok(card.compare.some(({ text, tone }) => text === "+12% fire on each blow" && tone === "better"), JSON.stringify(card.compare));

        for (const stat of BLOWS) {
            assert.match(blowWorded(stat, 0.1), /^\+10% of each blow's harm again as [a-z]/, stat);
        }

        assert.equal(totals(progress, { might: 0 }).rows.find(({ label }) => label === "On each blow"), undefined, "(none, not said)");
        progress.equip(0);
        assert.equal(totals(progress, { might: 0 }).rows.find(({ label }) => label === "On each blow").value, "+12% fire, +20% holy fire");
    });

    it("are counted in a hero's might as harm, each share on top of their blows', holy fire at a quarter", () => {
        const hero = (bonuses) => new Progress({ gear: { mainHand: { id: "sword", ...(bonuses ? { bonuses } : {}) } } });
        const plain = fighterOf(hero());
        const fiery = fighterOf(hero({ fireBlow: 0.4 }));
        const holy = fighterOf(hero({ holyBlow: 0.4 }));

        assert.equal(plain.blows, null);
        assert.deepEqual(fiery.blows, { fireBlow: 0.4 });
        assert.equal(BLOWS_COUNTED.holyBlow, 0.25);
        assert.equal(onBlow({ fireBlow: 0.4, holyBlow: 0.4 }), 0.4 + 0.1);
        assert.equal(onBlow(null), 0);
        assert.ok(Math.abs(weaponHarm(fiery) - weaponHarm(plain) * 1.4) < 1e-9);
        assert.ok(Math.abs(weaponHarm(holy) - weaponHarm(plain) * 1.1) < 1e-9);
        assert.ok(heroValue(hero({ fireBlow: 0.4 })) > heroValue(hero({ holyBlow: 0.4 })) && heroValue(hero({ holyBlow: 0.4 })) > heroValue(hero()));
        assert.ok(mightOf(hero({ fireBlow: 0.4, frostBlow: 0.4, stormBlow: 0.4 })) > mightOf(hero()));
    });
});

describe("the new blows in a fight (battle.js #onBlow)", () => {
    it("strikes each as a hit of its own after the blow it rides on: so much of its harm again, its element seen and heard, in the order they're on the striker", () => {
        const blows = { fireBlow: 0.4, frostBlow: 0.2, stormBlow: 0.3, venomBlow: 0.1, shadowBlow: 0.25 };
        const { landed } = fight(blows, { mine: STRONG });

        assert.ok(landed.length >= 4, `${landed.length} blows`);

        for (const { hit, after } of landed) {
            assert.equal(hit.attack, "slash");
            assert.deepEqual(after.map(({ attack }) => attack), Object.keys(blows));

            after.forEach((each, k) => {
                assert.equal(each.damage, Math.max(1, Math.round(blows[each.attack] * hit.damage)), `${each.attack} of ${hit.damage}`);
                assert.equal(each.reaction, ON_BLOW[each.attack].element === "fire" ? "fire" : "arcane");
                assert.equal(each.time, hit.time, "(in the same step)");
                assert.equal(each.projectile, null);
                assert.equal(each.spell, null);
                assert.equal(each.id, "foe");
                assert.equal(each.weapon, "sword");

                // (Its hit points taken off, after the blow's and the one's before)
                assert.equal(each.hp, (k ? after[k - 1].hp : hit.hp) - each.damage);
            });
        }
    });

    it("strikes holy fire on the unholy alone, and shadow on all but them", () => {
        assert.ok(UNHOLY.includes("skeleton") && !UNHOLY.includes("wolf"));

        const both = { holyBlow: 0.4, shadowBlow: 0.3 };
        const onOrc = fight(both, { mine: STRONG, ms: 4000 });
        const onDead = fight(both, { mine: STRONG, ms: 4000, foe: { wild: { creature: "skeleton", tier: 1 } } });

        assert.ok(onOrc.landed.length && onDead.landed.length);
        assert.ok(onOrc.landed.every(({ after }) => after.length === 1 && after[0].attack === "shadowBlow"));
        assert.ok(onDead.landed.every(({ hit, after }) => after.length === 1 && after[0].attack === "holyBlow" && after[0].damage === Math.max(1, Math.round(0.4 * hit.damage))));
    });

    it("is kept off by the foe's wards against its element, its kind's or a player's (half at the most) and a Ward spell's, as a spell is", () => {
        const share = 0.4;
        const harms = (foe, before) => fight({ fireBlow: share }, { mine: STRONG, ms: 4000, foe, before }).landed;
        const each = (landed, through) => {
            assert.ok(landed.length >= 2);

            for (const { hit, after } of landed) {
                assert.equal(after[0].damage, Math.max(1, Math.round(share * hit.damage * through)), `${hit.damage} through ${through}`);
            }
        };

        each(harms({ wards: { fire: 0.3 } }), 0.7);
        each(harms({ wards: { fire: 0.9 } }), 0.5);
        each(harms({ wards: { water: 0.5 } }), 1);
        each(
            harms({ wards: { fire: 0.5 } }, (battle) => battle.buff("foe", "resistFire", { ms: 600000 })),
            0.5 * WARD,
        );

        // (Holy fire and shadow are magic's: kept off by what keeps spells off)
        const shadow = fight({ shadowBlow: share }, { mine: STRONG, ms: 4000, foe: { wards: { magic: 0.2 } } }).landed;

        assert.ok(shadow.every(({ hit, after }) => after[0].damage === Math.max(1, Math.round(share * hit.damage * 0.8))));
    });

    it("strikes acid of the blow's harm before armour, the rest of it after", () => {
        const armor = 0.5;
        const { landed } = fight({ stormBlow: 0.4, acidBlow: 0.4 }, { mine: STRONG, ms: 6000, foe: { armor } });

        assert.ok(landed.length >= 3);

        for (const { hit, after } of landed) {
            const [storm, acid] = after;

            assert.equal(storm.damage, Math.max(1, Math.round(0.4 * hit.damage)));
            assert.ok(Math.abs(acid.damage - (0.4 * hit.damage) / (1 - armor)) <= 1, `${acid.damage} of ${hit.damage} before half its armour`);
            assert.ok(acid.damage > storm.damage);
        }
    });

    it("leaves fire's burning, frost's slowing, venom's poison and shadow's withering, as often as its chance times its share; lightning and acid nothing", () => {
        const left = (blows) => {
            const { events, landed } = fight(blows, { ms: 20000 });

            assert.ok(landed.length >= 10, `${landed.length} blows`);

            return events.filter(({ type, id, change, by }) => type === "afflicted" && id === "foe" && change === "on" && by === "player");
        };

        assert.ok(left({ fireBlow: 0.4 }).some(({ kind }) => kind === "burn"));
        assert.ok(left({ frostBlow: 0.4 }).some(({ kind, look }) => kind === "slow" && look === "frost"));
        assert.ok(left({ venomBlow: 0.4 }).some(({ kind }) => kind === "poison"));
        assert.ok(left({ shadowBlow: 0.4 }).some(({ kind }) => kind === "wither"));
        assert.deepEqual(left({ stormBlow: 0.4, acidBlow: 0.4 }), []);
        assert.deepEqual(left({}), [], "(a sword's slash leaves nothing of its own)");

        // (Twice the share for frost and venom: more often than fire's)
        const many = (blows, kind) => left(blows).filter((each) => each.kind === kind).length;

        assert.ok(many({ venomBlow: 0.2 }, "poison") > many({ fireBlow: 0.2 }, "burn"));
    });

    it("rides on a shot too, and on every blow that lands, never one dodged; never dodged or caught on a shield itself, nor leeched", () => {
        const shots = fight({ fireBlow: 0.4 }, { weapon: "bow", mine: STRONG, ms: 6000 }).landed;

        assert.ok(shots.length >= 2 && shots.every(({ hit, after }) => hit.projectile !== null && after.length === 1 && after[0].attack === "fireBlow" && after[0].projectile === null));

        const slipping = fight({ fireBlow: 0.4 }, { mine: STRONG, ms: 12000, foe: { dodge: 0.45 } });

        assert.ok(slipping.events.some(({ type, id }) => type === "dodged" && id === "foe"));
        assert.ok(slipping.landed.length >= 2 && slipping.landed.every(({ after }) => after.length === 1));

        const shielded = fight({ fireBlow: 0.4 }, { mine: STRONG, ms: 6000, foe: { shield: { chance: 1, share: 0.5 } } });
        const blocks = shielded.events.filter(({ type }) => type === "blocked");

        assert.ok(blocks.length >= 2);
        assert.equal(blocks.length, shielded.landed.length, "(each blow caught; its fire never)");
        assert.ok(shielded.landed.every(({ hit, after }) => after[0].damage === Math.max(1, Math.round(0.4 * hit.damage))), "(of what got through)");

        // (Leeching: of the blow's own harm alone)
        const leeching = fight({ fireBlow: 0.4 }, { mine: { ...STRONG, leech: 0.25, hp: 1 }, ms: 3000 });
        const [first] = leeching.landed;
        const healed = leeching.events.find(({ type, attack }) => type === "healed" && attack === "leech");

        assert.equal(healed.amount, Math.round(first.hit.damage * 0.25));
        assert.equal(healed.time, first.hit.time);
    });

    it("is a weapon's alone: never on a spell", () => {
        const { battle, events } = fight({ fireBlow: 0.4 }, { engage: false, ms: 0 });

        battle.cast("player", "hurt", "foe");

        for (let t = 0; t < 4000; t += STEP_MS) {
            events.push(...battle.advance(STEP_MS));
        }

        const spelled = landedOf(events).filter(({ hit }) => hit.spell === "hurt");

        assert.equal(spelled.length, 1, "(the spell landed)");
        assert.deepEqual(spelled[0].after, []);
    });

    it("never touches one on horseback: the horse takes the blow, as it does now", () => {
        // (Shot at from out of the rider's reach, up in the saddle: they'd get down to fight one in it)
        const saddled = (each) => {
            each.mount("foe", HORSE, { hp: 100000, maxHp: 100000 });

            for (let t = 0; t < 10000 && each.actor("foe").mount.phase !== "riding"; t += STEP_MS) {
                each.advance(STEP_MS);
            }
        };
        const { events, landed, battle } = fight({ fireBlow: 0.4, acidBlow: 0.4 }, { weapon: "bow", mine: STRONG, ms: 6000, foe: { kind: "player", weapon: "sword", hp: null }, before: saddled });

        assert.ok(landed.length >= 2 && landed.every(({ hit, after }) => hit.mount && !after.length), JSON.stringify(landed.slice(0, 2)));
        assert.ok(!events.some(({ type, attack }) => type === "hit" && BLOWS.includes(attack)));
        assert.equal(battle.actor("foe").hp, battle.actor("foe").maxHp, "(nothing of it touched the rider)");
    });

    it("fells the foe if it's the last of its hit points; a foe the blow itself fells takes none of it", () => {
        // (Its armour taking all but a point off the blow: the fire the last of it)
        const felled = fight({ fireBlow: 0.1, frostBlow: 0.4 }, { ms: 3000, foe: { hp: 2, armor: 0.99 } });
        const deaths = felled.events.filter(({ type, id }) => type === "death" && id === "foe");

        assert.equal(felled.landed[0].hit.damage, 1);
        assert.deepEqual(felled.landed[0].after.map(({ attack, damage, hp }) => [attack, damage, hp]), [["fireBlow", 1, 0]], "(frost not on a fallen foe)");
        assert.equal(deaths.length, 1);
        assert.equal(deaths[0].by, "player");
        assert.ok(felled.events.indexOf(deaths[0]) > felled.events.indexOf(felled.landed[0].after[0]));
        assert.ok(!felled.events.some(({ type, id }) => type === "afflicted" && id === "foe"));

        const outright = fight({ fireBlow: 0.4 }, { ms: 3000, foe: { hp: 1 } });

        assert.equal(outright.landed.length, 1);
        assert.deepEqual(outright.landed[0].after, []);
    });

    it("burns a boss that regrows its hurts with fire's, as a fire spell does; frost's doesn't", () => {
        const boss = { wild: { creature: "troll", tier: 5, fight: { phases: [{ regrow: { share: 0.01, stop: 5000 } }] } } };
        const fiery = fight({ fireBlow: 0.2 }, { ms: 3000, foe: structuredClone(boss) });
        const frosty = fight({ frostBlow: 0.2 }, { ms: 3000, foe: structuredClone(boss) });
        const plain = fight(null, { ms: 3000, foe: structuredClone(boss) });

        assert.equal(fiery.battle.actor("foe").burntAt, fiery.landed.at(-1).after[0].time);
        assert.equal(frosty.battle.actor("foe").burntAt, undefined);
        assert.equal(plain.battle.actor("foe").burntAt, undefined);
    });

    it("comes to nothing with none on the striker: the fight as it was", () => {
        const plain = fight(null, { ms: 6000 });
        const none = fight({}, { ms: 6000 });

        assert.deepEqual(none.events, plain.events);
        assert.ok(plain.landed.every(({ after }) => !after.length));
    });
});

// ---- The host's crafters ----------------------------------------------------------------------

// A world (seed 2) with its player in it, carrying `pack` and `gold`, by the home tavern's barkeep,
// who for the test keeps a crafter's shop (`shop`: as stock.test.js has her keep others); the orc
// out of the way. What the crafter would ask for a piece (`shown`), and the three commands
function atCrafter(shop, { pack = [], gold = 0, skills = {}, gear = { mainHand: { id: "sword" } } } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold, pack, skills, gear } });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    return crafterIn(host, host.battle.actor(host.world.folk.find(({ role }) => role === "barkeep").id), shop);
}

// The player beside one of the folk keeping a shop (`keeper`), kept as a crafter's (`shop`, if
// given), and what they'd do there (atCrafter)
function crafterIn(host, keeper, shop = null, { capital = false } = {}) {
    const me = host.battle.actor(HOST_PLAYER);
    const player = host.players.get(HOST_PLAYER);

    if (shop) {
        host.folk.get(keeper.id).shop = shop;
    }

    const kept = () => host.folk.get(keeper.id).shop;

    put(me, keeper.map, [keeper.square[0], keeper.square[1] + 1]);

    const shown = (base, using) => previewOf(kept(), base, using, { level: host.mightFor(HOST_PLAYER), haggle: player.progress.bonuses().haggle, capital });

    return {
        host,
        keeper,
        me,
        player,
        shown,
        craft: (base, using, more = {}) => host.command(HOST_PLAYER, { type: "craft", from: keeper.id, base, using, fee: shown(base, using).fee, ...more }),
        salvage: (index, count = 1, more = {}) => host.command(HOST_PLAYER, { type: "salvage", from: keeper.id, index, count, ...more }),
        salvageJunk: (count = junkSalvage(player.progress.pack, kept(), { capital }).count, more = {}) => host.command(HOST_PLAYER, { type: "salvageJunk", from: keeper.id, count, ...more }),
    };
}

const DEMON_SWORD = ["ironIngot", "tannedLeather", "demonHorn"];

describe("making a piece at a crafter's (host.js #craft)", () => {
    it("takes what it's made of from the pack, makes it with the world's dice as it was shown, puts it in, takes the fee and grows the Trade skill by it; told", () => {
        const at = atCrafter("swordsmith", { pack: [stack("ironIngot", 3), stack("tannedLeather"), stack("demonHorn"), stack("potion", 2)], gold: 100, skills: { trade: 0 } });
        const { host, player, keeper } = at;
        const shown = at.shown("sword", DEMON_SWORD);
        const dice = host.random.state;
        const trade = player.progress.skills.trade;

        assert.equal(shown.reason, null);
        assert.equal(shown.fee, 15);

        const result = at.craft("sword", DEMON_SWORD);
        const events = run(host, STEP_MS);

        // (The same piece as its rules make with the same dice)
        const twin = createRandom(1);

        twin.state = dice;

        const expected = thingOf(craftItem("sword", DEMON_SWORD, twin, { level: host.mightFor(HOST_PLAYER), people: "human" }));

        assert.deepEqual(result, { ok: true, item: expected, fee: 15 });
        assert.equal(expected.name, "Iron Demon Sword");
        assert.ok(expected.bonuses.fireBlow > 0 && expected.bonuses.hp > 0, JSON.stringify(expected));
        assert.equal(expected.quality, shown.make);
        assert.deepEqual(laid(player.progress.pack), [[0, "ironIngot", 2, false], [1, "sword", 1, false], [3, "potion", 2, false]]);
        assert.deepEqual(player.progress.pack[1], { ...expected, count: 1 });
        assert.equal(player.progress.gold, 85);
        assert.equal(player.progress.skills.trade, Math.round((trade + 15 * 0.5) * 10) / 10, "(half a point a gold piece, as buying grows it)");

        const told = events.filter(({ type }) => type === "crafted");

        assert.equal(told.length, 1);
        assert.deepEqual((({ id, item, fee, from, used }) => ({ id, item, fee, from, used }))(told[0]), { id: HOST_PLAYER, item: expected, fee: 15, from: keeper.id, used: [{ id: "ironIngot", count: 1 }, { id: "tannedLeather", count: 1 }, { id: "demonHorn", count: 1 }] });

        // (Without the essence, the same of the rest; and with none of it, refused)
        assert.equal(at.craft("sword", ["ironIngot", "tannedLeather", null]).reason, "lacking");
        assert.equal(at.craft("sword", ["ironIngot", "tannedLeather"]).reason, "lacking", "(the essence left off the end)");
    });

    it("takes the junk first: a stack marked as junk before one that isn't, then the smallest; never the stash's", () => {
        const pack = [stack("tannedLeather", 3), stack("ironIngot", 2), junk("tannedLeather", 1), stack("ironIngot", 1), null, junk("ironIngot", 1)];

        assert.deepEqual(takesFrom(pack, "plate", ["ironIngot", "tannedLeather", null]), [{ index: 5, count: 1 }, { index: 3, count: 1 }, { index: 1, count: 1 }, { index: 2, count: 1 }]);
        assert.equal(takesFrom(pack, "plate", ["ironIngot", "tannedLeather", "demonHorn"]), null);

        const at = atCrafter("smith", { pack, gold: 500 });

        assert.equal(at.craft("plate", ["ironIngot", "tannedLeather", null]).ok, true);
        assert.deepEqual(laid(at.player.progress.pack), [[0, "tannedLeather", 3, false], [1, "ironIngot", 1, false], [2, "plate", 1, false]]);

        // (What's in the stash isn't carried)
        at.player.progress.strongroom.tabs[0][0] = stack("demonHorn", 5);
        at.player.progress.pack[3] = stack("ironIngot");
        assert.deepEqual(at.craft("sword", DEMON_SWORD), { ok: false, reason: "lacking" });
        assert.deepEqual(at.player.progress.strongroom.tabs[0][0], stack("demonHorn", 5));
    });

    it("refuses in the doc's order, saying why, nothing changed: dead, far, command, uncrafted, unfit, unworked, lacking, craftChanged, gold, full", () => {
        const at = atCrafter("smith", { pack: [stack("ironIngot", 3), stack("tannedLeather", 2), stack("demonHorn"), stack("mythrilIngot"), stack("wyvernScale")], gold: 20 });
        const { host, me, player, keeper } = at;
        const was = JSON.stringify(player.progress.toJSON());
        const fee = at.shown("sword", DEMON_SWORD).fee;
        const ask = (more) => host.command(HOST_PLAYER, { type: "craft", from: keeper.id, base: "sword", using: DEMON_SWORD, fee, ...more });

        // (Dead, and far besides)
        me.dead = true;
        assert.deepEqual(ask({ from: "nobody" }), { ok: false, reason: "dead" });
        me.dead = false;

        // (Far, and nothing that can be done besides)
        assert.deepEqual(ask({ from: "nobody", base: 3 }), { ok: false, reason: "far" });

        const at0 = [...me.square];

        put(me, keeper.map, [at0[0] + 6, at0[1] + 6]);
        assert.deepEqual(ask({}), { ok: false, reason: "far" });
        put(me, keeper.map, at0);

        // (Not as a command should be: and every reason after it besides)
        for (const more of [{ base: 3 }, { base: null }, { using: "ironIngot" }, { using: [1, null] }, { using: [{}, "tannedLeather"] }, { fee: "15" }, { fee: 1.5 }, { fee: null }, { base: "plate", fee: 1.5 }]) {
            assert.deepEqual(ask(more), { ok: false, reason: "command" }, JSON.stringify(more));
        }

        // (What it doesn't make; a tavern makes nothing)
        assert.deepEqual(ask({ base: "wand", using: ["birchWood", "quartz", null] }), { ok: false, reason: "uncrafted" });
        assert.deepEqual(ask({ base: "constructor" }), { ok: false, reason: "uncrafted" });
        host.folk.get(keeper.id).shop = "tavern";
        assert.deepEqual(ask({}), { ok: false, reason: "uncrafted" });
        host.folk.get(keeper.id).shop = "smith";

        // (Not of its slot's kind, or one left out that can't be; and finer than a smithy works)
        assert.deepEqual(ask({ using: ["oakWood", "tannedLeather", null] }), { ok: false, reason: "unfit" });
        assert.deepEqual(ask({ using: ["ironIngot", null, "demonHorn"] }), { ok: false, reason: "unfit" });
        assert.deepEqual(ask({ using: ["mythrilIngot", "wyvernScale", null], fee: 1 }), { ok: false, reason: "unworked" });

        // (Not carried: before what it costs)
        assert.deepEqual(ask({ using: ["ironIngot", "tannedLeather", "dragonHeart"], fee: 1 }), { ok: false, reason: "lacking" });
        assert.deepEqual(ask({ base: "greatsword", using: ["mythrilIngot", "tannedLeather", null], fee: 1 }), { ok: false, reason: "unworked" });
        assert.deepEqual(ask({ base: "towerShield", using: ["ironIngot", "oakWood", null], fee: 1 }), { ok: false, reason: "lacking" });

        // (Not what it comes to now: the player shown another fee, or since grown mightier)
        assert.deepEqual(ask({ fee: fee + 1 }), { ok: false, reason: "craftChanged" });
        assert.deepEqual(ask({ fee: fee - 1 }), { ok: false, reason: "craftChanged" });

        // (Not enough gold: a dearer piece)
        assert.deepEqual(ask({ base: "plate", using: ["ironIngot", "tannedLeather", "demonHorn"], fee: at.shown("plate", ["ironIngot", "tannedLeather", "demonHorn"]).fee }), { ok: false, reason: "gold" });
        assert.equal(JSON.stringify(player.progress.toJSON()), was);

        // (No room for what's made: nothing of what it took freeing a place)
        player.progress.pack = brimming(stack("ironIngot", 3), stack("tannedLeather", 2), stack("demonHorn", 2));

        const full = JSON.stringify(player.progress.toJSON());

        assert.deepEqual(ask({}), { ok: false, reason: "full" });
        assert.equal(JSON.stringify(player.progress.toJSON()), full, "(the pack and the gold as they were)");

        // (Every reason the host gives for crafting its own words, crafting.js's)
        for (const [reason, words] of Object.entries(CRAFT_REFUSALS)) {
            assert.equal(REFUSALS[reason], words, reason);
        }
    });

    it("is all of it or nothing: should any of it fail, the pack and the gold are as they were", () => {
        const at = atCrafter("swordsmith", { pack: [stack("ironIngot", 3), stack("tannedLeather"), stack("demonHorn")], gold: 100 });
        const { player } = at;
        const was = JSON.stringify(player.progress.toJSON());
        const take = player.progress.take.bind(player.progress);
        let calls = 0;

        // (The second ingredient can't be taken: refused, the first given back)
        player.progress.take = (index, count) => (++calls === 2 ? null : take(index, count));
        assert.deepEqual(at.craft("sword", DEMON_SWORD), { ok: false, reason: "lacking" });
        assert.equal(JSON.stringify(player.progress.toJSON()), was);

        // (Or it fails outright: refused, all as it was)
        calls = 0;
        player.progress.take = (index, count) => {
            if (++calls === 3) {
                throw new Error("a failure");
            }

            return take(index, count);
        };
        assert.deepEqual(quietly(() => at.craft("sword", DEMON_SWORD)), { ok: false, reason: "command" });
        assert.equal(JSON.stringify(player.progress.toJSON()), was);

        // (Or the piece won't go in)
        player.progress.take = take;
        player.progress.stow = () => false;
        assert.deepEqual(at.craft("sword", DEMON_SWORD), { ok: false, reason: "full" });
        assert.equal(JSON.stringify(player.progress.toJSON()), was);
    });

    it("is done at every crafter there is: each makes what it makes and breaks it down, and a crafter to come as well, as the host's shops have it", () => {
        const at = atCrafter("smith", { gold: 100000 });
        const { host, keeper, player } = at;

        for (const shop of Object.keys(CRAFTERS)) {
            host.folk.get(keeper.id).shop = shop;

            // (Its first recipe, of the commonest of what goes with it, a rat's tail its essence)
            const [{ base, main }] = recipesAt(shop);
            const using = [main, ingredientsOf(RECIPES[base].slots[1].kind)[0], "ratTail"];

            player.progress.pack = [stack(main, 3), stack(using[1]), stack("ratTail")];

            const made = at.craft(base, using);

            assert.equal(made.ok, true, `${shop}: ${base} of ${using} (${made.reason})`);
            assert.equal(made.item.id, base);

            const index = player.progress.pack.findIndex((each) => each?.id === base);

            assert.deepEqual(at.salvage(index), { ok: true, count: 1, yields: salvageOf(made.item) }, `${shop}: ${base} broken down`);
        }
    });

    it("ends the crafter's customer's Invisibility, as buying does: it's trade", () => {
        const at = atCrafter("swordsmith", { pack: [stack("ironIngot", 3), stack("tannedLeather"), stack("sword", 2), junk("axe")], gold: 100 });
        const { host, me } = at;
        const hidden = () => host.battle.buff(me.id, "invisibility", { ms: 60000 });

        for (const done of [() => at.craft("sword", ["ironIngot", "tannedLeather", null]), () => at.salvage(2), () => at.salvageJunk()]) {
            hidden();
            assert.ok(host.battle.buffOf(me, "invisibility"));
            assert.equal(done().ok, true);
            assert.equal(host.battle.buffOf(me, "invisibility"), null);
        }
    });
});

describe("breaking gear down at a crafter's (host.js #salvage, #salvageJunk)", () => {
    it("breaks down so many of a stack, giving back its main material's kind and make, more for more of it; what's left of a junk stack still junk, what comes back not; told", () => {
        const at = atCrafter("armorer", { pack: [junk("plate", 3, "fine"), stack("helm", 1, "masterwork"), stack("steelIngot", 1)] });
        const { host, player, keeper } = at;

        assert.deepEqual(at.salvage(0, 2), { ok: true, count: 2, yields: [{ id: "steelIngot", count: 4 }] });

        const events = run(host, STEP_MS);

        assert.deepEqual(laid(player.progress.pack), [[0, "plate", 1, true], [1, "helm", 1, false], [2, "steelIngot", 5, false]]);
        assert.deepEqual(at.salvage(1), { ok: true, count: 1, yields: [{ id: "blackSteelIngot", count: 1 }] });
        assert.deepEqual(laid(player.progress.pack), [[0, "plate", 1, true], [1, "blackSteelIngot", 1, false], [2, "steelIngot", 5, false]]);

        const told = events.filter(({ type }) => type === "brokenDown");

        assert.equal(told.length, 1);
        assert.deepEqual((({ id, items, yields, from, junk: all }) => ({ id, items, yields, from, junk: all }))(told[0]), { id: HOST_PLAYER, items: [{ id: "plate", quality: "fine", count: 2 }], yields: [{ id: "steelIngot", count: 4 }], from: keeper.id, junk: undefined });
        assert.equal(player.progress.gold, 0, "(no fee)");
    });

    it("refuses in the doc's order, nothing changed: dead, far, command, item, count, bound, unsalvaged, full", () => {
        const greenbrand = makeUnique("greenbrand", 20, createRandom(5));
        const at = atCrafter("swordsmith", { pack: [stack("sword", 2, "fine"), { ...thingOf(greenbrand), count: 1 }, stack("plate"), stack("sword", 1, "legendary"), stack("potion")] });
        const { host, me, player, keeper } = at;
        const was = JSON.stringify(player.progress.toJSON());

        me.dead = true;
        assert.deepEqual(at.salvage(0, 1, { from: "nobody" }), { ok: false, reason: "dead" });
        me.dead = false;
        assert.deepEqual(at.salvage(0, 1, { from: "nobody", count: "1" }), { ok: false, reason: "far" });

        for (const count of ["1", 1.5, null, undefined]) {
            assert.deepEqual(host.command(HOST_PLAYER, { type: "salvage", from: keeper.id, index: 0, count }), { ok: false, reason: "command" }, String(count));
        }

        for (const index of [7, -1, 40, 1.5, "0", null, "constructor"]) {
            assert.deepEqual(at.salvage(index), { ok: false, reason: "item" }, String(index));
        }

        assert.deepEqual(at.salvage(0, 3), { ok: false, reason: "count" });
        assert.deepEqual(at.salvage(0, 0), { ok: false, reason: "count" });
        assert.deepEqual(at.salvage(1), { ok: false, reason: "bound" });
        assert.deepEqual(at.salvage(2), { ok: false, reason: "unsalvaged" }, "(a swordsmith makes no plate)");
        assert.deepEqual(at.salvage(3), { ok: false, reason: "unsalvaged" }, "(finer than it works: a master's)");
        assert.deepEqual(at.salvage(4), { ok: false, reason: "unsalvaged" }, "(no gear)");
        assert.equal(JSON.stringify(player.progress.toJSON()), was);

        // (No room for what comes back: a stack not all broken down, and nowhere else)
        player.progress.pack = brimming(stack("sword", 2));

        const full = JSON.stringify(player.progress.toJSON());

        assert.deepEqual(at.salvage(0, 1), { ok: false, reason: "full" });
        assert.equal(JSON.stringify(player.progress.toJSON()), full);
        assert.deepEqual(at.salvage(0, 2), { ok: true, count: 2, yields: [{ id: "ironIngot", count: 2 }] }, "(all of it: room where it was)");
    });

    it("breaks down all the junk it will at once, as it was shown, the rest still junk; never the stash's, never what's bound", () => {
        const greenbrand = { ...thingOf(makeUnique("greenbrand", 20, createRandom(5))), count: 1, junk: true };
        const pack = [junk("sword", 2, "fine"), stack("sword"), junk("plate"), junk("axe", 1, "masterwork"), junk("potion", 3), greenbrand, junk("sword", 1, "legendary")];

        // (One bound to its hero never junk, and never broken down were it so)
        assert.deepEqual(junkSalvage([greenbrand], "swordsmith", { capital: true }), { salvaged: [], count: 0, yields: [], kept: [], left: 0 });

        const at = atCrafter("swordsmith", { pack });
        const { host, player, keeper } = at;
        const plan = junkSalvage(player.progress.pack, "swordsmith");

        player.progress.strongroom.tabs[0][3] = junk("axe", 2);
        assert.deepEqual([plan.count, plan.left], [3, 2], "(the swords and the axe; the plate and the legendary sword kept)");
        assert.deepEqual(at.salvageJunk(2), { ok: false, reason: "salvageChanged" });
        assert.deepEqual(at.salvageJunk(3), { ok: true, count: 3, yields: [{ id: "steelIngot", count: 2 }, { id: "blackSteelIngot", count: 1 }], left: 2 });

        const events = run(host, STEP_MS);

        assert.deepEqual(laid(player.progress.pack), [[0, "steelIngot", 2, false], [1, "sword", 1, false], [2, "plate", 1, true], [3, "blackSteelIngot", 1, false], [4, "potion", 3, true], [5, "sword", 1, false], [6, "sword", 1, true]]);
        assert.equal(player.progress.pack[5].unique, "greenbrand", "(bound: left as it is, never marked)");
        assert.deepEqual(player.progress.strongroom.tabs[0][3], junk("axe", 2), "(never the stash's)");

        const [told] = events.filter(({ type }) => type === "brokenDown");

        assert.deepEqual((({ id, items, yields, from, junk: all }) => ({ id, items, yields, from, junk: all }))(told), {
            id: HOST_PLAYER,
            items: [
                { id: "sword", quality: "fine", count: 2 },
                { id: "axe", quality: "masterwork", count: 1 },
            ],
            yields: [{ id: "steelIngot", count: 2 }, { id: "blackSteelIngot", count: 1 }],
            from: keeper.id,
            junk: true,
        });

        // (None left it breaks down; none marked at all)
        assert.deepEqual(at.salvageJunk(0), { ok: false, reason: "salvageNone" });
        player.progress.markJunk(2, false);
        player.progress.markJunk(4, false);
        player.progress.markJunk(6, false);
        assert.deepEqual(at.salvageJunk(0), { ok: false, reason: "junkNone" });
    });

    it("refuses breaking down all the junk in the doc's order, and is all of it or nothing", () => {
        const at = atCrafter("smith", { pack: [junk("sword", 2), junk("mace", 1, "fine"), stack("meal")] });
        const { host, me, player, keeper } = at;
        const was = JSON.stringify(player.progress.toJSON());

        me.dead = true;
        assert.deepEqual(at.salvageJunk(3, { from: "nobody" }), { ok: false, reason: "dead" });
        me.dead = false;
        assert.deepEqual(at.salvageJunk("x", { from: "nobody" }), { ok: false, reason: "far" });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "salvageJunk", from: keeper.id }), { ok: false, reason: "command" });
        assert.deepEqual(at.salvageJunk(2.5), { ok: false, reason: "command" });
        host.folk.get(keeper.id).shop = "scriptorium";
        assert.deepEqual(at.salvageJunk(3), { ok: false, reason: "salvageNone" });
        host.folk.get(keeper.id).shop = "smith";
        assert.deepEqual(at.salvageJunk(4), { ok: false, reason: "salvageChanged" });
        assert.equal(JSON.stringify(player.progress.toJSON()), was);

        // (The second stack can't be taken, or what comes back won't go in: as it was)
        const take = player.progress.take.bind(player.progress);
        let calls = 0;

        player.progress.take = (index, count) => (++calls === 2 ? null : take(index, count));
        assert.deepEqual(at.salvageJunk(3), { ok: false, reason: "count" });
        assert.equal(JSON.stringify(player.progress.toJSON()), was);
        player.progress.take = take;

        const stow = player.progress.stow.bind(player.progress);

        player.progress.stow = (item, count) => (item.id === "steelIngot" ? false : stow(item, count));
        assert.deepEqual(at.salvageJunk(3), { ok: false, reason: "full" });
        assert.equal(JSON.stringify(player.progress.toJSON()), was);
        player.progress.stow = stow;

        assert.deepEqual(at.salvageJunk(3), { ok: true, count: 3, yields: [{ id: "ironIngot", count: 2 }, { id: "steelIngot", count: 1 }], left: 0 });
    });
});

describe("a capital's crafters, to the legendary (the owner's ruling: recipes.js CAPITAL_BEST)", () => {
    it("has every crafter in a capital work to the legendary, in its rules: what it lists, makes, shows and breaks down", () => {
        assert.equal(CAPITAL_BEST, "legendary");

        const orichalcum = ["orichalcumIngot", "dragonScale", null];

        for (const shop of Object.keys(CRAFTERS)) {
            const listed = recipesAt(shop, { capital: true });
            const key = ({ base, main }) => `${base}|${main}`;

            assert.ok(recipesAt(shop).every((each) => listed.some((one) => key(one) === key(each))), `${shop}: all it lists elsewhere`);
            assert.ok(CRAFTERS[shop].makes.every((base) => listed.some((each) => each.base === base && each.make === "legendary")), `${shop} works the legendary in a capital`);
            assert.equal(listed.length > recipesAt(shop).length, CRAFTERS[shop].best !== "legendary", `${shop}: a master's the same anywhere`);
        }

        assert.equal(craftRefusal("smith", "sword", orichalcum), "unworked");
        assert.equal(craftRefusal("smith", "sword", orichalcum, { capital: true }), null);
        assert.equal(previewOf("swordsmith", "sword", orichalcum, { level: 30, capital: true }).make, "legendary");
        assert.equal(previewOf("swordsmith", "sword", orichalcum, { level: 30 }).reason, "unworked");
        assert.ok(salvagesAt("smith", { id: "sword", quality: "legendary" }, { capital: true }));
        assert.ok(!salvagesAt("smith", { id: "sword", quality: "legendary" }));
        assert.ok(!salvagesAt("smith", { id: "sword", quality: "legendary", unique: "greenbrand" }, { capital: true }), "(never what's bound)");
        assert.ok(!salvagesAt("smith", { id: "wand", quality: "common" }, { capital: true }), "(nor what it doesn't make)");
        assert.equal(junkSalvage([junk("sword", 1, "legendary")], "smith", { capital: true }).count, 1);
        assert.equal(junkSalvage([junk("sword", 1, "legendary")], "smith").count, 0);
    });

    it("has the host know a capital's crafter by their building's settlement: there legendary, at home not", () => {
        const at = atCrafter("swordsmith", { pack: [stack("orichalcumIngot", 2), stack("dragonScale", 2), stack("sword", 1, "legendary")], gold: 100000 });
        const { host, me, player } = at;
        const orichalcum = ["orichalcumIngot", "dragonScale", null];

        // (At home, a town: no finer than the very rare)
        assert.deepEqual(at.craft("sword", orichalcum, { fee: 1 }), { ok: false, reason: "unworked" });
        assert.deepEqual(at.salvage(2), { ok: false, reason: "unsalvaged" });

        // (Into the people's capital's swordsmith, across its counter from its keeper)
        const place = host.world.plan.places.find(({ kind, race }) => kind === "capital" && race === "human");

        host.world.maps.town.settlements.of(place);

        const shop = [...host.world.interiors.buildings.values()].find((building) => building.place === place.id && building.kind === "swordsmith");

        put(me, "town", shop.door.ends[0].arrive);
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: shop.door.id }).ok, true);
        run(host, 4000);
        assert.equal(me.map, shop.maps[0]);

        const there = crafterIn(host, host.battle.actor(`${shop.key}/keeper`), null, { capital: true });
        const shown = there.shown("sword", orichalcum);

        // (The one rule, the pack's too: core/crafting.js inCapital, of the world as every copy has
        // it; the home town's smithy and the town itself, not)
        const home = [...host.world.interiors.buildings.values()].find((building) => building.place === "home" && building.kind === "swordsmith");

        assert.equal(inCapital(host.world, shop.maps[0]), true);
        assert.equal(inCapital(host.world, home.maps[0]), false);
        assert.equal(inCapital(host.world, "town"), false);
        assert.equal(inCapital(host.world, null), false);

        assert.equal(shown.make, "legendary");
        assert.equal(shown.effect, "earthsunder");

        const made = there.craft("sword", orichalcum);

        assert.equal(made.ok, true, made.reason);
        assert.equal(made.item.quality, "legendary");
        assert.equal(made.item.name, "Orichalcum Sword");
        assert.deepEqual(there.salvage(player.progress.pack.findIndex((each) => each?.quality === "legendary" && !each.name)), { ok: true, count: 1, yields: [{ id: "orichalcumIngot", count: 1 }] });
    });
});

describe("a hero's blows in the host (#outfit), kept and carried on", () => {
    it("grows what the blow it rides on grows: a bow's shot's fire Marksman, never Blade; a sword's fire Blade (host.js #learn)", () => {
        for (const [weapon, grows, not] of [
            ["bow", "marksman", "blade"],
            ["sword", "blade", "marksman"],
        ]) {
            const at = atCrafter("smith", { gear: { mainHand: thingOf({ id: weapon, bonuses: { fireBlow: 0.4 } }) }, skills: { blade: 0, marksman: 0 } });
            const { host, me, player } = at;
            const orc = host.battle.actor("orc");

            assert.deepEqual(me.blows, { fireBlow: 0.4 }, weapon);
            Object.assign(orc, { dead: false, hp: 100000, maxHp: 100000, respawnAt: 0 });
            put(orc, "town", [5200, 6600]);
            put(me, "town", [weapon === "bow" ? 5204 : 5201, 6600]);
            Object.assign(me, { hp: 100000, maxHp: 100000 });
            assert.equal(host.command(HOST_PLAYER, { type: "engage", target: "orc" }).ok, true);

            const fired = run(host, 8000).filter(({ type, attack, by }) => type === "hit" && attack === "fireBlow" && by === HOST_PLAYER);

            assert.ok(fired.length >= 2 && fired.every(({ projectile }) => projectile === null), `${weapon}: ${fired.length} hits of fire`);
            assert.ok(player.progress.skills[grows] > 0, `${weapon} grows ${grows}`);
            assert.equal(player.progress.skills[not], 0, `${weapon} never grows ${not}`);
        }
    });

    it("puts the crafted weapon's blows on its wielder as they put it on, each no more than the cap, and none as they take it off", () => {
        const sword = thingOf(craftItem("sword", ["adamantiteIngot", "wyvernScale", "demonHorn"], createRandom(7), { level: 60 }));
        const at = atCrafter("smith", { pack: [{ ...sword, count: 1 }, { ...thingOf({ id: "quiver", bonuses: { fireBlow: 0.35 } }), count: 1 }, { ...thingOf({ id: "bow", bonuses: { fireBlow: 0.3 } }), count: 1 }] });
        const { host, me } = at;

        assert.equal(me.blows, undefined);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: 0 }), { ok: true });
        assert.deepEqual(me.blows, { stormBlow: sword.bonuses.stormBlow, fireBlow: sword.bonuses.fireBlow });

        // (A bow and its quiver: their fire together, held to the cap)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: 2 }), { ok: true });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: at.player.progress.pack.findIndex((each) => each?.id === "quiver") }), { ok: true });
        assert.deepEqual(me.blows, { fireBlow: BLOW_CAP });

        const empty = at.player.progress.pack.indexOf(null);

        assert.deepEqual(host.command(HOST_PLAYER, { type: "unequip", slot: "offHand", to: empty }), { ok: true });
        assert.deepEqual(me.blows, { fireBlow: 0.3 });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: at.player.progress.pack.findIndex((each) => each?.name === sword.name) }), { ok: true });
        assert.deepEqual(me.blows, { stormBlow: sword.bonuses.stormBlow, fireBlow: sword.bonuses.fireBlow });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "equip", index: at.player.progress.pack.findIndex((each) => each?.id === "sword" && !each.name) }), { ok: true });
        assert.equal(me.blows, undefined, "(a plain sword: none, nothing kept)");
    });

    it("comes back in a world carried on from a snapshot as it was, the crafted gear with it; SNAPSHOT_VERSION as it was", () => {
        const sword = thingOf(craftItem("axe", ["steelIngot", "oakWood", "frostHeart"], createRandom(4), { level: 20 }));
        const at = atCrafter("smith", { pack: [{ ...sword, count: 1 }, stack("ironIngot", 2), junk("mace")] });
        const { host } = at;

        host.command(HOST_PLAYER, { type: "equip", index: 0 });

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual(again.battle.actor(HOST_PLAYER).blows, { frostBlow: sword.bonuses.frostBlow });
        assert.deepEqual(again.players.get(HOST_PLAYER).progress.gear.mainHand, at.player.progress.gear.mainHand);
        assert.equal(again.checksum(), host.checksum());
        assert.equal(SNAPSHOT_VERSION, 56, "(what's made is gear as it's kept, its new bonuses kept only where they're set: no step; 56 is a dungeon's run kept by its site and its making, the scaling plan's 2-19; 55 is the rules a shared world changes, the plan's 2-1)");
    });
});

describe("crafting on a joined player's copy of the world (NET_VERSION 231)", () => {
    it("makes, breaks down and fights with what's made on every copy alike, never astray", () => {
        const at = atCrafter("swordsmith", { gold: 0 });
        const { host, keeper } = at;
        const post = [];
        const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
        const joining = new Joining({ send: (text) => post.push({ from: "peer", text }) });
        const deliver = () => {
            while (post.length) {
                const { from, text } = post.shift();

                if (from) {
                    hosting.hear(from, text);
                } else {
                    joining.hear(text);
                }
            }
        };
        let astray = 0;
        const fought = [];
        const play = (steps) => {
            for (let step = 0; step < steps; step++) {
                fought.push(...host.advance(STEP_MS));
                hosting.flush();
                deliver();

                while (joining.step()) {
                    // (every step it's been sent)
                }

                astray += joining.astray ? 1 : 0;
                deliver();
            }
        };

        assert.equal(NET_VERSION, 259, "259 musters, the `squad` command's `gather` and a squad's `gathering` (the plan's 2-30), 258 a chat line to the squad, a chat line's `squad` (the plan's 2-29), 257 squads of parties, the `squad` command (the plan's 2-28), 256 the chat's area channel, a chat line's `area` (the plan's 2-27), 255 a thread's changes lasting three world days and the thread begun again in a world shared by strangers (the plan's 2-26), 254 a unique each character's to overcome in a world shared by strangers (the plan's 2-25), 253 a run's sealed rooms let go of with it and the Great Bell tolling for a keep's run (the plan's 2-24), 252 a thread's slay step paid to those in the run its master fell in (the plan's 2-23), 251 the world's cap on runs counting those with players in them alone, 250 the caps on runs and a dungeon's hoard in full once a world day (the plan's 2-22), 249 a run of each dungeon for each party in a world shared by strangers (the plan's 2-21), 248 a dungeon's run kept by its site and its making, a snapshot's shape (the plan's 2-19), 247 an area's director a world's rule (the plan's 2-18), 246 a crowd's followers a world's rule (the plan's 2-17), 245 a crowd's answer a world's rule (the plan's 2-16), 244 a pack reinforced by who tags it where loot is by tags (the plan's 2-15), 243 medals on leaders where loot is by tags (the plan's 2-14), 242 loot by tags a world's rule, and one fallen with a tag paid in any world (the plan's 2-13), 241 the tag ledger kept on the wild's and raiders (the plan's 2-11), 240 a shout heard by every player near, and turned off (the plan's 2-9), 239 a world's away marks its rule, and no one marked away counted in a fight or its spoils (the plan's 2-8), 238 no rest passing a world's time with others in it, no pause for everyone, and a keeper's notice of stopping (the plan's 2-5 to 2-7), 237 duels, and players fighting only by them where the rules say (the plan's 2-2 and 2-3), 236 the rules a shared world changes, kept with every world (the plan's 2-1), 235 an ahead order looked along a leg at a time (docs/WAR.md, the plan's 3-29), 230 junk's, 231 crafting's (docs/CRAFTING.md), 232 mercenaries never lost (docs/WAR.md), 233 a player's far way waiting (docs/WORLD.md), 234 insides drawn by their slots (insides.js INSIDE_SLOTS)");
        joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
        joining.hello({ hero: { ...HERO, name: "Bryn", race: "human" }, progress: { gold: 200, pack: [stack("ironIngot", 2), stack("tannedLeather"), stack("demonHorn"), stack("sword", 2), junk("axe", 1, "fine"), junk("potion")] } });
        deliver();
        play(20);
        assert.ok(joining.host && joining.me, "(the copy made)");

        // (The one who joined stood by the barkeep, a swordsmith for the test, in every copy)
        for (const each of [host, joining.host]) {
            each.folk.get(keeper.id).shop = "swordsmith";
            put(each.battle.actor(joining.me), keeper.map, [keeper.square[0] - 1, keeper.square[1] + 1]);
        }

        const theirs = () => joining.host.players.get(joining.me).progress;
        const fee = previewOf("swordsmith", "sword", DEMON_SWORD, { level: joining.host.mightFor(joining.me), haggle: theirs().bonuses().haggle }).fee;
        const heard = [];

        joining.command({ type: "craft", from: keeper.id, base: "sword", using: DEMON_SWORD, fee }, (result) => heard.push(result));
        deliver();
        play(4);
        joining.command({ type: "salvage", from: keeper.id, index: 3, count: 1 }, (result) => heard.push(result));
        deliver();
        play(4);
        joining.command({ type: "salvageJunk", from: keeper.id, count: 1 }, (result) => heard.push(result));
        deliver();
        play(4);

        const made = heard[0].item;

        assert.equal(heard[0].ok, true, JSON.stringify(heard[0]));
        assert.ok(made.bonuses.fireBlow > 0);
        assert.deepEqual(heard.slice(1), [
            { ok: true, count: 1, yields: [{ id: "ironIngot", count: 1 }] },
            { ok: true, count: 1, yields: [{ id: "steelIngot", count: 1 }], left: 0 },
        ]);
        assert.equal(encode(theirs().toJSON()), encode(host.players.get(joining.me).progress.toJSON()));
        assert.equal(theirs().gold, 200 - fee);

        // (What's made in hand, and set on the orc out in the town, in every copy)
        joining.command({ type: "equip", index: theirs().pack.findIndex((each) => each?.name === made.name) }, (result) => heard.push(result));
        deliver();
        play(4);

        for (const each of [host, joining.host]) {
            const orc = each.battle.actor("orc");
            const one = each.battle.actor(joining.me);

            Object.assign(orc, { dead: false, hp: 100000, maxHp: 100000, respawnAt: 0 });
            put(orc, "town", [5200, 6600]);
            put(one, "town", [5201, 6600]);
            Object.assign(one, { hp: 100000, maxHp: 100000 });
            assert.deepEqual(one.blows, { fireBlow: made.bonuses.fireBlow });
        }

        joining.command({ type: "engage", target: "orc" }, (result) => heard.push(result));
        deliver();
        play(120);

        const burnt = fought.filter(({ type, attack, by }) => type === "hit" && attack === "fireBlow" && by === joining.me);

        assert.ok(burnt.length >= 2, `${burnt.length} hits of fire`);
        assert.equal(joining.host.battle.actor("orc").hp, host.battle.actor("orc").hp);
        assert.ok(host.battle.actor("orc").hp < 100000);
        assert.equal(astray, 0, "never astray");
        assert.equal(joining.host.checksum(), host.checksum());
    });
});
