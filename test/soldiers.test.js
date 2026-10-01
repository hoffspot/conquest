// The war come to life near a player (client/js/core/host.js with core/war/muster.js, and the
// battle's guards, patrols and grudges, core/battle.js): each town's soldiers out while a player's
// near it, of whoever holds it; who fights whom by how their peoples stand; picking a fight with
// a neutral people's guard; soldiers who fall are its garrison the fewer
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EQUIPMENT } from "../client/js/characters/equipment.js";
import { ARMS, soldierLook } from "../client/js/characters/soldiers.js";
import { Battle, FOE_MS, KINDS, SIGHT, STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, LEASH, MUSTER, ORC_ROUTED_MS, RELEVANCE, RELIEF_MS } from "../client/js/core/host.js";
import { squareKey, squaresOf } from "../client/js/core/grid.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { POSTED } from "../client/js/core/war/muster.js";
import { HOLDINGS } from "../client/js/core/war/war.js";
import { distanceBetween } from "../client/js/core/weapons.js";
import { decode, encode } from "../client/js/core/wire.js";
import { generateWorld } from "../client/js/core/world.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// A world with its player in it, and the world's own people
function hosted(seed = 2) {
    const host = new Host(buildWorld({ seed }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    return host;
}

const soldiersOf = (host, town) => host.battle.actors.filter(({ id }) => id.startsWith(`${town}/`));
const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A free square `reach` squares or so from someone that they can see (the nearest such)
function inSight(host, actor, reach) {
    const squares = squaresOf(host.world.maps.town);
    const taken = new Set(host.battle.actors.map(({ square: [x, y] }) => squareKey(x, y)));

    for (let r = reach; r >= 2; r--) {
        for (let dx = -r; dx <= r; dx++) {
            for (const square of [[actor.square[0] + dx, actor.square[1] - r], [actor.square[0] + dx, actor.square[1] + r]]) {
                const there = { map: actor.map, square };

                if (!squares.blocked(...square) && !taken.has(squareKey(...square)) && host.battle.canSee(actor, there) && host.battle.canSee(there, actor)) {
                    return square;
                }
            }
        }
    }

    throw new Error(`nowhere in ${actor.id}'s sight`);
}

describe("the war come to life (host.js, muster.js)", () => {
    it("brings the player's town's guards and patrols out as they play, of its people, at their posts", () => {
        const host = hosted();
        const home = host.war.town(host.world.start.id);
        const events = run(host, STEP_MS);
        const muster = events.find(({ type, town }) => type === "muster" && town === home.id);
        const soldiers = soldiersOf(host, home.id);

        assert.equal(home.kind, "town");
        assert.ok(muster, "(mustered at once)");
        assert.equal(soldiers.length, POSTED.town + HOLDINGS.town.patrols * 2);
        assert.deepEqual(muster.ids, soldiers.map(({ id }) => id));
        assert.ok(muster.banners.length >= 1);

        for (const soldier of soldiers) {
            assert.equal(soldier.kind, "soldier");
            assert.equal(soldier.team, "human");
            assert.equal(soldier.ai, "patrol");
            assert.ok(!host.battle.hostile(soldier, host.battle.actor(HOST_PLAYER)), "(the player's own people)");
            assert.ok(host.battle.hostile(soldier, host.battle.actor("orc")), "(the orc, no people's, is theirs too)");
            assert.deepEqual(host.soldiers.get(soldier.id).people, "human");
        }

        const guards = soldiers.filter(({ id }) => id.includes("/guard-"));

        assert.ok(guards.every(({ patrol, leash }) => patrol.length === 1 && leash === LEASH));
        assert.ok(soldiers.filter(({ id }) => id.includes("/patrol-")).every(({ patrol }) => patrol.length === 6));
        assert.ok(host.battle.hostile(host.battle.actor("orc"), host.battle.actor(HOST_PLAYER)), "(the orc's still the player's enemy)");
    });

    it("lets them go once every player's far off, and brings the new holders' out once the town's changed hands", () => {
        const host = hosted();
        const home = host.war.town(host.world.start.id);
        const player = host.battle.actor(HOST_PLAYER);
        const start = [...player.square];

        run(host, STEP_MS);

        // Taken by the orcs (and the humans at war with them): orcish soldiers now, the player's enemies
        home.owner = "orc";
        host.war.known.push("human|orc");
        host.war.relations["human|orc"] = { state: "hostile", since: 0 };

        const changed = run(host, RELEVANCE.every);
        const orcs = soldiersOf(host, home.id);

        assert.deepEqual(changed.filter(({ type, town }) => (type === "dismiss" || type === "muster") && town === home.id).map(({ type }) => type), ["dismiss", "muster"]);
        assert.ok(orcs.length > 0 && orcs.every(({ team }) => team === "orc"));
        assert.ok(orcs.every((soldier) => host.battle.hostile(soldier, player)));
        assert.equal(host.soldiers.get(orcs[0].id).weapon, "cleaver");

        // Far off: let go
        put(player, [start[0] - 400, start[1]]);

        const gone = run(host, RELEVANCE.every);

        assert.ok(gone.some(({ type, town }) => type === "dismiss" && town === home.id));
        assert.equal(soldiersOf(host, home.id).length, 0);
        assert.equal(host.mustered.size, [...host.mustered.keys()].filter((id) => id !== home.id).length);
        assert.ok(MUSTER.far > MUSTER.near);
    });

    it("lets a player pick a fight with a neutral people's guard: its fellows turn on them, a grudge is borne, and those who fall are the garrison the fewer", () => {
        const host = hosted();
        const home = host.war.town(host.world.start.id);
        const player = host.battle.actor(HOST_PLAYER);

        // Held by the elves, at peace with the humans
        home.owner = "elf";
        run(host, STEP_MS);

        const elves = soldiersOf(host, home.id);
        const guard = elves.find(({ id }) => id.endsWith("/guard-0"));
        const fellow = elves.find(({ id }) => id.endsWith("/guard-1"));

        assert.equal(host.war.relation("human", "elf") === "hostile", false);
        assert.ok(!host.battle.hostile(guard, player));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "talk", with: guard.id }), { ok: false, reason: "far" });

        // Next to it: a word first, then a fight
        put(player, [guard.square[0], guard.square[1] + 1]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "talk", with: guard.id }), { ok: true });
        host.command(HOST_PLAYER, { type: "talk", with: null });
        Object.assign(player, { hp: 5000, maxHp: 5000 });
        assert.deepEqual(host.command(HOST_PLAYER, { type: "engage", target: guard.id }), { ok: true });

        const before = home.garrison;
        const events = run(host, 20000);

        assert.ok(events.some(({ type, id, by }) => type === "hit" && id === guard.id && by === HOST_PLAYER));
        assert.ok(host.battle.hostile(guard, player) && host.battle.hostile(fellow, player), "(it and its fellow who saw hold it against the player)");
        assert.ok((host.war.realm("elf").standing.human ?? 0) < 0, "(the elves bear the humans a grudge)");
        assert.ok(events.some(({ type, id }) => type === "death" && id === guard.id), "(the guard fell)");
        assert.ok(home.garrison < before);

        // Taken away a while after
        run(host, 11000);
        assert.equal(host.battle.actor(guard.id), null);
        assert.ok(!host.soldiers.has(guard.id));

        // A grudge between two, not their peoples' war: forgotten after a while
        assert.ok(!host.battle.hostile(fellow, player) || host.battle.time - 0 < FOE_MS + 40000);
    });

    it("sets the town's guards and patrols on the orc when they see it, whoever's people the player is; felled by them, it keeps away a good while", () => {
        for (const race of ["human", "elf"]) {
            const host = new Host(buildWorld({ seed: 2 }), { populate: false });

            host.join({ id: HOST_PLAYER, hero: { ...HERO, race } });
            host.populate();
            run(host, STEP_MS);

            const home = host.world.start.id;
            const orc = host.battle.actor("orc");
            const guard = soldiersOf(host, home).find(({ id }) => id.endsWith("/guard-0"));
            const patrol = soldiersOf(host, home).find(({ id }) => id.includes("/patrol-"));

            // At its post: the orc in its sight
            put(orc, inSight(host, guard, 8));
            run(host, 1000);
            assert.equal(guard.target, "orc", `${race}: the guard's after the orc`);

            // A patrol on the far side of its round (further than its leash from where it began):
            // the orc in its sight there
            put(orc, orc.patrol[0]);
            put(guard, guard.patrol[0]);
            put(patrol, patrol.patrol[3]);
            patrol.patrolIndex = 4;
            assert.ok(distanceBetween(patrol.patrol[0], patrol.square) > patrol.leash);
            put(orc, inSight(host, patrol, 8));
            run(host, 1000);
            assert.equal(patrol.target, "orc", `${race}: the patrol's after the orc`);

            // Felled by them: back only a good while after (by a player, as ever: battle.js KINDS)
            orc.hp = 1;
            run(host, 20000);
            assert.ok(orc.dead, `${race}: felled`);
            assert.ok(orc.respawnAt >= host.battle.time + ORC_ROUTED_MS - 20000 - STEP_MS);
        }

        // Felled by the player: back as soon as ever
        const host = hosted();
        const orc = host.battle.actor("orc");
        const player = host.battle.actor(HOST_PLAYER);

        run(host, STEP_MS);
        put(orc, [player.square[0] + 1, player.square[1]]);
        orc.hp = 1;
        host.command(HOST_PLAYER, { type: "engage", target: "orc" });

        const events = run(host, 5000);

        assert.ok(events.some(({ type, id, by }) => type === "death" && id === "orc" && by === HOST_PLAYER));
        assert.ok(orc.respawnAt <= host.battle.time + KINDS.orc.respawn);
    });

    it("relieves a town's fallen soldiers a while after they're taken away, as many as its garrison has, out of the players' sight", () => {
        const host = hosted();
        const home = host.war.town(host.world.start.id);

        run(host, STEP_MS);

        const soldiers = soldiersOf(host, home.id);
        const guard = soldiers.find(({ id }) => id.endsWith("/guard-0"));
        const post = [...guard.patrol[0]];
        const player = host.battle.actor(HOST_PLAYER);
        const orc = host.battle.actor("orc");

        // Felled (by the orc, then gone from the world), and taken away
        Object.assign(orc, { hp: 5000, maxHp: 5000 });
        guard.hp = 1;
        put(orc, inSight(host, guard, 2));

        for (let t = 0; t < 10000 && !guard.dead; t += STEP_MS) {
            host.advance(STEP_MS);
        }

        assert.ok(guard.dead);
        host.battle.remove("orc");
        run(host, 11000);
        assert.equal(host.battle.actor(guard.id), null);
        assert.ok(!host.mustered.get(home.id).ids.includes(guard.id));

        // Not at once; nor with none to spare (asked again a while after)
        run(host, RELIEF_MS - 12000);
        assert.equal(host.battle.actor(guard.id), null, "(not at once)");

        const garrison = home.garrison;

        home.garrison = 1;
        run(host, 8000);
        assert.equal(host.battle.actor(guard.id), null, "(none to spare)");
        home.garrison = garrison;

        // Nor where a player's watching
        put(player, inSight(host, { ...guard, square: post, map: "town" }, 4));
        run(host, RELIEF_MS);
        assert.equal(host.battle.actor(guard.id), null, "(not while it's watched)");

        // Out of their sight: another in its place
        put(player, host.world.spawns.player);

        const relieved = run(host, RELEVANCE.every);
        const again = host.battle.actor(guard.id);

        assert.ok(relieved.some(({ type, town, ids }) => type === "relieved" && town === home.id && ids.includes(guard.id)));
        assert.ok(again && !again.dead && again.team === home.owner && again.leash === LEASH && again.patrol.length === 1);
        assert.ok(host.mustered.get(home.id).ids.includes(guard.id));
        assert.equal(soldiersOf(host, home.id).filter(({ dead }) => !dead).length, soldiers.length);
        assert.equal(host.mustered.get(home.id).relief, null);
    });

    it("keeps its soldiers with the world, and carries on from them exactly", () => {
        const host = hosted();

        run(host, 3000);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.mustered.keys()], [...host.mustered.keys()]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 6000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });
});

describe("guards, patrols and grudges (battle.js)", () => {
    const open = (size) => ({ blocked: Array.from({ length: size }, () => new Uint8Array(size)) });

    it("walks a patrol round all its points, in turn", () => {
        const battle = new Battle(open(40));
        const round = [[5, 5], [30, 5], [30, 30], [5, 30]];
        const seen = new Set();

        battle.add({ id: "p", kind: "soldier", team: "a", square: [5, 5], ai: "patrol", patrol: round });

        for (let t = 0; t < 120000; t += STEP_MS) {
            battle.advance(STEP_MS);

            const { square } = battle.actor("p");

            for (const [k, point] of round.entries()) {
                if (square[0] === point[0] && square[1] === point[1]) {
                    seen.add(k);
                }
            }
        }

        assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
    });

    it("keeps a guard near its post: it goes after an enemy within its leash, and comes back, facing out", () => {
        const battle = new Battle(open(60));

        battle.add({ id: "g", kind: "soldier", weapon: "sword", team: "a", square: [10, 10], ai: "patrol", patrol: [[10, 10]], leash: 8, facing: 1.2 });
        battle.add({ id: "e", kind: "player", weapon: "sword", team: "b", square: [10, 25] });

        for (let t = 0; t < 3000; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        // (Too far from its post: it stays)
        assert.deepEqual(battle.actor("g").square, [10, 10]);
        assert.equal(battle.actor("g").facing, 1.2);

        // Within its leash: after them
        Object.assign(battle.actor("e"), { square: [10, 16], x: 10.5, y: 16.5 });

        for (let t = 0; t < 3000; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        assert.ok(battle.actor("g").square[1] > 12);
    });

    it("keeps a patrol within its leash of the round it walks, wherever on it it is", () => {
        const battle = new Battle(open(80));

        battle.add({ id: "p", kind: "soldier", weapon: "sword", team: "a", square: [70, 40], ai: "patrol", patrol: [[5, 5], [70, 5], [70, 70], [5, 70]], leash: 8 });
        battle.add({ id: "far", kind: "player", weapon: "sword", team: "b", square: [59, 40] });
        battle.actor("p").patrolIndex = 2;

        // (Eleven squares off its round, and further from where it began: let be)
        for (let t = 0; t < 1000; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        assert.equal(battle.actor("p").target, null);

        // Seven off it: after them, though they're far from where it began
        battle.add({ id: "near", kind: "player", weapon: "sword", team: "b", square: [63, battle.actor("p").square[1]] });

        for (let t = 0; t < 1000; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        assert.equal(battle.actor("p").target, "near");
    });

    it("comes to the help of one of its own it can see fighting, though the enemy's further off than it can see, within its leash", () => {
        // (Everyone's enemy "b"'s; "a" and "c" at peace)
        const battle = new Battle(open(60), { relations: (one, other) => one.team === "b" || other.team === "b" });
        const post = (id, square, leash, team = "a") => battle.add({ id, kind: "soldier", weapon: "sword", team, square, ai: "patrol", patrol: [square], leash });

        post("g", [10, 10], 20);
        post("partner", [10, 16], 20);
        post("tied", [6, 10], 5);
        post("stranger", [13, 10], 20, "c");
        battle.add({ id: "e", kind: "player", weapon: "sword", team: "b", square: [10, 26] });
        Object.assign(battle.actor("e"), { hp: 5000, maxHp: 5000 });

        for (let t = 0; t < 600; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        const [g, partner, tied, stranger] = ["g", "partner", "tied", "stranger"].map((id) => battle.actor(id));

        assert.ok(distanceBetween(g.patrol[0], [10, 26]) > SIGHT && battle.canSee(g, partner));
        assert.equal(partner.target, "e", "(it sees them)");
        assert.equal(g.target, "e", "(the alarm raised: to its help)");
        assert.equal(tied.target, null, "(beyond its leash: it keeps its post)");
        assert.equal(stranger.target, null, "(not one of its own)");
    });

    it("asks the host whether two teams are enemies; grudges between two count whatever their teams, until they're forgotten", () => {
        const peace = new Battle(open(20), { relations: () => false });

        peace.add({ id: "a", kind: "soldier", weapon: "sword", team: "x", square: [5, 5] });
        peace.add({ id: "b", kind: "soldier", weapon: "sword", team: "y", square: [6, 5] });
        peace.add({ id: "c", kind: "soldier", weapon: "sword", team: "y", square: [7, 5] });
        peace.add({ id: "f", kind: "folk", team: "folk", square: [9, 9], neutral: true });

        const [a, b, c] = ["a", "b", "c"].map((id) => peace.actor(id));

        assert.ok(!peace.hostile(a, b));
        assert.ok(new Battle(open(20)).hostile({ team: "x", foes: {} }, { team: "y", foes: {} }), "(without relations: always)");

        // a picks a fight with b (the host's to allow it: a holds it against b), and strikes it:
        // b and c, who saw, hold it against a
        peace.command("a", { type: "engage", target: "b" });
        peace.advance(STEP_MS);
        assert.equal(a.order, null, "(no fighting a friend without a grudge)");
        a.foes.b = FOE_MS;
        peace.command("a", { type: "engage", target: "b" });

        for (let t = 0; t < 3000 && b.hp === b.maxHp; t += STEP_MS) {
            peace.advance(STEP_MS);
        }

        assert.ok(b.hp < b.maxHp);
        assert.ok(b.foes.a > peace.time && c.foes.a > peace.time);
        assert.ok(peace.hostile(c, a));
        assert.ok(!peace.hostile(peace.actor("f"), a), "(never the folk)");

        // Forgotten after FOE_MS
        a.foes = {};
        b.foes.a = peace.time;
        c.foes.a = peace.time;
        assert.ok(!peace.hostile(c, a));
    });

    it("never brings a fallen soldier back", () => {
        const world = generateWorld({ seed: 3 });
        const battle = new Battle(world);

        battle.add({ id: "s", kind: "soldier", weapon: "sword", team: "a", square: world.spawns.player });
        battle.add({ id: "p", kind: "player", weapon: "hammer", team: "b", square: [world.spawns.player[0] + 1, world.spawns.player[1]] });
        battle.actor("s").hp = 1;
        battle.command("p", { type: "engage", target: "s" });

        for (let t = 0; t < 120000; t += STEP_MS) {
            battle.advance(STEP_MS);
        }

        assert.equal(battle.actor("s").dead, true);
        assert.equal(battle.actor("s").respawnAt, Infinity);
    });
});

describe("the peoples' soldiers' looks (characters/soldiers.js)", () => {
    it("dresses each people's soldiers in their own bodies and parts, with what they fight with", () => {
        for (const [people, arms] of Object.entries(ARMS)) {
            for (const weapon of new Set(arms)) {
                for (const sex of ["m", "f"]) {
                    const look = soldierLook({ people, weapon, sex, seed: 11 });

                    assert.deepEqual(soldierLook({ people, weapon, sex, seed: 11 }), look);
                    assert.equal(look.shape.macro.gender, sex === "f" ? 0 : 1, `${people} ${sex}`);
                    assert.ok(look.sheathed);

                    for (const id of look.equipment) {
                        assert.ok(EQUIPMENT[id], `${people}: ${id}`);
                    }

                    assert.ok(look.equipment.length >= 5, `${people}: dressed`);
                }
            }
        }

        const cat = soldierLook({ people: "cat", weapon: "bow", seed: 4 });
        const lizard = soldierLook({ people: "lizard", weapon: "staff", seed: 4 });
        const elves = [1, 2, 3].map((seed) => soldierLook({ people: "elf", weapon: "bow", seed }));

        assert.ok(cat.equipment.includes("catEars") && cat.equipment.includes("catTail") && cat.look.skin.fur > 0);
        assert.ok(lizard.equipment.includes("lizardTail") && lizard.look.skin.scales > 0);
        assert.ok(elves.every(({ shape }) => shape.details.earLength >= 0.8));
        assert.equal(new Set(elves.map((look) => JSON.stringify(look.shape))).size, 3, "each their own");
        assert.equal(soldierLook({ people: "orc", weapon: "cleaver", seed: 4 }).walk, "orc");
    });

    it("dresses each people's soldiers in their uniform, in their colours: a shield with a one-handed weapon, a quiver with a bow, a captain's cloak", () => {
        for (const [people, arms] of Object.entries(ARMS)) {
            for (const weapon of new Set(arms)) {
                const { equipment } = soldierLook({ people, weapon, seed: 5 });
                const captain = soldierLook({ people, weapon, seed: 5, captain: true }).equipment;

                assert.ok(equipment.includes(`helm.${people}`), `${people} ${weapon}: a helm`);
                assert.ok(equipment.includes(people === "orc" ? "breastplate.orc" : `surcoat.${people}`), `${people}: their colours on their chest`);
                assert.ok([`vambraces.${people}`, `greaves.${people}`, `sabatons.${people}`, `belt.${people}`].every((id) => equipment.includes(id)), `${people}: armoured`);
                assert.equal(equipment.includes(`shield.${people}`), ["sword", "cleaver"].includes(weapon), `${people} ${weapon}: a shield or not`);
                assert.equal(equipment.includes("quiver"), weapon === "bow");
                assert.ok(!equipment.includes(`cloak.${people}`) && captain.includes(`cloak.${people}`), `${people}: a captain's cloak`);
            }
        }
    });
});

