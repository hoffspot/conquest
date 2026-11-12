// app/memoryguard.js guardLevel, as game.js #memoryGuarding drives it (every MEMORY_GUARD.every s),
// against a simple model of what its own levels do to what's held: bodies in full capped
// (MEMORY_GUARD.bodies, QUALITY bodies 32), let go at once and built again one every `build` s;
// the decoded sound capped (MEMORY_GUARD.sound), cut at once and growing back `regrow` MB/s as
// things are heard again. Does it settle, or go up and down?
import { guardLevel, MEMORY_GUARD } from "/home/user/conquest/client/js/app/memoryguard.js";
const run = ({ label, rest, perBody, about, soundFull = 82, build = 1.5, regrow = 1, minutes = 10 }) => {
    let level = 0, since = 0, bodies = Math.min(about, 32), sound = soundFull, changes = [], built = 0, peak = 0, last = 0;
    for (let now = 0; now <= minutes * 60; now += MEMORY_GUARD.every) {
        const cap = Math.min(32, MEMORY_GUARD.bodies[level]);
        const want = Math.min(about, cap);
        if (bodies > want) bodies = want; else if (bodies < want) { const add = Math.min(want - bodies, MEMORY_GUARD.every / build); bodies += add; built += add; }
        const soundCap = Math.min(soundFull, (MEMORY_GUARD.sound[level] ?? Infinity) / 1048576);
        sound = sound > soundCap ? soundCap : Math.min(soundCap, sound + regrow * MEMORY_GUARD.every);
        const held = rest + bodies * perBody + sound;
        peak = Math.max(peak, held);
        const next = guardLevel(held, { level, since, now });
        if (next.level !== level) changes.push(`${now}s:${level}>${next.level}@${held.toFixed(0)}MB`);
        ({ level, since } = next);
        last = held;
    }
    console.log(`${label}: ${changes.length} changes of level in ${minutes} min, ${built.toFixed(0)} bodies built again, most held ${peak.toFixed(0)} MB, ends at level ${level} holding ${last.toFixed(0)} MB\n   ${changes.slice(0, 12).join("  ")}${changes.length > 12 ? "  ..." : ""}`);
};
// The city of the 2026-11-11 report: 541 MB with 30 bodies about and 82 MB of sound.
for (const perBody of [8, 10, 12, 15]) run({ label: `city, 30 about, ${perBody} MB a body`, rest: 541 - 82 - 30 * perBody, perBody, about: 30 });
// A quieter place just over the first mark: 22 about
for (const perBody of [10, 12]) run({ label: `town, 22 about, ${perBody} MB a body, 410 MB unguarded`, rest: 410 - 82 - 22 * perBody, perBody, about: 22 });
// Only the sound's saving in play (18 about: under every level's cap)
run({ label: "village, 18 about, 405 MB unguarded", rest: 405 - 82 - 18 * 12, perBody: 12, about: 18 });
