// A joined game's own hero, drawn where the game's own rules will have them (docs/WAR.md,
// playing together; generated/hero_prediction_plan.md, stage 2). Their commands go to the host and
// are done there a while later, and the copy of the world plays the host's steps later still, so
// the hero's drawn ahead of it: as far ahead as a command sent now takes to be done, so that they
// answer the hand at once.
//
// Not guessed: worked out by the battle's own rules (core/battle.js), as Factorio's latency state
// is. With every flush the host tells the player where their hero is now (core/selfstate.js) and
// the last of their commands it's done; a battle of their own is made from the copy's (fork) with
// the hero as the host has them, those near them standing as the copy has them, still (in the way,
// someone to strike, but doing nothing of their own), and the commands sent since put to it when
// the host will get them (half the round trip after they were sent, the host's own word half a
// round trip old), and it's stepped on to the present the hand acts in. A swing, a cast, a stagger
// holds them there as it does on the host; the stick's way slides round a lamppost there as it
// does on the host; they stop where the host will stop them. What it does is only drawn: no blow
// it strikes lands, nothing it says is heard. When the host's next word shows them somewhere else
// (struck, blocked by someone the copy didn't have there), the difference is slid away (at SLIDE
// metres a second, over BLEND to LONGEST ms); only on another map, or further off than SNAP metres
// (a teleport, a summons), are they put there at once.
//
// Their own swings and casts are shown as it begins them (`begun`), not as the copy does, half a
// second and more later: the copy's own of each, when it comes, is known for the same one (claim)
// and not shown again. Whether it lands, and what it does, still come from the copy. A shot or a
// throw is left to the copy: its arrow or its spear is the copy's, and they go together.
//
// The copy is never touched (fork makes its own battle). Its ways are found over the navigation
// tiles made already only (bakedOnly: the copy's play makes those round the hero), so a frame never
// waits on one being made; off them, the stick's way goes straight on.

import { ABILITIES } from "../core/progress.js";
import { STEP_MS } from "../core/battle.js";
import { blowAt } from "../core/host.js";
import { placeOf, withSelf } from "../core/selfstate.js";
import { SPELLS } from "../core/spells.js";

/**
 * Those within `near` metres of the hero go in its battle (the `most` nearest); it's looked ahead
 * `ahead` steps at most; a difference closed over `blend` ms, or, a bigger one, at `slide` m/s on
 * top of their going (`longest` ms at most), never faster, so it's seen as a slide, not a jump;
 * put at once past `snap` metres; with a round trip not yet timed, `rtt` ms taken for it, and
 * none taken as longer than `slowest` ms (a link that slow is held up, not far: they're drawn no
 * further ahead); the host's clock reckoned from the quickest of its words of the last `window`
 * ms (one held up less than that doesn't put it back), and come down to it over about `settle`
 * ms when it's come down (the link's grown slower, or a host drawing few frames plays its steps
 * slower than time goes by); and how fast how far ahead they're drawn follows the round trip as
 * it's timed again (`slew`: ms a ms, so they're drawn going a little faster or slower a while,
 * never jumping); a swing or cast of theirs the copy begins within `same` ms of one it began
 * taken for the same one, and those it began kept `kept` ms to know them by.
 */
export const FORECAST = Object.freeze({ near: 15, most: 24, ahead: 40, blend: 100, slide: 6, longest: 500, snap: 8, rtt: 200, slowest: 1000, window: 1000, settle: 500, slew: 0.1, same: 300, kept: 5000 });

// The commands that move or hold the hero, as the host gives them to its battle (Host.command)
const ORDERS = {
    move: ({ to, run }) => ({ type: "move", to: [...to], run: Boolean(run) }),
    ahead: ({ facing, run, reach }) => ({ type: "ahead", facing, run: Boolean(run), ...(Number.isFinite(reach) && reach > 0 ? { reach } : {}) }),
    engage: ({ target, run, stand, lock }) => ({ type: "engage", target, run: Boolean(run), ...(stand ? { stand: true } : {}), ...(lock ? { lock: true } : {}) }),
    approach: ({ target, run }) => ({ type: "approach", target, run: Boolean(run) }),
    enter: ({ link, run }) => ({ type: "enter", link, run: Boolean(run) }),
    stop: () => ({ type: "stop" }),
    unlock: () => ({ type: "unlock" }),
};

export class Forecast {
    constructor() {
        /** The host's last word of the hero (Joining.self): { time, seq, hero, at }. */
        this.self = null;

        /** The commands sent since that the host hadn't done then: [{ seq, command, at }]. */
        this.sent = [];

        // The round trip they're drawn ahead by (ms), following the link's as it's timed, a little
        // at a time (slew), and when it last did
        this.trip = null;
        this.tripAt = null;

        // How far the host's battle's time is ahead of the link's clock, less a word's way here
        // (ms), and when it was last brought up to date: the quickest of its words of the last
        // FORECAST.window ms (`words`: [{ at, ahead }]) at once if they're quicker, else come
        // down to them a little at a time (#keepUp)
        this.ahead = null;
        this.aheadAt = null;
        this.words = [];

        // The battle looked ahead in, and where the hero was in it at each step: { battle, me,
        // sent (with when the host will get each), next (the next of them to give it), steps
        // ([{ time, x, y, map }]) }, made again when the host's word comes or a command's sent;
        // and the one before it, till where it had the hero's been set against the new one's
        this.track = null;
        this.old = null;

        // The difference between the two being closed (metres), since when, and over how long (ms)
        this.gap = [0, 0];
        this.gapAt = -Infinity;
        this.gapFor = FORECAST.blend;

        /**
         * How often what's drawn has been put right (by half a metre to two, by more, and put there
         * at once) and by how much at most (m): for the debug log.
         */
        this.corrections = { small: 0, big: 0, snaps: 0, most: 0 };

        // The swings and casts of theirs it's begun ({ type, what (the attack or the spell), time,
        // claimed (the copy's of it come) }), kept FORECAST.kept ms; and, at the present they were
        // last drawn in (the host's time), the spell they're casting there, or null
        this.shown = [];
        this.present = null;
        this.casting = null;
    }

    /** The host's word of the hero (Joining.self). */
    heard(self) {
        this.words = [...this.words.filter(({ at }) => at > self.at - FORECAST.window), { at: self.at, ahead: self.time - self.at }];
        this.self = self;
        this.sent = this.sent.filter(({ seq }) => seq > self.seq);
        this.#again();
    }

    /** A command of the player's sent (its seq: Joining.command), at `at` (the link's clock). */
    sending(seq, command, at) {
        if (Number.isInteger(seq)) {
            this.sent.push({ seq, command, at });
            this.#again();
        }
    }

    // To be looked ahead again (at the next frame), the look before kept to be set against it
    #again() {
        if (this.track) {
            this.old = this.track;
        }

        this.track = null;
    }

    /**
     * Where to draw the hero (`me`, of the copy's battle `copy`) at `now` (the link's clock, ms),
     * a word to the host and back taking `rtt` ms lately (Joining.lately: the middle of the latest
     * few, so one held up, as the first is while the world's built, doesn't count), and which way
     * they face, whether they're swinging or casting, and the swings and casts of theirs begun
     * since last asked, each once (their battle's "attack" and "cast" events, but for a shot or
     * a throw: shown now, the copy's not again, claim): { x, y, map, facing, acting, begun },
     * or null for where the copy has them (nothing heard from the host yet, or they're dead).
     */
    at(copy, me, now, rtt = FORECAST.rtt) {
        const self = this.self;

        if (!self || self.hero.dead) {
            this.track = this.old = null;
            this.present = this.casting = null;

            return null;
        }

        const trip = this.#trip(Math.min(Number.isFinite(rtt) ? rtt : FORECAST.rtt, FORECAST.slowest), now);

        this.#keepUp(now);

        // (The host's time now is the link's clock and how far it's ahead, a word's way here (half a
        // round trip) on; what's sent now reaches it half a round trip after that)
        const present = now + this.ahead + trip;

        if (!this.track) {
            this.track = this.#made(copy, me, trip);

            if (!this.track) {
                this.present = this.casting = null;

                return null;
            }

            this.#onTo(this.track, present);
            this.#reckon(present, now);
        }

        this.#onTo(this.track, present);

        const place = this.#placeAt(this.track, present);
        const left = this.#left(now);

        this.present = present;
        this.casting = place.casting;

        return { x: place.x + this.gap[0] * left, y: place.y + this.gap[1] * left, map: place.map, facing: place.facing, acting: place.acting, begun: this.#begun(this.track, present) };
    }

    // A new look ahead set against the one before, at the same time (`present`): the difference
    // (and what was left of the last) closed from `now`, over BLEND ms, or a big one at SLIDE m/s
    // (LONGEST ms at most); none onto another map, or past SNAP metres (put there at once)
    #reckon(present, now) {
        const old = this.old;

        this.old = null;

        if (!old) {
            this.gap = [0, 0];

            return;
        }

        this.#onTo(old, present);

        const [before, after] = [this.#placeAt(old, present), this.#placeAt(this.track, present)];
        const left = this.#left(now);
        const [gx, gy] = [before.x + this.gap[0] * left - after.x, before.y + this.gap[1] * left - after.y];
        const far = Math.hypot(gx, gy);

        if (before.map !== after.map || far > FORECAST.snap) {
            this.gap = [0, 0];
            this.corrections.snaps += before.map === after.map ? 1 : 0;

            return;
        }

        this.gap = [gx, gy];
        this.gapAt = now;
        this.gapFor = Math.min(FORECAST.longest, Math.max(FORECAST.blend, (far / FORECAST.slide) * 1000));
        this.corrections.small += far > 0.5 && far <= 2 ? 1 : 0;
        this.corrections.big += far > 2 ? 1 : 0;
        this.corrections.most = Math.max(this.corrections.most, far);
    }

    // A battle of the hero's own, as the host had them, those near them as the copy has them
    #made(copy, me, trip) {
        const self = this.self;
        const hero = copy.actor(me);

        if (!hero) {
            return null;
        }

        // (Not self.hero's own map: left out, it's the town)
        const { x, y, map } = placeOf(self.hero);
        const near = copy.actors
            .filter((other) => other.id !== me && other.map === map && Math.abs(other.x - x) <= FORECAST.near && Math.abs(other.y - y) <= FORECAST.near)
            .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
            .slice(0, FORECAST.most);
        const battle = copy.fork([me, ...near.map(({ id }) => id)]);

        battle.time = self.time;

        for (const other of battle.actors) {
            if (other.id !== me) {
                Object.assign(other, { still: true, path: [], order: null, pathGoal: null, progress: null, attack: null, casting: null, target: null });
            }
        }

        const mine = withSelf(battle.actor(me), self.hero);

        // (Each command when the host will get it: half a round trip after it was sent, as the
        // host's time had it then; those it may have by now, at once)
        const sent = this.sent.map((each) => ({ ...each, time: Math.max(self.time, each.at + this.ahead + trip) })).sort((a, b) => a.time - b.time || a.seq - b.seq);

        return { battle, me, sent, next: 0, events: [], steps: [{ time: self.time, x, y, map, ...this.#doing(mine) }] };
    }

    // How far the host's clock is ahead of the link's brought up to `now`: up to the quickest of
    // its latest words at once, down to it a little at a time (so the present they're drawn in
    // seldom goes back, and never by much at once)
    #keepUp(now) {
        const quickest = Math.max(...this.words.map(({ ahead }) => ahead));

        this.ahead = this.ahead === null || quickest > this.ahead ? quickest : this.ahead + (quickest - this.ahead) * Math.min(1, (now - this.aheadAt) / FORECAST.settle);
        this.aheadAt = now;
    }

    // The round trip to draw them ahead by at `now`: the link's (`rtt`), come to a little at a time
    #trip(rtt, now) {
        if (this.trip === null) {
            this.trip = rtt;
        } else {
            const most = FORECAST.slew * Math.max(0, now - this.tripAt);

            this.trip += Math.max(-most, Math.min(most, rtt - this.trip));
        }

        this.tripAt = now;

        return this.trip;
    }

    // How much of the difference is still to be closed at `now` (1 to none)
    #left(now) {
        return Math.max(0, 1 - (now - this.gapAt) / this.gapFor);
    }

    // How a hero of a look ahead's stands: which way they face, whether they're swinging or casting,
    // and what spell
    #doing(hero) {
        return { facing: hero.facing, acting: Boolean(hero.attack || hero.casting), casting: hero.casting?.spell ?? null };
    }

    // A look ahead stepped on till it's past `present` (FORECAST.ahead steps at most): each command given
    // it as the host gives it, at once, as of its last step (one that comes between two steps is
    // done as of the first of them, not the next)
    #onTo(track, present) {
        const { battle, me, sent } = track;

        while (track.steps.at(-1).time < present && track.steps.length <= FORECAST.ahead) {
            while (track.next < sent.length && sent[track.next].time < battle.time + STEP_MS) {
                this.#give(battle, me, sent[track.next++].command);
            }

            const events = battle.advance(STEP_MS);
            const hero = battle.actor(me);

            // (Their own swings and casts begun: a shot's or a throw's left to the copy)
            for (const event of events) {
                if (event.id === me && (event.type === "cast" || (event.type === "attack" && hero.arms.find(({ id }) => id === event.attack)?.kind !== "ranged"))) {
                    track.events.push(event);
                }
            }

            track.steps.push({ time: battle.time, x: hero.x, y: hero.y, map: hero.map, ...this.#doing(hero) });
        }
    }

    // A command given the hero's battle, as the host gives its own (Host.command, #ability): those
    // that move them or hold them; the rest (talk, trade, gear...) left to the host
    #give(battle, me, command) {
        const hero = battle.actor(me);

        if (!hero || hero.dead || battle.time < (hero.downUntil ?? 0)) {
            return;
        }

        const order = ORDERS[command.type];

        if (order) {
            battle.command(me, order(command));

            return;
        }

        const target = command.target === "self" ? me : (command.target ?? null);

        if (command.type === "cast" && SPELLS[command.spell]) {
            battle.cast(me, command.spell, target);

            return;
        }

        const ability = command.type === "ability" ? ABILITIES[command.ability] : null;

        if (ability?.spell) {
            battle.cast(me, ability.spell, target);
        } else if (ability && target !== null && battle.actor(target)) {
            const blow = blowAt(battle, hero, battle.actor(target));

            if (blow.strike) {
                battle.strike(me, target, { until: blow.until, tag: command.ability });
            } else if (blow.engage) {
                battle.command(me, { type: "engage", target, run: true });
            }
        }
    }

    /**
     * Whether a swing or cast of the hero's the copy's begun (its battle's "attack" or "cast"
     * event) is one this has shown already (begun within FORECAST.same ms of it): if so, it's the
     * copy's of that one, not to be shown again (and it's claimed: not the copy's of another).
     */
    claim(event) {
        const what = event.attack ?? event.spell;
        const one = this.shown.find((each) => !each.claimed && each.type === event.type && each.what === what && Math.abs(each.time - event.time) <= FORECAST.same);

        if (one) {
            one.claimed = true;
        }

        return Boolean(one);
    }

    // The swings and casts a look ahead has begun by `present` and not shown yet (one it began
    // within FORECAST.same ms of one shown, looking ahead again, is that one)
    #begun(track, present) {
        this.shown = this.shown.filter(({ time }) => time > present - FORECAST.kept);

        const begun = [];

        for (const event of track.events) {
            const what = event.attack ?? event.spell;

            if (event.time <= present && !this.shown.some((each) => each.type === event.type && each.what === what && Math.abs(each.time - event.time) <= FORECAST.same)) {
                this.shown.push({ type: event.type, what, time: event.time, claimed: false });
                begun.push(event);
            }
        }

        return begun;
    }

    // Where a look ahead has the hero at `time` (between two of its steps)
    #placeAt(track, time) {
        const steps = track.steps;
        let k = steps.length - 1;

        while (k > 0 && steps[k - 1].time >= time) {
            k--;
        }

        const after = steps[k];
        const before = steps[Math.max(0, k - 1)];

        if (before === after || before.map !== after.map || after.time <= before.time) {
            return { x: after.x, y: after.y, map: after.map, facing: after.facing, acting: after.acting, casting: after.casting };
        }

        const share = Math.max(0, Math.min(1, (time - before.time) / (after.time - before.time)));

        return { x: before.x + (after.x - before.x) * share, y: before.y + (after.y - before.y) * share, map: after.map, facing: after.facing, acting: after.acting, casting: after.casting };
    }
}
