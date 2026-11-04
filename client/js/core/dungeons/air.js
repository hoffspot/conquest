// Open air round a level of a dungeon built high in a tower (themes.js `air`: Bellhaven's keep, its
// floors high over the land): its rock no further than `wall` squares from its floor kept as its
// walls, all beyond them open air ("_": not stood on, seen across, nothing there but the sky and
// the land far below: world/interiors3d.js, view.js); and its balconies, on as many of its rooms as
// `balconies` (the biggest first, never the way in), each where a run of the room's wall faces the
// air straight across: `span` squares of it dug out to the air, `wall` deep, a parapet ("=") along
// its outer edge, the torches on that run of wall taken down. Pure, the same wherever it's made.

/**
 * How a level stands in the air (themes.js `air`, as its own or as these): its walls `wall` squares
 * thick, `balconies` at most (a room at least `least` squares in area), each `span` squares along
 * its wall (from to, no more than its wall's run less a square at each end).
 */
export const AIR = Object.freeze({ wall: 3, balconies: 2, span: Object.freeze([4, 8]), least: 60 });

// The four ways out of a room: the step outwards, and which way along its side runs
const SIDES = Object.freeze([
    Object.freeze({ out: [0, -1], along: [1, 0] }),
    Object.freeze({ out: [0, 1], along: [1, 0] }),
    Object.freeze({ out: [-1, 0], along: [0, 1] }),
    Object.freeze({ out: [1, 0], along: [0, 1] }),
]);

// What a balcony may open off inside its room: the floor, or what's on it that isn't in the way
const OPEN = new Set([".", "$", "j", "h", "l", "g", "r"]);

// The eight squares round one
const ROUND = Object.freeze([
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
]);

/** Whether a square of a level's plan (its character) is its open air or a balcony's parapet. */
export const airy = (char) => char === "_" || char === "=";

/**
 * A level (build.js's: width, height, rows, rooms, lights, entry) stood in the air (`air`: AIR's
 * shape; `random`, a seeds.js stream): its rows with its open air and balconies, its lights but
 * those on the walls dug out, and its `balconies` ([{ x, y, w, h (squares: the balcony dug out,
 * its parapet along its outer edge), out: [dx, dy] (the way it faces) }]).
 */
export function inTheAir(level, air, random) {
    const { width, height } = level;
    const { wall, balconies: most, span, least } = { ...AIR, ...air };
    const grid = level.rows.map((row) => [...row]);
    const rock = (x, y) => x < 0 || y < 0 || x >= width || y >= height || grid[y][x] === "#";

    // (How far each square of rock is from the floor, counting the eight ways round: those further
    // than its walls are thick are the air)
    const far = new Int32Array(width * height).fill(-1);
    const queue = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!rock(x, y)) {
                far[y * width + x] = 0;
                queue.push(y * width + x);
            }
        }
    }

    for (let head = 0; head < queue.length; head++) {
        const k = queue[head];
        const [x, y] = [k % width, Math.floor(k / width)];

        for (const [dx, dy] of ROUND) {
            const [nx, ny] = [x + dx, y + dy];

            if (nx >= 0 && ny >= 0 && nx < width && ny < height && far[ny * width + nx] < 0) {
                far[ny * width + nx] = far[k] + 1;
                queue.push(ny * width + nx);
            }
        }
    }

    for (let k = 0; k < width * height; k++) {
        if (far[k] > wall) {
            grid[Math.floor(k / width)][k % width] = "_";
        }
    }

    // (Where each room could have its balcony: a run of its wall `wall` deep with the air straight
    // beyond it all along, before plain floor, not into any other room or way)
    const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? "_" : grid[y][x]);
    const choices = [];

    for (const room of level.rooms) {
        if (room.role === "entry" || room.area < least) {
            continue;
        }

        for (const side of SIDES) {
            const length = side.along[0] ? room.w : room.h;
            // (The first square beyond the room along the side, and a square `k` along it and `d` out)
            const edge = side.out[0] > 0 ? [room.x + room.w, room.y] : side.out[0] < 0 ? [room.x - 1, room.y] : side.out[1] > 0 ? [room.x, room.y + room.h] : [room.x, room.y - 1];
            const square = (k, d) => [edge[0] + side.along[0] * k + side.out[0] * d, edge[1] + side.along[1] * k + side.out[1] * d];
            // (Whether its wall could be dug out at `k`: floor inside it, rock `wall` deep, the air beyond)
            const digs = (k) => {
                if (!OPEN.has(at(...square(k, -1))) || at(...square(k, wall)) !== "_") {
                    return false;
                }

                for (let d = 0; d < wall; d++) {
                    if (at(...square(k, d)) !== "#") {
                        return false;
                    }
                }

                return true;
            };
            // (Its ends against rock or air, not opening into another room or a way)
            const closed = (k) => Array.from({ length: wall }, (_, d) => at(...square(k, d))).every((char) => char === "#" || char === "_");
            let best = null;

            // (The longest run of it that could be, a square in from the room's corners; its middle
            // `span` at most of it)
            for (let k = 1; k < length - 1; ) {
                if (!digs(k)) {
                    k++;
                    continue;
                }

                let end = k;

                while (end + 1 < length - 1 && digs(end + 1)) {
                    end++;
                }

                const run = end - k + 1;
                const long = Math.min(span[1], run);
                const from = k + Math.floor((run - long) / 2);

                if (long >= span[0] && closed(from - 1) && closed(from + long) && (!best || long > best.long)) {
                    best = { long, from };
                }

                k = end + 1;
            }

            if (best) {
                choices.push({ room, side, long: best.long, square: (k, d) => square(best.from + k, d) });
            }
        }
    }

    const order = random.shuffle(choices).sort((a, b) => b.room.area - a.room.area);
    const made = [];

    for (const choice of order) {
        if (made.length >= most || made.some(({ room }) => room === choice.room)) {
            continue;
        }

        const { side, long, square } = choice;

        for (let k = 0; k < long; k++) {
            for (let d = 0; d < wall; d++) {
                const [x, y] = square(k, d);

                grid[y][x] = d === wall - 1 ? "=" : ".";
            }
        }

        const corners = [square(0, 0), square(long - 1, wall - 1)];
        const [x0, x1] = [Math.min(corners[0][0], corners[1][0]), Math.max(corners[0][0], corners[1][0])];
        const [y0, y1] = [Math.min(corners[0][1], corners[1][1]), Math.max(corners[0][1], corners[1][1])];

        made.push({ room: choice.room, balcony: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, out: [...side.out] } });
    }

    const rows = grid.map((row) => row.join(""));
    // (The torches on the walls dug out, taken down)
    const lights = (level.lights ?? []).filter(({ at: [x, y], wall: towards }) => !towards || rows[y + towards[1]]?.[x + towards[0]] === "#");

    return { ...level, rows, lights, balconies: made.map(({ balcony }) => balcony) };
}
