// The ground darkened under everyone standing on it: townsfolk and soldiers cast no shadow of the
// sun (there are too many of them), so they'd look set down on the street rather than standing
// on it. Under each is a soft round shadow of the light from all round that their body keeps off
// the ground at their feet (the way a person's feet are always darker underneath, sun or no sun):
// darkest under them, fading out over about half their height. All of them are one instanced
// mesh, a single draw call, the list made again each frame from those drawn.

import * as THREE from "three";

/**
 * How many can be shadowed at once (`most`), how dark it is under the middle of them at most
 * (`strength`: the share of the ground's light kept off it), and how far across (`across`: a share
 * of their height).
 */
export const CONTACT = Object.freeze({ most: 128, strength: 0.5, across: 0.46 });

const _matrix = new THREE.Matrix4();
const _at = new THREE.Vector3();
const _up = new THREE.Vector3();
const _size = new THREE.Vector3();
const _lying = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class ContactShadows {
    constructor() {
        const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

        // How dark each is (0 to 1: a share of CONTACT.strength)
        this.strengths = new Float32Array(CONTACT.most);
        geometry.setAttribute("contact", new THREE.InstancedBufferAttribute(this.strengths, 1).setUsage(THREE.DynamicDrawUsage));

        const material = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -2,
        });

        // (Round and soft: as dark as its strength in the middle, fading smoothly to nothing at its
        // edge. Black over the ground: it darkens it, and fog, which the ground under it has too,
        // takes it away with the ground)
        material.onBeforeCompile = (shader) => {
            shader.uniforms.contactStrength = { value: CONTACT.strength };
            shader.vertexShader = shader.vertexShader
                .replace("#include <common>", "#include <common>\nattribute float contact;\nvarying float vContact;\nvarying vec2 vContactAt;")
                .replace("#include <begin_vertex>", "#include <begin_vertex>\nvContact = contact;\nvContactAt = uv * 2.0 - 1.0;");
            shader.fragmentShader = shader.fragmentShader
                .replace("#include <common>", "#include <common>\nuniform float contactStrength;\nvarying float vContact;\nvarying vec2 vContactAt;")
                .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\nfloat contactFall = max(0.0, 1.0 - dot(vContactAt, vContactAt));\ndiffuseColor.a *= contactStrength * vContact * contactFall * contactFall;");
        };
        material.customProgramCacheKey = () => "contacts";

        this.mesh = new THREE.InstancedMesh(geometry, material, CONTACT.most);
        this.mesh.name = "contact shadows";
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1;
        this.mesh.count = 0;
        this.count = 0;

        /** The ground's height at a point ((x, z) => metres), to lie along; null: flat. */
        this.groundAt = null;
    }

    /** Start the list of those shadowed this frame. */
    begin() {
        this.count = 0;
    }

    /**
     * A shadow on the ground (at height `y`) under someone standing at (x, z), `tall` metres tall,
     * `strength` as dark as a whole one (0 to 1: fading as they rise off the ground, die or are
     * hardly seen).
     */
    add(x, y, z, tall, strength = 1) {
        if (this.count >= CONTACT.most || strength <= 0.01) {
            return;
        }

        const across = tall * CONTACT.across;
        const ground = this.groundAt;

        // (Lying along the ground where it slopes: not on a deck over it)
        if (ground && Math.abs(ground(x, z) - y) < 0.05) {
            const reach = across / 2;

            _up.set(ground(x - reach, z) - ground(x + reach, z), 2 * reach, ground(x, z - reach) - ground(x, z + reach)).normalize();
            _lying.setFromUnitVectors(UP, _up);
        } else {
            _lying.identity();
        }

        _matrix.compose(_at.set(x, y, z), _lying, _size.set(across, 1, across));
        this.mesh.setMatrixAt(this.count, _matrix);
        this.strengths[this.count] = Math.min(1, strength);
        this.count++;
    }

    /** The list's done: draw these. */
    end() {
        const { mesh, count } = this;
        const shown = mesh.geometry.attributes.contact;

        // (Nobody: not drawn at all)
        mesh.count = count;
        mesh.visible = count > 0;

        if (count > 0) {
            mesh.instanceMatrix.clearUpdateRanges();
            mesh.instanceMatrix.addUpdateRange(0, count * 16);
            mesh.instanceMatrix.needsUpdate = true;
            shown.clearUpdateRanges();
            shown.addUpdateRange(0, count);
            shown.needsUpdate = true;
        }
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.mesh.removeFromParent();
    }
}
