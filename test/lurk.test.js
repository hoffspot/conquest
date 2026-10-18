// A creature that lurks (creatures.js `lurk`: the black widow, in the ants' nests): hanging unseen
// under the roof, no one's enemy nor anyone its, till an enemy it can see comes beneath it; then
// dropping on its thread, stunned till it lands, and setting on them (battle.js #lurk); put out in
// a nest where its room's roof is highest, furthest from the rock (dungeons/place.js)
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, traitsOf, WILD } from "../client/js/core/creatures.js";
import { buildDungeon } from "../client/js/core/dungeons/build.js";
import { clearOfRock } from "../client/js/core/dungeons/place.js";
import { encode, decode } from "../client/js/core/wire.js";
import { parseGrid } from "./helpers.js";

// An open field (no walls, nothing in the way) `size` squares across
const field = (size) => ({ blocked: parseGrid(Array.from({ length: size }, () => ".".repeat(size))).map((row) => Uint8Array.from(row)) });

// A creature of the wild (creatures.js) in a battle, as the host puts one out (host.js #rouse)
function creature(battle, id, kind, square, { hp = 500 } = {}) {
    const { weapon, speed, chase } = CREATURES[kind];

    return battle.add({ id, kind: "beast", name: CREATURES[kind].name, weapon, team: WILD, square, ai: "wild", hp, speed, chase, armed: true, wild: { creature: kind, tier: 6, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: id, leader: null, menace: true, ...traitsOf(kind) } });
}

// A battle played on (ms), the player kept alive
function play(battle, ms, me) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        me.hp = me.maxHp;
        events.push(...battle.advance(STEP_MS));
    }

    return events;
}

describe("a creature lurking overhead (battle.js #lurk)", () => {
    it("hangs unseen and untouched, no one's enemy, till an enemy comes beneath it", () => {
        const lurk = traitsOf("blackWidow").lurk;

        assert.ok(lurk.within >= 2 && lurk.drop >= 1000, JSON.stringify(lurk));
        assert.equal(traitsOf("dungeonSpider").lurk, undefined, "a dungeon spider doesn't lurk");

        const battle = new Battle(field(40), { seed: 5 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 20], hp: 1e5 });
        const widow = creature(battle, "widow", "blackWidow", [20, 20]);

        assert.equal(widow.lurking, true);
        assert.equal(battle.hostile(me, widow), false);
        assert.equal(battle.hostile(widow, me), false);

        // (Told to set on it, nothing comes of it; it doesn't stir, nor drop on someone further off)
        battle.command("me", { type: "engage", target: "widow" });

        const quiet = play(battle, 4000, me);

        assert.ok(!quiet.some(({ type, id }) => (type === "drop" || type === "attack") && id === "widow"), JSON.stringify(quiet.filter(({ id }) => id === "widow")));
        assert.ok(!quiet.some(({ type, target }) => type === "hit" && target === "widow"));
        assert.equal(widow.lurking, true);
        assert.deepEqual(widow.square, [20, 20]);
        assert.equal(widow.hp, widow.maxHp);
    });

    it("drops on whoever comes beneath it: stunned till it lands, then setting on them, its venom in its bite", () => {
        const { within, drop } = traitsOf("blackWidow").lurk;
        const battle = new Battle(field(40), { seed: 5 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 20], hp: 1e5 });
        const widow = creature(battle, "widow", "blackWidow", [20, 20]);

        battle.command("me", { type: "move", to: [19, 20] });

        const events = play(battle, 12000, me);
        const dropped = events.find(({ type, id }) => type === "drop" && id === "widow");

        assert.ok(dropped, "it drops");
        assert.deepEqual([dropped.target, dropped.until - dropped.time], ["me", drop]);
        assert.ok(Math.hypot(me.x - widow.x, me.y - widow.y) < within + 2);
        assert.equal(widow.lurking, false);
        assert.equal(widow.droppedAt, dropped.time);
        assert.equal(battle.hostile(widow, me), true);

        // (Nothing of its own till it's down; then at them)
        const first = events.find(({ type, id }) => type === "attack" && id === "widow");

        assert.ok(first && first.time >= dropped.until, `${first?.time} against ${dropped.until}`);
        assert.ok(events.some(({ type, id, kind, by }) => type === "afflicted" && id === "me" && kind === "venom" && by === "widow"), "its venom");
    });

    it("drops on no one it hasn't noticed (Invisible)", () => {
        const battle = new Battle(field(40), { seed: 5 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [19, 20], hp: 1e5 });
        const widow = creature(battle, "widow", "blackWidow", [20, 20]);

        battle.buff("me", "invisibility", { ms: 60000 });

        const events = play(battle, 3000, me);

        assert.ok(!events.some(({ type }) => type === "drop"));
        assert.equal(widow.lurking, true);
    });

    it("lurks still after a snapshot, as it was", () => {
        const battle = new Battle(field(40), { seed: 5 });
        const me = battle.add({ id: "me", kind: "player", weapon: "sword", team: "hero", square: [10, 20], hp: 1e5 });

        creature(battle, "widow", "blackWidow", [20, 20]);
        play(battle, 1000, me);

        const again = Battle.restore(field(40), decode(encode(battle.snapshot())));

        assert.equal(again.actor("widow").lurking, true);
        assert.equal(again.actor("widow").droppedAt, null);
    });
});

describe("black widows in the ants' nests (dungeons/themes.js, place.js)", () => {
    it("hang alone or in twos and threes near the middle of the rooms they're in, and one may be a mini-boss", () => {
        let widows = 0;
        let matriarchs = 0;

        for (let seed = 1; seed <= 40; seed++) {
            const dungeon = buildDungeon({ seed, theme: "nest", tier: 6 });

            for (const level of dungeon.levels) {
                const rooms = new Map(level.rooms.map((room) => [room.id, room]));

                for (const pack of level.packs) {
                    for (const foe of pack.foes.filter(({ creature }) => creature === "blackWidow")) {
                        if (foe.mini) {
                            matriarchs += 1;
                            assert.equal(foe.title, "Widow matriarch");
                            continue;
                        }

                        // (A mini-boss's guard, lurking over it: as near it as they'll go)
                        if (pack.role !== "pack") {
                            continue;
                        }

                        widows += 1;
                        assert.ok(pack.foes.every(({ creature }) => creature === "blackWidow"), "a widow's pack all widows");

                        // (Where its room's roof is high: as far from the rock as its room's
                        // middle is at least, give or take one for those kept off its doors)
                        const { centre } = rooms.get(pack.room);
                        const open = (x, y) => (level.rows[y]?.[x] ?? "#") !== "#";
                        const [clear, middle] = [clearOfRock(open, foe.at), clearOfRock(open, centre)];

                        assert.ok(clear >= Math.max(1, middle - 1), `${seed}: ${foe.at}, ${clear} from the rock, in a room about ${centre}, ${middle} from it`);
                    }
                }
            }
        }

        assert.ok(widows >= 10 && matriarchs >= 3, `${widows} widows, ${matriarchs} matriarchs`);
    });
});
