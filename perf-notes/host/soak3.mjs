// The cross-engine soak's Node part only (scripts/soak.js soak: a Node host, one Node joiner and
// one idle), for a few minutes, its report printed here and not written into the repository.
const { soak } = await import("/home/user/conquest/scripts/soak.js");
const report = await soak({ seed: 2, minutes: Number(process.argv[2] ?? 3), nodes: 1, browsers: [], idle: true, log: (line) => console.error(line) });

console.log(JSON.stringify({ host: report.host.steps, slow: report.host.slow.length, actors: report.host.actors, players: report.players.map(({ name, steps, resyncs, desyncs, skips, checks, motionChecks, fights, engaged, rate }) => ({ name, steps, resyncs, desyncs, skips, checks, motionChecks, fights, engaged, rate })), failures: report.failures }));
process.exit(0);
