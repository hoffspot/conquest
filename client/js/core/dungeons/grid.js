// The squares a dungeon's level is dug out of (core/dungeons: docs/DUNGEONS.md): rock, or open
// ground, each square of open ground the room or passage it's in; and how far each is from
// somewhere, walking (a breadth-first fill, four ways). Whole numbers only, the same on every
// machine.

/** What a square is: solid rock (or wall), or open ground. */
export const ROCK = 0;
export const OPEN = 1;

/** Squares four ways round a square, and eight. */
export const FOUR = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
export const EIGHT = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);

/**
 * A level's squares, `width` by `height`: each rock or open ground (`cells`), and the room each
 * square of open ground is in (`room`: its id, or -1 for a passage between rooms; -2 for rock).
 */
export class Grid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.cells = new Uint8Array(width * height);
        this.room = new Int16Array(width * height).fill(-2);
    }

    /** Is a square on the level, and a border's width (`margin`) in from its edge? */
    inside(x, y, margin = 0) {
        return x >= margin && y >= margin && x < this.width - margin && y < this.height - margin;
    }

    /** Is a square open ground (off the level: rock)? */
    open(x, y) {
        return this.inside(x, y) && this.cells[y * this.width + x] === OPEN;
    }

    /** Dig a square out (if it's on the level, a square in from its edge), in a room (or a passage, -1) unless it's in one already. */
    dig(x, y, room = -1) {
        if (!this.inside(x, y, 1)) {
            return false;
        }

        const k = y * this.width + x;

        this.cells[k] = OPEN;

        if (this.room[k] < 0) {
            this.room[k] = room;
        }

        return true;
    }

    /** Fill a square back in with rock. */
    fill(x, y) {
        if (this.inside(x, y)) {
            const k = y * this.width + x;

            this.cells[k] = ROCK;
            this.room[k] = -2;
        }
    }

    /** Dig out a rectangle (its corner and size), in a room. */
    digRect(x, y, w, h, room = -1) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                this.dig(i, j, room);
            }
        }
    }

    /** Dig out a round patch `r` squares across from its middle (whole squares within r of it). */
    digRound(cx, cy, r, room = -1) {
        const reach = Math.ceil(r);

        for (let j = -reach; j <= reach; j++) {
            for (let i = -reach; i <= reach; i++) {
                if (i * i + j * j <= r * r) {
                    this.dig(cx + i, cy + j, room);
                }
            }
        }
    }

    /** Is every square of a rectangle (grown by `margin` all round) rock, and on the level a square in? */
    solid(x, y, w, h, margin = 0) {
        for (let j = y - margin; j < y + h + margin; j++) {
            for (let i = x - margin; i < x + w + margin; i++) {
                if (!this.inside(i, j, 1) || this.cells[j * this.width + i] === OPEN) {
                    return false;
                }
            }
        }

        return true;
    }

    /** How many squares of open ground there are. */
    openCount() {
        let count = 0;

        for (let k = 0; k < this.cells.length; k++) {
            count += this.cells[k];
        }

        return count;
    }

    /**
     * How many steps (four ways) each square of open ground is from the nearest of `from`
     * ([[x, y], ...]): an Int32Array, -1 for rock and what can't be reached.
     */
    distances(from) {
        const { width } = this;
        const far = new Int32Array(this.cells.length).fill(-1);
        const queue = new Int32Array(this.cells.length);
        let [head, tail] = [0, 0];

        for (const [x, y] of from) {
            if (this.open(x, y) && far[y * width + x] < 0) {
                far[y * width + x] = 0;
                queue[tail++] = y * width + x;
            }
        }

        while (head < tail) {
            const k = queue[head++];
            const [x, y] = [k % width, Math.floor(k / width)];

            for (const [dx, dy] of FOUR) {
                const [nx, ny] = [x + dx, y + dy];

                if (this.open(nx, ny) && far[ny * width + nx] < 0) {
                    far[ny * width + nx] = far[k] + 1;
                    queue[tail++] = ny * width + nx;
                }
            }
        }

        return far;
    }

    /** Fill in every square of open ground that can't be walked to from `from` (rock again); how many were. */
    keepReachable(from) {
        const far = this.distances(from);
        let lost = 0;

        for (let k = 0; k < this.cells.length; k++) {
            if (this.cells[k] === OPEN && far[k] < 0) {
                this.cells[k] = ROCK;
                this.room[k] = -2;
                lost++;
            }
        }

        return lost;
    }

    /** How many of the eight squares round a square are rock (off the level counting as rock). */
    rockAround(x, y) {
        let count = 0;

        for (const [dx, dy] of EIGHT) {
            count += this.open(x + dx, y + dy) ? 0 : 1;
        }

        return count;
    }

    /** A copy. */
    clone() {
        const copy = new Grid(this.width, this.height);

        copy.cells.set(this.cells);
        copy.room.set(this.room);

        return copy;
    }
}
