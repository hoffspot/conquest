// Hold alone, recast as it's ready, on a dungeon's boss (a frost troll: unique, a champion "boss",
// tier 10): how much of the time it's stunned, and how many blows it starts, with the Hexes skill
// at its second level (Hold's first: stuns 15% longer) and at its last (twice as long).
import { Battle, STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { CREATURES, tierPower, traitsOf } from "/home/user/conquest/client/js/core/creatures.js";

for (const [label, stun] of [["Hexes 2 (stun x1.15)", 1.15], ["Hexes 6 (stun x2)", 2], ["no Hexes bonus (x1), Hold and Stun both", 1]]) {
    const world = { blocked: Array.from({ length: 60 }, () => new Uint8Array(60)) };
    const battle = new Battle(world, { seed: 3 });
    const spec = CREATURES.frostTroll;

    battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30], power: { stun } });
    battle.add({ id: "boss", kind: "beast", team: "beasts", weapon: spec.weapon, square: [28, 30], ai: "wild", hp: Math.round(spec.hp * tierPower(10) * 6), speed: spec.speed, chase: spec.chase, armor: spec.armor, wild: { creature: "frostTroll", tier: 10, temper: "aggressive", guard: 0, roam: spec.roam, leash: 40, pack: null, leader: null, menace: true, unique: true, champion: "boss", ...traitsOf("frostTroll", { boss: true }) } });

    const boss = battle.actor("boss");
    let stunned = 0;
    let attacks = 0;
    let moved = 0;
    const [x0, y0] = [boss.x, boss.y];
    const seconds = 120;

    for (let t = 0; t < seconds * 1000; t += STEP_MS) {
        battle.cast("hero", "hold", "boss");

        if (label.includes("both")) {
            battle.cast("hero", "stun", "boss");
        }

        for (const event of battle.advance(STEP_MS)) {
            attacks += event.type === "attack" && event.id === "boss" ? 1 : 0;
        }

        stunned += battle.time < boss.stunnedUntil ? 1 : 0;
        moved = Math.max(moved, Math.hypot(boss.x - x0, boss.y - y0));
    }

    console.log(`${label}: the boss stunned ${((stunned / (seconds * 20)) * 100).toFixed(1)}% of ${seconds} s, began ${attacks} blows, got ${moved.toFixed(1)} m from where it stood (the hero 8 m off)`);
}
