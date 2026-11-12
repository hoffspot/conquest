// The wardrobe's painter off the page's thread (in the skins' worker: skin-worker.js): each
// garment's own picture painted there and kept there, and an outfit's two put together from them
// and sent back, so that none of it is painted, nor any garment's picture held, on the page
// (wardrobe.js, which asks for them: skins.js askPicture). The pictures are the page's own to
// the last byte: the same painter (garment-pictures.js), the same body, the same measurements
// (the page's, sent over).
//
// It keeps what the page's wardrobe would: where each texel is on the body, and each garment's
// picture for PICTURES.garments seconds after it was last used (painted again when it's next
// wanted), all of them let go of at once when the page says it's short of memory (letGo).
// Nothing here needs three.js or the page.

import { forgetPoints, GARMENTS, paintingGarment, picturingOutfit, pointsHeld, texelMap } from "./garment-pictures.js";
import { PICTURES } from "./pictures.js";
import { allAtOnce } from "../core/steps.js";

export class GarmentPainter {
    /** @param {object} human - The body (body.js HumanData) garments are painted for. */
    constructor(human) {
        this.human = human;

        // What garments are painted on: the body of the usual shape's measurements (the page's:
        // wardrobe.js referenceMeasures), and where each texel is on it
        this.measures = null;
        this.map = null;

        // Each garment's own picture, by id: { painted ({ data, bump, size }), used (ms) }
        this.pictures = new Map();
    }

    /** The measurements garments are painted on, sent over before the first is asked for. */
    measure(measures) {
        this.measures = measures;
        this.pictures.clear();
    }

    // Where each texel is on the body, for pictures `size` a side
    #mapAt(size) {
        if (!this.measures) {
            throw new Error("Garments can't be painted before the body's measurements are sent");
        }

        if (this.map?.size !== size) {
            this.map = texelMap(this.human, size);
            this.pictures.clear();
        }

        return this.map;
    }

    /**
     * A garment's own picture (`size` a side), painted the first time and kept: { data, bump,
     * size }, not to be changed. Used at `now` (ms).
     */
    garment(id, size, now = performance.now()) {
        return allAtOnce(this.painting(id, size, now));
    }

    /** The same, a step at a time (each a yield: a few rows of it painted), returning it. */
    *painting(id, size, now = performance.now()) {
        const garment = GARMENTS[id];

        // (Its own: a people's make of one is drawn with the picture of the one it's tinted
        // from; one cut from a design is the page's, see-through)
        if (!garment || garment.base || garment.design) {
            throw new Error(`No picture of its own to paint for the garment ${id}`);
        }

        const map = this.#mapAt(size);
        let held = this.pictures.get(id);

        if (!held) {
            held = { painted: yield* paintingGarment(map, garment, this.measures), used: now };
            this.pictures.set(id, held);
        }

        held.used = now;

        return held.painted;
    }

    /**
     * An outfit's two pictures put together (ids, outermost last), a step at a time (each
     * garment's picture not yet here painted first, in steps), returning them:
     * garment-pictures.js picturingOutfit's { full, small }.
     */
    *outfitting(ids, { size, least = size, colour = true }, now = performance.now()) {
        return yield* picturingOutfit(this.#mapAt(size), this.measures, ids, (id) => this.painting(GARMENTS[id].base ?? id, size, now), { least, colour });
    }

    /**
     * The garments' pictures not used since `before` (ms) let go of: all of them, with none
     * given, and with them what's kept for painting them faster (where each texel is on the
     * body's measurements: 4 MB), made again for the next.
     */
    letGo(before = Infinity) {
        for (const [id, { used }] of [...this.pictures]) {
            if (used <= before) {
                this.pictures.delete(id);
            }
        }

        if (before === Infinity && this.map) {
            forgetPoints(this.map);
        }
    }

    /** Those unused for PICTURES.garments seconds at `now` (ms) let go of; how many are kept. */
    sweep(now = performance.now()) {
        this.letGo(now - PICTURES.garments * 1000);

        return this.pictures.size;
    }

    /** How many bytes of pictures and of what they're painted by it holds. */
    get held() {
        let bytes = this.map ? pointsHeld(this.map) : 0;

        for (const data of Object.values(this.map ?? {})) {
            bytes += ArrayBuffer.isView(data) ? data.byteLength : 0;
        }

        for (const { painted } of this.pictures.values()) {
            bytes += painted.data.byteLength + painted.bump.byteLength;
        }

        return bytes;
    }
}
