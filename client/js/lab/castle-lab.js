// The castle lab (castle-lab.html): Bellhaven, the White Castle (a bought scene: licensed,
// docs/LICENSED_MODELS.md), drawn as the game draws the world out of doors, with what it costs as
// it's walked: draw calls, triangles, the graphics card's memory and the time a frame takes. Its
// details and textures' sizes can be switched, and the game's quality levels; the game's camera
// walks the castle's walk from the bridge to the keep's doors, or it's looked round freely. Opened
// on a phone, it gives the numbers the castle's analysis could only estimate.
//
// Without the licensed models (CI, a copy of the game without them), the castle's walk is drawn
// instead, a block a square at its height: where it's walked is the same with the art or without.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ASSETS } from "../app/assets.js";
import { filesOf } from "../app/catalog.js";
import { walkOf } from "../core/scenery.js";
import { floorAt, placeOf, squareOf, walkBetween } from "../core/walk.js";
import { loadGltf, readKtx2With } from "../world/art/engine/models.js";
import { SKY_COLOURS } from "../world/sky.js";
import { SUN_FROM } from "../world/sun.js";
import { QUALITY } from "../world/view.js";

// The castle: its catalog entry, its scene (core/scenery.js: its walk), and where its walk goes
// (the bridge's near end, the keep's doors: metres, as built)
export const CASTLE = Object.freeze({ entry: "scenery-bellhaven", file: "bellhaven.bin", scenery: "bellhaven", from: [0, 40], to: [-0.5, -140] });

// As the game draws out of doors (world/view.js OUTDOORS, app/camera.js PITCH, LANDSCAPE_FOV):
// fog from 55 to 130 m, nothing drawn past 160; the sun; the camera 35 degrees down, 36 tall
const LOOK = Object.freeze({ fog: [55, 130], far: 160, sun: [0xfff0d8, 3.5], pitch: 35, fov: 36 });

// Which detail each cell's drawn at by how far its nearest point is from the camera (metres):
// the nearest within `near`, the next beyond. Further off, blocks of cells `block` a side, each
// merged into a mesh a material, drawn while none of their cells is near: a few draw calls for
// what's far off, where cells would be a material each apiece
const DETAIL = { near: 45, block: 3 };

// The layer only the sun's shadow sees: what casts the castle's shadows, drawn into no picture
const SHADOWS_ONLY = 1;

// The materials of carved white stone, drawn as one far off ("one stone"): alike in the fog
const STONE = /^M_(I|II|III)_|^M_(Wall|Floor|Details|White)/;

// The walk: how fast (metres a second, a run), how far back the camera is, and how long a turn
// of the camera takes to catch up (seconds)
const WALKING = { speed: 4.5, distance: 16, ease: 0.6 };

const canvas = document.querySelector("#view");
const params = new URLSearchParams(location.search);
const ui = {
    status: document.querySelector("#status"),
    stats: document.querySelector("#stats"),
    quality: document.querySelector("#quality"),
    detail: document.querySelector("#detail"),
    textures: document.querySelector("#textures"),
    far: document.querySelector("#far"),
    shadows: document.querySelector("#shadows"),
    casters: document.querySelector("#casters"),
    camera: document.querySelector("#camera"),
    distance: document.querySelector("#distance"),
    run: document.querySelector("#run"),
    result: document.querySelector("#result"),
};

const quality = QUALITY[params.get("quality")] ?? QUALITY.medium;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: "high-performance" });

readKtx2With(renderer, filesOf(ASSETS, "basis-transcoder", document.baseURI));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();

scene.background = new THREE.Color(SKY_COLOURS.horizon);
scene.fog = new THREE.Fog(SKY_COLOURS.horizon, ...LOOK.fog);
scene.add(new THREE.HemisphereLight(0xcfe0f0, 0x6a6458, 1.1));

// The sun, its shadow following what the camera looks at (as the game's does)
const sun = new THREE.DirectionalLight(...LOOK.sun);
const sunFrom = new THREE.Vector3(...SUN_FROM).normalize();

sun.castShadow = true;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
// (The sun's shadow sees what casts the castle's shadows as well as the rest; the camera doesn't)
sun.shadow.camera.layers.enable(SHADOWS_ONLY);
scene.add(sun, sun.target);

const camera = new THREE.PerspectiveCamera(LOOK.fov, 1, 0.3, LOOK.far);
const controls = new OrbitControls(camera, canvas);

controls.enabled = false;
controls.enableDamping = true;

// The walker the game's camera follows
const walker = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 12), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }));

walker.castShadow = true;
scene.add(walker);

const state = {
    quality,
    cells: [],
    walk: null,
    path: [],
    along: 0,
    heading: 0,
    detail: "auto",
    far: "blocks",
    blocks: [],
    casters: "proxy",
    proxies: [],
    textures: 0,
    sized: new Map(),
    frames: [],
    running: null,
    drawn: 0,
    art: false,
};

// --- Reading it -----------------------------------------------------------------------------

// (Its walk, as the game has it: core/scenery/bellhaven.walk.js)
async function loadWalk() {
    return walkOf(CASTLE.scenery);
}

/**
 * The castle's cells: each its details, nearest first (its nodes at the top of the scene: one
 * named for its cell, "<mesh>@<i>,<j>", and one for each lower detail, `extras.lod` saying which;
 * Three.js takes the dot out of "<cell>.lod1"), and the box round its nearest.
 */
function cellsOf(root) {
    const byCell = new Map();

    root.updateMatrixWorld(true);

    for (const node of root.children) {
        const match = /^(.*@-?\d+,-?\d+)(?:\.?lod\d+)?$/.exec(node.name);

        if (match) {
            byCell.set(match[1], [...(byCell.get(match[1]) ?? []), [node.userData.lod ?? 0, node]]);
        }
    }

    return [...byCell.entries()].map(([name, levels]) => {
        const sorted = levels.sort((a, b) => a[0] - b[0]).map(([, node]) => node);

        // (None drawn till it's chosen: a node's drawn as it's read, and a cell first shown at no
        // detail, in a block drawn whole, would be left drawn at all of them)
        for (const node of sorted) {
            node.visible = false;
            node.traverse((part) => {
                if (part.isMesh) {
                    part.castShadow = true;
                    part.receiveShadow = true;
                }
            });
        }

        const [, i, j] = /@(-?\d+),(-?\d+)$/.exec(name).map(Number);

        return { name, at: [i, j], levels: sorted, box: new THREE.Box3().setFromObject(sorted[0]), shown: -1 };
    });
}

/**
 * Blocks of cells (`DETAIL.block` a side), each its cells' lowest detail merged into a mesh a
 * material (`oneStone`: the carved stone's all one material), for drawing what's far off in a few
 * draw calls. Each block: { cells, group (in the scene, hidden till it's wanted) }.
 */
function blocksOf(cells, oneStone) {
    const byBlock = new Map();

    for (const cell of cells) {
        const key = cell.at.map((value) => Math.floor(value / DETAIL.block)).join(",");

        byBlock.set(key, [...(byBlock.get(key) ?? []), cell]);
    }

    let stone = null;

    return [...byBlock.values()].map((members) => {
        const byMaterial = new Map();

        for (const cell of members) {
            cell.levels.at(-1).traverse((part) => {
                if (!part.isMesh) {
                    return;
                }

                let material = part.material;

                if (oneStone && STONE.test(material.name)) {
                    stone ??= material;
                    material = stone;
                }

                // (Only geometry with the same attributes merges)
                const key = `${material.uuid} ${Object.keys(part.geometry.attributes).sort().join(" ")}`;
                const geometry = part.geometry.clone().applyMatrix4(part.matrixWorld);

                byMaterial.set(key, { material, geometries: [...(byMaterial.get(key)?.geometries ?? []), geometry] });
            });
        }

        const group = new THREE.Group();

        for (const { material, geometries } of byMaterial.values()) {
            const merged = mergeGeometries(geometries, false);

            geometries.forEach((geometry) => geometry.dispose());

            if (merged) {
                const mesh = new THREE.Mesh(merged, material);

                mesh.receiveShadow = true;
                group.add(mesh);
            }
        }

        group.visible = false;
        scene.add(group);

        return { cells: members, group };
    });
}

function makeBlocks() {
    for (const block of state.blocks) {
        scene.remove(block.group);
        block.group.traverse((part) => part.isMesh && part.geometry.dispose());
    }

    state.blocks = state.far === "cells" ? [] : blocksOf(state.cells, state.far === "stone");

    for (const cell of state.cells) {
        cell.shown = -1;
    }
}

// Without the art: the walk, a block a square at its height, coloured by it
function standIn(walk) {
    const group = new THREE.Group();
    const block = new THREE.BoxGeometry(walk.square, 0.4, walk.square);

    for (const [index, level] of walk.levels.entries()) {
        const blocks = new THREE.InstancedMesh(block, new THREE.MeshStandardMaterial({ color: [0xd8d2c4, 0x9fb4d0, 0xc7d8a8][index % 3], roughness: 0.9 }), level.squares);
        const matrix = new THREE.Matrix4();
        let n = 0;

        for (let z = level.box[1]; z <= level.box[3]; z++) {
            for (let x = level.box[0]; x <= level.box[2]; x++) {
                const at = placeOf(walk, index, [x, z]);

                if (at) {
                    blocks.setMatrixAt(n++, matrix.makeTranslation(at[0], at[1] - 0.2, at[2]));
                }
            }
        }

        blocks.receiveShadow = true;
        blocks.castShadow = true;
        group.add(blocks);
    }

    return group;
}

// --- Detail and textures --------------------------------------------------------------------

const _nearest = new THREE.Vector3();

function showCell(cell, level) {
    if (level !== cell.shown) {
        cell.levels.forEach((thing, i) => (thing.visible = i === level));
        cell.shown = level;
    }
}

function showDetail() {
    const near = (cell) => cell.box.clampPoint(camera.position, _nearest).distanceTo(camera.position) < DETAIL.near;
    const levelOf = (cell) => Math.min(state.detail === "auto" ? (near(cell) ? 0 : 1) : Number(state.detail), cell.levels.length - 1);

    if (!state.blocks.length || state.detail !== "auto") {
        for (const block of state.blocks) {
            block.group.visible = false;
        }

        for (const cell of state.cells) {
            showCell(cell, levelOf(cell));
        }

        return;
    }

    // (A block far off drawn whole, its cells hidden; one with a cell near, cell by cell)
    for (const block of state.blocks) {
        const whole = !block.cells.some(near);

        block.group.visible = whole;

        for (const cell of block.cells) {
            showCell(cell, whole ? -1 : levelOf(cell));
        }
    }
}

/**
 * What casts the castle's shadows: its nearest detail (`casters` "nearest": a draw call for each
 * of a near cell's materials, again); or ("proxy") for each block of cells, its lowest detail in
 * one mesh of every material at once, on a layer only the sun's shadow sees: a draw call a block.
 */
function castShadows() {
    for (const proxy of state.proxies) {
        scene.remove(proxy);
        proxy.geometry.dispose();
    }

    state.proxies = [];

    for (const cell of state.cells) {
        cell.levels.forEach((thing, i) => thing.traverse((part) => part.isMesh && (part.castShadow = state.casters === "nearest" && i === 0)));
    }

    if (state.casters !== "proxy") {
        return;
    }

    const byBlock = new Map();

    for (const cell of state.cells) {
        const key = cell.at.map((value) => Math.floor(value / DETAIL.block)).join(",");

        cell.levels.at(-1).traverse((part) => {
            if (part.isMesh) {
                const shape = new THREE.BufferGeometry().setAttribute("position", part.geometry.attributes.position.clone());

                shape.setIndex(part.geometry.index?.clone() ?? null);
                byBlock.set(key, [...(byBlock.get(key) ?? []), shape.applyMatrix4(part.matrixWorld)]);
            }
        });
    }

    const material = new THREE.MeshBasicMaterial({ colorWrite: false });

    for (const shapes of byBlock.values()) {
        const merged = mergeGeometries(shapes, false);

        shapes.forEach((shape) => shape.dispose());

        if (merged) {
            const proxy = new THREE.Mesh(merged, material);

            proxy.castShadow = true;
            proxy.layers.set(SHADOWS_ONLY);
            scene.add(proxy);
            state.proxies.push(proxy);
        }
    }
}

/**
 * Each texture drawn `drop` sizes smaller (0: as built, 1: half, 2: a quarter), its largest
 * mipmaps left out and what's on the GPU sent again: the memory a smaller build would take.
 */
function sizeTextures(root, drop) {
    const seen = new Set();

    root.traverse((thing) => {
        for (const material of thing.isMesh ? [thing.material].flat() : []) {
            for (const texture of Object.values(material).filter((value) => value?.isTexture && value.mipmaps?.length)) {
                if (seen.has(texture)) {
                    continue;
                }

                seen.add(texture);

                if (!state.sized.has(texture)) {
                    state.sized.set(texture, { mipmaps: texture.mipmaps, image: texture.image });
                }

                const { mipmaps, image } = state.sized.get(texture);
                const from = Math.min(drop, mipmaps.length - 1);

                texture.mipmaps = mipmaps.slice(from);
                texture.image = { ...image, width: mipmaps[from].width, height: mipmaps[from].height };
                texture.needsUpdate = true;
            }
        }
    });
}

// What the graphics card holds for what's drawn: textures (as compressed as they're kept, with
// their mipmaps) and geometry (each buffer once)
function memoryOf(root) {
    const textures = new Set();
    const buffers = new Set();
    let [pictures, shapes] = [0, 0];

    root.traverse((thing) => {
        if (!thing.isMesh) {
            return;
        }

        for (const attribute of [...Object.values(thing.geometry.attributes), thing.geometry.index].filter(Boolean)) {
            const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array;

            if (!buffers.has(array)) {
                buffers.add(array);
                shapes += array.byteLength;
            }
        }

        for (const material of [thing.material].flat()) {
            for (const texture of Object.values(material).filter((value) => value?.isTexture)) {
                if (textures.has(texture.source)) {
                    continue;
                }

                textures.add(texture.source);
                pictures += texture.mipmaps?.length ? texture.mipmaps.reduce((sum, level) => sum + (level.data?.byteLength ?? 0), 0) : (texture.image?.width ?? 0) * (texture.image?.height ?? 0) * 4 * 1.33;
            }
        }
    });

    return { textures: pictures, geometry: shapes };
}

// --- The walk -------------------------------------------------------------------------------

// The squares from the bridge to the keep's doors, their middles in the scene, smoothed
function walkPath(walk) {
    const squares = walkBetween(walk, 0, squareOf(walk, CASTLE.from), squareOf(walk, CASTLE.to));

    if (!squares) {
        throw new Error("the castle's walk doesn't join the bridge to the keep's doors");
    }

    let points = squares.map((square) => new THREE.Vector3(...placeOf(walk, 0, square)));

    // (Corners cut, twice, so the camera's turns are gentle)
    for (let pass = 0; pass < 2; pass++) {
        points = [points[0], ...points.slice(0, -1).flatMap((a, i) => [a.clone().lerp(points[i + 1], 0.25), a.clone().lerp(points[i + 1], 0.75)]), points.at(-1)];
    }

    // (On the floor, wherever the corner-cutting put it)
    for (const point of points) {
        const [x, z] = squareOf(walk, [point.x, point.z]);

        point.y = floorAt(walk, 0, x, z) ?? point.y;
    }

    return points;
}

function walkTo(seconds) {
    const path = state.path;
    let left = seconds * WALKING.speed;

    while (left > 0 && path.length > 1) {
        const i = Math.floor(state.along);
        const a = path[i % (path.length - 1)];
        const b = path[(i % (path.length - 1)) + 1];
        const span = a.distanceTo(b) || 1e-3;
        const step = Math.min(left, (1 - (state.along - i)) * span);

        state.along += step / span;
        left -= step;

        if (state.along >= path.length - 1) {
            state.along = 0;

            if (state.running) {
                finishRun();
            }
        }
    }

    const i = Math.floor(state.along);
    const a = path[i];
    const b = path[Math.min(i + 1, path.length - 1)];
    const at = a.clone().lerp(b, state.along - i);
    const facing = Math.atan2(b.x - a.x, b.z - a.z);
    const turn = Math.atan2(Math.sin(facing - state.heading), Math.cos(facing - state.heading));

    state.heading += turn * Math.min(1, seconds / WALKING.ease);
    walker.position.set(at.x, at.y + 0.9, at.z);

    // The game's camera: behind and above, 35 degrees down
    const pitch = (LOOK.pitch * Math.PI) / 180;
    const distance = Number(ui.distance.value);

    camera.position.set(at.x - Math.sin(state.heading) * Math.cos(pitch) * distance, at.y + 1.2 + Math.sin(pitch) * distance, at.z - Math.cos(state.heading) * Math.cos(pitch) * distance);
    camera.lookAt(at.x, at.y + 1.2, at.z);
}

// --- Measuring ------------------------------------------------------------------------------

const percentile = (values, share) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0;
const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

function showStats(info) {
    const recent = state.frames.slice(-120);
    const ms = recent.map((frame) => frame.ms);
    const memory = memoryOf(scene);
    const lines = [
        `${state.art ? "Bellhaven" : "Bellhaven's walk (no licensed models here)"}, ${state.quality.label}`,
        `frame ${(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)).toFixed(1)} ms (95%: ${percentile(ms, 0.95).toFixed(1)} ms), ${Math.round(1000 / Math.max(1, ms.reduce((a, b) => a + b, 0) / (ms.length || 1)))} fps`,
        `draw calls ${info.calls}, triangles ${info.triangles.toLocaleString()}`,
        `GPU: textures ${megabytes(memory.textures)}, geometry ${megabytes(memory.geometry)}`,
        `cells drawn ${state.cells.filter((cell) => cell.shown >= 0).length} of ${state.cells.length}, blocks ${state.blocks.filter((block) => block.group.visible).length} of ${state.blocks.length}`,
    ];

    ui.stats.textContent = lines.join("\n");
    window.castleLab = { ...window.castleLab, calls: info.calls, triangles: info.triangles, memory, frameMs: ms.at(-1) ?? 0 };
}

function startRun() {
    state.along = 0;
    state.running = { started: performance.now(), frames: [] };
    ui.run.disabled = true;
    ui.result.textContent = "Walking from the bridge to the keep's doors…";
}

function finishRun() {
    const { frames, started } = state.running;
    const ms = frames.map((frame) => frame.ms);
    const memory = memoryOf(scene);
    const result = {
        device: navigator.userAgent,
        quality: state.quality.label,
        pixelRatio: renderer.getPixelRatio(),
        detail: state.detail,
        far: state.far,
        casters: state.casters,
        textures: ["as built", "half", "a quarter"][state.textures],
        seconds: Math.round((performance.now() - started) / 100) / 10,
        frames: frames.length,
        frameMs: { mean: Math.round((ms.reduce((a, b) => a + b, 0) / (ms.length || 1)) * 10) / 10, p95: Math.round(percentile(ms, 0.95) * 10) / 10, worst: Math.round(Math.max(...ms) * 10) / 10 },
        drawCalls: { mean: Math.round(frames.reduce((sum, frame) => sum + frame.calls, 0) / (frames.length || 1)), most: Math.max(...frames.map((frame) => frame.calls)) },
        triangles: { mean: Math.round(frames.reduce((sum, frame) => sum + frame.triangles, 0) / (frames.length || 1)), most: Math.max(...frames.map((frame) => frame.triangles)) },
        gpu: { textures: megabytes(memory.textures), geometry: megabytes(memory.geometry) },
    };

    state.running = null;
    ui.run.disabled = false;
    ui.result.textContent = JSON.stringify(result, null, 1);
    window.castleLab = { ...window.castleLab, run: result };
}

// --- The page -------------------------------------------------------------------------------

function applyQuality() {
    renderer.setPixelRatio(Math.min(state.quality.pixelRatio, window.devicePixelRatio || 1));
    sun.shadow.mapSize.set(state.quality.shadows, state.quality.shadows);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    resize();
}

function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;

    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
}

ui.quality.value = Object.keys(QUALITY).find((key) => QUALITY[key] === quality);
ui.quality.addEventListener("change", () => {
    state.quality = QUALITY[ui.quality.value];
    applyQuality();
});
ui.detail.addEventListener("change", () => (state.detail = ui.detail.value));
ui.far.addEventListener("change", () => {
    state.far = ui.far.value;
    makeBlocks();
});
ui.textures.addEventListener("change", () => {
    state.textures = Number(ui.textures.value);
    sizeTextures(scene, state.textures);
});
ui.shadows.addEventListener("change", () => (renderer.shadowMap.enabled = ui.shadows.checked));
ui.casters.addEventListener("change", () => {
    state.casters = ui.casters.value;
    castShadows();
});
ui.camera.addEventListener("change", () => {
    controls.enabled = ui.camera.value === "free";

    if (controls.enabled) {
        controls.target.copy(walker.position);
    }
});
ui.run.addEventListener("click", startRun);
window.addEventListener("resize", resize);

let last = performance.now();

function frame(now) {
    const seconds = Math.min(0.1, (now - last) / 1000);
    const ms = now - last;

    last = now;

    if (state.path.length && !controls.enabled) {
        walkTo(seconds);
    } else {
        controls.update();
    }

    showDetail();

    // (The sun's shadow over what's looked at)
    const focus = controls.enabled ? controls.target : walker.position;

    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(sunFrom, 150);

    renderer.info.reset();
    renderer.render(scene, camera);

    const info = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };

    state.frames.push({ ms, ...info });
    state.frames.splice(0, Math.max(0, state.frames.length - 600));
    state.running?.frames.push({ ms, ...info });
    state.drawn++;

    // (Each frame's numbers for a test to read; the panel's every few frames)
    Object.assign(window.castleLab, { frame: state.drawn, ...info });

    if (state.drawn % 15 === 0) {
        showStats(info);
    }

    requestAnimationFrame(frame);
}

async function start() {
    applyQuality();
    ui.status.textContent = "Reading the castle's walk…";
    state.walk = await loadWalk();
    state.path = walkPath(state.walk);
    walkTo(0);

    const started = performance.now();
    const url = filesOf(ASSETS, CASTLE.entry, document.baseURI)[CASTLE.file];

    ui.status.textContent = "Downloading the castle…";

    try {
        const gltf = await loadGltf(url);

        scene.add(gltf.scene);
        state.cells = cellsOf(gltf.scene);
        state.casters = ui.casters.value;
        castShadows();
        state.far = ui.far.value;
        makeBlocks();
        state.art = true;
        ui.status.textContent = `The castle: ${state.cells.length} cells, read in ${((performance.now() - started) / 1000).toFixed(1)} s`;
    } catch (error) {
        scene.add(standIn(state.walk));
        ui.status.textContent = `No licensed models here (${error.message}): the castle's walk, drawn a block a square`;
    }

    // (`goTo(share)`: the walker put that share of the way along, for a test or a measurement)
    window.castleLab = {
        ready: true,
        art: state.art,
        cells: state.cells.length,
        path: state.path.length,
        squares: state.walk.levels.map((level) => level.squares),
        goTo: (share) => (state.along = Math.max(0, Math.min(0.999, share)) * (state.path.length - 1)),
        // (What's drawn: each cell drawn, at which detail and with how many triangles)
        drawn: () =>
            state.cells
                .filter((cell) => cell.shown >= 0)
                .map((cell) => {
                    let triangles = 0;

                    cell.levels[cell.shown].traverse((part) => part.isMesh && (triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3));

                    return { cell: cell.name, level: cell.shown, triangles, reach: Math.round(cell.box.distanceToPoint(camera.position)) };
                }),
    };
    requestAnimationFrame(frame);
}

start().catch((error) => {
    ui.status.textContent = `Couldn't start: ${error.message}`;
    window.castleLab = { ready: false, error: error.message };
});
