// Which code this is, for the debug log (app/telemetry.js): the commit it was built from (its
// 40 hex digits) and when it was put together (UTC, to the second). Written in as the site's put
// together (.github/workflows/pages.yml, scripts/stamp-version.js), each in place of its noughts
// and as long. As it's kept in the repository, all noughts: a copy run from it (npm start, the
// tests) is "dev". main.js imports it, so it's loaded with the page, as the code is: from the
// network first (sw.js), the same version as the rest.

export const COMMIT = "0000000000000000000000000000000000000000";

export const BUILT = "0000-00-00T00:00:00Z";

/** The code's version as the debug log names it: the commit's first 10 digits, or "dev". */
export function codeVersion(commit = COMMIT) {
    return /^[0-9a-f]{40}$/.test(commit) && !/^0+$/.test(commit) ? commit.slice(0, 10) : "dev";
}

/** When the code was put together (an ISO date), or null for a copy run from the repository. */
export function builtAt(built = BUILT) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(built) && !built.startsWith("0000") ? built : null;
}
