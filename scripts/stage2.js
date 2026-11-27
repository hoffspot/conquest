// Stage 2's exit scenario for the world server's soak (generated/multiplayer_scaling_plan.md 2-35;
// scripts/server-soak.js `--scenario stage2`): what eight players do in a `shared` world for the
// stage's gate, and what's asked of the world's rules while they do.
//
// The players come in as humans, in the humans' town, and play as the soak's bots do (core/bot.js:
// they roam, start fights and go for foes). Over that, each plays its part here (Stage2Play):
//
//   - two parties of four: the first of each four asks the other three, who say yes;
//   - an invasion of their town, called by the first party's leader (the debug command, theirs
//     as owners);
//   - a hell rift torn open by them, called by the second party's leader;
//   - a dungeon: everyone makes for the dungeon nearest the town and goes in, each party into a
//     run of its own (the rule `instances`).
//
// And each, on its own copy of the world, asks every couple of seconds whether the rules hold
// (ruleFaults), and of everything its copy hears, whether a bystander was paid (the rule `loot`):
//
//   - the director's things in any three cells by three never more than an area holds
//     (core/director.js areaCap, of everyone in the world: the most any area's cap can be);
//   - two runs of one dungeon share no floor, and no lane;
//   - no spoils of a foe given to a player who never struck it, nor had one of theirs strike it.
//
// The gate's other measures are the soak's own (the steps' 99th percentile each minute, memory
// an hour in, the world's pace) and one more judged here: the world sent again to a copy no more
// than once a player-hour.
//
// What a foe takes to kill, and what's found, are counted and reported, not judged: the plan
// asks for them "inside a band", and the band is the owner's to set from a first run.

import { AREA, areaCap } from "../client/js/core/director.js";

export const STAGE2 = Object.freeze({
    // How many to a party, and how often (ms) each looks at what's next and asks after the rules
    party: 4,
    every: 2000,
    // When (ms into its play) a leader first asks, and how long before the same's asked again
    // (core/host.js ASKING: a minute between repeats, and a moment over)
    invite: 5000,
    again: 62000,
    // When the invasion's called, the rift's torn open, and everyone sets off for the dungeon
    invade: 90000,
    rift: 240000,
    dungeon: 420000,
    // How near the dungeon's way in (m) they ask to go in, and how often (ms) they ask
    near: 30,
    enter: 10000,
    // The spoils that aren't a foe's: a chest's, a supply's, a convoy's
    chests: Object.freeze(["chest", "supply", "convoy"]),
    // How long (ms) who struck a foe is kept after it's fallen
    kept: 300000,
    // How often the world may be sent again to a copy: so many a player-hour (and one a run)
    resyncs: 1,
});

const cellOf = (value) => Math.floor(value / AREA.cell);

/**
 * Where the rules of a `shared` world don't hold in a world as it stands (a Host, or a copy of
 * one): a line each, none if they do. The director's things in three cells by three, against an
 * area's cap for everyone in the world (the rule `director`: "area"); and each dungeon's runs,
 * no two with a floor or a lane in common (the rule `instances`: "party").
 */
export function ruleFaults(host) {
    const faults = [];

    if (host.rules.director === "area") {
        const things = [
            ...[...(host.caches?.values() ?? [])].filter((cache) => !cache.opened && !cache.treasure).map(({ at }) => at),
            ...[host.finds, host.strangers, host.obstacles].flatMap((kept) => [...(kept?.values() ?? [])].map(({ at }) => at)),
            ...[...(host.ambushes?.values() ?? [])].filter(({ sprung }) => !sprung).map(({ heart }) => heart),
        ].filter(Boolean);
        const held = new Map();
        const most = areaCap(host.players.size);

        for (const [x, y] of things) {
            const key = `${cellOf(x)},${cellOf(y)}`;

            held.set(key, (held.get(key) ?? 0) + 1);
        }

        // (Every block of three by three with any of them in it: by its middle cell)
        const middles = new Set([...held.keys()].flatMap((key) => {
            const [cx, cy] = key.split(",").map(Number);

            return [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => `${cx + dx},${cy + dy}`));
        }));

        for (const middle of middles) {
            const [mx, my] = middle.split(",").map(Number);
            let count = 0;

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    count += held.get(`${mx + dx},${my + dy}`) ?? 0;
                }
            }

            if (count > most) {
                faults.push(`${count} of the director's things round cell ${middle}, where an area holds ${most} at the most`);
            }
        }
    }

    if (host.rules.instances === "party") {
        const runs = [...(host.runs?.values() ?? [])];

        for (let a = 0; a < runs.length; a++) {
            for (let b = a + 1; b < runs.length; b++) {
                if (runs[a].site !== runs[b].site) {
                    continue;
                }

                const [one, two] = [runs[a], runs[b]].map((run) => host.world.interiors?.buildings.get(`site:${run.id}`)?.maps ?? []);
                const shared = one.filter((map) => two.includes(map));

                if (shared.length) {
                    faults.push(`runs ${runs[a].id} and ${runs[b].id} share ${shared.length} floor(s): ${shared[0]}`);
                }

                if (runs[a].lane !== undefined && runs[a].lane === runs[b].lane) {
                    faults.push(`runs ${runs[a].id} and ${runs[b].id} are made in one lane (${runs[a].lane})`);
                }
            }
        }
    }

    return faults;
}

/** The middle of some numbers (0, of none). */
export function median(values) {
    const sorted = [...values].sort((a, b) => a - b);

    return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2 : 0;
}

/**
 * One player's part in the scenario, over a bot's play (core/bot.js Bot, which keeps its copy of
 * the world and tells this what its copy hears: `onEvents`).
 */
export class Stage2Play {
    /**
     * @param {object} joining - Its link to the world (core/netplay.js Joining).
     * @param {object} bot - The bot playing it (its `home` is where it roams about).
     * @param {object} part
     * @param {string} part.name - Its hero's name.
     * @param {string} part.leader - Its party's leader's name (its own, if it leads).
     * @param {string[]} part.mates - Its party's names, its own among them.
     * @param {number} part.party - Which party it's of (0, 1...).
     * @param {object} [timing] - As STAGE2.
     */
    constructor(joining, bot, { name, leader, mates, party }, timing = STAGE2) {
        Object.assign(this, { joining, bot, name, leader, mates, party, timing });
        this.time = 0;
        this.next = 0;
        this.asked = new Map();
        this.did = { invaded: false, rifted: false, delved: false };
        this.enterAt = 0;
        this.checks = 0;
        this.faults = new Set();
        // (Who struck whom: by the foe's id, { owners, first (ms), fallen (ms or null) })
        this.struck = new Map();
        this.kills = [];
        this.spoils = 0;
    }

    get host() {
        return this.joining.host;
    }

    #idOf(name) {
        for (const player of this.host.players.values()) {
            if (player.hero?.name === name) {
                return player.id;
            }
        }

        return null;
    }

    /** What its copy heard in a step (the bot's `onEvents`): who struck whom, who fell, who was paid. */
    hear(events) {
        const { host } = this;

        if (!host) {
            return;
        }

        for (const event of events) {
            if (event.type === "hit" && event.by) {
                const by = host.battle.actor(event.by);
                const owner = by?.kind === "player" ? by.id : (by?.leader ?? null);
                const kept = this.struck.get(event.id) ?? { owners: new Set(), first: this.time, fallen: null };

                if (owner) {
                    kept.owners.add(owner);
                }

                this.struck.set(event.id, kept);
            } else if (event.type === "death") {
                const kept = this.struck.get(event.id);

                if (kept && kept.fallen === null) {
                    kept.fallen = this.time;

                    if (host.battle.actor(event.id)?.kind !== "player") {
                        this.kills.push(kept.fallen - kept.first);
                    }
                }
            } else if (event.type === "spoils" && !event.given && event.creature && !this.timing.chests.includes(event.creature)) {
                this.spoils++;

                if (host.rules.loot === "tagged" && host.players.has(event.id) && !this.struck.get(event.from)?.owners.has(event.id)) {
                    this.faults.add(`${host.players.get(event.id)?.hero?.name ?? event.id} was given the spoils of a foe (${event.creature}) they never struck`);
                }
            }
        }
    }

    /** Time gone by (`ms`): what's next of its part, if it's due, and the rules asked after. */
    tick(ms) {
        const { host, timing } = this;

        this.time += ms;

        if (!host || this.time < this.next) {
            return;
        }

        this.next = this.time + timing.every;

        const me = this.joining.me;
        const actor = host.battle.actor(me);

        // (The rules, as its copy of the world stands)
        this.checks++;

        for (const fault of ruleFaults(host)) {
            this.faults.add(fault);
        }

        for (const [id, kept] of this.struck) {
            if (kept.fallen !== null && this.time - kept.fallen > timing.kept) {
                this.struck.delete(id);
            }
        }

        if (!actor || actor.dead) {
            return;
        }

        this.#party(me);

        const leads = this.name === this.leader;

        if (leads && this.party === 0 && !this.did.invaded && this.time >= timing.invade && actor.map === "town" && host.debugs(me)) {
            this.did.invaded = true;
            this.joining.command({ type: "invade" });
        }

        if (leads && this.party === 1 && !this.did.rifted && this.time >= timing.rift && actor.map === "town" && host.debugs(me)) {
            this.did.rifted = true;
            this.joining.command({ type: "hellrift" });
        }

        if (this.time >= timing.dungeon) {
            this.#delve(actor);
        }
    }

    // Its party: its leader asks each of the rest who's in none and isn't asked (no more than
    // once in ASKING's minute); the rest say yes to their leader's asking
    #party(me) {
        const { host, timing } = this;

        if (this.name !== this.leader) {
            const asked = host.invitation(me);

            if (asked && asked.from === this.#idOf(this.leader) && !host.partyFor(me)) {
                this.joining.command({ type: "party", do: "accept" });
            }

            return;
        }

        if (this.time < timing.invite) {
            return;
        }

        for (const name of this.mates) {
            const id = name === this.name ? null : this.#idOf(name);

            if (id && !host.partyFor(id) && !host.invitation(id) && this.time - (this.asked.get(id) ?? -Infinity) >= timing.again) {
                this.asked.set(id, this.time);
                this.joining.command({ type: "party", do: "invite", who: id });

                return;
            }
        }
    }

    // The dungeon nearest where it came in: roaming about its way in till it's near, then asked
    // to go in (now and then, till it has); inside, roaming where it stands
    #delve(actor) {
        const { host, timing, bot } = this;

        if (actor.map !== "town") {
            if (!this.did.delved || this.inside !== actor.map) {
                this.did.delved = this.did.delved || Boolean(host.world.maps[actor.map]?.dungeon);
                this.inside = actor.map;
                bot.home = [...actor.square];
            }

            return;
        }

        this.site ??= host.world.plan.sites
            .filter(({ kind }) => kind === "dungeon")
            .map((site) => ({ site, far: (site.at[0] - actor.x) ** 2 + (site.at[1] - actor.y) ** 2 }))
            .sort((a, b) => a.far - b.far || (a.site.id < b.site.id ? -1 : 1))[0]?.site;

        if (!this.site) {
            return;
        }

        const [x, y] = this.site.at;
        const door = host.world.interiors?.buildings.get(`site:${this.site.id}`)?.door;

        bot.home = [Math.floor(x), Math.floor(y)];

        if (door && (x - actor.x) ** 2 + (y - actor.y) ** 2 <= timing.near * timing.near && this.time >= this.enterAt) {
            this.enterAt = this.time + timing.enter;
            this.joining.command({ type: "enter", link: door.id, run: true });
        }
    }

    /** How its part went, as plain data. */
    report() {
        const { host } = this;
        const me = this.joining.me;

        return {
            party: host?.partyFor(me)?.members.length ?? 0,
            leads: this.name === this.leader,
            ...this.did,
            checks: this.checks,
            faults: [...this.faults],
            kills: this.kills.length,
            killMs: Math.round(median(this.kills)),
            spoils: this.spoils,
            runs: host ? [...(host.runs?.values() ?? [])].map(({ id, site }) => ({ id, site })) : [],
        };
    }
}

/**
 * What a run of the scenario's players came to (their reports' `stage2`, by name): how many were
 * in parties of `party`, whether the invasion and the rift were called and a dungeon gone into,
 * the rules' faults (each once), and what's reported, not judged; and `failures`, a line for
 * each thing the scenario was to do that it didn't in a run long enough for it (`minutes`), and
 * for each fault.
 */
export function judgeStage2(reports, { minutes, timing = STAGE2 } = {}) {
    const parts = reports.filter((report) => report.stage2).map((report) => ({ name: report.name, ...report.stage2 }));
    const faults = [...new Set(parts.flatMap(({ faults: each }) => each))];
    const ran = minutes * 60000;
    const failures = faults.map((fault) => `a rule broken: ${fault}`);
    const partied = parts.filter(({ party }) => party === timing.party).length;
    const did = (what) => parts.some((part) => part[what]);

    if (ran >= timing.invite + 3 * timing.again && partied < parts.length) {
        failures.push(`${parts.length - partied} of ${parts.length} players never came into a party of ${timing.party}`);
    }

    if (ran >= timing.invade + 60000 && !did("invaded")) {
        failures.push("the invasion was never called");
    }

    if (ran >= timing.rift + 60000 && !did("rifted")) {
        failures.push("the rift was never torn open");
    }

    // (The world sent again to a copy: no more than one a player-hour, the gate's)
    const resyncs = reports.reduce((sum, report) => sum + (report.stage2 ? (report.resyncs ?? 0) : 0), 0);
    const allowed = Math.max(1, Math.floor((parts.length * minutes * timing.resyncs) / 60));

    if (resyncs > allowed) {
        failures.push(`the world was sent again to a copy ${resyncs} times, where ${allowed} is the most for ${parts.length} players in ${minutes} minutes`);
    }

    // (Half an hour to walk there: twenty minutes' walk at the most, on seed 2)
    if (ran >= timing.dungeon + 30 * 60000 && !did("delved")) {
        failures.push("no one went into the dungeon");
    }

    return {
        players: parts.length,
        partied,
        invaded: did("invaded"),
        rifted: did("rifted"),
        delved: parts.filter(({ delved }) => delved).length,
        runs: Math.max(0, ...parts.map(({ runs }) => runs.length)),
        resyncs,
        checks: parts.reduce((sum, { checks }) => sum + checks, 0),
        faults,
        // (Reported, not judged: the middle of each player's own middle, and all they found)
        killMs: Math.round(median(parts.filter(({ kills }) => kills).map(({ killMs }) => killMs))),
        kills: Math.max(0, ...parts.map(({ kills }) => kills)),
        spoils: Math.max(0, ...parts.map(({ spoils }) => spoils)),
        failures,
    };
}
