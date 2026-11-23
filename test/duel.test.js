// Duels between players (client/js/core/host.js DUEL, the "duel" command; core/battle.js
// `dueling`, `truce`, DUEL_DOWN_MS; generated/multiplayer_scaling_plan.md 2-2, 2-3): asked, and
// accepted, declined or let lapse; the two and their companies enemies of each other alone, in one
// party or of one people though they be; over when one yields, when one's felled (down a moment
// and up where they fell: no death, nothing won or lost), when they're far apart, or when one
// leaves; a player who isn't accepting duels never asked, whoever tries told so and they nothing;
// and where the world's rules say so (RULES pvp "optin"), players enemies by a duel only.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOWNED, DUEL_DOWN_MS, STEP_MS } from "../client/js/core/battle.js";
import { COMMAND_SHAPES } from "../client/js/core/commandshape.js";
import { SCOPES } from "../client/js/core/eventscope.js";
import { DUEL, HOST_PLAYER, Host, presetRules, REFUSALS, RULE_CHOICES, RULES } from "../client/js/core/host.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { OWN_PARTS, ownParts } from "../client/js/core/summary.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });

function run(host, ms) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, map, [x, y]) => Object.assign(actor, { map, square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });
const duel = (host, id, what, more = {}) => host.command(id, { type: "duel", do: what, ...more });
const plain = ({ time: _time, ...event }) => event;
const told = (events, id) => events.filter(({ type, id: whose }) => type === "duel" && whose === id).map(({ change }) => change);

// A world with its player (Ada), Bea of the same people beside her, and Cy a little way off; and
// Orla, an orc, if `orc`
function together({ rules = RULES, orc = false } = {}) {
    const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules });

    host.join({ id: HOST_PLAYER, hero: HERO });
    host.join({ id: "bea", hero: { ...HERO, name: "Bea" } });
    host.join({ id: "cy", hero: { ...HERO, name: "Cy" } });

    if (orc) {
        host.join({ id: "orla", hero: { ...HERO, name: "Orla", race: "orc" } });
    }

    const me = host.battle.actor(HOST_PLAYER);
    const [x, y] = me.square;

    put(host.battle.actor("bea"), me.map, [x + 2, y]);
    put(host.battle.actor("cy"), me.map, [x, y + 4]);

    if (orc) {
        put(host.battle.actor("orla"), me.map, [x - 2, y]);
    }

    return host;
}

// Ada and Bea in a duel that's begun
function dueling(options) {
    const host = together(options);

    assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok, true);
    assert.equal(duel(host, "bea", "accept").ok, true);
    run(host, DUEL.startMs + STEP_MS);

    return host;
}

describe("a duel asked (core/host.js DUEL, the duel command)", () => {
    it("is asked of another player near, who's told, and has a while to answer; said no to, or let lapse, the asker's told", () => {
        const host = together();

        assert.deepEqual(DUEL, { reach: 40, askMs: 30000, startMs: 3000, apart: 60 });
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: HOST_PLAYER }).reason, "duelist");
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "nobody" }).reason, "duelist");
        assert.equal(duel(host, "bea", "accept").reason, "unchallenged");
        assert.equal(duel(host, "bea", "decline").reason, "unchallenged");
        assert.equal(duel(host, "bea", "yield").reason, "notDueling");
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok, true);
        assert.deepEqual(host.challenge("bea"), { from: HOST_PLAYER, until: host.battle.time + DUEL.askMs });
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).reason, "duelAsked", "(once is enough)");
        assert.equal(duel(host, "cy", "ask", { who: "bea" }).reason, "duelAsked", "(one asking at a time)");

        const asked = run(host, 100);

        assert.deepEqual([told(asked, "bea"), told(asked, HOST_PLAYER), told(asked, "cy")], [["asked"], ["sent"], []]);
        assert.deepEqual(plain(asked.find(({ type, change }) => type === "duel" && change === "asked")), { type: "duel", id: "bea", change: "asked", from: HOST_PLAYER, name: "Ada", until: host.challenge("bea").until });

        // (Said no to)
        assert.equal(duel(host, "bea", "decline").ok, true);
        assert.equal(host.challenge("bea"), null);
        assert.deepEqual(told(run(host, 100), HOST_PLAYER), ["declined"]);
        assert.equal(host.duelOf(HOST_PLAYER), null);

        // (Let lapse)
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok, true);

        const lapsed = run(host, DUEL.askMs + 200);

        assert.deepEqual([told(lapsed, HOST_PLAYER), told(lapsed, "bea")], [["sent", "unanswered"], ["asked", "lapsed"]]);
        assert.equal(host.challenge("bea"), null);
    });

    it("is refused of one too far off, or on another map, or dead, or with either in a duel already", () => {
        const host = together();
        const [me, bea] = [host.battle.actor(HOST_PLAYER), host.battle.actor("bea")];

        put(bea, me.map, [me.square[0] + DUEL.reach + 2, me.square[1]]);
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).reason, "duelFar");
        put(bea, me.map, [me.square[0] + 2, me.square[1]]);
        bea.dead = true;
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).reason, "dead");
        bea.dead = false;
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok, true);
        assert.equal(duel(host, "bea", "accept").ok, true);
        assert.equal(duel(host, "cy", "ask", { who: "bea" }).reason, "dueling");
        assert.equal(duel(host, "bea", "ask", { who: "cy" }).reason, "dueling");
    });

    it("is never asked of a player who isn't accepting duels: whoever tries is told so, and they nothing", () => {
        const host = together();

        assert.equal(host.acceptsDuels("bea"), true, "(accepting them, till their game says not)");
        assert.equal(duel(host, "bea", "accepting", { on: "no" }).reason, "command");
        assert.equal(duel(host, "bea", "accepting", { on: false }).ok, true);
        assert.equal(host.acceptsDuels("bea"), false);
        run(host, 100);

        const refused = duel(host, HOST_PLAYER, "ask", { who: "bea" });

        assert.deepEqual([refused.ok, refused.reason], [false, "noDuels"]);
        assert.equal(REFUSALS.noDuels, "This player is not accepting duels.");
        assert.equal(host.challenge("bea"), null);
        assert.deepEqual(
            run(host, 500).filter(({ type }) => type === "duel"),
            [],
            "(no word of it to anyone: the asker's told by the refusal alone)",
        );

        // (Nor may they ask, while they aren't; on again, they're asked as anyone)
        assert.equal(duel(host, "bea", "ask", { who: HOST_PLAYER }).reason, "duelsOff");
        assert.equal(duel(host, "bea", "accepting", { on: true }).ok, true);
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok, true);

        // (Kept with the world, where there's anything to keep; gone with the player)
        assert.equal(duel(host, "cy", "accepting", { on: false }).ok, true);
        assert.deepEqual(host.snapshot().noDuels, ["cy"]);
        assert.equal(Host.restore(buildWorld({ seed: 2 }), host.snapshot()).acceptsDuels("cy"), false);
        host.leave("cy");
        assert.equal(host.snapshot().noDuels, undefined);
    });

    it("has its command and its event known to the checks of what a game may say and who hears what", () => {
        assert.deepEqual(Object.keys(COMMAND_SHAPES.duel.fields), ["do"]);
        assert.equal(SCOPES.duel, "one must");
        assert.ok(OWN_PARTS.includes("duels"));

        for (const reason of ["duelist", "duelFar", "dueling", "duelAsked", "noDuels", "duelsOff", "unchallenged", "notDueling"]) {
            assert.equal(typeof REFUSALS[reason], "string", reason);
        }
    });
});

describe("a duel fought", () => {
    it("begins a moment after it's accepted: the two enemies of each other and of no one else, of one people or in one party though they be; asking back is saying yes", () => {
        const host = together();
        const [me, bea, cy] = [host.battle.actor(HOST_PLAYER), host.battle.actor("bea"), host.battle.actor("cy")];

        assert.equal(host.battle.hostile(me, bea), false, "(of one people)");
        assert.equal(host.command(HOST_PLAYER, { type: "party", do: "invite", who: "bea" }).ok, true);
        assert.equal(host.command("bea", { type: "party", do: "accept" }).ok, true);
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "bea" }).ok, true);
        assert.equal(duel(host, "bea", "ask", { who: HOST_PLAYER }).ok, true, "(asked back)");

        const at = host.battle.time + DUEL.startMs;

        assert.deepEqual([host.duelOf(HOST_PLAYER), host.duelOf("bea"), host.duelOf("cy")], [{ with: "bea", at }, { with: HOST_PLAYER, at }, null]);
        assert.equal(host.challenge("bea"), null);
        assert.equal(host.battle.hostile(me, bea), false, "(not yet)");

        const begun = run(host, DUEL.startMs + STEP_MS);

        assert.deepEqual([told(begun, HOST_PLAYER), told(begun, "bea")], [["sent", "begun"], ["asked", "begun"]]);
        assert.equal(host.battle.hostile(me, bea), true);
        assert.equal(host.battle.hostile(bea, me), true);
        assert.equal(host.canFight(me, bea), true);
        assert.deepEqual([host.battle.hostile(me, cy), host.battle.hostile(bea, cy)], [false, false], "(no one else's)");

        // (A view's told of it: both sides, to the two, and no one else)
        assert.deepEqual(Object.fromEntries([...ownParts(host, "bea").duels].map(([id, text]) => [id, JSON.parse(text)])), { bea: { with: HOST_PLAYER, at }, [HOST_PLAYER]: { with: "bea", at } });
        assert.equal(ownParts(host, "cy").duels.size, 0);

        // (Kept, and carried on)
        const again = Host.restore(buildWorld({ seed: 2 }), host.snapshot());

        assert.deepEqual(again.duelOf("bea"), { with: HOST_PLAYER, at });
        assert.equal(again.battle.hostile(again.battle.actor(HOST_PLAYER), again.battle.actor("bea")), true);
    });

    it("has each one's company in it: whoever follows one an enemy of the other and theirs, and of no one else", () => {
        const host = dueling();
        const [me, bea, cy] = [host.battle.actor(HOST_PLAYER), host.battle.actor("bea"), host.battle.actor("cy")];
        const mine = host.battle.add({ id: "mine", kind: "beast", team: me.team, leader: HOST_PLAYER, square: [me.square[0], me.square[1] + 1], map: me.map });
        const hers = host.battle.add({ id: "hers", kind: "beast", team: bea.team, leader: "bea", square: [bea.square[0], bea.square[1] + 1], map: bea.map });

        assert.equal(host.battle.hostile(mine, bea), true);
        assert.equal(host.battle.hostile(mine, hers), true);
        assert.equal(host.battle.hostile(hers, me), true);
        assert.deepEqual([host.battle.hostile(mine, me), host.battle.hostile(mine, cy), host.battle.hostile(hers, cy)], [false, false, false]);

        // (Yielded: all of it let go, their grudges and their aim at each other with it)
        mine.foes[bea.id] = host.battle.time + 60000;
        hers.target = me.id;
        me.target = bea.id;
        assert.equal(duel(host, "bea", "yield").ok, true);
        assert.deepEqual([host.battle.hostile(mine, bea), host.battle.hostile(mine, hers), host.battle.hostile(me, bea)], [false, false, false]);
        assert.deepEqual([mine.foes[bea.id], hers.target, me.target], [undefined, null, null]);

        const over = run(host, 100).filter(({ type }) => type === "duel").map(plain);

        assert.deepEqual(
            over,
            [
                { type: "duel", id: "bea", change: "over", why: "yielded", with: HOST_PLAYER, name: "Ada", winner: HOST_PLAYER },
                { type: "duel", id: HOST_PLAYER, change: "over", why: "yielded", with: "bea", name: "Bea", winner: HOST_PLAYER },
            ],
        );
        assert.deepEqual([host.duelOf(HOST_PLAYER), host.duelOf("bea")], [null, null]);
    });

    it("is over as one's felled by the other: down a moment and up where they fell, no death of it, nothing won", () => {
        const host = dueling();
        const [me, bea] = [host.battle.actor(HOST_PLAYER), host.battle.actor("bea")];
        const [gold, skills] = [host.players.get(HOST_PLAYER).progress.gold, JSON.stringify(host.players.get(HOST_PLAYER).progress.toJSON().skills ?? null)];
        const fell = [...bea.square];

        bea.hp = 1;
        assert.equal(host.command(HOST_PLAYER, { type: "engage", target: "bea" }).ok, true);

        const events = [];

        for (let t = 0; t < 20000 && !events.some(({ type }) => type === "death"); t += STEP_MS) {
            events.push(...host.advance(STEP_MS));
        }

        const death = events.find(({ type }) => type === "death");

        assert.deepEqual([death.id, death.by, death.downed, death.duel], ["bea", HOST_PLAYER, true, true]);
        assert.equal(death.respawnAt - host.battle.time <= DUEL_DOWN_MS, true);
        assert.deepEqual([bea.dead, bea.downed], [true, true]);
        assert.deepEqual(
            events.filter(({ type }) => type === "duel").map(({ id, why, winner }) => [id, why, winner]),
            [
                ["bea", "fell", HOST_PLAYER],
                [HOST_PLAYER, "fell", HOST_PLAYER],
            ],
        );
        assert.deepEqual([host.duelOf("bea"), host.battle.hostile(me, bea)], [null, false]);

        const after = run(host, DUEL_DOWN_MS + 200);
        const up = after.find(({ type, id }) => type === "respawn" && id === "bea");

        assert.ok(up?.rose, "up where she fell, not woken in the market square");
        assert.deepEqual([bea.dead, bea.downed, bea.map], [false, false, me.map]);
        assert.ok(Math.abs(bea.square[0] - fell[0]) <= 2 && Math.abs(bea.square[1] - fell[1]) <= 2, `${bea.square} by ${fell}`);
        assert.equal(bea.hp, Math.max(1, Math.round(bea.maxHp * DOWNED.hp)));
        assert.equal(host.players.get(HOST_PLAYER).progress.gold, gold, "(nothing won)");
        assert.equal(JSON.stringify(host.players.get(HOST_PLAYER).progress.toJSON().skills ?? null), skills, "(nor learnt)");
        assert.equal(after.some(({ type }) => type === "spoils"), false);
    });

    it("is over, no one's, when the two are far apart or on different maps; and when either leaves", () => {
        const far = dueling();
        const me = far.battle.actor(HOST_PLAYER);

        put(far.battle.actor("bea"), me.map, [me.square[0] + DUEL.apart + 2, me.square[1]]);
        assert.deepEqual(
            run(far, 100).filter(({ type }) => type === "duel").map(({ id, why, winner }) => [id, why, winner]),
            [
                ["bea", "apart", null],
                [HOST_PLAYER, "apart", null],
            ],
        );
        assert.equal(far.duelOf("bea"), null);

        const gone = dueling();

        gone.leave("bea");
        assert.deepEqual(
            run(gone, 100).filter(({ type }) => type === "duel").map(({ id, why, winner }) => [id, why, winner]),
            [[HOST_PLAYER, "left", HOST_PLAYER]],
        );
        assert.deepEqual([gone.duelOf(HOST_PLAYER), gone.snapshot().duels], [null, undefined]);
    });
});

describe("players who fight only by a duel (RULES pvp \"optin\"; the plan's 2-2)", () => {
    it("is what a shared world's preset has, and built; a company's world keeps the war between its players' peoples", () => {
        assert.deepEqual([RULE_CHOICES.pvp.built, RULE_CHOICES.pvp.shared, RULES.pvp], [true, "optin", "war"]);
        assert.equal(presetRules("shared").pvp, "optin");
        assert.equal(presetRules("company").pvp, "war");
        assert.equal(new Host(buildWorld({ seed: 2 }), { populate: false, rules: { pvp: "optin" } }).rules.pvp, "optin");
        assert.equal(new Host(buildWorld({ seed: 2 }), { populate: false, rules: { pvp: "always" } }).rules.pvp, "war");
    });

    it("keeps players and theirs from each other whatever's passed between them or their peoples, till a duel says otherwise; and leaves a company's world as it was", () => {
        const host = together({ rules: { ...RULES, pvp: "optin" }, orc: true });
        const [me, orla] = [host.battle.actor(HOST_PLAYER), host.battle.actor("orla")];
        const hers = host.battle.add({ id: "hers", kind: "beast", team: orla.team, leader: "orla", square: [orla.square[0], orla.square[1] + 1], map: orla.map });

        me.foes[orla.id] = host.battle.time + 600000;
        orla.foes[me.id] = host.battle.time + 600000;
        assert.deepEqual([host.battle.hostile(me, orla), host.battle.hostile(orla, me), host.battle.hostile(hers, me)], [false, false, false]);
        assert.equal(duel(host, HOST_PLAYER, "ask", { who: "orla" }).ok, true);
        assert.equal(duel(host, "orla", "accept").ok, true);
        run(host, DUEL.startMs + STEP_MS);
        assert.deepEqual([host.battle.hostile(me, orla), host.battle.hostile(hers, me)], [true, true]);
        assert.equal(duel(host, HOST_PLAYER, "yield").ok, true);
        assert.deepEqual([host.battle.hostile(me, orla), host.battle.hostile(hers, me)], [false, false]);

        // (A company's world, the same two: enemies as their grudge has them, as ever)
        const company = together({ orc: true });
        const [ada, orc] = [company.battle.actor(HOST_PLAYER), company.battle.actor("orla")];

        ada.foes[orc.id] = company.battle.time + 600000;
        assert.equal(company.battle.hostile(ada, orc), true);
    });
});
