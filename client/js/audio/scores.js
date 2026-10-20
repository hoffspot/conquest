// Every score the music plays, by name: the town's (score.js, the humans' lands' too), the
// tavern's (tavern.js), a fight's (battle.js), each other people's in their own lands (elves.js,
// dark-elves.js, cat-folk.js, lizard-folk.js, orcs.js), and each kind of dungeon's (caves.js,
// crypts.js, nest.js, lair.js, ruins.js, hell.js: a hell's played lower in its deeper realms, its
// `shifts`). sound.js plays them where they're heard; scripts/build-music.js makes the recordings
// they're played on.

import { BATTLE } from "./battle.js";
import { CAT_FOLK } from "./cat-folk.js";
import { CAVES } from "./caves.js";
import { CRYPTS } from "./crypts.js";
import { DARK_ELVES } from "./dark-elves.js";
import { ELVES } from "./elves.js";
import { HELL } from "./hell.js";
import { LAIR } from "./lair.js";
import { LIZARD_FOLK } from "./lizard-folk.js";
import { NEST } from "./nest.js";
import { ORCS } from "./orcs.js";
import { RUINS } from "./ruins.js";
import { SCORE } from "./score.js";
import { TAVERN } from "./tavern.js";

/** The music, by name. */
export const SCORES = Object.freeze({ town: SCORE, tavern: TAVERN, battle: BATTLE, elves: ELVES, darkElves: DARK_ELVES, catFolk: CAT_FOLK, lizardFolk: LIZARD_FOLK, orcs: ORCS, caves: CAVES, crypts: CRYPTS, nest: NEST, lair: LAIR, ruins: RUINS, hell: HELL });
