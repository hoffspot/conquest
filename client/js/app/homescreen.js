// Suggesting the game be added to the Home Screen on an iPhone or iPad (the title screen's card,
// index.html #homescreen; main.js showHomeScreen), and why: in a browser tab there (Safari, or
// Chrome, which is Safari underneath), iOS lets go of everything a site keeps after seven days of
// using the browser without opening it, the characters and worlds saved on the device with what
// the game's downloaded; played from the Home Screen, it keeps them (docs/GAME.md *The screens*,
// the title). A game there keeps its own, apart from the browser's, so what's saved in
// the browser is exported first, to be imported there.
//
// Pure: no DOM.

const DAY = 24 * 60 * 60 * 1000;

/**
 * - `later`: how long "Not now" puts it off for (ms);
 * - `never`: when "Don't show again" puts it off till (ms since 1970: never, as good as).
 */
export const HOME_SCREEN = Object.freeze({ later: 3 * DAY, never: Number.MAX_SAFE_INTEGER });

/**
 * Whether to suggest adding the game to the Home Screen: on an iPhone or iPad (`ios`, a touch
 * screen), not played from there already (`installed`), and not put off till after now (`after`,
 * the setting homeScreenAfter: ms since 1970).
 */
export function suggestHomeScreen({ ios, touch, installed, after = 0, now = Date.now() }) {
    return Boolean(ios && touch && !installed) && now >= after;
}

/** When the suggestion's next shown, put off as asked ("later" or "never"), from `now`. */
export function putOff(how, now = Date.now()) {
    return how === "never" ? HOME_SCREEN.never : now + HOME_SCREEN.later;
}
