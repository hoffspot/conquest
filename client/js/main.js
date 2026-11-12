// Pellagos: the page's screens, from loading to playing.
//
//  1. Loading: downloads everything (manifest.js), showing each group of files and how far it has
//     got, then starts the 3D view and unpacks the body the characters are made from.
//  2. The title: carry on with the saved character, or make a new one; debug mode on or off.
//  3. Making a character (creator.js): body, face, colours and hair; a weapon; a name.
//  4. Building the world (the town, the characters, their shaders) and playing (game.js), until
//     the menu goes back to the title.
//  5. Playing together (docs/WAR.md M11): the world opened to others from the menu (Invite
//     others; or the title's Multiplayer, Host on this Device), or another's joined from the
//     title (Multiplayer, Join a World on another Device), through a relay or a server's broker
//     (app/together.js).
//
// Nothing here imports Three.js: it and the rest of the game are downloaded by the loader first,
// and only then imported.
//
// ?play goes straight into a game with a random character, the same one every time for a seed
// (with &weapon=, &seed=, &people=, &hero= for another character of the same seed, and
// &quality=low, medium or high, drawn so this once whatever's chosen in Game options): the
// tests' and developers' way in, not a player's. ?join=CODE opens Join a World on another Device
// with the code in it (&at= the server it's looked for on).

import { ASSETS } from "./app/assets.js";
import { Backdrop } from "./app/backdrop.js";
import { Crest } from "./app/crest.js";
import { mappedOf, releaseOf } from "./app/catalog.js";
import { isInstalledApp, isIOS, isTouchScreen, keepDownloads, keepLoaded, lockLandscape, looked, registerServiceWorker } from "./app/device.js";
import { Debug } from "./app/debug.js";
import { Fetcher } from "./app/fetcher.js";
import { FullScreen } from "./app/fullscreen.js";
import { edgesNote, powerNote } from "./app/graphicsnotes.js";
import { putOff, suggestHomeScreen } from "./app/homescreen.js";
import { formatBytes, Loader } from "./app/loader.js";
import { MANIFEST } from "./app/manifest.js";
import { linkReach, REACH_WORDS } from "./app/multiplayer.js";
import { Pointer } from "./app/pointer.js";
import { forgetInWorld, inWorldOf, keepInWorld, lastInWorld, REJOIN, REJOIN_STAGES, rejoinWords } from "./app/rejoin.js";
import { telemetry } from "./app/telemetry.js";
import { crashedIn, crashesFor, forgetCrashes, keepCrash, letGoCrash, REFUSED_FOR_GOOD } from "./app/crash-reports.js";
import { startsUpdate, Updater } from "./app/updater.js";
import { builtAt, codeVersion } from "./app/version.js";
import { blocksOf, enterWorld, exportCharacter, forgetCharacter, forgetWorld, hearRefusal, keepCharacter, keepVisitor, loadCharacters, loadExplored, loadFollowers, loadLegends, loadMarkers, loadRoll, loadMessages, loadPin, loadPlace, loadProgress, loadSave, loadSettings, loadStanding, loadTalks, loadTold, loadVitals, loadWheels, loadWorld, loadWorlds, makeWorld, MOST_CHARACTERS, MOST_WORLDS, newSeed, PLAY_SETTINGS, playedSave, playSettingsOf, renameWorld, saveExplored, saveFollowers, saveMarkers, saveMessages, savePin, savePlace, saveProgress, saveSettings, saveStanding, saveTalks, saveTold, saveVitals, saveWheels, saveWorld, stayOf, visitorOf, writeSave } from "./app/save.js";
import { ACTIONS as PAD_ACTIONS, asTheyCome, BAR_SLOTS, bindingsOf, bindingWords, rebind, SYMBOL_NAMES, symbolOf, takenFrom } from "./app/gamepad.js";
import { PadPlay } from "./app/padplay.js";
import { actionFor, GROUPS, KEY_ACTIONS, keyMap, keyOf as keyPressed, keysAsCame, keysChanged, keysOf, keyWords, mouseOf, setKey } from "./app/keys.js";
import { guessHandheld, handheldOf, HANDHELDS, presetOf, stepsOf } from "./app/handhelds.js";
import { MARKER_ICONS, MARKER_NAMES, MARKERS } from "./core/markers.js";
import { Steps } from "./core/steps.js";
import { WEAPONS } from "./core/weapons.js";
import { released } from "./world/release.js";

const params = new URLSearchParams(location.search);
const canvas = document.querySelector("#view");
const $ = (selector) => document.querySelector(selector);

const settings = loadSettings();

// (The quick start asked to draw at a level, `?play&quality=low`, `medium` or `high`: drawn so
// this once, whatever's chosen in Game options, and not kept unless it's chosen there)
// (A measured run's link may say the level too, whatever else it opens: `?measure=<name>&quality=low`)
if ((params.has("play") || params.has("measure")) && ["low", "medium", "high"].includes(params.get("quality"))) {
    settings.quality = params.get("quality");
}

const debug = new Debug($("#debug"), { settings, onChange: applySetting });

// The paintings behind the loading screen and the title, each in turn (app/backdrop.js); let go of
// once a character's being made or the game's begun
const backdrop = new Backdrop($("#backdrop"));

// The crest over them, the name on it forged as the page opens (app/crest.js); still anywhere else
const crest = new Crest($("#crest"));

// The mouse pointer, a sword over the whole page (Game options: app/pointer.js), told by the game
// what's under it
const pointer = new Pointer();

showPointer();
pointer.start();

// Full screen while playing (Game options: app/fullscreen.js); left any other way, the game pauses
const fullScreen = new FullScreen({
    wanted: settings.fullscreen,
    onLeft: () => pause(),
    onEntered: () => {
        lockLandscape();
        raiseWindows();
    },
});

// A window opened (the menu, a talk) while full screen was being granted: the page gone full screen
// after it covers it, still there to be tapped though not seen, so it's opened again over the page
function raiseWindows() {
    for (const dialog of document.querySelectorAll("dialog[open]")) {
        dialog.close();
        dialog.showModal();
    }
}

// The downloader: the catalog's models, fetched in the background (app/fetcher.js), kept out of
// the way of the game's start and of playing together
const fetcher = new Fetcher();

// What's been loaded and made: the loader, the game's modules, the view and character kit, the
// heads-up display, and the game being played
const state = { dismiss: null, loader: null, modules: null, session: null, hud: null, game: null, save: null, stay: null, joinAs: null, goAs: null, into: null, creator: null, readyCreator: null, worldMap: null, picking: null, travel: null, portal: null, plans: null, planned: null, together: null, joinAfter: null, joinAt: null, pageServer: null, pageRelay: null, building: false, servers: null, serversLoading: null, onServer: null, worldsAfter: null, worldAsk: null, inWorld: null, inWorldEvery: null, goingBackIn: null, everyone: false, hostAs: null, hostAfter: null, hostOn: null, deleting: null, ringKey: null, binding: null };

// A game controller (app/padplay.js): read every frame once one's seen, working the game, its
// windows and the title as touch and keys do
const padPlay = new PadPlay({
    settings,
    game: () => state.game,
    pause: () => pause(),
    openWorldMap: () => openWorldMap(),
    worldMap: () => state.worldMap,
    sound: () => state.session?.sound ?? null,
    message: (text, seconds) => state.game?.hud.message(text, seconds),
    onSeen: () => {
        showController();
        offerHandheld();
    },
    // (Back, over the world: as the menu's key, whatever it's set to: what's open put away, or the menu)
    back: () => state.game?.keyBack() || pause(),
});

window.pellagos = {
    get game() {
        return state.game;
    },
    get telemetry() {
        return telemetry;
    },
    /** Updates downloaded in the background (app/updater.js). */
    get updater() {
        return state.updater;
    },
    /** Whether the page has let go of anything the graphics card has (world/release.js). */
    released: () => released.any,
    get creator() {
        return state.creator;
    },
    /** The character maker got ready while the title's up (readyCreator), till it's opened or let go of. */
    get readyCreator() {
        return state.readyCreator;
    },
    get session() {
        return state.session;
    },
    get loader() {
        return state.loader;
    },
    get worldMap() {
        return state.worldMap;
    },
    get together() {
        return state.together;
    },
    get inWorld() {
        return state.inWorld;
    },
    /** The measured run the page's link asked for (app/measuring.js), once its game's under way; else null. */
    get measured() {
        return measured;
    },
    debug,
    backdrop,
    crest,
    fetcher,
    fullScreen,
    playing: false,
};

// How the game's going, for the debug log (app/telemetry.js), if one's being played
const gameState = () => state.game?.telemetryState?.() ?? { playing: false, building: state.building };

function show(id) {
    for (const screen of document.querySelectorAll(".screen")) {
        screen.hidden = screen.id !== id;
    }

    // (Off the title, to make a character or into a game: Multiplayer and what's open over it closed)
    if (id !== "title") {
        closeMultiplayer();
    }

    document.body.dataset.screen = id;
    backdrop.screen(id);
    crest.screen(id);
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

// How much of the game's loaded, and, if any came from this device (what the service worker
// keeps), how much of it was downloaded: so a load that downloads nothing doesn't look like one
// that downloads everything
function loadedOf(loader) {
    return `${formatBytes(loader.loaded)} of ${formatBytes(loader.total)}${loader.kept ? `, ${formatBytes(loader.downloaded)} downloaded` : ""}`;
}

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
            setProgress((loader.loaded / loader.total) * DOWNLOAD_SHARE, `${loader.currentKept ? "Loading" : "Downloading"} ${loader.current.split("/").pop() || "…"}`, loadedOf(loader));
        }
    });

    refresh();

    const steps = [];
    const step = (label, share) => {
        steps.push({ label, at: performance.now() });
        const time = `${(loader.time / 1000).toFixed(1)} s`;

        setProgress(DOWNLOAD_SHARE + share * (1 - DOWNLOAD_SHARE), label, loader.kept ? `${formatBytes(loader.total)} in ${time}: ${formatBytes(loader.downloaded)} downloaded, the rest from this device` : `${formatBytes(loader.total)} downloaded in ${time}`);
    };

    step("Starting the 3D engine", 0);

    const started = performance.now();

    // (The way-finding first, on its own, and wholly: it waits for its WebAssembly (a top-level
    // await, core/navigation.js), and while it was still waiting, mobile Safari went on with the
    // modules over it in the three below, imported side by side, before those they import were
    // done: "Cannot access 'TALK_REACH' before initialization", and the game didn't load. With it
    // done, nothing left in them waits, and each is run through at once)
    await import("./core/navigation.js");

    const [session, creator, hud] = await Promise.all([import("./app/session.js"), import("./app/creator.js"), import("./app/hud.js")]);
    const imported = performance.now();

    state.modules = { ...session, ...creator, ...hud };
    session.readModelsFrom(loader.urlOf);
    session.fetchModelsWith(fetcher);
    state.session = await session.createSession({
        canvas,
        quality: settings.quality === "auto" ? undefined : settings.quality,
        sound: settings.sound,
        volumes: { effects: settings.effectsVolume, environment: settings.environmentVolume, music: settings.musicVolume },
        fetch: loader.loadFile,
        onProgress: (label) => step(label, label.startsWith("Unpacking") ? 0.3 : 0.15),
    });
    state.hud = new hud.Hud($("#hud"));
    // (Whether the picture's edges are smoothed: as the quality it was made at has them, till the
    // game's loaded again, whatever's chosen since. Game options says so: showQuality)
    state.edgesMade = Boolean(state.modules.QUALITY[state.session.view.qualityName].antialias);

    // (The drawing lost, as phones do when short of memory: the game paused, where the player is
    // kept, and the player told, until it's given back and the shaders made again. What the page
    // let go of once the graphics card had it can't be given it again (world/release.js), so then
    // the page's loaded again instead, to carry on from where the player was kept)
    state.session.view.onLost = () => {
        telemetry.lost(gameState);
        pause();
        state.hud.message("The picture was lost. Waiting for it to come back…", 0);
    };
    state.session.view.onRestored = async () => {
        if (released.any) {
            keepPlace();
            state.hud.message("The picture's back. Loading the game again…", 0);
            location.reload();

            return;
        }

        await state.session.view.renderer.compileAsync(state.session.view.scene, state.session.view.camera);
        state.hud.message("");
    };
    applyViewSettings();
    debug.watch({ view: state.session.view, builds: { modules: imported - started, body: performance.now() - imported } });
    setProgress(1, "Ready");
}

// --- The title ---

function title() {
    const save = loadSave(WEAPONS);

    fullScreen.stop();
    const kept = loadCharacters(WEAPONS);
    const worlds = loadWorlds();
    const continueButton = $("#continuebutton");
    const note = $("#savenote");

    state.save = save;
    show("title");
    $("#titlenote").hidden = true;
    $("#titleupdate").hidden = !state.updater?.ready;
    showHomeScreen(kept);
    state.updater?.check();
    continueButton.hidden = !save;
    note.hidden = !save;
    // (Shown with none kept too: to bring one in from a file, or make a world)
    $("#savedbutton").hidden = false;
    $("#savedbutton").textContent = kept.length ? `Characters on this device (${kept.length})` : "Characters on this device";
    $("#localworldsbutton").textContent = worlds.length ? `Worlds on this device (${worlds.length})` : "Worlds on this device";

    if (save) {
        const { about, where } = describe(save);

        continueButton.textContent = `Continue as ${save.hero.name}`;
        note.textContent = `${about} · ${where}`;
        continueButton.focus();
    } else {
        $("#newbutton").focus();
    }

    readyCreator();
    frontDoor();
}

// On an iPhone or iPad in a browser tab, the title's word to add the game to the Home Screen, and
// why (app/homescreen.js), till it's put off: with a word to take the characters kept here along
// first, if there are any
function showHomeScreen(kept) {
    $("#homescreen").hidden = !suggestHomeScreen({ ios: isIOS(), touch: isTouchScreen(), installed: isInstalledApp(), after: settings.homeScreenAfter });
    $("#homescreenexport").hidden = kept.length === 0;
    // (An iPad's an iPad, though it says it's a Mac: device.js isIOS)
    $("#homescreendevice").textContent = /iPad|Macintosh/.test(navigator.userAgent) ? "iPad" : "iPhone";
}

for (const [id, how] of [["#homescreenlater", "later"], ["#homescreennever", "never"]]) {
    $(id).addEventListener("click", () => {
        applySetting("homeScreenAfter", putOff(how));
        $("#homescreen").hidden = true;
    });
}

// The character maker got ready while the title's up, its new character built a little each frame
// (app/creator.js prepare), so New character opens at once, or sooner; let go of as a game's begun
// instead (dropReadyCreator)
function readyCreator() {
    const Creator = state.modules?.Creator;

    if (!Creator || !state.session || state.readyCreator || state.creator) {
        return;
    }

    const { view, kit } = state.session;

    state.readyCreator = new Creator({ view, kit });
    state.readyCreator.prepare();
}

// The character maker got ready on the title let go of, a game begun instead
function dropReadyCreator() {
    state.readyCreator?.dispose();
    state.readyCreator = null;
}

// The game opened from a world server's own address (its front door): the server remembered, and
// its worlds shown on the title, each joined with a tap: those open to anyone, those it lists, and
// those a key or ticket's held for here (as Join a World Hosted on a Server shows them)
async function frontDoor() {
    const card = await pageServer();

    if (!card || $("#title").hidden) {
        return;
    }

    const { addressOf } = await serversOf();
    const record = state.servers.remember(addressOf(location.origin), { name: card.server.name ?? null });
    const listed = new Map(card.worlds.map((world) => [world.id, world]));
    const ids = [...new Set([...Object.keys(record.worlds ?? {}), ...listed.keys()])];
    const name = card.server.name ?? location.host;

    $("#titleservername").textContent = `Worlds on ${name}`;
    $("#titleservernote").textContent = ids.length
        ? "Tap one to go in. If it's your first time, you make a character first."
        : "None of its worlds is open to everyone. If you were sent an invite link, open that to go in; or ask the server's owner for one.";
    $("#titleworlds").replaceChildren(
        ...ids.map((id) => {
            const world = listed.get(id) ?? null;
            const held = record.worlds?.[id];
            const row = document.createElement("li");

            row.dataset.world = id;
            row.append(
                worldCard({
                    name: world?.name ?? held?.name ?? id,
                    about: world ? `${world.description ? `${world.description} · ` : ""}${world.players} of ${world.most} playing` : "Yours to come back to",
                    badge: world ? badgeOf(world) : "",
                    when: world?.offline ? "Offline for upkeep" : held?.role === "owner" ? "You own it: carry on" : held?.key || held?.ticket ? "Carry on" : world?.open ? "Open to anyone: tap to join" : "Needs an invite link or key",
                    onClick: async () => {
                        await openWorlds();
                        joinServerWorld(state.servers.get(record.key) ?? record, id, world);
                    },
                }),
            );

            return row;
        }),
    );
    $("#titleserver").hidden = false;
}

// A kept character as the title's cards show them: their name, people, what they wield (as they
// have now), their gold, which world on this device they're in, and when they last played
function describe(save) {
    const progress = loadProgress(save);
    const held = progress.gear?.mainHand?.id;
    const weapon = WEAPONS[held] ? WEAPONS[held].label : `${WEAPONS[save.hero.weapon].label}${save.hero.boots ? " and spiked boots" : ""}`;
    const people = peopleOf(save.hero);
    const gold = Number.isFinite(progress.gold) ? ` · ${progress.gold} gold` : "";

    const world = stayOf(save)?.world;

    return {
        name: save.hero.name,
        about: `${people[0].toUpperCase()}${people.slice(1)} · ${weapon}${gold}`,
        where: world ? `in ${world.name}` : "in no world yet",
        when: `Last played ${new Date(save.played ?? save.created).toLocaleDateString()}`,
    };
}

// A kept character as they go into another's world: who they are and what they carry. The world
// they go into keeps the rest of them, its own (what its folk know of them, where they stand, who
// follows them there: docs/SERVER.md, "Visitors"), as the worlds on this device keep theirs
const characterOf = (save) => ({ hero: save.hero, progress: loadProgress(save) });

// A hero's people, as said ("human", "dark elf")
const peopleOf = (hero) => (hero.race && hero.race !== "human" ? hero.race.replace(/([A-Z])/g, " $1").toLowerCase() : "human");

$("#continuebutton").addEventListener("click", () => state.save && play(state.save));

// Making a new character: with six kept, one's chosen to make way for them first
$("#newbutton").addEventListener("click", () => {
    if (loadCharacters(WEAPONS).length >= MOST_CHARACTERS) {
        openCharacters("replace");

        return;
    }

    create();
});

$("#savedbutton").addEventListener("click", () => openCharacters("play"));
$("#localworldsbutton").addEventListener("click", () => openLocalWorlds("list"));

// --- The characters kept ---

// Who's to be played (`mode` "play": in the world they're in; or exported or forgotten, each by
// its own button; all of them exported, or more brought in from a file), played in a world on
// this device ("enter": state.into), replaced by a new character ("replace"), or brought to
// someone's world ("join")
function openCharacters(mode) {
    const dialog = $("#characters");
    const kept = loadCharacters(WEAPONS);

    if (!kept.length && mode !== "play") {
        dialog.close();
        title();

        return;
    }

    const into = mode === "enter" ? state.into : null;
    const notes = {
        replace: `${MOST_CHARACTERS} characters are kept, the most there can be. Choose one to be replaced by your new character.`,
        join: "Choose who comes with you.",
        worlds: "Choose who comes with you.",
        enter: "Those who've been here carry on where they left off. Anyone else comes new to its folk, with all they carry and have grown into.",
        play: kept.length ? `Choose who to play: they carry on in the world they're in (to take one into another, choose it in Worlds on this device). Up to ${MOST_CHARACTERS} are kept.` : "No characters are kept here yet. Make a new one, or bring one in from a file the game exported.",
    };

    dialog.dataset.mode = mode;
    $("#characterstitle").textContent = mode === "replace" ? "Make way for a new character" : mode === "join" || mode === "worlds" ? "Who comes" : into ? `Who goes into ${into.name}?` : "Characters on this device";
    $("#charactersnote").textContent = notes[mode];
    $("#charactersnew").hidden = !(mode === "join" || mode === "enter") || kept.length >= MOST_CHARACTERS;
    $("#charactersexport").hidden = mode !== "play" || kept.length < 2;
    $("#charactersimport").hidden = mode !== "play";
    $("#characterlist").replaceChildren(
        ...kept.map((save) => {
            const { name, about, where, when } = describe(save);
            const here = into && save.world === into.id ? "here now" : into?.places[save.id] ? "been here before" : into ? "new here" : null;
            const row = document.createElement("li");
            const pick = Object.assign(document.createElement("button"), { type: "button", className: "character" });

            pick.dataset.id = save.id;
            pick.append(Object.assign(document.createElement("span"), { className: "name", textContent: mode === "replace" ? `Replace ${name}` : name }), Object.assign(document.createElement("span"), { className: "about", textContent: `${about} · ${here ?? where}` }), Object.assign(document.createElement("span"), { className: "when", textContent: when }));
            pick.addEventListener("click", () => chosen(mode, save));
            row.append(pick);

            if (mode === "play") {
                const side = Object.assign(document.createElement("div"), { className: "side" });
                const share = Object.assign(document.createElement("button"), { type: "button", className: "export", textContent: "Export", title: `Save ${name} as a file, to keep or to bring in elsewhere` });
                const forget = Object.assign(document.createElement("button"), { type: "button", className: "forget", textContent: "Delete", title: `Delete ${name}` });

                share.setAttribute("aria-label", `Export ${name}`);
                share.addEventListener("click", () => exportCharacters([save]));
                forget.setAttribute("aria-label", `Delete ${name}`);
                forget.addEventListener("click", () => askForget(save, "delete"));
                side.append(share, forget);
                row.append(side);
            }

            return row;
        }),
    );

    if (!dialog.open) {
        dialog.showModal();
    }

    $("#characterlist button")?.focus();
}

// A kept character chosen: played; brought to someone's world; or, to make way for a new one,
// asked about first
function chosen(mode, save) {
    if (mode === "replace") {
        askForget(save, "replace");

        return;
    }

    $("#characters").close();

    if (mode === "join") {
        state.joinAs = save;
        showJoinWho();

        return;
    }

    if (mode === "worlds") {
        state.joinAs = save;
        showWorldsWho();

        return;
    }

    if (mode === "enter") {
        $("#localworlds").close();
    }

    play(save, mode === "enter" ? { world: state.into?.id } : {});
}

// Asked before a character's forgotten for good ("delete": at once; "replace": once the new
// character that takes their place is made)
function askForget(save, why) {
    const dialog = $("#forget");
    const { name } = save.hero;

    dialog.dataset.id = save.id;
    dialog.dataset.why = why;
    $("#forgettitle").textContent = why === "replace" ? `Replace ${name}?` : `Delete ${name}?`;
    $("#forgetnote").textContent = `${name} will be permanently deleted, with what they carry and what they've learnt${why === "replace" ? ", once your new character is made" : ""}. The worlds they've been in stay, in Worlds on this device. This can't be undone.`;
    $("#forgetgo").textContent = why === "replace" ? `Replace ${name}` : `Delete ${name}`;
    $("#forgetback").textContent = `Keep ${name}`;
    dialog.showModal();
    $("#forgetback").focus();
}

$("#forgetgo").addEventListener("click", () => {
    const dialog = $("#forget");
    const { id, why } = dialog.dataset;

    dialog.close();

    if (why === "replace") {
        $("#characters").close();
        create({ replacing: id });

        return;
    }

    if (why === "world") {
        forgetWorld(id);
        title();
        openLocalWorlds("list");

        return;
    }

    forgetCharacter(id);

    if (state.joinAs?.id === id) {
        state.joinAs = null;
    }

    title();
    openCharacters("play");
});

$("#forgetback").addEventListener("click", () => $("#forget").close());

// --- The worlds kept on this device ---

// Names, as said ("Ash, Briar and Cole")
const listOf = (names) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? ""));

// The worlds on this device (`mode` "list": one played in by choosing who goes in, renamed or
// deleted by its own buttons, or a new one made), or where a character in none goes ("go": `save`)
function openLocalWorlds(mode, save = null) {
    const dialog = $("#localworlds");
    const worlds = loadWorlds();
    const kept = loadCharacters(WEAPONS);
    const names = new Map(kept.map((one) => [one.id, one.hero.name]));
    const who = save?.hero.name;

    state.goAs = mode === "go" ? save : null;
    dialog.dataset.mode = mode;
    $("#localworldstitle").textContent = mode === "go" ? `Where does ${who} go?` : "Worlds on this device";
    $("#localworldsnote").textContent =
        mode === "go"
            ? `${who} isn't in any world on this device. Choose one to go into, or make a new one: anywhere they haven't been, they come new to its folk, with all they carry and have grown into.`
            : worlds.length
              ? `Each has its own land and its own war, and remembers everyone who's been in it. Choose one, then who goes in. Up to ${MOST_WORLDS} are kept.`
              : "No worlds are kept here yet. Make one, or make a new character: they start in a world of their own.";
    $("#localworldsnew").hidden = worlds.length >= MOST_WORLDS;
    $("#localworldlist").replaceChildren(
        ...worlds.map((world) => {
            const been = Object.keys(world.places)
                .map((id) => names.get(id))
                .filter(Boolean);
            const visitors = Object.values(world.places).filter((place) => typeof place?.visitor === "string").length;
            const guests = visitors ? `${visitors} visitor${visitors === 1 ? "" : "s"}` : "";
            const war = loadWorld(world);
            const whose = mode === "go" ? (world.places[save.id] ? `${who} has been here` : `new to ${who}`) : been.length || visitors ? `${listOf([...been, ...(guests ? [guests] : [])])} ${been.length + visitors === 1 ? "has" : "have"} been here` : "nobody's been here yet";
            const row = document.createElement("li");
            const pick = Object.assign(document.createElement("button"), { type: "button", className: "character" });

            pick.dataset.id = world.id;
            pick.append(
                Object.assign(document.createElement("span"), { className: "name", textContent: world.name }),
                Object.assign(document.createElement("span"), { className: "about", textContent: `${war ? `The war at turn ${war.turn ?? 0}` : "Its war not begun"} · ${whose}` }),
                Object.assign(document.createElement("span"), { className: "when", textContent: `Last played ${new Date(world.played ?? world.created).toLocaleDateString()}` }),
            );
            pick.addEventListener("click", () => {
                if (mode === "go") {
                    dialog.close();
                    play(save, { world: world.id });

                    return;
                }

                state.into = world;

                if (!kept.length) {
                    dialog.close();
                    create({ into: world.id });

                    return;
                }

                openCharacters("enter");
            });
            row.append(pick);

            if (mode === "list") {
                const side = Object.assign(document.createElement("div"), { className: "side" });
                const rename = Object.assign(document.createElement("button"), { type: "button", className: "export", textContent: "Rename", title: `Give ${world.name} another name` });
                const forget = Object.assign(document.createElement("button"), { type: "button", className: "forget", textContent: "Delete", title: `Delete ${world.name}` });

                rename.setAttribute("aria-label", `Rename ${world.name}`);
                rename.addEventListener("click", () => askLocalWorld({ world }));
                forget.setAttribute("aria-label", `Delete ${world.name}`);
                forget.addEventListener("click", () => askForgetWorld(world));
                side.append(rename, forget);
                row.append(side);
            }

            return row;
        }),
    );

    if (!dialog.open) {
        dialog.showModal();
    }

    $("#localworldlist button")?.focus();
}

$("#localworldsnew").addEventListener("click", () => {
    const save = $("#localworlds").dataset.mode === "go" ? state.goAs : null;

    askLocalWorld({ made: save ? (world) => ($("#localworlds").close(), play(save, { world: world.id })) : null });
});
$("#localworldsback").addEventListener("click", () => $("#localworlds").close());

// A world on this device made (its name, and its seed: a new one, or one given to make a land
// again), then shown with the others or gone into (`made`); or one renamed (`world`)
function askLocalWorld({ world = null, made = null } = {}) {
    const name = textField("worldaskname", { maxLength: 60, value: world?.name ?? "", placeholder: "Thornvale", autocapitalize: "words" });
    const seed = textField("worldaskseed", { inputMode: "numeric", maxLength: 10, placeholder: "Empty for a new land" });

    askWorld({
        title: world ? `Rename ${world.name}` : "A new world",
        note: world ? "" : "A world of its own on this device: its own land, made from its seed, and its own war. Any of your characters can go into it, and it remembers each who does.",
        fields: world ? [worldField("World's name", name)] : [worldField("World's name", name), worldField("Seed", seed), helpBlock("Its seed", ["The same seed makes the same land: give one to make a land you've played before again, with a war of its own. Leave it empty for a new one."])],
        go: world ? "Rename" : "Make it",
        onGo: async () => {
            if (!name.value.trim()) {
                $("#worldaskstatus").textContent = "Give the world a name.";

                return false;
            }

            if (world) {
                renameWorld(world.id, name.value);
                title();
                openLocalWorlds("list");

                return true;
            }

            const given = seed.value.trim();

            if (given && !(/^\d+$/.test(given) && Number(given) >= 1 && Number(given) <= 2147483646)) {
                $("#worldaskstatus").textContent = "A seed is a whole number from 1 to 2147483646 (or nothing, for a new land).";

                return false;
            }

            const { world: kept, error } = makeWorld({ name: name.value, ...(given ? { seed: Number(given) } : {}) });

            if (!kept) {
                $("#worldaskstatus").textContent = error === "full" ? `${MOST_WORLDS} worlds are kept, the most there can be: delete one first.` : "This browser won't keep another world.";

                return false;
            }

            title();

            if (made) {
                $("#worldask").close();
                made(kept);

                return true;
            }

            openLocalWorlds("list");

            return true;
        },
    });
}

// Asked before a world on this device is forgotten for good
function askForgetWorld(world) {
    const dialog = $("#forget");

    dialog.dataset.id = world.id;
    dialog.dataset.why = "world";
    $("#forgettitle").textContent = `Delete ${world.name}?`;
    $("#forgetnote").textContent = `${world.name} will be permanently deleted: its war, and what its folk remember of everyone who's been there. Your characters stay, with all they carry and have grown into. This can't be undone.`;
    $("#forgetgo").textContent = `Delete ${world.name}`;
    $("#forgetback").textContent = `Keep ${world.name}`;
    dialog.showModal();
    $("#forgetback").focus();
}

// Characters saved as a file (app/character-file.js: loaded once it's wanted, as it brings the
// game's rules with it), as the browser downloads one
async function exportCharacters(saves) {
    const { characterFile } = await import("./app/character-file.js");
    const { name, text } = characterFile(saves);

    download(name, text);
}

// A file (its name and text) as the browser downloads one
function download(name, text) {
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "application/json" })), download: name });

    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}

// The characters in a file brought in, each as a new character kept here: said who came (and
// what of them couldn't, or was put right for this version of the game), and who didn't, and why
async function importCharacters(file) {
    const { CHARACTER_LIMIT } = await import("./app/character-file.js");

    if (file.size > CHARACTER_LIMIT) {
        showImported("That file is far too big to be a character file.", []);

        return;
    }

    keepFromFile(await file.text());
}

// The characters in a character file's text (one brought in, or a hero taken home from a world
// on a server) kept here, as importCharacters says. Returns how many were kept
async function keepFromFile(text) {
    const { readCharacterFile } = await import("./app/character-file.js");
    let read;

    try {
        read = readCharacterFile(text);
    } catch (error) {
        showImported(error.message, []);

        return 0;
    }

    const why = {
        here: "they're kept here already.",
        full: `${MOST_CHARACTERS} characters are kept, the most there can be: delete one to make room, then bring the file in again.`,
        worlds: `${MOST_WORLDS} worlds are kept, the most there can be, and they come with theirs: delete one in Worlds on this device to make room, then bring the file in again.`,
        storage: "this browser wouldn't keep them.",
    };
    const said = read.map((one) => {
        const kept = one.error ? { error: null } : keepCharacter(one.exported);

        if (kept.save) {
            const { about, where } = describe(kept.save);

            return { name: one.name, about: `${about} · ${where}`, says: one.left.length ? ["Changed to suit this version of the game:", ...one.left] : [], brought: true };
        }

        return { name: one.name, says: [one.error ? `Not brought in. ${one.error}` : `Not brought in: ${why[kept.error]}`] };
    });
    const brought = said.filter((one) => one.brought).length;

    title();
    showImported(brought ? `${brought === 1 ? "One character is" : `${brought} characters are`} now among the characters on this device${said.length > brought ? `; ${said.length - brought} couldn't be` : ""}.` : "No one was brought in.", said);

    return brought;
}

function showImported(note, said) {
    $("#importednote").textContent = note;
    $("#importedlist").replaceChildren(
        ...said.map(({ name, about, says }) => {
            const row = document.createElement("li");

            row.append(Object.assign(document.createElement("span"), { className: "name", textContent: name }));

            if (about) {
                row.append(Object.assign(document.createElement("span"), { className: "about", textContent: about }));
            }

            if (says.length) {
                const list = document.createElement("ul");

                list.append(...says.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
                row.append(list);
            }

            return row;
        }),
    );
    $("#imported").showModal();
    $("#importedok").focus();
}

$("#charactersexport").addEventListener("click", () => exportCharacters(loadCharacters(WEAPONS)));
$("#charactersimport").addEventListener("click", () => $("#charactersfile").click());
$("#charactersfile").addEventListener("change", (event) => {
    const [file] = event.target.files;

    event.target.value = "";

    if (file) {
        importCharacters(file);
    }
});
$("#importedok").addEventListener("click", () => {
    $("#imported").close();

    // (Back to the saved characters, unless a hero was taken home from a world on a server)
    if ($("#characters").open) {
        openCharacters("play");
    }
});
$("#charactersback").addEventListener("click", () => $("#characters").close());
$("#charactersnew").addEventListener("click", () => {
    const into = $("#characters").dataset.mode === "enter" ? state.into : null;

    $("#characters").close();

    if (into) {
        $("#localworlds").close();
        create({ into: into.id });

        return;
    }

    // (Back to joining once they're made: the code, and where it's looked for, as they were)
    state.joinAfter = { code: $("#joincode").value.toUpperCase().replace(/[^A-Z]/g, ""), at: state.joinAt, look: $("#joinat").value };
    $("#join").close();
    create();
});

$("#debugswitch").checked = settings.debug;
$("#minimapswitch").checked = settings.minimap;
$("#stickswitch").checked = settings.stick;
$("#floatswitch").checked = settings.stickFloats;
$("#tapmoveswitch").checked = settings.tapToMove;
$("#flyinswitch").checked = settings.flyIn;
$("#zoomswitch").checked = settings.zoom;
$("#pointerswitch").checked = settings.swordPointer;
$("#largepointerswitch").checked = settings.largePointer;
$("#crashswitch").checked = settings.sendCrashes;
showPlaySettings();
$("#quicksixswitch").checked = settings.quickSix;
$("#quickalwaysswitch").checked = settings.quickAlways;
$("#chatterswitch").checked = settings.chatter;
$("#enmityswitch").checked = settings.showEnmity;
$("#fullscreenswitch").checked = settings.fullscreen;
// (Where the browser won't have it, no switch: on an iPhone, a word on the Home Screen instead)
$("#fullscreenoption").hidden = !fullScreen.available;
$("#fullscreennote").hidden = fullScreen.available || !isIOS() || isInstalledApp();
$("#adaptiveswitch").checked = settings.adaptive;
$("#soundswitch").checked = settings.sound;
$("#debugswitch").addEventListener("change", (event) => applySetting("debug", event.target.checked));

// The switches and slider of the settings for how the player plays (app/save.js PLAY_SETTINGS) as
// they're set: as the game starts, and as a hero a world keeps brings theirs
function showPlaySettings() {
    $("#resistswitch").checked = settings.resistSummons;
    $("#refuseswitch").checked = settings.refuseInvites;
    $("#messengerswitch").checked = settings.messengers;
    $("#partydmswitch").checked = settings.refusePartyDms;
    $("#worlddmswitch").checked = settings.refuseWorldDms;
    $("#chatfeedswitch").checked = settings.chatOnScreen;
    $("#snagswitch").checked = settings.autoSnag;
    $("#lockswitch").checked = settings.autoLock;
    $("#snagbutton").hidden = !settings.autoSnag;
    $("#followswitch").checked = settings.cameraFollows;
    $("#battlecamswitch").checked = settings.battleCam;
    $("#invertswitch").checked = settings.invertTilt;
    $("#shakeswitch").checked = settings.shake;
    $("#openwayswitch").checked = settings.openWay;
    $("#dragslider").value = Math.round(settings.dragSpeed * 100);
    $("#dragname").textContent = `${Math.round(settings.dragSpeed * 100)}%`;
    $("#tiltslider").value = Math.round(settings.tiltSpeed * 100);
    $("#tiltname").textContent = `${Math.round(settings.tiltSpeed * 100)}%`;
}

// The player's settings for how they play told the world that keeps their hero, as they change,
// to keep with them (core/host.js OWN `settings`)
function tellPlaySettings() {
    if (state.onServer?.kept && state.game?.remote) {
        state.together?.joining?.own({ settings: keptSettings() });
    }
}

// A kept hero's own settings, as the world keeps them with them (core/host.js OWN `settings`): how
// they play (PLAY_SETTINGS), and whom they've blocked in that world
function keptSettings(game = state.game) {
    return { ...playSettingsOf(settings), blocked: settings.blocked.filter(({ world }) => world === game?.worldKey) };
}

// Chat and players (Game options), as the game takes them: what's said shown on screen too, which
// direct messages are taken (told to the host), and whom the player's blocked (kept as it changes)
function applyChat(game = state.game) {
    if (!game) {
        return;
    }

    game.chatOnScreen = settings.chatOnScreen;
    game.blocked = settings.blocked;
    game.onBlocked = (blocked) => applySetting("blocked", blocksOf(blocked));
    game.takeDms({ party: !settings.refusePartyDms, world: !settings.refuseWorldDms });
}

// The players blocked (Game options: Chat and players, Blocked players): each by name, where (this
// world, or another), and who that world knows them as; each to unblock. And how many, under its
// link
function showBlocked() {
    const here = state.game?.worldKey ?? null;
    const count = settings.blocked.length;

    $("#blockedsummary").textContent = count ? `${count} blocked${here ? `, ${settings.blocked.filter(({ world }) => world === here).length} in this world` : ""}` : "No one";
    $("#blockedlist").replaceChildren(
        ...(count
            ? [...settings.blocked].reverse().map((one) => {
                  const row = document.createElement("li");
                  const about = Object.assign(document.createElement("div"), { className: "character" });
                  const unblock = Object.assign(document.createElement("button"), { type: "button", className: "button quiet", textContent: "Unblock" });

                  about.append(Object.assign(document.createElement("span"), { className: "name", textContent: one.name || "Someone" }), Object.assign(document.createElement("span"), { className: "about", textContent: `${one.world === here ? "In this world" : "In another world"} · ${one.who}` }));
                  unblock.setAttribute("aria-label", `Unblock ${one.name || one.who}`);
                  unblock.addEventListener("click", () => {
                      applySetting("blocked", settings.blocked.filter((other) => other !== one));
                      showBlocked();
                      $("#blockedback").focus();
                  });
                  row.append(about, unblock);

                  return row;
              })
            : [Object.assign(document.createElement("li"), { className: "note", textContent: "No one's blocked." })]),
    );
}

// --- Making a character ---

// (`replacing`: the id of the kept character the new one takes the place of, forgotten once
// they're made: backed out of, they're kept. `into`: the id of the world on this device they're
// made for, played in once they're made; else they start in a new world of their own, named for
// them, or, with as many kept as there can be, they're asked which)
async function create({ replacing = null, into = null } = {}) {
    const { Creator } = state.modules;
    const { view, kit } = state.session;

    show("create");

    // (Made to go into a world on a server: it says which)
    $("#createtitle").textContent = state.worldsAfter ? `Your character for ${state.worldsAfter.entered.card?.name ?? "the world"}` : "Make your character";

    // (The one got ready while the title was up, readyCreator, as far as it's got: what's left
    // done now, faster, behind a screen saying so, app/creator.js run)
    state.creator = state.readyCreator ?? new Creator({ view, kit });
    state.readyCreator = null;
    state.creator.prepare();

    const hero = await state.creator.run();

    state.creator = null;

    if (!hero) {
        state.joinAfter = null;
        state.worldsAfter = null;
        title();

        return;
    }

    const save = { hero, seed: newSeed(), created: new Date().toISOString(), ...(into ? { world: null } : {}) };

    if (replacing) {
        forgetCharacter(replacing);
    }

    if (!writeSave(save)) {
        console.warn("This browser won't keep the character: it will be forgotten when the page closes.");
        delete save.id;
    }

    state.joinAs = save;

    // (Made to go into a world on a server: straight in as them, a new hero there, if that's what
    // was chosen; else back to choosing)
    if (state.worldsAfter) {
        const { client, entered, hero = null } = state.worldsAfter;

        state.worldsAfter = null;
        title();

        if (hero) {
            playServerWorld(client, entered, { save, hero });

            return;
        }

        await openWorlds();
        chooseHero(client, entered);

        return;
    }

    // (Made to join someone's world: back to joining it)
    if (state.joinAfter !== null) {
        const { code, at, look } = state.joinAfter;

        state.joinAfter = null;
        title();
        openJoin(code, { at, look });

        return;
    }

    play(save, into ? { world: into } : {});
}

// --- Playing ---

// A moment for the page to draw what's just been shown (the loading screen) before work that
// holds it up for a while
const painted = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// Playing (as tests are told: window.pellagos.playing) once the game's under way, its world
// stepped and drawn, not just started (unless it's been left meanwhile)
function underway(game) {
    // (Nothing downloaded while the world's first built and its shaders compiled, nor for 10 s after)
    fetcher.hold("starting", { for: 10000 });
    game.underway.then(() => {
        if (state.game === game) {
            window.pellagos.playing = true;
            offerHandheld();
            measure(game);
        }
    });
}

// A measured run (app/measuring.js; docs/GAME.md *Measuring a device*), only if the page's link
// asks for one (`?measure=<name>&minutes=12`, beside whatever else it says): the first game under
// way is measured from then on, every frame counted, how long's left counted down, the report kept
// on the device as it goes, and the screen kept awake. Its code is read only then; with no
// `measure` in the link nothing of it is, and no game's given a meter
let measured = null;

async function measure(game) {
    if (!params.has("measure")) {
        return;
    }

    // (Its code not to be had, the device offline with nothing of it kept: the game's played unmeasured)
    const { MeasuredRun, measureOf } = await import("./app/measuring.js").catch(() => ({}));

    if (!MeasuredRun) {
        return;
    }

    if (!measured) {
        measured = new MeasuredRun(measureOf(params), { element: $("#measure"), storage: localStorage, wakeLock: navigator.wakeLock ?? null, about: { code: telemetry.code, build: telemetry.build, built: telemetry.built } });
        measured.onDone = measureDone;
    }

    // (In a world on a world server: noted, for the report to be sent there)
    if (state.game === game) {
        measured.attach(game, state.onServer ? { server: state.onServer.client.record.key, world: state.onServer.entered.world } : null);
    }
}

// A measured run ended. In a world on a world server, its report's sent to that server, for its
// admin to read (the world's Measured runs on the management page: docs/SERVER.md); the words where
// the countdown was say what became of it. Copy results copies it, wherever it went: the only way
// to have it where there's no server (the quick start, a friend's world), or it couldn't be sent
let measuredReport = null;

async function measureDone(report) {
    const on = state.onServer;
    const sent = on ? await sendMeasure(on.client, on.entered, report) : false;
    const server = on?.client.record.name ?? on?.entered.card?.server?.name ?? "the server";

    measuredReport = report;
    measured.say(sent ? `Measured ${report.name}: sent to ${server}, for its admin to read.` : on ? `Measured ${report.name}: it couldn't be sent to ${server}. Copy it; or it's sent when you're next in this world.` : `Measured ${report.name}: kept on this device. Copy it to send it on.`);
    $("#measurecopy").hidden = false;
    $("#measureclose").hidden = false;
}

// A measured run's report sent to the world it was measured in, by the player's session there:
// whether it was taken. Taken, or refused for good, it waits on the device no longer
async function sendMeasure(client, entered, report) {
    const { measureSent } = await import("./app/measuring.js");

    try {
        await client.reportMeasure({ world: entered.world, session: entered.session, report });
    } catch (error) {
        if (REFUSED_FOR_GOOD.includes(error.error)) {
            measureSent(localStorage, report);
        }

        return false;
    }

    measureSent(localStorage, report);

    return true;
}

// A measured run kept on this device for this world and never sent there (the browser ended it
// before it was done, as a phone does to a page that holds too much; or its server couldn't be
// reached as it ended): sent now the player's back in the world, as far as it got. Looked for
// whatever the link says, and its code read only if there's one waiting
async function sendMeasures(client, entered) {
    try {
        if (!localStorage.getItem("pellagos.measure.waiting")) {
            return;
        }

        const { waitingMeasure } = await import("./app/measuring.js");
        const report = waitingMeasure(localStorage, client.record.key, entered.world);

        if (report) {
            await sendMeasure(client, entered, report);
        }
    } catch {
        // (Storage refused, or its code not to be had just now: it waits for the next time)
    }
}

// (Copied where the browser lets it; else the report's text selected, to copy by hand)
$("#measurecopy").addEventListener("click", async () => {
    const text = JSON.stringify(measuredReport);

    $("#measure textarea")?.remove();

    try {
        await navigator.clipboard.writeText(text);
        measured?.say(`Measured ${measuredReport?.name ?? ""}: copied. Paste it wherever you're sending it.`);
    } catch {
        const area = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });

        $("#measure").append(area);
        area.select();
        measured?.say("Copying wasn't allowed: it's selected here to copy yourself.");
    }
});
$("#measureclose").addEventListener("click", () => ($("#measure").hidden = true));

// Getting a game ready failed: said on the loading screen, with the ways on from there (back to
// the title, or loading the page again; what's saved is kept as it goes)
function failed(error) {
    console.error(error);

    try {
        state.game?.dispose();
    } catch {
        // (Half made: what there is of it goes with the page)
    }

    state.game = null;
    state.together?.close();
    setTogether(null);
    fetcher.release("starting");
    window.pellagos.playing = false;
    debug.watch({ game: null });
    show("loading");
    setProgress(0, "The world couldn't be got ready. Go back to the title and try again, or load the game afresh.", String(error?.message ?? error));

    const button = (text, primary, onClick) => {
        const element = Object.assign(document.createElement("button"), { type: "button", className: `button${primary ? " primary" : ""}`, textContent: text });

        element.addEventListener("click", onClick);

        return element;
    };

    $("#loadlist").replaceChildren(button("Back to the title", true, () => title()), button("Load afresh", false, () => location.reload()));
}

// A character played (`world`: in that world on this device, going into it; else the one they're
// in): in no world, they're asked which first
async function play(save, { world = null } = {}) {
    const stay = world && save.id ? enterWorld(save, world) : stayOf(save);

    if (!stay) {
        openLocalWorlds("go", save);

        return;
    }

    state.building = true;
    fullScreen.play();

    // (The one Continue as... carries on with, from now)
    playedSave(save);

    try {
        await playing(save, stay);
    } catch (error) {
        failed(error);
    } finally {
        state.building = false;
    }
}

// (`stay`: where they're kept in the world they're in, save.js stayOf: what they carry is kept
// with them, what its folk remember of them and the rest with their place in it, its war with it)
async function playing(save, { world, place, war }) {
    const { createGame } = state.modules;
    const { view, kit, sound } = state.session;

    dropReadyCreator();
    state.game?.dispose();
    fetcher.hold("starting");
    show("loading");
    $("#loadlist").replaceChildren();
    setProgress(0, "Building the world");
    await painted();

    // (The world planned while the skin atlas may still be being worked out elsewhere: it's
    // needed only once the game's building its characters)
    const game = await createGame({
        view,
        kit,
        sound,
        hud: state.hud,
        hero: save.hero,
        seed: world?.seed ?? save.seed,
        talks: loadTalks(place),
        onTalk: (talks) => saveTalks(place, talks),
        explored: loadExplored(place),
        onExplore: (explored) => saveExplored(place, explored),
        progress: loadProgress(save),
        onProgress: (progress) => saveProgress(save, progress),
        standing: loadStanding(place),
        onStanding: (standing) => saveStanding(place, standing),
        followers: loadFollowers(place),
        roll: loadRoll(place),
        onFollowers: (followers, roll) => saveFollowers(place, followers, roll),
        wheels: loadWheels(save),
        onWheels: (wheels) => saveWheels(save, wheels),
        war: loadWorld(war),
        legends: loadLegends(war),
        // (Kept each of the war's turns, a minute of play, and the world's legends with it: and
        // where the player is with it. Just after the frame the turn came in, not in it: saveSoon)
        onWar: (now, legends) =>
            saveSoon(() => {
                saveWorld(war, now.snapshot(), legends?.toJSON() ?? null);
                keepPlace();
            }, game),
        onWorldMap: openWorldMap,
        onPing: pingShown,
        pin: loadPin(place),
        onPin: (pin) => savePin(place, pin),
        markers: loadMarkers(place),
        onMarkers: (markers) => saveMarkers(place, markers),
        place: loadPlace(place),
        vitals: loadVitals(place),
        messages: loadMessages(save),
        onMessages: (messages) => saveMessages(save, messages),
        told: loadTold(save),
        onTold: (told) => saveTold(save, told),
    });

    // (The browser refusing to keep the game from here on, its storage full or taken away: said
    // once, plainly. Every save after a character's first went unlooked at: save.js hearRefusal)
    hearRefusal(() => state.hud?.message(SAVE_REFUSED, 12));

    state.stay = { world, place, war };
    state.keepPlace = () => {
        savePlace(place, game.place());
        saveVitals(place, game.vitals());
    };

    state.worldMap?.dispose();
    state.worldMap = null;

    state.game = game;
    await kit.ready;
    await game.build(({ label, done, total }) => setProgress(done / total, label, `${done} of ${total}`));
    game.showSquares(settings.squares);
    game.showNavigation(settings.navigation);
    showMinimap(settings.minimap);
    showStick(settings.stick);
    floatStick(settings.stickFloats);
    showZoom(settings.zoom);
    game.cursor = pointer;
    game.resistSummons = settings.resistSummons;
    game.refuseInvites = settings.refuseInvites;
    applyChat(game);
    game.autoSnag = settings.autoSnag;
    game.messengers = settings.messengers;
    game.keys = keysOf(settings.keyBindings);
    game.snagFilter = snagChoiceOf();
    game.autoLock = settings.autoLock;
    game.quickAlways = settings.quickAlways;
    game.chatter = settings.chatter;
    game.tapToMove = settings.tapToMove;
    // (The opening fly-in; not for the quick start straight into a game, ?play, unless &flyin)
    game.flyIn = settings.flyIn && (!params.has("play") || params.has("flyin"));
    game.showEnmity = settings.showEnmity;
    applyCamera();
    game.onAdapt = showAdapted;
    game.onChooseQuick = chooseQuick;
    game.onAskDismiss = askDismiss;
    game.showQuick(quickShown());
    debug.watch({ game });
    show("hud");
    game.start();
    underway(game);
    hostIfAsked(game, save);
}

// Host on this Device: the world opened to others as soon as it's under way, through the server
// chosen, its code and link shown (for the character chosen to host, or one made to: within ten
// minutes of asking, so a host given up on doesn't open a later game)
function hostIfAsked(game, save) {
    const asked = state.hostAfter;

    if (!asked || (asked.save !== "new" && asked.save !== save.id) || Date.now() - asked.at > 600000) {
        return;
    }

    state.hostAfter = null;
    game.underway.then(() => {
        if (state.game === game && !game.remote && !state.together) {
            game.pause();
            invite({ via: asked.via });
        }
    });
}

// What the player's told, once, when the browser won't keep the game any more (save.js hearRefusal)
const SAVE_REFUSED = "This browser has stopped keeping your game: its storage may be full. What happens from here may not be saved.";

// Where the player is and how, kept to carry on so next time (save.js savePlace, saveVitals):
// whenever the game stops, paused or quit, the page hidden (another app, on a phone) or closed,
// and each of the war's turns besides
function keepPlace() {
    saveNow();

    if (state.game && !state.game.remote) {
        state.keepPlace?.();
    }
}

// The war's turn kept (`save`: the world's snapshot taken, encoded and written, and where the
// player is: five things written, 2 to 9 ms three hours into a world) just after the frame its
// turn came in, in a task of its own, not in that frame, which has the turn's own work in it.
// At once if the game's being played on by hand (Game.advance: nothing waits). And at once
// whenever the game stops, the page is hidden or closed (keepPlace: saveNow), so nothing's lost
// for the wait.
function saveSoon(save, game) {
    state.unsaved = save;

    if (game.waits) {
        setTimeout(saveNow, 0);
    } else {
        saveNow();
    }
}

function saveNow() {
    const save = state.unsaved;

    state.unsaved = null;
    save?.();
}

function pause() {
    keepPlace();

    if (!state.game?.running || $("#menu").open) {
        return;
    }

    // (The world stops only with no one else in it: else it goes on under the menu, unless its
    // host, or on a world server one of its owners, pauses it for everyone. Joined to another's
    // world, it isn't this game's to open to others)
    state.everyone = false;
    state.game.pause();
    $("#pauseallbutton").hidden = !mayPauseAll();
    $("#menunote").textContent = "Others are playing: the world goes on.";
    $("#menunote").hidden = state.game.host.pausable;
    $("#invitebutton").hidden = Boolean(state.game.remote);
    $("#worldbutton").hidden = !state.onServer;
    $("#invitebutton").textContent = state.together ? "Who's here" : "Invite others";
    menuPage("main");
    $("#menu").showModal();
}

function resume() {
    $("#menu").close();
    stopBinding();
    fullScreen.play();

    // (A pause for everyone over: their world going again for all; a world server's let go of as
    // the game starts again, Joining hold)
    if (state.everyone) {
        state.everyone = false;
        state.together?.hosting?.pause(document.hidden ? "away" : null);
    }

    state.game?.start();
}

// Whether the player may stop the world for everyone from the menu (Pause for everyone), with
// anyone else in it to stop it for: the host of their own world open to others, with friends in
// it; or one of the owners of a world on a server. (With no one else in it, the menu stops it)
function mayPauseAll() {
    const game = state.game;

    if (!game) {
        return false;
    }

    if (game.remote) {
        return Boolean(state.onServer) && game.host.players.get(game.me)?.role === "owner" && game.host.players.size > 1;
    }

    return (state.together?.hosting?.players.size ?? 0) > 0;
}

// The world stopped for everyone (Pause for everyone), till Resume: their own, on this device,
// those in it told why (core/netplay.js Hosting pause, "host"); a world server's, asked of it as
// one of its owners (Joining hold), till they resume or their link drops
function pauseAll() {
    const game = state.game;

    if (!$("#menu").open || !mayPauseAll()) {
        return;
    }

    state.everyone = true;

    if (game.remote) {
        game.remote.hold(true, { everyone: true });
    } else {
        game.stop();
        state.together.hosting.pause("host");
    }

    $("#pauseallbutton").hidden = true;
    $("#menunote").textContent = "Paused for everyone, till you resume.";
    $("#menunote").hidden = false;
    $("#resumebutton").focus();
}

// The menu's pages: the main one; Game options, and a page for each group of them (Action Wheel
// and Bar the first); and under those, Action wheels and the Action Bar (Action Wheel and Bar),
// Auto-snag (Gameplay), Blocked players (Chat and players), and the Debug log. Each
// with its title, what's focused on it, the page Back goes to (`up`), and the button there that
// opened it (`from`), focused again on the way back
const MENU_PAGES = {
    main: { page: "#menumain", title: "menutitle", focus: "#resumebutton", up: null },
    options: { page: "#menuoptions", title: "optionstitle", focus: "#actionsbutton", up: "main", from: "#optionsbutton" },
    actions: { page: "#menuactions", title: "actionstitle", focus: "#wheelsbutton", up: "options", from: "#actionsbutton" },
    graphics: { page: "#menugraphics", title: "graphicstitle", focus: "#qualityslider", up: "options", from: "#graphicsbutton" },
    sound: { page: "#menusound", title: "soundtitle", focus: "#soundswitch", up: "options", from: "#soundbutton" },
    controls: { page: "#menucontrols", title: "controlstitle", focus: "#bindingsbutton", up: "options", from: "#controlsbutton" },
    controller: { page: "#menucontroller", title: "controllertitle", focus: "#padrumbleswitch", up: "controls", from: "#controllerbutton" },
    bindings: { page: "#menubindings", title: "bindingstitle", focus: "#handheldsbutton", up: "controls", from: "#bindingsbutton" },
    handhelds: { page: "#menuhandhelds", title: "handheldstitle", focus: "#handheldlist button", up: "bindings", from: "#handheldsbutton" },
    camera: { page: "#menucamera", title: "cameratitle", focus: "#followswitch", up: "options", from: "#camerabutton" },
    gameplay: { page: "#menugameplay", title: "gameplaytitle", focus: "#snagswitch", up: "options", from: "#gameplaybutton" },
    snag: { page: "#menusnag", title: "snagtitle", focus: "#snaggrades input", up: "gameplay", from: "#snagbutton" },
    chat: { page: "#menuchat", title: "chattitle", focus: "#chatfeedswitch", up: "options", from: "#chatbutton" },
    blocked: { page: "#menublocked", title: "blockedtitle", focus: "#blockedback", up: "chat", from: "#blockedbutton" },
    wheels: { page: "#menuwheels", title: "wheelstitle", focus: "#wheelsback", up: "actions", from: "#wheelsbutton" },
    quick: { page: "#menuquick", title: "quicktitle", focus: "#quickback", up: "actions", from: "#quickbutton" },
    log: { page: "#menulog", title: "logtitle", focus: "#logback", up: "options", from: "#logbutton" },
};

// The page shown, for Back
let menuShown = "main";

function menuPage(page, focus = MENU_PAGES[page].focus) {
    for (const [each, { page: element }] of Object.entries(MENU_PAGES)) {
        $(element).hidden = each !== page;
    }

    menuShown = page;
    $("#menu").setAttribute("aria-labelledby", MENU_PAGES[page].title);

    // (A key or button being listened for, given up as its page is left)
    if (page !== "bindings") {
        stopBinding();
    }

    $("#menu").classList.toggle("wide", page === "wheels" || page === "quick" || page === "log" || page === "bindings");
    $(focus).focus();

    // (What auto-snag takes, told under its switch; the players blocked, under theirs and on their page)
    if (page === "gameplay") {
        showSnag(settings.autoSnag);
        showMortal();
    } else if (page === "chat" || page === "blocked") {
        showBlocked();
    } else if (page === "graphics") {
        // (What it's drawing, and how the device is asking for it, as they are now)
        showQuality();
    }
}

// Whether this world's mercenaries can die (core/host.js RULES mortal), under its switch: shown in
// a game, changed only by the world's host (its owner, on a server)
function showMortal() {
    const game = state.game;

    $("#mortaloption").hidden = !game;
    $("#mortalswitch").checked = Boolean(game?.host.rules.mortal);
    $("#mortalswitch").disabled = !game?.mayRule();
}

// Back a page (the arrow in a page's heading, the Back at its foot, or Escape): to the page above
// it, the button that opened this one focused again. From the main page, or the Action Bar
// options opened from a fight, back to the game
function menuBack() {
    const { up, from } = MENU_PAGES[menuShown];

    if (!up || (menuShown === "quick" && state.quickFromFight)) {
        resume();
    } else {
        menuPage(up, from);
    }
}

// Auto-snag (Game options): what it takes, for the game (host.js snagChoice: null, everything)
function snagChoiceOf() {
    return settings.snagGrades && settings.snagKinds ? { grades: settings.snagGrades, kinds: settings.snagKinds } : null;
}

// What auto-snag takes, its choices and their names (host.js SNAG_GRADES, SNAG_KINDS: loaded with
// the game, so at hand by the time Game options is open)
async function snagLists() {
    const [{ SNAG_GRADES, SNAG_KINDS }, { QUALITIES, WARE_KINDS }] = await Promise.all([import("./core/host.js"), import("./core/progress.js")]);

    return {
        grades: SNAG_GRADES.map((value) => ({ value, label: QUALITIES[value].label || "Common" })),
        kinds: SNAG_KINDS.map((value) => ({ value, label: value === "gold" ? "Gold" : WARE_KINDS[value] })),
    };
}

// Under the Auto-snag switch while it's on, what it takes, in a word: its own page to change it
async function showSnag(on) {
    $("#snagbutton").hidden = !on;

    const choice = snagChoiceOf();

    if (!choice) {
        $("#snagsummary").textContent = "Everything";

        return;
    }

    const lists = await snagLists();
    const named = (list, ticked, all) => (ticked.length === list.length ? all : list.filter(({ value }) => ticked.includes(value)).map(({ label }) => label).join(", ") || "none");

    $("#snagsummary").textContent = `${named(lists.grades, choice.grades, "Any rarity")}; ${named(lists.kinds, choice.kinds, "any kind")}`;
}

async function openSnag() {
    const lists = await snagLists();
    const choice = snagChoiceOf();
    const box = (name, { value, label }, on) => {
        const choiceLabel = document.createElement("label");
        const input = Object.assign(document.createElement("input"), { type: "checkbox", name, value, checked: on });

        choiceLabel.className = `snag-choice${name === "grade" ? ` rarity-${value}` : ""}`;
        choiceLabel.append(input, Object.assign(document.createElement("span"), { textContent: label }));

        return choiceLabel;
    };

    $("#snaggrades").replaceChildren($("#snaggrades legend"), ...lists.grades.map((grade) => box("grade", grade, !choice || choice.grades.includes(grade.value))));
    $("#snagkinds").replaceChildren($("#snagkinds legend"), ...lists.kinds.map((kind) => box("kind", kind, !choice || choice.kinds.includes(kind.value))));
    menuPage("snag");
}

// A box ticked or not: what auto-snag takes kept (everything ticked: null, so whatever's thought of
// later is taken too), and told to the game
async function snagChanged({ all = false } = {}) {
    const lists = await snagLists();

    if (all) {
        for (const input of $("#menusnag").querySelectorAll("input")) {
            input.checked = true;
        }
    }

    const ticked = (id) => [...$(id).querySelectorAll("input:checked")].map(({ value }) => value);
    const [grades, kinds] = [ticked("#snaggrades"), ticked("#snagkinds")];
    const everything = grades.length === lists.grades.length && kinds.length === lists.kinds.length;

    Object.assign(settings, { snagGrades: everything ? null : grades, snagKinds: everything ? null : kinds });
    saveSettings({ snagGrades: settings.snagGrades, snagKinds: settings.snagKinds });
    tellPlaySettings();

    if (state.game) {
        state.game.snagFilter = snagChoiceOf();
    }

    showSnag(settings.autoSnag);
}

// The debug log (app/telemetry.js): each event kept, the newest first, its summary opening on
// what was going on then; copied as text, to send to whoever's looking into it
const LOG_KINDS = { freeze: "Freeze", slow: "Slow", error: "Error", crash: "Crash", lost: "Picture lost", press: "Press lost" };

function showLog() {
    const entries = telemetry.events.map((event) => {
        const entry = document.createElement("details");
        const summary = document.createElement("summary");
        const kind = Object.assign(document.createElement("span"), { className: "log-kind", textContent: LOG_KINDS[event.kind] ?? event.kind });
        const text = Object.assign(document.createElement("span"), { textContent: event.summary ?? "" });
        const time = Object.assign(document.createElement("time"), { dateTime: event.at, textContent: new Date(event.at).toLocaleString() });
        const detail = Object.assign(document.createElement("pre"), { textContent: JSON.stringify(event, null, 2) });

        entry.className = "log-entry";
        summary.append(kind, text, time);
        entry.append(summary, detail);

        return entry;
    });

    $("#logentries").replaceChildren(...(entries.length ? entries : [Object.assign(document.createElement("p"), { className: "log-empty", textContent: "Nothing kept: no freezes, slowdowns, errors or crashes so far." })]));

    // (Which copy of the game this is, as each event says too: its code's commit and when it was
    // put together, or "dev" for one run from the repository; and its assets' release)
    const built = telemetry.built ? `, put together ${new Date(telemetry.built).toLocaleString()}` : "";

    $("#logversion").textContent = `This copy: code ${telemetry.code === "dev" ? "dev (run from the repository)" : telemetry.code}${built}; assets ${telemetry.build || "unknown"}.`;
}

function openLog() {
    $("#logstatus").textContent = "";
    showLog();
    menuPage("log");
}

// (Copied where the browser lets it; else the log's text selected, to copy by hand)
async function copyLog() {
    const text = telemetry.text();

    try {
        await navigator.clipboard.writeText(text);
        $("#logstatus").textContent = "Copied. Paste it wherever you're sending it.";
    } catch {
        const area = Object.assign(document.createElement("textarea"), { value: text, readOnly: true, className: "log-copy" });

        $("#logentries").replaceChildren(area);
        area.select();
        $("#logstatus").textContent = "Copying wasn't allowed: it's selected here to copy yourself.";
    }
}

// What's on the player's action wheels, to change (app/wheelsetup.js: loaded the first time)
async function openWheels() {
    const game = state.game;

    if (!game) {
        return;
    }

    if (!state.wheelSetup) {
        const { WheelSetup } = await import("./app/wheelsetup.js");

        state.wheelSetup = new WheelSetup($("#wheelsetup"));
    }

    state.wheelSetup.onChange = (wheels) => state.game?.setWheels(wheels);
    state.wheelSetup.show(game.wheelSetup());
    menuPage("wheels");
}

// What's on the player's Action Bar, to change (app/quicksetup.js: loaded the first time), with
// the `bar`th bar shown (0, Action Bar 1; 1, Action Bar 2) and its `slot`th slot chosen. Opened
// from Game options (Action Wheel and Bar), Back goes back there; from one of its actions held on
// in a fight (`fromFight`), back to the game.
async function openQuick(slot = 0, { fromFight = false, bar = 0 } = {}) {
    const game = state.game;

    if (!game) {
        return;
    }

    if (!state.quickSetup) {
        const { QuickSetup } = await import("./app/quicksetup.js");

        state.quickSetup = new QuickSetup($("#quicksetup"));
    }

    state.quickFromFight = fromFight;
    $("#quickback").textContent = fromFight ? "Back to the game" : "Back";
    $("#menuquick .menu-back").setAttribute("aria-label", fromFight ? "Back to the game" : "Back to Action Wheel and Bar");
    state.quickSetup.onChange = (quick, page) => state.game?.setQuick(quick, page);
    state.quickSetup.showCount(quickShown());
    state.quickSetup.show(game.quickSetup(), slot, bar);
    menuPage("quick");
}

// How many of the Action Bar's actions are shown: four (with their names), or six across (Game options, Action Bar)
function quickShown() {
    return settings.quickSix ? 6 : 4;
}

// One of the Action Bar's actions held on in a fight (or an empty slot tapped): paused, its slot
// chosen to change, on the bar it's on (`bar`: 0, Action Bar 1; 1, Action Bar 2)
function chooseQuick(slot, bar = 0) {
    pause();

    if ($("#menu").open) {
        openQuick(slot, { fromFight: true, bar });
    }
}

// --- The world map (the minimap held, or M) ---

// How often the war table's map is drawn again as the war goes on (ms)
const WAR_LIVE_MS = 500;

// (Opened to pick somewhere to go: Wizard's Walk. `pick` hears the point tapped, somewhere
// uncovered, or null if it's called off. Or as the travel map, from a guild's portal: `travel`;
// the building screen, at a ruler's: `build`, app/building.js buildingView's, and `choose`; or the
// war table's map, at the war table in a keep: `war`, { view (app/battlemap.js battleMapView's),
// refresh() (the view as it is now), realm (whose keep it is), act(action, then) (orders or
// counsel given: game.js atTable) }. The war isn't stopped while its table's read)
async function openWorldMap({ pick = null, travel = null, build = null, war = null } = {}) {
    const game = state.game;

    if (!game?.running || $("#menu").open || $("#worldmap").open) {
        pick?.(null);

        return;
    }

    game.pause({ world: !war });
    $("#worldmap").showModal();
    state.session?.sound?.play("mapUnfold");

    // (Made the first time, for the world being played)
    if (!state.worldMap || state.worldMap.world !== game.world) {
        const { WorldMap } = await import("./app/worldmap.js");

        state.worldMap?.dispose();
        state.worldMap = new WorldMap($("#worldmapcanvas"), game.world, game.explored);
        keyOf();
    }

    const map = state.worldMap;

    state.picking = pick;
    state.travel = travel;
    state.plans = build;
    state.mapMode = null;
    state.unpicked = null;
    $("#worldmapping").hidden = true;
    $("#worldmapmark").hidden = true;

    for (const { button } of Object.values(MAP_MODES)) {
        $(button).setAttribute("aria-pressed", "false");
    }

    map.pingsOf = null;
    map.partyOf = null;
    map.markersOf = null;
    map.onTap = null;
    $("#worldmappick").hidden = !pick && !travel && !build && !war;
    $("#worldmappicktext").textContent = "Wizard's Walk: tap somewhere you've been";
    $("#worldmaptitle").textContent = travel ? (travel.title ?? "Guild portal") : build ? "The council's plans" : war ? "The war table" : "The world";
    $("#worldmapkey").hidden = Boolean(travel || build || war);
    $("#warmapkey").hidden = !war;
    $("#worldmaplegend").hidden = Boolean(travel || build);

    // (At the war table: the war as their council sees it, drawn again as it goes on; anything
    // tapped told of; nothing held or tapped twice)
    if (war) {
        const { actionsAt } = await import("./app/battlemap.js");
        const said = (view) => `${view.said} ${view.may.orders ? "Tap our army, the enemy's, or the ground, for orders." : view.may.counsel ? "Tap anything for more; an enemy town to counsel marching on it." : "Tap anything on the map for more."}`;

        warKey(war.view.colour);
        $("#worldmappicktext").textContent = said(war.view);
        $("#worldmapcancel").textContent = "Leave the table";

        // (The army ordered: the one at this keep, if it's theirs to order; else their own)
        state.warTable = war;
        state.warArmy = war.view.commands.find(({ realm }) => realm === war.realm)?.realm ?? war.view.commands[0]?.realm ?? null;
        map.selected = state.warArmy;
        map.onPick = (point) => {
            const what = map.warAt(point);

            if (what?.command) {
                state.warArmy = map.selected = what.command;
            }

            const actions = actionsAt(map.war, what, point, state.warArmy);

            if (actions.length) {
                askOrders(what, actions);
            } else {
                mapNote(what?.told ?? "Tap a town, or anything of the war's", what ? 6000 : 2800);
            }
        };
        map.onHold = null;
        map.onDoubleTap = null;
        $("#worldmapunpin").hidden = true;
        $("#worldmapnote").hidden = true;
        map.open({ ...game.worldMapView(), war: war.view });
        clearInterval(state.warLive);
        state.warLive = setInterval(() => {
            const view = war.refresh();

            if (view && state.worldMap?.war) {
                state.worldMap.setWar(view);
                $("#worldmappicktext").textContent = said(view);
            }
        }, WAR_LIVE_MS);

        return;
    }

    // (At a ruler's: where the council would build, one tapped asked about; nothing held or tapped
    // twice)
    if (build) {
        const { goodsText } = await import("./app/building.js");

        $("#worldmappicktext").textContent = build.plans.length ? `Tap a plan to counsel building it first. Our stores: ${goodsText(build.stores)}.` : "The council sees nowhere it would build just now.";
        map.onPick = (point) => {
            const plan = map.planAt(point);

            if (!plan) {
                mapNote("Tap one of the council's plans");
            } else {
                askBuild(plan, build, goodsText);
            }
        };
        map.onHold = null;
        map.onDoubleTap = null;
        $("#worldmapunpin").hidden = true;
        $("#worldmapnote").hidden = true;
        map.open({ ...game.worldMapView(), build });

        return;
    }

    // (From a guild's portal: the branches open to them, one tapped asked about; nothing held or
    // tapped twice)
    if (travel) {
        const others = travel.branches.filter(({ here }) => !here).length;
        const off = travel.off > 0 ? ` ${travel.rank}: ${travel.off >= 1 ? "free" : `${Math.round(travel.off * 100)}% off`}.` : "";

        // (Or the moon roads under a full moon: `moon`, the rings they've stood in)
        $("#worldmappicktext").textContent = travel.moon ? (others ? "Tap a ring you've stood in, and the moon carries you there." : "You've stood in no other ring yet: stand in one, and the moon can carry you to it.") : others ? `Tap a branch of the guild to step through to it.${off}` : "No other branch is open to you yet: go into one, and its portal opens to you.";
        map.onPick = (point) => {
            const branch = map.branchAt(point);

            if (!branch) {
                mapNote(travel.moon ? "Tap one of the rings" : "Tap one of the guild's branches");
            } else if (branch.here) {
                mapNote("You're here");
            } else {
                askTravel(branch, travel);
            }
        };
        map.onHold = null;
        map.onDoubleTap = null;
        $("#worldmapunpin").hidden = true;
        $("#worldmapnote").hidden = true;
        map.open({ ...game.worldMapView(), travel: travel.branches });

        return;
    }

    map.onPick = pick
        ? (point) => {
              if (!map.uncovered(point)) {
                  $("#worldmappicktext").textContent = "You haven't been there: somewhere you've been";

                  return;
              }

              state.picking = null;
              closeWorldMap();
              pick(point);
          }
        : null;

    // (Held: a pin dropped where they've been, or the one there taken away; tapped twice: run
    // there, if there's a way)
    map.onHold = (point, onPin) => {
        if (onPin) {
            unpin();
        } else if (!map.uncovered(point)) {
            mapNote("You haven't been there: drop a pin somewhere you've been");
        } else {
            map.setPin(game.setPin(point));
            $("#worldmapunpin").hidden = false;
            mapNote(map.pin && !map.way ? "Pinned, but a path cannot be found there" : "Pinned: a column of light marks it, and a line the way there");
        }
    };
    map.onDoubleTap = (point) => {
        const result = game.journeyTo(point);

        if (result.ok) {
            closeWorldMap();
        } else {
            mapNote(result.reason === "indoors" ? "Step outside to set off" : "A path cannot be found");
        }
    };
    $("#worldmapunpin").hidden = !game.pin;
    $("#worldmapnote").hidden = true;

    // (In a party: its pings shown as they come, and the button to make one; and the player's
    // markers, one tapped asked about, and the button to put one down)
    $("#worldmapping").hidden = !game.host.partyFor(game.me);
    $("#worldmapmark").hidden = false;
    map.pingsOf = () => game.pingView();
    map.partyOf = () => game.partyView();
    map.markersOf = () => game.markerView();
    map.onTap = (point) => {
        const marker = map.markerAt(point);

        if (marker) {
            askMarker({ marker });
        }

        return Boolean(marker);
    };
    map.open(game.worldMapView());
}

// The world map's ways of taking the next tap: its ping button's (in a party: the party shown
// where, app/game.js ping, what's said of it told) and its marker button's (a marker put there,
// what it marks asked: askMarker)
const MAP_MODES = {
    ping: {
        button: "#worldmapping",
        said: "Ping: tap where to show your party",
        tapped: (point) => {
            const result = state.game?.ping(point);

            mapNote(result?.ok ? "Pinged: your party sees it on their maps, and a column of green light there" : result?.reason === "soon" ? "Wait a moment to ping again" : "You're not in a party");
        },
    },
    mark: { button: "#worldmapmark", said: "Marker: tap where to put it", tapped: (point) => askMarker({ at: point }) },
};

// One of the world map's buttons for the next tap on it tapped (`mode`: MAP_MODES's), or called off
// (null): the bar at the top saying what a tap does, the button ringed; Cancel, or the button
// again, calls it off, and the map's taps are as they were (Wizard's Walk's pick kept)
function mapMode(mode = null) {
    const map = state.worldMap;

    if (state.mapMode && map) {
        map.onPick = state.unpicked ?? null;
    }

    state.unpicked = null;
    state.mapMode = mode;

    for (const [each, { button }] of Object.entries(MAP_MODES)) {
        $(button).setAttribute("aria-pressed", String(each === mode));
    }

    $("#worldmappick").hidden = !mode && !state.picking;
    $("#worldmappicktext").textContent = mode ? MAP_MODES[mode].said : "Wizard's Walk: tap somewhere you've been";

    if (!mode || !map || !$("#worldmap").open) {
        return;
    }

    state.unpicked = map.onPick;
    map.onPick = (point) => {
        mapMode(null);
        MAP_MODES[mode].tapped(point);
    };
}

// A marker on the world map (core/markers.js), asked about: a new one (`at`: [x, z] metres) what
// it marks (the first, at first) and the player's words for it, then put down; or one of theirs
// tapped (`marker`), what it is, which way, how far and whose it was said, and shared with their
// party (in one), run to, or taken away
async function askMarker({ at = null, marker = null }) {
    const game = state.game;
    const map = state.worldMap;
    const dialog = $("#marker");
    const { drawMarker } = await import("./app/mapicons.js");
    const { bearing } = await import("./app/journal.js");
    const button = (label, primary, then) => {
        const each = Object.assign(document.createElement("button"), { type: "button", className: `button${primary ? " primary" : ""}`, textContent: label });

        each.addEventListener("click", then);

        return each;
    };
    const done = (said) => {
        dialog.close();
        map?.redraw();

        if (said) {
            mapNote(said);
        }
    };

    if (!game || !map) {
        return;
    }

    $("#markerkinds").hidden = $("#markerwordsbox").hidden = Boolean(marker);

    // (A new one: what it marks, each drawn as on the map, the one chosen ringed; and its words)
    if (!marker) {
        let chosen = MARKER_ICONS[0];
        const kinds = MARKER_ICONS.map((icon) => {
            const kind = Object.assign(document.createElement("button"), { type: "button", className: "marker-kind" });
            const drawing = Object.assign(document.createElement("canvas"), { width: 60, height: 72 });
            const context = drawing.getContext("2d");

            context.scale(2, 2);
            drawMarker(context, 15, 34, icon, { size: 22 });
            kind.dataset.icon = icon;
            kind.setAttribute("role", "radio");
            kind.setAttribute("aria-checked", String(icon === chosen));
            kind.append(drawing, MARKER_NAMES[icon]);
            kind.addEventListener("click", () => {
                chosen = icon;

                for (const each of kinds) {
                    each.setAttribute("aria-checked", String(each.dataset.icon === chosen));
                }
            });

            return kind;
        });

        $("#markertitle").textContent = "New marker";
        $("#markernote").textContent = "What does it mark? Add a few words if you like: only you see them, unless you share it.";
        $("#markerkinds").replaceChildren(...kinds);
        $("#markerwords").value = "";
        $("#markermenu").replaceChildren(
            button("Put it there", true, () => {
                const result = game.addMarker(at, { icon: chosen, words: $("#markerwords").value });

                done(result.ok ? "Marked: tap it to share it or take it away" : `${MARKERS.most} markers already: tap one to take it away first`);
            }),
            button("Cancel", false, () => done()),
        );
        dialog.showModal();
        kinds[0].focus();

        return;
    }

    // (One of theirs: what it is, which way, how far, and whose; shared, run to, or taken away)
    const where = map.player ? bearing([map.player.x, map.player.z], [marker.x, marker.z]) : "";

    $("#markertitle").textContent = marker.words || MARKER_NAMES[marker.icon];
    $("#markernote").textContent = `${MARKER_NAMES[marker.icon]}${where ? `, ${where === "here" ? "here" : where}` : ""}${marker.from ? `. Shared with you by ${marker.from}` : ""}.`;
    $("#markermenu").replaceChildren(
        ...(game.host.partyFor(game.me)
            ? [
                  button("Share with your party", true, () => {
                      const result = game.shareMarker(marker.id);

                      done(result.ok ? "" : "You're not in a party");
                  }),
              ]
            : []),
        button("Run there", !game.host.partyFor(game.me), () => {
            const result = game.journeyTo([marker.x, marker.z]);

            if (result.ok) {
                dialog.close();
                closeWorldMap();
            } else {
                done(result.reason === "indoors" ? "Step outside to set off" : "A path cannot be found");
            }
        }),
        button("Take it away", false, () => done(game.removeMarker(marker.id) ? "The marker's taken away" : "")),
        button("Close", false, () => done()),
    );
    dialog.showModal();
    $("#markermenu").querySelector("button").focus();
}

// A ping, or a marker shared, from the party come while the world map's open on the world: drawn
function pingShown() {
    if ($("#worldmap").open && state.worldMap?.pingsOf) {
        state.worldMap.redraw();
    }
}

// The world map's pin taken away
function unpin() {
    state.game?.clearPin();
    state.worldMap?.setPin(null);
    $("#worldmapunpin").hidden = true;
    mapNote("The pin's taken away");
}

// Something said on the world map for a moment (`ms`)
function mapNote(text, ms = 2800) {
    const note = $("#worldmapnote");

    note.textContent = text;
    note.hidden = false;
    clearTimeout(state.mapNoted);
    state.mapNoted = setTimeout(() => (note.hidden = true), ms);
}

// A branch of the guild tapped on the travel map: asked first, with its fare (and what their rank
// takes off it), and whether they have it
function askTravel(branch, travel) {
    const dialog = $("#portal");

    // (A ring under a full moon: no fare, the moonlight stepped into)
    if (travel.moon) {
        $("#portaltitle").textContent = `Walk the moon road to ${branch.name}?`;
        $("#portalnote").textContent = `${branch.metres >= 1000 ? `${(branch.metres / 1000).toFixed(1)} km` : `${Math.round(branch.metres / 10) * 10} m`} away. Your party in the ring goes with you.`;
        $("#portalgo").disabled = false;
        $("#portalgo").textContent = "Step into the moonlight";
        state.portal = { branch, travel };
        dialog.showModal();
        $("#portalgo").focus();

        return;
    }

    const km = branch.metres >= 1000 ? `${(branch.metres / 1000).toFixed(1)} km` : `${Math.round(branch.metres / 10) * 10} m`;
    const off = travel.off >= 1 ? `free at ${travel.rank} rank` : travel.off > 0 ? `${Math.round(travel.off * 100)}% off at ${travel.rank} rank` : "";
    const short = branch.fare > travel.gold;

    $("#portaltitle").textContent = `Step through to ${branch.name}?`;
    $("#portalnote").textContent = `${km} away. ${branch.fare ? `${branch.fare} gold` : "No charge"}${off ? `, ${off}` : ""}. You have ${travel.gold} gold.`;
    $("#portalgo").disabled = short;
    $("#portalgo").textContent = short ? "Not enough gold" : branch.fare ? `Pay ${branch.fare} gold and step through` : "Step through";
    state.portal = { branch, travel };
    dialog.showModal();
    (short ? $("#portalback") : $("#portalgo")).focus();
}

$("#portalgo").addEventListener("click", () => {
    const chosen = state.portal;

    state.portal = null;
    $("#portal").close();

    if (chosen) {
        closeWorldMap();
        chosen.travel.choose(chosen.branch.id);
    }
});
$("#portalback").addEventListener("click", () => {
    state.portal = null;
    $("#portal").close();
});

// One of the party to be let go (the party menu's Dismiss, or the wheel's), for good: asked first
// (`go`: lets them go)
function askDismiss({ name, note, go }) {
    $("#dismisstitle").textContent = `Dismiss ${name}?`;
    $("#dismissnote").textContent = note;
    $("#dismissgo").textContent = `Dismiss ${name}`;
    state.dismiss = go;
    $("#dismissask").showModal();
    $("#dismissback").focus();
}

$("#dismissgo").addEventListener("click", () => {
    const go = state.dismiss;

    state.dismiss = null;
    $("#dismissask").close();
    go?.();
});
$("#dismissback").addEventListener("click", () => $("#dismissask").close());
$("#dismissask").addEventListener("close", () => (state.dismiss = null));

// A plan tapped on the building screen: asked first, with what it guards and faces, what it costs
// and takes to keep up, and whether the stores hold it now
function askBuild(plan, build, goodsText) {
    const placed = plan.place === 1 ? "The council's first choice" : `The council's choice ${plan.place} of ${build.plans.length}`;

    $("#buildtitle").textContent = `${plan.name}?`;
    $("#buildnote").textContent = `${plan.facing ? `${plan.facing[0].toUpperCase()}${plan.facing.slice(1)}. ` : ""}${placed}. It costs ${goodsText(plan.cost)}, and ${goodsText(plan.upkeep)} a turn to keep up. ${plan.affordable ? "The stores hold it now." : `Our stores hold ${goodsText(build.stores)}: it'll be built once they hold enough.`}`;
    $("#buildgo").disabled = plan.counselled;
    $("#buildgo").textContent = plan.counselled ? "Already counselled" : "Counsel it";
    state.planned = { plan, build };
    $("#build").showModal();
    (plan.counselled ? $("#buildback") : $("#buildgo")).focus();
}

$("#buildgo").addEventListener("click", () => {
    const chosen = state.planned;

    state.planned = null;
    $("#build").close();

    if (chosen) {
        closeWorldMap();
        chosen.build.choose(chosen.plan.key);
    }
});
$("#buildback").addEventListener("click", () => {
    state.planned = null;
    $("#build").close();
});

// Something tapped on the war table's map that orders can be given about, or counsel (or the
// ground): what it is, and a button for each; one chosen, given, and what's said of it told, the
// map left open to watch it carried out
function askOrders(what, actions) {
    const menu = $("#warordersmenu");

    $("#warorderstitle").textContent = what ? (what.type === "town" ? what.name : what.told.split(/[,:]/)[0]) : "Here";
    $("#warordersnote").textContent = what?.told ?? "Open ground.";
    menu.replaceChildren(
        ...actions.map((action, k) => {
            const button = Object.assign(document.createElement("button"), { type: "button", className: `button${k ? "" : " primary"}`, textContent: action.label });

            button.addEventListener("click", () => {
                $("#warorders").close();
                state.warTable?.act(action, (said) => {
                    mapNote(said, 5000);

                    const view = state.warTable?.refresh();

                    if (view && state.worldMap?.war) {
                        state.worldMap.setWar(view);
                    }
                });
            });

            return button;
        }),
        $("#warordersback"),
    );
    $("#warorders").showModal();
    menu.querySelector("button").focus();
}

$("#warordersback").addEventListener("click", () => $("#warorders").close());

function closeWorldMap() {
    // (Closed while picking somewhere: called off)
    const picking = state.picking;

    state.picking = null;
    state.travel = null;
    state.plans = null;
    clearInterval(state.warLive);
    state.warLive = 0;
    state.warTable = null;

    state.mapMode = null;
    state.unpicked = null;

    if ($("#marker").open) {
        $("#marker").close();
    }

    if (state.worldMap) {
        state.worldMap.onPick = null;
        state.worldMap.pingsOf = null;
        state.worldMap.partyOf = null;
        state.worldMap.markersOf = null;
        state.worldMap.onTap = null;
        state.worldMap.travel = null;
        state.worldMap.build = null;
        state.worldMap.war = null;
        state.worldMap.selected = null;
        state.worldMap.rest();
    }

    $("#worldmappick").hidden = true;
    $("#worldmaptitle").textContent = "The world";
    $("#worldmapkey").hidden = false;
    $("#warmapkey").hidden = true;
    $("#worldmaplegend").hidden = false;
    $("#worldmapcancel").textContent = "Cancel";
    picking?.(null);

    if ($("#worldmap").open) {
        $("#worldmap").close();
        state.game?.start();
    }
}

// The map's key opened (above its "Key" button), or folded away again: folded away at first, so
// the map's seen whole, and as it was left after
function toggleLegend() {
    const legend = $("#worldmaplegend");
    const open = !legend.classList.contains("open");
    const toggle = $("#worldmaplegendtoggle");

    legend.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = open ? "Hide the key" : "Show the key";
}

// The map's key: each icon, and the fog
async function keyOf() {
    const { drawBuildingIcon, drawMarker, drawMissionMark, drawTracked, ICON_NAMES } = await import("./app/mapicons.js");
    const list = $("#worldmapkey");

    list.replaceChildren();

    for (const kind of ["tavern", "blacksmith", "church", "guild", "hall", "keep", "barracks", "swordsmith", "armorer", "scriptorium", "alchemist", "masterSwordsmith", "masterArmorer", "emporium"]) {
        const label = ICON_NAMES[kind];
        const item = document.createElement("li");
        const icon = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });

        drawBuildingIcon(icon.getContext("2d"), kind, 22, 22, 40);
        item.append(icon, label);
        list.append(item);
    }

    const fog = document.createElement("li");

    fog.append(Object.assign(document.createElement("span"), { className: "fog" }), "Not yet explored");
    list.append(fog);

    // (What's been heard tell of: somewhere in its circle; a hell's cult's violet, with a moon)
    for (const [hell, label] of [[false, "Heard tell of: somewhere in it"], [true, "Strange lights by night"]]) {
        const item = document.createElement("li");
        const glyph = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });
        const context = glyph.getContext("2d");
        const colour = hell ? "190, 140, 255" : "236, 214, 150";

        context.beginPath();
        context.arc(22, 22, 17, 0, Math.PI * 2);
        context.fillStyle = `rgba(${colour}, 0.12)`;
        context.fill();
        context.setLineDash([5, 5]);
        context.lineWidth = 2;
        context.strokeStyle = `rgba(${colour}, 0.85)`;
        context.stroke();
        context.fillStyle = `rgb(${colour})`;

        if (hell) {
            context.beginPath();
            context.rect(10, 10, 24, 24);
            context.arc(24.7, 20.4, 5.1, 0, Math.PI * 2);
            context.clip("evenodd");
            context.beginPath();
            context.arc(22, 22, 6, 0, Math.PI * 2);
            context.fill();
        } else {
            context.font = "bold 14px sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("?", 22, 23);
        }

        item.append(glyph, label);
        list.append(item);
    }

    // (A hell rift open in the wilds: its land red, a tear in it; or, where it's not been
    // uncovered, a red dashed ring with a "?")
    for (const [known, label] of [[true, "A hell rift: close it before it seals itself"], [false, "A hell rift, somewhere in it"]]) {
        const item = document.createElement("li");
        const glyph = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });
        const context = glyph.getContext("2d");

        context.beginPath();
        context.arc(22, 22, 17, 0, Math.PI * 2);
        context.fillStyle = `rgba(232, 52, 28, ${known ? 0.3 : 0.12})`;
        context.fill();
        context.setLineDash(known ? [] : [6, 4]);
        context.lineWidth = 2;
        context.strokeStyle = "rgba(232, 52, 28, 0.95)";
        context.stroke();

        if (known) {
            context.beginPath();
            context.ellipse(22, 22, 3.6, 11, 0, 0, Math.PI * 2);
            context.fillStyle = "rgb(232, 52, 28)";
            context.fill();
            context.beginPath();
            context.ellipse(22, 22, 1.3, 7.5, 0, 0, Math.PI * 2);
            context.fillStyle = "rgb(255, 226, 170)";
            context.fill();
        } else {
            context.font = "bold 14px sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = "rgb(232, 52, 28)";
            context.fillText("?", 22, 23);
        }

        item.append(glyph, label);
        list.append(item);
    }

    // (A camp or a lair tracked home by its trails' signs: its icon with a pale paw)
    const tracked = document.createElement("li");
    const paw = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });

    drawBuildingIcon(paw.getContext("2d"), "camp", 20, 20, 32);
    drawTracked(paw.getContext("2d"), 20, 20, 32);
    tracked.append(paw, "Tracked home by its trails");
    list.append(tracked);

    // (Where a war mission takes the player: a red ring with a star in it)
    const mission = document.createElement("li");
    const ring = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });

    drawMissionMark(ring.getContext("2d"), 22, 22, { size: 13 });
    mission.append(ring, "A war mission");
    list.append(mission);

    // (The pin: held down to drop it; and tapping twice to run)
    const pin = document.createElement("li");
    const glyph = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });
    const context = glyph.getContext("2d");

    context.strokeStyle = "rgba(20, 30, 50, 0.9)";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(22, 40);
    context.lineTo(22, 22);
    context.stroke();
    context.beginPath();
    context.arc(22, 15, 10, 0, Math.PI * 2);
    context.fillStyle = "#64b4ff";
    context.fill();
    context.stroke();
    pin.append(glyph, "Hold: drop a pin · tap twice: run there");
    list.append(pin);

    // (A marker: put down with its button, and tapped to share it or take it away)
    const marker = document.createElement("li");
    const sign = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });

    drawMarker(sign.getContext("2d"), 22, 42, "flag", { size: 22 });
    marker.append(sign, `Your markers (up to ${MARKERS.most}): tap one to share it or take it away`);
    list.append(marker);
}

// The war table's key, in their people's colour: each of the war's marks, and what's seen now
async function warKey(colour) {
    const { drawWarMark } = await import("./app/mapicons.js");
    const list = $("#warmapkey");

    if (list.dataset.colour === colour) {
        return;
    }

    list.dataset.colour = colour;
    list.replaceChildren();

    for (const [kind, label] of [["army", "Army"], ["reserve", "Reserve"], ["reinforcement", "Reinforcements"], ["supply", "Supply wagon"], ["camp", "Camp"], ["depot", "Supply depot"]]) {
        const item = document.createElement("li");
        const icon = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });

        drawWarMark(icon.getContext("2d"), kind, 22, 22, 34, colour);
        item.append(icon, label);
        list.append(item);
    }

    const lit = document.createElement("li");

    lit.append(Object.assign(document.createElement("span"), { className: "lit" }), "Seen now; the rest of theirs unseen");
    list.append(lit);
}

$("#worldmapclose").addEventListener("click", closeWorldMap);
$("#worldmaplegendtoggle").addEventListener("click", toggleLegend);
$("#worldmapcancel").addEventListener("click", () => (state.mapMode ? mapMode(null) : closeWorldMap()));
$("#worldmapping").addEventListener("click", () => mapMode(state.mapMode === "ping" ? null : "ping"));
$("#worldmapmark").addEventListener("click", () => {
    if (state.mapMode === "mark") {
        mapMode(null);
    } else if ((state.game?.markerView().length ?? 0) >= MARKERS.most) {
        mapNote(`${MARKERS.most} markers already: tap one to take it away first`);
    } else {
        mapMode("mark");
    }
});
$("#worldmapin").addEventListener("click", () => state.worldMap?.zoom(0.6));
$("#worldmapout").addEventListener("click", () => state.worldMap?.zoom(1 / 0.6));
$("#worldmaphere").addEventListener("click", () => state.worldMap?.centre());
$("#worldmapunpin").addEventListener("click", unpin);
$("#worldmap").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeWorldMap();
});
// (Drawn again whenever the map's canvas changes size, not only when the window says it's been
// resized: Chrome on Android says so while a phone's still turning, and not once it's done)
const redrawMap = () => $("#worldmap").open && state.worldMap?.redraw();

if (typeof ResizeObserver === "function") {
    new ResizeObserver(redrawMap).observe($("#worldmapcanvas"));
} else {
    window.addEventListener("resize", redrawMap);
}

function quit() {
    keepPlace();
    inWorld(null);
    closeWorldMap();
    $("#menu").close();
    $("#invite").close();
    state.together?.close();
    setTogether(null);
    state.onServer = null;
    state.game?.dispose();
    state.game = null;
    window.pellagos.playing = false;
    debug.watch({ game: null });
    title();
}

// --- Playing together (docs/WAR.md M11) ---

// The world opened to others, from the menu: its code, and who's come
// (`via`: the server it's opened through, chosen in Host on this Device: a broker, or null for the
// old relay; unless it's given, brokerFor's)
async function invite({ via = undefined } = {}) {
    const game = state.game;

    if (!game || game.remote) {
        return;
    }

    $("#menu").close();
    $("#invite").showModal();
    showInvite();

    if (state.together) {
        // (The server it's open through asked its name again: its owner may have renamed it since)
        const via = state.together.via;

        if (via) {
            nameNow(via).then((name) => {
                if (state.together?.via === via && name !== via.name) {
                    via.name = name;
                    showInvite();
                }
            });
        }

        return;
    }

    const opened = await openToOthers(game, { via });

    showInvite(opened.problem ?? "");
}

// The player's own world (`game`'s) opened to others: through the broker of a world server
// (`via`, chosen; else brokerFor's), else the old relay; `reclaim` ({ id, token, listed }), the
// listing it had before its page was started again, taken back if the broker's kept it, else a new
// code. Kept to open again should the game fall over or be reloaded (keepHosting). Resolves with
// { world } (state.together's now), or { problem } (why it couldn't be, in words)
async function openToOthers(game, { reclaim = null, via = undefined } = {}) {
    const { openWorld, RELAY_ERRORS } = await import("./app/together.js");
    const broker = via === undefined ? await brokerFor() : via;

    try {
        const world = await openWorld(game, {
            ...(broker ? { broker: { address: broker.address, listing: { ...(await listingOf(game)), listed: Boolean(reclaim?.listed) }, ...(reclaim ? { reclaim } : {}) } } : {}),
            // (Those who come in: who they are and what they carry theirs, what this world remembers
            // of them its own, kept with it by their own id: save.js visitorOf, keepVisitor)
            ...(state.stay?.world ? { visitors: { arrive: (brought) => visitorOf(state.stay.world.id, brought), leave: (character) => keepVisitor(state.stay.world.id, character) } } : {}),
            // (Someone come or gone: shown; and the world goes on, for them, even with the menu open;
            // nothing downloaded while the world's sent them)
            onChange: () => {
                fetcher.hold("someone joining", { for: 5000 });
                showInvite();

                // (Unless its host has paused it for everyone: then whoever comes is told so)
                if (!state.game?.running && !state.everyone) {
                    state.game?.start();
                }
            },
            // (Its link dropped: shown on the HUD while it comes back; lost for good, the world's
            // its own again)
            onLink: (link) => {
                holdForLink(link);

                if (state.game === game) {
                    game.link = link;
                }
            },
            onDrop: () => {
                setTogether(null);
                inWorld(null);
                showInvite(RELAY_ERRORS.unreachable);

                if (state.game === game) {
                    game.link = null;
                    state.hud.message("Your world's link to the others was lost: it's yours alone again.", 5);
                }
            },
        });

        // (The downloader timing the round trip over the host's own link, to the relay)
        world.via = broker;
        $("#invitelist").checked = Boolean(reclaim?.listed && world.reclaimed);
        setTogether(world);
        world.link.onRtt = (rtt) => fetcher.measure(rtt);
        fetcher.probe = () => world.link.measure();
        keepHosting(world);

        return { world };
    } catch (error) {
        return { problem: RELAY_ERRORS[error.message] ?? (broker ? `Couldn't reach ${broker.name}'s broker.` : RELAY_ERRORS.unreachable) };
    }
}

// The player's own world, open to others through a broker, kept to open again should the game fall
// over or be reloaded (app/rejoin.js: its code and token, to take its listing back). Through the
// old relay, or played with no character kept (?play), there's nothing to open again
function keepHosting(world) {
    if (!world?.via || !world.link?.token || !state.save?.id) {
        return;
    }

    inWorld({ kind: "hosting", code: world.code, token: world.link.token, broker: world.via.address, listed: world.link.announcement?.visibility === "listed", character: state.save.id, name: state.save.hero?.name ?? null });
}

// What's said of a world opened to others, for a broker's listing (plan §8.3)
async function listingOf(game) {
    const { MOST_PLAYERS, NET_VERSION } = await import("./core/netplay.js");
    const hero = state.save?.hero ?? game.host?.players?.get?.("player")?.hero ?? {};

    return { name: state.stay?.world?.name ?? `${hero.name ?? "A player"}'s world`, people: hero.race ?? "human", most: MOST_PLAYERS, net: NET_VERSION, listed: false };
}

// The world server whose broker a world's opened through (plan §8.3), unless one's chosen (Host
// on this Device): the one chosen last, if it can be; else the one the game came from, if it is
// one; else the old relay at the page's own server (npm start's, or ?relay='s); else the first
// known server that connects players, the default server first (app/multiplayer.js relayChoices).
// { name (as it's called now), address (its broker's), at (the server's address), own (the page's
// own), key (else, the server's, as it's remembered) }, or null for the old relay
async function brokerFor() {
    const pick = async ({ choices, chosen }) => throughChoice(choices.find(({ key }) => key === chosen) ?? null);
    const through = await pick(await relayOptions());

    if (!through.problem) {
        return through.broker;
    }

    // (The one chosen can't be, now: every known server asked how it is, and one chosen again)
    const again = await pick(await relayOptions({ fresh: true }));

    return again.problem ? null : again.broker;
}

// The relays a player's own world can be opened through, and its code looked for on, as they are
// now (app/multiplayer.js relayChoices): the page's own world server's, the page's own relay
// (npm start's: pageRelay), and each known server's (asked how it is first, if `fresh`, else as
// last heard); and which is chosen, unless the player says otherwise (the one they chose last)
async function relayOptions({ fresh = false } = {}) {
    const { addressOf, baseOf } = await serversOf();
    const { brokerOf } = await import("./app/peer.js");
    const { relayChoices, RELAY_KEY } = await import("./app/multiplayer.js");
    const { relayAddress } = await import("./app/together.js");
    const given = new URLSearchParams(location.search).has("relay");
    const origin = addressOf(location.origin);
    const [own, hasRelay] = await Promise.all([pageServer(), given ? false : pageRelay(), fresh ? refreshServers({ redraw: false }) : null]);
    const page = own?.server?.broker && origin ? { name: own.server.name ?? location.host, address: brokerOf(origin), at: baseOf(origin) } : null;
    // (The page's own server, if it's a world server, is the page's choice, not a known server's as well)
    const servers = state.servers
        .list()
        .filter((record) => !(own && record.key === origin?.key))
        .map((record) => ({ ...serverState(record), isDefault: state.servers.isDefault(record.key) }));
    let remembered = null;

    try {
        remembered = localStorage.getItem(RELAY_KEY);
    } catch {
        // (Not kept: none remembered)
    }

    return relayChoices({ given: given ? { address: relayAddress() } : null, page, pageRelay: hasRelay ? { name: location.host, address: relayAddress() } : null, servers, remembered });
}

// A known server as Multiplayer shows it, from how it last answered (serverCards): { key, name,
// record, card, error, via, broker (its broker's address, if it connects players), at (where it's
// reached), state ("checking", "up", "down", "version", "walled") }
function serverState(record) {
    const { card, error, via } = serverCards.get(record.key) ?? {};
    const name = card?.server?.name ?? record.name ?? record.key;
    const reached = via ?? record;
    const walled = Boolean(error) && error.error === "unreachable" && location.protocol === "https:" && (netOf.homeHost(record.host) || !record.secure);
    // (A server takes the game's calls from its own pages and the game's website alone: from
    // another server's page, it's played from its own)
    const stands = !card && !error ? "checking" : walled ? "walled" : error?.error === "origin" ? "origin" : error ? "down" : card.server?.net !== netOf.NET_VERSION ? "version" : "up";
    const at = `${reached.secure ? "https" : "http"}://${reached.host}:${reached.port}`;

    return { key: record.key, name, record, card: card ?? null, error: error ?? null, via: via ?? null, broker: stands === "up" && card.server?.broker ? netOf.brokerOf(reached) : null, at, state: stands };
}

// What's needed of one of relayOptions' choices to open a world through it, or look for a code on
// it: { broker (as brokerFor gives it), or null for the old relay; name }, or { problem } if it
// can't be. A known server still being asked how it is, asked now
async function throughChoice(choice) {
    if (!choice) {
        return { broker: null, name: "the relay" };
    }

    if (choice.kind === "relay") {
        return { broker: null, name: choice.name };
    }

    if (choice.own) {
        return { broker: { name: choice.name.replace(/ \(this game's own server\)$/, ""), address: choice.address, at: choice.at, own: true }, name: choice.name };
    }

    const record = state.servers.get(choice.key);

    if (!record) {
        return choice.address ? { broker: { name: choice.name, address: choice.address, at: choice.at, own: false }, name: choice.name } : { problem: "That server isn't known any more." };
    }

    if (!serverCards.get(record.key)?.card) {
        await askServer(record);
    }

    const now = serverState(record);
    const { SERVER_STATES } = await import("./app/multiplayer.js");

    if (!now.broker) {
        return { problem: `${now.name} ${now.state === "up" ? "doesn't connect players" : SERVER_STATES[now.state] ?? "can't be reached"}: choose another server.` };
    }

    return { broker: { name: now.name, address: now.broker, at: now.at, own: false, key: record.key }, name: now.name };
}

// The server whose broker is at `address` (a world opened to others, kept to open again: app/
// rejoin.js), as openToOthers takes it; or undefined, if it's none of those known now (brokerFor's)
async function viaOfBroker(address) {
    if (!address) {
        return undefined;
    }

    // (The page's own server's is known at once; a known server's once it's been asked)
    const find = ({ choices }) => choices.find((one) => one.kind === "broker" && one.address === address);
    const choice = find(await relayOptions()) ?? find(await relayOptions({ fresh: true }));

    return choice ? ((await throughChoice(choice)).broker ?? undefined) : undefined;
}

// The page's own relay (npm start's, server/index.js): whether its address answers as the relay
// does to a page (426, { relay: true }), asked once. A page from GitHub Pages, or a world server's,
// has none, and isn't asked
async function relayHere() {
    if ((await pageServer()) || location.hostname.endsWith(".github.io")) {
        return false;
    }

    const response = await fetch(new URL("relay", new URL("/", location.href)), { cache: "no-store" });

    return response.status === 426 && (await response.json()).relay === true;
}

function pageRelay() {
    state.pageRelay ??= relayHere().catch(() => false);

    return state.pageRelay;
}

// The relay chosen, remembered: chosen first next time (Host on this Device, Join a World on
// another Device, Invite others). Not one an invite link named
async function rememberRelay(key) {
    const { RELAY_KEY } = await import("./app/multiplayer.js");

    try {
        if (key && key !== "at") {
            localStorage.setItem(RELAY_KEY, key);
        }
    } catch {
        // (Not kept: chosen afresh next time)
    }
}

// The name of the server a world's opened through (brokerFor's), as it is now: its owner may have
// renamed it (the management page's Settings). As it was, if it can't be asked
async function nameNow(via) {
    if (via.own) {
        return (await pageServer({ fresh: true }))?.server?.name ?? via.name;
    }

    const record = state.servers?.list().find((one) => one.key === via.key);

    if (!record) {
        return via.name;
    }

    const { ServerClient } = await serversOf();
    const card = await new ServerClient(record, { servers: state.servers, player: state.you?.proving }).status().catch(() => null);

    return card?.server?.name ?? via.name;
}

// The card of the world server this page came from (null if it's no world server: GitHub Pages,
// or `npm start`), asked once; or again (`fresh`), where what it says now matters (its name)
function pageServer({ fresh = false } = {}) {
    if (fresh) {
        state.pageServer = null;
    }

    state.pageServer ??= fetch(new URL("api/v1/status", new URL("/", location.href)))
        .then((response) => (response.ok ? response.json() : null))
        .then((card) => (card?.server?.id ? card : null))
        .catch(() => null);

    return state.pageServer;
}

function showInvite(problem = "") {
    const code = state.together?.code;
    const via = state.together?.via ?? null;
    const others = code && state.game ? state.game.others() : [];

    $("#invitestatus").textContent = problem || (code ? `Your world's open to others${via ? ` through ${via.name}` : ""}. Give them this code:` : "Opening your world to others…");
    $("#invitelisting").hidden = !(code && via);
    $("#invitelistname").textContent = via ? `List it on ${via.name}` : "List it on the server";
    $("#invitecode").hidden = !code;
    $("#invitecode").textContent = code ?? "";
    $("#invitehow").hidden = !code;
    $("#inviteshare").hidden = !code;
    $("#invitestop").hidden = !code;

    if (code) {
        // (Joined through a server other than the page's own: it's named in the link)
        const link = `${location.origin}${location.pathname}?join=${code}${via && !via.own ? `&at=${encodeURIComponent(via.at)}` : ""}`;
        const reach = REACH_WORDS[linkReach(link)];

        $("#inviteon").textContent = via ? via.name : "this game's own relay";
        $("#invitelink").href = link;
        $("#invitelink").textContent = link;
        $("#invitereach").textContent = reach;
        $("#invitereach").hidden = !reach;
        $("#invitesend").hidden = typeof navigator.share !== "function";

        // (Its code to scan, made again only for another link)
        if ($("#inviteqr").dataset.link !== link) {
            $("#inviteqr").dataset.link = link;
            $("#invitecopy").textContent = "Copy the link";
            qrOf(link).then((src) => {
                if ($("#inviteqr").dataset.link === link) {
                    $("#inviteqr").src = src;
                    $("#inviteqr").alt = `QR code of the link to join with the code ${code}`;
                }
            });
        }
    }

    $("#inviteplayers").replaceChildren(...others.map(({ name, people, hostile }) => {
        const row = document.createElement("li");

        row.append(Object.assign(document.createElement("span"), { textContent: name }), Object.assign(document.createElement("span"), { className: `people${hostile ? " hostile" : ""}`, textContent: `the ${people}${hostile ? ", at war with yours" : ""}` }));

        return row;
    }));
}

function closeInvite() {
    $("#invite").close();
    state.game?.start();
}

// Who comes to the world joined, said; and, with any kept, a way to choose another (or a new one)
function showJoinWho() {
    const save = state.joinAs;

    $("#joinwho").textContent = save ? `You'll come as ${save.hero.name} (${peopleOf(save.hero)}): at peace or at war with whoever's there as your peoples are.` : "You'll make a character first.";
    $("#joinchange").hidden = !loadCharacters(WEAPONS).length;
}

async function join(event) {
    event.preventDefault();

    const code = $("#joincode").value.toUpperCase().replace(/[^A-Z]/g, "");

    if (code.length !== 4) {
        $("#joinstatus").textContent = "A world's code is four letters.";

        return;
    }

    if (!state.joinAs) {
        state.joinAfter = { code, at: state.joinAt, look: $("#joinat").value };
        $("#join").close();
        create();

        return;
    }

    const save = state.joinAs;

    // (Where it's looked for: the one chosen, asked first if it's a known server not heard from yet)
    $("#joingo").disabled = true;

    if (!state.joinChoices?.length || !$("#joinat").value) {
        await showJoinAt();
    }

    const choice = state.joinChoices.find(({ key }) => key === $("#joinat").value) ?? null;
    const through = await throughChoice(choice);

    if (through.problem) {
        $("#joingo").disabled = false;
        $("#joinstatus").textContent = through.problem;

        return;
    }

    rememberRelay(choice?.key);

    // (The one Continue as... carries on with, from now)
    playedSave(save);
    state.save = save;
    joinByCode(
        code,
        save,
        {
            stage: () => ($("#joinstatus").textContent = `Joining, looking on ${through.name}…`),
            problem: (words) => {
                $("#joingo").disabled = false;
                $("#joinstatus").textContent = words;
            },
        },
        { broker: through.broker?.address ?? null },
    );
}

// Into a friend's world by its code, as `save`, through `broker` (a server's broker's address;
// null, the old relay; unless given, joinBroker's): how it goes told to `tell` ({ stage, problem,
// waiting?, done?, gone? }: the join dialog's line of words, or the way back in's stages,
// REJOIN_STAGES friend), and once the world's come, played, kept to go back into (app/rejoin.js)
async function joinByCode(code, save, tell, { broker = undefined } = {}) {
    const { joinWorld, RELAY_ERRORS, NET_KICKS, NET_REFUSALS, versionWords } = await import("./app/together.js");

    tell.stage("reach");

    // (Nothing downloaded from here till the world's come and the game's settled into it)
    fetcher.hold("joining");

    let joined;

    const through = broker === undefined ? await joinBroker() : broker ? { address: broker } : null;

    try {
        joined = await joinWorld({
            ...(through ? { broker: through } : {}),
            code,
            character: characterOf(save),
            onStage: (stage) => tell.stage(stage),
            // (Its host's page started again, the world opened anew under its code: straight back in)
            onClosed: (reason) => (reason === "again" ? leftWorld("Your friend's world was opened again.", { again: true }) : leftWorld("The world's host has closed it to others.")),
            onLink: (link) => {
                holdForLink(link);

                if (state.game?.remote) {
                    state.game.link = link;
                }
            },
            onDrop: () => leftWorld("The link to the world was lost.", { again: true }),
        });
    } catch (error) {
        fetcher.release("joining");
        tell.problem(RELAY_ERRORS[error.message] ?? RELAY_ERRORS.unreachable);

        return;
    }

    // (Cancelled meanwhile)
    if (tell.gone?.()) {
        joined.close();
        fetcher.release("joining");

        return;
    }

    tell.stage("ask");
    setTogether(joined);
    joined.joining.onRefused = (reason, said) => {
        joined.close();
        setTogether(null);
        // (Another version: which is the newer, and what to do, by the host's version where it says it)
        tell.problem(reason === "version" ? versionWords(said?.net) : (NET_REFUSALS[reason] ?? "You couldn't join that world."));
    };
    joined.joining.onKicked = (reason) => {
        joined.close();
        leftWorld(NET_KICKS[reason] ?? "You were sent out of the world.");
    };
    joined.joining.onWelcome = (welcome) => {
        tell.done?.();
        playJoined(save, welcome, joined.joining, { rejoin: { kind: "friend", code, broker: through?.address ?? null, character: save.id ?? null } });
    };
    joined.joining.onState = () => {
        fetcher.hold("the world again", { for: 5000 });
        state.game?.rehost();
    };

    // (The downloader timing the round trip to the host, as the game does every second, and told
    // when the steps it keeps in hand grow: its messages coming unevenly)
    let delay = joined.joining.delay;

    joined.joining.onPong = (rtt) => {
        fetcher.measure(rtt, { strained: joined.joining.delay > delay });
        delay = joined.joining.delay;
    };
}

// The broker a world's joined through (plan §8.3): the server named for it (an invite link's `at`,
// or the one a player's world was chosen from); else the page's own server's, if it's a world
// server; else none (the old relay)
async function joinBroker() {
    const { addressOf } = await serversOf();
    const { brokerOf } = await import("./app/peer.js");
    const at = typeof state.joinAt === "string" ? addressOf(state.joinAt) : state.joinAt;

    if (at) {
        return { address: brokerOf(at) };
    }

    if (new URLSearchParams(location.search).has("relay")) {
        return null;
    }

    return (await pageServer())?.server?.broker ? { address: brokerOf(addressOf(location.origin)) } : null;
}

// How a friend's world is linked, for the HUD's orb (app/worldlink.js): through a server's broker,
// "direct" or "relayed" as it's come to be (app/peer.js BrokerJoin `how`; null while it's still
// finding out); through the old relay, always "relayed"
function linkHow(link) {
    if (!link) {
        return null;
    }

    return "how" in link ? link.how : "relayed";
}

// Playing together or not (a world opened or joined, app/together.js; or null): the downloader
// told, so it keeps out of the way of the game's messages, and, alone again, what it was holding
// back for let go of
function setTogether(together) {
    state.together = together;
    fetcher.together = Boolean(together);

    if (!together) {
        fetcher.probe = () => {};

        for (const reason of ["joining", "someone joining", "link", "the world again"]) {
            fetcher.release(reason);
        }
    }
}

// The link to the others dropped (this game's, or the host's: `link` says which), or back (null):
// nothing downloaded till it's back, and for 5 s after
function holdForLink(link) {
    fetcher.hold("link", link ? {} : { for: 5000 });
}

// Into the world joined: made again from its seed, the host's copy of it restored (the player's
// progress, standing and followers kept with their character as they go; the world's not theirs
// to keep)
async function playJoined(save, welcome, joining, options = {}) {
    state.building = true;
    fullScreen.play();

    try {
        await playingJoined(save, welcome, joining, options);
    } catch (error) {
        failed(error);
    } finally {
        state.building = false;
    }
}

// (`server`: a world on a world server, told once the game's ready, so its clock goes on; `kept`:
// one that keeps its heroes, whose hero's the world's, not this device's to keep; `rejoin`, where
// it is, kept to go back into should the game fall over: app/rejoin.js)
async function playingJoined(save, welcome, joining, { server = false, kept = false, rejoin = null } = {}) {
    const { createJoinedGame } = state.modules;
    const { view, kit, sound } = state.session;
    const keep = (write) => (kept || !save ? () => {} : write);

    $("#join").close();
    dropReadyCreator();
    state.game?.dispose();
    fetcher.hold("starting");
    show("loading");
    $("#loadlist").replaceChildren();
    setProgress(0, "Building the world you've joined");
    await painted();

    // (As playing's: the skin atlas waited for once it's needed)
    const game = await createJoinedGame({
        view,
        kit,
        sound,
        hud: state.hud,
        hero: save?.hero,
        welcome,
        joining,
        // (What they carry and grow into theirs, kept on this device as it changes, the one that's
        // brought next time: what the world knows of them is its own, kept there)
        onProgress: keep((progress) => saveProgress(save, progress)),
        // (Their wheels and Action Bar, their messages and what they've been told once: a
        // character of this device's, kept on it as they're changed; a hero the world keeps, by
        // the world, with them, and as this device had them only if the world has none yet:
        // app/session.js createJoinedGame)
        kept,
        wheels: save ? loadWheels(save) : null,
        onWheels: keep((wheels) => saveWheels(save, wheels)),
        messages: save ? loadMessages(save) : [],
        onMessages: keep((messages) => saveMessages(save, messages)),
        onWorldMap: openWorldMap,
        onPing: pingShown,
        told: save ? loadTold(save) : [],
        onTold: keep((told) => saveTold(save, told)),
    });

    state.worldMap?.dispose();
    state.worldMap = null;
    state.game = game;
    // (On a world server, its panel from the party menu too: its World button; and the world a
    // block there holds in: that server's world, not just any of its seed)
    game.onWorldPanel = server ? worldPanelFromParty : null;

    if (server && state.onServer) {
        game.worldKey = `server:${state.onServer.client.record.key}:${state.onServer.entered.world}`;
    }
    // (Who the world's with, and how, for the HUD's orb: app/worldlink.js; on a world server, its
    // world and the server, else a friend's, linked directly or through the server's broker)
    game.linkAbout = server
        ? { kind: "server", world: state.onServer?.entered?.card?.name ?? null, server: state.onServer?.client?.record?.name ?? state.onServer?.client?.card?.server?.name ?? null }
        : { kind: "friend", how: () => linkHow(state.together?.link) };
    await kit.ready;
    await game.build(({ label, done, total }) => setProgress(done / total, label, `${done} of ${total}`));
    game.showSquares(settings.squares);
    game.showNavigation(settings.navigation);
    showMinimap(settings.minimap);
    showStick(settings.stick);
    floatStick(settings.stickFloats);
    showZoom(settings.zoom);
    game.cursor = pointer;

    // (A hero the world keeps: their settings for how they play kept with them, theirs on this
    // device too, as they last set them on any; never kept there yet, this device's told it)
    if (kept) {
        const own = game.host.players.get(game.me)?.own?.settings;
        const theirs = playSettingsOf(own);

        // (Whom they've blocked in this world kept with them too: theirs, in place of this device's)
        if (Array.isArray(own?.blocked)) {
            settings.blocked = blocksOf([...settings.blocked.filter(({ world }) => world !== game.worldKey), ...blocksOf(own.blocked).filter(({ world }) => world === game.worldKey)]);
            saveSettings({ blocked: settings.blocked });
        }

        if (Object.keys(theirs).length) {
            Object.assign(settings, theirs);
            saveSettings(theirs);
            showPlaySettings();
        } else {
            joining.own({ settings: keptSettings(game) });
        }
    }

    game.resistSummons = settings.resistSummons;
    game.refuseInvites = settings.refuseInvites;
    applyChat(game);
    game.autoSnag = settings.autoSnag;
    game.messengers = settings.messengers;
    game.keys = keysOf(settings.keyBindings);
    game.snagFilter = snagChoiceOf();
    game.autoLock = settings.autoLock;
    game.quickAlways = settings.quickAlways;
    game.chatter = settings.chatter;
    game.tapToMove = settings.tapToMove;
    // (The opening fly-in; not for the quick start straight into a game, ?play, unless &flyin)
    game.flyIn = settings.flyIn && (!params.has("play") || params.has("flyin"));
    game.showEnmity = settings.showEnmity;
    applyCamera();
    game.onAdapt = showAdapted;
    game.onChooseQuick = chooseQuick;
    game.onAskDismiss = askDismiss;
    game.showQuick(quickShown());
    debug.watch({ game });
    show("hud");
    game.start();
    underway(game);

    if (server) {
        joining.ready();
    }

    if (rejoin) {
        inWorld({ ...rejoin, name: game.self?.hero?.name ?? null, ...(rejoin.kind === "friend" ? { host: game.hostName } : {}) });
    }

    // (Their character was in the world already, on another device or on a link gone dead without
    // a word: theirs here now, as it stood: core/netplay.js Hosting #takeOver)
    if (welcome.took) {
        state.hud.message("Your other session in this world was closed: you carry on here.", 5);
    }

    // (Nothing downloaded till the steps it keeps in hand have settled, 5 s at least, and 30 s at
    // most: a game that can't keep up with the host may never settle)
    fetcher.hold("joining", { for: 5000, until: () => !game.remote || Math.abs(game.remote.inHand - game.remote.delay) < 1, most: 30000 });
}

// Out of a world joined (its host gone, or the link lost): back to the title, saying why; the link
// lost (`again`), straight back in, as after a crash (goBackIn)
function leftWorld(why, { again = false } = {}) {
    const record = state.inWorld;

    inWorld(null, { keep: again });
    setTogether(null);
    state.onServer = null;
    $("#worldpanel").close();

    if (!state.game?.remote) {
        return;
    }

    closeWorldMap();
    $("#menu").close();
    state.game.dispose();
    state.game = null;
    window.pellagos.playing = false;
    debug.watch({ game: null });
    title();
    $("#titlenote").textContent = why;
    $("#titlenote").hidden = false;

    if (again && record) {
        goBackIn(record, { why });
    }
}

// Where the player is, in another's world, kept to go back into should the game fall over or be
// reloaded (app/rejoin.js), and written again every REJOIN.every while they're there; null, let go
// of (or, `keep`, left as last written: they're going straight back in)
function inWorld(record, { keep = false } = {}) {
    clearInterval(state.inWorldEvery);
    state.inWorld = record;

    if (!record) {
        if (!keep) {
            forgetInWorld(localStorage);
        }

        return;
    }

    const game = state.game;

    keepInWorld(localStorage, record);
    state.inWorldEvery = setInterval(() => {
        if (state.game === game && state.inWorld === record) {
            keepInWorld(localStorage, record);
        } else {
            clearInterval(state.inWorldEvery);
        }
    }, REJOIN.every);
}

// Back into the world the player was in (app/rejoin.js: `record`) when the game last stopped
// without leaving it, or whose link's just been lost (`why`): at once, each stage of the way shown
// as it's come to (REJOIN_STAGES), what's wrong if it can't get there and a way to try again.
// Cancel stops it, and lets the world go
async function goBackIn(record, { why = "" } = {}) {
    const attempt = { record, at: null };
    const words = rejoinWords(record);
    const stages = REJOIN_STAGES[record.kind];
    const gone = () => state.goingBackIn !== attempt;
    // (Each stage before `id` done, `id` as `how`, the rest still to come)
    const mark = (id, how) => {
        const at = stages.findIndex(([each]) => each === id);

        attempt.at = id;

        for (const [k, li] of [...$("#rejoinstages").children].entries()) {
            const next = k < at ? "done" : k === at ? how : "waiting";

            if (li.dataset.state !== next) {
                li.dataset.state = next;
            }
        }
    };

    state.goingBackIn = attempt;
    $("#rejointitle").textContent = words.title;
    $("#rejoinabout").textContent = words.about;
    $("#rejoinwhy").textContent = why;
    $("#rejoinwhy").hidden = !why;
    $("#rejoinstages").replaceChildren(
        ...stages.map(([id, label]) => {
            const li = Object.assign(document.createElement("li"), { textContent: label });

            li.dataset.stage = id;
            li.dataset.state = "waiting";

            return li;
        }),
    );
    $("#rejoinnote").textContent = "";
    $("#rejoinproblem").textContent = "";
    $("#rejoinproblem").hidden = true;
    $("#rejoinretry").hidden = true;

    if (!$("#rejoin").open) {
        $("#rejoin").showModal();
    }

    const tell = {
        stage: (id) => !gone() && mark(id, "now"),
        waiting: (text) => !gone() && ($("#rejoinnote").textContent = text),
        problem: (text) => {
            if (gone()) {
                return;
            }

            mark(attempt.at ?? stages[0][0], "failed");
            $("#rejoinnote").textContent = "";
            $("#rejoinproblem").textContent = text;
            $("#rejoinproblem").hidden = false;
            $("#rejoinretry").hidden = false;
            $("#rejoinretry").focus();
        },
        done: () => {
            if (!gone()) {
                state.goingBackIn = null;
                $("#rejoin").close();
            }
        },
        gone,
    };

    if (record.kind === "server") {
        serverBackIn(record, tell);
    } else if (record.kind === "hosting") {
        hostBackIn(record, tell);
    } else {
        friendBackIn(record, tell);
    }
}

// Back into the player's own world, open to friends (goBackIn): loaded as it was kept, then opened
// to them again, under its code if the broker's kept it (those who were in it sent to come in
// again), else a new one
async function hostBackIn(record, tell) {
    const save = loadCharacters(WEAPONS).find(({ id }) => id === record.character);

    tell.stage("load");

    if (!save) {
        tell.problem("The character you were playing isn't on this device any more.");

        return;
    }

    // (Tried again once it's loaded: not loaded again)
    if (!state.game) {
        state.save = save;
        await play(save);
    }

    const game = state.game;

    if (tell.gone()) {
        return;
    }

    if (!game || game.remote) {
        tell.problem("Your world couldn't be loaded.");

        return;
    }

    tell.stage("reopen");

    // (Through the server it was open through, to take its listing back there)
    const { world, problem } = state.together ? { world: state.together } : await openToOthers(game, { reclaim: { id: record.code, token: record.token, listed: record.listed }, via: await viaOfBroker(record.broker) });

    if (problem) {
        tell.problem(problem);

        return;
    }

    if (tell.gone()) {
        world.close();
        setTogether(null);

        return;
    }

    tell.done();
    state.hud.message(world.reclaimed ? `Your world's open to friends again, under its code, ${world.code}: those who were in it are coming back.` : `Your world's open to friends again, under a new code: ${world.code}.`, 6);
}

// Back into a friend's world (goBackIn), by its code, as the character played there
function friendBackIn(record, tell) {
    const save = loadCharacters(WEAPONS).find(({ id }) => id === record.character);

    if (!save) {
        tell.stage("reach");
        tell.problem("The character you were playing there isn't on this device any more.");

        return;
    }

    playedSave(save);
    state.save = save;
    state.joinAs = save;
    joinByCode(record.code, save, tell, { broker: record.broker });
}

// Back into a world on a server (goBackIn): the server reached, the player shown to be who they
// are, their place in the world found, and the hero they were playing taken in again (theirs by its
// slot, or by its name, in a world that keeps heroes; else the character on this device)
async function serverBackIn(record, tell) {
    const { ServerClient } = await serversOf();
    const server = state.servers.get(record.server);

    tell.stage("reach");

    if (!server) {
        tell.problem("That server isn't remembered on this device any more: add it again in Multiplayer, Known Servers.");

        return;
    }

    const client = new ServerClient(server, { servers: state.servers, player: state.you?.proving });
    let entered;

    try {
        await client.reach();

        if (tell.gone()) {
            return;
        }

        tell.stage("prove");
        await client.prove();

        if (tell.gone()) {
            return;
        }

        tell.stage("enter");
        entered = await client.enter({ world: record.world });
    } catch (error) {
        tell.problem(error.message);

        return;
    }

    if (tell.gone()) {
        return;
    }

    const kept = entered.card?.heroes === "kept";
    const save = record.character ? (loadCharacters(WEAPONS).find(({ id }) => id === record.character) ?? null) : null;
    const hero = kept ? (Number.isInteger(record.hero) ? record.hero : entered.heroes?.find(({ name }) => name === record.name)?.slot) : undefined;

    if (kept ? !entered.heroes?.some(({ slot }) => slot === hero) : !save) {
        tell.problem(kept ? "Your hero there wasn't found: choose who goes in from Multiplayer, Join a World Hosted on a Server." : "The character you were playing there isn't on this device any more.");

        return;
    }

    state.joinAs = save ?? state.joinAs;
    playServerWorld(client, entered, { save, hero, tell });
}

// The way back in cancelled: whatever link it had made closed, and the world let go of
function cancelBackIn() {
    state.goingBackIn = null;
    $("#rejoin").close();
    state.together?.close();
    setTogether(null);
    state.onServer = null;
    fetcher.release("joining");
    inWorld(null);
}

// --- Worlds on servers: Multiplayer's Join a World Hosted on a Server and Known Servers (generated/world_server_plan.md §8.1, §6) ---

// The game's side of world servers (app/servers.js), loaded the first time it's wanted: once, one
// module after the other, whoever wants it meanwhile waiting on that one load. (A player's iPhone,
// asked for it by two at once as the page opened, gave one of them the module before it had run:
// "Cannot access 'KnownServers' before initialization"; loaded again if a load fails)
async function loadServers() {
    try {
        const servers = await import("./app/servers.js");
        const you = await import("./app/you.js");
        const { NET_VERSION, versionWords } = await import("./core/netplay.js");
        const { brokerOf } = await import("./app/peer.js");

        return [servers, you, { NET_VERSION, versionWords, brokerOf }];
    } catch (error) {
        state.serversLoading = null;

        throw error;
    }
}

// (Kept for what's worked out as it's shown, with no waiting: serverState)
let netOf = null;

async function serversOf() {
    const [servers, you, net] = await (state.serversLoading ??= loadServers());

    netOf ??= { ...net, homeHost: servers.homeHost, baseOf: servers.baseOf, inviteLink: servers.inviteLink, refusals: servers.SERVER_REFUSALS };

    // (Known, and the default servers given the first time: app/servers.js DEFAULT_SERVERS)
    if (!state.servers) {
        state.servers = new servers.KnownServers();
        state.servers.offerDefaults();
    }

    // (The player's own identity, shown coming into a server's worlds: made the first time,
    // going by the name of the character played last till they change it)
    state.you ??= you;
    you.loadPlayer({ name: state.save?.hero?.name ?? null });

    return servers;
}

// How each known server last answered (its card, or why it couldn't), by its address's key
const serverCards = new Map();

// One known server asked how it is: its card, or why it couldn't be, kept in serverCards
async function askServer(record) {
    const { ServerClient } = await serversOf();

    try {
        const client = new ServerClient(record, { servers: state.servers, player: state.you?.proving });

        serverCards.set(record.key, { card: await client.status(), via: client.via });
    } catch (error) {
        serverCards.set(record.key, { error });
    }
}

// Every known server asked how it is, Multiplayer's lists drawn again as each answers (unless
// `redraw` is false)
async function refreshServers({ redraw = true } = {}) {
    await serversOf();
    await Promise.all(
        state.servers.list().map(async (record) => {
            await askServer(record);

            if (redraw) {
                redrawServers();
            }
        }),
    );
}

// Multiplayer's lists of servers drawn again, those open: Join a World Hosted on a Server's, Known
// Servers', the choices and listed worlds of Join a World on another Device, the choices of Host on
// this Device, and the servers of Host on a Server
function redrawServers() {
    if ($("#worlds").open) {
        showWorlds();
    }

    if ($("#servers").open) {
        showServers();
    }

    if ($("#join").open) {
        showJoinAt();
        showJoinListed();
    }

    if ($("#hosthere").open) {
        showHostHereVia();
    }

    if ($("#hostserver").open && !$("#hostserverpick").hidden) {
        showHostServerList();
    }
}

// How a known server stands, in words (serverState's `state`): up, its version and how far away;
// still being asked; or what's wrong
function statusWords(now) {
    switch (now.state) {
        case "up":
            return `Up · version ${now.card.server.version} · ${Math.round(now.card.rtt ?? 0)} ms`;
        case "checking":
            return "Asking it how it is…";
        case "version":
            return netOf.versionWords(now.card.server?.net, { server: true });
        case "walled":
            return netOf.refusals.walled;
        case "origin":
            return "It takes the game only from its own page (and the game's website): open the game from it to play there.";
        default:
            return now.error?.message ?? netOf.refusals.unreachable;
    }
}

// What a known server that's up does, in words: the worlds it lists, whether it connects players
// hosting on their own devices (and how many such worlds are open), and who may make worlds on it
function doesWords(now) {
    const { card } = now;
    const listed = (card.worlds ?? []).length;
    const open = (card.players ?? []).length;
    const makers = card.server?.makers;

    return [
        listed === 1 ? "1 world listed" : `${listed} worlds listed`,
        card.server?.broker ? `connects players${open ? ` (${open === 1 ? "1 player's world" : `${open} players' worlds`} open)` : ""}` : "doesn't connect players",
        makers ? `anyone may make worlds (${makers.each} each${makers.left ? "" : ", none left now"})` : "makes worlds with a creator key",
    ].join(" · ");
}

// A link that opens the game from a server itself (it always plays the server's version, and
// always reaches it), with the server and what's held for `world` there carried in it; over plain
// http where this page (https) can't reach it
function serverPage(record, world = null) {
    const at = serverState(record).state === "walled" ? { ...record, secure: false } : record;

    return netOf.inviteLink(`${netOf.baseOf(at)}/`, { address: at, id: record.id, world, ...(world ? { key: record.worlds?.[world]?.key ?? null, ticket: record.worlds?.[world]?.ticket ?? null } : {}) });
}

/**
 * Join a World Hosted on a Server: each known server's worlds (those it lists, those open to
 * anyone, and those a key or ticket's held for here); an invite link pasted; who comes (as joining
 * a world does). `invite` (an invite link's, app/servers.js inviteOf) is followed at once.
 */
async function openWorlds({ note = "", invite = null } = {}) {
    await serversOf();

    const dialog = $("#worlds");
    const kept = loadCharacters(WEAPONS);

    state.joinAs = kept.find(({ id }) => id === state.joinAs?.id) ?? state.save;
    showWorldsWho();
    $("#worldsstatus").textContent = note;
    showWorlds();

    if (!dialog.open) {
        dialog.showModal();
    }

    if (invite) {
        await followInvite(invite);
    } else {
        refreshServers();
    }
}

// Test this server (plan §9.3): each of its internet addresses tried from here, and how it went said
// (and sent to the server's page), in Known Servers
async function testServer(record) {
    const { ServerClient } = await serversOf();
    const status = $("#serversstatus");

    status.textContent = `Testing ${record.name ?? record.key} from here…`;

    try {
        const { results, reported, home } = await new ServerClient(state.servers.get(record.key) ?? record, { servers: state.servers, player: state.you?.proving }).test();

        if (!results.length) {
            status.textContent = "This server doesn't answer the internet yet: its owner opens it to the internet on its management page.";

            return;
        }

        const said = results.map(({ address, ok, ms, socket }) => (ok ? `reached at ${address} (${ms} ms${socket ? ", and it proved it's the server" : ""})` : `not reached at ${address}`));
        const where = home ? " This device seems to be on the server's own network: test from a phone on its cellular data to be sure." : "";

        status.textContent = `Tested: ${said.join("; ")}.${reported ? " Its owner sees this on its management page." : ""}${where}`;
    } catch (error) {
        status.textContent = `Couldn't test it: ${error.message}`;
    }
}

// Who comes, said (as Join a World on another Device says it)
function showWorldsWho() {
    const save = state.joinAs;

    $("#worldswho").textContent = save ? `You'll come as ${save.hero.name} (${peopleOf(save.hero)}), or as one of your heroes a world keeps.` : "Worlds that keep heroes make you one; others ask you to make a character first.";
    $("#worldschange").hidden = !loadCharacters(WEAPONS).length;
}

// A card button in Multiplayer's lists: its name, what it's about, and a third line
function worldCard({ name, about = "", when = "", badge = "", className = "", disabled = false, onClick }) {
    const pick = Object.assign(document.createElement("button"), { type: "button", className: `character ${className}`.trim(), disabled });

    pick.append(Object.assign(document.createElement("span"), { className: "name", textContent: name }));

    if (badge) {
        pick.append(Object.assign(document.createElement("span"), { className: "badge", textContent: badge }));
    }

    pick.append(Object.assign(document.createElement("span"), { className: "about", textContent: about }), Object.assign(document.createElement("span"), { className: "when", textContent: when }));
    pick.addEventListener("click", onClick);

    return pick;
}

// A row of a list, holding `child`
function rowOf(child, data = {}) {
    const row = document.createElement("li");

    Object.assign(row.dataset, data);
    row.append(child);

    return row;
}

// The known servers' worlds, as last heard: each server's name and how it is, with Enter a short
// code (or, where this page can't play there, a way to open the game from the server itself), and
// its worlds under it
async function showWorlds() {
    await serversOf();

    const rows = [];

    for (const record of state.servers.list()) {
        const now = serverState(record);
        const { card } = now;
        const matched = now.state !== "version";
        const walled = now.state === "walled" || now.state === "origin";
        const head = document.createElement("li");

        head.className = `server${now.state === "down" || walled ? " unreachable" : ""}`;
        head.dataset.server = record.key;
        head.append(Object.assign(document.createElement("span"), { className: "name", textContent: now.name }), Object.assign(document.createElement("span"), { className: "about", textContent: statusWords(now) }));

        const actions = Object.assign(document.createElement("div"), { className: "actions" });

        if (!matched || walled) {
            // (The game from the server itself always matches it, and always reaches it)
            actions.append(Object.assign(document.createElement("a"), { href: serverPage(record), textContent: now.state === "walled" ? `Open the game from the server: ${netOf.baseOf({ ...record, secure: false })}` : "Open the game from this server" }));
        } else if (card) {
            const enter = Object.assign(document.createElement("button"), { type: "button", className: "button quiet", textContent: "Enter a short code" });

            enter.addEventListener("click", () => askCode(record));
            actions.append(enter);
        }

        if (actions.childElementCount) {
            head.append(actions);
        }

        rows.push(head);

        // (Its worlds: those it lists, and those a key or ticket's held for here)
        const listed = new Map((card?.worlds ?? []).map((world) => [world.id, world]));
        const ids = new Set([...listed.keys(), ...Object.keys(record.worlds ?? {})]);

        for (const id of ids) {
            const world = listed.get(id);
            const held = record.worlds?.[id];
            const players = world ? ` · ${world.players} of ${world.most} in` : "";

            rows.push(
                rowOf(
                    worldCard({
                        name: world?.name ?? held?.name ?? id,
                        badge: world ? badgeOf(world) : "",
                        about: `${world?.life === "running" ? "Going now" : world ? "Waiting for someone to come in" : "Unlisted"}${players}`,
                        when: world?.offline ? "Offline for upkeep" : held?.role === "owner" ? "You own it" : held?.ticket || held?.key ? "You hold a key to it" : world?.open ? (matched ? "Open to anyone: tap to join" : "Open to anyone: tap to open the game from its server") : "Needs a key: ask its owner for an invite link",
                        className: matched ? "" : "unmatched",
                        // (A world open to anyone on a server of another version than this page's:
                        // the game from the server's own page always matches it, so its row goes there)
                        disabled: !matched && !(world?.open && !world.offline),
                        onClick: () => (walled || !matched ? location.assign(serverPage(record, id)) : joinServerWorld(record, id, world)),
                    }),
                    { world: id },
                ),
            );
        }
    }

    $("#worldslist").replaceChildren(...rows);
    $("#worldsnote").hidden = rows.length > 0;
}

// Known Servers: every server known, how it stands and what it does, with Check again, Test from
// outside, Open the game from this server (where this page can't play there) and Forget; those
// found near them; and the default server, if it's been forgotten, offered back
async function openServers({ test = false } = {}) {
    const { addressOf } = await serversOf();

    $("#serversstatus").textContent = "";
    showServers();

    if (!$("#servers").open) {
        $("#servers").showModal();
    }

    if (test) {
        const record = state.servers.remember(addressOf(location.origin));

        showServers();
        await testServer(record);
    }

    refreshServers();
}

async function showServers() {
    const { addressOf } = await serversOf();
    const { NET_VERSION, versionShort } = await import("./core/netplay.js");
    const own = addressOf(location.origin)?.key;
    const rows = [];

    for (const record of state.servers.list()) {
        const now = serverState(record);
        const row = document.createElement("li");
        const badges = [state.servers.isDefault(record.key) ? "The default server" : null, record.key === own ? "This game's own server" : null].filter(Boolean);

        row.className = `server${now.state === "down" || now.state === "walled" ? " unreachable" : ""} server-${now.state}`;
        row.dataset.server = record.key;
        row.append(Object.assign(document.createElement("span"), { className: "name", textContent: now.name }));

        for (const badge of badges) {
            row.append(Object.assign(document.createElement("span"), { className: "badge", textContent: badge }));
        }

        row.append(
            Object.assign(document.createElement("span"), { className: "where", textContent: `${record.secure ? "https://" : ""}${record.key}` }),
            Object.assign(document.createElement("span"), { className: "about status", textContent: statusWords(now) }),
            ...(now.state === "up" ? [Object.assign(document.createElement("span"), { className: "about does", textContent: doesWords(now) })] : []),
        );

        const actions = Object.assign(document.createElement("div"), { className: "actions" });
        const action = (label, onClick) => {
            const button = Object.assign(document.createElement("button"), { type: "button", className: "button quiet", textContent: label });

            button.addEventListener("click", onClick);
            actions.append(button);
        };

        action("Check again", async () => {
            serverCards.delete(record.key);
            showServers();
            await askServer(record);
            redrawServers();
        });

        if (now.state === "version" || now.state === "walled" || now.state === "origin") {
            actions.append(Object.assign(document.createElement("a"), { href: serverPage(record), textContent: "Open the game from this server" }));
        } else {
            action("Test from outside", () => testServer(record));
        }

        action("Forget", () => {
            state.servers.forget(record.key);
            serverCards.delete(record.key);
            $("#serversstatus").textContent = `${now.name} forgotten${state.servers.isDefault(record.key) ? ": Add the default server back brings it back" : ""}.`;
            redrawServers();
        });
        row.append(actions);
        rows.push(row);
    }

    rows.push(...nearbyRows(NET_VERSION, versionShort));
    $("#serverslist").replaceChildren(...rows);
    $("#serversnone").hidden = state.servers.list().length > 0;

    const missing = state.servers.missingDefaults();

    $("#serversdefault").hidden = !missing.length;
    $("#serversdefault").textContent = missing.length ? `Add the default server back (${missing[0].key})` : "";
}

// The servers the known ones find near them on their Wi-Fi (their status's `nearby`: Bonjour, plan
// §8.2), those not known here yet, each added with a tap: by its .local name when this page was
// reached by one (as a phone's browser resolves them), else by its address on the Wi-Fi
function nearbyRows(net, versionShort) {
    const known = state.servers.list();
    const seen = new Set();
    const rows = [];

    for (const record of known) {
        for (const near of serverCards.get(record.key)?.card?.nearby ?? []) {
            const where = location.hostname.endsWith(".local") || !near.ip ? near.address : near.ip;

            if (seen.has(near.id) || known.some((one) => one.id === near.id || one.key === where || one.key === near.address)) {
                continue;
            }

            seen.add(near.id);

            const matched = near.net === net;
            const listed = Number.isFinite(near.worlds) ? ` · ${near.worlds === 1 ? "1 world" : `${near.worlds} worlds`} listed` : "";
            const row = rowOf(
                worldCard({
                    name: near.name ?? where,
                    badge: "Nearby",
                    about: `On the Wi-Fi with ${record.name ?? record.key}${listed}`,
                    when: matched ? `Add it (${where})` : versionShort(near.net),
                    className: matched ? "" : "unmatched",
                    disabled: !matched,
                    onClick: () => addNearby(where, near),
                }),
                { nearby: near.id },
            );

            row.className = "nearby";
            rows.push(row);
        }
    }

    return rows;
}

// A nearby server added: known by the address it was found at, expected to prove the id it advertised
async function addNearby(where, near) {
    const { addressOf } = await serversOf();
    const address = addressOf(where);

    if (address) {
        state.servers.remember(address, { id: near.id, name: near.name ?? null });
        showServers();
        refreshServers();
    }
}

// A server added by what's typed (an address), or an invite link followed: where it's typed
// (Known Servers, or Join a World Hosted on a Server), its status line said
async function addServer(text, status) {
    const { addressOf, homeHost, inviteOf } = await serversOf();
    const invite = text.includes("#") ? inviteOf(text) : null;

    if (invite) {
        await openWorlds({ invite });

        return true;
    }

    const address = addressOf(text);

    if (!address) {
        status.textContent = "That isn't an address or an invite link: try something like studio-mac.local, 192.168.1.20:8480, or the link you were sent.";

        return false;
    }

    // (Typed bare: tried secure first unless it's at home, plan §9.5; and plain as well)
    const bare = !/^[a-z]+:\/\//i.test(text);
    const known = Boolean(state.servers.get(address.key));

    state.servers.remember(address, bare ? { bare: true, secure: !homeHost(address.host) } : {});
    status.textContent = known ? `${address.key} was known already.` : `${address.key} added to Known Servers.`;
    redrawServers();
    refreshServers();

    return true;
}

$("#serversaddform").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (await addServer($("#serversaddress").value.trim(), $("#serversstatus"))) {
        $("#serversaddress").value = "";
    }
});

$("#worldsaddform").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (await addServer($("#worldsaddress").value.trim(), $("#worldsstatus"))) {
        $("#worldsaddress").value = "";
    }
});

// An invite link followed: its server known (pinned to the id it carries), and its world entered
async function followInvite(invite) {
    const record = state.servers.remember(invite.address);

    showWorlds();

    if (invite.code) {
        await enterServerWorld(record, null, { code: invite.code, expect: invite.id });
    } else if (invite.world && (invite.key || invite.ticket)) {
        await enterServerWorld(record, invite.world, { key: invite.key, ticket: invite.ticket, expect: invite.id });
    } else {
        refreshServers();
    }
}

// Something asked of a server, in its own dialog: `fields` (elements), or `choices` (cards); `go`
// (its button's label, or null for choices alone) and `onGo` (what's done, with the dialog's status
// to say how it went: it closes once onGo resolves true)
function askWorld({ title, note = "", fields = [], choices = null, go = "Go", onGo = async () => true }) {
    const dialog = $("#worldask");

    $("#worldasktitle").textContent = title;
    $("#worldasknote").textContent = note;
    $("#worldaskfields").replaceChildren(...fields);
    $("#worldaskchoices").hidden = !choices;
    $("#worldaskchoices").replaceChildren(
        ...(choices ?? []).map((card) => {
            const row = document.createElement("li");

            row.append(card);

            return row;
        }),
    );
    $("#worldaskstatus").textContent = "";
    $("#worldaskgo").hidden = !go;
    $("#worldaskgo").textContent = go ?? "";
    $("#worldaskgo").disabled = false;
    state.worldAsk = onGo;

    if (!dialog.open) {
        dialog.showModal();
    }

    (fields.find((field) => field.matches?.("input, select, textarea")) ?? fields.flatMap((field) => [...(field.querySelectorAll?.("input, select, textarea") ?? [])])[0] ?? $("#worldaskchoices button") ?? $("#worldaskback"))?.focus();
}

// A labelled field for askWorld
function worldField(label, element) {
    const wrap = document.createElement("div");

    wrap.append(Object.assign(document.createElement("label"), { className: "field", htmlFor: element.id, textContent: label }), element);

    return wrap;
}

const textField = (id, options = {}) => Object.assign(document.createElement("input"), { type: "text", id, className: "text", autocomplete: "off", spellcheck: false, ...options });

function selectField(id, options) {
    const select = Object.assign(document.createElement("select"), { id });

    select.append(...options.map(([value, label]) => Object.assign(document.createElement("option"), { value, textContent: label })));

    return select;
}

$("#worldaskform").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#worldaskgo").disabled = true;

    // (Closed once it's done, unless what it did asked something else in its place: a hero chosen)
    const asked = state.worldAsk;

    try {
        if ((await asked?.()) && state.worldAsk === asked) {
            $("#worldask").close();
        }
    } finally {
        $("#worldaskgo").disabled = false;
    }
});
$("#worldaskback").addEventListener("click", () => $("#worldask").close());

// A short code, traded for its world and its key
function askCode(record) {
    const code = textField("worldaskcode", { className: "text code-entry", maxLength: 9, placeholder: "ABCD-1234", autocapitalize: "characters" });

    askWorld({
        title: "Enter a short code",
        note: `A short code from ${record.name ?? record.key}'s world owner works once, for a little while.`,
        fields: [worldField("Code", code)],
        go: "Enter",
        onGo: async () => {
            const given = code.value.toUpperCase().replace(/[^0-9A-Z]/g, "");

            if (given.length !== 8) {
                $("#worldaskstatus").textContent = "A short code is eight letters and numbers.";

                return false;
            }

            $("#worldask").close();
            await enterServerWorld(record, null, { code: given });

            return true;
        },
    });
}

// A world's key, for a world listed but not yet held
function askKey(record, world, name) {
    const key = textField("worldaskkey", { placeholder: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX", autocapitalize: "characters" });

    askWorld({
        title: `Into ${name}`,
        note: "Its owner gives out keys to it (an invite link carries one).",
        fields: [worldField("Key", key)],
        go: "Enter",
        onGo: async () => {
            $("#worldask").close();
            await enterServerWorld(record, world, { key: key.value.trim().toUpperCase() });

            return true;
        },
    });
}

// --- Multiplayer: its menu, and its ways to host ---

// Multiplayer: every way to play in a world with others, each opened over it and coming back to it
function openMultiplayer() {
    if (!$("#multiplayer").open) {
        $("#multiplayer").showModal();
    }

    $("#mpjoindevice").focus();
}

// Multiplayer, and whatever's open over it, closed: a game begun, or a character being made
function closeMultiplayer() {
    for (const id of ["worldask", "mpguide", "join", "worlds", "servers", "hosthere", "hostserver", "multiplayer"]) {
        if ($(`#${id}`)?.open) {
            $(`#${id}`).close();
        }
    }
}

// A choice of server, as a <select> shows it (`select`): each of relayChoices', those that can't be
// chosen greyed with why; the one chosen kept if it can be, else `chosen`
function fillRelays(select, choices, chosen) {
    const keep = select.dataset.touched === "yes" && choices.some(({ key, usable }) => key === select.value && usable) ? select.value : chosen;

    select.replaceChildren(
        ...choices.map((choice) => {
            const option = new Option(choice.why ? `${choice.name}: ${choice.why}` : choice.name, choice.key);

            option.disabled = !choice.usable;

            return option;
        }),
    );
    select.value = keep ?? "";
}

// What's said under a choice of server: what looking there, or opening a world through it, means
function relayAbout(choice, { joining = false } = {}) {
    if (!choice) {
        return joining ? "No server to look on: add one in Known Servers." : "No server to open it through: add one in Known Servers.";
    }

    if (choice.kind === "relay") {
        return joining ? "Looked for on this game's own relay: for a friend's world opened from this same game." : "Through this game's own relay: those who join open the game from here too, and look for the code on its relay.";
    }

    return joining ? `Looked for on ${choice.name}. Your friend's Invite says which server their world's open through: look on the same one.` : `Through ${choice.name}: it finds your world for others by its code, and links their games to yours (directly where it can, passing on what's said where it can't). They look for the code on the same server.`;
}

// --- Join a World on another Device ---

// Joining a world someone else has opened: its code, where it's looked for (`at`, an invite link's
// server or a listed world's, first and chosen; else `look`, or the one chosen last), and who comes
// (the character played last, or another kept, chosen: Change; with none kept, one's made first)
async function openJoin(code = "", { at = null, look = null } = {}) {
    const kept = loadCharacters(WEAPONS);

    state.joinAt = at;
    state.joinAs = kept.find(({ id }) => id === state.joinAs?.id) ?? state.save;
    $("#joincode").value = String(code).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    showJoinWho();
    $("#joinstatus").textContent = "";
    $("#joingo").disabled = false;
    $("#joinat").dataset.touched = look ? "yes" : "";
    $("#joinat").replaceChildren(new Option("Finding the servers…", look ?? ""));

    if (!$("#join").open) {
        $("#join").showModal();
    }

    $("#joincode").focus();
    await showJoinAt();
    showJoinListed();
    refreshServers();
}

// The choice of where a code's looked for: an invite link's server, or a listed world's, first
// (`state.joinAt`: an address, or a server as it's reached); then relayOptions'
async function showJoinAt() {
    const { addressOf, baseOf } = await serversOf();
    const { choices, chosen } = await relayOptions();
    const at = typeof state.joinAt === "string" ? addressOf(state.joinAt) : state.joinAt;
    const named = at ? { key: "at", name: `${state.servers.get(at.key)?.name ?? at.key} (${typeof state.joinAt === "string" ? "the link's server" : "where it's listed"})`, kind: "broker", address: netOf.brokerOf(at), at: baseOf(at), own: false, usable: true, why: "" } : null;

    state.joinChoices = named ? [named, ...choices] : choices;
    fillRelays($("#joinat"), state.joinChoices, named ? "at" : chosen);
    $("#joinatabout").textContent = relayAbout(state.joinChoices.find(({ key }) => key === $("#joinat").value), { joining: true });
}

$("#joinat").addEventListener("change", () => {
    $("#joinat").dataset.touched = "yes";
    $("#joinatabout").textContent = relayAbout(state.joinChoices?.find(({ key }) => key === $("#joinat").value), { joining: true });
});

// The players' worlds listed on the known servers (their brokers: plan §8.3), each joined with a
// tap: its code put in, and looked for where it's listed
async function showJoinListed() {
    const { NET_VERSION, versionShort } = await import("./core/netplay.js");
    const rows = [];

    for (const record of state.servers.list()) {
        const now = serverState(record);

        for (const listing of now.state === "up" ? (now.card.players ?? []) : []) {
            const fits = listing.net === NET_VERSION;
            const how = listing.direct ? "linked directly" : listing.near && listing.local ? "on your network" : "through the server";
            const row = rowOf(
                worldCard({
                    name: listing.name,
                    badge: "A player's world",
                    about: `${listing.players} of ${listing.most} in · ${how}${listing.temporary ? " · on a phone, for a while" : ""} · on ${now.name}`,
                    when: fits ? "Join it" : versionShort(listing.net),
                    className: fits ? "" : "unmatched",
                    disabled: !fits,
                    onClick: async () => {
                        $("#joincode").value = listing.id;
                        state.joinAt = now.via ?? record;
                        $("#joinat").dataset.touched = "";
                        await showJoinAt();
                        $("#joingo").focus();
                    },
                }),
                { listing: listing.id },
            );

            row.className = "player-world";
            rows.push(row);
        }
    }

    $("#joinlisted").replaceChildren(...rows);
    $("#joinlisted").hidden = !rows.length;
    $("#joinlistedheading").hidden = !rows.length;
}

// --- Host on this Device ---

// Host on this Device: who hosts (one of the characters kept, the one played last to start with;
// or a new one), and which server it's opened through
async function openHostHere() {
    await serversOf();

    const kept = loadCharacters(WEAPONS);

    state.hostAs = state.hostAs === "new" ? "new" : (kept.find(({ id }) => id === state.hostAs?.id) ?? kept.find(({ id }) => id === state.save?.id) ?? kept[0] ?? "new");
    showHostHereWho();
    $("#hostherestatus").textContent = "";
    $("#hostherego").disabled = false;
    $("#hostherevia").dataset.touched = "";
    $("#hostherevia").replaceChildren(new Option("Finding the servers…", ""));

    if (!$("#hosthere").open) {
        $("#hosthere").showModal();
    }

    await showHostHereVia();
    refreshServers();
}

// Who hosts: each character kept, and the world they'll open (theirs, or one chosen first); or a new one
function showHostHereWho() {
    const kept = loadCharacters(WEAPONS);
    const pick = (card, chosen) => {
        card.setAttribute("aria-pressed", String(chosen));

        return rowOf(card);
    };

    $("#hostherewho").replaceChildren(
        ...kept.map((save) => {
            const { name, about, where } = describe(save);

            return pick(
                worldCard({
                    name,
                    about,
                    when: stayOf(save) ? `Hosts their world: ${where.replace(/^in /, "")}` : "In no world yet: you'll choose one, or make one",
                    onClick: () => {
                        state.hostAs = save;
                        showHostHereWho();
                    },
                }),
                state.hostAs?.id === save.id,
            );
        }),
        pick(
            worldCard({
                name: "A new character",
                about: kept.length >= MOST_CHARACTERS ? "Six are kept already: one of them makes way first" : "Made first, in the character maker",
                when: "Then a world chosen or made for them, and opened",
                onClick: () => {
                    state.hostAs = "new";
                    showHostHereWho();
                },
            }),
            state.hostAs === "new",
        ),
    );
}

async function showHostHereVia() {
    const { choices, chosen } = await relayOptions();

    state.hostChoices = choices;
    fillRelays($("#hostherevia"), choices, chosen);
    $("#hosthereviaabout").textContent = relayAbout(choices.find(({ key }) => key === $("#hostherevia").value));
}

$("#hostherevia").addEventListener("change", () => {
    $("#hostherevia").dataset.touched = "yes";
    $("#hosthereviaabout").textContent = relayAbout(state.hostChoices?.find(({ key }) => key === $("#hostherevia").value));
});

// Hosting: the server chosen asked it can be opened through, and remembered; then the character
// played (or made first), and the world opened to others as soon as it's under way (hostIfAsked)
$("#hostherego").addEventListener("click", async () => {
    if (!state.hostChoices) {
        await showHostHereVia();
    }

    const choice = state.hostChoices.find(({ key }) => key === $("#hostherevia").value) ?? null;

    $("#hostherego").disabled = true;
    $("#hostherestatus").textContent = choice && !choice.own ? `Asking ${choice.name}…` : "";

    const through = await throughChoice(choice);

    $("#hostherego").disabled = false;

    if (through.problem) {
        $("#hostherestatus").textContent = through.problem;

        return;
    }

    rememberRelay(choice?.key);

    const who = state.hostAs;

    state.hostAfter = { via: through.broker, save: who === "new" || !who ? "new" : who.id, at: Date.now() };
    closeMultiplayer();

    if (who !== "new" && who) {
        play(who);
    } else if (loadCharacters(WEAPONS).length >= MOST_CHARACTERS) {
        openCharacters("replace");
    } else {
        create();
    }
});

$("#hosthereback").addEventListener("click", () => $("#hosthere").close());

// --- Host on a Server ---

// Host on a Server: a known server chosen, a world made there (new, or one from this device
// brought), and its invite link and a short code given; each step a pane of its own
async function openHostServer() {
    await serversOf();
    state.hostOn = null;
    state.hosted = null;
    hostServerPane("pick");
    $("#hostserverstatus").textContent = "";
    showHostServerList();

    if (!$("#hostserver").open) {
        $("#hostserver").showModal();
    }

    refreshServers();
}

// Which of Host on a Server's panes is shown: "pick" (the servers), "form" (the world), "done" (its invite)
function hostServerPane(pane) {
    $("#hostserverpick").hidden = pane !== "pick";
    $("#hostserverform").hidden = pane !== "form";
    $("#hostserverdone").hidden = pane !== "done";
    $("#hostservergoin").hidden = pane !== "done";
    $("#hostserverback").textContent = pane === "form" ? "Back to the servers" : pane === "done" ? "Done" : "Back";
    $("#hostserver").dataset.pane = pane;
}

// The servers to host on: each known one, whether anyone may make worlds there or it needs a key;
// those not up can't be chosen (and say why)
function showHostServerList() {
    const rows = state.servers.list().map((record) => {
        const now = serverState(record);
        const makers = now.card?.server?.makers;
        const up = now.state === "up";

        return rowOf(
            worldCard({
                name: now.name,
                badge: state.servers.isDefault(record.key) ? "The default server" : "",
                about: up ? (makers ? `Anyone may make worlds here: ${makers.each} each${makers.left ? "" : " (none left just now)"}` : "Makes worlds for those with a creator key from its owner") : statusWords(now),
                when: up ? `Make a world on ${now.name}` : now.state === "checking" ? "" : "Can't be chosen now",
                className: up ? "" : "unmatched",
                disabled: !up,
                onClick: () => hostServerForm(record, "new"),
            }),
            { server: record.key },
        );
    });

    $("#hostserverlist").replaceChildren(...rows);
    $("#hostservernone").hidden = rows.length > 0;
}

// A switch for a world's rule, as the game's options have them
function switchField(id, label, about, checked = false) {
    const wrap = Object.assign(document.createElement("label"), { className: "switch option" });
    const text = Object.assign(document.createElement("span"), { className: "text" });

    text.append(Object.assign(document.createElement("span"), { textContent: label }), Object.assign(document.createElement("small"), { textContent: about }));
    wrap.append(text, Object.assign(document.createElement("input"), { type: "checkbox", id, role: "switch", checked }), Object.assign(document.createElement("span"), { className: "track", ariaHidden: "true" }));

    return wrap;
}

// The world to make on the server chosen (`record`): a new one (`kind` "new": its name, what it's
// about, whose town, what it does with its players' characters, how many at once, listed, open to
// anyone, its seed) or one from this device ("bring": which, as whom, its name, others' characters);
// and the key that makes worlds there, if it needs one
async function hostServerForm(record, kind = "new") {
    const { RACES } = await import("./core/worldplan/plan.js");
    const now = serverState(record);
    const makers = now.card?.server?.makers;
    const kept = loadCharacters(WEAPONS);
    const pairs = loadWorlds().flatMap((world) => kept.filter((save) => world.places[save.id]).map((save) => ({ world, save })));
    const key = textField("hostserverkey", { type: "password", value: record.maker ?? "", placeholder: makers ? "Not needed here" : "A creator key, or its admin key" });
    const keyLabel = makers ? "Creator key (if you have one: the world isn't counted against you)" : "Creator key (or the server's admin key, on its own Wi-Fi)";
    const most = selectField("hostservermost", [8, 7, 6, 5, 4, 3, 2, 1].map((count) => [String(count), count === 1 ? "1: you alone" : `${count} at once`]));
    const rules = [switchField("hostserverlisted", "Listed on the server", "Anyone who opens the server sees it among its worlds"), switchField("hostserveropen", "Open to anyone", "Whoever opens the server can join it with a tap, no link needed")];
    let fields;

    state.hostOn = record;
    state.hostKind = kind;
    state.hostPairs = pairs;
    $("#hostservernew").setAttribute("aria-checked", String(kind === "new"));
    $("#hostserverbring").setAttribute("aria-checked", String(kind === "bring"));
    $("#hostserverwhere").textContent = `On ${now.name}. ${makers ? `Anyone may make worlds here, ${makers.each} each; a creator key from its owner makes them without counting.` : "Making a world here needs a creator key from its owner (Settings, Creator keys, on its management page), or its admin key on its own Wi-Fi."}`;

    if (kind === "new") {
        const people = selectField("hostserverpeople", RACES.map((race) => [race.id, race.name]));

        people.value = state.joinAs?.hero.race ?? state.save?.hero.race ?? "human";
        fields = [
            worldField("World's name", textField("hostservername", { maxLength: 60, placeholder: "Thornwick", autocapitalize: "words" })),
            worldField("What it's about (on its card; may be left empty)", textField("hostserverabout", { maxLength: 200, placeholder: "A slow war, every Friday" })),
            worldField("Whose town it starts in", people),
            worldField("Characters", selectField("hostservercharacters", RULE_CHOICES)),
            worldField("Most players", most),
            ...rules,
            worldField("Its land's seed (empty: any, at random)", textField("hostserverseed", { inputMode: "numeric", placeholder: "Any" })),
            worldField(keyLabel, key),
        ];
    } else if (pairs.length) {
        const which = selectField(
            "hostserverwhich",
            pairs.map(({ world, save }, index) => [String(index), `${world.name}, as ${save.hero.name}`]),
        );
        const name = textField("hostservername", { maxLength: 60, value: pairs[0].world.name, autocapitalize: "words" });

        which.addEventListener("change", () => (name.value = pairs[Number(which.value)].world.name));
        fields = [
            helpBlock("A world from this device", ["Its land and its war as they stand now, made a world of the server's, and a copy of the character with it, kept there as your first character. Both stay on this device as they are."]),
            worldField("Which world, and who goes with it", which),
            worldField("World's name", name),
            worldField(
                "Other players' characters",
                selectField("hostserverfirst", [
                    ["new", "Others make new characters here, the world's own"],
                    ["bring", "Others may copy one of theirs in, once each, the copy staying here"],
                ]),
            ),
            worldField("Most players", most),
            ...rules,
            worldField(keyLabel, key),
        ];
    } else {
        fields = [helpBlock("No worlds on this device yet", ["Play a character in a world first, or import one from a file (Characters on this device, then Import from a file): their world comes with them."])];
    }

    $("#hostserverfields").replaceChildren(...fields);
    $("#hostservergo").hidden = kind === "bring" && !pairs.length;
    $("#hostservergo").textContent = kind === "new" ? "Make the world" : "Bring it to the server";
    $("#hostserverstatus").textContent = "";
    hostServerPane("form");
    $("#hostserverfields").querySelector("input, select")?.focus();
}

$("#hostservernew").addEventListener("click", () => state.hostOn && hostServerForm(state.hostOn, "new"));
$("#hostserverbring").addEventListener("click", () => state.hostOn && hostServerForm(state.hostOn, "bring"));

// The world made (or brought), with the key given if there is one (kept for next time), then its
// invite shown
$("#hostserverform").addEventListener("submit", async (event) => {
    event.preventDefault();

    const { ServerClient, SERVER_REFUSALS } = await serversOf();
    const record = state.servers.get(state.hostOn.key) ?? state.hostOn;
    const server = serverState(record).name;
    const status = $("#hostserverstatus");
    const value = (id) => $(`#${id}`)?.value.trim() ?? "";
    const key = value("hostserverkey");
    const name = value("hostservername");
    const settings = { mostPlayers: Number(value("hostservermost")), listed: $("#hostserverlisted").checked, open: $("#hostserveropen").checked };
    const client = new ServerClient(record, { servers: state.servers, player: state.you?.proving });

    if (!name) {
        status.textContent = "Give the world a name.";

        return;
    }

    const seed = value("hostserverseed");

    if (seed && !(Number.isSafeInteger(Number(seed)) && Number(seed) >= 0)) {
        status.textContent = "A seed is a whole number, or left empty.";

        return;
    }

    $("#hostservergo").disabled = true;

    let made;

    try {
        if (state.hostKind === "new") {
            status.textContent = `Making ${name} on ${server}…`;
            made = await client.makeWorld(key, { name, race: value("hostserverpeople"), characters: value("hostservercharacters"), description: value("hostserverabout"), settings, ...(seed ? { seed: Number(seed) } : {}) });
        } else {
            const { world, save } = state.hostPairs[Number(value("hostserverwhich"))];
            const character = exportCharacter(save, { world: world.id });

            if (!character) {
                status.textContent = `${save.hero.name} couldn't be read from this device.`;

                return;
            }

            status.textContent = `Bringing ${world.name} to ${server}… Making its land can take a minute.`;

            try {
                made = await client.bringWorld(key, { character, name, firstHero: value("hostserverfirst") });
            } catch (error) {
                status.textContent = bringRefusal(error, { server, hero: save.hero.name, world: world.name, refusals: SERVER_REFUSALS });

                return;
            }
        }

        if (key) {
            state.servers.remember(state.servers.get(record.key), { maker: key });
        }

        await showHosted(state.servers.get(record.key), made, { settings: state.hostKind === "bring" ? settings : null });
    } catch (error) {
        status.textContent = error.message;
    } finally {
        $("#hostservergo").disabled = false;
    }
});

// A world made on a server, its owner's: gone into as its owner to get its invite link (its rules
// set first, for one brought, which comes with none), then the link shown, copied, shared or
// scanned; a short code made if it's asked for; and in
async function showHosted(record, made, { settings = null } = {}) {
    const { ServerClient } = await serversOf();
    const server = serverState(record).name;
    const client = new ServerClient(record, { servers: state.servers, player: state.you?.proving });
    const status = $("#hostserverstatus");

    status.textContent = "Getting its invite link…";

    const entered = await client.enter({ world: made.world });

    if (settings) {
        await client.changeWorld(made.world, entered.session, settings).catch(() => null);
    }

    const invite = await client.invite(made.world, entered.session);
    const brought = made.hero ? ` ${made.name} came with its land${made.turn === null ? ", its war begun afresh" : ` and its war, at turn ${made.turn}`}, and ${made.hero} is kept there for you.${made.left?.length ? ` This version of the game plays them a little differently: ${made.left.join(" ")}` : ""}` : "";

    state.hosted = { record, client, entered, made, invite };
    status.textContent = "";
    $("#hostserverdonenote").textContent = `${made.name} is on ${server}, and it's yours: you're its owner.${brought} Send its invite link to whoever you'd like to come: it opens the game from the server and takes them in.`;
    $("#hostserverlink").href = invite.link;
    $("#hostserverlink").textContent = invite.link;
    $("#hostserverreach").textContent = invite.everywhere ? "It works from anywhere, a phone on its mobile data too." : "It works only on the server's own Wi-Fi, as the server isn't open to the internet. Its owner can open it from the server's management page (The internet).";
    $("#hostserverqr").src = await qrOf(invite.link);
    $("#hostserverqr").alt = `QR code of the invite link to ${made.name}`;
    $("#hostservercopy").textContent = "Copy the link";
    $("#hostservershare").hidden = typeof navigator.share !== "function";
    $("#hostservershort").hidden = true;
    $("#hostservershortnote").hidden = true;
    hostServerPane("done");
    $("#hostservercopy").focus();
}

$("#hostservercopy").addEventListener("click", () => {
    navigator.clipboard?.writeText($("#hostserverlink").href).then(
        () => ($("#hostservercopy").textContent = "Copied"),
        () => ($("#hostservercopy").textContent = "Select it and copy"),
    );
});

$("#hostservershare").addEventListener("click", () => {
    const name = state.hosted?.made.name ?? "my world";

    navigator.share?.({ title: `Join ${name} in Pellagos`, text: `Come and play in ${name}: this opens the game and takes you in.`, url: $("#hostserverlink").href }).catch(() => {});
});

// A short code for the world's players' key (the one its invite link carries): works once, for half an hour
$("#hostservercode").addEventListener("click", async () => {
    const { client, entered, invite } = state.hosted ?? {};

    if (!client) {
        return;
    }

    try {
        const { keys } = await client.keys(entered.world, entered.session);
        const shown = keys.find((one) => invite.key.replace(/-/g, "").slice(0, 4) === one.id);
        const { code } = await client.makeCode(entered.world, entered.session, { key: shown.id });

        $("#hostservershort").textContent = code;
        $("#hostservershort").hidden = false;
        $("#hostservershortnote").hidden = false;
        $("#hostserverstatus").textContent = "";
    } catch (error) {
        $("#hostserverstatus").textContent = error.message;
    }
});

// In, as its owner: choosing who goes in as the world says, as any world on a server's gone into
$("#hostservergoin").addEventListener("click", async () => {
    const { record, made } = state.hosted ?? {};

    if (!record) {
        return;
    }

    $("#hostserver").close();
    await openWorlds();
    enterServerWorld(state.servers.get(record.key) ?? record, made.world);
});

$("#hostserverback").addEventListener("click", () => {
    if ($("#hostserver").dataset.pane === "form") {
        hostServerPane("pick");
        showHostServerList();

        return;
    }

    $("#hostserver").close();
});

// Instructions in a dialog: a heading, a line or two, and steps or points (`ordered`: steps)
function helpBlock(heading, lines = [], { items = [], ordered = false } = {}) {
    const block = Object.assign(document.createElement("div"), { className: "world-help" });
    const list = document.createElement(ordered ? "ol" : "ul");

    block.append(Object.assign(document.createElement("h3"), { className: "worlds-heading", textContent: heading }), ...lines.map((line) => Object.assign(document.createElement("p"), { className: "note", textContent: line })));
    list.append(...items.map((item) => Object.assign(document.createElement("li"), { textContent: item })));

    if (items.length) {
        block.append(list);
    }

    return block;
}

// Why a world couldn't be brought to a server, and what to do about it
function bringRefusal(error, { server, hero, world, refusals }) {
    switch (error.error) {
        case "key":
        case "role":
            return `That key doesn't make worlds on ${server}: give its admin key, or a creator key its owner made for you.`;
        case "home":
            return `${server}'s admin key only works on its own Wi-Fi. From elsewhere, ask its owner for a creator key.`;
        case "version":
            return `${error.message} To bring ${world} anyway: export ${hero} here while they're in it (Characters on this device, then Export), open the game from the server itself, import the file there (Characters on this device, then Import from a file), and bring the world that comes with them from there.`;
        case "newer":
            return `${hero} was saved by a newer version of the game than ${server} plays. It updates itself overnight; or its owner can update it now (management page: Settings, then Updates).`;
        case "too-big":
            return `${world} is too big to send to ${server}.`;
        default:
            return error.message ?? refusals[error.error] ?? `${world} couldn't be brought to ${server}.`;
    }
}

// The servers and tickets known, as a code to carry to another page or device; or one taken in
async function askCarry() {
    await serversOf();

    const carried = state.servers.export();
    const code = Object.assign(document.createElement("textarea"), { id: "worldaskcarry", value: carried, spellcheck: false });

    askWorld({
        title: "My servers and tickets",
        note: "Copy this code to carry your servers, keys and tickets to another page or device (or to keep them safe), or paste one here and take it in. It opens your worlds: keep it to yourself.",
        fields: [code],
        go: "Take it in",
        onGo: async () => {
            if (code.value.trim() === carried) {
                return true;
            }

            const taken = state.servers.import(code.value);

            if (!taken) {
                $("#worldaskstatus").textContent = "That isn't a code of servers and tickets.";

                return false;
            }

            $("#serversstatus").textContent = `${taken.added.length + taken.merged.length} server${taken.added.length + taken.merged.length === 1 ? "" : "s"} taken in.${taken.conflicts.length ? ` ${taken.conflicts.join(", ")} already known as another server: kept as it was.` : ""}`;
            redrawServers();
            refreshServers();

            return true;
        },
    });
}

/**
 * Into a world on a server (`world`, or the one a short code gives): its key or the player's ticket
 * (what's held, or `key`), the server proved first (pinned, or to `expect`, an invite's id); then a
 * hero chosen, and the world played in.
 */
// Into one of a server's worlds, as it's listed (`world`: its card, or null): by the key or ticket
// held for it here; without one, if it's open to anyone; else asking for a key
function joinServerWorld(record, id, world = null) {
    const held = record.worlds?.[id];

    return held?.key || held?.ticket || world?.open ? enterServerWorld(record, id) : askKey(record, id, world?.name ?? id);
}

async function enterServerWorld(record, world, { key = null, code = null, ticket = null, expect = null } = {}) {
    const { ServerClient } = await serversOf();
    const client = new ServerClient(record, { servers: state.servers, player: state.you?.proving, expect });

    $("#worldsstatus").textContent = "Asking the server…";

    let entered;

    try {
        entered = code ? await client.redeem(code) : await client.enter({ world, ...(key ? { key } : {}), ...(ticket ? { ticket } : {}) });
    } catch (error) {
        if (error.error === "version" && updatesFor(error.net)) {
            $("#worldsstatus").textContent = UPDATING_WORDS;

            return;
        }

        $("#worldsstatus").textContent = error.message;
        showWorlds();

        return;
    }

    $("#worldsstatus").textContent = "";
    showWorlds();
    chooseHero(client, entered);
}

// What a world does with its players' characters (server/storage/worlds.js CHARACTER_RULES), as
// its card says it (or, from a server before it said, as its heroes mode and first-hero rule)
const ruleOfCard = (card) => card?.characters ?? (card?.heroes !== "kept" ? "visiting" : card?.firstHero === "bring" ? "copies" : "own");

/** Each character rule in a few words, as the worlds' lists badge them. */
const RULE_BADGES = Object.freeze({ visiting: "Visit as your own", copies: "Copies stay here", own: "Made here" });

// A world's badge in a list: its character rule, and that it's experimental if its owner's marked it so (a world server's WORLD_SETTINGS)
const badgeOf = (card) => `${RULE_BADGES[ruleOfCard(card)]}${card?.experimental === true ? " · Experimental" : ""}`;

// Each character rule, as a world's maker chooses it
const RULE_CHOICES = Object.freeze([
    ["own", "Made here: characters belong to the world (one taken home leaves it)"],
    ["copies", "Copied in: each character copied in once, the copy staying here"],
    ["visiting", "Visiting: players bring their own, kept on their device as they play"],
]);

// A world's copy of one of their characters, by name: "Ada · Ashvale's copy"
const copyName = (hero, world) => (hero.origin ? `${hero.name} · ${world}'s copy` : hero.name);

// Who goes into the world, by what it does with its players' characters (ruleOfCard), each told
// plainly first:
// - visiting: one of the characters on this device (or a new one, made first), the one here the
//   master: what they gain is kept as they play, and they leave the world when the player does;
// - copies: one of their copies there ("Ada · Ashvale's copy"), or one of theirs copied in (once
//   each, asked first: the copy the world's own, nothing done there coming back), one from a file,
//   or a new one;
// - own: one of theirs there, or a new one; or one taken home (asked first: it leaves the world
//   for good, kept on this device)
function chooseHero(client, entered) {
    const save = state.joinAs;
    const { card, heroes } = entered;
    const name = card?.name ?? entered.world;
    const rule = ruleOfCard(card);
    const kept = loadCharacters(WEAPONS);

    // (A new one: made with the look of who they'd come as; with nobody kept here, made first)
    const fresh = (about) =>
        worldCard({
            name: "A new character",
            about: save ? about : "Made in the character maker first",
            onClick: () => {
                $("#worldask").close();

                if (!save) {
                    state.worldsAfter = { client, entered, hero: rule === "visiting" ? undefined : "new" };
                    $("#worlds").close();
                    create();

                    return;
                }

                playServerWorld(client, entered, { save, hero: "new" });
            },
        });
    const makeFirst = (after) => {
        state.worldsAfter = { client, entered, ...after };
        $("#worlds").close();
        create();
    };

    if (rule === "visiting") {
        if (!kept.length) {
            makeFirst({});

            return;
        }

        const choices = kept.map((one) => worldCard({ name: one.hero.name, about: `${peopleOf(one.hero)} · on this device`, onClick: () => ($("#worldask").close(), (state.joinAs = one), playServerWorld(client, entered, { save: one })) }));

        choices.push(worldCard({ name: "A new character", about: "Made in the character maker first, kept on this device", onClick: () => ($("#worldask").close(), makeFirst({})) }));
        askWorld({ title: `Who visits ${name}?`, note: `You visit ${name} as one of the characters on this device. What they gain there stays with them, kept as you play; when you leave, they leave ${name} with you.`, choices, go: null });

        return;
    }

    // (Their first time, with no character yet and nothing else to choose: straight to making one,
    // then straight in as them)
    if (!save && !heroes.length && !(rule === "copies" && kept.length)) {
        makeFirst({ hero: "new" });

        return;
    }

    const choices = heroes.map((hero) => worldCard({ name: copyName(hero, name), about: `${peopleOf(hero)} · ${hero.origin ? `a copy, ${name}'s own` : `kept by ${name}`}`, onClick: () => ($("#worldask").close(), playServerWorld(client, entered, { save, hero: hero.slot })) }));
    const room = heroes.length < 6;

    if (rule === "copies") {
        const copied = new Set(heroes.map(({ origin }) => origin).filter(Boolean));

        // (Each of theirs on this device, copied in once; one copied already said so)
        for (const one of kept) {
            const done = copied.has(one.hero.guid);

            choices.push(
                worldCard({
                    name: done ? `${one.hero.name}: copied in already` : `Copy ${one.hero.name} in`,
                    about: done ? `Play their copy above` : `${peopleOf(one.hero)} · a copy comes in and stays in ${name}`,
                    disabled: done || !room,
                    onClick: () =>
                        askWorld({
                            title: `Copy ${one.hero.name} into ${name}?`,
                            note: `A copy of ${one.hero.name} comes into ${name} as they are now, and stays there, ${name}'s own: in the list as "${one.hero.name} · ${name}'s copy". ${one.hero.name} on this device carries on as they are: nothing the copy does in ${name} comes back to them, and the copy can't be taken out again. A character's copied into ${name} once.`,
                            go: `Copy ${one.hero.name} in`,
                            onGo: async () => (playServerWorld(client, entered, { save: one, hero: "copy" }), true),
                        }),
                }),
            );
        }

        if (room) {
            choices.push(worldCard({ name: "Copy one from a file", about: `A character the game exported: a copy comes in and stays in ${name}`, onClick: () => bringFromFile(client, entered) }));
            choices.push(fresh(`Made new here, ${name}'s own, looking as ${save?.hero.name} does`));
        }

        askWorld({ title: `Who goes into ${name}?`, note: `${name} keeps a copy of each character brought in, once each. A copy is ${name}'s own: what it does there never comes back to the character on your device, and it stays in ${name}.`, choices, go: null });

        return;
    }

    // (Their own there: one taken home leaves the world for good, kept on this device; never a copy,
    // as a world's hero brought to the server is: a copy never leaves)
    const homeable = heroes.filter(({ origin }) => !origin);

    if (homeable.length) {
        choices.push(
            worldCard({
                name: "Take one home",
                about: `Moved out of ${name} for good, to the characters on this device`,
                onClick: () =>
                    askWorld({
                        title: "Take which character home?",
                        note: `They leave ${name} for good and become one of the characters kept on this device, in ${name}'s land, to play by yourself or bring into another world.`,
                        choices: homeable.map((hero) => worldCard({ name: hero.name, about: `${peopleOf(hero)} · kept by ${name}`, onClick: () => askTakeHome(client, entered, hero) })),
                        go: null,
                    }),
            }),
        );
    }

    if (room) {
        choices.push(fresh(`Made new here, ${name}'s own, looking as ${save?.hero.name} does`));
    }

    askWorld({ title: `Who goes into ${name}?`, note: heroes.length ? `Characters in ${name} are ${name}'s own, made there: choose one of yours, or start a new one.` : `Characters in ${name} are ${name}'s own, made there. This is your first time in.`, choices, go: null });
}

// Asked first, a character of theirs taken home from a world whose characters are its own: moved
// out of it for good (the server forgets them) and kept on this device; with no room here, said
// so first; and if this device won't keep them after all, the file's saved, so they're never lost
function askTakeHome(client, entered, hero) {
    const name = entered.card?.name ?? entered.world;

    if (loadCharacters(WEAPONS).length >= MOST_CHARACTERS) {
        $("#worldaskstatus").textContent = `${MOST_CHARACTERS} characters are kept on this device, the most there can be: delete one first to make room.`;

        return;
    }

    // (They come with a copy of the world as it is, a world of this device's)
    if (loadWorlds().length >= MOST_WORLDS) {
        $("#worldaskstatus").textContent = `${MOST_WORLDS} worlds are kept on this device, the most there can be, and ${hero.name} comes with a copy of ${name}: delete one first to make room (Worlds on this device).`;

        return;
    }

    askWorld({
        title: `Take ${hero.name} home?`,
        note: `${hero.name} will leave ${name} for good and be kept on this device instead. A copy of ${name} as it is now comes with them, as one of the worlds on this device. This can't be undone.`,
        go: `Take ${hero.name} home`,
        onGo: async () => {
            let file;

            try {
                file = await client.takeHome({ world: entered.world, session: entered.session, slot: hero.slot });
            } catch (error) {
                $("#worldaskstatus").textContent = error.message;

                return false;
            }

            $("#worldask").close();

            if (!(await keepFromFile(file.text))) {
                download(file.name, file.text);
                $("#importednote").textContent = `${hero.name} left ${name}, but this device wouldn't keep them: they're saved as a file (${file.name}) instead. Bring it in from Characters on this device.`;
            }

            return true;
        },
    });
}

// A character copied into a world that takes copies from a character file (one of those in it, if
// there are several), told first what a copy is, and what was changed to suit this version of the game
function bringFromFile(client, entered) {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".pellagos-character,application/json" });

    input.addEventListener("change", async () => {
        const [file] = input.files;
        const { CHARACTER_LIMIT, keptOfExport, readCharacterFile } = await import("./app/character-file.js");
        let read;

        try {
            if (!file || file.size > CHARACTER_LIMIT) {
                throw new Error("That isn't a character file.");
            }

            read = readCharacterFile(await file.text()).filter((one) => !one.error);
        } catch (error) {
            $("#worldaskstatus").textContent = error.message;

            return;
        }

        const world = entered.card?.name ?? entered.world;
        const bring = ({ name, exported, left }) =>
            askWorld({
                title: `Copy ${name} into ${world}?`,
                note: `A copy of ${name} comes into ${world} and stays there, ${world}'s own: it can't be taken out again.${left.length ? ` Changed to suit this version of the game: ${left.join(" ")}` : ""}`,
                go: `Copy ${name} in`,
                onGo: async () => (playServerWorld(client, entered, { character: keptOfExport(exported), hero: "copy" }), true),
            });

        if (!read.length) {
            $("#worldaskstatus").textContent = "There's no one in that file who can be brought in.";
        } else if (read.length === 1) {
            bring(read[0]);
        } else {
            askWorld({ title: "Bring who in?", choices: read.map((one) => worldCard({ name: one.name, about: "From the file", onClick: () => bring(one) })), go: null });
        }
    });
    input.click();
}

/**
 * Into a world on a server, on its play socket, as `hero` (a kept hero's slot, or "new") or, in a
 * world that doesn't keep heroes, as `save`; then played as a joined world is. A `character`
 * given (one brought in from a file) comes in as it is.
 */
async function playServerWorld(client, entered, { save = null, hero = undefined, character: given = null, tell = worldsTell() }) {
    const { SERVER_REFUSALS } = await serversOf();
    const { NET_REFUSALS, NET_KICKS, versionWords } = await import("./app/together.js");
    const kept = entered.card?.heroes === "kept";
    const character = given ?? (save ? characterOf(save) : {});

    tell.stage("open");
    fetcher.hold("joining");

    let joined;

    try {
        joined = await client.play({
            world: entered.world,
            session: entered.session,
            character,
            hero,
            onWaiting: (place) => tell.waiting(`The server's running as many worlds as it can: yours is ${place === 1 ? "next" : `number ${place}`} in line to open…`),
            onClosed: (reason) => {
                // (Deleted: nothing to come back to, so what was held for it here's forgotten; and
                // by this game's own owner, said as their doing once the server's answered)
                if (reason === "world-deleted") {
                    state.servers?.forgetWorld(client.record.key, entered.world);

                    if (state.deleting?.world === entered.world) {
                        return;
                    }
                }

                leftWorld(SERVER_REFUSALS[reason] ?? "You were sent out of the world.");
            },
            onLink: (link) => {
                holdForLink(link);

                if (state.game?.remote) {
                    state.game.link = link;
                }
            },
            onDrop: () => leftWorld("The link to the world was lost.", { again: true }),
        });
    } catch (error) {
        fetcher.release("joining");
        tell.problem(error.message);

        return;
    }

    // (Cancelled meanwhile)
    if (tell.gone?.()) {
        joined.close();
        fetcher.release("joining");

        return;
    }

    tell.stage("ask");

    if (save && !kept) {
        playedSave(save);
        state.save = save;
    }

    setTogether(joined);
    state.onServer = { client, entered, kept };
    joined.joining.onRefused = (reason, said) => {
        joined.close();
        setTogether(null);
        state.onServer = null;
        tell.problem(reason === "version" && updatesFor(said?.net) ? UPDATING_WORDS : reason === "version" ? versionWords(said?.net, { server: true }) : (NET_REFUSALS[reason] ?? SERVER_REFUSALS[reason] ?? "You couldn't go into that world."));
    };
    joined.joining.onKicked = (reason) => {
        joined.close();
        leftWorld(NET_KICKS[reason] ?? "You were sent out of the world.");
    };
    joined.joining.onWelcome = (welcome) => {
        tell.done();
        playJoined(save, welcome, joined.joining, {
            kept,
            server: true,
            rejoin: {
                kind: "server",
                server: client.record.key,
                world: entered.world,
                worldName: entered.card?.name ?? null,
                serverName: client.record.name ?? entered.card?.server?.name ?? null,
                hero: Number.isInteger(hero) ? hero : null,
                character: !kept && save ? (save.id ?? null) : null,
            },
        });
        sendCrashes(client, entered);
        sendMeasures(client, entered);
    };
    joined.joining.onState = () => {
        fetcher.hold("the world again", { for: 5000 });
        state.game?.rehost();
    };

    let delay = joined.joining.delay;

    joined.joining.onPong = (rtt) => {
        fetcher.measure(rtt, { strained: joined.joining.delay > delay });
        delay = joined.joining.delay;
    };
}

// The crash reports waiting for this world (app/crash-reports.js: the game fell over in it), sent to
// its server now the player's back in, if they send them (Game options, Debug log), one at a time:
// each let go of once it's taken or refused for good; if the server can't be reached, or is busy,
// they wait for the next time. (Welcomed again meanwhile, those already going aren't sent twice)
let sendingCrashes = false;

async function sendCrashes(client, entered) {
    if (!settings.sendCrashes || sendingCrashes) {
        return;
    }

    sendingCrashes = true;

    try {
        for (const waiting of crashesFor(localStorage, client.record.key, entered.world)) {
            try {
                await client.reportCrash({ world: entered.world, session: entered.session, report: waiting.report });
            } catch (error) {
                if (!REFUSED_FOR_GOOD.includes(error.error)) {
                    return;
                }
            }

            letGoCrash(localStorage, waiting.id);
        }
    } finally {
        sendingCrashes = false;
    }
}

// How going into a world on a server goes, told on the Worlds screen as ever: a line of words, the
// screen closed once the world's come
function worldsTell() {
    return {
        stage: (stage) => {
            if (stage === "open") {
                if (!$("#worlds").open) {
                    $("#worlds").showModal();
                }

                $("#worldsstatus").textContent = "Going in…";
            }
        },
        waiting: (words) => ($("#worldsstatus").textContent = words),
        problem: (words) => ($("#worldsstatus").textContent = words),
        done: () => $("#worlds").close(),
    };
}

// In a world on a server: who's here; for its owner, invites and keys; leaving
async function openWorldPanel() {
    const { client, entered } = state.onServer ?? {};

    if (!client || !state.game) {
        return;
    }

    const owner = entered.role === "owner" || entered.role === "trusted";

    $("#menu").close();
    $("#worldpaneltitle").textContent = entered.card?.name ?? "World";
    $("#worldpanelnote").textContent = `On ${client.record.name ?? client.record.key}. You came in as its ${entered.role}. It goes on while anyone's in it, and waits, still, while no one is.`;
    $("#worldpanelpeople").replaceChildren(
        ...[{ name: state.game.hero.name, people: "you" }, ...state.game.others()].map(({ name, people, hostile }) => {
            const row = document.createElement("li");

            row.append(Object.assign(document.createElement("span"), { textContent: name }), Object.assign(document.createElement("span"), { className: `people${hostile ? " hostile" : ""}`, textContent: people === "you" ? "(you)" : `the ${people}${hostile ? ", at war with yours" : ""}` }));

            return row;
        }),
    );
    $("#worldpanelowner").hidden = !owner;
    $("#worldpanelstatus").textContent = "";
    $("#worldpanelinvitecode").hidden = true;
    $("#worldpanelinvite").hidden = true;
    $("#worldpanelopening").hidden = entered.role !== "owner";
    $("#worldpanelopen").checked = entered.card?.open === true;
    showWorldDelete();
    $("#worldpanel").showModal();

    if (owner) {
        showWorldKeys();
    }
}

// Delete this world, for its owner alone (a trusted player may invite, never delete): what goes
// with it said first, then its name typed to be sure
function showWorldDelete() {
    const { client, entered } = state.onServer;
    const name = entered.card?.name ?? "this world";
    const others = state.game?.others().length ?? 0;

    $("#worldpaneldeleting").hidden = entered.role !== "owner";
    $("#worldpaneldeletenote").textContent = `${name} goes from ${client.record.name ?? client.record.key} for good: ${others ? `the ${others === 1 ? "one" : others} playing in it with you sent out, ` : ""}its land, its war and the heroes it keeps gone with it, and every key and invite to it stopped. The server keeps a backup of it, which only the server's owner can bring back.`;
    $("#worldpaneldelete").hidden = false;
    $("#worldpaneldeleteform").hidden = true;
    $("#worldpaneldeletename").value = "";
    $("#worldpaneldeletelabel").textContent = `Type its name, “${name}”, to delete it`;
}

$("#worldpaneldelete").addEventListener("click", () => {
    $("#worldpaneldelete").hidden = true;
    $("#worldpaneldeleteform").hidden = false;
    $("#worldpaneldeletename").focus();
});

$("#worldpaneldeletekeep").addEventListener("click", () => showWorldDelete());

// Deleted: everyone in it sent out, this game too (the server closes its link: "world-deleted"),
// back to the title, saying so; what's held for it here forgotten
$("#worldpaneldeleteform").addEventListener("submit", async (event) => {
    event.preventDefault();

    const { client, entered } = state.onServer ?? {};
    const typed = $("#worldpaneldeletename").value.trim();
    const name = entered?.card?.name ?? "";

    if (!client) {
        return;
    }

    if (typed !== name) {
        $("#worldpanelstatus").textContent = `That isn't its name: type “${name}” exactly.`;

        return;
    }

    $("#worldpaneldeletego").disabled = true;
    state.deleting = { world: entered.world, name };

    try {
        await client.deleteWorld(entered.world, entered.session, typed);
        leftWorld(`${name} was deleted. The server keeps a backup of it, for its owner.`);
    } catch (error) {
        state.deleting = null;
        $("#worldpanelstatus").textContent = error.message;
    } finally {
        $("#worldpaneldeletego").disabled = false;
    }
});

// The world's panel from the party menu's World button: the game paused under it, as the menu
// pauses it (and Back to the game starts it again)
function worldPanelFromParty() {
    if (state.onServer && state.game) {
        state.game.pause();
        openWorldPanel();
    }
}

// A world's keys, for its owner: each revocable (but the owner's own)
async function showWorldKeys() {
    const { client, entered } = state.onServer;

    try {
        const { keys } = await client.keys(entered.world, entered.session);

        $("#worldpanelkeys").replaceChildren(
            ...keys.map((key) => {
                const row = document.createElement("li");

                row.append(worldCard({ name: key.label ?? key.id, about: `${key.role} · ${key.id}`, when: key.revoked ? "Revoked" : `Used ${key.used ?? 0} times`, onClick: () => {} }));

                if (key.role !== "owner" && !key.revoked) {
                    const revoke = Object.assign(document.createElement("button"), { type: "button", className: "forget", textContent: "Revoke" });

                    revoke.addEventListener("click", async () => {
                        try {
                            await client.revokeKey(entered.world, entered.session, key.id);
                            showWorldKeys();
                        } catch (error) {
                            $("#worldpanelstatus").textContent = error.message;
                        }
                    });
                    row.append(revoke);
                }

                return row;
            }),
        );
    } catch (error) {
        $("#worldpanelstatus").textContent = error.message;
    }
}

// The world's players' key, to hand out: the one its invite link carries (server/manage.js invite)
async function playersKey() {
    const { client, entered } = state.onServer;

    return (await client.invite(entered.world, entered.session)).key;
}

// A picture of a QR code of `text` (a data: URL), the code made on demand
async function qrOf(text) {
    const { qrcode } = await import("../vendor/qrcode-generator-2.0.4/qrcode.min.js");
    const code = qrcode(0, "M");

    code.addData(text);
    code.make();

    return code.createDataURL(4, 8);
}

// The world's invite link (the server makes it: to the game's page on the server itself, at its
// internet address if it's open to the internet), shown with its code to scan and copied; or
// replaced, the old one letting nobody else in
async function showWorldInvite({ replace = false } = {}) {
    const { client, entered } = state.onServer;
    const made = await client.invite(entered.world, entered.session, { replace });
    const anchor = $("#worldpanelinvitelink");

    anchor.href = made.link;
    anchor.textContent = made.link;
    $("#worldpanelwhere").textContent = `${replace ? "A new link: the old one lets nobody else in, but those who came by it can still come back. " : ""}${made.everywhere ? "It works from anywhere, a phone on its mobile data too." : "It works only on the server's own Wi-Fi, as the server isn't open to the internet. Its owner can open it from the server's management page (The internet)."}`;
    $("#worldpanelqr").src = await qrOf(made.link);
    $("#worldpanelqr").alt = `QR code of the invite link to ${entered.card?.name ?? "this world"}`;
    $("#worldpanelshare").hidden = typeof navigator.share !== "function";
    $("#worldpanelreplace").hidden = entered.role !== "owner";
    $("#worldpanelreplace").textContent = "Replace the link";
    $("#worldpanelcopy").textContent = "Copy the link";
    $("#worldpanelinvite").hidden = false;
    navigator.clipboard?.writeText(made.link).then(() => ($("#worldpanelcopy").textContent = "Copied"), () => {});

    return made;
}

$("#worldpanellink").addEventListener("click", async () => {
    try {
        $("#worldpanelstatus").textContent = "";
        await showWorldInvite();
    } catch (error) {
        $("#worldpanelstatus").textContent = error.message;
    }
});

$("#worldpanelcopy").addEventListener("click", () => {
    navigator.clipboard?.writeText($("#worldpanelinvitelink").href).then(
        () => ($("#worldpanelcopy").textContent = "Copied"),
        () => ($("#worldpanelcopy").textContent = "Select it and copy"),
    );
});

$("#worldpanelshare").addEventListener("click", () => {
    const name = state.onServer?.entered.card?.name ?? "my world";

    navigator.share?.({ title: `Join ${name} in Pellagos`, text: `Come and play in ${name}: this opens the game and takes you in.`, url: $("#worldpanelinvitelink").href }).catch(() => {});
});

// (Asked again first: the old link stops letting anyone new in)
$("#worldpanelreplace").addEventListener("click", async (event) => {
    const button = event.currentTarget;

    if (button.dataset.sure !== "yes") {
        button.dataset.sure = "yes";
        button.textContent = "Replace it: the old link stops working";

        return;
    }

    delete button.dataset.sure;

    try {
        await showWorldInvite({ replace: true });
    } catch (error) {
        $("#worldpanelstatus").textContent = error.message;
    }
});

// Opened to anyone (or not): whoever opens the server sees it and can come in without a key
$("#worldpanelopen").addEventListener("change", async (event) => {
    const { client, entered } = state.onServer;
    const open = event.target.checked;

    try {
        await client.changeWorld(entered.world, entered.session, { open });
        entered.card = { ...entered.card, open };
        $("#worldpanelstatus").textContent = open ? "Open to anyone: whoever opens this server can join it." : "No longer open: newcomers need the invite link, and those already in can still come back.";
        showWorldKeys();
    } catch (error) {
        event.target.checked = !open;
        $("#worldpanelstatus").textContent = error.message;
    }
});

$("#worldpanelcode").addEventListener("click", async () => {
    const { client, entered } = state.onServer;

    try {
        const key = await playersKey();
        const { keys } = await client.keys(entered.world, entered.session);
        const shown = keys.find((one) => key.replace(/-/g, "").slice(0, 4) === one.id);
        const { code } = await client.makeCode(entered.world, entered.session, { key: shown.id });

        $("#worldpanelinvitecode").textContent = code;
        $("#worldpanelinvitecode").hidden = false;
        $("#worldpanelstatus").textContent = "";
        showWorldKeys();
    } catch (error) {
        $("#worldpanelstatus").textContent = error.message;
    }
});

$("#worldpanelback").addEventListener("click", () => {
    $("#worldpanel").close();
    resume();
});
$("#worldpanelleave").addEventListener("click", () => {
    $("#worldpanel").close();
    quit();
});
$("#worldbutton").addEventListener("click", openWorldPanel);
$("#multiplayerbutton").addEventListener("click", openMultiplayer);
$("#multiplayerback").addEventListener("click", () => $("#multiplayer").close());
$("#mpabout").addEventListener("click", () => openGuide("mpguide"));
$("#mpjoindevice").addEventListener("click", () => openJoin());
$("#mpjoinserver").addEventListener("click", () => openWorlds());
$("#mpservers").addEventListener("click", () => openServers());
$("#mphostdevice").addEventListener("click", () => openHostHere());
$("#mphostserver").addEventListener("click", () => openHostServer());
$("#worldsback").addEventListener("click", () => $("#worlds").close());
$("#worldschange").addEventListener("click", () => openCharacters("worlds"));
$("#worldsservers").addEventListener("click", () => openServers());
$("#serversback").addEventListener("click", () => $("#servers").close());
$("#serverscarry").addEventListener("click", askCarry);
$("#serversdefault").addEventListener("click", () => {
    const [record] = state.servers.restoreDefaults();

    $("#serversstatus").textContent = record ? `${record.key} is known again.` : "";
    redrawServers();
    refreshServers();
});

// A guide in a dialog of its own (About, About Multiplayer: `id`, with its `${id}body` and
// `${id}text`): what it says put in while it's open, from the top each time; its contents take the
// reader to each part, and closing it leaves the page without it
function openGuide(id) {
    const body = $(`#${id}body`);

    body.replaceChildren($(`#${id}text`).content.cloneNode(true));
    $(`#${id}`).showModal();
    body.scrollTop = 0;
    body.focus({ preventScroll: true });
}

for (const id of ["about", "mpguide"]) {
    $(`#${id}`).addEventListener("close", () => $(`#${id}body`).replaceChildren());
    // (From its contents, or from a part that points to another)
    $(`#${id}`).addEventListener("click", (event) => {
        const to = event.target.closest("[data-to]")?.dataset.to;

        if (to) {
            document.getElementById(to)?.scrollIntoView({ block: "start", behavior: "smooth" });
        }
    });
}

// About the game: what it is and how it's played, from the top, with which version this is
// --- You, the player (app/you.js) ---

// The You panel: the name they go by, their id, and their code (shown when asked)
async function openYou() {
    await serversOf();

    const { id, name } = state.you.loadPlayer();

    $("#youname").value = name;
    $("#youid").textContent = id;
    $("#youcode").hidden = true;
    $("#youcopy").hidden = true;
    $("#youfile").hidden = true;
    $("#youshow").hidden = false;
    $("#youstatus").textContent = "";

    if (!$("#you").open) {
        $("#you").showModal();
    }
}

$("#youbutton").addEventListener("click", () => openYou());
$("#youback").addEventListener("click", () => $("#you").close());
$("#yousave").addEventListener("click", () => {
    $("#youstatus").textContent = state.you.namePlayer($("#youname").value) ? "Kept: worlds on servers will know you by it the next time you go in." : "A name is 2 to 24 letters, digits and spaces.";
});
$("#youshow").addEventListener("click", async () => {
    const code = state.you.playerCode();

    $("#youcodetext").textContent = code;
    $("#youqr").src = await qrOf(code);
    $("#youcode").hidden = false;
    $("#youcopy").hidden = false;
    $("#youfile").hidden = false;
    $("#youshow").hidden = true;
});
$("#youcopy").addEventListener("click", () => {
    navigator.clipboard?.writeText(state.you.playerCode()).then(
        () => ($("#youstatus").textContent = "Copied: paste it on your other device, in You, then Use my code from another device."),
        () => ($("#youstatus").textContent = "It couldn't be copied: write it down, or save it as a file."),
    );
});
$("#youfile").addEventListener("click", () => {
    const { name, id } = state.you.loadPlayer();

    download(`Pellagos-player-${name.replace(/[^\p{L}\p{N}-]+/gu, "-")}.txt`, `Your Pellagos player code (${name}, player id ${id}). Anyone who has it can play as you: keep it to yourself.\n\n${state.you.playerCode()}\n`);
});
$("#youuse").addEventListener("click", () => {
    const code = Object.assign(document.createElement("textarea"), { id: "worldaskplayercode", spellcheck: false, placeholder: "ABCDEF-GHJKMN-…" });
    const name = textField("worldaskplayername", { maxLength: 24, value: state.you.loadPlayer().name, autocapitalize: "words" });

    askWorld({
        title: "Use my code from another device",
        note: "Be the player you are there, here too: the same player id, and the same player in every world you've been in. This device's own identity is replaced, so if it's played in worlds on servers as itself, show its code first and keep it.",
        fields: [worldField("Your code", code), worldField("The name you go by (as you do there)", name)],
        go: "Use this code",
        onGo: async () => {
            const used = state.you.usePlayerCode(code.value, { name: name.value });

            if (used.error) {
                $("#worldaskstatus").textContent = "That isn't a player code, or a character's mistyped: check it against the other device's.";

                return false;
            }

            await openYou();
            $("#youstatus").textContent = `You're ${used.player.name} here now too.`;

            return true;
        },
    });
});

$("#aboutbutton").addEventListener("click", () => {
    const built = builtAt();

    $("#aboutversion").textContent = codeVersion() === "dev" ? "Version: a copy run from the repository." : `Version ${codeVersion()}${built ? `, built ${new Date(built).toLocaleDateString(undefined, { dateStyle: "medium" })}` : ""}.`;
    openGuide("about");
});
$("#aboutclose").addEventListener("click", () => $("#about").close());

// About Multiplayer: every way to join or host a world, over Multiplayer, which it goes back to
$("#mpguideclose").addEventListener("click", () => $("#mpguide").close());

$("#joinform").addEventListener("submit", join);
$("#joincancel").addEventListener("click", () => $("#join").close());
$("#rejoinretry").addEventListener("click", () => state.goingBackIn && goBackIn(state.goingBackIn.record));
$("#rejoincancel").addEventListener("click", cancelBackIn);
// (Escape cancels it too)
$("#rejoin").addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelBackIn();
});
$("#joinchange").addEventListener("click", () => openCharacters("join"));
$("#invitebutton").addEventListener("click", () => invite());
$("#invitecopy").addEventListener("click", () => {
    navigator.clipboard?.writeText($("#invitelink").href).then(
        () => ($("#invitecopy").textContent = "Copied"),
        () => ($("#invitecopy").textContent = "Select it and copy"),
    );
});
$("#invitesend").addEventListener("click", () => {
    const code = state.together?.code ?? "";

    navigator.share?.({ title: "Join my world in Pellagos", text: `Come and play in my world: the code's ${code}, or this link takes you in.`, url: $("#invitelink").href }).catch(() => {});
});
$("#inviteback").addEventListener("click", closeInvite);
// (Listed on its broker's server for players there to see, or for its code alone)
$("#invitelist").addEventListener("change", (event) => {
    state.together?.link?.list?.(event.target.checked);
    keepHosting(state.together);
});
$("#invitestop").addEventListener("click", () => {
    state.together?.close();
    setTogether(null);
    inWorld(null);
    closeInvite();
});
$("#invite").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeInvite();
});

$("#menubutton").addEventListener("click", pause);
$("#resumebutton").addEventListener("click", resume);
$("#pauseallbutton").addEventListener("click", pauseAll);
$("#quitbutton").addEventListener("click", quit);
$("#optionsbutton").addEventListener("click", () => menuPage("options"));

for (const button of document.querySelectorAll("#menuoptions [data-to]")) {
    button.addEventListener("click", () => menuPage(button.dataset.to));
}

for (const button of document.querySelectorAll("#menu [data-back]")) {
    button.addEventListener("click", menuBack);
}

$("#wheelsbutton").addEventListener("click", openWheels);
$("#logbutton").addEventListener("click", openLog);
$("#logcopy").addEventListener("click", copyLog);
$("#logclear").addEventListener("click", () => {
    telemetry.clear();
    $("#logstatus").textContent = "Cleared.";
    showLog();
});
$("#quickbutton").addEventListener("click", () => openQuick(0));
$("#minimapswitch").addEventListener("change", (event) => applySetting("minimap", event.target.checked));

// The minimap folded away into a compass in its corner (the button on its top left), and opened
// again from the compass: as the Game options switch does it, and kept
for (const [button, on] of [["#minimapfold", false], ["#compass", true]]) {
    $(button).addEventListener("click", () => {
        applySetting("minimap", on);
        $("#minimapswitch").checked = on;
        state.session?.sound?.play(on ? "mapUnfold" : "tap");
    });
}
$("#stickswitch").addEventListener("change", (event) => applySetting("stick", event.target.checked));
$("#floatswitch").addEventListener("change", (event) => applySetting("stickFloats", event.target.checked));
$("#zoomswitch").addEventListener("change", (event) => applySetting("zoom", event.target.checked));
$("#pointerswitch").addEventListener("change", (event) => applySetting("swordPointer", event.target.checked));
$("#largepointerswitch").addEventListener("change", (event) => applySetting("largePointer", event.target.checked));
$("#crashswitch").addEventListener("change", (event) => applySetting("sendCrashes", event.target.checked));
$("#resistswitch").addEventListener("change", (event) => applySetting("resistSummons", event.target.checked));
$("#refuseswitch").addEventListener("change", (event) => applySetting("refuseInvites", event.target.checked));
$("#messengerswitch").addEventListener("change", (event) => applySetting("messengers", event.target.checked));
$("#partydmswitch").addEventListener("change", (event) => applySetting("refusePartyDms", event.target.checked));
$("#worlddmswitch").addEventListener("change", (event) => applySetting("refuseWorldDms", event.target.checked));
$("#chatfeedswitch").addEventListener("change", (event) => applySetting("chatOnScreen", event.target.checked));
$("#blockedbutton").addEventListener("click", () => menuPage("blocked"));
$("#snagswitch").addEventListener("change", (event) => applySetting("autoSnag", event.target.checked));
$("#lockswitch").addEventListener("change", (event) => applySetting("autoLock", event.target.checked));
$("#snagbutton").addEventListener("click", openSnag);
$("#snagall").addEventListener("click", () => snagChanged({ all: true }));
$("#snaggrades").addEventListener("change", () => snagChanged());
$("#snagkinds").addEventListener("change", () => snagChanged());
$("#followswitch").addEventListener("change", (event) => applySetting("cameraFollows", event.target.checked));
$("#battlecamswitch").addEventListener("change", (event) => applySetting("battleCam", event.target.checked));
$("#quicksixswitch").addEventListener("change", (event) => applySetting("quickSix", event.target.checked));
$("#quickalwaysswitch").addEventListener("change", (event) => applySetting("quickAlways", event.target.checked));
$("#chatterswitch").addEventListener("change", (event) => applySetting("chatter", event.target.checked));
$("#tapmoveswitch").addEventListener("change", (event) => applySetting("tapToMove", event.target.checked));
$("#flyinswitch").addEventListener("change", (event) => applySetting("flyIn", event.target.checked));
$("#enmityswitch").addEventListener("change", (event) => applySetting("showEnmity", event.target.checked));
// (Whether this world's mercenaries can die: the world's rule, its host's to change, core/host.js RULES mortal)
$("#mortalswitch").addEventListener("change", (event) => state.game?.setMortal(event.target.checked));
$("#invertswitch").addEventListener("change", (event) => applySetting("invertTilt", event.target.checked));
$("#shakeswitch").addEventListener("change", (event) => applySetting("shake", event.target.checked));
$("#fullscreenswitch").addEventListener("change", (event) => applySetting("fullscreen", event.target.checked));
$("#dragslider").addEventListener("input", (event) => ($("#dragname").textContent = `${event.target.value}%`));
$("#dragslider").addEventListener("change", (event) => applySetting("dragSpeed", Number(event.target.value) / 100));
$("#tiltslider").addEventListener("input", (event) => ($("#tiltname").textContent = `${event.target.value}%`));
$("#tiltslider").addEventListener("change", (event) => applySetting("tiltSpeed", Number(event.target.value) / 100));
$("#openwayswitch").addEventListener("change", (event) => applySetting("openWay", event.target.checked));

// Visual quality, Low to High (world/view.js QUALITY): the level named as the slider moves, chosen
// when it's let go; and Adaptive (app/governor.js)
const qualityLevels = () => Object.keys(state.modules?.QUALITY ?? {});

$("#qualityslider").addEventListener("input", (event) => {
    const level = qualityLevels()[Number(event.target.value)];

    $("#qualityname").textContent = state.modules?.QUALITY[level]?.label ?? "";
});
$("#qualityslider").addEventListener("change", (event) => {
    const level = qualityLevels()[Number(event.target.value)];

    if (level) {
        applySetting("quality", level);
    }
});
$("#adaptiveswitch").addEventListener("change", (event) => applySetting("adaptive", event.target.checked));
$("#soundswitch").addEventListener("change", (event) => applySetting("sound", event.target.checked));

// Text size: as it comes, large, or larger for a television across the room
const TEXT_SIZES = ["normal", "large", "larger"];
const TEXT_SIZE_NAMES = Object.freeze({ normal: "As it comes", large: "Large", larger: "Larger, for a TV" });

$("#textsizeslider").value = String(Math.max(0, TEXT_SIZES.indexOf(settings.textSize)));
$("#textsizename").textContent = TEXT_SIZE_NAMES[settings.textSize] ?? TEXT_SIZE_NAMES.normal;
$("#textsizeslider").addEventListener("input", (event) => ($("#textsizename").textContent = TEXT_SIZE_NAMES[TEXT_SIZES[Number(event.target.value)]]));
$("#textsizeslider").addEventListener("change", (event) => applySetting("textSize", TEXT_SIZES[Number(event.target.value)] ?? "normal"));
applyTextSize();

// A game controller's page (Game options, Controls, Controller: app/padplay.js): the controller
// seen, its switches and sliders, and the symbols its buttons are shown with (which button does
// what: the Bindings page, showBindings)
const PAD_UNSEEN = $("#padseen").textContent;
const PAD_SYMBOL_KINDS = Object.keys(SYMBOL_NAMES);

// A controller's name as the browser gives it, without its maker's numbers
const padName = (id) => id.replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, "").replace(/\s*\(.*$/, "").trim() || "A controller";

function showController() {
    const seen = padPlay.seen;
    const percent = (share) => `${Math.round(share * 100)}%`;

    $("#padseen").textContent = seen ? `${padName(seen.id)}: ready.${padPlay.rumbles ? "" : " This browser can't make it rumble."}` : PAD_UNSEEN;
    $("#padrumbleswitch").checked = settings.padRumble;
    $("#padrumbleswitch").disabled = Boolean(seen) && !padPlay.rumbles;
    $("#padstrengthslider").value = String(Math.round(settings.padStrength * 100));
    $("#padstrengthname").textContent = percent(settings.padStrength);
    $("#padspeedslider").value = String(Math.round(settings.padSpeed * 100));
    $("#padspeedname").textContent = percent(settings.padSpeed);
    $("#paddeadslider").value = String(Math.round(settings.padDeadZone * 100));
    $("#paddeadname").textContent = percent(settings.padDeadZone);
    $("#padinvertxswitch").checked = settings.padInvertX;
    $("#padinvertyswitch").checked = settings.padInvertY;
    $("#padswapswitch").checked = settings.padSwap;
    $("#padsymbolsname").textContent = SYMBOL_NAMES[settings.padSymbols] ?? SYMBOL_NAMES.auto;
    showBindings();
}

$("#controllerbutton").addEventListener("click", () => {
    menuPage("controller");
    showController();
});
$("#padrumbleswitch").addEventListener("change", (event) => {
    applySetting("padRumble", event.target.checked);
    padPlay.tryRumble();
});
$("#padstrengthslider").addEventListener("input", (event) => ($("#padstrengthname").textContent = `${event.target.value}%`));
$("#padstrengthslider").addEventListener("change", (event) => {
    applySetting("padStrength", Number(event.target.value) / 100);
    padPlay.tryRumble();
});
$("#padspeedslider").addEventListener("input", (event) => ($("#padspeedname").textContent = `${event.target.value}%`));
$("#padspeedslider").addEventListener("change", (event) => applySetting("padSpeed", Number(event.target.value) / 100));
$("#paddeadslider").addEventListener("input", (event) => ($("#paddeadname").textContent = `${event.target.value}%`));
$("#paddeadslider").addEventListener("change", (event) => applySetting("padDeadZone", Number(event.target.value) / 100));
$("#padinvertxswitch").addEventListener("change", (event) => applySetting("padInvertX", event.target.checked));
$("#padinvertyswitch").addEventListener("change", (event) => applySetting("padInvertY", event.target.checked));
$("#padswapswitch").addEventListener("change", (event) => applySetting("padSwap", event.target.checked));
$("#padsymbolsbutton").addEventListener("click", () => {
    const next = PAD_SYMBOL_KINDS[(PAD_SYMBOL_KINDS.indexOf(settings.padSymbols) + 1) % PAD_SYMBOL_KINDS.length];

    applySetting("padSymbols", next);
    showController();
});
$("#padbindingsbutton").addEventListener("click", () => {
    menuPage("bindings");
    showBindings();
});

// --- Bindings (Game options, Controls): every action, its two keys (or mouse buttons) and its
// controller button (app/keys.js, app/gamepad.js), each set by choosing it and pressing it ---

// The rows: the keys' actions in their groups, a controller's bars among the Action Bar's
const BIND_ROWS = (() => {
    const rows = KEY_ACTIONS.map((one) => ({ id: one.id, name: one.name, group: one.group, keys: true, pad: PAD_ACTIONS.find((action) => action.id === one.id) ?? null }));

    rows.splice(rows.findIndex((row) => row.group === "bar"), 0, ...PAD_ACTIONS.filter((action) => action.bar).map((action) => ({ id: action.id, name: action.name, group: "bar", keys: false, pad: action })));

    return rows;
})();
const bindRows = new Map();

// What's being listened for: an action, and which of its boxes (0 its key, 1 its spare, "pad" its
// controller button, null whichever's pressed); whether every key's been let go of since it was
// asked (the one that chose it isn't taken for the answer); and when a mouse button was last taken
// (the browser's own for it, its menu or going back a page, kept from happening just after)
let mouseTaken = -Infinity;
const keysDown = new Set();

// What the keyboard in hand prints on each key, where the browser says (app/keys.js keyWords)
let keyLayout = null;

navigator.keyboard
    ?.getLayoutMap?.()
    .then((layout) => {
        keyLayout = layout;
        showBindings();
        showKeyHints();
    })
    .catch(() => {});

const keyName = (key) => keyWords(key, keyLayout);

function showBindings() {
    const keys = keysOf(settings.keyBindings);
    const pads = bindingsOf(settings.padBindings);
    const kind = padPlay.symbols;
    const bar = `${bindingWords(pads.bar1, kind) || "—"}/${bindingWords(pads.bar2, kind) || "—"}`;
    let group = null;

    // (Each column named, over them all)
    if (!$("#bindings").children.length) {
        const head = Object.assign(document.createElement("div"), { className: "bind bind-head" });

        head.setAttribute("aria-hidden", "true");
        head.append(...["Action", "Key", "Spare", "Controller"].map((text) => Object.assign(document.createElement("span"), { textContent: text })));
        $("#bindings").append(head);
    }

    for (const row of BIND_ROWS) {
        let element = bindRows.get(row.id);

        if (!element) {
            if (row.group !== group) {
                $("#bindings").append(Object.assign(document.createElement("h3"), { className: "options-heading bind-group", textContent: GROUPS.find((each) => each.id === row.group)?.name ?? "" }));
            }

            element = bindRow(row);
            $("#bindings").append(element);
            bindRows.set(row.id, element);
        }

        group = row.group;

        const listening = state.binding?.id === row.id ? state.binding.slot : undefined;
        const [main, spare, pad] = element.querySelectorAll(".bind-slot");

        element.classList.toggle("listening", listening !== undefined);
        element.querySelector(".bind-listen").hidden = listening === undefined;
        element.querySelector(".bind-clear").hidden = listening === undefined || listening === null;
        element.querySelector(".bind-ask").textContent = listening === "pad" ? "Press a button…" : listening === null ? (row.keys && row.pad ? "Press a key, click or button…" : row.keys ? "Press a key or click…" : "Press a button…") : "Press a key or click…";

        main.textContent = row.keys ? keyName(keys[row.id][0]) || "—" : "";
        spare.textContent = row.keys ? keyName(keys[row.id][1]) || "—" : "";
        main.classList.toggle("at", listening === 0);
        spare.classList.toggle("at", listening === 1);
        pad.classList.toggle("at", listening === "pad");

        // (The Action Bar's slots on a controller: always these, with a bar's trigger held)
        const slot = /^slot([1-6])$/.exec(row.id);

        pad.textContent = row.pad ? bindingWords(pads[row.id], kind) || "—" : slot ? `${bar} + ${symbolOf(BAR_SLOTS[Number(slot[1]) - 1], kind)}` : "";
    }

    $("#bindreset").disabled = keysAsCame(keys) && asTheyCome(pads);
    showHandheld();
}

// An action's row: its name (chosen, whichever's pressed next sets it), its key and spare, and its
// controller button (each chosen, only that one); while it's listened for, what to press, and
// clearing or giving up
function bindRow(row) {
    const element = document.createElement("div");
    const slot = (which, label, on) => {
        const button = Object.assign(document.createElement("button"), { type: "button", className: "bind-slot" });

        button.dataset.slot = String(which);
        button.setAttribute("aria-label", `${row.name}: ${label}`);
        button.disabled = !on;
        button.addEventListener("click", () => bindListen(row, which));

        return button;
    };
    const listen = document.createElement("span");
    const clear = Object.assign(document.createElement("button"), { type: "button", className: "button quiet bind-clear", textContent: "Clear" });
    const cancel = Object.assign(document.createElement("button"), { type: "button", className: "button quiet bind-cancel", textContent: "Cancel" });
    const name = Object.assign(document.createElement("button"), { type: "button", className: "bind-name", textContent: row.name });

    element.className = "bind";
    element.dataset.action = row.id;
    name.addEventListener("click", () => bindListen(row, null));
    clear.addEventListener("click", () => bindClear());
    cancel.addEventListener("click", () => stopBinding());
    listen.className = "bind-listen";
    listen.hidden = true;
    listen.append(Object.assign(document.createElement("span"), { className: "bind-ask" }), clear, cancel);
    element.append(name, slot(0, "key", row.keys), slot(1, "spare key", row.keys), slot("pad", "controller button", Boolean(row.pad)), listen);

    return element;
}

// Listen for what's pressed next for an action (`slot`: as `state.binding` keeps it); a controller's
// button too, if it can have one and is seen. Given up after a while, or another's chosen
function bindListen(row, slot) {
    stopBinding();

    const token = {};
    const pad = row.pad && (slot === "pad" || slot === null) && padPlay.seen;

    state.binding = { id: row.id, row, slot, token, armed: keysDown.size === 0, timer: setTimeout(() => state.binding?.token === token && stopBinding(), BIND_WAIT) };

    if (slot === "pad" && !padPlay.seen) {
        $("#bindtold").textContent = "Press any button on your controller first, so the game can see it.";
    } else if (pad) {
        padPlay.listen((button) => state.binding?.token === token && heardPad(button), { bar: Boolean(row.pad.bar), ms: BIND_WAIT });
    }

    showBindings();
}

// How long a key, click or button's waited for (ms)
const BIND_WAIT = 10000;

function stopBinding() {
    if (!state.binding) {
        return;
    }

    clearTimeout(state.binding.timer);
    state.binding = null;
    padPlay.stopListening();
    showBindings();
}

// A key or mouse button heard for the action listened for: set in its box (the key's, whichever
// was chosen with the name), taken from whatever had it, and said
function heardKey(key) {
    const { id, row, slot } = state.binding;

    if (!row.keys || slot === "pad") {
        return;
    }

    const { keys, taken } = setKey(keysOf(settings.keyBindings), id, slot === 1 ? 1 : 0, key);

    stopBinding();
    applySetting("keyBindings", keysChanged(keys));
    tellTaken(taken.map((each) => each.id));
    showBindings();
}

// A controller's button heard for the action listened for (null: none in time)
function heardPad(button) {
    const { id } = state.binding;

    stopBinding();

    if (!button) {
        return;
    }

    const before = bindingsOf(settings.padBindings);
    const after = rebind(before, id, button);

    applySetting("padBindings", after);
    tellTaken(takenFrom(before, after));
    showBindings();
}

// The box chosen cleared: no key, or no button
function bindClear() {
    const { id, slot } = state.binding ?? {};

    stopBinding();

    if (slot === "pad") {
        applySetting("padBindings", rebind(bindingsOf(settings.padBindings), id, ""));
    } else if (slot === 0 || slot === 1) {
        applySetting("keyBindings", keysChanged(setKey(keysOf(settings.keyBindings), id, slot, null).keys));
    }

    tellTaken([]);
    showBindings();
}

// The actions something was taken from, said, so each can be given another
function tellTaken(ids) {
    const names = [...new Set(ids)].map((id) => BIND_ROWS.find((row) => row.id === id)?.name).filter(Boolean);

    $("#bindtold").textContent = names.length ? `Taken from ${names.join(" and ")}: choose it to give it another.` : "";
}

// Keys and mouse buttons, while one's listened for: set, not done (Escape too: it's set, not
// taken for going back). A modifier pressed alone is set as it's let go of (held with another
// key, it's part of it)
window.addEventListener(
    "keydown",
    (event) => {
        keysDown.add(event.code);

        if (!state.binding) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (!state.binding.armed || event.repeat) {
            return;
        }

        if (/^(Shift|Control|Alt)(Left|Right)$/.test(event.code)) {
            state.binding.modifier = event.code;

            return;
        }

        const key = keyPressed(event);

        if (key) {
            heardKey(key);
        }
    },
    { capture: true },
);
window.addEventListener(
    "keyup",
    (event) => {
        keysDown.delete(event.code);

        if (!state.binding) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (!state.binding.armed) {
            state.binding.armed = keysDown.size === 0;
        } else if (state.binding.modifier === event.code) {
            heardKey(keyPressed({ code: event.code }));
        }
    },
    { capture: true },
);
window.addEventListener("blur", () => keysDown.clear());
window.addEventListener(
    "mousedown",
    (event) => {
        const key = mouseOf(event.button);

        if (state.binding && key) {
            event.preventDefault();
            event.stopPropagation();
            mouseTaken = performance.now();
            heardKey(key);
        } else if (state.binding && event.button === 0 && !event.target.closest?.(".bind")) {
            // (A click anywhere but the actions' rows: given up)
            stopBinding();
        }
    },
    { capture: true },
);

for (const type of ["mouseup", "auxclick", "contextmenu"]) {
    window.addEventListener(
        type,
        (event) => {
            if (mouseOf(event.button) && (state.binding || performance.now() - mouseTaken < 1000)) {
                event.preventDefault();
                event.stopPropagation();
            }
        },
        { capture: true },
    );
}

$("#bindingsbutton").addEventListener("click", () => {
    menuPage("bindings");
    showBindings();
});
$("#bindreset").addEventListener("click", () => {
    stopBinding();
    applySetting("keyBindings", {});
    applySetting("padBindings", {});
    tellTaken([]);
    showBindings();
});

// --- Handheld presets (app/handhelds.js) ---

// The handheld chosen (and its back buttons' steps, the keys as they're set now), or, none chosen,
// the one this looks like, if it looks like one
function showHandheld() {
    const one = handheldOf(settings.handheld);
    const keys = keysOf(settings.keyBindings);

    $("#handheldname").textContent = one?.name ?? "None chosen";
    $("#handheldguide").hidden = !one;

    if (one) {
        $("#handheldguidetitle").textContent = one.mouse ? "Playing in FPS mode" : `Its back buttons, in ${one.software}`;
        $("#handheldsteps").replaceChildren(...stepsOf(one.id, (action) => keyName(keys[action]?.[one.mouse ? 1 : 0])).map((step) => Object.assign(document.createElement("li"), { textContent: step })));
    }

    const guess = one ? null : handheldGuess();

    $("#handheldguess").hidden = !guess;
    $("#handheldguess").textContent = guess === "handheld" ? "This looks like a handheld gaming PC: choose yours under Handheld presets." : guess ? `This looks like a ${handheldOf(guess).name}: its preset's under Handheld presets.` : "";
}

// Which handheld this looks like (app/handhelds.js guessHandheld), or null
const handheldGuess = () => guessHandheld({ padId: padPlay.seen?.id ?? "", width: screen.width, height: screen.height, ratio: devicePixelRatio, touch: navigator.maxTouchPoints > 0 });

// Told once, playing on what looks like a handheld, that there's a preset for it
function offerHandheld() {
    const guess = settings.handheld || settings.handheldOffered || !state.game?.running ? null : handheldGuess();

    if (guess) {
        applySetting("handheldOffered", true);
        state.game.hud.message(`${guess === "handheld" ? "Playing on a handheld" : `Playing on a ${handheldOf(guess).name}`}? Game options, Controls, Bindings has a preset for it.`, 6);
    }
}

function showHandhelds() {
    const list = $("#handheldlist");

    if (!list.children.length) {
        for (const one of [...HANDHELDS, { id: null, name: "None", software: null }]) {
            const button = Object.assign(document.createElement("button"), { type: "button", className: "option-link handheld" });

            button.dataset.handheld = one.id ?? "";
            button.append(Object.assign(document.createElement("span"), { className: "text", textContent: one.name }));
            button.firstChild.append(Object.assign(document.createElement("small"), { textContent: one.id ? (one.mouse ? "The right controller a mouse, the left sending keys" : `${one.backs.length} back buttons, set in ${one.software}`) : "No preset: the keys and buttons stay as they are" }));
            button.addEventListener("click", () => chooseHandheld(one.id));
            list.append(button);
        }
    }

    for (const button of list.children) {
        button.setAttribute("aria-pressed", String((button.dataset.handheld || null) === (settings.handheld ?? null)));
    }
}

// A handheld's preset chosen: its back buttons' actions given keys (if they've none), the mouse's
// in FPS mode, its sticks' dead zone and text size; then back to the bindings, its steps shown.
// None: only the choice let go of (the keys and buttons as they are)
function chooseHandheld(id) {
    const preset = id ? presetOf(id, keysOf(settings.keyBindings)) : null;
    const taken = [];

    if (preset) {
        let keys = keysOf(settings.keyBindings);

        for (const { id: action, slot, key } of preset.keys) {
            const set = setKey(keys, action, slot, key);

            keys = set.keys;
            taken.push(...set.taken.map((each) => each.id));
        }

        applySetting("keyBindings", keysChanged(keys));
        applySetting("padDeadZone", preset.deadZone);
        applySetting("textSize", preset.textSize);
        $("#textsizeslider").value = String(Math.max(0, TEXT_SIZES.indexOf(settings.textSize)));
        $("#textsizename").textContent = TEXT_SIZE_NAMES[settings.textSize] ?? TEXT_SIZE_NAMES.normal;
    }

    applySetting("handheld", id ?? null);
    menuPage("bindings");
    tellTaken(taken);
    showController();
}

$("#handheldsbutton").addEventListener("click", () => {
    showHandhelds();
    menuPage("handhelds");
});

// The keys named where the game says what they do (the hint, the stick's and the camera's notes),
// as they're set
function showKeyHints() {
    const keys = keysOf(settings.keyBindings);

    for (const element of document.querySelectorAll("[data-keys]")) {
        element.textContent = element.dataset.keys
            .split(",")
            .map((id) => keyName(keys[id]?.[0] ?? keys[id]?.[1]) || "none")
            .join(", ");
    }

    // (A button's title: what it is, and its key, if it has one)
    for (const element of document.querySelectorAll("[data-keys-title]")) {
        const key = keyName(keys[element.dataset.keysTitle]?.[0] ?? keys[element.dataset.keysTitle]?.[1]);

        element.title = `${element.getAttribute("aria-label")}${key ? ` (${key})` : ""}`;
    }
}

showController();
showKeyHints();
padPlay.start();

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

// Escape goes back a page, as Back does, and closes the menu from the main page. (Pressed again
// and again, the browser closes the menu itself, whatever it's told: then it's closed as Resume
// closes it, the game going on, not left stopped with no menu up)
$("#menu").addEventListener("cancel", (event) => {
    if (!event.cancelable) {
        resume();

        return;
    }

    event.preventDefault();
    menuBack();
});
$("#zoomin").addEventListener("click", () => state.session?.view.zoomSmoothly(0.8));
$("#zoomout").addEventListener("click", () => state.session?.view.zoomSmoothly(1.25));

// The menu's key (Escape, as it comes) and the world map's (M), as the player's set them
// (app/keys.js), and the ring of panels' (O) held; a mouse button set to one of them too. The
// game's own keys are the game's (game.js #keyed), which takes the menu's first to back out of
// what's open
function keyed(key, event, down = true) {
    if (document.body.dataset.screen !== "hud" || !key) {
        return;
    }

    const id = actionFor(keyMap(keysOf(settings.keyBindings), ["world"]), key);

    if (!down) {
        state.ringKey = null;
        padPlay.keyRing(null);

        return;
    }

    if ($("#menu").open) {
        // (Escape goes back a page as the browser has it: another key set to the menu, as Escape)
        if (id === "menu" && key !== "Escape") {
            event.preventDefault();
            menuBack();
        }

        return;
    }

    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

    if (id === "menu") {
        if ($("#worldmap").open) {
            // (Escape closes the map as the browser has it; another key set to the menu, as Escape)
            if (key !== "Escape") {
                event.preventDefault();
                closeWorldMap();
            }
        } else {
            // (The key taken: else the browser takes the Escape that opened the menu for closing it)
            event.preventDefault();
            pause();
        }
    } else if (id === "map" && !event.repeat && !typing) {
        if ($("#worldmap").open) {
            closeWorldMap();
        } else {
            openWorldMap();
        }
    } else if (id === "panels" && !event.repeat && !typing && !$("#worldmap").open && state.game?.running) {
        // (Held open by the key where it sits, whatever else is held with it)
        state.ringKey = event.code ?? key;
        padPlay.keyRing(state.game);
    }
}

document.addEventListener("keydown", (event) => keyed(keyPressed(event), event));
document.addEventListener("keyup", (event) => event.code === state.ringKey && keyed(state.ringKey, event, false));
document.addEventListener("mousedown", (event) => {
    const key = mouseOf(event.button);

    if (key && state.game?.running && !$("#menu").open) {
        keyed(key, event);
    }
});
document.addEventListener("mouseup", (event) => mouseOf(event.button) === state.ringKey && keyed(state.ringKey, event, false));

window.addEventListener("resize", () => state.session?.view.resize());

// Browsers let a page make sound only once it's been tapped, clicked or typed on (and which of
// these counts differs: Safari on iPhones takes the end of a touch, not its start)
for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) {
    document.addEventListener(type, () => state.session?.sound.unlock(), { capture: true });
}

// Full screen asked for again on a tap or key on the game while it's playing, if it isn't (play
// started or resumed with no tap to ask from: ?play, a world joined, Resume by Escape). Asked once
// the tap's done all it does (its click too: the browser still takes it as just tapped), and not
// for one that opens a window or pauses (the menu button, the pack, M for the map)
for (const type of ["pointerup", "keyup"]) {
    document.addEventListener(
        type,
        () =>
            setTimeout(() => {
                if (document.body.dataset.screen === "hud" && state.game?.running && !document.querySelector("dialog[open]")) {
                    fullScreen.tapped();
                }
            }, 0),
        { capture: true },
    );
}

// Coming back to the page (from another app, or the browser's back and forward cache), the
// sound is started again if the browser stopped it
for (const type of ["pageshow", "focus"]) {
    window.addEventListener(type, () => state.session?.sound.wake());
}

// Closed, or left for another page: where the player is kept (as hidden, below); and whatever
// comes next isn't a crash (the debug log)
window.addEventListener("pagehide", keepPlace);
window.addEventListener("pagehide", () => telemetry.closed());

// Pause when the page is hidden (switching apps on a phone), and silence it; a world open to
// others can't move on while it's hidden, and those in it are told so (and, shown again, that it's
// going again, unless its host has paused it for everyone)
document.addEventListener("visibilitychange", () => {
    state.session?.sound.setHidden(document.hidden);
    state.together?.hosting?.pause(document.hidden ? "away" : state.everyone ? "host" : null);

    // (A joined game says so to whoever hosts its world: a world server, which stops for its one
    // player; a player's own, which knows who's away: core/netplay.js Hosting `hidden`)
    state.together?.joining?.away(document.hidden);

    if (document.hidden) {
        pause();
        telemetry.closed();
    } else {
        // (A measured run's screen asked to stay awake again: the browser lets go of it whenever the page's hidden)
        measured?.wake();
    }
});

// --- Settings ---

// On a touch screen, the thumb stick and Tap/Click to Move both off would leave no way to walk:
// the other one turned back on, whichever was turned off last (`turned`)
function keepAWayToWalk(turned) {
    if (settings.stick || settings.tapToMove || !matchMedia("(pointer: coarse)").matches) {
        return;
    }

    const other = turned === "stick" ? "tapToMove" : "stick";

    $(other === "stick" ? "#stickswitch" : "#tapmoveswitch").checked = true;
    applySetting(other, true);
}

function applySetting(key, value) {
    settings[key] = value;
    saveSettings({ [key]: value });

    if (PLAY_SETTINGS.includes(key)) {
        tellPlaySettings();
    }

    if (key === "debug") {
        debug.show(value);
        $("#debugswitch").checked = value;
    } else if (key === "debugFolded") {
        // Nothing more to do: the overlay folds itself
    } else if (key === "keyBindings") {
        if (state.game) {
            state.game.keys = keysOf(value);
        }

        showKeyHints();
    } else if (key === "squares") {
        state.game?.showSquares(value);
    } else if (key === "navigation") {
        state.game?.showNavigation(value);
    } else if (key === "minimap") {
        showMinimap(value);
    } else if (key === "stick") {
        showStick(value);
        keepAWayToWalk("stick");
    } else if (key === "tapToMove") {
        if (state.game) {
            state.game.tapToMove = value;
        }

        keepAWayToWalk("tapToMove");
    } else if (key === "stickFloats") {
        floatStick(value);
    } else if (key === "zoom") {
        showZoom(value);
    } else if (key === "swordPointer" || key === "largePointer") {
        showPointer();
    } else if (key === "quickSix") {
        state.game?.showQuick(quickShown());
        state.quickSetup?.showCount(quickShown());
    } else if (key === "chatOnScreen" || key === "refusePartyDms" || key === "refuseWorldDms" || key === "blocked") {
        applyChat();

        if (key === "blocked") {
            tellPlaySettings();
            showBlocked();
        }
    } else if (key === "messengers" || key === "resistSummons" || key === "refuseInvites" || key === "autoSnag" || key === "autoLock" || key === "quickAlways" || key === "chatter" || key === "showEnmity") {
        if (state.game) {
            state.game[key] = value;
        }

        if (key === "autoSnag") {
            showSnag(value);
        }
    } else if (CAMERA_SETTINGS.includes(key)) {
        applyCamera();
    } else if (key === "fullscreen") {
        fullScreen.wanted = value;
    } else if (key === "sendCrashes") {
        // (Off: those waiting to be sent let go of too)
        if (!value) {
            forgetCrashes(localStorage);
        }
    } else if (key === "sound") {
        state.session?.sound.setEnabled(value);
        showVolumes(value);
    } else if (key === "textSize") {
        applyTextSize();
    } else if (key.startsWith("pad")) {
        // (The controller's own: read by app/padplay.js as they are, each frame)
    } else {
        applyViewSettings();
    }
}

// The windows' and HUD's text larger, for a television (Game options, Graphics: Text size)
function applyTextSize() {
    if (settings.textSize === "large" || settings.textSize === "larger") {
        document.body.dataset.text = settings.textSize;
    } else {
        delete document.body.dataset.text;
    }
}

// The camera's settings (Game options), as the game takes them (app/game.js cameraSettings)
const CAMERA_SETTINGS = ["cameraFollows", "battleCam", "openWay", "dragSpeed", "tiltSpeed", "invertTilt", "shake"];

function applyCamera() {
    if (state.game) {
        state.game.cameraSettings = { follows: settings.cameraFollows, battle: settings.battleCam, openWay: settings.openWay, shake: settings.shake, drag: settings.dragSpeed, tilt: settings.tiltSpeed, invert: settings.invertTilt };
    }
}

function showMinimap(on) {
    document.body.dataset.minimap = on ? "on" : "off";
    state.game?.showMinimap(on);
}

// The sword pointer, or the system's own; large or not (and its size said of only with it on)
function showPointer() {
    pointer.on = settings.swordPointer;
    pointer.large = settings.largePointer;
    pointer.show();
    document.body.dataset.swordPointer = settings.swordPointer ? "on" : "off";
}

// The thumb stick: hidden with it, anything the thumb was holding is let go of, so the player
// doesn't walk on with nothing left on screen to stop them
function showStick(on) {
    document.body.dataset.stick = on ? "on" : "off";
    state.game?.showStick(on);
}

// The thumb stick springing up under the thumb, or waiting in its corner (styles.css: its zone the
// bottom left of the screen, floating)
function floatStick(on) {
    document.body.dataset.stickFloat = on ? "on" : "off";
    state.game?.floatStick(on);
}

// The zoom buttons; shown, the player's card sits above them rather than under them (styles.css)
function showZoom(on) {
    document.body.dataset.zoom = on ? "on" : "off";
}

function applyViewSettings() {
    const view = state.session?.view;

    if (!view) {
        return;
    }

    const chosen = settings.quality === "auto" ? state.modules.detectQuality() : settings.quality;
    // (Less drawn while the game can't keep up, if that's left to it (Adaptive: app/governor.js),
    // from the quality chosen down; back to it when the quality's chosen again. Not under
    // automation: a test's frames, drawn in software, are always slow, and what it measures
    // mustn't change; nor for a measured run, `?measure=`, whose frames must all be drawn alike:
    // app/measuring.js)
    const adaptive = settings.adaptive && !navigator.webdriver && !params.has("measure");
    const governor = state.game?.governor;

    governor?.setCeiling(chosen);

    if (!adaptive) {
        governor?.reset();
    }

    const { quality, scale } = adaptive && governor ? governor.rung : { quality: chosen, scale: 1 };

    view.adaptive = adaptive;
    view.chosenQuality = chosen;
    view.adaptiveScale = scale;
    view.renderScale = settings.renderScale;
    view.setQuality(quality);
    view.setShadows(settings.shadows);
    showQuality();
}

// Game options: the visual quality chosen (or suggested, left to the game), whether it's
// adaptive, and what it's drawing while it keeps up
function showQuality() {
    const levels = qualityLevels();

    if (!levels.length) {
        return;
    }

    const chosen = settings.quality === "auto" ? state.modules.detectQuality() : settings.quality;
    const slider = $("#qualityslider");

    slider.max = String(levels.length - 1);
    slider.value = String(Math.max(0, levels.indexOf(chosen)));
    $("#qualityname").textContent = `${state.modules.QUALITY[chosen].label}${settings.quality === "auto" ? " (suggested)" : ""}`;
    $("#adaptiveswitch").checked = settings.adaptive;
    showAdapted();

    // (And, under it: that the device is saving its power, so 30 frames a second is all there is
    // to draw; and that the quality chosen smooths edges, or doesn't, only once the game's next
    // loaded, the picture's drawing surface being made one way or the other for good: app/graphicsnotes.js)
    const notes = {
        "#savingpower": powerNote({ beat: state.game?.pacing.beat.value ?? 0, touch: isTouchScreen() }),
        "#edgesnote": edgesNote({ wanted: state.modules.QUALITY[chosen].antialias, made: state.edgesMade }),
    };

    for (const [selector, words] of Object.entries(notes)) {
        $(selector).hidden = !words;
        $(selector).textContent = words ?? "";
    }
}

function showAdapted() {
    const view = state.session?.view;
    const lowered = Boolean(view?.adaptive && (view.qualityName !== view.chosenQuality || view.adaptiveScale < 1));

    $("#adapted").hidden = !lowered;

    if (lowered) {
        const level = state.modules.QUALITY[view.qualityName].label.toLowerCase();

        $("#adapted").textContent = `Keeping up: drawing ${level}${view.adaptiveScale < 1 ? `, ${Math.round(view.adaptiveScale * 100)}% of the pixels` : ""}`;
    }
}

// --- Updates ---

// How often the updater's asked whether it's time to look for an update (ms: it looks every
// UPDATES.every itself), while the page is shown
const UPDATES_ASKED = 60000;

// Updates downloaded in the background while the game's open (app/updater.js): looked for every
// so often, and as the title screen's shown; once one's all there, said on the title screen, with
// a button to start it (the page loaded again, downloading nothing), and said once in a game
function watchForUpdates(release) {
    const workers = navigator.serviceWorker;

    state.updater = new Updater({
        release: release.release,
        base: document.baseURI,
        post: (message) => {
            if (!workers?.controller) {
                return false;
            }

            workers.controller.postMessage(message);

            return true;
        },
    });
    state.updater.onReady = () => {
        $("#titleupdate").hidden = document.body.dataset.screen !== "title";
        state.game?.hud?.message("An update to the game's downloaded: it starts the next time the game's loaded.", 5);
    };
    workers?.addEventListener("message", (event) => state.updater.heard(event.data));
    setInterval(() => document.hidden || state.updater.check(), UPDATES_ASKED);
    $("#updatebutton").addEventListener("click", () => location.reload());
}

// A world server's turned the game away for its version (`net`: the server's): if the server's
// the newer and the update that matches it is downloaded already, the page's loaded again at
// once, into the update (downloading nothing), and this says so; otherwise the player's told
// what to do, as ever. Never while a game's being played, which the reload would end
function updatesFor(net) {
    if (!startsUpdate({ theirs: net, ours: netOf?.NET_VERSION, ready: state.updater?.ready, playing: Boolean(state.game) })) {
        return false;
    }

    location.reload();

    return true;
}

const UPDATING_WORDS = "That server plays a newer version of the game, and yours has it downloaded: starting it…";

// --- Off we go ---

// How long the loader waits on a first visit for the service worker to take over, so that what it
// downloads is kept (ms)
const FIRST_LOOKED = 3000;

async function start() {
    // (This release's files: the manifest's, and the modules the page's import map names, main.js's
    // own address among them, each by its hash)
    const modules = mappedOf(document.querySelector('script[type="importmap"]')?.textContent, document.baseURI).concat(/\?h=/.test(import.meta.url) ? [import.meta.url] : []);
    const release = releaseOf(MANIFEST, ASSETS, document.baseURI, modules);

    // (Whether the service worker's looking after the page already: not on a first visit)
    const looking = Boolean(globalThis.navigator?.serviceWorker?.controller);

    debug.show(settings.debug);
    debug.watch({ fetcher });
    registerServiceWorker(release);
    watchForUpdates(release);
    keepDownloads();

    // The debug log (Game options): the last game's, if it fell over while playing, kept as a
    // crash; what the browser says takes long, listened for; work done a step at a time that
    // takes long, named; and anything that fails with no one to catch it
    telemetry.build = String(release?.release ?? "");
    telemetry.code = codeVersion();
    telemetry.built = builtAt();
    const crash = telemetry.recover(globalThis.performance?.getEntriesByType?.("navigation")?.[0]?.type ?? "");

    // (Fallen over in a world on a world server: the log as it now stands kept to send there as the
    // player comes back in, if they send crash reports: app/crash-reports.js)
    if (crash && settings.sendCrashes) {
        keepCrash(localStorage, crashedIn(lastInWorld(localStorage), crash), telemetry.log());
    }

    telemetry.observe();
    Steps.slow = (label, ms) => telemetry.job(label, ms);
    Steps.begun = (label) => telemetry.began(label);
    window.addEventListener("error", (event) => telemetry.error(event.error ?? event.message, "uncaught", gameState));

    // (Anything that fails with no one to catch it: told in the console, and, while a game's
    // being got ready, on the loading screen)
    window.addEventListener("unhandledrejection", (event) => {
        console.error(event.reason);
        telemetry.error(event.reason, "promise", gameState);

        if (state.building) {
            failed(event.reason);
        }
    });

    try {
        await looked(FIRST_LOOKED);

        // (On a first visit, main.js and what it imports came before the service worker took
        // over, so it didn't keep them: it's asked to now, from the browser's copies. Its other
        // modules are the manifest's, which the loader downloads through it)
        if (!looking) {
            const manifest = new Set(releaseOf(MANIFEST, ASSETS, document.baseURI).boot);

            keepLoaded(modules.filter((url) => !manifest.has(url)));
        }

        await load();
    } catch (error) {
        console.error(error);
        setProgress(0, "Pellagos couldn't load. Check your connection and try again.", String(error.message ?? error));

        const retry = Object.assign(document.createElement("button"), { type: "button", className: "button primary", textContent: "Try again" });

        retry.addEventListener("click", () => location.reload());
        $("#loadlist").replaceChildren(retry);

        return;
    }

    // (The quick start: its hero made from the world's seed, the same every time, so a test's
    // doesn't change from run to run; `&hero=1`, `2`... for another body of the same seed)
    if (params.has("play")) {
        const { quickStartHero } = await import("./app/heroes.js");
        const seed = Number(params.get("seed")) || 1;
        const hero = quickStartHero(seed, { which: params.get("hero"), people: params.get("people") });

        hero.weapon = WEAPONS[params.get("weapon")] ? params.get("weapon") : "sword";
        hero.boots = params.has("boots") && hero.weapon !== "boots";
        play({ hero, seed });

        return;
    }

    title();

    // (In another's world when the game last stopped, without leaving it, half an hour ago at most:
    // straight back in)
    const wasIn = inWorldOf(localStorage);

    // (A join link's taken out of the page's address once it's read, as a server's invite is: the
    // page loaded again, or kept to the Home Screen from there, comes to the title as any other,
    // not to that world's Join a World on another Device again, every time)
    if (params.has("join")) {
        const rest = new URLSearchParams(location.search);

        rest.delete("join");
        rest.delete("at");
        history.replaceState(null, "", `${location.pathname}${String(rest) ? `?${rest}` : ""}${location.hash}`);
    }

    // (Its join link followed, back into that world; another's, that one's asked to join)
    if (wasIn && (!params.has("join") || params.get("join").toUpperCase() === wasIn.code)) {
        goBackIn(wasIn);
    } else if (params.has("join")) {
        openJoin(params.get("join"), { at: params.get("at") });
    } else if (location.hash === "#test") {
        history.replaceState(null, "", `${location.pathname}${location.search}`);
        openServers({ test: true });
    } else if (/[#&]server=/.test(location.hash)) {
        const { inviteOf } = await serversOf();
        const invite = inviteOf(location.hash);

        history.replaceState(null, "", `${location.pathname}${location.search}`);

        if (invite) {
            openWorlds({ invite });
        }
    }
}

start();
