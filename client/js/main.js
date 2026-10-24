// Pellagos: the page's screens, from loading to playing.
//
//  1. Loading: downloads everything (manifest.js), showing each group of files and how far it has
//     got, then starts the 3D view and unpacks the body the characters are made from.
//  2. The title: carry on with the saved character, or make a new one; debug mode on or off.
//  3. Making a character (creator.js): body, face, colours and hair; a weapon; a name.
//  4. Building the world (the town, the characters, their shaders) and playing (game.js), until
//     the menu goes back to the title.
//  5. Playing together (docs/WAR.md M11): the world opened to others from the menu (Invite
//     others), or another's joined from the title (Join a world), through the relay
//     (app/together.js).
//
// Nothing here imports Three.js: it and the rest of the game are downloaded by the loader first,
// and only then imported.
//
// ?play goes straight into a game with a random character (with ?weapon=, ?seed=, ?people= and
// ?quality=). ?join=CODE opens the title's Join a world with the code in it.

import { ASSETS } from "./app/assets.js";
import { releaseOf } from "./app/catalog.js";
import { isInstalledApp, isIOS, lockLandscape, registerServiceWorker } from "./app/device.js";
import { Debug } from "./app/debug.js";
import { Fetcher } from "./app/fetcher.js";
import { FullScreen } from "./app/fullscreen.js";
import { formatBytes, Loader } from "./app/loader.js";
import { MANIFEST } from "./app/manifest.js";
import { Pointer } from "./app/pointer.js";
import { telemetry } from "./app/telemetry.js";
import { builtAt, codeVersion } from "./app/version.js";
import { enterWorld, exportCharacter, forgetCharacter, forgetWorld, keepCharacter, keepVisitor, loadCharacters, loadExplored, loadFollowers, loadMarkers, loadMessages, loadPin, loadPlace, loadProgress, loadSave, loadSettings, loadStanding, loadTalks, loadTold, loadVitals, loadWheels, loadWorld, loadWorlds, makeWorld, MOST_CHARACTERS, MOST_WORLDS, newSeed, playedSave, renameWorld, saveExplored, saveFollowers, saveMarkers, saveMessages, savePin, savePlace, saveProgress, saveSettings, saveStanding, saveTalks, saveTold, saveVitals, saveWheels, saveWorld, stayOf, visitorOf, writeSave } from "./app/save.js";
import { MARKER_ICONS, MARKER_NAMES, MARKERS } from "./core/markers.js";
import { Steps } from "./core/steps.js";
import { WEAPONS } from "./core/weapons.js";
import { released } from "./world/release.js";

const params = new URLSearchParams(location.search);
const canvas = document.querySelector("#view");
const $ = (selector) => document.querySelector(selector);

const settings = loadSettings();
const debug = new Debug($("#debug"), { settings, onChange: applySetting });

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
const state = { loader: null, modules: null, session: null, hud: null, game: null, save: null, stay: null, joinAs: null, goAs: null, into: null, creator: null, worldMap: null, picking: null, travel: null, portal: null, plans: null, planned: null, together: null, joinAfter: null, joinAt: null, pageServer: null, building: false, servers: null, serversLoading: null, onServer: null, worldsAfter: null, worldAsk: null };

window.pellagos = {
    get game() {
        return state.game;
    },
    get telemetry() {
        return telemetry;
    },
    /** Whether the page has let go of anything the graphics card has (world/release.js). */
    released: () => released.any,
    get creator() {
        return state.creator;
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
    debug,
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

    frontDoor();
}

// The game opened from a world server's own address (its front door): the server remembered, and
// its worlds shown on the title, each joined with a tap: those open to anyone, those it lists, and
// those a key or ticket's held for here (as Worlds on servers shows them)
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
                    badge: world ? RULE_BADGES[ruleOfCard(world)] : "",
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

    $("#join").close();
    state.joinAfter = $("#joincode").value.toUpperCase().replace(/[^A-Z]/g, "");
    create();
});

$("#debugswitch").checked = settings.debug;
$("#minimapswitch").checked = settings.minimap;
$("#stickswitch").checked = settings.stick;
$("#floatswitch").checked = settings.stickFloats;
$("#zoomswitch").checked = settings.zoom;
$("#pointerswitch").checked = settings.swordPointer;
$("#largepointerswitch").checked = settings.largePointer;
$("#resistswitch").checked = settings.resistSummons;
$("#refuseswitch").checked = settings.refuseInvites;
$("#snagswitch").checked = settings.autoSnag;
$("#snagbutton").hidden = !settings.autoSnag;
$("#followswitch").checked = settings.cameraFollows;
$("#battlecamswitch").checked = settings.battleCam;
$("#quicksixswitch").checked = settings.quickSix;
$("#invertswitch").checked = settings.invertTilt;
$("#shakeswitch").checked = settings.shake;
$("#fullscreenswitch").checked = settings.fullscreen;
// (Where the browser won't have it, no switch: on an iPhone, a word on the Home Screen instead)
$("#fullscreenoption").hidden = !fullScreen.available;
$("#fullscreennote").hidden = fullScreen.available || !isIOS() || isInstalledApp();
$("#dragslider").value = Math.round(settings.dragSpeed * 100);
$("#dragname").textContent = `${Math.round(settings.dragSpeed * 100)}%`;
$("#adaptiveswitch").checked = settings.adaptive;
$("#soundswitch").checked = settings.sound;
$("#debugswitch").addEventListener("change", (event) => applySetting("debug", event.target.checked));

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

    // (Its skin atlas, worked out while the title was up: characters/kit.js)
    await kit.ready;
    state.creator = new Creator({ view, kit });

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
        const code = state.joinAfter;

        state.joinAfter = null;
        title();
        openJoin(code);

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
        }
    });
}

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

    state.game?.dispose();
    fetcher.hold("starting");
    show("loading");
    $("#loadlist").replaceChildren();
    setProgress(0, "Building the world");
    await painted();

    // (The world planned while the skin atlas may still be being worked out elsewhere: it's
    // needed only once the game's building its characters)
    const game = createGame({
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
        onFollowers: (followers) => saveFollowers(place, followers),
        wheels: loadWheels(save),
        onWheels: (wheels) => saveWheels(save, wheels),
        war: loadWorld(war),
        // (Kept each of the war's turns, a minute of play: and where the player is with it)
        onWar: (now) => {
            saveWorld(war, now.snapshot());
            keepPlace();
        },
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
    game.autoSnag = settings.autoSnag;
    game.snagFilter = snagChoiceOf();
    applyCamera();
    game.onAdapt = showAdapted;
    game.onChooseQuick = chooseQuick;
    game.showQuick(quickShown());
    debug.watch({ game });
    show("hud");
    game.start();
    underway(game);
}

// Where the player is and how, kept to carry on so next time (save.js savePlace, saveVitals):
// whenever the game stops, paused or quit, the page hidden (another app, on a phone) or closed,
// and each of the war's turns besides
function keepPlace() {
    if (state.game && !state.game.remote) {
        state.keepPlace?.();
    }
}

function pause() {
    keepPlace();

    if (!state.game?.running || $("#menu").open) {
        return;
    }

    // (The world stops only with no one else in it: else it goes on under the menu. Joined to
    // another's world, it isn't this game's to open to others)
    state.game.pause();
    $("#invitebutton").hidden = Boolean(state.game.remote);
    $("#worldbutton").hidden = !state.onServer;
    $("#invitebutton").textContent = state.together ? "Who's here" : "Invite others";
    menuPage("main");
    $("#menu").showModal();
}

function resume() {
    $("#menu").close();
    fullScreen.play();
    state.game?.start();
}

// The menu's pages: the main one; Game options, and a page for each group of them; and under
// those, Auto-snag (Gameplay), Action wheels and Quick actions (Controls), and the Debug log. Each
// with its title, what's focused on it, the page Back goes to (`up`), and the button there that
// opened it (`from`), focused again on the way back
const MENU_PAGES = {
    main: { page: "#menumain", title: "menutitle", focus: "#resumebutton", up: null },
    options: { page: "#menuoptions", title: "optionstitle", focus: "#graphicsbutton", up: "main", from: "#optionsbutton" },
    graphics: { page: "#menugraphics", title: "graphicstitle", focus: "#qualityslider", up: "options", from: "#graphicsbutton" },
    sound: { page: "#menusound", title: "soundtitle", focus: "#soundswitch", up: "options", from: "#soundbutton" },
    controls: { page: "#menucontrols", title: "controlstitle", focus: "#stickswitch", up: "options", from: "#controlsbutton" },
    camera: { page: "#menucamera", title: "cameratitle", focus: "#followswitch", up: "options", from: "#camerabutton" },
    gameplay: { page: "#menugameplay", title: "gameplaytitle", focus: "#snagswitch", up: "options", from: "#gameplaybutton" },
    snag: { page: "#menusnag", title: "snagtitle", focus: "#snaggrades input", up: "gameplay", from: "#snagbutton" },
    wheels: { page: "#menuwheels", title: "wheelstitle", focus: "#wheelsback", up: "controls", from: "#wheelsbutton" },
    quick: { page: "#menuquick", title: "quicktitle", focus: "#quickback", up: "controls", from: "#quickbutton" },
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
    $("#menu").classList.toggle("wide", page === "wheels" || page === "quick" || page === "log");
    $(focus).focus();

    // (What auto-snag takes, told under its switch)
    if (page === "gameplay") {
        showSnag(settings.autoSnag);
    }
}

// Back a page (the arrow in a page's heading, the Back at its foot, or Escape): to the page above
// it, the button that opened this one focused again. From the main page, or the Quick actions
// opened from a fight, back to the game
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

// What's in the player's quick actions, to change (app/quicksetup.js: loaded the first time), with
// the `slot`th chosen. Opened from Game options (Controls), Back goes back there; from a quick
// action held on in a fight (`fromFight`), back to the game.
async function openQuick(slot = 0, { fromFight = false } = {}) {
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
    $("#menuquick .menu-back").setAttribute("aria-label", fromFight ? "Back to the game" : "Back to Controls");
    state.quickSetup.onChange = (quick) => state.game?.setQuick(quick);
    state.quickSetup.showCount(quickShown());
    state.quickSetup.show(game.quickSetup(), slot);
    menuPage("quick");
}

// How many quick actions are shown: four (with their names), or six across (Game options, Quick actions)
function quickShown() {
    return settings.quickSix ? 6 : 4;
}

// A quick action held on in a fight (or an empty one tapped): paused, its slot chosen to change
function chooseQuick(slot) {
    pause();

    if ($("#menu").open) {
        openQuick(slot, { fromFight: true });
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
    const { drawBuildingIcon, drawMarker, drawTracked } = await import("./app/mapicons.js");
    const list = $("#worldmapkey");

    list.replaceChildren();

    for (const [kind, label] of [["tavern", "Tavern"], ["blacksmith", "Smithy"], ["church", "Temple"], ["guild", "Adventurers' guild"], ["hall", "Town hall"], ["keep", "Keep"], ["barracks", "Barracks"], ["swordsmith", "Swordsmith"], ["armorer", "Armorer"], ["scriptorium", "Occult scriptorium"], ["alchemist", "Alchemist"], ["masterSwordsmith", "Master Swordsmith"], ["masterArmorer", "Master Armorer"], ["emporium", "Mystic Emporium"]]) {
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

    // (A camp or a lair tracked home by its trails' signs: its icon with a pale paw)
    const tracked = document.createElement("li");
    const paw = Object.assign(document.createElement("canvas"), { width: 44, height: 44 });

    drawBuildingIcon(paw.getContext("2d"), "camp", 20, 20, 32);
    drawTracked(paw.getContext("2d"), 20, 20, 32);
    tracked.append(paw, "Tracked home by its trails");
    list.append(tracked);

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
async function invite() {
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

    const { openWorld, RELAY_ERRORS } = await import("./app/together.js");
    const broker = await brokerFor();

    try {
        const world = await openWorld(game, {
            ...(broker ? { broker: { address: broker.address, listing: await listingOf(game) } } : {}),
            // (Those who come in: who they are and what they carry theirs, what this world remembers
            // of them its own, kept with it by their own id: save.js visitorOf, keepVisitor)
            ...(state.stay?.world ? { visitors: { arrive: (brought) => visitorOf(state.stay.world.id, brought), leave: (character) => keepVisitor(state.stay.world.id, character) } } : {}),
            // (Someone come or gone: shown; and the world goes on, for them, even with the menu open;
            // nothing downloaded while the world's sent them)
            onChange: () => {
                fetcher.hold("someone joining", { for: 5000 });
                showInvite();

                if (!state.game?.running) {
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
                showInvite(RELAY_ERRORS.unreachable);

                if (state.game === game) {
                    game.link = null;
                    state.hud.message("Your world's link to the others was lost: it's yours alone again.", 5);
                }
            },
        });

        // (The downloader timing the round trip over the host's own link, to the relay)
        world.via = broker;
        $("#invitelist").checked = false;
        setTogether(world);
        world.link.onRtt = (rtt) => fetcher.measure(rtt);
        fetcher.probe = () => world.link.measure();
        showInvite();
    } catch (error) {
        showInvite(RELAY_ERRORS[error.message] ?? (broker ? `Couldn't reach ${broker.name}'s broker.` : RELAY_ERRORS.unreachable));
    }
}

// What's said of a world opened to others, for a broker's listing (plan §8.3)
async function listingOf(game) {
    const { MOST_PLAYERS, NET_VERSION } = await import("./core/netplay.js");
    const hero = state.save?.hero ?? game.host?.players?.get?.("player")?.hero ?? {};

    return { name: state.stay?.world?.name ?? `${hero.name ?? "A player"}'s world`, people: hero.race ?? "human", most: MOST_PLAYERS, net: NET_VERSION, listed: false };
}

// The world server whose broker a world's opened through (plan §8.3): the one the game came from,
// if it is one; else the first known server whose card says it brokers; else none (the old relay,
// at the page's own server, which ?relay= asks for too). { name (as it's called now), address
// (its broker's), at (the server's address), own (the page's own), key (else, the server's, as
// it's remembered) }
async function brokerFor() {
    if (new URLSearchParams(location.search).has("relay")) {
        return null;
    }

    const { addressOf, baseOf, ServerClient } = await serversOf();
    const { brokerOf } = await import("./app/peer.js");
    const own = await pageServer({ fresh: true });

    if (own?.server?.broker) {
        const at = addressOf(location.origin);

        return { name: own.server.name ?? location.host, address: brokerOf(at), at: baseOf(at), own: true };
    }

    for (const record of state.servers?.list() ?? []) {
        const known = serverCards.get(record.key);
        let card = known?.card ?? null;
        let via = known?.via ?? record;

        if (!card) {
            const client = new ServerClient(record, { servers: state.servers, player: state.you?.proving });

            card = await client.status().catch(() => null);
            via = client.via ?? record;
        }

        if (card?.server?.broker) {
            return { name: card.server.name ?? record.name ?? record.key, address: brokerOf(via), at: baseOf(via), own: false, key: record.key };
        }
    }

    return null;
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
    $("#invitestop").hidden = !code;

    if (code) {
        // (Joined through a server other than the page's own: it's named in the link)
        const link = `${location.origin}${location.pathname}?join=${code}${via && !via.own ? `&at=${encodeURIComponent(via.at)}` : ""}`;

        $("#invitelink").href = link;
        $("#invitelink").textContent = link;
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

// Joining a world someone else has opened: its code, and who comes (the character played last,
// or another kept, chosen: Change; with none kept, one's made first)
function openJoin(code = "", { at = null } = {}) {
    const kept = loadCharacters(WEAPONS);

    // (Through which server's broker: the link's, or a player's world chosen on the Worlds screen)
    state.joinAt = at;
    state.joinAs = kept.find(({ id }) => id === state.joinAs?.id) ?? state.save;
    $("#joincode").value = String(code).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    showJoinWho();
    $("#joinstatus").textContent = "";
    $("#joingo").disabled = false;
    $("#join").showModal();
    $("#joincode").focus();
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
        $("#join").close();
        state.joinAfter = code;
        create();

        return;
    }

    const save = state.joinAs;

    // (The one Continue as... carries on with, from now)
    playedSave(save);
    state.save = save;

    const { joinWorld, RELAY_ERRORS, NET_KICKS, NET_REFUSALS, versionWords } = await import("./app/together.js");

    $("#joingo").disabled = true;
    $("#joinstatus").textContent = "Joining…";

    // (Nothing downloaded from here till the world's come and the game's settled into it)
    fetcher.hold("joining");

    let joined;

    const broker = await joinBroker();

    try {
        joined = await joinWorld({
            ...(broker ? { broker } : {}),
            code,
            character: characterOf(save),
            onClosed: () => leftWorld("The world's host has closed it to others."),
            onLink: (link) => {
                holdForLink(link);

                if (state.game?.remote) {
                    state.game.link = link;
                }
            },
            onDrop: () => leftWorld("The link to the world was lost."),
        });
    } catch (error) {
        fetcher.release("joining");
        $("#joingo").disabled = false;
        $("#joinstatus").textContent = RELAY_ERRORS[error.message] ?? RELAY_ERRORS.unreachable;

        return;
    }

    setTogether(joined);
    joined.joining.onRefused = (reason, said) => {
        joined.close();
        setTogether(null);
        $("#joingo").disabled = false;
        // (Another version: which is the newer, and what to do, by the host's version where it says it)
        $("#joinstatus").textContent = reason === "version" ? versionWords(said?.net) : (NET_REFUSALS[reason] ?? "You couldn't join that world.");
    };
    joined.joining.onKicked = (reason) => {
        joined.close();
        leftWorld(NET_KICKS[reason] ?? "You were sent out of the world.");
    };
    joined.joining.onWelcome = (welcome) => playJoined(save, welcome, joined.joining);
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
// one that keeps its heroes, whose hero's the world's, not this device's to keep)
async function playingJoined(save, welcome, joining, { server = false, kept = false } = {}) {
    const { createJoinedGame } = state.modules;
    const { view, kit, sound } = state.session;
    const keep = (write) => (kept || !save ? () => {} : write);

    $("#join").close();
    state.game?.dispose();
    fetcher.hold("starting");
    show("loading");
    $("#loadlist").replaceChildren();
    setProgress(0, "Building the world you've joined");
    await painted();

    // (As playing's: the skin atlas waited for once it's needed)
    const game = createJoinedGame({
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
        wheels: save ? loadWheels(save) : null,
        onWheels: save ? (wheels) => saveWheels(save, wheels) : () => {},
        onWorldMap: openWorldMap,
        onPing: pingShown,
        told: save ? loadTold(save) : [],
        onTold: save ? (told) => saveTold(save, told) : () => {},
    });

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
    game.autoSnag = settings.autoSnag;
    game.snagFilter = snagChoiceOf();
    applyCamera();
    game.onAdapt = showAdapted;
    game.onChooseQuick = chooseQuick;
    game.showQuick(quickShown());
    debug.watch({ game });
    show("hud");
    game.start();
    underway(game);

    if (server) {
        joining.ready();
    }

    // (Their character was in the world already, on another device or on a link gone dead without
    // a word: theirs here now, as it stood: core/netplay.js Hosting #takeOver)
    if (welcome.took) {
        state.hud.message("Your other session in this world was closed: you carry on here.", 5);
    }

    // (Nothing downloaded till the steps it keeps in hand have settled, 5 s at least, and 30 s at
    // most: a game that can't keep up with the host may never settle)
    fetcher.hold("joining", { for: 5000, until: () => !game.remote || Math.abs(game.remote.held - game.remote.delay) < 1, most: 30000 });
}

// Out of a world joined (its host gone, or the link lost): back to the title, saying why
function leftWorld(why) {
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
}

// --- Worlds on servers (generated/world_server_plan.md §8.1, §6) ---

// The game's side of world servers (app/servers.js), loaded the first time it's wanted: once, one
// module after the other, whoever wants it meanwhile waiting on that one load. (A player's iPhone,
// asked for it by two at once as the page opened, gave one of them the module before it had run:
// "Cannot access 'KnownServers' before initialization"; loaded again if a load fails)
async function loadServers() {
    try {
        const servers = await import("./app/servers.js");

        return [servers, await import("./app/you.js")];
    } catch (error) {
        state.serversLoading = null;

        throw error;
    }
}

async function serversOf() {
    const [servers, you] = await (state.serversLoading ??= loadServers());

    state.servers ??= new servers.KnownServers();
    // (The player's own identity, shown coming into a server's worlds: made the first time,
    // going by the name of the character played last till they change it)
    state.you ??= you;
    you.loadPlayer({ name: state.save?.hero?.name ?? null });

    return servers;
}

// How each known server last answered (its card, or why it couldn't), by its address's key
const serverCards = new Map();

/**
 * The worlds on servers: those known, each's worlds; servers added; who comes (as joining a world
 * does). `invite` (an invite link's, app/servers.js inviteOf) is followed at once; `test`, this
 * page's own server tested (its management page's #test link, opened on a phone elsewhere).
 */
async function openWorlds({ note = "", invite = null, test = false } = {}) {
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
    } else if (test) {
        const { addressOf } = await serversOf();
        const record = state.servers.remember(addressOf(location.origin));

        showWorlds();
        await testServer(record);
        refreshWorlds();
    } else {
        refreshWorlds();
    }
}

// Test this server (plan §9.3): each of its internet addresses tried from here, and how it went said
// (and sent to the server's page)
async function testServer(record) {
    const { ServerClient } = await serversOf();
    const status = $("#worldsstatus");

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

// Who comes, said (as Join a world says it)
function showWorldsWho() {
    const save = state.joinAs;

    $("#worldswho").textContent = save ? `You'll come as ${save.hero.name} (${peopleOf(save.hero)}), or as one of your heroes a world keeps.` : "Worlds that keep heroes make you one; others ask you to make a character first.";
    $("#worldschange").hidden = !loadCharacters(WEAPONS).length;
}

// Each known server asked how it is, and its worlds shown again as each answers
async function refreshWorlds() {
    const { ServerClient } = await serversOf();

    await Promise.all(
        state.servers.list().map(async (record) => {
            try {
                const client = new ServerClient(record, { servers: state.servers, player: state.you?.proving });

                serverCards.set(record.key, { card: await client.status(), via: client.via });
            } catch (error) {
                serverCards.set(record.key, { error });
            }

            showWorlds();
        }),
    );
}

// A card button in the worlds' list: its name, what it's about, and a third line
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

// The known servers and their worlds, as last heard
async function showWorlds() {
    const { NET_VERSION, versionShort, versionWords } = await import("./core/netplay.js");
    const { baseOf, homeHost, inviteLink, SERVER_REFUSALS } = await serversOf();
    const rows = [];

    for (const record of state.servers.list()) {
        const { card, error, via } = serverCards.get(record.key) ?? {};
        const matched = !card || card.server?.net === NET_VERSION;

        // (A page from https, GitHub Pages's, can't reach a server at home over plain http: plan
        // §9.5. The game from the server's own page can, and is handed what's needed in the link)
        const walled = error?.error === "unreachable" && location.protocol === "https:" && (homeHost(record.host) || !record.secure);
        const own = { ...record, secure: false };
        const handOff = (world = null) => inviteLink(`${baseOf(own)}/`, { address: own, id: record.id, world, ...(world ? { key: record.worlds?.[world]?.key ?? null, ticket: record.worlds?.[world]?.ticket ?? null } : {}) });
        const head = document.createElement("li");
        // (Another version: which is the newer, and what to do about it)
        const about = card ? (matched ? `Version ${card.server.version} · ${Math.round(card.rtt)} ms` : versionWords(card.server?.net, { server: true })) : walled ? SERVER_REFUSALS.walled : error ? error.message : "Asking it how it is…";

        head.className = `server${error ? " unreachable" : ""}`;
        head.dataset.server = record.key;
        head.append(Object.assign(document.createElement("span"), { className: "name", textContent: record.name ?? record.key }), Object.assign(document.createElement("span"), { className: "about", textContent: about }));

        const actions = Object.assign(document.createElement("div"), { className: "actions" });
        const action = (label, onClick) => {
            const button = Object.assign(document.createElement("button"), { type: "button", className: "button quiet", textContent: label });

            button.addEventListener("click", onClick);
            actions.append(button);
        };

        if (!matched || walled) {
            // (The game from the server itself always matches it, and always reaches it)
            const open = Object.assign(document.createElement("a"), { href: walled ? handOff() : `${baseOf(record)}/`, textContent: walled ? `Open the game from the server: ${baseOf(own)}` : "Open the game from this server" });

            actions.append(open);
        } else {
            action("Enter a code", () => askCode(record));
            action("Make a world", () => askMake(record));
            action("Bring my world", () => askBring(record));
        }

        if (!walled) {
            action("Test this server", () => testServer(record));
        }

        action("Forget", () => {
            state.servers.forget(record.key);
            serverCards.delete(record.key);
            showWorlds();
        });
        head.append(actions);
        rows.push(head);

        // (Its worlds: those it lists, and those a key or ticket's held for here)
        const listed = new Map((card?.worlds ?? []).map((world) => [world.id, world]));
        const ids = new Set([...listed.keys(), ...Object.keys(record.worlds ?? {})]);

        for (const id of ids) {
            const world = listed.get(id);
            const held = record.worlds?.[id];
            const row = document.createElement("li");
            const players = world ? ` · ${world.players} of ${world.most} in` : "";
            const badge = world ? RULE_BADGES[ruleOfCard(world)] : "";

            row.dataset.world = id;
            row.append(
                worldCard({
                    name: world?.name ?? held?.name ?? id,
                    badge,
                    about: `${world?.life === "running" ? "Going now" : world ? "Waiting for someone to come in" : "Unlisted"}${players}`,
                    when: world?.offline ? "Offline for upkeep" : held?.role === "owner" ? "You own it" : held?.ticket || held?.key ? "You hold a key to it" : world?.open ? "Open to anyone: tap to join" : "Needs a key: ask its owner for an invite link",
                    className: matched ? "" : "unmatched",
                    disabled: !matched,
                    onClick: () => (walled ? location.assign(handOff(id)) : joinServerWorld(record, id, world)),
                }),
            );
            rows.push(row);
        }

        // (Players' own worlds listed on its broker, joined through it: plan §8.3)
        for (const listing of walled ? [] : (card?.players ?? [])) {
            const row = document.createElement("li");
            const fits = listing.net === NET_VERSION;
            const how = listing.direct ? "linked directly" : listing.near && listing.local ? "on your network" : "through the server";

            row.className = "player-world";
            row.dataset.listing = listing.id;
            row.append(
                worldCard({
                    name: listing.name,
                    badge: "A player's world",
                    about: `${listing.players} of ${listing.most} in · ${how}${listing.temporary ? " · on a phone, for a while" : ""}`,
                    when: fits ? "Join it" : versionShort(listing.net),
                    className: fits ? "" : "unmatched",
                    disabled: !fits,
                    onClick: () => {
                        $("#worlds").close();
                        openJoin(listing.id, { at: via ?? record });
                    },
                }),
            );
            rows.push(row);
        }
    }

    rows.push(...nearbyRows(NET_VERSION, versionShort));
    $("#worldslist").replaceChildren(...rows);
    $("#worldsnote").hidden = rows.length > 0;
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

            const row = document.createElement("li");
            const matched = near.net === net;
            const listed = Number.isFinite(near.worlds) ? ` · ${near.worlds === 1 ? "1 world" : `${near.worlds} worlds`} listed` : "";

            row.className = "nearby";
            row.dataset.nearby = near.id;
            row.append(
                worldCard({
                    name: near.name ?? where,
                    badge: "Nearby",
                    about: `On the Wi-Fi with ${record.name ?? record.key}${listed}`,
                    when: matched ? `Add it (${where})` : versionShort(near.net),
                    className: matched ? "" : "unmatched",
                    disabled: !matched,
                    onClick: () => addNearby(where, near),
                }),
            );
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
        showWorlds();
        refreshWorlds();
    }
}

// A server added by its address, or an invite link followed
async function addServer(event) {
    event.preventDefault();

    const { addressOf, inviteOf } = await serversOf();
    const text = $("#worldsaddress").value.trim();
    const invite = text.includes("#") ? inviteOf(text) : null;

    if (invite) {
        $("#worldsaddress").value = "";
        await followInvite(invite);

        return;
    }

    const address = addressOf(text);

    if (!address) {
        $("#worldsstatus").textContent = "That isn't an address: try something like studio-mac.local or 192.168.1.20:8480.";

        return;
    }

    // (Typed bare: tried secure first unless it's at home, plan §9.5; and plain as well)
    const { homeHost } = await serversOf();
    const bare = !/^[a-z]+:\/\//i.test(text);

    state.servers.remember(address, bare ? { bare: true, secure: !homeHost(address.host) } : {});
    $("#worldsaddress").value = "";
    $("#worldsstatus").textContent = "";
    showWorlds();
    refreshWorlds();
}

// An invite link followed: its server known (pinned to the id it carries), and its world entered
async function followInvite(invite) {
    const record = state.servers.remember(invite.address);

    showWorlds();

    if (invite.code) {
        await enterServerWorld(record, null, { code: invite.code, expect: invite.id });
    } else if (invite.world && (invite.key || invite.ticket)) {
        await enterServerWorld(record, invite.world, { key: invite.key, ticket: invite.ticket, expect: invite.id });
    } else {
        refreshWorlds();
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
        title: "Enter a code",
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

// A world made, with the server's admin key or a creator key (kept for next time), and gone into
async function askMake(record) {
    const { RACES } = await import("./core/worldplan/plan.js");
    const { ServerClient } = await serversOf();
    const maker = textField("worldaskmaker", { type: "password", value: record.maker ?? "", placeholder: "The key the server printed, or a creator key" });
    const name = textField("worldaskname", { maxLength: 40, placeholder: "Thornwick", autocapitalize: "words" });
    const people = selectField("worldaskpeople", RACES.map((race) => [race.id, race.name]));
    const characters = selectField("worldaskcharacters", RULE_CHOICES);

    people.value = state.joinAs?.hero.race ?? "human";
    askWorld({
        title: "Make a world",
        note: `A new world on ${record.name ?? record.key}, set in a town of the people you choose. Only those you give a key come in.`,
        fields: [worldField("Maker's key", maker), worldField("Name", name), worldField("Whose town it starts in", people), worldField("Characters", characters)],
        go: "Make it",
        onGo: async () => {
            if (!name.value.trim()) {
                $("#worldaskstatus").textContent = "Give the world a name.";

                return false;
            }

            $("#worldaskstatus").textContent = "Making it…";

            try {
                const client = new ServerClient(state.servers.get(record.key), { servers: state.servers, player: state.you?.proving });
                const made = await client.makeWorld(maker.value.trim(), { name: name.value.trim(), race: people.value, characters: characters.value });

                state.servers.remember(state.servers.get(record.key), { maker: maker.value.trim() });
                $("#worldask").close();
                showWorlds();
                await enterServerWorld(state.servers.get(record.key), made.world);

                return true;
            } catch (error) {
                $("#worldaskstatus").textContent = error.message;

                return false;
            }
        },
    });
}

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

// Bring my world to the server (docs/SERVER.md, "Bringing your own world"): one of the characters
// kept on this device chosen, and their own world (its land, and its war as it stands) made a
// world of the server's, with them in it, kept by the world, and whoever brings it its owner
function askBring(record) {
    const server = record.name ?? record.key;
    // (Each world on this device with each of the characters who's been in it, to go with it)
    const kept = loadCharacters(WEAPONS);
    const pairs = loadWorlds().flatMap((world) => kept.filter((save) => world.places[save.id]).map((save) => ({ world, save })));
    const how = helpBlock("How it works", [], {
        ordered: true,
        items: [
            "Choose the world on this device you'll bring, and which of your characters who's been in it goes with it.",
            `Give a key that makes worlds on ${server}: its admin key, or a creator key its owner made for you.`,
            "Name the world, and say whether others may bring a hero of their own in.",
            "Go in: you're its owner, playing that character. Invite others from the world's menu: World, then Invite others.",
        ],
    });
    const only = helpBlock("Only worlds and characters on this device", ["The worlds and characters saved in this browser are listed here. To bring one from another device or browser, export the character there while they're in it (Characters on this device, then Export), and import the file here first (Characters on this device, then Import from a file): their world comes with them."]);

    askWorld({
        title: "Bring my world to the server",
        note: `Each world on this device has its own land, and the war going on in it. Bring one to ${server}, and it becomes a world there: the same land, its war carried on from where it stands, and one of your characters in it, ready for others to join.`,
        fields: pairs.length ? [how, only] : [only],
        choices: pairs.length
            ? pairs.map(({ world, save }) => {
                  const { name, about, when } = describe(save);
                  const war = loadWorld(world);

                  return worldCard({ name: `${world.name}, as ${name}`, about: `${about}${war ? ` · the war at turn ${war.turn ?? 0}` : ""}`, when, onClick: () => askBringAs(record, save, world) });
              })
            : null,
        go: null,
    });

    if (!pairs.length) {
        $("#worldaskstatus").textContent = "There are no worlds played in on this device yet: play a character in one first, or import one from a file.";
    }
}

// The rest of it, for the world chosen and who goes with it (`world`, `save`): the key that makes
// worlds, its name, and its first heroes; then brought, and said what came of it, before going in
async function askBringAs(record, save, world) {
    const { ServerClient, SERVER_REFUSALS } = await serversOf();
    const server = record.name ?? record.key;
    const hero = save.hero.name;
    const maker = textField("worldaskmaker", { type: "password", value: record.maker ?? "", placeholder: "Its admin key, or a creator key" });
    const name = textField("worldaskname", { maxLength: 60, value: world.name, autocapitalize: "words" });
    const first = selectField("worldaskfirst", [
        ["new", "Others make new characters here, the world's own"],
        ["bring", "Others may copy one of theirs in, once each, the copy staying here"],
    ]);
    const keyHelp = helpBlock("The key that makes worlds", [
        `${server}'s admin key works at home, on its own Wi-Fi: it's on its management page's Overview (and printed when the server first started). From anywhere else, ask the server's owner for a creator key (management page: Settings, then Creator keys).`,
    ]);
    const comes = helpBlock("What comes with it", [], {
        items: [
            `The land of ${world.name}, and its war, as it stands now.`,
            `A copy of ${hero}, with all they carry, know and have found there, kept by the world as your first character there, ${server}'s own.`,
            "Where everyone is and what they're doing is made afresh from the land, as it is each time you load your game.",
            `${hero} and ${world.name} stay on this device as they are: what happens on ${server} stays in its world, and what happens here stays here.`,
        ],
    });

    askWorld({
        title: `Bring ${world.name} to ${server}`,
        note: `A new world on ${server}, made from ${world.name}: you'll be its owner, and only those you give a key come in.`,
        fields: [comes, worldField("Key that makes worlds", maker), keyHelp, worldField("World's name", name), worldField("Other players' characters", first)],
        go: "Bring it to the server",
        onGo: async () => {
            if (!maker.value.trim()) {
                $("#worldaskstatus").textContent = `Give a key that makes worlds on ${server}.`;

                return false;
            }

            if (!name.value.trim()) {
                $("#worldaskstatus").textContent = "Give the world a name.";

                return false;
            }

            const character = exportCharacter(save, { world: world.id });

            if (!character) {
                $("#worldaskstatus").textContent = `${hero} couldn't be read from this device.`;

                return false;
            }

            $("#worldaskstatus").textContent = `Bringing ${world.name} to ${server}… Making its land can take a minute.`;

            let brought;

            try {
                brought = await new ServerClient(state.servers.get(record.key), { servers: state.servers, player: state.you?.proving }).bringWorld(maker.value.trim(), { character, name: name.value.trim(), firstHero: first.value });
            } catch (error) {
                $("#worldaskstatus").textContent = bringRefusal(error, { server, hero, world: world.name, refusals: SERVER_REFUSALS });

                return false;
            }

            state.servers.remember(state.servers.get(record.key), { maker: maker.value.trim() });
            showWorlds();
            askWorld({
                title: `${brought.name} is on ${server}`,
                note: `${world.name} has come to ${server} as a world of its own${brought.turn === null ? ", its war begun afresh" : `, its war at turn ${brought.turn}`}. You're its owner, and ${brought.hero} is kept there for you.`,
                fields: [
                    ...(brought.left?.length ? [helpBlock(`What changed for ${brought.hero}`, [`This version of the game plays them a little differently: ${brought.left.join(" ")}`])] : []),
                    helpBlock("Next", [], {
                        items: [
                            `Go in, and choose ${brought.hero}.`,
                            "To invite others: in the world, open the menu, then World, then Invite others (an invite link, or a short code to say aloud).",
                            `Come back any time from Worlds on servers: ${brought.name} is listed under ${server}.`,
                        ],
                    }),
                ],
                go: "Go in",
                onGo: async () => {
                    $("#worldask").close();
                    await enterServerWorld(state.servers.get(record.key), brought.world);

                    return true;
                },
            });

            return true;
        },
    });
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

            $("#worldsstatus").textContent = `${taken.added.length + taken.merged.length} server${taken.added.length + taken.merged.length === 1 ? "" : "s"} taken in.${taken.conflicts.length ? ` ${taken.conflicts.join(", ")} already known as another server: kept as it was.` : ""}`;
            showWorlds();
            refreshWorlds();

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
async function playServerWorld(client, entered, { save = null, hero = undefined, character: given = null }) {
    const { SERVER_REFUSALS } = await serversOf();
    const { NET_REFUSALS, NET_KICKS, versionWords } = await import("./app/together.js");
    const kept = entered.card?.heroes === "kept";
    const character = given ?? (save ? characterOf(save) : {});

    if (!$("#worlds").open) {
        $("#worlds").showModal();
    }

    $("#worldsstatus").textContent = "Going in…";
    fetcher.hold("joining");

    let joined;

    try {
        joined = await client.play({
            world: entered.world,
            session: entered.session,
            character,
            hero,
            onWaiting: (place) => ($("#worldsstatus").textContent = `The server's running as many worlds as it can: yours is ${place === 1 ? "next" : `number ${place}`} in line to open…`),
            onClosed: (reason) => leftWorld(SERVER_REFUSALS[reason] ?? "You were sent out of the world."),
            onLink: (link) => {
                holdForLink(link);

                if (state.game?.remote) {
                    state.game.link = link;
                }
            },
            onDrop: () => leftWorld("The link to the world was lost."),
        });
    } catch (error) {
        fetcher.release("joining");
        $("#worldsstatus").textContent = error.message;

        return;
    }

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
        $("#worldsstatus").textContent = reason === "version" ? versionWords(said?.net, { server: true }) : (NET_REFUSALS[reason] ?? SERVER_REFUSALS[reason] ?? "You couldn't go into that world.");
    };
    joined.joining.onKicked = (reason) => {
        joined.close();
        leftWorld(NET_KICKS[reason] ?? "You were sent out of the world.");
    };
    joined.joining.onWelcome = (welcome) => {
        $("#worlds").close();
        playJoined(save, welcome, joined.joining, { kept, server: true });
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
    $("#worldpanel").showModal();

    if (owner) {
        showWorldKeys();
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
$("#worldsbutton").addEventListener("click", () => openWorlds());
$("#worldsaddform").addEventListener("submit", addServer);
$("#worldsback").addEventListener("click", () => $("#worlds").close());
$("#worldschange").addEventListener("click", () => openCharacters("worlds"));
$("#worldscarry").addEventListener("click", askCarry);

// A guide in a dialog of its own (About, the Worlds Guide: `id`, with its `${id}body` and
// `${id}text`): what it says put in while it's open, from the top each time; its contents take the
// reader to each part, and closing it leaves the page without it
function openGuide(id) {
    const body = $(`#${id}body`);

    body.replaceChildren($(`#${id}text`).content.cloneNode(true));
    $(`#${id}`).showModal();
    body.scrollTop = 0;
    body.focus({ preventScroll: true });
}

for (const id of ["about", "worldsguide"]) {
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

// The Worlds Guide: every way into a world, over Worlds on servers, which it goes back to
$("#worldsguidebutton").addEventListener("click", () => openGuide("worldsguide"));
$("#worldsguideclose").addEventListener("click", () => $("#worldsguide").close());

$("#joinbutton").addEventListener("click", () => openJoin());
$("#joinform").addEventListener("submit", join);
$("#joincancel").addEventListener("click", () => $("#join").close());
$("#joinchange").addEventListener("click", () => openCharacters("join"));
$("#invitebutton").addEventListener("click", invite);
$("#inviteback").addEventListener("click", closeInvite);
// (Listed on its broker's server for players there to see, or for its code alone)
$("#invitelist").addEventListener("change", (event) => state.together?.link?.list?.(event.target.checked));
$("#invitestop").addEventListener("click", () => {
    state.together?.close();
    setTogether(null);
    closeInvite();
});
$("#invite").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeInvite();
});

$("#menubutton").addEventListener("click", pause);
$("#resumebutton").addEventListener("click", resume);
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
$("#resistswitch").addEventListener("change", (event) => applySetting("resistSummons", event.target.checked));
$("#refuseswitch").addEventListener("change", (event) => applySetting("refuseInvites", event.target.checked));
$("#snagswitch").addEventListener("change", (event) => applySetting("autoSnag", event.target.checked));
$("#snagbutton").addEventListener("click", openSnag);
$("#snagall").addEventListener("click", () => snagChanged({ all: true }));
$("#snaggrades").addEventListener("change", () => snagChanged());
$("#snagkinds").addEventListener("change", () => snagChanged());
$("#followswitch").addEventListener("change", (event) => applySetting("cameraFollows", event.target.checked));
$("#battlecamswitch").addEventListener("change", (event) => applySetting("battleCam", event.target.checked));
$("#quicksixswitch").addEventListener("change", (event) => applySetting("quickSix", event.target.checked));
$("#invertswitch").addEventListener("change", (event) => applySetting("invertTilt", event.target.checked));
$("#shakeswitch").addEventListener("change", (event) => applySetting("shake", event.target.checked));
$("#fullscreenswitch").addEventListener("change", (event) => applySetting("fullscreen", event.target.checked));
$("#dragslider").addEventListener("input", (event) => ($("#dragname").textContent = `${event.target.value}%`));
$("#dragslider").addEventListener("change", (event) => applySetting("dragSpeed", Number(event.target.value) / 100));

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
$("#zoomin").addEventListener("click", () => state.session?.view.zoom(0.8));
$("#zoomout").addEventListener("click", () => state.session?.view.zoom(1.25));

document.addEventListener("keydown", (event) => {
    if (document.body.dataset.screen !== "hud" || $("#menu").open) {
        return;
    }

    if (event.key === "Escape" && !$("#worldmap").open) {
        pause();
    } else if ((event.key === "m" || event.key === "M") && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !(event.target instanceof HTMLInputElement)) {
        if ($("#worldmap").open) {
            closeWorldMap();
        } else {
            openWorldMap();
        }
    }
});

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
// others can't move on while it's hidden, and those in it are told so
document.addEventListener("visibilitychange", () => {
    state.session?.sound.setHidden(document.hidden);
    state.together?.hosting?.pause(document.hidden);

    if (state.onServer) {
        state.together?.joining?.away(document.hidden);
    }

    if (document.hidden) {
        pause();
        telemetry.closed();
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
    } else if (key === "navigation") {
        state.game?.showNavigation(value);
    } else if (key === "minimap") {
        showMinimap(value);
    } else if (key === "stick") {
        showStick(value);
    } else if (key === "stickFloats") {
        floatStick(value);
    } else if (key === "zoom") {
        showZoom(value);
    } else if (key === "swordPointer" || key === "largePointer") {
        showPointer();
    } else if (key === "quickSix") {
        state.game?.showQuick(quickShown());
        state.quickSetup?.showCount(quickShown());
    } else if (key === "resistSummons" || key === "refuseInvites" || key === "autoSnag") {
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
    } else if (key === "sound") {
        state.session?.sound.setEnabled(value);
        showVolumes(value);
    } else {
        applyViewSettings();
    }
}

// The camera's settings (Game options), as the game takes them (app/game.js cameraSettings)
const CAMERA_SETTINGS = ["cameraFollows", "battleCam", "dragSpeed", "invertTilt", "shake"];

function applyCamera() {
    if (state.game) {
        state.game.cameraSettings = { follows: settings.cameraFollows, battle: settings.battleCam, shake: settings.shake, drag: settings.dragSpeed, invert: settings.invertTilt };
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
    // mustn't change)
    const adaptive = settings.adaptive && !navigator.webdriver;
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

// --- Off we go ---

async function start() {
    const release = releaseOf(MANIFEST, ASSETS, document.baseURI);

    debug.show(settings.debug);
    debug.watch({ fetcher });
    registerServiceWorker(release);

    // The debug log (Game options): the last game's, if it fell over while playing, kept as a
    // crash; what the browser says takes long, listened for; work done a step at a time that
    // takes long, named; and anything that fails with no one to catch it
    telemetry.build = String(release?.release ?? "");
    telemetry.code = codeVersion();
    telemetry.built = builtAt();
    telemetry.recover(globalThis.performance?.getEntriesByType?.("navigation")?.[0]?.type ?? "");
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
        const { heroOfPeople, randomHero, suggestName } = await import("./app/heroes.js");
        const hero = params.get("people") ? heroOfPeople(randomHero(), params.get("people")) : randomHero();

        hero.name = suggestName(hero);
        hero.weapon = WEAPONS[params.get("weapon")] ? params.get("weapon") : "sword";
        hero.boots = params.has("boots") && hero.weapon !== "boots";
        play({ hero, seed: Number(params.get("seed")) || 1 });

        return;
    }

    title();

    if (params.has("join")) {
        openJoin(params.get("join"), { at: params.get("at") });
    } else if (location.hash === "#test") {
        history.replaceState(null, "", `${location.pathname}${location.search}`);
        openWorlds({ test: true });
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
