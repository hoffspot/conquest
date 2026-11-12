// What Game options' Graphics page says under its settings of what the game's drawing, beside
// "Keeping up" (main.js showAdapted): that the device is saving its power, and that a quality's
// smoother edges wait on the game being loaded again. Pure, so the wording's conditions are tested
// without a page (test/frames.test.js).

import { savingPower } from "./pacing.js";

/**
 * Said while the device is saving its power, or null: on a touch screen (a phone or a tablet),
 * the browser asking for about 30 frames a second (`beat`, ms a frame: app/frames.js Beat; an
 * iPhone's Low Power Mode). The game draws those 30 and takes nothing away for it (app/governor.js,
 * app/throng.js judge against the beat), which is what this says.
 */
export function powerNote({ beat, touch }) {
    return touch && savingPower(beat) ? "Your device is saving its battery and asking for 30 frames a second, so the game draws 30, and takes nothing away for it." : null;
}

/**
 * Said while the quality chosen smooths edges (`wanted`: QUALITY's antialias) and the picture
 * wasn't made to (`made`: the quality the game was loaded at), or the other way round; null when
 * they agree. A browser makes a picture's drawing surface smoothed or not once, when it's made
 * (world/view.js: the renderer's `antialias`), so the rest of a level changes at once and its edges
 * only when the game's next loaded.
 */
export function edgesNote({ wanted, made }) {
    if (typeof made !== "boolean" || Boolean(wanted) === made) {
        return null;
    }

    return wanted ? "This quality's smoother edges are drawn from the next time the game's loaded." : "Edges stay smoothed, as the quality before drew them, till the game's next loaded.";
}
