// Which WebGL call gives an error, in the game's first frames in the start town: every call
// checked (slow), the first few that give one told, with the drawing they came in
//   node glerror-check.mjs <worktree> <port> <seed> <frames>
const [root, port = "8152", seed = "2", frames = "14"] = process.argv.slice(2);
const { chromium } = await import(`${root}/node_modules/playwright/index.mjs`);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--enable-unsafe-swiftshader", "--host-resolver-rules=MAP pellagos.duckdns.org ~NOTFOUND"] });
const page = await browser.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 0.5 });
const said = [];

page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
page.on("console", (message) => ["error", "warning"].includes(message.type()) && said.push(`${message.type()}: ${message.text().slice(0, 300)}`));

// (Stopped as soon as it's playing, before a frame more is drawn than must be)
await page.addInitScript(() => {
    const timer = setInterval(() => {
        if (window.pellagos?.playing) {
            window.pellagos.game.running = false;
            window.stoppedAt = window.pellagos.session.view.sentAhead;
            clearInterval(timer);
        }
    }, 1);
});
await page.goto(`http://localhost:${port}/?play&seed=${seed}`);
await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 1500000, polling: 500 });

const report = await page.evaluate(async (frames) => {
    const { game, session } = window.pellagos;
    const view = session.view;
    const gl = view.renderer.getContext();
    const errors = [];
    const first = gl.getError();
    let [frame, drawing, calls] = [0, "-", 0];
    const told = (value) => (value === null || value === undefined ? String(value) : typeof value === "object" ? `${value.constructor?.name}${value.length !== undefined ? `(${value.length})` : ""}` : String(value));

    game.running = false;

    const render = view.renderer.render;

    view.renderer.render = function (scene, camera) {
        const outer = drawing;

        drawing = `${scene === view.scene ? "near" : "other"} scene, camera layers ${camera.layers.mask}`;

        try {
            return render.call(this, scene, camera);
        } finally {
            drawing = outer;
        }
    };

    for (let proto = Object.getPrototypeOf(gl); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
        for (const name of Object.getOwnPropertyNames(proto)) {
            const described = Object.getOwnPropertyDescriptor(proto, name);

            if (typeof described.value !== "function" || name === "getError" || name === "constructor" || Object.hasOwn(gl, `checked ${name}`)) {
                continue;
            }

            const inner = gl[name];

            gl[`checked ${name}`] = true;
            gl[name] = function (...given) {
                const result = inner.apply(this, given);
                const error = gl.getError();

                calls++;

                if (error && errors.length < 12) {
                    errors.push({ frame, drawing, call: `${name}(${given.map(told).join(", ")})`, error, bound: { program: !!gl.getParameter(gl.CURRENT_PROGRAM), framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) ? "a target" : "the screen", elements: !!gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING) } });
                    gl.getError();
                }

                return result;
            };
        }
    }

    const each = [];

    for (frame = 1; frame <= frames; frame++) {
        const before = view.sentAhead;

        game.advance(1 / 30, { wait: true });
        each.push(`${view.sentAhead - before} sent, ${view.renderer.info.render.calls} calls, ${errors.length} errors so far`);
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return { sentBeforeStopped: window.stoppedAt, sentBeforeChecking: view.sentAhead - each.reduce((sum, line) => sum + Number(line.split(" ")[0]), 0), errorBeforeChecking: first, calls, each, errors };
}, Number(frames));

console.log(JSON.stringify(report, null, 1));
console.log("said:", said.length ? said.join("\n  ") : "nothing");
await browser.close();
