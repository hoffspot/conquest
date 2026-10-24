// A house burnt by the Behemoth of the Rift, and built again (core/burnt.js: its `burnt` stage),
// as it looks at each stage: built as it stood by whatever builds it (house.js, a people's kit),
// then made over.
//
// - **Burning**, and **burnt** the day after: its glass gone and whatever grew on it, its walls
//   broken off jagged and blackened (more the higher up, in patches), its roof fallen in. What's
//   left of its beams lies across it and fallen in on the ash, a post or two still standing. While
//   it burns, great fires leap in it (lights.js `blaze`: their flames, embers, light and smoke);
//   the day after, smoke rises from it still (smoke.js).
// - **Framed**: its walls mended, soot still on them here and there, new timbers up for its roof,
//   scaffolding round it and timber stacked by its door; no glass in yet, and no fire in its
//   hearth.
// - **Roofed**: whole again, the scaffolding still up along its front and a side, a little soot
//   left; no fire in its hearth yet.
//
// A wall's cut a triangle at a time, each at the height the broken top has where it is (so it
// breaks off in steps, as courses and panels fall), each corner's colour (Solid's: atlas.js)
// darkened; nothing else is drawn of it, so it's merged with the rest of the town as any piece is.
// In the art's world pixels, as the kits build: five to a metre.

import * as THREE from "three";
import { createRandom, noise } from "../../../core/random.js";
import { WINDOWS } from "../engine/atlas.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";

const M = 5;
const m = (metres) => metres * M;

// How far a scaffold's outer poles stand out from its inner ones (world pixels)
const WIDE = m(0.9);

/**
 * How it's made over at each stage: how much of its walls is left (`walls`: between these shares
 * of their height, by noise over `patch` metres; null, all of them), whether its roof's gone and
 * its glass, how black it is (`char`: its corners' colours times this low on its walls, `top`
 * at their tops; `soot`: patches of soot this dark at most), what's added (`ruin`: its ash, its
 * beams; `fires`, how many; `smoke`, how many columns; `rafters`, new ones; `scaffold`, on which
 * sides), and whether its hearth, lights and banners are out (till it's whole again).
 */
export const BURNT_LOOKS = Object.freeze({
    burning: { walls: [0.3, 0.9], patch: 2.4, roof: false, glass: false, char: 0.42, top: 0.13, soot: 0, ruin: true, fires: [2, 4], smoke: 0, rafters: false, scaffold: [], out: true },
    burnt: { walls: [0.3, 0.9], patch: 2.4, roof: false, glass: false, char: 0.42, top: 0.13, soot: 0, ruin: true, fires: [0, 0], smoke: 2, rafters: false, scaffold: [], out: true },
    framed: { walls: null, patch: 2.4, roof: false, glass: false, char: 1, top: 1, soot: 0.5, ruin: false, fires: [0, 0], smoke: 0, rafters: true, scaffold: ["front", "back", "left", "right"], out: true },
    roofed: { walls: null, patch: 2.4, roof: true, glass: true, char: 1, top: 1, soot: 0.22, ruin: false, fires: [0, 0], smoke: 0, rafters: false, scaffold: ["front", "right"], out: true },
});

// What burns away whole: what grows on a house and its window boxes' flowers
const GREEN = new Set(["leaves", "flowers", "flowers-gold", "ivy"]);

const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);
};

/**
 * A built piece (a kit's, facing south: a Three.js group) made over as it is at its stage of
 * being burnt and built again (`piece.burnt`: core/burnt.js BURNT.stages), from its own random
 * numbers: a group of its own.
 */
export function burntOf(built, piece) {
    const look = BURNT_LOOKS[piece.burnt];

    if (!look) {
        return built;
    }

    const random = createRandom(((piece.seed ?? 0) ^ Math.imul(Math.round(piece.x * 97 + piece.y * 61), 2654435761)) >>> 0);
    const seed = random.int(1, 2 ** 20);
    const meshes = [];

    built.updateMatrixWorld(true);
    built.traverse((node) => node.isMesh && meshes.push(node));

    // Every mesh baked to where it stands in the piece (so its corners are the piece's)
    for (const mesh of meshes) {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();

        geometry.applyMatrix4(mesh.matrixWorld);
        mesh.geometry = geometry;
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(1, 1, 1);
        mesh.updateMatrix();
    }

    built.traverse((node) => {
        if (!node.isMesh) {
            node.position.set(0, 0, 0);
            node.rotation.set(0, 0, 0);
            node.scale.set(1, 1, 1);
        }
    });
    built.updateMatrixWorld(true);

    const shape = shapeOf(meshes);
    const span = Math.max(m(1), shape.eaves - shape.base);
    // (How high its walls are left where a triangle's middle is)
    const cut = look.walls
        ? (x, z) => shape.base + span * (look.walls[0] + (look.walls[1] - look.walls[0]) * noise(x, z, seed, m(look.patch), 2))
        : look.roof
          ? null
          : () => shape.eaves + 0.5;

    for (const mesh of [...meshes]) {
        const name = mesh.material?.name ?? "";

        if ((!look.glass && WINDOWS.includes(name)) || (look.walls && GREEN.has(name))) {
            mesh.removeFromParent();
            meshes.splice(meshes.indexOf(mesh), 1);
            continue;
        }

        if (cut) {
            mesh.geometry = clipped(mesh.geometry, cut);
        }

        darken(mesh.geometry, (x, y, z) => blackness(look, shape, span, seed, x, y, z));
    }

    // Its hearth, its lights and its banners out, if they are
    if (look.out) {
        built.traverse((node) => {
            delete node.userData.smoke;
            delete node.userData.lights;
            delete node.userData.cloth;
        });
    }

    const group = new THREE.Group();
    const added = new Solid();
    const lights = [];
    const smoke = [];

    group.add(built);

    // (The great trees it's built round, the elves', still standing)
    if (built.userData.trees) {
        group.userData.trees = built.userData.trees;
    }

    if (look.ruin) {
        ruin(added, shape, span, random, cut);

        for (let k = 0, fires = random.int(...look.fires); k < fires; k++) {
            const [x, z] = within(shape, random, 0.25);

            lights.push([x, shape.base + span * random.range(0.25, 0.55), z, "blaze"]);
        }

        for (let k = 0; k < look.smoke; k++) {
            const [x, z] = within(shape, random, 0.3);

            smoke.push([x, shape.base + span * 0.5, z, 1.6]);
        }
    }

    if (look.rafters) {
        rafters(added, shape, random);
    }

    if (look.scaffold.length) {
        scaffold(added, shape, look.scaffold, random);
    }

    if (added.triangles) {
        group.add(added.toObject());
    }

    if (lights.length) {
        group.userData.lights = lights;
    }

    if (smoke.length) {
        group.userData.smoke = smoke;
    }

    return group;
}

/**
 * Where a piece's walls stand and how high (its meshes', baked: world pixels): `base`, the
 * lowest; `eaves`, where its roof starts (the lowest of most of what slopes up over it, or near
 * its top if nothing does); `top`; and its walls' footprint, [x0, x1, z0, z1] (what stands below
 * its eaves, its roof's overhang left out).
 */
export function shapeOf(meshes) {
    const box = new THREE.Box3();
    const point = new THREE.Vector3();
    const sloped = [];

    for (const mesh of meshes) {
        const { position, normal } = mesh.geometry.attributes;

        for (let i = 0; i < position.count; i++) {
            box.expandByPoint(point.fromBufferAttribute(position, i));
        }

        // (Its upward-sloping faces, by how much of them there is at each height: its roofs)
        for (let i = 0; normal && i + 2 < position.count; i += 3) {
            const up = (normal.getY(i) + normal.getY(i + 1) + normal.getY(i + 2)) / 3;

            if (up > 0.3 && up < 0.97) {
                const [ax, ay, az] = [position.getX(i), position.getY(i), position.getZ(i)];
                const [ux, uy, uz] = [position.getX(i + 1) - ax, position.getY(i + 1) - ay, position.getZ(i + 1) - az];
                const [vx, vy, vz] = [position.getX(i + 2) - ax, position.getY(i + 2) - ay, position.getZ(i + 2) - az];
                const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;

                sloped.push([Math.min(ay, ay + uy, ay + vy), area]);
            }
        }
    }

    const base = Number.isFinite(box.min.y) ? Math.max(0, box.min.y) : 0;
    const top = Number.isFinite(box.max.y) ? box.max.y : m(3);
    let eaves = base + (top - base) * 0.85;

    // (The height under four fifths of its sloping faces' area)
    if (sloped.length) {
        const whole = sloped.reduce((sum, [, area]) => sum + area, 0);
        let under = 0;

        sloped.sort((a, b) => a[0] - b[0]);

        for (const [y, area] of sloped) {
            under += area;

            if (under >= whole * 0.2) {
                eaves = Math.max(base + m(1.8), y);
                break;
            }
        }
    }

    // (Its walls' footprint: what stands low on it)
    const low = new THREE.Box3();

    for (const mesh of meshes) {
        const { position } = mesh.geometry.attributes;

        for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i);

            if (point.y < base + (eaves - base) * 0.5) {
                low.expandByPoint(point);
            }
        }
    }

    const footprint = low.isEmpty() ? [box.min.x, box.max.x, box.min.z, box.max.z] : [low.min.x, low.max.x, low.min.z, low.max.z];

    return { base, eaves, top, footprint };
}

/**
 * A (non-indexed) geometry with what's above `cut(x, z)` (world pixels) cut away, a triangle at a
 * time, each where its middle is: a triangle wholly above it gone, one across it cut along it,
 * every attribute of its corners carried to the new ones in between.
 */
export function clipped(geometry, cut) {
    const names = Object.keys(geometry.attributes);
    const sources = names.map((name) => geometry.attributes[name]);
    const sizes = sources.map(({ itemSize }) => itemSize);
    const outs = sizes.map(() => []);
    const { position } = geometry.attributes;
    const corner = (i) => sources.map((attribute, a) => Array.from({ length: sizes[a] }, (_, k) => attribute.array[i * sizes[a] + k]));
    const between = (p, q, t) => p.map((values, a) => values.map((value, k) => value + (q[a][k] - value) * t));
    const emit = (...corners) => {
        for (const each of corners) {
            each.forEach((values, a) => outs[a].push(...values));
        }
    };

    for (let i = 0; i + 2 < position.count; i += 3) {
        const ys = [position.getY(i), position.getY(i + 1), position.getY(i + 2)];
        const h = cut((position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3, (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3);
        const inside = ys.map((y) => y <= h);

        if (inside.every(Boolean)) {
            emit(corner(i), corner(i + 1), corner(i + 2));
            continue;
        }

        if (!inside.some(Boolean)) {
            continue;
        }

        // (Round the triangle, the corners below the cut and where its sides cross it)
        const kept = [];

        for (let k = 0; k < 3; k++) {
            const [a, b] = [i + k, i + ((k + 1) % 3)];
            const [ya, yb] = [ys[k], ys[(k + 1) % 3]];

            if (inside[k]) {
                kept.push(corner(a));
            }

            if (inside[k] !== inside[(k + 1) % 3]) {
                kept.push(between(corner(a), corner(b), (h - ya) / (yb - ya)));
            }
        }

        for (let k = 1; k + 1 < kept.length; k++) {
            emit(kept[0], kept[k], kept[k + 1]);
        }
    }

    const result = new THREE.BufferGeometry();

    names.forEach((name, a) => result.setAttribute(name, new THREE.Float32BufferAttribute(outs[a], sizes[a])));

    return result;
}

// Each corner's colour (white if it had none) times `shade(x, y, z)`: [r, g, b] or a number
function darken(geometry, shade) {
    const { position } = geometry.attributes;

    if (!geometry.attributes.color) {
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(position.count * 3).fill(1), 3));
    }

    const colour = geometry.attributes.color;

    for (let i = 0; i < position.count; i++) {
        const [r, g, b] = shade(position.getX(i), position.getY(i), position.getZ(i));

        colour.setXYZ(i, colour.getX(i) * r, colour.getY(i) * g, colour.getZ(i) * b);
    }
}

// How dark a corner of it is (its colour's times: [r, g, b]): burnt, blacker the higher up and in
// patches, a little brown; mended, soot left in patches near the top
function blackness(look, { base }, span, seed, x, y, z) {
    const patch = noise(x + z * 0.7, y, seed + 5, m(1.6), 2);

    if (look.char < 1) {
        const k = (look.char + (look.top - look.char) * smooth(base, base + span * 0.75, y)) * (0.7 + 0.6 * patch);

        return [k * 1.05, k, k * 0.9];
    }

    const soot = look.soot * smooth(0.5, 0.8, patch) * smooth(base + span * 0.3, base + span, y);

    return [1 - soot, 1 - soot * 1.02, 1 - soot * 1.05];
}

// A point within its walls' footprint, `margin` of the way in from them at least
function within({ footprint: [x0, x1, z0, z1] }, random, margin) {
    return [x0 + (x1 - x0) * random.range(margin, 1 - margin), z0 + (z1 - z0) * random.range(margin, 1 - margin)];
}

// What a burnt house's left with inside its walls: ash over its floor, heaped by the walls; its
// beams across it where they held, charred, and fallen in on the ash; a post or two still up
function ruin(solid, shape, span, random, cut) {
    const [x0, x1, z0, z1] = shape.footprint;
    const { base } = shape;
    const char = material("timber-char");
    const across = x1 - x0 <= z1 - z0 ? "x" : "z";
    const [a0, a1, b0, b1] = across === "x" ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const at = (a, b, y) => (across === "x" ? [a, y, b] : [b, y, a]);
    const inset = m(0.3);
    // (Over the plinth a house stands on, if it has one: house.js's is 35 centimetres)
    const floor = base + m(0.45);

    solid.tone = [0.13, 0.12, 0.11];
    solid.box(x0 + inset, base, z0 + inset, x1 - inset, floor, z1 - inset, material("soil"));

    // (Heaps of what fell, stone and charred boards)
    for (let k = 0, heaps = random.int(2, 4); k < heaps; k++) {
        const [hx, hz] = within(shape, random, 0.12);
        const r = m(random.range(0.5, 1.1));
        const stone = random.chance(0.5);

        solid.tone = stone ? [0.34, 0.32, 0.3] : [0.5, 0.48, 0.46];
        solid.box(hx - r, floor - m(0.1), hz - r * 0.8, hx + r, floor + m(random.range(0.25, 0.55)), hz + r * 0.8, material(stone ? "stone-dark" : "planks-char"));
    }

    solid.tone = [0.28, 0.26, 0.24];

    // Its beams across it, every 2 metres or so: some still where they were (at the walls' height
    // there), some fallen at one end, some lying on the ash
    for (let b = b0 + m(random.range(0.8, 1.6)); b < b1 - m(0.6); b += m(random.range(1.6, 2.6))) {
        const left = Math.min(cut(...at(a0, b, 0).filter((_, k) => k !== 1)), cut(...at(a1, b, 0).filter((_, k) => k !== 1)));
        const high = Math.min(left, base + span * 0.85) - m(0.25);
        const fate = random.next();

        if (high <= floor + m(0.6) || fate < 0.3) {
            // (Fallen, lying on the ash at a slant)
            const lie = random.range(-0.4, 0.4);
            const half = (a1 - a0) * random.range(0.3, 0.45);
            const mid = (a0 + a1) / 2;

            solid.beam(at(mid - half, b - half * lie, floor + m(0.1)), at(mid + half, b + half * lie, floor + m(0.1)), m(0.22), m(0.22), char);
        } else if (fate < 0.65) {
            // (Fallen at one end, the other still on the wall)
            const [up, down] = random.chance(0.5) ? [a0 + m(0.1), a1 - m(0.3)] : [a1 - m(0.1), a0 + m(0.3)];

            solid.beam(at(up, b, high), at(down + (up - down) * random.range(0.1, 0.35), b, floor + m(0.1)), m(0.22), m(0.24), char);
        } else {
            solid.beam(at(a0 + m(0.1), b, high), at(a1 - m(0.1), b, high), m(0.22), m(0.26), char);
        }
    }

    // (A post or two still standing, burnt off)
    for (let k = 0, posts = random.int(1, 2); k < posts; k++) {
        const [px, pz] = within(shape, random, 0.3);

        solid.beam([px, base, pz], [px, base + span * random.range(0.35, 0.7), pz], m(0.2), m(0.2), char, { up: [0, 0, 1] });
    }

    solid.tone = null;
}

// The new timbers of its roof, up on its mended walls: a pair of rafters every 60 centimetres or
// so either side of the ridge, the ridge beam on them, a tie beam across every third pair
function rafters(solid, shape, random) {
    const [x0, x1, z0, z1] = shape.footprint;
    const wood = material("timber-light");
    const along = x1 - x0 >= z1 - z0 ? "x" : "z";
    const [a0, a1, b0, b1] = along === "x" ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const at = (a, b, y) => (along === "x" ? [a, y, b] : [b, y, a]);
    const eaves = shape.eaves;
    const mid = (b0 + b1) / 2;
    const ridge = eaves + ((b1 - b0) / 2) * random.range(0.8, 1);
    const pairs = Math.max(2, Math.round((a1 - a0) / m(0.6)));

    for (let k = 0; k <= pairs; k++) {
        const a = a0 + m(0.1) + ((a1 - a0 - m(0.2)) * k) / pairs;

        solid.beam(at(a, b0, eaves), at(a, mid, ridge), m(0.08), m(0.16), wood, { ends: false });
        solid.beam(at(a, b1, eaves), at(a, mid, ridge), m(0.08), m(0.16), wood, { ends: false });

        if (k % 3 === 0) {
            solid.beam(at(a, b0, eaves + m(0.1)), at(a, b1, eaves + m(0.1)), m(0.1), m(0.18), wood);
        }
    }

    solid.beam(at(a0, mid, ridge + m(0.08)), at(a1, mid, ridge + m(0.08)), m(0.12), m(0.2), wood);

    // (And timber stacked by its door, for what's still to do)
    const [sx, sz] = [x0 + (x1 - x0) * random.range(0.2, 0.8), z1 + m(0.9)];

    for (let k = 0; k < 4; k++) {
        solid.beam([sx - m(1.4), shape.base + m(0.1 + k * 0.16), sz + m(k % 2 ? 0.1 : -0.1)], [sx + m(1.4), shape.base + m(0.1 + k * 0.16), sz + m(k % 2 ? 0.1 : -0.1)], m(0.5), m(0.15), wood);
    }
}

// Scaffolding along the sides named (front, back, left, right: the kits build facing south, the
// front the side towards +z), 60 centimetres out from its walls: two rows of poles every 2.4
// metres or so, up past its eaves, ledgers along them every 2 metres up, boards laid on the
// highest lift and every other one below it, and a brace across a bay now and then
function scaffold(solid, shape, sides, random) {
    const [x0, x1, z0, z1] = shape.footprint;
    const pole = material("timber-grey");
    const board = material("planks-pale");
    const out = m(0.6);
    const top = shape.eaves + m(1);
    const lifts = [];

    for (let y = shape.base + m(2); y < top - m(0.5); y += m(2)) {
        lifts.push(y);
    }

    // (Each side: where it runs, [u0, u1] along it, and how a point along it at a height is placed)
    const runs = {
        front: [x0 - out, x1 + out, (u, y, o = 0) => [u, y, z1 + out + o]],
        back: [x0 - out, x1 + out, (u, y, o = 0) => [u, y, z0 - out - o]],
        left: [z0 - out, z1 + out, (u, y, o = 0) => [x0 - out - o, y, u]],
        right: [z0 - out, z1 + out, (u, y, o = 0) => [x1 + out + o, y, u]],
    };

    for (const side of sides) {
        const [u0, u1, at] = runs[side];
        const bays = Math.max(1, Math.round((u1 - u0) / m(2.4)));
        const step = (u1 - u0) / bays;

        for (let k = 0; k <= bays; k++) {
            const u = u0 + step * k;

            solid.beam(at(u, shape.base), at(u, top), m(0.11), m(0.11), pole, { up: [0, 0, 1] });
            solid.beam(at(u, shape.base, WIDE), at(u, top - m(1), WIDE), m(0.11), m(0.11), pole, { up: [0, 0, 1] });
        }

        solid.near(() => {
            for (const [k, y] of lifts.entries()) {
                solid.beam(at(u0, y), at(u1, y), m(0.08), m(0.08), pole);
                solid.beam(at(u0, y, WIDE), at(u1, y, WIDE), m(0.08), m(0.08), pole);

                if ((lifts.length - 1 - k) % 2 === 0) {
                    solid.box(...boardsOf(at, u0, u1, y), board);
                }
            }

            for (let k = 0; k < bays; k++) {
                if (random.chance(0.4)) {
                    const u = u0 + step * k;

                    solid.beam(at(u, shape.base + m(0.2), WIDE), at(u + step, Math.min(top - m(1), shape.base + m(4)), WIDE), m(0.07), m(0.07), pole);
                }
            }
        });
    }
}

// The boards laid on a lift of scaffolding (from `at`'s line out to its outer poles), as a box:
// [x0, y0, z0, x1, y1, z1]
function boardsOf(at, u0, u1, y) {
    const [a, b] = [at(u0, y + m(0.05)), at(u1, y + m(0.1), WIDE)];

    return [Math.min(a[0], b[0]), y + m(0.05), Math.min(a[2], b[2]), Math.max(a[0], b[0]), y + m(0.1), Math.max(a[2], b[2])];
}
