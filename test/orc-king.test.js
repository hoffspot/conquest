// The Orc King's fight (core/creatures.js orcKing, weapons.js NATURAL orcKing), made of the
// building blocks a rare card's foe may be made of (battle.js): moves of its own now and then
// (`moves`: a leap that carries him to whoever keeps off, his axe spun all round him, each shown
// on the ground before it lands), blows struck several times over (`blows`), a kick that throws
// (`toss`), standing on guard, got round only from his side or behind (`stance`), and his
// champions rallied to him as he's worn down (`rally`)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, LEAP, STEP_MS, TOSS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { hypot } from "../client/js/core/exact.js";
import { BLOW_EFFECTS, effectAt, EFFECTS } from "../client/js/core/legendary.js";
import { CLEAVED, fighterOf, mightOf } from "../client/js/core/might.js";
import { Progress } from "../client/js/core/progress.js";
import { makeUnique } from "../client/js/core/rare.js";
import { createRandom } from "../client/js/core/random.js";
import { NATURAL, WEAPONS } from "../client/js/core/weapons.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// The King (or another of the wild) in a battle, as the host puts one out (host.js #rouse), his
// own moves as `change` has them (each by its id: { first, every... }), his guard and his rally
// left out unless they're wanted
function wild(battle, id, kind, square, { hp = 1e5, change = {}, stance = false, rally = false } = {}) {
    const { weapon, speed, chase, name } = CREATURES[kind];
    const traits = traitsOf(kind);
    const moves = traits.moves?.map((move) => ({ ...move, ...(change[move.id] ?? {}) })) ?? null;

    return battle.add({
        id,
        kind: "beast",
        name,
        weapon,
        team: WILD,
        square,
        ai: "wild",
        hp,
        speed,
        chase,
        armed: true,
        wild: { creature: kind, tier: 8, temper: "aggressive", guard: 0, roam: 0, leash: 60, pack: id, leader: null, menace: true, ...traits, moves, stance: stance ? { ...traits.stance, ...stance } : null, rally: rally ? traits.rally : null },
    });
}

// When a blow `at` ms into an attack lands, the battle going on a step at a time (STEP_MS)
const landsAt = (at) => Math.ceil(at / STEP_MS) * STEP_MS;

// A battle played on (ms), its players kept alive
function play(battle, ms, players = []) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        for (const one of players) {
            one.hp = one.maxHp;
        }

        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

const hero = (battle, id, square, team = "hero") => battle.add({ id, kind: "player", weapon: "sword", team, square, hp: 1e5 });

describe("the Orc King's fight (battle.js: moves, blows, toss, stance, rally)", () => {
    it("has his own moves, his guard and his rally; his champions and raiders none", () => {
        const king = traitsOf("orcKing");

        assert.deepEqual(
            king.moves.map(({ id }) => id),
            ["leap", "spin"],
        );
        assert.ok(king.moves.every((move) => move.quake && move.telegraph && move.every > move.duration && move.least < move.most));
        assert.equal(king.moves[0].quake.ahead, 0, "his leap lands all round where he comes down");
        assert.equal(king.moves[1].quake.ahead, 0, "his spin all round him");
        assert.ok(king.moves[0].leap.lift < king.moves[0].hitAt && king.moves[0].least > 3);
        assert.ok(king.stance.chance === 1 && king.stance.share === 1 && king.stance.front < 90 && king.stance.turn > 0);
        assert.deepEqual(
            king.rally.map(({ below, call }) => [+below.toFixed(2), call.kind, call.title]),
            [
                [0.67, "orcIronjaw", "Ironjaw"],
                [0.33, "orcBloodtusk", "Bloodtusk"],
            ],
        );
        assert.ok(CREATURES.orcKing.worldBoss && CREATURES.orcKing.perilous && CREATURES.orcKing.steady);

        for (const kind of ["orcIronjaw", "orcBloodtusk", "orcRaider", "orcWarlord"]) {
            const traits = traitsOf(kind);

            assert.ok(!traits.moves && !traits.stance && !traits.rally, kind);
        }

        // (A copy each: changing one King's changes no other's)
        traitsOf("orcKing").moves[0].every = 1;
        assert.notEqual(traitsOf("orcKing").moves[0].every, 1);
    });

    it("leaps on whoever keeps off: warned of where he'll land, in the air from his spring till he comes down short of them, the ground heaving round there", () => {
        const battle = new Battle(field(40), { seed: 3 });
        const me = hero(battle, "me", [18, 20]);
        const king = wild(battle, "king", "orcKing", [10, 20], { change: { leap: { first: 0 } } });
        const leap = traitsOf("orcKing").moves[0];
        const events = play(battle, 400, [me]);
        const leapt = events.find(({ type }) => type === "leap");

        assert.ok(leapt, events.map(({ type }) => type).join(", "));
        assert.equal(leapt.id, "king");
        assert.equal(leapt.target, "me");
        assert.deepEqual([leapt.lift, leapt.land], [leap.leap.lift, leap.hitAt]);

        // (Short of them, on a free square, as far as LEAP has it)
        const [tx, ty] = leapt.to;

        assert.ok(Math.abs(hypot(me.x - tx, me.y - ty) - LEAP.short) < 0.8, `${hypot(me.x - tx, me.y - ty)}`);

        // (Warned of at once: where he'll land, how far it reaches, and when)
        const telegraph = events.find(({ type }) => type === "telegraph");

        assert.deepEqual([telegraph.x, telegraph.y, telegraph.radius], [tx, ty, leap.quake.radius]);
        assert.equal(telegraph.lands - leapt.time, leap.hitAt);

        // (Where he sprang from till his blow lands; then where he came down, the player caught in
        // the ground heaving and thrown)
        const from = [king.x, king.y];
        const more = play(battle, leap.hitAt + 200, [me]);
        const blast = more.find(({ type, kind }) => type === "blast" && kind === "orcSlam");

        assert.ok(blast, more.map(({ type }) => type).join(", "));
        assert.ok(hypot(king.x - tx, king.y - ty) < 0.8 && hypot(king.x - from[0], king.y - from[1]) > 4);
        assert.deepEqual([blast.x, blast.y], [king.x, king.y]);
        assert.ok(more.some(({ type, id, by }) => type === "hit" && id === "me" && by === "king"));
        assert.deepEqual(
            blast.throws.map(({ id }) => id),
            ["me"],
        );
    });

    it("spins his axe all round him at whoever's close: warned of round him, everyone of theirs in reach hurt, wherever they stand", () => {
        const battle = new Battle(field(40), { seed: 4 });
        const front = hero(battle, "front", [22, 20]);
        const back = hero(battle, "back", [18, 20]);
        const king = wild(battle, "king", "orcKing", [20, 20], { change: { leap: { first: 1e9 }, spin: { first: 0 } } });
        const spin = traitsOf("orcKing").moves[1];
        const events = play(battle, spin.hitAt + 400, [front, back]);
        const telegraph = events.find(({ type }) => type === "telegraph");
        const started = events.find(({ type, attack }) => type === "attack" && attack === "spin");

        assert.ok(started && telegraph, events.map(({ type }) => type).join(", "));
        assert.deepEqual([telegraph.x, telegraph.y, telegraph.radius, telegraph.lands], [king.x, king.y, spin.quake.radius, started.time + spin.hitAt]);
        assert.equal(started.animation, "spin");

        const blast = events.find(({ type, kind }) => type === "blast" && kind === "orcSpin");

        assert.ok(blast);
        assert.equal(blast.time, started.time + landsAt(spin.hitAt));

        for (const id of ["front", "back"]) {
            assert.ok(events.some((event) => event.type === "hit" && event.id === id && event.by === "king" && event.attack === "orcSpin"), id);
        }
    });

    it("strikes his combos three times over, each blow its share of the harm, as his clip has it; his flurry's last and his kick throwing whoever they land on back", () => {
        const [either] = NATURAL.orcKing.attacks;
        const ways = Object.fromEntries(either.either.map((attack) => [attack.id, attack]));

        assert.deepEqual(Object.keys(ways), ["chop", "sweep", "backhand", "combo", "flurry", "kick"]);
        assert.equal(ways.combo.blows.length, 3);
        assert.equal(ways.flurry.blows.length, 3);
        assert.ok(ways.flurry.blows.at(-1).toss > 0 && ways.kick.toss > 0);

        for (const { blows, hitAt, duration } of [ways.combo, ways.flurry]) {
            assert.equal(hitAt, blows[0].at);
            assert.ok(blows.every(({ at }, k) => at < duration && (k === 0 || at > blows[k - 1].at)));
        }

        const battle = new Battle(field(40), { seed: 9 });
        const me = hero(battle, "me", [21, 20]);
        const king = wild(battle, "king", "orcKing", [20, 20], { change: { leap: { first: 1e9 }, spin: { first: 1e9 } } });
        const events = [];

        // (Long enough for each of his ways, the player put back beside him whenever he's thrown)
        for (let t = 0; t < 90000; t += 1000) {
            events.push(...play(battle, 1000, [me]));

            if (hypot(me.x - king.x, me.y - king.y) > 1.6 && !((me.downUntil ?? 0) > battle.time)) {
                Object.assign(me, { square: [21, 20], x: 21.5, y: 20.5, path: [] });
                Object.assign(king, { square: [20, 20], x: 20.5, y: 20.5, path: [] });
            }
        }

        const starts = events.filter(({ type, id }) => type === "attack" && id === "king");

        for (const way of ["combo", "flurry", "kick"]) {
            assert.ok(starts.some(({ attack }) => attack === way), `${way} in ${starts.map(({ attack }) => attack)}`);
        }

        // (Each combo: its blows each as its clip has it, landing or missing, its harm its share)
        const combo = starts.find(({ attack }) => attack === "combo");
        const struck = events.filter(({ type, by, attack, time }) => (type === "hit" || type === "miss") && (by === "king" || type === "miss") && attack === "combo" && time >= combo.time && time < combo.time + ways.combo.duration);

        assert.deepEqual(
            struck.map(({ time }) => time - combo.time),
            ways.combo.blows.map(({ at }) => landsAt(at)),
        );

        const most = Math.ceil(ways.combo.damage[1] * 0.7 * (king.power?.melee ?? 1));

        assert.ok(struck.filter(({ type }) => type === "hit").every(({ damage }) => damage <= most), JSON.stringify(struck));

        // (A kick that lands: its blow, then the player thrown back away from him, told as a shove)
        const shove = events.find(({ type, kind }) => type === "blast" && kind === "shove");

        assert.ok(shove, "a kick that threw");
        assert.equal(shove.by, "king");
        assert.deepEqual(
            shove.throws.map(({ id }) => id),
            ["me"],
        );
        assert.ok(hypot(shove.throws[0].to[0] - shove.throws[0].from[0], shove.throws[0].to[1] - shove.throws[0].from[1]) > TOSS.far * 0.5);
    });

    it("stands on guard, turning slowly after whoever he's after: every blow from in front of him caught, from his side or behind it gets through", () => {
        const battle = new Battle(field(40), { seed: 5 });
        const front = hero(battle, "front", [21, 20]);
        const behind = hero(battle, "behind", [19, 20]);
        const king = wild(battle, "king", "orcKing", [20, 20], { change: { leap: { first: 1e9 }, spin: { first: 1e9 } }, stance: { first: 0, every: 1e9, ms: 6000 } });

        // (Set on the one before him first, then both striking him where they stand)
        Object.assign(king, { target: "front", facing: Math.atan2(front.x - king.x, front.y - king.y) });
        battle.command("front", { type: "engage", target: "king", stand: true });
        battle.command("behind", { type: "engage", target: "king", stand: true });

        // (The way he faces as each step ends, as each blow found him)
        const facing = new Map();
        const events = [];

        for (let t = 0; t < 5000; t += STEP_MS) {
            events.push(...play(battle, STEP_MS, [front, behind]));
            facing.set(battle.time, king.facing);
        }

        const guarded = events.find(({ type }) => type === "guard");

        assert.ok(guarded, events.map(({ type }) => type).join(", "));
        assert.equal(guarded.id, "king");
        assert.equal(guarded.target, "front");

        const during = events.filter(({ time }) => time > guarded.time && time < guarded.until);
        const caught = during.filter(({ type, id }) => type === "blocked" && id === "king");
        const landed = during.filter(({ type, id }) => type === "hit" && id === "king");
        // (How far off the way he faced each blow came from, degrees)
        const off = ({ by, time }) => {
            const striker = battle.actor(by);
            const way = Math.atan2(striker.x - king.x, striker.y - king.y);
            const turn = Math.abs(Math.atan2(Math.sin(way - facing.get(time)), Math.cos(way - facing.get(time))));

            return (turn * 180) / Math.PI;
        };

        // (From in front of him, caught, all of it; from his side or behind, through; the first
        // of each as he first stood, facing the one he was after)
        assert.ok(caught.length >= 1 && caught.every((blow) => blow.damage === 0 && off(blow) <= traitsOf("orcKing").stance.front + 1), JSON.stringify(caught));
        assert.ok(landed.length >= 1 && landed.every((blow) => blow.damage > 0 && off(blow) > traitsOf("orcKing").stance.front - 1), JSON.stringify(landed));
        assert.equal(caught[0].by, "front");
        assert.equal(landed[0].by, "behind");

        // (Turning after them no faster than his guard has it)
        const most = (traitsOf("orcKing").stance.turn * Math.PI) / 180 / (1000 / STEP_MS) + 1e-6;
        const turns = [...facing].filter(([time]) => time > guarded.time + STEP_MS && time < guarded.until).map(([, way]) => way);

        assert.ok(turns.every((way, k) => k === 0 || Math.abs(Math.atan2(Math.sin(way - turns[k - 1]), Math.cos(way - turns[k - 1]))) <= most));

        // (Not striking while he's on guard)
        assert.ok(!during.some(({ type, id }) => type === "attack" && id === "king"));

        // (And his own shield, none, once it's down)
        play(battle, 2000, [front, behind]);
        assert.equal(king.shield ?? null, null);
    });

    it("roars for his champions as he's worn down, once at two thirds and once at one third: each by name, a tier under him", () => {
        const battle = new Battle(field(40), { seed: 6 });
        const me = hero(battle, "me", [22, 20]);
        const king = wild(battle, "king", "orcKing", [20, 20], { hp: 900, change: { leap: { first: 1e9 }, spin: { first: 1e9 } }, rally: true });
        let events = play(battle, 3000, [me]);

        assert.ok(!events.some(({ type }) => type === "call"), "none while he's whole");

        king.hp = 590;
        events = play(battle, 6000, [me]);

        const first = events.filter(({ type }) => type === "call");

        assert.equal(first.length, 1);
        assert.deepEqual([first[0].kind, first[0].title, first[0].down, first[0].count, first[0].most], ["orcIronjaw", "Ironjaw", 1, [1, 1], 1]);
        assert.ok(events.some(({ type, attack, animation }) => type === "attack" && attack === "rally" && animation === "rally"));

        // (Not again at the same mark)
        events = play(battle, 6000, [me]);
        assert.ok(!events.some(({ type }) => type === "call"));

        king.hp = 250;
        events = play(battle, 6000, [me]);

        const second = events.filter(({ type }) => type === "call");

        assert.deepEqual(
            second.map(({ kind, title }) => [kind, title]),
            [["orcBloodtusk", "Bloodtusk"]],
        );
    });
});

describe("Kingsplitter's cleave (core/legendary.js cleave, battle.js #cleave)", () => {
    it("is a unique's own, on every blow with no charge to it, never rolled on a legendary weapon; from half as hard to four fifths by the axe's level", () => {
        assert.ok(EFFECTS.cleave.unique && EFFECTS.cleave.always && !BLOW_EFFECTS.includes("cleave"));
        assert.deepEqual([effectAt("cleave", 1).share, effectAt("cleave", 100).share], [0.5, 0.8]);
        assert.deepEqual([effectAt("cleave", 50).reach, effectAt("cleave", 50).arc], [EFFECTS.cleave.reach, EFFECTS.cleave.arc]);
        assert.equal(effectAt("cleave", 1).damage, undefined, "(its harm the blow's own)");
    });

    it("carries every blow up close on through every other foe before its wielder, each its share as hard; none behind or beside them, no charge filled", () => {
        const battle = new Battle(field(30), { seed: 2 });
        const me = battle.add({ id: "me", kind: "player", weapon: "axe", team: "hero", square: [10, 10], hp: 1e5, power: { melee: 1, ranged: 1 } });
        const foe = (id, square) => battle.add({ id, kind: "beast", name: id, weapon: "rat", team: WILD, square, ai: null, hp: 1e5 });
        const [ahead, beside, behind] = [foe("ahead", [10, 11]), foe("beside", [11, 11]), foe("behind", [10, 9])];

        me.legendary = { effect: "cleave", level: 100, charge: 5 };
        battle.command("me", { type: "engage", target: "ahead", stand: true });

        const events = play(battle, 9000, [me]);
        const blows = events.filter(({ type, by, id }) => type === "hit" && by === "me" && id === "ahead");
        const cleaved = events.filter(({ type, by, attack }) => type === "hit" && by === "me" && attack === "cleave");

        assert.ok(blows.length >= 3, `${blows.length} blows`);
        assert.ok(cleaved.length >= blows.length - 1 && cleaved.every(({ id }) => id === "beside"), JSON.stringify(cleaved.map(({ id }) => id)));
        assert.ok(!events.some(({ type, id, by }) => type === "hit" && id === "behind" && by === "me"));
        assert.ok(events.some(({ type, effect, struck }) => type === "unleashed" && effect === "cleave" && struck.includes("beside")));

        // (As hard as the blow's share would be: the axe's harm, no more than four fifths of its most)
        const most = Math.ceil(WEAPONS.axe.attacks[0].damage[1] * 0.8);

        assert.ok(cleaved.every(({ damage }) => damage >= 1 && damage <= most), JSON.stringify(cleaved.map(({ damage }) => damage)));
        assert.equal(me.charge ?? 0, 0, "(no charge to it)");
        assert.ok(ahead && behind && beside);
    });

    it("counts in a hero's might as more harm from their blows (core/might.js CLEAVED), the more the finer the axe", () => {
        const hero = (level) => new Progress({ gear: { mainHand: { ...makeUnique("kingsplitter", level, createRandom(5)), bonuses: {}, affixes: [] } } }, { weapon: "axe" });
        const plain = new Progress({ gear: { mainHand: { id: "axe", quality: "common", level: 60 } } }, { weapon: "axe" });

        assert.equal(fighterOf(hero(60)).legendary.effect, "cleave");
        assert.ok(mightOf(hero(60)) > mightOf(plain), `${mightOf(hero(60))} vs ${mightOf(plain)}`);
        assert.ok(CLEAVED > 0 && CLEAVED < 1);
    });
});
