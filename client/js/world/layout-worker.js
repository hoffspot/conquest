// Lays settlements out off the page's thread (layouts.js): given a place's id and what laying it
// out takes (core/settlements.js specOf), sends back its layout (core/setpieces/town.js). And
// works a dungeon's levels out: given what it's made from (`dungeon`: { key, seed, theme, tier,
// generation }), sends back the dungeon (core/dungeons/build.js buildDungeon's) with what it was
// made from. The dungeon builder is loaded the first time one's asked for, not before.

import { layoutTown } from "../core/setpieces/town.js";

let builder = null;

self.onmessage = async ({ data: { id, spec, dungeon } }) => {
    if (dungeon) {
        builder ??= import("../core/dungeons/build.js");

        const { buildDungeon } = await builder;

        self.postMessage({ from: dungeon, dungeon: buildDungeon({ seed: dungeon.seed, theme: dungeon.theme, tier: dungeon.tier, generation: dungeon.generation }) });

        return;
    }

    self.postMessage({ id, spec, town: layoutTown(spec) });
};
