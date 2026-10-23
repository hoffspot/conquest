// Tracks on the ground (docs/WILDS.md *Tracks*): a print where each of the wild's creatures sets a
// foot down (app/game.js, its avatar's footfalls), as its feet are (PRINTS: a dog's paw, a cat's,
// a bear's broad one; a cloven hoof; a drake's three-toed claw; a lizard's splayed toes; a boot, a
// bare foot, a frog's webbed one; a spider's or a centipede's pricks; a serpent's slither, a
// slime's smear), deeper in what takes a print well (snow, mud, sand) and fainter in grass, none
// on stone, boards or water (TAKES). Each lies along the ground where it slopes, darkening it as
// the contact shadows do (contacts.js: right by day and by night alike, and fogged away with the
// ground), and fades: it's there TRACKS.lasts seconds, then gone over TRACKS.fade more. All of them
// are one instanced quad, a single draw call, the oldest let go once there are TRACKS.most; their
// shapes are drawn once onto a canvas, a cell each (printAtlas).

import * as THREE from "three";

/**
 * How many prints there can be at once (`most`), how long one's there before it fades (`lasts`,
 * s) and how long it takes to fade (`fade`, s), how dark it is at its darkest (`strength`: the
 * share of the ground's light it keeps off), and how far above the ground it lies (`lift`, m).
 */
export const TRACKS = Object.freeze({ most: 768, lasts: 180, fade: 60, strength: 0.55, lift: 0.015 });

/**
 * Each kind of print (its cell in the atlas, in this order) and how big it is against the one
 * leaving it (`size`: a share of its gait's size, beasts/beast.js; `long`: how much longer than
 * it's wide).
 */
export const PRINTS = Object.freeze({
    paw: { size: 0.11, long: 1.15 },
    cat: { size: 0.1, long: 1 },
    broad: { size: 0.16, long: 1.35 },
    hoof: { size: 0.09, long: 1.2 },
    claw: { size: 0.2, long: 1.25 },
    lizard: { size: 0.14, long: 1.1 },
    boot: { size: 0.17, long: 2.3 },
    bare: { size: 0.17, long: 2.1 },
    webbed: { size: 0.14, long: 1 },
    pricks: { size: 0.3, long: 1 },
    slither: { size: 0.35, long: 2.2 },
    smear: { size: 0.5, long: 1.3 },
});

const KINDS = Object.keys(PRINTS);
const COLUMNS = 4;
const ROWS = Math.ceil(KINDS.length / COLUMNS);
const CELL = 128;

/** How well each footing takes a print (audio/footing.js's names): none on what doesn't. */
export const TAKES = Object.freeze({ snow: 1, mud: 1, sand: 0.9, dirt: 0.75, grass: 0.5, gravel: 0.3 });

// The kinds whose prints aren't their feet's (beasts/beast.js gait.feet, LOOKS' hooves): their own
const OWN = Object.freeze({
    bear: "broad",
    nandiBear: "broad",
    badger: "broad",
    puma: "cat",
    jaguar: "cat",
    chimera: "cat",
    dragon: "claw",
    wyvern: "claw",
    dreadthorn: "claw",
    kaiju: "claw",
    crocodile: "lizard",
    salamander: "lizard",
    gilaMonster: "lizard",
    basilisk: "lizard",
    olm: "lizard",
    ahuizotl: "lizard",
});

// The people-shaped (drawn as people are) who go barefoot: the rest leave a boot's print
const BAREFOOT = new Set(["goblin", "goblinBomber", "goblinKing", "troll", "frostTroll", "ogre", "skeleton", "draugr", "boggart", "hodmedod", "flayling", "forgeBrute", "chainedGlutton"]);

// What each kind of feet leaves (beasts/beast.js FEET)
const FEET = Object.freeze({ paws: "paw", feet: "bare", legs: "pricks", slime: "smear", scales: "slither", webbed: "webbed", colossal: "claw" });

/**
 * The print a kind of creature leaves (a PRINTS key), from its kind and its feet (`gait`: its
 * avatar's, beasts/beast.js; none for one drawn as a person: their boots or bare feet; `hooves`:
 * its look's), or null: none (what flies, floats or swarms).
 */
export function printOf(kind, gait = null, { hooves = false } = {}) {
    if (OWN[kind]) {
        return OWN[kind];
    }

    if (!gait) {
        return BAREFOOT.has(kind) ? "bare" : "boot";
    }

    if (!gait.feet) {
        return null;
    }

    return hooves && gait.feet === "paws" ? "hoof" : (FEET[gait.feet] ?? null);
}

/**
 * Where a footfall lands from the middle of the one making it (metres, across to its right and
 * ahead), by which foot it is (a four-legged one's `lf`, `rf`, `lh`, `rh`; a two-legged one's
 * `left`, `right`; or its body, its legs), for one `size` big (its gait's).
 */
export function footAt(foot, size) {
    const side = /^(l|left)/.test(foot) ? -1 : /^(r|right)/.test(foot) ? 1 : 0;
    const ahead = /f$/.test(foot) ? 1 : /h$/.test(foot) ? -1 : 0;

    return [side * size * (ahead ? 0.13 : 0.09), ahead * size * 0.27];
}

// Each print's shape drawn in white in its cell, its toes towards the top of the cell
function drawPrint(context, kind) {
    const ellipse = (x, y, rx, ry, turn = 0) => {
        context.beginPath();
        context.ellipse(x, y, rx, ry, turn, 0, Math.PI * 2);
        context.fill();
    };
    const claw = (x, y, angle, length) => {
        context.save();
        context.translate(x, y);
        context.rotate(angle);
        context.beginPath();
        context.moveTo(-2.5, 0);
        context.lineTo(0, -length);
        context.lineTo(2.5, 0);
        context.fill();
        context.restore();
    };

    switch (kind) {
        case "paw": {
            ellipse(64, 82, 22, 18);

            for (const [x, y, angle] of [[38, 50, -0.35], [55, 38, -0.1], [73, 38, 0.1], [90, 50, 0.35]]) {
                ellipse(x, y, 9, 12, angle);
                claw(x + Math.sin(angle) * 10, y - 11, angle, 10);
            }

            break;
        }
        case "cat": {
            ellipse(64, 80, 24, 20);

            for (const [x, y] of [[36, 52], [53, 40], [75, 40], [92, 52]]) {
                ellipse(x, y, 10, 12);
            }

            break;
        }
        case "broad": {
            ellipse(64, 84, 30, 26);

            for (const [x, y, angle] of [[30, 50, -0.5], [46, 36, -0.25], [64, 32, 0], [82, 36, 0.25], [98, 50, 0.5]]) {
                ellipse(x, y, 9, 11, angle);
                claw(x + Math.sin(angle) * 9, y - 10, angle, 14);
            }

            break;
        }
        case "hoof": {
            context.beginPath();
            context.moveTo(60, 30);
            context.quadraticCurveTo(36, 50, 40, 98);
            context.quadraticCurveTo(52, 104, 60, 96);
            context.closePath();
            context.fill();
            context.beginPath();
            context.moveTo(68, 30);
            context.quadraticCurveTo(92, 50, 88, 98);
            context.quadraticCurveTo(76, 104, 68, 96);
            context.closePath();
            context.fill();
            break;
        }
        case "claw":
        case "lizard": {
            const toes = kind === "claw" ? [[-0.5, 46], [0, 56], [0.5, 46]] : [[-0.8, 34], [-0.4, 40], [0, 44], [0.4, 40], [0.8, 34]];

            ellipse(64, 84, kind === "claw" ? 16 : 20, kind === "claw" ? 14 : 16);
            context.lineCap = "round";
            context.strokeStyle = "#fff";
            context.lineWidth = kind === "claw" ? 11 : 8;

            for (const [angle, length] of toes) {
                const [tx, ty] = [64 + Math.sin(angle) * length, 80 - Math.cos(angle) * length];

                context.beginPath();
                context.moveTo(64, 80);
                context.lineTo(tx, ty);
                context.stroke();
                claw(tx, ty, angle, kind === "claw" ? 16 : 8);
            }

            if (kind === "claw") {
                context.beginPath();
                context.moveTo(64, 88);
                context.lineTo(64, 116);
                context.stroke();
            }

            break;
        }
        case "boot": {
            ellipse(64, 46, 24, 32);
            ellipse(64, 100, 18, 16);
            context.globalCompositeOperation = "destination-out";

            for (let y = 26; y < 72; y += 9) {
                context.fillRect(42, y, 44, 3);
            }

            context.globalCompositeOperation = "source-over";
            break;
        }
        case "bare": {
            ellipse(66, 58, 20, 34, 0.08);
            ellipse(62, 98, 17, 16);

            for (const [x, y, r] of [[52, 18, 8], [64, 14, 6], [74, 16, 5.5], [83, 21, 5], [90, 28, 4.5]]) {
                ellipse(x, y, r, r * 1.15);
            }

            break;
        }
        case "webbed": {
            context.beginPath();
            context.moveTo(64, 96);
            context.lineTo(26, 40);
            context.quadraticCurveTo(45, 48, 50, 26);
            context.quadraticCurveTo(64, 40, 78, 26);
            context.quadraticCurveTo(83, 48, 102, 40);
            context.closePath();
            context.fill();
            ellipse(64, 96, 12, 10);
            break;
        }
        case "pricks": {
            for (const [x, y] of [[30, 30], [26, 58], [30, 88], [44, 108], [98, 30], [102, 58], [98, 88], [84, 108]]) {
                ellipse(x, y, 4, 5);
            }

            break;
        }
        case "slither": {
            context.lineCap = "round";
            context.strokeStyle = "#fff";
            context.lineWidth = 14;
            context.beginPath();
            context.moveTo(64, 2);
            context.bezierCurveTo(108, 34, 20, 94, 64, 126);
            context.stroke();
            break;
        }
        case "smear": {
            context.globalAlpha = 0.75;
            ellipse(64, 64, 44, 56);
            context.globalAlpha = 1;
            ellipse(64, 64, 30, 42);
            break;
        }
    }
}

/** The prints' atlas: each kind's shape (PRINTS' order), in white on nothing, a cell each, blurred a little. */
export function printAtlas() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = COLUMNS * CELL;
    canvas.height = ROWS * CELL;
    context.fillStyle = "#fff";

    for (const [k, kind] of KINDS.entries()) {
        context.save();
        context.translate((k % COLUMNS) * CELL, Math.floor(k / COLUMNS) * CELL);
        context.beginPath();
        context.rect(0, 0, CELL, CELL);
        context.clip();
        context.filter = "blur(1.5px)";
        drawPrint(context, kind);
        context.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.NoColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;

    return texture;
}

const _matrix = new THREE.Matrix4();
const _at = new THREE.Vector3();
const _size = new THREE.Vector3();
const _up = new THREE.Vector3();
const _lying = new THREE.Quaternion();
const _turn = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** The prints on the ground, as one instanced quad. */
export class Tracks {
    constructor() {
        const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

        // Each print's cell in the atlas, when it was made (s: the clock's) and how deep (0 to 1)
        this.cells = new Float32Array(TRACKS.most);
        this.made = new Float32Array(TRACKS.most).fill(-1e9);
        this.depths = new Float32Array(TRACKS.most);
        geometry.setAttribute("printCell", new THREE.InstancedBufferAttribute(this.cells, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("printMade", new THREE.InstancedBufferAttribute(this.made, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute("printDepth", new THREE.InstancedBufferAttribute(this.depths, 1).setUsage(THREE.DynamicDrawUsage));

        this.atlas = typeof document === "undefined" ? null : printAtlas();

        const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
        const uniforms = { printAtlas: { value: this.atlas }, printNow: { value: 0 } };

        // (Black over the ground, as dark as its print's shape where it's deepest, fading once it's
        // lain there long enough)
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", `#include <common>\nattribute float printCell;\nattribute float printMade;\nattribute float printDepth;\nuniform float printNow;\nvarying vec2 vPrintAt;\nvarying float vPrintDepth;`)
                .replace(
                    "#include <begin_vertex>",
                    `#include <begin_vertex>\nvec2 printCellAt = vec2(mod(printCell, ${COLUMNS}.0), ${ROWS - 1}.0 - floor(printCell / ${COLUMNS}.0));\nvPrintAt = (printCellAt + uv) / vec2(${COLUMNS}.0, ${ROWS}.0);\nfloat printAge = printNow - printMade;\nvPrintDepth = printDepth * (1.0 - smoothstep(${TRACKS.lasts.toFixed(1)}, ${(TRACKS.lasts + TRACKS.fade).toFixed(1)}, printAge));`,
                );
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <common>", `#include <common>\nuniform sampler2D printAtlas;\nvarying vec2 vPrintAt;\nvarying float vPrintDepth;`)
                .replace("#include <alphamap_fragment>", `#include <alphamap_fragment>\ndiffuseColor.a *= ${TRACKS.strength.toFixed(2)} * vPrintDepth * texture2D(printAtlas, vPrintAt).a;`);
        };
        material.customProgramCacheKey = () => "tracks";
        this.uniforms = uniforms;

        this.mesh = new THREE.InstancedMesh(geometry, material, TRACKS.most);
        this.mesh.name = "tracks";
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1;
        this.mesh.count = 0;
        this.mesh.visible = false;

        /** The next print's place in the list (the oldest, once it's full). */
        this.next = 0;

        /** The ground's height at a point ((x, z) => metres), to lie on; null: flat at 0. */
        this.groundAt = null;
    }

    /**
     * A print of `kind` (PRINTS) at (x, z) (metres), its toes towards `facing` (radians from +z,
     * as the game turns everyone), as big as one `size` big leaves (its gait's), as deep as the
     * footing takes it (`depth`: 0 to 1, TAKES), made at `now` (s: the clock's update is given).
     */
    print(kind, x, z, facing, size, depth, now) {
        const print = PRINTS[kind];

        if (!print || !(depth > 0)) {
            return;
        }

        const k = this.next;
        const across = Math.max(0.05, size * print.size);
        const along = across * print.long;
        const ground = this.groundAt;
        const y = ground ? ground(x, z) : 0;

        // (Lying along the ground where it slopes, its toes the way it was going)
        if (ground) {
            const reach = Math.max(0.1, along / 2);

            _up.set(ground(x - reach, z) - ground(x + reach, z), 2 * reach, ground(x, z - reach) - ground(x, z + reach)).normalize();
            _lying.setFromUnitVectors(UP, _up);
        } else {
            _lying.identity();
        }

        _lying.multiply(_turn.setFromAxisAngle(UP, facing + Math.PI));
        _matrix.compose(_at.set(x, y + TRACKS.lift, z), _lying, _size.set(across, 1, along));
        this.mesh.setMatrixAt(k, _matrix);
        this.cells[k] = KINDS.indexOf(kind);
        this.made[k] = now;
        this.depths[k] = Math.min(1, depth);
        this.next = (k + 1) % TRACKS.most;
        this.mesh.count = Math.max(this.mesh.count, k + 1);
        this.mesh.visible = true;

        for (const attribute of [this.mesh.instanceMatrix, ...["printCell", "printMade", "printDepth"].map((name) => this.mesh.geometry.attributes[name])]) {
            attribute.needsUpdate = true;
        }
    }

    /** The clock now (s), for the prints' fading. */
    update(now) {
        this.uniforms.printNow.value = now;
    }

    /** Every print let go (a new world, or another map). */
    clear() {
        this.made.fill(-1e9);
        this.next = 0;
        this.mesh.count = 0;
        this.mesh.visible = false;
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.atlas?.dispose();
        this.mesh.removeFromParent();
    }
}
