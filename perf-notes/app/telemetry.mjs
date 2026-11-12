// What app/telemetry.js costs a frame as game.js #frame drives it: begin, eight marks, end, aliveSoon
// (the notes themselves written after the frame, every 2 s: not counted here).
import { Telemetry, PHASE } from "/home/user/conquest/client/js/app/telemetry.js";
const store = new Map();
const telemetry = new Telemetry({ storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } });
telemetry.playing = true;
telemetry.graphics = { programs: Array.from({ length: 60 }, (_, id) => ({ id })), memory: { textures: 300, geometries: 900 } };
const state = () => ({ playing: 1 });
const frame = () => { telemetry.begin(performance.now()); for (let k = 0; k < 8; k++) telemetry.mark(k); telemetry.end(16.7, state); telemetry.aliveSoon(state, () => {}); };
for (let i = 0; i < 5000; i++) frame();
console.log("BEGIN telemetry (a frame)");
const out = [];
for (let run = 0; run < 3; run++) { const N = 200000; const s = performance.now(); for (let i = 0; i < N; i++) frame(); out.push(((performance.now() - s) / N * 1000).toFixed(2)); }
console.log("END telemetry (a frame) 600000");
console.log(`telemetry: ${out.join(" / ")} us a frame; events kept meanwhile: ${telemetry.events.length}`);
