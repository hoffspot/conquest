// The doors and stairs the player can tap to go through (the world's links: core/world.js,
// core/interiors.js): where each end of each is in the world, a box a tap's ray can hit, and a
// green glow traced round its edge, lit when it's tapped and kept lit while the player walks
// there, pulsing, then fading once they're through.

import * as THREE from "three";
import { STOREY } from "../world/interiors3d.js";

// The glow: a bright line round the edge and a softer band either side (metres wide), pulsing
// this many times a second, fading in and out this fast (per second); a tap lights it for at
// least this long (s)
const GLOW = Object.freeze({ core: 0.07, halo: 0.34, pulse: 1.6, fade: 5, least: 1.2 });
const GREEN = 0x3dff78;

/**
 * A flat band round a closed loop of points (world metres), lying in the plane with normal
 * `normal`, `width` metres wide.
 */
export function ribbon(points, normal, width) {
    const positions = [];
    const side = new THREE.Vector3();
    const along = new THREE.Vector3();

    points.forEach((a, k) => {
        const b = points[(k + 1) % points.length];

        along.subVectors(b, a).normalize();
        side.crossVectors(normal, along).normalize().multiplyScalar(width / 2);

        // Past each corner a little, so the corners are filled
        const [a0, b0] = [a.clone().addScaledVector(along, -width / 2), b.clone().addScaledVector(along, width / 2)];
        const corners = [a0.clone().sub(side), b0.clone().sub(side), b0.clone().add(side), a0.clone().add(side)];

        for (const index of [0, 1, 2, 0, 2, 3]) {
            positions.push(corners[index].x, corners[index].y, corners[index].z);
        }
    });

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    return geometry;
}

function glowMaterial(opacity) {
    return new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
}

// The shape of one end of a link, in its map's own metres: { box: [x0, y0, z0, x1, y1, z1],
// loop: [[x, y, z]...], normal: [x, y, z] }, or null
function shapeOf(world, link, end) {
    const map = world.maps[end.map];

    if (link.kind === "door" && end.map === "town") {
        // The tavern's front door, turned the way the tavern faces
        const { door } = world.tavern;
        const out = [Math.sin(door.facing), Math.cos(door.facing)];
        const across = [Math.cos(door.facing), -Math.sin(door.facing)];
        const half = door.width / 2 + 0.08;
        const [bottom, top] = [door.floor - 0.06, door.floor + door.height + 0.1];
        const at = (a, y, o = 0.12) => [door.x + across[0] * a + out[0] * o, y, door.z + across[1] * a + out[1] * o];
        const corners = [at(-half, bottom), at(half, bottom), at(half, top), at(-half, top)];
        const xs = corners.map(([x]) => x);
        const zs = corners.map(([, , z]) => z);

        return {
            box: [Math.min(...xs) - 0.3, bottom, Math.min(...zs) - 0.3, Math.max(...xs) + 0.3, top, Math.max(...zs) + 0.3],
            loop: corners,
            normal: [out[0], 0, out[1]],
        };
    }

    if (link.kind === "door") {
        // The inside of a door in the south wall, between its squares
        const xs = end.squares.map(([x]) => x);
        const middle = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
        const z = map.height - 0.12;
        const corners = [[middle - 0.98, 0, z], [middle + 0.98, 0, z], [middle + 0.98, 2.5, z], [middle - 0.98, 2.5, z]];

        return { box: [middle - 1.1, 0, z - 0.6, middle + 1.1, 2.6, map.height + 0.2], loop: corners, normal: [0, 0, -1] };
    }

    // Stairs along the north wall: from below, round their side; from above, round the stairwell
    const stair = map.pieces.find((piece) => piece.kind === "stairs");
    const [x0, x1] = [stair.x - 0.05, stair.x + stair.w + 0.05];
    const z = stair.y + stair.h;

    if (end.map === "upstairs") {
        return {
            box: [x0, -0.6, stair.y - 0.1, x1, 1.2, z + 0.4],
            loop: [[x0, 0.04, stair.y + 0.04], [x1, 0.04, stair.y + 0.04], [x1, 0.04, z + 0.05], [x0, 0.04, z + 0.05]],
            normal: [0, 1, 0],
        };
    }

    return {
        box: [x0, 0, stair.y - 0.1, x1, STOREY + 0.4, z + 0.4],
        loop: [[x0, 0.03, z + 0.06], [x1, 0.03, z + 0.06], [x1, STOREY + 1, z + 0.06], [x0, 1.25, z + 0.06]],
        normal: [0, 0, 1],
    };
}

export class Doors {
    /**
     * @param {object} world - From generateWorld: its maps and links.
     * @param {THREE.Object3D} parent - Where to put the glows.
     */
    constructor(world, parent) {
        this.object = new THREE.Group();
        this.object.name = "doors";
        parent.add(this.object);

        /** Each end of each link: { link, end, map, box (world), glow, level, litUntil }. */
        this.targets = [];

        for (const link of world.links) {
            for (const end of link.ends) {
                const shape = shapeOf(world, link, end);
                const [ox, oz] = world.maps[end.map].origin;
                const [x0, y0, z0, x1, y1, z1] = shape.box;
                const loop = shape.loop.map(([x, y, z]) => new THREE.Vector3(x + ox, y, z + oz));
                const normal = new THREE.Vector3(...shape.normal);
                const glow = new THREE.Group();

                glow.add(new THREE.Mesh(ribbon(loop, normal, GLOW.halo), glowMaterial(0.22)));
                glow.add(new THREE.Mesh(ribbon(loop, normal, GLOW.core), glowMaterial(0.95)));
                glow.visible = false;
                glow.renderOrder = 4;
                glow.name = `${link.id}-${end.map}`;
                this.object.add(glow);

                this.targets.push({ link, end, map: end.map, box: new THREE.Box3(new THREE.Vector3(x0 + ox, y0, z0 + oz), new THREE.Vector3(x1 + ox, y1, z1 + oz)), glow, level: 0, litUntil: -Infinity });
            }
        }
    }

    /** The nearest door or stairs on `map` a ray (from the camera, world metres) hits, or null. */
    at(ray, map) {
        let best = null;
        let bestDistance = Infinity;
        const hit = new THREE.Vector3();

        for (const target of this.targets) {
            if (target.map === map && ray.intersectBox(target.box, hit)) {
                const distance = hit.distanceTo(ray.origin);

                if (distance < bestDistance) {
                    best = target;
                    bestDistance = distance;
                }
            }
        }

        return best;
    }

    /** Light a door's glow (it's been tapped), at `time` seconds. */
    light(target, time) {
        target.litUntil = time + GLOW.least;
    }

    /**
     * Advance by `dt` seconds (at `time`): glows lit while tapped lately or while the player is
     * on their way through (`heading`: the link id they were told to enter, on `map`), fading
     * otherwise, and pulsing.
     */
    update(dt, time, { map, heading = null }) {
        for (const target of this.targets) {
            const lit = target.map === map && (time < target.litUntil || heading === target.link.id);

            target.level = Math.max(0, Math.min(1, target.level + (lit ? 1 : -1) * GLOW.fade * dt));
            target.glow.visible = target.level > 0;

            if (target.glow.visible) {
                const pulse = 0.72 + 0.28 * Math.sin(time * Math.PI * 2 * GLOW.pulse);
                const [halo, core] = target.glow.children;

                halo.material.opacity = 0.22 * target.level * pulse;
                core.material.opacity = 0.95 * target.level * (0.8 + 0.2 * pulse);
            }
        }
    }

    dispose() {
        this.object.traverse((node) => {
            node.geometry?.dispose();
            node.material?.dispose();
        });
        this.object.removeFromParent();
    }
}
