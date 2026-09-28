// The war come to life near a player (client/js/core/host.js with core/war/muster.js, and the
// battle's guards, patrols and grudges, core/battle.js): each town's soldiers out while a player's
// near it, of whoever holds it; who fights whom by how their peoples stand; picking a fight with
// a neutral people's guard; soldiers who fall are its garrison the fewer
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EQUIPMENT } from "../client/js/characters/equipment.js";
import { ARMS, soldierLook } from "../client/js/characters/soldiers.js";
import { Battle, FOE_MS, STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, LEASH, MUSTER, RELEVANCE } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { POSTED } from "../client/js/core/war/muster.js";
import { HOLDINGS } from "../client/js/core/war/war.js";
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
const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null, target: null });

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
            assert.ok(!host.battle.hostile(soldier, host.battle.actor("orc")), "(the wild's no concern of theirs)");
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
        assert.ok(soldierLook({ people: "orc", weapon: "cleaver", sex: "f", seed: 4 }).equipment.includes("tunic"));
        assert.equal(soldierLook({ people: "orc", weapon: "cleaver", seed: 4 }).walk, "orc");
    });
});

