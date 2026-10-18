// A hell's Halls of Bone, flesh and bone (world/flesh.js: docs/DUNGEONS.md *Hells*): its walls of
// flesh, veins glowing in them; bone ribs rising out of them and arching over the halls; blood
// pooled on the floor; and the heart they beat to, in the last room, its arteries into the roof, its
// veins across the floor into the walls, the sacs round it
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { readPlan } from "../client/js/core/interiors.js";
import { allAtOnce } from "../client/js/core/steps.js";
import { cavern, SHELLS } from "../client/js/world/caverns.js";
import { SEAMS } from "../client/js/world/dungeons3d.js";
import { BLOOD, bloodGeometry, FLESH, fleshTone, HEART, heartLight, heartMaterial, heartParts, ribGeometry, ribPaths, RIBS, veinsOn } from "../client/js/world/flesh.js";
import { VEIL } from "../client/js/world/veil.js";

const THREE = await import("three");

// (The Halls of Bone, the second level of a hell: its plan read, and its rock as one surface)
const HALLS = [11, 12, 13].map((seed) => {
    const level = buildDungeon({ seed, theme: "hell", tier: 9 }).levels[1];
    const map = readPlan(`halls-${seed}`, "The Halls of Bone", level.rows);

    return { seed, level, map, rock: (x, y) => map.plan[y]?.[x] === "#", bare: (x, y) => map.plan[y]?.[x] === "." };
});

describe("the Halls of Bone's flesh (world/flesh.js veinsOn, fleshTone; caverns.js SHELLS.flesh)", () => {
    it("has veins of blood in its walls, a few of its points, up them and over the roof alike", () => {
        const points = [];

        for (let x = 0; x < 30; x += 0.45) {
            for (let y = 0; y < 5; y += 0.45) {
                points.push(x, y, 7.3);
            }
        }

        const veins = veinsOn(new Float32Array(points), 9);
        const share = [...veins].filter((v) => v > 0).length / veins.length;
        const at = (high) => [...veins].filter((v, k) => v > 0 && Math.abs(points[k * 3 + 1] - high) < 1.2).length;

        assert.ok(share > 0.03 && share < 0.4, `${(share * 100).toFixed(0)}%`);
        assert.ok(at(0.6) > 0 && at(4) > 0, "low down and high up");
        assert.ok(FLESH.lesser.bright < 1);
    });

    it("is dark in patches where blood's dried on it, streaked paler with sinew", () => {
        const tint = [0.1, 0.012, 0.011];
        const tones = [];

        for (let x = 0; x < 30; x += 0.5) {
            for (let y = 0; y < 4; y += 0.5) {
                tones.push(fleshTone(x, y, 3.1, 7, tint));
            }
        }

        const darker = tones.filter(([r, g, b]) => r < 0.85 && g < 0.85 && b < 0.85);
        const paler = tones.filter(([r, g, b]) => g * tint[1] > r * tint[0] * 0.3 && b > 1.5);

        assert.ok(darker.length > 0 && darker.length < tones.length * 0.6, `${darker.length} darker`);
        assert.ok(paler.length > 0 && paler.length < tones.length * 0.4, `${paler.length} paler`);
    });

    it("beats as a heart does: a beat every 1.2 seconds, coming round whole each of the veils' loops", () => {
        assert.match(SEAMS.veins.pulse, /veilTime \/ 1\.2/);
        assert.equal(Number.isInteger(VEIL.loop / 1.2 + 1e-9) || Math.abs(VEIL.loop / 1.2 - Math.round(VEIL.loop / 1.2)) < 1e-9, true);
        assert.ok(SEAMS.veins.colour[0] > SEAMS.veins.colour[1] * 5, "red");
        assert.ok(SHELLS.flesh.high > SHELLS.flesh.low);
    });
});

describe("the Halls of Bone's ribs (world/flesh.js ribPaths, ribGeometry)", () => {
    const made = new Map();

    before(() => {
        for (const each of HALLS) {
            made.set(each, allAtOnce(cavern(each.map.width, each.map.height, each.rock, SHELLS.flesh, { seed: 7 })));
        }
    });

    it("rise out of the walls every other square along them, up from their foot and on out over the hall under the roof, all of them in the open", () => {
        for (const each of HALLS) {
            const { open, roof } = made.get(each);
            const ribs = ribPaths(each.map.width, each.map.height, each.bare, each.rock, open, roof);

            assert.ok(ribs.length > 40, `seed ${each.seed}: ${ribs.length} ribs`);

            for (const { points, along } of ribs) {
                const [foot, top] = [points[0], points.reduce((high, p) => (p[1] > high[1] ? p : high))];

                assert.ok(foot[1] < 0.1, "from the wall's foot");
                assert.ok(top[1] > 2.5, `up to ${top[1].toFixed(2)}`);
                assert.equal(Math.hypot(...along), 1);

                for (const [x, y, z] of points) {
                    assert.ok(open(x, y, z) > 0, `in the rock at ${[x, y, z].map((v) => v.toFixed(2))}`);
                }

                // (Its highest a little under the roof there)
                assert.ok(roof(top[0], top[2]) === 0 || roof(top[0], top[2]) - top[1] < 0.8, `${top[1].toFixed(2)} under ${roof(top[0], top[2])}`);
            }
        }
    });

    it("are drawn as tubes, thick at their foot and thinning to their tip, their sides facing out, bone stained with blood at their foot", () => {
        const { open, roof } = made.get(HALLS[0]);
        const ribs = ribPaths(HALLS[0].map.width, HALLS[0].map.height, HALLS[0].bare, HALLS[0].rock, open, roof).slice(0, 4);
        const { positions, normals, colours, indices } = ribGeometry(ribs);
        const { rings, sides } = RIBS;
        const per = (rings + 1) * sides;

        assert.equal(positions.length / 3, per * ribs.length);
        assert.equal(indices.length, rings * sides * 6 * ribs.length);

        for (let k = 0; k < normals.length; k += 3) {
            assert.ok(Math.abs(Math.hypot(normals[k], normals[k + 1], normals[k + 2]) - 1) < 1e-6);
        }

        // (Each triangle facing the way its points do)
        for (let k = 0; k < indices.length; k += 3) {
            const [a, b, c] = [indices[k], indices[k + 1], indices[k + 2]].map((i) => positions.slice(i * 3, i * 3 + 3));
            const face = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
            const n = normals.slice(indices[k] * 3, indices[k] * 3 + 3);

            assert.ok(face[0] * n[0] + face[1] * n[1] + face[2] * n[2] > -1e-9);
        }

        // (Redder at the foot, the colour of bone at the tip)
        const [foot, tip] = [colours.slice(0, 3), colours.slice((per - 1) * 3, per * 3)];

        assert.ok(foot[1] / foot[0] < tip[1] / tip[0]);
    });
});

describe("the blood pooled on the Halls' floor (world/flesh.js bloodGeometry)", () => {
    it("is in the Halls' rooms, walked through; lies flat on the floor in its squares, drops splashed round it, darker in the middle", () => {
        let pools = 0;

        for (const { map } of HALLS) {
            const pieces = map.pieces.filter(({ kind }) => kind === "blood");

            pools += pieces.length;

            for (const piece of pieces) {
                const { positions, colours } = bloodGeometry([piece]);

                for (let k = 0; k < positions.length; k += 3) {
                    assert.equal(positions[k + 1], BLOOD.y);
                    assert.ok(positions[k] > piece.x - 1 && positions[k] < piece.x + piece.w + 1 && positions[k + 2] > piece.y - 1 && positions[k + 2] < piece.y + piece.h + 1);
                }

                assert.deepEqual(colours.slice(0, 3), [...BLOOD.deep]);
            }
        }

        assert.ok(pools >= HALLS.length * 2, `${pools} pools`);
    });
});

describe("the heart the Halls beat to (world/flesh.js heartParts, heartMaterial)", () => {
    const made = new Map();

    before(() => {
        for (const each of HALLS) {
            made.set(each, allAtOnce(cavern(each.map.width, each.map.height, each.rock, SHELLS.flesh, { seed: 7 })));
        }
    });

    it("is in the last room of every level of the Halls, its master's, by the portal down", () => {
        for (const { level, map } of HALLS) {
            const hearts = map.pieces.filter(({ kind }) => kind === "heart");
            const room = level.rooms.find(({ look }) => look === "heart");

            assert.equal(hearts.length, 1);
            assert.equal(room.role, "stairs");
            assert.ok(hearts[0].x >= room.x && hearts[0].x + hearts[0].w <= room.x + room.w && hearts[0].y >= room.y && hearts[0].y + hearts[0].h <= room.y + room.h);
        }
    });

    it("stands on the floor as tall as a man, beating; its arteries rise into the roof, its veins run across the floor, its sacs lie round it on bare floor", () => {
        for (const each of HALLS) {
            const { open, roof } = made.get(each);
            const piece = each.map.pieces.find(({ kind }) => kind === "heart");
            const parts = heartParts(piece, open, roof, each.bare);
            const ys = parts.positions.filter((_, k) => k % 3 === 1);
            const { body } = HEART;
            const points = parts.positions.length / 3;

            assert.equal(parts.normals.length, parts.positions.length);
            assert.equal(parts.colours.length, parts.positions.length);
            assert.equal(parts.glow.length, parts.positions.length);
            assert.equal(parts.beat.length, points);
            assert.ok(parts.indices.every((i) => i < points));

            // (Its body: its foot on the floor, its top as tall as it is, swelling as it beats)
            const bodyPoints = (body.rings + 1) * body.points;

            assert.ok(Math.min(...ys.slice(0, bodyPoints)) < 0.15 && Math.min(...ys.slice(0, bodyPoints)) > -0.2);
            assert.ok(Math.max(...ys.slice(0, bodyPoints)) > body.tall * 0.9);
            assert.ok(parts.beat.slice(0, bodyPoints).every((b) => b === 1));

            // (Its arteries reaching the roof over it)
            const [cx, cz] = [piece.x + piece.w / 2, piece.y + piece.h / 2];

            assert.ok(Math.max(...ys) > roof(cx, cz) - 1, `up to ${Math.max(...ys).toFixed(2)} under a roof at ${roof(cx, cz).toFixed(2)}`);

            // (Something on it glowing)
            assert.ok(parts.glow.some((g) => g > 0.2));
        }
    });

    it("is drawn with its own material: lit by the room, swelling as it beats by the veils' clock, glowing; its light beating with it", () => {
        const material = heartMaterial();
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };

        assert.equal(heartMaterial(), material);
        material.onBeforeCompile(shader);
        assert.equal(shader.uniforms.veilTime, VEIL.time);
        assert.ok(shader.uniforms.roomAt);
        assert.match(shader.vertexShader, /transformed \+= objectNormal \* beat \* heartBeat/);
        assert.match(shader.fragmentShader, /totalEmissiveRadiance \+= vHeartGlow;/);

        const light = heartLight({ x: 10, y: 12, w: 2, h: 2 });

        assert.deepEqual([light.kind, light.x, light.z], ["heart", 11, 13]);
        assert.ok(Math.abs(light.pace - (Math.PI * 2) / 1.2) < 1e-9 && light.breathe > 0.2);
    });
});
