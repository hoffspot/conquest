// The Light spell's globes (core/spells.js light; the terrain plan's M7e, §9 Day and night: "a
// globe of light rising from the caster's hand and following a little over their shoulder"): a
// small bright ball with a soft glow round it, drifting after whoever cast it a little over their
// shoulder and bobbing as it goes, and lighting what's round it in a cool white, a light of its
// own among the world's (lights.js: a spell's, steady, not a flame's). In the rules it lets them
// see the dark round them as by day (core/light.js).
//
// The ball's shape, its material and its glow's picture are made once and shared by every globe.

import * as THREE from "three";

// Where it floats (metres, the caster's own way: right of them, up, behind), how far it bobs and
// how quickly it catches up with them (a share of the way a second)
const OVER = Object.freeze({ side: 0.42, up: 2.05, back: -0.32 });
const BOB = 0.06;
const FOLLOW = 5;

// Its light: cool white, steadier than any flame's, as strong as a brazier's and reaching a little
// further than the rules' 12 m (so the edge of what's seen isn't the edge of what's lit)
const LIGHT = Object.freeze({ colour: 0xd6e4ff, strength: 5.5, reach: 13, steady: 0.08 });

const _over = new THREE.Vector3();

// A soft round glow (a canvas: white in the middle fading to nothing at the edge)
function glowTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");

    canvas.width = canvas.height = size;

    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(220,232,255,0.55)");
    gradient.addColorStop(1, "rgba(200,220,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;

    return texture;
}

export class LightGlobes {
    /** @param {THREE.Scene} scene */
    constructor(scene) {
        this.group = new THREE.Group();
        this.group.name = "light globes";
        scene.add(this.group);

        this.ball = new THREE.SphereGeometry(0.1, 12, 8);
        this.core = new THREE.MeshBasicMaterial({ color: 0xf2f7ff, toneMapped: false });
        this.halo = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xc8dcff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });

        // Each globe shining, by whose it is: { object, light, seen }
        this.globes = new Map();

        // Their lights (lights.js lightNow's), the same list each time
        this.list = [];
    }

    /**
     * Who has a globe over them now (`casters`: { id, object (their avatar's), shown }), `dt`
     * seconds on, at `time` (s): each globe drifting after its caster, those put out gone.
     */
    update(casters, dt, time) {
        const now = new Set();

        for (const { id, object, shown } of casters) {
            now.add(id);
            _over.set(OVER.side, OVER.up, OVER.back).applyQuaternion(object.quaternion).add(object.position);

            let globe = this.globes.get(id);

            if (!globe) {
                const ball = new THREE.Group();
                const halo = new THREE.Sprite(this.halo);

                halo.scale.setScalar(0.9);
                ball.add(new THREE.Mesh(this.ball, this.core), halo);
                ball.name = `light globe:${id}`;

                // (Rising from their hand: from their middle, up to over their shoulder)
                ball.position.copy(object.position).setY(object.position.y + 1.1);
                globe = { object: ball, light: { x: 0, y: 0, z: 0, kind: "spell", ...LIGHT, seed: (id.length * 0.37) % 1 } };
                this.group.add(ball);
                this.globes.set(id, globe);
            }

            const phase = time * 1.7 + id.length;

            _over.y += Math.sin(phase) * BOB;
            globe.object.position.lerp(_over, Math.min(1, dt * FOLLOW));
            globe.object.visible = shown;
            Object.assign(globe.light, { x: globe.object.position.x, y: globe.object.position.y, z: globe.object.position.z });
        }

        for (const [id, globe] of [...this.globes]) {
            if (!now.has(id)) {
                globe.object.removeFromParent();
                this.globes.delete(id);
            }
        }

        this.list.length = 0;

        for (const { object, light } of this.globes.values()) {
            if (object.visible) {
                this.list.push(light);
            }
        }
    }

    /** The globes' lights now (lights.js's: each its own). */
    lights() {
        return this.list;
    }

    /** Every globe gone (the game's over, or the world's being let go). */
    dispose() {
        this.group.removeFromParent();
        this.globes.clear();
        this.ball.dispose();
        this.core.dispose();
        this.halo.map.dispose();
        this.halo.dispose();
    }
}
