// Which country a connection's address is in (generated/multiplayer_scaling_plan.md 6B-19), for
// Nanny Mode (access/nanny.js): read from DB-IP's free "IP to Country Lite" file, which is
// licensed CC BY 4.0 and credited wherever its answers are used ("IP Geolocation by DB-IP",
// https://db-ip.com: the game's Credits, the management page, docs/SERVER.md). The server
// downloads the file itself, once a month, into its data folder; the repository never holds it.
//
// The file is a CSV with no heading: `first address,last address,country`, a row a range, IPv4
// then IPv6, each family in order and no range over another. It's read into typed arrays (a row
// of IPv4 is ten bytes, of IPv6 thirty-four) and looked up by a binary search: no dependency.
//
// No file, or one too old (GEOIP.staleDays), answers null for every address: a country that
// can't be told, which Nanny Mode's `nannyUnknown` setting decides about. A missing or stale file
// is never a way out of it.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { readJSON, writeAtomic, writeJSON } from "../storage/files.js";

const DAY = 86400000;

/**
 * The country file: where it's downloaded from (a month's, "2026-11"); the folder it's kept in,
 * under the data folder, with what's known of it beside it (`about`: its month and when it was
 * fetched); how old it may be before its answers aren't trusted (days: two months and a day, a
 * month's file missed once); how often it's looked at again (ms); the most it may weigh
 * compressed and unpacked (bytes) and the fewest ranges a real one holds; the codes it gives
 * what's no country's; and the credit its licence asks for.
 */
export const GEOIP = Object.freeze({
    url: (month) => `https://download.db-ip.com/free/dbip-country-lite-${month}.csv.gz`,
    folder: "geoip",
    file: "dbip-country-lite.csv.gz",
    about: "about.json",
    staleDays: 62,
    every: DAY,
    limit: 64 * 1024 * 1024,
    unpacked: 256 * 1024 * 1024,
    least: 10000,
    none: Object.freeze(["ZZ", "XX"]),
    credit: Object.freeze({ text: "IP Geolocation by DB-IP", href: "https://db-ip.com" }),
});

/** A month as the file's named for it ("2026-11"), from a time (ms); `back` months earlier. */
export function monthOf(time, back = 0) {
    const date = new Date(time);

    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - back);

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// An IPv4 address as a number (0 to 2^32 - 1), or null
function four(text) {
    const parts = text.split(".");

    if (parts.length !== 4 || !parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)) {
        return null;
    }

    return parts.reduce((sum, part) => sum * 256 + Number(part), 0);
}

// An IPv6 address as its sixteen-bit groups (eight of them), or null: "::" filled in, a dotted
// IPv4 at its end taken as two groups
function groupsOf(text) {
    let address = text;
    let tail = [];

    if (address.includes(".")) {
        const at = address.lastIndexOf(":");
        const v4 = four(address.slice(at + 1));

        if (at < 0 || v4 === null) {
            return null;
        }

        tail = [Math.floor(v4 / 65536), v4 % 65536];
        address = address.slice(0, at + 1);

        // ("::1.2.3.4" leaves "::"; "64:ff9b::1.2.3.4" leaves "64:ff9b::"; "a:b:1.2.3.4" leaves "a:b:")
        if (!address.endsWith("::")) {
            address = address.slice(0, -1);
        }
    }

    const halves = address.split("::");

    if (halves.length > 2) {
        return null;
    }

    const read = (half) => (half === "" ? [] : half.split(":").map((group) => (/^[0-9a-fA-F]{1,4}$/.test(group) ? parseInt(group, 16) : NaN)));
    const head = read(halves[0]);
    const rest = halves.length === 2 ? [...read(halves[1]), ...tail] : tail;
    const groups = halves.length === 2 ? [...head, ...Array(Math.max(0, 8 - head.length - rest.length)).fill(0), ...rest] : [...head, ...rest];

    // ("::" stands for one group at least)
    if (groups.length !== 8 || groups.some(Number.isNaN) || (halves.length === 2 && head.length + rest.length > 7)) {
        return null;
    }

    return groups;
}

/**
 * An address as it's looked up: { family: 4, value } (a number), or { family: 6, hi, lo } (two
 * 64-bit halves, BigInt); null for anything that isn't an address. An IPv4 address written as an
 * IPv6 one ("::ffff:203.0.113.9", as a socket on both families gives it) is the IPv4 address. A
 * zone ("%en0") and brackets are let go of.
 */
export function addressOf(given) {
    if (typeof given !== "string") {
        return null;
    }

    const text = given.trim().replace(/^\[|\]$/g, "").replace(/%.*$/, "");

    if (!text.includes(":")) {
        const value = four(text);

        return value === null ? null : { family: 4, value };
    }

    const groups = groupsOf(text);

    if (!groups) {
        return null;
    }

    // (IPv4-mapped: ::ffff:a.b.c.d)
    if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
        return { family: 4, value: groups[6] * 65536 + groups[7] };
    }

    const half = (from) => groups.slice(from, from + 4).reduce((sum, group) => (sum << 16n) | BigInt(group), 0n);

    return { family: 6, hi: half(0), lo: half(4) };
}

// A country's two capitals as a number, and back
const packed = (code) => code.charCodeAt(0) * 256 + code.charCodeAt(1);
const unpacked = (number) => String.fromCharCode(number >> 8, number & 255);

/**
 * The file's text read into a table to look addresses up in: { rows, v4: { starts, ends, codes },
 * v6: { startHi, startLo, endHi, endLo, codes } }. Throws, saying which line, on a row that isn't
 * `first,last,country`, whose ends are of two families or the wrong way round, or that isn't
 * after the one before it: a file that's been cut short or isn't the file is never half-used.
 */
export function parseCountries(text) {
    const lines = text.split("\n");
    const count = { 4: 0, 6: 0 };
    const rows = [];

    for (let k = 0; k < lines.length; k++) {
        const line = lines[k].trim();

        if (!line) {
            continue;
        }

        const [first, last, country, ...more] = line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
        const from = addressOf(first ?? "");
        const to = addressOf(last ?? "");

        if (!from || !to || from.family !== to.family || more.length || !/^[A-Z]{2}$/.test(country ?? "")) {
            throw new Error(`The country file's line ${k + 1} isn't a range of addresses and a country.`);
        }

        count[from.family]++;
        rows.push([from, to, packed(country)]);
    }

    const v4 = { starts: new Uint32Array(count[4]), ends: new Uint32Array(count[4]), codes: new Uint16Array(count[4]) };
    const v6 = { startHi: new BigUint64Array(count[6]), startLo: new BigUint64Array(count[6]), endHi: new BigUint64Array(count[6]), endLo: new BigUint64Array(count[6]), codes: new Uint16Array(count[6]) };
    const at = { 4: 0, 6: 0 };
    const order = (k) => new Error(`The country file's ranges aren't in order (its range ${k + 1}).`);

    rows.forEach(([from, to, code], k) => {
        const n = at[from.family]++;

        if (from.family === 4) {
            if (to.value < from.value || (n > 0 && from.value <= v4.ends[n - 1])) {
                throw order(k);
            }

            v4.starts[n] = from.value;
            v4.ends[n] = to.value;
            v4.codes[n] = code;

            return;
        }

        if (to.hi < from.hi || (to.hi === from.hi && to.lo < from.lo) || (n > 0 && (from.hi < v6.endHi[n - 1] || (from.hi === v6.endHi[n - 1] && from.lo <= v6.endLo[n - 1])))) {
            throw order(k);
        }

        v6.startHi[n] = from.hi;
        v6.startLo[n] = from.lo;
        v6.endHi[n] = to.hi;
        v6.endLo[n] = to.lo;
        v6.codes[n] = code;
    });

    return { rows: rows.length, v4, v6 };
}

/**
 * The country an address is in by a table (parseCountries): its two capitals, or null where no
 * range holds it, the file says it's no country's (GEOIP.none), or it isn't an address.
 */
export function countryOf(table, given) {
    const address = addressOf(given);

    if (!table || !address) {
        return null;
    }

    let found = -1;
    let codes;

    if (address.family === 4) {
        const { starts, ends } = table.v4;
        let [low, high] = [0, starts.length - 1];

        // (The last range that starts at or before it)
        while (low <= high) {
            const mid = (low + high) >> 1;

            if (starts[mid] <= address.value) {
                found = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        found = found >= 0 && address.value <= ends[found] ? found : -1;
        codes = table.v4.codes;
    } else {
        const { startHi, startLo, endHi, endLo } = table.v6;
        let [low, high] = [0, startHi.length - 1];

        while (low <= high) {
            const mid = (low + high) >> 1;

            if (startHi[mid] < address.hi || (startHi[mid] === address.hi && startLo[mid] <= address.lo)) {
                found = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        found = found >= 0 && (address.hi < endHi[found] || (address.hi === endHi[found] && address.lo <= endLo[found])) ? found : -1;
        codes = table.v6.codes;
    }

    const code = found < 0 ? null : unpacked(codes[found]);

    return code === null || GEOIP.none.includes(code) ? null : code;
}

/**
 * The server's country file, in its data folder (`root`): read as the server starts (`load`),
 * asked the country of an address (`country`), and fetched again when the month's turned
 * (`refresh`, with `fetch`). `wanted` says whether its answers are used at all (Nanny Mode's
 * on): while they aren't, nothing's fetched. `clock` gives the time (ms) and `least` the fewest
 * ranges a file may hold: both for the tests.
 */
export class CountryFile {
    constructor({ root, fetch = globalThis.fetch, clock = Date.now, least = GEOIP.least, wanted = () => true } = {}) {
        Object.assign(this, { root, fetch, clock, least, wanted });
        /** Told once a newer file's been fetched and is answered by. */
        this.onFetched = () => {};
        /** The table looked up in (parseCountries), or null with no file read. */
        this.table = null;
        /** What's known of the file: { month, fetchedAt (ms), rows }, or null. */
        this.about = null;
        /** Why the last fetch failed, or null. */
        this.error = null;
        this.timer = null;
        this.fetching = null;
    }

    get folder() {
        return path.join(this.root, GEOIP.folder);
    }

    /** Whether there's no file, or it's too old to answer by (GEOIP.staleDays since it was fetched). */
    get stale() {
        return !this.table || !this.about || this.clock() - this.about.fetchedAt > GEOIP.staleDays * DAY;
    }

    /** The country an address is in: null with no file, a stale one, or an address in no country's range. */
    country(address) {
        return this.stale ? null : countryOf(this.table, address);
    }

    /** For the management page: { month, fetchedAt, rows, stale, error, credit }, month and the rest null with no file. */
    info() {
        return { month: this.about?.month ?? null, fetchedAt: this.about?.fetchedAt ?? null, rows: this.about?.rows ?? null, stale: this.stale, error: this.error, credit: GEOIP.credit };
    }

    // The file's bytes (compressed) as a table, refused if it unpacks too big or holds too few ranges
    #read(bytes) {
        const table = parseCountries(gunzipSync(bytes, { maxOutputLength: GEOIP.unpacked }).toString("utf8"));

        if (table.rows < this.least) {
            throw new Error(`The country file holds ${table.rows} ranges: too few to be the whole of it.`);
        }

        return table;
    }

    /** The file read from the data folder, if there's one there that reads. Never throws: none, or a spoilt one, is no file. */
    async load() {
        try {
            const about = await readJSON(path.join(this.folder, GEOIP.about));
            const table = this.#read(await readFile(path.join(this.folder, GEOIP.file)));

            if (typeof about?.month === "string" && Number.isFinite(about.fetchedAt)) {
                this.table = table;
                this.about = { month: about.month, fetchedAt: about.fetchedAt, rows: table.rows };
            }
        } catch {
            // (No file yet, or not one that reads: every country unknown till one's fetched)
        }

        return this;
    }

    /** Whether it's time to fetch: there's no file, or it isn't this month's. */
    get due() {
        return !this.table || this.about?.month !== monthOf(this.clock());
    }

    /**
     * This month's file fetched (last month's, if this month's isn't out yet), checked by reading
     * all of it, and only then kept in place of the one before. Returns info(); what went wrong
     * is in its `error`, and the file there was is still the one answered by.
     */
    refresh() {
        this.fetching ??= this.#refresh().finally(() => {
            this.fetching = null;
        });

        return this.fetching;
    }

    async #refresh() {
        const problems = [];

        for (const month of [monthOf(this.clock()), monthOf(this.clock(), 1)]) {
            // (Last month's, already held: nothing newer's out)
            if (this.table && this.about?.month === month) {
                break;
            }

            try {
                const response = await this.fetch(GEOIP.url(month), { headers: { "User-Agent": "pellagos-server" }, signal: AbortSignal.timeout(120000) });

                if (!response.ok) {
                    throw new Error(`answered ${response.status}`);
                }

                const bytes = Buffer.from(await response.arrayBuffer());

                if (bytes.length > GEOIP.limit) {
                    throw new Error(`${bytes.length} bytes, more than a country file is`);
                }

                const table = this.#read(bytes);
                const about = { month, fetchedAt: this.clock(), rows: table.rows };

                await writeAtomic(path.join(this.folder, GEOIP.file), bytes);
                await writeJSON(path.join(this.folder, GEOIP.about), about);
                Object.assign(this, { table, about, error: null });
                this.onFetched();

                return this.info();
            } catch (error) {
                problems.push(`${month}: ${error.message}`);
            }
        }

        this.error = problems.length ? problems.join("; ") : null;

        return this.info();
    }

    /** Looked at as the server starts and once a day after (`look`). Not started, it fetches nothing by itself. */
    start() {
        this.close();
        this.timer = setInterval(() => this.look(), GEOIP.every);
        this.timer.unref?.();
        this.look();
    }

    /** Fetched if it's started, wanted and due (and whenever Nanny Mode's settings change: turned on, it's fetched at once). */
    look() {
        if (this.timer && this.wanted() && this.due) {
            this.refresh().catch(() => {});
        }
    }

    close() {
        clearInterval(this.timer);
        this.timer = null;
    }
}
