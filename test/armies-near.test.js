// The armies in the world near a player (client/js/core/host.js ARMY_NEAR with core/war/war.js;
// docs/WAR.md *The armies near a player*): an army or reserve out in the field near a player met in
// its line of battle, marching its war path at its pace, the war told where it's got to and holding
// it meanwhile; none mustering at its seat; two peoples' met fighting it out there, each fallen one
// fewer in the war, which doesn't reckon their fight itself; as many of it stood up as the war has;
// let go once every player's far; kept with the world
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DOCTRINES, rolesOf } from "../client/js/core/formation.js";
import { ARMY_NEAR, HOST_PLAYER, Host } from "../client/js/core/host.js";
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

    it("has two peoples' armies met fight it out in the world, each fallen one fewer in the war, which doesn't reckon it itself; the one put down to the last gone", () => {
        const { host, war, middle: [mx, my] } = hosted();
        const orcs = afield(war, "orc", [mx + 230, my + 50], [mx + 230, my - 100], 8, "force-900");
        const humans = afield(war, "human", [mx + 230, my - 50], [mx + 230, my + 100], 24, "force-901");
        const events = [];

        for (let k = 0; k < 240 && war.force(orcs.id); k++) {
            events.push(...run(host, 1000, () => (war.relations["human|orc"] = { state: "hostile", since: 0 })));
        }

        assert.equal(war.force(orcs.id), null, "the orcs' army put down");
        assert.ok(events.some(({ type, event }) => type === "war" && event.type === "destroyed" && event.army === orcs.id));
        assert.ok(humans.size < 24, "the humans lost some");
        assert.equal(humans.size, alive(host, humans.id).length);
        assert.ok(!events.some(({ type, event }) => type === "war" && event.type === "battle" && [event.army, event.other].includes(orcs.id)), "not reckoned by the war");

        // (Let go, with the war's army gone)
        run(host, 500);
        assert.ok(!host.armies.has(orcs.id));
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
});
