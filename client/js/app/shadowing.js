// A game's shadow, watched (core/shadow.js; generated/multiplayer_scaling_plan.md 3-17): a
// lockstep game in a world on a server, opened with `?shadow`, also asks for its player's frames
// and holds each to its own copy. Nothing's drawn from them. What this does is keep what the
// shadow finds where someone will see it: in the debug log (app/telemetry.js: an event, `shadow`,
// when it's first found a difference and as more are found), and, the first time, to the world
// itself by the way a crash report goes (app/servers.js reportCrash), if the player sends those.
//
// Pure of the page: what it's given does the keeping, the sending and the timing.

/** How often a shadow's looked at (ms). */
export const SHADOWING = Object.freeze({ every: 5000 });

/** What's kept of a shadow that's found differences: the debug log's event, as telemetry.keep takes it. */
export function shadowEvent(shadow) {
    const { counts, lines, differences } = shadow;

    return { kind: "shadow", summary: `Views differed from this game's copy ${differences} time${differences === 1 ? "" : "s"} in ${counts.compared} frames: ${lines[0] ?? ""}`.slice(0, 300), counts: { ...counts }, differences, lines: lines.slice(0, 10) };
}

/**
 * A shadow watched till `still()` says the game's left the world it was asked in: each time it's
 * looked at, more differences than when it last was are kept in the debug log (`keep(kind,
 * detail)`: null if it's too soon for another), and the first kept is sent to the world
 * (`send({ build, code, built, events })`, whatever comes of it). Returns { look() (what the
 * timer does, for whoever'd rather not wait), stop() }.
 *
 * @param {object} given
 * @param {function} given.shadow - The shadow now (core/shadow.js Shadow), or null.
 * @param {function} given.keep - telemetry.keep.
 * @param {function} given.send - Sends a report to the world: async.
 * @param {function} given.still - Whether the game's still in that world.
 */
export function watchShadow({ shadow, keep, send, still, every = SHADOWING.every, timers = globalThis }) {
    let told = 0;
    let sent = false;
    let timer = null;
    const stop = () => {
        if (timer !== null) {
            timers.clearInterval(timer);
            timer = null;
        }
    };
    const look = () => {
        if (!still()) {
            stop();

            return;
        }

        const now = shadow();

        if (!now || now.differences <= told) {
            return;
        }

        const kept = keep("shadow", shadowEvent(now));

        if (!kept) {
            return;
        }

        told = now.differences;

        if (!sent) {
            sent = true;
            Promise.resolve(send({ build: kept.build ?? null, code: kept.code ?? null, built: kept.built ?? null, events: [kept] })).catch(() => {});
        }
    };

    timer = timers.setInterval(look, every);

    return { look, stop };
}
