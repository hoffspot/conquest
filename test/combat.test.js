import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, DRAW_MS, KINDS, SHEATHE_AFTER_MS, SHEATHE_MS, SIGHT, SPRINT, STAMINA_DRAIN, STAMINA_RECOVERY, STEP_MS } from "../client/js/core/battle.js";
import { REFUSALS } from "../client/js/core/host.js";
import { createRandom } from "../client/js/core/random.js";
import { CAST_FAILURES, SCHOOLS, SPELL_COOLDOWN, SPELLS } from "../client/js/core/spells.js";
import { armsOf, averageDamage, chooseAttack, inReach, longestReach, MELEE_REACH, rollDamage, STARTING_WEAPONS, WEAPONS } from "../client/js/core/weapons.js";
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
    it("offers the eight starting weapons, each with whole-number damage ranges", () => {
        assert.deepEqual(STARTING_WEAPONS, ["sword", "staff", "wand", "grimoire", "hammer", "bow", "gauntlets", "boots"]);

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

    it("with spiked boots, kicks or uses a melee weapon at random, both doing the damage halfway between theirs", () => {
        const kick = WEAPONS.boots.attacks[0];

        assert.deepEqual(armsOf("boots"), [kick]);
        assert.deepEqual(armsOf("sword"), WEAPONS.sword.attacks);

        for (const weapon of ["sword", "staff", "hammer", "gauntlets", "cleaver"]) {
            const [mixed] = armsOf(weapon, true);
            const own = WEAPONS[weapon].attacks[0];
            const damage = [(own.damage[0] + kick.damage[0]) / 2, (own.damage[1] + kick.damage[1]) / 2];

            assert.deepEqual(averageDamage(own, kick), damage, weapon);
            assert.deepEqual(mixed.either.map(({ id }) => id), [own.id, "kick"], weapon);
            assert.ok(mixed.either.every((attack) => attack.damage[0] === damage[0] && attack.damage[1] === damage[1]), weapon);
            assert.equal(longestReach(armsOf(weapon, true)), MELEE_REACH);
        }

        // Each blow one or the other, at random, both often
        const random = createRandom(5);
        const picks = Array.from({ length: 200 }, () => chooseAttack(armsOf("sword", true), [0, 0], [1, 0], random).id);

        assert.ok(picks.filter((id) => id === "kick").length > 70 && picks.filter((id) => id === "slash").length > 70);
        assert.equal(chooseAttack(armsOf("sword", true), [0, 0], [2, 0], random), null);
    });

    it("with spiked boots and a bow, wand or grimoire, kicks up close with the boots' own damage, and shoots or casts further off", () => {
        const random = createRandom(6);

        for (const weapon of ["bow", "wand", "grimoire"]) {
            const arms = armsOf(weapon, true);
            const ranged = WEAPONS[weapon].attacks[0];

            for (const next of [[1, 0], [1, 1], [0, -1]]) {
                assert.deepEqual(chooseAttack(arms, [0, 0], next, random), WEAPONS.boots.attacks[0], `${weapon} next to it`);
            }

            assert.equal(chooseAttack(arms, [0, 0], [3, 0], random), ranged, `${weapon} further off`);
            assert.equal(longestReach(arms), ranged.reach);
        }
    });

    it("rolls an averaged range with halves as the whole numbers inside it, evenly", () => {
        const random = createRandom(8);
        const counts = new Map();

        for (let k = 0; k < 4000; k++) {
            const damage = rollDamage({ damage: [3.5, 7.5] }, random);

            counts.set(damage, (counts.get(damage) ?? 0) + 1);
        }

        assert.deepEqual([...counts.keys()].sort(), [4, 5, 6, 7]);

        for (const count of counts.values()) {
            assert.ok(Math.abs(count - 1000) < 120, String(count));
        }
    });

    it("picks an attack that reaches: ranged weapons out to their range", () => {
        assert.equal(chooseAttack("bow", [0, 0], [9, 0])?.id, "arrow");
        assert.equal(chooseAttack("bow", [0, 0], [18, 0])?.id, "arrow");
        assert.equal(chooseAttack("bow", [0, 0], [18, 3]), null);
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

    it("has a player in spiked boots with a sword both kick and slash, each for the averaged damage", () => {
        const battle = new Battle(open(10, 10), { seed: 11 });

        battle.add({ id: "player", kind: "player", weapon: "sword", boots: true, team: "hero", square: [4, 4] });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 5], ai: "patrol", patrol: [[5, 5], [5, 5]] });
        battle.actor("orc").hp = battle.actor("orc").maxHp = 1000;
        battle.actor("player").hp = battle.actor("player").maxHp = 1000;

        const events = run(battle, 20000);
        const attacks = events.filter((event) => event.type === "attack" && event.id === "player");
        const hits = events.filter((event) => event.type === "hit" && event.by === "player");

        assert.ok(attacks.some((event) => event.attack === "kick" && event.animation === "kick"), "kicks");
        assert.ok(attacks.some((event) => event.attack === "slash" && event.animation === "sword"), "slashes");
        assert.ok(hits.length > 10);

        for (const hit of hits) {
            assert.ok(hit.damage >= 4 && hit.damage <= 7, `${hit.attack} ${hit.damage}`);
        }
    });

    it("has a player with only spiked boots kick", () => {
        const battle = new Battle(open(10, 10), { seed: 12 });

        battle.add({ id: "player", kind: "player", weapon: "boots", team: "hero", square: [4, 4] });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 5], ai: "patrol", patrol: [[5, 5], [5, 5]] });

        const events = run(battle, 5000);
        const hits = events.filter((event) => event.type === "hit" && event.by === "player");

        assert.ok(battle.actor("player").boots);
        assert.ok(hits.length > 0 && hits.every((hit) => hit.attack === "kick" && hit.reaction === "kick" && hit.damage >= 3 && hit.damage <= 7));
    });

    it("starts with weapons put away, draws them when an enemy comes into sight, and can't strike until they're out", () => {
        const battle = new Battle(open(20, 10), { seed: 4 });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 5] });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [9, 5], ai: "patrol", patrol: [[9, 5], [9, 5]] });

        assert.ok(!battle.actor("player").armed && !battle.actor("orc").armed);

        const events = run(battle, 8000);
        const draws = events.filter((event) => event.type === "draw");

        for (const id of ["player", "orc"]) {
            const drew = draws.find((event) => event.id === id);
            const first = events.find((event) => event.type === "attack" && event.id === id);

            assert.ok(drew?.on, `${id} draws`);
            assert.ok(drew.time <= STEP_MS * 2, `${id} draws as soon as it sees the other`);
            assert.ok(first && first.time >= drew.time + DRAW_MS, `${id} strikes once it's drawn`);
            assert.ok(battle.actor(id).armed, `${id} is armed`);
        }
    });

    it("doesn't draw for an enemy it can't see, unless it's told to fight it (and then the enemy it's after draws too)", () => {
        const battle = new Battle(worldOf([
            ".........#..........",
            ".........#..........",
            ".........#..........",
            ".........#..........",
            ".........#..........",
        ]), { seed: 4 });

        battle.add({ id: "player", kind: "player", weapon: "hammer", team: "hero", square: [3, 2] });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [15, 2], ai: "patrol", patrol: [[15, 2], [15, 2]] });

        assert.ok(!run(battle, 2000).some((event) => event.type === "draw"), "a wall between them");

        battle.command("player", { type: "engage", target: "orc" });

        const draws = run(battle, 500).filter((event) => event.type === "draw");

        assert.deepEqual(draws.map(({ id, on }) => [id, on]), [["player", true], ["orc", true]]);
    });

    it("puts its weapon away a while after the fight, once no enemy's in sight or after it", () => {
        const battle = new Battle(open(20, 10), { seed: 4 });

        // (A wand: the orc in sight, but too far off to be shot at)
        battle.add({ id: "player", kind: "player", weapon: "wand", team: "hero", square: [2, 5] });
        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [14, 5], ai: "patrol", patrol: [[14, 5], [14, 5]] });
        run(battle, 1000);
        assert.ok(battle.actor("player").armed);

        // (The orc gone, for good)
        const gone = battle.time;

        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const events = run(battle, SHEATHE_AFTER_MS + SHEATHE_MS + 1000);
        const away = events.find((event) => event.type === "draw" && event.id === "player");

        assert.equal(away?.on, false);
        assert.ok(away.time >= gone + SHEATHE_AFTER_MS - STEP_MS && away.time <= gone + SHEATHE_AFTER_MS + 2 * STEP_MS, String(away.time - gone));
        assert.ok(!battle.actor("player").armed && !battle.actor("player").drawing);
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
            const walking = player.path.length > 0;
            const events = battle.advance(STEP_MS);

            attackedOnTheWay ||= walking && events.some((event) => event.type === "attack" && event.id === "player");
            throughTheWall ||= player.square[1] === 2 && player.square[0] !== 0 && player.square[0] !== 9;
        }

        assert.deepEqual(player.square, [2, 4]);
        assert.deepEqual(player.path, []);
        assert.ok(!attackedOnTheWay, "no attacks while walking");
        assert.ok(!throughTheWall, "went round the wall");
    });

    it("walks a tap far out on open water to the shore on the way there, and stays put when there's no shore near", () => {
        // (A lake 60 squares across, the player on its western shore)
        const rows = Array.from({ length: 70 }, (_, y) => Array.from({ length: 80 }, (_, x) => (x >= 6 && y >= 4 && y < 66 ? "#" : ".")).join(""));
        const battle = new Battle(worldOf(rows), { seed: 3 });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 35] });
        battle.command("player", { type: "move", to: [50, 35] });
        assert.deepEqual(battle.actor("player").order?.to, [5, 35], "the shore on the way out");

        // (Out of reach of any shore both round the tap and back along the way: no order)
        const sea = worldOf(Array.from({ length: 300 }, (_, y) => Array.from({ length: 300 }, (_, x) => (x < 3 && y < 3 ? "." : "#")).join("")));
        const lost = new Battle(sea, { seed: 3 });

        lost.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 1] });
        assert.doesNotThrow(() => lost.command("player", { type: "move", to: [250, 250] }));
        assert.equal(lost.actor("player").order, null);
    });

    it("walks open ground in a straight line to where it's going, not zig-zagging from square to square", () => {
        for (const [from, to] of [[[2, 14], [50, 3]], [[2, 2], [47, 17]], [[40, 2], [3, 18]], [[5, 10], [55, 10]]]) {
            const battle = new Battle(open(60, 20), { seed: 1 });
            const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: from });
            const [x0, y0, x1, y1] = [from[0] + 0.5, from[1] + 0.5, to[0] + 0.5, to[1] + 0.5];
            const length = Math.hypot(x1 - x0, y1 - y0);
            let stray = 0;
            const facings = new Set();

            battle.command("player", { type: "move", to });

            for (let t = 0; t < 60000 && (player.to || player.path.length || player.order); t += STEP_MS) {
                battle.advance(STEP_MS);
                stray = Math.max(stray, Math.abs(((player.x - x0) * (y1 - y0) - (player.y - y0) * (x1 - x0)) / length));
                facings.add(player.facing.toFixed(3));
            }

            assert.deepEqual(player.square, to);
            assert.ok(player.x === x1 && player.y === y1, "in the middle of the square it was going to");
            assert.ok(stray < 0.01, `${from} to ${to}: strays ${stray.toFixed(2)} m from the straight line`);
            assert.equal(facings.size, 1, `${from} to ${to}: faces ${facings.size} ways`);
        }
    });

    it("keeps its body clear of walls as it heads straight for the next corner of its way, and turns only at corners", () => {
        const rows = [
            "..............................",
            "..............................",
            "..........#####...............",
            "..........#####...............",
            "..........#####.......####....",
            "..........#####.......####....",
            "......................####....",
            "......................####....",
            "..............................",
            "..............................",
        ];
        const battle = new Battle(worldOf(rows), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 3] });
        const blocked = parseGrid(rows);
        let closest = Infinity;
        let turns = 0;
        let facing = null;

        battle.command("player", { type: "move", to: [28, 6] });

        for (let t = 0; t < 60000 && (player.to || player.path.length || player.order); t += STEP_MS) {
            battle.advance(STEP_MS);

            // (How near its middle comes to any wall)
            for (let y = 0; y < rows.length; y++) {
                for (let x = 0; x < rows[0].length; x++) {
                    if (blocked[y][x]) {
                        closest = Math.min(closest, Math.hypot(player.x - Math.min(Math.max(player.x, x), x + 1), player.y - Math.min(Math.max(player.y, y), y + 1)));
                    }
                }
            }

            if (facing !== null && Math.abs(player.facing - facing) > 0.01) {
                turns++;
            }

            facing = player.facing;
        }

        assert.deepEqual(player.square, [28, 6]);
        assert.ok(closest >= 0.29, `came within ${closest.toFixed(2)} m of a wall`);

        // (Round the two blocks' corners: the mesh rounds a corner off, into two or three turns)
        assert.ok(turns <= 5, `turned ${turns} times`);
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

    it("shoots with a bow from 18 metres, past where anyone looks round for enemies, without closing in", () => {
        assert.equal(WEAPONS.bow.attacks[0].reach, 18);

        const battle = new Battle(open(30, 5), { seed: 5 });
        const player = battle.add({ id: "player", kind: "player", weapon: "bow", team: "hero", square: [2, 2] });

        battle.add({ id: "dummy", kind: "orc", weapon: "cleaver", team: "orcs", square: [2 + SIGHT + 5, 2] });
        assert.equal(battle.canSee(player, battle.actor("dummy")), false, "(further than anyone looks round)");
        battle.command("player", { type: "engage", target: "dummy" });

        const events = run(battle, 3000);

        assert.ok(events.some((event) => event.type === "projectile" && event.id === "player" && event.target === "dummy"), "shot");
        assert.deepEqual(player.square, [2, 2], "from where it stood");
        assert.equal(battle.shotAt("player", "dummy"), null);

        // (Further than it reaches: walked closer first)
        const far = new Battle(open(30, 5), { seed: 5 });
        const walker = far.add({ id: "player", kind: "player", weapon: "bow", team: "hero", square: [2, 2] });

        far.add({ id: "dummy", kind: "orc", weapon: "cleaver", team: "orcs", square: [22, 2] });
        assert.equal(far.shotAt("player", "dummy"), "range");
        far.command("player", { type: "engage", target: "dummy" });
        run(far, 3000);
        assert.ok(walker.square[0] >= 4, `closed in (at ${walker.square})`);
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

    it("runs as much faster than walking as people sprint, speeding up and slowing to a walk to arrive", () => {
        // People walk at about 1.4 m/s and sprint at 6 to 7
        assert.ok(SPRINT > 4.2 && SPRINT < 5, `${SPRINT} times as fast`);

        const battle = new Battle(open(60, 5), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 2] });
        const walk = KINDS.player.speed;
        const paces = [];

        battle.command("player", { type: "move", to: [50, 2], run: true });

        for (let t = 0; t < 12000 && (player.to || player.path.length); t += STEP_MS) {
            battle.advance(STEP_MS);
            paces.push({ time: battle.time, pace: player.pace, moving: Boolean(player.to || player.path.length) });
        }

        const fastest = Math.max(...paces.map(({ pace }) => pace));
        const top = paces.find(({ pace }) => pace >= walk * SPRINT - 1e-9);
        const arriving = paces.filter(({ moving }) => moving).at(-1);

        assert.deepEqual(player.square, [50, 2]);
        assert.ok(Math.abs(fastest - walk * SPRINT) < 1e-9, `sprints at ${fastest.toFixed(2)} m/s`);
        assert.ok(top.time >= 900 && top.time <= 1300, `at full speed after ${top.time} ms`);
        assert.ok(arriving.pace < walk + 1.5, `arrives at ${arriving.pace.toFixed(2)} m/s`);
        assert.ok(paces.every(({ pace }, k) => k === 0 || Math.abs(pace - paces[k - 1].pace) < 0.36), "no sudden changes of speed");
        assert.ok(battle.time < ((49 / walk) * 1000) / 3.5, `ran 49 m in ${battle.time} ms`);

        // There, it stands
        battle.advance(STEP_MS);
        assert.equal(player.order, null);
        assert.equal(player.running, false);
        assert.equal(player.pace, walk);
    });

    it("uses 3 stamina a second running and gets 1 a second back otherwise, between none and its most", () => {
        const battle = new Battle(open(60, 5), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 2] });

        // As much stamina as hit points to start with
        assert.equal(player.stamina, KINDS.player.hp);
        assert.equal(player.maxStamina, KINDS.player.hp);
        assert.equal(STAMINA_DRAIN, 3);
        assert.equal(STAMINA_RECOVERY, 1);

        battle.command("player", { type: "move", to: [58, 2], run: true });
        run(battle, 2000);
        assert.ok(player.running);
        assert.equal(player.stamina, KINDS.player.hp - 2 * STAMINA_DRAIN);

        // Walking gets it back
        battle.command("player", { type: "move", to: [1, 2] });
        run(battle, 3000);
        assert.ok(!player.running && (player.to || player.path.length), "walking");
        assert.equal(player.stamina, KINDS.player.hp - 2 * STAMINA_DRAIN + 3 * STAMINA_RECOVERY);

        // ...and so does standing, up to its most and no more
        run(battle, 20000);
        assert.equal(player.stamina, player.maxStamina);
    });

    it("turns the way it's sent and goes straight ahead that way as far as the way is clear, running while its stamina lasts", () => {
        const battle = new Battle(worldOf([
            "..........................#.",
            "............................",
            "............................",
        ]), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 0], facing: Math.PI });

        // Sent east (facing north): turned east, along the row, straight to its body's width from
        // the wall
        battle.command("player", { type: "ahead", facing: Math.PI / 2, run: true });
        assert.equal(player.facing, Math.PI / 2);
        assert.deepEqual(player.order, { type: "move", to: [25, 0], run: true });
        assert.equal(player.path.length, 1);
        assert.ok(player.path[0][0] > 25.5 && player.path[0][0] <= 25.7 && player.path[0][1] === 0.5, `to ${player.path[0]}`);

        run(battle, 1500);
        assert.ok(player.running && player.pace > KINDS.player.speed * 2, "sprinting");
        run(battle, 8000);
        assert.deepEqual(player.square, [25, 0]);
        assert.ok(player.x > 25 && player.x < 26 && player.y === 0.5, "never left the row");

        // Up against the wall, there's nowhere ahead to go; sent into it from facing back, it still
        // turns to face it
        player.facing = -Math.PI / 2;
        battle.command("player", { type: "ahead", facing: Math.PI / 2, run: true });
        assert.equal(player.order, null);
        assert.equal(player.facing, Math.PI / 2);

        // Out of breath, it walks
        player.stamina = 0;
        battle.command("player", { type: "ahead", facing: -Math.PI / 2, run: true });
        run(battle, 1000);
        assert.ok(player.pace <= KINDS.player.speed + 1e-9, `walking at ${player.pace.toFixed(2)} m/s`);
    });

    it("stops running when its stamina runs out, and walks the rest of the way", () => {
        const battle = new Battle(open(60, 5), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 2] });
        const walk = KINDS.player.speed;
        const events = [];
        let lowest = Infinity;

        player.stamina = 3;
        battle.command("player", { type: "move", to: [40, 2], run: true });

        for (let t = 0; t < 30000; t += STEP_MS) {
            events.push(...battle.advance(STEP_MS));
            lowest = Math.min(lowest, player.stamina);

            if (events.some(({ type }) => type === "exhausted") && player.pace === walk && !events.slow) {
                events.slow = battle.time;
            }
        }

        const exhausted = events.filter(({ type }) => type === "exhausted");

        assert.equal(exhausted.length, 1);
        assert.equal(exhausted[0].id, "player");
        // A second's running (3 points), then down to a walk within about a second
        assert.ok(exhausted[0].time >= 1000 && exhausted[0].time <= 1100, `out of breath after ${exhausted[0].time} ms`);
        assert.ok(events.slow - exhausted[0].time <= 1000, `walking ${events.slow - exhausted[0].time} ms later`);
        assert.equal(lowest, 0);
        assert.deepEqual(player.square, [40, 2]);
        assert.ok(player.stamina > 0 && player.stamina <= player.maxStamina);
    });

    it("walks when told to run with no stamina left", () => {
        const battle = new Battle(open(20, 5), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 2] });

        player.stamina = 0;
        battle.command("player", { type: "move", to: [15, 2], run: true });

        const events = run(battle, 1000);

        assert.equal(events.filter(({ type }) => type === "exhausted").length, 1);
        assert.equal(player.pace, KINDS.player.speed);
        assert.ok(!player.running);
        assert.equal(player.stamina, STAMINA_RECOVERY);
    });

    it("charges an enemy it's told to engage running, slowing down to fight it", () => {
        const battle = new Battle(open(30, 5), { seed: 2 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 2] });
        const walk = KINDS.player.speed;
        const paces = [];

        battle.add({ id: "dummy", kind: "orc", weapon: "cleaver", team: "orcs", square: [26, 2] });
        battle.command("player", { type: "engage", target: "dummy", run: true });

        let attacked = null;

        for (let t = 0; t < 8000 && !attacked; t += STEP_MS) {
            const moving = Boolean(player.to || player.path.length);

            attacked = battle.advance(STEP_MS).find((event) => event.type === "attack" && event.id === "player");

            if (moving) {
                paces.push(player.pace);
            }
        }

        assert.ok(attacked, "attacks");
        assert.deepEqual(player.square, [25, 2]);
        assert.ok(Math.max(...paces) > walk * 3, "ran");
        assert.ok(paces.at(-1) < walk + 1.5, `slowed to ${paces.at(-1).toFixed(2)} m/s`);
        assert.ok(player.stamina < player.maxStamina);
    });

    it("comes back to life rested, and an orc chasing never runs", () => {
        const battle = new Battle(open(40, 40), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 2 + SIGHT - 2] });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [2, 2], ai: "patrol", patrol: [[2, 2], [30, 2]] });
        let fastest = 0;

        player.stamina = 4;

        for (let t = 0; t < 10000; t += STEP_MS) {
            battle.advance(STEP_MS);
            fastest = Math.max(fastest, orc.pace);
        }

        assert.ok(fastest <= KINDS.orc.chase + 1e-9);
        assert.equal(orc.stamina, orc.maxStamina);

        player.hp = 1;
        run(battle, 5000);

        const back = run(battle, KINDS.player.respawn + 1000).find((event) => event.type === "respawn" && event.id === "player");

        assert.ok(back, "the player comes back");
        assert.ok(player.stamina >= player.maxStamina - 1, `with ${player.stamina} stamina`);
    });

    it("heals by Vigor's rolled 8 to 12 hit points after a moment's casting, never past full health", () => {
        const amounts = new Set();

        for (let seed = 1; seed <= 40; seed++) {
            const battle = new Battle(open(10, 10), { seed });
            const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [4, 4] });

            player.hp = seed % 2 ? 20 : 45;

            assert.deepEqual(battle.cast("player", "vigor"), { ok: true });

            const cast = run(battle, SPELLS.vigor.castTime - STEP_MS);

            assert.equal(player.hp, seed % 2 ? 20 : 45, "not yet");
            assert.ok(cast.some((event) => event.type === "cast" && event.spell === "vigor" && event.target === "player"), "the cast is an event");

            const healed = run(battle, STEP_MS * 2).find((event) => event.type === "healed");

            assert.ok(healed, "healed");
            assert.equal(player.hp, Math.min(player.maxHp, (seed % 2 ? 20 : 45) + healed.amount));

            if (seed % 2) {
                assert.ok(Number.isInteger(healed.amount) && healed.amount >= 8 && healed.amount <= 12);
                amounts.add(healed.amount);
            } else {
                assert.equal(player.hp, player.maxHp, "no more than full");
            }
        }

        assert.ok(amounts.size >= 4, `rolled ${[...amounts].sort()}`);
    });

    it("stuns an enemy it can see within reach: it can't move or attack for three seconds", () => {
        const battle = new Battle(open(20, 5), { seed: 3 });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 2] });

        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [9, 2], ai: "patrol", patrol: [[9, 2], [9, 2]] });

        assert.deepEqual(battle.cast("player", "stun", "orc"), { ok: true });

        const events = run(battle, SPELLS.stun.castTime + STEP_MS);
        const stunned = events.find((event) => event.type === "stunned");

        assert.equal(stunned?.id, "orc");
        assert.equal(stunned.by, "player");

        // Stunned, it doesn't come after the player, even though it's seen them
        const square = [...orc.square];
        const during = run(battle, SPELLS.stun.stun - 2 * STEP_MS);

        assert.deepEqual(orc.square, square, "stays put");
        assert.ok(!during.some((event) => event.type === "attack" && event.id === "orc"));

        // Then it does
        run(battle, 3000);
        assert.notDeepEqual(orc.square, square, "comes after the player once it's over");
        assert.equal(orc.target, "player");
    });

    it("stops a stunned enemy's attack before its blow lands", () => {
        const battle = new Battle(open(10, 10), { seed: 2 });
        const player = battle.add({ id: "player", kind: "player", weapon: "wand", team: "hero", square: [4, 4] });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [5, 4], ai: "patrol", patrol: [[5, 4], [5, 4]] });

        // The orc starts a blow; the stun lands before it does
        let events = [];

        while (!orc.attack) {
            events = battle.advance(STEP_MS);
        }

        player.spellReadyAt = 0;
        battle.cast("player", "stun", "orc");
        events = run(battle, 3000);

        const orcHits = events.filter((event) => event.type === "hit" && event.by === "orc" && event.time < events.find((e) => e.type === "stunned").until);

        assert.equal(orcHits.length, 0, "no blows while stunned");
    });

    it("gives each spell a cooldown of its own, and all a short one they share", () => {
        const battle = new Battle(open(20, 5), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 2] });

        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [8, 2] });
        player.hp = 10;

        assert.equal(SPELL_COOLDOWN, 1000);
        assert.equal(battle.cooldown("player"), 0);
        assert.ok(battle.cast("player", "vigor").ok);
        assert.equal(battle.cooldown("player"), 1);
        assert.equal(battle.cooldown("player", "vigor"), 1);
        assert.deepEqual(battle.cast("player", "stun", "orc"), { ok: false, reason: "cooldown" }, "stun waits for the shared cooldown");

        // After the shared one: another spell's ready, but Vigor waits for its own
        run(battle, SPELL_COOLDOWN);
        assert.equal(battle.cooldown("player"), 0);
        assert.equal(battle.cooldown("player", "stun"), 0);
        assert.ok(Math.abs(battle.cooldown("player", "vigor") - (1 - SPELL_COOLDOWN / SPELLS.vigor.cooldown)) < 0.02, `${battle.cooldown("player", "vigor")}`);
        assert.equal(battle.cast("player", "vigor").reason, "cooldown");
        assert.ok(battle.cast("player", "stun", "orc").ok, "another spell");

        run(battle, SPELLS.vigor.cooldown);
        assert.equal(battle.cooldown("player", "vigor"), 0);
        assert.ok(battle.cast("player", "vigor").ok, "ready again");

        // (Each tier of a school's slower to come round again than the last)
        for (const school of ["healing", "fire", "earth", "air", "water"]) {
            const cooldowns = SCHOOLS[school].tiers.map((id) => SPELLS[id].cooldown);

            assert.ok(cooldowns.every((each, k) => k === 0 || each > cooldowns[k - 1]), `${school}: ${cooldowns}`);
        }
    });

    it("sees and shoots over what's low (barrels: blocked, not opaque) but not through a wall", () => {
        // "o" is in the way but can be seen over; "#" is a wall
        const rows = [
            "..........",
            "....o.....",
            "....o.....",
            "....o.....",
            "..........",
            "....#.....",
            "....#.....",
            "....#.....",
        ];
        const world = { blocked: rows.map((row) => Uint8Array.from([...row], (cell) => (cell === "." ? 0 : 1))), opaque: rows.map((row) => Uint8Array.from([...row], (cell) => (cell === "#" ? 1 : 0))) };
        const battle = new Battle(world, { seed: 3 });
        const player = battle.add({ id: "player", kind: "player", weapon: "bow", team: "hero", square: [1, 2] });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [8, 2], ai: "patrol", patrol: [[8, 2], [8, 2]] });
        const hidden = battle.add({ id: "hidden", kind: "orc", weapon: "cleaver", team: "orcs", square: [8, 6], ai: "patrol", patrol: [[8, 6], [8, 6]] });

        assert.equal(battle.canSee(player, orc), true);
        assert.equal(battle.canSee(orc, player), true);
        player.square = [1, 6];
        player.x = 1.5;
        player.y = 6.5;
        assert.equal(battle.canSee(player, hidden), false);
        assert.equal(battle.cast("player", "stun", "hidden").reason, "sight");

        // Back behind the barrels: the bow shoots over them
        player.square = [1, 2];
        player.x = 1.5;
        player.y = 2.5;

        const events = run(battle, 1500);

        assert.ok(events.some((event) => event.type === "projectile" && event.id === "player" && event.target === "orc"));
    });

    it("reaches across a street or a clearing (twice what it did): past where most are seen from, the caster seeing as far as it reaches", () => {
        assert.deepEqual(["vigor", "hurt", "burn", "inferno", "stun", "fear"].map((id) => SPELLS[id].reach), [16, 16, 16, 20, 18, 18]);
        assert.ok(SPELLS.hurt.reach > SIGHT);

        const battle = new Battle(open(30, 5), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 2] });

        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [2 + SIGHT + 3, 2] });
        battle.add({ id: "friend", kind: "player", weapon: "sword", team: "hero", square: [2 + SIGHT + 3, 4] });
        battle.actor("friend").hp -= 20;

        // (Out of the player's sight, though in the open: but not out of the spells')
        assert.equal(battle.canSee(player, battle.actor("orc")), false);
        assert.deepEqual(battle.cast("player", "hurt", "orc"), { ok: true });
        run(battle, SPELLS.hurt.castTime + SPELL_COOLDOWN + SPELLS.hurt.cooldown);
        assert.deepEqual(battle.cast("player", "vigor", "friend"), { ok: true });
    });

    it("says why a spell can't be cast: out of reach, out of sight, full health, not an enemy", () => {
        const battle = new Battle(worldOf([
            "..............................",
            "..........#...................",
            "..........#...................",
            "..........#...................",
            "..............................",
        ]), { seed: 1 });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [8, 2] });
        battle.add({ id: "far", kind: "orc", weapon: "cleaver", team: "orcs", square: [29, 4] });
        battle.add({ id: "hidden", kind: "orc", weapon: "cleaver", team: "orcs", square: [12, 2] });
        battle.add({ id: "friend", kind: "player", weapon: "sword", team: "hero", square: [6, 2] });

        assert.equal(battle.cast("player", "stun", "far").reason, "range");
        assert.equal(battle.cast("player", "stun", "hidden").reason, "sight");
        assert.equal(battle.cast("player", "stun", "friend").reason, "friendly");
        assert.equal(battle.cast("player", "stun", "nobody").reason, "lifeless");
        assert.equal(battle.cast("player", "vigor").reason, "healthy");

        for (const reason of ["range", "sight", "friendly", "lifeless", "healthy", "cooldown", "busy"]) {
            assert.equal(typeof CAST_FAILURES[reason], "string", reason);
        }

        // (Said as themselves, never as one of the host's refusals of the same name: healing at
        // full health isn't "Your pack is full")
        for (const reason of Object.keys(CAST_FAILURES)) {
            assert.ok(!(reason in REFUSALS) || reason === "cooldown", `${reason} is also a refusal`);
        }

        // Failing costs nothing: it's still ready
        assert.equal(battle.cooldown("player"), 0);
    });

    it("plays out in the generated world: the orc patrols its corner while the player waits in the square", () => {
        const world = generateWorld({ seed: 3 });
        const battle = new Battle(world, { seed: 3 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: world.spawns.player });
        const orc = battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: world.spawns.orc, ai: "patrol", patrol: world.patrol });

        // (The first step bakes the town's navigation mesh, once: test/navigation.test.js has
        // what that takes; this is the battle's own)
        const events = run(battle, STEP_MS);
        const start = performance.now();

        events.push(...run(battle, 60000));

        const elapsed = performance.now() - start;

        assert.ok(!events.some((event) => event.type === "attack"), "too far apart to fight");
        assert.ok(orc.square[0] <= world.patrol[0][0] + 2, "the orc keeps to its patrol");
        assert.ok(!player.dead);
        assert.ok(elapsed < 1500, `a minute of battle took ${elapsed.toFixed(0)} ms`);
    });
});
