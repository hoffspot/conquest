import { levels } from "../core/data/levels.js";
import { showMessageBox, showMissionBriefing, switchToScreen } from "./ui.js";

/** The single player campaign: a sequence of missions with briefings between them. */
export class SinglePlayer {
    currentLevel = 0;

    constructor(app) {
        this.app = app;
        this.enterMissionButton = document.getElementById("entermission");
    }

    // Begin single player campaign with the first level
    start() {
        this.currentLevel = 0;
        this.initLevel();
    }

    async initLevel() {
        const { app } = this;
        const level = levels.singleplayer[this.currentLevel];

        // Don't allow player to enter mission until all assets for the level are loaded
        this.enterMissionButton.disabled = true;

        app.game.commandHandler = undefined;
        app.game.loadLevel(level, { team: "blue", mode: "singleplayer" });

        // Update the mission briefing text and show briefing screen
        switchToScreen("missionbriefingscreen");
        showMissionBriefing(level.briefing);

        try {
            await app.prepareLevel(level, level.startX, level.startY);
        } catch (error) {
            console.error(error);
            await showMessageBox(`Could not load the mission.\n${error.message}`);
            app.showMainMenu();

            return;
        }

        this.enterMissionButton.disabled = false;
        this.enterMissionButton.focus();
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
                // Restart the current level
                this.initLevel();
            } else {
                app.showMainMenu();
            }

            return;
        }

        const moreLevels = this.currentLevel < levels.singleplayer.length - 1;

        if (moreLevels) {
            await showMessageBox("Mission Accomplished.");

            // Start the next level
            this.currentLevel++;
            this.initLevel();
        } else {
            await showMessageBox("Mission Accomplished.\nThis was the last mission in the campaign.\nThank You for playing.");
            app.showMainMenu();
        }
    }
}
