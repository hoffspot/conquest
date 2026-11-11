// The end-to-end tests' `test`: Playwright's, but each test in a browser of its own (`ownBrowser`,
// its `page` in it), closed when the test's done; and what the specs that play the game share: the
// game opened and waited for (`playing`), played on without drawing (`playUntil`), looked down on
// (`overlook`), and drawn as a test needs it, or not at all (`keeping`, `undrawn`).
//
// Drawing without a GPU (SwiftShader) is done in the browser's GPU process, which every page in
// a browser shares; a page's drawing is queued there and done in its own time, so a test that
// draws faster than it can be done (frames asked for in a loop, a second or more of work each)
// leaves it working for a minute after its page is closed, and the next test, in the same browser,
// gets its world ready and drawn at half the speed or less: on CI's slower machines, past its
// time. A browser of its own for each test, its GPU process gone with it, starts each the same.
// (Launched as the configuration says; its page made with the test's options, the viewport,
// touch and the rest, as `test.use` sets them.)
//
// Drawn cheaply unless a test says otherwise. Drawing in software is nearly all of a test's time:
// at the tests' own size (1000 by 600 at half scale), the town settled, the game makes 0.4 frames
// a second at High from where the camera starts (looking out across the land), 1.1 looking down
// on the player, and 2.1 at Low without shadows looking down; and takes 36 s to load at High, 28
// at Low. So the test's `page` keeps the game's settings as CHEAP before it loads, where the
// test keeps none of its own, and `playing` looks down once the game's playing. A test of what's
// drawn at a higher quality, of shadows, or of the view the camera starts in, asks for what it
// needs (`playing`'s `quality`, `shadows` and `view`, or `keeping`; a whole spec of what's drawn,
// `test.use({ drawing: "full" })`), and says why.

import { writeFile } from "node:fs/promises";
import { expect, test as base } from "@playwright/test";

// Where the game keeps its settings (app/save.js)
const SETTINGS = "pellagos.settings";

/** How a test's game is drawn unless it says otherwise: at Low, without shadows (world/view.js QUALITY). */
export const CHEAP = Object.freeze({ quality: "low", shadows: false });

/**
 * `playing`'s options for a test of what's drawn that needs all of it: the game drawn as it draws
 * left to itself (the quality it chooses for the device: High on the tests' computer; shadows),
 * seen from where its camera starts.
 */
export const FULL = Object.freeze({ quality: "auto", shadows: true, view: "start" });

// How far the camera looks down on the player once a test's game is playing (degrees: where the
// camera once started, world/view.js LOOK_UP.down), and from how far (metres: DISTANCE.start)
const DOWN = Object.freeze({ pitch: 35, distance: 10.5 });

// How long a failed test's pages are each given to say how their games stand, and to be pictured (ms)
const TOLD_WITHIN = 5000;
const PICTURED_WITHIN = 20000;

// A page drawn cheaply: the game's settings kept as CHEAP before it loads, unless it keeps settings
// already (a test's own, kept after this by its own script, take their place)
async function cheaply(page) {
    await page.addInitScript(
        ([key, cheap]) => {
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, cheap);
            }
        },
        [SETTINGS, JSON.stringify(CHEAP)],
    );
}

/**
 * The game's settings as a test needs them, kept before its page loads (app/save.js): `settings`
 * over the tests' cheap drawing, which they take the place of only where they say otherwise
 * (`quality`: "medium" or "high", or "auto" for the game's own choice for the device, as a
 * player's is before they choose; `shadows`: true), for a test of what's drawn. Laid down only
 * while the page keeps none but the tests' own, so what the game keeps as it's played stays from
 * load to load, as a device keeps it.
 */
export async function keeping(page, settings = {}) {
    await page.addInitScript(
        ([key, cheap, own]) => {
            const kept = localStorage.getItem(key);

            if (!kept || kept === cheap) {
                localStorage.setItem(key, own);
            }
        },
        [SETTINGS, JSON.stringify(CHEAP), JSON.stringify({ ...CHEAP, ...settings })],
    );
}

/**
 * A page's world no longer drawn, its game going on as ever, for a test that looks at nothing drawn
 * (the menus, the chat, what's said). Without a GPU, drawing is most of every frame: two games
 * drawing side by side make 3 or 4 frames a second each, and each click waits on a frame or two,
 * where undrawn they make 20.
 */
export async function undrawn(page) {
    await page.evaluate(() => {
        window.pellagos.game.view.renderer.render = () => {};
    });
}

/**
 * The camera looking down on the player from higher (35 degrees from 10.5 m, at their middle: as it
 * started before it started close behind them, and then 12 degrees down from as far, over their
 * head: camera.js startPitch, view.js startDistance, lookUpFor), for a test of tapping or holding
 * on what's about them: seen from close behind them, what's a few metres straight ahead of them,
 * the way the camera looks, is behind them on the screen, and a tap on it is on them. (Played on a
 * frame, so the camera's there.) `playing` leaves the camera so; this is for a test that's moved
 * it since, or let the game move it.
 */
export async function overlook(page) {
    await page.evaluate(({ pitch, distance }) => {
        const { game, session } = window.pellagos;

        game.cameraFollow.pitch = pitch;
        session.view.distance = distance;
        session.view.zoomTo = null;
        game.advance(1 / 30);
    }, DOWN);
}

/**
 * Wait for a page's game to be playing, opened at `address` first if one's given (checking on a
 * timer: a page with nothing changing on it may draw no frames). If it isn't in time, what the
 * loading screen says, and the page's errors, are in the failure.
 *
 * Then the camera's turned to look down on the player (`view: "down"`: as `overlook` has it, but
 * for how far back it is, left as the game starts it; the world played on a frame without drawing
 * it, so the camera's there), which is far quicker to draw in software than the view the game
 * starts in, out across the land. A test of that view, or of how the camera starts and moves,
 * asks for `view: "start"`.
 *
 * `quality` and `shadows`: the game drawn so, not cheaply (`keeping`), for a test of what's drawn;
 * only with an `address`, as they're kept before the page loads. `timeout` (ms): how long it's
 * given to be playing; two games loading side by side need longer than one.
 */
export async function playing(page, address = null, { timeout = 90000, view = "down", quality, shadows } = {}) {
    const errors = [];
    const failed = (error) => errors.push(error.message);
    const said = (message) => message.type() === "error" && errors.push(message.text());

    if (quality !== undefined || shadows !== undefined) {
        if (!address) {
            throw new Error("playing: `quality` and `shadows` are kept before the page loads, so they need its address (or call `keeping` before the page's opened)");
        }

        await keeping(page, { ...(quality === undefined ? {} : { quality }), ...(shadows === undefined ? {} : { shadows }) });
    }

    page.on("pageerror", failed);
    page.on("console", said);

    try {
        if (address) {
            await page.goto(address);
        }

        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout, polling: 250 });
    } catch (error) {
        const where = await page.evaluate(() => ({ screen: document.body.dataset.screen, status: document.querySelector("#loadstatus")?.textContent, amount: document.querySelector("#loadamount")?.textContent })).catch((reason) => ({ unreadable: String(reason) }));

        throw new Error(`Not playing: ${JSON.stringify(where)}; errors: ${JSON.stringify(errors.slice(0, 5))}`, { cause: error });
    } finally {
        page.off("pageerror", failed);
        page.off("console", said);
    }

    // (The loader counted its steps up to their total, never past it: of a game opened here, not
    // one come into some other way, which may have been left and come into again)
    if (address) {
        const loaded = await page.evaluate(() => window.pellagos.game.loaded);

        expect(loaded.most, `counted to ${loaded.most} of ${loaded.total}`).toBeLessThanOrEqual(loaded.total);
        expect(loaded.done).toBe(loaded.total);
    }

    if (view === "down") {
        await page.evaluate((pitch) => {
            const { game } = window.pellagos;

            if (game?.cameraFollow) {
                game.cameraFollow.pitch = pitch;
                game.advance(1 / 30, { render: false, wait: true });
            }
        }, DOWN.pitch);
    }
}

/**
 * Play on (the game stopped) till `done` (a function run in the page) says so, or `seconds` of the
 * game's time go by: whether it did. Half a second at a time, a frame at a time, the page's events
 * let in between them as between frames, so what's done elsewhere (skins painted in a worker)
 * comes back to be waited on, as in play; with `realTime`, no faster than the clock.
 */
export async function playUntil(page, done, { seconds = 30, realTime = false } = {}) {
    const start = Date.now();

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

        // (`realTime`: never played ahead of the clock, as a player plays it, for what takes the
        // time it really takes: the downloader keeps to a rate, in real time, not the game's)
        if (realTime) {
            await page.waitForTimeout(Math.max(0, (time + 0.5) * 1000 - (Date.now() - start)));
        }
    }

    return page.evaluate(done);
}

// How a page's game stands, as the game can say it: the screen it's on and what its loading
// screen says; what it's telling the player, and the messages kept for the journal; where the
// player is, what they're doing, and who's within 40 m of them; how it's drawn; and the debug
// log's text (app/telemetry.js: errors, frames held up, what was lost). Each on its own, so what
// can't be read leaves the rest
function stateOf() {
    const tried = (read) => {
        try {
            return read();
        } catch (error) {
            return `unreadable: ${error?.message ?? error}`;
        }
    };
    const text = (selector) => document.querySelector(selector)?.textContent ?? null;
    const round = (value) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : (value ?? null));
    const pellagos = window.pellagos;
    const game = tried(() => pellagos?.game ?? null);
    const live = game && typeof game === "object" ? game : null;
    const me = tried(() => live?.battle?.actor(live.me) ?? null);
    const actor = (one, from) => ({
        id: one.id,
        kind: one.kind,
        map: one.map,
        x: round(one.x),
        y: round(one.y),
        hp: round(one.hp),
        dead: Boolean(one.dead),
        order: one.order?.type ?? null,
        target: one.target ?? null,
        drawn: live.avatars?.has(one.id) ?? null,
        ...(from ? { away: round(Math.hypot(one.x - from.x, one.y - from.y)) } : {}),
    });

    return {
        state: {
            address: location.href,
            screen: document.body?.dataset.screen ?? null,
            loading: { status: text("#loadstatus"), amount: text("#loadamount") },
            playing: tried(() => pellagos?.playing ?? null),
            running: tried(() => live?.running ?? null),
            banner: tried(() => (document.querySelector("#banner")?.hidden === false ? text("#banner") : null)),
            talking: tried(() => live?.talking?.id ?? null),
            messages: tried(() => live?.messages?.map(({ text }) => text) ?? null),
            time: tried(() => round(live?.battle?.time)),
            map: tried(() => live?.mapId ?? null),
            player: tried(() => (me && typeof me === "object" ? actor(me) : me)),
            near: tried(() =>
                me && typeof me === "object"
                    ? live.battle.actors
                          .filter((one) => one !== me && one.map === me.map && Math.hypot(one.x - me.x, one.y - me.y) <= 40)
                          .map((one) => actor(one, me))
                          .sort((a, b) => a.away - b.away)
                          .slice(0, 40)
                    : null,
            ),
            camera: tried(() => (live?.cameraFollow ? { yaw: round(live.cameraFollow.yaw), pitch: round(live.cameraFollow.pitch), distance: round(live.view.distance) } : null)),
            drawing: tried(() => (live?.view ? { quality: live.view.qualityName, shadows: live.view.shadowsOn ?? null, pixels: round(live.view.renderer.getPixelRatio()) } : null)),
        },
        log: tried(() => pellagos?.telemetry?.text() ?? null),
    };
}

// A failed test's games, each as it can say it stands (stateOf), kept with the test's results:
// `game-<page>.json`, and the debug log's text as `debug-log-<page>.json`; and a picture of each
// page, `page-<page>.png`, where Playwright's own (the configuration's `screenshot`) didn't come:
// it gives a page 5 seconds, less than a frame can take here, so the game's frames are stopped
// first. Never failing itself: a page that's gone, or too busy to answer in time, is left out
async function tellOf(browser, testInfo) {
    try {
        const pages = browser.contexts().flatMap((context) => context.pages());
        const pictured = testInfo.attachments.some(({ name }) => name === "screenshot");
        const keep = (name, file, contentType) => testInfo.attachments.push({ name, path: file, contentType });

        for (const [index, page] of pages.entries()) {
            let timer = null;
            const told = await Promise.race([page.evaluate(stateOf).catch(() => null), new Promise((resolve) => (timer = setTimeout(resolve, TOLD_WITHIN, null)))]);

            clearTimeout(timer);

            if (!told) {
                continue;
            }

            for (const [name, body] of [
                ["game", JSON.stringify(told.state, null, 2)],
                ["debug-log", told.log],
            ]) {
                if (typeof body === "string") {
                    const file = testInfo.outputPath(`${name}-${index + 1}.json`);

                    await writeFile(file, body);
                    keep(`${name}-${index + 1}`, file, "application/json");
                }
            }

            if (!pictured) {
                const file = testInfo.outputPath(`page-${index + 1}.png`);

                await page.evaluate(() => window.pellagos?.game?.view?.renderer.setAnimationLoop(null)).catch(() => {});
                await page
                    .screenshot({ path: file, timeout: PICTURED_WITHIN })
                    .then(() => keep(`page-${index + 1}`, file, "image/png"))
                    .catch(() => {});
            }
        }
    } catch {
        // (What couldn't be told is only missing from the failure: the test's own is what's reported)
    }
}

export const test = base.extend({
    // How the test's `page` draws the game: "cheap" (CHEAP, unless the test keeps settings of its
    // own), or "full", as the game draws it left to itself, for a spec that's all about what's
    // drawn: `test.use({ drawing: "full" })`, saying why
    drawing: ["cheap", { option: true }],

    ownBrowser: async ({ playwright, browserName, headless, launchOptions }, use, testInfo) => {
        const browser = await playwright[browserName].launch({ headless, ...launchOptions });

        try {
            await use(browser);

            // (A test that failed or ran out of time: how its games stood, kept with its results)
            if (testInfo.status !== testInfo.expectedStatus) {
                await tellOf(browser, testInfo);
            }
        } finally {
            await browser.close();
        }
    },

    page: async ({ ownBrowser, contextOptions, viewport, baseURL, hasTouch, isMobile, deviceScaleFactor, userAgent, locale, drawing }, use) => {
        const context = await ownBrowser.newContext({ ...contextOptions, viewport, baseURL, hasTouch, isMobile, deviceScaleFactor, userAgent, locale });
        const page = await context.newPage();

        if (drawing === "cheap") {
            await cheaply(page);
        }

        await use(page);
    },
});

export { expect };
