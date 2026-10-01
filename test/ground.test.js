// The ground the world is played on (client/js/core/terrain/ground.js): the land's height with
// the settlements, castles, places and camps on pads and the roads levelled in, read between each
// metre's corners as it's drawn
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildWorld, CHUNK } from "../client/js/core/overworld.js";
import { squareOf } from "../client/js/core/settlements.js";
import { between, CORNERS } from "../client/js/core/terrain/ground.js";
import { heightAt, SLOPE_CLASS } from "../client/js/core/terrain/height.js";
import { GROUND } from "../client/js/core/setpieces/pieces.js";

let world;
let overworld;

describe("the ground (terrain/ground.js)", () => {
    before(() => {
        world = buildWorld({ seed: 1 });
        overworld = world.maps.town;
    });

    it("stands at its corners' heights, and between them over each square's two triangles", () => {
        const heights = new Float32Array(CORNERS * CORNERS).map((_, k) => (k % CORNERS) * 0.5 + Math.floor(k / CORNERS) * 0.25);

        assert.equal(between(heights, 3, 5), 3 * 0.5 + 5 * 0.25);
        // (A plane is read exactly anywhere)
        assert.ok(Math.abs(between(heights, 3.3, 5.8) - (3.3 * 0.5 + 5.8 * 0.25)) < 1e-9);

        // (Each square split from its north-west corner to its south-east: a ridge along it)
        const ridge = new Float32Array(CORNERS * CORNERS);

        ridge[0] = ridge[CORNERS + 1] = 1;
        assert.equal(between(ridge, 0.5, 0.5), 1);
        assert.equal(between(ridge, 0.9, 0.1), 0.9 * 0 + 1 - 0.9 + 0.1 * 1);
    });

    it("sets the town, and every settlement, castle and camp near it, on a level pad", () => {
        const { at, width, height } = world.stamp;
        const town = new Set();

        for (let y = at[1]; y <= at[1] + height; y += 4) {
            for (let x = at[0]; x <= at[0] + width; x += 4) {
                town.add(overworld.heightAt(x, y));
            }
        }

        assert.equal(town.size, 1, "the town is level");

        // (The nearest few other settlements: flat across their squares)
        const near = overworld.settlements.places
            .map((place) => [Math.hypot(place.at[0] - at[0], place.at[1] - at[1]), place])
            .sort(([a], [b]) => a - b)
            .slice(0, 3);

        for (const [, place] of near) {
            const { at: [sx, sy], size } = squareOf(place);
            const levels = new Set([0.1, 0.5, 0.9].flatMap((u) => [0.1, 0.5, 0.9].map((v) => overworld.heightAt(sx + u * size, sy + v * size))));

            assert.equal(levels.size, 1, `${place.id} is level`);
        }
    });

    it("keeps the roads out of town gentle, rising and falling smoothly with the land", () => {
        let [samples, steepest] = [0, 0];

        for (const segments of overworld.roads.values()) {
            for (const [ax, ay, bx, by, , , joined] of segments.slice(0, 20)) {
                if (joined || overworld.settled(Math.floor(ax), Math.floor(ay))) {
                    continue;
                }

                const length = Math.hypot(bx - ax, by - ay);

                for (let d = 0; d + 1 <= length; d += 1) {
                    const [x0, y0] = [ax + ((bx - ax) * d) / length, ay + ((by - ay) * d) / length];
                    const [x1, y1] = [ax + ((bx - ax) * (d + 1)) / length, ay + ((by - ay) * (d + 1)) / length];
                    // (Bridges' decks arch over their rivers: their own test's below)
                    const onBridge = ([x, y]) => {
                        const chunk = overworld.chunkAt(Math.floor(x), Math.floor(y));

                        return chunk.bridge[(Math.floor(y) - chunk.y0) * CHUNK + (Math.floor(x) - chunk.x0)];
                    };

                    if (onBridge([x0, y0]) || onBridge([x1, y1])) {
                        continue;
                    }

                    const [h0, h1] = [overworld.heightAt(x0, y0), overworld.heightAt(x1, y1)];

                    steepest = Math.max(steepest, Math.abs(h1 - h0));
                    samples++;
                }
            }

            if (samples > 3000) {
                break;
            }
        }

        assert.ok(samples > 500, `${samples} samples`);
        // (A rise of 3 in 10 at the very most, a metre at a time, along the roads as planned; the
        // mountain roads are graded and zig-zagged later)
        assert.ok(steepest < 0.3, `steepest ${steepest}`);
    });

    it("blocks ground too steep to climb, but never the roads or what's built", () => {
        const [cx, cy] = [Math.floor(world.stamp.at[0] / CHUNK), Math.floor(world.stamp.at[1] / CHUNK)];
        let cliffs = 0;

        for (let y = cy - 6; y <= cy + 6; y++) {
            for (let x = cx - 6; x <= cx + 6; x++) {
                const chunk = overworld.chunk(x, y);

                for (let k = 0; k < CHUNK * CHUNK; k++) {
                    if (chunk.slopes[k] === SLOPE_CLASS.cliff) {
                        cliffs++;

                        if (chunk.ground[k] !== GROUND.road && !chunk.bridge[k] && !overworld.settled(chunk.x0 + (k % CHUNK), chunk.y0 + Math.floor(k / CHUNK))) {
                            assert.equal(chunk.blocked[k], 1);
                        }
                    }
                }
            }
        }

        assert.ok(cliffs > 0, "some cliffs near the town");
    });

    it("carries bridges over their rivers, their decks above the water", () => {
        let bridges = 0;

        for (const segments of overworld.roads.values()) {
            for (const line of new Set(segments.map((segment) => segment[5]))) {
                for (const { a, b } of line.bridges ?? []) {
                    const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                    const river = overworld.waters.river(...middle, 20);

                    overworld.chunkAt(Math.floor(middle[0]), Math.floor(middle[1]));

                    if (river && overworld.chunkAt(Math.floor(middle[0]), Math.floor(middle[1])).bridge[(Math.floor(middle[1]) % CHUNK) * CHUNK + (Math.floor(middle[0]) % CHUNK)]) {
                        assert.ok(overworld.heightAt(...middle) >= river.surface + 0.99, "the deck's over the water");
                        assert.ok(heightAt(world.plan, ...middle) < river.surface, "the land under it isn't");
                        bridges++;
                    }
                }
            }

            if (bridges > 5) {
                break;
            }
        }

        assert.ok(bridges > 0, "some bridges");
    });
});
