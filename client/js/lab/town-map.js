// The town map (town-map.html): a village, town or city laid out from a seed (core/setpieces/
// town.js), drawn from above as the game's squares have it: the ground (grass, earth streets,
// cobbles, vegetable beds), each building turned the way it faces, with its roof's ridge and a
// mark at its front, the landmarks named, the well and stalls, and the trees.
//
// ?seed=N&kind=town choose the layout; window.townMap is there for tests.

import { footprint, layoutTown, SETTLEMENT_KINDS } from "../core/setpieces/town.js";
import { GROUND, PLOT } from "../core/setpieces/pieces.js";

const $ = (selector) => document.querySelector(selector);

const GROUND_COLOURS = { [GROUND.grass]: "#627e3c", [GROUND.road]: "#b2986a", [GROUND.cobbles]: "#989288", [GROUND.soil]: "#6e5234", [GROUND.courtyard]: "#a49a88" };
const ROOFS = { cottage: "#b89a5a", timber: "#8e4c34", brick: "#7a5a4a", stone: "#6c6a70" };
const LANDMARK = "#5d6d86";
const PROP = "#8a6a44";
const TREE = "#2f5a26";

const LAYERS = [
    ["squares", "Blocked squares", false],
    ["streets", "Street lines", false],
    ["names", "Landmarks' names", true],
];

const params = new URLSearchParams(location.search);
const state = {
    seed: Number(params.get("seed")) || Math.floor(Math.random() * 1e6),
    kind: SETTLEMENT_KINDS[params.get("kind")] ? params.get("kind") : "town",
    town: null,
    layers: Object.fromEntries(LAYERS.map(([key, , on]) => [key, on])),
};

const canvas = $("#map");
const context = canvas.getContext("2d");

function draw() {
    const { town } = state;
    const ratio = Math.min(2, devicePixelRatio || 1);
    const [width, height] = [canvas.clientWidth, canvas.clientHeight];

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    if (!town) {
        return;
    }

    // The whole layout, as big as fits
    const scale = Math.min(width / town.width, height / town.height);
    const [left, top] = [(width - town.width * scale) / 2, (height - town.height * scale) / 2];

    context.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * left, ratio * top);
    context.fillStyle = "#101418";
    context.fillRect(-left / scale, -top / scale, width / scale, height / scale);

    // The ground, square by square
    for (let y = 0; y < town.height; y++) {
        for (let x = 0; x < town.width; x++) {
            context.fillStyle = GROUND_COLOURS[town.ground[y][x]];
            context.fillRect(x, y, 1.02, 1.02);
        }
    }

    if (state.layers.squares) {
        for (let y = 0; y < town.height; y++) {
            for (let x = 0; x < town.width; x++) {
                if (town.blocked[y][x]) {
                    context.fillStyle = town.opaque[y][x] ? "rgba(235, 70, 50, 0.45)" : "rgba(240, 170, 40, 0.5)";
                    context.fillRect(x, y, 1, 1);
                }
            }
        }
    }

    if (state.layers.streets) {
        context.lineWidth = 0.3;

        for (const { points, main } of town.streets) {
            context.strokeStyle = main ? "rgba(255, 240, 200, 0.8)" : "rgba(255, 240, 200, 0.45)";
            context.beginPath();
            points.forEach(([x, y], k) => context[k ? "lineTo" : "moveTo"](x, y));
            context.stroke();
        }
    }

    const outline = (corners) => {
        context.beginPath();
        corners.forEach(([x, y], k) => context[k ? "lineTo" : "moveTo"](x, y));
        context.closePath();
    };

    for (const piece of town.pieces) {
        if (piece.kind === "tree") {
            context.beginPath();
            context.arc(piece.x, piece.y, 2.2, 0, 2 * Math.PI);
            context.fillStyle = TREE;
            context.fill();
            continue;
        }

        const corners = footprint(piece, piece.kind === "prop" ? -(piece.w * PLOT) / 4 : -0.3);

        outline(corners);
        context.fillStyle = piece.kind === "house" ? ROOFS[piece.style] : piece.kind === "landmark" ? LANDMARK : PROP;
        context.fill();
        context.lineWidth = 0.35;
        context.strokeStyle = "rgba(20, 12, 8, 0.9)";
        context.stroke();

        if (piece.kind === "prop") {
            continue;
        }

        // The ridge along the longer way, and the front (the side it faces) lit
        const [a, b, c, d] = corners;
        const middle = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const [from, to] = piece.w >= piece.h ? [middle(a, d), middle(b, c)] : [middle(a, b), middle(d, c)];

        context.beginPath();
        context.moveTo(...from);
        context.lineTo(...to);
        context.strokeStyle = "rgba(255, 235, 205, 0.45)";
        context.lineWidth = 0.4;
        context.stroke();
        context.beginPath();
        context.moveTo(...c);
        context.lineTo(...d);
        context.strokeStyle = "#ffe6a0";
        context.lineWidth = 0.6;
        context.stroke();

        if (piece.kind === "landmark" && state.layers.names) {
            context.save();
            context.translate(piece.x, piece.y);
            context.scale(1 / 4, 1 / 4);
            context.fillStyle = "#fff";
            context.font = "bold 13px system-ui, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(piece.name, 0, 0);
            context.restore();
        }
    }
}

// --- The panel ---

function panel() {
    $("#kind").replaceChildren(...Object.keys(SETTLEMENT_KINDS).map((kind) => new Option(kind, kind)));
    $("#kind").value = state.kind;
    $("#kind").addEventListener("change", (event) => {
        state.kind = event.target.value;
        layOut(state.seed);
    });

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
        layOut(Number($("#seed").value) || 0);
    });
    $("#another").addEventListener("click", () => layOut(Math.floor(Math.random() * 1e6)));

    const item = (colour, text) => {
        const li = document.createElement("li");

        li.append(Object.assign(document.createElement("span"), { className: "swatch", style: `background: ${colour}` }), text);

        return li;
    };

    $("#key").replaceChildren(
        ...Object.entries(ROOFS).map(([style, colour]) => item(colour, `${style} house`)),
        item(LANDMARK, "landmark"),
        item("#ffe6a0", "a building's front"),
        item(PROP, "well, stall, barrels"),
        item(TREE, "tree"),
        item(GROUND_COLOURS[GROUND.cobbles], "cobbles"),
        item(GROUND_COLOURS[GROUND.road], "street"),
        item(GROUND_COLOURS[GROUND.soil], "vegetable bed"),
    );
}

function count() {
    const { town } = state;
    const of = (kind) => town.pieces.filter((piece) => piece.kind === kind);

    $("#counts").replaceChildren(
        ...[
            `${of("house").length} houses`,
            `landmarks: ${of("landmark").map(({ name }) => name).join(", ") || "none"}`,
            `${town.streets.filter(({ main }) => main).length} main streets, ${town.streets.filter(({ main }) => !main).length} lanes and alleys`,
            `${of("prop").length} props, ${of("tree").length} trees`,
            `${town.width} × ${town.height} metres, laid out in ${state.took.toFixed(0)} ms`,
        ].map((text) => Object.assign(document.createElement("li"), { textContent: text })),
    );
}

function layOut(seed) {
    const started = performance.now();

    state.seed = seed;
    $("#seed").value = seed;
    state.town = layoutTown({ seed, kind: state.kind });
    state.took = performance.now() - started;
    history.replaceState(null, "", `?seed=${seed}&kind=${state.kind}`);
    count();
    $("#status").hidden = true;
    draw();
}

panel();
new ResizeObserver(draw).observe(canvas);
layOut(state.seed);

window.townMap = { state, draw, layOut };
