// Nanny Mode's lock code (client/js/app/nannylock.js; the scaling plan's 6B-18).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { codeFits, isLock, lockOf, NANNY_CODE, unlocks } from "../client/js/app/nannylock.js";
import { SETTINGS_DEFAULTS, PLAY_SETTINGS } from "../client/js/app/save.js";

describe("Nanny Mode's lock code (app/nannylock.js)", () => {
    it("takes a code of 4 to 12 characters with no spaces, and nothing else", () => {
        assert.deepEqual(NANNY_CODE, { least: 4, most: 12 });

        for (const code of ["2468", "open sesame".replace(" ", "-"), "abcdefghijkl"]) {
            assert.equal(codeFits(code), true, code);
        }

        for (const code of ["", "123", "abcdefghijklm", "12 34", 2468, null, undefined]) {
            assert.equal(codeFits(code), false, String(code));
        }
    });

    it("keeps a salted digest of the code, never the code: opened by that code alone, each lock of the same code its own", async () => {
        const lock = await lockOf("2468");
        const again = await lockOf("2468");

        assert.match(lock, /^[0-9a-f]{16}:[0-9a-f]{64}$/);
        assert.ok(!lock.includes("2468"));
        assert.notEqual(lock, again, "(salted: the same code never the same lock)");
        assert.equal(isLock(lock), true);
        assert.equal(await unlocks(lock, "2468"), true);
        assert.equal(await unlocks(again, "2468"), true);

        for (const wrong of ["2469", "", "24680", null]) {
            assert.equal(await unlocks(lock, wrong), false, String(wrong));
        }

        assert.equal(await lockOf("2468", "0123456789abcdef"), await lockOf("2468", "0123456789abcdef"), "(the same salt and code: the same lock)");
    });

    it("makes no lock of a code that can't be one, and takes anything that isn't a lock for none", async () => {
        assert.equal(await lockOf("123"), null);
        assert.equal(await lockOf("2468", "not a salt"), null);

        for (const none of ["", null, undefined, "2468", "abc:def", 7]) {
            assert.equal(isLock(none), false, String(none));
            assert.equal(await unlocks(none, "anything"), true, "(no lock: switched off freely)");
        }
    });

    it("is off, with no lock, till the player chooses it; and this device's, not carried with the character", () => {
        assert.deepEqual([SETTINGS_DEFAULTS.nannyMode, SETTINGS_DEFAULTS.nannyLock], [false, ""]);
        assert.ok(!PLAY_SETTINGS.includes("nannyMode") && !PLAY_SETTINGS.includes("nannyLock"));
    });
});
