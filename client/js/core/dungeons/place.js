// What's put in a dungeon level once it's dug (core/dungeons: docs/DUNGEONS.md), whatever kind of
// place it is: its way in (a front door, or the foot of stairs up), the stairs down in the room
// furthest in (or on the bottom level, the boss before its hoard there), the mini-bosses along the
// way, packs in the other rooms, chests here and there (likelier off the way through, in dead
// ends), each room dressed as its theme has that kind of room (themes.js) and lit by torches on its
// walls. Every square of open ground can still be walked to when it's done.
//
// Pure: whole numbers and the level's own random stream (seeds.js), the same on every machine.

import { CREATURES, TIERS } from "../creatures.js";
import { EIGHT, FOUR } from "./grid.js";
import { neighbours, roomPath } from "./graph.js";
import { WAY_IN } from "./layouts.js";
import { pickStable } from "./seeds.js";

/** Characters a level's plan uses beyond floor and rock, that block walking (interiors.js PLAN_KEY). */
export const BLOCKING = new Set(["*", "%", "V", "^", "x", "y", "u", "K", "T", "R", "Y", "I", "t", "Z", "a", "s", "k", "m", "d", "i", "e", "o", "n", "v", "X", "A", "J"]);

/**
 * How far (rings of squares) no one waits from where anyone comes onto a level: as the places
 * gone into keep their holders (insides.js WAY_IN_CLEAR), so no one's within a blow of whoever
 * comes in, nor of their followers.
 */
export const ARRIVE_CLEAR = 5;

/** Floor lights from props: their plan character and the kind of light. */
export const FIRES = Object.freeze({ x: "campfire", y: "brazier", k: "candles" });

/** How far apart (rings of squares) those in a pack stand, and how far from a room's ways in at least. */
export const SPREAD = Object.freeze({ apart: 2, doors: 3 });

/**
 * How likely a room is to have a pack in it, by how many levels the dungeon has (fewer each the
 * more there are, so a deep one takes about as long to clear as a shallow one).
 */
export const PACK_ODDS = Object.freeze({ 1: 1, 2: 0.9, 3: 0.75 });

/** Each level's pack's chance of an elite (a tier up), by how deep it is. */
export const ELITE = Object.freeze([0.1, 0.2, 0.3]);

// A level being filled: its grid, rooms and links, what's on each square, and what's taken
class Level {
    constructor(grid, layout) {
        this.grid = grid;
        this.width = grid.width;
        this.height = grid.height;
        this.layout = layout;
        // (Each square's plan character, 0 for none: floor or rock as dug)
        this.chars = new Uint8Array(grid.width * grid.height);
        // (Squares nothing more may go on: the ways in, landings, where foes stand, chests)
        this.reserved = new Uint8Array(grid.width * grid.height);
    }

    key(x, y) {
        return y * this.width + x;
    }

    char(x, y) {
        const code = this.chars[this.key(x, y)];

        return code ? String.fromCharCode(code) : null;
    }

    put(x, y, char) {
        this.chars[this.key(x, y)] = char.charCodeAt(0);
    }

    /** Can a square be walked on: open ground with nothing on it that blocks. */
    walkable(x, y) {
        return this.grid.open(x, y) && !BLOCKING.has(this.char(x, y));
    }

    /** Is a square open, unblocked and not taken. */
    free(x, y) {
        return this.walkable(x, y) && !this.reserved[this.key(x, y)] && !this.char(x, y);
    }

    reserve(x, y) {
        if (this.grid.inside(x, y)) {
            this.reserved[this.key(x, y)] = 1;
        }
    }

    /** How many steps every square is from the way in, walking round what blocks (-1: no way). */
    distances(from) {
        const { width } = this;
        const far = new Int32Array(width * this.height).fill(-1);
        const queue = new Int32Array(width * this.height);
        let [head, tail] = [0, 0];

        for (const [x, y] of from) {
            if (this.walkable(x, y) && far[this.key(x, y)] < 0) {
                far[this.key(x, y)] = 0;
                queue[tail++] = this.key(x, y);
            }
        }

        while (head < tail) {
            const k = queue[head++];
            const [x, y] = [k % width, Math.floor(k / width)];

            for (const [dx, dy] of FOUR) {
                if (this.walkable(x + dx, y + dy) && far[k + dy * width + dx] < 0) {
                    far[k + dy * width + dx] = far[k] + 1;
                    queue[tail++] = k + dy * width + dx;
                }
            }
        }

        return far;
    }

    /** Can every square that can be walked on be walked to from `from`. */
    connected(from) {
        const far = this.distances(from);

        for (let k = 0; k < far.length; k++) {
            if (far[k] < 0 && this.walkable(k % this.width, Math.floor(k / this.width))) {
                return false;
            }
        }

        return true;
    }
}

// Is a creature right for a tier: within a tier of the tiers it's met at
const suits = (creature, tier, slack = 1) => {
    const [least, most] = CREATURES[creature]?.tiers ?? [1, TIERS];

    return tier >= least - slack && tier <= most + slack;
};

// One of a theme's packs (or mini-bosses, or bosses) for a slot, by its tier; the nearest to the
// tier if none suits
function chooseFoe(seed, slot, list, tier, slack) {
    const of = (entry) => entry.creatures ?? [entry.creature];
    const suited = list.filter((entry) => of(entry).some((creature) => suits(creature, tier, slack)));

    if (suited.length) {
        return pickStable(seed, slot, suited);
    }

    const off = (entry) => Math.min(...of(entry).map((creature) => Math.min(...(CREATURES[creature]?.tiers ?? [tier]).map((t) => Math.abs(t - tier)))));

    return [...list].sort((a, b) => off(a) - off(b) || a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * Fill a dug level (layouts.js's `dug`): { chars, reserved, entry, down, packs, chests, lights,
 * looks (each room's look's id, by its id), rooms, links, path, goal, arena, hoard } (see
 * buildDungeon). `plan`: { index, levels (how many),
 * theme, tier (the level's), boss (on the bottom level: { tier }), minis (how many here), seed,
 * random }.
 */
export function fillLevel(dug, rooms, links, plan) {
    const { grid } = dug;
    const { theme, random, seed, index } = plan;
    const level = new Level(grid, dug);
    const [ex, ey] = dug.entrance;
    const slot = (...parts) => [index, ...parts].join(":");
    const roomOf = (x, y) => grid.room[level.key(x, y)];

    // The way in: the front door on the south edge, or the foot of stairs up (`^`, three squares
    // long, and its landing `<`); the way up to them kept clear, and where anyone coming in stands
    const entry = { squares: [], arrive: null, facing: Math.PI };

    if (index === 0) {
        level.put(ex, ey, "D");
        level.put(ex + 1, ey, "D");
        entry.squares = [[ex, ey], [ex + 1, ey]];
        entry.arrive = [ex, ey - 5];
    } else {
        for (let y = ey - 3; y <= ey - 1; y++) {
            level.put(ex, y, "^");
            level.put(ex + 1, y, "^");
        }

        level.put(ex, ey - 4, "<");
        level.put(ex + 1, ey - 4, "<");
        entry.squares = [[ex, ey - 4], [ex + 1, ey - 4]];
        entry.arrive = [ex, ey - 6];
    }

    for (let y = ey; y >= ey - WAY_IN - 1; y--) {
        for (let x = ex - 1; x <= ex + 2; x++) {
            level.reserve(x, y);
        }
    }

    const start = index === 0 ? [[ex, ey - 1], [ex + 1, ey - 1]] : entry.squares;
    let far = level.distances(start);
    const byRoom = neighbours(rooms, links);
    const room = new Map(rooms.map((one) => [one.id, one]));
    const farOf = (one) => far[level.key(...one.centre)];
    const entryRoom = dug.entryRoom;
    const goal = dug.goalRoom >= 0 && room.has(dug.goalRoom) ? dug.goalRoom : rooms.filter(({ id }) => id !== entryRoom).sort((a, b) => farOf(b) - farOf(a) || a.id - b.id)[0]?.id ?? entryRoom;
    const path = roomPath(byRoom, entryRoom, goal) ?? [entryRoom, goal];

    // Where each room's ways in are (its squares beside another room's or a passage's)
    const doorways = new Map(rooms.map(({ id }) => [id, []]));

    for (const one of rooms) {
        for (const k of one.cells) {
            const [x, y] = [k % level.width, Math.floor(k / level.width)];

            if (FOUR.some(([dx, dy]) => grid.open(x + dx, y + dy) && roomOf(x + dx, y + dy) !== one.id)) {
                doorways.get(one.id).push([x, y]);
            }
        }
    }

    const fromDoors = (id, [x, y]) => Math.min(Infinity, ...doorways.get(id).map(([u, v]) => Math.max(Math.abs(u - x), Math.abs(v - y))));
    const openAround = (x, y) => EIGHT.every(([dx, dy]) => level.walkable(x + dx, y + dy));
    const nextTo = (x, y, test) => EIGHT.some(([dx, dy]) => test(x + dx, y + dy));

    // Put a prop (its squares) if it leaves every square reachable; whether it was
    const putProp = (squares, char) => {
        for (const [x, y] of squares) {
            level.put(x, y, char);
        }

        if (!BLOCKING.has(char) || level.connected(start)) {
            return true;
        }

        for (const [x, y] of squares) {
            level.chars[level.key(x, y)] = 0;
        }

        return false;
    };

    // --- The stairs down (every level but the bottom), in the room furthest in ---

    let down = null;

    if (index < plan.levels - 1) {
        down = stairsDown(level, room.get(goal), far, putProp);

        if (down) {
            far = level.distances(start);
        }
    }

    // (Where anyone comes onto the level: no one waits within ARRIVE_CLEAR of them)
    const ways = () => [entry.arrive, ...(down ? [down.arrive] : [])];

    // --- The boss before its hoard (the bottom level), in the arena ---

    const packs = [];
    const chests = [];
    let hoard = null;

    if (index === plan.levels - 1) {
        const arena = room.get(goal);
        const axis = Math.floor(level.width / 2);
        // (At the far end: the furthest walk in; or for a theme whose hoard's at the head of its
        // hall (an ancient temple's), on the middle way three squares from its north wall)
        const head = theme.hoard === "head";
        const deep = arena.cells
            .map((k) => [k % level.width, Math.floor(k / level.width)])
            .filter(([x, y]) => level.free(x, y) && openAround(x, y) && fromDoors(goal, [x, y]) >= 4 && (!head || y >= arena.y + 3))
            .sort((a, b) => (head ? a[1] - b[1] || Math.abs(2 * (a[0] - axis) + 1) - Math.abs(2 * (b[0] - axis) + 1) : far[level.key(...b)] - far[level.key(...a)]) || a[1] - b[1] || a[0] - b[0]);

        hoard = deep[0] ?? arena.centre;
        level.put(hoard[0], hoard[1], "h");

        for (const [dx, dy] of EIGHT) {
            level.reserve(hoard[0] + dx, hoard[1] + dy);
        }

        level.reserve(...hoard);
        chests.push({ id: `${index}-hoard`, at: hoard, kind: "hoard", room: goal });

        // (The boss a few steps before it, towards the way into the arena, its guard about it)
        const boss = chooseFoe(seed, slot("boss"), theme.bosses, plan.boss.tier, 3);
        const before = arena.cells
            .map((k) => [k % level.width, Math.floor(k / level.width)])
            .filter(([x, y]) => level.free(x, y) && far[level.key(x, y)] <= far[level.key(...hoard)] - 3)
            .map((at) => ({ at, rank: Math.abs(far[level.key(...at)] - (far[level.key(...hoard)] - 4)) * 4 + Math.max(Math.abs(at[0] - hoard[0]), Math.abs(at[1] - hoard[1])) }))
            .sort((a, b) => a.rank - b.rank || a.at[1] - b.at[1] || a.at[0] - b.at[0]);
        const lord = before[0]?.at ?? arena.centre;

        level.reserve(...lord);

        const guard = boss.guard ? { creatures: boss.guard } : chooseFoe(seed, slot("boss-guard"), theme.packs, plan.tier, 1);
        const escorts = spotsIn(level, arena, random.int(2, 3), { near: lord, doors: 3, fromDoors, ways: ways() });

        for (const at of escorts) {
            level.reserve(...at);
        }

        packs.push({
            id: `${index}-boss`,
            role: "boss",
            room: goal,
            title: boss.title,
            foes: [
                { creature: boss.creature, tier: plan.boss.tier, at: lord, boss: true, title: boss.title, regalia: boss.id },
                ...escorts.map((at, k) => ({ creature: guard.creatures[k % guard.creatures.length], tier: plan.tier, at })),
            ],
        });
    }

    // --- Mini-bosses along the way through ---

    const along = path.slice(1, -1);
    const taken = new Set([entryRoom, goal]);

    for (let k = 0; k < plan.minis; k++) {
        const want = Math.round((0.35 + (0.45 * (k + 0.5)) / plan.minis) * (path.length - 1));
        const choices = [...along, ...rooms.filter(({ id }) => !path.includes(id)).map(({ id }) => id)].filter((id) => !taken.has(id));
        const id = choices.sort((a, b) => Math.abs(path.indexOf(a) - want) - Math.abs(path.indexOf(b) - want) + (path.indexOf(a) < 0) - (path.indexOf(b) < 0) || a - b)[0];

        if (id === undefined) {
            break;
        }

        taken.add(id);

        const mini = chooseFoe(seed, slot("mini", k), theme.minis, Math.min(TIERS, plan.tier + 1), 2);
        const [heart] = spotsIn(level, room.get(id), 1, { near: room.get(id).centre, doors: 3, fromDoors, ways: ways() });

        if (!heart) {
            continue;
        }

        level.reserve(...heart);

        const guard = chooseFoe(seed, slot("mini-guard", k), theme.packs, plan.tier, 1);
        const escorts = spotsIn(level, room.get(id), random.int(1, 2), { near: heart, doors: 3, fromDoors, ways: ways() });

        for (const at of escorts) {
            level.reserve(...at);
        }

        packs.push({
            id: `${index}-mini-${k}`,
            role: "mini",
            room: id,
            title: mini.title,
            foes: [{ creature: mini.creature, tier: Math.min(TIERS, plan.tier + 1), at: heart, mini: true, title: mini.title, regalia: mini.id }, ...escorts.map((at, j) => ({ creature: guard.creatures[j % guard.creatures.length], tier: plan.tier, at }))],
        });
    }

    // --- Packs in most other rooms (the stairs' room guarded, often) ---

    const elite = ELITE[Math.min(index, ELITE.length - 1)];

    for (const one of rooms) {
        if (one.id === entryRoom || (taken.has(one.id) && one.id !== goal) || (one.id === goal && index === plan.levels - 1)) {
            continue;
        }

        const kind = dug.kinds[one.id];
        const odds = (one.id === goal ? 0.7 : kind === "nook" || kind === "cell" || kind === "store" ? 0.5 : 0.8) * PACK_ODDS[plan.levels];

        if (!random.chance(odds)) {
            continue;
        }

        const pack = chooseFoe(seed, slot("pack", one.id), theme.packs, plan.tier, 1);
        const size = Math.min(6, random.int(...pack.size) + (index > 0 ? 1 : 0) + (one.area >= 150 ? 1 : 0));
        const spots = spotsIn(level, one, size, { doors: SPREAD.doors, fromDoors, random, ways: ways() });

        if (!spots.length) {
            continue;
        }

        packs.push({
            id: `${index}-pack-${one.id}`,
            role: "pack",
            room: one.id,
            title: null,
            foes: spots.map((at, k) => {
                level.reserve(...at);

                return { creature: pack.creatures[k % pack.creatures.length], tier: Math.min(TIERS, plan.tier + (random.chance(elite) ? 1 : 0)), at };
            }),
        });
    }

    // --- Small chests, here and there: likeliest in dead ends, then off the way through ---

    const wanted = random.int(2, index === plan.levels - 1 ? 3 : 4);
    const hasChest = new Set();

    for (let k = 0; k < rooms.length && chests.filter(({ kind }) => kind === "small").length < wanted; k++) {
        const choices = rooms.filter(({ id }) => id !== entryRoom && id !== goal && !hasChest.has(id));

        if (!choices.length) {
            break;
        }

        const weight = ({ id }) => ((byRoom.get(id)?.length ?? 0) <= 1 ? 4 : path.includes(id) ? 1 : 2);
        const one = random.pickWeighted(choices, weight);
        const spot = one.cells
            .map((c) => [c % level.width, Math.floor(c / level.width)])
            .filter(([x, y]) => level.free(x, y) && fromDoors(one.id, [x, y]) >= 2 && FOUR.some(([dx, dy]) => !grid.open(x + dx, y + dy)) && FOUR.some(([dx, dy]) => level.walkable(x + dx, y + dy)) && !nextTo(x, y, (u, v) => BLOCKING.has(level.char(u, v))))
            .sort((a, b) => far[level.key(...b)] - far[level.key(...a)] || a[1] - b[1] || a[0] - b[0])[0];

        hasChest.add(one.id);

        if (spot) {
            level.put(spot[0], spot[1], "$");
            level.reserve(...spot);
            chests.push({ id: `${index}-chest-${one.id}`, at: spot, kind: "small", room: one.id });
        }
    }

    // --- Dressing: each room as its theme has that kind of room; torches on its walls ---

    const lights = [];
    // (Which of its kind's looks each room has: its art's, world/interiors3d.js, by it)
    const looks = {};

    for (const one of rooms) {
        const kind = dug.kinds[one.id];
        const look = pickStable(seed, slot("room", one.id), theme.rooms[kind] ?? theme.rooms.any ?? []);

        if (!look) {
            continue;
        }

        looks[one.id] = look.id;

        for (const [n, prop] of (look.props ?? []).entries()) {
            dress(level, one, prop, { random, putProp, fromDoors, count: random.int(...prop.count), axis: Math.floor(level.width / 2), tag: n });
        }

        // (Torches on the walls, spread round the room; the arena's and the way in's at least two)
        const torches = random.int(...(look.torches ?? [0, 1])) + (one.id === entryRoom || one.id === goal ? 1 : 0);

        lights.push(...torchesIn(level, one, torches, random));
    }

    // (And the light from what burns on the floor: camp fires, braziers, candles)
    for (let k = 0; k < level.chars.length; k++) {
        const fire = FIRES[String.fromCharCode(level.chars[k])];

        if (fire) {
            lights.push({ at: [k % level.width, Math.floor(k / level.width)], kind: fire });
        }
    }

    return { level, entry, down, packs, chests, lights, looks, path, goal, hoard };
}

/**
 * Up to `count` squares in a room for those in it to stand on: free, with ground all round, at
 * least SPREAD.apart rings from each other and `doors` from its ways in (relaxed if there aren't
 * enough), and ARRIVE_CLEAR rings from where anyone comes onto the level (`ways`: the squares
 * arrived on); nearest `near` first, or else in an order from `random`, else along the rows.
 */
export function spotsIn(level, room, count, { near = null, doors = SPREAD.doors, fromDoors, random = null, apart = SPREAD.apart, ways = [] }) {
    const squares = room.cells.map((k) => [k % level.width, Math.floor(k / level.width)]);
    const ordered = near ? squares.sort((a, b) => Math.max(Math.abs(a[0] - near[0]), Math.abs(a[1] - near[1])) - Math.max(Math.abs(b[0] - near[0]), Math.abs(b[1] - near[1])) || a[1] - b[1] || a[0] - b[0]) : random ? random.shuffle(squares) : squares;
    const picked = [];

    for (const [strict, keep] of [[true, doors], [false, Math.min(doors, 1)]]) {
        for (const at of ordered) {
            if (picked.length >= count) {
                break;
            }

            const [x, y] = at;
            const clear = ways.every(([u, v]) => Math.max(Math.abs(u - x), Math.abs(v - y)) >= ARRIVE_CLEAR);
            const fine = clear && level.free(x, y) && fromDoors(room.id, at) >= keep && (!strict || EIGHT.every(([dx, dy]) => level.walkable(x + dx, y + dy)));
            const spaced = picked.every(([u, v]) => Math.max(Math.abs(u - x), Math.abs(v - y)) >= apart) && (!near || x !== near[0] || y !== near[1]);

            if (fine && spaced) {
                picked.push(at);
            }
        }
    }

    return picked;
}

// The stairs down: three squares long and two wide (`V`), dug into the wall of the room furthest
// in where they'll go, their landing (`>`) before them, deepest first; where anyone coming up them
// stands, two steps off the landing, facing away. { squares, arrive, facing }, or null
function stairsDown(level, goal, far, putProp) {
    const { grid } = level;
    const found = [];

    for (const k of goal.cells) {
        const [x, y] = [k % level.width, Math.floor(k / level.width)];

        for (const [dx, dy] of FOUR) {
            const [px, py] = [-dy, dx];
            const landing = [[x, y], [x + px, y + py]].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
            const block = [1, 2, 3].flatMap((t) => [[x + dx * t, y + dy * t], [x + px + dx * t, y + py + dy * t]]);
            const back = [[x - dx, y - dy], [x + px - dx, y + py - dy], [x - 2 * dx, y - 2 * dy]];
            const ok =
                landing.every(([u, v]) => level.free(u, v) && grid.room[level.key(u, v)] === goal.id) &&
                back.every(([u, v]) => level.free(u, v)) &&
                block.every(([u, v]) => grid.inside(u, v, 2) && (grid.open(u, v) ? grid.room[level.key(u, v)] === goal.id && level.free(u, v) : true));

            if (ok) {
                const rock = block.filter(([u, v]) => !grid.open(u, v)).length;

                found.push({ landing, block, arrive: [x - 2 * dx, y - 2 * dy], facing: [-dx, -dy], rank: rock * 1000 + far[k] });
            }
        }
    }

    found.sort((a, b) => b.rank - a.rank || a.landing[0][1] - b.landing[0][1] || a.landing[0][0] - b.landing[0][0]);

    for (const one of found.slice(0, 40)) {
        // (Dug into the rock where it runs into it, as part of the room)
        const dug = one.block.filter(([u, v]) => !grid.open(u, v));

        for (const [u, v] of dug) {
            grid.dig(u, v, goal.id);
        }

        if (putProp(one.block, "V")) {
            for (const [u, v] of one.landing) {
                level.put(u, v, ">");
                level.reserve(u, v);
            }

            for (const [u, v] of [...one.landing.map(([u0, v0]) => [u0 + one.facing[0], v0 + one.facing[1]]), one.arrive]) {
                level.reserve(u, v);
            }

            const [fx, fy] = one.facing;

            return { squares: one.landing, arrive: one.arrive, facing: facingOf(fx, fy) };
        }

        for (const [u, v] of dug) {
            grid.fill(u, v);
        }
    }

    return null;
}

/** The facing (radians from south, towards east: interiors.js FACING) of a step (dx, dy). */
export const facingOf = (dx, dy) => (dy > 0 ? 0 : dy < 0 ? Math.PI : dx > 0 ? Math.PI / 2 : -Math.PI / 2);

// Dress a room with one of its look's props, `count` of it (each where `prop.at` says; mirrored
// across the middle way too if `mirror`), as many as fit
function dress(level, room, prop, { random, putProp, fromDoors, count, axis }) {
    const { grid } = level;
    const [w, h] = prop.size ?? [1, 1];
    const squares = room.cells.map((k) => [k % level.width, Math.floor(k / level.width)]);
    const footprint = ([x, y]) => {
        const cells = [];

        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                cells.push([x + i, y + j]);
            }
        }

        return cells;
    };
    const blocked = (x, y) => BLOCKING.has(level.char(x, y));
    // (Free, in the room, off its ways in, and nothing else that blocks touching it)
    const fits = (cells, keep = 2) => cells.every(([x, y]) => level.free(x, y) && grid.room[level.key(x, y)] === room.id && fromDoors(room.id, [x, y]) >= keep && !EIGHT.some(([dx, dy]) => blocked(x + dx, y + dy) && !cells.some(([u, v]) => u === x + dx && v === y + dy)));
    const wallSide = ([x, y]) => FOUR.find(([dx, dy]) => !grid.open(x + dx, y + dy) && level.walkable(x - dx, y - dy));
    const mirrorOf = (cells) => cells.map(([x, y]) => [2 * axis - 1 - x, y]);
    let candidates;

    switch (prop.at) {
        case "wall":
            candidates = squares.filter((at) => wallSide(at));
            break;
        case "head":
            // (At the head of the room: against its north wall, centred on the middle way)
            candidates = squares.filter(([x, y]) => !grid.open(x, y - 1)).sort((a, b) => a[1] - b[1] || Math.abs(2 * (a[0] - axis) + w) - Math.abs(2 * (b[0] - axis) + w) || a[0] - b[0]);
            break;
        case "corner":
            candidates = squares.filter(([x, y]) => FOUR.filter(([dx, dy]) => !grid.open(x + dx, y + dy)).length >= 2);
            break;
        case "centre":
            candidates = [...squares].sort((a, b) => Math.max(Math.abs(a[0] - room.centre[0]), Math.abs(a[1] - room.centre[1])) - Math.max(Math.abs(b[0] - room.centre[0]), Math.abs(b[1] - room.centre[1])) || a[1] - b[1] || a[0] - b[0]);
            break;
        case "rows":
            // (Pillars every third square across a hall, the left half then mirrored, the middle
            // way and a square in from the walls kept clear)
            candidates = squares.filter(([x, y]) => x < axis - 2 && (x - room.x) % 3 === 2 && (y - room.y) % 3 === 2 && y < room.y + room.h - 2);
            break;
        case "sides":
            candidates = squares.filter(([x, y]) => x === room.x && (y - room.y) % 3 === 2 && y < room.y + room.h - 2);
            break;
        default:
            candidates = squares.filter(([x, y]) => EIGHT.every(([dx, dy]) => level.walkable(x + dx, y + dy)));
    }

    if (!["centre", "rows", "sides", "head"].includes(prop.at)) {
        candidates = random.shuffle(candidates);
    }

    let placed = 0;

    for (const at of candidates) {
        if (placed >= count) {
            break;
        }

        const cells = footprint(at);
        const twin = prop.mirror || prop.at === "rows" || prop.at === "sides" ? mirrorOf(cells) : null;
        const same = twin && twin.every(([x, y], k) => x === cells[k][0] && y === cells[k][1]);

        if (!fits(cells) || (twin && !same && !fits(twin))) {
            continue;
        }

        if (!putProp(cells, prop.char)) {
            continue;
        }

        placed++;

        if (twin && !same) {
            if (putProp(twin, prop.char)) {
                placed++;
            } else {
                for (const [x, y] of cells) {
                    level.chars[level.key(x, y)] = 0;
                }

                placed--;
            }
        }
    }

    return placed;
}

// Torches on a room's walls: `count`, spread round it (at least four rings apart), each on a square
// against the rock with ground before it. [{ at, kind: "torch", wall: [dx, dy] (towards the wall) }]
function torchesIn(level, room, count, random) {
    const { grid } = level;
    const lit = [];

    for (const k of random.shuffle(room.cells)) {
        if (lit.length >= count) {
            break;
        }

        const [x, y] = [k % level.width, Math.floor(k / level.width)];
        const wall = FOUR.find(([dx, dy]) => !grid.open(x + dx, y + dy));

        if (!wall || !level.walkable(x, y) || level.char(x, y) || !level.walkable(x - wall[0], y - wall[1]) || lit.some(({ at: [u, v] }) => Math.max(Math.abs(u - x), Math.abs(v - y)) < 4)) {
            continue;
        }

        lit.push({ at: [x, y], kind: "torch", wall });
    }

    return lit;
}
