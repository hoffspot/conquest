// What fighting looks like besides the fighters: arrows, bolts and fireballs in flight, sparks,
// dust, fire and arcane light where blows land, arrows left stuck in whoever they hit, a ring on
// the ground where the player is walking to, and a red ring round the enemy they're set to fight.
// Spells: green light gathering in a healer's hand and rising round them, with a green ring
// spreading on the ground; violet sparks in a hand casting a stun, a burst where it lands, and
// stars circling the stunned one's head until it wears off.
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
    heal: { count: 30, colours: [0xdcffe0, 0x28d05a], size: [0.08, 0.18], speed: [0.4, 1.3], life: [0.7, 1.2], gravity: -1.8, spread: 2.2, glow: true, swirl: 3 },
    healCharge: { count: 3, colours: [0xeaffec, 0x5ef08a], size: [0.05, 0.1], speed: [0.1, 0.5], life: [0.25, 0.45], gravity: -0.8, spread: 2, glow: true },
    stun: { count: 30, colours: [0xfff4a0, 0x9a5cff], size: [0.06, 0.15], speed: [1.5, 3.2], life: [0.25, 0.55], gravity: 0, spread: 2, glow: true, swirl: 8 },
    stunCharge: { count: 3, colours: [0xe8d8ff, 0x8a4dff], size: [0.05, 0.1], speed: [0.2, 0.7], life: [0.2, 0.35], gravity: 0, spread: 2, glow: true, swirl: 5 },
};

// A dazed character's stars: how many, how far round its head (m), how fast they circle (rad/s)
const DAZE = { stars: 3, radius: 0.24, speed: 4.5 };

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

        // The ring round the enemy the player is set to fight: { object, radius, age }, or null
        this.targetRing = new THREE.Mesh(targetGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        this.targetRing.name = "target";
        this.targetRing.position.y = 0.035;
        this.targetRing.renderOrder = 1;
        this.targetRing.visible = false;
        this.target = null;
        scene.add(this.targetRing);

        // Rings spreading on the ground (a heal), and stars circling dazed heads
        this.pulses = [];
        this.dazed = [];
        this.star = new THREE.ShapeGeometry(starShape(0.075, 0.032));
        this.starMaterial = new THREE.MeshBasicMaterial({ color: 0xffe14a, side: THREE.DoubleSide, toneMapped: false });

        /** The camera, for turning the stars to face it (the game sets it). */
        this.camera = null;

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

    /**
     * Ring the enemy the player is set to fight: its object (the ring follows it), `radius`
     * metres round it; or null for no one. A new target's ring closes in on it.
     */
    setTarget(object, radius = 0.6) {
        if (object !== (this.target?.object ?? null)) {
            this.target = object ? { object, radius, age: 0 } : null;
        }
    }

    /** A ring spreading on the ground from a point (metres), in a colour, fading as it goes. */
    pulse(x, z, colour = 0x3ddc6a) {
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false, toneMapped: false }),
        );

        ring.position.set(x, 0.04, z);
        ring.renderOrder = 1;
        this.group.add(ring);
        this.pulses.push({ ring, age: 0 });
    }

    /**
     * Stars circling a character's head (at `height` metres) for `seconds`: dazed. Again while
     * dazed, it lasts the longer of the two.
     */
    daze(object, height, seconds) {
        const already = this.dazed.find((daze) => daze.object === object);

        if (already) {
            already.left = Math.max(already.left, seconds);

            return;
        }

        const stars = new THREE.Group();

        for (let k = 0; k < DAZE.stars; k++) {
            stars.add(new THREE.Mesh(this.star, this.starMaterial));
        }

        this.group.add(stars);
        this.dazed.push({ object, height, left: seconds, age: 0, stars });
    }

    /** No more stars round a character's head (it's fallen). */
    clearDaze(object) {
        this.dazed = this.dazed.filter((daze) => {
            if (daze.object === object) {
                daze.stars.removeFromParent();

                return false;
            }

            return true;
        });
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

        // Rings spread and fade
        this.pulses = this.pulses.filter((pulse) => {
            pulse.age += dt;

            const t = pulse.age / 0.8;

            pulse.ring.scale.setScalar(0.3 + 1.1 * Math.sqrt(Math.min(1, t)));
            pulse.ring.material.opacity = 0.85 * (1 - Math.min(1, t));

            if (t >= 1) {
                pulse.ring.removeFromParent();
                pulse.ring.geometry.dispose();
                pulse.ring.material.dispose();

                return false;
            }

            return true;
        });

        // Stars circle dazed heads, facing the camera, shrinking away at the end
        this.dazed = this.dazed.filter((daze) => {
            daze.age += dt;
            daze.left -= dt;

            if (daze.left <= 0) {
                daze.stars.removeFromParent();

                return false;
            }

            const { position } = daze.object;
            const size = Math.min(1, daze.left / 0.3, daze.age / 0.15);

            daze.stars.children.forEach((star, k) => {
                const angle = daze.age * DAZE.speed + (k * 2 * Math.PI) / DAZE.stars;

                star.position.set(position.x + Math.cos(angle) * DAZE.radius, daze.height + 0.03 * Math.sin(angle * 2), position.z + Math.sin(angle) * DAZE.radius);
                star.scale.setScalar(size);

                if (this.camera) {
                    star.quaternion.copy(this.camera.quaternion);
                }

                star.rotateZ(daze.age * 3 + k);
            });

            return true;
        });

        // The target's ring closes in when it's chosen, then turns slowly and pulses
        const target = this.target;
        const ring = this.targetRing;

        ring.visible = Boolean(target?.object.visible) && target.object.position.y > -0.2;

        if (ring.visible) {
            target.age += dt;

            const lock = Math.min(1, target.age / LOCK_ON);
            const closing = 1 + 0.9 * (1 - lock) ** 2;
            const pulse = 1 + 0.04 * Math.sin(target.age * 2 * Math.PI * 1.2);

            ring.position.x = target.object.position.x;
            ring.position.z = target.object.position.z;
            ring.scale.setScalar(target.radius * closing * pulse);
            ring.rotation.y = -target.age * 0.7;
            ring.material.opacity = lock;
        }
    }
}

// A five-pointed star, `outer` and `inner` metres from its middle
function starShape(outer, inner) {
    const shape = new THREE.Shape();

    for (let k = 0; k < 10; k++) {
        const radius = k % 2 ? inner : outer;
        const angle = Math.PI / 2 + (k * Math.PI) / 5;

        shape[k ? "lineTo" : "moveTo"](Math.cos(angle) * radius, Math.sin(angle) * radius);
    }

    shape.closePath();

    return shape;
}

// How long a new target's ring takes to close in on it (s)
const LOCK_ON = 0.25;

/**
 * The target ring, a unit's radius across, flat on the ground: a bright red band with a soft glow
 * inside it and a dark edge outside (to show on light ground too), and four arrowheads pointing in
 * at it. One mesh, with its colours (and see-through-ness) in the vertices.
 */
function targetGeometry() {
    const positions = [];
    const colours = [];
    // (Linear colours, shown as they are: not toned down with the lit scene)
    const red = [1, 0.08, 0.03];
    const dark = [0.02, 0, 0];
    const vertex = (x, z, [r, g, b], a) => {
        positions.push(x, 0, z);
        colours.push(r, g, b, a);
    };

    // A band from radius r0 to r1, faded from alpha a0 (inside) to a1 (outside)
    const band = (r0, r1, colour0, a0, colour1, a1) => {
        const segments = 48;

        for (let k = 0; k < segments; k++) {
            const [t0, t1] = [(k / segments) * 2 * Math.PI, ((k + 1) / segments) * 2 * Math.PI];
            const inner0 = [Math.cos(t0) * r0, Math.sin(t0) * r0];
            const inner1 = [Math.cos(t1) * r0, Math.sin(t1) * r0];
            const outer0 = [Math.cos(t0) * r1, Math.sin(t0) * r1];
            const outer1 = [Math.cos(t1) * r1, Math.sin(t1) * r1];

            vertex(...inner0, colour0, a0);
            vertex(...outer1, colour1, a1);
            vertex(...outer0, colour1, a1);
            vertex(...inner0, colour0, a0);
            vertex(...inner1, colour0, a0);
            vertex(...outer1, colour1, a1);
        }
    };

    band(0.6, 0.88, red, 0, red, 0.35);
    band(0.88, 1, red, 1, red, 1);
    band(1, 1.14, dark, 0.5, dark, 0);

    // Arrowheads outside the ring, pointing in
    for (let k = 0; k < 4; k++) {
        const angle = (k + 0.5) * (Math.PI / 2);
        const [cx, cz] = [Math.cos(angle), Math.sin(angle)];
        const [sx, sz] = [-cz, cx];
        const tip = [cx * 1.1, cz * 1.1];
        const back = 1.42;

        vertex(...tip, red, 1);
        vertex(cx * back + sx * 0.17, cz * back + sz * 0.17, red, 1);
        vertex(cx * back - sx * 0.17, cz * back - sz * 0.17, red, 1);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 4));

    return geometry;
}
