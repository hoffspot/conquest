// Tracks on the ground (client/js/world/tracks3d.js; docs/WILDS.md *Tracks*): the print each of
// the wild's creatures leaves, as its feet are; where each foot comes down beside it; how well
// each footing takes one; and the prints themselves, lying on the ground where it slopes, the
// oldest let go once there are as many as there can be, fading by the clock
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOOKS } from "../client/js/beasts/looks.js";
import { CREATURES } from "../client/js/core/creatures.js";
import { footAt, lookPrint, printOf, PRINTS, TAKES, Tracks, TRACKS } from "../client/js/world/tracks3d.js";

describe("tracks on the ground (world/tracks3d.js)", () => {
    it("has a print for each of the wild's creatures as its feet are: paws, hooves, claws, boots and bare feet, a slither, a smear; none for what flies or floats", () => {
        assert.equal(printOf("wolf", { size: 1, feet: "paws" }), "paw");
        assert.equal(printOf("boar", { size: 1, feet: "paws" }, { hooves: true }), "hoof");
        assert.equal(printOf("bear", { size: 1, feet: "paws" }), "broad");
        assert.equal(printOf("puma", { size: 1, feet: "paws" }), "cat");
        assert.equal(printOf("dragon", { size: 3, feet: "paws" }), "claw");
        assert.equal(printOf("crocodile", { size: 1, feet: "paws" }), "lizard");
        assert.equal(printOf("snake", { size: 1, feet: "scales" }), "slither");
        assert.equal(printOf("slime", { size: 1, feet: "slime" }), "smear");
        assert.equal(printOf("bogFrog", { size: 1, feet: "webbed" }), "webbed");
        assert.equal(printOf("caveSpider", { size: 1, feet: "legs" }), "pricks");
        assert.equal(printOf("bats", { size: 1, feet: null }), null);
        assert.equal(printOf("wisp", { size: 1, feet: null }), null);

        // (Those drawn as people are: a boot's print, or the barefoot's own)
        assert.equal(printOf("bandit"), "boot");
        assert.equal(printOf("cultist"), "boot");
        assert.equal(printOf("goblin"), "bare");
        assert.equal(printOf("troll"), "bare");

        // (Every creature's, from its look: a print the atlas has, or none)
        for (const kind of Object.keys(CREATURES)) {
            const look = LOOKS[kind];
            const feet = look ? (look.feet ?? { quadruped: "paws", biped: "feet", humanoid: "feet", arachnid: "legs", blob: "slime", serpent: "scales", frog: "webbed" }[look.body] ?? null) : null;
            const print = printOf(kind, look && look.body !== "humanoid" ? { size: 1, feet } : null, { hooves: Boolean(look?.hooves) });

            assert.ok(print === null || PRINTS[print], `${kind}: ${print}`);
        }
    });

    it("has the print of a kind without one of it to hand, from its look, as big as one's been seen or as its look is (a trail's)", () => {
        assert.deepEqual(lookPrint("wolf", LOOKS.wolf), { print: "paw", size: 1 });
        assert.deepEqual(lookPrint("wolf", LOOKS.wolf, 1.3), { print: "paw", size: 1.3 });
        assert.equal(lookPrint("boar", LOOKS.boar).print, "hoof");
        assert.equal(lookPrint("bandit", LOOKS.bandit).print, "boot");
        assert.equal(lookPrint("goblin", LOOKS.goblin).print, "bare");
        assert.equal(lookPrint("caveSpider", LOOKS.caveSpider).print, "pricks");
        assert.equal(lookPrint("dragon", LOOKS.dragon).print, "claw");
        assert.deepEqual(lookPrint("cultist", undefined), { print: "boot", size: 1 });
    });

        it("puts each foot where it comes down beside the one stepping: a four-legged one's forefeet ahead and hind behind, left and right either side", () => {
        const [lfAcross, lfAhead] = footAt("lf", 1);
        const [rhAcross, rhAhead] = footAt("rh", 1);
        const [leftAcross, leftAhead] = footAt("left", 1.75);
        const [rightAcross] = footAt("right", 1.75);

        assert.ok(lfAcross < 0 && lfAhead > 0, "left fore: left and ahead");
        assert.ok(rhAcross > 0 && rhAhead < 0, "right hind: right and behind");
        assert.ok(leftAcross < 0 && leftAhead === 0 && rightAcross === -leftAcross);
        assert.deepEqual(footAt("body", 1), [0, 0]);
        assert.ok(Math.abs(footAt("lf", 2)[1]) === 2 * Math.abs(footAt("lf", 1)[1]), "as far out as it's big");
    });

    it("takes a print best in snow, mud and sand, faintly in grass and fallen leaves, none on stone, boards or water", () => {
        assert.ok(TAKES.snow === 1 && TAKES.mud === 1 && TAKES.sand > TAKES.dirt && TAKES.dirt > TAKES.grass && TAKES.grass > TAKES.gravel);
        assert.ok(TAKES.leaves > TAKES.gravel && TAKES.leaves < TAKES.dirt);

        for (const footing of ["stone", "wood", "water"]) {
            assert.equal(TAKES[footing], undefined, footing);
        }
    });

    it("lays each print on the ground, toes the way it went, the oldest let go once there are as many as there can be; none where it isn't taken", () => {
        const tracks = new Tracks();

        tracks.groundAt = (x, _z) => 2 + x * 0.1;
        tracks.print("paw", 10, 5, 0, 1.2, 0.75, 3);

        const matrix = new tracks.mesh.instanceMatrix.array.constructor(16);

        for (let k = 0; k < 16; k++) {
            matrix[k] = tracks.mesh.instanceMatrix.array[k];
        }

        assert.equal(tracks.mesh.count, 1);
        assert.ok(tracks.mesh.visible);
        assert.ok(Math.abs(matrix[13] - (3 + TRACKS.lift)) < 1e-6, "on the ground there, a little above it");
        assert.ok(matrix[4] !== 0, "leaning with the slope");
        assert.equal(tracks.cells[0], Object.keys(PRINTS).indexOf("paw"));
        assert.equal(tracks.made[0], 3);
        assert.equal(tracks.depths[0], 0.75);

        // (Nothing where the ground takes nothing, or of what isn't a print)
        tracks.print("paw", 0, 0, 0, 1, 0, 4);
        tracks.print("hoofprint", 0, 0, 0, 1, 1, 4);
        assert.equal(tracks.mesh.count, 1);

        // (As many as there can be, and more: the oldest let go)
        for (let k = 0; k < TRACKS.most + 5; k++) {
            tracks.print("boot", k, 0, 0, 1, 1, 10 + k);
        }

        assert.equal(tracks.mesh.count, TRACKS.most);
        assert.equal(tracks.next, 6);
        assert.ok(Math.min(...tracks.made) >= 10 + 5, "the oldest gone");

        // (The clock, for their fading; and all let go)
        tracks.update(500);
        assert.equal(tracks.uniforms.printNow.value, 500);
        tracks.clear();
        assert.equal(tracks.mesh.count, 0);
        assert.equal(tracks.mesh.visible, false);
        tracks.dispose();
    });
});
