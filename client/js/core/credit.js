// Who's credited with one of the wild or a raider brought down, and how well, from its tag ledger
// (core/battle.js TAGS, Battle.tagsOf; generated/multiplayer_scaling_plan.md 2-12). Pure: what it's
// given in, the answer out, nothing of the world read or changed. No rule reads it yet (the
// plan's 2-13 and 2-14 do).
//
// An ordinary foe pays everyone with a tag on it in full. A leader pays by how much of a hand
// each had, a medal: gold, silver or bronze (CREDIT).

/**
 * The medals, the best first: each with the least weight in the ledger that earns it, as a share
 * of the foe's hit points (`hp`) or of a fair share of them (`share`: the hit points split evenly
 * among those credited), whichever is less; and what it pays, of gold's coin and chance of gear
 * (`pay`). Bronze is any tag at all. Gold's line and the three pays are the plan's; silver at
 * half of gold's is the owner's ruling (23 November 2026).
 */
export const CREDIT = Object.freeze({
    gold: Object.freeze({ hp: 0.05, share: 0.5, pay: 1 }),
    silver: Object.freeze({ hp: 0.025, share: 0.25, pay: 0.85 }),
    bronze: Object.freeze({ hp: 0, share: 0, pay: 0.75 }),
});

/** The medals' names, the best first. */
export const MEDALS = Object.freeze(Object.keys(CREDIT));

/**
 * Those of a ledger (Battle.tagsOf: [{ player, done, taken, healed, weight }]) who are credited:
 * everyone with some weight in it who isn't `away` (a test of a player's id: marked away from the
 * game, core/host.js AFK), in the ledger's order.
 */
export function eligible(tags, { away = null } = {}) {
    return tags.filter(({ player, weight }) => weight > 0 && !(away && away(player)));
}

/**
 * The medal a weight in a leader's ledger earns (MEDALS; null for none: no weight), the foe
 * having had `hp` hit points whole and `among` being credited with it.
 */
export function tierOf(weight, { hp, among = 1 } = {}) {
    if (!(weight > 0)) {
        return null;
    }

    const fair = hp / Math.max(1, among);

    return MEDALS.find((medal) => weight >= Math.min(CREDIT[medal].hp * hp, CREDIT[medal].share * fair)) ?? null;
}

/**
 * What each of a ledger's players is credited with: [{ player, medal, pay }], in the ledger's
 * order, those not eligible left out. On a `leader`, each their medal and its pay; on an ordinary
 * foe, no medal and paid in full.
 */
export function creditOf(tags, { hp, leader = false, away = null } = {}) {
    const credited = eligible(tags, { away });

    return credited.map(({ player, weight }) => {
        const medal = leader ? tierOf(weight, { hp, among: credited.length }) : null;

        return { player, medal, pay: medal ? CREDIT[medal].pay : 1 };
    });
}
