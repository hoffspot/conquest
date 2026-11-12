// What a first visit downloads, and when: every request of a cold load of the game, from the live
// site (HTTP/2, as players get it) or a local server, optionally on a slowed connection.
//   node load.cjs <url> <label> [latencyMs] [downMbps]
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");

const [url, label = "load", latency = "0", down = "0"] = process.argv.slice(2);
const out = path.join(__dirname, "out");
fs.mkdirSync(out, { recursive: true });

(async () => {
    const env = process.env.HTTPS_PROXY && url.startsWith("https") ? new URL(process.env.HTTPS_PROXY) : null;
    const proxy = env ? { server: `${env.protocol}//${env.host}`, ...(env.username ? { username: decodeURIComponent(env.username), password: decodeURIComponent(env.password) } : {}) } : undefined;
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", proxy });
    const context = await browser.newContext({ ...devices["iPhone 15 Pro"], serviceWorkers: process.env.SW === "allow" ? "allow" : "block" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    if (Number(latency) || Number(down)) {
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: Number(latency), downloadThroughput: Number(down) ? (Number(down) * 1e6) / 8 : -1, uploadThroughput: -1 });
    }
    const requests = new Map();
    let first = null;
    cdp.on("Network.requestWillBeSent", ({ requestId, request, timestamp, type, initiator }) => {
        first ??= timestamp;
        requests.set(requestId, { url: request.url, type, start: timestamp - first, initiator: initiator?.type });
    });
    cdp.on("Network.responseReceived", ({ requestId, response }) => {
        const r = requests.get(requestId);
        if (r) Object.assign(r, { status: response.status, protocol: response.protocol, mime: response.mimeType, encoding: response.headers["content-encoding"] ?? "", fromCache: response.fromDiskCache || response.fromServiceWorker || false, cacheControl: response.headers["cache-control"] ?? "" });
    });
    cdp.on("Network.loadingFinished", ({ requestId, timestamp, encodedDataLength }) => {
        const r = requests.get(requestId);
        if (r) Object.assign(r, { end: timestamp - first, bytes: encodedDataLength });
    });
    const marks = {};
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "commit" });
    page.once("domcontentloaded", () => (marks.domContentLoaded = Date.now() - t0));
    // (The title's shown, or the game's playing: whichever the address asks for)
    await page.waitForFunction(() => window.pellagos?.playing || (document.querySelector("#title") && !document.querySelector("#title").hidden && getComputedStyle(document.querySelector("#title")).display !== "none"), null, { timeout: 420000, polling: 250 }).catch((e) => (marks.error = String(e).slice(0, 200)));
    marks.ready = Date.now() - t0;
    marks.playing = await page.evaluate(() => Boolean(window.pellagos?.playing));
    await page.waitForTimeout(3000);
    const list = [...requests.values()].filter((r) => r.end !== undefined);
    const kind = (r) => {
        const p = new URL(r.url).pathname;
        if (/\.m?js$/.test(p)) return p.includes("/vendor/") ? "code: vendor" : "code: game";
        if (/\.wasm$/.test(p)) return "wasm";
        if (/\.(bin|glb|gltf)$/.test(p)) return "models";
        if (/\.(png|jpg|jpeg|webp|ktx2|svg|ico)$/.test(p)) return "pictures";
        if (/\.(mp3|ogg|flac|wav|opus|m4a)$/.test(p)) return "sound";
        if (/\.(woff2?|ttf|otf)$/.test(p)) return "fonts";
        if (/\.(html?|css|json|webmanifest)$/.test(p) || p.endsWith("/")) return "page, styles, data";
        return "other";
    };
    const by = new Map();
    for (const r of list) {
        const k = kind(r);
        const at = by.get(k) ?? { requests: 0, bytes: 0, lastEnd: 0 };
        at.requests++; at.bytes += r.bytes; at.lastEnd = Math.max(at.lastEnd, r.end);
        by.set(k, at);
    }
    const code = list.filter((r) => kind(r).startsWith("code"));
    const summary = {
        url, label, latency: Number(latency), downMbps: Number(down), marks,
        requests: list.length, uniqueUrls: new Set(list.map((r) => r.url)).size, bytes: list.reduce((s, r) => s + r.bytes, 0), unfinished: requests.size - list.length,
        byKind: Object.fromEntries([...by].map(([k, v]) => [k, { requests: v.requests, KB: Math.round(v.bytes / 1024), lastEndS: +v.lastEnd.toFixed(2) }])),
        code: { requests: code.length, KB: Math.round(code.reduce((s, r) => s + r.bytes, 0) / 1024), firstStartS: +Math.min(...code.map((r) => r.start)).toFixed(2), lastEndS: +Math.max(...code.map((r) => r.end)).toFixed(2), encodings: [...new Set(code.map((r) => r.encoding))], protocols: [...new Set(list.map((r) => r.protocol))] },
        biggest: [...list].sort((a, b) => b.bytes - a.bytes).slice(0, 15).map((r) => [Math.round(r.bytes / 1024), new URL(r.url).pathname.slice(-60), +r.start.toFixed(2), +r.end.toFixed(2)]),
        cacheControl: [...new Set(list.map((r) => r.cacheControl))].slice(0, 6),
    };
    fs.writeFileSync(path.join(out, `load-${label}.json`), JSON.stringify({ summary, requests: list }, null, 1));
    console.log(JSON.stringify(summary, null, 1));
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
