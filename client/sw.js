// Service worker: keeps a copy of the game so it starts quickly and plays offline.
//
// Code, pages and the characters' data are fetched from the network first (so updates show up
// straight away), falling back to the saved copy when offline. They are always checked with the
// server, never reused from the browser's own caches: GitHub Pages lets browsers reuse files for
// ten minutes, so right after an update a page could otherwise be put together from some old
// files and some new ones, which don't work together. (Files that haven't changed come back as
// short "not modified" replies.)
//
// Images, 3D models and the music's recordings rarely change, so they come from the saved copy
// first. Change the version in CACHE_NAME when they change to replace the saved copies (the
// recordings' names change with what's in them, so they needn't).

const CACHE_PREFIX = "pellagos-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;

// Copies kept by the game this one replaced (Last Colony), on the same site
const OLD_PREFIXES = ["last-colony-"];

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

    event.respondWith(isAsset ? cacheFirst(request) : networkFirst(request));
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

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        // Pages are fetched by address, as a page request can't be copied with different options
        const response = await fetch(request.mode === "navigate" ? request.url : request, { cache: "no-cache" });

        if (!response.ok || response.type !== "basic") {
            return response;
        }

        cache.put(request, response.clone());

        // Tell the page not to reuse its copy without asking again, whatever the server allowed
        const headers = new Headers(response.headers);

        headers.set("Cache-Control", "no-cache");

        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
        const cached = await cache.match(request);

        if (cached) {
            return cached;
        }

        throw error;
    }
}
