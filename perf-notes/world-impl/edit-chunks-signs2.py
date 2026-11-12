import sys
p = sys.argv[1] + '/client/js/world/chunks3d.js'
s = open(p).read()


def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


swap('''/**
 * A chunk's signs (its buildings' name boards and hanging signs, the roads' fingerboards) are
 * painted as finely as the quality has them (kits/signs.js signDetail) while its nearest edge is
 * within DETAIL_NEAR of the player, and as little as a quarter of their full size each way
 * further off (signsFar: never fewer of a picture's pixels across a sign than the screen has
 * there, so it's drawn just the same); one that's been near is kept as it is till the chunk's
 * this much further off again (metres), so walking to and fro at that distance paints nothing
 * again. No more than one's painted again a frame.
 */
export const SIGNS_KEPT = 16;
''', '''/**
 * A chunk's signs (its buildings' name boards and hanging signs, the roads' fingerboards) are each
 * painted as finely as the quality has them (kits/signs.js signDetail) while they're within
 * DETAIL_NEAR of the player, and as little as a quarter of their full size each way further off
 * (signsFar: never fewer of a picture's pixels across a sign than the screen has there, so it's
 * drawn just the same: the camera's with the player, and what it sees of what's that far from
 * them is further from it still); one that's been near is kept as it is till it's this much
 * further off again (metres), so walking to and fro at that distance paints nothing again. No
 * more than one's painted again a frame.
 */
export const SIGNS_KEPT = 16;

// How far past its lot a piece's signs can hang (metres: a sign on its bracket)
const SIGN_HANGS = 3;
''')

swap('''    // How finely a chunk's signs are to be painted with the player at (x, z): as those near are,
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
''', '''    // How finely a sign `off` metres from the player is to be painted: as those near are, within
    // DETAIL_NEAR; as those far off need be, past SIGNS_KEPT more; between, no less finely than
    // those far off, and otherwise as it is ([least, most] of its full size each way)
    #signsAt(off) {
        const [near, far] = [signsNear(), this.farSigns ? signsFar(DETAIL_NEAR) : signsNear()];

        return off <= DETAIL_NEAR ? [near, Infinity] : off <= DETAIL_NEAR + SIGNS_KEPT ? [far, Infinity] : [far, far];
    }

    // Each chunk's signs painted as finely as they're seen from where the player is (#signsAt):
    // one that isn't, painted again, its picture changed for the new one. One a frame at most, a
    // sign painted too coarsely (come near) before any painted finer than it need be (gone far)
    #signs(x, z) {
        let spare = null;

        for (const drawn of this.drawn.values()) {
            for (const sign of drawn.signs ?? []) {
                const [least, most] = this.#signsAt(Math.hypot(sign.at.x - x, sign.at.z - z) - sign.at.radius);
                const painted = sign.texture.userData.detail;
''')

swap('''            // (Its signs painted, as it's built, only as finely as they'll be seen from here: till
            // it's built, which for one with a sign is a moment after, its lettering's font waited
            // for. No other piece is begun meanwhile)
            signsAhead(this.#signsOf(drawn, WILDS.focus.value.x, WILDS.focus.value.y)[0]);
''', '''            // (Its signs painted, as it's built, only as finely as they'll be seen from where the
            // player is: till it's built, which for one with a sign is a moment after, its
            // lettering's font waited for. No other piece is begun meanwhile)
            signsAhead(this.#signsAt(Math.hypot(piece.x - WILDS.focus.value.x, piece.y - WILDS.focus.value.y) - Math.hypot(piece.w ?? 1, piece.h ?? 1) * 10 * PIXEL - SIGN_HANGS)[0]);
''')

swap('''            // (Its signs' pictures kept while it's drawn: signs.js; each with what's drawn with it,
            // to be painted again as the player comes near or goes: #signs)
            if (isSign(mesh.material.map)) {
                holdSign(mesh.material.map);
                drawn.signs.push({ mesh, texture: mesh.material.map });
            }
''', '''            // (Its signs' pictures kept while it's drawn: signs.js; each with what's drawn with it
            // and where that is, to be painted again as the player comes near or goes: #signs)
            if (isSign(mesh.material.map)) {
                const { center, radius } = mesh.geometry.boundingSphere;

                holdSign(mesh.material.map);
                drawn.signs.push({ mesh, texture: mesh.material.map, at: { x: center.x, z: center.z, radius } });
            }
''')

open(p, 'w').write(s)
