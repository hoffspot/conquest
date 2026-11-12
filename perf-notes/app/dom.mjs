// How many elements client/index.html holds as served, by top-level part (a rough count: start tags).
import { readFileSync } from "node:fs";
const html = readFileSync("/home/user/conquest/client/index.html", "utf8");
const body = html.slice(html.indexOf("<body"));
const voids = new Set(["br", "img", "input", "meta", "link", "hr", "source", "path", "circle", "rect", "line", "use", "stop", "polygon", "polyline", "ellipse"]);
const tags = [...body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g)];
let depth = 0; const stack = []; const counts = new Map(); let total = 0; let svg = 0;
for (const [, close, name, attrs] of tags) {
    const lower = name.toLowerCase();
    if (close) { while (stack.length && stack.pop().name !== lower); continue; }
    total++;
    if (["svg", "path", "g", "circle", "rect", "defs", "use", "line", "polygon", "ellipse", "lineargradient", "radialgradient", "stop", "symbol"].includes(lower)) svg++;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1] ?? null;
    const top = stack.find((each) => each.depth === 1) ?? null;
    const key = stack.length >= 1 ? (stack[1]?.label ?? stack[0]?.label ?? "?") : `${lower}${id ? "#" + id : ""}`;
    const label = `${lower}${id ? "#" + id : ""}`;
    const selfClosing = /\/$/.test(attrs) || voids.has(lower);
    const rootKey = stack.length === 0 ? label : stack.length === 1 ? label : stack[1].label;
    counts.set(rootKey, (counts.get(rootKey) ?? 0) + 1);
    if (!selfClosing) stack.push({ name: lower, label, depth: stack.length });
}
console.log("elements in <body> (start tags):", total, "of them svg-ish:", svg);
console.log([...counts].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v}\t${k}`).join("\n"));
console.log("dialogs:", (body.match(/<dialog/g) ?? []).length, "sections/screens:", (body.match(/class="screen/g) ?? []).length);
