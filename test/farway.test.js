// A way asked for across kilometres (generated/multiplayer_scaling_plan.md 1-25). A player's
// command that sends their hero somewhere on their map has the host look for the whole way there
// as it hears it (core/battle.js #pathTo, #goThrough; core/navigation.js path): a player's way
// never waits for its tiles, so every navigation tile in the box between the two ends is baked
// there and then, and every chunk of the world under them made first. Nothing said how large
// that box could be: one `enter` for a dungeon's door from a hero risen in a town 7.5 km off
// held a world for more than six minutes (the load's dungeons, 0-2). Now the navigation gives
// up on a way, or a line, asked across more than MOST_ASKED tiles, whoever asks: no way, and
// nothing baked or made for it. Navigation.bounded off plays it as it was, for these tests to
// set the two side by side. And the host takes `enter` only from within ENTER_REACH of the door,
// as far off as the game offers one, and refuses it from further ("far").
//
// What's counted is the same on any machine: the tiles the mesh baked for the command
// (Navigation `baked`) and the chunks the world made for it (Overworld `chunksMade`). Never how
// long it took.
//
// Every way the same search is reached, each a way looked for between two points that whoever
// asks may put as far apart as the map is wide:
//
//   A player's commands (core/host.js #command; a player's way never waits for its tiles):
//     `enter`     battle.js command -> #goThrough -> #pathTo; and every step it's still their
//                 order (#obey: again each REPATH_MS while there's no way).
//     `move`      battle.js command -> #pathTo; and on from where a way ended short, MOVE_LEGS
//                 times (#obey).
//     (Not `approach`, to talk or trade: the place to talk to someone from is looked for
//     through the TALK_SEARCH squares nearest the hero, 16 m or so, and with none the order's
//     let go: no way's asked for to anyone further off.)
//     `engage`    (not `stand`) -> #obey -> #pursue -> #pathTo; and through the door its
//                 target went by, #goThrough.
//     `ahead`     not a way but a line walked over the mesh (navigation.js raycast), covered the
//                 same: at most AHEAD (400 m) of it, a box of 110 tiles at the most. The one
//                 that was bounded.
//     And what the battle does of itself with any of them: the way found again to where they
//     were going when someone's stood in it (#blocked).
//
//   The game's own far journeys send none of these from far off: a pin on the world map is run
//   to a leg of 72 m at a time (app/journey.js LEGS.reach), and the way drawn to it bakes
//   nothing (navigation.js wayIn).
//
//   Characters' own errands, all through battle.js #pathTo (a wagon's: wagonWay). Each waits
//   for its tiles where the game has them baked off its thread (navigation.js `later`), unless a
//   player's by both its ends; a host with nowhere to send them (a test's, a world played with
//   no baker) bakes them there and then, as a player's:
//     #routine (the folk's stops, and back to where they belong), #afraid, #flee, #off,
//     #limpOff, #patrol (a soldier's round, and a march's way to the next of its links), #wild
//     and #forage (a creature's roaming), #colossalGo, #follow (a follower after their leader,
//     however far ahead), #pursue and #backOff (anyone set on anyone), #blocked.
//   And the host's own asking, short: host.js #spots (whether a free square has a way to a
//   point near it).
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import * as THREE from "three";
import { Doors } from "../client/js/app/doors.js";
import { AHEAD, STEP_MS } from "../client/js/core/battle.js";
import { hypot } from "../client/js/core/exact.js";
import { ENTER_REACH, HOST_PLAYER, Host, REFUSALS } from "../client/js/core/host.js";
import { KEEP_TILES, MARGIN, MOST_ASKED, Navigation, navigatorOf, TILE } from "../client/js/core/navigation.js";
import { SCENES } from "../client/js/core/navigation/settings.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { createRandom } from "../client/js/core/random.js";
import { FAR } from "../client/js/world/far/levels.js";
import { DISTANCE } from "../client/js/world/view.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// A world with one hero in it and the nearest dungeon to where they start made, as it is once
// anyone's come near its way in: { world, host, me, navigation, door (its way in's link),
// outside (the square before it) }
function delving(seed = 1) {
    const world = buildWorld({ seed });
    const host = new Host(world, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const me = host.battle.actor(HOST_PLAYER);
    const [sx, sy] = world.start.at;
    const site = world.plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme !== "hell").reduce((best, one) => (!best || hypot(one.at[0] - sx, one.at[1] - sy) < hypot(best.at[0] - sx, best.at[1] - sy) ? one : best), null);

    world.maps.town.sites.heartOf(site);

    const outside = world.maps.town.sites.set.get(site.id).entrance.outside;

    assert.ok(host.battle.place(HOST_PLAYER, "town", outside));

    for (let t = 0; t < 1500; t += STEP_MS) {
        host.advance(STEP_MS);
    }

    const building = world.interiors.buildings.get(`site:${site.id}`);

    assert.ok(building.made && building.door, "the dungeon made, with its way in");

    return { world, host, me, navigation: navigatorOf(world.maps.town), door: building.door, outside };
}

// What a command cost the host as it was heard (or the battle, told it by `by`): what it
// answered, the navigation tiles baked for it and the chunks of the world made for it
function costOf({ world, host, navigation }, command, by = host) {
    const [baked, made] = [navigation.baked, world.maps.town.chunksMade];
    const result = by.command(HOST_PLAYER, command);

    return { result, baked: navigation.baked - baked, chunks: world.maps.town.chunksMade - made };
}

// How many navigation tiles the box between two points touches, `round` metres round it
const tilesBetween = ([ax, ay], [bx, by], round = 0) => (Math.floor((Math.max(ax, bx) + round) / TILE) - Math.floor((Math.min(ax, bx) - round) / TILE) + 1) * (Math.floor((Math.max(ay, by) + round) / TILE) - Math.floor((Math.min(ay, by) - round) / TILE) + 1);

// The way looked for as it was, however far: what `play` gives
function unbounded(play) {
    const was = Navigation.bounded;

    Navigation.bounded = false;

    try {
        return play();
    } finally {
        Navigation.bounded = was;
    }
}

const steps = (host, count) => {
    for (let k = 0; k < count; k++) {
        host.advance(STEP_MS);
    }
};

describe("a way asked for across kilometres (core/navigation.js path, MOST_ASKED; the plan's 1-25)", () => {
    let game;

    before(() => {
        game = delving();
    });

    it("costs a hero by the door nothing to speak of: a tile or two", () => {
        const { host, me, outside } = game;

        assert.ok(host.battle.place(HOST_PLAYER, "town", [outside[0] + 20, outside[1] + 6]));

        const near = costOf(game, { type: "enter", link: game.door.id });

        assert.deepEqual(near.result, { ok: true });
        assert.ok(near.baked <= 4 && near.chunks <= 4, `${near.baked} tiles and ${near.chunks} chunks for a door 21 m off`);
        assert.ok(me.path.length > 0, "and they're on their way");
    });

    it("finds no way to a door 2 km off, and bakes and makes nothing for it, where it baked every tile and made every chunk in the box between as the command was heard", () => {
        const { host, me, navigation, outside } = game;

        // (2 km east of the door and 300 m south: a town's distance from its nearest dungeons)
        assert.ok(host.battle.place(HOST_PLAYER, "town", [outside[0] + 2000, outside[1] + 300]));

        // (Told by the battle, as the host told it before it took `enter` only from near by:
        // what the navigation does for whoever asks)
        const box = tilesBetween([me.x, me.y], outside);
        const gaveUp = navigation.tooFar;
        const now = costOf(game, { type: "enter", link: game.door.id }, host.battle);

        assert.ok(box >= 600 && box > MOST_ASKED, `a box of ${box} tiles`);
        assert.deepEqual([now.baked, now.chunks], [0, 0], "nothing baked, nothing made");
        assert.equal(navigation.tooFar, gaveUp + 1, "given up on, and counted");
        assert.deepEqual(me.path, [], "the hero stands where they are");

        // (Still asked for, it's looked for again now and then, as any way there's none of: and
        // costs as little each time)
        const [baked, made] = [navigation.baked, game.world.maps.town.chunksMade];

        steps(host, 40);
        assert.ok(navigation.tooFar > gaveUp + 1, "looked for again");
        assert.deepEqual(me.path, []);
        // (A handful, for what the world puts round a hero come somewhere new, whatever they ask)
        assert.ok(navigation.baked - baked <= 16 && game.world.maps.town.chunksMade - made <= 16, `${navigation.baked - baked} tiles baked and ${game.world.maps.town.chunksMade - made} chunks made in two seconds of standing there`);
        host.command(HOST_PLAYER, { type: "stop" });

        // As it was: all of them but the few round the door, in already; the chunks are 64 m to
        // the tiles' 32, so a quarter as many and those along its edges
        const was = unbounded(() => costOf(game, { type: "enter", link: game.door.id }, host.battle));

        assert.ok(was.baked >= box - 16, `${was.baked} tiles baked for a box of ${box}`);
        assert.ok(was.chunks >= box / 4 - 16, `${was.chunks} chunks made for a box of ${box} tiles`);
        assert.ok(me.path.length > 0, "and a way found over them");
        host.command(HOST_PLAYER, { type: "stop" });

        // (And with every tile of it in, there's still none: it goes by how far apart the ends
        // are, the same on every copy, never by what this one happens to have baked)
        assert.deepEqual(navigation.path([me.x, me.y], [outside[0] + 0.5, outside[1] + 0.5]), []);
        assert.ok(unbounded(() => navigation.path([me.x, me.y], [outside[0] + 0.5, outside[1] + 0.5])).length > 0);
    });

    it("has a hero told to `move` a kilometre off stand where they are, their order let go after a few tries, as with no way there at all", () => {
        const { host, me, navigation, outside } = game;

        assert.ok(host.battle.place(HOST_PLAYER, "town", [outside[0] + 20, outside[1] + 6]));

        const [x, y] = [me.x, me.y];
        const to = [Math.floor(x) - 1000, Math.floor(y) - 500];
        const box = tilesBetween([x, y], to);
        const far = costOf(game, { type: "move", to });

        // (The one square looked at where they're to go is in a chunk of its own: made, and no
        // more)
        assert.ok(box >= 500 && box > MOST_ASKED, `a box of ${box} tiles`);
        assert.deepEqual(far.result, { ok: true });
        assert.ok(far.baked === 0 && far.chunks <= 1, `${far.baked} tiles baked and ${far.chunks} chunks made`);
        assert.deepEqual(me.path, []);
        assert.equal(navigation.tooFar > 0, true);
        steps(host, 20);
        assert.equal(me.order, null, "the order let go");
        assert.deepEqual([me.x, me.y], [x, y], "never moved");
    });

    it("has a hero set on someone a kilometre off stand where they are (sent to talk to them, no way was ever asked for)", () => {
        const { host, me, navigation, outside } = game;
        const { battle } = host;

        assert.ok(battle.place(HOST_PLAYER, "town", [outside[0] + 20, outside[1] + 6]));

        // (The orc that prowls by the town the hero started in; and the hero 1.5 km from it)
        const one = battle.actor("orc");

        assert.ok(one && one.map === "town" && !one.dead, "someone out in the world");
        assert.ok(battle.place(HOST_PLAYER, "town", [Math.floor(one.x) + 1500, Math.floor(one.y) + 400]));

        const [x, y] = [me.x, me.y];

        for (const type of ["approach", "engage"]) {
            const [gaveUp, baked, made] = [navigation.tooFar, navigation.baked, game.world.maps.town.chunksMade];

            assert.deepEqual(host.command(HOST_PLAYER, { type, target: one.id }), { ok: true }, type);
            steps(host, 12);
            // (To talk: the place to talk from is looked for near the hero only, and with none
            // the order's let go. To fight: the way to them asked for, and given up on)
            assert.equal(navigation.tooFar > gaveUp, type === "engage", `${type}: given up on`);
            assert.equal(me.order?.type ?? null, type === "engage" ? "engage" : null);
            assert.ok(navigation.baked - baked <= 16 && game.world.maps.town.chunksMade - made <= 16, `${type}: ${navigation.baked - baked} tiles baked and ${game.world.maps.town.chunksMade - made} chunks made`);
            assert.deepEqual([me.x, me.y, me.path.length], [x, y, 0], `${type}: never moved`);
            host.command(HOST_PLAYER, { type: "stop" });
        }
    });

    it("walks no line over the mesh across more than its most: none, and nothing made for it", () => {
        const { navigation, world, outside } = game;
        const from = [outside[0] + 0.5, outside[1] + 0.5];
        const [baked, made, gaveUp] = [navigation.baked, world.maps.town.chunksMade, navigation.tooFar];

        assert.equal(navigation.raycast(from, [from[0] + 3000, from[1] + 3000]), null);
        assert.deepEqual([navigation.baked - baked, world.maps.town.chunksMade - made, navigation.tooFar - gaveUp], [0, 0, 1]);
    });

    it("still finds every way the game asks for: a way within its most the same either way, and the longest line an `ahead` order walks well within", () => {
        const { navigation, outside } = game;
        const from = [outside[0] + 0.5, outside[1] + 0.5];
        // (As far as a tap in the view can send a hero, and on a slant: the near camera's 160 m
        // and the 32 m it can be behind them)
        const to = [from[0] + 136, from[1] + 136];

        assert.ok(tilesBetween(from, to, MARGIN) <= 49);

        const now = navigation.path(from, to);
        const was = unbounded(() => navigation.path(from, to));

        assert.ok(now.length > 0, "a way");
        assert.deepEqual(now, was);

        // The line an `ahead` order walks, AHEAD metres whichever way they face from wherever
        // they stand in a tile: the box it's covered by (2 m round it: NEAR) at its most
        let most = 0;

        for (let degrees = 0; degrees < 360; degrees += 0.25) {
            const [dx, dy] = [Math.sin((degrees * Math.PI) / 180) * AHEAD, Math.cos((degrees * Math.PI) / 180) * AHEAD];

            for (const x of [0, 1.9, 2.1, 16, 29.9, 31.9]) {
                for (const y of [0, 1.9, 2.1, 16, 29.9, 31.9]) {
                    most = Math.max(most, tilesBetween([1024 + x, 1024 + y], [1024 + x + dx, 1024 + y + dy], 2));
                }
            }
        }

        assert.equal(most, 110);
        assert.ok(most * 2 <= MOST_ASKED, "twice over");
        // (And what its most was chosen by: a scene's whole mesh, a quarter of the overworld's)
        assert.equal(MOST_ASKED, SCENES.keep);
        assert.equal(MOST_ASKED * 4, KEEP_TILES);
    });
});

describe("an `enter` from far off (core/host.js ENTER_REACH; the plan's 1-25)", () => {
    let game;

    // The hero stood just there, to the hundredth of a metre
    const stand = (me, [x, y]) => Object.assign(me, { map: "town", square: [Math.floor(x), Math.floor(y)], x, y, path: [], order: null, target: null });

    before(() => {
        game = delving();
    });

    it("is as far as the game offers a door: what the near camera sees, the camera's furthest behind the hero, and a tile's width for a hero on the move", () => {
        assert.equal(ENTER_REACH, FAR.nearFar + DISTANCE.most + TILE);
        assert.equal(ENTER_REACH, 224);

        // A way that far, whichever way it lies and wherever in a tile it starts, is across a
        // fifth of what's looked for across at once
        let most = 0;

        for (let degrees = 0; degrees < 360; degrees += 0.25) {
            const [dx, dy] = [Math.sin((degrees * Math.PI) / 180) * ENTER_REACH, Math.cos((degrees * Math.PI) / 180) * ENTER_REACH];

            for (const x of [0, 3.9, 4.1, 16, 27.9, 28.1, 31.9]) {
                for (const y of [0, 3.9, 4.1, 16, 27.9, 28.1, 31.9]) {
                    most = Math.max(most, tilesBetween([1024 + x, 1024 + y], [1024 + x + dx, 1024 + y + dy], MARGIN));
                }
            }
        }

        assert.equal(most, 49);
        assert.ok(most * 5 <= MOST_ASKED);
    });

    it("refuses a hero risen in a town far from their dungeon, in words, and does nothing for it: no way asked for, no tile baked, no chunk made, no order given", () => {
        const { host, me, navigation, outside } = game;

        assert.ok(host.battle.place(HOST_PLAYER, "town", [outside[0] + 2000, outside[1] + 300]));

        const gaveUp = navigation.tooFar;
        const far = costOf(game, { type: "enter", link: game.door.id });

        assert.deepEqual(far.result, { ok: false, reason: "far" });
        assert.equal(REFUSALS.far, "Too far away.");
        assert.deepEqual([far.baked, far.chunks, navigation.tooFar - gaveUp], [0, 0, 0]);
        assert.equal(me.order, null);
        assert.deepEqual(me.path, []);
    });

    it("takes it from ENTER_REACH off and no further, measured from where they stand to the door's square", () => {
        const { host, me, door, outside } = game;
        // (Due east of the easternmost of its squares: the nearest of them)
        const [dx, dy] = door.ends.find(({ map }) => map === "town").squares.reduce((east, square) => (square[0] > east[0] ? square : east));

        stand(me, [dx + 0.5 + ENTER_REACH + 0.01, dy + 0.5]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "enter", link: door.id }), { ok: false, reason: "far" });
        assert.equal(me.order, null);

        stand(me, [dx + 0.5 + ENTER_REACH, dy + 0.5]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "enter", link: door.id }), { ok: true });
        assert.equal(me.order?.type, "enter");
        host.command(HOST_PLAYER, { type: "stop" });

        // (And from by it, as ever: on their way)
        assert.ok(host.battle.place(HOST_PLAYER, "town", [outside[0] + 20, outside[1] + 6]));
        assert.deepEqual(host.command(HOST_PLAYER, { type: "enter", link: door.id }), { ok: true });
        assert.ok(me.path.length > 0);
        host.command(HOST_PLAYER, { type: "stop" });
    });

    it("gets no building ready for a hero too far off to go into it", () => {
        const { host, world, me } = game;
        const building = [...world.interiors.buildings.values()].find(({ place, door, key }) => place === "home" && door?.ends[0].map === "town" && !host.open.has(key));
        const [dx, dy] = building.door.ends[0].squares[0];

        assert.ok(building.door.ends[0].squares.every(([x, y]) => hypot(x - dx, y - dy) < 8));
        stand(me, [dx + 0.5, dy + 0.5 + ENTER_REACH + 40]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }), { ok: false, reason: "far" });
        assert.equal(host.open.has(building.key), false);

        stand(me, [dx + 0.5, dy + 0.5 + 3]);
        assert.deepEqual(host.command(HOST_PLAYER, { type: "enter", link: building.door.id }), { ok: true });
        assert.equal(host.open.has(building.key), true);
        host.command(HOST_PLAYER, { type: "stop" });
    });

    it("holds through 100,000 `enter`s for any way through there is, from a hero kilometres from them all: every one refused, and not a tile baked or a chunk made for them", () => {
        const { host, world, me, navigation, outside } = game;
        const random = createRandom(125);
        const links = host.battle.links.map(({ id }) => id);
        const reasons = new Map();

        // (Out in the wilds 3 km from the dungeon, further from the town: nothing's within reach)
        assert.ok(host.battle.place(HOST_PLAYER, "town", [outside[0] + 3000, outside[1] + 300]));
        assert.ok(links.length > 20, `${links.length} ways through`);
        assert.ok(host.battle.links.every(({ ends }) => ends.every(({ map, squares }) => map !== "town" || squares.every(([x, y]) => hypot(x - me.x, y - me.y) > ENTER_REACH + 100))));

        const [baked, made, gaveUp] = [navigation.baked, world.maps.town.chunksMade, navigation.tooFar];

        for (let k = 0; k < 100000; k++) {
            // (One in ten for no way through at all)
            const link = k % 10 === 9 ? `no-such-${k}` : random.pick(links);
            const { ok, reason } = host.command(HOST_PLAYER, { type: "enter", link, run: k % 2 === 0 });

            assert.equal(ok, false);
            reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        }

        // ("link": no such way, or one with no end on the hero's map, a building's stairs)
        assert.deepEqual([...reasons.keys()].sort(), ["far", "link"]);
        assert.ok(reasons.get("far") > 1000, `${reasons.get("far")} too far`);
        assert.deepEqual([navigation.baked - baked, world.maps.town.chunksMade - made, navigation.tooFar - gaveUp], [0, 0, 0]);
        assert.equal(me.order, null);
    });
});

describe("the doors a tap finds (app/doors.js at)", () => {
    it("finds none further along the ray than it's told to look: as far as the near camera sees, in the game", () => {
        const doors = new Doors({ links: [], maps: {} }, new THREE.Group());
        // A door 2 m wide and 2.4 high facing south, its face `z` metres north of the camera
        const doorAt = (id, z) => ({ link: { id }, map: "town", box: new THREE.Box3(new THREE.Vector3(-1, 0, -z - 0.5), new THREE.Vector3(1, 2.4, -z + 0.5)), face: new THREE.Plane(new THREE.Vector3(0, 0, 1), z), floor: null });
        const ray = new THREE.Ray(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 0, -1));

        doors.targets.push(doorAt("far", 200));
        assert.equal(doors.at(ray, "town")?.link.id, "far", "with no reach, however far");
        assert.equal(doors.at(ray, "town", FAR.nearFar), null);

        doors.targets.push(doorAt("near", 159));
        assert.equal(doors.at(ray, "town", FAR.nearFar)?.link.id, "near");
        assert.equal(doors.at(ray, "elsewhere", FAR.nearFar), null);
        // (What it finds is within what the host takes, wherever the camera is behind the hero)
        assert.ok(FAR.nearFar + DISTANCE.most < ENTER_REACH);
    });
});
