// Every score the music plays, by name: the town's (score.js, the humans' lands' too), the
// tavern's (tavern.js), a fight's (battle.js), and each other people's in their own lands
// (elves.js, dark-elves.js, cat-folk.js, lizard-folk.js, orcs.js). sound.js plays them where
// they're heard; scripts/build-music.js makes the recordings they're played on.

import { BATTLE } from "./battle.js";
import { CAT_FOLK } from "./cat-folk.js";
import { DARK_ELVES } from "./dark-elves.js";
import { ELVES } from "./elves.js";
import { LIZARD_FOLK } from "./lizard-folk.js";
import { ORCS } from "./orcs.js";
import { SCORE } from "./score.js";
import { TAVERN } from "./tavern.js";

/** The music, by name. */
export const SCORES = Object.freeze({ town: SCORE, tavern: TAVERN, battle: BATTLE, elves: ELVES, darkElves: DARK_ELVES, catFolk: CAT_FOLK, lizardFolk: LIZARD_FOLK, orcs: ORCS });
