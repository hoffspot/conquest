// Parse e2e spec files roughly: each top-level test("title"...) with its body lines, and join with durations.json
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = "/home/user/conquest";
const durations = JSON.parse(readFileSync(path.join(root, "e2e/durations.json"), "utf8"));
const out = [];
for (const file of readdirSync(path.join(root, "e2e")).filter((f) => f.endsWith(".spec.js"))) {
    const lines = readFileSync(path.join(root, "e2e", file), "utf8").split("\n");
    const starts = [];
    const describes = [];
    for (let i = 0; i < lines.length; i++) {
        const d = /^(\s*)test\.describe(?:\.\w+)?\((["'`])(.*?)\2/.exec(lines[i]);
        if (d) describes.push({ line: i, indent: d[1].length, title: d[3] });
        const m = /^(\s*)test(?:\.(only|skip|fixme|slow))?\((["'`])(.*)$/.exec(lines[i]);
        if (m) {
            const q = m[3];
            // title up to the matching unescaped quote
            let t = "", rest = m[4], k = 0;
            for (; k < rest.length; k++) { if (rest[k] === "\\") { t += rest[k + 1]; k++; continue; } if (rest[k] === q) break; t += rest[k]; }
            starts.push({ line: i, indent: m[1].length, title: t, mod: m[2] });
        }
    }
    for (let s = 0; s < starts.length; s++) {
        const st = starts[s];
        // end: the next line at the same indent starting with "});"
        let end = st.line;
        for (let i = st.line + 1; i < lines.length; i++) { if (lines[i].startsWith(" ".repeat(st.indent) + "});")) { end = i; break; } }
        const body = lines.slice(st.line, end + 1).join("\n");
        // describe enclosing
        const encl = describes.filter((d) => d.line < st.line && d.indent < st.indent).sort((a, b) => b.line - a.line);
        const titles = [];
        let ind = st.indent;
        for (const d of encl) { if (d.indent < ind) { titles.unshift(d.title); ind = d.indent; } }
        const name = [file, ...titles, st.title].join(" › ");
        const count = (re) => (body.match(re) ?? []).length;
        out.push({
            file, line: st.line + 1, end: end + 1, lines: end - st.line + 1, name, title: st.title, mod: st.mod,
            seconds: durations[name] ?? null,
            playing: count(/await playing\(/g), title_: count(/await title\(/g), goto: count(/\.goto\(/g), reload: count(/\.reload\(/g),
            wft: count(/waitForTimeout\(/g), playUntil: count(/playUntil\(/g), advance: count(/\.advance\(/g), poll: count(/expect\.poll\(/g), wff: count(/waitForFunction\(/g),
            setTimeout: /test\.setTimeout\((\d[\d_]*)/.exec(body)?.[1] ?? null,
            newPage: count(/newPage\(|newContext\(/g), screenshot: count(/screenshot\(/g),
            addr: (body.match(/playing\(\w+, [`"]([^`"]*)[`"]/) ?? [])[1] ?? null,
        });
    }
}
writeFileSync("/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/tests/e2e-tests.json", JSON.stringify(out, null, 1));
const matched = out.filter((t) => t.seconds !== null);
console.log("parsed", out.length, "matched to durations", matched.length, "of", Object.keys(durations).length);
const names = new Set(out.map((t) => t.name));
const missing = Object.keys(durations).filter((n) => !names.has(n));
console.log("durations without a parsed test:", missing.length);
for (const m of missing.slice(0, 10)) console.log("  ", m.slice(0, 160));
const unt = out.filter((t) => t.seconds === null);
console.log("parsed but untimed:", unt.length);
for (const m of unt.slice(0, 20)) console.log("  ", m.file, m.line, m.title.slice(0, 120));
