// What looking ahead costs a joined game (app/forecast.js): the repository's own joined game in
// one process (test/joinedgame.js playJoined), its Forecast.at timed each frame: the frames in
// which it makes its battle again (after a word from the host, or a command sent) against the rest.
//
//   node forecast-cost.mjs [rtt=300]
const { Forecast } = await import("/home/user/conquest/client/js/app/forecast.js");
const { playJoined } = await import("/home/user/conquest/test/joinedgame.js");
const { buildWorld } = await import("/home/user/conquest/client/js/core/overworld.js");

const RTT = Number(process.argv[2] ?? 300);
const at = Forecast.prototype.at;
const made = [];
const kept = [];

Forecast.prototype.at = function timed(...given) {
    const again = !this.track;
    const a = performance.now();
    const place = at.apply(this, given);

    (again ? made : kept).push(performance.now() - a);

    return place;
};

const character = { hero: { name: "Bryn", shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50 } };
const sorted = (list) => [...list].sort((a, b) => a - b);
const stats = (list) => (list.length ? `n ${list.length}, mean ${(list.reduce((s, e) => s + e, 0) / list.length).toFixed(3)} ms, median ${sorted(list)[Math.floor(list.length / 2)].toFixed(3)}, p95 ${sorted(list)[Math.floor(list.length * 0.95)].toFixed(3)}, worst ${sorted(list).at(-1).toFixed(2)}` : "none");

for (let round = 0; round < 3; round++) {
    made.length = kept.length = 0;

    const started = performance.now();

    // (Zig-zagging at a run: the stick turned every 0.7 s)
    playJoined(buildWorld({ seed: 2 }), buildWorld({ seed: 2 }), { character, rtt: RTT, ms: 20000, stick: (t) => ({ facing: (Math.floor(t / 700) % 2 ? 0.9 : -0.6) + Math.floor(t / 4000), run: true }) });

    const frames = made.length + kept.length;
    const total = [...made, ...kept].reduce((s, e) => s + e, 0);

    console.log(`round ${round + 1} (rtt ${RTT} ms, 20 s, ${frames} frames, ${(performance.now() - started).toFixed(0)} ms wall):`);
    console.log(`  frames that look ahead afresh: ${stats(made)} (${(made.length / 20).toFixed(1)} a second)`);
    console.log(`  the other frames: ${stats(kept)}`);
    console.log(`  in all ${(total / 20).toFixed(1)} ms of each second, ${(total / frames).toFixed(3)} ms a frame on the mean`);
}
