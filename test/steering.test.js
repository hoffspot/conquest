// Steering by held input (app/steering.js): held keys run to start with and walk with Shift held,
// and out of breath, held keys or the stick walk on the way they're held till a share of their
// stamina is back (RUN_AGAIN), then run again
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// (Just enough of a page: a document and window to listen on, the stick's circle, and frames run
// when the test says, at a clock it moves)
function listening() {
    const heard = new Map();

    return {
        heard,
        addEventListener: (type, listener) => heard.set(type, [...(heard.get(type) ?? []), listener]),
        removeEventListener: (type, listener) => heard.set(type, (heard.get(type) ?? []).filter((own) => own !== listener)),
        dispatch: (type, event) => (heard.get(type) ?? []).forEach((listener) => listener(event)),
    };
}

const page = { document: listening(), window: listening(), frames: [], ms: 0 };

globalThis.document = page.document;
globalThis.window = page.window;
globalThis.HTMLInputElement ??= class {};
globalThis.HTMLTextAreaElement ??= class {};
globalThis.requestAnimationFrame = (callback) => page.frames.push(callback);
globalThis.cancelAnimationFrame = () => {};
performance.now = () => page.ms;

const { RUN_AGAIN, Steering } = await import("../client/js/app/steering.js");

// A frame `ms` on: what's waiting for it run
function frame(ms = 16) {
    page.ms += ms;

    for (const callback of page.frames.splice(0)) {
        callback();
    }
}

function key(code, key, down) {
    page.document.dispatch(down ? "keydown" : "keyup", { code, key, target: {}, preventDefault() {} });
}

function steered() {
    const sent = [];
    const player = { breath: 1 };
    const zone = { ...listening(), classList: { add() {}, remove() {} }, getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 100 }) };
    const steering = new Steering({
        zone,
        knob: { style: {} },
        looking: () => 0,
        go: (facing, run) => sent.push(run ? "run" : "walk"),
        stop: () => sent.push("stop"),
        breath: () => player.breath,
    });

    return { steering, sent, player, zone };
}

describe("steering by held input (steering.js)", () => {
    it("runs on held keys to start with, walks with Shift held, and stops when they're let go", () => {
        const { steering, sent } = steered();

        key("KeyW", "w", true);
        assert.deepEqual(sent, ["run"]);
        key("ShiftLeft", "Shift", true);
        assert.deepEqual(sent, ["run", "walk"]);
        key("ShiftLeft", "Shift", false);
        assert.deepEqual(sent, ["run", "walk", "run"]);
        key("KeyW", "w", false);
        assert.deepEqual(sent, ["run", "walk", "run", "stop"]);
        steering.dispose();
    });

    it("out of breath, walks on the way the keys are held till a share of it's back, then runs again, not stuttering between the two", () => {
        const { steering, sent, player } = steered();

        key("KeyD", "d", true);
        player.breath = 0;
        steering.outOfBreath();
        assert.deepEqual(sent, ["run", "walk"]);

        // Short of RUN_AGAIN, walking on however long it's held: the order given again every half
        // second, walking each time
        for (const breath of [0.05, 0.1, RUN_AGAIN / 2, RUN_AGAIN - 0.01]) {
            player.breath = breath;

            for (let k = 0; k < 40; k++) {
                frame();
            }
        }

        assert.ok(sent.length > 4, `${sent.length} orders`);
        assert.ok(sent.slice(1).every((order) => order === "walk"), sent.join(" "));

        // Enough back: running again at once, and from then on
        player.breath = RUN_AGAIN;
        frame();
        assert.equal(sent.at(-1), "run");
        player.breath = RUN_AGAIN / 2;
        frame(600);
        assert.equal(sent.at(-1), "run", "running on as it goes down again, till it's all gone");
        key("KeyD", "d", false);
        steering.dispose();
    });

    it("keeps walking out of breath when the keys are let go and held again before enough's back, and the stick walks too", () => {
        const { steering, sent, player, zone } = steered();

        key("KeyW", "w", true);
        player.breath = 0;
        steering.outOfBreath();
        key("KeyW", "w", false);
        player.breath = 0.1;
        key("KeyW", "w", true);
        assert.equal(sent.at(-1), "walk");
        key("KeyW", "w", false);

        // The stick pushed right over, which runs: walking, till enough's back
        zone.dispatch("pointerdown", { pointerId: 1, clientX: 50, clientY: 50, preventDefault() {} });
        zone.dispatch("pointermove", { pointerId: 1, clientX: 50, clientY: -40, preventDefault() {} });
        assert.equal(sent.at(-1), "walk");
        player.breath = RUN_AGAIN + 0.01;
        frame();
        assert.equal(sent.at(-1), "run");
        zone.dispatch("pointerup", { pointerId: 1, clientX: 50, clientY: -40, preventDefault() {} });
        assert.equal(sent.at(-1), "stop");
        steering.dispose();
    });
});
