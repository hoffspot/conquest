// How spells look (core/spells.js), cast and landing: light gathering in the caster's hand as
// they cast (and, for the greater spells, circles of runes on the ground round them), then what
// each spell does where it lands, its own: flames and fireballs, stone hurled and the ground
// heaving, gusts and lightning, water, ice and rot; healing light; wards, barriers, portals.
// The higher a spell's tier, the grander: the seventh of each element fills the screen (a rain of
// meteors out of a burning sky; a beam that unmakes everything in its path; a storm of lightning;
// the world frozen solid), the screen flashing its colour and the ground shaking.
//
// Built on the game's particles (effects.js) and its own few meshes: orbs, bolts of lightning,
// beams, columns of light, rings, marks on the ground, shards, spikes, a funnel, domes; and fire,
// world/fire.js's, its tongues licking and twisting up as a fire's do, but swirling round as no
// fire does, a lick of it at the least of the fire spells to a whirling column reaching the
// clouds at the greatest. Its fire, its flashes and its fireballs in flight each light what's
// round them, a light of their own (lightsNow: the view's, lights.js, out of doors, first
// whatever else is near), the camera shaken (`onShake`), the screen washed with colour
// (`onScreen`).

import * as THREE from "three";
import { SPELLS } from "../core/spells.js";
import { FLAT, lieOn } from "./effects.js";
import { fireFlames, flamesMesh } from "./fire.js";

// --- What's drawn with ---

// A particle settings (as effects.js BURSTS)
const p = (colours, { count = 12, size = [0.08, 0.16], speed = [0.6, 1.6], life = [0.4, 0.8], gravity = -1, spread = 1.6, glow = true, swirl = 0, grow = 0, drag = 2.5, opacity, late = false } = {}) => ({ count, colours, size, speed, life, gravity, spread, glow, swirl, grow, drag, late, ...(opacity === undefined ? {} : { opacity }) });

// Each school's colours: its glow (from, to), and its deep and bright
const FIRE = { glow: [0xffe08a, 0xff3a0a], deep: 0xff4a0a, bright: 0xffc060, dark: 0x3a0804 };
const EARTH = { glow: [0xf0d8a0, 0x8a6a30], deep: 0x6a5438, bright: 0xe8c880, stone: 0x8a7a66 };
const AIR = { glow: [0xf4fbff, 0x7ac8ff], deep: 0x5a8cff, bright: 0xe8f8ff };
const WATER = { glow: [0xe8f8ff, 0x3a9ae8], deep: 0x1a5ab8, bright: 0xbfeaff };
const HEAL = { glow: [0xdcffe0, 0x28d05a], deep: 0x2fd46a, bright: 0xe9fff0, gold: [0xfffbe0, 0xffc84a] };
const HEX = { glow: [0xe8d8ff, 0x8a4dff], deep: 0x8a4dff, bright: 0xe8d8ff };
const PALETTES = { fire: FIRE, earth: EARTH, air: AIR, water: WATER, healing: HEAL };

// A few ready-made
const FLAMES = p(FIRE.glow, { count: 18, size: [0.16, 0.34], speed: [0.8, 2.2], life: [0.35, 0.7], gravity: -3, spread: 1.6, grow: 0.4 });
const SPARKS = p([0xfff1c4, 0xff8a1a], { count: 18, size: [0.04, 0.09], speed: [2.5, 5], life: [0.18, 0.4], gravity: 9, spread: 1 });
const SMOKE = p([0x2e2824, 0x6a625a], { count: 4, size: [0.3, 0.5], speed: [0.3, 0.8], life: [1, 1.8], gravity: -0.6, spread: 1, glow: false, opacity: 0.4, grow: 2.2 });
const DUST = p([0xb8a78a, 0x8a7a62], { count: 10, size: [0.3, 0.6], speed: [0.6, 1.6], life: [0.6, 1.1], gravity: -0.3, spread: 1.6, glow: false, opacity: 0.55, grow: 2 });
const EMBERS = p([0xffd070, 0xff3a00], { count: 6, size: [0.03, 0.06], speed: [1, 3], life: [0.8, 1.6], gravity: -1.5, spread: 2 });
const STEAM = p([0xf2f2ee, 0xb8bcc0], { count: 8, size: [0.3, 0.5], speed: [0.6, 1.4], life: [0.8, 1.4], gravity: -1.5, spread: 1.2, glow: false, opacity: 0.45, grow: 2.2 });
const SNOW = p([0xffffff, 0xbfeaff], { count: 8, size: [0.04, 0.08], speed: [0.2, 0.6], life: [1.2, 2], gravity: 0.8, spread: 2, glow: false, opacity: 0.95, late: true });

// What's on the ground is drawn before anything else see-through (the particles over it and
// the rest), so it doesn't cover them: marks first, then glows, then rings
const ORDER = Object.freeze({ mark: -3, glow: -2, ring: -1 });

// The brightest a flash's light is (so those near it aren't burnt white)
const BRIGHTEST = 28;

// --- Textures, drawn once on a canvas (only in a page) ---

function canvasTexture(size, draw) {
    const canvas = document.createElement("canvas");

    canvas.width = canvas.height = size;
    draw(canvas.getContext("2d"), size);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

const TEXTURES = {
    // A soft light, brightest in the middle
    glow: () =>
        canvasTexture(128, (g, s) => {
            const gradient = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);

            gradient.addColorStop(0, "rgba(255,255,255,1)");
            gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gradient;
            g.fillRect(0, 0, s, s);
        }),
    // Scorched ground, darkest in the middle, ragged at the edge
    scorch: () =>
        canvasTexture(128, (g, s) => {
            for (let k = 0; k < 70; k++) {
                const [angle, reach] = [Math.random() * Math.PI * 2, Math.random() * s * 0.35];
                const [x, y] = [s / 2 + Math.cos(angle) * reach, s / 2 + Math.sin(angle) * reach];
                const r = s * (0.08 + Math.random() * 0.12);
                const gradient = g.createRadialGradient(x, y, 0, x, y, r);

                gradient.addColorStop(0, "rgba(20,12,8,0.35)");
                gradient.addColorStop(1, "rgba(20,12,8,0)");
                g.fillStyle = gradient;
                g.fillRect(0, 0, s, s);
            }
        }),
    // A circle of runes
    runes: () =>
        canvasTexture(256, (g, s) => {
            const c = s / 2;

            g.strokeStyle = "rgba(255,255,255,1)";
            g.lineWidth = 4;
            g.beginPath();
            g.arc(c, c, c * 0.94, 0, Math.PI * 2);
            g.stroke();
            g.lineWidth = 2;
            g.beginPath();
            g.arc(c, c, c * 0.8, 0, Math.PI * 2);
            g.stroke();
            g.beginPath();
            g.arc(c, c, c * 0.42, 0, Math.PI * 2);
            g.stroke();

            // (A star in the middle, and runes between the rings)
            g.beginPath();

            for (let k = 0; k <= 7; k++) {
                const angle = (k * Math.PI * 4) / 7 - Math.PI / 2;

                g.lineTo(c + Math.cos(angle) * c * 0.8, c + Math.sin(angle) * c * 0.8);
            }

            g.stroke();
            g.lineWidth = 3;

            for (let k = 0; k < 16; k++) {
                const angle = (k / 16) * Math.PI * 2;
                const [x, y] = [c + Math.cos(angle) * c * 0.87, c + Math.sin(angle) * c * 0.87];

                g.save();
                g.translate(x, y);
                g.rotate(angle + Math.PI / 2);
                g.beginPath();
                g.moveTo(-6, -5);
                g.lineTo(0, 6);
                g.lineTo(6, -5);
                g.moveTo(0, -6);
                g.lineTo(0, 6);
                if (k % 2) {
                    g.moveTo(-5, 1);
                    g.lineTo(5, 1);
                }
                g.stroke();
                g.restore();
            }
        }),
    // Cracks spreading from the middle
    cracks: () =>
        canvasTexture(256, (g, s) => {
            g.strokeStyle = "rgba(20,12,6,0.9)";
            g.lineCap = "round";

            for (let k = 0; k < 14; k++) {
                let [x, y] = [s / 2, s / 2];
                let angle = (k / 14) * Math.PI * 2 + Math.random() * 0.3;

                g.lineWidth = 5;
                g.beginPath();
                g.moveTo(x, y);

                for (let step = 0; step < 9; step++) {
                    angle += (Math.random() - 0.5) * 0.8;
                    x += Math.cos(angle) * s * 0.05;
                    y += Math.sin(angle) * s * 0.05;
                    g.lineTo(x, y);
                    g.lineWidth = Math.max(1, 5 - step * 0.5);
                }

                g.stroke();
            }
        }),
    // Light fading up a column (strongest at its foot), soft at its sides
    column: () =>
        canvasTexture(64, (g, s) => {
            const up = g.createLinearGradient(0, s, 0, 0);

            up.addColorStop(0, "rgba(255,255,255,1)");
            up.addColorStop(0.6, "rgba(255,255,255,0.45)");
            up.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = up;
            g.fillRect(0, 0, s, s);
            g.globalCompositeOperation = "destination-in";

            const side = g.createLinearGradient(0, 0, s, 0);

            side.addColorStop(0, "rgba(255,255,255,0.3)");
            side.addColorStop(0.5, "rgba(255,255,255,1)");
            side.addColorStop(1, "rgba(255,255,255,0.3)");
            g.fillStyle = side;
            g.fillRect(0, 0, s, s);
        }),
    // Streaks of light running up (a column's, scrolled up it), fading at the top and bottom
    streaks: () => {
        const texture = canvasTexture(128, (g, s) => {
            for (let k = 0; k < 40; k++) {
                const [x, width, from, length] = [Math.random() * s, 2 + Math.random() * 7, Math.random() * s, s * (0.2 + Math.random() * 0.5)];
                const gradient = g.createLinearGradient(0, from, 0, from + length);

                gradient.addColorStop(0, "rgba(255,255,255,0)");
                gradient.addColorStop(0.5, `rgba(255,255,255,${0.35 + Math.random() * 0.65})`);
                gradient.addColorStop(1, "rgba(255,255,255,0)");
                g.fillStyle = gradient;

                // (Drawn twice, a height apart, so it runs on round as it's scrolled)
                g.fillRect(x, from, width, length);
                g.fillRect(x, from - s, width, length);
            }
        });

        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

        return texture;
    },
    // Streaks swirling (a funnel's)
    swirl: () =>
        canvasTexture(128, (g, s) => {
            for (let k = 0; k < 18; k++) {
                const x = Math.random() * s;

                g.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
                g.lineWidth = 2 + Math.random() * 5;
                g.beginPath();
                g.moveTo(x, s);
                g.bezierCurveTo(x + s * 0.2, s * 0.6, x - s * 0.2, s * 0.3, x + s * 0.3, 0);
                g.stroke();
            }
        }),
};

// --- The effect itself ---

export class SpellFx {
    /**
     * @param {import("./effects.js").Effects} effects - The game's particles.
     * @param {THREE.Scene} scene
     * @param {{ lights?: THREE.PointLight[] }} [options] - Lights to lend its flashes (the view's
     *   lamps); none given, two of its own.
     */
    constructor(effects, scene, { lights = null } = {}) {
        this.effects = effects;
        this.lying = new THREE.Quaternion();
        this.turning = new THREE.Quaternion();
        this.group = new THREE.Group();
        this.group.name = "spells";
        scene.add(this.group);

        // What's showing ({ object, age, life, step }), and what's to be done in a moment
        this.running = [];
        this.later = [];

        // Those casting just now: { id, spell, hand (where it gathers), feet, still (whether
        // they're still casting it), next (when it next sparkles), circles }
        this.casting = new Map();

        // Spells' things flying (by the caster's id): an orb, a rock, an ice blade
        this.missiles = new Map();

        this.textures = {};
        this.geometries = {
            ring: new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
            disc: new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
            column: new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0),
            funnel: new THREE.CylinderGeometry(1, 0.18, 1, 24, 1, true).translate(0, 0.5, 0),
            beam: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
            ball: new THREE.SphereGeometry(1, 16, 12),
            dome: new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
            hex: new THREE.IcosahedronGeometry(1, 1),
            rock: new THREE.IcosahedronGeometry(1, 0),
            shard: new THREE.TetrahedronGeometry(1, 0),
            spike: new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
            blade: new THREE.OctahedronGeometry(1, 0).scale(0.25, 0.25, 1.6),
            crescent: new THREE.TorusGeometry(0.5, 0.06, 6, 20, Math.PI).rotateX(Math.PI / 2),
        };

        // The lights lent to flashes (never added or taken away, so nothing's compiled again)
        const own = () => {
            const light = new THREE.PointLight(0xffffff, 0, 10, 2);

            this.group.add(light);

            return light;
        };

        this.lights = (lights ?? [own(), own()]).map((light) => ({ light, age: 1, life: 1, peak: 0 }));
        this.nextLight = 0;

        // The lights of its fire, flashes and fireballs now (lightsNow's), and that list handed out
        this.glowing = [];
        this.shining = [];

        /** Whether the lights can be lent now (not while they're lighting a room: the view's lamps indoors). */
        this.lit = true;

        /** The camera the world's seen through (to throw things in from beyond what's in view), if any. */
        this.camera = null;

        /** Heard to shake the camera (how hard, metres). */
        this.onShake = () => {};

        /** Heard to wash the screen with a colour (its hex, how strongly 0 to 1, for how long in seconds). */
        this.onScreen = () => {};
    }

    // A texture, made the first time
    #texture(name) {
        this.textures[name] ??= TEXTURES[name]();

        return this.textures[name];
    }

    // Something shown a while: added, stepped each frame (its age's share of its life, 0 to 1),
    // from now (so it's never drawn as it was made)
    #show(object, life, step) {
        this.group.add(object);
        this.running.push({ object, age: 0, life, step });
        step(0, 0, 0);

        return object;
    }

    // A material that adds light (its own, to fade)
    #additive(colour, { map = null, opacity = 1 } = {}) {
        return new THREE.MeshBasicMaterial({ color: colour, map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    }

    /** The ground's height at a point ((x, z) => metres: the effects'). */
    get groundAt() {
        return this.effects.groundAt ?? FLAT;
    }

    /** A point `lift` metres above the ground at (x, z). */
    onGround(x, z, lift = 0) {
        return new THREE.Vector3(x, this.groundAt(x, z) + lift, z);
    }

    // Lay something on the ground round a point (as it lies across `reach` metres), `lift` above it
    #lay(object, centre, reach, lift) {
        object.position.set(centre.x, lieOn(this.groundAt, centre.x, centre.z, Math.min(reach, 3), object.quaternion) + lift, centre.z);
    }

    /** Do something in a moment (seconds). */
    after(seconds, run) {
        this.later.push({ left: seconds, run });
    }

    /** Particles (settings as effects.js BURSTS) at a point, thrown towards `direction`. */
    spray(settings, at, direction = null) {
        (settings.glow ? this.effects.glow : this.effects.dust).emit(settings, at, direction);
    }

    /** Particles here and there over the ground round a point (`radius` m), `times` bursts of them, over `seconds`. */
    scatter(settings, centre, radius, times, { seconds = 0, y = 0.15, direction = null } = {}) {
        for (let k = 0; k < times; k++) {
            const run = () => {
                const angle = Math.random() * Math.PI * 2;
                const reach = Math.sqrt(Math.random()) * radius;

                this.spray(settings, this.onGround(centre.x + Math.cos(angle) * reach, centre.z + Math.sin(angle) * reach, y), direction);
            };

            if (seconds) {
                this.after((k / times) * seconds, run);
            } else {
                run();
            }
        }
    }

    /** A ring spreading on the ground from a point, `from` to `to` metres across, fading. */
    ring(centre, { colour, from = 0.3, to = 2, life = 0.6, y = 0.06, opacity = 1 }) {
        const mesh = new THREE.Mesh(this.geometries.ring, this.#additive(colour, { opacity }));

        this.#lay(mesh, centre, (from + to) / 2, y);
        mesh.renderOrder = ORDER.ring;
        this.#show(mesh, life, (t) => {
            const radius = from + (to - from) * (1 - (1 - t) ** 2);

            mesh.scale.set(radius, 1, radius);
            mesh.material.opacity = opacity * (1 - t);
        });
    }

    /**
     * A mark on the ground round a point, `radius` m: scorched (darkening), a glow, a circle of
     * runes (turning: `spin`), cracks; coming in quickly, going over its last `fade` of its life.
     */
    decal(centre, { texture = "glow", colour = 0xffffff, radius = 1, life = 2, spin = 0, dark = false, opacity = 1, grow = 0, fade = 0.35, y = 0.045 }) {
        const material = dark
            ? new THREE.MeshBasicMaterial({ map: this.#texture(texture), color: colour, transparent: true, opacity, depthWrite: false, toneMapped: false })
            : this.#additive(colour, { map: this.#texture(texture), opacity });
        const mesh = new THREE.Mesh(this.geometries.disc, material);
        let turn = Math.random() * Math.PI * 2;

        // (Lying on the ground, and turning about its up)
        this.#lay(mesh, centre, radius / 2, y);

        const lying = mesh.quaternion.clone();

        mesh.renderOrder = dark ? ORDER.mark : ORDER.glow;
        this.#show(mesh, life, (t, dt) => {
            const size = radius * (grow ? Math.min(1, t / grow) : 1);

            mesh.scale.set(size, 1, size);
            turn += spin * dt;
            mesh.quaternion.setFromAxisAngle(UP, turn).premultiply(lying);
            mesh.material.opacity = opacity * Math.min(1, t * 12) * (t > 1 - fade ? (1 - t) / fade : 1);
        });

        return mesh;
    }

    /**
     * A column of light standing up from a point: `radius` round, `height` tall, rising then
     * fading, `opacity` strong; streaks of light running up it.
     */
    pillar(centre, { colour, radius = 0.6, height = 3, life = 1, rise = 0.25, y = 0, opacity = 0.85 }) {
        const glow = new THREE.Mesh(this.geometries.column, this.#additive(colour, { map: this.#texture("column"), opacity }));
        const streaks = new THREE.Mesh(this.geometries.column, this.#additive(colour, { map: this.#texture("streaks"), opacity }));
        const group = new THREE.Group();

        streaks.scale.set(0.92, 1, 0.92);
        group.add(glow, streaks);
        group.position.copy(this.onGround(centre.x, centre.z, y));
        this.#show(group, life, (t, dt) => {
            const fade = t < 0.6 ? 1 : (1 - t) / 0.4;

            group.scale.set(radius * (1 + t * 0.3), height * Math.min(1, t / rise), radius * (1 + t * 0.3));
            glow.rotation.y += dt * 2;
            streaks.rotation.y -= dt * 3;
            glow.material.opacity = opacity * fade;
            streaks.material.opacity = opacity * fade;
        });
    }

    /** A beam from one point to another (each a function: as it is then), pulsing, `width` across. */
    beam(from, to, { colour, width = 0.2, life = 0.5, core = 0xffffff, beyond = 0 }) {
        const outer = new THREE.Mesh(this.geometries.beam, this.#additive(colour, { opacity: 0.7 }));
        const inner = new THREE.Mesh(this.geometries.beam, this.#additive(core));
        const group = new THREE.Group();
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();

        group.add(outer, inner);
        this.#show(group, life, (t) => {
            const [start, end] = [from(), to()];

            if (!start || !end) {
                return;
            }

            a.copy(start);
            b.copy(end);

            const length = a.distanceTo(b) + beyond;
            const pulse = 1 + Math.sin(t * 60) * 0.12;
            const swell = Math.sin(Math.PI * Math.min(1, t * 1.2)) ** 0.5;

            group.position.copy(a);
            group.lookAt(b);
            outer.scale.set(width * pulse * swell, width * pulse * swell, length);
            inner.scale.set(width * 0.35 * swell, width * 0.35 * swell, length);
            outer.material.opacity = 0.7 * (1 - t ** 3);
            inner.material.opacity = 1 - t ** 3;
        });
    }

    /**
     * Lightning from one point to another (points, or functions giving them): a jagged bolt, its
     * glow round it, crackling (made again every moment), with `branches` forking off it.
     */
    lightning(from, to, { colour = 0x9ad8ff, width = 0.05, life = 0.3, jag = 0.35, branches = 0 }) {
        const at = (point) => (typeof point === "function" ? point() : point);
        const group = new THREE.Group();
        const core = this.#additive(0xffffff);
        const glow = this.#additive(colour, { opacity: 0.55 });
        let crackle = 0;

        const build = () => {
            const [a, b] = [at(from), at(to)];

            for (const child of [...group.children]) {
                child.geometry.dispose();
                group.remove(child);
            }

            if (!a || !b) {
                return;
            }

            const paths = [jagged(a, b, jag)];

            for (let k = 0; k < branches; k++) {
                const main = paths[0];
                const start = main[1 + Math.floor(Math.random() * (main.length - 2))];
                const off = b.clone().sub(a).multiplyScalar(0.3 + Math.random() * 0.3);

                off.x += (Math.random() - 0.5) * 3;
                off.z += (Math.random() - 0.5) * 3;
                off.y *= 0.5;
                paths.push(jagged(start, start.clone().add(off), jag * 0.7));
            }

            paths.forEach((points, k) => {
                const curve = new THREE.CurvePath();

                for (let i = 1; i < points.length; i++) {
                    curve.add(new THREE.LineCurve3(points[i - 1], points[i]));
                }

                const thick = k ? 0.55 : 1;

                group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, width * thick, 4, false), core));
                group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, width * thick * 3.5, 5, false), glow));
            });
        };

        // (Built as it's shown, and again every moment)
        this.#show(group, life, (t, dt) => {
            crackle -= dt;

            if (crackle <= 0) {
                crackle = 0.05;
                build();
            }

            core.opacity = t < 0.7 ? 1 : (1 - t) / 0.3;
            glow.opacity = 0.55 * core.opacity;
        });
        group.userData.dispose = () => group.children.forEach((child) => child.geometry.dispose());
    }

    /**
     * Something thrown from one point to another (each a function), taking `travel` seconds, over
     * an arc (`arc` m high): a glowing orb (`colour`, `size`), or a piece of something (`shape`:
     * a rock, an ice blade, a crescent of wind; glowing or not, `glow`), trailing particles
     * (`trail`); `onArrive` heard when it gets there. Kept by `key` (its caster), so it's called
     * off if they're stopped.
     */
    throw(key, from, to, { travel = 0.3, arc = 0.3, colour = 0xffffff, size = 0.12, shape = null, glow = false, trail = null, spin = 0, light = null, onArrive = null }) {
        const start = from()?.clone();

        if (!start) {
            return;
        }

        const object = shape ? this.#piece(shape, colour, size, glow) : this.#orb(colour, size);
        const missile = { object, alive: true };

        // (A fireball lighting what it passes: { strength, reach }, its colour)
        if (light) {
            missile.light = this.glow(object.position, { colour, strength: light.strength, reach: light.reach, life: travel, steady: 0.6, fade: () => 1 });
        }

        object.position.copy(start);
        this.#drop(key);
        this.missiles.set(key, missile);
        this.#show(object, travel, (t) => {
            const end = to();

            if (!end || !missile.alive) {
                return;
            }

            const last = object.position.clone();

            object.position.lerpVectors(start, end, t);
            object.position.y += Math.sin(Math.PI * t) * arc;

            if (spin) {
                object.rotation.x += spin * 0.016;
                object.rotation.z += spin * 0.011;
            } else if (object.position.distanceToSquared(last) > 1e-6) {
                object.lookAt(object.position.clone().add(object.position.clone().sub(last)));
            }

            if (trail) {
                this.spray(trail, object.position);
            }

            if (t >= 1 && missile.alive) {
                missile.alive = false;

                if (missile.light) {
                    missile.light.fade = 0;
                    missile.light.age = missile.light.life;
                }

                if (this.missiles.get(key) === missile) {
                    this.missiles.delete(key);
                }

                onArrive?.(object.position.clone());
            }
        });
    }

    // A missile called off: gone, and nothing more of it
    #drop(key) {
        const missile = this.missiles.get(key);

        if (missile) {
            missile.alive = false;
            missile.object.removeFromParent();
            this.missiles.delete(key);

            if (missile.light) {
                missile.light.age = missile.light.life;
                missile.light.fade = 0;
            }
        }
    }

    // A piece of something, `size` m: stone (lit), or ice or wind (glowing)
    #piece(shape, colour, size, glow) {
        const mesh = new THREE.Mesh(this.geometries[shape], glow ? this.#additive(colour) : new THREE.MeshStandardMaterial({ color: colour, roughness: 0.9, flatShading: true }));

        mesh.scale.setScalar(size);

        return mesh;
    }

    // A glowing orb: a bright core in a soft glow
    #orb(colour, size) {
        const core = new THREE.Mesh(this.geometries.ball, this.#additive(0xffffff));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.#texture("glow"), color: colour, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));

        core.scale.setScalar(size * 0.45);
        glow.scale.setScalar(size * 4);
        glow.add(core);
        core.scale.divideScalar(size * 4);

        return glow;
    }

    /** Pieces flung from a point (stone, ice), tumbling and falling, gone after a while. */
    shards(at, { count = 10, colour = EARTH.stone, size = 0.12, speed = 4, up = 3, life = 1.2, shape = "shard", glow = false, spread = 1 }) {
        const material = glow ? this.#additive(colour) : new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8, flatShading: true, transparent: true });
        const group = new THREE.Group();
        const flying = [];

        for (let k = 0; k < count; k++) {
            const piece = new THREE.Mesh(this.geometries[shape], material);
            const angle = Math.random() * Math.PI * 2;
            const out = speed * (0.4 + Math.random() * 0.6) * spread;

            piece.scale.setScalar(size * (0.5 + Math.random()));
            piece.position.copy(at);
            group.add(piece);
            flying.push({ piece, velocity: new THREE.Vector3(Math.cos(angle) * out, up * (0.5 + Math.random()), Math.sin(angle) * out), spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10) });
        }

        this.#show(group, life, (t, dt) => {
            for (const { piece, velocity, spin } of flying) {
                velocity.y -= 9.8 * dt;
                piece.position.addScaledVector(velocity, dt);

                const floor = velocity.y < 0 ? this.groundAt(piece.position.x, piece.position.z) + 0.05 : -Infinity;

                if (piece.position.y < floor) {
                    piece.position.y = floor;
                    velocity.multiplyScalar(0.4);
                    velocity.y = Math.abs(velocity.y) * 0.3;
                }

                piece.rotation.x += spin.x * dt;
                piece.rotation.y += spin.y * dt;
                piece.rotation.z += spin.z * dt;
            }

            material.opacity = t < 0.75 ? 1 : (1 - t) / 0.25;
        });
    }

    /**
     * Spikes (of earth, of ice) bursting up round a point: `count` in a ring `radius` m out (or
     * scattered over it: `scatter`), `height` tall, leaning in (`lean`), then sinking back; lit
     * (as rough as `roughness`: ice glossy) or glowing.
     */
    spikes(centre, { count = 8, radius = 1.2, height = 1.6, colour = EARTH.deep, life = 1.4, lean = 0.3, scatter = false, glow = false, width = 0.25, stagger = 0, roughness = 0.9 }) {
        const material = glow ? this.#additive(colour, { opacity: 0.85 }) : new THREE.MeshStandardMaterial({ color: colour, roughness, flatShading: true });
        const group = new THREE.Group();
        const spikes = [];

        group.position.copy(this.onGround(centre.x, centre.z));

        for (let k = 0; k < count; k++) {
            const angle = scatter ? Math.random() * Math.PI * 2 : (k / count) * Math.PI * 2;
            const reach = scatter ? Math.sqrt(Math.random()) * radius : radius;
            const spike = new THREE.Mesh(this.geometries.spike, material);
            const tall = height * (0.6 + Math.random() * 0.6);

            const [x, z] = [Math.cos(angle) * reach, Math.sin(angle) * reach];

            // (Each from the ground where it is, a little into it)
            spike.position.set(x, this.groundAt(centre.x + x, centre.z + z) - group.position.y - 0.1, z);
            spike.rotation.set(Math.sin(angle) * -lean, 0, Math.cos(angle) * lean);
            group.add(spike);
            spikes.push({ spike, tall, delay: stagger * (reach / Math.max(radius, 0.01)) });
        }

        this.#show(group, life, (t) => {
            for (const { spike, tall, delay } of spikes) {
                const local = Math.max(0, (t - delay) / (1 - delay));
                const rise = local < 0.15 ? local / 0.15 : local > 0.8 ? (1 - local) / 0.2 : 1;

                spike.scale.set(width * Math.max(0.01, rise), tall * Math.max(0.01, rise), width * Math.max(0.01, rise));
            }
        });
    }

    /** A whirlwind standing on a point: a funnel `radius` wide at its top, `height` tall, spinning. */
    funnel(centre, { colour = 0xdceeff, radius = 2, height = 5, life = 1.4, opacity = 0.55 }) {
        const outer = new THREE.Mesh(this.geometries.funnel, this.#additive(colour, { map: this.#texture("swirl"), opacity }));
        const inner = new THREE.Mesh(this.geometries.funnel, this.#additive(colour, { map: this.#texture("swirl"), opacity: opacity * 0.7 }));
        const group = new THREE.Group();

        group.add(outer, inner);
        group.position.copy(this.onGround(centre.x, centre.z));
        this.#show(group, life, (t, dt) => {
            const grow = Math.min(1, t * 5) * (t > 0.85 ? (1 - t) / 0.15 : 1);

            outer.scale.set(radius * grow, height * Math.min(1, t * 4), radius * grow);
            inner.scale.set(radius * 0.7 * grow, height * 0.9 * Math.min(1, t * 4), radius * 0.7 * grow);
            outer.rotation.y += dt * 9;
            inner.rotation.y -= dt * 13;
            outer.material.opacity = opacity * grow;
            inner.material.opacity = opacity * 0.7 * grow;
        });
    }

    /** A dome (a ward, a barrier) over someone (a function giving where they stand), shimmering a while. */
    dome(centre, { colour, radius = 0.95, life = 1.2, wire = true, height = 1.25, opacity = 0.22 }) {
        const shell = new THREE.Mesh(this.geometries.dome, this.#additive(colour, { opacity }));
        const lattice = wire ? new THREE.Mesh(this.geometries.hex, new THREE.MeshBasicMaterial({ color: colour, wireframe: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })) : null;
        const group = new THREE.Group();

        group.add(shell);

        if (lattice) {
            lattice.scale.set(1, 1, 1);
            group.add(lattice);
        }

        this.#show(group, life, (t, dt) => {
            const at = centre();

            if (at) {
                group.position.set(at.x, at.y ?? this.groundAt(at.x, at.z), at.z);
            }

            const swell = Math.min(1, t * 6);
            const fade = t > 0.6 ? (1 - t) / 0.4 : 1;

            group.scale.set(radius * swell, radius * height * swell, radius * swell);
            shell.material.opacity = opacity * fade;

            if (lattice) {
                lattice.rotation.y += dt * 0.8;
                lattice.material.opacity = Math.min(0.6, opacity * 3) * fade;
            }
        });
    }

    /**
     * A light of a spell's (lightsNow's: its `colour`, how strong, candela, how far it `reach`es,
     * metres, and how steadily it burns, fire.js's: 0, not flickering) at a point (`at`, kept:
     * moved as what it's from moves), `life` seconds, fading as `fade` (of how far through its
     * life it is, 0 to 1) has it. Returns it.
     */
    glow(at, { colour = 0xff7a2a, strength = 10, reach = 10, life = 1, steady = 0, fade = (t) => (1 - t) ** 2 }) {
        const light = { x: at.x, y: at.y, z: at.z, at, kind: "spell", colour, strength, reach, steady, seed: Math.random(), fade: fade(0), priority: 1, out: null, age: 0, life, fading: fade };

        this.glowing.push(light);

        return light;
    }

    /**
     * The spells' lights now ({ x, y, z, kind "spell", colour, strength, reach, steady, seed, fade,
     * priority }: world metres; lights.js lightNow's, out of doors, before anything else's): the
     * same list each time.
     */
    lightsNow() {
        this.shining.length = 0;

        for (const light of this.glowing) {
            if (light.fade > 0.01) {
                light.x = light.at.x;
                light.y = light.at.y;
                light.z = light.at.z;
                this.shining.push(light);
            }
        }

        return this.shining;
    }

    /** A flash of light at a point: one of the lights lent to it (if they can be), and a glow there. */
    flash(at, { colour = 0xffffff, intensity = 30, distance = 10, life = 0.35, size = 2 }) {
        this.glow(at.clone(), { colour, strength: Math.min(intensity, BRIGHTEST), reach: distance, life });

        if (this.lit && this.lights.length) {
            const lent = this.lights[this.nextLight];

            this.nextLight = (this.nextLight + 1) % this.lights.length;
            lent.light.color.set(colour);
            lent.light.distance = distance;
            lent.light.position.copy(at);
            Object.assign(lent, { age: 0, life, peak: Math.min(intensity, BRIGHTEST) });
        }

        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.#texture("glow"), color: colour, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));

        glow.position.copy(at);
        this.#show(glow, life, (t) => {
            glow.scale.setScalar(size * (0.6 + t));
            glow.material.opacity = 1 - t;
        });
    }

    /**
     * Fire burning a while at a point on the ground (world/fire.js's: its tongues licking and
     * twisting up, a spell's hotter than a fire's), `width` and `height` metres at its tallest,
     * of `tongues` tongues `spread` out round its middle, swirling round as it rises (`twist`: a
     * torch's 1); growing up in its first `rise` of its `life` (seconds), burning, and dying away
     * over its last `fall`; lighting what's round it (`light` candela, as far as `reach`), if it's
     * to, from halfway up it.
     */
    blaze(at, { width = 0.6, height = 1, tongues = 6, spread = 0.2, twist = 3, heat = 1.25, life = 1.2, rise = 0.15, fall = 0.4, light = 0, reach = 8, colour = 0xff7a2a, lift = 0.05 }) {
        // (Hardly leaning in the breeze: it's magic's, not the wind's)
        const mesh = flamesMesh([{ x: 0, y: 0, z: 0, kind: "spell", width, height, tongues, spread, twist, heat, lean: 3, seed: Math.random() }]);
        const size = (t) => Math.min(1, t / rise) * (t > 1 - fall ? Math.max(0, (1 - t) / fall) ** 0.7 : 1);

        mesh.material = fireFlames(0);
        mesh.position.copy(this.onGround(at.x, at.z, lift));
        mesh.userData.dispose = () => mesh.geometry.dispose();

        const glowing = light > 0 ? this.glow(mesh.position.clone().setY(mesh.position.y + height * 0.4), { colour, strength: light, reach, life, steady: 1.2, fade: size }) : null;

        this.#show(mesh, life, (t) => {
            mesh.material.uniforms.fireSize.value = size(t);
        });

        return glowing;
    }

    /** Particles streaming from one point to another (each a function), a while: drawn along it. */
    stream(from, to, settings, { life = 0.5, rate = 40 } = {}) {
        let owed = 0;
        const holder = new THREE.Object3D();

        this.#show(holder, life, (t, dt) => {
            const [a, b] = [from(), to()];

            if (!a || !b) {
                return;
            }

            owed += rate * dt;

            for (; owed >= 1; owed--) {
                const along = Math.random();
                const point = a.clone().lerp(b, along);
                const direction = b.clone().sub(a).normalize().multiplyScalar(3);

                this.spray({ ...settings, count: 1 }, point, direction);
            }
        });
    }

    /** A point `distance` m further from the camera than another, along the ground (north, with no camera). */
    beyond(at, distance) {
        const away = this.camera ? new THREE.Vector3(at.x - this.camera.position.x, 0, at.z - this.camera.position.z) : new THREE.Vector3(0, 0, -1);

        if (away.lengthSq() < 1e-6) {
            away.set(0, 0, -1);
        }

        return away.normalize().multiplyScalar(distance).add(at);
    }

    /** Shake the camera (how hard). */
    shake(amount) {
        this.onShake(amount);
    }

    /** Wash the screen with a colour a moment. */
    screen(colour, strength = 0.3, seconds = 0.6) {
        this.onScreen(colour, strength, seconds);
    }

    // --- What else magic does ---

    /**
     * Someone carried somewhere by magic (host.js "carried": `how` teleport, recall, walk,
     * summoned), or a creature brought (a companion: called, risen) or gone (over, lost), where
     * they are now.
     */
    appear(at, how) {
        const { colour, glow } = APPEARING[how] ?? APPEARING.teleport;

        if (how === "over" || how === "lost") {
            this.spray(p([0xffffff, colour], { count: 30, size: [0.05, 0.1], speed: [0.6, 1.6], life: [0.5, 0.9], gravity: -1, spread: 2, swirl: 8 }), above(at, 0.8));
            this.spray({ ...SMOKE, count: 6 }, above(at, 0.5));

            return;
        }

        this.pillar(at, { colour, radius: 0.7, height: how === "recall" ? 12 : 5, life: 0.9, rise: 0.15 });
        this.ring(at, { colour, from: 0.2, to: 2, life: 0.6 });
        this.decal(at, { texture: how === "risen" ? "cracks" : "runes", colour: how === "risen" ? 0x9aff7a : colour, radius: 1.4, life: 1.4, spin: how === "risen" ? 0 : 1.6, grow: 0.25, opacity: 0.9 });
        this.spray(p(glow, { count: 50, size: [0.05, 0.12], speed: [0.8, 2], life: [0.5, 1], gravity: -1.2, spread: 2, swirl: 10 }), above(at, 0.8));
        this.flash(above(at, 1), { colour, intensity: 20, distance: 8, life: 0.45, size: 2.5 });
    }

    /** A spell turned back on whoever cast it (Reflect): a flash of silver from one to the other (functions giving where they are). */
    bounce(from, to) {
        this.beam(from, to, { colour: 0xdce6ff, width: 0.12, life: 0.3 });

        const at = from();

        if (at) {
            this.spray(p([0xffffff, 0x9aaad8], { count: 18, size: [0.04, 0.08], speed: [2, 3.5], life: [0.2, 0.4], gravity: 0, spread: 2 }), at);
        }
    }

    /** A spell lasting on someone (a ward, Swole, Levitate...), now and then showing on them: a mote or two of its colour at `at`. */
    linger(kind, at) {
        const recipe = RECIPES[kind];
        const colours = recipe?.lingers ?? recipe?.palette?.glow;

        if (colours) {
            this.spray(p(colours, { count: 1, size: [0.03, 0.07], speed: [0.1, 0.4], life: [0.6, 1], gravity: -0.8, spread: 2.4, swirl: 3 }), new THREE.Vector3(at.x + (Math.random() - 0.5) * 0.6, at.y + (Math.random() - 0.5) * 1.2, at.z + (Math.random() - 0.5) * 0.6));
        }
    }

    /**
     * Something lying on the ground a while (battle.js HAZARDS: fire, acid, rot, lava, venom),
     * `radius` m round a point, for `seconds`: it glowing there, and what it leaves.
     */
    ground(at, kind, radius, seconds) {
        const { glow, mark } = GROUNDS[kind] ?? GROUNDS.fire;

        this.decal(at, { texture: "glow", colour: glow, radius: radius * 1.15, life: seconds, opacity: 0.6, fade: 0.2, grow: 0.08 });
        this.decal(at, { texture: "scorch", colour: mark, radius: radius * 1.1, life: seconds + 2, dark: true, fade: 0.3 });
    }

    /**
     * One of each kind of thing drawn, for their shaders to be made before play (they're gone
     * again at the first step).
     */
    warm() {
        const at = new THREE.Vector3(0, -50, 0);
        const warming = [this.#orb(0xffffff, 0.1), this.#piece("rock", EARTH.stone, 0.1, false), this.#piece("blade", 0xffffff, 0.1, true), new THREE.Mesh(this.geometries.disc, this.#additive(0xffffff, { map: this.#texture("glow") }))];
        const dark = new THREE.Mesh(this.geometries.disc, new THREE.MeshBasicMaterial({ map: this.#texture("scorch"), transparent: true, depthWrite: false, toneMapped: false }));
        const lattice = new THREE.Mesh(this.geometries.hex, new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        const shard = new THREE.Mesh(this.geometries.shard, new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true, transparent: true }));

        for (const object of [...warming, dark, lattice, shard]) {
            object.position.copy(at);
            this.#show(object, 1e-3, () => {});
        }
    }

    // --- Casting and landing ---

    /**
     * Someone begins casting a spell: light gathers in their hand (`hand`: a function giving where
     * it is) while they're at it (`still`: whether they are), the greater spells with circles of
     * runes on the ground round their feet (`feet`: a function) and, for the greatest, where it's
     * going (`target`: a function giving the point it's cast at). Its missile, if it has one,
     * thrown to arrive as it lands. The light gathering its own colours, or `glow`'s (from, to).
     */
    cast(id, spell, { hand, feet, target, aim, still, castTime, glow = null }) {
        const recipe = RECIPES[spell] ?? {};
        const { tier = 1, school } = SPELLS[spell] ?? {};
        const own = PALETTES[school] ?? recipe.palette ?? HEX;
        const palette = glow ? { ...own, glow } : own;
        const seconds = castTime / 1000;
        const circles = [];

        // (The greater spells: runes round the caster's feet, the greatest at where it's cast too)
        if (tier >= 4 && school !== "healing") {
            const at = feet();

            if (at) {
                circles.push(this.decal(at, { texture: "runes", colour: palette.deep, radius: tier >= 7 ? 4.2 : tier >= 6 ? 2.6 : 1.3 + tier * 0.1, life: seconds + 0.4, spin: tier >= 7 ? 1.4 : 0.9, grow: 0.3, opacity: 0.9, fade: 0.25 }));

                if (tier >= 7) {
                    circles.push(this.decal(at, { texture: "runes", colour: palette.bright, radius: 2.6, life: seconds + 0.4, spin: -2.2, grow: 0.4, opacity: 0.8, fade: 0.25 }));
                    this.pillar(at, { colour: palette.deep, radius: 0.9, height: 9, life: seconds + 0.3, rise: 0.5 });
                }
            }
        }

        if (tier >= 7 && target?.()) {
            this.decal(target(), { texture: "runes", colour: palette.deep, radius: 6, life: seconds + 0.5, spin: -1, grow: 0.8, opacity: 0.85, fade: 0.2 });
        }

        recipe.charging?.(this, { target, seconds });
        this.casting.set(id, { id, spell, hand, still, palette, tier, next: 0, recipe });

        // (Its missile thrown, to arrive as it lands)
        if (recipe.missile) {
            const travel = Math.min(recipe.missile.travel ?? 0.3, seconds * 0.8);

            this.after(seconds - travel, () => {
                if (still()) {
                    this.throw(id, hand, aim, { ...recipe.missile, travel });
                }
            });
        }
    }

    /**
     * A spell lands: what it does where it's cast, each spell its own. `caster` and `target`
     * give where they are ({ feet, point (their middle), hand }: functions, and `height`), and
     * `struck`, the others it struck (the same, each).
     */
    land(id, spell, { caster, target, struck = [] }) {
        this.casting.delete(id);
        this.#drop(id);

        const recipe = RECIPES[spell];
        const at = target.feet();
        const point = target.point();

        if (!recipe?.land || !at || !point) {
            return;
        }

        recipe.land(this, { caster, target, struck, at, point, palette: PALETTES[SPELLS[spell]?.school] ?? recipe.palette ?? HEX });
    }

    /** Someone's stopped casting (stunned, struck down): what was gathering gone. */
    stop(id) {
        this.casting.delete(id);
        this.#drop(id);
    }

    /** Advance by `dt` seconds. */
    update(dt) {
        // (What's due done once the rest are kept: anything it puts off till later, kept too)
        const due = [];

        this.later = this.later.filter((job) => {
            job.left -= dt;

            if (job.left <= 0) {
                due.push(job);
            }

            return job.left > 0;
        });

        for (const job of due) {
            job.run();
        }

        // Light gathering in the hands of those casting (more, and bigger, the higher the tier)
        for (const cast of [...this.casting.values()]) {
            if (!cast.still()) {
                this.stop(cast.id);
                continue;
            }

            cast.next -= dt;

            if (cast.next <= 0) {
                const at = cast.hand();

                cast.next = 0.035;

                if (at) {
                    const grand = 0.6 + cast.tier * 0.25;

                    this.spray(p(cast.palette.glow, { count: 1 + Math.floor(cast.tier / 2), size: [0.04 * grand, 0.09 * grand], speed: [0.2, 0.7 + cast.tier * 0.1], life: [0.2, 0.4], gravity: -0.6, spread: 2, swirl: 4 }), at);
                    cast.recipe.gathering?.(this, at, cast);
                }
            }
        }

        // (Anything shown as these are stepped kept too: a meteor's landing)
        const running = this.running;

        this.running = [];

        for (const shown of running) {
            shown.age += dt;

            const t = Math.min(1, shown.age / shown.life);

            shown.step(t, dt, shown.age);

            if (t >= 1) {
                this.#remove(shown.object);
            } else {
                this.running.push(shown);
            }
        }

        if (this.textures.streaks) {
            this.textures.streaks.offset.y -= dt * 1.2;
        }

        for (const lent of this.lit ? this.lights : []) {
            lent.age += dt;
            lent.light.intensity = lent.age < lent.life ? lent.peak * (1 - lent.age / lent.life) ** 2 : 0;
        }

        // (The spells' own lights, fading as each does, gone when they're out)
        this.glowing = this.glowing.filter((light) => {
            light.age += dt;
            light.fade = light.age < light.life ? light.fading(light.age / light.life) : 0;

            return light.age < light.life;
        });
    }

    // Something shown taken away, and what it was drawn with let go (not the shapes and
    // textures, kept for the next)
    #remove(object) {
        object.removeFromParent();
        object.userData.dispose?.();
        object.traverse((part) => {
            if (part.material) {
                [part.material].flat().forEach((material) => material.dispose());
            }
        });
    }

    /** Everything showing gone (the game's over, or the player's gone elsewhere). */
    clear() {
        for (const shown of this.running) {
            this.#remove(shown.object);
        }

        for (const lent of this.lights) {
            lent.age = lent.life;

            if (this.lit) {
                lent.light.intensity = 0;
            }
        }

        this.running = [];
        this.later = [];
        this.glowing = [];
        this.shining.length = 0;
        this.casting.clear();
        this.missiles.clear();
    }

    /** Stop everything showing and let go of the shapes and pictures it made (the game's over). */
    dispose() {
        this.clear();

        for (const geometry of Object.values(this.geometries)) {
            geometry.dispose();
        }

        for (const texture of Object.values(this.textures)) {
            texture.dispose();
        }

        this.group.removeFromParent();
    }
}

// A jagged line from one point to another (lightning's): the points along it
function jagged(a, b, jag) {
    const points = [a.clone()];
    const steps = Math.max(4, Math.round(a.distanceTo(b) / 0.6));

    for (let k = 1; k < steps; k++) {
        const point = a.clone().lerp(b, k / steps);

        point.x += (Math.random() - 0.5) * jag;
        point.y += (Math.random() - 0.5) * jag;
        point.z += (Math.random() - 0.5) * jag;
        points.push(point);
    }

    points.push(b.clone());

    return points;
}

const UP = new THREE.Vector3(0, 1, 0);

// A point above another
const above = (at, height) => new THREE.Vector3(at.x, (at.y ?? 0) + height, at.z);

// Those carried by magic, and creatures brought, as they appear: the colour of it
const APPEARING = {
    teleport: { colour: 0x9a4aff, glow: [0xf0d8ff, 0x6a2ab8] },
    summoned: { colour: 0x9a4aff, glow: [0xf0d8ff, 0x6a2ab8] },
    called: { colour: 0x9a4aff, glow: [0xf0d8ff, 0x6a2ab8] },
    walk: { colour: 0x7a5acd, glow: [0xe8e0ff, 0x5a3a9a] },
    recall: { colour: 0xffe08a, glow: [0xfffbe0, 0xf2c040] },
    risen: { colour: 0x3aaa4a, glow: [0xb8ff9a, 0x0a2a10] },
    over: { colour: 0x9a4aff },
    lost: { colour: 0x9a4aff },
};

// What lies on the ground (battle.js HAZARDS): its glow, and the mark it leaves (tinting a scorch)
const GROUNDS = {
    fire: { glow: 0xff5a10, mark: 0xffffff },
    acid: { glow: 0x7ac818, mark: 0xc0ff60 },
    rot: { glow: 0x6a7a10, mark: 0xb0c040 },
    lava: { glow: 0xff4a0a, mark: 0xffb080 },
    venom: { glow: 0x5aa018, mark: 0xb8e060 },
};

// --- Each spell: how it's thrown (`missile`), what gathers as it's cast, and what it does where it lands ---

// Wards: a dome of their colour over whoever it's on, motes of it rising
const ward = (colour) => ({
    palette: { glow: [0xffffff, colour], deep: colour, bright: 0xffffff },
    land: (fx, { target, at }) => {
        fx.dome(target.feet, { colour, radius: 0.95, life: 1.3 });
        fx.spray(p([0xffffff, colour], { count: 30, size: [0.05, 0.1], speed: [0.4, 1.2], life: [0.8, 1.3], gravity: -1.6, spread: 2.2, swirl: 3 }), above(at, 0.8));
        fx.ring(at, { colour, from: 0.4, to: 1.4, life: 0.6 });
    },
});

// Cures: what they cure drawn up out of them (its colour), turning to light
const cure = (colour) => ({
    palette: HEAL,
    land: (fx, { at, point }) => {
        fx.spray(p([colour, 0xffffff], { count: 26, size: [0.06, 0.12], speed: [0.6, 1.6], life: [0.7, 1.1], gravity: -2.4, spread: 1.4, swirl: 2 }), point);
        fx.spray(p(HEAL.gold, { count: 16, size: [0.04, 0.08], speed: [0.3, 1], life: [0.8, 1.2], gravity: -1, spread: 2.4 }), point);
        fx.ring(at, { colour: 0xf2e08a, from: 0.3, to: 1.2, life: 0.5 });
    },
});

const RECIPES = {
    // --- Healing ---
    vigor: {
        land: (fx, { at }) => fx.ring(at, { colour: HEAL.deep, from: 0.3, to: 1, life: 0.5, opacity: 0.6 }),
    },
    mendWounds: {
        land: (fx, { at, point }) => {
            fx.ring(at, { colour: HEAL.deep, from: 0.3, to: 1.4, life: 0.6 });
            fx.spray(p(HEAL.glow, { count: 30, size: [0.06, 0.12], speed: [0.3, 0.9], life: [0.8, 1.2], gravity: -2, spread: 1, swirl: 8 }), above(point, 0.3));
        },
    },
    detraumatize: {
        land: (fx, { at }) => {
            fx.decal(at, { texture: "runes", colour: 0xc9ffd8, radius: 1.3, life: 1.4, spin: 0.8, grow: 0.3, opacity: 0.7 });
            fx.pillar(at, { colour: HEAL.deep, radius: 0.5, height: 2.8, life: 1 });
            fx.spray(p(HEAL.glow, { count: 36, size: [0.07, 0.14], speed: [0.4, 1.2], life: [0.9, 1.4], gravity: -2.4, spread: 1.2, swirl: 6 }), above(at, 0.2));
        },
    },
    renewal: {
        land: (fx, { at, point }) => {
            fx.ring(at, { colour: HEAL.deep, from: 0.3, to: 2, life: 0.7 });
            fx.after(0.2, () => fx.ring(at, { colour: 0xffd27a, from: 0.3, to: 1.6, life: 0.6 }));
            fx.spray(p([0xb8ff9a, 0x3a9a2a], { count: 44, size: [0.08, 0.16], speed: [0.4, 1.2], life: [1, 1.6], gravity: -1.6, spread: 1.4, swirl: 10 }), above(at, 0.2));
            fx.spray(p(HEAL.gold, { count: 20, size: [0.04, 0.08], speed: [1, 2], life: [0.6, 1], gravity: -1, spread: 2 }), point);
        },
    },
    astralHeal: {
        land: (fx, { at, point }) => {
            // Starlight falling out of the sky onto them, the night's stars circling down
            fx.pillar(at, { colour: 0xffe8a0, radius: 1.3, height: 22, life: 1.8, rise: 0.15 });
            fx.pillar(at, { colour: 0xffffff, radius: 0.5, height: 22, life: 1.4, rise: 0.1 });
            fx.decal(at, { texture: "runes", colour: 0xffd860, radius: 3.5, life: 2.2, spin: 0.6, grow: 0.3 });
            fx.ring(at, { colour: 0xffe08a, from: 0.5, to: 7, life: 1.2 });
            fx.flash(point, { colour: 0xffe8a0, intensity: 40, distance: 14, life: 0.8, size: 4 });
            fx.screen(0xffe8a0, 0.25, 0.9);

            for (let k = 0; k < 6; k++) {
                fx.after(k * 0.12, () => fx.spray(p(HEAL.gold, { count: 18, size: [0.06, 0.14], speed: [0.5, 1.4], life: [1, 1.6], gravity: 1.2, spread: 2.4, swirl: 6 }), above(at, 5 + k * 0.4)));
            }
        },
    },

    // --- Fire --- (world/fire.js's fire, from a lick of it at the least to a burning column
    // reaching the clouds at the greatest, swirling round more the greater it is, each lighting
    // what's round it: blaze)
    burn: {
        missile: { travel: 0.2, arc: 0.1, colour: FIRE.deep, size: 0.09, light: { strength: 2, reach: 4 }, trail: p(FIRE.glow, { count: 1, size: [0.08, 0.14], speed: [0, 0.3], life: [0.15, 0.3], gravity: -2 }) },
        land: (fx, { at, point }) => {
            // (A lick of flame up them)
            fx.blaze(at, { width: 0.3, height: 0.55, tongues: 3, spread: 0.06, twist: 1.2, life: 0.9, light: 4, reach: 5 });
            fx.spray({ ...FLAMES, count: 6 }, point);
            fx.spray({ ...SPARKS, count: 8 }, point);
        },
    },
    fireball: {
        missile: { travel: 0.3, arc: 0.25, colour: FIRE.deep, size: 0.18, light: { strength: 6, reach: 7 }, trail: p(FIRE.glow, { count: 3, size: [0.14, 0.26], speed: [0.1, 0.6], life: [0.2, 0.4], gravity: -2, grow: 0.5 }) },
        land: (fx, { at, point }) => {
            // (Bursting into a fire round them, twisting up)
            fx.blaze(at, { width: 0.75, height: 1.3, tongues: 6, spread: 0.22, twist: 2, life: 1.3, light: 9, reach: 8 });
            fx.spray({ ...FLAMES, count: 16 }, point);
            fx.spray(SPARKS, point);
            fx.spray(SMOKE, point);
            fx.decal(at, { texture: "scorch", colour: 0xffffff, radius: 0.7, life: 4, dark: true });
            fx.flash(point, { colour: FIRE.bright, intensity: 12, distance: 6, life: 0.3 });
        },
    },
    burstflame: {
        missile: { travel: 0.26, arc: 0.2, colour: FIRE.deep, size: 0.16, light: { strength: 5, reach: 6 }, trail: p(FIRE.glow, { count: 3, size: [0.12, 0.22], speed: [0.1, 0.5], life: [0.2, 0.35], gravity: -2 }) },
        land: (fx, { at, point }) => {
            // (A fire round them, and a ring of fire bursting out from it)
            fx.blaze(at, { width: 0.7, height: 1.2, tongues: 5, spread: 0.18, twist: 2.4, life: 1.2, light: 12, reach: 9 });
            fx.spray({ ...FLAMES, count: 20 }, point);
            fx.ring(at, { colour: FIRE.deep, from: 0.3, to: 1.8, life: 0.45 });

            for (let k = 0; k < 9; k++) {
                const angle = (k / 9) * Math.PI * 2;

                fx.after(0.04 + (k % 3) * 0.03, () => {
                    fx.blaze(fx.onGround(at.x + Math.cos(angle) * 1.4, at.z + Math.sin(angle) * 1.4), { width: 0.38, height: 0.8, tongues: 3, spread: 0.08, twist: 2, life: 1 });
                    fx.spray({ ...FLAMES, count: 4, speed: [1, 2.4] }, fx.onGround(at.x + Math.cos(angle) * 1.4, at.z + Math.sin(angle) * 1.4, 0.3), new THREE.Vector3(Math.cos(angle), 1.5, Math.sin(angle)));
                });
            }

            fx.decal(at, { texture: "scorch", colour: 0xffffff, radius: 1.6, life: 4, dark: true });
            fx.flash(point, { colour: FIRE.bright, intensity: 18, distance: 7, life: 0.35 });
        },
    },
    immolate: {
        land: (fx, { at, point }) => {
            // (A wreath of fire spiralling up round them, taller than they are)
            fx.blaze(at, { width: 1.1, height: 3.2, tongues: 10, spread: 0.55, twist: 3.5, heat: 1.3, life: 1.8, rise: 0.2, light: 16, reach: 10 });
            fx.pillar(at, { colour: FIRE.deep, radius: 0.7, height: 4.5, life: 1, rise: 0.15, opacity: 0.35 });

            for (let k = 0; k < 4; k++) {
                fx.after(k * 0.1, () => fx.spray(p(FIRE.glow, { count: 10, size: [0.2, 0.4], speed: [0.6, 1.6], life: [0.4, 0.8], gravity: -4, spread: 0.8, swirl: 8, grow: 0.4 }), above(at, 0.2)));
            }

            fx.spray({ ...SPARKS, count: 30 }, point);
            fx.spray({ ...EMBERS, count: 30 }, point);
            fx.ring(at, { colour: FIRE.deep, from: 0.3, to: 2, life: 0.5 });
            fx.decal(at, { texture: "scorch", colour: 0xffffff, radius: 1.1, life: 5, dark: true });
            fx.flash(point, { colour: FIRE.deep, intensity: 25, distance: 8, life: 0.5, size: 3 });
        },
    },
    flamefill: {
        land: (fx, { at, point }) => {
            // (The ground all round them catching fire, a patch at a time, burning a while)
            fx.ring(at, { colour: FIRE.deep, from: 0.3, to: 2.6, life: 0.5, opacity: 1 });
            fx.glow(above(at, 0.8), { colour: FIRE.deep, strength: 18, reach: 12, life: 1.8, steady: 1.2, fade: (t) => Math.min(1, t * 6) * (t > 0.7 ? (1 - t) / 0.3 : 1) });

            for (let k = 0; k < 13; k++) {
                const angle = k * 2.399963 + Math.random() * 0.4;
                const reach = k === 0 ? 0 : 0.7 + Math.sqrt(k / 13) * 1.7;
                const spot = fx.onGround(at.x + Math.cos(angle) * reach, at.z + Math.sin(angle) * reach);
                const big = 0.8 + Math.random() * 0.5;

                fx.after(k * 0.04, () => fx.blaze(spot, { width: 0.55 * big, height: 1.1 * big, tongues: 4, spread: 0.14, twist: 1.6, life: 1.5 + Math.random() * 0.3 }));
            }

            fx.scatter({ ...FLAMES, count: 4 }, at, 2.3, 12, { seconds: 0.6, y: 0.2 });
            fx.flash(point, { colour: FIRE.deep, intensity: 30, distance: 10, life: 0.5, size: 4 });
            fx.shake(0.06);
        },
    },
    inferno: {
        land: (fx, { at, point }) => {
            // A roaring vortex of fire, whirling up into a tall column, a hotter one in its heart,
            // fires catching round it, embers thrown high
            fx.blaze(at, { width: 1.9, height: 12, tongues: 12, spread: 1.5, twist: 3.5, heat: 1.1, life: 2.2, rise: 0.2, fall: 0.35, light: 24, reach: 16 });
            fx.blaze(at, { width: 0.9, height: 14, tongues: 4, spread: 0.35, twist: 5, heat: 1.25, life: 1.8, rise: 0.25 });

            for (let k = 0; k < 8; k++) {
                const angle = (k / 8) * Math.PI * 2 + Math.random() * 0.3;

                fx.after(0.15 + k * 0.05, () => fx.blaze(fx.onGround(at.x + Math.cos(angle) * 3, at.z + Math.sin(angle) * 3), { width: 0.6, height: 1.3, tongues: 4, spread: 0.15, twist: 2.5, life: 1.6 }));
            }

            for (let k = 0; k < 6; k++) {
                fx.after(k * 0.1, () => fx.spray(p(FIRE.glow, { count: 14, size: [0.3, 0.6], speed: [1.5, 3], life: [0.5, 0.9], gravity: -4, spread: 2.4, swirl: 7, grow: 0.5 }), above(at, 0.3)));
            }

            fx.ring(at, { colour: FIRE.deep, from: 0.5, to: 5, life: 0.7 });
            fx.after(0.15, () => fx.ring(at, { colour: FIRE.bright, from: 0.5, to: 4, life: 0.6 }));
            fx.spray({ ...EMBERS, count: 60, speed: [2, 6] }, point);
            fx.decal(at, { texture: "scorch", colour: 0xffffff, radius: 3.5, life: 7, dark: true });
            fx.flash(point, { colour: FIRE.deep, intensity: 45, distance: 14, life: 0.7, size: 6 });
            fx.screen(0xff5a10, 0.15, 0.6);
            fx.shake(0.15);
        },
    },
    hellfire: {
        land: (fx, { at, point }) => {
            // Meteors raining out of a burning sky all round them, streaking in from beyond, each
            // setting the ground alight where it strikes; the ground erupting in a whirling column
            // of fire that reaches the clouds; shockwaves to the edge of sight; the screen red, the
            // ground shaking
            fx.screen(0xff2a0a, 0.55, 1.6);
            fx.shake(0.5);
            fx.decal(at, { texture: "runes", colour: 0xff3a0a, radius: 13, life: 3.4, spin: -0.5, grow: 0.25, opacity: 0.85 });
            fx.decal(at, { texture: "glow", colour: 0xff4a0a, radius: 14, life: 7, opacity: 0.5 });
            fx.decal(at, { texture: "scorch", colour: 0xffffff, radius: 12, life: 10, dark: true });

            for (let k = 0; k < 16; k++) {
                const angle = Math.random() * Math.PI * 2;
                const reach = Math.sqrt(Math.random()) * 10;
                const spot = fx.onGround(at.x + Math.cos(angle) * reach, at.z + Math.sin(angle) * reach, 0.2);
                const sky = fx.beyond(spot, 7 + Math.random() * 4).setY(spot.y + 13 + Math.random() * 4);

                fx.after(k * 0.09, () =>
                    fx.throw(`meteor-${Math.random()}`, () => sky, () => spot, {
                        travel: 0.45,
                        arc: 0,
                        colour: FIRE.deep,
                        size: 0.7,
                        light: { strength: 8, reach: 10 },
                        trail: p(FIRE.glow, { count: 3, size: [0.4, 0.8], speed: [0.2, 1], life: [0.2, 0.4], gravity: -1, grow: 0.8 }),
                        onArrive: (hit) => {
                            fx.blaze(hit, { width: 1.1, height: 1.9, tongues: 6, spread: 0.3, twist: 2.2, life: 2.4 + Math.random() * 0.6, light: k % 3 === 0 ? 8 : 0, reach: 8 });
                            fx.spray(p(FIRE.glow, { count: 16, size: [0.3, 0.7], speed: [2, 5], life: [0.4, 0.8], gravity: -2, spread: 2, grow: 0.6 }), hit);
                            fx.ring(hit, { colour: FIRE.deep, from: 0.4, to: 3.5, life: 0.5 });
                            fx.decal(hit, { texture: "scorch", colour: 0xffffff, radius: 1.8, life: 8, dark: true });
                            fx.spray({ ...SMOKE, count: 6 }, hit);
                        },
                    }),
                );
            }

            fx.after(0.35, () => {
                fx.blaze(at, { width: 5, height: 24, tongues: 16, spread: 2.2, twist: 3, heat: 1.4, life: 2.6, rise: 0.15, fall: 0.35, light: 30, reach: 28 });
                fx.blaze(at, { width: 2, height: 28, tongues: 6, spread: 0.5, twist: 5, heat: 1.6, life: 2, rise: 0.2 });
                fx.pillar(at, { colour: FIRE.bright, radius: 1.5, height: 30, life: 1.4, rise: 0.1, opacity: 0.4 });
                fx.flash(point, { colour: FIRE.deep, intensity: 90, distance: 30, life: 1.2, size: 18 });
                fx.shake(0.6);

                for (let k = 0; k < 3; k++) {
                    fx.after(k * 0.22, () => fx.ring(at, { colour: k === 1 ? FIRE.bright : FIRE.deep, from: 1, to: 24, life: 1.1, opacity: 1 }));
                }

                fx.scatter(p(FIRE.glow, { count: 8, size: [0.4, 0.9], speed: [1.5, 4], life: [0.6, 1.1], gravity: -4, spread: 1.6, grow: 0.6 }), at, 12, 40, { seconds: 1.4, y: 0.3 });
                fx.spray({ ...EMBERS, count: 160, speed: [4, 12], spread: 3 }, point);
                fx.scatter({ ...SMOKE, count: 6 }, at, 10, 16, { seconds: 1.6, y: 1 });
            });
        },
    },

    // --- Earth ---
    rumble: {
        land: (fx, { at }) => {
            fx.ring(at, { colour: EARTH.bright, from: 0.2, to: 1.4, life: 0.5, opacity: 0.6 });
            fx.spray({ ...DUST, count: 8 }, above(at, 0.2));
            fx.shards(above(at, 0.1), { count: 6, size: 0.06, speed: 1.5, up: 2.5, life: 0.9 });
        },
    },
    stoneCrush: {
        missile: { travel: 0.4, arc: 1.2, spin: 6, shape: "rock", colour: EARTH.stone, size: 0.26, trail: p([0xb8a78a, 0x6a5438], { count: 1, size: [0.08, 0.14], speed: [0, 0.3], life: [0.3, 0.5], gravity: 1, glow: false, opacity: 0.6 }) },
        land: (fx, { at, point }) => {
            fx.shards(point, { count: 14, size: 0.1, speed: 3.5, up: 2.5, life: 1.3 });
            fx.spray({ ...DUST, count: 14 }, point);
            fx.ring(at, { colour: EARTH.bright, from: 0.3, to: 1.6, life: 0.5, opacity: 0.6 });
        },
    },
    shatterstone: {
        land: (fx, { at, point }) => {
            fx.spikes(at, { count: 1, radius: 0, height: 1.4, width: 0.5, colour: EARTH.stone, life: 0.35, lean: 0 });
            fx.after(0.25, () => {
                fx.shards(point, { count: 28, size: 0.12, speed: 6, up: 3, life: 1.4 });
                fx.spray({ ...DUST, count: 18 }, point);
                fx.ring(at, { colour: EARTH.bright, from: 0.3, to: 2.2, life: 0.5 });
                fx.flash(point, { colour: EARTH.bright, intensity: 10, distance: 6, life: 0.3 });
            });
        },
    },
    engulf: {
        land: (fx, { at }) => {
            fx.spikes(at, { count: 9, radius: 1.1, height: 2, width: 0.32, colour: EARTH.deep, life: 1.6, lean: 0.45 });
            fx.decal(at, { texture: "cracks", colour: 0xffffff, radius: 1.8, life: 4, dark: true });
            fx.scatter({ ...DUST, count: 6 }, at, 1.4, 6, { y: 0.3 });
        },
    },
    earthquake: {
        land: (fx, { at }) => {
            fx.decal(at, { texture: "cracks", colour: 0xffffff, radius: 5, life: 6, dark: true, grow: 0.08 });

            for (let k = 0; k < 3; k++) {
                fx.after(k * 0.18, () => fx.ring(at, { colour: EARTH.bright, from: 0.5, to: 6, life: 0.7, opacity: 0.8 }));
            }

            fx.spikes(at, { count: 14, radius: 3.4, height: 1.2, width: 0.45, colour: EARTH.stone, life: 1.2, lean: -0.4, scatter: true, stagger: 0.3 });
            fx.scatter({ ...DUST, count: 8 }, at, 3.5, 14, { seconds: 0.5, y: 0.3 });
            fx.shards(above(at, 0.2), { count: 26, size: 0.12, speed: 3, up: 4, life: 1.6, spread: 1.4 });
            fx.screen(0x8a6a30, 0.12, 0.5);
            fx.shake(0.3);
        },
    },
    acidify: {
        land: (fx, { at, point }) => {
            // (Geysers of acid bursting up all round them, the ground hissing, green light flaring)
            for (let k = 0; k < 4; k++) {
                fx.after(k * 0.1, () => fx.spray(p([0xeaff90, 0x3a8a10], { count: 24, size: [0.05, 0.11], speed: [3, 6], life: [0.5, 0.9], gravity: 9, spread: 0.5, glow: false, opacity: 0.95, late: true }), above(at, 0.1), new THREE.Vector3(0, 6, 0)));
            }

            fx.scatter(p([0xeaff90, 0x3a8a10], { count: 10, size: [0.05, 0.1], speed: [2.5, 5], life: [0.5, 0.8], gravity: 9, spread: 0.4, glow: false, opacity: 0.95, late: true }), at, 3, 10, { seconds: 0.6, y: 0.1, direction: new THREE.Vector3(0, 5, 0) });
            fx.scatter({ ...STEAM, colours: [0xeaffa0, 0x7a9a30], count: 3 }, at, 3, 8, { seconds: 0.8, y: 0.3 });
            fx.decal(at, { texture: "glow", colour: 0x9aff3a, radius: 4, life: 1.2, opacity: 0.7, grow: 0.15 });
            fx.ring(at, { colour: 0x9aff3a, from: 0.4, to: 4.5, life: 0.6 });
            fx.screen(0x7ac818, 0.12, 0.5);
            fx.shake(0.12);

            fx.spray({ ...STEAM, colours: [0xeaffa0, 0x7a9a30] }, point);
            fx.flash(point, { colour: 0x9aff3a, intensity: 18, distance: 8, life: 0.4 });
        },
    },
    disintegrate: {
        gathering: (fx, at) => fx.spray(p([0xffffff, 0xb070ff], { count: 3, size: [0.1, 0.2], speed: [0.5, 2], life: [0.2, 0.4], gravity: 0, spread: 2, swirl: 10 }), at),
        land: (fx, { caster, at, point }) => {
            // A beam that unmakes all in its path, clean across the world; where it strikes,
            // everything ground to dust and blown away, the ground scoured
            fx.screen(0xd8b0ff, 0.55, 1.2);
            fx.shake(0.45);
            fx.beam(caster.hand, () => point, { colour: 0xb070ff, width: 2.6, life: 1.2, beyond: 26 });
            fx.beam(caster.hand, () => point, { colour: 0xffffff, width: 0.8, life: 1, beyond: 26 });
            fx.flash(point, { colour: 0xd0a0ff, intensity: 70, distance: 26, life: 1, size: 14 });
            fx.pillar(at, { colour: 0xb070ff, radius: 2.4, height: 20, life: 1.2, rise: 0.1 });
            fx.decal(at, { texture: "glow", colour: 0x9a50ff, radius: 9, life: 2, opacity: 0.8 });
            fx.decal(at, { texture: "scorch", colour: 0xffffff, radius: 7, life: 9, dark: true });

            for (let k = 0; k < 3; k++) {
                fx.after(k * 0.2, () => fx.ring(at, { colour: k === 1 ? 0xffffff : 0xb070ff, from: 1, to: 20, life: 1, opacity: 1 }));
            }

            fx.shards(point, { count: 40, size: 0.16, speed: 9, up: 5, life: 1.8, spread: 1.4 });
            fx.scatter(p([0xe0c8ff, 0x6a4a3a], { count: 12, size: [0.06, 0.14], speed: [2, 6], life: [1, 1.8], gravity: -0.6, spread: 2.5, glow: false, opacity: 0.9, late: true }), at, 6, 20, { seconds: 1, y: 1 });
            fx.scatter({ ...DUST, count: 8, size: [0.6, 1.2] }, at, 8, 16, { seconds: 1, y: 0.5 });
        },
    },

    // --- Air ---
    hurt: {
        missile: { travel: 0.18, arc: 0.05, shape: "crescent", colour: 0xe8f8ff, size: 0.55, glow: true, trail: p(AIR.glow, { count: 2, size: [0.05, 0.1], speed: [0, 0.2], life: [0.12, 0.22], gravity: 0 }) },
        land: (fx, { point }) => {
            fx.spray(p(AIR.glow, { count: 18, size: [0.05, 0.1], speed: [2, 4], life: [0.2, 0.4], gravity: 0, spread: 2.2, swirl: 12 }), point);
        },
    },
    dustgust: {
        land: (fx, { caster, target, point }) => {
            fx.stream(caster.hand, target.point, p([0xd8c098, 0x8a7a52], { size: [0.12, 0.26], speed: [2, 4], life: [0.3, 0.6], gravity: 0, spread: 1, glow: false, opacity: 0.6, grow: 1.4 }), { life: 0.35, rate: 90 });
            fx.spray({ ...DUST, count: 16, swirl: 10 }, point);
        },
    },
    shockbolt: {
        land: (fx, { caster, point }) => {
            fx.lightning(caster.hand, () => point, { colour: AIR.deep, width: 0.035, life: 0.28, jag: 0.25, branches: 1 });
            fx.spray({ ...SPARKS, count: 34, colours: [0xffffff, 0x9ad8ff] }, point);
            fx.spray(p(AIR.glow, { count: 16, size: [0.04, 0.08], speed: [1, 2.5], life: [0.2, 0.4], gravity: 0, spread: 2, swirl: 14 }), point);
            fx.ring(above(point, 0), { colour: AIR.bright, from: 0.2, to: 1.1, life: 0.3, opacity: 0.8 });
            fx.flash(point, { colour: 0x9ad8ff, intensity: 14, distance: 6, life: 0.25 });
        },
    },
    lightning: {
        land: (fx, { at, point, struck }) => {
            fx.lightning(above(at, 14), point, { colour: AIR.deep, width: 0.07, life: 0.4, jag: 0.9, branches: 3 });

            // (Leaping on to the others it struck, one after another)
            let from = point;

            for (const other of struck) {
                const to = other.point();

                if (to) {
                    fx.lightning(from.clone(), to, { colour: AIR.deep, width: 0.045, life: 0.35, jag: 0.4 });
                    fx.spray(SPARKS, to);
                    from = to;
                }
            }

            fx.spray({ ...SPARKS, count: 30 }, point);
            fx.decal(at, { texture: "scorch", colour: 0xffffff, radius: 0.8, life: 4, dark: true });
            fx.flash(point, { colour: 0xbfe8ff, intensity: 40, distance: 14, life: 0.3, size: 4 });
            fx.screen(0xdff4ff, 0.1, 0.25);
        },
    },
    thunderbolt: {
        charging: (fx, { target, seconds }) => {
            const at = target?.();

            if (at) {
                fx.scatter(p([0x6a7488, 0x2a3040], { count: 3, size: [0.8, 1.4], speed: [0.2, 0.6], life: [seconds, seconds + 0.6], gravity: 0, spread: 1, glow: false, opacity: 0.6, grow: 1.2, swirl: 1 }), at, 3, 10, { seconds: seconds * 0.6, y: 7 });
            }
        },
        land: (fx, { at, point }) => {
            fx.lightning(above(at, 8), point, { colour: 0xffe860, width: 0.14, life: 0.5, jag: 1.1, branches: 5 });
            fx.lightning(above(at, 8), above(at, 0.1), { colour: AIR.deep, width: 0.07, life: 0.35, jag: 1.4, branches: 2 });
            fx.ring(at, { colour: AIR.bright, from: 0.4, to: 4, life: 0.6 });
            fx.spray({ ...SPARKS, count: 40, speed: [3, 7] }, point);
            fx.decal(at, { texture: "scorch", colour: 0xffffff, radius: 1.6, life: 6, dark: true });
            fx.flash(point, { colour: 0xfff4c0, intensity: 60, distance: 18, life: 0.5, size: 7 });
            fx.screen(0xffffff, 0.3, 0.35);
            fx.shake(0.22);
        },
    },
    tornado: {
        land: (fx, { at }) => {
            fx.funnel(at, { radius: 3.2, height: 9, life: 1.8 });
            fx.ring(at, { colour: AIR.bright, from: 0.5, to: 5.5, life: 0.8, opacity: 0.7 });
            fx.scatter({ ...DUST, count: 5, swirl: 6 }, at, 5, 14, { seconds: 1.2, y: 0.3 });

            for (let k = 0; k < 12; k++) {
                fx.after(k * 0.12, () => {
                    fx.spray({ ...DUST, count: 6, swirl: 14 }, above(at, 0.5 + k * 0.5));
                    fx.spray(p([0x8a6a4a, 0x3a2a1a], { count: 4, size: [0.05, 0.1], speed: [2, 4], life: [0.6, 1], gravity: -2, spread: 2, glow: false, opacity: 1, late: true, swirl: 16 }), above(at, 0.5 + k * 0.4));
                });
            }

            fx.shake(0.12);
        },
    },
    ionize: {
        land: (fx, { at, point, struck }) => {
            // The air itself turned to lightning: a crackling sphere swallowing everything round
            // them, bolts from the sky all about, leaping from foe to foe
            fx.screen(0x5a7aff, 0.45, 1.4);
            fx.shake(0.4);
            fx.dome(() => at, { colour: 0x3a6aff, radius: 6.5, height: 1, life: 1.8, opacity: 0.12 });
            fx.dome(() => at, { colour: 0x9a4aff, radius: 4, height: 1.2, life: 1.6, wire: false, opacity: 0.14 });
            fx.decal(at, { texture: "runes", colour: 0x5a8aff, radius: 10, life: 2.2, spin: 1.6, opacity: 0.8 });
            fx.flash(point, { colour: 0xbfe0ff, intensity: 80, distance: 28, life: 1.2, size: 16 });

            for (let k = 0; k < 22; k++) {
                fx.after(k * 0.06, () => {
                    const angle = Math.random() * Math.PI * 2;
                    const reach = Math.sqrt(Math.random()) * 12;
                    const spot = fx.onGround(at.x + Math.cos(angle) * reach, at.z + Math.sin(angle) * reach, 0.1);

                    fx.lightning(above(spot, 18), spot, { colour: k % 2 ? 0xc080ff : AIR.deep, width: 0.09, life: 0.3, jag: 1.2, branches: 2 });
                    fx.spray({ ...SPARKS, count: 12 }, above(spot, 0.3));
                });
            }

            for (let k = 0; k < 8; k++) {
                fx.after(0.1 + k * 0.1, () => {
                    const a = new THREE.Vector3(at.x + (Math.random() - 0.5) * 12, at.y + 1 + Math.random() * 5, at.z + (Math.random() - 0.5) * 12);

                    fx.lightning(point.clone(), a, { colour: 0x9ad8ff, width: 0.05, life: 0.25, jag: 0.8 });
                });
            }

            let from = point;

            for (const other of struck) {
                const to = other.point();

                if (to) {
                    fx.lightning(from.clone(), to, { colour: 0xffffff, width: 0.07, life: 0.6, jag: 0.5 });
                    from = to;
                }
            }

            for (let k = 0; k < 3; k++) {
                fx.after(k * 0.2, () => fx.ring(at, { colour: k === 1 ? 0xc080ff : 0x8ab8ff, from: 1, to: 22, life: 1, opacity: 1 }));
            }

            fx.scatter({ ...SPARKS, count: 10 }, at, 10, 30, { seconds: 1.2, y: 1 });
        },
    },

    // --- Water ---
    blister: {
        missile: { travel: 0.22, arc: 0.2, colour: 0xff9a8a, size: 0.08, trail: p([0xfff0e8, 0xf08a6a], { count: 1, size: [0.05, 0.1], speed: [0, 0.2], life: [0.15, 0.3], gravity: 1 }) },
        land: (fx, { point }) => {
            fx.spray({ ...STEAM, count: 5 }, point);
            fx.spray(p([0xffd0c0, 0xd05a3a], { count: 12, size: [0.03, 0.06], speed: [1.5, 3], life: [0.3, 0.6], gravity: 9, spread: 1.2, glow: false, opacity: 0.9, late: true }), point);
        },
    },
    waterbolt: {
        missile: { travel: 0.28, arc: 0.2, colour: 0x4aa8f0, size: 0.16, trail: p(WATER.glow, { count: 2, size: [0.05, 0.1], speed: [0.2, 0.6], life: [0.2, 0.4], gravity: 6, glow: false, opacity: 0.9, late: true }) },
        land: (fx, { at, point }) => {
            fx.spray(p([0xe8f8ff, 0x3a8ad0], { count: 34, size: [0.04, 0.09], speed: [2, 4], life: [0.4, 0.8], gravity: 9, spread: 1.4, glow: false, opacity: 0.95, late: true }), point);
            fx.ring(at, { colour: WATER.deep, from: 0.3, to: 1.5, life: 0.5 });
        },
    },
    steamblast: {
        land: (fx, { at, point }) => {
            for (let k = 0; k < 6; k++) {
                fx.after(k * 0.06, () => fx.spray({ ...STEAM, count: 10, speed: [1.5, 3] }, above(at, 0.2 + k * 0.3), new THREE.Vector3(0, 2, 0)));
            }

            fx.ring(at, { colour: 0xf2f2f2, from: 0.3, to: 2.2, life: 0.6, opacity: 0.8 });
            fx.spray(p([0xffe8e0, 0xf08a6a], { count: 16, size: [0.03, 0.06], speed: [2, 4], life: [0.3, 0.6], gravity: 9, spread: 2, glow: false, opacity: 0.9, late: true }), point);
        },
    },
    bloodboil: {
        land: (fx, { at, point }) => {
            for (let k = 0; k < 4; k++) {
                fx.after(k * 0.1, () => fx.spray(p([0xff9a8a, 0x8a0a06], { count: 14, size: [0.05, 0.12], speed: [0.4, 1.2], life: [0.6, 1], gravity: -2.4, spread: 1, glow: false, opacity: 0.95, late: true }), point));
            }

            fx.spray({ ...STEAM, colours: [0xffc0b0, 0x8a2a1a], count: 6 }, point);
            fx.ring(at, { colour: 0xd0141c, from: 0.3, to: 1.2, life: 0.5 });
            fx.flash(point, { colour: 0xff2a1a, intensity: 16, distance: 6, life: 0.4 });
        },
    },
    iceblade: {
        missile: { travel: 0.32, arc: 0.15, shape: "blade", colour: 0xbfeaff, size: 0.28, glow: true, trail: p([0xffffff, 0xa8e4ff], { count: 2, size: [0.03, 0.06], speed: [0, 0.3], life: [0.3, 0.5], gravity: 0.5, glow: false, opacity: 0.95 }) },
        land: (fx, { at, point }) => {
            // (Shattering on them, and ice bursting up round their feet, frost spreading)
            fx.shards(point, { count: 16, size: 0.09, speed: 4, up: 2.5, life: 1.2, colour: 0xbfeaff, glow: true });
            fx.spray({ ...SNOW, count: 50, speed: [1, 3.5] }, point);
            fx.spray(p([0xffffff, 0xa8e4ff], { count: 30, size: [0.04, 0.08], speed: [2, 4], life: [0.3, 0.6], gravity: 0, spread: 2 }), point);
            fx.spikes(at, { count: 7, radius: 0.8, height: 1.3, width: 0.2, colour: 0xbfeaff, life: 1.3, lean: 0.45, glow: true });
            fx.decal(at, { texture: "cracks", colour: 0xdff4ff, radius: 2.2, life: 3, opacity: 0.8, grow: 0.1 });
            fx.ring(at, { colour: WATER.bright, from: 0.3, to: 2.4, life: 0.5 });
            fx.flash(point, { colour: 0xdff4ff, intensity: 16, distance: 6, life: 0.3 });
        },
    },
    putrify: {
        land: (fx, { at, point }) => {
            for (let k = 0; k < 5; k++) {
                fx.after(k * 0.08, () => fx.scatter(p([0xc8d060, 0x4a5010], { count: 4, size: [0.05, 0.1], speed: [2, 4], life: [0.4, 0.7], gravity: 9, spread: 0.4, glow: false, opacity: 0.9, late: true }), at, 1.8, 4, { y: 3.5, direction: new THREE.Vector3(0, -3, 0) }));
            }

            fx.scatter(p([0xb0a040, 0x6a5a18], { count: 2, size: [0.4, 0.7], speed: [0.1, 0.3], life: [1.4, 2], gravity: -0.3, spread: 1.6, glow: false, opacity: 0.45, grow: 1.5 }), at, 2, 10, { seconds: 0.8, y: 0.6 });
            fx.spray(p([0x141008, 0x2a2418], { count: 14, size: [0.025, 0.035], speed: [0.4, 0.8], life: [1.4, 2], gravity: 0, spread: 2, glow: false, opacity: 1, late: true, swirl: 20 }), point);
        },
    },
    absoluteZero: {
        land: (fx, { at, point }) => {
            // Cold beyond cold: everything round them frozen solid in an instant, spears of ice
            // bursting from the ground out to the edge of sight, snow falling out of a clear sky
            fx.screen(0x6ab8ff, 0.45, 1.5);
            fx.shake(0.4);
            fx.flash(point, { colour: 0xdff4ff, intensity: 80, distance: 28, life: 1.2, size: 10 });
            fx.decal(at, { texture: "glow", colour: 0x2a6ab8, radius: 16, life: 6, opacity: 0.5, grow: 0.1 });
            fx.decal(at, { texture: "cracks", colour: 0x9adcff, radius: 12, life: 7, grow: 0.12, opacity: 0.75 });
            fx.decal(at, { texture: "runes", colour: 0x6ab8ff, radius: 9, life: 2.4, spin: -0.8, opacity: 0.8 });
            fx.pillar(at, { colour: 0x6ab8ff, radius: 2, height: 18, life: 1.6, rise: 0.1, opacity: 0.7 });
            fx.spikes(at, { count: 60, radius: 12, height: 3.6, width: 0.5, colour: 0xa8dcf8, life: 2.8, lean: 0.25, scatter: true, stagger: 0.35, roughness: 0.2 });
            fx.spikes(at, { count: 10, radius: 1.6, height: 3.2, width: 0.45, colour: 0x9adcff, life: 2.8, lean: 0.5, glow: true });

            for (let k = 0; k < 3; k++) {
                fx.after(k * 0.2, () => fx.ring(at, { colour: k === 1 ? 0xffffff : 0x9adcff, from: 1, to: 22, life: 1.1, opacity: 1 }));
            }

            fx.after(1.9, () => fx.scatter({ ...SNOW, count: 4 }, at, 10, 20, { y: 0.4 }));
            fx.after(1.9, () => fx.shards(above(at, 0.8), { count: 40, size: 0.16, speed: 6, up: 3, life: 1.4, colour: 0xbfeaff, glow: true, spread: 1.6 }));
            fx.scatter({ ...SNOW, count: 6 }, at, 12, 40, { seconds: 2, y: 7 });
        },
    },

    // --- Hexes ---
    stun: {},
    hold: {
        land: (fx, { at }) => fx.ring(at, { colour: HEX.deep, from: 0.8, to: 0.3, life: 0.6 }),
    },

    // --- From tomes ---
    resistFire: ward(0xff8a3a),
    resistWater: ward(0x4aa8f0),
    resistAir: ward(0xdceeff),
    resistEarth: ward(0xc8a870),
    resistMagic: ward(0xc898ff),
    resistPoison: ward(0x8ae04a),
    resistDisease: ward(0xe0c050),
    curePoison: cure(0x8ae04a),
    cureSickness: cure(0xc8b84a),
    liftCurse: cure(0x8a6aa8),
    quench: cure(0xff6a14),
    staunch: cure(0xd0141c),
    unbind: cure(0xbfe8ff),
    embolden: {
        palette: { glow: HEAL.gold, deep: 0xf2c040, bright: 0xfffbe0 },
        land: (fx, { at, point }) => {
            fx.pillar(at, { colour: 0xf2c040, radius: 0.5, height: 3, life: 0.8 });
            fx.spray(p(HEAL.gold, { count: 30, size: [0.06, 0.12], speed: [2, 4], life: [0.5, 0.9], gravity: -2, spread: 0.8 }), point, new THREE.Vector3(0, 3, 0));
            fx.ring(at, { colour: 0xf2c040, from: 0.3, to: 1.5, life: 0.6 });
        },
    },
    zombify: {
        palette: { glow: [0xb8ff9a, 0x1a6a2a], deep: 0x2a8a3a, bright: 0xb8ff9a },
        land: (fx, { at }) => {
            fx.decal(at, { texture: "cracks", colour: 0x9aff7a, radius: 1.6, life: 3, opacity: 0.9 });
            fx.decal(at, { texture: "runes", colour: 0x2a8a3a, radius: 1.5, life: 1.6, spin: -1.2, grow: 0.3 });
            fx.pillar(at, { colour: 0x3aaa4a, radius: 0.7, height: 4.5, life: 1.2 });
            fx.spray(p([0xb8ff9a, 0x0a2a10], { count: 50, size: [0.06, 0.14], speed: [0.6, 1.6], life: [0.8, 1.4], gravity: -2.4, spread: 1.2, swirl: 5 }), above(at, 0.2));
            fx.spray(p([0x1a2a18, 0x0a100a], { count: 8, size: [0.4, 0.6], speed: [0.2, 0.6], life: [1, 1.6], gravity: -0.6, spread: 1.2, glow: false, opacity: 0.5, grow: 1.5 }), above(at, 0.3));
            fx.flash(above(at, 1), { colour: 0x6aff5a, intensity: 18, distance: 7, life: 0.5 });
        },
    },
    teleport: {
        palette: { glow: [0xf0d8ff, 0x6a2ab8], deep: 0x9a4aff, bright: 0xf0d8ff },
        land: (fx, { at }) => {
            fx.spray(p([0xf0d8ff, 0x6a2ab8], { count: 60, size: [0.06, 0.14], speed: [1, 2.6], life: [0.4, 0.8], gravity: 0, spread: 2, swirl: 14 }), above(at, 1));
            fx.ring(at, { colour: 0x9a4aff, from: 1.6, to: 0.1, life: 0.4 });
            fx.flash(above(at, 1), { colour: 0xc080ff, intensity: 25, distance: 8, life: 0.4 });
        },
    },
    swole: {
        palette: { glow: [0xffd060, 0xff3a1a], deep: 0xff5a1a, bright: 0xffd060 },
        land: (fx, { at, point }) => {
            fx.spray(p([0xffd060, 0xd01000], { count: 34, size: [0.08, 0.18], speed: [1.5, 3], life: [0.3, 0.6], gravity: -1, spread: 2 }), point);
            fx.ring(at, { colour: 0xff5a1a, from: 0.3, to: 1.8, life: 0.5 });
            fx.flash(point, { colour: 0xff6a2a, intensity: 14, distance: 6, life: 0.4 });
        },
    },
    reflect: {
        palette: { glow: [0xffffff, 0xb8c8e8], deep: 0xc8d4f0, bright: 0xffffff },
        land: (fx, { target, at }) => {
            fx.dome(target.feet, { colour: 0xdce6ff, radius: 1.05, life: 1.4 });
            fx.spray(p([0xffffff, 0x9aaad8], { count: 24, size: [0.04, 0.08], speed: [1, 2], life: [0.4, 0.8], gravity: 0, spread: 2, swirl: 6 }), above(at, 1));
        },
    },
    invisibility: {
        palette: { glow: [0xffffff, 0x8ab8e8], deep: 0x8ab8e8, bright: 0xffffff },
        land: (fx, { at }) => {
            fx.spray(p([0xffffff, 0x8ab8e8], { count: 40, size: [0.04, 0.09], speed: [0.3, 1], life: [0.8, 1.4], gravity: -0.6, spread: 1.4, swirl: 8 }), above(at, 0.9));
            fx.ring(at, { colour: 0x8ab8e8, from: 1.2, to: 0.2, life: 0.6, opacity: 0.6 });
        },
    },
    wordOfRecall: {
        palette: { glow: [0xfffbe0, 0xf2c040], deep: 0xf2c040, bright: 0xfffbe0 },
        land: (fx, { at }) => {
            fx.pillar(at, { colour: 0xffe08a, radius: 0.8, height: 14, life: 1.1, rise: 0.15 });
            fx.flash(above(at, 1), { colour: 0xffe08a, intensity: 25, distance: 10, life: 0.5 });
        },
    },
    wizardsWalk: {
        palette: { glow: [0xe8e0ff, 0x5a3a9a], deep: 0x7a5acd, bright: 0xe8e0ff },
        land: (fx, { at }) => {
            fx.spray(p([0xffffff, 0x7a5acd], { count: 50, size: [0.04, 0.1], speed: [1, 2.4], life: [0.5, 1], gravity: -0.5, spread: 2.2, swirl: 6 }), above(at, 1));
            fx.decal(at, { texture: "runes", colour: 0x7a5acd, radius: 1.6, life: 1.2, spin: 2, grow: 0.3 });
        },
    },
    summon: {
        palette: { glow: [0xf0d8ff, 0x6a2ab8], deep: 0x9a4aff, bright: 0xf0d8ff },
        land: (fx, { at }) => fx.decal(at, { texture: "runes", colour: 0x9a4aff, radius: 1.4, life: 1.2, spin: 1.5, grow: 0.3 }),
    },
    levitate: {
        palette: { glow: [0xf4fbff, 0x7ac8ff], deep: 0x9adcff, bright: 0xffffff },
        land: (fx, { at }) => {
            fx.spray(p(AIR.glow, { count: 36, size: [0.05, 0.1], speed: [0.8, 1.6], life: [0.5, 0.9], gravity: -1, spread: 2, swirl: 14 }), above(at, 0.1));
            fx.ring(at, { colour: 0x9adcff, from: 0.2, to: 1.3, life: 0.6 });
        },
    },
    fear: {
        palette: { glow: [0xc8a8e8, 0x2a0a3a], deep: 0x6a2a9a, bright: 0xe8d8ff },
        land: (fx, { caster, target, point }) => {
            fx.stream(caster.hand, target.point, p([0x9a6ac8, 0x1a0a24], { size: [0.12, 0.24], speed: [3, 5], life: [0.25, 0.45], gravity: 0, spread: 1, glow: false, opacity: 0.6, grow: 1 }), { life: 0.3, rate: 70 });
            fx.spray(p([0x2a1438, 0x0c0612], { count: 12, size: [0.3, 0.5], speed: [0.6, 1.6], life: [0.8, 1.2], gravity: -0.4, spread: 2, glow: false, opacity: 0.55, grow: 1.4 }), point);
            fx.flash(point, { colour: 0x9a4aff, intensity: 10, distance: 5, life: 0.4 });
        },
    },
    polymorph: {
        palette: { glow: [0xffd8ff, 0xc04dff], deep: 0xd070ff, bright: 0xffd8ff },
        land: (fx, { point }) => fx.spray(p([0xffd8ff, 0xc04dff], { count: 40, size: [0.06, 0.12], speed: [1, 2.5], life: [0.4, 0.8], gravity: 0, spread: 2, swirl: 12 }), point),
    },
    attraction: {
        palette: { glow: [0xd8d0e0, 0x6a6070], deep: 0x8a7a9a, bright: 0xffffff },
    },
    inertialBarrier: {
        palette: { glow: [0xffffff, 0x3a8ae0], deep: 0x3a8ae0, bright: 0xbfe8ff },
        land: (fx, { target, at }) => {
            fx.dome(target.feet, { colour: 0x6ab8ff, radius: 1.05, life: 1.6, wire: false });
            fx.ring(at, { colour: 0x6ab8ff, from: 0.3, to: 1.3, life: 0.6 });
        },
    },
    surge: {
        palette: { glow: [0xffe080, 0xd01000], deep: 0xff3a1a, bright: 0xffe080 },
        land: (fx, { at, point }) => {
            fx.pillar(at, { colour: 0xff3a1a, radius: 0.6, height: 3, life: 0.7 });
            fx.spray(p([0xffe080, 0xd01000], { count: 40, size: [0.1, 0.2], speed: [1, 2.4], life: [0.4, 0.8], gravity: -3, spread: 1.6, grow: 0.3 }), point);
            fx.spray(SPARKS, point);
        },
    },
    pacify: {
        palette: { glow: [0xffffff, 0xbfe8ff], deep: 0xbfe8ff, bright: 0xffffff },
        land: (fx, { at }) => {
            fx.spray(p([0xffffff, 0xfff0d8], { count: 26, size: [0.06, 0.12], speed: [0.3, 0.8], life: [1.2, 1.8], gravity: 0.8, spread: 2.6, glow: false, opacity: 0.95, late: true, swirl: 2, drag: 1.5 }), above(at, 2.6));
            fx.ring(at, { colour: 0xbfe8ff, from: 0.3, to: 1.4, life: 0.7, opacity: 0.8 });
        },
    },
    vampirism: {
        palette: { glow: [0xff8a7a, 0x6a0a14], deep: 0xb0141c, bright: 0xff8a7a },
        land: (fx, { caster, target, point }) => {
            fx.stream(target.point, caster.point, p([0xff6a5a, 0x6a0a14], { size: [0.06, 0.12], speed: [3, 5], life: [0.3, 0.5], gravity: 0, spread: 0.6 }), { life: 0.6, rate: 80 });
            fx.spray(p([0xff8a7a, 0x6a0a14], { count: 20, size: [0.05, 0.1], speed: [1, 2], life: [0.3, 0.6], gravity: 0, spread: 2 }), point);
            fx.after(0.4, () => {
                const at = caster.point();

                if (at) {
                    fx.spray(p([0xff9a8a, 0xb0141c], { count: 24, size: [0.05, 0.1], speed: [0.5, 1.2], life: [0.5, 0.9], gravity: -1.5, spread: 1.6, swirl: 5 }), at);
                }
            });
        },
    },
    dodge: {
        palette: { glow: [0xffffff, 0x9adcff], deep: 0x9adcff, bright: 0xffffff },
        land: (fx, { at }) => fx.spray(p([0xffffff, 0x9adcff], { count: 30, size: [0.04, 0.08], speed: [2, 3.5], life: [0.25, 0.5], gravity: 0, spread: 2, swirl: 18 }), above(at, 0.9)),
    },
    poison: {
        palette: { glow: [0xd8ff8a, 0x3a7a10], deep: 0x5aa018, bright: 0xd8ff8a },
        missile: { travel: 0.26, arc: 0.35, colour: 0x7ac040, size: 0.1, trail: p([0xd8ff8a, 0x3a7a10], { count: 1, size: [0.05, 0.1], speed: [0, 0.3], life: [0.2, 0.4], gravity: 2.5, glow: false, opacity: 0.9 }) },
        land: (fx, { point }) => {
            fx.spray(p([0xd8ff8a, 0x3a7a10], { count: 24, size: [0.03, 0.08], speed: [1.2, 3], life: [0.35, 0.7], gravity: 9, spread: 1.4, glow: false, opacity: 0.9, late: true }), point);
            fx.spray(p([0x9ac040, 0x3a5a10], { count: 5, size: [0.3, 0.5], speed: [0.2, 0.5], life: [1, 1.5], gravity: -0.3, spread: 1.4, glow: false, opacity: 0.45, grow: 1.6 }), point);
        },
    },
};


/** Each spell's look, cast and landing (for tests: every spell has one). */
export const SPELL_LOOKS = RECIPES;
