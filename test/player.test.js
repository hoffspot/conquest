// A player's own identity (client/js/core/player.js, client/js/app/you.js): their id, a version 8
// UUID worked out from their key, the same every time and theirs alone; their code, the key written
// out, read back however it's typed and refused with a character mistyped; the names they may go
// by; the proof they show a server, good for that server alone, while it's fresh, under the name
// they gave; and the identity a device keeps, made once, renamed, and replaced by a code.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanPlayerName, codeOf, isPlayerId, newPlayerSecret, PLAYER_ID, playerIdOf, playerOfProof, PROOF_MINUTES, proofOf, publicKeyOf, secretOfCode } from "../client/js/core/player.js";

// A secret key that's always the same, for what's checked against it
const SECRET = Uint8Array.from({ length: 32 }, (_, k) => (k * 37 + 11) % 256);

describe("a player's own identity (core/player.js)", () => {
    it("has an id worked out from their key: a lowercase version 8 UUID, the same every time, and theirs alone", () => {
        const id = playerIdOf(publicKeyOf(SECRET));

        assert.match(id, PLAYER_ID);
        assert.equal(id, playerIdOf(publicKeyOf(SECRET)), "the same every time");
        assert.equal(id[14], "8", "version 8");
        assert.ok("89ab".includes(id[19]), "RFC 9562's variant");
        assert.equal(id, id.toLowerCase());
        assert.ok(isPlayerId(id));

        const ids = new Set(Array.from({ length: 300 }, () => playerIdOf(publicKeyOf(newPlayerSecret()))));

        assert.equal(ids.size, 300, "none the same");
        assert.ok([...ids].every(isPlayerId));
        assert.equal(playerIdOf("not a key"), null);
        assert.equal(isPlayerId("3f2b1c9e-7a4d-4e0f-9b21-5c6d7e8f9a0b"), false, "a character's id isn't a player's");
    });

    it("writes their key as a code, nine groups of six, read back however it's typed; a mistyped character refused", () => {
        const code = codeOf(SECRET);

        assert.match(code, /^([0-9A-HJKMNP-TV-Z]{6}-){8}[0-9A-HJKMNP-TV-Z]{6}$/);
        assert.deepEqual(secretOfCode(code), SECRET);
        assert.deepEqual(secretOfCode(` ${code.toLowerCase().replace(/-/g, " ")} `), SECRET, "in small letters, with spaces");
        assert.deepEqual(secretOfCode(code.replace(/-/g, "").replace(/0/g, "O").replace(/1/g, "I")), SECRET, "O for 0, I for 1");

        // (Every character mistyped, each for one that's next to it: refused)
        const caught = [...code.replace(/-/g, "")].filter((character, at, all) => {
            const other = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[("0123456789ABCDEFGHJKMNPQRSTVWXYZ".indexOf(character) + 1) % 32];

            return secretOfCode([...all.slice(0, at), other, ...all.slice(at + 1)].join("")) === null;
        });

        assert.equal(caught.length, 54);
        assert.equal(secretOfCode(code.slice(0, -1)), null, "one short");
        assert.equal(secretOfCode(`${code}A`), null, "one over");
        assert.equal(secretOfCode("not a code"), null);
        assert.equal(secretOfCode(null), null);
    });

    it("lets a player go by a name of 2 to 24 letters, digits, spaces and ' . - _, its spaces tidied", () => {
        assert.equal(cleanPlayerName("  Wren   the  Bold "), "Wren the Bold");
        assert.equal(cleanPlayerName("Élodie-Marie"), "Élodie-Marie");
        assert.equal(cleanPlayerName("O'Neil_2"), "O'Neil_2");
        assert.equal(cleanPlayerName("W"), null);
        assert.equal(cleanPlayerName("W".repeat(25)), null);
        assert.equal(cleanPlayerName("<b>Wren</b>"), null);
        assert.equal(cleanPlayerName(7), null);
    });

    it("proves who they are to one server: signed for it, fresh, under the name they gave; not to another, not stale, not renamed, not forged", () => {
        const at = "2026-10-19T02:00:00.000Z";
        const now = Date.parse(at);
        const proof = proofOf(SECRET, { server: "ABCDE-FGHJK", name: "Wren", at });

        assert.deepEqual(playerOfProof(proof, { server: "ABCDE-FGHJK", now }), { id: playerIdOf(publicKeyOf(SECRET)), key: publicKeyOf(SECRET), name: "Wren" });
        assert.ok(playerOfProof(proof, { server: "ABCDE-FGHJK", now: now + (PROOF_MINUTES - 1) * 60000 }), "within its minutes");
        assert.equal(playerOfProof(proof, { server: "ZZZZZ-ZZZZZ", now }), null, "another server");
        assert.equal(playerOfProof(proof, { server: "ABCDE-FGHJK", now: now + (PROOF_MINUTES + 1) * 60000 }), null, "stale");
        assert.equal(playerOfProof(proof, { server: "ABCDE-FGHJK", now: now - (PROOF_MINUTES + 1) * 60000 }), null, "from the future");
        assert.equal(playerOfProof({ ...proof, name: "Bram" }, { server: "ABCDE-FGHJK", now }), null, "renamed");
        assert.equal(playerOfProof({ ...proof, key: publicKeyOf(newPlayerSecret()) }, { server: "ABCDE-FGHJK", now }), null, "another's key");
        assert.equal(playerOfProof({ ...proof, signature: proof.signature.replace(/^./, (first) => (first === "A" ? "B" : "A")) }, { server: "ABCDE-FGHJK", now }), null, "forged");
        assert.equal(playerOfProof(proofOf(SECRET, { server: "ABCDE-FGHJK", name: "<b>", at }), { server: "ABCDE-FGHJK", now }), null, "a name nobody may go by");
        assert.equal(playerOfProof(null, { server: "ABCDE-FGHJK", now }), null);
    });
});

describe("the identity a device keeps (app/you.js)", () => {
    it("is made once, going by the name it's given, and kept; renamed; replaced by a code from another device; and proves itself", async () => {
        const items = new Map();

        globalThis.localStorage = { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), removeItem: (key) => items.delete(key) };

        const you = await import("../client/js/app/you.js");
        const made = you.loadPlayer({ name: "Wren" });

        assert.ok(isPlayerId(made.id));
        assert.equal(made.name, "Wren");
        assert.equal(you.loadPlayer({ name: "Bram" }).id, made.id, "made once");
        assert.equal(JSON.parse(items.get("pellagos.player")).version, 1);

        assert.equal(you.namePlayer("Wren the Bold"), true);
        assert.equal(you.namePlayer("W"), false);
        assert.equal(you.loadPlayer().name, "Wren the Bold");

        assert.equal(playerOfProof(you.proving("ABCDE-FGHJK"), { server: "ABCDE-FGHJK" }).id, made.id);

        // Another device's code: that player here now, going by the name used here
        const other = codeOf(SECRET);

        assert.deepEqual(you.usePlayerCode("not a code"), { error: "code" });
        assert.equal(you.loadPlayer().id, made.id, "nothing changed");
        assert.equal(you.usePlayerCode(other).player.id, playerIdOf(publicKeyOf(SECRET)));
        assert.equal(you.loadPlayer().id, playerIdOf(publicKeyOf(SECRET)));
        assert.equal(you.loadPlayer().name, "Wren the Bold", "the name gone by here, given none");
        assert.equal(you.playerCode(), other);
        assert.equal(you.usePlayerCode(other, { name: "Ada" }).player.name, "Ada", "or the one given");
    });
});
