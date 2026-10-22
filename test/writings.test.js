// What's written down and left to be found (core/writings.js): Sinclair's journal on his lectern
// in his study at the top of the Tower of Sar Mordal, read there and kept with the character.
// (Read in a browser, tapped on its lectern, its pages turned: e2e/pellagos.spec.js.)

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { riftTowerRooms } from "../client/js/core/insides.js";
import { readPlan } from "../client/js/core/interiors.js";
import { atWriting, beforeWriting, keepRead, READ_REACH, WRITINGS, writingOn } from "../client/js/core/writings.js";

describe("what's written and left to be found (core/writings.js)", () => {
    it("has each writing's title, whose it was, where it's found, and its pages, each a heading and what's written, said as it's written", () => {
        for (const [id, { title, by, found, entries }] of Object.entries(WRITINGS)) {
            assert.ok(title && by && found, id);
            assert.ok(entries.length >= 2, `${id}'s pages`);

            for (const { heading, hand = null, text, signed = null } of entries) {
                assert.ok(heading, `${id}: a heading`);
                assert.ok(Array.isArray(text) && text.length > 0 && text.every((paragraph) => typeof paragraph === "string" && paragraph.length > 20), `${id}: ${heading}`);
                assert.ok(hand === null || hand.endsWith("."), `${id}: ${heading}'s hand`);
                assert.ok(signed === null || typeof signed === "string");
                // (Plain words: no Markdown in it, no straight double quotes)
                assert.ok(text.every((paragraph) => !/[*_#`"]/.test(paragraph)), `${id}: ${heading}'s marks`);
            }
        }

        // (Sinclair's: ten pages, his wife Maren killed by what came through his rift, the last in
        // another hand, a guild's scout's)
        const { entries } = WRITINGS.sinclair;
        const all = entries.flatMap(({ text }) => text).join(" ");

        assert.equal(entries.length, 10);
        assert.ok(all.includes("Maren") && all.includes("rift") && all.includes("Oculus"));
        assert.equal(entries.at(-1).signed, "A scout of the Adventurers' Guild");
    });

    it("lies on the lectern in Sinclair's study, read from the square before it", () => {
        const [hall, study] = riftTowerRooms({ name: "The Tower of Sar Mordal" });
        const map = { ...readPlan("study", study.name, study.rows), writing: study.writing };
        const writing = writingOn(map);

        assert.equal(study.writing, "sinclair");
        assert.equal(writing.id, "sinclair");
        assert.equal(writing.piece.kind, "side-table");
        assert.equal(writingOn({ ...readPlan("hall", hall.name, hall.rows), writing: hall.writing ?? null }), null, "nothing written in the hall");
        assert.equal(writingOn({ ...map, writing: "nobody" }), null, "nothing that isn't written");

        // (Walked up to from the square before it, free, near enough it to read; not from across
        // the room)
        const [x, y] = beforeWriting(writing.piece);

        assert.equal(study.rows[y][x], ".");
        assert.ok(atWriting(writing.piece, x + 0.5, y + 0.5));
        assert.equal(atWriting(writing.piece, writing.piece.x + 0.5, writing.piece.y + writing.piece.h + READ_REACH + 0.2), false);
        assert.equal(atWriting(null, x, y), false);
    });

    it("is kept once read, each once, in the order first read; nothing kept that isn't written", () => {
        assert.deepEqual(keepRead(undefined, "sinclair"), ["sinclair"]);
        assert.deepEqual(keepRead(["sinclair"], "sinclair"), ["sinclair"]);
        assert.deepEqual(keepRead(["sinclair"], "nobody"), ["sinclair"]);
        assert.deepEqual(keepRead(["lost", "sinclair"], "sinclair"), ["sinclair"], "what isn't written let go");
        assert.deepEqual(keepRead("junk", "sinclair"), ["sinclair"]);
    });
});
