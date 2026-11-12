// A shot never gives up: let go at someone who then outruns it (a rider at a gallop, 13.4 m/s,
// and a fireball at 9), it follows them however far, and lands when they stop.
import { Battle, STEP_MS } from "/home/user/conquest/client/js/core/battle.js";
import { horseFrom, horseHealth } from "/home/user/conquest/client/js/core/mounts.js";
import { createRandom } from "/home/user/conquest/client/js/core/random.js";

const world = { blocked: Array.from({ length: 60 }, () => new Uint8Array(400)) };
const battle = new Battle(world, { seed: 3 });

battle.add({ id: "hero", kind: "player", team: "a", weapon: "sword", square: [20, 30] });
battle.add({ id: "mage", kind: "soldier", team: "b", weapon: "grimoire", square: [26, 30], ai: "patrol", patrol: [[26, 30]], leash: 10, armed: true });
battle.mount("hero", horseFrom(createRandom(1), "h1"), { hp: horseHealth(50), maxHp: horseHealth(50) });

const mage = battle.actor("mage");
const hero = battle.actor("hero");
let launched = null;
let riding = false;

for (let t = 0; t < 120000; t += STEP_MS) {
    // (Up in the saddle: off at a gallop, 330 m east, as soon as a fireball's in the air)
    if (!riding && hero.mount?.phase === "riding" && battle.projectiles.length) {
        riding = true;
        battle.command("hero", { type: "move", to: [370, 30], run: true });
    }

    for (const event of battle.advance(STEP_MS)) {
        if (event.type === "projectile" && launched === null) {
            launched = event.time;
            console.log(`${(event.time / 1000).toFixed(2)} s: the mage lets go a ${event.kind} (${event.speed} m/s), the hero ${Math.hypot(hero.x - mage.x, hero.y - mage.y).toFixed(1)} m off`);
        }

        if (event.type === "hit" && event.projectile !== null && event.projectile !== undefined) {
            console.log(`${(event.time / 1000).toFixed(2)} s: projectile ${event.projectile} lands on the hero's horse or them (${event.damage}), ${Math.hypot(hero.x - mage.x, hero.y - mage.y).toFixed(1)} m from the mage; hero pace ${hero.pace.toFixed(1)} m/s`);
        }
    }

    if (t % 5000 === 0 && riding) {
        console.log(`${(battle.time / 1000).toFixed(0)} s: hero at x=${hero.x.toFixed(0)} (${hero.mount?.phase ?? "on foot"}), ${battle.projectiles.length} projectiles in the air${battle.projectiles.length ? `, the first ${Math.hypot(battle.projectiles[0].x - hero.x, battle.projectiles[0].y - hero.y).toFixed(1)} m behind` : ""}`);
    }

    if (riding && !battle.projectiles.length && battle.time - launched > 20000) {
        break;
    }
}
