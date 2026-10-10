// A works' wagon on the road in a convoy (core/host.js #meetConvoy), or an army's supply wagon
// (#meetWagon), drawn: a four-wheeled wagon of boards in its people's timber (kits/works.js
// WORKS_STUFF), an ox between its shafts drawing it (beasts/looks.js ox), a yoke across the ox's
// neck. Laden with what its works yields: logs stacked in two courses, stone squared and dressed,
// or iron, in bars and red ore heaped; or with an army's supplies, barrels, sacks and a crate; or
// empty, going back for more. Its wheels turn as it goes.
//
// Built as the kits are, in world pixels (a metre is five), then drawn at a metre's scale: the
// wagon behind the ox, both facing +z (as a creature does, beasts/beast.js). Drawn along the way
// the ox has gone (trail), as a wagon follows its team round a corner, not turned with the ox: its
// tail, four metres behind the ox, would swing out into whatever's beside its way (a gate's side,
// the ox turning off as it's through).

import * as THREE from "three";
import { createRandom } from "../../../core/random.js";
import { material } from "../engine/materials.js";
import { Solid } from "../engine/solid.js";
import { barrel, crate, prism as log, sack } from "./props.js";
import { heap, WORKS_STUFF } from "./works.js";

// World pixels in a metre
const M = 5;
const m = (metres) => metres * M;

/**
 * A wagon's measures (metres): its bed, `long` by `wide`, its floor `floor` up and its sides
 * `sides` high; its wheels `wheel` across (radius), `spokes` each, `in` from the bed's ends; its
 * shafts, `gap` behind the ox's rump to the bed's front.
 */
export const WAGON = Object.freeze({ long: 2.5, wide: 1.25, floor: 0.88, sides: 0.38, wheel: 0.46, spokes: 8, in: 0.42, gap: 0.35 });

/** What a wagon can be laden with (core/war/war.js RESOURCES, or an army's supplies), or null: empty. */
export const LADEN = Object.freeze(["wood", "stone", "metal", "supplies"]);

/** How far apart the points of an ox's track are kept (metres): the way its wagon's drawn along. */
const TRACK = 0.2;

/** How far an ox goes from one frame to the next (metres) that's taken to be put there, not walked. */
const PUT = 2;

/**
 * Where a wagon's drawn behind its ox, along the way the ox has gone: the middle of its bed's front
 * `front` metres back along `track` (where the ox has been, newest first, [x, z] metres) from where
 * it is (`at`), its tail `long` metres further back along it; straight back from the track's end,
 * the way the ox faces (`facing`: radians from +z towards +x), where the track's shorter. Returns
 * { at ([x, z]: the middle of its bed's front), facing (the way the bed faces, as the ox's) }.
 */
export function trail(track, at, facing, front, long = WAGON.long) {
    const back = (metres) => {
        let [x, z] = at;
        let left = metres;

        for (const [px, pz] of track) {
            const d = Math.hypot(px - x, pz - z);

            if (d >= left && d > 1e-9) {
                return [x + ((px - x) / d) * left, z + ((pz - z) / d) * left];
            }

            [x, z, left] = [px, pz, left - d];
        }

        return [x - Math.sin(facing) * left, z - Math.cos(facing) * left];
    };
    const [head, tail] = [back(front), back(front + long)];

    return { at: head, facing: Math.atan2(head[0] - tail[0], head[1] - tail[1]) };
}

/**
 * A wagon drawn behind an ox of `ox`'s measures (metres, as drawn: its body's `length`, how high
 * it stands at the shoulder, `height`, and how wide its chest, `width`), laden with `load`, in
 * its `people`'s timber. Returns { object (in metres: the ox's shafts and yoke, and the bed),
 * bed (the wagon itself: its bed, wheels and load, about the middle of its bed's front, `front`
 * metres behind the ox's middle), front, wheels (each turned about its axle, x), setLoad(load),
 * dispose() }.
 */
export function wagonOf(ox, { load = null, people = "human", seed = 1 } = {}) {
    const stuff = WORKS_STUFF[people] ?? WORKS_STUFF.human;
    const object = new THREE.Group();
    const bed = new THREE.Group();
    const onBed = new THREE.Group();
    const front = ox.length * 0.55 + WAGON.gap;
    const back = front + WAGON.long;
    const solid = new Solid();
    const shafts = new Solid();

    object.name = "wagon";
    bed.name = "bed";
    bed.position.z = -front;
    onBed.position.z = front;
    bed.add(onBed);
    object.add(bed);

    // The bed: its floor on two beams along it, boards along its sides and across its ends, a
    // stake at each corner and two along each side
    const [x0, x1] = [-WAGON.wide / 2, WAGON.wide / 2];
    const [z0, z1] = [-back, -front];
    const floor = WAGON.floor;
    const timber = material(stuff.timber);
    const boards = material(stuff.boards);

    for (const x of [x0 + 0.22, x1 - 0.22]) {
        solid.beam([m(x), m(floor - 0.08), m(z0 - 0.1)], [m(x), m(floor - 0.08), m(z1 + 0.05)], m(0.12), m(0.12), timber);
    }

    solid.box(m(x0), m(floor - 0.02), m(z0), m(x1), m(floor + 0.04), m(z1), boards);

    for (const [k, high] of [[0, 0.16], [1, 0.36]]) {
        const y = floor + 0.04 + k * 0.18;

        for (const x of [x0, x1 - 0.04]) {
            solid.box(m(x), m(y), m(z0), m(x + 0.04), m(floor + 0.04 + high), m(z1), boards);
        }

        for (const z of [z0, z1 - 0.04]) {
            solid.box(m(x0), m(y), m(z), m(x1), m(floor + 0.04 + high), m(z + 0.04), boards);
        }
    }

    for (const x of [x0 - 0.02, x1 - 0.04]) {
        for (const u of [0, 0.5, 1]) {
            const z = z0 + 0.05 + u * (WAGON.long - 0.12);

            solid.box(m(x), m(floor - 0.12), m(z - 0.04), m(x + 0.06), m(floor + WAGON.sides + 0.12), m(z + 0.04), timber);
        }
    }

    // Its axles, across under the bed
    const axles = [z1 - WAGON.in, z0 + WAGON.in];

    for (const z of axles) {
        solid.beam([m(x0 - 0.12), m(WAGON.wheel), m(z)], [m(x1 + 0.12), m(WAGON.wheel), m(z)], m(0.1), m(0.1), timber);
        solid.box(m(-0.08), m(WAGON.wheel), m(z - 0.06), m(0.08), m(floor - 0.14), m(z + 0.06), timber);
    }

    // Its shafts, forward from the bed either side of the ox to its neck; the yoke across its neck
    // in front of its shoulders, bowed down at its ends to the shafts
    const neck = ox.length * 0.4;
    const spread = ox.width + 0.12;
    const [low, high] = [ox.height * 0.7, ox.height * 0.96];

    for (const side of [-1, 1]) {
        shafts.beam([m(side * (WAGON.wide / 2 - 0.12)), m(floor - 0.06), m(z1 + 0.3)], [m(side * spread), m(low), m(z1 + 0.02)], m(0.08), m(0.08), timber);
        shafts.beam([m(side * spread), m(low), m(z1 + 0.02)], [m(side * spread), m(low + 0.04), m(neck + 0.1)], m(0.08), m(0.08), timber);
        shafts.beam([m(side * spread), m(low + 0.02), m(neck)], [m(side * ox.width * 0.6), m(high), m(neck)], m(0.09), m(0.09), timber);
    }

    shafts.beam([m(-ox.width * 0.62), m(high), m(neck)], [m(ox.width * 0.62), m(high), m(neck)], m(0.14), m(0.1), timber);

    object.add(scaled(shafts.toObject()));
    onBed.add(scaled(solid.toObject()));

    // Its wheels: a rim of felloes, spokes to a hub; each turned about its own axle as it goes
    const wheels = [];

    for (const z of axles) {
        for (const side of [-1, 1]) {
            const pivot = new THREE.Group();

            pivot.position.set(side * (WAGON.wide / 2 + 0.16), WAGON.wheel, z);
            pivot.add(scaled(wheelOf(stuff)));
            onBed.add(pivot);
            wheels.push(pivot);
        }
    }

    // What it's laden with, on its floor
    let laden = null;

    const setLoad = (what) => {
        laden?.removeFromParent();
        dispose(laden);
        laden = what ? scaled(loadOf(what, stuff, createRandom(seed * 31 + LADEN.indexOf(what) + 1))) : null;

        if (laden) {
            laden.position.set(0, floor + 0.04, (z0 + z1) / 2);
            onBed.add(laden);
        }
    };

    setLoad(LADEN.includes(load) ? load : null);

    return {
        object,
        bed,
        front,
        wheels,
        setLoad,
        dispose: () => dispose(object),
    };
}

/**
 * An ox (a BeastAvatar of beasts/looks.js ox) put in a wagon's shafts: the wagon behind it, laden
 * with `load`, drawn along the way the ox has gone (trail); its wheels turning as far as the ox
 * goes. The ox's avatar's `wagon` is the wagon (wagonOf's), to lade or empty.
 */
export function hitch(avatar, look, { load = null, people = "human", seed = 1 } = {}) {
    const scale = avatar.scale ?? 1;
    const wagon = wagonOf({ length: look.length * scale, height: look.height * scale, width: look.width * look.chest * scale }, { load, people, seed });
    const update = avatar.update.bind(avatar);
    const dispose = avatar.character.dispose;
    // (Where the ox has been, newest first, as far back as its wagon reaches)
    const track = [];
    const reach = wagon.front + WAGON.long + TRACK;

    avatar.object.add(wagon.object);
    avatar.wagon = wagon;
    avatar.update = (dt, ...rest) => {
        update(dt, ...rest);

        const { position, rotation } = avatar.object;
        const at = [position.x, position.z];
        const moved = track.length ? Math.hypot(at[0] - track[0][0], at[1] - track[0][1]) : Infinity;

        // (Put somewhere, not walked there: its track begun again)
        if (moved > PUT) {
            track.length = 0;
        }

        if (moved >= TRACK) {
            track.unshift(at);

            for (let k = 1, length = 0; k < track.length; k++) {
                length += Math.hypot(track[k][0] - track[k - 1][0], track[k][1] - track[k - 1][1]);

                if (length > reach) {
                    track.length = k + 1;
                    break;
                }
            }
        }

        // (The bed where it's drawn along the track, in the ox's own frame)
        const drawn = trail(track, at, rotation.y, wagon.front);
        const [dx, dz] = [drawn.at[0] - at[0], drawn.at[1] - at[1]];
        const [c, s] = [Math.cos(rotation.y), Math.sin(rotation.y)];

        wagon.bed.position.set(dx * c - dz * s, 0, dx * s + dz * c);
        wagon.bed.rotation.y = drawn.facing - rotation.y;

        const turned = (avatar.speed * dt) / WAGON.wheel;

        for (const wheel of wagon.wheels) {
            wheel.rotation.x += turned;
        }
    };
    avatar.character.dispose = () => {
        wagon.object.removeFromParent();
        wagon.dispose();
        dispose();
    };

    return wagon;
}

// A wheel (world pixels), about its axle along x: felloes round its rim, spokes from its hub
function wheelOf(stuff) {
    const solid = new Solid();
    const timber = material(stuff.timber);
    const r = m(WAGON.wheel);
    const rim = 14;
    const at = (a, radius) => [0, Math.sin(a) * radius, Math.cos(a) * radius];

    for (let k = 0; k < rim; k++) {
        const [a, b] = [(k / rim) * Math.PI * 2, ((k + 1) / rim) * Math.PI * 2];

        solid.beam(at(a, r - m(0.04)), at(b, r - m(0.04)), m(0.08), m(0.08), timber, { up: [1, 0, 0] });
    }

    for (let k = 0; k < WAGON.spokes; k++) {
        const a = ((k + 0.5) / WAGON.spokes) * Math.PI * 2;

        solid.beam(at(a, m(0.1)), at(a, r - m(0.07)), m(0.035), m(0.05), timber, { up: [1, 0, 0] });
    }

    solid.beam([-m(0.09), 0, 0], [m(0.09), 0, 0], m(0.2), m(0.2), timber);

    return solid.toObject();
}

// What a wagon's laden with (world pixels, on its floor, in the middle of it)
function loadOf(what, stuff, random) {
    const solid = new Solid();
    const [wide, long] = [m(WAGON.wide - 0.12), m(WAGON.long - 0.1)];

    if (what === "wood") {
        // Logs, along it: four below and three over them, a little longer than the bed
        for (const [row, count] of [[0, 4], [1, 3]]) {
            for (let k = 0; k < count; k++) {
                const x = (k - (count - 1) / 2) * m(0.27);
                const y = m(0.13) + row * m(0.23);
                const [a, b] = [-long / 2 - m(random.range(0.05, 0.3)), long / 2 + m(random.range(-0.05, 0.15))];

                log(solid, [x, y, a], [x, y, b], m(0.13), "bark", stuff.boards, 7);
            }
        }
    } else if (what === "stone") {
        // Blocks squared and dressed, two by two, and a rough one over them
        for (const [x, z, y, s] of [[-0.3, -0.55, 0, 1], [0.3, -0.5, 0, 0.95], [-0.28, 0.5, 0, 0.9], [0.3, 0.55, 0, 1], [0, 0, 0.42, 0.85]]) {
            const [hx, hz, hy] = [m(0.27 * s), m(0.4 * s), m(0.2 * s)];
            const turn = random.range(-0.12, 0.12);

            solid.turnedBox(m(x), m(z), hx, hz, m(y), m(y) + hy * 2, turn, material(y ? stuff.cut : stuff.dressed));
        }
    } else if (what === "metal") {
        // Iron in bars at its back, two courses along it and one across them; red ore heaped at
        // its front
        const iron = material("iron-black");
        const [b0, b1] = [-long / 2 + m(0.08), -long / 2 + m(1)];

        for (const [row, along] of [[0, true], [1, true], [2, false]]) {
            const y = m(0.04) + row * m(0.08);

            for (let k = 0; k < 4; k++) {
                const u = (k - 1.5) * m(0.14);

                if (along) {
                    solid.box(u - m(0.035), y - m(0.035), b0, u + m(0.035), y + m(0.035), b1, iron);
                } else {
                    const z = (b0 + b1) / 2 + u * 1.4;

                    solid.box(-m(0.3), y - m(0.035), z - m(0.035), m(0.3), y + m(0.035), z + m(0.035), iron);
                }
            }
        }

        heap(solid, random, [0, long * 0.24], wide * 0.42, m(0.42), "rock-red", { lumps: 8, lump: "rust", round: 0.3, sunk: 0 });
    } else if (what === "supplies") {
        // An army's supplies: two barrels at its back, a crate in the middle, and sacks of grain
        // slumped at its front
        for (const x of [-0.27, 0.27]) {
            barrel(solid, m(x), -long / 2 + m(0.36), m(0.62), m(0.22));
        }

        crate(solid, 0, m(0.05), m(0.5), random.range(-0.15, 0.15));

        for (const [x, z] of [[-0.3, 0.62], [0, 0.78], [0.3, 0.6]]) {
            sack(solid, m(x), m(z), m(random.range(0.48, 0.56)), m(random.range(-0.04, 0.04)));
        }
    }

    return solid.toObject();
}

// What's built in world pixels drawn at a metre's scale
function scaled(object) {
    object.scale.setScalar(1 / M);

    return object;
}

// The geometries (not the materials: shared, kits/materials.js) of what's built let go
function dispose(object) {
    object?.traverse((node) => node.geometry?.dispose());
}
