// How the camera follows the player. While they move about in the middle of the screen (the
// zone), it keeps still. Once they walk out of the zone, the way the map would have to scroll,
// it follows them, turning round to look from behind them the way they're going, at the same
// height and zoom, until they stop, catching up and keeping still again.
//
// Pure maths on plain numbers (no Three.js), so it's tested in Node: the game (game.js) says
// where the player is, how fast they're going and where they are on the screen, and puts the
// view's camera where this says.

/**
 * The zone the player moves about in without the camera following: half its width and half its
 * height, as shares of the screen's (so the middle third each way).
 */
export const ZONE = Object.freeze({ x: 1 / 3, y: 1 / 3 });

// Going faster than this (m/s) is going somewhere
const MOVING = 0.4;

// How quickly the camera catches the player up (per second); and how it turns round behind
// them: a spring (this stiff), gathering speed and slowing smoothly, never faster than
// TURN_SPEED (radians a second: a half turn in about a second)
const CATCH_UP = 6;
const SPRING = 4;
const TURN_SPEED = 3;

// How long the way they're going is averaged over (seconds), so a path's corners don't swing the
// camera about
const STEADY = 0.35;

// Caught up when this near (metres)
const CAUGHT_UP = 0.25;

const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class CameraFollow {
    /**
     * @param {object} start
     * @param {number} start.x - Where the camera looks (metres).
     * @param {number} start.z
     * @param {number} [start.yaw] - Which way it looks from (radians: 0 from the south, looking
     *   north; towards the east as it grows, as the view's `yaw`).
     */
    constructor({ x, z, yaw = 0 }) {
        this.focus = { x, z };
        this.yaw = yaw;

        /** Following the player (they left the zone), or keeping still. */
        this.following = false;

        // The way the player's going (steadied): a direction, shorter while it changes; and how
        // fast the camera's turning (radians a second)
        this.heading = { x: 0, z: 0 };
        this.turning = 0;
    }

    /**
     * Step the camera on by `dt` seconds. `player`: where the player is ({ x, z }, metres) and
     * how fast they're going ({ vx, vz }, m/s); `screen`: where they are on the screen ({ x, y },
     * -1 to 1 from the middle, or null off it); `aim`: where to look when following ({ x, z }:
     * the player, or towards whoever they're fighting). Returns itself: `focus` and `yaw` are
     * where the camera should be.
     */
    update(dt, { player, screen, aim = player }) {
        const speed = Math.hypot(player.vx, player.vz);
        const heading = this.heading;

        if (speed > MOVING) {
            const share = ease(1 / STEADY, dt);

            heading.x += (player.vx / speed - heading.x) * share;
            heading.z += (player.vz / speed - heading.z) * share;
        }

        if (!this.following && (!screen || Math.abs(screen.x) > ZONE.x || Math.abs(screen.y) > ZONE.y)) {
            this.following = true;
        }

        if (!this.following) {
            this.turning = 0;

            return this;
        }

        const catchUp = ease(CATCH_UP, dt);

        this.focus.x += (aim.x - this.focus.x) * catchUp;
        this.focus.z += (aim.z - this.focus.z) * catchUp;

        // Round behind them, the way they're going (when it's clear which way that is), or, stood
        // still, coming to a stop
        const turnTo = speed > MOVING && Math.hypot(heading.x, heading.z) > 0.5 ? Math.atan2(-heading.x, -heading.z) : this.yaw;

        this.turning += (SPRING * SPRING * wrap(turnTo - this.yaw) - 2 * SPRING * this.turning) * dt;
        this.turning = Math.max(-TURN_SPEED, Math.min(TURN_SPEED, this.turning));
        this.yaw = wrap(this.yaw + this.turning * dt);

        // Stopped, and caught up: keeping still again
        if (speed <= MOVING && Math.hypot(aim.x - this.focus.x, aim.z - this.focus.z) < CAUGHT_UP) {
            this.following = false;
        }

        return this;
    }
}
