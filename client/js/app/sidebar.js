const CONSTRUCTABLE_TYPES = ["buildings", "vehicles", "aircraft"];

/**
 * The sidebar: shows the player's cash and the construction buttons.
 * Buildings are ordered from a selected base, vehicles and aircraft from a selected starport.
 */
export class Sidebar {
    // Cache the displayed cash value to avoid unnecessary DOM updates
    #displayedCash;

    constructor({ game, container, cashDisplay }) {
        this.game = game;
        this.cashDisplay = cashDisplay;
        this.buttons = new Map();
        this.constructables = {};

        // Details of the building being placed, if the player is placing one
        this.deployBuilding = undefined;
        this.placementGrid = undefined;
        this.canDeployBuilding = false;

        // Each button's data-name is the name of the item it constructs
        for (const button of container.querySelectorAll("button[data-name]")) {
            this.buttons.set(button.dataset.name, button);
            button.addEventListener("click", () => this.#onButtonClick(button.dataset.name));
        }
    }

    // Work out which items the player may construct in the current level
    initRequirementsForLevel(level) {
        const game = this.game;

        this.constructables = {};
        this.cancelDeployingBuilding();
        this.#displayedCash = undefined;

        for (const type of CONSTRUCTABLE_TYPES) {
            for (const spec of game.getSpecsOfType(type)) {
                if (spec.canConstruct) {
                    this.constructables[spec.name] = {
                        name: spec.name,
                        type,
                        permitted: level.requirements[type].includes(spec.name),
                        cost: spec.cost,
                        constructedIn: type === "buildings" ? "base" : "starport",
                    };
                }
            }
        }

        this.update();
    }

    // Called after every game tick
    update(pointerGridX, pointerGridY) {
        this.updateCash(this.game.cash[this.game.team] ?? 0);

        // Enable buttons if player has sufficient cash and has the correct building selected
        this.enableSidebarButtons();

        // If sidebar is in deployBuilding mode, check whether building can be placed
        if (this.deployBuilding && pointerGridX !== undefined) {
            this.checkBuildingPlacement(pointerGridX, pointerGridY);
        }
    }

    updateCash(cash) {
        if (this.#displayedCash !== cash) {
            this.#displayedCash = cash;
            // Display the cash amount with thousands separators
            this.cashDisplay.textContent = cash.toLocaleString();
        }
    }

    // A healthy, idle base or starport from the player's team among the selected items
    #findSelectedBuilding(name) {
        const game = this.game;

        return game.selectedItems.findLast((item) => item.name === name && item.team === game.team
            && item.lifeCode === "healthy" && item.action === "stand");
    }

    enableSidebarButtons() {
        const cashBalance = this.game.cash[this.game.team] ?? 0;
        const baseSelected = Boolean(this.#findSelectedBuilding("base"));
        const starportSelected = Boolean(this.#findSelectedBuilding("starport"));

        for (const [name, button] of this.buttons) {
            const item = this.constructables[name];

            if (!item) {
                button.disabled = true;
                continue;
            }

            // Does the player have sufficient money, and the appropriate building selected?
            const sufficientMoney = cashBalance >= item.cost;
            const correctBuilding = (baseSelected && item.constructedIn === "base")
                || (starportSelected && item.constructedIn === "starport");

            button.disabled = !(item.permitted && sufficientMoney && correctBuilding);
        }
    }

    #onButtonClick(name) {
        const details = this.constructables[name];

        if (!details) {
            return;
        }

        if (details.type === "buildings") {
            this.deployBuilding = details;
        } else {
            this.constructInStarport(details);
        }
    }

    constructInStarport(details) {
        // Tell a selected starport to make the unit
        const starport = this.#findSelectedBuilding("starport");

        if (starport) {
            this.game.sendCommand([starport.uid], { type: "construct-unit", details: { type: details.type, name: details.name } });
        }
    }

    checkBuildingPlacement(gridX, gridY) {
        const game = this.game;

        // Buildings can only be placed on tiles that are buildable and not covered by fog
        const { canDeployBuilding, placementGrid } = game.checkBuildingPlacement(this.deployBuilding.name, gridX, gridY,
            (x, y) => game.fog.isTileFogged(x, y));

        this.placementGrid = placementGrid;
        this.canDeployBuilding = canDeployBuilding;
    }

    cancelDeployingBuilding() {
        this.deployBuilding = undefined;
        this.placementGrid = undefined;
        this.canDeployBuilding = false;
    }

    finishDeployingBuilding(gridX, gridY) {
        // Tell a selected base to construct the building
        const base = this.#findSelectedBuilding("base");

        if (base) {
            const details = { name: this.deployBuilding.name, type: "buildings", x: gridX, y: gridY };

            this.game.sendCommand([base.uid], { type: "construct-building", details });
        }

        this.cancelDeployingBuilding();
    }
}
