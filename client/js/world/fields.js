// Fields over a map's squares, worked out once when a piece of the world is drawn (the water's
// shore: water.js; where the ground meets what stands on it: ground.js).

const SQRT2 = Math.SQRT2;

/**
 * How far each square of a grid (`width` by `height`) is from the nearest of the squares
 * `sources` marks (bytes, non-zero for a source), middle to middle along the grid (a step across
 * a square 1, corner to corner √2: two sweeps, down and back up). Squares beyond the grid count
 * for nothing. A Float32Array, a square each (Infinity with no source at all).
 */
export function distancesFrom(sources, width, height) {
    const distance = new Float32Array(width * height);

    for (let k = 0; k < distance.length; k++) {
        distance[k] = sources[k] ? 0 : Infinity;
    }

    const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? Infinity : distance[y * width + x]);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const k = y * width + x;

            distance[k] = Math.min(distance[k], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + SQRT2, at(x + 1, y - 1) + SQRT2);
        }
    }

    for (let y = height - 1; y >= 0; y--) {
        for (let x = width - 1; x >= 0; x--) {
            const k = y * width + x;

            distance[k] = Math.min(distance[k], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + SQRT2, at(x - 1, y + 1) + SQRT2);
        }
    }

    return distance;
}

/**
 * A grid of values (`width` by `height`) blurred: each the average of those within `radius`
 * squares across and along (squares beyond the grid counting as 0), `passes` times over, which
 * comes near a gaussian's softness. A Float32Array.
 */
export function blurred(values, width, height, radius, passes = 2) {
    let from = Float32Array.from(values);
    let to = new Float32Array(from.length);
    const span = 2 * radius + 1;

    for (let pass = 0; pass < passes; pass++) {
        for (const [count, lines, step, next] of [[width, height, 1, width], [height, width, width, 1]]) {
            for (let line = 0; line < lines; line++) {
                const start = line * next;
                let sum = 0;

                for (let k = 0; k < radius && k < count; k++) {
                    sum += from[start + k * step];
                }

                for (let k = 0; k < count; k++) {
                    if (k + radius < count) {
                        sum += from[start + (k + radius) * step];
                    }

                    to[start + k * step] = sum / span;

                    if (k - radius >= 0) {
                        sum -= from[start + (k - radius) * step];
                    }
                }
            }

            [from, to] = [to, from];
        }
    }

    return from;
}
