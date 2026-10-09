// A seat's ruler and the captain of its guard in the world near a player (client/js/core/host.js
// LEADERS_NEAR with core/war/war.js; docs/WAR.md *The armies near a player*): its garrison put down
// there by a people at war with it, they make their last stand at its keep's door, named and
// tough, the town not theirs yet, and its garrison not made up meanwhile; put down too, it's taken,
// its people the takers' vassals; let go back in once every player's far; kept with the world
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host, LEADERS_NEAR } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { STAGES, TURN_MS } from "../client/js/core/war/war.js";
import { decode, encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

const atWar = (war) => (war.relations["human|orc"] = { state: "hostile", since: 0 });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        atWar(host.war);
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// A human player in the orcs' seat, at war with them in the age of conquest, its soldiers out
// about them; its garrison down to its last
function hosted() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });
    const war = host.war;

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
    atWar(war);
    war.stage = STAGES.length - 1;

    const seat = war.town(war.realm("orc").seat);

    put(host.battle.actor(HOST_PLAYER), [Math.floor(seat.at[0] + 30), Math.floor(seat.at[1] + 30)]);
    run(host, 2000);
    seat.garrison = 1;

    return { host, war, seat };
}

// Everyone of `ids` put down by the player, made too strong to lose
function putDown(host, ids) {
    const player = host.battle.actor(HOST_PLAYER);
    const events = [];

    for (const id of ids) {
        Object.assign(host.battle.actor(id) ?? {}, { hp: 1 });
    }

    for (let k = 0; k < 60 && ids.some((id) => host.battle.actor(id) && !host.battle.actor(id).dead); k++) {
        const left = ids.map((id) => host.battle.actor(id)).find((one) => one && !one.dead);

        Object.assign(player, { hp: 1e6, maxHp: 1e6 });
        put(player, [left.square[0] + 1, left.square[1]]);
        host.command(HOST_PLAYER, { type: "engage", target: left.id });
        events.push(...run(host, 1500));
    }

    return events;
}

// The last of a seat's garrison out about the player put down: its leaders out
function lastOfItsGarrison(host, seat) {
    const [last] = host.mustered.get(seat.id).ids.filter((id) => host.battle.actor(id) && !host.battle.actor(id).dead);

    return putDown(host, [last]);
}

describe("a seat's ruler and the captain of its guard in the world near a player (host.js LEADERS_NEAR, war.js)", () => {
    it("has them make their last stand at its keep's door once its garrison's put down there, named and tough; the town not taken yet", () => {
        const { host, war, seat } = hosted();
        const events = lastOfItsGarrison(host, seat);
        const told = events.find(({ type }) => type === "leaders");
        const leader = war.realm("orc").leader;

        assert.equal(seat.garrison, 0);
        assert.deepEqual([told?.town, told?.people, told?.by, told?.ruler, told?.title], [seat.id, "orc", "human", leader.name, leader.title]);

        const [ruler, captain] = told.ids.map((id) => host.battle.actor(id));

        assert.equal(ruler.name, `${leader.title} ${leader.name}`);
        assert.equal(captain.name, "Orcish captain of the guard");
        assert.ok([ruler, captain].every((one) => one.team === "orc" && one.maxHp === LEADERS_NEAR.hp && host.battle.hostile(one, host.battle.actor(HOST_PLAYER))));

        // (At its keep's door)
        const keep = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "keep" && place === seat.id);
        const [x, y] = keep.door.ends[0].arrive;

        assert.ok(Math.hypot(ruler.x - x, ruler.y - y) < 4 && Math.hypot(captain.x - x, captain.y - y) < 4, "at its keep's door");

        // (Not taken yet)
        assert.equal(seat.owner, "orc");
        assert.equal(war.realm("orc").overlord, null);
        assert.ok(!events.some(({ type }) => type === "taken"));
    });

    it("takes the seat once they're put down too, by a people at war with its holders: its people their vassals", () => {
        const { host, war, seat } = hosted();

        lastOfItsGarrison(host, seat);

        const { ids } = host.leaders.get(seat.id);
        const events = putDown(host, ids);

        assert.ok(events.some(({ type, town, by, people }) => type === "taken" && town === seat.id && by === "human" && people === "orc"));
        assert.equal(war.realm("orc").overlord, "human");
        assert.equal(seat.owner, "orc", "theirs to rule from, under the humans");
        assert.ok(!host.leaders.has(seat.id));
    });

    it("keeps its garrison from being made up while they're out; lets them go back in once every player's far, and its garrison's made up then", () => {
        const { host, war, seat } = hosted();

        lastOfItsGarrison(host, seat);

        // (A turn of the war: not made up)
        const turn = war.turn;

        war.clock = TURN_MS - 100;
        run(host, 500);
        assert.equal(war.turn, turn + 1);
        assert.equal(seat.garrison, 0);
        assert.ok(host.leaders.has(seat.id), "still out");

        // (Far off: back in, and made up at the next turn)
        const { ids } = host.leaders.get(seat.id);

        put(host.battle.actor(HOST_PLAYER), [Math.floor(seat.at[0] + LEADERS_NEAR.far + 200), Math.floor(seat.at[1])]);

        const parted = run(host, 1000).find(({ type, leaders }) => type === "parted" && leaders === seat.id);

        assert.ok(parted && !host.leaders.has(seat.id));
        assert.ok(ids.every((id) => !host.battle.actor(id)));

        war.clock = TURN_MS - 100;
        run(host, 500);
        assert.ok(seat.garrison > 0, "made up");
        assert.equal(seat.owner, "orc");
    });

    it("keeps them with the world, and carries on from them exactly", () => {
        const { host, seat } = hosted();

        lastOfItsGarrison(host, seat);
        assert.ok(host.leaders.has(seat.id));

        const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(host.snapshot())));

        assert.deepEqual([...again.leaders.keys()], [seat.id]);
        assert.equal(encode(again.snapshot()), encode(host.snapshot()));

        for (let t = 0; t < 3000; t += STEP_MS) {
            atWar(again.war);
            atWar(host.war);
            assert.deepEqual(again.advance(STEP_MS), host.advance(STEP_MS));
        }
    });
});
