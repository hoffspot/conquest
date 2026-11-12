// The game opened in headless Chromium (software GL), in the start town: what the page and the
// graphics card hold of the world, the shadow map's set-up, and any error the page or WebGL gives
//   node browser-check.mjs <worktree> <port> <quality> <seed> <picture.png>
const [root, port = "8152", quality = "low", seed = "2", picture = null] = process.argv.slice(2);
const { chromium } = await import(`${root}/node_modules/playwright/index.mjs`);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
const said = [];

page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
page.on("console", (message) => ["error", "warning"].includes(message.type()) && said.push(`${message.type()}: ${message.text().slice(0, 300)}`));
await page.goto(`http://localhost:${port}/?play&seed=${seed}&quality=${quality}`);

try {
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 900000, polling: 500 });
} catch (error) {
    console.log("not playing:", await page.evaluate(() => ({ screen: document.body.dataset.screen, status: document.querySelector("#loadstatus")?.textContent, amount: document.querySelector("#loadamount")?.textContent })).catch(String));
    console.log("said:", said.join("\n  "));
    await browser.close();
    throw error;
}

// (Played on, frame by frame, drawn, the camera left where it is: after `frames` of them)
const report = (frames) => page.evaluate(async (frames) => {
    const { game, session } = window.pellagos;
    const view = session.view;

    // (The game's own frames stopped: only these)
    game.running = false;

    for (let k = 0; k < frames; k++) {
        game.advance(1 / 30, { wait: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const { heldOnPage } = await import("/js/world/release.js");
    const gl = view.renderer.getContext();
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
    const names = {};
    let unculled = 0;

    game.town.object.traverse((node) => {
        if (node.isMesh) {
            const name = node.name.replace(/[-\d.,]+ ?/g, "#");

            names[name] = (names[name] ?? 0) + 1;
        }
    });
    view.scene.traverse((node) => {
        unculled += node.isMesh && !node.isBatchedMesh && !node.frustumCulled && Object.hasOwn(node, "onAfterRender") ? 1 : 0;
    });

    const signs = {};

    for (const drawn of game.chunks.drawn.values()) {
        for (const { texture } of drawn.signs ?? []) {
            signs[texture.userData.detail] = (signs[texture.userData.detail] ?? 0) + 1;
        }
    }

    return {
        frames,
        gpu: view.gpuMemory.report(),
        glError: gl.getError(),
        maps,
        heldMB: { town: mb(heldOnPage([game.town.object])), chunks: mb(heldOnPage([game.chunks.object])), interiors: mb(heldOnPage([...game.interiors.values()].map(({ object }) => object))) },
        town: names,
        woodland: game.chunks.woodland.planted,
        signs,
        letThroughNotYetDrawn: unculled,
        frame: { calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles },
        released: window.pellagos.released(),
    };
}, frames);

console.log(JSON.stringify(await report(3), null, 1));
console.log(JSON.stringify(await report(120), null, 1));
console.log("said:", said.length ? said.join("\n  ") : "nothing");

if (picture) {
    await page.screenshot({ path: picture });
}

await browser.close();
