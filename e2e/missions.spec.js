import { expect, test } from "./fixtures.js";

// The war's messengers and the missions they bring (core/missions.js, core/host.js, app/game.js),
// in a real browser: one sent to a player near an enemy camp walks up, drawn, and hails them, and
// tapped, talks; taken, it's in the journal's War missions and on the world map; the camp broken,
// it's paid on the spot and the pick of the armoury offered, the piece picked in the pack; and the
// Game options switch that turns messengers away

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

async function playing(page, address) {
    await page.goto(address);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
}

// Play on (the game stopped) till `done` (run in the page) says so, or `seconds` of the game's
// time go by: whether it did. Half a second at a time, the page's events let in between frames
async function playUntil(page, done, seconds = 30) {
    for (let time = 0; time < seconds; time += 0.5) {
        if (await page.evaluate(done)) {
            return true;
        }

        await page.evaluate(async () => {
            const { game } = window.pellagos;

            for (let k = 0; k < 15; k++) {
                game.advance(1 / 30, { render: false, wait: true });
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        });
    }

    return page.evaluate(done);
}

test("a messenger from the ruler finds the player near an enemy camp: the mission taken, in the journal and on the map; the camp broken, paid on the spot, and a piece from the armoury picked", async ({ page }) => {
    // (The messenger's walk up played out, and the camp's end: past the usual time)
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // (The switch in Game options, Chat and players: on to start with)
    await page.locator("#menubutton").click();

    for (const button of ["#optionsbutton", "#chatbutton"]) {
        await page.locator(button).click();
    }

    await expect(page.locator("#messengerswitch")).toBeChecked();

    for (const button of ["#chatback", "#optionsback", "#resumebutton"]) {
        await page.locator(button).click();
    }

    // An orcish camp 400 m out from the start town, at war with the humans, the player 250 m
    // beyond it
    const camp = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { host } = game;
        const { SETTLEMENT_KINDS } = await import("/js/core/setpieces/town.js");
        const { STAGES } = await import("/js/core/war/war.js");
        const middle = host.world.stamp.middle;
        const radius = SETTLEMENT_KINDS[host.world.start.kind].radius;
        const at = [middle[0] + radius + 400, middle[1] + 5];

        game.stop();
        host.war.relations["human|orc"] = { state: "hostile", since: 0 };
        host.war.stage = STAGES.length - 1;
        host.war.camps.push({ id: "camp-900", realm: "orc", at, guard: 6, built: 0, done: 0, toward: host.world.start.id, used: 1e6, skirmished: 1e6 });
        host.battle.place(game.me, "town", [Math.floor(at[0] + 250), Math.floor(at[1])]);

        return { at };
    });

    // The messenger comes, drawn, and hails the player as they get there (the talk not opened
    // over whatever they're doing); tapped, they talk: from the King, what's asked, what it pays
    // at the player's rank and that it pays more the higher it is
    expect(await playUntil(page, () => Boolean(window.pellagos.game.messengerSaid?.size), 90)).toBe(true);
    await expect(page.locator("#banner")).toContainText(/, a messenger from (King|Queen) .+, has found you\. Tap them to hear what they bring\./);
    expect(await page.evaluate(() => Boolean(window.pellagos.game.talking))).toBe(false);

    const messenger = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const [one] = [...game.host.messengers.values()];

        // (Drawn: their figure made as they came, the frames drawn to see them by)
        for (let k = 0; k < 30 && !game.avatars.has(one.folk); k++) {
            game.advance(1 / 30);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        game.advance(1 / 30);

        const drawn = game.avatars.has(one.folk);
        const spot = session.view.toScreen(game.avatars.get(one.folk).point(0.6));

        game.tap(spot.x, spot.y, { time: performance.now() + 9000 });

        return { folk: one.folk, drawn };
    });

    expect(messenger.drawn).toBe(true);
    expect(await playUntil(page, () => Boolean(window.pellagos.game.talking), 10)).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.talking.id)).toBe(messenger.folk);

    const talk = page.locator("#talkline");

    await expect(talk).toContainText(/from (King|Queen) .+ of the Kingdom of/);
    await page.locator(".talk-choice", { hasText: "Go on." }).click();
    await expect(talk).toContainText("have a camp near");
    await page.locator(".talk-choice", { hasText: "And what's in it for me?" }).click();
    await expect(talk).toContainText("120 gold, 60 standing and your pick of three pieces from the armoury (fine), as you're a commoner of ours. The higher your rank with us, the more we give.");
    await page.locator(".talk-choice", { hasText: "Tell them it will be done." }).click();
    await page.locator(".talk-choice").first().click();

    // Taken: in the journal's War missions, and marked on the world map
    const mission = await page.evaluate(() => window.pellagos.game.standing.missions.map(({ title, state, from }) => ({ title, state, from: from.kind })));

    expect(mission).toEqual([{ title: "Break the camp", state: "open", from: "ruler" }]);
    await page.evaluate(() => window.pellagos.game.start());
    await page.locator("#journalbutton").click();

    const journal = page.getByRole("dialog", { name: "Journal" });

    await expect(journal).toContainText("War missions");
    await expect(journal).toContainText("Break the camp");
    await expect(journal.getByRole("button", { name: "Give up" })).toBeVisible();
    await page.locator("#journalbutton").click();
    expect(await page.evaluate(() => window.pellagos.game.requestMarks().some(({ war, label }) => war && label === "Break the camp"))).toBe(true);
    await page.evaluate(() => window.pellagos.game.stop());

    // There, then the camp broken: paid on the spot, and the pick of three from the armoury
    await page.evaluate(([x, y]) => {
        const { game } = window.pellagos;

        game.host.battle.place(game.me, "town", [Math.floor(x - 30), Math.floor(y)]);
    }, camp.at);
    expect(await playUntil(page, () => window.pellagos.game.standing.missions[0]?.there, 10)).toBe(true);

    const gold = await page.evaluate(() => window.pellagos.game.progress.gold);

    await page.evaluate(() => {
        const { camps } = window.pellagos.game.host.war;

        camps.splice(
            camps.findIndex(({ id }) => id === "camp-900"),
            1,
        );
    });
    expect(await playUntil(page, () => Boolean(document.querySelector(".choice")), 10)).toBe(true);
    await expect(page.locator(".choice")).toContainText("Break the camp: your pick from the armoury");
    await expect(page.locator(".choice-option")).toHaveCount(3);
    await expect(page.locator(".choice")).toContainText("Later");
    expect(await page.evaluate(() => window.pellagos.game.progress.gold)).toBe(gold + 120);

    const piece = await page.locator(".choice-option").nth(1).textContent();

    await page.locator(".choice-option").nth(1).click();
    expect(await playUntil(page, () => window.pellagos.game.standing.missionsDone[0]?.state === "done", 5)).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.standing.missions.length)).toBe(0);
    expect(piece.length).toBeGreaterThan(0);
});
