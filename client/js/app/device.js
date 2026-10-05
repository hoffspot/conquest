// Helpers for phones and tablets: landscape lock, full screen, installing the game as an app.
//
// Browsers only let a web page lock the screen orientation in some situations:
//  - Android: in full screen (requested when a game starts) or when installed as an app
//    (the manifest asks for landscape).
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

export function canUseFullscreen() {
    return Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
}

export function isFullscreen() {
    return Boolean(document.fullscreenElement);
}

/**
 * On touch screens, go full screen and lock to landscape where the browser allows it.
 * Must be called from a tap or click handler. Failures are ignored: the game works either way.
 */
export async function enterLandscapeFullscreen() {
    if (!isTouchScreen() || isInstalledApp() || isFullscreen() || !canUseFullscreen()) {
        return;
    }

    try {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
        await screen.orientation?.lock?.("landscape");
    } catch {
        // Not allowed here (e.g. desktop browsers or iPhone Safari)
    }
}

export async function toggleFullscreen() {
    try {
        if (isFullscreen()) {
            await document.exitFullscreen();
        } else {
            await document.documentElement.requestFullscreen({ navigationUI: "hide" });
            await screen.orientation?.lock?.("landscape");
        }
    } catch {
        // Ignore: full screen or orientation locking is not available
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
export function registerServiceWorker(release) {
    if ("serviceWorker" in navigator && window.isSecureContext) {
        // (With when the page started, so the worker can tell which release is the newest)
        const tell = () => navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ ...release, started: performance.timeOrigin }));

        navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Service worker not registered:", error));

        if (release) {
            tell();
            navigator.serviceWorker.addEventListener("controllerchange", tell);
        }
    }
}
