// A dungeon's run for each party (the scaling plan's 2-21; core/host.js RULES `instances`
// "party", RUNS; core/insides.js addRun): whoever goes in by a dungeon's one front door is sent
// through to their own party's run of it, with its own levels, foes and slain; a party's is its
// leader's; one who leaves their party inside stays till they walk out; one who left the world
// is let back into theirs; no one's called into another's; and a run no one's in or near goes.
// A world shared by strangers has it (the `shared` preset), unless its own setting says not
// (`sharedDungeons`: server/reopen.js).

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DELVES, HOARD } from "../client/js/core/dungeons/play.js";
import { hypot } from "../client/js/core/exact.js";
import { delveKey, HOST_PLAYER, Host, presetRules, REFUSALS, RULE_CHOICES, ruled, RULES, RUNS, runBase, runSite } from "../client/js/core/host.js";
import { DUNGEON_ORIGINS, dungeonLevel, HELL_ORIGINS, KEEP_ORIGINS } from "../client/js/core/insides.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { keepSiteOf } from "../client/js/core/scenery.js";
import { decode, encode } from "../client/js/core/wire.js";
import { relaxedFor, rulesFor } from "../server/reopen.js";
import { WORLD_SETTINGS } from "../server/storage/worlds.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const PARTY_RULE = ruled({ instances: "party" });

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

describe("the rule (host.js RULES instances, RUNS)", () => {
    it("is a dungeon's one run for everyone unless a world says, a run for each party in a world shared by strangers, and a world's own setting turns that off", () => {
        assert.equal(RULES.instances, "site");
        assert.deepEqual(RULE_CHOICES.instances, { of: ["site", "party"], shared: "party", slice: "2-21", built: true });
        assert.deepEqual(RUNS, { linger: 600000, most: 4, hourly: 10, hour: 3600000 });
        assert.equal(presetRules("shared").instances, "party");
        assert.equal(presetRules("company").instances, "site");
        assert.ok(REFUSALS.otherRun.includes("another party's"));

        assert.equal(WORLD_SETTINGS.sharedDungeons.default, false);
        assert.deepEqual(relaxedFor({ settings: { sharedDungeons: true } }), { instances: "site" });
        assert.deepEqual(relaxedFor({ settings: { sharedDungeons: true, freeFollowers: true } }), { followers: "free", instances: "site" });
        assert.equal(rulesFor({ settings: { preset: "shared" } }).instances, "party");
        assert.equal(rulesFor({ settings: { preset: "shared", sharedDungeons: true } }).instances, "site");
        assert.equal(rulesFor({ settings: { preset: "company" } }).instances, "site");

        const host = new Host(buildWorld({ seed: 2 }), { populate: false, rules: { instances: "party" } });

        assert.equal(host.rules.instances, "party");
        host.preset("shared", { rules: relaxedFor({ settings: { sharedDungeons: true } }) });
        assert.equal(host.rules.instances, "site", "(a kept world, as it's opened)");
        host.preset("shared");
        assert.equal(host.rules.instances, "party");
    });
});

describe("a dungeon's runs in the interiors (insides.js addRun, dropRun)", () => {
    it("stands a run beside its site's dungeon: the same dungeon, its own levels in a lane of its own, a door that only leads out; and takes it out again whole", () => {
        const world = buildWorld({ seed: 1 });
        const site = world.plan.sites.find(({ kind, theme }) => kind === "dungeon" && theme !== "hell");

        world.maps.town.sites.heartOf(site);

        const interiors = world.interiors;
        const key = `site:${site.id}`;
        const front = interiors.buildings.get(key);
        const links = world.links.length;

        assert.equal(interiors.addRun("no such", "x~1"), null);

        const one = interiors.addRun(key, runSite(site.id, 1));
        const two = interiors.addRun(key, runSite(site.id, 2));

        assert.equal(interiors.addRun(key, runSite(site.id, 1)), one, "as it is, asked again");
        assert.equal(interiors.addRun(one.key, "x~9"), null, "no run of a run");
        assert.deepEqual([one.key, one.site, one.base, one.lane, two.lane], [`site:${site.id}~1`, `${site.id}~1`, site.id, 1, 2]);
        assert.deepEqual([one.seed, one.theme, one.entrance], [front.seed, front.theme, front.entrance]);
        assert.equal(runBase(one.site), site.id);
        assert.equal(runBase(site.id), site.id);
        // (Its door: no squares to go in by, out to where the site's own stands)
        assert.deepEqual(one.door.ends[0], { map: front.door.ends[0].map, squares: [], arrive: front.door.ends[0].arrive, facing: front.door.ends[0].facing });
        assert.equal(world.links.length, links + 2);

        interiors.make(one.key);
        interiors.make(two.key);
        assert.equal(front.made, false, "the site's own not made for them");
        assert.deepEqual(one.maps, one.dungeon.levels.map((_, k) => dungeonLevel(one.key, 0, k)));
        assert.equal(one.maps.length, two.maps.length);
        assert.ok(one.maps.every((id) => !two.maps.includes(id) && interiors.of(id) === one));

        const [a, b] = [world.maps[one.maps[0]], world.maps[two.maps[0]]];

        assert.deepEqual(a.plan, b.plan, "the same dungeon");
        assert.deepEqual([b.origin[0] - a.origin[0], b.origin[1] - a.origin[1]], [0, DUNGEON_ORIGINS.lane]);
        // (Its way out, from beyond its last level if it has one, to before the front door too)
        assert.ok(one.flights.every((flight) => world.links.includes(flight)));

        const maps = [...one.maps];

        assert.equal(interiors.dropRun(one.site), true);
        assert.equal(interiors.dropRun(one.site), false);
        assert.equal(interiors.dropRun(site.id), false, "never the site's own");
        assert.ok(maps.every((id) => !world.maps[id] && !interiors.of(id)));
        assert.equal(interiors.buildings.has(one.key), false);
        assert.ok(!world.links.includes(one.door) && one.flights.every((flight) => !world.links.includes(flight)));
        assert.ok(world.links.includes(two.door) && two.maps.every((id) => world.maps[id]));
        // (The lane it stood in free again for the next)
        assert.equal(interiors.addRun(key, runSite(site.id, 3)).lane, 1);
    });
});

describe("a dungeon's run for each party (host.js RULES instances \"party\")", () => {
    const IDS = [HOST_PLAYER, "bea", "cal"];
    let world;
    let host;
    let site;
    let front;
    let outside;
    let far;

    const actor = (id) => host.battle.actor(id);

    function run(ms) {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            for (const id of IDS) {
                if (actor(id)) {
                    actor(id).hp = actor(id).maxHp;
                }
            }

            events.push(...host.advance(STEP_MS));
        }

        return events;
    }

    // Through a way (a link) from the map they're on: stood where one comes off it there, told to
    // go through, and played on till they have (or a minute's gone): whether they did
    function cross(id, link) {
        const me = actor(id);

        put(me, link.ends.find(({ map }) => map === me.map).arrive);
        assert.ok(host.command(id, { type: "enter", link: link.id }).ok);

        for (let t = 0; t < 60000; t += 250) {
            if (run(250).some((event) => event.type === "cross" && event.id === id)) {
                return true;
            }
        }

        return false;
    }

    const runOf = (id) => world.interiors.of(actor(id).map);
    const out = (id) => cross(id, runOf(id).door);

    before(() => {
        world = buildWorld({ seed: 1 });
        host = new Host(world, { populate: false });
        host.rules = PARTY_RULE;

        for (const id of IDS) {
            host.join({ id, hero: { ...HERO, name: id } });
        }

        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        for (const id of IDS) {
            Object.assign(actor(id), { hp: 1e6, maxHp: 1e6 });
        }

        const [sx, sy] = world.start.at;

        site = world.plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme !== "hell").sort((a, b) => hypot(a.at[0] - sx, a.at[1] - sy) - hypot(b.at[0] - sx, b.at[1] - sy))[0];
        world.maps.town.sites.heartOf(site);
        outside = world.maps.town.sites.set.get(site.id).entrance.outside;
        front = world.interiors.buildings.get(`site:${site.id}`);
        far = [...actor("cal").square];
        assert.ok(hypot(far[0] - site.at[0], far[1] - site.at[1]) > DELVES.far, "the start well away from it");
    });

    it("sends two in no party who go in by its one front door to runs of their own: their own levels, woken for them; the site's own never made", () => {
        assert.equal(host.runs.size, 0);
        assert.ok(cross(HOST_PLAYER, front.door));
        assert.ok(cross("bea", front.door));

        const [mine, hers] = [runOf(HOST_PLAYER), runOf("bea")];

        assert.deepEqual([mine.site, hers.site], [runSite(site.id, 1), runSite(site.id, 2)]);
        assert.deepEqual([actor(HOST_PLAYER).map, actor("bea").map], [dungeonLevel(mine.key, 0, 0), dungeonLevel(hers.key, 0, 0)]);
        assert.equal(front.made, false);
        assert.equal(host.delveOf(site.id), null);
        assert.deepEqual([...host.runs.values()].map(({ site: of, owner, entered }) => [of, owner, entered]), [
            [site.id, `solo:${HOST_PLAYER}`, true],
            [site.id, "solo:bea", true],
        ]);
        assert.equal(host.runFor("cal", site.id), null, "none for one who hasn't come");

        // (Each with its own first level's foes out)
        for (const each of [mine, hers]) {
            const delve = host.delveOf(each.site);

            assert.equal(host.dungeons.get(delveKey(each.site, 0)), delve);
            assert.ok(delve.awake[0].length > 0);
            assert.ok(delve.awake[0].every((id) => actor(id).map === each.maps[0] && host.wild.get(id).dungeon === each.site));
        }

        // (And the dungeon marked found, not the run)
        assert.ok(host.players.get("bea").explored.entered.has(`site:${site.id}`));
        assert.ok(![...host.players.get("bea").explored.entered].some((key) => key.includes("~")));
    });

    it("keeps a kill in one run out of the other", () => {
        const [mine, hers] = [runOf(HOST_PLAYER), runOf("bea")];
        const me = actor(HOST_PLAYER);
        const id = host.delveOf(mine.site).awake[0].find((each) => !actor(each).dead);
        const foe = actor(id);
        const { foe: key } = host.wild.get(id);

        foe.hp = 1;
        put(me, [foe.square[0], foe.square[1] + 1]);
        assert.ok(host.command(HOST_PLAYER, { type: "engage", target: id }).ok);

        for (let t = 0; t < 30000 && !host.delveOf(mine.site).dead.includes(key); t += 250) {
            run(250);
        }

        host.command(HOST_PLAYER, { type: "stop" });
        assert.ok(host.delveOf(mine.site).dead.includes(key));
        assert.deepEqual(host.delveOf(hers.site).dead, []);

        const twin = host.delveOf(hers.site).awake[0].find((each) => host.wild.get(each)?.foe === key);

        assert.ok(twin && !actor(twin).dead, "the same foe still standing in the other");
    });

    it("is kept in a snapshot: each run taken up again as it was, in its lane, with whoever's in it; one with no runs keeps nothing of them", () => {
        const kept = decode(encode(host.snapshot()));
        const again = Host.restore(buildWorld({ seed: 1 }), kept);

        assert.equal(again.rules.instances, "party", "the rule kept with it");
        assert.deepEqual([...again.runs], [...host.runs]);
        assert.deepEqual(kept.runs.map(({ lane }) => lane), [1, 2]);
        assert.equal(again.nextRun, 3);

        for (const id of [HOST_PLAYER, "bea"]) {
            const [was, now] = [runOf(id), again.world.interiors.of(again.battle.actor(id).map)];

            assert.equal(again.battle.actor(id).map, actor(id).map);
            assert.deepEqual([now.key, now.base, now.lane, now.tier, now.maps], [was.key, was.base, was.lane, was.tier, was.maps]);
            assert.deepEqual(again.world.maps[now.maps[0]].origin, world.maps[was.maps[0]].origin);
            assert.deepEqual(again.delveOf(now.site), host.delveOf(was.site));
            assert.equal(again.runFor(id, site.id).id, was.site);
        }

        assert.equal(again.world.interiors.buildings.get(`site:${site.id}`).made, false);

        // (Played on: still theirs, nothing made or let go for it)
        for (let t = 0; t < 1000; t += STEP_MS) {
            again.advance(STEP_MS);
        }

        assert.deepEqual([...again.runs.keys()], [...host.runs.keys()]);
        assert.deepEqual(decode(encode(again.snapshot())).runs.map(({ id }) => id), kept.runs.map(({ id }) => id));

        // (Where a dungeon's one run is everyone's: no word of runs in what's kept)
        const plain = new Host(buildWorld({ seed: 1 }), { populate: false }).snapshot();

        assert.ok(!("runs" in plain) && !("nextRun" in plain));
    });

    it("lets no one be called into a run that isn't theirs to go into", () => {
        const at = actor("bea").map;

        host.summonings.set("bea", { by: HOST_PLAYER, until: Infinity });

        const answer = host.command("bea", { type: "summoned", come: true });

        assert.deepEqual([answer.ok, answer.reason], [false, "otherRun"]);
        assert.equal(actor("bea").map, at);
        assert.equal(host.summonings.has("bea"), false);
    });

    it("gives a party its leader's run: the other's own is no one's, and goes once they walk out of it; then the one door takes them both to the one run", () => {
        const [mine, hers] = [runOf(HOST_PLAYER), runOf("bea")];

        assert.ok(host.command(HOST_PLAYER, { type: "party", do: "invite", who: "bea" }).ok);
        assert.ok(host.command("bea", { type: "party", do: "accept" }).ok);
        assert.equal(host.runFor("bea", site.id).id, mine.site);

        const party = host.partyFor("bea");

        assert.deepEqual([host.runs.get(mine.site).owner, host.runs.get(hers.site).owner], [party.id, null]);
        // (Still in it till she walks out)
        run(500);
        assert.equal(runOf("bea"), hers);
        assert.ok(out("bea"));
        assert.equal(actor("bea").map, "town");

        const events = run(500);

        assert.ok(events.some((event) => event.type === "dungeon" && event.change === "retired" && event.site === hers.site && event.why === "empty"));
        assert.equal(host.runs.has(hers.site), false);
        assert.equal(world.interiors.buildings.has(hers.key), false);
        assert.equal(host.delveOf(hers.site), null);
        assert.ok(![...host.wild.values()].some((one) => one.dungeon === hers.site));

        assert.ok(cross("bea", front.door));
        assert.equal(runOf("bea"), mine);

        // (And called to her leader's side in it, she comes)
        put(actor("bea"), world.maps[mine.maps[0]].marks.D[0]);
        host.summonings.set("bea", { by: HOST_PLAYER, until: Infinity });
        assert.equal(host.command("bea", { type: "summoned", come: true }).ok, true);
    });

    it("leaves one who quits their party inside where they are till they walk out; the run's the one left's, and the one who quit comes back to a run of their own", () => {
        const mine = runOf(HOST_PLAYER);

        assert.ok(host.command("bea", { type: "party", do: "leave" }).ok);
        assert.equal(host.partyFor(HOST_PLAYER), null);
        assert.equal(host.runs.get(mine.site).owner, `solo:${HOST_PLAYER}`);
        run(500);
        assert.equal(runOf("bea"), mine, "not thrown out");
        assert.ok(out("bea"));
        assert.ok(cross("bea", front.door));
        assert.notEqual(runOf("bea"), mine);
        assert.equal(host.runs.get(runOf("bea").site).owner, "solo:bea");
        assert.equal(runOf(HOST_PLAYER), mine);
    });

    it("lets one who left the world while a run was their party's back into it", () => {
        const mine = runOf(HOST_PLAYER);
        const hers = runOf("bea");

        assert.ok(host.command(HOST_PLAYER, { type: "party", do: "invite", who: "bea" }).ok);
        assert.ok(host.command("bea", { type: "party", do: "accept" }).ok);
        assert.equal(host.runFor("bea", site.id).id, mine.site);
        host.leave("bea");
        assert.deepEqual([host.runs.get(mine.site).owner, host.runs.get(mine.site).dropped], [`solo:${HOST_PLAYER}`, ["bea"]]);
        run(500);
        assert.equal(host.runs.has(hers.site), false, "her own, no one's and empty, gone");

        host.join({ id: "bea", hero: { ...HERO, name: "bea" }, place: { x: outside[0] + 0.5, y: outside[1] + 0.5, facing: 0 } });
        Object.assign(actor("bea"), { hp: 1e6, maxHp: 1e6 });
        assert.equal(host.partyFor("bea"), null);
        assert.equal(host.runFor("bea", site.id).id, mine.site);
        assert.ok(cross("bea", front.door));
        assert.equal(runOf("bea"), mine);
        // (Not one who never was of it)
        assert.equal(host.runFor("cal", site.id), null);
    });

    it("begins a run for one who comes near the way in, and lets it go at once if they leave without going in; one gone into stands RUNS.linger with no one in it or near, then goes", () => {
        put(actor("cal"), outside);
        run(500);

        const cals = host.runFor("cal", site.id);
        const building = world.interiors.buildings.get(`site:${cals.id}`);

        assert.deepEqual([cals.owner, cals.entered, building.made], ["solo:cal", false, true]);
        assert.ok(host.delveOf(cals.id).awake[0].length > 0, "woken for the one coming");
        put(actor("cal"), far);
        run(500);
        assert.equal(host.runs.has(cals.id), false);
        assert.equal(world.interiors.buildings.has(building.key), false);

        // (The one two have been in: everyone out and away)
        const mine = runOf(HOST_PLAYER);
        const kept = host.runs.get(mine.site);

        assert.ok(out(HOST_PLAYER));
        assert.ok(out("bea"));
        put(actor(HOST_PLAYER), far);
        put(actor("bea"), [far[0] + 1, far[1]]);
        run(500);
        assert.equal(host.runs.get(mine.site), kept);
        assert.equal(typeof kept.emptySince, "number");
        // (Back within the time: theirs still, as it was)
        put(actor(HOST_PLAYER), outside);
        run(500);
        assert.equal(kept.emptySince, null);
        assert.ok(cross(HOST_PLAYER, front.door));
        assert.equal(runOf(HOST_PLAYER), mine);
        assert.ok(out(HOST_PLAYER));
        put(actor(HOST_PLAYER), far);
        run(500);
        // (The time gone by: a clock stepped, not ten minutes played)
        kept.emptySince = host.battle.time - RUNS.linger;

        const events = run(100);

        assert.ok(events.some((event) => event.type === "dungeon" && event.change === "retired" && event.site === mine.site));
        assert.equal(host.runs.size, 0);
        assert.ok(![...world.interiors.buildings.values()].some((each) => each.base));
        assert.ok(!Object.keys(world.maps).some((id) => id.includes("~")));
        assert.ok(!world.links.some((link) => link.id.includes("~")));
    });

    it("goes in as ever where a dungeon's one run is everyone's (instances \"site\")", () => {
        host.rules = ruled({});
        assert.equal(host.rules.instances, "site");
        assert.ok(cross("cal", front.door));
        assert.equal(runOf("cal"), front);
        assert.equal(host.runs.size, 0);
    });
});

describe("a run of Bellhaven's keep for each party (scenery.js keepSiteOf)", () => {
    it("sends each who goes in by the keep's doors, off the castle's court, to a keep of their own; and back out before those doors", () => {
        const world = buildWorld({ seed: 1 });
        const host = new Host(world, { populate: false });
        const ids = [HOST_PLAYER, "bea"];

        host.rules = PARTY_RULE;

        for (const id of ids) {
            host.join({ id, hero: { ...HERO, name: id } });
            Object.assign(host.battle.actor(id), { hp: 1e6, maxHp: 1e6 });
        }

        const scene = world.plan.sites.find(({ scenery }) => scenery === "bellhaven");
        const castle = world.interiors.buildings.get(`site:${scene.id}`);
        const site = keepSiteOf(scene);
        const keep = world.interiors.buildings.get(`site:${site.id}`);

        world.interiors.make(castle.key);

        const cross = (id, link) => {
            const me = host.battle.actor(id);

            put(me, link.ends.find(({ map }) => map === me.map).arrive);
            assert.ok(host.command(id, { type: "enter", link: link.id }).ok);

            for (let t = 0; t < 60000; t += STEP_MS) {
                for (const each of ids) {
                    host.battle.actor(each).hp = 1e6;
                }

                if (host.advance(STEP_MS).some((event) => event.type === "cross" && event.id === id)) {
                    return true;
                }
            }

            return false;
        };

        for (const id of ids) {
            Object.assign(host.battle.actor(id), { map: castle.maps[0] });
            assert.ok(cross(id, keep.door), `${id} in`);
        }

        const [mine, hers] = ids.map((id) => world.interiors.of(host.battle.actor(id).map));

        assert.deepEqual([mine.base, hers.base, mine.site, hers.site], [site.id, site.id, runSite(site.id, 1), runSite(site.id, 2)]);
        assert.equal(keep.made, false);
        assert.deepEqual([mine.theme, mine.scene, mine.maps.length], ["keep", castle.key, 5]);
        assert.deepEqual(world.maps[mine.maps[0]].origin, [KEEP_ORIGINS.x, DUNGEON_ORIGINS.lane]);
        assert.deepEqual(world.maps[hers.maps[1]].origin, [KEEP_ORIGINS.x, KEEP_ORIGINS.step + 2 * DUNGEON_ORIGINS.lane]);
        assert.ok(host.delveOf(mine.site).awake[0].length > 0 && host.delveOf(hers.site).awake[0].length > 0);
        // (Each stair up barred by its own warden: its own seal)
        assert.equal(mine.flights[0].seal.map, mine.maps[0]);
        assert.equal(hers.flights[0].seal.map, hers.maps[0]);

        assert.ok(cross("bea", hers.door), "out");
        assert.equal(host.battle.actor("bea").map, castle.maps[0]);
        assert.deepEqual(host.battle.actor("bea").square, keep.door.ends[0].arrive);
    });
});

describe("a run of a hell, and a leader's followers (host.js #doorFor, #bring)", () => {
    // Stood before a way in and sent through it as the battle takes anyone through: whether they crossed
    const through = (host, id, link) => {
        const me = host.battle.actor(id);

        put(me, link.ends.find(({ map }) => map === me.map).arrive);
        me.order = { type: "enter", link: link.id };

        for (let t = 0; t < 30000; t += STEP_MS) {
            me.hp = me.maxHp;

            if (host.advance(STEP_MS).some((event) => event.type === "cross" && event.id === id)) {
                return true;
            }
        }

        return false;
    };

    it("gives each who goes through a hell's portal a hell of their own: its realms in their own lane, each portal on sealed by its own boss, and its way out back before the one portal", () => {
        const world = buildWorld({ seed: 1 });
        const host = new Host(world, { populate: false, rules: { instances: "party" } });

        host.join({ id: HOST_PLAYER, hero: HERO });
        Object.assign(host.battle.actor(HOST_PLAYER), { hp: 1e6, maxHp: 1e6 });

        const site = world.plan.sites.find(({ kind, theme }) => kind === "dungeon" && theme === "hell");

        world.maps.town.sites.heartOf(site);

        const front = world.interiors.buildings.get(`site:${site.id}`);

        // (Its rite's the one portal's, the world's: gone through here as if it were broken)
        assert.ok(through(host, HOST_PLAYER, front.door));

        const mine = world.interiors.of(host.battle.actor(HOST_PLAYER).map);

        assert.deepEqual([mine.site, mine.base, mine.theme, front.made], [runSite(site.id, 1), site.id, "hell", false]);
        assert.equal(world.maps[mine.maps[0]].origin[0] >= HELL_ORIGINS.x, true);
        assert.equal(world.maps[mine.maps[0]].origin[1] >= DUNGEON_ORIGINS.lane, true);
        assert.ok(mine.flights.length >= mine.maps.length - 1);

        for (const flight of mine.flights) {
            assert.ok(flight.seal && mine.maps.includes(flight.seal.map), `${flight.id} sealed by a boss of its own run`);
        }

        // (Its way out, from beyond its lord: to before the portal, in the world)
        const out = mine.flights.at(-1).ends[0];

        assert.deepEqual([out.map, out.arrive], [front.door.ends[0].map, front.door.ends[0].arrive]);
        assert.ok(host.delveOf(mine.site));
    });

    it("brings a leader's followers into their leader's run with them", () => {
        const world = buildWorld({ seed: 1 });
        const host = new Host(world, { populate: false, rules: { instances: "party" } });

        host.join({ id: HOST_PLAYER, hero: HERO, followers: [{ name: "Wren", calling: "warrior", sex: "f", seed: 7, level: 1 }] });
        host.join({ id: "bea", hero: { ...HERO, name: "bea" } });

        for (const id of [HOST_PLAYER, "bea"]) {
            Object.assign(host.battle.actor(id), { hp: 1e6, maxHp: 1e6 });
        }

        const [sx, sy] = world.start.at;
        const site = world.plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme !== "hell").sort((a, b) => hypot(a.at[0] - sx, a.at[1] - sy) - hypot(b.at[0] - sx, b.at[1] - sy))[0];

        world.maps.town.sites.heartOf(site);

        const front = world.interiors.buildings.get(`site:${site.id}`);
        const [follower] = [...host.followers.keys()];

        assert.ok(follower, "one with them");
        assert.ok(through(host, "bea", front.door));
        assert.ok(through(host, HOST_PLAYER, front.door));

        const [mine, hers] = [HOST_PLAYER, "bea"].map((id) => world.interiors.of(host.battle.actor(id).map));

        assert.notEqual(mine, hers);
        assert.equal(host.battle.actor(follower).map, host.battle.actor(HOST_PLAYER).map);
    });
});

describe("the caps on runs, and the hoard a day (host.js RUNS most, hourly; the plan's 2-22)", () => {
    const IDS = [HOST_PLAYER, "bea", "cal", "dov", "eve"];
    let world;
    let host;
    let sites;
    let far;

    const actor = (id) => host.battle.actor(id);
    const front = (site) => world.interiors.buildings.get(`site:${site.id}`);
    const runOf = (id) => world.interiors.of(actor(id).map);

    function run(ms) {
        const events = [];

        for (let t = 0; t < ms; t += STEP_MS) {
            for (const id of IDS) {
                actor(id).hp = actor(id).maxHp;
            }

            events.push(...host.advance(STEP_MS));
        }

        return events;
    }

    // Stood before a way and told to go through: what the host says; and, if it will, played on
    // till they have
    function cross(id, link) {
        const me = actor(id);

        put(me, link.ends.find(({ map }) => map === me.map).arrive);

        const told = host.command(id, { type: "enter", link: link.id });

        if (!told.ok) {
            return told;
        }

        for (let t = 0; t < 60000; t += 250) {
            if (run(250).some((event) => event.type === "cross" && event.id === id)) {
                return told;
            }
        }

        return { ok: false, reason: "never crossed" };
    }

    const out = (id) => {
        assert.ok(cross(id, runOf(id).door).ok);
        put(actor(id), [far[0] + IDS.indexOf(id), far[1]]);
    };

    before(() => {
        world = buildWorld({ seed: 1 });
        host = new Host(world, { populate: false, rules: { instances: "party" } });

        for (const id of IDS) {
            host.join({ id, hero: { ...HERO, name: id } });
            Object.assign(actor(id), { hp: 1e6, maxHp: 1e6 });
        }

        const [sx, sy] = world.start.at;

        // (The two nearest: one for the cap, the other for a run they've not been in)
        sites = world.plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme !== "hell").sort((a, b) => hypot(a.at[0] - sx, a.at[1] - sy) - hypot(b.at[0] - sx, b.at[1] - sy)).slice(0, 2);

        for (const site of sites) {
            world.maps.town.sites.heartOf(site);
        }

        far = [...actor(HOST_PLAYER).square];
    });

    it("lets no more than RUNS.most runs stand in a world: one more coming near begins none, and is told so at the door; with one of them empty, it's let go for theirs", () => {
        const [site] = sites;

        for (const id of IDS.slice(0, RUNS.most)) {
            assert.ok(cross(id, front(site).door).ok, `${id} in`);
        }

        assert.equal(host.runs.size, RUNS.most);
        put(actor("eve"), front(site).door.ends[0].arrive);
        run(500);
        assert.equal(host.runFor("eve", site.id), null, "none begun for one coming near");
        assert.deepEqual(cross("eve", front(site).door), { ok: false, reason: "runsFull" });
        assert.equal(actor("eve").map, "town");

        // (One of them out and away: its run empty, and the one to spare)
        const spare = runOf("dov").site;

        out("dov");
        run(500);
        assert.equal(typeof host.runs.get(spare).emptySince, "number");
        put(actor("eve"), front(site).door.ends[0].arrive);
        assert.ok(host.command("eve", { type: "enter", link: front(site).door.id }).ok);
        assert.equal(host.runs.has(spare), false, "let go as she's let in");

        const events = run(3000);

        assert.ok(events.some((event) => event.type === "cross" && event.id === "eve"));
        assert.equal(host.runs.size, RUNS.most);
        assert.deepEqual(host.runs.get(runOf("eve").site).been, ["eve"]);
    });

    it("counts each run a player goes into for the first time, RUNS.hourly an hour: then none new till the hour's by, though one they've been in is theirs still", () => {
        const [site, other] = sites;
        const mine = runOf(HOST_PLAYER).site;

        assert.equal(host.runsBegun.get(HOST_PLAYER).length, 1);
        out(HOST_PLAYER);
        run(500);
        assert.ok(cross(HOST_PLAYER, front(site).door).ok);
        assert.equal(runOf(HOST_PLAYER).site, mine);
        assert.equal(host.runsBegun.get(HOST_PLAYER).length, 1, "back into the same one: not counted again");
        out(HOST_PLAYER);

        // (Ten begun this hour, as if they had been)
        host.runsBegun.set(HOST_PLAYER, new Array(RUNS.hourly).fill(host.battle.time));
        // (Room in the world for one: two of the others out and away, their runs let go in time)
        out("bea");
        out("cal");
        run(500);

        for (const each of [...host.runs.values()].filter(({ emptySince, id }) => emptySince !== null && id !== mine)) {
            each.emptySince = host.battle.time - RUNS.linger;
        }

        run(1500);
        assert.ok(host.runs.size < RUNS.most);
        assert.deepEqual(cross(HOST_PLAYER, front(other).door), { ok: false, reason: "runsSpent" });
        assert.equal(host.runFor(HOST_PLAYER, other.id), null);
        assert.ok(cross(HOST_PLAYER, front(site).door).ok, "the one they've been in");
        out(HOST_PLAYER);

        // (The hour gone by: a clock stepped)
        host.runsBegun.set(HOST_PLAYER, new Array(RUNS.hourly).fill(host.battle.time - RUNS.hour));
        assert.ok(cross(HOST_PLAYER, front(other).door).ok);
        assert.equal(runOf(HOST_PLAYER).base, other.id);
        assert.equal(host.runsBegun.get(HOST_PLAYER).length, 1, "those of an hour ago forgotten");
        out(HOST_PLAYER);
    });

    it("gives a dungeon's hoard in full once a world day at each dungeon, and its gold alone again that day; kept in a snapshot", () => {
        const [site, other] = sites;
        // A hoard, unlocked, set before a player in the run they're in: opened, their share of it
        const opened = (id) => {
            const me = actor(id);
            const chest = `test-hoard-${host.nextGround++}`;

            host.ground.set(chest, { id: chest, chest: true, locked: false, dungeon: runOf(id).site, coffer: chest, hoard: true, map: me.map, square: [me.square[0], me.square[1] - 1], until: null });
            assert.ok(host.command(id, { type: "pickUp", ground: chest }).ok);

            const share = run(500).find((event) => event.type === "spoils" && event.from === chest && event.id === id);

            return { share, bundle: host.ground.get(share.ground).bundle };
        };

        assert.ok(cross("bea", front(site).door).ok);

        const first = opened("bea");

        assert.ok(!first.share.lesser && first.bundle.items.length >= HOARD.gear[0] + HOARD.potions[0] && first.bundle.gold >= HOARD.gold[0]);

        const again = opened("bea");

        assert.equal(again.share.lesser, true);
        assert.deepEqual(again.bundle.items, []);
        assert.ok(again.bundle.gold >= HOARD.gold[0]);
        assert.deepEqual(Object.keys(host.hoarded.get("bea")), [site.id], "by the dungeon, not the run");

        // (Kept: the same from a world taken up again)
        const kept = Host.restore(buildWorld({ seed: 1 }), decode(encode(host.snapshot())));

        assert.deepEqual([...kept.hoarded], [...host.hoarded]);
        assert.deepEqual([...kept.runsBegun], [...host.runsBegun]);

        // (Another dungeon's, the same day: in full)
        out("bea");
        run(500);
        assert.ok(cross("bea", front(other).door).ok);
        assert.ok(!opened("bea").share.lesser);

        // (And the first again another day: in full, the day before forgotten)
        host.hoarded.set("bea", Object.fromEntries(Object.entries(host.hoarded.get("bea")).map(([key, day]) => [key, day - 1])));
        assert.ok(!opened("bea").share.lesser);
        assert.deepEqual(Object.keys(host.hoarded.get("bea")), [other.id]);
    });

    it("has neither where a dungeon's one run is everyone's", () => {
        const plain = new Host(buildWorld({ seed: 1 }), { populate: false });

        plain.join({ id: HOST_PLAYER, hero: HERO });
        Object.assign(plain.battle.actor(HOST_PLAYER), { hp: 1e6, maxHp: 1e6 });
        plain.runsBegun.set(HOST_PLAYER, new Array(RUNS.hourly).fill(0));

        const [site] = sites;

        plain.world.maps.town.sites.heartOf(plain.world.plan.sites.find(({ id }) => id === site.id));

        const door = plain.world.interiors.buildings.get(`site:${site.id}`).door;

        put(plain.battle.actor(HOST_PLAYER), door.ends[0].arrive);
        assert.ok(plain.command(HOST_PLAYER, { type: "enter", link: door.id }).ok);
        assert.ok(!("runsBegun" in new Host(buildWorld({ seed: 1 }), { populate: false }).snapshot()));
    });
});
