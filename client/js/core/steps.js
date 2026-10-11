// Work done a step at a time: generators whose every yield is a place the work may stop for the
// frame, its budget spent, and carry on from in the next (world/chunks3d.js), and which return what
// they make.
//
// A step waiting on work done elsewhere (a worker's: characters/skins.js) yields WAITING: whatever
// takes the steps comes back to it later (a frame on), or, if it can't wait, passes it NOW, and it
// does that work itself, at once.

/** Yielded by a step waiting on work done elsewhere: come back later. */
export const WAITING = Symbol("waiting");

/** Passed back (steps.next(NOW)) to a step that's WAITING when there's no waiting: do it now. */
export const NOW = Symbol("now");

/** Take every step of some steps (a generator's) now, returning what they make. */
export function allAtOnce(steps) {
    let step = steps.next();

    while (!step.done) {
        step = steps.next(step.value === WAITING ? NOW : undefined);
    }

    return step.value;
}

/**
 * Take every step of some steps (a generator's) as fast as they go, but wait for any that's
 * WAITING on work done elsewhere (the page's other work going on meanwhile: a worker heard from)
 * rather than doing it here: resolves with what they make. (For work nothing's drawn during,
 * such as the game's loading, which would otherwise do all of it here: allAtOnce.) Taking longer
 * than `patience` (ms, all told: whatever it's waiting on gone quiet, as a worker a phone's
 * stopped can), it's told NOW, and does the work itself. `label` names the work (Steps.slow).
 */
export async function allWaiting(steps, { patience = 10000, label = null } = {}) {
    const taking = new Steps(steps, label);
    const start = performance.now();

    while (!taking.take(Infinity, { wait: performance.now() - start < patience })) {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return taking.value;
}

/**
 * Steps (a generator's) taken as there's time: `take(until)` takes them till `until`
 * (performance.now()'s: Infinity, all of them), stopping early if one is WAITING, unless it's not
 * to `wait` (as when there's no end to the time): then it's told NOW. `done` once they're all
 * taken, `value` what they made. `label` names the work (what's being made), for when a step of it
 * takes long (Steps.slow).
 */
export class Steps {
    /**
     * Told of any step that takes longer than Steps.SLOW ms, with its work's label and how long it
     * took (app/telemetry.js: the debug log's jobs), if anything's listening.
     */
    static slow = null;

    /** How long a step may take (ms) before Steps.slow's told. */
    static SLOW = 20;

    /**
     * Told as work with a label takes its first step, with its label (app/telemetry.js: written
     * down at once, so a crash in the middle of it says what it was doing), if anything's listening.
     */
    static begun = null;

    constructor(steps, label = null) {
        this.steps = steps;
        this.label = label;
        this.done = false;
        this.value = undefined;
        this.begun = false;

        /** Whether the last step taken is waiting on work done elsewhere. */
        this.waiting = false;
    }

    /** Take steps till `until`; whether they're all taken. */
    take(until = Infinity, { wait = until !== Infinity } = {}) {
        let now = performance.now();

        if (!this.begun) {
            this.begun = true;

            if (this.label !== null) {
                Steps.begun?.(this.label);
            }
        }

        while (!this.done && now < until) {
            const step = this.steps.next(this.waiting && !wait ? NOW : undefined);
            const then = now;

            now = performance.now();

            if (now - then > Steps.SLOW) {
                Steps.slow?.(this.label, now - then);
            }

            this.waiting = step.value === WAITING;

            if (step.done) {
                this.done = true;
                this.value = step.value;
            } else if (this.waiting && wait) {
                break;
            }
        }

        return this.done;
    }
}
