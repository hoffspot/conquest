// Builds low-poly 3D shapes out of flat faces, for the pieces the art generator draws.
//
// Coordinates are in world pixels, as on the game's map: x points east, y up and z south, with
// the origin at the north-west corner of the piece's first grid square. Faces are grouped by
// material. Texture coordinates are world pixels too (each material's texture says how many
// pixels one copy of it covers), so brick courses and roof tiles are the same size on every
// piece and line up across neighbouring faces.

import * as THREE from "three";

// For each face, which two coordinates run across its texture: faces that face mostly up use x
// and z, faces facing north or south use x and y, faces facing east or west use z and y
function boxUV(point, normal) {
    const [nx, ny, nz] = normal.map(Math.abs);

    if (ny >= nx && ny >= nz) {
        return [point[0], -point[2]];
    }

    return nz >= nx ? [point[0], point[1]] : [-point[2], point[1]];
}

function normalOf(a, b, c) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n) || 1;

    return n.map((value) => value / length);
}

export class Solid {
    // Triangles for each material: { positions, normals, uvs }
    #groups = new Map();
    // Ready-made meshes added whole (cylinders and cones)
    #meshes = [];

    #group(material) {
        if (!this.#groups.has(material)) {
            this.#groups.set(material, { positions: [], normals: [], uvs: [] });
        }

        return this.#groups.get(material);
    }

    /**
     * A flat face with 3 or more corners, listed anticlockwise as seen from outside. `uvs` gives
     * each corner's texture position (in world pixels) instead of the default mapping.
     */
    face(points, material, uvs) {
        const normal = normalOf(points[0], points[1], points[2]);
        const group = this.#group(material);
        const corner = (index) => {
            group.positions.push(...points[index]);
            group.normals.push(...normal);
            group.uvs.push(...(uvs ? uvs[index] : boxUV(points[index], normal)));
        };

        for (let i = 1; i < points.length - 1; i++) {
            corner(0);
            corner(i);
            corner(i + 1);
        }

        return this;
    }

    /** A box from (x0, y0, z0) to (x1, y1, z1), without a bottom (it stands on something). */
    box(x0, y0, z0, x1, y1, z1, material, { top = material } = {}) {
        this.face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], top);
        this.face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], material);
        this.face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], material);
        this.face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], material);
        this.face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], material);

        return this;
    }

    /** A box standing on the ground at (cx, cz), turned `angle` radians about the vertical. */
    turnedBox(cx, cz, halfX, halfZ, y0, y1, angle, material) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const at = (x, z, y) => [cx + x * cos - z * sin, y, cz + x * sin + z * cos];
        const corners = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]];
        const bottom = corners.map(([x, z]) => at(x, z, y0));
        const top = corners.map(([x, z]) => at(x, z, y1));

        this.face([top[0], top[3], top[2], top[1]], material);

        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;

            this.face([bottom[j], bottom[i], top[i], top[j]], material);
        }

        return this;
    }

    /**
     * A pitched roof over the rectangle (x0, z0) to (x1, z1), its eaves at height `eaves`, rising
     * `pitch` pixels to the ridge. `ridge` is "x" (running east to west) or "z" (north to south);
     * a hipped roof slopes at the ends too, a gabled one has upright gable ends in `gable`.
     */
    roof(x0, z0, x1, z1, eaves, pitch, { ridge = "x", hipped = false, material, gable }) {
        const top = eaves + pitch;

        if (ridge === "x") {
            const mid = (z0 + z1) / 2;
            const inset = hipped ? Math.min((z1 - z0) / 2, (x1 - x0) / 2) : 0;
            const slope = Math.hypot(pitch, (z1 - z0) / 2);
            const a = x0 + inset;
            const b = x1 - inset;

            // South and north slopes: texture rows run along the eaves
            this.face([[x0, eaves, z1], [x1, eaves, z1], [b, top, mid], [a, top, mid]], material, [[x0, 0], [x1, 0], [b, slope], [a, slope]]);
            this.face([[x1, eaves, z0], [x0, eaves, z0], [a, top, mid], [b, top, mid]], material, [[x1, 0], [x0, 0], [a, slope], [b, slope]]);

            if (hipped) {
                this.face([[x1, eaves, z1], [x1, eaves, z0], [b, top, mid]], material, [[z1, 0], [z0, 0], [mid, slope]]);
                this.face([[x0, eaves, z0], [x0, eaves, z1], [a, top, mid]], material, [[z0, 0], [z1, 0], [mid, slope]]);
            } else {
                this.face([[x1, eaves, z1], [x1, eaves, z0], [x1, top, mid]], gable);
                this.face([[x0, eaves, z0], [x0, eaves, z1], [x0, top, mid]], gable);
            }
        } else {
            const mid = (x0 + x1) / 2;
            const inset = hipped ? Math.min((z1 - z0) / 2, (x1 - x0) / 2) : 0;
            const slope = Math.hypot(pitch, (x1 - x0) / 2);
            const a = z0 + inset;
            const b = z1 - inset;

            this.face([[x1, eaves, z1], [x1, eaves, z0], [mid, top, a], [mid, top, b]], material, [[z1, 0], [z0, 0], [a, slope], [b, slope]]);
            this.face([[x0, eaves, z0], [x0, eaves, z1], [mid, top, b], [mid, top, a]], material, [[z0, 0], [z1, 0], [b, slope], [a, slope]]);

            if (hipped) {
                this.face([[x0, eaves, z1], [x1, eaves, z1], [mid, top, b]], material, [[x0, 0], [x1, 0], [mid, slope]]);
                this.face([[x1, eaves, z0], [x0, eaves, z0], [mid, top, a]], material, [[x1, 0], [x0, 0], [mid, slope]]);
            } else {
                this.face([[x0, eaves, z1], [x1, eaves, z1], [mid, top, z1]], gable);
                this.face([[x1, eaves, z0], [x0, eaves, z0], [mid, top, z0]], gable);
            }
        }

        return this;
    }

    /** A pyramid roof over a rectangle, rising `pitch` pixels from `eaves`. */
    pyramid(x0, z0, x1, z1, eaves, pitch, material) {
        const apex = [(x0 + x1) / 2, eaves + pitch, (z0 + z1) / 2];
        const corners = [[x0, eaves, z0], [x0, eaves, z1], [x1, eaves, z1], [x1, eaves, z0]];

        for (let i = 0; i < 4; i++) {
            const a = corners[i];
            const b = corners[(i + 1) % 4];
            const along = Math.hypot(b[0] - a[0], b[2] - a[2]);
            // The west and east faces run halfway across the width to the apex, the others halfway
            // across the depth
            const slope = Math.hypot(pitch, (i % 2 === 0 ? x1 - x0 : z1 - z0) / 2);

            this.face([a, b, apex], material, [[0, 0], [along, 0], [along / 2, slope]]);
        }

        return this;
    }

    /**
     * An upright cylinder (or a cone, or a tapering tower) around (cx, cz): radius r0 at height y0
     * to r1 at y1. Its texture wraps around it in world pixels.
     */
    cylinder(cx, cz, y0, y1, r0, r1, material, { segments = 20, capped = true } = {}) {
        const geometry = new THREE.CylinderGeometry(r1, r0, y1 - y0, segments, 1, !capped);
        const uv = geometry.attributes.uv;
        const around = Math.PI * (r0 + r1);
        const slope = Math.hypot(y1 - y0, r0 - r1);

        for (let i = 0; i < uv.count; i++) {
            uv.setXY(i, uv.getX(i) * around, uv.getY(i) * slope);
        }

        geometry.translate(cx, (y0 + y1) / 2, cz);
        this.#meshes.push({ geometry, material });

        return this;
    }

    /** A cone roof: a cylinder that narrows to a point. */
    cone(cx, cz, y0, height, radius, material, segments = 20) {
        return this.cylinder(cx, cz, y0, y0 + height, radius, 0, material, { segments, capped: false });
    }

    /** Add another solid's faces, moved by (dx, dy, dz). */
    add(other, dx = 0, dy = 0, dz = 0) {
        const object = other.toObject();

        object.position.set(dx, dy, dz);
        this.#meshes.push({ object });

        return this;
    }

    /** The shape as a Three.js group of meshes (materials are Three.js materials). */
    toObject() {
        const group = new THREE.Group();

        for (const [material, { positions, normals, uvs }] of this.#groups) {
            const geometry = new THREE.BufferGeometry();

            geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
            geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
            group.add(new THREE.Mesh(geometry, material));
        }

        for (const { geometry, material, object } of this.#meshes) {
            group.add(object ?? new THREE.Mesh(geometry, material));
        }

        group.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        return group;
    }
}
