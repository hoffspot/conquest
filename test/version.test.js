// Which code this is (client/js/app/version.js), for the debug log: "dev" as it's kept in the
// repository, the commit's first 10 digits once the site's put together; written in by
// scripts/stamp-version.js (.github/workflows/pages.yml), each in place of its noughts and as long
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BUILT, builtAt, codeVersion, COMMIT } from "../client/js/app/version.js";
import { MANIFEST } from "../client/js/app/manifest.js";
import { stamped } from "../scripts/stamp-version.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SHA = "9c6a608eb2fcfae241790ecde86eab7d2d41d17a";

describe("which code this is (version.js)", () => {
    it("is dev as kept in the repository, with no time it was put together", () => {
        assert.equal(COMMIT, "0".repeat(40));
        assert.equal(codeVersion(), "dev");
        assert.equal(builtAt(), null);
        assert.equal(BUILT.length, "2026-10-15T12:49:42Z".length);
    });

    it("is the commit's first 10 digits, and its time, once stamped; anything else is dev", () => {
        assert.equal(codeVersion(SHA), "9c6a608eb2");
        assert.equal(builtAt("2026-10-15T12:49:42Z"), "2026-10-15T12:49:42Z");
        assert.equal(codeVersion("main"), "dev");
        assert.equal(builtAt("yesterday"), null);
    });

    it("is stamped in place of its noughts, as long as they were, once; anything but a commit and a time refused", () => {
        const text = read("client/js/app/version.js");
        const out = stamped(text, SHA, "2026-10-15T12:49:42Z");

        assert.equal(out.length, text.length);
        assert.equal(Buffer.byteLength(out), Buffer.byteLength(text));
        assert.match(out, new RegExp(`export const COMMIT = "${SHA}";`));
        assert.match(out, /export const BUILT = "2026-10-15T12:49:42Z";/);
        assert.throws(() => stamped(out, SHA, "2026-10-15T12:49:42Z"), /stamped already/);
        assert.throws(() => stamped(text, "9c6a608", "2026-10-15T12:49:42Z"), /Not a commit/);
        assert.throws(() => stamped(text, SHA, "2026-10-15"), /Not a time/);
    });

    it("is stamped into the site's copy as it's put together, after it's copied, by the commit published", () => {
        const pages = read(".github/workflows/pages.yml");
        const copied = pages.indexOf("cp -R client _site");
        const stamp = pages.indexOf('node scripts/stamp-version.js _site/js/app/version.js "$GITHUB_SHA"');

        assert.ok(copied > 0, "the site's put together from client/");
        assert.ok(stamp > copied, "and its version.js stamped after");
    });

    it("is loaded with the page (main.js imports it), as the code is, not by the loader: so not in its manifest", () => {
        assert.match(read("client/js/main.js"), /from "\.\/app\/version\.js";/);
        assert.equal(MANIFEST.flatMap(({ files }) => files).find(([file]) => file === "js/app/version.js"), undefined);
    });
});
