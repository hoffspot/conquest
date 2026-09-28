import { expect, test } from "@playwright/test";

// Playing together (docs/WAR.md M11), in two browsers at once: one player opens their world to
// others from the menu, and is given a code; another, an elf, joins it by the code from the title,
// and comes into the world by their own people's town, as the host has it; what the one who's
// joined does is done in the host's world; they leave, and are gone from it; the host closes the
// world to others, and anyone still in it is told.

// (Two worlds drawn at once, without a GPU: more than the usual time)
test.setTimeout(300000);

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

// Wait for a page's game to be playing (checking on a timer)
async function playing(page) {
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 120000, polling: 250 });
}

test("a world opened to others: an elf joins it by its code, is brought in by the elves' town, walks in the host's world, and leaves; closed, whoever's in it is told", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

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
