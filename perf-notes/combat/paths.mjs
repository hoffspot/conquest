// What a way costs to find over the real overworld's mesh (seed 2, the open ground the field
// battle's fought on, and the start town's streets), by its length; and the mesh's other questions
// the battle asks each step (walkable: #clear).
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { squaresOf } from "/home/user/conquest/client/js/core/grid.js";
import { navigatorOf } from "/home/user/conquest/client/js/core/navigation.js";
import { createRandom } from "/home/user/conquest/client/js/core/random.js";

const world = buildWorld({ seed: 2 });
const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false } });

const me = host.battle.actor(HOST_PLAYER);
const map = host.battle.maps.town;
const squares = squaresOf(map);
const navigation = navigatorOf(map);
const random = createRandom(5);
const town = [me.x, me.y];
let field = null;

const open = (x0, y0) => {
    for (let y = y0 - 70; y < y0 + 10; y++) {
        for (let x = x0 - 25; x < x0 + 25; x++) {
            if (squares.blocked(x, y) || squares.opaque(x, y)) {
                return false;
            }
        }
    }

    return true;
};

out: for (let r = 60; r < 1500; r += 20) {
    for (let a = 0; a < 24; a++) {
        const [x, y] = [Math.round(me.x + r * Math.cos((a * Math.PI) / 12)), Math.round(me.y + r * Math.sin((a * Math.PI) / 12))];

        if (open(x, y)) {
            field = [x, y - 30];
            break out;
        }
    }
}

function measure(label, [cx, cy], spread, lengths) {
    for (const length of lengths) {
        const pairs = [];

        while (pairs.length < 300) {
            const from = [cx + (random.next() - 0.5) * spread, cy + (random.next() - 0.5) * spread];
            const angle = random.next() * Math.PI * 2;
            const to = [from[0] + Math.cos(angle) * length, from[1] + Math.sin(angle) * length];

            if (!squares.blocked(Math.floor(from[0]), Math.floor(from[1])) && !squares.blocked(Math.floor(to[0]), Math.floor(to[1]))) {
                pairs.push([from, to]);
            }
        }

        // (Tiles baked, and the code warm)
        for (const [from, to] of pairs) {
            navigation.path(from, to);
        }

        const runs = [];
        let corners = 0;
        let found = 0;

        for (let run = 0; run < 5; run++) {
            const start = performance.now();

            for (const [from, to] of pairs) {
                const way = navigation.path(from, to);

                if (run === 0) {
                    corners += way.length;
                    found += way.length ? 1 : 0;
                }
            }

            runs.push(((performance.now() - start) / pairs.length) * 1000);
        }

        runs.sort((a, b) => a - b);
        console.log(`${label}, ${length} m: ${runs[0].toFixed(0)} us a way at the least of 5 runs (${runs[2].toFixed(0)} the median, ${runs[4].toFixed(0)} the most); ${(corners / pairs.length).toFixed(1)} corners a way, ${found} of ${pairs.length} found`);
    }

    // (walkable: twice each step aside)
    const points = Array.from({ length: 2000 }, () => [cx + (random.next() - 0.5) * spread, cy + (random.next() - 0.5) * spread]);
    const runs = [];

    for (let run = 0; run < 6; run++) {
        const start = performance.now();

        for (const [x, y] of points) {
            navigation.walkable(x, y);
        }

        runs.push(((performance.now() - start) / points.length) * 1000);
    }

    runs.sort((a, b) => a - b);
    console.log(`${label}: walkable ${runs[0].toFixed(1)} us at the least (${runs[3].toFixed(1)} the median)`);
}

measure("open ground (the field battle's)", field, 40, [2, 10, 30, 60]);
measure("the start town", town, 60, [2, 10, 30, 60]);
console.log(`tiles in the mesh: ${navigation.tiles.size}, baked ${navigation.baked}`);
