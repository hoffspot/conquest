// End-to-end tests that play the game in a real browser: npm run test:e2e
// (Install the browser once with: npx playwright install chromium)
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT) || 8095;

export default defineConfig({
    testDir: "e2e",
    timeout: 60000,
    reporter: process.env.CI ? "github" : "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${port}`,
        viewport: { width: 1000, height: 600 },
        launchOptions: {
            // WebGL (for the 3D units) through software rendering on machines without a GPU, such as CI
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
