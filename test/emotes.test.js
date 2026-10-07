// Who cheers a foe's fall (core/emotes.js cheering): the folk a creature's or the orc's, soldiers
// and followers a foe of theirs at a friend's hand; only those near and standing about, each a
// moment after, the same every time
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHEERING, cheering } from "../client/js/core/emotes.js";

// Someone of a kind, of a side, somewhere on the taproom's floor (metres), standing about
const someone = (id, kind, team, x = 0, y = 0, more = {}) => ({ id, kind, team, map: "town", x, y, dead: false, path: [], attack: null, casting: null, talkingTo: null, neutral: kind === "folk", ...more });

// A battle of a few: enemies of different sides, never the folk
function battleOf(...actors) {
    return { actors, hostile: (a, b) => !a.neutral && !b.neutral && a.team !== b.team };
}

describe("cheering a foe's fall (core/emotes.js)", () => {
    it("cheers a creature of the wild falling to a player: the folk and the soldiers about, not those busy, far off or elsewhere", () => {
        const player = someone("player", "player", "human", 0, 0);
        const wolf = someone("wolf", "beast", "wild", 2, 0);
        const baker = someone("baker", "folk", "folk", 5, 3);
        const guard = someone("guard", "soldier", "human", -4, 2);
        const walking = someone("walking", "folk", "folk", 3, 3, { path: [[9, 9]] });
        const seated = someone("seated", "folk", "folk", 1, 1, { routine: { seated: true } });
        const talking = someone("talking", "folk", "folk", 1, -1, { talkingTo: "player" });
        const far = someone("far", "folk", "folk", 2 + CHEERING.near + 1, 0);
        const inside = someone("inside", "folk", "folk", 2, 0, { map: "taproom" });
        const dead = someone("dead", "soldier", "human", 1, 0, { dead: true });
        const battle = battleOf(player, wolf, baker, guard, walking, seated, talking, far, inside, dead);
        const cheers = cheering(battle, wolf, player);

        assert.deepEqual(cheers.map(({ id }) => id), ["baker", "guard"]);

        for (const { after, emote } of cheers) {
            assert.ok(after >= CHEERING.delay[0] && after <= CHEERING.delay[1], `${after}`);
            assert.ok(CHEERING.ways.includes(emote));
        }

        // (The same every time)
        assert.deepEqual(cheering(battle, wolf, player), cheers);

        // (Not a creature falling to another, nor no one's doing)
        assert.deepEqual(cheering(battle, wolf, someone("bear", "beast", "wild")), []);
        assert.deepEqual(cheering(battle, wolf, null), []);
    });

    it("cheers a soldier's fall only among those it was a foe of, at the hand of a friend of theirs: not the folk", () => {
        const player = someone("player", "player", "human", 0, 0);
        const raider = someone("raider", "soldier", "orc", 2, 0);
        const guard = someone("guard", "soldier", "human", -3, 0);
        const follower = someone("follower", "follower", "human", 0, 3);
        const orc = someone("orc-guard", "soldier", "orc", 4, 4);
        const baker = someone("baker", "folk", "folk", 1, 1);

        assert.deepEqual(cheering(battleOf(player, raider, guard, follower, orc, baker), raider, player).map(({ id }) => id), ["guard", "follower"]);

        // (One of the town's own guards struck down by a raider: no one cheers, but the raider's own)
        assert.deepEqual(cheering(battleOf(player, raider, guard, follower, orc, baker), guard, raider).map(({ id }) => id), ["orc-guard"]);
    });
});
