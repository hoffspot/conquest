// What's found at a place's heart (core/places.js PLACE_KINDS `scene`): where a rare card's thread
// sends someone (core/rare.js STEPS `place`, its `site`), what they find there. Laid out round the
// heart as the place is (setpieces/neutral.js layoutNeutral), from numbers of its own, so the rest
// of it's laid out the same with it or without it. Each (random, heart ([x, y] metres from the
// place's north-west corner)) → its parts, as the art builds them (world/art/kits/neutral.js).

import { cos, sin } from "../exact.js";

const TAU = 6.283185307179586;

export const SCENES = Object.freeze({
    // An adventuring company caught where it stood and flattened (`crushed`), four of them round
    // the heart, a little before it, each by what they carried (`who`: a shield, a bow, a mace, a
    // staff), a boulder on the third: the Lantern Company, in the ruins of Harrowstone
    crushed(random, [hx, hy]) {
        return ["shield", "bow", "mace", "staff"].map((who, k) => {
            const angle = (k / 4) * TAU + random.range(-0.4, 0.4);
            const out = random.range(1.6, 3.2);

            return { part: "crushed", x: hx + cos(angle) * out, y: hy - 1.5 + sin(angle) * out * 0.8, turn: random.range(0, TAU), who, boulder: k === 2, seed: random.seed() };
        });
    },
});
