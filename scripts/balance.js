// The balance runner (docs/WILDS.md *Tuning it*): the world's rules alone, nothing drawn, sides
// of each make-up set against the wild as it'd answer them, at a tier of land, fight after fight,
// and what each fight cost them:
//
//     npm run balance                           # every side, at tiers 2, 5 and 8
//     npm run balance -- --tiers 5              # only at these tiers
//     npm run balance -- --sides solo,four      # only these sides (SIDES)
//     npm run balance -- --fights 6             # how many fights each (4, else)
//     npm run balance -- --json                 # the numbers as JSON, not a table
//
// Each side's players are as strong for the tier as its creatures are (their hit points and power
// × creatures.js tierPower), and as hardy as their gear and skills would make them (hit points ×
// RUN.hardy), out in the wilds where the land's of that tier from their home, and
// go at the nearest of the wild's that's about, each fight, till none's left near them. For each
// side and tier it says how strong the side was (S, and the opposition F against it), how many
// foes came a fight, how long a fight went on, the hit points each player lost in one, and how
// often a player fell; and, beside one player alone at the tier, the share of what one alone
// loses that each of them does (the aim: about 0.75 for four together).
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
 * creatures it's called.
 */
export const SIDES = Object.freeze({
    solo: { players: 1 },
    pair: { players: 2 },
    four: { players: 4 },
    hirelings: { players: 1, hirelings: 4 },
    summoner: { players: 1, summons: 5 },
});

/** The tiers of land they're set at, unless told otherwise. */
export const TIERS_RUN = Object.freeze([2, 5, 8]);

/**
 * How a run goes: how long it waits for foes to come (s), how long a fight's let go on at most (s),
 * how near to the side foes are fought (m), how far apart each fight's ground is (m: past the
 * ground a fight cleared, host.js WILDS.cleared), and how much hardier than their tier's creatures
 * its players are (their hit points: what their gear and skills would make them, which a
 * creature's tier doesn't count).
 */
export const RUN = Object.freeze({ wait: 90, most: 240, near: 70, apart: 220, hardy: 3 });

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

// Someone made `times` as strong as they are: hit points and power
function strengthen(actor, times) {
    actor.maxHp = Math.round(actor.maxHp * times);
    actor.hp = actor.maxHp;
    actor.power = Object.fromEntries(Object.entries(actor.power ?? { melee: 1, ranged: 1, spell: 1 }).map(([kind, power]) => [kind, power * times]));
}

/**
 * A side (SIDES) against the wild at a tier of land, `fights` times over (fresh ground each
 * time): { side, tier, strength, opposition, fights: [{ foes, seconds, taken (each player's lost
 * hit points, on average), falls }] }. On the world of `seed`.
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

    for (const id of players) {
        const actor = host.battle.actor(id);

        strengthen(actor, tierPower(tier));
        actor.maxHp = actor.hp = Math.round(actor.maxHp * RUN.hardy);
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
            advance(host, 2000);
        }
    }

    const allies = () => [...host.followers.keys(), ...host.companions.keys()].filter((id) => host.battle.actor(id) && !host.battle.actor(id).dead);
    const { strength, opposition } = host.strengthOf(players[0]);
    const foes = () => [...host.wild.keys()].filter((id) => !host.companions.has(id)).map((id) => host.battle.actor(id)).filter((actor) => actor && !actor.dead && actor.map === "town" && hypot(actor.x - lead.x, actor.y - lead.y) <= RUN.near);
    const report = { side: name, tier, strength, opposition, fights: [] };

    for (let f = 0; f < fights; f++) {
        stand(host, [...players, ...allies()], grounds[f]);

        for (const id of players) {
            Object.assign(host.battle.actor(id), { hp: host.battle.actor(id).maxHp, dead: false });
        }

        // (Till the wild comes)
        for (let s = 0; s < RUN.wait && !foes().length; s++) {
            advance(host, 1000);
        }

        const met = new Set();
        const taken = new Map(players.map((id) => [id, 0]));
        let [seconds, falls] = [0, 0];

        // (Each player at the nearest of them, till none's left near)
        while (foes().length && seconds < RUN.most) {
            for (const id of players) {
                const actor = host.battle.actor(id);
                const target = host.battle.actor(actor.target);
                const near = foes().sort((a, b) => hypot(a.x - actor.x, a.y - actor.y) - hypot(b.x - actor.x, b.y - actor.y))[0];

                if (near && (!target || target.dead)) {
                    host.command(id, { type: "engage", target: near.id });
                }
            }

            foes().forEach(({ id }) => met.add(id));

            for (const event of advance(host, 1000)) {
                if (event.type === "hit" && taken.has(event.id) && !players.includes(event.by)) {
                    taken.set(event.id, taken.get(event.id) + (event.damage ?? 0));
                }

                // (A player fallen: counted, and up again where they fell, to go on)
                if (event.type === "death" && taken.has(event.id)) {
                    falls++;
                    Object.assign(host.battle.actor(event.id), { dead: false, hp: host.battle.actor(event.id).maxHp, respawnAt: Infinity });
                }
            }

            seconds++;
        }

        report.fights.push({ foes: met.size, seconds, taken: [...taken.values()].reduce((sum, each) => sum + each, 0) / players.length, falls });
    }

    return report;
}

// The world's rules let run `ms`: the events of it
function advance(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

/** A run's fights summed up: { foes, seconds, taken, falls } on average, a fight. */
export function summary({ fights }) {
    const mean = (key) => fights.reduce((sum, fight) => sum + fight[key], 0) / Math.max(1, fights.length);

    return { foes: mean("foes"), seconds: mean("seconds"), taken: mean("taken"), falls: mean("falls") };
}

function main() {
    const args = process.argv.slice(2);
    const option = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
    const tiers = option("--tiers")?.split(",").map(Number) ?? TIERS_RUN;
    const sides = option("--sides")?.split(",") ?? Object.keys(SIDES);
    const fights = Number(option("--fights") ?? 4);
    const rows = [];

    for (const tier of tiers) {
        const alone = sides.includes("solo") ? null : summary(balance("solo", tier, { fights }));

        for (const name of sides) {
            const report = balance(name, tier, { fights });
            const mean = summary(report);
            const solo = name === "solo" ? mean : (alone ?? rows.find((row) => row.tier === tier && row.side === "solo"));

            rows.push({ side: name, tier, S: report.strength, F: report.opposition, ...mean, share: solo?.taken ? mean.taken / solo.taken : null });
        }
    }

    if (args.includes("--json")) {
        console.log(JSON.stringify(rows, null, 2));
        return;
    }

    const fixed = (value, places = 2) => (value === null ? "—" : value.toFixed(places));

    console.log("side       tier     S     F   foes  seconds   taken  falls  share");

    for (const row of rows) {
        console.log(`${row.side.padEnd(10)} ${String(row.tier).padStart(4)} ${fixed(row.S).padStart(5)} ${fixed(row.F).padStart(5)} ${fixed(row.foes, 1).padStart(6)} ${fixed(row.seconds, 0).padStart(8)} ${fixed(row.taken, 0).padStart(7)} ${fixed(row.falls).padStart(6)} ${fixed(row.share).padStart(6)}`);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    main();
}
