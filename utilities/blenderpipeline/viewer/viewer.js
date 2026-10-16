// The viewer: loads a built GLB with Three.js r186 (the game's version), as the game would (with
// the meshopt decoder), and plays its clips. ?file=dist/dragon.glb picks one; ?test leaves it
// still, for the browser tests (test/browser.spec.js) to drive through window.viewer. KTX2
// textures are read as the game reads them (KTX2Loader and the Basis transcoder); a model with
// its lower-detail meshes packed in shows the full one, or the level `lod(level)` asks for.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

const params = new URLSearchParams(location.search);
const testing = params.has("test");
const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !testing, preserveDrawingBuffer: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 2000);
const controls = new OrbitControls(camera, canvas);
const grid = new THREE.GridHelper(20, 20, 0x3a3f47, 0x262a30);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
const ktx2 = new KTX2Loader().setTranscoderPath("/node_modules/three/examples/jsm/libs/basis/").detectSupport(renderer);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
const timer = new THREE.Timer();
const BACKGROUND = new THREE.Color(0x15171a);

let model = null;
let rest = new Map();
let mixer = null;
let clips = [];
let playing = null;
let skeleton = null;
let speed = 1;

scene.background = BACKGROUND;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
scene.add(new THREE.HemisphereLight(0xdde6ff, 0x3a3020, 1.6), sun, grid);
sun.position.set(3, 6, 4);

function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;

    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
}

function meshes() {
    const found = [];

    model?.traverse((node) => node.isMesh && node.visible && found.push(node));

    return found;
}

/** Loads a GLB (a URL), framing it in view. Resolves with what's in it (info). */
async function load(url) {
    if (model) {
        scene.remove(model);
        scene.remove(skeleton);
    }

    const gltf = await loader.loadAsync(url);

    model = gltf.scene;
    clips = gltf.animations;
    lod(0);

    // Every node's own transform, its rest pose. (Not skeleton.pose(): once a skinned mesh is
    // quantized its inverse bind matrices carry the quantization, and its bind pose isn't its
    // rest pose any more)
    rest = new Map();
    model.traverse((node) => rest.set(node, [node.position.clone(), node.quaternion.clone(), node.scale.clone()]));
    mixer = new THREE.AnimationMixer(model);
    playing = null;
    scene.add(model);
    model.updateMatrixWorld(true);
    skeleton = new THREE.SkeletonHelper(model);
    skeleton.visible = document.getElementById("skeleton")?.checked ?? false;
    scene.add(skeleton);

    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    const centre = box.getCenter(new THREE.Vector3());

    camera.position.copy(centre).add(new THREE.Vector3(0.9, 0.55, 1.1).multiplyScalar(size * 0.9));
    camera.near = size / 200;
    camera.far = size * 20;
    camera.updateProjectionMatrix();
    controls.target.copy(centre);
    controls.update();
    grid.scale.setScalar(Math.max(0.1, size / 10));
    showClips();
    await showStats(url);

    return info();
}

/** Shows one level of detail of a model whose lower-detail meshes are packed in (0: the full one). */
function lod(level = 0) {
    model?.traverse((node) => {
        if (node.isMesh) {
            node.visible = (node.userData.lod ?? 0) === level;
        }
    });
}

/** What's loaded: its clips, draw calls, bones, materials and nodes. */
function info() {
    const found = meshes();
    const materials = [...new Set(found.flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])))];
    const skinned = found.find((mesh) => mesh.isSkinnedMesh);

    return {
        clips: clips.map((clip) => ({ name: clip.name, seconds: clip.duration })),
        drawCalls: found.length,
        skinned: Boolean(skinned),
        bones: skinned ? skinned.skeleton.bones.length : 0,
        materials: materials.map((material) => ({
            name: material.name,
            type: material.type,
            color: material.color.toArray(),
            map: Boolean(material.map),
            normalMap: Boolean(material.normalMap),
            roughnessMap: Boolean(material.roughnessMap),
            aoMap: Boolean(material.aoMap),
            emissiveMap: Boolean(material.emissiveMap),
        })),
        nodes: (() => {
            const names = [];

            model.traverse((node) => node !== model && names.push(node.name));

            return names;
        })(),
    };
}

/**
 * Holds it still at a moment of a clip (or at rest, with no clip): where its vertices reach
 * (the box round them, in the world) and where each bone is.
 */
function pose(name = null, time = 0) {
    mixer.stopAllAction();

    for (const [node, [position, quaternion, scale]] of rest) {
        node.position.copy(position);
        node.quaternion.copy(quaternion);
        node.scale.copy(scale);
    }

    if (name) {
        const clip = clips.find((one) => one.name === name);

        if (!clip) {
            throw new Error(`no clip ${name}`);
        }

        const action = mixer.clipAction(clip);

        action.reset().setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        mixer.setTime(Math.min(time, clip.duration));
    }

    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model, true);
    const bones = {};

    model.traverse((node) => {
        if (node.isBone) {
            bones[node.name] = node.getWorldPosition(new THREE.Vector3()).toArray();
        }
    });

    return { min: box.min.toArray(), max: box.max.toArray(), bones };
}

/** Draws a frame; returns the share of the picture the model covers (the grid hidden). */
function coverage() {
    grid.visible = false;
    skeleton.visible = false;
    renderer.render(scene, camera);
    grid.visible = true;

    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    const background = BACKGROUND.clone().convertLinearToSRGB().toArray().map((v) => Math.round(v * 255));
    let covered = 0;

    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    for (let i = 0; i < pixels.length; i += 4) {
        if (Math.abs(pixels[i] - background[0]) + Math.abs(pixels[i + 1] - background[1]) + Math.abs(pixels[i + 2] - background[2]) > 12) {
            covered++;
        }
    }

    return covered / (width * height);
}

/** Draws a frame; the colour (sRGB, 0 to 255) drawn where a point in the world is seen. */
function colourAt(point) {
    grid.visible = false;
    skeleton.visible = false;
    renderer.render(scene, camera);
    grid.visible = true;

    const gl = renderer.getContext();
    const seen = new THREE.Vector3(...point).project(camera);
    const x = Math.round(((seen.x + 1) / 2) * gl.drawingBufferWidth);
    const y = Math.round(((seen.y + 1) / 2) * gl.drawingBufferHeight);
    const pixel = new Uint8Array(4);

    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    return [...pixel];
}

/** The colours (sRGB, 0 to 255) of a material's texture at UV points ([[u, v]]). */
function sampleTexture(uvs, { slot = "map", material = 0 } = {}) {
    const materials = [...new Set(meshes().map((mesh) => mesh.material))];
    // (A material by its place, or by its name)
    const texture = (typeof material === "string" ? materials.find((one) => one.name === material) : materials[material])[slot];

    if (!texture) {
        throw new Error(`material ${material} has no ${slot}`);
    }

    if (texture.isCompressedTexture || texture.isDataTexture) {
        return sampleOnGpu(texture, uvs);
    }

    const { image } = texture;
    const flat = document.createElement("canvas");

    flat.width = image.width;
    flat.height = image.height;

    const context = flat.getContext("2d", { willReadFrequently: true });

    context.drawImage(image, 0, 0);

    const { data } = context.getImageData(0, 0, image.width, image.height);

    // (glTF's UVs start at the image's top left; Three.js keeps them so: flipY is false)
    return uvs.map(([u, v]) => {
        const x = Math.min(image.width - 1, Math.max(0, Math.floor(u * image.width)));
        const y = Math.min(image.height - 1, Math.max(0, Math.floor(v * image.height)));
        const at = (y * image.width + x) * 4;

        return [data[at], data[at + 1], data[at + 2], data[at + 3]];
    });
}

/**
 * A texture the GPU keeps compressed (KTX2) sampled where it's drawn from: copied, as it is, onto
 * a target the size of its largest level, and read back. Colour textures come back sRGB, as an
 * image's pixels would.
 */
function sampleOnGpu(texture, uvs) {
    const { width, height } = texture.image.width ? texture.image : texture.mipmaps[0];
    const target = new THREE.WebGLRenderTarget(width, height);
    const srgb = texture.colorSpace === THREE.SRGBColorSpace;
    const copy = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
            uniforms: { map: { value: texture } },
            vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
            // (Read as the GPU decodes it: linear for an sRGB texture, so made sRGB again here)
            fragmentShader: `uniform sampler2D map; varying vec2 vUv;
                vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
                void main() { vec4 c = texture2D(map, vUv); gl_FragColor = vec4(${srgb ? "toSrgb(c.rgb)" : "c.rgb"}, c.a); }`,
        }),
    );
    const pixels = new Uint8Array(width * height * 4);

    // (Drawn whatever the camera's looking at: the shader puts it over the whole target)
    copy.frustumCulled = false;
    renderer.setRenderTarget(target);
    renderer.render(copy, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    renderer.setRenderTarget(null);
    target.dispose();
    copy.geometry.dispose();
    copy.material.dispose();

    // (Row 0 read back is the plane's bottom, drawn from the texture's first row, its top: glTF's
    // v = 0, as a texture not flipped, as compressed ones never are, has it)
    return uvs.map(([u, v]) => {
        const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
        const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
        const at = (y * width + x) * 4;

        return [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]];
    });
}

/** Every triangle of the first mesh at rest: its middle in the world, and its UVs' middle. */
function triangles() {
    pose(null);

    const mesh = meshes()[0];
    const geometry = mesh.geometry;
    const uv = geometry.getAttribute("uv");
    const index = geometry.getIndex();
    const count = index ? index.count : geometry.getAttribute("position").count;
    const corner = new THREE.Vector3();
    const found = [];

    for (let i = 0; i < count; i += 3) {
        const middle = new THREE.Vector3();
        const middleUv = [0, 0];

        for (let k = 0; k < 3; k++) {
            const vertex = index ? index.getX(i + k) : i + k;

            mesh.getVertexPosition(vertex, corner);
            middle.add(corner.applyMatrix4(mesh.matrixWorld));
            middleUv[0] += uv.getX(vertex) / 3;
            middleUv[1] += uv.getY(vertex) / 3;
        }

        found.push({ position: middle.divideScalar(3).toArray(), uv: middleUv });
    }

    return found;
}

function play(name) {
    mixer.stopAllAction();
    playing = name;

    if (name) {
        mixer.clipAction(clips.find((clip) => clip.name === name)).reset().play();
    } else {
        pose(null);
    }

    for (const button of document.querySelectorAll("#clips button")) {
        button.setAttribute("aria-pressed", String(button.dataset.clip === (name ?? "")));
    }
}

function showClips() {
    const list = document.getElementById("clips");

    list.replaceChildren();

    for (const name of ["", ...clips.map((clip) => clip.name)]) {
        const button = document.createElement("button");

        button.textContent = name ? `${name} (${clips.find((clip) => clip.name === name).duration.toFixed(2)} s)` : "Rest pose";
        button.dataset.clip = name;
        button.addEventListener("click", () => play(name || null));
        list.append(button);
    }

    play(clips[0]?.name ?? null);
}

async function showStats(url) {
    const stats = document.getElementById("stats");
    const response = await fetch(url.replace(/(\.lod\d+)?\.glb$/, ".report.json")).catch(() => null);

    if (!response?.ok) {
        stats.textContent = "(no report beside it)";
        return;
    }

    const report = await response.json();
    const { meshes: drawn, textures } = report;

    stats.textContent = [
        `${report.kilobytes} KB, ${report.compression}`,
        `${drawn.triangles} triangles, ${drawn.drawCalls} draw call(s)`,
        drawn.skinned ? `${drawn.joints} joints` : "not skinned",
        `${textures.length} texture(s)${textures.map((t) => `\n  ${t.width}x${t.height} ${t.mimeType}`).join("")}`,
        `size ${report.bounds.rest.size.map((v) => v.toFixed(2)).join(" x ")} m`,
        ...report.clips.map((clip) => `${clip.name}: ${clip.seconds.toFixed(2)} s${clip.loops ? ", loops" : ""}${clip.rootMotion?.distance > 0.01 ? `, ${clip.rootMotion.speed.toFixed(2)} m/s${clip.inPlace ? " (taken out)" : ""}` : ""}`),
        ...report.warnings.map((warning) => `warning: ${warning}`),
    ].join("\n");
}

async function chooseModels() {
    const select = document.getElementById("models");
    const models = await fetch("/models.json")
        .then((response) => response.json())
        .catch(() => []);
    const wanted = params.get("file") ?? models[0];

    for (const file of new Set([...models, ...(wanted ? [wanted] : [])])) {
        select.append(new Option(file, file, false, file === wanted));
    }

    select.addEventListener("change", () => load(`/${select.value}`));

    if (wanted && !testing) {
        await load(`/${wanted}`);
    }
}

document.getElementById("skeleton").addEventListener("change", (event) => {
    if (skeleton) {
        skeleton.visible = event.target.checked;
    }
});
document.getElementById("speed").addEventListener("input", (event) => {
    speed = Number(event.target.value);
});
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop((now) => {
    timer.update(now);

    if (!testing && mixer && playing) {
        mixer.update(timer.getDelta() * speed);
    }

    controls.update();
    renderer.render(scene, camera);
});

/** Each texture of the shown meshes: which it is, what it was read from, how it's kept on the GPU. */
function textureKinds() {
    const found = new Set();

    for (const mesh of meshes()) {
        for (const slot of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"]) {
            if (mesh.material[slot]) {
                found.add(mesh.material[slot]);
            }
        }
    }

    return [...found].map((texture) => ({ id: texture.uuid, mimeType: texture.userData.mimeType ?? null, compressed: Boolean(texture.isCompressedTexture), data: Boolean(texture.isDataTexture) }));
}

/**
 * Puts a variant on the model loaded (a URL: the pipeline's <name>.<variant>.glb, materials alone):
 * its materials' textures on copies of the model's materials of the same names. Resolves with the
 * maps each material was given: { material: ["map", ...] }.
 */
async function look(url) {
    const gltf = await loader.loadAsync(url);
    const materials = await gltf.parser.getDependencies("material");
    const maps = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];
    const given = {};

    model.traverse((node) => {
        const own = node.isMesh && materials.find((material) => material.name === node.material.name);

        if (own) {
            node.material = node.material.clone();
            given[own.name] = maps.filter((map) => own[map]);

            for (const map of given[own.name]) {
                node.material[map] = own[map];
            }
        }
    });

    return given;
}

window.viewer = { load, look, info, pose, coverage, colourAt, sampleTexture, triangles, resize, lod, textureKinds };
await chooseModels();
window.viewerReady = true;
