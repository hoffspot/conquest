// A Battle on an open field with N mixed actors fighting: two teams, melee, archers, casters,
// healers. Reports the step time's mean, p95 and worst.
//
//   node bench.mjs [--n 25,50,100,200] [--runs 3] [--mode lasting|natural|formation] [--seconds 40]
//                  [--battle <path to a battle.js>] [--json]
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
        n: { type: "string", default: "25,50,100,200" },
        runs: { type: "string", default: "3" },
        mode: { type: "string", default: "lasting" },
        seconds: { type: "string", default: "40" },
        battle: { type: "string", default: "/home/user/conquest/client/js/core/battle.js" },
        json: { type: "boolean", default: false },
        size: { type: "string", default: "160" },
        quiet: { type: "boolean", default: false },
    },
});

const { Battle, STEP_MS } = await import(pathToFileURL(process.env.BATTLE ?? values.battle).href);
const { navigatorOf } = await import("/home/user/conquest/client/js/core/navigation.js");

const SIZE = Number(values.size);
const SCHOOL = { a: ["fireball", "burn"], b: ["stoneCrush", "rumble"] };
const MELEE = ["sword", "hammer", "cleaver", "gauntlets", "greatsword", "mace"];

// Of every ten: five up close, three archers, one caster, one healer
function kitOf(team, k) {
    const slot = k % 10;

    if (slot < 5) {
        return { weapon: MELEE[k % MELEE.length], role: "front" };
    }

    if (slot < 8) {
        return { weapon: "bow", role: "archer" };
    }

    if (slot === 8) {
        return { weapon: team === "a" ? "grimoire" : "wand", casts: SCHOOL[team], role: "caster" };
    }

    return { weapon: "staff", heals: ["vigor", "mendWounds"], role: "healer" };
}

export function muster(n, mode, world) {
    const battle = new Battle(world, { seed: 7 });
    const each = Math.floor(n / 2);
    const wide = Math.max(6, Math.ceil(Math.sqrt(each * 2)));
    const middle = SIZE / 2;
    const paths = { count: 0, corners: 0 };

    battle.onPath = (id, way) => {
        paths.count++;
        paths.corners += way.length;
    };

    for (const [team, side] of [["a", -1], ["b", 1]]) {
        if (mode === "formation") {
            battle.formation(`line-${team}`, { anchor: [middle, middle + side * 14], facing: side > 0 ? Math.PI : 0, to: [middle, middle + side * 1.5], speed: 1.1, advance: true });
        }

        for (let k = 0; k < each + (team === "a" ? n - 2 * each : 0); k++) {
            const { role, ...kit } = kitOf(team, k);
            const [column, rank] = [k % wide, Math.floor(k / wide)];
            // (Those up close in front: the ranks are laid out so by sorting on the slot)
            const x = Math.floor(middle - wide + column * 2);
            const y = Math.floor(middle + side * (14 + rank * 2));
            const to = [x, Math.floor(middle - side * 10)];

            battle.add({
                id: `${team}-${k}`,
                kind: "soldier",
                team,
                ...kit,
                square: [x, y],
                ai: "patrol",
                patrol: [mode === "formation" ? [x, y] : to],
                leash: 80,
                armed: k % 2 === 0,
                facing: side > 0 ? Math.PI : 0,
                ...(mode === "lasting" ? { hp: 4000 } : {}),
                ...(mode === "formation" ? { formation: { id: `line-${team}`, slot: [(column - wide / 2) * 1.5, rank * 1.5], role } } : {}),
            });

            // (SHAPES=n: the actors given n shapes between them, as the host's have, by properties
            // of no meaning added in different orders)
            const shapes = Number(process.env.SHAPES ?? 1);
            const actor = battle.actor(`${team}-${k}`);

            for (let bit = 0; bit < 4; bit++) {
                if (((k % shapes) >> bit) & 1) {
                    actor[`extra${bit}`] = null;
                }
            }

            // (DELETED=1: a property taken off each again with `delete`, as core/host.js #clashOver
            // takes `sight` and `keep` off an army's soldiers once its clash is over)
            if (process.env.DELETED) {
                actor.keep = undefined;
                actor.sight = undefined;
                delete actor.sight;
                delete actor.keep;
            }
        }
    }

    return { battle, paths };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

export function run(n, mode, seconds, world) {
    const { battle, paths } = muster(n, mode, world);
    const times = [];
    const counts = { hit: 0, death: 0, attack: 0, cast: 0, healed: 0, projectile: 0, events: 0 };
    let fightingFrom = null;
    const heap0 = process.memoryUsage().heapUsed;
    let alive = n;

    for (let t = 0; t < seconds * 1000; t += STEP_MS) {
        // (NIGHT=1: the light as the host works it out each step by night, a moonless one's, a
        // torch's circle round each soldier with a hand free for one: core/light.js)
        if (process.env.NIGHT) {
            battle.light = { sky: 0.35, lit: battle.actors.filter((actor) => !actor.dead && ["sword", "cleaver", "wand"].includes(actor.weapon)).map(({ x, y }) => [x, y, 81]) };
        }

        const start = performance.now();
        const events = battle.advance(STEP_MS);
        const ms = performance.now() - start;

        for (const event of events) {
            counts.events++;

            if (event.type in counts) {
                counts[event.type]++;
            }

            if (event.type === "hit" && fightingFrom === null) {
                fightingFrom = times.length;
            }
        }

        times.push(ms);
    }

    alive = battle.actors.filter((actor) => !actor.dead).length;

    const fighting = times.slice(fightingFrom ?? 0);
    const sorted = [...fighting].sort((a, b) => a - b);
    const mean = fighting.reduce((sum, ms) => sum + ms, 0) / fighting.length;

    return { times, n, mode, steps: fighting.length, from: fightingFrom, mean, p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), p99: quantile(sorted, 0.99), worst: sorted.at(-1), alive, paths: paths.count, corners: paths.corners, ...counts, heapMB: (process.memoryUsage().heapUsed - heap0) / 2 ** 20 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const world = { blocked: Array.from({ length: SIZE }, () => new Uint8Array(SIZE)) };

    // (The field's navigation mesh baked first: a tile is baked the first time a way's wanted over it)
    const navigation = navigatorOf(world);

    for (let y = 16; y < SIZE; y += 32) {
        for (let x = 16; x < SIZE; x += 32) {
            navigation.path([x, y], [x + 1, y + 1]);
        }
    }

    // (And the code warmed)
    run(50, values.mode, 10, world);

    const results = [];

    for (const n of values.n.split(",").map(Number)) {
        const all = [];

        for (let k = 0; k < Number(values.runs); k++) {
            const result = run(n, values.mode, Number(values.seconds), world);

            all.push(result);
            results.push({ ...result, times: undefined });

            if (!values.json && !values.quiet) {
                console.log(`${values.mode} n=${n} run ${k + 1}: mean ${result.mean.toFixed(3)} ms, p50 ${result.p50.toFixed(3)}, p95 ${result.p95.toFixed(3)}, p99 ${result.p99.toFixed(3)}, worst ${result.worst.toFixed(2)} over ${result.steps} steps (fighting from step ${result.from}); alive ${result.alive}/${n}; paths ${result.paths} (${(result.paths / (result.steps + (result.from ?? 0))).toFixed(2)}/step), hits ${result.hit}, casts ${result.cast}, healed ${result.healed}, projectiles ${result.projectile}, deaths ${result.death}, events ${result.events}`);
            }
        }

        // (The same steps each run: each step's least time over the runs, the machine's noise out)
        const least = all[0].times.map((_, k) => Math.min(...all.map(({ times }) => times[k]))).slice(all[0].from ?? 0);
        const sorted = [...least].sort((a, b) => a - b);
        const mean = least.reduce((sum, ms) => sum + ms, 0) / least.length;

        results.push({ n, mode: values.mode, least: true, mean, p50: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), p99: quantile(sorted, 0.99), worst: sorted.at(-1) });

        if (!values.json) {
            console.log(`${values.mode} n=${n} LEAST of ${all.length} runs, step by step: mean ${mean.toFixed(3)} ms, p50 ${quantile(sorted, 0.5).toFixed(3)}, p95 ${quantile(sorted, 0.95).toFixed(3)}, p99 ${quantile(sorted, 0.99).toFixed(3)}, worst ${sorted.at(-1).toFixed(2)} (at step ${(all[0].from ?? 0) + least.indexOf(sorted.at(-1))})`);
        }
    }

    if (values.json) {
        console.log(JSON.stringify(results));
    }
}
