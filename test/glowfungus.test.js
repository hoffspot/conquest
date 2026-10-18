// The glowing fungus an ants' nest's lit by (client/js/world/glowfungus.js; core/dungeons place.js
// puts its colonies on the walls: docs/DUNGEONS.md): each colony grown on the rock where the rock
// is, its caps and brackets on the wall and at its foot, in the open; glowing its own green, brightest
// under its caps; its light a room's light of its colour, breathing slowly; and its threads glowing
// in the earth round it, only near it
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { GLOW_LEAST } from "../client/js/core/dungeons/place.js";
import { allAtOnce } from "../client/js/core/steps.js";
import { cavern, SHELLS } from "../client/js/world/caverns.js";
import { colonyAt, colourOf, FUNGUS, glowOf, threadsOn } from "../client/js/world/glowfungus.js";

// The first levels of two nests, their rock drawn, and the colonies on each
const LEVELS = [3, 11].map((seed) => buildDungeon({ seed, theme: "nest", tier: 2 }).levels[0]);

// (sRGB to linear, as the colonies' colours are drawn)
const linear = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((byte) => ((byte / 255 + 0.055) / 1.055) ** 2.4);

describe("the glowing fungus an ants' nest's lit by (world/glowfungus.js)", () => {
    const grown = new Map();

    before(() => {
        for (const level of LEVELS) {
            const rock = (x, y) => level.rows[y][x] === "#";
            const made = allAtOnce(cavern(level.width, level.height, rock, SHELLS.nest, { seed: 7 }));
            const glows = level.lights.filter(({ kind }) => kind === "glow");

            grown.set(level, { made, glows, colonies: glows.map(({ at, wall }) => colonyAt(made.open, at, wall)) });
        }
    });

    it("grows each colony on the rock where it is, its middle on the wall at a hand's to a stride's height, the wall facing the open", () => {
        for (const level of LEVELS) {
            const { made, glows, colonies } = grown.get(level);

            assert.ok(colonies.length >= 8, `${colonies.length} colonies`);

            colonies.forEach(({ anchor, out }, k) => {
                const [x, y] = glows[k].at;
                const [dx, dy] = glows[k].wall;

                // (On the rock: neither in it nor out in the air)
                assert.ok(Math.abs(made.open(...anchor)) < 0.08, `${x}, ${y}: ${made.open(...anchor)}`);
                assert.ok(anchor[1] >= FUNGUS.high[0] - 0.01 && anchor[1] <= FUNGUS.high[1] + 0.01);
                // (On the wall towards which it's put, the open before it)
                assert.ok((anchor[0] - x - 0.5) * dx + (anchor[2] - y - 0.5) * dy > 0.3);
                assert.ok(out[0] * dx + out[2] * dy < 0, "facing the open");
                // (A little way out from it, in the open, and the further, the more)
                const off = (s) => made.open(anchor[0] + out[0] * s, anchor[1] + out[1] * s, anchor[2] + out[2] * s);

                assert.ok(off(0.3) > 0.05 && off(0.6) > off(0.3), `${x}, ${y}: ${off(0.3)}`);
            });
        }
    });

    it("puts its caps and brackets round its middle, on the wall and the floor at its foot, nearly all in the open", () => {
        for (const level of LEVELS) {
            const { made, colonies } = grown.get(level);

            for (const { anchor, positions, colours, indices } of colonies) {
                const points = positions.length / 3;
                let open = 0;

                assert.ok(indices.length >= 3 * 150 && indices.length % 3 === 0, `${indices.length / 3} triangles`);
                assert.equal(colours.length, positions.length);
                assert.ok(indices.every((index) => index < points));

                for (let p = 0; p < positions.length; p += 3) {
                    const [x, y, z] = [positions[p], positions[p + 1], positions[p + 2]];

                    assert.ok(Math.hypot(x - anchor[0], z - anchor[2]) < 1.3 && y > -0.05 && y < anchor[1] + 0.6, "near its middle, over the floor");
                    open += made.open(x, y, z) > -0.05 ? 1 : 0;
                }

                assert.ok(open / points > 0.96, `${open} of ${points} points in the open`);
                // (Some of it on the floor at the wall's foot)
                assert.ok(positions.some((value, p) => p % 3 === 1 && value < 0.08));
            }
        }
    });

    it("glows its own green, cold against the warm earth, dimmest at its stems and brightest under its caps", () => {
        for (const hex of FUNGUS.colours) {
            const [r, g, b] = linear(hex);

            assert.ok(g > r && g > b, hex.toString(16));
        }

        const { colonies } = grown.get(LEVELS[0]);
        const brightness = colonies.flatMap(({ colours }) => colours.filter((_, k) => k % 3 === 1));

        assert.ok(Math.min(...brightness) < 0.3 && Math.max(...brightness) > 0.9);
    });

    it("lights the earth round it as a room's light of its own colour, out from the wall, breathing slowly, steady else", () => {
        const level = LEVELS[0];
        const glow = level.lights.find(({ kind }) => kind === "glow");
        const light = glowOf(glow.at, glow.wall);

        assert.equal(light.kind, "glow");
        assert.equal(light.colour, colourOf(glow.at));
        assert.ok(FUNGUS.colours.includes(light.colour));
        assert.deepEqual([light.intensity, light.distance, light.flicker, light.rate], [FUNGUS.light.intensity, FUNGUS.light.distance, 0, 0]);
        assert.ok(light.breathe > 0 && light.breathe < 0.25 && light.pace < 3);
        assert.equal(light.y, FUNGUS.light.y);
        assert.ok(Math.abs(light.x - glow.at[0] - 0.5 - glow.wall[0] * FUNGUS.light.out) < 1e-9);
        assert.ok(Math.abs(light.z - glow.at[1] - 0.5 - glow.wall[1] * FUNGUS.light.out) < 1e-9);
        // (The same every time, as the colony's colour)
        assert.deepEqual(glowOf(glow.at, glow.wall), light);
    });

    it("glows faintly in patches in the earth round each colony, out to its threads' reach, and nowhere else", () => {
        const { made, colonies } = grown.get(LEVELS[1]);
        const glow = threadsOn(made.positions, colonies, 7);
        let near = 0;
        let lit = 0;

        assert.equal(glow.length, made.positions.length);

        for (let p = 0; p < made.positions.length; p += 3) {
            const at = [made.positions[p], made.positions[p + 1], made.positions[p + 2]];
            const nearest = Math.min(...colonies.map(({ anchor }) => Math.hypot(at[0] - anchor[0], at[1] - anchor[1], at[2] - anchor[2])));
            const glowing = glow[p] + glow[p + 1] + glow[p + 2] > 0;

            if (nearest > FUNGUS.threads.reach) {
                assert.ok(!glowing, `${at.map((v) => v.toFixed(2))}: ${nearest.toFixed(2)} m from a colony`);
            } else {
                near++;
                lit += glowing ? 1 : 0;
                // (Green, as the colony is, and never brighter than its threads glow)
                assert.ok(!glowing || glow[p + 1] >= glow[p]);
                assert.ok(glow[p + 1] <= Math.ceil(FUNGUS.threads.bright * 255 * 2));
            }
        }

        // (In patches: some of the earth near each glowing, not all of it)
        assert.ok(lit > 0 && lit < near, `${lit} of ${near}`);
    });

    it("never leaves a level dark through: as many colonies as GLOW_LEAST says for its rooms, however few each of its rooms has (place.js)", () => {
        for (let seed = 1; seed <= 40; seed++) {
            for (const level of buildDungeon({ seed, theme: "nest", tier: 1 + (seed % 7), levels: 3 }).levels) {
                const glows = level.lights.filter(({ kind }) => kind === "glow");

                assert.ok(glows.length >= Math.ceil(level.rooms.length * GLOW_LEAST), `${seed}/${level.index}: ${glows.length} colonies in ${level.rooms.length} rooms`);
            }
        }
    });
});
