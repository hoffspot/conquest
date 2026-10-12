// The cross-engine soak (generated/world_server_plan.md §3.3, §15 S0): a world run on Node as the
// world server will run it (no host player: core/host.js RULES; core/runner.js stepping it as time
// goes by, and only while someone's in it; what's round its players made ahead: server/ahead.js),
// opened to others through the relay (server/relay.js), and players joined to it who play by
// themselves (core/bot.js): in Node, each in a process of its own, and in each browser engine
// (Chromium, WebKit and Firefox, under Playwright), each in their own people's town, going for
// the foes of the fights they start; and one more in Node who does nothing at all, to be marked
// away and then sent out for it (core/host.js AFK). For as long as it's told; then how each copy
// of the world kept to the host's (the world sent again, per player-hour: under SOAK.rate, in
// every engine), and whether every copy saw the one doing nothing marked away, and sent out, at
// the same step as the host did.
//
//     npm run soak                                      # 32 minutes: Node and the three browsers
//     npm run soak -- --minutes 10 --browsers none      # a Node joiner alone, 10 minutes
//     npm run soak -- --browsers chromium --minutes 5   # Chromium only, 5 minutes
//     npm run soak -- --seed 7 --json                   # another world; the report as JSON
//
// Writes the report to test-results/soak/report.json. Exits 1 if any copy was sent the world
// again too often, or saw anyone marked away or sent out at another step than the host (or not at
// all), or any page failed.
import { fork } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { joinWorld, openWorld } from "../client/js/app/together.js";
import { STEP_MS } from "../client/js/core/battle.js";
import { Bot } from "../client/js/core/bot.js";
import { AFK, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { StepTimes, WorldRunner } from "../client/js/core/runner.js";
import { Ahead } from "../server/ahead.js";
import { createServer } from "../server/index.js";
import { installWorkers } from "../server/workers.js";

export const SOAK = Object.freeze({
    // The peoples whose towns the players come in by, in turn (Node's first, then each browser's)
    peoples: ["human", "elf", "orc", "cat"],
    // The world sent again per player-hour, at most (less than this, in every engine)
    rate: 1,
    // How often (ms) the host's world is moved on, and each player's; and how often how it's
    // going is told
    tick: 10,
    every: 60000,
    // How long (ms) a player may take to come into the world (the world built, in a browser)
    arrive: 180000,
    // How many of the host's steps over a step's time (STEP_MS) are told of, at most
    slow: 100,
    // The world's rules: as a world server's (everyone rests together; its owners' debug commands
    // theirs, so the players can start fights: they're all owners here)
    rules: { rest: "everyone", debug: "owner" },
});

// (How much longer than AFK's times (ms) the one doing nothing has to have been in the world for
// their being marked away, or sent out, to be looked for)
const LEEWAY = 30000;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "test-results/soak/report.json");

/** A character to bring into the world: as Host.join takes it (core/netplay.js characterFrom). */
export function characterOf(name, race) {
    return { hero: { name, race, weapon: "sword", boots: false, shape: {}, look: {} } };
}

// --- A player in Node: this script, in a process of its own (--join) ---

async function playInNode({ address, code, name, race, seed, idle }) {
    let dropped = false;
    const joined = await joinWorld({ code, character: characterOf(name, race), address, onClosed: () => process.exit(0), onDrop: () => (dropped = true) });
    const bot = new Bot(joined.joining, { idle, seed });
    const kicked = joined.joining.onKicked;
    let last = performance.now();

    joined.joining.onKicked = (reason) => {
        kicked(reason);
        joined.close();
    };

    setInterval(() => {
        const now = performance.now();

        bot.tick(now - last);
        last = now;
    }, SOAK.tick);

    process.on("message", (message) => {
        if (message === "report") {
            process.send({ ...bot.report(), dropped });
        }
    });
    process.send("ready");
}

// --- The soak ---

// The world on Node, opened to others through the relay at `address`: { host, runner, opened,
// saw (what the host saw: { type, id, away, step }), stop() }
async function hostWorld({ seed, address }) {
    installWorkers();

    const world = buildWorld({ seed });
    const host = new Host(world, { populate: false, rules: SOAK.rules });

    host.populate();

    const clock = () => performance.now();
    const runner = new WorldRunner(host, { clock });
    const ahead = new Ahead(world, { host, clock });
    const game = { host, hosting: null, chatHeard() {} };
    const opened = await openWorld(game, { address });
    const saw = [];
    const slow = [];
    let last = clock();

    // (Everyone's an owner: their fights theirs to start)
    opened.hosting.roleOf = () => "owner";
    runner.hosting = opened.hosting;

    const timer = setInterval(() => {
        const now = clock();

        // (Its time stopped while no one's in it: generated/world_server_plan.md §4)
        if (host.players.size) {
            runner.advance(now - last, {
                after: (events) => {
                    const ms = runner.times.recent.at(-1);

                    // (A step over a step's time: when, how many were in the world, what happened)
                    if (ms > STEP_MS && slow.length < SOAK.slow) {
                        slow.push({ ms: Math.round(ms), at: host.battle.time, actors: host.battle.actors.length, events: [...new Set(events.map(({ type }) => type))] });
                    }

                    for (const event of events) {
                        if (event.type === "away" || event.type === "afk") {
                            saw.push({ type: event.type, id: event.id, away: event.type === "afk" || event.away, step: Math.floor(host.battle.time / STEP_MS) });
                        }
                    }
                },
            });
        }

        last = now;
        runner.bakeAhead(ahead);
    }, SOAK.tick);

    return {
        host,
        runner,
        ahead,
        opened,
        saw,
        slow,
        stop() {
            clearInterval(timer);
            opened.close();
            ahead.dispose();
        },
    };
}

// A player in Node, in a process of its own: { name, engine: "node", report(), stop() }
async function nodePlayer({ address, code, name, race, seed, idle }) {
    const child = fork(fileURLToPath(import.meta.url), ["--join", JSON.stringify({ address, code, name, race, seed, idle })], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
    let answer = null;

    child.on("message", (message) => {
        if (message !== "ready") {
            answer?.(message);
            answer = null;
        }
    });

    await new Promise((resolve, reject) => {
        child.once("message", resolve);
        child.once("exit", (exitCode) => reject(new Error(`${name} left (${exitCode})`)));
    });

    let last = null;

    return {
        name,
        engine: "node",
        race,
        idle,
        async report() {
            if (child.exitCode !== null || !child.connected) {
                return last;
            }

            last = await new Promise((resolve) => {
                answer = resolve;
                child.send("report");
                setTimeout(() => resolve(last), 5000);
            });

            return last;
        },
        stop() {
            child.kill();
        },
    };
}

// A player in a browser (`engine`: chromium, webkit or firefox), on a page of the game's server
// with nothing on it but the player: { name, engine, report(), stop() }
async function browserPlayer({ base, code, name, race, seed, engine }) {
    const playwright = await import("@playwright/test");
    const executablePath = engine === "chromium" ? process.env.CHROMIUM_PATH : undefined;
    const browser = await playwright[engine].launch(executablePath ? { executablePath } : {});
    const page = await browser.newPage();
    const errors = [];

    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route(`${base}/soak`, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><title>Soak</title>" }));
    await page.goto(`${base}/soak`);
    await page.evaluate(
        async ({ code, character, seed, tick }) => {
            const [{ joinWorld }, { Bot }] = await Promise.all([import("/js/app/together.js"), import("/js/core/bot.js")]);
            const joined = await joinWorld({ code, character });
            const bot = new Bot(joined.joining, { seed });
            let last = performance.now();

            setInterval(() => {
                const now = performance.now();

                bot.tick(now - last);
                last = now;
            }, tick);

            globalThis.soak = { bot, joined };
        },
        { code, character: characterOf(name, race), seed, tick: SOAK.tick },
    );

    let last = null;

    return {
        name,
        engine,
        race,
        idle: false,
        version: browser.version(),
        errors,
        async report() {
            try {
                last = (await page.evaluate(() => globalThis.soak?.bot.report() ?? null)) ?? last;
            } catch (error) {
                errors.push(String(error));
            }

            return last;
        },
        stop: () => browser.close(),
    };
}

/**
 * Soak a world for `minutes`: resolves to the report ({ seed, minutes, host: { steps (StepTimes
 * toJSON), players, saw }, players: [{ name, engine, race, idle, ...core/bot.js report, hours,
 * rate, errors }], failures: [why] }).
 */
export async function soak({ seed = 2, minutes = 32, nodes = 1, browsers = ["chromium", "webkit", "firefox"], idle = true, log = console.log } = {}) {
    const server = createServer();

    await new Promise((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));

    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    const address = `${base.replace("http", "ws")}/relay`;
    const world = await hostWorld({ seed, address });
    const { code } = world.opened;
    const players = [];
    const failures = [];

    log(`World ${seed} open as ${code} at ${base}`);

    try {
        // (The one who does nothing first: away, then sent out, soonest)
        if (idle) {
            players.push(await nodePlayer({ address, code, name: "Idle", race: SOAK.peoples[0], seed: 99, idle: true }));
        }

        const joining = [
            ...Array.from({ length: nodes }, (_, k) => ({ name: `Node${nodes > 1 ? k + 1 : ""}`, engine: "node" })),
            ...browsers.map((engine) => ({ name: engine[0].toUpperCase() + engine.slice(1), engine })),
        ];

        for (const [k, { name, engine }] of joining.entries()) {
            const race = SOAK.peoples[k % SOAK.peoples.length];

            players.push(engine === "node" ? await nodePlayer({ address, code, name, race, seed: k + 1, idle: false }) : await browserPlayer({ base, code, name, race, seed: k + 1, engine }));
            log(`${name} (${engine}${players.at(-1).version ? ` ${players.at(-1).version}` : ""}) joining as ${/^[aeiou]/.test(race) ? "an" : "a"} ${race}`);
        }

        // (Everyone in, their copy made, and what's round them made ahead, before the soak's
        // clock starts: as a player arriving waits for it, generated/world_server_plan.md §4)
        const arriving = performance.now();

        while (performance.now() - arriving < SOAK.arrive) {
            const reports = await Promise.all(players.map((player) => player.report()));

            if (reports.every((report) => report?.steps > 0) && world.ahead.settled) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        log(`Everyone in, and what's round them made, after ${Math.round((performance.now() - arriving) / 1000)} s; playing ${minutes} minutes`);

        const started = performance.now();

        world.runner.times = new StepTimes();
        world.slow.length = 0;

        while (performance.now() - started < minutes * 60000) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(SOAK.every, minutes * 60000 - (performance.now() - started))));

            const reports = await Promise.all(players.map((player) => player.report()));
            const { mean, p99, worst } = world.runner.times.toJSON();

            log(
                `${Math.round((performance.now() - started) / 60000)} min: steps mean ${mean.toFixed(1)} ms, p99 ${p99.toFixed(1)}, worst ${worst.toFixed(1)}; ${world.host.battle.actors.length} in the world; ` +
                    players.map(({ name }, k) => `${name} ${reports[k] ? `${reports[k].resyncs}r/${reports[k].checks}c${reports[k].kicked ? " out" : ""}` : "?"}`).join(", "),
            );
        }
    } catch (error) {
        failures.push(String(error));
    }

    const reports = await Promise.all(players.map((player) => player.report()));
    const host = { steps: world.runner.times?.toJSON() ?? null, slow: world.slow, players: [...world.host.players.keys()], saw: world.saw, actors: world.host.battle.actors.length };

    for (const player of players) {
        await player.stop();
    }

    world.stop();
    await server.close();

    const rows = players.map((player, k) => {
        const report = reports[k] ?? {};
        const hours = (report.played ?? 0) / 3600000;

        return { name: player.name, engine: player.engine, race: player.race, idle: player.idle, version: player.version, ...report, hours, rate: hours ? (report.resyncs ?? 0) / hours : null, errors: player.errors ?? [] };
    });

    failures.push(...judge({ rows, host }));

    return { seed, minutes, code, host, players: rows, failures };
}

// What went wrong (each a line), if anything
function judge({ rows, host }) {
    const failures = [];

    for (const row of rows) {
        if (!row.steps) {
            failures.push(`${row.name} never played the world`);
        } else if (!row.idle && row.rate >= SOAK.rate) {
            failures.push(`${row.name} was sent the world again ${row.resyncs} times in ${(row.hours * 60).toFixed(0)} minutes (${row.desyncs} found astray): ${row.rate.toFixed(1)} a player-hour`);
        }

        for (const error of row.errors) {
            failures.push(`${row.name}: ${error}`);
        }
    }

    // (The one doing nothing: marked away, and sent out, if they were in the world long enough
    // for it; every copy seeing it at the host's step)
    const idle = rows.find((row) => row.idle);

    if (idle?.me) {
        const expected = [
            ["away", AFK.mark],
            ["afk", AFK.out],
        ].filter(([, after]) => idle.played > after + LEEWAY);

        for (const [type] of expected) {
            const at = host.saw.find((seen) => seen.id === idle.me && seen.type === type && seen.away);

            if (!at) {
                failures.push(`The host never saw ${idle.me} ${type === "afk" ? "sent out" : "marked away"}`);
                continue;
            }

            for (const row of rows.filter((row) => row.steps && row.step >= at.step)) {
                const seen = row.seen?.find((one) => one.id === idle.me && one.type === type && one.away);

                if (seen?.step !== at.step) {
                    failures.push(`${row.name} saw ${idle.me} ${type === "afk" ? "sent out" : "marked away"} at step ${seen?.step ?? "(never)"}, the host at ${at.step}`);
                }
            }
        }

        if (expected.some(([type]) => type === "afk") && idle.kicked?.reason !== "afk") {
            failures.push(`${idle.name} wasn't sent out for being away`);
        }
    }

    // (No one playing marked away)
    for (const seen of host.saw) {
        const row = rows.find((one) => one.me === seen.id);

        if (row && !row.idle && seen.away) {
            failures.push(`${row.name} was marked away at step ${seen.step}`);
        }
    }

    return failures;
}

function print(report) {
    const { host, players, failures } = report;

    if (host.steps) {
        console.log(`Host: ${host.steps.count} steps, mean ${host.steps.mean.toFixed(2)} ms, p99 ${host.steps.p99.toFixed(1)} ms, worst ${host.steps.worst.toFixed(1)} ms; ${host.actors} in the world at the end`);
    }

    if (host.slow.length) {
        const worst = [...host.slow].sort((a, b) => b.ms - a.ms).slice(0, 5);

        console.log(`${host.slow.length}${host.slow.length >= SOAK.slow ? " or more" : ""} steps over ${STEP_MS} ms; the worst: ${worst.map(({ ms, at, actors, events }) => `${ms} ms at ${(at / 60000).toFixed(1)} min (${actors} in the world${events.length ? `; ${events.join(", ")}` : ""})`).join("; ")}`);
    }

    for (const row of players) {
        console.log(
            `${row.name.padEnd(9)} ${`${row.engine}${row.version ? ` ${row.version}` : ""}`.padEnd(20)} ${row.race.padEnd(6)} ${String(row.steps ?? 0).padStart(6)} steps  ${(row.hours * 60).toFixed(1).padStart(5)} min  ` +
                `resyncs ${row.resyncs ?? "?"} (${row.rate === null ? "-" : row.rate.toFixed(2)}/h)  astray ${row.desyncs ?? "?"}  checks ${row.checks ?? "?"}+${row.motionChecks ?? "?"}  ` +
                `fights ${row.fights ?? 0}, foes ${row.engaged ?? 0}${row.kicked ? `, sent out (${row.kicked.reason}) at ${row.kicked.step}` : ""}`,
        );
    }

    console.log(failures.length ? `\n${failures.length} failure${failures.length > 1 ? "s" : ""}:\n${failures.map((line) => `  ${line}`).join("\n")}` : "\nEvery copy kept to the host's.");
}

async function main() {
    const { values } = parseArgs({
        options: {
            join: { type: "string" },
            seed: { type: "string", default: "2" },
            minutes: { type: "string", default: "32" },
            nodes: { type: "string", default: "1" },
            browsers: { type: "string", default: "chromium,webkit,firefox" },
            "no-idle": { type: "boolean", default: false },
            json: { type: "boolean", default: false },
        },
    });

    if (values.join) {
        await playInNode(JSON.parse(values.join));

        return;
    }

    const browsers = values.browsers === "none" ? [] : values.browsers.split(",").filter(Boolean);
    const report = await soak({ seed: Number(values.seed), minutes: Number(values.minutes), nodes: Number(values.nodes), browsers, idle: !values["no-idle"], log: values.json ? () => {} : console.log });

    await mkdir(path.dirname(REPORT), { recursive: true });
    await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`);

    if (values.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        print(report);
    }

    process.exit(report.failures.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
