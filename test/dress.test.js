// Each people's everyday dress (client/js/characters/dress.js; characters/folk.js; core/townsfolk.js;
// docs/CHARACTERS.md *Each people's everyday dress*): their townsfolk, and the folk of their
// taverns and churches about their own business, dressed by their own culture rather than the
// humans' homespun, a variety of it; their own basket on the arm; field hands with hoes over the
// shoulder; each people's priests by their own name.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { EVERYDAY, everydayDress, theirs } from "../client/js/characters/dress.js";
import { EQUIPMENT } from "../client/js/characters/equipment.js";
import { folkLook, TOWNSFOLK_PARTS } from "../client/js/characters/folk.js";
import { buildItem } from "../client/js/characters/items.js";
import { LINGER, townsfolkOf } from "../client/js/core/townsfolk.js";

const PEOPLES = Object.keys(EVERYDAY);
const SEEDS = Array.from({ length: 24 }, (_, k) => k + 1);

// Each of the townsfolk of a people: every calling, each sex it has, many seeds
const townsfolk = (people) =>
    TOWNSFOLK_PARTS.flatMap((look) =>
        ["f", "m"].flatMap((sex) =>
            SEEDS.map((seed) => {
                try {
                    return folkLook({ role: "townsfolk", look, sex, seed, people });
                } catch {
                    return null;
                }
            }),
        ),
    ).filter(Boolean);

// What a human of a calling wears that each people has its own for
const HOMESPUN = new Set(Object.values(EVERYDAY).flatMap((own) => Object.keys(own)));

describe("each people's everyday dress (dress.js)", () => {
    it("has every piece of each people's everyday dress there to wear: garments, drapes and items", () => {
        for (const [people, own] of Object.entries(EVERYDAY)) {
            for (const [id, choices] of Object.entries(own)) {
                for (const piece of choices.flat().filter(Boolean)) {
                    assert.ok(EQUIPMENT[piece], `${people}: ${id} → ${piece}`);
                }
            }
        }
    });

    it("dresses each people's townsfolk in their own, not the humans' homespun, a piece to a slot, and a variety of it", () => {
        for (const people of PEOPLES) {
            const looks = townsfolk(people);
            const outfits = new Set();
            const worn = new Set();

            for (const { equipment } of looks) {
                const slots = equipment.map((id) => EQUIPMENT[id]?.slot);

                assert.ok(equipment.every((id) => EQUIPMENT[id]), `${people}: ${equipment.join(", ")}`);
                assert.equal(new Set(slots).size, slots.length, `${people}: one to a slot (${equipment.join(", ")})`);
                assert.ok(equipment.every((id) => !HOMESPUN.has(id) || theirs(people, id) === id), `${people}: no homespun (${equipment.join(", ")})`);
                outfits.add(equipment.toSorted().join("+"));
                equipment.forEach((id) => worn.add(id));
            }

            // (Of their own pieces, most worn by someone; and many outfits)
            const own = new Set(Object.values(EVERYDAY[people]).flat(2).filter(Boolean));

            assert.ok(outfits.size > looks.length / 3, `${people}: ${outfits.size} outfits of ${looks.length}`);
            assert.ok([...own].filter((id) => worn.has(id)).length >= own.size * 0.8, `${people}: ${[...own].filter((id) => !worn.has(id)).join(", ")} never worn`);
        }
    });

    it("puts no man of any people in a skirt: in his people's trousers, breeches, leggings or loincloth", () => {
        const skirt = (id) => EQUIPMENT[id].kind === "drape" && !EQUIPMENT[id].cape && (EQUIPMENT[id].arc ?? 1) >= 1;

        for (const people of ["human", ...PEOPLES]) {
            const men = [...TOWNSFOLK_PARTS, "patron", "worshipper"].flatMap((look) =>
                SEEDS.map((seed) => {
                    try {
                        return look === "patron" || look === "worshipper" ? folkLook({ role: look, sex: "m", seed, people }) : folkLook({ role: "townsfolk", look, sex: "m", seed, people });
                    } catch {
                        return null;
                    }
                }),
            );

            for (const { equipment } of men.filter(Boolean)) {
                assert.deepEqual(equipment.filter(skirt), [], `${people}: ${equipment.join(", ")}`);
                assert.ok(equipment.some((id) => ["legs", "underwear"].includes(EQUIPMENT[id].slot)), `${people}: something on the legs (${equipment.join(", ")})`);
            }
        }
    });

    it("keeps the humans in homespun, as they were, and the cat folk's ears and the lizard folk's feet bare", () => {
        const others = new Set(Object.values(EVERYDAY).flatMap((own) => Object.values(own).flat(2)).filter((id) => id && !HOMESPUN.has(id) && !["leatherApron", "belt"].includes(id)));

        for (const { equipment } of townsfolk("human")) {
            assert.ok(equipment.every((id) => !others.has(id)), equipment.join(", "));
        }

        for (const { equipment } of townsfolk("cat")) {
            assert.ok(equipment.every((id) => !["head", "feet"].includes(EQUIPMENT[id].slot)), equipment.join(", "));
        }

        for (const { equipment } of townsfolk("lizard")) {
            assert.ok(equipment.every((id) => EQUIPMENT[id].slot !== "feet"), equipment.join(", "));
        }
    });

    it("gives each people a basket of its own, held by its handle at the fist, hanging below it; and field hands their hoes", () => {
        const baskets = ["human", ...PEOPLES].map((people) => theirs(people, "basket"));

        assert.equal(new Set(baskets).size, baskets.length, baskets.join(", "));

        for (const id of baskets) {
            const item = EQUIPMENT[id];
            const box = new THREE.Box3().setFromObject(buildItem(item.model, {}));

            // (Its frame: the fist round the top of its handle, the basket down +z below it)
            assert.equal(item.socket, "rightHand", id);
            assert.ok(box.min.z > -0.03 && box.max.z > 0.2, `${id}: from ${box.min.z.toFixed(2)} to ${box.max.z.toFixed(2)} below the fist`);
        }

        for (const people of ["human", ...PEOPLES]) {
            const carried = townsfolk(people).flatMap(({ equipment }) => equipment);

            assert.ok(carried.includes(theirs(people, "basket")), `${people}: a basket carried`);
            assert.ok(carried.includes("hoe"), `${people}: a hoe carried`);
        }
    });

    it("dresses the folk of another people's taverns and churches their way, but an adventurer drinking there in their gear", () => {
        for (const people of PEOPLES) {
            for (const role of ["patron", "worshipper"]) {
                for (const sex of ["f", "m"]) {
                    const { equipment } = folkLook({ role, sex, seed: 3, people });

                    assert.ok(equipment.every((id) => !HOMESPUN.has(id) || theirs(people, id) === id), `${people} ${role}: ${equipment.join(", ")}`);
                }
            }

            // (A warrior's mail or padded coat kept, their sword put away for a tankard)
            assert.ok(folkLook({ role: "patron", look: "warrior", sex: "m", seed: 3, people }).equipment.some((id) => ["mail", "gambeson"].includes(id)));
        }

        // (Translated piece by piece: a human's tunic is an orc's vest, or a mantle, or nothing)
        assert.ok(EVERYDAY.orc.tunic.flat().includes("hideVestTan"));
        assert.deepEqual(everydayDress(["tunic", "pitchfork"], "human", 1), ["tunic", "pitchfork"]);
    });

    it("names each people's priests about the town their own way", () => {
        const errands = Object.fromEntries(Object.keys(LINGER).map((kind, k) => [kind, [{ square: [k, 0], facing: 0 }, { square: [k, 1], facing: 0 }]]));
        const priests = (people) => {
            const titles = new Set();

            for (let seed = 1; seed < 40; seed++) {
                townsfolkOf({ place: "a-town", kind: "capital", people, errands, count: 14, seed }).filter(({ look }) => look === "friar").forEach(({ title }) => titles.add(title));
            }

            return [...titles];
        };

        assert.deepEqual(priests("human"), ["Friar"]);
        assert.deepEqual(priests("orc"), ["Shaman"]);
        assert.ok(priests("elf").every((title) => title.startsWith("Moon-priest")) && priests("elf").length > 0);
        assert.ok(priests("cat").every((title) => title.startsWith("Sun-priest")));
    });
});
