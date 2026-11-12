import sys
p = sys.argv[1] + '/client/js/world/chunks3d.js'
s = open(p).read()


def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


swap('''import { holdSign, isSign, letGoSign, releaseSign } from "./art/kits/signs.js";''',
     '''import { holdSign, isSign, letGoSign, releaseSign, signAt, signsAhead, signsFar, signsNear } from "./art/kits/signs.js";''')

swap('''export const DETAIL_NEAR = 40;
''', '''export const DETAIL_NEAR = 40;

/**
 * A chunk's signs (its buildings' name boards and hanging signs, the roads' fingerboards) are
 * painted as finely as the quality has them (kits/signs.js signDetail) while its nearest edge is
 * within DETAIL_NEAR of the player, and as little as a quarter of their full size each way
 * further off (signsFar: never fewer of a picture's pixels across a sign than the screen has
 * there, so it's drawn just the same); one that's been near is kept as it is till the chunk's
 * this much further off again (metres), so walking to and fro at that distance paints nothing
 * again. No more than one's painted again a frame.
 */
export const SIGNS_KEPT = 16;
''')

swap('''    constructor(world, { undergrowth = 1, cliffs = 1, rocks = "medium" } = {}) {
        this.world = world;
''', '''    constructor(world, { undergrowth = 1, cliffs = 1, rocks = "medium", farSigns = true } = {}) {
        this.world = world;

        /**
         * Whether the signs of chunks far from the player are painted smaller (SIGNS_KEPT): as the
         * game has it, its camera with the player; not a lab, whose camera goes where it likes.
         */
        this.farSigns = farSigns;
''')

swap('''        this.#detail(x, z);
        this.#rocksNear();

        return built || grown || refined || drew || changed;
''', '''        this.#detail(x, z);
        this.#signs(x, z);
        this.#rocksNear();

        return built || grown || refined || drew || changed;
''')

swap('''    // Grow what undergrowth can be grown before `until` (performance.now()'s), a step at a time;
    // whether a tile of it was finished
    #grow(until) {''', '''    // How finely a chunk's signs are to be painted with the player at (x, z): as those near are,
    // within DETAIL_NEAR; as those far off need be, past SIGNS_KEPT more; between, no less finely
    // than those far off, and otherwise as they are ([least, most] of their full size each way)
    #signsOf(drawn, x, z) {
        const [near, far] = [signsNear(), this.farSigns ? signsFar(DETAIL_NEAR) : signsNear()];
        const off = offSquare(drawn.cx * CHUNK, drawn.cy * CHUNK, CHUNK, x, z);

        return off <= DETAIL_NEAR ? [near, Infinity] : off <= DETAIL_NEAR + SIGNS_KEPT ? [far, Infinity] : [far, far];
    }

    // Each chunk's signs painted as finely as they're seen (#signsOf): one that isn't, painted
    // again, its picture changed for the new one. One a frame at most, a sign painted too coarsely
    // (its chunk come near) before any painted finer than it need be (one gone far off)
    #signs(x, z) {
        let spare = null;

        for (const drawn of this.drawn.values()) {
            if (!drawn.signs?.length) {
                continue;
            }

            const [least, most] = this.#signsOf(drawn, x, z);

            for (const sign of drawn.signs) {
                const painted = sign.texture.userData.detail;

                if (painted < least) {
                    this.#repaint(sign, least);

                    return;
                }

                if (painted > most) {
                    spare ??= [sign, most];
                }
            }
        }

        if (spare) {
            this.#repaint(...spare);
        }
    }

    // A sign's picture painted `scale` of its full size each way, in place of the one it has
    #repaint(sign, scale) {
        const picture = signAt(sign.texture, scale);

        holdSign(picture);
        sign.mesh.material.map = picture;
        releaseSign(sign.texture);
        sign.texture = picture;
    }

    // Grow what undergrowth can be grown before `until` (performance.now()'s), a step at a time;
    // whether a tile of it was finished
    #grow(until) {''')

swap('''            const add = (object) => {
                job.built = placed(object, piece, [0, 0], grounded(object, piece, this.groundAt));''', '''            const add = (object) => {
                signsAhead(null);
                job.built = placed(object, piece, [0, 0], grounded(object, piece, this.groundAt));''')

swap('''            const skip = (error) => {
                console.warn(`Left out ${piece.key ?? piece.kind}: it failed to build.`, error);
                job.index++;
            };
            let built;

            try {
                built = build(piece);
            } catch (error) {''', '''            const skip = (error) => {
                signsAhead(null);
                console.warn(`Left out ${piece.key ?? piece.kind}: it failed to build.`, error);
                job.index++;
            };
            let built;

            // (Its signs painted, as it's built, only as finely as they'll be seen from here: till
            // it's built, which for one with a sign is a moment after, its lettering's font waited
            // for. No other piece is begun meanwhile)
            signsAhead(this.#signsOf(drawn, WILDS.focus.value.x, WILDS.focus.value.y)[0]);

            try {
                built = build(piece);
            } catch (error) {''')

swap('''        for (const mesh of merged.children) {
            cutAway(mesh.material);

            // (Its signs' pictures kept while it's drawn: signs.js)
            if (isSign(mesh.material.map)) {
                holdSign(mesh.material.map);
                drawn.signs.push(mesh.material.map);
            }
        }
''', '''        for (const mesh of merged.children) {
            cutAway(mesh.material);

            // (Its signs' pictures kept while it's drawn: signs.js; each with what's drawn with it,
            // to be painted again as the player comes near or goes: #signs)
            if (isSign(mesh.material.map)) {
                holdSign(mesh.material.map);
                drawn.signs.push({ mesh, texture: mesh.material.map });
            }
        }
''')

swap('''        for (const texture of drawn.signs ?? []) {
            releaseSign(texture);
        }

        drawn.made = [];
        drawn.signs = [];
        drawn.lights = [];
    }
''', '''        for (const { texture } of drawn.signs ?? []) {
            releaseSign(texture);
        }

        drawn.made = [];
        drawn.signs = [];
        drawn.lights = [];
    }
''')

swap('''        for (const texture of drawn.signs ?? []) {
            releaseSign(texture);
        }

        for (const part of [...drawn.object.children]) {''', '''        for (const { texture } of drawn.signs ?? []) {
            releaseSign(texture);
        }

        for (const part of [...drawn.object.children]) {''')

open(p, 'w').write(s)
