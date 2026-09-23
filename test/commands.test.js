import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUidList, sanitizeCommand } from "../client/js/core/commands.js";

describe("sanitizeCommand", () => {
    it("keeps valid commands", () => {
        assert.deepEqual(sanitizeCommand({ type: "hunt" }), { type: "hunt" });
        assert.deepEqual(sanitizeCommand({ type: "move", to: { x: 1.5, y: 2 } }), { type: "move", to: { x: 1.5, y: 2 } });
        assert.deepEqual(sanitizeCommand({ type: "patrol", from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }), { type: "patrol", to: { x: 3, y: 4 }, from: { x: 1, y: 2 } });
        assert.deepEqual(sanitizeCommand({ type: "attack", toUid: -2 }), { type: "attack", toUid: -2 });
        assert.deepEqual(
            sanitizeCommand({ type: "construct-building", details: { type: "buildings", name: "starport", x: 3, y: 4 } }),
            { type: "construct-building", details: { type: "buildings", name: "starport", x: 3, y: 4 } },
        );
        assert.deepEqual(
            sanitizeCommand({ type: "construct-unit", details: { type: "vehicles", name: "scout-tank", orders: { type: "hunt" } } }),
            { type: "construct-unit", details: { type: "vehicles", name: "scout-tank", orders: { type: "hunt" } } },
        );
    });

    it("drops fields a command doesn't use, including nested orders", () => {
        assert.deepEqual(
            sanitizeCommand({ type: "attack", toUid: 5, to: { x: 1, y: 1 }, previousOrder: { type: "patrol" }, uid: 9 }),
            { type: "attack", toUid: 5 },
        );
        assert.deepEqual(
            sanitizeCommand({ type: "move", to: { x: 1, y: 2, name: "oilfield", type: "terrain" } }),
            { type: "move", to: { x: 1, y: 2 } },
        );
    });

    it("rejects commands that are incomplete or of an unknown type", () => {
        for (const command of [
            null,
            "hunt",
            { type: "fly-to-the-moon" },
            { type: "move" },
            { type: "move", to: { x: "1", y: 2 } },
            { type: "move", to: { x: Infinity, y: 2 } },
            { type: "patrol", to: { x: 1, y: 2 } },
            // Targets must be named by id, not described by an object
            { type: "deploy", to: { x: 25, y: 8, name: "oilfield" } },
            { type: "attack", toUid: "5" },
            { type: "construct-building", details: { name: "starport", x: 1.5, y: 2 } },
            { type: "construct-unit", details: { type: "buildings", name: "base" } },
            { type: "construct-unit" },
        ]) {
            assert.equal(sanitizeCommand(command), undefined, JSON.stringify(command));
        }
    });

    it("only lets new units start with simple orders", () => {
        const command = sanitizeCommand({ type: "construct-unit", details: { type: "aircraft", name: "wraith", orders: { type: "patrol" } } });

        assert.deepEqual(command, { type: "construct-unit", details: { type: "aircraft", name: "wraith" } });
    });

    it("never keeps deeply nested values", () => {
        let nested = [];

        for (let i = 0; i < 10000; i++) {
            nested = [nested];
        }

        const command = sanitizeCommand({ type: "hunt", payload: nested });

        assert.deepEqual(command, { type: "hunt" });
        assert.doesNotThrow(() => JSON.stringify(command));
    });
});

describe("isUidList", () => {
    it("accepts arrays of integers only", () => {
        assert.equal(isUidList([1, -2, 3]), true);
        assert.equal(isUidList([]), true);
        assert.equal(isUidList([1.5]), false);
        assert.equal(isUidList(["1"]), false);
        assert.equal(isUidList("1,2"), false);
        assert.equal(isUidList(new Array(501).fill(1)), false);
    });
});
