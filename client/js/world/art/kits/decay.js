// Crumbled masonry, for what no one keeps (kits/neutral.js's ruins and broken watchtowers, the
// ruined castle's pieces: kits/castle.js RUINED). Built as it stood, then only what's left of it
// made, nothing cut away: the "build it, then take away what fell" way of the ruin generators
// (Procedural World's ruins, the course-aware broken tops in the research notes), worked out
// afresh here.
// - A wall's broken top is jagged at the size of a stone: it slopes where stones fell away one by
//   one, steps a course where a row held, and drops in a V where a breach fell; lowest where the
//   slow noise along it says most went.
// - A tower's rim crumbles the same way round.
// - What fell lies in slopes against the foot, tumbled blocks lying every which way on them, and
//   a loose stone or two is left perched on top.
//
// In world pixels as the kits are (5 to a metre). `at(u, y, v)` places a point of a wall laid
// along u, v across it ([x, y, z]); it may turn and move it, but not stretch it.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Low, slow noise along a length (0 to 1): random values `step` apart, eased between. */
export function slowNoise(random, length, step) {
    const values = Array.from({ length: Math.ceil(length / step) + 2 }, () => random.next());

    return (t) => {
        const i = Math.max(0, Math.min(values.length - 2, Math.floor(t / step)));
        const f = Math.min(1, Math.max(0, t / step - i));
        const e = f * f * (3 - 2 * f);

        return values[i] * (1 - e) + values[i + 1] * e;
    };
}

/**
 * The broken top of a wall `length` long: [[u, height], ...] from 0 to `length`, a point every
 * stone or so (`stone` long, give or take), heights between `low` and `high`. It slopes between
 * most points, steps a course (`course` high) at some, and is notched down in a V where a breach
 * fell (about `breaches` of the way along).
 */
export function brokenTop(random, length, low, high, { stone = 4.5, course = 2, breaches = 0.1 } = {}) {
    const noise = slowNoise(random, length, Math.max(stone * 5, length / 2.5));
    const span = high - low;
    const points = [];

    for (let u = 0; u < length; u += stone * random.range(0.6, 1.4)) {
        // (Mostly what the noise says is left, a stone's height either way)
        let h = high - span * noise(u) + random.range(-1, 1) * course;

        // (A breach: down near the foot, its sides sloping in)
        if (random.chance(breaches) && u > stone && u < length - stone) {
            h = low * random.range(0.35, 0.6);
        }

        h = Math.max(low * 0.35, Math.min(high, h));

        // (Now and then a row holds: a step of a course at this stone's edge)
        if (points.length && random.chance(0.35)) {
            points.push([u, points.at(-1)[1]]);
        }

        points.push([u, h]);
    }

    points.push([length, Math.max(low * 0.35, Math.min(high, high - span * noise(length) + random.range(-1, 1) * course))]);

    return points;
}

/**
 * A crumbled wall: along u over its broken top's points (`top`: brokenTop's, moved to start at
 * `from`), from v0 to v1 across, standing on `base`, closed at the ends asked for; its broken top
 * and ends showing its `core` (the rubble its faces were filled with: its own stone if none).
 */
export function crumbledWall(solid, at, top, from, [v0, v1], base, material, { ends = [true, true], core = material } = {}) {
    const o = at(0, 0, 0);
    const way = (du, dy, dv) => sub(at(du, dy, dv), o);
    const p = (u, y, v) => at(from + u, y, v);

    for (let k = 0; k < top.length - 1; k++) {
        const [[ua, ha], [ub, hb]] = [top[k], top[k + 1]];

        // (Its faces either side, where it runs on: none where it only steps)
        if (ub > ua) {
            solid.facing([p(ua, base, v1), p(ub, base, v1), p(ub, hb, v1), p(ua, ha, v1)], way(0, 0, 1), material);
            solid.facing([p(ua, base, v0), p(ub, base, v0), p(ub, hb, v0), p(ua, ha, v0)], way(0, 0, -1), material);
        }

        // (Its broken top: sloping, or a step's riser)
        if (ub > ua || ha !== hb) {
            solid.facing([p(ua, ha, v0), p(ub, hb, v0), p(ub, hb, v1), p(ua, ha, v1)], way(-(hb - ha), ub - ua, 0), core);
        }
    }

    for (const [end, [u, h], out] of [[ends[0], top[0], -1], [ends[1], top.at(-1), 1]]) {
        if (end) {
            solid.facing([p(u, base, v0), p(u, base, v1), p(u, h, v1), p(u, h, v0)], way(out, 0, 0), core);
        }
    }
}

/**
 * A crumbled round wall (a tower's, a turret's, a pit's lining): round (cx, cz), from radius
 * `inner` to `outer`, standing on `base`, its rim broken: `heights` round it (the first at angle
 * 0, evenly round); left open where `open` says ([from, to] radians, the way through a gap); its
 * rim and the gap's ends showing its `core` (as crumbledWall's).
 */
export function crumbledRing(solid, cx, cz, [inner, outer], base, heights, material, { open = null, core = material } = {}) {
    const n = heights.length;
    const angleOf = (k) => (k / n) * Math.PI * 2;
    const point = (r, k, y) => [cx + Math.cos(angleOf(k)) * r, y, cz + Math.sin(angleOf(k)) * r];
    const gap = (k) => {
        if (!open) {
            return false;
        }

        const mid = ((((k + 0.5) / n) * Math.PI * 2 - open[0]) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

        return mid < open[1] - open[0];
    };

    for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;

        if (gap(k)) {
            continue;
        }

        const [ha, hb] = [heights[k], heights[j]];
        const mid = ((k + 0.5) / n) * Math.PI * 2;
        const out = [Math.cos(mid), 0, Math.sin(mid)];

        solid.facing([point(outer, k, base), point(outer, j, base), point(outer, j, hb), point(outer, k, ha)], out, material);
        solid.facing([point(inner, k, base), point(inner, j, base), point(inner, j, hb), point(inner, k, ha)], [-out[0], 0, -out[2]], material);
        solid.facing([point(inner, k, ha), point(inner, j, hb), point(outer, j, hb), point(outer, k, ha)], [0, 1, 0], core);

        // (Its ends either side of the gap, closed)
        for (const [at, h, next] of [[k, ha, (k - 1 + n) % n], [j, hb, j]]) {
            if (gap(next)) {
                const tangent = [-Math.sin(angleOf(at)), 0, Math.cos(angleOf(at))];
                const way = next === j ? tangent : tangent.map((v) => -v);

                solid.facing([point(inner, at, base), point(outer, at, base), point(outer, at, h), point(inner, at, h)], way, core);
            }
        }
    }
}

/** A broken rim's heights at `count` points evenly round (brokenTop's, closed on itself). */
export function brokenRim(random, count, circumference, low, high, options) {
    const top = brokenTop(random, circumference, low, high, options);
    const heightAt = (u) => {
        const k = Math.max(0, top.findIndex((_, i) => i < top.length - 1 && top[i + 1][0] >= u));
        const [[ua, ha], [ub, hb]] = [top[k], top[k + 1] ?? top[k]];

        return ub > ua ? ha + ((hb - ha) * (u - ua)) / (ub - ua) : hb;
    };
    const heights = Array.from({ length: count }, (_, k) => heightAt((k / count) * circumference));

    // (Its end eased into its start, so the rim meets itself)
    heights[count - 1] = (heights[count - 1] + heights[0]) / 2;

    return heights;
}

/**
 * A block tumbled down: `size` long, lying (`lean` how far tipped) any way round, its middle at
 * (x, y, z).
 */
export function tumbled(solid, random, [x, y, z], size, material, { lean = 0.5 } = {}) {
    const a = random.next() * Math.PI * 2;
    const tip = random.range(-lean, lean);
    const d = [Math.cos(a) * size * 0.5, tip * size * 0.5, Math.sin(a) * size * 0.5];
    const up = [random.range(-0.5, 0.5), 1, random.range(-0.5, 0.5)];

    solid.beam([x - d[0], y - d[1], z - d[2]], [x + d[0], y + d[1], z + d[2]], size * random.range(0.5, 0.8), size * random.range(0.4, 0.7), material, { up });
}

/**
 * Fallen stone against a wall's foot, on the side `out` (+1 or -1 along v) of its face at v,
 * where its top's low enough that much fell (`full`: how high it stood): heaped against it about
 * a third as high as what fell, running out half again as far; lumpy, its crest rising and
 * falling with what fell along it, its ends running down into the ground; blocks tumbled down it
 * and out past its foot. `ground`: the height the wall stands on.
 */
export function talus(solid, random, at, top, from, v, out, full, ground, material) {
    const o = at(0, 0, 0);
    const way = (du, dy, dv) => sub(at(du, dy, dv), o);
    const p = (u, y, w) => at(from + u, y, w);
    const up = way(0, 1, out);
    // (How high it lies against the wall at each point of the top, none where little fell; where
    // the top only steps, once)
    const points = top
        .filter(([u], k) => k === 0 || u > top[k - 1][0])
        .map(([u, h]) => {
            const fell = full - h;

            return [u, fell < full * 0.3 ? 0 : Math.max(0, Math.min(fell * 0.33, h - ground)) * random.range(0.75, 1.15)];
        });

    for (let k = 0; k < points.length; k++) {
        if (points[k][1] <= 0 || (k > 0 && points[k - 1][1] > 0)) {
            continue;
        }

        // (A heap: the points with stone against them, and the one either side where it runs out)
        let end = k;

        while (end + 1 < points.length && points[end + 1][1] > 0) {
            end++;
        }

        const heap = points.slice(Math.max(0, k - 1), Math.min(points.length, end + 2));
        const rings = heap.map(([u, rise]) => {
            const reach = rise * random.range(1.4, 1.9) + 1;
            const mid = random.range(0.4, 0.6);

            return [p(u, ground + rise, v), p(u, ground + rise * (1 - mid) * random.range(0.85, 1.2), v + out * reach * mid), p(u, ground - 1, v + out * reach)];
        });

        if (rings.length < 2) {
            continue;
        }

        solid.loft(rings, material, { closed: false, smooth: false, out: () => up });

        // (Its ends closed where it's cut off by the wall's end)
        for (const [ring, [u], side] of [[rings[0], heap[0], -1], [rings.at(-1), heap.at(-1), 1]]) {
            if (ring[0][1] > ground + 0.5) {
                solid.facing([p(u, ground - 1, v), ...ring], way(side, 0, 0), material);
            }
        }

        // (Blocks tumbled down it, or out past its foot)
        for (const [u, rise] of heap) {
            if (rise > 0 && random.chance(0.45)) {
                const reach = rise * 1.6 + 1;
                const w = random.range(0.15, 1.25) * reach;

                tumbled(solid, random, p(u + random.range(-1, 1), ground + Math.max(0, rise * (1 - w / reach)) + 0.5, v + out * w), random.range(2, 4.5), material);
            }
        }
    }
}

/** A loose stone or two left perched on a broken top, where it's high enough to be worth it. */
export function perched(solid, random, at, top, from, [v0, v1], below, material) {
    for (let k = 0; k < top.length - 1; k++) {
        const [[ua, ha], [ub, hb]] = [top[k], top[k + 1]];

        if (ub > ua && Math.max(ha, hb) < below && random.chance(0.12)) {
            const t = random.range(0.2, 0.8);
            const size = random.range(2, 3);

            tumbled(solid, random, at(from + ua + (ub - ua) * t, ha + (hb - ha) * t + size * 0.25, (v0 + v1) / 2), size, material, { lean: 0.25 });
        }
    }
}
