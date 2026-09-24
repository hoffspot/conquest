// Draws units as 3D models with Three.js instead of sprites.
//
// Only the units are 3D: the map, buildings, fog of war and everything else stay 2D. Every frame,
// the 3D units are rendered in one pass into a hidden WebGL canvas, each in its own square cell.
// The 2D renderer then copies a unit's cell onto the map at the moment it would have drawn that
// unit's sprite (see Entity.draw). So 3D units keep the sprites' draw order (in front of or behind
// buildings and other units), selection rings stay under them, life bars and fog of war stay over
// them, and tapping, selecting and the minimap work as before.
//
// The camera matches the book's artwork: an orthographic view looking down at the map from
// CAMERA_PITCH above the horizon. Ground positions are stretched away from the camera so that
// they line up exactly with the painted map, while height moves things up the screen.

import * as THREE from "three";
import { GRID_SIZE } from "../core/config.js";

// The camera looks down at the map from this angle above the horizon, like the book's art
export const CAMERA_PITCH = THREE.MathUtils.degToRad(60);

const SIN_PITCH = Math.sin(CAMERA_PITCH);
const COS_PITCH = Math.cos(CAMERA_PITCH);

// How far the camera is from the ground (only needs to be above the tallest model)
const CAMERA_DISTANCE = 1000;

// Empty space around a model in its cell, in world pixels (room for antialiasing)
const CELL_MARGIN = 2;

// Size of the test cube in world pixels (the tank's sprite is 30 pixels across)
const CUBE_SIZE = 20;

const TEAM_COLORS = {
    blue: { body: 0x4b5fc8, front: 0xa4b4ff, edges: 0x121838 },
    green: { body: 0x4c9c56, front: 0xa6e8ad, edges: 0x10301a },
};

/**
 * Which units are drawn in 3D. To start with, a test: the first unit of the first mission (the
 * hero's heavy tank, the only heavy tank with uid -1), drawn as a cube.
 */
export function isDrawnIn3D(item) {
    return item.name === "heavy-tank" && item.uid === -1;
}

/**
 * Where a point on the map (in world pixels, y pointing south) goes in the 3D scene. The scene's
 * x points east, y up and z south; z is stretched so that the tilted camera sees the ground 1:1.
 */
export function groundToScene(x, y) {
    return { x, y: 0, z: y / SIN_PITCH };
}

/** How many world pixels up the screen a point at the given height appears. */
export function heightOnScreen(height) {
    return height * COS_PITCH;
}

/** The camera used for the 3D units: orthographic, looking down at the map from CAMERA_PITCH. */
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

// Shared by every cube of a team
const cubeParts = new Map();

function cubePartsFor(team) {
    if (!cubeParts.has(team)) {
        const colors = TEAM_COLORS[team] ?? TEAM_COLORS.blue;
        const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
        const side = new THREE.MeshLambertMaterial({ color: colors.body });
        // The front glows a little so the cube's facing shows even when it is in shadow
        const front = new THREE.MeshLambertMaterial({ color: colors.front, emissive: colors.front, emissiveIntensity: 0.45 });

        cubeParts.set(team, {
            geometry,
            // Box faces: east, west, top, bottom, south, north. Models face north when their
            // direction is 0, so the north face is the front.
            materials: [side, side, side, side, side, front],
            edges: new THREE.EdgesGeometry(geometry),
            edgeMaterial: new THREE.LineBasicMaterial({ color: colors.edges }),
        });
    }

    return cubeParts.get(team);
}

// The test model: a cube sitting on the ground, with its front face lighter so its facing shows
function createCube(team) {
    const parts = cubePartsFor(team);
    const body = new THREE.Mesh(parts.geometry, parts.materials);
    const edges = new THREE.LineSegments(parts.edges, parts.edgeMaterial);
    const model = new THREE.Group();

    body.position.y = CUBE_SIZE / 2;
    edges.position.y = CUBE_SIZE / 2;
    model.add(body, edges);

    // How far the model reaches from its centre on screen, for sizing its cell
    const radius = Math.hypot(CUBE_SIZE, CUBE_SIZE) / 2;

    model.userData.reach = Math.max(radius, radius * SIN_PITCH + heightOnScreen(CUBE_SIZE));

    return model;
}

export class Units3D {
    // For every unit drawn in 3D: its model and the directions used to smooth its turning
    #units = new Map();
    // Where each unit is in this frame's canvas, in canvas pixels
    #cells = new Map();
    #cellPixels = 0;
    #cellWorld = 0;
    #scale = 1;
    #lost = false;

    /** Create the 3D renderer, or return undefined if the browser can't (units are then drawn as sprites). */
    static create() {
        try {
            return new Units3D();
        } catch (error) {
            console.warn("3D units are not available, using sprites instead:", error);

            return undefined;
        }
    }

    constructor() {
        // Never added to the page: the 2D renderer copies from it
        this.canvas = document.createElement("canvas");
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: "low-power" });
        this.renderer.setPixelRatio(1);
        this.renderer.setClearColor(0x000000, 0);

        this.scene = new THREE.Scene();

        // Soft light from the sky, and sunlight from the north-west, as in the book's art
        const sun = new THREE.DirectionalLight(0xffffff, 2.4);

        sun.position.set(-1, 2, -1.2);
        this.scene.add(new THREE.HemisphereLight(0xe6ecff, 0x40402c, 1.5), sun);

        this.camera = createCamera();

        // Phones can take the GPU away (e.g. in the background); draw sprites until it comes back
        this.canvas.addEventListener("webglcontextlost", () => {
            this.#lost = true;
        });
        this.canvas.addEventListener("webglcontextrestored", () => {
            this.#lost = false;
        });
    }

    /**
     * Render this frame's 3D units. Call before drawing the items.
     * @param {Iterable} items  every item on the map
     * @param {{scale: number, interpolation: number, tick: number, view: {x: number, y: number, width: number, height: number}}} frame
     *        scale: canvas pixels per world pixel; view: the visible part of the map in world pixels
     */
    render(items, { scale, interpolation, tick, view }) {
        this.#cells.clear();

        const units = [];
        const present = new Set();

        for (const item of items) {
            if (!isDrawnIn3D(item)) {
                continue;
            }

            present.add(item);

            let unit = this.#units.get(item);

            if (!unit) {
                unit = { model: createCube(item.team), previous: item.direction, current: item.direction, tick };
                this.#units.set(item, unit);
                this.scene.add(unit.model);
            }

            // Remember the direction at the previous tick, to turn smoothly in between
            if (unit.tick !== tick) {
                unit.previous = unit.current;
                unit.tick = tick;
            }

            unit.current = item.direction;

            unit.model.visible = false;

            if (this.#isInView(item, view)) {
                units.push({ item, unit });
            }
        }

        // Forget units that are gone
        for (const [item, unit] of this.#units) {
            if (!present.has(item)) {
                this.scene.remove(unit.model);
                this.#units.delete(item);
            }
        }

        if (units.length === 0 || this.#lost || this.renderer.getContext().isContextLost()) {
            return;
        }

        // One square cell per unit, big enough for the largest model, in a grid
        const reach = Math.max(...units.map(({ unit }) => unit.model.userData.reach)) + CELL_MARGIN;
        const cellPixels = Math.ceil(2 * reach * scale);
        const cellWorld = cellPixels / scale;
        const columns = Math.ceil(Math.sqrt(units.length));
        const rows = Math.ceil(units.length / columns);

        this.#resize(columns * cellPixels, rows * cellPixels, scale);

        units.forEach(({ item, unit }, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const position = groundToScene((column + 0.5) * cellWorld, (row + 0.5) * cellWorld);

            unit.model.position.set(position.x, position.y, position.z);
            unit.model.rotation.y = -interpolatedHeading(unit.previous, unit.current, item.directions, interpolation);
            unit.model.visible = true;

            this.#cells.set(item, { x: column * cellPixels, y: row * cellPixels });
        });

        this.#cellPixels = cellPixels;
        this.#cellWorld = cellWorld;
        this.#scale = scale;

        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Draw a unit rendered this frame onto the 2D canvas, centred on the unit's position.
     * Returns false if the unit wasn't rendered in 3D (so its sprite should be drawn instead).
     */
    draw(context, item) {
        const cell = this.#cells.get(item);

        if (!cell) {
            return false;
        }

        const half = this.#cellWorld / 2;
        const scale = this.#scale;

        // Line the cell up with whole canvas pixels so the model stays sharp
        const x = Math.round((item.drawingX + item.pixelOffsetX - half) * scale) / scale;
        const y = Math.round((item.drawingY + item.pixelOffsetY - half) * scale) / scale;

        context.drawImage(this.canvas, cell.x, cell.y, this.#cellPixels, this.#cellPixels, x, y, this.#cellWorld, this.#cellWorld);

        return true;
    }

    /** Was this item drawn in 3D in the latest frame? */
    has(item) {
        return this.#cells.has(item);
    }

    #isInView(item, { x, y, width, height }) {
        const margin = GRID_SIZE * 3;
        const itemX = item.x * GRID_SIZE;
        const itemY = item.y * GRID_SIZE;

        return itemX > x - margin && itemX < x + width + margin && itemY > y - margin && itemY < y + height + margin;
    }

    // Size the canvas and point the camera at it: canvas pixel (px, py) shows the ground at
    // (px / scale, py / scale) world pixels
    #resize(width, height, scale) {
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.renderer.setSize(width, height, false);
        }

        aimCamera(this.camera, width / scale, height / scale);
    }
}
