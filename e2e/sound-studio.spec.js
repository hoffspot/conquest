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
        const { CATALOG, MUSIC } = await import("./js/audio/catalog.js");

        return { shown: document.querySelectorAll(".card").length, described: Object.keys(CATALOG).length + 1 + Object.keys(MUSIC).length };
    });

    // (Each sound, the wind, and the music in each place)
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
});
