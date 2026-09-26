// The game's 3D view: the renderer, the scene with its sky, sun and shadows, and a camera that
// follows the player from above and behind, looking north, as the town's houses are built to be
// seen (their doors and windows face south).
//
// Phones get less: fewer pixels, a smaller shadow map, thinner hair and smaller skin textures
// (QUALITY: hair is how much of a character's full head of hair to grow, seen from the game's
// camera). Debug mode can change the quality while playing, to see what each costs.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CUTAWAY } from "./town3d.js";

/** How much each quality level draws. */
export const QUALITY = Object.freeze({
    low: { label: "Low", pixelRatio: 1, shadows: 1024, antialias: false, hair: 0.2, skin: 512 },
    medium: { label: "Medium", pixelRatio: 1.5, shadows: 2048, antialias: true, hair: 0.3, skin: 512 },
    high: { label: "High", pixelRatio: 2, shadows: 2048, antialias: true, hair: 0.45, skin: 1024 },
});

/** A quality level for this device: low for small or older phones, medium for phones, high otherwise. */
export function detectQuality() {
    const touch = matchMedia("(pointer: coarse)").matches;
    const memory = navigator.deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;

    if (touch && (memory <= 4 || cores <= 4)) {
        return "low";
    }

    return touch ? "medium" : "high";
}

// The camera looks down this far from the horizon (degrees: low enough to see well ahead of the
// player), from this far away (metres), zooming between
export const PITCH = 45;
export const DISTANCE = Object.freeze({ least: 5, start: 10.5, most: 32 });

const SKY = 0xa9c8de;

// Indoors: no sky, a dim warm room lit from above, and lamps (the hearth's fire, candles) that
// flicker; outdoors the lamps are out. (The lamps are always there, so that going in and out
// never makes Three.js rebuild every lit material's shaders.)
const OUTDOORS = Object.freeze({ background: SKY, fog: [55, 130], sky: [0xcfe0ff, 0x5a4a32, 1.1], sun: [0xfff0d8, 2.3], sunFrom: [-0.55, 1, 0.65], environment: 0.55 });
const INDOORS = Object.freeze({ background: 0x140e0a, fog: [16, 38], sky: [0xffdcb4, 0x3a2716, 0.75], sun: [0xffe2b8, 0.9], sunFrom: [0.25, 1, 0.35], environment: 0.3 });
const LAMPS = 2;

// The sun: where it shines from (towards the north-east, so shadows fall away from the camera),
// and how far round the player its shadows are drawn (metres)
const SUN_DIRECTION = new THREE.Vector3(...OUTDOORS.sunFrom).normalize();
const SHADOW_REACH = 24;

// The hole cut through buildings in front of the player: how big (times the player's height on
// the screen) and how quickly it opens and closes (per second)
const CUT_SIZE = 1.25;
const CUT_SPEED = 5;

const _point = new THREE.Vector3();
const _up = new THREE.Vector3();
const _toCamera = new THREE.Vector3();
const _size = new THREE.Vector2();

export class View {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} [options]
     * @param {string} [options.quality] - A QUALITY key.
     */
    constructor(canvas, { quality = detectQuality() } = {}) {
        this.canvas = canvas;
        this.qualityName = quality;
        this.quality = QUALITY[quality];
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: "high-performance" });
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.info.autoReset = false;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(SKY);
        this.scene.fog = new THREE.Fog(SKY, 55, 130);
        this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.environmentIntensity = 0.55;

        this.hemisphere = new THREE.HemisphereLight(0xcfe0ff, 0x5a4a32, 1.1);
        this.scene.add(this.hemisphere);

        this.sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
        this.sun.castShadow = true;
        this.sun.shadow.bias = -0.0005;
        this.sun.shadow.normalBias = 0.03;
        Object.assign(this.sun.shadow.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: 1, far: 120 });
        this.scene.add(this.sun, this.sun.target);

        // The lamps indoors, out until the player goes in: { light, intensity, flicker, seed }
        this.lamps = Array.from({ length: LAMPS }, (_, k) => {
            const light = new THREE.PointLight(0xffffff, 0, 12, 2);

            this.scene.add(light);

            return { light, intensity: 0, flicker: 0, seed: k * 17.3 };
        });
        this.sunDirection = SUN_DIRECTION.clone();
        this.indoors = false;

        this.camera = new THREE.PerspectiveCamera(36, 1, 0.3, 220);
        this.focus = new THREE.Vector3();
        this.distance = DISTANCE.start;

        /**
         * Which way the camera looks from, in radians: 0 from the south, looking north, growing
         * towards the east (so π/2 is from the east, looking west).
         */
        this.yaw = 0;

        /** How far the camera looks down from the horizon, in degrees. */
        this.pitch = PITCH;

        // What might stand between the camera and the player (the town's height map), the point
        // on the player to keep in view, and how open the hole cut round them is (0 to 1)
        this.occluders = null;
        this.subject = null;
        this.cut = 0;
        this.lastRender = performance.now();

        this.setQuality(quality);
    }

    /** Draw fewer pixels than the quality level says (0.5 to 1), to see what it saves. */
    setRenderScale(scale) {
        this.renderScale = scale;
        this.setQuality(this.qualityName);
    }

    /** Draw shadows or not. */
    setShadows(on) {
        this.sun.castShadow = on;
    }

    /** Draw at another quality level (a QUALITY key). */
    setQuality(name) {
        this.qualityName = name;
        this.quality = QUALITY[name];
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio) * (this.renderScale ?? 1));
        this.sun.shadow.mapSize.set(this.quality.shadows, this.quality.shadows);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
        this.resize();
    }

    /** Fit the drawing to the canvas's size on the page (if it has changed). */
    resize() {
        const width = this.canvas.clientWidth || 1;
        const height = this.canvas.clientHeight || 1;
        const ratio = this.renderer.getPixelRatio();
        const size = `${width}x${height}@${ratio}`;

        // Setting a canvas's size, even to the same, makes WebGL start its drawing afresh
        if (size === this.size) {
            return;
        }

        this.size = size;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;

        // Tall screens (a phone held upright) see less across, so step back a little
        this.camera.fov = width < height ? 50 : 36;
        this.camera.updateProjectionMatrix();
    }

    /** Point the camera at a spot (metres), looking from `yaw` (radians, as `this.yaw`). */
    look(point, yaw = this.yaw) {
        this.focus.copy(point);
        this.yaw = yaw;
        this.#place();
    }

    /**
     * The town's height map ({ heights }: buildTown's), for seeing when buildings hide the
     * player; null for none.
     */
    setOccluders(town) {
        this.occluders = town?.heights ?? null;
    }

    /** The point to keep in view through anything in the way (the player's chest), or null. */
    setFocus(point) {
        this.subject = point ? (this.subject ?? new THREE.Vector3()).copy(point) : null;
    }

    /** How many drawing buffer pixels a metre is, a metre from the camera (for sizing particles). */
    pixelsPerMetre() {
        return this.renderer.getDrawingBufferSize(_size).y / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    }

    /** Zoom in (factor < 1) or out. */
    zoom(factor) {
        this.distance = Math.min(DISTANCE.most, Math.max(DISTANCE.least, this.distance * factor));
        this.#place();
    }

    #place() {
        const { focus, camera, distance, yaw } = this;
        const pitch = (this.pitch * Math.PI) / 180;
        const across = Math.cos(pitch) * distance;

        camera.position.set(focus.x + Math.sin(yaw) * across, focus.y + Math.sin(pitch) * distance, focus.z + Math.cos(yaw) * across);
        camera.lookAt(focus.x, focus.y + 0.8, focus.z);

        // The sun's shadows follow the player, a little ahead of them where more of the ground is
        // in view (the further out, the more), snapped to whole shadow texels so they don't shimmer
        const texel = (SHADOW_REACH * 2) / this.quality.shadows;
        const ahead = Math.min(SHADOW_REACH / 2, distance * 0.35);
        const x = Math.round((focus.x - Math.sin(yaw) * ahead) / texel) * texel;
        const z = Math.round((focus.z - Math.cos(yaw) * ahead) / texel) * texel;

        this.sun.target.position.set(x, 0, z);
        this.sun.position.set(x, 0, z).addScaledVector(this.sunDirection, 60);
    }

    /**
     * Light the scene for being indoors (`interior`: interiors3d.js's, with its lamps: { x, y, z,
     * colour, intensity, distance, flicker }) or out (null).
     */
    setIndoors(interior) {
        const look = interior ? INDOORS : OUTDOORS;

        this.indoors = Boolean(interior);
        this.scene.background.set(look.background);
        this.scene.fog.color.set(look.background);
        [this.scene.fog.near, this.scene.fog.far] = look.fog;
        this.hemisphere.color.set(look.sky[0]);
        this.hemisphere.groundColor.set(look.sky[1]);
        this.hemisphere.intensity = look.sky[2];
        this.sun.color.set(look.sun[0]);
        this.sun.intensity = look.sun[1];
        this.sunDirection.set(...look.sunFrom).normalize();
        this.scene.environmentIntensity = look.environment;

        this.lamps.forEach((lamp, k) => {
            const spec = interior?.lights[k];

            lamp.intensity = spec?.intensity ?? 0;
            lamp.flicker = spec?.flicker ?? 0;
            lamp.light.intensity = lamp.intensity;

            if (spec) {
                lamp.light.color.set(spec.colour);
                lamp.light.distance = spec.distance;
                lamp.light.position.set(spec.x, spec.y, spec.z);
            }
        });

        this.#place();
    }

    /** Make the lamps flicker, as flames do (`time` in seconds). */
    flicker(time) {
        for (const lamp of this.lamps) {
            if (lamp.intensity > 0) {
                const wave = Math.sin(time * 9.1 + lamp.seed) * 0.5 + Math.sin(time * 23.7 + lamp.seed * 2) * 0.3 + Math.sin(time * 4.3) * 0.2;

                lamp.light.intensity = lamp.intensity * (1 + lamp.flicker * wave);
            }
        }
    }

    /** The ray from the camera through a point on the screen (client pixels). */
    rayAt(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();

        ray.setFromCamera(pointer, this.camera);

        return ray.ray;
    }

    /** The point on the ground under a point on the screen (client pixels), or null. */
    groundAt(clientX, clientY) {
        return this.rayAt(clientX, clientY).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    }

    /**
     * Where a point in the world (metres) is on the screen, from the middle: -1 to 1 across (left
     * to right) and up (bottom to top), or null behind the camera.
     */
    fromMiddle(point) {
        const projected = _point.copy(point).project(this.camera);

        return projected.z > 1 ? null : { x: projected.x, y: projected.y };
    }

    /** Where a point in the world (metres) is on the screen, in client pixels (null behind the camera). */
    toScreen(point) {
        const projected = point.clone().project(this.camera);

        if (projected.z > 1) {
            return null;
        }

        const rect = this.canvas.getBoundingClientRect();

        return { x: rect.left + ((projected.x + 1) / 2) * rect.width, y: rect.top + ((1 - projected.y) / 2) * rect.height };
    }

    render(scene = this.scene, camera = this.camera) {
        const now = performance.now();
        const dt = Math.min(0.1, (now - this.lastRender) / 1000);

        this.lastRender = now;

        if (scene === this.scene) {
            this.#cutAway(dt);
        }

        this.renderer.info.reset();
        this.renderer.render(scene, camera);
    }

    /** Is anything on the height map between the camera and a point? */
    hidden(point) {
        const heights = this.occluders;

        if (!heights) {
            return false;
        }

        _toCamera.copy(this.camera.position).sub(point).normalize();

        // Step along the line towards the camera until it's above anything that could be in the way
        for (let distance = 0.5; distance < 40; distance += 0.3) {
            _point.copy(point).addScaledVector(_toCamera, distance);

            if (_point.y > 25) {
                break;
            }

            const height = heights[Math.floor(_point.z)]?.[Math.floor(_point.x)] ?? 0;

            if (height > _point.y) {
                return true;
            }
        }

        return false;
    }

    // Open a hole through whatever hides the player (or close it when nothing does)
    #cutAway(dt) {
        const subject = this.subject;
        const hidden = subject !== null && (this.hidden(subject) || this.hidden(_up.copy(subject).setY(subject.y * 1.6)));

        this.cut += Math.sign((hidden ? 1 : 0) - this.cut) * Math.min(Math.abs((hidden ? 1 : 0) - this.cut), dt * CUT_SPEED);

        if (this.cut <= 0 || !subject) {
            CUTAWAY.radius.value = 0;

            return;
        }

        const { x: width, y: height } = this.renderer.getDrawingBufferSize(_size);
        const centre = _point.copy(subject).project(this.camera);
        const top = _up.copy(subject).setY(subject.y + 1).project(this.camera);
        const pixels = Math.abs(top.y - centre.y) * 0.5 * height;

        CUTAWAY.centre.value.set((centre.x * 0.5 + 0.5) * width, (centre.y * 0.5 + 0.5) * height, centre.z * 0.5 + 0.5);
        CUTAWAY.radius.value = pixels * CUT_SIZE * (0.35 + 0.65 * this.cut);
    }
}
