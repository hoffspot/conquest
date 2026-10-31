// The bestiary's words for each creature (core/creatures.js CREATURES, by the same ids), shown by
// core/bestiary.js and the journal's bestiary as a kind's page fills in: its `lore`, what it is
// and how it lives, as a hunter's notebook would have it; and its `sign`, the sign of it a
// tracker finds on its trail.

export const BESTIARY_LORE = Object.freeze({
    rat: Object.freeze({
        lore: "A rat grown as big as a terrier, met anywhere near home, alone or in pairs. It comes for whoever it sees, however much bigger they are, and its bite can carry a sickness that leaves you slow to get your wind back.",
        sign: "small clawed prints with a tail's drag-line between them",
    }),
    porcupine: Object.freeze({
        lore: "A slow, quill-backed gnawer of the woods, meadows, heaths and farmland near home. It wants nothing to do with anyone and fights only whoever strikes it; then it bristles, and its quills draw blood.",
        sign: "shed quills in the leaf litter, and bark gnawed from roots",
    }),
    slime: Object.freeze({
        lore: "A green jelly, clear enough to see through, creeping over the meadows, fields and wet woods near home. It minds its own business until it's struck, then slams its weight into whoever did it, hard enough to stagger them.",
        sign: "a glistening smear that hasn't dried",
    }),
    bats: Object.freeze({
        lore: "A swarm of bats, met anywhere, out only after dark and gone to roost by daybreak. They see in the dark as well as by day, come for anyone they find, and their bites can carry a sickness. A swarm is too loose a thing for any blast to throw.",
        sign: "droppings under a rock overhang",
    }),
    wolf: Object.freeze({
        lore: "Grey wolves run in packs of two to four through the woods, heaths, tundra and snows a little way out from home. They hunt mostly by night, see in the dark as well as by day, and come for anyone they see; a bite can lay a wound open.",
        sign: "a line of four-toed prints, claws showing, in single file",
    }),
    boar: Object.freeze({
        lore: "A wild boar, bristled and tusked, rooting through the woods, fields, heaths and jungle. It lets no one come near: step within a few paces and it charges, its tusks goring deep. Its meat is good to eat, and heals.",
        sign: "split-hoof prints and the earth rooted up",
    }),
    snake: Object.freeze({
        lore: "A small viper, zig-zagged down its back, of the heaths, meadows, marshes and dry lands. It keeps to itself until someone treads near, then strikes, and spits venom that lies on the ground a moment; either can leave whoever it catches poisoned.",
        sign: "a thin wavy line through the dust",
    }),
    bandit: Object.freeze({
        lore: "Outlaws living off the roads through the farmland, meadows, woods and heaths, met in ones to threes. They come for anyone they see, sword in hand, dressed as rogues. What they leave is what they stole: a little gold, some gear, now and then a spell's tome.",
        sign: "boot prints, a dropped strap, the ash of a small fire",
    }),
    banditChief: Object.freeze({
        lore: "The leader of an outlaw band, met only where the band has taken a place (a manor, an abbey, a windmill, a watchtower, a cave) or keeps an adventurer's lost cache. Bigger than the rest, in a warrior's harness that turns a good share of every blow, the chief stands by the loot and fights for it.",
        sign: "one heavy boot among many, and a tally carved in wood",
    }),
    bear: Object.freeze({
        lore: "A brown bear of the woods, mountains, tundra and dark woods further out. It lets no one near: come within a few strides and it comes at you, mauling, too heavy for any blast to throw. The caves hold bigger ones still.",
        sign: "a broad flat-footed print, and claw marks high on a trunk",
    }),
    puma: Object.freeze({
        lore: "A tawny cat of the mountains, woods, heaths, badlands and dark woods. It hunts mostly by night, sees in the dark as well as by day, and springs on whoever comes too near its ground; its claws rake wounds open.",
        sign: "round clawless prints, and a kill buried under leaves",
    }),
    direWolf: Object.freeze({
        lore: "Half as big again as a grey wolf, near black and maned, its eyes glowing red, it roams the tundra, snows, woods and mountains far out. Dire wolves hunt in ones to threes, mostly by night, and see in the dark. A werewolf gathers them to run at its heels.",
        sign: "wolf prints as broad as a man's palm, pressed deep",
    }),
    werewolf: Object.freeze({
        lore: "Someone under a curse, out only by night, far out in the woods, heaths, tundra and mountains. It hunts at the head of the wolves and dire wolves it calls to it, rakes with its claws and springs with its whole weight behind it; at daybreak, unseen, it goes with the night.",
        sign: "wolf tracks, and among them a bigger print walking upright",
    }),
    goblin: Object.freeze({
        lore: "Goblins go about the heaths, mountains, badlands and woods in raiding parties of two to five, cleavers in hand. Bombers go among them, and now and then a party's led by the Goblin King. Their camps are often near a cave.",
        sign: "many small prints together, and loot dropped in a hurry",
    }),
    goblinBomber: Object.freeze({
        lore: "The slighter goblin with a sack of bombs on its back and a leather cap against the sparks, never met but among a raiding party. It keeps its distance and lobs lit bombs that fizz a moment and burst, throwing whoever's caught off their feet. Its spare bombs can be taken and thrown.",
        sign: "burnt fuse ends, and a blackened crater in the turf",
    }),
    goblinKing: Object.freeze({
        lore: "The goblins' elite: as tall as a man, broad, crowned and caped in red edged with gold, leading a war band of raiders and bombers. It swings a great cleaver up close and hurls a bigger bomb at whoever keeps off. On a cave's throne it's harder still.",
        sign: "a scrap of red cloth edged with gold, among goblin tracks",
    }),
    orcWarlord: Object.freeze({
        lore: "An orc come down out of the orcs' lands to take a cave for his own, its goblins his raiders and bombers now. Half as tall again as a man, brown-skinned and red-eyed, in trousers, boots and bracers, he swings a great axe two-handed: swept round, chopped down or spun low, each blow laying a wound open. Too heavy for any blast to throw.",
        sign: "an axe's bite in the cave's timbers, and goblin tracks all round",
    }),
    orcReaver: Object.freeze({
        lore: "An orc cast out of his own kind, at the head of the outlaws in their hideout. Red-skinned and yellow-eyed, bare-legged and barefoot in a loincloth, he's quicker than the Warlord and nearly as strong, his great axe swept, chopped or spun round low, each blow laying a wound open. The outlaws say he was born to a clan-king's tent, and that the brand between his shoulders was put there by his own brother.",
        sign: "bare orc footprints, broad and clawed, among the outlaws' boots",
    }),
    skeleton: Object.freeze({
        lore: "The bones of the long dead, risen with a rusty sword in hand and a light deep in each socket. Out in the marshes, heaths and tundra they walk only after dark, but those of the undead camps, the ruins and the graveyards are always there. A cut from that old blade can leave a sickness.",
        sign: "bare bone toe-marks in the mud, and flakes of rust",
    }),
    cultist: Object.freeze({
        lore: "Robed followers of whatever the hells' portals let through, met in the marshes, jungle, dark woods and burning lands, oftener by night at their rites. They strike with wands and pitch their camps by the old ruins. At a hell's way in they stand round their high priest till daybreak.",
        sign: "candle stubs, and a ring burnt in the grass",
    }),
    troll: Object.freeze({
        lore: "A great grey-green brute half as tall again as a man, met in the mountains, snows, tundra and heaths far out. Trolls come at anyone they see, hammer in hand, too heavy for any blast to throw, and goblins work under them. A troll's blood heals more than any meat.",
        sign: "huge bare footprints, and branches snapped at shoulder height",
    }),
    ogre: Object.freeze({
        lore: "A huge, pot-bellied brute of the badlands, heaths, mountains, savannah and marshes, swinging a hammer at anyone it sees. Ogres lead goblin raiders, and outlaws hire them to guard their hideouts. No blast will throw one.",
        sign: "flattened grass where something huge sat, and cracked marrow bones",
    }),
    wyvern: Object.freeze({
        lore: "A lesser dragon of the mountains, badlands, burning lands and snows, met alone or in pairs and often seen flying over. It comes down out of the sky to fight, biting or bringing its tail's sting over, venomous. Wyverns guard the drake's lair and the Dreadthorns'; a wyvern's fall is always news.",
        sign: "a three-toed print as long as a forearm, a shed scale",
    }),
    blackShuck: Object.freeze({
        lore: "A great black hound with eyes like coals, found only in the humans' wilds and only after dark. It is more shadow than flesh: struck, it spills darkness, not blood, and its bite leaves a withering. Old folk say whoever meets its eyes won't see the year out.",
        sign: "huge paw prints that begin nowhere and end nowhere",
    }),
    boggart: Object.freeze({
        lore: "A small, hairy spite of the humans' wilds, child-high and long in the arm. It claims a patch of ground and flies at whoever sets foot near, its claws carrying a sickness. Country folk say never to give a boggart a name, for then there's no reasoning with it.",
        sign: "small splay-toed prints, and coarse brown hair caught on brambles",
    }),
    badger: Object.freeze({
        lore: "An old badger, white-faced, of the woods, heaths and meadows of the humans' wilds. It's out mostly by night, sees in the dark, and holds its ground against anyone who comes too close; its bite can open a wound.",
        sign: "a broad five-toed print, long claws showing, near a sett",
    }),
    wildBull: Object.freeze({
        lore: "A white bull of the old park herds, dark at the ears and muzzle, its horns sweeping out and up. It grazes the humans' meadows and fields alone or in pairs, and charges whoever comes near, goring. No blast will shift it.",
        sign: "broad cloven prints, and white hairs on a rubbing post",
    }),
    rookFlock: Object.freeze({
        lore: "A black, pale-beaked flock of rooks over the humans' fields and meadows. They keep their own patch of sky and mob whoever comes near, pecking hard enough to draw blood. Farmers say a rookery that leaves its trees takes the land's luck with it.",
        sign: "black feathers, and pecked-over furrows under tall elms",
    }),
    knucker: Object.freeze({
        lore: "A water dragon of the humans' wilds, a great dark serpent with a finned head, living in a knuckerhole: a still, spring-fed pool the villagers swear has no bottom. It guards its pool, biting, spitting venom and throwing its coils round whoever it catches, and it's too heavy for any blast to throw.",
        sign: "a broad flattened track through the reeds to a still pool",
    }),
    hodmedod: Object.freeze({
        lore: "A scarecrow come alive, out only by night in the humans' fields: a sack for a head, its eyes alight and its mouth stitched, straw spilling from its cuffs. It walks the furrows with a sickle and reaps whoever it finds. Struck, it bleeds straw.",
        sign: "loose straw along the furrows, and an empty scarecrow's pole",
    }),
    wisp: Object.freeze({
        lore: "A pale blue light drifting over the elves' wilds after dark, alone or in pairs, said to lead travellers astray. It flares at whoever comes close and looses bolts of light at whoever keeps off, and there's nothing solid in it for a blast to throw. Its essence, drunk, gives you back your wind.",
        sign: "a faint glow over wet ground, and no tracks at all",
    }),
    treant: Object.freeze({
        lore: "A tree gone bad, rotten with blight, fungus and moss, standing in the elves' wilds far out. It lets no one near, slamming down its limbs and calling up roots that hold whoever they catch. Its bark turns some of every blow, and no blast moves it.",
        sign: "torn earth, and toadstools sprouting where it stood",
    }),
    mandrake: Object.freeze({
        lore: "A root the shape of a little man, a tuft of leaves on its head, that pulls itself out of the elves' woods and walks. It harms no one who leaves it be; struck, it scratches, and shrieks a shriek that staggers whoever's near. Herbalists say it grows best under a gallows.",
        sign: "small holes in loose soil, as if something pulled itself up",
    }),
    cwnAnnwn: Object.freeze({
        lore: "White hounds with red ears and burning eyes, running in packs of two to four through the elves' wilds, mostly by night. They are the hunting dogs of the otherworld, and see in the dark. It's said their baying is loudest when they're far off, and fainter the nearer they come.",
        sign: "lean running prints in a pack, and red-tipped white hairs",
    }),
    pixies: Object.freeze({
        lore: "A glowing swarm of pixies over the elves' woods and meadows, quick to turn on anyone who comes near. They prick, and dazzle whoever's close with their light until they stagger and stumble about, led astray. A swarm has nothing in it for a blast to throw.",
        sign: "a ring of trodden grass, dusted with something that glitters",
    }),
    hart: Object.freeze({
        lore: "A red stag, antlered, grazing the elves' meadows and woods alone or with one or two others. It won't let anyone near: come too close and it lowers its antlers and charges, goring. Its hide, antlers and venison all fetch a price at the guild.",
        sign: "deep-pressed slots, and bark frayed by antlers",
    }),
    kelpie: Object.freeze({
        lore: "A black water-horse with weed in its green mane, haunting the elves' wilds, oftener by night. It bites and drags whoever it has towards the water, or rears and brings its hooves down hard enough to fell them; no blast moves it. Whoever holds its bridle, they say, holds the kelpie.",
        sign: "hoofprints leading into the water, and none coming out",
    }),
    caveSpider: Object.freeze({
        lore: "A spider as big as a dog, of the dark elves' wilds, met in ones to fours and seeing in the dark as well as by day. It guards its ground, biting with venom and spitting webs that bind the legs. Their camps keep to the dark woods and the jungle, and the caves hold their broodmothers.",
        sign: "silk strung between the rocks, and husks wrapped in it",
    }),
    shadowStalker: Object.freeze({
        lore: "A great cat made of shadow, its eyes violet, met only after dark in the dark elves' wilds. It's half seen until it springs, and its claws rake wounds that bleed; struck, it spills shadow, not blood.",
        sign: "a big cat's prints that fade out mid-stride",
    }),
    olm: Object.freeze({
        lore: "A blind cave salamander grown big, pale pink, its gills a frill behind its head, of the dark elves' wilds. Eyeless, it still finds whoever comes near as well in the dark as by day, and bites; the bite can carry a sickness. Folk once took them for dragons' young, washed up out of the deep.",
        sign: "a pale, slick drag-mark leading from a spring",
    }),
    centipede: Object.freeze({
        lore: "A red-brown centipede the length of a walking staff, its yellow legs rippling, of the dark elves' wilds. It hunts mostly by night, sees in the dark, and comes for anyone it finds, its fangs venomous.",
        sign: "a long band of tiny pinpricks, rippled like a wave",
    }),
    basilisk: Object.freeze({
        lore: "A small serpent crowned with spikes, of the dark elves' wilds, the king of serpents in the old tales. It guards its ground, biting with venom, and its glare, the stare said to turn men to stone, staggers and slows whoever meets it. It sees in the dark.",
        sign: "a serpent's track through grass gone brown and withered",
    }),
    draugr: Object.freeze({
        lore: "The barrow's dead, risen in rusted mail and an old helm, its dried flesh shrunk onto its bones. It walks the dark elves' wilds, oftener by night, hacking with its barrow blade and laying a grave-curse that withers. Heavy as an ox, they say, and no blast moves it.",
        sign: "a broken barrow mound, heavy prints, and flakes of rusted mail",
    }),
    mare: Object.freeze({
        lore: "A hunched, hooded shade out only after dark in the dark elves' wilds, riding sleepers' dreams. It presses its weight on whoever it reaches, staggering and slowing them, and sends nightmares that wither. Stables it has visited are found at dawn with the horses' manes in knots.",
        sign: "horses' manes tangled into knots overnight",
    }),
    hyena: Object.freeze({
        lore: "Spotted hyenas, sloping-backed and big-eared, running in packs of two to five through the cat folk's wilds, mostly by night. They see in the dark, come for anyone, and their bites can carry a sickness.",
        sign: "chalk-white droppings and gnawed, cracked bones",
    }),
    scorpion: Object.freeze({
        lore: "A sandy scorpion of the cat folk's wilds, met alone or in pairs, out oftener by night. Its shell turns some of every blow; it pinches whoever comes near, or brings its sting over, venomous.",
        sign: "rows of tiny dots in the sand, and a burrow's mouth",
    }),
    jackal: Object.freeze({
        lore: "Slight, big-eared, black-backed jackals, running in packs of two to four through the cat folk's wilds near home. They hunt mostly by night and see in the dark; their bites are small but can carry a sickness.",
        sign: "small neat dog prints in pairs, and a scavenged carcass",
    }),
    capeBuffalo: Object.freeze({
        lore: "Heavy-horned and near black, Cape buffalo graze the cat folk's wilds in ones to threes. They let no one near: a charge knocks whoever it catches off their feet, and no blast will shift them. Hunters call them the black death.",
        sign: "a wallow churned to mud, and heavy cloven prints",
    }),
    nandiBear: Object.freeze({
        lore: "A great sloping beast of the cat folk's wilds, with a hyena's back and a bear's head and claws. It hunts mostly by night, sees in the dark, mauls whoever it finds and is too heavy for any blast to throw. Herders say it comes to the huts on moonless nights.",
        sign: "huge clawed forefoot prints, the hind ones small",
    }),
    locustSwarm: Object.freeze({
        lore: "A cloud of locusts boiling over the cat folk's wilds near home. It falls on anyone it finds, biting, and there's nothing in a swarm for a blast to throw.",
        sign: "stalks stripped bare where a crop stood",
    }),
    spittingCobra: Object.freeze({
        lore: "A brown cobra of the cat folk's wilds that rears up high, its hood spread, when anyone comes near. It bites with venom, and spits it at the eyes from a few paces off, staggering whoever it catches; unlike an adder's, its spit leaves no pool lying.",
        sign: "a shed skin, wide at the neck, caught on thorns",
    }),
    bogFrog: Object.freeze({
        lore: "A frog as big as a hound, of the lizard folk's wilds, guarding its patch of bank. Its tongue shoots out two paces to strike, and it spits venom that lies on the ground a while. Its legs are good eating and heal; its skin is poison.",
        sign: "hand-sized webbed prints, and spawn in the shallows",
    }),
    crocodile: Object.freeze({
        lore: "A great crocodile of the lizard folk's wilds, low and armoured, lying still on its ground. Come too near and it lunges, its jaws laying wounds open; its hide turns a good share of every blow, and no blast will shift it.",
        sign: "a belly-slide down the bank between sprawling clawed prints",
    }),
    giantLeech: Object.freeze({
        lore: "A leech as long as an arm, dark and banded, in the lizard folk's marshes near home. It lies still till someone comes close, then fastens on with its sucker and draws blood that keeps running.",
        sign: "a three-pointed bite on a drowned beast's hide",
    }),
    jaguar: Object.freeze({
        lore: "A gold jaguar with black rosettes, hunting the lizard folk's jungle, mostly by night. It sees in the dark and springs on whoever comes too near, its bite laying wounds open. Old tales make it the lord of the night.",
        sign: "round clawless prints by the water, and claw-scored bark",
    }),
    boa: Object.freeze({
        lore: "A great boa, banded in brown saddles and more than twice a man's height long, in the lizard folk's wilds far out. It bites, or throws its coils round whoever it's after, crushing and holding them; it's too heavy for any blast to throw.",
        sign: "a broad straight track, as if a log were dragged",
    }),
    bloodflies: Object.freeze({
        lore: "A whining swarm of bloodflies over the lizard folk's jungle and marshes, worst after dark. They see in the dark, fall on anyone they find, and their stings can carry a sickness; there's nothing in a swarm for a blast to throw.",
        sign: "a whine over stagnant water, and beasts with bloody welts",
    }),
    ahuizotl: Object.freeze({
        lore: "A sleek black water-dog of the lizard folk's marshes and jungle, with a hand at the tip of its tail. It guards its water, oftener by night, biting, or seizing whoever it can with that hand and dragging them down. The tales say it cries like a lost child to draw people to the bank.",
        sign: "dog-like prints by the water, and one small handprint",
    }),
    magmaSlime: Object.freeze({
        lore: "A crusted lump of molten rock creeping over the orcs' wilds, glowing through its cracks. It guards its ground, slamming whoever comes near and spitting lava that burns where it lands; its crust turns some of every blow. Cut, it bleeds lava.",
        sign: "a smear of cooled black glass, still warm to the touch",
    }),
    rockTusker: Object.freeze({
        lore: "A boar of living stone, its eyes glowing like a forge, in the orcs' wilds far out. It lets no one near: its charge knocks whoever it catches off their feet, its stone hide turns a good share of every blow, and no blast moves it. Struck, it chips.",
        sign: "deep hoofprints in rock dust, and chips of stone",
    }),
    gilaMonster: Object.freeze({
        lore: "A slow, beaded lizard, orange and black, of the orcs' badlands and heaths near home. It wants no trouble and bites only whoever strikes it, but the bite is venomous.",
        sign: "short-clawed prints either side of a fat tail's drag",
    }),
    salamander: Object.freeze({
        lore: "A black lizard with spots of fire, of the orcs' burning lands and badlands. It guards its ground, its bite burning, and spits fire that lies burning a while. The old tales say it's born in the flames.",
        sign: "small scorched footprints across bare rock",
    }),
    deathWorm: Object.freeze({
        lore: "A fat red worm longer than a man, of the orcs' badlands. It guards its stretch of ground, biting with venom and spitting acid that lies where it lands. Some say even to touch one is death.",
        sign: "a raised furrow in the sand, ending in a hole",
    }),
    vultureFlock: Object.freeze({
        lore: "A flock of great vultures, dark and bare-headed, over the orcs' badlands and heaths. They don't wait for whoever they find to die: they drop on them, ripping with beak and talon. There's nothing in a flock for a blast to throw.",
        sign: "a carcass picked to the bone, and long dark feathers",
    }),
    chimera: Object.freeze({
        lore: "A lion with a goat's horns and a serpent for a tail, breathing fire, from the orcs' burning lands and badlands far out. It mauls with its claws, its tail strikes with venom, its fire sets whoever it reaches burning, and no blast moves it. A hell's forge keeps the greatest of them.",
        sign: "lion's prints, a serpent's drag-line, and scorched scrub",
    }),
    ant: Object.freeze({
        lore: "An ant as big as a hound, met only in the ants' nests, and there in numbers. It sees in the dark, and its mandibles' bite burns with acid. When the queen calls, they come running.",
        sign: "a worn trail of many feet to heaped, dug earth",
    }),
    greatCentipede: Object.freeze({
        lore: "A centipede four metres long, keeping to the deeper tunnels of the ants' nests. It sees in the dark, bites with venomous fangs, and rears up to strike down the harder; no blast moves it. The nests' tunnel crawlers are the biggest of them.",
        sign: "a long rippling furrow through the tunnel dust",
    }),
    dungeonSpider: Object.freeze({
        lore: "A spider as big as a hound, hunting the tunnels of the ants' nests in packs, each led by an elite of its kind. It bites with venom, springs on whoever it's after, and spits its web to slow them; it sees in the dark.",
        sign: "low webs across the tunnel, and sucked-dry husks",
    }),
    eliteDungeonSpider: Object.freeze({
        lore: "The dungeon spiders' elite, red and black, its markings glowing, at the head of each of their packs. Its fangs are heavier, its sting comes over staggering and venomous, and it sprays web from its spinnerets; its shell turns a good share of every blow. It bursts apart as it dies.",
        sign: "sheet-webs sprayed across a gallery, and a red-black moult",
    }),
    dungeonScorpion: Object.freeze({
        lore: "An armoured scorpion longer than a man, crept into the tunnels of the ants' nests. It creeps slowly but comes on fast once it's after someone, thrusting with its pincers or bringing its sting over its back, staggering and venomous. Its shell turns a quarter of every blow.",
        sign: "pincer scrapes and a dragged tail through the tunnel dust",
    }),
    giantCockroach: Object.freeze({
        lore: "Cockroaches longer than a man, feelers and all, swarming at what the ants leave in their middens. Quick and in numbers, they bite, carrying sickness, or rear up and strike down.",
        sign: "gnawed refuse on the midden, and an oily, musty smell",
    }),
    dungeonWasp: Object.freeze({
        lore: "A wasp longer than a man's arm, hovering in the galleries of the ants' nests in twos and threes. It stings, or dives in from above to drive its sting home, venomous; it sees in the dark.",
        sign: "a dropped wing, clear as glass, and a distant drone",
    }),
    blackWidow: Object.freeze({
        lore: "A glossy black spider with a red mark, hanging unseen under the roof of an ants' nest's gallery. It drops on its thread onto whoever passes beneath, and its bite and pounce carry a venom of its own, worse than any common poison. The Widow matriarch is the greatest of them.",
        sign: "a single strong thread hanging from the dark above",
    }),
    antMonster: Object.freeze({
        lore: "The great queen of an ants' nest, waiting at its bottom among the bones of what her ants have eaten. She bites, rears to slam her weight down, and spits acid that lies where it lands; now and then she stops to call, and her ants come running. No blast moves her.",
        sign: "every ant trail leading down, to a sweet brood smell",
    }),
    dragon: Object.freeze({
        lore: "The drake: a great winged dragon, red-scaled, keeping the one lair of its kind in the world, on burning ground, mountain or snow. It circles high over its lair and comes down to fight, biting and breathing fire that sets whoever it reaches burning; wyverns guard it. Its hoard, scales and heart are a fortune.",
        sign: "talon gouges in scorched rock, and a shield-sized scale",
    }),
    dreadthorn: Object.freeze({
        lore: "The mightiest of dragons: half as big again as the drake, darker, horned and spined, each with a lair high on burning ground or in the mountains. It fights mostly on the ground, biting and breathing a long fire, and takes to the air when badly hurt. Wyverns guard it, and an old relic lies in its hoard.",
        sign: "shed spines like great black thorns among scorched stones",
    }),
    moonfang: Object.freeze({
        lore: "The first of the werewolves and master of each of their dens, a cave in a wooded hillside, the bones of what's been dragged home about it. Half as tall again as a werewolf, black with a pale glow and eyes pale as the moon, it's there by day as by night, with two werewolves and three dire wolves.",
        sign: "upright clawed prints, huge, and bones dragged to a cave mouth",
    }),
    ghost: Object.freeze({
        lore: "The pale shade of someone who lived in the ruins long ago, half seen, glowing faintly, drifting a little above the ground. It haunts the ruins, ruined castles and graveyards with the rest of their dead; its touch is the grave's cold, slowing, and its wail staggers. There's nothing in it for a blast to throw.",
        sign: "a cold spot that won't shift, and a wisp of ectoplasm",
    }),
    wraith: Object.freeze({
        lore: "A black-robed horror with nothing under its cowl but two cold green lights, bony claws out of its cuffs, haunting the ruins and ruined castles. Its claws wither, and it holds out a hand to draw the life out of whoever it points at. There's no body in its robe for a blast to throw.",
        sign: "shreds of black cloth on thorns, and the grass beneath withered",
    }),
    wightLord: Object.freeze({
        lore: "The crowned lord of a ruin's dead, a tall armoured skeleton with a greatsword and a torn cape, its eyes burning pale blue. It holds the ruins and the ruined castles' keeps, guarding an old relic, and its curse withers whoever it lands on. It sees in the dark, and no blast moves it.",
        sign: "armoured footprints in old dust, and a greatsword's drag-line",
    }),
    frostTroll: Object.freeze({
        lore: "A troll of the high snows, its skin pale as frost and its hair white, the mightiest of its kind. Its frozen club can crust whoever it strikes in ice, slowing them, and no blast moves it. The trolls' camps of the farthest snows are theirs, and the caves keep one on a throne.",
        sign: "huge bare footprints in hard snow, and ice where it rested",
    }),
    flayling: Object.freeze({
        lore: "One of the cult's sacrifices, skinned and given back its life below, met only in a hell's Breach. Flaylings come in swarms, raw red and quick, raking and lunging with claws that leave wounds that bleed.",
        sign: "many bloody bare footprints running through the soot",
    }),
    cinderHusk: Object.freeze({
        lore: "A flayed thing burnt out and ash grey, shambling through a hell's Breach in twos and threes. Its grasp smoulders and burns, fire does it only half its harm, and it bursts in embers as it falls, so whoever kills one up close should step away.",
        sign: "a trail of ash, with embers still glowing in it",
    }),
    pyreAcolyte: Object.freeze({
        lore: "A flayed priest of the pyre, the red of blood, met in a hell's Breach. It keeps its distance, sweeping with its staff if anyone comes close, and hurls fire that lies burning on the ground; fire hurts it less than most.",
        sign: "burnt circles on the rock where fire was thrown",
    }),
    ossuaryPriest: Object.freeze({
        lore: "A flayed priest of a hell's Halls of Bone, ash grey and crowned. It keeps back from a fight, raising skeletons to fight for it and cursing whoever it can reach with grave-rot, a sickness that lingers.",
        sign: "bones missing from the charnel heaps, and drag marks",
    }),
    dirgeWarden: Object.freeze({
        lore: "A flayed guard of a hell's Halls of Bone, drowned blue, crowned and armoured. Its halberd sweeps whoever's near off their feet, and its dirge chills whoever hears it, slowing them; water does it half its harm, and no blast moves it.",
        sign: "frost on the wet walls, and a halberd's drag-mark",
    }),
    flayedHierarch: Object.freeze({
        lore: "The highest of the flayed, raw red, crowned and caped, met one at a time in a hell's Halls of Bone. It sweeps with a gilded staff and lays a flaying curse that draws back into it the life it takes; magic does it less harm than most.",
        sign: "a cape's hem dragged through blood, and a staff's mark",
    }),
    slagGorger: Object.freeze({
        lore: "A headless brute with a maw in its belly, met on a hell's River of Fire in twos and threes. It bites, and spews molten slag that burns on the ground; fire does it half its harm.",
        sign: "cooling slag spattered across the causeway",
    }),
    forgeBrute: Object.freeze({
        lore: "A blood-red gorger of a hell's River of Fire, headless, its maw in its belly. Its club knocks whoever it catches off their feet, burning; its hide turns a good share of every blow, and no blast moves it.",
        sign: "a club's dent in the rock, still hot",
    }),
    chainedGlutton: Object.freeze({
        lore: "The greatest of the gorgers of a hell's River of Fire, met one at a time, a spiked club in its fist. The maw in its belly feeds as it bites, healing it with what it takes, and its hide turns a good share of every blow.",
        sign: "a chain's drag-line, and bones gnawed clean",
    }),
    bloatGorger: Object.freeze({
        lore: "A swollen gorger of a hell's Pit, rotten green, met in twos and threes. It bites, spews bile that poisons and lies on the ground, and bursts in its bile as it falls; whoever kills one close should step back. Its warlord roars more of them to it.",
        sign: "pools of yellow-green bile, and a sour stink",
    }),
    pitRavager: Object.freeze({
        lore: "A gorger of a hell's Pit, quick for its size, met in twos and threes. Its club and the teeth in its belly leave wounds that bleed.",
        sign: "long heavy strides in the dust, and splintered bone",
    }),
    gorgerWarlord: Object.freeze({
        lore: "The lord of the Pit's gorgers, in a horned helm under skulls and banners, met one at a time. Its spiked club knocks whoever it catches off their feet, its maw bites, and it roars its bloat gorgers to it; no blast moves it.",
        sign: "a skull fallen from a banner pole",
    }),
    henchman: Object.freeze({
        lore: "The Lord of the Pit's own: horned, clawed and broad, a man's height, met in twos and threes in his Pit and standing about his throne. Their claws rend, leaving wounds that bleed, and the blow staggers; their hides turn some of every blow, and they see in the dark.",
        sign: "deep claw marks scored in black stone",
    }),
    brimstoneWalker: Object.freeze({
        lore: "A hell's walker in the Breach, its sinews yellowed by the brimstone: lean, a head taller than a man, as if flayed. Walkers are quick, and their raking claws leave wounds that bleed.",
        sign: "long bare footprints in the sulphur",
    }),
    ashWalker: Object.freeze({
        lore: "A hell's walker in the Halls of Bone, grey as ash: lean, a head taller than a man, as if flayed. Walkers are quick, and their raking claws leave wounds that bleed.",
        sign: "long bare footprints in the bone dust",
    }),
    hellwalker: Object.freeze({
        lore: "A hell's walker at home in the River of Fire, raw or charred black, met there more than anywhere: lean, a head taller than a man, as if flayed. Walkers are quick, and their raking claws leave wounds that bleed.",
        sign: "long bare footprints in the cinders",
    }),
    bileWalker: Object.freeze({
        lore: "A hell's walker in the Pit, green as the bile it wades through: lean, a head taller than a man, as if flayed. Walkers are quick, and their raking claws leave wounds that bleed.",
        sign: "long bare footprints, wet with bile",
    }),
    cultLeader: Object.freeze({
        lore: "The cult's high priest, robed as its faithful are and a head taller, keeping its rite at a hell's way in, only after dark. It swings its staff and calls hellfire down out of the dark. Once it and all its faithful are slain, the portal stands open till daybreak; the next night the cult's back at it.",
        sign: "a pentagram scorched into the earth, candles at its points",
    }),
    greaterDemon: Object.freeze({
        lore: "The master of the River of Fire, waiting by the Hellforge at the portal down: a winged, horned demon nearly twice a man's height that sat the Pit's throne before the Lord who sits it now. It smashes with burning fists and hurls hellfire from its hand, and no blast moves it.",
        sign: "fist-sized dents in the anvils, still warm",
    }),
    demonLord: Object.freeze({
        lore: "The Lord of the Pit, on his horned throne at the bottom of a hell, under the violet light that is his own. Armoured in black iron, his wings burning, nearly twice a man's height, he sweeps with burning claws and flings hellfire from his open hands, and no blast moves him. Beyond his throne lies the way out.",
        sign: "sigils glowing violet in polished black stone",
    }),
    fiend: Object.freeze({
        lore: "Lean, winged and horned, a head and more taller than a man, fiends hunt every level of a hell in packs, more of them the deeper down. They rake with their claws or spring with their wings spread, searing; their hides turn some of every blow, and they see in the dark.",
        sign: "claw-scored stone, and soot in the shape of wings",
    }),
    riftling: Object.freeze({
        lore: "The Behemoth's kind, a man's height, quick and hungry, come through the rift beside the Tower of Sar Mordal and keeping it. It was their kind that killed the wizard Sinclair's wife. Their jaws lay wounds open, and their scales turn a tenth of every blow.",
        sign: "clawed prints at a run, and a scale mottled green",
    }),
    riftStalker: Object.freeze({
        lore: "Half as big again as the riftlings it leads, the rift stalker keeps Sinclair's study at the top of the Tower of Sar Mordal, by his hoard and its old relic. It bites, and breathes the rift's green fire, setting whoever it reaches alight.",
        sign: "stone scorched black, its edges tinged rift-green",
    }),
    kaiju: Object.freeze({
        lore: "One of the great beasts of the other world, thirty-six metres long, come through the rift by the Tower of Sar Mordal. Now and then by night it comes against a town, everyone's enemy and too vast to be moved, slamming its jaws down, roaring men off their feet and raking the ground with a beam of blue-white fire.",
        sign: "footprints a man could lie in, and a glowing scorched furrow",
    }),
    stoneGolem: Object.freeze({
        lore: "Four metres of cut stone, raised by an idle mage to work Harrowstone quarry for him, its heart a crystal flawed by a vein of blight no one saw. One morning it turned on the quarry and broke it, and everyone in it, its maker too; it has wandered the hills by the ruins ever since, and folk go miles round. Its hammer knocks men off their feet, it pounds the ground till it heaves, and whoever keeps their distance it hurls boulders at: watch for the shadow, and get out from under it. No blast moves it, and earth harms it little.",
        sign: "great round footprints sunk deep in the turf, and boulders torn out of the hillside",
    }),
    orcKing: Object.freeze({
        lore: "Vorgash the Ironcrowned, clan-king of the Ashfang, who bound the Ironjaw, the Bloodtusk and the Gravemaw to him and was outlawed by the Horde for it. From his war camp in the marches his raiders burn the border villages. Green-skinned, armoured from shoulder to knee, taller than any orc, he fights with a great axe in combos of three blows, kicks whoever crowds him off their feet, leaps on whoever keeps off and spins his axe all round him, the ground warning of both before they land. Now and then he stands on guard, and only a blow from his side or behind gets through. Worn down, he roars for his champions.",
        sign: "the ashes of a border village, and the tracks of his war band leading away from it",
    }),
    orcIronjaw: Object.freeze({
        lore: "The chief of the Ironjaw, the first clan to kneel to the Orc King and his champion since. Brown-skinned and broad, he comes at the King's battlecry with a great axe, sweeping, chopping, and kicking whoever's in his way off their feet.",
        sign: "a broad orc's tracks beside the King's, never far behind",
    }),
    orcBloodtusk: Object.freeze({
        lore: "The chief of the Bloodtusk, the red clan, and the Orc King's champion. Quicker than Ironjaw, he comes at the King's second battlecry, his great axe swept and chopped, his kick throwing whoever's in his way.",
        sign: "red ochre smeared on the posts of a burned house",
    }),
    orcRaider: Object.freeze({
        lore: "One of the Orc King's war band, sent to burn the border villages: an orc of one of his four clans, a cleaver in hand, its blows now and then laying a wound open. Some stay behind among the ashes for what's left.",
        sign: "torches thrown down among the ashes, and orc tracks",
    }),
});
