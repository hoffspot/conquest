// Draws units and buildings as 3D models with Three.js instead of sprites.
//
// Only the models are 3D: the map, fog of war and interface stay 2D. Every frame, the items with
// a model (see models.js) are rendered in one pass into a hidden WebGL canvas, each in its own
// square cell, and the result is copied once into a 2D canvas (so that browsers read back the
// WebGL canvas once per frame, not once per item). The 2D renderer then copies an item's cell
// onto the map at the moment it would have drawn that item's sprite (see Entity.draw). So 3D items keep the sprites' draw order,
// selection rings stay under them, life bars and fog of war stay over them, and tapping,
// selecting and the minimap work as before.
//
// The camera matches the book's artwork: an orthographic view looking down at the map from
// CAMERA_PITCH above the horizon. Ground positions are stretched away from the camera so that
// they line up exactly with the painted map, while height moves things up the screen.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneModel } from "three/addons/utils/SkeletonUtils.js";
import { GRID_SIZE } from "../core/config.js";
import { modelFiles, modelFor } from "./models.js";
import { CAMERA_PITCH, heightOnScreen } from "./perspective.js";

// The camera looks down at the map from CAMERA_PITCH above the horizon, like the book's art
export { CAMERA_PITCH, heightOnScreen };

const SIN_PITCH = Math.sin(CAMERA_PITCH);
const COS_PITCH = Math.cos(CAMERA_PITCH);

// How far the camera is from the ground (above the tallest model, and beyond the far edge of the
// canvas the models are drawn on)
const CAMERA_DISTANCE = 5000;

// Empty space around a model in its cell, in world pixels (room for antialiasing)
const CELL_MARGIN = 2;

const TEAM_COLORS = { blue: 0x4b5fc8, green: 0x4c9c56 };

// How strongly `tint` models take on the team colour (enough to tell the teams apart at a glance)
const TINT_STRENGTH = 0.6;

// Damaged buildings and units are drawn darker
const DAMAGED_SHADE = 0.55;

// Sprite animations that build a building up: the model rises out of the ground as they play
const RISING_ANIMATIONS = new Set(["teleport", "deploy"]);

// How long a unit rocks after firing, in milliseconds
export const RECOIL_MS = 600;

/**
 * How far a unit has rocked back t milliseconds after firing, from 1 (furthest back) to about
 * -0.35 (furthest forward): a damped spring that kicks back within a few frames, rocks forward
 * past where it started, bounces back a little and settles.
 */
export function recoilSwing(t) {
    if (!(t >= 0 && t < RECOIL_MS)) {
        return 0;
    }

    // Normalised so that the first (backward) peak, at about 60 ms, is 1
    return (Math.exp(-t / 140) * Math.sin((t * 2 * Math.PI) / 300)) / 0.6196;
}

/** How far a gun barrel has slid back t milliseconds after firing (0 to 1): fast back, slower forward. */
export function gunKick(t) {
    if (!(t >= 0 && t < RECOIL_MS)) {
        return 0;
    }

    return Math.min(1, t / 25) * Math.exp(-Math.max(0, t - 25) / 90);
}

/** Does this item have a 3D model? (Items without one, such as the oil field, stay sprites.) */
export function isDrawnIn3D(item) {
    return Boolean(modelFor(item));
}

/**
 * Where a point on the map (in world pixels, y pointing south) goes in the 3D scene. The scene's
 * x points east, y up and z south; z is stretched so that the tilted camera sees the ground 1:1.
 */
export function groundToScene(x, y) {
    return { x, y: 0, z: y / SIN_PITCH };
}

/** The camera used for the 3D items: orthographic, looking down at the map from CAMERA_PITCH. */
export function createCamera() {
    const camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0, 2 * CAMERA_DISTANCE);

    camera.rotation.x = -CAMERA_PITCH;

    return camera;
}

/**
 * Point the camera at the part of the map from (0, 0) to (width, height) world pixels, so that
 * this area fills the canvas and the ground at (x, y) appears at canvas position (x, y) scaled to
 * the canvas size.
 */
export function aimCamera(camera, width, height) {
    camera.left = 0;
    camera.right = width;
    camera.top = 0;
    camera.bottom = -height;
    camera.position.set(0, CAMERA_DISTANCE * SIN_PITCH, CAMERA_DISTANCE * COS_PITCH);
    camera.updateProjectionMatrix();
}

/**
 * A unit's heading in radians, clockwise from north, drawn part of the way from its direction at
 * the previous tick to its current one. Directions run clockwise from 0 (north) to `directions`.
 * @param {number} interpolation  -1 (previous tick) to 0 (current tick)
 */
export function interpolatedHeading(previous, current, directions, interpolation) {
    // Turn the short way round
    const turn = ((((current - previous) % directions) + directions * 1.5) % directions) - directions / 2;
    const direction = previous + turn * (1 + interpolation);

    return (direction / directions) * Math.PI * 2;
}

/** The turn (about the vertical axis) that makes a model whose front points along `facing` face north. */
export function facingRotation(facing) {
    return { "-z": 0, "+x": Math.PI / 2, "+z": Math.PI, "-x": -Math.PI / 2 }[facing] ?? 0;
}

/**
 * Lay out square cells of the given sizes in rows (largest first). Returns each cell's position,
 * in the order given, and the total width and height.
 */
export function packCells(sizes) {
    const order = sizes.map((size, index) => ({ size, index })).sort((a, b) => b.size - a.size);
    const area = sizes.reduce((total, size) => total + size * size, 0);
    const rowWidth = Math.max(order[0]?.size ?? 0, Math.ceil(Math.sqrt(area) * 1.2));
    const positions = new Array(sizes.length);
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    let width = 0;

    for (const { size, index } of order) {
        if (x > 0 && x + size > rowWidth) {
            x = 0;
            y += rowHeight;
            rowHeight = 0;
        }

        positions[index] = { x, y };
        x += size;
        rowHeight = Math.max(rowHeight, size);
        width = Math.max(width, x);
    }

    return { positions, width, height: y + rowHeight };
}

/**
 * The team colour for a recoloured material: the team's hue and saturation, keeping the
 * material's own lightness so that light and dark shades of it stay distinct.
 */
export function recolour(color, team) {
    const original = new THREE.Color(color).getHSL({});
    const target = new THREE.Color(TEAM_COLORS[team] ?? TEAM_COLORS.blue).getHSL({});

    return new THREE.Color().setHSL(target.h, target.s, THREE.MathUtils.clamp(original.l, 0.2, 0.75)).getHex();
}

// The models are lit by the sky and by sunlight from the north-west, as in the book's art. They
// use cheap Lambert shading (the models' metallic PBR materials would render black without an
// environment map).
function lambert(material, team, model) {
    const result = new THREE.MeshLambertMaterial({
        name: material.name,
        color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
        map: material.map ?? null,
        vertexColors: material.vertexColors ?? false,
        transparent: material.transparent ?? false,
        opacity: material.opacity ?? 1,
        side: material.side ?? THREE.FrontSide,
        alphaTest: material.alphaTest ?? 0,
        flatShading: material.flatShading ?? false,
    });

    if (model.recolour?.includes(material.name)) {
        result.color.setHex(recolour(result.color, team));
    } else if (model.tint) {
        result.color.lerp(new THREE.Color(TEAM_COLORS[team] ?? TEAM_COLORS.blue), TINT_STRENGTH);
    }

    return result;
}

export class Units3D {
    // Loaded model files, by file name
    #scenes = new Map();
    // Each model prepared for each team (coloured, sized, facing north), copied for every item
    #prototypes = new Map();
    // For every item drawn in 3D: its copy of the model and the state used to animate it
    #items = new Map();
    // Where each item is in this frame's canvas, in canvas pixels
    #cells = new Map();
    #scale = 1;
    #lost = false;
    // What the latest rendering showed, to skip rendering the same thing again (saves battery)
    #lastFrame = "";
    // When each item last fired (for recoil), on the clock passed to render()
    #firedAt = new WeakMap();
    #time = 0;

    /**
     * Create the 3D renderer and load the models, or return undefined if the browser can't draw
     * them (every item is then drawn as a sprite). A model that fails to load leaves just its
     * items as sprites.
     */
    static async create(baseUrl = "models/") {
        let units3d;

        try {
            units3d = new Units3D();
        } catch (error) {
            console.warn("3D models are not available, using sprites instead:", error);

            return undefined;
        }

        await units3d.load(baseUrl);

        return units3d;
    }

    constructor() {
        // Never added to the page: the 2D renderer copies from it
        this.canvas = document.createElement("canvas");
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: "low-power" });
        this.renderer.setPixelRatio(1);
        this.renderer.setClearColor(0x000000, 0);

        this.scene = new THREE.Scene();

        const sun = new THREE.DirectionalLight(0xffffff, 1.8);

        sun.position.set(-1, 2, -1.2);
        this.scene.add(new THREE.HemisphereLight(0xe6ecff, 0x40402c, 1.125), sun);

        this.camera = createCamera();

        // Each frame's rendering, copied once for the 2D renderer to draw from
        this.frame = document.createElement("canvas");
        this.frameContext = this.frame.getContext("2d");

        // Phones can take the GPU away (e.g. in the background); draw sprites until it comes back
        this.canvas.addEventListener("webglcontextlost", () => {
            this.#lost = true;
        });
        this.canvas.addEventListener("webglcontextrestored", () => {
            this.#lost = false;
            this.#lastFrame = "";
        });
    }

    async load(baseUrl) {
        const loader = new GLTFLoader();

        await Promise.all(modelFiles().map(async (file) => {
            try {
                const gltf = await loader.loadAsync(`${baseUrl}${file}`);

                this.#scenes.set(file, gltf.scene);
            } catch (error) {
                console.warn(`Could not load the 3D model ${file}, using sprites instead:`, error);
            }
        }));
    }

    // A model prepared for a team, or undefined if its file didn't load
    #prototype(model, team) {
        const key = `${model.file ?? model.files[team]}|${team}`;

        if (this.#prototypes.has(key)) {
            return this.#prototypes.get(key);
        }

        const source = this.#scenes.get(model.files ? model.files[team] ?? model.files.blue : model.file);

        if (!source) {
            this.#prototypes.set(key, undefined);

            return undefined;
        }

        const object = cloneModel(source);
        const materials = new Map();
        const damaged = new Map();

        object.traverse((node) => {
            if (!node.isMesh) {
                return;
            }

            const convert = (material) => {
                if (!materials.has(material)) {
                    const healthy = lambert(material, team, model);
                    const dark = healthy.clone();

                    dark.color.multiplyScalar(DAMAGED_SHADE);
                    materials.set(material, healthy);
                    damaged.set(healthy, dark);
                }

                return materials.get(material);
            };

            node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
            // Models are drawn into small cells positioned by hand; don't let Three.js cull them
            node.frustumCulled = false;
        });

        // Sit on the ground, centred on the item's position, sized to its footprint, facing north
        object.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = Array.isArray(model.footprint)
            ? Math.min(model.footprint[0] / size.x, model.footprint[1] / size.z)
            : model.footprint / Math.max(size.x, size.z);
        const root = new THREE.Group();

        object.position.set(-center.x, -box.min.y, -center.z);
        root.add(object);
        root.rotation.y = facingRotation(model.facing);
        root.scale.setScalar(scale);
        root.updateMatrixWorld(true);

        // The gun barrel slides back along the model's length when it fires. Work out which way
        // that is in the barrel's own coordinates: from world pixels in the model's frame (where
        // it faces north) to the coordinates of the barrel's parent.
        const gun = model.recoil?.gun && root.getObjectByName(model.recoil.gun);
        const gunBasis = gun && new THREE.Matrix3().setFromMatrix4(gun.parent.matrixWorld.clone().invert());

        // How far the model reaches from its position on screen, for sizing its cell. (Aircraft
        // are rendered on the ground and drawn higher up, above a shadow, by draw().)
        const radius = (Math.hypot(size.x, size.z) / 2) * scale;
        const reach = Math.max(radius, radius * SIN_PITCH + heightOnScreen(size.y * scale)) + CELL_MARGIN;
        const prototype = { root, damaged, reach, gunBasis, length: (model.facing?.endsWith("x") ? size.x : size.z) * scale, shadowRadius: model.altitude ? radius * 0.5 : 0 };

        this.#prototypes.set(key, prototype);

        return prototype;
    }

    // A copy of the item's model, with the parts that move found
    #create(item, model, prototype, tick) {
        const body = cloneModel(prototype.root);
        const pose = new THREE.Group();
        const holder = new THREE.Group();

        pose.add(body);
        holder.add(pose);

        const spinning = (model.spin ?? []).map(({ node, axis, turnsPerSecond }) => {
            const part = body.getObjectByName(node);

            return part && { part, rest: part.quaternion.clone(), axis: new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0), turnsPerSecond };
        }).filter(Boolean);
        const aimPart = model.aim ? body.getObjectByName(model.aim) : undefined;
        const gunPart = prototype.gunBasis ? body.getObjectByName(model.recoil.gun) : undefined;

        this.scene.add(holder);

        return {
            model,
            prototype,
            body,
            pose,
            holder,
            spinning,
            aim: aimPart && { part: aimPart, rest: aimPart.rotation.y },
            gun: gunPart && { part: gunPart, rest: gunPart.position.clone() },
            damaged: false,
            previous: item.direction ?? 0,
            current: item.direction ?? 0,
            tick,
        };
    }

    /**
     * Render this frame's 3D items. Call before drawing the items.
     * @param {Iterable} items  every item on the map
     * @param {{scale: number, interpolation: number, tick: number, time?: number, view: {x: number, y: number, width: number, height: number}}} frame
     *        scale: canvas pixels per world pixel; time: milliseconds on a clock that stops while the
     *        game is paused, for rotors and recoil; view: the visible part of the map in world pixels
     */
    render(items, { scale, interpolation, tick, time = performance.now(), view }) {
        this.#cells.clear();
        this.#time = time;

        const visible = [];
        const present = new Set();

        for (const item of items) {
            const model = modelFor(item);
            const prototype = model && this.#prototype(model, item.team);

            if (!prototype) {
                continue;
            }

            present.add(item);

            let drawn = this.#items.get(item);

            if (!drawn) {
                drawn = this.#create(item, model, prototype, tick);
                this.#items.set(item, drawn);
            }

            // Remember the direction at the previous tick, to turn smoothly in between
            if (drawn.tick !== tick) {
                drawn.previous = drawn.current;
                drawn.tick = tick;
            }

            drawn.current = item.direction ?? 0;
            drawn.holder.visible = false;

            if (this.#isInView(item, view)) {
                visible.push({ item, drawn });
            }
        }

        // Forget items that are gone
        for (const [item, drawn] of this.#items) {
            if (!present.has(item)) {
                this.scene.remove(drawn.holder);
                this.#items.delete(item);
            }
        }

        if (visible.length === 0 || this.#lost || this.renderer.getContext().isContextLost()) {
            return;
        }

        // One square cell per item, big enough for its model
        const sizes = visible.map(({ drawn }) => Math.ceil(2 * drawn.prototype.reach * scale));
        const layout = packCells(sizes);

        this.#resize(layout.width, layout.height, scale);

        const poses = visible.map(({ item, drawn }, index) => {
            const size = sizes[index];
            const { x, y } = layout.positions[index];
            const ground = groundToScene((x + size / 2) / scale, (y + size / 2) / scale);

            drawn.holder.position.set(ground.x, ground.y, ground.z);
            drawn.holder.visible = true;
            this.#cells.set(item, { x, y, size });

            return this.#pose(item, drawn, interpolation, time);
        });

        this.#scale = scale;

        // Nothing moved since the last frame (for example while paused): keep that rendering
        const frame = `${scale}|${layout.width}x${layout.height}|${poses.join("|")}`;

        if (frame === this.#lastFrame) {
            return;
        }

        this.#lastFrame = frame;
        this.renderer.render(this.scene, this.camera);

        // Copy the rendering once; draw() copies each item's cell from here
        if (this.frame.width !== this.canvas.width || this.frame.height !== this.canvas.height) {
            this.frame.width = this.canvas.width;
            this.frame.height = this.canvas.height;
        }

        this.frameContext.clearRect(0, 0, layout.width, layout.height);
        this.frameContext.drawImage(this.canvas, 0, 0, layout.width, layout.height, 0, 0, layout.width, layout.height);
    }

    /** Rock an item back as it fires (see `recoil` in models.js). */
    fired(item) {
        if (modelFor(item)?.recoil) {
            this.#firedAt.set(item, this.#time);
        }
    }

    // Turn, aim, spin, rise, recoil and darken the item's model to match the item. Returns a
    // summary of the pose, to tell whether anything changed since the last frame.
    #pose(item, drawn, interpolation, time) {
        const heading = item.directions
            ? interpolatedHeading(drawn.previous, drawn.current, item.directions, interpolation)
            : 0;

        if (drawn.aim) {
            // The building stays put and only the gun turns
            drawn.aim.part.rotation.y = drawn.aim.rest - heading;
        } else if (item.type !== "buildings") {
            drawn.pose.rotation.y = -heading;
        }

        for (const { part, rest, axis, turnsPerSecond } of drawn.spinning) {
            part.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(axis, (time / 1000) * turnsPerSecond * Math.PI * 2));
        }

        // Buildings rise out of the ground while they teleport in or deploy
        const animation = item.imageList;
        const rising = item.type === "buildings" && RISING_ANIMATIONS.has(animation?.name);

        drawn.pose.scale.y = rising ? Math.max(0.08, (item.imageOffset - animation.offset + 1) / animation.count) : 1;

        const recoil = this.#recoil(item, drawn, heading, time);

        const damaged = item.lifeCode === "damaged";

        if (damaged !== drawn.damaged) {
            const swap = damaged
                ? (material) => drawn.prototype.damaged.get(material) ?? material
                : (material) => [...drawn.prototype.damaged].find(([, dark]) => dark === material)?.[0] ?? material;

            drawn.body.traverse((node) => {
                if (node.isMesh) {
                    node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
                }
            });
            drawn.damaged = damaged;
        }

        // Spinning parts change every frame
        const spin = drawn.spinning.length ? time : 0;

        return `${drawn.body.uuid}:${heading.toFixed(3)}:${drawn.pose.scale.y.toFixed(3)}:${damaged}:${spin}:${recoil}`;
    }

    // Rock the hull back and slide the gun barrel back after the item fires. Returns how far into
    // the recoil the item is (0 when still).
    #recoil(item, drawn, heading, time) {
        const settings = drawn.model.recoil;
        const t = settings ? time - (this.#firedAt.get(item) ?? -Infinity) : Infinity;
        const swing = recoilSwing(t);
        const kick = gunKick(t);

        if (settings && !(t < RECOIL_MS)) {
            this.#firedAt.delete(item);
        }

        // The hull: pushed back along the ground and tipped nose-up, then rocking forward. Lifted
        // by as much as its lower end dips, so that it doesn't sink into the ground.
        const pitch = THREE.MathUtils.degToRad(settings?.pitch ?? 0) * swing;

        drawn.body.position.set(0, (drawn.prototype.length / 2) * Math.abs(Math.sin(pitch)), (settings?.back ?? 0) * swing);
        drawn.body.rotation.x = pitch;

        // The barrel slides straight back. A turret's gun turns on its own, so "back" depends on
        // where it aims; a tank's turns with the whole tank.
        if (drawn.gun) {
            const back = drawn.aim ? new THREE.Vector3(-Math.sin(heading), 0, Math.cos(heading)) : new THREE.Vector3(0, 0, 1);

            back.applyMatrix3(drawn.prototype.gunBasis).multiplyScalar((settings.kick ?? 0) * kick);
            drawn.gun.part.position.copy(drawn.gun.rest).add(back);
        }

        return swing || kick ? t.toFixed(0) : 0;
    }

    /**
     * Draw an item rendered this frame onto the 2D canvas, on the item's position.
     * Returns false if the item wasn't rendered in 3D (so its sprite should be drawn instead).
     */
    draw(context, item) {
        const cell = this.#cells.get(item);

        if (!cell) {
            return false;
        }

        const scale = this.#scale;
        const world = cell.size / scale;
        const ground = groundOnCanvas(item);
        const drawn = this.#items.get(item);
        const altitude = drawn.model.altitude ?? 0;

        // Aircraft fly above a soft round shadow, as their sprites did
        if (altitude) {
            context.beginPath();
            context.arc(ground.x, ground.y, drawn.prototype.shadowRadius, 0, Math.PI * 2);
            context.fillStyle = "rgba(0, 0, 0, 0.25)";
            context.fill();
        }

        // Line the cell up with whole canvas pixels so the model stays sharp
        const x = Math.round((ground.x - world / 2) * scale) / scale;
        const y = Math.round((ground.y - altitude - world / 2) * scale) / scale;

        context.drawImage(this.frame, cell.x, cell.y, cell.size, cell.size, x, y, world, world);

        return true;
    }

    /** Was this item drawn in 3D in the latest frame? */
    has(item) {
        return this.#cells.has(item);
    }

    #isInView(item, { x, y, width, height }) {
        const margin = GRID_SIZE * 4;
        const ground = groundOnMap(item);

        return ground.x > x - margin && ground.x < x + width + margin && ground.y > y - margin && ground.y < y + height + margin;
    }

    // Size the canvas (growing it in steps, so it isn't resized every frame) and point the camera
    // at it: canvas pixel (px, py) shows the ground at (px / scale, py / scale) world pixels
    #resize(width, height, scale) {
        const step = 128;
        const needWidth = Math.ceil(width / step) * step;
        const needHeight = Math.ceil(height / step) * step;
        const tooSmall = this.canvas.width < needWidth || this.canvas.height < needHeight;
        const muchTooBig = this.canvas.width > needWidth * 2 || this.canvas.height > needHeight * 2;

        if (tooSmall || muchTooBig) {
            this.renderer.setSize(needWidth, needHeight, false);
        }

        aimCamera(this.camera, this.canvas.width / scale, this.canvas.height / scale);
    }
}

// Where an item stands on the map, in world pixels: the centre of a building's base, or a unit's position
function groundOnMap(item) {
    return item.type === "buildings"
        ? { x: item.x * GRID_SIZE + item.baseWidth / 2, y: item.y * GRID_SIZE + item.baseHeight / 2 }
        : { x: item.x * GRID_SIZE, y: item.y * GRID_SIZE };
}

// The same point on the canvas being drawn (Entity.draw has just worked out drawingX/drawingY,
// which include smooth movement between ticks)
function groundOnCanvas(item) {
    return item.type === "buildings"
        ? { x: item.drawingX + item.pixelOffsetX + item.baseWidth / 2, y: item.drawingY + item.pixelOffsetY + item.baseHeight / 2 }
        : { x: item.drawingX + item.pixelOffsetX, y: item.drawingY + item.pixelOffsetY };
}
