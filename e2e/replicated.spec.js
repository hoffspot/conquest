import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorldServer } from "../server/world-server.js";
import { expect, playing, test } from "./fixtures.js";

// A replicated world from the game, in a real browser against a real world server (the scaling
// plan's 3-31, its gate (a)): six things a player does in a world no game holds a copy of, each a
// test of its own. Joining and walking, over a play socket routed so every word takes 150 ms each
// way (a 300 ms round trip); fighting a foe and taking what it had; going in at a dungeon's way in
// onto a floor made in the game itself; a party, each on the other's maps in sight and out of it;
// the page hidden and shown; and the game reloaded, straight back in. One more, older and longer
// (two players moving, fighting, trading, at a door, in a party, and the server's replication
// turned off under them), is in e2e/worlds.spec.js.

// (A world drawn without a GPU, two at once in some: more than the usual time; one after another)
test.setTimeout(420000);
test.describe.configure({ mode: "default" });

// Short codes hashed cheaply (the server's own cost is for a Mac, not a test)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const save = (name) => ({
    version: 1,
    seed: 777,
    created: "2026-10-13T12:00:00.000Z",
    hero: {
        name,
        weapon: "sword",
        race: "human",
        parts: [],
        shape: { macro: { gender: 0.5, muscle: 0.5, weight: 0.4, height: 0.5, bust: 0.4, african: 0.2, asian: 0.2, caucasian: 0.6 }, details: {} },
        look: { skin: { tone: "#d9b394" }, eyes: { iris: "#5a7a3a" }, hair: { style: "short", beard: "none", colour: "#3a2a1a" } },
    },
});

// (Given longer than a world on the device to be playing; and not waited on to be drawn)
const LONGER = { timeout: 180000, drawn: false };

let server;
let folder;
let base;

test.beforeAll(async () => {
    folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-e2e-replicated-"));
    server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), interfaces: { lo: [{ address: "127.0.0.1", family: "IPv4", internal: false }] } });
    // (A world no one's in is set aside at once: each test's is its own)
    await server.settings.change({ setAsideMinutes: 0, replication: "on" });
    await server.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${server.port}`;
});

test.afterAll(async () => {
    await server?.close();
    await rm(folder, { recursive: true, force: true });
});

// A replicated world of the server's, open to anyone
const world = (name, seed = 47) => server.createWorld({ name, seed, race: "human", heroes: "brought", settings: { open: true, netcode: "replicated", experimental: true } });

// A page with a character kept, drawn cheaply, its errors thrown; `delay`, every word on its play
// socket held that long (ms) each way; `progress`, what they bring (skills, gold, a pack)
async function player(browser, name, { delay = 0, progress = null } = {}) {
    const page = await (await browser.newContext()).newPage();

    await page.addInitScript(
        ({ settings, character, kept }) => {
            localStorage.setItem("pellagos.settings", JSON.stringify(settings));

            if (!localStorage.getItem("pellagos.characters")) {
                localStorage.setItem("pellagos.save", JSON.stringify(character));

                // (What they've got and learnt, brought with them)
                if (kept) {
                    localStorage.setItem("pellagos.progress", JSON.stringify({ created: character.created, seed: character.seed, ...kept }));
                }
            }
        },
        { settings: { quality: "low", renderScale: 0.5, shadows: false }, character: save(name), kept: progress },
    );
    page.on("pageerror", (error) => {
        throw error;
    });

    if (delay) {
        // (In the order they came: each held the same while)
        await page.routeWebSocket(/\/play/, (socket) => {
            const upstream = socket.connectToServer();

            socket.onMessage((message) => setTimeout(() => upstream.send(message), delay));
            upstream.onMessage((message) => setTimeout(() => socket.send(message), delay));
        });
    }

    return page;
}

// Into a world from the title, as the character kept
async function comeIn(page, made, worldName, name) {
    await page.goto(`${base}/`);

    const row = page.locator(`#titleserver li[data-world="${made.world}"]`);

    await expect(row).toContainText(worldName, { timeout: 30000 });
    await row.getByRole("button").click();
    await page.locator("#worldask").getByRole("button", { name: new RegExp(`^${name}`) }).click({ timeout: 60000 });
    await playing(page, null, LONGER);
}

// What a game has of the world: its link, what it was sent, who it knows of, its hero
const has = (page) => page.evaluate(() => {
    const { game, together } = window.pellagos;
    const link = together.joining;
    const me = game.host.battle.actor(game.me);

    return {
        me: game.me,
        mirror: Boolean(link.mirror),
        copy: (link.received.ops ?? 0) + (link.received.state ?? 0),
        frames: link.frames,
        faults: link.mirror?.faults.length ?? -1,
        known: game.host.battle.actors.length,
        at: [me.x, me.y],
        map: me.map,
        dead: me.dead,
        hp: me.hp,
        gold: game.progress.gold,
        time: game.host.battle.time,
        resyncs: link.resyncs,
        rtt: link.rtt,
    };
});

// Someone in a game: where its world has them and where they're drawn; null if it knows of no such one
const where = (page, id) => page.evaluate((who) => {
    const { game } = window.pellagos;
    const actor = game.host.battle.actor(who);
    const avatar = game.avatars.get(who);
    const [ox, oz] = actor ? game.originOf(actor.map) : [0, 0];

    return actor ? { x: actor.x, y: actor.y, map: actor.map, dead: actor.dead, drawn: avatar ? [avatar.object.position.x - ox, avatar.object.position.z - oz] : null, shown: Boolean(avatar?.object.visible) } : null;
}, id);

// A command of the player's, and what the world said came of it (with how long that took, ms)
const command = (page, sent) => page.evaluate((what) => new Promise((resolve) => {
    const asked = performance.now();

    window.pellagos.game.remote.command(what, (result) => resolve({ ...(result ?? {}), took: performance.now() - asked }));
}), sent);

// (A game sent views and holding no copy, told nothing that couldn't be so)
const sound = (one) => {
    expect(one.mirror).toBe(true);
    expect(one.copy).toBe(0);
    expect(one.faults).toBe(0);
};

test("joining and walking in a replicated world over a link that takes 300 ms there and back: no copy of the world sent, the hero walks where they're sent and is drawn where the world has them, looked ahead meanwhile", async ({ ownBrowser: browser }) => {
    const page = await player(browser, "Wren", { delay: 150 });
    const made = await world("Slowmere");

    await comeIn(page, made, "Slowmere", "Wren");

    const first = await has(page);

    sound(first);
    expect(first.known).toBeGreaterThanOrEqual(3);
    expect(first.known).toBeLessThan(400);
    // (The link's as slow as it was made: the game's own measure of a word there and back)
    await expect.poll(async () => (await has(page)).rtt, { timeout: 30000 }).toBeGreaterThanOrEqual(280);

    const walked = await command(page, { type: "move", to: [Math.floor(first.at[0]) + 8, Math.floor(first.at[1]) + 4], run: true });

    expect(walked.ok).toBe(true);
    expect(walked.took).toBeGreaterThanOrEqual(280);
    await expect.poll(async () => Math.hypot((await has(page)).at[0] - first.at[0], (await has(page)).at[1] - first.at[1]), { timeout: 60000 }).toBeGreaterThan(7);

    // (Come to rest: drawn where the world has them)
    await expect.poll(async () => {
        const seen = await where(page, first.me);

        return seen.drawn ? Math.hypot(seen.drawn[0] - seen.x, seen.drawn[1] - seen.y) : 99;
    }, { timeout: 30000 }).toBeLessThan(1.5);

    // (Looked ahead from the frames' word of them as it came, the world's time reckoned from
    // each: the scaling plan's 3-22; a few steps kept in hand, as many as cover the link)
    const ahead = await page.evaluate(() => {
        const { game, together } = window.pellagos;

        return { looks: game.forecast.corrections.looks, timed: game.forecast.corrections.timed, viewed: game.viewed, self: together.joining.self !== null, arrivals: together.joining.arrivals.frames, behind: together.joining.farBehind };
    });

    expect(ahead).toMatchObject({ viewed: true, self: true, behind: false });
    expect(ahead.looks).toBeGreaterThanOrEqual(5);
    expect(ahead.timed).toBeGreaterThanOrEqual(100);
    expect(ahead.arrivals).toBeGreaterThanOrEqual(100);

    const last = await has(page);

    sound(last);
    // (Frames played the walk through, and the world's time gone on with them: a run of 9 m is
    // some 30 of the world's steps, and a page that draws slowly lets some go by)
    expect(last.frames).toBeGreaterThan(first.frames + 10);
    expect(last.time).toBeGreaterThan(first.time + 1000);
    await page.context().close();
});

test("fighting and loot in a replicated world: the orc by the town falls in the player's game as in the world, the gold on it theirs only if the kill was; a thing dropped lies on the ground in their game and is taken up again", async ({ ownBrowser: browser }) => {
    const page = await player(browser, "Hale", { progress: { skills: { blade: 300 }, gold: 99, pack: [{ id: "potion", count: 2 }] } });
    const made = await world("Orcmere");

    await comeIn(page, made, "Orcmere", "Hale");

    const first = await has(page);
    const potions = () => page.evaluate(() => window.pellagos.game.progress.pack.filter((stack) => stack?.id === "potion").reduce((sum, { count }) => sum + (count ?? 1), 0));

    sound(first);
    // (What they brought is theirs in the world, as its own record of them says)
    expect([first.gold, await potions()]).toEqual([99, 2]);
    // (What the world says of the orc's fall and of anything found on it, as the game hears it)
    await page.evaluate(() => {
        const { game, together } = window.pellagos;
        const link = together.joining;
        const step = link.step.bind(link);

        window.fell = { by: null, loot: null, blows: 0 };
        link.step = () => {
            const events = step();

            for (const event of events ?? []) {
                if (event.type === "death" && event.id === "orc") {
                    window.fell.by = event.by ?? "";
                } else if (event.type === "loot" && event.id === game.me) {
                    window.fell.loot = { from: event.from, gold: event.gold };
                } else if (event.type === "hit" || event.type === "attack") {
                    window.fell.blows++;
                }
            }

            return events;
        };
    });

    expect((await command(page, { type: "engage", target: "orc", lock: true })).ok).toBe(true);
    await expect.poll(async () => (await where(page, "orc"))?.dead ?? false, { timeout: 200000, intervals: [3000] }).toBe(true);
    await expect.poll(() => page.evaluate(() => window.fell.by), { timeout: 30000 }).not.toBeNull();
    await command(page, { type: "unlock" });
    await command(page, { type: "stop" });
    await page.waitForTimeout(2000);

    const fell = await page.evaluate(() => window.fell);

    // (Blows told as bytes and heard as blows: the plan's 3-28. The town's guards go for the orc
    // too, and what's on it is whoever felled it's: theirs, the world said what they found and
    // their gold's that much more; a guard's, it said nothing and their gold's as it was)
    expect(fell.blows).toBeGreaterThanOrEqual(1);

    if (fell.by === first.me) {
        expect(fell.loot).toMatchObject({ from: "orc" });
        expect(fell.loot.gold).toBeGreaterThanOrEqual(5);
        await expect.poll(async () => (await has(page)).gold, { timeout: 30000 }).toBe(99 + fell.loot.gold);
    } else {
        expect(fell.loot).toBeNull();
        expect((await has(page)).gold).toBe(99);
    }

    expect((await has(page)).dead).toBe(false);

    // Loot off the ground: a potion put down lies where they stand, in their game's word of
    // what's on the ground near them (the summary's props: the plan's 3-25), and one fewer in
    // their pack; taken up, it's gone from the ground and theirs again
    const index = await page.evaluate(() => window.pellagos.game.progress.pack.findIndex((stack) => stack?.id === "potion"));
    const dropped = await command(page, { type: "drop", index, count: 1 });
    const lying = (id) => page.evaluate((ground) => {
        const { game } = window.pellagos;
        const thing = game.worldview.ground.get(ground);
        const me = game.host.battle.actor(game.me);

        return thing ? { item: thing.item?.id ?? null, map: thing.map, near: Math.hypot(thing.square[0] - me.x, thing.square[1] - me.y) < 3 } : null;
    }, id);

    expect(dropped.ok).toBe(true);
    await expect.poll(() => lying(dropped.ground), { timeout: 30000 }).toEqual({ item: "potion", map: "town", near: true });
    await expect.poll(potions, { timeout: 30000 }).toBe(1);
    expect((await command(page, { type: "pickUp", ground: dropped.ground })).ok).toBe(true);
    await expect.poll(() => lying(dropped.ground), { timeout: 30000 }).toBeNull();
    await expect.poll(potions, { timeout: 30000 }).toBe(2);
    sound(await has(page));
    await page.context().close();
});

test("a dungeon's way in and its first floor in a replicated world: the floors made in the player's own game as the world has them, those on the floor in sight, the land's left behind, and out again", async ({ ownBrowser: browser }) => {
    const page = await player(browser, "Dara");
    // (A land with a dungeon 258 m from where its people begin)
    const made = await world("Deepmere", 314);

    await comeIn(page, made, "Deepmere", "Dara");
    sound(await has(page));

    // The way there, a leg at a time; and its way in, once the game's made it ready and built it
    const site = "dungeon-29";
    const near = () => page.evaluate((id) => {
        const { game } = window.pellagos;
        const me = game.host.battle.actor(game.me);
        const place = game.host.world.plan.sites.find((one) => one.id === id);
        const building = game.host.world.interiors.buildings.get(`site:${id}`);

        return { at: [me.x, me.y], map: me.map, to: place.at, far: Math.hypot(place.at[0] - me.x, place.at[1] - me.y), ready: game.host.open.has(`site:${id}`), door: building?.door?.id ?? null, built: Boolean(building?.maps?.[0] && game.interiors.has(building.maps[0])), floors: building?.maps ?? [], tier: game.host.delveOf(id)?.tier ?? null };
    }, site);

    await expect.poll(async () => {
        const now = await near();

        if (now.map !== "town") {
            return "in";
        }

        // (In once the game's built its first floor, as its readying card waits for: app/readying.js)
        if (now.ready && now.door && now.built && now.far < 60) {
            await command(page, { type: "enter", link: now.door, run: true });
        } else if (now.far > 12) {
            const share = Math.min(1, 100 / now.far);

            await command(page, { type: "move", to: [Math.round(now.at[0] + (now.to[0] - now.at[0]) * share), Math.round(now.at[1] + (now.to[1] - now.at[1]) * share)], run: true });
        }

        return now.map;
    }, { timeout: 240000, intervals: [2000] }).toBe("in");

    const there = await near();

    // (Told how strong it's made, and its floors made here, from the world's seed and that)
    expect(Number.isFinite(there.tier)).toBe(true);
    expect(there.floors.length).toBeGreaterThanOrEqual(1);
    expect(there.map).toBe(there.floors[0]);

    const inside = () => page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.host.battle.actor(game.me);
        const on = game.host.battle.actors.filter(({ map, id }) => map === me.map && id !== game.me);

        return { map: me.map, shown: game.mapId, town: game.town.object.visible, others: game.host.battle.actors.filter(({ map }) => map !== me.map).length, on: on.length, drawn: on.filter(({ id }) => game.avatars.get(id)).length, plan: Boolean(game.host.world.maps[me.map]) };
    });

    await expect.poll(inside, { timeout: 120000, intervals: [1000] }).toMatchObject({ map: there.floors[0], shown: there.floors[0], town: false, others: 0, plan: true });
    // (Its foes in sight, each with a body)
    await expect.poll(async () => (await inside()).on, { timeout: 60000, intervals: [1000] }).toBeGreaterThanOrEqual(1);
    await expect.poll(async () => (({ on, drawn }) => on - drawn)(await inside()), { timeout: 60000, intervals: [1000] }).toBe(0);

    const down = await has(page);

    sound(down);
    expect(down.dead).toBe(false);

    // (And out by the way they came: the land again, no one of the floor's left in the game)
    const out = await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.host.battle.actor(game.me);

        return game.host.world.maps[me.map].links?.find(({ to }) => to === "town")?.id ?? game.host.world.interiors.of(me.map)?.door?.id ?? null;
    });

    expect(out).not.toBeNull();
    expect((await command(page, { type: "enter", link: out, run: true })).ok).toBe(true);
    await expect.poll(inside, { timeout: 120000, intervals: [1000] }).toMatchObject({ map: "town", shown: "town", town: true, others: 0 });
    sound(await has(page));
    await page.context().close();
});

test("a party in a replicated world: asked and taken up, each on the other's maps; one gone indoors is still on the other's, where the world last said, and out of their sight", async ({ ownBrowser: browser }) => {
    const [una, bram] = [await player(browser, "Una"), await player(browser, "Bram")];
    const made = await world("Fellowmere");

    await comeIn(una, made, "Fellowmere", "Una");
    await comeIn(bram, made, "Fellowmere", "Bram");

    const [unaHas, bramHas] = [await has(una), await has(bram)];
    const partied = (page) => page.evaluate(() => {
        const { game } = window.pellagos;

        return { members: game.worldview.partyFor(game.me)?.members.length ?? 0, asked: Boolean(game.worldview.invitation(game.me)), onMaps: game.partyView().map(({ name, map, inside, x, z }) => ({ name, map, inside, placed: Number.isFinite(x) && Number.isFinite(z) })), roster: [...game.worldview.players.values()].map(({ hero }) => hero.name).sort() };
    });

    expect((await partied(una)).onMaps).toEqual([]);
    expect((await command(una, { type: "party", do: "invite", who: bramHas.me })).ok).toBe(true);
    await expect.poll(async () => (await partied(bram)).asked, { timeout: 30000 }).toBe(true);
    expect((await command(bram, { type: "party", do: "accept" })).ok).toBe(true);
    await expect.poll(() => partied(una), { timeout: 30000 }).toMatchObject({ members: 2, onMaps: [{ name: "Bram", map: "town", inside: null, placed: true }], roster: ["Bram", "Una"] });
    await expect.poll(() => partied(bram), { timeout: 30000 }).toMatchObject({ members: 2, asked: false, onMaps: [{ name: "Una", map: "town", inside: null, placed: true }], roster: ["Bram", "Una"] });

    // Bram goes into the tavern: gone from Una's sight, and still on her maps, said to be inside
    expect((await command(bram, { type: "enter", link: "tavern-door", run: true })).ok).toBe(true);
    await expect.poll(async () => (await has(bram)).map, { timeout: 120000, intervals: [1000] }).toBe("taproom");
    await expect.poll(() => where(una, bramHas.me), { timeout: 30000 }).toBeNull();
    await expect.poll(async () => (await partied(una)).onMaps, { timeout: 30000 }).toMatchObject([{ name: "Bram", map: "taproom", placed: true }]);
    expect((await partied(una)).onMaps[0].inside).toMatch(/^in /);
    // (And Una on his, out in the town)
    expect((await partied(bram)).onMaps).toMatchObject([{ name: "Una", map: "town", placed: true }]);

    // (Out again: in her sight, with a body, where the world has him)
    expect((await command(bram, { type: "enter", link: "tavern-door", run: true })).ok).toBe(true);
    await expect.poll(async () => (await has(bram)).map, { timeout: 60000, intervals: [1000] }).toBe("town");
    await expect.poll(async () => (await where(una, bramHas.me))?.map ?? null, { timeout: 30000 }).toBe("town");
    await expect.poll(async () => (await partied(una)).onMaps, { timeout: 30000 }).toMatchObject([{ name: "Bram", map: "town", inside: null }]);

    for (const page of [una, bram]) {
        sound(await has(page));
    }

    expect(unaHas.me).not.toBe(bramHas.me);
    await una.context().close();
    await bram.context().close();
});

test("a page hidden and shown in a replicated world: while it's hidden another player walks off; shown, its view's asked for again and told from nothing, the other where the world has them, and no world sent", async ({ ownBrowser: browser }) => {
    const [una, bram] = [await player(browser, "Una"), await player(browser, "Bram")];
    const made = await world("Hidemere");

    await comeIn(una, made, "Hidemere", "Una");
    await comeIn(bram, made, "Hidemere", "Bram");

    const [unaHas, bramHas] = [await has(una), await has(bram)];

    await expect.poll(() => where(una, bramHas.me), { timeout: 30000 }).not.toBeNull();

    const hide = (hidden) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
        document.dispatchEvent(new Event("visibilitychange"));
    };

    // Hidden, as a phone's page is with another app in front: Bram walks off meanwhile
    await una.evaluate(hide, true);
    expect((await command(bram, { type: "move", to: [Math.floor(bramHas.at[0]) + 9, Math.floor(bramHas.at[1]) - 5], run: true })).ok).toBe(true);
    await expect.poll(async () => Math.hypot((await has(bram)).at[0] - bramHas.at[0], (await has(bram)).at[1] - bramHas.at[1]), { timeout: 60000 }).toBeGreaterThan(8);
    await una.waitForTimeout(3000);

    const stood = await has(bram);

    // Shown: asked again, once; the world's time going on; Bram where his own game has him
    await una.evaluate(hide, false);
    await expect.poll(async () => (await has(una)).resyncs, { timeout: 30000 }).toBe(unaHas.resyncs + 1);
    await expect.poll(async () => (await has(una)).time, { timeout: 30000 }).toBeGreaterThan(unaHas.time + 5000);
    await expect.poll(async () => {
        const seen = await where(una, bramHas.me);

        return seen ? Math.hypot(seen.x - stood.at[0], seen.y - stood.at[1]) : 99;
    }, { timeout: 30000 }).toBeLessThan(1.5);
    await expect.poll(async () => {
        const seen = await where(una, bramHas.me);

        return seen?.drawn ? Math.hypot(seen.drawn[0] - seen.x, seen.drawn[1] - seen.y) : 99;
    }, { timeout: 30000 }).toBeLessThan(1.5);
    expect(await una.evaluate(() => window.pellagos.together.joining.farBehind)).toBe(false);
    await expect.poll(async () => (await has(una)).known, { timeout: 30000 }).toBeGreaterThanOrEqual(3);

    // (Her own hero hers to send still, and nothing told that couldn't be so)
    expect((await command(una, { type: "move", to: [Math.floor(unaHas.at[0]) - 4, Math.floor(unaHas.at[1]) + 2], run: true })).ok).toBe(true);
    await expect.poll(async () => Math.hypot((await has(una)).at[0] - unaHas.at[0], (await has(una)).at[1] - unaHas.at[1]), { timeout: 60000 }).toBeGreaterThan(3);

    for (const page of [una, bram]) {
        sound(await has(page));
    }

    await una.context().close();
    await bram.context().close();
});

test("a game reloaded in a replicated world: straight back in as the same character where they stood, sent views again and no copy, the world counting them once", async ({ ownBrowser: browser }) => {
    const page = await player(browser, "Tamsin");
    const made = await world("Backmere");
    const rejoin = page.locator("#rejoin");

    await comeIn(page, made, "Backmere", "Tamsin");

    const first = await has(page);

    sound(first);
    // (Somewhere of their own to be found again)
    expect((await command(page, { type: "move", to: [Math.floor(first.at[0]) + 7, Math.floor(first.at[1]) + 5], run: true })).ok).toBe(true);
    await expect.poll(async () => Math.hypot((await has(page)).at[0] - first.at[0], (await has(page)).at[1] - first.at[1]), { timeout: 60000 }).toBeGreaterThan(7);
    await page.waitForTimeout(3000);

    const stood = await has(page);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.inworld")));

    expect(kept).toMatchObject({ kind: "server", world: made.world, worldName: "Backmere", name: "Tamsin" });

    await page.reload();
    await expect(rejoin).toBeVisible({ timeout: 60000 });
    await expect(rejoin.locator("#rejointitle")).toHaveText("Back into Backmere");
    await playing(page, null, LONGER);
    await expect(rejoin).toBeHidden();
    expect(await page.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Tamsin");

    const back = await has(page);

    sound(back);
    expect(back.me).toBe(stood.me);
    expect(Math.hypot(back.at[0] - stood.at[0], back.at[1] - stood.at[1])).toBeLessThan(1.5);
    expect(back.gold).toBe(stood.gold);
    expect(server.access.world(made.world).players()).toHaveLength(1);

    // (And theirs to play on)
    expect((await command(page, { type: "move", to: [Math.floor(back.at[0]) - 5, Math.floor(back.at[1])], run: true })).ok).toBe(true);
    await expect.poll(async () => Math.abs((await has(page)).at[0] - back.at[0]), { timeout: 60000 }).toBeGreaterThan(3);
    await page.context().close();
});
