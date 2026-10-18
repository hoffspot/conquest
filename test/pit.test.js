// A hell's Pit, its last realm (world/pit.js: docs/DUNGEONS.md *Hells*): its sigils inlaid in the
// floor in the lord's violet, a seal in its halls and a pentagram before the throne; the lord's
// throne; and its lava only a rim along its throne hall's side walls (core/dungeons/place.js
// lavaRim)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { PIT, sigilGeometry, sigilMaterial, THRONE, throneParts } from "../client/js/world/pit.js";
import { VEIL } from "../client/js/world/veil.js";

const THREE = await import("three");

describe("the Pit's sigils (world/pit.js sigilGeometry, sigilMaterial)", () => {
    it("lie flat on the floor, facing up, within their rings: a seal, and a pentagram with its star", () => {
        for (const kind of ["seal", "pentagram"]) {
            const { positions, indices } = sigilGeometry(kind, 10, 12, 2, 0.3);

            assert.ok(positions.filter((_, k) => k % 3 === 1).every((y) => y === PIT.sigils.y));

            for (let k = 0; k < positions.length; k += 3) {
                assert.ok(Math.hypot(positions[k] - 10, positions[k + 2] - 12) <= 2 + PIT.sigils.line, kind);
            }

            for (let k = 0; k < indices.length; k += 3) {
                const [a, b, c] = [indices[k], indices[k + 1], indices[k + 2]].map((i) => [positions[i * 3], positions[i * 3 + 2]]);
                const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);

                assert.ok(up >= -1e-12, `${kind}: a strip facing down`);
            }
        }

        // (The pentagram's star reaching across its middle: five strips whose middles are near it)
        const star = sigilGeometry("pentagram", 0, 0, 2).positions;
        let near = 0;

        for (let k = 0; k < star.length; k += 12) {
            const [x, z] = [(star[k] + star[k + 3] + star[k + 6] + star[k + 9]) / 4, (star[k + 2] + star[k + 5] + star[k + 8] + star[k + 11]) / 4];

            near += Math.hypot(x, z) < 0.8 ? 1 : 0;
        }

        assert.equal(near, 5);
    });

    it("glow in the lord's violet, breathing a whole number of times each of the veils' loops, casting no shadow", () => {
        const material = sigilMaterial();
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
        const [r, g, b] = PIT.sigils.colour;

        assert.ok(b > r && r > g, "violet");
        assert.equal(sigilMaterial(), material);
        material.onBeforeCompile(shader);
        assert.equal(shader.uniforms.veilTime, VEIL.time);
        assert.ok(Number.isInteger(PIT.sigils.beats));
        assert.equal(material.userData.shadow, false);
    });
});

describe("the lord's throne (world/pit.js throneParts)", () => {
    it("stands on its plinth on the floor, its back tall behind its seat, runes cut in it, horns rising from it", () => {
        const { boxes, horns } = throneParts();
        const throne = boxes.filter(({ stuff }) => stuff === "throne");
        const runes = boxes.filter(({ stuff }) => stuff === "rune");
        const top = Math.max(...throne.map(({ at }) => at[4]));

        assert.ok(throne.some(({ at }) => at[1] === 0), "on the floor");
        assert.ok(Math.abs(top - (THRONE.plinth[2] + THRONE.back[0])) < 1e-9, "as tall as its back");
        assert.equal(runes.length, THRONE.runes * 2);
        assert.equal(horns.length, 2);
        assert.ok(horns.every(({ base, tip }) => tip[1] > base[1] && Math.abs(tip[0]) > Math.abs(base[0])), "rising, out");
        assert.ok(boxes.every(({ at: [x0, y0, z0, x1, y1, z1] }) => x1 > x0 && y1 > y0 && z1 > z0));
    });
});

describe("the Pit's lava, only a rim (core/dungeons/place.js lavaRim)", () => {
    it("lines its throne hall's side walls, clear of its ways in and its throne, nowhere else", () => {
        for (const seed of [11, 12, 13, 14]) {
            const level = buildDungeon({ seed, theme: "hell", tier: 9 }).levels[3];
            const arena = level.rooms.find(({ role }) => role === "arena");
            const lava = [];

            level.rows.forEach((row, y) => [...row].forEach((c, x) => c === "~" && lava.push([x, y])));
            assert.ok(lava.length >= 10, `seed ${seed}: ${lava.length}`);

            for (const [x, y] of lava) {
                assert.ok(x >= arena.x && x < arena.x + arena.w && y >= arena.y && y < arena.y + arena.h, "in the throne hall");
                assert.ok(level.rows[y][x - 1] === "#" || level.rows[y][x + 1] === "#", "by a side wall");

                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        assert.ok(!"YV".includes(level.rows[y + dy]?.[x + dx] ?? "."), "clear of the throne and the way out");
                    }
                }
            }
        }
    });
});
