// What fighting looks like besides the fighters: arrows, bolts and fireballs in flight, sparks,
// dust, fire and arcane light where blows land, arrows left stuck in whoever they hit, and a ring
// on the ground where the player is walking to.
//
// Every spark, puff and flame is a particle in one shared, fixed-size buffer, drawn in a single
// draw call (glowing ones added to what's behind them, like light), so a busy fight costs no more
// to draw than a quiet one.

import * as THREE from "three";

// How many particles there can be at once
const PARTICLES = 600;

// Each burst: how many particles, their colours (from, to), size (metres), speed (m/s), how long
// they last (s), how much gravity pulls them (m/s²; negative rises), and how they spread
const BURSTS = {
    sparks: { count: 22, colours: [0xfff1c4, 0xff8a1a], size: [0.05, 0.1], speed: [2.5, 5], life: [0.18, 0.4], gravity: 9, spread: 0.9, glow: true },
    dust: { count: 16, colours: [0xb8a78a, 0x8a7a62], size: [0.25, 0.5], speed: [0.5, 1.4], life: [0.5, 0.9], gravity: -0.4, spread: 1.6, glow: false, grow: 2.2 },
    impact: { count: 14, colours: [0xffffff, 0xffd27a], size: [0.08, 0.18], speed: [1.5, 3.5], life: [0.12, 0.3], gravity: 4, spread: 1.4, glow: true },
    arcane: { count: 30, colours: [0xd9c4ff, 0x6a4dff], size: [0.06, 0.16], speed: [1, 3], life: [0.3, 0.6], gravity: -1.5, spread: 2, glow: true, swirl: 6 },
    fire: { count: 34, colours: [0xffe08a, 0xff3a0a], size: [0.18, 0.36], speed: [0.8, 2.4], life: [0.35, 0.75], gravity: -3, spread: 1.8, glow: true, grow: 0.4 },
    trailBolt: { count: 2, colours: [0xe6dcff, 0x7a5cff], size: [0.08, 0.14], speed: [0, 0.3], life: [0.15, 0.3], gravity: 0, spread: 2, glow: true },
    trailFire: { count: 3, colours: [0xffd070, 0xff2a00], size: [0.16, 0.3], speed: [0.2, 0.8], life: [0.2, 0.4], gravity: -2, spread: 2, glow: true, grow: 0.6 },
};

const VERTEX = /* glsl */ `
attribute float size;
attribute float alpha;
attribute vec3 tint;
varying float vAlpha;
varying vec3 vTint;
uniform float scale;

void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);

    vAlpha = alpha;
    vTint = tint;
    gl_PointSize = size * scale / max(0.1, -view.z);
    gl_Position = projectionMatrix * view;
}`;

const FRAGMENT = /* glsl */ `
varying float vAlpha;
varying vec3 vTint;

void main() {
    // A soft round blob
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = vAlpha * (1.0 - smoothstep(0.35, 1.0, d));

    if (a < 0.01) discard;

    gl_FragColor = vec4(vTint * a, a);
}`;

class Particles {
    constructor(glow) {
        this.glow = glow;
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(PARTICLES * 3);
        this.sizes = new Float32Array(PARTICLES);
        this.alphas = new Float32Array(PARTICLES);
        this.tints = new Float32Array(PARTICLES * 3);
        this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute("tint", new THREE.BufferAttribute(this.tints, 3).setUsage(THREE.DynamicDrawUsage));
        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: { scale: { value: 600 } },
            transparent: true,
            depthWrite: false,
            // Glowing particles add light; dust covers what's behind it (premultiplied alpha)
            blending: glow ? THREE.AdditiveBlending : THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
        });
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.points.name = glow ? "glow" : "dust";

        // Each particle: velocity, age, life, colours, sizes, gravity, swirl
        this.live = [];
        this.free = Array.from({ length: PARTICLES }, (_, i) => PARTICLES - 1 - i);
    }

    emit(settings, at, direction) {
        const { count, colours, size, speed, life, gravity, spread, grow = 0, swirl = 0 } = settings;
        const from = new THREE.Color(colours[0]);
        const to = new THREE.Color(colours[1]);

        for (let k = 0; k < count && this.free.length; k++) {
            const i = this.free.pop();
            const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).multiplyScalar(spread);

            if (direction) {
                velocity.add(direction);
            }

            velocity.normalize().multiplyScalar(speed[0] + Math.random() * (speed[1] - speed[0]));
            this.positions.set([at.x, at.y, at.z], i * 3);
            this.live.push({
                i,
                velocity,
                age: 0,
                life: life[0] + Math.random() * (life[1] - life[0]),
                size: size[0] + Math.random() * (size[1] - size[0]),
                from,
                to,
                gravity,
                grow,
                swirl,
                centre: at.clone(),
            });
        }
    }

    update(dt, pixels) {
        this.material.uniforms.scale.value = pixels;
        this.live = this.live.filter((particle) => {
            const { i, velocity } = particle;

            particle.age += dt;

            if (particle.age >= particle.life) {
                this.alphas[i] = 0;
                this.sizes[i] = 0;
                this.free.push(i);

                return false;
            }

            const t = particle.age / particle.life;

            velocity.y -= particle.gravity * dt;

            if (particle.swirl) {
                // Circling the point it started from
                const dx = this.positions[i * 3] - particle.centre.x;
                const dz = this.positions[i * 3 + 2] - particle.centre.z;

                velocity.x += -dz * particle.swirl * dt;
                velocity.z += dx * particle.swirl * dt;
            }

            this.positions[i * 3] += velocity.x * dt;
            this.positions[i * 3 + 1] = Math.max(0.02, this.positions[i * 3 + 1] + velocity.y * dt);
            this.positions[i * 3 + 2] += velocity.z * dt;
            velocity.multiplyScalar(1 - Math.min(1, dt * 2.5));
            this.sizes[i] = particle.size * (1 + particle.grow * t);
            this.alphas[i] = (1 - t) * (1 - t) * (this.glow ? 1 : 0.55);
            this.tints[i * 3] = particle.from.r + (particle.to.r - particle.from.r) * t;
            this.tints[i * 3 + 1] = particle.from.g + (particle.to.g - particle.from.g) * t;
            this.tints[i * 3 + 2] = particle.from.b + (particle.to.b - particle.from.b) * t;

            return true;
        });

        for (const name of ["position", "size", "alpha", "tint"]) {
            this.geometry.attributes[name].needsUpdate = true;
        }
    }
}

// --- Projectiles ---

function arrowModel() {
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.7, 4).rotateX(Math.PI / 2), wood);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4).rotateX(Math.PI / 2).translate(0, 0, 0.37), new THREE.MeshLambertMaterial({ color: 0x55585c }));
    const fletching = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.03, 0.09).translate(0, 0, -0.3), new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }));
    const fletching2 = fletching.clone().rotateZ(Math.PI / 2);

    group.add(shaft, head, fletching, fletching2);

    return group;
}

// A glowing ball: a bright core in a soft halo. (No light of its own: adding and removing lights
// makes Three.js rebuild every lit material's shaders, which would stall the game each cast.)
function glowBall(colour, radius) {
    const ball = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 2.2, 12, 8),
        new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );

    ball.add(halo);

    return ball;
}

export class Effects {
    /** @param {THREE.Scene} scene */
    constructor(scene) {
        this.scene = scene;
        this.glow = new Particles(true);
        this.dust = new Particles(false);
        this.group = new THREE.Group();
        this.group.name = "effects";
        this.group.add(this.glow.points, this.dust.points);
        scene.add(this.group);

        /** Projectiles in flight, by the battle's projectile id. */
        this.flying = new Map();

        /** Arrows stuck in characters, and how long until they go. */
        this.stuck = [];

        // The ring where the player is walking to
        this.marker = new THREE.Mesh(
            new THREE.RingGeometry(0.28, 0.36, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0, depthWrite: false }),
        );
        this.marker.position.y = 0.03;
        this.marker.renderOrder = 1;
        this.markerAge = Infinity;
        scene.add(this.marker);

        this.arrow = arrowModel();
    }

    /** A burst of particles (a BURSTS key) at a point, thrown towards `direction` (optional). */
    burst(name, at, direction = null) {
        const settings = BURSTS[name];

        if (settings) {
            (settings.glow ? this.glow : this.dust).emit(settings, at, direction);
        }
    }

    /** What a reaction's effect looks like where a blow lands (actions.js REACTIONS: effect). */
    impact(effect, at, direction) {
        switch (effect) {
            case "fire":
                this.burst("fire", at, direction);
                this.burst("sparks", at, direction);
                break;
            case "arcane":
                this.burst("arcane", at, direction);
                break;
            case "impact":
                this.burst("impact", at, direction);
                this.burst("dust", at.clone().setY(0.3), null);
                break;
            case "dust":
                this.burst("dust", at, direction);
                this.burst("impact", at, direction);
                break;
            default:
                this.burst("sparks", at, direction);
        }
    }

    /** Show the ring where the player is walking to (metres). */
    markTarget(x, z) {
        this.marker.position.x = x;
        this.marker.position.z = z;
        this.markerAge = 0;
    }

    /** A projectile the battle launched: `kind` "arrow", "bolt" or "fireball", from a point. */
    launch(id, kind, from) {
        let object;

        if (kind === "arrow") {
            object = this.arrow.clone();
        } else if (kind === "fireball") {
            object = glowBall(0xff7a1a, 0.13);
        } else {
            object = glowBall(0xb9a4ff, 0.06);
        }

        object.position.copy(from);
        this.group.add(object);
        this.flying.set(id, { kind, object, last: from.clone() });
    }

    /** Move a projectile to a point (metres), arrows pointing the way they're flying. */
    fly(id, position) {
        const flight = this.flying.get(id);

        if (!flight) {
            return;
        }

        const { object, kind, last } = flight;

        last.copy(object.position);
        object.position.copy(position);

        if (kind === "arrow") {
            if (position.distanceToSquared(last) > 1e-8) {
                object.lookAt(position.clone().add(position.clone().sub(last)));
            }
        } else {
            this.burst(kind === "fireball" ? "trailFire" : "trailBolt", position);
        }
    }

    /** A projectile has arrived (or missed): remove it; arrows stick in `bone` if given. */
    land(id, bone = null) {
        const flight = this.flying.get(id);

        if (!flight) {
            return;
        }

        this.flying.delete(id);
        flight.object.removeFromParent();

        if (flight.kind === "arrow" && bone) {
            // Left sticking out of whoever it hit, pointing the way it flew
            const stuck = this.arrow.clone();
            const direction = flight.object.position.clone().sub(flight.last).normalize();

            bone.add(stuck);
            stuck.position.copy(bone.worldToLocal(flight.object.position.clone().addScaledVector(direction, 0.06)));
            stuck.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(flight.object.quaternion));
            this.stuck.push({ object: stuck, left: 2.5 });
        }
    }

    /** Take away every stuck arrow (say when a character comes back to life). */
    clearStuck(bone = null) {
        this.stuck = this.stuck.filter(({ object }) => {
            if (bone && object.parent !== bone) {
                return true;
            }

            object.removeFromParent();

            return false;
        });
    }

    /** Advance by `dt` seconds. `pixels` is how many screen pixels a metre is at 1 metre away. */
    update(dt, pixels) {
        this.glow.update(dt, pixels);
        this.dust.update(dt, pixels);

        this.stuck = this.stuck.filter((arrow) => {
            arrow.left -= dt;

            if (arrow.left <= 0) {
                arrow.object.removeFromParent();

                return false;
            }

            return true;
        });

        // The ring shrinks and fades
        this.markerAge += dt;

        const t = Math.min(1, this.markerAge / 0.7);

        this.marker.material.opacity = 0.85 * (1 - t);
        this.marker.scale.setScalar(1.4 - 0.6 * t);
        this.marker.visible = t < 1;
    }
}
