// Service worker: keeps a copy of the game so it starts quickly and the campaign works offline.
//
// Code and pages are fetched from the network first (so updates show up straight away), falling
// back to the saved copy when offline. Images and sounds rarely change, so they come from the saved
// copy first. Change CACHE_NAME when images or sounds change to replace the saved copies.

const CACHE_NAME = "last-colony-v1";

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name !== CACHE_NAME) {
                await caches.delete(name);
            }
        }

        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle the game's own files (not the multiplayer WebSocket or other sites)
    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    const isAsset = /\.(png|gif|jpg|mp3|ogg)$/.test(url.pathname);

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
        const response = await fetch(request);

        if (response.ok) {
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        const cached = await cache.match(request);

        if (cached) {
            return cached;
        }

        throw error;
    }
}
