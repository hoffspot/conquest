// What's built round the player, out to the far land's edge, as it's seen from afar (shapes.js):
// every settlement in reach laid out as it is when the player comes to it (setpieces/town.js), the
// nearer and the bigger the more of it, and the peoples' great places. Pure: worked out in a
// worker (silhouette-worker.js).

import { layoutTown } from "../../core/setpieces/town.js";
import { squareOf, waysOut } from "../../core/settlements.js";
import { restingOf, siteSize } from "../../core/sites.js";
import { heightAt } from "../../core/terrain/height.js";
import { settlementShapes, Shapes, siteShapes } from "./shapes.js";

/**
 * How far off each kind of settlement is seen (metres: its middle from the player; capitals and
 * cities as far as the far land reaches), and from how far only its bigger buildings are.
 */
export const SILHOUETTES = Object.freeze({
    reach: { capital: Infinity, city: Infinity, town: 2000, village: 1200, hamlet: 700, farmstead: 600 },
    big: 900,
});

/**
 * The shapes of what's built within `reach` metres of (x, z): settlements nearest first (laid out
 * as needed, kept in `layouts` by the place's id; no more than `budget` ms spent laying them out,
 * the rest left till asked again: `done` says whether they all were), then the peoples' great
 * places (where `settled` has a site's spot, { x, y, facing } by its id, there; elsewhere in the
 * middle of its cell). The start town (`start`: { id, pieces, origin }) is laid out as the game
 * laid it out, not as its place would be.
 */
export function gatherSilhouettes(plan, { x, z, reach, settled = new Map(), layouts = new Map(), budget = Infinity, clock = () => 0, start = null }) {
    const shapes = new Shapes();
    const heightOf = (px, pz) => heightAt(plan, px, pz);
    const started = clock();
    let done = true;

    const places = plan.places
        .map((place) => ({ place, distance: Math.hypot(place.at[0] - x, place.at[1] - z) }))
        .filter(({ place, distance }) => distance < Math.min(reach, SILHOUETTES.reach[place.kind] ?? 0))
        .sort((a, b) => a.distance - b.distance);

    if (start) {
        layouts.set(start.id, start.pieces);
    }

    for (const { place, distance } of places) {
        if (!layouts.has(place.id)) {
            if (clock() - started > budget) {
                done = false;

                continue;
            }

            layouts.set(place.id, layoutTown({ seed: place.seed, kind: place.kind, exits: waysOut(plan, place), people: place.race ?? "human" }).pieces);
        }

        settlementShapes(shapes, { pieces: layouts.get(place.id), people: place.race ?? "human", origin: place.id === start?.id ? start.origin : squareOf(place).at, heightOf, big: distance > SILHOUETTES.big });
    }

    for (const site of plan.sites) {
        const size = siteSize(site);
        const spot = settled.get(site.id) ?? { x: site.at[0], y: site.at[1], facing: 0 };

        if (!size || Math.hypot(spot.x - x, spot.y - z) > reach) {
            continue;
        }

        siteShapes(shapes, { kind: site.kind, people: site.race, seed: site.seed, form: restingOf(plan, site).form, x: spot.x, z: spot.y, facing: spot.facing, w: size[0] ?? size.w, h: size[1] ?? size.h, heightOf });
    }

    return { shapes, done };
}
