// What the world will soon want made (client/js/core/host.js soon, SOON; generated/
// multiplayer_scaling_plan.md 1-6): the host says where its players are, the ground a town's
// soldiers and townsfolk will be stood on in the step a player comes near enough, and the dungeons
// about to be made, for whoever makes the world ahead of need (server/ahead.js, app/game.js).
// Asking changes nothing, and the world's steps come out the same whether what it says is made in
// time or not; made in time, the step that brings a town to life makes no ground of its own.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { DELVES } from "../client/js/core/dungeons/play.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host, MUSTER, SOON } from "../client/js/core/host.js";
import { dungeonFrom } from "../client/js/core/insides.js";
import { buildWorld, CHUNK, CHUNKS } from "../client/js/core/overworld.js";
import { SETTLEMENT_KINDS } from "../client/js/core/setpieces/town.js";
import { TOWNSFOLK_REACH } from "../client/js/core/townsfolk.js";
import { postsOf } from "../client/js/core/war/muster.js";
import { encode } from "../client/js/core/wire.js";

const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword", boots: false });
const CITY = "human-city-1";

// A world (seed 2) with one player out in it, `off` metres west of a place's edge (or of a point,
// with no edge), and the chunks its ground's made of counted while a step's being played
function worldNear(id, off) {
    const world = buildWorld({ seed: 2 });
    const overworld = world.maps.town;
    const place = world.plan.places.find((each) => each.id === id) ?? world.plan.sites.find((each) => each.id === id);
    const edge = SETTLEMENT_KINDS[place.kind]?.radius ?? 0;
    const host = new Host(world, { populate: false });
    const at = (metres) => nearestFree(squaresOf(overworld), [Math.round(place.at[0] - edge - metres), Math.round(place.at[1])], { within: 40 });
    const game = { world, overworld, host, place, edge, at, events: [], inSteps: 0, stepping: false };
    const groundChunk = overworld.ground.chunk.bind(overworld.ground);

    overworld.ground.chunk = (cx, cy) => {
        if (game.stepping && !overworld.ground.peek(cx, cy)) {
            game.inSteps++;
        }

        return groundChunk(cx, cy);
    };

    host.join({ id: "p1", hero: HERO, square: at(off), map: "town" });
    host.populate();

    return game;
}

// The chunks a box of squares touches: [[cx, cy]...]
function chunksOf([x0, y0, x1, y1]) {
    const chunks = [];

    for (let cy = Math.max(0, Math.floor(y0 / CHUNK)); cy <= Math.min(CHUNKS - 1, Math.floor(y1 / CHUNK)); cy++) {
        for (let cx = Math.max(0, Math.floor(x0 / CHUNK)); cx <= Math.min(CHUNKS - 1, Math.floor(x1 / CHUNK)); cx++) {
            chunks.push([cx, cy]);
        }
    }

    return chunks;
}

// What whoever makes the world ahead would make between steps, all of it at once: the chunks
// round each player (two each way, as a browser draws them) and what the host says it will soon
// want
function makeAhead({ host, overworld }) {
    const { around, boxes } = host.soon();

    for (const box of [...around.map(([x, y]) => [x - 2 * CHUNK, y - 2 * CHUNK, x + 2 * CHUNK, y + 2 * CHUNK]), ...boxes]) {
        for (const [cx, cy] of chunksOf(box)) {
            overworld.chunk(cx, cy);
        }
    }
}

// Played on `steps`, what's wanted made ahead before each (or not); each step's events kept with
// how many chunks it made for itself: [{ types, chunks }]
function play(game, steps, { ahead }) {
    const played = [];

    for (let k = 0; k < steps; k++) {
        if (ahead) {
            makeAhead(game);
        }

        const before = game.inSteps;

        game.stepping = true;

        const events = game.host.advance(STEP_MS);

        game.stepping = false;
        game.events.push(...events);
        played.push({ types: events.map(({ type }) => type), chunks: game.inSteps - before });
    }

    return played;
}

describe("what the world will soon want made (core/host.js soon)", () => {
    let far;

    before(() => {
        far = worldNear(CITY, MUSTER.near + SOON.margin + 60);
        play(far, 2, { ahead: true });
    });

    it("says where each player is, and nothing of a town they're not yet near", () => {
        const { host, place } = far;
        const me = host.battle.actor("p1");
        const { around, boxes } = host.soon();

        assert.deepEqual(around, [[me.x, me.y]]);
        assert.ok(!boxes.some(([x0, y0, x1, y1]) => place.at[0] >= x0 && place.at[0] <= x1 && place.at[1] >= y0 && place.at[1] <= y1), "the city's ground not wanted yet");
    });

    it("says the ground a town's soldiers and townsfolk will stand on once a player's within SOON.margin of where they come out, till they're out", () => {
        const game = worldNear(CITY, MUSTER.near + SOON.margin - 20);
        const { host, place, edge, world } = game;
        const holds = ([x0, y0, x1, y1], [x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const wanted = () => host.soon().boxes.filter((box) => holds(box, place.at));

        play(game, 1, { ahead: true });
        assert.ok(!host.mustered.has(place.id), "(not mustered: further off than MUSTER.near)");

        // (Its guards' posts, just past its edge, and its townsfolk's streets, all within it)
        const muster = [Math.floor(place.at[0] - edge - SOON.town), Math.floor(place.at[1] - edge - SOON.town), Math.ceil(place.at[0] + edge + SOON.town), Math.ceil(place.at[1] + edge + SOON.town)];
        const folk = [Math.floor(place.at[0] - edge - SOON.folk), Math.floor(place.at[1] - edge - SOON.folk), Math.ceil(place.at[0] + edge + SOON.folk), Math.ceil(place.at[1] + edge + SOON.folk)];

        assert.ok(wanted().some((box) => String(box) === String(muster)), "the city's ground wanted, out past its edge");
        assert.ok(postsOf(world.plan, place).every(({ at }) => holds(muster, at)), "its guards' posts in it");

        // (Whole squares, both ends in, on the world)
        for (const box of host.soon().boxes) {
            assert.ok(box.every(Number.isInteger) && box[0] <= box[2] && box[1] <= box[3], `${box}`);
        }

        // (Its soldiers out, its townsfolk still to come: only their ground wanted, the lesser)
        host.battle.place("p1", "town", game.at(MUSTER.near - 10));
        play(game, 12, { ahead: true });
        assert.ok(host.mustered.has(place.id) && !host.townsfolk.has(place.id), "(mustered, its townsfolk not out)");
        assert.deepEqual(wanted(), [folk]);

        // (And those out too: nothing more of it wanted)
        host.battle.place("p1", "town", game.at(TOWNSFOLK_REACH.near - 10));
        play(game, 12, { ahead: true });
        assert.ok(host.townsfolk.has(place.id), "(its townsfolk out)");
        assert.deepEqual(wanted(), []);
    });

    it("changes nothing for the asking: no chunk made, nothing set down, the world kept as it was", () => {
        const game = worldNear(CITY, MUSTER.near + SOON.margin - 20);
        const { host, world, overworld } = game;

        play(game, 3, { ahead: false });

        const kept = encode(host.snapshot());
        const [chunks, set, buildings, laid, sum] = [overworld.chunks.size, overworld.sites.set.size, world.interiors.buildings.size, overworld.settlements.laid.size, host.checksum()];

        for (let k = 0; k < 3; k++) {
            assert.ok(host.soon().boxes.length > 0);
        }

        assert.equal(encode(host.snapshot()), kept);
        assert.deepEqual([overworld.chunks.size, overworld.sites.set.size, world.interiors.buildings.size, overworld.settlements.laid.size, host.checksum()], [chunks, set, buildings, laid, sum]);
    });

    it("leaves the step that brings a town to life no ground to make when it's made ahead, and the world the same step for step whether it is or not", () => {
        const walk = (ahead) => {
            const game = worldNear(CITY, MUSTER.near + SOON.margin + 60);
            const played = [];

            for (const off of [MUSTER.near + SOON.margin - 20, MUSTER.near - 10, TOWNSFOLK_REACH.near - 10]) {
                played.push(...play(game, 14, { ahead }));
                game.host.battle.place("p1", "town", game.at(off));
            }

            played.push(...play(game, 14, { ahead }));

            return { game, played };
        };
        const [made, unmade] = [walk(true), walk(false)];
        const stepOf = (played, type) => played.find(({ types }) => types.includes(type));

        for (const type of ["muster", "townsfolk"]) {
            assert.ok(stepOf(made.played, type), `(a ${type} step)`);
            assert.equal(stepOf(made.played, type).chunks, 0, `made ahead: the ${type} step makes no chunk`);
        }

        assert.ok(stepOf(unmade.played, "muster").chunks > 0, "not made ahead: the muster step makes its own ground");
        assert.ok(made.played.slice(1).every(({ chunks }) => chunks === 0), "nor any step after the first, made ahead");

        // (The same world either way: what happened in each step, and where everyone's got to)
        assert.deepEqual(made.played.map(({ types }) => types), unmade.played.map(({ types }) => types));
        assert.equal(encode(made.game.events), encode(unmade.game.events));
        assert.equal(made.game.host.checksum(), unmade.game.host.checksum());
        assert.equal(encode(made.game.host.snapshot()), encode(unmade.game.host.snapshot()));

        // (And the city's buildings, come to after the first look round, got ready as any are:
        // the look round's buildings in their order, kept till they change)
        const { game } = made;
        const middle = nearestFree(squaresOf(game.overworld), [Math.round(game.place.at[0]), Math.round(game.place.at[1])], { within: 40 });

        game.host.battle.place("p1", "town", middle);
        play(game, 12, { ahead: true });

        const opened = [...game.host.open.keys()].filter((key) => key.startsWith(`${CITY}:`));

        assert.ok(opened.length > 0, "its buildings near them opened");
        assert.deepEqual(opened, [...opened].sort(), "in the order of their keys");
    });
});

describe("a dungeon wanted soon (core/host.js soon, core/insides.js give)", () => {
    // A world with its player `off` metres from the first of the plan's dungeons out in the wilds
    // that can be come to so, what's round them made
    function delving(off) {
        const probe = buildWorld({ seed: 2 });
        const site = probe.plan.sites.find((each) => {
            if (each.kind !== "dungeon") {
                return false;
            }

            try {
                nearestFree(squaresOf(probe.maps.town), [Math.round(each.at[0] - 100), Math.round(each.at[1])], { within: 20 });

                return true;
            } catch {
                return false;
            }
        });
        const game = worldNear(site.id, off);

        play(game, 2, { ahead: true });

        return { ...game, site, key: `site:${site.id}`, building: game.world.interiors.buildings.get(`site:${site.id}`) };
    }

    it("is told once a player's within SOON.delve of its way in, as it will be made when they come to it", () => {
        const game = delving(SOON.delve - 50);
        const { host, site, key, building } = game;

        assert.ok(SOON.delve > DELVES.near + 60, "(well before it's made)");
        assert.ok(building && !building.made, "(set down, not made)");

        const [soon] = host.soon().dungeons;

        assert.deepEqual(Object.keys(soon), ["key", "seed", "theme", "tier", "generation"]);
        assert.equal(soon.key, key);

        // (Come to: made of just that)
        host.battle.place("p1", "town", game.at(DELVES.near - 15));
        play(game, 12, { ahead: true });
        assert.ok(building.made, "(made)");
        assert.deepEqual(dungeonFrom(building), { seed: soon.seed, theme: soon.theme, tier: soon.tier, generation: soon.generation });
        assert.equal(host.dungeons.get(site.id).tier, soon.tier);
        assert.deepEqual(host.soon().dungeons, [], "made: no longer wanted");
    });

    it("is made of what was worked out for it ahead, if that's what it's made from, and is the same dungeon either way", () => {
        const come = (give) => {
            const game = delving(SOON.delve - 50);
            const { host, key, building, world } = game;
            const [soon] = host.soon().dungeons;
            const given = give ? give(soon) : null;

            if (given) {
                world.interiors.give(key, given.from, given.dungeon);
                assert.equal(building.given.dungeon, given.dungeon, "(kept on its building)");
            }

            host.battle.place("p1", "town", game.at(DELVES.near - 15));
            play(game, 40, { ahead: true });
            assert.ok(building.made);
            assert.equal(building.given, null, "what was kept for it let go");

            return { game, given, building };
        };
        // (As a worker hands it over: a copy, none of it shared with anything here)
        const worked = (from) => ({ from, dungeon: structuredClone(buildDungeon({ seed: from.seed, theme: from.theme, tier: from.tier, generation: from.generation })) });
        const [plain, ahead, other] = [come(null), come(worked), come((soon) => worked({ ...soon, tier: soon.tier + 1 }))];

        assert.equal(ahead.building.dungeon, ahead.given.dungeon, "taken as it was given");
        assert.notEqual(other.building.dungeon, other.given.dungeon, "one worked out for another tier isn't");
        assert.deepEqual(ahead.building.dungeon, plain.building.dungeon);

        for (const one of [ahead, other]) {
            assert.equal(one.game.host.checksum(), plain.game.host.checksum());
            assert.equal(encode(one.game.host.snapshot()), encode(plain.game.host.snapshot()));
            assert.equal(encode(one.game.events), encode(plain.game.events));
        }

        // (Let go of when its finders have gone by: given none)
        const gone = delving(SOON.delve - 50);

        gone.world.interiors.give(gone.key, dungeonFrom(gone.building), {});
        gone.world.interiors.give(gone.key, null, null);
        assert.equal(gone.building.given, null);
    });
});
