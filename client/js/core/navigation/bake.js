// Baking a navigation tile (Recast): the triangles tileInput gives, made voxels, then the walkable
// surface found, cut back from walls by the walker's radius, split into regions and traced into
// polygons, each keeping its triangles' area (AREA). Gives Detour's tile data: bytes, the same for
// the same triangles on every machine (the WebAssembly is the same everywhere, and nothing in it
// is left to chance), to add to a NavMesh or send from a worker.

import { AGENT, BORDER, CELL, CELL_HEIGHT, TILE } from "./settings.js";

/** Recast's settings, in voxels where it counts in them. */
export const SETTINGS = Object.freeze({
    walkableHeight: Math.ceil(AGENT.height / CELL_HEIGHT),
    walkableClimb: Math.floor(AGENT.climb / CELL_HEIGHT),
    walkableRadius: Math.ceil(AGENT.radius / CELL),
    tileSize: TILE / CELL,
    border: BORDER / CELL,
    // (Islands smaller than this many voxels are dropped, and regions smaller than the next merged)
    minRegionArea: 8 * 8,
    mergeRegionArea: 20 * 20,
    maxSimplificationError: 1.3,
    maxEdgeLength: 12 / CELL,
    maxVertsPerPoly: 6,
    detailSampleDistance: 6 * CELL,
    detailSampleMaxError: 1 * CELL_HEIGHT,
});

/** Every polygon's flag (Detour's): walkable. */
export const WALK = 1;

/**
 * Bake a tile (`recast`: loadRecast's module; `input`: tileInput's) at tile (tx, ty): Detour's
 * tile data (a Uint8Array), or null if there's nothing to walk in it.
 */
export function bakeTile(recast, input, tx, ty) {
    const { positions, indices, areas, bmin, bmax } = input;
    const {
        RecastBuildContext, VerticesArray, TrianglesArray, TriangleAreasArray, allocHeightfield, createHeightfield, rasterizeTriangles,
        filterLowHangingWalkableObstacles, filterLedgeSpans, filterWalkableLowHeightSpans, allocCompactHeightfield, buildCompactHeightfield,
        freeHeightfield, erodeWalkableArea, buildDistanceField, buildRegions, allocContourSet, buildContours, allocPolyMesh, buildPolyMesh,
        allocPolyMeshDetail, buildPolyMeshDetail, freeCompactHeightfield, freeContourSet, freePolyMesh, freePolyMeshDetail,
        NavMeshCreateParams, createNavMeshData, Recast,
    } = recast;
    const s = SETTINGS;
    const width = s.tileSize + 2 * s.border;
    const context = new RecastBuildContext();
    const vertices = new VerticesArray();
    const triangles = new TrianglesArray();
    const kinds = new TriangleAreasArray();
    const freed = [];

    vertices.copy(positions);
    triangles.copy(indices);
    kinds.copy(areas);

    try {
        // Voxels: the triangles rasterised into columns of spans, each with its area
        const heightfield = allocHeightfield();

        freed.push(() => freeHeightfield(heightfield));

        if (!createHeightfield(context, heightfield, width, width, bmin, bmax, CELL, CELL_HEIGHT)) {
            throw new Error("Recast couldn't make the heightfield");
        }

        if (!rasterizeTriangles(context, vertices, positions.length / 3, triangles, kinds, areas.length, heightfield, s.walkableClimb)) {
            throw new Error("Recast couldn't rasterise the tile");
        }

        // Where someone can stand: not under anything too low, not on a ledge's edge, and
        // stepping up no more than they can climb
        filterLowHangingWalkableObstacles(context, s.walkableClimb, heightfield);
        filterLedgeSpans(context, s.walkableHeight, s.walkableClimb, heightfield);
        filterWalkableLowHeightSpans(context, s.walkableHeight, heightfield);

        const compact = allocCompactHeightfield();

        freed.push(() => freeCompactHeightfield(compact));

        if (!buildCompactHeightfield(context, s.walkableHeight, s.walkableClimb, heightfield, compact)) {
            throw new Error("Recast couldn't compact the heightfield");
        }

        // Kept the walker's radius from every wall, then split into regions (by area too)
        erodeWalkableArea(context, s.walkableRadius, compact);
        buildDistanceField(context, compact);
        buildRegions(context, compact, s.border, s.minRegionArea, s.mergeRegionArea);

        const contours = allocContourSet();

        freed.push(() => freeContourSet(contours));
        buildContours(context, compact, s.maxSimplificationError, s.maxEdgeLength, contours, Recast.RC_CONTOUR_TESS_WALL_EDGES);

        const mesh = allocPolyMesh();

        freed.push(() => freePolyMesh(mesh));

        if (!buildPolyMesh(context, contours, s.maxVertsPerPoly, mesh)) {
            throw new Error("Recast couldn't make the polygons");
        }

        if (mesh.npolys() === 0) {
            return null;
        }

        const detail = allocPolyMeshDetail();

        freed.push(() => freePolyMeshDetail(detail));

        if (!buildPolyMeshDetail(context, mesh, compact, s.detailSampleDistance, s.detailSampleMaxError, detail)) {
            throw new Error("Recast couldn't make the detail mesh");
        }

        for (let p = 0; p < mesh.npolys(); p++) {
            mesh.setFlags(p, WALK);
        }

        const params = new NavMeshCreateParams();

        params.setPolyMeshCreateParams(mesh);
        params.setPolyMeshDetailCreateParams(detail);
        params.setWalkableHeight(s.walkableHeight * CELL_HEIGHT);
        params.setWalkableRadius(s.walkableRadius * CELL);
        params.setWalkableClimb(s.walkableClimb * CELL_HEIGHT);
        params.setCellSize(CELL);
        params.setCellHeight(CELL_HEIGHT);
        params.setBuildBvTree(true);
        params.setTileX(tx);
        params.setTileY(ty);

        const { success, navMeshData } = createNavMeshData(params);

        if (!success) {
            throw new Error("Detour couldn't make the tile's data");
        }

        const data = navMeshData.toTypedArray();

        navMeshData.destroy();

        return data;
    } finally {
        for (const free of freed.reverse()) {
            free();
        }

        vertices.destroy();
        triangles.destroy();
        kinds.destroy();
        recast.Raw.destroy(context.raw);
    }
}
