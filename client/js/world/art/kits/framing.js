// Timber framing on a wall's face (house.js): the oak frame of a half-timbered house, standing a
// little proud of the plaster between. Laid out the way carpenters framed a wall, and fitted round
// the wall's windows and doors (worked out first): a sole plate along the foot and a plate along
// the top, posts at the corners and between the bays, a rail at the windows' sills (and, in
// square panels, at their heads), studs between, cut where an opening is, and braces in the
// panels with nothing in the way. Its figures:
//
// - close: studs every half metre or so (a show of wealth: oak was dear), a rail at the sills;
// - square: square panels, a stud in the middle of each bay, rails at the sills and heads;
// - braced: square panels, with a brace across each solid panel below the rail, in pairs (a
//   Mann: an upturned V) in wide ones; and a St Andrew's cross under each window (a German
//   figure, the Andreaskreuz).
//
// Sizes after the carpenters' (and BlendBuildingCreator's) own: members about 19 cm across,
// posts 25, standing 7 cm proud; the rail at the sills. A gable's frame (its outline's `line`)
// is a tie beam, a collar, a king post to the apex and struts, with studs below the collar.

import { material } from "../engine/materials.js";

const M = 5;
const m = (metres) => metres * M;

/** The frame's members' sizes (metres): how wide, and how far they stand proud of the wall. */
export const TIMBERS = Object.freeze({ post: 0.25, member: 0.19, brace: 0.15, proud: 0.07, stud: 0.5, margin: 0.03 });

// The parts of [a, b] not inside any of `holes` ([[from, to]...])
function subtract(a, b, holes) {
    let parts = [[a, b]];

    for (const [h0, h1] of holes) {
        parts = parts.flatMap(([p0, p1]) => {
            if (h1 <= p0 || h0 >= p1) {
                return [[p0, p1]];
            }

            return [[p0, h0], [h1, p1]].filter(([q0, q1]) => q1 - q0 > m(0.08));
        });
    }

    return parts;
}

// The height of a gable's outline over a point along it
function heightOn(line, u) {
    for (let k = 0; k < line.length - 1; k++) {
        const [[ua, va], [ub, vb]] = [line[k], line[k + 1]];

        if (u >= ua - 1e-6 && u <= ub + 1e-6) {
            return ub - ua < 1e-6 ? Math.max(va, vb) : va + ((vb - va) * (u - ua)) / (ub - ua);
        }
    }

    return 0;
}

/**
 * Frame a wall's face (as Solid.wall's: { origin, across, out }): `length` along it, `height` up
 * it (or `line`, a gable's outline: [[u, v]...] rising to its apex and falling), with its
 * `openings` ({ u0, u1, v0, v1 }) left clear, `bays` (where the posts stand between bays: u),
 * `figure` ("close", "square" or "braced"), `sill` (the rail's height, up the wall: the windows'
 * sills), `head` (the windows' heads), `plates` (whether it has its own plates at foot and top:
 * not over a jetty's bressummer), and `timber` (the material's name).
 */
export function frameWall(solid, { origin, across, out }, { length, height = 0, line = null, openings = [], bays = [], figure = "square", sill = null, head = null, plates = true, timber = "timber" }) {
    const at = (u, v) => [origin[0] + across[0] * u, origin[1] + v, origin[2] + across[2] * u];
    const oak = material(timber);
    const [post, member, brace, proud, margin] = [m(TIMBERS.post), m(TIMBERS.member), m(TIMBERS.brace), m(TIMBERS.proud), m(TIMBERS.margin)];
    const top = (u) => (line ? heightOn(line, u) : height);
    const lay = (a, b, width) => solid.member(a, b, out, width, proud, oak, { ends: false });

    // Where a member of this width would run into an opening, along and up
    const blockedAcross = (v, width) => openings.filter(({ v0, v1 }) => v + width / 2 > v0 - margin && v - width / 2 < v1 + margin).map(({ u0, u1 }) => [u0 - margin, u1 + margin]);
    const blockedUp = (u, width) => openings.filter(({ u0, u1 }) => u + width / 2 > u0 - margin && u - width / 2 < u1 + margin).map(({ v0, v1 }) => [v0 - margin, v1 + margin]);

    // A rail across at height v, where the wall (or the gable) is that high, round the openings
    const rail = (v, width = member) => {
        let [from, to] = [0, length];

        if (line) {
            const apex = line.reduce((best, point) => (point[1] > best[1] ? point : best));

            if (v >= apex[1] - width) {
                return;
            }

            // Where the gable's slopes come down to the rail's top
            const [left, right] = [line.find(([, lv], k) => k > 0 && lv >= v + width / 2), [...line].reverse().find(([, lv], k) => k > 0 && lv >= v + width / 2)];
            const [[la, lva], [lb, lvb]] = [line[Math.max(0, line.indexOf(left) - 1)], left];
            const [[ra, rva], [rb, rvb]] = [right, line[Math.min(line.length - 1, line.indexOf(right) + 1)]];

            from = lvb === lva ? la : la + ((lb - la) * (v + width / 2 - lva)) / (lvb - lva);
            to = rvb === rva ? rb : ra + ((rb - ra) * (v + width / 2 - rva)) / (rvb - rva);
        }

        for (const [a, b] of subtract(from, to, blockedAcross(v, width))) {
            lay(at(a, v), at(b, v), width);
        }
    };

    // An upright at u, from v0 to v1 (the wall's top at most), round the openings
    const upright = (u, v0, v1, width = member) => {
        const limit = Math.min(v1, top(u) - width / 2);

        for (const [a, b] of subtract(v0, limit, blockedUp(u, width))) {
            lay(at(u, a), at(u, b), width);
        }
    };

    // Is a rectangle of the wall clear of openings?
    const clear = (ua, ub, va, vb) => openings.every(({ u0, u1, v0, v1 }) => ub <= u0 - margin || ua >= u1 + margin || vb <= v0 - margin || va >= v1 + margin);

    if (line) {
        // A gable: tie beam, collar, king post and struts, studs below the collar
        const apexU = line.reduce((best, point) => (point[1] > best[1] ? point : best))[0];
        const apexV = top(apexU);
        const collar = apexV * 0.5;

        rail(member / 2);
        rail(collar);
        upright(apexU, member, apexV, post * 0.9);

        for (const side of [-1, 1]) {
            const foot = at(apexU + side * m(0.15), collar + member / 2);
            const reach = apexU + side * (apexU * 0.45);
            const [a, b] = [foot, at(reach, top(reach) - member)];

            if (clear(Math.min(apexU, reach), Math.max(apexU, reach), collar, top(reach))) {
                lay(a, b, brace);
            }

            for (const u of [apexU + side * apexU * 0.5, apexU + side * apexU * 0.8]) {
                upright(u, member, Math.min(collar, top(u)));
            }
        }

        return;
    }

    // The plates, the corner posts and the posts between bays
    if (plates) {
        rail(member / 2);
    }

    rail(height - member / 2);

    for (const u of [post / 2, length - post / 2]) {
        upright(u, 0, height, post);
    }

    const posts = [0, ...bays.filter((u) => u > m(0.6) && u < length - m(0.6)), length];

    for (const u of posts.slice(1, -1)) {
        upright(u, 0, height, member * 1.1);
    }

    // The rails at the windows' sills (and heads, in square panels)
    const sillRail = sill ?? height * 0.42;

    rail(sillRail - member / 2);

    if (figure !== "close" && head && head < height - member * 2) {
        rail(head + member / 2);
    }

    // Studs: close all along, or one in the middle of each bay; and each opening's jambs
    for (const { u0, u1, v0, v1 } of openings) {
        for (const u of [u0 - member / 2 - margin, u1 + member / 2 + margin]) {
            if (u > post && u < length - post) {
                upright(u, Math.max(0, v0 - (v0 > m(0.1) ? m(0.05) : 0)), v1 + member, member * 0.9);
            }
        }
    }

    for (let k = 0; k < posts.length - 1; k++) {
        const [ua, ub] = [posts[k], posts[k + 1]];

        if (figure === "close") {
            const count = Math.max(1, Math.round((ub - ua) / m(TIMBERS.stud)) - 1);

            for (let i = 1; i <= count; i++) {
                upright(ua + ((ub - ua) * i) / (count + 1), 0, height, member * 0.85);
            }

            continue;
        }

        const middle = (ua + ub) / 2;

        upright(middle, 0, height, member * 0.9);

        if (figure !== "braced") {
            continue;
        }

        // Braces in the solid panels below the sill rail: a pair meeting at the middle in a
        // wide bay, one in a narrow one; a cross under a window
        const [low, high] = [member, sillRail - member];

        for (const [pa, pb] of [[ua, middle], [middle, ub]]) {
            const [ia, ib] = [pa + member, pb - member];

            if (ib - ia < m(0.5)) {
                continue;
            }

            if (clear(ia, ib, low, high + member)) {
                // (Each rising towards the bay's middle: an upturned V, a Mann)
                lay(at(pa === ua ? ia : ib, low), at(pa === ua ? ib : ia, high), brace);
            } else {
                const window = openings.find(({ u0, u1, v0 }) => u0 < ib && u1 > ia && v0 >= high);

                if (window && clear(ia, ib, low, high)) {
                    lay(at(ia, low), at(ib, high), brace * 0.85);
                    lay(at(ib, low), at(ia, high), brace * 0.85);
                }
            }
        }

        // And up top, at the wall's ends, a brace from the corner post up to the plate where the
        // panel's clear (the frame stiffened at its corners)
        for (const [pa, pb, corner] of [[ua, middle, k === 0], [middle, ub, k === posts.length - 2]]) {
            if (corner && clear(pa + member, pb - member, sillRail + member, height - member) && pb - pa > m(0.8)) {
                const fromLeft = pa === ua;

                lay(at(fromLeft ? pa + member : pb - member, sillRail + member * 2), at(fromLeft ? pb - member : pa + member, height - member), brace);
            }
        }
    }
}
