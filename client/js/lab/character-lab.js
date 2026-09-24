// The character lab (character-lab.html): build a hero or an orc, change how they look, dress
// and arm them, and watch them walk.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ClipPlayer, parseBVH, retarget } from "../characters/bvh.js";
import { Character } from "../characters/character.js";
import { DETAILS } from "../characters/details.js";
import { EQUIPMENT, SLOTS } from "../characters/equipment.js";
import { cadence, CURVES, curveAt, PELVIC_TILT, phaseName, strideLength, walkToRunSpeed } from "../characters/gait.js";
import { BEARDS, HAIRSTYLES } from "../characters/hair.js";
import { loadCharacterKit } from "../characters/kit.js";
import { Walker, WALK_STYLES } from "../characters/locomotion.js";
import { MACRO_DEFAULTS } from "../characters/macro.js";
import { PRESETS } from "../characters/presets.js";
import { EYE_DEFAULTS, HAIR_COLOURS, SKIN_DEFAULTS, SKIN_TONES } from "../characters/skin.js";

const canvas = document.querySelector("#view");
const status = document.querySelector("#status");
const stats = document.querySelector("#stats");
const params = new URLSearchParams(location.search);

// --- The scene ---

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();

scene.background = new THREE.Color(0x1b2229);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const sun = new THREE.DirectionalLight(0xfff1dc, 1.9);

sun.position.set(2.5, 5, 3.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x3a3025, 0.55));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);

controls.enableDamping = true;
controls.minDistance = 0.4;
controls.maxDistance = 14;

function groundTexture() {
    const size = 256;
    const texture = document.createElement("canvas");
    const context = texture.getContext("2d");

    texture.width = texture.height = size;
    context.fillStyle = "#3a4148";
    context.fillRect(0, 0, size, size);
    context.strokeStyle = "#4a535c";
    context.lineWidth = 2;
    context.strokeRect(0, 0, size, size);
    context.strokeStyle = "#424a52";
    context.lineWidth = 1;

    for (let i = 1; i < 4; i++) {
        context.beginPath();
        context.moveTo((i * size) / 4, 0);
        context.lineTo((i * size) / 4, size);
        context.moveTo(0, (i * size) / 4);
        context.lineTo(size, (i * size) / 4);
        context.stroke();
    }

    const map = new THREE.CanvasTexture(texture);

    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(40, 40);
    map.anisotropy = 8;
    map.colorSpace = THREE.SRGBColorSpace;

    return map;
}

function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    const ratio = renderer.getPixelRatio();

    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
}

// --- The character ---

const kit = await loadCharacterKit();
const clone = (value) => structuredClone(value);
const state = {
    preset: PRESETS[params.get("character")] ? params.get("character") : "hero",
    shape: null,
    look: null,
    equipment: null,
    walk: null,
    motion: { speed: Number(params.get("speed") ?? 1.2), path: "straight", moving: params.get("speed") !== "0", paused: false, skeleton: false, clip: params.get("clip") ?? "", limits: true },
    camera: "orbit",
};

function presetState(name) {
    const preset = PRESETS[name];

    state.preset = name;
    state.shape = { macro: { ...MACRO_DEFAULTS, ...clone(preset.shape.macro) }, details: clone(preset.shape.details ?? {}) };
    state.look = { skin: { ...SKIN_DEFAULTS, ...clone(preset.look.skin) }, eyes: { ...EYE_DEFAULTS, ...clone(preset.look.eyes) }, hair: clone(preset.look.hair) };
    state.equipment = [...preset.equipment];
    state.walk = preset.walk;
}

presetState(state.preset);

const character = new Character(kit, { shape: state.shape, look: state.look, equipment: state.equipment });
const walker = new Walker(character, WALK_STYLES[state.walk]);
const skeletonHelper = new THREE.SkeletonHelper(character.rig.root);

skeletonHelper.visible = false;
scene.add(character.object, skeletonHelper);
status.hidden = true;

// Changes are applied at most once a frame, the latest winning (rebuilding a body takes a while)
const pending = new Set();

function change(...what) {
    for (const item of what) {
        pending.add(item);
    }
}

function applyChanges() {
    if (pending.has("shape")) {
        character.setShape(state.shape);
        walker.measure();
    }

    if (pending.has("look")) {
        character.setLook(state.look);
    }

    if (pending.has("equipment")) {
        character.setEquipment(state.equipment);
    }

    if (pending.has("walk")) {
        walker.setStyle(WALK_STYLES[state.walk]);
    }

    // A clip is fitted to the body, so fit it again when the body changes
    if (pending.has("shape") || pending.has("clip")) {
        chooseClip(state.motion.clip);
    }

    if (pending.size) {
        refreshReadouts();
    }

    pending.clear();
}

// --- Motion ---

const timer = new THREE.Timer();

// Motion capture clips (MakeHuman's, CC0), retargeted to the body when chosen
const CLIPS = { walk: "Walk (MakeHuman mocap)", "zombie-walk": "Zombie walk (MakeHuman mocap)" };
const clipFiles = new Map();
let player = null;

async function chooseClip(name) {
    state.motion.clip = name;
    player = null;

    if (!name) {
        return;
    }

    if (!clipFiles.has(name)) {
        clipFiles.set(name, parseBVH(await (await fetch(`characters/animations/${name}.bvh`)).text()));
    }

    if (state.motion.clip === name) {
        player = new ClipPlayer(character, retarget(clipFiles.get(name), character.rig, { limit: state.motion.limits }), walker);
    }
}

function step(dt) {
    const object = character.object;
    const before = object.position.clone();
    const speed = state.motion.moving ? state.motion.speed : 0;

    if (state.motion.path === "circle" && (speed > 0 || player)) {
        object.rotation.y += ((player?.speed ?? speed) / 3) * dt;
    }

    if (player && state.motion.moving) {
        player.update(dt);
    } else {
        walker.update(dt, { speed });
    }

    // The camera follows the character
    const moved = object.position.clone().sub(before);

    camera.position.add(moved);
    controls.target.add(moved);

    // Bring everything back near the middle now and then, by whole metres (so the ground's grid
    // doesn't jump)
    if (Math.abs(object.position.x) > 8 || Math.abs(object.position.z) > 8) {
        const shift = new THREE.Vector3(Math.round(object.position.x), 0, Math.round(object.position.z));

        object.position.sub(shift);
        camera.position.sub(shift);
        controls.target.sub(shift);
        walker.shift(shift);
    }
}

function setCamera(mode) {
    state.camera = mode;

    const target = character.object.position.clone().add(new THREE.Vector3(0, character.height * 0.55, 0));

    // The game's view is from high up, looking down at about 55 degrees, from further away
    camera.fov = mode === "game" ? 22 : 35;
    camera.position.copy(target).add(mode === "game" ? new THREE.Vector3(0, 7.5, 5.2) : new THREE.Vector3(0.9, 0.5, 3.8));
    controls.target.copy(target);
    camera.updateProjectionMatrix();
    controls.update();
}

setCamera("orbit");

let frames = 0;
let fpsTime = performance.now();

renderer.setAnimationLoop((time) => {
    timer.update(time);

    // (The first frame can be timed from before the timer started)
    const dt = Math.min(0.05, Math.max(0, timer.getDelta()));

    applyChanges();

    if (!state.motion.paused) {
        step(dt);
    }

    resize();
    controls.update();
    renderer.render(scene, camera);
    drawGait();

    frames++;

    if (time - fpsTime > 500) {
        const info = renderer.info.render;

        stats.textContent = `${((frames * 1000) / (time - fpsTime)).toFixed(0)} fps · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k triangles`;
        frames = 0;
        fpsTime = time;
    }
});

// --- The settings panel ---

const tabs = document.querySelector("#tabs");
const panels = document.querySelector("#tabpanels");
const refreshers = [];
let controlId = 0;

function element(tag, attributes = {}, ...children) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attributes)) {
        if (key === "class") {
            node.className = value;
        } else if (key.startsWith("on")) {
            node.addEventListener(key.slice(2), value);
        } else if (value !== undefined && value !== false) {
            node.setAttribute(key, value === true ? "" : value);
        }
    }

    node.append(...children.filter((child) => child !== null && child !== undefined));

    return node;
}

/** A labelled slider: `get()` reads its value, `set(value)` changes it. */
function slider(label, { min, max, step = 0.01, get, set, format = (value) => value.toFixed(2), enabled = () => true, title }) {
    const id = `control${controlId++}`;
    const output = element("output", { for: id }, format(get()));
    const input = element("input", {
        type: "range", id, min, max, step, value: get(),
        oninput: () => {
            set(Number(input.value));
            output.textContent = format(Number(input.value));
        },
    });
    const row = element("div", { class: "row", ...(title ? { title } : {}) }, element("label", { for: id }, label), input, output);
    const enable = () => {
        input.disabled = !enabled();
        row.classList.toggle("disabled", input.disabled);
    };

    enable();
    refreshers.push(() => {
        input.value = get();
        output.textContent = format(get());
        enable();
    });

    return row;
}

function select(label, options, { get, set }) {
    const id = `control${controlId++}`;
    const input = element("select", { id, onchange: () => set(input.value) }, ...options.map(([value, text]) => element("option", { value }, text)));

    input.value = get();
    refreshers.push(() => (input.value = get()));

    return element("div", { class: "row" }, element("label", { for: id }, label), input);
}

/** A colour: swatches to pick from, and a colour input for any other. */
function colour(label, swatches, { get, set }) {
    const id = `control${controlId++}`;
    const same = (a, b) => new THREE.Color(a).getHex() === new THREE.Color(b).getHex();
    const buttons = Object.entries(swatches).map(([name, value]) => element("button", {
        type: "button", title: name, "aria-label": name, style: `background:${value}`, "data-value": value,
        onclick: () => {
            set(value);
            refresh();
        },
    }));
    const custom = element("input", { type: "color", id, value: get() ?? "#000000", oninput: () => set(custom.value) });
    const refresh = () => {
        custom.value = get() ?? "#000000";

        for (const button of buttons) {
            button.setAttribute("aria-pressed", String(same(button.dataset.value, get() ?? "#000000")));
        }
    };

    refresh();
    refreshers.push(refresh);

    return [
        element("div", { class: "row" }, element("label", { for: id }, label), custom),
        element("div", { class: "row" }, element("span"), element("div", { class: "swatches" }, ...buttons)),
    ];
}

function check(label, { get, set }) {
    const input = element("input", { type: "checkbox", onchange: () => set(input.checked) });

    input.checked = get();
    refreshers.push(() => (input.checked = get()));

    return element("label", { class: "check" }, input, label);
}

function group(title, ...children) {
    return element("section", { class: "group" }, element("h2", {}, title), ...children.flat());
}

function refreshControls() {
    for (const refresh of refreshers) {
        refresh();
    }

    refreshReadouts();
}

const tabList = [
    ["body", "Body", bodyTab],
    ["face", "Face", faceTab],
    ["look", "Look", lookTab],
    ["gear", "Gear", gearTab],
    ["motion", "Motion", motionTab],
];

for (const [id, label, build] of tabList) {
    const panel = element("div", { role: "tabpanel", id: `panel-${id}`, "aria-labelledby": `tab-${id}` }, ...build());
    const tab = element("button", { type: "button", role: "tab", id: `tab-${id}`, "aria-controls": `panel-${id}`, onclick: () => selectTab(id) }, label);

    tabs.append(tab);
    panels.append(panel);
}

function selectTab(id) {
    for (const [tab] of tabList) {
        document.querySelector(`#tab-${tab}`).setAttribute("aria-selected", String(tab === id));
        document.querySelector(`#panel-${tab}`).hidden = tab !== id;
    }
}

selectTab(tabList.some(([id]) => id === params.get("tab")) ? params.get("tab") : "body");

// Show the character's settings in every control (the equipment slots especially)
for (const refresh of refreshers) {
    refresh();
}

// Character and camera pickers
const picker = document.querySelector("#characterpicker");

function choosePreset(name) {
    presetState(name);
    change("shape", "look", "equipment", "walk");
    refreshControls();

    for (const button of picker.children) {
        button.setAttribute("aria-checked", String(button.dataset.preset === name));
    }
}

for (const [name, preset] of Object.entries(PRESETS)) {
    picker.append(element("button", { type: "button", role: "radio", "data-preset": name, "aria-checked": String(name === state.preset), onclick: () => choosePreset(name) }, preset.label));
}

for (const button of document.querySelectorAll("#camerapicker button")) {
    button.addEventListener("click", () => {
        setCamera(button.dataset.camera);

        for (const other of document.querySelectorAll("#camerapicker button")) {
            other.setAttribute("aria-checked", String(other === button));
        }
    });
}

function bodyTab() {
    const macro = (key, label, format, options = {}) => slider(label, {
        min: 0, max: 1, format, ...options,
        get: () => state.shape.macro[key],
        set: (value) => {
            state.shape.macro[key] = value;
            change("shape");

            // The bust slider is only for female bodies
            if (key === "gender") {
                refreshControls();
            }
        },
    });
    const heritage = (key, label) => slider(label, {
        min: 0, max: 1,
        get: () => state.shape.macro[key],
        set: (value) => {
            // The three shares always add up to 1
            const others = ["african", "asian", "caucasian"].filter((other) => other !== key);
            const rest = others.reduce((sum, other) => sum + state.shape.macro[other], 0);

            state.shape.macro[key] = value;

            for (const other of others) {
                state.shape.macro[other] = rest > 0 ? (state.shape.macro[other] / rest) * (1 - value) : (1 - value) / 2;
            }

            change("shape");
            refreshControls();
        },
    });

    return [
        group("Build",
            macro("gender", "Gender", (value) => (value < 0.35 ? "female" : value > 0.65 ? "male" : "mixed")),
            macro("muscle", "Muscle"),
            macro("weight", "Weight"),
            macro("height", "Height"),
            macro("bust", "Bust", undefined, {
                title: "Cup size, for female bodies",
                enabled: () => state.shape.macro.gender < 0.9,
            }),
            element("p", { class: "note", id: "heightreadout" })),
        group("Heritage", heritage("african", "African"), heritage("asian", "Asian"), heritage("caucasian", "European")),
        group("Physique", ...detailSliders("body")),
        element("div", { class: "buttons" },
            element("button", {
                type: "button", class: "button",
                onclick: () => {
                    const preset = PRESETS[state.preset];

                    state.shape = { macro: { ...MACRO_DEFAULTS, ...clone(preset.shape.macro) }, details: clone(preset.shape.details ?? {}) };
                    change("shape");
                    refreshControls();
                },
            }, "Reset body"),
            element("button", {
                type: "button", class: "button",
                onclick: () => {
                    const random = Math.random;

                    Object.assign(state.shape.macro, { gender: random(), muscle: random(), weight: 0.2 + random() * 0.6, height: 0.25 + random() * 0.5, bust: 0.15 + random() * 0.7 });

                    for (const { id } of DETAILS) {
                        state.shape.details[id] = (random() - 0.5) * 1.2;
                    }

                    change("shape");
                    refreshControls();
                },
            }, "Random")),
    ];
}

function detailSliders(which) {
    return DETAILS.filter(({ group: g }) => g === which).map(({ id, label, decr }) => slider(label, {
        min: decr.length ? -1 : 0, max: 1,
        get: () => state.shape.details[id] ?? 0,
        set: (value) => {
            state.shape.details[id] = value;
            change("shape");
        },
    }));
}

function faceTab() {
    return [group("Face", ...detailSliders("face"))];
}

function lookTab() {
    const skin = (key, label, max = 1) => slider(label, {
        min: 0, max,
        get: () => state.look.skin[key] ?? 0,
        set: (value) => {
            state.look.skin[key] = value;
            change("look");
        },
    });
    const look = (part, key) => ({
        get: () => state.look[part][key],
        set: (value) => {
            state.look[part][key] = value;
            change("look");
        },
    });
    const skinFile = element("input", { type: "file", accept: "image/*", hidden: true, onchange: () => loadSkinImage(skinFile.files[0]) });

    return [
        group("Skin",
            colour("Tone", SKIN_TONES, look("skin", "tone")),
            skin("variation", "Blotchiness", 2),
            skin("blush", "Redness"),
            skin("freckles", "Freckles"),
            skin("warts", "Warts"),
            skin("veins", "Veins"),
            select("War paint", [["", "None"], ["#2b1712", "Black"], ["#8a1f1a", "Red"], ["#24406e", "Woad blue"], ["#d8d0bc", "Bone white"]], {
                get: () => state.look.skin.warpaint ?? "",
                set: (value) => {
                    state.look.skin.warpaint = value || null;
                    change("look");
                },
            })),
        group("Whole skin texture",
            element("p", { class: "note" }, "A skin is one image in MakeHuman's texture layout. Save this one to paint over, then load it back."),
            element("div", { class: "buttons" },
                element("button", { type: "button", class: "button", onclick: saveSkin }, "Save skin"),
                element("button", { type: "button", class: "button", onclick: () => skinFile.click() }, "Load skin…"),
                element("button", {
                    type: "button", class: "button",
                    onclick: () => {
                        state.look.skin.image = null;
                        change("look");
                    },
                }, "Painted skin")),
            skinFile),
        group("Eyes",
            colour("Iris", { brown: "#6a4a2c", hazel: "#7a6a3a", green: "#4f6b3a", blue: "#5a6f7e", grey: "#77807f", amber: "#d4a21c", red: "#a3261c" }, look("eyes", "iris")),
            slider("Pupil", { min: 0.15, max: 0.6, ...look("eyes", "pupil") }),
            check("Slit pupils", look("eyes", "slit"))),
        group("Hair",
            select("Hairstyle", Object.entries(HAIRSTYLES).map(([id, { label }]) => [id, label]), look("hair", "style")),
            select("Beard", Object.entries(BEARDS).map(([id, { label }]) => [id, label]), look("hair", "beard")),
            colour("Colour", HAIR_COLOURS, look("hair", "colour")),
            skin("brows", "Brows")),
    ];
}

function saveSkin() {
    character.skinCanvas.toBlob((blob) => {
        const link = element("a", { href: URL.createObjectURL(blob), download: `${state.preset}-skin.png` });

        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
}

async function loadSkinImage(file) {
    if (!file) {
        return;
    }

    const bitmap = await createImageBitmap(file);
    const size = Math.min(2048, bitmap.width);
    const scratch = new OffscreenCanvas(size, size);
    const context = scratch.getContext("2d");

    context.drawImage(bitmap, 0, 0, size, size);
    state.look.skin.image = context.getImageData(0, 0, size, size);
    change("look");
}

function gearTab() {
    const outfits = {
        Adventurer: ["briefs", "shirt", "trousers", "boots", "belt", "jerkin", "sword", "roundShield", "backpack"],
        Knight: ["briefs", "shirt", "trousers", "sabatons", "belt", "mail", "breastplate", "gauntlets", "greaves", "nasalHelm", "sword", "kiteShield"],
        Mage: ["briefs", "chestWrap", "tunic", "breeches", "boots", "belt", "bracers", "staff", "wizardHat"],
        Ranger: ["briefs", "chestWrap", "shirt", "gambeson", "breeches", "boots", "belt", "gloves", "bow", "quiver"],
        Gunner: ["briefs", "shirt", "trousers", "boots", "belt", "jerkin", "pistol", "musket"],
        "Orc raider": ["loincloth", "breeches", "bracers", "belt", "sabatons", "tusks", "orcHelm", "sword", "roundShield"],
        Nothing: [],
    };
    const slots = SLOTS.map(({ id, label }) => {
        const options = Object.entries(EQUIPMENT).filter(([, entry]) => entry.slot === id);
        const input = element("select", {
            id: `slot-${id}`,
            onchange: () => {
                state.equipment = state.equipment.filter((other) => EQUIPMENT[other].slot !== id);

                if (input.value) {
                    state.equipment.push(input.value);
                }

                change("equipment");
            },
        }, element("option", { value: "" }, "—"), ...options.map(([value, entry]) => element("option", { value }, entry.label)));

        refreshers.push(() => (input.value = state.equipment.find((other) => EQUIPMENT[other].slot === id) ?? ""));

        return element("div", { class: "slot" }, element("label", { for: `slot-${id}` }, label), input);
    });

    return [
        group("Outfits", element("div", { class: "buttons" }, ...Object.entries(outfits).map(([name, ids]) => element("button", {
            type: "button", class: "button",
            onclick: () => {
                state.equipment = [...ids];
                change("equipment");
                refreshControls();
            },
        }, name)))),
        group("Slots", element("p", { class: "note" }, "Clothing and armour are fitted to the body and bend with it; weapons, shields, helmets and packs sit on sockets on the bones."), ...slots),
    ];
}

function motionTab() {
    const chart = element("canvas", { id: "gaitchart", width: 600, height: 300, "aria-label": "Joint angles through one stride, with where the left leg is now" });

    return [
        group("Walking",
            check("Walk", { get: () => state.motion.moving, set: (value) => (state.motion.moving = value) }),
            slider("Speed", {
                min: 0.2, max: 2.1, step: 0.05, format: (value) => `${value.toFixed(2)} m/s`,
                get: () => state.motion.speed,
                set: (value) => {
                    state.motion.speed = value;
                    refreshReadouts();
                },
            }),
            select("Path", [["straight", "Straight"], ["circle", "In a circle"]], { get: () => state.motion.path, set: (value) => (state.motion.path = value) }),
            select("Walk style", Object.keys(WALK_STYLES).map((name) => [name, name[0].toUpperCase() + name.slice(1)]), {
                get: () => state.walk,
                set: (value) => {
                    state.walk = value;
                    change("walk");
                },
            }),
            element("p", { class: "note", id: "gaitreadout" })),
        group("Motion capture",
            element("p", { class: "note" }, "Instead of the walk made from gait data, play a recorded clip, retargeted to this body."),
            select("Clip", [["", "None: procedural walk"], ...Object.entries(CLIPS)], {
                get: () => state.motion.clip,
                set: (value) => {
                    state.motion.clip = value;
                    change("clip");
                },
            }),
            check("Keep joints within their range", {
                get: () => state.motion.limits,
                set: (value) => {
                    state.motion.limits = value;
                    change("clip");
                },
            })),
        group("Stride", chart, element("p", { class: "note", id: "phasereadout" })),
        group("View",
            check("Skeleton", {
                get: () => state.motion.skeleton,
                set: (value) => {
                    state.motion.skeleton = value;
                    skeletonHelper.visible = value;
                },
            }),
            check("Pause", { get: () => state.motion.paused, set: (value) => (state.motion.paused = value) }),
            element("div", { class: "buttons" }, element("button", { type: "button", class: "button", onclick: () => step(1 / 30) }, "Step"))),
    ];
}

function refreshReadouts() {
    const height = document.querySelector("#heightreadout");
    const gait = document.querySelector("#gaitreadout");
    const leg = walker.legLength;

    if (height) {
        height.textContent = `${Math.round(character.height * 100)} cm tall, legs ${Math.round(leg * 100)} cm`;
    }

    if (gait) {
        const speed = state.motion.speed;

        gait.textContent = `${Math.round(cadence(speed, leg))} steps a minute, ${strideLength(speed, leg).toFixed(2)} m strides (from the walk ratio). People break into a run at about ${walkToRunSpeed(leg).toFixed(1)} m/s.`;
    }
}

refreshReadouts();

// The gait chart: each joint's angle through a stride, and where the left leg is now
const chartCurves = [
    ["hipFlexion", "#e0a24a", -PELVIC_TILT],
    ["kneeFlexion", "#7cc4ff", 0],
    ["ankleDorsiflexion", "#9be07c", 0],
    ["shoulderFlexion", "#e07cc4", 0],
    ["pelvicRotation", "#c4c4c4", 0],
];
const legend = document.querySelector("#phasereadout");
let lastPhaseName = "";

function drawGait() {
    const chart = document.querySelector("#gaitchart");

    if (!chart || chart.closest("[hidden]")) {
        return;
    }

    const context = chart.getContext("2d");
    const { width, height } = chart;
    const top = 20;
    const bottom = height - 30;
    const y = (angle) => top + ((70 - angle) / 100) * (bottom - top);

    context.clearRect(0, 0, width, height);
    context.font = "20px system-ui, sans-serif";
    context.lineWidth = 1;
    context.strokeStyle = "#2d3843";

    for (let angle = -30; angle <= 70; angle += 20) {
        context.beginPath();
        context.moveTo(0, y(angle));
        context.lineTo(width, y(angle));
        context.stroke();
    }

    // Stance and swing
    context.fillStyle = "rgba(224, 162, 74, 0.08)";
    context.fillRect(0, top, width * 0.62, bottom - top);
    context.fillStyle = "#8a99a8";
    context.fillText("stance", 8, height - 8);
    context.fillText("swing", width * 0.64, height - 8);

    for (const [name, style, offset] of chartCurves) {
        context.strokeStyle = style;
        context.lineWidth = 3;
        context.beginPath();

        for (let x = 0; x <= width; x += 4) {
            context[x ? "lineTo" : "moveTo"](x, y(curveAt(CURVES[name], x / width) + offset));
        }

        context.stroke();
    }

    const x = walker.phase * width;

    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();

    const now = `Left foot: ${phaseName(walker.phase)}; right foot: ${phaseName(walker.phase + 0.5)}.`;

    if (legend && now !== lastPhaseName) {
        lastPhaseName = now;
        legend.replaceChildren(
            ...chartCurves.flatMap(([name, style], i) => [i ? " · " : "", element("span", { style: `color:${style}` }, "■"), ` ${CURVES[name].label}`]),
            element("br"),
            now,
        );
    }
}

window.lab = { THREE, scene, camera, controls, renderer, character, kit, walker, state, step, change, choosePreset, setCamera, chooseClip, get player() { return player; }, PRESETS, WALK_STYLES, ready: true };

if (state.motion.clip) {
    change("clip");
}
