// A hell's Pit, its last realm (docs/DUNGEONS.md *Hells*): darker and stranger than the River of
// Fire above it, its lava only a rim (the research, "Levels of hell dungeon design": Diablo II's
// Chaos Sanctuary, Diablo I's pentagram before Diablo). Polished black stone, sigils inlaid in its
// floor glowing in the lord's own colour, violet, where every realm above was red and orange: a
// seal in the middle of its halls, a great pentagram before the throne (sigilGeometry, sigilMaterial);
// and the lord's throne itself, of black stone, horned, runes cut in it glowing (throneParts).

import * as THREE from "three";
import { VEIL } from "./veil.js";

/**
 * The Pit's sigils (`sigils`): their colour (linear, as it's drawn: the lord's), how broad their
 * lines are (metres), how high they lie (metres), how many runes round a ring (`runes`, by its
 * radius: one each so many metres round it) and how fast they breathe (a share, and how many
 * times each veils' loop); a seal in a hall's middle (`seal`: how far across, metres) and the
 * pentagram before the throne (`pentagram`: how far across, and how far out from the throne,
 * metres).
 */
export const PIT = Object.freeze({
    sigils: Object.freeze({ colour: Object.freeze([0.55, 0.1, 1.1]), line: 0.07, y: 0.014, runes: 0.55, breathe: 0.35, beats: 24 }),
    seal: Object.freeze({ radius: 1.7 }),
    pentagram: Object.freeze({ radius: 2.6, out: 3.8 }),
});

// A flat strip along the floor from (x0, z0) to (x1, z1), `line` metres broad, into `parts`
function strip(parts, [x0, z0], [x1, z1], line) {
    const [dx, dz] = [x1 - x0, z1 - z0];
    const length = Math.hypot(dx, dz) || 1;
    const [nx, nz] = [(-dz / length) * (line / 2), (dx / length) * (line / 2)];
    const { y } = PIT.sigils;
    const base = parts.positions.length / 3;

    parts.positions.push(x0 + nx, y, z0 + nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x0 - nx, y, z0 - nz);
    parts.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// A ring round (x, z), `r` metres out, `line` broad, into `parts`
function ring(parts, x, z, r, line, sides = 48) {
    for (let k = 0; k < sides; k++) {
        const [a, b] = [(k / sides) * Math.PI * 2, ((k + 1) / sides) * Math.PI * 2];

        strip(parts, [x + Math.cos(a) * r, z + Math.sin(a) * r], [x + Math.cos(b) * r, z + Math.sin(b) * r], line);
    }
}

/**
 * A sigil inlaid in the floor, about (x, z) (level metres), `radius` metres out, its points turned
 * `turn` radians: a seal ("seal": two rings, runes between them, a smaller ring in the middle and
 * spokes out to it) or a pentagram ("pentagram": two rings, runes between them, the star within):
 * { positions, indices } (level metres), lying flat on the floor.
 */
export function sigilGeometry(kind, x, z, radius, turn = 0) {
    const { line, runes } = PIT.sigils;
    const parts = { positions: [], indices: [] };
    const inner = radius * 0.86;
    const at = (r, a) => [x + Math.cos(a + turn) * r, z + Math.sin(a + turn) * r];

    ring(parts, x, z, radius, line);
    ring(parts, x, z, inner, line * 0.8);

    // (Runes between the rings: each a little upright stroke and a crossing one, turned along it)
    const count = Math.max(8, Math.round((Math.PI * 2 * radius) / runes));

    for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2;
        const [r0, r1] = [inner + (radius - inner) * 0.2, inner + (radius - inner) * 0.8];

        strip(parts, at(r0, a), at(r1, a + 0.02 * (k % 3)), line * 0.6);
        strip(parts, at((r0 + r1) / 2, a - 0.04), at((r0 + r1) / 2 + (k % 2 ? 0.03 : -0.03), a + 0.05), line * 0.5);
    }

    if (kind === "pentagram") {
        // (The star: each point joined to the second on from it)
        const points = Array.from({ length: 5 }, (_, k) => at(inner * 0.97, -Math.PI / 2 + (k / 5) * Math.PI * 2));

        for (let k = 0; k < 5; k++) {
            strip(parts, points[k], points[(k + 2) % 5], line);
        }
    } else {
        // (A seal: a ring in its middle, spokes out to the inner ring)
        ring(parts, x, z, radius * 0.32, line * 0.8, 24);

        for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;

            strip(parts, at(radius * 0.32, a), at(inner, a), line * 0.6);
        }
    }

    return parts;
}

let sigil = null;

/**
 * The material the Pit's sigils are drawn with: their colour, their own light, breathing slowly by
 * the veils' clock (VEIL), a whole number of breaths each loop; casting no shadow.
 */
export function sigilMaterial() {
    if (!sigil) {
        const { colour, breathe, beats } = PIT.sigils;

        sigil = new THREE.MeshBasicMaterial({ color: new THREE.Color(...colour), toneMapped: false });
        sigil.name = "pit-sigil";
        sigil.userData.shadow = false;
        sigil.onBeforeCompile = (shader) => {
            shader.uniforms.veilTime = VEIL.time;
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <common>", "#include <common>\nuniform float veilTime;")
                .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `vec4 diffuseColor = vec4( diffuse * (${(1 - breathe).toFixed(3)} + ${breathe.toFixed(3)} * (0.5 + 0.5 * sin(PI2 * ${beats.toFixed(1)} * veilTime / ${VEIL.loop.toFixed(1)}))), opacity );`);
        };
        sigil.customProgramCacheKey = () => "pit-sigil";
    }

    return sigil;
}

/**
 * The lord's throne (`THRONE`): its plinth (how wide, deep and high, metres), its seat (how high),
 * its back (how tall and how thick), its horns (how tall, how thick at their foot, and how far they
 * lean out), and its runes (how many down each side of its back).
 */
export const THRONE = Object.freeze({ plinth: Object.freeze([1.9, 1.5, 0.4]), seat: 0.95, back: Object.freeze([3.4, 0.35]), horns: Object.freeze([1.3, 0.16, 0.5]), runes: 5 });

/**
 * The lord's throne, its back to the wall at (x, z) (level metres: its square's middle), facing
 * `facing` (radians, as interiors3d.js turns things: from +z towards +x): boxes [{ at: [x0, y0,
 * z0, x1, y1, z1] (level metres, as it stands facing +z, about its middle), stuff ("throne" or
 * "rune") }] and horns [{ base: [x, y, z], tip: [x, y, z], radius }], all about the throne's
 * middle facing +z, turned and placed by whoever draws them.
 */
export function throneParts() {
    const { plinth, seat, back, horns, runes } = THRONE;
    const [w, d, h] = plinth;
    const boxes = [];
    const box = (x0, y0, z0, x1, y1, z1, stuff = "throne") => boxes.push({ at: [x0, y0, z0, x1, y1, z1], stuff });

    // (Its plinth, a step before it; its seat; its arms; its back, rising behind, narrowing to a
    // crest; its runes down each side of its back)
    box(-w / 2, 0, -d / 2, w / 2, h, d / 2);
    box(-w / 2 + 0.15, 0, d / 2, w / 2 - 0.15, h * 0.5, d / 2 + 0.3);
    box(-0.55, h, -0.35, 0.55, seat, 0.45);
    box(-0.75, h, -0.4, -0.55, seat + 0.35, 0.4);
    box(0.55, h, -0.4, 0.75, seat + 0.35, 0.4);
    box(-0.65, h, -0.55, 0.65, h + back[0] * 0.75, -0.55 + back[1]);
    box(-0.45, h + back[0] * 0.75, -0.55, 0.45, h + back[0] * 0.92, -0.55 + back[1]);
    box(-0.2, h + back[0] * 0.92, -0.55, 0.2, h + back[0], -0.55 + back[1]);

    for (let k = 0; k < runes; k++) {
        const y = h + 0.6 + k * ((back[0] * 0.7 - 0.6) / runes);

        for (const side of [-1, 1]) {
            box(side * 0.5 - 0.06, y, -0.55 + back[1], side * 0.5 + 0.06, y + 0.16, -0.55 + back[1] + 0.03, "rune");
        }
    }

    // (Its horns, from the top of its back's broad part, curving out and up)
    const hornList = [-1, 1].map((side) => ({ base: [side * 0.55, h + back[0] * 0.72, -0.4], tip: [side * (0.55 + horns[2]), h + back[0] * 0.72 + horns[0], -0.45], radius: horns[1] }));

    return { boxes, horns: hornList };
}
