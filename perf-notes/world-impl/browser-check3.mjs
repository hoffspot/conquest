// The game opened in headless Chromium (software GL), in the start town: what the page and the
// graphics card hold of the world, the shadow map's set-up, what's sent ahead frame by frame, and
// any error the page or WebGL gives
//   node browser-check2.mjs <worktree> <port> <seed> <picture.png> <frames>
const [root, port = "8152", seed = "2", picture = null, more = "30"] = process.argv.slice(2);
const { chromium } = await import(`${root}/node_modules/playwright/index.mjs`);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
const said = [];

page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
page.on("console", (message) => ["error", "warning"].includes(message.type()) && said.push(`${message.type()}: ${message.text().slice(0, 300)}`));
const began = Date.now();

await page.goto(`http://localhost:${port}/?play&seed=${seed}`);

try {
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 1500000, polling: 500 });
} catch (error) {
    console.log("not playing:", await page.evaluate(() => ({ screen: document.body.dataset.screen, status: document.querySelector("#loadstatus")?.textContent, amount: document.querySelector("#loadamount")?.textContent })).catch(String));
    console.log("said:", said.join("\n  "));
    await browser.close();
    throw error;
}

console.log("playing after", Math.round((Date.now() - began) / 100) / 10, "s; the loader's steps:", JSON.stringify(await page.evaluate(() => window.pellagos.game.loaded)));

// (Played on, frame by frame, drawn, the camera left where it is: after `frames` of them)
const report = (frames) => page.evaluate(async (frames) => {
    const { game, session } = window.pellagos;
    const view = session.view;
    const gl = view.renderer.getContext();
    const each = [];
    // (Those still waiting to be sent: told by sending.js when they're drawn)
    const waiting = () => {
        let count = 0;

        view.scene.traverse((node) => {
            count += (node.isMesh || node.isPoints) && Object.hasOwn(node, "onAfterRender") && node.onAfterRender.name === "drawn" ? 1 : 0;
        });

        return count;
    };

    // (The game's own frames stopped: only these)
    game.running = false;

    for (let k = 0; k < frames; k++) {
        const before = view.sentAhead;
        const began = performance.now();

        game.advance(1 / 30, { wait: true });
        each.push([view.sentAhead - before, view.renderer.info.render.calls, view.renderer.info.render.triangles, view.renderer.info.programs.length, waiting(), Math.round(performance.now() - began), view.gpuMemory.report().buffersMB]);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const { heldOnPage } = await import("/js/world/release.js");
    const maps = [view.sun, ...view.lamps.map(({ light }) => light)].map((light) => {
        const map = light.shadow.map;
        const made = map && view.renderer.properties.get(map).__webglFramebuffer;
        let complete = null;

        if (made) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, Array.isArray(made) ? made[0] : made);
            complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            view.renderer.resetState();
        }

        return `${light.type}${light.castShadow ? " (casts)" : ""}: ${map?.width ?? "none"}, colour format ${map?.texture.format ?? "-"}, ${made ? (complete ? "complete" : "INCOMPLETE") : "not drawn into"}`;
    });
    const mb = (bytes) => Math.round(bytes / 104857.6) / 10;
    let odd = 0;

    // (Anything left on the layer it's sent on, or not culled that was)
    view.scene.traverse((node) => {
        odd += (node.isMesh || node.isPoints) && node.layers.mask & 32 ? 1 : 0;
    });

    const size = view.renderer.getSize(new (view.camera.position.constructor)());
    const viewport = view.renderer.getViewport(view.sun.shadow.camera.quaternion.clone());

    return {
        frames,
        "each frame: sent ahead, calls, triangles, programs, still waiting, ms, buffers MB": each.map((frame) => frame.join(" ")),
        sentAhead: view.sentAhead,
        gpu: view.gpuMemory.report(),
        glError: gl.getError(),
        maps,
        heldMB: { town: mb(heldOnPage([game.town.object])), chunks: mb(heldOnPage([game.chunks.object])), interiors: mb(heldOnPage([...game.interiors.values()].map(({ object }) => object))) },
        woodland: game.chunks.woodland?.planted ?? null,
        leftOnTheSendingLayer: odd,
        viewport: [viewport.x, viewport.y, viewport.z, viewport.w, size.x, size.y],
        scissored: view.renderer.getScissorTest(),
        autoClear: view.renderer.autoClear,
        shadowsAutoUpdate: view.renderer.shadowMap.autoUpdate,
        released: window.pellagos.released?.() ?? null,
    };
}, frames);

console.log(JSON.stringify(await report(12), null, 1));

// (The camera turned all the way round where it stands, a frame drawn at each step: everything
// round the player seen once)
const spin = (frames) => page.evaluate(async (frames) => {
    const { game, session } = window.pellagos;
    const view = session.view;
    const yaws = [];

    game.running = false;

    for (let k = 0; k < frames; k++) {
        game.cameraFollow.turn((Math.PI * 2) / frames);
        game.advance(1 / 30, { wait: true });
        yaws.push(Math.round(view.yaw * 100) / 100);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return yaws.join(" ");
}, frames);

console.log("turned round:", await spin(Number(more)));
console.log(JSON.stringify(await report(3), null, 1));
console.log("said:", said.length ? said.join("\n  ") : "nothing");

if (picture) {
    await page.screenshot({ path: picture, timeout: 120000 }).catch((error) => console.log("no picture:", String(error).slice(0, 200)));
}

await browser.close();
