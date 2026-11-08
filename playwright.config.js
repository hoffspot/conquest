// End-to-end tests that play the game in a real browser: npm run test:e2e
// (Install the browser once with: npx playwright install chromium)
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT) || 8095;

export default defineConfig({
    testDir: "e2e",
    // Without a GPU, drawing is done in software, which is slow: give each test time, and on CI
    // run one at a time so they don't slow each other down (CI splits them between jobs run side
    // by side instead: --shard). Every test has a page of its own, in a browser of its own
    // (e2e/fixtures.js), so any of them can run alongside any other, even those in the same file.
    // (Three minutes, and those that set their own half as long again as they took on CI or more:
    // CI's machines can be 1.7 times as slow from one run to the next, and the start view looks
    // out across the land, which is slow to draw in software)
    timeout: 180000,
    workers: process.env.CI ? 1 : undefined,
    fullyParallel: true,
    reporter: process.env.CI ? "github" : "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${port}`,
        viewport: { width: 1000, height: 600 },
        // (Drawn at half the screen's pixels each way: in software, a frame's a fifth quicker or
        // more, and the page laid out the same; a test of the pixels themselves sets its own)
        deviceScaleFactor: 0.5,
        launchOptions: {
            // WebGL through software rendering on machines without a GPU, such as CI; and the game's
            // default world server (app/servers.js DEFAULT_SERVERS) never reached from a test: its
            // name doesn't resolve, so the game finds it unreachable at once
            args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"],
            // Set CHROMIUM_PATH to use an already installed Chromium instead of Playwright's download
            ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        },
    },
    webServer: {
        command: "node server/index.js",
        env: { PORT: String(port) },
        url: `http://localhost:${port}`,
        reuseExistingServer: !process.env.CI,
    },
});
