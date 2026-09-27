// End-to-end tests that play the game in a real browser: npm run test:e2e
// (Install the browser once with: npx playwright install chromium)
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT) || 8095;

export default defineConfig({
    testDir: "e2e",
    // Without a GPU, drawing is done in software, which is slow: give each test time, and on CI
    // run one at a time so they don't slow each other down (CI splits them between jobs run side
    // by side instead: --shard). Every test has a page of its own, so any of them can run
    // alongside any other, even those in the same file
    timeout: 120000,
    workers: process.env.CI ? 1 : undefined,
    fullyParallel: true,
    reporter: process.env.CI ? "github" : "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${port}`,
        viewport: { width: 1000, height: 600 },
        launchOptions: {
            // WebGL through software rendering on machines without a GPU, such as CI
            args: ["--enable-unsafe-swiftshader"],
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
