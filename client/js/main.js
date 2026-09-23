// Entry point: creates the game and wires the browser UI to it.
import { loadImage, loadWithProgress } from "./app/assets.js";
import { Input } from "./app/input.js";
import { GameLoop } from "./app/loop.js";
import { Multiplayer } from "./app/multiplayer.js";
import { Renderer } from "./app/renderer.js";
import { Sidebar } from "./app/sidebar.js";
import { SinglePlayer } from "./app/singleplayer.js";
import { SoundManager } from "./app/sounds.js";
import * as ui from "./app/ui.js";
import { GRID_SIZE } from "./core/config.js";
import { allEntityNames } from "./core/entities/index.js";
import { setSpriteSheet, spriteSheetUrl } from "./core/entities/sprites.js";
import { Game } from "./core/game.js";

const $ = (id) => document.getElementById(id);

// The game is designed for a 640x480 screen and scaled to fit the window.
// Wider windows get a wider game area, up to 1024 pixels.
const BASE_WIDTH = 640;
const BASE_HEIGHT = 480;
const MAX_WIDTH = 1024;
const SIDEBAR_WIDTH = 160;

class App {
    activeMode = undefined;

    constructor() {
        this.game = new Game();
        this.sounds = new SoundManager();
        this.renderer = new Renderer({
            game: this.game,
            backgroundCanvas: $("gamebackgroundcanvas"),
            foregroundCanvas: $("gameforegroundcanvas"),
        });
        this.sidebar = new Sidebar({ game: this.game, container: $("sidebarbuttons"), cashDisplay: $("cash") });
        this.input = new Input({
            canvas: $("gameforegroundcanvas"),
            game: this.game,
            renderer: this.renderer,
            sidebar: this.sidebar,
            sounds: this.sounds,
        });
        this.loop = new GameLoop({
            tick: () => this.runTick(),
            render: (interpolation, elapsed) => this.render(interpolation, elapsed),
        });

        this.singleplayer = new SinglePlayer(this);
        this.multiplayer = new Multiplayer(this);

        this.game.on("message", (from, message) => {
            this.sounds.play("message-received");
            ui.showGameMessage(from, message);
        });
        this.game.on("sound", (name) => this.sounds.play(name));
        this.game.on("levelend", (success) => this.activeMode?.handleLevelEnd(success));
    }

    // Load the level's map and position the view (items and cash are set up by game.loadLevel)
    async prepareLevel(level, startX, startY) {
        const [mapImage] = await loadWithProgress([loadImage(`images/maps/${this.game.currentMap.mapImage}`)]);

        this.renderer.setMap(mapImage);
        this.renderer.setView(startX * GRID_SIZE, startY * GRID_SIZE);
        this.sidebar.initRequirementsForLevel(level);
    }

    /**
     * Show the game screen and start the loop.
     * @param mode  the SinglePlayer or Multiplayer controller running the level
     * @param {"fixed" | "external"} loopMode  whether the loop advances the game itself or the server does
     */
    startLevel(mode, loopMode) {
        this.activeMode = mode;

        ui.switchToScreen("gameinterfacescreen");
        ui.clearGameMessages();
        hideChat();
        this.input.reset();

        this.loop.start(loopMode);
    }

    stopLevel() {
        this.loop.stop();
        this.game.end();
        this.sidebar.cancelDeployingBuilding();
        this.input.reset();
        this.activeMode = undefined;
        hideChat();
    }

    showMainMenu() {
        ui.switchToScreen("gamestartscreen");
    }

    // Advance the game by one tick and update the sidebar
    runTick() {
        this.game.update();
        this.sidebar.update(this.input.gridX, this.input.gridY);
        this.loop.tickCompleted();
    }

    render(interpolation, elapsed) {
        if (!this.loop.paused) {
            this.input.handlePanning(elapsed);
        }

        this.renderer.render(interpolation);

        if (this.loop.paused) {
            this.renderer.drawBanner("PAUSED");
        }
    }

    // Scale the game to fit the window
    resize() {
        const scale = Math.min(window.innerWidth / BASE_WIDTH, window.innerHeight / BASE_HEIGHT);
        const gameContainer = $("gamecontainer");

        gameContainer.style.transform = `translate(-50%, -50%) scale(${scale})`;

        // Use the extra room in wide windows for a wider game area, between 640 and 1024 pixels
        const width = Math.round(Math.max(BASE_WIDTH, Math.min(MAX_WIDTH, window.innerWidth / scale)));

        gameContainer.style.width = `${width}px`;

        const canvasWidth = width - SIDEBAR_WIDTH;

        if (this.renderer.width !== canvasWidth) {
            this.renderer.resize(canvasWidth);
        }

        $("chatmessage").style.width = `${canvasWidth}px`;
    }

    get isPlaying() {
        return this.loop.running;
    }
}

/* Chat (multiplayer only) */

function showChat() {
    const chatMessage = $("chatmessage");

    chatMessage.hidden = false;
    chatMessage.focus();
}

function hideChat() {
    const chatMessage = $("chatmessage");

    chatMessage.value = "";
    chatMessage.hidden = true;
}

/* Keyboard */

function handleKeyDown(app, ev) {
    if (ui.isMessageBoxOpen()) {
        return;
    }

    if (!app.isPlaying || ev.target === $("chatmessage")) {
        return;
    }

    if (ev.key === "Enter" && app.activeMode === app.multiplayer) {
        ev.preventDefault();
        showChat();
    } else if ((ev.key === "p" || ev.key === "P" || ev.key === "Pause") && app.activeMode === app.singleplayer) {
        app.loop.togglePause();
    } else if (ev.key === "m" || ev.key === "M") {
        const muted = app.sounds.toggleMute();

        app.game.showMessage("system", muted ? "Sound off." : "Sound on.");
    } else {
        app.input.handleKeyDown(ev);
    }
}

function handleChatKeyDown(app, ev) {
    if (ev.key === "Enter") {
        // Send any text in the message input
        const message = ev.target.value.trim();

        if (message) {
            app.multiplayer.sendChatMessage(message);
        }

        hideChat();
    } else if (ev.key === "Escape") {
        hideChat();
    }
}

/* Start up */

function wireUpButtons(app) {
    const onClick = (id, handler) => $(id).addEventListener("click", handler);

    onClick("campaignbutton", () => app.singleplayer.start());
    onClick("multiplayerbutton", () => app.multiplayer.start());

    onClick("entermission", () => app.singleplayer.play());
    onClick("exitmission", () => app.singleplayer.exit());

    onClick("multiplayerjoin", () => app.multiplayer.join());
    onClick("multiplayercancel", () => app.multiplayer.cancel());

    const gamesList = $("multiplayergameslist");

    gamesList.addEventListener("click", (ev) => app.multiplayer.handleRoomClick(ev.target.closest("li")));
    gamesList.addEventListener("dblclick", (ev) => app.multiplayer.handleRoomClick(ev.target.closest("li"), { join: true }));
    // Space selects the focused room, Enter joins it
    gamesList.addEventListener("keydown", (ev) => {
        if (ev.key === " " || ev.key === "Enter") {
            ev.preventDefault();
            app.multiplayer.handleRoomClick(ev.target.closest("li"), { join: ev.key === "Enter" });
        }
    });
}

async function init() {
    const app = new App();

    ui.initMessageBox();
    wireUpButtons(app);

    app.resize();
    window.addEventListener("resize", () => app.resize());

    window.addEventListener("keydown", (ev) => handleKeyDown(app, ev));
    window.addEventListener("keyup", (ev) => app.input.handleKeyUp(ev));
    window.addEventListener("blur", () => app.input.releaseKeys());
    $("chatmessage").addEventListener("keydown", (ev) => handleChatKeyDown(app, ev));

    // Browsers only allow audio after the player interacts with the page
    for (const type of ["pointerdown", "pointerup", "keydown"]) {
        window.addEventListener(type, () => app.sounds.unlock(), { capture: true });
    }

    // Display the main game menu, and load the sprites and sounds for every unit
    app.showMainMenu();

    const spriteSheets = allEntityNames().map(async ({ type, name }) => {
        setSpriteSheet(type, name, await loadImage(spriteSheetUrl(type, name)));
    });

    try {
        await loadWithProgress([...spriteSheets, ...app.sounds.load()]);
    } catch (error) {
        console.error(error);
        ui.showMessageBox(`Some game files could not be loaded.\n${error.message}`);
    }

    // Expose the app for debugging from the browser console
    globalThis.lastColony = app;
}

init();
