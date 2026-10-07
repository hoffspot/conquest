// Spells: actions a character casts, rather than blows with its weapon (docs/MAGIC.md). The
// player chooses them on the action wheel (app/wheel.js).
//
// Magic is in schools: Healing (five spells, one for each tier), and Fire, Earth, Air and Water
// (seven each). Everyone can cast the first of each; each school grows with the spells of it
// that land (core/progress.js schools: its experience), and each tier it comes to is the next
// spell of it, stronger and slower to come round again. Stun and Hold are the Hexes skill's.
//
// Casting takes `castTime` (the character stands still, hands raised), then the spell lands. Each
// spell has a cooldown of its own (`cooldown`); and after casting any, none can be cast for
// SPELL_COOLDOWN.
//
// Pure data, no DOM: the battle (battle.js) casts them.

/** How long after casting a spell before any spell can be cast again (ms). */
export const SPELL_COOLDOWN = 1000;

/**
 * The schools of magic: what each is called, its spells from the first tier to the last, and
 * the experience (cast by cast) each tier's reached at. Each spell that lands brings its school
 * SPELL_XP for each tier of it (a tier 5 spell five times what a tier 1 does).
 */
export const SCHOOLS = Object.freeze({
    healing: { label: "Healing", tiers: ["vigor", "mendWounds", "detraumatize", "renewal", "astralHeal"], xp: [0, 150, 700, 2000, 5000] },
    fire: { label: "Fire", tiers: ["burn", "fireball", "burstflame", "immolate", "flamefill", "inferno", "hellfire"], xp: [0, 150, 700, 2000, 5000, 11000, 24000] },
    earth: { label: "Earth", tiers: ["rumble", "stoneCrush", "shatterstone", "engulf", "earthquake", "acidify", "disintegrate"], xp: [0, 150, 700, 2000, 5000, 11000, 24000] },
    air: { label: "Air", tiers: ["hurt", "dustgust", "shockbolt", "lightning", "thunderbolt", "tornado", "ionize"], xp: [0, 150, 700, 2000, 5000, 11000, 24000] },
    water: { label: "Water", tiers: ["blister", "waterbolt", "steamblast", "bloodboil", "iceblade", "putrify", "absoluteZero"], xp: [0, 150, 700, 2000, 5000, 11000, 24000] },
});

/** A school's experience from a spell of it landing: this for each tier of the spell. */
export const SPELL_XP = 8;

/**
 * How far a spell cast on someone reaches, unless it's said otherwise (squares): across a street
 * or a clearing, past where most are seen from (battle.js SIGHT; a spell's caster sees as far as
 * it reaches). Each third tier of an attack spell reaches `tiers` further; the Hexes and Fear,
 * `hexes` further.
 */
export const SPELL_REACH = Object.freeze({ reach: 16, tiers: 2, hexes: 2 });

// A spell of healing (castable on anyone: never taken as an attack)
const healing = (tier, label, settings) => ({ label, school: "healing", tier, target: "any", reach: SPELL_REACH.reach, ...settings });

// An attack spell of an element (on an enemy in sight and reach)
const attack = (school, tier, label, settings) => ({ label, school, tier, target: "enemy", reach: SPELL_REACH.reach + SPELL_REACH.tiers * Math.floor(tier / 3), ...settings });

/** How long a spell that lasts lasts, unless it's said otherwise (ms): five minutes. */
export const LASTING = 300000;

/** What's left of what a ward's against (a share): 30% less. */
export const WARD = 0.7;

/**
 * How rare each tome is (TOMES): its weight when one's found or given, and what one sells for
 * (gold) at the adventurers' guild.
 */
export const TOME_RARITY = Object.freeze({
    common: { weight: 10, price: 60 },
    uncommon: { weight: 5, price: 120 },
    rare: { weight: 2, price: 300 },
});

// A spell learnt from a tome (of no school: it doesn't come with a school's growing), as rare as
// `rarity` is to find
const tome = (label, rarity, settings) => ({ label, tome: rarity, reach: SPELL_REACH.reach, castTime: 700, ...settings });

// A ward (a tome's): on oneself or anyone not an enemy, 30% less from what it's against for five
// minutes (as `ward` says: attack spells of those schools, `hits` of those natural attacks'
// elements, and those afflictions, both how much they hurt and how long they last)
const ward = (label, about, against) => tome(label, "common", { about, target: "friend", cooldown: 15000, lasts: LASTING, ward: { schools: [], elements: [], afflictions: [], looks: [], ...against } });

// A cure (a tome's): on anyone, friend or foe (never taken as an attack), ending an affliction
const cure = (label, about, kind) => tome(label, "common", { about, target: "any", castTime: 500, cooldown: 6000, cures: [kind] });

// A spell that grows as it's used (a tome's): its own experience (progress.js spellXp), each that
// lands SPELL_XP more, reaching each of five levels at these
export const GROWTH_XP = Object.freeze([0, 60, 200, 500, 1200]);

/**
 * Every spell: its name and what it does (`about`); its school and tier (for those of a school);
 * who it's cast on ("self", "any": anyone, friend or foe, or "enemy"); how long it takes to cast
 * (ms); how far it reaches (squares; whoever it's cast on must be in sight); its own cooldown
 * (ms); and what it does when it lands:
 *  - heal: [least, most] hit points back (a whole number rolled evenly between them), or `full`;
 *    `cures`: the afflictions it ends as well (core/afflictions.js kinds; "all" for every one);
 *  - damage: [least, most] hit points off (as strong as the caster's spell power), `area`: to
 *    every enemy of the caster's within so many metres of whoever it's cast on, `chain`: leaping
 *    on to so many more enemies near them (each hit at `falls` of the last), and what else it may
 *    do: `effect` (an affliction taking hold, `chance` of the time: its `kind` and `look`),
 *    `knockdown` or `stun` (ms), `stagger` (ms, as a blow's), and `hazard`: what it leaves on the
 *    ground round them a while (battle.js HAZARDS: its `kind`, `ms`, `radius` in metres);
 *  - stun: stops the target for so many ms (Hexes);
 *  - `reaction`: how whoever's struck by it reacts (as a weapon's blow: characters/actions.js).
 * Healing restores less as damage is dealt more: tier 1 of either is weak, as a new adventurer is.
 */
export const SPELLS = Object.freeze({
    // --- Healing: five tiers, each on anyone (friend, neutral or foe: it never starts a fight).
    // Each one past Vigor heals more at once, for an emergency, but no more over a fight than
    // Vigor does on its own (its cooldown the longer): cast all in turn, they heal about three
    // times what Vigor does, not five, so that three set on someone together are beaten by
    // fighting, stunning and healing, not by healing alone ---
    vigor: healing(1, "Vigor", { about: "A breath of strength: heals a little.", castTime: 500, cooldown: 4000, heal: [8, 12] }),
    mendWounds: healing(2, "Mend Wounds", { about: "Knits cuts and bruises: heals a fair deal.", castTime: 700, cooldown: 12000, heal: [16, 24] }),
    detraumatize: healing(3, "Detraumatize", { about: "Soothes body and mind: heals well, and stops bleeding.", castTime: 900, cooldown: 24000, heal: [28, 40], cures: ["bleed"] }),
    renewal: healing(4, "Renewal", { about: "Renews the flesh: heals greatly, and purges poison, sickness and bleeding.", castTime: 1100, cooldown: 45000, heal: [45, 65], cures: ["bleed", "poison", "disease"] }),
    astralHeal: healing(5, "Astral Heal", { about: "Light from beyond the stars: heals fully, and ends everything lingering.", castTime: 1400, cooldown: 180000, full: true, cures: "all" }),

    // --- Fire: burning ---
    burn: attack("fire", 1, "Burn", { about: "A lick of flame: may set them burning.", castTime: 450, cooldown: 2500, damage: [9, 15], effect: { kind: "burn", chance: 0.2 }, reaction: "fire" }),
    fireball: attack("fire", 2, "Fireball", { about: "A ball of fire: may set them burning.", castTime: 600, cooldown: 3500, damage: [12, 18], effect: { kind: "burn", chance: 0.3 }, reaction: "fire" }),
    burstflame: attack("fire", 3, "Burstflame", { about: "Fire bursting round them: burns all near.", castTime: 700, cooldown: 5000, damage: [16, 24], area: 1.5, effect: { kind: "burn", chance: 0.35 }, reaction: "fire" }),
    immolate: attack("fire", 4, "Immolate", { about: "Wreathes them in fire: sets them burning.", castTime: 800, cooldown: 7000, damage: [20, 30], effect: { kind: "burn", chance: 1 }, reaction: "fire" }),
    flamefill: attack("fire", 5, "Flamefill", { about: "Floods the ground round them with fire, that burns a while.", castTime: 900, cooldown: 9000, damage: [26, 38], area: 2.2, effect: { kind: "burn", chance: 0.5 }, hazard: { kind: "fire", ms: 5000, radius: 2.2 }, reaction: "fire" }),
    inferno: attack("fire", 6, "Inferno", { about: "A roaring inferno: everything near burns.", castTime: 1000, cooldown: 12000, damage: [34, 50], area: 3, effect: { kind: "burn", chance: 0.6 }, stagger: 400, reaction: "fire" }),
    hellfire: attack("fire", 7, "Hellfire", { about: "Fire from below: it falls on them and all round them, burning, throwing them down.", castTime: 1200, cooldown: 16000, damage: [44, 62], area: 4, effect: { kind: "burn", chance: 1 }, knockdown: 900, hazard: { kind: "fire", ms: 6000, radius: 3 }, reaction: "fire" }),

    // --- Earth: stone and ground ---
    rumble: attack("earth", 1, "Rumble", { about: "The ground shudders under them: may slow them.", castTime: 450, cooldown: 2500, damage: [9, 15], effect: { kind: "slow", chance: 0.2, look: "rubble" }, reaction: "crush" }),
    stoneCrush: attack("earth", 2, "Stone Crush", { about: "A stone slams into them, staggering them.", castTime: 600, cooldown: 3500, damage: [12, 18], stagger: 500, reaction: "crush" }),
    shatterstone: attack("earth", 3, "Shatterstone", { about: "Stone bursts into shards round them: they may bleed.", castTime: 700, cooldown: 5000, damage: [16, 24], area: 1.5, effect: { kind: "bleed", chance: 0.3 }, reaction: "pierce" }),
    engulf: attack("earth", 4, "Engulf", { about: "The earth rises round them and holds them.", castTime: 800, cooldown: 7000, damage: [20, 30], effect: { kind: "slow", chance: 1, look: "earth" }, reaction: "crush" }),
    earthquake: attack("earth", 5, "Earthquake", { about: "The ground heaves: everyone near's thrown down.", castTime: 900, cooldown: 9000, damage: [26, 38], area: 3, knockdown: 1200, reaction: "crush" }),
    acidify: attack("earth", 6, "Acidify", { about: "Acid wells up round them, eating at them, and pools there a while.", castTime: 1000, cooldown: 12000, damage: [34, 50], area: 2, effect: { kind: "poison", chance: 1, look: "acid" }, hazard: { kind: "acid", ms: 5000, radius: 2 }, reaction: "arcane" }),
    disintegrate: attack("earth", 7, "Disintegrate", { about: "Unmakes them: a beam that grinds flesh and stone to dust, and all near it.", castTime: 1200, cooldown: 16000, damage: [48, 66], area: 1.5, stagger: 600, reaction: "crush" }),

    // --- Air: wind and lightning ---
    hurt: attack("air", 1, "Hurt", { about: "A cutting gust.", castTime: 400, cooldown: 2500, damage: [9, 15], reaction: "slash" }),
    dustgust: attack("air", 2, "Dustgust", { about: "A gust full of grit: may blind them a moment.", castTime: 550, cooldown: 3500, damage: [12, 18], stun: 500, stunChance: 0.35, reaction: "arcane" }),
    shockbolt: attack("air", 3, "Shockbolt", { about: "A crackling bolt: may stun them.", castTime: 600, cooldown: 5000, damage: [16, 24], stun: 900, stunChance: 0.4, reaction: "arcane" }),
    lightning: attack("air", 4, "Lightning", { about: "Lightning that leaps on to two more foes near them.", castTime: 700, cooldown: 7000, damage: [20, 30], chain: 2, falls: 0.7, reaction: "arcane" }),
    thunderbolt: attack("air", 5, "Thunderbolt", { about: "A thunderbolt that throws them down.", castTime: 900, cooldown: 9000, damage: [26, 38], knockdown: 1000, reaction: "arcane" }),
    tornado: attack("air", 6, "Tornado", { about: "A whirlwind round them: everyone near's lifted and tossed.", castTime: 1000, cooldown: 12000, damage: [34, 50], area: 3, stun: 1200, stunChance: 1, reaction: "arcane" }),
    ionize: attack("air", 7, "Ionize", { about: "The air itself turns to lightning: it leaps from foe to foe, stunning them.", castTime: 1200, cooldown: 16000, damage: [44, 62], area: 2, chain: 4, falls: 0.8, stun: 800, stunChance: 1, reaction: "arcane" }),

    // --- Water: scalding, bleeding, freezing, rotting ---
    blister: attack("water", 1, "Blister", { about: "Scalding water: may leave them burning.", castTime: 450, cooldown: 2500, damage: [9, 15], effect: { kind: "burn", chance: 0.15, look: "scald" }, reaction: "arcane" }),
    waterbolt: attack("water", 2, "Waterbolt", { about: "A bolt of water that knocks them back.", castTime: 600, cooldown: 3500, damage: [12, 18], stagger: 500, reaction: "punch" }),
    steamblast: attack("water", 3, "Steamblast", { about: "A blast of steam round them: it scalds all near.", castTime: 700, cooldown: 5000, damage: [16, 24], area: 1.5, effect: { kind: "burn", chance: 0.4, look: "scald" }, reaction: "arcane" }),
    bloodboil: attack("water", 4, "Bloodboil", { about: "Their blood boils in them: they bleed.", castTime: 800, cooldown: 7000, damage: [20, 30], effect: { kind: "bleed", chance: 1 }, reaction: "arcane" }),
    iceblade: attack("water", 5, "Iceblade", { about: "A blade of ice: it chills them, slowing them.", castTime: 900, cooldown: 9000, damage: [26, 38], effect: { kind: "slow", chance: 1, look: "frost" }, reaction: "slash" }),
    putrify: attack("water", 6, "Putrify", { about: "Foul water that rots: sickens everyone near, and lies there festering a while.", castTime: 1000, cooldown: 12000, damage: [34, 50], area: 2, effect: { kind: "disease", chance: 1 }, hazard: { kind: "rot", ms: 6000, radius: 2 }, reaction: "arcane" }),
    absoluteZero: attack("water", 7, "Absolute Zero", { about: "Cold beyond cold: everyone near's frozen solid, then slowed.", castTime: 1200, cooldown: 16000, damage: [44, 62], area: 3, stun: 1500, stunChance: 1, effect: { kind: "slow", chance: 1, look: "frost" }, reaction: "arcane" }),

    // --- Hexes (the Hexes skill: core/progress.js) ---
    stun: { label: "Stun", about: "Stuns an enemy a few moments.", target: "enemy", castTime: 400, reach: SPELL_REACH.reach + SPELL_REACH.hexes, cooldown: 3000, stun: 3000 },
    hold: { label: "Hold", about: "Holds an enemy fast a good while.", target: "enemy", castTime: 600, reach: SPELL_REACH.reach + SPELL_REACH.hexes, cooldown: 6000, stun: 6000, like: "stun" },

    // --- Learnt from tomes (each once found or given: progress.js TOMES) ---
    // Wards: on oneself or a friend, five minutes
    resistFire: ward("Resist Fire", "Wards against fire: 30% less from fire spells and flames, and burning ends sooner and hurts less.", { schools: ["fire"], elements: ["fire"], afflictions: ["burn"] }),
    resistWater: ward("Resist Water", "Wards against water and ice: 30% less from water spells, scalding and frost, and chills end sooner.", { schools: ["water"], elements: ["water"], looks: ["frost", "scald"] }),
    resistAir: ward("Resist Air", "Wards against wind and lightning: 30% less from air spells, and stuns from them end sooner.", { schools: ["air"], elements: ["air"] }),
    resistEarth: ward("Resist Earth", "Wards against stone and soil: 30% less from earth spells, and roots and rubble hold them less long.", { schools: ["earth"], elements: ["earth"], looks: ["roots", "rubble", "earth", "acid"] }),
    resistMagic: ward("Resist Magic", "Wards against all magic: 30% less from every spell, curses and wisps' bolts, and hexes hold less long.", { schools: ["fire", "water", "air", "earth", "magic"], elements: ["magic"], afflictions: ["wither"] }),
    resistPoison: ward("Resist Poison", "Wards against venom: poison hurts 30% less, and ends sooner.", { afflictions: ["poison"] }),
    resistDisease: ward("Resist Disease", "Wards against sickness: disease hurts 30% less, and ends sooner.", { afflictions: ["disease"] }),

    // Cures: on anyone
    curePoison: cure("Cure Poison", "Draws the venom out: ends poisoning, on anyone.", "poison"),
    cureSickness: cure("Cure Disease", "Purges a sickness: ends disease, on anyone.", "disease"),
    liftCurse: cure("Lift Curse", "Breaks a curse: ends withering, on anyone.", "wither"),
    quench: cure("Quench", "Puts out the flames: ends burning, on anyone.", "burn"),
    staunch: cure("Staunch", "Closes a wound: ends bleeding, on anyone.", "bleed"),
    unbind: cure("Unbind", "Frees the limbs: ends being slowed (webs, roots, frost), on anyone.", "slow"),
    embolden: tome("Embolden", "common", { about: "Courage: ends Fear, on anyone.", target: "any", castTime: 500, cooldown: 6000, cures: ["fear"] }),

    // Wonders
    zombify: tome("Zombify", "uncommon", { about: "Raises an enemy fallen in the last half minute near you to follow you and fight for you, five minutes. Needs a grimoire in hand.", target: "corpse", needs: "grimoire", castTime: 1200, cooldown: 30000, lasts: LASTING }),
    teleport: tome("Teleport", "uncommon", { about: "Takes you in an instant to somewhere, anywhere, in the world. Those with you are left behind.", target: "self", castTime: 1500, cooldown: 60000 }),
    swole: tome("Swole", "uncommon", { about: "Strength swelling in you: running and fighting take a quarter of the breath, five minutes.", target: "self", castTime: 600, cooldown: 30000, lasts: LASTING, stamina: 0.25 }),
    reflect: tome("Reflect", "uncommon", { about: "A barrier round you turning a fifth of every blow and spell back on whoever dealt it, five minutes. Needs a wand in hand.", target: "self", needs: "wand", castTime: 800, cooldown: 30000, lasts: LASTING, reflect: 0.2 }),
    invisibility: tome("Invisibility", "rare", { about: "Unseen, five minutes, or till you strike, cast, talk, trade or use anything: most won't see you at all, the mightiest may, the longer you're near them.", target: "self", castTime: 1000, cooldown: 60000, lasts: LASTING }),
    wordOfRecall: tome("Word of Recall", "uncommon", { about: "Takes you in an instant to the door of the nearest temple. Those with you are left behind. Needs a grimoire in hand.", target: "self", needs: "grimoire", castTime: 2000, cooldown: 60000 }),
    wizardsWalk: tome("Wizard's Walk", "rare", { about: "Walk the world's paths in a step: to anywhere on the map you've uncovered. Those with you are left behind. Needs a wand in hand.", target: "place", needs: "wand", castTime: 1200, cooldown: 300000 }),
    summon: tome("Summon", "common", { about: "Calls a creature of these parts to your side to fight with you, five minutes; or calls another player (of a people not your enemy) to you, if they'll come.", target: "summon", castTime: 1500, cooldown: 60000, lasts: LASTING }),
    levitate: tome("Levitate", "common", { about: "Float a hand's breadth above the ground, five minutes: nothing on it (traps, pools, fire) touches you.", target: "self", castTime: 600, cooldown: 20000, lasts: LASTING }),
    fear: tome("Fear", "uncommon", { about: "Terror: an enemy runs blindly away, ten seconds (half that cast on them again soon after; a third time, nothing). The mighty may shrug it off; the unique always do.", target: "enemy", castTime: 500, cooldown: 8000, reach: SPELL_REACH.reach + SPELL_REACH.hexes, flee: 10000 }),
    polymorph: tome("Polymorph", "rare", { about: "Turns a creature into another of the world's creatures, any at all. The mighty may resist; the unique can't be changed.", target: "enemy", castTime: 900, cooldown: 20000 }),
    attraction: tome("Attraction", "uncommon", { about: "A puff of smoke, and out of it one of the creatures of these parts.", target: "self", castTime: 800, cooldown: 30000 }),
    inertialBarrier: tome("Inertial Barrier", "uncommon", { about: "A barrier against blows and arrows: a quarter less from them, five minutes. No help against spells.", target: "friend", castTime: 700, cooldown: 20000, lasts: LASTING, physical: 0.75 }),
    surge: tome("Surge", "uncommon", { about: "Fighting fury: blows and arrows 30% stronger, but everything hurts you 15% more, two minutes.", target: "self", castTime: 500, cooldown: 60000, lasts: 120000, might: 1.3, exposed: 1.15 }),
    pacify: tome("Pacify", "uncommon", { about: "Calms an enemy: it's no longer hostile to you (till you strike it). The mighty may resist; the unique can't be calmed.", target: "enemy", castTime: 800, cooldown: 15000 }),
    vampirism: tome("Vampirism", "uncommon", { about: "Draws the life out of an enemy into you: the more you use it, the more it draws.", target: "enemy", castTime: 700, cooldown: 6000, grows: true, drain: [[6, 10], [9, 14], [13, 19], [18, 26], [24, 34]] }),
    dodge: tome("Dodge", "uncommon", { about: "Quick as a cat: a chance to slip every blow and spell, five minutes; from one in ten, as you use it, to one in four.", target: "self", castTime: 500, cooldown: 30000, lasts: LASTING, grows: true, dodge: [0.1, 0.14, 0.18, 0.22, 0.25] }),
    light: tome("Light", "common", { about: "A globe of light over your shoulder, fifteen minutes: the dark round you as bright as day (12 m), to see by and be seen. Cast again to put it out.", target: "self", castTime: 500, cooldown: 3000, lasts: 15 * 60000, price: 10 }),
    poison: tome("Poison", "common", { about: "Poisons an enemy: it hurts them every moment or two, a while; the more you use it, the worse.", target: "enemy", castTime: 500, cooldown: 5000, grows: true, venom: [2, 3, 4, 5, 7] }),
});

/** The spells learnt from tomes, by their ids. */
export const TOMES = Object.freeze(Object.keys(SPELLS).filter((id) => SPELLS[id].tome));

/**
 * The first spell of each element's school (Burn, Rumble, Hurt, Blister): not known to begin with,
 * but learnt from its tome, sold at any adventurers' guild (progress.js SHOPS), which opens the
 * school: its later spells come as it grows (progress.js known).
 */
export const ELEMENT_TOMES = Object.freeze(Object.keys(SCHOOLS).filter((school) => school !== "healing").map((school) => SCHOOLS[school].tiers[0]));

/** What an element's tome costs at the adventurers' guild (gold). */
export const ELEMENT_TOME_PRICE = 25;

/**
 * The tomes every adventurers' guild sells besides the elements' (progress.js SHOPS): Light's, for
 * the dark (the terrain plan's M7e, §9 Day and night).
 */
export const GUILD_TOMES = Object.freeze(["light"]);

/** The thing (progress.js ITEMS id) that's a spell's tome: "tomeFear" for Fear. */
export const tomeOf = (spell) => `tome${spell[0].toUpperCase()}${spell.slice(1)}`;

/** A tome's spell, found or given (random.js random): any, each as likely as its rarity has it. */
export const rollTome = (random) => random.pickWeighted(TOMES, (id) => TOME_RARITY[SPELLS[id].tome].weight);

/** Spells known by other names before (a wheel kept from then). */
export const RENAMED = Object.freeze({ heal: "vigor", greaterHeal: "mendWounds" });

/**
 * The spell a spell looks as (its school; or itself, or the one it's a greater form of; a tome's,
 * as healing if it's a kindness, as a hex if it's cast at an enemy).
 */
export const lookOf = (id) => SPELLS[id]?.like ?? (SPELLS[id]?.school === "healing" ? "heal" : SPELLS[id]?.tome ? (SPELLS[id].target === "enemy" ? "stun" : "heal") : (SPELLS[id]?.school ?? id));

/** How much a heal restores: a whole number from its least to its most, each as likely. */
export function rollHeal(spell, random) {
    return random.int(spell.heal[0], spell.heal[1]);
}

/** How much an attack spell does, before the caster's power: a whole number from its least to its most. */
export function rollSpell(spell, random) {
    return random.int(spell.damage[0], spell.damage[1]);
}

/** A school's tier for so much experience in it (1 at least). */
export function tierAt(school, xp) {
    return SCHOOLS[school].xp.filter((at) => xp >= at).length;
}

/** Why a spell can't be cast, for people: the reasons battle.cast() gives. */
export const CAST_FAILURES = Object.freeze({
    cooldown: "Not ready yet",
    lifeless: "Nothing there to cast on",
    busy: "Can't cast right now",
    healthy: "Already at full health",
    range: "Out of reach",
    sight: "Can't see it",
    friendly: "Not something to cast that on",
    uncursed: "Nothing there for it to cure",
    wand: "Needs a wand in hand",
    grimoire: "Needs a grimoire in hand",
    corpse: "No one fallen near enough",
    hostile: "Not on an enemy",
    unread: "Not learnt yet: its tome's sold at any adventurers' guild",
});

/** A spell that grows's level (1 to 5) for so much experience in it. */
export const growthAt = (xp) => GROWTH_XP.filter((at) => xp >= at).length;
