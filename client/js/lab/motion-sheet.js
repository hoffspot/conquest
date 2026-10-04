// The motion check's contact sheet (motion-sheet.html): each failure in its report
// (scripts/motion-check.js), played again to the moment it was at its worst and drawn there, the
// spot marked in red, worst first: what's new (worse than the baseline) outlined amber, what was
// known red. The report is ?report=<its address>, else motion-report.json beside this page (the
// check leaves a copy there), else a file chosen. ?measure=, ?group=, ?people=, ?count=, ?new=1
// choose what's shown, ?close=1 draws each close up. Or a filmstrip of motions instead:
// ?film=<motion id>,<motion id>... on ?body= (a body's id; the first, if not given), ?frames= a
// row (8, if not given), from its start to its end, following the pelvis. window.sheet: { ready,
// shown } (for pictures and tests).

import * as THREE from "three";
import { loadHumanData } from "../characters/body.js";
import { BODIES, MEASURES, motions, play } from "../characters/motioncheck.js";

const params = new URLSearchParams(location.search);
const summary = document.querySelector("#summary");
const sheet = document.querySelector("#sheet");
const select = Object.fromEntries(["measure", "group", "people", "count"].map((id) => [id, document.querySelector(`#${id}`)]));
const fresh = document.querySelector("#new");
const close = document.querySelector("#close");
const file = document.querySelector("#file");

// Each figure's picture (pixels; drawn at twice that on a sharp screen)
const WIDTH = 240;
const HEIGHT = 300;

const all = new Map(motions().map((motion) => [motion.id, motion]));
const bodies = new Map(BODIES.map((body) => [body.id, body]));

for (const [kind, { label }] of Object.entries(MEASURES)) {
    select.measure.add(new Option(label[0].toUpperCase() + label.slice(1), kind));
}

for (const group of new Set([...all.values()].map(({ group }) => group))) {
    select.group.add(new Option(group, group));
}

for (const people of new Set(BODIES.map(({ people }) => people))) {
    select.people.add(new Option(people, people));
}

// (A choice the address makes that isn't offered leaves the control as it was, not blank)
for (const [id, control] of Object.entries(select)) {
    if ([...control.options].some(({ value }) => value === params.get(id))) {
        control.value = params.get(id);
    }
}

fresh.checked = params.get("new") === "1";
close.checked = params.get("close") === "1";

// --- Drawing a body as the check left it ---

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
const ratio = Math.min(2, window.devicePixelRatio || 1);

renderer.setPixelRatio(ratio);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, WIDTH / HEIGHT, 0.05, 50);
const skin = new THREE.MeshStandardMaterial({ color: 0xc9b29a, roughness: 0.8 });
const marker = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff2d2d, depthTest: false, transparent: true, opacity: 0.85 }));
const halo = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 32), new THREE.MeshBasicMaterial({ color: 0xff2d2d, depthTest: false, side: THREE.DoubleSide }));

scene.background = new THREE.Color(0x26303a);
scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x3a3028, 1.6));

const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);

sun.position.set(2, 4, 3);
scene.add(sun);

const grid = new THREE.GridHelper(4, 16, 0x56636f, 0x3a4652);
// (A faint floor under the grid: what's below the ground is seen through it, dimmed)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a99a8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));

grid.add(floor);
scene.add(grid);
marker.renderOrder = 10;
halo.renderOrder = 10;
scene.add(marker, halo);

// The body's skin, as the check posed it: the body's triangles, skinned by the check's skeleton
function bodyMesh(human, character) {
    const count = human.renderSource.length;
    const positions = new Float32Array(count * 3);
    const skinIndex = new Uint8Array(count * 4);
    const skinWeight = new Uint8Array(count * 4);
    const geometry = new THREE.BufferGeometry();

    human.renderSource.forEach((v, r) => {
        positions.set(character.positions.subarray(v * 3, v * 3 + 3), r * 3);
        skinIndex.set(human.skinIndices.subarray(v * 4, v * 4 + 4), r * 4);
        skinWeight.set(human.skinWeights.subarray(v * 4, v * 4 + 4), r * 4);
    });

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4, true));
    geometry.setIndex(new THREE.BufferAttribute(human.renderIndices("body"), 1));
    geometry.computeVertexNormals();

    const mesh = new THREE.SkinnedMesh(geometry, skin);

    character.object.add(mesh);
    mesh.bind(character.rig.skeleton, new THREE.Matrix4());
    mesh.frustumCulled = false;

    return mesh;
}

// One failure drawn: the motion played on its body to when it was at its worst (not measured again:
// the report says where), looked at from the side the spot is on, the spot marked; a canvas
function draw(human, { key, kind, t, at: spot }) {
    const [motionId, bodyId] = key.split("|");
    const played = play(human, all.get(motionId), bodies.get(bodyId), { until: t, every: Infinity });

    if (!played) {
        return null;
    }

    const { character } = played.dressed;
    const at = new THREE.Vector3().fromArray(spot ?? played.worst[kind]?.at ?? [0, 1, 0]);
    const mesh = bodyMesh(human, character);
    const centre = character.object.position.clone().setY(0.95);
    const side = at.clone().sub(centre).setY(0);
    // (From in front, swung towards the spot's side, a little above)
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(character.object.quaternion);
    const from = side.lengthSq() > 0.0025 ? side.normalize().add(facing.multiplyScalar(0.6)).normalize() : facing;

    scene.add(character.object);
    character.object.updateMatrixWorld(true);
    marker.position.copy(at);
    halo.position.copy(at);
    // (Close up: the spot from a metre off, marked by the ring alone, so what's at it shows)
    marker.visible = !close.checked;

    if (close.checked) {
        camera.position.copy(at).addScaledVector(from, 1).add(new THREE.Vector3(0, 0.15, 0));
        camera.lookAt(at);
    } else {
        camera.position.copy(centre).addScaledVector(from, 3.1).add(new THREE.Vector3(0, 0.35, 0));
        camera.lookAt(centre.x, (centre.y + at.y) / 2, centre.z);
    }

    halo.quaternion.copy(camera.quaternion);
    grid.position.set(character.object.position.x, 0.001, character.object.position.z);
    renderer.render(scene, camera);

    const canvas = document.createElement("canvas");

    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    canvas.getContext("2d").drawImage(renderer.domElement, 0, 0);
    scene.remove(character.object);
    mesh.geometry.dispose();

    return canvas;
}

// One frame of a filmstrip: `motion` played on `body` to `t` s, seen from in front and to its
// right (a right hand's weapon side), following the pelvis; a canvas
function still(human, motion, body, t) {
    const played = play(human, motion, body, { until: t, every: Infinity });

    if (!played) {
        return null;
    }

    const { character } = played.dressed;
    const mesh = bodyMesh(human, character);

    scene.add(character.object);
    character.object.updateMatrixWorld(true);

    const hips = character.rig.bone("Hips").getWorldPosition(new THREE.Vector3());
    const centre = new THREE.Vector3(hips.x, 0.95, hips.z);
    const from = new THREE.Vector3(-0.6, 0, 1).normalize().applyQuaternion(character.object.quaternion);

    marker.visible = false;
    halo.visible = false;
    camera.position.copy(centre).addScaledVector(from, 3.4).add(new THREE.Vector3(0, 0.35, 0));
    camera.lookAt(centre);
    grid.position.set(hips.x, 0.001, hips.z);
    renderer.render(scene, camera);

    const canvas = document.createElement("canvas");

    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    canvas.getContext("2d").drawImage(renderer.domElement, 0, 0);
    scene.remove(character.object);
    mesh.geometry.dispose();
    halo.visible = true;

    return canvas;
}

// The filmstrips: each motion a row of frames from its start to its end
async function film(ids) {
    const body = bodies.get(params.get("body")) ?? BODIES[0];
    const frames = Math.max(2, Number(params.get("frames")) || 8);

    summary.textContent = `${ids.join(", ")} on ${body.id}, ${frames} frames each.`;
    sheet.classList.add("film");

    for (const id of ids) {
        const motion = all.get(id);

        for (let k = 0; motion && k < frames; k++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));

            const t = Math.round((0.05 + (k / (frames - 1)) * Math.max(0, motion.seconds - 0.1)) * 1000) / 1000;
            const figure = document.createElement("figure");
            const caption = document.createElement("figcaption");

            caption.innerHTML = "<strong></strong><span></span>";
            caption.children[0].textContent = `${id}${motion.label ? ` (${motion.label})` : ""}`;
            caption.children[1].textContent = `${t} s`;
            figure.append(still(human, motion, body, t) ?? document.createElement("canvas"), caption);
            sheet.append(figure);
            window.sheet.shown++;
        }
    }
}

// --- The sheet ---

let report = null;
let human = null;
let drawing = 0;

const say = (kind, value) => `${(value * MEASURES[kind].scale).toFixed(1)}${MEASURES[kind].unit}`;

// The failures the filters choose, worst first (as the report has them: by how far past its limit)
function chosen() {
    const regressed = new Set((report.regressions ?? []).map(({ key, kind }) => `${key} ${kind}`));

    return report.failures
        .map((failure) => ({ ...failure, new: regressed.has(`${failure.key} ${failure.kind}`) }))
        .filter(({ key, kind, new: worse }) => {
            const [motionId, bodyId] = key.split("|");

            return (!select.measure.value || kind === select.measure.value) && (!select.group.value || all.get(motionId)?.group === select.group.value) && (!select.people.value || bodies.get(bodyId)?.people === select.people.value) && (!fresh.checked || worse);
        });
}

async function show() {
    const turn = ++drawing;
    const list = chosen();
    const count = Number(select.count.value);
    const kinds = Object.keys(MEASURES).map((kind) => `${kind} ${report.failures.filter((one) => one.kind === kind).length}`);

    summary.textContent = `${Object.keys(report.results ?? {}).length} motions on bodies checked in ${report.seconds} s; past their limits: ${kinds.join(", ")}; ${report.regressions?.length ?? 0} worse than the baseline. Showing ${Math.min(count, list.length)} of ${list.length}.`;
    sheet.replaceChildren();

    if (!list.length) {
        sheet.append(Object.assign(document.createElement("p"), { textContent: "Nothing failing here." }));
    }

    for (const failure of list.slice(0, count)) {
        // (A frame between figures, so the page stays alive; a new choice stops this one)
        await new Promise((resolve) => requestAnimationFrame(resolve));

        if (turn !== drawing) {
            return;
        }

        const [motionId, bodyId] = failure.key.split("|");
        const motion = all.get(motionId);
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        const picture = draw(human, failure);

        figure.classList.toggle("new", failure.new);
        caption.innerHTML = "<strong></strong><span></span><span class=\"what\"></span><span class=\"where\"></span>";
        caption.children[0].textContent = `${motionId}${motion?.label ? ` (${motion.label})` : ""}`;
        caption.children[1].textContent = bodyId;
        caption.children[2].textContent = `${failure.new ? "New: " : ""}${MEASURES[failure.kind].label} ${say(failure.kind, failure.value)} (limit ${say(failure.kind, MEASURES[failure.kind].limit)})`;
        caption.children[3].textContent = `at ${failure.t} s: ${failure.what}`;
        figure.append(picture ?? document.createElement("canvas"), caption);
        sheet.append(figure);
    }

    window.sheet.shown = Math.min(count, list.length);
}

async function load(text) {
    report = JSON.parse(text);
    await show();
}

async function start() {
    human = await loadHumanData();

    if (params.get("film")) {
        return film(params.get("film").split(","));
    }

    summary.textContent = "Loading the report…";

    const address = params.get("report") ?? "motion-report.json";
    const response = await fetch(address).catch(() => null);

    if (response?.ok) {
        await load(await response.text());
    } else {
        summary.textContent = "No report here: run npm run check:motion, or choose its report (test-results/motion/report.json).";
    }
}

file.addEventListener("change", async () => {
    if (file.files[0]) {
        await load(await file.files[0].text());
    }
});

for (const control of [...Object.values(select), fresh, close]) {
    control.addEventListener("change", () => report && show());
}

window.sheet = { shown: 0, ready: start(), load };
