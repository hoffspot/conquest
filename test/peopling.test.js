// A building's people made only as a player goes into it, and let go once every player's 40 m
// from its door (client/js/core/host.js Host.peopling, RELEVANCE.away; generated/
// multiplayer_scaling_plan.md 1-23, the owner's ruling of 14 November 2026: "the same room while
// nearby"). Its folk, a barracks' garrison and a scene's court are out of the battle, and so out
// of the snapshot, the checksum, the index and every going through the roster, while no one's
// gone in. The building is got ready as ever, 22 m from its door, its floors made for whoever
// builds them ahead; no one is in it till a player's command to go in by one of its ways is
// taken, which is before any step that could set them down inside. Not the same battle as when
// they were made 22 m off and kept to 90, so `NET_VERSION` moved with it and the switch has a
// date. Nothing is kept for it: who is peopled is read off who is in the battle, so the snapshot
// is as it was (`SNAPSHOT_VERSION` unchanged). Counts and steps are asked, never times.
//
//     node --import ./test/plan-cache.js --test test/peopling.test.js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { ENTER_REACH, HOST_PLAYER, Host, RELEVANCE, SNAPSHOT_VERSION } from "../client/js/core/host.js";
import { Hosting, Joining, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { install, Probes, uninstall } from "../client/js/core/probe.js";
import { decode, encode } from "../client/js/core/wire.js";
import { unexpired } from "./helpers.js";

// Host.peopling's expiry (contribution.md, section 3, *Two netcodes side by side*): off, it plays
// the rule the owner changed, not the same battle, so it's to be taken out once nothing's left
// to set beside it
const EXPIRES = "2027-11-14";

const sha = (text) => createHash("sha1").update(text).digest("hex");
const SECOND = 1000 / STEP_MS;
const LOOK = RELEVANCE.every / STEP_MS;
const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// With a building's people made as it's got ready and kept till it's let go, as they were, what
// `play` gives
function asItWas(play) {
    assert.equal(Host.peopling, true, "Host.peopling is on");
    Host.peopling = false;

    try {
        return play();
    } finally {
        Host.peopling = true;
    }
}

// Everything of someone that the battle keeps, as text; and all of it but when they next look
// about and rest, which are kept up for one held (battle.js #lull): how they stand
const standingOf = (actor) => JSON.stringify({ ...actor, lookAt: null, rethinkAt: null, restAt: null, chance: null });

/**
 * A world (seed 2) with its player in the town they start in, none of the world's own people put
 * in (the orc, Wenches and Ale's twelve, who are the world's and always in the battle): so
 * everyone indoors is some building's. `guests` more players beside them.
 */
function town({ guests = [] } = {}) {
    const world = buildWorld({ seed: 2 });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });

    for (const id of guests) {
        host.join({ id, hero: { ...HERO, name: id } });
    }

    const game = { host, world, me: host.battle.actor(HOST_PLAYER), events: [] };

    return Object.assign(game, {
        building: (kind) => [...world.interiors.buildings.values()].find((each) => each.place === "home" && each.kind === kind && each.entrance),
        run: (steps) => {
            const from = game.events.length;

            for (let step = 0; step < steps; step++) {
                game.events.push(...host.advance(STEP_MS));
            }

            return game.events.slice(from);
        },
    });
}

// Someone stood out in the world `metres` from a building's door (as the look round measures
// it: its entrance's), on the nearest free ground to there; how far off they are then
function stand(game, actor, building, metres) {
    const { x, z } = building.entrance.door;
    const squares = squaresOf(game.world.maps.town);
    let best = null;

    // (Whichever way from the door leaves them nearest to that far off)
    for (let turn = 0; turn < 16; turn++) {
        const angle = (turn / 16) * Math.PI * 2;
        const [sx, sy] = nearestFree(squares, [Math.floor(x + Math.sin(angle) * metres), Math.floor(z + Math.cos(angle) * metres)], { within: 6 });
        const off = Math.hypot(sx + 0.5 - x, sy + 0.5 - z);

        if (!best || Math.abs(off - metres) < Math.abs(best.off - metres)) {
            best = { square: [sx, sy], off };
        }
    }

    Object.assign(actor, { map: "town", x: best.square[0] + 0.5, y: best.square[1] + 0.5, square: best.square, path: [], order: null, target: null });

    return best.off;
}

// On a building's doorstep, out in the world
const toDoor = (actor, building) => {
    const [x, y] = building.door.ends[0].squares[0];

    Object.assign(actor, { map: "town", x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, target: null });
};

// Those in the battle on a building's floors who aren't players
const within = (host, building) => host.battle.actors.filter((actor) => building.maps.includes(actor.map) && actor.kind !== "player");
const indoors = (host) => host.battle.actors.filter((actor) => actor.map !== "town" && actor.kind !== "player");
const roomOf = (host, building, of = standingOf) => sha(within(host, building).map(of).join("\n"));
const told = (events, type, key) => events.filter((event) => event.type === type && event.key === key);

// A player told to go in by a building's door from its doorstep, and played till they're inside
function goIn(game, building, who = game.me, id = HOST_PLAYER) {
    toDoor(who, building);
    assert.deepEqual(game.host.command(id, { type: "enter", link: building.door.id }), { ok: true });

    for (let step = 0; step < 4 * SECOND && who.map === "town"; step++) {
        game.run(1);
    }

    assert.equal(who.map, building.maps[0], "in by its door");
}

// And out again by it, however long the walk to it takes
function goOut(game, building, who = game.me, id = HOST_PLAYER) {
    for (let tries = 0; tries < 8 && who.map !== "town"; tries++) {
        game.host.command(id, { type: "enter", link: building.door.id });

        for (let step = 0; step < 8 * SECOND && who.map !== "town"; step++) {
            game.run(1);
        }
    }

    assert.equal(who.map, "town", "out again by its door");
}

describe("a building's people are made as a player goes in, not as they come near (core/host.js Host.peopling, plan 1-23)", () => {
    it("has a date, as a switch whose old form isn't the same battle has: taken out by then, or its date argued for", () => {
        unexpired("Host.peopling", EXPIRES);
        assert.equal(Host.peopling, true, "on: the owner's ruling");
        assert.ok(NET_VERSION >= 228, "a copy on the old rules would have them in its battle: it can't join");
        assert.equal(SNAPSHOT_VERSION, 53, "and nothing new is kept: the save is as it was");
        assert.deepEqual([RELEVANCE.near, RELEVANCE.far, RELEVANCE.away], [22, 90, 40]);
    });

    it("gets a building ready 22 m from its door as ever, its floors made, and puts no one in it: a player on its doorstep who isn't told to go in has an empty room behind the door, where there were eight", () => {
        const play = () => {
            const game = town();
            const tavern = game.building("tavern");

            stand(game, game.me, tavern, 60);
            game.run(LOOK);

            const far = { open: game.host.open.has(tavern.key), made: Boolean(tavern.made) };
            const off = stand(game, game.me, tavern, 15);
            const near = game.run(LOOK);

            toDoor(game.me, tavern);
            game.run(20 * SECOND);

            return { game, tavern, far, off, opened: told(near, "open", tavern.key), in: within(game.host, tavern).length, everyone: indoors(game.host).length, kept: game.host.open.get(tavern.key), bytes: encode(game.host.snapshot()).length };
        };
        const [now, was] = [play(), asItWas(play)];

        for (const each of [now, was]) {
            assert.deepEqual(each.far, { open: false, made: false }, "60 m off: not got ready");
            assert.ok(each.off > 8 && each.off < RELEVANCE.near, `${each.off} m off`);
            assert.equal(each.opened.length, 1, "got ready within 22 m");
            assert.ok(each.tavern.made && each.tavern.maps.every((map) => each.game.world.maps[map]), "its floors made");
        }

        assert.equal(was.opened[0].folk.length, 8);
        assert.equal(was.in, 8, "as it was: its folk in the battle, a player on its doorstep");
        assert.deepEqual(now.opened[0].folk, []);
        assert.deepEqual([now.in, now.everyone, now.kept], [0, 0, []], "no one indoors anywhere, twenty seconds on its doorstep");
        assert.ok(was.everyone >= 8, `${was.everyone} indoors round it as it was`);
        assert.ok(now.bytes < was.bytes - was.everyone * 200, `a snapshot of ${now.bytes} bytes where ${was.bytes}`);
        assert.equal(told(now.game.events, "peopled", now.tavern.key).length, 0);
    });

    it("makes them as the command to go in is taken, before it moves the player and before any step is played: a player on the door's own square is set down among them by the command itself, all of them there, standing as they're made, and about their business within a second", () => {
        const game = town();
        const tavern = game.building("tavern");

        stand(game, game.me, tavern, 15);
        game.run(LOOK);
        toDoor(game.me, tavern);
        game.run(1);
        assert.equal(within(game.host, tavern).length, 0);

        // (Counted: the making finds no way and looks for no one)
        let ticks = 0;
        const probes = install(new Probes({ clock: () => ticks++ }));

        try {
            assert.deepEqual(game.host.command(HOST_PLAYER, { type: "enter", link: tavern.door.id }), { ok: true });
        } finally {
            uninstall();
        }

        const counts = probes.toJSON().counts;
        const made = within(game.host, tavern);

        assert.equal(made.length, 8, "in the battle as the command's taken");
        // (On the door's own square, the command itself sets the player down inside: among them)
        assert.equal(game.me.map, tavern.maps[0]);
        assert.deepEqual(game.host.open.get(tavern.key).toSorted(), made.map(({ id }) => id).toSorted());
        assert.ok(made.every(({ id }) => game.host.folk.has(id)));
        assert.equal((counts["battle.paths"] ?? 0) + (counts["battle.searches"] ?? 0), 0, "no way found, no one looked for, in the making");

        // (The step they're set down in: everyone there already, no one moved yet)
        const fresh = roomOf(game.host, tavern);
        let crossedAt = -1;
        const events = [];

        for (let step = 0; step < 2 * SECOND && crossedAt < 0; step++) {
            const now = game.run(1);

            events.push(...now);

            if (now.some((event) => event.type === "cross" && event.id === HOST_PLAYER)) {
                crossedAt = step;
            }
        }

        assert.equal(crossedAt, 0, "the crossing told in the first step played");
        assert.equal(game.me.map, tavern.maps[0]);
        assert.equal(told(events, "peopled", tavern.key).length, 1);
        assert.equal(told(events, "peopled", tavern.key)[0].folk.length, 8);
        assert.ok(told(events, "peopled", tavern.key)[0].time <= events.find((event) => event.type === "cross").time, "made no later than the crossing");
        assert.equal(within(game.host, tavern).length, 8);

        const taproom = () => sha(within(game.host, tavern).filter((actor) => actor.map === tavern.maps[0]).map(standingOf).join("\n"));
        const stood = taproom();

        game.run(SECOND);
        assert.notEqual(taproom(), stood, "the room moving within a second");
        assert.notEqual(roomOf(game.host, tavern), fresh);
    });

    it("makes them for a player told to go in from far off, as far as the game shows a way (ENTER_REACH), and keeps them while they're on their way; let go at the next look once they stop, further off than 40 m", () => {
        const game = town();
        const tavern = game.building("tavern");
        const off = stand(game, game.me, tavern, 150);

        assert.ok(off > RELEVANCE.far && off < ENTER_REACH, `${off} m off`);
        game.run(LOOK);
        assert.equal(game.host.open.has(tavern.key), false);
        assert.deepEqual(game.host.command(HOST_PLAYER, { type: "enter", link: tavern.door.id }), { ok: true });
        assert.equal(within(game.host, tavern).length, 8, "made as the command's taken, 150 m off");

        // (On their way, further than 40 m from it for looks on end: kept)
        game.run(4 * LOOK);
        assert.equal(game.me.order?.type, "enter");
        assert.ok(Math.hypot(game.me.x - tavern.entrance.door.x, game.me.y - tavern.entrance.door.z) > RELEVANCE.away);
        assert.equal(within(game.host, tavern).length, 8);

        // (Told to stop, still 90 m and more off: let go with the building)
        game.host.command(HOST_PLAYER, { type: "stop" });

        const stopped = game.run(LOOK + 1);

        assert.equal(within(game.host, tavern).length, 0);
        assert.equal(told(stopped, "close", tavern.key).length + told(stopped, "vacated", tavern.key).length, 1);
    });

    it("makes them for a player set down inside by anything else, by the end of that step: carried in by magic, and come into the world there", () => {
        const game = town({ guests: ["guest"] });
        const church = game.building("church");
        const tavern = game.building("tavern");

        stand(game, game.me, church, 15);
        stand(game, game.host.battle.actor("guest"), church, 16);
        game.run(LOOK);
        assert.equal(within(game.host, church).length, 0);
        assert.ok(game.host.battle.place(HOST_PLAYER, church.maps[0], church.door.ends.find((end) => end.map === church.maps[0]).arrive));
        game.run(1);
        assert.equal(within(game.host, church).length, 6, "in the step they're carried in");

        // (A player joined straight into a room got ready: its people by the next look round)
        stand(game, game.host.battle.actor("guest"), tavern, 15);
        game.run(LOOK);
        assert.ok(game.host.open.has(tavern.key) && within(game.host, tavern).length === 0);

        const floor = tavern.maps[0];

        game.host.join({ id: "late", hero: { ...HERO, name: "Late" }, map: floor, square: tavern.door.ends.find((end) => end.map === floor).arrive });
        game.run(LOOK + 1);
        assert.equal(game.host.battle.actor("late").map, floor);
        assert.equal(within(game.host, tavern).length, 8);
    });
});

describe("the same room while nearby, a room made afresh from further off (RELEVANCE.away)", () => {
    it("keeps the room as it was left while a player's within 40 m of its door: its folk standing where they stood, bit for bit, a minute on, and going on from there when the player comes back in", () => {
        const game = town();
        const tavern = game.building("tavern");

        goIn(game, tavern);
        game.run(8 * SECOND);
        goOut(game, tavern);
        game.run(1);

        const left = roomOf(game.host, tavern);
        const where = within(game.host, tavern).map(({ id, x, y, map }) => [id, x, y, map]);
        const fresh = tavern.folk.map(({ id, square, map }) => [id, square[0] + 0.5, square[1] + 0.5, map]);

        assert.notDeepEqual(where.toSorted(), fresh.toSorted(), "(they've moved since they were made)");

        const off = stand(game, game.me, tavern, 36);

        assert.ok(off > RELEVANCE.near && off < RELEVANCE.away, `${off} m off`);

        const waited = game.run(60 * SECOND);

        assert.equal(told(waited, "vacated", tavern.key).length + told(waited, "close", tavern.key).length, 0);
        assert.equal(roomOf(game.host, tavern), left, "as they were left");

        // (Back in: the same ones where they stood, no one made)
        const before = game.events.length;

        goIn(game, tavern);
        assert.equal(told(game.events.slice(before), "peopled", tavern.key).length, 0, "no one made again");
        assert.equal(within(game.host, tavern).length, 8);
        game.run(SECOND);
        assert.notEqual(roomOf(game.host, tavern), left, "and about their business again");
    });

    it("lets them go at the first look round that finds every player more than 40 m from its door, the building still ready; and makes the room afresh for whoever comes back", () => {
        const game = town();
        const tavern = game.building("tavern");

        goIn(game, tavern);

        const made = within(game.host, tavern).map(({ id }) => id).toSorted();

        game.run(8 * SECOND);
        goOut(game, tavern);

        const size = encode(game.host.snapshot()).length;
        const off = stand(game, game.me, tavern, 46);

        assert.ok(off > RELEVANCE.away && off < RELEVANCE.far, `${off} m off`);

        const gone = game.run(LOOK + 1);
        const [vacated] = told(gone, "vacated", tavern.key);

        assert.deepEqual(vacated?.folk.toSorted(), made);
        assert.equal(told(gone, "close", tavern.key).length, 0);
        assert.deepEqual([game.host.open.has(tavern.key), game.host.open.get(tavern.key)], [true, []], "still got ready, no one in it");
        assert.ok(made.every((id) => !game.host.battle.actor(id) && !game.host.folk.has(id)));
        assert.equal(indoors(game.host).length, 0);
        assert.ok(encode(game.host.snapshot()).length < size - 8 * 200);

        // (Back: afresh, each where the building's plan puts them)
        const before = game.events.length;

        toDoor(game.me, tavern);
        assert.deepEqual(game.host.command(HOST_PLAYER, { type: "enter", link: tavern.door.id }), { ok: true });

        const again = within(game.host, tavern);

        assert.deepEqual(again.map(({ id }) => id).toSorted(), made);
        assert.deepEqual(again.map(({ id, x, y, map }) => [id, x, y, map]).toSorted(), tavern.folk.map(({ id, square, map }) => [id, square[0] + 0.5, square[1] + 0.5, map]).toSorted(), "where they're first made");
        game.run(1);
        assert.equal(told(game.events.slice(before), "peopled", tavern.key).length, 1);
    });

    it("keeps a room for as long as any player's in it or within 40 m, whoever went in: one inside and the other a kilometre off; one 30 m off and the other gone; let go only once both are away", () => {
        const game = town({ guests: ["guest"] });
        const tavern = game.building("tavern");
        const guest = game.host.battle.actor("guest");
        const far = (actor) => Object.assign(actor, { map: "town", x: actor.x + 1000, y: actor.y, square: [actor.square[0] + 1000, actor.square[1]], path: [], order: null });

        stand(game, guest, tavern, 15);
        far(guest);
        goIn(game, tavern);
        game.run(4 * LOOK);
        assert.equal(within(game.host, tavern).length, 8, "one inside, the other far");

        // (The guest comes to 30 m; the one inside goes out and far off)
        stand(game, guest, tavern, 30);
        goOut(game, tavern);
        far(game.me);
        game.run(4 * LOOK);
        assert.equal(within(game.host, tavern).length, 8, "kept by the one 30 m off, who never went in");

        // (And the guest away past 40 m)
        stand(game, guest, tavern, 46);

        const gone = game.run(LOOK + 1);

        assert.equal(told(gone, "vacated", tavern.key).length, 1);
        assert.equal(within(game.host, tavern).length, 0);
    });

    it("plays the old form with the switch off: made 22 m from the door and kept till every player's 90 m off", () => {
        asItWas(() => {
            const game = town();
            const tavern = game.building("tavern");

            stand(game, game.me, tavern, 15);
            game.run(LOOK);
            assert.equal(within(game.host, tavern).length, 8);
            stand(game, game.me, tavern, 60);
            game.run(4 * LOOK);
            assert.equal(within(game.host, tavern).length, 8, "still there 60 m off");
            stand(game, game.me, tavern, 95);

            const gone = game.run(LOOK + 1);

            assert.equal(told(gone, "close", tavern.key)[0]?.folk.length, 8);
            assert.equal(told(game.events, "peopled", tavern.key).length + told(game.events, "vacated", tavern.key).length, 0);
        });
    });
});

describe("what hung on a building being got ready (Host.peopling)", () => {
    it("stands a barracks' garrison up as a player's told to go in, not on its doorstep; lets it go 40 m off and stands it up afresh, as many as the town's garrison has then; one put down is one fewer in the war all the same", () => {
        const game = town();
        const barracks = game.building("barracks");
        const town_ = game.host.war.town(game.world.start.id);

        toDoor(game.me, barracks);
        game.run(4 * LOOK);
        assert.ok(game.host.open.has(barracks.key) && !game.host.quartered.has(town_.id), "on its doorstep: got ready, no garrison in it");
        assert.deepEqual(game.host.command(HOST_PLAYER, { type: "enter", link: barracks.door.id }), { ok: true });

        const first = game.host.quartered.get(town_.id);

        assert.ok(first && first.ids.length >= 2 && first.ids.every((id) => game.host.battle.actor(id)?.map === barracks.maps[0]), "stood up as the command's taken");
        game.run(SECOND);
        assert.equal(game.me.map, barracks.maps[0]);

        // (One of them put down: one fewer of the town's garrison, in the war)
        const garrison = town_.garrison;

        game.host.battle.afflict(first.ids[1], "burn", { by: HOST_PLAYER, damage: 100000 });
        game.run(3 * SECOND);
        assert.ok(game.host.battle.actor(first.ids[1])?.dead ?? true);
        assert.equal(town_.garrison, garrison - 1);

        // (Out and 46 m off: let go; nothing more lost to the war by it)
        goOut(game, barracks);
        stand(game, game.me, barracks, 46);

        const gone = game.run(LOOK + 1);

        assert.equal(gone.filter((event) => event.type === "unquartered" && event.town === town_.id).length, 1);
        assert.ok(!game.host.quartered.has(town_.id));
        assert.ok(first.ids.every((id) => !game.host.battle.actor(id) || game.host.battle.actor(id).dead), "the standing gone from the battle");
        assert.equal(town_.garrison, garrison - 1);

        // (Back in: stood up afresh of the garrison as it is, and there to be fought)
        toDoor(game.me, barracks);
        assert.deepEqual(game.host.command(HOST_PLAYER, { type: "enter", link: barracks.door.id }), { ok: true });

        const again = game.host.quartered.get(town_.id);

        assert.ok(again && again.ids.length >= 1 && again.ids.every((id) => !first.ids.includes(id)));
        assert.ok(again.ids.every((id) => game.host.battle.actor(id) && !game.host.battle.actor(id).dead));
        assert.deepEqual([again.cleared, again.relief], [false, null]);
        assert.equal(town_.garrison, garrison - 1);
    });

    it("leaves one hired away out of a room made afresh, and makes the rest of it", () => {
        const game = town();
        const guild = game.building("guild");

        goIn(game, guild);

        const all = within(game.host, guild).map(({ id }) => id);
        const one = all.find((id) => game.host.hireOffer(HOST_PLAYER, id));

        assert.ok(one, "(an adventurer for hire at the guild)");
        game.host.players.get(HOST_PLAYER).progress.gold = 100000;
        game.me.talkingTo = one;
        assert.equal(game.host.command(HOST_PLAYER, { type: "effect", effect: { hire: true } }).ok, true);
        goOut(game, guild);
        stand(game, game.me, guild, 46);
        game.run(LOOK + 1);
        assert.equal(within(game.host, guild).length, 0);
        toDoor(game.me, guild);
        assert.deepEqual(game.host.command(HOST_PLAYER, { type: "enter", link: guild.door.id }), { ok: true });
        assert.deepEqual(within(game.host, guild).map(({ id }) => id).toSorted(), all.filter((id) => id !== one).toSorted());
    });

    it("seats a keep's ruler as the war has them when a player goes in, and tells the hall's officials' posts from then: no one of them in the battle before", () => {
        const game = town();
        const hall = game.building("hall");

        stand(game, game.me, hall, 15);
        game.run(LOOK);
        assert.ok(game.host.open.has(hall.key));
        assert.ok(hall.folk.length >= 2 && hall.folk.every(({ id }) => !game.host.battle.actor(id) && game.host.postOf(id) === null));
        goIn(game, hall);
        assert.ok(hall.folk.every(({ id }) => game.host.battle.actor(id)));
        assert.ok(hall.folk.some(({ id }) => game.host.postOf(id)), "an official at their post, to be asked for work");
    });
});

describe("every copy of a world has the same people in its buildings (Host.peopling)", () => {
    it("keeps nothing new for it: a world carried on from a snapshot taken with a building got ready and empty, with a player on their way in, with one inside, with one 30 m off and after it's let go plays on step for step as the one it was taken from", () => {
        const game = town();
        const tavern = game.building("tavern");
        const copies = [];
        const take = (said) => {
            const again = Host.restore(buildWorld({ seed: 2 }), decode(encode(game.host.snapshot())));

            assert.equal(again.checksum(), game.host.checksum(), said);
            assert.deepEqual([...again.open].map(([key, folk]) => [key, folk.toSorted()]), [...game.host.open].map(([key, folk]) => [key, folk.toSorted()]), `${said}: who's in which building`);
            copies.push({ said, again, from: game.events.length });
        };
        // (What the player's told is told every copy, and every copy stepped with the first)
        const tell = (command) => {
            const result = game.host.command(HOST_PLAYER, command);

            for (const { again } of copies) {
                assert.deepEqual(again.command(HOST_PLAYER, command), result);
            }

            return result;
        };
        const play = (steps) => {
            for (let step = 0; step < steps; step++) {
                game.run(1);

                for (const { said, again } of copies) {
                    again.advance(STEP_MS);
                    assert.equal(again.checksum(), game.host.checksum(), `${said}, at ${game.host.battle.time} ms`);
                }
            }
        };
        const move = (to) => {
            for (const host of [game.host, ...copies.map(({ again }) => again)]) {
                const actor = host.battle.actor(HOST_PLAYER);

                typeof to === "number" ? stand({ world: host.world }, actor, host.world.interiors.buildings.get(tavern.key), to) : toDoor(actor, host.world.interiors.buildings.get(tavern.key));
            }
        };
        const until = (met) => {
            for (let second = 0; second < 60 && !met(); second++) {
                play(SECOND);
            }

            assert.ok(met());
        };

        move(15);
        play(LOOK);
        take("got ready, no one in it");
        move(null);
        play(2);
        assert.equal(tell({ type: "enter", link: tavern.door.id }).ok, true);
        take("told to go in, not yet through the door");
        until(() => game.me.map === tavern.maps[0]);
        play(3 * SECOND);
        take("a player inside");
        tell({ type: "enter", link: tavern.door.id });
        until(() => game.me.map === "town");
        move(30);
        play(2 * LOOK);
        assert.equal(within(game.host, tavern).length, 8);
        take("a player 30 m off, its folk standing");
        move(46);
        play(2 * LOOK);
        assert.equal(within(game.host, tavern).length, 0);
        take("let go");
        move(null);
        play(2);
        assert.equal(tell({ type: "enter", link: tavern.door.id }).ok, true);
        until(() => game.me.map === tavern.maps[0]);
        play(3 * SECOND);
        assert.equal(copies.length, 5);

        for (const { said, again } of copies) {
            assert.equal(sha(encode(again.snapshot())), sha(encode(game.host.snapshot())), `${said}: the world whole at the end`);
        }
    });

    it("keeps a joined copy with its host's as one player goes in and the other's far, as the other arrives with the first inside, and as both leave past 40 m; one welcomed with the building peopled, and one after it's let go: never astray", () => {
        const world = buildWorld({ seed: 2 });
        const host = new Host(world, { populate: false });

        host.join({ id: HOST_PLAYER, hero: HERO });

        const tavern = [...world.interiors.buildings.values()].find((each) => each.place === "home" && each.kind === "tavern" && each.entrance);
        const post = [];
        const hosting = new Hosting(host, { send: (peer, text) => post.push({ to: peer, text }) });
        const joined = [];
        const join = (peer, name) => {
            const joining = new Joining({ send: (text) => post.push({ from: peer, text }) });

            joining.onWelcome = ({ seed, race, snapshot }) => joining.attach(Host.restore(buildWorld({ seed, race }), snapshot));
            joined.push({ peer, joining });
            joining.hello({ hero: { ...HERO, name, race: "human" }, progress: { gold: 50 } });

            return joining;
        };
        const deliver = () => {
            while (post.length) {
                const { from, to, text } = post.shift();

                from ? hosting.hear(from, text) : joined.find(({ peer }) => peer === to)?.joining.hear(text);
            }
        };
        let astray = 0;
        const play = (steps) => {
            for (let step = 0; step < steps; step++) {
                host.advance(STEP_MS);
                hosting.flush();
                deliver();

                for (const { joining } of joined) {
                    while (joining.step()) {
                        // (every step it's been sent)
                    }

                    astray += joining.astray ? 1 : 0;
                }

                deliver();
            }
        };
        const until = (met, said) => {
            for (let second = 0; second < 60 && !met(); second++) {
                play(SECOND);
            }

            assert.ok(met(), said);
        };
        const mine = host.battle.actor(HOST_PLAYER);
        // (Where someone's stood, said to every copy: the host's and each joined)
        const place = (id, to) => {
            for (const each of [host, ...joined.map(({ joining }) => joining.host).filter(Boolean)]) {
                const actor = each.battle.actor(id);
                const building = each.world.interiors.buildings.get(tavern.key);

                to === null ? toDoor(actor, building) : stand({ world: each.world }, actor, building, to);
            }
        };
        const inTavern = () => within(host, tavern).length;
        const first = join("one", "Bryn");

        deliver();
        play(SECOND);

        const guest = first.me;
        const theirs = host.battle.actor(guest);

        assert.ok(theirs, "(the guest in the world)");

        // (The host's player in by the door; the guest far off)
        place(guest, 300);
        place(HOST_PLAYER, 15);
        play(LOOK);
        assert.equal(inTavern(), 0);
        place(HOST_PLAYER, null);
        play(2);
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: tavern.door.id }).ok, true);
        until(() => mine.map === tavern.maps[0], "the host's player in");
        assert.equal(inTavern(), 8);
        play(2 * SECOND);

        // (One welcomed now, the building peopled and a player in it)
        const second = join("two", "Cael");

        deliver();
        play(2 * SECOND);
        assert.ok(second.host && second.me, "(a second copy made, with the tavern peopled)");
        assert.equal(within(second.host, tavern).length, 8);

        // (The guest arrives and goes in, by their own command, with the first inside)
        place(guest, null);
        play(2);
        first.command({ type: "enter", link: tavern.door.id });
        until(() => theirs.map === tavern.maps[0], "the guest in");
        play(2 * SECOND);

        // (Both out, and away past 40 m: let go for every copy)
        host.command(HOST_PLAYER, { type: "enter", link: tavern.door.id });
        first.command({ type: "enter", link: tavern.door.id });
        until(() => mine.map === "town" && theirs.map === "town", "both out again");
        place(HOST_PLAYER, 46);
        place(guest, 50);
        place(second.me, 300);
        play(2 * LOOK);
        assert.equal(inTavern(), 0);
        assert.equal(within(first.host, tavern).length, 0);

        // (One welcomed with it let go, and the guest back in: made afresh, the same for all)
        const third = join("three", "Dara");

        deliver();
        play(2 * SECOND);
        assert.ok(third.host && third.me, "(a third copy made, with the tavern let go)");
        place(guest, null);
        play(2);
        first.command({ type: "enter", link: tavern.door.id });
        until(() => theirs.map === tavern.maps[0], "the guest back in");
        play(3 * SECOND);
        assert.equal(inTavern(), 8);
        assert.equal(astray, 0, "no copy ever astray");

        for (const { peer, joining } of joined) {
            assert.ok(joining.checks > 5, `${peer}: ${joining.checks} sums checked`);
            assert.equal(joining.host.checksum(), host.checksum(), peer);
            assert.equal(within(joining.host, tavern).length, 8, peer);
        }

    });
});

describe("what a snapshot holds with no one made till the door (Host.peopling)", () => {
    it("holds none of the folk of the buildings round a player who's gone into none of them: fewer characters and fewer bytes than it did, the same world outside", () => {
        const play = () => {
            const game = town({ guests: ["b", "c", "d"] });
            const kinds = ["tavern", "church", "guild", "hall"];

            // (Each by a door of the square, none told to go in; a while played)
            [game.me, ...["b", "c", "d"].map((id) => game.host.battle.actor(id))].forEach((actor, k) => stand(game, actor, game.building(kinds[k]), 10));
            game.run(10 * SECOND);

            const text = encode(game.host.snapshot());

            return { bytes: text.length, actors: game.host.battle.actors.length, indoors: indoors(game.host).length, outdoors: game.host.battle.actors.filter((actor) => actor.map === "town").length, open: game.host.open.size };
        };
        const [now, was] = [play(), asItWas(play)];

        assert.equal(now.indoors, 0);
        assert.ok(was.indoors >= 25, `${was.indoors} indoors as it was`);
        assert.equal(now.open, was.open, "the same buildings got ready");
        assert.equal(now.outdoors, was.outdoors, "the same out of doors");
        assert.equal(now.actors, was.actors - was.indoors);
        assert.ok(now.bytes < was.bytes - was.indoors * 200, `${now.bytes} bytes where ${was.bytes}, ${was.indoors} fewer in it`);
    });
});
