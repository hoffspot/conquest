// node wary-trace.mjs <root>: test/wary.test.js's "struck, whatever its mood", traced.
const root = process.argv[2];
const { Battle, STEP_MS } = await import(`${root}/client/js/core/battle.js`);
const { CREATURES, traitsOf } = await import(`${root}/client/js/core/creatures.js`);

const battle = new Battle({ blocked: Array.from({ length: 120 }, () => new Uint8Array(120)) }, { seed: 3, nerve: () => 8 });
const spec = CREATURES.boar;
const boar = battle.add({ id: "boar", kind: "beast", name: spec.name, weapon: spec.weapon, team: "wild", square: [40, 40], ai: "wild", hp: spec.hp * 20, speed: spec.speed, chase: spec.chase, wild: { creature: "boar", tier: 2, temper: spec.temper, guard: spec.guard ?? 0, roam: 0, leash: 60, pack: "boar", leader: null, menace: true, unique: false, ...traitsOf("boar"), packSize: 1 } });

boar.chance = { next: () => 0, int: (low) => low, state: 0 };
battle.add({ id: "player", kind: "player", name: "Wren", weapon: "sword", team: "hero", square: [40, 48], hp: 5000, armed: true });

const me = battle.actor("player");
const say = (events) => events.filter(({ type }) => !["step"].includes(type)).forEach((event) => console.log(event.time, event.type, event.id ?? "", event.target ?? "", event.kind ?? "", event.on ?? ""));

for (let t = 0; t < 500; t += STEP_MS) {
    say(battle.advance(STEP_MS));
}

console.log("mood", boar.mood?.kind, "boar", boar.x.toFixed(2), boar.y.toFixed(2), "armed", me.armed, me.drawing);
battle.place("player", "town", [Math.floor(boar.x), Math.floor(boar.y) + 1]);
battle.command("player", { type: "engage", target: "boar" });

for (let t = 0; t < 3000; t += STEP_MS) {
    say(battle.advance(STEP_MS));

    if (t % 250 === 0) {
        console.log(battle.time, "boar", boar.x.toFixed(2), boar.y.toFixed(2), boar.mood?.kind, "me", me.x.toFixed(2), me.y.toFixed(2), "armed", me.armed, JSON.stringify(me.drawing), me.attack?.id ?? "");
    }
}
