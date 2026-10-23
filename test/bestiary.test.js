// The bestiary (client/js/core/bestiary.js, app/bestiary.js; docs/GAME.md *The bestiary*): each
// kind of creature's research, from seeing one, reading its signs and slaying it, a level at a
// time, and what each level tells of it; a page for every creature, in the game's own words; the
// host writing in what a player sees and slays, the guilds paying for their notes on a kind
// mastered, and their blows at it the harder for it; and all of it kept with the character
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contentsOf, guardsOf, homesOf, pageOf, whereOf } from "../client/js/app/bestiary.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { Bestiary, levelAt, MASTERED, PAY, payOf, RESEARCH } from "../client/js/core/bestiary.js";
import { CREATURES, WILD } from "../client/js/core/creatures.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { BESTIARY_LORE } from "../client/js/core/lore/bestiary.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { Progress } from "../client/js/core/progress.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// The bestiary's events, as told (not when)
const told = (events) => events.filter(({ type }) => type === "bestiary").map(({ time: _time, ...event }) => event);

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// The player out in seed 2's wilds, 80 m west of their town's edge, nothing about them, by day
function outside() {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);
    const [middle, radius] = [world.stamp.middle, SETTLEMENT_KINDS[world.start.kind].radius];

    put(me, [Math.floor(middle[0] - radius - 80), Math.floor(middle[1] - 20)]);
    Object.assign(me, { hp: 5000, maxHp: 5000 });
    host.battle.light = { ...host.battle.light, sun: 1 };
    run(host, 600);

    for (const id of [...host.wild.keys()]) {
        host.battle.remove(id);
        host.wild.delete(id);
    }

    return { host, me };
}

// One of a kind put into the wild at a square, standing its ground, as the host has its own
function beast(host, id, creature, square, { hp = 5000 } = {}) {
    host.wild.set(id, { creature, tier: 1, pack: id, camp: null, lair: null, master: false });
    host.battle.add({ id, kind: "beast", name: CREATURES[creature].name, weapon: CREATURES[creature].weapon, team: WILD, square, ai: "wild", hp, speed: 0.01, chase: 0.01, wild: { creature, tier: 1, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: id, leader: null, menace: false } });

    return host.battle.actor(id);
}

// A square `out` squares from the player that they can see, if there's one
function seenFrom(host, me, out) {
    for (let k = 0; k < 16; k++) {
        const angle = (k * Math.PI) / 8;
        const square = [me.square[0] + Math.round(Math.cos(angle) * out), me.square[1] + Math.round(Math.sin(angle) * out)];

        if (host.battle.canSee(me, { ...me, square, x: square[0] + 0.5, y: square[1] + 0.5 }, RESEARCH.sight)) {
            return square;
        }
    }

    return null;
}

describe("a player's research into each kind of creature (core/bestiary.js)", () => {
    it("grows a level at a time, from the first sight of one to Mastered, by seeing, reading its signs and slaying", () => {
        const bestiary = new Bestiary();

        assert.equal(bestiary.levelOf("wolf"), 0);
        assert.deepEqual(bestiary.see("wolf"), { creature: "wolf", from: 0, to: 1, how: "seen" });
        assert.equal(bestiary.see("wolf"), null, "seen once is enough");
        assert.equal(bestiary.read("wolf"), null);
        assert.deepEqual(bestiary.read("wolf"), { creature: "wolf", from: 1, to: 2, how: "sign" });

        for (let k = 0; k < 2; k++) {
            assert.equal(bestiary.slay("wolf"), null);
        }

        assert.deepEqual(bestiary.slay("wolf"), { creature: "wolf", from: 2, to: 3, how: "slain" });
        assert.equal(bestiary.slay("wolf", { mighty: true }), null);
        assert.deepEqual(bestiary.slay("wolf"), { creature: "wolf", from: 3, to: MASTERED, how: "slain" });
        assert.deepEqual(bestiary.entry("wolf"), { points: RESEARCH.levels.at(-1).points, seen: true, signs: 2, slain: 5, level: MASTERED });
        assert.deepEqual(bestiary.mastered(), ["wolf"]);

        // (One of the mightiest slain: five times the research one of the rest is)
        const dragon = new Bestiary();

        assert.deepEqual(dragon.slay("dragon", { mighty: true }), { creature: "dragon", from: 0, to: 2, how: "slain" });
        assert.equal(levelAt(0), 0);
        assert.equal(levelAt(RESEARCH.levels.at(-1).points * 3), MASTERED);

        // (Nothing of what isn't a creature)
        assert.equal(bestiary.see("dragonfly"), null);
        assert.equal(bestiary.slay("dragonfly"), null);
        assert.equal(bestiary.entry("dragonfly").level, 0);
    });

    it("is kept, and carried with the character (Progress), only what's sound of what was kept taken back", () => {
        const bestiary = new Bestiary();

        bestiary.see("boar");
        bestiary.slay("boar");
        assert.deepEqual(new Bestiary(decode(encode(bestiary.toJSON()))).kinds, bestiary.kinds);
        assert.deepEqual(new Bestiary({ dragonfly: { points: 5 }, wolf: { points: -3, seen: "yes", signs: "two", slain: 2.7 }, rat: null }).kinds, { wolf: { points: 0, seen: false, signs: 0, slain: 2 } });
        assert.deepEqual(new Bestiary([1, 2]).kinds, {});

        const progress = new Progress({ bestiary: bestiary.toJSON() });

        assert.deepEqual(progress.bestiary.kinds, bestiary.kinds);
        assert.deepEqual(new Progress(progress.toJSON()).bestiary.kinds, bestiary.kinds);
        assert.deepEqual(new Progress().bestiary.kinds, {}, "none yet");
    });

    it("is paid for by the guilds once a kind's Mastered: more for one met further out, twice as much for the mightiest", () => {
        assert.ok(payOf("rat").gold < payOf("wolf").gold && payOf("wolf").gold < payOf("troll").gold);
        assert.ok(payOf("rat").merit <= payOf("troll").merit);
        assert.deepEqual(payOf("dragon"), { gold: 2 * (PAY.gold + PAY.goldPerTier * 10), merit: Math.round(2 * (PAY.merit + PAY.meritPerTier * 10)) });
    });
});

describe("the journal's bestiary (app/bestiary.js)", () => {
    it("has words for every creature: what it is, and the sign of it on its trail", () => {
        assert.deepEqual(Object.keys(BESTIARY_LORE), Object.keys(CREATURES));

        for (const [kind, { lore, sign }] of Object.entries(BESTIARY_LORE)) {
            assert.ok(lore.length > 40 && sign.length > 8, kind);
            assert.ok(!/[—–!]/.test(lore + sign), `${kind}: no dashes or exclamations`);
        }
    });

    it("has a page for every creature, a part of it more opening at each level, in the game's own words", () => {
        for (const kind of Object.keys(CREATURES)) {
            for (let level = 0; level <= MASTERED; level++) {
                const points = RESEARCH.levels[level - 1]?.points ?? 0;
                const page = pageOf(kind, { points, seen: level > 0, signs: 1, slain: 2 });
                const words = page.sections.flatMap(({ heading, lines }) => [heading, ...lines]).join(" ");

                assert.equal(page.level, level, kind);
                assert.equal(page.name, CREATURES[kind].name);
                assert.equal(page.sections.filter(({ open }) => open).length, level, `${kind} at ${level}`);
                assert.ok(page.sections.filter(({ open }) => !open).every(({ lines }) => lines.length === 1 && /watch for it/.test(lines[0])), kind);
                assert.ok(!/undefined|NaN|null|\[object/.test(words), `${kind}: ${words}`);

                if (level >= 1) {
                    assert.ok(page.sections[0].lines.includes(BESTIARY_LORE[kind].lore));
                    assert.ok(page.sections[0].lines.some((line) => line.startsWith("Met ")), kind);
                }

                if (level >= 2) {
                    assert.ok(page.sections[1].lines.some((line) => line.includes(BESTIARY_LORE[kind].sign)), kind);
                }

                if (level >= 3) {
                    assert.match(page.sections[2].lines[0], /\d+ hit points/, kind);
                }

                if (level >= MASTERED) {
                    assert.ok(page.sections[3].lines.some((line) => line.includes(`${payOf(kind).gold} gold`)), kind);
                }
            }
        }
    });

    it("tells where each is met, and the camps and lairs it keeps to and who guards it there", () => {
        assert.match(whereOf("wolf"), /^in the woods/);
        assert.equal(whereOf("hyena"), "anywhere in the cat folk's wilds");
        assert.equal(whereOf("ant"), "in the ants' nests");
        assert.equal(whereOf("fiend"), "in the hells");
        assert.equal(whereOf("rat"), "anywhere");
        assert.deepEqual(homesOf("wolf"), ["the wolf packs' camps"]);
        assert.deepEqual(homesOf("direWolf"), ["the wolf packs' camps", "the werewolves' dens"]);
        assert.deepEqual(homesOf("cultist"), ["the cultists' camps", "the hells' ways in, by night"]);
        assert.equal(guardsOf("moonfang"), "two werewolves and three dire wolves");
        assert.equal(guardsOf("wightLord"), "three skeletons, two restless ghosts and a wraith");
        assert.equal(guardsOf("wolf"), null);
    });

    it("lists the kinds met by where they're met, the best known first", () => {
        const contents = contentsOf({ rat: { points: 1 }, wolf: { points: 8 }, hyena: { points: 4 }, ant: { points: 14 }, fiend: { points: 1 }, dragon: { points: 5 }, boar: { points: 0 }, dragonfly: { points: 9 } });

        assert.deepEqual(
            contents.map(({ kind, group }) => [kind, group]),
            [
                ["wolf", "The wilds"],
                ["rat", "The wilds"],
                ["hyena", "The cat folk's wilds"],
                ["dragon", "Lairs and strongholds"],
                ["ant", "The ants' nests"],
                ["fiend", "The hells"],
            ],
        );
        assert.deepEqual(contents[0], { kind: "wolf", name: "Wolf", level: 3, title: "Studied", group: "The wilds" });
    });
});

describe("the bestiary in play (core/host.js)", () => {
    it("writes in each creature a player sees for the first time, as far as they can see it", () => {
        const { host, me } = outside();
        const near = seenFrom(host, me, 12);

        assert.ok(near, "somewhere near to see");
        beast(host, "test-boar", "boar", near);
        beast(host, "test-wolf", "wolf", [me.square[0] + RESEARCH.sight + 15, me.square[1]]);

        const events = told(run(host, 1500));
        const research = host.players.get(HOST_PLAYER).progress.bestiary;

        assert.deepEqual(events, [{ type: "bestiary", id: HOST_PLAYER, creature: "boar", from: 0, to: 1, how: "seen" }]);
        assert.equal(research.levelOf("boar"), 1);
        assert.equal(research.levelOf("wolf"), 0, "too far off to be seen");

        // (Seen once is enough: nothing more of it while it's in sight)
        assert.deepEqual(told(run(host, 1500)), []);
    });

    it("writes in each one slain; Mastered, the guilds pay for the notes on it, and the player's blows at its kind land harder", () => {
        const { host, me } = outside();
        const player = host.players.get(HOST_PLAYER);
        const gold = player.progress.gold;

        player.standing.register();
        player.progress.bestiary.kinds.wolf = { points: RESEARCH.levels.at(-1).points - 1, seen: true, signs: 3, slain: 6 };
        beast(host, "test-wolf", "wolf", [me.square[0] + 1, me.square[1]], { hp: 1 });
        host.command(HOST_PLAYER, { type: "engage", target: "test-wolf" });

        const events = told(run(host, 4000));
        const { gold: paid, merit } = payOf("wolf");

        assert.deepEqual(events, [{ type: "bestiary", id: HOST_PLAYER, creature: "wolf", from: 3, to: MASTERED, how: "slain", gold: paid, merit }]);
        assert.equal(player.progress.bestiary.entry("wolf").slain, 7);
        assert.ok(player.progress.gold >= gold + paid, "paid (and whatever it had on it)");
        assert.equal(player.standing.guild.merit, merit);
        assert.deepEqual(me.mastered, ["wolf"]);

        // The same blows at a wolf, a kind mastered and not: each a tenth harder (RESEARCH.edge)
        beast(host, "test-target", "wolf", [me.square[0] + 1, me.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: "test-target" });
        run(host, 300);

        const snapshot = host.snapshot();
        const hits = (mastered) => {
            const again = Host.restore(buildWorld({ seed: 2 }), structuredClone(snapshot));

            if (!mastered) {
                delete again.players.get(HOST_PLAYER).progress.bestiary.kinds.wolf;
                again.battle.actor(HOST_PLAYER).mastered = [];
            }

            return run(again, 6000)
                .filter(({ type, by, id }) => type === "hit" && by === HOST_PLAYER && id === "test-target")
                .map(({ damage }) => damage);
        };
        const [known, unknown] = [hits(true), hits(false)];

        assert.ok(known.length >= 3 && known.length === unknown.length, `${known} ${unknown}`);
        assert.deepEqual(
            known,
            unknown.map((damage) => Math.max(1, Math.round(damage * RESEARCH.edge))),
        );
    });

    it("counts one of the mightiest slain as worth the more, and one slain unseen as seen", () => {
        const { host, me } = outside();
        const player = host.players.get(HOST_PLAYER);

        beast(host, "test-troll", "troll", [me.square[0] + 1, me.square[1]], { hp: 1 });
        host.wild.get("test-troll").elite = "lead";
        host.command(HOST_PLAYER, { type: "engage", target: "test-troll" });
        run(host, 4000);
        assert.deepEqual(player.progress.bestiary.entry("troll"), { points: RESEARCH.seen + RESEARCH.mighty, seen: true, signs: 0, slain: 1, level: 2 });
    });

    it("carries a world kept before there was one on, every player's empty", () => {
        const { host } = outside();
        const snapshot = host.snapshot();
        const old = { ...snapshot, version: 32, players: snapshot.players.map(({ progress: { bestiary: _bestiary, ...progress }, ...player }) => ({ ...player, progress })), battle: { ...snapshot.battle, actors: snapshot.battle.actors.map(({ mastered: _mastered, ...actor }) => actor) } };
        const stepped = SNAPSHOT_STEPS[32](structuredClone(old));

        assert.equal(stepped.version, 33);
        assert.ok(stepped.players.every(({ progress }) => progress.bestiary && Object.keys(progress.bestiary).length === 0));
        assert.deepEqual(stepped.battle.actors.find(({ id }) => id === HOST_PLAYER).mastered, []);
        assert.deepEqual(Host.restore(buildWorld({ seed: 2 }), stepped).players.get(HOST_PLAYER).progress.bestiary.kinds, {});
    });
});
