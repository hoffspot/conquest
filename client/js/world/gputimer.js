// How long the GPU takes to draw a frame, for the debug overlay: where the browser can say
// (EXT_disjoint_timer_query_webgl2: most desktop browsers; few phones' yet), a query timing the
// GPU's work between asking and answering, read a few frames later when it's done (never waited
// for). Only while it's wanted: timing costs a little.

// How much each new timing counts for in the smoothed one
const SMOOTHING = 0.1;

// At most this many queries waiting for their answer (the GPU a few frames behind)
const WAITING = 4;

export class GpuTimer {
    #queries = [];
    #timing = null;

    /** @param {WebGL2RenderingContext} gl */
    constructor(gl) {
        this.gl = gl;
        this.ext = gl.getExtension?.("EXT_disjoint_timer_query_webgl2") ?? null;

        /** The GPU's time for a frame (ms, smoothed), or null till there's been one. */
        this.ms = null;
    }

    /** Can this browser say? */
    get available() {
        return Boolean(this.ext);
    }

    /** Start timing what's drawn now (unless it can't, or too many are waiting). */
    begin() {
        if (!this.ext || this.#timing || this.#queries.length >= WAITING) {
            return;
        }

        this.#timing = this.gl.createQuery();
        this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.#timing);
    }

    /** Stop timing, and take any earlier timings the GPU has finished. */
    end() {
        const { gl, ext } = this;

        if (this.#timing) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            this.#queries.push(this.#timing);
            this.#timing = null;
        }

        // (Disjoint: the GPU's clock was disturbed, a phone's power saving say, so no time waiting is
        // to be trusted; asking clears it, so it's asked once)
        const disjoint = this.#queries.length > 0 && gl.getParameter(ext.GPU_DISJOINT_EXT);

        while (this.#queries.length) {
            const query = this.#queries[0];
            const ready = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);

            if (!ready && !disjoint) {
                break;
            }

            if (ready && !disjoint) {
                const ms = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6;

                this.ms = this.ms === null ? ms : this.ms + (ms - this.ms) * SMOOTHING;
            }

            gl.deleteQuery(query);
            this.#queries.shift();
        }
    }

    /** Stop timing altogether (forgetting what's waiting). */
    clear() {
        for (const query of this.#queries) {
            this.gl.deleteQuery(query);
        }

        this.#queries = [];
        this.ms = null;
    }
}
