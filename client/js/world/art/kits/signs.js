// The tavern's signs, painted on canvases: the name board along its front, "Wenches and Ale" in
// gilded blackletter (UnifrakturMaguntia, SIL Open Font License, in client/fonts) on oxblood,
// and the sign hanging from its bracket, painted in the manner of old inn signs: a barmaid in a
// red bodice raising two foaming tankards of ale, within a gilt border, the name on a scroll
// beneath.

import * as THREE from "three";
import { WENCHES } from "../../../core/lore/taverns.js";
import { paintEmblem } from "./emblems.js";

/** The font the tavern's name is lettered in, and where it's served from. */
export const SIGN_FONT = Object.freeze({ family: "UnifrakturMaguntia", url: "fonts/UnifrakturMaguntia.woff2" });

/** What the start town's tavern is called. */
export const TAVERN_NAME = WENCHES.name;

let fontLoading = null;

/** Load the lettering font (once); resolves to whether it loaded (a serif stands in if not). */
export function loadSignFont() {
    fontLoading ??= (async () => {
        try {
            const face = new FontFace(SIGN_FONT.family, `url(${SIGN_FONT.url})`);

            document.fonts.add(await face.load());

            return true;
        } catch {
            return false;
        }
    })();

    return fontLoading;
}

const lettering = (size) => `${size}px "${SIGN_FONT.family}", "Palatino Linotype", Georgia, serif`;

function canvasOf(width, height) {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    return { canvas, context: canvas.getContext("2d") };
}

function textureOf(canvas) {
    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    return texture;
}

// Wood grain over a board's colour
function grain(context, width, height, base, dark, seed = 1) {
    context.fillStyle = base;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = dark;

    for (let k = 0; k < 26; k++) {
        const y = ((k * 97 + seed * 31) % 100) / 100 * height;

        context.globalAlpha = 0.12 + ((k * 37) % 10) / 60;
        context.lineWidth = 1 + (k % 3);
        context.beginPath();
        context.moveTo(0, y);

        for (let x = 0; x <= width; x += width / 8) {
            context.lineTo(x, y + Math.sin(x / width * 6 + k) * height * 0.015);
        }

        context.stroke();
    }

    context.globalAlpha = 1;
}

// Gold leaf: a vertical gradient from bright to deep gold
function gold(context, top, bottom) {
    const gradient = context.createLinearGradient(0, top, 0, bottom);

    gradient.addColorStop(0, "#fff0a8");
    gradient.addColorStop(0.35, "#e2b54c");
    gradient.addColorStop(0.6, "#b98526");
    gradient.addColorStop(1, "#f0cf70");

    return gradient;
}

// The pictures painted (by what they show), and how many drawn things hold each: a picture is
// let go when nothing drawn shows it any more (painted again should the player come back), so
// that the boards of every town passed on the way don't pile up
const textures = new Map();
const holds = new Map();

// A picture painted once for all that show it (by what it shows)
function once(key, paint) {
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

/** Keep a sign's picture for as long as something drawn shows it (until `releaseSign`). */
export function holdSign(texture) {
    holds.set(texture, (holds.get(texture) ?? 0) + 1);
}

/** Something drawn that showed a sign's picture is gone: the picture let go if nothing else holds it. */
export function releaseSign(texture) {
    const left = (holds.get(texture) ?? 0) - 1;

    if (left > 0) {
        holds.set(texture, left);

        return;
    }

    holds.delete(texture);
    letGoSign(texture);
}

/** A sign's picture painted for something never drawn: let go, unless something drawn holds it. */
export function letGoSign(texture) {
    if (holds.has(texture)) {
        return;
    }

    if (textures.get(texture.userData.sign) === texture) {
        textures.delete(texture.userData.sign);
    }

    texture.dispose();
}

/**
 * The name board's picture (a texture, 56 wide to 9 high): a name (the tavern's, unless it's
 * another's) in gilded blackletter on a board of a colour (oxblood, unless another), between
 * gilt rules, with a leaf at each end.
 */
export function nameBoardTexture({ name = TAVERN_NAME, ground = "#5c1a16", dark = "#2e0a08" } = {}) {
    return once(`board|${name}|${ground}`, () => paintNameBoard(name, ground, dark));
}

function paintNameBoard(name, ground, dark) {
    const [width, height] = [2048, 330];
    const { canvas, context } = canvasOf(width, height);

    grain(context, width, height, ground, dark, 3);

    // A gilt rule round the edge, and a dark one inside it
    context.strokeStyle = gold(context, 0, height);
    context.lineWidth = 14;
    context.strokeRect(12, 12, width - 24, height - 24);
    context.strokeStyle = "rgba(20, 5, 3, 0.8)";
    context.lineWidth = 4;
    context.strokeRect(30, 30, width - 60, height - 60);

    // A leaf at each end
    for (const [x, turn] of [[110, 1], [width - 110, -1]]) {
        context.save();
        context.translate(x, height / 2);
        context.scale(turn, 1);
        context.fillStyle = gold(context, -60, 60);

        for (const angle of [-0.5, 0, 0.5]) {
            context.save();
            context.rotate(angle);
            context.beginPath();
            context.moveTo(-10, 0);
            context.quadraticCurveTo(25, -28, 62, 0);
            context.quadraticCurveTo(25, 28, -10, 0);
            context.fill();
            context.restore();
        }

        context.beginPath();
        context.arc(-14, 0, 12, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }

    // The name: a dark shadow, then gold
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = lettering(230);

    const measured = context.measureText(name).width;
    const squeeze = Math.min(1, (width - 360) / measured);

    context.save();
    context.translate(width / 2, height / 2 + 10);
    context.scale(squeeze, 1);
    context.fillStyle = "rgba(12, 2, 1, 0.75)";
    context.fillText(name, 5, 6);
    context.fillStyle = gold(context, -80, 80);
    context.fillText(name, 0, 0);
    context.lineWidth = 2;
    context.strokeStyle = "rgba(80, 40, 5, 0.6)";
    context.strokeText(name, 0, 0);
    context.restore();

    return textureOf(canvas);
}

// The fields signs are painted on, and the emblems' colours on each
const FIELDS = [["#2d4a2a", "#142612", "#e2b54c"], ["#5c1a16", "#2e0a08", "#e2b54c"], ["#1f3552", "#0e1a2a", "#e8e0c8"], ["#2a2a2e", "#121214", "#d8a84a"], ["#6a4a1a", "#35240a", "#f2ead8"], ["#3a1f4a", "#1c0e24", "#e2b54c"]];

/**
 * A hanging sign's picture (a texture, 5 wide to 6 high), in the manner of old inn signs: its
 * emblem (emblems.js: `count` of them) painted on a field within a gilt border, the name on a
 * scroll beneath. `tint` picks the field (a number: the same for the same sign).
 */
export function emblemSignTexture({ name, emblem, count = 1, tint = 0 }) {
    return once(`sign|${name}|${emblem}|${count}|${tint}`, () => {
        const [width, height] = [512, 614];
        const { canvas, context } = canvasOf(width, height);
        const [field, dark, colour] = FIELDS[Math.abs(tint) % FIELDS.length];
        const cx = width / 2;

        grain(context, width, height, field, dark, 5 + (tint % 7));
        context.strokeStyle = gold(context, 0, height);
        context.lineWidth = 18;
        context.strokeRect(12, 12, width - 24, height - 24);
        context.strokeStyle = "#1a0c05";
        context.lineWidth = 4;
        context.strokeRect(28, 28, width - 56, height - 56);

        // A glow behind the emblem, and the emblem
        const glow = context.createRadialGradient(cx, 250, 20, cx, 250, 220);

        glow.addColorStop(0, "rgba(255, 230, 170, 0.28)");
        glow.addColorStop(1, "rgba(255, 230, 170, 0)");
        context.fillStyle = glow;
        context.fillRect(32, 32, width - 64, height - 64);
        paintEmblem(context, emblem, { x: cx, y: 250, size: 330, colour, count });

        // The scroll with the name
        const scrollTop = height - 132;

        context.fillStyle = "#efe0bb";
        context.strokeStyle = "#3a1c10";
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(48, scrollTop + 18);
        context.quadraticCurveTo(cx, scrollTop - 10, width - 48, scrollTop + 18);
        context.lineTo(width - 48, scrollTop + 84);
        context.quadraticCurveTo(cx, scrollTop + 56, 48, scrollTop + 84);
        context.closePath();
        context.fill();
        context.stroke();
        context.fillStyle = "#5c1a16";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = lettering(48);

        const measured = context.measureText(name).width;

        context.save();
        context.translate(cx, scrollTop + 44);
        context.scale(Math.min(1, (width - 130) / measured), 1);
        context.fillText(name, 0, 0);
        context.restore();

        return textureOf(canvas);
    });
}

// A tankard of ale with a foaming head, its handle on `side` (1 right, -1 left), tilted `tilt`
function tankard(context, x, y, size, side, tilt) {
    context.save();
    context.translate(x, y);
    context.rotate(tilt);

    const [w, h] = [size * 0.62, size];

    // The handle
    context.strokeStyle = "#3b2a18";
    context.lineWidth = size * 0.1;
    context.beginPath();
    context.arc(side * w * 0.55, h * 0.05, h * 0.26, -Math.PI / 2, Math.PI / 2, side < 0);
    context.stroke();

    // Its wooden body, bound with iron hoops
    const body = context.createLinearGradient(-w / 2, 0, w / 2, 0);

    body.addColorStop(0, "#6a4424");
    body.addColorStop(0.45, "#a8743f");
    body.addColorStop(1, "#5a381c");
    context.fillStyle = body;
    context.fillRect(-w / 2, -h / 2, w, h);
    context.fillStyle = "#2d2b2a";

    for (const band of [-0.32, 0.3]) {
        context.fillRect(-w / 2 - 2, h * band, w + 4, h * 0.08);
    }

    // The head of foam, spilling over
    context.fillStyle = "#fbf5e6";
    context.beginPath();

    for (let k = 0; k <= 5; k++) {
        const bx = -w / 2 + (w * k) / 5;

        context.arc(bx, -h / 2, w * 0.2, Math.PI, 0);
    }

    context.fill();
    context.beginPath();
    context.ellipse(w * 0.32, -h * 0.4, w * 0.12, h * 0.16, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
}

/**
 * The hanging sign's picture (a texture, 5 wide to 6 high): a barmaid in a red laced bodice over a
 * white chemise, fair hair in braids, raising a foaming tankard in each hand; a gilt border, and
 * the name on a scroll beneath.
 */
export function hangingSignTexture() {
    return once("sign|wenches", paintWenches);
}

function paintWenches() {
    const [width, height] = [640, 768];
    const { canvas, context } = canvasOf(width, height);
    const cx = width / 2;

    // The board, a deep green field within a gilt border
    grain(context, width, height, "#2d4a2a", "#142612", 5);
    context.strokeStyle = gold(context, 0, height);
    context.lineWidth = 22;
    context.strokeRect(14, 14, width - 28, height - 28);
    context.strokeStyle = "#1a0c05";
    context.lineWidth = 5;
    context.strokeRect(34, 34, width - 68, height - 68);

    // A warm glow behind her
    const glow = context.createRadialGradient(cx, 330, 30, cx, 330, 300);

    glow.addColorStop(0, "rgba(255, 214, 140, 0.55)");
    glow.addColorStop(1, "rgba(255, 214, 140, 0)");
    context.fillStyle = glow;
    context.fillRect(40, 40, width - 80, height - 80);

    const skin = "#f0c7a0";
    const outline = "#3a1c10";

    context.lineJoin = "round";
    context.lineCap = "round";

    // Her arms, raised to either side, and the tankards in her hands
    for (const side of [-1, 1]) {
        context.strokeStyle = outline;
        context.lineWidth = 50;
        context.beginPath();
        context.moveTo(cx + side * 70, 420);
        context.quadraticCurveTo(cx + side * 170, 400, cx + side * 190, 250);
        context.stroke();
        context.strokeStyle = skin;
        context.lineWidth = 42;
        context.stroke();

        // The chemise's puffed sleeve at the shoulder
        context.fillStyle = "#f7f2e6";
        context.strokeStyle = outline;
        context.lineWidth = 4;
        context.beginPath();
        context.ellipse(cx + side * 88, 405, 46, 36, side * 0.4, 0, Math.PI * 2);
        context.fill();
        context.stroke();

        tankard(context, cx + side * 196, 205, 118, side, side * 0.18);
    }

    // Her body: the white chemise, the red bodice laced up the front, the skirt below
    context.fillStyle = "#7a1c1c";
    context.beginPath();
    context.moveTo(cx - 150, height - 150);
    context.quadraticCurveTo(cx - 120, 560, cx - 70, 520);
    context.lineTo(cx + 70, 520);
    context.quadraticCurveTo(cx + 120, 560, cx + 150, height - 150);
    context.closePath();
    context.fill();
    context.strokeStyle = outline;
    context.lineWidth = 4;
    context.stroke();

    context.fillStyle = "#f7f2e6";
    context.beginPath();
    context.moveTo(cx - 92, 410);
    context.quadraticCurveTo(cx, 380, cx + 92, 410);
    context.lineTo(cx + 80, 470);
    context.lineTo(cx - 80, 470);
    context.closePath();
    context.fill();
    context.stroke();

    const bodice = context.createLinearGradient(cx - 90, 0, cx + 90, 0);

    bodice.addColorStop(0, "#6e1414");
    bodice.addColorStop(0.5, "#b02a22");
    bodice.addColorStop(1, "#6e1414");
    context.fillStyle = bodice;
    context.beginPath();
    context.moveTo(cx - 84, 448);
    context.quadraticCurveTo(cx - 40, 470, cx, 462);
    context.quadraticCurveTo(cx + 40, 470, cx + 84, 448);
    context.lineTo(cx + 66, 548);
    context.quadraticCurveTo(cx, 566, cx - 66, 548);
    context.closePath();
    context.fill();
    context.stroke();

    // The lacing
    context.strokeStyle = "#f3e2b0";
    context.lineWidth = 3;

    for (let k = 0; k < 4; k++) {
        const y = 474 + k * 18;

        context.beginPath();
        context.moveTo(cx - 14, y);
        context.lineTo(cx + 14, y + 12);
        context.moveTo(cx + 14, y);
        context.lineTo(cx - 14, y + 12);
        context.stroke();
    }

    // Her neck and head, rosy cheeks, a smile
    context.fillStyle = skin;
    context.strokeStyle = outline;
    context.lineWidth = 4;
    context.fillRect(cx - 22, 332, 44, 60);
    context.beginPath();
    context.ellipse(cx, 300, 62, 74, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = "rgba(220, 90, 80, 0.45)";

    for (const side of [-1, 1]) {
        context.beginPath();
        context.arc(cx + side * 32, 318, 13, 0, Math.PI * 2);
        context.fill();
    }

    context.fillStyle = outline;

    for (const side of [-1, 1]) {
        context.beginPath();
        context.ellipse(cx + side * 23, 290, 6, 8, 0, 0, Math.PI * 2);
        context.fill();
        context.lineWidth = 3;
        context.beginPath();
        context.arc(cx + side * 23, 276, 12, Math.PI * 1.15, Math.PI * 1.85);
        context.stroke();
    }

    context.strokeStyle = "#8a2418";
    context.lineWidth = 5;
    context.beginPath();
    context.arc(cx, 322, 20, 0.2 * Math.PI, 0.8 * Math.PI);
    context.stroke();

    // Fair hair, parted, in two braids over her shoulders
    context.fillStyle = "#d9a441";
    context.strokeStyle = "#7a5316";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx - 66, 300);
    context.quadraticCurveTo(cx - 70, 215, cx, 222);
    context.quadraticCurveTo(cx + 70, 215, cx + 66, 300);
    context.quadraticCurveTo(cx + 40, 250, cx, 246);
    context.quadraticCurveTo(cx - 40, 250, cx - 66, 300);
    context.fill();
    context.stroke();

    for (const side of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
            context.beginPath();
            context.ellipse(cx + side * (60 + k * 3), 312 + k * 22, 15, 13, side * 0.5, 0, Math.PI * 2);
            context.fill();
            context.stroke();
        }
    }

    // The scroll with the name
    const scrollTop = height - 150;

    context.fillStyle = "#efe0bb";
    context.strokeStyle = outline;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(64, scrollTop + 20);
    context.quadraticCurveTo(cx, scrollTop - 12, width - 64, scrollTop + 20);
    context.lineTo(width - 64, scrollTop + 96);
    context.quadraticCurveTo(cx, scrollTop + 64, 64, scrollTop + 96);
    context.closePath();
    context.fill();
    context.stroke();

    for (const side of [-1, 1]) {
        context.beginPath();
        context.ellipse(side < 0 ? 64 : width - 64, scrollTop + 58, 18, 40, 0, 0, Math.PI * 2);
        context.fill();
        context.stroke();
    }

    context.fillStyle = "#5c1a16";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = lettering(64);

    const measured = context.measureText(TAVERN_NAME).width;

    context.save();
    context.translate(cx, scrollTop + 50);
    context.scale(Math.min(1, (width - 190) / measured), 1);
    context.fillText(TAVERN_NAME, 0, 0);
    context.restore();

    return textureOf(canvas);
}

/**
 * How a fingerpost's board is shaped (as a share of its length, its pointed end): the board's
 * picture is painted to match (fingerboardTexture), and the board built to it (props.js).
 */
export const FINGER_TIP = 0.13;

// The letters on a fingerpost's boards: plain, bold and black, to be read from the road
const roadLetters = (size) => `bold ${size}px Georgia, "Palatino Linotype", "Times New Roman", serif`;

/**
 * A fingerpost's board's picture (a texture, 5 wide to 1 high: the board's length to its height),
 * as seen from one side: the board's pointed end `toward` "right" or "left" (seen from the other
 * side, it points the other way), a town's name on it, how far it is (`km`), and an arrow pointing
 * the way, in black on weathered pale oak within a dark line round its shape.
 */
export function fingerboardTexture({ name, km, toward = "right" }) {
    return once(`finger|${name}|${km}|${toward}`, () => paintFingerboard(name, km, toward === "left"));
}

function paintFingerboard(name, km, left) {
    const [width, height] = [960, 192];
    const { canvas, context } = canvasOf(width, height);
    const tip = width * FINGER_TIP;
    // (Where along it, from its square end: turned round for a board pointing left)
    const x = (along) => (left ? width - along : along);

    grain(context, width, height, "#c9a97a", "#7a5634", name.length);

    // A dark line round its shape, a little in from its edge
    context.strokeStyle = "#2a1a0e";
    context.lineWidth = 10;
    context.lineJoin = "miter";
    context.beginPath();
    context.moveTo(x(14), 14);
    context.lineTo(x(width - tip - 4), 14);
    context.lineTo(x(width - 16), height / 2);
    context.lineTo(x(width - tip - 4), height - 14);
    context.lineTo(x(14), height - 14);
    context.closePath();
    context.stroke();

    // The arrow, near the point: a shaft, and its head
    const [a0, a1] = [width - tip - 150, width - tip + 20];
    const [mid, shaft, head] = [height / 2, 13, 34];

    context.fillStyle = "#1c120a";
    context.beginPath();
    context.moveTo(x(a0), mid - shaft);
    context.lineTo(x(a1 - 46), mid - shaft);
    context.lineTo(x(a1 - 46), mid - head);
    context.lineTo(x(a1), mid);
    context.lineTo(x(a1 - 46), mid + head);
    context.lineTo(x(a1 - 46), mid + shaft);
    context.lineTo(x(a0), mid + shaft);
    context.closePath();
    context.fill();

    // How far, before the arrow; the name, the rest of the way (squeezed if it's long)
    const distance = `${km.toFixed(1)} km`;

    context.textBaseline = "middle";
    context.font = roadLetters(58);

    const far = context.measureText(distance).width;
    const [d0, d1] = [a0 - 24 - far, a0 - 24];

    context.textAlign = "left";
    context.fillText(distance, left ? width - d1 : d0, mid + 3);
    context.font = roadLetters(92);

    const room = d0 - 40 - 34;
    const measured = context.measureText(name).width;
    const squeeze = Math.min(1, room / measured);

    context.save();
    context.translate(left ? width - 34 - Math.min(room, measured) : 34, mid + 5);
    context.scale(squeeze, 1);
    context.fillText(name, 0, 0);
    context.restore();

    return textureOf(canvas);
}

/** A material showing a sign's picture (lit like the rest of the town). */
export function signMaterial(texture, name) {
    const result = new THREE.MeshLambertMaterial({ map: texture });

    result.name = name;
    result.shadowSide = THREE.DoubleSide;
    // (Each sign's own: let go with what it's on. Its picture is kept for the next)
    result.userData.own = true;

    return result;
}
