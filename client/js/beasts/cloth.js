// A hanging cloth (the wight lord's cape): a grid of points joined each to the next by threads of
// a set length, the top row fastened across the shoulders, the rest falling under their own
// weight (moved on each moment by how they were moving, and pulled back to their threads'
// lengths, a few times over), streaming back as its wearer goes, and kept out of its wearer's
// legs and body (spheres round them). Its hem is torn: some of its strips shorter than others,
// and a few moth-eaten holes. It's drawn as one mesh whose points are moved each moment.

import * as THREE from "three";

const GRAVITY = 9.8;
const DAMPING = 0.985;
const PASSES = 4;
const MAX_STEP = 1 / 45;

export class Cloth {
    /**
     * @param {object} options
     * @param {number} options.columns - Points across.
     * @param {number} options.rows - Points down.
     * @param {number} options.width - How wide it is fastened (metres).
     * @param {number} options.drop - How long it hangs.
     * @param {number} [options.flare] - How much wider it is at its hem (a share).
     * @param {number} options.colour - Its colour.
     * @param {() => number} options.random - Its own random numbers (its tears and holes).
     */
    constructor({ columns, rows, width, drop, flare = 0.5, colour, random }) {
        this.columns = columns;
        this.rows = rows;
        this.count = columns * rows;
        this.positions = new Float32Array(this.count * 3);
        this.previous = new Float32Array(this.count * 3);
        this.across = [];
        this.down = drop / (rows - 1);
        this.started = false;

        // (Each row's threads across, wider towards the hem)
        for (let row = 0; row < rows; row++) {
            this.across.push((width / (columns - 1)) * (1 + flare * (row / (rows - 1))));
        }

        // Its hem torn: each strip's length (in rows); a few holes
        const length = [];

        for (let column = 0; column < columns; column++) {
            length.push(rows - (random() < 0.55 ? 1 + Math.floor(random() * 3) : 0));
        }

        const index = [];

        for (let row = 0; row < rows - 1; row++) {
            for (let column = 0; column < columns - 1; column++) {
                const torn = row + 1 >= Math.min(length[column], length[column + 1]);
                const hole = row > rows * 0.5 && random() < 0.07;

                if (torn || hole) {
                    continue;
                }

                const a = row * columns + column;

                index.push(a, a + columns, a + 1, a + 1, a + columns, a + columns + 1);
            }
        }

        // (Darker and dirtier towards the hem, and in patches)
        const tints = new Float32Array(this.count * 3);
        const base = new THREE.Color(colour);

        for (let k = 0; k < this.count; k++) {
            const row = Math.floor(k / columns);
            const shade = (1 - 0.35 * (row / (rows - 1))) * (0.85 + random() * 0.2);

            tints.set([base.r * shade, base.g * shade, base.b * shade], k * 3);
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute("color", new THREE.BufferAttribute(tints, 3));
        this.geometry.setIndex(index);

        this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide, vertexColors: true }));
        this.mesh.frustumCulled = false;
        this.mesh.castShadow = true;
        this.mesh.userData.alive = true;
    }

    /**
     * Move it on `dt` seconds: its top row fastened at `pins` (a point [x, y, z] for each column,
     * in the frame it's drawn in), blown by `wind` ([x, y, z], m/s² on each point), kept out of
     * `spheres` ([x, y, z, radius] each) and above the ground (y 0).
     */
    step(dt, pins, wind, spheres) {
        const { columns, rows, positions, previous } = this;

        // (The first time, hung straight down from where it's fastened)
        if (!this.started) {
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    const k = (row * columns + column) * 3;

                    positions.set([pins[column][0], pins[column][1] - row * this.down, pins[column][2] - row * this.down * 0.15], k);
                }
            }

            previous.set(positions);
            this.started = true;
        }

        const steps = Math.min(4, Math.max(1, Math.ceil(dt / MAX_STEP)));
        const h = Math.min(dt, MAX_STEP * 4) / steps;

        for (let n = 0; n < steps; n++) {
            // Each point on as it was going, and pulled down, and blown
            for (let k = columns; k < this.count; k++) {
                const i = k * 3;

                for (let axis = 0; axis < 3; axis++) {
                    const now = positions[i + axis];
                    const pull = axis === 1 ? -GRAVITY : 0;

                    positions[i + axis] += (now - previous[i + axis]) * DAMPING + (pull + wind[axis]) * h * h;
                    previous[i + axis] = now;
                }
            }

            for (let column = 0; column < columns; column++) {
                positions.set(pins[column], column * 3);
            }

            // Its threads pulled back to their lengths, across and down (and down two, to stiffen
            // it against folding up), a few times over; then out of what it mustn't pass through
            for (let pass = 0; pass < PASSES; pass++) {
                for (let row = 0; row < rows; row++) {
                    for (let column = 0; column < columns; column++) {
                        const k = row * columns + column;

                        if (column < columns - 1) {
                            this.#thread(k, k + 1, this.across[row]);
                        }

                        if (row < rows - 1) {
                            this.#thread(k, k + columns, this.down);
                        }

                        if (row < rows - 2) {
                            this.#thread(k, k + columns * 2, this.down * 2);
                        }
                    }
                }

                for (let k = columns; k < this.count; k++) {
                    const i = k * 3;

                    for (const [x, y, z, radius] of spheres) {
                        const dx = positions[i] - x;
                        const dy = positions[i + 1] - y;
                        const dz = positions[i + 2] - z;
                        const d = Math.hypot(dx, dy, dz);

                        if (d < radius && d > 1e-6) {
                            const push = radius / d;

                            positions[i] = x + dx * push;
                            positions[i + 1] = y + dy * push;
                            positions[i + 2] = z + dz * push;
                        }
                    }

                    positions[i + 1] = Math.max(0.01, positions[i + 1]);
                }
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }

    // Two points pulled (or pushed) to be a length apart, each halfway (not a fastened one)
    #thread(a, b, length) {
        const p = this.positions;
        const [i, j] = [a * 3, b * 3];
        const dx = p[j] - p[i];
        const dy = p[j + 1] - p[i + 1];
        const dz = p[j + 2] - p[i + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const off = (d - length) / d;
        const [wa, wb] = a < this.columns ? [0, 1] : [0.5, 0.5];

        p[i] += dx * off * wa;
        p[i + 1] += dy * off * wa;
        p[i + 2] += dz * off * wa;
        p[j] -= dx * off * wb;
        p[j + 1] -= dy * off * wb;
        p[j + 2] -= dz * off * wb;
    }

    dispose() {
        this.geometry.dispose();
        this.mesh.material.dispose();
    }
}
