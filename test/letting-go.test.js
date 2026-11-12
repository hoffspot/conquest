// The ground of players gone, let go a little each look (generated/multiplayer_scaling_plan.md
// 1-27): the look after the players of a town have left, the world was told to keep only what
// those still in want and let every chunk over that go at once, with its heights, and the
// navigation, told to keep fewer tiles, let all it had over that go as the next was added, in a
// step as likely as not. Now a world server lets go 16 chunks and 32 tiles a pump (server/ahead.js
// AHEAD.ease; client/js/core/navigation.js shed, gently). None of it is what a step works out: a
// chunk or a tile kept a while longer is the one a step would make again. What's checked here is
// that the world is the same step for step either way (Ahead.easing), and how much is let go in
// which pump: counts, never times.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host } from "../client/js/core/host.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { buildWorld, CHUNK, KEEP } from "../client/js/core/overworld.js";
import { WorldRunner } from "../client/js/core/runner.js";
import { encode } from "../client/js/core/wire.js";
import { AHEAD, Ahead } from "../server/ahead.js";

const HERO = Object.freeze({ name: "Ada", race: "human", shape: {}, look: {}, weapon: "sword", boots: false });

describe("the ground of players gone let go a little each look (server/ahead.js AHEAD.ease, core/navigation.js shed)", () => {
    const PLAYERS = 6;
    // (How often what's wanted is made, and what isn't let go, between two steps: a world
    // server looks at its world twice a step)
    const PUMPS = 2;
    const [WARM, GONE, BACK] = [60, 120, 60];

    // Six players each in a town of their own, far apart, the ground round each made and its
    // navigation baked as a world server makes them; then all but the first leave in the one
    // step, the first walking on, and after a while one comes back to where they were. Each
    // look: the step's events and the world's sum after it, and what was let go of the ground
    // in the step and in each pump after it
    function leaving(easing) {
        Ahead.easing = easing;

        try {
            const world = buildWorld({ seed: 2 });
            const overworld = world.maps.town;
            const navigation = navigatorOf(overworld);
            const host = new Host(world, { populate: false });
            const runner = new WorldRunner(host);
            const towns = [];

            for (const place of world.plan.places) {
                if (["city", "town"].includes(place.kind) && towns.length < PLAYERS && towns.every((other) => Math.hypot(place.at[0] - other.at[0], place.at[1] - other.at[1]) > 800)) {
                    towns.push(place);
                }
            }

            assert.equal(towns.length, PLAYERS);

            const middle = (place) => nearestFree(squaresOf(overworld), [Math.round(place.at[0]), Math.round(place.at[1])], { within: 40 });
            const squares = towns.map(middle);
            const hero = (k) => ({ ...HERO, race: towns[k].race ?? "human" });

            // (Six players' tiles are fewer than the navigation keeps whoever's in, KEEP_TILES,
            // so here it's let keep as few as it's told: or none would ever be let go)
            navigation.least = 16;

            let ticks = 0;
            let dropped = 0;
            const drop = navigation.drop.bind(navigation);
            const maker = new Ahead(world, { host, clock: () => ticks++ });

            navigation.drop = (...tile) => {
                dropped++;

                return drop(...tile);
            };

            squares.forEach((square, k) => host.join({ id: `p${k + 1}`, hero: hero(k), square, map: "town" }));
            host.populate();

            // (The ground round each made first, as the world server's would be by now: the
            // chunks AHEAD.chunks each way. The world keeps as many as that from the first look)
            overworld.keep(1024);

            for (const [x, y] of squares) {
                for (let dy = -AHEAD.chunks; dy <= AHEAD.chunks; dy++) {
                    for (let dx = -AHEAD.chunks; dx <= AHEAD.chunks; dx++) {
                        overworld.chunk(Math.floor(x / CHUNK) + dx, Math.floor(y / CHUNK) + dy);
                    }
                }
            }

            const played = [];
            const play = (looks) => {
                for (let k = 0; k < looks; k++) {
                    const look = { events: null, sum: 0, chunks: overworld.chunks.size, tiles: 0, added: 0, pumps: [] };
                    const [fell, added] = [dropped, navigation.added];

                    if (played.length % 20 === 5) {
                        const me = host.battle.actor("p1");

                        host.battle.command("p1", { type: "move", to: [me.square[0] + (played.length % 40 === 5 ? 14 : -14), me.square[1]] });
                    }

                    runner.advance(STEP_MS, { after: (events) => (look.events = events) });
                    Object.assign(look, { sum: host.checksum(), chunks: Math.max(0, look.chunks - overworld.chunks.size), tiles: dropped - fell, added: navigation.added - added });

                    for (let pump = 0; pump < PUMPS; pump++) {
                        const [had, let_, more] = [overworld.chunks.size, dropped, navigation.added];

                        runner.bakeAhead(maker);
                        look.pumps.push({ chunks: Math.max(0, had - overworld.chunks.size), tiles: dropped - let_, added: navigation.added - more });
                    }

                    played.push(look);
                }
            };
            const has = () => ({ chunks: overworld.chunks.size, kept: overworld.kept, tiles: navigation.tiles.size, keep: navigation.keep, dropped });
            const tileOf = ([x, y]) => [Math.floor(x / navigation.measures.tile), Math.floor(y / navigation.measures.tile)];

            play(WARM);

            const before = has();
            const theirs = squares.slice(1).filter((square) => navigation.has(...tileOf(square))).length;

            for (let k = 1; k < PLAYERS; k++) {
                host.leave(`p${k + 1}`);
            }

            play(GONE);

            const after = has();
            const stillTheirs = squares.slice(1).filter((square) => navigation.has(...tileOf(square))).length;

            host.join({ id: "p2", hero: hero(1), square: squares[1], map: "town" });
            play(BACK);
            maker.dispose();

            return { played, before, after, theirs, stillTheirs, eased: maker.eased, snapshot: encode(host.snapshot()), end: has() };
        } finally {
            Ahead.easing = true;
        }
    }

    it("lets go no more than a few chunks and tiles a pump where it let them all go at once, and the world's the same after every step", () => {
        const [eased, sudden] = [leaving(true), leaving(false)];
        const gone = (run) => run.played.slice(WARM, WARM + GONE);
        const most = (run, key) => Math.max(...gone(run).flatMap(({ pumps }) => pumps.map((pump) => pump[key])));
        const sum = (run, key) => gone(run).reduce((total, look) => total + look.pumps.reduce((pumped, pump) => pumped + pump[key], 0), 0);

        // (The same world either way, step for step, as the others went and as one came back)
        assert.equal(eased.played.length, WARM + GONE + BACK);
        assert.deepEqual(eased.played.map(({ sum: checksum }) => checksum), sudden.played.map(({ sum: checksum }) => checksum), "the world's sum after every step");
        assert.equal(encode(eased.played.map(({ events }) => events)), encode(sudden.played.map(({ events }) => events)), "and every step's events");
        assert.equal(eased.snapshot, sudden.snapshot);
        assert.ok(new Set(eased.played.map(({ sum: checksum }) => checksum)).size > WARM, "(and it went on changing)");

        // (Before they went, the same: six towns' ground and navigation, more than the world
        // and its mesh keep at the least, and a tile under every one of the five who'll go)
        assert.deepEqual(eased.before, sudden.before);
        assert.ok(eased.before.chunks > KEEP + AHEAD.ease.chunks, `${eased.before.chunks} chunks`);
        assert.ok(eased.before.tiles > 121 + AHEAD.spareTiles + AHEAD.ease.tiles, `${eased.before.tiles} tiles`);
        assert.deepEqual([eased.theirs, sudden.theirs], [PLAYERS - 1, PLAYERS - 1]);

        // (As it was: every chunk no longer wanted let go in the one pump, and the mesh left
        // holding every tile till the next was added, then letting all go together)
        assert.ok(most(sudden, "chunks") > AHEAD.ease.chunks, `${most(sudden, "chunks")} chunks in one pump`);
        assert.equal(sum(sudden, "chunks"), most(sudden, "chunks"));
        assert.deepEqual(sudden.eased, { chunks: 0, tiles: 0 });

        // (Now: AHEAD.ease.chunks a pump at the most, till as many are let go as were; and of
        // the tiles AHEAD.ease.tiles, and one for each added besides. No step lets go of more
        // tiles than it added)
        assert.ok(most(eased, "chunks") <= AHEAD.ease.chunks && most(eased, "chunks") > 0, `${most(eased, "chunks")} chunks in one pump`);
        assert.equal(sum(eased, "chunks"), sum(sudden, "chunks"), "as many let go in all");
        assert.ok(gone(eased).filter(({ pumps }) => pumps.some(({ chunks }) => chunks > 0)).length >= sum(eased, "chunks") / (PUMPS * AHEAD.ease.chunks), "over as many looks as that takes");
        assert.ok(gone(eased).every(({ pumps }) => pumps.every(({ tiles, added }) => tiles <= AHEAD.ease.tiles + added)), "tiles: no pump more than its share");
        assert.ok(eased.played.every(({ tiles, added }) => tiles <= added), "nor any step more than it added");
        assert.ok(eased.eased.tiles > AHEAD.ease.tiles, `${eased.eased.tiles} tiles shed`);
        assert.equal(eased.eased.chunks, sum(eased, "chunks"));

        // (And then it's kept what it's to keep: as many chunks as the world's told, the same
        // either way; no more tiles than the mesh is told, those under the five who went among
        // those let go. As it was, the mesh still held them all, no tile having been added)
        assert.deepEqual([eased.after.kept, eased.after.keep], [sudden.after.kept, sudden.after.keep]);
        assert.ok(eased.after.chunks <= eased.after.kept && sudden.after.chunks <= sudden.after.kept);
        assert.ok(eased.after.tiles <= eased.after.keep, `${eased.after.tiles} tiles kept of ${eased.after.keep}`);
        assert.equal(eased.before.tiles - eased.after.tiles, eased.after.dropped - eased.before.dropped);
        assert.ok(eased.stillTheirs < PLAYERS - 1, `${eased.stillTheirs} of the five still have a tile under where they stood`);
    });
});
