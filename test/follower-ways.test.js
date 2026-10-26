// What a player's own do (client/js/core/followers.js; core/battle.js #follow; core/host.js
// #orderUnit, #unitAbility, #handOver): each calling's way of fighting of its own accord, a mage's
// spells at whom it fights and a cleric's healing its leader first; told to guard, to fall back,
// to hold fire or not; each one's own ability; a draught given to one; and those kept in a world
// from before brought forward fighting their calling's way
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { abilityLabel, abilityOf, CLERIC_HEALS, FALL_BACK, GUARD_REACH, givable, KEEP_OFF, UNIT_ABILITIES, wayOf } from "../client/js/core/followers.js";
import { nearestFree, squareKey, squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { ITEMS } from "../client/js/core/progress.js";
import { distanceBetween } from "../client/js/core/weapons.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// A world with its player out in it, the followers (each { calling, people }) with them, and a
// healing draught and a cure for poison in their pack: { host, me, ids } (the followers', in order)
function withFollowers(...callings) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });
    const followers = callings.map((calling, k) => ({ name: `F${k}`, calling: typeof calling === "string" ? calling : calling.calling, people: calling.people ?? "human", sex: "f", seed: k + 1 }));

    host.join({ id: HOST_PLAYER, hero: HERO, progress: { gold: 100, pack: [{ id: "potion", count: 3 }, { id: "antidote", count: 1 }] }, followers });

    const ids = [...host.followers.keys()];

    return { host, me: host.battle.actor(HOST_PLAYER), ids, units: ids.map((id) => host.battle.actor(id)) };
}

// A free square `dx`, `dy` from the player, not `taken`
function near(host, dx, dy, taken = new Set()) {
    const me = host.battle.actor(HOST_PLAYER);
    const square = nearestFree(squaresOf(host.world.maps[me.map] ?? host.world), [me.square[0] + dx, me.square[1] + dy], { within: 6, taken: new Set([squareKey(...me.square), ...host.battle.actors.filter(({ map }) => map === me.map).map(({ square: [x, y] }) => squareKey(x, y)), ...taken]) });

    taken.add(squareKey(...square));

    return square;
}

// A wolf of the wild's standing by the player, set on no one, going after no one of its own
// accord (`ai`: none): its actor
function wolf(host, id, square) {
    const me = host.battle.actor(HOST_PLAYER);

    host.wild.set(id, { creature: "wolf", tier: 1, pack: id, camp: null, lair: null, master: false });
    host.battle.add({ id, kind: "beast", name: CREATURES.wolf.name, weapon: CREATURES.wolf.weapon, team: "beasts", square, map: me.map, ai: null, hp: 400, wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 30, pack: id, leader: null, menace: true, unique: false } });

    return host.battle.actor(id);
}

const order = (host, unit, what) => host.command(HOST_PLAYER, { type: "order", unit, order: what });

describe("a player's own (core/followers.js)", () => {
    it("each calling fights its own way: a mage its people's school's first two spells, a cleric healing, a warrior guarding, a rogue flanking, a ranger keeping off", () => {
        assert.deepEqual(wayOf("mage", "fire"), { casts: ["fireball", "burn"] });
        assert.deepEqual(wayOf("mage", "air"), { casts: ["dustgust", "hurt"] });
        assert.deepEqual(wayOf("cleric"), { heals: [...CLERIC_HEALS] });
        assert.deepEqual(wayOf("warrior"), { tactic: "protect" });
        assert.deepEqual(wayOf("rogue"), { tactic: "flank" });
        assert.deepEqual(wayOf("ranger"), { keep: KEEP_OFF });
        assert.deepEqual(wayOf("bard"), {});

        // (Hired, each so: an elf mage's air)
        const { units } = withFollowers("mage", { calling: "mage", people: "elf" }, "cleric", "warrior", "rogue", "ranger");

        assert.deepEqual(
            units.map(({ casts, heals, tactic = null, keep = null }) => [casts, heals, tactic, keep]),
            [
                [["fireball", "burn"], null, null, null],
                [["dustgust", "hurt"], null, null, null],
                [null, ["vigor", "mendWounds"], null, null],
                [null, null, "protect", null],
                [null, null, "flank", null],
                [null, null, null, KEEP_OFF],
            ],
        );
    });

    it("each has an ability of its own: a calling's, a called creature's, a risen one's; a mage's greater spell by its school's name", () => {
        assert.deepEqual(
            ["warrior", "ranger", "rogue", "mage", "cleric"].map((calling) => abilityOf({ kind: "adventurer", calling })),
            ["shieldBash", "aimedShot", "backstab", "greaterSpell", "healYou"],
        );
        assert.equal(abilityOf({ kind: "summon" }), "savage");
        assert.equal(abilityOf({ kind: "risen" }), "graveGrip");
        assert.equal(abilityOf({ kind: "adventurer", calling: "bard" }), null);
        assert.equal(abilityLabel("greaterSpell", "fire"), "Burstflame");
        assert.equal(abilityLabel("greaterSpell", "water"), "Steamblast");
        assert.equal(abilityLabel("shieldBash"), "Shield bash");

        for (const [id, ability] of Object.entries(UNIT_ABILITIES)) {
            assert.ok(ability.label && ability.about && ability.cooldown > 0, id);
        }
    });

    it("can be given what heals or cures, and nothing else", () => {
        assert.deepEqual(
            ["potion", "meal", "antidote", "ale", "scrollOfSafety", "goblinBomb"].map((id) => givable(ITEMS[id]?.use)),
            [true, true, true, false, false, false],
        );
    });

    it("a mage casts at whom it fights; a cleric heals its leader before anyone more hurt", () => {
        const { host, me, ids, units } = withFollowers("mage", "cleric", "warrior");
        const [mage, cleric, warrior] = ids;
        const foe = wolf(host, "test-wolf", near(host, 4, 0));

        foe.target = HOST_PLAYER;

        const cast = run(host, 3000).filter(({ type }) => type === "cast");

        assert.ok(
            cast.some(({ id, spell, target }) => id === mage && ["fireball", "burn"].includes(spell) && target === foe.id),
            JSON.stringify(cast),
        );

        // (The player hurt, the warrior more so: the player healed first)
        Object.assign(foe, { dead: true, respawnAt: Infinity });
        run(host, 1000);
        me.hp = Math.round(me.maxHp * 0.6);
        units[2].hp = Math.round(units[2].maxHp * 0.2);
        Object.assign(units[1], { spellReadyAt: 0, spellsReadyAt: {} });

        const healed = run(host, 2000).filter(({ type, id }) => type === "cast" && id === cleric);

        assert.equal(healed[0]?.target, HOST_PLAYER, JSON.stringify(healed));
        assert.ok(healed.some(({ target }) => target === warrior), "(and then the warrior)");
    });

    it("a warrior goes for those after its leader first, a rogue for whom its leader's fighting", () => {
        const { host, me, ids } = withFollowers("warrior", "rogue");
        const taken = new Set();
        const near1 = wolf(host, "near-wolf", near(host, 2, 0, taken));
        const after = wolf(host, "after-wolf", near(host, -5, 0, taken));

        after.target = HOST_PLAYER;
        me.order = { type: "engage", target: near1.id };
        run(host, 300);

        assert.equal(host.battle.actor(ids[0]).target, after.id, "the warrior: the one after its leader");
        assert.equal(host.battle.actor(ids[1]).target, near1.id, "the rogue: the one its leader's after");
    });

    it("a ranger keeps off a foe come too near, backing away before it shoots", () => {
        const { host, ids } = withFollowers("ranger");
        const [id] = ids;
        const unit = host.battle.actor(id);
        const [x, y] = unit.square;
        const foe = wolf(host, "test-wolf", nearestFree(squaresOf(host.world.maps[unit.map] ?? host.world), [x + 1, y], { within: 2, taken: new Set(host.battle.actors.map(({ square: [sx, sy] }) => squareKey(sx, sy))) }));

        foe.target = id;
        assert.ok(Math.hypot(foe.x - unit.x, foe.y - unit.y) < KEEP_OFF);
        run(host, 2500);
        assert.ok(Math.hypot(foe.x - unit.x, foe.y - unit.y) >= KEEP_OFF, `${Math.hypot(foe.x - unit.x, foe.y - unit.y)}`);
        assert.equal(unit.target, foe.id);
    });

    it("guarding, takes on only those after it, or after its leader near them; holding fire, only those after it; at will again, any enemy near", () => {
        const { host, me, ids } = withFollowers("warrior");
        const [id] = ids;
        const unit = host.battle.actor(id);
        // (Each a fresh wolf: one struck turns on whoever struck it)
        let count = 0;
        const fresh = () => {
            for (const old of host.battle.actors.filter(({ team, dead }) => team === "beasts" && !dead)) {
                Object.assign(old, { dead: true, respawnAt: Infinity });
            }

            run(host, 1000);

            return wolf(host, `test-wolf-${count++}`, near(host, 3, 0));
        };

        let foe = fresh();

        assert.equal(order(host, id, "guard").ok, true);
        assert.deepEqual(host.stance(id), { guarding: true, holdFire: false, fallingBack: false });
        run(host, 300);
        assert.equal(unit.target, null, "(not after anyone: let be)");

        foe.target = HOST_PLAYER;
        run(host, 300);
        assert.ok(distanceBetween(foe.square, me.square) <= GUARD_REACH);
        assert.equal(unit.target, foe.id, "(after its leader, near them)");

        // (Holding fire: let be, though it's after the player; after it, fought)
        assert.equal(order(host, id, "hold").ok, true);
        foe = fresh();
        foe.target = HOST_PLAYER;
        run(host, 300);
        assert.equal(unit.target, null);
        foe.target = id;
        run(host, 300);
        assert.equal(unit.target, foe.id);

        // (At will, following: any enemy near)
        assert.equal(order(host, id, "free").ok, true);
        assert.equal(order(host, id, "follow").ok, true);
        foe = fresh();
        run(host, 300);
        assert.deepEqual(host.stance(id), { guarding: false, holdFire: false, fallingBack: false });
        assert.equal(unit.target, foe.id);

        // (Waiting, holding fire: the same)
        assert.equal(order(host, id, "wait").ok, true);
        assert.equal(order(host, id, "hold").ok, true);
        foe = fresh();
        foe.target = HOST_PLAYER;
        run(host, 300);
        assert.equal(unit.target, null);
        foe.target = id;
        run(host, 300);
        assert.equal(unit.target, foe.id);
    });

    it("falls back: after no one, running back to its leader, and following again once there", () => {
        const { host, me, ids } = withFollowers("warrior");
        const [id] = ids;
        const unit = host.battle.actor(id);
        const foe = wolf(host, "test-wolf", near(host, 6, 0));

        foe.target = id;
        run(host, 2500);
        assert.equal(unit.target, foe.id);
        foe.target = null;

        assert.equal(order(host, id, "fallback").ok, true);
        assert.equal(host.stance(id).fallingBack, true);
        run(host, STEP_MS);
        assert.equal(unit.target, null);
        assert.ok(unit.walkPace > unit.chaseSpeed, "(running)");

        run(host, FALL_BACK.ms);
        assert.equal(host.stance(id).fallingBack, false);
        assert.ok(Math.hypot(unit.x - me.x, unit.y - me.y) <= 5, `${unit.x - me.x}, ${unit.y - me.y}`);
    });

    it("uses its ability told to: a blow made stronger at whom the player's set on, a greater spell at them, a heal on the player; each once its cooldown's past", () => {
        const { host, me, ids, units } = withFollowers("warrior", "mage", "cleric");
        const [warrior, mage, cleric] = ids;
        const foe = wolf(host, "test-wolf", near(host, 4, 0));

        // (Set on no one: refused)
        assert.equal(order(host, warrior, "ability").reason, "untargeted");
        assert.deepEqual(
            ids.map((id) => host.unitAbility(id)?.label),
            ["Shield bash", "Burstflame", "Heal me"],
        );

        me.lock = foe.id;

        const events = [];

        assert.equal(order(host, warrior, "ability").ok, true);
        assert.deepEqual(units[0].empowered, { blow: "melee", factor: 1, stun: 2000 });
        assert.equal(units[0].assist, foe.id);
        assert.equal(order(host, warrior, "ability").reason, "cooldown");
        assert.equal(host.unitAbility(warrior).readyAt, host.battle.time + UNIT_ABILITIES.shieldBash.cooldown);

        assert.equal(order(host, mage, "ability").ok, true);
        assert.deepEqual(units[1].casting && [units[1].casting.spell, units[1].casting.target], ["burstflame", foe.id]);

        // (The player at full health: nothing to heal; hurt, healed)
        assert.equal(order(host, cleric, "ability").reason, "healthy");
        me.hp = Math.round(me.maxHp / 2);
        assert.equal(order(host, cleric, "ability").ok, true);
        assert.deepEqual([units[2].casting.spell, units[2].casting.target], ["detraumatize", HOST_PLAYER]);

        events.push(...run(host, 100));
        assert.deepEqual(
            events.filter(({ type }) => type === "unitAbility").map(({ unit, label }) => [unit, label]),
            [
                [warrior, "Shield bash"],
                [mage, "Burstflame"],
                [cleric, "Heal me"],
            ],
            "(told, as each was used)",
        );
    });

    it("a called creature's ability: its next blow twice as hard", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: { ...HERO, weapon: "grimoire" }, progress: { spells: ["summon"], gear: { mainHand: { id: "grimoire", quality: "common" } } } });
        Object.assign(host.battle.actor(HOST_PLAYER), { spellReadyAt: 0, spellsReadyAt: {} });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "cast", spell: "summon" }), { ok: true });
        run(host, 2500);

        const [called] = [...host.companions.keys()];
        const foe = wolf(host, "test-wolf", near(host, 4, 0));

        host.battle.actor(HOST_PLAYER).lock = foe.id;
        assert.equal(host.unitAbility(called).label, "Savage blow");
        assert.equal(order(host, called, "ability").ok, true);
        assert.equal(host.battle.actor(called).empowered.factor, 2);
    });

    it("is given a draught to heal it, or a cure for what's on it; not one at full health, nor one too far off", () => {
        const { host, me, ids, units } = withFollowers("warrior");
        const [id] = ids;
        const [unit] = units;
        const use = (item) => host.command(HOST_PLAYER, { type: "use", item, target: id });

        assert.equal(use("potion").reason, "healthy");
        unit.hp = 10;
        assert.equal(use("potion").ok, true);
        assert.equal(unit.hp, 10 + ITEMS.potion.use.heal);
        assert.equal(host.players.get(HOST_PLAYER).progress.count("potion"), 2);
        assert.equal(me.hp, me.maxHp, "(theirs, not the player's)");

        assert.equal(use("antidote").reason, "unafflicted");
        host.battle.afflict(id, "poison", { power: 1 });
        assert.equal(use("antidote").ok, true);
        assert.ok(!unit.afflictions.some(({ kind }) => kind === "poison"));

        Object.assign(unit, { x: me.x + 40, square: [me.square[0] + 40, me.square[1]] });
        assert.equal(use("potion").reason, "far");
    });

    it("kept in a world from before, fights its calling's way (SNAPSHOT_STEPS 41)", () => {
        const snapshot = {
            version: 41,
            followers: [
                ["follower-1", { leader: HOST_PLAYER, calling: "mage", people: "orc" }],
                ["follower-2", { leader: HOST_PLAYER, calling: "cleric", people: "human" }],
            ],
            battle: { actors: [{ id: "follower-1", casts: null, heals: null }, { id: "follower-2", casts: null, heals: null }, { id: "orc", casts: null }] },
        };
        const forward = SNAPSHOT_STEPS[41](snapshot);

        assert.equal(forward.version, 42);
        assert.deepEqual(
            forward.battle.actors.map(({ casts, heals }) => [casts, heals ?? null]),
            [
                [["stoneCrush", "rumble"], null],
                [null, ["vigor", "mendWounds"]],
                [null, null],
            ],
        );
    });
});
