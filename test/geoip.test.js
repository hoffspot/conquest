// The country file's loader and lookup (server/net/geoip.js; the scaling plan's 6B-19).

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";

import { addressOf, CountryFile, countryOf, GEOIP, monthOf, parseCountries } from "../server/net/geoip.js";

// Ten rows in the file's own form, made up for the test (documentation ranges and a few real
// shapes): IPv4 then IPv6, each family in order
const FIXTURE = [
    "0.0.0.0,0.255.255.255,ZZ",
    "1.0.0.0,1.0.0.255,AU",
    "1.0.1.0,1.0.3.255,CN",
    "81.2.69.0,81.2.69.255,GB",
    "177.0.0.0,177.0.255.255,BR",
    "203.0.113.0,203.0.113.255,ID",
    "2001:db8::,2001:db8:0:ffff:ffff:ffff:ffff:ffff,GB",
    "2001:db8:1::,2001:db8:1:ffff:ffff:ffff:ffff:ffff,BR",
    "2a00::,2a00:ffff:ffff:ffff:ffff:ffff:ffff:ffff,DE",
    "fc00::,fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff,ZZ",
].join("\n");

const DAY = 86400000;
const NOVEMBER = Date.UTC(2026, 10, 28);

describe("the country file (server/net/geoip.js)", () => {
    it("reads an address as it's looked up: IPv4, IPv6 with :: filled in, an IPv4 address written as IPv6 taken for the IPv4 one, and nothing else", () => {
        assert.deepEqual(addressOf("81.2.69.160"), { family: 4, value: 81 * 2 ** 24 + 2 * 2 ** 16 + 69 * 256 + 160 });
        assert.deepEqual(addressOf("255.255.255.255"), { family: 4, value: 2 ** 32 - 1 });
        assert.deepEqual(addressOf("::ffff:81.2.69.160"), addressOf("81.2.69.160"), "(IPv4-mapped)");
        assert.deepEqual(addressOf("::ffff:5102:45a0"), addressOf("81.2.69.160"), "(and in hex)");
        assert.deepEqual(addressOf("[2001:db8::1]"), { family: 6, hi: 0x20010db800000000n, lo: 1n });
        assert.deepEqual(addressOf("2001:db8:0:0:0:0:0:1"), addressOf("2001:db8::1"));
        assert.deepEqual(addressOf("fe80::1%en0"), { family: 6, hi: 0xfe80000000000000n, lo: 1n }, "(a zone let go of)");
        assert.deepEqual(addressOf("::"), { family: 6, hi: 0n, lo: 0n });
        assert.deepEqual(addressOf("64:ff9b::192.0.2.1"), { family: 6, hi: 0x0064ff9b00000000n, lo: 0xc0000201n });

        for (const none of ["", "tunnel", "1.2.3", "1.2.3.256", "01.2.3.4", "1.2.3.4.5", "2001:db8", "1::2::3", "2001:db8::g", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7::8", null, undefined, 7]) {
            assert.equal(addressOf(none), null, String(none));
        }
    });

    it("looks an address up in a ten-row file: IPv4, IPv6, IPv4-mapped, the first and last address of a range, a miss between ranges and past the last, and what's no country's", () => {
        const table = parseCountries(FIXTURE);

        assert.equal(table.rows, 10);
        assert.deepEqual([table.v4.starts.length, table.v6.startHi.length], [6, 4]);

        for (const [address, country] of [
            ["81.2.69.160", "GB"],
            ["177.0.12.1", "BR"],
            ["203.0.113.9", "ID"],
            ["::ffff:81.2.69.160", "GB"],
            ["2001:db8::1", "GB"],
            ["2001:db8:1:2::3", "BR"],
            ["2a00:1450:4009::200e", "DE"],
            // (A range's edges, and either side of them)
            ["1.0.0.0", "AU"],
            ["1.0.0.255", "AU"],
            ["1.0.1.0", "CN"],
            ["1.0.3.255", "CN"],
            ["1.0.4.0", null],
            ["2001:db8::", "GB"],
            ["2001:db8:0:ffff:ffff:ffff:ffff:ffff", "GB"],
            ["2001:db8:1::", "BR"],
            ["2001:db8:2::", null],
            ["2001:db7:ffff:ffff:ffff:ffff:ffff:ffff", null],
            // (A miss: between ranges, before the first IPv6 one, past the last)
            ["8.8.8.8", null],
            ["255.255.255.255", null],
            ["::1", null],
            ["ffff::1", null],
            // (No country's: the file's ZZ)
            ["0.1.2.3", null],
            ["fd00::1", null],
            // (Not an address)
            ["tunnel", null],
            [null, null],
        ]) {
            assert.equal(countryOf(table, address), country, String(address));
        }

        assert.equal(countryOf(null, "81.2.69.160"), null, "(no table: no answer)");
    });

    it("refuses a file that isn't whole: a row that isn't a range and a country, ends of two families or the wrong way round, ranges out of order or over one another", () => {
        for (const [text, why] of [
            ["1.0.0.0,1.0.0.255", /line 1/],
            ["1.0.0.0,1.0.0.255,AU\n<html>", /line 2/],
            ["1.0.0.0,1.0.0.255,au", /line 1/],
            ["1.0.0.0,2001:db8::,AU", /line 1/],
            ["1.0.0.0,1.0.0.255,AU,extra", /line 1/],
            ["1.0.0.255,1.0.0.0,AU", /in order/],
            ["1.0.1.0,1.0.1.255,CN\n1.0.0.0,1.0.0.255,AU", /in order/],
            ["1.0.0.0,1.0.0.255,AU\n1.0.0.255,1.0.1.255,CN", /in order/],
            ["2001:db8:1::,2001:db8:1::ffff,BR\n2001:db8::,2001:db8::ffff,GB", /in order/],
        ]) {
            assert.throws(() => parseCountries(text), why, text);
        }

        assert.equal(parseCountries("").rows, 0);
        assert.equal(parseCountries('"1.0.0.0","1.0.0.255","AU"\r\n\r\n').rows, 1, "(quoted, with a blank line and Windows line ends)");
    });

    it("names a month's file, and the one before it", () => {
        assert.equal(monthOf(NOVEMBER), "2026-11");
        assert.equal(monthOf(NOVEMBER, 1), "2026-10");
        assert.equal(monthOf(Date.UTC(2027, 0, 31), 1), "2026-12");
        assert.equal(GEOIP.url("2026-11"), "https://download.db-ip.com/free/dbip-country-lite-2026-11.csv.gz");
        assert.deepEqual(GEOIP.credit, { text: "IP Geolocation by DB-IP", href: "https://db-ip.com" });
    });

    it("downloads the month's file into the data folder through the fetch it's given, keeps it only once it's read whole, answers by it, reads it again on the next start, and answers nothing once it's stale", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-geoip-"));
        const asked = [];
        let now = NOVEMBER;
        let served = { "2026-11": gzipSync(FIXTURE) };
        const fetch = async (url) => {
            const month = /lite-(\d{4}-\d{2})\.csv\.gz$/.exec(url)[1];

            asked.push(month);

            return served[month] ? { ok: true, status: 200, arrayBuffer: async () => served[month] } : { ok: false, status: 404 };
        };
        const file = new CountryFile({ root, fetch, clock: () => now, least: 5 });

        try {
            // No file: no answer, and one's due
            await file.load();
            assert.deepEqual([file.country("81.2.69.160"), file.stale, file.due], [null, true, true]);
            assert.deepEqual(file.info(), { month: null, fetchedAt: null, rows: null, stale: true, error: null, credit: GEOIP.credit });

            // Fetched: answered by, and kept
            assert.deepEqual(await file.refresh(), { month: "2026-11", fetchedAt: NOVEMBER, rows: 10, stale: false, error: null, credit: GEOIP.credit });
            assert.deepEqual(asked, ["2026-11"]);
            assert.deepEqual([file.country("81.2.69.160"), file.country("::ffff:177.0.0.1"), file.country("8.8.8.8"), file.due], ["GB", "BR", null, false]);
            assert.deepEqual(JSON.parse(await readFile(path.join(root, "geoip", "about.json"), "utf8")), { month: "2026-11", fetchedAt: NOVEMBER, rows: 10 });

            // The next start reads it from the folder, asking nothing
            const again = await new CountryFile({ root, fetch, clock: () => now, least: 5 }).load();

            assert.deepEqual([again.country("203.0.113.9"), again.info().month, asked.length], ["ID", "2026-11", 1]);

            // December, its file not out yet, and November's held: nothing newer taken, no error
            now = Date.UTC(2026, 11, 2);
            assert.equal(file.due, true);
            assert.deepEqual([(await file.refresh()).month, file.error], ["2026-11", "2026-12: answered 404"]);
            assert.deepEqual(asked.slice(1), ["2026-12"]);
            assert.equal(file.country("81.2.69.160"), "GB", "(the file there was still answers)");

            // A file that isn't whole is never kept in place of a good one
            served = { "2026-12": gzipSync("1.0.0.0,1.0.0.255,AU\n<html>cut short") };
            assert.match((await file.refresh()).error, /2026-12: The country file's line 2/);
            served = { "2026-12": gzipSync("1.0.0.0,1.0.0.255,AU") };
            assert.match((await file.refresh()).error, /too few/);
            served = { "2026-12": Buffer.from("not gzip") };
            assert.ok((await file.refresh()).error);
            assert.deepEqual([file.info().month, file.country("81.2.69.160")], ["2026-11", "GB"]);

            // December's out: taken
            served = { "2026-12": gzipSync(FIXTURE.replace("81.2.69.0,81.2.69.255,GB", "81.2.69.0,81.2.69.255,IE")) };
            assert.deepEqual([(await file.refresh()).month, file.error, file.country("81.2.69.160")], ["2026-12", null, "IE"]);

            // Sixty-two days on with nothing newer to be had: stale on the sixty-third, and no answer
            served = {};
            now += GEOIP.staleDays * DAY;
            assert.deepEqual([file.stale, file.country("81.2.69.160")], [false, "IE"]);
            now += DAY;
            assert.deepEqual([file.stale, file.country("81.2.69.160"), file.info().stale], [true, null, true]);

            // A spoilt file in the folder is no file
            await writeFile(path.join(root, "geoip", "dbip-country-lite.csv.gz"), "spoilt");
            assert.equal((await new CountryFile({ root, fetch, clock: () => now, least: 5 }).load()).table, null);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it("looks for a file as it's started only where it's wanted: Nanny Mode off, nothing's asked of anyone", async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-geoip-"));
        const asked = [];
        const fetch = async (url) => {
            asked.push(url);

            return { ok: true, status: 200, arrayBuffer: async () => gzipSync(FIXTURE) };
        };
        let wanted = false;
        let told = 0;
        const file = new CountryFile({ root, fetch, clock: () => NOVEMBER, least: 5, wanted: () => wanted });

        file.onFetched = () => told++;

        try {
            // Not started: nothing's fetched by itself, wanted or not
            wanted = true;
            file.look();
            assert.deepEqual(asked, []);

            // Started with Nanny Mode off: nothing
            wanted = false;
            file.start();
            assert.deepEqual(asked, []);

            // Turned on: fetched at once, and whoever's listening told
            wanted = true;
            file.look();
            await file.fetching;
            assert.deepEqual([asked.length, file.country("81.2.69.160"), told], [1, "GB", 1]);

            // Held, and this month's: nothing more asked
            file.look();
            assert.equal(asked.length, 1);
            file.close();
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
