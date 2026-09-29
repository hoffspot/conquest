// The building lab (building-lab.html): houses and towns built in 3D from a seed, lit as the game
// lights them, to go round and look at: a street of every style of house, one, two and three
// storeys, with shops; a row of the special buildings (taverns, the guild, churches, the smithy);
// the whole town the game would build for the seed; or a settlement of each kind out in the
// world, drawn in its chunks as the game draws it. Draw calls and triangles are counted as the
// game's debug mode counts them.
//
// ?seed=N&people=human|elf|darkElf|cat|lizard|orc&show=street|landmarks|structures|insides|town|
// village|hamlet|farmstead|city|capital choose (another people's settlements laid out on their
// own), or
// show=wilds-meadow (or any land: wilds-woods, wilds-badlands...) for the land itself, well away
// from any settlement or road (&undergrowth=0.5 to thin it, 0 for none); window.buildingLab is
// there for tests.

import * as THREE from "three";
import { createRandom } from "../core/random.js";
import { nameTavern } from "../core/lore/taverns.js";
import { GOD_IDS } from "../core/lore/gods.js";
import { LANDMARKS } from "../core/setpieces/pieces.js";
import { buildWorld } from "../core/overworld.js";
import { BIOMES, CELL, CELLS } from "../core/worldplan/plan.js";
import { generateWorld } from "../core/world.js";
import { readPlan } from "../core/interiors.js";
import { guildRooms, hallRooms, keepRooms, smithyRooms, tavernRooms, templeRooms } from "../core/insides.js";
import { buildInterior, INTERIOR_CUT } from "../world/interiors3d.js";
import { Chunks, lagoonOf } from "../world/chunks3d.js";
import { prepareAtlas } from "../world/art/engine/atlas.js";
import { STYLES, TRADES } from "../world/art/kits/house.js";
import { buildGround, landColour } from "../world/ground.js";
import { PEOPLE_KITS } from "../world/art/peoples/index.js";
import { buildTown } from "../world/town3d.js";
import { View } from "../world/view.js";

const $ = (selector) => document.querySelector(selector);

const params = new URLSearchParams(location.search);
const PEOPLES = ["human", "elf", "darkElf", "cat", "lizard", "orc"];

// The land each people's settlements are shown in (its colour over the grass)
const HOMELANDS = { human: "meadow", elf: "elfwood", darkElf: "darkwood", cat: "savannah", lizard: "marsh", orc: "badlands" };
const state = {
    seed: Number(params.get("seed")) || 7,
    people: PEOPLES.includes(params.get("people")) ? params.get("people") : "human",
    show: ["town", "landmarks", "structures", "insides", "capital", "city", "village", "hamlet", "farmstead", ...BIOMES.map(({ id }) => `wilds-${id}`)].includes(params.get("show")) ? params.get("show") : "street",
    built: null,
    frames: [],
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

// A people's street: a row of each type of their houses, poorest to richest
function peopleStreetOf(seed, people) {
    const rows = PEOPLE_KITS[people]?.GALLERY?.houses ?? [];
    const pieces = [];
    let y = 8;
    let width = 0;

    for (const [row, [type, w, h]] of rows.entries()) {
        let x = 4;
        const count = w > 3 ? 3 : 5;

        for (let k = 0; k < count; k++) {
            pieces.push({ kind: "house", people, type, key: `house-${people}-${type}-${k}`, variant: k, w, h, x: x + (w * 4) / 2, y: y + (h * 4) / 2, facing: 0, wealth: (k + 0.5) / count, storeys: 1 + (k % 2), seed: seed * 1000 + row * 10 + k });
            x += w * 4 + 2;
        }

        width = Math.max(width, x);
        y += h * 4 + 5;
    }

    return { width: Math.ceil(width + 4), height: Math.ceil(y + 4), pieces };
}

// A people's own places: each of their special structures and their castle, a stretch of their
// town wall with a gate and a tower in it, and their well and stalls
function structuresOf(seed, people) {
    const sizes = PEOPLE_KITS[people]?.GALLERY?.structures ?? {};
    const pieces = [];
    let x = 4;

    for (const [k, [name, [w, h]]] of Object.entries(sizes).entries()) {
        pieces.push({ kind: "structure", people, name, key: `structure-${people}-${name}`, w, h, x: x + (w * 4) / 2, y: 6 + (h * 4) / 2, facing: 0, seed: seed * 100 + k });
        x += w * 4 + 6;
    }

    const wallY = 6 + Math.max(0, ...Object.values(sizes).map(([, h]) => h)) * 4 + 10;
    const walls = [["wall", 4, 1], ["tower", 2, 2], ["wall", 3, 1], ["gatehouse", 3, 2], ["wall", 4, 1]];
    let wx = 4;

    for (const [k, [kind, w, h]] of walls.entries()) {
        pieces.push({ kind, people, key: `${kind}-${people}-${k}`, w, h, x: wx + (w * 4) / 2, y: wallY + (h * 4) / 2 - (h > 1 ? 2 : 0), facing: 0, seed: seed * 10 + k });
        wx += w * 4;
    }

    // (And what's on their market: their well, and a stall or two)
    for (const [k, name] of ["well", "tent", "tent"].entries()) {
        pieces.push({ kind: "prop", people, name, key: `prop-${people}-${name}-${k}`, w: 2, h: 2, x: wx + 8 + k * 10, y: wallY + 4, facing: 0, seed: seed * 10 + k });
    }

    return { width: Math.ceil(Math.max(x, wx + 36) + 4), height: Math.ceil(wallY + 14), pieces };
}

// A row of every special building: taverns of every sort (their names and signs from the seed),
// the guild, churches to the Six, the smithy, the market hall, the windmill, a town hall and a keep
function landmarksOf(seed, people = "human") {
    const random = createRandom(seed);
    const pieces = [];
    const own = people !== "human";
    const row = [
        ...(own ? [2, 1] : [2, 2, 1, 2]).map((storeys) => ({ name: "tavern", tavern: nameTavern(random, { storeys }) })),
        { name: "guild" },
        ...GOD_IDS.slice(0, own ? 1 : 2).map((patron) => ({ name: "church", patron: GOD_IDS[(seed + GOD_IDS.indexOf(patron)) % GOD_IDS.length] })),
        { name: "blacksmith" },
        { name: "market" },
        ...(own ? [] : [{ name: "windmill" }]),
        { name: "hall", style: ["timber", "stone", "brick"][seed % 3], storeys: 2, ...(own ? { size: [3, 3.25] } : {}) },
        { name: "keep", ...(own ? { size: [3.5, 4] } : {}) },
    ].map((piece) => (own ? { ...piece, people } : piece));
    let x = 4;

    for (const [k, own] of row.entries()) {
        const [w, h] = own.size ?? LANDMARKS[own.name];

        pieces.push({ kind: "landmark", key: `landmark-${own.name}`, ...own, w, h, x: x + (w * 4) / 2, y: 10 + (h * 4) / 2, facing: 0, seed: seed * 100 + k });
        x += w * 4 + 3;
    }

    return { width: Math.ceil(x + 4), height: 40, pieces };
}

// A spot in the middle of a stretch of a land (metres), as far from the plan's places and roads as
// can be found: the land itself, as the game draws it
function wildsOf(plan, land) {
    const biome = BIOMES.findIndex(({ id }) => id === land);
    const roads = new Set(plan.roads.flatMap(({ cells }) => cells.map(([x, y]) => y * CELLS + x)));
    let best = null;

    for (let k = 0; k < CELLS * CELLS; k++) {
        if (plan.biome[k] !== biome) {
            continue;
        }

        const [x, y] = [k % CELLS, Math.floor(k / CELLS)];
        let score = 0;

        // (All round it the same land, no road, and far from places)
        for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
                const at = (y + dy) * CELLS + (x + dx);

                score += plan.biome[at] === biome && !roads.has(at) ? 1 : -2;
            }
        }

        const near = Math.min(...plan.places.map((place) => Math.hypot(place.at[0] - (x + 0.5) * CELL, place.at[1] - (y + 0.5) * CELL)));

        score += Math.min(near, 400) / 100;

        if (!best || score > best.score) {
            best = { score, at: [(x + 0.5) * CELL, (y + 0.5) * CELL] };
        }
    }

    return best.at;
}

// What's there to look at, one thing (or row of the same things) at a time: { label, x, z (its
// middle), w, d (metres) }, for pictures of each (window.buildingLab.state.frames)
function framesOf(pieces) {
    const groups = new Map();

    for (const piece of pieces) {
        const label = piece.kind === "house" ? `house ${piece.type ?? piece.style}` : piece.kind === "prop" ? "stalls" : ["wall", "tower", "gatehouse"].includes(piece.kind) ? "walls" : piece.kind === "tree" ? null : `${piece.kind} ${piece.name ?? ""}`.trim();

        if (label) {
            const [hw, hd] = [piece.w * 2, piece.h * 2];
            const box = groups.get(label) ?? [Infinity, Infinity, -Infinity, -Infinity];

            groups.set(label, [Math.min(box[0], piece.x - hw), Math.min(box[1], piece.y - hd), Math.max(box[2], piece.x + hw), Math.max(box[3], piece.y + hd)]);
        }
    }

    return [...groups].map(([label, [x0, z0, x1, z1]]) => ({ label, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }));
}

// A people's insides, side by side, roofless: a tavern's taproom and upstairs, a smithy, a temple,
// a guild, a town hall and a keep, each as its people builds and dresses it, its lamps lit
function insidesOf(seed, people) {
    const group = new THREE.Group();
    const kinds = [
        [tavernRooms, { tavern: { storeys: 2, upstairs: "inn" } }],
        [smithyRooms, {}],
        [templeRooms, { patron: GOD_IDS[seed % GOD_IDS.length] }],
        [guildRooms, {}],
        [hallRooms, {}],
        [keepRooms, {}],
    ];
    const frames = [];
    let x = 0;

    // (Nothing cut away: there's no one inside to see past the walls)
    INTERIOR_CUT.width.value = 0;

    for (const [k, [rooms, own]] of kinds.entries()) {
        const building = { seed: seed * 10 + k, name: "Inside", people, ...own };
        let width = 0;

        for (const [n, floor] of rooms(building).entries()) {
            const map = readPlan(`inside-${k}-${n}`, floor.name, floor.rows, { ground: floor.ground });

            Object.assign(map, { origin: [x, n * 24], style: floor.style, look: floor.look ?? null, finish: floor.finish ?? null, patron: floor.patron ?? null, layout: floor.layout ?? null, people });

            const inside = buildInterior(map);

            group.add(inside.object);

            for (const light of inside.lights) {
                const lamp = new THREE.PointLight(light.colour, light.intensity, light.distance, 1.4);

                lamp.position.set(light.x, light.y, light.z);
                group.add(lamp);
            }

            width = Math.max(width, map.width);
            frames.push({ label: `inside ${floor.style}`, x: x + map.width / 2, z: n * 24 + map.height / 2, w: map.width, d: map.height });
        }

        x += width + 6;
    }

    return { group, frames, width: x, height: 48 };
}

async function build() {
    state.ready = false;
    $("#status").hidden = false;
    $("#status").textContent = "Building…";

    if (state.built) {
        view.scene.remove(state.built);
    }

    await prepareAtlas();

    // A stretch of a land, as the game draws it
    if (state.show.startsWith("wilds-")) {
        const world = buildWorld({ seed: state.seed });
        const [x, z] = wildsOf(world.plan, state.show.slice(6));
        const chunks = new Chunks(world, { undergrowth: Number(params.get("undergrowth") ?? 1) });

        chunks.fill(x, z, 1);

        while (chunks.busy) {
            chunks.update(x, z);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        view.scene.add(chunks.object);
        state.built = chunks.object;
        state.chunks = chunks;
        orbit.focus.set(x, 1, z);
        orbit.distance = 11;
        orbit.pitch = 42;
        finish(chunks.drawn.size);

        return;
    }

    // A settlement out in the world, as the game draws it: the nearest of its kind to where a
    // player starts, in the chunks round it (another people's: laid out and built as theirs, on
    // its own)
    const own = state.people !== "human";

    if (!["street", "landmarks", "structures", "insides", "town"].includes(state.show) && !own) {
        const world = buildWorld({ seed: state.seed });
        const place = world.plan.places.filter(({ kind }) => kind === state.show).sort((a, b) => Math.hypot(a.at[0] - world.start.at[0], a.at[1] - world.start.at[1]) - Math.hypot(b.at[0] - world.start.at[0], b.at[1] - world.start.at[1]))[0];
        const chunks = new Chunks(world);

        chunks.fill(place.at[0], place.at[1]);

        while (chunks.busy) {
            chunks.update(place.at[0], place.at[1]);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        view.scene.add(chunks.object);
        state.built = chunks.object;
        orbit.focus.set(place.at[0], 2, place.at[1]);
        orbit.distance = { capital: 170, city: 130, village: 60, hamlet: 45, farmstead: 40 }[state.show];
        state.place = place;
        finish(world.maps.town.settlements.laid.get(place.id).town.pieces.length);

        return;
    }

    if (state.show === "insides") {
        const { group, frames, width, height } = insidesOf(state.seed, state.people);

        view.scene.add(group);
        state.built = group;
        state.frames = frames;
        orbit.focus.set(width / 2, 0, height / 4);
        orbit.distance = 80;
        orbit.pitch = 55;
        finish(group.children.length);

        return;
    }

    const settlement = !["street", "landmarks", "structures"].includes(state.show);
    const world = generateWorld({ seed: state.seed, ...(settlement ? { kind: state.show, people: state.people } : {}) });

    if (!settlement) {
        const street = state.show === "street" ? (own ? peopleStreetOf(state.seed, state.people) : streetOf(state.seed)) : state.show === "structures" ? structuresOf(state.seed, state.people) : landmarksOf(state.seed, state.people);

        Object.assign(world, { town: { ...world.town, pieces: street.pieces }, trees: [], width: street.width, height: street.height, stamp: null, origin: 0 });
    }

    const group = new THREE.Group();
    const ground = buildGround(settlement ? world : { ...world, ground: Array.from({ length: world.height }, () => new Uint8Array(world.width)) }, { land: landColour(HOMELANDS[state.people]) });
    const town = await buildTown(world);
    const lagoon = lagoonOf(world.town.water, world.town.walks);

    group.add(ground, town.object, ...(lagoon ? [lagoon] : []));
    view.scene.add(group);
    state.built = group;
    orbit.focus.set(settlement ? world.town.centre[0] : world.width / 2, 2, settlement ? world.town.centre[1] : world.height / 2);
    orbit.distance = settlement ? { capital: 170, city: 130, town: 70, village: 60, hamlet: 45, farmstead: 40 }[state.show] : Math.max(42, Math.min(90, Math.max(world.width, world.height) * 0.6));

    state.frames = settlement ? [{ label: "town", x: world.town.centre[0], z: world.town.centre[1], w: world.town.radius * 2, d: world.town.radius * 2 }, { label: "market", x: world.town.centre[0], z: world.town.centre[1], w: 30, d: 30 }, ...framesOf(world.town.pieces.filter(({ kind }) => kind === "structure"))] : framesOf(world.town.pieces);
    finish(world.town.pieces.length);
}

// Counted as the game counts them: what the camera and the sun draw each frame
function finish(pieces) {
    view.renderer.info.reset();
    place();
    view.render();
    state.stats = { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles, pieces };
    $("#counts").replaceChildren(...Object.entries({ "Draw calls": state.stats.calls, Triangles: state.stats.triangles.toLocaleString(), Pieces: state.stats.pieces }).map(([label, value]) => {
        const item = document.createElement("li");

        item.textContent = `${label}: ${value}`;

        return item;
    }));
    $("#status").hidden = true;
    state.ready = true;
    history.replaceState(null, "", `?seed=${state.seed}&people=${state.people}&show=${state.show}`);
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
$("#people").value = state.people;
$("#people").addEventListener("change", () => {
    state.people = $("#people").value;
    build();
});
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
