// Characters small on the screen drawn with fewer triangles: a quarter of them at middling sizes,
// a tenth or so far off; more lists of triangles over the same vertices, so their skin weights,
// picture, bones and everything else are the same, only fewer of them drawn (meshoptimizer's
// simplifier, keeping the texture's layout so its seams stay put). A soldier far off is about
// 40,000 triangles at 80 to 160 pixels tall: 5 to 20 triangles a pixel. The body's are made from
// the triangles of it that show (not under clothes), once for everyone dressed alike; a garment's
// once for everyone with the same triangles of it, and an outfit's (garments drawn all at once,
// character.js `merge`) once for everyone wearing it.
// They're made off the page's thread (lod-worker.js), about 20 to 30 milliseconds each on a
// desktop, and until one's there, the character's drawn in full. The simplifier (a module with its
// WebAssembly inside) is started only where it's used: in the worker, not on the page.

/**
 * The levels a mesh is drawn with as it's smaller on the screen, each `share` of its triangles,
 * give or take, and never more than `error` metres out of place. The middle one's limit is one
 * it's nowhere near (it moves nothing more than 6 millimetres: a captain's outfit); the far one's
 * stops a garment first where taking more off would sink it under the skin or the garment it's
 * over. The middle one under `below` pixels tall on the screen (drawing buffer pixels) and in full
 * again over `above`, so one at the edge doesn't flick between them; the far one under its
 * `below`, the middle again over its `above`.
 */
export const LODS = Object.freeze([Object.freeze({ share: 0.25, error: 0.03, below: 360, above: 420 }), Object.freeze({ share: 0.1, error: 0.007, below: 140, above: 170 })]);

/**
 * What else is lowered from afar, and how far: the eyes (a few pixels there) to a tenth of their
 * triangles, never more than a millimetre out (the body's own limit would let an eye fold flat);
 * and the hair, grown again with `hair` of its strands, wider (hair.js growingHair's `far`), short
 * hair too.
 */
export const FAR = Object.freeze({ eyes: Object.freeze({ share: 0.1, error: 0.001 }), hair: 0.06 });

/**
 * What the lower detail of a mesh called `name` with these triangles (`indices`) is kept as (Lods):
 * the same for every mesh with the same triangles, whatever shape it's fitted to.
 */
export function keyOf(name, indices) {
    // (FNV-1a over the corners)
    let hash = 0x811c9dc5;

    for (let i = 0; i < indices.length; i++) {
        hash = Math.imul(hash ^ indices[i], 0x01000193);
    }

    return `${name}:${indices.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * A mesh's triangles for drawing it from afar (`indices` over `positions`, xyz in metres, with
 * texture coordinates `uvs`, uv), about `share` of them, never more than `error` metres out of
 * place: resolves to a list of triangles over the same vertices. `flags`, more of meshoptimizer's
 * simplifier's: "Permissive" to take triangles off across the picture's seams too, "Prune" to drop
 * small pieces of it altogether (a crowd's figure, world/crowd.js).
 */
export async function lowerDetail(indices, positions, uvs, share = LODS[0].share, error = LODS[0].error, flags = []) {
    const { MeshoptSimplifier } = await import("../../vendor/meshoptimizer-1.3.0/meshopt_simplifier.min.js");

    await MeshoptSimplifier.ready;

    const triangles = Uint32Array.from(indices);
    const target = Math.floor((triangles.length / 3) * share) * 3;
    const [lower] = MeshoptSimplifier.simplifyWithAttributes(triangles, Float32Array.from(positions), 3, Float32Array.from(uvs), 2, [1, 1], null, target, error, ["ErrorAbsolute", ...flags]);

    return lower;
}

// How many lower-detail meshes are kept for whoever's next to want them, the longest unasked for
// let go first (a few megabytes: the start town's and its tavern's folk ask for about 150)
export const KEPT = 256;

/**
 * Lower-detail meshes, each made once (off the page's thread, where it can be) and kept, by what
 * they're of: a body as it's dressed, a garment, or an outfit.
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
     * ({ indices, positions, uvs }, and if not the middle level's, its `share` and `error`, and any
     * `flags`: lowerDetail), asked only when it isn't kept.
     */
    of(key, mesh) {
        const made = this.made.get(key) ?? this.#making(mesh());

        // (The most recently asked for last; past KEPT, the longest unasked for let go)
        this.made.delete(key);
        this.made.set(key, made);

        if (this.made.size > KEPT) {
            this.made.delete(this.made.keys().next().value);
        }

        return made;
    }

    #making({ indices, positions, uvs, share = LODS[0].share, error = LODS[0].error, flags = [] }) {
        const worker = this.#worker();

        if (!worker) {
            // (Here, then: after whatever's happening now)
            return new Promise((resolve) => setTimeout(resolve, 0)).then(() => lowerDetail(indices, positions, uvs, share, error, flags));
        }

        const id = this.next++;
        const copies = [Uint32Array.from(indices), Float32Array.from(positions), Float32Array.from(uvs)];

        worker.postMessage({ id, indices: copies[0], positions: copies[1], uvs: copies[2], share, error, flags }, copies.map(({ buffer }) => buffer));

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
