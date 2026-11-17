// A player's way over navigation tiles not made yet waits for them, and the ground under them,
// to be made between steps, the hero setting off once they're in (client/js/core/battle.js
// Battle.farWaits, #pathTo, awaited; core/host.js soon; generated/multiplayer_scaling_plan.md
// 1-32). Made whole in the step that heard the command, a way 500 m over ground no one was near
// took 0.7 to 2.8 s of one step on a world server. Only where tiles are made off the step's
// thread (navigation.js later): a world server's (server/ahead.js) and the game's. It waits
// WAY_WAIT_MS at the most, then is made in the step as it was, so a hero always sets off; and the
// host says which ways wait, so those who've joined wait alike.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Battle, STEP_MS, WAY_WAIT_MS } from "../client/js/core/battle.js";
import { HOST_PLAYER, Host } from "../client/js/core/host.js";
import { navigatorOf } from "../client/js/core/navigation.js";
import { buildWorld } from "../client/js/core/overworld.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const FAR = 300;

// A world with one hero in it, its navigation's tiles sent on to `wanted` (as to a baker off the
// thread) when a way waits for them; and somewhere FAR metres off to walk to
function world(seed = 1) {
    const made = buildWorld({ seed });
    const host = new Host(made, { populate: false });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.populate();

    const navigation = navigatorOf(made.maps.town);
    const wanted = [];
    const told = [];

    navigation.later = (tx, ty) => wanted.push([tx, ty]);
    host.recorder = (op) => told.push(op);

    const me = host.battle.actor(HOST_PLAYER);

    return { host, me, navigation, wanted, told, to: [Math.floor(me.x) + FAR, Math.floor(me.y)], ground: made.maps.town };
}

const steps = (host, ms) => {
    for (let t = 0; t < ms; t += STEP_MS) {
        host.advance(STEP_MS);
    }
};

describe("a player's way over ground not made yet waits for it (core/battle.js Battle.farWaits, plan 1-32)", () => {
    it("makes nothing in the step that hears the command: the tiles are sent on, the ground asked for, the hero waits, and the host says so", () => {
        const { host, me, navigation, wanted, told, to, ground } = world();
        const [baked, chunks] = [navigation.baked, ground.chunksMade];

        assert.equal(host.command(HOST_PLAYER, { type: "move", to }).ok, true);
        assert.equal(navigation.baked, baked, "no tile baked hearing it");
        // (But the ground where they're going, looked at for a square to stand on there)
        assert.ok(ground.chunksMade - chunks <= 1, `${ground.chunksMade - chunks} chunks made hearing it`);
        assert.ok(wanted.length > 3, `${wanted.length} tiles sent on`);
        assert.equal(me.path.length, 0);
        assert.equal(me.awaits, host.battle.time);
        assert.equal(me.order?.type, "move");

        // (The ground from the hero to where they're going, for whoever makes it ahead: soon)
        const { boxes } = host.soon();

        // (All of every tile it runs over, and the border a tile's baked with)
        const { tile, border } = navigation.measures;

        assert.ok(boxes.some(([x0, y0, x1, y1]) => x0 <= Math.floor(me.x / tile) * tile - border && x1 >= (Math.floor(to[0] / tile) + 1) * tile + border && y0 <= Math.floor(me.y / tile) * tile - border && y1 >= (Math.floor(me.y / tile) + 1) * tile + border), JSON.stringify(boxes.slice(-2)));
        // (Told to those who've joined as a way that waits)
        assert.deepEqual(told.filter(([kind, , id]) => kind === "v" && id === HOST_PLAYER).at(-1).slice(3), [[], 1]);

        // Still waiting a second on, asked again, its order kept
        steps(host, 1000);
        assert.equal(me.path.length, 0);
        assert.equal(me.order?.type, "move");
        assert.ok(told.filter(([kind, , id, , waits]) => kind === "v" && id === HOST_PLAYER && waits === 1).length >= 2);
    });

    it("sets off once the tiles are in, made between steps", () => {
        const { host, me, navigation, wanted, to } = world();
        const from = [me.x, me.y];

        // (As a world server has it: the tiles further round a way that falls short sent on too)
        navigation.widenLater = true;

        host.command(HOST_PLAYER, { type: "move", to });
        steps(host, 200);

        // (Between steps: the baker's work)
        for (const [tx, ty] of wanted.splice(0)) {
            navigation.ensure(tx, ty);
        }

        const baked = navigation.baked;

        steps(host, 600);
        assert.equal(navigation.baked, baked, "none baked in a step");
        assert.equal(me.awaits, undefined);
        assert.ok(me.path.length > 0, "a way found");
        steps(host, 2000);
        assert.ok(me.x - from[0] > 2, `walked ${(me.x - from[0]).toFixed(1)} m`);
    });

    it("waits WAY_WAIT_MS at the most: then the way's made in the step, as it was", () => {
        const { host, me, navigation, to } = world();
        host.command(HOST_PLAYER, { type: "move", to });
        steps(host, WAY_WAIT_MS - 1000);
        assert.notEqual(me.awaits, undefined);
        assert.equal(me.path.length, 0);

        const baked = navigation.baked;

        steps(host, 2000);
        assert.ok(navigation.baked - baked > 3, "baked in the step");
        assert.equal(me.awaits, undefined);
        assert.ok(me.path.length > 0);
    });

    it("waits for nothing where no tile's made off the thread, or with the switch off: made as the command's heard", () => {
        for (const off of ["later", "switch"]) {
            const { host, me, navigation, to } = world();
            const baked = navigation.baked;

            assert.equal(Battle.farWaits, true, "Battle.farWaits is on");

            if (off === "later") {
                navigation.later = null;
            } else {
                Battle.farWaits = false;
            }

            try {
                host.command(HOST_PLAYER, { type: "move", to });
            } finally {
                Battle.farWaits = true;
            }

            assert.ok(navigation.baked > baked, off);
            assert.equal(me.awaits, undefined, off);
            assert.ok(me.path.length > 0, off);
        }
    });

    it("a way over tiles made already is found at once, as ever", () => {
        const { host, me, wanted } = world();

        steps(host, 500);
        wanted.splice(0);
        host.command(HOST_PLAYER, { type: "move", to: [Math.floor(me.x) + 3, Math.floor(me.y)] });

        // (Round where the hero came in, the tiles are in: nothing sent on, nothing waited for)
        if (!wanted.length) {
            assert.equal(me.awaits, undefined);
        }
    });
});
