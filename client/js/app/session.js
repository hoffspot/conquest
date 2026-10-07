// Everything the game needs that the loading screen waits for: the 3D view, the character kit,
// and a way to start a game in a world. (This module brings in Three.js, so main.js imports it
// only once the loader has downloaded everything.)

import { Sound } from "../audio/sound.js";
import { loadCharacterKit } from "../characters/kit.js";
import { Host } from "../core/host.js";
import { buildWorld } from "../core/overworld.js";
import { View } from "../world/view.js";
import { Game } from "./game.js";

export { readModelsFrom } from "../world/art/engine/models.js";
export { detectQuality, QUALITY } from "../world/view.js";

/**
 * Set up the view, the sound (on or off: `sound`, with `volumes` { effects, environment, music })
 * and load the character kit. `fetch` fetches files (the loader's copies); `onProgress(label)`
 * hears each step.
 */
export async function createSession({ canvas, quality, sound = true, volumes, fetch = globalThis.fetch.bind(globalThis), onProgress = () => {} }) {
    onProgress("Starting the 3D view");

    const view = new View(canvas, { quality, far: true });

    onProgress("Unpacking the body and mapping its skin");

    // (Its skin atlas worked out, and the skins of those built a step at a time painted, off the
    // page's thread: characters/skins.js. The title needn't wait for it: making a character or
    // playing does, `kit.ready`)
    const kit = await loadCharacterKit({ textureSize: view.quality.skin, fetch, elsewhere: true });

    const audio = new Sound({ enabled: sound, volumes });

    // The music and sounds are made while the game loads (and after: nothing waits for them)
    audio.prepare();

    return { view, kit, sound: audio };
}

/**
 * A new game in the world of `seed` (the whole world, laid out from its plan, with the town set
 * in where one of the hero's people starts), for a hero: { name, shape, look, weapon, race } (and what's kept of it: its
 * talks and what it's found, and what it's grown into and carries, and who hears of them; the
 * world's war as it was kept, and who hears of it; who opens the world map; where they've
 * pinned on it, and who hears of that; and where they were and how, when the game last stopped).
 */
export function createGame({ view, kit, sound, hud, hero, seed, talks, onTalk, explored, onExplore, onWorldMap, war, onWar, progress, onProgress, standing, onStanding, followers, onFollowers, wheels, onWheels, pin, onPin, place = null, vitals = null }) {
    const world = buildWorld({ seed, race: hero.race ?? "human" });

    return new Game({ view, kit, sound, world, hero, hud, talks, onTalk, explored, onExplore, onWorldMap, war, onWar, progress, onProgress, standing, onStanding, followers, onFollowers, wheels, onWheels, pin, onPin, place, vitals });
}

/**
 * A game joined to a world someone else hosts (docs/WAR.md M11), from their welcome (core/netplay.js
 * Joining's: the world's seed and whose people's town it's set in, and a snapshot of it): the world
 * made again from its seed, the host's copy of it restored, and played on as `joining` hears the
 * host play it. The rest as createGame (what's kept of the character, and who hears of it).
 */
export function createJoinedGame({ view, kit, sound, hud, hero, welcome, joining, talks, onTalk, onWorldMap, progress, onProgress, standing, onStanding, followers, onFollowers, wheels, onWheels }) {
    const world = buildWorld({ seed: welcome.seed, race: welcome.race });
    const host = Host.restore(world, welcome.snapshot);

    joining.attach(host);

    return new Game({ view, kit, sound, world, hero, hud, host, me: welcome.id, remote: joining, talks, onTalk, onWorldMap, progress, onProgress, standing, onStanding, followers, onFollowers, wheels, onWheels });
}
