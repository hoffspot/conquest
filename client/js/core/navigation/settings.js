// The navigation meshes' measures (navigation.js): the tiles, Recast's voxels, who walks them and
// how each kind of ground is walked. Nothing else is imported here, so a worker baking tiles
// (world/navworker.js) needs only this and bake.js.
//
// There are two kinds of mesh. The overworld's (OVERWORLD: the named exports below are its) is
// baked from the terrain, in voxels half a metre across, and keeps walkers half a metre from
// walls. A map of squares on its own (a building's floor, ROOMS: interiors.js, insides.js, a
// test's rows) is flat, and its doors and passages can be a square wide, so it's baked in voxels
// a tenth of a metre across and keeps walkers just their body's width (0.3 m) from walls.

/** A tile's side (metres): the world's 8,192 m are 256 tiles a side. */
export const TILE = 32;

/** Recast's voxels: their side and their height (metres). */
export const CELL = 0.5;
export const CELL_HEIGHT = 0.25;

/** Who walks the meshes: their radius, height and the step they can climb (metres). */
export const AGENT = Object.freeze({ radius: 0.5, height: 2, climb: 0.5 });

/** How far round a tile it takes in (metres): Recast's border, the agent's radius and three voxels. */
export const BORDER = (AGENT.radius / CELL + 3) * CELL;

/**
 * Each kind of mesh's measures (metres): its tiles' side, its voxels' side and height, its
 * walkers' radius, height and climb, the border its tiles take in, how far (in voxels) its
 * polygons' edges may stray from the voxels' (Recast's simplification error), and the sides of the
 * smallest islands kept and of the smallest regions not merged into their neighbours.
 */
export const OVERWORLD = Object.freeze({ tile: TILE, cell: CELL, cellHeight: CELL_HEIGHT, ...AGENT, border: BORDER, simplify: 1.3, island: 4, merge: 10 });
export const ROOMS = Object.freeze({ tile: 32, cell: 0.1, cellHeight: 0.1, radius: 0.3, height: 2, climb: 0.2, border: 0.6, simplify: 0.5, island: 0.5, merge: 2 });

/**
 * How each kind of ground is walked (Recast's area ids, kept in the mesh's polygons): 0 is none
 * (not walked at all). COSTS are how far a metre of each counts for, finding a way.
 */
export const AREA = Object.freeze({ ground: 1, road: 2, steep: 3, ford: 4, deck: 5 });
export const COSTS = Object.freeze({ [AREA.ground]: 1, [AREA.road]: 0.75, [AREA.steep]: 2, [AREA.ford]: 3, [AREA.deck]: 0.75 });

/** The deepest water walked through (metres): a ford (and, where it runs, slow enough: waters.js WADE). */
export const FORD = 0.5;
