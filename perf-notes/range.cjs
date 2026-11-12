// Does a browser's ranged fetch of a model from the live site come compressed?
const { chromium } = require("playwright");
(async () => {
    const env = new URL(process.env.HTTPS_PROXY);
    const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", proxy: { server: `${env.protocol}//${env.host}`, ...(env.username ? { username: decodeURIComponent(env.username), password: decodeURIComponent(env.password) } : {}) } });
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    const seen = [];
    const sent = new Map();
    cdp.on("Network.requestWillBeSentExtraInfo", ({ requestId, headers }) => sent.set(requestId, headers));
    cdp.on("Network.responseReceived", ({ requestId, response }) => { if (response.url.endsWith(".bin")) seen.push({ id: requestId, status: response.status, encoding: response.headers["content-encoding"] ?? "(none)", length: response.headers["content-length"], range: response.headers["content-range"] ?? "" }); });
    const done = new Map();
    cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => done.set(requestId, encodedDataLength));
    await page.goto("https://hoffspot.github.io/conquest/world-map.html", { waitUntil: "domcontentloaded" });
    const got = await page.evaluate(async () => {
        const url = "https://hoffspot.github.io/conquest/models/beasts/ant.bin";
        const ranged = await fetch(url, { headers: { Range: "bytes=0-999999" }, cache: "no-store" });
        const a = (await ranged.arrayBuffer()).byteLength;
        const whole = await fetch(url, { cache: "no-store" });
        const b = (await whole.arrayBuffer()).byteLength;
        return { rangedBody: a, wholeBody: b };
    });
    await page.waitForTimeout(500);
    console.log(JSON.stringify({ got, seen: seen.map((s) => ({ ...s, wire: done.get(s.id), acceptEncoding: sent.get(s.id)?.["accept-encoding"] ?? sent.get(s.id)?.["Accept-Encoding"] })) }, null, 1));
    await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
