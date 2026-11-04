// A game controller's readings (client/js/app/gamepad.js): the sticks' dead zone, presses, holds
// and lifts frame by frame, the triggers' halfway, which actions each button gives (as they come,
// set otherwise, swapped), the Action Bars on the triggers, the symbols for each kind of controller,
// a wheel's slice from a stick, the next button the way pressed, what's in front to act on, a code's
// letters, and rumble.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACTIONS, actionsOf, asTheyCome, BAR_SLOTS, barHeld, BINDABLE, bindingsOf, bindingWords, BUTTONS, buttonsOf, DEAD_ZONE, heartDue, HEART, HOLD_MS, keyLetter, KEY_ROWS, nearestThatWay, PadReader, pickInFront, rebind, rumbleAt, sliceOf, stepLetter, stickAt, symbolOf, symbolsFor, takenFrom } from "../client/js/app/gamepad.js";

// A controller's readings with these buttons down (names; a trigger's by how far it's pulled) and
// its sticks where they're put
function padWith(down = [], { axes = [0, 0, 0, 0], pulled = {} } = {}) {
    return {
        axes,
        buttons: BUTTONS.map((name) => {
            const value = pulled[name] ?? (down.includes(name) ? 1 : 0);

            return { pressed: value > 0.5, value };
        }),
    };
}

describe("the sticks", () => {
    it("are still inside the dead zone, a worn stick's drift with them", () => {
        assert.deepEqual(stickAt(0.1, -0.05), { x: 0, y: 0, far: 0 });
        assert.deepEqual(stickAt(DEAD_ZONE, 0), { x: 0, y: 0, far: 0 });
    });

    it("are measured from the dead zone's edge, all the way over at the edge", () => {
        const half = stickAt(0, -0.55);

        assert.ok(Math.abs(half.far - 0.5) < 1e-9);
        assert.ok(half.y < 0 && half.x === 0);
        assert.equal(stickAt(0.97, 0).far, 1);
    });

    it("keep a diagonal's way, its dead zone round", () => {
        const diagonal = stickAt(0.5, 0.5);

        assert.ok(Math.abs(diagonal.x - diagonal.y) < 1e-12);
        assert.ok(diagonal.far > 0.6);
    });
});

describe("reading a controller frame by frame", () => {
    it("says a press once, a hold once it's held, and a lift with how long", () => {
        const reader = new PadReader();

        assert.deepEqual([...reader.read(padWith(["cross"]), 0).pressed], ["cross"]);
        assert.equal(reader.read(padWith(["cross"]), 100).pressed.size, 0);
        assert.deepEqual([...reader.read(padWith(["cross"]), HOLD_MS).held], ["cross"]);
        assert.equal(reader.read(padWith(["cross"]), HOLD_MS + 50).held.size, 0);

        const up = reader.read(padWith([]), HOLD_MS + 100);

        assert.deepEqual(up.released, [{ name: "cross", ms: HOLD_MS + 100, held: true }]);
    });

    it("counts a trigger down past halfway, and up only once it's let well back", () => {
        const reader = new PadReader();

        assert.equal(reader.read(padWith([], { pulled: { r2: 0.45 } }), 0).pressed.size, 0);
        assert.deepEqual([...reader.read(padWith([], { pulled: { r2: 0.6 } }), 10).pressed], ["r2"]);
        assert.ok(reader.read(padWith([], { pulled: { r2: 0.42 } }), 20).down.has("r2"));
        assert.equal(reader.read(padWith([], { pulled: { r2: 0.2 } }), 30).released[0].name, "r2");
    });

    it("takes a button that's missing as up (Safari reports no touchpad)", () => {
        const reader = new PadReader();
        const pad = padWith(["cross"]);

        pad.buttons.length = 16;

        const reading = reader.read(pad, 0);

        assert.ok(reading.down.has("cross"));
        assert.ok(!reading.down.has("touchpad") && !reading.down.has("ps"));
    });

    it("forgets what was held once reset", () => {
        const reader = new PadReader();

        reader.read(padWith(["square"]), 0);
        reader.reset();

        assert.deepEqual([...reader.read(padWith(["square"]), 10).pressed], ["square"]);
    });
});

describe("what each button does", () => {
    it("comes as the report suggests: Cross does it, Square and Triangle tap and hold", () => {
        const buttons = buttonsOf(bindingsOf());

        assert.deepEqual(buttons.cross, { tap: "do", hold: null, bar: null });
        assert.deepEqual(buttons.square, { tap: "pack", hold: "selfWheel", bar: null });
        assert.deepEqual(buttons.triangle, { tap: "party", hold: "theirWheel", bar: null });
        assert.equal(buttons.r2.bar, "bar1");
        assert.equal(buttons.l2.bar, "bar2");
        assert.deepEqual(buttons.create, { tap: "map", hold: "panels", bar: null });
        assert.ok(asTheyCome(bindingsOf()));
    });

    it("fires a tap on the press where there's no hold, and on the lift where there is", () => {
        const buttons = buttonsOf(bindingsOf());
        const reader = new PadReader();

        assert.deepEqual(actionsOf(reader.read(padWith(["cross", "square"]), 0), buttons), ["do"]);
        assert.deepEqual(actionsOf(reader.read(padWith([]), 100), buttons), ["pack"]);
    });

    it("fires a hold once held, and nothing more as it's let go", () => {
        const buttons = buttonsOf(bindingsOf());
        const reader = new PadReader();

        reader.read(padWith(["triangle"]), 0);

        assert.deepEqual(actionsOf(reader.read(padWith(["triangle"]), HOLD_MS), buttons), ["theirWheel"]);
        assert.deepEqual(actionsOf(reader.read(padWith([]), HOLD_MS + 200), buttons), []);
    });

    it("lets a bar's trigger do nothing but hold its bar", () => {
        const buttons = buttonsOf(bindingsOf());
        const reader = new PadReader();
        const reading = reader.read(padWith(["r2"]), 0);

        assert.deepEqual(actionsOf(reading, buttons), []);
        assert.equal(barHeld(reading, buttons, reader), 1);
    });

    it("takes the bar whose trigger was pulled last, both held", () => {
        const buttons = buttonsOf(bindingsOf());
        const reader = new PadReader();

        reader.read(padWith(["r2"]), 0);

        assert.equal(barHeld(reader.read(padWith(["r2", "l2"]), 50), buttons, reader), 2);
        assert.equal(barHeld(reader.read(padWith(["r2"]), 80), buttons, reader), 1);
    });

    it("keeps the bars' slots in the order the bar shows them", () => {
        assert.deepEqual(BAR_SLOTS, ["square", "triangle", "circle", "cross", "left", "right"]);
    });

    it("swaps Cross and Circle when asked", () => {
        const buttons = buttonsOf(bindingsOf(), { swap: true });

        assert.equal(buttons.circle.tap, "do");
        assert.equal(buttons.cross.tap, "stop");
        assert.equal(buttons.cross.hold, "unlock");
    });
});

describe("setting a button", () => {
    it("gives the button to the action, and takes it from whatever had it, which is left with none (and said)", () => {
        const before = bindingsOf();
        const bindings = rebind(before, "do", "r1");

        assert.equal(bindings.do, "r1");
        assert.equal(bindings.nextFoe, "");
        assert.deepEqual(takenFrom(before, bindings), ["nextFoe"]);
        assert.equal(buttonsOf(bindings).cross.tap, null);
        assert.equal(buttonsOf(bindings).r1.tap, "do");
        assert.ok(!asTheyCome(bindings));
    });

    it("can leave an action with no button, kept as none", () => {
        const bindings = rebind(bindingsOf(), "zoomIn", "");

        assert.equal(bindings.zoomIn, "");
        assert.equal(bindingsOf({ zoomIn: "" }).zoomIn, "");
        assert.equal(buttonsOf(bindings).up.tap, null);
        assert.equal(bindingWords(bindings.zoomIn), "");
    });

    it("can set an action to a button held", () => {
        const bindings = rebind(bindingsOf(), "recentre", "cross:hold");

        assert.equal(bindings.recentre, "cross:hold");
        assert.equal(buttonsOf(bindings).cross.hold, "recentre");
    });

    it("never sets a bar to a button held, nor anything to the PS button", () => {
        const bindings = bindingsOf();

        assert.deepEqual(rebind(bindings, "bar1", "square:hold"), bindings);
        assert.deepEqual(rebind(bindings, "menu", "ps"), bindings);
        assert.ok(!BINDABLE.includes("ps"));
    });

    it("takes a bar's trigger from it whole, and gives a bar a button alone, taking it tapped and held", () => {
        const wheel = rebind(bindingsOf(), "selfWheel", "r2");

        assert.equal(wheel.selfWheel, "r2");
        assert.equal(wheel.bar1, "");

        const bar = rebind(bindingsOf(), "bar1", "square");

        assert.equal(bar.bar1, "square");
        assert.equal(bar.pack, "");
        assert.equal(bar.selfWheel, "");
        assert.equal(buttonsOf(bar).square.bar, "bar1");
    });

    it("reads what's kept, leaving anything unknown as it comes", () => {
        const bindings = bindingsOf({ do: "r1", stop: "ps", menu: "nonsense", bar1: "square:hold", unknown: "cross" });

        assert.equal(bindings.do, "r1");
        assert.equal(bindings.stop, "circle");
        assert.equal(bindings.menu, "options");
        assert.equal(bindings.bar1, "r2");
        assert.equal(Object.keys(bindings).length, ACTIONS.length);
    });
});

describe("the symbols shown", () => {
    it("match the controller by the name the browser gives it", () => {
        assert.equal(symbolsFor("DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)"), "playstation");
        assert.equal(symbolsFor("054c-0ce6-DualSense Wireless Controller"), "playstation");
        assert.equal(symbolsFor("Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)"), "xbox");
        assert.equal(symbolsFor("Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)"), "nintendo");
        assert.equal(symbolsFor("8BitDo SN30 Pro"), "xbox");
    });

    it("follow what's set over the controller's own", () => {
        assert.equal(symbolsFor("DualSense Wireless Controller", "xbox"), "xbox");
        assert.equal(symbolsFor("Xbox", "auto"), "xbox");
    });

    it("name each button as its controller does", () => {
        assert.equal(symbolOf("cross", "playstation"), "✕");
        assert.equal(symbolOf("cross", "xbox"), "A");
        assert.equal(symbolOf("cross", "nintendo"), "B");
        assert.equal(symbolOf("r2", "nintendo"), "ZR");
        assert.equal(bindingWords("square:hold", "playstation"), "□ held");
        assert.equal(bindingWords("r1", "xbox"), "RB");
    });
});

describe("a wheel's slice from a stick", () => {
    it("is none until the stick's pushed well over", () => {
        assert.equal(sliceOf({ x: 0, y: -0.3, far: 0.3 }), -1);
    });

    it("goes clockwise from the top", () => {
        assert.equal(sliceOf({ x: 0, y: -1, far: 1 }), 0);
        assert.equal(sliceOf({ x: 0.7, y: -0.7, far: 1 }), 1);
        assert.equal(sliceOf({ x: 1, y: 0, far: 1 }), 2);
        assert.equal(sliceOf({ x: 0, y: 1, far: 1 }), 4);
        assert.equal(sliceOf({ x: -1, y: 0, far: 1 }), 6);
        assert.equal(sliceOf({ x: -0.7, y: -0.7, far: 1 }), 7);
        assert.equal(sliceOf({ x: 1, y: 0, far: 1 }, 6), 2);
    });
});

describe("the next button the way pressed", () => {
    const at = (x, y, width = 100, height = 40) => ({ x, y, width, height });

    it("is the nearest that way, the one straight on before one off to the side", () => {
        const from = at(100, 100);
        const rects = [at(100, 200), at(260, 160), at(100, 300)];

        assert.equal(nearestThatWay(from, rects, "down"), 0);
        assert.equal(nearestThatWay(from, rects, "right"), 1);
    });

    it("is none where there's nothing that way", () => {
        assert.equal(nearestThatWay(at(100, 100), [at(100, 200)], "up"), -1);
        assert.equal(nearestThatWay(at(100, 100), [at(100, 100)], "left"), -1);
    });

    it("finds a button in the next row along, not a far one in line", () => {
        const from = at(0, 0, 80, 30);
        const rects = [at(100, 0, 80, 30), at(600, 0, 80, 30), at(0, 50, 80, 30)];

        assert.equal(nearestThatWay(from, rects, "right"), 0);
        assert.equal(nearestThatWay(from, rects, "down"), 2);
    });
});

describe("what's in front to act on", () => {
    const things = [
        { key: "door", x: 0, z: 4 },
        { key: "smith", x: 3, z: 3 },
        { key: "behind", x: 0, z: -1 },
        { key: "far", x: 0, z: 20 },
    ];

    it("is the nearest ahead, the way they face", () => {
        assert.equal(pickInFront(things, { x: 0, z: 0, facing: 0 })?.key, "door");
        assert.equal(pickInFront(things, { x: 0, z: 0, facing: Math.PI })?.key, "behind");
        assert.equal(pickInFront([...things, { key: "beside", x: 1, z: 0 }], { x: 0, z: 0, facing: 0 })?.key, "beside");
        assert.equal(pickInFront(things.filter((thing) => thing.key !== "behind"), { x: 0, z: 0, facing: Math.PI / 4 })?.key, "smith");
    });

    it("is nothing behind them past arm's length, nor out of reach", () => {
        assert.equal(pickInFront([{ key: "behind", x: 0, z: -3 }], { x: 0, z: 0, facing: 0 }), null);
        assert.equal(pickInFront([{ key: "far", x: 0, z: 20 }], { x: 0, z: 0, facing: 0 }), null);
        assert.equal(pickInFront([{ key: "far", x: 0, z: 20, reach: 25 }], { x: 0, z: 0, facing: 0 })?.key, "far");
    });

    it("keeps the one picked last while it's nearly as good", () => {
        const two = [{ key: "a", x: 0, z: 3 }, { key: "b", x: 0.2, z: 3.3 }];

        assert.equal(pickInFront(two, { x: 0, z: 0, facing: 0 })?.key, "a");
        assert.equal(pickInFront(two, { x: 0, z: 0, facing: 0, kept: "b" })?.key, "b");
        assert.equal(pickInFront([{ key: "a", x: 0, z: 1 }, { key: "b", x: 0, z: 5 }], { x: 0, z: 0, facing: 0, kept: "b" })?.key, "a");
    });
});

describe("a code's letters and the keyboard", () => {
    it("turn round from Z to A and back", () => {
        assert.equal(stepLetter("A", 1), "B");
        assert.equal(stepLetter("Z", 1), "A");
        assert.equal(stepLetter("A", -1), "Z");
        assert.equal(stepLetter("", 1), "A");
        assert.equal(stepLetter("", -1), "Z");
    });

    it("type a letter, Shift held or not, and a space", () => {
        assert.equal(keyLetter("q", true), "Q");
        assert.equal(keyLetter("q", false), "q");
        assert.equal(keyLetter("'", true), "'");
        assert.equal(keyLetter("space", false), " ");
        assert.equal(keyLetter("back", false), "");
        assert.ok(KEY_ROWS.flat().includes("done"));
    });
});

describe("rumble", () => {
    it("is scaled by its strength, and nothing at none", () => {
        assert.equal(rumbleAt("slam", 0), null);
        assert.equal(rumbleAt("slam", 1).strongMagnitude, 1);
        assert.equal(rumbleAt("slam", 0.5).strongMagnitude, 0.5);
        assert.equal(rumbleAt("nothing", 1), null);
    });

    it("beats the heart only while low on health, and alive", () => {
        assert.ok(heartDue(0.1, -Infinity, 0));
        assert.ok(!heartDue(0.5, -Infinity, 0));
        assert.ok(!heartDue(0, -Infinity, 0));
        assert.ok(!heartDue(0.1, 0, HEART.every - 1));
        assert.ok(heartDue(0.1, 0, HEART.every));
    });
});
