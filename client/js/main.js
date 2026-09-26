// Pellagos: the page's screens, from loading to playing.
//
//  1. Loading: downloads everything (manifest.js), showing each group of files and how far it has
//     got, then starts the 3D view and unpacks the body the characters are made from.
//  2. The title: carry on with the saved character, or make a new one; debug mode on or off.
//  3. Making a character (creator.js): body, face, colours and hair; a weapon; a name.
//  4. Building the world (the town, the characters, their shaders) and playing (game.js), until
//     the menu goes back to the title.
//
// Nothing here imports Three.js: it and the rest of the game are downloaded by the loader first,
// and only then imported.
//
// ?play goes straight into a game with a random character (with ?weapon=, ?seed= and ?quality=).

import { registerServiceWorker } from "./app/device.js";
import { Debug } from "./app/debug.js";
import { formatBytes, Loader } from "./app/loader.js";
import { MANIFEST } from "./app/manifest.js";
import { loadSave, loadSettings, loadTalks, newSeed, saveSettings, saveTalks, writeSave } from "./app/save.js";
import { WEAPONS } from "./core/weapons.js";

const params = new URLSearchParams(location.search);
const canvas = document.querySelector("#view");
const $ = (selector) => document.querySelector(selector);

const settings = loadSettings();
const debug = new Debug($("#debug"), { settings, onChange: applySetting });

// What's been loaded and made: the loader, the game's modules, the view and character kit, the
// heads-up display, and the game being played
const state = { loader: null, modules: null, session: null, hud: null, game: null, save: null, creator: null };

window.pellagos = {
    get game() {
        return state.game;
    },
    get creator() {
        return state.creator;
    },
    get session() {
        return state.session;
    },
    get loader() {
        return state.loader;
    },
    debug,
    playing: false,
};

function show(id) {
    for (const screen of document.querySelectorAll(".screen")) {
        screen.hidden = screen.id !== id;
    }

    document.body.dataset.screen = id;
}

// --- Loading ---

function setProgress(share, status, amount = "") {
    const bar = $("#loadbar");

    bar.querySelector(".fill").style.transform = `scaleX(${Math.max(0, Math.min(1, share)).toFixed(4)})`;
    bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));

    if (status !== undefined) {
        $("#loadstatus").textContent = status;
    }

    $("#loadamount").textContent = amount;
}

// A row for each group of files: what it is, how much of it has come, and its own bar
function listGroups(loader) {
    const rows = loader.groups.map((group) => {
        const size = Object.assign(document.createElement("span"), { className: "size" });
        const label = Object.assign(document.createElement("span"), { className: "label", textContent: group.label });
        const detail = Object.assign(document.createElement("span"), { className: "detail", textContent: `${group.detail} · ${group.files.length} file${group.files.length === 1 ? "" : "s"}` });
        const bar = Object.assign(document.createElement("div"), { className: "progress" });
        const fill = Object.assign(document.createElement("div"), { className: "fill" });
        const row = document.createElement("li");

        bar.append(fill);
        row.append(label, size, detail, bar);

        return { group, row, size, fill };
    });

    $("#loadlist").replaceChildren(...rows.map(({ row }) => row));

    return () => {
        for (const { group, row, size, fill } of rows) {
            size.textContent = group.loaded >= group.total ? formatBytes(group.total) : `${formatBytes(group.loaded)} of ${formatBytes(group.total)}`;
            fill.style.transform = `scaleX(${(group.total ? group.loaded / group.total : 1).toFixed(4)})`;
            row.classList.toggle("done", group.done === group.files.length);
        }
    };
}

// Downloads count for most of the bar; starting the view and unpacking the body the rest
const DOWNLOAD_SHARE = 0.85;

async function load() {
    show("loading");

    const loader = new Loader(MANIFEST);
    const refresh = listGroups(loader);
    let drawn = 0;

    state.loader = loader;
    debug.watch({ loader });

    await loader.load(() => {
        const now = performance.now();

        // At most one redraw a frame's worth of time
        if (now - drawn > 50 || loader.loaded >= loader.total) {
            drawn = now;
            refresh();
            setProgress((loader.loaded / loader.total) * DOWNLOAD_SHARE, `Downloading ${loader.current.split("/").pop() || "…"}`, `${formatBytes(loader.loaded)} of ${formatBytes(loader.total)}`);
        }
    });

    refresh();

    const steps = [];
    const step = (label, share) => {
        steps.push({ label, at: performance.now() });
        setProgress(DOWNLOAD_SHARE + share * (1 - DOWNLOAD_SHARE), label, `${formatBytes(loader.total)} downloaded in ${(loader.time / 1000).toFixed(1)} s`);
    };

    step("Starting the 3D engine", 0);

    const started = performance.now();
    const [session, creator, hud] = await Promise.all([import("./app/session.js"), import("./app/creator.js"), import("./app/hud.js")]);
    const imported = performance.now();

    state.modules = { ...session, ...creator, ...hud };
    session.readModelsFrom(loader.urlOf);
    state.session = await session.createSession({
        canvas,
        quality: settings.quality === "auto" ? undefined : settings.quality,
        sound: settings.sound,
        volumes: { effects: settings.effectsVolume, environment: settings.environmentVolume, music: settings.musicVolume },
        fetch: loader.loadFile,
        onProgress: (label) => step(label, label.startsWith("Unpacking") ? 0.3 : 0.15),
    });
    state.hud = new hud.Hud($("#hud"));
    applyViewSettings();
    debug.watch({ view: state.session.view, builds: { modules: imported - started, body: performance.now() - imported } });
    setProgress(1, "Ready");
}

// --- The title ---

function title() {
    const save = loadSave(WEAPONS);
    const continueButton = $("#continuebutton");
    const newButton = $("#newbutton");
    const note = $("#savenote");

    state.save = save;
    show("title");
    continueButton.hidden = !save;
    note.hidden = !save;
    newButton.textContent = "New character";
    delete newButton.dataset.confirm;

    if (save) {
        continueButton.textContent = `Continue as ${save.hero.name}`;
        note.textContent = `${WEAPONS[save.hero.weapon].label}. Started ${new Date(save.created).toLocaleDateString()}.`;
        continueButton.focus();
    } else {
        newButton.focus();
    }
}

$("#continuebutton").addEventListener("click", () => state.save && play(state.save));

$("#newbutton").addEventListener("click", (event) => {
    const button = event.currentTarget;

    // Making a new character replaces the saved one: ask first
    if (state.save && !button.dataset.confirm) {
        button.dataset.confirm = "yes";
        button.textContent = `Replace ${state.save.hero.name}? Tap again`;

        return;
    }

    create();
});

$("#debugswitch").checked = settings.debug;
$("#minimapswitch").checked = settings.minimap;
$("#soundswitch").checked = settings.sound;
$("#debugswitch").addEventListener("change", (event) => applySetting("debug", event.target.checked));

// --- Making a character ---

async function create() {
    const { Creator } = state.modules;
    const { view, kit } = state.session;

    show("create");
    state.creator = new Creator({ view, kit });

    const hero = await state.creator.run();

    state.creator = null;

    if (!hero) {
        title();

        return;
    }

    const save = { hero, seed: newSeed(), created: new Date().toISOString() };

    if (!writeSave(save)) {
        console.warn("This browser won't keep the character: it will be forgotten when the page closes.");
    }

    play(save);
}

// --- Playing ---

async function play(save) {
    const { createGame } = state.modules;
    const { view, kit, sound } = state.session;

    state.game?.dispose();
    show("loading");
    $("#loadlist").replaceChildren();
    setProgress(0, "Building the world");

    const game = createGame({ view, kit, sound, hud: state.hud, hero: save.hero, seed: save.seed, talks: loadTalks(save), onTalk: (talks) => saveTalks(save, talks) });

    state.game = game;
    await game.build(({ label, done, total }) => setProgress(done / total, label, `${done} of ${total}`));
    game.showSquares(settings.squares);
    showMinimap(settings.minimap);
    debug.watch({ game });
    show("hud");
    game.start();
    window.pellagos.playing = true;
}

function pause() {
    if (!state.game?.running) {
        return;
    }

    state.game.stop();
    menuPage("main");
    $("#menu").showModal();
}

function resume() {
    $("#menu").close();
    state.game?.start();
}

// The menu's pages: the main one, and Game options
function menuPage(page) {
    const options = page === "options";

    $("#menumain").hidden = options;
    $("#menuoptions").hidden = !options;
    $("#menu").setAttribute("aria-labelledby", options ? "optionstitle" : "menutitle");
    (options ? $("#minimapswitch") : $("#resumebutton")).focus();
}

function quit() {
    $("#menu").close();
    state.game?.dispose();
    state.game = null;
    window.pellagos.playing = false;
    debug.watch({ game: null });
    title();
}

$("#menubutton").addEventListener("click", pause);
$("#resumebutton").addEventListener("click", resume);
$("#quitbutton").addEventListener("click", quit);
$("#optionsbutton").addEventListener("click", () => menuPage("options"));
$("#optionsback").addEventListener("click", () => menuPage("main"));
$("#minimapswitch").addEventListener("change", (event) => applySetting("minimap", event.target.checked));
$("#soundswitch").addEventListener("change", (event) => applySetting("sound", event.target.checked));

// How loud each kind of sound is: as the slider moves, and remembered when let go. Moving the
// effects or environment slider plays a little of it (the music is playing anyway)
const PREVIEWS = { effects: "slash", environment: "bird" };
let previewed = 0;

for (const slider of document.querySelectorAll(".volume input")) {
    const bus = slider.dataset.bus;
    const key = `${bus}Volume`;
    const output = slider.parentElement.querySelector("output");
    const show = () => (output.textContent = `${slider.value}%`);

    slider.value = Math.round(settings[key] * 100);
    show();
    slider.addEventListener("input", () => {
        const sound = state.session?.sound;

        show();
        sound?.setVolume(bus, slider.value / 100);

        if (PREVIEWS[bus] && performance.now() - previewed > 300) {
            previewed = performance.now();
            sound?.play(PREVIEWS[bus]);
        }
    });
    slider.addEventListener("change", () => {
        settings[key] = slider.value / 100;
        saveSettings({ [key]: settings[key] });
    });
}

function showVolumes(on) {
    $("#volumes").classList.toggle("off", !on);

    for (const slider of document.querySelectorAll(".volume input")) {
        slider.disabled = !on;
    }
}

showVolumes(settings.sound);

// Escape goes back from Game options, and closes the menu from the main page
$("#menu").addEventListener("cancel", (event) => {
    event.preventDefault();

    if ($("#menumain").hidden) {
        menuPage("main");
    } else {
        resume();
    }
});
$("#zoomin").addEventListener("click", () => state.session?.view.zoom(0.8));
$("#zoomout").addEventListener("click", () => state.session?.view.zoom(1.25));

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.dataset.screen === "hud" && !$("#menu").open) {
        pause();
    }
});

window.addEventListener("resize", () => state.session?.view.resize());

// Browsers let a page make sound only once it's been tapped, clicked or typed on (and which of
// these counts differs: Safari on iPhones takes the end of a touch, not its start)
for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
    document.addEventListener(type, () => state.session?.sound.unlock(), { capture: true });
}

// Coming back to the page (from another app, or the browser's back and forward cache), the
// sound is started again if the browser stopped it
for (const type of ["pageshow", "focus"]) {
    window.addEventListener(type, () => state.session?.sound.wake());
}

// Pause when the page is hidden (switching apps on a phone), and silence it
document.addEventListener("visibilitychange", () => {
    state.session?.sound.setHidden(document.hidden);

    if (document.hidden) {
        pause();
    }
});

// --- Settings ---

function applySetting(key, value) {
    settings[key] = value;
    saveSettings({ [key]: value });

    if (key === "debug") {
        debug.show(value);
        $("#debugswitch").checked = value;
    } else if (key === "debugFolded") {
        // Nothing more to do: the overlay folds itself
    } else if (key === "squares") {
        state.game?.showSquares(value);
    } else if (key === "minimap") {
        showMinimap(value);
    } else if (key === "sound") {
        state.session?.sound.setEnabled(value);
        showVolumes(value);
    } else {
        applyViewSettings();
    }
}

function showMinimap(on) {
    document.body.dataset.minimap = on ? "on" : "off";
    state.game?.showMinimap(on);
}

function applyViewSettings() {
    const view = state.session?.view;

    if (!view) {
        return;
    }

    const quality = settings.quality === "auto" ? state.modules.detectQuality() : settings.quality;

    view.renderScale = settings.renderScale;
    view.setQuality(quality);
    view.setShadows(settings.shadows);
}

// --- Off we go ---

async function start() {
    debug.show(settings.debug);
    registerServiceWorker();

    try {
        await load();
    } catch (error) {
        console.error(error);
        setProgress(0, "Pellagos couldn't load. Check your connection and try again.", String(error.message ?? error));

        const retry = Object.assign(document.createElement("button"), { type: "button", className: "button primary", textContent: "Try again" });

        retry.addEventListener("click", () => location.reload());
        $("#loadlist").replaceChildren(retry);

        return;
    }

    if (params.has("play")) {
        const { randomHero, suggestName } = await import("./app/heroes.js");
        const hero = randomHero();

        hero.name = suggestName(hero);
        hero.weapon = WEAPONS[params.get("weapon")] ? params.get("weapon") : "sword";
        play({ hero, seed: Number(params.get("seed")) || 1 });

        return;
    }

    title();
}

start();
