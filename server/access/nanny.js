// Nanny Mode: who is kept to the quick chat's phrases, and why (generated/
// multiplayer_scaling_plan.md 6B-16; decision 12). A player in it sends and sees the quick chat's
// phrases only (client/js/core/quickchat.js; the world's `restricted` hook, core/netplay.js);
// everything else about the game is theirs as it is anyone's.
//
// There are three ways in, of which this slice builds two:
//
//   - the country of the connection: one on the server's list (`nannyCountries`), each with the
//     age its rules protect up to;
//   - an unknown country (`nannyUnknown`): no match, or none looked up. A missing answer must
//     not be the way out;
//   - the player's own choice (6B-18), which this module knows nothing of.
//
// Nothing looks a country up yet (6B-19 and 6B-20 do), so with the mode on every connection's
// country is unknown, and with `nannyUnknown` on everyone is in it. That's why `nanny` is off
// until a country source exists.
//
// It's lifted only by a passed age check at or over the entry's age (6B-22: the player's record,
// `agecheck { passed, threshold }`), never by an age someone says they are. One seen from a
// listed country stays in it `nannyHoldDays` after (6B-21: the record's `nanny { seen, at }`), so
// that a VPN switched on doesn't lift it at once. Neither record exists yet: `nannyFor` reads
// them if it's given them.

const DAY = 86400000;

/**
 * Where it applies (the setting `nanny`): nowhere; in public worlds; or in every world of the
 * server. And the countries' codes that say nothing of where a connection is (a front's "XX",
 * Tor's "T1").
 */
export const NANNY = Object.freeze({ scopes: Object.freeze(["off", "public", "all"]), unknown: Object.freeze(["XX", "T1"]), most: 64 });

/**
 * The countries whose rules limit children's chat with strangers, as the game ships them
 * (generated/multiplayer_scaling_plan.md, the legal section): each its ISO code, the age its
 * rules protect up to (`threshold`: a check must show a player's that or over), why, where
 * that's from, and when it was last looked at (`reviewed`: the list's to be reviewed every 90
 * days). Readings of the law from summaries, not advice: the plan says which weren't checked
 * against the text.
 */
export const NANNY_COUNTRIES = Object.freeze(
    [
        { code: "GB", threshold: 16, reason: "The United Kingdom's planned limits on strangers contacting under-16s", source: "Online Safety Act 2023, section 214A (Children's Wellbeing and Schools Act 2026)", reviewed: "2026-11-27" },
        { code: "BR", threshold: 18, reason: "Brazil's limits on games' chat between users for under-18s without a parent's consent", source: "ECA Digital, Law 15.211/2025, chapter VII", reviewed: "2026-11-27" },
        { code: "ID", threshold: 16, reason: "Indonesia's limits on interactive features of high-risk platforms for under-16s", source: "PP Tunas, Government Regulation 17/2025", reviewed: "2026-11-27" },
    ].map((entry) => Object.freeze(entry)),
);

/** Why `value` can't be the setting `nannyCountries` (a sentence), or null if it can. */
export function countriesReason(value) {
    if (!Array.isArray(value) || value.length > NANNY.most) {
        return `nannyCountries must be a list of ${NANNY.most} countries at the most.`;
    }

    const codes = new Set();

    for (const entry of value) {
        const { code, threshold, reason, source, reviewed, ...rest } = entry !== null && typeof entry === "object" && !Array.isArray(entry) ? entry : { code: null };

        if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code) || NANNY.unknown.includes(code)) {
            return `nannyCountries: each country needs a two-letter code in capitals, not ${JSON.stringify(code)}.`;
        }

        if (codes.has(code)) {
            return `nannyCountries: ${code} is listed twice.`;
        }

        codes.add(code);

        if (!Number.isInteger(threshold) || threshold < 13 || threshold > 21) {
            return `nannyCountries: ${code}'s threshold must be a whole number of years from 13 to 21.`;
        }

        if (![reason, source].every((text) => typeof text === "string" && text.trim() && text.length <= 200)) {
            return `nannyCountries: ${code} needs a reason and a source, each 200 characters at the most.`;
        }

        if (typeof reviewed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(reviewed) || Number.isNaN(Date.parse(reviewed))) {
            return `nannyCountries: ${code}'s reviewed date must be as 2026-11-27.`;
        }

        if (Object.keys(rest).length) {
            return `nannyCountries: ${code} has something it shouldn't (${Object.keys(rest).join(", ")}).`;
        }
    }

    return null;
}

/** The entry of Nanny Mode's countries a country's code is listed under ({ code, threshold, ... }), by plain settings (nannySettings); null for one that isn't listed, or no country. */
export function listedCountry(settings, code) {
    const countries = Array.isArray(settings?.nannyCountries) ? settings.nannyCountries : [];

    return typeof code === "string" && !NANNY.unknown.includes(code) ? (countries.find((entry) => entry.code === code) ?? null) : null;
}

/**
 * How fresh what Nanny Mode goes by must be for a server's public worlds (gate (b) of
 * generated/multiplayer_scaling_plan.md; its 6B-23): the country file no older than so many days
 * (net/geoip.js GEOIP.staleDays is the same number: past it the file answers nothing), and every
 * entry of the country list reviewed within so many.
 */
export const NANNY_FRESH = Object.freeze({ fileDays: 62, reviewDays: 90 });

/**
 * Whether a server's Nanny Mode is fit for public worlds, and what it lacks if not. Read-only: it
 * changes nothing and nothing's refused by it yet (access/cap.js publicReady reports it).
 *
 * @param {object} asked
 * @param {object} asked.settings - nannySettings.
 * @param {object} asked.source - Where a connection's country comes from: `front` (whether what's
 *     in front of the server says countries itself, guards.js FRONTS) and `file` (the country
 *     file as it stands: net/geoip.js CountryFile info(), or null).
 * @param {number} [asked.now] - The time (ms).
 * @returns {{ ready: boolean, missing: string[], review: { due: string[], last: string|null } }}
 *     `missing`: a sentence for each thing it lacks. `review`: the countries whose entries are
 *     due a review, and the oldest review date in the list.
 */
export function nannyReady({ settings, source = {}, now = Date.now() }) {
    const missing = [];
    const countries = Array.isArray(settings?.nannyCountries) ? settings.nannyCountries : [];
    const age = (reviewed) => now - Date.parse(`${reviewed}T00:00:00Z`);
    const due = countries.filter(({ reviewed }) => !(age(reviewed) <= NANNY_FRESH.reviewDays * DAY)).map(({ code }) => code);
    const last = countries.map(({ reviewed }) => reviewed).sort()[0] ?? null;

    if (!NANNY.scopes.includes(settings?.nanny) || settings.nanny === "off") {
        missing.push("Nanny Mode is off: turn it on in Settings (in public worlds, or in every world).");
    }

    if (source.front !== true && (!source.file || source.file.stale !== false)) {
        missing.push(
            source.file?.month
                ? `The country file (${source.file.month}) is more than ${NANNY_FRESH.fileDays} days old, so every connection's country is unknown: it's downloaded again while Nanny Mode is on.`
                : "There's no country file yet, and nothing in front of the server says a visitor's country: it's downloaded once Nanny Mode is on.",
        );
    }

    if (!countries.length) {
        missing.push("Nanny Mode's country list is empty.");
    } else if (due.length) {
        missing.push(`Nanny Mode's country list is due a review (${due.join(", ")}: last reviewed ${last}; every ${NANNY_FRESH.reviewDays} days). See docs/MODERATION.md.`);
    }

    return { ready: missing.length === 0, missing, review: { due, last } };
}

/** A server's settings for it, as plain values (`settings`: storage/settings.js Settings, or anything with `get`). */
export function nannySettings(settings) {
    return { nanny: settings.get("nanny"), nannyCountries: settings.get("nannyCountries"), nannyUnknown: settings.get("nannyUnknown"), nannyHoldDays: settings.get("nannyHoldDays") };
}

/**
 * Whether a player's in Nanny Mode coming into a world, and why. Pure: the same answer for the
 * same asking.
 *
 * @param {object} asked
 * @param {string|null} [asked.country] - Their connection's country (an ISO code), or null for
 *     none looked up.
 * @param {object|null} [asked.record] - What the server keeps of the player, if anything:
 *     `agecheck { passed, threshold }` (a check passed, for that age) and `nanny { seen, at }`
 *     (the listed country they were last seen from, and when: ms).
 * @param {object|null} [asked.world] - The world: `{ public }`.
 * @param {object} asked.settings - nannySettings.
 * @param {number} [asked.now] - The time (ms).
 * @returns {{ on: boolean, why: "country"|"held"|"unknown"|null, code: string|null, threshold: number|null }}
 */
export function nannyFor({ country = null, record = null, world = null, settings, now = Date.now() }) {
    const off = { on: false, why: null, code: null, threshold: null };
    const scope = NANNY.scopes.includes(settings?.nanny) ? settings.nanny : "off";

    if (scope === "off" || (scope === "public" && world?.public !== true)) {
        return off;
    }

    const countries = Array.isArray(settings.nannyCountries) ? settings.nannyCountries : [];
    const passed = record?.agecheck?.passed === true && Number.isFinite(record.agecheck.threshold) ? record.agecheck.threshold : 0;
    const code = typeof country === "string" && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
    const known = code !== null && !NANNY.unknown.includes(code);
    const listed = known ? countries.find((entry) => entry.code === code) : null;

    if (listed) {
        return passed >= listed.threshold ? off : { on: true, why: "country", code, threshold: listed.threshold };
    }

    // (Seen from a listed country lately: held to it, wherever they connect from now)
    const seen = record?.nanny?.seen ? countries.find((entry) => entry.code === record.nanny.seen) : null;
    const days = Number.isFinite(settings.nannyHoldDays) ? settings.nannyHoldDays : 0;

    if (seen && Number.isFinite(record.nanny.at) && now - record.nanny.at < days * DAY && passed < seen.threshold) {
        return { on: true, why: "held", code: seen.code, threshold: seen.threshold };
    }

    // (No knowing where they are: in it, to the oldest age any country's rules protect)
    if (!known && settings.nannyUnknown === true) {
        const threshold = Math.max(0, ...countries.map((entry) => entry.threshold));

        return threshold > 0 && passed >= threshold ? off : { on: true, why: "unknown", code: null, threshold: threshold || null };
    }

    return off;
}
