// The game's 3D view: the renderer, the scene with its sky, sun and shadows, and a camera that
// looks at the player from above and behind (the game turns and tilts it: app/camera.js). In the
// town it comes in closer than a building that would stand between it and the player, or failing
// that rises over it; indoors the walls on its side are cut away (world/interiors3d.js).
//
// Phones get less: fewer pixels, a smaller shadow map, thinner hair and smaller skin textures
// (QUALITY: hair is how much of a character's full head of hair to grow, seen from the game's
// camera). Debug mode can change the quality while playing, to see what each costs.
//
// Outdoors the world's drawn twice over: first what's far (the sky, and the far land out to the
// horizon: far/far.js), with a camera of its own that sees from FAR.from metres to the far land's
// edge; then, its depths forgotten, everything near, with the camera that sees to FAR.nearFar
// metres. What's near fades out before that (fog.js), but the ground, which goes on into the far
// land; and the haze thickens the further off, to all but gone at the far land's edge.

import * as THREE from "three";
import { bakeEnvironments } from "./environment.js";
import { FAR, FAR_LEVELS, farReach } from "./far/levels.js";
import { farHaze, GRADE, MIST } from "./fog.js";
import { GpuTimer } from "./gputimer.js";
import { FAR_FIELDS } from "./ground.js";
import { fillOf, pickLamps, ROOM_LIGHT, ROOM_LIGHTS, strengthOf } from "./roomlight.js";
import { fadeShadowEdges, snapToTexels } from "./shadows.js";
import { Sky, SKY_COLOURS } from "./sky.js";
import { SUN_FROM } from "./sun.js";
import { CUTAWAY } from "./town3d.js";
import { WATER_DETAIL } from "./water.js";

/**
 * How much each quality level draws (`undergrowth`: how thick the grass and flowers grow; `grass`:
 * how far the tall grass reaches, its near band and its far, metres, or null for none: grass.js;
 * `motes`: how many motes drift in the air round the player, motes.js; `smoke`: how many of each
 * chimney's puffs of smoke are drawn, smoke.js; `ground`: how far apart the ground's corners are drawn, metres, in the chunk the player's in,
 * the ring round it, and further off: chunks3d.js SPACING; `water`: 1 for the water's finer
 * ripples, water.js WATER_DETAIL; `fields`: 1 for the fields seen from afar, ground.js FAR_FIELDS;
 * `far`: how many levels the far land has, far/levels.js, so how
 * far off it reaches: 1, 2 or 4 km), and how often (`frameRate`: at most, a second,
 * app/pacing.js: 60 at every level, the game's target, however fast the screen; 0 would be as
 * often as it refreshes). Game options' Visual quality chooses among them, lowest first; Adaptive
 * (app/governor.js) draws a level or two lower, or fewer pixels, while a device can't keep up.
 */
export const QUALITY = Object.freeze({
    low: { label: "Low", pixelRatio: 1, shadows: 1024, antialias: false, hair: 0.2, skin: 512, undergrowth: 0.5, grass: null, motes: 0, smoke: 0.5, ground: [1, 2, 4], water: 0, fields: 0, far: FAR_LEVELS.low, farTrees: 0, frameRate: 60 },
    medium: { label: "Medium", pixelRatio: 1.5, shadows: 2048, antialias: true, hair: 0.3, skin: 512, undergrowth: 0.75, grass: { near: 12, far: 28 }, motes: 300, smoke: 0.75, ground: [1, 2, 4], water: 1, fields: 1, far: FAR_LEVELS.medium, farTrees: 700, frameRate: 60 },
    high: { label: "High", pixelRatio: 2, shadows: 2048, antialias: true, hair: 0.45, skin: 1024, undergrowth: 1, grass: { near: 18, far: 40 }, motes: 600, smoke: 1, ground: [1, 1, 2], water: 1, fields: 1, far: FAR_LEVELS.high, farTrees: 1200, frameRate: 60 },
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

// How far above the horizon the camera can look (degrees): outdoors, up into the sky; indoors,
// up at the ceiling
const INDOORS_UP = 40;

// The layer the player's drawn on for the pack's paperdoll, and what's behind them there
const PREVIEW = 3;
const PREVIEW_BACKGROUND = new THREE.Color(0x221c16);
const ABOVE_HORIZON = 45;

// Looking up, the camera comes down behind the player no lower than this over the ground
// (metres), and past that tilts up from where it is, the player sinking down the picture
const CAMERA_FLOOR = 0.45;

// How far out the screen's pointed at the ground is looked for (metres)
const PICK_REACH = 250;

// Indoors, the camera's anywhere over the ceiling (at least `over` metres over it), but under it,
// inside the room, `margin` metres in from its walls at least, and no nearer than `least`
// metres to the player (as close as that, rather than through a wall)
const ROOM = Object.freeze({ over: 0.25, margin: 0.35, least: 1 });

// Clear of a building in the way (the town's `buildings` heights): coming in closer than it,
// staying `margin` metres clear of it (along the camera's line), or rising over it (up to
// `highest` degrees), whichever leaves the camera furthest from the player, a degree higher
// counting as `lift` metres nearer; never nearer than `least` metres. Coming in (and rising)
// this quickly, going back out this slowly (per second)
const PULL = Object.freeze({ least: 2.6, margin: 0.6, highest: 85, lift: 0.15, in: 12, out: 2.5 });

// The haze at the horizon: the fog's colour and the background's, which the sky pales to
const SKY = SKY_COLOURS.horizon;

// Outdoors: the sun, and the sky and the ground lighting everything from all round, at their
// own brightness (environment.js), the fog from `fog` to `fog` metres (with the far land, the
// haze from `haze` metres to its edge: fog.js); indoors, no sky, the sun shining in at the
// windows (on the room's sunny side, interiors3d.js daylightOf: a room without windows has
// none), the room lighting everything from all round only dimly, and its flames lighting it,
// flickering (roomlight.js): the two that matter most where the player is the view's two lamps,
// out of doors put out. (The lamps are always there, so that going in and out never makes
// Three.js rebuild every lit material's shaders.)
const OUTDOORS = Object.freeze({ background: SKY, fog: [55, 130], haze: 20, sun: [0xfff0d8, 3.5], sunFrom: SUN_FROM, environment: 1 });
// (Outdoors as it is with no land's look: look.js Look's form, sRGB colours 0 to 1)
const srgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((byte) => byte / 255);
const PLAIN = Object.freeze({ zenith: srgbOf(SKY_COLOURS.zenith), horizon: srgbOf(SKY), sun: srgbOf(OUTDOORS.sun[0]), strength: OUTDOORS.sun[1], mist: [0, 0, 20], grade: [0, 0, 0, 0] });
const INDOORS = Object.freeze({ background: 0x140e0a, fog: [16, 38], sun: [0xffecd0, 4], sunFrom: [0.25, 1, 0.35], environment: 0.55 });
const LAMPS = 2;

// The sun: where it shines from (towards the north-east, so shadows fall away from the camera),
// and how far round the player its shadows are drawn (metres)
const SUN_DIRECTION = new THREE.Vector3(...OUTDOORS.sunFrom).normalize();
const SHADOW_REACH = 24;

// The hole cut through buildings in front of the player: how big (times the player's height on
// the screen) and how quickly it opens and closes (per second)
const CUT_SIZE = 1.25;
const CUT_SPEED = 5;

// How far round something's middle it's taken to reach, times its height, when asking whether
// it was in view (heightOnScreen): generous, for what it holds out and the camera's turning
const REACH_ROUND = 1;

const _point = new THREE.Vector3();
const _up = new THREE.Vector3();
const _toCamera = new THREE.Vector3();
const _size = new THREE.Vector2();
const _viewProjection = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _centre = new THREE.Vector3();

export class View {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} [options]
     * @param {string} [options.quality] - A QUALITY key.
     * @param {boolean} [options.far] - Whether the world's seen far off (the far land: setFar, and
     *     the haze out to it); else the fog closes in at 130 m, as the labs have it.
     */
    constructor(canvas, { quality = detectQuality(), far = false } = {}) {
        this.canvas = canvas;
        this.seesFar = far;
        this.qualityName = quality;
        this.quality = QUALITY[quality];
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: "high-performance" });
        // (Seeing far, graded as the land the player's in has it: ACES, then the grade, fog.js)
        this.renderer.toneMapping = far ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        fadeShadowEdges();
        farHaze();
        this.renderer.info.autoReset = false;

        /**
         * Keeping up (Game options: Adaptive, app/governor.js): whether it's on (`adaptive`); the
         * quality chosen (`chosenQuality`: the most it draws, qualityName the level it draws now);
         * and the share of the pixels drawn (`adapt`).
         */
        this.adaptive = false;
        this.adaptiveScale = 1;
        this.chosenQuality = quality;

        /** How long the GPU takes to draw the world, while it's asked (timeGpu: debug mode). */
        this.gpuTimer = new GpuTimer(this.renderer.getContext());
        this.timingGpu = false;

        this.scene = new THREE.Scene();

        // (Only what's shown has its place in the world worked out before it's drawn (#updateShown),
        // not the floors and folk of the buildings got ready near the player, hidden till they're
        // gone into: over half the scene's nodes, in a town)
        this.scene.matrixWorldAutoUpdate = false;
        this.scene.background = new THREE.Color(SKY);
        this.scene.fog = new THREE.Fog(SKY, ...OUTDOORS.fog);
        this.indoors = false;

        // What's far, drawn first with its own camera (the sky, the far land: setFar), lit as the
        // near world is but for the sun's shadows, in the same haze
        this.far = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(36, 1, FAR.from, 2000), land: null };
        this.far.scene.background = new THREE.Color(SKY);
        this.far.scene.fog = this.scene.fog;
        this.far.sun = new THREE.DirectionalLight(...OUTDOORS.sun);
        this.far.scene.add(this.far.sun, this.far.sun.target);

        // What stands on the horizon (setHorizon): drawn with the far land, and its near copy with
        // the near world (only outdoors)
        this.horizon = { far: new THREE.Group(), near: new THREE.Group() };
        this.horizon.far.name = "horizon";
        this.horizon.near.name = "horizon (near)";
        this.far.scene.add(this.horizon.far);
        this.scene.add(this.horizon.near);
        this.#light();
        this.scene.environmentIntensity = OUTDOORS.environment;

        /**
         * Told when the drawing is lost (as a phone does when short of memory, or switching apps:
         * nothing is drawn until it's given back), and when it's given back.
         */
        this.onLost = null;
        this.onRestored = null;
        canvas.addEventListener("webglcontextlost", () => this.onLost?.());
        canvas.addEventListener("webglcontextrestored", () => {
            this.#restore();
            this.onRestored?.();
        });

        this.sun = new THREE.DirectionalLight(...OUTDOORS.sun);
        this.sun.castShadow = true;
        this.sun.shadow.bias = -0.0005;
        this.sun.shadow.normalBias = 0.03;
        Object.assign(this.sun.shadow.camera, { left: -SHADOW_REACH, right: SHADOW_REACH, top: SHADOW_REACH, bottom: -SHADOW_REACH, near: 1, far: 120 });
        this.scene.add(this.sun, this.sun.target);

        // The lamps, out until the player goes in: { light }; and the room they're in, null out of
        // doors ({ x0, z0, x1, z1, ceiling: its walls and ceiling, world metres; lights, colours,
        // flares: its flames, roomlight.js; lamps: which of them the lamps are })
        this.lamps = Array.from({ length: LAMPS }, () => {
            const light = new THREE.PointLight(0xffffff, 0, 12, 2);

            this.scene.add(light);

            return { light };
        });
        this.room = null;
        this.sunDirection = SUN_DIRECTION.clone();

        // The sky outdoors, its sun where the shadows come from (sky.js), drawn behind what's far
        this.sky = new Sky(this.sunDirection);
        this.far.scene.add(this.sky.object);
        this.far.sun.position.copy(this.sunDirection);

        this.camera = new THREE.PerspectiveCamera(36, 1, 0.3, FAR.nearFar);

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

        // What the camera saw when the world was last drawn (for heightOnScreen; none yet, all's
        // taken to be in view)
        this.frustum = null;

        this.setQuality(quality);
    }

    // The light the scene's materials take from all round, outdoors and in (environment.js):
    // made once (again if the drawing's lost)
    #light() {
        this.environments?.outdoors.dispose();
        this.environments?.indoors.dispose();
        this.environments = bakeEnvironments(this.renderer, SUN_DIRECTION);
        this.scene.environment = this.environments[this.indoors ? "indoors" : "outdoors"].texture;
        this.far.scene.environment = this.environments.outdoors.texture;
    }

    // The drawing given back: Three.js uploads the geometries and textures again as they're
    // drawn, but what was drawn into (the light, the shadows, the picture behind the pack) is
    // made again here, and the canvas sized afresh
    #restore() {
        this.gpuTimer.clear();
        this.#light();
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
        this.#thaw();
        this.size = null;
        this.resize();
    }

    /**
     * Get something newly put in the scene (a character, a creature) ready to draw: its shaders
     * compiled, in the background where the browser can, so that a kind not drawn before doesn't
     * stall the frame it's first drawn in. Resolves once it's ready (keep it hidden till then).
     */
    prepare(object) {
        return this.renderer.compileAsync(object, this.camera, this.scene);
    }

    /** Draw fewer pixels than the quality level says (0.5 to 1), to see what it saves. */
    /** Draw this share of the pixels the quality level and render scale would (app/governor.js). */
    adapt(scale) {
        this.adaptiveScale = scale;
        this.#pixelRatio();
        this.resize();
    }

    setRenderScale(scale) {
        this.renderScale = scale;
        this.setQuality(this.qualityName);
    }

    /** Time the GPU's drawing of the world or not (`gpuTimer.ms`, where the browser can say). */
    timeGpu(on) {
        this.timingGpu = on;

        if (!on) {
            this.gpuTimer.clear();
        }
    }

    /** Draw shadows or not. */
    setShadows(on) {
        this.sun.castShadow = on;
    }

    /**
     * How the world looks outdoors where the player is (look.js Look's: the sky's colours, the haze's
     * the horizon's, the sun's colour and strength, the mist and the grade; sRGB colours 0 to 1).
     * Indoors, the look's kept for when they come out. None (null): outdoors as it is with none.
     */
    setLook(look) {
        this.landLook = look;

        if (this.indoors) {
            return;
        }

        look ??= PLAIN;

        const { zenith, horizon, sun, mist, grade } = look;

        this.scene.fog.color.setRGB(horizon[0], horizon[1], horizon[2], THREE.SRGBColorSpace);
        this.scene.background.copy(this.scene.fog.color);
        this.far.scene.background.copy(this.scene.fog.color);
        this.sky.uniforms.zenith.value.set(zenith[0], zenith[1], zenith[2]);
        this.sky.uniforms.horizon.value.set(horizon[0], horizon[1], horizon[2]);
        this.sun.color.setRGB(sun[0], sun[1], sun[2], THREE.SRGBColorSpace);
        this.sun.intensity = look.strength;
        this.far.sun.color.copy(this.sun.color);
        this.far.sun.intensity = look.strength;
        MIST.value.x = mist[0];
        MIST.value.y = mist[1];
        MIST.value.z = mist[2];
        GRADE.value.x = grade[0];
        GRADE.value.y = grade[1];
        GRADE.value.z = grade[2];
        GRADE.value.w = grade[3];
    }

    /**
     * The far land (far/far.js's object) to draw behind everything near, outdoors (or none: null).
     */
    setFar(object) {
        if (this.far.land) {
            this.far.scene.remove(this.far.land);
        }

        this.far.land = object;

        if (object) {
            this.far.scene.add(object);
        }
    }

    /**
     * Something standing on the horizon (`far`: drawn with the far land; `near`: its copy for the
     * near world, leaving out what the far one draws) added, or taken away (`on` false).
     */
    setHorizon({ far, near }, on = true) {
        for (const [group, object] of [
            [this.horizon.far, far],
            [this.horizon.near, near],
        ]) {
            if (object && on) {
                group.add(object);
            } else if (object) {
                group.remove(object);
            }
        }
    }

    // How far the haze reaches outdoors (metres): to the far land's edge at this quality level (or
    // the fog's, not seeing far)
    #haze() {
        if (!this.indoors) {
            [this.scene.fog.near, this.scene.fog.far] = this.seesFar ? [OUTDOORS.haze, farReach(this.quality.far)] : OUTDOORS.fog;
        }

        this.far.camera.far = farReach(this.quality.far) * 1.5;
        this.far.camera.updateProjectionMatrix();
    }

    /** Draw at another quality level (a QUALITY key). */
    setQuality(name) {
        this.qualityName = name;
        this.quality = QUALITY[name];
        WATER_DETAIL.value = this.quality.water;
        FAR_FIELDS.value = this.quality.fields;
        this.#haze();
        this.#pixelRatio();
        this.sun.shadow.mapSize.set(this.quality.shadows, this.quality.shadows);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
        this.resize();
    }

    // As many pixels as the screen has, as far as the quality level goes, times the render scale
    // (debug mode) and the share the device can keep up with (adapt)
    #pixelRatio() {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio) * (this.renderScale ?? 1) * this.adaptiveScale);
    }

    /** Fit the drawing to the canvas's size on the page (if it has changed). */
    resize() {
        this.rect = null;

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
     * outdoors, well up into the sky; indoors, up at the ceiling.
     */
    lowestPitch() {
        return this.indoors ? -INDOORS_UP : -ABOVE_HORIZON;
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
     * The ground's height at any point of the map in view (`at(x, z)`, metres: the world's
     * ground, core/terrain/ground.js), or null where it's flat at 0 (indoors): what the camera
     * keeps above, and what the screen's pointed at.
     */
    setGround(at) {
        this.ground = at ?? null;
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

    /**
     * Indoors, how far the camera can be from where it looks, looking `pitch` degrees down
     * (metres, out to `distance`): as far as it likes if it's over the ceiling there; else no
     * further than the room's walls (ROOM).
     */
    roomReach(pitch = this.pitch, distance = this.distance) {
        const { x0, z0, x1, z1, ceiling } = this.room;
        const tilt = (Math.max(0, pitch) * Math.PI) / 180;

        if (pitch > 0 && this.focus.y + LOOK_UP + Math.sin(tilt) * distance >= ceiling + ROOM.over) {
            return distance;
        }

        // (Out along the way the camera's looking from, to the first wall, as far as that goes
        // along the camera's line)
        const [dx, dz] = [Math.sin(this.yaw), Math.cos(this.yaw)];
        const [px, pz] = [this.focus.x, this.focus.z];
        const toward = (from, way, least, most) => (way > 1e-6 ? (most - ROOM.margin - from) / way : way < -1e-6 ? (least + ROOM.margin - from) / way : Infinity);
        const out = Math.max(0, Math.min(toward(px, dx, x0, x1), toward(pz, dz, z0, z1)));

        return Math.max(ROOM.least, Math.min(distance, out / Math.max(0.05, Math.cos(tilt))));
    }

    // Come in closer than a building in the way, or rise over it, whichever leaves the camera
    // further off (indoors, in closer than the walls, under the ceiling); or go back out once
    // it's not in the way: quickly in, slowly out
    #clear(dt) {
        let pulled = 0;
        let lifted = 0;

        if (this.room) {
            pulled = this.distance - this.roomReach();
        } else if (this.buildings && this.clearance(Math.max(0, this.pitch)) < this.distance) {
            // (Looking up, the camera's no lower than level with the player: see #place)
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
        const distance = Math.max(Math.min(this.distance, this.room ? ROOM.least : PULL.least), this.distance - this.pulled);
        const looking = (Math.min(PULL.highest, this.pitch + this.lifted) * Math.PI) / 180;
        // (Looking up, the camera comes down behind the player to just over the ground where they
        // stand, then tilts up from there)
        const floor = this.ground ? this.ground(focus.x, focus.z) : 0;
        const tilted = Math.max(looking, Math.asin(Math.max(-1, Math.min(0, (floor + CAMERA_FLOOR - focus.y - LOOK_UP) / distance))));
        let pitch = tilted;

        // (And it's kept over the ground behind the player all the way out, rising over a
        // hillside rather than going into it, still looking at the player; from a couple of
        // metres back, where the ground can be higher than where the player stands)
        if (this.ground) {
            let least = -1;

            for (let along = 2; along <= distance + 0.01; along += Math.max(1, distance / 8)) {
                const across = Math.cos(tilted) * along;
                const ground = this.ground(focus.x + Math.sin(yaw) * across, focus.z + Math.cos(yaw) * across);

                least = Math.max(least, (ground + CAMERA_FLOOR - focus.y - LOOK_UP) / along);
            }

            pitch = Math.max(pitch, Math.asin(Math.max(-1, Math.min(1, least))));
        }

        const across = Math.cos(pitch) * distance;

        camera.position.set(focus.x + Math.sin(yaw) * across, focus.y + LOOK_UP + Math.sin(pitch) * distance, focus.z + Math.cos(yaw) * across);
        camera.lookAt(focus.x, focus.y + LOOK_UP, focus.z);

        if (pitch === tilted && tilted > looking) {
            camera.rotateX(tilted - looking);
        }

        // The sun's shadows follow the player, a little ahead of them where more of the ground is
        // in view (the further out, the more), moved in whole shadow texels so they don't shimmer
        const ahead = Math.min(SHADOW_REACH / 2, distance * 0.35);

        snapToTexels(_centre.set(focus.x - Math.sin(yaw) * ahead, focus.y, focus.z - Math.cos(yaw) * ahead), this.sunDirection, (SHADOW_REACH * 2) / this.quality.shadows);
        this.sun.target.position.copy(_centre);
        this.sun.position.copy(_centre).addScaledVector(this.sunDirection, 60);
    }

    /**
     * Light the scene for being indoors (`interior`: interiors3d.js's: its map's place and size,
     * its ceiling's height, its flames as lights, the way towards the sun shining in at its
     * windows) or out (null).
     */
    setIndoors(interior) {
        const look = interior ? INDOORS : OUTDOORS;

        this.indoors = Boolean(interior);
        this.scene.background.set(look.background);
        this.scene.fog.color.set(look.background);

        if (interior) {
            [this.scene.fog.near, this.scene.fog.far] = look.fog;
        } else {
            this.#haze();
        }

        this.sun.color.set(look.sun[0]);
        this.sun.intensity = interior && !interior.daylight ? 0 : look.sun[1];
        this.sunDirection.set(...(interior?.daylight ?? look.sunFrom)).normalize();
        this.far.sun.position.copy(this.sunDirection);
        this.scene.environment = this.environments[interior ? "indoors" : "outdoors"].texture;
        this.scene.environmentIntensity = look.environment;
        this.sky.object.visible = !interior;
        this.horizon.near.visible = !interior;
        this.sky.setSun(this.sunDirection);

        // (Indoors no mist, no grade; out again, the land's look)
        if (interior) {
            MIST.value.x = 0;
            [GRADE.value.x, GRADE.value.y, GRADE.value.z, GRADE.value.w] = [0, 0, 0, 0];
        } else {
            this.setLook(this.landLook);
        }

        // The room: its walls and ceiling for the camera, its flames lighting it (all out till
        // they flicker)
        if (interior) {
            const { origin, width, height } = interior.map;

            this.room = { x0: origin[0], z0: origin[1], x1: origin[0] + width, z1: origin[1] + height, ceiling: interior.ceiling ?? 3, lights: interior.lights.slice(0, ROOM_LIGHTS), colours: interior.lights.slice(0, ROOM_LIGHTS).map(({ colour }) => new THREE.Color(colour)), strengths: [], flares: [], lamps: [] };
        } else {
            this.room = null;
        }

        ROOM_LIGHT.fill.value.setRGB(0, 0, 0);

        for (const { light } of this.lamps) {
            light.intensity = 0;
        }

        ROOM_LIGHT.count.value = 0;

        this.pulled = 0;
        this.lifted = 0;
        this.#place();
    }

    /**
     * Make the room's flames flicker, as flames do (`time` in seconds): each lighting the room,
     * the two lighting `near` most (the player: world metres) the view's lamps, lighting
     * everything else there too.
     */
    flicker(time, near = this.focus) {
        const room = this.room;

        if (!room) {
            return;
        }

        room.lights.forEach((light, k) => {
            room.strengths[k] = strengthOf(light, time, room.flares[k]);
        });
        room.lamps = pickLamps(room.lights, room.strengths, near, LAMPS, room.lamps);
        fillOf(room.colours, room.strengths, (room.x1 - room.x0) * (room.z1 - room.z0), ROOM_LIGHT.fill.value);

        this.lamps.forEach(({ light }, k) => {
            const index = room.lamps[k];
            const flame = room.lights[index];

            light.intensity = flame ? room.strengths[index] : 0;

            if (flame) {
                light.color.copy(room.colours[index]);
                light.distance = flame.distance;
                light.position.set(flame.x, flame.y, flame.z);
            }
        });

        // The rest in the list, one after another (the lamps left out)
        let count = 0;

        room.lights.forEach((flame, k) => {
            if (!room.lamps.includes(k)) {
                ROOM_LIGHT.at.value[count].set(flame.x, flame.y, flame.z, flame.distance);
                ROOM_LIGHT.colour.value[count].copy(room.colours[k]).multiplyScalar(room.strengths[k]);
                count += 1;
            }
        });
        ROOM_LIGHT.count.value = count;
    }

    /** Make one of the room's flames (the `k`th: a forge's fire) flare up, `amount` brighter, dying down over a second from `time`. */
    flare(k, amount, time) {
        if (this.room?.lights[k]) {
            this.room.flares[k] = { amount, at: time };
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

    /**
     * The point on the ground under a point on the screen (client pixels), or null: where the ray
     * through it first meets the ground (setGround's; else the flat floor at 0).
     */
    pickGround(clientX, clientY) {
        const ray = this.rayAt(clientX, clientY);

        if (!this.ground) {
            return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
        }

        // (Stepping along the ray until it's under the ground, finer near the camera, then
        // halving the step between the last point over it and the first under it)
        const { origin, direction } = ray;
        const below = (t) => origin.y + direction.y * t < this.ground(origin.x + direction.x * t, origin.z + direction.z * t);
        let [over, t] = [0, 0.5];

        while (t < PICK_REACH && !below(t)) {
            over = t;
            t += Math.max(0.5, t * 0.05);
        }

        if (t >= PICK_REACH) {
            return null;
        }

        for (let k = 0; k < 12; k++) {
            const middle = (over + t) / 2;

            [over, t] = below(middle) ? [over, middle] : [middle, t];
        }

        return new THREE.Vector3().copy(origin).addScaledVector(direction, t);
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

        // (Where the canvas is on the page, kept till it's resized: reading it after the page's
        // been written to, as a bar's been moved, makes the browser lay the page out again)
        this.rect ??= this.canvas.getBoundingClientRect();

        const rect = this.rect;

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
        this.#updateShown();
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
        this.#updateShown();
        this.#draw(this.camera);
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
            this.#updateShown();
        }

        const timing = this.timingGpu && scene === this.scene;

        this.renderer.info.reset();

        if (timing) {
            this.gpuTimer.begin();
        }

        if (scene === this.scene) {
            this.#draw(camera);
        } else {
            this.renderer.render(scene, camera);
        }

        if (timing) {
            this.gpuTimer.end();
        }

        if (scene === this.scene && camera === this.camera) {
            this.frustum ??= new THREE.Frustum();
            this.frustum.setFromProjectionMatrix(_viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem);
        }
    }

    // The world drawn as `camera` sees it: outdoors what's far first (with a camera of its own,
    // where `camera` is), then, its depths forgotten, what's near over it
    #draw(camera) {
        const renderer = this.renderer;

        if (this.indoors) {
            renderer.render(this.scene, camera);

            return;
        }

        const far = this.far.camera;

        far.position.copy(camera.position);
        far.quaternion.copy(camera.quaternion);

        if (far.fov !== camera.fov || far.aspect !== camera.aspect) {
            far.fov = camera.fov;
            far.aspect = camera.aspect;
            far.updateProjectionMatrix();
        }

        far.updateMatrixWorld();
        renderer.render(this.far.scene, far);

        // (A scene's colour behind it clears what's drawn, however it's asked: none for the near)
        const background = this.scene.background;

        this.scene.background = null;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(this.scene, camera);
        renderer.autoClear = true;
        this.scene.background = background;
    }

    /**
     * How tall something `height` metres tall standing at `position` looked when the world was
     * last drawn (drawing buffer pixels; `pixels`, pixelsPerMetre()), or 0 if it was out of view
     * (unless `anywhere`: how tall it would look, in view or not).
     */
    heightOnScreen(position, height, pixels = this.pixelsPerMetre(), { anywhere = false } = {}) {
        _sphere.center.set(position.x, position.y + height / 2, position.z);
        _sphere.radius = height * REACH_ROUND;

        if (!anywhere && this.frustum && !this.frustum.intersectsSphere(_sphere)) {
            return 0;
        }

        return (height * pixels) / Math.max(this.camera.near, _sphere.center.distanceTo(this.camera.position));
    }

    // The place in the world of everything shown worked out, as drawing would of everything
    #updateShown() {
        for (const child of this.scene.children) {
            if (child.visible) {
                child.updateMatrixWorld();
            }
        }
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

            if (_point.y > point.y + 25) {
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
        const ground = subject && this.ground ? this.ground(subject.x, subject.z) : 0;
        const hidden = subject !== null && (this.hidden(subject) || this.hidden(_up.copy(subject).setY(ground + (subject.y - ground) * 1.6)));

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
