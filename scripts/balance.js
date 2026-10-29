// The balance runner (docs/WILDS.md *Tuning it*): the world's rules alone, nothing drawn, sides
// of each make-up set against the wild as it'd answer them, at a tier of land, fight after fight,
// and what each fight cost them:
//
//     npm run balance                           # every side, at tiers 2, 5 and 8
//     npm run balance -- --tiers 5              # only at these tiers
//     npm run balance -- --sides solo,four      # only these sides (SIDES)
//     npm run balance -- --fights 6             # how many fights each (4, else)
//     npm run balance -- --seeds 2,3,4          # on each of these worlds (2, else), as one run
//     npm run balance -- --json                 # the numbers as JSON, not a table
//
// Each side's players are as strong for the tier as its creatures are (their hit points and power
// × creatures.js tierPower), and as hardy as their gear and skills would make them (hit points ×
// RUN.hardy), kept so through everything that outfits them again (a skill's rank come up), out in
// the wilds where the land's of that tier from their home. At each fight's ground they make camp
// first (as a player rests between fights: their hired adventurers' wounds mended), then run at
// the nearest of the wild's that's coming at them (else the nearest about), till none's left near
// them or none's come to blows with them a while (those left keeping away). A player who falls is
// out of that fight, as in play (they'd wake at home), and once they all have, it's lost. For
// each side and tier it says how strong the side was (S, and the opposition F against it), how
// many foes they fought a fight, how long a fight went on (to its last blow), the hit points each
// player lost in one (and a minute), how often a player fell and their allies were knocked down,
// and how many fights were won; and, beside one player alone at the tier, the share of what one
// alone loses that each of them does (the aims: SIDES `aim`). Fights go one way or another by
// what's about, so it takes a good many (`--fights`, on several worlds: `--seeds`) to say.
import { pathToFileURL } from "node:url";
import { STEP_MS } from "../client/js/core/battle.js";
import { clearOfSettlements, tierAt, tierPower } from "../client/js/core/creatures.js";
import { hypot } from "../client/js/core/exact.js";
import { capOf } from "../client/js/core/followers.js";
import { nearestFree, squareKey, squaresOf } from "../client/js/core/grid.js";
import { HOST_PLAYER, Host, WILDS } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { landAt } from "../client/js/core/worldplan/plan.js";

/**
 * The sides set against the wild: how many players, how many hired adventurers with the first
 * (warriors, each of the level a guild offers one as mighty as the tier: a level under the most
 * they could lead, core/followers.js capOf; docs/WAR.md *Mercenaries that grow*), how many
 * creatures it's called; and the share of what one alone loses that each of its players should
 * (`aim`: a side as strong as N alike, about N^-0.2, core/strength.js SCALING; four together about
 * three quarters, a player with four hired adventurers about four fifths).
 */
export const SIDES = Object.freeze({
    solo: { players: 1, aim: 1 },
    pair: { players: 2, aim: 0.87 },
    four: { players: 4, aim: 0.75 },
    hirelings: { players: 1, hirelings: 4, aim: 0.8 },
    summoner: { players: 1, summons: 5, aim: 0.8 },
});

/** The tiers of land they're set at, unless told otherwise. */
export const TIERS_RUN = Object.freeze([2, 5, 8]);

/**
 * How a run goes: how long it waits for foes to come (s), how long a fight's let go on at most (s),
 * how long it's over after the last blow struck by or at the side (s: those left about keeping
 * away from them, a wary beast that won't be caught), how near to the side foes are fought (m),
 * how far apart each fight's ground is (m: past the ground a fight cleared, host.js
 * WILDS.cleared), and how much hardier than their tier's creatures its players are (their hit
 * points: what their gear and skills would make them, which a creature's tier doesn't count).
 */
export const RUN = Object.freeze({ wait: 90, most: 240, quiet: 20, near: 70, apart: 220, hardy: 3 });

const HERO = Object.freeze({ shape: {}, look: {}, weapon: "sword", boots: false });

// Places out in the wilds where the land's of `tier` from the world's start (as its creatures
// have it: creatures.js tierAt), clear of the settlements, the roads and the water, `apart` metres
// from one another; `count` of them
function groundsAt(world, tier, count) {
    const plan = world.plan;
    const home = world.start.at;
    const grounds = [];

    for (let reach = 120; reach < 9000 && grounds.length < count; reach += 30) {
        for (let k = 0; k < 72 && grounds.length < count; k++) {
            const angle = (k / 72) * Math.PI * 2;
            const at = [home[0] + Math.cos(angle) * reach, home[1] + Math.sin(angle) * reach];
            const land = landAt(plan, ...at);

            if (land.water || tierAt(at, [home], land.biome) !== tier || !clearOfSettlements(plan, at, WILDS.clear + 20) || world.maps.town.nearRoad?.(...at, WILDS.road * 2)) {
                continue;
            }

            if (grounds.every((other) => hypot(other[0] - at[0], other[1] - at[1]) >= RUN.apart)) {
                grounds.push(at);
            }
        }
    }

    return grounds;
}

// Everyone of a side stood at a place, near one another, on free ground
function stand(host, ids, [x, y]) {
    const squares = squaresOf(host.world.maps.town);
    const taken = new Set(host.battle.actors.filter((each) => each.map === "town" && !ids.includes(each.id)).map(({ square: [sx, sy] }) => squareKey(sx, sy)));

    ids.forEach((id, k) => {
        const actor = host.battle.actor(id);
        const square = nearestFree(squares, [Math.floor(x) + (k % 3) * 2, Math.floor(y) + Math.floor(k / 3) * 2], { taken });

        taken.add(squareKey(...square));
        Object.assign(actor, { map: "town", square, x: square[0] + 0.5, y: square[1] + 0.5, path: [], order: null, target: null, attack: null, spawn: [...square] });
    });
}

// The players kept as strong for the tier as its creatures (hit points and power × `times`, hit
// points × RUN.hardy again), however often they're outfitted again from what they carry and know
// (host.js #outfit: a skill's rank come up), which once let go of it a little way into the first
// fight. A function to call after each step of the world's: each made so again if they were
// outfitted since, as hurt as they were
export function boosting(host, ids, times) {
    const kept = new Map();

    return () => {
        for (const id of ids) {
            const actor = host.battle.actor(id);

            if (!actor || actor.maxHp === kept.get(id)) {
                continue;
            }

            const share = actor.maxHp > 0 ? actor.hp / actor.maxHp : 1;

            actor.maxHp = Math.round(actor.maxHp * times * RUN.hardy);
            actor.hp = actor.dead ? 0 : Math.max(1, Math.round(actor.maxHp * share));
            actor.power = Object.fromEntries(Object.entries(actor.power ?? { melee: 1, ranged: 1, spell: 1 }).map(([kind, power]) => [kind, power * times]));
            kept.set(id, actor.maxHp);
        }
    };
}

/**
 * A side (SIDES) against the wild at a tier of land, `fights` times over (fresh ground each
 * time): { side, tier, strength, opposition, fights: [{ foes (fought), seconds (to the last blow),
 * taken (each player's lost hit points, on average), falls, knocked (their allies, down),
 * cleared (won: before RUN.most, a player standing), rested (camp made first) }] }. On the world
 * of `seed`.
 */
export function balance(name, tier, { fights = 4, seed = 2 } = {}) {
    const side = SIDES[name];
    const world = buildWorld({ seed });
    const host = new Host(world, { populate: false });
    const players = Array.from({ length: side.players }, (each, k) => (k ? `player-${k + 1}` : HOST_PLAYER));

    // (The first's hired adventurers with them as a character brings them: host.js #follow)
    const hirelings = Array.from({ length: side.hirelings ?? 0 }, (each, k) => ({ name: `Hireling ${k + 1}`, calling: "warrior", sex: "m", seed: k + 1, level: Math.max(1, capOf(tier) - 1) }));

    players.forEach((id, k) => host.join({ id, hero: { ...HERO, name: `Player ${k + 1}` }, followers: k ? [] : hirelings }));
    host.populate();
    Object.assign(host.battle.actor("orc") ?? {}, { dead: true, respawnAt: Infinity });

    const grounds = groundsAt(world, tier, fights);
    const lead = host.battle.actor(players[0]);

    if (grounds.length < fights) {
        throw new Error(`only ${grounds.length} grounds of tier ${tier} found for ${fights} fights`);
    }

    const keep = boosting(host, players, tierPower(tier));
    const play = (ms) => advance(host, ms, keep);

    keep();

    for (const id of players) {
        host.battle.actor(id).hp = host.battle.actor(id).maxHp;
    }

    stand(host, players, grounds[0]);

    // (Their hired adventurers by them, as strong as their level makes them)
    for (const id of host.followers.keys()) {
        Object.assign(host.battle.actor(id), { map: "town", square: [...lead.square], x: lead.x, y: lead.y, path: [], order: null, target: null, attack: null });
    }

    // (Creatures called to the first's side: Summon at its fullest)
    if (side.summons) {
        const progress = host.players.get(players[0]).progress;

        progress.learn("summon");
        progress.spellXp.summon = 1e6;

        for (let k = 0; k < side.summons; k++) {
            Object.assign(lead, { spellReadyAt: 0, spellsReadyAt: {} });
            host.command(players[0], { type: "cast", spell: "summon" });
            play(2000);
        }
    }

    const allies = () => [...host.followers.keys(), ...host.companions.keys()].filter((id) => host.battle.actor(id) && !host.battle.actor(id).dead);
    const standing = () => players.filter((id) => !host.battle.actor(id).dead);
    const { strength, opposition } = host.strengthOf(players[0]);
    const foes = () => [...host.wild.keys()].filter((id) => !host.companions.has(id)).map((id) => host.battle.actor(id)).filter((actor) => actor && !actor.dead && actor.map === "town" && hypot(actor.x - lead.x, actor.y - lead.y) <= RUN.near);
    const report = { side: name, tier, strength, opposition, fights: [] };

    for (let f = 0; f < fights; f++) {
        // (What's left of the wild about the last ground let go, as if walked away from: else it
        // goes after them all the way to the next, kilometres off)
        const side = new Set([...players, ...host.followers.keys(), ...host.companions.keys()]);

        for (const id of host.wild.keys()) {
            const actor = host.battle.actor(id);

            if (actor && !actor.dead && !host.companions.has(id) && (side.has(actor.target) || hypot(actor.x - lead.x, actor.y - lead.y) <= RUN.near * 2)) {
                Object.assign(actor, { dead: true, respawnAt: Infinity, target: null, attack: null, path: [] });
            }
        }

        // (Those knocked down brought along too, to be got up by the camp)
        stand(host, [...players, ...allies(), ...[...host.followers.keys()].filter((id) => host.battle.actor(id)?.downed)], grounds[f]);

        for (const id of players) {
            Object.assign(host.battle.actor(id), { hp: host.battle.actor(id).maxHp, dead: false });
        }

        // (Camp made first, as one rests between fights: whole again, their hired adventurers'
        // wounds mended; refused with the wild about already)
        const rested = players.filter((id) => host.command(id, { type: "camp", until: { hours: 1 } }).ok).length;

        // (Till the wild comes)
        for (let s = 0; s < RUN.wait && !foes().length; s++) {
            play(1000);
        }

        const met = new Set();
        const taken = new Map(players.map((id) => [id, 0]));
        let [seconds, falls, knocked, struck] = [0, 0, 0, 0];

        // (Each player running at the nearest of them coming at the side, else the nearest, till
        // none's left near, or none's come to blows with them for RUN.quiet; or till every one of
        // the players has fallen, the fight lost)
        while (standing().length && foes().length && seconds < RUN.most && seconds - struck < RUN.quiet) {
            const side = new Set([...players, ...allies()]);

            for (const id of standing()) {
                const actor = host.battle.actor(id);
                const target = host.battle.actor(actor.order?.type === "engage" ? actor.order.target : actor.target);
                const coming = foes().filter((foe) => side.has(foe.target));
                const near = (coming.length ? coming : foes()).sort((a, b) => hypot(a.x - actor.x, a.y - actor.y) - hypot(b.x - actor.x, b.y - actor.y))[0];

                if (near && (!target || target.dead)) {
                    host.command(id, { type: "engage", target: near.id, run: true });
                }
            }

            for (const event of play(1000)) {
                // (A blow struck by or at one of the side: the foe in it met)
                if (event.type === "hit" && event.by && side.has(event.id) !== side.has(event.by)) {
                    struck = seconds + 1;
                    met.add(side.has(event.id) ? event.by : event.id);
                }

                // (One of their own knocked down: counted)
                if (event.type === "death" && event.downed && host.followers.has(event.id)) {
                    knocked++;
                }

                if (event.type === "hit" && taken.has(event.id) && !players.includes(event.by)) {
                    taken.set(event.id, taken.get(event.id) + (event.damage ?? 0));
                }

                // (A player fallen: counted, and out of this fight, as in play, where they'd wake
                // at home)
                if (event.type === "death" && taken.has(event.id)) {
                    falls++;
                    host.battle.actor(event.id).respawnAt = Infinity;
                }
            }

            seconds++;
        }

        // (Its time to the last blow; won if it ended before RUN.most with a player standing)
        report.fights.push({ foes: met.size, seconds: struck, taken: [...taken.values()].reduce((sum, each) => sum + each, 0) / players.length, falls, knocked, cleared: seconds < RUN.most && standing().length > 0, rested: rested === players.length });
    }

    return report;
}

// The world's rules let run `ms`: the events of it (`keep`: what's to be done after each step)
function advance(host, ms, keep = () => {}) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
        keep();
    }

    return events;
}

/**
 * A run's fights summed up: { foes, seconds, taken, falls, knocked } on average, a fight; the hit
 * points each player lost a minute (`rate`: over all its fights' time); and how many of its fights
 * were won (`cleared`).
 */
export function summary({ fights }) {
    const mean = (key) => fights.reduce((sum, fight) => sum + (fight[key] ?? 0), 0) / Math.max(1, fights.length);
    const time = fights.reduce((sum, fight) => sum + fight.seconds, 0);

    return { foes: mean("foes"), seconds: mean("seconds"), taken: mean("taken"), rate: time ? (fights.reduce((sum, fight) => sum + fight.taken, 0) * 60) / time : 0, falls: mean("falls"), knocked: mean("knocked"), cleared: fights.filter((fight) => fight.cleared).length };
}

function main() {
    const args = process.argv.slice(2);
    const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
    const tiers = option("--tiers")?.split(",").map(Number) ?? TIERS_RUN;
    const sides = option("--sides")?.split(",") ?? Object.keys(SIDES);
    const fights = Number(option("--fights") ?? 4);
    const seeds = option("--seeds")?.split(",").map(Number) ?? [2];
    const rows = [];
    // (A side's fights on each of the worlds, as one run)
    const run = (name, tier) => {
        const reports = seeds.map((seed) => balance(name, tier, { fights, seed }));

        return { ...reports[0], fights: reports.flatMap((report) => report.fights) };
    };

    for (const tier of tiers) {
        const alone = sides.includes("solo") ? null : summary(run("solo", tier));

        for (const name of sides) {
            const report = run(name, tier);
            const mean = summary(report);
            const solo = name === "solo" ? mean : (alone ?? rows.find((row) => row.tier === tier && row.side === "solo"));

            rows.push({ side: name, tier, S: report.strength, F: report.opposition, ...mean, fights: report.fights.length, share: solo?.taken ? mean.taken / solo.taken : null, aim: SIDES[name].aim });
        }
    }

    if (args.includes("--json")) {
        console.log(JSON.stringify(rows, null, 2));
        return;
    }

    const fixed = (value, places = 2) => (value === null ? "—" : value.toFixed(places));

    console.log("side       tier     S     F   foes  seconds   taken  a min  falls  knocked  won    share    aim");

    for (const row of rows) {
        console.log(`${row.side.padEnd(10)} ${String(row.tier).padStart(4)} ${fixed(row.S).padStart(5)} ${fixed(row.F).padStart(5)} ${fixed(row.foes, 1).padStart(6)} ${fixed(row.seconds, 0).padStart(8)} ${fixed(row.taken, 0).padStart(7)} ${fixed(row.rate, 0).padStart(6)} ${fixed(row.falls).padStart(6)} ${fixed(row.knocked).padStart(8)} ${`${row.cleared}/${row.fights}`.padStart(4)} ${fixed(row.share).padStart(8)} ${fixed(row.aim).padStart(6)}`);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    main();
}
