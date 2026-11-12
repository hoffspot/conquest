// When a world server's steps come, by its own timer (world-worker.js: setInterval at WORKER.tick,
// 25 ms, the runner given the time gone by, a step each 50 ms of it): the gaps between steps over
// 30 s, with nothing else on the thread; and with a timer set for when the next step's due.
import { performance } from "node:perf_hooks";

const STEP = 50;
const run = (label, schedule) => new Promise((resolve) => {
    const steps = [];
    let lag = 0;
    let last = performance.now();
    const started = last;
    const tick = () => {
        const now = performance.now();

        lag += now - last;
        last = now;

        while (lag >= STEP) {
            lag -= STEP;
            steps.push(now);
        }

        if (now - started > 30000) {
            const gaps = steps.slice(1).map((at, k) => at - steps[k]).sort((a, b) => a - b);
            // (How late each came against a steady 50 ms beat, from the quickest: as PLAYOUT reckons it)
            const offsets = steps.map((at, k) => at - k * STEP);
            const lates = offsets.map((offset, k) => offset - Math.min(...offsets.slice(Math.max(0, k - 40), k + 1))).sort((a, b) => a - b);

            console.log(`${label}: ${steps.length} steps; gaps min ${gaps[0].toFixed(1)}, median ${gaps[gaps.length >> 1].toFixed(1)}, p95 ${gaps[Math.floor(gaps.length * 0.95)].toFixed(1)}, max ${gaps.at(-1).toFixed(1)} ms; late against the quickest of the last 2 s: median ${lates[lates.length >> 1].toFixed(1)}, p90 ${lates[Math.floor(lates.length * 0.9)].toFixed(1)}, max ${lates.at(-1).toFixed(1)} ms`);
            resolve();

            return false;
        }

        return lag;
    };

    schedule(tick);
});

await run("setInterval(25), as now", (tick) => {
    const timer = setInterval(() => tick() === false && clearInterval(timer), 25);
});
await run("a timer for when the next step's due", (tick) => {
    const again = () => {
        const lag = tick();

        if (lag !== false) {
            setTimeout(again, Math.max(1, STEP - lag));
        }
    };

    setTimeout(again, STEP);
});
