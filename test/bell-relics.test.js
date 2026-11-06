// The mace (core/weapons.js WEAPONS mace, core/gear.js GEAR mace): a one-handed weapon taken with
// a shield, its blows crushing; found, bought and carried by the Order of the Bell's mace-brothers,
// never a hero's to start with. And the Prior of the Bell's own (core/rare.js UNIQUES vespers,
// bulwark: one or the other each time he falls, graded, the finest the rarest): Vespers' toll and
// the Bulwark's knell (core/legendary.js), each a bell rung out, stunning those it catches
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Group } from "three";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { GEAR, offHandFits, rollGear } from "../client/js/core/gear.js";
import { effectAt, EFFECTS, gradeWords, GRADE, rollGrade, WARD_CHARGE } from "../client/js/core/legendary.js";
import { fighterOf } from "../client/js/core/might.js";
import { alike, Progress, SHOPS } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { makeUnique, UNIQUES } from "../client/js/core/rare.js";
import { SPOILS } from "../client/js/core/spoils.js";
import { NATURAL, STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";
import { ITEMS } from "../client/js/characters/equipment.js";
import { buildItem } from "../client/js/characters/items.js";
import { dress, UNIQUE_LOOKS } from "../client/js/characters/liveries.js";
import { REACTIONS } from "../client/js/characters/actions.js";
import { CATALOG } from "../client/js/audio/catalog.js";
import { SOUNDS } from "../client/js/audio/synth.js";
import { KINDS } from "../client/js/world/wounds.js";
import { heroEquipment } from "../client/js/app/game.js";
import { ITEM_ICONS } from "../client/js/app/icons.js";

// An open field `size` squares across
const field = (size) => ({ blocked: Array.from({ length: size }, () => new Uint8Array(size)) });

// How much harm a weapon's first blow does a second, over a fight
const perSecond = (weapon) => {
    const { damage: [least, most], interval } = WEAPONS[weapon].attacks[0];

    return ((least + most) / 2) * (1000 / interval);
};

function play(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

describe("the mace (core/weapons.js, core/gear.js)", () => {
    it("is a one-handed weapon taken with any shield, about a sword's over a fight, a little slower and harder, its blows staggering longer and going partly through armour; no hero's to start with", () => {
        const [mace] = WEAPONS.mace.attacks;
        const [sword] = WEAPONS.sword.attacks;

        assert.equal(GEAR.mace.hands, 1);
        assert.equal(offHandFits("mace", "kiteShield"), null);
        assert.equal(offHandFits("mace", "towerShield"), null);
        assert.ok(!STARTING_WEAPONS.includes("mace"), "(not in the character creator)");
        assert.ok(mace.interval > sword.interval && mace.damage[1] > sword.damage[1]);
        assert.ok(mace.stagger >= sword.stagger * 2);
        assert.equal(mace.crushing, 0.25);
        assert.ok(Math.abs(perSecond("mace") / perSecond("sword") - 1) < 0.15, `${perSecond("mace")} against a sword's ${perSecond("sword")}`);
        assert.equal(mace.reaction, "bludgeon");
        assert.equal(mace.animation, "cleaver", "(swung as a cleaver is, hung at the hip)");
    });

    it("goes a quarter of the way through armour: an armoured foe struck the harder by it than by a blow no different but for that", () => {
        const harm = (crushing) => {
            const battle = new Battle(field(10), { seed: 9 });

            battle.add({ id: "hero", kind: "player", weapon: "mace", team: "hero", square: [4, 4] });
            battle.add({ id: "foe", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 4], ai: "patrol", patrol: [[5, 4], [5, 4]], hp: 1e6, armor: 0.4 });

            const hero = battle.actor("hero");

            hero.arms = hero.arms.map((attack) => ({ ...attack, damage: [10, 10], crushing }));
            battle.command("hero", { type: "engage", target: "foe" });

            return play(battle, 3000).filter(({ type, id, by }) => type === "hit" && id === "foe" && by === "hero").map(({ damage }) => damage);
        };
        const [crushed, plain] = [harm(0.25), harm(0)];

        assert.ok(crushed.length && plain.length);
        assert.ok(crushed.every((damage) => damage === 7), `${crushed}: 10 × (1 − 0.4 × 0.75)`);
        assert.ok(plain.every((damage) => damage === 6), `${plain}: 10 × (1 − 0.4)`);
    });

    it("is found, bought at a smith's and carried by the Order of the Bell's mace-brothers, a morning star in hand", () => {
        assert.ok(SHOPS.smith.items.includes("mace") && SHOPS.swordsmith.items.includes("mace"));
        assert.equal(CREATURES.bellMaceman.weapon, "bellMace");
        assert.ok(NATURAL.bellMace.attacks[0].either.filter(({ reaction }) => reaction === "bludgeon").every(({ crushing }) => crushing === 0.25));
        assert.ok(SPOILS.bellMaceman.items.some(({ id }) => id === "mace"));
        assert.deepEqual(NATURAL.bellMace.equipment, ["mace", "kiteShield"]);
    });

    it("is drawn, held and hung at the hip as a cleaver is, shown in the pack, and heard and felt as its own blow", () => {
        for (const id of ["mace", "vespers", "bulwark"]) {
            const model = buildItem(ITEMS[id].model);

            assert.ok(model instanceof Group && model.children.length > 0, id);
        }

        assert.equal(ITEMS.mace.sheath.socket, "leftFrog");
        assert.equal(ITEMS.vespers.slot, "mainHand");
        assert.equal(ITEMS.bulwark.slot, "offHand");
        assert.ok(ITEM_ICONS.mace);
        assert.ok(REACTIONS.bludgeon && SOUNDS.bludgeon && CATALOG.bludgeon && KINDS.bludgeon);
    });
});

describe("the Prior of the Bell's own (core/rare.js UNIQUES vespers, bulwark; core/legendary.js toll, knell)", () => {
    it("are his mace and his shield, each a unique of its own, graded as it's made, the finest the rarest", () => {
        assert.deepEqual(SPOILS.priorVane.uniques, ["vespers", "bulwark"]);
        assert.deepEqual([UNIQUES.vespers.base, UNIQUES.vespers.effect], ["mace", "toll"]);
        assert.deepEqual([UNIQUES.bulwark.base, UNIQUES.bulwark.effect], ["kiteShield", "knell"]);
        assert.ok(UNIQUES.vespers.graded && UNIQUES.bulwark.graded);

        const random = createRandom(11);
        const made = Array.from({ length: 400 }, (each, k) => makeUnique(k % 2 ? "vespers" : "bulwark", 40, random));

        assert.ok(made.every((item) => item.quality === "legendary" && Number.isFinite(item.grade) && item.grade >= 0 && item.grade <= 1));
        assert.ok(made.every((item) => item.name === UNIQUES[item.unique].name && item.effect === UNIQUES[item.unique].effect));

        // (The finest the rarest: about one in twelve in the top fifth, one in twenty-five in the top tenth)
        const grades = Array.from({ length: 20000 }, () => rollGrade(random));
        const share = (least) => grades.filter((grade) => grade >= least).length / grades.length;

        assert.ok(share(0.8) > 0.06 && share(0.8) < 0.11, `${share(0.8)}`);
        assert.ok(share(0.9) > 0.025 && share(0.9) < 0.06, `${share(0.9)}`);
        assert.ok(grades.reduce((sum, grade) => sum + grade, 0) / grades.length < 0.35);
        assert.equal(GRADE.skew, 2.5);
    });

    it("have as many bonuses, as strong, and an effect as strong, as their grade: the poorest's stun shortest, the finest's longest", () => {
        const at = (grade) => rollGear("mace", "legendary", createRandom(5), { level: 50, grade });
        const [poorest, finest] = [at(0), at(1)];

        assert.equal(Object.keys(poorest.bonuses).length, 3);
        assert.equal(Object.keys(finest.bonuses).length, 5);

        for (const effect of ["toll", "knell"]) {
            const [low, high] = [effectAt(effect, 50, 0), effectAt(effect, 50, 1)];

            assert.ok(high.stun > low.stun * 2.5, `${effect}: ${low.stun} to ${high.stun} ms`);
            assert.ok(high.radius > low.radius);
            assert.deepEqual(effectAt(effect, 50), effectAt(effect, 50, null), "(none given, as it's made)");
        }

        assert.equal(effectAt("toll", 100).stun, EFFECTS.toll.stun[1]);
        assert.deepEqual([gradeWords(0.05), gradeWords(0.5), gradeWords(0.95)], ["Rings flat", "Rings clear", "Rings as true as the Great Bell itself"]);

        // (Carried into the fight: the wielder's toll, the bearer's knell, at their grade)
        const vespers = { ...at(0.8), unique: "vespers", effect: "toll", grade: 0.8 };
        const bulwark = { ...rollGear("kiteShield", "legendary", createRandom(6), { level: 50, grade: 0.3 }), unique: "bulwark", effect: "knell", grade: 0.3 };
        const fighter = fighterOf(new Progress({ gear: { mainHand: vespers, offHand: bulwark } }, { weapon: "mace" }));

        // (Kept as it was rolled, in the pack, the hand and a save: two of different grades not one stack)
        assert.equal(Progress.thing(vespers).grade, 0.8);
        assert.ok(!alike(Progress.thing(vespers), Progress.thing({ ...vespers, grade: 0.81 })));
        assert.equal(new Progress(new Progress({ pack: [{ ...vespers, count: 1 }] }, { weapon: "mace" }).toJSON(), { weapon: "mace" }).pack[0].grade, 0.8);

        assert.equal(fighter.weapon, "mace");
        assert.deepEqual([fighter.legendary.effect, fighter.legendary.grade], ["toll", 0.8]);
        assert.deepEqual([fighter.ward.effect, fighter.ward.grade, fighter.ward.charge], ["knell", 0.3, WARD_CHARGE.blows]);
    });

    it("tolls: once its charge is full, everyone round the foe struck is hurt, thrown back and stunned as long as its grade has it", () => {
        const battle = new Battle(field(14), { seed: 4 });

        battle.add({ id: "hero", kind: "player", weapon: "mace", team: "hero", square: [6, 6] });
        battle.add({ id: "foe", kind: "orc", weapon: "cleaver", team: "orcs", square: [7, 6], ai: "patrol", patrol: [[7, 6], [7, 6]], hp: 1e6 });
        battle.add({ id: "beside", kind: "orc", weapon: "cleaver", team: "orcs", square: [8, 7], ai: "patrol", patrol: [[8, 7], [8, 7]], hp: 1e6 });

        const hero = battle.actor("hero");

        hero.hp = hero.maxHp = 1e6;
        hero.legendary = { effect: "toll", level: 100, charge: 3, grade: 1 };
        battle.command("hero", { type: "engage", target: "foe" });

        const events = play(battle, 8000);
        const toll = events.find(({ type, effect }) => type === "unleashed" && effect === "toll");

        assert.ok(toll, "rung out");
        assert.ok(toll.struck.includes("foe") && toll.struck.includes("beside"), `${toll.struck}`);
        assert.ok(toll.throws.length >= 1, "(thrown back)");

        const stunned = events.filter(({ type, effect }) => type === "stunned" && effect === "toll").map(({ id }) => id);

        assert.ok(stunned.includes("foe") && stunned.includes("beside"));
    });

    it("knells: every six blows its bearer takes, whoever struck the last of them stunned, and everyone round them", () => {
        const battle = new Battle(field(14), { seed: 7 });

        battle.add({ id: "hero", kind: "player", weapon: "mace", team: "hero", square: [6, 6] });
        battle.add({ id: "foe", kind: "orc", weapon: "cleaver", team: "orcs", square: [7, 6], hp: 1e6, ai: "patrol", patrol: [[7, 6], [7, 6]] });

        const hero = battle.actor("hero");

        hero.hp = hero.maxHp = 1e9;
        hero.ward = { effect: "knell", level: 100, charge: WARD_CHARGE.blows, grade: 0.5 };
        battle.command("foe", { type: "engage", target: "hero" });

        const events = play(battle, 20000);
        const knell = events.find(({ type, effect }) => type === "unleashed" && effect === "knell");

        assert.ok(knell, "rung out");
        assert.equal(knell.id, "hero");
        assert.equal(knell.target, "foe", "(where whoever struck stood)");
        assert.ok(knell.struck.includes("foe"));
        assert.ok(events.some(({ type, id, effect }) => type === "stunned" && id === "foe" && effect === "toll"));

        // (Its charge the blows taken: six before it rings, the sixth's told just after the knell it
        // set off)
        const first = events.indexOf(knell);
        const sixth = events.findIndex(({ type, id }, k) => k > first && type === "hit" && id === "hero");

        assert.equal(events.slice(0, sixth + 1).filter(({ type, id }) => type === "hit" && id === "hero").length, WARD_CHARGE.blows);
    });

    it("are drawn as his own, held or worn, in place of a mace's and a kite shield's look", () => {
        assert.deepEqual(UNIQUE_LOOKS, { vespers: ["vespers"], bulwark: ["bulwark"] });

        const worn = heroEquipment("mace", [{ id: "kiteShield", unique: "bulwark" }], [], { id: "mace", unique: "vespers" });

        assert.ok(worn.includes("vespers") && !worn.includes("mace"));
        assert.ok(worn.includes("bulwark") && !worn.includes("kiteShield"));
        assert.ok(heroEquipment("mace", [{ id: "kiteShield" }]).includes("mace"));
        assert.deepEqual(dress([{ id: "kiteShield", unique: "bulwark" }]), ["bulwark"]);

        // (What's worn tells which it is: core/progress.js worn, wielded)
        const progress = new Progress({ gear: { mainHand: { id: "mace", quality: "legendary", unique: "vespers" }, offHand: { id: "kiteShield", quality: "legendary", unique: "bulwark" } } }, { weapon: "mace" });

        assert.deepEqual(progress.wielded(), { id: "mace", unique: "vespers" });
        assert.ok(progress.worn().some(({ id, unique }) => id === "kiteShield" && unique === "bulwark"));
    });
});
