// node dbg-ways.mjs <battle.js>: who calls #pathTo in the pack's chase (the test's scenario).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const file = process.argv[2];
const copy = path.join(path.dirname(file), "_dbg.js");
const src = readFileSync(file, "utf8").replace("    #pathTo(actor, goal, point = [goal[0] + 0.5, goal[1] + 0.5]) {", "    #pathTo(actor, goal, point = [goal[0] + 0.5, goal[1] + 0.5]) {\n        globalThis.pathTo?.(actor, new Error().stack.split(\"\\n\")[2].trim().split(\" \")[1]);");

writeFileSync(copy, src);

const { Battle, STEP_MS } = await import(copy);
const battle = new Battle({ blocked: Array.from({ length: 60 }, () => new Uint8Array(120)) }, { seed: 5 });
const ids = Array.from({ length: 40 }, (_, k) => `g${k}`);

ids.forEach((id, k) => battle.add({ id, kind: "soldier", team: "a", weapon: "sword", square: [10 + (k % 20) * 2, 40 + Math.floor(k / 20) * 2], ai: "patrol", patrol: [[10 + (k % 20) * 2, 40 + Math.floor(k / 20) * 2]], leash: 200, sight: 60 }));
battle.add({ id: "runner", kind: "soldier", team: "b", weapon: "sword", square: [12, 20], hp: 9000, speed: 2 });

for (let t = 0; t < 1000; t += STEP_MS) {
    battle.advance(STEP_MS);
}

battle.command("runner", { type: "move", to: [110, 20] });
ids.forEach((id) => Object.assign(battle.actor(id), { target: "runner", lastSeen: battle.time }));

for (let t = 0; t < 1500; t += STEP_MS) {
    const who = {};

    globalThis.pathTo = (actor, caller) => (who[caller] = (who[caller] ?? 0) + 1);
    battle.advance(STEP_MS);

    const g = battle.actor("g7");

    console.log(battle.time, JSON.stringify(who), "g7 path", g.path.length, "lastPathAt", g.lastPathAt, "target", g.target, "armed", g.armed);
}

(await import("node:fs")).unlinkSync(copy);
