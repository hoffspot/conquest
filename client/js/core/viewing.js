// A game's link to a replicated world (generated/multiplayer_scaling_plan.md 3-21): one it's
// sent views of and holds no copy of. Where a lockstep link (core/netplay.js Joining) is sent
// the whole world and every command anyone gives, and plays the host's steps itself, this is
// welcomed with its player's own record and a summary, and then sent a frame a step
// (core/view.js) of what's near its hero. It plays nothing.
//
// It's the link seam's second implementation (core/remote.js), so the game doesn't know which
// it has. What the game reads as its world is a Host that's never stepped (`world`: given by
// whoever makes the game), kept as the server says:
//
//   - its battle is the mirror's (core/mirror.js): those the frames tell of, where they tell;
//   - its player's own record is the welcome's, and what the frames say has changed of it;
//   - who those in sight are drawn as (the folk, soldiers, other players' heroes, a creature's
//     kind) is what the frames say as each comes into sight (core/viewfeed.js dressOf);
//   - a trade the player's in is kept from the events that tell of it;
//   - the invasions, what's burnt, hell's rifts, the legends, the rules, the war's camps,
//     depots and news, the battles on, and the director's props near its hero (what's on the
//     ground, campfires, caches and the rest) are the summary's too; a shot in flight is kept
//     from its event and flown here (the plan's 3-25);
//   - the parties, who's in the world, who's asked whom, where the player's own party is, and
//     the war's realms, towns, works, forces and forts are the summary's, put where the game
//     reads them (the plan's 3-24); what a talk or a shop needs is asked of the server (`ask`);
//   - the buildings and dungeons near its hero are got ready here as the world has them, from
//     its seed and what its summary says of each dungeon (Host.keepNear; the plan's 3-23): so
//     the hero goes through a door onto floors already made, and who's on them comes in the
//     frames, those of the map left let go of with the same frame.
//
// `step()` plays one frame, a step of the world's, into that: a few are kept in hand so they
// go by evenly however they come (the same pacing a lockstep link has), and the game draws
// everyone between one step's places and the next's, as it does a copy's. Its own hero is looked
// ahead as a lockstep game's is (app/forecast.js; the plan's 3-22): from what each frame says of
// them and of the world's time as it comes, over the mirror's battle.
//
// Not yet (each a later slice's): the rest of the world's summary put where the game reads it
// (the war's camps and news, props: 3-25: a dungeon's chests among them),
// a dungeon's sealed rooms, and being hidden and shown again or coming back in while inside
// (3-26). Pure: no DOM, no network of its own.

import { STEP_MS } from "./battle.js";
import { Host } from "./host.js";
import { Mirror } from "./mirror.js";
import { Joining, NET_VERSION, PACE } from "./netplay.js";
import { Legends } from "./rare.js";
import { PROPS } from "./summary.js";
import { decodeFrame } from "./view.js";
import { VIEW_MODE } from "./viewfeed.js";
import { decode, encode } from "./wire.js";

/**
 * How many of the latest frames' comings the steps kept in hand are reckoned from; the share of
 * them that came no later than that allows for; and the fewest and most steps kept in hand.
 */
export const VIEWING = Object.freeze({ kept: 60, late: 0.95, least: 2, most: 8 });

// How far a shot kept here flies at the most before it's let go of (m): one the world never
// said the end of
const FLIES = 200;

// What one not in sight wears and wields, as far as the game's told: nothing
const UNSEEN = Object.freeze({ worn: () => [], wielded: () => null });

/** How many steps played between looks at which buildings are near its hero (as a host's own look: RELEVANCE.every). */
export const LOOKS = 5;

export class Viewing extends Joining {
    // Frames come and not yet played: [{ step, bytes }], in their order
    #frames = [];

    // How long after its step's time each of the latest frames came (ms)
    #took = [];

    #started = null;

    // The last of the player's commands done and their hero's own state, as the latest frame
    // to come said (not the latest played)
    #done = null;

    #hero = null;

    // The map its hero was on when the buildings near them were last looked at, and the steps
    // played since
    #map = null;

    #sinceLook = 0;

    // The legends as last told (the summary's own value: made again only when that's another)
    #legends = null;

    // Who's in each building that's always there (#people), by its key
    #always = new Map();

    // The buildings got ready before there was a game to hear of it (#begin): told with the
    // first step it plays
    #early = [];

    constructor({ send, clock = () => 0 }) {
        super({ send, clock });

        /** Its mirror (null till it's given its world: attach). */
        this.mirror = null;

        /** The world's step last played, and the last heard of. */
        this.played = -1;
        this.heard = -1;

        /** How many frames it's played, and how many it let go by unplayed to catch up. */
        this.frames = 0;
        this.dropped = 0;

        /**
         * What a talk or a shop needs of the world, asked of the server and answered with its
         * commands' results (core/worldview.js ToldView, answerOf): a promise of the answer,
         * null for none.
         */
        this.ask = (asked) => new Promise((resolve) => {
            this.command({ ...asked, type: "ask" }, (result) => resolve(result?.answer ?? null));
        });

        /** Resolves once its hero's in its world (the first frames played): a game can be made. */
        this.started = new Promise((resolve) => {
            this.#started = resolve;
        });
    }

    /** Ask to come into the world, to be sent views of it and no copy. */
    hello(character, { hero } = {}) {
        this.send(encode({ kind: "hello", version: NET_VERSION, mode: VIEW_MODE, character, ...(hero !== undefined ? { hero } : {}), speaks: ["replicated"] }));
    }

    /** What the world said: what came of a command of its player's, or anything a lockstep link's told too. */
    hear(text) {
        if (text.startsWith('{"kind":"result"')) {
            let message;

            try {
                message = decode(text);
            } catch {
                return;
            }

            this.received.result = (this.received.result ?? 0) + text.length;

            const then = this.pending.get(message.seq);

            this.pending.delete(message.seq);
            then?.(message.result ?? null);

            return;
        }

        // (A lockstep link's word of its hero: this one's is in its frames, as they come)
        if (text.startsWith('{"kind":"self"')) {
            this.received.self = (this.received.self ?? 0) + text.length;

            return;
        }

        super.hear(text);
    }

    /**
     * Given the world it's kept in (`host`: a Host of the welcome's seed that's never stepped
     * and has no one in it) and its welcome ({ id, step, own, world }): its mirror made over
     * that host's battle, its player's record put in it, and the frames that have come played
     * till its hero's there.
     */
    attach(host, welcome) {
        this.host = host;
        this.mirror = new Mirror(host.battle, { stepMs: STEP_MS });
        this.mirror.welcome(welcome);
        this.mirror.onDress = (actor, as) => this.#dress(actor, as);
        this.played = welcome.step ?? -1;
        host.battle.time = Math.max(0, this.played) * STEP_MS;
        this.#own();
        this.#mine();
        this.#world();
        this.#begin();
    }

    // What the world's summary says of its dungeons (how many times each is made, how strong,
    // what's slain and opened in it), put where the game and the making of their floors read it
    #world() {
        const { parts } = this.mirror.summary;
        const { host } = this;
        const dungeons = parts.get("dungeons");

        if (dungeons) {
            host.dungeons = new Map(structuredClone([...dungeons]));
        }

        this.#parties(parts.get("parties"));
        this.#roster(parts.get("roster"));
        this.#war(parts);
        this.#abroad(parts);
    }

    // What else of the world at large the summary tells, put where the game reads it (the
    // plan's 3-25): the invasions, what's burnt, hell's rifts, what's been done, the rules, the
    // legends (made again only when they're told anew), and the battles on that aren't an
    // invasion's (each a field's, as the game asks: Host.engagements)
    #abroad(parts) {
        const { host } = this;
        const one = (part) => parts.get(part)?.get("");
        const list = (part) => structuredClone([...(parts.get(part)?.values() ?? [])]);

        host.invasions = list("invasions");
        host.burnt = list("burnt");
        host.hellRifts = structuredClone(one("rifts") ?? host.hellRifts);
        host.done = structuredClone(one("done") ?? []);
        host.fields = structuredClone(one("battles") ?? []).map((engagement) => ({ engagement }));

        if (one("rules")) {
            host.rules = Object.freeze(structuredClone(one("rules")));
        }

        if (one("legends") && one("legends") !== this.#legends) {
            this.#legends = one("legends");
            host.legends = new Legends(structuredClone(this.#legends));
        }
    }

    // The players' parties as the summary has them, and which each player's in (the plan's 3-24)
    #parties(parties) {
        const { host } = this;

        host.parties = new Map(structuredClone([...(parties ?? [])]));
        host.partyIds = new Map();

        for (const party of host.parties.values()) {
            for (const id of party.members ?? []) {
                host.partyIds.set(id, party.id);
            }
        }
    }

    // Everyone in the world, wherever they are, as anyone may know them: a record for each the
    // game can list (their name, people, realm, whether they're away), beside what's known of
    // those who've come into sight (#dress) and the player's own (#own); one who's left is gone
    #roster(roster) {
        const { host } = this;

        if (!roster) {
            return;
        }

        for (const [id, said] of roster) {
            if (id !== this.me) {
                const had = host.players.get(id);

                host.players.set(id, { id, progress: UNSEEN, ...had, hero: { name: said.name ?? "", race: said.race ?? null, ...had?.hero }, realm: said.realm ?? null, role: said.role ?? had?.role ?? "player", away: Boolean(said.away) });
            }
        }

        for (const id of [...host.players.keys()]) {
            if (id !== this.me && !roster.has(id) && !host.battle.actor(id)) {
                host.players.delete(id);
            }
        }
    }

    // The war as the summary has it, put in the world's own (never stepped: a war begun, whose
    // turn, realms, towns, works, forces and forts are as they're told). Its camps, depots and
    // news are told too (the plan's 3-25)
    #war(parts) {
        const { war } = this.host;
        const clock = parts.get("clock")?.get("");
        const relations = parts.get("relations")?.get("");

        if (!war || !clock) {
            return;
        }

        Object.assign(war, { turn: clock.turn, clock: clock.clock, stage: clock.stage, might: clock.might, victor: clock.victor ?? null });

        for (const part of ["realms", "towns", "works", "forces", "forts"]) {
            if (parts.has(part)) {
                war[part] = [...parts.get(part).values()];
            }
        }

        if (relations) {
            Object.assign(war, { relations: relations.relations, known: relations.known });
        }

        // (Its camps and depots, the places cleared, and its latest news: the plan's 3-25)
        for (const part of ["camps", "depots"]) {
            if (parts.has(part)) {
                war[part] = [...parts.get(part).values()];
            }
        }

        war.places = parts.get("places")?.get("") ?? war.places;
        war.log = [...(parts.get("news")?.values() ?? [])];
    }

    // The buildings near its hero got ready and those far let go (Host.keepNear), every few
    // steps and at once when the hero's on another map: what the game's to hear of it, as a
    // copy's host tells ("open" before anything else of the step, "close" after)
    #look() {
        const mine = this.host.battle.actor(this.me);

        if (!mine || (mine.map === this.#map && ++this.#sinceLook < LOOKS)) {
            return [[], []];
        }

        this.#map = mine.map;
        this.#sinceLook = 0;

        const { opened, closed } = this.host.keepNear(this.me);

        return [opened.map((key) => ({ type: "open", key, folk: [] })), closed.map((key) => ({ type: "close", key, folk: [] }))];
    }

    // Its player's record, as the mirror's summary now has it (core/summary.js: the part "own",
    // each field as the world keeps it), made what the game reads: Host.livePlayer
    #own() {
        const fields = this.mirror.summary.parts.get("own");

        if (!fields?.size) {
            return;
        }

        const kept = structuredClone(Object.fromEntries(fields));

        if (kept.id === undefined || !kept.hero || !kept.progress) {
            return;
        }

        this.host.players.set(this.me, Host.livePlayer(kept));
    }

    // What else of the summary is the player's own: who's asked whom to a party, and where
    // those of their party are who aren't in sight (Host.afar: the plan's 3-24)
    #mine() {
        const { parts } = this.mirror.summary;
        const { host } = this;

        host.invites = new Map(structuredClone([...(parts.get("invites") ?? [])]));
        host.afar = new Map(structuredClone([...(parts.get("fellows") ?? [])]));
        this.#props(parts.get("props"));
    }

    // The director's props near its hero, as the summary has them (`name:id` each), put in the
    // world's own tables: what's on the ground, caches, finds, strangers, obstacles, treasures
    // and ambushes by their ids, the campfires a list (the plan's 3-25)
    #props(props) {
        const { host } = this;
        const tables = Object.fromEntries(PROPS.map((name) => [name, []]));

        for (const [key, thing] of props ?? []) {
            const cut = key.indexOf(":");

            tables[key.slice(0, cut)]?.push([key.slice(cut + 1), structuredClone(thing)]);
        }

        for (const name of PROPS) {
            host[name] = Array.isArray(host[name]) ? tables[name].map(([, thing]) => thing) : new Map(tables[name]);
        }
    }

    // Someone come into sight with what they're drawn as: put where the game asks
    #dress(actor, as) {
        const { host } = this;

        if (Number.isFinite(as.maxStamina)) {
            actor.maxStamina = as.maxStamina;
        }

        if (as.fort) {
            host.fortsOut.set(actor.id, as.fort);
        } else if (as.wagon) {
            host.wagons.set(actor.id, as.wagon);
        } else if (as.folk) {
            host.folk.set(actor.id, as.folk);
        } else if (as.soldier) {
            host.soldiers.set(actor.id, as.soldier);
        } else if (as.hero && actor.id !== this.me) {
            const [worn, wielded] = [as.worn ?? [], as.wielded ?? null];

            // (Their realm and whether they're away, as the roster says: #roster)
            host.players.set(actor.id, { ...host.players.get(actor.id), id: actor.id, hero: as.hero, role: as.role ?? "player", progress: { worn: () => worn, wielded: () => wielded } });
        }
    }

    // The frames that have come played at once till its hero's in its world (who everyone is
    // comes over the first few), and whoever waits for that told
    #begin() {
        while (this.#started && this.#frames.length) {
            // (The buildings got ready meanwhile are told to the game once there is one: #early)
            this.#early.push(...(this.#stepped() ?? []).filter(({ type }) => type === "open"));
        }
    }

    /** A frame come from the world (bytes). */
    frame(bytes) {
        const frame = decodeFrame(bytes);

        if (!frame || frame.step <= this.heard) {
            return;
        }

        const took = this.clock() - frame.step * STEP_MS;

        this.#took.push(took);

        if (this.#took.length > VIEWING.kept) {
            this.#took.shift();
        }

        // (As many steps in hand as cover how late nearly all of them come)
        const sorted = [...this.#took].sort((a, b) => a - b);
        const late = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * VIEWING.late))] - sorted[0];

        this.delay = Math.max(VIEWING.least, Math.min(VIEWING.most, Math.ceil(late / STEP_MS) + 1));
        this.heard = frame.step;
        this.hostStep = frame.step;
        this.#frames.push({ step: frame.step, bytes });
        this.#word(frame);

        if (this.mirror) {
            this.#begin();
        }
    }

    // What a frame says of the world's time and of the player's own hero, told as it comes and
    // not when it's played (a few steps on): the hero's looked ahead from the latest word there
    // is, as a lockstep link's is from its `self` (app/forecast.js; the scaling plan's 3-22)
    #word(frame) {
        const at = this.clock();
        const { done, self, asof } = frame.sections;

        this.onTimed?.(frame.step * STEP_MS, at);

        if (done !== undefined) {
            this.#done = done;
        }

        if (self !== undefined) {
            try {
                this.#hero = decode(self);
            } catch {
                return;
            }
        }

        if (asof === undefined || !Number.isFinite(Number(asof)) || !this.#hero || this.#done === null) {
            return;
        }

        // (Their breath, as the world has it, on their character too: what's shown of it where
        // nothing's looked ahead)
        const mine = this.host?.battle.actor(this.me);

        if (mine) {
            mine.stamina = this.#hero.stamina ?? 0;
            mine.maxStamina = this.#hero.maxStamina ?? mine.maxStamina;
        }

        this.self = { time: Number(asof), seq: this.#done, hero: this.#hero, at };
        this.onSelf?.(this.self);
    }

    /** How many of the world's steps have come and aren't played. */
    get behind() {
        return this.#frames.length;
    }

    /**
     * Play the next of the world's steps that's come: its frame taken by the mirror, the
     * world's time moved on to it, the player's own record and trade kept up, and the events
     * that are the player's to hear given back (as Host.advance gives a copy's). Null if none's
     * come. Too far behind to catch up at the pace it may (PACE.tooFar), all but the latest few
     * are played at once, their events let go of.
     */
    step() {
        const heard = this.#stepped();

        if (!heard || !this.#early.length) {
            return heard;
        }

        // (Those still ready, of the buildings got ready before the game was there)
        const early = this.#early.splice(0).filter(({ key }) => this.host.open.has(key));

        return [...early, ...heard];
    }

    #stepped() {
        if (!this.mirror || !this.#frames.length) {
            return null;
        }

        while (this.#frames.length > PACE.tooFar) {
            this.#play(this.#frames.shift());
            this.dropped++;
        }

        return this.#play(this.#frames.shift());
    }

    #play({ bytes }) {
        const { mirror, host } = this;
        const frame = mirror.apply(bytes);

        if (!frame) {
            return [];
        }

        // (Who's in its world changed: the game draws those come and lets go of those gone)
        if (frame.leaves.length || frame.sections.enters !== undefined) {
            this.members++;
        }

        this.played = frame.step;
        this.frames++;
        host.battle.time = frame.step * STEP_MS;

        if (frame.sections.own !== undefined) {
            this.#own();
            this.#mine();
        }

        if (frame.sections.world !== undefined) {
            this.#world();
        }

        // (A dungeon made again: said here at once, its summary's word of it a little behind)
        for (const event of mirror.events) {
            if (event.type === "trade") {
                this.#trade(event);
            } else if (event.type === "projectile") {
                this.#loose(event);
            } else if (event.type === "fizzle") {
                host.battle.projectiles = host.battle.projectiles.filter(({ id }) => id !== event.projectile);
            } else if (event.type === "dungeon" && event.change === "remade") {
                const said = host.dungeons.get(event.site);
                const building = host.world.interiors?.buildings.get(`site:${event.site}`);

                // (Unless its summary's word came with this very frame, and is of the new making)
                if (said && building?.made && said.generation === building.generation) {
                    Object.assign(said, { generation: building.generation + 1, awake: [], dead: [], opened: [], cleared: false });
                }

                host.open.delete(`site:${event.site}`);
            }
        }

        // (Shots flown a step, one just loosed with them: as the world flies its own)
        this.#fly();

        // (The world's own word of a building got ready or let go is of everyone's being near
        // it: the game hears of this hero's, from the look here)
        const [opened, closed] = this.#look();
        const peopled = opened.length || frame.leaves.length || frame.sections.enters !== undefined ? this.#people() : [];
        const told = mirror.events.filter(({ type }) => type !== "open" && type !== "close" && type !== "peopled" && type !== "vacated");
        const heard = [...opened, ...told, ...peopled, ...closed];

        if (this.#started && host.battle.actor(this.me) && host.players.has(this.me)) {
            this.#started();
            this.#started = null;
        }

        return heard;
    }

    // Who's in each building got ready, as the game asks (Host.open: a copy's are those its host
    // made there; here, the folk and soldiers the frames have brought on its floors), and what
    // the game's to hear where that's changed: "peopled", to dress those come; "vacated", once
    // none's left. A building always there, with no door of its own to be got ready by (a
    // home town's tavern), is told of the same way, though Host.open has none such
    #people() {
        const { host } = this;
        const interiors = host.world.interiors;
        const events = [];
        const always = [...(interiors?.buildings.values() ?? [])].filter((building) => !building.entrance && building.made).map(({ key }) => key);

        for (const key of [...host.open.keys(), ...always]) {
            const maps = interiors.buildings.get(key)?.maps ?? [];
            const had = host.open.get(key) ?? this.#always.get(key) ?? [];
            const folk = host.battle.actors.filter(({ kind, map }) => (kind === "folk" || kind === "soldier") && maps.includes(map)).map(({ id }) => id).sort();

            if (folk.length !== had.length || folk.some((id, k) => id !== had[k])) {
                (host.open.has(key) ? host.open : this.#always).set(key, folk);
                events.push(folk.length ? { type: "peopled", key, folk } : { type: "vacated", key, folk: had });
            }
        }

        return events;
    }

    // A shot let fly, as its event says: kept in the battle as the game reads those in flight
    // (app/game.js), which no frame tells of. It's flown here, a step at a time, as the world
    // flies its own (core/battle.js #fly): straight at whoever it's for, where the frames have
    // them, till it's there, or they're gone, or the world says it came to nothing ("fizzle")
    #loose(event) {
        const { battle } = this.host;
        const from = battle.actor(event.id);

        if (from && Number.isFinite(event.speed) && !battle.projectiles.some(({ id }) => id === event.projectile)) {
            battle.projectiles.push({ id: event.projectile, kind: event.kind, speed: event.speed, from: event.id, target: event.target, map: from.map, x: event.x, y: event.y, flown: 0 });
        }
    }

    #fly() {
        const { battle } = this.host;

        if (!battle.projectiles.length) {
            return;
        }

        const travelled = (speed) => (speed * STEP_MS) / 1000;

        battle.projectiles = battle.projectiles.filter((projectile) => {
            const target = battle.actor(projectile.target);

            if (!target || target.dead || target.map !== projectile.map) {
                return false;
            }

            const [dx, dy] = [target.x - projectile.x, target.y - projectile.y];
            const distance = Math.sqrt(dx * dx + dy * dy);
            const travel = travelled(projectile.speed);

            if (distance <= travel || projectile.flown > FLIES) {
                return false;
            }

            projectile.x += (dx / distance) * travel;
            projectile.y += (dy / distance) * travel;
            projectile.flown += travel;

            return true;
        });
    }

    // A trade the player's in, as the events that tell of it say it stands: kept where the game
    // reads it (Host.trades), let go of when it's done or off
    #trade(event) {
        if (event.change === "done" || event.change === "off" || !event.state) {
            this.host.trades.delete(event.trade);
        } else {
            this.host.trades.set(event.trade, event.state);
        }
    }

    // (A lockstep link's: there's no copy to have gone astray, nor a world to be sent again)
    resync() {}

    shadowing() {}

    drawing() {}
}
