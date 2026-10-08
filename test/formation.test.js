// Lines of battle (core/formation.js, core/battle.js `formation`; docs/WAR.md *Lines of battle*): an
// army's mix of roles and each one's place in its line; a line marching where it's sent, each
// soldier keeping its place, halting to fight and closing with the enemy; its ranks closed over
// its fallen; casters casting their people's spells and healers healing the most hurt; enemies
// near a player going for them first, so many at once; and the greatsword and the axe.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { ADVANCE, AGGRO, Battle, HEALING, STEP_MS } from "../client/js/core/battle.js";
import { DOCTRINES, FORMATION, MIX, placeAt, placesOf, roleOf, ROLES, rolesOf } from "../client/js/core/formation.js";
import { HEALER_SPELLS, PEOPLE_SCHOOL, ROLE_ARMS, soldierOf } from "../client/js/core/host.js";
import { SCHOOLS, SPELLS } from "../client/js/core/spells.js";
import { WEAPONS } from "../client/js/core/weapons.js";
import { parseGrid } from "./helpers.js";

const open = (width, height) => ({ blocked: parseGrid(Array.from({ length: height }, () => ".".repeat(width))).map((row) => Uint8Array.from(row)) });

function run(battle, ms, each = () => {}) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...battle.advance(STEP_MS));
        each();
    }

    return events;
}

const count = (list) => list.reduce((counts, each) => ({ ...counts, [each]: (counts[each] ?? 0) + 1 }), {});
const mean = (list) => list.reduce((sum, each) => sum + each, 0) / list.length;

// An army of `size` of a team in its line of battle, its front's middle at `anchor`, facing
// `facing` (radians from south, towards east), each with its people's arms in its role
function army(battle, { id, team, people = "human", anchor, facing = 0, size, to = null, advance = false, hp = null }) {
    const roles = rolesOf(size);
    const places = placesOf(roles);
    const counts = {};

    battle.formation(id, { anchor, facing, to, speed: 1.2, advance });

    return roles.map((role, k) => {
        const [x, y] = placeAt({ anchor, facing }, places[k]);
        const square = [Math.floor(x), Math.floor(y)];
        const kit = soldierOf(people, role, (counts[role] = (counts[role] ?? -1) + 1));

        return battle.add({ id: `${id}-${k}`, kind: "soldier", team, ...kit, square, ai: "patrol", patrol: [square], facing, leash: ROLES[role].leash, armed: true, hp, formation: { id, slot: places[k], role } });
    });
}

describe("a line of battle (formation.js)", () => {
    it("mixes an army's roles as near its shares as whole soldiers go, the shield line the most, few casters and healers", () => {
        assert.deepEqual(count(rolesOf(100)), { front: 40, heavy: 15, archer: 25, caster: 10, healer: 10 });
        assert.ok(MIX.front > MIX.archer && MIX.archer > MIX.heavy && MIX.heavy > MIX.caster && MIX.caster === MIX.healer);

        for (let size = 1; size <= 200; size++) {
            const roles = rolesOf(size);
            const counts = count(roles);

            assert.equal(roles.length, size);
            assert.ok(Object.keys(MIX).every((role) => Math.abs((counts[role] ?? 0) - size * MIX[role]) < 1), `${size}: ${JSON.stringify(counts)}`);
            assert.deepEqual(roles, [...roles].sort((a, b) => Object.keys(MIX).indexOf(a) - Object.keys(MIX).indexOf(b)));
        }
    });

    it("leans each people's armies its own way, every one at least half up close, a fifth to a third archers, few casters and healers", () => {
        assert.deepEqual(Object.keys(DOCTRINES).sort(), Object.keys(ROLE_ARMS).sort());

        for (const [people, mix] of Object.entries(DOCTRINES)) {
            assert.deepEqual(Object.keys(mix), Object.keys(MIX), people);
            assert.ok(Math.abs(Object.values(mix).reduce((sum, share) => sum + share, 0) - 1) < 1e-9, `${people}: all of it`);
            assert.ok(mix.front + mix.heavy >= 0.5 && mix.front >= mix.archer, `${people}: up close the most`);
            assert.ok(mix.archer >= 0.2 && mix.archer <= 1 / 3, `${people}: archers`);
            assert.ok(mix.caster <= 0.13 && mix.healer <= 0.12, `${people}: few casters and healers`);
            assert.equal(rolesOf(80, mix).length, 80);
        }

        // (Each its own lean: the elves the most archers, the dark elves casters, the orcs and cats two-handers, the lizards a shield line)
        const most = (role) => Object.entries(DOCTRINES).sort((a, b) => b[1][role] - a[1][role])[0][0];

        assert.equal(most("archer"), "elf");
        assert.equal(most("caster"), "darkElf");
        assert.equal(most("front"), "lizard");
        assert.ok(["orc", "cat"].includes(most("heavy")));
        assert.equal(DOCTRINES.human, MIX);
    });

    it("lays a line out: the shield line in front, two-handers behind its ends, casters in the middle with archers either side, healers behind them, a rear guard behind all", () => {
        for (const size of [3, 5, 12, 30, 80, 200]) {
            const roles = rolesOf(size);
            const places = placesOf(roles);
            const of = (role) => places.filter((_, k) => roles[k] === role);
            const behind = (role) => mean(of(role).map(([, back]) => back));
            const across = (role) => mean(of(role).map(([right]) => Math.abs(right)));

            // (Every place its own, the front rank's at the front)
            assert.equal(new Set(places.map(([right, back]) => `${right.toFixed(2)},${back.toFixed(2)}`)).size, size, `${size}: every place its own`);
            assert.equal(Math.min(...places.map(([, back]) => back)), 0);
            assert.ok(places.every(([, back], k) => back > 0 || roles[k] === "front"), `${size}: the front rank the shield line's`);

            if (size >= 12) {
                const guards = of("front").length >= FORMATION.deep ? Math.round(of("front").length * FORMATION.rear) : 0;
                const line = of("front").sort((a, b) => a[1] - b[1]).slice(0, of("front").length - guards);
                const width = Math.max(...line.map(([right]) => right)) - Math.min(...line.map(([right]) => right));

                assert.ok(Math.max(...line.map(([, back]) => back)) < Math.min(...of("heavy").map(([, back]) => back)), `${size}: the two-handers behind the line`);
                assert.ok(behind("heavy") < behind("caster") && behind("heavy") < behind("archer"), `${size}: the two-handers before those who shoot`);
                assert.ok(Math.max(behind("caster"), behind("archer")) < behind("healer"), `${size}: the healers behind those who shoot`);
                assert.ok(across("caster") < across("archer"), `${size}: the casters in the middle`);
                assert.ok(of("heavy").some(([right]) => right < 0) && of("heavy").some(([right]) => right > 0), `${size}: the two-handers at both ends`);
                assert.ok(width <= (FORMATION.width[1] - 1) * FORMATION.apart + 1e-9, `${size}: ${width} m wide`);
                assert.ok(!guards || of("front").slice(-guards).every(([, back]) => back > Math.max(...of("healer").map(([, b]) => b))), `${size}: the rear guard behind all`);
            }
        }
    });

    it("puts a place in the world as its line faces: behind it is back the way it faces, its right to its right", () => {
        const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;

        // (Facing south, +y: behind is north, its right west; facing east, +x: behind is west, its right south)
        assert.ok(near(placeAt({ anchor: [10, 20], facing: 0 }, [0, 2]), [10, 18]));
        assert.ok(near(placeAt({ anchor: [10, 20], facing: 0 }, [1, 0]), [9, 20]));
        assert.ok(near(placeAt({ anchor: [10, 20], facing: Math.PI / 2 }, [0, 2]), [8, 20]));
        assert.ok(near(placeAt({ anchor: [10, 20], facing: Math.PI / 2 }, [1, 0]), [10, 21]));
    });

    it("gives each weapon its role, and each people's soldiers their arms and spells in each", () => {
        assert.deepEqual(["sword", "cleaver", "greatsword", "axe", "hammer", "bow", "wand", "grimoire"].map((weapon) => roleOf(weapon)), ["front", "front", "heavy", "heavy", "heavy", "archer", "caster", "caster"]);
        assert.equal(roleOf("staff", { heals: true }), "healer");

        for (const [people, arms] of Object.entries(ROLE_ARMS)) {
            for (const [role, weapons] of Object.entries(arms)) {
                assert.ok(weapons.every((weapon) => WEAPONS[weapon]), `${people} ${role}`);
                assert.ok(role === "healer" || weapons.every((weapon) => roleOf(weapon) === role), `${people} ${role}: ${weapons}`);
            }

            const school = SCHOOLS[PEOPLE_SCHOOL[people]];
            const caster = soldierOf(people, "caster");

            assert.deepEqual(caster.casts, [school.tiers[1], school.tiers[0]], `${people}: its school's first two spells, the stronger first`);
            assert.ok(caster.casts.every((id) => !SPELLS[id].needs || SPELLS[id].needs === caster.weapon));
            assert.deepEqual(soldierOf(people, "healer").heals, HEALER_SPELLS);
            assert.equal(soldierOf(people, "archer").casts, null);
        }
    });

    it("has the greatsword and the axe strike about half again as hard as the sword over a fight, the axe slower and heavier", () => {
        const perSecond = (id) => {
            const { damage, interval } = WEAPONS[id].attacks[0];

            return (damage[0] + damage[1]) / 2 / (interval / 1000);
        };

        for (const id of ["greatsword", "axe"]) {
            assert.equal(WEAPONS[id].attacks[0].kind, "melee");
            assert.ok(Math.abs(perSecond(id) / perSecond("sword") - 1.5) < 0.1, `${id}: ${perSecond(id).toFixed(2)} a second`);
        }

        assert.ok(WEAPONS.axe.attacks[0].interval > WEAPONS.greatsword.attacks[0].interval && WEAPONS.axe.attacks[0].damage[1] > WEAPONS.greatsword.attacks[0].damage[1]);
    });
});

describe("an army in its line of battle (battle.js formation)", () => {
    it("marches where it's sent, each soldier keeping its place in its line, and stands there", () => {
        const battle = new Battle(open(60, 90), { seed: 3 });
        const soldiers = army(battle, { id: "f", team: "hero", anchor: [30, 12], size: 30, to: [30, 60] });
        const formation = battle.formations.f;

        run(battle, 20000);
        assert.ok(formation.anchor[1] > 30 && formation.anchor[1] < 60, "on the march");

        run(battle, 25000);
        assert.deepEqual(formation.anchor, [30, 60]);
        assert.equal(formation.to, null);

        for (const soldier of soldiers) {
            const [x, y] = placeAt(formation, soldier.formation.slot);

            assert.ok(Math.hypot(soldier.x - x, soldier.y - y) < 1.5, `${soldier.id} at its place`);
        }
    });

    it("halts while any of it's fighting, and, standing, closes with the nearest enemy within sight of it, a formation told to hold standing", () => {
        for (const advance of [true, false]) {
            const battle = new Battle(open(60, 90), { seed: 3 });

            army(battle, { id: "f", team: "hero", anchor: [30, 12], size: 20, advance });
            battle.add({ id: "orc", kind: "soldier", team: "orcs", weapon: "cleaver", square: [30, 12 + ADVANCE.sight - 10], hp: 100000, ai: "patrol", patrol: [[30, 12 + ADVANCE.sight - 10]] });

            const anchors = [];

            run(battle, 40000, () => anchors.push(battle.formations.f.anchor[1]));

            if (!advance) {
                assert.deepEqual(battle.formations.f.anchor, [30, 12], "held");
                continue;
            }

            // (On towards the orc, and halted there to fight it, short of it)
            assert.ok(anchors.at(-1) > 30 && anchors.at(-1) <= 12 + ADVANCE.sight - 10, `advanced to ${anchors.at(-1)}`);
            assert.ok(battle.time - battle.formations.f.engagedAt < 1000);
            assert.ok(anchors.slice(-20).every((y) => y === anchors.at(-1)), "halted");
        }
    });

    it("closes its ranks over its fallen: those behind step up into the front rank's gaps, the line narrows, each of its role", () => {
        const battle = new Battle(open(60, 90), { seed: 3 });
        const soldiers = army(battle, { id: "f", team: "hero", anchor: [30, 20], size: 40 });
        const front = soldiers.filter(({ formation: { slot } }) => slot[1] === 0);
        const before = new Map(soldiers.map(({ id, formation: { slot } }) => [id, slot]));

        // (Four from the middle of the front rank, and a healer)
        front.sort((a, b) => Math.abs(a.formation.slot[0]) - Math.abs(b.formation.slot[0]) || a.formation.slot[0] - b.formation.slot[0]);
        front.slice(0, 4).forEach(({ id }) => battle.remove(id));
        battle.remove(soldiers.find(({ formation: { role } }) => role === "healer").id);
        run(battle, 2000);

        const left = battle.actors.filter(({ formation }) => formation?.id === "f");
        const roles = left.map(({ formation: { role } }) => role);
        const places = placesOf(roles);
        const key = ([right, back]) => `${right.toFixed(3)},${back.toFixed(3)}`;

        // (The line laid out again for those left, each in a place of its own role)
        assert.equal(left.length, 35);

        for (const role of Object.keys(ROLES)) {
            assert.deepEqual(left.filter((soldier) => soldier.formation.role === role).map(({ formation: { slot } }) => key(slot)).sort(), places.filter((_, k) => roles[k] === role).map(key).sort(), role);
        }

        // (Its front rank as full as a line of those left is, those who stepped into it from behind)
        const rank = left.filter(({ formation: { slot } }) => slot[1] === 0);
        const stepped = rank.filter(({ id }) => before.get(id)[1] > 0);

        assert.equal(rank.length, places.filter(([, back]) => back === 0).length);
        assert.ok(stepped.length >= 1, "some stepped up");
        assert.ok(rank.length < front.length, "narrower");

        // (Their places gone to, those far from them at a run)
        run(battle, 6000);

        for (const soldier of left) {
            const [x, y] = placeAt(battle.formations.f, soldier.formation.slot);

            assert.ok(Math.hypot(soldier.x - x, soldier.y - y) < 1.5, `${soldier.id} at its new place`);
        }

        // (With none of its shield line left, its two-handers its front)
        left.filter(({ formation: { role } }) => role === "front").forEach(({ id }) => battle.remove(id));
        run(battle, 2000);

        const heavy = battle.actors.filter(({ formation }) => formation?.role === "heavy");

        assert.equal(Math.min(...heavy.map(({ formation: { slot } }) => slot[1])), 0);
    });

    it("plays out a battle of two lines the same carried on from a snapshot, closing its ranks as they fall", () => {
        const world = open(60, 90);
        const battle = new Battle(world, { seed: 9 });

        army(battle, { id: "a", team: "hero", anchor: [30, 25], facing: 0, size: 24, advance: true });
        army(battle, { id: "b", team: "orcs", people: "orc", anchor: [30, 45], facing: Math.PI, size: 24, advance: true });
        run(battle, 15000);

        const again = Battle.restore(world, battle.snapshot());
        const hash = (each) => {
            const events = run(each, 30000);

            return createHash("sha1")
                .update(JSON.stringify([each.actors.map(({ id, x, y, hp, dead, formation }) => [id, x, y, hp, dead, formation?.slot]), events.map(({ type, time, id, target }) => [type, time, id, target]), each.formations]))
                .digest("hex");
        };

        assert.equal(hash(again), hash(battle));
        assert.ok(battle.actors.filter(({ dead, formation }) => formation && dead).length > 5, "a battle was fought");
    });
});

describe("casters and healers (battle.js)", () => {
    it("has a caster cast its spells at an enemy in reach, the first of them that's ready", () => {
        const battle = new Battle(open(40, 30), { seed: 5 });
        const kit = soldierOf("human", "caster");

        battle.add({ id: "mage", kind: "soldier", team: "hero", ...kit, square: [5, 15], ai: "patrol", patrol: [[5, 15]], leash: ROLES.caster.leash, armed: true });
        battle.add({ id: "orc", kind: "soldier", team: "orcs", weapon: "cleaver", square: [17, 15], hp: 100000, ai: "patrol", patrol: [[17, 15]], leash: 1 });

        const casts = run(battle, 12000).filter(({ type, id }) => type === "cast" && id === "mage");

        assert.equal(casts[0].spell, kit.casts[0], "the stronger first");
        assert.ok(casts.some(({ spell }) => spell === kit.casts[1]), "the other while it's cooling");
        assert.ok(casts.every(({ spell, target }) => kit.casts.includes(spell) && target === "orc"));
        assert.ok(battle.actor("orc").hp < battle.actor("orc").maxHp);
    });

    it("has a healer heal whoever of its own in reach is the most hurt: its strongest spell when they're badly hurt, none when no one's hurt enough", () => {
        const battle = new Battle(open(40, 30), { seed: 5 });

        battle.add({ id: "healer", kind: "soldier", team: "hero", ...soldierOf("human", "healer"), square: [10, 15], ai: "patrol", patrol: [[10, 15]], leash: ROLES.healer.leash });

        const [scratched, hurt, worst] = [0.9, 0.7, 0.4].map((share, k) => {
            const soldier = battle.add({ id: `s${k}`, kind: "soldier", team: "hero", weapon: "sword", square: [13 + k, 15], ai: "patrol", patrol: [[13 + k, 15]], hp: 100 });

            soldier.hp = share * soldier.maxHp;

            return soldier;
        });

        // (No one under HEALING.below: no one healed)
        assert.ok(scratched.hp / scratched.maxHp > HEALING.below && hurt.hp / hurt.maxHp < HEALING.below && worst.hp / worst.maxHp < HEALING.mend);

        const heals = run(battle, 20000).filter(({ type, id }) => type === "cast" && id === "healer");

        assert.deepEqual([heals[0].target, heals[0].spell], [worst.id, HEALER_SPELLS.at(-1)], "the most hurt first, with its strongest");
        assert.ok(heals.some(({ target, spell }) => target === hurt.id && spell === HEALER_SPELLS[0]), "then the next, with its weakest");
        assert.ok(heals.every(({ target }) => target !== scratched.id || scratched.hp / scratched.maxHp < HEALING.below));

        // (No one hurt enough: nothing cast)
        const calm = new Battle(open(40, 30), { seed: 5 });

        calm.add({ id: "healer", kind: "soldier", team: "hero", ...soldierOf("human", "healer"), square: [10, 15], ai: "patrol", patrol: [[10, 15]] });
        calm.add({ id: "s", kind: "soldier", team: "hero", weapon: "sword", square: [12, 15], ai: "patrol", patrol: [[12, 15]], hp: 100 }).hp = 90;
        assert.equal(run(calm, 5000).filter(({ type }) => type === "cast").length, 0);
    });
});

describe("enemies near a player go for them first (battle.js AGGRO)", () => {
    it("sets so many of them on the player at once, up close and from afar, the rest on the player's own", () => {
        const battle = new Battle(open(60, 60), { seed: 7 });
        const player = battle.add({ id: "p", kind: "player", team: "hero", weapon: "sword", square: [30, 30], hp: 100000 });

        // (The player's own about them, and orcs all round: 14 with cleavers, 8 with bows)
        for (let k = 0; k < 8; k++) {
            battle.add({ id: `ally-${k}`, kind: "soldier", team: "hero", weapon: "sword", square: [27 + (k % 4) * 2, 28 + Math.floor(k / 4) * 4], ai: "patrol", patrol: [[27 + (k % 4) * 2, 28 + Math.floor(k / 4) * 4]], hp: 100000, leash: 2 });
        }

        for (let k = 0; k < 22; k++) {
            const angle = (k / 22) * Math.PI * 2;
            const r = k < 14 ? 6 : 10;
            const square = [Math.round(30 + r * Math.cos(angle)), Math.round(30 + r * Math.sin(angle))];

            battle.add({ id: `orc-${k}`, kind: "soldier", team: "orcs", weapon: k < 14 ? "cleaver" : "bow", square, ai: "patrol", patrol: [square], leash: 20, hp: 100000 });
        }

        const orcs = battle.actors.filter(({ team }) => team === "orcs");
        const shoots = (orc) => orc.weapon === "bow";
        const most = { melee: 0, ranged: 0 };

        run(battle, 8000, () => {
            const on = orcs.filter(({ target }) => target === player.id);

            most.melee = Math.max(most.melee, on.filter((orc) => !shoots(orc)).length);
            most.ranged = Math.max(most.ranged, on.filter(shoots).length);
            assert.ok(on.filter((orc) => !shoots(orc)).length <= AGGRO.melee && on.filter(shoots).length <= AGGRO.ranged, `at ${battle.time}`);
        });

        assert.deepEqual(most, { melee: AGGRO.melee, ranged: AGGRO.ranged }, "as many as can be");
        assert.ok(orcs.filter(({ target }) => target?.startsWith("ally-")).length >= 6, "the rest on the player's own");
    });
});
