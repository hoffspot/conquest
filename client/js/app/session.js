// Everything the game needs that the loading screen waits for: the 3D view, the character kit,
// and a way to start a game in a world. (This module brings in Three.js, so main.js imports it
// only once the loader has downloaded everything.)

import { loadCharacterKit } from "../characters/kit.js";
import { generateWorld } from "../core/world.js";
import { View } from "../world/view.js";
import { Game } from "./game.js";

export { readModelsFrom } from "../world/art/engine/models.js";
export { detectQuality } from "../world/view.js";

/**
 * Set up the view and load the character kit. `fetch` fetches files (the loader's copies);
 * `onProgress(label)` hears each step.
 */
export async function createSession({ canvas, quality, fetch = globalThis.fetch.bind(globalThis), onProgress = () => {} }) {
    onProgress("Starting the 3D view");

    const view = new View(canvas, { quality });

    onProgress("Unpacking the body and mapping its skin");

    const kit = await loadCharacterKit({ textureSize: view.quality.skin, fetch });

    return { view, kit };
}

/** A new game in the world of `seed`, for a hero: { name, shape, look, weapon }. */
export function createGame({ view, kit, hud, hero, seed }) {
    const world = generateWorld({ seed });

    return new Game({ view, kit, world, hero, hud });
}
