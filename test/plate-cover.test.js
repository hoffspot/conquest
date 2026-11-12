// Bars over heads that cover one another (client/js/app/hud.js Covering): placed in the order of
// precedence, one that lies under those shown before it by more than half isn't shown; never the
// bar of the one the player's set on, of their party or of an attacker; and none flickers: one
// hidden comes back only once it's clear by a margin, and nothing changes twice within the hold
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Covering, PLATE_BOX, PLATE_COVER } from "../client/js/app/hud.js";

// A bar's state, as whoever places it keeps it; a bar full size standing on a point; and a frame
// of them placed in order: which are hidden
const fresh = () => ({ hidden: false, since: -Infinity });
const boxAt = (x, y, scale = 1, width = PLATE_BOX.width) => [x - (width * scale) / 2, y - PLATE_BOX.height * scale, x + (width * scale) / 2, y];

function frame(covering, now, bars) {
    covering.begin();

    return bars.map(({ state, box, always = false }) => covering.place(state, ...box, now, always));
}

describe("bars over heads that cover one another (Covering)", () => {
    it("says how much of a box lies under those shown so far", () => {
        const covering = new Covering();

        covering.begin();
        assert.equal(covering.under(0, 0, 100, 40), 0);
        covering.place(fresh(), 0, 0, 100, 40, 0);
        assert.equal(covering.shown, 1);
        assert.equal(covering.under(0, 0, 100, 40), 1);
        assert.equal(covering.under(50, 0, 150, 40), 0.5);
        assert.equal(covering.under(50, 20, 150, 60), 0.25);
        assert.equal(covering.under(100, 0, 200, 40), 0, "side by side, touching: none of it");
        assert.equal(covering.under(300, 300, 400, 340), 0);
        assert.equal(covering.under(10, 10, 10, 30), 0, "a box of no size is under nothing");

        // (Two side by side, each over part of a third: both parts count)
        covering.place(fresh(), 120, 0, 220, 40, 0);
        assert.ok(Math.abs(covering.under(70, 0, 170, 40) - 0.8) < 1e-6);
        covering.begin();
        assert.equal(covering.shown, 0);
        assert.equal(covering.under(0, 0, 100, 40), 0);
    });

    it("hides one more than half under those before it, and shows the rest", () => {
        const covering = new Covering();
        const bars = [
            { state: fresh(), box: boxAt(500, 300) },
            // (Nine tenths under the first)
            { state: fresh(), box: boxAt(511, 300) },
            // (Two fifths under it: shown)
            { state: fresh(), box: boxAt(566, 300) },
            // (Clear of them all)
            { state: fresh(), box: boxAt(900, 300) },
        ];

        assert.deepEqual(frame(covering, 0, bars), [false, true, false, false]);
        assert.equal(covering.shown, 3);
    });

    it("counts no one hidden as covering anyone: a rank seen end-on shows the first, then each next one clear of those shown", () => {
        const covering = new Covering();
        // (Twelve soldiers in a file going away from the camera: each bar a little up and along
        // from the one before, and smaller)
        const bars = Array.from({ length: 12 }, (_, k) => ({ state: fresh(), box: boxAt(500 + k * 14, 300 - k * 5, 1 - k * 0.05) }));
        const hidden = frame(covering, 0, bars);
        const shown = hidden.filter((each) => !each).length;

        assert.equal(hidden[0], false);
        assert.ok(shown >= 2 && shown <= 5, `${shown} of 12 shown`);

        // (Each one shown is under those shown before it by no more than half)
        covering.begin();

        bars.forEach(({ state, box }, k) => {
            if (!hidden[k]) {
                assert.ok(covering.under(...box) <= PLATE_COVER.covered, `bar ${k}`);
                covering.place(state, ...box, 0);
            }
        });
    });

    it("never hides one that's always shown, and it covers those after it", () => {
        const covering = new Covering();
        const target = { state: fresh(), box: boxAt(500, 300), always: true };
        const first = { state: fresh(), box: boxAt(505, 300) };
        const other = { state: fresh(), box: boxAt(510, 300) };

        // (Placed after one that covers it nearly whole: shown all the same, and the next one,
        // under both, hidden)
        assert.deepEqual(frame(covering, 0, [first, target, other]), [false, false, true]);

        // (One hidden that's to be shown always from now, the player set on it: shown at once,
        // not held)
        other.always = true;
        assert.deepEqual(frame(covering, 0.016, [first, target, other]), [false, false, false]);
    });

    it("brings one hidden back only once it's clear by a margin", () => {
        const covering = new Covering();
        const front = { state: fresh(), box: boxAt(500, 300) };
        const back = { state: fresh(), box: boxAt(520, 300) };
        const share = (x) => {
            covering.begin();
            covering.place(fresh(), ...front.box, 0);

            return covering.under(...boxAt(x, 300));
        };

        assert.deepEqual(frame(covering, 0, [front, back]), [false, true]);

        // (Half clear of it, a little more: under by less than what hides one, more than what
        // lets one back. Still hidden, however long after)
        back.box = boxAt(562, 300);
        assert.ok(share(562) < PLATE_COVER.covered && share(562) > PLATE_COVER.clear);
        assert.deepEqual(frame(covering, 10, [front, back]), [false, true]);

        // (And one never hidden, placed there, is shown: the same place, one way or the other
        // by how it came)
        assert.deepEqual(frame(covering, 10, [front, { state: fresh(), box: boxAt(562, 300) }]), [false, false]);

        // (Clear by the margin: back)
        back.box = boxAt(582, 300);
        assert.ok(share(582) < PLATE_COVER.clear);
        assert.deepEqual(frame(covering, 20, [front, back]), [false, false]);
    });

    it("changes nothing twice within the hold: two that keep changing places change over once in that long", () => {
        const covering = new Covering();
        const a = { state: fresh(), box: boxAt(500, 300) };
        const b = { state: fresh(), box: boxAt(504, 300) };
        let changes = 0;
        let was = null;

        // (A second of frames at sixty a second, the order turned about every frame)
        for (let k = 0; k < 60; k++) {
            const now = k / 60;
            const order = k % 2 ? [b, a] : [a, b];

            frame(covering, now, order);

            const shown = `${a.state.hidden ? "" : "a"}${b.state.hidden ? "" : "b"}`;

            // (One of them, always: never both under each other, never neither for more than
            // the frame they change over)
            assert.ok(shown.length >= 1, `frame ${k}: ${shown}`);

            if (was !== null && shown !== was) {
                changes++;
            }

            was = shown;
        }

        assert.ok(changes <= 2 * Math.ceil(1 / PLATE_COVER.hold), `${changes} changes in a second`);

        // (Left alone in one order, it settles on the first of them)
        for (let k = 0; k < 120; k++) {
            frame(covering, 1 + k / 60, [b, a]);
        }

        assert.deepEqual([a.state.hidden, b.state.hidden], [true, false]);
    });

    it("hides one newly covered at once, if it hasn't changed lately", () => {
        const covering = new Covering();
        const front = { state: fresh(), box: boxAt(500, 300) };
        const back = { state: fresh(), box: boxAt(800, 300) };

        assert.deepEqual(frame(covering, 0, [front, back]), [false, false]);
        back.box = boxAt(505, 300);
        assert.deepEqual(frame(covering, 5, [front, back]), [false, true]);
        assert.equal(back.state.since, 5);

        // (Clear again a moment after: held hidden till the hold's over)
        back.box = boxAt(800, 300);
        assert.deepEqual(frame(covering, 5 + PLATE_COVER.hold / 2, [front, back]), [false, true]);
        assert.deepEqual(frame(covering, 5 + PLATE_COVER.hold, [front, back]), [false, false]);
    });

    it("holds as many as it's given", () => {
        const covering = new Covering();

        covering.begin();

        for (let k = 0; k < 300; k++) {
            assert.equal(covering.place(fresh(), k * 200, 0, k * 200 + 100, 40, 0), false);
        }

        assert.equal(covering.shown, 300);
        assert.equal(covering.under(299 * 200, 0, 299 * 200 + 100, 40), 1);
        assert.equal(covering.place(fresh(), 150 * 200 + 10, 0, 150 * 200 + 110, 40, 0), true);
    });

    it("takes a bar to be as wide as the page draws it at least", () => {
        const styles = readFileSync(new URL("../client/styles.css", import.meta.url), "utf8");
        const least = (selector) => Number(new RegExp(`\\n${selector.replaceAll(".", "\\.")} \\{[^}]*min-width: (\\d+)px`).exec(styles)?.[1]);

        assert.equal(PLATE_BOX.width, least(".floater"));
        assert.equal(PLATE_BOX.elite, least(".floater.elite"));
        assert.equal(PLATE_BOX.fort, least(".floater.fort"));
    });
});
