// The trails out of the wild's camps and lairs (client/js/core/tracks.js; docs/WILDS.md *Tracking*):
// laid out from the world plan, out from each home round the water and the settlements, each with
// its signs, the furthest first; found near a point and by their ids; what wore each, as a reader
// from a home finds it; the host reading a sign beside the player, telling which way the trail
// runs and adding to their bestiary, and their third of a home's signs tracking it home; and the
// signs read and homes tracked kept with what they've found of the world
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { RESEARCH } from "../client/js/core/bestiary.js";
import { campFolk, LAIRS } from "../client/js/core/creatures.js";
import { Explored } from "../client/js/core/explored.js";
import { HOST_PLAYER, Host, SNAPSHOT_STEPS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { HOMES, homeWords, signOf, signsNear, TRAILS, trailCreature, trailsNear, trailsOf } from "../client/js/core/tracks.js";
import { campTier, landAt, planWorld, SETTLEMENTS, WATER } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const WAYS = new Set(["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]);

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null, spawn: [x, y] });

// The signs read, as told (not when)
const told = (events) => events.filter(({ type }) => type === "sign").map(({ time: _time, ...event }) => event);

// The player out in seed 2's wilds, 80 m west of their town's edge, by day
function outside() {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();
    Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

    const me = host.battle.actor(HOST_PLAYER);
    const [middle, radius] = [world.stamp.middle, SETTLEMENT_KINDS[world.start.kind].radius];

    put(me, [Math.floor(middle[0] - radius - 80), Math.floor(middle[1] - 20)]);
    Object.assign(me, { hp: 5000, maxHp: 5000 });
    run(host, 600);

    return { host, me, world };
}

describe("the trails out of the wild's camps and lairs (core/tracks.js)", () => {
    const plan = planWorld(2);
    const trails = trailsOf(plan);

    it("wears trails out of every camp and perilous site, round the water and the settlements, each with its signs, the furthest first", () => {
        assert.equal(trailsOf(plan), trails, "laid out once for a plan");

        const homes = new Map();

        for (const trail of trails) {
            homes.set(trail.home.id, [...(homes.get(trail.home.id) ?? []), trail]);

            const [hx, hy] = trail.home.at;
            const [sx, sy] = trail.points[0];

            assert.ok(Math.abs(Math.hypot(sx - hx, sy - hy) - TRAILS.from) < 1e-6, `${trail.id} starts a little way out of its home`);
            assert.ok(trail.points.length * TRAILS.step >= TRAILS.length[0] / 2, `${trail.id} runs far enough to follow`);
            assert.ok(HOMES[trail.home.what], `${trail.id}: ${trail.home.what} has words`);

            for (const [x, y] of trail.points) {
                assert.equal(landAt(plan, x, y).water, WATER.none, `${trail.id} keeps out of the water`);
                assert.ok(plan.places.every((place) => Math.hypot(x - place.at[0], y - place.at[1]) > (SETTLEMENTS[place.kind]?.radius ?? 40) + TRAILS.clear), `${trail.id} keeps clear of the settlements`);
            }

            assert.deepEqual(trail.signs.map(({ index }) => index), [0, 1, 2]);
            assert.deepEqual(trail.signs.map(({ id }) => id), [0, 1, 2].map((k) => `${trail.id}:${k}`));
            assert.ok(trail.signs.every(({ way }) => WAYS.has(way)), `${trail.id}'s signs each tell the way`);

            const out = trail.signs.map(({ at: [x, y] }) => Math.hypot(x - hx, y - hy));

            assert.ok(out[0] > out[2], `${trail.id}: its first sign's the furthest out`);
        }

        // (Every camp and perilous site has some, as many as its kind wears, nearly all of them)
        const lairs = plan.sites.filter((site) => LAIRS[site.kind] || site.theme === "hell");

        assert.ok(homes.size >= 0.9 * (plan.camps.length + lairs.length), `${homes.size} homes of ${plan.camps.length + lairs.length}`);
        assert.ok([...homes.values()].every((each) => each.length <= (each[0].home.kind === "camp" ? TRAILS.camp : TRAILS.lair)));
        assert.ok(trails.some(({ home }) => home.kind === "lair") && trails.some(({ home }) => home.kind === "rite"));
        assert.equal(homeWords({ what: "dragon's lair" }), "the drake's lair");
    });

    it("finds the signs near a point, the nearest first, each by its id, and the trails passing near", () => {
        const { sign, id } = { sign: trails[0].signs[1], id: trails[0].id };
        const near = signsNear(plan, sign.at, 50);

        assert.equal(near[0].sign, sign);
        assert.equal(near[0].trail.id, id);
        assert.ok(near.every(({ sign: each }) => Math.hypot(each.at[0] - sign.at[0], each.at[1] - sign.at[1]) <= 50));
        assert.deepEqual(signsNear(plan, [sign.at[0] + 1000, sign.at[1] + 1000], 5), []);
        assert.equal(signOf(plan, sign.id).sign, sign);
        assert.equal(signOf(plan, "camp-0/9:9"), null);
        assert.equal(signOf(plan, 12), null);
        assert.ok(trailsNear(plan, sign.at, 10).includes(trails[0]));
    });

    it("tells what wore each: a camp's folk as strong as it is from the reader's home, a lair's master on its first, its guards on the rest", () => {
        for (const trail of trails.filter(({ home }) => home.kind === "camp").slice(0, 10)) {
            const camp = plan.camps.find(({ id }) => id === trail.home.id);

            assert.equal(trailCreature(plan, trail, camp.at), campFolk(camp.faction, 1), "at its own door, the tamest");
            assert.equal(trailCreature(plan, trail, [0, 0]), campFolk(camp.faction, campTier(camp, [0, 0])));
        }

        const lair = trails.filter(({ home }) => home.kind === "lair" && home.what === "werewolf's den");

        assert.ok(lair.length);

        for (const trail of lair) {
            const { master, guards } = LAIRS["werewolf's den"];

            assert.equal(trailCreature(plan, trail, [0, 0]), trail.k === 0 ? master[0] : guards[(trail.k - 1) % guards.length][0]);
        }
    });

    it("reads a sign beside the player: which way it runs home told, and what made it the better known; the third of a home's tracking it", () => {
        const { host, me } = outside();
        const player = host.players.get(HOST_PLAYER);
        // (A trail of the home nearest them)
        const ours = [...trails].sort((a, b) => Math.hypot(a.home.at[0] - me.x, a.home.at[1] - me.y) - Math.hypot(b.home.at[0] - me.x, b.home.at[1] - me.y))[0];
        const creature = host.trailCreatureOf(HOST_PLAYER, ours);
        const before = player.progress.bestiary.entry(creature).points;
        const read = (sign) => {
            put(me, [Math.floor(sign.at[0]), Math.floor(sign.at[1])]);

            const result = host.command(HOST_PLAYER, { type: "read", sign: sign.id });

            return { result, told: told(run(host, STEP_MS)) };
        };

        // (None that isn't, and none too far)
        assert.deepEqual(host.command(HOST_PLAYER, { type: "read", sign: "nowhere:0" }), { ok: false, reason: "sign" });
        put(me, [Math.floor(ours.signs[0].at[0]) + 20, Math.floor(ours.signs[0].at[1])]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "read", sign: ours.signs[0].id }), { ok: false, reason: "far" });

        const first = read(ours.signs[0]);

        assert.deepEqual(first.result, { ok: true });
        assert.deepEqual(first.told, [{ type: "sign", id: HOST_PLAYER, sign: ours.signs[0].id, creature, home: ours.home.id, way: ours.signs[0].way, read: 1, again: false, tracked: false }]);
        assert.equal(player.progress.bestiary.entry(creature).signs, 1);
        assert.equal(player.progress.bestiary.entry(creature).points, before + RESEARCH.sign);
        assert.ok(player.explored.signs.has(ours.signs[0].id));

        // (Read again: told again, no more learnt)
        assert.deepEqual(read(ours.signs[0]).told.map(({ again, read: count }) => ({ again, count })), [{ again: true, count: 1 }]);
        assert.equal(player.progress.bestiary.entry(creature).signs, 1);

        // (The second, and the third: its home tracked, once)
        assert.equal(read(ours.signs[1]).told[0].tracked, false);
        assert.deepEqual(read(ours.signs[2]).told.map(({ read: count, tracked }) => ({ count, tracked })), [{ count: 3, tracked: true }]);
        assert.ok(player.explored.tracked.has(ours.home.id));
        assert.equal(player.progress.bestiary.entry(creature).signs, 3);
        assert.equal(read(ours.signs[2]).told[0].tracked, false);
    });

    it("tracks a home for the whole party: the third sign read by one of it, the others have it tracked too, found by them", () => {
        const { host, me } = outside();

        host.join({ id: "guest", hero: { ...HERO, name: "Bea" } });
        assert.equal(host.command(HOST_PLAYER, { type: "party", do: "invite", who: "guest" }).ok, true);
        assert.equal(host.command("guest", { type: "party", do: "accept" }).ok, true);
        run(host, STEP_MS);

        const bea = host.players.get("guest");
        const ours = [...trails].sort((a, b) => Math.hypot(a.home.at[0] - me.x, a.home.at[1] - me.y) - Math.hypot(b.home.at[0] - me.x, b.home.at[1] - me.y))[0];
        let events = [];

        assert.ok(!bea.explored.tracked.has(ours.home.id));

        for (const sign of ours.signs.slice(0, 3)) {
            put(me, [Math.floor(sign.at[0]), Math.floor(sign.at[1])]);
            assert.equal(host.command(HOST_PLAYER, { type: "read", sign: sign.id }).ok, true);
            events = run(host, STEP_MS);
        }

        assert.ok(bea.explored.tracked.has(ours.home.id));
        assert.equal(bea.explored.finderOf(ours.home.id), HERO.name);
        assert.ok(events.some(({ type, id, by, places }) => type === "explored" && id === "guest" && by === HOST_PLAYER && places?.includes(ours.home.id)));
        assert.equal(bea.explored.signs.size, 0, "(the signs theirs who read them)");
    });

    it("keeps the signs read and the homes tracked with what's been found, and carries a world from before them on", () => {
        const explored = new Explored();

        assert.equal(explored.read("camp-1/0:0"), true);
        assert.equal(explored.read("camp-1/0:0"), false);
        assert.equal(explored.track("camp-1"), true);
        assert.equal(explored.track("camp-1"), false);
        assert.equal(explored.read(7), false);
        assert.equal(explored.version, 2);

        const back = new Explored(JSON.parse(JSON.stringify(explored)));

        assert.deepEqual([...back.signs], ["camp-1/0:0"]);
        assert.deepEqual([...back.tracked], ["camp-1"]);
        assert.deepEqual([...new Explored({ signs: ["a", 3], tracked: "b" }).signs], ["a"]);
        assert.equal(new Explored({ tracked: "b" }).tracked.size, 0);

        // (A world kept before there were trails: every player's none read, none tracked)
        const { host, world } = outside();
        const snapshot = host.snapshot();
        const old = { ...snapshot, version: 33, players: snapshot.players.map(({ explored: { signs: _signs, tracked: _tracked, ...explored }, ...player }) => ({ ...player, explored })) };
        const stepped = SNAPSHOT_STEPS[33](structuredClone(old));

        assert.equal(stepped.version, 34);
        assert.ok(stepped.players.every(({ explored }) => explored.signs.length === 0 && explored.tracked.length === 0 && explored.visited === old.players[0].explored.visited));
        assert.equal(Host.restore(world, stepped).players.get(HOST_PLAYER).explored.signs.size, 0);
    });
});
