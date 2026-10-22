// A town's siege engines (core/invasions.js ENGINES, weapons.js NATURAL catapult and ballista):
// each a soldier of its own in the battle (battle.js `engine`), the catapult flinging its pot of
// burning pitch far, bursting in fire where it lands (BOMBS firePot), the ballista loosing its
// bolt; never staggered, knocked down or thrown, and only fire taking to its timbers. (Drawn, and
// rolled out against the Behemoth, in a browser: e2e/pellagos.spec.js.)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, BOMBS, STEP_MS } from "../client/js/core/battle.js";
import { ENGINES } from "../client/js/core/invasions.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

// A siege engine of a kind (ENGINES), standing where it's put, as the host rolls one out
function engine(battle, kind, square) {
    const { weapon, name, hp, armor, speed } = ENGINES.kinds[kind];
    const actor = battle.add({ id: kind, kind: "soldier", name, weapon, team: "human", square, ai: "patrol", armed: true, hp, armor, speed, engine: kind });

    actor.patrol = [square];

    return actor;
}

// An orc that stays where it's put (stunned a long while), hardy enough to take what's thrown
function standing(battle, id, square, { hp = 900 } = {}) {
    const actor = battle.add({ id, kind: "orc", weapon: "cleaver", team: "raiders", square, hp });

    actor.stunnedUntil = 1e9;

    return actor;
}

describe("a town's siege engines (core/invasions.js ENGINES, battle.js `engine`)", () => {
    it("are each a weapon of their own, from far off and nothing up close: the catapult's pot of burning pitch, the ballista's bolt", () => {
        assert.deepEqual(Object.keys(ENGINES.kinds), ["catapult", "ballista"]);

        for (const { weapon } of Object.values(ENGINES.kinds)) {
            assert.ok(NATURAL[weapon].attacks.every(({ kind }) => kind === "ranged"), `${weapon}: nothing up close`);
            assert.ok(NATURAL[weapon].attacks.every(({ reach }) => reach >= 25), `${weapon}: from far off`);
        }

        const [pot] = NATURAL.catapult.attacks;
        const [bolt] = NATURAL.ballista.attacks;

        assert.equal(pot.bomb, "firePot");
        assert.ok(BOMBS.firePot.fuse <= 150 && BOMBS.firePot.afflict.kind === "burn", "bursting as it lands, setting alight");
        assert.ok(BOMBS.firePot.radius > BOMBS.grenado.radius, "wider than a hand-thrown bomb");
        assert.equal(bolt.projectile.kind, "ballistaBolt");
    });

    it("has the catapult fling its pot of burning pitch at whoever it's set on, far off, bursting the moment it lands, setting them alight", () => {
        const battle = new Battle(field(60), { seed: 4 });
        const catapult = engine(battle, "catapult", [10, 30]);
        const orcs = [[34, 30], [34, 31], [35, 30], [33, 30]].map((square, k) => standing(battle, `orc${k}`, square));

        const events = run(battle, 12000);
        const bomb = events.find((event) => event.type === "bomb" && event.id === catapult.id);
        const blast = events.find((event) => event.type === "blast" && event.kind === "firePot");

        assert.ok(bomb, "a pot flung");
        assert.equal(bomb.bursts - bomb.lands, BOMBS.firePot.fuse, "bursting as it lands");
        assert.ok(Math.hypot(bomb.x - catapult.x, bomb.y - catapult.y) > 20, "far off");
        assert.ok(blast && orcs.filter((orc) => orc.hp < orc.maxHp).length >= 2, "bursting on them, all round where it lands");
        assert.ok(events.some((event) => event.type === "afflicted" && event.kind === "burn"), "setting them alight");
        assert.ok(Math.hypot(catapult.x - 10.5, catapult.y - 30.5) < 1, "from where it stands");
    });

    it("has the ballista loose its bolt at whoever it's set on, hard", () => {
        const battle = new Battle(field(60), { seed: 4 });
        const ballista = engine(battle, "ballista", [10, 30]);
        const orc = standing(battle, "orc", [32, 30]);

        const events = run(battle, 8000);
        const shot = events.find((event) => event.type === "projectile" && event.id === ballista.id);
        const hit = events.find((event) => event.type === "hit" && event.by === ballista.id);
        const [least] = NATURAL.ballista.attacks[0].damage;

        assert.equal(shot?.kind, "ballistaBolt");
        assert.ok(hit && hit.damage >= least * 0.5, `${hit?.damage}`);
        assert.ok(orc.hp < orc.maxHp);
    });

    it("is never staggered, knocked down or thrown, and nothing but fire takes to its timbers", () => {
        const battle = new Battle(field(40), { seed: 4 });
        const catapult = engine(battle, "catapult", [10, 20]);
        const [gore] = NATURAL.capeBuffalo.attacks;

        // (Gored by a cape buffalo, a blow that staggers and knocks down: hurt, neither)
        battle.add({ id: "buffalo", kind: "player", weapon: "capeBuffalo", team: "raiders", square: [11, 20], hp: 5000 });
        battle.command("buffalo", { type: "engage", target: "catapult" });

        const gored = run(battle, 3000).find((event) => event.type === "hit" && event.by === "buffalo");

        assert.ok(gore.stagger > 0 && gore.knockdown > 0);
        assert.ok(gored && catapult.hp < catapult.maxHp, "hurt");
        assert.equal(catapult.staggeredUntil, 0, "not staggered");
        assert.ok(!(catapult.downUntil > battle.time), "not knocked down");

        // (A blast at its feet: hurt, never thrown)
        battle.add({ id: "bomber", kind: "player", weapon: "sword", team: "raiders", square: [16, 20], hp: 500 });
        assert.equal(battle.lob("bomber", "catapult", { kind: "goblinBomb", damage: [10, 10], reach: 12 }).ok, true);

        const events = run(battle, 4000);
        const blast = events.find((event) => event.type === "blast");

        assert.ok(blast && blast.throws.every(({ id }) => id !== "catapult"), "not thrown");

        // (Fire takes; poison and bleeding don't)
        assert.equal(battle.afflict("catapult", "poison"), false);
        assert.equal(battle.afflict("catapult", "bleed"), false);
        assert.equal(battle.afflict("catapult", "burn"), true);
    });

    it("has its crew keep by it, and, it wrecked, fight on as the soldiers they are", () => {
        const battle = new Battle(field(40), { seed: 4 });
        const ballista = engine(battle, "ballista", [10, 20]);
        const crew = battle.add({ id: "crew", kind: "soldier", weapon: "sword", team: "human", square: [9, 20], ai: "follow", leader: ballista.id, armed: true });

        ballista.leash = 90;

        // (An orc over the field, too far off to be the crew's: theirs is to keep by it)
        const orc = standing(battle, "orc", [30, 20]);

        run(battle, 3000);
        assert.equal(crew.ai, "follow");
        assert.ok(Math.hypot(crew.x - ballista.x, crew.y - ballista.y) < 4, "by it");

        // (Burnt through, the orc brought nearer: on after it)
        ballista.hp = 1;
        battle.afflict(ballista.id, "burn", { damage: 10 });
        run(battle, 3000);
        battle.place(orc.id, "town", [17, 20]);

        const events = run(battle, 8000);

        assert.ok(ballista.dead);
        assert.deepEqual({ ai: crew.ai, leader: crew.leader, leash: crew.leash }, { ai: "patrol", leader: null, leash: 90 });
        assert.ok(events.some((event) => event.type === "hit" && event.by === "crew" && event.id === orc.id), "after the orc");
    });
});
