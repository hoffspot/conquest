// Reading and writing GLB files with glTF-Transform, with every extension it knows and
// meshoptimizer's encoder and decoder (for EXT_meshopt_compression)

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

let ready = null;

/** A NodeIO that reads and writes everything the pipeline makes. */
export async function createIO() {
    ready ??= Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
    await ready;

    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        "meshopt.decoder": MeshoptDecoder,
        "meshopt.encoder": MeshoptEncoder,
    });
}

export { MeshoptEncoder, MeshoptSimplifier };
