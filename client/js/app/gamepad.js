// A game controller: a PS5 controller (DualSense) paired over Bluetooth, or any other the browser
// reads with its "standard" layout (an Xbox controller, a Switch Pro, an 8BitDo). The browser
// doesn't say when a button's pressed: the controller's read once a frame
// (navigator.getGamepads()) and this frame's buttons are set beside the last's. This module only
// works out what the readings mean, apart from the page, so it's tested without one
// (test/gamepad.test.js): which buttons went down and came up, which were held (QUICK_HOLD_MS, as
// long as an Action Bar slot's hold), how far each stick's pushed once its dead zone's taken off,
// and which of the game's actions each button gives (ACTIONS, as the player's set them: Game
// options, Controls, Bindings, beside the keys: app/keys.js). app/padplay.js reads the controller
// and does what it means.
//
// The layout goes by where a button sits, not what's printed on it: the bottom face button is
// always 0 (Cross on a DualSense, A on an Xbox controller, B on a Switch Pro). So the names here are
// a DualSense's, and what's shown is the symbol of the controller in hand (SYMBOLS).
//
// Held, R2 or L2 turns the face buttons and D-pad left and right into Action Bar 1's or 2's six
// slots (BAR_SLOTS), as Final Fantasy XIV's cross hotbar does. Those six are fixed, in the order
// the bar shows its slots; the rest can be set to any button.

import { QUICK_HOLD_MS } from "./press.js";

/** The buttons of the standard layout, by their index: a DualSense's names. */
export const BUTTONS = Object.freeze(["cross", "circle", "square", "triangle", "l1", "r1", "l2", "r2", "create", "options", "l3", "r3", "up", "down", "left", "right", "ps", "touchpad"]);

/** How long a button's held before it's a hold, not a tap (ms): an Action Bar slot's. */
export const HOLD_MS = QUICK_HOLD_MS;

/** How far a trigger's pulled before it counts as down, and how far back it's let go (0 to 1). */
export const PULLED = 0.5;
const LET_GO = 0.35;

/**
 * A stick's dead zone (how far it must be pushed before it counts, as a share of its reach: a
 * worn stick drifts a little at rest), and how far counts as all the way over.
 */
export const DEAD_ZONE = 0.15;
export const EDGE = 0.95;

/** How far a stick's pushed before it picks a wheel's slice (of its reach, past the dead zone). */
export const PICKED = 0.6;

/**
 * Where a stick is, its dead zone taken off: its `x` (right) and `y` (down, as the browser gives
 * it), each from -1 to 1, and `far`, how far over it's pushed (0 at the dead zone's edge, 1 at
 * EDGE). The dead zone's round, measured on how far the stick's pushed, so a diagonal isn't cut
 * short as one taken off each way apart would be.
 */
export function stickAt(x = 0, y = 0, dead = DEAD_ZONE) {
    const reach = Math.hypot(x, y);

    if (!(reach > dead)) {
        return { x: 0, y: 0, far: 0 };
    }

    const far = Math.min(1, (reach - dead) / (EDGE - dead));

    return { x: (x / reach) * far, y: (y / reach) * far, far };
}

/**
 * Reads a controller frame by frame. Each `read` is told the controller's buttons (each
 * { pressed, value }) and sticks (axes), and the time; it says which buttons went down this frame
 * (`pressed`), which came up (`released`: each with how long it was down, and whether it had become
 * a hold), which became a hold this frame (`held`), which are down now (`down`), and where the
 * sticks are (`left`, `right`).
 */
export class PadReader {
    #down = new Map();

    /**
     * @param {{ buttons: ArrayLike<{ pressed: boolean, value: number }>, axes: ArrayLike<number> }} pad
     * @param {number} now - The time (ms).
     * @param {object} [options]
     * @param {number} [options.dead] - The sticks' dead zone (DEAD_ZONE).
     */
    read(pad, now, { dead = DEAD_ZONE } = {}) {
        const pressed = new Set();
        const released = [];
        const held = new Set();
        const down = new Set();

        BUTTONS.forEach((name, index) => {
            const button = pad.buttons?.[index];
            const was = this.#down.get(name);
            const value = typeof button === "number" ? button : (button?.value ?? 0);

            // (A trigger's down past halfway, and up again only once it's let well back, so a
            // finger resting on it halfway doesn't flicker it; any other button as it says)
            const isDown = name === "l2" || name === "r2" ? value > (was ? LET_GO : PULLED) : Boolean(button?.pressed ?? value > PULLED);

            if (isDown && !was) {
                this.#down.set(name, { at: now, held: false });
                pressed.add(name);
            } else if (!isDown && was) {
                this.#down.delete(name);
                released.push({ name, ms: now - was.at, held: was.held });
            } else if (isDown && !was.held && now - was.at >= HOLD_MS) {
                was.held = true;
                held.add(name);
            }

            if (isDown) {
                down.add(name);
            }
        });

        const axes = pad.axes ?? [];

        return { pressed, released, held, down, left: stickAt(axes[0], axes[1], dead), right: stickAt(axes[2], axes[3], dead) };
    }

    /** Forget what was held (the controller let go of: the page hidden, or it taken out). */
    reset() {
        this.#down.clear();
    }

    /** Whether a button's down now, and since when (ms), or null. */
    since(name) {
        return this.#down.get(name)?.at ?? null;
    }
}

/**
 * The game's actions a button can be set to, in the order Game options lists them, each with its
 * button as it comes (`button`; `hold` if it's that button held) and whether it's a bar's: held
 * down, turning the face buttons into its slots (`bar`).
 */
export const ACTIONS = Object.freeze([
    { id: "do", name: "Do it: talk, open, pick up, fight", button: "cross" },
    { id: "stop", name: "Stop", button: "circle" },
    { id: "unlock", name: "Let go of the foe", button: "circle", hold: true },
    { id: "pack", name: "The Pack", button: "square" },
    { id: "selfWheel", name: "Your own wheel", button: "square", hold: true },
    { id: "party", name: "The Party panel", button: "triangle" },
    { id: "theirWheel", name: "Their wheel (a foe's or a follower's)", button: "triangle", hold: true },
    { id: "nextFoe", name: "The next foe, nearest first", button: "r1" },
    { id: "lastFoe", name: "The last foe, nearest first", button: "l1" },
    { id: "nextListed", name: "The next foe in the enemies list", button: "right" },
    { id: "lastListed", name: "The last foe in the enemies list", button: "left" },
    { id: "zoomIn", name: "Zoom in", button: "up" },
    { id: "zoomOut", name: "Zoom out", button: "down" },
    { id: "walk", name: "Walk or run", button: "l3" },
    { id: "recentre", name: "The camera behind you", button: "r3" },
    { id: "bar1", name: "Action Bar 1 (held)", button: "r2", bar: true },
    { id: "bar2", name: "Action Bar 2 (held)", button: "l2", bar: true },
    { id: "menu", name: "The menu", button: "options" },
    { id: "map", name: "The world map", button: "create" },
    { id: "panels", name: "The ring of panels", button: "create", hold: true },
]);

/** The buttons an action can be set to: all but the PS button, which the system keeps. */
export const BINDABLE = Object.freeze(BUTTONS.filter((name) => name !== "ps"));

/** An action's button as it's kept: the button's name, and ":hold" if it's that button held. */
export const bindingOf = (action) => `${action.button}${action.hold ? ":hold" : ""}`;

const BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));
const BINDING = /^([a-z0-9]+)(:hold)?$/;

/**
 * Every action's button: as it comes, with what the player's set (`saved`: { action id: "r1" or
 * "square:hold", or "" for none }) over it, anything unknown or no longer bindable left as it comes.
 */
export function bindingsOf(saved = {}) {
    const bindings = {};

    for (const action of ACTIONS) {
        const mine = saved?.[action.id];
        const match = typeof mine === "string" ? BINDING.exec(mine) : null;
        const fits = mine === "" || (match && BINDABLE.includes(match[1]) && !(action.bar && match[2]));

        bindings[action.id] = fits ? mine : bindingOf(action);
    }

    return bindings;
}

/**
 * An action set to another button (`binding`, as bindingsOf keeps them; "" for none), in a copy:
 * whatever else had that button lets it go (left with none: Game options says which), so no two
 * share. A bar's trigger is the bar's alone: set to a button, nothing else has it, tapped or held;
 * and a bar's action can't be set to a button held (it's held anyway).
 */
export function rebind(bindings, id, binding) {
    const action = BY_ID.get(id);
    const match = typeof binding === "string" ? BINDING.exec(binding) : null;

    if (action && binding === "") {
        return { ...bindings, [id]: "" };
    }

    if (!action || !match || !BINDABLE.includes(match[1]) || (action.bar && match[2])) {
        return { ...bindings };
    }

    const next = { ...bindings };

    for (const other of ACTIONS) {
        const theirs = BINDING.exec(next[other.id] ?? "");

        if (other.id !== id && theirs && (next[other.id] === binding || (theirs[1] === match[1] && (action.bar || other.bar)))) {
            next[other.id] = "";
        }
    }

    next[id] = binding;

    return next;
}

/** The actions that had a button before (`before`) and have none now (`after`): those a button was taken from. */
export const takenFrom = (before, after) => ACTIONS.filter((action) => before[action.id] && !after[action.id]).map((action) => action.id);

/** Whether every action's set as it comes. */
export const asTheyCome = (bindings) => ACTIONS.every((action) => bindings[action.id] === bindingOf(action));

/** Cross and Circle, swapped (Game options: Swap × and ○), and the rest as they are. */
const SWAPPED = Object.freeze({ cross: "circle", circle: "cross" });

/** A button's name as it's read with Cross and Circle swapped, or not. */
export const swapped = (name, swap) => (swap ? (SWAPPED[name] ?? name) : name);

/**
 * What each button does, from the actions' buttons (`bindings`): { button: { tap, hold, bar } },
 * each an action's id or null. A button with a hold to give fires its tap as it comes up, not as
 * it goes down (it isn't known till then which it is); one without fires the moment it's pressed.
 * With Cross and Circle swapped (`swap`), what's set on one is done by the other.
 */
export function buttonsOf(bindings, { swap = false } = {}) {
    const buttons = {};

    for (const name of BUTTONS) {
        buttons[name] = { tap: null, hold: null, bar: null };
    }

    for (const action of ACTIONS) {
        const match = BINDING.exec(bindings[action.id] ?? bindingOf(action));

        if (!match) {
            continue;
        }

        const name = swapped(match[1], swap);
        const kind = action.bar ? "bar" : match[2] ? "hold" : "tap";

        buttons[name][kind] = action.id;
    }

    return buttons;
}

/**
 * What a frame's readings (PadReader.read) ask for, with what each button does (buttonsOf): the
 * actions to do now, in order. A button that's a bar's does nothing else; one with a hold fires its
 * hold once held (HOLD_MS), and its tap only if it came up before then; one without fires its tap
 * on the press.
 */
export function actionsOf(reading, buttons) {
    const done = [];

    for (const name of reading.pressed) {
        const does = buttons[name];

        if (does && !does.bar && !does.hold && does.tap) {
            done.push(does.tap);
        }
    }

    for (const name of reading.held) {
        const does = buttons[name];

        if (does && !does.bar && does.hold) {
            done.push(does.hold);
        }
    }

    for (const { name, held } of reading.released) {
        const does = buttons[name];

        if (does && !does.bar && does.hold && does.tap && !held) {
            done.push(does.tap);
        }
    }

    return done;
}

/**
 * The buttons that use an Action Bar's slots while its trigger's held, in the order the bar shows
 * them: Square, Triangle, Circle and Cross for 1 to 4, D-pad left and right for 5 and 6. (Fixed,
 * whatever's set: they follow the bar on the screen.)
 */
export const BAR_SLOTS = Object.freeze(["square", "triangle", "circle", "cross", "left", "right"]);

/** The Action Bar (1 or 2) held down now, by its trigger (the one pressed last, both held), or 0. */
export function barHeld(reading, buttons, reader) {
    let bar = 0;
    let since = -Infinity;

    for (const name of reading.down) {
        const which = buttons[name]?.bar;
        const at = reader?.since(name) ?? 0;

        if ((which === "bar1" || which === "bar2") && at >= since) {
            bar = which === "bar1" ? 1 : 2;
            since = at;
        }
    }

    return bar;
}

/** The symbols shown for each kind of controller's buttons (button names: BUTTONS). */
export const SYMBOLS = Object.freeze({
    playstation: Object.freeze({ cross: "✕", circle: "○", square: "□", triangle: "△", l1: "L1", r1: "R1", l2: "L2", r2: "R2", create: "Create", options: "Options", l3: "L3", r3: "R3", up: "↑", down: "↓", left: "←", right: "→", ps: "PS", touchpad: "Touchpad" }),
    xbox: Object.freeze({ cross: "A", circle: "B", square: "X", triangle: "Y", l1: "LB", r1: "RB", l2: "LT", r2: "RT", create: "View", options: "Menu", l3: "LS", r3: "RS", up: "↑", down: "↓", left: "←", right: "→", ps: "Xbox", touchpad: "Share" }),
    nintendo: Object.freeze({ cross: "B", circle: "A", square: "Y", triangle: "X", l1: "L", r1: "R", l2: "ZL", r2: "ZR", create: "−", options: "+", l3: "LS", r3: "RS", up: "↑", down: "↓", left: "←", right: "→", ps: "Home", touchpad: "Capture" }),
});

/** The names Game options gives each kind of symbols. */
export const SYMBOL_NAMES = Object.freeze({ auto: "Match the controller", playstation: "PlayStation", xbox: "Xbox", nintendo: "Nintendo" });

/**
 * Which symbols a controller's buttons are shown with, from the name the browser gives it (its
 * `id`: Sony's vendor number is 054c, Microsoft's 045e, Nintendo's 057e), or from what's set (a
 * kind of SYMBOLS, or "auto"). Anything not known shows an Xbox controller's letters, as most do.
 */
export function symbolsFor(id = "", chosen = "auto") {
    if (chosen && chosen !== "auto" && SYMBOLS[chosen]) {
        return chosen;
    }

    if (/054c|dualsense|dualshock|playstation|sony/i.test(id)) {
        return "playstation";
    }

    if (/057e|nintendo|switch|joy-con/i.test(id)) {
        return "nintendo";
    }

    return "xbox";
}

/** A button's symbol, in a kind of symbols (SYMBOLS). */
export const symbolOf = (name, kind = "playstation") => SYMBOLS[kind]?.[name] ?? SYMBOLS.playstation[name] ?? name;

/** A button as it's kept (bindingsOf), said: its symbol, and "held" if it's held. */
export function bindingWords(binding, kind = "playstation") {
    const match = BINDING.exec(binding ?? "");

    return match ? `${symbolOf(match[1], kind)}${match[2] ? " held" : ""}` : "";
}

/**
 * Which of `count` slices round a wheel a stick points into (0 the top, then clockwise), or -1 if
 * it isn't pushed far enough over (`least`, of its reach) to pick one.
 */
export function sliceOf({ x, y, far }, count = 8, least = PICKED) {
    if (!(far >= least)) {
        return -1;
    }

    // (Clockwise from the top: up the stick is y below 0)
    const angle = Math.atan2(x, -y);
    const step = (Math.PI * 2) / count;

    return ((Math.round(angle / step) % count) + count) % count;
}

/**
 * The next thing to move to from `from` the way pressed (`way`: "up", "down", "left" or "right"),
 * among `rects` (each { x, y, width, height }, as getBoundingClientRect gives them): its index, or
 * -1 if there's nothing that way. Only those whose middle is past `from`'s middle that way count;
 * of them, the nearest that way, sideways distance counting twice over (so the one straight below
 * is chosen over one nearer but well off to the side), and none if it doesn't overlap at all.
 */
export function nearestThatWay(from, rects, way) {
    const [fx, fy] = [from.x + from.width / 2, from.y + from.height / 2];
    const across = way === "left" || way === "right";
    const sign = way === "down" || way === "right" ? 1 : -1;
    let best = -1;
    let score = Infinity;

    rects.forEach((rect, index) => {
        const [cx, cy] = [rect.x + rect.width / 2, rect.y + rect.height / 2];
        const ahead = (across ? cx - fx : cy - fy) * sign;

        if (ahead <= 1) {
            return;
        }

        // (How far apart they are sideways: none if they overlap that way)
        const side = across ? Math.max(0, Math.max(rect.y, from.y) - Math.min(rect.y + rect.height, from.y + from.height)) : Math.max(0, Math.max(rect.x, from.x) - Math.min(rect.x + rect.width, from.x + from.width));
        const offset = across ? Math.abs(cy - fy) : Math.abs(cx - fx);
        const value = ahead + side * 2 + offset * 0.25;

        if (value < score) {
            best = index;
            score = value;
        }
    });

    return best;
}

/**
 * What's in front of the player to act on (stage 2 of controller play: Cross does it), among
 * `things` (each { key, x, z }, on the ground): the nearest within `reach` (metres) that's within
 * `cone` (radians) either side of the way they face (`facing`, as core/battle.js means it: along
 * sin, cos), or within `near` whatever way it is; its angle off the way they face counts against it
 * as much as its distance. The one picked last (`kept`, its key) stays picked while it's still in
 * front and no more than a quarter further than the best, so the pick doesn't flicker between two
 * close by.
 */
export function pickInFront(things, { x, z, facing, reach = 6, cone = Math.PI / 3, near = 1.5, kept = null }) {
    const [sin, cos] = [Math.sin(facing), Math.cos(facing)];
    let best = null;
    let keptOne = null;

    for (const thing of things) {
        const [dx, dz] = [thing.x - x, thing.z - z];
        const far = Math.hypot(dx, dz);

        if (far > (thing.reach ?? reach)) {
            continue;
        }

        const off = far > 0 ? Math.acos(Math.max(-1, Math.min(1, (dx * sin + dz * cos) / far))) : 0;

        if (off > cone && far > near) {
            continue;
        }

        const score = far * (1 + Math.min(off, Math.PI) / cone);
        const scored = { thing, score };

        if (!best || score < best.score) {
            best = scored;
        }

        if (kept !== null && thing.key === kept) {
            keptOne = scored;
        }
    }

    if (keptOne && best && keptOne.score <= best.score * 1.25) {
        return keptOne.thing;
    }

    return best?.thing ?? null;
}

/** The letters a world's code is made of, in order (a code's four of them: app/rejoin.js). */
export const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A code's letter turned `step` on (1 or -1), round from Z to A and back. */
export function stepLetter(letter, step) {
    const at = typeof letter === "string" && letter.length === 1 ? CODE_LETTERS.indexOf(letter.toUpperCase()) : -1;
    const from = at < 0 ? (step > 0 ? -1 : 0) : at;

    return CODE_LETTERS[(((from + step) % CODE_LETTERS.length) + CODE_LETTERS.length) % CODE_LETTERS.length];
}

/**
 * The on-screen keyboard's keys, row by row (app/padkeys.js): letters, numbers and the marks names
 * and chat use; "shift", "space", "back" (delete the letter before), and "done".
 */
export const KEY_ROWS = Object.freeze([
    Object.freeze(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]),
    Object.freeze(["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"]),
    Object.freeze(["a", "s", "d", "f", "g", "h", "j", "k", "l", "'"]),
    Object.freeze(["shift", "z", "x", "c", "v", "b", "n", "m", "-", "back"]),
    Object.freeze([",", ".", "?", "!", "space", ":", "/", "done"]),
]);

/** A key's letter as typed, Shift held or not (a mark's the same either way). */
export const keyLetter = (key, shift) => (key.length === 1 ? (shift ? key.toUpperCase() : key) : key === "space" ? " " : "");

/**
 * Rumble: what each kind shakes, and for how long (ms); the weak motor's the right handle's,
 * quick and light, the strong one the left's, deep. A heartbeat's two beats, a moment apart, while
 * the player's low on health (HEART: under `low` of their health, once every `every` ms); a slam
 * (a boss's blow on the ground, a boulder landing near, a giant's step) one deep thud.
 */
export const RUMBLE = Object.freeze({
    beat: Object.freeze({ duration: 90, weakMagnitude: 0.25, strongMagnitude: 0.55 }),
    slam: Object.freeze({ duration: 260, weakMagnitude: 0.4, strongMagnitude: 1 }),
});

export const HEART = Object.freeze({ low: 0.25, every: 1100, between: 180 });

/** A rumble at a strength (0 to 1, Game options), its motors scaled; or null if it's off. */
export function rumbleAt(kind, strength = 1, scale = 1) {
    const effect = RUMBLE[kind];
    const by = Math.max(0, Math.min(1, strength * scale));

    if (!effect || by <= 0) {
        return null;
    }

    return { duration: effect.duration, startDelay: 0, weakMagnitude: Math.min(1, effect.weakMagnitude * by), strongMagnitude: Math.min(1, effect.strongMagnitude * by) };
}

/** Whether a heartbeat's due: the player alive and under HEART.low of their health, the last beat long enough ago. */
export const heartDue = (share, last, now) => share > 0 && share < HEART.low && now - last >= HEART.every;
