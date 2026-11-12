// The throng and the governor fed frames at a steady 30 a second (a browser that asks for frames
// no oftener: Safari in an iPhone's Low Power Mode), the device keeping up with every one of them.
import { Governor } from "/home/user/conquest/client/js/app/governor.js";
import { Throng } from "/home/user/conquest/client/js/app/throng.js";
for (const [label, stamp] of [["times to the millisecond (as Safari gives them)", (t) => Math.round(t)], ["times to the microsecond", (t) => Math.round(t * 1000) / 1000], ["exact times", (t) => t]]) {
    const throng = new Throng(); const governor = new Governor({ levels: ["low", "medium", "high"], ceiling: "low" });
    let last = 0, inFull = 14; const said = []; const rungs = [];
    for (let k = 1; k <= 30 * 60; k++) {
        const now = stamp(k * (1000 / 30)); const interval = now - last; last = now;
        const full = throng.observe(now, interval, { crowdable: 14, inFull });
        if (full !== null) { inFull = Math.min(14, full); said.push(`${(now / 1000).toFixed(1)}s:${full}`); governor.hold(now); }
        else { const rung = governor.observe(now, interval); if (rung) rungs.push(`${(now / 1000).toFixed(1)}s:${rung.quality}@${rung.scale}`); }
    }
    console.log(`${label}:\n   throng (14 about, all in full to start): ${said.join(" ") || "no change"} -> ${inFull} in full after a minute\n   governor (Low chosen): ${rungs.join(" ") || "no change"}`);
}
