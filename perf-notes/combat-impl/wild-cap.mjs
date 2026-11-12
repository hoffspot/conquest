// How many of ten aggressive beasts in sight of a standing player go for them (is the cap theirs?)
const root = process.argv[2];
const { Battle, STEP_MS } = await import(`${root}/client/js/core/battle.js`);
const battle = new Battle({ blocked: Array.from({ length: 80 }, () => new Uint8Array(80)) }, { seed: 6 });

battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [40, 40], hp: 90000 });

for (let k = 0; k < 10; k++) {
    battle.add({ id: `w${k}`, kind: "beast", team: "beasts", weapon: "claws", square: [36 + (k % 5) * 2, 31 + Math.floor(k / 5)], hp: 9000, ai: "wild", wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: null, leader: null } });
}

for (let t = 0; t < 8000; t += STEP_MS) {
    battle.advance(STEP_MS);
}

console.log(battle.actors.filter(({ target }) => target === "hero").length, "of ten beasts on the player");
