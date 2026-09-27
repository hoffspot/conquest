// The building lab (building-lab.html): houses and towns built in 3D from a seed, lit as the game
// lights them, to go round and look at: a street of every style of house, one, two and three
// storeys, with shops; or the whole town the game would build for the seed. Draw calls and
// triangles are counted as the game's debug mode counts them.
//
// ?seed=N&show=street|town choose; window.buildingLab is there for tests.

import * as THREE from "three";
import { generateWorld } from "../core/world.js";
import { prepareAtlas } from "../world/art/engine/atlas.js";
import { STYLES, TRADES } from "../world/art/kits/house.js";
import { buildGround } from "../world/ground.js";
import { buildTown } from "../world/town3d.js";
import { View } from "../world/view.js";

const $ = (selector) => document.querySelector(selector);

const params = new URLSearchParams(location.search);
const state = {
    seed: Number(params.get("seed")) || 7,
    show: params.get("show") === "town" ? "town" : "street",
    built: null,
    stats: null,
    ready: false,
};

const view = new View($("#map"));
const orbit = { yaw: 0.5, pitch: 32, distance: 26, focus: new THREE.Vector3() };

view.setShadows(true);

// A street of every style: each a few sizes and storeys, facing the camera (south), a few shops
function streetOf(seed) {
    const pieces = [];
    const styles = Object.keys(STYLES);
    let x = 4;

    for (const [row, style] of styles.entries()) {
        x = 4;

        for (let k = 0; k < 5; k++) {
            const [w, h] = [1.6 + ((seed + k * 7 + row) % 5) * 0.25, 2 + ((seed + k * 3) % 4) * 0.3];
            const storeys = 1 + ((seed + k + row) % 3);

            pieces.push({ kind: "house", key: `house-${style}-${k}`, style, variant: k, w, h, x: x + (w * 4) / 2, y: 8 + row * 26 + (h * 4) / 2, facing: 0, storeys, use: k === 1 || k === 3 ? TRADES[(seed + k + row) % TRADES.length] : null, seed: seed * 1000 + row * 10 + k });
            x += w * 4 + 0.6;
        }
    }

    return { width: Math.ceil(x + 4), height: 8 + styles.length * 26 + 4, pieces };
}

async function build() {
    state.ready = false;
    $("#status").hidden = false;
    $("#status").textContent = "Building…";

    if (state.built) {
        view.scene.remove(state.built);
    }

    await prepareAtlas();

    const world = generateWorld({ seed: state.seed });

    if (state.show === "street") {
        const street = streetOf(state.seed);

        Object.assign(world, { town: { ...world.town, pieces: street.pieces }, trees: [], width: street.width, height: street.height, stamp: null, origin: 0 });
    }

    const group = new THREE.Group();
    const ground = buildGround(state.show === "street" ? { ...world, ground: Array.from({ length: world.height }, () => new Uint8Array(world.width)) } : world);
    const town = await buildTown(world);

    group.add(ground, town.object);
    view.scene.add(group);
    state.built = group;
    orbit.focus.set(world.width / 2, 2, world.height / 2);
    orbit.distance = state.show === "street" ? 42 : 70;

    // Counted as the game counts them: what the camera and the sun draw each frame
    view.renderer.info.reset();
    place();
    view.render();
    state.stats = { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, pieces: world.town.pieces.length };
    $("#counts").replaceChildren(...Object.entries({ "Draw calls": state.stats.calls, Triangles: state.stats.triangles.toLocaleString(), Pieces: state.stats.pieces }).map(([label, value]) => {
        const item = document.createElement("li");

        item.textContent = `${label}: ${value}`;

        return item;
    }));
    $("#status").hidden = true;
    state.ready = true;
    history.replaceState(null, "", `?seed=${state.seed}&show=${state.show}`);
}

function place() {
    view.resize();
    view.camera.position.set(
        orbit.focus.x + Math.sin(orbit.yaw) * Math.cos((orbit.pitch * Math.PI) / 180) * orbit.distance,
        orbit.focus.y + Math.sin((orbit.pitch * Math.PI) / 180) * orbit.distance,
        orbit.focus.z + Math.cos(orbit.yaw) * Math.cos((orbit.pitch * Math.PI) / 180) * orbit.distance,
    );
    view.camera.lookAt(orbit.focus);
    view.sun.position.copy(orbit.focus).add(new THREE.Vector3(-0.55, 1, 0.65).normalize().multiplyScalar(60));
    view.sun.target.position.copy(orbit.focus);
    view.sun.shadow.camera.left = view.sun.shadow.camera.bottom = -60;
    view.sun.shadow.camera.right = view.sun.shadow.camera.top = 60;
    view.sun.shadow.camera.far = 200;
    view.sun.shadow.camera.updateProjectionMatrix();
}

function frame() {
    place();
    view.renderer.info.reset();
    view.render();
    requestAnimationFrame(frame);
}

// Going round: drag to turn and tilt, the wheel or a pinch to come closer
const canvas = $("#map");
const pointers = new Map();

canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
});
canvas.addEventListener("pointermove", (event) => {
    const last = pointers.get(event.pointerId);

    if (!last) {
        return;
    }

    if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const before = Math.hypot(a[0] - b[0], a[1] - b[1]);

        pointers.set(event.pointerId, [event.clientX, event.clientY]);

        const [c, d] = [...pointers.values()];

        orbit.distance = Math.max(4, Math.min(160, orbit.distance * (before / Math.max(1, Math.hypot(c[0] - d[0], c[1] - d[1])))));

        return;
    }

    orbit.yaw -= (event.clientX - last[0]) * 0.008;
    orbit.pitch = Math.max(5, Math.min(85, orbit.pitch + (event.clientY - last[1]) * 0.25));
    pointers.set(event.pointerId, [event.clientX, event.clientY]);
});
canvas.addEventListener("pointerup", (event) => pointers.delete(event.pointerId));
canvas.addEventListener("pointercancel", (event) => pointers.delete(event.pointerId));
canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.distance = Math.max(4, Math.min(160, orbit.distance * Math.exp(event.deltaY * 0.001)));
}, { passive: false });

$("#seed").value = state.seed;
$("#show").value = state.show;
$("#seedform").addEventListener("submit", (event) => {
    event.preventDefault();
    state.seed = Number($("#seed").value) || 0;
    build();
});
$("#another").addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * 1e6);
    $("#seed").value = state.seed;
    build();
});
$("#show").addEventListener("change", () => {
    state.show = $("#show").value;
    build();
});

window.buildingLab = { state, orbit, view, build, place };

await build();
requestAnimationFrame(frame);
