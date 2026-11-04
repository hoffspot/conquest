// The keys and mouse buttons that do the game's actions, as they come and as the player's set them
// (Game options, Controls, Bindings): what each action is, where it can be done, which two keys
// (or mouse buttons) do it, what a key pressed is called as it's kept, and which actions a press
// asks for where the player is. No page here, so it's tested without one (test/keys.test.js);
// app/keyplay.js listens to the keys and the mouse and does what they ask.
//
// A key's kept by where it sits on the keyboard (KeyboardEvent.code: "KeyW" is the key W is on in
// English, whatever's printed on it), so moving round the keys works on any layout; it's shown as
// the keyboard in hand prints it where the browser says (navigator.keyboard's layout map), or as an
// English keyboard does. Ctrl, Alt and Shift go before it ("Shift+Tab"). Shift, Ctrl or Alt alone
// can be set too ("Shift": either Shift). A mouse button's kept by its number ("Mouse2": the right
// button; the left button's the game's own tap, and the wheel zooms, so neither's set here).
//
// Every action has two: its main key and a spare. One key does only one action where the player is
// (in the world, talking, or reading a book: SCOPES); set on another, the action that had it lets
// it go (setKey: `taken`, to say so). The menu's key goes for every scope (Escape, as it comes: it
// also closes a panel, stops a talk and puts a wheel away).

/** Where an action's done: in the world, talking, reading a book, or anywhere ("any"). */
export const SCOPES = Object.freeze(["world", "talk", "reading", "any"]);

/** The page's groups of actions, in order, and what each is called. */
export const GROUPS = Object.freeze([
    Object.freeze({ id: "moving", name: "Moving" }),
    Object.freeze({ id: "camera", name: "The camera" }),
    Object.freeze({ id: "fighting", name: "Doing and fighting" }),
    Object.freeze({ id: "bar", name: "The Action Bar" }),
    Object.freeze({ id: "panels", name: "Panels and the menu" }),
    Object.freeze({ id: "talk", name: "Talking" }),
    Object.freeze({ id: "reading", name: "Reading a book" }),
]);

const action = (id, name, group, keys, { scope = "world", held = false } = {}) => Object.freeze({ id, name, group, scope, held, keys: Object.freeze([keys[0] ?? null, keys[1] ?? null]) });

/**
 * The game's actions keys can do, in the order the page lists them, each with its two keys as they
 * come (`keys`: main and spare, either null), where it's done (`scope`), and whether it's done for
 * as long as it's held (`held`: moving, walking, turning the camera) rather than once as it's
 * pressed. An action a controller does too has the same id as its (app/gamepad.js ACTIONS).
 */
export const KEY_ACTIONS = Object.freeze([
    action("forward", "Forward", "moving", ["KeyW", "ArrowUp"], { held: true }),
    action("back", "Back", "moving", ["KeyS", "ArrowDown"], { held: true }),
    action("left", "Left", "moving", ["KeyA", "ArrowLeft"], { held: true }),
    action("right", "Right", "moving", ["KeyD", "ArrowRight"], { held: true }),
    action("walk", "Walk, not run (a key held; a controller's button switches)", "moving", ["Shift"], { held: true }),
    action("turnLeft", "Turn the camera left (held)", "camera", ["KeyQ"], { held: true }),
    action("turnRight", "Turn the camera right (held)", "camera", ["KeyE"], { held: true }),
    action("recentre", "The camera behind you", "camera", ["KeyR"]),
    action("zoomIn", "Zoom in", "camera", ["Equal", "NumpadAdd"]),
    action("zoomOut", "Zoom out", "camera", ["Minus", "NumpadSubtract"]),
    action("do", "Do it: talk, open, pick up, fight", "fighting", ["KeyF"]),
    action("stop", "Stop", "fighting", ["KeyC"]),
    action("unlock", "Let go of the foe", "fighting", ["KeyV"]),
    action("nextFoe", "The next foe, nearest first", "fighting", ["Tab"]),
    action("lastFoe", "The last foe, nearest first", "fighting", ["Shift+Tab"]),
    action("nextListed", "The next foe in the enemies list", "fighting", ["KeyX"]),
    action("lastListed", "The last foe in the enemies list", "fighting", ["KeyZ"]),
    action("selfWheel", "Your own wheel (held)", "fighting", ["KeyG"]),
    action("theirWheel", "Their wheel: a foe's or a follower's (held)", "fighting", ["KeyT"]),
    ...[1, 2, 3, 4, 5, 6].map((slot) => action(`slot${slot}`, `Action Bar slot ${slot}`, "bar", [`Digit${slot}`, `Numpad${slot}`])),
    action("swapBar", "Swap Action Bars 1 and 2", "bar", ["Backquote"]),
    action("pack", "The Pack", "panels", ["KeyI"]),
    action("journal", "The Journal", "panels", ["KeyJ"]),
    action("spellbook", "The Spellbook", "panels", ["KeyB"]),
    action("party", "The Party panel", "panels", ["KeyP"]),
    action("chat", "The party's chat", "panels", ["Enter"]),
    action("map", "The world map", "panels", ["KeyM"]),
    action("panels", "The ring of panels (held)", "panels", ["KeyO"]),
    action("menu", "The menu, or back out of what's open", "panels", ["Escape"], { scope: "any" }),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((line) => action(`say${line}`, `Say line ${line}`, "talk", [`Digit${line}`, `Numpad${line}`], { scope: "talk" })),
    action("pageBack", "The page before", "reading", ["ArrowLeft"], { scope: "reading" }),
    action("pageOn", "The next page", "reading", ["ArrowRight"], { scope: "reading" }),
]);

const BY_ID = new Map(KEY_ACTIONS.map((one) => [one.id, one]));

/** The mouse buttons that can be set (MouseEvent.button: 1 the middle, 2 the right, 3 back, 4 forward). */
export const MOUSE_BUTTONS = Object.freeze([1, 2, 3, 4]);

// Ctrl, Alt and Shift alone, as they're kept, from the keys' codes
const MODIFIER_KEYS = Object.freeze({ ShiftLeft: "Shift", ShiftRight: "Shift", ControlLeft: "Control", ControlRight: "Control", AltLeft: "Alt", AltRight: "Alt" });
const MODIFIERS = Object.freeze(["Ctrl", "Alt", "Shift"]);

// A key as it's kept: Ctrl, Alt and Shift before it (in that order), and its code; a modifier
// alone; or a mouse button
const KEY = /^(?:(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Z][A-Za-z0-9]*)|Shift|Control|Alt|Mouse[1-4])$/;

// Keys never set: the system's, and those the browser doesn't name
const NEVER = new Set(["MetaLeft", "MetaRight", "OSLeft", "OSRight", "ContextMenu", "Unidentified", "Fn", "FnLock", "CapsLock", "NumLock", "ScrollLock", "PrintScreen"]);

/** Whether a key's kept as it should be (KEY), and not one never set; a mouse button alone. */
export const isKey = (key) => typeof key === "string" && KEY.test(key) && !NEVER.has(key.split("+").at(-1)) && (!/Mouse/.test(key) || /^Mouse[1-4]$/.test(key));

/** Whether a key's a mouse button. */
export const isMouse = (key) => typeof key === "string" && /^Mouse[1-4]$/.test(key);

/**
 * A key pressed (a KeyboardEvent's `code`, and whether Ctrl, Alt and Shift were held), as it's
 * kept: "Shift+Tab", "KeyW"; Shift, Ctrl or Alt alone as "Shift", "Control" or "Alt"; or null for
 * a key that can't be set (the Windows or Command key, or one with it held; one the browser
 * doesn't name).
 */
export function keyOf({ code, ctrlKey = false, altKey = false, shiftKey = false, metaKey = false }) {
    if (!code || metaKey || NEVER.has(code)) {
        return null;
    }

    if (MODIFIER_KEYS[code]) {
        return MODIFIER_KEYS[code];
    }

    const key = `${ctrlKey ? "Ctrl+" : ""}${altKey ? "Alt+" : ""}${shiftKey ? "Shift+" : ""}${code}`;

    return isKey(key) ? key : null;
}

/** A mouse button pressed (MouseEvent.button), as it's kept ("Mouse2"), or null for one not set (the left, the game's tap). */
export const mouseOf = (button) => (MOUSE_BUTTONS.includes(button) ? `Mouse${button}` : null);

/** A key without Ctrl, Alt or Shift before it: what an action held is set to. */
export const bare = (key) => (typeof key === "string" ? key.replace(/^(?:(?:Ctrl|Alt|Shift)\+)+/, "") : key);

/** An action's two keys as they come. */
export const keysAsTheyCome = (id) => [...(BY_ID.get(id)?.keys ?? [null, null])];

/**
 * Every action's two keys: as they come, with what the player's set (`saved`: { action id: [main,
 * spare] }, either null for none) over them; anything unknown or not a key left as it comes. An
 * action held is set to a key alone (its Ctrl, Alt or Shift dropped).
 */
export function keysOf(saved = {}) {
    const keys = {};

    for (const one of KEY_ACTIONS) {
        const mine = saved?.[one.id];
        const fits = Array.isArray(mine) && mine.length === 2 && mine.every((key) => key === null || isKey(key));

        keys[one.id] = fits ? mine.map((key) => (one.held ? bare(key) : key)) : [...one.keys];
    }

    return keys;
}

/** Whether two scopes can be in at once (so a key can't do an action in each): the same, or either "any". */
export const overlap = (a, b) => a === b || a === "any" || b === "any";

/**
 * An action's main (`slot` 0) or spare (1) key set to `key` (null: none), in a copy: whatever else
 * had that key where the action's done lets it go (its slot left empty). Says what it's taken from
 * (`taken`: [{ id, slot }]). An action held is set to the key alone.
 */
export function setKey(keys, id, slot, key) {
    const one = BY_ID.get(id);
    const next = Object.fromEntries(Object.entries(keys).map(([each, two]) => [each, [...two]]));

    if (!one || (slot !== 0 && slot !== 1) || (key !== null && !isKey(key))) {
        return { keys: next, taken: [] };
    }

    const set = one.held && key !== null ? bare(key) : key;
    const taken = [];

    if (set !== null) {
        for (const other of KEY_ACTIONS) {
            next[other.id].forEach((theirs, at) => {
                if (theirs === set && (other.id !== id || at !== slot) && overlap(other.scope, one.scope)) {
                    next[other.id][at] = null;

                    if (other.id !== id) {
                        taken.push({ id: other.id, slot: at });
                    }
                }
            });
        }
    }

    next[id][slot] = set;

    return { keys: next, taken };
}

/** Whether every action's keys are as they come. */
export const keysAsCame = (keys) => KEY_ACTIONS.every((one) => keys[one.id]?.[0] === one.keys[0] && keys[one.id]?.[1] === one.keys[1]);

/** The keys set otherwise than they come, as they're kept (Game options' `keyBindings`): { action id: [main, spare] }. */
export function keysChanged(keys) {
    const changed = {};

    for (const one of KEY_ACTIONS) {
        const two = keys[one.id];

        if (two && (two[0] !== one.keys[0] || two[1] !== one.keys[1])) {
            changed[one.id] = [two[0] ?? null, two[1] ?? null];
        }
    }

    return changed;
}

/**
 * What each key does where the player is (`scopes`: those they're in, the first first: reading a
 * book, its keys before the world's): { key: action id }.
 */
export function keyMap(keys, scopes = ["world"]) {
    const map = new Map();

    for (const scope of [...scopes, "any"]) {
        for (const one of KEY_ACTIONS) {
            if (one.scope !== scope) {
                continue;
            }

            for (const key of keys[one.id] ?? []) {
                if (key !== null && !map.has(key)) {
                    map.set(key, one.id);
                }
            }
        }
    }

    return map;
}

/**
 * The action a key pressed asks for (`key`, as keyOf keeps it), from what each key does (keyMap):
 * the key as it is; or, if nothing has it with Shift held, the key without it (Shift held to walk
 * while I's pressed still opens the Pack); or null.
 */
export function actionFor(map, key) {
    if (!key) {
        return null;
    }

    return map.get(key) ?? (key.includes("Shift+") ? (map.get(key.replace("Shift+", "")) ?? null) : null);
}

/** The actions held (`held`) a key down does, whatever else is held with it: its code alone, or a modifier. */
export function heldBy(keys, code) {
    const key = MODIFIER_KEYS[code] ?? code;

    return KEY_ACTIONS.filter((one) => one.held && keys[one.id]?.includes(key)).map((one) => one.id);
}

// How a key's shown, by its code, on an English keyboard (a letter's and a digit's from its code)
const SHOWN = Object.freeze({
    Shift: "Shift",
    Control: "Ctrl",
    Alt: "Alt",
    Escape: "Esc",
    Enter: "Enter",
    Tab: "Tab",
    Space: "Space",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "Page Up",
    PageDown: "Page Down",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    IntlBackslash: "\\",
    NumpadAdd: "Num +",
    NumpadSubtract: "Num -",
    NumpadMultiply: "Num *",
    NumpadDivide: "Num /",
    NumpadDecimal: "Num .",
    NumpadEnter: "Num Enter",
    Mouse1: "Middle click",
    Mouse2: "Right click",
    Mouse3: "Mouse back",
    Mouse4: "Mouse forward",
});

/**
 * A key as it's shown: "Shift+Tab", "W", "↑", "Right click". `layout` (a Map from codes to what the
 * keyboard in hand prints there, as navigator.keyboard.getLayoutMap() gives it) names a letter or
 * mark as that keyboard does; without it, as an English one does. None, an empty string.
 */
export function keyWords(key, layout = null) {
    if (!key) {
        return "";
    }

    const code = bare(key);
    const mods = MODIFIERS.filter((mod) => key.includes(`${mod}+`)).map((mod) => `${mod}+`).join("");
    const printed = layout?.get?.(code);
    let shown = SHOWN[code];

    if (!shown && /^Key[A-Z]$/.test(code)) {
        shown = code.slice(3);
    } else if (!shown && /^Digit[0-9]$/.test(code)) {
        shown = code.slice(5);
    } else if (!shown && /^Numpad[0-9]$/.test(code)) {
        shown = `Num ${code.slice(6)}`;
    } else if (!shown && /^F[0-9]{1,2}$/.test(code)) {
        shown = code;
    }

    // (What the keyboard in hand prints, for a letter or a mark: a key alone named as it is)
    if (printed && /^(Key[A-Z]|Digit[0-9]|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash)$/.test(code)) {
        shown = printed.length === 1 ? printed.toUpperCase() : printed;
    }

    return `${mods}${shown ?? code}`;
}

/** An action's keys as they're shown together: "W or ↑", one alone, or "none". */
export function actionKeyWords(keys, id, layout = null) {
    const shown = (keys[id] ?? []).filter(Boolean).map((key) => keyWords(key, layout));

    return shown.length ? shown.join(" or ") : "none";
}

/** An action by its id. */
export const keyAction = (id) => BY_ID.get(id) ?? null;
