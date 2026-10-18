// A hell's molten rock (world/lava.js: docs/DUNGEONS.md *Hells*): the Breach's pools of lava,
// each lying in its squares against the rock, hot in the middle and cooled at its bank, the rock
// and floor round it lit by its glow; and the Breach's rock, sulphur low down, soot high up, embers
// in its cracks
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { readPlan } from "../client/js/core/interiors.js";
import { BRIMSTONE, brimstoneTone, embersOn, LAVA, lavaMaterial, outOfPool, poolGeometries, poolGlowOn, poolLight, poolRim, poolShape } from "../client/js/world/lava.js";

const THREE = await import("three");

// (The Breach's levels, each its pools of lava: their pieces of the plan, and the way to the rock
// beside the most of each one's squares)
const BREACHES = [11, 12, 13, 14].map((seed) => {
    const level = buildDungeon({ seed, theme: "hell", tier: 9 }).levels[0];
    const map = readPlan(`breach-${seed}`, "The Breach", level.rows);
    const rock = (x, y) => map.plan[y]?.[x] === "#";
    const pools = map.pieces
        .filter(({ kind }) => kind === "lava")
        .map((piece) => {
            const [way, count] = [[0, -1], [-1, 0], [1, 0], [0, 1]].map((side) => [side, piece.squares.filter(([x, y]) => rock(x + side[0], y + side[1])).length]).sort((a, b) => b[1] - a[1])[0];

            return { piece, wall: count > 0 ? way : null, shape: poolShape(piece, count > 0 ? way : null) };
        });

    return { seed, level, map, pools };
});

describe("the Breach's pools of lava (world/lava.js poolShape, poolGeometries)", () => {
    it("are on every level of the Breach, each lying against the rock, every open square still walked to", () => {
        for (const { seed, pools, level } of BREACHES) {
            assert.ok(pools.length >= 2, `seed ${seed}: ${pools.length} pools`);
            assert.ok(pools.every(({ wall }) => wall !== null), `seed ${seed}: a pool not against the rock`);

            // (Every open square reached from the way in, walking round the pools)
            const open = (x, y) => level.rows[y]?.[x] === "." || level.rows[y]?.[x] === "D";
            const start = [...level.rows.join("")].findIndex((c) => c === "D");
            const seen = new Set([start]);
            const queue = [start];

            while (queue.length) {
                const k = queue.pop();
                const [x, y] = [k % level.width, Math.floor(k / level.width)];

                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const j = (y + dy) * level.width + x + dx;

                    if (open(x + dx, y + dy) && !seen.has(j)) {
                        seen.add(j);
                        queue.push(j);
                    }
                }
            }

            const opens = [...level.rows.join("")].filter((c) => c === "." || c === "D").length;

            assert.equal(seen.size, opens, `seed ${seed}: an open square cut off`);
        }
    });

    it("lie within their squares, reaching in only under the rock they lie against", () => {
        const { under, sides } = LAVA.pool;

        for (const { pools } of BREACHES) {
            for (const { piece, wall, shape } of pools) {
                assert.equal(shape.rim.length, sides);

                // (Their rims, every point: within their squares, but in under the rock)
                const out = (side) => (wall && wall[0] === side[0] && wall[1] === side[1] ? under : 0);

                for (const [px, pz] of poolRim(shape)) {
                    assert.ok(px >= piece.x - out([-1, 0]) && px <= piece.x + piece.w + out([1, 0]), `x ${px.toFixed(2)} in ${piece.x}+${piece.w}`);
                    assert.ok(pz >= piece.y - out([0, -1]) && pz <= piece.y + piece.h + out([0, 1]), `z ${pz.toFixed(2)} in ${piece.y}+${piece.h}`);
                }

                // (Their middles shifted towards the rock they lie against)
                assert.ok((shape.x - (piece.x + piece.w / 2)) * wall[0] >= 0 && (shape.z - (piece.y + piece.h / 2)) * wall[1] >= 0);
                assert.ok([1, -1].includes(shape.spin));
            }
        }
    });

    it("are hot in their middles and cooled at their banks, their crust turning; their banks standing up round them, glowing on the inside", () => {
        const pools = BREACHES[0].pools.map(({ shape }) => shape);
        const { surface, bank } = poolGeometries(pools);
        const heat = surface.attributes.heat.array;
        const lava = surface.attributes.lava.array;

        // (Each pool's middle all heat; its rim none; hotter the further in)
        for (let k = 0; k < heat.length; k++) {
            const [lx, lz] = [lava[k * 2], lava[k * 2 + 1]];

            if (lx === 0 && lz === 0) {
                assert.equal(heat[k], 1);
            }

            assert.ok(heat[k] >= 0 && heat[k] <= 1);
        }

        assert.ok(heat.some((h) => h === 0) && heat.filter((h) => h === 1).length === pools.length);
        assert.ok([...surface.attributes.spin.array].every((spin) => spin === 1 || spin === -1));

        // (Its surface faces up, its bank stands up round it and faces up and out, glowing on the
        // inside, dark outside)
        surface.computeVertexNormals();
        assert.ok([...surface.attributes.normal.array].filter((_, k) => k % 3 === 1).every((ny) => ny > 0.99));

        const ny = [...bank.attributes.normal.array].filter((_, k) => k % 3 === 1);
        const glow = bank.attributes.glow.array;
        const lit = [...glow].filter((_, k) => k % 3 === 0);
        const sides = LAVA.pool.sides;

        assert.ok(ny.reduce((sum, y) => sum + y, 0) / ny.length > 0.5);
        assert.ok(lit.slice(0, sides).every((r) => r > 50) && lit.slice(sides * 2, sides * 3).every((r) => r < 10));
        assert.ok(Math.max(...bank.attributes.position.array.filter((_, k) => k % 3 === 1)) <= LAVA.bank.high * 1.5 + 1e-6);
    });

    it("light the rock and floor round them: brightest at the rim, none beyond its reach, less on the floor than up the walls by them", () => {
        const pool = poolShape({ x: 10, y: 10, w: 2, h: 2 }, [0, -1]);
        const { reach } = LAVA.glow;
        const at = (x, y, z, up = 0) => poolGlowOn(new Float32Array([x, y, z]), [pool], null, new Float32Array([0, up, 0]))[0];
        const rim = pool.x + pool.rx;

        assert.ok(at(rim + 0.05, 0.6, pool.z) > at(rim + 1, 0.6, pool.z));
        assert.ok(at(rim + 1, 0.6, pool.z) > at(rim + 2, 0.6, pool.z));
        assert.equal(at(rim + reach + 0.1, 0.6, pool.z), 0);
        assert.ok(at(rim + 0.5, 0.6, pool.z) > at(rim + 0.5, 0.6, pool.z, 1), "the floor less");
        assert.ok(at(rim + 0.5, 0.6, pool.z) > at(rim + 0.5, 2.4, pool.z), "less higher up");
        assert.ok(outOfPool(pool, pool.x, pool.z) < 0 && Math.abs(outOfPool(pool, rim, pool.z)) < 1e-9);

        // (Each its own light, over its middle)
        assert.deepEqual([poolLight(pool).x, poolLight(pool).z, poolLight(pool).kind], [pool.x, pool.z, "lava"]);
    });

    it("are drawn with one material, worked out as it's drawn by the veils' clock, casting no shadow", () => {
        const material = lavaMaterial();
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };

        assert.equal(lavaMaterial(), material);
        material.onBeforeCompile(shader);
        assert.ok(shader.uniforms.veilTime && shader.uniforms.lavaDetail);
        assert.match(shader.vertexShader, /attribute vec2 lava;/);
        assert.match(shader.fragmentShader, /vec4 diffuseColor = vec4\( lavaAt\(\), opacity \);/);
        assert.equal(material.userData.shadow, false);
    });
});

describe("the Breach's rock (world/lava.js brimstoneTone, embersOn)", () => {
    const tint = [0.1, 0.07, 0.05];

    it("is crusted with sulphur in patches low down, yellower than the rock; sooted darker higher up; on the floor, sulphur only near a pool", () => {
        const pool = poolShape({ x: 10, y: 10, w: 2, h: 2 }, null);
        let yellow = 0;
        let points = 0;

        for (let x = 0; x < 40; x += 0.7) {
            for (let z = 0; z < 40; z += 0.7) {
                const [r, g, b] = brimstoneTone(x, 0.3, z, 5, tint);

                points += 1;

                if (g * tint[1] > r * tint[0] * 0.6 && g > 1.3) {
                    yellow += 1;
                    assert.ok(b < g, "yellow");
                }

                // (Higher up, sooted: never sulphur, darker towards the roof)
                const high = brimstoneTone(x, 4.5, z, 5, tint);

                assert.ok(high[0] < 0.75 && high[0] === high[1] && high[1] === high[2]);
            }
        }

        assert.ok(yellow / points > 0.05 && yellow / points < 0.5, `${((yellow / points) * 100).toFixed(0)}% sulphur`);

        // (On the floor far from any pool, none)
        for (let x = 30; x < 40; x += 0.5) {
            assert.deepEqual(brimstoneTone(x, 0, 30, 5, tint, [pool], true), [1, 1, 1]);
        }
    });

    it("has embers glowing only in its cracks: a few of its points, low down, more of them by a pool", () => {
        const pool = poolShape({ x: 10, y: 10, w: 2, h: 2 }, null);
        const points = [];

        for (let x = 0; x < 30; x += 0.45) {
            for (let z = 0; z < 30; z += 0.45) {
                points.push(x, 0.8, z);
            }
        }

        const low = embersOn(new Float32Array(points), 9);
        const high = embersOn(new Float32Array(points.map((v, k) => (k % 3 === 1 ? BRIMSTONE.embers.high + 1 : v))), 9);
        const near = embersOn(new Float32Array(points), 9, [pool]);
        const share = (list) => [...list].filter((e) => e > 0).length / list.length;

        assert.ok(share(low) > 0.01 && share(low) < 0.3, `${(share(low) * 100).toFixed(0)}%`);
        assert.equal(share(high), 0);
        assert.ok([...near].reduce((sum, e) => sum + e, 0) >= [...low].reduce((sum, e) => sum + e, 0));
    });
});
