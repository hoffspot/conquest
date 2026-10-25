// A joined player's own hero, as the host has them now (docs/WAR.md, playing together): what the
// battle's rules move them by, sent to that player alone with every flush of the host's
// (core/netplay.js Hosting), so their game can look ahead from it (app/forecast.js) rather than
// from its copy of the world, which plays the host's steps a little after the host played them.
// Only what moves them: where they are and which way they face, how fast they're going, the way
// they're on and where it goes, what they were told, what holds them (a swing, a cast, a stagger,
// a stun, a weapon being drawn) and till when, their breath, and whom they're locked on or
// striking. Everything else of theirs the copy has, and it changes slowly.
//
// Pure: no DOM, no network.

/**
 * What of a hero's goes (as it is, but for a little rounding), and what each is when it's not said
 * (left out, to keep it small: a hero standing has most of them so).
 */
const KEPT = Object.freeze({ map: "town", facing: 0, pace: 0, pathGoal: null, order: null, progress: null, offPath: false, blockedSince: null, lastPathAt: 0, squeezeUntil: 0, casting: null, staggeredUntil: 0, stunnedUntil: 0, downUntil: 0, readyAt: 0, armed: false, drawing: null, stamina: 0, running: false, lock: null, striking: null, dead: false, target: null });

/** At most so many corners of the way they're on go (the rest are a while off yet). */
export const SELF_CORNERS = 8;

// (By so many places: tens, hundreds, thousands, as every browser works them out alike)
const PLACES = [1, 10, 100, 1000];
const round = (value, places) => Math.round(value * PLACES[places]) / PLACES[places];
const cm = (value) => round(value, 2);

// (Rounded where it's said: a turn to a thousandth of a radian, how fast to the centimetre a
// second, breath to a tenth)
const ROUNDED = { facing: 3, pace: 2, stamina: 1 };

/** A hero's own state, as it's sent: plain data. */
export function selfOf(actor) {
    const self = { x: cm(actor.x), y: cm(actor.y), path: actor.path.slice(0, SELF_CORNERS).map(([x, y]) => [cm(x), cm(y)]) };

    for (const [key, unsaid] of Object.entries(KEPT)) {
        const value = actor[key] ?? unsaid;

        if (value !== unsaid) {
            self[key] = key in ROUNDED && Number.isFinite(value) ? round(value, ROUNDED[key]) : key === "progress" ? { left: cm(value.left), at: value.at } : value;
        }
    }

    // (A swing: which of their attacks it is, by name, its own being the copy's)
    if (actor.attack) {
        self.attack = { id: actor.attack.attack.id, target: actor.attack.target, start: actor.attack.start, struck: actor.attack.struck, ...(actor.attack.ahead === undefined ? {} : { ahead: actor.attack.ahead }) };
    }

    return self;
}

/** Where a hero's own state (as selfOf gave it) has them: { x, y, map } (the map said or not). */
export function placeOf(self) {
    return { x: self.x, y: self.y, map: self.map ?? KEPT.map };
}

/**
 * A hero (a copy's, in a battle of its own: core/battle.js fork) made as the host has them
 * (`self`, as selfOf gave it): its swing found among its own attacks by name (none, if it's not
 * one of them: the copy's not yet armed as the host has them).
 */
export function withSelf(actor, self) {
    for (const [key, unsaid] of Object.entries(KEPT)) {
        actor[key] = key in self ? structuredClone(self[key]) : unsaid;
    }

    actor.x = self.x;
    actor.y = self.y;
    actor.square = [Math.floor(self.x), Math.floor(self.y)];
    actor.path = self.path.map(([x, y]) => [x, y]);

    const attack = self.attack ? (actor.arms.find(({ id }) => id === self.attack.id) ?? null) : null;

    actor.attack = attack ? { attack, target: self.attack.target, start: self.attack.start, struck: self.attack.struck, ...(self.attack.ahead === undefined ? {} : { ahead: self.attack.ahead }) } : null;

    return actor;
}
