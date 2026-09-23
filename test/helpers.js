import { Game } from "../client/js/core/game.js";

/** Parse a grid from strings: "#" is obstructed, anything else is passable. */
export function parseGrid(rows) {
    return rows.map((row) => [...row].map((cell) => (cell === "#" ? 1 : 0)));
}

/** A minimal level on the plains map with the given items and triggers. */
export function makeLevel({ items = [], triggers = [], cash = { blue: 0, green: 0 } } = {}) {
    return {
        name: "Test",
        mapName: "plains",
        requirements: { buildings: [], vehicles: [], aircraft: [], terrain: [] },
        cash,
        items,
        triggers,
    };
}

/** Create a game with a test level loaded. */
export function makeGame(levelOptions, { team = "blue" } = {}) {
    const game = new Game();

    game.loadLevel(makeLevel(levelOptions), { team });

    return game;
}

/** Run the game for a number of ticks, or until stop() returns true. Returns the number of ticks run. */
export function runTicks(game, ticks, stop = () => false) {
    for (let tick = 1; tick <= ticks; tick++) {
        game.update();

        if (stop()) {
            return tick;
        }
    }

    return ticks;
}

/** A compact, comparable snapshot of the simulation state. */
export function snapshot(game) {
    return JSON.stringify({
        tick: game.tick,
        cash: game.cash,
        items: game.items.map((item) => [item.uid, item.type, item.name, item.team, item.x, item.y, item.life, item.direction, item.action, item.orders.type]),
    });
}
