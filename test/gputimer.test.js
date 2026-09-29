// How long the GPU takes to draw a frame (world/gputimer.js), for the debug overlay: timed with the
// browser's queries where it has them, read once the GPU's done, never waited for
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GpuTimer } from "../client/js/world/gputimer.js";

// A WebGL2 context with the timer extension, as far as the timer uses it: each query's answer
// (nanoseconds) given once the test says the GPU's done with it
function context({ extension = true } = {}) {
    const EXT = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
    const gl = {
        QUERY_RESULT: 0x8866,
        QUERY_RESULT_AVAILABLE: 0x8867,
        queries: [],
        active: null,
        disjoint: false,
        deleted: 0,
        getExtension: (name) => (extension && name === "EXT_disjoint_timer_query_webgl2" ? EXT : null),
        createQuery: () => ({ done: false, ns: 0 }),
        beginQuery(target, query) {
            assert.equal(target, EXT.TIME_ELAPSED_EXT);
            assert.equal(gl.active, null, "one query at a time");
            gl.active = query;
        },
        endQuery() {
            gl.queries.push(gl.active);
            gl.active = null;
        },
        getParameter: (name) => (name === EXT.GPU_DISJOINT_EXT ? gl.disjoint : null),
        getQueryParameter: (query, name) => (name === gl.QUERY_RESULT_AVAILABLE ? query.done : query.ns),
        deleteQuery: () => gl.deleted++,
        // (The GPU finishing the oldest query not yet done, having taken `ms`)
        finish(ms) {
            const query = gl.queries.find(({ done }) => !done);

            Object.assign(query, { done: true, ns: ms * 1e6 });
        },
    };

    return gl;
}

describe("the GPU timer (world/gputimer.js)", () => {
    it("reads a frame's time once the GPU's done with it, a frame or more later, and smooths them", () => {
        const gl = context();
        const timer = new GpuTimer(gl);

        assert.ok(timer.available);

        timer.begin();
        timer.end();
        assert.equal(timer.ms, null, "not done yet: not waited for");

        gl.finish(4);
        timer.begin();
        timer.end();
        assert.equal(timer.ms, 4);

        for (let k = 0; k < 60; k++) {
            gl.finish(8);
            timer.begin();
            timer.end();
        }

        assert.ok(Math.abs(timer.ms - 8) < 0.1, `settles on the new time (${timer.ms})`);
    });

    it("throws away a time the GPU's clock was disturbed for", () => {
        const gl = context();
        const timer = new GpuTimer(gl);

        timer.begin();
        timer.end();
        gl.finish(500);
        gl.disjoint = true;
        timer.begin();
        timer.end();
        assert.equal(timer.ms, null);
        assert.ok(gl.deleted >= 1, "its query let go");
    });

    it("keeps no more than a few waiting, however far behind the GPU is, and lets them go when stopped", () => {
        const gl = context();
        const timer = new GpuTimer(gl);

        for (let k = 0; k < 20; k++) {
            timer.begin();
            timer.end();
        }

        assert.equal(gl.queries.length, 4);

        timer.clear();
        assert.equal(gl.deleted, 4);
        assert.equal(timer.ms, null);
    });

    it("says it can't where the browser has no timer, and does nothing", () => {
        const timer = new GpuTimer(context({ extension: false }));

        assert.equal(timer.available, false);
        timer.begin();
        timer.end();
        assert.equal(timer.ms, null);
    });
});
