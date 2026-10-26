// An Action Bar press (client/js/app/press.js): tapped, held or flicked, and never left waiting
// on a lift that doesn't come, as a phone's Safari can lose one. A press begun over one lost takes
// over (used once); a cancel, or the pointer no longer kept to the slot, ends it; held or flicked,
// it's over, nothing on the lift; a tap that fails leaves the next working; let go of, nothing; once
// every finger's off the screen, one begun before then is dropped and one begun after kept; and a
// hold finding its press gone changes nothing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Press, QUICK_HOLD_MS, STRAY } from "../client/js/app/press.js";

// A press heard on a clock of its own (`pass(ms)` moves it on, firing what's due), with what it
// said kept, in order
function pressed({ live = () => true } = {}) {
    let time = 0;
    let next = 1;
    const due = new Map();
    const said = [];
    const press = new Press({
        live,
        now: () => time,
        timers: {
            set: (work, ms) => {
                due.set(next, { work, at: time + ms });

                return next++;
            },
            clear: (timer) => due.delete(timer),
        },
    });

    press.onUse = () => said.push("use");
    press.onChoose = () => said.push("choose");
    press.onFlick = (way) => said.push(`flick ${way}`);
    press.onStale = (lost) => said.push(lost);

    const pass = (ms) => {
        const until = time + ms;

        for (;;) {
            const [timer, { work, at } = {}] = [...due].filter(([, each]) => each.at <= until).sort(([, a], [, b]) => a.at - b.at)[0] ?? [];

            if (!timer) {
                break;
            }

            due.delete(timer);
            time = at;
            work();
        }

        time = until;
    };

    return { press, said, pass, due, now: () => time };
}

const at = (pointer, x = 100, y = 700, more = {}) => ({ pointer, x, y, kind: "touch", ...more });

describe("an Action Bar press", () => {
    it("tapped, it's used as it's lifted; held, changed; a mouse's other buttons aren't heard", () => {
        const { press, said, pass } = pressed();

        assert.equal(press.down(at(1)), true);
        assert.equal(press.pressing, true);
        pass(120);
        press.up(at(1));
        assert.deepEqual(said, ["use"]);
        assert.equal(press.pressing, false);

        assert.equal(press.down(at(2, 100, 700, { button: 2, kind: "mouse" })), false);
        assert.equal(press.pressing, false);
        pass(QUICK_HOLD_MS + 100);
        assert.deepEqual(said, ["use"]);
    });

    it("begun again with the last never lifted (its lift lost), takes over: the tap's used once, the press lost said with how long it was held", () => {
        const { press, said, pass } = pressed();

        press.down(at(1));
        pass(200);
        // (Its lift never heard: the next touch on the slot)
        press.down(at(2));
        pass(80);
        press.up(at(2));
        // (The first's lift, late, if it ever comes: nothing)
        press.up(at(1));

        assert.deepEqual(said, [{ ms: 200, how: "again", last: "down" }, "use"]);
    });

    it("called off by the browser, or the pointer no longer kept to the slot: nothing, and the next tap works", () => {
        const { press, said, pass } = pressed();

        press.down(at(1));
        press.cancel(at(1));
        pass(QUICK_HOLD_MS + 100);
        press.down(at(2));
        press.cancel(at(2));
        pass(QUICK_HOLD_MS + 100);
        assert.deepEqual(said, []);
        assert.equal(press.pressing, false);

        press.down(at(3));
        press.up(at(3));
        assert.deepEqual(said, ["use"]);
    });

    it("held, changed once (told which pointer, its lift still to come), and over: nothing as it's lifted", () => {
        const { press, said, pass } = pressed();

        press.onChoose = (pointer) => said.push(`choose ${pointer}`);
        press.down(at(1));
        pass(QUICK_HOLD_MS - 1);
        assert.deepEqual(said, []);
        pass(1);
        assert.deepEqual(said, ["choose 1"]);
        assert.equal(press.pressing, false);

        press.up(at(1));
        pass(QUICK_HOLD_MS + 100);
        assert.deepEqual(said, ["choose 1"]);
    });

    it("flicked up or down, turned once, and over: nothing as it's lifted, or held; slid off across, nothing", () => {
        const { press, said, pass } = pressed();

        press.down(at(1));
        press.move(at(1, 104, 700 - (STRAY + 6)));
        press.up(at(1, 104, 700 - (STRAY + 6)));
        press.down(at(2));
        press.move(at(2, 100, 710));
        press.move(at(2, 100, 700 + STRAY));
        pass(QUICK_HOLD_MS + 100);
        press.up(at(2));
        assert.deepEqual(said, ["flick up", "flick down"]);

        press.down(at(3));
        press.move(at(3, 100 + STRAY + 6, 705));
        pass(QUICK_HOLD_MS + 100);
        press.up(at(3));
        assert.deepEqual(said, ["flick up", "flick down"]);
    });

    it("a tap whose use fails leaves the next working", () => {
        const { press, said } = pressed();
        let fails = true;

        press.onUse = () => {
            if (fails) {
                fails = false;
                throw new Error("the game, failing");
            }

            said.push("use");
        };

        press.down(at(1));
        assert.throws(() => press.up(at(1)), /failing/);
        assert.equal(press.pressing, false);

        press.down(at(2));
        press.up(at(2));
        assert.deepEqual(said, ["use"]);
    });

    it("let go of (the bar put away, the page hidden) halfway: nothing, lifted or held", () => {
        const { press, said, pass } = pressed();

        press.down(at(1));
        pass(150);
        press.release();
        pass(QUICK_HOLD_MS);
        press.up(at(1));
        assert.deepEqual(said, []);
        assert.equal(press.pressing, false);
    });

    it("every finger off the screen: a press begun before then is dropped, lost; one begun after's kept; a mouse's is a mouse's", () => {
        const { press, said, pass, now } = pressed();

        press.down(at(1));
        pass(60);

        const bare = now();

        pass(100);
        press.bare(bare);
        assert.equal(press.pressing, false);
        assert.deepEqual(said, [{ ms: 160, how: "bare", last: "down" }]);
        pass(QUICK_HOLD_MS);
        assert.equal(said.length, 1);

        // (Begun after: another finger's, kept)
        const before = now();

        pass(20);
        press.down(at(2));
        press.bare(before);
        assert.equal(press.pressing, true);
        press.up(at(2));

        // (The mouse's: no finger's lift to lose)
        press.down(at(3, 100, 700, { kind: "mouse" }));
        pass(10);
        press.bare(now());
        assert.equal(press.pressing, true);
        press.up(at(3));
        assert.deepEqual(said.slice(1), ["use", "use"]);
    });

    it("a hold finding its press gone, or the bar put away, changes nothing", () => {
        let up = true;
        const { press, said, pass, due } = pressed({ live: () => up });

        // (Its timer left behind, as if not cleared: the press it was for long gone)
        press.down(at(1));

        const [[, timer]] = [...due];

        press.up(at(1));
        press.down(at(2));
        timer.work();
        assert.deepEqual(said, ["use"]);
        assert.equal(press.pressing, true);
        press.cancel(at(2));

        // (Held as the bar went down: over, and nothing changed)
        press.down(at(3));
        up = false;
        pass(QUICK_HOLD_MS);
        assert.deepEqual(said, ["use"]);
        assert.equal(press.pressing, false);
    });
});
