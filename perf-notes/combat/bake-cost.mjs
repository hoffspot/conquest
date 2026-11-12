// What one overworld navigation tile costs to bake here and now (navigation.js ensure: its
// triangles from the world, then Recast), where the world round it is made already and where it
// isn't (far from anyone).
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { navigatorOf, releaseNavigation } from "/home/user/conquest/client/js/core/navigation.js";

const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false } });

const me = host.battle.actor(HOST_PLAYER);
const map = host.battle.maps.town;
const stats = (times) => {
    const sorted = [...times].sort((a, b) => a - b);

    return `median ${sorted[Math.floor(sorted.length / 2)].toFixed(1)} ms, least ${sorted[0].toFixed(1)}, most ${sorted.at(-1).toFixed(1)} (${times.length} tiles)`;
};

for (const [label, off] of [["300 m from the start (the world there not made yet)", 300], ["the same tiles again (the world there made)", 300], ["in the start town", 0]]) {
    releaseNavigation(map);

    const navigation = navigatorOf(map);
    const [tx0, ty0] = navigation.tileOf(me.x + off, me.y + off);
    const times = [];

    for (let ty = ty0; ty < ty0 + 4; ty++) {
        for (let tx = tx0; tx < tx0 + 4; tx++) {
            const start = performance.now();

            navigation.ensure(tx, ty);
            times.push(performance.now() - start);
        }
    }

    console.log(`${label}: ${stats(times)}`);
}
