// A character's own id (client/js/core/guid.js): random, version 4, made without crypto.randomUUID
// (a game opened from a server on the Wi-Fi hasn't it); kept on their hero wherever they go; a
// copy a world keeps as its own has an id of its own, and the one it was copied from as its origin
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyOf, freshOf, isGuid, newGuid, withGuid } from "../client/js/core/guid.js";
import { characterFrom } from "../client/js/core/netplay.js";
import { defaultHero } from "../client/js/app/heroes.js";

describe("a character's own id (guid.js)", () => {
    it("is random, version 4, never the same twice", () => {
        const made = Array.from({ length: 500 }, () => newGuid());

        assert.ok(made.every(isGuid));
        assert.equal(new Set(made).size, made.length);
        assert.ok(!isGuid("3F2B1C9E-7A4D-4E0F-9B21-5C6D7E8F9A0B") && !isGuid("not-an-id") && !isGuid(42) && !isGuid(null));
    });

    it("is given to a hero without one and kept by one with one; a copy has its own, the one copied as its origin; a new one made with its look, neither", () => {
        const hero = { ...defaultHero(), name: "Ada" };
        const kept = withGuid(hero);

        assert.ok(isGuid(kept.guid));
        assert.equal(withGuid(kept).guid, kept.guid);
        assert.equal(withGuid({ ...kept, origin: "nonsense" }).origin, undefined);

        const copy = copyOf(kept);

        assert.ok(isGuid(copy.guid) && copy.guid !== kept.guid);
        assert.equal(copy.origin, kept.guid);
        assert.equal(copy.name, "Ada");
        assert.equal(copyOf(copy).origin, copy.guid, "a copy of a copy: of the copy");

        const fresh = freshOf(copy);

        assert.ok(isGuid(fresh.guid) && fresh.guid !== copy.guid);
        assert.equal(fresh.origin, undefined);
    });

    it("comes with a character joining a world only if it's an id", () => {
        const hero = { ...defaultHero(), name: "Ada", race: "human" };
        const guid = newGuid();

        assert.equal(characterFrom({ hero: { ...hero, guid, origin: guid } }).hero.guid, guid);
        assert.equal(characterFrom({ hero: { ...hero, guid, origin: guid } }).hero.origin, guid);

        const bad = characterFrom({ hero: { ...hero, guid: "<script>", origin: { x: 1 } } }).hero;

        assert.equal(bad.guid, undefined);
        assert.equal(bad.origin, undefined);
    });
});
