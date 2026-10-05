// Service worker: keeps a copy of the game so it starts quickly and plays offline.
//
// Files known by a hash of their bytes are kept by that address, path?h=hash: the body, its skin
// and the models the game downloads before it starts (js/app/manifest.js), and the models it
// downloads only as they're wanted (js/app/assets.js, the catalog). A copy kept by its hash is the
// right one for good, so it's never checked with the server again, and a release that changes a
// file changes its address. A copy is kept only once its bytes are checked against its hash: a
// server that has since moved on to another version (a release published while a page was
// loading) hands that one on, which is used but not kept.
//
// Each page tells the worker its release on starting: which files it keeps by hash (js/app/
// catalog.js). What no release in use lists any more is let go of: the newest release's files,
// and those of each page still open on an older one, are kept, the rest deleted (collect). The
// catalog's models are let go of too, the least recently used first, when they come to more than
// the room set aside for them; never the files the game needs to start.
//
// Code, pages and the rest of the characters' data are fetched from the network first (so updates
// show up straight away), falling back to the saved copy when offline. They are always checked
// with the server, never reused from the browser's own caches: a host may let browsers reuse files
// for a while (GitHub Pages, ten minutes), so right after an update a page could otherwise be put
// together from some old files and some new ones, which don't work together. (Files that haven't
// changed come back as short "not modified" replies, from any host that says when they last did:
// the game's own server does too, server/static.js.)
//
// Checked once for a page is enough, though: the loader fetches every file the game needs, and
// the page then imports the same files, a level of the code at a time, straight after. A file
// the same page had checked with the server in the last minute comes from the saved copy (just
// checked, so still the same version as the rest), rather than asking again, 13 round trips deep.
// A page loaded afresh (a reload) checks everything again, so an update shows at once.
//
// Images and models without a hash come from the saved copy first, then are checked with the
// server, at most once a minute, so a change shows the next time they're asked for. The music's
// recordings are named by what's in them (scripts/build-music.js), so they're never checked.
//
// The caches' names end in the version of how they're laid out (-v2): it changes only when that
// does, never for a release (generated/asset_streaming_plan.md, section 5).

const CACHE_PREFIX = "pellagos-";

// Code, pages and files without a hash
const SHELL = `${CACHE_PREFIX}shell-v2`;

// Files with a hash in the manifest: needed to start, so never let go of to make room
const BOOT = `${CACHE_PREFIX}boot-v2`;

// The catalog's files: let go of to make room, the least recently used first
const ASSETS = `${CACHE_PREFIX}assets-v2`;

// What the worker knows of the releases in use, and when each kept file was last used (one small
// JSON response, so it outlasts the worker: the browser stops it when it's idle)
const STATE = `${CACHE_PREFIX}state-v2`;

const CACHES = [SHELL, BOOT, ASSETS, STATE];

// The one cache the game kept everything in before these (by name): its copies are taken on
const OLD_CACHE = `${CACHE_PREFIX}v1`;

// Copies kept by the game this one replaced (Last Colony), on the same site
const OLD_PREFIXES = ["last-colony-"];

// A hash in an address: the first 10 hex digits of the SHA-256 of the file's bytes
const HASH = /^[0-9a-f]{10}$/;

// Images and models, and the music's recordings (named by what's in them)
const MEDIA = /\.(png|gif|jpg|webp|gltf|glb|mp3)$|\/models\/.+\.bin$/;
const RECORDING = /\.[0-9a-f]{8}\.mp3$/;

// How long a file checked with the server is taken as checked for the page that asked (ms), and
// when each was (by page and address, or by address for images and models; lost when the browser
// stops the worker, which then just checks again)
const FRESH = 60000;
const checked = new Map();

// How long a file kept by its hash is kept even if no release in use lists it (ms): the page that
// asked for it may not have said its release yet
const GRACE = 10 * 60000;

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        await takeOver();

        // Only the game's own old copies: other sites on the same host (such as other GitHub Pages
        // sites on username.github.io) share the same cache storage
        for (const name of await caches.keys()) {
            if ((name.startsWith(CACHE_PREFIX) && !CACHES.includes(name)) || OLD_PREFIXES.some((prefix) => name.startsWith(prefix))) {
                await caches.delete(name);
            }
        }

        await self.clients.claim();
        await collect();
    })());
});

self.addEventListener("message", (event) => {
    const message = event.data;

    if (message?.kind === "release" && typeof message.release === "string" && event.source?.id) {
        event.waitUntil(heard(event.source.id, message));
    }
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle the game's own files (not other sites)
    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    const hash = url.searchParams.get("h");

    if (hash && HASH.test(hash)) {
        event.respondWith(byHash(request, hash, event));
    } else if (RECORDING.test(url.pathname)) {
        event.respondWith(savedFirst(request));
    } else if (MEDIA.test(url.pathname)) {
        event.respondWith(savedThenChecked(request, event));
    } else {
        event.respondWith(networkFirst(request, event));
    }
});

// --- Files kept by their hash ---

async function byHash(request, hash, event) {
    const url = request.url;
    const boot = await (await caches.open(BOOT)).match(url);

    if (boot) {
        return boot;
    }

    // (The catalog's are let go of the least recently used first, so when each is used counts)
    const asset = await (await caches.open(ASSETS)).match(url);

    if (asset) {
        event.waitUntil(used(url));

        return asset;
    }

    // (A part of a file: the downloader asks for one a part at a time, and keeps the whole itself)
    if (request.headers?.has("range")) {
        return fetch(request);
    }

    // (A copy saved before the file was known by its hash, by the cache before these: taken on if
    // it's the same file, rather than downloaded again)
    const taken = await takeOn(url, hash);

    if (taken) {
        return taken;
    }

    const response = await fetch(url, { cache: "no-cache" });

    if (!response.ok || response.type !== "basic" || !response.body) {
        return response;
    }

    // Handed to the page as it arrives, and kept once it's all here and checked
    const [page, copy] = response.body.tee();
    const init = { status: response.status, statusText: response.statusText, headers: response.headers };

    event.waitUntil(new Response(copy).arrayBuffer().then((bytes) => keep(url, hash, bytes, response.headers)));

    return new Response(page, init);
}

async function keptCopy(url) {
    for (const name of [BOOT, ASSETS]) {
        const kept = await (await caches.open(name)).match(url);

        if (kept) {
            return kept;
        }
    }

    return undefined;
}

// Keep a file by its hash if its bytes are that file's (true if kept)
async function keep(url, hash, bytes, headers) {
    if ((await hashOf(bytes)) !== hash) {
        return false;
    }

    const known = await readState();
    const listed = Object.values(known.releases).some(({ assets }) => assets.includes(url));
    const kept = new Headers(headers);

    // (The bytes as they are now, whatever the server sent them compressed as)
    kept.delete("Content-Encoding");
    kept.set("Content-Length", String(bytes.byteLength));

    await (await caches.open(listed ? ASSETS : BOOT)).put(url, new Response(bytes, { status: 200, headers: kept }));
    await used(url);

    return true;
}

// A copy of a file saved without its hash (the shell's, as the cache before these kept it), taken
// on as the file with that hash if its bytes are the same
async function takeOn(url, hash) {
    const plain = new URL(url);

    plain.search = "";

    const shell = await caches.open(SHELL);
    const saved = await shell.match(plain.href);

    if (!saved) {
        return undefined;
    }

    const bytes = await saved.arrayBuffer();

    if (!(await keep(url, hash, bytes, saved.headers))) {
        return undefined;
    }

    await shell.delete(plain.href);

    return keptCopy(url);
}

/** A file's hash: the first 10 hex digits of the SHA-256 of its bytes (as js/app/manifest.js has). */
async function hashOf(bytes) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

    return [...digest.subarray(0, 5)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// --- The releases in use, and letting go of what none lists ---

// What the worker knows (STATE): each release heard of ({ boot, assets }: the full URLs of the
// files it keeps by hash), the newest and when its page started, each page's release (by the
// page's id), and when each kept file was last used (ms)
let state;
let saving = Promise.resolve();
let unsaved = false;

const stateKey = () => new URL("sw-state.json", self.location.href).href;

function readState() {
    state ??= (async () => {
        const saved = await (await caches.open(STATE)).match(stateKey());
        const read = saved ? await saved.json().catch(() => ({})) : {};

        return { releases: {}, newest: null, newestAt: 0, pages: {}, used: {}, ...read };
    })();

    return state;
}

// Saved one at a time; changes made while one waits go with it
function saveState() {
    if (!unsaved) {
        unsaved = true;
        saving = saving.then(async () => {
            unsaved = false;

            const body = JSON.stringify(await readState());

            await (await caches.open(STATE)).put(stateKey(), new Response(body, { headers: { "Content-Type": "application/json" } }));
        }).catch((error) => console.warn("Couldn't save what the service worker knows:", error));
    }

    return saving;
}

async function used(url) {
    (await readState()).used[url] = Date.now();
    await saveState();
}

// A page told its release: the files it keeps by hash, and when it started (ms). The release of
// the page started last is the newest: a page loaded afresh has the newest code, as it's fetched
// from the network first. (A page open a while tells its release again when an update's worker
// takes over, which doesn't make it the newest.)
async function heard(page, { release, boot, assets, started }) {
    const known = await readState();
    const own = (list) => (Array.isArray(list) ? list.filter((url) => typeof url === "string" && url.startsWith(`${self.location.origin}/`)) : []);

    known.releases[release] ??= { boot: own(boot), assets: own(assets) };

    if (!known.newest || (Number.isFinite(started) && started >= known.newestAt)) {
        known.newest = release;
        known.newestAt = Number.isFinite(started) ? started : known.newestAt;
    }

    known.pages[page] = release;
    await saveState();
    await collect();
}

/**
 * The releases in use: the newest, and each open page's (by name, only those heard of).
 *
 * @param {object} known - What the worker knows: { releases, newest, pages }.
 * @param {Set<string>} open - The ids of the pages open now.
 */
function inUse({ releases, newest, pages }, open) {
    const names = new Set(Object.entries(pages).filter(([page]) => open.has(page)).map(([, name]) => name));

    if (newest) {
        names.add(newest);
    }

    return [...names].filter((name) => releases[name]);
}

/**
 * What to let go of: the files kept by hash that no release in use lists (unless kept or used in
 * the last GRACE), then, while the catalog's files kept come to more than `budget` bytes, the
 * least recently used of those. Never what a release in use needs to start (its boot files).
 *
 * @param {object} options
 * @param {Array} options.entries - The files kept: [{ url, bytes, used }] (`used`: ms, 0 if never).
 * @param {Array} options.releases - The releases in use: [{ boot: [url], assets: [url] }].
 * @param {number} [options.budget] - The room for the catalog's files (bytes).
 * @param {number} [options.now] - The time (ms).
 * @returns {Array} The entries to delete.
 */
function toLetGo({ entries, releases, budget = Infinity, now = Date.now() }) {
    const boot = new Set(releases.flatMap((release) => release.boot));
    const listed = new Set(releases.flatMap((release) => release.assets));
    const unlisted = entries.filter(({ url, used }) => !boot.has(url) && !listed.has(url) && now - used >= GRACE);
    const optional = entries.filter(({ url }) => listed.has(url) && !boot.has(url)).sort((a, b) => a.used - b.used);
    let total = optional.reduce((sum, { bytes }) => sum + bytes, 0);
    const room = [];

    for (const entry of optional) {
        if (total <= budget) {
            break;
        }

        room.push(entry);
        total -= entry.bytes;
    }

    return [...unlisted, ...room];
}

// Let go of what no release in use lists, and of the least recently used of the catalog's files
// while they take more than their room. Nothing, until a page has said its release.
async function collect() {
    const known = await readState();
    const open = new Set((await self.clients.matchAll({ type: "window", includeUncontrolled: true })).map(({ id }) => id));
    const names = inUse(known, open);

    if (!names.length) {
        return;
    }

    // (Forgetting the pages that have closed, and the releases no longer in use)
    known.pages = Object.fromEntries(Object.entries(known.pages).filter(([page]) => open.has(page)));
    known.releases = Object.fromEntries(names.map((name) => [name, known.releases[name]]));

    const entries = [];

    for (const name of [BOOT, ASSETS]) {
        const cache = await caches.open(name);

        for (const request of await cache.keys()) {
            entries.push({ cache, url: request.url, bytes: await sizeOf(cache, request), used: known.used[request.url] ?? 0 });
        }
    }

    const listed = new Set(names.flatMap((name) => known.releases[name].assets));
    const optional = entries.filter(({ url }) => listed.has(url)).reduce((sum, { bytes }) => sum + bytes, 0);
    const doomed = toLetGo({ entries, releases: names.map((name) => known.releases[name]), budget: await room(optional) });

    for (const { cache, url } of doomed) {
        await cache.delete(url);
    }

    // (And when files no longer kept were last used)
    const kept = new Set(entries.filter((entry) => !doomed.includes(entry)).map(({ url }) => url));

    known.used = Object.fromEntries(Object.entries(known.used).filter(([url]) => kept.has(url)));
    await saveState();
}

async function sizeOf(cache, request) {
    const response = await cache.match(request);
    const length = Number(response?.headers.get("Content-Length"));

    return length > 0 ? length : ((await response?.blob())?.size ?? 0);
}

// The room for the catalog's files: half of what the browser would let the game keep besides
// everything else it keeps (all of it, where the browser doesn't say)
async function room(optional) {
    const estimate = await self.navigator?.storage?.estimate?.().catch(() => undefined);

    return estimate?.quota ? Math.max(0, (estimate.quota - (estimate.usage ?? 0) + optional) / 2) : Infinity;
}

// The cache before these kept everything by name: its copies go to the shell, from where those
// now known by their hash are taken on as they're next asked for (takeOn)
async function takeOver() {
    if (!(await caches.keys()).includes(OLD_CACHE)) {
        return;
    }

    const [old, shell] = await Promise.all([caches.open(OLD_CACHE), caches.open(SHELL)]);

    for (const request of await old.keys()) {
        const response = await old.match(request);

        if (response && !(await shell.match(request))) {
            await shell.put(request, response);
        }
    }
}

// --- Files without a hash ---

async function savedFirst(request) {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    const response = await fetch(request);

    if (response.ok) {
        await cache.put(request, response.clone());
    }

    return response;
}

// From the saved copy, checked with the server afterwards (at most once a minute)
async function savedThenChecked(request, event) {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(request);
    const check = async () => {
        const response = await fetch(request.url, { cache: "no-cache" });

        if (response.ok && response.type === "basic") {
            await cache.put(request, response.clone());
        }

        return response;
    };

    if (!cached) {
        remember(request.url, Date.now());

        return check();
    }

    if (Date.now() - (checked.get(request.url) ?? -Infinity) >= FRESH) {
        remember(request.url, Date.now());
        event.waitUntil(check().catch(() => {
            // (Offline: the copy stays as it is)
        }));
    }

    return cached;
}

async function networkFirst(request, event) {
    const cache = await caches.open(SHELL);
    const key = event.clientId ? `${event.clientId} ${request.url}` : null;

    // (Checked for this page a moment ago: the copy saved then)
    if (key && Date.now() - (checked.get(key) ?? -Infinity) < FRESH) {
        const cached = await cache.match(request);

        if (cached) {
            return fresh(cached);
        }
    }

    try {
        // Pages are fetched by address, as a page request can't be copied with different options
        const response = await fetch(request.mode === "navigate" ? request.url : request, { cache: "no-cache" });

        if (!response.ok || response.type !== "basic") {
            return response;
        }

        // (Taken as checked once its copy's saved, not before: asked for again meanwhile, it's
        // checked again, rather than the older copy given)
        const at = Date.now();

        event.waitUntil(cache.put(request, response.clone()).then(() => key && remember(key, at)));

        return fresh(response);
    } catch (error) {
        const cached = await cache.match(request);

        if (cached) {
            return cached;
        }

        throw error;
    }
}

// A file checked at `at` (and those checked over a minute ago forgotten, now and then: pages come
// and go)
function remember(key, at) {
    checked.set(key, at);

    if (checked.size > 1000) {
        for (const [each, when] of checked) {
            if (at - when >= FRESH) {
                checked.delete(each);
            }
        }
    }
}

// Tell the page not to reuse its copy without asking again, whatever the server allowed
function fresh(response) {
    const headers = new Headers(response.headers);

    headers.set("Cache-Control", "no-cache");

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
