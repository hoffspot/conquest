// The world a town is played in: a town (setpieces/town.js) in the middle of fields, on a grid of
// 1-metre squares that characters stand on and move across. A character fills one square, so the
// eight squares round it are within arm's reach. (In the game the town is set into the whole
// world: overworld.js.)
//
// The town is laid out in metres: a market place near the middle, streets wandering out from it
// (the ways out to the world's roads), lanes curving round between them, houses along them turned
// to face their streets, the tavern, church and smithy facing the market. Each piece's art
// (world/town3d.js) is built by the art kits to the same measure: a plot of the kits is PLOT
// metres, 20 of the art's world pixels, a fifth of a metre each.
//
// Fields surround the town, with trees dotted about and the town's streets carrying on as roads to
// the edge of the map. The player starts in the market place. An orc starts in the north-west
// corner and patrols south along the west side, halfway down the map and back.
//
// Every square says whether it can be walked on (`blocked`) and, apart from that, whether it can be
// seen through (`opaque`): houses, the town's landmarks and trees are taller than anyone's eyes and
// hide what's behind them; a well, barrels, crates or a cart are in the way but can be seen over.
// Whatever depends on seeing (the orc spotting the player, shooting and casting at someone, the
// folk noticing them) looks through the squares that aren't opaque.
//
// The tavern can be gone into: it faces the market place (or failing that a street), whichever
// way that is, the squares just in front of its door are clear, and its door leads to the taproom,
// a map of its own (interiors.js), with stairs from there to the floor above. The world's `maps`
// are the town and those floors; its `links` join them.
//
// Everything comes from one seed, so a saved character always comes back to the same town.

import { nearestFree } from "./grid.js";
import { entranceOf, openEntrances } from "./insides.js";
import { MAP_ORIGINS, tavernFloors, tavernFolk } from "./interiors.js";
import { WENCHES } from "./lore/taverns.js";
import { namePeople } from "./names.js";
import { createRandom } from "./random.js";
import { GROUND, homeTree, landmarkKey, PLOT, TREE_VARIANTS } from "./setpieces/pieces.js";
import { layoutTown } from "./setpieces/town.js";

export { PLOT };

// Trees in the fields: about one for every this many square metres
const TREE_SPACING = 70;

// No trees this close (in metres) to a road, to the orc's patrol, to where characters start, or
// to the town's houses (beyond its radius)
const CLEAR_OF_ROADS = 2;
const CLEAR_OF_PATROL = 4;
const CLEAR_OF_SPAWNS = 5;
const CLEAR_OF_TOWN = 6;

// The orc starts this far (metres) in from the map's north-west corner
const CORNER = 3;

/**
 * The town's pieces that are in the way but low enough to see over (by their keys: props, such
 * as a well, barrels or a cart). Everything else standing in the way (houses, landmarks, trees,
 * walls and towers) hides what's behind it.
 */
export const SEE_OVER = /^prop-/;

/**
 * Generate the world for a seed, a settlement of a kind (setpieces/town.js SETTLEMENT_KINDS) whose
 * main streets leave the ways `exits` says (angles: 0 east, π/2 south), laid out and built as
 * `people` builds (town.js PEOPLE_TOWNS): { seed, width, height
 * (squares, 1 m each), plot, origin (where the town's layout starts, in metres: 0, its layout
 * being the whole map), town (its layout: town.js), blocked[y][x] (1 where characters can't go),
 * opaque[y][x] (1 where nothing behind can be seen: see SEE_OVER), ground[y][x] (GROUND kinds),
 * trees (in the fields: [{ x, y, variant }], trunks at square corners, in metres), spawns:
 * { player, orc } ([x, y] squares), patrol ([[x, y], [x, y]] squares), tavern (tavernOf, or null),
 * maps ({ town, taproom, upstairs }: each { id, width, height, blocked, opaque, ground, origin },
 * the floors as interiors.js reads them), links ([{ id, kind, ends: [{ map, squares, arrive,
 * facing }, ...] }]: the tavern's door and stairs), folk (the tavern's: interiors.js tavernFolk,
 * each named: names.js; none without a tavern) }.
 */
export function generateWorld({ seed = 1, kind = "town", exits = null, people = "human" } = {}) {
    const random = createRandom(seed);
    const laid = layoutTown({ seed: random.seed(), kind, exits, people });

    // (The town's first tavern is Wenches and Ale, whatever else the layout would call it)
    const first = laid.pieces.find(({ key }) => key === landmarkKey("tavern"));
    const town = { ...laid, pieces: laid.pieces.map((piece) => (piece === first ? { ...piece, tavern: WENCHES } : piece)) };
    const { width, height } = town;
    const blocked = town.blocked.map((row) => Uint8Array.from(row));
    const opaque = town.opaque.map((row) => Uint8Array.from(row));
    const ground = town.ground.map((row) => Uint8Array.from(row));
    const [cx, cy] = town.centre;
    const reach = town.radius + CLEAR_OF_TOWN;
    const inTown = (x, y) => (x - cx) * (x - cx) + (y - cy) * (y - cy) < reach * reach;
    const street = (x, y) => ground[y][x] === GROUND.road || ground[y][x] === GROUND.cobbles;

    // Where characters start: the middle of the market place, and the north-west corner
    const player = nearestFree(blocked, [Math.floor(cx), Math.floor(cy)]);
    const orcStart = [CORNER, CORNER];
    const patrol = [orcStart, [CORNER, Math.floor(height / 2)]];

    // Trees in the fields, clear of the roads, the orc's patrol, where characters start and the
    // town
    const trees = [];
    const fields = width * height - Math.PI * reach * reach;
    const clear = (x, y) => {
        for (let dy = -CLEAR_OF_ROADS; dy <= CLEAR_OF_ROADS; dy++) {
            for (let dx = -CLEAR_OF_ROADS; dx <= CLEAR_OF_ROADS; dx++) {
                const [tx, ty] = [x + dx, y + dy];

                if (tx < 0 || ty < 0 || tx >= width || ty >= height || street(tx, ty) || blocked[ty][tx]) {
                    return false;
                }
            }
        }

        const nearPatrol = x <= patrol[0][0] + CLEAR_OF_PATROL && y <= patrol[1][1] + CLEAR_OF_PATROL;
        const nearSpawn = [player, orcStart].some(([sx, sy]) => Math.abs(sx - x) <= CLEAR_OF_SPAWNS && Math.abs(sy - y) <= CLEAR_OF_SPAWNS);

        return !nearPatrol && !nearSpawn && !inTown(x, y) && !inTown(x - 1, y - 1);
    };

    for (let placed = 0, tries = 0; placed < fields / TREE_SPACING && tries < fields; tries++) {
        const x = random.int(1, width - 2);
        const y = random.int(1, height - 2);

        if (clear(x, y) && clear(x - 1, y - 1)) {
            // The trunk stands where four squares meet, and fills them (and hides what's behind)
            for (const [bx, by] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
                blocked[by][bx] = 1;
                opaque[by][bx] = 1;
            }

            trees.push({ x, y, variant: homeTree(people, random.int(0, TREE_VARIANTS - 1)) });
            placed++;
        }
    }

    // The way up to the doors of the buildings that can be gone into; the tavern's door, and the
    // floors it leads to
    openEntrances(town.pieces, blocked, opaque, 0, town);

    const tavern = tavernOf(town);
    const floors = tavernFloors();
    const maps = { town: { id: "town", name: "Town", width, height, blocked, opaque, ground, origin: MAP_ORIGINS.town } };
    const links = [];

    if (tavern) {
        for (const [x, y] of tavern.clear) {
            blocked[y][x] = 0;
            opaque[y][x] = 0;
        }

        maps.taproom = floors.taproom;
        maps.upstairs = floors.upstairs;

        // (Built and dressed inside as its people build: interiors3d.js)
        if (people !== "human") {
            maps.taproom.people = people;
            maps.upstairs.people = people;
        }

        // Coming out, just clear of the door, turned back to face it (so it's in view to tap, and
        // a tap round the player isn't on it)
        const back = tavern.facing > 0 ? tavern.facing - Math.PI : tavern.facing + Math.PI;

        links.push({ id: "tavern-door", kind: "door", ends: [{ map: "town", squares: tavern.front, arrive: tavern.outside, facing: back }, floors.door] }, floors.stairs);
    }

    return {
        seed,
        width,
        height,
        plot: PLOT,
        origin: 0,
        town,
        blocked,
        opaque,
        ground,
        trees,
        spawns: { player, orc: nearestFree(blocked, orcStart) },
        patrol: patrol.map((point) => nearestFree(blocked, point)),
        tavern,
        maps,
        links,
        folk: !tavern ? [] : people === "human" ? namePeople(tavernFolk(), seed) : namePeople(tavernFolk(), seed, people).map((one) => ({ ...one, people })),
    };
}

/**
 * Where the tavern stands and which way it faces (the way the town laid it out: towards the market
 * place, or a street): { x, y (its north-west corner as it would be facing south, metres), size
 * (metres), facing (radians, as characters face: 0 south), door: { x, z (metres, the middle of its
 * threshold), facing, width, height, floor }, front (the two squares at the door, inside the
 * tavern), outside (the square to come out onto), clear (the squares to clear) }, or null if the
 * town has no tavern: its door where the art puts it, 1.8 metres in from its front (insides.js
 * entranceOf). The town's pieces are placed from `origin` (metres: [x, y], or a number for both).
 */
export function tavernOf(town, origin = 0) {
    const piece = town.pieces.find(({ key }) => key === landmarkKey("tavern"));

    if (!piece) {
        return null;
    }

    const { corner, size, door, front, outside, clear } = entranceOf(piece, origin);

    return { x: corner[0], y: corner[1], size: size[0], facing: piece.facing, door, front, outside, clear };
}

// (Where to find the free square nearest a square, as before)
export { nearestFree };
