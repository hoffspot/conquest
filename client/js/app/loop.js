import { TICK_MS } from "../core/config.js";

// Never simulate more than this much time in a single frame (e.g. after the tab was hidden)
const MAX_FRAME_TIME_MS = 250;

/**
 * Drives the game: the simulation advances in fixed 100 ms ticks while drawing happens on every
 * animation frame, interpolating unit positions between ticks for smooth movement.
 *
 * In "fixed" mode (single player) the loop steps the simulation itself from requestAnimationFrame,
 * so the game pauses automatically when the tab is hidden and can be paused by the player.
 * In "external" mode (multiplayer) ticks are driven by the server's lockstep clock and the
 * caller reports each tick with tickCompleted().
 */
export class GameLoop {
    #frameRequest;
    #accumulator = 0;
    #lastFrameTime = 0;
    #lastTickTime = 0;

    paused = false;

    constructor({ tick, render }) {
        this.tick = tick;
        this.render = render;
    }

    get running() {
        return this.#frameRequest !== undefined;
    }

    start(mode = "fixed") {
        this.stop();

        this.mode = mode;
        this.paused = false;
        this.#accumulator = 0;
        this.#lastFrameTime = performance.now();

        if (mode === "fixed") {
            // Run the first tick straight away
            this.tick();
        }

        this.tickCompleted();
        this.#frameRequest = requestAnimationFrame((time) => this.#frame(time));
    }

    stop() {
        if (this.#frameRequest !== undefined) {
            cancelAnimationFrame(this.#frameRequest);
            this.#frameRequest = undefined;
        }
    }

    togglePause() {
        this.paused = !this.paused;

        return this.paused;
    }

    // Record when the latest tick ran, for interpolating the drawing
    tickCompleted(time = performance.now()) {
        this.#lastTickTime = time;
    }

    #frame(time) {
        const elapsed = Math.min(time - this.#lastFrameTime, MAX_FRAME_TIME_MS);

        this.#lastFrameTime = time;

        if (this.mode === "fixed" && !this.paused) {
            this.#accumulator += elapsed;

            while (this.#accumulator >= TICK_MS && this.running) {
                this.#accumulator -= TICK_MS;
                this.tick();
            }

            this.tickCompleted(time - this.#accumulator);
        }

        // Interpolation factor between -1 (previous tick) and 0 (latest tick)
        const interpolation = this.paused ? 0 : Math.min(0, (time - this.#lastTickTime) / TICK_MS - 1);

        // The tick may have ended the game and stopped the loop
        if (this.running) {
            this.render(interpolation, elapsed);
            this.#frameRequest = requestAnimationFrame((next) => this.#frame(next));
        }
    }
}
