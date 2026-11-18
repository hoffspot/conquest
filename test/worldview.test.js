// The world view (client/js/core/worldview.js; generated/multiplayer_scaling_plan.md 3-3): what a
// game reads of the world's rules through one place, its first group (shops, talk, hires and
// trades), from its own Host (LocalView) or a moment later, as a server would answer
// (DeferredView). Both say the same of every one of the folk; and the game reaches none of the
// group's reads on its Host directly.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { after, DeferredView, LocalView, VIEW } from "../client/js/core/worldview.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

// A world with a hero in it, a second played on a while
function hosted() {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    for (let t = 0; t < 1000; t += STEP_MS) {
        host.advance(STEP_MS);
    }

    return host;
}

// A talk's or a shop's facts as plain data: what's read at once, read
const plain = (told) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(told).map(([name, value]) => [name, typeof value === "function" ? (name === "hired" ? "asked by id" : value()) : value]))));

describe("the world view's first group: shops, talk, hires and trades (core/worldview.js)", () => {
    it("names what it's asked, each implemented by both suppliers and nothing more", () => {
        const own = (kind) => Object.getOwnPropertyNames(kind.prototype).filter((name) => name !== "constructor");

        assert.deepEqual(own(LocalView), Object.keys(VIEW));
        assert.deepEqual(own(DeferredView), Object.keys(VIEW));

        for (const [name, words] of Object.entries(VIEW)) {
            assert.ok(words.length > 20, name);
        }
    });

    it("takes an answer at once or a promise of one (after)", async () => {
        const got = [];

        after(1, (value) => got.push(value));
        assert.deepEqual(got, [1], "at once: a solo game's talk opens in the tap that asked");
        after(Promise.resolve(2), (value) => got.push(value));
        assert.deepEqual(got, [1], "not before its promise settles");
        await Promise.resolve();
        assert.deepEqual(got, [1, 2]);
    });

    it("says the same of every one of the folk from the world itself and a moment later: their talk, their shop, the player's trade", async () => {
        const host = hosted();
        const [local, deferred] = [new LocalView(host), new DeferredView(new LocalView(host))];
        const folk = [...host.folk.keys(), ...(host.world.folk ?? []).map(({ id }) => id)].slice(0, 60);
        let stocked = 0;

        assert.ok(folk.length > 10, `${folk.length} folk`);

        for (const id of folk) {
            const told = local.talk(HOST_PLAYER, id, { hirable: true });
            const later = deferred.talk(HOST_PLAYER, id, { hirable: true });

            assert.equal(typeof later.then, "function", "a promise");
            assert.deepEqual(plain(await later), plain(told), id);
            // (As the Host has them)
            assert.deepEqual(told.stock, host.stockOf(id));
            assert.equal(told.times, host.shopTimes(id));
            assert.deepEqual(told.menders(), []);
            assert.equal(told.hired(id), false);
            assert.deepEqual(plain(await deferred.shop(id)), plain(local.shop(id)), id);
            assert.deepEqual(local.shop(id).threadWares(), host.threadWaresOf(id));
            stocked += told.stock ? 1 : 0;
        }

        assert.equal(local.trade(HOST_PLAYER), null);
        assert.equal(deferred.trade(HOST_PLAYER), null, "read at once: no promise");
        assert.ok(stocked >= 0);
    });

    it("reads what's asked whenever it's asked, as the world has it then: one hired is hired at once", () => {
        const host = hosted();
        const told = new LocalView(host).talk(HOST_PLAYER, "someone");

        assert.equal(told.hired("someone"), false);
        host.hired.add("someone");
        assert.equal(told.hired("someone"), true);
    });

    it("is the game's only way to the group's reads: none of them reached on its Host (app/game.js)", () => {
        const game = readFileSync(new URL("../client/js/app/game.js", import.meta.url), "utf8");
        const direct = [...game.matchAll(/\bhost\??\.(stockOf|shopTimes|threadWaresOf|hireOffer|stableOffer|trades|hired|messengerSaysOf|strangerOf)\b/g)].map(([, name]) => name);

        assert.deepEqual(direct, []);
        assert.ok(game.includes("this.worldview = new LocalView(this.host)"));
    });
});
