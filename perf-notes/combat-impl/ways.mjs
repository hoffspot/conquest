// node ways.mjs <bench dir>: how many ways are found in each step of the open-field battle
// (bench.mjs's, `lasting`), 100 and 200 fighting, 40 s: the mean, and the most in a step.
const { muster } = await import(`${process.argv[2]}/bench.mjs`);
const STEP_MS = 50;

for (const n of [100, 200]) {
    const { battle } = muster(n, "lasting", { blocked: Array.from({ length: 160 }, () => new Uint8Array(160)) });
    const ways = [];
    let found = 0;

    battle.onPath = () => found++;

    for (let t = 0; t < 40000; t += STEP_MS) {
        found = 0;
        battle.advance(STEP_MS);
        ways.push(found);
    }

    const sorted = [...ways].sort((a, b) => b - a);
    const all = ways.reduce((sum, each) => sum + each, 0);

    console.log(`${n} fighting: ${all} ways in ${ways.length} steps (${(all / ways.length).toFixed(2)} a step); the most in a step ${sorted.slice(0, 6).join(", ")}; steps with over 20: ${ways.filter((each) => each > 20).length}`);
}
