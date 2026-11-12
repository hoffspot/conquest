// Reads `node --trace-gc` output on stdin: between "BEGIN <name>" and "END <name> <calls>" lines,
// sums what each scavenge freed (MB before -> after), and prints bytes of garbage a call.
import { createInterface } from "node:readline";
const rl = createInterface({ input: process.stdin });
let open = null, freed = 0, count = 0;
for await (const line of rl) {
    const begin = /^BEGIN (.+)$/.exec(line), end = /^END (.+?) (\d+)$/.exec(line);
    if (begin) { open = begin[1]; freed = 0; count = 0; continue; }
    if (end) { console.log(`${end[1].padEnd(44)} ${count} collections, ${(freed * 1024 / Number(end[2])).toFixed(1)} KB of garbage a call (${end[2]} calls)`); open = null; continue; }
    const gc = /(Scavenge|Mark-Compact[^0-9]*) ([\d.]+) \([\d.]+\) -> ([\d.]+) \([\d.]+\) MB/.exec(line);
    if (gc && open) { freed += Number(gc[2]) - Number(gc[3]); count++; }
    else if (!gc && !/^\[\d+:0x/.test(line)) console.log(line);
}
