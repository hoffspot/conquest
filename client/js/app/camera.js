// How the camera follows the player: it keeps up with them from their first step, and stays
// where it is as they move but for keeping them in view at its distance (a leash: walking across
// its view, it swings round after them; walking back towards it, it backs away rather than
// turning round). Walking away from it or across it, it swings round behind them the way they're
// going, easing round over about a second when they turn; walking at all towards it, it's only
// the leash that turns it, as they go by (the camera study, recommendation 2). Dragged
// across the screen, it turns round them (and up or down, tilts: outdoors, up past the horizon
// into the sky), and holds there while they stand; once they've walked a moment, it swings back
// round behind them, and if it was looking up, down again to see where they're going. With
// following turned off (Game options), it keeps the way it's turned and its tilt as they walk.
// In a fight, it doesn't swing round behind them as they go, but turns only as far as keeps them
// and whoever they're fighting both in view (the camera study, recommendation 5: a soft lock,
// framing the fight by itself). Its height and zoom are the view's (world/view.js).
//
// Pure maths on plain numbers (no Three.js), so it's tested in Node: the game (game.js) says
// where the player is and how fast they're going, and puts the view's camera where this says.

/**
 * How far the camera looks down from the horizon (degrees; up, less than 0): where it starts, and
 * how far a drag can tilt it (up to 45 degrees above the horizon; the view may keep it lower
 * still: view.js lowestPitch, indoors); and walking, the least it eases back down to if it was
 * looking higher (to see where they're going), at `settle` a second.
 */
export const PITCH = Object.freeze({ least: -45, start: 35, most: 75, walking: 15, settle: 2.5 });

// Going faster than this (m/s) is going somewhere
const MOVING = 0.4;

// How quickly the camera catches the player up (per second); and how it turns round behind
// them: a spring (this stiff), gathering speed and slowing smoothly, never faster than
// TURN_SPEED (radians a second: a half turn in about a second). On its leash only as they go:
// stood still, or further behind them than LEASHED (metres: put somewhere else, coming back to
// life), it catches them up without its leash turning it
const CATCH_UP = 6;
const LEASHED = 3;
const SPRING = 6;
const TURN_SPEED = 4.2;

// How long the way they're going is averaged over (seconds), so a path's corners don't swing the
// camera about
const STEADY = 0.35;

// How hard it swings round behind them by how far it is from behind them (radians): all the way
// within `full` (walking away from it or across it), none past `none` (walking at all towards it:
// then only the leash turns it, as they go by); and, let go after a drag, how long they walk
// before it does (seconds)
const BEHIND = Object.freeze({ full: (4 * Math.PI) / 9, none: (5 * Math.PI) / 9, after: 1 });

// Keeping a foe in view: how far round it looks for the least turn that does (radians a step, so
// many steps either way: all the way round)
const KEEP = Object.freeze({ step: Math.PI / 36, steps: 36 });

const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class CameraFollow {
    /**
     * @param {object} start
     * @param {number} start.x - Where the camera looks (metres).
     * @param {number} start.z
     * @param {number} [start.yaw] - Which way it looks from (radians: 0 from the south, looking
     *   north; towards the east as it grows, as the view's `yaw`).
     * @param {number} [start.pitch] - How far it looks down (degrees, as the view's `pitch`).
     */
    constructor({ x, z, yaw = 0, pitch = PITCH.start }) {
        this.focus = { x, z };
        this.yaw = yaw;
        this.pitch = pitch;

        /** Being turned by hand (a drag), so not turning round behind the player itself. */
        this.held = false;

        // The way the player's going (steadied): a direction, shorter while it changes; and how
        // fast the camera's turning (radians a second)
        this.heading = { x: 0, z: 0 };
        this.turning = 0;

        /** Whether it follows round behind them as they walk (Game options: off, it keeps still). */
        this.follows = true;

        // (Let go after a drag: how long more they must walk before it swings round behind them)
        this.waiting = 0;
    }

    /** A drag has taken hold of the camera: it turns only as the drag turns it, till let go. */
    grab() {
        this.held = true;
        this.turning = 0;
    }

    /**
     * Turn the camera round the player by `yaw` radians (as `yaw` grows: a drag to the left
     * looks further left), and tilt it `pitch` degrees further down (up, less than 0), no lower
     * than `lowest` degrees nor higher than PITCH.most.
     */
    turn(yaw, pitch = 0, lowest = PITCH.least) {
        this.yaw = wrap(this.yaw + yaw);
        this.pitch = Math.min(PITCH.most, Math.max(Math.max(PITCH.least, lowest), this.pitch + pitch));
    }

    /** The drag has let go: once they've walked a moment, the camera swings back round behind them. */
    release() {
        this.held = false;
        this.waiting = BEHIND.after;
    }

    /**
     * Step the camera on by `dt` seconds. `player`: where the player is ({ x, z }, metres) and
     * how fast they're going ({ vx, vz }, m/s); `aim`: where to look ({ x, z }: the player, or
     * towards whoever they're fighting); `lowest`: the lowest the camera may look from (degrees:
     * the view's, for how much of the sky it would show); `away`: how far it is from where it
     * looks, across the ground (metres: the view's; none, no leash); `keep`: who the player's
     * fighting ({ x, z }, or null), kept within `half` radians of the middle of the view, seen from
     * where the camera is (`away` off). Returns itself: `focus`, `yaw` and `pitch` are where the
     * camera should be.
     */
    update(dt, { player, aim = player, lowest = PITCH.least, away = Infinity, keep = null, half = Math.PI / 6 }) {
        const speed = Math.hypot(player.vx, player.vz);
        const heading = this.heading;

        if (speed > MOVING) {
            const share = ease(1 / STEADY, dt);

            heading.x += (player.vx / speed - heading.x) * share;
            heading.z += (player.vz / speed - heading.z) * share;
        }

        const catchUp = ease(CATCH_UP, dt);
        const leashed = speed > MOVING && Math.hypot(aim.x - this.focus.x, aim.z - this.focus.z) < LEASHED;
        const [moveX, moveZ] = [(aim.x - this.focus.x) * catchUp, (aim.z - this.focus.z) * catchUp];

        this.focus.x += moveX;
        this.focus.z += moveZ;
        this.pitch = Math.max(Math.max(PITCH.least, lowest), this.pitch);

        if (this.held || !this.follows) {
            return this;
        }

        // On a leash: where it was, but for keeping them in view at its distance (turning only as
        // far as that asks: walking towards it or away, not at all)
        if (leashed && Number.isFinite(away) && away > 0.5) {
            this.yaw = Math.atan2(Math.sin(this.yaw) * away - moveX, Math.cos(this.yaw) * away - moveZ);
        }

        // Walking, looking down again if it was looking up into the sky
        if (speed > MOVING && this.pitch < PITCH.walking) {
            this.pitch += (PITCH.start - this.pitch) * ease(PITCH.settle, dt);
        }

        if (speed > MOVING) {
            this.waiting = Math.max(0, this.waiting - dt);
        }

        // Round behind them, the way they're going (when it's clear which way that is, and they've
        // walked a moment since a drag let go), the harder the further they're walking from
        // towards it; or, stood still, coming to a stop where it is. In a fight, rather, as little
        // as keeps their foe in view too (once a drag's let go of it a moment)
        const fighting = keep && Number.isFinite(away);
        const going = !fighting && speed > MOVING && Math.hypot(heading.x, heading.z) > 0.5 && this.waiting === 0;
        const kept = fighting && this.waiting === 0 ? this.#keeping([keep, player], away, half) : null;
        const off = kept !== null ? wrap(kept - this.yaw) : going ? wrap(Math.atan2(-heading.x, -heading.z) - this.yaw) : 0;
        const hard = kept !== null ? 1 : Math.max(0, Math.min(1, (BEHIND.none - Math.abs(off)) / (BEHIND.none - BEHIND.full)));

        if (fighting && speed <= MOVING) {
            this.waiting = Math.max(0, this.waiting - dt);
        }

        this.turning += (SPRING * SPRING * off * hard - 2 * SPRING * this.turning) * dt;
        this.turning = Math.max(-TURN_SPEED, Math.min(TURN_SPEED, this.turning));
        this.yaw = wrap(this.yaw + this.turning * dt);

        return this;
    }

    /**
     * The way the camera should look from to keep points ({ x, z } each: the foe, the player)
     * within `half` radians of the middle of its view, `away` metres from where it looks, turned
     * as little as it can be; if no way round does, the way that keeps them nearest it (null:
     * they're in view already, or nothing would be better).
     */
    #keeping(points, away, half) {
        const offAt = (yaw) => {
            const [cx, cz] = [this.focus.x + Math.sin(yaw) * away, this.focus.z + Math.cos(yaw) * away];

            // (The angle between the way it looks, towards where it looks from where it is, and
            // each point: the furthest)
            return Math.max(
                ...points.map(({ x, z }) => {
                    const [dx, dz] = [x - cx, z - cz];

                    return Math.abs(Math.atan2(-dx * Math.cos(yaw) + dz * Math.sin(yaw), -dx * Math.sin(yaw) - dz * Math.cos(yaw)));
                }),
            );
        };
        const now = offAt(this.yaw);

        if (now <= half) {
            return null;
        }

        let best = { yaw: null, off: now };

        for (let k = 1; k <= KEEP.steps; k++) {
            for (const way of [1, -1]) {
                const yaw = this.yaw + way * k * KEEP.step;
                const off = offAt(yaw);

                if (off <= half) {
                    return wrap(yaw);
                }

                if (off < best.off - 1e-6) {
                    best = { yaw: wrap(yaw), off };
                }
            }
        }

        return best.yaw;
    }
}
