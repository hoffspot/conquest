import { STEP_MS } from "../client/js/core/battle.js";
import { PARTY_COLOURS } from "../client/js/app/mapicons.js";
import { SIZE } from "../client/js/core/invasions.js";
import { MOTION } from "../client/js/core/motion.js";
import { expect, test } from "./fixtures.js";

// Playing together (docs/WAR.md M11), in two browsers at once: one player opens their world to
// others from the menu, and is given a code; another, an elf, joins it by the code from the title,
// and comes into the world by their own people's town, as the host has it; what the one who's
// joined does is done in the host's world; told when the host's paused; their link dropped, back on
// a new one; they leave, and are gone from it; the host closes the world to others, and anyone
// still in it is told. Two players walking about a while: the joined copy compared with the host's
// every fifth of a second and never astray, and what's sent measured.

// (Two worlds drawn at once, without a GPU: more than the usual time; and these tests one after
// the other, never side by side: four worlds drawn at once slow each to a crawl)
test.setTimeout(300000);
test.describe.configure({ mode: "default" });

const ELF = {
    version: 1,
    seed: 777,
    created: "2026-09-02T12:00:00.000Z",
    hero: {
        name: "Syl",
        weapon: "bow",
        race: "elf",
        parts: [],
        shape: { macro: { gender: 0.1, muscle: 0.4, weight: 0.3, height: 0.7, bust: 0.4, african: 0.05, asian: 0.15, caucasian: 0.8 }, details: { earLength: 0.9, earPoint: 0.9 } },
        look: { skin: { tone: "#ecd0b6" }, eyes: { iris: "#3fa6e8" }, hair: { style: "long", beard: "none", colour: "#e8dcb0" } },
    },
};

// Two worlds drawn at once in software are slow enough to starve the pages of frames, so each is
// drawn cheaply: at low quality, half the pixels, no shadows (what's tested isn't how they look)
async function cheaply(...pages) {
    for (const page of pages) {
        await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ quality: "low", renderScale: 0.5, shadows: false })));
    }
}

// Wait for a page's game to be playing (checking on a timer)
async function playing(page) {
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
}

// How often a joined game's been sent the world again for anything but falling too far behind the
// host to catch up (core/netplay.js PACE.tooFar: as after a long load): its copy gone astray, or
// its link dropped
async function sentAgain(page) {
    return await page.evaluate(() => window.pellagos.game.remote.resyncs - window.pellagos.game.remote.skips);
}

test("a world opened to others: an elf joins it by its code, is brought in by the elves' town, walks in the host's world, and leaves; closed, whoever's in it is told", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), ELF);

    // The host plays, and opens their world from the menu: a code, and a link to join by. (Alone
    // in it, at home: the lantern in the minimap's corner)
    await host.goto("/?play&seed=2");
    await playing(host);
    await expect(host.locator("#worldlink")).toHaveAttribute("data-link", "home");
    await expect(host.locator("#worldlink")).toHaveAttribute("aria-label", "Your own world, here on this device.");
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();

    await expect(invite.locator("#invitelink")).toHaveText(new RegExp(`\\?join=${code}$`));
    await invite.getByRole("button", { name: "Back to the game" }).click();
    await expect(invite).toBeHidden();

    // The elf joins by the link: the title, the code in, their character named
    await guest.goto(`/?join=${code}`);

    const join = guest.locator("#join");

    await expect(join).toBeVisible({ timeout: 60000 });
    await expect(join.locator("#joincode")).toHaveValue(code);
    await expect(join.locator("#joinwho")).toContainText("You'll come as Syl (elf)");

    // (The link taken out of the page's address once it's read: loaded again, not asked again)
    expect(new URL(guest.url()).search).toBe("");

    await join.getByRole("button", { name: "Join" }).click();
    await playing(guest);

    // In the guest's copy: themselves, of the elves, by the elves' town; and the host's player
    const joined = await guest.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        return { me: game.me, team: me.team, players: [...game.host.players.keys()].sort(), drawn: game.avatars.has("player") && game.avatars.has(game.me), start: game.world.start.race };
    });

    expect(joined).toEqual({ me: "guest-1", team: "elf", players: ["guest-1", "player"], drawn: true, start: "human" });

    // The host's told, and has them in the world, where the guest's copy has them
    await expect(host.locator("#banner")).toContainText("Syl has come into the world, of the Elves.", { timeout: 30000 });

    const there = await host.evaluate(() => {
        const { game } = window.pellagos;
        const guestActor = game.battle.actor("guest-1");

        return { square: guestActor.square, realm: game.host.players.get("guest-1").realm, others: game.others() };
    });

    expect(there.realm).toBe("elf");
    expect(there.others.map(({ name, people }) => `${name}, the ${people}`)).toEqual(["Syl, the Elves"]);

    // Away, both: the orb, glowing as well as the link holds, said for what it is. (Here, two pages
    // drawing the world in software, each holding up the other's words a frame or more: however
    // long that is.) Its first round trip, held up as the guest's page built the world, forgotten
    const orb = (page) => page.locator("#worldlink");
    const said = { strong: "good", fair: "fair", "weak: expect delays": "poor" };

    await expect(orb(guest)).toHaveAttribute("data-link", "away");
    await expect(orb(guest)).toHaveAttribute("aria-label", /^In .+'s world, linked (directly|through the server)\. A word there and back: \d+ ms\. The link's (strong|fair|weak: expect delays)\.$/, { timeout: 15000 });
    await expect(orb(host)).toHaveAttribute("data-link", "away");
    await expect(orb(host)).toHaveAttribute("aria-label", /^Your world, open to friends: 1 friend in it\. The slowest link: a word there and back in \d+ ms\. The link's (strong|fair|weak: expect delays)\.$/, { timeout: 15000 });

    // (Both read at once: the orb's drawn again as the link's timed, between two reads)
    for (const page of [guest, host]) {
        const [words, quality] = await orb(page).evaluate((element) => [element.getAttribute("aria-label"), element.dataset.quality]);

        expect(quality).toBe(said[words.match(/The link's (.+)\.$/)[1]]);
    }

    expect(await guest.evaluate(() => window.pellagos.game.remote.lately)).toBeLessThan(5000);

    // As good as can be (the guest's round trips 80 ms, and so its host's, no more timed meanwhile):
    // green, said so; tapped, said across the screen. The link dropped: red, flickering, and back
    await guest.evaluate(() => {
        const { remote } = window.pellagos.game;

        remote.ping = () => {};
        remote.trips = [80];
    });
    await host.evaluate(() => {
        const { hosting } = window.pellagos.game;

        for (const peer of hosting.players.keys()) {
            hosting.rtts.set(peer, 80);
        }
    });
    await expect(orb(guest)).toHaveAttribute("data-quality", "good");
    await expect(orb(guest)).toHaveAttribute("aria-label", /^In .+'s world, linked (directly|through the server)\. A word there and back: 80 ms\. The link's strong\.$/);
    await expect(orb(host)).toHaveAttribute("data-quality", "good");
    await expect(orb(host)).toHaveAttribute("aria-label", "Your world, open to friends: 1 friend in it. The slowest link: a word there and back in 80 ms. The link's strong.");
    await orb(guest).click();
    await expect(guest.locator("#banner")).toHaveText(/^In .+'s world, linked (directly|through the server)\. A word there and back: 80 ms\. The link's strong\.$/);
    await guest.evaluate(() => (window.pellagos.game.link = "lost"));
    await expect(orb(guest)).toHaveAttribute("data-quality", "lost");
    await expect(orb(guest)).toHaveAttribute("aria-label", /The link's dropped: reconnecting…$/);
    expect(await orb(guest).evaluate((button) => getComputedStyle(button.querySelector(".orb-ball")).animationName)).toBe("orb-flicker");
    await guest.evaluate(() => {
        const { game } = window.pellagos;

        game.link = null;
        delete game.remote.ping;
    });
    await expect(orb(guest)).not.toHaveAttribute("data-quality", "lost");

    // The guest walks: done in the host's world, and in their copy alike
    const to = await guest.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const to = [me.square[0] + 4, me.square[1]];

        game.remote.command({ type: "move", to });

        return to;
    });

    await expect.poll(() => host.evaluate(() => window.pellagos.game.battle.actor("guest-1").square), { timeout: 60000 }).toEqual(to);
    await expect.poll(() => guest.evaluate(() => window.pellagos.game.battle.actor("guest-1").square), { timeout: 60000 }).toEqual(to);

    // (Their copy's kept as the host's: never sent again, unless it was too far behind once it had loaded)
    expect(await sentAgain(guest)).toBe(0);

    // The host's page hidden (their phone gone to another app): the guest's told the host's game
    // is in the background (their world, on that phone, can't move on); shown again, on it goes,
    // the host's menu open, as hiding the page opened it, but nothing stopped by it
    const hide = (hidden) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
        document.dispatchEvent(new Event("visibilitychange"));
    };

    await host.evaluate(hide, true);
    await expect(guest.locator("#netstatus")).toHaveText("The host's game is in the background: the world waits for them.", { timeout: 30000 });
    await host.evaluate(hide, false);
    await expect(guest.locator("#netstatus")).toBeHidden({ timeout: 30000 });
    await expect(host.locator("#menunote")).toHaveText("Others are playing: the world goes on.");

    // Paused for everyone from the host's menu: the guest's told, and the world stands still (its
    // time where it was a second later) till the host resumes it
    await host.locator("#pauseallbutton").click();
    await expect(host.locator("#menunote")).toHaveText("Paused for everyone, till you resume.");
    await expect(host.locator("#pauseallbutton")).toBeHidden();
    await expect(guest.locator("#netstatus")).toHaveText("The host has paused the game.", { timeout: 30000 });

    const stoppedAt = await host.evaluate(() => window.pellagos.game.battle.time);

    await expect.poll(() => guest.evaluate(() => window.pellagos.game.battle.time), { timeout: 30000 }).toBe(stoppedAt);
    await guest.waitForTimeout(1000);
    expect(await host.evaluate(() => window.pellagos.game.battle.time)).toBe(stoppedAt);
    await host.locator("#resumebutton").click();
    await expect(guest.locator("#netstatus")).toBeHidden({ timeout: 30000 });
    await expect.poll(() => guest.evaluate(() => window.pellagos.game.battle.time), { timeout: 30000 }).toBeGreaterThan(stoppedAt);

    // Nothing from the host for a while (its world stopped, without a word): the guest's told
    // they're waiting for it
    await host.evaluate(() => window.pellagos.game.stop());
    await expect(guest.locator("#netstatus")).toHaveText("Waiting for the host…", { timeout: 30000 });
    await host.evaluate(() => window.pellagos.game.start());
    await expect(guest.locator("#netstatus")).toBeHidden({ timeout: 30000 });

    // The guest's link drops (given up on, as when it goes quiet): back on a new link before long,
    // sent the world again, and walking on in both worlds alike
    await guest.evaluate(() => window.pellagos.together.link.socket.close(4000));
    await expect.poll(() => sentAgain(guest), { timeout: 30000 }).toBe(1);
    await expect(guest.locator("#netstatus")).toBeHidden({ timeout: 30000 });

    // The guest's game stops a while (its page hidden, or a slow phone in a long fight): fallen too
    // far behind the host to catch up a step at a time, it's sent the world as it now is instead,
    // and carries on from it
    const tooFar = await guest.evaluate(async () => (await import("/js/core/netplay.js")).PACE.tooFar);
    const resent = () => guest.evaluate(() => [window.pellagos.game.remote.skips, window.pellagos.game.remote.resyncs]);
    const [skips, resyncs] = await resent();

    await guest.evaluate(() => window.pellagos.game.stop());
    await expect.poll(() => guest.evaluate(() => window.pellagos.game.remote.behind), { timeout: 30000 }).toBeGreaterThan(tooFar);
    await guest.evaluate(() => window.pellagos.game.start());
    await expect.poll(resent, { timeout: 30000 }).toEqual([skips + 1, resyncs + 1]);
    await expect(guest.locator("#netstatus")).toBeHidden({ timeout: 30000 });
    expect(await guest.evaluate(() => window.pellagos.game.remote.behind)).toBeLessThan(tooFar);

    const onward = await guest.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const to = [me.square[0], me.square[1] + 3];

        game.remote.command({ type: "move", to });

        return to;
    });

    await expect.poll(() => host.evaluate(() => window.pellagos.game.battle.actor("guest-1").square), { timeout: 60000 }).toEqual(onward);
    await expect.poll(() => guest.evaluate(() => window.pellagos.game.battle.actor("guest-1").square), { timeout: 60000 }).toEqual(onward);
    expect(await host.evaluate(() => [...window.pellagos.game.host.players.keys()].sort())).toEqual(["guest-1", "player"]);

    // The guest goes back to the title: gone from the host's world
    await guest.locator("#menubutton").click();
    await guest.locator("#quitbutton").click();
    await expect(guest.locator("#title")).toBeVisible();
    await expect(host.locator("#banner")).toContainText("Syl has left the world.", { timeout: 30000 });
    expect(await host.evaluate(() => [...window.pellagos.game.host.players.keys()])).toEqual(["player"]);

    // They join again; the host closes the world to others: they're told, at the title
    await guest.locator("#joinbutton").click();
    await join.locator("#joincode").fill(code);
    await join.getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect.poll(() => host.evaluate(() => window.pellagos.game.host.players.size), { timeout: 30000 }).toBe(2);

    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();
    await expect(invite.locator("#inviteplayers li")).toHaveText([/Syl/]);
    await invite.getByRole("button", { name: "Close the world to others" }).click();
    await expect(guest.locator("#titlenote")).toHaveText("The world's host has closed it to others.", { timeout: 30000 });
    expect(await host.evaluate(() => [...window.pellagos.game.host.players.keys()])).toEqual(["player"]);

    // (No world with that code any more)
    await guest.locator("#joinbutton").click();
    await join.locator("#joincode").fill(code);
    await join.getByRole("button", { name: "Join" }).click();
    await expect(join.locator("#joinstatus")).toHaveText("There's no world open with that code.");

    await hostContext.close();
    await guestContext.close();
});

test("a visitor to a world on the host's device is remembered there by their own id: gone, what the world knows of them is kept with it, and back, they're where they left", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    // (The host plays a character kept on their device, in a world of their own there)
    await host.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), { ...ELF, seed: 2, hero: { ...ELF.hero, name: "Wren", race: "human" } });
    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), ELF);
    await host.goto("/");
    await host.locator("#continuebutton").click();
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();

    await invite.getByRole("button", { name: "Back to the game" }).click();

    // Syl comes in, and walks a little way
    await guest.goto(`/?join=${code}`);
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);

    const guestId = () => host.evaluate(() => [...window.pellagos.game.host.players.keys()].find((id) => id !== "player"));

    await expect.poll(guestId, { timeout: 30000 }).toBeTruthy();

    const onward = await guest.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const to = [me.square[0], me.square[1] + 3];

        game.remote.command({ type: "move", to });

        return to;
    });

    await expect.poll(async () => host.evaluate((id) => window.pellagos.game.battle.actor(id).square, await guestId()), { timeout: 60000 }).toEqual(onward);

    // (They put a marker on the host's world map, the world's to remember with them; and set their
    // Action Bar, their device's to keep: core/host.js OWN)
    const quick = ["stun", "burn", null, null, null, null];

    await guest.evaluate((quick) => {
        window.pellagos.game.setQuick(quick);
        window.pellagos.game.addMarker([40, -12], { icon: "camp", words: "home" });
    }, quick);

    // Gone: what the host's world knows of them kept with it, by their own id
    await guest.locator("#menubutton").click();
    await guest.locator("#quitbutton").click();
    await expect(host.locator("#banner")).toContainText("Syl has left the world.", { timeout: 30000 });

    const guid = await guest.evaluate(() => JSON.parse(localStorage.getItem(`pellagos.${JSON.parse(localStorage.getItem("pellagos.characters")).last}.save`)).hero.guid);
    const remembered = await host.evaluate((guid) => {
        const id = JSON.parse(localStorage.getItem("pellagos.characters")).last;
        const world = JSON.parse(localStorage.getItem(`pellagos.${JSON.parse(localStorage.getItem(`pellagos.${id}.save`)).world}.about`));
        const place = world.places[guid];

        return place && { visitor: place.visitor, place: JSON.parse(localStorage.getItem(`pellagos.${place.id}.place`))?.place ?? null, progress: localStorage.getItem(`pellagos.${place.id}.progress`) };
    }, guid);

    expect(remembered).toMatchObject({ visitor: "Syl", progress: null });
    expect(remembered.place).toBeTruthy();

    // Back: where they left
    await guest.locator("#joinbutton").click();
    await guest.locator("#join").locator("#joincode").fill(code);
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect.poll(async () => host.evaluate((id) => id && window.pellagos.game.battle.actor(id)?.square, await guestId()), { timeout: 60000 }).toEqual(onward);

    // (Their marker and Action Bar as they left them)
    expect(await guest.evaluate(() => window.pellagos.game.markerView().map(({ x, z, icon, words }) => ({ x, z, icon, words })))).toEqual([{ x: 40, z: -12, icon: "camp", words: "home" }]);
    expect(await guest.evaluate(() => window.pellagos.game.wheels.quick)).toEqual(quick);

    await hostContext.close();
    await guestContext.close();
});

test("the same character coming into a world on another device takes theirs over where they stand: the first device told it's let go and back at the title, the second told it carries on", async ({ ownBrowser: browser }) => {
    const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
    const [host, first, second] = await Promise.all(contexts.map((context) => context.newPage()));
    // (The same character on both devices: the same id of its own)
    const syl = { ...ELF, hero: { ...ELF.hero, guid: "6b8f2c1d-4e3a-4b5c-8d7e-9f0a1b2c3d4e" } };

    await cheaply(host, first, second);

    for (const page of [host, first, second]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await first.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), syl);
    await second.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), syl);
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();

    await invite.getByRole("button", { name: "Back to the game" }).click();

    // Syl comes in on the first, and walks a little way
    await first.goto(`/?join=${code}`);
    await first.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(first);

    const guests = () => host.evaluate(() => [...window.pellagos.game.host.players.keys()].filter((id) => id !== "player"));

    await expect.poll(guests, { timeout: 30000 }).toHaveLength(1);

    const [id] = await guests();
    const onward = await first.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const to = [me.square[0], me.square[1] + 3];

        game.remote.command({ type: "move", to });

        return to;
    });

    await expect.poll(() => host.evaluate((id) => window.pellagos.game.battle.actor(id).square, id), { timeout: 60000 }).toEqual(onward);

    // On the second: Syl taken over, where they stand; the first told, back at the title
    await second.goto(`/?join=${code}`);
    await second.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(second);
    await expect(second.locator("#banner")).toContainText("Your other session in this world was closed: you carry on here.", { timeout: 30000 });
    await expect(first.locator("#titlenote")).toHaveText("You went into this world on another device, so this one has let go.", { timeout: 30000 });
    expect(await first.evaluate(() => window.pellagos.playing)).toBe(false);
    expect(await guests()).toEqual([id]);
    expect(await second.evaluate(() => window.pellagos.game.me)).toBe(id);
    expect(await host.evaluate((id) => window.pellagos.game.battle.actor(id).square, id)).toEqual(onward);
    expect(await second.evaluate(() => window.pellagos.game.battle.actor(window.pellagos.game.me).square)).toEqual(onward);

    await Promise.all(contexts.map((context) => context.close()));
});

// A human who joins by the host's own town, its own id the same on two devices
const ADA = {
    version: 1,
    seed: 779,
    created: "2026-09-04T12:00:00.000Z",
    hero: {
        name: "Ada",
        guid: "2e7d4c3b-5a6f-4b8c-9d0e-1f2a3b4c5d6e",
        weapon: "sword",
        race: "human",
        parts: [],
        shape: { macro: { gender: 0.2, muscle: 0.5, weight: 0.4, height: 0.5, bust: 0.5, african: 0.1, asian: 0.1, caucasian: 0.8 }, details: {} },
        look: { skin: { tone: "#e0b896" }, eyes: { iris: "#6a4a2a" }, hair: { style: "bob", beard: "none", colour: "#3a2418" } },
    },
};

test("a guest taken over upstairs in Wenches and Ale from another device starts there: the room drawn at once, the tavern's own folk dressed with it, and no one else's, the townsfolk out in the streets not till they come out", async ({ ownBrowser: browser }) => {
    const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
    const [host, first, second] = await Promise.all(contexts.map((context) => context.newPage()));

    await cheaply(host, first, second);

    for (const page of [host, first, second]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await first.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), ADA);
    await second.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), ADA);
    await host.goto("/?play&seed=1");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();

    await invite.getByRole("button", { name: "Back to the game" }).click();

    // Ada in on the first: into the tavern and up its stairs
    await first.goto(`/?join=${code}`);
    await first.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(first);

    const map = (page) => page.evaluate(() => window.pellagos.game.battle.actor(window.pellagos.game.me).map);

    await first.evaluate(() => window.pellagos.game.remote.command({ type: "enter", link: "tavern-door" }));
    await expect.poll(() => map(first), { timeout: 120000 }).toBe("taproom");
    await first.evaluate(() => window.pellagos.game.remote.command({ type: "enter", link: "tavern-stairs" }));
    await expect.poll(() => map(first), { timeout: 120000 }).toBe("upstairs");

    // (Others' folk in the world: another building's, and those out in the streets)
    expect(await host.evaluate(() => window.pellagos.game.battle.actors.filter(({ kind, map }) => kind === "folk" && map !== "taproom" && map !== "upstairs").length)).toBeGreaterThan(10);

    // On the second: taken over, upstairs, the room shown; the tavern's twelve dressed as it loads,
    // and a while later still no one else's folk
    await second.goto(`/?join=${code}`);
    await second.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(second);
    await expect(second.locator("#banner")).toContainText("Your other session in this world was closed: you carry on here.", { timeout: 30000 });

    const seen = () =>
        second.evaluate(() => {
            const { game } = window.pellagos;
            const folk = game.battle.actors.filter(({ kind, id }) => kind === "folk" && game.avatars.has(id));

            return { map: game.battle.actor(game.me).map, shown: game.mapId, room: game.interiors.get("upstairs")?.object.visible ?? false, town: game.town.object.visible, folk: folk.map(({ map }) => map).sort() };
        });
    const tavern = [...Array(7).fill("taproom"), ...Array(5).fill("upstairs")];

    await expect.poll(seen, { timeout: 60000 }).toEqual({ map: "upstairs", shown: "upstairs", room: true, town: false, folk: tavern });
    await second.waitForTimeout(10000);
    expect((await seen()).folk).toEqual(tavern);

    await Promise.all(contexts.map((context) => context.close()));
});

// A human who joins by the host's own town, carrying two wolf pelts
const BRYN = {
    version: 1,
    seed: 778,
    created: "2026-09-03T12:00:00.000Z",
    hero: {
        name: "Bryn",
        weapon: "sword",
        race: "human",
        parts: [],
        shape: { macro: { gender: 0.8, muscle: 0.6, weight: 0.4, height: 0.6, bust: 0.2, african: 0.1, asian: 0.1, caucasian: 0.8 }, details: {} },
        look: { skin: { tone: "#d9b08c" }, eyes: { iris: "#5a7a3a" }, hair: { style: "short", beard: "none", colour: "#4a3020" } },
    },
};

test("a guest whose game's reloaded goes straight back into the host's world by its code, each stage of the way shown, where they stood; a world no longer open there says so, to try again, or cancel", async ({ ownBrowser: browser }) => {
    const [hostContext, guestContext] = await Promise.all([browser.newContext(), browser.newContext()]);
    const [host, guest] = await Promise.all([hostContext.newPage(), guestContext.newPage()]);
    const syl = { ...ELF, hero: { ...ELF.hero, guid: "1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d" } };

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => {
        if (!localStorage.getItem("pellagos.characters")) {
            localStorage.setItem("pellagos.save", JSON.stringify(save));
        }
    }, syl);
    // (Each stage of the way back in, as it's marked: "reach:now", "reach:done", ...)
    await guest.addInitScript(() => {
        window.stagesSeen = [];
        document.addEventListener("DOMContentLoaded", () => {
            new MutationObserver((changes) => {
                for (const { target, attributeName } of changes) {
                    if (attributeName === "data-state" && target.dataset.state !== "waiting") {
                        window.stagesSeen.push(`${target.dataset.stage}:${target.dataset.state}`);
                    }
                }
            }).observe(document.querySelector("#rejoinstages"), { subtree: true, attributes: true });
        });
    });
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();
    const hostName = await host.evaluate(() => window.pellagos.game.self.hero.name);

    await invite.getByRole("button", { name: "Back to the game" }).click();

    // Syl joins by the code: where she is kept, written as she plays
    await guest.goto(`/?join=${code}`);
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);

    const guests = () => host.evaluate(() => [...window.pellagos.game.host.players.keys()].filter((id) => id !== "player"));
    const where = () => guest.evaluate(() => (({ x, y }) => ({ x, y }))(window.pellagos.game.battle.actor(window.pellagos.game.me)));
    const kept = () => guest.evaluate(() => JSON.parse(localStorage.getItem("pellagos.inworld")));

    await expect.poll(guests, { timeout: 30000 }).toHaveLength(1);
    expect(await kept()).toMatchObject({ kind: "friend", code, host: hostName, name: "Syl" });

    const stood = await where();
    const rejoin = guest.locator("#rejoin");

    // Reloaded (its join link gone from its address once it was read): straight back in by the
    // code all the same, the dialog naming whose world and who, each stage under way and then
    // done, in order; in again as Syl, where she stood
    expect(new URL(guest.url()).search).toBe("");
    await guest.reload();
    await expect(rejoin).toBeVisible({ timeout: 60000 });
    await expect(rejoin.locator("#rejointitle")).toHaveText(`Back into ${hostName}'s world`);
    await expect(rejoin.locator("#rejoinabout")).toHaveText(`By its code, ${code}, as Syl.`);
    await expect(guest.locator("#join")).toBeHidden();
    await playing(guest);
    await expect(rejoin).toBeHidden();
    expect(await guest.evaluate(() => window.stagesSeen)).toEqual(["reach:now", "reach:done", "find:now", "find:done", "ask:now"]);
    expect(await guest.evaluate(() => document.querySelector("#playerplate .name").textContent)).toBe("Syl");
    await expect.poll(guests, { timeout: 30000 }).toHaveLength(1);

    const now = await where();

    expect(Math.hypot(now.x - stood.x, now.y - stood.y)).toBeLessThan(1.5);

    // Gone back into a world no longer open under its code: that stage crossed out, said why, Try
    // again; cancelled, the title, nothing to go back into
    await guest.evaluate(() => localStorage.setItem("pellagos.inworld", JSON.stringify({ ...JSON.parse(localStorage.getItem("pellagos.inworld")), code: "ZZZZ" })));
    await guest.goto("/");
    await expect(rejoin.locator('li[data-stage="find"]')).toHaveAttribute("data-state", "failed", { timeout: 60000 });
    await expect(rejoin.locator('li[data-stage="reach"]')).toHaveAttribute("data-state", "done");
    await expect(rejoin.locator("#rejoinproblem")).toHaveText("There's no world open with that code.");
    await expect(rejoin.getByRole("button", { name: "Try again" })).toBeVisible();
    await rejoin.getByRole("button", { name: "Cancel" }).click();
    await expect(rejoin).toBeHidden();
    await expect(guest.locator("#title")).toBeVisible();
    expect(await kept()).toBeNull();
});

test("two players side by side trade face to face: one asks, the other says yes, each offers, both agree, and it changes hands in both worlds", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => {
        localStorage.setItem("pellagos.save", JSON.stringify(save));
        localStorage.setItem("pellagos.progress", JSON.stringify({ created: save.created, seed: save.seed, skills: {}, gold: 20, pack: [{ id: "wolfPelt", quality: "common", count: 2 }] }));
    }, BRYN);

    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();
    const ada = await host.evaluate(() => window.pellagos.game.host.players.get("player").hero.name);

    await invite.getByRole("button", { name: "Back to the game" }).click();
    await guest.goto(`/?join=${code}`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect(host.locator("#banner")).toContainText("Bryn has come into the world", { timeout: 30000 });

    // Bryn taps the host's player beside them: asked to trade, the host says yes
    await guest.evaluate(() => {
        const { game } = window.pellagos;
        const at = game.view.toScreen(game.avatars.get("player").point(0.5));

        game.tap(at.x, at.y);
    });
    await expect(host.locator("#banner")).toContainText("Bryn would trade with you.", { timeout: 30000 });
    await host.locator("#banner .banner-action").click();
    await expect(host.locator(".pack-title")).toHaveText("Trading with Bryn", { timeout: 30000 });
    await expect(guest.locator(".pack-title")).toHaveText(`Trading with ${ada}`, { timeout: 30000 });

    // Bryn offers both pelts; the host, ten gold
    await guest.locator('.pack-cell[data-item="wolfPelt"]').click();
    await guest.locator(".pack-about").getByRole("button", { name: /^Offer/ }).click();
    await guest.locator(".pack-ask").getByRole("button", { name: "Offer", exact: true }).click();
    await expect(host.locator(".pack-section", { hasText: "Bryn offers" })).toContainText("Wolf pelt ×2", { timeout: 30000 });
    await host.locator(".pack-section", { hasText: "Bryn offers" }).locator(".pack-peek").click();
    await expect(host.locator(".pack-section", { hasText: "Bryn offers" }).locator(".pack-peeked")).toContainText("The adventurers' guild pays");
    await expect(guest.locator('.pack-cell[data-item="wolfPelt"]')).toHaveClass(/offered/, { timeout: 30000 });

    await host.locator(".pack-barter").getByRole("button", { name: "Offer gold" }).click();
    await host.locator(".pack-ask").getByRole("button", { name: "Offer", exact: true }).click();
    await expect(guest.locator(".pack-section", { hasText: `${ada} offers` })).toContainText("10 gold", { timeout: 30000 });

    // Both agree: it's done, in both worlds alike
    await guest.locator(".pack-barter").getByRole("button", { name: /^Agree to trade/ }).click();
    await expect(host.locator(".pack-agreed")).toHaveText("Bryn agrees to this.", { timeout: 30000 });
    await host.locator(".pack-barter").getByRole("button", { name: /^Agree to trade/ }).click();
    await expect(host.locator("#banner")).toContainText("You trade with Bryn: you get 2 wolf pelts.", { timeout: 30000 });
    await expect(guest.locator("#banner")).toContainText(`You trade with ${ada}: you get 10 gold.`, { timeout: 30000 });
    await expect(host.locator(".pack-title")).toHaveText("Pack");

    for (const page of [host, guest]) {
        const held = await page.evaluate(() => {
            const players = window.pellagos.game.host.players;
            const [mine, theirs] = [players.get("player").progress, players.get("guest-1").progress];

            return [mine.gold, mine.held("wolfPelt"), theirs.gold, theirs.held("wolfPelt")];
        });

        expect(held).toEqual([10, 2, 30, 0]);
    }

    expect(await sentAgain(guest)).toBe(0);

    await hostContext.close();
    await guestContext.close();
});

// Two players make a party (core/host.js PARTY, the "party" command): asked from the party menu,
// said no to, asked again and said yes to; each has the other's icon at the top of their party,
// the leader crowned; allied in both worlds; they talk in its chat (core/netplay.js: sent to
// those in it alone), the Party button counting what's unseen; one leaves, and with one left,
// it's no more
test("two players make a party: one asks from the party menu, the other says no, then yes; each has the other's icon at the top of their party, the leader crowned, allied in both worlds; they talk in its chat, unread lines on the Party button; one leaves, and the party's no more", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), BRYN);
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();
    const ada = await host.evaluate(() => window.pellagos.game.host.players.get("player").hero.name);

    await invite.getByRole("button", { name: "Back to the game" }).click();
    await guest.goto(`/?join=${code}`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect(host.locator("#banner")).toContainText("Bryn has come into the world", { timeout: 30000 });

    // The host asks Bryn from the party menu; Bryn says no, and the host's told
    const menu = host.getByRole("dialog", { name: "Party" });
    const asking = menu.locator('.party-others .party-player[data-id="guest-1"] .party-invite');
    const asked = guest.getByRole("dialog", { name: `${ada} asks you to join their party.` });

    await host.locator("#partybutton").click();
    await expect(menu).toBeVisible();
    await expect(asking).toHaveText("Invite");
    await asking.click();
    await expect(asking).toHaveText("Asked", { timeout: 30000 });
    await expect(asking).toBeDisabled();
    await expect(asked).toBeVisible({ timeout: 30000 });
    await asked.getByRole("button", { name: "Decline" }).click();
    await expect(host.locator("#banner")).toContainText("Bryn says no to your party.", { timeout: 30000 });
    await expect(asking).toHaveText("Invite", { timeout: 30000 });

    // Asked again, Bryn says yes: a party of two, the host leading it
    await asking.click();
    await expect(asked).toBeVisible({ timeout: 30000 });
    await asked.getByRole("button", { name: "Accept" }).click();
    await expect(host.locator("#banner")).toContainText("Bryn joins the party.", { timeout: 30000 });
    await expect(guest.locator("#banner")).toContainText(`You join ${ada}'s party.`, { timeout: 30000 });
    await expect(menu.locator('.party-players .party-player[data-id="player"] .party-name')).toHaveText(`♛ ${ada} (you)`, { timeout: 30000 });
    await expect(menu.locator('.party-players .party-player[data-id="guest-1"]').getByRole("button", { name: "Make leader" })).toBeVisible();
    await menu.getByRole("button", { name: "Close" }).click();

    // Each has the other's icon at the top of their party, framed in their colour; the leader crowned
    await expect(host.locator("#party .member").first()).toHaveAttribute("data-id", "guest-1", { timeout: 30000 });
    await expect(host.locator('#party .member[data-id="guest-1"]')).toHaveClass(/\bplayer\b/);
    await expect(host.locator('#party .member[data-id="guest-1"]')).not.toHaveClass(/\bleader\b/);
    await expect(guest.locator("#party .member").first()).toHaveAttribute("data-id", "player", { timeout: 30000 });
    await expect(guest.locator('#party .member[data-id="player"]')).toHaveClass(/\bleader\b/);
    await expect(guest.locator('#party .member[data-id="player"]')).toHaveAttribute("aria-label", `${ada}, leading your party`);

    // Both worlds alike: the same party, and the two allied, whatever their peoples
    for (const page of [host, guest]) {
        const party = await page.evaluate(() => {
            const { game } = window.pellagos;
            const [ada, bryn] = [game.battle.actor("player"), game.battle.actor("guest-1")];
            const { leader, members } = game.host.partyFor("guest-1");

            return { leader, members, allied: game.battle.allied(ada, bryn), hostile: game.battle.hostile(ada, bryn) };
        });

        expect(party).toEqual({ leader: "player", members: ["player", "guest-1"], allied: true, hostile: false });
    }

    // Bryn says something in the party's chat: the host's Party button counts it, and the menu
    // opens on the chat, the line in it, and counts it seen
    const theirs = guest.getByRole("dialog", { name: "Party" });
    const badge = host.locator("#partyunread");

    await guest.locator("#partybutton").click();
    await expect(theirs).toBeVisible();
    await theirs.getByRole("tab", { name: "Chat" }).click();
    await theirs.getByRole("textbox", { name: "Something to say to your party" }).fill("Over here!");
    await theirs.getByRole("textbox", { name: "Something to say to your party" }).press("Enter");
    await expect(theirs.locator(".chat-line.mine").last()).toHaveText("You: Over here!", { timeout: 30000 });
    await expect(badge).toHaveText("1", { timeout: 30000 });
    await expect(host.locator("#partybutton")).toHaveAttribute("aria-label", "Party, 1 unread message");
    await host.locator("#partybutton").click();
    await expect(menu.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    await expect(menu.locator(".chat-line:not(.system)").last()).toHaveText("Bryn: Over here!");
    await expect(menu.locator(".chat-line.system").first()).toHaveText("Bryn joins the party.");
    await expect(badge).toBeHidden();

    // The host answers with a quick phrase: Bryn, on the chat already, sees it there (not counted)
    await menu.getByRole("button", { name: "On my way!" }).click();
    await expect(theirs.locator(".chat-line:not(.system)").last()).toHaveText(`${ada}: On my way!`, { timeout: 30000 });
    await expect(menu.locator(".chat-line.mine").last()).toHaveText("You: On my way!");
    await expect(guest.locator("#partyunread")).toBeHidden();
    await menu.getByRole("button", { name: "Close" }).click();

    // Bryn leaves (pressed twice, to be sure): the party's no more, in both worlds
    const leave = theirs.locator('.party-players .party-player[data-id="guest-1"] .party-sure');

    await theirs.getByRole("tab", { name: "Party" }).click();
    await expect(leave).toHaveText("Leave party");

    // (Both presses at once: two worlds drawn in software can starve a page of frames for longer
    // than the second press is waited for, DISMISS_SURE_MS, between two of Playwright's clicks)
    expect(await leave.evaluate((button) => {
        button.click();

        const asked = button.textContent;

        button.click();

        return asked;
    })).toBe("Leave?");
    await expect(guest.locator("#banner")).toContainText("You leave the party.", { timeout: 30000 });
    await expect(host.locator("#banner")).toContainText("The party's no more", { timeout: 30000 });
    await expect(host.locator('#party .member[data-id="guest-1"]')).toHaveCount(0, { timeout: 30000 });
    await expect(guest.locator('#party .member[data-id="player"]')).toHaveCount(0, { timeout: 30000 });

    for (const page of [host, guest]) {
        expect(await page.evaluate(() => window.pellagos.game.host.partyFor("guest-1"))).toBe(null);
    }

    // (Its comings and goings in the chat too; and there's no one to talk to now)
    await host.locator("#partybutton").click();
    await menu.getByRole("tab", { name: "Chat" }).click();
    await expect(menu.locator(".chat-line.system").last()).toHaveText("The party's no more: no one's left in it with you.");
    await expect(menu.getByRole("textbox", { name: "Something to say to your party" })).toBeDisabled();

    expect(await sentAgain(guest)).toBe(0);

    await hostContext.close();
    await guestContext.close();
});

test("the party menu's Players tab lists everyone playing in the world, the player first: each with their standing and people, how they stand and where they are; one in no party asked to the player's from there, and, in it, put out by its leader (pressed twice); away said", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), BRYN);
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();
    const ada = await host.evaluate(() => window.pellagos.game.host.players.get("player").hero.name);

    await invite.getByRole("button", { name: "Back to the game" }).click();
    await guest.goto(`/?join=${code}`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect(host.locator("#banner")).toContainText("Bryn has come into the world", { timeout: 30000 });

    // The host's Players tab: themselves first, then Bryn; each a Commoner of their people, in no
    // party, somewhere; Bryn to be asked
    const menu = host.getByRole("dialog", { name: "Party" });
    const rows = menu.locator(".party-everyone-list .party-player");
    const bryn = menu.locator('.party-everyone-list .party-player[data-id="guest-1"]');
    const mine = menu.locator('.party-everyone-list .party-player[data-id="player"]');

    await host.locator("#partybutton").click();
    await menu.getByRole("tab", { name: "Players" }).click();
    await expect(menu.getByRole("tab", { name: "Players" })).toHaveAttribute("aria-selected", "true");
    await expect(menu.locator(".party-everyone .journal-heading")).toHaveText("In this world (2)");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAttribute("data-id", "player");
    await expect(mine.locator(".party-name")).toHaveText(`${ada} (you)`);
    await expect(mine.locator(".party-kind")).toHaveText("Commoner of the Humans");
    await expect(mine.locator(".player-chip")).toHaveText(["In no party"]);
    await expect(mine.locator(".party-where")).toHaveText(/^(At |In |Out in the wilds)/);
    await expect(mine.locator("button")).toHaveCount(0);
    await expect(bryn.locator(".party-name")).toHaveText("Bryn");
    await expect(bryn.locator(".party-kind")).toHaveText("Commoner of the Humans");
    await expect(bryn.locator(".player-chip")).toHaveText(["In no party"]);
    await expect(bryn.locator(".party-where")).toHaveText(/^(At |In |Out in the wilds)/);
    await expect(bryn.locator(".party-invite")).toHaveText("Invite");
    await expect(menu.locator(".party-everyone-note")).toHaveText("Invite anyone in no party: you'll lead the party you make together, up to four in it.");

    // (A world on a device, not a server: no World button, the server's World panel)
    await expect(menu.getByRole("button", { name: "World" })).toBeHidden();

    // Asked from there: said so on both Players tabs, and Bryn says yes
    const asked = guest.getByRole("dialog", { name: `${ada} asks you to join their party.` });

    await bryn.locator(".party-invite").click();
    await expect(bryn.locator(".party-invite")).toHaveText("Asked", { timeout: 30000 });
    await expect(bryn.locator(".party-invite")).toBeDisabled();
    await expect(bryn.locator(".player-chip")).toHaveText(["Asked to your party"]);
    await expect(asked).toBeVisible({ timeout: 30000 });
    await asked.getByRole("button", { name: "Accept" }).click();
    await expect(host.locator("#banner")).toContainText("Bryn joins the party.", { timeout: 30000 });

    // In the party: the host crowned and leading it, Bryn in it, to be put out
    await expect(bryn.locator(".player-chip")).toHaveText(["In your party"], { timeout: 30000 });
    await expect(bryn.locator(".party-remove")).toHaveText("Dismiss");
    await expect(mine.locator(".party-name")).toHaveText(`♛ ${ada} (you)`);
    await expect(mine.locator(".player-chip")).toHaveText(["You lead your party"]);
    await expect(menu.locator(".party-everyone-note")).toHaveText("Invite anyone in no party to yours; Dismiss puts someone out of it.");

    // Bryn's own: the host leading their party, and no one for Bryn to put out of it (the host
    // there to message, or block)
    const theirs = guest.getByRole("dialog", { name: "Party" });
    const theirRows = theirs.locator(".party-everyone-list .party-player");

    await guest.locator("#partybutton").click();
    await theirs.getByRole("tab", { name: "Players" }).click();
    await expect(theirRows).toHaveCount(2);
    await expect(theirRows.first()).toHaveAttribute("data-id", "guest-1");
    await expect(theirRows.first().locator(".player-chip")).toHaveText(["In your party"]);
    await expect(theirRows.nth(1).locator(".party-name")).toHaveText(`♛ ${ada}`);
    await expect(theirRows.nth(1).locator(".player-chip")).toHaveText(["Leads your party"]);
    await expect(theirs.locator(".party-everyone-list .party-remove")).toHaveCount(0);
    await expect(theirRows.nth(1).locator("button")).toHaveText(["Message", "Block"]);
    await expect(theirs.locator(".party-everyone-note")).toHaveText("Only your party's leader can dismiss anyone from it.");
    await theirs.getByRole("button", { name: "Close" }).click();

    // Bryn marked away (AFK: core/host.js AFK) in both worlds alike: said on the host's tab
    for (const page of [host, guest]) {
        await page.evaluate(() => (window.pellagos.game.host.players.get("guest-1").away = true));
    }

    await expect(bryn.locator(".player-chip")).toHaveText(["In your party", "Away (AFK)"], { timeout: 30000 });
    await expect(bryn).toHaveClass(/\baway\b/);

    for (const page of [host, guest]) {
        await page.evaluate(() => (window.pellagos.game.host.players.get("guest-1").away = false));
    }

    await expect(bryn.locator(".player-chip")).toHaveText(["In your party"], { timeout: 30000 });

    // Put out of the party by the host (both presses at once, as Leave party is, in the party test)
    expect(await bryn.locator(".party-remove").evaluate((button) => {
        button.click();

        const sure = button.textContent;

        button.click();

        return sure;
    })).toBe("Dismiss?");
    await expect(guest.locator("#banner")).toContainText("You're put out of the party.", { timeout: 30000 });
    await expect(bryn.locator(".player-chip")).toHaveText(["In no party"], { timeout: 30000 });
    await expect(bryn.locator(".party-invite")).toHaveText("Invite");
    await expect(mine.locator(".party-name")).toHaveText(`${ada} (you)`);

    for (const page of [host, guest]) {
        expect(await page.evaluate(() => window.pellagos.game.host.partyFor("guest-1"))).toBe(null);
    }

    await hostContext.close();
    await guestContext.close();
});

test("a direct message from the Players tab: To Bryn in the host's chat, From the host in Bryn's, a moment on Bryn's screen and gone; refused while Bryn takes no world messages, the host told; Bryn blocks the host: their messages and invites never reach Bryn, the host none the wiser; unblocked from Game options' Blocked players", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), BRYN);
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();
    const ada = await host.evaluate(() => window.pellagos.game.host.players.get("player").hero.name);

    await invite.getByRole("button", { name: "Back to the game" }).click();
    await guest.goto(`/?join=${code}`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect(host.locator("#banner")).toContainText("Bryn has come into the world", { timeout: 30000 });

    // The host messages Bryn from the Players tab: the Chat, To Bryn, ready to type
    const menu = host.getByRole("dialog", { name: "Party" });
    const theirs = guest.getByRole("dialog", { name: "Party" });
    const say = (dialog, to) => dialog.getByRole("textbox", { name: `Something to say to ${to}` });

    await host.locator("#partybutton").click();
    await menu.getByRole("tab", { name: "Players" }).click();
    await menu.locator('.party-everyone-list .party-player[data-id="guest-1"] .party-message').click();
    await expect(menu.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    await expect(menu.getByRole("combobox", { name: "Who to say it to" })).toHaveValue("guest-1");
    await expect(say(menu, "Bryn")).toBeFocused();
    await say(menu, "Bryn").fill("Meet me at the well");
    await say(menu, "Bryn").press("Enter");
    await expect(menu.locator(".chat-line.dm.mine").last()).toHaveText("To Bryn: Meet me at the well", { timeout: 30000 });

    // Bryn: a moment on screen, just above the Action Bar, then gone; counted on the Party
    // button, and in their chat, From the host
    const feed = guest.locator("#hud .chatfeed-line");

    await expect(feed.last()).toHaveText(`From ${ada}: Meet me at the well`, { timeout: 30000 });
    await expect(feed.last()).toHaveClass(/\bdm\b/);
    await expect(guest.locator("#partyunread")).toHaveText("1");
    await expect(feed).toHaveCount(0, { timeout: 15000 });
    await guest.locator("#partybutton").click();
    await expect(theirs.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    await expect(theirs.locator(".chat-line.dm").last()).toHaveText(`From ${ada}: Meet me at the well`);
    await theirs.getByRole("button", { name: "Close" }).click();

    // Bryn takes no world messages (Game options, Chat and players): the host's next isn't sent,
    // and the host's told
    const options = async (page, then) => {
        await page.locator("#menubutton").click();
        await page.locator("#optionsbutton").click();
        await page.locator("#chatbutton").click();
        await then();
        await page.locator("#chatback").click();
        await page.locator("#optionsback").click();
        await page.locator("#resumebutton").click();
    };

    await options(guest, async () => {
        await expect(guest.locator("#chatfeedswitch")).toBeChecked();
        await guest.locator("label:has(#worlddmswitch)").click();
        await expect(guest.locator("#worlddmswitch")).toBeChecked();
    });
    await say(menu, "Bryn").fill("Are you there?");
    await say(menu, "Bryn").press("Enter");
    await expect(host.locator("#banner")).toContainText("Bryn isn't taking direct messages.", { timeout: 30000 });
    await expect(menu.locator(".chat-line.dm.mine")).toHaveCount(1);
    await options(guest, async () => {
        await guest.locator("label:has(#worlddmswitch)").click();
        await expect(guest.locator("#worlddmswitch")).not.toBeChecked();
    });

    // Bryn blocks the host from the Players tab (pressed twice): Blocked there, no Message
    const hostRow = theirs.locator('.party-everyone-list .party-player[data-id="player"]');

    await guest.locator("#partybutton").click();
    await theirs.getByRole("tab", { name: "Players" }).click();
    await expect(hostRow.locator(".party-block")).toHaveText("Block");
    expect(await hostRow.locator(".party-block").evaluate((button) => {
        button.click();

        const sure = button.textContent;

        button.click();

        return sure;
    })).toBe("Block?");
    await expect(hostRow.locator(".player-chip.blocked")).toHaveText("Blocked");
    await expect(hostRow.locator(".party-unblock")).toHaveText("Unblock");
    await expect(hostRow.locator(".party-message")).toHaveCount(0);
    await theirs.getByRole("button", { name: "Close" }).click();

    // The host's message looks sent, but never reaches Bryn; nor does their invite
    const heard = () => guest.evaluate(() => window.pellagos.game.chatLines.length);
    const before = await heard();

    await say(menu, "Bryn").fill("Hello?");
    await say(menu, "Bryn").press("Enter");
    await expect(menu.locator(".chat-line.dm.mine").last()).toHaveText("To Bryn: Hello?", { timeout: 30000 });
    await menu.getByRole("tab", { name: "Players" }).click();
    await menu.locator('.party-everyone-list .party-player[data-id="guest-1"] .party-invite').click();
    await expect(menu.locator('.party-everyone-list .party-player[data-id="guest-1"] .party-invite')).toHaveText("Asked", { timeout: 30000 });
    await expect.poll(() => guest.evaluate(() => Boolean(window.pellagos.game.host.invitation("guest-1"))), { timeout: 30000 }).toBe(true);
    await guest.waitForTimeout(1500);
    expect(await heard()).toBe(before);
    await expect(feed).toHaveCount(0);
    await expect(guest.getByRole("dialog", { name: `${ada} asks you to join their party.` })).toHaveCount(0);

    // Unblocked from Game options' Blocked players: the host there, in this world
    await options(guest, async () => {
        await expect(guest.locator("#blockedsummary")).toHaveText("1 blocked, 1 in this world");
        await guest.locator("#blockedbutton").click();
        await expect(guest.locator("#blockedlist li .name")).toHaveText([ada]);
        await expect(guest.locator("#blockedlist li .about")).toContainText(["In this world"]);
        await guest.locator("#blockedlist").getByRole("button", { name: `Unblock ${ada}` }).click();
        await expect(guest.locator("#blockedlist li")).toHaveText(["No one's blocked."]);
        await guest.locator("#blockedback").click();
        await expect(guest.locator("#blockedsummary")).toHaveText("No one");
    });
    expect(await guest.evaluate(() => window.pellagos.game.isBlocked("player"))).toBe(false);

    // Heard again
    await menu.getByRole("tab", { name: "Chat" }).click();
    await say(menu, "Bryn").fill("There you are");
    await say(menu, "Bryn").press("Enter");
    await expect(feed.last()).toHaveText(`From ${ada}: There you are`, { timeout: 30000 });

    await hostContext.close();
    await guestContext.close();
});

test("two players walk about a while: the joined copy's checked against the host's every fifth of a second and never drifts; the guest's hero drawn going at once; what's sent measured", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);
    // (The guest's debug overlay shown: how the link's going)
    await guest.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ quality: "low", renderScale: 0.5, shadows: false, debug: true })));

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), BRYN);
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();

    await invite.getByRole("button", { name: "Back to the game" }).click();
    await guest.goto(`/?join=${code}`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect(host.locator("#banner")).toContainText("Bryn has come into the world", { timeout: 30000 });

    // (The guest's first frames drawn before the walking's timed: in software, without a GPU, the
    // first takes seconds, and its drawing seconds more before the next comes)
    await guest.waitForFunction(() => window.pellagos.game.clock > 0.3, null, { timeout: 60000, polling: 250 });

    const sentAtFirst = await host.evaluate(() => ({ at: performance.now(), ...window.pellagos.game.hosting.sent }));
    const checking = () => guest.evaluate(() => ({ time: window.pellagos.game.battle.time, checks: window.pellagos.game.remote.motionChecks }));
    const checkedAtFirst = await checking();
    let checkedLast = checkedAtFirst;

    // Both walk about for a while, here and there round where they are: the host's player as the
    // host's game has them; the guest by tapping the ground, as a player would
    for (let round = 0; round < 12; round++) {
        await host.evaluate((round) => {
            const { game } = window.pellagos;
            const me = game.battle.actor(game.me);

            game.host.command(game.me, { type: "move", to: [me.square[0] + (round % 2 ? -6 : 6), me.square[1] + (round % 3) - 1], run: round % 4 === 0 });
        }, round);

        const drawn = await guest.evaluate((round) => {
            const { game } = window.pellagos;
            const me = game.battle.actor(game.me);

            game.mapTap({ x: me.x + (round % 2 ? 5 : -5), z: me.y + (round % 3) - 1, reach: 0, run: round % 3 === 0 });

            // (Sent, not yet done here: drawn setting off all the same, the forecast told of it)
            return game.forecast.sent.length > 0;
        }, round);

        expect(drawn).toBe(true);
        await guest.waitForTimeout(3000);

        const net = await guest.evaluate(() => {
            const { remote, forecast } = window.pellagos.game;

            return { desyncs: remote.desyncs, resyncs: remote.resyncs - remote.skips, pending: forecast.sent.length, told: forecast.self !== null, snaps: forecast.corrections.snaps };
        });

        // (Its hero as the host has them told it, all it sent heard of back, and never put
        // somewhere at once: drawn going all the way)
        expect(net).toMatchObject({ desyncs: 0, resyncs: 0, pending: 0, told: true, snaps: 0 });

        // (Its world gone on, and checked once each MOTION.every steps of it, a fifth of a second:
        // by its world's time, not the clock's, which two worlds drawn in software leave at a
        // quarter of it or so, faster or slower with the machine)
        const checked = await checking();
        const due = (checked.time - checkedAtFirst.time) / (STEP_MS * MOTION.every);

        expect(checked.time).toBeGreaterThan(checkedLast.time);
        expect(checked.checks - checkedAtFirst.checks).toBeGreaterThanOrEqual(Math.floor(due) - 1);
        expect(checked.checks - checkedAtFirst.checks).toBeLessThanOrEqual(Math.ceil(due) + 1);
        checkedLast = checked;
    }

    // What the host sent the guest a second, all told, and of that its motion
    const sent = await host.evaluate((first) => {
        const { sent } = window.pellagos.game.hosting;
        const seconds = (performance.now() - first.at) / 1000;
        const per = (kind) => ((sent[kind] ?? 0) - (first[kind] ?? 0)) / seconds;

        return { all: Object.keys(sent).reduce((sum, kind) => sum + per(kind), 0), motion: per("motion"), ops: per("ops") };
    }, sentAtFirst);

    test.info().annotations.push({ type: "bandwidth", description: `host to one joined: ${(sent.all / 1000).toFixed(2)} KB/s (motion ${(sent.motion / 1000).toFixed(2)}, ops ${(sent.ops / 1000).toFixed(2)})` });
    expect(sent.motion).toBeGreaterThan(0);
    expect(sent.all).toBeLessThan(10000);

    // The guest's overlay says how the link's going
    await expect(guest.locator("#debugstats")).toContainText(/Net joined: RTT \d+ ms/, { timeout: 10000 });

    // The host's world stopped, all it did sent: the guest's copy comes to just the same
    await host.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.hosting.flush();
    });

    const hostWorld = await host.evaluate(() => {
        const { game } = window.pellagos;

        return { time: game.battle.time, sum: game.host.checksum(), at: game.battle.actors.map(({ id, x, y }) => `${id} ${x.toFixed(3)} ${y.toFixed(3)}`) };
    });

    await expect.poll(() => guest.evaluate(() => window.pellagos.game.battle.time), { timeout: 30000 }).toBe(hostWorld.time);

    const guestWorld = await guest.evaluate(() => {
        const { game } = window.pellagos;

        return { time: game.battle.time, sum: game.host.checksum(), at: game.battle.actors.map(({ id, x, y }) => `${id} ${x.toFixed(3)} ${y.toFixed(3)}`), desyncs: game.remote.desyncs, resyncs: game.remote.resyncs - game.remote.skips };
    });

    expect(guestWorld).toEqual({ ...hostWorld, desyncs: 0, resyncs: 0 });

    await hostContext.close();
    await guestContext.close();
});

test("a world joined in the thick of an invasion: the guest's game holds no more of its soldiers in full than there's room for, the rest drawn in their crowds as their figures are made, the fallen never dressed; the figures of the kinds of those near her made while she loads, so they're seen from the first frame; and only Wenches and Ale's floors built, though the world comes with others' plans", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    // (Both on Low, as the iPhone that let the game's tab go joining such a world was: 132 of its
    // soldiers dressed in full before the first frame, 582 MB, and 59 buildings' floors, 87 MB)
    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), { ...ELF, hero: { ...ELF.hero, name: "Ada", race: "human" } });

    // The host plays, the buildings round the start town's square got ready (their plans made),
    // and northmen fall on the town, as small an invasion as comes
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.evaluate((least) => {
        const { game } = window.pellagos;

        game.host.command(game.me, { type: "budget", invasion: least });
        game.invade("northmen");
    }, SIZE.least);
    await host.waitForFunction(() => window.pellagos.game.battle.actors.filter(({ id }) => id.startsWith("invasion-")).length >= 20, null, { timeout: 60000, polling: 500 });
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();

    await invite.getByRole("button", { name: "Back to the game" }).click();

    // Ada comes in, in the midst of it: the invasion's soldiers not dressed in full before the
    // first frame, but as there's room for them; and none of the buildings' floors built but
    // Wenches and Ale's (no other's door near her), though the world she's sent comes with their
    // plans
    await guest.goto(`/?join=${code}`);
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);

    // (`fell`: those fallen a while before, by id)
    const held = (fell = []) =>
        guest.evaluate((fell) => {
            const { game } = window.pellagos;
            const inFull = (id) => game.avatars.has(id) && !game.crowds?.members.has(game.avatars.get(id));
            const invasion = game.battle.actors.filter(({ id, kind }) => kind === "soldier" && id.startsWith("invasion-"));
            const planned = Object.values(game.world.maps).filter(({ building }) => building);

            return {
                soldiers: invasion.filter(({ dead }) => !dead).length,
                inFull: invasion.filter(({ id }) => inFull(id)).length,
                crowded: invasion.filter(({ id }) => game.crowds?.members.has(game.avatars.get(id))).length,
                bodies: [...game.avatars.keys()].filter(inFull).length,
                room: game.marshalled?.room ?? game.view.quality.soldiers.full,
                budget: game.view.quality.bodies,
                planned: planned.length,
                // (A floor held of a building got ready, not built: its door far off)
                stray: [...game.interiors.keys()].filter((id) => game.world.maps[id]?.building && game.visits.get(game.world.maps[id].building)?.bare !== false),
                floors: [...game.interiors.keys()].filter((id) => !game.world.maps[id]?.building).sort(),
                // (Those fallen a while before still in line to be dressed, or waiting on their
                // figure: none, the line looked at again since; those drawn in full seen to fall)
                fallen: fell.filter((id) => game.enlisting.includes(id) || game.crowdWaiting.has(id)).length,
                // (Those of it within 60 metres of her, FIGURES.reach: their kinds, and those of a
                // kind whose figure's made not drawn at all)
                near: (() => {
                    const me = game.battle.actor(game.me);
                    const them = invasion.filter(({ id, dead, map, x, y }) => !dead && map === me.map && Math.hypot(x - me.x, y - me.y) <= 60 && game.host.soldiers.has(id));
                    const kindOf = ({ id, weapon }) => {
                        const { people = "human", sex = "m", weapon: held = weapon } = game.host.soldiers.get(id);

                        return `${people}:${sex}:${held}`;
                    };
                    const kinds = new Set(them.map(kindOf));

                    return { soldiers: them.length, kinds: kinds.size, made: [...kinds].filter((key) => game.crowds?.made(key)).length, unseen: them.filter((actor) => game.crowds?.made(kindOf(actor)) && !game.avatars.has(actor.id)).map(({ id }) => id) };
                })(),
                mustering: game.timings.figures ?? 0,
            };
        }, fell);

    const joined = await held();

    expect(joined.soldiers).toBeGreaterThanOrEqual(20);
    expect(joined.inFull, JSON.stringify(joined)).toBeLessThanOrEqual(joined.room + 3);

    // (Those near her seen from the first frame: their kinds' figures made while she loaded, the
    // nearest first, for at most 10 seconds (FIGURES.most); and everyone of a kind made drawn in
    // their crowd, those nearest built in full in their place, drawn in it till they are. Any
    // still not drawn, of a kind made, come since the marshal last looked (twice a second:
    // MARSHAL.every), and drawn when it next does: a second and a half on, none)
    expect(joined.near.soldiers, JSON.stringify(joined)).toBeGreaterThan(0);
    expect(joined.near.made, JSON.stringify(joined)).toBeGreaterThan(0);
    expect(joined.crowded, JSON.stringify(joined)).toBeGreaterThan(0);
    expect(joined.mustering).toBeLessThan(11000);

    await guest.waitForTimeout(1500);
    expect(
        await guest.evaluate((ids) => ids.filter((id) => window.pellagos.game.battle.actor(id) && !window.pellagos.game.battle.actor(id).dead && !window.pellagos.game.avatars.has(id)), joined.near.unseen),
        JSON.stringify(joined),
    ).toEqual([]);
    expect(joined.planned).toBeGreaterThan(0);
    expect(joined.stray).toEqual([]);
    expect(joined.floors).toEqual(["taproom", "upstairs"]);

    // As it's played: no more of them in full than the marshal has room for (and a few let go of
    // as it goes), nor of everyone than the quality's budget; the rest come into their crowds as
    // their figures are made; and once some have fallen, none of those dressed
    await guest.waitForFunction(() => window.pellagos.game.crowds?.members.size > 0, null, { timeout: 180000, polling: 1000 });
    await guest.waitForFunction(() => window.pellagos.game.battle.actors.filter(({ id, kind, dead }) => kind === "soldier" && id.startsWith("invasion-") && dead).length >= 3, null, { timeout: 180000, polling: 1000 });

    // (Those fallen by now; and a second and a half on, the line looked at again since)
    const fell = await guest.evaluate(() => window.pellagos.game.battle.actors.filter(({ id, kind, dead }) => kind === "soldier" && id.startsWith("invasion-") && dead).map(({ id }) => id));

    await guest.waitForTimeout(1500);

    const later = await held(fell);

    expect(later.crowded).toBeGreaterThan(0);
    expect(later.inFull, JSON.stringify(later)).toBeLessThanOrEqual(later.room + 3);
    expect(later.bodies, JSON.stringify(later)).toBeLessThanOrEqual(later.budget);
    expect(later.fallen).toBe(0);
    expect(later.stray).toEqual([]);

    await hostContext.close();
    await guestContext.close();
});

test("two players in a party on the maps: what each had found before is the other's as they join, told; on the minimap the other's a dot in their own colour, as on their icon, and far off a badge at its edge with their initial and an arrow the way they are, tapped to say who and where; on the world map a pin with their name", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), BRYN);
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();

    await invite.getByRole("button", { name: "Back to the game" }).click();
    await guest.goto(`/?join=${code}`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect(host.locator("#banner")).toContainText("Bryn has come into the world", { timeout: 30000 });

    // (Bryn had been somewhere Ada hasn't, far off: the same in both worlds)
    const far = await host.evaluate(() => {
        const me = window.pellagos.game.battle.actor("player");

        return [me.x + 64 * 12 + 32, me.y + 32];
    });

    for (const page of [host, guest]) {
        await page.evaluate(([x, y]) => window.pellagos.game.host.players.get("guest-1").explored.visit(x, y), far);
    }

    expect(await host.evaluate(([x, y]) => window.pellagos.game.explored.visitedAt(x, y), far)).toBe(false);

    // Asked and joined: Bryn's map Ada's too, and told so
    const menu = host.getByRole("dialog", { name: "Party" });
    const asking = menu.locator('.party-others .party-player[data-id="guest-1"] .party-invite');
    const asked = guest.getByRole("dialog", { name: /asks you to join their party\./ });

    await host.locator("#partybutton").click();
    await asking.click();
    await expect(asked).toBeVisible({ timeout: 30000 });
    await asked.getByRole("button", { name: "Accept" }).click();
    await expect(menu.locator('.party-players .party-player[data-id="guest-1"] .party-swatch')).toHaveAttribute("style", /background/, { timeout: 30000 });
    await menu.getByRole("button", { name: "Close" }).click();

    // (In each world, the host's and the guest's: told, if it isn't so, what that world has of it,
    // Ada's and Bryn's maps there, the party each is in and how often the guest's been sent the
    // world again)
    for (const [whose, page] of [
        ["the host's", host],
        ["the guest's", guest],
    ]) {
        const there = () =>
            page.evaluate(([x, y]) => {
                const { game } = window.pellagos;
                const been = (id) => game.host.players.get(id)?.explored.visitedAt(x, y) ?? null;

                return { ada: been("player"), bryn: been("guest-1"), parties: [game.host.partyIds?.get("player") ?? null, game.host.partyIds?.get("guest-1") ?? null], sentAgain: game.remote?.resyncs ?? null };
            }, far);

        await expect.poll(there, { message: `Bryn's land on Ada's map in ${whose} world`, timeout: 30000, intervals: [250] }).toMatchObject({ ada: true });
    }

    expect(await host.evaluate(([x, y]) => window.pellagos.game.explored.visitedAt(x, y), far)).toBe(true);
    await host.waitForFunction(() => window.pellagos.game.messages.some((message) => (message.text ?? String(message)).startsWith("Bryn's map is yours too: ")), null, { timeout: 30000, polling: 250 });

    // On the minimap, each the other in their own colour (their place in the party: Ada first,
    // Bryn second), as their icon's framed
    await host.waitForFunction(() => window.pellagos.game.minimap.party?.length === 1, null, { timeout: 30000, polling: 250 });
    expect(await host.evaluate(() => ({ drawn: window.pellagos.game.minimap.party.map(({ id, edge }) => ({ id, edge })), view: window.pellagos.game.partyView().map(({ id, name, colour }) => ({ id, name, colour })) }))).toEqual({ drawn: [{ id: "guest-1", edge: false }], view: [{ id: "guest-1", name: "Bryn", colour: PARTY_COLOURS[1] }] });
    expect(await guest.evaluate(() => window.pellagos.game.partyView().map(({ id, colour }) => ({ id, colour })))).toEqual([{ id: "player", colour: PARTY_COLOURS[0] }]);
    await expect(host.locator('#party .member[data-id="guest-1"]')).toHaveAttribute("style", new RegExp(`--member-colour: ${PARTY_COLOURS[1]}`), { timeout: 30000 });

    // Bryn runs off west, past what the minimap shows: at its edge, the way Bryn is
    await guest.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.mapTap({ x: me.x - 110, z: me.y, run: true });
    });
    await host.waitForFunction(() => window.pellagos.game.minimap.party?.[0]?.edge === true, null, { timeout: 90000, polling: 250 });

    // Tapped there: who it is, and which way
    const badge = await host.evaluate(() => {
        const { minimap } = window.pellagos.game;
        const rect = minimap.canvas.getBoundingClientRect();
        const [{ x, y }] = minimap.party;

        return [rect.left + x, rect.top + y, x < rect.width / 2];
    });

    expect(badge[2], "(west: on the left)").toBe(true);
    await host.mouse.click(badge[0], badge[1]);
    await expect(host.locator("#banner")).toContainText(/Bryn: .*west/, { timeout: 10000 });

    // On the world map: Bryn's pin, with Bryn's name
    await host.keyboard.press("m");
    await host.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn?.party?.includes("guest-1"), null, { timeout: 30000, polling: 250 });

    await hostContext.close();
    await guestContext.close();
});

test("a request shared with the party from the journal: in a party, each request has its Share; shared, the other's given it as it stands and told who shared it, their journal saying so; shared again, they're said to have it", async ({ ownBrowser: browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    await cheaply(host, guest);

    for (const page of [host, guest]) {
        page.on("pageerror", (error) => {
            throw error;
        });
    }

    await guest.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), BRYN);
    await host.goto("/?play&seed=2");
    await playing(host);
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();

    const invite = host.locator("#invite");

    await expect(invite.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await invite.locator("#invitecode").textContent();

    await invite.getByRole("button", { name: "Back to the game" }).click();
    await guest.goto(`/?join=${code}`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join" }).click();
    await playing(guest);
    await expect(host.locator("#banner")).toContainText("Bryn has come into the world", { timeout: 30000 });

    // A bounty the host carries (taken in both worlds alike), part done
    const { name, home } = await host.evaluate(() => {
        const { game } = window.pellagos;

        return { name: game.host.players.get("player").hero.name, home: { id: game.world.start.id, name: game.world.start.name } };
    });

    for (const page of [host, guest]) {
        await page.evaluate(
            (town) =>
                window.pellagos.game.host.players
                    .get("player")
                    .standing.take({ kind: "bounty", title: "Thin their numbers", from: { id: "reeve", name: "Ann Hale", title: "Reeve", town: town.id, townName: town.name, post: "hall" }, given: 0, state: "open", count: 2, key: "orc", target: { realm: "orc", need: 4 }, text: "Bring down 4 of the orcs.", until: 999, reward: { standing: 28, gold: 16 } }),
            home,
        );
    }

    // Alone, the journal has no Share
    const journal = host.getByRole("dialog", { name: "Journal" });
    const share = journal.getByRole("button", { name: "Share Thin their numbers with your party" });

    await host.keyboard.press("j");
    await expect(journal.locator(".journal-request-title")).toHaveText(["Thin their numbers"]);
    await expect(journal.getByRole("button", { name: "Give up Thin their numbers" })).toBeVisible();
    await expect(share).toHaveCount(0);
    await host.keyboard.press("j");
    await expect(journal).toBeHidden();

    // Asked and joined
    const menu = host.getByRole("dialog", { name: "Party" });
    const asked = guest.getByRole("dialog", { name: /asks you to join their party\./ });

    await host.locator("#partybutton").click();
    await menu.locator('.party-others .party-player[data-id="guest-1"] .party-invite').click();
    await expect(asked).toBeVisible({ timeout: 30000 });
    await asked.getByRole("button", { name: "Accept" }).click();
    await expect(menu.locator('.party-players .party-player[data-id="guest-1"] .party-swatch')).toHaveAttribute("style", /background/, { timeout: 30000 });
    await menu.getByRole("button", { name: "Close" }).click();

    // Shared from the journal: Bryn given it as it stands (2 of 4 felled), and told by whom
    await host.keyboard.press("j");
    await share.click();
    await expect(host.locator("#banner")).toContainText("Shared with Bryn.", { timeout: 30000 });
    await expect(guest.locator("#banner")).toContainText(`${name} shared a request with you: Thin their numbers.`, { timeout: 30000 });

    for (const page of [host, guest]) {
        expect(await page.evaluate(() => window.pellagos.game.host.players.get("guest-1").standing.requests.map(({ kind, count, until, shared }) => ({ kind, count, until, shared })))).toEqual([{ kind: "bounty", count: 2, until: 999, shared: name }]);
    }

    const theirs = guest.getByRole("dialog", { name: "Journal" });

    await guest.keyboard.press("j");
    await expect(theirs.locator(".journal-request-title")).toHaveText(["Thin their numbers"]);
    await expect(theirs.locator(".journal-request-progress")).toContainText(`shared by ${name}`);

    // Shared again: Bryn has it
    await share.click();
    await expect(host.locator("#banner")).toContainText("None of your party could take it. Bryn has it already.", { timeout: 30000 });
    expect(await guest.evaluate(() => window.pellagos.game.standing.requests.length)).toBe(1);

    await hostContext.close();
    await guestContext.close();
});
