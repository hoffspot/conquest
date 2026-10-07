// Every sound the game makes, described: what it is (`about`) and when the game plays it (`plays`),
// in groups, for the sound studio (sound-studio.html, js/lab/sound-studio.js), where each can be
// heard outside the game. Each of synth.js's SOUNDS, and each recorded sound with none made
// (sound.js RECORDED_ONLY), has its entry here (test/audio.test.js says so), so a sound added or
// changed is described with it; whether it's recorded, and by whom, is recorded.js's (made by npm
// run build:sounds), and what it's made of in code is synth.js's.

/** The groups, in the order the studio shows them. */
export const GROUPS = Object.freeze([
    "Footsteps",
    "Swings",
    "Hits",
    "Armour",
    "Drawing and putting away",
    "Launches",
    "Spells",
    "Bodies and doors",
    "Folk at work",
    "The world",
    "Cues and the interface",
]);

/** Each sound (a synth.js SOUNDS or sound.js RECORDED_ONLY name): { group, label, about, plays }. */
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
    swingSword: { group: "Swings", label: "Sword", about: "A sabre cutting the air edge first: short and bright.", plays: "Every sword blow, loudest as it lands." },
    swingCleaver: { group: "Swings", label: "Cleaver", about: "The same sabre's broader cuts: a heavier swish.", plays: "Every cleaver blow, loudest as it lands." },
    swingStaff: { group: "Swings", label: "Staff", about: "A bamboo staff whooshing round.", plays: "Every quarterstaff blow, loudest as it lands." },
    swingHammer: { group: "Swings", label: "War hammer", about: "The sabre swung flat: a low, slow whomp.", plays: "Every war hammer blow, loudest as it lands." },
    swingPunch: { group: "Swings", label: "Punch", about: "A sleeve whooshing as the fist's thrown.", plays: "Every punch, loudest as it lands." },
    swingKick: { group: "Swings", label: "Kick", about: "A fighter's quick dodge and swing: a short swish of cloth.", plays: "Every kick, loudest as it lands." },
    swingWand: { group: "Swings", label: "Wand", about: "A thin bamboo stick flicked through the air.", plays: "Every flick of a wand, as its bolt's let go." },

    // Hits (sound.js hit: by the blow's reaction, core/weapons.js)
    slash: { group: "Hits", label: "Slash", about: "A blade biting: a sharp, wet slap (a wet towel on a bare back, its brighter half).", plays: "A sword's cut landing on anyone." },
    hack: { group: "Hits", label: "Hack", about: "A heavy blade chopping in: a deeper, wet slap.", plays: "A cleaver's blow landing." },
    strike: { group: "Hits", label: "Strike", about: "A wooden staff cracking on a body.", plays: "A staff's blow landing." },
    crush: { group: "Hits", label: "Crush", about: "A heavy blunt blow: a deep, meaty thud.", plays: "A war hammer's blow landing." },
    block: { group: "Hits", label: "Block", about: "A blow caught on wood: a hard knock (a blade on an ash spear shaft).", plays: "A blow taken on a shield (a blade's rings on it instead: Clash)." },
    clash: { group: "Hits", label: "Clash", about: "Steel ringing on steel (a sabre on a sword).", plays: "A sword's or a cleaver's blow, or a skeleton's rusty sword, caught on a shield's iron." },
    pierce: { group: "Hits", label: "Pierce", about: "An arrow thunking into a body.", plays: "An arrow striking anyone." },
    punch: { group: "Hits", label: "Punch", about: "A fist landing: a meaty thud (fists on a punching bag).", plays: "A punch landing." },
    kick: { group: "Hits", label: "Kick", about: "A boot driving in: a heavy thud.", plays: "A kick landing." },
    arcane: { group: "Hits", label: "Arcane", about: "A bolt of magic striking: a bright zap.", plays: "An arcane bolt, and the spells without a hit of their own, landing on anyone." },
    fire: { group: "Hits", label: "Fire", about: "Fire bursting on a body: a roar of flame.", plays: "A fire spell landing on anyone." },

    // Armour (sound.js ARMOUR: what's worn over the chest, game.js armourOf)
    hitMail: { group: "Armour", label: "Blow on mail", about: "Mail's rings shaken by a blow: a short, bright jangle.", plays: "Under a weapon's or a fist's blow landing on anyone in a mail shirt." },
    hitPlate: { group: "Armour", label: "Blow on plate", about: "Steel plate struck: a hard, flat clank.", plays: "Under a blow landing on anyone in a breastplate." },
    hitLeather: { group: "Armour", label: "Blow on leather", about: "Thick leather struck: a dull slap.", plays: "Under a blow landing on anyone in a leather jerkin or a hide vest." },
    mailJingle: { group: "Armour", label: "Mail on the move", about: "Mail's rings shifting with a step.", plays: "With each step of anyone in a mail shirt, a little under the footstep." },
    plateClank: { group: "Armour", label: "Plate on the move", about: "Plates knocking together with a step (a knight walking in armour).", plays: "With each step of anyone in a breastplate, a little under the footstep." },
    clothRustle: { group: "Armour", label: "Leather on the run", about: "A jacket swishing.", plays: "With each running step of anyone in a leather jerkin or a hide vest." },

    // Drawing and putting away (game.js #draw)
    unsheathe: { group: "Drawing and putting away", label: "Draw a sword", about: "A blade drawn from a leather sheath: a quiet scrape, no film's ring.", plays: "Drawing a sword (after a shield's slung off the back)." },
    sheathe: { group: "Drawing and putting away", label: "Sheathe a sword", about: "A blade slid home into leather.", plays: "Putting a sword away." },
    unsling: { group: "Drawing and putting away", label: "Unsling", about: "Something taken off the back, or put back there: a strap's creak and a wooden knock.", plays: "Drawing or putting away a staff, a hammer, a cleaver, a bow or a wand." },
    shieldSling: { group: "Drawing and putting away", label: "Shield slung", about: "A shield's strap creaking and its boards' thud as it's slung.", plays: "A shield slung off the back before a weapon's drawn, or onto it after it's put away." },
    grimoire: { group: "Drawing and putting away", label: "Grimoire", about: "A heavy book handled: its cover and pages.", plays: "Drawing or putting away a grimoire." },
    knuckles: { group: "Drawing and putting away", label: "Fists up", about: "Hands closing into fists: soft leather creaking.", plays: "Raising the fists, or the boots' kicks, to fight." },

    // Launches (sound.js launch)
    arrowQuiver: { group: "Launches", label: "Arrow from the quiver", about: "An arrow drawn from a leather quiver.", plays: "A bow's shot starting." },
    bowDraw: { group: "Launches", label: "Bow drawn", about: "An English longbow drawn: the string and the wood creaking.", plays: "A bow's shot, as it's drawn back." },
    arrow: { group: "Launches", label: "Arrow loosed", about: "An English longbow loosed: the string's thrum and the arrow leaving.", plays: "An arrow loosed from a bow." },
    bolt: { group: "Launches", label: "Bolt", about: "A crackling bolt of magic in flight.", plays: "Casting Stun and the spells without a sound of their own; creatures' venom, webs, curses, wails and the like flying." },
    fireball: { group: "Launches", label: "Fireball", about: "A ball of fire whooshing away.", plays: "Casting a fire spell; a creature's lava or flame flying." },

    // Spells
    castHeal: { group: "Spells", label: "Casting a heal", about: "A rising shimmer.", plays: "Casting a healing spell." },
    healed: { group: "Spells", label: "Healed", about: "A warm swell as the healing lands.", plays: "A heal landing on someone; a priest's blessing." },
    stun: { group: "Spells", label: "Stunned", about: "A zap and a dizzy warble.", plays: "Someone stunned." },

    // Bodies and doors
    fall: { group: "Bodies and doors", label: "A body falling", about: "A body hitting the ground (a person falling on a wooden floor), from its first heavy contact.", plays: "Anyone falling, dead or knocked down, as they hit the ground." },
    fallArmoured: { group: "Bodies and doors", label: "An armoured body falling", about: "A body falling, with mail rattling down after it.", plays: "Anyone in mail or plate falling, as they hit the ground." },
    dropWeapon: { group: "Bodies and doors", label: "A weapon dropped", about: "Iron clattering onto a hard floor.", plays: "Anyone armed falling dead: what they fought with, just after they hit the ground." },
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
