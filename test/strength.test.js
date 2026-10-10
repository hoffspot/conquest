// A side's strength, as the wild weighs it (client/js/core/strength.js; in play, core/host.js
// strengthOf and #side; docs/WILDS.md "A side's strength"): each one's fighting value from what
// they are now, a side's strength over its strongest player's (1 alone), the opposition the wild
// sets against it a little less than it, and players near one another taken as one group
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sideLine } from "../client/js/app/debug.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, tierPower } from "../client/js/core/creatures.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SPELL_COOLDOWN, SPELLS } from "../client/js/core/spells.js";
import { BODIES, fightingValue, groupsOf, harm, opposition, OPPOSITION, SCALING, scalingOf, sideStrength, spellHarm, STRENGTH, toughness, weaponHarm, wholeOf, withinBudget } from "../client/js/core/strength.js";
import { createRandom } from "../client/js/core/random.js";
import { WEAPONS } from "../client/js/core/weapons.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    for (let t = 0; t < ms; t += STEP_MS) {
        host.advance(STEP_MS);
    }
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A new adventurer with a sword and shield, as a player starts
const fighter = (more = {}) => ({ maxHp: 50, armor: 0, dodge: 0, shield: null, weapon: "sword", power: { melee: 1, ranged: 1, spell: 1 }, ...more });

// One of the wild's creatures at a tier, as the host rouses it
const creature = (id, tier) => {
    const spec = CREATURES[id];

    return { maxHp: Math.round(spec.hp * tierPower(tier)), armor: spec.armor ?? 0, weapon: spec.weapon, power: { melee: tierPower(tier), ranged: tierPower(tier) } };
};

describe("a side's strength (strength.js)", () => {
    it("takes how hard someone is to put down from their health, over what gets through their armour, their knack for slipping blows and their shield (in front)", () => {
        assert.equal(toughness(fighter()), 50);
        assert.equal(toughness(fighter({ armor: 0.5 })), 100);
        assert.equal(toughness(fighter({ dodge: 0.2 })), 62.5);
        assert.equal(toughness(fighter({ shield: { chance: 0.4, share: 0.5 } })), 50 / (1 - 0.4 * 0.5 * STRENGTH.front));
        assert.ok(Number.isFinite(toughness(fighter({ armor: 1, dodge: 1 }))), "never everything taken off");
    });

    it("takes how fast someone harms from their best attack's blow on average, as strong as their power for it, over the time from one to the next", () => {
        const [slash] = WEAPONS.sword.attacks;
        const sword = ((slash.damage[0] + slash.damage[1]) / 2) * (1000 / slash.interval);

        assert.ok(Math.abs(weaponHarm(fighter()) - sword) < 1e-9);
        assert.ok(Math.abs(weaponHarm(fighter({ power: { melee: 2, ranged: 1 } })) - 2 * sword) < 1e-9);
        assert.equal(weaponHarm({ weapon: null }), 0, "nothing to harm with");

        // (A bow: its arrows, as strong as their power for shooting)
        const [arrow] = WEAPONS.bow.attacks;

        assert.ok(Math.abs(weaponHarm(fighter({ weapon: "bow", power: { melee: 1, ranged: 1.5 } })) - ((arrow.damage[0] + arrow.damage[1]) / 2) * 1.5 * (1000 / arrow.interval)) < 1e-9);
    });

    it("casts the hardest-hitting spells for the time they take first, each as often as it's ready, till there's no more time; the weapon in what time's left", () => {
        const burn = SPELLS.burn;
        const mean = (burn.damage[0] + burn.damage[1]) / 2;
        const slot = Math.max(burn.castTime, SPELL_COOLDOWN);
        const one = spellHarm(["burn"]);

        // (Burn alone: once each cooldown, the rest of the time free)
        assert.ok(Math.abs(one.used - slot / burn.cooldown) < 1e-9);
        assert.ok(Math.abs(one.rate - (mean * 1000) / burn.cooldown) < 1e-9);
        assert.ok(Math.abs(spellHarm(["burn"], 2).rate - 2 * one.rate) < 1e-9, "as strong as their spell power");

        // (Heals, wards and hexes harm no one; with more than time allows, all the time taken)
        assert.deepEqual(spellHarm(["vigor", "stun"]), { rate: 0, used: 0 });

        const all = spellHarm(["burn", "fireball", "rumble", "stoneCrush", "hurt", "blister", "waterbolt"]);

        assert.ok(Math.abs(all.used - 1) < 1e-9 && all.rate > one.rate);

        // (The weapon in the time left over)
        const caster = fighter({ weapon: "wand", shield: null });

        assert.ok(Math.abs(harm(caster, ["burn"]) - (one.rate + weaponHarm(caster) * (1 - one.used))) < 1e-9);
        assert.ok(Math.abs(harm(caster, ["burn", "fireball", "rumble", "stoneCrush", "hurt", "blister", "waterbolt"]) - all.rate) < 1e-9);
    });

    it("weighs each one's fighting value as how long they'd last and how fast they harm, met in the middle; nothing for the fallen; more the stronger a creature's tier", () => {
        const value = fightingValue(fighter(), []);

        assert.ok(Math.abs(value - Math.sqrt(toughness(fighter()) * harm(fighter(), []))) < 1e-9);
        assert.equal(fightingValue({ ...fighter(), dead: true }, []), 0);
        assert.equal(fightingValue(null), 0);

        for (const id of ["wolf", "bandit", "ogre"]) {
            const values = [1, 3, 5, 7].map((tier) => fightingValue(creature(id, tier)));

            assert.ok(values.every((each, k) => k === 0 || each > values[k - 1]), `${id}: ${values}`);
        }
    });

    it("makes a side's strength its members' values over its strongest player's: 1 alone (never less), 2 for two alike, a little more for an ally; and sets against it a little less", () => {
        assert.equal(sideStrength([10], 10), 1);
        assert.equal(sideStrength([10, 10], 10), 2);
        assert.equal(sideStrength([10, 4], 10), 1.4);
        assert.equal(sideStrength([3], 10), 1, "never less than 1");
        assert.equal(sideStrength([], 0), 1);

        assert.equal(opposition(1), 1);
        assert.ok(Math.abs(opposition(4) - Math.pow(4, OPPOSITION.answer)) < 1e-9);
        assert.ok(opposition(4) > 2.9 && opposition(4) < 3.1, "about three for four alike");
        assert.ok(opposition(2) / 2 < 1 && opposition(4) / 4 < opposition(2) / 2, "each of more finds it a little easier");
        assert.equal(opposition(0.5), 1);
    });

    it("spends an opposition on more of a pack, each a little tougher, and its leader tougher still; nothing more against one alone", () => {
        assert.deepEqual(scalingOf(1), { count: 1, health: 1, leader: 1 });

        const four = scalingOf(opposition(4));

        assert.ok(Math.abs(four.count - Math.pow(opposition(4), SCALING.count)) < 1e-9);
        assert.ok(four.count > 2.2 && four.count < 2.4, `${four.count} as many`);
        assert.ok(four.health > 1.25 && four.health < 1.4, `${four.health} as tough`);
        assert.ok(four.leader > 2.3 && four.leader < 2.5, `a leader ${four.leader} as tough`);
    });

    it("makes so many whole with the world's dice: a whole number as it is, no dice thrown; a half as often one way as the other", () => {
        const none = { next: () => assert.fail("no dice for a whole number") };

        assert.equal(wholeOf(4, none), 4);
        assert.equal(wholeOf(0, none), 0);

        const random = createRandom(7);
        const rolls = Array.from({ length: 2000 }, () => wholeOf(4.5, random));

        assert.ok(rolls.every((each) => each === 4 || each === 5));
        assert.ok(Math.abs(rolls.filter((each) => each === 5).length / rolls.length - 0.5) < 0.05);
        assert.ok(Math.abs(Array.from({ length: 2000 }, () => wholeOf(2.25, random)).reduce((sum, each) => sum + each, 0) / 2000 - 2.25) < 0.05);
    });

    it("holds a pack to the body budget near a fight: never fewer than alone, what's over it in their hit points", () => {
        assert.deepEqual(withinBudget(9, 4, 30), { count: 9, health: 1 }, "room for them all");
        assert.deepEqual(withinBudget(9, 4, 6), { count: 6, health: 1.5 }, "six there, as tough as nine");
        assert.deepEqual(withinBudget(9, 4, 0), { count: 4, health: 2.25 }, "never fewer than alone");
        assert.deepEqual(withinBudget(3, 4, 0), { count: 3, health: 1 }, "never more than wanted");
        assert.equal(BODIES.most, 40);
    });

    it("takes players on one map near one another, one after another, as one group; those apart or elsewhere their own", () => {
        const players = [
            { id: "a", map: "town", x: 0, y: 0 },
            { id: "b", map: "town", x: 200, y: 0 },
            { id: "c", map: "town", x: 50, y: 0 },
            { id: "d", map: "town", x: 100, y: 0 },
            { id: "e", map: "tavern", x: 0, y: 0 },
        ];

        // (a near c, c near d: a, c and d one group, in the order given; b too far; e elsewhere)
        assert.deepEqual(
            groupsOf(players).map((group) => group.map(({ id }) => id)),
            [["a", "c", "d"], ["b"], ["e"]],
        );
        assert.deepEqual(groupsOf(players, 40).map((group) => group.length), [1, 1, 1, 1, 1]);
        assert.deepEqual(groupsOf([]), []);
    });
});

describe("a side's strength in play (host.js strengthOf)", () => {
    // A world with its player in it, the orc gone
    function hosted() {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 500 } });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        return host;
    }

    it("weighs a player alone at 1, the opposition 1; a second player like them beside them makes 2, and further off than STRENGTH.apart, 1 again", () => {
        const host = hosted();
        const me = host.battle.actor(HOST_PLAYER);

        assert.deepEqual(host.strengthOf(HOST_PLAYER), { strength: 1, opposition: 1, players: 1, allies: 0 });

        host.join({ id: "guest", hero: { ...HERO, name: "Bram" } });

        const guest = host.battle.actor("guest");

        put(guest, me.map, [me.square[0] + 3, me.square[1]]);

        const together = host.strengthOf(HOST_PLAYER);

        assert.equal(together.players, 2);
        assert.ok(Math.abs(together.strength - 2) < 1e-9, `${together.strength}`);
        assert.ok(Math.abs(together.opposition - Math.pow(2, OPPOSITION.answer)) < 1e-9);
        assert.deepEqual(host.strengthOf("guest"), together, "the same for both");

        put(guest, me.map, [me.square[0] + STRENGTH.apart + 20, me.square[1]]);
        assert.equal(host.strengthOf(HOST_PLAYER).strength, 1);
        assert.equal(host.strengthOf("guest").players, 1);

        // (Fallen: none)
        guest.dead = true;
        assert.equal(host.strengthOf("guest"), null);
        assert.equal(host.strengthOf("nobody"), null);
    });

    it("counts those with a player near them: a hired adventurer and a creature called to their side, each as strong as they are; not once they're far off", () => {
        const host = hosted();
        const me = host.battle.actor(HOST_PLAYER);
        const guild = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

        host.command(HOST_PLAYER, { type: "enter", link: guild.door.id });
        host.command(HOST_PLAYER, { type: "stop" });

        const one = guild.folk.find(({ role, talk }) => role === "adventurer" || talk === "adventurer");
        const npc = host.battle.actor(one.id);

        put(me, npc.map, [npc.square[0], npc.square[1] + 2]);
        assert.equal(host.command(HOST_PLAYER, { type: "talk", with: one.id }).ok, true);

        const { follower } = host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } });
        const hired = host.battle.actor(follower);
        const side = host.strengthOf(HOST_PLAYER);
        const own = fightingValue(me, host.players.get(HOST_PLAYER).progress.known());

        assert.equal(side.allies, 1);
        assert.ok(Math.abs(side.strength - (own + fightingValue(hired)) / own) < 1e-9, `${side.strength}`);
        assert.ok(side.strength > 1.3 && side.strength < 2.5, "a new hire about as strong as a new adventurer");

        // (Stronger, the player: the hire's share less)
        Object.assign(me, { maxHp: 200, power: { ...me.power, melee: 3 } });
        assert.ok(host.strengthOf(HOST_PLAYER).strength < side.strength);

        // (Far off: not counted)
        put(hired, me.map, [me.square[0] + STRENGTH.reach + 10, me.square[1]]);
        assert.equal(host.strengthOf(HOST_PLAYER).allies, 0);
        assert.equal(host.strengthOf(HOST_PLAYER).strength, 1);
    });

    it("counts the creatures called to a player's side as strong as their tier makes them, and none once they've gone", () => {
        const host = hosted();

        host.players.get(HOST_PLAYER).progress.learn("summon");
        Object.assign(host.battle.actor(HOST_PLAYER), { spellReadyAt: 0, spellsReadyAt: {} });
        host.command(HOST_PLAYER, { type: "cast", spell: "summon" });
        run(host, 3000);

        const [[id]] = [...host.companions];
        const called = host.battle.actor(id);
        const side = host.strengthOf(HOST_PLAYER);

        assert.equal(side.allies, 1);
        assert.ok(side.strength > 1);

        called.dead = true;
        assert.equal(host.strengthOf(HOST_PLAYER).allies, 0);
    });

    it("lets go a player's oldest creature for a new one called where the body budget's full, short of what their level allows", () => {
        const host = hosted();
        const me = host.battle.actor(HOST_PLAYER);
        const progress = host.players.get(HOST_PLAYER).progress;
        const call = () => {
            Object.assign(me, { spellReadyAt: 0, spellsReadyAt: {} });
            host.command(HOST_PLAYER, { type: "cast", spell: "summon" });
            run(host, 3000);
        };

        progress.learn("summon");
        progress.spellXp.summon = 500;
        call();

        const [[first]] = [...host.companions];

        // (So many about them that there's no room for another)
        for (let k = 0; k < BODIES.most; k++) {
            host.battle.add({ id: `crowd-${k}`, kind: "follower", name: "Crowd", weapon: "sword", team: me.team, square: [me.square[0] + (k % 8) - 4, me.square[1] + 6 + Math.floor(k / 8)], map: me.map });
        }

        call();
        assert.equal(host.companions.size, 1, "one at their side, though their level has room for more");
        assert.ok(!host.companions.has(first), "the oldest let go for it");

        // (Room again: as many as their level allows)
        for (let k = 0; k < BODIES.most; k++) {
            host.battle.remove(`crowd-${k}`);
        }

        call();
        assert.equal(host.companions.size, 2);
    });

    it("shows in the debug overlay: S, F and who's counted", () => {
        assert.equal(sideLine({ strength: 1, opposition: 1, players: 1, allies: 0 }), "Side S 1.00  F 1.00  (1 player, 0 allies)");
        assert.equal(sideLine({ strength: 2.4, opposition: 2.0141, players: 2, allies: 1 }), "Side S 2.40  F 2.01  (2 players, 1 ally)");
        assert.equal(sideLine(null), null);
    });
});
