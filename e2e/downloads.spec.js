import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { GAME_BODY } from "../client/js/characters/body.js";
import { expect, test } from "./fixtures.js";

// The downloader (client/js/app/fetcher.js) in a real browser, against the game's own server
// (server/static.js serves parts of files) and its service worker (client/sw.js): a file fetched a
// part at a time, checked against its hash, kept where the worker keeps the catalog's, and had from
// there the next time (generated/asset_streaming_plan.md, section 3).

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

// A file the game doesn't download before it starts, big enough to come in several parts: the body
// the game isn't made from (body.js GAME_BODY)
const PATH = `characters/${GAME_BODY === "human" ? "vitruvian" : "human"}.bin`;
const DATA = readFileSync(new URL(`../client/${PATH}`, import.meta.url));
const FILE = { path: PATH, hash: createHash("sha256").update(DATA).digest("hex").slice(0, 10), bytes: DATA.length };

test("downloads a file a part at a time, checks it and keeps it, has it from there the next time, and says so in debug mode", async ({ page }) => {
    const parts = [];

    page.context().on("request", (request) => {
        if (request.url().includes(`${PATH}?h=`)) {
            parts.push(request.headers().range ?? "all of it");
        }
    });

    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    // (Through the service worker, as the game's own requests go)
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;

        if (!navigator.serviceWorker.controller) {
            await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
        }
    });

    // What came is the file: its size and its hash, worked out in the page
    const got = await page.evaluate(async (file) => {
        const blob = await window.pellagos.fetcher.want(file, "now");
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));

        return { bytes: blob.size, hash: [...digest.subarray(0, 5)].map((byte) => byte.toString(16).padStart(2, "0")).join("") };
    }, FILE);

    expect(got).toEqual({ bytes: FILE.bytes, hash: FILE.hash });

    // Playing alone, in parts of 256 KB, each asked for once (by the page; the worker passing
    // parts straight to the server)
    const asked = [...new Set(parts)];

    expect(asked.length).toBe(Math.ceil(FILE.bytes / (256 * 1024)));
    expect(asked[0]).toBe(`bytes=0-${256 * 1024 - 1}`);

    // Kept, and had from there the next time: nothing asked of the network
    const kept = await page.evaluate(async (url) => Boolean(await (await caches.open("pellagos-assets-v2")).match(new URL(url, document.baseURI).href)), `${PATH}?h=${FILE.hash}`);

    expect(kept).toBe(true);
    parts.length = 0;
    expect(await page.evaluate(async (file) => (await window.pellagos.fetcher.want(file, "soon")).size, FILE)).toBe(FILE.bytes);
    expect(parts).toEqual([]);

    // Debug mode tells how it went
    await page.getByText("Debug mode").click();
    await expect(page.locator("#debugstats")).toContainText(new RegExp(`Downloads idle {2}\\d+ KB/s of \\d+ KB/s alone {2}0 queued, 2 done \\(${(FILE.bytes / 1024 / 1024).toFixed(1).replace(".", "\\.")} MB\\)`));
});
