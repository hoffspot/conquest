// The flames lighting a room indoors (interiors3d.js: every hearth's fire, wheel of candles,
// candle and sconce), each lighting the walls, floor, ceiling and furniture round it as a point
// light does, falling off with distance out to its reach, flickering as flames do: a hearth's
// fire or a candle as its flame drawn does (fire.js: the same signal, seed and clock).
//
// Three.js gives every lit material in the scene the same lights, so each one costs every
// fragment drawn, out of doors too; a room has a dozen. So the insides' own materials (drawn
// only indoors) light themselves from a list of them here (ROOM_LIGHT, uniforms the view sets
// each frame), the same sums three.js does for a point light (no shadows); and the two lights
// that matter most where the player is are the view's two real lamps instead, lighting the folk
// and everything else as well (and left out of the list, so nothing's lit by them twice).
//
// Pure maths on plain numbers but for the uniforms, so it's tested in Node.

import * as THREE from "three";
import { fireSignal, fireStrength } from "./fire.js";

/** How many lights a room can have (a room with more has its nearest candles taken together). */
export const ROOM_LIGHTS = 16;

/**
 * Each light where it is now (x, y, z: world metres; w: its reach, metres) and how bright (its
 * colour times its strength, linear), the first `count` of them lit, for the insides' materials;
 * set each frame by the view (view.js flicker). (Only those `count`: each costs every pixel of
 * the room drawn, so a room lit by four costs four, not all ROOM_LIGHTS.)
 */
export const ROOM_LIGHT = Object.freeze({
    at: { value: Array.from({ length: ROOM_LIGHTS }, () => new THREE.Vector4()) },
    colour: { value: Array.from({ length: ROOM_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
    count: { value: 0 },
    fill: { value: new THREE.Color(0, 0, 0) },
});

/**
 * How much of the flames' light comes back off the room's walls, floor and ceiling, lighting it
 * all round (as fillOf has it): about as much as a room of dark wood and plaster gives back
 * (a share of the light from all its flames, spread over its walls, floor and ceiling, about
 * 2.7 times its floor).
 */
export const BOUNCE = 4;

/**
 * The light a room's flames give it all round, off its walls, floor and ceiling (so it's never
 * black beyond their reach, and the brighter its flames, the brighter it is): their colours
 * (linear THREE.Colors) times their strengths now, over its floor (square metres), BOUNCE times
 * that. Into `fill` (a THREE.Color).
 */
export function fillOf(colours, strengths, floor, fill) {
    fill.setRGB(0, 0, 0);

    colours.forEach((colour, k) => {
        fill.r += colour.r * strengths[k];
        fill.g += colour.g * strengths[k];
        fill.b += colour.b * strengths[k];
    });

    return fill.multiplyScalar(BOUNCE / Math.max(1, floor));
}

/**
 * A room with more flames than the list holds (a dungeon's level, a long way across, torches all
 * along its walls): lit by the ROOM_LIGHTS nearest the player (nearestOf), and all round by the
 * flames within `reach` metres of them, each the less the further off (fillNear), as a room of
 * `floor` square metres would be (a room's worth round the player, not the whole level's floor).
 */
export const NEAR_FILL = Object.freeze({ reach: 18, floor: 220 });

/**
 * The light a big room's flames give it all round where the player is (`at`: { x, y, z } world
 * metres): their colours times their strengths now, those within NEAR_FILL.reach, fading to
 * nothing at it, over NEAR_FILL.floor, BOUNCE times that. Into `fill` (a THREE.Color).
 */
export function fillNear(lights, colours, strengths, at, fill) {
    fill.setRGB(0, 0, 0);

    lights.forEach(({ x, y, z }, k) => {
        const share = strengths[k] * Math.max(0, 1 - Math.hypot(x - at.x, y - at.y, z - at.z) / NEAR_FILL.reach);

        fill.r += colours[k].r * share;
        fill.g += colours[k].g * share;
        fill.b += colours[k].b * share;
    });

    return fill.multiplyScalar(BOUNCE / NEAR_FILL.floor);
}

/**
 * A room's lights by index, nearest the point `at` ({ x, y, z } world metres: the player) first,
 * into `out` (an array, emptied first).
 */
export function nearestOf(lights, at, out = []) {
    const away = (k) => Math.hypot(lights[k].x - at.x, lights[k].y - at.y, lights[k].z - at.z);

    out.length = 0;

    for (let k = 0; k < lights.length; k++) {
        out.push(k);
    }

    return out.sort((a, b) => away(a) - away(b) || a - b);
}

/**
 * Lighting from the list (ROOM_LIGHT), in three.js's own shader for a lit material (as
 * onBeforeCompile is given it, its world position in `vCutWorld`: interiors3d.js cutShader):
 * each light as three.js lights a point light, decaying with the square of the distance, cut
 * off smoothly at its reach; and the light they give the room all round (fillOf). (Unlit
 * materials, with no lights to add to, are left as they are.)
 */
export function roomLit(shader) {
    shader.uniforms.roomAt = ROOM_LIGHT.at;
    shader.uniforms.roomColour = ROOM_LIGHT.colour;
    shader.uniforms.roomCount = ROOM_LIGHT.count;
    shader.uniforms.roomFill = ROOM_LIGHT.fill;
    shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform vec4 roomAt[${ROOM_LIGHTS}];\nuniform vec3 roomColour[${ROOM_LIGHTS}];\nuniform int roomCount;\nuniform vec3 roomFill;`)
        .replace(
            "#include <lights_fragment_end>",
            `#include <lights_fragment_end>
{
    // (Three.js's sums for a point light, from the distance squared (\`apart\`), so with no
    // square root but the one: its edge, (1 - (d / reach)^4)^2; the light from all of them
    // added up, and then reflected once)
    vec3 roomNormal = transformNormalByInverseViewMatrix(normal, viewMatrix);
    vec3 roomLight = roomFill;

    for (int i = 0; i < ${ROOM_LIGHTS}; i++) {
        if (i >= roomCount) break;

        vec3 toLight = roomAt[i].xyz - vCutWorld;
        float apart = dot(toLight, toLight);
        float far = roomAt[i].w * roomAt[i].w;

        if (apart >= far) continue;

        float edge = saturate(1.0 - (apart * apart) / (far * far));

        roomLight += saturate(dot(roomNormal, toLight) * inversesqrt(max(apart, 1e-6))) * edge * edge / max(apart, 0.01) * roomColour[i];
    }

    reflectedLight.directDiffuse += roomLight * BRDF_Lambert(material.diffuseColor);
}`,
        );
}

// How long a flaring light (a forge's fire, the bellows pumped) takes to die down (seconds)
const FLARE = 1;

const _signal = { puff: 0, gust: 0 };

/**
 * How bright a light is at `time` (seconds): its `intensity`, flickering by its `flicker` (a
 * share of it: a fire's lively, a lamp's steadier), each its own way (`seed`), flared up by
 * `flare` ({ amount, at }: that much brighter at `at`, dying down over a second). A light with
 * a flame drawn (its `rate`, a second, and `steady`: fire.js's) rises and falls as that flame
 * does, by the drawing's clock (`fireTime`: WINDOW_LIGHT.z, as the flame has it).
 */
export function strengthOf({ intensity, flicker = 0, seed = 0, rate = 0, steady = 1 }, time, flare = null, fireTime = time) {
    const flaring = flare ? flare.amount * Math.max(0, 1 - (time - flare.at) / FLARE) : 0;

    if (rate > 0) {
        return intensity * fireStrength(fireSignal(seed, rate, fireTime, _signal), steady) * (1 + flaring);
    }

    const wave = Math.sin(time * 9.1 + seed) * 0.5 + Math.sin(time * 23.7 + seed * 2) * 0.3 + Math.sin(time * 4.3 + seed * 0.5) * 0.2;

    return intensity * (1 + flicker * wave) * (1 + flaring);
}

/**
 * Which of a room's lights the view's real lamps should be (`count` of them, by index): those
 * lighting the point `at` ({ x, y, z } world metres: the player) most, as a point light would
 * (strength over distance squared, none past its reach); one a lamp is already (`held`) kept
 * unless another lights the point half as much again.
 */
export function pickLamps(lights, strengths, at, count, held = []) {
    const lighting = lights.map(({ x, y, z, distance }, k) => {
        const away = Math.hypot(x - at.x, y - at.y, z - at.z);

        return away >= distance ? 0 : strengths[k] / Math.max(1, away * away);
    });
    const best = lighting.map((_, k) => k).filter((k) => lighting[k] > 0).sort((a, b) => lighting[b] - lighting[a] || a - b);
    const chosen = held.filter((k) => lighting[k] > 0 && best.indexOf(k) < count + 2).slice(0, count);

    for (const k of best) {
        if (chosen.length >= count) {
            const weakest = chosen.reduce((low, each) => (lighting[each] < lighting[low] ? each : low), chosen[0]);

            if (!chosen.includes(k) && lighting[k] > lighting[weakest] * 1.5) {
                chosen[chosen.indexOf(weakest)] = k;
            }
        } else if (!chosen.includes(k)) {
            chosen.push(k);
        }
    }

    return chosen.sort((a, b) => a - b);
}

/**
 * A room's lights as few as there may be (ROOM_LIGHTS): while there are more, the two nearest
 * together of the same kind (candles on a table, a stand of them before a shrine) taken as one,
 * as bright as both, where they are between them (weighed by their strengths), reaching as far
 * as the further; fires never (the forge's must stay first, flared by the bellows). The first
 * light stays first.
 */
export function gather(lights, most = ROOM_LIGHTS) {
    const list = lights.map((light) => ({ ...light }));

    while (list.length > most) {
        let pair = null;

        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const [a, b] = [list[i], list[j]];

                if (a.kind !== b.kind || a.kind === "fire") {
                    continue;
                }

                const apart = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

                if (!pair || apart < pair.apart) {
                    pair = { i, j, apart };
                }
            }
        }

        if (!pair) {
            break;
        }

        const [a, b] = [list[pair.i], list[pair.j]];
        const total = a.intensity + b.intensity;
        const share = b.intensity / total;

        list[pair.i] = { ...a, x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, z: a.z + (b.z - a.z) * share, intensity: total, distance: Math.max(a.distance, b.distance) + pair.apart / 2 };
        list.splice(pair.j, 1);
    }

    return list;
}
