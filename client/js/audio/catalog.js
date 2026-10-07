// Every sound the game makes, described: what it is (`about`) and when the game plays it (`plays`),
// in groups, for the sound studio (sound-studio.html, js/lab/sound-studio.js), where each can be
// heard outside the game. Each of synth.js's SOUNDS has its entry here (test/audio.test.js says
// so), so a sound added or changed is described with it; whether it's recorded, and by whom, is
// recorded.js's (made by npm run build:sounds), and what it's made of in code is synth.js's.

/** The groups, in the order the studio shows them. */
export const GROUPS = Object.freeze([
    "Footsteps",
    "Swings",
    "Hits",
    "Drawing and putting away",
    "Launches",
    "Spells",
    "Bodies and doors",
    "Folk at work",
    "The world",
    "Cues and the interface",
]);

/** Each sound (a synth.js SOUNDS name): { group, label, about, plays }. */
export const CATALOG = Object.freeze({
    // Footsteps (sound.js step: audio/footing.js picks the footing)
    stepGrass: { group: "Footsteps", label: "Grass", about: "A footfall on grass: soft-soled boots brushing through the blades, a muffled thud under them.", plays: "Each foot landing on grass, meadow, farmland's pasture and most land out in the world." },
    stepDirt: { group: "Footsteps", label: "Dirt", about: "A footfall on packed earth: a dull thud and a little grit.", plays: "Each foot landing on a road, a track, or ploughed soil." },
    stepStone: { group: "Footsteps", label: "Stone", about: "A footfall on stone: a soft-soled thud, the stone's short knock and a scrape of grit.", plays: "Each foot landing on cobbles, a courtyard's flags, or a stone bridge's deck." },
    stepWood: { group: "Footsteps", label: "Wood", about: "A footfall on boards: a hollow thud with the boards' low ring.", plays: "Each foot landing on a floor's boards, a wooden bridge or a jetty; the treads going up and down stairs; a guard's stamp to attention." },
    stepSand: { group: "Footsteps", label: "Sand", about: "A footfall on wet sand: a soft, damp crunch.", plays: "Each foot landing on a beach, or a road through sand." },
    stepSnow: { group: "Footsteps", label: "Snow", about: "A footfall in snow: snow packing down underfoot, a squeaky crunch.", plays: "Each foot landing in the snow and the tundra, and anywhere above 225 m." },
    stepGravel: { group: "Footsteps", label: "Scree", about: "A footfall on loose stones: a rattling crunch.", plays: "Each foot landing on mountains, badlands and the volcano's ash, and anywhere from 175 m up to the snow." },
    stepMud: { group: "Footsteps", label: "Mud", about: "A footfall in mud: a wet slap as the foot sinks, a suck as it pulls free.", plays: "Each foot landing in the marsh, or on ploughed soil there." },
    stepLeaves: { group: "Footsteps", label: "Leaf litter", about: "A footfall in dry leaves: a crackling rustle.", plays: "Each foot landing in the woods, the dark wood, the elves' wood and the jungle." },
    stepWater: { group: "Footsteps", label: "Wading", about: "Wading through shallow water: a splash and a slosh round the legs.", plays: "Each foot landing in a river's ford, a stream, or the shallows." },
    skitter: { group: "Footsteps", label: "Spider's legs", about: "Many hard legs ticking down one after another.", plays: "A cave spider's or a scorpion's footfalls, whatever the ground." },
    squelch: { group: "Footsteps", label: "Slime", about: "A wet belly flopping along, with a few bubbles.", plays: "A slime's or a magma slime's footfalls; and a bog frog's webbed feet, higher and softer." },
    slither: { group: "Footsteps", label: "Serpent", about: "Scales sliding over the ground.", plays: "A snake's footfalls, whatever the ground." },

    // Swings (sound.js attack: timed so each is loudest as the blow lands)
    swingSword: { group: "Swings", label: "Sword", about: "A sword cutting through the air: short and bright.", plays: "Every sword blow, loudest as it lands." },
    swingCleaver: { group: "Swings", label: "Cleaver", about: "A heavier, shorter cut through the air.", plays: "Every cleaver blow, loudest as it lands." },
    swingStaff: { group: "Swings", label: "Staff", about: "A long wooden pole swung: lower and broader.", plays: "Every quarterstaff blow, loudest as it lands." },
    swingHammer: { group: "Swings", label: "War hammer", about: "A heavy two-handed swing: low and slow.", plays: "Every war hammer blow, loudest as it lands." },
    swingPunch: { group: "Swings", label: "Punch", about: "A fist thrown: a quick, light rush of air.", plays: "Every punch, loudest as it lands." },
    swingKick: { group: "Swings", label: "Kick", about: "A leg swung: a short swish.", plays: "Every kick, loudest as it lands." },

    // Hits (sound.js hit: by the blow's reaction, core/weapons.js)
    slash: { group: "Hits", label: "Slash", about: "A blade biting: a sharp crack with a ring of steel.", plays: "A sword's cut landing on anyone." },
    hack: { group: "Hits", label: "Hack", about: "A heavy blade chopping in: a deep chop and a dull ring.", plays: "A cleaver's blow landing." },
    strike: { group: "Hits", label: "Strike", about: "Wood knocking hard on a body.", plays: "A staff's blow landing." },
    crush: { group: "Hits", label: "Crush", about: "A heavy blunt blow: a deep thud.", plays: "A war hammer's blow landing." },
    block: { group: "Hits", label: "Block", about: "A blow caught on a shield: the boards' thud, the boss and rim ringing.", plays: "A blow taken on a shield." },
    pierce: { group: "Hits", label: "Pierce", about: "An arrow thunking in.", plays: "An arrow striking anyone." },
    punch: { group: "Hits", label: "Punch", about: "A fist landing: a meaty thud.", plays: "A punch landing." },
    kick: { group: "Hits", label: "Kick", about: "A spiked boot driving in: a heavy thud, a crack of leather and the spikes biting.", plays: "A kick landing." },
    arcane: { group: "Hits", label: "Arcane", about: "A bolt of magic striking: a bright zap.", plays: "An arcane bolt, and the spells without a hit of their own, landing on anyone." },
    fire: { group: "Hits", label: "Fire", about: "Fire bursting on a body: a roar of flame.", plays: "A fire spell landing on anyone." },

    // Drawing and putting away (game.js #draw)
    unsheathe: { group: "Drawing and putting away", label: "Draw a sword", about: "A blade drawn from its scabbard, ringing as it leaves.", plays: "Drawing a sword (after a shield's slung off the back)." },
    sheathe: { group: "Drawing and putting away", label: "Sheathe a sword", about: "A blade slid home: a scrape and the click of the hilt.", plays: "Putting a sword away." },
    unsling: { group: "Drawing and putting away", label: "Unsling", about: "Something taken off the back, or put back there: a strap's creak and a knock.", plays: "Drawing or putting away a staff, a hammer, a cleaver, a bow, a wand or a grimoire; a shield slung off the back or onto it." },
    knuckles: { group: "Drawing and putting away", label: "Fists up", about: "Fists clenched: the knuckles cracking.", plays: "Raising the fists, or the boots' kicks, to fight." },

    // Launches (sound.js launch)
    arrow: { group: "Launches", label: "Arrow loosed", about: "A bowstring's thrum and the arrow leaving.", plays: "An arrow loosed from a bow." },
    bolt: { group: "Launches", label: "Bolt", about: "A crackling bolt of magic in flight.", plays: "Casting Stun and the spells without a sound of their own; creatures' venom, webs, curses, wails and the like flying." },
    fireball: { group: "Launches", label: "Fireball", about: "A ball of fire whooshing away.", plays: "Casting a fire spell; a creature's lava or flame flying." },

    // Spells
    castHeal: { group: "Spells", label: "Casting a heal", about: "A rising shimmer.", plays: "Casting a healing spell." },
    healed: { group: "Spells", label: "Healed", about: "A warm swell as the healing lands.", plays: "A heal landing on someone; a priest's blessing." },
    stun: { group: "Spells", label: "Stunned", about: "A zap and a dizzy warble.", plays: "Someone stunned." },

    // Bodies and doors
    fall: { group: "Bodies and doors", label: "A body falling", about: "A body hitting the ground, and its gear after it.", plays: "Anyone falling, dead or knocked down, as they hit the ground." },
    door: { group: "Bodies and doors", label: "A door", about: "The latch lifting, the hinges creaking as it swings, and it banging shut.", plays: "Anyone going through a door on the player's side of it." },

    // Folk at work (game.js ACTS: the folk's acts in the tavern, the smithy, the guild)
    clink: { group: "Folk at work", label: "Tankards", about: "Pewter tankards knocked together in a toast, or one set down.", plays: "A patron's toast; a serving wench setting down a tankard." },
    pour: { group: "Folk at work", label: "Ale poured", about: "Ale drawn from a barrel's tap into a tankard, gurgling as it fills.", plays: "The barkeep pouring." },
    anvil: { group: "Folk at work", label: "Anvil", about: "A hammer on hot iron on the anvil: a bright ring over a dull knock.", plays: "The smith forging, three blows at a time." },
    hiss: { group: "Folk at work", label: "Quenching", about: "Hot iron plunged in the trough: a hiss of steam dying away.", plays: "The smith quenching the work." },
    bellows: { group: "Folk at work", label: "Bellows", about: "The bellows' breath.", plays: "The smith's assistant pumping the bellows; the forge's fire stirred." },
    grind: { group: "Folk at work", label: "Grindstone", about: "A blade on the grindstone, rasping as it turns.", plays: "The smith's assistant cranking the grindstone." },
    rustle: { group: "Folk at work", label: "Papers", about: "A few dry crinkles of paper: a notice taken down or filed, a page turned.", plays: "The guild's receptionist filing, and the folk reading." },

    // The world (the environment's bus)
    bird: { group: "The world", label: "A bird", about: "A bird's chirp.", plays: "Out in the world, now and then (every 4 to 14 seconds), somewhere round the player." },
    leaves: { group: "The world", label: "Leaves", about: "Leaves rustling in the wind.", plays: "From a tree within 22 metres, now and then." },
    crackle: { group: "The world", label: "Hearth", about: "A few pops and snaps over the soft rush of the flames.", plays: "From the tavern's hearth, every 0.2 to 0.9 seconds." },

    // Cues and the interface
    wheel: { group: "Cues and the interface", label: "Action wheel", about: "A quick swish and a soft note.", plays: "The action wheel opening." },
    denied: { group: "Cues and the interface", label: "Refused", about: "Two low notes, falling.", plays: "A slice of the wheel that can't be used; anything refused (no gold, too far, on cooldown)." },
    lock: { group: "Cues and the interface", label: "Target", about: "Two quick rising notes.", plays: "An enemy chosen to fight." },
    slain: { group: "Cues and the interface", label: "Slain", about: "A rising run of four notes.", plays: "A foe the player or a follower felled, or one the player fought in the last 30 seconds, hitting the ground." },
    fallen: { group: "Cues and the interface", label: "Fallen", about: "Three falling notes, sombre.", plays: "The player falling." },
    coins: { group: "Cues and the interface", label: "Coins", about: "A few coins chinking together.", plays: "Gold found on a creature, gold paid or received." },
    wake: { group: "Cues and the interface", label: "Waking", about: "A gentle rising chime.", plays: "Waking again after falling; a spell learnt; a request granted; a quest done." },
    breath: { group: "Cues and the interface", label: "Out of breath", about: "A tired breath.", plays: "The player running out of stamina." },
});

/** What else the studio can play, not one of SOUNDS: the wind, and the music in each place. */
export const LOOPS = Object.freeze({
    wind: { group: "The world", label: "The wind", about: "A quiet wind, a ten-second loop without a seam.", plays: "Out in the world, always, under everything." },
});

/** The music, by where it's heard (each of sound.js's PLACES). */
export const MUSIC = Object.freeze({
    town: { label: "The town's score", about: "A Bard's Tale-style score in D Dorian, on recordings of real old instruments (recorder, ocarina, folk harp, strumstick, harpsichord, organ, chimes, frame drum).", plays: "Out in the world and the towns." },
    taproom: { label: "The tavern's jig", about: "A lively jig led by a lute (a classical guitar's nylon strings), with recorder and drum.", plays: "In a tavern's taproom." },
    upstairs: { label: "Upstairs in the tavern", about: "The tavern's jig, quieter and muffled, heard through the floor.", plays: "Upstairs in a tavern." },
    smithy: { label: "In a smithy", about: "The town's music as if through the smithy's walls, under the forge's roar.", plays: "In a smithy." },
    temple: { label: "In a temple", about: "The town's music hushed, far off through thick walls.", plays: "In a temple." },
    guild: { label: "In an adventurers' guild", about: "The tavern's jig, a little quieter: the guild's as lively.", plays: "In an adventurers' guild." },
    hall: { label: "In a town hall", about: "The town's music through the hall's windows.", plays: "In a town hall." },
    keep: { label: "In a keep", about: "The town's music far off through stone.", plays: "In a keep, a castle's or a citadel's." },
    undercroft: { label: "In an undercroft", about: "The town's music further off yet, under the keep's great hall.", plays: "In a castle keep's undercroft, with its smith, quartermaster and arcanist." },
    cave: { label: "In a cave", about: "The world outside barely heard.", plays: "In a cave." },
    lair: { label: "In the dragon's lair", about: "The world outside barely heard, deeper in.", plays: "In the dragon's lair." },
    crypt: { label: "In a crypt", about: "The world above barely heard through the floor.", plays: "In a crypt under a hall." },
    ruin: { label: "In a ruined keep", about: "The world outside through broken walls, open to the sky.", plays: "In a ruined keep." },
    tower: { label: "In a watchtower", about: "The world outside through the tower's stones.", plays: "In a broken watchtower." },
});
