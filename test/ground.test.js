// The ground the world is played on (client/js/core/terrain/ground.js): the land's height with
// the settlements, castles, places and camps on pads and the roads levelled in, read between each
// metre's corners as it's drawn
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildWorld, CHUNK } from "../client/js/core/overworld.js";
import { squareOf } from "../client/js/core/settlements.js";
import { between, CORNERS, GRADE, PAD_TILT } from "../client/js/core/terrain/ground.js";
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

    it("lays the town and every settlement near it on a plane lying with the land, no steeper than it may", () => {
        const { at, width, height } = world.stamp;
        // (A pad's own heights: its middle's level, rising as it tilts)
        const onPlane = (pad, x, y) => {
            const [gx, gy] = overworld.ground.tiltOf(pad);

            return overworld.ground.levelOf(pad) + gx * (x - (pad.x0 + pad.x1) / 2) + gy * (y - (pad.y0 + pad.y1) / 2);
        };
        const pads = [{ id: "town", x0: at[0], y0: at[1], x1: at[0] + width, y1: at[1] + height, tilt: true }];

        // (The nearest few other settlements)
        for (const [, place] of overworld.settlements.places
            .map((place) => [Math.hypot(place.at[0] - at[0], place.at[1] - at[1]), place])
            .sort(([a], [b]) => a - b)
            .slice(0, 3)) {
            const { at: [sx, sy], size } = squareOf(place);

            pads.push({ id: `place ${place.id}`, x0: sx, y0: sy, x1: sx + size, y1: sy + size, tilt: place.race !== "lizard" });
        }

        for (const pad of pads) {
            const [gx, gy] = overworld.ground.tiltOf(pad);

            assert.ok(Math.hypot(gx, gy) <= PAD_TILT + 1e-9, `${pad.id} tilts ${Math.hypot(gx, gy).toFixed(3)}`);

            for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
                for (const v of [0.1, 0.3, 0.5, 0.7, 0.9]) {
                    const [x, y] = [pad.x0 + u * (pad.x1 - pad.x0), pad.y0 + v * (pad.y1 - pad.y0)];

                    assert.ok(Math.abs(overworld.heightAt(x, y) - onPlane(pad, x, y)) < 0.01, `${pad.id} at ${x.toFixed(0)}, ${y.toFixed(0)}`);
                }
            }
        }
    });

    it("keeps every road and trail near the town to its grade, from end to end, and every square along it walkable", () => {
        const [mx, my] = world.stamp.middle;
        const lines = new Set([...overworld.roads.values()].flatMap((segments) => segments.filter((segment) => !segment[6]).map((segment) => segment[5])));
        const steepest = {};
        let samples = 0;

        for (const line of lines) {
            let last = null;

            for (let k = 1; k < line.planned.length; k++) {
                const [[ax, ay], [bx, by]] = [line.planned[k - 1], line.planned[k]];
                const run = Math.hypot(bx - ax, by - ay);

                for (let d = 0; d < run; d += 1) {
                    const [x, y] = [ax + ((bx - ax) * d) / run, ay + ((by - ay) * d) / run];
                    const chunk = overworld.chunkAt(Math.floor(x), Math.floor(y));
                    const square = (Math.floor(y) - chunk.y0) * CHUNK + (Math.floor(x) - chunk.x0);

                    // (Within 640 m of the town; its own streets and the settlements' aside)
                    if (Math.hypot(x - mx, y - my) > 640 || overworld.settled(Math.floor(x), Math.floor(y))) {
                        last = null;
                        continue;
                    }

                    assert.equal(chunk.blocked[square], 0, `walkable at ${Math.floor(x)}, ${Math.floor(y)}`);
                    samples++;

                    // (Bridges' decks arch over their rivers: their own test's below)
                    if (chunk.bridge[square]) {
                        last = null;
                        continue;
                    }

                    const h = overworld.heightAt(x, y);

                    if (last && Math.hypot(x - last[0], y - last[1]) >= 2) {
                        steepest[line.kind] = Math.max(steepest[line.kind] ?? 0, Math.abs(h - last[2]) / Math.hypot(x - last[0], y - last[1]));
                        last = [x, y, h];
                    } else if (!last) {
                        last = [x, y, h];
                    }
                }
            }
        }

        assert.ok(samples > 2000, `${samples} samples`);

        // (Each kind of road no steeper than its grade, but for a little between the ground's
        // corners; a trail up into the hills no steeper than its stone steps, but for a step or
        // two where a hairpin's legs come together: trails.test.js)
        for (const [kind, grade] of Object.entries(steepest)) {
            assert.ok(grade <= (kind === "path" ? GRADE.steps + 0.1 : GRADE[kind] + 0.02), `${kind}: ${grade.toFixed(3)}`);
        }
    });

    it("has neighbouring chunks agree on the corners they share, all over the trails near the town and their roads' banks", () => {
        const [mx, my] = world.stamp.middle;
        const chunks = new Set();

        // (The chunks under the trails up to the sites within a kilometre of the town)
        for (const { box } of overworld.trails.all.filter(({ to: [x, y] }) => Math.hypot(x - mx, y - my) < 1000)) {
            for (let cy = Math.floor(box[1] / CHUNK); cy <= Math.floor(box[3] / CHUNK); cy++) {
                for (let cx = Math.floor(box[0] / CHUNK); cx <= Math.floor(box[2] / CHUNK); cx++) {
                    chunks.add(`${cx},${cy}`);
                }
            }
        }

        assert.ok(chunks.size > 40, `${chunks.size} chunks`);
        let shared = 0;

        for (const key of chunks) {
            const [cx, cy] = key.split(",").map(Number);
            const heights = overworld.ground.chunk(cx, cy).heights;
            const [east, south] = [overworld.ground.chunk(cx + 1, cy).heights, overworld.ground.chunk(cx, cy + 1).heights];

            for (let k = 0; k < CORNERS; k++) {
                assert.equal(heights[k * CORNERS + CHUNK], east[k * CORNERS], `at ${(cx + 1) * CHUNK}, ${cy * CHUNK + k}`);
                assert.equal(heights[CHUNK * CORNERS + k], south[k], `at ${cx * CHUNK + k}, ${(cy + 1) * CHUNK}`);
                shared += 2;
            }
        }

        assert.ok(shared > 5000, `${shared} corners`);
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
