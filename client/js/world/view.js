// The game's 3D view: the renderer, the scene with its sky, sun and shadows, and a camera that
// looks at the player from above and behind (the game turns and tilts it: app/camera.js). In the
// town it comes in closer than a building that would stand between it and the player, or failing
// that rises over it; indoors the walls on its side are cut away (world/interiors3d.js).
//
// Phones get less: fewer pixels, a smaller shadow map, thinner hair and smaller skin textures
// (QUALITY: hair is how much of a character's full head of hair to grow, seen from the game's
// camera). Debug mode can change the quality while playing, to see what each costs.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Sky, SKY_COLOURS } from "./sky.js";
import { CUTAWAY } from "./town3d.js";

/** How much each quality level draws (`undergrowth`: how thick the grass and flowers grow, chunks3d.js). */
export const QUALITY = Object.freeze({
    low: { label: "Low", pixelRatio: 1, shadows: 1024, antialias: false, hair: 0.2, skin: 512, undergrowth: 0.5 },
    medium: { label: "Medium", pixelRatio: 1.5, shadows: 2048, antialias: true, hair: 0.3, skin: 512, undergrowth: 0.75 },
    high: { label: "High", pixelRatio: 2, shadows: 2048, antialias: true, hair: 0.45, skin: 1024, undergrowth: 1 },
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

// The camera looks down this far from the horizon to start with (degrees: low enough to see well
// ahead of the player), from this far away (metres), zooming between; at a point this high above
// the ground (metres: the player's middle)
export const PITCH = 35;
export const DISTANCE = Object.freeze({ least: 5, start: 10.5, most: 32 });
const LOOK_UP = 0.8;

// Indoors, the camera's lowest: the top of the picture this far below the horizon (degrees), so
// there's no more of the room to draw than there is; outdoors it can look up into the sky, this
// far above the horizon (degrees)
const BELOW_HORIZON = 6;

// The layer the player's drawn on for the pack's paperdoll, and what's behind them there
const PREVIEW = 3;
const PREVIEW_BACKGROUND = new THREE.Color(0x221c16);
const ABOVE_HORIZON = 45;

// Looking up, the camera comes down behind the player no lower than this over the ground
// (metres), and past that tilts up from where it is, the player sinking down the picture
const CAMERA_FLOOR = 0.45;

// Clear of a building in the way (the town's `buildings` heights): coming in closer than it,
// staying `margin` metres clear of it (along the camera's line), or rising over it (up to
// `highest` degrees), whichever leaves the camera furthest from the player, a degree higher
// counting as `lift` metres nearer; never nearer than `least` metres. Coming in (and rising)
// this quickly, going back out this slowly (per second)
const PULL = Object.freeze({ least: 2.6, margin: 0.6, highest: 85, lift: 0.15, in: 12, out: 2.5 });

// The haze at the horizon: the fog's colour and the background's, which the sky pales to
const SKY = SKY_COLOURS.horizon;

// Indoors: no sky, a dim warm room lit from above, and lamps (the hearth's fire, candles) that
// flicker; outdoors the lamps are out. (The lamps are always there, so that going in and out
// never makes Three.js rebuild every lit material's shaders.)
const OUTDOORS = Object.freeze({ background: SKY, fog: [55, 130], sky: [0xcfe0ff, 0x5a4a32, 1.1], sun: [0xfff0d8, 2.3], sunFrom: [-0.55, 1, 0.65], environment: 0.55 });
const INDOORS = Object.freeze({ background: 0x140e0a, fog: [16, 38], sky: [0xffdcb4, 0x3a2716, 0.75], sun: [0xffe2b8, 0.9], sunFrom: [0.25, 1, 0.35], environment: 0.3 });

// A lamp that flares up (a forge's fire, the bellows pumped) dies down over this long (s)
const FLARE = 1;
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

        // The sky outdoors, its sun where the shadows come from (sky.js)
        this.sky = new Sky(this.sunDirection);
        this.scene.add(this.sky.object);

        this.camera = new THREE.PerspectiveCamera(36, 1, 0.3, 150);

        // (The camera that draws the player alone on the pack's paperdoll: renderPreview)
        this.previewCamera = new THREE.PerspectiveCamera(24, 1, 0.1, 60);
        this.previewCamera.layers.set(PREVIEW);
        this.frozen = null;
        this.focus = new THREE.Vector3();
        this.distance = DISTANCE.start;

        /**
         * Which way the camera looks from, in radians: 0 from the south, looking north, growing
         * towards the east (so π/2 is from the east, looking west).
         */
        this.yaw = 0;

        /** How far the camera looks down from the horizon, in degrees. */
        this.pitch = PITCH;

        // What might stand between the camera and the player (the town's height map, and its
        // buildings'), the point on the player to keep in view, and how open the hole cut round
        // them is (0 to 1)
        this.occluders = null;
        this.buildings = null;

        // How much nearer (metres) and higher (degrees) the camera is than asked, to be clear of
        // a building in the way
        this.pulled = 0;
        this.lifted = 0;
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

    /**
     * Point the camera at a spot (metres), looking from `yaw` (radians, as `this.yaw`), `pitch`
     * degrees down; `dt` seconds on from the last look (to come in or out from a building in the
     * way smoothly: Infinity, at once).
     */
    look(point, yaw = this.yaw, pitch = this.pitch, dt = Infinity) {
        this.focus.copy(point);
        this.yaw = yaw;
        this.pitch = pitch;
        this.#clear(dt);
        this.#place();
    }

    /**
     * The lowest the camera may look from (degrees down from the horizon; up, less than 0):
     * outdoors, well up into the sky; indoors, the top of the picture just below the horizon.
     */
    lowestPitch() {
        return this.indoors ? this.camera.fov / 2 + BELOW_HORIZON : -ABOVE_HORIZON;
    }

    /**
     * The height maps ({ heights, buildings }, each with `at(x, z)`: how high what stands on a
     * square is, metres: town3d.js heightMap's), for seeing when anything hides the player, and
     * coming in closer than buildings; null for none (indoors).
     */
    setOccluders(town) {
        this.occluders = town?.heights ?? null;
        this.buildings = town?.buildings ?? null;
        this.pulled = 0;
        this.lifted = 0;
    }

    /**
     * How far the camera can be from where it looks, along its line looking `pitch` degrees
     * down, before a building's in the way (metres: Infinity if none is, out to `distance`).
     */
    clearance(pitch = this.pitch, distance = this.distance) {
        const heights = this.buildings;

        if (!heights) {
            return Infinity;
        }

        const tilt = (pitch * Math.PI) / 180;
        const [across, up] = [Math.cos(tilt), Math.sin(tilt)];
        const [dx, dz] = [Math.sin(this.yaw) * across, Math.cos(this.yaw) * across];
        const [x0, y0, z0] = [this.focus.x, this.focus.y + LOOK_UP, this.focus.z];

        for (let along = 0.4; along < distance + PULL.margin; along += 0.2) {
            const height = heights.at(x0 + dx * along, z0 + dz * along);

            if (height > y0 + up * along - 0.3) {
                return Math.max(0, along - PULL.margin);
            }
        }

        return Infinity;
    }

    // Come in closer than a building in the way, or rise over it, whichever leaves the camera
    // further off; or go back out once it's not in the way: quickly in, slowly out
    #clear(dt) {
        let pulled = 0;
        let lifted = 0;

        // (Looking up, the camera's no lower than level with the player: see #place)
        if (this.buildings && this.clearance(Math.max(0, this.pitch)) < this.distance) {
            let best = -Infinity;

            for (let lift = 0; Math.max(0, this.pitch) + lift <= PULL.highest; lift += 5) {
                const reach = Math.max(PULL.least, Math.min(this.distance, this.clearance(Math.max(0, this.pitch) + lift)));
                const score = reach - PULL.lift * lift;

                if (score > best) {
                    best = score;
                    lifted = lift;
                    pulled = this.distance - reach;
                }
            }
        }

        const toward = (from, to) => from + (to - from) * (1 - Math.exp(-(to > from ? PULL.in : PULL.out) * dt));

        this.pulled = toward(this.pulled, pulled);
        this.lifted = toward(this.lifted, lifted);
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
        const { focus, camera, yaw } = this;
        const distance = Math.max(Math.min(this.distance, PULL.least), this.distance - this.pulled);
        const looking = (Math.min(PULL.highest, this.pitch + this.lifted) * Math.PI) / 180;
        // (Looking up, the camera comes down behind the player to just over the ground, then
        // tilts up from there)
        const pitch = Math.max(looking, Math.asin(Math.max(-1, Math.min(0, (CAMERA_FLOOR - focus.y - LOOK_UP) / distance))));
        const across = Math.cos(pitch) * distance;

        camera.position.set(focus.x + Math.sin(yaw) * across, focus.y + LOOK_UP + Math.sin(pitch) * distance, focus.z + Math.cos(yaw) * across);
        camera.lookAt(focus.x, focus.y + LOOK_UP, focus.z);

        if (pitch > looking) {
            camera.rotateX(pitch - looking);
        }

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
        this.sky.object.visible = !interior;
        this.sky.setSun(this.sunDirection);

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
                const flaring = lamp.flare ? lamp.flare.amount * Math.max(0, 1 - (time - lamp.flare.at) / FLARE) : 0;

                lamp.light.intensity = lamp.intensity * (1 + lamp.flicker * wave) * (1 + flaring);
            }
        }
    }

    /** Make an indoor lamp (the `k`th: a forge's fire) flare up, `amount` brighter, dying down over a second from `time`. */
    flare(k, amount, time) {
        if (this.lamps[k]) {
            this.lamps[k].flare = { amount, at: time };
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

    /**
     * Draw the player on the pack's paperdoll (app/pack.js dollView): the world as it was when
     * the pack opened behind it, still and dimmed (drawn once, into a picture: the world isn't drawn
     * while the pack's open), and the player alone, live, in the paperdoll's box, facing out, turned
     * by `turn` (radians).
     */
    renderPreview(element, subject, { height = 1.7, turn = 0, clip = null } = {}) {
        const renderer = this.renderer;
        const size = renderer.getDrawingBufferSize(_size);

        if (!this.frozen || this.frozen.width !== size.x || this.frozen.height !== size.y) {
            this.#freeze(size);
        }

        renderer.info.reset();
        renderer.setRenderTarget(null);
        renderer.render(this.frozen.scene, this.frozen.camera);

        const canvas = renderer.domElement.getBoundingClientRect();
        const onCanvas = (rect) => [rect.left - canvas.left, canvas.bottom - rect.bottom, rect.width, rect.height];

        // The paperdoll's box, on the canvas (as much of it as isn't scrolled out of sight)
        const box = element.getBoundingClientRect();
        const seen = clip?.getBoundingClientRect() ?? box;
        const top = Math.max(box.top, seen.top);
        const bottom = Math.min(box.bottom, seen.bottom);
        const [x, y, w, h] = onCanvas({ left: box.left, bottom, width: box.width, height: bottom - top });

        if (w < 4 || h < 4) {
            return;
        }

        // Just the player (and the lights), from in front of them
        subject.traverse((node) => node.layers.enable(PREVIEW));

        for (const light of this.frozen.lights) {
            light.layers.enable(PREVIEW);
        }

        const camera = this.previewCamera;
        const middle = subject.getWorldPosition(_point).add(_up.set(0, height * 0.52, 0));
        const facing = subject.rotation.y + turn;
        const back = (height * 0.62) / Math.tan((camera.fov * Math.PI) / 360);

        // (Framed on the whole box, even if some of it's scrolled away)
        camera.aspect = box.width / box.height;
        camera.updateProjectionMatrix();
        camera.setViewOffset(box.width, box.height, 0, top - box.top, w, h);
        camera.position.set(middle.x + Math.sin(facing) * back, middle.y + height * 0.05, middle.z + Math.cos(facing) * back);
        camera.lookAt(middle);

        const background = this.scene.background;
        const shadows = renderer.shadowMap.autoUpdate;

        this.scene.background = PREVIEW_BACKGROUND;
        renderer.shadowMap.autoUpdate = false;
        renderer.setScissorTest(true);
        renderer.setScissor(x, y, w, h);
        renderer.setViewport(x, y, w, h);
        renderer.render(this.scene, camera);
        renderer.setScissorTest(false);
        camera.clearViewOffset();
        renderer.setViewport(0, 0, canvas.width, canvas.height);
        renderer.shadowMap.autoUpdate = shadows;
        this.scene.background = background;
    }

    // The world drawn once into a picture (half as sharp), to show behind the pack, still and dimmed
    #freeze(size) {
        this.#thaw();

        const target = new THREE.WebGLRenderTarget(Math.max(1, Math.round(size.x / 2)), Math.max(1, Math.round(size.y / 2)), { type: THREE.HalfFloatType });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: target.texture, color: 0x6a6a6a, depthTest: false, depthWrite: false }));
        const scene = new THREE.Scene();
        const lights = [];

        this.#cutAway(0);
        this.sky.update(this.camera, performance.now() / 1000);
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);
        scene.add(quad);
        this.scene.traverse((node) => node.isLight && lights.push(node));
        this.frozen = { target, scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), width: size.x, height: size.y, lights };
    }

    // The picture of the world let go (the pack closed)
    #thaw() {
        if (this.frozen) {
            this.frozen.target.dispose();
            this.frozen.scene.children[0].geometry.dispose();
            this.frozen.scene.children[0].material.dispose();
            this.frozen = null;
        }
    }

    render(scene = this.scene, camera = this.camera) {
        this.#thaw();

        const now = performance.now();
        const dt = Math.min(0.1, (now - this.lastRender) / 1000);

        this.lastRender = now;

        if (scene === this.scene) {
            this.#cutAway(dt);
            this.sky.update(camera, now / 1000);
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

            const height = heights.at(_point.x, _point.z);

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
