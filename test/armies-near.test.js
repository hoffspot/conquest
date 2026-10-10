// The armies in the world near a player (client/js/core/host.js ARMY_NEAR with core/war/war.js;
// docs/WAR.md *The armies near a player*): an army or reserve out in the field near a player met in
// its line of battle, marching its war path at its pace, the war told where it's got to and holding
// it meanwhile; none mustering at its seat; two peoples' met fighting it out there, each fallen one
// fewer in the war, which doesn't reckon their fight itself, one broken there routed (the war told);
// as many of it stood up as the war has; let go once every player's far; kept with the world.
// Reinforcements met too, making for their army's line and taking their places in it; fallen on
// there, fought out there
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DOCTRINES, rolesOf } from "../client/js/core/formation.js";
import { ARMY_NEAR, HOST_PLAYER, Host } from "../client/js/core/host.js";
import { ARMY } from "../client/js/core/war/armies.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { STAGES, TURN_MS } from "../client/js/core/war/war.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms, keep = () => {}) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        keep();
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

// A world with the humans and the orcs at war, as far on as it goes, the player out in the field
// east of their town
function hosted() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
    host.war.relations["human|orc"] = { state: "hostile", since: 0 };
    host.war.stage = STAGES.length - 1;

    const [mx, my] = host.world.stamp.middle;

    put(host.battle.actor(HOST_PLAYER), [Math.floor(mx + 170), Math.floor(my)]);

    return { host, war: host.war, middle: [mx, my] };
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A people's army out in the field at `at`, going to `to` (to build a camp there)
function afield(war, realm, at, to, size, id) {
    const army = { id, realm, kind: "army", size, at: [...at], path: [[...at], [...to]], leg: 0, target: null, home: war.realm(realm).seat, mission: "camp", about: [...to], camp: null, orders: null, went: size, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 };

    war.forces.push(army);

    return army;
}

// Reinforcements of `realm`'s at `at`, on their way to `army`
function column(war, realm, at, army, size, id) {
    const force = { id, realm, kind: "reinforcement", size, at: [...at], path: [[...at], [...army.at]], leg: 0, target: army.id, home: war.realm(realm).seat, mission: null, about: null, since: 0 };

    war.forces.push(force);

    return force;
}

const alive = (host, id) => (host.armies.get(id)?.ids ?? []).filter((each) => host.battle.actor(each) && !host.battle.actor(each).dead);

describe("the armies in the world near a player (host.js ARMY_NEAR, war.js)", () => {
    it("meets an army in the field near a player in its line of battle, marching where the war has it going at its pace, the war told and holding it; not one mustering at its seat", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const army = afield(war, "orc", [mx + 230, my + 40], [mx + 230, my - 160], 40, "force-900");
        // (The humans' own army, mustering at home: within their walls, not met)
        const home = afield(war, "human", [mx + 200, my + 10], [mx + 200, my + 10], 20, "force-901");

        home.mission = "muster";

        const events = run(host, 1000);
        const met = host.armies.get(army.id);
        const told = events.find(({ type, force }) => type === "army" && force === army.id);

        assert.ok(met, "met");
        assert.ok(!host.armies.has(home.id), "the one mustering at its seat isn't");
        assert.deepEqual([told.people, told.kind, told.met, told.ids.length], ["orc", "army", true, 40]);

        // (In its people's mix, every one of the orcs, in its line)
        const soldiers = met.ids.map((id) => host.battle.actor(id));
        const roles = (list) => Object.entries(list.reduce((count, role) => ({ ...count, [role]: (count[role] ?? 0) + 1 }), {})).sort();

        assert.ok(soldiers.every((actor) => actor.team === "orc" && actor.formation?.id === met.formation));
        assert.deepEqual(roles(soldiers.map((actor) => actor.formation.role)), roles(rolesOf(40, DOCTRINES.orc)));

        // (Marching for where it's going at its pace, the war told where it's got to)
        const formation = host.battle.formations[met.formation];
        const from = [...formation.anchor];

        run(host, 10000);

        const went = formation.anchor[1] - from[1];

        assert.ok(went < -10 && went > -ARMY_NEAR.pace * 10 - 1, `${went} m`);
        // (As of the host's last look at the war: a moment ago)
        assert.ok(Math.hypot(army.at[0] - formation.anchor[0], army.at[1] - formation.anchor[1]) < 2, "the war where it's got to");

        // (A turn of the war: it doesn't move it on itself)
        const before = [...army.at];

        war.advance(TURN_MS);
        assert.deepEqual(army.at, before);
    });

    it("has two peoples' armies met fight it out in the world, each fallen one fewer in the war, which doesn't reckon it itself; the one broken (ARMY.rout of it left, and outnumbered) routed, the war told, running", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const orcs = afield(war, "orc", [mx + 230, my + 50], [mx + 230, my - 100], 8, "force-900");
        const humans = afield(war, "human", [mx + 230, my - 50], [mx + 230, my + 100], 24, "force-901");
        const events = [];
        const routed = () => events.find(({ type, event }) => type === "war" && event.type === "battle" && event.routed);

        for (let k = 0; k < 240 && !routed(); k++) {
            events.push(...run(host, 1000, () => (war.relations["human|orc"] = { state: "hostile", since: 0 })));
        }

        const { event } = routed() ?? {};

        assert.ok(event, "routed");
        assert.deepEqual([event.realm, event.against, event.other, event.kind, event.won, event.played], ["human", "orc", orcs.id, "army", true, true]);
        assert.ok(orcs.size > 0 && orcs.size <= ARMY.rout * 8, "down to ARMY.rout of what it went in with");
        assert.equal(event.killed, 8 - orcs.size);
        assert.equal(orcs.size, alive(host, orcs.id).length);
        assert.ok(humans.size < 24, "the humans lost some");
        assert.equal(humans.size, alive(host, humans.id).length);
        assert.ok(!events.some(({ type, event: each }) => type === "war" && each.type === "battle" && !each.routed && [each.army, each.other].includes(orcs.id)), "not reckoned by the war itself");

        // Beaten, running: its line broken, at a run
        run(host, 500);

        const met = host.armies.get(orcs.id);

        assert.ok(war.fleeing(orcs.id));
        assert.ok(!met || host.battle.formations[met.formation].broken, "its line broken");
    });

    it("stands up as many of it as the war has: those it's lost elsewhere let go from the back, those joined it stood up behind its line", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const army = afield(war, "orc", [mx + 230, my + 40], [mx + 230, my - 160], 30, "force-900");

        run(host, 500);
        assert.equal(alive(host, army.id).length, 30);

        // (Five deserted)
        army.size = 25;

        const parted = run(host, 1000).find(({ type, army: id }) => type === "parted" && id === army.id);

        assert.equal(parted?.ids.length, 5);
        assert.equal(alive(host, army.id).length, 25);

        // (Eight joined it)
        army.size = 33;

        const joined = run(host, 1000).find(({ type, force, met }) => type === "army" && force === army.id && !met);

        assert.equal(joined?.ids.length, 8);
        assert.equal(alive(host, army.id).length, 33);
        assert.ok(joined.ids.every((id) => host.battle.actor(id).formation.id === host.armies.get(army.id).formation));
    });

    it("lets it go once every player's far, and keeps it with the world, carrying on exactly", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const army = afield(war, "orc", [mx + 230, my + 40], [mx + 230, my - 160], 20, "force-900");

        run(host, 2000);

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.armies.keys()], [army.id]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 3000; t += STEP_MS) {
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }

        // (Far off: let go)
        const { ids } = host.armies.get(army.id);

        put(host.battle.actor(HOST_PLAYER), [Math.floor(mx - ARMY_NEAR.far), Math.floor(my)]);

        const parted = run(host, 500).find(({ type, army: id }) => type === "parted" && id === army.id);

        assert.ok(parted);
        assert.ok(!host.armies.has(army.id));
        assert.ok(ids.every((id) => !host.battle.actor(id)));
        assert.equal(war.force(army.id).size, 20, "still in the war");
    });

    it("meets reinforcements near a player in their line, making for their army's line; there, each of them takes a place at the back of it, one of it in the war too", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const army = afield(war, "human", [mx + 230, my - 60], [mx + 230, my - 60], 12, "force-900");
        const joining = column(war, "human", [mx + 120, my - 100], army, 5, "force-901");

        Object.assign(army, { mission: "regroup", about: null });

        const events = run(host, 1000);
        const told = events.find(({ type, force }) => type === "army" && force === joining.id);

        assert.deepEqual([told?.kind, told?.met, told?.ids.length], ["reinforcement", true, 5]);
        assert.ok(host.armies.has(army.id), "their army met");

        // (On their way, and there)
        const later = [];

        for (let k = 0; k < 120 && war.force(joining.id); k++) {
            later.push(...run(host, 1000));
        }

        const met = host.armies.get(army.id);

        assert.ok(!war.force(joining.id) && !host.armies.has(joining.id), "joined it");
        assert.equal(army.size, 17);
        assert.ok(told.ids.every((id) => met.ids.includes(id) && host.battle.actor(id).formation.id === met.formation && host.soldiers.get(id).force === army.id), "each of them one of its line");
        assert.equal(alive(host, army.id).length, 17);
        assert.ok(!later.some(({ type, force, met: first }) => type === "army" && force === army.id && !first), "none stood up anew for them");
    });

    it("has an enemy army met fall on reinforcements met, fought out in the world, the war not reckoning it itself; put down to the last, they're gone", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const theirs = afield(war, "human", [mx - 600, my], [mx - 600, my], 12, "force-900");
        const joining = column(war, "human", [mx + 230, my + 40], theirs, 6, "force-901");
        const orcs = afield(war, "orc", [mx + 230, my - 40], [mx + 230, my - 40], 20, "force-902");

        Object.assign(theirs, { mission: "regroup", about: null });
        Object.assign(orcs, { mission: "regroup", about: null });

        const events = [];

        for (let k = 0; k < 180 && war.force(joining.id); k++) {
            events.push(...run(host, 1000, () => (war.relations["human|orc"] = { state: "hostile", since: 0 })));
        }

        assert.equal(war.force(joining.id), null, "put down");
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "intercepted" && event.by === "orc" && event.lost === 0), "by the orcs, in the world");
        assert.equal(orcs.size, alive(host, orcs.id).length, "the orcs' every fall counted");

        // (Let go, with them gone in the war)
        run(host, 500);
        assert.ok(!host.armies.has(joining.id));
    });
});
