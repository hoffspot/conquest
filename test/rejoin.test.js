// Back into a world after a crash or a reload (client/js/app/rejoin.js): where the player is in
// another's world, or their own open to friends, kept on this device while they're there; gone
// back into within half an hour, stage by stage; let go of once they've left.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forgetInWorld, inWorldOf, keepInWorld, REJOIN, REJOIN_STAGES, rejoinWords } from "../client/js/app/rejoin.js";

// (As much of localStorage as it uses)
const storage = () => {
    const kept = new Map();

    return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, String(value)), removeItem: (key) => kept.delete(key), kept };
};

const server = { kind: "server", server: "studio-mac.local:8480", world: "w1", worldName: "Thornwick", serverName: "Tom's Mac mini", hero: 2, character: null, name: "Ada" };
const friend = { kind: "friend", code: "ABCD", broker: "wss://studio-mac.local:8480/broker", character: "c1", name: "Ada", host: "Wren" };
const hosting = { kind: "hosting", code: "WXYZ", token: "t0k3n", broker: "wss://studio-mac.local:8480/broker", listed: true, character: "c1", name: "Ada" };

describe("back into a world (rejoin.js)", () => {
    it("keeps where the player is, as of when it was written, and gives it back for half an hour", () => {
        const kept = storage();

        keepInWorld(kept, server, 1000);
        assert.deepEqual(JSON.parse(kept.kept.get(REJOIN.key)), { ...server, at: 1000 });
        assert.deepEqual(inWorldOf(kept, 1000 + REJOIN.within - 1), { ...server, at: 1000 });

        // (Written again as they play: the half hour from then)
        keepInWorld(kept, friend, 1000 + REJOIN.within);
        assert.deepEqual(inWorldOf(kept, 1000 + 2 * REJOIN.within - 1), { ...friend, at: 1000 + REJOIN.within });

        // (Their own, open to friends)
        keepInWorld(kept, hosting, 5000);
        assert.deepEqual(inWorldOf(kept, 6000), { ...hosting, at: 5000 });
        assert.equal(REJOIN.within, 30 * 60 * 1000);
        assert.equal(REJOIN.every, 10000);
    });

    it("lets go of one half an hour old or more, from a clock gone back, or not as it should be", () => {
        const kept = storage();

        keepInWorld(kept, server, 1000);
        assert.equal(inWorldOf(kept, 1000 + REJOIN.within), null);
        assert.equal(kept.kept.has(REJOIN.key), false, "forgotten");

        keepInWorld(kept, server, 5000);
        assert.equal(inWorldOf(kept, 4000), null, "written after now");

        for (const record of [{ ...friend, code: "abc" }, { ...server, world: 3 }, { ...hosting, token: null }, { ...hosting, character: null }, { kind: "elsewhere" }, null]) {
            kept.setItem(REJOIN.key, JSON.stringify({ ...record, at: 1000 }));
            assert.equal(inWorldOf(kept, 2000), null, JSON.stringify(record));
        }

        kept.setItem(REJOIN.key, "{not JSON");
        assert.equal(inWorldOf(kept, 2000), null);
        assert.equal(inWorldOf(null, 2000), null, "no storage");
    });

    it("forgets it once they've left, and minds storage that refuses", () => {
        const kept = storage();

        keepInWorld(kept, friend, 1000);
        forgetInWorld(kept);
        assert.equal(inWorldOf(kept, 2000), null);

        const refusing = { getItem: () => null, setItem: () => assert.fail("refused") ?? 0, removeItem: () => {} };

        refusing.setItem = () => {
            throw new Error("full");
        };
        assert.doesNotThrow(() => keepInWorld(refusing, friend, 1000));
    });

    it("lists the stages of the way back in for each kind of world, and heads it with where and who", () => {
        assert.deepEqual(
            REJOIN_STAGES.server.map(([id]) => id),
            ["reach", "prove", "enter", "open", "ask"],
        );
        assert.deepEqual(
            REJOIN_STAGES.friend.map(([id]) => id),
            ["reach", "find", "ask"],
        );
        assert.deepEqual(
            REJOIN_STAGES.hosting.map(([id]) => id),
            ["load", "reopen"],
        );
        assert.ok([...REJOIN_STAGES.server, ...REJOIN_STAGES.friend, ...REJOIN_STAGES.hosting].every(([, words]) => /^[A-Z][a-z ,]+$/.test(words)));

        assert.deepEqual(rejoinWords(server), { title: "Back into Thornwick", about: "On Tom's Mac mini, as Ada." });
        assert.deepEqual(rejoinWords(friend), { title: "Back into Wren's world", about: "By its code, ABCD, as Ada." });
        assert.deepEqual(rejoinWords(hosting), { title: "Back into your world", about: "Opening it to your friends again, under its code, WXYZ, as Ada." });
        assert.deepEqual(rejoinWords({ kind: "friend", code: "ABCD" }), { title: "Back into your friend's world", about: "By its code, ABCD." });
        assert.deepEqual(rejoinWords({ kind: "server", server: "s", world: "w" }), { title: "Back into your world", about: "On its server." });
    });
});
