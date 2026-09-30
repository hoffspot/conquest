// Characters small on the screen drawn with a quarter of the triangles: a second list of
// triangles over the same vertices, so their skin weights, picture, bones and everything else are
// the same, only fewer of them drawn (meshoptimizer's simplifier, keeping the texture's layout so
// its seams stay put). A soldier far off is about 40,000 triangles at 80 to 160 pixels tall: 5 to
// 20 triangles a pixel. The body's is made once for everyone; an outfit's (garments drawn all at
// once, character.js `merge`) once for everyone wearing it, as they all have the same triangles.
// They're made off the page's thread (lod-worker.js), about 20 to 30 milliseconds each on a
// desktop, and until one's there, the character's drawn in full. The simplifier (a module with its
// WebAssembly inside) is started only where it's used: in the worker, not on the page.

/**
 * How much of a mesh is drawn from afar (`share` of its triangles, give or take, and never more
 * out of place than `error`, a share of its size: a limit it's nowhere near, as the body's quarter
 * is 1.4 millimetres out at most), and when: under `far` pixels tall on the screen (drawing buffer
 * pixels), and back in full over `near`, so one at the edge doesn't flick between them.
 */
export const LOD = Object.freeze({ share: 0.25, error: 0.02, far: 140, near: 170 });

/**
 * A mesh's triangles for drawing it from afar (`indices` over `positions`, xyz, with texture
 * coordinates `uvs`, uv), about `share` of them: resolves to a list of triangles over the same
 * vertices.
 */
export async function lowerDetail(indices, positions, uvs, share = LOD.share) {
    const { MeshoptSimplifier } = await import("../../vendor/meshoptimizer-1.3.0/meshopt_simplifier.min.js");

    await MeshoptSimplifier.ready;

    const triangles = Uint32Array.from(indices);
    const target = Math.floor((triangles.length / 3) * share) * 3;
    const [lower] = MeshoptSimplifier.simplifyWithAttributes(triangles, Float32Array.from(positions), 3, Float32Array.from(uvs), 2, [1, 1], null, target, LOD.error, []);

    return lower;
}

/**
 * Lower-detail meshes, each made once (off the page's thread, where it can be) and kept, by what
 * they're of: "body", or an outfit.
 */
export class Lods {
    constructor() {
        this.made = new Map();
        this.worker = null;
        this.waiting = new Map();
        this.next = 0;
    }

    /**
     * The lower-detail triangles of `key`, resolving when they're made: `mesh` says what it is
     * ({ indices, positions, uvs }), asked only the first time.
     */
    of(key, mesh) {
        if (!this.made.has(key)) {
            this.made.set(key, this.#making(mesh()));
        }

        return this.made.get(key);
    }

    #making({ indices, positions, uvs }) {
        const worker = this.#worker();

        if (!worker) {
            // (Here, then: after whatever's happening now)
            return new Promise((resolve) => setTimeout(resolve, 0)).then(() => lowerDetail(indices, positions, uvs));
        }

        const id = this.next++;
        const copies = [Uint32Array.from(indices), Float32Array.from(positions), Float32Array.from(uvs)];

        worker.postMessage({ id, indices: copies[0], positions: copies[1], uvs: copies[2] }, copies.map(({ buffer }) => buffer));

        return new Promise((resolve, reject) => this.waiting.set(id, { resolve, reject }));
    }

    // The worker, started when first wanted (or null where there are none, or it's failed)
    #worker() {
        if (this.worker !== null || typeof Worker === "undefined") {
            return this.worker || null;
        }

        try {
            this.worker = new Worker(new URL("./lod-worker.js", import.meta.url), { type: "module" });
        } catch {
            this.worker = false;

            return null;
        }

        this.worker.onmessage = ({ data: { id, lower } }) => {
            this.waiting.get(id)?.resolve(lower);
            this.waiting.delete(id);
        };

        // (Failed: what was waiting made here instead, and whatever's asked for after)
        this.worker.onerror = () => {
            this.worker.terminate();
            this.worker = false;

            for (const { reject } of this.waiting.values()) {
                reject(new Error("lod worker failed"));
            }

            this.waiting.clear();
            this.made.clear();
        };

        return this.worker;
    }

    dispose() {
        this.worker?.terminate?.();
        this.worker = false;
        this.waiting.clear();
        this.made.clear();
    }
}
