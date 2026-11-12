// No fight at all: N soldiers of one people standing at their posts in a camp (2 m apart), and
// what a step costs then (each armed one asks every step whether it's in a fight: #arm, #inFight;
// each looks for the nearest enemy it can see: #patrol).
import { pathToFileURL } from "node:url";

const { Battle, STEP_MS } = await import(pathToFileURL(process.env.BATTLE ?? "/home/user/conquest/client/js/core/battle.js").href);
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

for (const n of [25, 50, 100, 200, 400]) {
    const world = { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) };
    const runs = [];

    for (let run = 0; run < 5; run++) {
        const battle = new Battle(world, { seed: 7 });
        const wide = Math.ceil(Math.sqrt(n));

        for (let k = 0; k < n; k++) {
            const square = [Math.floor(80 - wide + (k % wide) * 2), Math.floor(80 - wide + Math.floor(k / wide) * 2)];

            battle.add({ id: `a-${k}`, kind: "soldier", team: "a", weapon: ["sword", "bow", "hammer", "staff"][k % 4], square, ai: "patrol", patrol: [square], leash: 12, ...(process.env.FORMED ? { formation: { id: "camp", slot: [0, 0], role: "front" } } : {}) });
        }

        const times = [];

        for (let t = 0; t < 20000; t += STEP_MS) {
            const start = performance.now();

            battle.advance(STEP_MS);
            times.push(performance.now() - start);
        }

        runs.push(times);
    }

    const least = runs[0].map((_, k) => Math.min(...runs.map((times) => times[k]))).slice(40);
    const sorted = [...least].sort((a, b) => a - b);

    console.log(`${n} standing, no enemy anywhere: mean ${(least.reduce((sum, ms) => sum + ms, 0) / least.length).toFixed(3)} ms a step, p95 ${quantile(sorted, 0.95).toFixed(3)}, worst ${sorted.at(-1).toFixed(2)}`);
}
