// The dungeons' bosses' own fights (core/fights.js FIGHTS, battle.js #boss): every boss with one;
// phases at its marks, told, what's set out to be broken with them; a wedge before it, a pool left
// where it lands; things falling across its arena, shown first; shielded while what's set out
// stands; quicker; its hurts regrowing, stopped by fire; its bloodlust; what's set out hatching;
// and fought too long, its enrage
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, HAZARDS, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { THEMES } from "../client/js/core/dungeons/themes.js";
import { hypot } from "../client/js/core/exact.js";
import { FIGHT_OBJECTS, FIGHTS, withFight } from "../client/js/core/fights.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// A boss in a battle as the host puts one out (host.js #rouse), its fight on it
function boss(battle, id, kind, regalia, square, { hp = 1000 } = {}) {
    const { weapon, speed, chase, name } = CREATURES[kind];

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
        wild: { creature: kind, tier: 8, temper: "aggressive", guard: 0, roam: 0, leash: 60, pack: id, leader: null, menace: true, ...withFight(traitsOf(kind, { boss: true }), regalia), champion: "boss", regalia },
    });
}

// Something set out to be broken, as the host sets it out (host.js #fightPhase)
function object(battle, id, kind, square, hatch = null) {
    const { weapon, speed, chase, name } = CREATURES[kind];

    return battle.add({ id, kind: "beast", name, weapon, team: WILD, square, ai: "wild", hp: 50, speed, chase, wild: { creature: kind, tier: 8, temper: "aggressive", guard: 0, roam: 0, leash: 1, pack: id, leader: null, ...traitsOf(kind), ...(hatch ? { hatch } : {}) } });
}

const hero = (battle, id, square) => battle.add({ id, kind: "player", weapon: "sword", team: "hero", square, hp: 1e5 });

// A battle played on (ms), its heroes kept alive
function play(battle, ms, heroes = []) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        for (const one of heroes) {
            one.hp = one.maxHp;
        }

        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

describe("the dungeons' bosses' fights (core/fights.js, battle.js #boss)", () => {
    it("has one for every dungeon's boss, every hell's master and every warden of the keep; none for no one", () => {
        const bosses = Object.values(THEMES).flatMap((theme) => [...theme.bosses.map(({ id }) => id), ...(theme.realms ?? []).flatMap(({ warden }) => (warden ? [warden.id] : []))]);

        assert.deepEqual(
            bosses.filter((id) => !FIGHTS[id]),
            [],
        );
        assert.deepEqual(
            Object.keys(FIGHTS).filter((id) => !bosses.includes(id)),
            [],
        );
        assert.equal(bosses.length, 20);
    });

    it("makes each of what its creature can do: its moves shown first, its phases in turn at falling marks, what it calls and sets out real creatures", () => {
        for (const [id, fight] of Object.entries(FIGHTS)) {
            const phases = fight.phases ?? [{}];

            assert.equal(phases[0].below, undefined, `${id}: its first phase from the start`);
            assert.ok(
                phases.slice(1).every((phase, k) => phase.below > 0 && phase.below <= 1 && (k === 0 || phase.below < phases[k].below)),
                `${id}: its marks falling`,
            );

            for (const move of fight.moves ?? []) {
                assert.ok(move.every > move.duration && move.hitAt < move.duration && (move.phase ?? 0) < phases.length, `${id} ${move.id}`);
                assert.ok(!move.quake || move.telegraph, `${id} ${move.id}: shown first`);
                assert.ok(!move.quake?.pool || HAZARDS[move.quake.pool.kind], `${id} ${move.id}: its pool`);
            }

            for (const { call } of fight.rally ?? []) {
                assert.ok(CREATURES[call.kind] && !CREATURES[call.kind].object, `${id}: calls ${call.kind}`);
            }

            for (const { objects, falls, shield, regrow, drain, faster } of phases) {
                assert.ok(!objects || (CREATURES[objects.kind]?.object && objects.count >= 3 && CREATURES[objects.hatch.kind]), `${id}: sets out ${objects?.kind}`);
                assert.ok(!shield || (FIGHT_OBJECTS.includes(shield.kind) && shield.share < 1 && shield.least >= 1), `${id}: shielded`);
                assert.ok(!falls || (falls.delay >= 1200 && falls.every > falls.delay && falls.radius > 1 && (!falls.pool || HAZARDS[falls.pool.kind])), `${id}: falls shown long enough first`);
                assert.ok(!regrow || (regrow.share > 0 && regrow.share < 0.02 && regrow.stop > 1000), `${id}: regrows`);
                assert.ok(!drain || (drain > 0 && drain < 1), `${id}: drains`);
                assert.ok(!faster || (faster > 1 && faster < 1.5), `${id}: quicker`);
            }

            assert.ok(!fight.enrage || fight.enrage.after >= 300000, `${id}: enraged only after five minutes or more`);
        }

        // (What's set out: none moves or strikes, each one of the creatures)
        assert.deepEqual([...FIGHT_OBJECTS].sort(), ["antClutch", "eggSac", "soulJar"]);
        assert.ok(FIGHT_OBJECTS.every((kind) => CREATURES[kind].object && CREATURES[kind].steady && traitsOf(kind).object));
    });

    it("lays a fight onto its creature's own ways: moves after its kind's, its bomb, rally, stance and hover in their place", () => {
        const prior = withFight(traitsOf("priorVane", { boss: true }), "prior");

        assert.deepEqual(
            prior.moves.map(({ id }) => id),
            ["toll", "toll2"],
        );
        assert.equal(prior.rally.length, 2, "his own rally kept, the fight having none");
        assert.equal(prior.fight.phases.length, 3);
        assert.ok(prior.fight.enrage.after > 0);

        const troll = withFight(traitsOf("troll", { boss: true }), "trollKing");

        assert.equal(troll.bomb.kind, "boulder");
        assert.ok(troll.bomb.far);

        // (One with no fight of its own: as it was)
        assert.deepEqual(withFight(traitsOf("troll"), "troll"), traitsOf("troll"));
    });

    it("comes to each phase at its mark, told and setting out what's to be broken; quicker as it says", () => {
        const battle = new Battle(field(30), { seed: 3 });
        const queen = boss(battle, "queen", "antMonster", "antMonster", [10, 10]);
        const me = hero(battle, "me", [12, 10]);

        let events = play(battle, 1000, [me]);

        assert.equal(queen.phase, 0, "begun, set on someone");
        assert.ok(!events.some(({ type }) => type === "phase"), "its first phase says nothing");

        queen.hp = Math.floor(queen.maxHp * 0.6);
        events = play(battle, STEP_MS, [me]);

        const second = events.find(({ type }) => type === "phase");

        assert.equal(second.phase, 1);
        assert.equal(second.id, "queen");
        assert.match(second.told, /clutches/);
        assert.deepEqual(second.objects.kind, "antClutch");
        assert.equal(second.objects.count, 4);
        assert.equal(queen.faster, 1);

        queen.hp = Math.floor(queen.maxHp * 0.3);
        events = play(battle, STEP_MS, [me]);
        assert.equal(events.find(({ type }) => type === "phase").phase, 2);
        assert.equal(queen.faster, 1.3, "quicker");

        // (Every mark passed at once: each phase in turn)
        const other = new Battle(field(30), { seed: 4 });
        const struck = boss(other, "queen", "antMonster", "antMonster", [10, 10]);
        const her = hero(other, "me", [12, 10]);

        play(other, 1000, [her]);
        struck.hp = 1;
        assert.deepEqual(
            play(other, STEP_MS, [her])
                .filter(({ type }) => type === "phase")
                .map(({ phase }) => phase),
            [1, 2],
        );
    });

    it("sprays its acid in a wedge the way it was shown, a pool left in it; whoever's beside it untouched", () => {
        const battle = new Battle(field(30), { seed: 5 });
        const queen = boss(battle, "queen", "antMonster", "antMonster", [10, 10]);
        const ahead = hero(battle, "ahead", [10, 14]);
        const beside = hero(battle, "beside", [14, 10]);

        queen.wild.moves = queen.wild.moves.map((move) => (move.id === "acid" ? { ...move, first: 0 } : move));
        queen.wild.call = null;
        queen.target = "ahead";

        const events = play(battle, 3000, [ahead, beside]);
        const shown = events.find(({ type, arc }) => type === "telegraph" && arc);

        assert.ok(shown, "shown first, as a wedge");
        assert.equal(shown.arc, 70);

        const blast = events.find(({ type, kind }) => type === "blast" && kind === "acidSpray");

        assert.ok(blast && blast.arc === 70 && Math.abs(blast.facing - shown.facing) < 1e-9, "where it was shown");

        const hits = events.filter(({ type, attack }) => type === "hit" && attack === "acidSpray").map(({ id }) => id);

        assert.deepEqual(hits, ["ahead"]);
        assert.ok(battle.hazards.some((hazard) => hazard.kind === "acid" && hypot(hazard.x - 10.5, hazard.y - 14.5) < 3), "a pool of it left before her");
    });

    it("takes half of any harm while two or more of what shields it stand; all of it once fewer do", () => {
        const battle = new Battle(field(30), { seed: 6 });
        const queen = boss(battle, "queen", "antMonster", "antMonster", [10, 10], { hp: 1e6 });
        const me = hero(battle, "me", [11, 10]);

        queen.wild.moves = [];
        queen.wild.call = null;
        object(battle, "clutch-1", "antClutch", [3, 3]);
        object(battle, "clutch-2", "antClutch", [3, 20]);
        play(battle, 500, [me]);
        queen.hp = Math.floor(queen.maxHp * 0.6);
        battle.command("me", { type: "engage", target: "queen", stand: true });

        const shielded = play(battle, 6000, [me]).filter(({ type, id }) => type === "hit" && id === "queen");

        assert.ok(shielded.length > 1 && shielded.every((hit) => hit.shielded), "shielded");

        battle.remove("clutch-2");

        const open = play(battle, 6000, [me]).filter(({ type, id }) => type === "hit" && id === "queen");

        assert.ok(open.length > 1 && open.every((hit) => !hit.shielded), "not with one left");
    });

    it("brings what falls down across its arena, under whoever's in it, shown first, hurting whoever's still there as it lands", () => {
        const battle = new Battle(field(40), { seed: 7 });
        const queen = boss(battle, "queen", "antMonster", "antMonster", [20, 20], { hp: 1e6 });
        const me = hero(battle, "me", [24, 20]);

        queen.wild.moves = [];
        queen.wild.call = null;
        play(battle, 500, [me]);
        queen.hp = Math.floor(queen.maxHp * 0.3);

        const was = [me.x, me.y];
        const events = play(battle, 6000, [me]);
        const shown = events.filter(({ type, fall }) => type === "telegraph" && fall === "caveIn");

        assert.ok(shown.length >= 2, "circles shown");
        assert.ok(
            shown.some(({ x, y }) => hypot(x - was[0], y - was[1]) < 1),
            "one under whoever's there",
        );

        const blasts = events.filter(({ type, kind }) => type === "blast" && kind === "caveIn");

        assert.equal(blasts.length, shown.length, "each comes down");
        assert.ok(events.some(({ type, id, attack }) => type === "hit" && id === "me" && attack === "caveIn"), "hurting whoever's under it");
        assert.ok(shown.every(({ lands }) => lands - shown[0].lands < 1 && lands > 0));
    });

    it("regrows its hurts a share a second, not for a while once it's burnt", () => {
        const battle = new Battle(field(30), { seed: 8 });
        const king = boss(battle, "king", "troll", "trollKing", [10, 10], { hp: 1000 });
        const me = hero(battle, "me", [20, 20]);

        king.wild.moves = [];
        king.wild.bomb = null;
        play(battle, 500, [me]);
        king.hp = 300;
        play(battle, STEP_MS, [me]);
        assert.equal(king.phase, 2);

        const before = king.hp;
        const regrown = play(battle, 5000, [me]).filter(({ type, id, regrown: grew }) => type === "healed" && id === "king" && grew);

        assert.ok(regrown.length >= 4 && king.hp > before, "regrowing");

        king.burntAt = battle.time;

        const burnt = king.hp;

        play(battle, 5000, [me]);
        assert.equal(king.hp, burnt, "burnt: none regrown");
    });

    it("burnt by fire, marked so", () => {
        const battle = new Battle(field(30), { seed: 9 });
        const king = boss(battle, "king", "troll", "trollKing", [10, 10], { hp: 1e5 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [13, 10], hp: 1e5, casts: ["burn"] });

        king.wild.moves = [];
        king.wild.bomb = null;
        play(battle, 500, [me]);
        assert.ok(battle.cast("me", "burn", "king").ok !== false);
        play(battle, 2000, [me]);
        assert.ok(Number.isFinite(king.burntAt), "burnt");
    });

    it("is healed by a share of what it deals in its bloodlust", () => {
        const battle = new Battle(field(30), { seed: 10 });
        const reaver = boss(battle, "reaver", "orcReaver", "orcReaver", [10, 10], { hp: 1000 });
        const me = hero(battle, "me", [11, 10]);

        reaver.wild.moves = [];
        reaver.wild.rally = null;
        play(battle, 500, [me]);
        reaver.hp = 300;

        const events = play(battle, 8000, [me]);
        const dealt = events.filter(({ type, id, by }) => type === "hit" && id === "me" && by === "reaver");
        const healed = events.filter(({ type, id, from }) => type === "healed" && id === "reaver" && from === "me");

        assert.ok(dealt.length > 0 && healed.length === dealt.length, "healed by each blow");
        assert.ok(healed.every(({ amount }, k) => amount === Math.max(1, Math.round(dealt[k].damage * 0.35))));
    });

    it("hatches what's set out now and then, after whoever's nearest; never moves or strikes", () => {
        const battle = new Battle(field(30), { seed: 11 });
        const clutch = object(battle, "clutch", "antClutch", [5, 5], { kind: "ant", count: [1, 2], most: 4, every: 5000, first: 1000, down: 2 });
        const me = hero(battle, "me", [9, 5]);

        const events = play(battle, 11500, [me]);
        const calls = events.filter(({ type, id }) => type === "call" && id === "clutch");

        assert.equal(calls.length, 3);
        assert.ok(calls.every((call) => call.kind === "ant" && call.target === "me" && call.hatched));
        assert.deepEqual(clutch.square, [5, 5]);
        assert.ok(!events.some(({ type, id }) => type === "attack" && id === "clutch"), "strikes no one");
    });

    it("fought too long, brings its arena down on everyone in it again and again", () => {
        const battle = new Battle(field(30), { seed: 12 });
        const queen = boss(battle, "queen", "antMonster", "antMonster", [10, 10], { hp: 1e6 });
        const me = hero(battle, "me", [14, 10]);

        queen.wild.moves = [];
        queen.wild.call = null;
        queen.wild.fight.enrage = { ...queen.wild.fight.enrage, after: 2000 };

        const events = play(battle, 12000, [me]);
        const enraged = events.filter(({ type, enraged: on }) => type === "phase" && on);

        assert.equal(enraged.length, 1);
        assert.match(enraged[0].told, /roof/);

        const blasts = events.filter(({ type, kind, radius }) => type === "blast" && kind === "caveIn" && radius === 40);

        assert.ok(blasts.length >= 2, "again and again");
        assert.ok(events.some(({ type, id, attack }) => type === "hit" && id === "me" && attack === "caveIn"), "everyone in it");
    });

    it("charges, and hurls its boulder, at whoever's furthest off", () => {
        const battle = new Battle(field(40), { seed: 13 });
        const king = boss(battle, "king", "troll", "trollKing", [10, 10], { hp: 1e6 });
        const near = hero(battle, "near", [11, 10]);
        const far = hero(battle, "far", [10, 22]);

        king.wild.moves = [];
        king.target = "near";

        const events = play(battle, 12000, [near, far]);
        const thrown = events.filter(({ type, id }) => type === "bomb" && id === "king");

        assert.ok(thrown.length > 0);
        assert.deepEqual([thrown[0].x, thrown[0].y], [10.5, 22.5], "at the one furthest off");
        assert.ok(thrown.every(({ x, y }) => hypot(x - 11.5, y - 10.5) > 5), "never at the one beside it");
    });

    it("keeps what's falling with it, and lets it go with its arena", () => {
        const battle = new Battle(field(40), { seed: 14 });
        const queen = boss(battle, "queen", "antMonster", "antMonster", [20, 20], { hp: 1e6 });
        const me = hero(battle, "me", [24, 20]);

        queen.wild.moves = [];
        queen.wild.call = null;
        play(battle, 500, [me]);
        queen.hp = Math.floor(queen.maxHp * 0.3);

        for (let k = 0; k < 200 && !battle.falls.length; k++) {
            play(battle, STEP_MS, [me]);
        }

        assert.ok(battle.falls.length > 0);

        const kept = Battle.restore(battle.world, JSON.parse(JSON.stringify(battle.snapshot())));

        assert.deepEqual(kept.falls, battle.falls);
        assert.equal(kept.nextFall, battle.nextFall);

        battle.clearHazards(queen.map);
        assert.equal(battle.falls.length, 0);
    });
});
