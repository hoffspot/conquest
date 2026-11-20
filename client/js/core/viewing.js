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
// (the war, parties, props: 3-24, 3-25: a dungeon's chests and a building's wares among them),
// a dungeon's sealed rooms, and being hidden and shown again or coming back in while inside
// (3-26). Pure: no DOM, no network of its own.

import { STEP_MS } from "./battle.js";
import { Host } from "./host.js";
import { Mirror } from "./mirror.js";
import { Joining, NET_VERSION, PACE } from "./netplay.js";
import { decodeFrame } from "./view.js";
import { VIEW_MODE } from "./viewfeed.js";
import { decode, encode } from "./wire.js";

/**
 * How many of the latest frames' comings the steps kept in hand are reckoned from; the share of
 * them that came no later than that allows for; and the fewest and most steps kept in hand.
 */
export const VIEWING = Object.freeze({ kept: 60, late: 0.95, least: 2, most: 8 });

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
        this.#world();
        this.#begin();
    }

    // What the world's summary says of its dungeons (how many times each is made, how strong,
    // what's slain and opened in it), put where the game and the making of their floors read it
    #world() {
        const dungeons = this.mirror.summary.parts.get("dungeons");

        if (dungeons) {
            this.host.dungeons = new Map(structuredClone([...dungeons]));
        }
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

    // Someone come into sight with what they're drawn as: put where the game asks
    #dress(actor, as) {
        const { host } = this;

        if (Number.isFinite(as.maxStamina)) {
            actor.maxStamina = as.maxStamina;
        }

        if (as.folk) {
            host.folk.set(actor.id, as.folk);
        } else if (as.soldier) {
            host.soldiers.set(actor.id, as.soldier);
        } else if (as.hero && actor.id !== this.me) {
            const [worn, wielded] = [as.worn ?? [], as.wielded ?? null];

            host.players.set(actor.id, { id: actor.id, hero: as.hero, role: as.role ?? "player", progress: { worn: () => worn, wielded: () => wielded } });
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
        }

        if (frame.sections.world !== undefined) {
            this.#world();
        }

        // (A dungeon made again: said here at once, its summary's word of it a little behind)
        for (const event of mirror.events) {
            if (event.type === "trade") {
                this.#trade(event);
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
