// The fire lab (fire-lab.html): every kind of fire the game has (world/fire.js), at night or
// whenever, in the breeze or still, lit and drawn as the game lights and draws them (the view's
// lamps for the two nearest, every other one its own light: world/lights.js), to look at and
// compare: a torch either side of a door in a stone wall, a brazier, a camp fire in its ring of
// stones, candles on a table; and the fire spells (spellfx.js, as the game casts them), each
// cast again and again on open ground beyond; a figure among them to see them light.
//
// ?look=all|torch|brazier|fire|candles|burn|fireball|burstflame|immolate|flamefill|inferno|hellfire
// &wind=0.6&time=night|dusk|day; window.fireLab is there for tests and pictures (its `cast`).

import * as THREE from "three";
import { SPELLS } from "../core/spells.js";
import { Effects } from "../world/effects.js";
import { EMBER_SCALE, FIRE_WIND } from "../world/fire.js";
import { GLOW_SCALE, lightsMesh } from "../world/lights.js";
import { SpellFx } from "../world/spellfx.js";
import { View } from "../world/view.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);

// The times of day (ms into the day: core/daytime.js DAY)
const TIMES = { night: 60000, dusk: 50.5 * 60000, day: 29 * 60000 };

// Where each is looked at from: what's looked at (metres), how far off, how far round and up
const LOOKS = {
    all: { focus: [0, 1, 0], distance: 13, yaw: 0.35, pitch: 22 },
    torch: { focus: [2.5, 2.1, -3.6], distance: 3.2, yaw: 0.25, pitch: 8 },
    brazier: { focus: [-5, 1, 1], distance: 3.4, yaw: 0.3, pitch: 14 },
    fire: { focus: [4, 0.6, 1], distance: 4, yaw: -0.3, pitch: 18 },
    candles: { focus: [0, 0.95, 3], distance: 1.6, yaw: 0.2, pitch: 20 },
};

// The fire spells, least to greatest (core/spells.js), cast at the open ground beyond the table
const SPELL_FIELD = [0, 0, 13];
const CASTS = ["burn", "fireball", "burstflame", "immolate", "flamefill", "inferno", "hellfire"];

for (const [k, spell] of CASTS.entries()) {
    LOOKS[spell] = { focus: [SPELL_FIELD[0], 1 + k * 0.9, SPELL_FIELD[2]], distance: 6 + k * 4.5, yaw: 0.35, pitch: 10 + k };
}

const state = { look: LOOKS[params.get("look")] ? params.get("look") : "all", wind: Number(params.get("wind") ?? 0.6), time: TIMES[params.get("time")] ? params.get("time") : "night" };
const view = new View($("#map"));
const orbit = { ...LOOKS[state.look], focus: new THREE.Vector3(...LOOKS[state.look].focus) };

view.setShadows(true);

// --- The place ---

const lit = (colour, options = {}) => new THREE.MeshLambertMaterial({ color: colour, ...options });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), lit(0x4d4842));

ground.receiveShadow = true;
view.scene.add(ground);

const stone = lit(0x857e76);
const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 0.6), stone);

wall.position.set(0, 2.25, -4);
wall.castShadow = wall.receiveShadow = true;
view.scene.add(wall);

// (A door in it, dark oak, between the torches)
const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.1), lit(0x3a2a1c));

door.position.set(0, 1.3, -3.66);
view.scene.add(door);

const iron = lit(0x2a2a2c);
const timber = lit(0x5a4028);

// A torch in its bracket on the wall either side of the door
for (const x of [-2.5, 2.5]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.04), iron);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.55, 6), timber);

    plate.position.set(x, 2.0, -3.68);
    handle.position.set(x, 2.1, -3.52);
    handle.rotation.x = 0.55;
    view.scene.add(plate, handle);
}

// A brazier: an iron bowl on three legs
const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.1, 0.3, 12, 1, true), iron);

bowl.position.set(-5, 0.9, 1);
view.scene.add(bowl);

for (let k = 0; k < 3; k++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 4), iron);
    const a = (k / 3) * Math.PI * 2;

    leg.position.set(-5 + Math.cos(a) * 0.2, 0.42, 1 + Math.sin(a) * 0.2);
    view.scene.add(leg);
}

// A camp fire: a ring of stones, logs crossed in it
for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13), stone);

    rock.position.set(4 + Math.cos(a) * 0.55, 0.08, 1 + Math.sin(a) * 0.55);
    rock.castShadow = true;
    view.scene.add(rock);
}

for (let k = 0; k < 3; k++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), lit(0x2e2218));

    log.position.set(4, 0.08, 1);
    log.rotation.set(Math.PI / 2, 0, (k / 3) * Math.PI);
    view.scene.add(log);
}

// A table with candles on it
const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.8), timber);

table.position.set(0, 0.78, 3);
table.castShadow = table.receiveShadow = true;
view.scene.add(table);

for (const [dx, dz] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.78, 0.06), timber);

    leg.position.set(dx, 0.39, 3 + dz);
    view.scene.add(leg);
}

const candles = [-0.4, 0, 0.35].map((x, k) => ({ x, y: 0.81 + 0.12 + k * 0.02, z: 3 + (k - 1) * 0.08, kind: "candle" }));

for (const candle of candles) {
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, candle.y - 0.81, 8), lit(0xefe4c4));

    wax.position.set(candle.x, (candle.y + 0.81) / 2, candle.z);
    view.scene.add(wax);
}

// Someone standing among them, to see them light a body
const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.2, 4, 12), new THREE.MeshStandardMaterial({ color: 0xb08f78, roughness: 0.8 }));

figure.position.set(0.8, 0.85, -1.2);
figure.castShadow = true;
view.scene.add(figure);

// --- The fires ---

const lights = [
    { x: -2.5, y: 2.4, z: -3.4, kind: "torch", out: [0, 1] },
    { x: 2.5, y: 2.4, z: -3.4, kind: "torch", out: [0, 1] },
    { x: -5, y: 1.02, z: 1, kind: "brazier" },
    { x: 4, y: 0.08, z: 1, kind: "fire" },
    ...candles,
];

view.scene.add(lightsMesh(lights));

// The fire spells, as the game casts them: from someone standing a few steps off, at the ground
const effects = new Effects(view.scene);
const spellFx = new SpellFx(effects, view.scene, { lights: [] });
const at = (x, y, z) => () => new THREE.Vector3(x, y, z);
const [sx, , sz] = SPELL_FIELD;
const caster = { feet: at(sx + 3, 0, sz + 5), point: at(sx + 3, 1.1, sz + 5), hand: at(sx + 3.3, 1.3, sz + 4.7) };
const target = { feet: at(sx, 0, sz), point: at(sx, 1.1, sz), hand: at(sx, 1.2, sz) };
let next = 0;

spellFx.camera = view.camera;

/** Cast a fire spell (one of CASTS) at the spell field: it lands as long after as its cast takes (seconds: returned). */
function cast(spell) {
    const { castTime } = SPELLS[spell];

    spellFx.cast("lab", spell, { hand: caster.hand, feet: caster.feet, target: target.feet, aim: target.point, still: () => true, castTime });
    spellFx.after(castTime / 1000, () => spellFx.land("lab", spell, { caster, target }));

    return castTime / 1000;
}

// --- Drawing ---

function place() {
    view.resize();
    view.camera.position.set(
        orbit.focus.x + Math.sin(orbit.yaw) * Math.cos((orbit.pitch * Math.PI) / 180) * orbit.distance,
        orbit.focus.y + Math.sin((orbit.pitch * Math.PI) / 180) * orbit.distance,
        orbit.focus.z + Math.cos(orbit.yaw) * Math.cos((orbit.pitch * Math.PI) / 180) * orbit.distance,
    );
    view.camera.lookAt(orbit.focus);
}

let then = performance.now();

function frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - then) / 1000);

    then = now;
    place();
    view.setTimeOfDay(TIMES[state.time], 0.5);
    FIRE_WIND.value.z = state.wind;
    GLOW_SCALE.value = EMBER_SCALE.value = view.pixelsPerMetre();

    // (The spell looked at cast again once the last's burnt out)
    if (CASTS.includes(state.look) && !state.still && now > next) {
        cast(state.look);
        next = now + 1000 * (SPELLS[state.look].castTime / 1000 + 3.5);
    }

    spellFx.update(dt);
    effects.update(dt, view.pixelsPerMetre());
    view.lightNear([...lights, ...spellFx.lightsNow()], CASTS.includes(state.look) ? target.point() : figure.position);
    view.renderer.info.reset();
    view.render();
    $("#stats").textContent = `Draw calls: ${view.renderer.info.render.calls}`;
    requestAnimationFrame(frame);
}

$("#look").value = state.look;
$("#wind").value = state.wind;
$("#time").value = state.time;
$("#look").addEventListener("change", () => {
    state.look = $("#look").value;
    Object.assign(orbit, LOOKS[state.look], { focus: new THREE.Vector3(...LOOKS[state.look].focus) });
});
$("#wind").addEventListener("input", () => (state.wind = Number($("#wind").value)));
$("#time").addEventListener("change", () => (state.time = $("#time").value));

// Going round: drag to turn and tilt, the wheel to come closer
const canvas = $("#map");
let last = null;

canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    last = [event.clientX, event.clientY];
});
canvas.addEventListener("pointermove", (event) => {
    if (!last) {
        return;
    }

    orbit.yaw -= (event.clientX - last[0]) * 0.008;
    orbit.pitch = Math.max(-5, Math.min(85, orbit.pitch + (event.clientY - last[1]) * 0.25));
    last = [event.clientX, event.clientY];
});
canvas.addEventListener("pointerup", () => (last = null));
canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.distance = Math.max(0.6, Math.min(60, orbit.distance * Math.exp(event.deltaY * 0.001)));
});

$("#status").hidden = true;
window.fireLab = { state, orbit, view, lights, LOOKS, spellFx, cast, CASTS };
requestAnimationFrame(frame);
