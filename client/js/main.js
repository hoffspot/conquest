// Entry point: creates the game and wires the browser UI to it.
import { loadImage, loadWithProgress } from "./app/assets.js";
import { Camera } from "./app/camera.js";
import * as device from "./app/device.js";
import { Hud } from "./app/hud.js";
import { Input } from "./app/input.js";
import { GameLoop } from "./app/loop.js";
import { Minimap } from "./app/minimap.js";
import { Multiplayer, hasMultiplayerServer } from "./app/multiplayer.js";
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

// The menus are the book's 640x480 screens, scaled to fit. Wider screens get wider menus, up to 1024.
const STAGE_WIDTH = 640;
const STAGE_HEIGHT = 480;
const STAGE_MAX_WIDTH = 1024;

// The sidebar artwork is 160x480 and is scaled to the height of the screen
const SIDEBAR_WIDTH = 160;
const SIDEBAR_HEIGHT = 480;
// ...but never takes more than this share of the screen width
const SIDEBAR_MAX_SHARE = 0.3;
// The minimap's size inside the sidebar artwork
const MINIMAP_SIZE = 122;

// On touch screens, zoom in at least this far so units are big enough to tap
const TOUCH_ZOOM = 1.3;

class App {
    activeMode = undefined;
    hudScale = 1;
    pauseMenuOpen = false;

    constructor() {
        this.game = new Game();
        this.sounds = new SoundManager();
        this.camera = new Camera();
        this.renderer = new Renderer({
            game: this.game,
            camera: this.camera,
            backgroundCanvas: $("gamebackgroundcanvas"),
            foregroundCanvas: $("gameforegroundcanvas"),
        });
        this.sidebar = new Sidebar({ game: this.game, container: $("sidebarbuttons"), cashDisplay: $("cash") });
        this.input = new Input({
            canvas: $("gameforegroundcanvas"),
            game: this.game,
            camera: this.camera,
            renderer: this.renderer,
            sidebar: this.sidebar,
            sounds: this.sounds,
        });
        this.minimap = new Minimap({ canvas: $("minimap"), game: this.game, camera: this.camera, renderer: this.renderer });
        this.loop = new GameLoop({
            tick: () => this.runTick(),
            render: (interpolation, elapsed) => this.render(interpolation, elapsed),
        });

        this.singleplayer = new SinglePlayer(this);
        this.multiplayer = new Multiplayer(this);
        this.hud = new Hud({ app: this });

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
        this.resize();
        this.camera.setView(this.defaultZoom(), 0, 0);
        this.#centerOnStart(startX, startY);
        this.sidebar.initRequirementsForLevel(level);
    }

    // The book's proportions on large screens; closer in on touch screens so units are easy to tap
    defaultZoom() {
        const touch = device.isTouchScreen() || this.input.isTouch;

        return touch ? Math.max(this.hudScale, TOUCH_ZOOM) : this.hudScale;
    }

    // Start with the player's base in view (or the level's start position)
    #centerOnStart(startX, startY) {
        const { game, camera } = this;
        const base = game.items.find((item) => item.team === game.team && item.name === "base");

        if (base) {
            camera.centerOn(base.x * GRID_SIZE + base.baseWidth / 2, base.y * GRID_SIZE + base.baseHeight / 2);
        } else {
            camera.setView(camera.zoom, startX * GRID_SIZE, startY * GRID_SIZE);
        }
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
        this.hideChat();
        this.input.reset();
        this.resize();
        this.hud.update();

        this.loop.start(loopMode);
    }

    stopLevel() {
        this.loop.stop();
        this.game.end();
        this.sidebar.cancelDeployingBuilding();
        this.input.reset();
        this.activeMode = undefined;
        this.hideChat();
        this.#hidePauseMenu();
    }

    showMainMenu() {
        ui.switchToScreen("gamestartscreen");
    }

    // Advance the game by one tick and update the sidebar
    runTick() {
        this.game.update();
        this.sidebar.update(this.input.placementX, this.input.placementY);
        this.loop.tickCompleted();
    }

    render(interpolation, elapsed) {
        if (!this.loop.paused) {
            this.input.handlePanning(elapsed);
        }

        this.renderer.render(interpolation);
        this.minimap.render();
        this.hud.update();
    }

    get isPlaying() {
        return this.loop.running;
    }

    /* Pause menu */

    openPauseMenu() {
        if (!this.isPlaying || this.pauseMenuOpen) {
            return;
        }

        const multiplayer = this.activeMode === this.multiplayer;

        this.pauseMenuOpen = true;
        // A multiplayer game can't be paused: the other player's game keeps going
        this.loop.paused = !multiplayer;
        this.input.reset();

        $("pausetitle").textContent = multiplayer ? "Menu" : "Paused";
        $("pausenote").hidden = !multiplayer;
        $("quitbutton").textContent = multiplayer ? "Leave game" : "Quit mission";
        $("fullscreenbutton").hidden = !device.canUseFullscreen();
        this.#updatePauseMenuLabels();

        $("pausescreen").hidden = false;
        $("resumebutton").focus();
    }

    closePauseMenu() {
        this.#hidePauseMenu();
        this.loop.paused = false;
    }

    #hidePauseMenu() {
        this.pauseMenuOpen = false;
        $("pausescreen").hidden = true;
    }

    #updatePauseMenuLabels() {
        $("soundbutton").textContent = this.sounds.muted ? "Sound: Off" : "Sound: On";
        $("fullscreenbutton").textContent = device.isFullscreen() ? "Exit full screen" : "Full screen";
    }

    async quitFromPauseMenu() {
        const multiplayer = this.activeMode === this.multiplayer;

        this.#hidePauseMenu();

        const confirmed = await ui.showMessageBox(multiplayer ? "Leave this game?\nThe other player will win." : "Quit this mission?", { cancel: true });

        if (!confirmed) {
            // Back to the pause menu (the game is still paused in single player)
            this.pauseMenuOpen = false;
            this.openPauseMenu();

            return;
        }

        if (multiplayer) {
            this.multiplayer.leaveGame();
        } else {
            this.stopLevel();
            this.showMainMenu();
        }
    }

    wirePauseMenu() {
        $("resumebutton").addEventListener("click", () => this.closePauseMenu());
        $("quitbutton").addEventListener("click", () => this.quitFromPauseMenu());
        $("soundbutton").addEventListener("click", () => {
            this.sounds.toggleMute();
            this.#updatePauseMenuLabels();
        });
        $("fullscreenbutton").addEventListener("click", async () => {
            await device.toggleFullscreen();
            this.#updatePauseMenuLabels();
        });
    }

    /* Chat (multiplayer only) */

    showChat() {
        if (this.activeMode !== this.multiplayer) {
            return;
        }

        const chatMessage = $("chatmessage");

        chatMessage.hidden = false;
        chatMessage.focus();
    }

    hideChat() {
        const chatMessage = $("chatmessage");

        chatMessage.value = "";
        chatMessage.hidden = true;
        chatMessage.blur();
    }

    /* Layout */

    // Fit everything to the screen, keeping clear of notches, rounded corners and the home indicator
    resize() {
        const style = document.documentElement.style;
        const safe = $("safearea").getBoundingClientRect();
        const width = Math.max(safe.width, 1);
        const height = Math.max(safe.height, 1);

        // Menus: the book's screens, scaled to fit and centred
        const stageScale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
        const stageWidth = Math.round(Math.max(STAGE_WIDTH, Math.min(STAGE_MAX_WIDTH, width / stageScale)));

        style.setProperty("--stage-scale", stageScale);
        style.setProperty("--stage-width", `${stageWidth}px`);
        style.setProperty("--stage-left", `${safe.left + (width - stageWidth * stageScale) / 2}px`);
        style.setProperty("--stage-top", `${safe.top + (height - STAGE_HEIGHT * stageScale) / 2}px`);

        // The message box is small, so never shrink it below its full size unless it doesn't fit
        style.setProperty("--dialog-scale", Math.min(width / 320, height / 200, Math.max(stageScale, 1)));

        // Game screen: the sidebar art fills the height; the map gets everything else
        this.hudScale = Math.min(height / SIDEBAR_HEIGHT, width * SIDEBAR_MAX_SHARE / SIDEBAR_WIDTH);

        const sidebarWidth = SIDEBAR_WIDTH * this.hudScale;

        style.setProperty("--hud-scale", this.hudScale);
        style.setProperty("--sidebar-width", `${sidebarWidth}px`);

        const mapWidth = Math.max(1, width - sidebarWidth);
        const mapHeight = $("wrapper").clientHeight;
        const pixelRatio = globalThis.devicePixelRatio || 1;
        const layout = `${mapWidth},${mapHeight},${pixelRatio}`;

        if (layout !== this.layout) {
            this.layout = layout;
            this.renderer.resize(mapWidth, mapHeight);
            this.minimap.resize(MINIMAP_SIZE * this.hudScale);
        }
    }
}

/* Keyboard */

function handleKeyDown(app, ev) {
    if (ui.isMessageBoxOpen()) {
        return;
    }

    if (!app.isPlaying || ev.target === $("chatmessage")) {
        return;
    }

    const pauseKey = ev.key === "p" || ev.key === "P" || ev.key === "Pause";

    if (app.pauseMenuOpen) {
        if (pauseKey || ev.key === "Escape") {
            ev.preventDefault();
            app.closePauseMenu();
        }

        return;
    }

    if (ev.key === "Enter" && app.activeMode === app.multiplayer) {
        ev.preventDefault();
        app.showChat();
    } else if (pauseKey) {
        app.openPauseMenu();
    } else if (ev.key === "m" || ev.key === "M") {
        const muted = app.sounds.toggleMute();

        app.game.showMessage("system", muted ? "Sound off." : "Sound on.");
    } else if (!app.input.handleKeyDown(ev) && ev.key === "Escape") {
        // Escape cancels placement or deselects first; with nothing else to cancel it opens the menu
        app.openPauseMenu();
    }
}

function handleChatKeyDown(app, ev) {
    if (ev.key === "Enter") {
        // Send any text in the message input
        const message = ev.target.value.trim();

        if (message) {
            app.multiplayer.sendChatMessage(message);
        }

        app.hideChat();
    } else if (ev.key === "Escape") {
        app.hideChat();
    }
}

/* Start up */

function wireUpButtons(app) {
    const onClick = (id, handler) => $(id).addEventListener("click", handler);

    // Starting a game on a phone goes full screen in landscape where the browser allows it
    onClick("campaignbutton", () => {
        device.enterLandscapeFullscreen();
        app.singleplayer.start();
    });
    onClick("multiplayerbutton", () => {
        device.enterLandscapeFullscreen();
        app.multiplayer.start();
    });

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

    app.wirePauseMenu();
}

function watchScreen(app) {
    // Resize once per frame at most, whatever triggered it (rotation, toolbars, window resizing)
    let resizeRequest;
    const scheduleResize = () => {
        cancelAnimationFrame(resizeRequest);
        resizeRequest = requestAnimationFrame(() => app.resize());
    };

    window.addEventListener("resize", scheduleResize);
    window.addEventListener("orientationchange", scheduleResize);
    window.visualViewport?.addEventListener("resize", scheduleResize);

    // Pause when the device is turned to portrait or the game is put in the background
    device.onOrientationChange((portrait) => {
        if (portrait) {
            app.openPauseMenu();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            app.openPauseMenu();
        }
    });

    // Safari: let :active styles work on touch, and stop pinches from zooming the page
    document.addEventListener("touchstart", () => {}, { passive: true });
    document.addEventListener("gesturestart", (ev) => ev.preventDefault());
}

async function init() {
    const app = new App();

    ui.initMessageBox();
    wireUpButtons(app);
    watchScreen(app);
    app.resize();

    window.addEventListener("keydown", (ev) => handleKeyDown(app, ev));
    window.addEventListener("keyup", (ev) => app.input.handleKeyUp(ev));
    window.addEventListener("blur", () => app.input.releaseKeys());
    $("chatmessage").addEventListener("keydown", (ev) => handleChatKeyDown(app, ev));

    // Browsers only allow audio after the player interacts with the page
    for (const type of ["pointerdown", "pointerup", "keydown"]) {
        window.addEventListener(type, () => app.sounds.unlock(), { capture: true });
    }

    // Copies of the game on a static web host (GitHub Pages) have no multiplayer server
    $("multiplayerbutton").hidden = !hasMultiplayerServer();

    device.setUpInstall({ button: $("installbutton"), hint: $("installhint") });
    device.registerServiceWorker();

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
