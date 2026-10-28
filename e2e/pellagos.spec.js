import { expect, test } from "./fixtures.js";
import { LEFT_OUT, licensedModelsHere } from "../scripts/licensed-models.js";
import { Explored } from "../client/js/core/explored.js";
import { behemothSides, BOMBERS, ENGINES, INVASION, REWARD, SIZE } from "../client/js/core/invasions.js";
import { stagesOf } from "../client/js/core/burnt.js";
import { branchesFound, fareOf } from "../client/js/core/portals.js";
import { NATURAL } from "../client/js/core/weapons.js";
import { AMBUSH } from "../client/js/core/ambush.js";
import { BACKDROPS } from "../client/js/app/backdrop.js";
import { guilds, planWorld, startFor } from "../client/js/core/worldplan/plan.js";

// Pellagos in a real browser. The page exposes itself as window.pellagos ({ game, session,
// creator, loader, playing }), which these tests use to look inside. Drawing is slow without a
// GPU, so fights are played on with game.advance(), which runs the game without drawing.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

// A character kept as they were before there could be several (save.js SAVE_VERSION 1: moved in,
// under an id of their own, the first time the game's opened)
const SAVE = {
    version: 1,
    seed: 4242,
    created: "2026-09-01T12:00:00.000Z",
    hero: {
        name: "Wren",
        weapon: "staff",
        shape: { macro: { gender: 0.1, muscle: 0.5, weight: 0.45, height: 0.5, bust: 0.5, african: 0.3, asian: 0.3, caucasian: 0.4 }, details: {} },
        look: { skin: { tone: "#c28560" }, eyes: { iris: "#4f6b3a" }, hair: { style: "ponytail", beard: "none", colour: "#7a3a1f" } },
    },
};

async function title(page) {
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
}

// How near the camera making a character is to the nearest of them, every point of what's drawn of
// them as it's posed now (metres), against how near it draws (its near plane's distance); and how
// far it is from what it looks at
const creatorGap = (page) =>
    page.evaluate(async () => {
        const THREE = await import("three");
        const { camera, avatar, distance } = window.pellagos.creator;
        const point = new THREE.Vector3();
        let gap = Infinity;

        avatar.object.updateMatrixWorld(true);
        avatar.object.traverse((mesh) => {
            if (mesh.isMesh && mesh.visible) {
                for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                    mesh.getVertexPosition(i, point);

                    if (mesh.isSkinnedMesh) {
                        mesh.applyBoneTransform(i, point);
                    }

                    gap = Math.min(gap, point.applyMatrix4(mesh.matrixWorld).distanceTo(camera.position));
                }
            }
        });

        return { gap, near: camera.near, distance };
    });

// Till the camera making a character has turned to where it's being turned, and come to look at
// what the tab it's on frames (`at`, a share of their height)
const creatorSettled = (page, at) =>
    page.waitForFunction(
        (at) => {
            const { orbit, look, avatar } = window.pellagos.creator;

            return Math.abs(orbit.target - orbit.angle) < 0.003 && Math.abs(look.y - avatar.character.height * at) < 0.005;
        },
        at,
        { timeout: 60000 },
    );

// What's kept of a kind (save.js: "pellagos.<id>.<kind>") for the character played last, or null
const keptOf = (page, kind) =>
    page.evaluate((kind) => {
        const id = JSON.parse(localStorage.getItem("pellagos.characters") ?? "null")?.last;

        return id ? JSON.parse(localStorage.getItem(`pellagos.${id}.${kind}`) ?? "null") : null;
    }, kind);

// Open the game and wait for it to be playing (checking on a timer: a page with nothing changing
// on it may draw no frames). If it isn't in time, what the loading screen says, and the page's
// errors, are in the failure
async function playing(page, address) {
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await page.goto(address);

    try {
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
    } catch (error) {
        const where = await page.evaluate(() => ({ screen: document.body.dataset.screen, status: document.querySelector("#loadstatus")?.textContent, amount: document.querySelector("#loadamount")?.textContent })).catch((reason) => ({ unreadable: String(reason) }));

        throw new Error(`Not playing: ${JSON.stringify(where)}; errors: ${JSON.stringify(errors.slice(0, 5))}`, { cause: error });
    }

    // (The loader counted its steps up to their total, never past it)
    const loaded = await page.evaluate(() => window.pellagos.game.loaded);

    expect(loaded.most, `counted to ${loaded.most} of ${loaded.total}`).toBeLessThanOrEqual(loaded.total);
    expect(loaded.done).toBe(loaded.total);
}

// Play on (the game stopped) till `done` (a function run in the page) says so, or `seconds` of the
// game's time go by: whether it did. Half a second at a time, a frame at a time, the page's events
// let in between them as between frames, so what's done elsewhere (skins painted in a worker)
// comes back to be waited on, as in play; with `realTime`, no faster than the clock
async function playUntil(page, done, { seconds = 30, realTime = false } = {}) {
    const start = Date.now();

    for (let time = 0; time < seconds; time += 0.5) {
        if (await page.evaluate(done)) {
            return true;
        }

        await page.evaluate(async () => {
            const { game } = window.pellagos;

            for (let k = 0; k < 15; k++) {
                game.advance(1 / 30, { render: false, wait: true });
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        });

        // (`realTime`: never played ahead of the clock, as a player plays it, for what takes the
        // time it really takes: the downloader keeps to a rate, in real time, not the game's)
        if (realTime) {
            await page.waitForTimeout(Math.max(0, (time + 0.5) * 1000 - (Date.now() - start)));
        }
    }

    return page.evaluate(done);
}

// The first message the player's been told lately that `pattern` matches, or null: read from those
// kept for the journal (journal.js keepMessage), not the banner, which another told just after
// takes over (as a battle's turns are told), so a look between the two would miss it
async function toldOf(page, pattern) {
    return page.evaluate(([source, flags]) => window.pellagos.game.messages.map(({ text }) => text).find((text) => new RegExp(source, flags).test(text)) ?? null, [pattern.source, pattern.flags]);
}

// Where a spot so many metres north of the player is on the screen
async function spotNorth(page, metres) {
    return page.evaluate((metres) => {
        const { game, session } = window.pellagos;
        const avatar = game.avatars.get("player");

        return session.view.toScreen(avatar.object.position.clone().setZ(avatar.object.position.z - metres));
    }, metres);
}

// Click (or tap) twice, 160 ms apart. Drawing without a GPU takes so long that input sent one
// event after another arrives seconds apart, so these say when they happened, as a device's do
async function doubleTap(page, { x, y }, { touch = false } = {}) {
    const cdp = await page.context().newCDPSession(page);
    const start = Date.now() / 1000;

    for (const [down, at, count] of [[true, 0, 1], [false, 0.06, 1], [true, 0.16, 2], [false, 0.22, 2]]) {
        if (touch) {
            await cdp.send("Input.dispatchTouchEvent", { type: down ? "touchStart" : "touchEnd", touchPoints: down ? [{ x, y }] : [], timestamp: start + at });
        } else {
            await cdp.send("Input.dispatchMouseEvent", { type: down ? "mousePressed" : "mouseReleased", x, y, button: "left", buttons: down ? 1 : 0, clickCount: count, timestamp: start + at });
        }
    }

    await cdp.detach();
}

test("loads everything, listing what it downloads, then shows the title", async ({ page }) => {
    await page.goto("/");

    // Each group of files on the loading screen, with the manifest's sizes (the chest's model is
    // in the catalog, fetched once the game's started: not among them)
    await expect(page.locator("#loadlist li")).toHaveCount(6);
    await expect(page.locator("#loadlist")).toContainText("3D engine");
    await expect(page.locator("#loadlist")).toContainText("Ways over the world");
    await expect(page.locator("#loadlist")).toContainText("Lettering");
    await expect(page.locator("#loadlist")).toContainText("Skin details");
    await expect(page.locator("#loadlist")).not.toContainText("Things in the world");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
    await expect(page.locator("#titlename")).toHaveText("Pellagos");
    await expect(page.locator("#continuebutton")).toBeHidden();

    const loaded = await page.evaluate(() => ({ loaded: window.pellagos.loader.loaded, total: window.pellagos.loader.total, groups: window.pellagos.loader.groups.map((group) => group.done === group.files.length) }));

    expect(loaded.loaded).toBe(loaded.total);
    expect(loaded.total).toBeGreaterThan(2_000_000);
    expect(loaded.groups).toEqual([true, true, true, true, true, true]);
});

test("behind the loading screen and the title, the town at dusk, then each scene in turn, faded one into the next and drifting slowly, the way the screen's held (tall upright, wide on its side), an AVIF that won't show as WebP; none behind making a character, the first again back at the title, and none drifting with less motion asked for", async ({ page }) => {
    // (What's drawn behind: each picture in #backdrop, which scene, as what, faded in or not, and how big)
    const behind = () => page.evaluate(() => [...document.querySelectorAll("#backdrop img")].map((img) => ({ scene: img.dataset.scene, file: img.currentSrc.split("/").pop(), shown: img.classList.contains("shown"), width: img.naturalWidth })));
    const shown = async () => (await behind()).map(({ scene, file, shown }) => ({ scene, file, shown }));
    const next = () => page.evaluate(() => window.pellagos.backdrop.next());
    // (The scene after one, in BACKDROPS' order, painted the way the screen's held)
    const after = (scene, way) => {
        const at = BACKDROPS.findIndex((each) => each.scene === scene);

        return BACKDROPS.map((_, k) => BACKDROPS[(at + k + 1) % BACKDROPS.length]).find((each) => each[way]).scene;
    };
    const first = BACKDROPS[0].scene;
    const second = after(first, "wide");
    const wideOnly = BACKDROPS.find(({ tall, wide }) => wide && !tall).scene;
    // (One painted tall that's not been shown before it's come to, its AVIF one that won't show:
    // the context's route, which sees what the service worker fetches too)
    const broken = BACKDROPS.find(({ scene, tall }) => tall && scene !== first && scene !== second).scene;
    // (On, one at a time, each come in over the last and the last let go of)
    const onTo = async (scene) => {
        for (let k = 0; k < BACKDROPS.length && (await shown())[0]?.scene !== scene; k++) {
            await next();
            await expect.poll(async () => (await shown()).length, { timeout: 10000 }).toBe(1);
        }
    };

    await page.context().route(`**/images/backdrops/${broken}-tall.avif`, (route) => route.fulfill({ status: 200, contentType: "image/avif", body: "not a picture" }));
    await page.setViewportSize({ width: 1280, height: 800 });
    await title(page);
    await expect.poll(shown, { timeout: 10000 }).toEqual([{ scene: first, file: `${first}-wide.avif`, shown: true }]);
    expect((await behind())[0].width).toBeGreaterThan(1000);

    // (Drifting as it's shown, slowly: grown and moved a little, a second on, on the graphics card)
    const drift = () => page.evaluate(() => [...document.querySelectorAll("#backdrop img")].map((img) => ({ drifting: img.getAnimations().length, transform: getComputedStyle(img).transform })));
    const [still] = await drift();

    await page.waitForTimeout(1000);

    const [later] = await drift();

    expect(still.drifting).toBe(1);
    expect(later.transform).not.toBe(still.transform);

    // The next, on a computer: the next scene painted wide, the one under it let go of once it's
    // faded out; held upright, one painted both ways turns with the screen, its tall one shown
    await next();
    await expect.poll(shown, { timeout: 10000 }).toEqual([{ scene: second, file: `${second}-wide.avif`, shown: true }]);
    expect(BACKDROPS.find(({ scene }) => scene === second).tall).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(shown, { timeout: 10000 }).toEqual([{ scene: second, file: `${second}-tall.avif`, shown: true }]);
    await page.setViewportSize({ width: 1280, height: 800 });

    // On to one painted only wide; held upright, it gives way to the next painted tall; and on to
    // one whose AVIF won't show, as WebP
    await onTo(wideOnly);
    await expect.poll(shown, { timeout: 10000 }).toEqual([{ scene: wideOnly, file: `${wideOnly}-wide.avif`, shown: true }]);

    const upright = after(wideOnly, "tall");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(shown, { timeout: 10000 }).toEqual([{ scene: upright, file: `${upright}-tall.avif`, shown: true }]);
    await onTo(broken);
    await expect.poll(shown, { timeout: 10000 }).toEqual([{ scene: broken, file: `${broken}-tall.webp`, shown: true }]);
    await expect(page.locator("#backdrop")).toBeVisible();

    // Making a character: none behind its 3D view, nor held; back at the title, the first again
    await page.locator("#newbutton").click();
    await expect(page.locator("#create")).toBeVisible();
    await expect(page.locator("#backdrop")).toBeHidden();
    expect(await behind()).toEqual([]);
    await page.locator("#createback").click();
    await expect(page.locator("#title")).toBeVisible();
    await expect.poll(shown, { timeout: 10000 }).toEqual([{ scene: first, file: `${first}-tall.avif`, shown: true }]);

    // With less motion asked for, the next one still: no drift
    await page.emulateMedia({ reducedMotion: "reduce" });
    await next();
    await expect.poll(async () => (await shown()).map(({ scene }) => scene), { timeout: 10000 }).toEqual([after(first, "tall")]);
    expect(await drift()).toEqual([{ drifting: 0, transform: "none" }]);
});

test("loaded again, the game asks the server for none of its code, engine, WebAssembly, body or fonts: the service worker keeps each by the hash of its bytes, and gives what its workers ask for by name from the same copies; a file it hasn't, it fetches, that one alone", async ({ page }) => {
    // (Played twice over, and a third time: more than the usual time)
    test.setTimeout(300000);

    // (The page's own: each test's page is in a browser of its own, e2e/fixtures.js)
    const context = page.context();

    // What reaches the server: what the service worker fetches, and anything the page fetches that
    // the service worker doesn't answer
    const fetched = [];
    const heard = (url) => fetched.push(new URL(url).pathname);

    context.on("request", (request) => request.serviceWorker() && heard(request.url()));
    page.on("requestfinished", async (request) => {
        // (None once the page's closed, as the test ends with a request still finishing)
        const response = await request.response().catch(() => null);

        if (response && !response.fromServiceWorker() && !request.serviceWorker()) {
            heard(request.url());
        }
    });

    // (The first time, looked after by the service worker from the start: it's given a moment to
    // take over before the loader starts)
    await playing(page, "/?play&seed=1");
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    const files = (paths) => paths.filter((path) => /\.(m?js|wasm|woff2|bin)$|\/characters\//.test(path));
    const first = files(fetched);

    expect(first).toContain("/js/app/game.js");
    expect(first).toContain("/js/world/navworker.js");

    // Again: none of them but version.js (stamped with the commit after the manifest's made, so asked
    // for by name: scripts/stamp-version.js)
    fetched.length = 0;
    await page.reload();
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
    expect(files(fetched)).toEqual(["/js/app/version.js"]);

    // (And the loading screen knew: all of it from this device, none downloaded)
    expect(await page.evaluate(() => ({ kept: window.pellagos.loader.kept === window.pellagos.loader.total, downloaded: window.pellagos.loader.downloaded }))).toEqual({ kept: true, downloaded: 0 });

    // One the service worker hasn't (as if it changed): that one alone, by its hash
    const gone = await page.evaluate(async () => {
        const cache = await caches.open("pellagos-boot-v2");
        const url = (await cache.keys()).map(({ url }) => url).find((url) => url.includes("/js/app/hud.js?h="));

        await cache.delete(url);

        return new URL(url).pathname;
    });

    fetched.length = 0;
    await page.reload();
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
    expect(files(fetched).toSorted()).toEqual([gone, "/js/app/version.js"].toSorted());
});

test("an update's downloaded in the background: the page finds a release newer than its own, the service worker downloads what of it it doesn't keep, that alone, and the title screen says so, with a button that starts it", async ({ page }) => {
    test.setTimeout(240000);

    // What the service worker fetches (in the page's own context: each test's page is in a
    // browser of its own, e2e/fixtures.js)
    const context = page.context();
    const fetched = [];

    context.on("request", (request) => request.serviceWorker() && fetched.push(new URL(request.url()).pathname));

    await title(page);
    await expect(page.locator("#titleupdate")).toBeHidden();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

    // (As if this page were an older release's, and the newer one had changed hud.js: the page
    // on the server is the newer one, and the service worker doesn't keep its hud.js)
    fetched.length = 0;

    const changed = await page.evaluate(async () => {
        const cache = await caches.open("pellagos-boot-v2");
        const url = (await cache.keys()).map(({ url }) => url).find((url) => url.includes("/js/app/hud.js?h="));

        await cache.delete(url);

        const { updater } = window.pellagos;

        updater.release = "0000000000";
        await updater.check({ asked: true });

        return new URL(url).pathname;
    });

    await expect(page.locator("#titleupdate")).toBeVisible({ timeout: 30000 });
    expect(fetched.filter((path) => path.endsWith(".js"))).toEqual([changed]);
    expect(await page.evaluate(() => window.pellagos.updater.ready?.release)).toBe(await page.evaluate(() => window.pellagos.updater.next.release));

    // Started: the page loaded again, its title with nothing more to say
    await page.locator("#updatebutton").click();
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
    await expect(page.locator("#titleupdate")).toBeHidden();
});

test("the title's name on its crest's ribbon, every letter painted, in the ribbon's middle, the title's card under the crest: on a computer, on a phone held upright, a small one, and one on its side", async ({ page }) => {
    // Each letter against its own box, which its gradient's painted in; the name against the
    // ribbon (crest.js CREST.ribbon), and the card against the crest
    const fits = () =>
        page.evaluate(async () => {
            const { CREST } = await import("/js/app/crest.js");
            const box = document.querySelector("#crest").getBoundingClientRect();
            const name = document.createRange();

            name.selectNodeContents(document.querySelector("#titlename"));

            const text = name.getBoundingClientRect();
            const card = document.querySelector("#title .card").getBoundingClientRect();
            const { left, right, top, bottom } = CREST.ribbon;
            const ribbon = { left: box.left + left * box.width, right: box.left + right * box.width, top: box.top + top * box.height, bottom: box.top + bottom * box.height };
            const painted = [...document.querySelectorAll("#titlename .letter")].every((letter) => {
                const range = document.createRange();

                range.selectNodeContents(letter);

                const [glyph, own] = [range.getBoundingClientRect(), letter.getBoundingClientRect()];

                return glyph.left >= own.left - 0.5 && glyph.right <= own.right + 0.5;
            });

            return {
                painted,
                inRibbon: text.left >= ribbon.left && text.right <= ribbon.right && text.top >= ribbon.top - 2 && text.bottom <= ribbon.bottom + 2,
                centred: Math.abs((text.left + text.right) / 2 - (ribbon.left + ribbon.right) / 2) < box.width * 0.02,
                onScreen: box.left >= 0 && box.right <= innerWidth,
                under: card.top >= box.bottom - 1,
            };
        });
    const all = { painted: true, inRibbon: true, centred: true, onScreen: true, under: true };

    await title(page);
    expect(await fits()).toEqual(all);

    for (const [width, height] of [
        [393, 852],
        [320, 640],
        [844, 390],
    ]) {
        await page.setViewportSize({ width, height });
        expect(await fits(), `${width} by ${height}`).toEqual(all);
    }
});

test("the crest over the loading screen and the title: PELLAGOS on its ribbon, forged a letter at a time as the page opens, glinting, embers rising off it, the eyes under the town blinking; the same crest over the title, not forged again; none of it moving with less motion asked for, nor seen in the game", async ({ page }) => {
    await page.goto("/");

    const crest = page.locator("#crest");
    const letters = page.locator("#titlename .letter");

    // (Over the loading screen as the page opens, the name on its ribbon a letter at a time, read as
    // the name it is; forged, then forged for good)
    await expect(crest).toBeVisible();
    await expect(letters).toHaveCount(8);
    await expect(page.locator("#titlename")).toHaveAttribute("aria-label", "Pellagos");
    await expect(page.locator("#loading")).toHaveAttribute("aria-labelledby", "titlename");

    const forging = await page.evaluate(() => document.querySelector("#crest").classList.contains("forging") || document.querySelector("#crest").dataset.forged === "true");

    expect(forging).toBe(true);
    await expect(crest).not.toHaveClass(/forging/, { timeout: 10000 });
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    // Over the title: its letters struck and cooled (each all there, none still hot), its picture
    // the AVIF, see-through about it and solid in its middle (where it's placed: the test before this)
    const placed = await page.evaluate(() => {
        const img = document.querySelector("#crest .crest-art");
        const canvas = Object.assign(document.createElement("canvas"), { width: img.naturalWidth, height: img.naturalHeight });
        const context = canvas.getContext("2d");
        const alpha = (x, y) => context.getImageData(Math.round(x * canvas.width), Math.round(y * canvas.height), 1, 1).data[3];

        context.drawImage(img, 0, 0);

        return {
            letters: [...document.querySelectorAll("#titlename .letter")].map((letter) => ({ shown: Number(getComputedStyle(letter).opacity), hot: Number(getComputedStyle(letter, "::after").opacity) })),
            picture: img.currentSrc.split("/").pop(),
            about: [alpha(0.005, 0.01), alpha(0.995, 0.01), alpha(0.005, 0.99), alpha(0.995, 0.99), alpha(0.5, 0.005)],
            middle: alpha(0.5, 0.5),
        };
    });

    expect(placed.letters.every(({ shown, hot }) => shown === 1 && hot === 0), JSON.stringify(placed.letters)).toBe(true);
    expect(placed.picture).toBe("crest.avif");
    // (Nearly nothing of it about it, nearly all in its middle: an AVIF's see-through, kept as small
    // as it is, a little out)
    expect(placed.about.every((alpha) => alpha <= 4), JSON.stringify(placed.about)).toBe(true);
    expect(placed.middle).toBeGreaterThanOrEqual(250);

    // Embers rising off it (its canvas drawn on), the torch's glint and flicker playing, and its
    // eyes blinking now and then (told to now: each lid closed over its eye a moment, then open)
    await expect.poll(() => page.evaluate(() => {
        const canvas = document.querySelector("#crest .crest-embers");
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;

        for (let k = 3; k < pixels.length; k += 4) {
            lit += pixels[k] > 0 ? 1 : 0;
        }

        return lit;
    }), { timeout: 10000 }).toBeGreaterThan(20);

    const moving = await page.evaluate(() => ({
        glint: document.querySelector("#crest .crest-sheen").getAnimations().length,
        flicker: document.querySelector("#crest .crest-glow").getAnimations().length,
    }));

    expect(moving).toEqual({ glint: 1, flicker: 1 });

    const blink = await page.evaluate(async () => {
        const lid = document.querySelector("#crest .crest-lid.left");
        const shut = () => new DOMMatrix(getComputedStyle(lid).transform).d;
        const before = shut();

        window.pellagos.crest.blink();

        let most = before;

        for (let k = 0; k < 30; k++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            most = Math.max(most, shut());
        }

        await new Promise((resolve) => setTimeout(resolve, 400));

        return { before, most, after: shut() };
    });

    expect(blink.before).toBe(0);
    expect(blink.most).toBeGreaterThan(0.9);
    expect(blink.after).toBe(0);

    // In the game (making a character): not seen, nothing of it moving
    await page.locator("#newbutton").click();
    await expect(page.locator("#create")).toBeVisible();
    await expect(crest).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.crest.on)).toBe(false);

    // With less motion asked for: forged already as the page opens, no embers, no glint
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(crest).toBeVisible();
    expect(await page.evaluate(() => document.querySelector("#crest").classList.contains("forging"))).toBe(false);
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });

    const still = await page.evaluate(() => ({
        frame: window.pellagos.crest.frame,
        glint: document.querySelector("#crest .crest-sheen").getAnimations().length,
        flicker: document.querySelector("#crest .crest-glow").getAnimations().length,
        shown: [...document.querySelectorAll("#titlename .letter")].every((letter) => Number(getComputedStyle(letter).opacity) === 1),
    }));

    expect(still).toEqual({ frame: null, glint: 0, flicker: 0, shown: true });
});

test("debug mode shows how the game runs, and is remembered", async ({ page }) => {
    await title(page);
    await expect(page.locator("#debug")).toBeHidden();

    await page.getByText("Debug mode").click();
    await expect(page.locator("#debug")).toBeVisible();
    await expect(page.locator("#debugstats")).toContainText("Draws");
    await expect(page.locator("#debugstats")).toContainText("Downloaded");

    // Folding it away leaves just its header
    await page.locator("#debugcollapse").click();
    await expect(page.locator("#debugstats")).toBeHidden();
    await page.locator("#debugcollapse").click();

    await page.reload();
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
    await expect(page.locator("#debug")).toBeVisible();
    await expect(page.locator("#debugswitch")).toBeChecked();

    await page.getByText("Debug mode").click();
    await expect(page.locator("#debug")).toBeHidden();
});

test("the title's About: what the game is and how it's played, scrolled through, its contents taking you to each part, and closed", async ({ page }) => {
    await title(page);

    // (At the bottom of the title, under everything else)
    const about = page.locator("#aboutbutton");

    await expect(about).toBeVisible();

    const [button, card, debug] = await Promise.all([about.boundingBox(), page.locator("#title .card").boundingBox(), page.locator("#title").getByText("Debug mode").boundingBox()]);

    expect(button.y).toBeGreaterThan(debug.y + debug.height - 1);
    expect(button.y + button.height).toBeGreaterThan(card.y + card.height - 48);

    await about.click();
    await expect(page.locator("#about")).toBeVisible();
    await expect(page.locator("#abouttitle")).toHaveText("About Pellagos");
    await expect(page.locator("#aboutbody h3")).toHaveText(["The game", "Starting", "Getting about", "Fighting", "Magic", "Gear and gold", "Towns and folk", "The world and its war", "Your party", "Playing together", "Saving", "Keys", "Options", "Credits"]);
    await expect(page.locator("#aboutversion")).toContainText("Version");

    // Longer than the screen: it scrolls, starting at the top
    const body = page.locator("#aboutbody");
    const sizes = await body.evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight, top: element.scrollTop }));

    expect(sizes.scroll).toBeGreaterThan(sizes.client * 2);
    expect(sizes.top).toBe(0);

    // Its contents take you to each part
    await page.locator('#about [data-to="about-keys"]').click();
    await expect.poll(() => page.locator("#about-keys").evaluate((section) => Math.abs(section.getBoundingClientRect().top - section.parentElement.getBoundingClientRect().top))).toBeLessThan(30);
    await expect(page.locator("#about-keys table")).toContainText("Escape");

    await page.locator('#about [data-to="about-credits"]').click();
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(sizes.client);
    await expect(page.locator("#about-credits").getByRole("link", { name: "README on GitHub" })).toHaveAttribute("href", /github\.com\/hoffspot\/conquest/);

    await page.locator("#aboutclose").click();
    await expect(page.locator("#about")).toBeHidden();
    await expect(page.locator("#title")).toBeVisible();

    // (Closed, what it says is out of the page: the labels it names are found once, where they are)
    await expect(page.locator("#aboutbody")).toBeEmpty();
    await expect(page.getByText("Debug mode")).toHaveCount(1);

    // Opened again, it starts from the top
    await about.click();
    await expect(page.locator("#about")).toBeVisible();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("#about")).toBeHidden();
});

test("Worlds on servers' Worlds Guide: every way into a world, with examples, its contents and its own pointers taking you to each part; on a phone, nothing wider than the screen; closed, back to the worlds", async ({ page }) => {
    await title(page);
    await page.locator("#worldsbutton").click();
    await expect(page.locator("#worlds")).toBeVisible();

    // (Over the worlds, which stay open under it)
    await page.getByRole("button", { name: "Worlds Guide" }).click();

    const guide = page.locator("#worldsguide");
    const body = page.locator("#worldsguidebody");
    // (A part at the top of what's read)
    const atTop = (id) => page.locator(`#${id}`).evaluate((section) => Math.abs(section.getBoundingClientRect().top - section.parentElement.getBoundingClientRect().top));

    await expect(guide).toBeVisible();
    await expect(page.locator("#worlds")).toBeVisible();
    await expect(page.locator("#worldsguidetitle")).toHaveText("Worlds Guide");
    await expect(page.locator("#worldsguidebody h3")).toHaveText(["Which way in?", "Two kinds of world", "Your characters in a world on a server", "A friend's world, by its code", "Players' worlds on a server", "Invite links", "A server's address", "Servers nearby", "Open worlds", "Short codes", "Keys", "Coming back, and other devices", "Who you come as", "A world of your own on a server", "When it won't join"]);
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);

    // What you've been given, and what to do with it; and examples of each kind of code and link
    await expect(page.locator(".guide-ways th")).toHaveCount(9);
    await expect(page.locator(".guide-ways").getByText("KQWX")).toBeVisible();
    await expect(page.locator("#worldsguidebody .guide-example")).toHaveCount(4);
    await expect(page.locator("#guide-short .guide-example")).toContainText("7KQM-2XWD");

    // Its contents take you to a part, and so does a part's pointer to another
    await page.locator('#worldsguide nav [data-to="guide-short"]').click();
    await expect.poll(() => atTop("guide-short")).toBeLessThan(30);
    await page.locator('#worldsguide nav [data-to="guide-ways"]').click();
    await expect.poll(() => atTop("guide-ways")).toBeLessThan(30);
    await page.locator("#guide-ways").getByRole("button", { name: "Keys" }).click();
    await expect.poll(() => atTop("guide-key")).toBeLessThan(30);

    // Back to the worlds, what it says out of the page
    await page.locator("#worldsguideclose").click();
    await expect(guide).toBeHidden();
    await expect(page.locator("#worlds")).toBeVisible();
    await expect(body).toBeEmpty();

    // On a phone: its contents swiped along one row, the table one under the other, and nothing,
    // the longest link included, wider than the screen
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Worlds Guide" }).click();
    await expect(guide).toBeVisible();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(0);
    expect(await page.locator(".guide-ways th").first().evaluate((cell) => getComputedStyle(cell).display)).toBe("block");
    await page.locator('#worldsguide nav [data-to="guide-link"]').click();
    await expect.poll(() => atTop("guide-link")).toBeLessThan(30);
    expect(await body.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await guide.evaluate((dialog) => dialog.getBoundingClientRect().right)).toBeLessThanOrEqual(390);

    // (Escape closes the guide alone)
    await page.keyboard.press("Escape");
    await expect(guide).toBeHidden();
    await expect(page.locator("#worlds")).toBeVisible();
});

// (The pixels it draws counted: at the screen's own, a pixel a pixel, not the half the others
// are drawn at: playwright.config.js)
test.describe("drawn at the screen's own pixels", () => {
    test.use({ deviceScaleFactor: 1 });

    test("keeps up: draws fewer pixels, then a level lower, while it can't, says so in Game options and debug mode; Visual quality and Adaptive in Game options", async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ debug: true, sound: false, quality: "high" })));
        await playing(page, "/?play&seed=2");

        // (Under automation Adaptive's off, and how it judges is app/governor.js's tests': here it's
        // told it can't keep up, twice, as it would on a slow phone)
        const stepped = await page.evaluate(async () => {
            const { game, session } = window.pellagos;
            const view = session.view;
            const before = view.renderer.getPixelRatio();
            const told = [
                { quality: "high", scale: 0.85 },
                { quality: "medium", scale: 1 },
            ];
            const seen = [];

            view.adaptive = true;
            game.governor.observe = () => told.shift() ?? null;

            await new Promise((resolve) => {
                const wait = () => {
                    seen.push([view.qualityName, view.adaptiveScale, view.renderer.getPixelRatio()]);

                    if (view.qualityName === "medium") {
                        resolve();
                    } else {
                        requestAnimationFrame(wait);
                    }
                };

                wait();
            });

            return { before, fewer: seen.find(([, scale]) => scale === 0.85), now: [view.qualityName, view.adaptiveScale, view.chosenQuality] };
        });

        expect(stepped.fewer[2]).toBeCloseTo(stepped.before * 0.85, 5);
        expect(stepped.now).toEqual(["medium", 1, "high"]);
        await expect(page.locator("#debugstats")).toContainText("Quality medium (high chosen: keeping up)");

        // Game options, Graphics: the quality chosen, Adaptive, and what it's drawing to keep up
        await page.locator("#menubutton").click();
        await page.locator("#optionsbutton").click();
        await page.locator("#graphicsbutton").click();
        await expect(page.locator("#qualityname")).toHaveText("High");
        await expect(page.locator("#adaptiveswitch")).toBeChecked();
        await page.evaluate(() => window.pellagos.game.onAdapt({ quality: "medium", scale: 1 }));
        await expect(page.locator("#adapted")).toHaveText("Keeping up: drawing medium");

        // (A quality chosen: drawn at it, every pixel, starting again from there)
        await page.locator("#qualityslider").evaluate((slider) => {
            slider.value = "0";
            slider.dispatchEvent(new Event("input", { bubbles: true }));
            slider.dispatchEvent(new Event("change", { bubbles: true }));
        });
        await expect(page.locator("#qualityname")).toHaveText("Low");

        const chosen = await page.evaluate(() => {
            const { game, session } = window.pellagos;

            return { quality: session.view.qualityName, chosen: session.view.chosenQuality, scale: session.view.adaptiveScale, ratio: session.view.renderer.getPixelRatio(), step: game.governor.step, saved: JSON.parse(localStorage.getItem("pellagos.settings")).quality };
        });

        expect(chosen).toEqual({ quality: "low", chosen: "low", scale: 1, ratio: 1, step: 0, saved: "low" });
        await expect(page.locator("#adapted")).toBeHidden();

        // (Adaptive off: remembered, and the game left at the quality chosen)
        await page.locator("label:has(#adaptiveswitch)").click();
        await expect(page.locator("#adaptiveswitch")).not.toBeChecked();
        expect(await page.evaluate(() => [window.pellagos.session.view.adaptive, JSON.parse(localStorage.getItem("pellagos.settings")).adaptive])).toEqual([false, false]);
    });
});

test("the debug log (Game options): a crash found from the last game's notes, a frame held up kept with where its time went and what was held, an error with its stack; shown, copied and cleared", async ({ page }) => {
    test.setTimeout(180000);

    // (The last game fell over while playing: its notes left behind, never closed, and a boggart's
    // dressing begun after them)
    await page.addInitScript(() => {
        if (!sessionStorage.getItem("noted")) {
            sessionStorage.setItem("noted", "yes");
            localStorage.setItem("pellagos.alive", JSON.stringify({ at: Date.now() - 30000, pageAt: 245000, build: "earlier", code: "1a2b3c4d5e", built: "2026-10-14T09:00:00Z", closed: false, state: { map: "town", bodies: { drawn: 61 } }, trend: [{ at: 243, totalMB: 590, avatars: 31 }, { at: 245, totalMB: 600, avatars: 32 }], recent: [16, 17, 950], jobs: [{ label: "crowd figure herd:wolf:1", ms: 70 }], errors: [] }));
            localStorage.setItem("pellagos.working", JSON.stringify([{ label: "dressing folk folk-3", at: 244100 }, { label: "dressing beast boggart", at: 246072 }]));
        }
    });
    await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ sound: false, quality: "low" })));
    await playing(page, "/?play&seed=2");

    const crash = await page.evaluate(() => window.pellagos.telemetry.events.find(({ kind }) => kind === "crash"));

    // (Named by the code it was, not the code now: what that game's notes said)
    expect(crash).toMatchObject({ build: "earlier", code: "1a2b3c4d5e", built: "2026-10-14T09:00:00Z", pageAt: 245000, state: { map: "town", bodies: { drawn: 61 } }, jobs: [{ label: "crowd figure herd:wolf:1" }] });
    expect(crash.summary).toContain("loaded again");
    expect(crash.trend.map(({ totalMB }) => totalMB)).toEqual([590, 600]);
    expect(crash.begun).toEqual([
        { label: "dressing folk folk-3", at: 244100 },
        { label: "dressing beast boggart", at: 246072, afterNotes: true },
    ]);

    // A frame held up while playing (its drawing, 600 ms longer than it is), and an error no one
    // caught: each kept, the log cleared first so nothing before stands in their way
    const kept = await page.evaluate(async () => {
        const { game, telemetry } = window.pellagos;
        const render = game.view.render.bind(game.view);
        let held = false;

        game.start();
        game.view.render = (...args) => {
            if (!held) {
                held = true;
                telemetry.clear();

                const until = performance.now() + 600;

                while (performance.now() < until) {
                    // (held up)
                }
            }

            return render(...args);
        };

        // (Till that frame's been held up and its freeze kept: not one kept before, a slow frame
        // as play began, which the log's clearing then lets go of)
        for (let k = 0; k < 600 && !(held && telemetry.events.some(({ kind }) => kind === "freeze")); k++) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }

        // (As the browser tells the page of one no one caught: thrown for real, it'd fail the test)
        window.dispatchEvent(new ErrorEvent("error", { error: new Error("A test's error, thrown on purpose"), message: "A test's error, thrown on purpose" }));
        game.view.render = render;

        return telemetry.events.map(({ kind, where, ms, phases, error, state, recent }) => ({ kind, where, ms, draw: phases?.draw, stack: error?.stack, map: state?.map, memory: state?.memory, recent: recent?.length }));
    });
    const freeze = kept.find(({ kind }) => kind === "freeze");
    const error = kept.find(({ kind }) => kind === "error");

    // (What else was kept said, should the frame held up not be the one)
    const all = JSON.stringify(kept.map(({ kind, where, ms, draw }) => ({ kind, where, ms, draw })));

    expect(freeze, all).toMatchObject({ where: "frame", map: "town" });
    expect(freeze.ms, all).toBeGreaterThanOrEqual(600);
    expect(freeze.draw, all).toBeGreaterThanOrEqual(600);
    expect(freeze.recent).toBeGreaterThan(0);

    // (With what the game held then: the graphics card's, told at the calls that give it things)
    expect(freeze.memory.gpu.totalMB).toBeGreaterThan(10);
    expect(freeze.memory.gpu.texturesMB).toBeGreaterThan(0);
    expect(freeze.memory.held.avatars).toBeGreaterThan(0);

    // (And what Safari wouldn't tell: the bodies' own copies on the page, and the way-finding's
    // WebAssembly)
    expect(freeze.memory.bodiesMB).toBeGreaterThan(1);
    expect(freeze.memory.wasmMB).toBeGreaterThanOrEqual(16);
    expect(error.stack).toContain("A test's error, thrown on purpose");

    // Game options (the menu pausing the game: nothing more kept meanwhile): the Debug log, each
    // kept, the newest first, opening on what was going on
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#logbutton").click();
    await expect(page.locator("#menulog")).toBeVisible();

    const shown = await page.evaluate(() => window.pellagos.telemetry.events.map(({ kind }) => kind));

    expect(shown).toEqual(expect.arrayContaining(["freeze", "error"]));
    await expect(page.locator("#logentries .log-entry")).toHaveCount(shown.length);
    await expect(page.locator("#logentries")).toContainText("Error: A test's error, thrown on purpose");
    await expect(page.locator("#logentries")).toContainText("freeze in a frame's work");
    await expect(page.locator("#logversion"), "which code this is: run from the repository, dev").toContainText("This copy: code dev");
    await page.locator("#logentries .log-entry", { hasText: "Freeze" }).locator("summary").click();
    await expect(page.locator("#logentries .log-entry", { hasText: "Freeze" }).locator("pre")).toContainText('"draw"');

    // (Copied, as text to send on: what's given the clipboard kept here, a headless browser's
    // clipboard not to be read back)
    await page.evaluate(() => Object.defineProperty(navigator.clipboard, "writeText", { value: async (text) => (window.copied = text) }));
    await page.locator("#logcopy").click();
    await expect(page.locator("#logstatus")).toContainText("Copied");

    const copied = JSON.parse(await page.evaluate(() => window.copied));

    expect(copied.events.map(({ kind }) => kind)).toEqual(shown);
    expect(copied.build, "which release it was (catalog.js's)").toMatch(/^[0-9a-f]{6,}$/);
    expect(copied.code, "which code it was (version.js's)").toBe("dev");
    expect(copied.events.find(({ kind }) => kind === "freeze").code).toBe("dev");

    // (Cleared: nothing kept, here or the next time)
    await page.locator("#logclear").click();
    await expect(page.locator("#logentries")).toContainText("Nothing kept");
    expect(await page.evaluate(() => localStorage.getItem("pellagos.debuglog"))).toBeNull();
    await page.locator("#logback").click();
    await expect(page.locator("#menuoptions")).toBeVisible();
});

test("making a character, the mouse dragged across the view walks round them, and its wheel comes nearer, never so near the camera cuts into them", async ({ page }) => {
    test.setTimeout(180000);
    await title(page);
    await page.getByRole("button", { name: "New character" }).click();
    await expect(page.locator("#create")).toBeVisible();
    await page.waitForFunction(() => window.pellagos.creator?.avatar);

    // (Beside the panel: the view, under the screen it's on)
    const panel = await page.locator(".creator").boundingBox();
    const [x, y] = [panel.x / 2, panel.y + panel.height / 2];

    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).id, [x, y])).toBe("view");

    const start = await page.evaluate(() => ({ ...window.pellagos.creator.orbit }));

    await page.mouse.move(x - 100, y);
    await page.mouse.down();
    await page.mouse.move(x + 100, y, { steps: 10 });
    await page.mouse.up();

    const turned = await page.evaluate(() => ({ ...window.pellagos.creator.orbit }));

    expect(turned.target).toBeLessThan(start.target - 0.5);

    // (Dragged with the right button too, and no menu of the browser's own over the view: "Save
    // image as" and the like, as a player on a PC found turning the camera)
    await page.evaluate(() => window.addEventListener("contextmenu", (event) => (window.menuShown = !event.defaultPrevented)));
    await page.mouse.down({ button: "right" });
    await page.mouse.move(x - 100, y, { steps: 10 });
    await page.mouse.up({ button: "right" });
    expect(await page.evaluate(() => window.pellagos.creator.orbit.target)).toBeGreaterThan(turned.target + 0.5);
    expect(await page.evaluate(() => window.menuShown)).toBe(false);

    // The wheel turned towards them as far as it goes: nearer than the tab frames them from, and
    // no nearer than lets the camera keep out of them, all the way round
    for (let k = 0; k < 30; k++) {
        await page.mouse.wheel(0, -400);
    }

    const zoomed = await page.evaluate(() => window.pellagos.creator.orbit.zoom);

    expect(zoomed).toBeLessThan(0.5);
    expect(zoomed).toBeGreaterThan(0);

    for (let turn = 0; turn < 4; turn++) {
        await page.evaluate((turn) => (window.pellagos.creator.orbit.target = turn * (Math.PI / 2)), turn);
        await creatorSettled(page, 0.52);

        const { gap, near, distance } = await creatorGap(page);

        expect(distance).toBeLessThan(4.5);
        expect(gap, `turned ${turn} quarters`).toBeGreaterThan(near);
    }

    // And back out, no further than half as far again as the tab frames them from
    for (let k = 0; k < 60; k++) {
        await page.mouse.wheel(0, 400);
    }

    expect(await page.evaluate(() => window.pellagos.creator.orbit.zoom)).toBe(1.6);
});

test("makes a character: a random look, a weapon and a name, then plays them in the town square", async ({ page }) => {
    // Every step draws the character, which takes a while without a GPU
    test.setTimeout(180000);
    await title(page);
    await page.getByRole("button", { name: "New character" }).click();
    await expect(page.locator("#create")).toBeVisible();
    await page.waitForFunction(() => window.pellagos.creator?.avatar);

    // The look: body, face, colours and hair tabs, and a random character
    for (const tab of ["Face", "Colours & hair", "Body"]) {
        await page.getByRole("tab", { name: tab }).click();
        await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    }

    const before = await page.evaluate(() => JSON.stringify(window.pellagos.creator.hero.shape));

    await page.getByRole("button", { name: "Random" }).click();
    expect(await page.evaluate(() => JSON.stringify(window.pellagos.creator.hero.shape))).not.toBe(before);

    // A weapon: every starting weapon is offered; the bow comes with a quiver; and spiked boots
    // can be worn with it (to kick whoever's next to you)
    await page.getByRole("button", { name: "Next: weapon" }).click();
    await expect(page.locator('.weapon[role="radio"]')).toHaveCount(8);
    await page.locator('[data-weapon="bow"]').click();
    await page.waitForFunction(() => window.pellagos.creator.avatar.character.items.some((item) => item.name === "bow"));
    expect(await page.evaluate(() => window.pellagos.creator.avatar.character.items.map((item) => item.name))).toEqual(expect.arrayContaining(["bow", "quiver"]));
    await expect(page.locator("#bootstoggle")).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("#bootstoggle .numbers")).toContainText("up close (kicks)");
    await page.locator("#bootstoggle").click();
    await expect(page.locator("#bootstoggle")).toHaveAttribute("aria-checked", "true");
    await page.waitForFunction(() => window.pellagos.creator.avatar.character.items.some((item) => item.name === "spikedBoots"));

    // A name
    await page.getByRole("button", { name: "Next: name" }).click();
    await page.locator("#nameinput").fill("  Tamsin  Rowe ");
    await expect(page.locator("#namesummary")).toContainText("Tamsin Rowe, with a bow and spiked boots");
    await page.getByRole("button", { name: "Begin" }).click();

    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#playerplate .name")).toHaveText("Tamsin Rowe");

    const game = await page.evaluate(async () => {
        const { MARGIN, navigatorOf } = await import("/js/core/navigation.js");
        const { WAIT_BEYOND } = await import("/js/core/battle.js");
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [cx, cy] = game.world.town.centre;
        const [ox, oy] = game.world.origin;

        const character = game.avatars.get("player").character;

        // (The navigation tiles the ways found near them never wait for, baked off the page's
        // thread as the game loaded, and in before it began: not baked on the page in the world's
        // first steps, as they were, holding an iPhone up as it began)
        const navigation = navigatorOf(game.world.maps.town);
        const reach = WAIT_BEYOND + MARGIN;
        const [tx0, ty0] = navigation.tileOf(player.x - reach, player.y - reach);
        const [tx1, ty1] = navigation.tileOf(player.x + reach, player.y + reach);
        const near = [];

        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                near.push(navigation.has(tx, ty));
            }
        }

        return {
            nearBaked: near.length > 0 && near.every(Boolean),
            weapon: player.weapon,
            boots: player.boots,
            equipment: [...character.equipment.values()],
            // (The bow slung on the back to start with)
            sheathed: character.sheathed,
            bowOn: character.items.find((item) => item.name === "bow").parent.name,
            inSquare: Math.hypot(player.x - (ox + cx), player.y - (oy + cy)) < 10,
        };
    });
    const saved = await keptOf(page, "save");

    expect(game.weapon).toBe("bow");
    expect(game.boots).toBe(true);
    expect(game.equipment).toEqual(expect.arrayContaining(["tunic", "bracers", "breeches", "spikedBoots", "bow", "quiver"]));
    expect(game.equipment).not.toContain("boots");
    expect(game.sheathed).toBe(true);
    expect(game.bowOn).toBe("Spine2");
    expect(game.inSquare).toBe(true);
    expect(game.nearBaked).toBe(true);
    expect(saved.hero.name).toBe("Tamsin Rowe");
    expect(saved.hero.weapon).toBe("bow");
    expect(saved.hero.boots).toBe(true);
});

test("makes a character of another people: a cat folk's ears, tail and fur, their colours, random as one of them; played, they wake in a town of their people's, as one of them", async ({ page }) => {
    test.setTimeout(180000);
    await title(page);
    await page.getByRole("button", { name: "New character" }).click();
    await page.waitForFunction(() => window.pellagos.creator?.avatar);

    // The peoples to choose from: humans to start with
    const peoples = page.getByRole("radiogroup", { name: "People" });

    await expect(peoples.getByRole("radio")).toHaveText(["Human", "Elf", "Dark elf", "Cat folk", "Lizard folk", "Orc"]);
    await expect(peoples.getByRole("radio", { name: "Human" })).toHaveAttribute("aria-checked", "true");

    // Cat folk: their ears and tail on, furred, their colours to choose from
    await peoples.getByRole("radio", { name: "Cat folk" }).click();
    await expect(page.getByRole("radiogroup", { name: "People" }).getByRole("radio", { name: "Cat folk" })).toHaveAttribute("aria-checked", "true");
    await page.waitForFunction(() => [...window.pellagos.creator.avatar.character.equipment.values()].includes("catTail"));

    const cat = await page.evaluate(() => {
        const { creator } = window.pellagos;

        return { race: creator.hero.race, parts: creator.hero.parts, fur: creator.hero.look.skin.fur, equipment: [...creator.avatar.character.equipment.values()] };
    });

    expect(cat.race).toBe("cat");
    expect(cat.parts).toEqual(["catEars", "catTail"]);
    expect(cat.fur).toBeGreaterThan(0.5);
    expect(cat.equipment).toEqual(expect.arrayContaining(["catEars", "catTail"]));

    await page.getByRole("tab", { name: "Colours & hair" }).click();
    await expect(page.getByRole("radiogroup", { name: "Tone" }).getByRole("radio")).toHaveCount(6);

    // Random: another of them
    await page.getByRole("button", { name: "Random" }).click();
    expect(await page.evaluate(() => [window.pellagos.creator.hero.race, window.pellagos.creator.hero.parts])).toEqual(["cat", ["catEars", "catTail"]]);

    // Named, and played: in a town of theirs, of their people, their ears and tail on
    await page.getByRole("button", { name: "Next: weapon" }).click();
    await page.getByRole("button", { name: "Next: name" }).click();
    await page.locator("#nameinput").fill("Mirra");
    await page.getByRole("button", { name: "Begin" }).click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    const played = await page.evaluate(() => {
        const { game } = window.pellagos;

        return { start: game.world.start.race, team: game.battle.actor("player").team, realm: game.self.realm, equipment: [...game.avatars.get("player").character.equipment.values()] };
    });

    expect({ ...played, saved: (await keptOf(page, "save")).hero.race }).toEqual({ start: "cat", team: "cat", realm: "cat", equipment: expect.arrayContaining(["catEars", "catTail"]), saved: "cat" });
});

test("carries on with the saved character, in the same world; and again after the picture is lost", async ({ page }) => {
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);
    await title(page);
    await expect(page.locator("#continuebutton")).toHaveText("Continue as Wren");
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    const game = await page.evaluate(() => ({ seed: window.pellagos.game.world.seed, weapon: window.pellagos.game.battle.actor("player").weapon, name: document.querySelector("#playerplate .name").textContent }));

    expect(game).toEqual({ seed: 4242, weapon: "staff", name: "Wren" });

    // The picture lost (as a phone short of memory does): the game paused, where the player is
    // kept, and the player told; given back, the page loaded again (what it let go of once the
    // graphics card had it, world/release.js, isn't there to give it again), to carry on
    await page.waitForFunction(() => window.pellagos.released(), null, { timeout: 30000 });
    await page.evaluate(() => window.pellagos.session.view.renderer.forceContextLoss());
    await expect(page.locator("#menu")).toBeVisible();
    await expect(page.locator("#banner")).toContainText("picture was lost");

    const loaded = page.waitForEvent("load");

    await page.evaluate(() => window.pellagos.session.view.renderer.forceContextRestore());
    await loaded;
    await expect(page.locator("#continuebutton")).toHaveText("Continue as Wren", { timeout: 60000 });
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // The menu pauses, and goes back to the title
    await page.locator("#menubutton").click();
    await expect(page.locator("#menu")).toBeVisible();
    await page.getByRole("button", { name: "Back to the title" }).click();
    await expect(page.locator("#title")).toBeVisible();
});

// Six characters kept (save.js), as they're kept now: each under an id of its own, the one played
// last Fen. Kept once, the first time the page is opened (not again on going back to the title)
const KEPT = ["Ash", "Briar", "Cole", "Dun", "Ember", "Fen"].map((name, i) => ({
    version: 2,
    id: `chara00${i}`,
    seed: 4242 + i,
    created: `2026-09-0${i + 1}T12:00:00.000Z`,
    played: `2026-10-0${i + 1}T12:00:00.000Z`,
    hero: { ...SAVE.hero, name, weapon: ["staff", "sword", "bow", "wand", "sword", "staff"][i] },
}));

async function keepSix(page) {
    await page.addInitScript((kept) => {
        if (!localStorage.getItem("pellagos.characters")) {
            for (const save of kept) {
                localStorage.setItem(`pellagos.${save.id}.save`, JSON.stringify(save));
            }

            localStorage.setItem(`pellagos.${kept[2].id}.progress`, JSON.stringify({ created: kept[2].created, seed: kept[2].seed, format: 2, skills: {}, gold: 75, pack: [], gear: { mainHand: { id: "hammer" } } }));
            localStorage.setItem("pellagos.characters", JSON.stringify({ ids: kept.map(({ id }) => id), last: kept[5].id }));
        }
    }, KEPT);
}

test("up to six characters kept: Characters on this device lists them, the one played last first, each in a world of their own; played, one's the one Continue as carries on with; deleted, asked first, it's gone for good, their world staying", async ({ page }) => {
    test.setTimeout(180000);
    await keepSix(page);
    await title(page);
    await expect(page.locator("#continuebutton")).toHaveText("Continue as Fen");
    await expect(page.locator("#savedbutton")).toHaveText("Characters on this device (6)");
    await expect(page.locator("#savenote")).toHaveText("Human · Staff · in Fen's world");

    // Listed, the one played last first: each with their people, what they wield as they are now,
    // their gold, and the world they're in (kept before worlds were apart: one of their own each)
    await page.locator("#savedbutton").click();

    const dialog = page.locator("#characters");
    const cards = dialog.locator(".character");

    await expect(dialog).toBeVisible();
    await expect(dialog.locator("h2")).toHaveText("Characters on this device");
    await expect(cards.locator(".name")).toHaveText(["Fen", "Ember", "Dun", "Cole", "Briar", "Ash"]);
    await expect(cards.filter({ hasText: "Cole" }).locator(".about")).toHaveText("Human · War hammer · 75 gold · in Cole's world");
    await expect(cards.filter({ hasText: "Cole" }).locator(".when")).toContainText("Last played");

    // Cole played: their world, and the one Continue as carries on with since
    await cards.filter({ hasText: "Cole" }).click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    expect(await page.evaluate(() => ({ seed: window.pellagos.game.world.seed, name: document.querySelector("#playerplate .name").textContent }))).toEqual({ seed: KEPT[2].seed, name: "Cole" });
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Back to the title" }).click();
    await expect(page.locator("#continuebutton")).toHaveText("Continue as Cole");
    await page.locator("#savedbutton").click();
    await expect(cards.locator(".name").first()).toHaveText("Cole");

    // Deleting Ash: asked first, that it's for good; kept, they're still there
    const forget = page.locator("#forget");

    await dialog.getByRole("button", { name: "Delete Ash" }).click();
    await expect(forget).toBeVisible();
    await expect(forget.locator("h2")).toHaveText("Delete Ash?");
    await expect(forget.locator("#forgetnote")).toHaveText("Ash will be permanently deleted, with what they carry and what they've learnt. The worlds they've been in stay, in Worlds on this device. This can't be undone.");
    await forget.getByRole("button", { name: "Keep Ash" }).click();
    await expect(forget).toBeHidden();
    await expect(cards).toHaveCount(6);

    // Deleted: gone, and everything kept of them; their world stays, with nobody in it
    await dialog.getByRole("button", { name: "Delete Ash" }).click();
    await forget.getByRole("button", { name: "Delete Ash" }).click();
    await expect(cards.locator(".name")).toHaveText(["Cole", "Fen", "Ember", "Dun", "Briar"]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("pellagos.chara000.")))).toEqual(["pellagos.chara000.about"]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.chara000.about")).places)).toEqual({});
    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(page.locator("#savedbutton")).toHaveText("Characters on this device (5)");
    await expect(page.locator("#localworldsbutton")).toHaveText("Worlds on this device (6)");
    await expect(page.locator("#continuebutton")).toHaveText("Continue as Cole");
});

test("with six characters kept, New character asks which is to make way, and to be sure; backed out of making them, the one chosen's kept; made, the new one takes their place", async ({ page }) => {
    // Every step draws the character, which takes a while without a GPU
    test.setTimeout(180000);
    await keepSix(page);
    await title(page);

    const dialog = page.locator("#characters");
    const forget = page.locator("#forget");
    const replace = async (name) => {
        await page.getByRole("button", { name: "New character" }).click();
        await expect(dialog).toBeVisible();
        await expect(dialog.locator("h2")).toHaveText("Make way for a new character");
        await expect(dialog.locator(".character .name")).toHaveText(["Replace Fen", "Replace Ember", "Replace Dun", "Replace Cole", "Replace Briar", "Replace Ash"]);
        await expect(dialog.locator(".forget")).toHaveCount(0);
        await dialog.locator(".character").filter({ hasText: name }).click();
        await expect(forget.locator("h2")).toHaveText(`Replace ${name}?`);
        await expect(forget.locator("#forgetnote")).toHaveText(`${name} will be permanently deleted, with what they carry and what they've learnt, once your new character is made. The worlds they've been in stay, in Worlds on this device. This can't be undone.`);
        await forget.getByRole("button", { name: `Replace ${name}` }).click();
        await expect(page.locator("#create")).toBeVisible();
        await page.waitForFunction(() => window.pellagos.creator?.avatar);
    };
    const names = () => page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.characters")).ids.map((id) => JSON.parse(localStorage.getItem(`pellagos.${id}.save`)).hero.name));

    // Backed out of: Briar's kept
    await replace("Briar");
    await page.locator("#createback").click();
    await expect(page.locator("#title")).toBeVisible();
    expect(await names()).toEqual(["Ash", "Briar", "Cole", "Dun", "Ember", "Fen"]);

    // Made: Briar's gone for good, and the new one's the one played last
    await replace("Briar");
    await page.getByRole("button", { name: "Next: weapon" }).click();
    await page.getByRole("button", { name: "Next: name" }).click();
    await page.locator("#nameinput").fill("Gale");
    await page.getByRole("button", { name: "Begin" }).click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    expect(await names()).toEqual(["Ash", "Cole", "Dun", "Ember", "Fen", "Gale"]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("pellagos.chara001.")))).toEqual(["pellagos.chara001.about"]);
    expect((await keptOf(page, "save")).hero.name).toBe("Gale");
    expect((await keptOf(page, "about")).name).toBe("Gale's world");
});

test("worlds on this device, apart from the characters: one made, and a character taken into it, new to its folk with what they carry; back in their own as they left it; deleted, asked first, the characters staying; one in no world asked where they go", async ({ page }) => {
    // (Played twice: more than the usual time)
    test.setTimeout(240000);
    await keepSix(page);
    await title(page);
    await expect(page.locator("#localworldsbutton")).toHaveText("Worlds on this device (6)");
    await page.locator("#localworldsbutton").click();

    const worlds = page.locator("#localworlds");
    const rows = worlds.locator(".character");
    const ask = page.locator("#worldask");
    const who = page.locator("#characters");
    const played = async (seed) => {
        await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
        expect(await page.evaluate(() => window.pellagos.game.world.seed)).toBe(seed);
        await page.locator("#menubutton").click();
        await page.getByRole("button", { name: "Back to the title" }).click();
    };

    // Each kept before worlds were apart: a world of their own, named for them
    await expect(worlds.locator("h2")).toHaveText("Worlds on this device");
    await expect(rows.locator(".name")).toHaveText(["Fen's world", "Ember's world", "Dun's world", "Cole's world", "Briar's world", "Ash's world"]);
    await expect(rows.filter({ hasText: "Cole's world" }).locator(".about")).toHaveText("Its war not begun · Cole has been here");

    // A new world: its name, and a seed of their own
    await worlds.getByRole("button", { name: "A new world" }).click();
    await expect(ask.locator("#worldasktitle")).toHaveText("A new world");
    await ask.getByRole("button", { name: "Make it" }).click();
    await expect(ask.locator("#worldaskstatus")).toHaveText("Give the world a name.");
    await ask.locator("#worldaskname").fill("Thornvale");
    await ask.locator("#worldaskseed").fill("not a seed");
    await ask.getByRole("button", { name: "Make it" }).click();
    await expect(ask.locator("#worldaskstatus")).toContainText("A seed is a whole number");
    await ask.locator("#worldaskseed").fill("9001");
    await ask.getByRole("button", { name: "Make it" }).click();
    await expect(ask).toBeHidden();
    await expect(rows.locator(".name").first()).toHaveText("Thornvale");
    await expect(rows.first().locator(".about")).toHaveText("Its war not begun · nobody's been here yet");

    // Cole into it: new to its folk, with what they carry
    await rows.first().click();
    await expect(who.locator("h2")).toHaveText("Who goes into Thornvale?");
    await expect(who.locator(".character").filter({ hasText: "Cole" }).locator(".about")).toHaveText("Human · War hammer · 75 gold · new here");
    await who.locator(".character").filter({ hasText: "Cole" }).click();
    await played(9001);
    await expect(page.locator("#continuebutton")).toHaveText("Continue as Cole");
    await expect(page.locator("#savenote")).toHaveText("Human · War hammer · 75 gold · in Thornvale");

    const vale = await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.chara002.save")).world);
    const place = await page.evaluate((id) => JSON.parse(localStorage.getItem(`pellagos.${id}.about`)).places.chara002.id, vale);

    expect(place).not.toBe("chara002");
    expect(await page.evaluate((id) => JSON.parse(localStorage.getItem(`pellagos.${id}.place`))?.seed, place)).toBe(9001);

    // Back into their own: been there before
    await page.locator("#localworldsbutton").click();
    await rows.filter({ hasText: "Cole's world" }).click();
    await expect(who.locator(".character").filter({ hasText: "Cole" }).locator(".about")).toHaveText("Human · War hammer · 75 gold · been here before");
    await who.locator(".character").filter({ hasText: "Cole" }).click();
    await played(KEPT[2].seed);
    await expect(page.locator("#savenote")).toHaveText("Human · War hammer · 75 gold · in Cole's world");

    // Thornvale deleted, asked first: everything of it gone, Cole kept
    const forget = page.locator("#forget");

    await page.locator("#localworldsbutton").click();
    await expect(rows.filter({ hasText: "Thornvale" }).locator(".about")).toContainText("Cole has been here");
    await worlds.getByRole("button", { name: "Delete Thornvale" }).click();
    await expect(forget.locator("#forgetnote")).toHaveText("Thornvale will be permanently deleted: its war, and what its folk remember of everyone who's been there. Your characters stay, with all they carry and have grown into. This can't be undone.");
    await forget.getByRole("button", { name: "Delete Thornvale" }).click();
    await expect(rows.locator(".name")).toHaveText(["Cole's world", "Fen's world", "Ember's world", "Dun's world", "Briar's world", "Ash's world"]);
    expect(await page.evaluate((ids) => Object.keys(localStorage).filter((key) => ids.some((id) => key.startsWith(`pellagos.${id}.`))), [vale, place])).toEqual([]);

    // Ash's world deleted: Ash in none, asked where they go when they're played
    await worlds.getByRole("button", { name: "Delete Ash's world" }).click();
    await forget.getByRole("button", { name: "Delete Ash's world" }).click();
    await worlds.getByRole("button", { name: "Back" }).click();
    await page.locator("#savedbutton").click();
    await expect(who.locator(".character").filter({ hasText: "Ash" }).locator(".about")).toHaveText("Human · Staff · in no world yet");
    await who.locator(".character").filter({ hasText: "Ash" }).click();
    await expect(worlds.locator("h2")).toHaveText("Where does Ash go?");
    await expect(rows.filter({ hasText: "Briar's world" }).locator(".about")).toContainText("new to Ash");
    await expect(worlds.locator(".side")).toHaveCount(0);
});

// A character kept by an older version of the game (save version 1: no id of its own), with a
// people, a weapon, things, a spell and a follower's calling this one hasn't got
const OLD_CHARACTER = {
    kind: "pellagos-solo-world",
    version: 1,
    saveVersion: 1,
    save: { version: 1, hero: { ...SAVE.hero, name: "Old Bram", race: "dwarf", weapon: "halberd" }, seed: 777, created: "2025-01-02T03:04:05.000Z" },
    progress: { seed: 777, format: 2, skills: { blade: 300 }, spells: ["heal", "moonwalk"], gold: 99, pack: [{ id: "potion", count: 2 }, { id: "oldBlade", count: 3 }], gear: { mainHand: { id: "sword" } } },
    followers: { seed: 777, followers: [{ name: "Pip", calling: "jester" }] },
};

test("a saved character exported as a file and brought in again (not while they're kept); every one exported at once; one kept by an older version of the game brought in, what it hasn't got left out and said", async ({ page }) => {
    await keepSix(page);
    await title(page);
    await page.locator("#savedbutton").click();

    const dialog = page.locator("#characters");
    const cards = dialog.locator(".character .name");
    const imported = page.locator("#imported");
    const bringIn = (files) => dialog.locator("#charactersfile").setInputFiles(files);

    // Cole exported: a file of their own, as the browser downloads one
    const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export Cole" }).click()]);
    const file = await download.path();

    expect(download.suggestedFilename()).toBe("Cole.pellagos-character");

    // Brought in while Cole's kept: refused, as they're here already
    await bringIn(file);
    await expect(imported).toBeVisible();
    await expect(imported.locator("#importednote")).toHaveText("No one was brought in.");
    await expect(imported.locator("#importedlist")).toContainText("Not brought in: they're kept here already.");
    await imported.getByRole("button", { name: "OK" }).click();

    // Deleted, then brought back from the file: the same world, their gold and their hammer
    await dialog.getByRole("button", { name: "Delete Cole" }).click();
    await page.locator("#forget").getByRole("button", { name: "Delete Cole" }).click();
    await expect(cards).toHaveCount(5);
    await bringIn(file);
    await expect(imported.locator("#importednote")).toHaveText("One character is now among the characters on this device.");
    await expect(imported.locator(".about")).toHaveText("Human · War hammer · 75 gold · in Cole's world");
    await imported.getByRole("button", { name: "OK" }).click();
    await expect(cards).toHaveCount(6);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.characters")).ids.map((id) => JSON.parse(localStorage.getItem(`pellagos.${id}.save`))).find((save) => save.hero.name === "Cole").seed)).toBe(KEPT[2].seed);

    // Every one at once, in a file of the day's
    const [all] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export all" }).click()]);

    expect(all.suggestedFilename()).toMatch(/^Pellagos-characters-\d{4}-\d\d-\d\d\.pellagos-character$/);

    // With six kept, no room: said so
    await bringIn({ name: "Old Bram.pellagos-character", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(OLD_CHARACTER)) });
    await expect(imported.locator("#importedlist")).toContainText("Not brought in: 6 characters are kept, the most there can be");
    await imported.getByRole("button", { name: "OK" }).click();

    // Room made: brought forward, and what this version of the game hasn't got left out, each said
    await dialog.getByRole("button", { name: "Delete Ash" }).click();
    await page.locator("#forget").getByRole("button", { name: "Delete Ash" }).click();
    await bringIn({ name: "Old Bram.pellagos-character", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(OLD_CHARACTER)) });
    await expect(imported.locator(".name")).toHaveText("Old Bram");
    await expect(imported.locator(".about")).toHaveText("Human · Sword · 99 gold · in Old Bram's world");
    await expect(imported.locator("#importedlist li li")).toHaveText([
        "Changed to suit this version of the game:",
        "Their people (dwarf), whom the game no longer has: they're human now.",
        "The weapon they started with (halberd), which the game no longer has: a sword.",
        "3 things the game no longer has: old blade ×3.",
        "The spell moonwalk, which the game no longer has.",
        "Pip (jester), who follows no more: the game has no such callings now.",
    ]);
    await imported.getByRole("button", { name: "OK" }).click();
    await expect(cards.filter({ hasText: "Old Bram" })).toHaveCount(1);

    // And what isn't a character file: said so
    await bringIn({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a character") });
    await expect(imported.locator("#importednote")).toHaveText("That isn't a character file: it doesn't read.");
});

test("how the player is, kept with where they are: hurt and tired, poisoned, a spell on them, blessed, a power strike waiting; the next time, each as it was, with what was left of it", async ({ page }) => {
    // (Played twice: more than the usual time)
    test.setTimeout(180000);
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);

    const continued = async () => {
        await title(page);
        await page.locator("#continuebutton").click();
        await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    };
    // (Within a few moments of what was asked: the world goes on while the menu's opened)
    const near = (value, to, by = 3000) => {
        expect(value).toBeLessThanOrEqual(to);
        expect(value).toBeGreaterThan(to - by);
    };

    await continued();

    // Hurt and tired, poisoned, Levitate and a blessing on them, their power strike waiting
    const was = await page.evaluate(() => {
        const { game } = window.pellagos;
        const actor = game.battle.actor(game.me);
        const player = game.host.players.get(game.me);
        const now = game.battle.time;

        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(actor, { hp: actor.maxHp - 15, stamina: Math.round(actor.maxStamina / 3) });
        game.battle.afflict(game.me, "poison", { damage: 1, ms: 8000 });
        game.battle.buff(game.me, "levitate", { ms: 120000, by: game.me, level: 1 });
        player.boons = [{ id: "blessing", label: "Blessed", melee: 0.05, ranged: 0.05, heal: 0.1, armor: 0.03, ms: 600000, until: now + 400000 }];
        player.readyAt = { powerStrike: now + 9000 };

        return { hp: actor.hp, stamina: actor.stamina };
    });

    // Paused (the menu): kept, with where they are
    await page.locator("#menubutton").click();
    await expect(page.locator("#menu")).toBeVisible();

    const kept = (await keptOf(page, "vitals")).vitals;

    near(kept.hp, was.hp, 5);
    expect(kept.stamina).toBeGreaterThanOrEqual(was.stamina);
    expect(kept).toMatchObject({ afflictions: [{ kind: "poison", damage: 1 }], buffs: [{ kind: "levitate", level: 1, own: true }], boons: [{ id: "blessing" }] });
    near(kept.afflictions[0].left, 8000);
    near(kept.buffs[0].left, 120000);
    near(kept.boons[0].left, 400000);
    near(kept.abilities.powerStrike, 9000);

    // The next time: as they were, each with what was left of it (the world's clock stood still meanwhile)
    await page.getByRole("button", { name: "Back to the title" }).click();
    await continued();

    const back = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();

        return { vitals: game.vitals(), shown: [...document.querySelectorAll("#playerplate .ail")].map((icon) => icon.getAttribute("aria-label")) };
    });

    near(back.vitals.hp, kept.hp, 5);
    expect(back.vitals.stamina).toBeGreaterThanOrEqual(kept.stamina);
    expect(back.vitals.afflictions.map(({ kind }) => kind)).toEqual(["poison"]);
    near(back.vitals.afflictions[0].left, kept.afflictions[0].left);
    expect(back.vitals.buffs).toEqual([expect.objectContaining({ kind: "levitate", own: true })]);
    near(back.vitals.buffs[0].left, kept.buffs[0].left);
    expect(back.vitals.boons).toEqual([expect.objectContaining({ id: "blessing" })]);
    near(back.vitals.boons[0].left, kept.boons[0].left);
    near(back.vitals.abilities.powerStrike, kept.abilities.powerStrike);
    expect(back.shown).toEqual(expect.arrayContaining(["Poisoned", "Blessed"]));
});

test("the player and the orc draw their weapons and fight when in reach, until one falls", async ({ page }) => {
    await playing(page, "/?play&seed=1&weapon=sword");

    const fight = await page.evaluate(() => {
        const { game } = window.pellagos;
        const events = [];
        const sword = game.avatars.get("player").character.items.find((item) => item.name === "sword");

        // (Put away to start with: the sword in its scabbard at the hip)
        const before = { sheathed: game.avatars.get("player").character.sheathed, on: sword.parent.name };

        game.stop();

        // Stand the player three squares south of the orc
        const orc = game.battle.actor("orc");
        const player = game.battle.actor("player");

        Object.assign(player, { x: orc.x, y: orc.y + 3, square: [orc.square[0], orc.square[1] + 3] });
        game.previous.set("player", { x: player.x, y: player.y });
        game.avatars.get("player").place(player.x, player.y, Math.PI);

        const advance = game.battle.advance.bind(game.battle);

        game.battle.advance = (ms) => {
            const happened = advance(ms);

            events.push(...happened);

            return happened;
        };

        for (let second = 0; second < 40 && !orc.dead && !player.dead; second++) {
            game.advance(1);
        }

        const drew = (id) => events.find((event) => event.type === "draw" && event.id === id);
        const struck = (id) => events.find((event) => event.type === "attack" && event.id === id);

        return {
            before,
            drewFirst: ["player", "orc"].every((id) => drew(id)?.on && drew(id).time < struck(id).time),
            attacks: [...new Set(events.filter((event) => event.type === "attack").map((event) => `${event.id}:${event.attack}`))],
            hits: events.filter((event) => event.type === "hit").length,
            dead: events.filter((event) => event.type === "death").map((event) => event.id),
            damageShown: document.querySelectorAll("#floaters .damage").length,
            orcHp: orc.hp,
        };
    });

    expect(fight.before).toEqual({ sheathed: true, on: "Hips" });
    expect(fight.drewFirst).toBe(true);
    expect(fight.attacks).toEqual(expect.arrayContaining(["player:slash", "orc:hack"]));
    expect(fight.hits).toBeGreaterThan(4);
    expect(fight.dead.length).toBe(1);
});

test("a new character with a sword carries a round shield, with a wand a spellward; the orc's blows from in front caught on it show \"Blocked\", the shield arm braced into them", async ({ page }) => {
    await playing(page, "/?play&seed=1&weapon=sword");

    // (What a new swordsman carries, drawn on them and given to the battle)
    const kit = await page.evaluate(() => {
        const { game } = window.pellagos;

        return { offHand: game.progress.gear.offHand, shield: game.battle.actor(game.me).shield, drawn: game.avatars.get(game.me).character.items.some((item) => item.name === "roundShield") };
    });

    expect(kit.offHand).toEqual({ id: "roundShield", quality: "common", boost: 0.2 });
    expect(kit.shield).toEqual({ chance: 0.1, share: 0.2, spells: false });
    expect(kit.drawn).toBe(true);

    // The orc set on them from in front, every blow caught on a shield that takes all of it
    const fight = await page.evaluate(() => {
        const { game } = window.pellagos;
        const events = [];
        const shown = [];
        const reacted = [];
        const orc = game.battle.actor("orc");
        const player = game.battle.actor("player");
        const actions = game.avatars.get("player").actions;
        const [damage, react, advance] = [game.hud.damage.bind(game.hud), actions.react.bind(actions), game.battle.advance.bind(game.battle)];

        game.stop();
        game.hud.damage = (point, text, options) => (shown.push(String(text)), damage(point, text, options));
        actions.react = (name, options) => (reacted.push(name), react(name, options));
        game.battle.advance = (ms) => {
            const happened = advance(ms);

            events.push(...happened);

            return happened;
        };
        game.host.players.get("player").progress.guard = () => ({ chance: 1, share: 1, spells: false });
        Object.assign(player, { x: orc.x, y: orc.y + 2, square: [orc.square[0], orc.square[1] + 2], hp: 5000, maxHp: 5000, shield: { chance: 1, share: 1, spells: false } });
        Object.assign(orc, { hp: 5000, maxHp: 5000 });
        game.previous.set("player", { x: player.x, y: player.y });
        game.avatars.get("player").place(player.x, player.y, Math.PI);

        for (let second = 0; second < 10; second++) {
            game.advance(1);
        }

        const blocked = events.filter((event) => event.type === "blocked" && event.id === "player");

        return { blocked: blocked.length, by: [...new Set(blocked.map((event) => event.by))], hits: events.filter((event) => event.type === "hit" && event.id === "player").length, shown: shown.filter((text) => text === "Blocked").length, braced: reacted.filter((name) => name === "block").length, grown: game.host.players.get("player").progress.skills.shield };
    });

    // (Each caught: nothing through, "Blocked" over the head, braced into it, the Shield skill grown)
    expect(fight.blocked).toBeGreaterThan(2);
    expect(fight.by).toEqual(["orc"]);
    expect(fight.hits).toBe(0);
    expect(fight.shown).toBe(fight.blocked);
    expect(fight.braced).toBe(fight.blocked);
    expect(fight.grown).toBe(fight.blocked * 20);

    // A new mage with a wand: a spellward, that catches spells too
    await playing(page, "/?play&seed=1&weapon=wand");

    const mage = await page.evaluate(() => {
        const { game } = window.pellagos;

        return { offHand: game.progress.gear.offHand, shield: game.battle.actor(game.me).shield, drawn: game.avatars.get(game.me).character.items.some((item) => item.name === "spellward") };
    });

    expect(mage.offHand).toEqual({ id: "spellward", quality: "common", boost: 0.17 });
    expect(mage.shield).toEqual({ chance: 0.1, share: 0.17, spells: true });
    expect(mage.drawn).toBe(true);
});

test("blows leave wounds of their weapon's kind, worse below each threshold, with blood on the ground; healed and come back to life, gone", async ({ page }) => {
    await playing(page, "/?play&seed=1&weapon=bow");

    const fight = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;

        game.stop();

        // The player six squares south of the orc, shooting as it comes
        const orc = battle.actor("orc");
        const player = battle.actor("player");

        Object.assign(player, { x: orc.x, y: orc.y + 6, square: [orc.square[0], orc.square[1] + 6] });
        game.previous.set("player", { x: player.x, y: player.y });
        game.avatars.get("player").place(player.x, player.y, Math.PI);

        for (let second = 0; second < 40 && orc.hp >= orc.maxHp / 2 && !player.dead; second++) {
            game.advance(0.5, { render: false });
        }

        const wounds = game.wounds.get("orc");
        const blood = (id) => game.wounds.get(id).data.filter((value, i) => i % 4 === 0 && value > 0).length;

        return {
            hp: orc.hp,
            kinds: [...new Set(wounds.list.map((wound) => wound.kind))],
            stage: wounds.stage,
            marks: wounds.list.filter((wound) => wound.mark).length,
            // Arrows left in the wounds, held by the bones they went into
            arrows: wounds.list.filter((wound) => wound.arrow?.parent?.isBone).length,
            blood: blood("orc"),
            splats: game.effects.splats.list.filter(Boolean).length,
            skin: game.avatars.get("orc").character.materials.body.customProgramCacheKey(),
        };
    });

    expect(fight.hp).toBeLessThan(25);
    expect(fight.kinds).toEqual(["pierce"]);
    expect(fight.stage).toBeGreaterThanOrEqual(2);
    expect(fight.marks).toBeGreaterThan(0);
    expect(fight.arrows).toBeGreaterThan(1);
    expect(fight.blood).toBeGreaterThan(200);
    expect(fight.splats).toBeGreaterThan(0);
    // (The wounds' patch over the skin's own, and its face's expressions: expressions.js)
    expect(fight.skin).toMatch(/^wounded-skin\|skin\|face\d+$/);

    // Fought to the end: whoever falls lies in a pool of blood. Healed, the other's worse
    // wounds are gone; come back to life, all of them, arrows and pool too
    const end = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const orc = battle.actor("orc");
        const player = battle.actor("player");

        for (let second = 0; second < 40 && !orc.dead && !player.dead; second++) {
            game.advance(0.5, { render: false });
        }

        const fallen = orc.dead ? orc : player;
        const standing = orc.dead ? player : orc;

        // Down, bleeding (and nobody else hurting the one left standing): the slowest fall, onto
        // the knees and over, hits the ground 3.7 s after the blow, and the player's back 5 s after
        game.advance(4.2);

        const pool = game.pools.get(fallen.id)?.spot;
        const arrows = game.wounds.get(fallen.id).list.map((wound) => wound.arrow).filter(Boolean);
        const hurt = game.wounds.get(standing.id).list.length;

        // Hurt below a quarter, then healed back above half
        standing.hp = Math.round(standing.maxHp * 0.2);
        game.wounds.get(standing.id).hit({ reaction: "hack", from: 0, hp: standing.hp, maxHp: standing.maxHp, before: standing.maxHp });
        standing.spellReadyAt = battle.time;

        const worst = game.wounds.get(standing.id).stage;

        // (A little better by the time it lands, so it takes them back above half)
        battle.cast(standing.id, "vigor");
        standing.hp = Math.round(standing.maxHp * 0.4);
        game.advance(1);

        const healed = { hp: standing.hp, stage: game.wounds.get(standing.id).stage, worst };

        for (let second = 0; second < 40 && fallen.dead; second++) {
            game.advance(1);
        }

        return {
            fallen: fallen.id,
            pool: Boolean(pool),
            poolSize: pool?.size ?? 0,
            arrows: arrows.length,
            hurt,
            healed,
            alive: !fallen.dead,
            woundsAfter: game.wounds.get(fallen.id).list.length,
            arrowsAfter: arrows.filter((arrow) => arrow.parent).length,
            pools: game.pools.size,
        };
    });

    expect(end.pool).toBe(true);
    expect(end.poolSize).toBeGreaterThan(1);
    expect(end.hurt).toBeGreaterThan(0);
    expect(end.healed.worst).toBe(3);
    expect(end.healed.hp).toBeGreaterThanOrEqual(25);
    expect(end.healed.stage).toBeLessThanOrEqual(1);
    expect(end.alive).toBe(true);
    expect(end.woundsAfter).toBe(0);
    expect(end.arrowsAfter).toBe(0);
    expect(end.pools).toBe(0);
});

test("swiping up from the player turns them the way the camera looks and sends them straight ahead, running, as far as the way is clear", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // (The camera turned to look the way that's clearest ahead of them, whatever's round the
    // market where they start: the well, stalls, a landmark; and the player facing off to the side)
    const way = await page.evaluate(async () => {
        const { navigatorOf } = await import("/js/core/navigation.js");
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const avatar = game.avatars.get("player");
        const navigation = navigatorOf(game.world.maps[player.map]);
        const ways = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4 - Math.PI);
        const ahead = (way) => navigation.raycast([player.x, player.y], [player.x + Math.sin(way) * 400, player.y + Math.cos(way) * 400])?.t ?? 0;
        const clearest = ways.reduce((best, way) => (ahead(way) > ahead(best) ? way : best));
        const aside = clearest + Math.PI / 2;

        player.facing = aside;
        avatar.facing = aside;
        avatar.object.rotation.y = aside;
        game.cameraFollow.yaw = Math.atan2(-Math.sin(clearest), -Math.cos(clearest));
        game.cameraFollow.turning = 0;

        // (No one else about them to take the press: a townsman walking past just in front of
        // them, or just behind, nearer the press on the screen, would be pressed instead, the
        // flick a drag of the camera: game.js #whoIsAt)
        for (const other of game.battle.actors) {
            if (other !== player && other.map === player.map && Math.hypot(other.x - player.x, other.y - player.y) < 25) {
                Object.assign(other, { dead: true, respawnAt: Infinity });
            }
        }

        // (Drawn once like that, so the player's where they look on the screen)
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

        return clearest;
    });

    // (The game playing on, taking taps and swipes)
    const start = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const avatar = game.avatars.get("player");

        return { at: session.view.toScreen(avatar.point(0.5)), facing: avatar.facing, x: avatar.object.position.x, z: avatar.object.position.z };
    });

    expect(Math.abs(Math.sin(start.facing - way))).toBeGreaterThan(0.9);

    // A quick flick up from the player (said when it happened, as a device would)
    const cdp = await page.context().newCDPSession(page);
    const now = Date.now() / 1000;
    const { x, y } = start.at;

    for (const [type, dy, at] of [["mousePressed", 0, 0], ["mouseMoved", -25, 0.05], ["mouseMoved", -70, 0.1], ["mouseReleased", -70, 0.15]]) {
        await cdp.send("Input.dispatchMouseEvent", { type, x, y: y + dy, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, timestamp: now + at });
    }

    const moved = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const order = player.order;
        const pitch = session.view.pitch;
        const facing = player.facing;

        game.stop();
        game.advance(1.5);

        const avatar = game.avatars.get("player");

        return { order, pitch, facing, running: player.running, pace: player.pace, x: avatar.object.position.x, z: avatar.object.position.z };
    });

    // (A swipe, not a drag: the camera's not tilted)
    expect(moved.pitch).toBe(35);
    expect(moved.order?.type).toBe("move");
    expect(moved.order.run).toBe(true);
    expect(moved.running).toBe(true);

    // Turned the way the camera looks, and off that way
    expect(Math.cos(moved.facing - way)).toBeGreaterThan(0.99);

    const along = (moved.x - start.x) * Math.sin(way) + (moved.z - start.z) * Math.cos(way);
    const across = Math.abs((moved.x - start.x) * Math.cos(way) - (moved.z - start.z) * Math.sin(way));

    expect(along).toBeGreaterThan(3);
    expect(across).toBeLessThan(1);
});

// The camera turned to look the way that's clearest ahead of the player, whatever's round the
// market where they start, and the player left facing off to the side, so that steering them has
// somewhere to go and turns them to go there; the way the camera then looks, in radians
async function clearestWayAhead(page) {
    return page.evaluate(async () => {
        const { navigatorOf } = await import("/js/core/navigation.js");
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const avatar = game.avatars.get("player");
        const navigation = navigatorOf(game.world.maps[player.map]);
        const ways = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4 - Math.PI);
        const ahead = (way) => navigation.raycast([player.x, player.y], [player.x + Math.sin(way) * 400, player.y + Math.cos(way) * 400])?.t ?? 0;
        const clearest = ways.reduce((best, way) => (ahead(way) > ahead(best) ? way : best));
        const aside = clearest + Math.PI / 2;

        player.facing = aside;
        avatar.facing = aside;
        avatar.object.rotation.y = aside;
        game.cameraFollow.yaw = Math.atan2(-Math.sin(clearest), -Math.cos(clearest));
        game.cameraFollow.turning = 0;

        // (No one else about them to take the press: a townsman walking past just in front of
        // them, or just behind, nearer the press on the screen, would be pressed instead, the
        // flick a drag of the camera: game.js #whoIsAt)
        for (const other of game.battle.actors) {
            if (other !== player && other.map === player.map && Math.hypot(other.x - player.x, other.y - player.y) < 25) {
                Object.assign(other, { dead: true, respawnAt: Infinity });
            }
        }

        // (Drawn once like that, so the player's where they look on the screen)
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

        return clearest;
    });
}

// Where the player stands and which way they face, as the world has them
const standing = (page) => page.evaluate(() => {
    const { game } = window.pellagos;
    const avatar = game.avatars.get("player");

    return { facing: avatar.facing, x: avatar.object.position.x, z: avatar.object.position.z };
});

// What the player's been told to do, and which way the camera looks over the ground at that same
// moment (off its world matrix, its -Z axis). The camera swings back behind them as they walk, so
// a way read earlier would no longer be the one an order was given against
const told = (page) => page.evaluate(() => {
    const { game } = window.pellagos;
    const player = game.battle.actor("player");
    const e = game.view.camera.matrixWorld.elements;

    return { order: player.order, facing: player.facing, look: Math.atan2(-e[8], -e[10]) };
});

test("W, A, S, D steer the player the way the camera looks, running, two of them diagonally, Shift held walking, and letting go stops", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const way = await clearestWayAhead(page);
    const start = await standing(page);

    // (Facing off to the side to begin with, so turning to go shows)
    expect(Math.abs(Math.sin(start.facing - way))).toBeGreaterThan(0.9);

    // W: straight ahead the way the camera looks, running
    await page.keyboard.down("KeyW");

    const going = await told(page);

    expect(going.order?.type).toBe("move");
    expect(going.order.run).toBe(true);
    expect(Math.cos(going.facing - going.look)).toBeGreaterThan(0.99);

    // Held, they go that way and not off to the side
    const moved = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(1.5);

        const avatar = game.avatars.get("player");

        return { running: game.battle.actor("player").running, x: avatar.object.position.x, z: avatar.object.position.z };
    });

    expect(moved.running).toBe(true);

    const along = (moved.x - start.x) * Math.sin(going.facing) + (moved.z - start.z) * Math.cos(going.facing);
    const across = Math.abs((moved.x - start.x) * Math.cos(going.facing) - (moved.z - start.z) * Math.sin(going.facing));

    expect(along).toBeGreaterThan(1);
    expect(across).toBeLessThan(1);

    // (Playing on; a pause lets go of what was held, so the key's pressed afresh. The camera is
    // aimed down the clearest way again from where they've got to: an "ahead" order with something
    // in the way within a stride is refused, and there'd be nothing to measure)
    await page.keyboard.up("KeyW");
    await page.evaluate(() => window.pellagos.game.start());

    await clearestWayAhead(page);

    // W and D together: half way between ahead and to the right, which four buttons couldn't say
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyD");

    const diagonally = await told(page);
    const off = (Math.atan2(Math.sin(diagonally.facing - diagonally.look), Math.cos(diagonally.facing - diagonally.look)) * 180) / Math.PI;

    expect(Math.abs(off)).toBeGreaterThan(38);
    expect(Math.abs(off)).toBeLessThan(52);

    // Shift, with a way still held, turns the run into a walk
    await page.keyboard.up("KeyD");
    await page.keyboard.down("Shift");
    expect((await told(page)).order.run).toBe(false);

    // Everything let go: they're told to stop
    await page.keyboard.up("KeyW");
    await page.keyboard.up("Shift");
    expect((await told(page)).order).toBe(null);
});

test("the thumb stick, asked to float, springs up under the thumb where it lands in the bottom left, walks the player the way it's pushed from there, and goes back to its corner let go", async ({ page }) => {
    await playing(page, "/?play&seed=1");
    await clearestWayAhead(page);

    // The stick on, and floating: its zone the bottom left of the screen
    await page.evaluate(() => {
        for (const id of ["#stickswitch", "#floatswitch"]) {
            const switched = document.querySelector(id);

            switched.checked = true;
            switched.dispatchEvent(new Event("change"));
        }
    });

    const middleOf = (selector) => page.evaluate((selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();

        return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width };
    }, selector);
    const zone = await page.locator("#stickzone").boundingBox();
    const waiting = await middleOf("#stick");

    expect(zone.width).toBeGreaterThan(waiting.width * 2);

    // Down well away from where it waits: it comes to the thumb, and pushed up from there, they
    // walk ahead the way the camera looks
    const down = { x: zone.x + zone.width * 0.65, y: zone.y + zone.height * 0.35 };

    expect(Math.hypot(down.x - waiting.x, down.y - waiting.y)).toBeGreaterThan(waiting.width / 2);
    await page.mouse.move(down.x, down.y);
    await page.mouse.down();

    const under = await middleOf("#stick");

    expect(Math.hypot(under.x - down.x, under.y - down.y)).toBeLessThan(2);
    await page.mouse.move(down.x, down.y - 34, { steps: 4 });

    const walking = await told(page);

    expect(walking.order?.type).toBe("move");
    expect(walking.order.run).toBe(false);
    expect(Math.cos(walking.facing - walking.look)).toBeGreaterThan(0.99);

    // Let go: stopped, and back where it waits
    await page.mouse.up();
    expect((await told(page)).order).toBe(null);

    const back = await middleOf("#stick");

    expect(Math.hypot(back.x - waiting.x, back.y - waiting.y)).toBeLessThan(2);

    // Remembered
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")).stickFloats)).toBe(true);
});

test("the thumb stick, there from the start, walks the player the way it's pushed, runs pushed to its rim, stops when let go, and goes when it's turned off in Game options", async ({ page }) => {
    // (Turned on and off again, pushed twice and played on between: more than the usual time, on a
    // machine drawing in software)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    await clearestWayAhead(page);

    // There from the start (Game options' switch on), the opening hint telling of it, and only its
    // own circle takes touches
    expect(await page.evaluate(() => document.querySelector("#stickswitch").checked)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".stick-only")).display)).not.toBe("none");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#stickzone")).pointerEvents)).toBe("auto");

    const zone = await page.locator("#stickzone").boundingBox();

    const middle = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };

    // Pushed up the screen, short of the rim: ahead the way the camera looks, walking
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y - 34, { steps: 4 });

    const walking = await told(page);

    expect(walking.order?.type).toBe("move");
    expect(walking.order.run).toBe(false);
    expect(Math.cos(walking.facing - walking.look)).toBeGreaterThan(0.99);

    // (The stick knows it's held, and the knob's followed the thumb up out of the middle)
    expect(await page.evaluate(() => document.querySelector("#stickzone").classList.contains("held"))).toBe(true);

    const knob = await page.evaluate(() => {
        const held = document.querySelector("#stickknob").getBoundingClientRect();
        const circle = document.querySelector("#stickzone").getBoundingClientRect();

        return { up: circle.y + circle.height / 2 - (held.y + held.height / 2), across: held.x + held.width / 2 - (circle.x + circle.width / 2) };
    });

    expect(knob.up).toBeGreaterThan(30);
    expect(Math.abs(knob.across)).toBeLessThan(2);

    // Pushed over to the rim: running
    await page.mouse.move(middle.x, middle.y - 80, { steps: 4 });
    expect((await told(page)).order.run).toBe(true);

    // Let go: told to stop, and the knob's no longer held out
    await page.mouse.up();

    expect((await told(page)).order).toBe(null);
    expect(await page.evaluate(() => document.querySelector("#stickzone").classList.contains("held"))).toBe(false);

    // Pushed again and held, they go the way it's pushed and not off to the side
    const before = await standing(page);

    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x, middle.y - 80, { steps: 4 });

    // (The way they were sent, as the order was given: the camera has swung since it was aimed)
    const sent = (await told(page)).facing;
    const moved = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(1.5);

        const avatar = game.avatars.get("player");

        return { x: avatar.object.position.x, z: avatar.object.position.z };
    });

    const along = (moved.x - before.x) * Math.sin(sent) + (moved.z - before.z) * Math.cos(sent);
    const across = Math.abs((moved.x - before.x) * Math.cos(sent) - (moved.z - before.z) * Math.sin(sent));

    expect(along).toBeGreaterThan(2);
    expect(across).toBeLessThan(1.5);

    // (Playing on; a pause lets go of what the thumb held, so the stick's taken afresh)
    await page.mouse.up();
    await page.evaluate(() => window.pellagos.game.start());

    // Turned off again it's gone
    await page.evaluate(() => {
        const switched = document.querySelector("#stickswitch");

        switched.checked = false;
        switched.dispatchEvent(new Event("change"));
    });

    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#stickzone")).display)).toBe("none");

    // The keys steer without it. (The clearest way is found again from where they've got to: an
    // "ahead" order with something in the way within a stride is refused and leaves no order)
    await clearestWayAhead(page);
    await page.keyboard.down("KeyW");
    expect((await told(page)).order?.type).toBe("move");
    await page.keyboard.up("KeyW");
    expect((await told(page)).order).toBe(null);
});

test("the mouse pointer a sword over the page, over the view showing what a click would do (an enemy, someone to talk to, the ground), lit and bigger shaken, large or the system's own as Game options say", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const cursor = (selector = "#view") => page.evaluate((selector) => getComputedStyle(document.querySelector(selector)).cursor, selector);
    const set = (id, on) =>
        page.evaluate(
            ([id, on]) => {
                const switched = document.querySelector(id);

                switched.checked = on;
                switched.dispatchEvent(new Event("change"));
            },
            [id, on],
        );

    // The sword, over the view and over the page's buttons alike (theirs a hand otherwise)
    expect(await cursor()).toContain("images/pointer/sword-32.png");
    expect(await cursor("#packbutton")).toContain("images/pointer/sword-32.png");

    // An enemy a few steps before the player, held still, and beside them someone neutral, as the
    // folk are (someone to talk to): over the enemy the blade's lit red, over the other a speech
    // bubble, over the ground the sword again
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor("player");
        const squares = game.world.maps.town.squares;
        const free = (dx, dy) => [0, 1, -1, 2, -2].map((ex) => [me.square[0] + dx + ex, me.square[1] + dy]).find(([x, y]) => !squares.blocked(x, y));

        game.battle.add({ id: "foe", kind: "orc", weapon: "cleaver", team: "orcs", square: free(3, -6), hp: 5000 }).stunnedUntil = 1e9;
        game.battle.add({ id: "friend", kind: "orc", weapon: "cleaver", team: "orcs", neutral: true, square: free(-3, -6), hp: 5000 }).stunnedUntil = 1e9;
        game.enlisting.push("foe", "friend");
        game.stop();
    });
    expect(await playUntil(page, () => window.pellagos.game.avatars.has("foe") && window.pellagos.game.avatars.has("friend"))).toBe(true);

    const spots = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const at = (id) => session.view.toScreen(game.avatars.get(id).point(0.5));
        const ground = session.view.toScreen(game.avatars.get("player").object.position.clone().add({ x: 0, y: 0, z: -2.5 }));

        game.advance(0.1);
        game.start();

        return { foe: at("foe"), friend: at("friend"), ground };
    });

    await page.mouse.move(spots.foe.x, spots.foe.y);
    await expect.poll(cursor).toContain("images/pointer/attack-32.png");
    expect(await cursor("#packbutton"), "the rest of the page the sword still").toContain("images/pointer/sword-32.png");
    await page.mouse.move(spots.friend.x, spots.friend.y);
    await expect.poll(cursor).toContain("images/pointer/talk-32.png");
    await page.mouse.move(spots.ground.x, spots.ground.y);
    await expect.poll(cursor).toContain("images/pointer/sword-32.png");

    // Shaken, back and forth quickly: lit, half again as big, over the view and the page; a
    // moment after, back as it was. (The game held still meanwhile, so the page is quick to take
    // the moves: drawn in software here, a frame takes a good part of a shake)
    await page.evaluate(() => window.pellagos.game.stop());

    for (let k = 0; k < 8; k++) {
        await page.mouse.move(spots.ground.x + (k % 2 ? 140 : -140), spots.ground.y, { steps: 3 });
    }

    await page.evaluate(() => window.pellagos.game.start());
    expect(await cursor()).toContain("images/pointer/shaken-48.png");
    expect(await cursor("#packbutton")).toContain("images/pointer/shaken-48.png");
    // (Held still again while it goes out: drawn in software, each frame takes about a second, and
    // the pointer's timer and each look at it wait for the frame drawing to end, so it going out
    // 1.5 s after the shake would be seen only after several, seconds late)
    await page.evaluate(() => window.pellagos.game.stop());
    await expect.poll(cursor, { timeout: 4000 }).not.toContain("shaken");
    await page.evaluate(() => window.pellagos.game.start());

    // Large, and turned off: the system's own pointer
    await set("#largepointerswitch", true);
    expect(await cursor()).toContain("-44.png");
    await set("#largepointerswitch", false);
    await set("#pointerswitch", false);
    expect(await cursor()).toBe("auto");
    expect(await cursor("#packbutton")).toBe("pointer");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#largepointerswitch").closest("label")).display)).toBe("none");
    await set("#pointerswitch", true);
    expect(await cursor()).toContain("images/pointer/sword-32.png");
});

test("with following turned on (Game options), the camera follows from the first step, swinging round behind the player", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const camera = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { view } = session;
        const avatar = game.avatars.get("player");
        const spot = (dx, dz) => view.toScreen(avatar.object.position.clone().add({ x: dx, y: 0, z: dz }));
        const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

        game.stop();
        game.cameraSettings = { ...game.cameraSettings, follows: true };

        const start = { x: view.focus.x, yaw: view.yaw, pitch: view.pitch };

        // A few steps east: the camera keeps up from the first, and starts round behind them
        const east = spot(4, 0);

        game.tap(east.x, east.y);
        game.advance(0.8);

        const firstSteps = { x: view.focus.x, yaw: view.yaw };

        // Walking on east: round behind them, the player in the middle of the screen
        const far = spot(12, 0);

        game.tap(far.x, far.y);
        game.advance(2.5);

        const from = avatar.object.position.clone();

        game.advance(1);

        const heading = avatar.object.position.clone().sub(from);
        const behind = Math.atan2(-heading.x, -heading.z);

        return { start, firstSteps, off: Math.abs(wrap(view.yaw - behind)), walked: heading.length(), onScreen: view.fromMiddle(avatar.point(0.55)) };
    });

    expect(camera.start.yaw).toBe(0);
    expect(camera.start.pitch).toBe(35);
    expect(camera.firstSteps.x).toBeGreaterThan(camera.start.x + 0.3);
    expect(camera.firstSteps.yaw).toBeLessThan(-0.15);
    expect(camera.walked).toBeGreaterThan(1.5);
    expect(camera.off).toBeLessThan(0.3);
    expect(Math.abs(camera.onScreen.x)).toBeLessThan(0.2);
    expect(Math.abs(camera.onScreen.y)).toBeLessThan(0.3);
});

test("in a fight, the battle cam turned off, the camera keeps the foe in view, turning as little as it must; one attacking out of view has an arrow at the screen's edge pointing to them till it's in view", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // The orc on the player from behind the camera (which looks south: the orc north of them, past
    // it), stunned where it stands
    const before = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;
        const [x, y] = [0, 1, -1, 2, -2, 3, -3].map((dx) => [px + dx, py - 12]).find(([sx, sy]) => !squares.blocked(sx, sy));

        game.stop();
        game.cameraSettings = { ...game.cameraSettings, battle: false };
        Object.assign(orc, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, attack: null, target: "player", stunnedUntil: battle.time + 60000 });
        game.avatars.get("orc").place(x + 0.5, y + 0.5, 0);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        game.cameraFollow.yaw = Math.PI;
        game.advance(0.05);

        const arrows = [...document.querySelectorAll(".threat:not([hidden])")];
        const view = session.view;
        const spot = view.toScreen(game.avatars.get("orc").point(0.5));
        const rect = view.canvas.getBoundingClientRect();

        const shown = {
            seen: Boolean(spot) && spot.x > rect.left && spot.x < rect.right && spot.y > rect.top && spot.y < rect.bottom,
            arrows: arrows.length,
            // (Pointing down the screen, the way behind the camera; near its bottom edge)
            turned: Number(arrows[0]?.style.transform.match(/rotate\(([-\d.]+)rad\)/)?.[1]),
            low: arrows[0] ? arrows[0].getBoundingClientRect().top > rect.top + rect.height * 0.75 : false,
            // (An orc's, not a shot: not violet)
            still: arrows[0]?.className,
        };

        // (A blow drawn back at the player: its arrow flashing)
        orc.attack = { attack: orc.arms[0], target: "player", start: battle.time, struck: false };
        game.advance(0.01, { render: false });

        const winding = document.querySelector(".threat:not([hidden])")?.className;

        orc.attack = null;

        return { ...shown, winding };
    });

    expect(before.seen).toBe(false);
    expect(before.arrows).toBe(1);
    expect(before.still).toBe("threat");
    expect(before.winding).toBe("threat winding");
    expect(Math.abs(Math.abs(before.turned) - Math.PI)).toBeLessThan(0.6);
    expect(before.low).toBe(true);

    // A moment on: the camera's turned to keep it in view, by no more than it had to, and the arrow's gone
    const after = await page.evaluate(() => {
        const { game, session } = window.pellagos;

        game.advance(3);

        const view = session.view;
        const spot = view.toScreen(game.avatars.get("orc").point(0.5));
        const rect = view.canvas.getBoundingClientRect();
        const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

        return {
            seen: Boolean(spot) && spot.x > rect.left && spot.x < rect.right && spot.y > rect.top && spot.y < rect.bottom,
            arrows: document.querySelectorAll(".threat:not([hidden])").length,
            turned: Math.abs(wrap(game.cameraFollow.yaw - Math.PI)),
        };
    });

    expect(after.seen).toBe(true);
    expect(after.arrows).toBe(0);
    expect(after.turned).toBeGreaterThan(0.3);
    expect(after.turned).toBeLessThan(Math.PI - 0.3);
});

test("in a fight, a message is moved clear of those fighting, taps going through it; the fight over, it's back where it goes as a rule", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const placed = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const { view } = session;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const squares = game.world.maps.town.squares;
        const banner = document.querySelector("#banner");
        const screen = document.querySelector("#hud").getBoundingClientRect();
        const box = (id) => {
            const avatar = game.avatars.get(id);
            const [feet, head] = [view.toScreen(avatar.object.position), view.toScreen(avatar.point(1))];

            return { left: feet.x - (feet.y - head.y) * 0.3, right: feet.x + (feet.y - head.y) * 0.3, top: head.y, bottom: feet.y };
        };
        const meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

        // (The camera looking north from behind the player, not swinging round; a message up)
        game.stop();
        game.cameraSettings = { ...game.cameraSettings, battle: false };
        game.cameraFollow.yaw = 0;
        game.hud.message("The orc is coming for you!", 60);

        // The orc set on the player, stunned, as far north of them as puts it where a message goes
        // as a rule (28% of the way down the screen)
        const [px, py] = player.square;
        let at = null;

        for (let d = 3; d <= 16 && !at; d++) {
            const square = [px, py - d];

            if (squares.blocked(...square)) {
                continue;
            }

            Object.assign(orc, { x: square[0] + 0.5, y: square[1] + 0.5, square, path: [], order: null, attack: null, target: "player", stunnedUntil: battle.time + 60000 });
            game.avatars.get("orc").place(orc.x, orc.y, 0);
            game.previous.set("orc", { x: orc.x, y: orc.y });
            game.advance(0.1);

            const usual = { left: screen.left + (screen.width - banner.offsetWidth) / 2, right: screen.left + (screen.width + banner.offsetWidth) / 2, top: screen.top + screen.height * 0.28, bottom: screen.top + screen.height * 0.28 + banner.offsetHeight };

            at = meet(usual, box("orc")) ? d : null;
        }

        game.advance(0.5);
        window.boxes = [box("player"), box("orc")];

        return { at, moved: banner.style.translate, taps: getComputedStyle(banner).pointerEvents, shown: !banner.hidden };
    });

    // (Once it's eased there: the page's animations don't run on while the game's stopped)
    placed.clear = await page.evaluate(() => {
        const banner = document.querySelector("#banner");

        banner.getAnimations().forEach((animation) => animation.finish());

        const moved = banner.getBoundingClientRect();

        return window.boxes.every((rect) => !(moved.left < rect.right && rect.left < moved.right && moved.top < rect.bottom && rect.top < moved.bottom));
    });

    // The orc gone: back where a message goes as a rule
    placed.after = await page.evaluate(() => {
        const { game } = window.pellagos;

        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity, target: null });
        game.fightView = null;
        game.advance(0.5);

        return document.querySelector("#banner").style.translate;
    });

    expect(placed.at).not.toBe(null);
    expect(placed.shown).toBe(true);
    expect(placed.moved).not.toBe("");
    expect(placed.clear).toBe(true);
    expect(placed.taps).toBe("none");
    expect(placed.after).toBe("");
});

test("a message has a little X at its top right, clear of its words: tapped, the message is put away at once (kept for the journal), the game not tapped through it; the next has it too, an Undo's beside it", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const told = "The Lizard-folk reserve is in the field near you, 58 strong.";
    const banner = page.locator("#banner");
    const close = page.locator("#banner .banner-close");

    const shown = await page.evaluate((text) => {
        const { game } = window.pellagos;
        const banner = document.querySelector("#banner");

        game.stop();
        game.hud.message(text, 60);
        banner.getAnimations().forEach((animation) => animation.finish());

        const box = banner.getBoundingClientRect();
        const x = banner.querySelector(".banner-close").getBoundingClientRect();
        const words = document.createRange();

        words.selectNodeContents(banner.firstChild);

        return {
            box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
            x: { left: x.left, top: x.top, right: x.right, bottom: x.bottom },
            overWords: [...words.getClientRects()].some((line) => line.left < x.right && x.left < line.right && line.top < x.bottom && x.top < line.bottom),
            label: banner.querySelector(".banner-close").getAttribute("aria-label"),
        };
    }, told);

    // Its words only its own (the X drawn, not a letter)
    await expect(banner).toHaveText(told);
    await expect(close).toBeVisible();
    expect(shown.label).toBe("Dismiss");
    expect(shown.overWords).toBe(false);
    // (In the top right corner, inside the box; a finger's target)
    expect(shown.x.right).toBeLessThanOrEqual(shown.box.right + 0.5);
    expect(shown.x.right).toBeGreaterThan(shown.box.right - 8);
    expect(shown.x.top).toBeGreaterThanOrEqual(shown.box.top - 0.5);
    expect(shown.x.top).toBeLessThan(shown.box.top + 8);
    expect(shown.x.right - shown.x.left).toBeGreaterThanOrEqual(28);

    // Tapped: gone at once, though it had a minute to go; still in the journal's messages; the
    // player not sent anywhere by the tap
    const before = await page.evaluate(() => ({ ...window.pellagos.game.battle.actor("player").square }));

    await close.click();
    await expect(banner).toBeHidden();

    const after = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        return { kept: game.messages.map(({ text }) => text), square: { ...player.square }, path: player.path?.length ?? 0, order: player.order ?? null };
    });

    expect(after.kept).toContain(told);
    expect(after.square).toEqual(before);
    expect(after.path).toBe(0);
    expect(after.order).toBe(null);

    // The next message has its X too, and an Undo's button beside it still works
    const undone = await page.evaluate(() => {
        const { game } = window.pellagos;

        window.undone = false;
        game.hud.offer("Thrown away: a stick.", "Undo", () => (window.undone = true));

        return document.querySelectorAll("#banner .banner-close").length;
    });

    expect(undone).toBe(1);
    await expect(banner).toHaveText("Thrown away: a stick. Undo");
    await page.locator("#banner .banner-action").click();
    expect(await page.evaluate(() => window.undone)).toBe(true);
    await expect(banner).toBeHidden();
});

test("auto-snag, off to start with, turned on in Game options, picks up the player's spoils of a fight as they come within reach of them, and only what it's set to take on its own page under the switch, the rest left to tap", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // (A wolf's spoils for the player, at their feet or a few squares off; a frame played. The
    // game left running: the menu's only opened on a game that is)
    const lay = (id, away = 0) => page.evaluate(([id, away]) => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.host.ground.set(id, { id, bundle: { gold: 7, items: [{ id: "sword", count: 1, quality: "legendary" }, { id: "wolfPelt", count: 1 }] }, for: game.me, from: "wolf", map: me.map, square: [me.square[0] + away, me.square[1]], until: game.battle.time + 600000 });
        game.advance(0.1);

        return game.host.ground.get(id)?.bundle ?? null;
    }, [id, away]);
    const left = (id) => page.evaluate((id) => {
        const { game } = window.pellagos;

        game.advance(0.1);

        return game.host.ground.get(id)?.bundle ?? null;
    }, id);
    // (Legendary swords in the pack: stacked, alike)
    const legendaries = () => page.evaluate(() => window.pellagos.game.progress.pack.filter((stack) => stack?.id === "sword" && stack.quality === "legendary").reduce((sum, { count }) => sum + count, 0));

    // Off to start with: left there to tap
    expect((await lay("snag-1")).items).toHaveLength(2);

    // Turned on (Game options, Gameplay): what it takes under its switch (everything, to start
    // with), and the sack at the player's feet taken
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#gameplaybutton").click();
    await expect(page.locator("#snagswitch")).not.toBeChecked();
    await expect(page.locator("#snagbutton")).toBeHidden();
    await page.locator("label:has(#snagswitch)").click();
    await expect(page.locator("#snagbutton")).toBeVisible();
    await expect(page.locator("#snagsummary")).toHaveText("Everything");
    expect(await left("snag-1")).toBe(null);
    expect(await legendaries()).toBe(1);

    // Set to take legendary weapons alone, on its own page: each rarity in its colour
    await page.locator("#snagbutton").click();
    await expect(page.locator("#menusnag")).toBeVisible();
    await expect(page.locator("#snaggrades input")).toHaveCount(6);
    await expect(page.locator("#snagkinds input")).toHaveCount(9);
    await expect(page.locator("#snaggrades .rarity-legendary")).toHaveText("Legendary");

    for (const box of await page.locator("#snaggrades input:not([value=legendary]), #snagkinds input:not([value=weapon])").all()) {
        await box.click();
    }

    await page.locator("#snagback").click();
    await expect(page.locator("#menugameplay"), "back on Gameplay").toBeVisible();
    await expect(page.locator("#snagsummary")).toHaveText("Legendary; Weapons");

    // At their feet: the legendary sword taken, its gold and the pelt left in the sack
    expect(await lay("snag-2")).toEqual({ gold: 7, items: [{ id: "wolfPelt", count: 1 }] });
    expect(await legendaries()).toBe(2);

    // A few squares off: left till they're within reach of it
    expect((await lay("snag-3", 3)).items).toHaveLength(2);
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        Object.assign(me, { x: me.x + 3, square: [me.square[0] + 3, me.square[1]] });
    });
    expect((await left("snag-3")).items).toEqual([{ id: "wolfPelt", count: 1 }]);

    // Set to take everything again: what it left looked at again, and taken
    await page.locator("#snagbutton").click();
    await page.locator("#snagall").click();
    await expect(page.locator("#snaggrades input:checked")).toHaveCount(6);
    expect(await left("snag-3")).toBe(null);

    // Remembered
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")))).toMatchObject({ autoSnag: true, snagGrades: null, snagKinds: null });
});

test("the first time a fight leaves a character something, they're told in a line what to do with it; never again, not even after a restart, their loot floating where it fell over its rarity's glow, and what they pick up rising over them, not said across the screen", async ({ page }) => {
    // (A character kept, carried on from the title: played twice, more than the usual time)
    test.setTimeout(180000);
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);

    const continued = async () => {
        await title(page);
        await page.locator("#continuebutton").click();
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
    };

    await continued();

    // (A wolf's spoils for the player at their feet, and the host telling of it; a frame played)
    const leave = (id) => page.evaluate((id) => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.stop();
        game.host.ground.set(id, { id, bundle: { gold: 3, items: [{ id: "ring", count: 1, quality: "rare" }] }, for: game.me, from: "wolf", map: me.map, square: [...me.square], until: game.battle.time + 600000 });
        game.host.events.push({ type: "spoils", id: game.me, ground: id, from: "wolf-1", creature: "wolf" });
        game.advance(0.1);

        const banner = document.querySelector("#banner");
        const drawn = game.drops.drawn.get(id);

        return { told: banner.hidden ? "" : banner.textContent, once: [...game.toldOnce], things: drawn?.things.map(({ icon, ring }) => ({ name: icon.name, glow: ring.material.color.getHexString() })) };
    }, id);

    const first = await leave("loot-1");

    expect(first.told).toBe("The wolf dropped something. Tap it to take it all, or turn on Auto-snag in Game options, Gameplay.");
    expect(first.once).toEqual(["spoils"]);
    // (Kept with the character)
    expect(await keptOf(page, "told")).toMatchObject({ told: ["spoils"] });
    // (Its gold and its rare ring, each over its glow: the rare violet)
    expect(first.things).toEqual([{ name: "gold:common", glow: "e9e1d0" }, { name: "ring:rare", glow: "b07cff" }]);

    // The next time: nothing said, the loot there all the same
    await page.locator("#banner .banner-close").click();

    const second = await leave("loot-2");

    expect(second.told).not.toContain("dropped something");
    expect(second.things).toHaveLength(2);

    // Picked up: what's taken rising over the player, kept for the journal, not said across the screen
    const picked = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.host.command(game.me, { type: "pickUp", ground: "loot-2" });
        game.advance(0.1);

        const banner = document.querySelector("#banner");

        return { said: banner.hidden ? "" : banner.textContent, rising: [...document.querySelectorAll("#floaters .damage.loot")].map(({ textContent }) => textContent), kept: game.messages.at(-1)?.text };
    });

    expect(picked.said).not.toContain("You take");
    expect(picked.rising).toContain("+3 gold, a rare ring");
    expect(picked.kept).toBe("You take 3 gold, a rare ring.");

    // The game started again (back to the title, and carried on as the same character): still
    // never said again
    await continued();

    const again = await leave("loot-3");

    expect(again.once).toEqual(["spoils"]);
    expect(again.told).not.toContain("dropped something");
    expect(again.things).toHaveLength(2);
});

test("a foe the player slays: its fall rising off its body in red as it lands, as what's picked up rises over the player, not said across the screen nor kept for the journal, and what it had on it rising over the player (kept); its body off the screen, over the player; a foe of note (an elite) said across the screen, as ever", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // (What rises, as it's put up: where, and where the orc's body (its hips) and the player's head
    // are then)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const [damage, message] = [game.hud.damage.bind(game.hud), game.hud.message.bind(game.hud)];

        window.hips = () => {
            const bone = game.avatars.get("orc").character.rig.bone("Hips");

            return game.view.toScreen(bone.getWorldPosition(bone.position.clone()));
        };

        window.risen = [];
        window.said = [];
        game.hud.message = (text, seconds) => {
            window.said.push(text);
            message(text, seconds);
        };
        game.hud.damage = (point, text, options = {}) => {
            const head = game.view.toScreen(game.avatars.get(game.me).point(0.95));

            damage(point, text, options);
            window.risen.push({ point, text, kind: options.kind ?? "", body: window.hips(), head, drawn: document.querySelector("#floaters").lastElementChild?.className });
        };
    });

    const slain = () => page.evaluate(() => {
        const { game } = window.pellagos;
        return { risen: window.risen.filter(({ kind }) => kind === "slain"), said: window.said.filter((text) => text.includes("slain")), kept: game.messages.map(({ text }) => text).filter((text) => text.includes("slain")) };
    });

    // The orc put down by the player
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { hp: 1 });
        Object.assign(game.battle.actor(game.me), { hp: 1e6, maxHp: 1e6 });
        game.host.command(game.me, { type: "engage", target: "orc" });
    });
    expect(await playUntil(page, () => window.pellagos.game.battle.actor("orc").dead, { seconds: 40 })).toBe(true);
    expect(await playUntil(page, () => window.risen.some(({ kind }) => kind === "slain"), { seconds: 5 })).toBe(true);

    const fell = await slain();

    // (Risen once, in red, off where its body lies (its hips, thrown down from where it stood),
    // not over the player; not said across the screen, nor kept)
    expect(fell.risen).toHaveLength(1);
    expect(fell.risen[0].text).toBe("The orc is slain!");
    expect(fell.risen[0].drawn).toBe("damage slain");
    expect(Math.hypot(fell.risen[0].point.x - fell.risen[0].body.x, fell.risen[0].point.y - fell.risen[0].body.y)).toBeLessThan(2);
    expect(Math.hypot(fell.risen[0].point.x - fell.risen[0].head.x, fell.risen[0].point.y - fell.risen[0].head.y)).toBeGreaterThan(20);
    expect(fell.said).toEqual([]);
    expect(fell.kept).toEqual([]);

    // (What it had on it, its gold at least, straight into the pack: rising over the player, not
    // said across the screen; kept for the journal)
    const found = await page.evaluate(() => ({
        risen: window.risen.filter(({ kind }) => kind === "loot"),
        said: window.said.filter((text) => text.startsWith("You find")),
        kept: window.pellagos.game.messages.map(({ text }) => text).filter((text) => text.startsWith("You find")),
    }));

    expect(found.risen).toHaveLength(1);
    expect(found.risen[0].text).toMatch(/^\+\d+ gold/);
    expect(Math.hypot(found.risen[0].point.x - found.risen[0].head.x, found.risen[0].point.y - found.risen[0].head.y)).toBeLessThan(2);
    expect(found.said).toEqual([]);
    expect(found.kept).toEqual([`You find ${found.risen[0].text.slice(1)}.`]);

    // Its body off the screen (far behind the camera) as it falls: over the player instead
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const orc = game.battle.actor("orc");
        const avatar = game.avatars.get("orc");
        const away = [[-160, 0], [160, 0], [0, -160], [0, 160]].find(([dx, dy]) => {
            avatar.place(me.x + dx, me.y + dy, 0);

            const at = window.hips();

            return !at || at.x < 0 || at.y < 0 || at.x > innerWidth || at.y > innerHeight;
        });

        window.away = away;
        window.risen = [];

        // (There in the battle too, so it's drawn there)
        if (away) {
            const [x, y] = [me.x + away[0], me.y + away[1]];

            Object.assign(orc, { x, y, square: [Math.floor(x), Math.floor(y)], path: [], to: null, dead: true });
            game.previous.set("orc", { x, y });
        }
        game.battle.events.push({ type: "death", time: game.battle.time, id: "orc", by: game.me, respawnAt: game.battle.time + 60000 });
    });
    expect(await page.evaluate(() => window.away)).toBeTruthy();
    expect(await playUntil(page, () => window.risen.some(({ kind }) => kind === "slain"), { seconds: 5 })).toBe(true);

    const far = await slain();

    expect(far.risen).toHaveLength(1);
    expect(Math.hypot(far.risen[0].point.x - far.risen[0].head.x, far.risen[0].point.y - far.risen[0].head.y)).toBeLessThan(2);
    expect(far.said).toEqual([]);

    // A foe of note (an elite): said across the screen as ever, kept, and nothing risen
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const orc = game.battle.actor("orc");

        window.risen = [];
        orc.wild = { creature: "wolf", elite: true, champion: "elite" };
        game.battle.events.push({ type: "death", time: game.battle.time, id: "orc", by: game.me, respawnAt: game.battle.time + 60000 });
        game.advance(0.1);
    });

    const noted = await slain();

    // (And nothing risen once it's down, either)
    await playUntil(page, () => false, { seconds: 2 });
    expect((await slain()).risen).toEqual([]);

    expect(noted.risen).toEqual([]);
    expect(noted.said).toEqual(["The orc is slain!"]);
    expect(noted.kept).toEqual(["The orc is slain!"]);
});

test("those attacking the player have an icon each down the right side, a likeness in a red frame with a line of their health, whoever the player's set on glowing; with Auto target lock off, tapped, set on them where the player stands (on whoever they're set on, stopping); tapped twice, running up to them; held, walking up to them, locked on (tapped on another, let go)", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // (Auto target lock off: as it was before there was one, but for a hold)
    await page.evaluate(() => {
        window.pellagos.game.autoLock = false;
    });

    // The orc 8 squares north of the player and a slime 8 south, each stunned where it stands, after them
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;
        const free = (dy) => [0, 1, -1, 2, -2, 3, -3].map((dx) => [px + dx, py + dy]).find(([x, y]) => !squares.blocked(x, y));
        const [ox, oy] = free(-8);
        const [sx, sy] = free(8);

        game.stop();
        Object.assign(orc, { x: ox + 0.5, y: oy + 0.5, square: [ox, oy], to: null, path: [], order: null, attack: null, target: "player", stunnedUntil: battle.time + 600000 });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        battle.add({ id: "slime", kind: "beast", name: "Green slime", weapon: "slime", team: "wild", square: [sx, sy], ai: null, hp: 30, wild: { creature: "slime", tier: 1, temper: "defensive", guard: 0, roam: 0, leash: 12, pack: "slimes", leader: null, menace: false } });
        Object.assign(battle.actor("slime"), { x: sx + 0.5, y: sy + 0.5, target: "player", stunnedUntil: battle.time + 600000 });
        game.enlisting.push("slime");
    });
    expect(await playUntil(page, () => window.pellagos.game.avatars.has("slime"))).toBe(true);

    // Each with their likeness, once it's drawn: the orc first (they came to it in that order).
    // (Played on as the game would be: a likeness that comes out blank is drawn again half a
    // second of the game's time later, which a fiftieth of a second a look took more than its
    // twenty seconds to reach where frames are slow)
    expect(await playUntil(page, () => document.querySelectorAll("#attackers .attacker.painted").length === 2)).toBe(true);

    const icons = await page.evaluate(() => {
        const column = document.querySelector("#attackers");
        const screen = document.querySelector("#hud").getBoundingClientRect();

        return {
            right: screen.right - column.getBoundingClientRect().right,
            each: [...column.querySelectorAll(".attacker")].map((icon) => {
                const canvas = icon.querySelector("canvas");
                const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
                const shades = new Set();

                for (let k = 0; k < data.length; k += 4) {
                    shades.add((data[k] >> 3) * 1024 + (data[k + 1] >> 3) * 32 + (data[k + 2] >> 3));
                }

                return { id: icon.dataset.id, label: icon.getAttribute("aria-label"), border: getComputedStyle(icon).borderTopColor, health: icon.querySelector(".attacker-health-fill").style.transform, size: canvas.width, shades: shades.size, target: icon.classList.contains("target") };
            }),
        };
    });

    expect(icons.each.map(({ id }) => id)).toEqual(["orc", "slime"]);
    expect(icons.right).toBeGreaterThanOrEqual(12);
    expect(icons.right).toBeLessThan(40);

    for (const icon of icons.each) {
        expect(icon.border).toBe("rgb(212, 83, 59)");
        expect(Number(icon.health.match(/scaleX\(([\d.]+)\)/)[1])).toBe(1);
        expect(icon.size).toBe(96);
        expect(icon.shades, `${icon.id}'s likeness`).toBeGreaterThan(40);
        expect(icon.target).toBe(false);
    }

    expect(icons.each[1].label).toBe("Green slime");

    // (Where the player is and what they're doing a moment after a tap, a double tap or a hold)
    const state = (seconds) =>
        page.evaluate((seconds) => {
            const { game } = window.pellagos;
            const player = game.battle.actor("player");

            game.advance(seconds);

            const target = document.querySelector("#attackers .attacker.target");

            return { order: player.order && { ...player.order }, walking: player.path.length > 0, running: player.running, target: target?.dataset.id ?? null, pulsing: target ? getComputedStyle(target).animationName : null, lock: player.lock, locked: [...document.querySelectorAll("#attackers .attacker.locked")].map((icon) => icon.dataset.id) };
        }, seconds);
    const orcIcon = page.locator('#attackers .attacker[data-id="orc"]');
    const slimeIcon = page.locator('#attackers .attacker[data-id="slime"]');
    const start = await page.evaluate(() => [...window.pellagos.game.battle.actor("player").square]);

    // Tapped: set on the orc where the player stands, its icon glowing; then on the slime
    await orcIcon.click();

    const tapped = await state(0.5);

    await page.waitForTimeout(400);
    await slimeIcon.click();

    const swapped = await state(0.5);

    expect(tapped.order).toEqual({ type: "engage", target: "orc", run: false, stand: true });
    expect(tapped.lock, "not locked on").toBe(null);
    expect(tapped.locked).toEqual([]);
    expect(tapped.walking).toBe(false);
    expect(tapped.target).toBe("orc");
    expect(tapped.pulsing).toBe("attacker-pulse");
    expect(swapped.order).toEqual({ type: "engage", target: "slime", run: false, stand: true });
    expect(swapped.target).toBe("slime");
    expect(await page.evaluate(() => [...window.pellagos.game.battle.actor("player").square])).toEqual(start);

    // Tapped twice in quick succession: running up to the orc; tapped again on the way, stopped
    await page.waitForTimeout(400);
    await orcIcon.dblclick();

    const doubled = await state(0.4);

    await page.waitForTimeout(400);
    await orcIcon.click();

    const stopped = await state(0.4);

    expect(doubled.order).toMatchObject({ type: "engage", target: "orc", run: true });
    expect(doubled.walking).toBe(true);
    expect(doubled.running).toBe(true);
    expect(doubled.target).toBe("orc");
    expect(stopped.order).toEqual({ type: "engage", target: "orc", run: false, stand: true });
    expect(stopped.walking).toBe(false);

    // Held on the slime: walking up to it
    const box = await slimeIcon.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    const held = await state(0.4);

    expect(held.order).toEqual({ type: "engage", target: "slime", run: false });
    expect(held.walking).toBe(true);
    expect(held.running).toBe(false);
    expect(held.target).toBe("slime");
    expect(held.lock, "held: locked on").toBe("slime");
    expect(held.locked).toEqual(["slime"]);

    // Tapped on the orc: set on it where they stand, not locked on, the slime let go
    await page.waitForTimeout(400);
    await orcIcon.click();

    const other = await state(0.3);

    expect(other.order).toEqual({ type: "engage", target: "orc", run: false, stand: true });
    expect(other.lock).toBe(null);
    expect(other.locked).toEqual([]);
    expect(other.target).toBe("orc");

    // Its health line as it's hurt; gone once it's dead
    const hurt = await page.evaluate(() => {
        const { game } = window.pellagos;
        const slime = game.battle.actor("slime");

        slime.hp = Math.round(slime.maxHp / 2);
        game.advance(0.05);

        const line = document.querySelector('#attackers .attacker[data-id="slime"] .attacker-health-fill').style.transform;

        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.advance(0.05);

        return { line, left: [...document.querySelectorAll("#attackers .attacker")].map((icon) => icon.dataset.id) };
    });

    expect(Number(hurt.line.match(/scaleX\(([\d.]+)\)/)[1])).toBeCloseTo(0.5, 1);
    expect(hurt.left).toEqual(["slime"]);
});

test("the enemies list holds every foe in range the player can see: whoever they're set on first, then those after them, then the rest, the nearest first, each marked in range; X and Z step the lock through it; Tab sets them on the nearest, each press the next one out, round again, Shift+Tab back, the game keeping the key; none in sight, said", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Three foes about the player in the open, each where they can see it, stunned where it
    // stands: the orc 6 m off and a slime 9 m off after them (the orc first), another slime 12 m
    // off not; and a third slime 50 m off, out of range
    const placed = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;
        const taken = [];
        const spot = (d) => {
            for (let k = 0; k < 64; k++) {
                const angle = (k / 64) * 2 * Math.PI;
                const square = [px + Math.round(d * Math.cos(angle)), py + Math.round(d * Math.sin(angle))];

                if (!squares.blocked(...square) && battle.canSee(player, { map: "town", square }, 40) && taken.every(([x, y]) => Math.hypot(x - square[0], y - square[1]) > 3)) {
                    taken.push(square);

                    return square;
                }
            }

            return null;
        };
        const slime = (id, square, target) => {
            battle.add({ id, kind: "beast", name: "Green slime", weapon: "slime", team: "wild", square, ai: null, hp: 30, wild: { creature: "slime", tier: 1, temper: "defensive", guard: 0, roam: 0, leash: 12, pack: id, leader: null, menace: false } });
            Object.assign(battle.actor(id), { x: square[0] + 0.5, y: square[1] + 0.5, target, stunnedUntil: battle.time + 600000 });
            game.enlisting.push(id);
        };
        const near = spot(6);
        const orc = battle.actor("orc");

        game.stop();
        Object.assign(orc, { x: near[0] + 0.5, y: near[1] + 0.5, square: near, to: null, path: [], order: null, attack: null, target: "player", stunnedUntil: battle.time + 600000 });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        game.advance(0.1);
        slime("slime", spot(9), "player");
        slime("idler", spot(12), null);
        slime("far", [px + 50, py], null);

        return [orc.square, battle.actor("slime").square, battle.actor("idler").square].map(([x, y]) => Math.round(Math.hypot(x - px, y - py)));
    });

    expect(placed).toEqual([6, 9, 12]);
    expect(await playUntil(page, () => ["slime", "idler"].every((id) => window.pellagos.game.avatars.has(id)))).toBe(true);

    // (Played on a moment, the game going: keys are heard only then. Who's listed, set on, locked)
    const listed = () =>
        page.evaluate(() => {
            const { game } = window.pellagos;

            game.advance(0.3);

            return {
                icons: [...document.querySelectorAll("#attackers .attacker")].map((icon) => icon.dataset.id),
                target: document.querySelector("#attackers .attacker.target")?.dataset.id ?? null,
                lock: game.battle.actor("player").lock,
                idle: [...document.querySelectorAll("#attackers .attacker.idle")].map((icon) => icon.dataset.id),
                label: document.querySelector('#attackers .attacker[data-id="idler"]')?.getAttribute("aria-label") ?? null,
            };
        });
    const press = async (key) => {
        await page.evaluate(() => window.pellagos.game.start());
        await page.keyboard.press(key);
        await page.evaluate(() => window.pellagos.game.stop());

        return listed();
    };

    // Those after them, as they came, then the one in range that isn't, the far one not at all
    const first = await listed();

    expect(first.icons).toEqual(["orc", "slime", "idler"]);
    expect(first.idle).toEqual(["idler"]);
    expect(first.label).toBe("Green slime, in range");
    expect(first.target).toBe(null);

    // X: set on the first, locked on (Auto target lock), listed first; again, the next, round
    expect(await press("x")).toMatchObject({ target: "orc", lock: "orc", icons: ["orc", "slime", "idler"] });
    expect(await press("x")).toMatchObject({ target: "slime", lock: "slime", icons: ["slime", "orc", "idler"] });
    expect(await press("x")).toMatchObject({ target: "idler", lock: "idler", icons: ["idler", "orc", "slime"] });
    expect(await press("x")).toMatchObject({ target: "orc", lock: "orc" });

    // Z: back the other way, round
    expect(await press("z")).toMatchObject({ target: "idler", lock: "idler" });

    // Let go; Tab: the nearest, then each next one out, round again to the nearest; Shift+Tab back.
    // The key the game's, not the browser's: nothing else given the focus
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.host.command(game.me, { type: "unlock" });
        game.advance(0.1);
    });
    expect((await listed()).target).toBe(null);
    expect(await press("Tab")).toMatchObject({ target: "orc", lock: "orc" });
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    expect(await press("Tab")).toMatchObject({ target: "slime" });
    expect(await press("Tab")).toMatchObject({ target: "idler" });
    expect(await press("Tab")).toMatchObject({ target: "orc" });
    expect(await press("Shift+Tab")).toMatchObject({ target: "idler" });

    // None in sight: said
    await page.evaluate(() => {
        const { game } = window.pellagos;

        for (const id of ["orc", "slime", "idler", "far"]) {
            Object.assign(game.battle.actor(id), { dead: true, respawnAt: Infinity });
        }

        game.host.command(game.me, { type: "unlock" });
        game.advance(0.5);
    });
    await press("Tab");
    await expect(page.locator("#banner")).toHaveText("No foe in sight");
});

test("Auto target lock (Game options, on to start with): an enemy tapped stays the player's target as they walk off from it, its icon kept down the right in the lock's sights; tapped on another, the lock goes with it; tapped on it, let go, set on no one; let go 40 m off", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // On to start with, under Gameplay; turned off and on again there
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#gameplaybutton").click();
    await expect(page.locator("#lockswitch")).toBeChecked();
    expect(await page.evaluate(() => window.pellagos.game.autoLock)).toBe(true);
    await page.locator("label:has(#lockswitch)").click();
    await expect(page.locator("#lockswitch")).not.toBeChecked();
    expect(await page.evaluate(() => window.pellagos.game.autoLock)).toBe(false);
    await page.locator("label:has(#lockswitch)").click();
    expect(await page.evaluate(() => window.pellagos.game.autoLock)).toBe(true);
    await page.locator("#gameplayback").click();
    await page.locator("#optionsback").click();
    await page.locator("#resumebutton").click();
    await expect(page.locator("#menu")).toBeHidden();

    // The orc 8 squares north of the player and a slime 8 south, each stunned where it stands, after them
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;
        const free = (dy) => [0, 1, -1, 2, -2, 3, -3].map((dx) => [px + dx, py + dy]).find(([x, y]) => !squares.blocked(x, y));
        const [ox, oy] = free(-8);
        const [sx, sy] = free(8);

        game.stop();
        Object.assign(orc, { x: ox + 0.5, y: oy + 0.5, square: [ox, oy], to: null, path: [], order: null, attack: null, target: "player", stunnedUntil: battle.time + 600000 });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        battle.add({ id: "slime", kind: "beast", name: "Green slime", weapon: "slime", team: "wild", square: [sx, sy], ai: null, hp: 30, wild: { creature: "slime", tier: 1, temper: "defensive", guard: 0, roam: 0, leash: 12, pack: "slimes", leader: null, menace: false } });
        Object.assign(battle.actor("slime"), { x: sx + 0.5, y: sy + 0.5, target: "player", stunnedUntil: battle.time + 600000 });
        game.enlisting.push("slime");
    });
    expect(await playUntil(page, () => document.querySelectorAll("#attackers .attacker").length === 2)).toBe(true);

    // (What the player's doing a moment on, who's ringed and marked down the right, and who's in
    // the lock's sights)
    const state = (seconds) =>
        page.evaluate((seconds) => {
            const { game } = window.pellagos;
            const player = game.battle.actor("player");

            game.advance(seconds);

            const locked = [...document.querySelectorAll("#attackers .attacker.locked")];

            return {
                order: player.order && { ...player.order },
                lock: player.lock,
                ringed: game.hud.targeted,
                icons: [...document.querySelectorAll("#attackers .attacker")].map((icon) => icon.dataset.id),
                target: document.querySelector("#attackers .attacker.target")?.dataset.id ?? null,
                locked: locked.map((icon) => icon.dataset.id),
                sights: locked.map((icon) => getComputedStyle(icon.querySelector(".attacker-lock")).display),
                label: locked[0]?.getAttribute("aria-label") ?? null,
            };
        }, seconds);
    const orcIcon = page.locator('#attackers .attacker[data-id="orc"]');
    const slimeIcon = page.locator('#attackers .attacker[data-id="slime"]');

    // Tapped: set on the orc where the player stands, and locked on, in the lock's sights
    await orcIcon.click();

    const tapped = await state(0.3);

    expect(tapped.order).toEqual({ type: "engage", target: "orc", run: false, stand: true });
    expect(tapped.lock).toBe("orc");
    expect(tapped.target).toBe("orc");
    expect(tapped.locked).toEqual(["orc"]);
    expect(tapped.sights).toEqual(["block"]);
    expect(tapped.label).toMatch(/, locked on \(tap to let go\)$/);

    // Walking off south, away from it, and it no longer after them: still their target, ringed,
    // its icon kept in the lock's sights
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        game.battle.actor("orc").target = null;
        game.host.command(game.me, { type: "move", to: [player.square[0], player.square[1] + 4] });
    });

    const walking = await state(0.6);

    expect(walking.order?.type).toBe("move");
    expect(walking.lock).toBe("orc");
    expect(walking.ringed).toBe("orc");
    expect(walking.target).toBe("orc");
    expect(walking.locked).toEqual(["orc"]);
    expect(walking.icons).toContain("orc");

    // Tapped on the slime: the lock goes with them, to it
    await page.waitForTimeout(400);
    await slimeIcon.click();

    const swapped = await state(0.3);

    expect(swapped.order).toEqual({ type: "engage", target: "slime", run: false, stand: true });
    expect(swapped.lock).toBe("slime");
    expect(swapped.locked).toEqual(["slime"]);
    expect(swapped.icons, "the orc, no longer after them nor locked on, listed after it, in range").toEqual(["slime", "orc"]);

    // Tapped on the slime again: let go, set on no one, nothing marked
    await page.waitForTimeout(400);
    await slimeIcon.click();

    const unlocked = await state(0.3);

    expect(unlocked.lock).toBe(null);
    expect(unlocked.order).toBe(null);
    expect(unlocked.ringed).toBe(null);
    expect(unlocked.target).toBe(null);
    expect(unlocked.locked).toEqual([]);

    // Locked on it again, then it's 40 m off: let go
    await page.waitForTimeout(400);
    await slimeIcon.click();
    expect((await state(0.2)).lock).toBe("slime");

    const far = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const slime = game.battle.actor("slime");
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;
        const ways = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        const spot = ways.flatMap(([ux, uy]) => [0, 1, -1, 2, -2, 3, -3].map((side) => [px + ux * 41 + uy * side, py + uy * 41 + ux * side])).find(([x, y]) => !squares.blocked(x, y));

        Object.assign(slime, { x: spot[0] + 0.5, y: spot[1] + 0.5, square: spot, target: null });
        game.advance(0.2);

        return { lock: player.lock, off: Math.hypot(slime.x - player.x, slime.y - player.y) };
    });

    expect(far.off).toBeGreaterThanOrEqual(40);
    expect(far.lock).toBe(null);
});

test("the player's party: a creature called to their side has an icon down the left under the Party button, a likeness in a violet frame with its health and time; tapped, chosen to help (ringed green, the Action Bar's Vigor cast on it); held and flicked W, told to wait; held and flicked SW, Dismiss asks first, and it's kept; the party menu (P) lists it, Follow sets it following, and Dismiss, asked first, sends it off", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Summon learnt and cast where the player stands
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.progress.learn("summon");
        Object.assign(game.battle.actor(game.me), { spellReadyAt: 0, spellsReadyAt: {} });
        game.host.command(game.me, { type: "cast", spell: "summon" });
    });
    expect(await playUntil(page, () => window.pellagos.game.host.companions.size === 1 && window.pellagos.game.avatars.has([...window.pellagos.game.host.companions.keys()][0]), { seconds: 60 })).toBe(true);

    // Its icon, its likeness once it's drawn (a tenth of a second at a time: each look draws a
    // frame, slow on a slow runner, and the likeness waits half a second of play)
    await page.waitForFunction(
        () => {
            window.pellagos.game.advance(0.1);

            return document.querySelector("#party .member.summon.painted");
        },
        null,
        { timeout: 20000 },
    );

    const icon = await page.evaluate(() => {
        const { game } = window.pellagos;
        const [id] = [...game.host.companions.keys()];
        const member = document.querySelector(`#party .member[data-id="${id}"]`);
        const button = document.querySelector("#partybutton").getBoundingClientRect();
        const map = document.querySelector("#minimap").getBoundingClientRect();
        const rect = member.getBoundingClientRect();
        const canvas = member.querySelector("canvas");
        const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        const shades = new Set();

        for (let k = 0; k < data.length; k += 4) {
            shades.add((data[k] >> 3) * 1024 + (data[k + 1] >> 3) * 32 + (data[k + 2] >> 3));
        }

        return { id, label: member.getAttribute("aria-label"), border: getComputedStyle(member).borderTopColor, time: !member.querySelector(".member-time").hidden, rect: rect.toJSON(), button: button.toJSON(), map: map.toJSON(), shades: shades.size };
    });

    expect(icon.label).toMatch(/, called to your side$/);
    expect(icon.border).toBe("rgb(169, 139, 255)");
    expect(icon.time).toBe(true);
    expect(icon.shades).toBeGreaterThan(40);
    expect(icon.button.top).toBeGreaterThanOrEqual(icon.map.bottom);
    expect(icon.rect.top).toBeGreaterThanOrEqual(icon.button.bottom);
    expect(icon.rect.left).toBeLessThan(40);

    // Tapped: chosen to help, ringed green; Vigor from the Action Bar cast on it, not the player
    const member = page.locator(`#party .member[data-id="${icon.id}"]`);

    await member.click();

    const chosen = await page.evaluate((id) => {
        const { game } = window.pellagos;
        const called = game.battle.actor(id);

        game.advance(0.05);
        called.hp = Math.round(called.maxHp / 2);
        game.battle.actor(game.me).hp = Math.round(game.battle.actor(game.me).maxHp / 2);
        Object.assign(game.battle.actor(game.me), { spellReadyAt: 0, spellsReadyAt: {} });

        const used = game.quick(0);

        game.advance(2.5, { render: false });

        return { ally: game.allyTarget, ring: game.effects.ally?.object === game.avatars.get(id).object, glowing: document.querySelector(`#party .member[data-id="${id}"]`).classList.contains("ally"), used, healed: called.hp > Math.round(called.maxHp / 2), player: game.battle.actor(game.me).hp / game.battle.actor(game.me).maxHp };
    }, icon.id);

    expect(chosen.ally).toBe(icon.id);
    expect(chosen.ring).toBe(true);
    expect(chosen.glowing).toBe(true);
    expect(chosen.used.ok).toBe(true);
    expect(chosen.healed).toBe(true);
    expect(chosen.player).toBeCloseTo(0.5, 1);

    // Held: the wheel opens with its middle right under the finger (the icon's by the screen's
    // edge: past it, not pulled in off the finger); flicked W, told to wait where it is
    const box = await member.boundingBox();
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(700);

    const opened = await page.evaluate(() => {
        const { wheel } = window.pellagos.game;
        const at = wheel.element.getBoundingClientRect();

        return { open: Boolean(wheel.open), slots: { ...wheel.slots }, middle: { x: at.x + at.width / 2, y: at.y + at.height / 2 } };
    });

    expect(Math.hypot(opened.middle.x - cx, opened.middle.y - cy)).toBeLessThan(1);

    await page.mouse.move(Math.max(1, cx - 34), cy, { steps: 4 });
    await page.mouse.up();

    const waiting = await page.evaluate((id) => {
        const { game } = window.pellagos;

        game.advance(0.05);

        return { waiting: game.host.waiting(id), marked: document.querySelector(`#party .member[data-id="${id}"]`).classList.contains("waiting") };
    }, icon.id);

    expect(opened.open).toBe(true);
    expect(opened.slots).toEqual({ n: "unit:assist", ne: "unit:ability", e: "unit:follow", w: "unit:wait", nw: "unit:guard", se: "unit:fallback", sw: "unit:dismiss" });
    expect(waiting).toEqual({ waiting: true, marked: true });

    // Held again and Dismiss chosen on its wheel: asked first (it's for good); kept
    const ask = page.getByRole("alertdialog", { name: /^Dismiss .+\?$/ });

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.move(Math.max(1, cx - 26), cy + 26, { steps: 4 });
    await page.mouse.up();
    await expect(ask).toBeVisible();
    await expect(ask.locator("#dismissnote")).toContainText("for good");
    await ask.getByRole("button", { name: "Keep them" }).click();
    await expect(ask).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.game.host.companions.size)).toBe(1);

    // The party menu (the game going again a moment, as keys are heard only then): its row,
    // Follow (it's waiting), then Dismiss, asked first
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("p");

    const menu = page.getByRole("dialog", { name: "Party" });
    const row = menu.locator(`.party-row[data-id="${icon.id}"]`);

    await expect(menu).toBeVisible();
    await page.evaluate(() => window.pellagos.game.stop());
    await expect(row.locator(".party-kind")).toHaveText(/^Called .+ · \d+:\d\d left$/);
    await expect(row.locator(".party-state")).toContainText("Waiting");
    await row.getByRole("button", { name: "Follow" }).click();
    expect(await page.evaluate((id) => window.pellagos.game.host.waiting(id), icon.id)).toBe(false);
    await expect(row.getByRole("button", { name: "Wait" })).toBeVisible();

    const dismiss = row.getByRole("button", { name: "Dismiss" });

    await dismiss.click();
    await expect(ask).toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.host.companions.size)).toBe(1);
    await ask.getByRole("button", { name: /^Dismiss / }).click();
    await expect(ask).toBeHidden();

    const gone = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.advance(0.05);

        return { companions: game.host.companions.size, icons: document.querySelectorAll("#party .member").length, ally: game.allyTarget, banner: document.querySelector("#banner").textContent };
    });

    expect(gone).toMatchObject({ companions: 0, icons: 0, ally: null });
    expect(gone.banner).toMatch(/^You let your .+ go\.$/);
    await expect(menu.locator(".party-empty")).toContainText("No one's with you");
    await menu.getByRole("button", { name: "Close" }).click();
    await expect(menu).toBeHidden();
});

test("in a fight, the battle cam swings round to see the player and their foe from the side, both on the screen and neither hidden; leaving it be once the fight's over", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const fight = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const { view } = session;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;
        const [x, y] = [0, 1, -1].map((dx) => [px + dx, py - 3]).find(([sx, sy]) => !squares.blocked(sx, sy));
        const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

        // (The orc a few steps north of the player, stunned where it stands, set on them; the
        // camera looking north from behind them)
        game.stop();
        Object.assign(orc, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, attack: null, target: "player", stunnedUntil: battle.time + 60000 });
        game.avatars.get("orc").place(x + 0.5, y + 0.5, 0);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        game.cameraFollow.yaw = 0;
        game.advance(3);

        const me = game.avatars.get("player");
        const it = game.avatars.get("orc");
        const behind = Math.atan2(me.object.position.x - it.object.position.x, me.object.position.z - it.object.position.z);
        const rect = view.canvas.getBoundingClientRect();
        const onScreen = (point) => {
            const spot = view.toScreen(point);

            return Boolean(spot) && spot.x > rect.left && spot.x < rect.right && spot.y > rect.top && spot.y < rect.bottom;
        };
        const framed = {
            settings: game.cameraSettings,
            round: Math.abs(wrap(view.yaw - behind)),
            seen: [onScreen(me.point(0.55)), onScreen(it.point(0.55))],
            hidden: [view.hidden(me.point(0.55)), view.hidden(it.point(0.55))],
        };

        // The orc gone: the camera left where it's turned as the player stands
        Object.assign(orc, { dead: true, respawnAt: Infinity, target: null });
        game.fightView = null;
        game.advance(0.5);

        const yaw = game.cameraFollow.yaw;

        game.advance(2);

        return { ...framed, after: Math.abs(wrap(game.cameraFollow.yaw - yaw)) };
    });

    expect(fight.settings).toMatchObject({ follows: false, battle: true });
    expect(fight.round).toBeGreaterThan(Math.PI / 6 - 0.15);
    expect(fight.round).toBeLessThan(Math.PI / 2 + 0.15);
    expect(fight.seen).toEqual([true, true]);
    expect(fight.hidden).toEqual([false, false]);
    expect(fight.after).toBeLessThan(0.01);
});

test("the battle cam takes a fight over only once the player and their foe are both wholly on the screen: one coming for them out of view leaves the camera be; come into view, it frames the fight, once: turned by hand, the camera's left as it's turned", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const fight = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const { view } = session;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;
        const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
        const rect = view.canvas.getBoundingClientRect();
        const onScreen = (point) => {
            const spot = view.toScreen(point);

            return Boolean(spot) && spot.x > rect.left && spot.x < rect.right && spot.y > rect.top && spot.y < rect.bottom;
        };
        const it = game.avatars.get("orc");
        const me = game.avatars.get("player");
        // (The orc on a square, stunned where it stands, set on the player)
        const put = ([x, y]) => {
            Object.assign(orc, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, attack: null, target: "player", stunnedUntil: battle.time + 60000 });
            it.place(x + 0.5, y + 0.5, 0);
            game.previous.set("orc", { x: orc.x, y: orc.y });
        };

        // The camera looking north from behind the player; the orc off to one side of them, out of
        // the picture
        game.stop();
        game.cameraFollow.yaw = 0;
        game.advance(0.1);

        const aside = [8, 9, 10, 11, -8, -9, -10, -11].map((dx) => [px + dx, py]).find((square) => {
            if (squares.blocked(...square)) {
                return false;
            }

            put(square);
            game.advance(0.1);

            return !onScreen(it.object.position) && !onScreen(it.point(1));
        });

        game.cameraFollow.yaw = 0;
        game.advance(0.1);

        const yaw = game.cameraFollow.yaw;

        game.advance(3);

        const away = { found: Boolean(aside), turned: Math.abs(wrap(game.cameraFollow.yaw - yaw)), seen: onScreen(it.point(0.55)) };

        // Come round in front of the player, a few steps off, the whole of it in the picture: the
        // battle cam takes over, and swings round to see the fight from the side, both on the screen
        put([0, 1, -1].map((dx) => [px + dx, py - 3]).find((square) => !squares.blocked(...square)));
        game.advance(0.1);

        const inFull = [onScreen(it.object.position), onScreen(it.point(1))];

        game.advance(3);

        const behind = Math.atan2(me.object.position.x - it.object.position.x, me.object.position.z - it.object.position.z);
        const framed = { round: Math.abs(wrap(view.yaw - behind)), seen: [onScreen(me.point(0.55)), onScreen(it.point(0.55))] };

        // Turned by hand (a drag: taken hold of, turned straight behind the player, let go): left
        // as it's turned, not swung back round to frame the fight again a second after
        game.cameraFollow.grab();
        game.advance(0.1);
        game.cameraFollow.turn(wrap(behind - game.cameraFollow.yaw));
        game.cameraFollow.release();
        game.advance(3);

        // (But the foe's still kept in sight: a hole cut through whatever hides it, a big one drawn back from)
        return { away, inFull, ...framed, left: Math.abs(wrap(game.cameraFollow.yaw - behind)), kept: view.foe ? Math.hypot(view.foe.x - it.object.position.x, view.foe.z - it.object.position.z) : null };
    });

    expect(fight.away).toEqual({ found: true, turned: 0, seen: false });
    expect(fight.inFull).toEqual([true, true]);
    expect(fight.round).toBeGreaterThan(Math.PI / 6 - 0.15);
    expect(fight.round).toBeLessThan(Math.PI / 2 + 0.15);
    expect(fight.seen).toEqual([true, true]);
    expect(fight.left).toBeLessThan(0.01);
    expect(fight.kept).not.toBeNull();
    expect(fight.kept).toBeLessThan(0.1);
});

test("on a PC, Q and E turn the camera round the player while held, and R swings it round behind them; nothing else moves", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
    // (The game stepped on by hand, so the turn's as a phone's or a PC's frames would have it)
    const advance = (seconds) => page.evaluate((seconds) => window.pellagos.game.advance(seconds), seconds);
    const yaw = () => page.evaluate(() => window.pellagos.game.cameraFollow.yaw);
    // (Each key held as the game goes on by hand, as a phone's or a PC's frames would step it: its
    // own loop stopped, but still listening, so what's pressed is heard)
    await page.evaluate(() => window.pellagos.game.view.renderer.setAnimationLoop(null));

    const press = async (key, seconds) => {
        await page.keyboard.down(key);

        const from = await yaw();

        await advance(seconds);
        await page.keyboard.up(key);
        await advance(1);

        return wrap((await yaw()) - from);
    };
    const start = await page.evaluate(() => ({ square: [...window.pellagos.game.battle.actor("player").square] }));

    // Q held half a second: turned one way (as a drag to the left), a radian; and left there after
    const left = await press("q", 0.5);

    expect(left).toBeGreaterThan(0.8);
    expect(left).toBeLessThan(1.2);

    const held = await yaw();

    await advance(1);
    expect(Math.abs(wrap((await yaw()) - held))).toBeLessThan(0.02);

    // E held: back the other way
    expect(await press("e", 0.5)).toBeLessThan(-0.8);

    // R: swung round behind the player, the way they face
    await press("r", 2.5);

    const behind = await page.evaluate(() => {
        const { game } = window.pellagos;
        const off = game.cameraFollow.yaw - (game.battle.actor("player").facing + Math.PI);

        return Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
    });

    expect(behind).toBeLessThan(0.05);
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").square)).toEqual(start.square);
});

test("dragging turns the camera round the player and tilts it; it holds while they stand, and following, swings back behind them once they walk", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const before = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        game.cameraSettings = { ...game.cameraSettings, follows: true };

        return { yaw: session.view.yaw, pitch: session.view.pitch, square: [...player.square], width: session.view.canvas.clientWidth, height: session.view.canvas.clientHeight };
    });

    // A drag from off to the side of the player: right and up
    const [x, y] = [before.width * 0.2, before.height * 0.75];

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let k = 1; k <= 10; k++) {
        await page.mouse.move(x + k * 18, y - k * 6);
    }

    await page.mouse.up();

    const dragged = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();

        const turned = { yaw: session.view.yaw, pitch: session.view.pitch, order: player.order?.type ?? null };

        // Standing a while: it holds where it was turned
        game.advance(2);

        return { ...turned, held: { yaw: session.view.yaw, pitch: session.view.pitch } };
    });

    const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

    // Dragged right, it looks further right (turning clockwise from above); dragged up, it looks
    // further up (tilting lower), by as much as the drag
    expect(wrap(dragged.yaw - before.yaw)).toBeCloseTo((-180 / before.width) * Math.PI, 1);
    expect(dragged.pitch).toBeLessThan(before.pitch - 3);
    expect(dragged.order).toBe(null);
    expect(dragged.held.yaw).toBeCloseTo(dragged.yaw, 5);
    expect(dragged.held.pitch).toBeCloseTo(dragged.pitch, 5);

    // Walking again (north, a few steps): back round behind them, facing the way they go, still
    // tilted as it was
    const walked = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        game.battle.command("player", { type: "move", to: [player.square[0], player.square[1] - 6] });
        game.advance(2.5);

        return { yaw: session.view.yaw, pitch: session.view.pitch };
    });

    expect(Math.abs(wrap(walked.yaw))).toBeLessThan(0.2);
    expect(walked.pitch).toBeCloseTo(dragged.pitch, 5);
});

test("dragged up, the camera looks up into the sky (clouds and the sun in it, birds flying by), and following, walking, it looks down again", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const sky = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { view } = session;
        const player = game.battle.actor("player");
        const me = game.avatars.get(game.me).object.position;

        game.stop();
        game.cameraSettings = { ...game.cameraSettings, follows: true };

        // (Tilted up as far as it goes)
        game.cameraFollow.turn(0, -120, view.lowestPitch());
        game.flyers.send("crow", { x: me.x, z: me.z });
        game.advance(1);

        const looking = view.camera.getWorldDirection(view.camera.position.clone());
        const up = { pitch: view.pitch, lowest: view.lowestPitch(), height: view.camera.position.y, looking: looking.y, sky: view.sky.object.visible && view.far.scene.children.includes(view.sky.object), birds: game.flyers.counts.birds, drawn: game.flyers.meshes.get("crow").count };

        // Walking again: looking down to see where they go
        game.battle.command("player", { type: "move", to: [player.square[0], player.square[1] - 6] });
        game.advance(2.5);

        return { up, walking: view.pitch };
    });

    expect(sky.up.lowest).toBe(-45);
    expect(sky.up.pitch).toBe(-45);
    expect(sky.up.height).toBeGreaterThan(0.3);
    expect(sky.up.looking).toBeGreaterThan(0.5);
    expect(sky.up.sky).toBe(true);
    expect(sky.up.birds).toBeGreaterThan(0);
    expect(sky.up.drawn).toBe(sky.up.birds);
    expect(sky.walking).toBeGreaterThanOrEqual(15);
});

test("in the town, the camera comes in closer than a building in the way, or rises over it; a well in the way it sees round", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const views = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { view } = session;
        const squares = game.world.maps.town.squares;
        const buildings = game.town.buildings;
        const { at, width, height } = game.world.stamp;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Somewhere with a building a couple of squares south of the player (behind them, as the
        // camera looks north), and somewhere open all round
        let walled = null;
        let open = null;

        // (In the town)
        const none = (x, y) => {
            for (let dy = -3; dy < 12; dy++) {
                for (let dx = -12; dx < 12; dx++) {
                    if (buildings.at(x + dx, y + dy) > 0) {
                        return false;
                    }
                }
            }

            return true;
        };

        for (let y = at[1] + 4; y < at[1] + height - 12 && !(walled && open); y++) {
            for (let x = at[0] + 12; x < at[0] + width - 12 && !(walled && open); x++) {
                const clear = [0, 1].every((dy) => !squares.blocked(x, y + dy));

                if (!walled && clear && buildings.at(x, y + 2) > 5 && buildings.at(x, y + 3) > 5) {
                    walled = [x, y];
                }

                if (!open && clear && none(x, y)) {
                    open = [x, y];
                }
            }
        }

        const look = ([x, y]) => {
            const player = game.battle.actor("player");

            Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
            game.advance(1.5);
            game.cameraFollow.yaw = 0;
            game.cameraFollow.turning = 0;
            game.advance(1.5);

            const camera = view.camera.position;
            const height = buildings.at(camera.x, camera.z);

            return { pulled: view.pulled, lifted: view.lifted, clearOfIt: camera.y > height, hidden: view.hidden(game.avatars.get("player").point(0.55)), cut: view.cut };
        };

        // (Behind the well in the square, its roof between the player and the camera: low enough
        // to see them round, so it's never cut away, nor counted as in the way)
        const [ox, oz] = Array.isArray(game.world.origin) ? game.world.origin : [game.world.origin, game.world.origin];
        const well = game.world.town.pieces.find(({ name }) => name === "well");
        const behind = well && [2, 2.5, 3, 3.5].map((d) => [Math.floor(ox + well.x), Math.floor(oz + well.y - d)]).find(([x, y]) => !squares.blocked(x, y));
        const byWell = behind && { ...look(behind), height: game.town.heights.at(ox + well.x, oz + well.y) };

        const walledView = walled && look(walled);

        // (Clear of the building, looking steeply down from close by: held where it was a moment,
        // so gaps between houses don't pump it in and out; then going back out)
        let clearing = null;

        if (walled) {
            const before = view.pulled + view.lifted;

            view.zoom(0.2);
            game.cameraFollow.pitch = 75;
            game.advance(0.2);

            const held = view.pulled + view.lifted;

            game.advance(3);
            clearing = { before, held, after: view.pulled + view.lifted };
            view.zoom(5);
            game.cameraFollow.pitch = 35;
        }

        return { walled: walledView, clearing, open: open && look(open), byWell };
    });

    expect(views.byWell).toMatchObject({ hidden: false, cut: 0, height: 0 });
    expect(views.walled).not.toBe(null);
    expect(views.walled.pulled + views.walled.lifted).toBeGreaterThan(1);
    expect(views.clearing.held).toBeGreaterThan(views.clearing.before * 0.95);
    expect(views.clearing.after).toBeLessThan(0.3);
    expect(views.walled.clearOfIt).toBe(true);
    expect(views.open).not.toBe(null);
    expect(views.open.pulled).toBeLessThan(0.05);
    expect(views.open.lifted).toBeLessThan(0.5);
});

// How many textures each shader drawn so far reads ([{ name, read }]): no more than an iPhone lets
// one read (16; this browser allows more), or its shader won't compile there and nothing it draws
// is seen
function texturesRead(page) {
    return page.evaluate(() => {
        const renderer = window.pellagos.session.view.renderer;
        const gl = renderer.getContext();
        const samplers = new Set([gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.INT_SAMPLER_2D, gl.INT_SAMPLER_3D, gl.INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY, gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D, gl.UNSIGNED_INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY]);

        return renderer.info.programs.map(({ name, program }) => {
            let read = 0;

            for (let k = 0; k < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); k++) {
                const uniform = gl.getActiveUniform(program, k);

                read += samplers.has(uniform.type) ? uniform.size : 0;
            }

            return { name, read };
        });
    });
}

test("walks out of the town into the world, drawn round the player as they go, with no loading; the wild's creatures about them there", async ({ page }) => {
    // (Three minutes' walk out of the town, played through, and a night's camp: longer than most)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const trip = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const world = game.world.maps.town;
        const key = (cx, cy) => cy * 128 + cx;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Somewhere open about 250 metres west of the town
        let goal = null;

        for (let d = 0; d < 60 && !goal; d++) {
            for (const y of [Math.floor(player.y) + d, Math.floor(player.y) - d]) {
                if (!goal && !world.squares.blocked(game.world.stamp.at[0] - 250, y)) {
                    goal = [game.world.stamp.at[0] - 250, y];
                }
            }
        }

        const before = [...game.chunks.drawn.keys()];

        game.battle.command("player", { type: "move", to: goal });

        // (Walking, it's three minutes or so: played on without drawing but every eight seconds)
        for (let k = 0; k < 40 && player.order; k++) {
            game.advance(8);
        }

        game.minimap.drawn = -Infinity;
        game.advance(1);

        // (The creatures put out lately drawn a step at a time, the nearest first: all of them,
        // given a moment; the first of each kind's looks takes a while to sculpt)
        for (let k = 0; k < 120 && (game.enlisting.length || game.enlistees.size); k++) {
            game.advance(0.25);
        }

        const [cx, cy] = [Math.floor(player.x / 64), Math.floor(player.y / 64)];
        const [x0, z0, across] = game.minimap.shown();
        const round = [];

        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                round.push(game.chunks.drawn.has(key(cx + dx, cy + dy)));
            }
        }

        // (The wild's creatures about them out here, each drawn as its kind looks)
        const beasts = [...game.host.wild.keys()].map((id) => game.battle.actor(id)).filter((actor) => actor && !actor.dead);

        return {
            arrived: Math.hypot(player.x - goal[0] - 0.5, player.y - goal[1] - 0.5) < 1.5,
            outside: !world.inTown(Math.floor(player.x), Math.floor(player.y)),
            round,
            near: [...game.chunks.drawn.values()].every((drawn) => Math.max(Math.abs(drawn.cx - cx), Math.abs(drawn.cy - cy)) <= 3),
            dropped: before.filter((drawn) => !game.chunks.drawn.has(drawn)).length,
            mapped: player.x > x0 && player.x < x0 + across && player.y > z0 && player.y < z0 + across,
            beasts: beasts.length,
            drawn: beasts.filter((actor) => game.avatars.has(actor.id)).length,
            kinds: beasts.every((actor) => actor.kind === "beast" && actor.wild?.creature),
        };
    });

    expect(trip.arrived).toBe(true);
    expect(trip.outside).toBe(true);
    expect(trip.round).toEqual(Array(25).fill(true));
    expect(trip.near).toBe(true);
    expect(trip.dropped).toBeGreaterThan(0);
    expect(trip.mapped).toBe(true);
    expect(trip.beasts).toBeGreaterThan(0);
    expect(trip.drawn).toBe(trip.beasts);
    expect(trip.kinds).toBe(true);

    // Out here, the wild's creatures put off, the player makes camp (Make camp, at the top of their
    // own wheel's other side), asked how long (so many hours, till sundown or the morning): asleep
    // till sundown, woken by their tent and its fire, and told
    const camped = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { elapsedOf, timeOfDay, SUNDOWN } = await import("/js/core/daytime.js");

        game.stop();

        for (const id of game.host.wild.keys()) {
            Object.assign(game.battle.actor(id) ?? {}, { dead: true, respawnAt: Infinity });
        }

        const before = elapsedOf(game.host.war);
        const said = [];
        const message = game.hud.message;

        game.hud.message = (text, seconds) => {
            said.push(text);
            message.call(game.hud, text, seconds);
        };

        const result = game.act(game.wheels.self[1].n, "self");
        const asked = [...document.querySelectorAll(".choice button")].map((button) => button.textContent);

        [...document.querySelectorAll(".choice button")].find((button) => button.textContent.startsWith("Until sundown")).click();
        game.advance(0.2);
        game.hud.message = message;

        return {
            result,
            asked,
            woken: timeOfDay(elapsedOf(game.host.war)) - SUNDOWN,
            passed: elapsedOf(game.host.war) > before,
            drawn: game.camps.camps.has("rest-player"),
            said,
            lit: game.camps.lights().length,
        };
    });

    expect(camped.result).toEqual({ ok: true });
    expect(camped.asked).toEqual(["−", "+", "Sleep 8 hours", expect.stringMatching(/^Until sundown \(/), expect.stringMatching(/^Until morning \(/), "Cancel"]);
    expect(camped.passed).toBe(true);
    expect(camped.woken).toBeGreaterThanOrEqual(0);
    expect(camped.woken).toBeLessThan(1000);
    expect(camped.drawn).toBe(true);
    expect(camped.lit).toBeGreaterThan(0);
    expect(camped.said.some((text) => /^You sleep by the fire till sundown/.test(text)), JSON.stringify(camped.said)).toBe(true);

    // Every shader drawn so far (the town, the world round it and its far land, its water, grass,
    // trees and creatures) reads no more textures than an iPhone lets one read
    const reading = await texturesRead(page);

    expect(reading.map(({ name }) => name)).toContain("ground");
    expect(reading.filter(({ read }) => read > 16)).toEqual([]);
});

test("up in the mountains, cliffs of rock where it's too steep to climb, and an arch of rock over open ground, its legs not walked into", async ({ page }) => {
    await playing(page, "/?play&seed=1");
    await page.evaluate(() => window.pellagos.game.stop());

    // Up in the mountains to the north east, where the ground's too steep to climb: cliffs of rock
    // stand out of it, a mesh of their own a chunk, drawn with the rock's picture laid on from
    // three sides
    const cliffs = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const [x, y] = [5776, 528];

        Object.assign(game.battle.actor(game.me), { x, y, path: [], order: null, progress: null });
        game.avatars.get(game.me).object.position.set(x, game.world.maps.town.ground.heightAt(x, y), y);

        for (let n = 0; n < 4; n++) {
            game.advance(0.25, { render: false });

            for (let k = 0; k < 400 && (game.chunks.update(x, y, { budget: 200 }) || game.chunks.busy); k++) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        game.advance(0.05);

        const meshes = [];

        session.view.scene.traverse((node) => node.name === "cliffs" && meshes.push(node));

        return {
            meshes: meshes.length,
            triangles: meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute("position").count / 3, 0),
            material: [...new Set(meshes.map((mesh) => mesh.material.name))],
            compiled: session.view.renderer.info.programs.some(({ name }) => name === "cliffs"),
        };
    });

    expect(cliffs.meshes).toBeGreaterThan(2);
    expect(cliffs.triangles).toBeGreaterThan(3000);
    expect(cliffs.material).toEqual(["cliffs"]);
    expect(cliffs.compiled).toBe(true);

    // At an arch of rock (core/arches.js): drawn over its legs, which can't be walked into, the
    // ground under its span open
    const arch = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const land = game.world.maps.town;
        const [{ x, y, turn, span }] = land.arches;
        const [sx, sy] = [x - Math.sin(turn) * 20, y + Math.cos(turn) * 20];

        Object.assign(game.battle.actor(game.me), { x: sx, y: sy, path: [], order: null, progress: null });
        game.avatars.get(game.me).object.position.set(sx, land.ground.heightAt(sx, sy), sy);

        for (let n = 0; n < 4; n++) {
            game.advance(0.25, { render: false });

            for (let k = 0; k < 400 && (game.chunks.update(sx, sy, { budget: 200 }) || game.chunks.busy); k++) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        game.advance(0.05);

        const meshes = [];

        session.view.scene.traverse((node) => node.name === "arches" && meshes.push(node));

        const foot = [x - (Math.cos(turn) * span) / 2, y - (Math.sin(turn) * span) / 2];

        return {
            drawn: meshes.length,
            leg: land.squares.blocked(Math.floor(foot[0]), Math.floor(foot[1])),
            under: land.squares.blocked(Math.floor(x), Math.floor(y)),
        };
    });

    expect(arch.drawn).toBe(1);
    expect(arch.leg).toBe(true);
    expect(arch.under).toBe(false);

    // Their shader, as every other drawn so far, reads no more textures than an iPhone lets one read
    const reading = await texturesRead(page);

    expect(reading.map(({ name }) => name)).toContain("cliffs");
    expect(reading.filter(({ read }) => read > 16)).toEqual([]);
});

test("by the start town the road crosses the river on a stone bridge: drawn of stone over its arches, walked over on its cobbles, up its ramp and down the other", async ({ page }) => {
    await playing(page, "/?play&seed=1");
    await page.evaluate(() => window.pellagos.game.stop());

    const crossing = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const land = game.world.maps.town;
        const bridge = land.chunkAt(3005, 5150).bridges.find(({ stone }) => stone);
        const { a, b } = bridge;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const [ux, uy] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        const [sx, sy] = [a[0] - ux * 3, a[1] - uy * 3];
        const me = game.battle.actor(game.me);
        const avatar = game.avatars.get(game.me);

        Object.assign(me, { x: sx, y: sy, path: [], order: null, progress: null });
        avatar.object.position.set(sx, land.ground.heightAt(sx, sy), sy);

        for (let n = 0; n < 4; n++) {
            game.advance(0.25, { render: false });

            for (let k = 0; k < 400 && (game.chunks.update(sx, sy, { budget: 200 }) || game.chunks.busy); k++) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        game.advance(0.05);

        const drawn = [];

        session.view.scene.traverse((node) => node.name === "stone bridges" && drawn.push(node));

        // Over it to the far bank, as high as its deck at its middle on the way
        const to = [Math.floor(b[0] + ux * 3), Math.floor(b[1] + uy * 3)];
        let highest = -Infinity;

        game.battle.command(game.me, { type: "move", to });

        for (let k = 0; k < 80 && Math.hypot(me.x - to[0] - 0.5, me.y - to[1] - 0.5) > 1; k++) {
            game.advance(0.25, { render: false });
            highest = Math.max(highest, avatar.object.position.y);
        }

        const [mx, my] = [Math.floor((a[0] + b[0]) / 2), Math.floor((a[1] + b[1]) / 2)];

        return {
            kind: bridge.kind,
            drawn: drawn.length,
            over: Math.hypot(me.x - to[0] - 0.5, me.y - to[1] - 0.5) <= 1,
            high: highest - land.deckOf(bridge, 0.5),
            cobbles: land.squares.ground(mx, my),
        };
    });

    expect(crossing.kind).toBe("road");
    expect(crossing.drawn).toBeGreaterThanOrEqual(1);
    expect(crossing.over).toBe(true);
    expect(Math.abs(crossing.high)).toBeLessThan(0.2);
    expect(crossing.cobbles).toBe(2);
});

test("out in the human lands a broken aqueduct strides across a dip: drawn over its piers, which can't be walked into, walked under through its arches", async ({ page }) => {
    await playing(page, "/?play&seed=1");
    await page.evaluate(() => window.pellagos.game.stop());

    const under = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const land = game.world.maps.town;
        // (One of its arches in the stretch kept whole, and a step either side of it)
        const aqueduct = land.aqueducts.find(({ spans }) => spans.some(Boolean));
        const n = aqueduct.spans.findIndex(Boolean);
        const [pier, next] = [aqueduct.piers[n], aqueduct.piers[n + 1]];
        const [mx, my] = [(pier.x + next.x) / 2, (pier.y + next.y) / 2];
        const [px, py] = [-Math.sin(aqueduct.turn), Math.cos(aqueduct.turn)];
        const [sx, sy] = [mx - px * 7, my - py * 7];
        const me = game.battle.actor(game.me);
        const avatar = game.avatars.get(game.me);

        Object.assign(me, { x: sx, y: sy, path: [], order: null, progress: null });
        avatar.object.position.set(sx, land.ground.heightAt(sx, sy), sy);

        for (let n = 0; n < 4; n++) {
            game.advance(0.25, { render: false });

            for (let k = 0; k < 400 && (game.chunks.update(sx, sy, { budget: 200 }) || game.chunks.busy); k++) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        game.advance(0.05);

        const drawn = [];

        session.view.scene.traverse((node) => node.name === "aqueducts" && drawn.push(node));

        // Through under its arch to the other side, passing between its piers
        const to = [Math.floor(mx + px * 7), Math.floor(my + py * 7)];
        let nearest = Infinity;

        game.battle.command(game.me, { type: "move", to });

        for (let k = 0; k < 80 && Math.hypot(me.x - to[0] - 0.5, me.y - to[1] - 0.5) > 1; k++) {
            game.advance(0.25, { render: false });
            nearest = Math.min(nearest, Math.hypot(me.x - mx, me.y - my));
        }

        return {
            drawn: drawn.length,
            pier: land.squares.blocked(Math.floor(pier.x), Math.floor(pier.y)),
            arch: land.squares.blocked(Math.floor(mx), Math.floor(my)),
            over: Math.hypot(me.x - to[0] - 0.5, me.y - to[1] - 0.5) <= 1,
            nearest,
        };
    });

    expect(under.drawn).toBeGreaterThanOrEqual(1);
    expect(under.pier).toBe(true);
    expect(under.arch).toBe(false);
    expect(under.over).toBe(true);
    expect(under.nearest).toBeLessThan(3);
});

test("the humans' castle is a hill citadel: its wards on terraces up its hill, drawn part by part, the keep's spires over everything, its walls and its moat in the way, its gate tower's and its gate's ways walked through at its outer ward's level", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");
    await page.evaluate(() => window.pellagos.game.stop());

    const seen = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const land = game.world.maps.town;
        const site = game.world.plan.sites.find(({ race, kind }) => race === "human" && kind === "castle");

        land.sites.settle(Math.floor(site.at[0] / 64), Math.floor(site.at[1] / 64));

        const set = land.sites.set.get(site.id);
        const { x, y, facing, citadel } = set;
        const place = ([u, v]) => [x + u * Math.cos(facing) + v * Math.sin(facing), y - u * Math.sin(facing) + v * Math.cos(facing)];
        const [outer] = citadel.wards;
        // (Out before its gate tower, past its glacis, along its front)
        const [sx, sy] = place([0, outer.apothem + 40]);
        const me = game.battle.actor(game.me);
        const avatar = game.avatars.get(game.me);

        Object.assign(me, { x: sx, y: sy, path: [], order: null, progress: null });
        avatar.object.position.set(sx, land.ground.heightAt(sx, sy), sy);

        for (let n = 0; n < 4; n++) {
            game.advance(0.25, { render: false });

            for (let k = 0; k < 800 && (game.chunks.update(sx, sy, { budget: 200 }) || game.chunks.busy); k++) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        game.advance(0.05);

        // (The keep's chunk drawn, its highest point its spires')
        const keep = set.pieces.find(({ part }) => part === "keep");
        const drawn = [...game.chunks.drawn.values()].find(({ cx, cy }) => cx === Math.floor(keep.x / 64) && cy === Math.floor(keep.y / 64));
        let top = -Infinity;

        drawn?.buildings?.updateMatrixWorld(true);
        drawn?.buildings?.traverse((node) => {
            if (node.isMesh) {
                node.geometry.computeBoundingBox();
                top = Math.max(top, node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld).max.y);
            }
        });

        const tower = set.pieces.find(({ part }) => part === "gatetower");
        const [gx, gy] = place([0, outer.apothem - 1]);
        // (Its moat, round at its back)
        const [mx, my] = place([0, -outer.apothem - 7]);
        const moat = land.chunkAt(Math.floor(mx), Math.floor(my));

        return {
            built: Boolean(drawn?.buildings),
            top: top - (set.level + citadel.wards.at(-1).rise + keep.high),
            inner: land.ground.heightAt(keep.x, keep.y) - set.pads.at(-1).level,
            outer: land.ground.heightAt(...place([0, outer.apothem - 6])) - set.pads[0].level,
            // (Its gate tower either side of the way through it)
            tower: [-4, 4].every((u) => land.squares.blocked(Math.floor(tower.x + u * Math.cos(facing)), Math.floor(tower.y - u * Math.sin(facing)))) && !land.squares.blocked(Math.floor(tower.x), Math.floor(tower.y)),
            // (The way through its gate, the outer ward's level, as over its bridge before it)
            gate: !land.squares.blocked(Math.floor(gx), Math.floor(gy)) && Math.abs(land.heightAt(gx, gy) - set.pads[0].level) < 0.05,
            bridge: !land.squares.blocked(...place([0, outer.apothem + 10]).map(Math.floor)) && Math.abs(land.heightAt(...place([0, outer.apothem + 10])) - set.pads[0].level) < 0.05,
            moat: Boolean(moat.water[(Math.floor(my) - moat.y0) * 64 + (Math.floor(mx) - moat.x0)]) && land.squares.blocked(Math.floor(mx), Math.floor(my)),
            before: land.squares.blocked(Math.floor(sx), Math.floor(sy)),
        };
    });

    expect(seen.built).toBe(true);
    expect(seen.top).toBeGreaterThan(20);
    expect(Math.abs(seen.inner)).toBeLessThan(0.05);
    expect(Math.abs(seen.outer)).toBeLessThan(0.05);
    expect(seen.tower).toBe(true);
    expect(seen.gate).toBe(true);
    expect(seen.bridge).toBe(true);
    expect(seen.moat).toBe(true);
    expect(seen.before).toBe(false);
});

test("debug mode draws the navigation meshes round the player, baked in a worker", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const shown = await page.evaluate(async () => {
        const { game } = window.pellagos;

        game.showNavigation(true);
        await game.navigationLoading;

        const view = game.navigationView;

        for (let k = 0; k < 600 && view.stats.tiles < 9; k++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        return { ...view.stats, worker: Boolean(view.baker.worker), visible: view.object.visible };
    });

    expect(shown.worker).toBe(true);
    expect(shown.visible).toBe(true);
    expect(shown.tiles).toBeGreaterThan(8);
    expect(shown.triangles).toBeGreaterThan(100);
});

test("once a tap lets it make sound, the music plays on recordings of real instruments", async ({ page }) => {
    const recordings = [];

    page.on("response", (response) => /\/music\/.+\.mp3$/.test(response.url()) && recordings.push(response.status()));
    await playing(page, "/?play&seed=1");
    await page.mouse.click(20, 400);

    // Every recording downloaded and decoded, and the score under way
    await page.waitForFunction(() => {
        const { sound } = window.pellagos.session;

        return sound.recordings.size === 0 && sound.instruments.size > 40 && sound.music.start !== null;
    }, null, { timeout: 30000 });
    expect(recordings.length).toBeGreaterThan(40);
    expect(recordings.every((status) => status === 200)).toBe(true);

    // Stopped by the browser (as a call or an alarm would), it starts again by itself, and the
    // music carries on; closed, it's made anew and the music carries on from where it was
    const going = () => page.evaluate(() => {
        const { sound } = window.pellagos.session;

        return { state: sound.context.state, index: sound.music.index };
    });
    const musicMoves = async () => {
        const { index } = await page.evaluate(() => ({ index: window.pellagos.session.sound.music.index }));

        await page.waitForFunction((index) => window.pellagos.session.sound.music.index > index, index, { timeout: 15000 });
    };

    await page.evaluate(() => window.pellagos.session.sound.context.suspend());
    await page.waitForFunction(() => window.pellagos.session.sound.context.state === "running", null, { timeout: 10000 });
    await musicMoves();

    const before = await page.evaluate(() => {
        const { sound } = window.pellagos.session;

        window.oldContext = sound.context;
        sound.context.close();

        return sound.music.index;
    });

    await page.waitForFunction(() => {
        const { sound } = window.pellagos.session;

        return sound.context !== window.oldContext && sound.context.state === "running";
    }, null, { timeout: 10000 });
    await musicMoves();
    expect((await going()).index).toBeGreaterThanOrEqual(before);
});

test("tapping the ground walks the player there; double-clicking it runs there, using stamina, shown by an orange bar until it's back", async ({ page }) => {
    // (Clicked and tapped while the game plays on, every frame drawn between: about two minutes
    // on a slow machine without a GPU, as CI's can be)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const bar = page.locator("#playerplate .bar.stamina");
    const spot = await spotNorth(page, 4);

    await expect(bar).toBeHidden();

    // (The orders to go somewhere as the clicks give them: input reaching the page seconds apart
    // on a slow machine, a walk or a run can be over before the player's order is looked at)
    await page.evaluate(() => {
        const { host } = window.pellagos.game;
        const command = host.command;

        window.moves = [];
        window.unwatch = () => {
            host.command = command;
        };
        host.command = function (id, order) {
            if (order.type === "move") {
                window.moves.push(order);
            }

            return command.call(this, id, order);
        };
    });

    const moves = () => page.evaluate(() => window.moves.map((move) => move.run));

    // A click walks, and a shift-click (not so soon as to be a double click) runs: stopped first,
    // and clicked 4 m ahead of where they stopped (walking on, they could be under the pointer by
    // then, and a click on them as they walk stops them)
    await page.mouse.click(spot.x, spot.y);
    expect(await moves()).toEqual([false]);
    await page.evaluate(() => window.pellagos.game.battle.command("player", { type: "stop" }));
    await page.waitForTimeout(500);

    const ahead = await spotNorth(page, 4);

    await page.keyboard.down("Shift");
    await page.mouse.click(ahead.x, ahead.y);
    await page.keyboard.up("Shift");
    expect(await moves()).toEqual([false, true]);
    await page.evaluate(() => window.pellagos.game.battle.command("player", { type: "stop" }));
    await page.waitForTimeout(500);

    // A spot a few metres north of where the player is now, double-clicked (the first spot's
    // behind them or under them by now, how far depending on how fast the machine is)
    await doubleTap(page, await spotNorth(page, 5));
    await expect.poll(moves).toEqual([false, true, false, true]);

    const ran = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        let fastest = 0;

        window.unwatch();
        game.stop();

        for (let k = 0; k < 20; k++) {
            game.advance(0.05, { render: false });
            fastest = Math.max(fastest, player.pace);
        }

        return { fastest, walk: player.speed, stamina: player.stamina, maxStamina: player.maxStamina };
    });

    expect(ran.fastest).toBeGreaterThan(ran.walk * 2);
    expect(ran.stamina).toBeLessThan(ran.maxStamina);
    await expect(bar).toBeVisible();
    await expect(bar).toHaveText(`${Math.floor(ran.stamina)} / ${ran.maxStamina}`);
    expect(await bar.locator(".fill").evaluate((fill) => getComputedStyle(fill).backgroundImage)).toContain("rgb(236, 138, 28)");

    // Rested, it's full again, and the bar goes
    await page.evaluate(() => window.pellagos.game.advance(20));
    await expect(bar).toBeHidden();

    // A spot a few metres north of the player tapped: they walk there
    const walked = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const start = [player.x, player.y];
        const avatar = game.avatars.get("player");
        const spot = session.view.toScreen(avatar.object.position.clone().setZ(avatar.object.position.z - 3));

        game.stop();
        game.tap(spot.x, spot.y, { time: performance.now() + 9000 });
        game.advance(4);

        return { start, end: [player.x, player.y] };
    });

    expect(walked.end[1]).toBeLessThan(walked.start[1] - 2);
});

test("tapping an enemy rings it as the player's target, until they're told to walk away (with Auto target lock off; on, still ringed)", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const target = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const ring = game.effects.targetRing;
        const square = [player.square[0] + 3, player.square[1] - 3];

        game.stop();
        game.autoLock = false;

        // The orc, standing a few squares from the player
        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        game.advance(0.1);

        const before = ring.visible;
        const at = session.view.toScreen(game.avatars.get("orc").point(0.5));

        game.tap(at.x, at.y);
        game.advance(0.5);

        const orcAt = game.avatars.get("orc").object.position;
        const ringed = { visible: ring.visible, off: Math.hypot(ring.position.x - orcAt.x, ring.position.z - orcAt.z), plate: document.querySelector(".floater.targeted")?.dataset.id ?? null };
        const away = session.view.toScreen(game.avatars.get("player").object.position.clone().setZ(orcAt.z + 6));

        game.tap(away.x, away.y, { time: performance.now() + 1000 });
        game.advance(0.2);

        const after = { visible: ring.visible, plate: document.querySelector(".floater.targeted")?.dataset.id ?? null };

        // With Auto target lock on, tapped and walked away from again: locked on, still ringed
        const again = session.view.toScreen(game.avatars.get("orc").point(0.5));

        game.autoLock = true;
        game.tap(again.x, again.y, { time: performance.now() + 2000 });
        game.advance(0.5);

        const back = session.view.toScreen(game.avatars.get("player").object.position.clone().setZ(orcAt.z + 6));

        game.tap(back.x, back.y, { time: performance.now() + 3000 });
        game.advance(0.2);

        return { before, ringed, after, locked: { visible: ring.visible, plate: document.querySelector(".floater.targeted")?.dataset.id ?? null, walking: player.order?.type ?? null, lock: player.lock } };
    });

    expect(target.before).toBe(false);
    expect(target.ringed).toEqual({ visible: true, off: expect.any(Number), plate: "orc" });
    expect(target.ringed.off).toBeLessThan(0.01);
    expect(target.after).toEqual({ visible: false, plate: null });
    expect(target.locked).toEqual({ visible: true, plate: "orc", walking: "move", lock: "orc" });
});

test("tapping an enemy sets the player on them where they stand; tapped twice, they run up to them; tapped again on the way, or the player tapped, they stop, still set on them; Attack at the top of an enemy's wheel walks up to them", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const taps = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;
        const square = [0, 1, -1, 2, -2].map((dx) => [px + dx, py - 8]).find(([x, y]) => !squares.blocked(x, y));
        const at = (id) => session.view.toScreen(game.avatars.get(id).point(0.5));
        const now = performance.now();
        const state = () => ({ order: player.order && { ...player.order }, square: [...player.square], walking: player.path.length > 0 });

        // The orc 8 squares off, stunned where it stands
        game.stop();
        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], order: null, attack: null, target: null, stunnedUntil: battle.time + 600000 });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        game.advance(0.1);

        // Tapped: set on it where the player stands
        let spot = at("orc");

        game.tap(spot.x, spot.y, { time: now });
        game.advance(1);

        const tapped = state();

        // Tapped twice in quick succession: running up to it
        spot = at("orc");
        game.tap(spot.x, spot.y, { time: now + 5000 });
        game.tap(spot.x, spot.y, { time: now + 5150 });
        game.advance(0.6);

        const doubled = { ...state(), running: player.running };

        // Tapped again on the way: stopped there, still set on it
        spot = at("orc");
        game.tap(spot.x, spot.y, { time: now + 10000 });
        game.advance(0.5);

        const stopped = state();

        // Attack, at the top of an enemy's wheel: walking up to it; the player tapped, stopped
        const top = game.wheels.enemy[0].n;

        game.act(top, "orc");
        game.advance(0.4);

        const attacking = state();

        spot = at("player");
        game.tap(spot.x, spot.y, { time: now + 15000 });
        game.advance(0.5);

        return { start: [px, py], tapped, doubled, stopped, top, attacking, halted: state() };
    });

    expect(taps.tapped.order).toEqual({ type: "engage", target: "orc", run: false, stand: true });
    expect(taps.tapped.square).toEqual(taps.start);
    expect(taps.doubled.order).toMatchObject({ type: "engage", target: "orc", run: true });
    expect(taps.doubled.order.stand).toBeUndefined();
    expect(taps.doubled.walking).toBe(true);
    expect(taps.doubled.running).toBe(true);
    expect(taps.stopped.order).toEqual({ type: "engage", target: "orc", run: false, stand: true });
    expect(taps.stopped.walking).toBe(false);
    expect(taps.top).toBe("attack");
    expect(taps.attacking.order).toEqual({ type: "engage", target: "orc", run: false });
    expect(taps.attacking.walking).toBe(true);
    expect(taps.halted.order).toEqual({ type: "engage", target: "orc", run: false, stand: true });
    expect(taps.halted.walking).toBe(false);
});

test("a bar stays on the head it's over as the camera turns, however fast: put where the camera that draws the frame sees it, not a frame behind", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // The orc a couple of steps from the player; the camera swung round by a big step each frame
    // (played on without drawing, so the camera's only ever placed, never drawn from)
    const off = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const player = battle.actor(game.me);
        const orc = battle.actor("orc");
        const square = [player.square[0] + 2, player.square[1] + 1];
        const offs = [];

        game.stop();
        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null, target: null });
        game.avatars.get("orc").place(orc.x, orc.y, 0);
        game.previous.set("orc", { x: orc.x, y: orc.y });

        for (let k = 0; k < 12; k++) {
            game.cameraFollow.yaw += 0.25;
            game.cameraFollow.turning = 0;
            game.advance(1 / 60);

            const plate = game.hud.tracked.get("orc");
            const [, x, y] = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(plate.style.transform);

            // (Where this frame's camera sees its head)
            session.view.camera.updateMatrixWorld();

            const head = session.view.toScreen(game.avatars.get("orc").point(1.08));

            if (head && !plate.hidden) {
                offs.push(Math.hypot(Number(x) - head.x, Number(y) - head.y));
            }
        }

        return offs;
    });

    expect(off.length).toBeGreaterThan(4);
    expect(Math.max(...off)).toBeLessThan(1);
});

test("the bars over others are full size near the player, smaller and fainter evenly the farther off, gone out of sight, and grow again as one comes near; the nearer over the farther and all under the buttons; a creature's level by its name", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Four slimes in a line the way the camera looks, 6, 24, 48 and 66 m ahead of the player (by
    // day: full size within 12 m, gone at 60 m)
    await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const me = game.battle.actor(game.me);
        const looking = session.view.camera.getWorldDirection(session.view.camera.position.clone());
        const length = Math.hypot(looking.x, looking.z);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        [6, 24, 48, 66].forEach((ahead, k) => {
            const [x, y] = [me.x + (looking.x / length) * ahead, me.y + (looking.z / length) * ahead];

            game.battle.add({ id: `slime${k}`, kind: "beast", name: "Green slime", weapon: "slime", team: "wild", square: [Math.floor(x), Math.floor(y)], ai: null, hp: 30, wild: { creature: "slime", tier: 1, temper: "defensive", guard: 0, roam: 0, leash: 12, pack: `slimes${k}`, leader: null, menace: false } });
            Object.assign(game.battle.actor(`slime${k}`), { x, y });
            game.enlisting.push(`slime${k}`);
        });
    });
    expect(await playUntil(page, () => [0, 1, 2, 3].every((k) => window.pellagos.game.avatars.has(`slime${k}`)))).toBe(true);

    // (How each bar's drawn, and how far its slime is from the player)
    await page.evaluate(() => {
        window.platesNow = () => {
            const { game } = window.pellagos;
            const own = game.avatars.get(game.me).object.position;

            return [0, 1, 2, 3].map((k) => {
                const plate = document.querySelector(`.floater[data-id="slime${k}"]`);
                const at = game.avatars.get(`slime${k}`).object.position;
                const { width, height } = plate.getBoundingClientRect();
                const name = plate.querySelector(".name").getBoundingClientRect();
                const level = plate.querySelector(".level");

                return {
                    off: Math.hypot(at.x - own.x, at.z - own.z),
                    hidden: plate.hidden,
                    width,
                    height,
                    faint: Number(getComputedStyle(plate).opacity),
                    layer: Number(plate.style.zIndex),
                    level: getComputedStyle(level).display,
                    levelLine: Math.abs(level.getBoundingClientRect().top - name.top) < name.height / 2,
                };
            });
        };
    });

    const plates = await page.evaluate(() => {
        window.pellagos.game.advance(0.05);

        return { light: window.pellagos.game.battle.light, each: window.platesNow(), stacking: getComputedStyle(document.querySelector("#floaters")).zIndex };
    });
    const [near, middle, far, gone] = plates.each;

    // (By day: seen as far as ever)
    expect(plates.light).toBeNull();

    // The nearest full size and solid; each farther one smaller and fainter, evenly with the
    // distance, to none at the edge of sight; and drawn under the nearer
    expect(near.off).toBeLessThan(12);
    expect(near.width).toBeGreaterThan(110 * 0.6);
    expect(near.faint).toBe(1);
    expect(middle.width / near.width).toBeCloseTo((60 - middle.off) / 48, 1);
    expect(middle.faint).toBeCloseTo((60 - middle.off) / 48, 1);
    expect(far.width / near.width).toBeCloseTo((60 - far.off) / 48, 1);
    expect(far.faint).toBeCloseTo((60 - far.off) / 48, 1);
    expect(far.width).toBeLessThan(middle.width * 0.5);
    expect(gone.off).toBeGreaterThan(60);
    expect(gone.hidden).toBe(true);
    expect(near.layer).toBeGreaterThan(middle.layer);
    expect(middle.layer).toBeGreaterThan(far.layer);

    // (All in their own stacking, under the buttons; "Lv 1" on the name's line)
    expect(plates.stacking).toBe("0");
    expect(plates.each.slice(0, 3).map(({ level, levelLine }) => [level, levelLine])).toEqual([["inline", true], ["inline", true], ["inline", true]]);

    // The farthest seen comes near: its bar grows as it comes, to full size
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const [near, far] = [game.battle.actor("slime0"), game.battle.actor("slime2")];

        Object.assign(far, { square: [near.square[0] + 1, near.square[1]], x: near.x + 1, y: near.y });
    });

    // (Frame by frame, as its figure walks up)
    const growing = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const seen = [];

        for (let k = 0; k < 90; k++) {
            game.advance(1 / 30, { render: false, wait: true });
            await new Promise((resolve) => setTimeout(resolve, 0));

            const [near, , far] = window.platesNow();

            seen.push({ off: far.off, share: far.width / near.width });

            if (far.off < 12 && far.share > 0.99) {
                break;
            }
        }

        return seen;
    });

    expect(growing.at(-1).off).toBeLessThan(12);
    expect(growing.at(-1).share).toBeCloseTo(1, 1);
    expect(growing.some(({ share }) => share > 0.4 && share < 0.9), "between sizes on the way").toBe(true);
    expect(growing.every(({ share, off }, k) => !k || (share >= growing[k - 1].share - 0.01 && off <= growing[k - 1].off + 0.01))).toBe(true);
    expect(growing.filter(({ off }) => off > 12).every(({ share, off }) => Math.abs(share - (60 - off) / 48) < 0.05), "as big as its distance has it each frame").toBe(true);
});

test("tapping the tavern's door lights its edge green, and the player walks in: well inside, facing into the room, the camera behind them under the ceiling; up the stairs (where a courtesan beckons), down, and out, facing out; each time a tap round them is a step, not back through", async ({ page }) => {
    // (In and up and down and out, each map drawn as it's come to: a minute or more without a GPU)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    // Tap the door or stairs (a link's end on the map shown), and play on until through
    const through = (map, kind, seconds) => page.evaluate(({ map, kind, seconds }) => {
        const { game, session } = window.pellagos;
        const target = game.doors.targets.find((each) => each.map === map && each.link.kind === kind);
        const spot = session.view.toScreen(target.box.getCenter(target.box.min.clone()));

        game.tap(spot.x, spot.y);
        game.advance(0.3);

        const tapped = { order: game.battle.actor("player").order?.type ?? null, glowing: target.glow.visible };

        game.advance(seconds);

        const player = game.battle.actor("player");

        return { ...tapped, map: player.map, shown: game.mapId, square: player.square, facing: player.facing, minimap: game.minimap.map.id, heard: session.sound.place };
    }, { map, kind, seconds });

    // Just come through: taps on the ground round the player (either side, and behind them)
    // walk them there, and don't take them back through. (Looking down more steeply than the
    // camera starts, so no one sitting at a table nearby is in the way of the ground tapped:
    // tapping them talks to them)
    const tapsRound = () => page.evaluate(() => {
        const { game, session } = window.pellagos;
        const avatar = game.avatars.get("player");
        const orders = [];

        game.cameraFollow.pitch = 45;
        game.advance(0.1);

        for (const [side, back] of [[1, 0], [-1, 0], [0, -1.2], [1, -1]]) {
            const facing = avatar.facing;
            const at = avatar.object.position.clone().add({ x: side * Math.cos(facing) + back * Math.sin(facing), y: 0, z: -side * Math.sin(facing) + back * Math.cos(facing) });
            const spot = session.view.toScreen(at);

            game.tap(spot.x, spot.y, { time: performance.now() + 5000 * (orders.length + 1) });
            orders.push(game.battle.actor("player").order?.type ?? null);
            game.battle.command("player", { type: "stop" });
        }

        return orders;
    });

    // Outside the door, the orc out of the way
    const outside = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.command("player", { type: "move", to: game.world.tavern.outside });
        game.advance(25);

        const [doorX, doorY] = game.world.maps.taproom.marks.D[0];

        return { square: game.battle.actor("player").square, outside: game.world.tavern.outside, out: game.world.tavern.facing, inside: [doorX, doorY - 4], top: game.world.maps.upstairs.marks[">"][0] };
    });

    expect(outside.square).toEqual(outside.outside);

    // At midnight the lantern by its door lights what's round it (world/lights.js: the view's
    // lamps), drawn with the town's torches and lanterns; by day, out
    expect(await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const war = game.host.war;
        const [turn, clock] = [war.turn, war.clock];
        const lit = () => session.view.lamps.some(({ light }) => light.intensity > 0);

        war.turn = 41;
        war.clock = 30000;
        game.advance(0.05, { render: false });

        const night = { lit: lit(), drawn: Boolean(game.town.object.getObjectByName("lights")) };

        war.turn = turn;
        war.clock = clock;
        game.advance(0.05, { render: false });

        return { night, day: lit() };
    })).toEqual({ night: { lit: true, drawn: true }, day: false });

    // (The world's folk dressed before going in: the townsfolk come out round the player)
    const outdoors = await page.evaluate(() => window.pellagos.game.battle.actors.filter(({ kind, map, id }) => kind === "folk" && map !== "taproom" && map !== "upstairs" && window.pellagos.game.avatars.has(id)).map(({ id }) => id));
    const inside = await through("town", "door", 5);

    expect(inside).toEqual({ order: "enter", glowing: true, map: "taproom", shown: "taproom", square: outside.inside, facing: Math.PI, minimap: "taproom", heard: "taproom" });

    // Looking across the room from behind them, a little down, from under the ceiling, clear of
    // its beams; inside the walls, the door behind it
    expect(await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const view = session.view;
        const { origin, width, height } = game.interiors.get("taproom").map;
        const at = view.camera.position;
        const looking = view.camera.getWorldDirection(at.clone());
        const player = game.avatars.get("player").object.position;

        return {
            under: at.y > 2 && at.y <= 2.4 + 1e-6,
            inside: at.x > origin[0] && at.x < origin[0] + width && at.z > player.z + 3 && at.z < origin[1] + height,
            across: looking.z < -0.9 && looking.y < -0.3 && looking.y > -0.45,
        };
    })).toEqual({ under: true, inside: true, across: true });

    // Lit from all round by a warm room's light, not the sky's (out of doors, the sky's at the time
    // of day); going out and back in only changes which is read (the two the same size), so no
    // shader is made afresh
    expect(await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const view = session.view;
        const warm = view.scene.environment === view.environments.indoors.texture;
        const programs = view.renderer.info.programs.length;

        view.setIndoors(null);
        view.render();

        const sky = view.scene.environment === view.skyLight.target.texture && view.far.scene.environment === view.skyLight.target.texture;

        view.setIndoors(game.interiors.get("taproom"));
        view.render();

        return { warm, sky, made: view.renderer.info.programs.length - programs };
    })).toEqual({ warm: true, sky: true, made: 0 });

    // Lit by the sun through the windows and by the room's flames, the two nearest the player the
    // view's lamps; and dragged to look up, the camera stays inside, under the ceiling, looking up
    // at it (its beams drawn over the player)
    expect(await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const view = session.view;
        const taproom = game.interiors.get("taproom");
        const { origin, width, height } = taproom.map;

        game.cameraFollow.grab();
        game.cameraFollow.turn(0, -90, view.lowestPitch());
        game.advance(1.5);

        const at = view.camera.position;
        const looking = view.camera.getWorldDirection(at.clone());
        const ceiling = [];

        taproom.object.traverse((node) => node.isMesh && node.material.name === "atlas-inside-ceiling" && ceiling.push(node));
        game.cameraFollow.release();

        return {
            sun: view.sun.intensity > 0 && view.sunDirection.angleTo(new view.sunDirection.constructor(...taproom.daylight)) < 1e-6,
            flames: taproom.lights.length >= 8 && view.room.lamps.length === 2,
            lowest: view.lowestPitch(),
            under: at.y < 3 && at.x > origin[0] && at.x < origin[0] + width && at.z > origin[1] && at.z < origin[1] + height,
            up: looking.y > 0.3,
            ceiling: ceiling.length,
        };
    })).toEqual({ sun: true, flames: true, lowest: -40, under: true, up: true, ceiling: 1 });
    expect(await tapsRound()).toEqual(["move", "move", "move", "move"]);
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;

        return { town: game.town.object.visible, taproom: game.interiors.get("taproom").object.visible, upstairs: game.interiors.get("upstairs").object.visible };
    })).toEqual({ town: false, taproom: true, upstairs: false });

    // Gone in, its own folk dressed, the taproom's and upstairs', and no one else: not another
    // building's folk, nor any more of the townsfolk out in the streets (all the world's folk once
    // went in with them: 41 dressed in eight seconds, and Safari closed the page)
    const dressed = await page.evaluate(() => {
        const { game } = window.pellagos;
        const visit = game.tavernFolk;

        for (let k = 0; k < 300 && (visit.queue.length || visit.steps); k++) {
            game.advance(0.1, { render: false });
        }

        const folk = game.battle.actors.filter((actor) => actor.kind === "folk");
        const ours = ({ map }) => map === "taproom" || map === "upstairs";

        return { done: !visit.queue.length && !visit.steps, ours: folk.filter((one) => ours(one) && game.avatars.has(one.id)).map(({ map }) => map).sort(), others: folk.filter((one) => !ours(one) && game.avatars.has(one.id)).map(({ id }) => id), undressed: folk.filter((one) => !ours(one) && !game.avatars.has(one.id)).length };
    });

    expect(dressed.done).toBe(true);
    expect(dressed.ours).toEqual([...Array(7).fill("taproom"), ...Array(5).fill("upstairs")]);
    expect(dressed.others.filter((id) => !outdoors.includes(id))).toEqual([]);
    expect(dressed.undressed).toBeGreaterThan(10);

    // The folk: seven in the taproom, seen, without name plates; the patrons rest (raising their
    // tankards, drinking, laughing); tapping one doesn't set the player on them
    const folk = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const here = game.battle.actors.filter((actor) => actor.neutral && actor.map === "taproom");
        const acted = new Set();

        for (let k = 0; k < 40; k++) {
            game.advance(0.25, { render: false });

            for (const actor of here) {
                const name = game.avatars.get(actor.id).actions.attack?.name;

                if (name) {
                    acted.add(name);
                }
            }
        }

        const drinker = game.avatars.get("drinker");
        const spot = session.view.toScreen(drinker.point(0.5));

        game.tap(spot.x, spot.y, { time: performance.now() + 5000 });
        game.advance(0.2);

        return {
            ids: here.map(({ id }) => id),
            shown: here.every(({ id }) => game.avatars.get(id).object.visible),
            plates: document.querySelectorAll(".floater").length,
            acted: [...acted].sort(),
            order: game.battle.actor("player").order?.type ?? null,
            madam: game.avatars.get("madam").object.visible,
        };
    });

    expect(folk).toMatchObject({ ids: ["barkeep", "wench", "wench2", "drinker", "alewife", "farmer", "greybeard"], shown: true, plates: 1, madam: false });
    expect(folk.acted).toContain("rest:patron");
    expect(folk.order).not.toBe("engage");

    // Near the stairs, then up them, and down again
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.battle.command("player", { type: "move", to: [3, 3] });
        game.advance(8);

        // (The footsteps heard from here: on what, and how long after they're played)
        const step = game.sound.step.bind(game.sound);

        game.heardSteps = [];
        game.sound.step = (surface, at, options = {}) => {
            game.heardSteps.push({ surface, delay: options.delay ?? 0 });

            return step(surface, at, options);
        };
    });

    const up = await through("taproom", "stairs", 6);

    expect(up).toMatchObject({ order: "enter", glowing: true, map: "upstairs", shown: "upstairs", square: [6, 4], facing: 0, minimap: "upstairs", heard: "upstairs" });

    // Up them, a few treads heard on the boards one after another
    const treads = await page.evaluate(() => window.pellagos.game.heardSteps.filter(({ delay }) => delay > 0));

    expect(treads.map(({ delay, surface }) => [Math.round(delay * 100), surface])).toEqual([
        [26, "wood"],
        [52, "wood"],
        [78, "wood"],
    ]);
    expect(await tapsRound()).toEqual(["move", "move", "move", "move"]);
    expect(await page.evaluate(() => window.pellagos.game.avatars.get("madam").object.visible)).toBe(true);

    // Along the hallway to the first bedroom's door: the courtesan in it (and the one across the
    // way) turns and beckons the player in, and the screen says so; she's in see-through lace.
    // Then back to the top of the stairs
    const beckoned = await page.evaluate(() => {
        const { game } = window.pellagos;
        const courtesan = game.avatars.get("courtesan");
        let seen = null;

        game.battle.command("player", { type: "move", to: [10, 7] });

        // (Drawn only once they've beckoned: it's what they do that's looked for, not the drawing)
        for (let k = 0; k < 60 && !seen; k++) {
            game.advance(0.25, { render: false });

            if (courtesan.actions.attack?.name === "beckon") {
                game.advance(0.1);
                seen = document.body.textContent.match(/\w+ beckons you over/)?.[0] ?? "";
            }
        }

        const lace = courtesan.character.garments.filter((mesh) => mesh.material.transparent).map(({ name }) => name).sort();

        game.battle.command("player", { type: "move", to: game.world.maps.upstairs.marks[">"][0] });
        game.advance(10);

        return { seen, names: ["courtesan", "courtesan3"].map((id) => game.world.folk.find((one) => one.id === id).name.split(" ")[0]), lace, shown: courtesan.object.visible, back: game.battle.actor("player").square };
    });

    expect(beckoned.shown).toBe(true);
    expect(beckoned.names.map((name) => `${name} beckons you over`)).toContain(beckoned.seen);
    expect(beckoned.lace).toEqual(["choker", "laceBraBlack", "laceBriefsBlack", "stockingsBlack", "suspendersBlack"]);
    expect(beckoned.back).toEqual(outside.top);

    // (Standing at their top, straight down)
    const down = await through("upstairs", "stairs", 3);

    expect(down).toMatchObject({ map: "taproom", shown: "taproom", square: [1, 4], facing: 0 });
    expect(await tapsRound()).toEqual(["move", "move", "move", "move"]);

    // And out (from just inside it, so no one's in the way to tap instead), onto the square
    // outside the door
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.battle.command("player", { type: "move", to: [7, 8] });
        game.advance(10);
    });

    const out = await through("taproom", "door", 6);

    expect(out).toMatchObject({ order: "enter", map: "town", shown: "town", square: outside.outside, facing: outside.out, minimap: "town", heard: "town" });
    expect(await tapsRound()).toEqual(["move", "move", "move", "move"]);
});

test("every tavern can be gone into: got ready as the player comes near, its folk dressed only once they go in (told to go through its door), not at its door; its own room and folk inside; its folk let go of a little way off, its floors further, and it all far off; walked straight into, its folk dressed while the screen's dark", async ({ page }) => {
    // (Seed 2's town has a second tavern, the Stag's Head, an inn)
    await playing(page, "/?play&seed=2");

    // Put the player (or anyone) on a square, at once
    const helpers = () => {
        window.put = (id, [x, y]) => {
            const { game } = window.pellagos;
            const actor = game.battle.actor(id);

            Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
            game.avatars.get(id).place(x + 0.5, y + 0.5, actor.facing);
            game.previous.set(id, { x: actor.x, y: actor.y });
        };
    };

    await page.evaluate(helpers);

    // Near its door, it's got ready a piece at a time: its floors, and none of its folk dressed yet
    const started = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const building = [...game.world.interiors.buildings.values()].find((each) => each.entrance && each.kind === "tavern");
        const before = game.visits.has(building.key);

        // (Looked over at the next frame)
        window.put("player", building.door.ends[0].arrive);
        game.host.lookAt = 0;
        game.advance(0.1);

        const visit = game.visits.get(building.key);

        window.visit = visit;

        return { key: building.key, name: building.name, before, started: { maps: visit.maps.length, folk: visit.folk.length, left: visit.queue.length } };
    });

    // (A few seconds' building: its floors built a step at a time, a few milliseconds a frame)
    expect(await playUntil(page, () => !window.visit.queue.length && !window.visit.steps)).toBe(true);

    const atDoor = await page.evaluate((started) => {
        const { game } = window.pellagos;
        const { visit } = window;

        // (Stood at its door a while longer: still none)
        game.advance(1);

        return { ...started, ready: { maps: visit.maps.length, folk: visit.folk.length, left: visit.queue.length }, drawn: [...game.avatars.keys()].filter((id) => id.startsWith(`${started.key}/`)).length, hidden: visit.maps.every((id) => !game.interiors.get(id).object.visible) };
    }, started);

    expect(atDoor.name).toBe("The Stag's Head");
    expect(atDoor.before).toBe(false);
    expect(atDoor.ready).toEqual({ maps: 2, folk: 0, left: 0 });
    expect(atDoor.drawn).toBe(0);
    expect(atDoor.hidden).toBe(true);

    // Told to go through its door, from across the street: its folk dressed as the player makes
    // for it, before they're there
    const making = await page.evaluate((key) => {
        const { game } = window.pellagos;
        const building = game.world.interiors.buildings.get(key);
        const { x, z } = building.entrance.door;
        const [ax, ay] = building.door.ends[0].arrive;
        const [dx, dy] = [ax + 0.5 - x, ay + 0.5 - z];
        const length = Math.hypot(dx, dy) || 1;

        window.put("player", [Math.floor(x + (dx / length) * 12), Math.floor(z + (dy / length) * 12)]);
        game.battle.command("player", { type: "enter", link: `${key}/door` });

        return { welcomed: window.visit.welcomed, map: game.battle.actor("player").map };
    }, atDoor.key);

    expect(making).toEqual({ welcomed: false, map: "town" });
    expect(await playUntil(page, () => window.visit.folk.length >= 6 || window.pellagos.game.battle.actor("player").map !== "town")).toBe(true);

    const near = await page.evaluate((started) => {
        const { game } = window.pellagos;
        const { visit } = window;
        const player = game.battle.actor("player");

        return { ...started, map: player.map, ready: { folk: visit.folk.length } };
    }, atDoor);

    expect(near.map).toBe("town");
    expect(near.ready.folk).toBeGreaterThanOrEqual(6);

    // (Stopped at its door, the rest of them dressed: once wanted, they're kept till the player's
    // well away)
    await page.evaluate((key) => window.put("player", window.pellagos.game.world.interiors.buildings.get(key).door.ends[0].arrive), near.key);
    expect(await playUntil(page, () => !window.visit.queue.length && !window.visit.steps)).toBe(true);

    // Stepped away from its door, though it's still got ready: a little way off, its folk let go
    // of (bodies, skins and all), its floors kept; further off, its floors let go of too; back at
    // its door, its floors built again, its folk not dressed till they go in
    const away = await page.evaluate((key) => {
        const { game } = window.pellagos;
        const building = game.world.interiors.buildings.get(key);
        const { x, z } = building.entrance.door;
        const [ax, ay] = building.door.ends[0].arrive;
        const [dx, dy] = [ax + 0.5 - x, ay + 0.5 - z];
        const length = Math.hypot(dx, dy) || 1;
        // (So many metres out from it, the way its door faces)
        const out = (metres) => {
            window.put("player", [Math.floor(x + (dx / length) * metres), Math.floor(z + (dy / length) * metres)]);
            game.advance(0.2);

            return { visited: game.visits.has(key), floors: building.maps.filter((id) => game.interiors.has(id)).length, dressed: window.visit.folk.length, drawn: [...game.avatars.keys()].filter((id) => id.startsWith(`${key}/`)).length };
        };

        return { off: out(14), far: out(50) };
    }, near.key);

    expect(away).toEqual({ off: { visited: true, floors: 2, dressed: 0, drawn: 0 }, far: { visited: true, floors: 0, dressed: 0, drawn: 0 } });
    await page.evaluate((key) => window.put("player", window.pellagos.game.world.interiors.buildings.get(key).door.ends[0].arrive), near.key);
    expect(await playUntil(page, () => !window.visit.queue.length && !window.visit.steps && window.visit.maps.length === 2)).toBe(true);
    expect(await page.evaluate((key) => ({ floors: window.pellagos.game.world.interiors.buildings.get(key).maps.filter((id) => window.pellagos.game.interiors.has(id)).length, folk: window.visit.folk.length }), near.key)).toEqual({ floors: 2, folk: 0 });

    // Through its door: its own taproom, heard and mapped as one, with its own folk
    const inside = await page.evaluate((key) => {
        const { game, session } = window.pellagos;
        const target = game.doors.targets.find((each) => each.map === "town" && each.link.id === `${key}/door`);
        const spot = session.view.toScreen(target.box.getCenter(target.box.min.clone()));

        game.tap(spot.x, spot.y);
        game.advance(4);

        const player = game.battle.actor("player");
        const folk = game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player");

        return { map: player.map, shown: game.mapId, minimap: game.minimap.map.id, heard: session.sound.place, visible: game.interiors.get(player.map).object.visible, town: game.town.object.visible, folk: folk.map(({ id }) => id), names: folk.map(({ name }) => name), wenches: game.world.folk.map(({ name }) => name) };
    }, near.key);

    expect(inside).toMatchObject({ map: `${near.key}/taproom`, shown: `${near.key}/taproom`, minimap: `${near.key}/taproom`, heard: "taproom", visible: true, town: false });
    expect(inside.folk).toContain(`${near.key}/barkeep`);
    expect(inside.names.filter((name) => inside.wenches.includes(name))).toEqual([]);

    // Out, and far off: let go (its plans kept)
    const far = await page.evaluate((key) => {
        const { game } = window.pellagos;
        const building = game.world.interiors.buildings.get(key);

        game.battle.command("player", { type: "enter", link: `${key}/door` });
        game.advance(4);

        const out = game.battle.actor("player").map;

        window.put("player", game.world.spawns.player.map((value) => value - 100));
        game.host.lookAt = 0;
        game.advance(0.2);

        return { out, visited: game.visits.has(key), folk: game.battle.actors.filter(({ id }) => id.startsWith(`${key}/`)).length, floors: building.maps.filter((id) => game.interiors.has(id)).length, plans: building.maps.filter((id) => game.world.maps[id]).length };
    }, near.key);

    expect(far).toEqual({ out: "town", visited: false, folk: 0, floors: 0, plans: 2 });

    // (What someone does, told in the step they're taken out of the battle in, as a building's
    // folk are let go: nothing shown, nothing thrown)
    const told = await page.evaluate(() => {
        const { game } = window.pellagos;
        const id = [...game.avatars.keys()].find((each) => each !== game.me);
        const advance = game.host.advance.bind(game.host);

        game.host.advance = (ms) => {
            const events = advance(ms);

            game.host.advance = advance;
            game.battle.remove(id);

            return [...events, { type: "act", id, act: "toast" }, { type: "rest", id, role: "patron", rest: 0 }];
        };

        try {
            game.advance(0.1);

            return "quietly";
        } catch (error) {
            return error.message;
        }
    });

    expect(told).toBe("quietly");

    // Straight back in through the door, before it's got ready: its floors built there and then,
    // its folk dressed a frame at a time with the screen kept dark meanwhile, then lit
    const again = await page.evaluate((key) => {
        const { game } = window.pellagos;
        const [outside] = game.world.interiors.buildings.get(key).door.ends;

        window.put("player", outside.squares[0]);
        game.battle.command("player", { type: "enter", link: `${key}/door` });
        game.advance(0.2);

        const player = game.battle.actor("player");

        return { map: player.map, shown: game.mapId, visible: game.interiors.get(player.map)?.object.visible ?? false, folk: game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player").length, dark: Boolean(game.arriving) && document.querySelector(".curtain").style.opacity === "1" };
    }, near.key);

    expect(again).toEqual({ map: `${near.key}/taproom`, shown: `${near.key}/taproom`, visible: true, folk: expect.any(Number), dark: true });
    expect(again.folk).toBeGreaterThanOrEqual(5);
    expect(await playUntil(page, () => !window.pellagos.game.arriving)).toBe(true);

    const lit = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        return { curtain: document.querySelector(".curtain").style.opacity, drawn: game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player" && game.avatars.has(actor.id)).length };
    });

    expect(lit.curtain).toBe("0");

    // (Any not dressed in the dark, dressed after, a few milliseconds a frame)
    expect(await playUntil(page, () => {
        const visit = window.pellagos.game.visits.get(window.visit.key);

        return Boolean(visit) && !visit.queue.length && !visit.steps;
    })).toBe(true);
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        return game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player" && game.avatars.has(actor.id)).length;
    })).toBeGreaterThanOrEqual(5);
});

test("buildings' floors built only once the player comes to their doors, though they're got ready further off, and held at most twelve further off than they're built (the furthest let go of first, none built again only to be let go), and counted in what the game holds: each on the page alone, put away till the player goes in", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Got ready as the player comes near, but none of their floors built till they're at the door
    const ready = await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor("player");
        const off = (visit) => Math.hypot(visit.door.x - me.x, visit.door.z - me.y);
        const further = [...game.visits.values()].filter((visit) => visit.door && off(visit) > 9);

        return { further: further.length, built: further.filter((visit) => !visit.bare || visit.maps.length || visit.queue.length).map(off) };
    });

    expect(ready.further).toBeGreaterThan(0);
    expect(ready.built).toEqual([]);

    // The town's buildings that can be gone into, the nearest the player first: each walked up to
    // and its floors built
    const keys = await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        window.put = ([x, y]) => {
            const actor = game.battle.actor("player");

            Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
            game.avatars.get("player").place(x + 0.5, y + 0.5, actor.facing);
            game.previous.set("player", { x: actor.x, y: actor.y });
        };

        return [...game.world.interiors.buildings.values()]
            .filter((building) => building.entrance && building.door?.ends?.[0]?.arrive)
            .sort((a, b) => Math.hypot(a.entrance.door.x - me.x, a.entrance.door.z - me.y) - Math.hypot(b.entrance.door.x - me.x, b.entrance.door.z - me.y))
            .slice(0, 5)
            .map(({ key }) => key);
    });

    expect(keys.length).toBeGreaterThanOrEqual(4);

    for (const key of keys) {
        await page.evaluate((key) => {
            const { game } = window.pellagos;

            window.put(game.world.interiors.buildings.get(key).door.ends[0].arrive);
            game.host.lookAt = 0;
            game.advance(0.1);
        }, key);
        expect(await playUntil(page, () => [...window.pellagos.game.visits.values()].every((visit) => !visit.queue.length && !visit.steps))).toBe(true);
    }

    // Counted in what the game holds: their own copies on the page, in the debug overlay
    const counted = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { heldOnPage } = await import("/js/world/release.js");
        const { memoryLines } = await import("/js/app/debug.js");
        const memory = game.memoryNow();

        return { held: game.interiors.size, MB: memory.interiorsMB, own: Math.round(heldOnPage([...game.interiors.values()].map(({ object }) => object)) / 104857.6) / 10, line: memoryLines(memory)[0] };
    });

    expect(counted.held).toBeGreaterThanOrEqual(2);
    expect(counted.MB).toBeGreaterThan(1);
    expect(counted.MB).toBeCloseTo(counted.own, 0);
    expect(counted.line).toContain(`floors' ${counted.MB} MB`);

    // Stood where as many of the town's doors as can be are further off than floors are built but
    // not so far they're let go of, none nearer; the player made for each of those doors from
    // there (their floors built, as they're going in) and stood back there each time
    const spot = await page.evaluate(() => {
        const { game } = window.pellagos;
        const squares = game.world.maps.town.squares;
        const all = [...game.world.interiors.buildings.values()].filter((building) => building.entrance && building.door?.ends?.[0]);
        const me = game.battle.actor("player");
        let best = null;

        for (let y = Math.floor(me.y) - 40; y <= me.y + 40; y++) {
            for (let x = Math.floor(me.x) - 40; x <= me.x + 40; x++) {
                const offs = all.map(({ entrance }) => Math.hypot(entrance.door.x - x - 0.5, entrance.door.z - y - 0.5));

                if (!squares.blocked(x, y) && offs.every((off) => off >= 9) && offs.filter((off) => off < 15).length > (best?.keys.length ?? 1)) {
                    best = { at: [x, y], keys: all.filter((_, k) => offs[k] < 15).map(({ key }) => key) };
                }
            }
        }

        for (const key of best?.keys ?? []) {
            window.put(best.at);
            game.host.lookAt = 0;
            game.advance(0.1);
            game.battle.command("player", { type: "enter", link: `${key}/door` });
            game.advance(0.05);
        }

        if (best) {
            window.put(best.at);
        }

        return best;
    });

    expect(spot?.keys.length, JSON.stringify(spot)).toBeGreaterThanOrEqual(2);
    expect(await playUntil(page, () => [...window.pellagos.game.visits.values()].every((visit) => !visit.queue.length && !visit.steps))).toBe(true);

    // There, at most one held (as twelve would be in a town that held more), the furthest let go
    // of first
    const stood = await page.evaluate((best) => {
        const { game } = window.pellagos;
        const doors = [...game.visits.values()].filter((visit) => visit.maps.length && visit.door);
        const count = doors.length;

        game.floorsMost = 1;
        game.advance(0.1);

        const off = (visit) => Math.hypot(visit.door.x - best.at[0] - 0.5, visit.door.z - best.at[1] - 0.5);
        const kept = doors.filter((visit) => !visit.bare);
        // (Let go of for there being too many, not for being too far off)
        const gone = doors.filter((visit) => visit.bare && off(visit) <= 16);
        const held = [...game.visits.values()].reduce((sum, visit) => sum + visit.maps.length, 0);
        const floors = kept.reduce((sum, visit) => sum + visit.maps.length, 0);
        const ids = [...game.interiors.keys()].join();

        // (Stood there a while: nothing built again, nothing more let go of)
        game.advance(3);

        return { count, held, kept: kept.map(off), gone: gone.map(off), floors, steady: [...game.interiors.keys()].join() === ids && [...game.visits.values()].every((visit) => !visit.queue.length && !visit.steps), MB: game.memoryNow().interiorsMB };
    }, spot);

    expect(stood.count, JSON.stringify(stood)).toBeGreaterThanOrEqual(2);
    expect(stood.gone.length, JSON.stringify(stood)).toBeGreaterThan(0);
    expect(stood.held === stood.floors && (stood.held <= 1 || stood.kept.length === 1), JSON.stringify(stood)).toBe(true);
    expect(Math.max(...stood.kept, 0)).toBeLessThanOrEqual(Math.min(...stood.gone));
    expect(stood.steady).toBe(true);
    expect(stood.MB).toBeLessThan(counted.MB);
});

test("the smithy: the smith heats, hammers and quenches the work, the apprentice pumps the bellows and turns the grindstone, each heard and seen at it", async ({ page }) => {
    // (Seed 2's town's smithy, a few steps from the start)
    await playing(page, "/?play&seed=2");

    const smithy = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "blacksmith");
        const player = game.battle.actor("player");
        const heard = [];
        const acts = [];
        const play = session.sound.play.bind(session.sound);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        session.sound.play = (name, options) => {
            heard.push(name);

            return play(name, options);
        };

        // Straight through its door (built there and then)
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        // (Its folk dressed while the screen's dark, a little of each frame)
        for (let k = 0, visit = game.visits.get(building.key); k < 600 && (visit.queue.length || visit.steps); k++) {
            game.advance(0.1, { render: false });
        }

        // A while at work (what each of them does, as the battle says)
        for (let k = 0; k < 90; k++) {
            game.advance(0.5, { render: false });

            for (const id of [`${building.key}/smith`, `${building.key}/apprentice`]) {
                const name = game.avatars.get(id).actions.attack?.name;

                if (name && !acts.includes(`${id.split("/")[1]}:${name}`)) {
                    acts.push(`${id.split("/")[1]}:${name}`);
                }
            }
        }

        const smith = game.world.interiors.buildings.get(building.key).folk.find(({ local }) => local === "smith");

        return { map: player.map, name: building.name, smith: smith.name, holding: [...game.avatars.get(smith.id).character.equipment.values()], acts, heard: [...new Set(heard)], place: session.sound.place };
    });

    expect(smithy.map).toMatch(/blacksmith-\d+\/forge$/);
    expect(smithy.name).toBe(`${smithy.smith.split(" ")[1]}'s Forge`);
    expect(smithy.holding).toEqual(expect.arrayContaining(["smithHammer", "tongs", "leatherApron"]));
    expect(smithy.acts).toEqual(expect.arrayContaining(["smith:heat", "smith:forge", "smith:quench", "apprentice:pump", "apprentice:crank"]));
    expect(smithy.heard).toEqual(expect.arrayContaining(["anvil", "hiss", "bellows", "grind"]));
    expect(smithy.place).toBe("smithy");
});

test("the folk out in the streets held in full only as the bodies' budget has room, the furthest let go first; and indoors, those out in the world let go of a few seconds in, the soldiers to their crowds, and dressed again coming out", async ({ page }) => {
    // (Seed 2's town on Low: its townsfolk, its crier and its guards about the start, its smithy a
    // few steps off)
    await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ sound: false, quality: "low" })));
    await playing(page, "/?play&seed=2");

    const held = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const play = async (steps) => {
            for (let k = 0; k < steps; k++) {
                game.advance(0.1, { render: k % 5 === 0 });
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };
        const inFull = (id) => game.avatars.has(id) && game.avatars.get(id).constructor.name !== "CrowdAvatar";
        const out = (kind) => game.battle.actors.filter((actor) => actor.kind === kind && actor.map === "town");
        const street = () => out("folk").map((actor) => ({ id: actor.id, held: inFull(actor.id), away: Math.hypot(actor.x - player.x, actor.y - player.y) }));

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // A while about the square: its folk dressed as they come out
        await play(200);

        const about = { folk: street().filter(({ held }) => held).length, soldiers: out("soldier").filter(({ id }) => inFull(id)).length };

        // Under a budget with room for fewer of them: the furthest let go (all but those only just
        // past the room: the townsfolk to their crowd, the crier undrawn), then all dressed again
        // once there's room
        const quality = session.view.quality;

        const others = [...game.avatars.keys()].filter((id) => inFull(id) && !out("folk").some((actor) => actor.id === id)).length;

        session.view.quality = { ...quality, bodies: others + 2 };
        await play(10);

        const tight = { ...game.folkRationed, folk: street() };

        session.view.quality = quality;
        await play(80);

        const loose = street().filter(({ held }) => held).length;

        // Into the smithy: held a moment, then let go of
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "blacksmith");
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        for (let k = 0, visit = game.visits.get(building.key); k < 600 && (visit.queue.length || visit.steps); k++) {
            game.advance(0.1, { render: false });
        }

        await play(10);

        const moment = { map: player.map, folk: out("folk").filter(({ id }) => inFull(id)).length };

        await play(40);

        const inside = {
            folk: out("folk").filter(({ id }) => inFull(id)).length,
            soldiers: out("soldier").filter(({ id }) => inFull(id)).length,
            crowds: out("soldier").filter(({ id }) => game.avatars.get(id)?.constructor.name === "CrowdAvatar").length,
            aside: out("folk").filter(({ id }) => game.aside.has(id)).length,
            own: [`${building.key}/smith`, `${building.key}/apprentice`].every(inFull),
        };

        // Out again: dressed again, the nearest first
        game.battle.command("player", { type: "enter", link: building.door.id });

        for (let k = 0; k < 100 && player.map !== "town"; k++) {
            game.advance(0.1, { render: false });
        }

        await play(80);

        return { about, tight, loose, moment, inside, back: street().filter(({ held }) => held).length };
    });

    expect(held.about.folk, JSON.stringify(held)).toBeGreaterThanOrEqual(5);

    // (Room for 2 of them: those past it and the margin let go, each further than all those held)
    const kept = held.tight.folk.filter(({ held }) => held);
    const gone = held.tight.folk.filter(({ held }) => !held);

    expect(held.tight.room).toBe(2);
    expect(kept.length, JSON.stringify(held.tight)).toBeLessThanOrEqual(2 + 3);
    expect(gone.length, JSON.stringify(held.tight)).toBeGreaterThan(0);
    expect(Math.min(...gone.map(({ away }) => away))).toBeGreaterThanOrEqual(Math.max(...kept.map(({ away }) => away)) - 1);
    expect(held.loose).toBe(held.about.folk);

    // Inside: those out in the streets held a moment, then let go of, the soldiers to their crowds;
    // the smithy's own drawn
    expect(held.moment.map).toMatch(/blacksmith-\d+\/forge$/);
    expect(held.moment.folk).toBeGreaterThan(0);
    expect(held.inside).toEqual({ folk: 0, soldiers: 0, crowds: expect.any(Number), aside: expect.any(Number), own: true });
    expect(held.inside.aside).toBeGreaterThanOrEqual(held.about.folk);
    expect(held.inside.crowds).toBeGreaterThanOrEqual(held.about.soldiers);

    // Out again: the townsfolk dressed again
    expect(held.back).toBeGreaterThanOrEqual(held.about.folk - 1);
});

test("the townsfolk past the bodies' room, or far from the camera, drawn in their people's and sex's crowd once its figure's made, each in their own colours and build; dressed in full again near with room, their crowd's figure fading as they're shown; the crier never in one", async ({ page }) => {
    // (Seed 2's town on Low: its townsfolk and its crier about the start)
    await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ sound: false, quality: "low" })));
    await playing(page, "/?play&seed=2");

    const seen = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const play = async (steps, each = () => {}) => {
            for (let k = 0; k < steps; k++) {
                game.advance(0.1, { render: k % 5 === 0 });
                each();
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };
        const kindOf = (id) => game.avatars.get(id)?.constructor.name ?? "none";
        const folk = () => game.battle.actors.filter((actor) => actor.kind === "folk" && actor.map === "town");
        const camera = session.view.camera.position;
        const [ox, oz] = game.originOf("town");
        const away = (actor) => Math.hypot(ox + actor.x - camera.x, oz + actor.y - camera.z);
        const crowded = () =>
            folk()
                .filter(({ id }) => kindOf(id) === "CrowdAvatar")
                .map((actor) => {
                    const avatar = game.avatars.get(actor.id);
                    const one = game.host.folk.get(actor.id);

                    return { id: actor.id, role: one.role, key: avatar.key, kind: `folk:${one.people ?? "human"}:${one.sex}`, tint: [...(avatar.tint ?? [])], build: avatar.build, off: Math.hypot(ox + actor.x - avatar.object.position.x, oz + actor.y - avatar.object.position.z) };
                });

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // A while about the square: its folk dressed as they come out
        await play(200);

        const about = folk().filter(({ id }) => kindOf(id) === "Avatar").length;

        // Under a budget with room for two of them: the rest in their crowd, once its figure's made
        const quality = session.view.quality;
        const others = [...game.avatars.keys()].filter((id) => kindOf(id) === "Avatar" && !folk().some((actor) => actor.id === id)).length;

        session.view.quality = { ...quality, bodies: others + 2 };

        for (let k = 0; k < 600 && crowded().length < 3; k++) {
            await play(1);
        }

        await play(10);

        const tight = { crowded: crowded(), rationed: { ...game.folkRationed }, crier: folk().filter(({ id }) => /^crier:/.test(id)).map(({ id }) => kindOf(id)) };

        // Room again: dressed in full again, their crowd's figures fading as they're shown
        session.view.quality = quality;

        let faded = 0;

        await play(150, () => (faded = Math.max(faded, game.fadingOut.length)));

        const loose = { inFull: folk().filter(({ id }) => kindOf(id) === "Avatar").length, crowded: crowded().length, faded };

        // Off down a road from the square, the camera with the player: those far from it in their
        // crowd, whatever room there is; those near in full
        const map = game.world.maps.town;
        const start = [player.x, player.y];
        let moved = null;

        for (let r = 60; r < 90 && !moved; r += 2) {
            for (let a = 0; a < 24 && !moved; a++) {
                const x = Math.floor(start[0] + Math.cos((a / 24) * Math.PI * 2) * r);
                const y = Math.floor(start[1] + Math.sin((a / 24) * Math.PI * 2) * r);

                if (!map.squares.blocked(x, y)) {
                    moved = [x, y];
                }
            }
        }

        const go = ([x, y]) => {
            Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
            game.avatars.get(game.me).place(x + 0.5, y + 0.5, player.facing);
            game.previous.set(game.me, { x: player.x, y: player.y });
        };

        go(moved);
        await play(60);

        const far = folk().map((actor) => ({ id: actor.id, townsfolk: game.host.folk.get(actor.id)?.role === "townsfolk", away: away(actor), kind: kindOf(actor.id) }));

        // And back: dressed in full again
        go(start.map(Math.floor));
        await play(150);

        return { about, tight, loose, far, back: folk().filter(({ id }) => kindOf(id) === "Avatar").length, crowd: { ...game.stats.bodies }.crowd };
    });

    expect(seen.about, JSON.stringify(seen)).toBeGreaterThanOrEqual(5);

    // (Squeezed: those past the room in their crowd, each of the townsfolk, in their people's and
    // sex's, where they are, each in their own colours and build; the crier never)
    const { crowded } = seen.tight;

    expect(crowded.length, JSON.stringify(seen.tight)).toBeGreaterThanOrEqual(3);
    expect(seen.tight.rationed.crowd).toBe(crowded.length);
    expect(seen.tight.crier.every((kind) => kind !== "CrowdAvatar")).toBe(true);

    for (const one of crowded) {
        expect(one.role).toBe("townsfolk");
        expect(one.key).toBe(one.kind);
        expect(one.tint).toHaveLength(16);
        expect(one.tint.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
        expect(one.build.every((value) => value >= 0.92 && value <= 1.08)).toBe(true);
        expect(one.off).toBeLessThan(1.5);
    }

    expect(new Set(crowded.map(({ tint }) => tint.map((value) => value.toFixed(2)).join())).size).toBeGreaterThanOrEqual(Math.min(3, crowded.length));

    // (Room again: all of them in full, their crowd's figures faded)
    expect(seen.loose.inFull).toBe(seen.about);
    expect(seen.loose.crowded).toBe(0);
    expect(seen.loose.faded).toBeGreaterThan(0);

    // (Far off: the townsfolk past the reach and its slack in their crowd; none near in one)
    const past = seen.far.filter(({ townsfolk, away }) => townsfolk && away > 45 + 10 + 2);

    expect(past.length, JSON.stringify(seen.far)).toBeGreaterThan(0);
    expect(past.every(({ kind }) => kind === "CrowdAvatar"), JSON.stringify(seen.far)).toBe(true);
    expect(seen.far.filter(({ away }) => away < 45 - 2).every(({ kind }) => kind !== "CrowdAvatar"), JSON.stringify(seen.far)).toBe(true);

    // (Back: dressed in full again)
    expect(seen.back).toBeGreaterThanOrEqual(seen.about - 1);
});

test("the temple: the priest in white blesses the pews and lights the shrines' candles, worshippers pray, and the priest tells of the temple's patron", async ({ page }) => {
    // (Seed 2's town's temple, to Aurelia, a few steps from the start)
    await playing(page, "/?play&seed=2");

    const temple = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "church");
        const player = game.battle.actor("player");
        const acts = [];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Straight through its door
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        // (Its folk dressed while the screen's dark, a little of each frame)
        for (let k = 0, visit = game.visits.get(building.key); k < 600 && (visit.queue.length || visit.steps); k++) {
            game.advance(0.1, { render: false });
        }

        const folk = game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player");
        const priest = folk.find(({ role }) => role === "priest");

        // A while inside: what the priest and the worshippers do
        for (let k = 0; k < 80; k++) {
            game.advance(0.5, { render: false });

            for (const one of folk) {
                const name = game.avatars.get(one.id).actions.attack?.name;

                if (name && !acts.includes(`${one.role}:${name}`)) {
                    acts.push(`${one.role}:${name}`);
                }
            }
        }

        // Up to the priest, to ask whose temple it is
        game.approaching = priest.id;
        game.battle.command("player", { type: "approach", target: priest.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const conversation = game.talking?.conversation;
        const asked = conversation?.choices.findIndex(({ text }) => text.includes("Whose temple"));

        conversation?.choose(asked);

        return {
            map: player.map,
            name: building.name,
            wearing: [...game.avatars.get(priest.id).character.equipment.values()],
            roles: folk.map(({ role }) => role),
            acts,
            patron: conversation?.line ?? null,
            place: session.sound.place,
        };
    });

    expect(temple.map).toMatch(/church-\d+\/nave$/);
    expect(temple.name).toBe("the Temple of Aurelia");
    expect(temple.wearing).toEqual(expect.arrayContaining(["alb", "chasuble", "albSkirt"]));
    expect(temple.roles.slice(0, 2)).toEqual(["priest", "acolyte"]);
    expect(temple.roles.filter((role) => role === "worshipper").length).toBeGreaterThanOrEqual(2);
    expect(temple.acts).toEqual(expect.arrayContaining(["priest:bless", "priest:light", "acolyte:light"]));
    expect(temple.acts.some((act) => act.startsWith("worshipper:rest:"))).toBe(true);
    expect(temple.patron).toMatch(/This is Aurelia's house, the Dawnmother/);
    expect(temple.place).toBe("temple");
});

test("the guild's portal: a character kept from before there were portals has the branches in country they'd found open; the receptionist tells of it, and what their rank takes off; tapped, it walks them up to it and the travel map shows those branches with their fares; one tapped is asked about first, and agreed to, they pay and step out of its portal", async ({ page }) => {
    test.setTimeout(240000);

    // Seed 2's world: the home town, the branch nearest it, and the next. Kept from before the
    // portals: the way walked from home to the nearest branch, and round both, uncovered; the
    // next branch still under the fog
    const plan = planWorld(2);
    const start = startFor(plan, "human");
    const apart = (place) => Math.hypot(place.at[0] - start.at[0], place.at[1] - start.at[1]);
    const [near, next] = guilds(plan)
        .filter(({ id }) => id !== start.id)
        .sort((a, b) => apart(a) - apart(b));
    const kept = new Explored();

    for (let t = 0; t <= 1; t += 0.02) {
        kept.visit(start.at[0] + (near.at[0] - start.at[0]) * t, start.at[1] + (near.at[1] - start.at[1]) * t);
    }

    for (const { at } of [start, near]) {
        for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
            kept.visit(at[0] + dx * 64, at[1] + dz * 64);
        }
    }

    const open = branchesFound(plan, kept, start);

    expect(open).toEqual(expect.arrayContaining([start.id, near.id]));
    expect(open).not.toContain(next.id);
    expect(kept.toJSON().portals).toBeUndefined();

    await page.addInitScript(([save, explored]) => {
        localStorage.setItem("pellagos.save", JSON.stringify(save));
        localStorage.setItem("pellagos.explored", JSON.stringify(explored));
    }, [{ ...SAVE, seed: 2 }, { created: SAVE.created, seed: 2, ...kept.toJSON() }]);
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // Opened to them as they came in: those whose country they'd found
    expect(await page.evaluate(() => [...window.pellagos.game.explored.portals].sort())).toEqual([...open].sort());

    // Into the home town's guild, and up to the receptionist to ask about the arch by the hearth
    const talk = await page.evaluate(() => {
        const { game } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild" && each.place === "home");
        const player = game.battle.actor("player");
        const [x, y] = building.door.ends[0].squares[0];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.host.command("player", { type: "enter", link: building.door.id });

        for (let k = 0; k < 20 && player.map === "town"; k++) {
            game.advance(0.25, { render: false });
        }

        const receptionist = game.battle.actors.find(({ map, role }) => map === player.map && role === "receptionist");

        game.approaching = receptionist.id;
        game.battle.command("player", { type: "approach", target: receptionist.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const conversation = game.talking.conversation;
        const say = (text) => {
            conversation.choose(conversation.choices.findIndex((choice) => choice.text === text));

            return conversation.line;
        };
        const asked = conversation.choices.map(({ text }) => text);
        const portal = say("What's that archway by the hearth?");
        const fare = say("What does it cost?");
        const members = say("Can anyone use it?");

        say("Good to know.");
        say("I'd like to register as an adventurer.");
        say("Thank you!");
        say("What's that archway by the hearth?");

        const copper = say("What does it cost?");

        say("Good to know.");
        game.talk.onClose?.();

        return { map: player.map, asked, portal, fare, members, copper, rank: game.standing.guildTitle() };
    });

    expect(talk.map).toMatch(/^home:guild-\d+\/hall$/);
    expect(talk.asked).toContain("What's that archway by the hearth?");
    expect(talk.portal).toMatch(/^Oh, the portal! Every branch has one\..* any other branch you've been inside/);
    expect(talk.fare).toMatch(/^Five gold to step through, and seven more for every kilometre .* Mithril go free! Register first/);
    expect(talk.members).toMatch(/^Members only!/);
    expect(talk.rank).toBe("Copper");
    expect(talk.copper).toMatch(/You're Copper, so it's the full fare for now/);

    // What's kept of where they've been now has the branches (worked out as they came in)
    expect(new Set((await keptOf(page, "explored")).portals)).toEqual(new Set(open));

    // Across the room from the portal, gold in hand, looking at it; tapped, they walk up to it,
    // and the travel map opens on it
    const at = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [ox, oz] = game.originOf(game.mapId);

        game.progress.gold = 60;
        Object.assign(player, { square: [11, 13], x: 11.5, y: 13.5, path: [], facing: Math.PI / 2 });

        for (let k = 0; k < 12; k++) {
            game.advance(0.25);
        }

        Object.assign(game.cameraFollow, { yaw: -Math.PI / 2 + 0.25, turning: 0, pitch: 30 });
        game.cameraFollow.heading = { x: 0, z: 0 };
        game.advance(0.05);
        game.start();

        return game.view.toScreen(game.view.camera.position.clone().set(ox + 19.6, 0.6, oz + 12.5));
    });

    // (Walked up to it in the game's own time, as fast as it draws: a slow runner, a slow walk)
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn?.branches, null, { timeout: 90000, polling: 100 });

    const map = await page.evaluate(() => {
        const { game, worldMap } = window.pellagos;
        const player = game.battle.actor("player");

        return { title: document.querySelector("#worldmaptitle").textContent, text: document.querySelector("#worldmappicktext").textContent, key: document.querySelector("#worldmapkey").hidden, drawn: worldMap.drawn, travel: worldMap.travel, square: player.square, paused: !game.running };
    });
    const here = map.travel.find(({ here }) => here);
    const there = map.travel.find(({ id }) => id === near.id);

    expect(map.title).toBe("Guild portal");
    expect(map.text).toBe("Tap a branch of the guild to step through to it.");
    expect(map.key).toBe(true);
    expect(map.paused).toBe(true);
    expect(map.square).toEqual([18, 12]);

    // (Only the branches open to them, the guild's icon over each, however far out; no pin, no marks)
    expect(new Set(map.travel.map(({ id }) => id))).toEqual(new Set(open));
    expect(map.drawn).toMatchObject({ branches: open.length, marks: 0, pin: false });
    expect(map.drawn.icons.every((kind) => kind === "guild")).toBe(true);
    expect(here.id).toBe(start.id);
    expect(there.fare).toBe(fareOf(apart(near), 0));
    expect(there.name).toBe(near.name);

    // Where's a branch on the map, to tap
    const spot = (branch) =>
        page.evaluate(({ x, z }) => {
            const map = window.pellagos.worldMap;
            const rect = map.canvas.getBoundingClientRect();

            return { x: rect.left + (x - map.view.x) / map.view.scale + rect.width / 2, y: rect.top + (z - map.view.z) / map.view.scale + rect.height / 2 };
        }, branch);

    // Here: nothing to do; the one nearest, asked first; stayed, still on the map
    const home = await spot(here);

    await page.mouse.click(home.x, home.y);
    await expect(page.locator("#worldmapnote")).toHaveText("You're here");

    const near1 = await spot(there);

    await page.mouse.click(near1.x, near1.y);
    await expect(page.locator("#portal")).toBeVisible();
    await expect(page.locator("#portaltitle")).toHaveText(`Step through to ${near.name}?`);
    await expect(page.locator("#portalnote")).toContainText(`${there.fare} gold. You have 60 gold.`);
    await expect(page.locator("#portalgo")).toHaveText(`Pay ${there.fare} gold and step through`);
    await page.locator("#portalback").click();
    await expect(page.locator("#portal")).toBeHidden();
    expect(await page.evaluate(() => document.querySelector("#worldmap").open)).toBe(true);

    // Agreed to: paid, and out of that branch's portal, into its hall, facing into it
    await page.mouse.click(near1.x, near1.y);
    await page.locator("#portalgo").click();
    await page.waitForFunction(() => !document.querySelector("#worldmap").open, null, { timeout: 10000 });
    await page.waitForFunction((id) => window.pellagos.game.battle.actor("player").map.startsWith(`${id}:guild-`), near.id, { timeout: 10000 });

    const after = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        for (let k = 0; k < 4; k++) {
            game.advance(0.25);
        }

        return { map: player.map, shown: game.mapId, square: player.square, facing: player.facing, gold: game.progress.gold, plate: document.querySelector("#playerplate")?.textContent ?? "", running: game.running };
    });

    expect(after.map).toMatch(new RegExp(`^${near.id}:guild-\\d+/hall$`));
    expect(after.shown).toBe(after.map);
    expect(after.square).toEqual([14, 12]);
    expect(after.facing).toBeCloseTo(-Math.PI / 2);
    expect(after.gold).toBe(60 - there.fare);
    expect(after.plate).toContain(`${60 - there.fare} gold`);
    expect(after.running).toBe(true);

    // Home again for less than they have: they can't
    const poor = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        game.progress.gold = 2;
        Object.assign(player, { square: [18, 12], x: 18.5, y: 12.5, path: [] });
        game.advance(0.1);

        return game.openPortal().ok;
    });

    expect(poor).toBe(true);
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn?.branches, null, { timeout: 10000 });

    const back = await spot(here);

    await page.mouse.click(back.x, back.y);
    await expect(page.locator("#portalgo")).toHaveText("Not enough gold");
    await expect(page.locator("#portalgo")).toBeDisabled();
});

test("trading with the guild's receptionist, she stays at her counter till it's done, though her rounds would take her off to the files and out of reach; done, or the player off to talk to someone else, she's back about her business", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    const traded = await page.evaluate(() => {
        const { game } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild");
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Into the guild, and up to her counter to talk
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const receptionist = game.battle.actors.find((actor) => actor.map === player.map && actor.role === "receptionist");
        const adventurer = game.battle.actors.find((actor) => actor.map === player.map && actor.role === "adventurer");
        const talkedUp = () => {
            game.approaching = receptionist.id;
            game.battle.command("player", { type: "approach", target: receptionist.id });

            for (let k = 0; k < 300 && !game.talking; k++) {
                game.advance(0.1, { render: false });
            }

            // (Chosen as a tap on it does: the talk over, and her wares in the pack)
            const { conversation } = game.talking;

            game.talk.onChoose(conversation.choices.findIndex(({ text }) => text === "I'd like to buy or sell something."));
        };

        talkedUp();

        // Trading: a minute on, she's still there, and the trade's still open
        const at = [receptionist.x, receptionist.y];
        let stayed = true;

        for (let k = 0; k < 120; k++) {
            game.advance(0.5, { render: false });
            stayed &&= Boolean(game.shopping) && Math.hypot(receptionist.x - at[0], receptionist.y - at[1]) < 0.25 && receptionist.talkingTo === "player";
        }

        // Done (the pack closed): back to her rounds
        game.closePack();

        const done = receptionist.talkingTo;
        let walked = false;

        for (let k = 0; k < 60 && !walked; k++) {
            game.advance(0.5, { render: false });
            walked = Math.hypot(receptionist.x - at[0], receptionist.y - at[1]) > 1;
        }

        // Trading again, the player off to talk to an adventurer: the trade's over, and she's let go
        talkedUp();

        const again = { shopping: Boolean(game.shopping), talking: receptionist.talkingTo };

        game.approaching = adventurer.id;
        game.battle.command("player", { type: "approach", target: adventurer.id });

        for (let k = 0; k < 300 && game.talking?.id !== adventurer.id; k++) {
            game.advance(0.1, { render: false });
        }

        return { stayed, done, walked, again, after: { shopping: Boolean(game.shopping), talking: receptionist.talkingTo, to: game.talking?.id === adventurer.id } };
    });

    expect(traded).toEqual({ stayed: true, done: null, walked: true, again: { shopping: true, talking: "player" }, after: { shopping: false, talking: null, to: true } });
});

test("the adventurers' guild: the receptionist stamps notices behind her counter, adventurers read the quest board and drink at the tables, she signs the player up, and gives them a package to carry off its board of four", async ({ page }) => {
    // (Seed 2's town's guild)
    await playing(page, "/?play&seed=2");

    const guild = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild");
        const player = game.battle.actor("player");
        const acts = [];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Straight through its door
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        // (Its folk dressed while the screen's dark, a little of each frame)
        for (let k = 0, visit = game.visits.get(building.key); k < 600 && (visit.queue.length || visit.steps); k++) {
            game.advance(0.1, { render: false });
        }

        const folk = game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player");
        const receptionist = folk.find(({ role }) => role === "receptionist");

        // A while inside: what the receptionist and the adventurers do
        for (let k = 0; k < 60; k++) {
            game.advance(0.5, { render: false });

            for (const one of folk) {
                const name = game.avatars.get(one.id).actions.attack?.name;

                if (name && !acts.includes(`${one.role}:${name}`)) {
                    acts.push(`${one.role}:${name}`);
                }
            }
        }

        // Up to the counter, to register
        game.approaching = receptionist.id;
        game.battle.command("player", { type: "approach", target: receptionist.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const conversation = game.talking?.conversation;
        // (What she offers: to trade, buying or selling, and what the guild buys)
        const offers = conversation?.choices.map(({ text }) => text) ?? [];
        // (The player's guild card on the talk, and on their own card: none yet)
        const card = () => document.querySelector(".talk-card:not([hidden])")?.textContent ?? null;
        const chip = () => document.querySelector("#playerplate .guild:not([hidden])")?.textContent ?? null;
        const unregistered = { card: card(), chip: chip() };

        conversation?.choose(conversation.choices.findIndex(({ text }) => text === "What does the guild buy?"));

        const buys = conversation?.line ?? null;

        conversation?.choose(conversation.choices.findIndex(({ text }) => text === "Good to know."));
        conversation?.choose(conversation.choices.findIndex(({ text }) => text.includes("register")));

        const registered = conversation?.line ?? null;

        // What's on the board: its notices, the package among them, read and taken
        conversation?.choose(conversation.choices.findIndex(({ text }) => text === "Thank you!"));

        const signed = { card: card(), chip: chip(), rank: game.standing.guildTitle(), to: game.guildCard()?.to };

        conversation?.choose(conversation.choices.findIndex(({ text }) => text === "Anything on the board for me?"));

        const notices = conversation?.choices.map(({ text }) => text) ?? [];

        conversation?.choose(notices.findIndex((text) => text.startsWith("A package for")));

        const notice = conversation?.line ?? null;

        conversation?.choose(conversation.choices.findIndex(({ text }) => text === "I'll take it."));

        return {
            notices,
            notice,
            taken: conversation?.line ?? null,
            carried: game.host.players.get(game.me).standing.requests.map(({ kind, target }) => ({ kind, town: target.name })),
            offers,
            buys,
            map: player.map,
            name: building.name,
            wearing: [...game.avatars.get(receptionist.id).character.equipment.values()],
            sheathed: folk.filter(({ role }) => role === "adventurer").map(({ id }) => game.avatars.get(id).character.sheathed),
            roles: folk.map(({ role }) => role),
            acts,
            registered,
            unregistered,
            signed,
            place: session.sound.place,
        };
    });

    expect(guild.map).toMatch(/guild-\d+\/hall$/);
    expect(guild.name).toBe("the Adventurers' Guild");
    expect(guild.wearing).toEqual(expect.arrayContaining(["guildBlouse", "guildVest", "guildSkirt"]));
    expect(guild.roles.slice(0, 3)).toEqual(["receptionist", "adventurer", "adventurer"]);
    expect(guild.roles.filter((role) => role === "patron").length).toBeGreaterThanOrEqual(2);
    expect(guild.sheathed).toEqual([true, true]);
    expect(guild.acts).toEqual(expect.arrayContaining(["receptionist:stamp", "adventurer:read"]));
    expect(guild.offers).toEqual(expect.arrayContaining(["I'd like to buy or sell something.", "What does the guild buy?"]));
    expect(guild.buys).toMatch(/^Anything you drag back from the wild! Pelts, fangs, scales/);
    expect(guild.registered).toMatch(/^Wonderful! Name: .+\. Rank: Copper\./);

    // Their rank on the talk with her, and on their own card once they've one (the same card at
    // every branch: core/standing.js GUILD_RANKS)
    expect(guild.unregistered).toEqual({ card: "Your rankNot registered", chip: null });
    expect(guild.signed).toEqual({ card: `Your rankCopper${guild.signed.to} merit to Iron`, chip: "Copper", rank: "Copper", to: expect.any(Number) });
    expect(guild.place).toBe("guild");

    // Four notices on the board (docs/WAR.md M8), each in a few words and what it pays, the package
    // last; it read in full, where it goes and which way that leads, and taken
    expect(guild.notices).toHaveLength(5);
    expect(guild.notices.slice(0, 4).every((text) => /^.+, for \d+ gold(, and the Tome of [^.]+)?\.$/.test(text))).toBe(true);
    expect(guild.notices[3]).toMatch(/^A package for /);
    expect(guild.notices[4]).toBe("None of them, thanks.");
    expect(guild.notice).toMatch(/^The guild in .+ wants this package, sealed, by someone who'll get it there: [\d.]+ km .+, on the way to .+ at .+\./);
    expect(guild.taken).toMatch(/^(It's yours!|Wonderful!)/);
    expect(guild.carried).toEqual([{ kind: "courier", town: guild.notices[3].match(/^A package for (.+), for /)[1] }]);
});

test("the townsfolk go about their business in the start town: dressed for their callings, carrying what they carry, walking from errand to errand; tapped, they talk of their town", async ({ page }) => {
    // (Everyone in the town drawn, a step at a time: more than the usual time)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=2");

    // Out as soon as the game's played, and drawn a few at a time, after the town's soldiers
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.advance(0.1, { render: false });
    });
    expect(await playUntil(page, () => {
        const { game } = window.pellagos;

        return !game.enlistees.size && !game.enlisting.length;
    }, { seconds: 90 })).toBe(true);

    // (Each as they're drawn: in full, what they wear; in a crowd, which, and how far from the camera)
    const out = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { folkLook } = await import("/js/characters/folk.js");
        const camera = session.view.camera.position;
        const [ox, oz] = game.originOf("town");

        return game.battle.actors
            .filter(({ id }) => id.startsWith("townsfolk:"))
            .map(({ id, x, y, neutral }) => {
                const avatar = game.avatars.get(id);
                const one = game.host.folk.get(id);

                return {
                    id,
                    at: [x, y],
                    neutral,
                    drawn: avatar?.constructor.name ?? null,
                    away: Math.hypot(ox + x - camera.x, oz + y - camera.z),
                    crowd: avatar?.key ?? null,
                    kind: `folk:${one.people ?? "human"}:${one.sex}`,
                    calling: one.look,
                    title: one.title,
                    look: folkLook(one).equipment,
                    wearing: avatar?.character.equipment ? [...avatar.character.equipment.values()] : null,
                };
            });
    });
    const carried = ["pannier", "sack", "firewood", "jug", "pitchfork", "broom", "walkingStaff", "ledger", "hoe", "basket"];

    expect(out.length).toBe(8);
    expect(out.every(({ drawn, neutral }) => drawn && neutral)).toBe(true);
    expect(new Set(out.map(({ calling }) => calling)).size).toBeGreaterThanOrEqual(4);
    expect(out.filter(({ look }) => look.some((id) => carried.includes(id))).length).toBeGreaterThanOrEqual(5);

    // (Each in full dressed as their calling has them, carrying what they carry; or, gone more
    // than 45 metres from the camera on their errands, in their people's and sex's crowd: no more
    // than a step nearer since, or they'd be on their way to being dressed in full again)
    for (const one of out) {
        if (one.drawn === "CrowdAvatar") {
            expect(one.crowd, JSON.stringify(one)).toBe(one.kind);
            expect(one.away, JSON.stringify(one)).toBeGreaterThan(45 - 2);
        } else {
            expect(one.drawn, JSON.stringify(one)).toBe("Avatar");
            expect([...one.wearing].sort(), JSON.stringify(one)).toEqual([...one.look].sort());
        }
    }

    // A quarter of a minute on: most of them gone somewhere else
    const moved = await page.evaluate((before) => {
        const { game } = window.pellagos;

        for (let k = 0; k < 30; k++) {
            game.advance(0.5, { render: false });
        }

        return before.filter(({ id, at: [x, y] }) => {
            const one = game.battle.actor(id);

            return Math.hypot(one.x - x, one.y - y) > 3;
        }).length;
    }, out);

    expect(moved).toBeGreaterThanOrEqual(5);

    // Walked up to and talked to: who they are, and their town
    const folk = out[0];
    const talked = await page.evaluate((id) => {
        const { game } = window.pellagos;
        const one = game.battle.actor(id);
        const player = game.battle.actor("player");

        Object.assign(player, { square: [one.square[0] + 2, one.square[1]], x: one.square[0] + 2.5, y: one.square[1] + 0.5, to: null, path: [], order: null });
        game.approaching = id;
        game.battle.command("player", { type: "approach", target: id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const conversation = game.talking?.conversation;

        return { with: game.talking?.id ?? null, choices: conversation?.choices.map(({ text }) => text) ?? [] };
    }, folk.id);
    const talk = page.locator(".talk");

    expect(talked.with).toBe(folk.id);
    expect(talked.choices).toContain("What's this place like?");
    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-title")).toHaveText(folk.title);
    await talk.getByRole("button", { name: /What's this place like/ }).click();
    await expect(talk.locator(".talk-line")).not.toBeEmpty();
});

test("a crier stands in the start town's square in his people's livery, his handbell in his hand, marked with a bell on the minimap; his bell heard from afar while there's news to hear, and how much on the compass; come near, he calls out the latest; talked to, he cries the war's news since the player last listened, three at a time, and remembers where they'd heard to", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=2");

    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.advance(0.1, { render: false });
    });
    expect(await playUntil(page, () => {
        const { game } = window.pellagos;

        return game.avatars.has(`crier:${game.world.start.id}`);
    }, { seconds: 90 })).toBe(true);

    // Out, drawn, in his livery with his bell; on the minimap, a bell
    const crier = await page.evaluate(() => {
        const { game } = window.pellagos;
        const id = `crier:${game.world.start.id}`;
        const kept = game.host.folk.get(id);

        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        return { id, title: kept.title, role: kept.role, wearing: [...game.avatars.get(id).character.equipment.values()], marked: game.minimap.criers.length };
    });

    expect(crier.role).toBe("crier");
    expect(crier.title).toMatch(/crier$/);
    expect(crier.wearing).toContain("handbell");
    expect(crier.wearing.some((each) => each.startsWith("livery."))).toBe(true);
    expect(crier.marked).toBe(1);

    // Talked to, with news since the player last listened (none yet heard): how much, then three
    // pieces at a time
    const talkTo = (id) => page.evaluate((id) => {
        const { game } = window.pellagos;
        const one = game.battle.actor(id);
        const player = game.battle.actor("player");

        Object.assign(player, { square: [one.square[0] + 2, one.square[1]], x: one.square[0] + 2.5, y: one.square[1] + 0.5, to: null, path: [], order: null });
        game.approaching = id;
        game.battle.command("player", { type: "approach", target: id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        return { with: game.talking?.id ?? null, choices: game.talking?.conversation.choices.map(({ text }) => text) ?? [] };
    }, id);
    const told = await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const peoples = ["human", "elf", "orc", "darkElf", "cat", "lizard"];

        // (The war held still meanwhile, so nothing more happens while they're heard)
        war.advance = () => [];
        delete game.memory.news;

        for (let k = 0; k < 9; k++) {
            war.log.push({ type: "declared", turn: war.turn, by: peoples[k % 6], on: peoples[(k + 1 + Math.floor(k / 6)) % 6] });
        }

        return war.log.length;
    });
    const talk = page.locator(".talk");

    expect(told).toBeGreaterThanOrEqual(9);

    // Further off, with news yet to hear: his bell rung from where he is, now and then, and the
    // news on the compass (the minimap folded)
    const rung = await page.evaluate((id) => {
        const { game } = window.pellagos;
        const one = game.battle.actor(id);
        const player = game.battle.actor("player");
        const heard = [];
        const play = game.sound.play.bind(game.sound);

        document.body.dataset.minimap = "off";
        Object.assign(player, { square: [one.square[0] + 60, one.square[1]], x: one.square[0] + 60.5, y: one.square[1] + 0.5, to: null, path: [], order: null });
        game.sound.play = (name, options = {}) => (heard.push({ name, at: options.at ? Math.hypot(options.at.x - game.avatars.get(id).object.position.x, options.at.z - game.avatars.get(id).object.position.z) : null }), play(name, options));

        for (let k = 0; k < 20; k++) {
            game.advance(0.1, { render: false });
        }

        game.sound.play = play;

        return { bells: heard.filter(({ name }) => name === "newsHeard"), badge: document.getElementById("newsunread").hidden ? null : document.getElementById("newsunread").textContent };
    }, crier.id);

    expect(rung.bells).toHaveLength(1);
    expect(rung.bells[0].at).toBeLessThan(0.01);
    expect(rung.badge).toBe("5");

    // Come near, out of a fight and a talk: he calls out one of his openings ("Oyez!" and the
    // others, in turn) and the latest news yet to hear
    const called = await page.evaluate((id) => {
        const { game } = window.pellagos;
        const one = game.battle.actor(id);
        const player = game.battle.actor("player");

        // (His last call to them long ago: he called out as they stood by him at the start)
        game.crierCalls?.delete(id);
        game.hud.say(id, "");
        Object.assign(player, { square: [one.square[0] + 3, one.square[1]], x: one.square[0] + 3.5, y: one.square[1] + 0.5, to: null, path: [], order: null });

        for (let k = 0; k < 12; k++) {
            game.advance(0.1);
        }

        return { words: document.querySelector(`.said[data-id="${id}"]`)?.textContent ?? null, latest: game.host.war.log.at(-1) };
    }, crier.id);

    expect(await page.evaluate(async () => (await import("/js/core/crying.js")).OPENINGS)).toContain(called.words.split("\n")[0]);
    expect(called.words).toContain("declared war on");
    await expect(page.locator(".said")).toBeVisible();
    expect((await talkTo(crier.id)).choices).toContain("Let's hear it.");
    await expect(talk.locator(".talk-line")).toContainText("five pieces of news");
    await talk.getByRole("button", { name: "Let's hear it." }).click();
    await expect(talk.locator(".talk-line")).toContainText("declared war");

    const heard = await page.evaluate(() => {
        const { game } = window.pellagos;

        return { cursor: game.memory.news, last: game.host.war.log.at(-1) };
    });

    // (Three heard: where they've heard to moved on past them, two still to hear)
    expect(heard.cursor.turn).toBe(heard.last.turn);
    await talk.getByRole("button", { name: "Go on." }).click();
    await expect(talk.getByRole("button", { name: "Is that all?" })).toBeVisible();

    const after = await page.evaluate(() => window.pellagos.game.memory.news);

    expect(after.seen).toBe(heard.cursor.seen + 2);
    await talk.getByRole("button", { name: "Is that all?" }).click();
    await talk.getByRole("button", { name: "Thank you." }).click();
    await expect(talk).toBeHidden();

    // All heard: none on the compass
    await expect.poll(() => page.evaluate(() => {
        window.pellagos.game.advance(0.6, { render: false });

        return document.getElementById("newsunread").hidden;
    })).toBe(true);

    // Talked to again: nothing new since
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;

        for (let k = 0; k < 20; k++) {
            game.advance(0.1, { render: false });
        }

        return game.talking;
    })).toBeFalsy();
    expect((await talkTo(crier.id)).choices).not.toContain("Let's hear it.");
    await expect(talk.locator(".talk-line")).toContainText(/Nothing new|Not a word more|none since/);
});

test("asked, a crier tells of the places round the town still to be found, two the first time and then one a talk, which way each is from the town; each written in the journal and drawn on the world map as a circle round about it, till it's found", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=2");

    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.advance(0.1, { render: false });
    });
    expect(await playUntil(page, () => {
        const { game } = window.pellagos;

        return game.avatars.has(`crier:${game.world.start.id}`);
    }, { seconds: 90 })).toBe(true);

    const id = await page.evaluate(() => `crier:${window.pellagos.game.world.start.id}`);
    const talkTo = () => page.evaluate((id) => {
        const { game } = window.pellagos;
        const one = game.battle.actor(id);
        const player = game.battle.actor("player");

        Object.assign(player, { square: [one.square[0] + 2, one.square[1]], x: one.square[0] + 2.5, y: one.square[1] + 0.5, to: null, path: [], order: null });
        game.approaching = id;
        game.battle.command("player", { type: "approach", target: id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        return game.talking?.conversation.choices.map(({ text }) => text) ?? [];
    }, id);
    const talk = page.locator(".talk");
    const ask = "What's said of the country round about?";

    // Asked: the nearest place still to be found, which way it is from the town, the quill heard
    // as it's written in the journal
    const before = await page.evaluate(() => {
        const { game } = window.pellagos;
        const heard = [];
        const play = game.sound.play.bind(game.sound);

        game.sound.play = (name, options) => (heard.push(name), play(name, options));
        window.quills = heard;

        return game.memory.heard ?? [];
    });

    expect(before).toEqual([]);
    expect(await talkTo()).toContain(ask);
    await talk.getByRole("button", { name: ask }).click();
    await expect(talk.locator(".talk-line")).toContainText(/(north|south|east|west)[a-z-]* of town/);

    const first = await page.evaluate(() => {
        const { game } = window.pellagos;
        const [one] = game.memory.heard;
        const place = game.world.plan.sites.find(({ id }) => id === one.id) ?? game.world.plan.camps.find(({ id }) => id === one.id);
        const start = game.world.start;

        return { heard: game.memory.heard, place: { id: place.id, at: place.at }, far: Math.hypot(place.at[0] - start.at[0], place.at[1] - start.at[1]), found: game.explored.sighted(...place.at), quills: window.quills.filter((name) => name === "quill").length, town: start.id };
    });

    expect(first.heard).toHaveLength(1);
    expect(first.heard[0].town).toBe(first.town);
    expect(first.far).toBeLessThanOrEqual(2000);
    expect(first.found).toBe(false);
    expect(first.quills).toBe(1);

    // The first time, a second; and no more this talk
    await talk.getByRole("button", { name: "What else is said?" }).click();
    expect(await page.evaluate(() => window.pellagos.game.memory.heard.length)).toBe(2);
    await expect(talk.getByRole("button", { name: "What else is said?" })).toHaveCount(0);
    await talk.getByRole("button", { name: "I'll go and see for myself." }).click();
    await expect(talk).toBeHidden();

    // In the journal, as it was said, who said it, and which way; on the world map, a circle round
    // about each, the place inside it
    await page.evaluate(() => window.pellagos.game.toggleJournal());
    await expect(page.locator(".journal-heard")).toHaveCount(2);
    await expect(page.locator(".journal-heard-from").first()).toContainText(/The crier in .* · About [0-9.]+ (k?m) /);

    const circles = await page.evaluate((place) => {
        const { heard } = window.pellagos.game.worldMapView();

        return heard.map(({ x, z, radius, hell }) => ({ inside: Math.hypot(x - place.at[0], z - place.at[1]) < radius, hell }));
    }, first.place);

    expect(circles).toHaveLength(2);
    expect(circles.some(({ inside }) => inside)).toBe(true);
    expect(circles.every(({ hell }) => !hell)).toBe(true);

    // Found (been near it): its circle gone, marked found in the journal
    const found = await page.evaluate((place) => {
        const { game } = window.pellagos;

        game.explored.visit(place.at[0], place.at[1]);

        return { circles: game.worldMapView().heard.length, icon: game.worldMapView().icons.some(({ id }) => id === place.id) };
    }, first.place);

    expect(found.circles).toBe(1);
    expect(found.icon).toBe(true);
    await page.evaluate(() => window.pellagos.game.toggleJournal());
    await page.evaluate(() => window.pellagos.game.toggleJournal());
    await expect(page.locator(".journal-heard.found")).toHaveCount(1);

    // Talked to again: one more, then no more this talk
    await page.evaluate(() => window.pellagos.game.toggleJournal());
    expect(await talkTo()).toContain(ask);
    await talk.getByRole("button", { name: ask }).click();
    expect(await page.evaluate(() => window.pellagos.game.memory.heard.length)).toBe(3);
    await expect(talk.getByRole("button", { name: "What else is said?" })).toHaveCount(0);
});

test("a fingerpost stands by the town's main road out, past its edge, on squares it blocks, its boards lettered with the nearest towns", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    const post = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const piece = game.world.town.pieces.find(({ name }) => name === "signpost");
        const [ox, oy] = game.world.origin;
        const { at, width, height } = game.world.stamp;
        const drawn = [];

        session.view.scene.traverse((node) => {
            if (node.isMesh && node.material.name?.startsWith("finger ")) {
                drawn.push(node.material.name);
            }
        });

        return {
            at: [piece.x + ox, piece.y + oy],
            outside: piece.x + ox < at[0] || piece.y + oy < at[1] || piece.x + ox >= at[0] + width || piece.y + oy >= at[1] + height,
            blocked: game.world.maps.town.squares.blocked(piece.x + ox, piece.y + oy),
            boards: piece.boards.map(({ name, km }) => ({ name, km })),
            nearest: game.world.plan.places
                .filter((place) => place !== game.world.start && ["town", "city", "capital"].includes(place.kind))
                .sort((a, b) => Math.hypot(a.at[0] - piece.x - ox, a.at[1] - piece.y - oy) - Math.hypot(b.at[0] - piece.x - ox, b.at[1] - piece.y - oy))
                .slice(0, 3)
                .map(({ name }) => name),
            drawn: drawn.sort(),
        };
    });

    expect(post.outside).toBe(true);
    expect(post.blocked).toBe(true);
    expect(post.boards.map(({ name }) => name)).toEqual(post.nearest);
    expect(post.boards.every(({ km }) => km > 0)).toBe(true);
    expect(post.drawn).toEqual(post.nearest.flatMap((name) => [`finger ${name}`, `finger ${name} back`]).sort());
});

test("a ford is marked to be seen: stepping stones across it and a fallen trunk in the woods, its banks trodden bare, in no one's way, and a row of stones across it on the minimap", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // (Beside the ford in the woods south of the town: test/navigation.test.js's)
    const ford = await page.evaluate(() => {
        const { game } = window.pellagos;
        const map = game.world.maps.town;
        const found = map.waters.fords().sort((a, b) => Math.hypot(a.at[0] - 3112.5, a.at[1] - 4374.5) - Math.hypot(b.at[0] - 3112.5, b.at[1] - 4374.5))[0];
        const [[ax, ay], [bx, by]] = found.banks;
        const long = Math.hypot(bx - ax, by - ay);
        const [x, y] = [Math.floor(ax - ((bx - ax) / long) * 3), Math.floor(ay - ((by - ay) / long) * 3)];
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
        game.avatars.get("player").place(x + 0.5, y + 0.5, player.facing);
        game.previous.set("player", { x: player.x, y: player.y });

        return { at: found.at, banks: found.banks, bank: [x, y] };
    });

    expect(await playUntil(page, () => {
        let found = false;

        window.pellagos.session.view.scene.traverse((node) => (found ||= node.name === "fords"));

        return found;
    }, { seconds: 60 })).toBe(true);

    const seen = await page.evaluate(({ at, banks, bank }) => {
        const { game, session } = window.pellagos;
        const map = game.world.maps.town;
        const meshes = [];

        session.view.scene.traverse((node) => node.name === "fords" && meshes.push(node));

        // (The stones over the water: walked through, the ford's squares open; the bank trodden bare)
        const middle = [Math.floor(at[0]), Math.floor(at[1])];

        return {
            near: meshes.some((mesh) => {
                mesh.updateWorldMatrix(true, false);
                mesh.geometry.computeBoundingBox();

                const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);

                return box.min.x < at[0] && box.max.x > at[0] && box.min.z < at[1] && box.max.z > at[1];
            }),
            open: !map.squares.blocked(...middle),
            trodden: map.squares.ground(...bank),
            road: game.world.maps.town.landAt(...bank).road,
            wade: map.wades?.(...middle) ?? null,
            banks: banks.length,
        };
    }, ford);

    expect(seen.near).toBe(true);
    expect(seen.open).toBe(true);
    expect(seen.trodden).toBe(1);
    expect(seen.road).toBe(null);
    expect(seen.banks).toBe(2);

    // On the minimap: a row of pale stones across the river (its picture of the world round the
    // player, four pixels to the metre: painted a step at a time, so played on till it's there)
    const minimap = await page.evaluate(({ at }) => {
        const { game } = window.pellagos;
        const covers = () => {
            const patch = game.minimap.patch;

            return patch && at[0] > patch.x + 2 && at[1] > patch.z + 2 && at[0] < patch.x + patch.image.width / 4 - 2 && at[1] < patch.z + patch.image.height / 4 - 2 && !game.minimap.painting;
        };

        for (let k = 0; k < 400 && !covers(); k++) {
            game.minimap.drawn = -Infinity;
            game.advance(0.05);
        }

        const { x, z, image } = game.minimap.patch;
        const pixels = image.getContext("2d").getImageData(Math.round((at[0] - x) * 4) - 8, Math.round((at[1] - z) * 4) - 8, 17, 17).data;
        let pale = 0;

        for (let k = 0; k < pixels.length; k += 4) {
            pale += pixels[k] > 200 && pixels[k + 1] > 190 && pixels[k + 2] > 160 ? 1 : 0;
        }

        return { covered: covers(), pale };
    }, ford);

    expect(minimap.covered).toBe(true);
    expect(minimap.pale).toBeGreaterThan(10);
});

// (How often each is posed goes by how tall they look on the screen, in its pixels: at the
// screen's own, as the game's drawn, not the half the others are drawn at: playwright.config.js)
test.describe("drawn at the screen's own pixels", () => {
    test.use({ deviceScaleFactor: 1 });

    test("the town's guards stand at its ways out under its people's banner, and talk of the town and the war; a people at war with the player's attacks them", async ({ page }) => {
        await playing(page, "/?play&seed=2");

        // Out as soon as the game's played: guards at the roads out, a patrol going round, a banner by
        // each road (drawn over a few seconds, a step at a time; before the townsfolk out too)
        await page.evaluate(() => {
            const { game } = window.pellagos;

            game.stop();
            Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
            game.advance(0.1, { render: false });
        });
        expect(await playUntil(page, () => {
            const { game } = window.pellagos;
            const soldiers = game.battle.actors.filter(({ kind }) => kind === "soldier");

            return soldiers.length > 0 && soldiers.every(({ id }) => game.avatars.has(id));
        })).toBe(true);

        const out = await page.evaluate(() => {
            const { game } = window.pellagos;
            const soldiers = game.battle.actors.filter(({ kind }) => kind === "soldier");

            return {
                soldiers: soldiers.map(({ id, team, name, weapon }) => ({ id, team, name, weapon, drawn: game.avatars.has(id) })),
                banners: game.banners.group.children.length,
                town: game.host.war.town(game.world.start.id).name,
            };
        });

        expect(out.soldiers.length).toBeGreaterThanOrEqual(5);
        expect(out.soldiers.every(({ team, drawn }) => team === "human" && drawn)).toBe(true);
        expect(out.soldiers.map(({ name }) => name)).toContain("Human guard");
        expect(out.soldiers.map(({ name }) => name)).toContain("Human patrol");
        expect(out.banners).toBeGreaterThanOrEqual(1);

        // Tapping a guard: the player walks up to talk to them, and they tell of their town
        const guard = out.soldiers.find(({ id }) => id.endsWith("/guard-0"));
        const tapped = await page.evaluate((id) => {
            const { game, session } = window.pellagos;
            const soldier = game.battle.actor(id);
            const player = game.battle.actor("player");

            // (A few steps out in front of them: they face out of the town)
            const [x, y] = [soldier.square[0] + Math.round(Math.sin(soldier.post) * 4), soldier.square[1] + Math.round(Math.cos(soldier.post) * 4)];

            Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
            game.avatars.get("player").place(x + 0.5, y + 0.5, player.facing);
            game.previous.set("player", { x: player.x, y: player.y });
            game.advance(0.5);

            const spot = session.view.toScreen(game.avatars.get(id).point(0.6));

            game.tap(spot.x, spot.y, { time: performance.now() + 9000 });

            const order = player.order?.type ?? null;

            game.advance(6);

            return { order, talking: soldier.talkingTo };
        }, guard.id);

        expect(tapped).toEqual({ order: "approach", talking: "player" });

        // (Another of them drawn in full besides the guard, the nearest: each body's built a step at
        // a time, and on a slower machine it may not be yet)
        expect(await playUntil(page, () => {
            const { game } = window.pellagos;

            return game.battle.actors.some(({ id, kind }) => kind === "soldier" && !id.endsWith("/guard-0") && game.avatars.get(id)?.object.visible && game.avatars.get(id).constructor.name !== "CrowdAvatar");
        }, { seconds: 10 })).toBe(true);

        // Posed as often as each is seen (Avatar.every): the player, and the guard they're talking to,
        // near (the camera in close), every frame; those drawn in full out of view seldom; and so
        // some less often than every frame (those in their crowd, past the reach from the camera,
        // posed on the graphics card). One drawn in full is put out of view for it, the nearest but
        // the guard, a few steps behind the camera, and back where they were after: which of the
        // rest are out of view is where the patrol's round has got to, and on a slower machine,
        // played a little longer before it's stopped, it can be none of them
        const posing = await page.evaluate(async (id) => {
            const { game, session } = window.pellagos;
            const { POSING } = await import("/js/world/avatar.js");

            session.view.zoom(0.1);
            game.advance(0.25);

            const me = game.battle.actor("player");
            const inFull = (one) => one.kind === "soldier" && game.avatars.get(one.id)?.object.visible && game.avatars.get(one.id).constructor.name !== "CrowdAvatar";
            const aside = game.battle.actors.filter((one) => inFull(one) && one.id !== id).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
            const was = { x: aside.x, y: aside.y, square: [...aside.square], facing: aside.facing, path: [...(aside.path ?? [])], to: aside.to, order: aside.order };
            const { camera } = session.view;
            const look = camera.getWorldDirection(camera.position.clone()).setY(0).normalize();
            const [bx, by] = [camera.position.x - look.x * 3, camera.position.z - look.z * 3];

            Object.assign(aside, { x: bx, y: by, square: [Math.floor(bx), Math.floor(by)], path: [], to: null, order: null });
            game.avatars.get(aside.id).place(bx, by, aside.facing);
            game.previous.set(aside.id, { x: bx, y: by });

            const shown = game.battle.actors
                .filter((one) => one.kind === "soldier" && game.avatars.get(one.id)?.object.visible && game.avatars.get(one.id).constructor.name !== "CrowdAvatar")
                .map((one) => game.avatars.get(one.id));
            const unseen = shown.filter(({ object, character }) => session.view.heightOnScreen(object.position, character.height) === 0);

            // (Posed in a frame with the view as it is now. Any not posed in it, gone or past where
            // the player's drawn by then, kept how often they were posed before: left out)
            for (const avatar of unseen) {
                avatar.every = null;
            }

            game.advance(1 / 60, { render: false });

            const posed = unseen.filter(({ every }) => every !== null);
            const result = { player: game.avatars.get("player").every, guard: game.avatars.get(id).every, aside: game.avatars.get(aside.id).every, unseen: posed.map(({ every }) => every), seldom: POSING.unseen, fewer: shown.filter(({ every }) => every > 1).length };

            Object.assign(aside, was);
            game.avatars.get(aside.id).place(was.x, was.y, was.facing);
            game.previous.set(aside.id, { x: was.x, y: was.y });

            return result;
        }, guard.id);

        expect(posing.player).toBe(1);
        expect(posing.guard).toBe(1);
        expect(posing.aside).toBe(posing.seldom);
        expect(posing.fewer).toBeGreaterThan(0);
        expect(posing.unseen.every((every) => every === posing.seldom)).toBe(true);

        const talk = page.locator(".talk");

        await expect(talk).toBeVisible();
        await expect(talk.locator(".talk-name")).toHaveText("Human guard");
        await expect(talk.locator(".talk-title")).toHaveText(`Of the guard of ${out.town}`);
        await talk.getByRole("button", { name: /Who holds this place/ }).click();
        await expect(talk.locator(".talk-line")).toContainText(`${out.town} is ours: the Humans hold it`);
        await talk.getByRole("button", { name: /How goes the war/ }).click();
        await expect(talk.locator(".talk-line")).toContainText(/an uneasy peace/i);
        await page.evaluate(() => window.pellagos.game.start());
        await page.keyboard.press("Escape");
        await expect(talk).toBeHidden();

        // At midnight the guards with a hand free carry lit torches in place of their shields
        // (world/carried.js), and everyone sees less far out of the light (core/light.js); by day the
        // torches are put away
        const night = await page.evaluate(() => {
            const { game } = window.pellagos;
            const war = game.host.war;
            const [turn, clock] = [war.turn, war.clock];
            const torches = () => game.battle.actors.filter(({ id, kind }) => kind === "soldier" && game.avatars.get(id)?.character.torch).length;

            game.stop();
            Object.assign(war, { turn: 41, clock: 30000 });
            game.advance(0.05, { render: false });

            const dark = { torches: torches(), lights: game.carried.lights().length, sky: game.battle.light?.sky ?? 1 };

            // (The Light spell, learnt and cast: its globe over the player's shoulder, lighting the
            // dark round them for the rules too)
            game.host.players.get(game.me).progress.learn("light");

            const cast = game.act("light", "self");

            for (let k = 0; k < 12; k++) {
                game.advance(0.1, { render: false });
            }

            const me = game.battle.actor(game.me);

            Object.assign(dark, { cast: cast.ok, globes: game.globes.lights().length, globe: game.battle.light.lit.some(([x, y, reach2]) => Math.abs(x - me.x) < 1 && Math.abs(y - me.y) < 1 && reach2 === 144) });

            Object.assign(war, { turn, clock });
            game.advance(0.05, { render: false });

            return { dark, day: { torches: torches(), lights: game.carried.lights().length, light: game.battle.light } };
        });

        expect(night.dark.torches).toBeGreaterThan(0);
        expect(night.dark.lights).toBeGreaterThan(0);
        expect(night.dark.sky).toBeLessThan(1);
        expect([night.dark.cast, night.dark.globes, night.dark.globe]).toEqual([true, 1, true]);
        expect(night.day).toEqual({ torches: 0, lights: 0, light: null });

        // Taken by the orcs, at war with the humans: orcish soldiers now, under their banner, and they come for the player
        const war = await page.evaluate(() => {
            const { game } = window.pellagos;
            const { war } = game.host;

            game.stop();
            const home = war.town(game.world.start.id);

            home.owner = "orc";
            war.known.push("human|orc");
            war.relations["human|orc"] = { state: "hostile", since: war.turn };
            game.host.lookAt = 0;

            const player = game.battle.actor("player");
            let [after, hurt] = [false, false];

            for (let k = 0; k < 60 && !hurt; k++) {
                game.advance(0.1, { render: false });

                const soldiers = game.battle.actors.filter(({ kind }) => kind === "soldier");

                after ||= soldiers.some(({ target }) => target === "player");
                hurt ||= player.hp < player.maxHp || player.dead;
            }

            const soldiers = game.battle.actors.filter(({ kind }) => kind === "soldier");

            return { teams: [...new Set(soldiers.map(({ team }) => team))], banner: game.banners.towns.get(home.id)?.people, after, hurt };
        });

        expect(war.teams).toEqual(["orc"]);
        expect(war.banner).toBe("orc");
        expect(war.after).toBe(true);
        expect(war.hurt).toBe(true);

        // (Bars over them, the player's enemies, once they're drawn: over a few seconds, a step at a time)
        expect(await playUntil(page, () => {
            const { game } = window.pellagos;

            return game.battle.actors.some(({ id, kind }) => kind === "soldier" && game.hud.tracked.has(id));
        })).toBe(true);
    });
});

test("an enemy army's camp near the player is pitched within its stockade, tents, fire, banner and its guard as sentries and its scout; struck once the player's far; razed in the war, the game goes on", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    // An orc army's camp just outside the town, at war with the humans; the player by it
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const home = war.town(game.world.start.id);
        const [mx, my] = game.world.stamp.middle;
        const at = [mx + 110, my + 5];
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = 3;
        war.camps.push({ id: "camp-900", realm: "orc", at, guard: 6, built: 0, done: 0, toward: home.id, used: 1e6, skirmished: 1e6 });
        Object.assign(player, { square: [Math.floor(at[0] - 3), Math.floor(at[1] + 10)], to: null, path: [], hp: 5000, maxHp: 5000 });
        Object.assign(player, { x: player.square[0] + 0.5, y: player.square[1] + 0.5 });
        game.advance(0.1);
    });

    // (Its sentries drawn over a few seconds, a step at a time, after the town's guards)
    await playUntil(page, () => {
        const { game } = window.pellagos;

        return (game.host.camps.get("camp-900")?.ids ?? []).some((id) => game.avatars.has(id));
    });

    const camp = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const sentries = game.host.camps.get("camp-900")?.ids ?? [];

        // (Its stockade round it, its wall over the world's squares)
        const stockade = game.host.war.stockade("camp-900");
        const [wx, wy] = stockade.sections[0].wall[0];
        const chunk = game.world.maps.town.chunkAt(wx, wy);

        return {
            drawn: game.camps.size,
            stockade: game.stockades.size,
            wall: chunk.solid[(wy - chunk.y0) * 64 + (wx - chunk.x0)],
            tents: game.camps.camps.get("camp-900")?.object.children.length ?? 0,
            banner: game.banners.group.children.some(({ name }) => name === "banner:camp:camp-900"),
            sentries: sentries.map((id) => ({ name: game.battle.actor(id).name, drawn: game.avatars.has(id), hostile: game.battle.hostile(game.battle.actor(id), player) })),
        };
    });

    expect(camp.drawn).toBe(1);
    expect(camp.stockade).toBe(1);
    expect(camp.wall).toBe(1);
    expect(camp.tents).toBeGreaterThan(5);
    expect(camp.banner).toBe(true);
    // (Its guard of 6: five sentries round its fire, and its scout out on its round)
    expect(camp.sentries.map(({ name }) => name)).toEqual([...Array(5).fill("Orcish sentry"), "Orcish scout"]);
    expect(camp.sentries.every(({ hostile }) => hostile)).toBe(true);
    expect(camp.sentries.some(({ drawn }) => drawn)).toBe(true);

    // Far off: the camp struck, its tents down
    const struck = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [mx, my] = game.world.stamp.middle;

        Object.assign(player, { square: [Math.floor(mx - 250), Math.floor(my)], x: Math.floor(mx - 250) + 0.5, y: Math.floor(my) + 0.5, to: null, path: [] });
        game.advance(1.5);

        return { drawn: game.camps.size, pitched: game.host.camps.size };
    });

    expect(struck).toEqual({ drawn: 0, pitched: 0 });

    // Razed in the war, far off: the game goes on, nothing to draw again under it (as there is under
    // a fortification razed)
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));

    const razed = await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const before = game.battle.time;

        war.loss("camp-900", 6, { by: "human" });
        game.advance(0.5);

        return { gone: !war.camp("camp-900"), told: war.log.some(({ type, camp }) => type === "razed" && camp === "camp-900"), went: game.battle.time > before };
    });

    expect(razed).toEqual({ gone: true, told: true, went: true });
    expect(errors).toEqual([]);
});

test("an enemy army's camp stormed near the player by their people's reserve: its army holding it, its archers up on its walkway, its palisade hacked at (its stakes stood in for, a bar over them) and broken open; the player told", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));

    // An orc army at its camp just outside the town, at war with the humans, and the humans'
    // reserve come to storm it; the player looking on, all that's said kept
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const [mx, my] = game.world.stamp.middle;
        const at = [mx + 110, my + 5];
        const from = [at[0] - 50, at[1] + 4];
        const player = game.battle.actor("player");
        const message = game.hud.message;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = 3;
        war.camps.push({ id: "camp-900", realm: "orc", at, guard: 0, built: 0, done: 0, toward: null, used: 1e6, skirmished: 1e6, breaches: 0, broken: [], troubled: null });
        war.forces.push({ id: "force-900", realm: "orc", kind: "army", size: 10, at: [...at], path: [[...at]], leg: 0, target: null, home: war.realm("orc").seat, mission: "camp", about: [...at], camp: "camp-900", orders: null, went: 10, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 });
        war.forces.push({ id: "force-901", realm: "human", kind: "reserve", size: 14, at: [...from], path: [[...from], [...at]], leg: 0, target: "force-900", home: war.realm("human").seat, mission: "defend", about: null, since: 0 });
        Object.assign(player, { square: [Math.floor(at[0] - 70), Math.floor(at[1] - 15)], to: null, path: [], hp: 5000, maxHp: 5000 });
        Object.assign(player, { x: player.square[0] + 0.5, y: player.square[1] + 0.5 });
        window.said = [];
        game.hud.message = (text, seconds) => {
            window.said.push(text);
            message.call(game.hud, text, seconds);
        };

        // Whether any of its archers or casters has been seen up on its walkway, standing on
        // its boards, at any step of the storm; they're hardy enough to stay up there however it
        // goes until they're drawn (soldiers are drawn a little each frame, nearest first)
        const advance = game.advance;
        const town = game.world.maps.town;

        window.walked = false;
        game.advance = function (...args) {
            const out = advance.apply(this, args);

            window.walked ||= (game.host.armies.get("force-900")?.ids ?? []).some((id) => {
                const actor = game.battle.actor(id);
                const avatar = game.avatars.get(id);

                if (actor && ["archer", "caster"].includes(actor.formation?.role) && actor.maxHp < 5000) {
                    Object.assign(actor, { hp: 5000, maxHp: 5000 });
                }

                return Boolean(actor && !actor.dead && ["archer", "caster"].includes(actor.formation?.role) && town.squares.raised(Math.floor(actor.x), Math.floor(actor.y)) && avatar && avatar.object.position.y - town.ground.heightAt(actor.x, actor.y) > 1.3);
            });

            return out;
        };
        game.advance(0.1);
    });

    // Its wall hacked at: the section's stakes stood in for in the battle, a bar over them
    expect(await playUntil(page, () => {
        const { game } = window.pellagos;
        const stakes = game.battle.actors.find(({ kind }) => kind === "stakes");

        return Boolean(stakes && game.avatars.has(stakes.id) && game.hud.tracked.has(stakes.id));
    })).toBe(true);

    // Hacked through: broken open in the war, drawn so, the stand-in let go; the player told
    const breached = await page.evaluate(() => {
        const { game } = window.pellagos;
        const stakes = game.battle.actors.find(({ kind }) => kind === "stakes");

        stakes.hp = 1;

        return stakes.id;
    });

    expect(await playUntil(page, () => window.pellagos.game.host.war.camp("camp-900")?.broken.length === 1)).toBe(true);

    const after = await page.evaluate((id) => {
        const { game } = window.pellagos;

        game.advance(0.2);

        return {
            broken: game.host.war.camp("camp-900").broken.length,
            drawn: game.stockades.drawn?.get("camp-900")?.broken.size ?? null,
            stakes: game.avatars.has(id) || Boolean(game.battle.actor(id)),
            said: window.said.filter((text) => /palisade|breach/.test(text)),
        };
    }, breached);

    expect(after.broken).toBe(1);
    expect(after.drawn).toBe(1);
    expect(after.stakes).toBe(false);
    // (Their people's reserve storming it: the player's own, through it)
    expect(after.said).toContain("We're hacking at the orcish camp's palisade: break it open!");
    expect(after.said).toContain("The orcish palisade is breached: we're through!");

    // Its archers and casters up on its walkway, drawn standing on its boards
    expect(await playUntil(page, () => window.walked, { seconds: 90 })).toBe(true);
    expect(errors).toEqual([]);
});

test("an army in the field near the player, in its line of battle: the player told of it, its soldiers drawn, marching where the war has it going; the orcs' their enemies, their own people's their friends", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    // An orc army out east of the player's town, at war with the humans, and the humans' own west
    // of it; the player in the town between them
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const [mx, my] = game.world.stamp.middle;
        const field = (id, realm, at, to, size) => war.forces.push({ id, realm, kind: "army", size, at, path: [at, to], leg: 0, target: null, home: war.realm(realm).seat, mission: "camp", about: to, camp: null, orders: null, went: size, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 });

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = 3;
        window.said = [];

        const message = game.hud.message.bind(game.hud);

        game.hud.message = (text, ...rest) => {
            window.said.push(text);

            return message(text, ...rest);
        };

        field("force-900", "orc", [mx + 230, my + 40], [mx + 230, my - 160], 12);
        field("force-901", "human", [mx - 230, my], [mx - 230, my - 100], 8);
        game.advance(0.5);
    });

    // (Both met, and their soldiers drawn over a few seconds)
    const drawn = () => {
        const { game } = window.pellagos;
        const ids = ["force-900", "force-901"].flatMap((id) => game.host.armies.get(id)?.ids ?? []);

        return ids.length === 20 && ids.every((id) => game.avatars.has(id));
    };

    expect(await playUntil(page, drawn, { seconds: 60 })).toBe(true);

    const met = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const side = (id) => game.host.armies.get(id).ids.map((each) => game.battle.actor(each));
        const formation = game.battle.formations[game.host.armies.get("force-900").formation];

        return {
            said: window.said.filter((text) => /in the field near you/.test(text)).sort(),
            orcs: side("force-900").map((actor) => ({ name: actor.name, hostile: game.battle.hostile(actor, player), lined: actor.formation?.id === "army-force-900" })),
            ours: side("force-901").map((actor) => ({ name: actor.name, hostile: game.battle.hostile(actor, player) })),
            from: [...formation.anchor],
        };
    });

    expect(met.said).toEqual(["Our army is in the field near you, 8 strong.", "The Orcish army is in the field near you, 12 strong."]);
    expect(met.orcs.every(({ name, hostile, lined }) => name === "Orcish soldier" && hostile && lined)).toBe(true);
    expect(met.ours.every(({ name, hostile }) => name === "Human soldier" && !hostile)).toBe(true);

    // (Marching north, where it's going, at its pace)
    await playUntil(page, () => false, { seconds: 5 });

    const now = await page.evaluate(() => {
        const { game } = window.pellagos;

        return [...game.battle.formations[game.host.armies.get("force-900").formation].anchor];
    });

    expect(now[1]).toBeLessThan(met.from[1] - 3);
});

test("an army's supply wagon near the player: its ox and wagon drawn laden with supplies, its guards of its people beside it, making for its army; a supply depot by them pitched with its stores", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    // An orc army standing far out east of the player's town, at war with the humans, a supply
    // wagon on its way to it from just outside the town; an orc depot there too; the player by them
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const [mx, my] = game.world.stamp.middle;
        const seat = war.realm("orc").seat;
        const at = [mx + 520, my + 30];
        const from = [mx + 130, my + 30];
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = 3;
        war.forces.push(
            { id: "force-900", realm: "orc", kind: "army", size: 20, at: [...at], path: [[...at]], leg: 0, target: null, home: seat, mission: "regroup", about: null, camp: null, orders: null, went: 20, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 },
            { id: "force-901", realm: "orc", kind: "supply", size: 2, at: [...from], path: [[...from], [...at]], leg: 0, target: "force-900", home: seat, mission: "army", about: null, since: 0 },
        );
        war.depots.push({ id: "depot-900", realm: "orc", at: [mx + 140, my - 40], guard: 6, built: 0, done: 0, level: 2, toward: null, used: 1e6, by: null });
        Object.assign(player, { square: [Math.floor(mx + 110), Math.floor(my + 15)], to: null, path: [], hp: 5000, maxHp: 5000 });
        Object.assign(player, { x: player.square[0] + 0.5, y: player.square[1] + 0.5 });
        game.advance(0.1);
    });

    // (Drawn over a few seconds, a step at a time: the wagon, its guards, and the depot's sentries)
    const drawn = () => {
        const { game } = window.pellagos;
        const met = game.host.supplies.get("force-901");
        const ids = [...(met?.ids ?? []), ...(met ? [met.wagon] : []), ...(game.host.camps.get("depot-900")?.ids ?? [])];

        return ids.length === 9 && ids.every((id) => game.avatars.has(id));
    };

    expect(await playUntil(page, drawn, { seconds: 60 })).toBe(true);

    const met = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const supply = game.host.supplies.get("force-901");
        const avatar = game.avatars.get(supply.wagon);
        const meshes = () => {
            let count = 0;

            avatar.wagon.object.traverse((node) => (count += node.isMesh ? 1 : 0));

            return count;
        };
        const laden = meshes();

        // (What it's laden with, against it empty)
        avatar.wagon.setLoad(null);

        const empty = meshes();

        avatar.wagon.setLoad("supplies");

        const depot = game.camps.camps.get("depot-900")?.object;

        return {
            load: game.host.wagons.get(supply.wagon).load,
            ox: avatar.id,
            wheels: avatar.wagon.wheels.length,
            laden,
            empty,
            guards: supply.ids.map((id) => ({ name: game.battle.actor(id).name, hostile: game.battle.hostile(game.battle.actor(id), player) })),
            stores: depot?.children.filter(({ name }) => name === "stores").length ?? 0,
            banner: game.banners.group.children.some(({ name }) => name === "banner:camp:depot-900"),
            sentries: game.host.camps.get("depot-900").ids.map((id) => game.battle.actor(id).name),
            from: game.battle.actor(supply.wagon).x,
        };
    });

    expect([met.load, met.ox, met.wheels]).toEqual(["supplies", "ox", 4]);
    expect(met.laden).toBeGreaterThan(met.empty);
    expect(met.guards).toEqual([
        { name: "Orcish wagon guard", hostile: true },
        { name: "Orcish wagon guard", hostile: true },
    ]);
    expect(met.stores).toBe(2);
    expect(met.banner).toBe(true);
    expect(met.sentries).toEqual(Array(6).fill("Orcish sentry"));

    // (Making east, for its army)
    await playUntil(page, () => false, { seconds: 5 });
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("force-901/wagon").x)).toBeGreaterThan(met.from + 2);
});

test("an orc camp near the player sends its scout out on its round and its skirmishers after the player's people's army met there; reinforcements on their way to that army join its line", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // An orc camp out east of the player's town, at war with the humans; the humans' army standing
    // north of it, and reinforcements on their way to it; the player between them
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const [mx, my] = game.world.stamp.middle;
        const seat = war.realm("human").seat;
        const at = [mx + 230, my - 60];
        const from = [mx + 150, my - 100];
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = 3;
        window.said = [];

        const message = game.hud.message.bind(game.hud);

        game.hud.message = (text, ...rest) => {
            window.said.push(text);

            return message(text, ...rest);
        };

        war.camps.push({ id: "camp-900", realm: "orc", at: [mx + 220, my + 60], guard: 6, built: 0, done: 0, toward: null, used: 1e6, skirmished: war.turn });
        war.forces.push(
            { id: "force-900", realm: "human", kind: "army", size: 12, at: [...at], path: [[...at]], leg: 0, target: null, home: seat, mission: "regroup", about: null, camp: null, orders: null, went: 12, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 },
            { id: "force-901", realm: "human", kind: "reinforcement", size: 5, at: [...from], path: [[...from], [...at]], leg: 0, target: "force-900", home: seat, mission: null, about: null, since: 0 },
        );
        Object.assign(player, { square: [Math.floor(mx + 170), Math.floor(my)], to: null, path: [], hp: 5000, maxHp: 5000 });
        Object.assign(player, { x: player.square[0] + 0.5, y: player.square[1] + 0.5 });
        game.advance(0.1);
    });

    // (The camp's sentries and scout, the army and the reinforcements, drawn over a few seconds)
    const drawn = () => {
        const { game } = window.pellagos;
        const ids = [...(game.host.camps.get("camp-900")?.ids ?? []), ...["force-900", "force-901"].flatMap((id) => game.host.armies.get(id)?.ids ?? [])];

        return ids.length === 23 && ids.every((id) => game.avatars.has(id));
    };

    expect(await playUntil(page, drawn, { seconds: 60 })).toBe(true);

    const met = await page.evaluate(() => {
        const { game } = window.pellagos;
        const scout = game.battle.actor("camp-900/scout");

        return {
            scout: { name: scout.name, round: scout.patrol.length, hostile: game.battle.hostile(scout, game.battle.actor("player")) },
            said: window.said.filter((text) => /near you/.test(text)).sort(),
        };
    });

    expect(met.scout).toEqual({ name: "Orcish scout", round: 8, hostile: true });
    // (Their own people's reinforcements not told of: they're out of their towns every turn)
    expect(met.said).toEqual(["Our army is in the field near you, 12 strong."]);

    // Its skirmishers due: out, after the army, the player told
    await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { TURN_MS } = await import("/js/core/war/war.js");
        const war = game.host.war;

        war.camp("camp-900").skirmished = war.turn - 3;
        war.clock = TURN_MS - 500;
    });
    // (To be drawn: in full, or past the nearest few in their kind's crowd, once its figure's
    // made, however long that takes; the crowds' own drawing is the field battle's test)
    expect(await playUntil(page, () => {
        const { game } = window.pellagos;
        const [out] = game.host.skirmishers.values();

        return Boolean(out) && out.ids.every((id) => game.avatars.has(id) || game.enlisting.includes(id) || game.enlistees.has(id) || game.crowdWaiting.has(id));
    })).toBe(true);

    const out = await page.evaluate(() => {
        const { game } = window.pellagos;
        const [skirmish] = game.host.skirmishers.values();

        return { target: skirmish.target, names: skirmish.ids.map((id) => game.battle.actor(id).name), said: window.said.includes("Orcish skirmishers are out after our army!") };
    });

    expect(out).toEqual({ target: "force-900", names: ["Orcish skirmisher", "Orcish skirmisher"], said: true });

    // The reinforcements up with their army: each of them still standing in its line
    expect(await playUntil(page, () => !window.pellagos.game.host.war.force("force-901"), { seconds: 90 })).toBe(true);

    const joined = await page.evaluate(() => {
        const { game } = window.pellagos;
        const army = game.host.armies.get("force-900");

        return {
            size: game.host.war.force("force-900").size,
            lined: army.ids.filter((id) => game.battle.actor(id) && !game.battle.actor(id).dead).length,
            column: game.host.armies.has("force-901"),
        };
    });

    expect(joined.column).toBe(false);
    expect(joined.lined).toBe(joined.size);
    expect(joined.size).toBeGreaterThan(12);
});

test("the orcs' seat, its garrison put down by the player at war with them: its ruler and the captain of its guard make their last stand at its keep, drawn and told of; put down too, it falls, the orcs the humans' vassals", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // The player out in the orcs' seat, at war with them in the age of conquest, made too strong
    // to fall; the world about them got ready
    await page.evaluate(async () => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const seat = war.town(war.realm("orc").seat);
        const player = game.battle.actor("player");
        const [x, y] = [Math.floor(seat.at[0] + 30), Math.floor(seat.at[1] + 30)];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = 3;
        window.said = [];

        const message = game.hud.message.bind(game.hud);

        game.hud.message = (text, ...rest) => {
            window.said.push(text);

            return message(text, ...rest);
        };

        Object.assign(player, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, progress: null, hp: 1e6, maxHp: 1e6 });

        for (let k = 0; k < 8; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
    });

    // (Its soldiers out about the player)
    expect(await playUntil(page, () => (window.pellagos.game.host.mustered.get(window.pellagos.game.host.war.realm("orc").seat)?.ids.length ?? 0) > 0, { seconds: 30 })).toBe(true);

    // The last of its garrison put down by the player
    const strike = async (id) => {
        await page.evaluate((one) => {
            const { game } = window.pellagos;
            const actor = game.battle.actor(one);
            const player = game.battle.actor("player");

            window.striking = one;
            Object.assign(actor, { hp: 1 });
            Object.assign(player, { x: actor.square[0] + 1.5, y: actor.square[1] + 0.5, square: [actor.square[0] + 1, actor.square[1]], path: [], order: null, hp: 1e6, maxHp: 1e6 });
            game.host.command("player", { type: "engage", target: one });
        }, id);

        return playUntil(page, () => !window.pellagos.game.battle.actor(window.striking) || window.pellagos.game.battle.actor(window.striking).dead, { seconds: 20 });
    };
    const last = await page.evaluate(() => {
        const { game } = window.pellagos;
        const seat = game.host.war.realm("orc").seat;

        game.host.war.town(seat).garrison = 1;

        return game.host.mustered.get(seat).ids.find((id) => !game.battle.actor(id).dead);
    });

    await strike(last);

    // (Their last stand: drawn, and the player told)
    expect(await playUntil(page, () => {
        const { game } = window.pellagos;
        const out = game.host.leaders.get(game.host.war.realm("orc").seat);

        return Boolean(out) && out.ids.every((id) => game.avatars.has(id));
    }, { seconds: 60 })).toBe(true);

    const stand = await page.evaluate(() => {
        const { game } = window.pellagos;
        const realm = game.host.war.realm("orc");
        const out = game.host.leaders.get(realm.seat);

        return {
            ids: out.ids,
            names: out.ids.map((id) => game.battle.actor(id).name),
            ruler: `${realm.leader.title} ${realm.leader.name}`,
            said: window.said.some((text) => /make their last stand at its keep: put them down, and it's ours/.test(text)),
            owner: game.host.war.town(realm.seat).owner,
            overlord: realm.overlord,
        };
    });

    expect(stand.names).toEqual([stand.ruler, "Orcish captain of the guard"]);
    expect(stand.said).toBe(true);
    expect([stand.owner, stand.overlord]).toEqual(["orc", null]);

    // Put down too: the seat's fallen, the orcs the humans' vassals
    for (const id of stand.ids) {
        await strike(id);
    }

    expect(await playUntil(page, () => window.pellagos.game.host.war.realm("orc").overlord === "human", { seconds: 10 })).toBe(true);
    expect(await page.evaluate(() => window.said.some((text) => /has fallen! Its ruler and the captain of its guard put to the sword, the Orcs serve the Humans now\./.test(text)))).toBe(true);
});

test("an envoy on the road near the player goes by with their escort; struck down, they're waylaid, and the journal tells of the grudge", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    // An orcish envoy on the road just outside the town, at war with the humans; the player by them
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const [mx, my] = game.world.stamp.middle;
        const at = [mx + 90, my + 5];
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.forces.push({ id: "force-950", realm: "orc", kind: "envoy", size: 0, at: [...at], path: [at, [at[0] + 100, at[1]], [at[0] + 200, at[1]]], leg: 0, target: "elf", home: war.realm("orc").capital, mission: "alliance", about: null, since: war.turn });
        Object.assign(player, { square: [Math.floor(at[0] - 4), Math.floor(at[1] + 3)], to: null, path: [], hp: 5000, maxHp: 5000 });
        Object.assign(player, { x: player.square[0] + 0.5, y: player.square[1] + 0.5 });
        game.advance(0.1);
    });

    // (Drawn over a few frames, a step at a time, the nearest the player first)
    await playUntil(page, () => {
        const { game } = window.pellagos;

        return (game.host.envoys.get("force-950")?.ids ?? []).some((id) => game.avatars.has(id));
    });

    const met = await page.evaluate(() => {
        const { game } = window.pellagos;
        const party = game.host.envoys.get("force-950")?.ids ?? [];

        return party.map((id) => ({ id, name: game.battle.actor(id).name, drawn: game.avatars.has(id) }));
    });

    expect(met.map(({ name }) => name)).toEqual(["Orcish envoy", "Orcish escort", "Orcish escort"]);
    expect(met.some(({ drawn }) => drawn)).toBe(true);

    // Struck down: waylaid, and the player told
    const fell = await page.evaluate((id) => {
        const { game } = window.pellagos;
        const envoy = game.battle.actor(id);
        const player = game.battle.actor("player");

        envoy.hp = 1;
        Object.assign(player, { square: [envoy.square[0] + 1, envoy.square[1]], x: envoy.square[0] + 1.5, y: envoy.square[1] + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "engage", target: id });

        for (let k = 0; k < 20 && game.host.war.force("force-950"); k++) {
            game.advance(1);
        }

        // (What the player was told across the screen, as kept for the journal: before it's
        // played on as it is, when another message, a creature new in the bestiary, could follow it)
        const told = game.messages.map(({ text }) => text).join("\n");

        game.start();

        return { gone: !game.host.war.force("force-950"), grudge: game.host.war.realm("orc").standing.human ?? 0, told };
    }, met[0].id);

    expect(fell.gone).toBe(true);
    expect(fell.grudge).toBeLessThan(-5);
    expect(fell.told).toContain("envoy to the Elves has been struck down by the Humans");

    // The journal: the orcs bear the humans a grudge
    const journal = page.getByRole("dialog", { name: "Journal" });

    await page.keyboard.press("j");
    await expect(journal).toBeVisible();
    await expect(journal.locator(".journal-regard.grudge")).toContainText(["The Orcs bear you"]);
    await page.keyboard.press("Escape");
});

test("the journal keeps the last ten messages told across the screen, behind a button, the newest first, refusals left out; and the next time", async ({ page }) => {
    // (Played twice: more than the usual time)
    test.setTimeout(180000);
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);

    const continued = async () => {
        await title(page);
        await page.locator("#continuebutton").click();
        await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    };
    const journal = page.getByRole("dialog", { name: "Journal" });
    const rows = journal.locator(".journal-message");

    await continued();

    // Twelve told across the screen, and a refusal
    await page.evaluate(() => {
        const { hud } = window.pellagos.game;

        for (let k = 1; k <= 12; k++) {
            hud.message(`News number ${k}.`, 3);
        }

        hud.message("Can't do that.", 1.6);
    });

    // The journal shows itself first; its button, the last ten, the newest first
    await page.keyboard.press("j");
    await expect(journal).toBeVisible();
    await expect(journal.getByRole("heading", { name: "Standing" })).toBeVisible();
    await journal.getByRole("button", { name: "Messages" }).click();
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText("News number 12.");
    await expect(rows.first()).toContainText("just now");
    await expect(rows.last()).toContainText("News number 3.");
    await expect(journal).not.toContainText("Can't do that.");

    // Told again while it's open: shown at once, counted
    await page.evaluate(() => window.pellagos.game.hud.message("News number 12.", 3));
    await expect(rows.first()).toContainText("2 times, last just now");
    await expect(rows).toHaveCount(10);

    // Back to the journal; closed and opened again, the journal first
    await journal.getByRole("button", { name: "Journal" }).click();
    await expect(journal.getByRole("heading", { name: "Standing" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(journal).toBeHidden();

    // The next time they play: still there
    await continued();
    await page.keyboard.press("j");
    await expect(journal.getByRole("heading", { name: "Standing" })).toBeVisible();
    await journal.getByRole("button", { name: "Messages" }).click();
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText("News number 12.");
    await expect(rows.first()).toContainText("2 times");
});

test("the wild's creatures leave their prints on the ground as they go out in the world, as their feet are: a wolf its paws, a boar its hooves, a bandit his boots; fading by the clock", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    // (Out of town, a wolf, a boar and a bandit wandering by the player)
    await page.evaluate(async () => {
        const { CREATURES } = await import("/js/core/creatures.js");
        const { game } = window.pellagos;
        const { host, battle, world } = game;
        const [mx, my] = world.stamp.middle;
        const at = [Math.floor(mx - 150), Math.floor(my - 20)];

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", at, { facing: Math.PI });
        Object.assign(battle.actor(game.me), { hp: 1e6, maxHp: 1e6 });

        for (const [k, kind] of ["wolf", "boar", "bandit"].entries()) {
            const id = `walker-${kind}`;

            host.wild.set(id, { creature: kind, tier: 2, pack: id, camp: null, lair: null, master: false });
            battle.add({ id, kind: "beast", name: CREATURES[kind].name, weapon: CREATURES[kind].weapon, team: "beasts", square: [at[0] - 3 + k * 3, at[1] - 4], ai: "wild", hp: 1e6, speed: 1.2, chase: 1.2, wild: { creature: kind, tier: 2, temper: "defensive", guard: 0, roam: 6, leash: 12, pack: id, leader: null, menace: false } });
        }
    });

    // (Each kind of print made: tracks3d.js PRINTS' order is the atlas's. Whatever else the wild
    // puts out about the player leaves its own too)
    const printed = () => {
        const { tracks } = window.pellagos.game;
        const kinds = ["paw", "cat", "broad", "hoof", "claw", "lizard", "boot", "bare", "webbed", "pricks", "slither", "smear"];
        const made = new Set([...tracks.cells.slice(0, tracks.mesh.count)].map((cell) => kinds[cell]));

        return ["paw", "hoof", "boot"].every((kind) => made.has(kind));
    };

    expect(await playUntil(page, printed, { seconds: 90 })).toBe(true);

    // Drawn out in the world, each lying on the ground there and made by the game's clock
    const prints = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { tracks } = game;
        const matrix = new (tracks.mesh.instanceMatrix.array.constructor)(16);
        const out = [];

        for (let k = 0; k < tracks.mesh.count; k++) {
            matrix.set(tracks.mesh.instanceMatrix.array.subarray(k * 16, k * 16 + 16));
            out.push({ y: matrix[13], ground: tracks.groundAt(matrix[12], matrix[14]), made: tracks.made[k], depth: tracks.depths[k] });
        }

        return { visible: tracks.mesh.visible, clock: game.clock, out };
    });

    expect(prints.visible).toBe(true);
    expect(prints.out.every(({ y, ground }) => Math.abs(y - ground) < 0.05)).toBe(true);
    // (Each one's time as the GPU's float32 holds it: one made on the last frame can come out a hair
    // over the clock itself, never over it as the float32 holds it)
    expect(prints.out.every(({ made, depth }) => made <= Math.fround(prints.clock) && depth > 0 && depth <= 1)).toBe(true);
});

test("a trail out of a camp: its prints and signs seen near it, a sign tapped walked up to and read, which way it runs told; three read, its camp tracked, on the world map and in the journal; and the next time", async ({ page }) => {
    // (Played twice: more than the usual time)
    test.setTimeout(180000);
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);

    const continued = async () => {
        await title(page);
        await page.locator("#continuebutton").click();
        await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    };
    const journal = page.getByRole("dialog", { name: "Journal" });

    await continued();

    // A little way from the first sign of the trail out of the camp nearest the player's town
    const trail = await page.evaluate(async () => {
        const { trailsOf } = await import("/js/core/tracks.js");
        const { CREATURES } = await import("/js/core/creatures.js");
        const { game } = window.pellagos;
        const { host, battle, world } = game;
        const me = battle.actor(game.me);
        const near = ({ signs: [{ at }] }) => Math.hypot(at[0] - me.x, at[1] - me.y);
        const ours = trailsOf(world.plan)
            .filter(({ home }) => home.kind === "camp")
            .sort((a, b) => near(a) - near(b))[0];
        const [x, y] = ours.signs[0].at;
        const creature = host.trailCreatureOf(game.me, ours);

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [Math.floor(x) + 3, Math.floor(y) + 2], { facing: Math.PI });
        Object.assign(battle.actor(game.me), { hp: 1e6, maxHp: 1e6 });
        window.testSign = ours.signs[0].id;

        return { home: ours.home.id, signs: ours.signs.map(({ id, at }) => ({ id, at })), creature, name: CREATURES[creature].name };
    });

    // Seen: the sign glinting, and the trail's prints
    expect(await playUntil(page, () => Boolean(window.pellagos.game.trailSigns.shown.get(window.testSign)?.sprite) && window.pellagos.game.trailPrints.mesh.count > 0, { seconds: 10 })).toBe(true);

    // Tapped: walked up to, and read; told what made it and which way the trail runs, and it's in
    // their bestiary
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.advance(1 / 30, { render: true, wait: true });

        const at = game.view.toScreen(game.trailSigns.shown.get(window.testSign).at.clone());

        game.tap(at.x, at.y);
    });
    expect(await playUntil(page, () => window.pellagos.game.explored.signs.has(window.testSign), { seconds: 15 })).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.messages.map(({ text }) => text).filter((text) => text.includes(" sign: ")))).toEqual([expect.stringMatching(new RegExp(`^${trail.name} sign: .+\\. The trail runs [a-z-]+ from here, toward .+ \\(1 of 3 signs read\\)\\.$`))]);
    expect(await page.evaluate((creature) => window.pellagos.game.progress.bestiary.entry(creature).signs, trail.creature)).toBe(1);
    expect(await playUntil(page, () => !window.pellagos.game.trailSigns.shown.get(window.testSign)?.sprite, { seconds: 2 })).toBe(true);

    // The other two read: its camp tracked, told, and marked on the world map, found or not
    for (const sign of trail.signs.slice(1)) {
        await page.evaluate(({ id, at }) => {
            const { game } = window.pellagos;

            game.host.battle.place(game.me, "town", [Math.floor(at[0]), Math.floor(at[1])], { facing: Math.PI });
            game.host.command(game.me, { type: "read", sign: id });
        }, sign);
        await playUntil(page, () => false, { seconds: 0.5 });
    }

    const tracked = await page.evaluate((home) => {
        const { game } = window.pellagos;

        return { tracked: [...game.explored.tracked], told: game.messages.some(({ text }) => text.includes("You've tracked it home: ")), marked: game.worldMapView().icons.filter((icon) => icon.tracked).map(({ id }) => id), home };
    }, trail.home);

    expect(tracked).toEqual({ tracked: [trail.home], told: true, marked: [trail.home], home: trail.home });

    // In the journal: its trail, tracked home
    await page.evaluate(() => window.pellagos.game.toggleJournal());
    await expect(journal).toBeVisible();
    await expect(journal.getByRole("heading", { name: "Trails" })).toBeVisible();
    await expect(journal.locator(".journal-trail.tracked")).toContainText(`${trail.name} trail`);
    await expect(journal.locator(".journal-trail.tracked")).toContainText("Tracked home to");
    await page.evaluate(() => window.pellagos.game.toggleJournal());

    // The next time they play: still read, still tracked
    await continued();
    expect(await page.evaluate(() => ({ signs: window.pellagos.game.explored.signs.size, tracked: [...window.pellagos.game.explored.tracked] }))).toEqual({ signs: 3, tracked: [trail.home] });
});

test("a bear's den out in the wild: in its glade, drawn as the player comes near, its master and its kind out, on the world map once found; a trail out of it leading to it", async ({ page }) => {
    await page.goto("/?play&seed=2");
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000 });

    // Out by the bear's den nearest the player's town, 25 m off
    const den = await page.evaluate(async () => {
        const { densOf } = await import("/js/core/dens.js");
        const { game } = window.pellagos;
        const { host, battle, world } = game;
        const me = battle.actor(game.me);
        const near = ({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y);
        const ours = densOf(world.plan)
            .filter(({ kind }) => kind === "bear's den")
            .sort((a, b) => near(a) - near(b))[0];

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [Math.floor(ours.at[0]), Math.floor(ours.at[1]) + 25], { facing: Math.PI });
        Object.assign(battle.actor(game.me), { hp: 1e6, maxHp: 1e6 });
        window.testDen = ours.id;

        return { id: ours.id, at: ours.at };
    });

    // Drawn, and its bear out: its master, a tier up
    expect(await playUntil(page, () => window.pellagos.game.denProps.shown.has(window.testDen) && (window.pellagos.game.host.dens.get(window.testDen)?.ids.length ?? 0) > 0, { seconds: 20 })).toBe(true);

    const out = await page.evaluate(() => {
        const { game } = window.pellagos;
        const ids = game.host.dens.get(window.testDen).ids;
        const drawn = game.denProps.shown.get(window.testDen);
        const { x, z } = drawn.position;
        // (The trees round it, in its chunk and those about it: none in its glade)
        const trees = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].flatMap((dx) => game.world.maps.town.chunkAt(Math.floor(x) + dx * 64, Math.floor(z) + dy * 64)?.trees ?? []));

        return { creatures: ids.map((id) => game.host.wild.get(id).creature), masters: ids.filter((id) => game.host.wild.get(id).master).length, parts: drawn.children.length, glade: trees.filter((tree) => Math.hypot(tree.x - x, tree.y - z) < 12).length };
    });

    expect(out.creatures.every((creature) => creature === "bear")).toBe(true);
    expect(out.masters).toBe(1);
    expect(out.parts).toBeGreaterThan(5);
    expect(out.glade).toBe(0);

    // Found, on the world map; and a trail out of it, its sign read, leading to it
    expect(await page.evaluate((id) => window.pellagos.game.worldMapView().icons.some((icon) => icon.id === id && icon.kind === "lair"), den.id)).toBe(true);

    const told = await page.evaluate(async (id) => {
        const { trailsOf } = await import("/js/core/tracks.js");
        const { game } = window.pellagos;
        const trail = trailsOf(game.world.plan).find(({ home }) => home.id === id);
        const [x, y] = trail.signs[0].at;

        game.host.battle.place(game.me, "town", [Math.floor(x), Math.floor(y)], { facing: Math.PI });

        game.host.command(game.me, { type: "read", sign: trail.signs[0].id });

        for (let k = 0; k < 15; k++) {
            game.advance(1 / 30, { render: false, wait: true });
        }

        return game.messages.map(({ text }) => text).find((text) => text.includes(" sign: ")) ?? "";
    }, den.id);

    expect(told).toMatch(/^Brown bear sign: .+ toward a bear's den \(1 of 3 signs read\)\.$/);
});

test("a shrine out in the land: tapped, walked up to and prayed at; its god's gift on the player for half an hour, a place near it shown and written in the journal; once a day", async ({ page }) => {
    await page.goto("/?play&seed=2");
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000 });

    // A few steps from the shrine nearest the player's town
    const shrine = await page.evaluate(async () => {
        const { shrinesOf } = await import("/js/core/shrines.js");
        const { PANTHEON } = await import("/js/core/lore/gods.js");
        const { GIFTS } = await import("/js/core/shrines.js");
        const { game } = window.pellagos;
        const { host, battle, world } = game;
        const me = battle.actor(game.me);
        const near = ({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y);
        const ours = [...shrinesOf(world.plan)].sort((a, b) => near(a) - near(b))[0];
        const [x, y] = world.maps.town.sites.heartOf(ours.site);

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [Math.floor(x), Math.floor(y) + 6], { facing: Math.PI });
        window.testShrine = ours.site.id;

        return { id: ours.site.id, god: ours.god, name: PANTHEON[ours.god].name, label: GIFTS[ours.god].label, heart: [x, y] };
    });

    await playUntil(page, () => false, { seconds: 2 });

    // Tapped (the space before its figure): walked up to, and prayed at
    await page.evaluate(([x, z]) => {
        const { game } = window.pellagos;

        game.advance(1 / 30, { render: true, wait: true });

        // (A point there, a little above the ground: a vector as the camera's position is one)
        const at = game.view.toScreen(game.view.camera.position.clone().set(x, (game.world.maps.town.heightAt?.(x, z) ?? 0) + 1.2, z));

        game.tap(at.x, at.y);
    }, shrine.heart);
    expect(await playUntil(page, () => window.pellagos.game.host.players.get(window.pellagos.game.me).boons.some(({ god }) => god), { seconds: 15 })).toBe(true);

    const prayed = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.host.players.get(game.me);

        return { boons: player.boons.filter(({ god }) => god).map(({ god, label, until }) => ({ god, label, left: Math.round((until - game.battle.time) / 60000) })), told: game.messages.at(-1)?.text ?? "", heard: (game.memory.heard ?? []).filter(({ shrine }) => shrine).length };
    });

    expect(prayed.boons).toEqual([{ god: shrine.god, label: shrine.label, left: 30 }]);
    expect(prayed.told).toContain(`You kneel at the shrine of ${shrine.name}`);
    expect(prayed.told).toContain(`${shrine.label}: `);

    // (What the god showed, in the journal, if there was somewhere near still to find)
    if (prayed.heard) {
        await page.evaluate(() => window.pellagos.game.toggleJournal());
        await expect(page.getByRole("dialog", { name: "Journal" })).toContainText(`Shown at the shrine of ${shrine.name}`);
        await page.evaluate(() => window.pellagos.game.toggleJournal());
    }

    // Again today: no
    expect(await page.evaluate((id) => window.pellagos.game.host.command(window.pellagos.game.me, { type: "pray", shrine: id }), shrine.id)).toEqual({ ok: false, reason: "prayed" });
});

test("the rings of standing stones as Lunara's moon roads: stepped into by night, the player carried to the ring tonight's moon wakes, aglow, both in the journal; under a full moon, the world map's rings stood in to choose from", async ({ page }) => {
    await page.goto("/?play&seed=2");
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000 });

    // The ring nearest the player's town, and the one its moon road leads to on some night;
    // stepped into on that night, 2 hours after its sunset
    const rings = await page.evaluate(async () => {
        const { DAY, dayOf, elapsedOf } = await import("/js/core/daytime.js");
        const { FULL_MOON, moonRoad, PHASES, phaseOfNight, ringName, ringsOf } = await import("/js/core/rings.js");
        const { game } = window.pellagos;
        const { host, battle, world } = game;
        const me = battle.actor(game.me);
        const far = ({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y);
        const from = [...ringsOf(world.plan)].sort((a, b) => far(a) - far(b))[0];
        const phase = [1, 2, 3, 5, 6, 7].find((moon) => moonRoad(world.plan, from, moon));
        const road = moonRoad(world.plan, from, phase);
        // (The nights to come, from tomorrow's: the first whose moon is a phase)
        const today = dayOf(elapsedOf(host.war));
        const night = (day) => day * DAY.length - DAY.start + DAY.sets + DAY.length / 12;
        const nightWith = (moon) => night(Array.from({ length: 16 }, (_, k) => today + 1 + k).find((day) => phaseOfNight(night(day)) === moon));
        const heart = (ring) => world.maps.town.sites.heartOf(ring.site);
        const [x, y] = heart(from);

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(host.war, { turn: Math.floor(nightWith(phase) / 60000), clock: nightWith(phase) % 60000 });
        host.battle.place(game.me, "town", [Math.floor(x), Math.floor(y)], { facing: Math.PI });
        Object.assign(battle.actor(game.me), { hp: 1e6, maxHp: 1e6 });
        window.testRoad = { heart: heart(road), from: heart(from), full: nightWith(FULL_MOON) };

        return { from: { id: from.site.id, name: ringName(world.plan, from), phase: PHASES[from.phase] }, road: { id: road.site.id, name: ringName(world.plan, road), phase: PHASES[road.phase] } };
    });

    // Carried: in the other ring's middle, what the stones did said, its moonlight about them
    expect(await playUntil(page, () => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        return Math.hypot(me.x - window.testRoad.heart[0], me.y - window.testRoad.heart[1]) < 5 && game.moonGates.shown.size > 0;
    }, { seconds: 10 })).toBe(true);

    const carried = await page.evaluate((id) => {
        const { game } = window.pellagos;

        return { said: game.messages.map(({ text }) => text), stood: [...game.explored.rings], glow: game.moonGates.shown.get(id)?.bright ?? null };
    }, rings.road.id);

    expect(carried.said).toContain(`These stones are Lunara's roads: this ring wakes under the ${rings.from.phase}. It's in your journal.`);
    expect(carried.said).toContain(`The stones hum, and the moonlight carries you: you stand in ${rings.road.name}.`);
    expect(new Set(carried.stood)).toEqual(new Set([rings.from.id, rings.road.id]));
    expect(carried.glow).toBe(true);

    // Both rings in the journal, with the moon each wakes under; this one awake tonight
    await page.evaluate(() => window.pellagos.game.toggleJournal());

    const roads = page.getByRole("dialog", { name: "Journal" }).locator(".moon-roads");

    await expect(roads).toContainText(`Tonight's moon: the ${rings.road.phase}.`);
    await expect(roads.locator(".journal-trail.tracked")).toContainText("Awake tonight");
    await expect(roads.locator(".journal-trail.tracked")).toContainText(rings.road.name.replace(/^the s/, "The s"));
    await expect(roads).toContainText(`Wakes under the ${rings.from.phase}`);
    await page.evaluate(() => window.pellagos.game.toggleJournal());

    // Under a full moon, stepped out of the ring and back in: the world map, its rings stood in to
    // choose from; the first one chosen, walked to
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const [x, y] = window.testRoad.heart;
        const { full } = window.testRoad;

        Object.assign(game.host.war, { turn: Math.floor(full / 60000), clock: full % 60000 });
        game.host.battle.place(game.me, "town", [Math.floor(x) + 12, Math.floor(y)], { facing: Math.PI });
    });
    await playUntil(page, () => window.pellagos.game.host.players.get(window.pellagos.game.me).inRing === null, { seconds: 2 });
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const [x, y] = window.testRoad.heart;

        // (Played as it is, the map opened over it)
        game.host.battle.place(game.me, "town", [Math.floor(x), Math.floor(y)], { facing: Math.PI });
        game.start();
    });
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn?.branches, null, { timeout: 30000, polling: 100 });

    const map = await page.evaluate(() => ({ title: document.querySelector("#worldmaptitle").textContent, text: document.querySelector("#worldmappicktext").textContent, travel: window.pellagos.worldMap.travel }));

    expect(map.title).toBe("The moon roads");
    expect(map.text).toBe("Tap a ring you've stood in, and the moon carries you there.");
    expect(new Set(map.travel.map(({ id }) => id))).toEqual(new Set([rings.from.id, rings.road.id]));
    expect(map.travel.find(({ here }) => here).id).toBe(rings.road.id);

    const spot = await page.evaluate((id) => {
        const map = window.pellagos.worldMap;
        const { x, z } = map.travel.find((branch) => branch.id === id);
        const rect = map.canvas.getBoundingClientRect();

        return { x: rect.left + (x - map.view.x) / map.view.scale + rect.width / 2, y: rect.top + (z - map.view.z) / map.view.scale + rect.height / 2 };
    }, rings.from.id);

    await page.mouse.click(spot.x, spot.y);
    await expect(page.locator("#portaltitle")).toHaveText(`Walk the moon road to ${rings.from.name.replace(/^the s/, "The s")}?`);
    await expect(page.locator("#portalgo")).toHaveText("Step into the moonlight");
    await page.locator("#portalgo").click();
    await page.waitForFunction(() => !document.querySelector("#worldmap").open, null, { timeout: 10000 });
    await page.waitForFunction(
        () => {
            const { game } = window.pellagos;
            const me = game.battle.actor(game.me);

            return Math.hypot(me.x - window.testRoad.from[0], me.y - window.testRoad.from[1]) < 5;
        },
        null,
        { timeout: 10000, polling: 100 },
    );
});

test("the bestiary: a creature seen and slain written in, its page in the journal opening a part at a time, its portrait drawn; and the next time", async ({ page }) => {
    // (Played twice: more than the usual time)
    test.setTimeout(180000);
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);

    const continued = async () => {
        await title(page);
        await page.locator("#continuebutton").click();
        await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    };
    const journal = page.getByRole("dialog", { name: "Journal" });

    await continued();

    // Out of town, a wolf by the player, all but dead; the player sets on it
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { host, battle, world } = game;
        const [mx, my] = world.stamp.middle;
        const at = [Math.floor(mx - 140), Math.floor(my - 20)];

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", at, { facing: Math.PI / 2 });
        host.wild.set("test-wolf", { creature: "wolf", tier: 2, pack: "test-wolf", camp: null, lair: null, master: false });
        battle.add({ id: "test-wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: "beasts", square: [at[0] + 1, at[1]], ai: "wild", hp: 1, speed: 0.01, chase: 0.01, wild: { creature: "wolf", tier: 2, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: "test-wolf", leader: null, menace: false } });
        host.command(game.me, { type: "engage", target: "test-wolf" });
    });

    expect(await playUntil(page, () => window.pellagos.game.progress.bestiary.entry("wolf").slain === 1, { seconds: 20 })).toBe(true);

    // Told, and written in: seen and slain
    expect(await page.evaluate(() => window.pellagos.game.messages.some(({ text }) => text.startsWith("New in your bestiary: Wolf.")))).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.progress.bestiary.entry("wolf"))).toEqual({ points: 2, seen: true, signs: 0, slain: 1, level: 1 });

    // Its tab in the journal: the kinds met, the wolf among them, Sighted
    await page.evaluate(() => window.pellagos.game.toggleJournal());
    await expect(journal).toBeVisible();
    await journal.getByRole("button", { name: "Bestiary" }).click();
    await expect(journal).toContainText("1 of 97 kinds of creature met");
    await expect(journal.getByRole("heading", { name: "The wilds" })).toBeVisible();

    // Its page: what it is, open; the rest shut, and how to open them
    await journal.getByRole("button", { name: "Wolf: Sighted, 1 of 4" }).click();
    await expect(journal.getByRole("heading", { name: "Wolf" })).toBeVisible();
    await expect(journal.getByRole("heading", { name: "What it is" })).toBeVisible();
    await expect(journal).toContainText("Grey wolves run in packs");
    await expect(journal).toContainText("Seen · 1 slain");
    await expect(journal.locator(".bestiary-section.shut")).toHaveCount(3);
    await expect(journal.locator(".bestiary-section.shut").first()).toContainText("At Known: watch for it, read the signs it leaves, and slay it to learn more.");

    // Its portrait beside its name: a wolf as the game draws one, on the dark, not a blank picture
    const portrait = journal.locator(".bestiary-portrait-picture");

    await expect(portrait).toBeVisible({ timeout: 60000 });
    await expect(portrait).toHaveAttribute("alt", "Wolf, as it looks");

    const drawn = await portrait.evaluate((picture) => {
        const canvas = Object.assign(document.createElement("canvas"), { width: picture.naturalWidth, height: picture.naturalHeight });
        const context = canvas.getContext("2d");

        context.drawImage(picture, 0, 0);

        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const colours = new Set();

        for (let k = 0; k < data.length; k += 4 * 13) {
            colours.add(`${data[k] >> 4},${data[k + 1] >> 4},${data[k + 2] >> 4}`);
        }

        return { width: canvas.width, colours: colours.size, corner: [...data.slice(0, 3)] };
    });

    expect(drawn.width).toBe(224);
    expect(drawn.colours).toBeGreaterThan(20);
    expect(Math.max(...drawn.corner)).toBeLessThan(60);

    // Back to the contents, then the journal; closed
    await journal.getByRole("button", { name: "Back to the bestiary" }).click();
    await expect(journal.getByRole("button", { name: "Wolf: Sighted, 1 of 4" })).toBeVisible();
    await journal.getByRole("button", { name: "Journal" }).click();
    await expect(journal.getByRole("heading", { name: "Standing" })).toBeVisible();
    await page.evaluate(() => window.pellagos.game.toggleJournal());
    await expect(journal).toBeHidden();

    // The next time they play: still there
    await continued();
    await page.keyboard.press("j");
    await journal.getByRole("button", { name: "Bestiary" }).click();
    await expect(journal.getByRole("button", { name: "Wolf: Sighted, 1 of 4" })).toBeVisible();
});

test("where the player is is kept whenever the game stops (paused, the page closed or hidden), and the next time they carry on there", async ({ page }) => {
    // (Played three times: more than the usual time)
    test.setTimeout(180000);
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);

    const continued = async () => {
        await title(page);
        await page.locator("#continuebutton").click();
        await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

        return page.evaluate(() => {
            const player = window.pellagos.game.battle.actor("player");

            return { x: player.x, y: player.y, facing: player.facing, map: player.map, spawn: player.spawn };
        });
    };
    // (Walked a way off down the street, the world stopped)
    const walk = (by) =>
        page.evaluate((by) => {
            const { game } = window.pellagos;
            const player = game.battle.actor("player");

            game.stop();
            Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
            game.battle.command("player", { type: "move", to: [player.square[0] + by, player.square[1]] });

            for (let k = 0; k < 100 && (player.path.length || player.order); k++) {
                game.advance(0.1, { render: false });
            }

            return { x: player.x, y: player.y, facing: player.facing };
        }, by);
    const kept = async () => (await keptOf(page, "place"))?.place ?? null;

    const first = await continued();
    const walked = await walk(10);

    expect(Math.hypot(walked.x - first.x, walked.y - first.y)).toBeGreaterThan(5);

    // Paused (the menu): kept as it is
    await page.evaluate(() => {
        const { game } = window.pellagos;

        Object.assign(game.battle.actor("player"), { path: [], order: null });
        game.start();
    });
    await page.locator("#menubutton").click();
    await expect(page.locator("#menu")).toBeVisible();
    expect(await kept()).toEqual(walked);

    // The next time: there, getting up at home still if they fall
    const second = await continued();

    expect(second).toEqual({ ...walked, map: "town", spawn: first.spawn });

    // Closed (left for the title page) without pausing: kept as the page goes
    const again = await walk(-6);

    expect(again.x).not.toBe(walked.x);
    expect(await continued()).toMatchObject(again);
});

test("an adventurer at the guild, hired for gold, follows the player out and keeps up, sprinting as they sprint, and brought to them when left far behind; the journal shows their company, and they're with them the next time", async ({ page }) => {
    // (Played twice: more than the usual time)
    test.setTimeout(180000);

    // A saved game in seed 2's world
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), { ...SAVE, seed: 2 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // Into the guild with gold to spare, and up to one of its adventurers
    const guild = await page.evaluate(() => {
        const { game } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild");
        const player = game.battle.actor("player");
        const [x, y] = building.door.ends[0].squares[0];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.progress.gold = 200;
        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const adventurer = game.battle.actors.find((actor) => actor.map === player.map && actor.role === "adventurer");

        game.approaching = adventurer.id;
        game.battle.command("player", { type: "approach", target: adventurer.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        game.start();

        return { name: adventurer.name, door: building.door.id, id: adventurer.id };
    });
    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-name")).toHaveText(guild.name);

    // Asked to ride along, for their price: paid, and they follow, drawn at once as the
    // adventurer they were, the same body (not dressed there and then from nothing, which held an
    // iPhone up for 0.6 s; nor gone from where they stood till built a step at a time)
    const ask = talk.getByRole("button", { name: /Would you ride with me\? \(\d+ gold\)$/ });
    const price = Number((await ask.textContent()).match(/(\d+) gold/)[1]);

    await page.evaluate((adventurer) => {
        const { game } = window.pellagos;
        const kept = game.onFollowers;
        const body = game.avatars.get(adventurer)?.character ?? null;

        game.onFollowers = (followers) => {
            window.hired = [...game.host.followers].filter(([, { leader }]) => leader === "player").map(([id]) => ({ drawn: game.avatars.has(id), queued: game.enlisting.includes(id) || game.enlistees.has(id), same: Boolean(body) && game.avatars.get(id)?.character === body, shown: Boolean(game.avatars.get(id)?.object.visible) }));
            kept(followers);
        };
    }, guild.id);
    await ask.click();
    await expect(talk.locator(".talk-line")).toContainText(/Lead on|Where to\?|killed/);
    await expect(page.locator("#banner")).toHaveText(`${guild.name} follows you now.`);
    await expect(page.locator(".coins").first()).toHaveText(`${200 - price} gold`);
    expect(await page.evaluate(() => window.hired)).toEqual([{ drawn: true, queued: false, same: true, shown: true }]);
    await page.keyboard.press("Escape");
    await expect(talk).toBeHidden();


    // Out of the guild: they come out with the player, and keep up on a walk down the street
    const out = await page.evaluate((door) => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [id] = [...game.host.followers].find(([, { leader }]) => leader === "player");
        const follower = game.battle.actor(id);
        const apart = () => Math.hypot(follower.x - player.x, follower.y - player.y);

        game.stop();

        // (Drawn at once, as the adventurer they were; were that one of a crowd's figures, a moment
        // after, a step at a time, once the guild's own folk are: played on till they are)
        for (let k = 0; k < 600 && !game.avatars.has(id); k++) {
            game.advance(0.1, { render: false });
        }

        game.battle.command("player", { type: "enter", link: door });

        for (let k = 0; k < 100 && player.map !== "town"; k++) {
            game.advance(0.1, { render: false });
        }

        game.advance(0.5, { render: false });

        const outside = { map: follower.map, apart: apart(), drawn: game.avatars.has(id) };
        const start = [...player.square];

        game.battle.command("player", { type: "move", to: game.world.tavern.outside });

        for (let k = 0; k < 300 && (player.path.length || player.to); k++) {
            game.advance(0.1, { render: false });
        }

        game.advance(3, { render: false });

        const after = { map: follower.map, apart: apart() };
        const walked = Math.hypot(player.square[0] - start[0], player.square[1] - start[1]);

        // A sprint back the way they came: the follower sprints too, keeping within about 10 m
        let [furthest, fastest] = [0, 0];

        game.battle.command("player", { type: "move", to: start, run: true });

        for (let k = 0; k < 300 && (player.path.length || player.order); k++) {
            game.advance(0.1, { render: false });
            furthest = Math.max(furthest, apart());
            fastest = Math.max(fastest, follower.pace);
        }

        // Left on another floor (the guild's hall), far from them: brought quietly behind them,
        // drawn there
        const hall = game.battle.links.find(({ id: link }) => link === door).ends[1].map;

        Object.assign(follower, { map: hall, square: [10, 13], x: 10.5, y: 13.5, path: [], target: null });
        game.advance(0.3);

        const [ox, oz] = game.originOf(player.map);
        const drawn = game.avatars.get(id)?.object.position;
        const brought = { map: follower.map, apart: apart(), drawnAt: drawn ? Math.hypot(drawn.x - ox - follower.x, drawn.z - oz - follower.y) : null };

        game.start();

        return { outside, walked, after, sprint: { furthest, fastest, walk: follower.speed }, brought, id };
    }, guild.door);

    expect(out.outside).toEqual({ map: "town", apart: expect.any(Number), drawn: true });
    expect(out.outside.apart).toBeLessThan(6);
    expect(out.walked).toBeGreaterThan(8);
    expect(out.after.map).toBe("town");
    expect(out.after.apart).toBeLessThan(5);

    // (Sprinting with them, within about 10 m; and brought, with no puff, its figure put there)
    expect(out.sprint.fastest).toBeGreaterThan(out.sprint.walk * 2);
    expect(out.sprint.furthest).toBeLessThan(12);
    expect(out.brought.map).toBe("town");
    expect(out.brought.apart).toBeLessThan(6);
    expect(out.brought.drawnAt).toBeLessThan(0.5);

    // The journal: who follows the player, and how they are
    const journal = page.getByRole("dialog", { name: "Journal" });

    await page.keyboard.press("j");
    await expect(journal).toBeVisible();
    await expect(journal.locator(".journal-follower-name")).toHaveText([guild.name]);
    await expect(journal.locator(".journal-follower-state")).toContainText([/^(warrior|ranger|rogue|mage|cleric), 100%$/]);
    await page.keyboard.press("Escape");

    // Kept with the character: with them again the next time
    const kept = await keptOf(page, "followers");

    expect(kept.followers.map(({ name }) => name)).toEqual([guild.name]);
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    const again = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        return [...game.host.followers].map(([id, { name, leader }]) => {
            const follower = game.battle.actor(id);

            return { name, leader, map: follower.map, apart: Math.hypot(follower.x - player.x, follower.y - player.y), drawn: game.avatars.has(id) };
        });
    });

    expect(again).toEqual([{ name: guild.name, leader: "player", map: "town", apart: expect.any(Number), drawn: true }]);
    expect(again[0].apart).toBeLessThan(6);
});

test("an adventurer hired from their drink at one of the guild's tables follows with the tankard still in hand, and out through the door puts it down and takes up their own arms, put away till there's a fight", async ({ page }) => {
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), { ...SAVE, seed: 2 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // Into the guild with gold to spare, and up to one drinking at its tables
    const guild = await page.evaluate(() => {
        const { game } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild");
        const player = game.battle.actor("player");
        const [x, y] = building.door.ends[0].squares[0];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.progress.gold = 200;
        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const drinker = game.battle.actors.find((actor) => actor.map === player.map && game.host.folk.get(actor.id)?.role === "patron" && game.host.folk.get(actor.id)?.talk === "adventurer");

        // (Drawn, as the guild's folk are once the player's in)
        for (let k = 0; k < 600 && !game.avatars.get(drinker.id)?.character; k++) {
            game.advance(0.1, { render: false });
        }

        game.approaching = drinker.id;
        game.battle.command("player", { type: "approach", target: drinker.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        game.start();

        return { door: building.door.id, id: drinker.id, holds: [...game.avatars.get(drinker.id).character.equipment.values()] };
    });

    expect(guild.holds).toContain("tankard");

    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await talk.getByRole("button", { name: /Would you ride with me\? \(\d+ gold\)$/ }).click();
    await expect(page.locator("#banner")).toContainText("follows you now.");
    await page.keyboard.press("Escape");
    await expect(talk).toBeHidden();

    // Hired: the same body, the tankard still in hand; out through the door, put down, and their
    // own weapon taken up (the one their calling fights with), put away
    const carried = await page.evaluate((door) => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [id] = [...game.host.followers].find(([, { leader }]) => leader === "player");
        const follower = game.battle.actor(id);
        const holds = () => [...(game.avatars.get(id)?.character.equipment.values() ?? [])];

        game.stop();

        for (let k = 0; k < 600 && !game.avatars.has(id); k++) {
            game.advance(0.1, { render: false });
        }

        const inside = holds();

        game.battle.command("player", { type: "enter", link: door });

        for (let k = 0; k < 200 && (player.map !== "town" || follower.map !== "town"); k++) {
            game.advance(0.1, { render: false });
        }

        game.advance(0.3, { render: false });
        game.start();

        return { inside, outside: holds(), map: follower.map, weapon: follower.weapon, sheathed: game.avatars.get(id).character.sheathed };
    }, guild.door);

    expect(carried.inside).toContain("tankard");
    expect(carried.map).toBe("town");
    expect(carried.outside).not.toContain("tankard");
    expect(carried.outside).toContain(carried.weapon);
    expect(carried.sheathed).toBe(true);
});

test("the player's people brought under another: told, and served; stirred to rising, they rise; and their victory, told and honoured", async ({ page }) => {
    // (The war played on two minutes in all: more than the usual time)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const fate = page.locator(".fate");
    const journal = page.getByRole("dialog", { name: "Journal" });

    // Brought under the orcs (as the war tells it): the player's told, and plays on
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.events.push({ type: "subjugated", turn: war.turn, realm: "human", by: "orc", was: null });
        Object.assign(war.realm("human"), { overlord: "orc", since: war.turn });
        game.advance(0.1, { render: false });
        game.start();
    });
    await expect(fate).toBeVisible();
    await expect(fate.locator(".fate-title")).toHaveText("Brought under");
    await expect(fate.locator(".fate-text")).toContainText("The Humans' seat has fallen, and they bend the knee to the Orcs. You serve them now");
    await fate.getByRole("button", { name: "Play on" }).click();
    await expect(fate).toBeHidden();

    // The journal: whom they serve, and how near they are to rising
    await page.keyboard.press("j");
    await expect(journal.locator(".journal-fate")).toHaveText(/^You serve the Orcs\. Your people are \d+% of the way to rising\.$/);
    await page.keyboard.press("Escape");

    // Stirred to the brim: ready (told in a word), then risen at the war's next turn
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.host.war.stir("human", 100);
        game.advance(0.1, { render: false });
        game.start();
    });
    await expect(page.locator("#banner")).toHaveText("The Humans are ready to rise against the Orcs!");
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(61, { render: false });
        game.start();
    });
    await expect(fate.locator(".fate-title")).toHaveText("Risen!");
    await expect(fate).toHaveAttribute("data-tone", "hope");
    await page.keyboard.press("Escape");
    await expect(fate).toBeHidden();

    // Every other people brought under them: victory, and the rulers' honours
    const points = await page.evaluate(() => {
        const { game } = window.pellagos;
        const before = game.standing.points;

        game.stop();

        for (const realm of game.host.war.realms.filter(({ id }) => id !== "human")) {
            Object.assign(realm, { overlord: "human", since: game.host.war.turn });
        }

        game.advance(61, { render: false });
        game.start();

        return game.standing.points - before;
    });

    expect(points).toBe(200);
    await expect(fate.locator(".fate-title")).toHaveText("Victory");
    await expect(fate).toHaveAttribute("data-tone", "won");
    await fate.getByRole("button", { name: "Play on" }).click();
    await page.keyboard.press("j");
    await expect(journal.locator(".journal-fate")).toHaveText("Your people rule the continent. Every other people serves them.");
    await page.keyboard.press("Escape");

    // Kept with the war
    const kept = await page.evaluate(() => window.pellagos.game.host.war.victor);

    expect(kept).toBe("human");
});

test("tapping someone walks the player up to talk: their name and what they are, what they say, replies that lead on, Escape to stop; the barkeep tells the war's news as it's heard in the town", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Into the taproom, the orc out of the way, then tap the barkeep
    const tapped = await page.evaluate(() => {
        const { game, session } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.command("player", { type: "enter", link: "tavern-door" });
        game.advance(30);
        game.battle.command("player", { type: "move", to: [7, 6] });
        game.advance(5);

        const spot = session.view.toScreen(game.avatars.get("barkeep").point(0.6));

        game.tap(spot.x, spot.y, { time: performance.now() + 9000 });

        const order = game.battle.actor("player").order?.type ?? null;

        game.advance(8);

        // (Greeted as he's come up to: a wave, from a barkeep)
        const greeted = game.avatars.get("barkeep").actions.variety.last.has("emote:wave");

        return { map: game.battle.actor("player").map, order, name: game.world.folk.find(({ id }) => id === "barkeep").name, talking: game.battle.actor("barkeep").talkingTo, greeted };
    });

    expect(tapped).toMatchObject({ map: "taproom", order: "approach", talking: "player", greeted: true });

    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-name")).toHaveText(tapped.name);
    await expect(talk.locator(".talk-title")).toHaveText("Barkeep");
    await expect(talk.locator(".talk-line")).toContainText(tapped.name.split(" ")[0]);
    await expect(talk.locator(".talk-choice").last()).toHaveText(/Farewell/);

    // Asking for news: he answers (with a nod), with things to ask next
    await talk.getByRole("button", { name: /news/ }).click();
    await expect(talk.getByRole("button", { name: /Thanks for that/ })).toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.avatars.get("barkeep").actions.variety.last.has("emote:nod"))).toBe(true);

    const news = await talk.locator(".talk-line").textContent();

    expect(news.length).toBeGreaterThan(20);

    // Its number on the keyboard says it; Escape stops talking (without pausing the game)
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press(String(await talk.locator(".talk-choice").count()));
    await expect(talk.locator(".talk-line")).not.toHaveText(news);
    await page.keyboard.press("Escape");
    await expect(talk).toBeHidden();
    await expect(page.locator("#menu")).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => ({ talking: window.pellagos.game.battle.actor("barkeep").talkingTo, remembered: window.pellagos.game.memory.barkeep.talks }))).toEqual({ talking: null, remembered: 1 });

    // Waving goodbye from the action wheel: the host's told, and the player's seen waving
    const waved = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();

        const done = game.act("emote:wave", "self");

        game.advance(0.5);

        return { ok: done.ok, emoting: game.avatars.get("player").actions.emoting };
    });

    expect(waved).toEqual({ ok: true, emoting: "wave" });

    // News of skirmishers falling on the town, and a war declared far off; the barkeep tapped again
    await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const war = game.host.war;
        const home = war.town(game.world.start.id);

        game.stop();
        war.log.push({ type: "skirmish", turn: war.turn, realm: "orc", camp: "camp-900", against: home.owner, target: home.id, killed: 2, lost: 1 });
        war.log.push({ type: "declared", turn: war.turn, by: "orc", on: "elf" });

        const spot = session.view.toScreen(game.avatars.get("barkeep").point(0.6));

        game.tap(spot.x, spot.y, { time: performance.now() + 18000 });
        game.advance(8);
    });
    await expect(talk).toBeVisible();

    // The news, or what's said of a ruler: and asked again, something else, until the news is told
    const line = talk.locator(".talk-line");
    const warNews = /Skirmishers out of the Orcs' camp fell on .+, and brought 2 of the Humans down|The Orcs have declared war on the Elves/;

    await talk.getByRole("button", { name: "What's the word on the war?" }).click();
    await expect(line).toContainText(/Orcs|They say/);

    const heard = [await line.textContent()];

    for (let k = 0; k < 6 && !heard.some((each) => warNews.test(each)); k++) {
        await talk.getByRole("button", { name: "What else is being said?" }).click();
        await expect(line).not.toHaveText(heard.at(-1));
        await expect(line).toContainText(/Orcs|They say/);
        heard.push(await line.textContent());
    }

    expect(heard.some((each) => warNews.test(each)), heard.join(" / ")).toBe(true);
    await page.keyboard.press("Escape");
});

test("the pack's paperdoll: the player drawn among their gear; tapped, a piece says what it does; held, it goes on or comes off; a two-handed weapon greys out the other hand", async ({ page }) => {
    // A saved game whose hero carries a sword, a fine kite shield and an orc's helm, their staff in hand
    await page.addInitScript((save) => {
        localStorage.setItem("pellagos.save", JSON.stringify(save));

        if (!localStorage.getItem("pellagos.progress")) {
            const pack = [{ id: "kiteShield", quality: "fine", affixes: ["sturdy"], bonuses: { armor: 0.02 } }, { id: "sword" }, { id: "helm", people: "orc" }];

            localStorage.setItem("pellagos.progress", JSON.stringify({ created: save.created, seed: save.seed, skills: {}, gold: 10, pack, gear: null }));
        }
    }, { ...SAVE, seed: 1 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // (The shaders made as the pack opens: the world behind it is the screen as it was drawn,
    // copied, with no second shader for every material in sight, which lost an iPhone the page.
    // Counted once the world's shaders have all been made, none new for a second and a half)
    const programs = () => page.evaluate(() => window.pellagos.game.view.renderer.info.programs.length);
    let made = -1;

    await expect(async () => {
        const before = await programs();

        await page.waitForTimeout(1500);
        made = await programs();
        expect(made).toBe(before);
    }).toPass({ timeout: 60000 });
    await page.keyboard.press("i");

    const pack = page.locator(".pack");
    const slot = (id) => pack.locator(`.doll-slot[data-slot="${id}"]`);
    const cell = (item) => pack.locator(`.carried .pack-cell[data-item="${item}"]`);
    const hold = async (locator) => {
        const box = await locator.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.mouse.up();
    };
    const worn = () => page.evaluate(() => [...window.pellagos.game.avatars.get(window.pellagos.game.me).character.equipment.values()]);

    // The staff in both hands, the other greyed out behind it; the player among their gear; two pages
    await expect(pack.locator(".doll .doll-view")).toBeVisible();
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    expect(await programs()).toBeLessThanOrEqual(made + 3);
    await expect(slot("mainHand")).toHaveText(/^Weapon\s*Staff$/);
    await expect(slot("offHand")).toHaveClass(/locked/);
    await expect(pack.locator(".pack-page")).toHaveCount(2);

    // Tapped, the shield says what it is and does (one kept from before shields blocked: two
    // thirds of the most a fine one can), and that it can't go on with the staff
    await cell("kiteShield").click();
    await expect(pack.locator(".pack-about .pack-name")).toHaveText("Sturdy kite shield (blocks 35%)");
    await expect(pack.locator(".pack-about")).toContainText("Blocks 35% of a blow caught on it (up to 52% for its make)");
    await expect(pack.locator(".pack-about .pack-compare")).toContainText("The weapon in hand takes both hands.");

    // Its card beside it, put away by a tap anywhere else, its ×, or Escape (the pack still open)
    await cell("kiteShield").click();
    await expect(pack.locator(".pack-about .pack-name")).toBeVisible();
    await pack.locator(".pack-title").click();
    await expect(pack.locator(".pack-about")).toBeHidden();
    await cell("kiteShield").click();
    await pack.locator(".pack-about").getByRole("button", { name: "Put it away" }).click();
    await expect(pack.locator(".pack-about")).toBeHidden();
    await cell("kiteShield").click();
    await page.keyboard.press("Escape");
    await expect(pack.locator(".pack-about")).toBeHidden();
    await expect(pack).toBeVisible();

    // Held, the sword goes on (the staff into the pack), and the other hand's free for the shield
    await hold(cell("sword"));
    await expect(slot("mainHand")).toHaveText(/^Weapon\s*Sword$/);
    await expect(slot("offHand")).not.toHaveClass(/locked/);
    await expect(cell("staff")).toHaveCount(1);
    await hold(cell("kiteShield"));
    await expect(slot("offHand")).toHaveAttribute("aria-label", "Off hand: Sturdy kite shield (blocks 35%)");
    await expect.poll(worn).toEqual(expect.arrayContaining(["sword", "kiteShield"]));

    // An orc's helm on, counting towards their set; held again, off, back into the pack
    await hold(cell("helm"));
    await expect(slot("head")).toHaveAttribute("aria-label", "Head: Orcish helm");
    await expect(pack.locator(".doll-set")).toContainText("Horde Ironhide: 1 worn");
    await expect.poll(worn).toContain("helm.orc");
    await hold(slot("head"));
    await expect(slot("head")).toHaveClass(/empty/);
    await expect(cell("helm")).toHaveCount(1);
});

test("item levels and a legendary weapon: a piece's level and a legendary weapon's effect said; might in the totals; the charge over the card filling blow by blow on a wolf, let loose; Evaluate's power on its plate, coloured", async ({ page }) => {
    test.setTimeout(180000);

    // A saved game whose hero carries a legendary sword of level 60 (Cinderburst), one made before
    // effects (of the first level), and a rare ring of level 40
    await page.addInitScript((save) => {
        localStorage.setItem("pellagos.save", JSON.stringify(save));

        if (!localStorage.getItem("pellagos.progress")) {
            const pack = [
                { id: "sword", quality: "legendary", level: 60, name: "Emberfang", effect: "cinderburst", bonuses: { melee: 0.2 }, affixes: ["keen"] },
                { id: "sword", quality: "legendary", name: "Oathbane" },
                { id: "ring", quality: "rare", level: 40, bonuses: { hp: 18 }, affixes: ["bear"] },
            ];

            localStorage.setItem("pellagos.progress", JSON.stringify({ created: save.created, seed: save.seed, skills: {}, gold: 10, pack, gear: null }));
        }
    }, { ...SAVE, seed: 1 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    await page.keyboard.press("i");

    const pack = page.locator(".pack");
    const about = pack.locator(".pack-about");
    const swords = pack.locator(`.carried .pack-cell[data-item="sword"]`);
    const hold = async (locator) => {
        const box = await locator.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.mouse.up();
    };

    // Tapped, the legendary sword says its level and its effect, at it; the old one, of the first
    // level, has an effect all the same
    await swords.nth(0).click();
    await expect(about.locator(".pack-name")).toHaveText("Emberfang");
    await expect(about).toContainText("Level 60");
    await expect(about.locator(".tone-effect")).toContainText("Cinderburst: every 7 blows");
    await swords.nth(1).click();
    await expect(about.locator(".pack-name")).toHaveText("Oathbane");
    await expect(about).toContainText("Level 1");
    await expect(about.locator(".tone-effect")).toContainText(/^(Frostbind|Cinderburst|Earthsunder|Stormlash|Ruinblast): every 7 blows/);

    // Might in the totals, out of 100
    await expect(pack.locator(".doll-stats")).toContainText(/Might\s*\d+ of 100/);

    // Emberfang in hand (its card put away first), the pack shut
    await page.keyboard.press("Escape");
    await expect(about).toBeHidden();
    await hold(swords.nth(0));
    await expect(pack.locator('.doll-slot[data-slot="mainHand"]')).toHaveAttribute("aria-label", "Main hand: Emberfang");
    await page.keyboard.press("i");
    await expect(pack).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.game.battle.actor(window.pellagos.game.me).legendary)).toEqual({ effect: "cinderburst", level: 60, charge: 7 });

    // No charge till it's struck with; out of town, a wolf by the player, struck at
    await expect(page.locator("#hud .charge")).toBeHidden();
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { host, battle, world } = game;
        const [mx, my] = world.stamp.middle;
        const at = [Math.floor(mx - 140), Math.floor(my - 20)];

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", at, { facing: Math.PI / 2 });
        host.wild.set("test-wolf", { creature: "wolf", tier: 2, pack: "test-wolf", camp: null, lair: null, master: false });
        battle.add({ id: "test-wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: "beasts", square: [at[0] + 1, at[1]], ai: "wild", hp: 1e6, speed: 0.01, chase: 0.01, wild: { creature: "wolf", tier: 2, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: "test-wolf", leader: null, menace: false } });
        host.battle.place("test-wolf", "town", [battle.actor(game.me).square[0] + 1, battle.actor(game.me).square[1]]);
        host.command(game.me, { type: "engage", target: "test-wolf" });
    });

    // Its marks lit blow by blow over the card, full, then let loose on the wolf (flaring)
    const charge = page.locator("#hud .charge");

    expect(await playUntil(page, () => document.querySelector("#hud .charge")?.hidden === false && document.querySelectorAll("#hud .charge .charge-mark.lit").length > 0, { seconds: 10 })).toBe(true);
    await expect(charge.locator(".charge-mark")).toHaveCount(7);
    await expect(charge).toHaveAttribute("data-effect", "cinderburst");
    expect(await playUntil(page, () => document.querySelector("#hud .charge")?.classList.contains("flare"), { seconds: 20 })).toBe(true);

    // Evaluate on the player: the wolf's power by its name on its plate, the plate coloured by how
    // a fight with it goes for them
    await page.evaluate(() => window.pellagos.game.battle.buff(window.pellagos.game.me, "evaluate", { ms: 60000 }));
    expect(await playUntil(page, () => Boolean(document.querySelector('.floater[data-id="test-wolf"] .power')), { seconds: 5 })).toBe(true);
    await expect(page.locator('.floater[data-id="test-wolf"] .power')).toHaveText(/^\d+$/);
    await expect(page.locator('.floater[data-id="test-wolf"]')).toHaveClass(/look-(easy|fair|hard|deadly)/);
});

test("the pack shows what's grown and carried; a skill ranks up with use; trading with the barkeep, the gold changes hands; all kept for the next time", async ({ page }) => {
    // (A long walk through, and then a dozen clicks in the taproom, each waiting on a few frames
    // drawn in software, over half a second each with the room lit by its flames: more than the
    // usual time, with others running beside it)
    test.setTimeout(240000);

    // A saved game whose hero is a blow from their next rank with the blade, with 30 gold and a draught
    await page.addInitScript((save) => {
        localStorage.setItem("pellagos.save", JSON.stringify(save));

        if (!localStorage.getItem("pellagos.progress")) {
            localStorage.setItem("pellagos.progress", JSON.stringify({ created: save.created, seed: save.seed, skills: { blade: 99 }, gold: 30, pack: [{ id: "potion" }], gear: null }));
        }
    }, { ...SAVE, seed: 1 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // I opens the pack: the gold, the draught to use, the staff in hand, each skill untried (its tab)
    const pack = page.locator(".pack");

    await expect(page.locator("#playerplate .coins")).toHaveText("30 gold");
    await page.keyboard.press("i");
    await expect(pack).toBeVisible();
    await expect(pack.locator(".pack-gold")).toHaveText("30 gold");
    await expect(pack.locator(".carried .pack-cell[data-item]")).toHaveAttribute("aria-label", "Healing draught");
    await expect(pack.locator(".carried .pack-cell")).toHaveCount(20);
    await expect(pack.locator('.gear .pack-worn[data-slot="mainHand"]')).toHaveText(/^Weapon\s*Staff$/);
    await pack.getByRole("tab", { name: "Skills" }).click();
    await expect(pack.locator('.pack-skill[data-tree="blade"] .pack-skill-rank')).toHaveText("Untried (0)");
    await page.keyboard.press("Escape");
    await expect(pack).toBeHidden();

    // A blow at the orc: the blade's first rank, told
    const ranked = await page.evaluate(() => {
        const { game } = window.pellagos;
        const orc = game.battle.actor("orc");
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(player, { x: orc.x, y: orc.y + 2, square: [orc.square[0], orc.square[1] + 2] });
        game.previous.set("player", { x: player.x, y: player.y });
        game.avatars.get("player").place(player.x, player.y, Math.PI);

        for (let step = 0; step < 80 && game.progress.rank("blade") < 1 && !player.dead; step++) {
            game.advance(0.5, { render: false });
        }

        const told = document.querySelector("#banner").textContent;

        Object.assign(orc, { dead: true, respawnAt: Infinity });

        return { rank: game.progress.rank("blade"), told };
    });

    expect(ranked).toEqual({ rank: 1, told: "Blade: Trained!" });

    // Into the taproom to the barkeep, and what he has for sale: an ale bought for 2 gold
    await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        player.hp = player.maxHp;
        game.battle.command("player", { type: "enter", link: "tavern-door" });

        for (let second = 0; second < 120 && player.map !== "taproom"; second += 5) {
            game.advance(5, { render: false });
        }

        game.battle.command("player", { type: "move", to: [7, 6] });
        game.advance(5);

        // (Tapped again as he goes about the room, till the player's up to him: where he is
        // depends on how long the game ran before it was stopped. The camera's turned to look past
        // the player at him first, as it doesn't follow round: he may have gone behind it)
        for (let tap = 0; tap < 12 && game.battle.actor("barkeep").talkingTo !== "player"; tap++) {
            const barkeep = game.battle.actor("barkeep");

            game.cameraFollow.yaw = Math.atan2(player.x - barkeep.x, player.y - barkeep.y);
            game.cameraFollow.turning = 0;

            for (let k = 0; k < 5; k++) {
                game.advance(0.1);
            }

            const spot = session.view.toScreen(game.avatars.get("barkeep").point(0.6));

            if (spot) {
                game.tap(spot.x, spot.y, { time: performance.now() + 9000 * (tap + 1) });
            }

            game.advance(4);
        }

        game.start();
    });

    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await talk.getByRole("button", { name: /for sale/ }).click();
    await expect(talk).toBeHidden();
    await expect(pack).toBeVisible();
    await expect(pack.locator(".pack-title")).toContainText("Trading with");

    // Buy and Sell across the top, buying first: the wares under their kind, by name
    const modes = pack.locator(".pack-modes");

    await expect(modes.getByRole("tab")).toHaveText(["Buy", "Sell"]);
    await expect(modes.getByRole("tab", { name: "Buy" })).toHaveAttribute("aria-selected", "true");
    await expect(pack.locator(".pack-heading")).toHaveText(["Food, drink and draughts"]);
    await expect(pack.locator(".wares .pack-row")).toHaveText(["Feed bag2 goldBuy", "Hot meal5 goldBuy", "Meat bait3 goldBuy", "Tankard of ale2 goldBuy"]);

    // Tapped, a ware opens to say what it is (one at a time); tapped again, it closes
    const ware = (name) => pack.locator(".wares .pack-row", { hasText: name });

    await ware("Hot meal").locator(".pack-peek").click();
    await expect(ware("Hot meal").locator(".pack-peeked")).toHaveText("Heals 15 hit points.");
    await expect(ware("Hot meal").locator(".pack-peek")).toHaveAttribute("aria-expanded", "true");
    await ware("Tankard of ale").locator(".pack-price").click();
    await expect(ware("Tankard of ale").locator(".pack-peeked")).toHaveText("Fills your stamina.");
    await expect(pack.locator(".pack-peeked")).toHaveCount(1);
    await ware("Tankard of ale").locator(".pack-peek").click();
    await expect(pack.locator(".pack-peeked")).toHaveCount(0);

    // Bought once they've said they're sure: asked first, what it costs and what they'd have
    // left; cancelled, nothing spent
    const ask = pack.locator(".pack-ask");

    await pack.getByRole("button", { name: "Buy Tankard of ale for 2 gold" }).click();
    await expect(ask).toBeVisible();
    await expect(ask.locator(".pack-ask-title")).toHaveText("Buy Tankard of ale?");
    await expect(ask.locator(".pack-ask-text")).toHaveText("For 2 gold: you'd have 28 gold left.");
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(ask).toBeHidden();
    await expect(pack.locator(".pack-gold")).toHaveText("30 gold");
    await pack.getByRole("button", { name: "Buy Tankard of ale for 2 gold" }).click();
    await ask.getByRole("button", { name: "Buy", exact: true }).click();
    await expect(pack.locator(".pack-gold")).toHaveText("28 gold");
    await expect(page.locator("#playerplate .coins")).toHaveText("28 gold");

    // What's carried, on its own tab: each with what it fetches, sold back (for a gold piece);
    // then bought again; the pack closed with its button
    await modes.getByRole("tab", { name: "Sell" }).click();
    await expect(modes.getByRole("tab", { name: "Sell" })).toHaveAttribute("aria-selected", "true");
    await expect(pack.locator(".wares")).toHaveCount(0);
    expect(await pack.locator(".selling .pack-row").evaluateAll((rows) => rows.map((row) => row.dataset.item))).toEqual(["potion", "ale"]);
    await expect(pack.locator('.selling .pack-row[data-item="ale"]')).toHaveText("Tankard of ale1 goldSell");
    await pack.locator('.selling .pack-row[data-item="potion"] .pack-peek').click();
    await expect(pack.locator('.selling .pack-row[data-item="potion"] .pack-peeked')).toHaveText("Heals 25 hit points.");
    await pack.getByRole("button", { name: "Sell Tankard of ale for 1 gold" }).click();
    await expect(pack.locator(".pack-gold")).toHaveText("29 gold");
    expect(await pack.locator(".selling .pack-row").evaluateAll((rows) => rows.map((row) => row.dataset.item))).toEqual(["potion"]);
    await modes.getByRole("tab", { name: "Buy" }).click();
    await pack.getByRole("button", { name: "Buy Tankard of ale for 2 gold" }).click();
    await ask.getByRole("button", { name: "Buy", exact: true }).click();
    await expect(pack.locator(".pack-gold")).toHaveText("27 gold");
    await page.locator("#packbutton").click();
    await expect(pack).toBeHidden();

    // Kept for the next time (as it was read at the start): the blade trained, the gold, the ale
    const kept = await keptOf(page, "progress");

    expect(kept).toMatchObject({ created: SAVE.created, seed: 1, gold: 27 });
    expect(kept.pack.slice(0, 3)).toEqual([{ id: "potion", quality: "common", count: 1 }, { id: "ale", quality: "common", count: 1 }, null]);
    expect(kept.skills.blade).toBeGreaterThanOrEqual(100);
});

test("what lingers after a creature's blow shows on the player's plate, and its cure from the guild ends it", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Poisoned (as an adder's bite leaves them), a cure in their pack. The world stopped and
    // played on by hand: drawn without a GPU a frame can take a second or more, and the game's
    // time goes on no more than a tenth of a second a frame, so waiting on it as it's drawn is
    // waiting on how slow the machine is
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.host.players.get(game.me).progress.stow({ id: "antidote" }, 1);
        game.battle.afflict(game.me, "poison", { by: null });
        game.advance(0.1, { render: false });
    });

    const icon = page.locator('#playerplate .ail[aria-label="Poisoned"]');
    const banner = page.locator("#banner");

    await expect(icon).toBeVisible();
    await expect(banner).toContainText("You're poisoned! (Cure poison draught: the adventurers' guild sells them.)");

    // (What does them good shown apart from it, after it, the soonest over first: a blessing and
    // a ward, on tiles rimmed in gold)
    const shown = () => page.locator("#playerplate .ail:visible").evaluateAll((icons) => icons.map((each) => [each.getAttribute("aria-label"), each.classList.contains("buff")]));

    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.host.players.get(game.me).boons.push({ id: "blessing", label: "Blessed", melee: 0.05, until: game.battle.time + 600000, ms: 600000 });
        game.battle.buff(game.me, "resistFire", { ms: 60000 });
        game.advance(0.1, { render: false });
    });
    await expect(page.locator('#playerplate .ail.buff[aria-label="Blessed"]')).toBeVisible();
    expect(await shown()).toEqual([
        ["Poisoned", false],
        ["Resist Fire", true],
        ["Blessed", true],
    ]);

    // More than a row as wide as the bars: the last that won't fit an ellipsis; held, the card
    // shows them all; tapped, one row again
    await page.evaluate(() => {
        const { game } = window.pellagos;

        for (const kind of ["resistWater", "resistAir", "resistEarth", "resistMagic", "resistPoison", "resistDisease", "swole", "levitate"]) {
            game.battle.buff(game.me, kind, { ms: 120000 });
        }

        game.advance(0.1, { render: false });
    });

    const card = page.locator("#playerplate");
    const more = card.locator(".ail.more");

    await expect(more).toBeVisible();
    expect((await shown()).length).toBeLessThan(12);
    expect((await shown())[0]).toEqual(["Poisoned", false]);

    const { x, y } = await card.boundingBox();

    await card.dispatchEvent("pointerdown", { clientX: x + 20, clientY: y + 10 });
    await expect(card).toHaveClass(/\ball\b/);
    await card.dispatchEvent("pointerup");
    await expect(more).toBeHidden();
    expect((await shown()).length).toBe(11);

    await card.dispatchEvent("pointerdown", { clientX: x + 20, clientY: y + 10 });
    await card.dispatchEvent("pointerup");
    await expect(card).not.toHaveClass(/\ball\b/);
    await expect(more).toBeVisible();

    // (Hurting now and then: less health)
    expect(await playUntil(page, () => window.pellagos.game.battle.actor(window.pellagos.game.me).hp < 50)).toBe(true);

    // The cure drunk from the pack (opened while the game's listening, the world stopped again
    // while it's used): gone at once
    const pack = page.locator(".pack");
    const open = async () => {
        await page.evaluate(() => window.pellagos.game.start());
        await page.keyboard.press("i");
        await expect(pack).toBeVisible();
        await page.evaluate(() => window.pellagos.game.stop());
    };

    await open();
    await pack.locator('.carried .pack-cell[data-item="antidote"]').click();
    await expect(pack.locator(".pack-about")).toContainText("Cures what's poisoned at once.");
    await pack.locator(".pack-about").getByRole("button", { name: /^Drink/ }).click();
    expect(await playUntil(page, () => document.querySelector("#banner")?.textContent.includes("No longer poisoned."), { seconds: 2 })).toBe(true);
    await expect(icon).toHaveCount(0);
    expect(await page.evaluate(() => window.pellagos.game.battle.actor(window.pellagos.game.me).afflictions)).toEqual([]);

    // (With nothing to cure, a cure's kept)
    await page.evaluate(() => window.pellagos.game.host.players.get(window.pellagos.game.me).progress.stow({ id: "antidote" }, 1));
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("i");
    await expect(pack).toBeHidden();
    await open();
    await pack.locator('.carried .pack-cell[data-item="antidote"]').click();
    await pack.locator(".pack-about").getByRole("button", { name: /^Drink/ }).click();
    expect(await playUntil(page, () => document.querySelector("#banner")?.textContent.includes("There's nothing for that to cure."), { seconds: 2 })).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.progress.count("antidote"))).toBe(1);
});

test("the swordsmith's in the start town: its keeper behind the counter tells of today's special and sells it, once; what's on the racks today, so many of each, one fewer once bought", async ({ page }) => {
    // (Into the shop and a few clicks in it, each waiting on frames drawn in software)
    test.setTimeout(180000);

    // A saved game in seed 1's world, whose start town keeps a swordsmith's, with gold enough
    await page.addInitScript((save) => {
        localStorage.setItem("pellagos.save", JSON.stringify(save));

        if (!localStorage.getItem("pellagos.progress")) {
            localStorage.setItem("pellagos.progress", JSON.stringify({ created: save.created, seed: save.seed, gold: 20000, pack: [], gear: null }));
        }
    }, { ...SAVE, seed: 1 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // In by its door, and up to its keeper
    const inside = await page.evaluate(() => {
        const { game } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "swordsmith");
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const folk = game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player");
        const [keeper] = folk;

        game.approaching = keeper.id;
        game.battle.command("player", { type: "approach", target: keeper.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const stock = game.host.stockOf(keeper.id);

        game.start();

        return { map: player.map, folk: folk.map(({ id }) => game.host.folk.get(id)?.title), keeper: keeper.id, talking: Boolean(game.talking), shop: stock?.shop, wares: stock?.wares.length, specialLeft: stock?.specialLeft };
    });

    expect(inside).toMatchObject({ map: "home:swordsmith-1/shop", folk: ["Swordsmith"], talking: true, shop: "swordsmith", specialLeft: true });
    expect(inside.wares).toBeGreaterThanOrEqual(7);

    // Asked, they tell of today's special and its price, and show it
    const talk = page.locator(".talk");
    const pack = page.locator(".pack");

    await expect(talk).toBeVisible();
    await talk.getByRole("button", { name: "What's today's special?" }).click();

    const told = await talk.locator(".talk-line").textContent();
    const [, price] = told.match(/(\d+) gold/);

    await talk.getByRole("button", { name: "Let me see it." }).click();
    await expect(talk).toBeHidden();
    await expect(pack).toBeVisible();
    await expect(pack.locator(".pack-title")).toContainText("Trading with");

    // The special first, under its own heading, then the racks: so many of each left today
    const special = pack.locator(".pack-list.special .pack-row");

    await expect(pack.locator(".pack-heading").first()).toHaveText("Today's special");
    await expect(special).toHaveCount(1);
    await expect(special.locator(".pack-price")).toHaveText(`${price} gold`);
    expect(told.toLowerCase()).toContain((await special.locator(".pack-label").textContent()).toLowerCase());
    await expect(special.locator(".pack-left")).toHaveCount(0);

    const racked = pack.locator(".pack-list.wares:not(.special) .pack-row");

    await expect(racked).toHaveCount(inside.wares);
    expect(await racked.locator(".pack-left").allTextContents()).toEqual(Array(inside.wares).fill(expect.stringMatching(/^[123] left$/)));

    // One bought off the racks: one fewer of it, its price paid
    const first = racked.first();
    const left = Number((await first.locator(".pack-left").textContent()).split(" ")[0]);
    const cost = Number((await first.locator(".pack-price").textContent()).split(" ")[0]);

    await first.getByRole("button", { name: /^Buy / }).click();
    await pack.locator(".pack-ask").getByRole("button", { name: "Buy", exact: true }).click();
    await expect(pack.locator(".pack-gold")).toHaveText(`${20000 - cost} gold`);
    await expect(first.locator(".pack-left")).toHaveText(left > 1 ? `${left - 1} left` : "Sold out");

    // The special bought: paid for, and gone for the day
    await special.getByRole("button", { name: /^Buy today's special/ }).click();
    await pack.locator(".pack-ask").getByRole("button", { name: "Buy", exact: true }).click();
    await expect(pack.locator(".pack-gold")).toHaveText(`${20000 - cost - Number(price)} gold`);
    await expect(special.locator(".pack-left")).toHaveText("Sold out");
    await expect(special.getByRole("button", { name: /^Buy today's special/ })).toBeDisabled();
    expect(await page.evaluate((keeper) => window.pellagos.game.host.stockOf(keeper).specialLeft, inside.keeper)).toBe(false);
});

test("the Explosion spell bursts on an orc and throws it limp through the air, to land and get up again; a Goblin Bomb thrown from the pack lands lit and fizzing, then bursts and throws a wolf, tumbling", async ({ page }) => {
    test.setTimeout(150000);
    await playing(page, "/?play&seed=1");

    // An orc and a wolf by the player, standing still; the Tome of Explosion read
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.battle.add({ id: "target", kind: "orc", weapon: "cleaver", team: "orcs", square: [me.square[0] + 1, me.square[1] - 6], hp: 5000 }).stunnedUntil = 1e9;
        game.battle.add({ id: "wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: "beasts", square: [me.square[0] - 6, me.square[1] - 2], hp: 5000, wild: { creature: "wolf", tier: 2, temper: "aggressive", guard: 0, roam: 0, leash: 24, pack: "w", leader: null, menace: false } }).stunnedUntil = 1e9;
        game.enlisting.push("target", "wolf");
        game.progress.stow({ id: "tomeExplosion", quality: "common" });
        game.host.command(game.me, { type: "use", item: "tomeExplosion" });
        game.stop();
    });
    expect(await playUntil(page, () => ["target", "wolf"].every((id) => window.pellagos.game.avatars.has(id)))).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.progress.knows("explosion"))).toBe(true);

    // Cast on the orc: a burst of fire where it stands, the camera shaken, and the orc flung limp
    // into the air
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;

        Object.assign(game.battle.actor(game.me), { spellReadyAt: 0, spellsReadyAt: {} });

        return game.host.command(game.me, { type: "cast", spell: "explosion", target: "target" });
    })).toEqual({ ok: true });
    expect(await playUntil(page, () => window.pellagos.game.avatars.get("target").airborne, { seconds: 4 })).toBe(true);

    const burst = await page.evaluate(() => {
        const { game } = window.pellagos;

        return { showing: game.spellFx.running.length, shaking: game.shaking, thrown: game.avatars.get("target").thrown };
    });

    expect(burst.showing).toBeGreaterThan(3);
    expect(burst.shaking).toBeGreaterThan(0);
    expect(burst.thrown).toBe(true);

    // Down, then up on its feet where the battle has it
    expect(await playUntil(page, () => !window.pellagos.game.avatars.get("target").airborne, { seconds: 3 })).toBe(true);
    expect(await playUntil(page, () => !window.pellagos.game.avatars.get("target").thrown, { seconds: 6 })).toBe(true);
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;
        const [actor, { object }] = [game.battle.actor("target"), game.avatars.get("target")];
        const [ox, oz] = game.originOf(actor.map);

        return Math.hypot(object.position.x - ox - actor.x, object.position.z - oz - actor.y);
    })).toBeLessThan(1.5);

    // A Goblin Bomb thrown at the wolf: one used; the bomb in the air, then lying lit where it
    // lands; then it bursts, gone, and the wolf's thrown
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;

        game.progress.stow({ id: "goblinBomb", quality: "common" }, 2);

        return game.host.command(game.me, { type: "use", item: "goblinBomb", target: "wolf" });
    })).toEqual({ ok: true });
    expect(await page.evaluate(() => window.pellagos.game.progress.pack.find(({ id }) => id === "goblinBomb").count)).toBe(1);
    expect(await playUntil(page, () => window.pellagos.game.spellFx.bombs.size === 1, { seconds: 2 })).toBe(true);
    expect(await playUntil(page, () => window.pellagos.game.avatars.get("wolf").thrown, { seconds: 4 })).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.spellFx.bombs.size)).toBe(0);
    expect(await playUntil(page, () => !window.pellagos.game.avatars.get("wolf").thrown, { seconds: 6 })).toBe(true);
});

test("each people's bomb throwers' bombs drawn as their own as they're lobbed: a grenado, a starfire seed pod, a shadowfire orb in silk, a sun jar and a swamp-gas bladder, each lying lit or glowing where it lands, then bursting", async ({ page }) => {
    test.setTimeout(150000);
    await playing(page, "/?play&seed=1");

    // (An orc a way off, standing still, thrown at in turn: each people's bomb lobbed by the
    // player as their bomb throwers lob it)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.add({ id: "target", kind: "orc", weapon: "cleaver", team: "orcs", square: [me.square[0] + 1, me.square[1] - 6], hp: 1e6 }).stunnedUntil = 1e12;
        game.enlisting.push("target");
    });
    expect(await playUntil(page, () => window.pellagos.game.avatars.has("target"))).toBe(true);

    const drawn = {};

    for (const [people, { weapon }] of Object.entries(BOMBERS)) {
        const kind = NATURAL[weapon].attacks.find(({ bomb }) => bomb).bomb;

        expect(await page.evaluate((kind) => {
            const { game } = window.pellagos;

            Object.assign(game.battle.actor("target"), { hp: 1e6, stunnedUntil: 1e12, thrownAt: -Infinity });

            return game.host.battle.lob(game.me, "target", { kind, damage: [1, 1], reach: 12 });
        }, kind)).toEqual({ ok: true });
        expect(await playUntil(page, () => [...window.pellagos.game.spellFx.bombs.values()].some(({ ring }) => ring), { seconds: 3 })).toBe(true);

        drawn[people] = await page.evaluate(() => {
            const [{ object }] = window.pellagos.game.spellFx.bombs.values();
            const colours = [];

            object.traverse((node) => node.isMesh && colours.push(node.material.color.getHexString()));

            return colours.sort().join();
        });
        expect(await playUntil(page, () => window.pellagos.game.spellFx.bombs.size === 0, { seconds: 4 })).toBe(true);
        expect(await playUntil(page, () => !window.pellagos.game.avatars.get("target").thrown, { seconds: 6 })).toBe(true);
    }

    // (Each its own)
    expect(new Set(Object.values(drawn)).size).toBe(Object.keys(BOMBERS).length);
});

test("a Scroll of Safety read from the pack: a circle of runes grows under the player for three seconds, then they're in their home town's market square, the circle shrinking away there; struck down first, it's lost", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // (Out of town, a way from its square, the orc out of the way)
    const square = await page.evaluate(() => {
        const { game } = window.pellagos;
        const [x, y] = game.world.spawns.player;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.host.players.get(game.me).progress.stow({ id: "scrollOfSafety" }, 2);
        game.host.battle.place(game.me, "town", [x + 40, y + 10]);
        game.advance(0.5, { render: false });

        return [x + 0.5, y + 0.5];
    });
    const away = () => page.evaluate(([x, y]) => Math.hypot(window.pellagos.game.battle.actor("player").x - x, window.pellagos.game.battle.actor("player").y - y), square);
    // (The circles under anyone: how wide each is, metres)
    const circles = () => page.evaluate(() => window.pellagos.game.spellFx.running.filter(({ object }) => object.name === "underfoot" && object.visible).map(({ object }) => object.scale.x * 2));
    const pack = page.locator(".pack");
    // (The pack opened while the game's listening, the world stopped again while it's used; and
    // left open after)
    const read = async () => {
        if (await pack.isHidden()) {
            await page.evaluate(() => window.pellagos.game.start());
            await page.keyboard.press("i");
            await expect(pack).toBeVisible();
            await page.evaluate(() => window.pellagos.game.stop());
        }

        await pack.locator('.carried .pack-cell[data-item="scrollOfSafety"]').click();
        await expect(pack.locator(".pack-about")).toContainText("the market square of the town you started in");
        await pack.locator(".pack-about").getByRole("button", { name: /^Read/ }).click();
        expect(await playUntil(page, () => document.querySelector("#banner")?.textContent.includes("You read the Scroll of Safety"), { seconds: 1 })).toBe(true);
    };
    const play = (seconds) => page.evaluate((seconds) => window.pellagos.game.advance(seconds, { render: false }), seconds);

    expect(await away()).toBeGreaterThan(30);
    await read();

    // Growing under them as they read, to two metres across
    const [early] = await circles();

    await play(1.5);

    const [later] = await circles();

    expect(early).toBeLessThan(later);
    expect(later).toBeLessThan(2);
    expect(await away()).toBeGreaterThan(30);

    // Three seconds on: in the market square, the circle under them there, shrinking away
    expect(
        await playUntil(
            page,
            () => {
                const { game } = window.pellagos;
                const [x, y] = game.world.spawns.player;

                return Math.hypot(game.battle.actor("player").x - x - 0.5, game.battle.actor("player").y - y - 0.5) < 3;
            },
            { seconds: 2 },
        ),
    ).toBe(true);
    expect(await page.evaluate(() => document.querySelector("#banner").textContent)).toContain("Safe: the market square of");

    // (Shown there once they're placed there: a step after they're carried)
    await play(0.2);

    const [arrived] = await circles();

    await play(1.5);

    const [shrinking] = await circles();

    expect(shrinking).toBeLessThan(arrived);
    await play(2);
    expect(await circles()).toEqual([]);

    // Read again out of town, and struck down before it's read through: the circle gone at once,
    // and they lie where they fell
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const [x, y] = game.world.spawns.player;

        game.host.battle.place(game.me, "town", [x + 40, y + 10]);
        game.advance(0.5, { render: false });
    });
    await read();
    expect((await circles()).length).toBe(1);
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.battle.actor(game.me).hp = 1;
        game.battle.afflict(game.me, "poison", { power: 5 });
    });
    expect(await playUntil(page, () => window.pellagos.game.battle.actor("player").dead, { seconds: 3 })).toBe(true);
    expect(await circles()).toEqual([]);
    await play(1.5);
    expect(await away()).toBeGreaterThan(30);
    expect(await page.evaluate(() => window.pellagos.game.progress.count("scrollOfSafety"))).toBe(0);
});

test("the pack stacks things alike: dragged together, split by how many, held for a thing's wheel; thrown away and taken back; dropped on the ground, and picked up", async ({ page }) => {
    // (A long walk through: more than the usual time, with others running beside it)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const pack = page.locator(".pack");
    const cell = (index) => pack.locator(`.carried .pack-cell[data-index="${index}"]`);
    const middle = async (locator) => {
        const box = await locator.boundingBox();

        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    // Two draughts in the first slot, an ale in the second, three more draughts in the sixth
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { pack } = game.host.players.get(game.me).progress;

        pack[0] = { id: "potion", quality: "common", count: 2 };
        pack[1] = { id: "ale", quality: "common", count: 1 };
        pack[5] = { id: "potion", quality: "common", count: 3 };
    });
    await page.keyboard.press("i");
    await expect(cell(0).locator(".pack-count")).toHaveText("2");

    // (The world stops being drawn while the pack's used: drawn without a GPU, a frame can take
    // longer than a hold, and a drag would be taken for one)
    await page.evaluate(() => window.pellagos.game.stop());
    await expect(cell(5).locator(".pack-count")).toHaveText("3");
    await expect(cell(1).locator(".pack-count")).toHaveCount(0);

    // The three dragged onto the two: five, together
    const from = await middle(cell(5));
    const onto = await middle(cell(0));

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y, { steps: 3 });
    await page.mouse.move(onto.x, onto.y, { steps: 8 });
    await page.mouse.up();
    await expect(cell(0).locator(".pack-count")).toHaveText("5");
    await expect(cell(5)).toHaveClass(/empty/);

    // Held on the five: their wheel (drink, put on a wheel, split, throw away, drop); flicked E,
    // how many to split off (two, to start with), and split off into the first empty slot
    const five = await middle(cell(0));
    const wheel = page.locator(".item-wheel");

    await page.mouse.move(five.x, five.y);
    await page.mouse.down();
    await expect(wheel).toBeVisible();

    const slice = (direction) => wheel.locator(`.slice[data-direction="${direction}"] .label`);

    await expect(slice("n")).toHaveText("Drink");
    await expect(slice("ne")).toHaveText("Put on a wheel");
    await expect(slice("e")).toHaveText("Split");
    await expect(slice("s")).toHaveText("Throw away");
    await expect(slice("w")).toHaveText("Drop");
    await page.mouse.move(five.x + 20, five.y, { steps: 2 });
    await page.mouse.move(five.x + 50, five.y, { steps: 2 });
    await page.mouse.up();

    const ask = pack.locator(".pack-ask");

    await expect(ask).toBeVisible();
    await expect(ask.locator(".pack-ask-title")).toHaveText("Split Healing draught");
    await expect(ask.locator(".pack-ask-count")).toHaveText("2");
    await ask.getByRole("button", { name: "Split off" }).click();
    await expect(cell(0).locator(".pack-count")).toHaveText("3");
    await expect(cell(2).locator(".pack-count")).toHaveText("2");

    // Put on the player's own wheel, from its buttons
    await cell(0).click();
    await pack.getByRole("button", { name: "Put on a wheel: Healing draught" }).click();
    await expect(page.locator("#banner")).toHaveText("Draught put on your own wheel one, at NE.");
    expect(await page.evaluate(() => window.pellagos.game.wheels.self[0])).toEqual({ n: "vigor", ne: "item:potion" });

    // The two thrown away, and taken back
    await cell(2).click();
    await pack.getByRole("button", { name: "Throw away: Healing draught" }).click();
    await expect(cell(2)).toHaveClass(/empty/);
    await expect(page.locator("#banner")).toContainText("Thrown away: 2 healing draughts.");
    await page.locator("#banner .banner-action").click();
    await expect(cell(2).locator(".pack-count")).toHaveText("2");

    // Right-clicked, the ale's wheel stays open to click: dropped where the player stands
    await cell(1).click({ button: "right" });
    await expect(wheel).toBeVisible();
    await wheel.locator('.slice[data-action="drop"]').click();
    await expect(cell(1)).toHaveClass(/empty/);
    expect(await page.evaluate(() => [...window.pellagos.game.host.ground.values()].map(({ item }) => item))).toEqual([{ id: "ale", quality: "common", count: 1 }]);
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("Escape");
    await expect(pack).toBeHidden();

    // A bundle where it lies, its icon over it; tapped, picked up
    await expect.poll(() => page.evaluate(() => window.pellagos.game.drops.drawn.size)).toBe(1);

    const bundle = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const [drawn] = game.drops.drawn.values();

        return session.view.toScreen(drawn.object.position.clone());
    });

    // (What's picked up rising over the player, no message across the screen: kept for the
    // journal all the same)
    await page.mouse.click(bundle.x, bundle.y);
    await expect.poll(() => page.evaluate(() => window.pellagos.game.messages.at(-1)?.text)).toBe("You pick up a tankard of ale.");
    await expect(page.locator("#banner")).not.toHaveText("You pick up a tankard of ale.");
    expect(await page.evaluate(() => ({ ground: window.pellagos.game.host.ground.size, ale: window.pellagos.game.progress.count("ale") }))).toEqual({ ground: 0, ale: 1 });
});

test("the town hall: the reeve gives work, and pays for what's done; the journal shows where the player stands, what they carry and where it takes them; given up, it's set down", async ({ page }) => {
    // (A long walk through: more than the usual time, with others running beside it)
    test.setTimeout(180000);

    await playing(page, "/?play&seed=1");

    // Into the home town's hall, up to the reeve's desk
    const hall = await page.evaluate(() => {
        const { game } = window.pellagos;
        const building = game.world.interiors.buildings.get("home:hall-1");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.command("player", { type: "enter", link: building.door.id });

        for (let second = 0; second < 90 && game.battle.actor("player").map === "town"; second += 5) {
            game.advance(5, { render: false });
        }

        game.battle.command("player", { type: "move", to: [8, 5] });
        game.advance(6, { render: false });
        game.battle.command("player", { type: "move", to: [8, 4] });
        game.advance(3);

        return { map: game.battle.actor("player").map, roles: building.folk.map(({ role }) => role), name: building.name };
    });

    expect(hall.map).toBe("home:hall-1/chamber");
    expect(hall.roles).toEqual(expect.arrayContaining(["reeve", "clerk"]));

    // The reeve: work, taken on. (Turned to look at him behind his desk first, as the player would
    // to tap him: indoors the camera's close behind them, under the ceiling, and they came up to it
    // stepping east. Tapped on his head: the hero's random, and a tall one's head is just under his
    // chest, seen from behind them)
    const reeve = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const [player, at] = [game.battle.actor("player"), game.battle.actor("home:hall-1/reeve")];
        const toward = Math.atan2(at.x - player.x, at.y - player.y);

        game.cameraFollow.yaw = Math.atan2(-Math.sin(toward), -Math.cos(toward));
        game.advance(0.5);

        const spot = session.view.toScreen(game.avatars.get("home:hall-1/reeve").point(0.8));

        game.tap(spot.x, spot.y, { time: performance.now() + 9000 });
        game.advance(8);
        game.start();

        return game.world.interiors.buildings.get("home:hall-1").folk.find(({ role }) => role === "reeve").name;
    });
    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-name")).toHaveText(reeve);
    await expect(talk.locator(".talk-title")).toHaveText("Reeve");
    await talk.getByRole("button", { name: /work for me/ }).click();
    await expect(talk.locator(".talk-line")).toContainText(/gold|rolls/);
    await talk.getByRole("button", { name: "I'll do it." }).click();
    await expect(page.locator("#banner")).toContainText("New request");

    const taken = await page.evaluate(() => window.pellagos.game.standing.requests.map(({ title, from }) => ({ title, from: from.name })));

    expect(taken).toHaveLength(1);
    expect(taken[0].from).toBe(reeve);

    // A letter for the reeve (as if brought from another town), handed over and paid for
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const home = game.world.start;

        game.standing.take({ kind: "message", title: "A letter to carry", key: home.id, from: { id: "x", name: "Ida Crane", title: "Reeve", town: "elsewhere", townName: "Elsewhere", post: "hall" }, target: { town: home.id, name: home.name, at: [...home.at], post: "hall" }, text: "Carry this letter.", given: 0, until: 999, state: "open", count: 0, reward: { standing: 20, gold: 9 } });
    });
    await talk.getByRole("button", { name: /Where do I stand/ }).click();
    await expect(talk.locator(".talk-line")).toContainText("Commoner");
    await talk.getByRole("button", { name: /It's done/ }).click();
    await expect(talk.locator(".talk-line")).toContainText("A letter from Elsewhere");
    await expect(page.locator("#playerplate .coins")).toHaveText("29 gold");
    await page.keyboard.press("Escape");
    await expect(talk).toBeHidden();

    // J: the journal, their rank, the work they carry and where it takes them, and the letter done
    const journal = page.getByRole("dialog", { name: "Journal" });

    await page.keyboard.press("j");
    await expect(journal).toBeVisible();
    await expect(journal.locator(".journal-rank")).toContainText("Commoner of the Kingdom of");
    await expect(journal.locator(".journal-request-title")).toHaveText([taken[0].title]);
    await expect(journal.locator(".journal-done")).toContainText(["A letter to carry"]);
    await expect(journal.locator(".journal-people")).toContainText("Ruled by");
    await expect(journal.locator(".journal-guild")).toContainText("Not registered");

    // Given up: set down, and the journal closed with its button
    await journal.getByRole("button", { name: `Give up ${taken[0].title}` }).click();
    await expect(journal.locator(".journal-request")).toHaveCount(0);
    await expect(journal.locator(".journal-done").first()).toContainText("Given up");
    await page.locator("#journalbutton").click();
    await expect(journal).toBeHidden();
});

test("a building gone into is marked on the minimap; holding the minimap opens the world map, fog over all but where the player's been", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Nothing marked yet; into Wenches and Ale and out again, then a walk out of town
    const found = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const before = { icons: game.icons().length, chunks: game.explored.chunksVisited };

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        for (const map of ["taproom", "town"]) {
            game.battle.command("player", { type: "enter", link: "tavern-door" });

            for (let k = 0; k < 200 && player.map !== map; k++) {
                game.advance(0.25, { render: false });
            }
        }

        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        // (The buildings' icons: the places worth finding near have theirs too, their own test's)
        const buildings = ["tavern", "blacksmith", "church", "guild", "hall", "keep"];
        const marked = { icons: game.icons().map(({ kind }) => kind), minimap: game.minimap.icons.filter((kind) => buildings.includes(kind)), entered: [...game.explored.entered] };

        // (Somewhere 150 metres off that can be walked to)
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;

        for (let k = 0; k < 16 && !player.path.length; k++) {
            const to = [Math.round(px + Math.cos((k * Math.PI) / 8) * 150), Math.round(py + Math.sin((k * Math.PI) / 8) * 150)];

            if (!squares.blocked(...to)) {
                game.battle.command("player", { type: "move", to, run: true });
                game.advance(0.1, { render: false });
            }
        }

        // (A minute's walk, and on till they're there: they run out of breath and walk the last of
        // it, so they're still going after a minute, and the minimap's held below with them stood
        // still, any order it gives seen)
        for (let k = 0; k < 240 && (k < 120 || player.order); k++) {
            game.advance(0.5, { render: false });
        }

        return { before, marked, chunks: game.explored.chunksVisited, map: player.map, order: player.order?.type ?? null };
    });

    expect(found.before).toEqual({ icons: 0, chunks: 1 });
    expect(found.marked).toEqual({ icons: ["tavern"], minimap: ["tavern"], entered: ["home:tavern"] });
    expect(found.chunks).toBeGreaterThanOrEqual(3);
    expect(found.order).toBeNull();

    // Held (not tapped): the world map, the game paused under it
    await page.evaluate(() => window.pellagos.game.start());

    const box = await page.locator("#minimap").boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForFunction(() => window.pellagos.worldMap?.drawn, null, { polling: 100 });

    const map = await page.evaluate(() => {
        const { game, worldMap } = window.pellagos;

        const buildings = ["tavern", "blacksmith", "church", "guild", "hall", "keep"];

        return { open: document.querySelector("#worldmap").open, running: game.running, order: game.battle.actor("player").order?.type ?? null, drawn: { ...worldMap.drawn, icons: worldMap.drawn.icons.filter((kind) => buildings.includes(kind)) }, chunks: game.explored.chunksVisited, town: game.world.plan.places.find(({ at }) => Math.hypot(at[0] - game.world.stamp.middle[0], at[1] - game.world.stamp.middle[1]) < 200)?.name };
    });

    expect(map.open).toBe(true);
    expect(map.running).toBe(false);
    expect(map.order).toBeNull();
    expect(map.drawn.fogged).toBe(128 * 128 - map.chunks);
    expect(map.drawn.chunks.length).toBe(map.chunks);
    expect(map.drawn.icons).toEqual(["tavern"]);
    expect(map.drawn.names).toContain(map.town);
    await expect(page.getByRole("heading", { name: "The world" })).toBeVisible();
    // (Its key folded away at first to its "Key" button in the corner, the map seen whole; tapped,
    // open above it, within the screen: each kind of building gone into, a barracks' and the seven
    // shops among them; the fog; the circles of what's been heard tell of, and a hell's cult's; a
    // camp or lair tracked home; and the pin. Tapped again, folded away)
    const key = page.getByRole("button", { name: "Key", exact: true });
    const viewport = page.viewportSize();

    await expect(key).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#worldmapkey")).toBeHidden();
    expect((await page.locator("#worldmaplegend").boundingBox()).height).toBeLessThan(60);
    await key.click();
    await expect(key).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#worldmapkey")).toBeVisible();
    await expect(page.locator("#worldmapkey li")).toHaveCount(20);
    await expect(page.locator("#worldmapkey li", { hasText: "Mystic Emporium" })).toBeVisible();
    await expect(page.locator("#worldmapkey li", { hasText: "Your markers (up to 10): tap one to share it or take it away" })).toBeVisible();
    await expect(page.locator("#worldmapkey li", { hasText: "Heard tell of: somewhere in it" })).toBeVisible();
    await expect(page.locator("#worldmapkey li", { hasText: "Strange lights by night" })).toBeVisible();
    await expect(page.locator("#worldmapkey li", { hasText: "Tracked home by its trails" })).toBeVisible();

    const opened = await page.locator("#worldmaplegend").boundingBox();

    expect(opened.y).toBeGreaterThanOrEqual(0);
    expect(opened.y + opened.height).toBeLessThanOrEqual(viewport.height);
    await key.click();
    await expect(key).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#worldmapkey")).toBeHidden();

    // The mouse over the tavern's icon: what it is, said over it; off it, gone
    const tip = page.locator("#worldmap .worldmap-tip");
    const tavern = await page.evaluate(() => {
        const { worldMap } = window.pellagos;
        const rect = worldMap.canvas.getBoundingClientRect();
        const spot = worldMap.spots.find(({ about }) => /\(tavern\)$/.test(about));

        return spot && { x: rect.left + spot.x, y: rect.top + spot.y, about: spot.about };
    });

    expect(tavern.about).toMatch(/^.+ \(tavern\)$/);
    await expect(tip).toBeHidden();
    await page.mouse.move(tavern.x, tavern.y);
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(tavern.about);

    const said = await tip.boundingBox();

    expect(said.y + said.height).toBeLessThanOrEqual(tavern.y);
    await page.mouse.move(tavern.x + 120, tavern.y + 120);
    await expect(tip).toBeHidden();

    // Zoomed right out, the whole world under its fog; Escape closes it and the game goes on
    await page.locator("#worldmapout").click();
    await page.locator("#worldmapout").click();

    expect(await page.evaluate(() => window.pellagos.worldMap.view.scale)).toBeGreaterThan(3);
    await page.keyboard.press("Escape");
    await expect(page.locator("#worldmap")).not.toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(true);

    // (Closed, what's quickly painted again let go: its canvas's pixels, its fog's layer)
    expect(await page.evaluate(() => ({ width: window.pellagos.worldMap.canvas.width, layer: window.pellagos.worldMap.layer }))).toEqual({ width: 1, layer: null });

    // M opens it too, painted afresh, and closes it again
    await page.keyboard.press("m");
    await expect(page.locator("#worldmap")).toBeVisible();
    await page.waitForFunction(() => window.pellagos.worldMap.canvas.width > 1 && window.pellagos.worldMap.layer);
    await page.keyboard.press("m");
    await expect(page.locator("#worldmap")).not.toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(true);
});

test("a people's castle's undercroft, down the stairs from its great hall: the castle's smith at its forge, its quartermaster and arcanist behind their counters, the quartermaster's racks for sale, a legendary make among them", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // Into the elves' castle's keep, and down the stairs from its great hall
    const below = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        const site = game.world.plan.sites.find(({ race, kind }) => race === "elf" && kind === "castle");
        const until = async (done, steps = 120) => {
            for (let k = 0; k < steps && !done(); k++) {
                game.advance(0.1);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };

        Object.assign(player, { x: site.at[0] + 0.5, y: site.at[1] + 40.5, path: [], order: null, progress: null });

        for (let k = 0; k < 8; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        const keep = game.world.interiors.buildings.get(`site:${site.id}`);
        const [ox, oy] = keep.entrance.outside;

        Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null });
        game.host.command("player", { type: "enter", link: keep.door.id });
        await until(() => player.map !== "town");
        game.host.command("player", { type: "enter", link: keep.stairs.id });
        await until(() => player.map === `${keep.key}/undercroft`, 200);
        await until(() => game.interiors.get(player.map)?.object.visible && ["smith", "quartermaster", "arcanist"].every((local) => game.avatars.get(`${keep.key}/${local}`)), 200);

        // (Before the quartermaster's counter, tapping them till they're come to talk, as they go
        // between it and their racks)
        const quartermaster = game.battle.actor(`${keep.key}/quartermaster`);
        const { session } = window.pellagos;

        Object.assign(player, { x: quartermaster.square[0] + 0.5, y: 3.5, path: [], order: null, progress: null });

        // (The camera turned to look past the player at them, as it doesn't follow round)
        game.cameraFollow.yaw = Math.atan2(player.x - quartermaster.x, player.y - quartermaster.y);
        game.cameraFollow.turning = 0;

        for (let k = 0; k < 20; k++) {
            game.advance(0.1);
        }

        for (let tap = 0; tap < 12 && quartermaster.talkingTo !== "player"; tap++) {
            const spot = session.view.toScreen(game.avatars.get(quartermaster.id).point(0.6));

            game.tap(spot.x, spot.y, { time: performance.now() + 9000 * (tap + 1) });
            game.advance(2);
        }

        game.start();

        return { map: player.map, folk: keep.folk.filter(({ map }) => map === player.map).map(({ role }) => role), talking: quartermaster.talkingTo };
    });

    expect(below.folk).toEqual(["smith", "apprentice", "quartermaster", "arcanist"]);
    expect(below.talking).toBe("player");

    // What's on the racks: the castle's arms and armour, the best of each made as well as it can be
    const talk = page.locator(".talk");
    const pack = page.locator(".pack");

    await expect(talk).toBeVisible();
    await expect(talk).toContainText("Quartermaster");
    await talk.getByRole("button", { name: /on the racks/ }).click();
    await expect(pack).toBeVisible();
    await expect(pack.locator(".pack-title")).toContainText("Trading with");
    await expect(pack.locator(".pack-heading")).toHaveText(["Weapons", "Shields and off hand", "Clothes and armour"]);
    await expect(pack.locator(".wares .pack-row.rarity-legendary").first()).toBeVisible();

    // A legendary piece tapped: what it does, the bonuses it comes with (rolled as it's bought),
    // and what buying and putting it on would change
    const legendary = pack.locator(".wares .pack-row.rarity-legendary").first();

    await legendary.locator(".pack-peek").click();
    await expect(legendary.locator(".pack-peeked .pack-kind")).toContainText("Legendary");
    await expect(legendary.locator(".pack-peeked .pack-rolls")).toContainText("rolled as it's bought, and a name of its own:");
    await expect(legendary.locator(".pack-peeked .pack-compare")).toContainText("Bought and put on instead of what's worn:");
});

test("the places worth finding are on the minimap near them and on the world map once the player's been by, rimmed in who holds them, a cleared one grey till it's held again", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const seen = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const war = game.host.war;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // The ruins nearest the start town: not on the world map till the player's been by
        const [ruins] = game.placeIcons()
            .filter(({ kind }) => kind === "ruins")
            .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.y) - Math.hypot(b.x - player.x, b.z - player.y));
        const before = game.worldMapView().icons.some(({ id }) => id === ruins.id);

        Object.assign(player, { x: ruins.x + 20, y: ruins.z + 20, path: [], order: null, progress: null });

        for (let k = 0; k < 20; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        const near = game.placeIcons().find(({ id }) => id === ruins.id);
        const after = { minimap: game.minimap.icons.includes("ruins"), map: game.worldMapView().icons.some(({ id }) => id === ruins.id), holder: near.holder, rim: near.rim, moved: Math.hypot(near.x - ruins.x, near.z - ruins.z) };

        // Cleared: grey till PLACE_TIMES.retake turns on, then held again
        war.clearPlace(ruins.id);

        const cleared = game.placeIcons().find(({ id }) => id === ruins.id).holder;

        war.turn += 120;

        const again = game.placeIcons().find(({ id }) => id === ruins.id).holder;
        const castle = game.placeIcons().find(({ kind }) => kind === "castle");

        return { before, after, cleared, again, castle: castle.holder, kinds: [...new Set(game.placeIcons().map(({ kind }) => kind))].length };
    });

    expect(seen.before).toBe(false);
    expect(seen.after).toMatchObject({ minimap: true, map: true, holder: "dead", rim: "#7fe0b8" });
    expect(seen.after.moved).toBeLessThan(80);
    expect(seen.cleared).toBe("cleared");
    expect(seen.again).toBe("dead");
    expect(seen.castle).toBe("friendly");
    expect(seen.kinds).toBeGreaterThan(10);
});

test("an old graveyard outside the start town: walled, its graves, tombs and yew laid out and drawn; its dead out by day, a skeleton leading them; on the minimap", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const graveyard = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // The graveyard nearest the start town, and how far it is from it
        const start = [player.x, player.y];
        const [icon] = game.placeIcons()
            .filter(({ kind }) => kind === "graveyard")
            .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.y) - Math.hypot(b.x - player.x, b.z - player.y));
        const site = game.world.plan.sites.find(({ id }) => id === icon.id);

        Object.assign(player, { x: icon.x + 18, y: icon.z, path: [], order: null, progress: null });

        for (let k = 0; k < 16; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        const set = game.world.maps.town.sites.set.get(site.id);
        const held = game.host.held.get(site.id);
        const chunk = 64;
        const near = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [Math.floor(set.x / chunk) + dx, Math.floor(set.y / chunk) + dy]));

        return {
            out: Math.hypot(icon.x - start[0], icon.z - start[1]),
            parts: [...new Set(set.pieces.map(({ part }) => part?.part))].sort(),
            yew: near.some(([cx, cy]) => game.world.maps.town.sites.treesIn(cx, cy).some((tree) => tree.site === site.id)),
            minimap: game.minimap.icons.includes("graveyard"),
            holder: icon.holder,
            band: held?.ids.map((id) => game.battle.actor(id).wild.creature) ?? [],
        };
    });

    expect(graveyard.out).toBeLessThan(1500);
    expect(graveyard.parts).toEqual(expect.arrayContaining(["flags", "gate", "gatepost", "grave", "lowWall"]));
    expect(graveyard.parts.includes("tomb") || graveyard.parts.includes("mausoleum")).toBe(true);
    expect(graveyard.yew).toBe(true);
    expect(graveyard.minimap).toBe(true);
    expect(graveyard.holder).toBe("dead");
    expect(graveyard.band[0]).toBe("skeleton");
    expect(new Set(graveyard.band.slice(1))).toEqual(new Set(["skeleton", "ghost"]));
});

test("each people's works out in their lands: a lumber mill in its ring of trees, its guards out at their posts and on their round, of its people, drawn; on the minimap; the journal tells of the works held and what's in the stores", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const works = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // The humans' lumber mill nearest the start town, and the player gone to its yard
        const mill = game.host.war.works
            .filter(({ owner, kind }) => owner === "human" && kind === "lumber mill")
            .sort((a, b) => Math.hypot(a.at[0] - player.x, a.at[1] - player.y) - Math.hypot(b.at[0] - player.x, b.at[1] - player.y))[0];
        const site = game.world.plan.sites.find(({ id }) => id === mill.id);
        const set = (game.world.maps.town.sites.heartOf(site), game.world.maps.town.sites.set.get(mill.id));

        Object.assign(player, { x: set.yard[0] + 0.5, y: set.yard[1] + 0.5, square: [Math.floor(set.yard[0]), Math.floor(set.yard[1])], path: [], order: null, progress: null });

        for (let k = 0; k < 40; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        const out = game.host.worksOut.get(mill.id);
        const chunk = 64;

        window.worksSeen = mill.id;
        const near = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => [Math.floor(set.x / chunk) + dx, Math.floor(set.y / chunk) + dy]));

        return {
            parts: [...new Set(set.pieces.map(({ part }) => part?.part))].sort(),
            trees: near.flatMap(([cx, cy]) => game.world.maps.town.sites.treesIn(cx, cy).filter((tree) => tree.site === mill.id)).length,
            guards: out?.ids.map((id) => ({ id, team: game.battle.actor(id)?.team })) ?? [],
            minimap: game.minimap.icons.includes("mill"),
            icon: game.worksIcons().find(({ id }) => id === mill.id),
        };
    });

    expect(works.parts).toEqual(expect.arrayContaining(["clamp", "cordwood", "lodge", "logdeck", "planks", "sawshed", "stump"]));
    expect(works.trees).toBeGreaterThanOrEqual(14);
    expect(works.guards).toHaveLength(6);
    expect(works.guards.every(({ team }) => team === "human")).toBe(true);
    expect(works.guards.filter(({ id }) => id.includes("/guard-"))).toHaveLength(4);
    expect(works.minimap).toBe(true);
    expect(works.icon).toMatchObject({ kind: "mill", rim: "#e2c25a" });

    // (Drawn a few at a time, as a town's soldiers are)
    expect(await playUntil(page, () => (window.pellagos.game.host.worksOut.get(window.worksSeen)?.ids ?? []).every((each) => window.pellagos.game.avatars.has(each)))).toBe(true);

    // The journal: their works held, and what's in their stores
    const journal = page.getByRole("dialog", { name: "Journal" });

    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("j");
    await expect(journal).toBeVisible();
    await expect(journal.locator(".journal-people")).toContainText(/\d+ towns? and 6 works held\./);
    await expect(journal.locator(".journal-people")).toContainText(/In their stores: \d+ wood, \d+ stone, \d+ metal\./);
});

test("a convoy on the road near the player: its wagons drawn, an ox in each one's shafts and its goods aboard, its captain and guards of its people; said; emptied at the road's end", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    const met = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const war = game.host.war;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        window.said = [];

        const message = game.hud.message.bind(game.hud);

        game.hud.message = (text, ...rest) => {
            window.said.push(text);

            return message(text, ...rest);
        };

        // A convoy of the humans' wood on the road out of the start town, 160 m on along it,
        // bound for their seat at the end of the next 30 m of it
        const home = war.town(game.world.start.id);
        const other = war.towns.filter(({ owner, id }) => owner === "human" && id !== home.id).sort((a, b) => Math.hypot(a.at[0] - home.at[0], a.at[1] - home.at[1]) - Math.hypot(b.at[0] - home.at[0], b.at[1] - home.at[1]))[0];
        const road = war.roads.route(home.id, other.id).points;
        const along = (metres) => {
            for (let k = 1, left = metres; k < road.length; k++) {
                const [[ax, ay], [bx, by]] = [road[k - 1], road[k]];
                const run = Math.hypot(bx - ax, by - ay);

                if (left <= run) {
                    return [ax + ((bx - ax) * left) / run, ay + ((by - ay) * left) / run];
                }

                left -= run;
            }

            return road.at(-1);
        };
        const at = along(160);

        window.convoyAt = at;

        const works = war.works.find(({ owner }) => owner === "human");

        war.forces.push({ id: "force-990", realm: "human", kind: "convoy", size: 7, at: [...at], path: [at, along(175), along(190)], leg: 0, target: war.realm("human").seat, home: works.id, mission: null, about: null, cargo: { wood: 60 }, back: false, since: war.turn });
        Object.assign(player, { x: at[0] - 11.5, y: at[1] + 8.5, square: [Math.floor(at[0] - 12), Math.floor(at[1] + 8)], path: [], order: null, progress: null });

        for (let k = 0; k < 8; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        const convoy = game.host.convoys.get("force-990");

        return { wagons: convoy?.wagons ?? [], ids: convoy?.ids ?? [], teams: (convoy?.ids ?? []).map((id) => game.battle.actor(id)?.team) };
    });

    expect(met.wagons).toHaveLength(3);
    expect(met.ids).toHaveLength(7);
    expect(met.teams.every((team) => team === "human")).toBe(true);
    expect(await page.evaluate(() => window.said.some((text) => /convoy of 60 wood is on the road to/.test(text)))).toBe(true);

    // (Drawn a few at a time, with the town's people about: each wagon an ox, the wagon behind it
    // laden with logs. Held where it is the while, the war not told where it's got to, so it's
    // drawn laden however long that takes)
    await page.evaluate(() => (window.pellagos.game.host.convoys.get("force-990").over = "held"));
    expect(await playUntil(page, () => ["wagons", "ids"].every((key) => (window.pellagos.game.host.convoys.get("force-990")?.[key] ?? []).every((id) => window.pellagos.game.avatars.has(id))), { seconds: 90 })).toBe(true);
    await page.evaluate(() => (window.pellagos.game.host.convoys.get("force-990").over = null));

    const drawn = await page.evaluate(() => {
        const { game } = window.pellagos;

        return game.host.convoys.get("force-990").wagons.map((id) => {
            const avatar = game.avatars.get(id);
            let meshes = 0;

            avatar.wagon?.object.traverse((node) => (meshes += node.isMesh ? 1 : 0));

            return { ox: avatar.id, wagon: Boolean(avatar.wagon), wheels: avatar.wagon?.wheels.length ?? 0, meshes };
        });
    });

    expect(drawn.every(({ ox, wagon, wheels }) => ox === "ox" && wagon && wheels === 4)).toBe(true);

    // At the road's end its goods are in, and its wagons empty
    expect(await playUntil(page, () => window.pellagos.game.host.war.force("force-990")?.back === true, { seconds: 90 })).toBe(true);

    const after = await page.evaluate(() => {
        const { game } = window.pellagos;
        const convoy = game.host.convoys.get("force-990");

        return {
            loads: convoy.wagons.map((id) => game.host.wagons.get(id).load),
            meshes: convoy.wagons.map((id) => {
                let meshes = 0;

                game.avatars.get(id).wagon.object.traverse((node) => (meshes += node.isMesh ? 1 : 0));

                return meshes;
            }),
            said: window.said.some((text) => /has brought its wood in to/.test(text)),
            moved: Math.hypot(game.battle.actor(convoy.wagons[0]).x - window.convoyAt[0], game.battle.actor(convoy.wagons[0]).y - window.convoyAt[1]),
        };
    });

    expect(after.moved).toBeGreaterThan(15);

    expect(after.loads).toEqual([null, null, null]);
    expect(after.meshes.every((meshes, k) => meshes < drawn[k].meshes)).toBe(true);
    expect(after.said).toBe(true);
});

test("a guard tower of the player's people near them: drawn over its squares with its banner, its bar broad; it shoots their enemy within 20 m; razed, said, its stone taken down", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    const built = await page.evaluate(async () => {
        const { footprintOf, mayBuild } = await import("/js/core/war/forts.js");
        const { nearestFree, squaresOf } = await import("/js/core/grid.js");
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const war = game.host.war;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        window.said = [];

        const message = game.hud.message.bind(game.hud);

        game.hud.message = (text, ...rest) => {
            window.said.push(text);

            return message(text, ...rest);
        };

        // A tower where their people may build, the nearest the player; the player 12 m from it
        let at = null;

        for (let r = 20; r < 300 && !at; r += 4) {
            for (let k = 0; k < 48 && !at; k++) {
                const spot = [Math.round(player.x + Math.cos((k / 48) * Math.PI * 2) * r), Math.round(player.y + Math.sin((k / 48) * Math.PI * 2) * r)];

                at = mayBuild(war, "human", spot) ? spot : null;
            }
        }

        Object.assign(war.realm("human").stores, { wood: 500, stone: 500, metal: 500 });

        const fort = war.build("human", { kind: "tower", at });
        const [x, y] = nearestFree(squaresOf(game.world.maps.town), [at[0] - 12, at[1]], { within: 8 });

        Object.assign(player, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, progress: null });

        for (let k = 0; k < 8; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        const box = footprintOf(fort);

        return { id: fort.id, at, box, blocked: game.world.maps.town.squares.blocked(box[0], box[1]) && game.world.maps.town.squares.blocked(box[2], box[3]) };
    });

    expect(built.blocked).toBe(true);

    const drawn = await page.evaluate((id) => {
        const { game } = window.pellagos;
        const plate = document.querySelector(`.floater.plate[data-id="${id}"]`);

        return {
            out: game.host.fortsOut.has(id),
            avatar: game.avatars.get(id)?.constructor.name,
            stone: Boolean(game.forts3d.drawn.get(id)),
            banner: game.banners.towns.has(`fort:${id}`),
            plate: plate?.className ?? null,
            name: plate?.querySelector(".name")?.textContent ?? null,
        };
    }, built.id);

    expect(drawn).toMatchObject({ out: true, avatar: "FortAvatar", stone: true, banner: true, name: "human guard tower" });
    expect(drawn.plate).toContain("fort");

    // At war with the orcs, one of theirs 10 m from it: shot from its loops
    await page.evaluate(({ box }) => {
        const { game } = window.pellagos;
        const war = game.host.war;

        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.known.push("human|orc");
        game.host.battle.add({ id: "raider", kind: "soldier", name: "Orcish raider", weapon: "cleaver", team: "orc", square: [box[2] + 10, box[1]], ai: null });
        Object.assign(game.host.battle.actor("raider"), { hp: 5000, maxHp: 5000 });
    }, built);

    expect(await playUntil(page, () => window.pellagos.game.host.battle.actor("raider").hp < 5000, { seconds: 20 })).toBe(true);

    // Brought low, and fallen on: razed by the orcs, said, its stone taken down and its squares open
    await page.evaluate((id) => {
        const { game } = window.pellagos;
        const raider = game.host.battle.actor("raider");

        window.fortId = id;

        game.host.battle.actor(id).hp = 30;
        game.host.war.fort(id).hp = 30;
        game.host.command("raider", { type: "engage", target: id });
        Object.assign(raider, { ai: "patrol", patrol: [raider.square], target: id });
    }, built.id);

    expect(await playUntil(page, () => !window.pellagos.game.host.war.fort(window.fortId), { seconds: 40 })).toBe(true);
    expect(await playUntil(page, () => !window.pellagos.game.forts3d.drawn.has(window.fortId), { seconds: 5 })).toBe(true);

    const after = await page.evaluate(({ id, box }) => {
        const { game } = window.pellagos;

        return { said: window.said, banner: game.banners.towns.has(`fort:${id}`), plate: Boolean(document.querySelector(`.floater.plate[data-id="${id}"]`)), open: !game.world.maps.town.squares.blocked(box[0], box[1]) };
    }, built);

    expect(after.said).toContain("The human guard tower has fallen!");
    expect(after).toMatchObject({ banner: false, plate: false, open: true });
});

test("the building screen at the ruler's: a Knight asks where to build; the council's plans on the map, numbered, named and costed; one counselled, and the ruler says it's next; their army's supplies not getting through cried by a crier, not told in a box", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    // A Knight, at war with the orcs, the stores holding a tower but not a garrison: into the
    // keep, up to the ruler
    const asked = await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "keep");
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.standing.points = 420;
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.known.push("human|orc");
        Object.assign(war.realm("human").stores, { wood: 60, stone: 50, metal: 20 });

        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const ruler = game.battle.actors.find((actor) => actor.map === player.map && actor.role === "ruler");

        game.approaching = ruler.id;
        game.battle.command("player", { type: "approach", target: ruler.id });

        for (let k = 0; k < 300 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const conversation = game.talking.conversation;
        const where = conversation.choices.findIndex(({ text }) => text === "Where should we build our defences?");

        conversation.choose(where);

        const show = conversation.choices.findIndex(({ text }) => text === "Show me the plans.");

        game.start();

        return { where, show, line: conversation.line };
    });

    expect(asked.where).toBeGreaterThanOrEqual(0);
    expect(asked.show).toBeGreaterThanOrEqual(0);
    expect(asked.line).toMatch(/council/);

    // Shown: the world map, as the building screen
    await page.evaluate((show) => window.pellagos.game.talking.conversation.choose(show), asked.show);
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn?.plans, null, { timeout: 30000, polling: 100 });

    const map = await page.evaluate(() => {
        const { worldMap } = window.pellagos;

        return { title: document.querySelector("#worldmaptitle").textContent, text: document.querySelector("#worldmappicktext").textContent, drawn: worldMap.drawn, plans: worldMap.build.plans };
    });

    expect(map.title).toBe("The council's plans");
    expect(map.text).toBe("Tap a plan to counsel building it first. Our stores: 60 wood, 50 stone and 20 metal.");
    expect(map.plans.length).toBeGreaterThan(1);
    expect(map.drawn.plans).toBe(map.plans.length);
    expect(map.plans.map(({ place }) => place)).toEqual(map.plans.map((_, k) => k + 1));
    expect(map.plans.every(({ affordable, kind }) => affordable === (kind === "tower"))).toBe(true);

    // The second tapped: asked about, then counselled
    const plan = map.plans[1];
    const spot = await page.evaluate(({ x, z }) => {
        const map = window.pellagos.worldMap;
        const rect = map.canvas.getBoundingClientRect();

        return { x: rect.left + (x - map.view.x) / map.view.scale + rect.width / 2, y: rect.top + (z - map.view.z) / map.view.scale + rect.height / 2 };
    }, plan);

    await page.mouse.click(spot.x, spot.y);
    await expect(page.locator("#build")).toBeVisible();
    await expect(page.locator("#buildtitle")).toHaveText(`${plan.name}?`);
    await expect(page.locator("#buildnote")).toContainText("The council's choice 2 of");
    await expect(page.locator("#buildnote")).toContainText(plan.kind === "tower" ? "It costs 40 wood, 40 stone and 10 metal" : "It costs 100 wood, 30 stone and 40 metal");
    await page.locator("#buildgo").click();
    await page.waitForFunction(() => !document.querySelector("#worldmap").open, null, { timeout: 10000 });
    await page.waitForFunction(() => window.pellagos.game.host.war.realm("human").build, null, { timeout: 10000 });

    const heeded = await page.evaluate(() => ({ build: window.pellagos.game.host.war.realm("human").build, line: window.pellagos.game.talking?.conversation.line }));

    expect(heeded.build.key).toBe(plan.key);
    expect(heeded.line).toBe(`${plan.name}. So be it: it's the next we build, as soon as the stores allow.`);

    // Their army's supplies not getting through (docs/WAR.md *Supply*): far off, so not told in a
    // box (as it was, to a Knight), but cried by a crier, as their own people's news; another
    // people's army's, not
    const told = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { newsSince, tell } = await import("./js/core/war/news.js");
        const war = game.host.war;
        const said = [];
        const message = game.hud.message.bind(game.hud);
        const since = { turn: war.turn, seen: war.log.filter(({ turn }) => turn === war.turn).length };
        const happen = (event) => {
            war.events.push(event);
            war.log.push(event);
        };

        game.hud.message = (text, ...rest) => {
            said.push(text);

            return message(text, ...rest);
        };

        happen({ type: "unsupplied", turn: war.turn, realm: "orc", army: "force-901", missed: 1, deserted: 0, why: "lost", by: null });
        happen({ type: "unsupplied", turn: war.turn, realm: "human", army: "force-902", missed: 2, deserted: 4, why: "lost", by: null });
        game.advance(0.1);
        game.hud.message = message;

        return { boxed: said.filter((text) => /supplies/.test(text)), cried: newsSince(war, game.world.start.at, since, { realm: "human" }).told.map(({ words }) => words), ours: tell(war.log.at(-1), war) };
    });

    expect(told.boxed).toEqual([]);
    expect(told.cried).toEqual([told.ours]);
    expect(told.ours).toContain("Human");
});

test("the war table in the keep: a Retainer's told it isn't theirs to read; a Knight taps it, walks up to it, and its map shows the war as their council sees it, their army at their camp and the enemy's army its scout sees, not the one beyond, drawn again as the war goes on; what's tapped told of", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    // A Retainer at war with the orcs, a camp of theirs up before the orcs' seat, their army at it,
    // an orc army in its scout's sight and another far beyond: into the keep, across the hall from
    // the war table, looking at it
    const set = await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "keep");
        const player = game.battle.actor("player");
        const seat = war.town(war.realm("orc").seat);
        const off = ([x, y], dx, dy) => [x + dx, y + dy];
        const camp = { id: "camp-900", realm: "human", at: off(seat.at, 0, 280), guard: 6, built: war.turn, done: war.turn, toward: seat.id, used: 1e6, skirmished: war.turn };
        const army = (id, realm, at, size, mission) => ({ id, realm, kind: "army", size, at, path: [at], leg: 0, target: null, home: war.realm(realm).seat, mission, about: null, camp: null, orders: null, went: size, arrived: null, supply: { due: 1e6, missed: 0 }, since: 0 });

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.standing.points = 200;
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.known.push("human|orc");
        war.camps.push(camp);
        war.forces.push(army("force-900", "human", off(camp.at, 0, 30), 30, "camp"), army("force-901", "orc", off(camp.at, 200, 0), 40, "regroup"), army("force-902", "orc", off(seat.at, 0, -1600), 50, "regroup"));

        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const table = game.world.maps[player.map].pieces.find(({ kind }) => kind === "war-table");

        return { map: player.map, table, camp: camp.at, far: war.sees("human", war.force("force-902").at), near: war.sees("human", war.force("force-901").at) };
    });

    expect(set.map).toMatch(/great-hall$/);
    expect(set.table).toMatchObject({ w: 4, h: 2 });
    expect([set.near, set.far]).toEqual([true, false]);

    // Tapped from across the hall: walked up to it
    const tap = () =>
        page.evaluate(({ x, y, w, h }) => {
            const { game } = window.pellagos;
            const player = game.battle.actor("player");
            const [ox, oz] = game.originOf(game.mapId);
            const at = [x + Math.floor(w / 2), y + h + 2];

            window.said = [];

            const message = game.hud.message.bind(game.hud);

            game.hud.message = (text, ...rest) => {
                window.said.push(text);

                return message(text, ...rest);
            };

            Object.assign(player, { square: at, x: at[0] + 0.5, y: at[1] + 0.5, path: [], facing: Math.PI });

            for (let k = 0; k < 8; k++) {
                game.advance(0.25);
            }

            Object.assign(game.cameraFollow, { yaw: 0, turning: 0, pitch: 35 });
            game.cameraFollow.heading = { x: 0, z: 0 };
            game.advance(0.05);
            game.start();

            return game.view.toScreen(game.view.camera.position.clone().set(ox + x + w / 2, 0.87, oz + y + h * 0.7));
        }, set.table);

    let at = await tap();

    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => window.said.some((text) => /war table/.test(text)), null, { timeout: 60000, polling: 100 });

    const refused = await page.evaluate(() => ({ said: window.said, open: document.querySelector("#worldmap").open, square: window.pellagos.game.battle.actor("player").square }));

    expect(refused.said).toContain("The war table's for the council and its Knights to read. You're a Retainer.");
    expect(refused.open).toBe(false);
    expect(refused.square).toEqual([set.table.x + 2, set.table.y + 2]);

    // A Knight: its map open, the war going on as it's read
    await page.evaluate(() => (window.pellagos.game.standing.points = 420));
    at = await tap();
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn?.war, null, { timeout: 60000, polling: 100 });

    const map = await page.evaluate(() => {
        const { game, worldMap } = window.pellagos;

        return {
            title: document.querySelector("#worldmaptitle").textContent,
            text: document.querySelector("#worldmappicktext").textContent,
            key: document.querySelector("#worldmapkey").hidden,
            warKey: [...document.querySelectorAll("#warmapkey li")].map((item) => item.textContent),
            running: game.running,
            forces: worldMap.war.forces.map(({ id, ours, told }) => ({ id, ours, told })),
            camps: worldMap.war.camps.map(({ id, own }) => ({ id, own })),
            drawn: worldMap.drawn.war,
        };
    });

    expect(map.title).toBe("The war table");
    expect(map.text).toMatch(/^Our army, 30 strong of \d+: at its camp\. Our reserve .* Tap anything for more; an enemy town to counsel marching on it\.$/);
    expect(map.key).toBe(true);
    expect(map.warKey).toEqual(["Army", "Reserve", "Reinforcements", "Supply wagon", "Camp", "Supply depot", "Seen now; the rest of theirs unseen"]);
    expect(map.running).toBe(true);
    expect(map.camps).toContainEqual({ id: "camp-900", own: true });
    expect(map.forces.find(({ id }) => id === "force-901")).toMatchObject({ ours: false, told: "The Orcish army, 40 strong: falling back to its camp to be made up." });
    expect(map.forces.some(({ id }) => id === "force-902")).toBe(false);
    expect(map.drawn.forces).toBeGreaterThanOrEqual(2);
    expect(map.drawn.seen).toBeGreaterThanOrEqual(1);
    expect(map.drawn.camps).toBeGreaterThanOrEqual(1);

    // (Drawn again as the war goes on: the orc army moved, moved on the map)
    const moved = await page.evaluate(() => {
        const force = window.pellagos.game.host.war.force("force-901");

        force.at = [force.at[0] - 60, force.at[1]];

        return force.at[0];
    });

    await page.waitForFunction((x) => window.pellagos.worldMap.war?.forces.find(({ id }) => id === "force-901")?.x === x, moved, { timeout: 10000, polling: 100 });

    // (The orc army tapped: told of)
    const spot = await page.evaluate(() => {
        const map = window.pellagos.worldMap;
        const { x, z } = map.war.forces.find(({ id }) => id === "force-901");
        const rect = map.canvas.getBoundingClientRect();

        return { x: rect.left + (x - map.view.x) / map.view.scale + rect.width / 2, y: rect.top + (z - map.view.z) / map.view.scale + rect.height / 2 };
    });

    await page.mouse.click(spot.x, spot.y);
    await expect(page.locator("#worldmapnote")).toHaveText("The Orcish army, 40 strong: falling back to its camp to be made up.");

    // Left: the map closed, and the camp's scout's ground uncovered on the player's own map, since
    // they read the table (core/host.js #tableRead), and so it stays as the war goes on
    await page.locator("#worldmapcancel").click();
    await page.waitForFunction(() => !document.querySelector("#worldmap").open, null, { timeout: 10000 });

    const uncovered = await page.evaluate(([x, y]) => {
        const { game } = window.pellagos;
        const read = game.explored.visitedAt(x, y);

        game.host.war.clock = 60000 - 100;
        game.advance(0.5);

        return { read, after: game.explored.visitedAt(x, y), cancel: document.querySelector("#worldmapcancel").textContent };
    }, set.camp);

    expect(uncovered.read).toBe(true);
    expect(uncovered.after).toBe(true);
    expect(uncovered.cancel).toBe("Cancel");
});

test("orders at the war table: a Lord raises their army at their seat, sends it to make camp, then to march on the orcs' seat, is told why it can't be sent supplies while mustering, and disbands it", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    // A Lord at war with the orcs, the orcs' seat uncovered on their map, at the war table in the keep
    const set = await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "keep");
        const player = game.battle.actor("player");
        const orcs = war.town(war.realm("orc").seat);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.standing.points = 900;
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.known.push("human|orc");
        game.explored.visit(orcs.at[0], orcs.at[1]);

        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const table = game.world.maps[player.map].pieces.find(({ kind }) => kind === "war-table");

        Object.assign(player, { square: [table.x + 2, table.y + 2], x: table.x + 2.5, y: table.y + 2.5, path: [], order: null });
        game.advance(0.1);
        game.start();

        return { opened: game.openWarTable().ok, seat: war.realm("human").seat, orcs: orcs.id, army: war.armyOf("human")?.id ?? null };
    });

    expect(set.opened).toBe(true);
    expect(set.army).toBeNull();
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn?.war, null, { timeout: 30000, polling: 100 });
    await expect(page.locator("#worldmappicktext")).toContainText("We have no army raised.");
    await expect(page.locator("#worldmappicktext")).toContainText("Tap our army, the enemy's, or the ground, for orders.");

    // Somewhere on the map tapped: brought to the middle of it first
    const tap = async (x, z) => {
        const at = await page.evaluate(([x, z]) => {
            const map = window.pellagos.worldMap;
            const rect = map.canvas.getBoundingClientRect();

            Object.assign(map.view, { x, z });
            map.draw();

            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }, [x, z]);

        await page.mouse.click(at.x, at.y);
    };
    const where = (id) => page.evaluate((id) => [...window.pellagos.worldMap.war.towns, ...window.pellagos.worldMap.war.forces].find((each) => each.id === id), id);
    const choose = async (label) => {
        await expect(page.locator("#warorders")).toBeVisible();
        await page.locator("#warordersmenu button", { hasText: label }).click();
        await expect(page.locator("#warorders")).toBeHidden();
    };

    // Their seat tapped: raised there
    const seat = await where(set.seat);

    await tap(seat.x, seat.z);
    await expect(page.locator("#warorderstitle")).toHaveText(seat.name);
    await choose("Raise our army here");
    await expect(page.locator("#worldmapnote")).toContainText("So be it: an army's raised.");

    const army = await page.evaluate(() => window.pellagos.game.host.war.armyOf("human")?.id);

    expect(army).toBeTruthy();

    // The army tapped (at its seat, mustering): supplies sent for, and told why not
    await page.waitForFunction((id) => window.pellagos.worldMap.war?.forces.some((force) => force.id === id), army, { timeout: 10000, polling: 100 });

    const force = await where(army);

    await tap(force.x, force.z);
    await expect(page.locator("#warorderstitle")).toHaveText("Our army");
    await choose("Send for supplies");
    await expect(page.locator("#worldmapnote")).toHaveText("Our army's mustering at home: it's fed there.");

    // Dry ground 600 m from the seat tapped: camp made there (once it's made up)
    const ground = await page.evaluate(async (id) => {
        const { landAt } = await import("/js/core/worldplan/plan.js");
        const { game } = window.pellagos;
        const seat = game.host.war.town(id);

        for (let k = 0; k < 16; k++) {
            const at = [Math.round(seat.at[0] + Math.cos((k * Math.PI) / 8) * 600), Math.round(seat.at[1] + Math.sin((k * Math.PI) / 8) * 600)];
            const land = landAt(game.world.plan, at[0], at[1]);

            if (!land.water && land.biome !== "sea" && !game.host.war.towns.some((town) => Math.hypot(town.at[0] - at[0], town.at[1] - at[1]) < 250)) {
                return at;
            }
        }

        return null;
    }, set.seat);

    expect(ground).not.toBeNull();
    await tap(ground[0], ground[1]);
    await expect(page.locator("#warorderstitle")).toHaveText("Here");
    await choose("Make camp here");
    await expect(page.locator("#worldmapnote")).toHaveText("So be it: the army marches to make camp there.");
    expect(await page.evaluate(() => window.pellagos.game.host.war.armyOf("human").orders)).toEqual({ kind: "camp", about: ground, by: "human" });

    // The orcs' seat tapped: marched on (a camp made before it first, out of reach of theirs)
    const orcs = await where(set.orcs);

    await tap(orcs.x, orcs.z);
    await expect(page.locator("#warorderstitle")).toHaveText(orcs.name);
    await expect(page.locator("#warordersmenu button", { hasText: "Counsel marching on it next" })).toBeVisible();
    await choose("March on it");
    await expect(page.locator("#worldmapnote")).toHaveText(`So be it: the army marches on ${orcs.name}.`);
    expect(await page.evaluate(() => window.pellagos.game.host.war.armyOf("human").orders.kind)).toBe("attack");

    // The army tapped again: disbanded, none raised now
    await tap(force.x, force.z);
    await choose("Disband it");
    await expect(page.locator("#worldmapnote")).toHaveText("So be it: the army's disbanded, each of them home to their towns.");
    expect(await page.evaluate(() => window.pellagos.game.host.war.armyOf("human"))).toBeNull();
    await expect(page.locator("#worldmappicktext")).toContainText("We have no army raised.", { timeout: 5000 });
});

test("a forward garrison of the player's people near them: its two patrols of four out on their rounds and its assault team of six at its gate, drawn as near as they're drawn, of its people", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    const built = await page.evaluate(async () => {
        const { mayBuild } = await import("/js/core/war/forts.js");
        const { nearestFree, squaresOf } = await import("/js/core/grid.js");
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const war = game.host.war;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // A forward garrison where their people may build, the nearest the player; the player 30 m
        // from it
        let at = null;

        for (let r = 40; r < 300 && !at; r += 4) {
            for (let k = 0; k < 48 && !at; k++) {
                const spot = [Math.round(player.x + Math.cos((k / 48) * Math.PI * 2) * r), Math.round(player.y + Math.sin((k / 48) * Math.PI * 2) * r)];

                at = mayBuild(war, "human", spot) ? spot : null;
            }
        }

        Object.assign(war.realm("human").stores, { wood: 900, stone: 900, metal: 900 });

        const fort = war.build("human", { kind: "garrison", at });
        const [x, y] = nearestFree(squaresOf(game.world.maps.town), [at[0] - 30, at[1]], { within: 8 });

        Object.assign(player, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null, progress: null });

        for (let k = 0; k < 8; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        window.fortId = fort.id;

        return { id: fort.id, at };
    });

    // (Drawn a few at a time: every one of them within 150 m of the player, as near as anyone's
    // drawn; the outer patrol's round goes further out)
    expect(
        await playUntil(
            page,
            () => {
                const { game } = window.pellagos;
                const player = game.battle.actor("player");
                const ids = Object.values(game.host.squadsOut.get(window.fortId)?.ids ?? {}).flat();

                return ids.length === 14 && ids.filter((id) => Math.hypot(game.battle.actor(id).x - player.x, game.battle.actor(id).y - player.y) < 150).every((id) => game.avatars.has(id));
            },
            { seconds: 90 },
        ),
    ).toBe(true);

    const squads = await page.evaluate(({ id, at }) => {
        const { game } = window.pellagos;
        const out = game.host.squadsOut.get(id);
        const each = (ids) =>
            ids.map((one) => {
                const actor = game.battle.actor(one);

                const player = game.battle.actor("player");

                return { name: actor.name, team: actor.team, far: Math.hypot(actor.x - at[0], actor.y - at[1]), near: Math.hypot(actor.x - player.x, actor.y - player.y) < 150, drawn: game.avatars.has(one), gate: Math.hypot(actor.x - out.gate[0], actor.y - out.gate[1]) };
            });

        return { patrols: [each(out.ids["patrol-0"]), each(out.ids["patrol-1"])], assault: each(out.ids.assault) };
    }, built);

    expect(squads.patrols.map((patrol) => patrol.length)).toEqual([4, 4]);
    expect(squads.assault).toHaveLength(6);

    for (const one of [...squads.patrols.flat(), ...squads.assault]) {
        expect(one.team).toBe("human");
        expect(one.drawn || !one.near).toBe(true);
        expect(one.far).toBeLessThanOrEqual(300);
    }

    expect(squads.assault.every(({ drawn }) => drawn)).toBe(true);

    expect(squads.patrols.flat().every(({ name }) => name === "Human patrol")).toBe(true);
    expect(squads.assault.every(({ name, gate }) => name === "Human vanguard" && gate < 8)).toBe(true);
});

test("the barracks of the town the player starts in, held by the orcs at war with their people: gone into, its captain and guardsmen are there, of the orcs, drawn; put down, the last of its garrison, the town's the humans', and said; the humans' garrison in it once the player's left", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    const inside = await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const town = war.town(game.world.start.id);
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "barracks" && each.place === "home");
        const player = game.battle.actor("player");
        const [x, y] = building.door.ends[0].squares[0];
        const pair = ["human", "orc"].join("|");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // (The town the orcs', at war with the humans, in the age of conquest)
        Object.assign(town, { owner: "orc", garrison: 12 });
        war.relations[pair] = { state: "hostile", since: 0 };
        war.known.push(pair);
        war.stage = 3;

        window.said = [];

        const message = game.hud.message.bind(game.hud);

        game.hud.message = (text, ...rest) => {
            window.said.push(text);

            return message(text, ...rest);
        };

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.host.command("player", { type: "enter", link: building.door.id });

        for (let k = 0; k < 20 && player.map === "town"; k++) {
            game.advance(0.25, { render: false });
        }

        // (Standing still while they're looked at, and put down at a blow each; the rest of the
        // town's garrison down already, those in the barracks all that's left of it)
        const out = game.host.quartered.get(town.id);

        for (const id of out?.ids ?? []) {
            Object.assign(game.battle.actor(id), { ai: null, hp: 1 });
        }

        town.garrison = out?.ids.length ?? 0;

        window.barracks = { town: town.id, door: building.door.id, ids: [...(out?.ids ?? [])] };

        return { map: player.map, inside: building.maps[0], name: building.name, ids: out?.ids ?? [] };
    });

    expect(inside.map).toBe(inside.inside);
    expect(inside.name).toBe("the barracks");
    expect(inside.ids).toHaveLength(4);

    // Its captain and guardsmen, of the orcs, drawn
    expect(await playUntil(page, () => window.barracks.ids.every((id) => window.pellagos.game.avatars.has(id)), { seconds: 60 })).toBe(true);

    const garrison = await page.evaluate(() => window.barracks.ids.map((id) => ({ name: window.pellagos.game.battle.actor(id).name, team: window.pellagos.game.battle.actor(id).team, map: window.pellagos.game.battle.actor(id).map })));

    expect(garrison.map(({ name }) => name)).toEqual(["Orcish captain", "Orcish guardsman", "Orcish guardsman", "Orcish guardsman"]);
    expect(garrison.every(({ team, map }) => team === "orc" && map === inside.inside)).toBe(true);

    // Put down by the player, one after another: the town the humans'
    expect(
        await playUntil(
            page,
            () => {
                const { game } = window.pellagos;
                // (The fallen taken away a while after: down too)
                const next = window.barracks.ids.find((id) => game.battle.actor(id) && !game.battle.actor(id).dead);

                if (next && game.battle.actor("player").order?.target !== next) {
                    game.host.command("player", { type: "engage", target: next });
                }

                return !next && game.host.war.town(window.barracks.town).owner === "human";
            },
            { seconds: 90 },
        ),
    ).toBe(true);

    const taken = await page.evaluate(() => {
        const { game } = window.pellagos;
        const town = game.host.war.town(window.barracks.town);

        return { said: window.said, garrison: town.garrison, name: town.name };
    });

    expect(taken.said).toContain(`${taken.name} is taken! The last of its garrison put to the sword, the Humans hold it now.`);
    expect(taken.garrison).toBe(3);

    // (Round it, the humans' soldiers out in the orcs' place)
    expect(await playUntil(page, () => window.pellagos.game.host.mustered.get(window.barracks.town)?.people === "human", { seconds: 5 })).toBe(true);

    // Out of it: the humans' garrison in it, drawn
    await page.evaluate(() => window.pellagos.game.host.command("player", { type: "enter", link: window.barracks.door }));
    expect(
        await playUntil(
            page,
            () => {
                const { game } = window.pellagos;
                const out = game.host.quartered.get(window.barracks.town);

                return game.battle.actor("player").map === "town" && out?.people === "human" && out.ids.every((id) => game.battle.actor(id)?.team === "human" && game.avatars.has(id));
            },
            { seconds: 60 },
        ),
    ).toBe(true);
});

test("a place's outlaws or dead hold it round their leader by a locked chest, the dead down in the crypt under the ruins: tapped, it's locked; put to the sword, the place is cleared and the chest opened, the player's share in it", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Up to the ruins nearest the start town, by their chest
    const held = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        const [ruins] = game.placeIcons()
            .filter(({ kind }) => kind === "ruins")
            .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.y) - Math.hypot(b.x - player.x, b.z - player.y));
        const settle = async (steps) => {
            for (let k = 0; k < steps; k++) {
                game.advance(0.25, { render: false });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };

        const until = async (done, steps = 80) => {
            for (let k = 0; k < steps && !done(); k++) {
                player.hp = player.maxHp;
                game.advance(0.1);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };

        Object.assign(player, { x: ruins.x + 30, y: ruins.z, path: [], order: null, progress: null });
        await settle(8);

        // Down the stair-house's stair into the crypt
        const building = game.world.interiors.buildings.get(`site:${ruins.id}`);
        const [ox, oy] = building.entrance.outside;

        Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null });
        game.host.command("player", { type: "enter", link: building.door.id });
        await until(() => player.map !== "town");
        await until(() => game.interiors.get(player.map)?.object.visible, 120);

        const place = game.host.held.get(ruins.id);
        const chest = game.host.ground.get(`chest-${ruins.id}`);

        // (By the chest, facing it, its guardians within stood off down the crypt and stunned a
        // good while, so the tap's on it and no curse of theirs is the last word, while the camera
        // comes round behind the player)
        const within = place.ids.filter((each) => game.battle.actor(each).map === player.map);

        Object.assign(player, { x: chest.square[0] - 0.6, y: chest.square[1] + 0.5, facing: Math.PI / 2, path: [], order: null, progress: null, afflictions: [] });

        for (const id of within) {
            Object.assign(game.battle.actor(id), { y: chest.square[1] + 11.5, path: [], order: null, target: null, attack: null, casting: null, stunnedUntil: game.battle.time + 120000 });
        }

        for (let k = 0; k < 50; k++) {
            game.advance(0.1);
        }

        return { id: ruins.id, within: chest.map === player.map && player.map === building.maps[0], band: place.ids.map((id) => game.battle.actor(id).wild.creature), chest: game.drops.drawn.get(chest.id)?.object.children[0].name };
    });

    expect(held.within).toBe(true);
    expect(held.band[0]).toBe("wightLord");
    // (Its dead: their bones, their ghosts and a wraith)
    expect(held.band.slice(1).every((creature) => ["skeleton", "ghost", "wraith"].includes(creature))).toBe(true);
    expect(new Set(held.band.slice(1))).toEqual(new Set(["skeleton", "ghost", "wraith"]));
    expect(held.chest).toBe("chest");

    // (Going again, so it's heard; tapped where it's seen there and then, before the camera's
    // moved on)
    await page.evaluate((id) => {
        const { game, session } = window.pellagos;
        const { object } = game.drops.drawn.get(`chest-${id}`);

        game.start();

        const { x, y } = session.view.toScreen(object.position.clone().setY(object.position.y + 0.3));

        game.tap(x, y);
    }, held.id);

    await expect(page.locator("#banner")).toHaveText("It's locked fast, and its guardians still hold the place.");

    // Put to the sword: cleared, the chest open with the player's share
    const cleared = await page.evaluate(async (id) => {
        const { game } = window.pellagos;

        game.stop();

        // (Every word on the banner kept: the place cleared, and the chest's share there too)
        const told = [];
        const banner = document.querySelector("#banner");

        new MutationObserver((records) => told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(banner, { childList: true });

        for (const each of game.host.held.get(id).ids) {
            game.battle.afflict(each, "poison", { by: "player", damage: 1e7 });
        }

        for (let k = 0; k < 12; k++) {
            game.advance(0.25, { render: false });
        }

        game.advance(0.1);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const share = [...game.host.ground.values()].find((dropped) => dropped.from === "chest");
        const drawn = game.drops.drawn.get(share?.id)?.object;

        // (Open on a heap of coins: gold3d.js)
        return { holder: game.placeIcons().find((icon) => icon.id === id).holder, open: drawn?.children[0].name, coins: (drawn?.getObjectByName("coins")?.count ?? 0) > 300, locked: game.host.ground.has(`chest-${id}`), relic: share?.bundle.items.at(-1), told };
    }, held.id);

    expect({ ...cleared, relic: undefined, told: undefined }).toEqual({ holder: "cleared", open: "chest-open", coins: true, locked: false, relic: undefined, told: undefined });
    expect(cleared.told.some((text) => /^The dead of .+ are laid to rest, for now\.$/.test(text)), JSON.stringify(cleared.told)).toBe(true);
    // (And what the dead guarded: one of their old relics, named)
    expect(cleared.relic.quality).toBe("legendary");
    expect(cleared.told).toContain(`The chest's open, and in your share an old relic of theirs: the ${cleared.relic.name}. Tap it to take it.`);
});

test("an adventurer's cache turns up ahead of a player crossing the wilds, off the roads, its brigands walking their round; marked on the maps once seen; locked till they fall, then opened, the player's share in it; gone once they've left it far behind", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const cache = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { host } = game;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // (Every word on the banner kept)
        const told = [];

        new MutationObserver((records) => told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        const settle = async (steps, render = false) => {
            for (let k = 0; k < steps; k++) {
                player.hp = player.maxHp;
                game.advance(0.25, { render });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const goTo = (x, y) => Object.assign(player, { x, y, path: [], order: null, progress: null, target: null });

        // Out in the wilds 600 m north of the start town, going north, owed one (as far crossed as
        // the next was to be), a cache the wilds director's next card (core/director.js)
        const at = [player.x, player.y - 600];

        goTo(...at);
        host.travel.set("player", { at, walked: 600, next: 600, heading: [0, -1], deck: ["cache"] });
        await settle(4);

        const [put] = host.caches.values();

        if (!put) {
            return null;
        }

        const ids = put.ids.map((id) => game.battle.actor(id));
        const before = { seen: game.cachesSeen.has(put.id), icons: game.cacheIcons().length };

        // Within sight of it (but out of its guards' reach): said, and marked on the maps
        goTo(put.at[0], put.at[1] + 45);
        await settle(4, true);
        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        const seen = { seen: game.cachesSeen.has(put.id), minimap: game.minimap.icons.includes("cache"), map: game.worldMapView().icons.some(({ kind }) => kind === "cache"), chest: game.drops.drawn.get(`chest-${put.id}`)?.object.children[0].name };

        // Its chest, locked while they keep it
        const chest = host.ground.get(`chest-${put.id}`);

        goTo(chest.square[0] + 0.5, chest.square[1] + 1.2);

        const locked = host.command("player", { type: "pickUp", ground: chest.id });

        // Put down: opened, the player's share in it
        for (const id of put.ids) {
            game.battle.afflict(id, "poison", { by: "player", damage: 1e7 });
        }

        await settle(12);
        game.advance(0.1);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const share = [...host.ground.values()].find((dropped) => dropped.from === "chest" && dropped.for === "player");
        const opened = { opened: put.opened, open: game.drops.drawn.get(share?.id)?.object.children[0].name, gold: share?.bundle.gold, items: share?.bundle.items.length, rim: game.cacheIcons()[0]?.rim };

        // Left far behind: gone, off the maps
        goTo(put.at[0], put.at[1] + 260);
        await settle(4);

        return {
            ahead: put.at[1] < at[1] && Math.hypot(put.at[0] - at[0], put.at[1] - at[1]),
            road: game.world.maps.town.nearRoad(...put.at, 32),
            band: put.band,
            creatures: ids.map((one) => one.wild.creature),
            round: ids.slice(1).every((one) => one.wild.round?.length === 6),
            tiers: ids.map((one) => one.wild.tier),
            before,
            seen,
            locked,
            opened,
            gone: !host.caches.has(put.id) && !game.cacheIcons().length,
            told,
        };
    });

    expect(cache).not.toBeNull();
    expect(cache.ahead).toBeGreaterThan(65);
    expect(cache.ahead).toBeLessThan(105);
    expect(cache.road).toBe(false);
    expect(cache.creatures.length).toBeGreaterThanOrEqual(3);
    expect(cache.creatures.length).toBeLessThanOrEqual(5);
    expect(cache.round).toBe(true);
    // (Their leader two tiers above the rest)
    expect(cache.tiers[0]).toBe(cache.tiers[1] + 2);
    expect(cache.before).toEqual({ seen: false, icons: 0 });
    expect(cache.seen).toEqual({ seen: true, minimap: true, map: true, chest: "chest" });
    expect(cache.told.some((text) => /^An adventurer's cache, and .+ keeping it\. Put them all down to open it\.$/.test(text)), JSON.stringify(cache.told)).toBe(true);
    expect(cache.locked).toEqual({ ok: false, reason: "guarded" });
    expect(cache.opened).toMatchObject({ opened: true, open: "chest-open", rim: "#8a8a8a" });
    expect(cache.opened.gold).toBeGreaterThan(0);
    expect(cache.opened.items).toBeGreaterThanOrEqual(2);
    expect(cache.told).toContain("The adventurer's cache is open, your share in it: tap it to take it.");
    expect(cache.gone).toBe(true);
});

test("the wilds director deals a fallen adventurer's remains ahead of a player crossing the wilds, said and marked once seen, searched for their share; then an old campsite, camped at with the wild nearer, waking well rested", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const dealt = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { host } = game;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // (Every word on the banner kept)
        const told = [];

        new MutationObserver((records) => told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        const settle = async (steps, render = false) => {
            for (let k = 0; k < steps; k++) {
                player.hp = player.maxHp;
                game.advance(0.25, { render });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const goTo = (x, y) => Object.assign(player, { x, y, square: [Math.floor(x), Math.floor(y)], path: [], order: null, progress: null, target: null });
        // (Owed a card where they are, going north: as far crossed as the next was to be)
        const owed = (deck) => host.travel.set("player", { at: [player.x, player.y], walked: 600, next: 600, heading: [0, -1], deck });

        // Out in the wilds 600 m north of the start town: the remains dealt ahead
        goTo(player.x, player.y - 600);
        owed(["remains", "campsite"]);
        await settle(4);

        const [remains] = [...host.finds.values()].filter(({ kind }) => kind === "remains");

        if (!remains) {
            return null;
        }

        // Within sight of them: said, marked on the maps, drawn where they lie
        goTo(remains.at[0], remains.at[1] + 30);
        await settle(4, true);
        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        const seen = { seen: game.findsSeen.has(remains.id), minimap: game.minimap.icons.includes("remains"), map: game.worldMapView().icons.some(({ kind }) => kind === "remains"), drawn: game.findProps.shown.get(remains.id)?.children.length ?? 0 };

        // Searched: the player's share at their feet
        goTo(remains.at[0], remains.at[1] + 1.2);
        await settle(1);

        const searched = host.command("player", { type: "pickUp", ground: `chest-${remains.id}` });

        await settle(2);

        const share = [...host.ground.values()].find((dropped) => dropped.from === "remains" && dropped.for === "player");
        const after = { searched: remains.searched, gold: share?.bundle.gold, rim: game.findIcons().find(({ id }) => id === remains.id)?.rim ?? null };

        // On, owed the next: the old campsite, camped at with a wolf 25 m off
        goTo(player.x, player.y - 300);
        owed(["campsite"]);
        await settle(4);

        const campsite = [...host.finds.values()].find(({ kind }) => kind === "campsite");

        if (!campsite) {
            return { seen, searched, after, told, campsite: null };
        }

        goTo(campsite.at[0] + 2, campsite.at[1]);
        await settle(4, true);
        game.battle.add({ id: "wolf-near", kind: "beast", weapon: "wolf", team: "beasts", square: [Math.floor(campsite.at[0]) + 27, Math.floor(campsite.at[1])], ai: "wild", wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 0, pack: "p", leader: null, menace: true, unique: false, darkSight: true } }).stunnedUntil = 1e9;

        const refused = host.campRefusal("player");
        const camped = host.command("player", { type: "camp", until: { hours: 1 } });

        await settle(2);

        const boon = host.players.get("player").boons.find(({ id }) => id === "rested");

        return { seen, searched, after, told, campsite: { seen: game.findsSeen.has(campsite.id), drawn: game.findProps.shown.get(campsite.id)?.children.length ?? 0, refused, camped, fire: host.campfires.find(({ player: whose }) => whose === "player")?.fire, at: campsite.at, boon: boon?.label ?? null } };
    });

    expect(dealt).not.toBeNull();
    expect(dealt.seen).toMatchObject({ seen: true, minimap: true, map: true });
    expect(dealt.seen.drawn).toBeGreaterThan(10);
    expect(dealt.searched).toEqual({ ok: true });
    expect(dealt.after.searched).toBe(true);
    expect(dealt.after.gold).toBeGreaterThan(0);
    expect(dealt.after.rim).not.toBeNull();
    expect(dealt.told).toContain("The remains of an adventurer who fell out here long ago. Search them: they may have left something.");
    expect(dealt.told).toContain("You search the remains of the fallen adventurer: what was left on them is at your feet. Tap it to take it.");

    expect(dealt.campsite).not.toBeNull();
    expect(dealt.campsite).toMatchObject({ seen: true, refused: null, camped: { ok: true }, boon: "Well rested" });
    expect(dealt.campsite.drawn).toBeGreaterThan(10);
    expect(dealt.campsite.fire).toEqual(dealt.campsite.at);
    expect(dealt.told.some((text) => text.startsWith("An old campsite: a ring of stones"))).toBe(true);
    expect(dealt.told).toContain("Well rested.");
});

test("the wilds director's pacing: after a long calm, the land's hunters heard ahead of the player, told which way; a while later they come for them, said; and after a hard fight, a quiet spell, said", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const heard = await page.evaluate(async (silent) => {
        const { game } = window.pellagos;
        const { host } = game;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // (Every word on the banner kept, and every sound played)
        const told = [];
        const played = [];
        const play = game.sound?.play?.bind(game.sound);

        new MutationObserver((records) => told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        if (play) {
            game.sound.play = (name, options) => {
                played.push(name);

                return play(name, options);
            };
        }

        const settle = (seconds) => {
            for (let t = 0; t < seconds; t += 0.25) {
                player.hp = player.maxHp;
                game.advance(0.25, { render: false });
            }
        };
        const [sx, sy] = game.world.start.at;

        // Out in the wilds 600 m north of the start town, going north, after a long calm
        Object.assign(player, { x: sx, y: sy - 600, square: [Math.floor(sx), Math.floor(sy - 600)], path: [], order: null, target: null });
        host.travel.set("player", { at: [player.x, player.y], walked: 0, next: 1e9, heading: [0, -1], deck: ["cache"] });
        settle(1);

        // (Heard, never an ambush laid in silence in its stead: core/ambush.js AMBUSH `silent`)
        const chance = host.random.chance.bind(host.random);

        host.random.chance = (share) => chance(share) && share !== silent;
        Object.assign(host.travel.get("player").pace, { lastFight: game.battle.time - 300000, calm: 500 });
        settle(1.5);

        const build = host.travel.get("player").pace.build;

        // (A while later: they come for them)
        settle(22);

        // (Then a hard fight, over, those they fought gone: a quiet spell)
        for (const actor of game.battle.actors.filter((each) => each.wild)) {
            Object.assign(actor, { dead: true, respawnAt: Infinity, target: null });
        }

        Object.assign(host.travel.get("player").pace, { fight: { lowest: 0.2 }, lastFight: game.battle.time - 6000, build: null });
        settle(1);

        // (The banner's words heard: they're kept as the page gets round to it)
        await new Promise((resolve) => setTimeout(resolve, 0));

        return { build: Boolean(build), told: told.filter(Boolean), played };
    }, AMBUSH.silent);

    expect(heard.build).toBe(true);
    expect(heard.told.some((text) => /^(Drums, somewhere off to the [a-z-]+\. They're coming this way\.|An? .+ calls, somewhere off to the [a-z-]+, and others answer\.)$/.test(text)), JSON.stringify(heard.told)).toBe(true);
    expect(heard.told.some((text) => text.startsWith("Drums")) ? heard.played.includes("warDrums") : true).toBe(true);
    expect(heard.told.slice(1, -1).some((text) => text === "Here they come!" || text === "They're on you!"), JSON.stringify(heard.told)).toBe(true);
    expect(heard.told.at(-1)).toBe("The wild grows quiet round you, for a while.");
});

test("the wilds director lays fresh tracks ahead of a player crossing the wilds, leading to a pack out near them: their prints drawn, said once come upon and dotted on the minimap; gone once the pack is", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const fresh = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { host } = game;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // (Every word on the banner kept)
        const told = [];

        new MutationObserver((records) => told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        const settle = async (steps, render = false) => {
            for (let k = 0; k < steps; k++) {
                player.hp = player.maxHp;
                game.advance(0.25, { render });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const goTo = (x, y) => Object.assign(player, { x, y, square: [Math.floor(x), Math.floor(y)], path: [], order: null, progress: null, target: null });

        // Out in the wilds 600 m north of the start town (what prints are drawn there before), going
        // north, owed the tracks card
        goTo(player.x, player.y - 600);
        await settle(2, true);

        const before = game.trailPrints.mesh.count;

        host.travel.set("player", { at: [player.x, player.y], walked: 600, next: 600, heading: [0, -1], deck: ["tracks"] });
        await settle(4);

        const [tracks] = host.fresh.values();

        if (!tracks) {
            return null;
        }

        // On them: drawn, and said
        goTo(...tracks.points[1]);
        await settle(4, true);

        const drawn = game.trailPrints.mesh.count;

        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        const minimap = [...game.minimap.trails];
        const pack = [...host.wild].filter(([, one]) => one.pack === tracks.pack).map(([id]) => game.battle.actor(id));

        // The pack gone: the tracks too
        for (const one of pack) {
            Object.assign(one, { dead: true, respawnAt: Infinity, target: null });
        }

        await settle(4, true);

        return { id: tracks.id, creature: tracks.creature, points: tracks.points.length, before, drawn, minimap, after: game.trailPrints.mesh.count, seen: game.freshSeen.has(tracks.id), gone: !host.fresh.has(tracks.id), told };
    });

    expect(fresh).not.toBeNull();
    expect(fresh.points).toBeGreaterThanOrEqual(3);
    expect(fresh.drawn).toBeGreaterThan(fresh.before);
    expect(fresh.after).toBeLessThan(fresh.drawn);
    expect(fresh).toMatchObject({ seen: true, gone: true });
    expect(fresh.minimap).toEqual([fresh.id]);
    expect(fresh.told.some((text) => /^Fresh tracks, not long made: an? .+'s, and not alone\. They lead off to the [a-z-]+: they're on your minimap\.$/.test(text)), JSON.stringify(fresh.told)).toBe(true);
});

test("the wilds director puts strangers on the way: a pedlar selling odds and ends, a wounded hunter healed with a draught telling of a place round about, hungry bandits hailing the player and paid to let them by", async ({ page }) => {
    // (Three strangers met, each drawn, walked up to and talked to)
    test.setTimeout(300000);
    await playing(page, "/?play&seed=1");

    const pack = page.locator(".pack");
    const talk = page.locator(".talk");

    // Out in the wilds 600 m north of the start town, going north, the next card a stranger (the
    // one given), walked up to them and tapped till the talk's begun
    const meet = (kind) =>
        page.evaluate(async (kind) => {
            const { game, session } = window.pellagos;
            const { host } = game;
            const player = game.battle.actor("player");

            game.stop();
            Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
            Object.assign(player, { hp: 1e6, maxHp: 1e6 });

            // (Every word on the banner kept)
            window.told ??= [];

            if (!window.watching) {
                window.watching = true;
                new MutationObserver((records) => window.told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });
            }

            const settle = async (steps, render = false) => {
                for (let k = 0; k < steps; k++) {
                    player.hp = player.maxHp;
                    game.advance(0.25, { render });

                    while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                        await new Promise((resolve) => setTimeout(resolve, 0));
                    }
                }
            };
            const goTo = (x, y) => Object.assign(player, { x, y, square: [Math.floor(x), Math.floor(y)], path: [], order: null, progress: null, target: null });
            const [sx, sy] = game.world.start.at;

            goTo(sx, sy - 600 - 120 * ["pedlar", "hunter", "bandits"].indexOf(kind));
            host.travel.set("player", { at: [player.x, player.y], walked: 600, next: 600, heading: [0, -1], deck: ["stranger"], strangers: [kind] });
            await settle(4);

            const stranger = [...host.strangers.values()].find((each) => each.kind === kind);

            if (!stranger) {
                return null;
            }

            const one = game.battle.actor(stranger.ids[0]);

            // (Come near: said, and drawn, a step at a time; the bandits' chief hailing the player)
            goTo(one.x + 6, one.y);
            await settle(4, true);

            const hailed = [...(game.hud.said?.keys() ?? [])].includes(one.id) && Boolean(stranger.hailed?.includes("player"));

            for (let k = 0; k < 40 && !game.avatars.has(one.id); k++) {
                await settle(1, true);
            }

            const drawn = game.avatars.has(one.id);

            // (Tapped, the camera turned to look past the player at them, till they're talking)
            for (let tap = 0; tap < 8 && one.talkingTo !== "player"; tap++) {
                game.cameraFollow.yaw = Math.atan2(player.x - one.x, player.y - one.y);
                game.cameraFollow.turning = 0;
                game.advance(0.2);

                const spot = session.view.toScreen(game.avatars.get(one.id).point(0.6));

                if (spot) {
                    game.tap(spot.x, spot.y, { time: performance.now() + 9000 * (tap + 1) });
                }

                game.advance(4, { render: false });
            }

            game.start();

            return { id: stranger.id, one: one.id, name: one.name, toll: stranger.toll ?? null, drawn, hailed, talking: one.talkingTo, gold: game.progress.gold };
        }, kind);

    // A pedlar: said, drawn; their odds and ends for sale, a healing draught among them
    const pedlar = await meet("pedlar");

    expect(pedlar).toMatchObject({ drawn: true, talking: "player" });
    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-name")).toHaveText(pedlar.name);
    await expect(talk.locator(".talk-title")).toHaveText("Pedlar");
    await talk.getByRole("button", { name: /for sale/ }).click();
    await expect(pack).toBeVisible();
    await expect(pack.locator(".pack-title")).toContainText("Trading with");
    await expect(pack.locator(".wares .pack-row", { hasText: "Healing draught" })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(pack).toBeHidden();

    // A wounded hunter: given a draught, they tell of a place round about, in the journal and on the map
    await page.evaluate(() => window.pellagos.game.progress.stow({ id: "potion", quality: "common" }));

    const hunter = await meet("hunter");

    expect(hunter).toMatchObject({ drawn: true, talking: "player" });
    await expect(talk.locator(".talk-title")).toHaveText("Hunter");
    await talk.getByRole("button", { name: /Here, drink this/ }).click();
    await expect(talk).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.pellagos.game.memory.heard?.at(-1)?.hunter ?? false)).toBe(true);

    // Hungry bandits: their chief hails the player, and wants food or gold; paid, they let them by
    const bandits = await meet("bandits");

    expect(bandits).toMatchObject({ drawn: true, hailed: true, talking: "player" });
    await expect(talk.locator(".talk-title")).toHaveText("Outlaw");
    await expect(talk.locator(".talk-line")).toContainText(`${bandits.toll} gold`);
    await talk.getByRole("button", { name: /Here's your gold/ }).click();
    await expect.poll(() => page.evaluate((id) => window.pellagos.game.host.strangers.get(id)?.paid, bandits.id)).toBe("player");

    const after = await page.evaluate(({ id }) => ({ gold: window.pellagos.game.progress.gold, neutral: window.pellagos.game.host.strangers.get(id).ids.every((each) => window.pellagos.game.battle.actor(each).neutral), told: window.told }), bandits);

    expect(after.gold).toBe(bandits.gold - bandits.toll);
    expect(after.neutral).toBe(true);
    expect(after.told.some((text) => text.startsWith("A pedlar, resting by the way")), JSON.stringify(after.told)).toBe(true);
    expect(after.told.some((text) => text.startsWith("Someone's down ahead, hurt")), JSON.stringify(after.told)).toBe(true);
    expect(after.told.some((text) => new RegExp(`^${hunter.name.split(" ")[0]} tells you of .+ near .+\\. It's in your journal, and on your map\\.$`).test(text)), JSON.stringify(after.told)).toBe(true);
    expect(after.told.some((text) => text.startsWith("Bandits bar your way, hungry")), JSON.stringify(after.told)).toBe(true);
});

// The wild's wary beasts, by hand (core/wary.js; run in the page): out in the wilds 600 m north of
// the start town, the orc gone and the player hard to kill, every word on the banner kept; a wolf
// of the wild's put out `metres` north of them as the host puts the wary beasts out roaming
// (core/host.js #rouse: reacting, one of a pack of one), its dice thrown 2 and swayed by `nerve`
// (battle.js `nerve`), the camera turned to it. The game stopped, and played on by hand, drawn as
// it goes (window.wild: { settle, goTo, told })
const WARY_WILDS = async ({ metres, nerve }) => {
    const { game } = window.pellagos;
    const { host, battle } = game;
    const player = battle.actor("player");
    const told = [];

    game.stop();
    Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
    Object.assign(player, { hp: 1e6, maxHp: 1e6 });
    new MutationObserver((records) => told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

    const settle = async (steps, render = true) => {
        for (let k = 0; k < steps; k++) {
            game.advance(0.25, { render });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
    };
    const goTo = (x, y) => Object.assign(player, { x, y, square: [Math.floor(x), Math.floor(y)], path: [], order: null, progress: null, target: null });

    goTo(player.x, player.y - 600);
    await settle(2);

    const square = [player.square[0], player.square[1] - metres];

    host.wild.set("wary-wolf", { creature: "wolf", tier: 2, pack: "wary-wolf", camp: null, lair: null, master: false });
    battle.add({ id: "wary-wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: "beasts", square, ai: "wild", hp: 400, speed: 1.4, chase: 3.2, wild: { creature: "wolf", tier: 2, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: "wary-wolf", leader: null, menace: true, reacts: true, packSize: 1 } });
    battle.place("wary-wolf", "town", square);
    battle.actor("wary-wolf").chance = { next: () => 0, int: (low) => low, state: 0 };
    battle.nerve = () => nerve;
    game.cameraFollow.yaw = Math.atan2(player.x - battle.actor("wary-wolf").x, player.y - battle.actor("wary-wolf").y);
    game.cameraFollow.turning = 0;

    // (Told of as the host tells of those it puts out, and played on till it's drawn: its kind's
    // model fetched and made, a step at a time), not minded till then
    host.events.push({ type: "roused", time: battle.time, ids: ["wary-wolf"], creature: "wolf" });
    battle.actor("wary-wolf").ai = null;

    for (let k = 0; k < 900 && !game.avatars.has("wary-wolf"); k++) {
        game.advance(1 / 30, { render: false, wait: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    battle.actor("wary-wolf").ai = "wild";
    window.wild = { settle, goTo, told };
};

test("a wary wolf out in the wilds is minded by a reaction roll: warning the player off, its mark on its bar, and told them once they know wolves well; charging once they come on", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // A wolf 10 m off, its dice thrown 2 and swayed +2 (4: core/wary.js REACTION): it warns them
    // off, standing its ground, its display made
    await page.evaluate(WARY_WILDS, { metres: 10, nerve: 2 });

    const met = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { battle } = game;
        const { settle, goTo, told } = window.wild;

        // (Wolves known well: their page in the bestiary at Known, core/bestiary.js)
        game.progress.bestiary.kinds.wolf = { points: 8, seen: true, signs: 0, slain: 0 };

        const wolf = battle.actor("wary-wolf");
        const player = battle.actor("player");
        const mark = () => {
            const chip = game.hud.tracked.get("wary-wolf")?.querySelector(".mood") ?? null;

            return chip && { text: chip.textContent, title: chip.title };
        };

        await settle(8);

        const warning = { mood: wolf.mood?.kind ?? null, mark: mark(), warned: wolf.warnedAt > 0, after: wolf.target, far: Math.hypot(wolf.x - player.x, wolf.y - player.y) };

        // Come on, within 5 m: it charges
        goTo(wolf.x, wolf.y + 4);
        await settle(2);

        return { warning, charged: { mood: wolf.mood?.kind ?? null, after: wolf.target, mark: mark() }, told };
    });

    expect(met.warning).toMatchObject({ mood: "warn", mark: { text: "!", title: "Warning you off" }, warned: true, after: null });
    expect(met.warning.far).toBeGreaterThan(8);
    expect(met.told).toContain("The wolf's hackles are up: it'll come at you if you come on, or stay. Back away.");
    expect(met.charged).toEqual({ mood: "attack", after: "player", mark: null });
});

test("meat bait the player carries goes on an enemy's wheel of itself the first time; thrown from it to a curious wolf, it arcs to its feet and is eaten; fed enough, the wolf follows them, tamed, down the party's side", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const wheel = page.locator(".action-wheel");

    // A wolf 7 m off, its dice thrown 2 and swayed +10 (12: core/wary.js REACTION): curious, it
    // comes up to them; four meat baits in the pack, one dropped (anything done with what they
    // carry, and the bait's put on a wheel)
    await page.evaluate(WARY_WILDS, { metres: 7, nerve: 10 });

    const placed = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { settle, told } = window.wild;

        game.progress.stow({ id: "meatBait" }, 4);
        game.host.command(game.me, { type: "drop", index: game.progress.slotOf("meatBait"), count: 1 });
        await settle(8);

        const wolf = game.battle.actor("wary-wolf");
        const place = Object.entries(game.wheels.enemy[0]).find(([, key]) => key === "item:meatBait")?.[0] ?? null;

        return { place, mood: wolf.mood?.kind ?? null, mark: game.hud.tracked.get("wary-wolf")?.querySelector(".mood")?.textContent ?? null, told: [...told], at: session.view.toScreen(game.avatars.get("wary-wolf").point(0.5)), carried: game.progress.held("meatBait") };
    });

    expect(placed.place).not.toBeNull();
    expect(placed.told).toContain(`Meat bait is on an enemy's wheel one, at ${placed.place.toUpperCase()}: hold on a beast and throw it to them.`);
    expect(placed).toMatchObject({ mood: "curious", mark: "?", carried: 3 });

    // Held on the wolf: the bait on its slice ("Meat"); flicked into it, thrown
    const { x, y } = placed.at;
    const way = { n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1] }[placed.place];

    await page.evaluate(() => window.pellagos.game.start());
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(wheel).toBeVisible();
    await expect(wheel.locator(`.slice[data-direction="${placed.place}"] .label`)).toHaveText("Meat");
    await page.mouse.move(x + way[0] * 20, y + way[1] * 20, { steps: 2 });
    await page.mouse.move(x + way[0] * 50, y + way[1] * 50, { steps: 2 });
    await page.mouse.up();

    const fed = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { battle } = game;
        const wolf = battle.actor("wary-wolf");
        const thrown = [];

        game.stop();

        // (The bait in the air, then on the ground at its feet; the wolf eating it, and curious of
        // them the more for it)
        for (let k = 0; k < 40 && !battle.baits.length; k++) {
            game.advance(0.05);
        }

        thrown.push(...battle.baits.map(({ by, kind, x, y }) => ({ by, kind, near: Math.hypot(x - wolf.x, y - wolf.y) < 1.5 })));

        for (let k = 0; k < 60 && battle.baits.length; k++) {
            game.advance(0.25, { render: k % 8 === 0 });
        }

        const first = { thrown, eaten: !battle.baits.length, feedings: wolf.mood?.feedings ?? 0, mood: wolf.mood?.kind ?? null };

        // Twice more, from the Action Bar's way of doing it (game.act): tamed
        for (let throws = 0; throws < 2 && battle.actor("wary-wolf"); throws++) {
            game.act("item:meatBait", "wary-wolf");

            for (let k = 0; k < 60 && battle.actor("wary-wolf") && (battle.baits.length || battle.actor("wary-wolf").mood?.feedings === throws + 1); k++) {
                game.advance(0.25, { render: false });
            }
        }

        for (let k = 0; k < 8; k++) {
            game.advance(0.25);
        }

        const tamed = [...game.host.companions.entries()].find(([, one]) => one.tamed) ?? null;

        return { first, tamed: tamed && { creature: tamed[1].creature, leader: tamed[1].leader, until: tamed[1].until }, wild: battle.actor("wary-wolf")?.dead === false, carried: game.progress.held("meatBait"), told: window.wild.told };
    });

    expect(fed.first).toEqual({ thrown: [{ by: "player", kind: "meat", near: true }], eaten: true, feedings: 1, mood: "curious" });
    expect(fed.tamed).toEqual({ creature: "wolf", leader: "player", until: null });
    expect(fed.wild).toBe(false);
    expect(fed.carried).toBe(0);
    expect(fed.told).toContain("The wolf follows you now, fed and tamed: yours till it falls, or you let it go.");
    await expect(page.locator("#party .member.tamed")).toHaveCount(1);
    await expect(page.locator("#party .member.tamed")).toHaveAttribute("aria-label", "Wolf, tamed, at your side");
});

test("the wilds director lays an ambush ahead of a player crossing the wilds: its band hidden in cover, no bars over them; told as they come near, then sprung on them, said, and after them", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const laid = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { host, battle } = game;
        const player = battle.actor("player");
        const told = [];

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });
        new MutationObserver((records) => told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        const settle = async (steps, render = true) => {
            for (let k = 0; k < steps; k++) {
                player.hp = player.maxHp;
                game.advance(0.25, { render });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const goTo = (x, y) => Object.assign(player, { x, y, square: [Math.floor(x), Math.floor(y)], path: [], order: null, progress: null, target: null });

        // Out in the wilds 600 m north of the start town, going north, owed the ambush card
        goTo(player.x, player.y - 600);
        await settle(2);
        host.travel.set("player", { at: [player.x, player.y], walked: 600, next: 600, heading: [0, -1], deck: ["ambush"] });
        await settle(4);

        const [ambush] = host.ambushes.values();

        if (!ambush) {
            return null;
        }

        const band = () => ambush.ids.map((id) => battle.actor(id)).filter(Boolean);
        const hidden = band().filter((one) => one.hidden === true).map(({ id }) => id);
        const unseen = hidden.every((id) => !game.hud.tracked.has(id) && game.avatars.get(id)?.object.visible !== true);

        // Coming up the way they were going, 20 m short of its heart: told
        const [hx, hy] = ambush.heart;
        const [ax, ay] = ambush.axis;

        goTo(hx - ax * 20, hy - ay * 20);
        await settle(3);

        const tell = { told: ambush.toldAt !== null, sprung: ambush.sprung };

        // Walked into it: sprung, its band out of cover and after them
        goTo(hx, hy);
        await settle(6);

        return { style: ambush.style, count: ambush.ids.length, hidden: hidden.length, unseen, tell, sprung: ambush.sprung, after: band().filter((one) => !one.dead && one.target === "player").length, shown: band().filter((one) => !one.hidden).length, told };
    });

    expect(laid).not.toBeNull();
    expect(laid.count).toBeGreaterThanOrEqual(3);
    expect(laid.hidden).toBeGreaterThan(0);
    expect(laid.unseen).toBe(true);
    expect(laid.tell).toEqual({ told: true, sprung: false });
    expect(laid.told.some((text) => /^(Steel glints in the brush ahead|A twig snaps in the brush ahead|The birds burst from the trees ahead|The earth ahead's been turned|Fresh webs strung across the way ahead|Their sleeve bears a mark)/.test(text)), JSON.stringify(laid.told)).toBe(true);
    expect(laid.sprung).toBe(true);
    expect(laid.told.some((text) => /^(Ambush! |The dead rise from the earth round you!|Spiders! All round you!|It's a trap! Cultists!)/.test(text)), JSON.stringify(laid.told)).toBe(true);
    expect(laid.after).toBeGreaterThan(0);
    expect(laid.shown).toBe(laid.count);
});

test("the wilds director lays a fallen tree across the way: drawn over its squares, said, the way round it; held on, the player walks up to it and clears it, swinging at it, and it's gone for everyone", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // Out in the wilds 600 m north of the start town, going north, the next card a fallen tree
    const laid = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { host } = game;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6, weapon: "axe" });

        // (Every word on the banner kept)
        window.told = [];
        new MutationObserver((records) => window.told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        window.settle = async (steps, render = false) => {
            for (let k = 0; k < steps; k++) {
                player.hp = player.maxHp;
                game.advance(0.25, { render });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };

        const goTo = (x, y) => Object.assign(player, { x, y, square: [Math.floor(x), Math.floor(y)], path: [], order: null, progress: null, target: null });
        const [sx, sy] = game.world.start.at;
        const pick = host.random.pick;

        goTo(sx, sy - 600);
        host.random.pick = (list) => (list.includes("tree") && list.includes("rocks") ? "tree" : pick.call(host.random, list));
        host.travel.set("player", { at: [player.x, player.y], walked: 600, next: 600, heading: [0, -1], deck: ["obstacle"] });
        await window.settle(4);
        host.random.pick = pick;

        const [obstacle] = host.obstacles.values();

        if (!obstacle) {
            return null;
        }

        const [x0, y0, x1, y1] = obstacle.box;
        const blocked = [];

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                blocked.push(game.world.maps.town.squares.blocked(x, y));
            }
        }

        // (Come near, 8 m off its middle on the way it was coming: said, drawn; the camera looking
        // at it past the player)
        goTo(obstacle.at[0] + 0.5, y1 + 8.5);
        await window.settle(4, true);
        game.cameraFollow.yaw = Math.atan2(player.x - obstacle.at[0], player.y - obstacle.at[1]);
        game.cameraFollow.turning = 0;
        await window.settle(4, true);

        const group = game.obstacleProps.shown.get(obstacle.id);
        const spot = group && session.view.toScreen(group.position.clone().setY(group.position.y + 0.4));

        return { id: obstacle.id, box: obstacle.box, blocked, drawn: Boolean(group), spot, at: [player.x, player.y] };
    });

    expect(laid).not.toBeNull();
    expect(laid.drawn).toBe(true);
    expect(laid.blocked.length).toBe(7);
    expect(laid.blocked.every(Boolean)).toBe(true);
    expect(laid.spot).toBeTruthy();

    // Held on (the game going on, listening): the player walks up to it and clears it, swinging
    // at it; let go once it's cleared
    const before = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        Object.assign(player, { stamina: 1e6, maxStamina: 1e6 });
        game.start();

        return game.avatars.get("player").actions.attacks;
    });

    await page.mouse.move(laid.spot.x, laid.spot.y);
    await page.mouse.down();
    await expect.poll(() => page.evaluate((id) => !window.pellagos.game.host.obstacles.has(id), laid.id), { timeout: 150000, intervals: [1000] }).toBe(true);
    await page.mouse.up();

    const cleared = await page.evaluate(({ box: [x0, y0] }) => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();

        // (Swinging at it, as it's cleared: its blows started)
        return { swung: game.avatars.get("player").actions.attacks, clearing: player.clearing ?? null, toClear: game.toClear, at: [player.x, player.y], free: !game.world.maps.town.squares.blocked(x0, y0) };
    }, laid);

    expect(cleared).toMatchObject({ clearing: null, toClear: null, free: true });
    expect(cleared.swung).toBeGreaterThanOrEqual(before + 2);
    expect(Math.hypot(cleared.at[0] - laid.at[0], cleared.at[1] - laid.at[1])).toBeGreaterThan(3);

    const told = await page.evaluate(() => window.told);

    expect(told).toContain("A fallen tree lies across the way ahead. Go round it, or hold on it to clear it.");
    expect(told.some((text) => text === "The way's clear." || text === "It was a trap! Brigands burst out of cover!" || text.startsWith("Under the tree, a cart's load, crushed long ago.")), JSON.stringify(told)).toBe(true);
});

test("a treasure map read out in the wilds: its circle on the world map and the minimap and in the journal; its keepers woken as the player comes near; where it's buried glinting; put down, it's dug up, the player's share in it, and the hunt's done", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Out in the wilds 300 m north of the start town, a common map in the pack
    await page.evaluate(async () => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // (Every word on the banner kept)
        window.told = [];
        new MutationObserver((records) => window.told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        window.settle = async (steps, render = false) => {
            for (let k = 0; k < steps; k++) {
                player.hp = player.maxHp;
                game.advance(0.25, { render });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        window.goTo = (x, y) => Object.assign(player, { x, y, path: [], order: null, progress: null, target: null });
        window.goTo(player.x, player.y - 300);
        await window.settle(2);
        game.host.players.get("player").progress.stow({ id: "treasureMap", quality: "common" }, 1);
    });

    // Read from the pack, as the player would
    const pack = page.locator(".pack");

    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("i");
    await expect(pack).toBeVisible();
    await page.evaluate(() => window.pellagos.game.stop());
    await pack.locator('.carried .pack-cell[data-item="treasureMap"]').click();
    await expect(pack.locator(".pack-about")).toContainText("Read it out in the wilds");
    await pack.locator(".pack-about").getByRole("button", { name: /^Read/ }).click();
    expect(await playUntil(page, () => document.querySelector("#banner")?.textContent.includes("The treasure map shows somewhere"), { seconds: 2 })).toBe(true);
    await page.evaluate(() => window.pellagos.game.closePack());
    await expect(pack).toBeHidden();

    const hunt = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { host } = game;
        const player = game.battle.actor("player");
        const { settle, goTo, told } = window;

        game.stop();

        const [treasure] = host.treasures.values();

        if (!treasure) {
            return null;
        }

        game.toggleJournal();

        const journal = [...document.querySelectorAll(".journal-treasure .journal-request-title")].map((node) => node.textContent);

        game.closeJournal();

        const marked = { left: host.players.get("player").progress.count("treasureMap"), map: game.worldMapView().searches, journal, keepers: treasure.cache };

        // By its circle: its keepers woken, and the circle on the minimap
        const [dx, dy] = [player.x - treasure.centre[0], player.y - treasure.centre[1]];
        const d = Math.hypot(dx, dy);

        goTo(treasure.centre[0] + (dx / d) * (treasure.radius + 30), treasure.centre[1] + (dy / d) * (treasure.radius + 30));
        await settle(4, true);
        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        const cache = host.caches.get(treasure.cache);
        const woken = { keepers: cache?.ids.length ?? 0, treasure: cache?.treasure === treasure.id, minimap: game.minimap.searches.includes(treasure.id), chest: host.ground.has(`chest-${cache?.id}`), glint: game.glints.shown.size };

        // Near where it's buried: it glints
        goTo(treasure.spot[0] + 6, treasure.spot[1]);
        await settle(2, true);

        const glint = game.glints.shown.get(treasure.id);
        const glinting = { glint: glint?.sprite.name, mound: glint?.mound.name, seen: Boolean(glint && glint.sprite.parent === game.view.scene) };

        // Put down: dug up, the player's share in it
        for (let round = 0; round < 4 && cache.ids.some((id) => !game.battle.actor(id)?.dead); round++) {
            for (const id of cache.ids) {
                game.battle.afflict(id, "poison", { by: "player", damage: 1e7 });
            }

            await settle(8);
        }

        game.advance(0.1);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const share = [...host.ground.values()].find((dropped) => dropped.from === "chest" && dropped.for === "player");

        return {
            marked,
            woken,
            glinting,
            dug: { gone: !host.treasures.size, open: game.drops.drawn.get(share?.id)?.object.children[0].name, gold: share?.bundle.gold, items: share?.bundle.items.length, searches: game.worldMapView().searches.length, glints: game.glints.shown.size },
            told,
        };
    });

    expect(hunt).not.toBeNull();
    expect(hunt.marked).toMatchObject({ left: 0, keepers: null, journal: ["Treasure map"] });
    expect(hunt.marked.map).toEqual([expect.objectContaining({ grade: "common", own: true, radius: 40 })]);
    expect(hunt.told.some((text) => /^The treasure map shows somewhere .+: it's marked on your world map, and your party's\. Search the circle\.$/.test(text)), JSON.stringify(hunt.told)).toBe(true);
    expect(hunt.woken.keepers).toBeGreaterThanOrEqual(3);
    expect(hunt.woken).toMatchObject({ treasure: true, minimap: true, chest: false, glint: 0 });
    expect(hunt.told.some((text) => /^Whoever buried it left .+ keeping it\. Put them all down to dig it up\.$/.test(text)), JSON.stringify(hunt.told)).toBe(true);
    expect(hunt.glinting).toEqual({ glint: expect.stringMatching(/^treasure glint/), mound: expect.stringMatching(/^treasure mound/), seen: true });
    expect(hunt.dug).toMatchObject({ gone: true, open: "chest-open", searches: 0, glints: 0 });
    expect(hunt.dug.gold).toBeGreaterThan(0);
    expect(hunt.dug.items).toBeGreaterThanOrEqual(2);
    expect(hunt.told).toContain("You dig up the treasure: your share of it lies before you. Tap it to take it.");
});

test("in a party: a place another of it finds is on the player's map for good, who found it said and shown; a ping from them on both maps and in the world, the player's own from the world map's ping button, each gone after a while", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Bram comes into the world and the player's party, and goes off to a place the player's never found
    const found = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { host, battle } = game;
        const { placesOf } = await import("/js/core/places.js");
        const me = battle.actor(game.me);

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // (Every word on the banner kept)
        window.told = [];
        new MutationObserver((records) => window.told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        host.join({ id: "guest", hero: { ...host.players.get(game.me).hero, name: "Bram" } });
        battle.place("guest", "town", [me.square[0] + 24, me.square[1]]);
        host.command(game.me, { type: "party", do: "invite", who: "guest" });
        host.command("guest", { type: "party", do: "accept" });
        game.advance(0.25);

        const far = ({ at }) => Math.hypot(at[0] - me.x, at[1] - me.y);
        const place = placesOf(game.world.plan).filter(({ at }) => !game.explored.sighted(...at)).sort((a, b) => far(a) - far(b))[0];

        battle.place("guest", "town", [Math.floor(place.at[0]), Math.floor(place.at[1])]);
        game.advance(0.25);
        game.advance(0.25);

        return { id: place.id, at: place.at, far: far(place), sighted: game.explored.sighted(...place.at), finder: game.explored.finderOf(place.id), icon: game.worldMapView().icons.find(({ id }) => id === place.id)?.finder ?? null };
    });

    expect(found.far).toBeGreaterThan(200);
    expect(found).toMatchObject({ sighted: true, finder: "Bram", icon: "Bram" });
    expect(await page.evaluate(() => window.told.some((text) => /^Bram found .+: it's on your map\.$/.test(text))), JSON.stringify(await page.evaluate(() => window.told))).toBe(true);

    // The world map, close in by the place: who found it; no ping on it yet
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("m");
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn, null, { polling: 100 });

    const map = await page.evaluate(([x, z]) => {
        const { game, worldMap } = window.pellagos;

        // (The world on under the map, played with others, only as the test moves it: what's
        // tapped on the map answered at once)
        game.stop();

        worldMap.view = { scale: 2, x, z };
        worldMap.draw();

        return { pings: worldMap.drawn.pings, finders: worldMap.drawn.finders, button: !document.querySelector("#worldmapping").hidden };
    }, found.at);

    expect(map).toEqual({ pings: 0, finders: ["Bram"], button: true });

    // Bram pings by it, the map open: drawn on it as it comes; on the minimap (at its edge, it's so
    // far) and in the world; said
    const pinged = await page.evaluate(([x, y]) => {
        const { game } = window.pellagos;

        game.host.command("guest", { type: "party", do: "ping", at: [x, y] });
        game.advance(0.1, { render: false });
        game.minimap.drawn = -Infinity;
        game.advance(0.05, { render: false });

        const [drawn] = game.pingBeacons.shown.values();

        return { pings: game.pingView().map(({ name, own }) => ({ name, own })), minimap: game.minimap.pings, column: drawn?.near.name, seen: drawn?.near.parent === game.view.scene && drawn?.far.parent === game.view.far.scene };
    }, found.at);

    expect(pinged.pings).toEqual([{ name: "Bram", own: false }]);
    expect(pinged.minimap).toEqual([expect.objectContaining({ edge: true })]);
    expect(pinged).toMatchObject({ column: expect.stringMatching(/^ping \d+ column near$/), seen: true });
    await page.waitForFunction(() => window.pellagos.worldMap.drawn.pings === 1, null, { polling: 100 });
    expect(await page.evaluate(() => window.told.some((text) => /^Bram pings the map, [\d.]+ k?m [a-z-]+\.$/.test(text))), JSON.stringify(await page.evaluate(() => window.told))).toBe(true);

    // The ping button, then a tap on the map: the player's own ping, for the party
    const button = page.locator("#worldmapping");

    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#worldmappicktext")).toHaveText("Ping: tap where to show your party");
    await page.locator("#worldmapcanvas").click();
    await expect(page.locator("#worldmapnote")).toHaveText("Pinged: your party sees it on their maps, and a column of green light there");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await page.evaluate(() => window.pellagos.game.advance(0.1, { render: false }));
    await page.waitForFunction(() => window.pellagos.game.pingView().length === 2, null, { polling: 100 });
    await page.waitForFunction(() => window.pellagos.worldMap.drawn.pings === 2, null, { polling: 100 });
    await page.keyboard.press("Escape");
    await expect(page.locator("#worldmap")).toBeHidden();

    // After a while, both gone; what Bram found still theirs
    const after = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();

        // (Half a second a step: there's nothing in it to see till then)
        game.advance(32, { frame: 0.5, render: false });
        game.advance(0.1, { render: true });

        return { pings: game.pingView().length, columns: game.pingBeacons.shown.size };
    });

    expect(after).toEqual({ pings: 0, columns: 0 });
    expect(await page.evaluate((id) => window.pellagos.game.explored.finderOf(id), found.id)).toBe("Bram");
});

test("markers on the world map: one put down with its button, what it marks and its words chosen; tapped, shared with the party; one shared by another kept as the player's; taken away; ten at most; on the minimap too", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Bram comes into the world and the player's party
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { host, battle } = game;
        const me = battle.actor(game.me);

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // (Every word on the banner kept)
        window.told = [];
        new MutationObserver((records) => window.told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        host.join({ id: "guest", hero: { ...host.players.get(game.me).hero, name: "Bram" } });
        battle.place("guest", "town", [me.square[0] + 24, me.square[1]]);
        host.command(game.me, { type: "party", do: "invite", who: "guest" });
        host.command("guest", { type: "party", do: "accept" });
        game.advance(0.25, { render: false });
        game.start();
    });

    // The world map (the world on under it only as the test moves it)
    await page.keyboard.press("m");
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn, null, { polling: 100 });
    await page.evaluate(() => window.pellagos.game.stop());

    const canvas = page.locator("#worldmapcanvas");
    const box = await canvas.boundingBox();
    const dialog = page.locator("#marker");

    // (No menu of the browser's own over it: "Save image as" and the like)
    expect(await canvas.evaluate((map) => !map.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })))).toBe(true);

    // Its button, then a tap 30 pixels east of the player: what it marks and its words asked
    await page.locator("#worldmapmark").click();
    await expect(page.locator("#worldmapmark")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#worldmappicktext")).toHaveText("Marker: tap where to put it");
    await canvas.click({ position: { x: box.width / 2 + 30, y: box.height / 2 } });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#markertitle")).toHaveText("New marker");
    await expect(dialog.locator(".marker-kind")).toHaveCount(8);
    await dialog.locator('.marker-kind[data-icon="danger"]').click();
    await expect(dialog.locator('.marker-kind[data-icon="danger"]')).toHaveAttribute("aria-checked", "true");
    await page.locator("#markerwords").fill("  Wolves'   den ");
    await dialog.getByRole("button", { name: "Put it there" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#worldmapnote")).toHaveText("Marked: tap it to share it or take it away");

    const put = await page.evaluate(() => {
        const { game, worldMap } = window.pellagos;
        const [marker] = game.markerView();
        const player = worldMap.player;

        return { marker, east: marker.x - player.x, drawn: worldMap.drawn.markers };
    });

    expect(put.marker).toMatchObject({ icon: "danger", words: "Wolves' den", from: null });
    expect(put.east).toBeGreaterThan(0);

    // Tapped (its head, over its point): what it is, and shared with the party
    const head = await page.evaluate(([x, z]) => {
        const { view } = window.pellagos.worldMap;
        const canvas = document.querySelector("#worldmapcanvas");

        return { x: (x - view.x) / view.scale + canvas.clientWidth / 2, y: (z - view.z) / view.scale + canvas.clientHeight / 2 - 22 };
    }, [put.marker.x, put.marker.z]);

    await canvas.click({ position: head });
    await expect(dialog).toBeVisible();
    await expect(page.locator("#markertitle")).toHaveText("Wolves' den");
    await expect(page.locator("#markernote")).toContainText("Danger");
    await expect(dialog.locator("#markermenu button")).toHaveText(["Share with your party", "Run there", "Take it away", "Close"]);
    await dialog.getByRole("button", { name: "Share with your party" }).click();
    await expect(dialog).toBeHidden();
    await page.evaluate(() => window.pellagos.game.advance(0.1, { render: false }));
    expect(await page.evaluate(() => window.told)).toContain("Shared with your party: it's on their maps now.");

    // Bram shares one: kept as the player's, said to be his, and drawn on the open map
    await page.evaluate(([x, z]) => {
        const { game } = window.pellagos;

        game.host.command("guest", { type: "party", do: "mark", at: [x, z + 20], icon: "loot", words: "Old chest" });
        game.advance(0.1, { render: false });
    }, [put.marker.x, put.marker.z]);
    await page.waitForFunction(() => window.pellagos.worldMap.drawn.markers === 2, null, { polling: 100 });

    const shared = await page.evaluate(() => window.pellagos.game.markerView()[1]);

    expect(shared).toMatchObject({ icon: "loot", words: "Old chest", from: "Bram" });
    expect(await page.evaluate(() => window.told.some((text) => /^Bram shares a marker with you \(Loot: "Old chest"\)(, .+)?\. It's on your map\.$/.test(text))), JSON.stringify(await page.evaluate(() => window.told))).toBe(true);

    // The player's own taken away
    await canvas.click({ position: head });
    await expect(page.locator("#markertitle")).toHaveText("Wolves' den");
    await dialog.getByRole("button", { name: "Take it away" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("#worldmapnote")).toHaveText("The marker's taken away");
    expect(await page.evaluate(() => window.pellagos.game.markerView().map(({ words }) => words))).toEqual(["Old chest"]);

    // Ten at most: the button says so
    await page.evaluate(([x, z]) => {
        const { game } = window.pellagos;

        for (let k = 0; k < 9; k++) {
            game.addMarker([x + k * 50, z + 400], { icon: "flag" });
        }
    }, [put.marker.x, put.marker.z]);
    await page.locator("#worldmapmark").click();
    await expect(page.locator("#worldmapnote")).toHaveText("10 markers already: tap one to take it away first");
    await expect(page.locator("#worldmapmark")).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("Escape");
    await expect(page.locator("#worldmap")).toBeHidden();

    // On the minimap, Bram's, near the player
    const minimap = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.minimap.drawn = -Infinity;
        game.advance(0.05, { render: false });

        return game.minimap.markers;
    });

    expect(minimap).toContain(shared.id);
});

test("from high ground the places in sight are found without going near: said how many, shown on the world map over the fog, none of them been near", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // The player on a rise far out in the wilds with five places in sight, on ground they can stand
    // on all round (found by scanning the world: core/sighting.js), none of them found; a look
    // round later, found and said
    const seen = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { battle } = game;
        const { placesOf } = await import("/js/core/places.js");
        const plan = game.world.plan;
        const findable = [...placesOf(plan), ...plan.sites.filter(({ kind }) => kind === "dungeon")];
        const atOf = (id) => findable.find((place) => place.id === id).at;

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // (Every word on the banner kept)
        window.told = [];
        new MutationObserver((records) => window.told.push(...records.flatMap(({ addedNodes }) => [...addedNodes].map((node) => node.textContent)))).observe(document.querySelector("#banner"), { childList: true });

        const before = game.worldMapView().icons.map(({ id }) => id);

        battle.place(game.me, "town", [1232, 536]);
        game.advance(0.6, { render: false });
        game.advance(0.05, { render: false });

        const spotted = [...game.explored.spotted];

        return { spotted, before: spotted.filter((id) => before.includes(id)), near: spotted.filter((id) => game.explored.sighted(...atOf(id))), shown: game.worldMapView().icons.filter(({ id }) => spotted.includes(id)).length };
    });

    expect(seen.spotted).toHaveLength(5);
    expect(seen).toMatchObject({ before: [], near: [], shown: 5 });
    expect(await page.evaluate(() => window.told.includes("From up here you can see 5 places: they're on your map.")), JSON.stringify(await page.evaluate(() => window.told))).toBe(true);

    // The world map, close in round the rise: their icons drawn over the fog
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("m");
    await page.waitForFunction(() => document.querySelector("#worldmap").open && window.pellagos.worldMap?.drawn, null, { polling: 100 });

    const drawn = await page.evaluate(() => {
        const { game, worldMap } = window.pellagos;

        game.stop();
        worldMap.view = { scale: 4, x: 1232, z: 536 };
        worldMap.draw();

        return worldMap.drawn.icons.length;
    });

    expect(drawn).toBeGreaterThanOrEqual(5);
    await page.keyboard.press("Escape");
});

test("now and then, past the land nearest home, an elite leads its kind: gilded and radiant, its plate in gold, a star on the minimap from 80 m (at its edge while further than it shows); felled, its prize for the player near", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const elite = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { host } = game;
        const player = game.battle.actor("player");
        const { ELITES } = await import("/js/core/creatures.js");
        const { GEAR } = await import("/js/core/gear.js");
        const { CHARMS } = await import("/js/core/goods.js");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        const settle = async (steps, render = false) => {
            for (let k = 0; k < steps; k++) {
                player.hp = player.maxHp;
                game.advance(0.25, { render });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const goTo = (x, y) => Object.assign(player, { x, y, path: [], order: null, progress: null, target: null });
        const leader = () => [...host.wild].find(([, one]) => one.elite === "lead")?.[0] ?? null;

        // Out on the meadows 1,600 m west of the start town (the second tier's land), the packs put
        // out about them taken away again as soon as they're out, till one's an elite's
        const [hx, hy] = host.world.start.at;

        goTo(hx - 1600 + 0.5, hy + 0.5);
        await settle(4);

        let tries = 0;

        for (; tries < 200 && !leader(); tries++) {
            for (const [id, one] of [...host.wild]) {
                if (!one.elite && !one.camp && !one.lair && !one.place && !one.cache && !one.dungeon && !one.works) {
                    game.battle.remove(id);
                }
            }

            await settle(2);
        }

        const id = leader();

        if (!id) {
            return { tries };
        }

        const actor = game.battle.actor(id);
        const { pack, creature } = host.wild.get(id);
        const escorts = [...host.wild].filter(([each, one]) => one.pack === pack && each !== id).map(([each]) => each);
        const centre = [actor.spawn[0] + 0.5, actor.spawn[1] + 0.5];
        const put = Math.hypot(centre[0] - player.x, centre[1] - player.y);
        // (The way back to where the player was: open meadow)
        const way = [(player.x - centre[0]) / put, (player.y - centre[1]) / put];
        const marked = async (off) => {
            goTo(centre[0] + way[0] * off, centre[1] + way[1] * off);
            await settle(2, true);
            game.minimap.drawn = -Infinity;
            game.advance(0.1);

            return game.minimap.elites.map(({ edge }) => edge);
        };

        // Further than ELITES.marker: not marked; nearer, a star at the minimap's edge (it shows
        // 64 m each way); nearer still, where it is (a little beyond the most it goes after anyone
        // from the middle of its round: ELITES.loop + ELITES.leash)
        const far = await marked(ELITES.marker + 25);
        const edge = await marked(ELITES.marker - 8);
        const near = await marked(ELITES.loop + ELITES.leash + 3);

        // Drawn, all of them (a step at a time, the first of a kind's look a while to sculpt)
        for (let k = 0; k < 160 && (game.enlisting.length || game.enlistees.size || !game.avatars.has(id)); k++) {
            game.advance(0.25);
        }

        await settle(2, true);

        const plate = document.querySelector(`.floater.plate[data-id="${id}"]`);
        const drawn = {
            avatar: game.avatars.has(id),
            radiant: game.ailments.shown()[id] ?? [],
            plate: plate?.classList.contains("elite") ?? false,
            name: plate?.querySelector(".name")?.firstChild?.textContent ?? null,
            gold: plate ? getComputedStyle(plate.querySelector(".name")).color : null,
            escorts: escorts.map((each) => document.querySelector(`.floater.plate[data-id="${each}"]`)?.classList.contains("elite") ?? null),
            noticed: actor.target,
        };

        // Felled with the player near (its round brought near them: SPOILS_REACH): its prize on it
        // for them, a piece of gear or a charm
        for (let k = 0; k < 400 && Math.hypot(actor.x - player.x, actor.y - player.y) > 24; k++) {
            await settle(1);
        }

        const by = Math.hypot(actor.x - player.x, actor.y - player.y);

        game.battle.afflict(id, "poison", { by: "player", damage: 1e7 });
        await settle(8);

        const share = [...host.ground.values()].filter((dropped) => dropped.for === "player" && dropped.from === creature);
        // (Its prize made better than common: an outlaw's own sword is a plain one)
        const prize = share.flatMap(({ bundle }) => bundle.items).find(({ id: item, quality }) => (GEAR[item] || CHARMS[item]) && quality !== "common") ?? null;

        return {
            tries,
            name: actor.name,
            kind: creature,
            put,
            escorts: escorts.length,
            far,
            edge,
            near,
            drawn,
            by,
            dead: actor.dead,
            gone: !(game.ailments.shown()[id] ?? []).includes("elite"),
            prize,
            gold: share.reduce((sum, { bundle }) => sum + bundle.gold, 0),
        };
    });

    expect(elite.name, `${elite.tries} tries`).toBeTruthy();
    expect(elite.name).toBe(`Elite ${elite.drawn.name.slice("Elite ".length)}`);
    expect(elite.put).toBeGreaterThan(76);
    expect(elite.put).toBeLessThan(104);
    expect(elite.far).toEqual([]);
    expect(elite.edge).toEqual([true]);
    expect(elite.near).toEqual([false]);
    expect(elite.drawn).toMatchObject({ avatar: true, radiant: ["elite"], plate: true, name: elite.name, gold: "rgb(255, 215, 106)", noticed: null });
    expect(elite.drawn.escorts).toEqual(Array(elite.escorts).fill(false));
    expect(elite.by).toBeLessThanOrEqual(24);
    expect(elite.dead).toBe(true);
    expect(elite.gone).toBe(true);
    expect(elite.prize, elite.kind).not.toBeNull();
    expect(elite.gold).toBeGreaterThan(0);
});

test("a cave held by outlaws is gone into by its mouth: within, the rock all round, their fire, their chief by the locked chest; and out again the same way", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const within = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        const [cave] = game.placeIcons()
            .filter(({ kind }) => kind === "cave")
            .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.y) - Math.hypot(b.x - player.x, b.z - player.y));
        const settle = async (steps) => {
            for (let k = 0; k < steps; k++) {
                game.advance(0.25, { render: false });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const until = async (done, steps = 80) => {
            for (let k = 0; k < steps && !done(); k++) {
                player.hp = player.maxHp;
                game.advance(0.1);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };

        Object.assign(player, { x: cave.x + 30, y: cave.z, path: [], order: null, progress: null });
        await settle(8);

        // In by its mouth
        const building = game.world.interiors.buildings.get(`site:${cave.id}`);
        const [ox, oy] = building.entrance.outside;

        Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null });
        game.host.command("player", { type: "enter", link: building.door.id });
        await until(() => player.map !== "town");
        await until(() => game.interiors.get(player.map)?.object.visible, 120);

        const held = game.host.held.get(cave.id);
        const inside = { map: player.map, drawn: Boolean(game.interiors.get(player.map)?.object.visible), lit: session.view.room?.lights.length ?? 0, chief: game.battle.actor(held.leader).map, chest: game.drops.drawn.get(`chest-${cave.id}`)?.object.children[0].name ?? null };

        // And out again
        game.host.command("player", { type: "enter", link: building.door.id });
        await until(() => player.map === "town");

        return { ...inside, cave: building.maps[0], out: player.map, by: Math.hypot(player.x - ox - 0.5, player.y - oy - 0.5) < 3 };
    });

    expect(within).toEqual({ map: within.cave, drawn: true, lit: within.lit, chief: within.cave, chest: "chest", cave: within.cave, out: "town", by: true });
    expect(within.lit).toBeGreaterThan(1);
});

test("the Tower of Sar Mordal: the rift swirling green beside it, its riftlings round it; in by its door to Sinclair's hall, lit green up through the crack across its floor, two riftlings keeping it; up to his study, open to the sky, his journal on his lectern, the rift stalker by his hoard breathing the rift's green fire", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    const tower = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { world, host } = game;
        const player = game.battle.actor("player");
        const site = world.plan.sites.find((one) => one.kind === "rift tower");
        const settle = async (steps) => {
            for (let k = 0; k < steps; k++) {
                game.advance(0.25, { render: false });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const until = async (done, steps = 80) => {
            for (let k = 0; k < steps && !done(); k++) {
                player.hp = player.maxHp;
                game.advance(0.1);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };
        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });
        Object.assign(host.war, { turn: 70, clock: 30000 });

        // (At noon, 70 m from it: the tower and the rift beside it drawn, the rift swirling)
        Object.assign(player, { x: site.at[0] + 0.5, y: site.at[1] + 70.5, path: [], order: null, progress: null });
        await settle(10);

        let rift = false;

        session.view.scene.traverse((node) => {
            rift ||= node.material?.name === "veil-rift-open" && node.visible;
        });

        // (Its master and a riftling in the study, two riftlings in the hall, the rest round the rift)
        const building = world.interiors.buildings.get(`site:${site.id}`);
        const held = host.lairs.get(site.id).ids.map((id) => game.battle.actor(id));
        const where = held.map(({ wild, map }) => `${wild.creature} ${map === "town" ? "outside" : map.split("/")[1]}`).sort();

        // In by its door, those outside slain
        for (const one of held.filter(({ map }) => map === "town")) {
            Object.assign(one, { dead: true, respawnAt: Infinity });
        }

        for (const one of held.filter(({ map }) => map !== "town")) {
            Object.assign(one.wild, { temper: "calm", guard: 0 });
        }

        const [ox, oy] = building.entrance.outside;

        Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null });
        game.host.command("player", { type: "enter", link: building.door.id });
        await until(() => player.map !== "town");
        await until(() => game.interiors.get(player.map)?.object.visible, 120);

        const room = (id) => game.interiors.get(id);
        const hall = { map: player.map.split("/")[1], lit: room(player.map).lights.filter(({ kind }) => kind === "riftGlow").length, open: room(player.map).open, things: [...new Set(room(player.map).props.map(({ model }) => model))].filter((model) => ["book-open", "books", "scroll", "skull"].includes(model)).sort() };

        // Up its stairs to his study
        const [sx, sy] = building.stairs.ends[0].squares[0];

        Object.assign(player, { square: [sx, sy], x: sx + 0.5, y: sy + 0.5, path: [], order: null, progress: null });
        game.host.command("player", { type: "enter", link: building.stairs.id });
        await until(() => player.map.endsWith("/study"));
        await until(() => game.interiors.get(player.map)?.object.visible, 120);

        const lectern = world.maps[player.map].pieces.find(({ kind }) => kind === "side-table");
        const study = { map: player.map.split("/")[1], open: room(player.map).open, lit: room(player.map).lights.filter(({ kind }) => kind === "riftGlow").length, journal: room(player.map).props.some(({ model, x, z }) => model === "book-open" && x === lectern.x + 0.5 && z === lectern.y + 0.5), chest: Boolean(game.drops.drawn.get(`chest-${site.id}`)) };

        // The rift stalker set on the player, 5 m off: the rift's green fire breathed from its jaws
        const stalker = held.find(({ wild }) => wild.creature === "riftStalker");

        Object.assign(stalker.wild, { temper: "aggressive", guard: 12 });
        host.battle.place(stalker.id, player.map, [player.square[0] + 4, player.square[1] + 3]);

        let breathed = null;

        for (let k = 0; k < 400 && !breathed; k++) {
            player.hp = player.maxHp;
            game.advance(1 / 30);
            breathed = game.effects.streams.find(({ kind }) => kind === "riftBreath") ? [...game.effects.flying.values()].map(({ kind }) => kind) : null;
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        return { name: building.name, rift, where, hall, study, breathed };
    });

    expect(tower).toEqual({
        name: "The Tower of Sar Mordal",
        rift: true,
        where: ["riftStalker study", "riftling hall", "riftling hall", "riftling outside", "riftling outside", "riftling outside", "riftling study"],
        hall: { map: "hall", lit: 1, open: false, things: ["book-open", "books", "scroll", "skull"] },
        study: { map: "study", open: true, lit: 1, journal: true, chest: true },
        breathed: ["riftFire"],
    });
});

test("Sinclair's journal on his lectern, at the top of the Tower of Sar Mordal: tapped from across his study, walked up to and read, kept in the player's journal; its pages turned on and back, by its buttons and the arrow keys; shut, and read again from the journal's Writings", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // Up in his study, those keeping the tower slain, across the room from his lectern
    const set = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { world, host } = game;
        const player = game.battle.actor("player");
        const site = world.plan.sites.find((one) => one.kind === "rift tower");
        const settle = async (steps) => {
            for (let k = 0; k < steps; k++) {
                game.advance(0.25, { render: false });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const until = async (done, steps = 80) => {
            for (let k = 0; k < steps && !done(); k++) {
                game.advance(0.1);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };
        const through = async (link, [x, y], done) => {
            Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, progress: null });
            game.host.command("player", { type: "enter", link });
            await until(done);
            await until(() => game.interiors.get(player.map)?.object.visible, 120);
        };

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6, x: site.at[0] + 0.5, y: site.at[1] + 70.5, path: [], order: null, progress: null });
        Object.assign(host.war, { turn: 70, clock: 30000 });
        await settle(10);

        for (const id of host.lairs.get(site.id).ids) {
            Object.assign(game.battle.actor(id), { dead: true, respawnAt: Infinity });
        }

        const building = world.interiors.buildings.get(`site:${site.id}`);

        await through(building.door.id, building.entrance.outside, () => player.map !== "town");
        await through(building.stairs.id, building.stairs.ends[0].squares[0], () => player.map.endsWith("/study"));

        return { map: player.map, lectern: world.maps[player.map].pieces.find(({ kind }) => kind === "side-table"), before: game.memory.writings ?? [] };
    });

    expect(set.map).toMatch(/\/study$/);
    expect(set.lectern).toMatchObject({ x: 4, y: 4, w: 1, h: 1 });
    expect(set.before).toEqual([]);

    // Tapped from across the room, looking at it: walked up to it, and read
    const at = await page.evaluate(({ x, y }) => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [ox, oz] = game.originOf(game.mapId);
        const message = game.hud.message.bind(game.hud);

        window.said = [];
        game.hud.message = (text, ...rest) => {
            window.said.push(text);

            return message(text, ...rest);
        };
        Object.assign(player, { square: [x, y + 4], x: x + 0.5, y: y + 4.5, path: [], facing: Math.PI });

        for (let k = 0; k < 8; k++) {
            game.advance(0.25);
        }

        Object.assign(game.cameraFollow, { yaw: 0, turning: 0, pitch: 35 });
        game.cameraFollow.heading = { x: 0, z: 0 };
        game.advance(0.05);
        game.start();

        return game.view.toScreen(game.view.camera.position.clone().set(ox + x + 0.5, 1.06, oz + y + 0.5));
    }, set.lectern);

    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => window.pellagos.game.reader.open, null, { timeout: 60000, polling: 100 });

    const page1 = await page.evaluate(() => {
        const { game } = window.pellagos;

        return {
            title: document.querySelector(".reader-title").textContent,
            heading: document.querySelector(".reader-heading").textContent,
            at: document.querySelector(".reader-at").textContent,
            back: document.querySelector(".reader-back").disabled,
            square: game.battle.actor("player").square,
            kept: game.memory.writings,
            said: window.said,
        };
    });

    expect(page1).toEqual({
        title: "The journal of Sinclair of Sar Mordal",
        heading: "The 3rd of Thawmonth, the Year of the Pale Comet",
        at: "1 of 10",
        back: true,
        square: [set.lectern.x, set.lectern.y + 1],
        kept: ["sinclair"],
        said: ["The journal of Sinclair of Sar Mordal: kept in your journal, under Writings."],
    });

    // On two pages with the arrow key, on another with its button, and back one
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.locator(".reader-on").click();
    await page.locator(".reader-back").click();

    expect(await page.evaluate(() => [document.querySelector(".reader-heading").textContent, document.querySelector(".reader-at").textContent])).toEqual(["The 2nd of Seedmonth", "3 of 10"]);

    // To the last page, in another hand, signed, no page on from it
    for (let k = 0; k < 7; k++) {
        await page.keyboard.press("ArrowRight");
    }

    expect(await page.evaluate(() => ({ hand: document.querySelector(".reader-hand")?.textContent, signed: document.querySelector(".reader-signed")?.textContent, at: document.querySelector(".reader-at").textContent, on: document.querySelector(".reader-on").disabled }))).toEqual({
        hand: "Another hand, in pencil.",
        signed: "A scout of the Adventurers' Guild",
        at: "10 of 10",
        on: true,
    });

    // Shut, and read again from the journal
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => window.pellagos.game.reader.open)).toBe(false);
    await page.keyboard.press("j");
    await expect(page.locator(".journal-writing-title")).toHaveText(["The journal of Sinclair of Sar Mordal"]);
    await page.locator(".journal-writing .journal-button").click();

    expect(await page.evaluate(() => ({ journal: window.pellagos.game.journal.open, reader: window.pellagos.game.reader.open, at: document.querySelector(".reader-at").textContent }))).toEqual({ journal: false, reader: true, at: "1 of 10" });
});

test("a dungeon's way in out in the wilds is gone into: its first level drawn and lit by its torches, its pictures kept compressed, nothing drawn past its fog, its foes woken, down its stairs to the next, and out again the same way", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const delved = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // (The nearest dungeon to the start with two levels or more, by its icon on the maps)
        const { buildDungeon } = await import("/js/core/dungeons/build.js");
        const site = game.world.plan.sites
            .filter(({ kind }) => kind === "dungeon")
            .sort((a, b) => Math.hypot(a.at[0] - player.x, a.at[1] - player.y) - Math.hypot(b.at[0] - player.x, b.at[1] - player.y))
            .find((one) => buildDungeon({ seed: one.seed, theme: one.theme, tier: 1 }).levels.length >= 2);
        const settle = async (steps) => {
            for (let k = 0; k < steps; k++) {
                game.advance(0.25, { render: false });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const until = async (done, steps = 120) => {
            for (let k = 0; k < steps && !done(); k++) {
                player.hp = player.maxHp;
                game.advance(0.1);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };
        const through = async (link) => {
            const end = link.ends.find(({ map }) => map === player.map);
            const from = player.map;

            Object.assign(player, { x: end.arrive[0] + 0.5, y: end.arrive[1] + 0.5, path: [], order: null, progress: null });
            game.host.command("player", { type: "enter", link: link.id });
            await until(() => player.map !== from, 300);
            await until(() => game.interiors.get(player.map)?.object.visible || player.map === "town", 300);
        };

        Object.assign(player, { x: site.at[0] + 25, y: site.at[1], path: [], order: null, progress: null });
        await settle(8);

        const icon = game.dungeonIcons().find(({ id }) => id === site.id);
        const building = game.world.interiors.buildings.get(`site:${site.id}`);
        const [ox, oy] = building.entrance.outside;

        Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null });
        await through(building.door);

        const first = { map: player.map, drawn: Boolean(game.interiors.get(player.map)?.object.visible), lit: session.view.room?.lights.length ?? 0, foes: game.host.dungeons.get(site.id).awake[0]?.length ?? 0, sees: session.view.camera.far, fog: session.view.scene.fog.far };

        // (Its rock's pictures and its things' come and read: KTX2, kept compressed, with their
        // mipmaps)
        const { rockPictures } = await import("/js/world/dungeons3d.js");
        const level = game.interiors.get(player.map).object;
        const meshes = () => {
            const found = [];

            level.traverse((node) => node.isMesh && found.push(node));

            return found;
        };
        const pictures = [...new Set(meshes().flatMap(({ material }) => (material.name?.startsWith("rock-") ? [material.name.slice("rock-".length)] : [])))].flatMap((name) => Object.values(rockPictures(name)).filter((each) => each?.isTexture));
        const props = () => meshes().flatMap(({ material }) => (material.name?.startsWith("prop-") && material.map ? [material.map] : []));
        const compressed = (texture) => Boolean(texture.isCompressedTexture) && texture.mipmaps.length > 1;

        await until(() => pictures.every(({ userData }) => userData.loaded?.value === 1) && props().length > 0, 300);
        Object.assign(first, { pictures: pictures.length, compressed: pictures.every((texture) => texture.userData.loaded.value === 1 && compressed(texture)), props: props().length, propsCompressed: props().every(compressed) });

        await through(building.flights[0]);

        const second = { map: player.map, drawn: Boolean(game.interiors.get(player.map)?.object.visible), woken: game.host.dungeons.get(site.id).awake[1]?.length ?? 0 };

        await through(building.flights[0]);
        await through(building.door);

        return { icon: Boolean(icon), maps: building.maps, first, second, out: player.map, by: Math.hypot(player.x - ox - 0.5, player.y - oy - 0.5) < 3, sees: session.view.camera.far };
    });

    expect(delved.icon).toBe(true);
    expect(delved.first).toMatchObject({ map: delved.maps[0], drawn: true });
    expect(delved.first.lit).toBeGreaterThan(1);
    expect(delved.first.foes).toBeGreaterThan(0);
    // (Inside, nothing drawn much further off than the fog's thickest; out again, as far as ever)
    expect(delved.first.sees).toBe(delved.first.fog + 4);
    // (Its rock's colour picture and normal map, and its things' pictures, kept compressed)
    expect(delved.first.pictures).toBeGreaterThanOrEqual(2);
    expect(delved.first.props).toBeGreaterThan(0);
    expect(delved.first).toMatchObject({ compressed: true, propsCompressed: true });
    expect(delved.second).toMatchObject({ map: delved.maps[1], drawn: true });
    expect(delved.second.woken).toBeGreaterThan(0);
    expect(delved).toMatchObject({ out: "town", by: true, sees: 160 });
});

test("a dungeon's camera goes by the room round the player: over its cut roof, looking down, in an open cavern; under its roof, low behind them, in a tunnel; tilted by hand, kept so while it's as open, let go of in the tunnel; turned to find the way through it; framing a fight from where there's room; and anyone its rock hides seen through it", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const seen = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { view } = session;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        // (The nearest dungeon of caves to the start: gone into)
        const { DUNGEON_CUT } = await import("/js/world/dungeons3d.js");
        const { openness } = await import("/js/world/view.js");
        const { squaresOf } = await import("/js/core/grid.js");
        const site = game.world.plan.sites.filter(({ kind, theme }) => kind === "dungeon" && theme === "caves").sort((a, b) => Math.hypot(a.at[0] - player.x, a.at[1] - player.y) - Math.hypot(b.at[0] - player.x, b.at[1] - player.y))[0];
        const until = async (done, steps = 300) => {
            for (let k = 0; k < steps && !done(); k++) {
                player.hp = player.maxHp;
                game.advance(0.1);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };

        // (Its land round it made first, its way in with it)
        Object.assign(player, { x: site.at[0] + 25, y: site.at[1], path: [], order: null, progress: null });

        for (let k = 0; k < 8; k++) {
            game.advance(0.25, { render: false });

            while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        const building = game.world.interiors.buildings.get(`site:${site.id}`);
        const [ox, oy] = building.entrance.outside;

        Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null });
        game.host.command("player", { type: "enter", link: building.door.id });
        await until(() => player.map !== "town");
        await until(() => game.interiors.get(player.map)?.object.visible);

        // (Its creatures put down: no fight to frame)
        for (const actor of game.battle.actors) {
            if (actor.map === player.map && actor.id !== "player") {
                Object.assign(actor, { dead: true, respawnAt: Infinity });
            }
        }

        // Its most open square and its tightest that can be stood on, away from its stairs
        const map = game.world.maps[player.map];
        const squares = squaresOf(map);
        const [mx, mz] = game.originOf(player.map);
        const rock = view.room.rock;
        let [open, tight] = [null, null];

        for (let y = 2; y < map.height - 2; y++) {
            for (let x = 2; x < map.width - 2; x++) {
                if (!squares.blocked(x, y) && [-1, 0, 1].every((d) => !squares.blocked(x + d, y) && !squares.blocked(x, y + d))) {
                    const how = openness(rock, mx + x + 0.5, mz + y + 0.5);

                    open = !open || how > open.how ? { x, y, how } : open;
                    tight = !tight || how < tight.how ? { x, y, how } : tight;
                }
            }
        }

        const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
        const rockCut = () => {
            const kinds = new Set();

            game.interiors.get(player.map).object.traverse((node) => node.isMesh && node.name === "rock" && kinds.add(Boolean(node.material.userData.rock?.cut)));

            return [...kinds];
        };
        const at = ({ x, y }, seconds) => {
            Object.assign(player, { x: x + 0.5, y: y + 0.5, square: [x, y], path: [], order: null });
            game.advance(seconds);

            const camera = view.camera.position;

            return { pitch: game.cameraFollow.pitch, over: view.room.overRoof, cut: DUNGEON_CUT.low.value < DUNGEON_CUT.top.value, rockCut: rockCut(), height: camera.y - view.focus.y, under: (view.room.roof(camera.x, camera.z) ?? view.room.ceiling) - camera.y };
        };

        const inOpen = at(open, 4);
        const inTight = at(tight, 4);

        // (Back in the open, tilted 15 degrees further down by hand: kept so there; then into the tunnel)
        at(open, 4);
        game.cameraFollow.grab();
        game.advance(0.1);
        game.cameraFollow.turn(0, 15);
        game.advance(0.1);
        game.cameraFollow.release();

        const nudged = at(open, 2);
        const base = inOpen.pitch;
        const tunnel = at(tight, 6);

        // Walking along the tunnel, the camera turned to look across it (crowded in by its rock):
        // turned to find the way through (Game options); or, turned off, left so
        const across = (finds) => {
            const ways = Array.from({ length: 36 }, (_, k) => (k * Math.PI) / 18);
            const room = (yaw) => view.roomAt(yaw);
            const crowded = ways.reduce((a, b) => (room(b) < room(a) ? b : a));
            const along = ways.reduce((a, b) => (room(b) > room(a) ? b : a));

            game.cameraSettings = { ...game.cameraSettings, openWay: finds, follows: false };
            Object.assign(player, { x: tight.x + 0.5, y: tight.y + 0.5, square: [tight.x, tight.y], path: [], order: null });
            game.cameraFollow.yaw = crowded;
            game.cameraFollow.waiting = 0;
            game.advance(0.2);

            // (Walking the way the camera would look from, back along the tunnel: away from it)
            const [tx, ty] = [Math.round(tight.x - Math.sin(along) * 4), Math.round(tight.y - Math.cos(along) * 4)];

            game.battle.command("player", { type: "move", to: [tx, ty] });

            const before = room(game.cameraFollow.yaw);

            game.advance(2.5);

            return { before, after: room(game.cameraFollow.yaw), turned: Math.abs(wrap(game.cameraFollow.yaw - crowded)) };
        };

        // In a fight in the tunnel, a foe a few steps along it: the battle cam frames it from where
        // the rock leaves the camera room, not crowded in against it
        const fight = () => {
            const foe = game.battle.actors.find((actor) => actor.map === player.map && actor.id !== "player" && actor.dead && actor.maxHp);
            const ways = Array.from({ length: 36 }, (_, k) => (k * Math.PI) / 18);

            // (Settled in the tunnel first: the camera as its space has it)
            Object.assign(player, { x: tight.x + 0.5, y: tight.y + 0.5, square: [tight.x, tight.y], path: [], order: null });
            game.advance(5);

            const along = ways.reduce((a, b) => (view.roomAt(b) > view.roomAt(a) ? b : a));
            const [fx, fy] = [3, 2, 4].map((d) => [Math.round(tight.x - Math.sin(along) * d), Math.round(tight.y - Math.cos(along) * d)]).find(([x, y]) => !squares.blocked(x, y));

            Object.assign(foe, { dead: false, hp: foe.maxHp, respawnAt: undefined, x: fx + 0.5, y: fy + 0.5, square: [fx, fy], path: [], order: null, attack: null, target: "player", stunnedUntil: game.battle.time + 60000 });
            game.cameraSettings = { ...game.cameraSettings, battle: true, openWay: true };
            game.avatars.get(foe.id)?.place(fx + 0.5, fy + 0.5, 0);
            game.previous.set(foe.id, { x: foe.x, y: foe.y });
            // (The camera behind the player, looking along the tunnel at it: both in view)
            game.cameraFollow.yaw = along;
            game.cameraFollow.waiting = 0;
            game.advance(4);

            return { room: view.roomAt(game.cameraFollow.yaw), framing: game.battleCamOn === foe.id };
        };

        // Seen through the rock where it hides them: a point in the rock past the open cavern's
        // edge hidden from the camera over it, the player in the open not; hidden, drawn again as a
        // silhouette (after the world, before them), and not once they're seen
        const silhouette = () => {
            at(open, 3);

            const me = game.avatars.get("player");
            const [px, pz] = [mx + open.x + 0.5, mz + open.y + 0.5];
            // (Away from the camera, past the cavern's edge, a metre and a half into the rock)
            const [ax, az] = [-Math.sin(view.yaw), -Math.cos(view.yaw)];
            let r = 1;

            while (r < 20 && !rock(px + ax * r, pz + az * r)) {
                r += 0.25;
            }

            const behind = { x: px + ax * (r + 1.5), y: view.focus.y + 1, z: pz + az * (r + 1.5) };

            const rockHides = view.rockHides.bind(view);
            const result = { behind: view.rockHides(behind), me: view.rockHides(me.point(0.55)) };

            view.rockHides = () => true;
            game.advance(0.2);

            const copies = me.object.userData.silhouette?.copies ?? [];

            Object.assign(result, { copies: copies.length, shown: copies.filter(({ visible }) => visible).length, order: [...new Set(copies.map(({ renderOrder }) => renderOrder))], over: [...new Set(copies.map(({ parent }) => parent.renderOrder))] });
            view.rockHides = rockHides;
            game.advance(0.2);
            result.after = copies.filter(({ visible }) => visible).length;

            return result;
        };

        return { open, tight, inOpen, inTight, nudged: nudged.pitch - base, tunnel: tunnel.pitch - inTight.pitch, finds: across(true), leaves: across(false), fight: fight(), silhouette: silhouette() };
    });

    expect(seen.open.how).toBeGreaterThan(0.75);
    expect(seen.tight.how).toBeLessThan(0.4);
    expect(seen.inOpen).toMatchObject({ over: true, cut: true, rockCut: [true] });
    expect(seen.inOpen.pitch).toBeGreaterThan(44);
    expect(seen.inOpen.height).toBeGreaterThan(6);
    expect(seen.inTight).toMatchObject({ over: false, cut: false, rockCut: [false] });
    expect(seen.inTight.pitch).toBeLessThan(32);
    expect(seen.inTight.under).toBeGreaterThan(0.5);
    expect(seen.nudged).toBeGreaterThan(10);
    expect(Math.abs(seen.tunnel)).toBeLessThan(3);
    expect(seen.finds.before).toBeLessThan(0.5);
    expect(seen.finds.after).toBeGreaterThanOrEqual(0.8);
    expect(seen.finds.turned).toBeGreaterThan(0.1);
    expect(seen.leaves.turned).toBeLessThan(0.05);
    expect(seen.fight.framing).toBe(true);
    expect(seen.fight.room).toBeGreaterThanOrEqual(0.6);
    expect(seen.silhouette).toMatchObject({ behind: true, me: false, order: [1], over: [2], after: 0 });
    expect(seen.silhouette.copies).toBeGreaterThan(0);
    expect(seen.silhouette.shown).toBeGreaterThan(0);
});

test("a dungeon whose creatures are drawn from models: theirs fetched, not read, as the player nears its way in; waited for at its door, the world stopped, a card saying how far they've got, Not now staying out and Go in now offered after a while; gone in once they're read; let go of a little after the player's left", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(300000);
    await playing(page, "/?play&seed=1");

    // (Two dungeons not far from the start made dens of creatures drawn from models, by a theme of
    // the test's own: werewolves and their Moonfang in the nearer, the Dreadthorn in the other; no
    // lair's models asked for meanwhile; each part the downloader asks for held up a little, as a
    // phone's link would, so the wait's seen)
    const dens = await page.evaluate(async () => {
        const { game, fetcher } = window.pellagos;
        const { THEMES } = await import("/js/core/dungeons/themes.js");
        const player = game.battle.actor("player");
        const fetch = fetcher.fetch;

        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });
        game.modelLairs = [];

        // (The werewolves' asked for already, as the player came near: so at their door nothing of
        // theirs is downloaded, however long the way there takes; and every other kind's but the
        // Dreadthorn's, so nothing of any other place's is downloaded meanwhile, the ants' nests
        // these two are before they're made dens among them)
        const { MODELS } = await import("/js/beasts/model.js");

        game.approached = new Set(Object.keys(MODELS).filter((kind) => kind !== "dreadthorn"));
        window.fetchedBefore = fetch;
        fetcher.fetch = async (...args) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            return fetch(...args);
        };
        THEMES.wolfDen = { ...THEMES.caves, id: "wolfDen", packs: [{ id: "wolves", creatures: ["werewolf"], size: [1, 2], weight: 1 }], minis: [{ id: "wolf", creature: "werewolf", title: "Old werewolf", weight: 1 }], bosses: [{ id: "moonfang", creature: "moonfang", title: "the Moonfang", weight: 1 }] };
        THEMES.dragonDen = { ...THEMES.caves, id: "dragonDen", packs: [{ id: "dragon", creatures: ["dreadthorn"], size: [1, 1], weight: 1 }], minis: [{ id: "dragon", creature: "dreadthorn", title: "Young Dreadthorn", weight: 1 }], bosses: [{ id: "dragon", creature: "dreadthorn", title: "the Dreadthorn", weight: 1 }] };

        // (The nearest two not made yet: none within 200 metres of the start, where they're made as
        // it begins)
        const away = (site) => Math.hypot(site.at[0] - player.x, site.at[1] - player.y);
        const sites = game.world.plan.sites.filter((site) => site.kind === "dungeon" && away(site) > 200).sort((a, b) => away(a) - away(b));

        return { wolves: sites[0].id, dragon: sites[1].id };
    });

    // At the werewolves' door, nothing of theirs downloaded: tapped, the world stops and the card
    // shows, nothing ready yet
    const door = (id, theme, { there = false } = {}) =>
        page.evaluate(async ([id, theme, there]) => {
            const { game, session } = window.pellagos;
            const player = game.battle.actor("player");
            const site = game.world.plan.sites.find((one) => one.id === id);
            const settle = async (frames) => {
                for (let k = 0; k < frames; k++) {
                    game.advance(0.05);

                    while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                        await new Promise((resolve) => setTimeout(resolve, 0));
                    }
                }
            };

            // (The ground about it found, its way in with it, from far enough off that the dungeon
            // isn't made yet (core/host.js RELEVANCE: made as a building is got ready to go into),
            // made a den; then before its door, facing it, where it's made. Or there already)
            if (!there) {
                Object.assign(player, { x: site.at[0] + 120, y: site.at[1], path: [], order: null, progress: null });
                await settle(10);
            }

            const building = game.world.interiors.buildings.get(`site:${id}`);
            const [ox, oy] = building.entrance.outside;

            if (!building.dungeon) {
                building.theme = theme;
            }

            if (!there) {
                Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null, facing: building.entrance.facing });
                await settle(10);
                game.doors.sync();
            }

            const target = game.doors.targets.find((each) => each.map === "town" && each.link.id === building.door.id);
            const spot = session.view.toScreen(target.box.getCenter(target.box.min.clone()));

            game.tap(spot.x, spot.y);

            // (At once: the world stopped, Go in now not offered yet)
            return { name: building.name, key: building.key, theme: building.theme, running: game.running, go: !document.querySelector("#readyinggo").hidden };
        }, [id, theme, there]);
    const card = page.locator("#readying");
    const wolves = await door(dens.wolves, "wolfDen");

    expect(wolves).toMatchObject({ theme: "wolfDen", running: false, go: false });
    await expect(card).toBeVisible();
    await expect(page.locator("#readyingname")).toHaveText(wolves.name);
    await expect(page.locator("#readyinglist li")).toHaveCount(2);
    expect((await page.locator("#readyinglist li span:first-child").allTextContents()).sort()).toEqual(["Moonfang", "Werewolf"]);
    await expect(page.locator("#readyinglist li.done")).toHaveCount(0);

    // Not now: stays out, playing on
    await page.locator("#readyingback").click();
    await expect(card).toBeHidden();
    expect(await page.evaluate(() => ({ running: window.pellagos.game.running, map: window.pellagos.game.battle.actor("player").map }))).toEqual({ running: true, map: "town" });

    // Tapped again: waited for again, Go in now offered after a while, the bar part way; then in,
    // of itself, once they're read
    await door(dens.wolves, "wolfDen", { there: true });
    await expect(card).toBeVisible();
    await expect(page.locator("#readyinggo")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#readyingamount")).toHaveText(/^\d+\.\d of \d+\.\d MB$/);
    await expect(card).toBeHidden({ timeout: 90000 });
    await expect.poll(() => page.evaluate(() => window.pellagos.game.battle.actor("player").map), { timeout: 30000 }).not.toBe("town");

    const inside = await page.evaluate(async (key) => {
        const { game } = window.pellagos;
        const { modelOf } = await import("/js/beasts/model.js");

        return { running: game.running, building: game.world.interiors.of(game.battle.actor("player").map)?.key, werewolf: Boolean(modelOf("werewolf")), moonfang: Boolean(modelOf("moonfang")), key };
    }, wolves.key);

    expect(inside).toEqual({ running: true, building: wolves.key, werewolf: true, moonfang: true, key: wolves.key });

    // Out again, and away (its foes asleep once no one's near its way in: core/dungeons/play.js
    // DELVES): their models kept a little while (AREA_LINGER), then let go of off the graphics card
    const left = await page.evaluate(async (key) => {
        const { game } = window.pellagos;
        const { AREA_LINGER, MODEL_LINGER, forgetModels, keptModels, modelOf } = await import("/js/beasts/model.js");
        const player = game.battle.actor("player");
        const building = game.world.interiors.buildings.get(key);

        game.host.command("player", { type: "enter", link: building.door.id });

        for (let k = 0; k < 200 && player.map !== "town"; k++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        Object.assign(player, { x: player.x + 150, path: [], order: null, progress: null });

        for (let k = 0; k < 200 && keptModels().unheld < keptModels().models; k++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const now = performance.now();

        forgetModels(now + AREA_LINGER / 3, MODEL_LINGER, [], []);

        const kept = Boolean(modelOf("werewolf"));

        forgetModels(now + AREA_LINGER + 6000, MODEL_LINGER, [], []);

        return { out: player.map, kept, gone: !modelOf("werewolf") && !modelOf("moonfang") };
    }, wolves.key);

    expect(left).toEqual({ out: "town", kept: true, gone: true });

    // Near the Dreadthorn's way in (not at its door): its model downloaded, in the background (not
    // hurried: no one's waiting for it), to be kept; not read
    const near = await page.evaluate(async (id) => {
        const { game, fetcher } = window.pellagos;
        const { ASSETS } = await import("/js/app/assets.js");
        const { modelOf } = await import("/js/beasts/model.js");
        const player = game.battle.actor("player");
        const site = game.world.plan.sites.find((one) => one.id === id);
        const file = ASSETS.models["beast-dreadthorn"].files[0];

        fetcher.fetch = window.fetchedBefore;

        // (Near enough for its creatures' models to be fetched (game.js APPROACH), not so near
        // it's made (core/host.js RELEVANCE))
        Object.assign(player, { x: site.at[0] + 130, y: site.at[1], path: [], order: null, progress: null });

        // (Its building, once the ground about it's found, a den of the Dreadthorn's)
        for (let k = 0; k < 100 && !game.world.interiors.buildings.get(`site:${id}`); k++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        game.world.interiors.buildings.get(`site:${id}`).theme = "dragonDen";

        for (let k = 0; k < 300 && !fetcher.received(file); k++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        return { fetching: fetcher.received(file) > 0, hurried: fetcher.status.hurried, read: Boolean(modelOf("dreadthorn")), made: Boolean(game.world.interiors.buildings.get(`site:${id}`)?.dungeon) };
    }, dens.dragon);

    expect(near).toEqual({ fetching: true, hurried: 0, read: false, made: false });
});

test("an ants' nest: its creatures' models got ready at its door, the card naming them; gone in, its ants drawn from their model, lent the Ant Monster's fall; its fallen lying about it, one searched; lit by the fungus on its walls and the light the player carries, in its own close dusty air, spores drifting, soil trickling; heard in its own still earth, its colony murmuring round about, something chittering far off, the soil heard where it falls; its midden heaped with the gear of those the ants killed, dug earth heaped where other dungeons have fallen rock, roots through its roof, a web about each widow", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(300000);
    await playing(page, "/?play&seed=1");

    // (The nearest ants' nest not made yet: none within 200 metres of the start; the ground about
    // it found from far enough off that it isn't made yet, then before its door, facing it, where
    // it's made; its door tapped)
    const nest = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const settle = async (frames) => {
            for (let k = 0; k < frames; k++) {
                game.advance(0.05);

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };

        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        const away = (site) => Math.hypot(site.at[0] - player.x, site.at[1] - player.y);
        const site = game.world.plan.sites.filter((one) => one.kind === "dungeon" && one.theme === "nest" && away(one) > 200).sort((a, b) => away(a) - away(b))[0];

        Object.assign(player, { x: site.at[0] + 120, y: site.at[1], path: [], order: null, progress: null });
        await settle(10);

        const building = game.world.interiors.buildings.get(`site:${site.id}`);
        const [ox, oy] = building.entrance.outside;

        Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null, facing: building.entrance.facing });
        await settle(10);
        game.doors.sync();

        const target = game.doors.targets.find((each) => each.map === "town" && each.link.id === building.door.id);
        const spot = session.view.toScreen(target.box.getCenter(target.box.min.clone()));

        game.tap(spot.x, spot.y);

        return { name: building.name, key: building.key, theme: building.theme, running: game.running };
    });
    const card = page.locator("#readying");

    // (Waited for at its door: its name, and the creatures in it drawn from models, the ants and
    // their Ant Monster among them)
    expect(nest).toMatchObject({ theme: "nest", running: false });
    await expect(card).toBeVisible();
    await expect(page.locator("#readyingname")).toHaveText(nest.name);

    const named = await page.locator("#readyinglist li span:first-child").allTextContents();

    expect(named).toContain("Giant ant");
    expect(named).toContain("Ant Monster");
    expect(named.every((name) => ["Giant ant", "Great centipede", "Dungeon spider", "Elite dungeon spider", "Giant cockroach", "Dungeon wasp", "Dungeon scorpion", "Black widow", "Ant Monster"].includes(name))).toBe(true);

    // (In, of itself, once they're read; its first level's ants drawn from their model, the ant's
    // model lent the Ant Monster's fall and flinch)
    await expect(card).toBeHidden({ timeout: 120000 });
    await expect.poll(() => page.evaluate(() => window.pellagos.game.battle.actor("player").map), { timeout: 30000 }).not.toBe("town");

    const inside = await page.evaluate(async (key) => {
        const { game } = window.pellagos;
        const { modelOf } = await import("/js/beasts/model.js");
        const player = game.battle.actor("player");
        const ants = () => [...game.host.wild].filter(([id, one]) => one.creature === "ant" && game.battle.actor(id)?.map === player.map).map(([id]) => game.avatars.get(id)).filter(Boolean);

        for (let k = 0; k < 200 && !ants().length; k++) {
            player.hp = player.maxHp;
            game.advance(0.05);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        // (Its fallen lying about the level, each searched once: gone to beside one, it's drawn
        // there, a coin over it; searched, what was left on it put at the player's feet, and said)
        const fallen = [...game.host.ground.values()].filter(({ remains, map }) => remains && map === player.map);
        const one = fallen[0];

        Object.assign(player, { x: one.square[0] + 0.5, y: one.square[1] + 1.5, path: [], order: null, progress: null });

        for (let k = 0; k < 10; k++) {
            player.hp = player.maxHp;
            game.advance(0.05);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const lying = Boolean(game.drops.drawn.get(one.id));

        game.host.command(game.me, { type: "pickUp", ground: one.id });

        for (let k = 0; k < 10; k++) {
            player.hp = player.maxHp;
            game.advance(0.05);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const share = [...game.host.ground.values()].find((dropped) => dropped.from === "remains" && dropped.for === game.me);
        const searched = { lying, gone: !game.host.ground.has(one.id), gold: share?.bundle.gold ?? 0, drawn: Boolean(share && game.drops.drawn.get(share.id)), said: game.messages.some(({ text }) => text.startsWith("You search the remains")) };

        return { building: game.world.interiors.of(player.map)?.key, running: game.running, ants: ants().length, drawn: ants().every((avatar) => avatar.model), lent: modelOf("ant").animations.map(({ name }) => name).filter((name) => ["Death", "Hit React"].includes(name)).sort(), key, fallen: fallen.length, searched };
    }, nest.key);

    expect(inside).toMatchObject({ building: nest.key, running: true, drawn: true, lent: ["Death", "Hit React"] });
    expect(inside.ants).toBeGreaterThan(0);
    expect(inside.fallen).toBeGreaterThan(2);
    expect(inside.searched).toMatchObject({ lying: true, gone: true, drawn: true, said: true });
    expect(inside.searched.gold).toBeGreaterThan(0);

    // (Lit by the colonies of glowing fungus on its walls, each grown on the rock and its light, a
    // torch only at its mouth; the earth round each glowing; the light the player carries the last
    // lamp, over them; its own air, close, warm and dusty, nothing drawn past it; spores drifting in
    // it; soil trickling from the roof now and then, its grains falling from under it)
    const lit = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { MIST } = await import("/js/world/fog.js");
        const player = game.battle.actor("player");
        const interior = game.interiors.get(player.map);
        const step = async (frames) => {
            for (let k = 0; k < frames; k++) {
                player.hp = player.maxHp;
                game.advance(0.05);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };
        const level = interior.map.dungeon;
        const meshes = [];

        interior.object.traverse((node) => node.isMesh && meshes.push(node));
        await step(40);

        const { view } = session;
        const [, carried] = view.lamps.map(({ light }) => light);
        const at = game.avatars.get(game.me).object.position;
        const fungus = meshes.find(({ name }) => name === "fungus");

        // (A trickle let start now, and a frame or two of its grains; what's played meanwhile. Where
        // it starts is picked at random near the player, under enough roof, a few tries a frame:
        // so it's let try afresh each frame till one has)
        const before = game.effects.dust.live.length;
        const asked = [];
        const play = game.sound.play.bind(game.sound);

        game.sound.play = (name, options = {}) => (asked.push({ name, at: options.at ? { x: options.at.x, z: options.at.z } : null, far: options.far }), play(name, options));

        for (let k = 0; k < 40 && !game.trickles.running; k++) {
            game.trickles.wait = 0;
            await step(1);
        }

        await step(2);
        game.sound.play = play;

        const fell = asked.find(({ name }) => name === "soilTrickle");
        const sound = session.sound;

        return {
            glows: level.lights.filter(({ kind }) => kind === "glow").length,
            torches: level.lights.filter(({ kind }) => kind === "torch").length,
            lights: interior.lights.filter(({ kind }) => kind === "glow").length,
            fungus: fungus ? { triangles: fungus.geometry.index.count / 3, glowing: fungus.material.type === "MeshBasicMaterial" && fungus.geometry.attributes.color.count > 0 } : null,
            threads: meshes.filter(({ name }) => name === "rock").every(({ geometry }) => geometry.attributes.glow?.itemSize === 3),
            carried: { above: carried.position.y - at.y, over: Math.hypot(carried.position.x - at.x, carried.position.z - at.z), intensity: carried.intensity, shadows: carried.castShadow },
            air: { near: view.scene.fog.near, far: view.scene.fog.far, colour: view.scene.fog.color.getHex(), sees: view.camera.far, dust: [MIST.value.x, MIST.value.w] },
            motes: { kind: game.motes.kind, shown: game.motes.object.visible },
            trickle: { running: Boolean(game.trickles.running), grains: game.effects.dust.live.length - before, under: game.trickles.running ? interior.roof(game.trickles.running.x, game.trickles.running.z) - game.trickles.running.top : null },
            heard: {
                place: sound.place,
                beds: [...sound.beds].filter(([, { gain }]) => gain > 0).map(([name]) => name).sort(),
                calls: Object.keys(sound.calls),
                murmur: sound.murmur,
                fell: fell ? { far: fell.far, where: game.trickles.running ? Math.hypot(fell.at.x - game.trickles.running.x, fell.at.z - game.trickles.running.z) : null } : null,
            },
        };
    });

    expect(lit.glows).toBeGreaterThan(5);
    expect(lit.torches).toBeLessThanOrEqual(1);
    expect(lit.lights).toBe(lit.glows);
    expect(lit.fungus).toMatchObject({ glowing: true });
    expect(lit.fungus.triangles).toBeGreaterThan(lit.glows * 100);
    expect(lit.threads).toBe(true);
    expect(lit.carried).toMatchObject({ intensity: 3.2, shadows: false });
    expect(lit.carried.above).toBeCloseTo(2.4, 1);
    expect(lit.carried.over).toBeLessThan(0.01);
    expect(lit.air).toEqual({ near: 9, far: 30, colour: 0x1b120c, sees: 34, dust: [0.09, 1] });
    expect(lit.motes).toEqual({ kind: "spores", shown: true });
    expect(lit.trickle.running).toBe(true);
    expect(lit.trickle.grains).toBeGreaterThan(0);
    expect(lit.trickle.under).toBeCloseTo(0.05, 2);
    expect(lit.heard).toMatchObject({ place: "nest", beds: ["caveDrips", "cryptLoop"], calls: ["spiderCall"], murmur: "colonyRustle", fell: { far: 16, where: 0 } });

    // (Its story: the heap of what it's thrown out in its midden, the gear of those the ants
    // killed on it; heaps of the earth they've dug where other dungeons have fallen rock, no
    // boulders; roots through its roof, clear of anyone's head; a web about each widow hanging under
    // its roof, the prey it's hung by the walls; all of it a few meshes)
    const story = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const interior = game.interiors.get(player.map);
        const { map } = interior;
        const named = {};

        interior.object.traverse((node) => {
            if (["eggs", "larvae", "pupae", "midden", "spoil", "roots", "rootlets", "webs", "cocoons"].includes(node.name)) {
                named[node.name] = (named[node.name] ?? 0) + 1;
            }
        });

        const widows = [...game.host.wild].filter(([id, one]) => one.creature === "blackWidow" && game.battle.actor(id)?.map === player.map).map(([id]) => game.battle.actor(id));
        const roots = interior.object.getObjectByName("roots");
        let lowest = Infinity;

        if (roots) {
            const { array } = roots.geometry.attributes.position;

            for (let k = 1; k < array.length; k += 3) {
                lowest = Math.min(lowest, array[k]);
            }
        }

        return {
            named,
            middens: map.pieces.filter(({ kind }) => kind === "midden").length,
            rubble: map.pieces.filter(({ kind }) => kind === "rubble").length,
            gear: interior.props.filter(({ model }) => ["shield-kite", "shield-heater", "barbuta", "great-helm", "hauberk"].includes(model)).length,
            boulders: interior.props.filter(({ model }) => model.startsWith("boulder")).length,
            lowest,
            lurks: map.dungeon.lurks.length,
            widows: widows.length,
            webbed: widows.every((widow) => map.dungeon.lurks.some(([x, y]) => Math.hypot(x + 0.5 - widow.x, y + 0.5 - widow.y) < 1.5)),
        };
    });

    expect(story.middens).toBeGreaterThan(0);
    expect(story.named).toMatchObject({ midden: 1, roots: 1, rootlets: 1 });
    expect(story.gear).toBeGreaterThan(0);
    expect(story.named.spoil ?? 0).toBe(story.rubble > 0 ? 1 : 0);
    expect(story.boulders).toBe(0);
    expect(story.lowest).toBeGreaterThan(2.0);
    expect(story.lurks).toBe(story.widows);
    expect(story.webbed).toBe(true);
    expect(story.named.webs ?? 0).toBe(story.lurks > 0 ? 1 : 0);
    expect(Object.values(story.named).every((count) => count === 1)).toBe(true);
});

test("a hell: its way in a cult's camp out in the wilds, shut by day, and by night till the cult keeping its rite there is slain; each of its four levels its realm's, drawn in its realm's own air and heard as it; its ways down portals of fire, each sealed till its level's master falls; and from beyond its throne a portal out to the wilds, sealed till its lord falls", async ({ page }) => {
    test.setTimeout(480000);
    await playing(page, "/?play&seed=1");

    const hell = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        Object.assign(player, { hp: 1e6, maxHp: 1e6 });

        const settle = async (steps) => {
            for (let k = 0; k < steps; k++) {
                game.advance(0.25, { render: false });

                while (game.chunks.update(player.x, player.y, { budget: 200 }) || game.chunks.busy) {
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }
            }
        };
        const until = async (done, steps = 120) => {
            for (let k = 0; k < steps && !done(); k++) {
                player.hp = player.maxHp;
                game.advance(0.1);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        };
        const through = async (link) => {
            const end = link.ends.find(({ map }) => map === player.map);
            const from = player.map;

            Object.assign(player, { x: end.arrive[0] + 0.5, y: end.arrive[1] + 0.5, path: [], order: null, progress: null });

            const told = game.host.command("player", { type: "enter", link: link.id });

            if (!told.ok) {
                return told.reason;
            }

            await until(() => player.map !== from, 300);
            await until(() => game.interiors.get(player.map)?.object.visible || player.map === "town", 300);

            return null;
        };
        // (Slain where it stands, as anyone would slay it)
        const slay = async (champion) => {
            const [id] = [...game.host.wild].find(([each, one]) => one.champion === champion && game.battle.actor(each)?.map === player.map) ?? [];

            if (id) {
                game.battle.afflict(id, "poison", { by: "player", damage: 1e7 });
                await until(() => game.battle.actor(id)?.dead ?? true, 100);
            }

            return Boolean(id);
        };
        // (What's drawn on the level the player's on: whether a hell's veil's among it, and the air;
        // and what's heard there: its place, the beds sounding, and how fast its drone's played)
        const seen = () => {
            const level = game.interiors.get(player.map).object;
            const { sound } = session;
            let veils = 0;

            level.traverse((node) => {
                if (node.isMesh && node.material?.userData?.veil === "hell") {
                    veils += 1;
                }
            });

            return {
                map: player.map,
                look: game.world.maps[player.map].look,
                veils,
                background: session.view.scene.background?.getHex() ?? null,
                heard: { place: sound.place, beds: [...sound.beds].filter(([, { gain }]) => gain > 0).map(([name]) => name).sort(), drone: sound.beds.get("hellDrone")?.rate ?? null },
            };
        };

        // (The war's clock set to a time of day, a day or more on: the morning, or a little past
        // sunset)
        const at = (when) => {
            game.host.war.turn = Math.ceil(game.host.war.turn / 60) * 60 + (when === "night" ? 34 : 60);
            game.host.war.clock = 0;
        };

        // (The nearest hell's way in to the start, by day: worldplan/settle.js HELLS)
        const site = game.world.plan.sites.filter(({ theme }) => theme === "hell").sort((a, b) => Math.hypot(a.at[0] - player.x, a.at[1] - player.y) - Math.hypot(b.at[0] - player.x, b.at[1] - player.y))[0];

        at("day");
        Object.assign(player, { x: site.at[0] + 120, y: site.at[1], path: [], order: null, progress: null });
        await settle(8);

        const building = game.world.interiors.buildings.get(`site:${site.id}`);
        const made = building.made;
        const [ox, oy] = building.entrance.outside;

        Object.assign(player, { x: ox + 0.5, y: oy + 0.5, path: [], order: null, progress: null });
        await settle(4);

        // (Shut by day, no one there; by night the cult at its rite, and shut till it's slain to
        // the last, then in)
        const camp = { day: await through(building.door), cultByDay: game.host.lairs.has(site.id) };

        at("night");
        await settle(6);

        const cult = game.host.lairs.get(site.id)?.ids ?? [];

        camp.cult = cult.map((id) => game.host.wild.get(id)?.creature);
        camp.night = await through(building.door);

        for (const id of cult) {
            game.battle.afflict(id, "poison", { by: "player", damage: 1e7 });
        }

        await until(() => cult.every((id) => game.battle.actor(id)?.dead ?? true), 200);
        camp.slain = await through(building.door);

        const levels = [];
        const downs = building.flights.filter(({ id }) => id.endsWith("/stairs"));
        const out = building.flights.find(({ id }) => id.endsWith("/exit"));

        for (let k = 0; k < 4; k++) {
            const level = { ...seen(), sealed: k < 3 ? await through(downs[k]) : await through(out) };

            level.slain = await slay(k < 3 ? "floor" : "boss");
            await until(() => false, 10);
            level.after = k < 3 ? await through(downs[k]) : await through(out);
            levels.push(level);
        }

        return { made, camp, maps: building.maps, levels, out: player.map, by: Math.hypot(player.x - ox - 0.5, player.y - oy - 0.5) < 3 };
    });

    // (Not made till the player came near, then four levels deep)
    expect(hell.made).toBe(false);
    expect(hell.maps).toHaveLength(4);

    // (Shut by day, the cult not there; by night its high priest and its faithful at their rite,
    // the way shut till they're slain, then in)
    expect(hell.camp).toMatchObject({ day: "riteDay", cultByDay: false, night: "rite", slain: null });
    expect(hell.camp.cult[0]).toBe("cultLeader");
    expect(hell.camp.cult.slice(1).every((kind) => kind === "cultist")).toBe(true);

    // (Each its realm's, a portal of fire on it, in its own air; sealed till its master's slain,
    // then through)
    hell.levels.forEach((level, k) => {
        expect(level.map).toBe(hell.maps[k]);
        expect(level.look).toBe(["hell-breach", "hell-bone", "hell-fire", "hell-pit"][k]);
        expect(level.veils).toBeGreaterThan(0);
        expect(level.background).toBe([0x140806, 0x120606, 0x1e0804, 0x0a0404][k]);
        expect(level.sealed).toBe(k < 3 ? "sealed" : "throne");
        expect(level.slain).toBe(true);
        expect(level.after).toBe(null);

        // (Heard as its realm: its drone, lower than the realm's above; the Halls' heart)
        expect(level.heard.place).toBe(["hellBreach", "hellBone", "hellFire", "hellPit"][k]);
        expect(level.heard.beds).toContain("hellDrone");
        expect(level.heard.beds.includes("heartbeat")).toBe(k === 1);
        expect(level.heard.drone).toBeLessThan(k ? hell.levels[k - 1].heard.drone : 1.01);
    });

    // (Out beyond the throne to before its way in)
    expect(hell).toMatchObject({ out: "town", by: true });
});

test("on the world map a pin's dropped where it's held: a column of light where it stands and a line the way there, taken away held again; tapped twice, the player runs there, or is told there's no way", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // (The ground round the player found, a few chunks each way; the map opened on them)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor("player");

        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        for (let dx = -128; dx <= 128; dx += 32) {
            for (let dy = -128; dy <= 128; dy += 32) {
                game.explored.visit(me.x + dx, me.y + dy);
            }
        }
    });
    await page.keyboard.press("m");
    await expect(page.locator("#worldmap")).toBeVisible();
    await page.waitForFunction(() => window.pellagos.worldMap?.drawn, null, { polling: 100 });

    // Where on the screen a point of the world is, the map as it's shown
    const onScreen = ([x, z]) =>
        page.evaluate(([x, z]) => {
            const { worldMap } = window.pellagos;
            const rect = worldMap.canvas.getBoundingClientRect();

            return { x: rect.left + rect.width / 2 + (x - worldMap.view.x) / worldMap.view.scale, y: rect.top + rect.height / 2 + (z - worldMap.view.z) / worldMap.view.scale };
        }, [x, z]);
    const hold = async ({ x, y }) => {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.waitForTimeout(900);
        await page.mouse.up();
    };
    const near = await page.evaluate(() => {
        const me = window.pellagos.game.battle.actor("player");

        return [me.x + 90, me.y - 60];
    });

    // Held still: a pin dropped there, the way there drawn on the map, and handed on to be kept
    await page.evaluate(() => {
        const { game } = window.pellagos;

        window.keptPins = [];
        game.onPin = (pin) => window.keptPins.push(pin);
    });

    // (But not where the fog still lies: told so, and nothing dropped, held there or set so)
    const fogged = await page.evaluate(() => {
        const me = window.pellagos.game.battle.actor("player");

        return [me.x + 420, me.y - 300];
    });

    await hold(await onScreen(fogged));
    await expect(page.locator("#worldmapnote")).toContainText("You haven't been there");
    expect(await page.evaluate((at) => ({ pin: window.pellagos.game.setPin(at).pin, kept: window.keptPins.length, drawn: window.pellagos.worldMap.drawn.pin }), fogged)).toEqual({ pin: null, kept: 0, drawn: false });

    await hold(await onScreen(near));
    await page.waitForFunction(() => window.pellagos.worldMap.drawn?.pin, null, { polling: 100 });

    const dropped = await page.evaluate(() => {
        const { game, worldMap } = window.pellagos;

        return { pin: game.pin, kept: window.keptPins, way: worldMap.drawn.way, distance: worldMap.drawn.distance, unpin: !document.querySelector("#worldmapunpin").hidden, note: document.querySelector("#worldmapnote").textContent };
    });

    expect(dropped.pin.map(Math.round)).toEqual(near.map(Math.round));
    // (How far, along the way, beside the pin: some 108 metres as the crow flies, a little more along it)
    expect(dropped.distance).toMatch(/^\d+ m$/);
    expect(Number.parseInt(dropped.distance, 10)).toBeGreaterThanOrEqual(100);
    expect(dropped.kept).toEqual([dropped.pin]);
    expect(dropped.way).toBeGreaterThan(1);
    expect(dropped.unpin).toBe(true);
    expect(dropped.note).toContain("Pinned");

    // Closed: out in the world, its column where it stands, and a line along the ground to it, over
    // the navigation mesh (once its tiles are in): every point of it somewhere that can be walked
    await page.keyboard.press("Escape");
    await expect(page.locator("#worldmap")).not.toBeVisible();
    await page.evaluate(() => window.pellagos.game.stop());
    await page.waitForFunction(
        () => {
            const { game } = window.pellagos;

            game.advance(0.25);

            return game.pinMarks.line.visible && !game.pinShort;
        },
        null,
        { polling: 250, timeout: 60000 },
    );

    const world = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const THREE = await import("three");
        const { navigatorOf } = await import("/js/core/navigation.js");
        const navigation = navigatorOf(game.world.maps.town);
        const marks = game.pinMarks;
        const ground = game.groundOf("town");
        const position = marks.line.geometry.attributes.position;
        const points = [];
        const grounds = [];
        const ray = new THREE.Raycaster();
        const over = [];

        session.view.scene.traverse((object) => object.isMesh && object.name === "ground" && grounds.push(object));

        // (Two corners a point, across the line; six indices a piece of it between two points; and
        // how high it is over the ground as it's drawn there, its corners further apart away from
        // the player)
        for (let k = 0; k <= marks.line.geometry.drawRange.count / 6; k++) {
            const [x, y, z] = [(position.getX(k * 2) + position.getX(k * 2 + 1)) / 2, (position.getY(k * 2) + position.getY(k * 2 + 1)) / 2, (position.getZ(k * 2) + position.getZ(k * 2 + 1)) / 2];

            points.push([x, z]);
            ray.set(new THREE.Vector3(x, y + 50, z), new THREE.Vector3(0, -1, 0));

            const hit = ray.intersectObjects(grounds, false)[0];

            if (hit) {
                over.push(y - hit.point.y);
            }
        }

        return {
            column: marks.near.visible && marks.far.visible,
            foot: [marks.foot.value.x, marks.foot.value.z],
            ground: Math.abs(marks.foot.value.y - ground(game.pin[0], game.pin[1])) < 0.01,
            line: marks.line.visible,
            long: marks.lineLength.value,
            points: points.length,
            astray: points.filter(([x, z]) => !navigation.nearestIn([x, z], 0.3)).map((point) => point.map(Math.round)),
            over: { points: over.length, least: Math.min(...over), most: Math.max(...over) },
            spacing: [...new Set(grounds.map((mesh) => mesh.userData.step))].sort(),
        };
    });

    expect(world.column).toBe(true);
    expect(world.foot.map(Math.round)).toEqual(near.map(Math.round));
    expect(world.ground).toBe(true);
    expect(world.line).toBe(true);
    expect(world.long).toBeGreaterThan(80);
    expect(world.points).toBeGreaterThan(40);
    expect(world.astray).toEqual([]);
    // (On the ground as it's drawn, all along it: 0.14 m over it, never under, wherever its
    // corners are drawn further apart)
    expect(world.over.points).toBeGreaterThan(40);
    expect(world.over.least).toBeGreaterThan(0.139);
    expect(world.over.most).toBeLessThan(0.141);
    expect(world.spacing.length, `chunks drawn ${world.spacing.join(", ")} m apart`).toBeGreaterThan(1);

    // Held on the pin, it's taken away, its column and line with it
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("m");
    await expect(page.locator("#worldmap")).toBeVisible();
    await page.waitForFunction(() => window.pellagos.worldMap.drawn?.pin, null, { polling: 100 });

    const head = await onScreen(near);

    await hold({ x: head.x, y: head.y - 14 });
    await page.waitForFunction(() => !window.pellagos.worldMap.drawn?.pin, null, { polling: 100 });
    expect(await page.evaluate(() => ({ pin: window.pellagos.game.pin, kept: window.keptPins.at(-1), unpin: document.querySelector("#worldmapunpin").hidden }))).toEqual({ pin: null, kept: null, unpin: true });

    // Tapped twice out at sea, where there's no way: told so, and nothing done
    const sea = await page.evaluate(() => {
        const { worldMap } = window.pellagos;

        worldMap.view.x = 400;
        worldMap.view.z = 400;
        worldMap.draw();

        return [120, 120];
    });

    await doubleTap(page, await onScreen(sea));
    await expect(page.locator("#worldmapnote")).toHaveText("A path cannot be found");
    await expect(page.locator("#worldmap")).toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.journey)).toBeNull();

    // Tapped twice near them: the map closes and they set off running there, a leg at a time
    await page.locator("#worldmaphere").click();
    await page.waitForTimeout(200);
    await doubleTap(page, await onScreen(near));
    await expect(page.locator("#worldmap")).not.toBeVisible();

    const ran = await page.evaluate(([x, z]) => {
        const { game } = window.pellagos;
        const me = game.battle.actor("player");
        const before = Math.hypot(x - me.x, z - me.y);

        game.stop();

        const set = { journey: Boolean(game.journey), order: null, run: false };

        for (let k = 0; k < 120 && game.journey; k++) {
            game.advance(0.5, { render: false });

            if (k === 1) {
                Object.assign(set, { order: me.order?.type ?? null, run: Boolean(me.order?.run) });
            }
        }

        return { ...set, before, after: Math.hypot(x - me.x, z - me.y), done: !game.journey };
    }, near);

    expect(ran.journey).toBe(true);
    expect(ran.order).toBe("move");
    expect(ran.run).toBe(true);
    expect(ran.before).toBeGreaterThan(80);
    expect(ran.after).toBeLessThan(6);
    expect(ran.done).toBe(true);
});

test("the minimap walks the player where it's tapped, and Game options turn it and the sound off, remembered; off, a compass in its corner turns as the camera does, and tapped, opens it again; its corner's button, its needle turned so too, folds it away into the compass", async ({ page }) => {
    // (The game started twice: more than the usual time)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const minimap = page.locator("#minimap");

    await expect(minimap).toBeVisible();

    // (Their own mark tapped: the camera, turned to look at them from in front, swung round
    // behind them, the way they face; they go nowhere)
    const box = await minimap.boundingBox();
    const mark = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [x0, z0, across] = game.minimap.shown();

        game.cameraFollow.yaw = player.facing;

        return { x: player.x, z: player.y, x0, z0, across };
    });

    await page.mouse.click(box.x + ((mark.x - mark.x0) / mark.across) * box.width, box.y + ((mark.z - mark.z0) / mark.across) * box.height);

    // (The game stepped on by hand to see it come round, as a phone's frames would turn it)
    const recentred = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(3);
        game.start();

        const off = game.cameraFollow.yaw - (game.battle.actor("player").facing + Math.PI);

        return { off: Math.abs(Math.atan2(Math.sin(off), Math.cos(off))), order: game.battle.actor("player").order?.type ?? null };
    });

    expect(recentred.off).toBeLessThan(0.05);
    expect(recentred.order).not.toBe("move");

    // Ten metres south of the player, on the map (which shows the world round them)
    const spot = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [x0, z0, across] = game.minimap.shown();

        return { x: player.x, z: player.y + 10, x0, z0, across };
    });

    await page.mouse.click(box.x + ((spot.x - spot.x0) / spot.across) * box.width, box.y + ((spot.z - spot.z0) / spot.across) * box.height);

    const walked = await page.evaluate(() => ({ order: window.pellagos.game.battle.actor("player").order, sound: window.pellagos.session.sound.playing }));

    expect(walked.order.type).toBe("move");
    expect(Math.abs(walked.order.to[0] + 0.5 - spot.x)).toBeLessThan(3);
    expect(Math.abs(walked.order.to[1] + 0.5 - spot.z)).toBeLessThan(3);
    expect(walked.sound).toBe(true);

    // Menu, Game options: the minimap (under Controls) and the sound (under Sound) both on; turn
    // them off
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Game options" }).click();
    await page.getByRole("button", { name: /^Controls/ }).click();

    const minimapSwitch = page.getByRole("switch", { name: /Minimap/ });
    const soundSwitch = page.getByRole("switch", { name: /Sound/ });

    await expect(minimapSwitch).toBeChecked();
    await page.locator("label:has(#minimapswitch)").click();
    await expect(minimapSwitch).not.toBeChecked();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: /^Sound/ }).click();
    await expect(soundSwitch).toBeChecked();

    // Each kind of sound has its slider: effects, environment and music (soft to start with)
    await expect(page.locator("#effectsvolume")).toHaveValue("50");
    await expect(page.locator("#environmentvolume")).toHaveValue("40");
    await expect(page.locator("#musicvolume")).toHaveValue("35");
    await page.locator("#musicvolume").fill("60");
    await page.locator("#musicvolume").dispatchEvent("change");
    await expect(page.locator("output[for=musicvolume]")).toHaveText("60%");
    expect(await page.evaluate(() => window.pellagos.session.sound.volumes.music)).toBe(0.6);

    await page.locator("label:has(#soundswitch)").click();
    await expect(soundSwitch).not.toBeChecked();
    await expect(page.locator("#musicvolume")).toBeDisabled();

    // (Back to Game options, the arrow in the heading as the Back at the foot; and back again)
    await page.getByRole("button", { name: "Back to Game options" }).click();
    await expect(page.getByRole("heading", { name: "Game options" })).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(minimap).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.session.sound.playing)).toBe(false);

    // Remembered next time
    await playing(page, "/?play&seed=1");
    await expect(minimap).toBeHidden();
    expect(await page.evaluate(() => ({ enabled: window.pellagos.session.sound.enabled, music: window.pellagos.session.sound.volumes.music }))).toEqual({ enabled: false, music: 0.6 });
    await expect(page.locator("#musicvolume")).toHaveValue("60");

    // Off, a compass in its corner, the party's column under it; turned as the camera turns (a
    // quarter turn of the camera, a quarter turn of the compass), its N north
    const compass = page.getByRole("button", { name: "Compass: open the map" });
    const fold = page.getByRole("button", { name: "Fold the map into a compass" });

    await expect(compass).toBeVisible();
    await expect(fold).toBeHidden();

    const corner = await compass.boundingBox();
    const column = await page.locator("#partybutton").boundingBox();

    expect(corner.x).toBeLessThan(20);
    expect(corner.y).toBeLessThan(20);
    expect(column.y).toBeGreaterThan(corner.y + corner.height);

    // (Turned a frame after the camera: waited for, a frame drawn in software being slow)
    // (How far it's turned from `degrees`, either way round)
    const turnedFrom = (degrees, turning = "#compassrose") => async () => {
        const turned = Number(((await page.locator(turning).getAttribute("transform")) ?? "rotate(NaN").match(/rotate\(([-\d.eN]+)/)[1]);
        const off = (((turned - degrees) % 360) + 360) % 360;

        return Math.min(off, 360 - off);
    };
    const look = (yaw) =>
        page.evaluate((yaw) => {
            window.pellagos.game.cameraFollow.yaw = yaw;
        }, yaw);

    // Looking north, N up; looking west, N on the right
    await look(0);
    await expect.poll(turnedFrom(0), { timeout: 30000 }).toBeLessThan(1);
    await look(Math.PI / 2);
    await expect.poll(turnedFrom(90), { timeout: 30000 }).toBeLessThan(1);

    // Tapped: the map's back, and kept; its corner's button folds it away again
    await compass.click();
    await expect(minimap).toBeVisible();
    await expect(compass).toBeHidden();
    await expect(fold).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")).minimap)).toBe(true);

    // That button's a compass too: its needle turned as the camera turns, its red end north (looking
    // west, on the right; north, up; south-east, down and to the left)
    await expect.poll(turnedFrom(90, "#minimapneedle"), { timeout: 30000 }).toBeLessThan(1);
    await look(0);
    await expect.poll(turnedFrom(0, "#minimapneedle"), { timeout: 30000 }).toBeLessThan(1);
    await look((-3 * Math.PI) / 4);
    await expect.poll(turnedFrom(225, "#minimapneedle"), { timeout: 30000 }).toBeLessThan(1);
    await fold.click();
    await expect(minimap).toBeHidden();
    await expect(compass).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")).minimap)).toBe(false);
});

test("full screen while playing: asked for as Continue starts the game; left by the player, the game paused, and Resume asks again; turned off in Game options, left at once and not asked again; on, asked on the next tap playing; back at the title, left", async ({ page }) => {
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);
    await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ sound: false, quality: "low" })));
    await title(page);

    const full = () => page.evaluate(() => Boolean(document.fullscreenElement));
    // (Full screen granted and staying so: headless Chromium now and then grants it and takes it
    // back in the same frame, and the next tap on the game asks again)
    const settled = async () => {
        await expect.poll(full).toBe(true);
        await page.waitForTimeout(400);
        await expect.poll(full).toBe(true);
    };
    const fullScreen = page.getByRole("switch", { name: /Full screen while playing/ });

    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    expect(await full()).toBe(true);

    // Left by the player (Escape, the browser's own button, Android's back): paused
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator("#menu")).toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(false);
    await page.getByRole("button", { name: "Resume" }).click();
    await expect.poll(full).toBe(true);
    await expect(page.locator("#menu")).toBeHidden();

    // Turned off (Game options, Graphics): left at once, the menu still up, kept; playing on, not
    // asked for
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Game options" }).click();
    await page.getByRole("button", { name: /^Graphics/ }).click();
    await expect(fullScreen).toBeChecked();
    await page.locator("label:has(#fullscreenswitch)").click();
    await expect(fullScreen).not.toBeChecked();
    await expect.poll(full).toBe(false);
    await expect(page.locator("#menu")).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")).fullscreen)).toBe(false);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    await page.mouse.click(640, 330);
    expect(await full()).toBe(false);

    // On again: not asked for from the menu, but as play carries on
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Game options" }).click();
    await page.getByRole("button", { name: /^Graphics/ }).click();
    await page.locator("label:has(#fullscreenswitch)").click();
    await expect(fullScreen).toBeChecked();
    expect(await full()).toBe(false);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    await settled();

    // Playing without it (as after Resume by Escape, which browsers don't take as asking: here,
    // turned off and on again, left by the game, so nothing's paused): a tap that opens a window
    // (the menu button's) doesn't ask, the page gone full screen after it covering it; a tap on the
    // world does
    const without = () =>
        page.evaluate(() => {
            const { fullScreen } = window.pellagos;

            fullScreen.wanted = false;
            fullScreen.wanted = true;
        });

    await without();
    await expect.poll(full).toBe(false);
    await expect(page.locator("#menu")).toBeHidden();
    await page.locator("#menubutton").click();
    await expect(page.locator("#menu")).toBeVisible();
    await page.waitForTimeout(300);
    expect(await full()).toBe(false);
    await page.getByRole("button", { name: "Resume" }).click();
    await settled();
    await without();
    await expect.poll(full).toBe(false);
    await page.mouse.click(640, 330);
    await settled();

    // A window opened as full screen's granted is opened again over it, still open
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator("#menu")).toBeVisible();
    await page.evaluate(() => window.pellagos.fullScreen.play());
    await expect.poll(full).toBe(true);
    await expect(page.locator("#menu")).toBeVisible();
    expect(await page.evaluate(() => document.querySelector("#menu").contains(document.activeElement))).toBe(true);
    await page.getByRole("button", { name: "Resume" }).click();

    // Back at the title: left, and the title not paused into
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Back to the title" }).click();
    await expect(page.locator("#title")).toBeVisible();
    await expect.poll(full).toBe(false);
    await expect(page.locator("#menu")).toBeHidden();
});

test("Game options: its groups at the top, each a page of its own, short enough not to scroll; back from each by the arrow in its heading, the Back at its foot, or Escape, to the group it came from", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await playing(page, "/?play&seed=1");
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Game options" }).click();

    // The groups first, then the Debug log, then Back: nothing else on the page
    const options = page.locator("#menuoptions");

    await expect(options.locator(".options > button .text")).toHaveText([/^Action Wheel and Bar/, /^Graphics/, /^Sound/, /^Controls/, /^Camera/, /^Gameplay/, /^Chat and players/, /^Debug log/]);
    await expect(options.locator("input")).toHaveCount(0);

    const groups = {
        actions: ["#wheelsbutton", "#quickbutton"],
        graphics: ["#qualityslider", "#adaptiveswitch", "#fullscreenswitch", "#shakeswitch", "#pointerswitch", "#largepointerswitch"],
        sound: ["#soundswitch", "#effectsvolume", "#environmentvolume", "#musicvolume"],
        controls: ["#stickswitch", "#floatswitch", "#zoomswitch", "#minimapswitch"],
        camera: ["#followswitch", "#battlecamswitch", "#dragslider", "#invertswitch"],
        gameplay: ["#snagswitch", "#snagbutton", "#lockswitch", "#resistswitch"],
        chat: ["#chatfeedswitch", "#partydmswitch", "#worlddmswitch", "#refuseswitch", "#blockedbutton"],
    };
    const back = { arrow: (group) => page.locator(`#menu${group} .menu-back`), button: (group) => page.locator(`#${group}back`) };

    for (const [group, controls] of Object.entries(groups)) {
        for (const [how, by] of Object.entries(back)) {
            await page.locator(`#${group}button`).click();
            await expect(page.locator(`#menu${group}`)).toBeVisible();
            await expect(options).toBeHidden();

            // (Each control in its group's page, and in no other)
            for (const control of controls) {
                expect(await page.locator(control).evaluate((element, id) => element.closest(".menupage").id === id, `menu${group}`), `${control} under ${group}`).toBe(true);
            }

            // (The whole page in view on a phone: the dialog not scrolled)
            expect(await page.locator("#menu").evaluate((menu) => menu.scrollHeight <= menu.clientHeight + 1), `${group} fits`).toBe(true);

            await by(group).click();
            await expect(options, `back from ${group} by its ${how}`).toBeVisible();
            await expect(page.locator(`#${group}button`)).toBeFocused();
        }
    }

    // Escape, as Back
    await page.locator("#camerabutton").click();
    await page.keyboard.press("Escape");
    await expect(options).toBeVisible();
    await expect(page.locator("#camerabutton")).toBeFocused();

    // Back from Game options: the main page, and the game from there
    await page.getByRole("button", { name: "Back to Paused" }).click();
    await expect(page.locator("#menumain")).toBeVisible();
    await expect(page.locator("#optionsbutton")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#menu")).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(true);

    // Escape again and again, deep in: back a page at a time while the browser lets it, then the
    // menu closed as Resume closes it (the browser closing it itself after a few), the game going
    // on, never left stopped with no menu up
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#actionsbutton").click();
    await page.locator("#wheelsbutton").click();
    await expect(page.locator("#menuwheels")).toBeVisible();

    for (let k = 0; k < 6 && (await page.locator("#menu").isVisible()); k++) {
        await page.keyboard.press("Escape");
    }

    await expect(page.locator("#menu")).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(true);
});

test("Game options set the camera: following off at first, it keeps the way it's turned as the player walks; the battle cam and finding the way through on at first; a drag turns and tilts it as far as chosen, each its own, its tilt inverted; the greatest spells don't shake it; remembered", async ({ page }) => {
    // (The game started twice: more than the usual time)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    // At first (Game options, Camera): not following, the battle cam on, a drag turning it as far
    // as ever; and (Graphics) shaking
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Game options" }).click();
    await page.getByRole("button", { name: /^Camera/ }).click();

    const follows = page.getByRole("switch", { name: /Camera follows/ });
    const battleCam = page.getByRole("switch", { name: /Battle cam/ });
    const openWay = page.getByRole("switch", { name: /Find the way through/ });
    const invert = page.getByRole("switch", { name: /Invert tilt/ });
    const shake = page.getByRole("switch", { name: /Screen shake/ });

    await expect(follows).not.toBeChecked();
    await expect(battleCam).toBeChecked();
    await expect(openWay).toBeChecked();
    await expect(invert).not.toBeChecked();
    await expect(page.locator("#dragslider")).toHaveValue("100");
    await expect(page.locator("#dragname")).toHaveText("100%");
    await expect(page.locator("#tiltslider")).toHaveValue("100");
    await expect(page.locator("#tiltname")).toHaveText("100%");

    // The battle cam and finding the way through off, tilt inverted, a drag turning it twice as
    // far and tilting it half as far; and no shaking
    await page.locator("label:has(#battlecamswitch)").click();
    await page.locator("label:has(#openwayswitch)").click();
    await page.locator("label:has(#invertswitch)").click();
    await page.locator("#dragslider").fill("200");
    await page.locator("#dragslider").dispatchEvent("change");
    await expect(page.locator("#dragname")).toHaveText("200%");
    await page.locator("#tiltslider").fill("50");
    await page.locator("#tiltslider").dispatchEvent("change");
    await expect(page.locator("#tiltname")).toHaveText("50%");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: /^Graphics/ }).click();
    await expect(shake).toBeChecked();
    await page.locator("label:has(#shakeswitch)").click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Resume" }).click();

    // Walking east, the camera keeps the way it's turned; and the greatest spells' shake is let be
    const walked = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const before = { yaw: game.cameraFollow.yaw, pitch: game.cameraFollow.pitch };
        const [x, y] = player.square;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.command("player", { type: "move", to: [x + 8, y] });
        game.advance(5);
        game.spellFx.onShake(1);

        return { settings: game.cameraSettings, before, after: { yaw: game.cameraFollow.yaw, pitch: game.cameraFollow.pitch }, moved: player.square[0] - x, shaking: game.shaking };
    });

    expect(walked.settings).toEqual({ follows: false, battle: false, openWay: false, shake: false, drag: 2, tilt: 0.5, invert: true });
    expect(walked.moved).toBeGreaterThan(0);
    expect(walked.after).toEqual(walked.before);
    expect(walked.shaking).toBe(0);

    // Dragged 150 pixels right and 60 down: turned twice as far as it used to be, and tilted up
    // (down, inverted) half as far
    await page.evaluate(() => window.pellagos.game.start());

    const box = await page.locator("#view").boundingBox();
    const before = await page.evaluate(() => ({ yaw: window.pellagos.game.cameraFollow.yaw, pitch: window.pellagos.game.cameraFollow.pitch }));
    const [x, y] = [box.x + box.width * 0.7, box.y + box.height * 0.35];

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 150, y + 60, { steps: 6 });
    await page.mouse.up();

    const after = await page.evaluate(() => ({ yaw: window.pellagos.game.cameraFollow.yaw, pitch: window.pellagos.game.cameraFollow.pitch }));
    const turned = Math.atan2(Math.sin(after.yaw - before.yaw), Math.cos(after.yaw - before.yaw));

    expect(turned).toBeCloseTo((-150 / box.width) * Math.PI * 2, 2);
    expect(after.pitch - before.pitch).toBeCloseTo((-60 / box.height) * 60 * 0.5, 1);

    // Following turned on; all remembered next time
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Game options" }).click();
    await page.getByRole("button", { name: /^Camera/ }).click();
    await page.locator("label:has(#followswitch)").click();
    await expect(follows).toBeChecked();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    await playing(page, "/?play&seed=1");
    expect(await page.evaluate(() => window.pellagos.game.cameraSettings)).toEqual({ follows: true, battle: false, openWay: false, shake: false, drag: 2, tilt: 0.5, invert: true });
    await expect(page.locator("#dragslider")).toHaveValue("200");
    await expect(page.locator("#tiltslider")).toHaveValue("50");
});

test("holding on an enemy or the player opens the action wheel: flick left (W) to stun it, or up (N) to heal", async ({ page }) => {
    // (Held three times, with the world played on between: more than the usual time, with others
    // running beside it)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const wheel = page.locator(".action-wheel");
    const up = wheel.locator('.slice[data-direction="n"]');
    const left = wheel.locator('.slice[data-direction="w"]');

    // The orc standing a few squares from the player, who's hurt (to the right and a little ahead,
    // clear of the minimap along the top), held low on its body, well off its middle
    const orcAt = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const square = [player.square[0] + 3, player.square[1] - 1];

        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        player.hp = 20;
        game.advance(0.1);

        return session.view.toScreen(game.avatars.get("orc").point(0.25));
    });
    // (Held: the wheel's middle right under where the finger went down, which it's flicked from)
    const hold = async ({ x, y }) => {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await expect(wheel).toBeVisible();

        const at = await wheel.evaluate((element) => element.getBoundingClientRect());

        expect(Math.hypot(at.x + at.width / 2 - x, at.y + at.height / 2 - y)).toBeLessThan(1);
    };
    const flickUp = async ({ x, y }) => {
        await page.mouse.move(x, y - 25, { steps: 2 });
        await page.mouse.move(x, y - 60, { steps: 2 });
    };
    const flickLeft = async ({ x, y }) => {
        await page.mouse.move(x - 25, y, { steps: 2 });
        await page.mouse.move(x - 60, y, { steps: 2 });
    };
    // Play on without drawing, then carry on
    const playOn = (seconds) => page.evaluate((seconds) => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(seconds);
        game.start();
    }, seconds);

    // Held on the orc: its wheel's eight slices, Attack at the top (N), the four elements' first
    // spells round it, Stun at W, S to turn it over, and the rest empty
    await hold(orcAt);
    await expect(up.locator(".label")).toHaveText("Attack");
    await expect(left.locator(".label")).toHaveText("Stun");
    await expect(wheel.locator('.slice[data-direction="se"] .label')).toHaveText("Burn");
    await expect(wheel.locator(".slice")).toHaveCount(8);
    await expect(wheel.locator('.slice.flip[data-direction="s"] .label')).toHaveText("Wheel 2");
    await expect(wheel.locator(".slice.empty")).toHaveCount(1);
    await flickLeft(orcAt);
    await page.mouse.up();
    await playOn(0.6);

    const stunned = await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        return { stunned: battle.actor("orc").stunnedUntil > battle.time, cooldown: battle.cooldown("player", "stun") };
    });

    expect(stunned.stunned).toBe(true);
    expect(stunned.cooldown).toBeGreaterThan(0.5);

    // Held on the player while spells cool down: Vigor greyed over, and a flick at it refused. (The
    // game plays on in real time meanwhile, so the cooldown's started again, not to run out first.)
    const meAt = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;

        battle.actor("player").spellReadyAt = battle.time + 3000;

        return session.view.toScreen(game.avatars.get("player").point(0.5));
    });

    await hold(meAt);
    await expect(up.locator(".label")).toHaveText("Vigor");
    await expect(up).toHaveClass(/cooling/);
    expect(await up.locator(".cooldown").getAttribute("d")).not.toBe("");
    await flickUp(meAt);
    await expect(up).toHaveClass(/refused/);
    await page.mouse.up();
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").casting)).toBeNull();

    // Once it's over, the flick heals, by 8 to 12
    await playOn(3);
    await hold(meAt);
    await expect(up).not.toHaveClass(/cooling/);
    await flickUp(meAt);
    await page.mouse.up();
    await playOn(1);

    const hp = await page.evaluate(() => window.pellagos.game.battle.actor("player").hp);

    expect(hp).toBeGreaterThanOrEqual(28);
    expect(hp).toBeLessThanOrEqual(32);
});

test("in a fight the Action Bar's four actions rise from the bottom, lifting the name and zoom buttons: Stun tapped on the foe set on, Vigor on the player, swept over while cooling; attacks greyed with no foe set on; held, changed in the Action Bar options; the minimap in the top left corner, the buttons top right, its wedge the way the camera looks the same size however it's zoomed", async ({ page }) => {
    // (Played on between taps, and held once: more than the usual time, with others running beside it)
    test.setTimeout(180000);
    await page.setViewportSize({ width: 402, height: 874 });
    await playing(page, "/?play&seed=1");

    // (The zoom buttons are off until Game options asks for them, and it's their rising that's
    // being watched here)
    await page.evaluate(() => {
        const switched = document.querySelector("#zoomswitch");

        switched.checked = true;
        switched.dispatchEvent(new Event("change"));
    });

    const bar = page.locator(".quickbar");
    const slot = (n) => bar.locator(`.quick-slot[data-slot="${n}"]`);
    const box = (selector) => page.locator(selector).boundingBox();
    const play = (seconds) => page.evaluate((seconds) => window.pellagos.game.advance(seconds), seconds);

    // The minimap in the top left corner, level with the four buttons in the top right, any room
    // between them
    const [map, book, menu] = await Promise.all([box("#minimap"), box("#spellbookbutton"), box("#menubutton")]);

    expect(Math.abs(map.y - book.y)).toBeLessThan(1);
    expect(Math.abs(map.x - 12)).toBeLessThan(1);
    expect(map.x + map.width).toBeLessThan(book.x);
    expect(Math.abs(menu.x + menu.width - 390)).toBeLessThan(1);

    // On it, a wedge from the player the way the camera looks over the ground, the same size
    // however far the camera's zoomed out
    const looked = () => page.evaluate(() => {
        const { game, session } = window.pellagos;
        const e = session.view.camera.matrixWorld.elements;

        game.stop();
        game.minimap.drawn = -Infinity;
        game.advance(0.05);

        return { ...game.minimap.looked, camera: Math.atan2(-e[8], -e[10]) };
    });
    const near = await looked();

    await page.evaluate(() => window.pellagos.session.view.zoom(2));

    const far = await looked();
    const apart = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

    expect(near.reach).toBeGreaterThan(20);
    expect(far.reach).toBe(near.reach);
    expect(apart(near.look, near.camera)).toBeLessThan(0.01);
    expect(apart(far.look, far.camera)).toBeLessThan(0.01);

    // No fight: put away, the player's name at the foot of the screen
    await expect(bar).not.toHaveClass(/up/);

    const calm = await box("#playerplate");

    // The orc brought near the hurt player, and set on: up, the name and zoom buttons over it
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const square = [player.square[0] + 3, player.square[1] - 2];

        game.stop();
        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        player.hp = 20;
        battle.command("player", { type: "engage", target: "orc" });
        game.advance(0.1);
    });
    await expect(bar).toHaveClass(/up/);
    await expect(slot(0).locator(".quick-label")).toHaveText("Vigor");
    await expect(slot(1).locator(".quick-label")).toHaveText("Stun");
    await expect(slot(2).locator(".quick-label")).toHaveText("Burn");
    await expect(slot(3).locator(".quick-label")).toHaveText("Draught");
    await expect(slot(0)).toHaveClass(/own/);
    await expect(slot(1)).toHaveClass(/foe/);
    // (Burn's tome not read; no draughts carried)
    await expect(slot(2)).toHaveClass(/off/);
    await expect(slot(3)).toHaveClass(/off/);
    await expect(slot(3).locator(".quick-count")).toHaveText("0");
    await expect(slot(1)).not.toHaveClass(/off/);
    await expect.poll(async () => (await box("#playerplate")).y + (await box("#playerplate")).height).toBeLessThanOrEqual((await box(".quickbar")).y);
    expect((await box("#playerplate")).y).toBeLessThan(calm.y);
    await expect.poll(async () => (await box("#zoomout")).y + (await box("#zoomout")).height).toBeLessThanOrEqual((await box(".quickbar")).y);

    // Stun tapped: cast on the orc
    await slot(1).click();
    await play(0.6);

    const stunned = await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        return { stunned: battle.actor("orc").stunnedUntil > battle.time, cooldown: battle.cooldown("player", "stun") };
    });

    expect(stunned.stunned).toBe(true);
    expect(stunned.cooldown).toBeGreaterThan(0.3);

    // Cooling down, Vigor too (the spells' shared cooldown): swept over, and refused when tapped
    await expect(slot(1)).toHaveClass(/cooling/);
    await expect(slot(0)).toHaveClass(/cooling/);

    const left = Number(await slot(0).evaluate((element) => element.style.getPropertyValue("--left")));

    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(1);
    await slot(0).click();
    await expect(slot(0)).toHaveClass(/refused/);
    await expect(page.locator("#banner")).toHaveText("Not ready yet");
    await play(0.1);
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").casting)).toBeNull();

    // Once it's over, Vigor tapped heals the player, by 8 to 12 (the orc kept stunned meanwhile)
    const before = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;

        battle.actor("orc").stunnedUntil = battle.time + 60000;
        game.advance(3);

        return battle.actor("player").hp;
    });

    await expect(slot(0)).not.toHaveClass(/cooling/);
    await slot(0).click();
    await play(1);

    const healed = (await page.evaluate(() => window.pellagos.game.battle.actor("player").hp)) - before;

    expect(healed).toBeGreaterThanOrEqual(8);
    expect(healed).toBeLessThanOrEqual(12);

    // No foe set on, but the orc coming for the player: still up, Stun greyed and refused
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");

        player.order = null;
        player.attack = null;
        battle.actor("orc").target = "player";
        battle.actor("orc").stunnedUntil = 0;
        game.advance(0.1);
    });
    await expect(bar).toHaveClass(/up/);
    await expect(slot(1)).toHaveClass(/off/);
    await expect(slot(0)).not.toHaveClass(/off/);
    await slot(1).click();
    await expect(page.locator("#banner")).toHaveText("Tap a foe first: that's used on them");

    // The fight over: up a moment more, then put away, the name back at the foot of the screen
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const orc = game.battle.actor("orc");

        Object.assign(orc, { target: null, attack: null, dead: true, respawnAt: Infinity });
        game.advance(1);
    });
    await expect(bar).toHaveClass(/up/);
    await play(2.5);
    await expect(bar).not.toHaveClass(/up/);
    await expect.poll(async () => (await box("#playerplate")).y).toBeCloseTo(calm.y, 0);

    // Held in a fight: paused at the Action Bar options, that slot chosen; Rumble (its tome read) put in
    // it, and back to the game
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const orc = game.battle.actor("orc");

        game.progress.learn("rumble");
        Object.assign(orc, { dead: false, hp: orc.maxHp, target: "player" });
        game.advance(0.1);
        game.start();
    });
    await expect(bar).toHaveClass(/up/);

    // (A draught, with none carried: refused, the 4 key tapping the fourth)
    await page.keyboard.press("4");
    await expect(page.locator("#banner")).toHaveText("You've none left");

    const third = await slot(2).boundingBox();

    await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2);
    await page.mouse.down();
    await expect(page.locator("#menuquick")).toBeVisible();
    await page.mouse.up();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(false);
    await expect(page.locator("#quicksetup .wheels-heading")).toHaveText("Action Bar slot 3");
    await expect(page.locator('#quicksetup .quick-slot[data-slot="2"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('#quicksetup .wheels-choice[data-action="rumble"] small')).toHaveText("On your foe");
    await expect(page.locator('#quicksetup .wheels-choice[data-action="vigor"] small')).toHaveText("On yourself");
    await page.locator('#quicksetup .wheels-choice[data-action="rumble"]').click();
    expect(await page.evaluate(() => window.pellagos.game.wheels.quick)).toEqual(["vigor", "stun", "rumble", "item:potion", null, null]);
    await expect(page.locator('#quicksetup .quick-slot[data-slot="2"] .quick-label')).toHaveText("Rumble");
    await page.locator("#quickback").click();
    await expect(page.locator("#menu")).not.toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(true);
    await expect(slot(2).locator(".quick-label")).toHaveText("Rumble");

    // And from Game options (Action Wheel and Bar), Back going back there
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#actionsbutton").click();
    await page.locator("#quickbutton").click();
    await expect(page.locator("#quicksetup .wheels-heading")).toHaveText("Action Bar slot 1");
    await page.locator("#quickback").click();
    await expect(page.locator("#menuactions")).toBeVisible();
});

test("a Prismatic chain: an element's spell cast from the Action Bar rolls its slot on to the next, ringed and pulsing, every attack spell 5% stronger a spell; at the last, its piece of the sigil, flaring, the other elements ringed, the sigil pulsing in its colour till the next element's begun; let lapse, all lost, the sigil shown broken; a piece just earned, the sigil tapped casts its element's Prismatic spell on the foe; whole, left to fade, shown fading; whole, Prismatic Destruction; none of it told in a message", async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 402, height: 874 });
    await playing(page, "/?play&seed=1");

    const bar = page.locator(".quickbar");
    const slot = (n) => bar.locator(`.quick-slot[data-slot="${n}"]`);
    const sigil = page.locator(".sigil");
    const petal = (element) => sigil.locator(`.sigil-petal[data-element="${element}"]`);
    const play = (seconds) => page.evaluate((seconds) => window.pellagos.game.advance(seconds), seconds);
    const prism = () => page.evaluate(() => window.pellagos.game.battle.actor("player").prism);
    // (What a slot shows, its own name: not the one rolling out of it)
    const label = (n) => slot(n).locator(":scope > .quick-label");
    // (Everything the player's been told in a message)
    const told = () => page.evaluate(() => window.pellagos.game.messages.map(({ text }) => text).join("\n"));
    // (Played on till just after the chain's let lapse: its next spell's time up, or the whole
    // sigil's to be cast, core/prismatic.js CHAIN.window and CHAIN.ready)
    const lapse = () =>
        page.evaluate(() => {
            const { game } = window.pellagos;
            const { battle } = game;
            const { at, pieces, readyAt } = battle.actor("player").prism;
            const left = pieces.length === 4 ? 15000 - (battle.time - readyAt) : 10000 - (battle.time - at);

            game.advance(Math.max(0, left) / 1000 + 0.15);
        });

    // Fire's spells and Rumble learnt, Burn and Rumble on the Action Bar; a hardy orc brought
    // near, and set on (stunned, so it doesn't stagger the player as they cast)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const square = [player.square[0] + 3, player.square[1] - 2];

        game.stop();

        for (const spell of ["burn", "fireball", "burstflame", "immolate", "flamefill", "inferno", "hellfire", "rumble"]) {
            game.progress.learn(spell);
        }

        game.setQuick(["vigor", "stun", "burn", "rumble", null, null]);
        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null, hp: 5000, maxHp: 5000, stunnedUntil: battle.time + 120000 });
        Object.assign(player, { hp: 5000, maxHp: 5000 });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        battle.command("player", { type: "engage", target: "orc" });
        game.advance(0.1);
    });
    await expect(bar).toHaveClass(/up/);
    await expect(label(2)).toHaveText("Burn");
    await expect(slot(2)).not.toHaveClass(/chain/);
    await expect(sigil).toBeHidden();

    // Burn tapped and landed: the chain begun, its slot rolled on to Fireball, ringed in fire's
    // colour; the sigil up, fire's petal climbing; Rumble's slot as it was
    await slot(2).click();
    await play(1.6);
    expect(await prism()).toMatchObject({ element: "fire", step: 1, pieces: [] });
    await expect(label(2)).toHaveText("Fireball");
    await expect(slot(2)).toHaveClass(/chain/);
    await expect(slot(2)).toHaveAttribute("data-chain", "fire");
    await expect(slot(3)).not.toHaveClass(/chain/);
    await expect(sigil).toBeVisible();
    await expect(petal("fire")).toHaveClass(/climbing/);
    await expect(sigil.locator(".sigil-bonus")).toHaveText("+0%");
    expect(await page.evaluate(() => window.pellagos.game.wheels.quick[2])).toBe("burn");

    // Fireball, from the same slot: 5% stronger, Burstflame next
    await slot(2).click();
    await play(1.8);
    expect(await prism()).toMatchObject({ element: "fire", step: 2 });
    await expect(label(2)).toHaveText("Burstflame");
    await expect(sigil.locator(".sigil-bonus")).toHaveText("+5%");

    // (Cast up to Inferno) Hellfire, the last: fire's piece, 25%, the sigil flaring in fire's
    // colour, not told; Burn back in its slot, unringed, and Rumble's ringed in earth's colour, the
    // next chain's to begin; the sigil pulsing in fire's colour, Prismatic Fire to be cast with it
    await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        battle.actor("player").prism = { element: "fire", step: 6, at: battle.time, pieces: [], readyAt: null };
        window.pellagos.game.advance(0.05);
    });
    await expect(label(2)).toHaveText("Hellfire");
    await slot(2).click();
    await play(2.4);
    expect(await prism()).toMatchObject({ element: null, pieces: ["fire"] });
    await expect(sigil).toHaveClass(/flare/);
    expect(await sigil.evaluate((element) => element.style.getPropertyValue("--flare"))).toBe("#ff7a2e");
    expect(await told()).not.toContain("piece of the Prismatic sigil");
    await expect(petal("fire")).toHaveClass(/held/);
    await expect(sigil.locator(".sigil-bonus")).toHaveText("+25%");
    await expect(label(2)).toHaveText("Burn");
    await expect(slot(2)).not.toHaveClass(/chain/);
    await expect(label(3)).toHaveText("Rumble");
    await expect(slot(3)).toHaveAttribute("data-chain", "earth");
    await expect(sigil).toHaveClass(/offered/);
    await expect(petal("fire")).toHaveClass(/offered/);
    await expect(sigil).toHaveAttribute("aria-label", /fire's piece just earned: cast Prismatic Fire on your foe/);

    // Rumble cast: earth's chain begun, fire's piece no longer to be spent on its own; tapped, the
    // sigil has nothing to cast
    await slot(3).click();
    await play(1.6);
    expect(await prism()).toMatchObject({ element: "earth", step: 1, pieces: ["fire"], piece: null });
    await expect(sigil).not.toHaveClass(/offered/);
    await sigil.click();
    await expect(page.locator("#banner")).toHaveText("Nothing in the Prismatic sigil to cast: an element's spells cast in order, first to last, earn its piece");

    // Nothing more cast for ten seconds: broken, everything lost; the sigil shown breaking, saying
    // so, not told in a message, and gone within a second
    await lapse();
    expect(await prism()).toBeNull();
    await expect(sigil).toBeVisible();
    await expect(sigil).toHaveClass(/broken/);
    await expect(sigil).toHaveAttribute("aria-label", "The Prismatic chain is broken: its strength is lost.");
    expect(await told()).not.toContain("chain is broken");
    await expect(slot(3)).not.toHaveClass(/chain/);
    await play(1);
    await expect(sigil).toBeHidden();
    await expect(sigil).not.toHaveClass(/broken/);

    // Water's piece just earned: tapped, the sigil casts Prismatic Water on the orc, a quarter of
    // its whole health gone, frozen and slowed; the sigil spent
    await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        Object.assign(battle.actor("orc"), { hp: 5000, afflictions: [] });
        battle.actor("player").prism = { element: null, step: 0, at: battle.time, pieces: ["water"], piece: "water", readyAt: null };
        window.pellagos.game.advance(0.05);
    });
    await expect(sigil).toHaveClass(/offered/);
    await expect(petal("water")).toHaveClass(/offered/);
    await sigil.click();
    await play(1.8);
    expect(await prism()).toBeNull();
    await expect(sigil).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("orc").hp)).toBeLessThanOrEqual(5000 - 1250);
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("orc").afflictions.some(({ kind }) => kind === "slow"))).toBe(true);

    // The sigil whole, left a second from fading: faded, the sigil shown fading, saying so, not
    // told in a message, and gone within two seconds
    await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        battle.actor("player").prism = { element: null, step: 0, at: battle.time, pieces: ["fire", "earth", "air", "water"], readyAt: battle.time - 14000 };
        window.pellagos.game.advance(0.05);
    });
    await expect(sigil).toHaveClass(/whole/);
    await lapse();
    await expect(sigil).toBeVisible();
    await expect(sigil).toHaveClass(/faded/);
    await expect(sigil).not.toHaveClass(/whole/);
    await expect(sigil).toHaveAttribute("aria-label", "The Prismatic sigil fades, its power unspent.");
    expect(await told()).not.toContain("sigil fades");
    await play(1.7);
    await expect(sigil).toBeHidden();

    // The four pieces held, the sigil whole: every attack spell twice as strong, no slot ringed;
    // tapped, Prismatic Destruction cast on the orc, which it kills; the sigil spent
    await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        battle.actor("player").prism = { element: null, step: 0, at: battle.time, pieces: ["fire", "earth", "air", "water"], readyAt: battle.time };
        window.pellagos.game.advance(0.05);
    });
    await expect(sigil).toHaveClass(/whole/);
    await expect(sigil.locator(".sigil-bonus")).toHaveText("+100%");
    await expect(sigil).toHaveAttribute("aria-label", /whole: cast Prismatic Destruction on your foe/);
    await expect(bar.locator(".quick-slot.chain")).toHaveCount(0);
    await sigil.click();
    await play(2);
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("orc").dead)).toBe(true);
    expect(await prism()).toBeNull();
    await expect(sigil).toBeHidden();
});

test("Always show (Game options, Action Bar): the Action Bar kept up along the bottom out of a fight, a key using one of its actions there, and remembered; switched off, down again with no fight", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const bar = page.locator(".quickbar");
    const always = (on) =>
        page.evaluate((on) => {
            const switched = document.querySelector("#quickalwaysswitch");

            switched.checked = on;
            switched.dispatchEvent(new Event("change"));
            window.pellagos.game.advance(0.1);
        }, on);

    // Down out of a fight, as ever (the lone orc out of the way)
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.setQuick(["item:potion", null, null, null, null, null]);
        game.advance(0.1);
    });
    await expect(bar).not.toHaveClass(/up/);
    expect(await page.evaluate(() => document.querySelector("#quickalwaysswitch").checked)).toBe(false);

    // Switched on: up, and still up a while on with no one about; remembered
    await always(true);
    await page.evaluate(() => window.pellagos.game.advance(10));
    await expect(bar).toHaveClass(/up/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")).quickAlways)).toBe(true);

    // (Its 1 key used out of a fight: a draught, with none carried, refused. The game going again
    // a moment, as keys are heard only then)
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("1");
    await expect(page.locator("#banner")).toHaveText("You've none left");
    await page.evaluate(() => window.pellagos.game.stop());

    // Off: down at once, there being no fight to linger after
    await always(false);
    await expect(bar).not.toHaveClass(/up/);
});

test("six actions across the Action Bar (Game options): only their icons on a phone held upright, their names on its side; a school's spell flicked down or up rolls to the last or next of its school the player knows, its name said over it, and is kept; at either end of its school, or anything else, it bounces", async ({ page }) => {
    test.setTimeout(180000);
    // (Not full screen, as a tap on the game asks to be, or the phone can't be turned on its side)
    await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ fullscreen: false })));
    await page.setViewportSize({ width: 402, height: 874 });
    await playing(page, "/?play&seed=1");

    const bar = page.locator(".quickbar");
    const slot = (n) => bar.locator(`.quick-slot[data-slot="${n}"]`);
    const shown = () => page.evaluate(() => [...document.querySelectorAll(".quickbar .quick-slot")].filter((each) => !each.hidden).length);
    const quick = () => page.evaluate(() => window.pellagos.game.wheels.quick);

    // A finger down on a slot, moved up or down a little way (more than a tap's stray), and lifted
    // (once the bar's done rising, or the finger's set where the slot was a moment ago, and moved
    // off the bottom of the screen)
    const flick = async (n, way) => {
        await page.waitForFunction(() => document.querySelector(".quickbar").getAnimations().length === 0);

        const at = await slot(n).boundingBox();
        const [x, y] = [at.x + at.width / 2, at.y + at.height / 2];

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 3, y + (way === "up" ? -40 : 40), { steps: 4 });
        await page.mouse.up();
    };

    // Four, as ever, till Six across is switched on in Game options (Action Bar)
    await expect.poll(shown).toBe(4);
    await page.evaluate(() => {
        const switched = document.querySelector("#quicksixswitch");

        switched.checked = true;
        switched.dispatchEvent(new Event("change"));
    });
    expect(await shown()).toBe(6);
    await expect(bar).toHaveClass(/six/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.settings")).quickSix)).toBe(true);

    // The player knows Healing up to Detraumatize; Mend Wounds in the first slot; the orc set on
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const square = [player.square[0] + 3, player.square[1] - 2];

        game.stop();
        game.progress.schools.healing = 700;
        game.setQuick(["mendWounds", "stun", "burn", "item:potion", null, null]);
        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        battle.command("player", { type: "engage", target: "orc" });
        game.advance(0.1);
    });
    await expect(bar).toHaveClass(/up/);

    // Upright, six across and within the screen: only their icons, bigger
    const upright = await page.evaluate(() => {
        const box = document.querySelector(".quickbar").getBoundingClientRect();
        const first = document.querySelector('.quickbar .quick-slot[data-slot="0"]');

        return { left: box.left, right: box.right, label: getComputedStyle(first.querySelector(".quick-label")).display, icon: first.querySelector(".quick-icon").getBoundingClientRect().width };
    });

    expect(upright.left).toBeGreaterThanOrEqual(0);
    expect(upright.right).toBeLessThanOrEqual(402);
    expect(upright.label).toBe("none");
    expect(upright.icon).toBeGreaterThanOrEqual(29);

    // (The sound started first, as the title's Play would have: the page's first tap or key starts
    // it, which keeps the page busy long enough for a finger set down then to count as held)
    await page.keyboard.press("Shift");
    await page.waitForFunction(() => window.pellagos.session.sound.context?.state === "running");

    // Flicked down: Mend Wounds rolls out, Vigor in, its name said over it a moment; kept
    await flick(0, "down");
    expect(await quick()).toEqual(["vigor", "stun", "burn", "item:potion", null, null]);
    await expect(slot(0)).toHaveAttribute("data-action", "vigor");
    await expect(bar.locator(".quick-name")).toHaveText("Vigor");
    await expect(bar.locator(".quick-name")).toHaveClass(/said/);
    // (The reel's gone once it's rolled)
    await expect(slot(0).locator(".quick-ghost")).toHaveCount(0);

    // Down again: Vigor's the first of its school; it bounces, still Vigor
    await flick(0, "down");
    expect(await quick()).toEqual(["vigor", "stun", "burn", "item:potion", null, null]);

    // Up, and up: Mend Wounds, then Detraumatize; up again, Renewal not known yet: Detraumatize
    await flick(0, "up");
    await expect(slot(0)).toHaveAttribute("data-action", "mendWounds");
    await flick(0, "up");
    await expect(slot(0)).toHaveAttribute("data-action", "detraumatize");
    await flick(0, "up");
    expect((await quick())[0]).toBe("detraumatize");

    // Stun's no school's (a hex): it bounces, still Stun; a slid finger (across) is neither
    await flick(1, "up");
    expect((await quick())[1]).toBe("stun");

    // Kept as if chosen in the Action Bar options: there, six, Detraumatize in the first
    await page.evaluate(() => window.pellagos.game.advance(0.1));
    expect(await page.evaluate(() => window.pellagos.game.quickSetup().quick)).toEqual(["detraumatize", "stun", "burn", "item:potion", null, null]);

    // On its side: six across, their names shown
    await page.setViewportSize({ width: 874, height: 402 });
    await page.evaluate(() => window.pellagos.game.advance(0.1));

    const side = await page.evaluate(() => {
        const box = document.querySelector(".quickbar").getBoundingClientRect();
        const label = document.querySelector('.quickbar .quick-slot[data-slot="0"] .quick-label');

        return { left: box.left, right: box.right, display: getComputedStyle(label).display, text: label.textContent };
    });

    expect(side.display).not.toBe("none");
    expect(side.text).toBe("Detraumatize");
    expect(side.left).toBeGreaterThanOrEqual(0);
    expect(side.right).toBeLessThanOrEqual(874);

    // The keys 1 to 6 tap them: 5, an empty one, asks what's to go in it
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("5");
    await expect(page.locator("#menuquick")).toBeVisible();
    await expect(page.locator("#quicksetup .wheels-heading")).toHaveText("Action Bar slot 5");
    expect(await page.evaluate(() => [...document.querySelectorAll("#quicksetup .quick-slot")].filter((each) => !each.hidden).length)).toBe(6);
});

test("a spell tapped on a foe out of reach says so, flashes its slot red and starts nothing cooling down", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await playing(page, "/?play&seed=1");

    const bar = page.locator(".quickbar");
    const slot = (n) => bar.locator(`.quick-slot[data-slot="${n}"]`);

    // The orc set on, further off than any spell reaches (and kept there)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const square = [player.square[0] + 24, player.square[1]];

        game.stop();
        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        battle.command("player", { type: "engage", target: "orc" });
        game.advance(0.1);
    });
    await expect(bar).toHaveClass(/up/);
    await expect(slot(1).locator(".quick-label")).toHaveText("Stun");

    // Stun tapped: refused, said why, its slot flashed red, not lit
    await slot(1).click();
    await expect(slot(1)).toHaveClass(/refused/);
    await expect(page.locator("#banner")).toHaveText("Out of range");

    const after = await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        return { stun: battle.cooldown("player", "stun"), vigor: battle.cooldown("player", "vigor"), casting: battle.actor("player").casting, stunned: battle.actor("orc").stunnedUntil > battle.time };
    });

    expect(after).toEqual({ stun: 0, vigor: 0, casting: null, stunned: false });

    // (Nothing sweeps over the slots: none is cooling down)
    await page.evaluate(() => window.pellagos.game.advance(0.2));
    await expect(slot(1)).not.toHaveClass(/cooling/);
    await expect(slot(0)).not.toHaveClass(/cooling/);
});

test("their followers' wheel, held on one of the player's own (a creature called, by its icon): a draught put on its other side in Game options; its ability by its own name (Savage blow), used on the foe the player's locked on; turned over, Hold fire, and held fire, At will in its place; the draught given to them, healing them", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Summon learnt and cast; two draughts in the pack; a wolf after no one, 10 m west
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const [x, y] = me.square;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.progress.learn("summon");
        game.progress.stow({ id: "potion" });
        game.progress.stow({ id: "potion" });
        game.host.wild.set("test-wolf", { creature: "wolf", tier: 1, pack: "test-wolf", camp: null, lair: null, master: false });
        game.battle.add({ id: "test-wolf", kind: "beast", name: "Wolf", weapon: "wolf", team: "beasts", square: [x - 10, y], map: me.map, ai: null, hp: 400, wild: { creature: "wolf", tier: 1, temper: "aggressive", guard: 0, roam: 0, leash: 30, pack: "test-wolf", leader: null, menace: true, unique: false } });
        Object.assign(me, { spellReadyAt: 0, spellsReadyAt: {} });
        game.host.command(game.me, { type: "cast", spell: "summon" });
    });
    expect(await playUntil(page, () => window.pellagos.game.host.companions.size === 1 && document.querySelector("#party .member.summon"), { seconds: 60 })).toBe(true);

    const id = await page.evaluate(() => [...window.pellagos.game.host.companions.keys()][0]);

    // Game options, Action Wheel and Bar, Action wheels, Your followers: wheel two, a draught at NE
    const setup = page.locator("#wheelsetup");

    await page.evaluate(() => window.pellagos.game.start());
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#actionsbutton").click();
    await page.locator("#wheelsbutton").click();
    await setup.getByRole("tab", { name: "Your followers" }).click();
    await setup.locator('.slice[data-direction="s"]').click();
    await expect(setup.locator('.slice[data-direction="e"] .label')).toHaveText("Hold fire");
    await setup.locator('.slice[data-direction="ne"]').click();
    await expect(setup.locator(".wheels-heading")).toHaveText("Your followers, wheel two, NE");
    await setup.locator('.wheels-choice[data-action="item:potion"]').click();
    expect(await page.evaluate(() => window.pellagos.game.wheels.unit[1])).toEqual({ n: "vigor", ne: "item:potion", e: "unit:stance", w: "item:potion" });
    await page.locator("#wheelsback").click();
    await page.locator("#actionsback").click();
    await page.locator("#optionsback").click();
    await page.locator("#resumebutton").click();
    await page.evaluate(() => window.pellagos.game.stop());

    // Held by its icon, the wheel opens under the finger; flicked from there (`flick`: dx, dy)
    const wheel = page.locator(".action-wheel");
    const member = page.locator(`#party .member[data-id="${id}"]`);
    const box = await member.boundingBox();
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    const hold = async () => {
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await expect(wheel).toBeVisible();
    };
    const flick = async (from, [dx, dy]) => {
        await page.mouse.move(from[0] + dx / 2, from[1] + dy / 2, { steps: 2 });
        await page.mouse.move(from[0] + dx, from[1] + dy, { steps: 2 });
    };
    const turnOver = async () => {
        await flick([cx, cy], [0, 55]);
        await expect(wheel).toHaveAttribute("data-side", "2");

        return [cx, cy + 55];
    };
    const settle = () => page.evaluate(() => window.pellagos.game.advance(0.05));

    // Its ability at NE by its own name; flicked there with the player locked on the wolf, its
    // next blow twice as hard, after it
    await hold();
    await expect(wheel.locator('.slice[data-direction="ne"] .label')).toHaveText("Savage blow");
    await expect(wheel.locator('.slice[data-direction="n"] .label')).toHaveText("My target");
    await page.evaluate(() => (window.pellagos.game.battle.actor(window.pellagos.game.me).lock = "test-wolf"));
    await flick([cx, cy], [28, -28]);
    await page.mouse.up();
    await settle();
    await expect(page.locator("#banner")).toContainText(": Savage blow!");
    expect(await page.evaluate((called) => ({ empowered: window.pellagos.game.battle.actor(called).empowered?.factor, assist: window.pellagos.game.battle.actor(called).assist }), id)).toEqual({ empowered: 2, assist: "test-wolf" });

    // (The wolf gone)
    await page.evaluate(() => {
        const { game } = window.pellagos;

        Object.assign(game.battle.actor("test-wolf"), { dead: true, respawnAt: Infinity });
        game.battle.actor(game.me).lock = null;
        game.advance(0.05);
    });

    // Turned over: Hold fire at E, the draught at NE; flicked E, holding fire
    await hold();

    let from = await turnOver();

    await expect(wheel.locator('.slice[data-direction="e"] .label')).toHaveText("Hold fire");
    await expect(wheel.locator('.slice[data-direction="ne"] .label')).toHaveText("Draught");
    await expect(wheel.locator('.slice[data-direction="ne"] .count')).toHaveText("2");
    await flick(from, [34, 0]);
    await page.mouse.up();
    await settle();
    await expect(page.locator("#banner")).toContainText("holds fire.");
    expect(await page.evaluate((called) => window.pellagos.game.host.stance(called).holdFire, id)).toBe(true);

    // Again: At will in its place; the draught flicked to them, hurt, and they're healed by it
    const hurt = await page.evaluate((called) => {
        const actor = window.pellagos.game.battle.actor(called);

        actor.hp = Math.round(actor.maxHp / 3);

        return actor.hp;
    }, id);

    await hold();
    from = await turnOver();
    await expect(wheel.locator('.slice[data-direction="e"] .label')).toHaveText("At will");
    await flick(from, [28, -28]);
    await page.mouse.up();
    await settle();
    await expect(page.locator("#banner")).toContainText("You give ");

    const given = await page.evaluate((called) => ({ hp: window.pellagos.game.battle.actor(called).hp, maxHp: window.pellagos.game.battle.actor(called).maxHp, draughts: window.pellagos.game.progress.count("potion") }), id);

    expect(given.draughts).toBe(1);
    expect(given.hp).toBe(Math.min(given.maxHp, hurt + 25));
});

test("the action wheels: flicked down, the other side; what's on each chosen in Game options (the player's own, a foe's and their followers'), from what's learnt and carried; a draught drunk from wheel two", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const wheel = page.locator(".action-wheel");
    const menu = page.locator("#menu");
    const setup = page.locator("#wheelsetup");

    // Two draughts in the pack, Healing's second spell come to, and Fire learnt from its tome;
    // the player hurt
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const progress = game.host.players.get(game.me).progress;

        progress.stow({ id: "potion" });
        progress.stow({ id: "potion" });
        progress.schools.healing = 300;
        progress.learn("burn");
        game.battle.actor(game.me).hp = 20;
    });

    // Game options, Action Wheel and Bar, Action wheels: the player's own, wheel one, with Vigor at N
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#actionsbutton").click();
    await page.locator("#wheelsbutton").click();
    await expect(menu.locator("#wheelstitle")).toBeVisible();
    await expect(setup.locator('.wheels-tab[aria-selected="true"]')).toHaveText(["Yourself", "Wheel one"]);
    await expect(setup.locator('.slice[data-direction="n"] .label')).toHaveText("Vigor");

    // What can go on it: nothing, the healing spells known, making camp, the emotes and the
    // draughts carried; a foe's has those spells, the elements' spells learnt (Fire's), Stun and
    // Attack, and no draughts or emotes
    await expect(setup.locator(".wheels-choice")).toHaveText(["Nothing", "Vigor", "Mend Wounds", "Make camp", "Wave", "Bow", "Nod", "Shake head", "Cheer", "Fist pump", "Puzzled", "Beckon", "Draught"]);
    await setup.getByRole("tab", { name: "A foe" }).click();
    await expect(setup.locator(".wheels-choice")).toHaveText(["Nothing", "Vigor", "Mend Wounds", "Burn", "Stun", "Attack"]);

    // Their followers': the healing to cast on them, what to tell them (their own ability among
    // it) and the draughts to give them; Attack my target at the top
    await setup.getByRole("tab", { name: "Your followers" }).click();
    await expect(setup.locator(".wheels-choice")).toHaveText(["Nothing", "Vigor", "Mend Wounds", "Attack my target", "Follow me", "Wait here", "Guard me", "Fall back", "Hold fire / At will", "Their own ability", "Dismiss", "Draught"]);
    await expect(setup.locator('.slice[data-direction="n"] .label')).toHaveText("My target");
    await setup.getByRole("tab", { name: "Yourself" }).click();

    // A draught at NE of wheel two, for the bow there (tapping S turns it over, as flicking it does)
    await setup.locator('.slice[data-direction="s"]').click();
    await expect(setup.locator('.wheels-tab[aria-selected="true"]')).toHaveText(["Yourself", "Wheel two"]);
    await setup.locator('.slice[data-direction="ne"]').click();
    await expect(setup.locator(".wheels-heading")).toHaveText("Yourself, wheel two, NE");
    await setup.locator('.wheels-choice[data-action="item:potion"]').click();
    await expect(setup.locator('.slice[data-direction="ne"] .label')).toHaveText("Draught");
    await expect(setup.locator('.slice[data-direction="ne"] .count')).toHaveText("2");
    expect(await page.evaluate(() => window.pellagos.game.wheels.self)).toEqual([{ n: "vigor" }, { n: "camp", nw: "emote:wave", ne: "item:potion", w: "emote:nod", e: "emote:cheer" }]);

    // Escape goes back a page, and again (to Action Wheel and Bar, then Game options); Back to the
    // main page; then the game
    await page.keyboard.press("Escape");
    await expect(menu.locator("#actionstitle")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu.locator("#optionstitle")).toBeVisible();
    await page.locator("#optionsback").click();
    await page.locator("#resumebutton").click();
    await expect(menu).toBeHidden();

    // Held on the player: wheel one; flicked down, wheel two, opened again under the finger
    const me = await page.evaluate(() => {
        const { game, session } = window.pellagos;

        return session.view.toScreen(game.avatars.get(game.me).point(0.5));
    });

    await page.mouse.move(me.x, me.y);
    await page.mouse.down();
    await expect(wheel).toBeVisible();
    await expect(wheel).toHaveAttribute("data-side", "1");
    await page.mouse.move(me.x, me.y + 25, { steps: 2 });
    await page.mouse.move(me.x, me.y + 55, { steps: 2 });
    await expect(wheel).toHaveAttribute("data-side", "2");
    await expect(wheel.locator('.slice[data-direction="ne"] .label')).toHaveText("Draught");
    await expect(wheel.locator('.slice[data-direction="ne"] .count')).toHaveText("2");
    await expect(wheel.locator('.slice.flip[data-direction="s"] .label')).toHaveText("Wheel 1");

    // Flicked NE from there: a draught drunk
    await page.mouse.move(me.x + 20, me.y + 35, { steps: 2 });
    await page.mouse.move(me.x + 40, me.y + 15, { steps: 2 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.pellagos.game.battle.actor(window.pellagos.game.me).hp)).toBe(45);
    expect(await page.evaluate(() => window.pellagos.game.progress.count("potion"))).toBe(1);
});

test("magic: the spellbook shows every school and the tomes; an element opened by its tome; a tome read teaches its spell, put on a wheel from the book; the seventh tier floods the screen; summoned by another player, asked whether to go", async ({ page }) => {
    // (Two tomes read, a fight and a summons: more than the usual time)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const book = page.locator(".spellbook");

    // Play on without drawing, then carry on
    const playOn = (seconds) => page.evaluate((seconds) => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(seconds);
        game.start();
    }, seconds);

    // The spellbook, from its button: the five schools, the hexes and the tomes; Vigor and Stun
    // known, the rest still to come; each element not yet learnt, its tome at the guild
    await page.locator("#spellbookbutton").click();
    await expect(book).toBeVisible();
    await expect(book.locator(".journal-heading")).toHaveText(["Healing", "Fire", "Earth", "Air", "Water", "Hexes", "From tomes"]);
    await expect(book.locator(".spellbook-spell:not(.unknown) .spellbook-name")).toHaveText(["Vigor", "Stun"]);
    await expect(book.locator(".spellbook-spell.unknown")).toHaveCount(4 + 7 * 4 + 1);
    await expect(book.locator(".spellbook-growth .journal-line")).toHaveText(["Tier 1 of 5", "Not yet learnt", "Not yet learnt", "Not yet learnt", "Not yet learnt"]);
    await expect(book.locator(".spellbook-growth .journal-note").nth(1)).toHaveText("Read the Tome of Burn to learn Burn and open Fire: 25 gold at any adventurers' guild. Its other spells come as it grows.");

    // The Tome of Burn (bought at the guild) read: Burn known, and Fire open
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;

        game.progress.stow({ id: "tomeBurn", quality: "common" });

        return game.host.command(game.me, { type: "use", item: "tomeBurn" });
    })).toEqual({ ok: true });
    await playOn(0.2);
    await expect(book.locator(".spellbook-spell:not(.unknown) .spellbook-name")).toHaveText(["Vigor", "Burn", "Stun"]);
    await expect(book.locator(".spellbook-growth .journal-line")).toHaveText(["Tier 1 of 5", "Tier 1 of 7", "Not yet learnt", "Not yet learnt", "Not yet learnt"]);

    // A tome of Levitate in the pack, read: the spell learnt (the book shows it), and put on the
    // player's own wheel from it
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;

        game.progress.stow({ id: "tomeLevitate", quality: "common" });

        return game.host.command(game.me, { type: "use", item: "tomeLevitate" });
    })).toEqual({ ok: true });
    await playOn(0.2);
    await expect(book.locator(".spellbook-spell:not(.unknown) .spellbook-name")).toContainText(["Levitate"]);
    await book.locator('button[aria-label="Put Levitate on an action wheel"]').click();
    expect(await page.evaluate(() => Object.values(window.pellagos.game.wheels.self[0]))).toContain("levitate");
    await page.keyboard.press("Escape");
    await expect(book).toBeHidden();

    // Fire grown to its seventh tier: Hellfire cast on an orc floods the screen with red, shakes
    // the camera and fills the ground round it with fire (the orc drawn first, the nearest the
    // player, over a few frames)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.progress.schools.fire = 30000;
        game.battle.add({ id: "target", kind: "orc", weapon: "cleaver", team: "orcs", square: [me.square[0] + 1, me.square[1] - 3], hp: 5000 });
        game.enlisting.push("target");
        game.stop();
    });
    expect(await playUntil(page, () => window.pellagos.game.avatars.has("target"))).toBe(true);

    const cast = await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        Object.assign(me, { spellReadyAt: 0, spellsReadyAt: {} });

        const result = game.host.command(game.me, { type: "cast", spell: "hellfire", target: "target" });

        game.advance(1.5);

        const wash = document.querySelector(".spellwash");
        const seen = { result, washed: wash.getAnimations().length > 0 && wash.style.background.includes("rgba(255, 42, 10"), shaking: game.shaking, showing: game.spellFx.running.length };

        game.start();

        return seen;
    });

    expect(cast.result).toEqual({ ok: true });
    expect(cast.washed).toBe(true);
    expect(cast.shaking).toBeGreaterThan(0);
    expect(cast.showing).toBeGreaterThan(8);

    // Another player summons them: asked whether to go, and going, they're at their side
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;
        const { host, battle } = game;
        const me = battle.actor(game.me);

        battle.remove("target");
        host.join({ id: "guest", hero: { ...host.players.get(game.me).hero, name: "Bram" }, progress: { spells: ["summon"] } });
        battle.place("guest", "town", [me.square[0] + 24, me.square[1]]);
        Object.assign(battle.actor("guest"), { spellReadyAt: 0, spellsReadyAt: {} });

        return host.command("guest", { type: "cast", spell: "summon", target: game.me });
    })).toEqual({ ok: true });
    await playOn(2);

    const choice = page.locator(".choice");

    await expect(choice.locator(".choice-title")).toHaveText("Bram is summoning you to their side. Go?");
    await choice.locator(".choice-option", { hasText: "Go to Bram" }).click();
    await expect(choice).toHaveCount(0);
    await playOn(0.5);
    expect(await page.evaluate(() => {
        const { battle } = window.pellagos.game;
        const [me, guest] = [battle.actor("player"), battle.actor("guest")];

        return Math.hypot(me.x - guest.x, me.y - guest.y);
    })).toBeLessThan(5);
});

test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("turned on its side and back, the world's drawn the shape of the screen, never stretched: even told it's resized while it's still turning, as Chrome on Android tells it", async ({ page }) => {
        // (Full screen while playing off: the browser here can't be turned, resized, while it's
        // full screen, as a phone can)
        await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ fullscreen: false })));
        await playing(page, "/?play&seed=1");

        // How the world's drawn against the canvas it's drawn on: the drawing's shape and the
        // camera's, and the canvas's on the page
        const shape = () => page.evaluate(() => {
            const { view } = window.pellagos.session;
            const canvas = view.canvas;

            return { page: canvas.clientWidth / canvas.clientHeight, drawing: canvas.width / canvas.height, camera: view.camera.aspect };
        });
        const drawnTrue = async (what) => {
            // (Two frames: the browser's told the page its canvas changed by then)
            await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

            const { page: wanted, drawing, camera } = await shape();

            expect(Math.abs(drawing - wanted), `${what}: drawn ${drawing.toFixed(3)} for ${wanted.toFixed(3)}`).toBeLessThan(0.01);
            expect(Math.abs(camera - wanted), `${what}: camera ${camera.toFixed(3)} for ${wanted.toFixed(3)}`).toBeLessThan(0.01);
        };

        await drawnTrue("upright");

        // On its side, and upright again
        await page.setViewportSize({ width: 844, height: 390 });
        await drawnTrue("on its side");
        expect((await shape()).page).toBeGreaterThan(1);
        await page.setViewportSize({ width: 390, height: 844 });
        await drawnTrue("upright again");

        // Told it's resized halfway through turning (the page laid out half way), and then not
        // again once it's done: still drawn the shape it ends up
        await page.evaluate(() => {
            const canvas = window.pellagos.session.view.canvas;

            canvas.style.height = "45%";
            window.dispatchEvent(new Event("resize"));
        });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
        await page.evaluate(() => {
            window.pellagos.session.view.canvas.style.height = "";
        });
        await drawnTrue("done turning, untold");
    });

    test("an Action Bar action tapped is used once: a draught tapped drinks one, Vigor tapped heals without being refused as cooling down", async ({ page }) => {
        await page.goto("/?play&seed=1");
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000 });

        // (In a fight with the orc, stunned, the player hurt and carrying five draughts)
        await page.evaluate(() => {
            const { game } = window.pellagos;
            const { battle } = game;
            const player = battle.actor("player");
            const orc = battle.actor("orc");
            const square = [player.square[0] + 3, player.square[1] - 2];

            game.host.players.get(game.me).progress.pack[0] = { id: "potion", quality: "common", count: 5 };
            game.stop();
            Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null, stunnedUntil: battle.time + 600000 });
            game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
            game.previous.set("orc", { x: orc.x, y: orc.y });
            player.hp = 10;
            battle.command("player", { type: "engage", target: "orc" });
            game.advance(0.1);
        });

        const slot = (n) => page.locator(`.quickbar .quick-slot[data-slot="${n}"]`);
        const play = (seconds) => page.evaluate((seconds) => window.pellagos.game.advance(seconds), seconds);
        const state = () => page.evaluate(() => ({ potions: window.pellagos.game.progress.count("potion"), hp: window.pellagos.game.battle.actor("player").hp }));

        await expect(page.locator(".quickbar")).toHaveClass(/up/);
        await expect(slot(3).locator(".quick-label")).toHaveText("Draught");

        // A draught tapped (a finger's tap, and the click the browser fires after it): one drunk
        const before = await state();

        await slot(3).tap();
        await play(1);
        expect((await state()).potions).toBe(before.potions - 1);

        // Vigor tapped: cast, and nothing refused (as a second use would be, cooling down)
        await page.evaluate(() => {
            window.pellagos.game.battle.actor("player").hp = 10;
        });
        await slot(0).tap();
        await play(0.1);
        await expect(slot(0)).not.toHaveClass(/refused/);
        await expect(page.locator("#banner")).not.toHaveText("Not ready yet");
        await play(1);
        expect((await state()).hp).toBeGreaterThan(10);
    });

    test("an Action Bar press whose lift is lost, as a phone's Safari loses it, never leaves its slot deaf: let go of as the slot's let go of, or once no finger's on the screen, or taken over by the next touch (kept in the debug log); let go of as the bar's put away or the page loses the player; a hold and Back leave the next tap heard", async ({ page }) => {
        test.setTimeout(180000);
        await page.goto("/?play&seed=1");
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000 });

        // (In a fight with the orc, stunned, the player hurt and carrying five draughts; each slot's
        // use and hold heard)
        await page.evaluate(() => {
            const { game } = window.pellagos;
            const { battle } = game;
            const player = battle.actor("player");
            const orc = battle.actor("orc");
            const square = [player.square[0] + 3, player.square[1] - 2];
            const bar = game.quickBar;
            const { onUse, onChoose } = bar;

            game.host.players.get(game.me).progress.pack[0] = { id: "potion", quality: "common", count: 5 };
            game.stop();
            Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null, stunnedUntil: battle.time + 600000 });
            game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
            game.previous.set("orc", { x: orc.x, y: orc.y });
            player.hp = 10;
            battle.command("player", { type: "engage", target: "orc" });
            game.advance(0.1);
            window.heard = [];
            bar.onUse = (slot) => {
                window.heard.push(`use ${slot}`);
                onUse(slot);
            };
            bar.onChoose = (slot) => {
                window.heard.push(`choose ${slot}`);
                onChoose(slot);
            };
        });

        const slot = (n) => page.locator(`.quickbar .quick-slot[data-slot="${n}"]`);
        const heard = () => page.evaluate(() => window.heard);
        const forget = () => page.evaluate(() => {
            window.heard.length = 0;
            window.pellagos.telemetry.clear();
        });
        const lost = () => page.evaluate(() => window.pellagos.telemetry.events.filter((event) => event.kind === "press").map(({ slot, how, up }) => ({ slot, how, up })));
        // (Longer than a hold: a press left held would be taken for one by now)
        const longer = () => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)));

        // (A finger down on a slot and lifted, as a phone's are; and the next of each of these events
        // swallowed before the page hears it, as Safari loses them: let go of after)
        const cdp = await page.context().newCDPSession(page);
        const touch = async (type, n) => {
            const box = n === undefined ? null : await slot(n).boundingBox();

            await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: box ? [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 0 }] : [] });
        };
        const swallow = (...types) => page.evaluate((types) => {
            window.swallowed = types.map((type) => {
                const swallowing = (event) => {
                    event.stopImmediatePropagation();
                    window.removeEventListener(type, swallowing, true);
                };

                window.addEventListener(type, swallowing, true);

                return [type, swallowing];
            });
        }, types);
        const unswallow = () => page.evaluate(() => window.swallowed.forEach(([type, swallowing]) => window.removeEventListener(type, swallowing, true)));

        await expect(page.locator(".quickbar")).toHaveClass(/up/);
        await expect(slot(0).locator(".quick-label")).toHaveText("Vigor");
        await expect(slot(3).locator(".quick-label")).toHaveText("Draught");

        // The lift lost and the finger's leaving the screen too, the slot let go of after: nothing
        // used or changed, and the next tap used
        await forget();
        await swallow("pointerup", "touchend");
        await touch("touchStart", 3);
        await touch("touchEnd");
        await longer();
        await unswallow();
        expect(await heard()).toEqual([]);
        await slot(3).tap();
        await expect.poll(heard).toEqual(["use 3"]);

        // Lost and the slot never let go of (as iOS 27 does), but the finger's left the screen:
        // dropped a moment after, before it'd be taken for a hold, and kept in the debug log
        await forget();
        await swallow("pointerup", "lostpointercapture");
        await touch("touchStart", 0);
        await touch("touchEnd");
        await longer();
        await unswallow();
        expect(await heard()).toEqual([]);
        expect(await lost()).toEqual([{ slot: 0, how: "bare", up: true }]);
        await slot(0).tap();
        await expect.poll(heard).toEqual(["use 0"]);

        // All of it lost: the next touch takes over, used once, the press lost kept in the debug
        // log; and no hold after. (Touched again at once, before the lost press would be taken for
        // a hold)
        await forget();
        await swallow("pointerup", "lostpointercapture", "touchend");
        await touch("touchStart", 3);
        await touch("touchEnd");
        await touch("touchStart", 3);
        await touch("touchEnd");
        await unswallow();
        await longer();
        expect(await heard()).toEqual(["use 3"]);
        expect(await lost()).toEqual([{ slot: 3, how: "again", up: true }]);

        // The page losing the player (another app's come up) with a finger on a slot: let go of,
        // nothing as it's lifted
        await forget();
        await touch("touchStart", 3);
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await touch("touchEnd");
        await longer();
        expect(await heard()).toEqual([]);
        await slot(3).tap();
        await expect.poll(heard).toEqual(["use 3"]);

        // The fight over (lingered out) with a finger on Vigor: put away, let go of; lifted, nothing;
        // in the next fight, Vigor tapped is used
        await forget();
        await page.evaluate(() => {
            const { game } = window.pellagos;
            const player = game.battle.actor("player");

            Object.assign(game.battle.actor("orc"), { target: null, attack: null, dead: true, respawnAt: Infinity });
            Object.assign(player, { order: null, attack: null });
            game.advance(0.1);
        });
        await touch("touchStart", 0);
        await page.evaluate(() => {
            const { game } = window.pellagos;

            game.fightUntil = game.clock;
            game.advance(0.05);
        });
        await expect(page.locator(".quickbar")).not.toHaveClass(/up/);
        await touch("touchEnd");
        await longer();
        expect(await heard()).toEqual([]);
        await page.evaluate(() => {
            const { game } = window.pellagos;
            const { battle } = game;
            const orc = battle.actor("orc");

            Object.assign(orc, { dead: false, hp: orc.maxHp, stunnedUntil: battle.time + 600000 });
            battle.command("player", { type: "engage", target: "orc" });
            game.advance(0.1);
        });
        await expect(page.locator(".quickbar")).toHaveClass(/up/);
        await slot(0).tap();
        await expect.poll(heard).toEqual(["use 0"]);

        // Held: changed in the Action Bar options, the finger still down as it opens; Back, and the next tap
        // used. (Played on: a game that's stopped has no menu to pause at)
        await forget();
        await page.evaluate(() => window.pellagos.game.start());
        await touch("touchStart", 1);
        await expect(page.locator("#menuquick")).toBeVisible();
        await touch("touchEnd");
        expect(await heard()).toEqual(["choose 1"]);
        await page.locator("#quickback").tap();
        await expect(page.locator("#menu")).not.toBeVisible();
        await slot(1).tap();
        await expect.poll(heard).toEqual(["choose 1", "use 1"]);
    });

    test("an Action Bar action held, or an empty slot tapped, opens the Action Bar options, and the finger's lift isn't taken for a tap on what's under it there (Back to the game, over the slot at the foot of the screen): it stays open till Back's tapped", async ({ page }) => {
        test.setTimeout(180000);
        await playing(page, "/?play&seed=1");

        // (In a fight with the orc, stunned; the fourth slot emptied; played on, for there to be a
        // menu to pause at)
        await page.evaluate(() => {
            const { game } = window.pellagos;
            const { battle } = game;
            const player = battle.actor("player");
            const orc = battle.actor("orc");
            const square = [player.square[0] + 3, player.square[1] - 2];

            game.stop();
            Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null, stunnedUntil: battle.time + 600000 });
            game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
            game.previous.set("orc", { x: orc.x, y: orc.y });
            game.setQuick(["vigor", "stun", "burn", null, null, null]);
            battle.command("player", { type: "engage", target: "orc" });
            game.advance(0.1);
            game.start();
        });

        const slot = (n) => page.locator(`.quickbar .quick-slot[data-slot="${n}"]`);
        const menu = page.locator("#menu");
        // (Longer than the click a browser fires after a lift may take to come)
        const longer = () => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 800)));
        const cdp = await page.context().newCDPSession(page);
        const touch = async (type, n) => {
            const box = n === undefined ? null : await slot(n).boundingBox();

            await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: box ? [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 0 }] : [] });
        };

        await expect(page.locator(".quickbar")).toHaveClass(/up/);
        await expect(slot(3)).toHaveClass(/empty/);

        // Held: the Action Bar options open over the finger still down; lifted, it stays open
        await touch("touchStart", 1);
        await expect(page.locator("#menuquick")).toBeVisible();
        await touch("touchEnd");
        await longer();
        await expect(menu).toBeVisible();
        await expect(page.locator("#quicksetup .wheels-heading")).toHaveText("Action Bar slot 2");
        await page.locator("#quickback").tap();
        await expect(menu).not.toBeVisible();
        expect(await page.evaluate(() => window.pellagos.game.running)).toBe(true);

        // An empty slot tapped: its choices opened, and they stay open
        await touch("touchStart", 3);
        await touch("touchEnd");
        await expect(page.locator("#menuquick")).toBeVisible();
        await longer();
        await expect(menu).toBeVisible();
        await expect(page.locator("#quicksetup .wheels-heading")).toHaveText("Action Bar slot 4");
        await page.locator("#quickback").tap();
        await expect(menu).not.toBeVisible();

        // (A tap on a slot that's used still goes as it did: no menu)
        await slot(0).tap();
        await longer();
        await expect(menu).not.toBeVisible();
    });

    test("a thumb on the thumb stick whose lift is lost, as a phone's Safari loses it, never runs the player on: let go of, stopped, once no finger's on the screen; with that lost too, the next thumb on it takes over (kept in the debug log)", async ({ page }) => {
        test.setTimeout(180000);
        await playing(page, "/?play&seed=1");
        await clearestWayAhead(page);

        const zone = await page.locator("#stickzone").boundingBox();
        const middle = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
        const held = () => page.evaluate(() => document.querySelector("#stickzone").classList.contains("held"));
        const lost = () => page.evaluate(() => window.pellagos.telemetry.events.filter((event) => event.kind === "press").map(({ slot, how }) => ({ slot, how })));

        // (A thumb on the stick, as a phone's are; and the next of each of these events swallowed
        // before the page hears it, as Safari loses them)
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, up = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: middle.x, y: middle.y - up, id: 0 }] });
        const swallow = (...types) => page.evaluate((types) => {
            window.swallowed = types.map((type) => {
                const swallowing = (event) => {
                    event.stopImmediatePropagation();
                    window.removeEventListener(type, swallowing, true);
                };

                window.addEventListener(type, swallowing, true);

                return [type, swallowing];
            });
        }, types);
        const unswallow = () => page.evaluate(() => window.swallowed.forEach(([type, swallowing]) => window.removeEventListener(type, swallowing, true)));

        await page.evaluate(() => window.pellagos.telemetry.clear());

        // Pushed to its rim, running, and lifted, the lift lost and the stick never let go of the
        // pointer (as iOS 27 does), but the finger's left the screen: stopped a moment after, told
        await swallow("pointerup", "lostpointercapture");
        await touch("touchStart");
        await touch("touchMove", 80);
        expect((await told(page)).order?.run).toBe(true);
        await touch("touchEnd");
        await expect.poll(async () => (await told(page)).order).toBe(null);
        await unswallow();
        expect(await held()).toBe(false);
        expect(await lost()).toEqual([{ slot: "stick", how: "bare" }]);

        // All of it lost, the finger's leaving the screen too: running on till the next thumb on it,
        // which takes over (pushed a little way, walking), and stops them as it's lifted
        await page.evaluate(() => window.pellagos.telemetry.clear());
        await swallow("pointerup", "lostpointercapture", "touchend");
        await touch("touchStart");
        await touch("touchMove", 80);
        await touch("touchEnd");
        await unswallow();
        expect((await told(page)).order?.run).toBe(true);
        expect(await held()).toBe(true);
        await touch("touchStart");
        await touch("touchMove", 34);
        await expect.poll(async () => (await told(page)).order?.run).toBe(false);
        expect(await lost()).toEqual([{ slot: "stick", how: "again" }]);
        await touch("touchEnd");
        await expect.poll(async () => (await told(page)).order).toBe(null);
        expect(await held()).toBe(false);
    });

    test("fits the screen: the title, making a character and the game's buttons; runs where the ground is double-tapped", async ({ page }) => {
        await title(page);

        const card = await page.locator(".title").boundingBox();

        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(390);

        await page.getByRole("button", { name: "New character" }).tap();
        await expect(page.locator("#create")).toBeVisible();

        // The maker sits below the character, across the whole width
        const maker = await page.locator(".creator").boundingBox();

        expect(maker.y).toBeGreaterThan(300);
        expect(maker.width).toBeGreaterThan(350);

        await page.goto("/?play&seed=1");
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000 });

        // (The zoom buttons are off until Game options asks for them, and the thumb stick's there
        // from the start: both below)
        for (const button of ["#menubutton", "#packbutton", "#journalbutton", "#spellbookbutton"]) {
            const box = await page.locator(button).boundingBox();

            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.x + box.width).toBeLessThanOrEqual(390);
        }

        // The hint fits across the screen
        const hint = await page.locator("#hint").boundingBox();

        expect(hint.x).toBeGreaterThanOrEqual(0);
        expect(hint.x + hint.width).toBeLessThanOrEqual(390);

        // The player's name and health in the bottom right corner, under the hint, with room above
        // it for the stamina bar
        const plate = await page.locator("#playerplate").boundingBox();

        expect(plate.x + plate.width).toBeGreaterThan(390 - 30);
        expect(plate.x + plate.width).toBeLessThanOrEqual(390);
        expect(plate.y + plate.height).toBeGreaterThan(844 - 30);
        expect(plate.y + plate.height).toBeLessThanOrEqual(844);
        expect(hint.y + hint.height).toBeLessThanOrEqual(plate.y - 20);

        // Asked for, the zoom buttons are big enough to tap and on the screen too, as the thumb
        // stick is, and the card rises clear of the zoom buttons rather than sitting under them
        await page.evaluate(() => {
            for (const id of ["#zoomswitch", "#stickswitch"]) {
                const switched = document.querySelector(id);

                switched.checked = true;
                switched.dispatchEvent(new Event("change"));
            }
        });

        for (const control of ["#zoomin", "#zoomout", "#stickzone"]) {
            const box = await page.locator(control).boundingBox();

            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(390);
            expect(box.y + box.height).toBeLessThanOrEqual(844);
        }

        const zoom = await page.locator("#zoomin").boundingBox();
        const risen = await page.locator("#playerplate").boundingBox();

        expect(risen.y + risen.height).toBeLessThanOrEqual(zoom.y);

        // (Both turned off, so the double tap below meets the view and not the stick)
        await page.evaluate(() => {
            for (const id of ["#zoomswitch", "#stickswitch"]) {
                const switched = document.querySelector(id);

                switched.checked = false;
                switched.dispatchEvent(new Event("change"));
            }
        });

        // The ground double-tapped: the player runs there
        await doubleTap(page, await spotNorth(page, 4), { touch: true });

        expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").order?.run)).toBe(true);
    });

    test("making a character, one finger dragged across the view walks round them, two spread apart come nearer and brought together stand further off; never so near the camera cuts into them, all the way round, even close up on their face", async ({ page }) => {
        test.setTimeout(240000);
        await title(page);
        await page.getByRole("button", { name: "New character" }).tap();
        await expect(page.locator("#create")).toBeVisible();
        await page.waitForFunction(() => window.pellagos.creator?.avatar);

        // (Fingers on the screen as a phone's are: each moved from where it lands to where it's
        // lifted in five steps)
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, fingers) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: fingers.map(([x, y], id) => ({ x, y, id })) });
        const moved = async (from, to) => {
            await touch("touchStart", from);

            for (let k = 1; k <= 5; k++) {
                await touch("touchMove", from.map(([x, y], i) => [x + ((to[i][0] - x) * k) / 5, y + ((to[i][1] - y) * k) / 5]));
            }

            await touch("touchEnd", []);
        };
        const orbit = () => page.evaluate(() => ({ ...window.pellagos.creator.orbit }));

        // (Measured as they're first drawn, a little at a time: how near the camera may come)
        await page.waitForFunction(() => window.pellagos.creator.measured, null, { timeout: 60000 });

        // (Above the panel: the view, under the screen it's on)
        const panel = await page.locator(".creator").boundingBox();
        const [x, y] = [195, panel.y / 2];

        expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).id, [x, y])).toBe("view");

        // One finger dragged 120 pixels across: walked round them, a turn for the screen's width
        const start = await orbit();

        await moved([[x - 60, y]], [[x + 60, y]]);

        const turned = await orbit();

        expect(turned.target).toBeCloseTo(start.target - (120 / 390) * Math.PI * 2, 2);
        expect(turned.zoom).toBe(start.zoom);

        // Two spread four times as far apart: four times nearer; brought halfway together again:
        // twice as far off; not turning them either way
        await moved([[x, y - 20], [x, y + 20]], [[x, y - 80], [x, y + 80]]);

        const nearer = await orbit();

        expect(nearer.zoom).toBeCloseTo(start.zoom / 4, 2);
        expect(nearer.target).toBe(turned.target);

        await moved([[x, y - 80], [x, y + 80]], [[x, y - 40], [x, y + 40]]);
        expect((await orbit()).zoom).toBeCloseTo(nearer.zoom * 2, 2);

        // Spread as far as they go, on the body and close up on the face, and walked all the way
        // round in four drags: the camera as near as each way round lets it come, never so near it
        // cuts into them (none of them nearer it than it draws from), and nearer than each tab
        // frames them from
        for (const [tab, at, framed] of [["Body", 0.52, 4.5], ["Face", 0.935, 0.95]]) {
            await page.getByRole("tab", { name: tab }).tap();
            await creatorSettled(page, at);
            await moved([[x, y - 10], [x, y + 10]], [[x, y - 150], [x, y + 150]]);

            const closest = [];

            for (let turn = 0; turn < 4; turn++) {
                await moved([[x - 49, y]], [[x + 49, y]]);
                await creatorSettled(page, at);

                const { gap, near, distance } = await creatorGap(page);

                expect(gap, `${tab}, turned ${turn} quarters`).toBeGreaterThan(near);
                closest.push(distance);
            }

            expect(Math.min(...closest), tab).toBeLessThan(framed * 1.6 * 0.6);
        }
    });

    test("on the world map an icon tapped says what it is, over it, till the map's touched again", async ({ page }) => {
        await playing(page, "/?play&seed=1");

        // (Into Wenches and Ale and out again: its icon on the map)
        await page.evaluate(() => {
            const { game } = window.pellagos;
            const player = game.battle.actor("player");

            game.stop();
            Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

            for (const map of ["taproom", "town"]) {
                game.battle.command("player", { type: "enter", link: "tavern-door" });

                for (let k = 0; k < 200 && player.map !== map; k++) {
                    game.advance(0.25, { render: false });
                }
            }

            game.start();
        });
        await page.keyboard.press("m");
        await expect(page.locator("#worldmap")).toBeVisible();
        await page.waitForFunction(() => window.pellagos.worldMap?.spots.some(({ about }) => /\(tavern\)$/.test(about)), null, { polling: 100 });

        const tip = page.locator("#worldmap .worldmap-tip");
        const tavern = await page.evaluate(() => {
            const { worldMap } = window.pellagos;
            const rect = worldMap.canvas.getBoundingClientRect();
            const spot = worldMap.spots.find(({ about }) => /\(tavern\)$/.test(about));

            return { x: rect.left + spot.x, y: rect.top + spot.y, about: spot.about };
        });

        await page.touchscreen.tap(tavern.x, tavern.y);
        await expect(tip).toBeVisible();
        await expect(tip).toHaveText(tavern.about);

        // (Touched again, away from it: gone)
        await page.touchscreen.tap(tavern.x + 100, tavern.y + 150);
        await expect(tip).toBeHidden();
    });

    test("on the world map one finger drags it about, two spread apart zoom in and brought together zoom out, and two moved drag it, what's under them staying under them", async ({ page }) => {
        await playing(page, "/?play&seed=1");
        await page.keyboard.press("m");
        await expect(page.locator("#worldmap")).toBeVisible();
        await page.waitForFunction(() => window.pellagos.worldMap?.drawn, null, { polling: 100 });

        // (Fingers on the screen as a phone's are: each moved from where it lands to where it's
        // lifted in ten steps)
        const cdp = await page.context().newCDPSession(page);
        const touch = (type, fingers) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: fingers.map(([x, y], id) => ({ x, y, id })) });
        const moved = async (from, to) => {
            await touch("touchStart", from);

            for (let k = 1; k <= 10; k++) {
                await touch("touchMove", from.map(([x, y], i) => [x + ((to[i][0] - x) * k) / 10, y + ((to[i][1] - y) * k) / 10]));
            }

            await touch("touchEnd", []);
        };

        // How the map's shown, and where on it a point of the screen is (metres)
        const view = () => page.evaluate(() => ({ ...window.pellagos.worldMap.view }));
        const under = ([x, y]) =>
            page.evaluate(([x, y]) => {
                const { worldMap } = window.pellagos;
                const rect = worldMap.canvas.getBoundingClientRect();

                return worldMap.pointAt(x - rect.left, y - rect.top);
            }, [x, y]);
        const canvas = await page.locator("#worldmapcanvas").boundingBox();
        const [cx, cy] = [canvas.x + canvas.width / 2, canvas.y + canvas.height / 2];
        const start = await view();

        // One finger dragged 100 pixels left and 80 up: the map goes with it
        await moved([[cx, cy]], [[cx - 100, cy - 80]]);

        const dragged = await view();

        expect(dragged.scale).toBe(start.scale);
        expect(dragged.x - start.x).toBeCloseTo(100 * start.scale, 3);
        expect(dragged.z - start.z).toBeCloseTo(80 * start.scale, 3);

        // Two fingers spread three times as far apart: zoomed in three times, what was between them
        // still there
        const middle = await under([cx, cy]);

        await moved([[cx - 40, cy], [cx + 40, cy]], [[cx - 120, cy], [cx + 120, cy]]);

        const spread = await view();

        expect(spread.scale / dragged.scale).toBeCloseTo(1 / 3, 3);

        for (const [k, at] of (await under([cx, cy])).entries()) {
            expect(Math.abs(at - middle[k])).toBeLessThan(spread.scale);
        }

        // Brought together to a quarter as far apart: zoomed out four times
        await moved([[cx - 120, cy], [cx + 120, cy]], [[cx - 30, cy], [cx + 30, cy]]);

        const pinched = await view();

        expect(pinched.scale / spread.scale).toBeCloseTo(4, 3);

        // Spread twice as far apart as they're moved down: zoomed in twice, the map followed, what
        // was between them where they started between them where they're lifted
        const from = [[cx - 80, cy - 40], [cx - 20, cy - 40]];
        const to = [[cx - 110, cy + 20], [cx + 10, cy + 20]];
        const held = await under([cx - 50, cy - 40]);

        await moved(from, to);

        const both = await view();

        expect(both.scale / pinched.scale).toBeCloseTo(1 / 2, 3);

        for (const [k, at] of (await under([cx - 50, cy + 20])).entries()) {
            expect(Math.abs(at - held[k])).toBeLessThan(both.scale);
        }

        // And none of it a tap, a double tap or a hold: no pin dropped, no journey, the map open
        expect(await page.evaluate(() => ({ pin: window.pellagos.game.pin, journey: window.pellagos.game.journey, open: document.querySelector("#worldmap").open }))).toEqual({ pin: null, journey: null, open: true });
    });
});

test("the debug overlay's field battle, out on open ground: two armies of 40 mustered before the player in their lines of battle, every role in each, drawn all at once in their crowds, a kind's figure each, and the few nearest in full; let go, they march to meet and fight, and the fallen lie", async ({ page }) => {
    test.setTimeout(300000);
    await playing(page, "/?play&seed=2");

    // (Out of town, on open ground, the camera drawn back to see it all)
    const ground = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const me = game.battle.actor(game.me);
        const squares = game.world.maps?.town?.squares ?? game.world.squares;
        const open = (x0, y0) => {
            for (let y = y0 - 70; y < y0 + 10; y += 2) {
                for (let x = x0 - 25; x < x0 + 25; x += 2) {
                    if (squares.blocked(x, y) || squares.opaque(x, y)) {
                        return false;
                    }
                }
            }

            return true;
        };

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        session.view.zoom(10);

        for (let r = 60; r < 1500; r += 20) {
            for (let a = 0; a < 24; a++) {
                const [x, y] = [Math.round(me.x + r * Math.cos((a * Math.PI) / 12)), Math.round(me.y + r * Math.sin((a * Math.PI) / 12))];

                if (open(x, y)) {
                    game.host.battle.place(game.me, "town", [x, y], { facing: Math.PI });

                    return [x, y];
                }
            }
        }

        return null;
    });

    expect(ground).not.toBeNull();
    await playUntil(page, () => false, { seconds: 4 });

    // Mustered from the debug overlay, the way the camera looks, each army drawn up for battle:
    // the lines held where they stand till they're all drawn (the battle too: docs/WAR.md
    // *Battles*)
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.fieldBattle(40);
        window.held = {};
        game.host.fields[0].engagement.next = Infinity;

        for (const [id, { to, advance }] of Object.entries(game.battle.formations)) {
            window.held[id] = { to, advance };
            game.battle.formation(id, { to: null, advance: false });
        }
    });

    const drawn = () => {
        const { game } = window.pellagos;
        const fielded = game.battle.actors.filter(({ id }) => id.startsWith("field-"));

        // (And the nearest built in full, in the crowd till they are)
        const building = [...game.enlisting, ...game.enlistees.keys()].some((id) => id.startsWith("field-"));

        // (And sorted since (app/game.js #marshal, a couple of times a second): any built in full
        // while their kind's figure was being made, past the margin, put in their crowd)
        if (!(fielded.length === 80 && fielded.every(({ id }) => game.avatars.has(id)) && !game.crowds?.busy && !building)) {
            window.drawnAt = null;

            return false;
        }

        window.drawnAt ??= { marshalled: game.marshalled };

        return game.marshalled !== window.drawnAt.marshalled;
    };

    expect(await playUntil(page, drawn, { seconds: 120 })).toBe(true);

    const seen = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const fielded = game.battle.actors.filter(({ id }) => id.startsWith("field-"));
        const crowded = fielded.filter(({ id }) => game.avatars.get(id).constructor.name === "CrowdAvatar");

        game.advance(1 / 30, { render: false });
        session.view.render();

        const batches = [];

        session.view.scene.traverse((node) => node.isInstancedMesh && node.name.startsWith("crowd ") && node.visible && batches.push({ name: node.name, count: node.count }));

        return {
            crowded: crowded.length,
            full: fielded.length - crowded.length,
            kinds: new Set(crowded.map(({ id }) => game.avatars.get(id).key)).size,
            instances: batches.reduce((sum, { count }) => sum + count, 0),
            batches: batches.length,
            soldiers: session.view.quality.soldiers,
        };
    });

    // (The few nearest in full, as many as the quality level draws so (and up to 3 more drawn so
    // already, let go only once they're further: app/game.js MARSHAL), the rest in their kind's crowd)
    expect(seen.full).toBeGreaterThanOrEqual(seen.soldiers.full);
    expect(seen.full).toBeLessThanOrEqual(seen.soldiers.full + 3);
    expect(seen.crowded).toBe(80 - seen.full);

    // (Each kind drawn in one go, or two, near and far: a few dozen instances, those in view, in a
    // handful of draws)
    expect(seen.kinds).toBeGreaterThanOrEqual(3);
    expect(seen.batches).toBeLessThanOrEqual(2 * seen.kinds);
    expect(seen.instances).toBeGreaterThan(20);
    expect(seen.instances).toBeLessThanOrEqual(seen.crowded);

    // (Each soldier of a body at its place in it, its role's arms in its hands: casters, healers and
    // all; each army's line's three bodies, its reserve and its general's household)
    const lines = await page.evaluate(() => {
        const { game } = window.pellagos;
        const fielded = game.battle.actors.filter(({ id }) => id.startsWith("field-"));

        return { lines: Object.keys(window.held).length, roles: [...new Set(fielded.map(({ formation }) => formation?.role))].sort(), casters: fielded.filter(({ casts }) => casts?.length).length, healers: fielded.filter(({ heals }) => heals?.length).length };
    });

    expect(lines).toEqual({ lines: 10, roles: ["archer", "caster", "front", "healer", "heavy"], casters: expect.any(Number), healers: expect.any(Number) });
    expect(lines.casters).toBeGreaterThan(4);
    expect(lines.healers).toBeGreaterThan(4);

    // Let go, the lines march to meet and fight: the fallen of the crowds lie where they fell
    await page.evaluate(() => {
        const { game } = window.pellagos;

        for (const [id, { to, advance }] of Object.entries(window.held)) {
            game.battle.formation(id, { to, advance });
        }

        game.host.fields[0].engagement.next = 0;
    });

    const fallen = () => {
        const { game } = window.pellagos;

        return game.battle.actors.filter(({ id, dead }) => id.startsWith("field-") && dead && game.avatars.get(id)?.constructor.name === "CrowdAvatar").length >= 4;
    };

    expect(await playUntil(page, fallen, { seconds: 90 })).toBe(true);

    const lying = await page.evaluate(() => {
        const { game } = window.pellagos;
        const one = game.battle.actors.find(({ id, dead }) => id.startsWith("field-") && dead && game.avatars.get(id)?.constructor.name === "CrowdAvatar");
        const avatar = game.avatars.get(one.id);
        const { table } = game.crowds.kinds.get(avatar.key).template;
        const [row] = avatar.frameIn(table);

        return { from: table.die.start, to: table.die.start + table.die.frames, row };
    });

    expect(lying.row).toBeGreaterThanOrEqual(lying.from);
    expect(lying.row).toBeLessThan(lying.to);
});

test("soldiers about the player past the bodies the quality's memory can hold in full (fewer than a battle's), the nearest drawn in full and the rest in their crowds, their full bodies let go; the debug log says how many had room", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // (Out of town on open ground, as the field battle's; a budget with room for five soldiers in
    // full beside everyone else held so, where a phone's might be full with a capital's townsfolk)
    const ground = await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const squares = game.world.maps?.town?.squares ?? game.world.squares;
        const open = (x0, y0) => {
            for (let y = y0 - 50; y < y0 + 10; y += 2) {
                for (let x = x0 - 20; x < x0 + 20; x += 2) {
                    if (squares.blocked(x, y) || squares.opaque(x, y)) {
                        return false;
                    }
                }
            }

            return true;
        };

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        for (let r = 60; r < 1500; r += 20) {
            for (let a = 0; a < 24; a++) {
                const [x, y] = [Math.round(me.x + r * Math.cos((a * Math.PI) / 12)), Math.round(me.y + r * Math.sin((a * Math.PI) / 12))];

                if (open(x, y)) {
                    game.host.battle.place(game.me, "town", [x, y], { facing: Math.PI });

                    return [x, y];
                }
            }
        }

        return null;
    });

    expect(ground).not.toBeNull();
    await playUntil(page, () => false, { seconds: 3 });

    const most = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const quality = session.view.quality;
        const others = [...game.avatars.values()].filter((avatar) => avatar.constructor.name !== "CrowdAvatar").length;

        session.view.quality = { ...quality, soldiers: { ...quality.soldiers, full: 2 }, bodies: others + 5 };

        // (Two lines of six: twelve soldiers, fewer than a battle's 24, all drawn in full till now)
        game.fieldBattle(6);
        window.held = {};

        for (const [id, { to, advance }] of Object.entries(game.battle.formations)) {
            window.held[id] = { to, advance };
            game.battle.formation(id, { to: null, advance: false });
        }

        return 5;
    });

    const drawn = () => {
        const { game } = window.pellagos;
        const fielded = game.battle.actors.filter(({ id }) => id.startsWith("field-"));
        const building = [...game.enlisting, ...game.enlistees.keys()].some((id) => game.battle.actor(id)?.kind === "soldier");

        // (And sorted since, as the field battle's: app/game.js #marshal)
        if (!(fielded.length === 12 && fielded.every(({ id }) => game.avatars.has(id)) && !game.crowds?.busy && !building && game.crowdWaiting.size === 0)) {
            window.drawnAt = null;

            return false;
        }

        window.drawnAt ??= { marshalled: game.marshalled };

        return game.marshalled !== window.drawnAt.marshalled;
    };

    expect(await playUntil(page, drawn, { seconds: 150 })).toBe(true);

    const seen = await page.evaluate(() => {
        const { game } = window.pellagos;
        const fielded = game.battle.actors.filter(({ id }) => id.startsWith("field-"));
        const crowd = (id) => game.avatars.get(id)?.constructor.name === "CrowdAvatar";
        // (Every soldier about whom the budget counts: the field's and any of a place nearby)
        const about = game.battle.actors.filter(({ id, kind, dead }) => kind === "soldier" && !dead && game.host.soldiers.has(id) && game.avatars.has(id));

        return { soldiers: fielded.length, crowded: fielded.filter(({ id }) => crowd(id)).length, inFull: about.filter(({ id }) => !crowd(id)).length, logged: game.telemetryState().soldiers };
    });

    // (Room for as many as the budget leaves beside everyone else held in full or to be: five at
    // most, never fewer than the quality's own two; the nearest of them in full (and up to 3 more
    // drawn so already, let go only once they're further: app/game.js MARSHAL), the rest in their
    // kind's crowd, their full bodies let go)
    const { room } = seen.logged;

    expect(seen.soldiers).toBe(12);
    expect(seen.logged.soldiers).toBeGreaterThanOrEqual(12);
    expect(room).toBeGreaterThanOrEqual(2);
    expect(room).toBeLessThanOrEqual(most);
    expect(seen.inFull).toBeLessThanOrEqual(room + 3);
    expect(seen.crowded).toBeGreaterThanOrEqual(12 - room - 3);
});

test("a guard in its crowd stands at ease as one in full does, its sword at its hip and its shield on its back, and draws as one does, the shield off its back first; built in full in its place, it stands as it stood, its crowd's figure fading from sight once the one in full's shown", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // (The town's guards in their crowds: room in full for everyone else but them)
    const id = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const me = game.battle.actor(game.me);
        const guards = game.battle.actors.filter((actor) => actor.kind === "soldier" && actor.id.includes("/guard-") && actor.map === me.map);
        const others = game.battle.actors.filter((actor) => actor.kind !== "soldier" && game.avatars.has(actor.id)).length;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        window.quality = session.view.quality;
        session.view.quality = { ...window.quality, soldiers: { ...window.quality.soldiers, full: 0 }, bodies: others };

        return guards.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0].id;
    });

    await page.evaluate((id) => (window.guard = id), id);
    expect(
        await playUntil(
            page,
            () => {
                const { game } = window.pellagos;
                const avatar = game.avatars.get(window.guard);

                return avatar?.constructor.name === "CrowdAvatar" && game.crowds.made(avatar.key);
            },
            { seconds: 90 },
        ),
    ).toBe(true);

    // How much gold shows of the guard's back (its shield's crown, slung there), seen from behind
    // as it's drawn now: its crowd laid out for that view, and the middle of the picture read
    await page.evaluate(() => {
        window.goldBehind = (id) => {
            const { game, session } = window.pellagos;
            const avatar = game.avatars.get(id);
            const { x, y, z } = avatar.object.position;
            const camera = session.view.camera;

            camera.position.set(x - Math.sin(avatar.facing) * 3, y + 1.5, z - Math.cos(avatar.facing) * 3);
            camera.lookAt(x, y + 1.1, z);
            camera.updateMatrixWorld();
            game.crowds.draw(camera, session.view.pixelsPerMetre());
            session.view.render();

            const gl = session.view.renderer.getContext();
            const [w, h] = [gl.drawingBufferWidth, gl.drawingBufferHeight];
            const box = { x: Math.round(w * 0.4), y: Math.round(h * 0.3), w: Math.round(w * 0.2), h: Math.round(h * 0.45) };
            const pixels = new Uint8Array(box.w * box.h * 4);
            let gold = 0;

            gl.readPixels(box.x, box.y, box.w, box.h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

            for (let k = 0; k < pixels.length; k += 4) {
                gold += pixels[k] > 130 && pixels[k + 1] > 100 && pixels[k + 2] < 90 && pixels[k] - pixels[k + 2] > 80 ? 1 : 0;
            }

            return { gold, move: avatar.moveName, armed: avatar.armed };
        };
    });

    // At ease, in its crowd: standing, its weapon put away, the crown on its back seen from behind
    const atEase = await page.evaluate((id) => window.goldBehind(id), id);

    expect(atEase.move).toBe("stand");
    expect(atEase.armed).toBe(false);

    // Drawing, as the battle has it (fighting, so it keeps it drawn): the draw played, its shield
    // off its back and on its arm, the crown turned away
    await page.evaluate((id) => {
        const { game } = window.pellagos;

        Object.assign(game.battle.actor(id), { armed: true, foughtAt: Infinity });
        game.avatars.get(id).actions.draw("sword", true);
    }, id);
    await playUntil(page, () => false, { seconds: 0.5 });
    expect((await page.evaluate((id) => window.goldBehind(id), id)).move).toBe("draw");
    await playUntil(page, () => false, { seconds: 3 });

    const drawn = await page.evaluate((id) => window.goldBehind(id), id);

    expect(drawn).toMatchObject({ move: "ready", armed: true });
    expect(atEase.gold, `the crown on its back at ease (${atEase.gold} gold pixels), not once it's drawn (${drawn.gold})`).toBeGreaterThan(drawn.gold * 2 + 20);

    // Built in full in its place (the player 7 m back from it the way the camera looks, so it's
    // in view: one in full's pictures are sent, and it's shown, only once it's about to be seen):
    // its weapon in hand as it was; its crowd's figure seen as it was till the one in full's
    // shown, then fading from sight, then gone
    await page.evaluate((id) => {
        const { game, session } = window.pellagos;

        // (The camera where the game has it again, not where it was put to look at the guard)
        game.advance(1 / 30, { render: false });

        const ahead = session.view.camera.getWorldDirection(session.view.camera.position.clone()).setY(0).normalize();
        const guard = game.battle.actor(id);

        game.host.battle.place(game.me, guard.map, [Math.round(guard.x - ahead.x * 7), Math.round(guard.y - ahead.z * 7)], { facing: Math.atan2(ahead.x, ahead.z) });
        session.view.quality = window.quality;
    }, id);

    const handing = await page.evaluate(async (id) => {
        const { game } = window.pellagos;
        const seen = [];

        for (let k = 0; k < 300 && seen.at(-1)?.fading !== false; k++) {
            game.advance(1 / 30, { render: false, wait: true });

            const avatar = game.avatars.get(id);
            const fading = game.fadingOut.find((one) => one.id === id);

            if (avatar && avatar.constructor.name !== "CrowdAvatar") {
                seen.push({ shown: avatar.object.visible, sheathed: avatar.character.sheathed, fading: fading ? fading.crowd.shown : false });
            }

            await new Promise((resolve) => setTimeout(resolve, 15));
        }

        return seen;
    }, id);

    expect(handing.length).toBeGreaterThan(0);
    expect(handing.every(({ sheathed }) => sheathed === false)).toBe(true);
    expect(handing.filter(({ shown }) => !shown).every(({ fading }) => fading === 1), "seen as it was till the one in full's shown").toBe(true);
    expect(handing.some(({ shown, fading }) => shown && fading > 0 && fading < 1), "fading once it's shown").toBe(true);
    expect(handing.at(-1)).toMatchObject({ shown: true, fading: false });
});

test("a crowded fight that comes too slowly (Adaptive): those least seen of the wild's bandits, wolves and spiders stand in their kind's crowd, their bodies kept but unseen; and drawn in full again once there's time to spare", async ({ page }) => {
    test.setTimeout(240000);
    await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ debug: true, sound: false, quality: "low" })));
    await playing(page, "/?play&seed=2");

    // (Out of town, a dozen bandits about the player, holding back, wolves and cave spiders further
    // off, and four hired adventurers by them)
    const ids = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { host, battle, world } = game;
        const me = battle.actor(game.me);
        const [mx, my] = world.stamp.middle;
        const [x0, y0] = [Math.floor(mx - 140), Math.floor(my - 20)];
        const out = [];

        game.stop();
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [x0, y0], { facing: Math.PI });
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        for (let k = 0; k < 12; k++) {
            const id = `throng-${k}`;
            const angle = Math.PI + (k / 12 - 0.5) * 2;
            const r = 9 + (k % 4) * 5;

            host.wild.set(id, { creature: "bandit", tier: 2, pack: `throng-${k}`, camp: null, lair: null, master: false });
            battle.add({ id, kind: "beast", name: "Bandit", weapon: "sword", team: "beasts", square: [Math.floor(x0 + Math.sin(angle) * r), Math.floor(y0 + Math.cos(angle) * r)], ai: "wild", hp: 1e6, speed: 1.2, chase: 2, wild: { creature: "bandit", tier: 2, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: `throng-${k}`, leader: null, menace: false } });
            out.push(id);
        }

        for (const [k, creature] of ["wolf", "wolf", "wolf", "wolf", "caveSpider", "caveSpider"].entries()) {
            const id = `throng-beast-${k}`;
            const angle = Math.PI + (k / 6 - 0.5) * 2;
            const r = 26 + (k % 2) * 4;

            host.wild.set(id, { creature, tier: 2, pack: id, camp: null, lair: null, master: false });
            battle.add({ id, kind: "beast", name: creature, weapon: creature, team: "beasts", square: [Math.floor(x0 + Math.sin(angle) * r), Math.floor(y0 + Math.cos(angle) * r)], ai: "wild", hp: 1e6, speed: 1.2, chase: 2, wild: { creature, tier: 2, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: id, leader: null, menace: false } });
            out.push(id);
        }

        for (let k = 0; k < 4; k++) {
            const id = `throng-hired-${k}`;

            host.followers.set(id, { leader: game.me, name: `Hired ${k}`, calling: "warrior", sex: k % 2 ? "f" : "m", seed: k + 1, people: "human", from: null, waiting: false });
            battle.add({ id, kind: "follower", name: `Hired ${k}`, weapon: "sword", team: me.team, square: [x0 + k - 2, y0 + 2], map: "town", ai: "follow", leader: game.me, role: "guard", hp: 1e6, maxHp: 1e6 });
            out.push(id);
        }

        game.enlisting.push(...out);

        return out;
    });

    expect(await playUntil(page, () => [...window.pellagos.game.battle.actors].filter(({ id }) => id.startsWith("throng-")).every(({ id }) => window.pellagos.game.avatars.has(id)), { seconds: 60 })).toBe(true);

    // Told it's too slow with them all drawn (as app/throng.js would be: its own judging is its
    // tests'), six of them left in full: the rest, once their kind's figure's made, stand in
    await page.evaluate(() => {
        const { game, session } = window.pellagos;

        session.view.adaptive = true;
        game.throng.observe = () => null;
        game.throng.full = 6;
    });

    expect(await playUntil(page, () => [...window.pellagos.game.thronged.keys()].filter((id) => id.startsWith("throng-beast")).length >= 4 && !window.pellagos.game.crowds?.busy, { seconds: 90 })).toBe(true);

    const standing = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.advance(1 / 30, { render: true });

        const entries = [...game.thronged];

        return {
            count: entries.length,
            wild: entries.every(([id]) => id.startsWith("throng-") && !id.startsWith("throng-hired")),
            // (Beasts too, each in its kind's crowd, as big as it is)
            beasts: entries.filter(([id, { standIn }]) => id.startsWith("throng-beast") && standIn.key.startsWith("herd:") && Math.abs(standIn.character.height - game.avatars.get(id).character.height) < 0.01).length,
            // (Still the game's own avatar, posed no more, all of it unseen)
            kept: entries.every(([id, { avatar }]) => game.avatars.get(id) === avatar && avatar.every === Infinity),
            unseen: entries.every(([, { avatar }]) => {
                let all = true;

                avatar.object.traverse((node) => (all &&= !node.isMesh || (node.layers.isEnabled(31) && !node.layers.isEnabled(0))));

                return all;
            }),
            // (Its stand-in in its crowd, where it is)
            placed: entries.every(([, { avatar, standIn }]) => game.crowds.members.has(standIn) && standIn.object.position.distanceTo(avatar.object.position) < 0.01),
            counted: game.stats.bodies.standing,
        };
    });

    expect(standing).toMatchObject({ wild: true, kept: true, unseen: true, placed: true });
    expect(standing.beasts).toBeGreaterThanOrEqual(4);
    expect(standing.counted).toBe(standing.count);
    await expect(page.locator("#debugbody")).toContainText(`(${standing.count} standing in)`);

    // Time to spare: all drawn in full again, as they were
    await page.evaluate(() => {
        window.pellagos.game.throng.full = Infinity;
    });
    expect(await playUntil(page, () => window.pellagos.game.thronged.size === 0, { seconds: 5 })).toBe(true);

    // (Any stand-in still in its crowd fading from sight, one for each, seen as it was only while
    // its body's not been shown: app/game.js #fading. A body's pictures are sent as it comes into
    // the camera's view: #sending)
    const fading = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { CROWD } = await import("/js/world/crowd.js");
        const ids = game.fadingOut.map(({ id }) => id);

        return {
            fading: [...game.crowds.members].filter(({ standIn }) => standIn).every((standIn) => game.fadingOut.some(({ crowd }) => crowd === standIn)),
            once: new Set(ids).size === ids.length,
            waiting: game.fadingOut.every(({ avatar, left }) => left < CROWD.fade || avatar.compiling || avatar.sent === false),
        };
    });

    expect(fading).toEqual({ fading: true, once: true, waiting: true });

    // (Their bodies shown, as they would be come into view: gone a moment after)
    await page.evaluate(() => {
        const { game } = window.pellagos;

        for (const { avatar } of game.fadingOut.filter(({ avatar }) => avatar.sent === false)) {
            game.view.upload([avatar.object], { hidden: true });
            avatar.sent = true;
        }
    });
    expect(await playUntil(page, () => window.pellagos.game.fadingOut.length === 0, { seconds: 2 })).toBe(true);

    const back = await page.evaluate((ids) => {
        const { game } = window.pellagos;
        let seen = true;

        for (const id of ids) {
            game.avatars.get(id).object.traverse((node) => (seen &&= !node.isMesh || node.layers.isEnabled(0)));
        }

        return { seen, standing: [...game.crowds.members].filter(({ standIn }) => standIn).length, posed: ids.every((id) => game.avatars.get(id).every !== Infinity) };
    }, ids);

    expect(back).toEqual({ seen: true, standing: 0, posed: true });
});

test("past 45 metres from the camera, a bandit's drawn in its kind's crowd however quick the frames, its body kept unseen; come near, in full again", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // (Adaptive off: all drawn in full but for the reach. Out in the open west of the start town,
    // facing north, a bandit 8 metres ahead and one 70 or more, neither of them set on a fight)
    const ids = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { host, battle, world } = game;
        const [mx, my] = world.stamp.middle;
        const [x0, y0] = [Math.floor(mx - 140), Math.floor(my - 20)];
        const squares = world.maps?.town?.squares ?? world.squares;
        const add = (id, square) => {
            host.wild.set(id, { creature: "bandit", tier: 2, pack: id, camp: null, lair: null, master: false });
            battle.add({ id, kind: "beast", name: "Bandit", weapon: "sword", team: "beasts", square, ai: "wild", hp: 1e6, speed: 1.2, chase: 2, wild: { creature: "bandit", tier: 2, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: id, leader: null, menace: false } });
        };
        let far = 70;

        while (far < 110 && (squares.blocked(x0, y0 - far) || squares.opaque(x0, y0 - far))) {
            far += 2;
        }

        game.stop();
        session.view.adaptive = false;
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [x0, y0], { facing: Math.PI });
        add("reach-near", [x0 + 2, y0 - 8]);
        add("reach-far", [x0, y0 - far]);
        game.enlisting.push("reach-near", "reach-far");

        return ["reach-near", "reach-far"];
    });

    expect(await playUntil(page, () => ["reach-near", "reach-far"].every((id) => window.pellagos.game.avatars.has(id)), { seconds: 60 })).toBe(true);
    expect(await playUntil(page, () => window.pellagos.game.thronged.has("reach-far") && !window.pellagos.game.crowds?.busy, { seconds: 90 })).toBe(true);

    const apart = await page.evaluate(([near, far]) => {
        const { game } = window.pellagos;
        const away = (id) => game.view.camera.position.distanceTo(game.avatars.get(id).object.position);
        const { avatar, standIn } = game.thronged.get(far);

        return {
            near: { away: away(near), thronged: game.thronged.has(near) },
            far: { away: away(far), kept: game.avatars.get(far) === avatar, unposed: avatar.every === Infinity, crowded: game.crowds.members.has(standIn) && standIn.key.startsWith("wild:bandit") },
            full: game.throng.full,
        };
    }, ids);

    expect(apart.near.away).toBeLessThan(45);
    expect(apart.near.thronged).toBe(false);
    expect(apart.far.away).toBeGreaterThan(45);
    expect(apart.far).toMatchObject({ kept: true, unposed: true, crowded: true });

    // Come near: drawn in full again, its stand-in gone
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.host.battle.place("reach-far", "town", [Math.floor(me.x) - 2, Math.floor(me.y) - 6]);
    });

    expect(await playUntil(page, () => !window.pellagos.game.thronged.has("reach-far"), { seconds: 10 })).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.avatars.get("reach-far").every !== Infinity)).toBe(true);
});

test("a beast's look is let go of three minutes after the last of it's drawn: its body off the graphics card, and sculpted again when another comes", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // A wolf out in the open west of the start town, 8 metres ahead of the player facing north,
    // not set on a fight
    const add = (id) =>
        page.evaluate((id) => {
            const { game } = window.pellagos;
            const { host, battle } = game;
            const me = battle.actor(game.me);
            const square = [Math.floor(me.x) + 2, Math.floor(me.y) - 8];

            host.wild.set(id, { creature: "wolf", tier: 2, pack: id, camp: null, lair: null, master: false });
            battle.add({ id, kind: "beast", name: "Wolf", weapon: "wolf", team: "beasts", square, ai: "wild", hp: 1e6, speed: 1.4, chase: 2, wild: { creature: "wolf", tier: 2, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: id, leader: null, menace: false } });
            game.enlisting.push(id);
        }, id);

    await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { world, host, battle } = game;
        const [mx, my] = world.stamp.middle;

        game.stop();
        session.view.adaptive = false;
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [Math.floor(mx - 140), Math.floor(my - 20)], { facing: Math.PI });
    });
    await add("forget-wolf");
    // (Shown, not just there: a new avatar's hidden till its shaders are ready and its pictures
    // sent, and one hidden isn't drawn, nor its body put on the graphics card)
    expect(
        await playUntil(
            page,
            () => {
                const wolf = window.pellagos.game.avatars.get("forget-wolf");

                return Boolean(wolf?.object.visible && !wolf.compiling && wolf.sent !== false);
            },
            { seconds: 60 },
        ),
    ).toBe(true);

    // Drawn: its look's body and folded pieces on the graphics card, held by it
    const drawn = await page.evaluate(async () => {
        const { kept } = await import("/js/beasts/sculpt.js");
        const { game, session } = window.pellagos;
        const wolf = game.avatars.get("forget-wolf");
        const shared = [];

        wolf.object.traverse((node) => node.isSkinnedMesh && !shared.includes(node.geometry) && shared.push(node.geometry));

        for (const geometry of shared) {
            geometry.addEventListener("dispose", () => (geometry.userData.gone = true));
        }

        session.view.render();
        window.forgotten = { shared, body: wolf.body };

        return { body: wolf.body, shared: shared.length, kept: kept(), geometries: session.view.renderer.info.memory.geometries };
    });

    expect(drawn.body).toMatch(/^wolf:[012]$/);
    expect(drawn.shared).toBeGreaterThanOrEqual(2);
    expect(drawn.kept.looks).toBeGreaterThan(0);

    // Gone from the battle, as the host lets one go that's wandered off (its "gone"): let go of by
    // the game, its look kept, none drawn on it, through the game's own sweeps (every five
    // seconds) for as long as it's played on here
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const advance = game.host.advance.bind(game.host);

        game.host.advance = (ms) => {
            const events = advance(ms);

            game.host.advance = advance;
            game.host.wild.delete("forget-wolf");
            game.host.battle.remove("forget-wolf");

            return [...events, { type: "gone", id: "forget-wolf" }];
        };
    });
    expect(await playUntil(page, () => !window.pellagos.game.avatars.has("forget-wolf"), { seconds: 10 })).toBe(true);
    await playUntil(page, () => false, { seconds: 12 });

    const kept = await page.evaluate(async () => {
        const { kept } = await import("/js/beasts/sculpt.js");

        return { kept: kept(), gone: window.forgotten.shared.some((geometry) => geometry.userData.gone) };
    });

    expect(kept.gone).toBe(false);
    expect(kept.kept.unheld).toBeGreaterThanOrEqual(1);

    // Three minutes on: let go of, off the graphics card
    const forgotten = await page.evaluate(async () => {
        const { forget, kept, LINGER } = await import("/js/beasts/sculpt.js");
        const { session } = window.pellagos;
        const before = session.view.renderer.info.memory.geometries;

        forget(performance.now() + LINGER + 1000);

        return { kept: kept(), gone: window.forgotten.shared.every((geometry) => geometry.userData.gone), fewer: before - session.view.renderer.info.memory.geometries };
    });

    expect(forgotten.gone).toBe(true);
    expect(forgotten.kept.looks).toBeLessThan(kept.kept.looks);
    expect(forgotten.fewer).toBeGreaterThanOrEqual(drawn.shared);

    // Another of it comes: sculpted again, drawn on bodies of its own
    await add("forget-wolf");
    expect(await playUntil(page, () => window.pellagos.game.avatars.has("forget-wolf"), { seconds: 60 })).toBe(true);

    const again = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const wolf = game.avatars.get("forget-wolf");
        const shared = [];

        wolf.object.traverse((node) => node.isSkinnedMesh && shared.push(node.geometry));
        session.view.render();

        return { body: wolf.body, fresh: shared.every((geometry) => !window.forgotten.shared.includes(geometry) && geometry.attributes.position.count > 0) };
    });

    expect(again).toEqual({ body: drawn.body, fresh: true });
});

test("a Dreadthorn drawn with its stand-in is drawn again from its model once that's read, out of view", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // A Dreadthorn 25 metres behind the player, out of view, not set on a fight; its model kept
    // from being downloaded till its stand-in's drawn
    await page.evaluate(async () => {
        const { game, session, fetcher } = window.pellagos;
        const { world, host, battle } = game;
        const { CREATURES, traitsOf } = await import("/js/core/creatures.js");
        const [mx, my] = world.stamp.middle;
        const { name, hp, weapon, speed, chase } = CREATURES.dreadthorn;

        game.stop();
        session.view.adaptive = false;
        fetcher.hold("the stand-in first");
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [Math.floor(mx - 140), Math.floor(my - 20)], { facing: Math.PI });

        const me = battle.actor(game.me);

        host.wild.set("dread", { creature: "dreadthorn", tier: 10, pack: "dread", camp: null, lair: null, master: false });
        battle.add({ id: "dread", kind: "beast", name, weapon, team: "beasts", square: [Math.floor(me.x), Math.floor(me.y) + 25], ai: "wild", hp, speed, chase, wild: { creature: "dreadthorn", tier: 10, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: "dread", leader: null, menace: false, unique: true, ...traitsOf("dreadthorn") } });
        game.enlisting.push("dread");
    });

    expect(await playUntil(page, () => window.pellagos.game.avatars.has("dread"), { seconds: 30 })).toBe(true);
    expect(await page.evaluate(() => window.pellagos.game.avatars.get("dread").model)).toBe(false);

    // Its model downloaded and read: its stand-in let go of, and it drawn again from the model
    await page.evaluate(() => window.pellagos.fetcher.release("the stand-in first"));
    expect(await playUntil(page, () => window.pellagos.game.avatars.get("dread")?.model === true, { seconds: 90 })).toBe(true);
});

test("a werewolf met out in the wild by night: drawn from its model in a skin of its own, clawing and springing at the player, flushed red when struck, falling dead as its model falls, its spoils left", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // Midnight, and a werewolf 6 metres from the player out in the open west of the start town,
    // where they can see each other, set on them, the player set on it with a sword. Its model
    // read first, as the game asks for it where one may be met by night (beasts/model.js
    // modelsMet: test/model.test.js)
    await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { world, host, battle } = game;
        const { CREATURES, traitsOf } = await import("/js/core/creatures.js");
        const { wantModel } = await import("/js/beasts/model.js");
        const [mx, my] = world.stamp.middle;
        const { name, hp, weapon, speed, chase } = CREATURES.werewolf;

        game.stop();
        session.view.adaptive = false;
        Object.assign(host.war, { turn: 41, clock: 30000 });
        await wantModel("werewolf", "now");
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [Math.floor(mx - 140), Math.floor(my - 20)], { facing: Math.PI });

        const me = battle.actor(game.me);

        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        host.wild.set("were", { creature: "werewolf", tier: 6, pack: "were", camp: null, lair: null, master: false });
        battle.add({ id: "were", kind: "beast", name, weapon, team: "beasts", square: [Math.floor(me.x), Math.floor(me.y) - 6], ai: "wild", hp: hp * 40, speed, chase, wild: { creature: "werewolf", tier: 6, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: "were", leader: null, menace: true, unique: false, ...traitsOf("werewolf") } });

        const were = battle.actor("were");

        for (const [dx, dy] of [[0, -6], [6, 0], [-6, 0], [0, 6], [4, -4], [-4, 4]]) {
            host.battle.place("were", "town", [Math.floor(me.x) + dx, Math.floor(me.y) + dy]);

            if (battle.canSee(me, were, 8)) {
                break;
            }
        }

        were.spawn = [...were.square];
        game.enlisting.push("were");
        host.command(game.me, { type: "engage", target: "were" });
    });

    // Drawn from its model, in one of its skins; then, fighting, each of its ways of attacking
    // played from its model's clips, and a flush of red on it as the player's blows land
    expect(await playUntil(page, () => window.pellagos.game.avatars.get("were")?.model === true, { seconds: 30 })).toBe(true);

    const seen = () => {
        const { MODELS } = window.pellagosModels ?? {};
        const avatar = window.pellagos.game.avatars.get("were");
        const fight = (window.fight ??= { styles: [], flushed: 0, skin: avatar.plan.skin, skins: MODELS?.werewolf.skins ?? null });
        const style = avatar.doing.attack?.style;

        if (style && !fight.styles.includes(style)) {
            fight.styles.push(style);
        }

        fight.flushed = Math.max(fight.flushed, avatar.flush.emissive.r);

        return fight.styles.length === 2 && fight.flushed > 0.1;
    };

    await page.evaluate(async () => {
        window.pellagosModels = await import("/js/beasts/model.js");
    });
    expect(await playUntil(page, seen, { seconds: 90 })).toBe(true);

    const fight = await page.evaluate(() => window.fight);

    expect(fight.styles.sort()).toEqual(["claw", "pounce"]);
    expect(fight.skins).toContain(fight.skin);

    // Slain: its model's fall played and held, and its spoils left for the player
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.host.battle.afflict("were", "poison", { by: game.me, damage: 1e7 });
    });

    expect(await playUntil(page, () => {
        const { game } = window.pellagos;
        const avatar = game.avatars.get("were");

        return Boolean(avatar?.doing.dead) && [...game.host.ground.values()].some((dropped) => dropped.from === "werewolf");
    }, { seconds: 30 })).toBe(true);

    const fallen = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const avatar = game.avatars.get("were");
        const dropped = [...game.host.ground.values()].find((one) => one.from === "werewolf");

        game.advance(1 / 30, { render: true });

        return { model: avatar.model, dead: avatar.doing.dead.t > 0, items: dropped.bundle.items.map(({ id }) => id), gold: dropped.bundle.gold, for: dropped.for === game.me, error: session.view.renderer.getContext().getError() };
    });

    expect(fallen).toMatchObject({ model: true, dead: true, for: true, error: 0 });
    // (Its purse's gold, and of what it leaves only its pelt and claws: it has no hands to carry more)
    expect(fallen.gold).toBeGreaterThanOrEqual(4);
    expect(fallen.items.every((id) => ["werewolfPelt", "werewolfClaw"].includes(id))).toBe(true);
});

test("a werewolves' den neared: the Moonfang's model and its werewolves' (one file, read once, each in their skins) read before they're met", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // The player put a kilometre from a den, out of reach of it (its master and guards out only
    // within 100 metres), at noon: no werewolf's about in the wild by day (beasts/model.js
    // modelsMet), only the den's
    const den = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { world, host } = game;
        const { elapsedOf } = await import("/js/core/daytime.js");
        const { torchesLit } = await import("/js/core/light.js");
        const model = await import("/js/beasts/model.js");
        const site = world.plan.sites.find((one) => one.kind === "werewolf's den");
        const angle = Math.atan2(world.start.at[1] - site.at[1], world.start.at[0] - site.at[0]);

        window.modelOf = model.modelOf;
        game.stop();
        session.view.adaptive = false;
        Object.assign(host.war, { turn: 70, clock: 30000 });
        host.battle.place(game.me, "town", [Math.floor(site.at[0] + Math.cos(angle) * 1000), Math.floor(site.at[1] + Math.sin(angle) * 1000)]);

        return { id: site.id, dark: torchesLit(elapsedOf(host.war)), before: [Boolean(model.modelOf("moonfang")), Boolean(model.modelOf("werewolf"))] };
    });

    expect(den.dark).toBe(false);
    expect(den.before).toEqual([false, false]);
    expect(await playUntil(page, () => Boolean(window.modelOf("moonfang") && window.modelOf("werewolf")), { seconds: 60 })).toBe(true);

    const read = await page.evaluate(async (id) => {
        const { keptModels } = await import("/js/beasts/model.js");
        const gltf = window.modelOf("moonfang");

        return { same: gltf === window.modelOf("werewolf"), skins: Object.keys(gltf.skins).sort(), kept: keptModels().models, out: window.pellagos.game.host.lairs.has(id) };
    }, den.id);

    expect(read).toEqual({ same: true, skins: ["ash", "dusk", "moonfang", "russet"], kept: 1, out: false });
});

test("out in the woods far from home by night, where werewolves are met: the werewolf's model read before one is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // Midnight, and the player put in the woods out in the wild, five tiers or more from home,
    // where a werewolf may be met (beasts/model.js modelsMet)
    const woods = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { world, host } = game;
        const model = await import("/js/beasts/model.js");
        const home = world.start.at;
        let at = null;

        for (let far = 3000; far < 7000 && !at; far += 250) {
            for (let a = 0; a < Math.PI * 2 && !at; a += 0.3) {
                const spot = [Math.round(home[0] + Math.cos(a) * far), Math.round(home[1] + Math.sin(a) * far)];

                at = model.modelsMet(world.plan, spot, home, true).includes("werewolf") ? spot : null;
            }
        }

        window.modelOf = model.modelOf;
        game.stop();
        session.view.adaptive = false;
        Object.assign(host.war, { turn: 41, clock: 30000 });
        host.battle.place(game.me, "town", at);

        return { at, before: Boolean(model.modelOf("werewolf")) };
    });

    expect(woods.at).not.toBeNull();
    expect(woods.before).toBe(false);

    // (Read, and no werewolf come yet to be drawn: asked for where it's met, not as it comes; in a
    // minute's play, as a player plays it, as the downloader keeps to a rate in real time)
    const read = () => {
        const { game } = window.pellagos;

        window.met ||= [...game.host.wild].some(([id, one]) => one.creature === "werewolf" && game.avatars.has(id));

        return Boolean(window.modelOf("werewolf"));
    };

    expect(await playUntil(page, read, { seconds: 60, realTime: true })).toBe(true);
    expect(await page.evaluate(() => window.met)).toBe(false);
});

test("a Dreadthorn badly hurt takes to the air: drawn hanging up there, out of reach of the player's blade, the player told; down again after", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=1");

    // A Dreadthorn out in the open west of the start town, 6 metres from the player where they
    // can see each other, badly hurt and set on them, the player set on it with a sword
    await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { world, host, battle } = game;
        const { CREATURES, traitsOf } = await import("/js/core/creatures.js");
        const [mx, my] = world.stamp.middle;
        const { name, hp, weapon, speed, chase } = CREATURES.dreadthorn;

        game.stop();
        session.view.adaptive = false;
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [Math.floor(mx - 140), Math.floor(my - 20)], { facing: Math.PI });

        const me = battle.actor(game.me);

        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        host.wild.set("dread", { creature: "dreadthorn", tier: 10, pack: "dread", camp: null, lair: null, master: false });
        battle.add({ id: "dread", kind: "beast", name, weapon, team: "beasts", square: [Math.floor(me.x), Math.floor(me.y) - 6], ai: "wild", hp, speed, chase, armor: 0.35, wild: { creature: "dreadthorn", tier: 10, temper: "aggressive", guard: 0, roam: 0, leash: 40, pack: "dread", leader: null, menace: true, unique: true, ...traitsOf("dreadthorn") } });

        const dread = battle.actor("dread");

        for (const [dx, dy] of [[0, -6], [6, 0], [-6, 0], [0, 6], [4, -4], [-4, 4]]) {
            host.battle.place("dread", "town", [Math.floor(me.x) + dx, Math.floor(me.y) + dy]);

            if (battle.canSee(me, dread, 8)) {
                break;
            }
        }

        dread.spawn = [...dread.square];
        dread.hp = Math.floor(hp * 0.3);
        game.enlisting.push("dread");
        host.command(game.me, { type: "engage", target: "dread" });

        const message = game.hud.message.bind(game.hud);

        window.said = [];
        game.hud.message = (text, seconds) => {
            window.said.push(text);
            message(text, seconds);
        };
    });

    // Up: drawn hanging above the ground, as high as it goes, its wings beating
    const up = () => {
        const { game } = window.pellagos;
        const dread = game.battle.actor("dread");
        const avatar = game.avatars.get("dread");

        return Boolean(dread?.aloft && avatar && game.battle.time > dread.aloft.from + 3000 && avatar.object.position.y - avatar.ground > 6);
    };

    expect(await playUntil(page, up, { seconds: 60 })).toBe(true);

    const there = await page.evaluate(() => {
        return { said: window.said.filter((text) => text.includes("takes to the air")) };
    });

    expect(there.said).toEqual(["The Dreadthorn takes to the air, out of reach of blows!"]);

    // Down again once it's landed, on the ground (drawn again first, if it was let go of to be
    // drawn from its model meanwhile: beasts/model.js)
    const down = () => {
        const { game } = window.pellagos;
        const dread = game.battle.actor("dread");
        const avatar = game.avatars.get("dread");

        return Boolean(avatar) && !dread.aloft && dread.hoverAt > 0 && avatar.object.position.y - avatar.ground < 0.2;
    };

    expect(await playUntil(page, down, { seconds: 30 })).toBe(true);

    // (And in reach of the player's blade again)
    await page.evaluate(() => (window.hpDown = window.pellagos.game.battle.actor("dread").hp));
    expect(await playUntil(page, () => window.pellagos.game.battle.actor("dread").hp < window.hpDown, { seconds: 20 })).toBe(true);
});

test("the wild's people-shaped creatures past the bodies' budget are drawn in their kind's crowd, their bodies let go; one that sets on the player is built in full", async ({ page }) => {
    test.setTimeout(300000);
    await playing(page, "/?play&seed=1");

    // Forty-eight goblins in rings 6 to 39 metres round the player west of the start town, leaving
    // everyone be: more than the quality's bodies' budget (QUALITY bodies)
    const many = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const { world, host, battle } = game;
        const { CREATURES } = await import("/js/core/creatures.js");
        const [mx, my] = world.stamp.middle;
        const { name, hp, weapon, speed, chase } = CREATURES.goblin;

        game.stop();
        session.view.adaptive = false;
        Object.assign(battle.actor("orc"), { dead: true, respawnAt: Infinity });
        host.battle.place(game.me, "town", [Math.floor(mx - 140), Math.floor(my - 20)], { facing: Math.PI });

        const me = battle.actor(game.me);

        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        for (let k = 0; k < 48; k++) {
            const id = `ration-${k}`;
            const [angle, reach] = [k * 2.4, 6 + (k % 12) * 3];

            host.wild.set(id, { creature: "goblin", tier: 3, pack: id, camp: null, lair: null, master: false });
            battle.add({ id, kind: "beast", name, weapon, team: "beasts", square: [Math.floor(me.x + Math.cos(angle) * reach), Math.floor(me.y + Math.sin(angle) * reach)], ai: "wild", hp: hp * 100, speed, chase, wild: { creature: "goblin", tier: 3, temper: "defensive", guard: 0, roam: 0, leash: 2, pack: id, leader: null, menace: false } });
            game.enlisting.push(id);
        }

        const { CrowdAvatar } = await import("/js/world/crowd.js");

        window.ration = () => {
            const ids = Array.from({ length: 48 }, (each, k) => `ration-${k}`);
            const crowded = ids.filter((id) => game.avatars.get(id) instanceof CrowdAvatar);
            const full = ids.filter((id) => game.avatars.has(id) && !crowded.includes(id));

            return { full: full.length, crowded: crowded.length, room: game.rationed?.room ?? null, budget: game.view.quality.bodies, crowdedIds: crowded };
        };

        return game.view.quality.bodies;
    });

    // All of them drawn: as many in full as there's room for (and a few more, only just past it),
    // the rest in their crowd
    const settled = () => {
        const { full, crowded, room } = window.ration();

        return room !== null && full + crowded === 48 && full <= room + 3 && crowded > 0;
    };

    expect(await playUntil(page, settled, { seconds: 120 })).toBe(true);

    const ration = await page.evaluate(() => window.ration());

    expect(ration.full).toBeLessThanOrEqual(many);
    expect(ration.crowded).toBeGreaterThanOrEqual(48 - many);

    // (The debug log says how many there were, and how many had room)
    const told = await page.evaluate(() => window.pellagos.game.telemetryState().creatures);

    expect(told.rationed).toBeGreaterThanOrEqual(48);
    expect(told.room).toBe(ration.room);

    // One in its crowd come near the player and set on them: built in full, its crowd's figure
    // let go
    await page.evaluate((id) => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        window.setOn = id;
        game.host.battle.place(id, "town", [Math.floor(me.x) + 3, Math.floor(me.y)]);
        Object.assign(game.battle.actor(id).wild, { temper: "aggressive", leash: 60 });
    }, ration.crowdedIds[0]);

    const inFull = () => {
        const { game } = window.pellagos;

        return game.battle.actor(window.setOn).target === game.me && game.avatars.has(window.setOn) && !window.ration().crowdedIds.includes(window.setOn);
    };

    expect(await playUntil(page, inFull, { seconds: 60 })).toBe(true);
});

test("the Behemoth of the Rift called up out in the open: drawn from its model at once, its bar across the top; its atomic breath raked over the player, thrown limp", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(240000);
    await playing(page, "/?play&seed=5");

    // (Out in an open field, the lone orc out of the way: the debug overlay's call-up, 70 m off
    // the way they face)
    const called = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const { squaresOf } = await import("./js/core/grid.js");
        const squares = squaresOf(game.host.world.maps.town);
        const me = game.battle.actor(game.me);
        const open = ([cx, cy]) => [...Array(21).keys()].every((j) => [...Array(21).keys()].every((i) => !squares.blocked(cx - 30 + i * 3, cy - 30 + j * 3)));
        let spot = null;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        for (let far = 120; far <= 400 && !spot; far += 20) {
            for (let k = 0; k < 16 && !spot; k++) {
                const at = [Math.floor(me.x + Math.sin((k / 16) * Math.PI * 2) * far), Math.floor(me.y + Math.cos((k / 16) * Math.PI * 2) * far)];

                spot = open(at) ? at : null;
            }
        }

        game.host.battle.place(game.me, "town", spot);
        me.facing = 0;
        me.hp = me.maxHp = 5000;

        return game.host.command(game.me, { type: "rift" }).ok && game.battle.actors.some((actor) => actor.ai === "colossus");
    });

    expect(called).toBe(true);
    expect(await playUntil(page, () => Boolean(window.pellagos.game.avatars.get(window.pellagos.game.battle.actors.find((actor) => actor.ai === "colossus").id)?.model), { seconds: 120, realTime: true })).toBe(true);
    await expect(page.locator("#bossbar .name")).toHaveText("Behemoth of the Rift");

    // (Before it, the way they face, where its breath lands, alone, a few metres into its sweep,
    // so it's well alight as it gets to them: it breathes on them as it would on three. Its beam's
    // drawn though its body's off the top of the screen, as the camera looks down on them)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const kaiju = game.battle.actors.find((actor) => actor.ai === "colossus");

        game.host.battle.place(kaiju.id, "town", [Math.floor(me.x), Math.floor(me.y + 34)]);
        Object.assign(kaiju, { facing: Math.PI, moveAt: {}, readyAt: 0, rethinkAt: 0 });
        kaiju.wild.colossus.breath.crowd = 1;
    });
    expect(await playUntil(page, () => window.pellagos.game.avatars.get(window.pellagos.game.me).thrown, { seconds: 20 })).toBe(true);

    const breathed = await page.evaluate(() => {
        const { game } = window.pellagos;
        const kaiju = game.battle.actors.find((actor) => actor.ai === "colossus");

        return { attack: kaiju.attack?.attack.id ?? null, beam: game.avatars.get(kaiju.id).plan.beam.state, hp: game.battle.actor(game.me).hp };
    });

    expect(breathed.attack).toBe("atomicBreath");
    expect(breathed.beam.firing).toBe(true);
    expect(breathed.hp).toBeLessThan(5000);
});

test("the Behemoth of the Rift against the town: its roar heard twice where it comes out, the call told, the town's whole strength out to meet it, the townsfolk running indoors, their doors heard, the crier staying out; its bar across the top as it nears; wounded by the player and slain, the town thanks them for their share of it, and the townsfolk come out again", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // (The lone orc out of the way; every voice raised heard; as small an invasion as comes)
    await page.evaluate((least) => {
        const { game } = window.pellagos;
        const voice = game.sound.voice.bind(game.sound);
        const play = game.sound.play.bind(game.sound);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        window.voices = [];
        window.doors = [];
        game.sound.voice = (creature, what, at, options = {}) => {
            window.voices.push([creature, what, options.delay ?? 0, Boolean(at), options.far ?? null]);

            return voice(creature, what, at, options);
        };
        game.sound.play = (name, options = {}) => {
            if (name === "door") {
                window.doors.push(Boolean(options.at));
            }

            return play(name, options);
        };
        game.advance(0.1, { render: false });
        game.host.command(game.me, { type: "budget", invasion: least });
        game.invade("behemoth");
    }, SIZE.least);
    expect(await playUntil(page, () => window.pellagos.game.host.invasions.length > 0 && window.pellagos.game.messages.some(({ text }) => /Behemoth/.test(text)))).toBe(true);

    const coming = await page.evaluate(() => {
        const { game } = window.pellagos;
        const [invasion] = game.host.invasions;

        return { band: invasion.band, defenders: invasion.defenders.length, invaders: invasion.invaders.length, roars: window.voices.filter(([creature, what]) => creature === "kaiju" && what === "call"), told: game.messages.map(({ text }) => text).find((text) => / comes on the /.test(text)) ?? null };
    });

    // (Its soldiers, and its siege engines rolled out behind them)
    const sides = behemothSides(SIZE.least);

    expect(coming).toMatchObject({ band: "behemoth", defenders: sides.defenders + Object.values(sides.engines).reduce((all, each) => all + each, 0), invaders: 1 });
    expect(coming.roars).toHaveLength(2);
    expect(coming.roars.every(([, , , at, far]) => at && far > 300)).toBe(true);
    expect(coming.told).toMatch(/^The Behemoth of the Rift comes on the [a-z-]+ road! .+ calls every able hand to its defence\./);

    // (The townsfolk running indoors, a door heard as each goes in, off the streets; the crier
    // staying out, crying it)
    expect(await playUntil(page, () => [...window.pellagos.game.host.folk.values()].filter(({ role }) => role === "townsfolk").every(({ indoors }) => indoors), { seconds: 45 })).toBe(true);

    const sheltered = await page.evaluate(() => {
        const { game } = window.pellagos;
        const folk = [...game.host.folk.values()].filter(({ role }) => role === "townsfolk").map(({ id }) => id);
        const crier = [...game.host.folk.values()].find(({ role }) => role === "crier");

        return { folk: folk.length, drawn: folk.filter((id) => game.avatars.has(id)).length, doors: window.doors.filter(Boolean).length, crier: Boolean(crier && game.battle.actor(crier.id)) };
    });

    expect(sheltered.folk).toBeGreaterThan(0);
    expect(sheltered).toMatchObject({ drawn: 0, doors: sheltered.folk, crier: true });

    // (Brought nearer: its bar across the top)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const [invasion] = game.host.invasions;
        const me = game.battle.actor(game.me);

        game.host.battle.place(invasion.beast, "town", [Math.floor(me.x), Math.floor(me.y - 60)]);
    });
    expect(await playUntil(page, () => document.querySelector("#bossbar .name")?.textContent === "Behemoth of the Rift", { seconds: 10 })).toBe(true);

    // The player at it, up against its body, landing a few blows; then it's slain
    const dealt = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const [invasion] = game.host.invasions;
        const me = game.battle.actor(game.me);
        const beast = game.battle.actor(invasion.beast);
        const [x0, y0] = beast.footprint;

        me.hp = me.maxHp = 1e6;
        game.host.battle.place(game.me, "town", [x0 - 1, y0 + 2]);
        game.host.command(game.me, { type: "engage", target: beast.id });

        for (let k = 0; k < 600 && !(invasion.dealt[game.me] >= 30); k++) {
            game.advance(1 / 30, { render: false, wait: true });

            if (k % 30 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        Object.assign(beast, { hp: 0, dead: true, respawnAt: Infinity });

        return invasion.dealt[game.me] ?? 0;
    });

    expect(dealt).toBeGreaterThanOrEqual(30);
    expect(await playUntil(page, () => window.pellagos.game.messages.some(({ text }) => /thanks you for the wounds you dealt the Behemoth, \d+% of its strength: \d+ gold/.test(text)))).toBe(true);
    await expect(page.locator("#bossbar")).toBeHidden();

    // (The townsfolk out of their doors again, the doors heard, about their business)
    expect(await playUntil(page, () => [...window.pellagos.game.host.folk.values()].filter(({ role }) => role === "townsfolk").every(({ id, indoors }) => !indoors && window.pellagos.game.battle.actor(id)?.routine.pace === undefined), { seconds: 30 })).toBe(true);
    expect(await page.evaluate(() => window.doors.filter(Boolean).length)).toBe(sheltered.folk * 2);
});

test("the houses the Behemoth of the Rift burns as a town falls: drawn burning, the fire told and its crackle heard; then as the days go by a burnt shell, framed in new timbers, roofed again, and whole, the town told", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // (The lone orc out of the way; what's heard kept; three of the houses nearest the player
    // burnt, as the debug overlay burns them)
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const setAmbience = game.sound.setAmbience.bind(game.sound);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        window.heard = [];
        game.sound.setAmbience = (ambience) => {
            window.heard.push(ambience);

            return setAmbience(ambience);
        };
        game.advance(0.1, { render: false });
    });
    // (No fire's crackle where the player stands before)
    expect(await playUntil(page, () => window.heard.length > 0, { seconds: 5 })).toBe(true);
    expect(await page.evaluate(() => window.heard.at(-1).beds.campfireLoop ?? 0)).toBe(0);
    await page.evaluate(() => window.pellagos.game.burn("burning", 3));

    const [burnt] = await page.evaluate(() => window.pellagos.game.host.burnt);
    const ends = stagesOf(burnt.at);
    // (The town's merged meshes now, to tell when its blocks are built again)
    const meshes = () => page.evaluate(() => window.pellagos.game.town.object.children.filter(({ isMesh }) => isMesh).map(({ uuid }) => uuid));
    const stageNow = () => page.evaluate((place) => [...(window.pellagos.game.burntNow.get(place) ?? new Map()).values()], burnt.place);
    // (The world's clock moved on to `at`, ms of play)
    const goTo = (at) =>
        page.evaluate((target) => {
            const { war } = window.pellagos.game.host;

            war.turn += Math.ceil((target - (war.turn * 60000 + war.clock)) / 60000);
        }, at);

    expect(burnt.pieces).toHaveLength(3);
    expect(await playUntil(page, () => window.pellagos.game.messages.some(({ text }) => /^Fire by the/.test(text)), { seconds: 2 })).toBe(true);
    expect(await toldOf(page, /^Fire by the/)).toMatch(/^Fire by the [a-z-]+ road! Three houses burning! Every hand to the buckets!/);

    // Burning: its blocks built again, great fires in them lighting what's round them, and heard
    expect(await playUntil(page, () => window.pellagos.game.town.lights.filter(({ kind }) => kind === "blaze").length >= 3, { seconds: 20 })).toBe(true);
    expect(await stageNow()).toEqual(["burning", "burning", "burning"]);
    expect(await playUntil(page, () => window.heard.at(-1)?.beds.campfireLoop > 0, { seconds: 5 })).toBe(true);

    // The next day, burnt out: its fires out, its blocks built again
    const before = await meshes();

    await goTo(ends.burning + 1000);
    expect(await playUntil(page, () => !window.pellagos.game.town.lights.some(({ kind }) => kind === "blaze"), { seconds: 20 })).toBe(true);
    expect(await stageNow()).toEqual(["burnt", "burnt", "burnt"]);
    expect((await meshes()).some((uuid) => !before.includes(uuid))).toBe(true);

    // Framed, then roofed: built again as each, and the carpenters heard at it by day
    for (const [stage, at] of [["framed", ends.burnt + 1000], ["roofed", ends.framed + 1000]]) {
        await page.evaluate(([asked, was]) => Object.assign(window, { asked, was }), [stage, await meshes()]);
        await goTo(at);
        expect(await playUntil(page, () => [...window.pellagos.game.burntNow.values()].some((houses) => [...houses.values()].includes(window.asked)), { seconds: 5 })).toBe(true);
        expect(await playUntil(page, () => window.pellagos.game.town.object.children.some(({ isMesh, uuid }) => isMesh && !window.was.includes(uuid)), { seconds: 20 })).toBe(true);
        expect(await stageNow()).toEqual([stage, stage, stage]);
    }

    expect(await playUntil(page, () => window.heard.at(-1)?.calls.distantHammer?.volume > 0, { seconds: 5 })).toBe(true);

    // Whole again by the evening: let go of, the town told
    await goTo(ends.roofed + 1000);
    expect(await playUntil(page, () => !window.pellagos.game.host.burnt.length && window.pellagos.game.messages.some(({ text }) => /stand whole again/.test(text)), { seconds: 5 })).toBe(true);
    expect(await toldOf(page, /stand whole again/)).toMatch(/^The houses the Behemoth burnt in .+ stand whole again\./);
    expect(await stageNow()).toEqual([]);
});

test("a town's siege engines drawn from their models: rolled on their wheels; the catapult's arm flung up and over, its pot of burning pitch flying from its bucket, bursting where it lands; the ballista's bolt loosed, gone from it till another's laid in; set alight and burnt through, each lies wrecked", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=5");

    // (Out in an open field, the lone orc out of the way: a catapult and a ballista as the town
    // rolls them out against the Behemoth (ENGINES), side by side, on their rounds 8 m ahead and
    // back, the player out of it, behind them)
    await page.evaluate(async (kinds) => {
        const { game } = window.pellagos;
        const { squaresOf } = await import("./js/core/grid.js");
        const squares = squaresOf(game.host.world.maps.town);
        const me = game.battle.actor(game.me);
        const open = ([cx, cy]) => [...Array(21).keys()].every((j) => [...Array(21).keys()].every((i) => !squares.blocked(cx - 30 + i * 3, cy - 30 + j * 3)));
        let spot = null;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        for (let far = 120; far <= 400 && !spot; far += 20) {
            for (let k = 0; k < 16 && !spot; k++) {
                const at = [Math.floor(me.x + Math.sin((k / 16) * Math.PI * 2) * far), Math.floor(me.y + Math.cos((k / 16) * Math.PI * 2) * far)];

                spot = open(at) ? at : null;
            }
        }

        const [x, y] = spot;

        game.host.battle.place(game.me, "town", [x - 8, y + 6]);
        Object.assign(me, { neutral: true, hp: 1e6, maxHp: 1e6, facing: Math.atan2(11, -6) });

        for (const [k, [kind, { weapon, name, hp, armor, speed }]] of Object.entries(kinds).entries()) {
            const square = [x + k * 6, y];

            game.host.battle.add({ id: kind, kind: "soldier", name, weapon, team: "human", square, ai: "patrol", patrol: [square, [square[0], square[1] - 8]], armed: true, hp, armor, speed, engine: kind });
            game.enlisting.push(kind);
        }
    }, ENGINES.kinds);

    // (Each drawn from its model, and its wreck read; its wheels, and the catapult's arm and the
    // ballista's bolt, found on it)
    expect(await playUntil(page, () => ["catapult", "ballista"].every((id) => window.pellagos.game.avatars.get(id)?.body && window.pellagos.game.avatars.get(id).wreck), { seconds: 60, realTime: true })).toBe(true);

    // (Shown once the camera's on them, as anyone drawn is: a second of it drawn)
    const made = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const [catapult, ballista] = ["catapult", "ballista"].map((id) => game.avatars.get(id));

        for (let k = 0; k < 30; k++) {
            game.advance(1 / 30, { render: k % 5 === 0, wait: true });
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        return { wheels: [catapult.wheels.length, ballista.wheels.length], arm: Boolean(catapult.arm), bolt: Boolean(ballista.bolt), shown: [catapult, ballista].every(({ object, body, wreck }) => object.visible && body.visible && !wreck.visible) };
    });

    expect(made).toEqual({ wheels: [4, 2], arm: true, bolt: true, shown: true });

    // (Rolled on their rounds: each wheel turned as far as it's gone, about its axle)
    expect(await playUntil(page, () => ["catapult", "ballista"].every((id) => window.pellagos.game.avatars.get(id).rolled > 3), { seconds: 20 })).toBe(true);

    const rolled = await page.evaluate(() =>
        ["catapult", "ballista"].map((id) => {
            const avatar = window.pellagos.game.avatars.get(id);

            return avatar.wheels.every((wheel) => Math.abs(wheel.rotation.z + avatar.rolled / (avatar.look.wheel * avatar.look.size)) < 1e-6) && avatar.wheels[0].rotation.z < -3 / (avatar.look.wheel * avatar.look.size);
        }),
    );

    expect(rolled).toEqual([true, true]);

    // (An orc within both their reach, held where it stands; watched frame by frame as they let
    // fly at it)
    const watched = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const [catapult, ballista] = ["catapult", "ballista"].map((id) => game.battle.actor(id));
        const drawn = { catapult: game.avatars.get("catapult"), ballista: game.avatars.get("ballista") };
        const target = game.host.battle.add({ id: "target", kind: "orc", weapon: "cleaver", team: "orcs", square: [Math.floor((catapult.x + ballista.x) / 2), Math.floor(catapult.y - 24)], hp: 1e6 });
        const seen = { flung: 0, pot: null, burst: false, bolt: null, emptied: false, laidIn: false };

        target.stunnedUntil = 1e12;
        game.enlisting.push("target");

        for (let k = 0; k < 30 * 16 && !(seen.burst && seen.laidIn); k++) {
            game.advance(1 / 30, { render: k % 10 === 0, wait: true });

            if (k % 10 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 0));
            }

            // (The catapult's arm, as far as it's flung; its pot, how far from its bucket where
            // it's first drawn; and its burst)
            seen.flung = Math.min(seen.flung, drawn.catapult.arm.rotation.z);

            const pots = [...game.spellFx.bombs.values()];

            if (pots.length && !seen.pot) {
                seen.pot = { off: pots[0].object.position.distanceTo(drawn.catapult.hand()) };
            }

            seen.burst ||= Boolean(seen.pot) && !pots.length;

            // (The ballista's bolt, flying as a ballista's bolt; its own gone from it as it does, laid in after)
            const shot = game.battle.projectiles.find(({ from }) => from === "ballista");

            if (shot && !seen.bolt) {
                seen.bolt = game.effects.kindOf(shot.id);
                seen.emptied = !drawn.ballista.bolt.visible;
            }

            seen.laidIn ||= Boolean(seen.bolt) && drawn.ballista.bolt.visible;
        }

        return { ...seen, hurt: target.hp < target.maxHp };
    });

    expect(watched.flung).toBeLessThan(-1.5);
    expect(watched.pot).not.toBeNull();
    expect(watched.pot.off).toBeLessThan(1.5);
    expect(watched.burst).toBe(true);
    expect(watched.bolt).toBe("ballistaBolt");
    expect(watched.emptied).toBe(true);
    expect(watched.laidIn).toBe(true);
    expect(watched.hurt).toBe(true);

    // (Set alight, and burnt through: wrecked where they stand, the wreck in place of each)
    await page.evaluate(() => {
        const { game } = window.pellagos;

        for (const id of ["catapult", "ballista"]) {
            game.battle.actor(id).hp = 1;
            game.host.battle.afflict(id, "burn", { damage: 10 });
        }
    });
    expect(await playUntil(page, () => ["catapult", "ballista"].every((id) => window.pellagos.game.battle.actor(id).dead), { seconds: 10 })).toBe(true);
    await playUntil(page, () => false, { seconds: 1 });

    const wrecked = await page.evaluate(() => ["catapult", "ballista"].map((id) => {
        const { object, body, wreck } = window.pellagos.game.avatars.get(id);

        return object.visible && !body.visible && wreck.visible;
    }));

    expect(wrecked).toEqual([true, true]);
});

test("an invasion's raiders felled by the player: thanked for them by the town as it holds, by the name of their band, and played on", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=2");

    // (The lone orc out of the way; as small an invasion as comes)
    await page.evaluate((least) => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.advance(0.1, { render: false });
        game.host.command(game.me, { type: "budget", invasion: least });
        game.invade();
    }, SIZE.least);
    expect(await playUntil(page, () => window.pellagos.game.host.invasions.length > 0)).toBe(true);

    // The player sets on two of them, each brought to them, and fells them; the rest of their
    // line falls, to the last man (its reinforcing done with: as if it had gone on that long)
    const felled = await page.evaluate(async (reinforcing) => {
        const { game } = window.pellagos;
        const [invasion] = game.host.invasions;
        const me = game.battle.actor(game.me);
        const ids = invasion.invaders.slice(0, 2);

        invasion.fightAt = game.battle.time - reinforcing;

        for (const id of ids) {
            const raider = game.battle.actor(id);

            raider.hp = 1;
            game.host.command(game.me, { type: "engage", target: id });

            for (let k = 0; k < 300 && !raider.dead; k++) {
                game.host.battle.place(id, "town", [me.square[0] + 1, me.square[1]]);
                game.advance(1 / 30, { render: false, wait: true });
            }

            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        for (const id of invasion.invaders.filter((each) => !game.battle.actor(each).dead)) {
            Object.assign(game.battle.actor(id), { hp: 0, dead: true, respawnAt: Infinity });
        }

        return ids.filter((id) => game.battle.actor(id)?.dead).length;
    }, INVASION.reinforce.lasts);

    expect(felled).toBe(2);
    expect(await playUntil(page, () => window.pellagos.game.messages.some(({ text }) => /thanks you for the 2 bandits you felled/.test(text)))).toBe(true);
    expect(await playUntil(page, () => window.pellagos.game.host.invasions.length === 0, { seconds: 120 })).toBe(true);
});

test("an invasion: the raiders' war horn blown twice where they come out, the town's answering from its line, and the call told; a fight's music round the player though none's after them; a share of them felled by the player, the town's lord thanks them in a panel of its own, the town's horn blown for it, as the bandits are cut down to the last, no one left to sound the retreat", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // (The lone orc out of the way; every horn blown heard, how long after, and whether from
    // somewhere; as small an invasion as comes, so few are felled for the lord's thanks)
    await page.evaluate((least) => {
        const { game } = window.pellagos;
        const play = game.sound.play.bind(game.sound);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        window.horns = [];
        game.sound.play = (name, options = {}) => {
            if (name.endsWith("Horn")) {
                window.horns.push([name, options.delay ?? 0, Boolean(options.at)]);
            }

            return play(name, options);
        };
        game.advance(0.1, { render: false });
        game.host.command(game.me, { type: "budget", invasion: least });
        game.invade();
    }, SIZE.least);

    expect(await playUntil(page, () => window.horns.length > 0)).toBe(true);

    const coming = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const [invasion] = game.host.invasions;

        return { band: invasion.band, size: invasion.size, spared: invasion.spared.includes(game.me), horns: window.horns, music: session.sound.battle, told: game.messages.map(({ text }) => text).find((text) => /^Bandits on the /.test(text)) ?? null };
    });

    expect(coming).toMatchObject({ band: "bandits", spared: true, music: true });
    expect(coming.size).toBeLessThan(SIZE.least);
    expect(coming.horns).toEqual([
        ["warHorn", 0, true],
        ["warHorn", 2.2, true],
        ["townHorn", 4.6, true],
    ]);
    expect(coming.told).toMatch(/^Bandits on the [a-z-]+ road! .+ calls every able hand to its defence\. This time they'll leave you be, unless you strike one\. Next time, they won't\./);

    // The player sets on a share of them, each brought to them, and fells them (its reinforcing
    // done with: as if it had gone on that long)
    const felled = await page.evaluate(async ([share, reinforcing]) => {
        const { game } = window.pellagos;
        const [invasion] = game.host.invasions;
        const me = game.battle.actor(game.me);
        const ids = invasion.invaders.slice(0, Math.ceil(invasion.size * share));

        invasion.fightAt = game.battle.time - reinforcing;

        for (const id of ids) {
            const raider = game.battle.actor(id);

            raider.hp = 1;
            game.host.command(game.me, { type: "engage", target: id });

            for (let k = 0; k < 300 && !raider.dead; k++) {
                game.host.battle.place(id, "town", [me.square[0] + 1, me.square[1]]);
                game.advance(1 / 30, { render: false, wait: true });
            }

            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        return { ids: ids.length, felled: ids.filter((id) => game.battle.actor(id)?.dead).length };
    }, [REWARD.big, INVASION.reinforce.lasts]);

    expect(felled.felled).toBe(felled.ids);

    // The rest of their line falls, to the last man: no one left to sound the retreat; and the
    // lord's thanks
    const gold = await page.evaluate(() => {
        const { game } = window.pellagos;
        const [invasion] = game.host.invasions;

        window.horns.length = 0;

        for (const id of invasion.invaders.filter((each) => !game.battle.actor(each).dead)) {
            Object.assign(game.battle.actor(id), { hp: 0, dead: true, respawnAt: Infinity });
        }

        return game.progress.gold;
    });
    const thanks = page.getByRole("dialog", { name: /^The lord of .+ thanks you/ });

    expect(await playUntil(page, () => Boolean(document.querySelector(".choice")))).toBe(true);
    await expect(thanks).toBeVisible();
    await expect(thanks).toContainText(`who felled ${felled.ids} bandits of the ${coming.size} who came: their own purse,`);
    await expect(thanks).toContainText("from the armoury");
    expect(await page.evaluate(() => window.horns)).toEqual([["townHorn", 0.4, false]]);
    expect(await page.evaluate(() => window.pellagos.game.progress.gold)).toBeGreaterThan(gold + REWARD.purse);
    await expect.poll(() => toldOf(page, /^The bandits are cut down to the last before /)).not.toBeNull();

    await thanks.getByRole("button", { name: "With thanks" }).click();
    await expect(thanks).toBeHidden();
});

test("an invasion's two lines charge each other once near: the raiders' horn from their line and the town's answering from its own, both running, and those of their lines who fight up close in one press, not standing in their ranks", async ({ page }) => {
    test.setTimeout(180000);
    await playing(page, "/?play&seed=2");

    // (The lone orc out of the way; every horn blown heard, how long after, and whether from
    // somewhere; as small an invasion as comes)
    await page.evaluate((least) => {
        const { game } = window.pellagos;
        const play = game.sound.play.bind(game.sound);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        window.horns = [];
        game.sound.play = (name, options = {}) => {
            if (name.endsWith("Horn")) {
                window.horns.push([name, options.delay ?? 0, Boolean(options.at)]);
            }

            return play(name, options);
        };
        game.advance(0.1, { render: false });
        game.host.command(game.me, { type: "budget", invasion: least });
        game.invade();
    }, SIZE.least);

    // Marching on each other till they're near: then both charge, the horns blown
    expect(await playUntil(page, () => (window.pellagos.game.host.invasions[0]?.charged ?? null) !== null, { seconds: 60 })).toBe(true);
    await playUntil(page, () => false, { seconds: 1 });

    // (Those of their lines' bodies: not the reserve nor the commander's household held back
    // behind them, docs/WAR.md *Battles*)
    const charging = await page.evaluate((close) => {
        const { game } = window.pellagos;
        const [invasion] = game.host.invasions;
        const lines = [invasion.formations.invaders, invasion.formations.defenders].map((id) => game.battle.formations[id]);
        const bodies = new Set(invasion.engagement.sides.flatMap(({ bodies: each }) => each.filter(({ part }) => ["left", "centre", "right"].includes(part)).map(({ formation }) => formation)));
        const fighters = [...invasion.invaders, ...invasion.defenders].map((id) => game.battle.actor(id)).filter((one) => one && !one.dead && close.includes(game.host.soldiers.get(one.id).role) && bodies.has(one.formation?.id));

        return {
            horns: window.horns.slice(3),
            lines: lines.map(({ charge, speed }) => ({ charge, speed })),
            fighters: fighters.length,
            running: fighters.filter((one) => one.walkPace === one.chaseSpeed).length,
        };
    }, INVASION.close);

    expect(charging.horns).toEqual([
        ["warHorn", 0, true],
        ["townHorn", 1.2, true],
    ]);
    expect(charging.lines).toEqual([
        { charge: true, speed: INVASION.charge.speed },
        { charge: true, speed: INVASION.charge.speed },
    ]);
    expect(charging.running).toBeGreaterThan(charging.fighters * 0.8);

    // The lines met (a quarter of either's close fighters within 3 m of a foe: not a few sent on
    // ahead to try them), and their press formed, two seconds on. (Not timed from the first blow: that's the archers' volley, some
    // seconds before the lines meet, and the outnumbered line's soon cut down once they have)
    await page.evaluate(([close]) => {
        window.lineFighters = () => {
            const { game } = window.pellagos;
            const [invasion] = game.host.invasions;
            const bodies = new Set(invasion.engagement.sides.flatMap(({ bodies: each }) => each.filter(({ part }) => ["left", "centre", "right"].includes(part)).map(({ formation }) => formation)));
            const standing = (ids) => ids.map((id) => game.battle.actor(id)).filter((one) => one && !one.dead);

            return [
                [invasion.invaders, invasion.defenders],
                [invasion.defenders, invasion.invaders],
            ].map(([ours, theirs]) => ({ fighters: standing(ours).filter((one) => close.includes(game.host.soldiers.get(one.id).role) && bodies.has(one.formation?.id)), foes: standing(theirs) }));
        };
    }, [INVASION.close]);
    expect(
        await playUntil(
            page,
            () => window.lineFighters().some(({ fighters, foes }) => fighters.filter((one) => foes.some((foe) => Math.hypot(foe.x - one.x, foe.y - one.y) <= 3)).length >= fighters.length / 4),
            { seconds: 40 },
        ),
    ).toBe(true);
    await playUntil(page, () => false, { seconds: 2 });

    // A second and a half of it, a look each half second: those who fight up close in the press,
    // and few standing in their ranks with an enemy near all that while (one between foes, its
    // last just cut down, looks for the next a moment after: battle.js RETHINK_MS)
    const looks = [];

    for (let k = 0; k < 4; k++) {
        if (k > 0) {
            await playUntil(page, () => false, { seconds: 0.5 });
        }

        looks.push(
            await page.evaluate(
                (sight) =>
                    window.lineFighters().map(({ fighters, foes }) => {
                        const near = (one, within) => foes.some((foe) => Math.hypot(foe.x - one.x, foe.y - one.y) <= within);

                        return { fighters: fighters.length, thick: fighters.filter((one) => near(one, 3)).length, idle: fighters.filter((one) => one.target === null && near(one, sight)).map(({ id }) => id) };
                    }),
                INVASION.charge.sight,
            ),
        );
    }

    for (const side of [0, 1]) {
        const standing = looks[0][side].idle.filter((id) => looks.every((look) => look[side].idle.includes(id)));

        for (const look of looks) {
            expect(look[side].thick, JSON.stringify(looks)).toBeGreaterThanOrEqual(look[side].fighters * 0.5);
        }

        expect(standing.length, JSON.stringify(looks)).toBeLessThanOrEqual(looks[0][side].fighters * 0.2);
    }
});
