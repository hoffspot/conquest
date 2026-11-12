// What Game options' Graphics page says of what's drawn, beside "Keeping up"
// (client/js/app/graphicsnotes.js): that the device is saving its power, the browser asking for
// 30 frames a second; and that a quality's smoother edges wait on the game being loaded again
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Beat } from "../client/js/app/frames.js";
import { edgesNote, powerNote } from "../client/js/app/graphicsnotes.js";

describe("what Game options says of what's drawn (app/graphicsnotes.js)", () => {
    it("says a phone or a tablet is saving its battery while the browser asks for about 30 frames a second, and nothing otherwise", () => {
        const beat = new Beat();

        assert.equal(powerNote({ beat: beat.value, touch: true }), null, "60 a second, or not known yet");

        // (Twelve seconds of a browser asking for 30, the game's own work 4 ms a frame)
        for (let now = 1000 / 30; now < 12000; now += 1000 / 30) {
            beat.observe(now, 1000 / 30, 4);
        }

        assert.match(powerNote({ beat: beat.value, touch: true }), /asking for 30 frames a second.*draws 30.*takes nothing away/);
        assert.equal(powerNote({ beat: beat.value, touch: false }), null, "a computer: its screen's, or its browser's, not a battery's");
        assert.equal(powerNote({ beat: 0, touch: true }), null, "no game yet");
        assert.equal(powerNote({ beat: 1000 / 15, touch: true }), null, "a stall isn't a beat of 30");
    });

    it("says a quality's smoother edges wait on the game being loaded again, either way, and nothing when they're as chosen", () => {
        assert.equal(edgesNote({ wanted: true, made: true }), null);
        assert.equal(edgesNote({ wanted: false, made: false }), null);
        assert.match(edgesNote({ wanted: true, made: false }), /smoother edges.*next time the game's loaded/);
        assert.match(edgesNote({ wanted: false, made: true }), /stay smoothed.*till the game's next loaded/);
        assert.equal(edgesNote({ wanted: true, made: undefined }), null, "no picture yet");
    });
});
