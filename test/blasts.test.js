// Blasts that throw (battle.js BOMBS, TOSS, KEEP), the goblins' bombs and their King
// (creatures.js), the Explosion spell (spells.js) and the Goblin Bomb (progress.js ITEMS)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, BOMBS, KEEP, STEP_MS, TOSS } from "../client/js/core/battle.js";
import { candidatesAt, CREATURES, eliteName, eliteOf, memberOf, traitsOf, WILD } from "../client/js/core/creatures.js";
import { SCROLLS } from "../client/js/core/goods.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { ITEMS, SHOPS } from "../client/js/core/progress.js";
import { createRandom } from "../client/js/core/random.js";
import { rollSpoils, SPOILS } from "../client/js/core/spoils.js";
import { SPELLS, tomeOf } from "../client/js/core/spells.js";
import { dailyStock } from "../client/js/core/stock.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { parseGrid } from "./helpers.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// An orc that stays where it's put (stunned a long while), hardy enough to take a blast
function standing(battle, id, square, { team = "orcs", hp = 500, wild = null } = {}) {
    const actor = battle.add({ id, kind: wild ? "beast" : "orc", weapon: wild ? wild.creature : "cleaver", team, square, hp, wild });

    actor.stunnedUntil = 1e9;

    return actor;
}

// A creature of the wild (creatures.js) in a battle, as the host puts one out
function creature(battle, id, kind, square, { hp = 500, elite = false } = {}) {
    const { weapon, speed, chase } = CREATURES[kind];

    return battle.add({ id, kind: "beast", name: CREATURES[kind].name, weapon, team: WILD, square, ai: "wild", hp, speed, chase, armed: true, wild: { creature: kind, tier: 4, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: id, leader: null, menace: true, elite, ...traitsOf(kind) } });
}

const apart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe("bombs and blasts (battle.js BOMBS, TOSS)", () => {
    it("lobs a bomb where its target stands: landing after its flight, fizzing its fuse, then bursting on the thrower's enemies there, hurting and throwing them, never a friend", () => {
        const battle = new Battle(field(40), { seed: 3 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 20], hp: 500 });
        const ally = standing(battle, "ally", [16, 21], { team: "hero" });
        const orc = standing(battle, "orc", [17, 20]);
        const other = standing(battle, "other", [18, 21]);
        const far = standing(battle, "far", [24, 20]);
        const kind = BOMBS.goblinBomb;

        assert.deepEqual(battle.lob("me", "orc", { kind: "goblinBomb", damage: [20, 20], reach: 12 }), { ok: true });

        const events = run(battle, 3000);
        const bomb = events.find(({ type }) => type === "bomb");
        const blast = events.find(({ type }) => type === "blast");

        // (Thrown at where the orc stood, landing as long after as it's far, then its fuse)
        assert.equal(bomb.id, "me");
        assert.deepEqual([bomb.x, bomb.y], [17.5, 20.5]);
        assert.equal(bomb.bursts - bomb.lands, kind.fuse);
        assert.equal(bomb.lands - bomb.time, Math.max(kind.soonest, Math.round((7 / kind.speed) * 1000)));
        assert.ok(blast.time >= bomb.bursts && blast.time < bomb.bursts + STEP_MS, `bursts at ${blast.time}, its fuse burnt down at ${bomb.bursts}`);
        assert.equal(blast.radius, kind.radius);
        assert.equal(blast.by, "me");

        // (The orcs in it hurt, harder at its heart; thrown away from it; the ally and the one
        // out of its reach neither)
        const thrown = Object.fromEntries(blast.throws.map((each) => [each.id, each]));

        assert.deepEqual(Object.keys(thrown).sort(), ["orc", "other"]);
        assert.ok(500 - orc.hp === 20 && 500 - other.hp >= 10 && 500 - other.hp < 20, `${orc.hp}, ${other.hp}`);
        assert.equal(ally.hp, 500);
        assert.equal(far.hp, 500);
        assert.equal(me.hp, 500);

        for (const one of [orc, other]) {
            const { from, to, flight, up, until } = thrown[one.id];
            const away = Math.hypot(to[0] - blast.x, to[1] - blast.y) - Math.hypot(from[0] - blast.x, from[1] - blast.y);

            assert.ok(away > 1 && away <= TOSS.far * kind.toss + 1e-9, `${one.id} thrown ${away.toFixed(2)} m further off`);
            assert.deepEqual([one.x, one.y], to);
            assert.ok(flight > TOSS.flight && up > TOSS.up, `${flight} ms, ${up} m up`);
            assert.ok(until >= blast.time + TOSS.down && one.downUntil === until);
        }
    });

    it("throws its target off its feet: nothing to be done till it's up, and not thrown again for a while after, though hurt", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const me = host.battle.actor(HOST_PLAYER);

        Object.assign(me, { hp: 5000, maxHp: 5000 });
        host.battle.add({ id: "bomber", kind: "player", weapon: "sword", team: "bandits", square: [me.square[0] + 6, me.square[1]], hp: 500 });
        assert.equal(host.battle.lob("bomber", HOST_PLAYER, { kind: "goblinBomb", damage: [5, 5], reach: 12 }).ok, true);

        let blast = null;

        for (let t = 0; t < 4000 && !blast; t += STEP_MS) {
            blast = host.advance(STEP_MS).find(({ type }) => type === "blast") ?? null;
        }

        assert.deepEqual(blast.throws.map(({ id }) => id), [HOST_PLAYER]);
        assert.ok(me.downUntil > host.battle.time && me.stunnedUntil >= me.downUntil, "down, and stunned while they are");

        for (const command of [{ type: "move", to: [me.square[0] - 3, me.square[1]] }, { type: "engage", target: "bomber" }, { type: "cast", spell: "vigor" }]) {
            assert.deepEqual(host.command(HOST_PLAYER, command), { ok: false, reason: "down" }, command.type);
        }

        // (Another bursting on them before long: hurt, not thrown again so soon)
        const hp = me.hp;

        assert.equal(host.battle.lob("bomber", HOST_PLAYER, { kind: "goblinBomb", damage: [5, 5], reach: 12 }).ok, true);

        const again = run(host.battle, 3500).find(({ type }) => type === "blast");

        assert.ok(again && again.time - blast.time < TOSS.spared, `${again?.time - blast.time} ms after`);
        assert.deepEqual(again.throws, []);
        assert.ok(me.hp < hp, "hurt all the same");

        // (Up again, they can go)
        run(host.battle, me.downUntil - host.battle.time + STEP_MS);
        assert.equal(host.command(HOST_PLAYER, { type: "move", to: [me.square[0] - 3, me.square[1]] }).ok, true);
    });

    it("never throws one too heavy or not solid (steady), an elite, or one of the perilous places' own", () => {
        const steady = Object.entries(CREATURES).filter(([, one]) => one.steady).map(([id]) => id);

        for (const id of ["bear", "troll", "ogre", "dragon", "ghost", "wraith"]) {
            assert.ok(steady.includes(id), id);
        }

        for (const id of ["goblin", "goblinBomber", "wolf", "bandit"]) {
            assert.ok(!steady.includes(id), id);
        }

        const battle = new Battle(field(30), { seed: 4 });

        battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [5, 15], hp: 500 });
        creature(battle, "bear", "bear", [12, 15]).stunnedUntil = 1e9;
        creature(battle, "king", "goblinKing", [13, 16], { elite: true }).stunnedUntil = 1e9;
        creature(battle, "goblin", "goblin", [12, 16]).stunnedUntil = 1e9;
        battle.lob("me", "bear", { kind: "goblinBomb", damage: [10, 10], reach: 12 });

        const blast = run(battle, 3500).find(({ type }) => type === "blast");

        assert.deepEqual(blast.throws.map(({ id }) => id), ["goblin"]);
        assert.ok(battle.actor("bear").hp < 500 && battle.actor("king").hp < 500, "hurt all the same");
    });

    it("says why a bomb can't be thrown: in the midst of something, no enemy, out of reach or out of sight", () => {
        const walled = { blocked: parseGrid(["....#....", "....#....", "....#...."]).map((row) => Uint8Array.from(row)) };
        const battle = new Battle(walled, { seed: 1 });

        battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [1, 1] });
        battle.add({ id: "friend", kind: "player", weapon: "sword", team: "hero", square: [2, 1] });
        standing(battle, "behind", [7, 1]);

        const lob = (target, reach = 12) => battle.lob("me", target, { kind: "goblinBomb", damage: [5, 5], reach });

        assert.deepEqual(lob("friend"), { ok: false, reason: "target" });
        assert.deepEqual(lob(null), { ok: false, reason: "target" });
        assert.deepEqual(lob("behind", 3), { ok: false, reason: "range" });
        assert.deepEqual(lob("behind"), { ok: false, reason: "sight" });

        standing(battle, "near", [3, 2]);
        assert.deepEqual(lob("near"), { ok: true });
        assert.deepEqual(lob("near"), { ok: false, reason: "midst" });
    });

    it("carries bombs in the air and fizzing on in a snapshot, bursting just as they would have", () => {
        const make = () => {
            const battle = new Battle(field(30), { seed: 9 });

            battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [5, 15], hp: 500 });
            standing(battle, "orc", [11, 15]);
            standing(battle, "other", [12, 16]);

            return battle;
        };
        const battle = make();

        battle.lob("me", "orc", { kind: "goblinBomb", damage: [8, 16], reach: 12 });
        run(battle, 900);
        assert.equal(battle.bombs.length, 1);

        const again = Battle.restore(field(30), structuredClone(battle.snapshot()));
        const [ours, theirs] = [run(battle, 3000), run(again, 3000)];
        const blasts = (events) => events.filter(({ type }) => type === "blast");

        assert.equal(blasts(ours).length, 1);
        assert.deepEqual(blasts(theirs), blasts(ours));
        assert.deepEqual(["orc", "other"].map((id) => [again.actor(id).hp, again.actor(id).x, again.actor(id).y]), ["orc", "other"].map((id) => [battle.actor(id).hp, battle.actor(id).x, battle.actor(id).y]));
    });
});

describe("the goblins' bombs (creatures.js, weapons.js NATURAL)", () => {
    it("mixes a bomber in among a goblin pack now and then, never leading it nor out on its own; the goblins led by their King as their elite", () => {
        const random = createRandom(3);
        const members = Array.from({ length: 4000 }, () => memberOf("goblin", 1 + random.int(0, 3), random.next()));
        const share = members.filter((id) => id === "goblinBomber").length / members.length;

        assert.ok(Math.abs(share - CREATURES.goblin.band.goblinBomber) < 0.03, `${share}`);
        assert.ok(members.every((id) => id === "goblin" || id === "goblinBomber"));
        assert.equal(memberOf("goblin", 0, 0), "goblin", "the leader's a raider");
        assert.equal(memberOf("wolf", 2, 0), "wolf", "the others' all of a kind");

        assert.equal(eliteOf("goblin"), "goblinKing");
        assert.equal(eliteOf("wolf"), "wolf");
        assert.equal(eliteName("goblinKing"), "Goblin King");
        assert.equal(eliteName("goblin"), "Elite Goblin raider");

        for (let tier = 1; tier <= 10; tier++) {
            for (const biome of ["heath", "mountain", "badlands", "woods", "grass"]) {
                const found = candidatesAt({ biome, race: "human" }, tier, true).map(({ id }) => id);

                assert.ok(!found.includes("goblinBomber") && !found.includes("goblinKing"), `${biome} ${tier}`);
            }
        }
    });

    it("has a bomber keep its distance, backing off from whoever comes near, and lob bombs from there with a warning fuse; its bombs throw", () => {
        const battle = new Battle(field(60), { seed: 5 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [30, 30], hp: 5000 });
        const bomber = creature(battle, "bomber", "goblinBomber", [36, 30]);
        const attack = NATURAL.goblinBomber.attacks.find(({ bomb }) => bomb);

        assert.equal(attack.bomb, "goblinBomb");
        assert.equal(traitsOf("goblinBomber").keep, 4);

        // (Lobbing at the player from where it is)
        const events = run(battle, 3000);
        const bomb = events.find(({ type, id }) => type === "bomb" && id === "bomber");

        assert.ok(bomb, "a bomb lobbed");
        assert.equal(bomb.kind, "goblinBomb");

        // (Come right up to it: it backs off, as far again as it keeps, and a little more)
        Object.assign(me, { x: bomber.x - 1.5, y: bomber.y, square: [Math.floor(bomber.x - 1.5), Math.floor(bomber.y)], path: [], stunnedUntil: 1e9 });

        const spot = { x: me.x, y: me.y };

        run(battle, 2500);
        assert.ok(apart(spot, bomber) >= CREATURES.goblinBomber.keep, `backed off to ${apart(spot, bomber).toFixed(1)} m from them`);
        assert.ok(bomber.backOffAt > battle.time - 2500 && bomber.backOffAt <= battle.time + KEEP.every, "not again for a while");
    });

    it("has the Goblin King cleave whoever's near and lob a big bomb now and then at whoever keeps off; never thrown itself", () => {
        const battle = new Battle(field(60), { seed: 6 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [30, 30], hp: 5000 });
        const king = creature(battle, "king", "goblinKing", [37, 30], { hp: 5000, elite: true });
        const { every, kind } = CREATURES.goblinKing.bomb;

        me.stunnedUntil = 1e9;

        const events = run(battle, every + 3000);
        const bombs = events.filter(({ type, id }) => type === "bomb" && id === "king");
        const blasts = events.filter(({ type, by }) => type === "blast" && by === "king");

        assert.ok(bombs.length >= 1 && bombs.every((bomb) => bomb.kind === kind), JSON.stringify(bombs));
        assert.ok(BOMBS.bigBomb.radius > BOMBS.goblinBomb.radius && BOMBS.bigBomb.toss > BOMBS.goblinBomb.toss);

        for (let k = 1; k < bombs.length; k++) {
            assert.ok(bombs[k].bursts - bombs[k - 1].bursts >= every - 2 * STEP_MS, "no sooner than every so often");
        }

        // (Its blasts throw the player, never the King nor its own; up close, its cleaver)
        assert.ok(blasts.length >= 1 && blasts.every((blast) => !blast.throws.some(({ id }) => id === "king")));

        Object.assign(me, { x: king.x - 1, y: king.y, square: [Math.floor(king.x - 1), Math.floor(king.y)], path: [], thrownAt: battle.time, downUntil: 0, stunnedUntil: 1e9 });

        const close = run(battle, 4000);

        assert.ok(close.some(({ type, id, weapon }) => type === "attack" && id === "king" && weapon === "cleaver"), "cleaves up close");
    });
});

describe("the Explosion spell (spells.js)", () => {
    it("is a rare tome: a blast at an enemy that throws those round it, never the caster nor a friend; never a scroll", () => {
        const spell = SPELLS.explosion;

        assert.equal(spell.tome, "rare");
        assert.equal(spell.target, "enemy");
        assert.ok(spell.blast.toss > BOMBS.goblinBomb.toss && spell.area > BOMBS.goblinBomb.radius);
        assert.ok(ITEMS[tomeOf("explosion")]);
        assert.ok(!Object.values(SCROLLS).some(({ spell: id }) => id === "explosion"), "no scroll of it");

        const battle = new Battle(field(40), { seed: 7 });

        battle.add({ id: "me", kind: "player", weapon: "wand", team: "hero", square: [10, 20], hp: 500 });
        standing(battle, "ally", [17, 21], { team: "hero" });
        standing(battle, "orc", [18, 20]);
        standing(battle, "other", [19, 22]);
        assert.deepEqual(battle.cast("me", "explosion", "orc"), { ok: true });

        const blast = run(battle, spell.castTime + 1000).find(({ type }) => type === "blast");

        assert.equal(blast.spell, "explosion");
        assert.deepEqual(blast.throws.map(({ id }) => id).sort(), ["orc", "other"]);
        assert.equal(battle.actor("ally").hp, 500);
        assert.ok(battle.actor("orc").hp <= 500 - spell.damage[0] && battle.actor("other").hp < 500);
    });
});

describe("Goblin Bombs and the Explosion tome found and sold (spoils.js, stock.js, host.js)", () => {
    it("has bombers carry Goblin Bombs more often than not, a raider now and then, the King a handful and likelier an Explosion tome", () => {
        const random = createRandom(13);
        const tally = (kind, elite = false, n = 3000) => {
            const counts = { bombs: 0, with: 0, explosion: 0 };

            for (let k = 0; k < n; k++) {
                const { items } = rollSpoils(kind, 4, random, CREATURES[kind].tiers[0], { elite });
                const bombs = items.filter(({ id }) => id === "goblinBomb").reduce((sum, { count }) => sum + count, 0);

                counts.bombs += bombs / n;
                counts.with += bombs ? 1 / n : 0;
                counts.explosion += items.some(({ id }) => id === tomeOf("explosion")) ? 1 / n : 0;
            }

            return counts;
        };
        const [raider, bomber, king] = [tally("goblin"), tally("goblinBomber"), tally("goblinKing", true)];

        assert.ok(raider.with > 0.1 && raider.with < 0.35, JSON.stringify(raider));
        assert.ok(bomber.with > 0.7 && bomber.bombs > 1.4, JSON.stringify(bomber));
        assert.ok(king.with > 0.9 && king.bombs > 3, JSON.stringify(king));
        assert.ok(king.explosion > 10 * Math.max(raider.explosion, bomber.explosion, 0.01), JSON.stringify({ raider, bomber, king }));
        assert.ok(SPOILS.goblinKing.items.some(({ id }) => id === tomeOf("explosion")));
    });

    it("has the master emporium's daily special now and then an Explosion tome, and no other shop's", () => {
        assert.deepEqual(SHOPS.emporium.daily.specials, [tomeOf("explosion")]);

        const days = 300;
        const specials = Array.from({ length: days }, (each, day) => dailyStock("emporium", { seed: 4, key: "x/y", day }).special.id);
        const share = specials.filter((id) => id === tomeOf("explosion")).length / days;

        assert.ok(share > 0.03 && share < 0.25, `${share}`);

        for (const [shop, { daily }] of Object.entries(SHOPS)) {
            if (daily && shop !== "emporium") {
                assert.ok(!(daily.specials ?? []).length, shop);
            }
        }
    });

    it("throws a Goblin Bomb from the pack at a foe within reach, one used each time; out of reach, kept", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const me = host.battle.actor(HOST_PLAYER);
        const { progress } = host.players.get(HOST_PLAYER);
        const { reach } = ITEMS.goblinBomb.use;

        progress.stow({ id: "goblinBomb" }, 2);
        host.battle.add({ id: "foe", kind: "player", weapon: "sword", team: "bandits", square: [me.square[0] + Math.ceil(reach) + 3, me.square[1]], hp: 500 }).stunnedUntil = 1e9;

        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", index: 0, target: "foe" }), { ok: false, reason: "range" });
        assert.equal(progress.pack[0].count, 2, "kept");

        const foe = host.battle.actor("foe");

        Object.assign(foe, { x: me.x + 6, square: [Math.floor(me.x + 6), foe.square[1]] });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "use", index: 0, target: "foe" }), { ok: true });
        assert.equal(progress.pack[0].count, 1);

        const events = run(host.battle, 4000);

        assert.ok(events.some(({ type, id, kind }) => type === "bomb" && id === HOST_PLAYER && kind === "goblinBomb"));
        assert.ok(events.some(({ type, throws }) => type === "blast" && throws.some(({ id }) => id === "foe")));
        assert.ok(foe.hp <= 500 - ITEMS.goblinBomb.use.damage[0] / 2);
    });
});
