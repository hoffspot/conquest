// Baking a navigation tile (Recast): the triangles tileInput gives, made voxels, then the walkable
// surface found, cut back from walls by the walker's radius, split into regions and traced into
// polygons, each keeping its triangles' area (AREA). Gives Detour's tile data: bytes, the same for
// the same triangles on every machine (the WebAssembly is the same everywhere, and nothing in it
// is left to chance), to add to a NavMesh or send from a worker.

import { OVERWORLD } from "./settings.js";

// (Measures in voxels, rounded: a tenth of a metre doesn't divide exactly)
const voxels = (metres, size) => Math.round(metres / size);

/** Recast's settings for a kind of mesh (settings.js OVERWORLD, ROOMS), in voxels where it counts in them. */
export function settingsOf(measures) {
    const { cell, cellHeight } = measures;

    return {
        walkableHeight: voxels(measures.height, cellHeight),
        walkableClimb: voxels(measures.climb, cellHeight),
        walkableRadius: voxels(measures.radius, cell),
        tileSize: voxels(measures.tile, cell),
        border: voxels(measures.border, cell),
        // (Islands narrower than `island` are dropped, and regions narrower than `merge` merged)
        minRegionArea: voxels(measures.island, cell) * voxels(measures.island, cell),
        mergeRegionArea: voxels(measures.merge, cell) * voxels(measures.merge, cell),
        maxSimplificationError: measures.simplify,
        maxEdgeLength: voxels(12, cell),
        maxVertsPerPoly: 6,
        detailSampleDistance: 6 * cell,
        detailSampleMaxError: 1 * cellHeight,
    };
}

/** The overworld's settings. */
export const SETTINGS = Object.freeze(settingsOf(OVERWORLD));

/** Every polygon's flag (Detour's): walkable. */
export const WALK = 1;

/**
 * Bake a tile (`recast`: loadRecast's module; `input`: tileInput's, or squaresInput's) at tile
 * (tx, ty), for a kind of mesh (`measures`: settings.js): Detour's tile data (a Uint8Array), or
 * null if there's nothing to walk in it.
 */
export function bakeTile(recast, input, tx, ty, measures = OVERWORLD) {
    const { positions, indices, areas, bmin, bmax } = input;
    const {
        RecastBuildContext, VerticesArray, TrianglesArray, TriangleAreasArray, allocHeightfield, createHeightfield, rasterizeTriangles,
        filterLowHangingWalkableObstacles, filterLedgeSpans, filterWalkableLowHeightSpans, allocCompactHeightfield, buildCompactHeightfield,
        freeHeightfield, erodeWalkableArea, buildDistanceField, buildRegions, allocContourSet, buildContours, allocPolyMesh, buildPolyMesh,
        allocPolyMeshDetail, buildPolyMeshDetail, freeCompactHeightfield, freeContourSet, freePolyMesh, freePolyMeshDetail,
        NavMeshCreateParams, createNavMeshData, Recast,
    } = recast;
    const s = measures === OVERWORLD ? SETTINGS : settingsOf(measures);
    const { cell, cellHeight } = measures;
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

        if (!createHeightfield(context, heightfield, width, width, bmin, bmax, cell, cellHeight)) {
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
        params.setWalkableHeight(s.walkableHeight * cellHeight);
        params.setWalkableRadius(s.walkableRadius * cell);
        params.setWalkableClimb(s.walkableClimb * cellHeight);
        params.setCellSize(cell);
        params.setCellHeight(cellHeight);
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
