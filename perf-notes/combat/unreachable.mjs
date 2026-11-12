// What a way costs when it can't get where it's sent (a free square the mesh doesn't reach from
// here): the tiles made for it there and then (navigation.js WIDER: a ring, then three), and how
// long the one call takes; with the tiles within 64 m of the walker in already, as the game bakes
// them ahead round a player.
import { Host, HOST_PLAYER } from "/home/user/conquest/client/js/core/host.js";
import { buildWorld } from "/home/user/conquest/client/js/core/overworld.js";
import { squaresOf } from "/home/user/conquest/client/js/core/grid.js";
import { navigatorOf, releaseNavigation } from "/home/user/conquest/client/js/core/navigation.js";
import { createRandom } from "/home/user/conquest/client/js/core/random.js";

const world = buildWorld({ seed: Number(process.argv[2] ?? 2) });
const host = new Host(world, { populate: false });

host.join({ id: HOST_PLAYER, hero: { name: "Ada", shape: {}, look: {}, weapon: "bow", boots: false } });

const me = host.battle.actor(HOST_PLAYER);
const map = host.battle.maps.town;
const squares = squaresOf(map);
const random = createRandom(11);
const from = [me.x, me.y];
let navigation = navigatorOf(map);

navigation.around(from[0], from[1], Number(process.argv[4] ?? 64));

// (Free squares 10 to 60 m off that the way from here doesn't get to)
const short = [];
let tried = 0;

while (short.length < 4 && tried < 3000) {
    tried++;

    const angle = random.next() * Math.PI * 2;
    const far = 10 + random.next() * Number(process.argv[3] ?? 50);
    const to = [Math.floor(from[0] + Math.cos(angle) * far) + 0.5, Math.floor(from[1] + Math.sin(angle) * far) + 0.5];

    if (squares.blocked(Math.floor(to[0]), Math.floor(to[1])) || (squares.roomy && !squares.roomy(Math.floor(to[0]), Math.floor(to[1])))) {
        continue;
    }

    const way = navigation.wayIn(from, to);
    const end = way.at(-1);

    if (!end || Math.hypot(end[0] - to[0], end[1] - to[1]) > 2) {
        short.push({ to, far, ended: end ? Math.hypot(end[0] - to[0], end[1] - to[1]) : null });
    }
}

console.log(`${tried} free squares tried within 60 m of the start: ${short.length} the way doesn't reach`);

for (const { to, far, ended } of short) {
    releaseNavigation(map);
    navigation = navigatorOf(map);
    navigation.around(from[0], from[1], Number(process.argv[4] ?? 64));

    const [tiles, baked] = [navigation.tiles.size, navigation.baked];
    const start = performance.now();
    const way = navigation.path(from, to);
    const ms = performance.now() - start;

    // (Again, the tiles in now: the search alone)
    const again = performance.now();

    navigation.path(from, to);

    const search = performance.now() - again;

    console.log(`a square ${far.toFixed(0)} m off (the way over the tiles near ends ${ended === null ? "nowhere" : `${ended.toFixed(1)} m short`}): ${navigation.baked - baked} more tiles baked in the one call (${tiles} in before), ${ms.toFixed(0)} ms; asked again, ${search.toFixed(2)} ms; ${way.length} corners`);
}
