// A way asked for across kilometres (generated/multiplayer_scaling_plan.md 1-25). A player's
// command that sends their hero somewhere on their map has the host look for the whole way there
// as it hears it (core/battle.js #pathTo, #goThrough; core/navigation.js path): a player's way
// never waits for its tiles, so every navigation tile in the box between the two ends is baked
// there and then, and every chunk of the world under them made first. Nothing said how large
// that box could be: one `enter` for a dungeon's door from a hero risen in a town 7.5 km off
// held a world for more than six minutes (the load's dungeons, 0-2).
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
import { STEP_MS } from "../client/js/core/battle.js";
import { hypot } from "../client/js/core/exact.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { navigatorOf, TILE } from "../client/js/core/navigation.js";
import { buildWorld } from "../client/js/core/overworld.js";

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

// What a command cost the host as it was heard: what it answered, the navigation tiles baked
// for it and the chunks of the world made for it
function costOf({ world, host, navigation }, command) {
    const [baked, made] = [navigation.baked, world.maps.town.chunksMade];
    const result = host.command(HOST_PLAYER, command);

    return { result, baked: navigation.baked - baked, chunks: world.maps.town.chunksMade - made };
}

// How many navigation tiles the box between two points touches
const tilesBetween = ([ax, ay], [bx, by]) => (Math.floor(Math.max(ax, bx) / TILE) - Math.floor(Math.min(ax, bx) / TILE) + 1) * (Math.floor(Math.max(ay, by) / TILE) - Math.floor(Math.min(ay, by) / TILE) + 1);

describe("a way asked for across kilometres (core/navigation.js path; the plan's 1-25)", () => {
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

    it("has an `enter` for a door 2 km off bake every tile and make every chunk in the box between, as the command's heard", () => {
        const { host, me, outside } = game;

        // (2 km east of the door and 300 m south: a town's distance from its nearest dungeons)
        assert.ok(host.battle.place(HOST_PLAYER, "town", [outside[0] + 2000, outside[1] + 300]));

        const box = tilesBetween([me.x, me.y], outside);
        const far = costOf(game, { type: "enter", link: game.door.id });

        assert.deepEqual(far.result, { ok: true }, "taken, from anywhere on the door's map");
        assert.ok(box >= 600, `a box of ${box} tiles`);
        // (All of them but the few round the door, in already; the chunks are 64 m to the tiles'
        // 32, so a quarter as many and those along its edges)
        assert.ok(far.baked >= box - 16, `${far.baked} tiles baked for a box of ${box}`);
        assert.ok(far.chunks >= box / 4 - 16, `${far.chunks} chunks made for a box of ${box} tiles`);
    });

    it("and a `move` to a square a kilometre off the same", () => {
        const { host, me, outside } = game;

        assert.ok(host.battle.place(HOST_PLAYER, "town", [outside[0] + 20, outside[1] + 6]));

        const to = [Math.floor(me.x) - 1000, Math.floor(me.y) - 200];
        const box = tilesBetween([me.x, me.y], to);
        const far = costOf(game, { type: "move", to });

        assert.deepEqual(far.result, { ok: true });
        assert.ok(box >= 200, `a box of ${box} tiles`);
        assert.ok(far.baked >= box - 16, `${far.baked} tiles baked for a box of ${box}`);
        assert.ok(far.chunks >= box / 4 - 16, `${far.chunks} chunks made for a box of ${box} tiles`);
    });
});
