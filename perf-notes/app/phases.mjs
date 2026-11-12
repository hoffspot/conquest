// Scan the methods #update calls each frame for: throttles, allocations, passes over actors/avatars.
import { readFileSync } from "node:fs";
const src = readFileSync("/home/user/conquest/client/js/app/game.js", "utf8");
const lines = src.split("\n");
// index methods: start line -> end line (class methods at 4-space indent)
const methods = new Map();
const re = /^    (?:async )?(?:static )?(?:get |set )?(#?[A-Za-z0-9_]+)\(.*\) \{$/;
for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (m) {
        let j = i + 1;
        while (j < lines.length && lines[j] !== "    }") j++;
        if (!methods.has(m[1])) methods.set(m[1], [i + 1, j + 1]);
    }
}
const body = (name) => { const [a, b] = methods.get(name); return lines.slice(a - 1, b).join("\n"); };
const upd = body("#update");
const called = [...new Set([...upd.matchAll(/this\.(#[A-Za-z0-9_]+)\(/g)].map((m) => m[1]))];
const count = (text, r) => (text.match(r) ?? []).length;
console.log("method | lines | throttle? | actorsPasses | avatarsPasses | spreads | filter/map/sort | newSet/Map | closures");
for (const name of called) {
    if (!methods.has(name)) { console.log(name, "??"); continue; }
    const [a, b] = methods.get(name);
    const text = body(name);
    const throttle = /Clock|= \(this\.[a-zA-Z]+ \?\? 0\) - dt|\-= dt\) > 0|EVERY|every/.test(text.split("\n").slice(0, 14).join("\n"));
    console.log([
        name, `${a}-${b}`, throttle ? "T" : "-",
        count(text, /battle\.actors/g),
        count(text, /this\.avatars(\)|\.values|\.keys|\.entries| of)|of this\.avatars/g),
        count(text, /\[\.\.\./g),
        count(text, /\.(filter|map|sort|flatMap|some|find|reduce|forEach)\(/g),
        count(text, /new (Set|Map)\(/g),
        count(text, /=>/g),
    ].join(" | "));
}
