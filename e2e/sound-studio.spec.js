import { expect, test } from "./fixtures.js";

// The sound studio (sound-studio.html): every sound the game makes described (audio/catalog.js)
// and played as the game plays it. It exposes itself as window.soundStudio, which this test uses

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

test("describes every sound, and plays each, its recordings and its made variants (if it has any), once started", async ({ page }) => {
    await page.goto("/sound-studio.html");

    const cards = await page.evaluate(async () => {
        const { CATALOG, LOOPS, MUSIC } = await import("./js/audio/catalog.js");

        return { shown: document.querySelectorAll(".card").length, described: Object.keys(CATALOG).length + Object.keys(LOOPS).length + Object.keys(MUSIC).length };
    });

    // (Each sound, the beds made in code (the wind, a hell's drone and heart), and the music in
    // each place)
    expect(cards.shown).toBe(cards.described);
    await expect(page.locator('.card[data-name="stepStone"] .badge')).toHaveText("Recorded");
    await expect(page.locator('.card[data-name="stepStone"] .source a').first()).toHaveAttribute("href", /^https:\/\/freesound\.org\/s\/\d+\/$/);
    await expect(page.locator('.card[data-name="stun"] .badge')).toHaveText("Made in code");

    // Started with a tap, it makes the sounds and downloads the recordings
    await page.locator("#start").click();
    await expect(page.locator("#status")).toHaveText(/^Ready: \d+ sounds, \d+ recordings/, { timeout: 60000 });

    const played = await page.evaluate(async () => {
        const { CATALOG } = await import("./js/audio/catalog.js");
        const { RECORDED } = await import("./js/audio/recorded.js");
        const { SOUNDS } = await import("./js/audio/synth.js");
        const { sound, play } = window.soundStudio;
        const silent = [];

        for (const name of Object.keys(CATALOG)) {
            const tries = [play(name), ...(SOUNDS[name] ? [play(name, { variant: 0, made: true })] : []), ...(RECORDED[name] ? [play(name, { variant: RECORDED[name].length - 1 })] : [])];

            if (tries.some((source) => !source)) {
                silent.push(name);
            }

            // (Fewer at once than can sound together)
            sound.sounding.length = 0;
        }

        return { silent, recorded: sound.recorded.get("stepStone")?.length, state: sound.context.state };
    });

    expect(played.silent).toEqual([]);
    expect(played.recorded).toBeGreaterThanOrEqual(4);

    // A card's own button plays it; searching narrows the cards
    await page.locator('.card[data-name="slash"] button.primary').click();
    await page.locator("#search").fill("anvil");
    await expect(page.locator(".card:visible")).toHaveCount(1);
    await expect(page.locator(".card:visible")).toHaveAttribute("data-name", "anvil");

    // A bed's started looping as the game loops it, and stopped
    await page.locator("#search").fill("");
    await page.locator('.card[data-name="windOpen"] button.primary').click();
    await expect(page.locator('.card[data-name="windOpen"] button.primary')).toHaveText("■ Stop");
    await expect.poll(() => page.evaluate(() => window.soundStudio.sound.beds.get("windOpen")?.copies.length ?? 0)).toBeGreaterThan(0);
    await page.locator('.card[data-name="windOpen"] button.primary').click();
    expect(await page.evaluate(() => window.soundStudio.sound.beds.get("windOpen").gain)).toBe(0);

    // A bed made in code (a hell's drone) made in a worker once it's wanted, and looped, as low as
    // in the Pit
    const pit = await page.evaluate(async () => (await import("./js/audio/ambience.js")).INDOORS.hellPit.rates.hellDrone);

    await page.locator('.card[data-name="hellDrone"] button', { hasText: "a hell's Pit" }).click();
    await expect(page.locator('.card[data-name="hellDrone"] button.primary')).toHaveText("■ Stop");
    await expect.poll(() => page.evaluate(() => window.soundStudio.sound.beds.get("hellDrone")?.copies.length ?? 0), { timeout: 10000 }).toBe(1);
    expect(await page.evaluate(() => {
        const [looped] = window.soundStudio.sound.beds.get("hellDrone").copies;

        // (Its rate as the browser keeps it, to three places)
        return { loop: looped.loop, rate: Math.round(looped.playbackRate.value * 1000) / 1000, seconds: looped.buffer.duration };
    })).toEqual({ loop: true, rate: pit, seconds: 8 });
    await page.locator('.card[data-name="hellDrone"] button.primary').click();
    expect(await page.evaluate(() => window.soundStudio.sound.beds.get("hellDrone").gain)).toBe(0);

    // A people's music (the elves'), its recordings downloaded once it's wanted, faded over to
    // once they're in, and played
    await page.locator('.card[data-name="music:elves"] button.primary').click();
    await expect.poll(() => page.evaluate(() => window.soundStudio.sound.music?.name), { timeout: 30000 }).toBe("elves");
    await expect.poll(() => page.evaluate(() => window.soundStudio.sound.music.index), { timeout: 15000 }).toBeGreaterThan(0);
    expect(await page.evaluate(() => ["flute 72", "violins 69"].every((id) => window.soundStudio.sound.instruments.has(id)))).toBe(true);
});
