// node --import ./swap.mjs ...: the game's core modules swapped for the copies named in SWAP
// ("battle.js=/path/to/copy.js;weapons.js=/path/..."; BATTLE=/path alone swaps battle.js), to
// measure a change without touching the repository.
import { register } from "node:module";

const swaps = Object.fromEntries((process.env.SWAP ?? "").split(";").filter(Boolean).map((pair) => pair.split("=")));

if (process.env.BATTLE) {
    swaps["battle.js"] ??= process.env.BATTLE;
}

if (Object.keys(swaps).length) {
    register("./swap-hooks.mjs", import.meta.url, { data: { swaps } });
}
