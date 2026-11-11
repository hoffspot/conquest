// Helpers for phones and tablets: landscape lock, installing the game as an app (full screen:
// app/fullscreen.js).
//
// Browsers only let a web page lock the screen orientation in some situations:
//  - Android: in full screen (asked for while playing: app/fullscreen.js) or when installed as an
//    app (the manifest asks for landscape).
//  - iPhone: not at all, but a game added to the Home Screen runs full screen without Safari's
//    toolbars. The "turn your device" screen (styles.css) covers the game in portrait everywhere.

const portraitQuery = matchMedia("(orientation: portrait) and (pointer: coarse)");

export function isTouchScreen() {
    return matchMedia("(pointer: coarse)").matches;
}

export function isPortraitTouchScreen() {
    return portraitQuery.matches;
}

/** Call back whenever a touch screen device is turned between portrait and landscape. */
export function onOrientationChange(callback) {
    portraitQuery.addEventListener("change", () => callback(portraitQuery.matches));
}

/** Is the game running as an installed app (from the Home Screen)? */
export function isInstalledApp() {
    return matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || navigator.standalone === true;
}

export function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** On a touch screen, lock it to landscape where the browser allows it (full screen, on Android). */
export function lockLandscape() {
    if (!isTouchScreen()) {
        return;
    }

    try {
        screen.orientation?.lock?.("landscape")?.catch?.(() => {});
    } catch {
        // Not allowed here: the "turn your device" screen covers the game in portrait
    }
}

/**
 * Offer to install the game: a button where the browser supports install prompts (Android, desktop
 * Chrome), or a hint to use "Add to Home Screen" on iPhone and iPad.
 */
export function setUpInstall({ button, hint }) {
    if (isInstalledApp()) {
        return;
    }

    let installPrompt;

    window.addEventListener("beforeinstallprompt", (ev) => {
        ev.preventDefault();
        installPrompt = ev;
        button.hidden = false;
    });

    button.addEventListener("click", async () => {
        button.hidden = true;
        await installPrompt?.prompt();
        installPrompt = undefined;
    });

    window.addEventListener("appinstalled", () => {
        button.hidden = true;
    });

    hint.hidden = !(isIOS() && isTouchScreen());
}

/**
 * Cache the game for offline play (only possible on https or localhost). When an update's service
 * worker takes over, index.html reloads the page.
 *
 * @param {object} [release] - What this page's release keeps (catalog.js, releaseOf), told to the
 *     service worker once it's running, and again to any update's that takes over, so it keeps
 *     those files and can let go of what no release in use lists.
 */
/**
 * Ask the browser to keep what the game's downloaded for good (navigator.storage.persist), where
 * it's installed (on the Home Screen, or as an app): where browsers grant it without asking. Not in
 * a tab, where Firefox asks the player. Resolves to whether it's kept for good.
 */
export async function keepDownloads(storage = globalThis.navigator?.storage, installed = isInstalledApp()) {
    if (!installed || !storage?.persist) {
        return false;
    }

    try {
        return (await storage.persisted?.()) || (await storage.persist());
    } catch {
        return false;
    }
}

// The service worker's registration, once asked for (registerServiceWorker): whether it could be
// registered (resolves to false if it couldn't, or if the worker registered could never start)
let registered = null;

// Whether a registration's worker can come to look after the page: false once the one being
// installed is thrown away (its script wouldn't run, or its install failed) with none other in
// its place; true as soon as there's one installed or active
function workable(registration) {
    const worker = registration?.installing;

    if (!worker || registration.waiting || registration.active) {
        return Promise.resolve(Boolean(registration));
    }

    return new Promise((resolve) => {
        const look = () => {
            if (worker.state === "redundant") {
                resolve(Boolean(registration.waiting || registration.active));
            } else if (worker.state === "installed" || worker.state === "activating" || worker.state === "activated") {
                resolve(true);
            } else {
                return;
            }

            worker.removeEventListener("statechange", look);
        };

        worker.addEventListener("statechange", look);
        look();
    });
}

/**
 * Wait (at most `ms`) for the service worker to be looking after the page: at once if it already
 * is, as it is after the first visit. On the first, it's just been registered, and what the loader
 * downloads before it takes over isn't kept, so it's given a moment first. Not where it can't be
 * registered (a browser that refuses: private browsing in some, storage turned off, a page in
 * another's frame) or can never start: the wait's over as soon as that's known, where every load
 * there used to wait out all of `ms` for a worker that would never come.
 */
export function looked(ms) {
    const workers = globalThis.navigator?.serviceWorker;

    if (!workers || !window.isSecureContext || workers.controller) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        const done = () => {
            clearTimeout(timer);
            resolve();
        };

        workers.addEventListener("controllerchange", done, { once: true });
        registered?.then((could) => could || done());
    });
}

/**
 * Ask the service worker to keep files the page loaded by their hashes before it took over (a
 * first visit: main.js and what it imports), from the browser's own copies (sw.js keepLoaded).
 * Nothing if it hasn't taken over.
 */
export function keepLoaded(urls) {
    const worker = globalThis.navigator?.serviceWorker?.controller;

    if (worker && urls.length) {
        worker.postMessage({ kind: "keep", urls });
    }
}

export function registerServiceWorker(release) {
    if ("serviceWorker" in navigator && window.isSecureContext) {
        // (With when the page started, so the worker can tell which release is the newest)
        const tell = () => navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ ...release, started: performance.timeOrigin }));

        // (Registered already as the page was read, by its own script, index.html: this is that
        // registration, and how it went is what `looked` goes by)
        registered = navigator.serviceWorker.register("sw.js").then(workable, (error) => {
            console.warn("Service worker not registered:", error);

            return false;
        });

        if (release) {
            tell();
            navigator.serviceWorker.addEventListener("controllerchange", tell);
        }
    }
}
