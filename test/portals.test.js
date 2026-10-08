// The adventurers' guilds' portals (client/js/core/portals.js, core/host.js #travel, core/explored.js):
// each branch's open to step through to once the player's been into it (or, for a character kept
// from before there were portals, if they'd uncovered its country); a step through costs 5 gold
// and 7 more a kilometre at Copper, a fifth less each rank up, Mithril free; and the player comes
// out of the other branch's portal, their followers with them
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { Explored } from "../client/js/core/explored.js";
import { HOST_PLAYER, Host, REFUSALS } from "../client/js/core/host.js";
import { FACING } from "../client/js/core/interiors.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { atPortal, beforePortal, branchesFound, branchesFrom, fareOf, fareOff, outOf, PORTAL, portalOn } from "../client/js/core/portals.js";
import { GUILD_RANKS } from "../client/js/core/standing.js";
import { CHUNK, guilds } from "../client/js/core/worldplan/plan.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const MITHRIL = GUILD_RANKS.length - 1;

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// The player in through a building's door from just outside it (their followers after them):
// what happened
function goIn(host, building) {
    put(host.battle.actor(HOST_PLAYER), "town", building.door.ends[0].arrive);

    for (const id of host.followers.keys()) {
        put(host.battle.actor(id), "town", building.door.ends[0].arrive.map((v, k) => v + (k ? 1 : 0)));
    }

    host.command(HOST_PLAYER, { type: "enter", link: building.door.id });

    return run(host, 4000);
}
const apart = (a, b) => Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);

// A world with its player in the home town's guild (a member of it, with gold), at its portal; and
// the nearest other branch, open to them
function atThePortal({ followers = [], gold = 200, member = true } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO, followers });
    host.populate();

    const player = host.players.get(HOST_PLAYER);
    const home = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");

    goIn(host, home);

    const hall = host.world.maps[home.maps[0]];
    const portal = portalOn(hall);

    put(host.battle.actor(HOST_PLAYER), hall.id, beforePortal(portal));
    run(host, 500);

    const start = host.world.start;
    const other = guilds(host.world.plan)
        .filter(({ id }) => id !== start.id)
        .sort((a, b) => apart(a, start) - apart(b, start))[0];

    player.explored.openPortal(other.id);
    player.progress.gold = gold;

    if (member) {
        player.standing.register();
    }

    return { host, player, home, hall, portal, start, other };
}

describe("the portals' fares (portals.js)", () => {
    it("asks 5 gold and 7 more a kilometre at Copper, a fifth less each rank up, Mithril nothing", () => {
        assert.deepEqual(PORTAL, { base: 5, perKm: 7 });
        assert.equal(fareOf(0, 0), 5);
        assert.equal(fareOf(1000, 0), 12);
        assert.equal(fareOf(3500, 0), 30);
        assert.equal(fareOf(9000, 0), 68);
        assert.equal(fareOf(3500, null), 30);

        // (A fifth off at each rank: Iron 20%, Bronze 40%, Silver 60%, Gold 80%, Mithril free)
        assert.deepEqual(GUILD_RANKS.map(({ fare }) => fare), [1, 0.8, 0.6, 0.4, 0.2, 0]);
        assert.deepEqual(GUILD_RANKS.map((rank, k) => fareOf(5000, k)), [40, 32, 24, 16, 8, 0]);
        assert.deepEqual(GUILD_RANKS.map((rank, k) => Math.round(fareOff(k) * 100)), [0, 20, 40, 60, 80, 100]);

        // (Never less than a coin, but for Mithril; farther, dearer)
        assert.equal(fareOf(0, MITHRIL - 1), 1);
        assert.equal(fareOf(20000, MITHRIL), 0);

        for (let metres = 0; metres < 9000; metres += 250) {
            assert.ok(fareOf(metres + 250, 0) >= fareOf(metres, 0));
        }

        // (Every rank says what it takes off, in the journal and at the counter)
        assert.ok(GUILD_RANKS.slice(1).every(({ opens }) => /portals/.test(opens)));
    });

    it("lists the branches open from one (with it, marked here): each's name, where it is, how far and its fare, nearest first", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });
        const plan = host.world.plan;
        const start = host.world.start;
        const [near, far] = guilds(plan)
            .filter(({ id }) => id !== start.id)
            .sort((a, b) => apart(a, start) - apart(b, start))
            .filter((place, k, all) => k === 0 || k === all.length - 1);
        const listed = branchesFrom(plan, new Set([far.id, near.id]), start.id, 2);

        assert.deepEqual(listed.map(({ id }) => id), [start.id, near.id, far.id]);
        assert.deepEqual(listed[0], { id: start.id, name: start.name, x: start.at[0], z: start.at[1], metres: 0, fare: fareOf(0, 2), here: true });
        assert.equal(listed[1].name, near.name);
        assert.ok(Math.abs(listed[2].metres - apart(far, start)) < 1e-6);
        assert.equal(listed[2].fare, fareOf(listed[2].metres, 2));
        assert.ok(!listed[2].here);
    });
});

describe("the branches open to step through to (explored.js, portals.js, host.js)", () => {
    it("keeps them with what's explored: none worked out for one kept before there were portals, as kept for the rest", () => {
        const explored = new Explored({ entered: ["home:guild-1"], visited: "" });

        assert.equal(explored.portals, null);
        assert.equal(explored.canTravelTo("human-town-2"), false);
        assert.equal("portals" in explored.toJSON(), false);
        assert.equal(explored.openPortal("human-town-2"), true);
        assert.equal(explored.openPortal("human-town-2"), false);
        assert.equal(explored.canTravelTo("human-town-2"), true);

        const back = new Explored(JSON.parse(JSON.stringify(explored.toJSON())));

        assert.deepEqual([...back.portals], ["human-town-2"]);
        assert.deepEqual([...new Explored({ portals: ["a", 3, null] }).portals], ["a"]);
    });

    it("opens, for a character kept from before there were portals, every branch in country they'd uncovered or whose hall they'd been in; for a new one, none till they go in", () => {
        const world = buildWorld({ seed: 2 });
        const plan = world.plan;
        const start = world.start;
        const others = guilds(plan)
            .filter(({ id }) => id !== start.id)
            .sort((a, b) => apart(a, start) - apart(b, start));
        const [seen, entered, unseen] = others;
        const kept = new Explored();

        // (Its middle's chunk uncovered; another's hall been in, its country not; the home town's
        // hall been in; the rest of the country under the fog)
        kept.visit(seen.at[0], seen.at[1]);
        kept.enter(`${entered.id}:guild-1`);
        kept.enter("home:guild-1");
        assert.ok(!kept.visitedAt(entered.at[0], entered.at[1]) && !kept.visitedAt(unseen.at[0], unseen.at[1]));
        assert.deepEqual(new Set(branchesFound(plan, kept, start)), new Set([seen.id, entered.id, start.id]));

        // (Joining: worked out once, from what was kept without them)
        const old = new Host(world, { populate: false }).join({ id: HOST_PLAYER, hero: HERO, explored: { entered: [...kept.entered], visited: kept.toJSON().visited } });

        assert.deepEqual(new Set(old.explored.portals), new Set([seen.id, entered.id, start.id]));

        // (Kept with them already: as they were, the fog lifted from more since or not)
        const since = new Host(buildWorld({ seed: 2 }), { populate: false }).join({ id: HOST_PLAYER, hero: HERO, explored: { ...kept.toJSON(), portals: [entered.id] } });

        assert.deepEqual([...since.explored.portals], [entered.id]);

        // (A new character: none)
        const fresh = new Host(buildWorld({ seed: 2 }), { populate: false }).join({ id: HOST_PLAYER, hero: HERO });

        assert.deepEqual([...fresh.explored.portals], []);
        assert.equal(CHUNK, 64);
    });

    it("opens a branch to them as they go into its hall, the home town's by the place it is, said once", () => {
        const host = new Host(buildWorld({ seed: 2 }), { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();

        const home = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home");
        const events = goIn(host, home);

        assert.equal(host.battle.actor(HOST_PLAYER).map, home.maps[0]);
        assert.deepEqual([...host.players.get(HOST_PLAYER).explored.portals], [host.world.start.id]);
        assert.equal(events.filter(({ type, portal }) => type === "explored" && portal === host.world.start.id).length, 1);

        // (Out and back in: said only the first time)
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: home.door.id }).ok, true);
        run(host, 12000);
        assert.equal(host.battle.actor(HOST_PLAYER).map, "town");
        assert.equal(goIn(host, home).filter(({ type, portal }) => type === "explored" && portal).length, 0);
    });
});

describe("stepping through a guild's portal (host.js #travel)", () => {
    it("carries a member at the portal to the other branch's portal for its fare, facing into its hall, their followers with them", () => {
        const { host, player, other, start } = atThePortal({ followers: [{ name: "Bram", calling: "warrior" }] });
        const [follower] = [...host.followers.keys()];
        const fare = fareOf(apart(other, start), 0);

        assert.equal(host.battle.actor(follower).map, host.battle.actor(HOST_PLAYER).map);

        const result = host.command(HOST_PLAYER, { type: "travel", to: other.id });

        assert.deepEqual(result, { ok: true, to: other.id, fare });
        assert.equal(player.progress.gold, 200 - fare);

        const there = [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === other.id);
        const hall = host.world.maps[there.maps[0]];
        const me = host.battle.actor(HOST_PLAYER);

        // (Out of its portal and on into the room, as far as one comes in at a door, facing into it)
        assert.equal(me.map, hall.id);
        assert.deepEqual(me.square, outOf(portalOn(hall), hall).square);
        assert.deepEqual(me.square, [beforePortal(portalOn(hall))[0] - 4, beforePortal(portalOn(hall))[1]]);
        assert.ok(!atPortal(portalOn(hall), me.x, me.y) && atPortal(portalOn(hall), beforePortal(portalOn(hall))[0] + 0.5, beforePortal(portalOn(hall))[1] + 0.5));
        assert.equal(me.facing, FACING.w);

        // (Said, with where they came from and the fare, for the game to show; their followers
        // through after them)
        const events = run(host, 500);
        const carried = events.find(({ type, id }) => type === "carried" && id === HOST_PLAYER);

        assert.deepEqual({ why: carried.why, map: carried.map, square: carried.square, to: carried.to, fare: carried.fare }, { why: "portal", map: hall.id, square: me.square, to: other.id, fare });
        assert.ok(carried.from.map !== hall.id);
        assert.equal(host.battle.actor(follower).map, hall.id);
        assert.ok(Math.hypot(host.battle.actor(follower).x - me.x, host.battle.actor(follower).y - me.y) < 6);

        // (Back again: the home town's branch was open to them as they came into it)
        const portal = portalOn(hall);

        put(me, hall.id, beforePortal(portal));
        assert.equal(host.command(HOST_PLAYER, { type: "travel", to: start.id }).ok, true);
        assert.equal(host.battle.actor(HOST_PLAYER).map, [...host.world.interiors.buildings.values()].find(({ kind, place }) => kind === "guild" && place === "home").maps[0]);
        assert.equal(player.progress.gold, 200 - fare * 2);
    });

    it("charges by the rank on their card: a fifth less each rank up, Mithril nothing", () => {
        for (const [rank, merit] of GUILD_RANKS.map(({ merit: least }, k) => [k, least])) {
            const { host, player, other, start } = atThePortal();

            player.standing.guild.merit = merit;
            assert.equal(player.standing.guildRank(), rank);
            assert.equal(host.command(HOST_PLAYER, { type: "travel", to: other.id }).fare, fareOf(apart(other, start), rank));
        }

        const { host, player, other } = atThePortal({ gold: 0 });

        player.standing.guild.merit = GUILD_RANKS[MITHRIL].merit;
        assert.deepEqual(host.command(HOST_PLAYER, { type: "travel", to: other.id }).fare, 0);
        assert.equal(player.progress.gold, 0);
    });

    it("refuses anyone not at a portal, not a member, without the gold or in a fight; anywhere they haven't been; and where they are", () => {
        const refused = (host, to) => host.command(HOST_PLAYER, { type: "travel", to }).reason;

        // (Away from the portal: across the hall)
        {
            const { host, hall, other } = atThePortal();

            put(host.battle.actor(HOST_PLAYER), hall.id, [10, 13]);
            assert.equal(refused(host, other.id), "portal");
        }

        // (Not a member of the guild; too poor; somewhere they haven't been; here)
        {
            const { host, other } = atThePortal({ member: false });

            assert.equal(refused(host, other.id), "unregistered");
            assert.equal(REFUSALS.unregistered, "Register at the guild's counter first.");
        }

        {
            const { host, player, other, start } = atThePortal({ gold: 3 });

            assert.equal(refused(host, other.id), "gold");
            assert.equal(player.progress.gold, 3);
            assert.equal(refused(host, start.id), "here");

            const shut = guilds(host.world.plan).find(({ id }) => id !== start.id && id !== other.id);

            player.progress.gold = 500;
            assert.equal(refused(host, shut.id), "unexplored");
            assert.equal(refused(host, "nowhere"), "command");
            assert.equal(refused(host, undefined), "command");
        }

        // (Someone after them)
        {
            const { host, other } = atThePortal();
            const [one] = host.battle.actors.filter(({ map, kind }) => map === host.battle.actor(HOST_PLAYER).map && kind !== "player");

            one.target = HOST_PLAYER;
            assert.equal(refused(host, other.id), "fighting");
            one.target = null;
            assert.equal(host.command(HOST_PLAYER, { type: "travel", to: other.id }).ok, true);
        }

        // (Out in the world)
        {
            const host = new Host(buildWorld({ seed: 2 }), { populate: false });

            host.join({ id: HOST_PLAYER, hero: HERO });
            assert.equal(refused(host, host.world.start.id), "portal");
        }
    });
});
