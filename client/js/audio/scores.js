// Every score the music plays, by name: the town's (score.js), the tavern's (tavern.js) and a
// fight's (battle.js). sound.js plays them where they're heard; scripts/build-music.js makes the
// recordings they're played on.

import { BATTLE } from "./battle.js";
import { SCORE } from "./score.js";
import { TAVERN } from "./tavern.js";

/** The music, by name. */
export const SCORES = Object.freeze({ town: SCORE, tavern: TAVERN, battle: BATTLE });
