import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, KINDS, SIGHT, STEP_MS } from "../client/js/core/battle.js";
import { createRandom } from "../client/js/core/random.js";
import { chooseAttack, inReach, MELEE_REACH, rollDamage, STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";
import { generateWorld } from "../client/js/core/world.js";
import { parseGrid } from "./helpers.js";

/** A world from rows of text ("#" blocked): just what a battle needs. */
function worldOf(rows) {
    return { blocked: parseGrid(rows).map((row) => Uint8Array.from(row)) };
}

const open = (width, height) => worldOf(Array.from({ length: height }, () => ".".repeat(width)));

/** Run a battle for `ms`, collecting every event. */
function run(battle, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

describe("weapons (weapons.js)", () => {
    it("offers the seven starting weapons, each with whole-number damage ranges", () => {
        assert.deepEqual(STARTING_WEAPONS, ["sword", "staff", "wand", "grimoire", "hammer", "bow", "gauntlets"]);

        for (const [id, weapon] of Object.entries(WEAPONS)) {
            assert.ok(weapon.attacks.length > 0, id);
            assert.ok(weapon.equipment.length > 0, id);

            for (const attack of weapon.attacks) {
                const [least, most] = attack.damage;

                assert.ok(Number.isInteger(least) && Number.isInteger(most) && least >= 1 && most >= least, `${id} ${attack.id} damage`);
                assert.ok(attack.hitAt < attack.duration && attack.duration <= attack.interval, `${id} ${attack.id} timing`);
                assert.ok(attack.reaction, `${id} ${attack.id} reaction`);
                assert.equal(attack.kind === "ranged", Boolean(attack.projectile), `${id} ${attack.id} projectile`);
            }
        }
    });

    it("gives every weapon its own reaction when it hits, so each can look different", () => {
        const reactions = Object.values(WEAPONS).map((weapon) => weapon.attacks[0].reaction);

        assert.equal(new Set(reactions).size, reactions.length);
    });

    it("has the staff fight up close and the wand and grimoire at range", () => {
        assert.equal(WEAPONS.staff.attacks[0].kind, "melee");
        assert.equal(WEAPONS.wand.attacks[0].kind, "ranged");
        assert.equal(WEAPONS.grimoire.attacks[0].kind, "ranged");
        assert.equal(WEAPONS.bow.attacks[0].kind, "ranged");
    });

    it("rolls every whole number in a weapon's range, and nothing outside it", () => {
        const random = createRandom(3);

        for (const id of STARTING_WEAPONS) {
            const attack = WEAPONS[id].attacks[0];
            const seen = new Set();

            for (let k = 0; k < 400; k++) {
                const damage = rollDamage(attack, random);

                assert.ok(Number.isInteger(damage) && damage >= attack.damage[0] && damage <= attack.damage[1], `${id} rolled ${damage}`);
                seen.add(damage);
            }

            assert.equal(seen.size, attack.damage[1] - attack.damage[0] + 1, `${id} rolls every value`);
        }
    });

    it("reaches the eight squares touching the attacker's in melee, and no further", () => {
        const slash = WEAPONS.sword.attacks[0];

        assert.equal(MELEE_REACH, 1);

        for (const [dx, dy] of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]) {
            assert.ok(inReach(slash, [5, 5], [5 + dx, 5 + dy]), `${dx}, ${dy}`);
        }

        for (const square of [[5, 5], [7, 5], [5, 3], [7, 7], [3, 4]]) {
            assert.ok(!inReach(slash, [5, 5], square), String(square));
        }
    });

    it("picks an attack that reaches: ranged weapons out to their range", () => {
        assert.equal(chooseAttack("bow", [0, 0], [9, 0])?.id, "arrow");
        assert.equal(chooseAttack("bow", [0, 0], [9, 3]), null);
        assert.equal(chooseAttack("wand", [0, 0], [4, 5])?.id, "bolt");
        assert.equal(chooseAttack("sword", [0, 0], [2, 0]), null);
    });
});

describe("the battle (battle.js)", () => {
    it("has the player and an orc next to each other attack each other, taking rolled damage off hit points", () => {
        const battle = new Battle(open(10, 10), { seed: 4 });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [4, 4] });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 5], ai: "patrol", patrol: [[5, 5], [5, 5]] });

        const events = run(battle, 3000);
        const hits = events.filter((event) => event.type === "hit");
        const player = battle.actor("player");
        const orc = battle.actor("orc");

        assert.ok(events.some((event) => event.type === "attack" && event.id === "player"), "the player attacks");
        assert.ok(events.some((event) => event.type === "attack" && event.id === "orc"), "the orc attacks");

        for (const hit of hits) {
            const attack = WEAPONS[hit.weapon].attacks.find(({ id }) => id === hit.attack);

            assert.ok(hit.damage >= attack.damage[0] && hit.damage <= attack.damage[1]);
        }

        const taken = (id) => hits.filter((hit) => hit.id === id).reduce((sum, hit) => sum + hit.damage, 0);

        assert.equal(player.hp, KINDS.player.hp - taken("player"));
        assert.equal(orc.hp, KINDS.orc.hp - taken("orc"));
        assert.ok(taken("orc") > 0 && taken("player") > 0);
    });

    it("kills at no hit points, and brings the dead back where they started", () => {
        const battle = new Battle(open(10, 10), { seed: 1 });

        battle.add({ id: "player", kind: "player", weapon: "hammer", team: "hero", square: [4, 4] });

        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 4], ai: "patrol", patrol: [[5, 4], [5, 4]] });

        orc.hp = 3;

        const events = run(battle, 3000);
        const death = events.find((event) => event.type === "death");

        assert.equal(death?.id, "orc");
        assert.equal(death.by, "player");
        assert.ok(orc.dead);
        assert.equal(orc.hp, 0);

        // No one attacks the dead
        const after = events.filter((event) => event.type === "attack" && event.time > death.time);

        assert.equal(after.length, 0);

        const respawns = run(battle, KINDS.orc.respawn);
        const respawn = respawns.find((event) => event.type === "respawn");

        assert.equal(respawn?.id, "orc");
        assert.ok(!orc.dead);
        assert.deepEqual(orc.square, [5, 4]);
    });

    it("walks the player where they're told, round walls, and doesn't stop to fight on the way", () => {
        const battle = new Battle(worldOf([
            "..........",
            "..........",
            ".########.",
            "..........",
            "..........",
        ]), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 0] });

        // An enemy standing right by the way the player goes
        battle.add({ id: "dummy", kind: "orc", weapon: "cleaver", team: "orcs", square: [9, 1] });
        battle.command("player", { type: "move", to: [2, 4] });

        let attackedOnTheWay = false;
        let throughTheWall = false;

        for (let t = 0; t < 10000; t += STEP_MS) {
            const walking = Boolean(player.path.length || player.to);
            const events = battle.advance(STEP_MS);

            attackedOnTheWay ||= walking && events.some((event) => event.type === "attack" && event.id === "player");
            throughTheWall ||= player.square[1] === 2 && player.square[0] !== 0 && player.square[0] !== 9;
        }

        assert.deepEqual(player.square, [2, 4]);
        assert.equal(player.to, null);
        assert.ok(!attackedOnTheWay, "no attacks while walking");
        assert.ok(!throughTheWall, "went round the wall");
    });

    it("sends the player to fight an enemy it's told to engage, stopping as soon as it's within reach", () => {
        const battle = new Battle(open(20, 5), { seed: 2 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 2] });

        battle.add({ id: "dummy", kind: "orc", weapon: "cleaver", team: "orcs", square: [15, 2] });
        battle.command("player", { type: "engage", target: "dummy" });

        const events = run(battle, 12000);
        const attack = events.find((event) => event.type === "attack" && event.id === "player");

        assert.ok(attack, "attacks");
        assert.ok(Math.max(Math.abs(player.square[0] - 15), Math.abs(player.square[1] - 2)) === 1, `stops next to it, at ${player.square}`);
    });

    it("shoots with a bow from range, the arrow flying to its target before it hits", () => {
        const battle = new Battle(open(20, 5), { seed: 5 });

        battle.add({ id: "player", kind: "player", weapon: "bow", team: "hero", square: [2, 2] });
        battle.add({ id: "dummy", kind: "orc", weapon: "cleaver", team: "orcs", square: [10, 2] });

        const events = run(battle, 3000);
        const shot = events.find((event) => event.type === "projectile");
        const hit = events.find((event) => event.type === "hit" && event.id === "dummy");

        assert.equal(shot?.kind, "arrow");
        assert.ok(hit, "the arrow hits");
        assert.equal(hit.reaction, "pierce");
        assert.ok(hit.time - shot.time >= (8 / WEAPONS.bow.attacks[0].projectile.speed) * 1000 - STEP_MS, "after flying 8 metres");
    });

    it("doesn't shoot through walls", () => {
        const battle = new Battle(worldOf([
            "..........",
            ".....#....",
            ".....#....",
            ".....#....",
            "..........",
        ]), { seed: 5 });

        battle.add({ id: "player", kind: "player", weapon: "wand", team: "hero", square: [3, 2] });
        battle.add({ id: "dummy", kind: "orc", weapon: "cleaver", team: "orcs", square: [7, 2] });

        const events = run(battle, 3000);

        assert.ok(!events.some((event) => event.type === "projectile"));
    });

    it("patrols an orc between its two points", () => {
        const battle = new Battle(open(6, 30), { seed: 1 });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [2, 1], ai: "patrol", patrol: [[2, 1], [2, 20]] });
        const visited = new Set();

        for (let t = 0; t < 60000; t += 500) {
            run(battle, 500);
            visited.add(orc.square[1]);
        }

        assert.ok(visited.has(1) && visited.has(20), "reaches both ends");
        assert.ok([...visited].every((y) => y >= 1 && y <= 20), "stays on its patrol");
    });

    it("has an orc chase a player it sees and attack them, and give up on one out of sight", () => {
        const battle = new Battle(open(40, 40), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 2 + SIGHT - 2] });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [2, 2], ai: "patrol", patrol: [[2, 2], [30, 2]] });

        const events = run(battle, 10000);
        const chased = events.find((event) => event.type === "attack" && event.id === "orc" && event.target === "player");

        assert.ok(chased, "the orc comes and attacks");
        assert.ok(player.dead || Math.max(Math.abs(orc.square[0] - player.square[0]), Math.abs(orc.square[1] - player.square[1])) === 1, "and stands next to the player");
        assert.ok(player.dead || orc.target === "player");

        // Far away and out of sight: back on patrol
        const faraway = new Battle(open(60, 10), { seed: 1 });

        faraway.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2 + SIGHT + 20, 5] });

        const calm = faraway.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [2, 5], ai: "patrol", patrol: [[2, 5], [2, 8]] });

        run(faraway, 5000);
        assert.equal(calm.target, null);
        assert.ok(calm.square[0] <= 3);
    });

    it("comes out the same for the same seed", () => {
        const fight = (seed) => {
            const battle = new Battle(open(10, 10), { seed });

            battle.add({ id: "player", kind: "player", weapon: "gauntlets", team: "hero", square: [4, 4] });
            battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 5], ai: "patrol", patrol: [[5, 5], [5, 5]] });

            return run(battle, 5000).filter((event) => event.type === "hit").map((event) => event.damage);
        };

        assert.deepEqual(fight(9), fight(9));
        assert.notDeepEqual(fight(9), fight(10));
    });

    it("plays out in the generated world: the orc patrols its corner while the player waits in the square", () => {
        const world = generateWorld({ seed: 3 });
        const battle = new Battle(world, { seed: 3 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: world.spawns.player });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: world.spawns.orc, ai: "patrol", patrol: world.patrol });
        const start = performance.now();
        const events = run(battle, 60000);
        const elapsed = performance.now() - start;

        assert.ok(!events.some((event) => event.type === "attack"), "too far apart to fight");
        assert.ok(orc.square[0] <= world.patrol[0][0] + 2, "the orc keeps to its patrol");
        assert.ok(!player.dead);
        assert.ok(elapsed < 1500, `a minute of battle took ${elapsed.toFixed(0)} ms`);
    });
});
