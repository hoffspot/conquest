// The keys and mouse buttons for the game's actions (client/js/app/keys.js): a key pressed as it's
// kept (where it sits, with Ctrl, Alt and Shift; a modifier alone; the mouse's other buttons),
// every action's two keys as they come and as they're set, a key set taken from whatever had it
// where the player is (and said), which action a key asks for (Shift held to walk still letting a
// key do its own), the keys held, and how keys are shown.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionFor, actionKeyWords, bare, heldBy, isKey, KEY_ACTIONS, keyMap, keyOf, keysAsCame, keysChanged, keysOf, keyWords, mouseOf, setKey } from "../client/js/app/keys.js";

describe("a key pressed", () => {
    it("is kept by where it sits, with Ctrl, Alt and Shift before it in that order", () => {
        assert.equal(keyOf({ code: "KeyW" }), "KeyW");
        assert.equal(keyOf({ code: "Tab", shiftKey: true }), "Shift+Tab");
        assert.equal(keyOf({ code: "KeyK", ctrlKey: true, altKey: true, shiftKey: true }), "Ctrl+Alt+Shift+KeyK");
        assert.equal(keyOf({ code: "Escape" }), "Escape");
    });

    it("is a modifier alone as either side, and never the system's key nor one with it held", () => {
        assert.equal(keyOf({ code: "ShiftLeft", shiftKey: true }), "Shift");
        assert.equal(keyOf({ code: "ShiftRight", shiftKey: true }), "Shift");
        assert.equal(keyOf({ code: "ControlLeft", ctrlKey: true }), "Control");
        assert.equal(keyOf({ code: "AltRight", altKey: true }), "Alt");
        assert.equal(keyOf({ code: "MetaLeft", metaKey: true }), null);
        assert.equal(keyOf({ code: "KeyC", metaKey: true }), null);
        assert.equal(keyOf({ code: "" }), null);
        assert.equal(keyOf({ code: "Unidentified" }), null);
    });

    it("can be the mouse's middle, right, back or forward button, not the left (the game's tap)", () => {
        assert.deepEqual([0, 1, 2, 3, 4, 5].map(mouseOf), [null, "Mouse1", "Mouse2", "Mouse3", "Mouse4", null]);
        assert.ok(isKey("Mouse2"));
        assert.ok(!isKey("Mouse9"));
        assert.ok(!isKey("Shift+Mouse2"));
        assert.ok(!isKey("nonsense"));
    });
});

describe("every action's keys", () => {
    it("come as the game always had them, a main and a spare", () => {
        const keys = keysOf();

        assert.deepEqual(keys.forward, ["KeyW", "ArrowUp"]);
        assert.deepEqual(keys.walk, ["Shift", null]);
        assert.deepEqual(keys.lastFoe, ["Shift+Tab", null]);
        assert.deepEqual(keys.menu, ["Escape", null]);
        assert.deepEqual(keys.slot1, ["Digit1", "Numpad1"]);
        assert.deepEqual(keys.say9, ["Digit9", "Numpad9"]);
        assert.deepEqual(keys.do, ["KeyF", null]);
        assert.ok(keysAsCame(keys));
        assert.deepEqual(keysChanged(keys), {});
    });

    it("have no key doing two things where the player is, as they come", () => {
        const keys = keysOf();

        for (const scopes of [["world"], ["talk"], ["reading", "world"]]) {
            const seen = new Map();

            for (const one of KEY_ACTIONS.filter((each) => each.scope === "any" || scopes.includes(each.scope))) {
                for (const key of keys[one.id].filter(Boolean)) {
                    const other = seen.get(key);

                    // (Reading, the arrows turn the pages as the world's would walk: the book's first)
                    assert.ok(!other || (scopes.includes("reading") && (one.scope === "reading" || other.scope === "reading")), `${key}: ${other?.id} and ${one.id}`);
                    seen.set(key, one);
                }
            }
        }
    });

    it("are read from what's kept, anything unknown left as it comes, an action held to its key alone", () => {
        const keys = keysOf({ forward: ["Shift+KeyI", null], pack: ["nonsense", null], party: ["KeyP"], journal: [null, null], unknown: ["KeyQ", null] });

        assert.deepEqual(keys.forward, ["KeyI", null]);
        assert.deepEqual(keys.pack, ["KeyI", null]);
        assert.deepEqual(keys.party, ["KeyP", null]);
        assert.deepEqual(keys.journal, [null, null]);
        assert.equal(Object.keys(keys).length, KEY_ACTIONS.length);
    });
});

describe("setting a key", () => {
    it("gives it to the action and takes it from whatever had it where the action's done, saying so", () => {
        const { keys, taken } = setKey(keysOf(), "pack", 0, "KeyJ");

        assert.deepEqual(keys.pack, ["KeyJ", null]);
        assert.deepEqual(keys.journal, [null, null]);
        assert.deepEqual(taken, [{ id: "journal", slot: 0 }]);
        assert.ok(!keysAsCame(keys));
        assert.deepEqual(keysChanged(keys), { pack: ["KeyJ", null], journal: [null, null] });
    });

    it("leaves a key alone where the other's done elsewhere: the talk's lines and the Action Bar's slots share the digits", () => {
        const { keys, taken } = setKey(keysOf(), "say1", 0, "Digit2");

        assert.deepEqual(keys.say1, ["Digit2", "Numpad1"]);
        assert.deepEqual(keys.say2, [null, "Numpad2"]);
        assert.deepEqual(keys.slot2, ["Digit2", "Numpad2"]);
        assert.deepEqual(taken, [{ id: "say2", slot: 0 }]);
    });

    it("takes the menu's key from wherever, as the menu's done everywhere", () => {
        const { keys, taken } = setKey(keysOf(), "say3", 1, "Escape");

        assert.deepEqual(keys.menu, [null, null]);
        assert.deepEqual(taken, [{ id: "menu", slot: 0 }]);
    });

    it("moves a key from the action's other slot rather than keeping it twice, and can clear a slot", () => {
        const moved = setKey(keysOf(), "forward", 1, "KeyW").keys;

        assert.deepEqual(moved.forward, [null, "KeyW"]);
        assert.deepEqual(setKey(keysOf(), "forward", 1, null).keys.forward, ["KeyW", null]);
    });

    it("sets an action held to its key alone, and refuses what isn't a key", () => {
        assert.deepEqual(setKey(keysOf(), "forward", 0, "Shift+KeyI").keys.forward, ["KeyI", "ArrowUp"]);
        assert.deepEqual(setKey(keysOf(), "forward", 0, "Mouse9").keys.forward, ["KeyW", "ArrowUp"]);
        assert.deepEqual(setKey(keysOf(), "forward", 2, "KeyI").keys.forward, ["KeyW", "ArrowUp"]);
        assert.equal(bare("Ctrl+Shift+KeyK"), "KeyK");
    });
});

describe("what a key asks for", () => {
    it("goes by where the player is: the world's, the talk's, a book's before the world's; the menu's everywhere", () => {
        const keys = keysOf();

        assert.equal(actionFor(keyMap(keys, ["world"]), "KeyI"), "pack");
        assert.equal(actionFor(keyMap(keys, ["world"]), "Digit1"), "slot1");
        assert.equal(actionFor(keyMap(keys, ["talk"]), "Digit1"), "say1");
        assert.equal(actionFor(keyMap(keys, ["talk"]), "KeyI"), null);
        assert.equal(actionFor(keyMap(keys, ["talk"]), "Escape"), "menu");
        assert.equal(actionFor(keyMap(keys, ["reading", "world"]), "ArrowLeft"), "pageBack");
        assert.equal(actionFor(keyMap(keys, ["world"]), "ArrowLeft"), "left");
    });

    it("is the key with Shift held, or without it if nothing has that: Shift held to walk doesn't stop I opening the Pack", () => {
        const map = keyMap(keysOf(), ["world"]);

        assert.equal(actionFor(map, "Shift+Tab"), "lastFoe");
        assert.equal(actionFor(map, "Tab"), "nextFoe");
        assert.equal(actionFor(map, "Shift+KeyI"), "pack");
        assert.equal(actionFor(map, "Ctrl+KeyI"), null);
        assert.equal(actionFor(map, null), null);
    });

    it("held: the actions a key down does, whatever's held with it; a modifier by either side; a mouse button set to a way", () => {
        const keys = setKey(keysOf(), "forward", 1, "Mouse4").keys;

        assert.deepEqual(heldBy(keys, "KeyW"), ["forward"]);
        assert.deepEqual(heldBy(keys, "ShiftRight"), ["walk"]);
        assert.deepEqual(heldBy(keys, "KeyQ"), ["turnLeft"]);
        assert.deepEqual(heldBy(keys, "Mouse4"), ["forward"]);
        assert.deepEqual(heldBy(keys, "KeyI"), []);
    });
});

describe("keys as they're shown", () => {
    it("as an English keyboard has them, with what's held before them", () => {
        assert.equal(keyWords("KeyW"), "W");
        assert.equal(keyWords("Shift+Tab"), "Shift+Tab");
        assert.equal(keyWords("Digit1"), "1");
        assert.equal(keyWords("Numpad1"), "Num 1");
        assert.equal(keyWords("ArrowUp"), "↑");
        assert.equal(keyWords("Backquote"), "`");
        assert.equal(keyWords("Escape"), "Esc");
        assert.equal(keyWords("Mouse2"), "Right click");
        assert.equal(keyWords("F5"), "F5");
        assert.equal(keyWords(null), "");
    });

    it("as the keyboard in hand prints them, where the browser says", () => {
        const azerty = new Map([
            ["KeyW", "z"],
            ["KeyQ", "a"],
            ["Digit1", "&"],
        ]);

        assert.equal(keyWords("KeyW", azerty), "Z");
        assert.equal(keyWords("Shift+KeyQ", azerty), "Shift+A");
        assert.equal(keyWords("Digit1", azerty), "&");
        assert.equal(keyWords("ArrowUp", azerty), "↑");
    });

    it("an action's together, or none", () => {
        assert.equal(actionKeyWords(keysOf(), "forward"), "W or ↑");
        assert.equal(actionKeyWords(keysOf({ journal: [null, null] }), "journal"), "none");
    });
});
