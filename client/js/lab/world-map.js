// The world map (world-map.html): the whole world plan (core/worldplan) for a seed drawn on a
// canvas, to look over what a seed makes: the lands and who lives where, the rivers and roads,
// the settlements (and which have a guild), the sites between them, and the enemies' camps, how
// dangerous each is for a player starting as one people or another. Wheel or pinch to zoom, drag
// to move about, and point at anything to see what it is.
//
// ?seed=N&race=id choose the world and the start; window.worldMap is there for tests.

import { BIOMES, campTier, CELL, CELLS, FACTIONS, guildFor, guilds, landAt, planWorld, RACES, ROAD, SETTLEMENTS, startFor, WATER, WORLD_SIZE } from "../core/worldplan/plan.js";

const $ = (selector) => document.querySelector(selector);

// How many pixels of the land's picture a cell is
const PIXELS = 4;

const PEOPLE_COLOURS = { human: "#f0c96a", elf: "#7fe6a2", darkElf: "#b98fff", cat: "#ffb35c", lizard: "#4fd8c8", orc: "#ff6b5c" };
const RIVER = [70, 130, 185];
const ROAD_COLOURS = { trade: "#f4e2b8", road: "#e1caa0", track: "#c9ae84" };
const SITE_MARKS = {
    ruins: "▦",
    cave: "◖",
    shrine: "✚",
    "standing stones": "⁞",
    watchtower: "♜",
    "ruined castle": "♖",
    castle: "♜",
    "dragon's lair": "☠",
};
const TIER_COLOURS = ["#ffe066", "#ffc04d", "#ff9f40", "#ff7a33", "#f5522e", "#e0322d", "#c01f3a", "#8f1747"];

const LAYERS = [
    ["territories", "Territories", true],
    ["roads", "Roads", true],
    ["places", "Settlements", true],
    ["names", "Names", true],
    ["sites", "Sites", true],
    ["camps", "Camps", true],
    ["roam", "Patrol ranges", false],
    ["districts", "Guild districts", false],
];

const params = new URLSearchParams(location.search);
const state = {
    seed: Number(params.get("seed")) || Math.floor(Math.random() * 1e6),
    race: RACES.some(({ id }) => id === params.get("race")) ? params.get("race") : "human",
    plan: null,
    start: null,
    land: null,
    territories: null,
    districts: null,
    layers: Object.fromEntries(LAYERS.map(([key, , on]) => [key, on])),
    // What's shown: the world's metres per screen pixel, and the world point at the screen's top left
    view: { scale: 1, x: 0, y: 0 },
};

const canvas = $("#map");
const context = canvas.getContext("2d");
let ready = null;

// --- Pictures of the land (drawn once for each world) ---

function picture(draw) {
    const result = document.createElement("canvas");

    result.width = result.height = CELLS * PIXELS;
    draw(result.getContext("2d"), result);

    return result;
}

const hex = (colour) => [1, 3, 5].map((k) => parseInt(colour.slice(k, k + 2), 16));

// The land: each cell its biome's colour, shaded as if lit from the north-west, rivers in blue
function paintLand(plan) {
    return picture((paint) => {
        const image = paint.createImageData(CELLS * PIXELS, CELLS * PIXELS);
        const colours = BIOMES.map(({ colour }) => hex(colour));
        const at = (x, y) => plan.height[Math.min(CELLS - 1, Math.max(0, y)) * CELLS + Math.min(CELLS - 1, Math.max(0, x))];

        for (let y = 0; y < CELLS; y++) {
            for (let x = 0; x < CELLS; x++) {
                const k = y * CELLS + x;
                const water = plan.water[k];
                const shade = water === WATER.sea || water === WATER.lake ? 1 : Math.min(1.35, Math.max(0.65, 1 + (at(x - 1, y) - at(x + 1, y) + at(x, y - 1) - at(x, y + 1)) * 3));
                const colour = water === WATER.river ? RIVER : colours[plan.biome[k]];

                for (let dy = 0; dy < PIXELS; dy++) {
                    for (let dx = 0; dx < PIXELS; dx++) {
                        const p = ((y * PIXELS + dy) * CELLS * PIXELS + x * PIXELS + dx) * 4;
                        const grain = water ? 1 : 0.96 + (((x * 7 + dx) * 13 + (y * 11 + dy) * 17) % 9) / 100;

                        image.data[p] = colour[0] * shade * grain;
                        image.data[p + 1] = colour[1] * shade * grain;
                        image.data[p + 2] = colour[2] * shade * grain;
                        image.data[p + 3] = 255;
                    }
                }
            }
        }

        paint.putImageData(image, 0, 0);
    });
}

// Each people's lands, lightly tinted their colour, edged where they end
function paintTerritories(plan) {
    return picture((paint) => {
        const image = paint.createImageData(CELLS * PIXELS, CELLS * PIXELS);
        const colours = RACES.map(({ id }) => hex(PEOPLE_COLOURS[id]));
        const owner = (x, y) => (x < 0 || y < 0 || x >= CELLS || y >= CELLS ? 0 : plan.territory[y * CELLS + x]);

        for (let y = 0; y < CELLS; y++) {
            for (let x = 0; x < CELLS; x++) {
                const mine = owner(x, y);

                if (!mine) {
                    continue;
                }

                const edge = owner(x - 1, y) !== mine || owner(x + 1, y) !== mine || owner(x, y - 1) !== mine || owner(x, y + 1) !== mine;
                const colour = colours[mine - 1];

                for (let dy = 0; dy < PIXELS; dy++) {
                    for (let dx = 0; dx < PIXELS; dx++) {
                        const p = ((y * PIXELS + dy) * CELLS * PIXELS + x * PIXELS + dx) * 4;

                        image.data.set([...colour, edge ? 230 : 34], p);
                    }
                }
            }
        }

        paint.putImageData(image, 0, 0);
    });
}

// The guilds' districts: each cell the land nearest a guild, edged where one meets another
function paintDistricts(plan) {
    const branches = guilds(plan);
    const nearest = new Int16Array(CELLS * CELLS);

    for (let y = 0; y < CELLS; y++) {
        for (let x = 0; x < CELLS; x++) {
            const branch = guildFor(plan, (x + 0.5) * CELL, (y + 0.5) * CELL);

            nearest[y * CELLS + x] = branches.indexOf(branch);
        }
    }

    return picture((paint) => {
        paint.fillStyle = "rgb(255 255 255 / 55%)";

        for (let y = 0; y < CELLS; y++) {
            for (let x = 0; x < CELLS; x++) {
                const k = y * CELLS + x;

                if ((x + 1 < CELLS && nearest[k + 1] !== nearest[k]) || (y + 1 < CELLS && nearest[k + CELLS] !== nearest[k])) {
                    paint.fillRect(x * PIXELS, y * PIXELS, PIXELS, PIXELS);
                }
            }
        }
    });
}

// --- Drawing ---

const toScreen = (x, y) => [(x - state.view.x) / state.view.scale, (y - state.view.y) / state.view.scale];
const toWorld = (sx, sy) => [state.view.x + sx * state.view.scale, state.view.y + sy * state.view.scale];

function draw() {
    const { plan, view, layers } = state;
    const ratio = window.devicePixelRatio || 1;
    const [width, height] = [canvas.clientWidth, canvas.clientHeight];

    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#0c1116";
    context.fillRect(0, 0, width, height);

    if (!plan) {
        return;
    }

    // The pictures, a cell of the land PIXELS pixels of them
    const pictureScale = CELL / PIXELS / view.scale;
    const [left, top] = toScreen(0, 0);

    context.imageSmoothingEnabled = pictureScale < 2;

    for (const [shown, layer] of [[true, state.land], [layers.territories, state.territories], [layers.districts, state.districts]]) {
        if (shown && layer) {
            context.drawImage(layer, left, top, layer.width * pictureScale, layer.height * pictureScale);
        }
    }

    const perKm = 1000 / view.scale;

    if (layers.roads) {
        context.lineCap = context.lineJoin = "round";

        for (const kind of ["track", "road", "trade"]) {
            context.strokeStyle = ROAD_COLOURS[kind];
            context.lineWidth = Math.max(kind === "track" ? 0.8 : 1.3, (kind === "track" ? 4 : kind === "road" ? 6 : 8) / view.scale);
            context.setLineDash(kind === "track" ? [3, 3] : []);
            context.beginPath();

            for (const road of plan.roads.filter((r) => r.kind === kind)) {
                road.cells.forEach(([x, y], k) => {
                    const [sx, sy] = toScreen((x + 0.5) * CELL, (y + 0.5) * CELL);

                    k ? context.lineTo(sx, sy) : context.moveTo(sx, sy);
                });
            }

            context.stroke();
        }

        context.setLineDash([]);
    }

    if (layers.roam && layers.camps) {
        context.lineWidth = 1;

        for (const camp of plan.camps) {
            const [sx, sy] = toScreen(...camp.at);

            context.strokeStyle = `${TIER_COLOURS[campTier(camp, state.start.at) - 1]}aa`;
            context.beginPath();
            context.arc(sx, sy, camp.roam / view.scale, 0, Math.PI * 2);
            context.stroke();
        }
    }

    if (layers.sites) {
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = `${Math.max(10, Math.min(18, perKm / 22))}px system-ui, sans-serif`;

        for (const site of plan.sites) {
            const [sx, sy] = toScreen(...site.at);

            context.fillStyle = site.race ? PEOPLE_COLOURS[site.race] : "#f2efe6";
            context.strokeStyle = "rgb(0 0 0 / 70%)";
            context.lineWidth = 3;

            const mark = SITE_MARKS[site.kind] ?? "◆";

            context.strokeText(mark, sx, sy);
            context.fillText(mark, sx, sy);
        }
    }

    if (layers.camps) {
        const size = Math.max(4, Math.min(9, perKm / 45));

        context.font = `bold ${Math.round(size * 1.3)}px system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";

        for (const camp of plan.camps) {
            const [sx, sy] = toScreen(...camp.at);
            const tier = campTier(camp, state.start.at);

            context.fillStyle = TIER_COLOURS[tier - 1];
            context.strokeStyle = "#2a0c0c";
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(sx, sy - size);
            context.lineTo(sx + size, sy + size * 0.8);
            context.lineTo(sx - size, sy + size * 0.8);
            context.closePath();
            context.fill();
            context.stroke();

            if (perKm > 160) {
                context.fillStyle = "#2a0c0c";
                context.fillText(String(tier), sx, sy + size * 0.25);
            }
        }
    }

    if (layers.places) {
        for (const place of plan.places) {
            const [sx, sy] = toScreen(...place.at);
            const r = Math.max({ capital: 6, city: 4.5, town: 3.2, village: 2 }[place.kind], place.radius / view.scale);

            context.fillStyle = PEOPLE_COLOURS[place.race];
            context.strokeStyle = "#101418";
            context.lineWidth = place.guild ? 2.2 : 1.2;
            context.beginPath();
            context.arc(sx, sy, r, 0, Math.PI * 2);
            context.fill();
            context.stroke();

            if (place.kind === "capital") {
                context.strokeStyle = "#fff6d8";
                context.lineWidth = 1.5;
                context.beginPath();
                context.arc(sx, sy, r + 3, 0, Math.PI * 2);
                context.stroke();
            }
        }

        // Where the player starts
        const [sx, sy] = toScreen(...state.start.at);

        context.strokeStyle = "#ffffff";
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(sx, sy, Math.max(10, state.start.radius / view.scale + 6), 0, Math.PI * 2);
        context.stroke();
    }

    if (layers.names && layers.places) {
        context.textAlign = "center";
        context.textBaseline = "top";
        context.lineWidth = 3;
        context.strokeStyle = "rgb(10 12 14 / 85%)";

        for (const place of plan.places) {
            const shown = { capital: 0, city: 60, town: 110, village: 260 }[place.kind];

            if (perKm < shown) {
                continue;
            }

            const [sx, sy] = toScreen(...place.at);

            context.font = `${place.kind === "capital" ? "bold 14" : place.kind === "city" ? "bold 12" : "11"}px system-ui, sans-serif`;
            context.fillStyle = "#fbf6ea";
            context.strokeText(place.name, sx, sy + 8);
            context.fillText(place.name, sx, sy + 8);
        }
    }
}

// --- Pointing, zooming and moving about ---

function fit() {
    const [width, height] = [canvas.clientWidth, canvas.clientHeight];
    const scale = (WORLD_SIZE / Math.min(width, height)) * 1.02;

    state.view = { scale, x: WORLD_SIZE / 2 - (width / 2) * scale, y: WORLD_SIZE / 2 - (height / 2) * scale };
    draw();
}

function zoom(by, sx = canvas.clientWidth / 2, sy = canvas.clientHeight / 2) {
    const [wx, wy] = toWorld(sx, sy);
    const scale = Math.min(40, Math.max(0.5, state.view.scale / by));

    state.view = { scale, x: wx - sx * scale, y: wy - sy * scale };
    draw();
}

// What's under a point on the screen
function describe(sx, sy) {
    const { plan } = state;
    const [x, y] = toWorld(sx, sy);

    if (x < 0 || y < 0 || x >= WORLD_SIZE || y >= WORLD_SIZE) {
        return null;
    }

    const land = landAt(plan, x, y);
    const lines = [];
    const near = (list) => list.filter((item) => Math.hypot(...toScreen(...item.at).map((v, k) => v - [sx, sy][k])) < 12);
    // (The Humans' capital; the Cat folk's)
    const race = (id) => {
        const name = RACES.find((r) => r.id === id)?.name ?? "";

        return name.endsWith("s") ? `${name}'` : `${name}'s`;
    };

    for (const place of near(plan.places)) {
        lines.push(`${place.name}: the ${race(place.race)} ${place.kind}${place.guild ? ", with a guild" : ""}${place === state.start ? " (you start here)" : ""}`);
    }

    for (const site of near(plan.sites)) {
        lines.push(`${site.name ? `${site.name}: ` : ""}${site.race ? `the ${race(site.race)} ` : ""}${site.kind}`);
    }

    for (const camp of near(plan.camps)) {
        const faction = FACTIONS.find(({ id }) => id === camp.faction);

        lines.push(`${faction.name.endsWith("s") ? `${faction.name}'` : `${faction.name}'s`} camp, tier ${campTier(camp, state.start.at)}: ${camp.patrols} patrol${camp.patrols > 1 ? "s" : ""} out to ${camp.roam} m`);
    }

    const water = ["", "the sea", "a lake", "a river"][land.water];

    lines.push(`${water || land.biome}${land.road ? `, ${land.road === ROAD.road ? "a road" : "a track"}` : ""}${land.race ? ` in the ${race(land.race)} lands` : ", wild"} (${(x / 1000).toFixed(2)}, ${(y / 1000).toFixed(2)} km)`);

    return lines.join("\n");
}

function listen() {
    const pointers = new Map();
    let pinch = null;

    canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        zoom(Math.exp(-event.deltaY * 0.0015), event.offsetX, event.offsetY);
    }, { passive: false });

    canvas.addEventListener("pointerdown", (event) => {
        canvas.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, [event.offsetX, event.offsetY]);
        canvas.classList.add("dragging");
    });

    canvas.addEventListener("pointermove", (event) => {
        const before = pointers.get(event.pointerId);

        if (!before) {
            const text = state.plan && describe(event.offsetX, event.offsetY);

            $("#hover").hidden = !text;
            $("#hover").textContent = text ?? "";

            return;
        }

        const now = [event.offsetX, event.offsetY];

        pointers.set(event.pointerId, now);

        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            const apart = Math.hypot(a[0] - b[0], a[1] - b[1]);

            if (pinch) {
                zoom(apart / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
            }

            pinch = apart;

            return;
        }

        state.view.x -= (now[0] - before[0]) * state.view.scale;
        state.view.y -= (now[1] - before[1]) * state.view.scale;
        draw();
    });

    for (const type of ["pointerup", "pointercancel"]) {
        canvas.addEventListener(type, (event) => {
            pointers.delete(event.pointerId);
            pinch = null;
            canvas.classList.toggle("dragging", pointers.size > 0);
        });
    }

    canvas.addEventListener("pointerleave", () => ($("#hover").hidden = true));
    $("#zoomin").addEventListener("click", () => zoom(1.6));
    $("#zoomout").addEventListener("click", () => zoom(1 / 1.6));
    $("#zoomall").addEventListener("click", fit);
    new ResizeObserver(draw).observe(canvas);
}

// --- The panel ---

function panel() {
    $("#people").replaceChildren(...RACES.map(({ id, name }) => new Option(name, id)));
    $("#people").value = state.race;
    $("#people").addEventListener("change", (event) => {
        state.race = event.target.value;
        chooseStart();
        remember();
        draw();
    });

    $("#layers").append(
        ...LAYERS.map(([key, label]) => {
            const row = document.createElement("label");
            const box = document.createElement("input");

            box.type = "checkbox";
            box.checked = state.layers[key];
            box.addEventListener("change", () => {
                state.layers[key] = box.checked;

                if (key === "districts" && box.checked && !state.districts) {
                    state.districts = paintDistricts(state.plan);
                }

                draw();
            });
            row.append(box, label);

            return row;
        }),
    );

    $("#seedform").addEventListener("submit", (event) => {
        event.preventDefault();
        layOut(Number($("#seed").value) || 0);
    });
    $("#another").addEventListener("click", () => layOut(Math.floor(Math.random() * 1e6)));

    const swatch = (colour) => Object.assign(document.createElement("span"), { className: "swatch", style: `background: ${colour}` });
    const item = (colour, text) => {
        const li = document.createElement("li");

        li.append(swatch(colour), text);

        return li;
    };

    $("#peoples").replaceChildren(...RACES.map(({ id, name }) => item(PEOPLE_COLOURS[id], name)));
    $("#lands").replaceChildren(...BIOMES.map(({ id, colour }) => item(colour, id)), item(`rgb(${RIVER.join(" ")})`, "river"));
}

function chooseStart() {
    state.start = startFor(state.plan, state.race);
    const one = RACES.find(({ id }) => id === state.race).one;

    $("#start").textContent = `Playing ${one}, you start in ${state.start.name}, near their capital (ringed in white). Each camp is marked with how dangerous it is from there, 1 to 8.`;
}

function remember() {
    history.replaceState(null, "", `?seed=${state.seed}&race=${state.race}`);
}

function count() {
    const { plan } = state;
    const kinds = Object.keys(SETTLEMENTS).map((kind) => `${plan.places.filter((place) => place.kind === kind).length} ${kind === "city" ? "cities" : `${kind}s`}`);

    $("#counts").replaceChildren(
        ...[
            kinds.join(", "),
            `${guilds(plan).length} guild branches`,
            `${plan.roads.filter(({ kind }) => kind === "trade").length} trade roads, ${plan.roads.filter(({ kind }) => kind !== "trade").length} roads and tracks`,
            `${plan.sites.length} sites: ruins, caves, shrines and more`,
            `${plan.camps.length} enemy camps`,
        ].map((text) => Object.assign(document.createElement("li"), { textContent: text })),
    );
}

// Lay out a world (after letting the page show it's working on it)
function layOut(seed) {
    state.seed = seed;
    $("#seed").value = seed;
    $("#status").hidden = false;

    ready = new Promise((resolve) => {
        requestAnimationFrame(() =>
            setTimeout(() => {
                const started = performance.now();

                state.plan = planWorld(seed);
                state.took = performance.now() - started;
                state.land = paintLand(state.plan);
                state.territories = paintTerritories(state.plan);
                state.districts = state.layers.districts ? paintDistricts(state.plan) : null;
                chooseStart();
                count();
                remember();
                $("#status").hidden = true;
                draw();
                resolve(state.plan);
            }, 30),
        );
    });

    return ready;
}

panel();
listen();
fit();
layOut(state.seed);

window.worldMap = {
    state,
    get ready() {
        return ready;
    },
    draw,
    zoom,
    describe,
    toScreen,
};
