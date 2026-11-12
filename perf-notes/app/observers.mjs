// What the governor, the throng and the invasion budget cost a frame once their windows are full
// (app/game.js #frame 3672-3694): time, and bytes of garbage (the heap's growth with no collection
// between: run with --min-semi-space-size=64 --max-semi-space-size=64 --expose-gc).
import { Governor } from "/home/user/conquest/client/js/app/governor.js";
import { Throng } from "/home/user/conquest/client/js/app/throng.js";
import { InvasionBudget } from "/home/user/conquest/client/js/app/budget.js";

const hz = Number(process.argv[2] ?? 60);
const interval = 1000 / hz;
const run = (label, make, call) => {
    const out = [];
    for (let rep = 0; rep < 3; rep++) {
        const it = make();
        let now = 0;
        // (Past every warm-up and window: 20 s of frames)
        for (let i = 0; i < hz * 20; i++) { now += interval; call(it, now); }
        globalThis.gc?.();
        const before = process.memoryUsage().heapUsed;
        const N = hz * 10;
        const s = performance.now();
        for (let i = 0; i < N; i++) { now += interval; call(it, now); }
        const ms = performance.now() - s;
        const bytes = process.memoryUsage().heapUsed - before;
        out.push(`${(ms / N * 1000).toFixed(1)} us, ${(bytes / N / 1024).toFixed(1)} KB`);
    }
    console.log(`${label.padEnd(28)} per frame at ${hz} Hz: ${out.join(" | ")}`);
};
// (Frames a little uneven, as they are: 16.2 to 17.2 ms)
const jitter = (now) => interval + ((now * 7919) % 10) / 10 - 0.5;
run("governor.observe", () => new Governor(), (g, now) => g.observe(now, jitter(now)));
run("throng.observe", () => new Throng(), (t, now) => t.observe(now, jitter(now), { crowdable: 12, inFull: 12 }));
run("invasionBudget.observe", () => new InvasionBudget(), (b, now) => b.observe(now, jitter(now), 6 + ((now * 31) % 10) / 10, "low"));
run("all three", () => [new Governor(), new Throng(), new InvasionBudget()], ([g, t, b], now) => { t.observe(now, jitter(now), { crowdable: 12, inFull: 12 }); g.observe(now, jitter(now)); b.observe(now, jitter(now), 6 + ((now * 31) % 10) / 10, "low"); });
