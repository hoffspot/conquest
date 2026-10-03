// Lights on the peoples' buildings (the terrain plan's M7e): torches in iron brackets either side
// of a keep's door and a gatehouse's way through, lit at night (world/lights.js draws their flames
// and glows, and lights what's round the nearest); and the lanterns already hung by taverns' and
// town halls' doors, marked to be lit. Sizes are world pixels (five to a metre), as the kits'.

import { material } from "../engine/materials.js";

// World pixels in a metre
const m = (metres) => metres * 5;

/**
 * A torch on a wall: an iron plate on the wall at `at` ([x, y, z], world pixels), an arm out from
 * it the way `out` says ([x, z], a unit length), and a wooden torch in its ring leaning out, its
 * flame (world/lights.js "torch") at its top.
 */
export function torch(solid, [x, y, z], [ox, oz]) {
    const iron = material("iron");
    const [px, pz] = [-oz, ox];
    const ring = [x + ox * m(0.2), y, z + oz * m(0.2)];
    const top = [x + ox * m(0.3), y + m(0.32), z + oz * m(0.3)];
    const foot = [x + ox * m(0.14), y - m(0.22), z + oz * m(0.14)];

    // (The plate, its long side up the wall)
    solid.box(
        x - Math.abs(px) * m(0.07) - Math.abs(ox) * m(0.01),
        y - m(0.18),
        z - Math.abs(pz) * m(0.07) - Math.abs(oz) * m(0.01),
        x + Math.abs(px) * m(0.07) + Math.abs(ox) * m(0.03),
        y + m(0.08),
        z + Math.abs(pz) * m(0.07) + Math.abs(oz) * m(0.03),
        iron,
    );
    solid.beam([x, y - m(0.05), z], ring, m(0.035), m(0.035), iron);
    solid.beam(foot, top, m(0.07), m(0.07), material("timber"));
    solid.beam([ring[0] - px * m(0.06), ring[1], ring[2] - pz * m(0.06)], [ring[0] + px * m(0.06), ring[1], ring[2] + pz * m(0.06)], m(0.03), m(0.03), iron);
    (solid.lights ??= []).push([top[0], top[1], top[2], "torch"]);
}

/** A lantern's light, at its middle ([x, y, z], world pixels): its glass is "glass-lit". */
export function lanternLight(solid, [x, y, z]) {
    (solid.lights ??= []).push([x, y, z, "lantern"]);
}
