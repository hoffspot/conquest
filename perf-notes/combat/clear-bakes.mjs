// A battle that's given its ways (as a joined copy takes the host's: Battle.replay), never
// finding one itself: does it still ask the navigation mesh anything? Two walkers sent at each
// other along ways handed to them; the mesh's tiles baked counted after.
import { Battle, STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { navigatorOf } from "/home/user/conquest/client/js/core/navigation.js";

const world = { blocked: Array.from({ length: 40 }, () => new Uint8Array(40)) };
const battle = new Battle(world, { seed: 1 });

battle.add({ id: "one", kind: "folk", team: "t", neutral: true, square: [10, 20] });
battle.add({ id: "two", kind: "folk", team: "t", neutral: true, square: [20, 20] });

// (Each the other's place, straight through each other: no way found, the ways given)
battle.replay = [];
Object.assign(battle.actor("one"), { path: [[20.5, 20.5]], pathGoal: [20, 20], lastPathAt: 0 });
Object.assign(battle.actor("two"), { path: [[10.5, 20.5]], pathGoal: [10, 20], lastPathAt: 0 });

let found = 0;

battle.onPath = () => found++;

const navigation = navigatorOf(world);

console.log(`before: ${navigation.baked} tiles baked`);

for (let t = 0; t < 6000; t += STEP_MS) {
    battle.advance(STEP_MS);

    if (navigation.baked && !globalThis.told) {
        globalThis.told = true;
        console.log(`at ${battle.time} ms (the two ${Math.hypot(battle.actor("one").x - battle.actor("two").x, battle.actor("one").y - battle.actor("two").y).toFixed(2)} m apart): ${navigation.baked} tile baked, with ${found} ways found by this battle`);
    }
}

console.log(`after: ${navigation.baked} tiles baked; ${found} ways found by this battle`);
