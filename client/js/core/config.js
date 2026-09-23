// Shared constants for the game simulation.

// The map is broken into square tiles of this size (20 pixels x 20 pixels)
export const GRID_SIZE = 20;

// The game logic runs at a fixed rate of one tick every 100 milliseconds (10 ticks per second).
// The multiplayer server uses the same tick length for its lockstep clock.
export const TICK_MS = 100;

// Conditional triggers are evaluated once every second of game time
export const TRIGGER_CHECK_INTERVAL_MS = 1000;

// The two teams in the game. Blue is always the first sprite row, green the second.
export const TEAMS = Object.freeze(["blue", "green"]);

// Entity categories. The strings double as the image folder names (images/<type>/<name>.png).
export const ENTITY_TYPES = Object.freeze(["buildings", "vehicles", "aircraft", "terrain", "bullets"]);
