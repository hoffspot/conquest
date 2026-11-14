// The world authority's load (generated/multiplayer_scaling_plan.md 0-2): a world stepped on Node
// as the world server steps it (core/runner.js, server/ahead.js), opened to others as it opens it
// (core/netplay.js Hosting), with as many players as asked for joined over a link that only counts
// what's sent: they hold no copy of the world, so a hundred of them cost the machine nothing the
// authority wouldn't spend on a hundred real ones. Everything's in this one process and played in
// fixed steps, so the same options play the same world every time (while the navigation has
// room for every tile round the players, below: once it hasn't, which tiles are in when a way's
// looked for goes by when its workers finished, and the ways found, and so what's sent, differ a
// little from run to run).
//
// It says what a step costs and where: each pass of the step by name (core/probe.js), the step's
// mean, 99th percentile and worst, by the clock and in the thread's own processor time (the
// whole of what the authority does for a step: what it heard done, the step, and what it sent);
// what each player is sent, by kind; how big a snapshot of the world is and how long it takes to
// take and to write out; and memory.
//
//     npm run load                                         # 8 players spread, walking, 120 s, seed 2
//     npm run load -- --players 25 --layout towns          # 25, four to a town
//     npm run load -- --players 100 --layout one-town --activity stick
//     npm run load -- --activity fights --seconds 300 --seed 7
//     npm run load -- --json                               # the report as JSON, and nothing else
//     npm run load -- --ceiling 50                         # and fail if the mean step's over 50 ms
//     npm run load -- --players 100 --whole                # the battle's passes timed whole
//     npm run load -- --players 100 --leave half           # every other player gone at once, ten seconds in
//     npm run load -- --players 25 --activity fights,invasion,night   # several activities in the one run
//     npm run load -- --gate                               # Stage 1's gate: six runs, a table, and a verdict
//
// --players: any number (the plan's: 8, 25, 50, 100). --layout: spread (each in a settlement of
// their own, as far from one another as the world allows), towns (four to a town), one-town (all
// in the humans' first). --activity: walk (sent somewhere near every five seconds), stick (a
// stick held: 16 commands a second each), fights (walking, and 6-a-side field battles begun ten
// seconds in, one for every twenty players), battle (one of 200 a side), invasion (the first
// player's town invaded), hellrift (a hell rift torn open by them), night (walking, in the dark:
// the world played with no one in it till nightfall first, DAY.night, so the light to see by and
// the soldiers' torches are in every step), warturn (walking, a turn of the war falling ten seconds
// in and the world saved four steps after it, as a world server saves it: what those two steps
// cost beside the seconds round them; --turns 35 for a war that many turns old, played with no one
// in first; the ground of what the turn brings near is made ahead of it, core/host.js soon's
// `turn`, or with --unforeseen not, as it was), joinstorm (everyone, once the ground's made, out of the world again, and all saying
// hello within a second of one another ten seconds in, to a world that lets them in as a world
// server does: two coming in at once, the rest told their place in the line, and the world taken
// for them no oftener than its share of the thread allows, core/netplay.js WELCOMES, WORLDS; each
// comes back where they were, as a kept hero does, the ground round them made ahead while they
// wait and they let in once it is, server/ahead.js expect, or with --cold not, as it was; each
// is a second making their copy, then walks); and dungeons (four to a door, whatever the layout:
// every other party by a dungeon's way in out in the wilds, the rest in a town by its tavern's
// door; ten seconds in, a party every two seconds, each is stood at its door and goes in by it,
// and inside they go for whatever's near or walk about: what the longest step of each door's
// coming cost, its floors made and its first level woken, and the steps with players inside; a
// dungeon's levels are worked out ahead, their floors made and their navigation baked between
// steps before its party comes, as a world server makes them, server/ahead.js #delve, or with
// --undelved its levels alone, as it was before generated/multiplayer_scaling_plan.md 1-29, or
// with --cold nothing of it, as of a dungeon no one waited near).
//
// Several can be played in the one run, with commas between (generated/
// multiplayer_scaling_plan.md 0-12): the ways of walking, what's begun ten seconds in and the dark
// (LOAD.together: walk, stick, fights, battle, invasion, hellrift, night). Each thing begun has a
// player of its own to begin it: a battle, an invasion or a hell rift the first in a town who
// begins nothing else, the fights' the next after any of theirs who does. The report is as a run
// of one's, its `run.activity` the names with commas between, with what each adds under its own
// name, and `events` for what was begun where a run of one has `event`. The rest are each a run
// of their own (a war's turn waited for, a storm's players out and in again, the dungeons'
// parties). A run of one activity plays as it always did.
//
// --gate plays Stage 1's gate (GATE; generated/multiplayer_scaling_plan.md, Stage 1's goal): 100
// players spread walking, the same with five 6-a-side fights, one invasion and night together,
// and 8 spread walking, each on seeds 2 and 7 for 120 s, each run in a process of its own, one
// after another. Each is set against the gate's numbers (judgeGate): the step's mean and 99th
// percentile by the clock, how many steps over 50 ms came one straight after another
// (`steps.together`), and the pace a world server would have kept with those steps
// (`steps.pace`: keptUp); the 8-spread runs against --baseline's, a gate's report kept from
// before (test-results/load/gate.json, or --out's), no worse than a tenth above it, and with no
// baseline they're only reported. It prints the table the plan's 0-11 and 1-14 commit (gateTable)
// and writes it all to test-results/load/gate.json, each run's whole report beside it in
// test-results/load/gate/. It exits 1 if any line missed its numbers, or a run went wrong in a
// way that's the same on any machine. Its times are one machine's: it judges only where it's
// run, by hand, on the machine the gate names (the owner's Mac), and nothing in CI runs it.
// --seconds, for a look at what it prints, plays each run that long instead: then it says so, and
// no line is called met.
//
// The battle's step is timed by its parts (core/probe.js BATTLE_PASSES): each kind of character's
// turn and walking, and, apart from those, the searches, the ways found and the mesh asked within
// them. With --whole those aren't timed apart, so each kind's turn and walking have all that was
// done for it: what a kind costs, where the other says what kind of work costs. The report's
// `census` says who was in the battle when the run ended, by kind, and how far each was from the
// nearest player.
//
// The report's `late` lists the steps over LOAD.tick by the clock, the first LOAD.late of them
// with their parts: when, how long, the hearing, each pass's time in that step, what each
// counter went up by in it, and the ground the step made for itself (`made`: chunks, navigation
// tiles baked, and `floors`, the tiles of buildings' floors and dungeons' levels baked;
// generated/multiplayer_scaling_plan.md 0-13). And `late.longest`, the longest of them all with
// its parts, wherever in the run it fell (not there, with none late).
//
// --leave half, or all: that many of the players (every other one; everyone) gone from the world
// in the one step, LOAD.eventAt in, the rest playing on (1-27): the report's `leave` says what
// the steps of the five seconds after cost beside those of the five before, the longest of them
// with its parts, and what was let go in them: characters out of the battle, buildings closed,
// chunks of ground and navigation tiles. A join storm reports the same of its own beginning,
// everyone gone before its first step. With --sudden, all of it's let go as it was before 1-27,
// to compare.
//
// --astir, with any run: the folk of a building no player is in, and a barracks' soldiers, go
// about their rounds unseen, as they did before 1-22 (core/battle.js Battle.idling off), to
// compare: the report's `battle.idling` says which was played, and `battle.held` among its
// counts how many were held a step.
//
// --peopled, with any run: a building's folk, a barracks' garrison and a scene's court made as
// the building's got ready, 22 m from its door, and kept till it's let go, 90 m from everyone, as
// they were before 1-23 (core/host.js Host.peopling off), to compare: the report's
// `battle.peopling` says which was played.
//
// Before it's timed, what's round the players is made ahead until nothing's waiting (Ahead.settled),
// however long that takes: a step that makes ground is a loading cost, measured by npm run
// step-budget. Each player out in the world wants some 120 of the navigation's tiles baked round
// them, and the navigation keeps as many as they all want (server/ahead.js) up to the 4,096 its
// mesh takes (core/navigation.js MOST_TILES): 31 players spread. With more, the tiles are baked
// ahead less far round each (`navigation.reach`, metres) and the run says so (`navigation.capped`,
// and a line in what it prints): its steps then include the tiles further out that their ways
// baked, as a world server's would.
//
// Writes the report to test-results/load/report.json (--out for elsewhere). Exits 1 only if the
// run couldn't be made (an option it doesn't know; one that isn't built yet exits 0, saying so);
// or, given --ceiling, if what's the same on any machine went wrong (failuresOf: the report not as
// its schema says, players sent out, a fight that didn't begin) or the mean step, in the thread's
// own processor time, was over that many ms: a catastrophe's ceiling, for the nightly run
// (.github/workflows/scale.yml), not a gate. The gates are timed by hand, on one machine: --gate.

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { gzip } from "node:zlib";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { DELVES } from "../client/js/core/dungeons/play.js";
import { DAY, elapsedOf, timeOfDay, untilTime } from "../client/js/core/daytime.js";
import { nearestFree, squaresOf } from "../client/js/core/grid.js";
import { FIELD_BATTLE, Host, SOON } from "../client/js/core/host.js";
import { torchesLit } from "../client/js/core/light.js";
import { Navigation, navigatorOf } from "../client/js/core/navigation.js";
import { characterFrom, HEARD, Hosting, NET_VERSION } from "../client/js/core/netplay.js";
import { buildWorld, Overworld } from "../client/js/core/overworld.js";
import { BATTLE_KINDS, install, Probes, uninstall } from "../client/js/core/probe.js";
import { RUNNER, WorldRunner } from "../client/js/core/runner.js";
import { TURN_MS } from "../client/js/core/war/war.js";
import { encode } from "../client/js/core/wire.js";
import { RACE, startFor } from "../client/js/core/worldplan/plan.js";
import { Ahead, AHEAD } from "../server/ahead.js";
import { Keeper, KEEPER } from "../server/keeper.js";
import { installWorkers } from "../server/workers.js";

export const LOAD = Object.freeze({
    // The report's format: bumped when a field's renamed or taken out (one added needn't)
    schema: 1,
    // The players, layouts and seeds the plan's tables are made of
    players: [8, 25, 50, 100],
    layouts: ["spread", "towns", "one-town"],
    seeds: [2, 7],
    seconds: 120,
    // What the players do, of what's built; and what isn't yet, with why
    activities: ["walk", "stick", "fights", "battle", "invasion", "hellrift", "night", "warturn", "joinstorm", "dungeons"],
    unbuilt: Object.freeze({}),
    // Those that can be played together in one run (--activity fights,invasion,night): the ways
    // of walking, what's begun `eventAt` in, and the dark. The rest are each a run of their own:
    // a war's turn waited for, a storm's players out and in again, the dungeons' parties
    together: ["walk", "stick", "fights", "battle", "invasion", "hellrift", "night"],
    // (And of those, what's begun `eventAt` in by one of the players, or for the fights by several)
    events: ["fights", "battle", "invasion", "hellrift"],
    // How many to a town (the `towns` layout), and the kinds of place that are towns for it
    party: 4,
    towns: ["capital", "city", "town"],
    // Walking: sent somewhere within `roam` metres of where they came in every `every` ms. A
    // stick held: `stick` commands a second (what a stick turning sends: core/netplay.js HEARD),
    // towards somewhere chosen as a walker's is. And asking how long a word takes, every `ping` ms,
    // as every game does (one that didn't would be stopped for being quiet: netplay.js QUIET).
    // A stick's command reaches `reach` metres ahead, as the game's does (app/steering.js
    // HELD_REACH: with none, a way 400 m on is looked for every time)
    every: 5000,
    roam: 40,
    stick: 16,
    reach: 30,
    ping: 1000,
    // The fights: begun `eventAt` ms in, `fightSize` a side, one for every `fightPer` players (one
    // at the least); whoever began one goes for the nearest foe within `foeNear` metres, looked for
    // every `foeEvery` ms
    eventAt: 10000,
    fightSize: 6,
    fightPer: 20,
    foeNear: 60,
    foeEvery: 1000,
    // A join storm: everyone says hello within `storm` ms, to a world that lets `welcomes` come in
    // at once (a world server's setting, and its default: server/storage/worlds.js), each `loading`
    // ms making their copy of the world before they say they're ready and their place is free. And
    // a step over `tick` ms is one the plan's gate counts ("no tick over 50 ms")
    storm: 1000,
    welcomes: 2,
    loading: 1000,
    tick: 50,
    // (How far from where they were, squares each way, one who comes back may be stood: what the
    // host looks round it for a free one, core/host.js join. And how often a storm's world has
    // what's wanted made ahead between two steps: a world server looks at its world twice a
    // step, server/world-worker.js tick, and makes ahead at each look; how long the line waits
    // is how fast the ground's made, so the storm makes it as fast as a server does)
    back: 8,
    looks: 2,
    // Dungeons and buildings: a party waits `away` metres from its dungeon's way in (further than
    // a dungeon's made from, core/dungeons/play.js DELVES.near, and `clear` more), the parties come
    // to their doors `stagger` ms apart (so the steps till the next comes are that door's: its
    // floors made, its first level woken, its party through), whoever's not through yet asks
    // again every `enterEvery` ms wherever they are (the host takes it from no further off than
    // a door's shown, core/host.js ENTER_REACH), and inside they walk within `within` squares of
    // where they stand
    away: 64,
    clear: 8,
    stagger: 2000,
    enterEvery: 2000,
    within: 8,
    // A turn of the war (warturn): the steps of this long before it and after its save (ms) are
    // what its two steps are read beside
    round: 1000,
    // The warm-up: after everything round the players is made, this many steps played untimed
    // (the towns' soldiers and folk put out, their buildings opened), and what those want made
    // too. And how long (ms of the clock) it goes on with nothing new made before it's given up
    // as never going to settle
    settle: 100,
    stall: 30000,
    // How many times a snapshot's taken and written out, for the middle one's time
    snapshots: 5,
    // How many of the steps over `tick` are kept with their parts (the report's `late`)
    late: 32,
    // Who may leave together, `eventAt` in (--leave: every other player, or everyone), and how
    // long after (ms) the steps are theirs: read beside the steps of as long before
    leaves: ["none", "half", "all"],
    leaving: 5000,
});

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "test-results/load/report.json");

// The processor time this thread has had (ms: user and system); the whole process's, where a
// Node hasn't the thread's
const cpuNow = () => {
    const { user, system } = process.threadCpuUsage?.() ?? process.cpuUsage();

    return (user + system) / 1000;
};

const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const MB = 2 ** 20;

// The mean, the middle, the 99th percentile and the worst of some times (ms), and which was the worst
function spreadOf(times) {
    const sorted = Float64Array.from(times).sort();
    const at = (share) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] : 0);
    let total = 0;
    let worstAt = -1;

    times.forEach((ms, k) => {
        total += ms;
        worstAt = worstAt < 0 || ms > times[worstAt] ? k : worstAt;
    });

    return { mean: round(times.length ? total / times.length : 0), p50: round(at(0.5)), p99: round(at(0.99)), worst: round(at(1)), worstAt };
}

// Places as far from one another as can be, `count` of them, the first given: each next the one
// furthest from all those chosen (the same every time: ties go to the first in the list)
function farApart(places, count, first) {
    const chosen = [first];
    const nearest = places.map(({ at }) => Math.hypot(at[0] - first.at[0], at[1] - first.at[1]));

    while (chosen.length < count) {
        let best = -1;

        for (let k = 0; k < places.length; k++) {
            if (nearest[k] > 0 && (best < 0 || nearest[k] > nearest[best])) {
                best = k;
            }
        }

        if (best < 0) {
            break;
        }

        const { at } = places[best];

        chosen.push(places[best]);
        places.forEach((place, k) => (nearest[k] = Math.min(nearest[k], Math.hypot(place.at[0] - at[0], place.at[1] - at[1]))));
    }

    return chosen;
}

/**
 * Where `players` players are put in a world (its plan), by layout: [{ race, place (its id), at
 * ([x, y] metres) }], each of the people whose settlement they're in (so its guards are theirs).
 * `spread`: each in a settlement of their own, as far apart as the world's allow. `towns`:
 * LOAD.party to a town, the towns as far apart. `one-town`: all in the humans' first. Throws if the
 * world hasn't the settlements for it.
 */
export function layoutOf(plan, players, layout) {
    const home = startFor(plan, "human");
    const peopled = plan.places.filter(({ race }) => RACE[race]);
    const first = peopled.find(({ id }) => id === home.id) ?? home;
    const within = (place, k) => [Math.round(place.at[0]) + (k % 2) * 2, Math.round(place.at[1]) + (k >> 1) * 2];
    let homes;

    if (layout === "spread") {
        homes = farApart(peopled, players, first).map((place) => [place, 0]);
    } else if (layout === "towns") {
        const towns = farApart(peopled.filter(({ kind, id }) => LOAD.towns.includes(kind) || id === first.id), Math.ceil(players / LOAD.party), first);

        homes = Array.from({ length: Math.min(players, towns.length * LOAD.party) }, (_, k) => [towns[Math.floor(k / LOAD.party)], k % LOAD.party]);
    } else if (layout === "one-town") {
        homes = Array.from({ length: players }, (_, k) => [first, k % 16]);
    } else {
        throw new Error(`No layout called ${layout}: ${LOAD.layouts.join(", ")}`);
    }

    if (homes.length < players) {
        throw new Error(`The world has settlements for ${homes.length} players in the ${layout} layout, not ${players}`);
    }

    return homes.map(([place, k]) => ({ race: place.race, place: place.id, at: within(place, k) }));
}

/**
 * Where `players` players wait to go in by doors (the `dungeons` activity), LOAD.party to a door,
 * in a world (its plan, and its overworld for where a dungeon's way in is): [{ race, place, at,
 * party, door }], as layoutOf's, with which party each is of and its door: every other party's a
 * dungeon's ({ kind: "dungeon", site (its id), outside (the square before its way in) }), the
 * dungeons as far from one another as the world's allow and the first the nearest to the humans'
 * first town, the party waiting LOAD.away metres off, further than it's made from; the rest a
 * building's ({ kind: "building", town (its id) }: which, once the town's made), in towns as far
 * apart, the party at the town's middle. Throws if the world hasn't the doors for it.
 */
export function doorsOf(world, players) {
    const { plan } = world;
    const overworld = world.maps.town;
    const parties = Math.ceil(players / LOAD.party);
    const home = startFor(plan, "human");
    const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const delves = plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme !== "hell");
    const nearest = delves.reduce((best, site) => (!best || far(site.at, home.at) < far(best.at, home.at) ? site : best), null);
    const peopled = plan.places.filter(({ race, kind, id }) => RACE[race] && (LOAD.towns.includes(kind) || id === home.id));
    const towns = farApart(peopled, Math.max(1, Math.floor(parties / 2)), peopled.find(({ id }) => id === home.id) ?? home).slice(0, Math.floor(parties / 2));
    const doors = [];

    // (Each dungeon in turn, the furthest from those gone through first: one that can be gone
    // into, with somewhere to wait LOAD.away from its way in that's clear of where it's made from)
    for (const site of nearest ? farApart(delves, delves.length, nearest) : []) {
        if (doors.length >= Math.ceil(parties / 2)) {
            break;
        }

        overworld.sites.heartOf(site);

        const outside = overworld.sites.set.get(site.id)?.entrance?.outside;

        for (let k = 0; outside && k < 8; k++) {
            // (Eight ways off, the first straight on from the dungeon's middle through its way in)
            const [dx, dy] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][(k + (outside[0] < site.at[0] ? 4 : 0)) % 8];
            let at;

            try {
                at = nearestFree(squaresOf(overworld), [outside[0] + dx * LOAD.away, outside[1] + dy * LOAD.away], { within: 12 });
            } catch {
                continue;
            }

            if (Math.min(far(at, site.at), far(at, outside)) > DELVES.near + LOAD.clear + 4) {
                doors.push({ race: "human", place: site.id, at, door: { kind: "dungeon", site: site.id, outside: [...outside] } });
                break;
            }
        }
    }

    if (doors.length < Math.ceil(parties / 2) || towns.length < Math.floor(parties / 2)) {
        throw new Error(`The world has ${doors.length} dungeons and ${towns.length} towns to go into, not the ${parties} doors ${players} players take`);
    }

    // (Every other party a dungeon's, the rest a town's: the first a dungeon's)
    return Array.from({ length: players }, (_, k) => {
        const party = Math.floor(k / LOAD.party);
        const [n, town] = [k % LOAD.party, towns[party >> 1]];
        const one = party % 2 === 0 ? doors[party >> 1] : { race: town.race, place: town.id, at: [Math.round(town.at[0]), Math.round(town.at[1])], door: { kind: "building", town: town.id } };

        return { race: one.race, place: one.place, at: [one.at[0] + (n % 2) * 2, one.at[1] + (n >> 1) * 2], party, door: one.door };
    });
}

/**
 * How many of the navigation's tiles players at `places` ([[x, y]], out in the world) want baked
 * round them (server/ahead.js AHEAD.reach each way, as world/navbaker.js around asks for them),
 * beside how many it can keep: { tile (m), keep, wanted, capped (more wanted, with `spare` more
 * for the steps' own, than can be kept) }.
 */
export function tilesWanted(places, { tile, keep, spare = 0, reach = AHEAD.reach }) {
    const wanted = new Set();

    for (const [x, y] of places) {
        for (let ty = Math.floor((y - reach) / tile); ty <= Math.floor((y + reach) / tile); ty++) {
            for (let tx = Math.floor((x - reach) / tile); tx <= Math.floor((x + reach) / tile); tx++) {
                wanted.add(ty * 65536 + tx);
            }
        }
    }

    return { tile, keep, wanted: wanted.size, capped: wanted.size + spare > keep };
}

/**
 * Who's in a battle, by kind (the players; then as the battle's step is timed, core/probe.js
 * BATTLE_KINDS: `routine` the folk, `patrol` soldiers and guards, `wild` the wild's creatures,
 * `follow` followers, `other` the rest), each kind's: `all`; how many are `fallen`, `walking` (a
 * way to go), `set` on someone, `seated` (the folk who sit); `indoors` (on another map than the
 * world's), and of those `alone` (no player standing on their map); and, out in the world, how
 * many are within 30 m of the nearest player standing there (`m30`), 60 (`m60`), 120 (`m120`), 250
 * (`m250`) or `beyond`.
 */
export function censusOf(battle) {
    const players = battle.actors.filter((actor) => actor.kind === "player" && !actor.dead);
    const census = Object.fromEntries(["player", ...BATTLE_KINDS].map((kind) => [kind, { all: 0, fallen: 0, walking: 0, set: 0, seated: 0, indoors: 0, alone: 0, m30: 0, m60: 0, m120: 0, m250: 0, beyond: 0 }]));

    for (const actor of battle.actors) {
        const tally = census[actor.kind === "player" ? "player" : BATTLE_KINDS.includes(actor.ai) ? actor.ai : "other"];
        const near = players.reduce((least, player) => (player === actor || player.map !== actor.map ? least : Math.min(least, Math.hypot(player.x - actor.x, player.y - actor.y))), Infinity);

        tally.all++;
        tally.fallen += actor.dead ? 1 : 0;
        tally.walking += !actor.dead && actor.path.length ? 1 : 0;
        tally.set += !actor.dead && actor.target !== null ? 1 : 0;
        tally.seated += actor.routine?.seated ? 1 : 0;

        if (actor.map !== "town") {
            tally.indoors++;
            tally.alone += near === Infinity ? 1 : 0;
        } else {
            tally[near <= 30 ? "m30" : near <= 60 ? "m60" : near <= 120 ? "m120" : near <= 250 ? "m250" : "beyond"]++;
        }
    }

    return census;
}

// One who's joined over a link that only counts: what they're sent (bytes, messages, their
// busiest second) and what they send; where they came in, and what they're doing
class Peer {
    constructor(k, home) {
        this.peer = `peer-${k + 1}`;
        this.k = k;
        this.home = home;
        this.id = null;
        this.bytes = 0;
        this.messages = 0;
        this.second = 0;
        this.worstSecond = 0;
        this.seq = 0;
        this.random = (k + 1) * 2654435761 >>> 0 || 1;
        this.to = null;
        this.owed = 0;
        this.fights = false;
    }

    // A number from -1 to 1, the next of their own
    roll() {
        this.random = (Math.imul(this.random, 1103515245) + 12345) >>> 0;

        return (this.random / 2 ** 32 - 0.5) * 2;
    }

    command(command) {
        return encode({ kind: "command", seq: ++this.seq, command });
    }

    somewhere() {
        return [Math.round(this.home.at[0] + this.roll() * LOAD.roam), Math.round(this.home.at[1] + this.roll() * LOAD.roam)];
    }
}

/**
 * The activities a run plays, from what was asked for (LOAD.activities: one, or several with
 * commas between, "fights,invasion,night"), in the order LOAD.activities has them, each once.
 * Walking is what the players do in every run but one with sticks held, so asked for beside
 * others it adds nothing and isn't named. Throws for one there isn't, or for several that can't
 * be played together (LOAD.together).
 */
export function activitiesOf(activity) {
    const asked = String(activity)
        .split(",")
        .map((one) => one.trim())
        .filter(Boolean);
    const known = [...LOAD.activities, ...Object.keys(LOAD.unbuilt)];
    const unknown = asked.find((one) => !known.includes(one));

    if (unknown !== undefined || !asked.length) {
        throw new Error(`No activity called ${unknown ?? activity}: ${known.join(", ")}`);
    }

    const several = LOAD.activities.filter((one) => asked.includes(one));
    const played = several.length > 1 ? several.filter((one) => one !== "walk") : several;
    const alone = played.length > 1 ? played.find((one) => !LOAD.together.includes(one)) : undefined;

    if (alone !== undefined) {
        throw new Error(`${alone} is a run of its own: those that can be played together are ${LOAD.together.join(", ")}`);
    }

    return played;
}

/**
 * How a run's steps would have been kept up with, from each step's time by the clock (`wall`,
 * ms) and the look between it and the next (`looks`: what's made ahead, ms; none, nothing):
 * `together`, the most steps over a step's time (`over`) one straight after another; and `pace`,
 * the share of the clock's time a world server would have played, with `dropped` (ms) what it
 * would have let go: it plays a step each `step` ms, is behind by whatever a step and its look
 * took beyond that, catches up as later ones take less, and lets go of what it's behind by
 * beyond `behind` ms (core/runner.js RUNNER.behind, letGo), so its world's time runs that much
 * slow. 1, unless it fell that far behind.
 */
export function keptUp(wall, looks = null, { over = LOAD.tick, step = STEP_MS, behind = RUNNER.behind } = {}) {
    let [together, run, late, dropped] = [0, 0, 0, 0];

    for (let k = 0; k < wall.length; k++) {
        run = wall[k] > over ? run + 1 : 0;
        together = Math.max(together, run);
        late = Math.max(0, late + wall[k] + (looks?.[k] ?? 0) - step);

        if (late > behind) {
            dropped += late - behind;
            late = behind;
        }
    }

    return { together, pace: wall.length ? round(1 - dropped / (wall.length * step), 4) : 1, dropped: round(dropped) };
}

// The kind of a message, read off its front without reading the rest ({"kind":"ops",...)
const kindOf = (text) => (text.startsWith('{"kind":"') ? text.slice(9, text.indexOf('"', 9)) : "?");

/**
 * Play a world under load: resolves to the report (checkReport says what's in it). `log` is told
 * how it's going, a line at a time. An activity that isn't built yet resolves to a report that
 * only says so ({ schema, run, built: false, reason }). `lateOver` (ms) is how long a step is
 * late from (LOAD.tick: only a test, which can't make a step slow, asks for another).
 */
export async function load({ seed = 2, players: count = 8, layout = "spread", activity: asked = "walk", seconds = LOAD.seconds, eventAt = LOAD.eventAt, turns = 0, burst = LOAD.storm, whole = false, cold = false, unforeseen = false, undelved = false, leave = "none", sudden = false, astir = false, peopled = false, lateOver = LOAD.tick, log = () => {} } = {}) {
    // (What's played: one activity, or several together, named with commas between as they were asked for)
    const unbuilt = String(asked)
        .split(",")
        .map((one) => one.trim())
        .find((one) => Object.hasOwn(LOAD.unbuilt, one));

    if (unbuilt !== undefined) {
        return { schema: LOAD.schema, run: { seed, players: count, layout, activity: asked, seconds, whole, leave, sudden, node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length }, built: false, reason: LOAD.unbuilt[unbuilt] };
    }

    const playing = activitiesOf(asked);
    const does = (one) => playing.includes(one);
    const activity = playing.join(",");
    const run = { seed, players: count, layout, activity, seconds, whole, leave, sudden, node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length };

    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(seconds) || seconds <= 0) {
        throw new Error("--players takes a whole number of players, --seconds how long to play");
    }

    if (!LOAD.leaves.includes(leave) || (leave !== "none" && (does("joinstorm") || does("dungeons")))) {
        throw new Error(`--leave takes ${LOAD.leaves.join(", ")}; a join storm has everyone gone before it begins, and the dungeons' parties stay`);
    }

    if (!Number.isInteger(turns) || turns < 0 || !Number.isInteger(eventAt / STEP_MS) || eventAt < 0 || !Number.isInteger(burst / STEP_MS) || burst < 0) {
        throw new Error("--turns takes how many turns of the war to play with no one in first");
    }

    installWorkers();

    // (--sudden: what's no longer wanted let go as it was, to compare: the ground and the
    // navigation's tiles all at once, server/ahead.js, and each one taken out of the battle
    // forgotten by going through everyone, core/battle.js)
    const [wasEasing, wasForgetting] = [Ahead.easing, Battle.forgetting];

    Ahead.easing = !sudden;
    Battle.forgetting = !sudden;

    // (--astir: the folk of a building no player's in, and a barracks' soldiers, about their
    // rounds unseen, as they were before 1-22, to compare: core/battle.js)
    const wasIdling = Battle.idling;

    Battle.idling = !astir;

    // (--peopled: a building's people made as it's got ready and kept till it's let go, as they
    // were before 1-23, to compare: core/host.js)
    const wasPeopling = Host.peopling;

    Host.peopling = !peopled;

    // (--unforeseen: nothing made ahead for what the war's next turn will bring near, and each
    // chunk read moved among those kept there and then, as both were before 1-28, to compare)
    const [wasTurns, wasRecently] = [Ahead.turns, Overworld.recently];

    Ahead.turns = !unforeseen;
    Overworld.recently = !unforeseen;

    // (--undelved: a dungeon's floors made in the step it's made in and their navigation baked
    // in the steps its foes first find their ways in, as both were before 1-29, to compare;
    // --cold, of dungeons: and its levels not worked out ahead either, below)
    const wasDelving = Ahead.delving;

    Ahead.delving = !undelved && !(cold && does("dungeons"));

    const delvedAhead = Ahead.delving;

    const clock = () => performance.now();
    const began = clock();
    const world = buildWorld({ seed });
    const homes = does("dungeons") ? doorsOf(world, count) : layoutOf(world.plan, count, layout);
    const overworld = world.maps.town;
    const navigation = navigatorOf(overworld);
    // (As a world server's: everyone rests together, and its owners' debug commands are theirs,
    // so the fights are the players' to begin: they're all owners here)
    const host = new Host(world, { populate: false, rules: { rest: "everyone", debug: "owner" } });
    const problems = [];

    host.populate();

    // --- Night, or a war some turns old: the world played with no one in it first, as its own rules play it ---

    // (The time of day is the war's clock, core/daytime.js, and nothing sets it or turns the war
    // but the world's steps: so they're played, the war's turns with them, before anyone's in and
    // before anything's timed. An empty world's step is some 0.05 ms)
    const night = does("night") ? { waited: untilTime(elapsedOf(host.war), DAY.night), turn: 0, from: 0, to: 0, dark: false } : null;
    const played = night ? night.waited : turns * TURN_MS;

    for (let ms = 0; ms < played; ms += STEP_MS) {
        host.advance(STEP_MS);
    }

    if (played) {
        log(`Played ${night ? "to nightfall " : ""}with no one in: ${played / 60000} minutes of the world's time, ${host.war.turn} turns of its war, ${((clock() - began) / 1000).toFixed(1)} s`);
    }

    // The world's own time (ms), which is the clock Hosting holds the players to (HEARD: 30
    // commands a second each, 60 at once), so the limits bind as they would on a server whatever
    // this machine's speed
    let time = 0;
    // (joinstorm: and, within a step, how long the step's been at it by the machine's clock, with
    // whatever the steps before ran over by: how long taking the world took is what holds back
    // the next taking, WORLDS, so there the clock must move while it's taken, as a server's does)
    const within = { since: null, over: 0 };
    const outbox = [];
    const hosting = new Hosting(host, { send: (peer, text) => outbox.push(peer, text), clock: does("joinstorm") ? () => time + within.over + (within.since === null ? 0 : clock() - within.since) : () => time });
    const runner = new WorldRunner(host, { hosting });
    const peers = homes.map((home, k) => new Peer(k, home));
    const byPeer = new Map(peers.map((peer) => [peer.peer, peer]));
    const kinds = new Map();
    const up = { messages: 0, bytes: 0 };

    hosting.most = count;
    hosting.roleOf = () => "owner";

    // (warturn: the world kept as a world server keeps it, server/keeper.js: written out four steps
    // after each turn of its war, in the step, and gzipped off it; to nowhere, which costs the
    // thread nothing a disk would. And each turn and each writing noted as it comes)
    const zipped = promisify(gzip);
    const kept = { turned: null, wrote: null, saves: [] };
    const keeper = does("warturn")
        ? new Keeper(runner, {
                  meta: { played: 0 },
                  journal: async () => {},
                  saveText: async (text) => {
                      const before = clock();
                      const packed = await zipped(Buffer.from(text, "utf8"));

                      kept.saves.push({ bytes: Buffer.byteLength(text), zipped: packed.length, ms: clock() - before });
                  },
              })
            : null;

    if (keeper) {
        const [onTurn, snapshotText] = [runner.onTurn, host.snapshotText.bind(host)];

        runner.onTurn = (war) => {
            kept.turned = war.turn;
            onTurn(war);
        };
        host.snapshotText = (...given) => {
            const before = clock();
            const text = snapshotText(...given);

            kept.wrote = clock() - before;

            return text;
        };
    }

    // What's been sent counted, by who it was to and its kind (after the step that sent it's been
    // timed: counting bytes is this script's work, not the authority's)
    const counted = () => {
        for (let k = 0; k < outbox.length; k += 2) {
            const peer = byPeer.get(outbox[k]);
            const bytes = Buffer.byteLength(outbox[k + 1]);
            const kind = kindOf(outbox[k + 1]);
            const sum = kinds.get(kind) ?? kinds.set(kind, { messages: 0, bytes: 0 }).get(kind);

            sum.messages++;
            sum.bytes += bytes;

            if (peer) {
                peer.bytes += bytes;
                peer.messages++;
                peer.second += bytes;
            }
        }

        outbox.length = 0;
    };

    const hear = (peer, text) => {
        up.messages++;
        up.bytes += Buffer.byteLength(text);
        hosting.hear(peer.peer, text);
    };

    // --- Everyone in: each welcomed with the world as it is, then put where the layout has them ---

    const welcomes = { ms: [], bytes: [] };
    const hello = (peer) => encode({ kind: "hello", version: NET_VERSION, character: { hero: { name: `Load${peer.k + 1}`, race: peer.home.race, weapon: "sword", boots: false, shape: {}, look: {} } } });
    // (One who's in stood where the layout has them: whether they could be)
    const stand = (peer) => Boolean(host.battle.place(peer.id, "town", peer.home.at) ?? host.battle.place(peer.id, "town", nearestFree(squaresOf(overworld), peer.home.at, { within: 40 })));

    for (const peer of peers) {
        const before = clock();

        hear(peer, hello(peer));
        welcomes.ms.push(clock() - before);
        peer.id = hosting.players.get(peer.peer) ?? null;

        for (let k = 0; k < outbox.length; k += 2) {
            if (outbox[k] === peer.peer && kindOf(outbox[k + 1]) === "welcome") {
                welcomes.bytes.push(Buffer.byteLength(outbox[k + 1]));
            }
        }

        counted();

        if (!peer.id) {
            throw new Error(`${peer.peer} wasn't let into the world`);
        }

        if (!stand(peer)) {
            problems.push(`${peer.peer} couldn't be stood in ${peer.home.place}: left where they came in`);
        }
    }

    const joined = { players: hosting.players.size, ms: Math.round(welcomes.ms.reduce((sum, ms) => sum + ms, 0)), welcome: { bytes: spreadOf(welcomes.bytes), ms: spreadOf(welcomes.ms) } };
    const standing = () => peers.map((peer) => host.battle.actor(peer.id)).filter((actor) => actor?.map === "town");
    const tiles = tilesWanted(standing().map(({ x, y }) => [x, y]), { tile: navigation.measures.tile, keep: navigation.most, spare: AHEAD.spareTiles });

    log(`${count} players in (${layout}), ${joined.ms} ms; each welcomed with ${Math.round(joined.welcome.bytes.mean / 1024)} KB`);

    // (The tiles the navigation lets go of to keep within what it keeps, counted)
    let dropped = 0;
    const drop = navigation.drop.bind(navigation);

    navigation.drop = (...tile) => {
        dropped++;

        return drop(...tile);
    };

    if (tiles.capped) {
        problems.push(
            `the navigation takes ${tiles.keep} tiles at most (core/navigation.js MOST_TILES) and these ${count} players want ${tiles.wanted} baked round them: they're baked ahead less far round each, and the steps timed include the tiles further out that their ways baked`,
        );
        log(`The navigation's tile cap: ${tiles.wanted} tiles wanted round the players, ${tiles.keep} at most. They're baked ahead less far round each, and this run's steps include those further out.`);
    }

    // --- The warm-up: the world's opening step, then all that's round the players made ahead ---

    const ahead = new Ahead(world, { host, clock });
    const warmed = clock();

    // (--cold, of dungeons: no dungeon's levels asked of the layouts' worker, world/layouts.js
    // delve, so each is worked out in the step that makes it: a dungeon no one waited near)
    if (cold && does("dungeons") && ahead.layouts) {
        ahead.layouts.interiors = null;
    }
    let settled;

    // What's round the players made between steps until nothing's waiting (true), or until
    // nothing new has been made for LOAD.stall, or, the navigation over its cap, until the chunks
    // are all made and it's as full as it gets (false)
    const makeAhead = async () => {
        let progress = clock();
        let had = -1;

        for (;;) {
            runner.bakeAhead(ahead);

            // (And a dungeon's levels still with the layouts' worker are waited for however long
            // they take, where the maker's own patience, AHEAD.delve, goes by the clock: or on
            // a busy machine a run would begin with a dungeon's floors not made)
            if (ahead.settled && !(Ahead.delving && ahead.layouts?.delving.size)) {
                return true;
            }

            const has = ahead.made + ahead.rooms + ahead.delved.levels + ahead.delved.tiles + navigation.tiles.size + dropped;

            if (has !== had) {
                had = has;
                progress = clock();
            }

            if (clock() - progress > LOAD.stall || (tiles.capped && !ahead.chunks.length && navigation.tiles.size >= navigation.keep - AHEAD.tiles && dropped > tiles.wanted)) {
                return false;
            }

            await new Promise((resolve) => setTimeout(resolve, 1));
        }
    };

    runner.advance(STEP_MS);
    time += STEP_MS;
    counted();
    settled = await makeAhead();

    for (let k = 0; k < LOAD.settle; k++) {
        for (const peer of peers) {
            if (k % (LOAD.ping / STEP_MS) === peer.k % (LOAD.ping / STEP_MS)) {
                hear(peer, encode({ kind: "ping", t: time }));
            }
        }

        runner.advance(STEP_MS);
        time += STEP_MS;
        counted();
        runner.bakeAhead(ahead);
        await new Promise((resolve) => setImmediate(resolve));
    }

    settled = (await makeAhead()) && settled;

    if (!settled && !tiles.capped) {
        problems.push(`the warm-up gave up with ground still waiting after ${LOAD.stall / 1000} s with nothing new made: the steps timed may make ground`);
    }

    // (warturn: played on, untimed, till the war's next turn is `eventAt` into the run: a turn
    // can't be called for, only waited for, a minute at the most)
    if (keeper) {
        const wait = (((TURN_MS - STEP_MS - eventAt - host.war.clock) % TURN_MS) + TURN_MS) % TURN_MS;

        for (let k = 0; k < wait / STEP_MS; k++) {
            for (const peer of peers) {
                if (k % (LOAD.ping / STEP_MS) === peer.k % (LOAD.ping / STEP_MS)) {
                    hear(peer, encode({ kind: "ping", t: time }));
                }
            }

            runner.advance(STEP_MS);
            time += STEP_MS;
            counted();
            runner.bakeAhead(ahead);
            await new Promise((resolve) => setImmediate(resolve));
        }

        await keeper.settled();
        settled = (await makeAhead()) && settled;
        Object.assign(kept, { turned: null, wrote: null, saves: [] });
    }

    const warm = { ms: Math.round(clock() - warmed), settled, chunks: ahead.made, rooms: ahead.rooms, tiles: navigation.tiles.size };

    log(`Warmed up in ${(warm.ms / 1000).toFixed(1)} s (${warm.chunks} chunks, ${warm.tiles} navigation tiles, ${warm.rooms} insides' tiles)${settled ? "" : ", not settled"}`);

    // --- A join storm: everyone out again, and the world's doors as a world server's ---

    // (The ground they'll come back to is made; they come back as new guests, are stood where
    // they were, and count their commands from the first again)
    const storm =
        does("joinstorm")
            ? { at: eventAt, over: burst, welcomes: LOAD.welcomes, loading: LOAD.loading, asked: 0, welcomed: 0, waiting: 0, queued: 0, snapshots: 0, done: -1, lastWaited: 0, waits: null, steps: null, admit: null, longest: null, ground: null, first: eventAt / STEP_MS, last: -1, waited: [], admitting: 0, admits: [], worst: null, letting: 0, stepping: false, made: { steps: { chunks: 0, tiles: 0 }, ahead: { chunks: 0, tiles: 0 } } }
            : null;
    const wasComing = Ahead.coming;
    // (Players gone together, 1-27: a storm's all, before its first step; or, --leave, every other
    // one or all, `eventAt` in. The steps of LOAD.leaving after are theirs, a storm's only till
    // its first hello: what they cost, the longest with its parts, and what was let go in them)
    const going =
        storm || leave !== "none"
            ? { who: storm ? "all" : leave, step: storm ? 0 : eventAt / STEP_MS, steps: Math.min(LOAD.leaving, storm ? eventAt : Infinity) / STEP_MS, left: 0, going: 0, before: null, longest: null, look: { worst: 0, worstAt: -1 }, let: { characters: 0, forgets: 0, buildings: 0, chunks: 0, tiles: 0 } }
            : null;
    const leaves = (peer) => going && (going.who === "all" || peer.k % 2 === 1);
    const stood = () => ({ actors: host.battle.actors.length, open: host.open.size });

    if (storm) {
        going.before = stood();

        for (const peer of peers) {
            hosting.gone(peer.peer);
            Object.assign(peer, { id: null, seq: 0, state: "out", askedAt: 0, welcomedAt: 0 });
            going.left++;
        }

        counted();
        hosting.sparing = true;
        hosting.welcomes = storm.welcomes;

        // (Each comes back as a hero the world's kept comes back: where they were, which the
        // world knows before they're in. So what's round them is made ahead while they wait
        // their turn, and they're let in once it is, as a world server lets them: server/
        // world-worker.js; or, `cold`, nothing's made for them till they're in and no one waits
        // for it, as it was before generated/multiplayer_scaling_plan.md 1-26, to compare)
        hosting.characterOf = (peer, character) => {
            const brought = characterFrom(character);
            const [x, y] = byPeer.get(peer).home.at;

            return brought && { ...brought, place: { x: x + 0.5, y: y + 0.5, facing: 0 } };
        };
        hosting.ground = ([x, y]) => ahead.grounded(x, y);
        Ahead.coming = !cold;

        // (What the steps make for themselves from here on, where a step's the hearing and the
        // step both: the ground's chunks. The navigation's tiles baked in them are counted by
        // the mesh, `baked`, and those baked ahead by what's added besides)
        const groundChunk = overworld.ground.chunk.bind(overworld.ground);

        overworld.ground.chunk = (cx, cy) => {
            if (storm.stepping && !overworld.ground.peek(cx, cy)) {
                storm.made.steps.chunks++;
            }

            return groundChunk(cx, cy);
        };

        // (The letting in timed by itself, a step at a time: bringing each into the world, taking
        // it, writing it and sending it them, Session.admit. No pass of the step has its name:
        // bringing one in sends what's been done first, which ends the pass being timed)
        const { session } = hosting;
        const admit = session.admit.bind(session);

        session.admit = () => {
            const before = clock();

            admit();
            storm.admitting += clock() - before;
        };
    }

    // --- Dungeons and buildings: each party's door, and when they come to it ---

    // (A building's is found now its town's made: a tavern's, one not gone into yet if there is
    // one, else whatever of the town's has a door off the street)
    const delving =
        does("dungeons")
            ? [...new Set(homes.map(({ party }) => party))].map((party) => {
                  const members = peers.filter((peer) => peer.home.party === party);
                  const { door } = members[0].home;
                  const street = (building) => building.door?.ends.find(({ map }) => map === "town");
                  const theirs = door.kind === "building" ? [...world.interiors.buildings.values()].filter((building) => (building.place === door.town || (building.place === "home" && door.town === world.start?.id)) && street(building)) : [];
                  const building = theirs.find(({ kind, made }) => kind === "tavern" && !made) ?? theirs.find(({ kind }) => kind === "tavern") ?? theirs[0] ?? null;

                  return {
                      ...door,
                      party,
                      members,
                      key: door.kind === "dungeon" ? `site:${door.site}` : (building?.key ?? null),
                      to: door.kind === "dungeon" ? door.outside : (building ? street(building).arrive : null),
                      at: eventAt + party * LOAD.stagger,
                      came: -1,
                      wasMade: door.kind === "dungeon" ? host.dungeons.has(door.site) : Boolean(building?.made),
                      madeAt: -1,
                      // (The longest step of its coming: { step, pass, ms })
                      longest: null,
                  };
              })
            : null;
    const delved = { inside: new Uint8Array(0), most: 0, entered: 0, longest: null, floors: 0 };
    const coming = (door, step) => door.came >= 0 && step - door.came < LOAD.stagger / STEP_MS;

    for (const door of delving ?? []) {
        if (!door.key) {
            problems.push(`no door off the street was found in ${door.town} for party ${door.party + 1}`);
        } else if (door.kind === "dungeon" && door.wasMade) {
            problems.push(`${door.site} was made before the run: its making isn't in the steps timed`);
        }
    }

    // --- The run ---

    // (What's begun LOAD.eventAt in, each by a player of its own, `peer.begins`. A battle, an
    // invasion or a hell rift by one: the first player, or, several begun in the one run, the
    // first in a town who begins nothing else, since an invasion comes only to a town. The
    // fights by one in every LOAD.fightPer, evenly through the players; or, one of those
    // beginning something else, the next after them who doesn't)
    const events = LOAD.events.filter(does).map((type) => ({ type, at: eventAt, asked: 0, ok: false, actors: 0 }));
    const inTown = (peer) => peer.k === 0 || LOAD.towns.includes(world.plan.places.find(({ id }) => id === peer.home.place)?.kind);

    for (const { type } of events.filter((one) => one.type !== "fights")) {
        const free = peers.filter((peer) => !peer.begins);
        const one = free.find(inTown) ?? free[0];

        if (one) {
            one.begins = type;
        }
    }

    if (does("fights")) {
        const fighters = Math.max(1, Math.round(count / LOAD.fightPer));

        for (const theirs of peers.filter((peer) => peer.k % Math.ceil(count / fighters) === 0 && peer.k / Math.ceil(count / fighters) < fighters)) {
            const one = theirs.begins ? peers.find((peer) => peer.k > theirs.k && !peer.begins) : theirs;

            if (one) {
                one.begins = "fights";
            }
        }
    }

    peers.forEach((peer) => (peer.fights = Boolean(peer.begins)));

    const event = events.length === 1 ? events[0] : null;
    const fieldedBefore = host.fielded;
    const eventCommand = (peer) =>
        peer.begins === "fights"
            ? { type: "fieldBattle", size: LOAD.fightSize, facing: peer.roll() * Math.PI }
            : peer.begins === "battle"
              ? { type: "fieldBattle", size: FIELD_BATTLE.most, facing: peer.roll() * Math.PI }
              : peer.begins === "invasion"
                ? { type: "invade" }
                : { type: "hellrift" };

    // The nearest foe to a fighter within LOAD.foeNear, as bots look for theirs (core/bot.js): read
    // off the host's world, which a real player's game would have a copy of
    const foeOf = (me) => {
        let best = null;
        let nearest = LOAD.foeNear * LOAD.foeNear;

        for (const actor of host.battle.actors) {
            if (actor === me || actor.dead || actor.map !== me.map || host.battle.formations[actor.formation?.id]?.broken) {
                continue;
            }

            const [dx, dy] = [actor.x - me.x, actor.y - me.y];
            const far = dx * dx + dy * dy;

            if (far < nearest && host.battle.hostile(me, actor) && host.canFight(me, actor)) {
                best = actor;
                nearest = far;
            }
        }

        return best;
    };

    // What each player says before a step (`step` of the run), as text: [[peer, text]]
    const said = (step) => {
        const saying = [];
        const at = step * STEP_MS;
        const every = (ms, peer) => step % (ms / STEP_MS) === peer.k % (ms / STEP_MS);

        for (const peer of peers) {
            if (peer.state === "left") {
                continue;
            }

            // (A join storm: each says hello in their turn of the burst, then nothing while they
            // wait; welcomed, they're LOAD.loading making their copy, and say so when it's made)
            if (storm && (peer.state === "out" || peer.state === "asked")) {
                if (peer.state === "out" && step === storm.first + Math.floor((peer.k * (storm.over / STEP_MS)) / count)) {
                    saying.push([peer, hello(peer)]);
                    Object.assign(peer, { state: "asked", askedAt: step });
                    storm.asked++;
                }

                continue;
            }

            const me = host.battle.actor(peer.id);

            if (every(LOAD.ping, peer)) {
                saying.push([peer, encode({ kind: "ping", t: time })]);
            }

            if (storm && peer.state === "loading") {
                if ((step - peer.welcomedAt) * STEP_MS >= storm.loading) {
                    saying.push([peer, encode({ kind: "ready" })]);
                    peer.state = "in";
                }

                continue;
            }

            if (!me || me.dead || !hosting.players.has(peer.peer)) {
                continue;
            }

            // (Dungeons and buildings: waiting till their party's come to its door; then asking
            // to go in by it till they're through; then going for whatever's near, or walking
            // about where they stand)
            if (delving) {
                const door = peer.door ?? null;
                const building = door?.key ? world.interiors.buildings.get(door.key) : null;

                if (!door || !building) {
                    continue;
                }

                // (From wherever they are: one fallen inside who's risen in a town far off asks
                // too, and is refused, "far", at no cost to the host. It was asked only from within
                // 16 m of the door while the host took it from anywhere on the door's map and
                // looked for the whole way there as it heard it, baking every tile and making
                // every chunk between: minutes. The plan's 1-25)
                if (me.map === "town") {
                    if (building.made && building.door && step >= (peer.asksAt ?? 0)) {
                        saying.push([peer, peer.command({ type: "enter", link: building.door.id })]);
                        peer.asksAt = step + LOAD.enterEvery / STEP_MS;
                    }

                    continue;
                }

                const fighting = me.order?.type === "engage" && host.battle.actor(me.order.target) && !host.battle.actor(me.order.target).dead;
                const foe = !fighting && every(LOAD.foeEvery, peer) ? foeOf(me) : null;

                if (foe) {
                    saying.push([peer, peer.command({ type: "engage", target: foe.id })]);
                } else if (!fighting && every(LOAD.every, peer)) {
                    saying.push([peer, peer.command({ type: "move", to: [Math.round(me.x + peer.roll() * LOAD.within), Math.round(me.y + peer.roll() * LOAD.within)] })]);
                }

                continue;
            }

            if (peer.fights && at === eventAt) {
                saying.push([peer, peer.command(eventCommand(peer))]);
                events.find(({ type }) => type === peer.begins).asked++;

                continue;
            }

            // (One who's begun a fight goes for whoever's nearest, once it's begun)
            if (peer.fights && peer.begins !== "invasion" && peer.begins !== "hellrift" && at > eventAt) {
                const fighting = me.order?.type === "engage" && host.battle.actor(me.order.target) && !host.battle.actor(me.order.target).dead;
                const foe = !fighting && every(LOAD.foeEvery, peer) ? foeOf(me) : null;

                if (foe) {
                    saying.push([peer, peer.command({ type: "engage", target: foe.id })]);
                }

                if (fighting || foe) {
                    continue;
                }
            }

            if (does("stick")) {
                // (A stick held towards somewhere near home, another once they're there or every
                // LOAD.every: LOAD.stick commands a second, the fraction carried over)
                if (!peer.to || every(LOAD.every, peer) || Math.hypot(peer.to[0] - me.x, peer.to[1] - me.y) < 2) {
                    peer.to = peer.somewhere();
                }

                peer.owed += (LOAD.stick * STEP_MS) / 1000;

                while (peer.owed >= 1) {
                    peer.owed--;
                    saying.push([peer, peer.command({ type: "ahead", facing: Math.atan2(peer.to[0] - me.x, peer.to[1] - me.y), reach: LOAD.reach })]);
                }
            } else if (every(LOAD.every, peer)) {
                saying.push([peer, peer.command({ type: "move", to: peer.somewhere() })]);
            }
        }

        return saying;
    };

    const steps = Math.round((seconds * 1000) / STEP_MS);
    const wall = new Float64Array(steps);
    const cpu = new Float64Array(steps);
    // (And the look between each step and the next, what's made ahead: by the clock)
    const looks = new Float64Array(steps);
    const parts = { hear: 0, step: 0, ahead: 0 };
    const actors = { start: host.battle.actors.length, most: host.battle.actors.length, end: 0 };
    const memory = { before: process.memoryUsage(), heapMost: 0 };
    const droppedBefore = dropped;
    const takenBefore = hosting.taken;
    // (warturn: each turn of the war that fell in the run, and each save: the step it was in, and
    // of that step's time, the war's own pass and the world's writing out)
    const turnsIn = [];
    const savesIn = [];
    // (What was made ahead for the next turn of the war: the chunks made for it when the last
    // turn fell, server/ahead.js `turn`, and the most boxes of ground the host has said it
    // would bring near since)
    const turnAhead = { chunks: ahead.turn.chunks, boxes: 0 };
    const commandsBefore = hosting.dropped;
    const probes = install(new Probes({ clock, inner: !whole }));
    const started = clock();

    if (night) {
        Object.assign(night, { turn: host.war.turn, from: round(timeOfDay(elapsedOf(host.war)) / 60000), dark: torchesLit(elapsedOf(host.war)) });
    }
    let late = 0;
    let over = 0;
    // (The steps over LOAD.tick by the clock: how many, and the first LOAD.late of them with their parts)
    const lateSteps = { over: lateOver, count: 0, kept: [] };
    // (And the longest of them, with its parts, wherever in the run it fell)
    let longest = null;

    counted();
    kinds.clear();
    up.messages = 0;
    up.bytes = 0;
    peers.forEach((peer) => Object.assign(peer, { bytes: 0, messages: 0, second: 0, worstSecond: 0 }));

    delved.inside = new Uint8Array(delving ? steps : 0);

    for (let step = 0; step < steps; step++) {
        // (Dungeons and buildings: a party come to its door, stood there as they were stood
        // where they waited, untimed: finding the way there isn't what's measured)
        for (const door of delving ?? []) {
            if (door.came < 0 && door.to && step * STEP_MS >= door.at) {
                door.came = step;

                for (const peer of door.members) {
                    peer.door = door;

                    if (!host.battle.place(peer.id, "town", door.to)) {
                        problems.push(`${peer.peer} couldn't be stood at the door of ${door.key}`);
                    }
                }
            }
        }

        const saying = said(step);
        const passesBefore = new Map([...probes.passes].map(([name, { ms }]) => [name, ms]));
        const countsBefore = new Map(probes.counts);
        const stormy = storm && step >= storm.first;
        const [bakedBefore, addedBefore, madeBefore] = [navigation.baked, navigation.added, ahead.made];
        const [chunksBefore, droppedIn] = [overworld.chunks.size, dropped];
        const groundBefore = overworld.chunksMade;
        const [floorsBefore, levelsBefore] = [Navigation.floorTiles, Navigation.levelTiles];
        const actorsBefore = host.battle.actors.length;
        const cpuBefore = cpuNow();
        const before = clock();

        within.since = before;

        if (stormy) {
            storm.stepping = true;
        }

        for (const [peer, text] of saying) {
            hear(peer, text);
        }

        // (--leave: those going, gone as a link closing has them gone, in the step's hearing)
        if (going && !storm && step === going.step) {
            going.before = stood();

            const from = clock();

            for (const peer of peers.filter(leaves)) {
                hosting.gone(peer.peer);
                peer.state = "left";
                going.left++;
            }

            going.going = clock() - from;
        }

        const heard = clock();

        runner.advance(STEP_MS);

        const after = clock();
        const [bakedIn, addedIn] = [navigation.baked - bakedBefore, navigation.added - addedBefore];
        // (The chunks of ground the step made for itself: none's made ahead while it's played)
        const groundIn = overworld.chunksMade - groundBefore;
        // (And the tiles of buildings' floors and dungeons' levels it baked for itself)
        const floorsIn = Navigation.floorTiles - floorsBefore;

        // (Of those, the dungeons' levels' alone: a building's floor is baked in a step or
        // between two by when its folk first walk it, which goes by the machine's speed; a
        // level's, made ahead, in none)
        delved.floors += Navigation.levelTiles - levelsBefore;

        if (stormy) {
            storm.stepping = false;
            storm.made.steps.tiles += bakedIn;
        }

        cpu[step] = cpuNow() - cpuBefore;
        wall[step] = after - before;
        parts.hear += heard - before;
        parts.step += after - heard;
        late += wall[step] > STEP_MS ? 1 : 0;
        over += cpu[step] > STEP_MS ? 1 : 0;
        time += STEP_MS;
        within.since = null;
        within.over += Math.max(0, wall[step] - STEP_MS);
        counted();

        // (A late step kept with its parts: the hearing, each pass's time in it, and what each
        // counter went up by)
        const partsOf = () => ({
            at: step * STEP_MS,
            wall: round(wall[step]),
            cpu: round(cpu[step]),
            hear: round(heard - before),
            passes: Object.fromEntries(
                [...probes.passes]
                    .map(([name, { ms }]) => [name, round(ms - (passesBefore.get(name) ?? 0))])
                    .filter(([, ms]) => ms > 0)
                    .sort(([, a], [, b]) => b - a),
            ),
            counts: Object.fromEntries([...probes.counts].map(([name, n]) => [name, n - (countsBefore.get(name) ?? 0)]).filter(([, n]) => n !== 0)),
            made: { chunks: groundIn, tiles: bakedIn, floors: floorsIn },
        });

        if (wall[step] > lateOver) {
            lateSteps.count++;

            if (lateSteps.kept.length < LOAD.late) {
                lateSteps.kept.push(partsOf());
            }

            if (!longest || wall[step] > longest.wall) {
                longest = lateSteps.kept.at(-1)?.at === step * STEP_MS ? lateSteps.kept.at(-1) : partsOf();
            }
        }

        // (The players gone: the longest of the steps since, with its parts; and what the steps
        // took out of the battle, in how many goings through it, and let go of besides)
        if (going && step >= going.step && step < going.step + going.steps) {
            if (!going.longest || wall[step] > going.longest.wall) {
                going.longest = partsOf();
            }

            going.let.characters += (probes.counts.get("battle.removed") ?? 0) - (countsBefore.get("battle.removed") ?? 0);
            going.let.forgets += (probes.counts.get("battle.forgets") ?? 0) - (countsBefore.get("battle.forgets") ?? 0);
            going.let.buildings = going.before.open - host.open.size;
            going.let.chunks += Math.max(0, chunksBefore - overworld.chunks.size);
            going.let.tiles += dropped - droppedIn;
        }

        // (A join storm: how long this step was at letting anyone in; and, of the longest step
        // while anyone's still to come in, the pass that took most of it)
        if (storm && step >= storm.first && (storm.asked < count || storm.waited.length < storm.asked)) {
            storm.admits.push(storm.admitting);
            storm.letting += wall[step] > LOAD.tick && wall[step] - storm.admitting <= LOAD.tick ? 1 : 0;

            if (!storm.worst || wall[step] > wall[storm.worst.step]) {
                const [pass, ms] = [...probes.passes].map(([name, { ms: spent }]) => [name, spent - (passesBefore.get(name) ?? 0)]).sort(([, a], [, b]) => b - a)[0];

                storm.worst = { step, pass, ms, admit: storm.admitting };
            }
        }

        if (storm) {
            storm.admitting = 0;
        }

        // (Dungeons and buildings: whether a door's floors were made in this step; the longest
        // step of each door's coming, and the pass that took most of it; and how many of the
        // players are inside)
        for (const door of delving ?? []) {
            if (door.came >= 0 && door.madeAt < 0 && !door.wasMade && world.interiors.buildings.get(door.key)?.made) {
                door.madeAt = step;
            }

            if (coming(door, step) && (!door.longest || wall[step] > wall[door.longest.step])) {
                const [pass, ms] = [...probes.passes].map(([name, { ms: spent }]) => [name, spent - (passesBefore.get(name) ?? 0)]).sort(([, a], [, b]) => b - a)[0];

                door.longest = { step, pass, ms };
            }
        }

        if (delving) {
            let inside = 0;

            for (const peer of peers) {
                const me = host.battle.actor(peer.id);

                if (me && !me.dead && me.map !== "town") {
                    inside++;
                    delved.entered += peer.entered ? 0 : 1;
                    peer.entered = true;
                }
            }

            delved.inside[step] = Math.min(255, inside);
            delved.most = Math.max(delved.most, inside);

            // (The longest step with anyone inside, and the pass that took most of it)
            if (inside && (!delved.longest || wall[step] > wall[delved.longest.step])) {
                const [pass, ms] = [...probes.passes].map(([name, { ms: spent }]) => [name, spent - (passesBefore.get(name) ?? 0)]).sort(([, a], [, b]) => b - a)[0];

                delved.longest = { step, pass, ms };
            }
        }

        // (Whoever this step's sending let in: come back where they were, as a kept hero does,
        // to within the few squares the host looks round it for one that's free)
        for (const peer of storm ? peers : []) {
            if (peer.state === "asked" && hosting.players.has(peer.peer)) {
                Object.assign(peer, { id: hosting.players.get(peer.peer), state: "loading", welcomedAt: step });
                storm.waited.push((step - peer.askedAt) * STEP_MS);
                storm.last = step;

                const { square, map } = host.battle.actor(peer.id);

                if (map !== "town" || Math.max(Math.abs(square[0] - peer.home.at[0]), Math.abs(square[1] - peer.home.at[1])) > LOAD.back) {
                    problems.push(`${peer.peer} didn't come back to where they were in ${peer.home.place} as the storm let them in`);
                }
            }
        }

        // (Each pass's time in this step, for the turn's step and those up to its save)
        if (keeper && (kept.turned !== null || (turnsIn.length && step - turnsIn.at(-1).step <= KEEPER.after))) {
            const spent = [...probes.passes].map(([name, { ms }]) => [name, ms - (passesBefore.get(name) ?? 0)]).sort(([, a], [, b]) => b - a);

            if (kept.turned !== null) {
                turnsIn.push({ step, number: kept.turned, war: spent.find(([name]) => name === "war")?.[1] ?? 0, next: [], ahead: ahead.turn.chunks - turnAhead.chunks, boxes: turnAhead.boxes });
                Object.assign(turnAhead, { chunks: ahead.turn.chunks, boxes: 0 });
                kept.turned = null;
            } else {
                turnsIn.at(-1).next.push({ step, pass: spent[0][0], ms: spent[0][1], chunks: groundIn, tiles: bakedIn, actors: host.battle.actors.length - actorsBefore });
            }
        }

        if (kept.wrote !== null) {
            savesIn.push({ step, text: kept.wrote });
            kept.wrote = null;
        }

        // (What was asked for LOAD.eventAt in, begun or not: an invasion on, a rift open, more in
        // the battle for a fight; and, several begun together, as many field battles mustered as
        // were asked for, where how many more are in the battle is all of theirs together)
        if (events.length && step * STEP_MS === eventAt) {
            const fields = events.reduce((sum, { type, asked: by }) => sum + (type === "fights" || type === "battle" ? by : 0), 0);

            for (const one of events) {
                one.actors = host.battle.actors.length - actors.most;
                one.ok = one.type === "invasion" ? host.invasions.length > 0 : one.type === "hellrift" ? Boolean(host.hellRifts.open) : one.actors > 0 && (events.length === 1 || host.fielded - fieldedBefore >= fields);
            }
        }

        actors.most = Math.max(actors.most, host.battle.actors.length);

        if ((step + 1) % (1000 / STEP_MS) === 0) {
            for (const peer of peers) {
                peer.worstSecond = Math.max(peer.worstSecond, peer.second);
                peer.second = 0;
            }

            memory.heapMost = Math.max(memory.heapMost, process.memoryUsage().heapUsed);
        }

        // (Between steps, as on a server: what's wanted made ahead, round those waiting to come
        // in too, and the workers heard)
        for (let look = 0; look < (storm ? LOAD.looks : 1); look++) {
            const making = clock();

            if (storm) {
                ahead.expect(hosting.coming());
            }

            const [had, fell] = [overworld.chunks.size, dropped];

            runner.bakeAhead(ahead);

            const spent = clock() - making;

            parts.ahead += spent;
            looks[step] += spent;

            // (warturn: how many boxes of ground the host said the war's next turn would
            // bring near, at the most, since the last turn)
            turnAhead.boxes = host.war && TURN_MS - host.war.clock <= SOON.turn ? Math.max(turnAhead.boxes, ahead.turn.boxes) : turnAhead.boxes;

            // (The players gone: what this look let go of, and the longest of the looks since)
            if (going && step >= going.step && step < going.step + going.steps) {
                going.let.chunks += Math.max(0, had - overworld.chunks.size);
                going.let.tiles += dropped - fell;

                if (spent > going.look.worst) {
                    going.look = { worst: spent, worstAt: step * STEP_MS };
                }
            }

            await new Promise((resolve) => setImmediate(resolve));
        }

        if (stormy) {
            storm.made.ahead.chunks += ahead.made - madeBefore;
            storm.made.ahead.tiles += navigation.added - addedBefore - addedIn;
        }
    }

    Ahead.coming = wasComing;
    Ahead.easing = wasEasing;
    Battle.forgetting = wasForgetting;
    Battle.idling = wasIdling;
    Host.peopling = wasPeopling;
    Ahead.turns = wasTurns;
    Overworld.recently = wasRecently;
    Ahead.delving = wasDelving;

    uninstall();

    const took = clock() - started;
    const total = wall.reduce((sum, ms) => sum + ms, 0);
    const measured = probes.toJSON();
    const passes = Object.fromEntries(Object.entries(measured.passes).map(([name, { ms, calls }]) => [name, { ms: round(ms), mean: round(ms / steps, 4), share: round(ms / total, 4), calls }]));
    const named = Object.entries(measured.passes).reduce((sum, [name, { ms }]) => sum + (name === "end" ? 0 : ms), 0) + parts.hear;
    // (The battle's step: the host's `battle` pass and all its parts together)
    const battle = Object.entries(measured.passes).reduce((sum, [name, { ms }]) => sum + (name === "battle" || name.startsWith("battle.") ? ms : 0), 0);
    const census = censusOf(host.battle);
    const pacing = keptUp(wall, looks);

    actors.end = host.battle.actors.length;

    if (night) {
        // (Dark from its first step to its last: the night's 14 minutes, DAY.night to DAY.dawn)
        Object.assign(night, { to: round(timeOfDay(elapsedOf(host.war)) / 60000), dark: night.dark && torchesLit(elapsedOf(host.war)) && seconds * 1000 < DAY.length - DAY.night + DAY.dawn });

        if (!night.dark) {
            problems.push(`the night run wasn't dark from its first step to its last (minute ${night.from} to minute ${night.to} of the day's ${DAY.length / 60000})`);
        }
    }

    // (What the activity adds to the report, under its own name)
    const report = {};

    // (warturn: the first turn that fell in the run and the save after it, beside the steps round them)
    let warturn = null;

    if (keeper) {
        await keeper.settled();

        const turn = turnsIn[0] ?? null;
        const save = turn ? (savesIn.find(({ step }) => step > turn.step) ?? null) : null;
        const written = save ? (kept.saves[savesIn.indexOf(save)] ?? null) : null;
        const span = LOAD.round / STEP_MS;
        // (The longest of the steps between a turn's and its save's: the turn's doings acted on)
        const between = (one) => one.next.filter(({ step }) => !savesIn.some((saved) => saved.step === step)).reduce((worst, each) => (!worst || wall[each.step] > wall[worst.step] ? each : worst), null);
        const longest = turn ? between(turn) : null;
        const stepsOf = (from) => spreadOf(wall.subarray(Math.max(0, Math.min(steps, from)), Math.max(0, Math.min(steps, from + span))));

        // (What the steps from a turn's to its save's made for themselves, and stood up or let go)
        const madeIn = (one) => one.next.reduce((sum, each) => ({ chunks: sum.chunks + each.chunks, tiles: sum.tiles + each.tiles }), { chunks: 0, tiles: 0 });

        warturn = {
            played,
            turns: turnsIn.length,
            // (Whether what the turn would bring near was made ahead, or with --unforeseen not;
            // of the first turn: the boxes of ground the host said it would want and the chunks
            // made ahead for them, and what the steps from the turn to its save still made)
            foreseen: !unforeseen,
            ground: { boxes: turn?.boxes ?? 0, ahead: turn?.ahead ?? 0, steps: turn ? madeIn(turn) : { chunks: 0, tiles: 0 } },
            turn: turn ? { at: turn.step * STEP_MS, number: turn.number, wall: round(wall[turn.step]), cpu: round(cpu[turn.step]), war: round(turn.war) } : { at: -1, number: 0, wall: 0, cpu: 0, war: 0 },
            save: save
                ? { at: save.step * STEP_MS, after: save.step - turn.step, wall: round(wall[save.step]), cpu: round(cpu[save.step]), text: round(save.text), bytes: written?.bytes ?? 0, zipped: written?.zipped ?? 0, gzip: round(written?.ms ?? 0), written: kept.saves.length }
                : { at: -1, after: 0, wall: 0, cpu: 0, text: 0, bytes: 0, zipped: 0, gzip: 0, written: kept.saves.length },
            between: longest ? { after: longest.step - turn.step, wall: round(wall[longest.step]), cpu: round(cpu[longest.step]), pass: longest.pass, ms: round(longest.ms) } : { after: 0, wall: 0, cpu: 0, pass: "", ms: 0 },
            round: { before: stepsOf(turn ? turn.step - span : 0), after: stepsOf(save ? save.step + 1 : steps) },
            // (Every turn that fell in the run: its step, the longest between it and its save, and its save's)
            all: turnsIn.map((one) => ({ at: one.step * STEP_MS, number: one.number, turn: round(wall[one.step]), between: round(wall[between(one)?.step] ?? 0), save: round(wall[savesIn.find(({ step }) => step > one.step && step <= one.step + KEEPER.after)?.step] ?? 0), boxes: one.boxes, ahead: one.ahead, chunks: madeIn(one).chunks })),
        };

        if (!turn || turn.step * STEP_MS !== eventAt) {
            problems.push(`the war's turn waited for at ${eventAt / 1000} s didn't come then`);
        } else if (!save || !written) {
            problems.push("the war's turn wasn't saved within the run");
        }
    }

    for (const one of events) {
        if (!one.ok) {
            problems.push(`the ${one.type} asked for at ${eventAt / 1000} s didn't begin`);
        }
    }

    if (storm) {
        const { first, last, waited, admits, worst, made, letting, ...rest } = storm;

        delete rest.admitting;
        delete rest.stepping;
        const from = Math.min(first, steps);
        const to = last < 0 ? steps : last + 1;

        Object.assign(rest, {
            welcomed: waited.length,
            waiting: hosting.waiting.size,
            queued: kinds.get("queued")?.messages ?? 0,
            snapshots: hosting.taken - takenBefore,
            // (When the last came in, ms into the run, or -1 if some never did; how long they'd
            // waited, ms of the world's time; and everyone's waits)
            done: waited.length === count ? (last + 1) * STEP_MS : -1,
            lastWaited: waited.at(-1) ?? 0,
            waits: spreadOf(waited),
            // (The steps from the first hello to the last welcome: the storm's own)
            steps: { count: to - from, wall: spreadOf(wall.subarray(from, to)), cpu: spreadOf(cpu.subarray(from, to)), over: wall.subarray(from, to).reduce((sum, ms) => sum + (ms > LOAD.tick ? 1 : 0), 0), letting },
            // (Of those steps, the letting in alone, by the clock; and the longest step: when,
            // how long, the letting in in it, and the pass that took most of it)
            admit: spreadOf(admits),
            longest: worst ? { at: worst.step * STEP_MS, wall: round(wall[worst.step]), cpu: round(cpu[worst.step]), admit: round(worst.admit), pass: worst.pass, ms: round(worst.ms) } : { at: -1, wall: 0, cpu: 0, admit: 0, pass: "", ms: 0 },
            // (The ground's chunks and the navigation's tiles made from the first hello to the
            // run's end: by the steps for themselves, and ahead of them, between steps; and
            // whether what's round those waiting was made ahead, or, `cold`, not)
            ground: { ahead: !cold, steps: made.steps, between: made.ahead },
        });
        report.joinstorm = rest;

        if (rest.welcomed < count) {
            problems.push(`${count - rest.welcomed} of the storm's ${count} hadn't been let in when the run ended (${rest.waiting} still waiting their turn)`);
        }
    }

    if (delving) {
        const made = (kind) => delving.filter((door) => door.kind === kind && door.madeAt >= 0);
        const came = (kind, times) => spreadOf(delving.filter((door) => door.kind === kind && door.longest).map((door) => times[door.longest.step]));
        const longest = delving.reduce((worst, door) => (door.longest && (!worst || wall[door.longest.step] > wall[worst.longest.step]) ? door : worst), null);
        const timesOf = (times, keep) => times.filter((_, step) => keep(step));
        const withIn = (step) => delved.inside[step] > 0;
        const first = delving.reduce((least, { came }) => (came >= 0 ? Math.min(least, came) : least), steps);
        const alive = peers.map((peer) => host.battle.actor(peer.id)).filter((me) => me && !me.dead);

        report.dungeons = {
            parties: delving.length,
            doors: { dungeons: delving.filter(({ kind }) => kind === "dungeon").length, buildings: delving.filter(({ kind }) => kind === "building").length },
            at: eventAt,
            stagger: LOAD.stagger,
            // (The doors whose floors were made in the run, and how many levels the dungeons'
            // have; the longest step of each door's coming, a dungeon's and a building's, by the
            // clock and in the thread's time; and the longest of all: when, how long after its
            // party came, whose, and the pass that took most of it)
            made: { dungeons: made("dungeon").length, buildings: made("building").length, levels: made("dungeon").reduce((sum, { key }) => sum + world.interiors.buildings.get(key).maps.length, 0) },
            // (What of the dungeons was made ahead: whether their levels were worked out ahead,
            // and their floors made and baked (--cold neither, --undelved the levels alone); how
            // many floors were made between steps; and how many tiles of the dungeons' levels'
            // navigation the steps baked for themselves)
            ahead: { levels: !(cold && does("dungeons")), floors: delvedAhead, made: ahead.delved.levels, baked: delved.floors },
            coming: {
                dungeon: { wall: came("dungeon", wall), cpu: came("dungeon", cpu) },
                building: { wall: came("building", wall), cpu: came("building", cpu) },
                longest: longest
                    ? { at: longest.longest.step * STEP_MS, after: (longest.longest.step - longest.came) * STEP_MS, door: longest.kind, wall: round(wall[longest.longest.step]), cpu: round(cpu[longest.longest.step]), pass: longest.longest.pass, ms: round(longest.longest.ms) }
                    : { at: -1, after: 0, door: "", wall: 0, cpu: 0, pass: "", ms: 0 },
            },
            // (Who got in, how many were inside at most and as the run ended, and how many had fallen)
            entered: delved.entered,
            inside: { most: delved.most, end: alive.filter(({ map }) => map !== "town").length, fallen: count - alive.length },
            // (The steps before anyone came to a door, and those with anyone inside)
            before: { count: first, wall: spreadOf(wall.subarray(0, first)), cpu: spreadOf(cpu.subarray(0, first)) },
            steps: {
                count: timesOf(wall, withIn).length,
                wall: spreadOf(timesOf(wall, withIn)),
                cpu: spreadOf(timesOf(cpu, withIn)),
                over: timesOf(wall, withIn).reduce((sum, ms) => sum + (ms > LOAD.tick ? 1 : 0), 0),
                longest: delved.longest ? { at: delved.longest.step * STEP_MS, wall: round(wall[delved.longest.step]), cpu: round(cpu[delved.longest.step]), pass: delved.longest.pass, ms: round(delved.longest.ms) } : { at: -1, wall: 0, cpu: 0, pass: "", ms: 0 },
            },
        };

        if (!delved.entered) {
            problems.push("no one got in by a door");
        } else if (delved.entered < count) {
            problems.push(`${count - delved.entered} of the ${count} never got in by their door`);
        }

        for (const door of delving) {
            if (door.kind === "dungeon" && !door.wasMade && door.madeAt < 0) {
                problems.push(`${door.site} wasn't made in the run`);
            }
        }
    }

    const staying = storm ? storm.asked : count - (going?.left ?? 0);

    if (hosting.players.size + hosting.waiting.size < staying) {
        problems.push(`${staying - hosting.players.size - hosting.waiting.size} of the players were sent out of the world`);
    }

    // (The players gone together: the steps of LOAD.leaving after, beside those of as long before)
    if (going) {
        const [from, to] = [Math.min(going.step, steps), Math.min(going.step + going.steps, steps)];
        const span = (a, b) => ({ count: b - a, wall: spreadOf(wall.subarray(a, b)), cpu: spreadOf(cpu.subarray(a, b)), over: wall.subarray(a, b).reduce((sum, ms) => sum + (ms > LOAD.tick ? 1 : 0), 0) });

        report.leave = {
            who: going.who,
            at: going.step * STEP_MS,
            left: going.left,
            stayed: count - going.left,
            sudden,
            going: round(going.going),
            before: span(Math.max(0, from - going.steps), from),
            steps: span(from, to),
            longest: going.longest ?? { at: -1, wall: 0, cpu: 0, hear: 0, passes: {}, counts: {}, made: { chunks: 0, tiles: 0, floors: 0 } },
            let: going.let,
            look: { worst: round(going.look.worst), worstAt: going.look.worstAt },
        };

        if (going.step >= steps) {
            problems.push(`the run ended before the ${going.who === "all" ? "players" : "half of the players"} were to leave, ${(going.step * STEP_MS) / 1000} s in`);
        }
    }

    // --- A snapshot: how big, how long to take and to write out (the middle of a few) ---

    const shots = Array.from({ length: LOAD.snapshots }, () => {
        const before = clock();
        const snapshot = host.snapshot();
        const taken = clock();
        const text = encode(snapshot);

        const encoded = clock();

        // (And written straight from the world's own, as the server's saves are and what's sent
        // those who join: Host.snapshotText)
        host.snapshotText();

        return { take: taken - before, encode: encoded - taken, text: clock() - encoded, bytes: Buffer.byteLength(text) };
    });
    const middle = (key) => shots.map((shot) => shot[key]).sort((a, b) => a - b)[shots.length >> 1];
    const after = process.memoryUsage();
    const sent = [...kinds.values()].reduce((sum, { bytes }) => sum + bytes, 0);

    ahead.dispose();

    return {
        schema: LOAD.schema,
        run,
        built: true,
        joined,
        warm,
        navigation: { ...tiles, held: navigation.tiles.size, dropped: dropped - droppedBefore, reach: ahead.reach },
        steps: {
            count: steps,
            wall: spreadOf(wall),
            cpu: spreadOf(cpu),
            late,
            over,
            // (How fast the world was played: its time over the clock's)
            speed: round((steps * STEP_MS) / took, 1),
            // (The most steps over LOAD.tick one straight after another; and the share of its
            // clock's time a world server would have played with these steps and looks: keptUp)
            together: pacing.together,
            pace: pacing.pace,
        },
        parts: { hear: round(parts.hear / steps, 4), step: round(parts.step / steps, 4), ahead: round(parts.ahead / steps, 4) },
        passes,
        battle: { ms: round(battle), mean: round(battle / steps, 4), share: round(battle / total, 4), idling: !astir, peopling: !peopled },
        census,
        // (The share of the steps' time that falls to a named pass or to what was heard: all but
        // `end` and whatever the runner does between the step and what's sent)
        named: round(named / total, 4),
        counts: measured.counts,
        // (With `longest`, the longest of them, where there were any: among those kept or not)
        late: longest ? { ...lateSteps, longest } : lateSteps,
        bytes: {
            total: sent,
            perPeer: {
                // (Bytes a second: the mean player's, the busiest player's, and any player's busiest second)
                mean: Math.round(sent / count / seconds),
                most: Math.round(Math.max(...peers.map((peer) => peer.bytes)) / seconds),
                worstSecond: Math.max(...peers.map((peer) => peer.worstSecond)),
            },
            byKind: Object.fromEntries([...kinds].sort(([a], [b]) => (a < b ? -1 : 1))),
            up: { ...up, refused: hosting.dropped - commandsBefore, allowed: HEARD.commands },
        },
        snapshot: { bytes: middle("bytes"), take: round(middle("take")), encode: round(middle("encode")), text: round(middle("text")) },
        memory: {
            // (MB)
            heap: round(after.heapUsed / MB, 1),
            heapBefore: round(memory.before.heapUsed / MB, 1),
            heapMost: round(Math.max(memory.heapMost, after.heapUsed) / MB, 1),
            external: round(after.external / MB, 1),
            rss: round(after.rss / MB, 1),
        },
        actors,
        // (What was begun LOAD.eventAt in: `event`, the one; or `events`, the several of a run of several)
        ...(event ? { event } : events.length ? { events } : {}),
        ...(night ? { night } : {}),
        ...(warturn ? { warturn } : {}),
        ...report,
        problems,
        took: { run: round(took / 1000, 1), all: round((clock() - began) / 1000, 1) },
    };
}

// What a report must hold: each key's type ("number", "string", "boolean", "array", an object of
// the same, or [type] for an object of any keys whose values are all of it)
const SPREAD = { mean: "number", p50: "number", p99: "number", worst: "number", worstAt: "number" };
const RUN = { seed: "number", players: "number", layout: "string", activity: "string", seconds: "number", whole: "boolean", leave: "string", sudden: "boolean", node: "string", platform: "string", arch: "string", cpus: "number" };

const CENSUS = { all: "number", fallen: "number", walking: "number", set: "number", seated: "number", indoors: "number", alone: "number", m30: "number", m60: "number", m120: "number", m250: "number", beyond: "number" };

export const REPORT_SCHEMA = Object.freeze({
    schema: "number",
    run: RUN,
    built: "boolean",
    joined: { players: "number", ms: "number", welcome: { bytes: SPREAD, ms: SPREAD } },
    warm: { ms: "number", settled: "boolean", chunks: "number", rooms: "number", tiles: "number" },
    navigation: { tile: "number", keep: "number", wanted: "number", capped: "boolean", held: "number", dropped: "number", reach: "number" },
    steps: { count: "number", wall: SPREAD, cpu: SPREAD, late: "number", over: "number", speed: "number", together: "number", pace: "number" },
    parts: { hear: "number", step: "number", ahead: "number" },
    passes: [{ ms: "number", mean: "number", share: "number", calls: "number" }],
    battle: { ms: "number", mean: "number", share: "number", idling: "boolean", peopling: "boolean" },
    census: [CENSUS],
    named: "number",
    counts: ["number"],
    late: { over: "number", count: "number", kept: "array" },
    bytes: {
        total: "number",
        perPeer: { mean: "number", most: "number", worstSecond: "number" },
        byKind: [{ messages: "number", bytes: "number" }],
        up: { messages: "number", bytes: "number", refused: "number", allowed: "number" },
    },
    snapshot: { bytes: "number", take: "number", encode: "number", text: "number" },
    memory: { heap: "number", heapBefore: "number", heapMost: "number", external: "number", rss: "number" },
    actors: { start: "number", most: "number", end: "number" },
    problems: "array",
    took: { run: "number", all: "number" },
});

/**
 * What a report holds besides, by its activity, under the activity's own name. `night`: how long
 * the world was played with no one in to get to nightfall (ms of its time), the war's turn as the
 * timed run began, the time of day it began and ended at (minutes from midnight), and whether it
 * was dark all through. `warturn`: how long the world was played with no one in first (ms of its
 * time: --turns), how many turns of the war fell in the run, and of the first: the step that
 * turned it (when, ms into the run; which turn; the step by the clock and in the thread's time;
 * the war's own pass in it), the step that saved it (when; how many steps after; the step; the
 * world's writing out in it, `text`; the save's size, and gzipped, and how long gzipping took off
 * the step; how many saves were written in all), the longest of the steps between the two (how
 * many after the turn; the step; and the pass that took most of it, by name, and its time), the
 * steps of the second before the turn and of the second after the save, by the clock, and every
 * turn that fell in the run ([{ at, number, turn, between, save, boxes, ahead, chunks }]: those
 * three steps of each, and its ground). Its ground (`ground`, the first turn's; `foreseen`:
 * whether it was asked for, or with --unforeseen not): how many boxes of ground the host said
 * the turn would bring near that nothing wanted yet (core/host.js soon's `foreseen`, at the
 * most), how many chunks were made ahead for them before it fell (server/ahead.js `turn`), and
 * how many chunks and navigation tiles the steps from the turn to its save made for themselves
 * (generated/multiplayer_scaling_plan.md 1-28).
 * `joinstorm`: when the storm began (ms into the run) and over how long everyone said hello; how
 * many the world let come in at once and how long each was at making their copy; how many said
 * hello, were let in, and were still waiting as the run ended; how many times anyone was told
 * their place in the line; how many times the world was taken for them; when the last came in (ms
 * into the run: -1, if some never did) and how long they'd waited (ms of the world's time), with
 * everyone's waits; and the steps from the first hello to the last welcome, by the clock and in
 * the thread's time, with how many were over LOAD.tick by the clock, and how many of those would
 * not have been but for the letting in in them (`letting`); of those steps, the letting
 * in alone (bringing each into the world, taking it, writing it and sending it: Session.admit),
 * by the clock; and the longest of them: when, how long, the letting in in it, and the pass that
 * took most of it, by name, and its time; and the ground's chunks and the navigation's tiles
 * made from the first hello to the run's end, inside the steps (the hearing and the step) and
 * between them, ahead (`ground`; `ahead`, whether what's round those waiting was made ahead and
 * waited for, as a world server does, or, --cold, not). `dungeons`: how many parties, and of their doors how
 * many are dungeons' and how many buildings'; when the first came to its door (ms into the run)
 * and how long after one another; the doors whose floors were made in the run (how many dungeons
 * and buildings, and how many levels the dungeons have); what of the dungeons was made ahead
 * (`ahead`: whether their levels were worked out ahead, `levels`, and their floors made and their
 * navigation baked, `floors`; how many floors were `made` between steps; and how many tiles of
 * the dungeons' levels' navigation the steps `baked` for themselves); the longest step of each door's coming
 * (from its party's standing at it till the next party's: its floors made, its first level
 * woken, its party through), a dungeon's and a building's, by the clock and in the thread's time,
 * and the longest of all (when, how long after its party came, whose, and the pass that took most
 * of it); how many got in; how many were inside at most and as the run ended, and
 * how many had fallen; the steps before anyone came to a door; and the steps with anyone inside,
 * with how many were over LOAD.tick by the clock, and the longest of them: when, and the pass that
 * took most of it.
 */
export const ACTIVITY_SCHEMAS = Object.freeze({
    night: { waited: "number", turn: "number", from: "number", to: "number", dark: "boolean" },
    warturn: {
        played: "number",
        turns: "number",
        foreseen: "boolean",
        ground: { boxes: "number", ahead: "number", steps: { chunks: "number", tiles: "number" } },
        turn: { at: "number", number: "number", wall: "number", cpu: "number", war: "number" },
        save: { at: "number", after: "number", wall: "number", cpu: "number", text: "number", bytes: "number", zipped: "number", gzip: "number", written: "number" },
        between: { after: "number", wall: "number", cpu: "number", pass: "string", ms: "number" },
        round: { before: SPREAD, after: SPREAD },
        all: "array",
    },
    joinstorm: {
        at: "number",
        over: "number",
        welcomes: "number",
        loading: "number",
        asked: "number",
        welcomed: "number",
        waiting: "number",
        queued: "number",
        snapshots: "number",
        done: "number",
        lastWaited: "number",
        waits: SPREAD,
        steps: { count: "number", wall: SPREAD, cpu: SPREAD, over: "number", letting: "number" },
        admit: SPREAD,
        longest: { at: "number", wall: "number", cpu: "number", admit: "number", pass: "string", ms: "number" },
        ground: { ahead: "boolean", steps: { chunks: "number", tiles: "number" }, between: { chunks: "number", tiles: "number" } },
    },
    dungeons: {
        parties: "number",
        doors: { dungeons: "number", buildings: "number" },
        at: "number",
        stagger: "number",
        made: { dungeons: "number", buildings: "number", levels: "number" },
        ahead: { levels: "boolean", floors: "boolean", made: "number", baked: "number" },
        coming: {
            dungeon: { wall: SPREAD, cpu: SPREAD },
            building: { wall: SPREAD, cpu: SPREAD },
            longest: { at: "number", after: "number", door: "string", wall: "number", cpu: "number", pass: "string", ms: "number" },
        },
        entered: "number",
        inside: { most: "number", end: "number", fallen: "number" },
        before: { count: "number", wall: SPREAD, cpu: SPREAD },
        steps: { count: "number", wall: SPREAD, cpu: SPREAD, over: "number", longest: { at: "number", wall: "number", cpu: "number", pass: "string", ms: "number" } },
    },
});

/**
 * A step kept with its parts (each of the report's `late.kept`, and `leave.longest`): when (ms
 * into the run), how long by the clock and in the thread's time, the hearing in it, each pass's
 * time in it by name, the longest first, what each counter went up by in it, and what it made
 * for itself (`made`: chunks of ground, core/overworld.js chunksMade, and navigation tiles
 * baked: what wasn't made ahead of it).
 */
export const STEP_SCHEMA = Object.freeze({ at: "number", wall: "number", cpu: "number", hear: "number", passes: ["number"], counts: ["number"], made: { chunks: "number", tiles: "number", floors: "number" } });

/**
 * What a report holds of players gone together (`leave`: a join storm's, everyone gone before
 * its first step; or --leave's): who went (`half`, every other player, or `all`), when (ms into
 * the run), how many, and how many stayed; whether they were let go as they were before
 * generated/multiplayer_scaling_plan.md 1-27 (--sudden); how long the going itself took, all
 * their links closed (ms by the clock, in that step's hearing: 0 for a storm's, gone before the
 * run); the steps of LOAD.leaving after (a
 * storm's, till its first hello) beside those of as long before, by the clock and in the thread's
 * time, with how many were over LOAD.tick; the longest of those after, with its parts
 * (STEP_SCHEMA); what was let go in them: characters taken out of the battle by the steps (and
 * by the going itself, where that's in the run) and how many times the battle was gone through
 * to forget them, buildings closed, chunks of ground, and navigation tiles; and the longest of
 * the looks between those steps, making ahead and letting go (ms), and when.
 */
const SPAN = { count: "number", wall: SPREAD, cpu: SPREAD, over: "number" };

export const LEAVE_SCHEMA = Object.freeze({
    who: "string",
    at: "number",
    left: "number",
    stayed: "number",
    sudden: "boolean",
    going: "number",
    before: SPAN,
    steps: SPAN,
    longest: STEP_SCHEMA,
    let: { characters: "number", forgets: "number", buildings: "number", chunks: "number", tiles: "number" },
    look: { worst: "number", worstAt: "number" },
});

/**
 * What was begun LOAD.eventAt in (the report's `event`, a run of one such; each of `events`, a
 * run of several together): which (LOAD.events), when (ms into the run), how many players asked
 * for it, whether it began, and how many more were in the battle after that step (of several
 * begun in the one step, all of theirs together).
 */
export const EVENT_SCHEMA = Object.freeze({ type: "string", at: "number", asked: "number", ok: "boolean", actors: "number" });

/** What an unbuilt activity's report holds instead. */
export const UNBUILT_SCHEMA = Object.freeze({ schema: "number", run: RUN, built: "boolean", reason: "string" });

/**
 * What's wrong with a report by its schema (REPORT_SCHEMA; UNBUILT_SCHEMA for one that says its
 * activity isn't built): a line for each key missing, of the wrong type, or not a finite number;
 * none, if it's as it should be.
 */
export function checkReport(report, schema = report?.built === false ? UNBUILT_SCHEMA : REPORT_SCHEMA, at = "report") {
    const wrong = [];
    const check = (value, type, where) => {
        if (Array.isArray(type)) {
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                wrong.push(`${where}: not an object`);
            } else {
                Object.entries(value).forEach(([key, each]) => check(each, type[0], `${where}.${key}`));
            }
        } else if (typeof type === "object") {
            wrong.push(...checkReport(value, type, where));
        } else if (type === "array" ? !Array.isArray(value) : type === "number" ? !Number.isFinite(value) : typeof value !== type) {
            wrong.push(`${where}: not ${type === "array" ? "an array" : `a ${type}`}`);
        }
    };

    if (report === null || typeof report !== "object" || Array.isArray(report)) {
        return [`${at}: not an object`];
    }

    // (A whole report of a run: what its activity adds, or each of its several, too; what's
    // begun in a run of several, if more than one thing is; and what players gone together add)
    const played = typeof report.run?.activity === "string" ? report.run.activity.split(",") : [];
    const whole =
        schema === REPORT_SCHEMA
            ? {
                  ...schema,
                  ...Object.fromEntries(played.filter((one) => Object.hasOwn(ACTIVITY_SCHEMAS, one)).map((one) => [one, ACTIVITY_SCHEMAS[one]])),
                  ...(played.filter((one) => LOAD.events.includes(one)).length > 1 ? { events: "array" } : {}),
                  ...(report.run?.activity === "joinstorm" || (report.run?.leave ?? "none") !== "none" || Object.hasOwn(report, "leave") ? { leave: LEAVE_SCHEMA } : {}),
              }
            : schema;

    for (const [key, type] of Object.entries(whole)) {
        if (!Object.hasOwn(report, key)) {
            wrong.push(`${at}.${key}: missing`);
        } else {
            check(report[key], type, `${at}.${key}`);
        }
    }

    // (And each late step kept, by its own; and the longest of them, where one's said)
    if (schema === REPORT_SCHEMA && Array.isArray(report.late?.kept)) {
        report.late.kept.forEach((step, k) => wrong.push(...checkReport(step, STEP_SCHEMA, `${at}.late.kept.${k}`)));

        if (Object.hasOwn(report.late, "longest")) {
            wrong.push(...checkReport(report.late.longest, STEP_SCHEMA, `${at}.late.longest`));
        }
    }

    // (And each thing begun in a run of several, by its own)
    if (schema === REPORT_SCHEMA && Array.isArray(report.events)) {
        report.events.forEach((event, k) => wrong.push(...checkReport(event, EVENT_SCHEMA, `${at}.events.${k}`)));
    }

    return wrong;
}

/**
 * Why a run failed, a line each, judged only by what's the same on any machine, and by a ceiling
 * (`ceiling`, ms) on the mean step in the thread's own processor time that only a catastrophe is
 * over: the report not as its schema says; players sent out of the world; what was asked for at
 * LOAD.eventAt not begun; a night run not dark all through; a war's turn that didn't come when it was waited for, or wasn't saved; no one in by a door, or a dungeon not made; the mean step over the ceiling. None, if it didn't (nor for an activity
 * that isn't built: there was no run). The navigation's cap isn't a failure: it's reported.
 */
export function failuresOf(report, { ceiling = Infinity } = {}) {
    const wrong = checkReport(report);

    if (wrong.length || !report.built) {
        return wrong;
    }

    return [
        ...(report.joined.players < report.run.players ? [`${report.run.players - report.joined.players} of the players never came in`] : []),
        ...report.problems.filter((problem) => /sent out of the world|didn't begin|couldn't be stood|wasn't dark|didn't come then|wasn't saved|no one got in|wasn't made in the run|no door off the street/.test(problem)),
        ...(report.steps.cpu.mean > ceiling ? [`the mean step took ${report.steps.cpu.mean.toFixed(1)} ms of the thread's time, over the ceiling of ${ceiling} ms`] : []),
    ];
}

/** A report as lines to read. */
export function wordsOf(report) {
    const { run } = report;
    const title = `${run.players} players, ${run.layout}, ${run.activity}, seed ${run.seed}`;

    if (!report.built) {
        return [`${title}: ${report.reason}`];
    }

    const { steps, passes, bytes, snapshot, memory, navigation, warm, counts, census } = report;
    const top = Object.entries(passes)
        .sort(([, a], [, b]) => b.ms - a.ms)
        .slice(0, 8);
    const parts = Object.entries(passes)
        .filter(([name]) => name.startsWith("battle."))
        .sort(([, a], [, b]) => b.ms - a.ms);
    const each = (name) => ((counts[name] ?? 0) / steps.count).toFixed(1);
    const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
    // (A step kept with its parts: its three longest passes)
    const partsIn = (step) =>
        Object.entries(step.passes)
            .slice(0, 3)
            .map(([name, ms]) => `${name} ${ms.toFixed(1)}`)
            .join(", ") + (step.made.chunks || step.made.tiles ? `; it made ${step.made.chunks} chunk${step.made.chunks === 1 ? "" : "s"} of ground and ${step.made.tiles} navigation tile${step.made.tiles === 1 ? "" : "s"}` : "");

    return [
        `${title}: ${steps.count} steps (${run.seconds} s of the world's time) in ${report.took.run} s, ${steps.speed} times as fast as it's played`,
        `A step by the clock: mean ${steps.wall.mean.toFixed(2)} ms, p99 ${steps.wall.p99.toFixed(2)} ms, worst ${steps.wall.worst.toFixed(1)} ms at ${((steps.wall.worstAt * STEP_MS) / 1000).toFixed(1)} s${steps.late ? `; ${steps.late} over ${STEP_MS} ms, ${steps.together} at most one after another` : ""}${steps.pace < 1 ? `; a world server would have played ${(steps.pace * 100).toFixed(1)}% of its clock's time` : ""}`,
        `In the thread's own processor time: mean ${steps.cpu.mean.toFixed(2)} ms, p99 ${steps.cpu.p99.toFixed(2)} ms, worst ${steps.cpu.worst.toFixed(1)} ms${steps.over ? `; ${steps.over} over ${STEP_MS} ms` : ""}`,
        `Of a step: what was heard ${report.parts.hear.toFixed(3)} ms, the step and what it sent ${report.parts.step.toFixed(3)} ms; made ahead between steps ${report.parts.ahead.toFixed(3)} ms. Named passes ${(report.named * 100).toFixed(1)}% of it`,
        `The passes that took most (ms a step): ${top.map(([name, { mean, share }]) => `${name} ${mean.toFixed(3)} (${(share * 100).toFixed(0)}%)`).join(", ")}`,
        `The battle's step: ${report.battle.mean.toFixed(3)} ms (${(report.battle.share * 100).toFixed(0)}%)${run.whole ? ", its passes timed whole" : ""}${report.battle.idling ? "" : ", the folk of buildings no one's in about their rounds as they were (--astir)"}${report.battle.peopling ? "" : ", buildings' people made as they're got ready, as they were (--peopled)"}; by its parts: ${parts.map(([name, { mean }]) => `${name.slice(7)} ${mean.toFixed(3)}`).join(", ")}`,
        `Its work a step: ${each("battle.actors")} in it (${BATTLE_KINDS.map((kind) => `${kind} ${each(`battle.actors.${kind}`)}`).join(", ")}), ${each("battle.idle")} of them standing with nowhere to go, ${each("battle.held")} held where no player is and ${each("battle.fallen")} down; ${each("battle.walkers")} walked, in ${each("battle.strides")} strides; ${each("battle.searches")} searches for the nearest enemy looked at ${each("battle.searchLooks")}, ${each("battle.fightAsks")} asked whether they're in a fight, ${each("battle.playerAsks")} whether a player's near, and ${each("battle.playerPairs")} players measured for those who ask; the index asked who's near ${each("battle.nears")} times, giving ${each("battle.nearFound")}; ${each("battle.sights")} sight lines; ${each("battle.paths")} ways found; the mesh asked ${each("battle.meshAsks")} times, and its last answer of where a walker stands given again ${each("battle.meshKept")}`,
        `Who's in the battle: ${Object.entries(census).map(([kind, { all, indoors, alone, m30, m60, m120, m250, beyond }]) => `${kind} ${all} (within 30 m of a player ${m30}, 60 m ${m60}, 120 m ${m120}, 250 m ${m250}, beyond ${beyond}; indoors ${indoors}, ${alone} with no player there)`).join("; ")}`,
        `Sent each player: ${kb(bytes.perPeer.mean)}/s (the busiest ${kb(bytes.perPeer.most)}/s, a worst second of ${kb(bytes.perPeer.worstSecond)}); by kind: ${Object.entries(bytes.byKind).map(([kind, sum]) => `${kind} ${kb(sum.bytes)} in ${sum.messages}`).join(", ")}`,
        `Heard: ${bytes.up.messages} messages, ${kb(bytes.up.bytes)}; ${bytes.up.refused} commands let go of for coming faster than ${bytes.up.allowed} a second`,
        `A snapshot: ${kb(snapshot.bytes)}, ${snapshot.take.toFixed(2)} ms to take, ${snapshot.encode.toFixed(2)} ms to write out (${snapshot.text.toFixed(2)} ms both together, written straight from the world); a welcome ${kb(report.joined.welcome.bytes.mean)}, ${report.joined.welcome.ms.mean.toFixed(1)} ms`,
        `Memory: heap ${memory.heap} MB (${memory.heapBefore} before, ${memory.heapMost} at most), external ${memory.external} MB, the process ${memory.rss} MB; ${report.actors.end} in the battle (${report.actors.most} at most)`,
        `Warm-up ${(warm.ms / 1000).toFixed(1)} s${warm.settled ? "" : ", not settled"}; navigation ${navigation.held} of ${navigation.keep} tiles, ${navigation.wanted} wanted round the players${navigation.capped ? `: over its cap, baked ahead ${navigation.reach} m round each, ${navigation.dropped} let go of during the run` : ""}`,
        ...(report.late.count
            ? [
                  `Late: ${report.late.count} step${report.late.count === 1 ? "" : "s"} over ${report.late.over} ms${report.late.count > report.late.kept.length ? `, the first ${report.late.kept.length} kept` : ""}: ${report.late.kept
                      .slice(0, 6)
                      .map((step) => `${(step.at / 1000).toFixed(2)} s ${step.wall.toFixed(1)} ms (${partsIn(step)})`)
                      .join("; ")}${report.late.kept.length > 6 ? "; the rest in the report" : ""}${report.late.longest && !report.late.kept.slice(0, 6).some(({ at }) => at === report.late.longest.at) ? `. The longest, at ${(report.late.longest.at / 1000).toFixed(2)} s: ${report.late.longest.wall.toFixed(1)} ms, what was heard ${report.late.longest.hear.toFixed(1)} of it (${partsIn(report.late.longest)})` : ""}`,
              ]
            : []),
        ...(report.leave
            ? [
                  `${report.leave.who === "all" ? "Everyone" : "Every other player"} gone at ${report.leave.at / 1000} s (${report.leave.left} left, ${report.leave.stayed} stayed)${report.leave.sudden ? ", let go as it was (--sudden)" : ""}: the ${report.leave.steps.count} steps after a mean of ${report.leave.steps.wall.mean.toFixed(2)} ms, p99 ${report.leave.steps.wall.p99.toFixed(2)}, worst ${report.leave.steps.wall.worst.toFixed(1)}, ${report.leave.steps.over} over ${LOAD.tick} ms${report.leave.before.count ? `; the ${report.leave.before.count} before, ${report.leave.before.wall.mean.toFixed(2)}, ${report.leave.before.wall.p99.toFixed(2)} and ${report.leave.before.wall.worst.toFixed(1)}, ${report.leave.before.over} over` : ""}${report.leave.going ? `. The going itself, their links closed in the hearing of the step at ${report.leave.at / 1000} s: ${report.leave.going.toFixed(1)} ms` : ""}`,
                  `The longest of them at ${(report.leave.longest.at / 1000).toFixed(2)} s, ${report.leave.longest.wall.toFixed(1)} ms (what was heard ${report.leave.longest.hear.toFixed(1)}; ${partsIn(report.leave.longest)}); let go in those steps: ${report.leave.let.characters} characters out of the battle in ${report.leave.let.forgets} goings through it, ${report.leave.let.buildings} buildings closed, ${report.leave.let.chunks} chunks of ground, ${report.leave.let.tiles} navigation tiles; the longest look between them ${report.leave.look.worst.toFixed(1)} ms`,
              ]
            : []),
        ...(report.event ? [`The ${report.event.type} at ${report.event.at / 1000} s: ${report.event.ok ? `begun (${report.event.actors} more in the battle)` : "not begun"}`] : []),
        ...(report.events ? [`At ${report.events[0].at / 1000} s: ${report.events.map((event) => `the ${event.type}, asked for by ${event.asked}, ${event.ok ? "begun" : "not begun"}`).join("; ")} (${report.events[0].actors} more in the battle for them all)`] : []),
        ...(report.night
            ? [`At night: minute ${report.night.from} to minute ${report.night.to} of the day's ${DAY.length / 60000}${report.night.dark ? "" : ", not dark all through"}, the war's turn ${report.night.turn}; the light to see by ${(passes.light?.mean ?? 0).toFixed(3)} ms a step, ${Math.round((report.counts["light.actors"] ?? 0) / steps.count)} gone through for torches and ${Math.round((report.counts["light.pairs"] ?? 0) / steps.count)} lights measured against players' places a step`]
            : []),
        ...(report.warturn
            ? [
                  `The war's turn ${report.warturn.turn.number} at ${report.warturn.turn.at / 1000} s: its step ${report.warturn.turn.wall.toFixed(1)} ms (${report.warturn.turn.cpu.toFixed(1)} of the thread's; the war's own pass ${report.warturn.turn.war.toFixed(1)}), the second before it a mean of ${report.warturn.round.before.mean.toFixed(2)} ms a step and ${report.warturn.round.before.worst.toFixed(1)} at worst; the longest of the steps before its save, ${report.warturn.between.after} after it, ${report.warturn.between.wall.toFixed(1)} ms (${report.warturn.between.cpu.toFixed(1)} of the thread's; ${report.warturn.between.pass} ${report.warturn.between.ms.toFixed(1)})`,
                  `Its save ${report.warturn.save.after} steps after: that step ${report.warturn.save.wall.toFixed(1)} ms (${report.warturn.save.cpu.toFixed(1)} of the thread's), ${report.warturn.save.text.toFixed(2)} of it writing the world out (${kb(report.warturn.save.bytes)}; gzipped off the step to ${kb(report.warturn.save.zipped)} in ${report.warturn.save.gzip.toFixed(1)} ms); the second after it a mean of ${report.warturn.round.after.mean.toFixed(2)} ms a step and ${report.warturn.round.after.worst.toFixed(1)} at worst. ${report.warturn.turns} turn${report.warturn.turns === 1 ? "" : "s"} in the run${report.warturn.all.slice(1).map((one) => `; turn ${one.number} at ${one.at / 1000} s: ${one.turn.toFixed(1)} ms, then ${one.between.toFixed(1)} at most, its save's ${one.save.toFixed(1)}`).join("")}`,
                  `Its ground${report.warturn.foreseen ? "" : ", none made ahead for a turn (--unforeseen)"}: ${report.warturn.all.map((one) => `turn ${one.number}, ${one.boxes} box${one.boxes === 1 ? "" : "es"} said to be wanted for what it would bring near and ${one.ahead} chunk${one.ahead === 1 ? "" : "s"} made ahead for them, ${one.chunks} made by the steps from it to its save`).join("; ")}`,
              ]
            : []),
        ...(report.joinstorm
            ? [
                  `The join storm at ${report.joinstorm.at / 1000} s: ${report.joinstorm.asked} said hello within ${report.joinstorm.over / 1000} s, let in ${report.joinstorm.welcomes} at a time, each ${report.joinstorm.loading / 1000} s making their copy: ${report.joinstorm.welcomed} let in${report.joinstorm.done < 0 ? `, ${report.joinstorm.waiting} still waiting` : `, the last ${report.joinstorm.done / 1000} s into the run`} (they'd waited ${(report.joinstorm.lastWaited / 1000).toFixed(1)} s; the middle one ${(report.joinstorm.waits.p50 / 1000).toFixed(1)} s); ${report.joinstorm.queued} tellings of a place in the line, ${report.joinstorm.snapshots} takings of the world`,
                  `Its ${report.joinstorm.steps.count} steps by the clock: mean ${report.joinstorm.steps.wall.mean.toFixed(2)} ms, p99 ${report.joinstorm.steps.wall.p99.toFixed(2)} ms, worst ${report.joinstorm.steps.wall.worst.toFixed(1)} ms (in the thread's time ${report.joinstorm.steps.cpu.mean.toFixed(2)}, ${report.joinstorm.steps.cpu.p99.toFixed(2)} and ${report.joinstorm.steps.cpu.worst.toFixed(1)}); ${report.joinstorm.steps.over} over ${LOAD.tick} ms, ${report.joinstorm.steps.letting} of them only for the letting in. The letting in alone: mean ${report.joinstorm.admit.mean.toFixed(2)} ms a step, p99 ${report.joinstorm.admit.p99.toFixed(2)}, worst ${report.joinstorm.admit.worst.toFixed(1)}; the longest step, at ${report.joinstorm.longest.at / 1000} s, ${report.joinstorm.longest.wall.toFixed(1)} ms: letting in ${report.joinstorm.longest.admit.toFixed(1)}, ${report.joinstorm.longest.pass} ${report.joinstorm.longest.ms.toFixed(1)}`,
                  `Made from the first hello on${report.joinstorm.ground.ahead ? "" : " (nothing made ahead for those waiting, nor waited for: --cold)"}: ${report.joinstorm.ground.steps.chunks} chunks of ground and ${report.joinstorm.ground.steps.tiles} navigation tiles inside steps, ${report.joinstorm.ground.between.chunks} and ${report.joinstorm.ground.between.tiles} ahead of them, between steps`,
              ]
            : []),
        ...(report.dungeons
            ? [
                  `Doors, from ${report.dungeons.at / 1000} s, a party every ${report.dungeons.stagger / 1000} s: ${report.dungeons.parties} parties at ${report.dungeons.doors.dungeons} dungeons and ${report.dungeons.doors.buildings} buildings; ${report.dungeons.entered} got in, ${report.dungeons.inside.most} inside at most, ${report.dungeons.inside.end} at the end, ${report.dungeons.inside.fallen} fallen`,
                  `Made in the run: ${report.dungeons.made.dungeons} dungeons (${report.dungeons.made.levels} levels) and ${report.dungeons.made.buildings} buildings. The longest step of a dungeon's coming: a mean of ${report.dungeons.coming.dungeon.wall.mean.toFixed(1)} ms, worst ${report.dungeons.coming.dungeon.wall.worst.toFixed(1)} (in the thread's time ${report.dungeons.coming.dungeon.cpu.mean.toFixed(1)} and ${report.dungeons.coming.dungeon.cpu.worst.toFixed(1)}); of a building's ${report.dungeons.coming.building.wall.mean.toFixed(1)} and ${report.dungeons.coming.building.wall.worst.toFixed(1)}; the longest of all a ${report.dungeons.coming.longest.door}'s, ${report.dungeons.coming.longest.after / 1000} s after its party came: ${report.dungeons.coming.longest.wall.toFixed(1)} ms, ${report.dungeons.coming.longest.pass} ${report.dungeons.coming.longest.ms.toFixed(1)} of it`,
                  `${report.dungeons.ahead.floors ? `${report.dungeons.ahead.made} of the dungeons' floors made ahead, between steps` : report.dungeons.ahead.levels ? "The dungeons' levels worked out ahead, their floors made in the steps (--undelved)" : "Nothing of the dungeons made ahead (--cold)"}; ${report.dungeons.ahead.baked} tiles of their levels' navigation baked inside steps`,
                  `The ${report.dungeons.steps.count} steps with anyone inside: mean ${report.dungeons.steps.wall.mean.toFixed(2)} ms, p99 ${report.dungeons.steps.wall.p99.toFixed(2)}, worst ${report.dungeons.steps.wall.worst.toFixed(1)} (in the thread's time ${report.dungeons.steps.cpu.mean.toFixed(2)}, ${report.dungeons.steps.cpu.p99.toFixed(2)} and ${report.dungeons.steps.cpu.worst.toFixed(1)}), ${report.dungeons.steps.over} over ${LOAD.tick} ms, the longest at ${report.dungeons.steps.longest.at / 1000} s, ${report.dungeons.steps.longest.pass} ${report.dungeons.steps.longest.ms.toFixed(1)} of it; the ${report.dungeons.before.count} before anyone came to a door: mean ${report.dungeons.before.wall.mean.toFixed(2)} ms, p99 ${report.dungeons.before.wall.p99.toFixed(2)}`,
              ]
            : []),
        ...report.problems.map((problem) => `Note: ${problem}`),
    ];
}

/**
 * Stage 1's gate (generated/multiplayer_scaling_plan.md, Stage 1's goal): its runs, each on every
 * one of `seeds` for `seconds`, and the numbers each is set against. `mean` and `p99` are the
 * most a step may take by the clock (ms); `together` the most steps over LOAD.tick one straight
 * after another; `pace` the least of its clock's time the world may have played (the gate's
 * "dilation"); `worse`, for the regression, how far above the baseline's mean a run's may be.
 */
export const GATE = Object.freeze({
    seconds: 120,
    seeds: LOAD.seeds,
    lines: Object.freeze([
        Object.freeze({ name: "walk", title: "Walk, 100 spread", players: 100, layout: "spread", activity: "walk", mean: 20, p99: 50, together: 3, pace: 0.99 }),
        Object.freeze({ name: "mixed", title: "Mixed, 100 spread: five 6-a-side fights, one invasion and night", players: 100, layout: "spread", activity: "fights,invasion,night", mean: 25, p99: 50, together: 3, pace: 0.99 }),
        Object.freeze({ name: "regression", title: "Regression, 8 spread", players: 8, layout: "spread", activity: "walk", worse: 0.1 }),
    ]),
});

/** The gate's runs, in the order they're played: [{ line (of GATE.lines), seed, options (load's) }]. */
export function gateRuns({ seconds = GATE.seconds } = {}) {
    return GATE.lines.flatMap((line) => GATE.seeds.map((seed) => ({ line, seed, options: { seed, players: line.players, layout: line.layout, activity: line.activity, seconds } })));
}

/**
 * One of the gate's runs set against its line's numbers: { line (its name), title, seed, mean,
 * p99, worst (ms, by the clock), late (steps over LOAD.tick), together, pace, battle (the
 * battle's step, ms), snapshot (ms to take the world), baseline (the mean it's held to, or null),
 * missed (why it isn't met, a line each: none, it's met), judged (false: a regression run with no
 * baseline, which is only reported) }. A run that went wrong in a way that's the same on any
 * machine (failuresOf) has missed for that too. `baseline` is the mean (ms) of the same run in a
 * gate's report kept from before, for a line with `worse`.
 */
export function judgeGate(line, report, { baseline = null } = {}) {
    const { steps } = report;
    const missed = [...failuresOf(report)];
    const over = (value, most, what) => (value > most ? [`${what} ${value.toFixed(2)} ms, over ${most}`] : []);

    if (!report.warm.settled) {
        missed.push("what's round the players wasn't all made before the run");
    }

    if (line.mean !== undefined) {
        missed.push(...over(steps.wall.mean, line.mean, "mean"), ...over(steps.wall.p99, line.p99, "p99"));

        if (steps.together > line.together) {
            missed.push(`${steps.together} steps over ${LOAD.tick} ms one after another, more than ${line.together}`);
        }

        if (steps.pace < line.pace) {
            missed.push(`pace ${steps.pace}, under ${line.pace}`);
        }
    } else if (baseline !== null && steps.wall.mean > baseline * (1 + line.worse)) {
        missed.push(`mean ${steps.wall.mean.toFixed(2)} ms, more than ${line.worse * 100}% over the baseline's ${baseline.toFixed(2)}`);
    }

    return {
        line: line.name,
        title: line.title,
        seed: report.run.seed,
        mean: steps.wall.mean,
        p99: steps.wall.p99,
        worst: steps.wall.worst,
        late: report.late.count,
        together: steps.together,
        pace: steps.pace,
        battle: report.battle.mean,
        snapshot: report.snapshot.take,
        baseline,
        missed,
        judged: line.mean !== undefined || baseline !== null,
    };
}

/**
 * The gate's rows (judgeGate's) as the table the plan commits, in Markdown, a line each: what
 * each run is held to, its numbers, and whether it met them. `machine` is where it was run (a
 * report's `run`: node, platform, arch, cpus) and `seconds` how long each played: a table of
 * runs shorter or longer than the gate's says so, and calls none met.
 */
export function gateTable(rows, { machine = null, seconds = GATE.seconds } = {}) {
    const real = seconds === GATE.seconds;
    const target = (row) => {
        const line = GATE.lines.find(({ name }) => name === row.line);

        return line.mean !== undefined ? `mean ≤ ${line.mean} ms, p99 ≤ ${line.p99} ms, ≤ ${line.together} over ${LOAD.tick} ms together, pace ≥ ${line.pace}` : row.baseline === null ? "no baseline given: reported" : `mean ≤ ${(row.baseline * (1 + line.worse)).toFixed(2)} ms (the baseline's ${row.baseline.toFixed(2)} and ${line.worse * 100}%)`;
    };
    const verdict = (row) => (row.missed.length ? `Missed: ${row.missed.join("; ")}` : !row.judged ? "Reported" : real ? "Met" : "Within them, in a run that isn't the gate's");

    return [
        `Stage 1's gate, \`npm run load -- --gate\`: ${seconds} s a run${real ? "" : ` (not the gate's ${GATE.seconds} s: nothing here is the gate's verdict)`}, by the clock${machine ? `, on Node ${machine.node.replace(/^v/, "")}, ${machine.platform} ${machine.arch}, ${machine.cpus} cores` : ""}.`,
        "",
        `| The gate's line | Seed | Held to | Mean (ms) | p99 (ms) | Worst (ms) | Steps over ${LOAD.tick} ms | Most one after another | Pace | The battle's step (ms) | A snapshot taken (ms) | Verdict |`,
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
        ...rows.map((row) => `| ${row.title} | ${row.seed} | ${target(row)} | ${row.mean.toFixed(2)} | ${row.p99.toFixed(2)} | ${row.worst.toFixed(1)} | ${row.late} | ${row.together} | ${row.pace} | ${row.battle.toFixed(2)} | ${row.snapshot.toFixed(1)} | ${verdict(row)} |`),
    ];
}

/**
 * Stage 1's gate played: each of its runs by `play` (given load's options and the run's name,
 * resolving to its report: the script's own plays each in a process of its own), one after
 * another, each judged. `baseline` is a gate's report kept from before ({ rows }), for the
 * regression; `log` is told how it's going. Resolves to { schema, gate (whether these are the
 * gate's own runs: its seconds), seconds, machine, rows (judgeGate's), late ({ run's name: its
 * report's `late` }: how many steps of each run were late, the first of them and the longest
 * with their parts), table (gateTable's
 * lines), met (every line judged and none missed, in the gate's own runs), failed (any line
 * missed) }.
 */
export async function gate({ seconds = GATE.seconds, baseline = null, play, log = () => {} } = {}) {
    const rows = [];
    const late = {};
    let machine = null;

    for (const { line, seed, options } of gateRuns({ seconds })) {
        const name = `${line.players}-${line.layout}-${line.activity.replaceAll(",", "-")}-seed-${seed}`;

        log(`${line.title}, seed ${seed}...`);

        const report = await play(options, name);
        const before = baseline?.rows?.find((row) => row.line === line.name && row.seed === seed)?.mean;
        const row = judgeGate(line, report, { baseline: line.worse !== undefined && Number.isFinite(before) ? before : null });

        machine ??= report.run;
        rows.push(row);
        late[name] = report.late;
        log(`  mean ${row.mean.toFixed(2)} ms, p99 ${row.p99.toFixed(2)} ms, ${row.late} over ${LOAD.tick} ms (${row.together} together), pace ${row.pace}${row.missed.length ? `: ${row.missed.join("; ")}` : ""}`);

        // (And its longest step named: what was heard in it, the passes that took most of it, and what it made)
        if (report.late.longest) {
            const { at, wall: took, hear: heard, passes: spent, made } = report.late.longest;

            log(`  the longest step, at ${(at / 1000).toFixed(2)} s: ${took.toFixed(1)} ms, what was heard ${heard.toFixed(1)} of it; ${Object.entries(spent).slice(0, 3).map(([pass, ms]) => `${pass} ${ms.toFixed(1)}`).join(", ")}; it made ${made.chunks} chunks of ground and ${made.tiles} navigation tiles`);
        }
    }

    const real = seconds === GATE.seconds;
    const failed = rows.some((row) => row.missed.length > 0);

    return {
        schema: LOAD.schema,
        gate: real,
        seconds,
        machine: machine && { node: machine.node, platform: machine.platform, arch: machine.arch, cpus: machine.cpus },
        rows,
        late,
        table: gateTable(rows, { machine, seconds }),
        met: real && !failed && rows.every((row) => row.judged),
        failed,
    };
}

// One run of the gate's, in a process of its own (a world of 100 holds a gigabyte and more, and
// what Recast holds isn't given back while a process lives): its report, read back from where
// the run wrote it
function playApart(options, file) {
    const given = ["--seed", options.seed, "--players", options.players, "--layout", options.layout, "--activity", options.activity, "--seconds", options.seconds, "--out", file, "--json"].map(String);

    return new Promise((resolve, reject) => {
        execFile(process.execPath, [fileURLToPath(import.meta.url), ...given], { maxBuffer: 2 ** 28 }, (error, _out, said) => {
            if (error) {
                reject(new Error(`A run of the gate's couldn't be made (${given.join(" ")}): ${String(said).trim() || error.message}`));
            } else {
                readFile(file, "utf8").then((text) => resolve(JSON.parse(text)), reject);
            }
        });
    });
}

async function main() {
    const { values } = parseArgs({
        options: {
            seed: { type: "string", default: "2" },
            players: { type: "string", default: "8" },
            layout: { type: "string", default: "spread" },
            activity: { type: "string", default: "walk" },
            seconds: { type: "string", default: String(LOAD.seconds) },
            turns: { type: "string", default: "0" },
            out: { type: "string", default: REPORT },
            ceiling: { type: "string" },
            json: { type: "boolean", default: false },
            whole: { type: "boolean", default: false },
            cold: { type: "boolean", default: false },
            unforeseen: { type: "boolean", default: false },
            undelved: { type: "boolean", default: false },
            leave: { type: "string", default: "none" },
            sudden: { type: "boolean", default: false },
            astir: { type: "boolean", default: false },
            peopled: { type: "boolean", default: false },
            gate: { type: "boolean", default: false },
            baseline: { type: "string" },
        },
    });
    let report;

    // (--gate: its runs, each in a process of its own; the table; and whether it's met)
    if (values.gate) {
        const out = path.resolve(values.out === REPORT ? path.join(path.dirname(REPORT), "gate.json") : values.out);
        const folder = path.join(path.dirname(out), "gate");
        let judged;

        try {
            const baseline = values.baseline === undefined ? null : JSON.parse(await readFile(path.resolve(values.baseline), "utf8"));
            // (--seconds given: a look at what it prints, not the gate)
            const seconds = process.argv.includes("--seconds") || process.argv.some((given) => given.startsWith("--seconds=")) ? Number(values.seconds) : GATE.seconds;

            await mkdir(folder, { recursive: true });
            judged = await gate({ seconds, baseline, play: (options, name) => playApart(options, path.join(folder, `${name}.json`)), log: values.json ? () => {} : console.log });
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }

        await writeFile(out, JSON.stringify(judged, null, 2));
        console.log(values.json ? JSON.stringify(judged, null, 2) : ["", ...judged.table, "", judged.gate ? (judged.met ? "The gate is met." : judged.failed ? "The gate is not met." : "No line missed, but the regression had no baseline to be held to (--baseline): the gate isn't called.") : `Not the gate: its runs are ${GATE.seconds} s.`].join("\n"));

        if (judged.failed) {
            process.exitCode = 1;
        }

        return;
    }

    try {
        report = await load({ seed: Number(values.seed), players: Number(values.players), layout: values.layout, activity: values.activity, seconds: Number(values.seconds), whole: values.whole, cold: values.cold, unforeseen: values.unforeseen, undelved: values.undelved, leave: values.leave, sudden: values.sudden, astir: values.astir, peopled: values.peopled, turns: Number(values.turns), log: values.json ? () => {} : console.log });
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    await mkdir(path.dirname(path.resolve(values.out)), { recursive: true });
    await writeFile(path.resolve(values.out), JSON.stringify(report, null, 2));
    console.log(values.json ? JSON.stringify(report, null, 2) : wordsOf(report).join("\n"));

    if (values.ceiling !== undefined) {
        const failures = failuresOf(report, { ceiling: Number(values.ceiling) });

        if (failures.length) {
            console.error(`Failed:\n${failures.map((why) => `  ${why}`).join("\n")}`);
            process.exitCode = 1;
        }
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
