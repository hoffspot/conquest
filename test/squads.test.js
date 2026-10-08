// The battle lines (docs/WAR.md *Battle lines*, M15): each forward garrison's squads, two patrols
// of four and an assault team of six, made up as they fall, the assault team out against the
// enemy's fortifications near (core/war/war.js SQUADS); a town covered by its holders'
// fortification not to be stormed till that's razed (FORT_COVER); and the squads out near a
// player, on their rounds and at the gate, out against an enemy fortification, their fallen told
// to the war and made up (core/host.js SQUADS_NEAR)
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { mayBuild } from "../client/js/core/war/forts.js";
import { tell } from "../client/js/core/war/news.js";
import { FORT_COVER, FORT_SIEGE, SQUAD_NAMES, SQUADS, War, WAR_VERSION } from "../client/js/core/war/war.js";
import { planWorld } from "../client/js/core/worldplan/plan.js";

const apart = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
const keyOf = (a, b) => [a, b].sort().join("|");

// Two peoples at war
function atWar(war, a, b) {
    war.relations[keyOf(a, b)] = { state: "hostile", since: 0 };
    war.known.push(keyOf(a, b));
}

// The first point round `from` (rings `inner` to `outer` metres out) that `test` holds for, or null
function pointNear(from, test, { inner = 0, outer = 400, step = 8 } = {}) {
    for (let r = inner; r <= outer; r += step) {
        for (let k = 0; k < 48; k++) {
            const angle = (k / 48) * Math.PI * 2;
            const at = [Math.round(from[0] + Math.cos(angle) * r), Math.round(from[1] + Math.sin(angle) * r)];

            if (test(at)) {
                return at;
            }
        }
    }

    return null;
}

// A fortification of `kind` built for `realm` near its capital (its stores filled to build it)
function built(war, realm, kind, { inner = 60 } = {}) {
    const capital = war.town(war.realm(realm).capital);
    const radius = war.plan.places.find(({ id }) => id === capital.id).radius;
    const at = pointNear(capital.at, (p) => mayBuild(war, realm, p), { inner: radius + inner, outer: radius + 900 });

    Object.assign(war.realm(realm).stores, { wood: 900, stone: 900, metal: 900 });

    return war.build(realm, { kind, at, about: capital.id });
}

describe("each forward garrison's squads, in the war (war.js SQUADS)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    it("builds a forward garrison with its two patrols of four and its assault team of six; a tower with none", () => {
        const war = new War(plan);
        const garrison = built(war, "human", "garrison");
        const tower = built(war, "human", "tower", { inner: 200 });

        assert.deepEqual(SQUAD_NAMES, ["patrol-0", "patrol-1", "assault"]);
        assert.deepEqual(garrison.squads, [SQUADS.patrol, SQUADS.patrol, SQUADS.assault]);
        assert.deepEqual([SQUADS.patrols, SQUADS.patrol, SQUADS.assault], [2, 4, 6]);
        assert.equal(tower.squads, undefined);
    });

    it("loses those fallen in the world, and makes them up one at a time as they fall, the emptiest squad first, for gold", () => {
        const war = new War(plan);
        const garrison = built(war, "human", "garrison");
        const realm = war.realm("human");

        assert.equal(war.squadLost(garrison.id, "patrol-1", 2), 2);
        assert.equal(war.squadLost(garrison.id, "assault", 3), 3);
        assert.equal(war.squadLost(garrison.id, "nonesuch"), 0);
        assert.deepEqual(garrison.squads, [4, 2, 3]);

        // (The emptiest by its share: the patrol, at half; then the assault team, at half too)
        realm.treasury = 1000;

        const made = [];

        for (let k = 0; k < SQUADS.every * 5; k++) {
            const before = [...garrison.squads];

            war.step();

            if (garrison.squads.some((count, j) => count !== before[j])) {
                made.push(garrison.squads.findIndex((count, j) => count !== before[j]));
            }
        }

        assert.deepEqual(garrison.squads, [4, 4, 6]);
        assert.deepEqual(made, [1, 2, 2, 1, 2]);

        // (None made up while its people can't pay: their treasury empty when the turn's paid)
        war.squadLost(garrison.id, "patrol-0", 1);

        for (let k = 0; k < SQUADS.every * 2; k++) {
            realm.treasury = -1e9;
            war.step();
        }

        assert.equal(garrison.squads[0], SQUADS.patrol - 1);
    });

    it("sends its assault team against the nearest of the enemy's fortifications within reach, once it's strong enough: wearing it down, losing some, razing it at nothing", () => {
        const war = new War(plan);

        atWar(war, "human", "orc");

        const garrison = built(war, "human", "garrison");
        const near = { id: "fort-orc", kind: "tower", realm: "orc", at: [garrison.at[0] + 200, garrison.at[1]], hp: 1200, about: null, toward: null, built: 0, by: null, struck: null };
        const far = { ...near, id: "fort-far", at: [garrison.at[0] + SQUADS.reach + 100, garrison.at[1]] };

        war.forts.push(near, far);
        // (Each people's stores keep their own up, and build no more; the garrison's team not made
        // up the while)
        Object.assign(war.realm("orc").stores, { wood: 20, stone: 20, metal: 0 });
        Object.assign(war.realm("human").stores, { wood: 20, stone: 0, metal: 10 });

        const step = () => {
            garrison.mustered = war.turn;
            war.step();
        };

        step();

        const events = war.advance(0);

        assert.equal(near.hp, 1200 - SQUADS.assault * SQUADS.hp);
        assert.equal(far.hp, 1200, "out of its reach");
        assert.equal(garrison.squads[2], SQUADS.assault - FORT_SIEGE.tower, "its loops took one");
        assert.match(tell(events.find(({ type }) => type === "assailed"), war), /^An assault team of the Humans has fallen on the Orcs' guard tower/);

        // (Not while a player's near it, nor under strength; nor mended, fallen on lately)
        war.watch([garrison.id]);
        step();
        assert.equal(near.hp, 1200 - SQUADS.assault * SQUADS.hp);
        war.watch([]);
        garrison.squads[2] = SQUADS.ready - 1;
        step();
        assert.equal(near.hp, 1200 - SQUADS.assault * SQUADS.hp);

        // (At nothing, razed by them)
        garrison.squads[2] = SQUADS.assault;
        near.hp = 50;
        step();
        assert.equal(war.fort(near.id), null);
        assert.ok(war.advance(0).some(({ type, fort, by }) => type === "razed" && fort === near.id && by === "human"));
    });

    it("mends a fortification only once it's not been fallen on for a few turns", () => {
        const war = new War(plan);
        const tower = built(war, "human", "tower");

        tower.hp = 600;
        war.strike(tower.id, 0, "orc");
        Object.assign(war.realm("human").stores, { wood: 900, stone: 900, metal: 900 });

        for (let k = 0; k < FORT_SIEGE.rest; k++) {
            war.step();
        }

        assert.equal(tower.hp, 600, "fallen on lately");
        war.step();
        assert.ok(tower.hp > 600, "mended");
    });

    it("keeps the squads in its snapshot, and makes a war's garrisons whole that it kept before them", () => {
        const war = new War(plan);
        const garrison = built(war, "human", "garrison");

        war.squadLost(garrison.id, "assault", 2);

        const again = War.restore(plan, structuredClone(war.snapshot()));

        assert.equal(war.snapshot().version, WAR_VERSION);
        assert.deepEqual(again.fort(garrison.id).squads, [4, 4, 4]);

        const older = structuredClone(war.snapshot());

        older.version = 3;
        delete older.forts[0].squads;
        delete older.forts[0].mustered;
        delete older.forts[0].struck;
        assert.deepEqual(War.restore(plan, older).fort(garrison.id).squads, [4, 4, 6]);
    });
});

describe("a town covered by its holders' fortification (war.js FORT_COVER)", () => {
    let plan;

    before(() => {
        plan = planWorld(3);
    });

    it("is covered by its holders' fortification within FORT_COVER of its edge, not by an enemy's nor one further off", () => {
        const war = new War(plan);
        const town = war.towns.find(({ owner, kind }) => owner === "human" && kind !== "capital");
        const radius = plan.places.find(({ id }) => id === town.id).radius;
        const fort = (realm, distance) => ({ id: `fort-${realm}-${distance}`, kind: "tower", realm, at: [town.at[0] + radius + distance, town.at[1]], hp: 1200, about: null, toward: null, built: 0, by: null, struck: null });

        assert.equal(war.coverOf(town), null);
        war.forts.push(fort("orc", 50), fort("human", FORT_COVER + 30));
        assert.equal(war.coverOf(town), null);
        war.forts.push(fort("human", FORT_COVER - 30));
        assert.equal(war.coverOf(town)?.id, `fort-human-${FORT_COVER - 30}`);
    });

    it("can't be fallen on while it's covered: an army against it falls on the fortification first, and on it once that's razed", () => {
        const war = new War(plan);
        const town = war.towns.find(({ owner, kind }) => owner === "human" && kind === "village") ?? war.towns.find(({ owner, kind }) => owner === "human" && kind !== "capital");
        const radius = plan.places.find(({ id }) => id === town.id).radius;
        const cover = { id: "fort-cover", kind: "tower", realm: "human", at: [town.at[0] + radius + FORT_COVER - 20, town.at[1]], hp: 1200, about: town.id, toward: null, built: 0, by: null, struck: null };
        const home = war.towns.find(({ owner }) => owner === "orc").id;
        const at = [town.at[0] - radius - 30, town.at[1]];

        atWar(war, "human", "orc");
        // (In the War, villages and towns to be taken)
        war.stage = 2;
        war.forts.push(cover);
        town.garrison = 2;

        // (An orc army at its camp before the town, ordered against it)
        war.camps.push({ id: "camp-test", realm: "orc", at, guard: 6, built: 0, done: 0, toward: town.id, used: 1e6, skirmished: 1e6 });
        war.forces.push({ id: "force-test", realm: "orc", kind: "army", size: 60, at: [...at], path: [[...at]], leg: 0, target: null, home, mission: "camp", about: [...at], camp: "camp-test", orders: null, went: 60, arrived: null, since: 0 });
        assert.equal(war.order("orc", { attack: town.id }), true);

        const events = [];

        for (let k = 0; k < 40 && town.owner === "human"; k++) {
            war.step();
            events.push(...war.advance(0));
        }

        assert.ok(apart(at, cover.at) > FORT_SIEGE.reach, "further off than a siege reaches");
        assert.ok(events.some(({ type, fort, by }) => type === "razed" && fort === cover.id && by === "orc"), "fallen on, and razed");

        const assaulted = events.findIndex(({ type, town: id }) => type === "assault" && id === town.id);
        const razed = events.findIndex(({ type, fort }) => type === "razed" && fort === cover.id);

        assert.ok(assaulted > razed, "not fallen on while it was covered");
        assert.equal(town.owner, "orc", "(uncovered: taken)");
    });
});

describe("a forward garrison's squads near a player (host.js SQUADS_NEAR)", () => {
    const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
    let STEP_MS;
    let Host;
    let HOST_PLAYER;
    let SQUADS_NEAR;
    let FORT_NEAR;
    let buildWorld;

    before(async () => {
        ({ STEP_MS } = await import("../client/js/core/battle.js"));
        ({ Host, HOST_PLAYER, SQUADS_NEAR, FORT_NEAR } = await import("../client/js/core/host.js"));
        ({ buildWorld } = await import("../client/js/core/overworld.js"));
    });

    const run = (host, ms) => {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        return events;
    };

    // A world with a human forward garrison built near its player, its squads out
    const nearGarrison = () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const actor = host.battle.actor(HOST_PLAYER);
        const war = host.war;
        const at = pointNear([actor.x, actor.y], (p) => mayBuild(war, "human", p), { inner: 40, step: 6 });

        Object.assign(war.realm("human").stores, { wood: 900, stone: 900, metal: 900 });

        const fort = war.build("human", { kind: "garrison", at });
        const events = run(host, 1500);

        const out = host.squadsOut.get(fort.id);
        const standing = (name) => out.ids[name].filter((id) => host.battle.actor(id) && !host.battle.actor(id).dead);

        return { host, war, actor, fort, out, standing, events };
    };

    it("brings out its patrols on their rounds within 300 m of it, and its assault team at its gate, of its people, to be drawn", () => {
        const { host, fort, out, standing, events } = nearGarrison();
        const far = (id) => apart([host.battle.actor(id).x, host.battle.actor(id).y], fort.at);

        assert.deepEqual(SQUAD_NAMES.map((name) => standing(name).length), [4, 4, 6]);
        assert.ok(events.some(({ type, fort: id, people, ids }) => type === "squadsOut" && id === fort.id && people === "human" && ids.length === 14), "told, to be drawn");
        assert.ok(SQUADS_NEAR.rounds.every((radius) => radius <= SQUADS.round));
        assert.equal(out.rounds.length, SQUADS.patrols);
        assert.ok(out.rounds.every((round, k) => round.length >= SQUADS_NEAR.stops - 2 && round.every((stop) => Math.abs(apart(stop, fort.at) - SQUADS_NEAR.rounds[k]) < 20)));

        for (const id of [...standing("patrol-0"), ...standing("patrol-1")]) {
            const actor = host.battle.actor(id);

            assert.equal(actor.team, "human");
            assert.match(actor.name, /patrol$/);
            assert.ok(actor.patrol.length > 2, "on its round");
        }

        assert.ok(standing("assault").every((id) => far(id) < SQUADS_NEAR.gate + 6 && /vanguard$/.test(host.battle.actor(id).name)), "at its gate");

        // (On their rounds a while: out there, within the 300 m)
        run(host, 15000);
        assert.ok(standing("patrol-1").every((id) => far(id) > SQUADS_NEAR.rounds[0] && far(id) <= SQUADS.round));
    });

    it("tells the war of one fallen, and as the war makes him up, one comes out of its gate", () => {
        const { host, war, fort, out, standing } = nearGarrison();
        const victim = standing("patrol-0")[0];
        const at = host.battle.actor(victim);

        atWar(war, "human", "orc");
        at.hp = 1;
        host.battle.add({ id: "raider", kind: "soldier", name: "raider", weapon: "cleaver", team: "orc", square: [at.square[0] + 1, at.square[1]], ai: null });
        Object.assign(host.battle.actor("raider"), { hp: 50000, maxHp: 50000 });
        host.command("raider", { type: "engage", target: victim });

        const events = run(host, 6000);

        assert.ok(events.some(({ type, id }) => type === "death" && id === victim));
        assert.deepEqual(fort.squads, [3, 4, 6]);

        host.battle.remove("raider");
        war.realm("human").treasury = 500;
        fort.mustered = war.turn - SQUADS.every;
        war.step();

        const made = run(host, 1000);

        assert.deepEqual(fort.squads, [4, 4, 6]);
        assert.ok(made.some(({ type, ids }) => type === "squadsOut" && ids.includes(`${fort.id}/patrol-0-${SQUADS.patrol}`)), "told, to be drawn");

        const fresh = standing("patrol-0").find((id) => id === `${fort.id}/patrol-0-${SQUADS.patrol}`);

        assert.ok(fresh, "one made up");
        assert.ok(apart(host.battle.actor(fresh).square, out.gate) < 6, "out of its gate");
    });

    it("sends its assault team against an enemy's fortification stood up within reach, and strikes it", () => {
        const { host, war, out, standing } = nearGarrison();

        atWar(war, "human", "orc");

        const target = { id: "fort-orc", kind: "tower", realm: "orc", at: [out.gate[0] + 30, out.gate[1]], hp: 1200, about: null, toward: null, built: war.turn, by: null, struck: null };

        war.forts.push(target);
        run(host, 1000);
        assert.ok(host.fortsOut.has(target.id));
        assert.equal(out.target, target.id);

        run(host, 40000);
        assert.ok(standing("assault").some((id) => apart(host.battle.actor(id).square, target.at) < 6), "at its walls");
        assert.ok((war.fort(target.id)?.hp ?? 0) < 1200, "struck");
    });

    it("lets its squads go out of sight once it's let go, and keeps them in its snapshot while they're out", () => {
        const { host, fort, actor } = nearGarrison();
        const again = Host.restore(buildWorld({ seed: 2 }), structuredClone(host.snapshot()));

        assert.deepEqual([...again.squadsOut], [...host.squadsOut]);

        const away = Math.sign(actor.x - fort.at[0]) || 1;

        Object.assign(actor, { square: [actor.square[0] + away * (FORT_NEAR.far + 300), actor.square[1]], x: actor.x + away * (FORT_NEAR.far + 300) });
        run(host, 2000);
        assert.ok(!host.squadsOut.has(fort.id));
        assert.equal(host.battle.actors.filter(({ id }) => id.startsWith(`${fort.id}/`)).length, 0);
    });
});
