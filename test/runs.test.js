// A dungeon's run for each party (the scaling plan's 2-21; core/host.js RULES `instances`
// "party", RUNS; core/insides.js addRun): whoever goes in by a dungeon's one front door is sent
// through to their own party's run of it, with its own levels, foes and slain; a party's is its
// leader's; one who leaves their party inside stays till they walk out; one who left the world
// is let back into theirs; no one's called into another's; and a run no one's in or near goes.
// The rule's other way isn't built yet (RULE_CHOICES `built`): these give a host it as it will be.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { DELVES } from "../client/js/core/dungeons/play.js";
import { hypot } from "../client/js/core/exact.js";
import { delveKey, HOST_PLAYER, Host, RULE_CHOICES, ruled, RUNS, runBase, runSite } from "../client/js/core/host.js";
import { DUNGEON_ORIGINS, dungeonLevel, KEEP_ORIGINS } from "../client/js/core/insides.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { keepSiteOf } from "../client/js/core/scenery.js";

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const PARTY_RULE = ruled({ instances: "party" }, { ...RULE_CHOICES, instances: { ...RULE_CHOICES.instances, built: true } });

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

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
