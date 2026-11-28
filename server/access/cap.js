// The cap on a world's players, and what it takes to pass 8 (generated/multiplayer_scaling_plan.md
// 3-33, gate (b), decision 2). A world played in lockstep has each of its players playing a copy
// of the whole world, step for step, and 8 is the measure of that: it's never passed, whatever the
// server's ceiling comes to. More than 8 is for a world that's all of: replicated (its players
// sent views), public and shared (so it carries the rules strangers need), on a server whose
// public worlds are ready (publicReady). The ceiling above 8 goes up a tier at a time (CAP_TIERS),
// each after its soak at 1.25 times the tier.
//
// What a public world needs isn't built yet (the plan's 6B-1 to 6B-14, Nanny Mode, Stage 2's
// shared preset's rules), so publicReady() says no and names what's missing, no world can be made
// public (publicReason, below: the settings are there since the plan's 2-1, `public` and `preset`),
// and every world's cap is 8 in practice. The rule is here, in one place, for those to turn on.

/** The most players a world played in lockstep takes, and any world that isn't all the rule asks (core/netplay.js MOST_PLAYERS). */
export const LOCKSTEP_MOST = 8;

/** The ceilings above 8, in the order they're raised: each after gate (b), and its soak at 1.25 times it. */
export const CAP_TIERS = Object.freeze([16, 25, 50]);

/** What gate (b) asks of a server before a public world may be made on it, none of it built yet. */
export const PUBLIC_NEEDS = Object.freeze([
    "identity, moderation and the legal minimum for public worlds (6B-1 to 6B-14)",
    "Nanny Mode on and tested (2-36, 2-37, 6B-16 to 6B-23, 6B-25)",
    "the shared preset a public world must use (2-1)",
]);

/**
 * Whether this server's public worlds are ready (gate (b)): { ready, missing }, `missing` what
 * it still needs. Never ready till the plan's 6B-13 says how it's told. Given how the server's
 * Nanny Mode stands (`nanny`: access/nanny.js nannyReady, the plan's 6B-23), what that lacks is
 * named too: the country source's and the country list's freshness are part of being ready.
 */
export function publicReady({ nanny = null } = {}) {
    return Object.freeze({ ready: false, missing: Object.freeze([...PUBLIC_NEEDS, ...(nanny && !nanny.ready ? nanny.missing : [])]) });
}

/**
 * Whether a world may take more than 8 (`world`: { netcode, public, shared }, as its settings
 * have them; `ready`: publicReady().ready): replicated, public, shared, and the server ready.
 */
export function mayPass(world, ready) {
    return ready === true && world?.netcode === "replicated" && world.public === true && world.shared === true;
}

/** The most players a world takes: what it asks, no more than the ceiling, and no more than 8 unless it may pass it. */
export function mostFor(asked, ceiling, passes) {
    return Math.min(asked, ceiling, passes ? Infinity : LOCKSTEP_MOST);
}

/** Why a world can't ask for `asked` players (above 8, and not one that may pass it), or null. */
export function capReason(asked, world, ready) {
    if (!Number.isInteger(asked) || asked <= LOCKSTEP_MOST || mayPass(world, ready)) {
        return null;
    }

    const lacks = [world?.netcode === "replicated" ? null : "replicated", world?.public === true ? null : "public", world?.shared === true ? null : "shared"].filter(Boolean);

    return `mostPlayers above ${LOCKSTEP_MOST} is for a world that's replicated, public and shared, on a server ready for public worlds${lacks.length ? `: this one isn't ${lacks.join(" or ")}` : ": this server isn't ready for them"}.`;
}

/**
 * Why the server's ceiling can't be `value` (`now`: what it is): above 8 it's a tier (CAP_TIERS),
 * the next one up at most, on a server ready for public worlds. Or null.
 */
export function ceilingReason(value, now, ready) {
    if (!Number.isInteger(value) || value <= LOCKSTEP_MOST || value <= now) {
        return null;
    }

    if (!ready) {
        return `mostPlayersCeiling above ${LOCKSTEP_MOST} waits on this server being ready for public worlds.`;
    }

    const next = CAP_TIERS.find((tier) => tier > Math.max(now, LOCKSTEP_MOST));

    return value === next ? null : `mostPlayersCeiling goes up a tier at a time (${CAP_TIERS.join(", ")}): ${next === undefined ? "there's none above this" : `the next is ${next}`}, not ${value}.`;
}

/**
 * A world as the rule reads it, from its settings: its netcode, and whether it's public and
 * shared, which none is taken to be yet: the settings are there (`public`, `preset`: the plan's
 * 2-1), and reading them here is 3-37's, with the test that pins the cap.
 */
export function capWorld(settings) {
    return { netcode: settings?.netcode, public: false, shared: false };
}

/**
 * Why a world can't be public (`world`: its settings, as they'd be; `ready`: publicReady()), or
 * null: a public world plays by the shared preset (the plan's 2-1), on a server ready for public
 * worlds (gate (b)). One that isn't asked to be public can be whatever else it likes.
 */
export function publicReason(world, ready = publicReady()) {
    if (world?.public !== true) {
        return null;
    }

    if (world.preset !== "shared") {
        return "A public world plays by the shared preset: set preset to shared with it.";
    }

    return ready.ready === true ? null : `public waits on this server being ready for public worlds. It still needs: ${ready.missing.join("; ")}.`;
}
