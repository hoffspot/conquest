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
 * Steps (a generator's) taken as there's time: `take(until)` takes them till `until`
 * (performance.now()'s: Infinity, all of them), stopping early if one is WAITING, unless it's not
 * to `wait` (as when there's no end to the time): then it's told NOW. `done` once they're all
 * taken, `value` what they made.
 */
export class Steps {
    constructor(steps) {
        this.steps = steps;
        this.done = false;
        this.value = undefined;

        /** Whether the last step taken is waiting on work done elsewhere. */
        this.waiting = false;
    }

    /** Take steps till `until`; whether they're all taken. */
    take(until = Infinity, { wait = until !== Infinity } = {}) {
        while (!this.done && performance.now() < until) {
            const step = this.steps.next(this.waiting && !wait ? NOW : undefined);

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
