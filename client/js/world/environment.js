// The light every lit material takes from all round it (scene.environment: in three.js r186 the
// buildings' and the ground's as well as the characters'): the light on their shaded sides, and
// what anything shiny mirrors (armour, blades, water, eyes).
//
// Outdoors it's the game's own sky above (sky.js: blue overhead, paling to the haze, the sun's
// glow) and the ground below, so that steel shows the sky and a face's shaded side is lit blue
// from above and warm from the ground, as out of doors. Indoors it's a dim room of warm plaster
// and dark boards, lit low on one side by a fire and from above by lamps.
//
// Each is drawn into a small prefiltered map (a PMREM: three.js blurs it for each roughness), both
// the same size, so that going in or out only changes which map is read, never a shader. The
// room's once; the sky's again as the day turns (SkyLight), the ground under it as dark as the
// light on it.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Sky } from "./sky.js";

// Each face of the maps (pixels): the sky and the rooms have no detail finer than this
const SIZE = 128;

// Outdoors: the eye this high over the ground (metres), and the ground's colour as it's seen in
// the sun (cobbles, earth and grass: a warm grey)
const EYE = 1.7;
const GROUND = 0x827a66;

// Indoors: the room (metres: wide, high), its walls', ceiling's and floor's colours as seen in
// the lamplight (linear), and its lights: the fire low on one wall, and lamps overhead
const ROOM = Object.freeze({ width: 10, height: 4 });
const WALLS = [0.5, 0.34, 0.2];
const CEILING = [0.3, 0.2, 0.13];
const FLOOR = [0.19, 0.125, 0.07];
const FIRE = Object.freeze({ colour: [19, 8, 2.3], at: [0, 0.6, -4.9], size: [2.2, 1.2, 0.2] });
const LAMP = Object.freeze({ colour: [11, 7, 3.3], size: [0.6, 0.12, 0.6], at: [[-2.5, 3.9, 1.5], [2.5, 3.9, -1], [0, 3.9, 3.5]] });

function box([width, height, depth], [x, y, z], colour, side = THREE.FrontSide) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshBasicMaterial({ color: new THREE.Color(...colour), side }));

    mesh.position.set(x, y, z);

    return mesh;
}

// What each map is drawn from: a scene round the origin
function outdoors(sunDirection) {
    const scene = new THREE.Scene();
    const sky = new Sky(sunDirection);
    const land = new THREE.Mesh(new THREE.CircleGeometry(100, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: GROUND }));

    land.position.y = -EYE;
    scene.add(sky.object, land);
    scene.userData = { sky, ground: land };

    return scene;
}

function indoors() {
    const scene = new THREE.Scene();
    const { width, height } = ROOM;

    scene.add(box([width, height, width], [0, height / 2 - EYE, 0], WALLS, THREE.BackSide));
    scene.add(box([width - 0.02, 0.01, width - 0.02], [0, height - EYE - 0.01, 0], CEILING));
    scene.add(box([width - 0.02, 0.01, width - 0.02], [0, 0.01 - EYE, 0], FLOOR));
    scene.add(box(FIRE.size, FIRE.at.map((v, k) => (k === 1 ? v - EYE : v)), FIRE.colour));

    for (const at of LAMP.at) {
        scene.add(box(LAMP.size, at.map((v, k) => (k === 1 ? v - EYE : v)), LAMP.colour));
    }

    return scene;
}

function dispose(scene) {
    scene.traverse((node) => {
        node.geometry?.dispose();
        node.material?.dispose();
    });
}

// Draw each scene into a map, the generator (and the scenes) let go after: it holds a few
// megabytes of render targets and shaders
function bake(renderer, scenes, blur = 0) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const maps = scenes.map((scene) => pmrem.fromScene(scene, blur, 0.1, 200, { size: SIZE }));

    pmrem.dispose();
    scenes.forEach(dispose);

    return maps;
}

/**
 * The world's two lights from all round, as render targets (their `texture`s go in
 * scene.environment; dispose() them when done): `outdoors` under the sky, the sun towards
 * `sunDirection`, and `indoors`.
 */
export function bakeEnvironments(renderer, sunDirection) {
    const [outside, inside] = bake(renderer, [outdoors(sunDirection), indoors()]);

    return { outdoors: outside, indoors: inside };
}

/**
 * The light from the sky all round, drawn again as the day turns (`bake`), its sky and ground the
 * time of day's: one generator and one scene kept for it, so each time costs only the drawing. Its
 * `target` (a render target; its texture goes in scene.environment) is a new one each time: the
 * one before it is let go.
 */
export class SkyLight {
    constructor(renderer, sunDirection) {
        this.pmrem = new THREE.PMREMGenerator(renderer);
        this.scene = outdoors(sunDirection);
        this.sky = this.scene.userData.sky;
        this.ground = this.scene.userData.ground;
        this.target = null;
    }

    /**
     * Draw it again for a time of day (daytime.js skyAt's), the ground lit `light` times as much as
     * by day. Returns the new target.
     */
    bake(sky, light) {
        this.sky.setTime(sky);
        this.ground.material.color.set(GROUND).multiplyScalar(light);
        this.target?.dispose();
        this.target = this.pmrem.fromScene(this.scene, 0, 0.1, 200, { size: SIZE });

        return this.target;
    }

    dispose() {
        this.target?.dispose();
        this.pmrem.dispose();
        dispose(this.scene);
    }
}

/**
 * A photographer's studio's light (grey walls, white lights), for a stage where colours are
 * chosen (app/creator.js): a render target, as bakeEnvironments's.
 */
export function bakeStudio(renderer) {
    return bake(renderer, [new RoomEnvironment()], 0.04)[0];
}
