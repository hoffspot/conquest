// The dungeon map (dungeon-map.html): a dungeon cooked up from a seed and a theme by the dungeon
// builder (core/dungeons/build.js), drawn from above level by level as the game's squares have it:
// its rock and ground, each room tinted by its part (the way in, the stairs down, a mini-boss's, the
// boss's arena), the way through, the props and the torches, the chests, and who's in it (the boss,
// the mini-bosses, the packs). Pointing at a square says what's there.
//
// ?seed=N&theme=caves&levels=2&tier=3&generation=0&level=1 choose it; window.dungeonMap is there
// for tests.

import { CREATURES, TIERS } from "../core/creatures.js";
import { buildDungeon } from "../core/dungeons/build.js";
import { THEMES } from "../core/dungeons/themes.js";
import { PLAN_KEY } from "../core/interiors.js";

const $ = (selector) => document.querySelector(selector);

// How each theme's ground and rock look from above
const GROUNDS = { caves: ["#5d5447", "#17130f"], hideout: ["#6b5a43", "#1a140e"], ancient: ["#7a766c", "#15140f"] };

// Each room's part, tinted
const ROLES = { entry: ["#46c46a", "the way in"], stairs: ["#5b8cff", "stairs down"], arena: ["#ff4b3a", "the boss's arena"], mini: ["#ff9f1a", "a mini-boss's room"], pack: ["#c9b28a", "a pack's room"], quiet: [null, "an empty room"] };

// What stands on the squares, by plan character
const PROPS = {
    D: "#d9b38c",
    "<": "#8fb3ff",
    ">": "#8fb3ff",
    V: "#2f4f94",
    "^": "#6f8fd0",
    "*": "#8b8172",
    m: "#665c52",
    j: "#ddd5bf",
    I: "#bdb5a4",
    t: "#958c7c",
    Z: "#d1cab7",
    a: "#d4b56c",
    s: "#a9a0b4",
    k: "#ffd27a",
    y: "#ff9a3c",
    x: "#ff7b2e",
    u: "#8b5e3c",
    "%": "#a37b48",
    K: "#77502e",
    T: "#9a6b3e",
    R: "#7b7f86",
    Y: "#b88f3a",
    $: "#f0c75a",
    h: "#ffe14a",
};

const FOES = { boss: ["#ff3b30", 1.15], mini: ["#ff9500", 0.85], pack: ["#e86a5a", 0.5] };

const LAYERS = [
    ["roles", "Rooms' parts", true],
    ["path", "Way through", true],
    ["foes", "Foes", true],
    ["props", "Props", true],
    ["lights", "Torches", true],
    ["numbers", "Room numbers", false],
];

const params = new URLSearchParams(location.search);
const state = {
    seed: Number(params.get("seed")) || Math.floor(Math.random() * 1e6),
    theme: THEMES[params.get("theme")] ? params.get("theme") : "caves",
    levels: [1, 2, 3].includes(Number(params.get("levels"))) ? Number(params.get("levels")) : null,
    tier: Math.min(TIERS, Math.max(1, Number(params.get("tier")) || 3)),
    generation: Math.max(0, Number(params.get("generation")) || 0),
    level: Math.max(0, Number(params.get("level")) || 0),
    dungeon: null,
    took: 0,
    layers: Object.fromEntries(LAYERS.map(([key, , on]) => [key, on])),
    view: null,
};

const canvas = $("#map");
const context = canvas.getContext("2d");

/** The level shown. */
const shown = () => state.dungeon?.levels[Math.min(state.level, state.dungeon.levels.length - 1)] ?? null;

function draw() {
    const level = shown();
    const ratio = Math.min(2, devicePixelRatio || 1);
    const [width, height] = [canvas.clientWidth, canvas.clientHeight];

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    if (!level) {
        return;
    }

    // The whole level, as big as fits
    const scale = Math.min(width / level.width, height / level.height);
    const [left, top] = [(width - level.width * scale) / 2, (height - level.height * scale) / 2];
    const [ground, rock] = GROUNDS[state.dungeon.theme] ?? GROUNDS.caves;

    state.view = { scale, left, top };
    context.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * left, ratio * top);
    context.fillStyle = rock;
    context.fillRect(-left / scale, -top / scale, width / scale, height / scale);

    // The ground, and each room tinted by its part
    const roomAt = new Map();

    for (const room of level.rooms) {
        roomAt.set(room.id, room);
    }

    for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
            if (level.rows[y][x] !== "#") {
                context.fillStyle = ground;
                context.fillRect(x, y, 1.02, 1.02);
            }
        }
    }

    if (state.layers.roles) {
        context.globalAlpha = 0.28;

        for (const room of level.rooms) {
            const [colour] = ROLES[room.role] ?? [];

            if (!colour) {
                continue;
            }

            context.fillStyle = colour;

            for (let y = room.y; y < room.y + room.h; y++) {
                for (let x = room.x; x < room.x + room.w; x++) {
                    if (level.rows[y][x] !== "#") {
                        context.fillRect(x, y, 1, 1);
                    }
                }
            }
        }

        context.globalAlpha = 1;
    }

    // What stands on the squares
    for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
            const char = level.rows[y][x];
            const colour = PROPS[char];

            if (!colour || (!state.layers.props && !"D<>V^$h".includes(char))) {
                continue;
            }

            context.fillStyle = colour;

            if (char === "j" || char === "k") {
                context.fillRect(x + 0.3, y + 0.3, 0.4, 0.4);
            } else if (char === "$" || char === "h") {
                context.fillRect(x + 0.12, y + 0.22, 0.76, 0.56);
                context.strokeStyle = "#3a2a08";
                context.lineWidth = 0.1;
                context.strokeRect(x + 0.12, y + 0.22, 0.76, 0.56);
            } else if (char === "*" || char === "I" || char === "y" || char === "x") {
                context.beginPath();
                context.arc(x + 0.5, y + 0.5, 0.42, 0, 2 * Math.PI);
                context.fill();
            } else {
                context.fillRect(x + 0.06, y + 0.06, 0.88, 0.88);
            }
        }
    }

    // (The stairs' treads)
    context.strokeStyle = "rgba(10, 14, 24, 0.8)";
    context.lineWidth = 0.12;

    for (let y = 0; y < level.height; y++) {
        for (let x = 0; x < level.width; x++) {
            if (level.rows[y][x] === "V" || level.rows[y][x] === "^") {
                context.strokeRect(x + 0.2, y + 0.2, 0.6, 0.6);
            }
        }
    }

    // The way through, room to room
    if (state.layers.path && level.path.length > 1) {
        context.beginPath();
        level.path.forEach((id, k) => {
            const [x, y] = roomAt.get(id).centre;

            context[k ? "lineTo" : "moveTo"](x + 0.5, y + 0.5);
        });
        context.strokeStyle = "rgba(255, 255, 255, 0.55)";
        context.lineWidth = 0.35;
        context.setLineDash([1, 0.8]);
        context.stroke();
        context.setLineDash([]);
    }

    // Torches on the walls
    if (state.layers.lights) {
        for (const light of level.lights.filter(({ kind }) => kind === "torch")) {
            const [x, y] = light.at;
            const [dx, dy] = light.wall;

            context.beginPath();
            context.arc(x + 0.5 + dx * 0.42, y + 0.5 + dy * 0.42, 0.28, 0, 2 * Math.PI);
            context.fillStyle = "#ffcf4a";
            context.fill();
            context.beginPath();
            context.arc(x + 0.5 + dx * 0.42, y + 0.5 + dy * 0.42, 1.6, 0, 2 * Math.PI);
            context.fillStyle = "rgba(255, 190, 80, 0.12)";
            context.fill();
        }
    }

    // Who's in it
    if (state.layers.foes) {
        for (const pack of level.packs) {
            for (const foe of pack.foes) {
                const [colour, radius] = FOES[foe.boss ? "boss" : foe.mini ? "mini" : "pack"];
                const [x, y] = foe.at;

                context.beginPath();
                context.arc(x + 0.5, y + 0.5, radius, 0, 2 * Math.PI);
                context.fillStyle = colour;
                context.fill();
                context.lineWidth = 0.14;
                context.strokeStyle = "rgba(20, 6, 4, 0.9)";
                context.stroke();
            }
        }
    }

    if (state.layers.numbers) {
        for (const room of level.rooms) {
            context.save();
            context.translate(room.centre[0] + 0.5, room.centre[1] + 0.5);
            context.scale(1 / 6, 1 / 6);
            context.fillStyle = "#fff";
            context.font = "bold 14px system-ui, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(`${room.id} ${room.kind}`, 0, 0);
            context.restore();
        }
    }
}

// --- Pointing at a square: what's there ---

function hover(event) {
    const level = shown();
    const tip = $("#hover");

    if (!level || !state.view) {
        return;
    }

    const box = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - box.left - state.view.left) / state.view.scale);
    const y = Math.floor((event.clientY - box.top - state.view.top) / state.view.scale);

    if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
        tip.hidden = true;

        return;
    }

    const char = level.rows[y][x];
    const room = level.rooms.find((one) => x >= one.x && y >= one.y && x < one.x + one.w && y < one.y + one.h && level.rows[y][x] !== "#");
    const foe = level.packs.flatMap((pack) => pack.foes.map((one) => ({ ...one, pack }))).find(({ at }) => at[0] === x && at[1] === y);
    const lines = [`(${x}, ${y}) ${char === "#" ? "rock" : PLAN_KEY[char]?.kind ?? char}`];

    if (room) {
        lines.push(`room ${room.id}: ${room.kind}, ${room.area} m², ${ROLES[room.role]?.[1] ?? room.role}`);
    }

    if (foe) {
        lines.push(`${foe.title ?? CREATURES[foe.creature]?.name ?? foe.creature} (${foe.creature}), tier ${foe.tier}`);
    }

    tip.textContent = lines.join("\n");
    tip.hidden = false;
}

// --- The panel ---

function panel() {
    $("#theme").replaceChildren(...Object.values(THEMES).map((theme) => new Option(theme.name, theme.id)));
    $("#theme").value = state.theme;
    $("#tier").replaceChildren(...Array.from({ length: TIERS }, (each, k) => new Option(String(k + 1), String(k + 1))));
    $("#tier").value = String(state.tier);
    $("#depth").value = state.levels ? String(state.levels) : "";
    $("#generation").replaceChildren(...Array.from({ length: 6 }, (each, k) => new Option(k ? `again (${k + 1})` : "first", String(k))));
    $("#generation").value = String(Math.min(5, state.generation));

    const remake = (key, read) => (event) => {
        state[key] = read(event.target.value);
        make(state.seed);
    };

    $("#theme").addEventListener("change", remake("theme", (value) => value));
    $("#tier").addEventListener("change", remake("tier", Number));
    $("#depth").addEventListener("change", remake("levels", (value) => (value ? Number(value) : null)));
    $("#generation").addEventListener("change", remake("generation", Number));

    $("#layers").append(
        ...LAYERS.map(([key, label]) => {
            const row = document.createElement("label");
            const box = document.createElement("input");

            box.type = "checkbox";
            box.checked = state.layers[key];
            box.addEventListener("change", () => {
                state.layers[key] = box.checked;
                draw();
            });
            row.append(box, label);

            return row;
        }),
    );

    $("#seedform").addEventListener("submit", (event) => {
        event.preventDefault();
        make(Number($("#seed").value) || 0);
    });
    $("#another").addEventListener("click", () => make(Math.floor(Math.random() * 1e6)));
    canvas.addEventListener("pointermove", hover);
    canvas.addEventListener("pointerleave", () => ($("#hover").hidden = true));

    const item = (colour, text, round = false) => {
        const li = document.createElement("li");

        li.append(Object.assign(document.createElement("span"), { className: "swatch", style: `background: ${colour};${round ? " border-radius: 50%" : ""}` }), text);

        return li;
    };

    $("#key").replaceChildren(
        ...Object.values(ROLES)
            .filter(([colour]) => colour)
            .map(([colour, text]) => item(colour, text)),
        item(FOES.boss[0], "the boss", true),
        item(FOES.mini[0], "a mini-boss", true),
        item(FOES.pack[0], "one of a pack", true),
        item(PROPS.h, "the boss's hoard"),
        item(PROPS.$, "a small chest"),
        item("#ffcf4a", "a torch on the wall", true),
        item(PROPS.V, "stairs down"),
        item(PROPS["^"], "stairs up"),
        item(PROPS[">"], "a stair's landing"),
        item(PROPS.D, "the front door"),
        item(PROPS["*"], "rock standing up", true),
        item(PROPS.I, "a pillar", true),
        item(PROPS.m, "rubble"),
        item(PROPS.j, "bones"),
        item(PROPS.t, "a tomb"),
        item(PROPS.Z, "a statue"),
        item(PROPS.a, "an altar"),
        item(PROPS.y, "a brazier", true),
        item(PROPS.x, "a camp fire", true),
        item(PROPS.u, "a bedroll"),
        item(PROPS["%"], "crates"),
        item(PROPS.K, "barrels"),
        item(PROPS.T, "a table"),
    );
}

function levelButtons() {
    const { levels } = state.dungeon;

    $("#levels").replaceChildren(
        ...levels.map((level, k) => {
            const button = document.createElement("button");

            button.type = "button";
            button.textContent = `Level ${k + 1}`;
            button.setAttribute("aria-pressed", String(k === state.level));
            button.addEventListener("click", () => {
                state.level = k;
                levelButtons();
                count();
                address();
                draw();
            });

            return button;
        }),
    );
}

function count() {
    const { dungeon } = state;
    const level = shown();
    const foes = level.packs.flatMap(({ foes: list }) => list);
    const kinds = new Map();

    for (const { creature } of foes) {
        kinds.set(creature, (kinds.get(creature) ?? 0) + 1);
    }

    const boss = level.packs.find(({ role }) => role === "boss");
    const minis = level.packs.filter(({ role }) => role === "mini");

    $("#name").textContent = dungeon.name;
    $("#counts").replaceChildren(
        ...[
            `${THEMES[dungeon.theme].name}, ${dungeon.levels.length} level${dungeon.levels.length > 1 ? "s" : ""} deep, tier ${dungeon.tier}; made in ${state.took.toFixed(0)} ms`,
            `level ${level.index + 1}: ${level.width} × ${level.height} metres, ${level.rooms.length} rooms, ${level.rows.join("").replace(/#/g, "").length} m² to walk, ${level.loops} loop${level.loops === 1 ? "" : "s"}${level.attempt ? `, dug ${level.attempt + 1} times` : ""}`,
            `the way through: ${level.path.length} rooms`,
            boss ? `the boss: ${boss.title} (${boss.foes[0].creature}, tier ${boss.foes[0].tier}) and ${boss.foes.length - 1} more` : `stairs down to level ${level.index + 2}`,
            minis.length ? `mini-bosses: ${minis.map(({ title, foes: [mini] }) => `${title} (tier ${mini.tier})`).join(", ")}` : "no mini-boss on this level",
            `${level.packs.filter(({ role }) => role === "pack").length} packs, ${foes.length} foes in all: ${[...kinds].map(([creature, n]) => `${n} ${creature}`).join(", ")}`,
            `${level.chests.filter(({ kind }) => kind === "small").length} small chests${level.chests.some(({ kind }) => kind === "hoard") ? " and the boss's hoard" : ""}`,
            `${level.lights.filter(({ kind }) => kind === "torch").length} torches, ${level.lights.filter(({ kind }) => kind !== "torch").length} fires`,
        ].map((text) => Object.assign(document.createElement("li"), { textContent: text })),
    );
}

function address() {
    const levels = state.levels ? `&levels=${state.levels}` : "";

    history.replaceState(null, "", `?seed=${state.seed}&theme=${state.theme}${levels}&tier=${state.tier}&generation=${state.generation}&level=${state.level}`);
}

function make(seed) {
    const started = performance.now();

    state.seed = seed;
    $("#seed").value = seed;
    state.dungeon = buildDungeon({ seed, theme: state.theme, tier: state.tier, levels: state.levels, generation: state.generation });
    state.took = performance.now() - started;
    state.level = Math.min(state.level, state.dungeon.levels.length - 1);
    address();
    levelButtons();
    count();
    $("#status").hidden = true;
    draw();
}

panel();
new ResizeObserver(draw).observe(canvas);
make(state.seed);

window.dungeonMap = { state, draw, make };
