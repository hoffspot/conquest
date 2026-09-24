import { levels } from "../core/data/levels.js";
import { createMission, newSeed } from "../core/missions.js";
import { seedFromAddress, setClassicMaps, usesClassicMaps } from "./mapchoice.js";
import { showMessageBox, showMissionBriefing, switchToScreen } from "./ui.js";

/**
 * The single player campaign: a sequence of missions with briefings between them. Each mission is
 * played on a newly generated map (or on the book's map, if the player prefers); trying a mission
 * again keeps its map.
 */
export class SinglePlayer {
    currentLevel = 0;
    // The generated map for the current mission
    seed = undefined;

    constructor(app) {
        this.app = app;
        this.enterMissionButton = document.getElementById("entermission");
        this.newMapButton = document.getElementById("newmap");
        this.classicMapCheckbox = document.getElementById("classicmap");
        this.mapName = document.getElementById("mapname");
        this.missionTitle = document.getElementById("missiontitle");
        this.preview = document.getElementById("mappreview");
    }

    // Begin single player campaign with the first level
    start() {
        this.currentLevel = 0;
        this.initLevel({ seed: seedFromAddress() });
    }

    /**
     * Get the current mission ready and show its briefing.
     * @param {{seed?: number, sameMap?: boolean}} [options]  play generated map `seed`, or the
     *        same map as last time, rather than a new one
     */
    async initLevel({ seed, sameMap = false } = {}) {
        const { app } = this;
        const level = levels.singleplayer[this.currentLevel];
        const classic = usesClassicMaps();

        if (!sameMap || this.seed === undefined) {
            this.seed = seed ?? newSeed();
        }

        // Don't allow player to enter mission until all assets for the level are loaded
        this.#setMapControlsEnabled(false);

        let mission;

        try {
            mission = createMission(level, { seed: this.seed, classic });
        } catch (error) {
            console.error(error);
            await showMessageBox(`Could not make a map for the mission.\n${error.message}`);
            app.showMainMenu();

            return;
        }

        app.game.commandHandler = undefined;
        app.game.loadLevel(mission, { team: "blue" });

        // Update the mission briefing text and show briefing screen
        switchToScreen("missionbriefingscreen");
        showMissionBriefing(mission.briefing);
        this.missionTitle.textContent = `Mission ${this.currentLevel + 1}: ${mission.name}`;
        this.classicMapCheckbox.checked = classic;
        this.mapName.textContent = classic ? "The book's map" : `Map ${this.seed}`;

        try {
            await app.prepareLevel(mission, mission.startX, mission.startY);
        } catch (error) {
            console.error(error);
            await showMessageBox(`Could not load the mission.\n${error.message}`);
            app.showMainMenu();

            return;
        }

        this.#drawPreview();
        this.#setMapControlsEnabled(true);
        this.enterMissionButton.focus();
    }

    // A picture of the whole map, with the player's own units and buildings marked
    #drawPreview() {
        const { renderer, game } = this.app;
        const map = renderer.mapImage;
        const canvas = this.preview;
        const context = canvas.getContext("2d");
        const scale = Math.min(canvas.width / map.width, canvas.height / map.height);
        const left = (canvas.width - map.width * scale) / 2;
        const top = (canvas.height - map.height * scale) / 2;

        context.fillStyle = "#000";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(map, left, top, map.width * scale, map.height * scale);
        context.fillStyle = "#5b8fff";

        for (const item of game.items) {
            if (item.team === game.team && item.x >= 0 && item.y >= 0) {
                const size = Math.max(3, (item.baseWidth ?? 20) * scale);

                context.fillRect(left + item.x * 20 * scale, top + item.y * 20 * scale, size, size);
            }
        }
    }

    #setMapControlsEnabled(enabled) {
        this.enterMissionButton.disabled = !enabled;
        this.classicMapCheckbox.disabled = !enabled;
        // A new map only makes sense when playing on generated maps
        this.newMapButton.disabled = !enabled || this.classicMapCheckbox.checked;
    }

    /** Play the mission on a different generated map. */
    newMap() {
        this.initLevel();
    }

    /** Switch between the book's map and generated maps. */
    setClassicMap(classic) {
        setClassicMaps(classic);
        this.initLevel({ sameMap: true });
    }

    play() {
        this.app.startLevel(this, "fixed");
    }

    exit() {
        this.app.showMainMenu();
    }

    async handleLevelEnd(success) {
        const { app } = this;

        app.stopLevel();

        if (!success) {
            const tryAgain = await showMessageBox("Mission Failed.\nTry again?", { cancel: true });

            if (tryAgain) {
                // Restart the current level, on the same map
                this.initLevel({ sameMap: true });
            } else {
                app.showMainMenu();
            }

            return;
        }

        const moreLevels = this.currentLevel < levels.singleplayer.length - 1;

        if (moreLevels) {
            await showMessageBox("Mission Accomplished.");

            // Start the next level, on a new map
            this.currentLevel++;
            this.initLevel();
        } else {
            await showMessageBox("Mission Accomplished.\nThis was the last mission in the campaign.\nThank You for playing.");
            app.showMainMenu();
        }
    }
}
