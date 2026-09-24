// A grid of squares that a castle or town is laid out on: which squares pieces stand on, which
// units can't cross, and what the ground is.

import { GROUND } from "./pieces.js";

const grid = (width, height, value) => Array.from({ length: height }, () => new Array(width).fill(value));

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Plan {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        // 1 where a piece stands
        this.taken = grid(width, height, 0);
        // 1 where units can't go
        this.obstructed = grid(width, height, 0);
        this.ground = grid(width, height, GROUND.grass);
        this.pieces = [];
    }

    inside(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    /** Is the rectangle on the grid with no piece on it? */
    isFree(x, y, w = 1, h = 1) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (!this.inside(i, j) || this.taken[j][i]) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Put a piece on the grid. Units can't cross its squares, except any listed in `passable`
     * (as [dx, dy] from its top-left square), such as a gatehouse's passage.
     */
    place(piece, { passable = [] } = {}) {
        const { x, y, w, h } = piece;

        this.pieces.push(piece);

        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                this.taken[j][i] = 1;
                this.obstructed[j][i] = passable.some(([dx, dy]) => x + dx === i && y + dy === j) ? 0 : 1;
            }
        }

        return piece;
    }

    /** Take a piece off the grid again. */
    remove(piece) {
        this.pieces.splice(this.pieces.indexOf(piece), 1);

        for (let j = piece.y; j < piece.y + piece.h; j++) {
            for (let i = piece.x; i < piece.x + piece.w; i++) {
                this.taken[j][i] = 0;
                this.obstructed[j][i] = 0;
            }
        }
    }

    /** Set the ground of a rectangle. */
    paint(x, y, w, h, ground) {
        for (let j = y; j < y + h; j++) {
            for (let i = x; i < x + w; i++) {
                if (this.inside(i, j)) {
                    this.ground[j][i] = ground;
                }
            }
        }
    }

    /** Can units stand on this square? */
    isOpen(x, y) {
        return this.inside(x, y) && !this.obstructed[y][x];
    }

    /** The squares units can reach from the given squares ([[x, y], ...]), as a grid of 1s. */
    reachable(starts) {
        const seen = grid(this.width, this.height, 0);
        const queue = starts.filter(([x, y]) => this.isOpen(x, y));

        for (const [x, y] of queue) {
            seen[y][x] = 1;
        }

        for (let i = 0; i < queue.length; i++) {
            const [x, y] = queue[i];

            for (const [dx, dy] of NEIGHBOURS) {
                const nx = x + dx;
                const ny = y + dy;

                if (this.isOpen(nx, ny) && !seen[ny][nx]) {
                    seen[ny][nx] = 1;
                    queue.push([nx, ny]);
                }
            }
        }

        return seen;
    }

    /** The shortest route between two squares, crossing only open squares allowed by `allowed`. */
    route(from, to, allowed = () => true) {
        const previous = new Map();
        const key = ([x, y]) => y * this.width + x;
        const queue = [from];

        previous.set(key(from), null);

        for (let i = 0; i < queue.length; i++) {
            const [x, y] = queue[i];

            if (x === to[0] && y === to[1]) {
                const path = [];

                for (let at = to; at; at = previous.get(key(at))) {
                    path.unshift(at);
                }

                return path;
            }

            for (const [dx, dy] of NEIGHBOURS) {
                const next = [x + dx, y + dy];

                if (this.isOpen(...next) && allowed(...next) && !previous.has(key(next))) {
                    previous.set(key(next), [x, y]);
                    queue.push(next);
                }
            }
        }

        return undefined;
    }
}
