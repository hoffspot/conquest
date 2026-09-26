// Debug mode's view of the squares characters walk on, on one map (the town, or a floor of the
// tavern): a grid over the ground, the blocked squares tinted red, and the path ahead of each
// character there as a line (the player's gold, the others' red).

import * as THREE from "three";

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
    /** @param {object} map - One of generateWorld's maps (core/world.js): the town, or a floor inside. */
    constructor(map) {
        const { width, height, blocked, origin = [0, 0], id = "town" } = map;
        const data = new Uint8Array(width * height * 4);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (blocked[y][x]) {
                    data.set([235, 70, 50, 110], (y * width + x) * 4);
                }
            }
        }

        const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);

        texture.needsUpdate = true;

        const geometry = new THREE.PlaneGeometry(width, height).rotateX(-Math.PI / 2).translate(width / 2, 0.03, height / 2);
        const grid = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: { blocked: { value: texture }, size: { value: new THREE.Vector2(width, height) } },
            transparent: true,
            depthWrite: false,
        }));

        grid.renderOrder = 2;

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
                    positions.set([x, 0.06, y], count * 3);
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
