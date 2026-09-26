import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, KINDS, SIGHT, SPRINT, STAMINA_DRAIN, STAMINA_RECOVERY, STEP_MS } from "../client/js/core/battle.js";
import { createRandom } from "../client/js/core/random.js";
import { CAST_FAILURES, SPELL_COOLDOWN, SPELLS } from "../client/js/core/spells.js";
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

    it("goes straight ahead the way it faces as far as the way is clear, running while its stamina lasts", () => {
        const battle = new Battle(worldOf([
            "..........................#.",
            "............................",
            "............................",
        ]), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [1, 0] });

        // Facing east: along the row to the square before the wall
        battle.command("player", { type: "ahead", facing: Math.PI / 2, run: true });
        assert.deepEqual(player.order, { type: "move", to: [25, 0], run: true });
        assert.deepEqual(player.path[0], [2, 0]);

        run(battle, 1500);
        assert.ok(player.running && player.pace > KINDS.player.speed * 2, "sprinting");
        run(battle, 8000);
        assert.deepEqual(player.square, [25, 0]);
        assert.ok(player.x > 25 && player.x < 26 && player.y === 0.5, "never left the row");

        // Up against the wall, there's nowhere ahead to go
        battle.command("player", { type: "ahead", facing: Math.PI / 2, run: true });
        assert.equal(player.order, null);

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

    it("heals by a rolled 10 to 20 hit points after a moment's casting, never past full health", () => {
        const amounts = new Set();

        for (let seed = 1; seed <= 40; seed++) {
            const battle = new Battle(open(10, 10), { seed });
            const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [4, 4] });

            player.hp = seed % 2 ? 20 : 45;

            assert.deepEqual(battle.cast("player", "heal"), { ok: true });

            const cast = run(battle, SPELLS.heal.castTime - STEP_MS);

            assert.equal(player.hp, seed % 2 ? 20 : 45, "not yet");
            assert.ok(cast.some((event) => event.type === "cast" && event.spell === "heal" && event.target === "player"), "the cast is an event");

            const healed = run(battle, STEP_MS * 2).find((event) => event.type === "healed");

            assert.ok(healed, "healed");
            assert.equal(player.hp, Math.min(player.maxHp, (seed % 2 ? 20 : 45) + healed.amount));

            if (seed % 2) {
                assert.ok(Number.isInteger(healed.amount) && healed.amount >= 10 && healed.amount <= 20);
                amounts.add(healed.amount);
            } else {
                assert.equal(player.hp, player.maxHp, "no more than full");
            }
        }

        assert.ok(amounts.size >= 6, `rolled ${[...amounts].sort()}`);
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

    it("shares one three-second cooldown between every spell", () => {
        const battle = new Battle(open(20, 5), { seed: 1 });
        const player = battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [2, 2] });

        battle.add({ id: "orc", kind: "orc", weapon: "cleaver", team: "orcs", square: [8, 2] });
        player.hp = 10;

        assert.equal(SPELL_COOLDOWN, 3000);
        assert.equal(battle.cooldown("player"), 0);
        assert.ok(battle.cast("player", "heal").ok);
        assert.equal(battle.cooldown("player"), 1);
        assert.deepEqual(battle.cast("player", "stun", "orc"), { ok: false, reason: "cooldown" }, "stun waits for heal's cooldown");

        run(battle, 1500);
        assert.ok(Math.abs(battle.cooldown("player") - 0.5) < 0.02, `half way: ${battle.cooldown("player")}`);
        assert.equal(battle.cast("player", "heal").reason, "cooldown");

        run(battle, 1500);
        assert.equal(battle.cooldown("player"), 0);
        assert.ok(battle.cast("player", "stun", "orc").ok, "ready again");
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

    it("says why a spell can't be cast: out of reach, out of sight, full health, not an enemy", () => {
        const battle = new Battle(worldOf([
            "....................",
            "..........#.........",
            "..........#.........",
            "..........#.........",
            "....................",
        ]), { seed: 1 });

        battle.add({ id: "player", kind: "player", weapon: "sword", team: "hero", square: [8, 2] });
        battle.add({ id: "far", kind: "orc", weapon: "cleaver", team: "orcs", square: [19, 4] });
        battle.add({ id: "hidden", kind: "orc", weapon: "cleaver", team: "orcs", square: [12, 2] });
        battle.add({ id: "friend", kind: "player", weapon: "sword", team: "hero", square: [6, 2] });

        assert.equal(battle.cast("player", "stun", "far").reason, "range");
        assert.equal(battle.cast("player", "stun", "hidden").reason, "sight");
        assert.equal(battle.cast("player", "stun", "friend").reason, "target");
        assert.equal(battle.cast("player", "stun", "nobody").reason, "dead");
        assert.equal(battle.cast("player", "heal").reason, "full");

        for (const reason of ["range", "sight", "target", "dead", "full", "cooldown", "busy"]) {
            assert.equal(typeof CAST_FAILURES[reason], "string", reason);
        }

        // Failing costs nothing: it's still ready
        assert.equal(battle.cooldown("player"), 0);
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
