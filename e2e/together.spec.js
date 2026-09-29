import { expect, test } from "@playwright/test";

// Playing together (docs/WAR.md M11), in two browsers at once: one player opens their world to
// others from the menu, and is given a code; another, an elf, joins it by the code from the title,
// and comes into the world by their own people's town, as the host has it; what the one who's
// joined does is done in the host's world; they leave, and are gone from it; the host closes the
// world to others, and anyone still in it is told.

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

test("a world opened to others: an elf joins it by its code, is brought in by the elves' town, walks in the host's world, and leaves; closed, whoever's in it is told", async ({ browser }) => {
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

    // The host plays, and opens their world from the menu: a code, and a link to join by
    await host.goto("/?play&seed=2");
    await playing(host);
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

    // (Their copy's kept as the host's: never sent again)
    expect(await guest.evaluate(() => window.pellagos.game.remote.resyncs)).toBe(0);

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

test("two players side by side trade face to face: one asks, the other says yes, each offers, both agree, and it changes hands in both worlds", async ({ browser }) => {
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

    expect(await guest.evaluate(() => window.pellagos.game.remote.resyncs)).toBe(0);

    await hostContext.close();
    await guestContext.close();
});
