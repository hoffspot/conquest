// The navigation meshes' measures (navigation.js): the tiles, Recast's voxels, who walks them and
// how each kind of ground is walked. Nothing else is imported here, so a worker baking tiles
// (world/navworker.js) needs only this and bake.js.

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
 * How each kind of ground is walked (Recast's area ids, kept in the mesh's polygons): 0 is none
 * (not walked at all). COSTS are how far a metre of each counts for, finding a way.
 */
export const AREA = Object.freeze({ ground: 1, road: 2, steep: 3, ford: 4, deck: 5 });
export const COSTS = Object.freeze({ [AREA.ground]: 1, [AREA.road]: 0.75, [AREA.steep]: 2, [AREA.ford]: 3, [AREA.deck]: 0.75 });

/** The deepest water walked through (metres): a ford. */
export const FORD = 0.5;
