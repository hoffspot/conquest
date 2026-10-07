// Emotes: what a character shows of itself, the player as they choose (on their own wheel or as a
// quick action: app/wheel.js ACTIONS), seen by everyone they play with (host.js "emote"), and the
// folk on their own: a greeting as they're talked to, a nod at what's said to them, a cheer as a
// foe falls near them (app/game.js). Each is its animation's timing (s: its key moment and how
// long it all is, as a rest's: characters/actions.js EMOTE_WAYS, the animators' clips' own
// lengths), how it's called, and its face (characters/expressions.js FACES; null: as it is).

import { hypot } from "./exact.js";

/** Every emote, in the order a player's offered them. */
export const EMOTES = Object.freeze({
    wave: { label: "Wave", hitAt: 1.2, duration: 4.833, face: "smiling" },
    bow: { label: "Bow", hitAt: 1.1, duration: 2.8, face: null },
    nod: { label: "Nod", hitAt: 0.4, duration: 0.867, face: null },
    no: { label: "Shake head", hitAt: 1, duration: 3.8, face: null },
    cheer: { label: "Cheer", hitAt: 1, duration: 2.167, face: "smiling" },
    fistPump: { label: "Fist pump", hitAt: 0.9, duration: 2.267, face: "smiling" },
    puzzled: { label: "Puzzled", hitAt: 1, duration: 2.933, face: null },
    beckon: { label: "Beckon", hitAt: 0.9, duration: 3.4, face: "smiling" },
});

/** Whether `name` is an emote. */
export const isEmote = (name) => typeof name === "string" && Object.hasOwn(EMOTES, name);

/**
 * How the folk greet the player as they start talking with them, by what they are (their role,
 * core/roles.js; or what kind of character, battle.js KINDS): a town's great and its priests bow,
 * those on duty (sentries, soldiers, a hired sword) nod, and everyone else waves.
 */
export const GREETINGS = Object.freeze({
    ruler: "bow",
    steward: "bow",
    councillor: "bow",
    reeve: "bow",
    priest: "bow",
    sentry: "nod",
    soldier: "nod",
    follower: "nod",
});

/** A greeting for one who's `role` (or `kind`): GREETINGS', else a wave. */
export const greetingOf = (role, kind) => GREETINGS[role] ?? GREETINGS[kind] ?? "wave";

/**
 * The folk cheering as a foe falls near them at a player's or a friend's hand (app/game.js): those
 * within `near` metres, not fighting or going anywhere, each `delay` seconds after (from, to), one
 * of `ways`.
 */
export const CHEERING = Object.freeze({ near: 12, delay: [0.3, 1.2], ways: Object.freeze(["cheer", "fistPump"]) });

// A number from a few words, the same every time
const hashOf = (words) => [...words].reduce((sum, letter) => (Math.imul(sum, 31) + letter.charCodeAt(0)) >>> 0, 7);

/**
 * Who cheers `fallen` falling at `killer`'s hand (battle.js actors), in a battle: each one glad of
 * it and standing about (not going anywhere, fighting, talking or sat down) within CHEERING.near
 * of where it fell. The folk are glad of a creature of the wild's fall (or the orc's), at anyone's
 * hand but another creature's; soldiers and followers of a foe's, at the hand of anyone who's no
 * foe of theirs. Returns [{ id, after (s), emote }]: when and how each cheers, by their ids (the
 * same every time).
 */
export function cheering(battle, fallen, killer) {
    if (!fallen || !killer || killer.kind === "beast") {
        return [];
    }

    const glad = (other) => (other.kind === "folk" ? ["beast", "orc"].includes(fallen.kind) : ["soldier", "follower"].includes(other.kind) && battle.hostile(other, fallen) && !battle.hostile(other, killer));
    const idle = (other) => !other.dead && !other.path?.length && !other.attack && !other.casting && (other.talkingTo ?? null) === null && !other.routine?.seated;
    const [soonest, latest] = CHEERING.delay;

    return battle.actors
        .filter((other) => other !== killer && other !== fallen && other.map === fallen.map && hypot(other.x - fallen.x, other.y - fallen.y) <= CHEERING.near && idle(other) && glad(other))
        .map((other) => {
            const hash = hashOf(`${fallen.id}:${other.id}`);

            return { id: other.id, after: soonest + (((hash >>> 4) % 1000) / 1000) * (latest - soonest), emote: CHEERING.ways[hash % CHEERING.ways.length] };
        });
}
