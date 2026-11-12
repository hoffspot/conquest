// A hero a world keeps for its player, come back to ground that's changed under them
// (generated/multiplayer_scaling_plan.md F-6). A kept hero carries where they stood
// (server/storage/heroes.js, Host.placeOf), and nothing in what's kept says which ground that was
// on: TERRAIN_VERSION guards two games playing together, not a save. So after a change to the
// land a seed makes, a hero may be kept in what's now water, rock or a wall. Host.join is the one
// guard there is: this holds it to landing them on ground that can be stood on, near where they
// were if there's any within 8 squares, else where a newcomer of their people comes in.
//
// The fixture (test/fixtures/kept-heroes) is a hero as a world server keeps one, of a world of
// seed 3: Host.leave's character with placeOf and vitalsOf, kept by KeptHeroes.keep.
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { STEP_MS } from "../client/js/core/battle.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { Host } from "../client/js/core/host.js";
import { spawnFor } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { KeptHeroes } from "../server/storage/heroes.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "kept-heroes");

// How far from where they were a hero may be set down (Host.join's nearestFree)
const WITHIN = 8;

describe("a kept hero coming back to ground that's changed (core/host.js Host.join)", () => {
    it("lands on ground that can be stood on: where they were if it still can be, near it if anything within 8 squares can, else where a newcomer comes in", async () => {
        const kept = await new KeptHeroes(FIXTURES).get("p-ada", 1);

        assert.ok(kept, "the fixture: a hero kept for the player p-ada, slot 1");
        assert.deepEqual([kept.place.x, kept.place.y, kept.place.facing].map(Number.isFinite), [true, true, true], "kept with where they stood");

        const world = buildWorld({ seed: 3 });
        const host = new Host(world, { populate: false });
        const land = world.maps?.town ?? world;
        const squares = squaresOf(land);
        const standable = ([x, y]) => !squares.blocked(x, y) && (!squares.roomy || squares.roomy(x, y));
        const [sx, sy] = world.spawns.player;

        // A hero comes in as kept, but for where they stood (as the world server brings one in:
        // core/netplay.js Hosting #hello); where they then stand, and they leave again
        let next = 1;
        const comeBack = (place) => {
            const id = `guest-${next++}`;

            host.join({ id, ...kept, place, ...spawnFor(world, kept.hero.race), role: "player" });

            const actor = host.battle.actor(id);
            const stood = { square: [...actor.square], x: actor.x, y: actor.y, facing: actor.facing, map: actor.map };

            // (And the world plays on with them standing there)
            host.advance(STEP_MS);
            assert.ok(standable(host.battle.actor(id).square), `still on ground after a step, from ${place?.x},${place?.y}`);
            host.leave(id);

            return stood;
        };

        // Ground unchanged: just where they were, facing as they were
        const same = comeBack(kept.place);

        assert.ok(standable([Math.floor(kept.place.x), Math.floor(kept.place.y)]), "the fixture's place is ground in today's world of seed 3: make the fixture again if the land's changed");
        assert.deepEqual([same.x, same.y, same.facing, same.map], [kept.place.x, kept.place.y, kept.place.facing, "town"]);

        // Ground changed under them: every square of a grid over the land round the start that
        // can't be stood on today (water, rock, walls), as if they'd been kept there before it
        // was. Told apart by whether anything near can be stood on
        const newcomer = comeBack(null);
        const near = [];
        const far = [];

        for (let dy = -600; dy <= 600; dy += 50) {
            for (let dx = -600; dx <= 600; dx += 50) {
                const square = [sx + dx, sy + dy];

                if (standable(square)) {
                    continue;
                }

                try {
                    nearestFree(land, square, { within: WITHIN });
                    near.push(square);
                } catch {
                    far.push(square);
                }
            }
        }

        assert.ok(near.length >= 3 && far.length >= 3, `ground of both kinds to try (${near.length} with footing near, ${far.length} with none)`);

        for (const [x, y] of near) {
            const stood = comeBack({ x: x + 0.5, y: y + 0.5, facing: 1 });

            assert.equal(stood.map, "town");
            assert.ok(standable(stood.square), `on ground, kept at ${x},${y}: stood at ${stood.square}`);
            assert.ok(Math.max(Math.abs(stood.square[0] - x), Math.abs(stood.square[1] - y)) <= WITHIN, `within ${WITHIN} squares of ${x},${y}: stood at ${stood.square}`);
        }

        for (const [x, y] of far) {
            const stood = comeBack({ x: x + 0.5, y: y + 0.5, facing: 1 });

            assert.equal(stood.map, "town");
            assert.ok(standable(stood.square), `on ground, kept at ${x},${y}: stood at ${stood.square}`);
            assert.deepEqual(stood.square, newcomer.square, `where a newcomer comes in, kept at ${x},${y} with no footing near`);
        }

        // Kept somewhere there's no land at all (off the world's edge), or nowhere that's a place
        for (const place of [{ x: -500.5, y: -500.5, facing: 0 }, { x: 1e9, y: 4000, facing: 0 }, { x: Number.NaN, y: 4000, facing: 0 }, { x: 4000, y: 4000 }]) {
            const stood = comeBack(place);

            assert.ok(standable(stood.square), `on ground, kept at ${place.x},${place.y}`);
            assert.deepEqual(stood.square, newcomer.square);
        }
    });
});
