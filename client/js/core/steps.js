// Work done a step at a time: generators whose every yield is a place the work may stop for the
// frame, its budget spent, and carry on from in the next (world/chunks3d.js), and which return what
// they make.

/** Take every step of some steps (a generator's) now, returning what they make. */
export function allAtOnce(steps) {
    let step = steps.next();

    while (!step.done) {
        step = steps.next();
    }

    return step.value;
}
