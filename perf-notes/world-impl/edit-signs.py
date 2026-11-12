import sys
p = sys.argv[1] + '/client/js/world/art/kits/signs.js'
s = open(p).read()

a = '''// How finely the signs are painted, of their full size each way (view.js QUALITY `signs`: half on
// Low), and what each kind's painted at
let detail = 1;

/**
 * How finely signs are painted from now on (`scale`: of their full size, each way: view.js QUALITY
 * `signs`). Those painted already stay as they are till they're let go of and painted again.
 */
export function signDetail(scale) {
    detail = Math.min(1, Math.max(0.25, scale || 1));
}

// A canvas to paint a sign on, `width` by `height` as it's painted (its pixels as fine as `detail`
// has them: drawn on as if it were full size)
function canvasOf(width, height) {
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(width * detail));
    canvas.height = Math.max(1, Math.round(height * detail));
'''
b = '''// How finely the signs are painted, of their full size each way (view.js QUALITY `signs`: half on
// Low); what the next are painted at instead, if anything (signsAhead: those of a chunk far off);
// and what the one being painted is painted at
let detail = 1;
let ahead = null;
let painting = 1;

/**
 * How finely signs are painted from now on (`scale`: of their full size, each way: view.js QUALITY
 * `signs`). Those painted already stay as they are till they're let go of and painted again.
 */
export function signDetail(scale) {
    detail = Math.min(1, Math.max(0.25, scale || 1));
}

/** How finely signs are painted (signDetail's): those near. */
export function signsNear() {
    return detail;
}

/**
 * The screen the signs are seen on: how many of its pixels a metre's drawn across at most, a metre
 * from the eye, anywhere on it (its corners, where a picture's stretched most; set by the view as
 * it's sized: view.js). None told (0), a screen 1080 pixels tall, 16 to 9, is taken.
 */
export const SIGN_SCREEN = { value: 0 };

// The widest sign there is, on which a picture's pixels are spread thinnest: the guild's board,
// up to 7 m across (landmarks.js), its picture 2048 pixels across at full size
const WIDEST = Object.freeze({ metres: 7, pixels: 2048 });

/**
 * How finely a sign need be painted while it's `metres` or more from the eye: a quarter of its
 * full size each way, or a half if a quarter would leave the widest board with fewer of its
 * picture's pixels across it than the screen has there, or else as those near are (never finer
 * than they are). Painted so, a sign's drawn just as it would be at full size: the graphics card
 * draws from a picture no smaller than it is on the screen either way.
 */
export function signsFar(metres) {
    const across = (SIGN_SCREEN.value || 2392) / metres;
    const needed = (across * WIDEST.metres) / WIDEST.pixels;

    return Math.min(detail, needed <= 0.25 ? 0.25 : needed <= 0.5 ? 0.5 : 1);
}

/**
 * Paint the signs painted next `scale` of their full size each way, in place of signDetail's (a
 * chunk far off's, as they're built: chunks3d.js); or (null) as signDetail has them again.
 */
export function signsAhead(scale = null) {
    ahead = scale;
}

// A canvas to paint a sign on, `width` by `height` as it's painted (its pixels as fine as it's
// being painted, `painting`: drawn on as if it were full size)
function canvasOf(width, height) {
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(width * painting));
    canvas.height = Math.max(1, Math.round(height * painting));
'''
assert s.count(a) == 1
s = s.replace(a, b)

a = '''// A picture painted once for all that show it (by what it shows, and how finely, if it's not at
// full size: signDetail)
function once(what, paint) {
    const key = detail < 1 ? `${what}|${detail}` : what;

    if (!textures.has(key)) {
        const texture = paint();

        texture.userData.sign = key;
        textures.set(key, texture);
    }

    return textures.get(key);
}

/** Is a texture a sign's picture (painted here)? */
export function isSign(texture) {
    return Boolean(texture?.userData.sign);
}
'''
b = '''// A picture painted once for all that show it (by what it shows, and how finely, if it's not at
// full size: `scale`, as signDetail or signsAhead has it unless it's said), and how it's painted
// kept with it, to paint it again another size (signAt)
function once(what, paint, scale = ahead ?? detail) {
    const key = scale < 1 ? `${what}|${scale}` : what;

    if (!textures.has(key)) {
        painting = scale;

        const texture = paint();

        Object.assign(texture.userData, { sign: key, what, paint, detail: scale });
        textures.set(key, texture);
    }

    return textures.get(key);
}

/** Is a texture a sign's picture (painted here)? */
export function isSign(texture) {
    return Boolean(texture?.userData.sign);
}

/**
 * A sign's picture (`texture`: one painted here) painted `scale` of its full size each way: itself
 * if it's so already, one kept so, or painted now (a few milliseconds: a canvas, and its picture
 * sent when it's first drawn). For whatever draws it to take in the other's place: hold it, and
 * release the other.
 */
export function signAt(texture, scale) {
    const { what, paint, detail: painted } = texture.userData;

    return painted === scale ? texture : once(what, paint, scale);
}

/**
 * Every sign's picture under an object (a piece just built) painted as finely as those near are:
 * any painted otherwise (for a chunk far off, built meanwhile: signsAhead) painted again, the
 * other let go of unless something drawn holds it.
 */
export function signsNearIn(object) {
    object.traverse((node) => {
        const map = node.material?.map;

        if (isSign(map) && map.userData.detail !== detail) {
            node.material.map = signAt(map, detail);
            letGoSign(map);
        }
    });
}
'''
assert s.count(a) == 1
s = s.replace(a, b)

a = '''    if (textures.get(texture.userData.sign) === texture) {
        textures.delete(texture.userData.sign);
    }

    texture.dispose();
}
'''
b = '''    if (textures.get(texture.userData.sign) === texture) {
        textures.delete(texture.userData.sign);
    }

    // (Its canvas too, if it was never sent: a board's is 2.6 MB)
    if (texture.image?.width > 1 || texture.image?.height > 1) {
        texture.image.width = 1;
        texture.image.height = 1;
    }

    texture.dispose();
}
'''
assert s.count(a) == 1
s = s.replace(a, b)
open(p, 'w').write(s)
