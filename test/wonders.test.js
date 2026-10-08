// The tomes' spells (client/js/core/spells.js, core/battle.js, core/host.js; docs/MAGIC.md):
// wards, cures, spells that last (Reflect, Dodge, Inertial Barrier, Surge, Swole, Levitate,
// Invisibility), what lies on the ground, Fear, Pacify, Vampirism, Poison; and the wonders the
// host works: Zombify, Summon, Attraction, Polymorph, Teleport, Word of Recall, Wizard's Walk.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AFFLICTIONS } from "../client/js/core/afflictions.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { Battle, FEAR_MEMORY, FOLLOW, SEE_THROUGH, STAMINA_DRAIN, STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, SUMMONING_MS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { Progress } from "../client/js/core/progress.js";
import { SPELL_XP, SPELLS, WARD } from "../client/js/core/spells.js";
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

// A caster in an open field (with what they hold), a friend beside them, and foes where asked
function field(foes = [], { weapon = "sword", seed = 5 } = {}) {
    const battle = new Battle(open(40, 30), { seed });
    const caster = battle.add({ id: "caster", kind: "player", weapon, team: "hero", square: [5, 15], hp: 500 });
    const friend = battle.add({ id: "friend", kind: "player", weapon: "sword", team: "hero", square: [5, 17], hp: 500 });

    foes.forEach(([x, y], k) => battle.add({ id: `foe-${k}`, kind: "orc", weapon: "cleaver", team: "orcs", square: [x, y], hp: 5000 }));

    return { battle, caster, friend };
}

// One of the wild's creatures (as the host puts them out), at a tier
const beast = (battle, id, square, { tier = 3, unique = false, creature = "wolf" } = {}) =>
    battle.add({ id, kind: "beast", weapon: creature, team: "beasts", square, ai: "wild", hp: 5000, speed: 1.4, chase: 3, wild: { creature, tier, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: id, leader: null, menace: true, unique } });

// Cast, and let it land (the caster's cooldowns forgotten first)
function cast(battle, id, spell, target = null, options = {}) {
    Object.assign(battle.actor(id), { spellReadyAt: 0, spellsReadyAt: {}, casting: null, staggeredUntil: 0 });

    const result = battle.cast(id, spell, target, options);

    assert.deepEqual(result, { ok: true }, `${spell}: ${JSON.stringify(result)}`);

    return run(battle, SPELLS[spell].castTime + STEP_MS);
}

describe("the tomes' spells in the battle (battle.js)", () => {
    it("wards a friend (never an enemy) against a school, an element, an affliction: 30% less, and less long", () => {
        const struck = (ward) => {
            const { battle } = field([[11, 15]], { seed: 9 });

            if (ward) {
                cast(battle, "caster", ward, "friend");
            }

            // (The same fire spell, the same roll, cast at the friend by a foe of theirs)
            battle.actor("foe-0").team = "rivals";
            Object.assign(battle.actor("friend"), { square: [10, 15], x: 10.5, y: 15.5 });

            const events = cast(battle, "foe-0", "immolate", "friend");
            const hit = events.find(({ type, id }) => type === "hit" && id === "friend");
            const burning = battle.actor("friend").afflictions.find(({ kind }) => kind === "burn");

            return { damage: hit.damage, burning: burning.until - battle.time };
        };
        const [least, most] = SPELLS.immolate.damage;
        const within = ({ damage }, low, high) => damage >= Math.round(low) && damage <= Math.round(high);
        const bare = struck(null);
        const warded = struck("resistFire");

        assert.ok(within(bare, least, most), `${bare.damage}`);
        assert.ok(within(warded, least * WARD, most * WARD), `${warded.damage}`);
        assert.equal(warded.burning, Math.round(AFFLICTIONS.burn.ms * WARD) - STEP_MS, "burning ends sooner");
        assert.equal(bare.burning, AFFLICTIONS.burn.ms - STEP_MS);
        assert.ok(within(struck("resistMagic"), least * WARD, most * WARD), "Resist Magic: against every spell");
        assert.ok(within(struck("resistWater"), least, most), "a ward against water's no help against fire");

        // (On a friend, or themselves; never an enemy)
        const { battle } = field([[11, 15]]);

        assert.equal(battle.cast("caster", "resistPoison", "foe-0").reason, "hostile");
        assert.deepEqual(battle.cast("caster", "resistPoison"), { ok: true });
        run(battle, 1000);
        assert.ok(battle.buffOf(battle.actor("caster"), "resistPoison"));

        // (Poison warded: less each time, and ending sooner)
        battle.afflict("caster", "poison", { power: 10 });
        battle.afflict("friend", "poison", { power: 10 });

        const [warded2, bare2] = ["caster", "friend"].map((id) => battle.actor(id).afflictions.find(({ kind }) => kind === "poison"));

        assert.equal(warded2.damage, Math.round(10 * WARD));
        assert.equal(bare2.damage, 10);
        assert.ok(warded2.until < bare2.until);

        // (And it lasts five minutes)
        run(battle, SPELLS.resistPoison.lasts);
        assert.equal(battle.buffOf(battle.actor("caster"), "resistPoison"), null);
    });

    it("cures what it's for on anyone, and nothing else; with nothing to cure, isn't cast; Embolden ends Fear", () => {
        const { battle } = field([[11, 15]]);

        battle.afflict("foe-0", "poison");
        battle.afflict("foe-0", "bleed");
        assert.equal(battle.cast("caster", "curePoison", "friend").reason, "uncursed");

        const events = cast(battle, "caster", "curePoison", "foe-0");

        assert.deepEqual(battle.actor("foe-0").afflictions.map(({ kind }) => kind), ["bleed"]);
        assert.equal(events.find(({ type }) => type === "spell").landed, 1);
        assert.equal(battle.actor("foe-0").foes.caster, undefined, "a cure's no attack");

        battle.afflict("friend", "fear", { by: "foe-0" });
        cast(battle, "caster", "embolden", "friend");
        assert.deepEqual(battle.actor("friend").afflictions, []);
    });

    it("slips blows now and then with Dodge: one in ten at first, one in four grown", () => {
        const slipped = (level) => {
            const { battle } = field([[6, 15]], { seed: 3 });
            let dodged = 0;
            let blows = 0;

            battle.buff("caster", "dodge", { ms: 1e9, level });
            battle.actor("foe-0").ai = null;

            for (let k = 0; k < 400; k++) {
                const events = run(battle, 1500);

                blows += events.filter(({ type, id, by }) => (type === "hit" || type === "dodged") && id === "caster" && by === "foe-0").length;
                dodged += events.filter(({ type, id }) => type === "dodged" && id === "caster").length;
                battle.actor("caster").hp = 500;
            }

            return dodged / blows;
        };

        assert.ok(Math.abs(slipped(1) - SPELLS.dodge.dodge[0]) < 0.04);
        assert.ok(Math.abs(slipped(5) - SPELLS.dodge.dodge[4]) < 0.05);
    });

    it("slips blows and shots by a player's own knack (Evasion), not magic, the Dodge spell's on top", () => {
        // How many of a foe's blows (with `weapon`) the caster slips, its knack and the spell as given
        const slipped = ({ knack = 0, level = 0, weapon = "cleaver" }) => {
            const { battle } = field([[6, 15]], { seed: 3 });
            let dodged = 0;
            let blows = 0;

            battle.actor("caster").dodge = knack;
            battle.rearm("foe-0", weapon);
            battle.actor("foe-0").ai = null;

            if (level) {
                battle.buff("caster", "dodge", { ms: 1e9, level });
            }

            for (let k = 0; k < 400; k++) {
                const events = run(battle, 1500);

                blows += events.filter(({ type, id, by }) => (type === "hit" || type === "dodged") && id === "caster" && by === "foe-0").length;
                dodged += events.filter(({ type, id }) => type === "dodged" && id === "caster").length;
                battle.actor("caster").hp = 500;
            }

            return dodged / blows;
        };

        assert.equal(slipped({}), 0);
        assert.ok(Math.abs(slipped({ knack: 0.25 }) - 0.25) < 0.05);
        assert.ok(Math.abs(slipped({ knack: 0.25, level: 5 }) - (0.25 + SPELLS.dodge.dodge[4])) < 0.06, "the spell's on top");

        // (A wand's bolts are magic: only the spell slips them)
        assert.equal(slipped({ knack: 0.25, weapon: "wand" }), 0);
        assert.ok(Math.abs(slipped({ knack: 0.25, level: 5, weapon: "wand" }) - SPELLS.dodge.dodge[4]) < 0.06);
    });

    it("turns a fifth of every blow back on whoever dealt it with Reflect (a wand in hand)", () => {
        const { battle } = field([[6, 15]], { weapon: "sword" });

        assert.equal(battle.cast("caster", "reflect").reason, "wand");
        battle.rearm("caster", "wand");
        cast(battle, "caster", "reflect");

        const events = run(battle, 3000);
        const hit = events.find(({ type, id, by }) => type === "hit" && id === "caster" && by === "foe-0");
        const back = events.find(({ type, id, by, reflected }) => type === "hit" && id === "foe-0" && by === "caster" && reflected);

        assert.ok(hit, "struck");
        assert.ok(back, "turned back");
        assert.equal(back.damage, Math.max(1, Math.round(hit.damage * SPELLS.reflect.reflect)));
        assert.equal(events.filter(({ reflected, id }) => reflected && id === "caster").length, 0, "(never turned back again)");
    });

    it("takes a quarter off blows (not spells) with Inertial Barrier; Surge's blows harder, and everything hurts them more", () => {
        const blow = (setup) => {
            const { battle } = field([[6, 15]], { seed: 21 });

            setup(battle);

            return run(battle, 3000).find(({ type, id, by }) => type === "hit" && id === "caster" && by === "foe-0").damage;
        };
        const bare = blow(() => {});

        assert.equal(blow((battle) => battle.buff("caster", "inertialBarrier", { ms: 1e9 })), Math.max(1, Math.round(bare * SPELLS.inertialBarrier.physical)));
        assert.equal(blow((battle) => battle.buff("caster", "surge", { ms: 1e9 })), Math.max(1, Math.round(bare * SPELLS.surge.exposed)));
        assert.equal(blow((battle) => battle.buff("foe-0", "surge", { ms: 1e9 })), Math.max(1, Math.round(bare * SPELLS.surge.might)));

        // (A spell through the barrier: as it was)
        const spell = (barrier) => {
            const { battle } = field([[11, 15]], { seed: 9 });

            battle.actor("foe-0").team = "rivals";

            if (barrier) {
                battle.buff("caster", "inertialBarrier", { ms: 1e9 });
            }

            return cast(battle, "foe-0", "burn", "caster").find(({ type, id }) => type === "hit" && id === "caster").damage;
        };

        assert.equal(spell(true), spell(false));
    });

    it("runs on a quarter of the breath with Swole", () => {
        const { battle, caster } = field();

        battle.buff("caster", "swole", { ms: 1e9 });
        battle.command("caster", { type: "move", to: [35, 15], run: true });
        run(battle, 1000);
        assert.ok(Math.abs(caster.maxStamina - caster.stamina - STAMINA_DRAIN * SPELLS.swole.stamina) < 0.2, `${caster.maxStamina - caster.stamina}`);
    });

    it("leaves fire on the ground round them with Flamefill, hurting those of the other side in it, never one levitating", () => {
        const { battle } = field([[11, 15], [12, 16]]);

        battle.buff("foe-1", "levitate", { ms: 1e9 });

        const events = cast(battle, "caster", "flamefill", "foe-0");
        const laid = events.find(({ type, change }) => type === "hazard" && change === "on");

        assert.equal(laid.kind, "fire");
        assert.equal(battle.hazards.length, 1);

        const after = run(battle, SPELLS.flamefill.hazard.ms);
        const burnt = (id) => after.filter(({ type, id: struck, ground }) => type === "hit" && struck === id && ground).length;

        assert.ok(burnt("foe-0") >= 5, "standing in it");
        assert.equal(burnt("foe-1"), 0, "levitating");
        assert.equal(burnt("caster") + burnt("friend"), 0);
        assert.equal(battle.hazards.length, 0, "burnt out");

        // (And kept, with the battle)
        const again = field([[11, 15]]);

        cast(again.battle, "caster", "acidify", "foe-0");
        assert.deepEqual(Battle.restore(open(40, 30), again.battle.snapshot()).hazards, again.battle.hazards);
    });

    it("keeps the side of whoever left fire on the ground once they've gone: their enemies burnt, never their allies", () => {
        // (Humans and elves allied; the orcs everyone's enemy)
        const battle = new Battle(open(40, 30), { seed: 5, relations: (a, b) => a.team === "orcs" || b.team === "orcs" });

        battle.add({ id: "caster", kind: "player", weapon: "sword", team: "human", square: [5, 15], hp: 500 });
        battle.add({ id: "elf", kind: "soldier", weapon: "sword", team: "elf", square: [12, 15], hp: 5000 });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [11, 15], hp: 5000 });

        cast(battle, "caster", "flamefill", "orc");

        // The caster gone (a player who's left the game), the fire burning on
        battle.remove("caster");

        const after = run(battle, SPELLS.flamefill.hazard.ms);
        const burnt = (id) => after.filter(({ type, id: struck, ground }) => type === "hit" && struck === id && ground).length;

        assert.ok(burnt("orc") >= 5, "the enemy standing in it");
        assert.equal(burnt("elf"), 0, "an ally beside them");
    });

    it("frightens an enemy off, running blindly away ten seconds: half as long a second time, not at all a third; the unique never", () => {
        const { battle } = field();
        const wolf = beast(battle, "wolf", [12, 15], { tier: 3 });

        cast(battle, "caster", "fear", "wolf");
        assert.ok(wolf.afflictions.some(({ kind }) => kind === "fear"));

        const before = Math.hypot(wolf.x - 5.5, wolf.y - 15.5);
        const events = run(battle, 4000);

        assert.ok(Math.hypot(wolf.x - 5.5, wolf.y - 15.5) > before + 2, "ran away");
        assert.equal(events.filter(({ type, id }) => type === "attack" && id === "wolf").length, 0, "fighting no one");

        // (Again soon after: half as long; a third time, nothing)
        const left = (id) => battle.actor(id).afflictions.find(({ kind }) => kind === "fear")?.until - battle.time;

        battle.cure("wolf", "fear");
        Object.assign(wolf, { square: [8, 15], x: 8.5, y: 15.5, path: [] });
        cast(battle, "caster", "fear", "wolf");
        assert.ok(Math.abs(left("wolf") - SPELLS.fear.flee / 2) <= STEP_MS * 2);
        battle.cure("wolf", "fear");
        Object.assign(wolf, { square: [8, 15], x: 8.5, y: 15.5, path: [] });

        const third = cast(battle, "caster", "fear", "wolf");

        assert.ok(third.some(({ type }) => type === "resisted"));
        assert.ok(!wolf.afflictions.some(({ kind }) => kind === "fear"));

        // (Its fear forgotten after a while)
        wolf.feared.since -= FEAR_MEMORY;
        cast(battle, "caster", "fear", "wolf");
        assert.ok(Math.abs(left("wolf") - SPELLS.fear.flee) <= STEP_MS * 2);

        // (The unique, never; the mightier, now and then)
        beast(battle, "wight", [9, 17], { tier: 9, unique: true, creature: "wightLord" });
        assert.ok(cast(battle, "caster", "fear", "wight").some(({ type, always }) => type === "resisted" && always));
    });

    it("calms an enemy with Pacify (till it's struck again); the mighty may shrug it off, the unique always", () => {
        const { battle } = field();
        const wolf = beast(battle, "wolf", [9, 15], { tier: 2 });

        assert.ok(battle.hostile(wolf, battle.actor("caster")));
        cast(battle, "caster", "pacify", "wolf");
        assert.ok(!battle.hostile(wolf, battle.actor("caster")));
        assert.ok(battle.hostile(wolf, battle.actor("friend")), "(calm towards the caster only)");

        // (Struck: hostile again)
        battle.actor("caster").foes.wolf = battle.time + 60000;
        battle.command("caster", { type: "engage", target: "wolf" });
        run(battle, 3000);
        assert.equal(wolf.spared.caster, undefined);
        delete battle.actor("caster").foes.wolf;
        delete wolf.foes.caster;
        assert.ok(battle.hostile(wolf, battle.actor("caster")));

        // (The mightiest shrug it off most of the time)
        let calmed = 0;

        for (let k = 0; k < 40; k++) {
            const mighty = beast(battle, `mighty-${k}`, [9, 18], { tier: 10 });

            calmed += cast(battle, "caster", "pacify", mighty.id).some(({ type }) => type === "pacified") ? 1 : 0;
            battle.remove(mighty.id);
        }

        assert.ok(calmed > 0 && calmed < 12, `${calmed} of 40`);
    });

    it("draws life out of an enemy into the caster with Vampirism, more as it grows; poisons with Poison, worse as it grows", () => {
        const { battle, caster } = field([[11, 15]]);

        caster.hp = 100;

        const events = cast(battle, "caster", "vampirism", "foe-0");
        const hit = events.find(({ type, id }) => type === "hit" && id === "foe-0");

        assert.ok(hit.damage >= SPELLS.vampirism.drain[0][0] && hit.damage <= SPELLS.vampirism.drain[0][1]);
        assert.equal(caster.hp, 100 + hit.damage);

        const grown = cast(battle, "caster", "vampirism", "foe-0", { level: 5 }).find(({ type, id }) => type === "hit" && id === "foe-0");

        assert.ok(grown.damage >= SPELLS.vampirism.drain[4][0]);

        cast(battle, "caster", "poison", "foe-0", { level: 3 });

        const venom = battle.actor("foe-0").afflictions.find(({ kind }) => kind === "poison");

        assert.equal(venom.damage, SPELLS.poison.venom[2]);
        assert.ok(battle.actor("foe-0").foes.caster > battle.time, "an attack, held against them");
    });

    it("hides the invisible from all but the mightiest, who may see through it the longer they're near; casting or striking ends it", () => {
        const { battle, caster } = field();
        const wolf = beast(battle, "wolf", [10, 15], { tier: 3 });
        const wight = beast(battle, "wight", [5, 22], { tier: 9 });

        battle.remove("friend");

        wight.ai = null;
        run(battle, 1000);
        assert.equal(wolf.target, "caster");

        cast(battle, "caster", "invisibility");
        assert.equal(wolf.target, null, "lost");

        const events = run(battle, 20000);

        assert.equal(wolf.target, null, "never found again");
        assert.equal(events.filter(({ type, id }) => type === "attack" && id === "wolf").length, 0);
        assert.ok(wight.seeing.caster === true || wight.seeing.caster > 0, "the mighty one's been near a while");

        // (The mightiest near, a while: seen through, sooner or later)
        let seconds = 0;

        while (wight.seeing.caster !== true && seconds < 120) {
            run(battle, 1000);
            seconds++;
        }

        assert.equal(wight.seeing.caster, true, `seen through (after ${seconds} s more)`);
        assert.ok(SEE_THROUGH.tier <= 9);

        // (Casting anything else: seen)
        caster.hp = 10;
        cast(battle, "caster", "vigor");
        assert.equal(battle.buffOf(caster, "invisibility"), null);
    });

    it("needs a grimoire for Zombify and Word of Recall, a wand for Reflect and Wizard's Walk", () => {
        const { battle } = field();

        assert.equal(battle.cast("caster", "wordOfRecall").reason, "grimoire");
        assert.equal(battle.cast("caster", "wizardsWalk", null, { at: [1, 1] }).reason, "wand");
        battle.rearm("caster", "grimoire");
        assert.deepEqual(battle.cast("caster", "wordOfRecall"), { ok: true });
    });
});

describe("the tomes' wonders (host.js)", () => {
    // One of the wild's creatures put out (as the host would), at a tier: its id, in a list
    const wildOut = (host, creature, tier, square) => {
        const id = `test-${creature}`;

        host.wild.set(id, { creature, tier, pack: id, camp: null, lair: null, master: false });
        host.battle.add({ id, kind: "beast", name: CREATURES[creature].name, weapon: CREATURES[creature].weapon, team: "beasts", square, ai: "wild", hp: 60, wild: { creature, tier, temper: "aggressive", guard: 0, roam: 0, leash: 30, pack: id, leader: null, menace: true, unique: false } });

        return [id];
    };

    // A host with its player (and what they know), the world's own folk left out
    const hosted = (spells = [], { weapon = "sword", seed = 2 } = {}) => {
        const host = new Host(buildWorld({ seed }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: { ...HERO, weapon }, progress: { spells, gear: { mainHand: { id: weapon, quality: "common" } } } });

        return host;
    };
    const steps = (host, ms) => {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        return events;
    };
    const castHere = (host, spell, rest = {}) => {
        Object.assign(host.battle.actor(HOST_PLAYER), { spellReadyAt: 0, spellsReadyAt: {} });

        const result = host.command(HOST_PLAYER, { type: "cast", spell, ...rest });

        assert.deepEqual(result, { ok: true }, `${spell}: ${JSON.stringify(result)}`);

        return steps(host, SPELLS[spell].castTime + STEP_MS * 2);
    };

    it("raises one of the wild's creatures fallen lately to follow the player five minutes (a grimoire in hand), brought along if it falls behind", () => {
        const host = hosted(["zombify"], { weapon: "grimoire" });
        const me = host.battle.actor(HOST_PLAYER);
        const [wolf] = wildOut(host, "wolf", 3, [me.square[0] + 3, me.square[1]]);

        host.battle.actor(wolf).hp = 1;
        host.battle.actor(wolf).ai = null;
        me.power.melee = 50;
        assert.equal(host.command(HOST_PLAYER, { type: "cast", spell: "zombify" }).reason, "corpse", "none fallen");

        // (Struck down)
        host.battle.actor(wolf).dead = false;
        host.battle.afflict(wolf, "bleed", { power: 10 });
        steps(host, 2500);
        assert.ok(host.battle.actor(wolf).dead);

        const events = castHere(host, "zombify");
        const [id] = [...host.companions.keys()];
        const risen = host.battle.actor(id);

        assert.equal(host.battle.actor(wolf), null, "the body gone: risen");
        assert.ok(events.some(({ type, change }) => type === "companion" && change === "risen"));
        assert.equal(risen.ai, "follow");
        assert.equal(risen.leader, HOST_PLAYER);
        assert.equal(risen.wild.creature, "wolf");
        assert.ok(!host.battle.hostile(risen, me));

        // (Stuck far behind: brought to them)
        Object.assign(risen, { square: [me.square[0] + 30, me.square[1]], x: me.square[0] + 30.5, path: [] });
        steps(host, STEP_MS * 2);
        assert.ok(Math.hypot(risen.x - me.x, risen.y - me.y) < FOLLOW.lost);

        // (Five minutes, then gone)
        assert.ok(host.companions.get(id).until - host.battle.time > SPELLS.zombify.lasts - 1000);
        host.companions.get(id).until = host.battle.time + 100;
        steps(host, 200);
        assert.equal(host.companions.size, 0);
        assert.equal(host.battle.actor(id), null);
    });

    it("calls a creature of these parts to the player's side with Summon; draws one hostile out of the smoke with Attraction", () => {
        const host = hosted(["summon", "attraction"]);

        castHere(host, "summon");
        assert.equal(host.companions.size, 1);

        const [id, one] = [...host.companions][0];

        assert.equal(host.battle.actor(id).leader, HOST_PLAYER);
        assert.equal(one.risen, false);

        const events = castHere(host, "attraction");
        const drawn = events.find(({ type }) => type === "attracted");

        assert.ok(drawn);
        assert.ok(host.wild.has(drawn.ids[0]));
        assert.ok(host.battle.hostile(host.battle.actor(drawn.ids[0]), host.battle.actor(HOST_PLAYER)));
    });

    it("turns a creature into another of the world's with Polymorph", () => {
        const host = hosted(["polymorph"]);
        const me = host.battle.actor(HOST_PLAYER);
        const [boar] = wildOut(host, "boar", 2, [me.square[0] + 4, me.square[1]]);

        host.battle.actor(boar).ai = null;

        const events = castHere(host, "polymorph", { target: boar });
        const changed = events.find(({ type }) => type === "polymorphed");

        assert.ok(changed, JSON.stringify(events.filter(({ type }) => type === "resisted")));
        assert.notEqual(changed.creature, "boar");
        assert.equal(host.wild.get(boar).creature, changed.creature);
        assert.equal(host.battle.actor(boar).wild.creature, changed.creature);
        assert.equal(host.battle.actor(boar).weapon, CREATURES[changed.creature].weapon);
    });

    it("carries the player off with Teleport, anywhere; their followers and companions left behind", () => {
        const host = hosted(["teleport", "summon"]);
        const me = host.battle.actor(HOST_PLAYER);
        const from = [me.x, me.y];

        castHere(host, "summon");
        assert.equal(host.companions.size, 1);

        const events = castHere(host, "teleport");
        const carried = events.find(({ type }) => type === "carried");

        assert.equal(carried.why, "teleport");
        assert.ok(Math.hypot(me.x - from[0], me.y - from[1]) > 50, "somewhere else");
        assert.equal(host.companions.size, 0, "left behind");
        assert.ok(events.some(({ type, kind, id }) => type === "cross" && kind === "magic" && id === HOST_PLAYER));
    });

    it("takes the player to the nearest temple's door with Word of Recall", () => {
        const host = hosted(["wordOfRecall"], { weapon: "grimoire" });
        const events = castHere(host, "wordOfRecall");
        const carried = events.find(({ type }) => type === "carried");
        const temple = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "church" && place === "home");
        const door = temple.door.ends[0];

        assert.equal(carried.why, "recall");
        assert.ok(Math.hypot(carried.square[0] - door.arrive[0], carried.square[1] - door.arrive[1]) < 3);
    });

    it("walks the player to anywhere they've uncovered with Wizard's Walk (a wand in hand); nowhere they haven't", () => {
        const host = hosted(["wizardsWalk"], { weapon: "wand" });
        const player = host.players.get(HOST_PLAYER);
        const me = host.battle.actor(HOST_PLAYER);
        const there = [me.x + 300, me.y + 200];

        assert.equal(host.command(HOST_PLAYER, { type: "cast", spell: "wizardsWalk", at: there }).reason, "unexplored");
        player.explored.visit(...there);

        const events = castHere(host, "wizardsWalk", { at: there });

        assert.equal(events.find(({ type }) => type === "carried")?.why, "walk");
        assert.ok(Math.hypot(me.x - there[0], me.y - there[1]) < 12);
    });

    it("summons another player, who comes if they will, or resists (or doesn't answer in time)", () => {
        const host = hosted(["summon"]);

        host.join({ id: "guest", hero: { ...HERO, name: "Bram" } });

        const [me, guest] = [host.battle.actor(HOST_PLAYER), host.battle.actor("guest")];

        Object.assign(guest, { square: [me.square[0] + 40, me.square[1]], x: me.square[0] + 40.5 });

        const asked = castHere(host, "summon", { target: "guest" }).find(({ type, change }) => type === "summons" && change === "asked");

        assert.equal(asked.id, "guest");
        assert.equal(asked.by, HOST_PLAYER);
        assert.deepEqual(host.command("guest", { type: "summoned", come: true }), { ok: true });
        assert.ok(Math.hypot(guest.x - me.x, guest.y - me.y) < 5, "come to their side");
        assert.deepEqual(host.command("guest", { type: "summoned", come: true }), { ok: false, reason: "unsummoned" });

        // (Resisting; or not answering)
        castHere(host, "summon", { target: "guest" });
        host.command("guest", { type: "summoned", come: false });
        castHere(host, "summon", { target: "guest" });

        const ignored = steps(host, SUMMONING_MS + STEP_MS).filter(({ type, change }) => type === "summons" && change === "resisted");

        assert.equal(ignored.length, 2, "told, both of them");
    });

    it("grows Vampirism, Dodge and Poison by use, told of each level", () => {
        const host = hosted(["dodge"]);
        const { progress } = host.players.get(HOST_PLAYER);

        progress.spellXp.dodge = 60 - SPELL_XP;

        const events = castHere(host, "dodge");

        assert.deepEqual(events.filter(({ type }) => type === "grown").map(({ spell, level }) => ({ spell, level })), [{ spell: "dodge", level: 2 }]);
        assert.equal(host.battle.buffOf(host.battle.actor(HOST_PLAYER), "dodge").level, 1, "(cast before it grew)");
        assert.equal(new Progress(progress.toJSON()).levelOf("dodge"), 2);
        assert.ok(AFFLICTIONS.fear);
    });

    it("keeps its companions and those being summoned for a player joining", () => {
        const host = hosted(["summon"]);

        castHere(host, "summon");

        const copy = Host.restore(buildWorld({ seed: 2 }), host.snapshot());

        assert.deepEqual([...copy.companions], [...host.companions]);
        assert.equal(copy.checksum(), host.checksum());
    });
});
