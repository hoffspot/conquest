// What's round the player out in the world, for what's heard there (client/js/app/surroundings.js):
// the land and whether it's high, the waters near, a settlement and its market and smithy, fires
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildWorld, CHUNK, WORLD_SIZE } from "../client/js/core/overworld.js";
import { Surroundings } from "../client/js/app/surroundings.js";

let overworld;
let surroundings;

describe("what's round the player (surroundings.js)", () => {
    before(() => {
        overworld = buildWorld({ seed: 1 }).maps.town;
        surroundings = new Surroundings(overworld);
    });

    it("knows the town: all round about it, its market's middle and its smithy near", () => {
        const [x, z] = overworld.stamp.middle;
        const facts = surroundings.at(x, z);

        assert.equal(facts.settled, 1);
        assert.ok(facts.market < 5, `${facts.market} m to the market`);
        assert.ok(facts.smithy && facts.smithy.far < 80 && overworld.settled(Math.floor(facts.smithy.x), Math.floor(facts.smithy.z)), "a smithy, in the town");
        assert.equal(facts.land, overworld.biomeAt(x, z));
        assert.ok(!facts.high && surroundings.at(x, z, { height: 200 }).high, "high above 175 m");

        // (Out in the wild, far from any settlement)
        const wild = surroundings.at(x + 1500, z);

        assert.ok(wild.settled < 1 && (wild.settled > 0 || wild.market === Infinity));
    });

    it("finds a river near, and how far off it is", () => {
        const piece = Array.from({ length: (WORLD_SIZE / CHUNK) ** 2 }, (_, k) => overworld.waters.riversNear(k % (WORLD_SIZE / CHUNK), Math.floor(k / (WORLD_SIZE / CHUNK)))).find((pieces) => pieces.some(({ stream }) => !stream))?.find(({ stream }) => !stream);
        const [x, z] = overworld.waters.placeOf((piece.ax + piece.bx) / 2, (piece.ay + piece.by) / 2);
        const water = surroundings.at(x, z).water;
        const far = Math.min(water.river ?? Infinity, water.stream ?? Infinity);

        assert.ok(far < 5, `in it, or at its bank: ${far} m`);
        assert.ok(Math.min(surroundings.at(x + 40, z).water.river ?? Infinity, surroundings.at(x + 40, z).water.stream ?? Infinity) > far - 1e-9, "further from it, further off");
    });

    it("finds the sea from the shore", () => {
        let shore = null;

        for (let y = 64; y < WORLD_SIZE && !shore; y += 32) {
            for (let x = 64; x < WORLD_SIZE - 64 && !shore; x += 32) {
                if (overworld.biomeAt(x, y) !== "sea" && overworld.biomeAt(x + 32, y) === "sea") {
                    shore = [x, y];
                }
            }
        }

        assert.ok(shore);
        assert.ok(surroundings.at(...shore).water.sea <= 55);
    });

    it("hears a camp fire near, and a brazier only while it's lit", () => {
        const lights = [{ x: 3, z: 4, kind: "fire" }, { x: 0, z: 2, kind: "brazier" }, { x: 0, z: 1, kind: "lantern" }];

        assert.equal(surroundings.at(0, 0, { lights }).fire, 5);
        assert.equal(surroundings.at(0, 0, { lights }).brazier, Infinity);
        assert.equal(surroundings.at(0, 0, { lights, lit: true }).brazier, 2);
    });
});
