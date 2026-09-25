// Debug mode: an overlay of how the game is running, switched on from the title screen (it stays
// on, on every screen, until switched off):
//  - frame rate, a graph of recent frame times, and how long updating and drawing take
//  - what's drawn: draw calls, triangles, geometries, textures, shader programs
//  - memory (where the browser tells), the screen, the drawing buffer, the GPU and device
//  - the battle: its time, characters, orders and projectiles
//  - how long each group of files took to download, and each part of the world to build
// and controls to see what things cost: quality, render scale, shadows, and the squares
// characters walk on (with their paths).
//
// No Three.js here: the overlay reads what it's given.

import { formatBytes } from "./loader.js";

// How often the numbers are updated (ms)
const EVERY = 500;

const element = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attributes)) {
        if (key === "class") {
            node.className = value;
        } else if (key.startsWith("on")) {
            node.addEventListener(key.slice(2), value);
        } else if (value !== undefined && value !== false) {
            node.setAttribute(key, value === true ? "" : value);
        }
    }

    node.append(...children);

    return node;
};

const ms = (value) => `${value.toFixed(1)} ms`;
const thousands = (value) => (value >= 10000 ? `${Math.round(value / 1000)}k` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value));

export class Debug {
    /**
     * @param {HTMLElement} root - The #debug overlay.
     * @param {object} options
     * @param {object} options.settings - The settings (save.js), which the controls change.
     * @param {Function} options.onChange - Hears a changed setting: (key, value).
     */
    constructor(root, { settings, onChange }) {
        this.root = root;
        this.text = root.querySelector("#debugstats");
        this.settings = settings;
        this.onChange = onChange;
        this.loader = null;
        this.view = null;
        this.game = null;
        this.builds = {};
        this.graph = element("canvas", { class: "graph", width: 240, height: 40, "aria-hidden": "true" });
        this.text.after(this.graph);
        this.summary = root.querySelector("#debugsummary");
        this.#controls();

        // Folded away, only the frame rate shows
        const collapse = root.querySelector("#debugcollapse");
        const fold = (folded) => {
            root.classList.toggle("collapsed", folded);
            root.querySelector("#debugbody").hidden = folded;
            collapse.setAttribute("aria-expanded", String(!folded));
            collapse.title = folded ? "Show the numbers" : "Fold away";
        };

        fold(Boolean(settings.debugFolded));
        collapse.addEventListener("click", () => {
            const folded = !root.classList.contains("collapsed");

            fold(folded);
            this.onChange("debugFolded", folded);
        });
    }

    /** Show or hide the overlay. */
    show(on) {
        this.root.hidden = !on;
        clearInterval(this.timer);

        if (on) {
            this.update();
            this.timer = setInterval(() => this.update(), EVERY);
        }
    }

    /** What to report on (any can be null): the loader, the view, the game, build timings. */
    watch({ loader, view, game, builds } = {}) {
        if (loader !== undefined) {
            this.loader = loader;
        }

        if (view !== undefined) {
            this.view = view;
            this.gpu = view ? gpuName(view.renderer) : "";
        }

        if (game !== undefined) {
            this.game = game;
        }

        if (builds) {
            Object.assign(this.builds, builds);
        }

        if (!this.root.hidden) {
            this.update();
        }
    }

    update() {
        const lines = [];
        const { game, view, loader } = this;

        if (game) {
            const { stats } = game;

            lines.push(`FPS ${stats.fps.toFixed(0)}  frame ${ms(stats.frame)}`, `CPU update ${ms(stats.update)}  draw ${ms(stats.render)}`);
        }

        if (view) {
            const { render, memory, programs } = view.renderer.info;
            const canvas = view.renderer.domElement;

            lines.push(
                `Draws ${render.calls}  triangles ${thousands(render.triangles)}  points ${thousands(render.points)}`,
                `Geometries ${memory.geometries}  textures ${memory.textures}  programs ${programs?.length ?? 0}`,
                `Quality ${view.qualityName}  pixels ×${view.renderer.getPixelRatio().toFixed(2)}  ${canvas.width}×${canvas.height}`,
            );

            if (this.gpu) {
                lines.push(`GPU ${this.gpu}`);
            }
        }

        const heap = performance.memory;

        if (heap) {
            lines.push(`JS heap ${formatBytes(heap.usedJSHeapSize)} of ${formatBytes(heap.jsHeapSizeLimit)}`);
        }

        lines.push(`Screen ${innerWidth}×${innerHeight} @${(devicePixelRatio || 1).toFixed(2)}  ${navigator.hardwareConcurrency ?? "?"} cores${navigator.deviceMemory ? `, ${navigator.deviceMemory} GB` : ""}${matchMedia("(pointer: coarse)").matches ? ", touch" : ""}`);

        if (game) {
            const { battle } = game;
            const describe = (actor) => {
                const doing = actor.dead ? "dead" : actor.attack ? `attacking ${actor.attack.target}` : actor.order ? actor.order.type : actor.target ? `chasing ${actor.target}` : actor.path.length ? "walking" : "standing";
                const moving = actor.running ? `, running ${actor.pace.toFixed(1)} m/s` : "";

                return `${actor.id} (${actor.x.toFixed(1)}, ${actor.y.toFixed(1)}) hp ${actor.hp}/${actor.maxHp} stamina ${Math.floor(actor.stamina)}/${actor.maxStamina} ${doing}${moving}`;
            };

            lines.push(`Battle ${(battle.time / 1000).toFixed(1)} s  steps/frame ${game.stats.steps}  projectiles ${battle.projectiles.length}`, ...battle.actors.map(describe));
        }

        if (loader) {
            lines.push(`Downloaded ${formatBytes(loader.loaded)} of ${formatBytes(loader.total)}${loader.time ? ` in ${(loader.time / 1000).toFixed(1)} s` : ""}`);

            for (const group of loader.groups) {
                lines.push(`  ${group.label}: ${formatBytes(group.total)}${group.time ? `, ${Math.round(group.time)} ms` : ""}`);
            }
        }

        const builds = Object.entries({ ...this.builds, ...(game?.timings ?? {}) });

        if (builds.length) {
            lines.push(`Built ${builds.map(([name, time]) => `${name} ${Math.round(time)}`).join(", ")} ms`);
        }

        this.text.textContent = lines.join("\n");
        this.summary.textContent = game ? `Debug · ${game.stats.fps.toFixed(0)} fps` : "Debug";
        this.#drawGraph();
    }

    // Recent frame times, a bar each (green under 1/60 s, amber under 1/30 s, red over)
    #drawGraph() {
        const times = this.game?.frameTimes;
        const context = this.graph.getContext("2d");
        const { width, height } = this.graph;

        this.graph.hidden = !times;
        context.clearRect(0, 0, width, height);

        if (!times) {
            return;
        }

        const count = times.length;
        const bar = width / count;

        for (let i = 0; i < count; i++) {
            const time = times[(this.game.frameIndex + i) % count];

            context.fillStyle = time <= 17.5 ? "#6fcf97" : time <= 34 ? "#f2c94c" : "#eb5757";
            context.fillRect(i * bar, height - Math.min(height, (time / 50) * height), Math.max(1, bar - 0.5), height);
        }

        context.fillStyle = "rgba(255, 255, 255, 0.25)";
        context.fillRect(0, height - (16.7 / 50) * height, width, 1);
    }

    #controls() {
        const settings = this.settings;
        const change = (key, value) => {
            settings[key] = value;
            this.onChange(key, value);
        };
        const quality = element("select", { onchange: () => change("quality", quality.value) },
            ...[["auto", "Auto"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]].map(([value, label]) => element("option", { value }, label)));
        const scale = element("input", { type: "range", min: 0.5, max: 1, step: 0.05, oninput: () => change("renderScale", Number(scale.value)) });
        const shadows = element("input", { type: "checkbox", onchange: () => change("shadows", shadows.checked) });
        const squares = element("input", { type: "checkbox", onchange: () => change("squares", squares.checked) });

        quality.value = settings.quality;
        scale.value = settings.renderScale;
        shadows.checked = settings.shadows;
        squares.checked = settings.squares;

        this.root.querySelector("#debugcontrols").replaceChildren(
            element("label", {}, "Quality", quality),
            element("label", {}, "Render scale", scale),
            element("label", { class: "check" }, shadows, "Shadows"),
            element("label", { class: "check" }, squares, "Squares and paths"),
        );
    }
}

/** The GPU's name, where the browser tells. */
function gpuName(renderer) {
    try {
        const gl = renderer.getContext();
        const info = gl.getExtension("WEBGL_debug_renderer_info");

        return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 60);
    } catch {
        return "";
    }
}
