// What a player's own do: the adventurers they've hired (docs/WAR.md M9: by their calling), and
// the creatures at their side (docs/MAGIC.md: called by Summon, raised by Zombify).
// - Each calling's way of fighting, of its own accord (`wayOf`): a mage's spells at whom it fights,
//   a cleric's healing (its leader first), a warrior's those after its leader first, a rogue's
//   whom its leader's fighting first, a ranger's keeping its distance.
// - The orders they take (UNIT_ORDERS: core/host.js #orderUnit), each held on them on the
//   player's follower wheel (app/wheel.js) or given in talk.
// - The ability each can be told to use (UNIT_ABILITIES, `abilityOf`): a blow made stronger at
//   whom the player's fighting, a greater spell at them, or healing on the player.
// - How a hired adventurer grows with its leader (docs/WAR.md *Mercenaries that grow*): its level
//   (MERCENARY, levelOfXp, capOf), what it's hired for (hirePrice) and what it's worth in a fight
//   (mercenaryOf: its level, its wounds, what it wears, its trust and its renown), the gift a
//   veteran gives its leader (GIFTS), what it can wear (wearable), its wounds (MENDING), its share
//   of the gold won with it (SHARE, sharesOf), the trust it comes to (TRUST, TRUST_PICKS), its
//   renown (RENOWN, renownOf), the byname it earns (bynameOf) and what it says (BARKS).
//
// Pure data and arithmetic (exact.js pow, random.js), the same in every browser; no DOM.

import { pow } from "./exact.js";
import { GEAR, levelFactor, levelOf, statsOf } from "./gear.js";
import { createRandom } from "./random.js";
import { SCHOOLS, SPELLS } from "./spells.js";

/**
 * The orders one of a player's own takes (core/host.js #orderUnit): go for whom the player's
 * fighting (`assist`), follow, wait where they are, guard the player (`guard`: at their side,
 * taking on only those after them or it), break off and run back to them (`fallback`), start no
 * fights (`hold`: only fighting back) or go after any enemy seen again (`free`), use their own
 * ability (`ability`), or go for good (`dismiss`).
 */
export const UNIT_ORDERS = Object.freeze(["assist", "follow", "wait", "guard", "fallback", "hold", "free", "ability", "dismiss"]);

/**
 * One falling back (the `fallback` order): running back to its leader, after no one, till it's
 * as near them as a follower keeps (battle.js FOLLOW.near) or `ms` have passed, `pace` times as
 * fast as it chases.
 */
export const FALL_BACK = Object.freeze({ ms: 8000, pace: 1.25 });

/** How near its leader one guarding them (the `guard` order) takes on those after them (squares). */
export const GUARD_REACH = 6;

/** How near a foe comes to one that keeps its distance (a ranger) before it backs off (metres). */
export const KEEP_OFF = 4;

/**
 * How near one of a player's own they can give a draught, a meal or a cure (metres): as far as a
 * spell cast on them reaches (core/spells.js SPELL_REACH).
 */
export const GIVE_REACH = 16;

/**
 * Whether a thing to use (its `use`: core/progress.js ITEMS) can be given to one of a player's
 * own: one that heals or cures, and does nothing else (not a spell's scroll, a bomb, a boon...).
 */
export const givable = (use) => Boolean(use?.heal || use?.cure) && !["cast", "bomb", "learn", "boon", "safety", "treasure", "ward", "buff", "stamina"].some((key) => use[key]);

/** A cleric's healing, the weakest first (battle.js #mend), as the peoples' healers'. */
export const CLERIC_HEALS = Object.freeze(["vigor", "mendWounds"]);

/**
 * Each calling's way of fighting, of its own accord (core/battle.js #follow): its spells (`casts`,
 * the stronger first: a mage's, its people's school's first two, as their soldiers' casters'),
 * its healing (`heals`: a cleric's, its leader first), whom it goes for first (`tactic`:
 * "protect", those after its leader; "flank", whom its leader's fighting), and how near it lets
 * a foe come before backing off (`keep`: a ranger's, metres). `school`: a school of magic
 * (spells.js SCHOOLS), the mage's. At the highest level (MERCENARY `mastery`), a mage casts its
 * school's next spells up, and a cleric heals with Detraumatize too.
 */
export function wayOf(calling, school = "fire", level = 1) {
    const tiers = (SCHOOLS[school] ?? SCHOOLS.fire).tiers;
    const master = level >= MERCENARY.mastery;

    return (
        {
            mage: { casts: master ? [tiers[2], tiers[1]] : [tiers[1], tiers[0]] },
            cleric: { heals: master ? [...CLERIC_HEALS, "detraumatize"] : [...CLERIC_HEALS] },
            warrior: { tactic: "protect" },
            rogue: { tactic: "flank" },
            ranger: { keep: KEEP_OFF },
        }[calling] ?? {}
    );
}

/**
 * How a hired adventurer grows with its leader (docs/WAR.md *Mercenaries that grow*):
 *  - its level, 1 to `most`, each as many times as strong as the one before as a tier of the
 *    land's creatures is (`growth`: creatures.js TIER_GROWTH), so a level-L one stands to a tier-L
 *    creature as a fresh one does to a tier-1 (its health and its blows, spells and healing);
 *  - what it learns from: every hit point it takes off a foe, and `leader` of each its leader takes
 *    off one while it's standing within `reach` metres of them (strength.js STRENGTH reach);
 *    `behind` times as fast a level under the most it can be (capOf) and `further` times two or
 *    more under, so one hired late catches up;
 *  - what each level brings past its stats: its ability ready sooner from `sooner` (`cooldown`
 *    times as long), its gift to its leader from `gift` (GIFTS), its calling's mastery at
 *    `mastery` (wayOf, MASTERY).
 */
export const MERCENARY = Object.freeze({ most: 10, growth: 1.18, leader: 0.5, reach: 60, behind: 2, further: 3, sooner: 4, cooldown: 0.75, gift: 7, mastery: 10 });

/** How much experience a hired adventurer needs to go from a level to the next (50 L (L + 1)): 100, 300, 600... */
export const xpToNext = (level) => 50 * level * (level + 1);

/** The experience a hired adventurer has once it's reached each level (index: the level; 0 and 1 none). */
export const LEVEL_XP = Object.freeze(Array.from({ length: MERCENARY.most + 1 }, (_, level) => Array.from({ length: Math.max(0, level - 1) }, (__, k) => xpToNext(k + 1)).reduce((sum, each) => sum + each, 0)));

/** The level a hired adventurer's experience has brought it to (1 to MERCENARY.most), no higher than `cap`. */
export function levelOfXp(xp, cap = MERCENARY.most) {
    let level = 1;

    while (level < Math.min(cap, MERCENARY.most) && xp >= LEVEL_XP[level + 1]) {
        level++;
    }

    return level;
}

/**
 * The highest level a player's hired adventurers can reach (1 to MERCENARY.most): the tier of the
 * land their might's fit for (`tier`: core/might.js mightTier, 0 to 10, and one more), and half
 * their Command's rank more (rounded up: progress.js TREES), so a healer or a talker hires the
 * might they don't have (docs/WAR.md *The player's part*).
 */
export const capOf = (tier, command = 0) => Math.max(1, Math.min(MERCENARY.most, (tier ?? 0) + 1 + Math.ceil((command ?? 0) / 2)));

/** How many times as strong a hired adventurer of a level is as a fresh one (MERCENARY growth: exact.js pow). */
export const levelPower = (level) => pow(MERCENARY.growth, Math.max(1, Math.min(MERCENARY.most, level)) - 1);

// (To the nearest 5 gold)
const fives = (gold) => Math.max(5, Math.round(gold / 5) * 5);

/**
 * What a hired adventurer of a level costs to hire (gold): its calling's price (host.js HIRES:
 * a fresh one's) times its level to the power of 1.5, so a level-10 one costs about thirty times a
 * fresh one (the span between common and legendary make: progress.js QUALITIES); a renowned one
 * (RENOWN) half as much again. To the nearest 5.
 */
export const hirePrice = (base, level = 1, renowned = false) => (level <= 1 && !renowned ? base : fives(base * pow(Math.max(1, level), 1.5) * (renowned ? RENOWN.price : 1)));

/**
 * A veteran's gift to its leader (MERCENARY `gift` on), while it's standing with them: a warrior's
 * shield wall (armour), a ranger's eye for a mark (shots), a rogue's dirty tricks (bleeding
 * blows), a mage's counsel (spells), a cleric's blessing (healing). Not their might: it passes.
 */
export const GIFTS = Object.freeze({
    warrior: { label: "Shield wall", about: "Your armour takes a twentieth more of each blow.", armor: 0.05 },
    ranger: { label: "Hunter's eye", about: "Your shots a tenth harder.", ranged: 0.1 },
    rogue: { label: "Dirty tricks", about: "One of your blows in ten leaves its foe bleeding.", bleed: 0.1 },
    mage: { label: "Arcane counsel", about: "Your spells a tenth stronger.", spell: 0.1 },
    cleric: { label: "Blessing", about: "Your healing a seventh stronger.", heal: 0.15 },
});

/**
 * A calling's mastery at the highest level (MERCENARY `mastery`), besides wayOf's: a warrior's
 * shield as a captain's (host.js NPC_SHIELDS), a ranger and a rogue each dodging some blows.
 */
export const MASTERY = Object.freeze({
    warrior: { label: "Shield master", about: "Catches a quarter of blows on their shield, taking almost half of each." },
    ranger: { label: "Fleet", about: "Dodges about one blow in seven.", dodge: 0.15 },
    rogue: { label: "Elusive", about: "Dodges one blow in five.", dodge: 0.2 },
    mage: { label: "Archmage", about: "Casts their school's stronger spells." },
    cleric: { label: "Healer", about: "Heals with Detraumatize too, stopping bleeding." },
});

/**
 * What a hired adventurer can wear (docs/WAR.md *Mercenaries that grow*): a weapon of its own
 * calling's kind (its HIRES weapon: a sword, a bow, a staff or a war hammer) and body armour, in
 * `slots`; neither of a level more than `perLevel` times its own (gear.js levels: the might it was
 * made for); its armour taking at most `armor` of a blow (the player's: progress.js ARMOR_CAP).
 */
export const MERC_GEAR = Object.freeze({ slots: Object.freeze(["mainHand", "body"]), perLevel: 10, armor: 0.4 });

/** The slot of a hired adventurer's a piece of gear goes in (MERC_GEAR slots), or null: a weapon in the hand, armour on the body. */
export const mercSlotOf = (id) => (GEAR[id]?.slot === "mainHand" ? "mainHand" : GEAR[id]?.slot === "chest" ? "body" : null);

/**
 * Whether a hired adventurer can wear a piece of gear (`item`: { id, level }), as one of a level
 * that fights with a weapon (`weapon`: its calling's, host.js HIRES): null if it can, else why
 * not: "slot" (it's neither a weapon nor body armour), "calling" (a weapon not its calling's),
 * "level" (made for one mightier than it: MERC_GEAR perLevel).
 */
export function wearable(item, { weapon, level = 1 }) {
    const slot = mercSlotOf(item?.id);

    if (!slot) {
        return "slot";
    }

    if (slot === "mainHand" && item.id !== weapon) {
        return "calling";
    }

    return levelOf(item.level) > MERC_GEAR.perLevel * Math.max(1, level) ? "level" : null;
}

/**
 * A hired adventurer's wounds (docs/WAR.md *Mercenaries that grow*): each fall leaves one, `wound`
 * of its health the less till it's mended (a healing draught given them mends one, a night's rest
 * with their leader all of them: host.js #restMends); with `most`,
 * it can't go on, and goes home to its guild to mend, called back to its leader's side for `fee`
 * of what it'd cost to hire (any guild sends for it). Where mercenaries can die (host.js RULES
 * `mortal`), the fall that would send it home is its last.
 */
export const MENDING = Object.freeze({ wound: 0.1, most: 3, fee: 0.25 });

/** What it costs to call a hired adventurer back from mending (MENDING fee: of its hire price), to the nearest 5 gold. */
export const recallPrice = (price) => fives(price * MENDING.fee);

/**
 * The trust a hired adventurer comes to with its leader (docs/WAR.md *Mercenaries that grow*):
 * a rank (1 to 3) at each of `ranks` foes brought down together (by either of them, while it was
 * standing by them), each rank a choice of two ways it grows (TRUST_PICKS), and its share of the
 * gold (SHARE) a point less.
 */
export const TRUST = Object.freeze({ ranks: Object.freeze([30, 120, 300]), share: 1 });

/** A hired adventurer's trust's rank (0 to 3) for the foes brought down together (TRUST). */
export const trustOf = (together = 0) => TRUST.ranks.filter((need) => together >= need).length;

/**
 * The ways a hired adventurer grows as it comes to trust its leader (TRUST: one of each pair, a
 * pair a rank), chosen by its leader (and chosen again in a guild hall): more health or harder
 * blows; its ability sooner or dodging; getting up sooner or armour.
 */
export const TRUST_PICKS = Object.freeze([
    Object.freeze([
        { id: "hardy", label: "Hardy", about: "A fifth more health.", hp: 0.2 },
        { id: "fierce", label: "Fierce", about: "Blows, spells and healing a sixth stronger.", power: 0.15 },
    ]),
    Object.freeze([
        { id: "steady", label: "Steady", about: "Their ability ready a quarter sooner.", cooldown: 0.75 },
        { id: "nimble", label: "Nimble", about: "Dodges one blow in ten.", dodge: 0.1 },
    ]),
    Object.freeze([
        { id: "stalwart", label: "Stalwart", about: "Back on their feet in half the time when they're knocked down.", rises: 0.5 },
        { id: "sworn", label: "Sworn", about: "Their armour takes a twentieth more of each blow.", armor: 0.05 },
    ]),
]);

/** A choice of TRUST_PICKS by its id ({ rank (0 to 2), ...the pick }), or null. */
export function pickOf(id) {
    for (const [rank, pair] of TRUST_PICKS.entries()) {
        const pick = pair.find((each) => each.id === id);

        if (pick) {
            return { rank, ...pick };
        }
    }

    return null;
}

/**
 * The renowned among the adventurers at a guild (docs/WAR.md *Mercenaries that grow*): about one
 * in six (`chance`), offered at the most a player's hired adventurers can be (capOf) and for half
 * as much again (`price`), each with a trait of its own (`traits`).
 */
export const RENOWN = Object.freeze({
    chance: 1 / 6,
    price: 1.5,
    traits: Object.freeze({
        tireless: { label: "Tireless", about: "A fifth more health.", hp: 0.2 },
        deadly: { label: "Deadly", about: "Blows, spells and healing a sixth stronger.", power: 0.15 },
        lucky: { label: "Lucky", about: "Dodges one blow in ten.", dodge: 0.1 },
        quick: { label: "Quick", about: "Their ability ready a quarter sooner.", cooldown: 0.75 },
    }),
});

/** Whether an adventurer of a seed (insides.js: the folk's own) is renowned: their trait's id (RENOWN traits), or null. */
export function renownOf(seed) {
    const random = createRandom(((seed ?? 1) * 2654435761 + 40503) >>> 0);

    return random.chance(RENOWN.chance) ? random.pick(Object.keys(RENOWN.traits)) : null;
}

/**
 * What a hired adventurer's worth in a fight, as it is (`one`: its record, host.js followers):
 * what battle.add (and host.js #fit) takes: its health (`hp`, its wounds' share off it), its
 * power for blows, shots, healing and spells (`power`: its level's, its weapon's make and level,
 * what's rolled on its weapon, its trust's and renown's), its armour (`armor`: its body armour's,
 * no more than MERC_GEAR armor), dodging (`dodge`), its ability's cooldown (`cooldown`: a share),
 * how long it's down before it's up again (`rises`: a share) and its calling's way (wayOf) at its
 * level. `made(quality)`: how strong a make is (progress.js QUALITIES power); `school`: a mage's.
 */
export function mercenaryOf(one, { made = () => 1, school = "fire" } = {}) {
    const level = Math.max(1, Math.min(MERCENARY.most, one.level ?? 1));
    const growth = levelPower(level);
    const picks = (one.picks ?? []).map(pickOf).filter(Boolean);
    const traits = [...picks, ...(RENOWN.traits[one.renowned] ? [RENOWN.traits[one.renowned]] : [])];
    const sum = (key) => traits.reduce((total, each) => total + (each[key] ?? 0), 0);
    const times = (key) => traits.reduce((total, each) => total * (each[key] ?? 1), 1);
    const weapon = one.gear?.mainHand ?? null;
    const body = one.gear?.body ?? null;
    // (A weapon's make and level in everything it does, a caster's spells and healing too; and
    // what's rolled on it, as strong as its level already: as a player's, progress.js bonuses)
    const held = weapon ? statsOf(weapon, 1) : {};
    const worn = body ? statsOf(body, made(body.quality)) : {};
    const hand = weapon ? made(weapon.quality) * levelFactor(weapon.level) : 1;
    const strength = growth * hand * (1 + sum("power"));
    const wounded = 1 - MENDING.wound * Math.max(0, Math.min(MENDING.most - 1, one.wounds ?? 0));
    const mastery = level >= MERCENARY.mastery ? (MASTERY[one.calling] ?? {}) : {};

    return {
        hp: Math.max(1, Math.round(50 * growth * (1 + sum("hp")) * wounded + (worn.hp ?? 0) + (held.hp ?? 0))),
        power: { melee: strength * (1 + (held.melee ?? 0)), ranged: strength * (1 + (held.ranged ?? 0)), heal: strength * (1 + (held.heal ?? 0)), spell: strength * (1 + (held.spell ?? 0)), stun: 1 },
        armor: Math.min(MERC_GEAR.armor, (worn.armor ?? 0) + (held.armor ?? 0) + sum("armor")),
        dodge: Math.min(0.5, (mastery.dodge ?? 0) + sum("dodge") + (worn.dodge ?? 0)),
        cooldown: (level >= MERCENARY.sooner ? MERCENARY.cooldown : 1) * times("cooldown"),
        rises: times("rises"),
        ...wayOf(one.calling, school, level),
    };
}

/**
 * The gold a player's hired adventurers take of what's won with them (docs/WAR.md *Mercenaries
 * that grow*): each standing within `reach` metres of them `each` in a hundred of it, a point less
 * each rank of its trust (TRUST share), and all of them together never more than `most` in a
 * hundred. Taken as it's won: no wages, no debt.
 */
export const SHARE = Object.freeze({ each: 5, most: 20, reach: 60 });

/**
 * What each of a player's hired adventurers takes of some gold won (`gold`, whole) with them
 * (`takers`: [{ id, trust, owed }], `owed` what's over from before in ten-thousandths of a gold
 * piece): [{ id, gold (whole), owed (what's over now) }], each at its share (SHARE) in
 * ten-thousandths (basis points), so a little at a time adds up, the same in every browser.
 */
export function sharesOf(gold, takers) {
    const most = Math.floor((SHARE.most * 100) / Math.max(1, takers.length));

    return takers.map(({ id, trust = 0, owed = 0 }) => {
        const rate = Math.min(most, Math.max(0, SHARE.each - TRUST.share * trust) * 100);
        const due = owed + gold * rate;

        return { id, gold: Math.floor(due / 10000), owed: due % 10000 };
    });
}

/**
 * The bynames a hired adventurer earns by what it's done (its record: host.js followers), the
 * first it's earned of these: the mightiest it's brought down (`best`, its power: core/might.js),
 * the foes it's brought down (`kills`), the times it's got up again (`rises`), or so many of a
 * kind (BANES). The same deeds, the same name.
 */
export const BYNAMES = Object.freeze([
    { byname: "the Dauntless", best: 70 },
    { byname: "the Grim", kills: 300 },
    { byname: "the Unbroken", rises: 10 },
    { bane: 25 },
    { byname: "the Bloodied", kills: 100 },
]);

/** The kinds of creature (creatures.js CREATURES) a hired adventurer's named for bringing down so many of (BYNAMES bane): the name, by kind. */
export const BANES = Object.freeze({
    wolf: "Wolfsbane",
    direWolf: "Wolfsbane",
    werewolf: "Wolfsbane",
    cwnAnnwn: "Houndsbane",
    goblin: "Goblin-bane",
    goblinBomber: "Goblin-bane",
    goblinKing: "Goblin-bane",
    skeleton: "Bonebreaker",
    draugr: "Bonebreaker",
    troll: "Giantsbane",
    ogre: "Giantsbane",
    caveSpider: "Spiderbane",
    bandit: "Outlaw-hunter",
    banditChief: "Outlaw-hunter",
    cultist: "Witchfinder",
    bear: "Bearslayer",
    nandiBear: "Bearslayer",
    boar: "Boar-sticker",
    wyvern: "Wyrmslayer",
});

/** The byname a hired adventurer's record has earned it (BYNAMES), or null. */
export function bynameOf(record = {}) {
    for (const rule of BYNAMES) {
        if (rule.bane) {
            const [name] = Object.entries(record.slain ?? {}).find(([, count]) => count >= rule.bane) ?? [];

            if (name) {
                return name;
            }
        } else if ((rule.best && (record.best?.power ?? 0) >= rule.best) || (rule.kills && (record.kills ?? 0) >= rule.kills) || (rule.rises && (record.rises ?? 0) >= rule.rises)) {
            return rule.byname;
        }
    }

    return null;
}

/** A new hired adventurer's record of what it's done: nothing yet. */
export const freshRecord = () => ({ kills: 0, damage: 0, falls: 0, rises: 0, together: 0, earned: 0, best: null, slain: {}, nemesis: null });

/**
 * What hired adventurers say, now and then, over their heads (app/game.js: each line at most once
 * in a while; not at all with chatter turned off, Game options): knocked down, up again, a level
 * gained, a byname earned, the kind of foe that last knocked them down struck again, their trust
 * grown. `{byname}` theirs, `{leader}` their leader's, `{foe}` the foe's.
 */
export const BARKS = Object.freeze({
    down: ["I'm down!", "Ugh... a moment...", "Help me up!"],
    up: ["Still standing.", "Not yet, not today.", "Back on my feet."],
    level: ["I'm getting the hang of this.", "Feels like I've learnt something.", "Getting better, {leader}."],
    byname: ["They're calling me {byname} now.", "{byname}. I like the sound of that."],
    again: ["You again! Not this time.", "I owe one of you a beating.", "That's the kind that dropped me. Mine."],
    trust: ["You can count on me, {leader}.", "I'd follow you anywhere now."],
});

/**
 * The ability each of a player's own can be told to use (the `ability` order), once each
 * `cooldown` ms (kept with them: battle.js `abilityReadyAt`):
 * - a blow (`blow`: "melee", "ranged", or "any", whichever they fight with) `factor` times as hard,
 *   stunning for `stun` ms too, at whom the player's fighting, going for them;
 * - their school's `tier`th spell (core/spells.js SCHOOLS) at them at once, `spell`;
 * - a heal (`heal`: a spell) on the player at once.
 */
export const UNIT_ABILITIES = Object.freeze({
    shieldBash: { label: "Shield bash", about: "Goes for your foe, the next blow slamming the shield into them: stunned 2 seconds.", blow: "melee", factor: 1, stun: 2000, cooldown: 15000 },
    aimedShot: { label: "Aimed shot", about: "A careful shot at your foe, two and a half times as hard.", blow: "ranged", factor: 2.5, cooldown: 12000 },
    backstab: { label: "Backstab", about: "Slips round to your foe, the next blow three times as hard.", blow: "melee", factor: 3, cooldown: 15000 },
    greaterSpell: { label: "Greater spell", about: "Their school's third spell at your foe, at once.", spell: 2, cooldown: 20000 },
    healYou: { label: "Heal me", about: "Detraumatize on you at once: heals well, and stops bleeding.", heal: "detraumatize", cooldown: 15000 },
    savage: { label: "Savage blow", about: "Goes for your foe, the next blow twice as hard.", blow: "any", factor: 2, cooldown: 12000 },
    graveGrip: { label: "Grave grip", about: "Goes for your foe, the next blow seizing them: held 2.5 seconds.", blow: "any", factor: 1, stun: 2500, cooldown: 15000 },
});

/** Each calling's ability, and a called creature's and a risen one's (UNIT_ABILITIES). */
const ABILITY_OF = Object.freeze({ warrior: "shieldBash", ranger: "aimedShot", rogue: "backstab", mage: "greaterSpell", cleric: "healYou", summon: "savage", risen: "graveGrip" });

/**
 * The ability one of a player's own uses (UNIT_ABILITIES), by what they are: a hired
 * adventurer's calling, or a creature called (`summon`) or risen (`risen`). Null for none.
 */
export function abilityOf({ calling = null, kind = null }) {
    return ABILITY_OF[kind === "adventurer" ? calling : kind] ?? null;
}

/**
 * What an ability's called (UNIT_ABILITIES `label`): a greater spell by its own name, for a
 * mage of a school (`school`).
 */
export function abilityLabel(id, school = null) {
    const ability = UNIT_ABILITIES[id];

    if (ability?.spell !== undefined && school) {
        return SPELLS[SCHOOLS[school]?.tiers[ability.spell]]?.label ?? ability.label;
    }

    return ability?.label ?? null;
}
