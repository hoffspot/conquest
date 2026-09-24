// Visual effects drawn over the 2D map: muzzle flashes, shells in flight, explosions, fire, smoke,
// sparks, flying debris and scorch marks. They only decorate what the game reports (its "fire",
// "hit" and "destroyed" events, and damaged units) and never change the game itself.
//
// Explosions are built in layers, as in most games: a white-hot flash that lights up the ground,
// a fireball whose flames cool from white through yellow and orange to dark red, sparks and
// debris thrown out and falling back, a shock wave, smoke that rises and spreads for a few
// seconds, and a scorch mark that fades slowly. Destroyed units keep burning for a while, and
// big explosions shake the view a little.
//
// Fire and light are drawn with additive blending ("lighter"), so overlapping flames brighten each
// other; smoke and debris are drawn normally, underneath. Switching blend modes is slow on phones,
// so everything is drawn in two passes, one per blend mode, including the shells in flight.
//
// Particles are drawn with a few small images painted once (soft glows in each fire colour, smoke
// puffs, a muzzle flash) and stretched with drawImage, which is much faster than building
// gradients or using shadows for every particle. They are kept in a fixed-size pool, so a big
// battle can't slow a phone down: when it is nearly full, trails and lingering smoke are skipped,
// and when it is full, everything is.
//
// Positions are in world pixels on the map. A particle's `z` is its height above the ground, in
// pixels up the screen (see perspective.js), so that sparks and debris fall back to the ground.

import { GRID_SIZE } from "../core/config.js";
import { modelFor } from "./models.js";
import { heightOnScreen } from "./perspective.js";

// Most particles alive at once; trails and lingering smoke stop at LOW_PRIORITY_LIMIT
export const MAX_PARTICLES = 400;
const LOW_PRIORITY_LIMIT = 300;
const MAX_SCORCHES = 48;

// Fire cools from white-hot to dark red as it ages. Dark colours add almost nothing when blended
// additively, so flames fade out on their own.
const FIRE_COLORS = [
    [255, 252, 235], [255, 240, 170], [255, 205, 80], [255, 160, 40],
    [245, 112, 20], [190, 60, 25], [120, 35, 18], [60, 22, 12],
];

const SMOKE_COLORS = { dark: [56, 50, 46], grey: [112, 108, 102], dust: [150, 128, 94], light: [172, 168, 160] };

// Shapes lying on the ground are squashed vertically, as the ground is seen from 60° above
const GROUND_SQUASH = 0.85;

// Gravity for sparks and debris, in pixels per second squared
const GRAVITY = 260;

// Screen shake: the most the view moves, in world pixels, and how fast shaking dies away (per second)
const MAX_SHAKE = 4;
const SHAKE_DECAY = 1.6;

const TAU = Math.PI * 2;

const random = (min, max) => min + Math.random() * (max - min);

// A unit vector along a game direction (0 is north, `directions` is a full turn clockwise)
function heading(direction, directions) {
    const angle = (direction / directions) * TAU;

    return { x: Math.sin(angle), y: -Math.cos(angle), angle };
}

// Where an item stands on the map, in world pixels
function groundPosition(item) {
    if (item.type === "buildings") {
        return { x: item.x * GRID_SIZE + item.baseWidth / 2, y: item.y * GRID_SIZE + item.baseHeight / 2 };
    }

    return { x: item.x * GRID_SIZE, y: item.y * GRID_SIZE };
}

// How big an item is, roughly, in world pixels
function itemSize(item) {
    return item.type === "buildings" ? Math.max(item.baseWidth, item.baseHeight) : item.radius * 2;
}

/* The images particles are drawn with (painted once, when first needed) */

function makeCanvas(width, height = width) {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    return canvas;
}

// A soft round glow: bright in the middle, fading smoothly to nothing
function glowImage([r, g, b]) {
    const canvas = makeCanvas(64);
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);

    gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gradient.addColorStop(0.25, `rgba(${r},${g},${b},0.8)`);
    gradient.addColorStop(0.6, `rgba(${r},${g},${b},0.25)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);

    return canvas;
}

// A lumpy puff of smoke: a few overlapping soft blobs, so that puffs aren't perfect circles
function puffImage([r, g, b], seed) {
    const canvas = makeCanvas(64);
    const context = canvas.getContext("2d");
    let value = seed;
    const next = () => {
        value = (value * 9301 + 49297) % 233280;

        return value / 233280;
    };

    for (let i = 0; i < 6; i++) {
        const x = 32 + (next() - 0.5) * 22;
        const y = 32 + (next() - 0.5) * 22;
        const radius = 12 + next() * 8;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

        gradient.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
        gradient.addColorStop(0.6, `rgba(${r},${g},${b},0.3)`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
    }

    return canvas;
}

// A ragged tongue of flame: overlapping blobs with a hot core, stretched upwards a little
function flameImage([r, g, b], seed) {
    const canvas = makeCanvas(64);
    const context = canvas.getContext("2d");
    let value = seed;
    const next = () => {
        value = (value * 9301 + 49297) % 233280;

        return value / 233280;
    };

    for (let i = 0; i < 5; i++) {
        const x = 32 + (next() - 0.5) * 18;
        const y = 34 - next() * 12;
        const radius = 10 + next() * 10;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

        gradient.addColorStop(0, `rgba(${r},${g},${b},0.7)`);
        gradient.addColorStop(0.5, `rgba(${r},${g},${b},0.35)`);
        gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
    }

    return canvas;
}

// A shell's tracer, pointing right (+x): a streak that tapers and fades towards its tail
function streakImage([r, g, b]) {
    const canvas = makeCanvas(64, 16);
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 64, 0);

    gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
    gradient.addColorStop(0.6, `rgba(${r},${g},${b},0.55)`);
    gradient.addColorStop(0.9, "rgba(255,245,215,0.95)");
    gradient.addColorStop(1, "rgba(255,255,240,1)");
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(0, 8);
    context.lineTo(54, 3);
    context.quadraticCurveTo(64, 3, 64, 8);
    context.quadraticCurveTo(64, 13, 54, 13);
    context.closePath();
    context.fill();

    return canvas;
}

// A muzzle flash pointing right (+x): a hot core with tongues of flame shooting forward and out
function flashImage() {
    const canvas = makeCanvas(64, 32);
    const context = canvas.getContext("2d");
    const tongue = (angle, length, width, color) => {
        context.save();
        context.translate(8, 16);
        context.rotate(angle);
        context.beginPath();
        context.moveTo(0, -width);
        context.quadraticCurveTo(length * 0.4, -width * 0.8, length, 0);
        context.quadraticCurveTo(length * 0.4, width * 0.8, 0, width);
        context.closePath();
        context.fillStyle = color;
        context.fill();
        context.restore();
    };

    tongue(0, 56, 7, "rgba(255,170,60,0.75)");
    tongue(-0.6, 22, 4, "rgba(255,150,50,0.7)");
    tongue(0.6, 22, 4, "rgba(255,150,50,0.7)");
    tongue(0, 40, 3.5, "rgba(255,240,190,0.95)");

    const gradient = context.createRadialGradient(10, 16, 0, 10, 16, 12);

    gradient.addColorStop(0, "rgba(255,255,240,1)");
    gradient.addColorStop(1, "rgba(255,220,140,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);

    return canvas;
}

// A dark burnt patch on the ground
function scorchImage() {
    const canvas = makeCanvas(64);
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);

    gradient.addColorStop(0, "rgba(12,8,6,0.85)");
    gradient.addColorStop(0.45, "rgba(20,14,10,0.6)");
    gradient.addColorStop(1, "rgba(30,20,12,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);

    return canvas;
}

let images;

function getImages() {
    images ??= {
        fire: FIRE_COLORS.map(glowImage),
        flames: FIRE_COLORS.map((color) => [1, 2, 3].map((seed) => flameImage(color, seed * 3571))),
        streaks: Object.fromEntries(Object.entries(WEAPONS).map(([name, weapon]) => [name, streakImage(weapon.shell.color)])),
        smoke: Object.fromEntries(Object.entries(SMOKE_COLORS).map(([name, color]) => [name, [1, 2, 3].map((seed) => puffImage(color, seed * 7919))])),
        flash: flashImage(),
        scorch: scorchImage(),
    };

    return images;
}

/*
 * What each weapon's shots look like. Sizes are in world pixels.
 *   flash    muzzle flash length, and how many sparks and puffs of smoke it throws out
 *   dust     puffs of dust the blast kicks up around the tank
 *   shell    how the shot looks in flight: tracer length and width, glow size and colour, how
 *            high above its position it is drawn (shots from the ground come out of raised guns)
 *   trail    left behind in flight: smoke (missiles) or flames (fireballs)
 *   impact   the explosion where it hits: fireball size, how many flames, sparks, puffs of smoke
 *            and bits of debris, the shock wave's size, the scorch mark's size, and the light
 */
const WEAPONS = {
    "bullet": {
        flash: { length: 10, sparks: 2, smoke: 2 },
        shell: { tracer: 7, width: 1.6, glow: 4, color: [255, 220, 120], lift: 2.5 },
        impact: { size: 6, fire: 4, sparks: 5, smoke: 2, debris: 0, ring: 0, scorch: 0, light: 14 },
    },
    "cannon-ball": {
        flash: { length: 16, sparks: 4, smoke: 5 },
        dust: 6,
        shell: { tracer: 13, width: 2.6, glow: 6, color: [255, 170, 60], lift: 3 },
        impact: { size: 10, fire: 9, sparks: 10, smoke: 5, debris: 3, ring: 22, scorch: 8, light: 26 },
    },
    "heatseeker": {
        flash: { length: 9, sparks: 2, smoke: 3 },
        shell: { tracer: 5, width: 2, glow: 5, color: [255, 190, 90], lift: 0, missile: true },
        trail: "smoke",
        impact: { size: 12, fire: 10, sparks: 10, smoke: 5, debris: 3, ring: 24, scorch: 9, light: 30 },
    },
    "fireball": {
        flash: { length: 10, sparks: 3, smoke: 0 },
        shell: { tracer: 9, width: 3, glow: 9, color: [255, 140, 40], lift: 0, flicker: true },
        trail: "fire",
        impact: { size: 12, fire: 14, sparks: 8, smoke: 3, debris: 0, ring: 22, scorch: 8, light: 32 },
    },
};

export class Effects {
    // Every particle made so far, reused when it dies (the first `#count` are alive)
    #particles = [];
    #count = 0;
    #scorches = [];
    // Wrecks that keep burning for a while after a unit or building is destroyed
    #wrecks = [];
    // Blasts that go off a little later (the second and third blasts of a big explosion)
    #pending = [];
    // Shots to draw this frame, with where each one is
    #shells = [];
    // Where each shot in flight last left a trail particle
    #trails = new WeakMap();
    // Damaged units and buildings: how long until each one's next puff of smoke
    #smoking = new WeakMap();
    // How much the view is shaking (0 to 1; the shake grows with its square)
    #trauma = 0;
    #shakeOffset = { x: 0, y: 0 };
    #view;

    /**
     * @param {{game: object, reducedMotion?: boolean}} options  reducedMotion turns off screen shake
     */
    constructor({ game, reducedMotion = false }) {
        this.game = game;
        this.reducedMotion = reducedMotion;
        // Milliseconds of game time (stops while the game is paused)
        this.time = 0;
    }

    /** How many particles are alive. */
    get count() {
        return this.#count;
    }

    /** The living particles (for tests). */
    get particles() {
        return this.#particles.slice(0, this.#count);
    }

    get scorchCount() {
        return this.#scorches.length;
    }

    /** How far to shake the view this frame, in world pixels. */
    get shakeOffset() {
        return this.#shakeOffset;
    }

    /** Forget every effect (when a level starts). */
    clear() {
        this.#count = 0;
        this.#scorches = [];
        this.#wrecks = [];
        this.#pending = [];
        this.#shells = [];
        this.#trauma = 0;
        this.#shakeOffset = { x: 0, y: 0 };
    }

    // Is this point hidden from the player by the fog of war? Effects there aren't shown.
    #hidden(x, y) {
        return this.game.fog?.isPointOverFog(x, y) ?? false;
    }

    // A particle from the pool, set up with `options`, or undefined if the pool is too full
    #spawn(x, y, z, options, lowPriority = false) {
        if (this.#count >= (lowPriority ? LOW_PRIORITY_LIMIT : MAX_PARTICLES)) {
            return undefined;
        }

        let particle = this.#particles[this.#count];

        if (!particle) {
            particle = {};
            this.#particles.push(particle);
        }

        this.#count++;

        return Object.assign(particle, {
            x, y, z,
            vx: 0, vy: 0, vz: 0,
            age: 0,
            life: 500,
            size: 4,
            endSize: 4,
            alpha: 1,
            // How quickly it slows down (per second), and how strongly it falls
            drag: 0,
            gravity: 0,
            bounce: false,
            landed: false,
            // "fire" | "glow" | "light" | "flash" | "spark" | "smoke" | "debris" | "ring"
            kind: "fire",
            color: undefined,
            variant: 0,
            angle: 0,
            // Where fire starts on its colour ramp (0 is white-hot)
            heat: 0,
        }, options);
    }

    /* Reacting to the game */

    /** A unit or building fired: a muzzle flash, smoke and (for heavy guns) dust. */
    fire(item, bullet) {
        const weapon = WEAPONS[bullet.name];
        const model = modelFor(item);
        const direction = heading(bullet.direction, bullet.directions);
        let x;
        let y;
        let z;

        if (model?.muzzle) {
            const ground = groundPosition(item);

            x = ground.x + direction.x * model.muzzle[0];
            y = ground.y + direction.y * model.muzzle[0];
            z = heightOnScreen(model.muzzle[1]);
        } else {
            // Shots from aircraft start at the aircraft's height on the screen already
            x = bullet.x * GRID_SIZE;
            y = bullet.y * GRID_SIZE;
            z = 0;
        }

        if (!weapon || this.#hidden(x, y - z)) {
            return;
        }

        const { length, sparks, smoke } = weapon.flash;

        // The flash: a star of flame along the barrel for a couple of frames, a glow, and a moment
        // of light on the ground
        this.#spawn(x, y, z, { kind: "flash", angle: direction.angle - Math.PI / 2 + random(-0.2, 0.2), size: length, endSize: length * 1.2, life: 55 });
        this.#spawn(x, y, z, { kind: "glow", heat: 1, size: length * 0.8, endSize: length * 1.1, life: 90, alpha: 0.9 });
        this.#spawn(x, y, 0, { kind: "light", size: length * 2, endSize: length * 2.4, life: 110, alpha: 0.3 });

        for (let i = 0; i < sparks; i++) {
            const spread = random(-0.45, 0.45);
            const speed = random(120, 240);
            const dx = direction.x * Math.cos(spread) - direction.y * Math.sin(spread);
            const dy = direction.y * Math.cos(spread) + direction.x * Math.sin(spread);

            this.#spawn(x, y, z, { kind: "spark", vx: dx * speed, vy: dy * speed, vz: random(0, 40), life: random(90, 160), size: 1, drag: 4 });
        }

        // Smoke blown out of the barrel, slowing and spreading
        for (let i = 0; i < smoke; i++) {
            const speed = random(20, 55);

            this.#spawn(x + direction.x * random(0, 4), y + direction.y * random(0, 4), z, {
                kind: "smoke", color: "light", variant: i % 3,
                vx: direction.x * speed + random(-8, 8), vy: direction.y * speed + random(-8, 8), vz: random(4, 12),
                drag: 2.5, size: length * 0.3, endSize: length * random(0.8, 1.1), life: random(550, 900), alpha: 0.5,
            });
        }

        // A heavy gun's blast kicks up a ring of dust around the tank
        if (weapon.dust && item.type === "vehicles") {
            const ground = groundPosition(item);

            for (let i = 0; i < weapon.dust; i++) {
                const angle = (i / weapon.dust) * TAU + random(-0.4, 0.4);
                const speed = random(22, 40);

                this.#spawn(ground.x + Math.cos(angle) * 7, ground.y + Math.sin(angle) * 6, 0, {
                    kind: "smoke", color: "dust", variant: i % 3,
                    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * GROUND_SQUASH, vz: random(2, 6),
                    drag: 3.5, size: 4, endSize: random(8, 11), life: random(400, 600), alpha: 0.35,
                });
            }
        }
    }

    /** A shot hit something (or the ground, when `target` is undefined): an explosion. */
    hit(bullet, target) {
        const weapon = WEAPONS[bullet.name];
        const x = bullet.x * GRID_SIZE;
        let y = bullet.y * GRID_SIZE;
        let z;

        if (target?.type === "aircraft") {
            // Hits on aircraft are already at the aircraft's height on the screen: move them over
            // its shadow and lift them back up, so that sparks and debris fall to the ground
            y += target.pixelShadowHeight;
            z = target.pixelShadowHeight;
        } else {
            z = target ? heightOnScreen(target.type === "buildings" ? 10 : 6) : 0;
        }

        if (!weapon || this.#hidden(x, y - z)) {
            return;
        }

        const { impact } = weapon;

        if (!target) {
            // Fell short: a puff of dust and a few sparks where it lands
            this.#burst(x, y, 0, { size: impact.size * 0.5, fire: 1, sparks: 3, smoke: 0, dust: 4, debris: 0, ring: 0, scorch: impact.scorch * 0.5, light: impact.light * 0.5 });

            return;
        }

        this.#burst(x, y, z, { ...impact, scorch: target.type === "aircraft" ? 0 : impact.scorch });
    }

    /** A unit or building was destroyed: a big explosion (several, for buildings), then burning wreckage. */
    destroyed(item) {
        const ground = groundPosition(item);
        const size = itemSize(item);
        const aircraft = item.type === "aircraft";
        const z = aircraft ? item.pixelShadowHeight : heightOnScreen(size * 0.25);

        if (this.#hidden(ground.x, ground.y - z)) {
            return;
        }

        const building = item.type === "buildings";
        const blast = (x, y, height, scale) => this.#burst(x, y, height, {
            size: size * (building ? 0.4 : 0.55) * scale,
            fire: Math.round(16 * scale),
            sparks: Math.round(18 * scale),
            smoke: Math.round(10 * scale),
            debris: Math.round(9 * scale),
            ring: size * (building ? 1.2 : 1.6) * scale,
            scorch: aircraft ? 0 : size * (building ? 0.55 : 0.7) * scale,
            light: size * (building ? 1.4 : 2) * scale,
            column: true,
        });

        blast(ground.x, ground.y, z, 1);

        if (building) {
            // Buildings go up in several blasts across their base
            for (let i = 1; i <= 3; i++) {
                const x = ground.x + random(-0.35, 0.35) * item.baseWidth;
                const y = ground.y + random(-0.35, 0.35) * item.baseHeight;

                this.#later(i * random(110, 200), () => blast(x, y, heightOnScreen(random(4, 14)), random(0.5, 0.75)));
            }
        }

        // What's left burns for a few seconds (an aircraft's wreck, where it hits the ground)
        if (aircraft) {
            this.#addScorch(ground.x, ground.y, size * 0.5);
        }

        this.#wrecks.push({ x: ground.x, y: ground.y, spread: size * 0.3, age: 0, life: building ? 6000 : 3500, next: aircraft ? 500 : 250 });
        this.#addShake(building ? 0.7 : 0.45, ground.x, ground.y - z);
    }

    // One explosion: light, flash, fireball, sparks, debris, smoke, a shock wave and a scorch mark
    #burst(x, y, z, { size, fire, sparks, smoke, dust = 0, debris, ring, scorch, light, column = false }) {
        // The flash lights up the ground around it for a moment
        this.#spawn(x, y, 0, { kind: "light", size: light, endSize: light * 1.2, life: 160, alpha: 0.3 });
        this.#spawn(x, y, z, { kind: "glow", heat: 0, size: size, endSize: size * 1.4, life: 80, alpha: 0.9 });

        // The fireball: ragged flames that billow out and up, cooling as they go
        for (let i = 0; i < fire; i++) {
            const angle = random(0, TAU);
            const speed = random(12, 45) * (size / 10);

            this.#spawn(x + random(-0.35, 0.35) * size, y + random(-0.25, 0.25) * size, z + random(0, 0.3) * size, {
                kind: "fire", heat: random(0.4, 2), variant: i % 3, alpha: 0.9,
                vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * GROUND_SQUASH, vz: random(10, 34) * (size / 10),
                drag: 4, size: size * random(0.45, 0.65), endSize: size * random(0.9, 1.3), life: random(300, 550),
            });
        }

        for (let i = 0; i < sparks; i++) {
            const angle = random(0, TAU);
            const speed = random(60, 200) * Math.min(1.6, size / 10);

            this.#spawn(x, y, z, {
                kind: "spark", vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * GROUND_SQUASH, vz: random(30, 130),
                gravity: GRAVITY, drag: 1.5, bounce: true, life: random(220, 550), size: 1,
            });
        }

        for (let i = 0; i < debris; i++) {
            const angle = random(0, TAU);
            const speed = random(30, 90) * Math.min(1.6, size / 10);

            this.#spawn(x, y, z, {
                kind: "debris", vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * GROUND_SQUASH, vz: random(70, 160),
                gravity: GRAVITY * 1.4, drag: 0.6, bounce: true, life: random(900, 1500), size: random(1.2, 2.4),
            });
        }

        // Smoke rises from the fire and lingers; a big explosion leaves a rising column
        for (let i = 0; i < smoke; i++) {
            const delay = column ? 40 + i * 55 : random(40, 160);

            this.#later(delay, () => this.#spawn(x + random(-0.4, 0.4) * size, y + random(-0.3, 0.3) * size, z + random(0, 0.4) * size, {
                kind: "smoke", color: "dark", variant: i % 3,
                vx: random(-12, 12), vy: random(-6, 6), vz: random(14, 30) * (column ? 1.3 : 1),
                drag: 0.8, size: size * 0.6, endSize: size * random(1.6, 2.4), life: random(1200, 2000) * (column ? 1.4 : 1), alpha: 0.5,
            }));
        }

        for (let i = 0; i < dust; i++) {
            const angle = random(0, TAU);

            this.#spawn(x, y, 0, {
                kind: "smoke", color: "dust", variant: i % 3,
                vx: Math.cos(angle) * random(10, 30), vy: Math.sin(angle) * random(8, 20), vz: random(6, 16),
                drag: 2, size: size * 0.6, endSize: size * 1.6, life: random(500, 800), alpha: 0.45,
            });
        }

        if (ring) {
            this.#spawn(x, y, 0, { kind: "ring", size: size * 0.3, endSize: ring, life: 250, alpha: 0.45 });
        }

        if (scorch) {
            this.#addScorch(x, y, scorch);
        }
    }

    #later(delay, spawn) {
        this.#pending.push({ at: this.time + delay, spawn });
    }

    #addScorch(x, y, size) {
        if (this.#scorches.length >= MAX_SCORCHES) {
            this.#scorches.shift();
        }

        this.#scorches.push({ x, y, size, age: 0, life: random(16000, 22000) });
    }

    // Shake the view, less for explosions away from the middle of the screen
    #addShake(amount, x, y) {
        if (this.reducedMotion) {
            return;
        }

        const view = this.#view;
        let closeness = 1;

        if (view) {
            const dx = (x - (view.x + view.width / 2)) / (view.width / 2);
            const dy = (y - (view.y + view.height / 2)) / (view.height / 2);

            closeness = Math.max(0, 1 - Math.hypot(dx, dy) * 0.6);
        }

        this.#trauma = Math.min(1, this.#trauma + amount * closeness);
    }

    /* Each frame */

    /**
     * Move every effect on by `elapsed` milliseconds of game time (0 while paused), and add
     * smoke above damaged units and buildings that the player can see.
     * @param {Iterable} items  the game's items
     * @param {{x: number, y: number, width: number, height: number}} [view]  the visible part of the map
     */
    update(elapsed, items = [], view = undefined) {
        this.#view = view;

        const dt = Math.min(elapsed, 100);

        if (!(dt > 0)) {
            return;
        }

        this.time += dt;

        const seconds = dt / 1000;

        if (this.#pending.length) {
            const due = this.#pending.filter(({ at }) => at <= this.time);

            this.#pending = this.#pending.filter(({ at }) => at > this.time);

            for (const { spawn } of due) {
                spawn();
            }
        }

        for (let i = 0; i < this.#count; i++) {
            const p = this.#particles[i];

            p.age += dt;

            if (p.age >= p.life) {
                // Move the last living particle into this slot
                this.#count--;
                this.#particles[i] = this.#particles[this.#count];
                this.#particles[this.#count] = p;
                i--;
                continue;
            }

            const slow = Math.exp(-p.drag * seconds);

            p.vx *= slow;
            p.vy *= slow;
            p.vz = p.vz * slow - p.gravity * seconds;
            p.x += p.vx * seconds;
            p.y += p.vy * seconds;
            p.z += p.vz * seconds;

            if (p.z < 0 && p.bounce) {
                // Hit the ground: bounce a little and slide to a stop. Debris kicks up dust.
                if (p.kind === "debris" && !p.landed) {
                    this.#spawn(p.x, p.y, 0, { kind: "smoke", color: "dust", variant: i % 3, vz: 5, drag: 2, size: 2, endSize: 6, life: 450, alpha: 0.4 }, true);
                }

                p.landed = true;
                p.z = 0;
                p.vz = -p.vz * 0.3;
                p.vx *= 0.5;
                p.vy *= 0.5;
            }
        }

        for (const scorch of this.#scorches) {
            scorch.age += dt;
        }

        this.#scorches = this.#scorches.filter((scorch) => scorch.age < scorch.life);
        this.#burnWrecks(dt);

        // Shaking dies away quickly; the view wobbles smoothly rather than jumping about
        this.#trauma = Math.max(0, this.#trauma - SHAKE_DECAY * seconds);

        const shake = MAX_SHAKE * this.#trauma * this.#trauma;
        const t = this.time;

        this.#shakeOffset = shake > 0.05
            ? { x: shake * (0.6 * Math.sin(t * 0.071) + 0.4 * Math.sin(t * 0.173 + 1.3)), y: shake * (0.6 * Math.sin(t * 0.063 + 2.1) + 0.4 * Math.sin(t * 0.191 + 0.4)) }
            : { x: 0, y: 0 };

        this.#smokeFromDamaged(dt, items, view);
    }

    // Wreckage burns with small flames and smoke that die down
    #burnWrecks(dt) {
        for (const wreck of this.#wrecks) {
            wreck.age += dt;
            wreck.next -= dt;

            if (wreck.next > 0) {
                continue;
            }

            const strength = 1 - wreck.age / wreck.life;

            wreck.next = random(35, 60) / Math.max(0.3, strength);

            const x = wreck.x + random(-1, 1) * wreck.spread;
            const y = wreck.y + random(-1, 1) * wreck.spread * GROUND_SQUASH;

            if (this.#hidden(x, y)) {
                continue;
            }

            // Flames licking up, smaller as the fire dies down
            this.#spawn(x, y, heightOnScreen(2), {
                kind: "fire", heat: random(0.5, 1.8), variant: Math.floor(random(0, 3)), alpha: 0.9, vx: random(-3, 3), vz: random(14, 26), drag: 1,
                size: random(4.5, 7) * (0.4 + strength), endSize: random(3, 4.5) * (0.4 + strength), life: random(350, 550),
            }, true);

            if (Math.random() < 0.6) {
                this.#spawn(x, y, heightOnScreen(4), {
                    kind: "smoke", color: "dark", variant: Math.floor(random(0, 3)), vx: random(-4, 4), vz: random(14, 22),
                    drag: 0.5, size: 4, endSize: random(10, 15), life: random(1200, 1800), alpha: 0.4 * (0.4 + strength),
                }, true);
            }
        }

        this.#wrecks = this.#wrecks.filter((wreck) => wreck.age < wreck.life);
    }

    // Damaged units and buildings smoke, and damaged buildings burn
    #smokeFromDamaged(dt, items, view) {
        for (const item of items) {
            if (item.lifeCode !== "damaged" || item.type === "bullets" || item.type === "terrain") {
                continue;
            }

            const left = (this.#smoking.get(item) ?? random(0, 150)) - dt;
            const building = item.type === "buildings";

            if (left > 0) {
                this.#smoking.set(item, left);
                continue;
            }

            this.#smoking.set(item, building ? random(90, 150) : random(140, 220));

            const ground = groundPosition(item);
            const margin = 40;

            if (view && (ground.x < view.x - margin || ground.x > view.x + view.width + margin || ground.y < view.y - margin || ground.y > view.y + view.height + margin)) {
                continue;
            }

            let x = ground.x;
            let y = ground.y;
            let z = item.type === "aircraft" ? item.pixelShadowHeight : heightOnScreen(6);

            if (building) {
                x += random(-0.3, 0.3) * item.baseWidth;
                y += random(-0.3, 0.3) * item.baseHeight;
                z = heightOnScreen(random(6, 16));
            }

            if (this.#hidden(x, y - z)) {
                continue;
            }

            this.#spawn(x, y, z, {
                kind: "smoke", color: "dark", variant: Math.floor(random(0, 3)),
                vx: random(-4, 4), vy: random(-3, 3), vz: random(14, 24),
                drag: 0.5, size: 4, endSize: building ? random(14, 20) : random(10, 14), life: random(1200, 1800), alpha: 0.45,
            }, true);

            if (building && Math.random() < 0.5) {
                this.#spawn(x, y, z, { kind: "fire", heat: random(0.8, 2.2), variant: Math.floor(random(0, 3)), alpha: 0.85, vz: random(12, 20), size: random(3, 5), endSize: random(2, 3), life: random(300, 500) }, true);
            }
        }
    }

    /* Drawing */

    /** Scorch marks, on the ground under the units. */
    drawGround(context, view) {
        if (!this.#scorches.length) {
            return;
        }

        const { scorch } = getImages();

        for (const mark of this.#scorches) {
            const fade = Math.min(1, (mark.life - mark.age) / (mark.life * 0.3));
            const width = mark.size * 2;

            context.globalAlpha = 0.6 * fade;
            context.drawImage(scorch, mark.x - view.offsetX - mark.size, mark.y - view.offsetY - mark.size * GROUND_SQUASH, width, width * GROUND_SQUASH);
        }

        context.globalAlpha = 1;
    }

    /**
     * Called instead of drawing a shot's sprite: the shot is drawn later by draw(), with the
     * other effects. `x` and `y` are where it is this frame, in world pixels. Returns false for
     * shots this doesn't know how to draw.
     */
    drawBullet(bullet, x, y) {
        const weapon = WEAPONS[bullet.name];

        if (!weapon) {
            return false;
        }

        // An exploding shot is drawn as its explosion
        if (bullet.action !== "explode") {
            this.#shells.push({ bullet, weapon, x, y: y - weapon.shell.lift });
            this.#leaveTrail(bullet, weapon, x, y);
        }

        return true;
    }

    // Missiles leave smoke behind them, and fireballs leave flames. They're left at even spacing
    // along the path the shot is drawn on, so that they don't bunch up at each game tick.
    #leaveTrail(bullet, weapon, x, y) {
        if (!weapon.trail) {
            return;
        }

        const last = this.#trails.get(bullet);

        if (!last) {
            this.#trails.set(bullet, { x, y });

            return;
        }

        const spacing = weapon.trail === "smoke" ? 3 : 2.5;
        const steps = Math.min(8, Math.floor(Math.hypot(x - last.x, y - last.y) / spacing));

        for (let i = 1; i <= steps; i++) {
            const px = last.x + ((x - last.x) * i) / steps;
            const py = last.y + ((y - last.y) * i) / steps;

            if (weapon.trail === "smoke") {
                this.#spawn(px, py, 0, {
                    kind: "smoke", color: "grey", variant: i % 3, vx: random(-3, 3), vy: random(-3, 3), vz: random(2, 6),
                    drag: 1, size: 2.5, endSize: random(7, 10), life: random(500, 800), alpha: 0.4,
                }, true);
            } else {
                this.#spawn(px, py, 0, { kind: "fire", heat: random(1, 2.5), variant: i % 3, vx: random(-5, 5), vy: random(-5, 5), vz: random(3, 8), size: 5, endSize: 2, life: random(160, 260) }, true);
            }
        }

        if (steps > 0) {
            this.#trails.set(bullet, { x, y });
        }
    }

    /** Everything else, over the units (and under the fog of war). */
    draw(context, view) {
        const shells = this.#shells;

        this.#shells = [];

        if (!this.#count && !shells.length) {
            return;
        }

        const images = getImages();
        const offsetX = view.offsetX;
        const offsetY = view.offsetY;

        // Smoke, debris and missiles first, blended normally
        for (let i = 0; i < this.#count; i++) {
            const p = this.#particles[i];
            const progress = p.age / p.life;

            if (p.kind === "smoke") {
                const size = p.size + (p.endSize - p.size) * Math.sqrt(progress);

                // Fades in quickly, then out slowly
                context.globalAlpha = p.alpha * Math.min(1, progress * 8) * (1 - progress);
                context.drawImage(images.smoke[p.color][p.variant], p.x - offsetX - size, p.y - offsetY - p.z - size, size * 2, size * 2);
            } else if (p.kind === "debris") {
                context.globalAlpha = Math.min(1, (1 - progress) * 3);
                context.fillStyle = "#2b2622";
                context.fillRect(p.x - offsetX - p.size / 2, p.y - offsetY - p.z - p.size / 2, p.size, p.size);
            }
        }

        context.globalAlpha = 1;

        for (const { bullet, weapon, x, y } of shells) {
            if (weapon.shell.missile) {
                const direction = heading(bullet.direction, bullet.directions);

                context.strokeStyle = "#3a3a3a";
                context.lineWidth = 1.6;
                context.beginPath();
                context.moveTo(x - offsetX - direction.x * weapon.shell.tracer, y - offsetY - direction.y * weapon.shell.tracer);
                context.lineTo(x - offsetX, y - offsetY);
                context.stroke();
            }
        }

        // Then fire, light, sparks and shells, added together
        context.globalCompositeOperation = "lighter";
        context.lineCap = "round";

        for (let i = 0; i < this.#count; i++) {
            this.#drawBright(context, this.#particles[i], images, offsetX, offsetY);
        }

        for (const { bullet, weapon, x, y } of shells) {
            this.#drawShell(context, bullet, weapon, x - offsetX, y - offsetY, images);
        }

        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        context.lineCap = "butt";
    }

    #drawBright(context, p, images, offsetX, offsetY) {
        const progress = p.age / p.life;
        const x = p.x - offsetX;
        const y = p.y - offsetY - p.z;

        switch (p.kind) {
            case "fire":
            case "glow": {
                // Cooling from white-hot down the colour ramp, growing fast then slowly
                const stage = Math.min(FIRE_COLORS.length - 1, Math.floor(p.heat + progress * (FIRE_COLORS.length - p.heat)));
                const size = p.size + (p.endSize - p.size) * (1 - (1 - progress) * (1 - progress));

                context.globalAlpha = p.alpha * (p.kind === "glow" ? 1 - progress : Math.min(1, (1 - progress) * 1.6));
                context.drawImage(p.kind === "glow" ? images.fire[stage] : images.flames[stage][p.variant], x - size, y - size, size * 2, size * 2);
                break;
            }

            case "light": {
                const size = p.size + (p.endSize - p.size) * progress;

                context.globalAlpha = p.alpha * (1 - progress);
                context.drawImage(images.fire[3], x - size, y - size * GROUND_SQUASH, size * 2, size * 2 * GROUND_SQUASH);
                break;
            }

            case "flash": {
                const length = p.size + (p.endSize - p.size) * progress;

                context.globalAlpha = 1 - progress * progress;
                context.save();
                context.translate(x, y);
                context.rotate(p.angle);
                context.drawImage(images.flash, -length * 0.15, -length * 0.25, length, length * 0.5);
                context.restore();
                break;
            }

            case "spark": {
                // A short streak along its path, fading from yellow-white to orange
                context.globalAlpha = 1 - progress;
                context.strokeStyle = progress < 0.4 ? "#fff3c0" : "#ffae40";
                context.lineWidth = p.size;
                context.beginPath();
                context.moveTo(x, y);
                context.lineTo(x - p.vx * 0.02, y - (p.vy - p.vz) * 0.02);
                context.stroke();
                break;
            }

            case "ring": {
                // A shock wave racing out across the ground
                const radius = p.size + (p.endSize - p.size) * (1 - (1 - progress) ** 3);

                context.globalAlpha = p.alpha * (1 - progress);
                context.strokeStyle = "#ffd9a0";
                context.lineWidth = 1.6 * (1 - progress) + 0.4;
                context.beginPath();
                context.ellipse(x, y, radius, radius * GROUND_SQUASH, 0, 0, TAU);
                context.stroke();
                break;
            }
        }
    }

    // A shell's glowing head and tracer streak (a missile's exhaust; a fireball's flickering glow)
    #drawShell(context, bullet, weapon, x, y, images) {
        const { shell } = weapon;
        const direction = heading(bullet.direction, bullet.directions);
        const tailX = x - direction.x * shell.tracer;
        const tailY = y - direction.y * shell.tracer;
        // Fireballs flicker (with game time, so that a paused game stands still)
        const glow = shell.glow * (shell.flicker ? 1 + 0.15 * Math.sin(this.time * 0.045 + bullet.uid * 1.7) * Math.sin(this.time * 0.023 + bullet.uid) : 1);
        const [glowX, glowY] = shell.missile ? [tailX, tailY] : [x, y];

        context.globalAlpha = 1;

        if (!shell.missile) {
            // The tracer: a streak from the tail, brightest at the head
            context.save();
            context.translate(x, y);
            context.rotate(direction.angle - Math.PI / 2);
            context.drawImage(images.streaks[bullet.name], -shell.tracer, -shell.width, shell.tracer + shell.width * 0.5, shell.width * 2);
            context.restore();
        }

        context.drawImage(images.fire[shell.flicker ? 3 : 2], glowX - glow, glowY - glow, glow * 2, glow * 2);
    }
}
