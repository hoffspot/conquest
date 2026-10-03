// The end-to-end tests' `test`: Playwright's, but each test in a browser of its own (`ownBrowser`,
// its `page` in it), closed when the test's done.
//
// Drawing without a GPU (SwiftShader) is done in the browser's GPU process, which every page in
// a browser shares; a page's drawing is queued there and done in its own time, so a test that
// draws faster than it can be done (frames asked for in a loop, a second or more of work each)
// leaves it working for a minute after its page is closed, and the next test, in the same browser,
// gets its world ready and drawn at half the speed or less: on CI's slower machines, past its
// time. A browser of its own for each test, its GPU process gone with it, starts each the same.
// (Launched as the configuration says; its page made with the test's options, the viewport,
// touch and the rest, as `test.use` sets them.)

import { expect, test as base } from "@playwright/test";

export const test = base.extend({
    ownBrowser: async ({ playwright, browserName, headless, launchOptions }, use) => {
        const browser = await playwright[browserName].launch({ headless, ...launchOptions });

        try {
            await use(browser);
        } finally {
            await browser.close();
        }
    },

    page: async ({ ownBrowser, contextOptions, viewport, baseURL, hasTouch, isMobile, deviceScaleFactor, userAgent, locale }, use) => {
        const context = await ownBrowser.newContext({ ...contextOptions, viewport, baseURL, hasTouch, isMobile, deviceScaleFactor, userAgent, locale });

        await use(await context.newPage());
    },
});

export { expect };
