// Service worker: keeps a copy of the game so it starts quickly and plays offline.
//
// Code, pages and the characters' data are fetched from the network first (so updates show up
// straight away), falling back to the saved copy when offline. They are always checked with the
// server, never reused from the browser's own caches: a host may let browsers reuse files for a
// while (GitHub Pages, ten minutes), so right after an update a page could otherwise be put
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
// Images, 3D models and the music's recordings rarely change, so they come from the saved copy
// first. Change the version in CACHE_NAME when they change to replace the saved copies (the
// recordings' names change with what's in them, so they needn't).

const CACHE_PREFIX = "pellagos-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;

// Copies kept by the game this one replaced (Last Colony), on the same site
const OLD_PREFIXES = ["last-colony-"];

// How long a file checked with the server is taken as checked for the page that asked (ms), and
// when each was (by page and address; lost when the browser stops the worker, which then just
// checks again)
const FRESH = 60000;
const checked = new Map();

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        // Only the game's own old copies: other sites on the same host (such as other GitHub Pages
        // sites on username.github.io) share the same cache storage
        for (const name of await caches.keys()) {
            if ((name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) || OLD_PREFIXES.some((prefix) => name.startsWith(prefix))) {
                await caches.delete(name);
            }
        }

        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle the game's own files (not other sites)
    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    const isAsset = /\.(png|gif|jpg|webp|gltf|glb|mp3)$/.test(url.pathname) || /\/models\/.+\.bin$/.test(url.pathname);

    event.respondWith(isAsset ? cacheFirst(request) : networkFirst(request, event));
});

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    const response = await fetch(request);

    if (response.ok) {
        cache.put(request, response.clone());
    }

    return response;
}

async function networkFirst(request, event) {
    const cache = await caches.open(CACHE_NAME);
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

// A file checked for a page at `at` (and those checked over a minute ago forgotten, now and then:
// pages come and go)
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
