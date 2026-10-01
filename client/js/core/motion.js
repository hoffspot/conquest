// The motion stream (docs/WAR.md, playing together): where the host's characters near its
// players stand and how they're going, every few steps, packed small (16 bytes each) and sent as
// base64 (core/wire.js) to those who've joined. A joined copy plays the same steps and should
// have them standing just where the host's did: one that doesn't has gone astray, and knows it
// within a fifth of a second, rather than waiting for the next checksum (core/netplay.js
// CHECK_EVERY: five seconds).
//
// Each character, packed (little-endian):
//
//   index    uint16   its place in the battle's characters (the same in every copy, step for step)
//   x, y     int32    where it is (cm)
//   vx, vy   int16    how fast it's going, and which way (cm/s)
//   heading  uint8    which way it faces (a 256th of a turn, from south turning towards east)
//   flags    uint8    moving, running, fighting, dead; and the corners left on its way (0-15)
//
// Pure: no DOM, no network; exact maths (core/exact.js), so every copy packs alike.

import { shareOf } from "./afflictions.js";
import { cos, sin, TAU } from "./exact.js";

/**
 * Every how many steps the host sends it; how near a player a character must be to go in it (m,
 * on the player's map); how many go in it at most (the nearest the players); how many bytes each
 * takes; and how far apart (cm) a copy's character and the host's may stand before the copy's
 * gone astray (both are rounded to the centimetre: a hair's difference can round 1 cm apart).
 */
export const MOTION = Object.freeze({ every: 4, reach: 160, most: 64, size: 16, near: 1 });

const FLAG = Object.freeze({ moving: 1, running: 2, fighting: 4, dead: 8 });

const clamp16 = (value) => Math.max(-32768, Math.min(32767, value)) | 0;

/** How a character's going, as it's packed: { x, y, vx, vy (cm, cm/s), heading, flags }. */
export function motionOf(actor) {
    const moving = actor.progress !== null && !actor.dead;
    const speed = moving ? actor.pace * shareOf(actor, "speed") * 100 : 0;
    const fighting = Boolean(actor.attack) || actor.target !== null || actor.order?.type === "engage";

    return {
        x: Math.round(actor.x * 100),
        y: Math.round(actor.y * 100),
        vx: clamp16(Math.round(speed * sin(actor.facing))),
        vy: clamp16(Math.round(speed * cos(actor.facing))),
        heading: Math.round((actor.facing * 256) / TAU) & 255,
        flags: (moving ? FLAG.moving : 0) | (actor.running ? FLAG.running : 0) | (fighting ? FLAG.fighting : 0) | (actor.dead ? FLAG.dead : 0) | (Math.min(actor.path.length, 15) << 4),
    };
}

/**
 * The characters of a host's battle within `reach` of any of its players (on that player's map),
 * the nearest first, `most` of them at most, packed: a Uint8Array.
 */
export function packMotion(host, { reach = MOTION.reach, most = MOTION.most } = {}) {
    const { actors } = host.battle;
    const players = [...host.players.keys()].map((id) => host.battle.actor(id)).filter(Boolean);
    const near = [];

    for (let index = 0; index < actors.length && index < 65536; index++) {
        const actor = actors[index];
        let nearest = Infinity;

        for (const player of players) {
            if (player.map === actor.map) {
                const [dx, dy] = [actor.x - player.x, actor.y - player.y];

                nearest = Math.min(nearest, dx * dx + dy * dy);
            }
        }

        if (nearest <= reach * reach) {
            near.push({ index, nearest });
        }
    }

    near.sort((a, b) => a.nearest - b.nearest || a.index - b.index);

    const chosen = near.slice(0, most);
    const bytes = new Uint8Array(chosen.length * MOTION.size);
    const view = new DataView(bytes.buffer);

    chosen.forEach(({ index }, k) => {
        const { x, y, vx, vy, heading, flags } = motionOf(actors[index]);
        const at = k * MOTION.size;

        view.setUint16(at, index, true);
        view.setInt32(at + 2, x, true);
        view.setInt32(at + 6, y, true);
        view.setInt16(at + 10, vx, true);
        view.setInt16(at + 12, vy, true);
        view.setUint8(at + 14, heading);
        view.setUint8(at + 15, flags);
    });

    return bytes;
}

/** Packed motion (as packMotion made it) unpacked: [{ index, x, y, vx, vy, heading, flags }]. */
export function unpackMotion(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const units = [];

    for (let at = 0; at + MOTION.size <= bytes.byteLength; at += MOTION.size) {
        units.push({
            index: view.getUint16(at, true),
            x: view.getInt32(at + 2, true),
            y: view.getInt32(at + 6, true),
            vx: view.getInt16(at + 10, true),
            vy: view.getInt16(at + 12, true),
            heading: view.getUint8(at + 14),
            flags: view.getUint8(at + 15),
        });
    }

    return units;
}

/**
 * The host's motion (unpacked) against a copy's battle at the same step: the indexes of those
 * standing apart (more than `near` cm either way), or missing from it.
 */
export function compareMotion(battle, units, near = MOTION.near) {
    const apart = [];

    for (const unit of units) {
        const actor = battle.actors[unit.index];

        if (!actor || Math.abs(Math.round(actor.x * 100) - unit.x) > near || Math.abs(Math.round(actor.y * 100) - unit.y) > near) {
            apart.push(unit.index);
        }
    }

    return apart;
}

export { FLAG as MOTION_FLAGS };
