const $ = (id) => document.getElementById(id);

/**
 * The buttons floating over the map: menu, chat, select all combat units, deselect, and
 * confirm/cancel while placing a building. They make the game fully playable on a touch screen,
 * which has no keyboard shortcuts or right mouse button.
 */
export class Hud {
    #state = {};

    constructor({ app }) {
        this.app = app;
        this.buttons = {
            menu: $("menubutton"),
            chat: $("chatbutton"),
            selectArmy: $("selectarmybutton"),
            deselect: $("deselectbutton"),
            place: $("placebutton"),
            cancelPlace: $("cancelplacebutton"),
        };

        const { input, game, sidebar } = app;

        this.buttons.menu.addEventListener("click", () => app.openPauseMenu());
        this.buttons.chat.addEventListener("click", () => app.showChat());
        this.buttons.selectArmy.addEventListener("click", () => input.selectArmy());
        this.buttons.deselect.addEventListener("click", () => game.clearSelection());
        this.buttons.place.addEventListener("click", () => input.confirmPlacement());
        this.buttons.cancelPlace.addEventListener("click", () => sidebar.cancelDeployingBuilding());
    }

    // Show only the buttons that make sense right now; called every frame
    update() {
        const { game, input, sidebar } = this.app;
        const placing = Boolean(sidebar.deployBuilding);

        this.#set("chat", "hidden", this.app.activeMode !== this.app.multiplayer);
        this.#set("selectArmy", "hidden", placing);
        this.#set("selectArmy", "disabled", !input.hasArmy());
        this.#set("deselect", "hidden", placing || game.selectedItems.length === 0);
        this.#set("place", "hidden", !placing);
        this.#set("place", "disabled", !sidebar.canDeployBuilding);
        this.#set("cancelPlace", "hidden", !placing);
    }

    // Only touch the DOM when something actually changes
    #set(button, property, value) {
        const key = `${button}.${property}`;

        if (this.#state[key] !== value) {
            this.#state[key] = value;
            this.buttons[button][property] = value;
        }
    }
}
