// What lingers after some of the wild's creatures' blows (docs/WILDS.md): poison, disease,
// wither, burning, bleeding, and being slowed (webbed, rooted, chilled); and what can be caught
// upstairs at a bordello (the pox: host.js COMPANY). Each hurts a little now and then, or
// hinders, until it wears off; or a cure from the adventurers' guild ends it at once
// (core/progress.js ITEMS: a thing whose `use` is a `cure`). The battle keeps them (battle.js
// afflict, cure), each on whoever has it: { kind, until, next (when it next hurts), damage (each
// time), by (who did it), look (how it shows: a web, roots, frost; else as its kind) }.

/**
 * Each affliction: what it's called, what it is, how long it lasts (ms), how often it hurts
 * (`every`, ms) and how much (hit points each time, at the first tier: times the power of
 * whoever did it), and what else it does while it lasts: `speed` (the share of their pace kept),
 * `healing` (the share of healing that takes), `recovery` (the share of stamina got back). `cure`:
 * the thing (an ITEMS id) that ends it.
 */
export const AFFLICTIONS = Object.freeze({
    poison: { label: "Poisoned", about: "Venom in the blood: it hurts every moment or two, a while.", ms: 9000, every: 1500, damage: 1, cure: "antidote" },
    disease: { label: "Diseased", about: "A sickness: it hurts now and then, and the breath's slow to come back.", ms: 45000, every: 5000, damage: 1, recovery: 0.4, cure: "cureDisease" },
    // (Caught at a bordello: diseased an hour, and as the wild's sickness the breath's slow to
    // come back; but it doesn't hurt, as an hour of that would be the end of anyone. The same
    // draught cures it)
    pox: { label: "Diseased", about: "Something caught at a bordello: the breath's slow to come back, an hour.", ms: 60 * 60000, recovery: 0.4, cure: "cureDisease" },
    wither: { label: "Withered", about: "A curse drawing the life out: it hurts, and healing takes only half as well.", ms: 20000, every: 2500, damage: 1, healing: 0.5, cure: "invigorate" },
    burn: { label: "Burning", about: "Aflame: it hurts fast, till it's out.", ms: 4000, every: 800, damage: 1, cure: "burnSalve" },
    bleed: { label: "Bleeding", about: "A deep wound, bleeding: it hurts every couple of moments.", ms: 10000, every: 2000, damage: 1, cure: "bandage" },
    slow: { label: "Slowed", about: "Held back: moving at half the pace.", ms: 5000, speed: 0.5, cure: "quickening" },
    // (Fear, the spell's: running blindly away from whoever cast it, and nothing else. No draught
    // for it: Embolden ends it)
    fear: { label: "Afraid", about: "Terrified: running blindly away.", ms: 10000, flee: true },
});

/**
 * The cures (sold at the adventurers' guild: progress.js SHOPS): each ends one affliction at
 * once. What each's called and costs (gold), and what it cures.
 */
export const CURES = Object.freeze({
    antidote: { label: "Cure poison draught", cure: "poison", price: 12 },
    cureDisease: { label: "Cure disease draught", cure: "disease", price: 18 },
    invigorate: { label: "Invigorating draught", cure: "wither", price: 22 },
    burnSalve: { label: "Burn salve", cure: "burn", price: 8 },
    bandage: { label: "Bandage", cure: "bleed", price: 5 },
    quickening: { label: "Quickening draught", cure: "slow", price: 10 },
});

/**
 * What a cure for one kind of affliction ends: every kind its draught cures (the wild's
 * sickness and the pox, the one Cure disease draught).
 */
export function curedWith(kind) {
    const cure = AFFLICTIONS[kind]?.cure;

    return cure ? Object.keys(AFFLICTIONS).filter((each) => AFFLICTIONS[each].cure === cure) : [];
}

/** How much a thing about someone (their `kind` of affliction's `share`: speed, healing, recovery) is as it is now: 1, or less while it lasts. */
export function shareOf(actor, share) {
    let kept = 1;

    for (const { kind } of actor.afflictions ?? []) {
        kept *= AFFLICTIONS[kind]?.[share] ?? 1;
    }

    return kept;
}
