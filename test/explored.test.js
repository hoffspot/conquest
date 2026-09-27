// What the player has found of the world (client/js/core/explored.js): the buildings they've gone
// into and the chunks they've set foot in, kept with the saved game; and the world map's fog
// (app/worldmap.js paintFog's reading of it)
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { Explored } = await import("../client/js/core/explored.js");
const { CHUNK, CHUNKS } = await import("../client/js/core/worldplan/plan.js");

describe("what the player's found (explored.js)", () => {
    it("knows the buildings gone into, once each", () => {
        const explored = new Explored();

        assert.ok(!explored.hasEntered("home:tavern"));
        assert.ok(explored.enter("home:tavern"));
        assert.ok(!explored.enter("home:tavern"));
        assert.ok(explored.enter("human-town-2:landmark-4"));
        assert.ok(explored.hasEntered("home:tavern") && explored.hasEntered("human-town-2:landmark-4"));
        assert.equal(explored.version, 2);
    });

    it("clears the fog from a chunk once the player's set foot in it, and only that chunk", () => {
        const explored = new Explored();
        const [x, y] = [CHUNK * 40 + 10, CHUNK * 71 + 63.5];

        assert.equal(explored.chunksVisited, 0);
        assert.ok(explored.visit(x, y));
        assert.ok(!explored.visit(x + 20, y - 30));
        assert.ok(explored.isVisited(40, 71));
        assert.ok(!explored.isVisited(41, 71) && !explored.isVisited(40, 72) && !explored.isVisited(39, 70));
        assert.equal(explored.chunksVisited, 1);

        // The world's corners, and nothing off it
        assert.ok(explored.visit(0, 0) && explored.visit(CHUNKS * CHUNK - 1, CHUNKS * CHUNK - 1));
        assert.ok(!explored.visit(-1, 5) && !explored.visit(5, CHUNKS * CHUNK));
        assert.ok(explored.isVisited(0, 0) && explored.isVisited(CHUNKS - 1, CHUNKS - 1));
        assert.ok(!explored.isVisited(-1, 0) && !explored.isVisited(CHUNKS, 0));
        assert.equal(explored.chunksVisited, 3);
    });

    it("is kept and read back just as it was", () => {
        const explored = new Explored();

        for (let k = 0; k < 500; k++) {
            explored.visit((k * 7919) % (CHUNKS * CHUNK), (k * 104729) % (CHUNKS * CHUNK));
        }

        explored.enter("home:tavern");
        explored.enter("elf-village-3:landmark-1");

        const kept = JSON.parse(JSON.stringify(explored));
        const back = new Explored(kept);

        assert.equal(typeof kept.visited, "string");
        assert.ok(kept.visited.length < 3000);
        assert.deepEqual([...back.visited], [...explored.visited]);
        assert.deepEqual([...back.entered], [...explored.entered]);
        assert.equal(back.chunksVisited, explored.chunksVisited);

        // (Nothing kept, or something that isn't, is nothing found)
        assert.equal(new Explored(undefined).chunksVisited, 0);
        assert.equal(new Explored({ entered: [3, null, "a"], visited: 7 }).entered.size, 1);
    });
});
