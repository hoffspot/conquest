// Makes characters' lower-detail meshes off the page's thread (lod.js Lods): sent a mesh's
// triangles, positions and texture coordinates, it sends back its lower-detail triangles.

import { lowerDetail } from "./lod.js";

self.onmessage = async ({ data: { id, indices, positions, uvs } }) => {
    const lower = await lowerDetail(indices, positions, uvs);

    self.postMessage({ id, lower }, [lower.buffer]);
};
