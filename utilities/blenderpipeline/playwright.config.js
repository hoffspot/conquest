// The browser tests (test/*.spec.js): every built GLB loaded in Three.js, in Chromium, through the
// viewer. npm run test:browser (CHROMIUM_PATH for a Chromium already installed)
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.VIEWER_PORT) || 8098;

export default defineConfig({
    testDir: "test",
    testMatch: "*.spec.js",
    timeout: 120000,
    fullyParallel: true,
    reporter: "list",
    use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${port}`,
        viewport: { width: 640, height: 480 },
        launchOptions: {
            // WebGL in software where there's no GPU
            args: ["--enable-unsafe-swiftshader"],
            ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        },
    },
    webServer: {
        command: "node viewer/serve.js",
        env: { PORT: String(port) },
        url: `http://localhost:${port}/models.json`,
        reuseExistingServer: !process.env.CI,
    },
});
