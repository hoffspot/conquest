// Lays settlements out off the page's thread (layouts.js): given a place's id and what laying it
// out takes (core/settlements.js specOf), sends back its layout (core/setpieces/town.js). And
// works a dungeon's levels out: given what it's made from (`dungeon`: { key, seed, theme, tier,
// generation }), sends back the dungeon (core/dungeons/build.js buildDungeon's) with what it was
// made from, or none if it can't be worked out here (a theme this thread hasn't heard of). The
// dungeon builder is loaded the first time one's asked for, not before.

import { layoutTown } from "../core/setpieces/town.js";

let builder = null;

self.onmessage = async ({ data: { id, spec, dungeon } }) => {
    if (dungeon) {
        builder ??= import("../core/dungeons/build.js");

        const { buildDungeon } = await builder;
        let built;

        // (One that can't be worked out here is answered with none, and made where it's wanted
        // as it always was: made ahead, it's a favour, and a worker that throws is let go of with
        // every settlement it had still to lay out)
        try {
            built = buildDungeon({ seed: dungeon.seed, theme: dungeon.theme, tier: dungeon.tier, generation: dungeon.generation });
        } catch {
            built = null;
        }

        self.postMessage({ from: dungeon, dungeon: built });

        return;
    }

    self.postMessage({ id, spec, town: layoutTown(spec) });
};
