// The handheld gaming PCs the game's played on, and a preset for each (Game options, Controls,
// Bindings, Handheld presets): which keys their back buttons are set to send, how to set them in
// the handheld's own software, the sticks' dead zone, and the text size for its small screen; and a
// guess at which one the game's on, to offer its preset once. No page here (test/handhelds.test.js).
//
// Every one of them gives the browser its controller as an Xbox controller ("standard" layout), so
// its buttons are the game's as they come (app/gamepad.js ACTIONS). What a browser never sees is
// their back buttons (the Steam Deck's L4, R4, L5 and R5; the Legion Go's Y1, Y2, Y3 and M3; the
// ROG Ally's and the MSI Claw's two), their trackpads or gyro: only their own software (Steam
// Input, Legion Space, Armoury Crate SE, MSI Center M) can set a back button to send a key, which
// the game then has set to an action. So a preset sets those actions' keys (app/keys.js: as their
// main key), and says how to set the back buttons to send them. Four back buttons: your own wheel,
// their wheel, the world map and the Journal; two: the two wheels.
//
// Which handheld it is can only be guessed: Chrome and Edge on Windows don't name the device, and
// every controller under Steam is Steam's own. So it's guessed from the controller's maker and
// product where the browser gives them (on Linux), or else from the screen's size in pixels, a touch
// screen and a controller together, and only ever offered (generated/handheld_controls.md).

import { keysAsTheyCome } from "./keys.js";

/** The back buttons' actions, in order: on a handheld with four, all; with two, the first two. */
export const BACK_ACTIONS = Object.freeze(["selfWheel", "theirWheel", "map", "journal"]);

// The steps to set a handheld's back buttons, by its software (`{keys}`: each button and the key
// it's to send, filled in as the player has them set)
const STEAM = Object.freeze([
    "In Game Mode, add your browser to Steam (Games, Add a Non-Steam Game to My Library) and start the game from there.",
    "In its controller settings choose the layout Gamepad with Mouse Trackpad, then under Back Grip Buttons set {keys}, each as a keyboard key.",
    "In Desktop Mode, hold the Menu button (☰) to switch the controls from mouse and keyboard to a controller.",
    "If no controller's seen in a browser installed from Discover (a Flatpak), give it access to /run/udev (with Flatseal, under Filesystem).",
]);

const LEGION_SPACE = Object.freeze([
    "Press Legion L to open Legion Space, then Controller, Button Mapping.",
    "Set {keys}, each as a keyboard key, and save.",
    "Keep the controllers attached and in X-input mode: Legion Space shows it under Controller.",
]);

const ARMOURY_CRATE = Object.freeze([
    "Press the Armoury Crate button, then Control Mode: choose Gamepad (Auto can switch a browser to Desktop mode, where the controls are a mouse).",
    "Open Customise, Back Buttons, and untick Set as Secondary Function.",
    "Set {keys}, each as a keyboard key.",
]);

const MSI_CENTER = Object.freeze([
    "Update the Claw's firmware in MSI Center M first: the first Claws couldn't set M1 and M2.",
    "Keep the controller in XInput mode, then open MSI Center M, Key Mapping.",
    "Set {keys}, each as a keyboard key.",
]);

const ANY_SOFTWARE = Object.freeze(["In your handheld's own controller software, set {keys}, each as a keyboard key.", "Keep its controller in its Xbox or XInput mode, not its desktop or mouse mode."]);

// The Legion Go's FPS mode: the right controller's a mouse, the left sends keys (Legion Space)
const LEGION_FPS = Object.freeze([
    "Turn on FPS mode with the switch under the right controller, and stand it on a table: it's a mouse now. Click to walk, fight and talk; its wheel zooms.",
    "In Legion Space, Controller, FPS mode, give the left controller's stick W, A, S and D, its stick's click Shift (walk), its D-pad 1, 2, 3 and 4 (the Action Bar), LB Tab (the next foe) and LT F (do it).",
    "Set {keys}, as mouse buttons, to use the wheels from the mouse.",
]);

/**
 * The handhelds, each with what it's called, its back buttons (`backs`: their names, in the order
 * BACK_ACTIONS gives them out; or mouse buttons, for the Legion Go's FPS mode), the software that
 * sets them (`software`) and its steps, the sticks' dead zone (Hall-effect or TMR sticks don't
 * drift, so less; otherwise the game's own), and its screen's size in pixels (`screens`), for the
 * guess.
 */
export const HANDHELDS = Object.freeze([
    Object.freeze({ id: "steamDeck", name: "Steam Deck", software: "Steam Input", steps: STEAM, backs: Object.freeze(["L4", "R4", "L5", "R5"]), deadZone: 0.15, screens: Object.freeze([[1280, 800]]) }),
    Object.freeze({ id: "legionGo", name: "Legion Go (2023)", software: "Legion Space", steps: LEGION_SPACE, backs: Object.freeze(["Y1", "Y3", "Y2", "M3"]), deadZone: 0.15, screens: Object.freeze([[2560, 1600]]) }),
    Object.freeze({ id: "legionGo2", name: "Legion Go 2", software: "Legion Space", steps: LEGION_SPACE, backs: Object.freeze(["Y1", "Y3", "Y2", "M3"]), deadZone: 0.08, screens: Object.freeze([[1920, 1200]]) }),
    Object.freeze({ id: "legionFps", name: "Legion Go in FPS mode", software: "Legion Space", steps: LEGION_FPS, mouse: true, backs: Object.freeze(["Y3", "M3"]), deadZone: 0.15, screens: Object.freeze([]) }),
    Object.freeze({ id: "legionGoS", name: "Legion Go S", software: "Legion Space (or Steam Input on SteamOS)", steps: LEGION_SPACE, backs: Object.freeze(["Y1", "Y2"]), deadZone: 0.15, screens: Object.freeze([[1920, 1200]]) }),
    Object.freeze({ id: "rogAlly", name: "ROG Ally or Ally X", software: "Armoury Crate SE", steps: ARMOURY_CRATE, backs: Object.freeze(["the left back button", "the right back button"]), deadZone: 0.15, screens: Object.freeze([[1920, 1080]]) }),
    Object.freeze({ id: "xboxAlly", name: "ROG Xbox Ally, Ally X or X20", software: "Armoury Crate SE", steps: ARMOURY_CRATE, backs: Object.freeze(["the left back button", "the right back button"]), deadZone: 0.15, screens: Object.freeze([[1920, 1080]]) }),
    Object.freeze({ id: "msiClaw", name: "MSI Claw", software: "MSI Center M", steps: MSI_CENTER, backs: Object.freeze(["M2 (left)", "M1 (right)"]), deadZone: 0.08, screens: Object.freeze([[1920, 1080], [1920, 1200]]) }),
    Object.freeze({ id: "handheld", name: "Another handheld", software: "its own controller software", steps: ANY_SOFTWARE, backs: Object.freeze(["its left back button", "its right back button"]), deadZone: 0.15, screens: Object.freeze([]) }),
]);

const BY_ID = new Map(HANDHELDS.map((one) => [one.id, one]));

/** A handheld by its id, or null. */
export const handheldOf = (id) => BY_ID.get(id) ?? null;

/** The text size on a handheld's small screen (Game options, Graphics). */
export const HANDHELD_TEXT = "large";

// The Legion Go's FPS mode: the mouse's buttons beside the keys (each action's spare: the right
// click does it, the middle recentres the camera, back and forward the two wheels, if Legion Space
// sets two of the right controller's buttons to them)
const FPS_MOUSE = Object.freeze({ do: "Mouse2", recentre: "Mouse1", selfWheel: "Mouse3", theirWheel: "Mouse4" });

/**
 * What a handheld's preset sets: each action's key to set (`keys`: [{ id, slot, key }], as
 * app/keys.js setKey takes them, in order: the back buttons' actions each kept to the key it has,
 * or, without one, given the one it comes with; for FPS mode, the mouse's buttons as spares), the
 * sticks' dead zone, and the text size.
 */
export function presetOf(id, keys) {
    const one = BY_ID.get(id);

    if (!one) {
        return null;
    }

    const set = [];

    if (one.mouse) {
        for (const [action, key] of Object.entries(FPS_MOUSE)) {
            set.push({ id: action, slot: 1, key });
        }
    } else {
        for (const action of BACK_ACTIONS.slice(0, one.backs.length)) {
            if (!keys?.[action]?.[0]) {
                set.push({ id: action, slot: 0, key: keysAsTheyCome(action)[0] });
            }
        }
    }

    return { keys: set, deadZone: one.deadZone, textSize: HANDHELD_TEXT };
}

/**
 * What each of a handheld's back buttons is to send, said with the keys as they're shown
 * (`words(action)`: an action's main key's name, or for FPS mode its mouse button's): "L4 to G,
 * R4 to T, L5 to M and R5 to J".
 */
export function backsSaid(id, words) {
    const one = BY_ID.get(id);

    if (!one) {
        return "";
    }

    const actions = one.mouse ? ["selfWheel", "theirWheel"] : BACK_ACTIONS.slice(0, one.backs.length);
    const said = one.backs.map((back, at) => `${back} to ${words(actions[at]) || "nothing yet"}`);

    return said.length > 1 ? `${said.slice(0, -1).join(", ")} and ${said.at(-1)}` : (said[0] ?? "");
}

/** A handheld's steps, its back buttons and keys said in them (backsSaid). */
export const stepsOf = (id, words) => (BY_ID.get(id)?.steps ?? []).map((step) => step.replace("{keys}", backsSaid(id, words)));

// The handhelds' controllers by their makers' and products' numbers, as Chrome and Firefox name
// them on Linux ("Vendor: 28de Product: 1205", "28de-1205-"): the Steam Deck's own (Steam not
// running); the Legion Go's, Go 2's and Go S's; the MSI Claw's; the ROG Ally X's and Xbox Ally's
const MADE = Object.freeze([
    ["28de", "1205", "steamDeck"],
    ["17ef", "6182", "legionGo"],
    ["17ef", "6184", "legionGo"],
    ["17ef", "6185", "legionGo"],
    ["17ef", "61eb", "legionGo2"],
    ["17ef", "61ec", "legionGo2"],
    ["17ef", "61ed", "legionGo2"],
    ["17ef", "61ee", "legionGo2"],
    ["1a86", "e310", "legionGoS"],
    ["1a86", "e311", "legionGoS"],
    ["0db0", "1901", "msiClaw"],
    ["0db0", "1902", "msiClaw"],
    ["0db0", "1903", "msiClaw"],
    ["0b05", "1b4c", "xboxAlly"],
]);

/** A controller's maker and product, from the name the browser gives it (lower case), or null. */
export function madeBy(id = "") {
    const chrome = /Vendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})/i.exec(id);
    const firefox = /^([0-9a-f]{4})-([0-9a-f]{4})-/i.exec(id);
    const found = chrome ?? firefox;

    return found ? { vendor: found[1].toLowerCase(), product: found[2].toLowerCase() } : null;
}

/**
 * Which handheld the game's likely on, to offer its preset (never to set it): from its controller's
 * maker and product, if the browser gives them; or else from a touch screen, a controller and the
 * screen's size in pixels (`width` and `height` as the screen's, times `ratio`, its pixels to each
 * of the page's), the handheld whose screen it is if only one has it, or "handheld" if several do.
 * Null if it doesn't look like one.
 */
export function guessHandheld({ padId = "", width = 0, height = 0, ratio = 1, touch = false } = {}) {
    const made = madeBy(padId);
    const known = made && MADE.find(([vendor, product]) => vendor === made.vendor && product === made.product);

    if (known) {
        return known[2];
    }

    if (!touch || !padId) {
        return null;
    }

    const [w, h] = [Math.round(Math.max(width, height) * ratio), Math.round(Math.min(width, height) * ratio)];
    const fits = HANDHELDS.filter((one) => one.screens.some(([sw, sh]) => sw === w && sh === h));

    if (fits.length === 1) {
        return fits[0].id;
    }

    return fits.length ? "handheld" : null;
}
