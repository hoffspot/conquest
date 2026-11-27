// Nanny Mode's rule and settings (server/access/nanny.js; generated/multiplayer_scaling_plan.md
// 6B-16): who's kept to the quick chat's phrases coming into a world, and why.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countriesReason, NANNY, NANNY_COUNTRIES, nannyFor, nannySettings } from "../server/access/nanny.js";
import { settingReason, SETTINGS } from "../server/storage/settings.js";

const DAY = 86400000;
const NOW = Date.parse("2026-12-01T12:00:00Z");
const defaults = { nanny: "all", nannyCountries: NANNY_COUNTRIES, nannyUnknown: true, nannyHoldDays: 30 };
const asked = (more = {}, settings = {}) => nannyFor({ now: NOW, ...more, settings: { ...defaults, ...settings } });
const OFF = { on: false, why: null, code: null, threshold: null };

describe("Nanny Mode's rule (server/access/nanny.js nannyFor)", () => {
    it("ships with the United Kingdom at 16, Brazil at 18 and Indonesia at 16, each with its reason, its source and when it was reviewed", () => {
        assert.deepEqual(NANNY_COUNTRIES.map(({ code, threshold }) => [code, threshold]), [["GB", 16], ["BR", 18], ["ID", 16]]);
        assert.ok(NANNY_COUNTRIES.every(({ reason, source, reviewed }) => reason && source && /^\d{4}-\d{2}-\d{2}$/.test(reviewed)));
        assert.equal(countriesReason(NANNY_COUNTRIES), null);
        assert.deepEqual(NANNY, { scopes: ["off", "public", "all"], unknown: ["XX", "T1"], most: 64 });
    });

    it("is nobody's while it's off, a public world's alone where that's its scope, and every world's where that is", () => {
        const table = [
            [{ nanny: "off" }, { public: true }, false],
            [{ nanny: "off" }, { public: false }, false],
            [{ nanny: "public" }, { public: true }, true],
            [{ nanny: "public" }, { public: false }, false],
            [{ nanny: "public" }, null, false],
            [{ nanny: "all" }, { public: false }, true],
            [{ nanny: "all" }, null, true],
            [{ nanny: "somewhere" }, { public: true }, false],
        ];

        for (const [settings, world, on] of table) {
            assert.equal(asked({ country: "GB", world }, settings).on, on, JSON.stringify([settings, world]));
        }
    });

    it("keeps one from a listed country to it, at that country's age; one from anywhere else not; and one from nowhere that can be told, if the server says so, at the oldest age listed", () => {
        const table = [
            ["GB", { on: true, why: "country", code: "GB", threshold: 16 }],
            ["gb", { on: true, why: "country", code: "GB", threshold: 16 }],
            ["BR", { on: true, why: "country", code: "BR", threshold: 18 }],
            ["ID", { on: true, why: "country", code: "ID", threshold: 16 }],
            ["US", OFF],
            ["FR", OFF],
            [null, { on: true, why: "unknown", code: null, threshold: 18 }],
            [undefined, { on: true, why: "unknown", code: null, threshold: 18 }],
            ["XX", { on: true, why: "unknown", code: null, threshold: 18 }],
            ["T1", { on: true, why: "unknown", code: null, threshold: 18 }],
            ["", { on: true, why: "unknown", code: null, threshold: 18 }],
            ["GBR", { on: true, why: "unknown", code: null, threshold: 18 }],
            [826, { on: true, why: "unknown", code: null, threshold: 18 }],
        ];

        for (const [country, expected] of table) {
            assert.deepEqual(asked({ country }), expected, JSON.stringify(country));
        }

        // (Unknown countries let be, where the server says: only the listed are in it)
        assert.deepEqual(asked({ country: null }, { nannyUnknown: false }), OFF);
        assert.deepEqual(asked({ country: "XX" }, { nannyUnknown: false }), OFF);
        assert.equal(asked({ country: "GB" }, { nannyUnknown: false }).on, true);
        // (No country listed: an unknown one's in it still, with no age to be over)
        assert.deepEqual(asked({ country: null }, { nannyCountries: [] }), { on: true, why: "unknown", code: null, threshold: null });
        assert.deepEqual(asked({ country: "GB" }, { nannyCountries: [] }), OFF);
    });

    it("is lifted only by a check passed at or over the age, never by one for a younger age; and holds one seen from a listed country for the days set, wherever they connect from since", () => {
        const passed = (threshold) => ({ agecheck: { passed: true, threshold } });

        assert.deepEqual(asked({ country: "GB", record: passed(16) }), OFF);
        assert.deepEqual(asked({ country: "GB", record: passed(18) }), OFF);
        assert.equal(asked({ country: "BR", record: passed(16) }).on, true, "(16 isn't Brazil's 18)");
        assert.equal(asked({ country: "GB", record: { agecheck: { passed: false, threshold: 16 } } }).on, true);
        assert.equal(asked({ country: "GB", record: { age: 34, agecheck: null } }).on, true, "(an age said is nothing)");
        assert.deepEqual(asked({ country: null, record: passed(18) }), OFF);
        assert.equal(asked({ country: null, record: passed(16) }).on, true, "(unknown: the oldest age listed)");

        // Seen from the United Kingdom ten days ago, now from France: held
        const seen = (days, code = "GB") => ({ nanny: { seen: code, at: NOW - days * DAY } });

        assert.deepEqual(asked({ country: "FR", record: seen(10) }), { on: true, why: "held", code: "GB", threshold: 16 });
        assert.deepEqual(asked({ country: "FR", record: seen(29.9) }).why, "held");
        assert.deepEqual(asked({ country: "FR", record: seen(30) }), OFF);
        assert.deepEqual(asked({ country: "FR", record: seen(10) }, { nannyHoldDays: 7 }), OFF);
        assert.deepEqual(asked({ country: "FR", record: seen(10, "US") }), OFF, "(a country that isn't listed holds no one)");
        assert.deepEqual(asked({ country: "FR", record: { ...seen(10), ...passed(16) } }), OFF, "(a pass lifts the hold)");
        // (From another listed country since: that one's, as they stand)
        assert.deepEqual(asked({ country: "BR", record: seen(10) }), { on: true, why: "country", code: "BR", threshold: 18 });
    });
});

describe("Nanny Mode's settings (server/storage/settings.js)", () => {
    it("is off till it's turned on, with the countries shipped, unknown countries in it and thirty days' hold", () => {
        const kept = new Map(Object.entries(SETTINGS).map(([key, setting]) => [key, setting.default]));

        assert.deepEqual(nannySettings(kept), { nanny: "off", nannyCountries: NANNY_COUNTRIES, nannyUnknown: true, nannyHoldDays: 30 });
        assert.deepEqual(SETTINGS.nanny.of, ["off", "public", "all"]);
        assert.equal(nannyFor({ country: "GB", world: { public: true }, settings: nannySettings(kept) }).on, false, "(nobody, as the game ships)");
    });

    it("takes a scope it knows and a list that's well made, and says what's wrong with any other", () => {
        const entry = { code: "AU", threshold: 16, reason: "A reason", source: "A source", reviewed: "2026-11-27" };

        assert.equal(settingReason("nanny", "public"), null);
        assert.match(settingReason("nanny", "everywhere"), /nanny must be one of off, public, all/);
        assert.equal(settingReason("nannyHoldDays", 30), null);
        assert.match(settingReason("nannyHoldDays", -1), /whole number from 0 to 365/);
        assert.equal(settingReason("nannyUnknown", false), null);
        assert.equal(settingReason("nannyCountries", [...NANNY_COUNTRIES, entry]), null);
        assert.equal(settingReason("nannyCountries", []), null);

        for (const [bad, why] of [
            ["GB", /a list/],
            [[null], /two-letter code/],
            [[{ ...entry, code: "aus" }], /two-letter code/],
            [[{ ...entry, code: "XX" }], /two-letter code/],
            [[entry, entry], /AU is listed twice/],
            [[{ ...entry, threshold: 12 }], /threshold must be a whole number of years from 13 to 21/],
            [[{ ...entry, threshold: "16" }], /threshold/],
            [[{ ...entry, reason: "" }], /needs a reason and a source/],
            [[{ ...entry, source: "x".repeat(201) }], /needs a reason and a source/],
            [[{ ...entry, reviewed: "last week" }], /reviewed date/],
            [[{ ...entry, reviewed: "2026-13-45" }], /reviewed date/],
            [[{ ...entry, email: "someone" }], /something it shouldn't \(email\)/],
            [Array.from({ length: 65 }, () => entry), /64 countries at the most/],
        ]) {
            assert.match(countriesReason(bad), why, JSON.stringify(bad).slice(0, 80));
            assert.match(settingReason("nannyCountries", bad), why);
        }
    });
});
