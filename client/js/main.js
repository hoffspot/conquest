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
import { registerServiceWorker } from "./app/device.js";
import { Debug } from "./app/debug.js";
import { Fetcher } from "./app/fetcher.js";
import { formatBytes, Loader } from "./app/loader.js";
import { MANIFEST } from "./app/manifest.js";
import { forgetCharacter, loadCharacters, loadExplored, loadFollowers, loadMessages, loadPin, loadPlace, loadProgress, loadSave, loadSettings, loadStanding, loadTalks, loadVitals, loadWheels, loadWorld, MOST_CHARACTERS, newSeed, playedSave, saveExplored, saveFollowers, saveMessages, savePin, savePlace, saveProgress, saveSettings, saveStanding, saveTalks, saveVitals, saveWheels, saveWorld, writeSave } from "./app/save.js";
import { WEAPONS } from "./core/weapons.js";

const params = new URLSearchParams(location.search);
const canvas = document.querySelector("#view");
const $ = (selector) => document.querySelector(selector);

const settings = loadSettings();
const debug = new Debug($("#debug"), { settings, onChange: applySetting });

// The downloader: the catalog's models, fetched in the background (app/fetcher.js), kept out of
// the way of the game's start and of playing together
const fetcher = new Fetcher();

// What's been loaded and made: the loader, the game's modules, the view and character kit, the
// heads-up display, and the game being played
const state = { loader: null, modules: null, session: null, hud: null, game: null, save: null, joinAs: null, creator: null, worldMap: null, picking: null, travel: null, portal: null, plans: null, planned: null, together: null, joinAfter: null, building: false };

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
    get worldMap() {
        return state.worldMap;
    },
    get together() {
        return state.together;
    },
    debug,
    fetcher,
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

    // (The drawing lost, as phones do when short of memory: the game paused and the player told,
    // until it's given back and the shaders made again)
    state.session.view.onLost = () => {
        pause();
        state.hud.message("The picture was lost. Waiting for it to come back…", 0);
    };
    state.session.view.onRestored = async () => {
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
    const kept = loadCharacters(WEAPONS);
    const continueButton = $("#continuebutton");
    const note = $("#savenote");

    state.save = save;
    show("title");
    $("#titlenote").hidden = true;
    continueButton.hidden = !save;
    note.hidden = !save;
    $("#savedbutton").hidden = !kept.length;
    $("#savedbutton").textContent = kept.length > 1 ? `Saved characters (${kept.length})` : "Saved character";

    if (save) {
        continueButton.textContent = `Continue as ${save.hero.name}`;
        note.textContent = describe(save).about;
        continueButton.focus();
    } else {
        $("#newbutton").focus();
    }
}

// A kept character as the title's cards show them: their name, people, what they wield (as they
// have now), their gold, and when they last played
function describe(save) {
    const progress = loadProgress(save);
    const held = progress.gear?.mainHand?.id;
    const weapon = WEAPONS[held] ? WEAPONS[held].label : `${WEAPONS[save.hero.weapon].label}${save.hero.boots ? " and spiked boots" : ""}`;
    const people = peopleOf(save.hero);
    const gold = Number.isFinite(progress.gold) ? ` · ${progress.gold} gold` : "";

    return {
        name: save.hero.name,
        about: `${people[0].toUpperCase()}${people.slice(1)} · ${weapon}${gold}`,
        when: `Last played ${new Date(save.played ?? save.created).toLocaleDateString()}`,
    };
}

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

// --- The characters kept ---

// Who's to be played (`mode` "play": or forgotten, each by its own button), replaced by a new
// character ("replace"), or brought to someone's world ("join")
function openCharacters(mode) {
    const dialog = $("#characters");
    const kept = loadCharacters(WEAPONS);

    if (!kept.length) {
        dialog.close();
        title();

        return;
    }

    dialog.dataset.mode = mode;
    $("#characterstitle").textContent = mode === "replace" ? "Make way for a new character" : mode === "join" ? "Who comes" : "Saved characters";
    $("#charactersnote").textContent = mode === "replace" ? `${MOST_CHARACTERS} characters are kept, the most there can be. Choose one to be replaced by your new character.` : mode === "join" ? "Choose who comes with you." : `Choose who to play. Up to ${MOST_CHARACTERS} are kept.`;
    $("#charactersnew").hidden = mode !== "join" || kept.length >= MOST_CHARACTERS;
    $("#characterlist").replaceChildren(
        ...kept.map((save) => {
            const { name, about, when } = describe(save);
            const row = document.createElement("li");
            const pick = Object.assign(document.createElement("button"), { type: "button", className: "character" });

            pick.dataset.id = save.id;
            pick.append(Object.assign(document.createElement("span"), { className: "name", textContent: mode === "replace" ? `Replace ${name}` : name }), Object.assign(document.createElement("span"), { className: "about", textContent: about }), Object.assign(document.createElement("span"), { className: "when", textContent: when }));
            pick.addEventListener("click", () => chosen(mode, save));
            row.append(pick);

            if (mode === "play") {
                const forget = Object.assign(document.createElement("button"), { type: "button", className: "forget", textContent: "Delete", title: `Delete ${name}` });

                forget.setAttribute("aria-label", `Delete ${name}`);
                forget.addEventListener("click", () => askForget(save, "delete"));
                row.append(forget);
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

    play(save);
}

// Asked before a character's forgotten for good ("delete": at once; "replace": once the new
// character that takes their place is made)
function askForget(save, why) {
    const dialog = $("#forget");
    const { name } = save.hero;

    dialog.dataset.id = save.id;
    dialog.dataset.why = why;
    $("#forgettitle").textContent = why === "replace" ? `Replace ${name}?` : `Delete ${name}?`;
    $("#forgetnote").textContent = `${name} will be permanently deleted, with their world, what they carry and what they've learnt${why === "replace" ? ", once your new character is made" : ""}. This can't be undone.`;
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

    forgetCharacter(id);

    if (state.joinAs?.id === id) {
        state.joinAs = null;
    }

    title();
    openCharacters("play");
});

$("#forgetback").addEventListener("click", () => $("#forget").close());
$("#charactersback").addEventListener("click", () => $("#characters").close());
$("#charactersnew").addEventListener("click", () => {
    $("#characters").close();
    $("#join").close();
    state.joinAfter = $("#joincode").value.toUpperCase().replace(/[^A-Z]/g, "");
    create();
});

$("#debugswitch").checked = settings.debug;
$("#minimapswitch").checked = settings.minimap;
$("#stickswitch").checked = settings.stick;
$("#floatswitch").checked = settings.stickFloats;
$("#zoomswitch").checked = settings.zoom;
$("#resistswitch").checked = settings.resistSummons;
$("#refuseswitch").checked = settings.refuseInvites;
$("#followswitch").checked = settings.cameraFollows;
$("#battlecamswitch").checked = settings.battleCam;
$("#invertswitch").checked = settings.invertTilt;
$("#shakeswitch").checked = settings.shake;
$("#dragslider").value = Math.round(settings.dragSpeed * 100);
$("#dragname").textContent = `${Math.round(settings.dragSpeed * 100)}%`;
$("#adaptiveswitch").checked = settings.adaptive;
$("#soundswitch").checked = settings.sound;
$("#debugswitch").addEventListener("change", (event) => applySetting("debug", event.target.checked));

// --- Making a character ---

// (`replacing`: the id of the kept character the new one takes the place of, forgotten once
// they're made: backed out of, they're kept)
async function create({ replacing = null } = {}) {
    const { Creator } = state.modules;
    const { view, kit } = state.session;

    show("create");

    // (Its skin atlas, worked out while the title was up: characters/kit.js)
    await kit.ready;
    state.creator = new Creator({ view, kit });

    const hero = await state.creator.run();

    state.creator = null;

    if (!hero) {
        state.joinAfter = null;
        title();

        return;
    }

    const save = { hero, seed: newSeed(), created: new Date().toISOString() };

    if (replacing) {
        forgetCharacter(replacing);
    }

    if (!writeSave(save)) {
        console.warn("This browser won't keep the character: it will be forgotten when the page closes.");
    }

    state.joinAs = save;

    // (Made to join someone's world: back to joining it)
    if (state.joinAfter !== null) {
        const code = state.joinAfter;

        state.joinAfter = null;
        title();
        openJoin(code);

        return;
    }

    play(save);
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

async function play(save) {
    state.building = true;

    // (The one Continue as... carries on with, from now)
    playedSave(save);

    try {
        await playing(save);
    } catch (error) {
        failed(error);
    } finally {
        state.building = false;
    }
}

async function playing(save) {
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
        seed: save.seed,
        talks: loadTalks(save),
        onTalk: (talks) => saveTalks(save, talks),
        explored: loadExplored(save),
        onExplore: (explored) => saveExplored(save, explored),
        progress: loadProgress(save),
        onProgress: (progress) => saveProgress(save, progress),
        standing: loadStanding(save),
        onStanding: (standing) => saveStanding(save, standing),
        followers: loadFollowers(save),
        onFollowers: (followers) => saveFollowers(save, followers),
        wheels: loadWheels(save),
        onWheels: (wheels) => saveWheels(save, wheels),
        war: loadWorld(save),
        // (Kept each of the war's turns, a minute of play: and where the player is with it)
        onWar: (war) => {
            saveWorld(save, war.snapshot());
            keepPlace();
        },
        onWorldMap: openWorldMap,
        pin: loadPin(save),
        onPin: (pin) => savePin(save, pin),
        place: loadPlace(save),
        vitals: loadVitals(save),
        messages: loadMessages(save),
        onMessages: (messages) => saveMessages(save, messages),
    });

    state.keepPlace = () => {
        savePlace(save, game.place());
        saveVitals(save, game.vitals());
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
    game.resistSummons = settings.resistSummons;
    game.refuseInvites = settings.refuseInvites;
    applyCamera();
    game.onAdapt = showAdapted;
    game.onChooseQuick = chooseQuick;
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
    $("#invitebutton").textContent = state.together ? "Who's here" : "Invite others";
    menuPage("main");
    $("#menu").showModal();
}

function resume() {
    $("#menu").close();
    state.game?.start();
}

// The menu's pages: the main one, Game options, and its Action wheels and Quick actions
const MENU_PAGES = { main: ["#menumain", "menutitle", "#resumebutton"], options: ["#menuoptions", "optionstitle", "#minimapswitch"], wheels: ["#menuwheels", "wheelstitle", "#wheelsback"], quick: ["#menuquick", "quicktitle", "#quickback"] };

function menuPage(page) {
    for (const [each, [id]] of Object.entries(MENU_PAGES)) {
        $(id).hidden = each !== page;
    }

    $("#menu").setAttribute("aria-labelledby", MENU_PAGES[page][1]);
    $("#menu").classList.toggle("wide", page === "wheels" || page === "quick");
    $(MENU_PAGES[page][2]).focus();
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
// the `slot`th chosen. Opened from Game options, Back goes back there; from a quick action held
// on in a fight (`fromFight`), back to the game.
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
    state.quickSetup.onChange = (quick) => state.game?.setQuick(quick);
    state.quickSetup.show(game.quickSetup(), slot);
    menuPage("quick");
}

// A quick action held on in a fight (or an empty one tapped): paused, its slot chosen to change
function chooseQuick(slot) {
    pause();

    if ($("#menu").open) {
        openQuick(slot, { fromFight: true });
    }
}

// Back from the Quick actions: to the game if they came from a fight, else to Game options
function quickBack() {
    if (state.quickFromFight) {
        resume();
    } else {
        menuPage("options");
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
    $("#worldmappick").hidden = !pick && !travel && !build && !war;
    $("#worldmappicktext").textContent = "Wizard's Walk: tap somewhere you've been";
    $("#worldmaptitle").textContent = travel ? "Guild portal" : build ? "The council's plans" : war ? "The war table" : "The world";
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

        $("#worldmappicktext").textContent = others ? `Tap a branch of the guild to step through to it.${off}` : "No other branch is open to you yet: go into one, and its portal opens to you.";
        map.onPick = (point) => {
            const branch = map.branchAt(point);

            if (!branch) {
                mapNote("Tap one of the guild's branches");
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
    map.open(game.worldMapView());
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

    if (state.worldMap) {
        state.worldMap.onPick = null;
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
    const { drawBuildingIcon } = await import("./app/mapicons.js");
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
$("#worldmapcancel").addEventListener("click", closeWorldMap);
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
        return;
    }

    const { openWorld, RELAY_ERRORS } = await import("./app/together.js");

    try {
        const world = await openWorld(game, {
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
        setTogether(world);
        world.link.onRtt = (rtt) => fetcher.measure(rtt);
        fetcher.probe = () => world.link.measure();
        showInvite();
    } catch (error) {
        showInvite(RELAY_ERRORS[error.message] ?? RELAY_ERRORS.unreachable);
    }
}

function showInvite(problem = "") {
    const code = state.together?.code;
    const others = code && state.game ? state.game.others() : [];

    $("#invitestatus").textContent = problem || (code ? "Your world's open to others. Give them this code:" : "Opening your world to others…");
    $("#invitecode").hidden = !code;
    $("#invitecode").textContent = code ?? "";
    $("#invitehow").hidden = !code;
    $("#invitestop").hidden = !code;

    if (code) {
        const link = `${location.origin}${location.pathname}?join=${code}`;

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
function openJoin(code = "") {
    const kept = loadCharacters(WEAPONS);

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

    const { joinWorld, RELAY_ERRORS, NET_REFUSALS } = await import("./app/together.js");

    $("#joingo").disabled = true;
    $("#joinstatus").textContent = "Joining…";

    // (Nothing downloaded from here till the world's come and the game's settled into it)
    fetcher.hold("joining");

    let joined;

    try {
        joined = await joinWorld({
            code,
            character: { hero: save.hero, talks: loadTalks(save), progress: loadProgress(save), standing: loadStanding(save), followers: loadFollowers(save) },
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
    joined.joining.onRefused = (reason) => {
        joined.close();
        setTogether(null);
        $("#joingo").disabled = false;
        $("#joinstatus").textContent = NET_REFUSALS[reason] ?? "You couldn't join that world.";
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
async function playJoined(save, welcome, joining) {
    state.building = true;

    try {
        await playingJoined(save, welcome, joining);
    } catch (error) {
        failed(error);
    } finally {
        state.building = false;
    }
}

async function playingJoined(save, welcome, joining) {
    const { createJoinedGame } = state.modules;
    const { view, kit, sound } = state.session;

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
        hero: save.hero,
        welcome,
        joining,
        onTalk: (talks) => saveTalks(save, talks),
        onProgress: (progress) => saveProgress(save, progress),
        onStanding: (standing) => saveStanding(save, standing),
        onFollowers: (followers) => saveFollowers(save, followers),
        wheels: loadWheels(save),
        onWheels: (wheels) => saveWheels(save, wheels),
        onWorldMap: openWorldMap,
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
    game.resistSummons = settings.resistSummons;
    game.refuseInvites = settings.refuseInvites;
    applyCamera();
    game.onAdapt = showAdapted;
    game.onChooseQuick = chooseQuick;
    debug.watch({ game });
    show("hud");
    game.start();
    underway(game);

    // (Nothing downloaded till the steps it keeps in hand have settled, 5 s at least, and 30 s at
    // most: a game that can't keep up with the host may never settle)
    fetcher.hold("joining", { for: 5000, until: () => !game.remote || Math.abs(game.remote.held - game.remote.delay) < 1, most: 30000 });
}

// Out of a world joined (its host gone, or the link lost): back to the title, saying why
function leftWorld(why) {
    setTogether(null);

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

$("#joinbutton").addEventListener("click", () => openJoin());
$("#joinform").addEventListener("submit", join);
$("#joincancel").addEventListener("click", () => $("#join").close());
$("#joinchange").addEventListener("click", () => openCharacters("join"));
$("#invitebutton").addEventListener("click", invite);
$("#inviteback").addEventListener("click", closeInvite);
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
$("#optionsback").addEventListener("click", () => menuPage("main"));
$("#wheelsbutton").addEventListener("click", openWheels);
$("#wheelsback").addEventListener("click", () => menuPage("options"));
$("#quickbutton").addEventListener("click", () => openQuick(0));
$("#quickback").addEventListener("click", quickBack);
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
$("#resistswitch").addEventListener("change", (event) => applySetting("resistSummons", event.target.checked));
$("#refuseswitch").addEventListener("change", (event) => applySetting("refuseInvites", event.target.checked));
$("#followswitch").addEventListener("change", (event) => applySetting("cameraFollows", event.target.checked));
$("#battlecamswitch").addEventListener("change", (event) => applySetting("battleCam", event.target.checked));
$("#invertswitch").addEventListener("change", (event) => applySetting("invertTilt", event.target.checked));
$("#shakeswitch").addEventListener("change", (event) => applySetting("shake", event.target.checked));
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

// Escape goes back a page (from Action wheels or Quick actions to Game options, or to the game if
// they were opened in a fight; from Game options to the main page), and closes the menu from the
// main page
$("#menu").addEventListener("cancel", (event) => {
    event.preventDefault();

    if (!$("#menuwheels").hidden) {
        menuPage("options");
    } else if (!$("#menuquick").hidden) {
        quickBack();
    } else if ($("#menumain").hidden) {
        menuPage("main");
    } else {
        resume();
    }
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

// Coming back to the page (from another app, or the browser's back and forward cache), the
// sound is started again if the browser stopped it
for (const type of ["pageshow", "focus"]) {
    window.addEventListener(type, () => state.session?.sound.wake());
}

// Closed, or left for another page: where the player is kept (as hidden, below)
window.addEventListener("pagehide", keepPlace);

// Pause when the page is hidden (switching apps on a phone), and silence it; a world open to
// others can't move on while it's hidden, and those in it are told so
document.addEventListener("visibilitychange", () => {
    state.session?.sound.setHidden(document.hidden);
    state.together?.hosting?.pause(document.hidden);

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
    } else if (key === "resistSummons" || key === "refuseInvites") {
        if (state.game) {
            state.game[key] = value;
        }
    } else if (CAMERA_SETTINGS.includes(key)) {
        applyCamera();
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
    debug.show(settings.debug);
    debug.watch({ fetcher });
    registerServiceWorker(releaseOf(MANIFEST, ASSETS, document.baseURI));

    // (Anything that fails with no one to catch it: told in the console, and, while a game's
    // being got ready, on the loading screen)
    window.addEventListener("unhandledrejection", (event) => {
        console.error(event.reason);

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
        openJoin(params.get("join"));
    }
}

start();
