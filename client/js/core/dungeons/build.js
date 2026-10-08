// The dungeon builder (core/dungeons: docs/DUNGEONS.md): a whole dungeon cooked up from a seed
// and a theme, one to three levels deep, each level a map of its own joined to the next by stairs:
// rooms dug as its theme digs them (layouts.js), checked (enough rooms, a long enough way through,
// the room furthest in far enough in) and dug again from the next attempt's numbers if not, then
// filled (place.js): stairs down in the room furthest in, the final boss before its hoard at the
// far end of the bottom level, mini-bosses along the way, packs, small chests, props and torches.
// Each level comes back as plan rows (interiors.js readPlan reads them, as every building's floor)
// and what's in it, for the game to make (core/insides.js, core/host.js).
//
// The same seed, theme, tier and generation always make the same dungeon, on every machine; a
// dungeon cleared and made again is the next generation.

import { TIERS } from "../creatures.js";
import { linksOf, neighbours, roomPath, roomsOf } from "./graph.js";
import { LAYOUTS } from "./layouts.js";
import { fillLevel } from "./place.js";
import { mix, streamOf } from "./seeds.js";
import { dungeonName, THEMES } from "./themes.js";

export { dungeonName };

/**
 * Bumped whenever what a seed makes changes (a dungeon saved with another is made again from its
 * seed as this one makes it, not mixed).
 */
export const DUNGEON_VERSION = 1;

/** How likely a dungeon is to be one, two or three levels deep. */
export const LEVEL_ODDS = Object.freeze({ 1: 3, 2: 4, 3: 3 });

/**
 * How big each level is by how many there are (fewer, bigger levels; about the same time to clear
 * in all, 15 to 25 minutes): squares across (give or take `vary`), and rooms.
 */
export const LEVEL_SIZES = Object.freeze({
    1: { side: 88, vary: 4, rooms: [12, 14] },
    2: { side: 78, vary: 4, rooms: [10, 12] },
    3: { side: 68, vary: 4, rooms: [8, 10] },
});

/** How many mini-bosses a dungeon has, by how many levels deep it is. */
export const MINIS = Object.freeze({ 1: [2, 2], 2: [2, 3], 3: [3, 4] });

/** How many times a level's dug again before the best of its attempts is taken. */
export const ATTEMPTS = 20;

/**
 * What a level has to have: rooms (of those wanted), rooms on the way through (by how many levels
 * there are: the deeper the dungeon, the smaller each level), how far in the end is, the arena's
 * size.
 */
export const CHECKS = Object.freeze({ rooms: 0.8, path: { 1: 5, 2: 4, 3: 3 }, far: 0.6, arena: 160 });

/**
 * Cook up a dungeon: { version, seed, theme, tier, generation, name, levels: [{ index, width,
 * height, rows (plan rows), rooms: [{ id, kind, area, x, y, w, h, centre, role }], links, path
 * (room ids from the way in to the room furthest in), entry ({ squares, arrive, facing }: the
 * front door's or the foot of the stairs up's), down (the same for the stairs down, or null on the
 * bottom level), packs ([{ id, role: "pack" | "mini" | "boss", room, title, foes: [{ creature,
 * tier, at: [x, y], boss?, mini?, title? }] }]), chests ([{ id, at, kind: "small" | "hoard", room }]),
 * lights ([{ at, kind, wall? }]), attempt }] }.
 *
 * `theme`: a THEMES id; `tier`: how strong it is (1 to 10: the land's or its finders', the first
 * level's packs; deeper levels a tier up, mini-bosses a tier over their level, the boss two over
 * the bottom level's packs); `levels`: how many (1 to 3; by seed if not given); `generation`: how
 * many times it's been cleared and made again.
 */
export function buildDungeon({ seed, theme: themeId, tier = 1, levels = null, generation = 0 }) {
    const theme = THEMES[themeId];

    if (!theme) {
        throw new Error(`No dungeon theme "${themeId}"`);
    }

    const plan = streamOf(seed, "plan", generation);
    const count = levels ?? plan.pickWeighted([1, 2, 3], (n) => LEVEL_ODDS[n]);
    const size = LEVEL_SIZES[count];
    const minis = plan.int(...MINIS[count]);
    // (The mini-bosses shared out between the levels, the deeper getting any left over)
    const share = Array.from({ length: count }, (each, k) => Math.floor(minis / count) + (k >= count - (minis % count) ? 1 : 0));
    const dig = LAYOUTS[theme.layout];
    const made = [];

    for (let index = 0; index < count; index++) {
        const levelTier = Math.min(TIERS, tier + (index > 0 ? 1 : 0));
        const bottom = index === count - 1;
        let best = null;

        for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
            const random = streamOf(seed, "level", generation, index, attempt);
            const width = size.side + random.int(-size.vary, size.vary);
            const height = size.side + random.int(-size.vary, size.vary);
            const wanted = random.int(...size.rooms);
            const dug = dig({ width, height, rooms: wanted, arena: bottom, random });
            const level = finish(dug, {
                index,
                levels: count,
                theme,
                tier: levelTier,
                boss: bottom ? { tier: Math.min(TIERS, levelTier + 2) } : null,
                minis: share[index],
                seed: mix(seed, generation, index),
                random: streamOf(seed, "place", generation, index, attempt),
            });
            const score = checkLevel(level, { wanted, bottom, levels: count });

            if (!best || score.passed > best.score.passed) {
                best = { level: { ...level, attempt }, score };
            }

            if (score.ok) {
                break;
            }
        }

        made.push(best.level);
    }

    return { version: DUNGEON_VERSION, seed, theme: theme.id, tier, generation, name: dungeonName(theme, seed), style: theme.style, ground: theme.ground, sound: theme.sound, levels: made };
}

// A dug level read back (its rooms and links), filled and written out as plan rows
function finish(dug, plan) {
    const { grid } = dug;
    const rooms = roomsOf(grid, dug.count);
    const links = linksOf(grid);
    const filled = fillLevel(dug, rooms, links, plan);
    const { level } = filled;
    const rows = [];

    for (let y = 0; y < grid.height; y++) {
        let row = "";

        for (let x = 0; x < grid.width; x++) {
            row += level.char(x, y) ?? (grid.open(x, y) ? "." : "#");
        }

        rows.push(row);
    }

    // (Rooms as they ended up, the stairs dug into some; each with its part in the level)
    const ended = roomsOf(grid, dug.count);
    const roles = new Map(filled.packs.map(({ room, role }) => [room, role]));
    const roleOf = (id) => (id === dug.entryRoom ? "entry" : id === filled.goal ? (plan.index === plan.levels - 1 ? "arena" : "stairs") : (roles.get(id) ?? "quiet"));

    return {
        index: plan.index,
        width: grid.width,
        height: grid.height,
        rows,
        rooms: ended.map(({ id, area, x, y, w, h, centre }) => ({ id, kind: dug.kinds[id], area, x, y, w, h, centre, role: roleOf(id) })),
        links: linksOf(grid),
        path: filled.path,
        loops: dug.loops,
        entry: filled.entry,
        down: filled.down,
        packs: filled.packs,
        chests: filled.chests,
        lights: filled.lights,
        tier: plan.tier,
    };
}

/**
 * How a level stands against what a level has to have (CHECKS): { ok, passed (how many of the
 * checks), checks: { name: true | false } }. Every room joined up; most of the rooms wanted dug;
 * the way through long enough; the room furthest in far enough in; stairs down where there should
 * be; on the bottom level, an arena big enough with its boss and hoard.
 */
export function checkLevel(level, { wanted, bottom, levels = 1 }) {
    const ids = level.rooms.map(({ id }) => id);
    const byRoom = neighbours(level.rooms, level.links);
    const joined = ids.every((id) => roomPath(byRoom, ids[0], id));
    const arena = level.rooms.find(({ role }) => role === "arena");
    const boss = level.packs.find(({ role }) => role === "boss");
    const checks = {
        joined,
        rooms: level.rooms.length >= Math.ceil(wanted * CHECKS.rooms),
        path: level.path.length >= Math.min(CHECKS.path[levels] ?? 3, level.rooms.length),
        stairs: bottom ? true : Boolean(level.down),
        arena: bottom ? Boolean(arena && arena.area >= CHECKS.arena && boss && level.chests.some(({ kind }) => kind === "hoard")) : true,
        far: farEnough(level),
    };
    const passed = Object.values(checks).filter(Boolean).length;

    return { ok: passed === Object.keys(checks).length, passed, checks };
}

// Is the room furthest in (the last on the way through) at least CHECKS.far of the way to the
// furthest square of the level, walking from the way in
function farEnough(level) {
    const goal = level.rooms.find(({ id }) => id === level.path.at(-1));

    if (!goal) {
        return false;
    }

    const steps = walkFrom(level, level.entry.arrive);
    const most = Math.max(...steps.filter((d) => d >= 0));

    return steps[goal.centre[1] * level.width + goal.centre[0]] >= most * CHECKS.far;
}

// Steps (four ways) from a square to every square of a level's plan rows that isn't rock
function walkFrom(level, [x, y]) {
    const { width, height, rows } = level;
    const far = new Int32Array(width * height).fill(-1);
    const queue = [y * width + x];

    far[y * width + x] = 0;

    for (let head = 0; head < queue.length; head++) {
        const k = queue[head];
        const [ax, ay] = [k % width, Math.floor(k / width)];

        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const [nx, ny] = [ax + dx, ay + dy];

            if (nx >= 0 && ny >= 0 && nx < width && ny < height && rows[ny][nx] !== "#" && far[ny * width + nx] < 0) {
                far[ny * width + nx] = far[k] + 1;
                queue.push(ny * width + nx);
            }
        }
    }

    return far;
}
