// How the camera follows the player: it keeps up with them from their first step, swinging
// round behind them the way they're going, easing round over about a second when they turn
// (all the way round, walking back towards it). Dragged across the screen, it turns round
// them (and up or down, tilts), and holds there while they stand; once they walk again, it
// swings back round behind them. Its height and zoom are the view's (world/view.js).
//
// Pure maths on plain numbers (no Three.js), so it's tested in Node: the game (game.js) says
// where the player is and how fast they're going, and puts the view's camera where this says.

/**
 * How far the camera looks down from the horizon (degrees): where it starts, and how far a drag
 * can tilt it (the view may keep it higher still: view.js lowestPitch).
 */
export const PITCH = Object.freeze({ least: 22, start: 45, most: 75 });

// Going faster than this (m/s) is going somewhere
const MOVING = 0.4;

// How quickly the camera catches the player up (per second); and how it turns round behind
// them: a spring (this stiff), gathering speed and slowing smoothly, never faster than
// TURN_SPEED (radians a second: a half turn in about a second)
const CATCH_UP = 6;
const SPRING = 6;
const TURN_SPEED = 4.2;

// How long the way they're going is averaged over (seconds), so a path's corners don't swing the
// camera about
const STEADY = 0.35;

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

    /** The drag has let go: walking, the camera swings back round behind the player. */
    release() {
        this.held = false;
    }

    /**
     * Step the camera on by `dt` seconds. `player`: where the player is ({ x, z }, metres) and
     * how fast they're going ({ vx, vz }, m/s); `aim`: where to look ({ x, z }: the player, or
     * towards whoever they're fighting); `lowest`: the lowest the camera may look from (degrees:
     * the view's, for how much of the sky it would show). Returns itself: `focus`, `yaw` and
     * `pitch` are where the camera should be.
     */
    update(dt, { player, aim = player, lowest = PITCH.least }) {
        const speed = Math.hypot(player.vx, player.vz);
        const heading = this.heading;

        if (speed > MOVING) {
            const share = ease(1 / STEADY, dt);

            heading.x += (player.vx / speed - heading.x) * share;
            heading.z += (player.vz / speed - heading.z) * share;
        }

        const catchUp = ease(CATCH_UP, dt);

        this.focus.x += (aim.x - this.focus.x) * catchUp;
        this.focus.z += (aim.z - this.focus.z) * catchUp;
        this.pitch = Math.max(Math.max(PITCH.least, lowest), this.pitch);

        if (this.held) {
            return this;
        }

        // Round behind them, the way they're going (when it's clear which way that is), or, stood
        // still, coming to a stop where it is
        const turnTo = speed > MOVING && Math.hypot(heading.x, heading.z) > 0.5 ? Math.atan2(-heading.x, -heading.z) : this.yaw;

        this.turning += (SPRING * SPRING * wrap(turnTo - this.yaw) - 2 * SPRING * this.turning) * dt;
        this.turning = Math.max(-TURN_SPEED, Math.min(TURN_SPEED, this.turning));
        this.yaw = wrap(this.yaw + this.turning * dt);

        return this;
    }
}
