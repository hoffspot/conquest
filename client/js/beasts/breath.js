// Fire from a great beast's mouth (a Dreadthorn's breath: beasts/model.js), as a dragon's should
// look: a narrow white-hot core at the jaws swelling into a long, churning stream of yellow and
// orange flame that billows at its end; embers thrown off it, and dark smoke rolling after it.
// Each kind is a cloud of puffs (one draw call each): where they start, how fast, how they slow,
// rise or fall, churn, live and grow. The puffs are where they are in the world, not on the beast:
// what's breathed out stays where it went as the beast turns.

import * as THREE from "three";

/**
 * Each kind of puff: how many at most, how many a second while it breathes, how fast (m/s) and how
 * far off straight (a share), how it slows (a second), rises (m/s², below 0 falls), churns, how long
 * it lives (s), and how big it is (m) and grows over its life.
 */
export const PUFFS = Object.freeze({
    flame: Object.freeze({ count: 1400, rate: 900, speed: [20, 27], spread: 0.08, drag: 1.1, rise: 2.2, churn: 40, life: [0.65, 1.0], size: 0.4, grow: 9.5, additive: true }),
    ember: Object.freeze({ count: 500, rate: 220, speed: [9, 18], spread: 0.5, drag: 0.7, rise: -6, churn: 12, life: [1.0, 2.0], size: 0.13, grow: 0, additive: true }),
    smoke: Object.freeze({ count: 360, rate: 85, speed: [1, 3], spread: 0.6, drag: 0.5, rise: 1.4, churn: 3, life: [1.8, 2.8], size: 1.6, grow: 4.5, additive: false }),
});

// Where along the stream each kind is let out (metres from the mouth, at least and at most)
const ALONG = Object.freeze({ flame: [0, 0], ember: [1, 9], smoke: [4, 13] });

// How the breath's turned from the snout toward the lower jaw: half the mouth's opening, so far at
// most (a jaw dropped wide on a lowered head points back; the snout doesn't)
const TOWARD_JAW = THREE.MathUtils.degToRad(15);

// Each kind's colour over its life (its fragment shader's end)
const SHADES = {
    flame: `
        vec3 white = vec3(1.0, 0.97, 0.82), yellow = vec3(1.0, 0.76, 0.28), orange = vec3(1.0, 0.44, 0.07), red = vec3(0.55, 0.1, 0.02);
        vec3 colour = vAge < 0.14 ? mix(white, yellow, vAge / 0.14) : vAge < 0.45 ? mix(yellow, orange, (vAge - 0.14) / 0.31) : mix(orange, red, (vAge - 0.45) / 0.55);
        gl_FragColor = vec4(colour * 1.1, soft * lumps * 0.55 * pow(1.0 - vAge, 1.6));`,
    ember: `
        float flicker = 0.55 + 0.45 * sin(vAge * 40.0 + vSeed * 30.0);
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.3) * 1.6, step(r, 0.9) * flicker * (1.0 - vAge));`,
    smoke: `
        gl_FragColor = vec4(vec3(0.13, 0.11, 0.1), soft * lumps * 0.42 * (1.0 - vAge) * smoothstep(0.0, 0.18, vAge));`,
};

class Puffs {
    constructor(kind) {
        const setting = PUFFS[kind];
        const { count } = setting;

        this.kind = kind;
        this.setting = setting;
        this.pos = new Float32Array(count * 3);
        this.vel = new Float32Array(count * 3);
        this.age = new Float32Array(count).fill(-1);
        this.life = new Float32Array(count).fill(1);
        this.share = new Float32Array(count).fill(-1);
        // (Each puff's own, between 0 and 1: its size and its churn)
        this.seed = Float32Array.from({ length: count }, (_, i) => {
            const x = Math.sin(i * 12.9898) * 43758.5453;

            return x - Math.floor(x);
        });
        this.next = 0;
        this.carry = 0;
        this.clock = 0;
        this.alive = 0;

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("aAge", new THREE.BufferAttribute(this.share, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("aSeed", new THREE.BufferAttribute(this.seed, 1));
        this.material = new THREE.ShaderMaterial({
            uniforms: { uScale: { value: 500 }, uSize: { value: setting.size }, uGrow: { value: setting.grow } },
            vertexShader: `
                attribute float aAge;
                attribute float aSeed;
                uniform float uScale;
                uniform float uSize;
                uniform float uGrow;
                varying float vAge;
                varying float vSeed;
                void main() {
                    vAge = aAge;
                    vSeed = aSeed;
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mv;
                    gl_PointSize = aAge < 0.0 ? 0.0 : uSize * (0.3 + uGrow * pow(aAge, 1.2)) * (0.7 + 0.6 * aSeed) * uScale / -mv.z;
                }`,
            fragmentShader: `
                varying float vAge;
                varying float vSeed;
                void main() {
                    vec2 c = gl_PointCoord - 0.5;
                    float r = length(c) * 2.0;
                    if (vAge < 0.0 || r > 1.0) discard;
                    float soft = pow(1.0 - r, 1.5);
                    float lumps = 0.72 + 0.28 * sin(atan(c.y, c.x) * 3.0 + vSeed * 20.0 + vAge * 6.0) * sin(r * 7.0 - vSeed * 9.0);
                    ${SHADES[kind]}
                }`,
            blending: setting.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            transparent: true,
            depthWrite: false,
        });
        this.points = new THREE.Points(geometry, this.material);
        this.points.name = `breath ${kind}`;
        this.points.frustumCulled = false;
        this.points.renderOrder = setting.additive ? 2 : 1;
        // (Where its puffs are is where they are in the world, wherever it's hung)
        this.points.matrixAutoUpdate = false;
        this.points.matrixWorldAutoUpdate = false;

        // (A puff's size on the screen: the drawing buffer's height over twice the tangent of half
        // the camera's field of view, as it's drawn)
        const buffer = new THREE.Vector2();

        this.points.onBeforeRender = (renderer, scene, camera) => {
            this.material.uniforms.uScale.value = (renderer.getDrawingBufferSize(buffer).y * camera.projectionMatrix.elements[5]) / 2;
        };
    }

    // Puffs let out over `dt` from `at`, or along the stream from it (`along`, metres), the way `way` goes
    emit(dt, at, way, [near, far], random) {
        const { rate, speed, spread, life, count } = this.setting;

        for (this.carry += dt * rate; this.carry >= 1; this.carry--) {
            const i = this.next;
            const out = near + random() * (far - near);
            const pace = speed[0] + random() * (speed[1] - speed[0]);
            const [ax, ay, az] = [(random() - 0.5) * 2 * spread, (random() - 0.5) * 2 * spread, (random() - 0.5) * 2 * spread];
            const [dx, dy, dz] = [way.x + ax, way.y + ay, way.z + az];
            const length = Math.hypot(dx, dy, dz) || 1;

            this.next = (this.next + 1) % count;
            this.pos.set([at.x + way.x * out, at.y + way.y * out, at.z + way.z * out], i * 3);
            this.vel.set([(dx / length) * pace, (dy / length) * pace, (dz / length) * pace], i * 3);
            this.age[i] = 0;
            this.life[i] = life[0] + random() * (life[1] - life[0]);
        }
    }

    // Each puff on by `dt`: slowed, rising or falling, churned, kept above the ground (`groundAt`);
    // how many are still alight
    step(dt, groundAt) {
        const { drag, rise, churn } = this.setting;
        const slow = Math.exp(-drag * dt);
        let alive = 0;

        this.clock += dt;

        for (let i = 0; i < this.age.length; i++) {
            if (this.age[i] < 0) {
                continue;
            }

            this.age[i] += dt;

            if (this.age[i] >= this.life[i]) {
                this.age[i] = -1;
                this.share[i] = -1;
                continue;
            }

            alive++;

            const k = i * 3;
            const share = this.age[i] / this.life[i];
            const s = this.seed[i] * 17;
            const t = this.clock * 5;
            // (Churning, the more the further it's gone, as a stream of fire billows)
            const push = churn * dt * Math.min(1, share * 2.2);

            this.vel[k] = this.vel[k] * slow + Math.sin(this.pos[k + 1] * 1.3 + t + s) * push;
            this.vel[k + 1] = this.vel[k + 1] * slow + Math.sin(this.pos[k + 2] * 1.1 + t * 0.9 + s * 1.7) * push + rise * dt;
            this.vel[k + 2] = this.vel[k + 2] * slow + Math.sin(this.pos[k] * 1.2 + t * 1.1 + s * 2.3) * push;
            this.pos[k] += this.vel[k] * dt;
            this.pos[k + 1] += this.vel[k + 1] * dt;
            this.pos[k + 2] += this.vel[k + 2] * dt;

            // (Spread along the ground where it reaches it)
            const ground = groundAt(this.pos[k], this.pos[k + 2]) + 0.12;

            if (this.pos[k + 1] < ground) {
                this.pos[k + 1] = ground;
                this.vel[k + 1] = Math.abs(this.vel[k + 1]) * 0.2;
            }

            this.share[i] = share;
        }

        if (alive || this.alive) {
            this.points.geometry.attributes.position.needsUpdate = true;
            this.points.geometry.attributes.aAge.needsUpdate = true;
        }

        this.alive = alive;
        this.points.visible = alive > 0;

        return alive;
    }

    dispose() {
        this.points.geometry.dispose();
        this.material.dispose();
    }
}

/**
 * A beast's breath of fire: `object` to hang on it (or anywhere: its puffs are drawn where they
 * are in the world), stepped each frame with `step(dt, { upper, lower, hinge })`: the mouth's
 * upper and lower lips and the jaw's hinge, in the world (THREE.Vector3s), while it breathes. `groundAt(x, z)`: the ground's height (metres; 0 if it doesn't say). `random`: the
 * random numbers to use (Math.random).
 */
export class Breath {
    constructor({ groundAt = () => 0, random = Math.random } = {}) {
        this.puffs = Object.keys(PUFFS).map((kind) => new Puffs(kind));
        this.object = new THREE.Group();
        this.object.name = "breath";

        for (const { points } of this.puffs) {
            this.object.add(points);
        }

        this.groundAt = groundAt;
        this.random = random;
        this.way = new THREE.Vector3();
        this.mouth = new THREE.Vector3();
    }

    /**
     * The way it breathes and where from, given the lips and the jaw's hinge: out along the
     * snout, turned toward the lower jaw by half the mouth's opening (TOWARD_JAW at most), from
     * between the lips.
     */
    aim({ upper, lower, hinge }) {
        const snout = upper.clone().sub(hinge).normalize();
        const chin = lower.clone().sub(hinge).normalize();
        const across = new THREE.Vector3().crossVectors(snout, chin);

        this.way.copy(snout);

        if (across.lengthSq() > 1e-8) {
            this.way.applyAxisAngle(across.normalize(), Math.min(snout.angleTo(chin) / 2, TOWARD_JAW));
        }

        this.mouth.copy(upper).add(lower).multiplyScalar(0.5).addScaledVector(this.way, 0.2);

        return { way: this.way, mouth: this.mouth };
    }

    /**
     * On by `dt` seconds (in slices of a 60th of a second at most, so it looks the same at any
     * frame rate), breathing if `mouth` (aim's { upper, lower, hinge }) is given; how many puffs
     * are still to be drawn.
     */
    step(dt, mouth) {
        const slices = Math.max(1, Math.min(8, Math.ceil(dt * 60)));
        let alive = 0;
        const aimed = mouth ? this.aim(mouth) : null;

        for (let s = 0; s < slices; s++) {
            alive = 0;

            for (const puffs of this.puffs) {
                if (aimed) {
                    puffs.emit(dt / slices, aimed.mouth, aimed.way, ALONG[puffs.kind], this.random);
                }

                alive += puffs.step(dt / slices, this.groundAt);
            }
        }

        return alive;
    }

    dispose() {
        for (const puffs of this.puffs) {
            puffs.dispose();
        }

        this.object.removeFromParent();
    }
}
