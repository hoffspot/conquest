// Steering by held input (app/steering.js): held keys run to start with and walk with Shift held,
// and out of breath, held keys or the stick walk on the way they're held till a share of their
// stamina is back (RUN_AGAIN), then run again. A thumb on the stick whose lift is lost (as a phone's
// Safari loses it) never runs the player on: another thumb takes over from it, and it's let go of
// as the stick no longer keeps the pointer, as the page's closed, or a moment after every finger's
// off the screen (press.js BARE_MS)
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { BARE_MS } from "../client/js/app/press.js";

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

const { RUN_AGAIN, STICK_TAP, Steering } = await import("../client/js/app/steering.js");

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
    const lost = [];
    const player = { breath: 1 };
    const zone = { ...listening(), classList: { add() {}, remove() {} }, getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 100 }) };
    const tapped = [];
    const steering = new Steering({
        zone,
        knob: { style: {} },
        looking: () => 0,
        go: (facing, run) => sent.push(run ? "run" : "walk"),
        stop: () => sent.push("stop"),
        breath: () => player.breath,
        lost: (each) => lost.push(each),
        tapped: () => tapped.push(page.ms),
    });

    return { steering, sent, player, zone, lost, tapped };
}

// A thumb (pointer `id`) at a point on the stick (its middle at 50, 50)
const thumbAt = (zone, type, id, [x, y]) => zone.dispatch(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, preventDefault() {} });

// A thumb (pointer `id`) down on the stick, pushed up it (`up` px: past its run, or not), or lifted
const thumb = (zone, type, id, up = 0, kind = "touch") => zone.dispatch(type, { pointerId: id, pointerType: kind, clientX: 50, clientY: 50 - up, preventDefault() {} });

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

    it("a thumb down on the stick while another's held (its lift lost) takes over, the lost one told; the lost one's late lift does nothing", () => {
        const { steering, sent, lost, zone } = steered();

        thumb(zone, "pointerdown", 1);
        thumb(zone, "pointermove", 1, 50);
        assert.equal(sent.at(-1), "run");
        page.ms += 4000;

        // (Its lift never heard: another thumb down, pushed only a little way: walking)
        thumb(zone, "pointerdown", 2);
        thumb(zone, "pointermove", 2, 20);
        assert.deepEqual(lost, [{ ms: 4000, how: "again" }]);
        assert.equal(sent.at(-1), "walk");
        thumb(zone, "pointerup", 1, 50);
        assert.equal(sent.at(-1), "walk");
        assert.equal(steering.steering, true);
        thumb(zone, "pointerup", 2, 20);
        assert.equal(sent.at(-1), "stop");
        assert.equal(steering.steering, false);
        steering.dispose();
    });

    it("a tap on the knob (let go of quickly, not slid) asks for the camera behind the player, walking nowhere; down on it off its middle, held there till it slides; slid, held long, down on the rim or taken away, no tap", () => {
        const { steering, sent, tapped, zone } = steered();

        // (On the knob, off its middle: not pushed, and a tap)
        thumbAt(zone, "pointerdown", 1, [65, 60]);
        page.ms += 120;
        thumbAt(zone, "pointerup", 1, [67, 61]);
        assert.equal(tapped.length, 1);
        assert.ok(!sent.includes("walk") && !sent.includes("run"), sent.join());

        // (Slid from where it came down on the knob: pushed that way, and no tap)
        thumbAt(zone, "pointerdown", 2, [60, 50]);
        thumbAt(zone, "pointermove", 2, [60, 20]);
        assert.equal(sent.at(-1), "walk");
        thumbAt(zone, "pointerup", 2, [60, 20]);
        assert.equal(tapped.length, 1);

        // (Held too long, still, on the knob)
        thumbAt(zone, "pointerdown", 3, [50, 50]);
        page.ms += STICK_TAP.ms + 50;
        thumbAt(zone, "pointerup", 3, [50, 50]);
        assert.equal(tapped.length, 1);

        // (Down on the rim: pushed that way at once, as ever, and no tap)
        thumbAt(zone, "pointerdown", 4, [50, 15]);
        assert.equal(sent.at(-1), "walk");
        page.ms += 100;
        thumbAt(zone, "pointerup", 4, [50, 15]);
        assert.equal(tapped.length, 1);

        // (Taken away by the browser, not lifted)
        thumbAt(zone, "pointerdown", 5, [50, 50]);
        thumbAt(zone, "pointercancel", 5, [50, 50]);
        assert.equal(tapped.length, 1);

        // (Floating, anywhere it lands)
        steering.floating = true;
        thumbAt(zone, "pointerdown", 6, [20, 80]);
        page.ms += 100;
        thumbAt(zone, "pointerup", 6, [22, 79]);
        assert.equal(tapped.length, 2);
        steering.dispose();
    });

    it("let go of, the player stopped, as the stick no longer keeps the pointer, or as the page's closed", () => {
        const { steering, sent, lost, zone } = steered();

        thumb(zone, "pointerdown", 1);
        thumb(zone, "pointermove", 1, 50);
        thumb(zone, "lostpointercapture", 1);
        assert.deepEqual(sent, ["run", "stop"]);
        assert.equal(steering.steering, false);

        thumb(zone, "pointerdown", 2);
        thumb(zone, "pointermove", 2, 50);
        page.window.dispatch("pagehide", {});
        assert.deepEqual(sent, ["run", "stop", "run", "stop"]);
        assert.equal(steering.steering, false);
        assert.deepEqual(lost, []);
        steering.dispose();
    });

    it("every finger off the screen: a thumb that went down before is let go of a moment after, stopped and told; one down since is kept, and a mouse's", () => {
        mock.timers.enable({ apis: ["setTimeout"] });

        try {
            const { steering, sent, lost, zone } = steered();

            thumb(zone, "pointerdown", 1);
            thumb(zone, "pointermove", 1, 50);
            page.ms += 200;
            page.document.dispatch("touchend", { touches: [] });
            page.ms += BARE_MS;
            mock.timers.tick(BARE_MS - 1);
            assert.equal(steering.steering, true, "not till a moment after: its own lift may yet come");
            mock.timers.tick(1);
            assert.equal(steering.steering, false);
            assert.deepEqual(sent, ["run", "stop"]);
            assert.deepEqual(lost, [{ ms: 200 + BARE_MS, how: "bare" }]);

            // (Another finger still on the screen: nothing)
            thumb(zone, "pointerdown", 2);
            page.document.dispatch("touchend", { touches: [{}] });
            mock.timers.tick(BARE_MS);
            assert.equal(steering.steering, true);
            thumb(zone, "pointerup", 2);

            // (A thumb down since, before it's looked at: kept)
            page.document.dispatch("touchend", { touches: [] });
            page.ms += 10;
            thumb(zone, "pointerdown", 3);
            mock.timers.tick(BARE_MS);
            assert.equal(steering.steering, true);
            thumb(zone, "pointerup", 3);

            // (The mouse's: no finger's lift to lose)
            thumb(zone, "pointerdown", 4, 0, "mouse");
            page.document.dispatch("touchend", { touches: [] });
            mock.timers.tick(BARE_MS);
            assert.equal(steering.steering, true);
            thumb(zone, "pointerup", 4, 0, "mouse");
            assert.equal(lost.length, 1);
            steering.dispose();
        } finally {
            mock.timers.reset();
        }
    });
});
