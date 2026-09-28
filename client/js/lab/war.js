// The war (war.html): the war for the continent (core/war) played out on a world's map, turn by
// turn, to watch how it goes for a seed:
// - every town in the colour of whoever holds it, its garrison beside it;
// - the forces out: expeditions on the march, the camps outside their targets, relief, envoys;
// - each realm, its ruler and what they're like, what it holds and its gold;
// - how each stands with each other;
// - the news of it all.
//
// Play it on, a turn at a time or faster, and turn the players' might up and down to see the war
// come on with it. Wheel or pinch to zoom, drag to move about, and point at anything to see what
// it is.
//
// ?seed=N&might=M choose the world and the might; window.warViewer is there for tests.

import { describeLeader } from "../core/war/peoples.js";
import { peopleOf, tell } from "../core/war/news.js";
import { HOLDINGS, STAGES, War } from "../core/war/war.js";
import { CELL, planWorld, RACES, WORLD_SIZE } from "../core/worldplan/plan.js";
import { paintLand, PEOPLE_COLOURS, PIXELS } from "./land.js";

const $ = (selector) => document.querySelector(selector);

// How far round each town it holds the land (metres), shown in its holder's colour
const HELD = { capital: 520, city: 380, town: 260, village: 160 };
const DOT = { capital: 7, city: 5.5, town: 4, village: 3 };

// The events worth making much of in the news
const BIG = new Set(["declared", "taken", "subjugated", "rebelled", "victory", "undone", "stage", "fallen"]);

const RELATION_MARKS = { allied: "ally", neutral: "–", hostile: "war", vassal: "rules", overlord: "serves", unknown: "", self: "" };

const params = new URLSearchParams(location.search);
const state = {
    seed: Number(params.get("seed")) || Math.floor(Math.random() * 1e6),
    might: Math.min(8, Math.max(0, Number(params.get("might")) || 0)),
    plan: null,
    war: null,
    land: null,
    playing: false,
    timer: null,
    news: [],
    view: { scale: 1, x: 0, y: 0 },
};

const canvas = $("#map");
const context = canvas.getContext("2d");
let ready = null;

// --- Drawing ---

const toScreen = (x, y) => [(x - state.view.x) / state.view.scale, (y - state.view.y) / state.view.scale];
const toWorld = (sx, sy) => [state.view.x + sx * state.view.scale, state.view.y + sy * state.view.scale];

function draw() {
    const { plan, war, view } = state;
    const ratio = window.devicePixelRatio || 1;
    const [width, height] = [canvas.clientWidth, canvas.clientHeight];

    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = "#0c1116";
    context.fillRect(0, 0, width, height);

    if (!plan || !war) {
        return;
    }

    // The land, dimmed under the war
    const pictureScale = CELL / PIXELS / view.scale;
    const [left, top] = toScreen(0, 0);

    context.imageSmoothingEnabled = pictureScale < 2;
    context.globalAlpha = 0.55;
    context.drawImage(state.land, left, top, state.land.width * pictureScale, state.land.height * pictureScale);
    context.globalAlpha = 1;

    // The roads
    context.lineCap = context.lineJoin = "round";
    context.strokeStyle = "rgb(225 202 160 / 45%)";
    context.lineWidth = Math.max(0.8, 5 / view.scale);
    context.beginPath();

    for (const road of plan.roads.filter(({ kind }) => kind !== "track")) {
        road.cells.forEach(([x, y], k) => {
            const [sx, sy] = toScreen((x + 0.5) * CELL, (y + 0.5) * CELL);

            k ? context.lineTo(sx, sy) : context.moveTo(sx, sy);
        });
    }

    context.stroke();

    // The land each town holds, in its holder's colour
    for (const town of war.towns) {
        const [sx, sy] = toScreen(...town.at);

        context.fillStyle = `${PEOPLE_COLOURS[town.owner]}33`;
        context.beginPath();
        context.arc(sx, sy, HELD[town.kind] / view.scale, 0, Math.PI * 2);
        context.fill();
    }

    // The forces out: each camp's and expedition's way to its target, then the forces themselves
    context.lineWidth = 1.5;

    for (const force of war.forces) {
        const colour = PEOPLE_COLOURS[force.realm];

        if (force.kind === "expedition" || force.kind === "relief" || force.kind === "envoy") {
            context.strokeStyle = `${colour}aa`;
            context.setLineDash(force.kind === "envoy" ? [2, 4] : [6, 4]);
            context.beginPath();
            context.moveTo(...toScreen(...force.at));

            for (const point of force.path.slice(force.leg + 1)) {
                context.lineTo(...toScreen(...point));
            }

            context.stroke();
        } else if (force.kind === "camp") {
            const town = war.town(force.target);

            if (town) {
                context.strokeStyle = colour;
                context.setLineDash([2, 3]);
                context.beginPath();
                context.moveTo(...toScreen(...force.at));
                context.lineTo(...toScreen(...town.at));
                context.stroke();
            }
        }
    }

    context.setLineDash([]);

    // The towns: a dot in their holder's colour (ringed in the colour of the people who built it,
    // if someone else holds it), capitals and seats crowned
    const perKm = 1000 / view.scale;

    context.textAlign = "center";
    context.textBaseline = "middle";

    for (const town of war.towns) {
        const [sx, sy] = toScreen(...town.at);
        const r = DOT[town.kind];
        const seat = war.realms.some(({ seat: id }) => id === town.id);

        context.fillStyle = PEOPLE_COLOURS[town.owner];
        context.strokeStyle = town.owner === town.race ? "#101418" : PEOPLE_COLOURS[town.race];
        context.lineWidth = town.owner === town.race ? 1.2 : 2.5;
        context.beginPath();
        context.arc(sx, sy, r, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        if (seat) {
            context.strokeStyle = "#fff6d8";
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(sx, sy, r + 3, 0, Math.PI * 2);
            context.stroke();
        }

        // (Its garrison, near enough)
        if (perKm > 90 || town.kind === "capital") {
            context.font = "bold 10px system-ui, sans-serif";
            context.lineWidth = 3;
            context.strokeStyle = "rgb(10 12 14 / 85%)";
            context.fillStyle = "#fbf6ea";
            context.strokeText(String(town.garrison), sx + r + 9, sy);
            context.fillText(String(town.garrison), sx + r + 9, sy);
        }

        if (perKm > 160 || town.kind === "capital") {
            context.font = `${town.kind === "capital" ? "bold 13" : "11"}px system-ui, sans-serif`;
            context.strokeText(town.name, sx, sy + r + 10);
            context.fillText(town.name, sx, sy + r + 10);
        }
    }

    // The forces themselves: camps as tents, expeditions and relief as shields, envoys as scrolls
    for (const force of war.forces) {
        const [sx, sy] = toScreen(...force.at);
        const colour = PEOPLE_COLOURS[force.realm];

        context.fillStyle = colour;
        context.strokeStyle = "#101418";
        context.lineWidth = 1.5;
        context.beginPath();

        if (force.kind === "camp") {
            const size = 5 + Math.min(6, force.size / 8);

            context.moveTo(sx, sy - size);
            context.lineTo(sx + size, sy + size * 0.8);
            context.lineTo(sx - size, sy + size * 0.8);
            context.closePath();
        } else if (force.kind === "envoy") {
            context.rect(sx - 3, sy - 4, 6, 8);
        } else {
            const size = 4 + Math.min(5, force.size / 8);

            context.moveTo(sx - size, sy - size);
            context.lineTo(sx + size, sy - size);
            context.lineTo(sx + size, sy);
            context.quadraticCurveTo(sx + size, sy + size, sx, sy + size * 1.4);
            context.quadraticCurveTo(sx - size, sy + size, sx - size, sy);
            context.closePath();
        }

        context.fill();
        context.stroke();

        if (force.kind !== "envoy") {
            context.font = "bold 10px system-ui, sans-serif";
            context.lineWidth = 3;
            context.strokeStyle = "rgb(10 12 14 / 85%)";
            context.fillStyle = "#fbf6ea";
            context.strokeText(String(force.size), sx, sy - 13);
            context.fillText(String(force.size), sx, sy - 13);
        }
    }
}

// --- The panel ---

const own = (id) => (peopleOf(id).endsWith("s") ? `${peopleOf(id)}'` : `${peopleOf(id)}'s`);

function showRealms() {
    const { war } = state;

    $("#age").textContent = `Turn ${war.turn}: ${STAGES[war.stage].name}.${war.victor ? ` The ${peopleOf(war.victor)} rule the continent.` : ""} ${STAGES[war.stage].take.length ? `Their camps can take ${STAGES[war.stage].take.map((kind) => (kind === "city" ? "cities" : `${kind}s`)).join(", ")}.` : "Their camps can only raid."}`;

    $("#realms").replaceChildren(
        ...war.realms.map((realm) => {
            const li = document.createElement("li");
            const towns = war.towns.filter(({ owner }) => owner === realm.id).length;
            const said = describeLeader(realm.leader, realm.id).slice(0, 2).map(({ saying }) => saying);
            const serves = realm.overlord ? `, serving the ${peopleOf(realm.overlord)}` : "";

            li.className = realm.alive ? "" : "fallen";
            li.dataset.realm = realm.id;
            li.append(
                Object.assign(document.createElement("span"), { className: "swatch", style: `background: ${PEOPLE_COLOURS[realm.id]}` }),
                Object.assign(document.createElement("strong"), { textContent: `${realm.name[0].toUpperCase()}${realm.name.slice(1)}${serves}` }),
                Object.assign(document.createElement("span"), { className: "leader", textContent: `${realm.leader.title} ${realm.leader.name}${said.length ? `: ${said.join(", ")}` : ""}` }),
                Object.assign(document.createElement("span"), { className: "holds", textContent: realm.alive ? `${towns} towns · ${war.power(realm.id)} under arms · ${Math.floor(realm.treasury)} gold` : "No towns left" }),
            );

            return li;
        }),
    );

    const header = document.createElement("tr");

    header.append(document.createElement("th"), ...war.realms.map(({ id }) => Object.assign(document.createElement("th"), { textContent: peopleOf(id).split(" ")[0] })));
    $("#relations").replaceChildren(
        header,
        ...war.realms.map((realm) => {
            const row = document.createElement("tr");

            row.append(Object.assign(document.createElement("th"), { textContent: peopleOf(realm.id), scope: "row" }));

            for (const other of war.realms) {
                const relation = war.relation(realm.id, other.id);

                row.append(Object.assign(document.createElement("td"), { className: relation, textContent: RELATION_MARKS[relation], title: `The ${peopleOf(realm.id)} and the ${peopleOf(other.id)}: ${relation}` }));
            }

            return row;
        }),
    );
}

function showNews() {
    $("#news").replaceChildren(
        ...state.news.slice(-80).reverse().map((event) => {
            const li = Object.assign(document.createElement("li"), { textContent: tell(event, state.war), value: event.turn });

            li.classList.toggle("big", BIG.has(event.type));

            return li;
        }),
    );
}

// --- Playing ---

/** Play `turns` turns on (drawing once after). */
function step(turns = 1) {
    for (let k = 0; k < turns; k++) {
        state.war.step();
        state.news.push(...state.war.events);
        state.war.events = [];
    }

    state.news.splice(0, Math.max(0, state.news.length - 400));
    showRealms();
    showNews();
    draw();
}

function play(on) {
    state.playing = on;
    $("#play").setAttribute("aria-pressed", String(on));
    $("#play").textContent = on ? "Pause" : "Play";
    clearInterval(state.timer);
    state.timer = null;

    if (on) {
        const perSecond = Number($("#speed").value);
        const every = Math.max(50, 1000 / perSecond);

        state.timer = setInterval(() => step(Math.max(1, Math.round((perSecond * every) / 1000))), every);
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

// What's under a point on the screen: towns and forces
function describe(sx, sy) {
    const { war } = state;

    if (!war) {
        return null;
    }

    const near = (list) => list.filter(({ at }) => Math.hypot(...toScreen(...at).map((value, k) => value - [sx, sy][k])) < 12);
    const lines = [];

    for (const town of near(war.towns)) {
        const held = town.owner === town.race ? `the ${own(town.owner)}` : `the ${own(town.race)}, held by the ${peopleOf(town.owner)}`;

        lines.push(`${town.name}: ${held} ${town.kind}, ${town.garrison} of ${HOLDINGS[town.kind].garrison} on guard`);
    }

    for (const force of near(war.forces)) {
        const target = war.town(force.target)?.name ?? (force.kind === "envoy" ? `the ${peopleOf(force.target)}` : "a camp");
        const what = { expedition: `marching on ${target}`, camp: `camped outside ${target}`, relief: `going to relieve ${target === "a camp" ? "a town" : target}`, envoy: `an envoy to ${target}` }[force.kind];

        lines.push(`The ${own(force.realm)} ${force.kind === "envoy" ? what : `${force.size}, ${what}`}`);
    }

    return lines.length ? lines.join("\n") : null;
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
            const text = describe(event.offsetX, event.offsetY);

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

    $("#seedform").addEventListener("submit", (event) => {
        event.preventDefault();
        layOut(Number($("#seed").value) || 0);
    });
    $("#another").addEventListener("click", () => layOut(Math.floor(Math.random() * 1e6)));
    $("#play").addEventListener("click", () => play(!state.playing));
    $("#next").addEventListener("click", () => step(1));
    $("#speed").addEventListener("change", () => play(state.playing));
    $("#might").addEventListener("input", (event) => setMight(Number(event.target.value)));

    const swatch = (colour) => Object.assign(document.createElement("span"), { className: "swatch", style: `background: ${colour}` });

    $("#relationkey").replaceChildren(
        ...[
            ["var(--allied)", "Allies: they fight side by side"],
            ["var(--neutral)", "Neutral"],
            ["var(--hostile)", "At war"],
            ["var(--vassal)", "One rules the other"],
        ].map(([colour, text]) => {
            const li = document.createElement("li");

            li.append(swatch(colour), text);

            return li;
        }),
    );
}

function setMight(might) {
    state.might = might;
    $("#might").value = String(might);
    $("#mightvalue").textContent = String(might);
    state.war?.setMight(might);
    remember();
}

function remember() {
    history.replaceState(null, "", `?seed=${state.seed}&might=${state.might}`);
}

// Lay out a world and start its war (after letting the page show it's working on it)
function layOut(seed) {
    play(false);
    state.seed = seed;
    $("#seed").value = seed;
    $("#status").hidden = false;

    ready = new Promise((resolve) => {
        requestAnimationFrame(() =>
            setTimeout(() => {
                state.plan = planWorld(seed);
                state.land = paintLand(state.plan);
                state.war = new War(state.plan);
                state.war.setMight(state.might);
                state.news = [];
                remember();
                $("#status").hidden = true;
                showRealms();
                showNews();
                draw();
                resolve(state.war);
            }, 30),
        );
    });

    return ready;
}

listen();
setMight(state.might);
fit();
layOut(state.seed);

window.warViewer = {
    state,
    get ready() {
        return ready;
    },
    step,
    play,
    draw,
    describe,
    toScreen,
    races: RACES,
};
