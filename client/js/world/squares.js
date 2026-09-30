// Debug mode's view of the squares characters walk on, on one map (the world outside, or a floor
// of the tavern): a grid over the ground, the blocked squares tinted (red where they hide what's
// behind them too, amber where they can be seen over), and the path ahead of each character there
// as a line (the player's gold, the others' red). Out in the world, only the squares round the
// player (WINDOW), shown afresh when they've gone far enough, laid over the ground as it rises and
// falls.

import * as THREE from "three";
import { squaresOf } from "../core/grid.js";

/** How many squares across are shown of a map bigger than that (round a point). */
export const WINDOW = 160;

const VERTEX = /* glsl */ `
varying vec2 vSquare;

void main() {
    vSquare = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D blocked;
uniform vec2 size;
varying vec2 vSquare;

void main() {
    vec2 cell = fract(vSquare);
    float line = step(cell.x, 0.03) + step(cell.y, 0.03);
    vec4 tint = texture2D(blocked, (floor(vSquare) + 0.5) / size);

    gl_FragColor = vec4(mix(tint.rgb, vec3(1.0), clamp(line, 0.0, 1.0) * 0.6), max(tint.a, clamp(line, 0.0, 1.0) * 0.28));
}`;

// How many path points there can be at once, over everyone
const PATH_POINTS = 512;

export class Squares {
    /**
     * @param {object} map - One of the world's maps (the world outside, or a floor inside).
     * @param {object} [options]
     * @param {number[]} [options.around] - Where to show the squares round ([x, y]), on a map
     *     more than WINDOW squares across.
     */
    constructor(map, { around = null } = {}) {
        const { origin = [0, 0], id = "town" } = map;
        const squares = squaresOf(map);
        const whole = squares.width <= WINDOW && squares.height <= WINDOW;
        const [cx, cy] = around ?? [squares.width / 2, squares.height / 2];
        const x0 = whole ? 0 : Math.max(0, Math.min(squares.width - WINDOW, Math.round(cx - WINDOW / 2)));
        const y0 = whole ? 0 : Math.max(0, Math.min(squares.height - WINDOW, Math.round(cy - WINDOW / 2)));
        const width = whole ? squares.width : WINDOW;
        const height = whole ? squares.height : WINDOW;
        const data = new Uint8Array(width * height * 4);

        /** The squares shown: [x0, y0, width, height] (all of them, or a window). */
        this.window = [x0, y0, width, height];
        this.whole = whole;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (squares.blocked(x0 + x, y0 + y)) {
                    data.set(squares.opaque(x0 + x, y0 + y) ? [235, 70, 50, 110] : [240, 170, 40, 100], (y * width + x) * 4);
                }
            }
        }

        const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);

        texture.needsUpdate = true;

        // (Over the ground, a corner a metre where it rises and falls)
        const heightAt = map.heightAt ? (x, y) => map.heightAt(Math.min(squares.width - 0.01, x), Math.min(squares.height - 0.01, y)) : null;
        const geometry = heightAt ? new THREE.PlaneGeometry(width, height, width, height) : new THREE.PlaneGeometry(width, height);

        geometry.rotateX(-Math.PI / 2).translate(width / 2, 0.03, height / 2);

        if (heightAt) {
            const corners = geometry.attributes.position;

            for (let k = 0; k < corners.count; k++) {
                corners.setY(k, heightAt(x0 + corners.getX(k), y0 + corners.getZ(k)) + 0.08);
            }

            geometry.computeBoundingSphere();
        }

        const grid = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: { blocked: { value: texture }, size: { value: new THREE.Vector2(width, height) } },
            transparent: true,
            depthWrite: false,
        }));

        grid.renderOrder = 2;
        grid.position.set(x0, 0, y0);

        const positions = new Float32Array(PATH_POINTS * 2 * 3);
        const colours = new Float32Array(PATH_POINTS * 2 * 3);
        const lines = new THREE.BufferGeometry();

        lines.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
        lines.setAttribute("color", new THREE.BufferAttribute(colours, 3).setUsage(THREE.DynamicDrawUsage));
        lines.setDrawRange(0, 0);
        this.paths = new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false }));
        this.paths.frustumCulled = false;
        this.paths.renderOrder = 3;

        this.object = new THREE.Group();
        this.object.name = "squares";
        this.object.add(grid, this.paths);
        this.object.position.set(origin[0], 0, origin[1]);

        /** Which map it's of. */
        this.mapId = id;
        this.heightAt = heightAt ?? (() => 0);
    }

    /**
     * Whether a point on its map ([x, y]) is far enough from the middle of the window shown to
     * show another round it (never, if all the map's shown).
     */
    strayed([x, y]) {
        const [x0, y0, width, height] = this.window;

        return !this.whole && Math.abs(x - (x0 + width / 2)) > width / 4 || Math.abs(y - (y0 + height / 2)) > height / 4;
    }

    /** Draw the path of each character on its map, from where it is through the squares ahead of it. */
    update(battle) {
        const geometry = this.paths.geometry;
        const positions = geometry.attributes.position.array;
        const colours = geometry.attributes.color.array;
        const gold = [1, 0.85, 0.3];
        const red = [1, 0.35, 0.3];
        let count = 0;

        for (const actor of battle.actors) {
            if (actor.dead || (actor.map ?? "town") !== this.mapId) {
                continue;
            }

            const points = [[actor.x, actor.y], ...(actor.to ? [[actor.to[0] + 0.5, actor.to[1] + 0.5]] : []), ...actor.path.map(([x, y]) => [x + 0.5, y + 0.5])];
            const colour = actor.id === "player" ? gold : red;

            for (let i = 0; i < points.length - 1 && count < PATH_POINTS * 2; i++) {
                for (const [x, y] of [points[i], points[i + 1]]) {
                    positions.set([x, this.heightAt(x, y) + 0.12, y], count * 3);
                    colours.set(colour, count * 3);
                    count++;
                }
            }
        }

        geometry.setDrawRange(0, count);
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
    }
}
