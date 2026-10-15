// Writes which code this is into the site as it's put together (.github/workflows/pages.yml), for
// the debug log (client/js/app/telemetry.js): the commit it's built from (40 hex digits) and the
// time (UTC, to the second), each in place of client/js/app/version.js's noughts and as long.
//
//     node scripts/stamp-version.js <the site's version.js> <commit> [<time>]
//
// Refuses (and so fails the deploy) on anything but a commit's 40 hex digits and a time so
// written, or a version.js whose noughts aren't each there once (stamped already, or changed).

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { BUILT, COMMIT } from "../client/js/app/version.js";

/** `text` (version.js's) with `commit` and `built` in place of its noughts: the same length. */
export function stamped(text, commit, built) {
    if (!/^[0-9a-f]{40}$/.test(commit)) {
        throw new Error(`Not a commit (40 hex digits): ${commit}`);
    }

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(built)) {
        throw new Error(`Not a time (UTC, to the second): ${built}`);
    }

    const commitAt = `export const COMMIT = "${COMMIT}";`;
    const builtAt = `export const BUILT = "${BUILT}";`;

    if (text.split(commitAt).length !== 2 || text.split(builtAt).length !== 2) {
        throw new Error("version.js's COMMIT and BUILT aren't there once each, as noughts: stamped already, or changed?");
    }

    const out = text.replace(commitAt, `export const COMMIT = "${commit}";`).replace(builtAt, `export const BUILT = "${built}";`);

    if (out.length !== text.length) {
        throw new Error("Stamped, version.js would change its length: something else was changed too");
    }

    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [file, commit, built = new Date().toISOString().replace(/\.\d+Z$/, "Z")] = process.argv.slice(2);

    writeFileSync(file, stamped(readFileSync(file, "utf8"), commit, built));
    console.log(`${file}: code ${commit.slice(0, 10)}, put together ${built}`);
}
