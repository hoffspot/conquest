import { expect, playing, test } from "./fixtures.js";
import { MEASURE, SERIES } from "../client/js/app/measure.js";
import { MEASURING } from "../client/js/app/measuring.js";
import { PHASES } from "../client/js/app/telemetry.js";

// A measured run (app/measuring.js, docs/GAME.md *Measuring a device*), in a real browser: a link
// with `?measure=<name>&minutes=` measures the game it opens, frame by frame, and leaves a report.
// The run is as long as its frames' own times add up to, so the test waits on the run saying it's
// done, not on the clock.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

test("a measured run: a link's ?measure= counts down twenty seconds of play at one quality and keeps a report of one row with every phase, copied by its button; without it, nothing's measured", async ({ page }) => {
    // (Two games loaded, and twenty seconds of the second measured as the clock goes: a minute and
    // a half here, so twice that and more on a slow runner)
    test.setTimeout(360000);

    // (The game told it isn't under automation, where Adaptive is always off: main.js
    // applyViewSettings. So Adaptive is as a player has it, on, till a run turns it off)
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true }));

    // (Without the parameter: no countdown, no meter, nothing kept, and Adaptive as it's set)
    await playing(page, "/?play&seed=3");
    await expect(page.locator("#measure")).toBeHidden();
    expect(await page.evaluate((key) => [window.pellagos.measured, window.pellagos.game.measure, localStorage.getItem(key), window.pellagos.session.view.adaptive], MEASURING.key)).toEqual([null, null, null, true]);

    // (With it: the game it opens measured once it's under way, Adaptive off for the run)
    await playing(page, "/?play&seed=3&measure=twenty%20seconds&minutes=0.34");
    await expect(page.locator("#measure")).toBeVisible();
    await expect(page.locator("#measure [data-measure-text]")).toHaveText(/^Measur(ing twenty-seconds: 0:\d\d left|ed twenty-seconds: .*)$/);
    expect(await page.evaluate(() => [window.pellagos.measured.meter.minutes, window.pellagos.session.view.adaptive])).toEqual([0.34, false]);

    // (Its frames come as the browser gives them, a few a second drawn in software: twenty
    // seconds of them, however many that is)
    await expect.poll(() => page.evaluate(() => window.pellagos.measured.done), { timeout: 90000 }).toBe(true);

    // (No world server to send it to, the quick start: kept on the device, with a button to copy it)
    await expect(page.locator("#measure [data-measure-text]")).toHaveText("Measured twenty-seconds: kept on this device. Copy it to send it on.");

    const report = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), MEASURING.key);

    await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => (window.copied = text) }));
    await page.locator("#measurecopy").click();
    await expect(page.locator("#measure [data-measure-text]")).toHaveText("Measured twenty-seconds: copied. Paste it wherever you're sending it.");
    expect(JSON.parse(await page.evaluate(() => window.copied))).toEqual(report);
    await page.locator("#measureclose").click();
    await expect(page.locator("#measure")).toBeHidden();

    expect(report).toMatchObject({ measure: MEASURE.version, name: "twenty-seconds", minutes: 0.34, done: true, quality: "low", pixels: 1, world: { map: "town", together: null, players: 1 } });
    expect(report.seconds).toBeGreaterThanOrEqual(20.4);
    expect(report.frames).toBeGreaterThan(3);
    expect(report.device.agent).toContain("Chrome");
    expect(Date.parse(report.began)).toBeGreaterThan(Date.now() - 600000);

    // (One row, the part of a minute it ran, with every phase's four numbers; the frames' own
    // work in it, drawing most of it here; and the steps of the world it played)
    expect(report.rows).toHaveLength(1);

    const [row] = report.rows;

    expect(row).toMatchObject({ minute: 1, frames: report.frames, stepsPlayed: report.stepsPlayed });
    expect(row.over).toHaveLength(MEASURE.over.length);

    for (const name of SERIES) {
        expect(row[name], name).toHaveLength(4);
        expect(row[name].every((ms) => Number.isFinite(ms) && ms >= 0), name).toBe(true);
        expect(row[name][3], `${name}'s worst`).toBeGreaterThanOrEqual(row[name][0]);
        expect(report.total[name].count, name).toBe(name === "perStep" ? report.histograms.perStep.slice(1).reduce((sum, count) => sum + count, 0) : report.frames);
    }

    expect(PHASES.every((name) => name in row)).toBe(true);
    expect(row.draw[0]).toBeGreaterThan(0);
    expect(row.work[0]).toBeGreaterThanOrEqual(row.draw[0]);
    expect(row.interval[0]).toBeGreaterThanOrEqual(row.work[0] * 0.9);
    // (The steps it played are as many as its frames let it: a frame plays two at the most
    // catching up (core/runner.js RUNNER.catchUp), and twenty seconds hold 400 of them, so a
    // machine that draws few frames plays few steps. Held to the frames it drew, not to a number
    // a slow runner can't reach: the owner's ruling, 12 November 2026)
    expect(report.stepsPlayed).toBeGreaterThan(0);
    expect(report.stepsPlayed).toBeLessThanOrEqual(2 * report.frames + 2);
    expect(report.stepsPlayed).toBeGreaterThanOrEqual(0.75 * Math.min(2 * report.frames, 400));
    expect(report.calls.most).toBeGreaterThan(0);

    // (What's held, read every couple of seconds as the memory guard would)
    expect(report.held.every).toBe(MEASURE.every);
    expect(report.held.mb.length).toBeGreaterThan(2);
    expect(report.held.mb.length).toBeLessThanOrEqual(Math.ceil(report.seconds / MEASURE.every) + 1);
    expect(report.heldMB).toBeGreaterThan(10);

    // (Heat and the graphics card: carried, though twenty seconds are too short to draw fewer
    // pixels in, and drawn in software may be too few frames to say how it warmed)
    expect(report).toMatchObject({ gpuBound: null, windows: { cool: { from: 1.7, to: 3.4 }, warm: { from: 18.7, to: 20.4 }, probes: [] } });
    expect(report.heat === null || report.heat > 0).toBe(true);
    expect(report.pixels).toBe(1);

    // (Done: the game's no longer measured)
    expect(await page.evaluate(() => window.pellagos.game.measure)).toBe(null);
});
