// Renders one piece (a tower, a house, a tree...) as the game would see it: with the game's
// orthographic camera looking down from CAMERA_PITCH, and the same sky and sunlight as the 3D
// units (units3d.js), so that the art lines up with the map and matches the units.
//
// Each piece gives two images:
//   sprite  the piece itself, on a transparent background, shaded by its own shadows
//   shadow  the shadow it casts on the ground (black, with the shadow's strength as alpha)
// Keeping the ground shadow separate lets neighbouring pieces' shadows merge without doubling up
// where they overlap, and lets units drive through a shadow instead of under it.

import * as THREE from "three";
import { CAMERA_PITCH } from "../../../client/js/app/perspective.js";

const SIN_PITCH = Math.sin(CAMERA_PITCH);
const COS_PITCH = Math.cos(CAMERA_PITCH);
const CAMERA_DISTANCE = 5000;

// The sun, as in units3d.js: from the north-west, high in the sky
const SUN = new THREE.Vector3(-1, 2, -1.2).normalize();

// How much further a shadow reaches than the thing casting it is tall (sun from units3d.js)
const SHADOW_REACH = Math.hypot(SUN.x, SUN.z) / SUN.y;

// Rendered this many times larger and scaled down, for smooth edges
const SUPERSAMPLE = 3;

// Draws an object invisibly, while it still casts its shadow
const HIDDEN = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

HIDDEN.shadowSide = THREE.DoubleSide;

export class PieceRenderer {
    constructor() {
        this.canvas = document.createElement("canvas");
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(1);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;

        this.scene = new THREE.Scene();
        this.sun = new THREE.DirectionalLight(0xffffff, 1.8);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(4096, 4096);
        this.sun.shadow.bias = -0.0004;
        this.sun.shadow.normalBias = 0.4;
        this.sun.shadow.radius = 2;

        // A soft light from the viewer's side, so that the south faces the camera sees (walls,
        // doors, roofs) are not lost in shade. It casts no shadows.
        const fill = new THREE.DirectionalLight(0xfff4e0, 0.55);

        fill.position.set(0.4, 1, 1.4);
        this.scene.add(new THREE.HemisphereLight(0xe6ecff, 0x40402c, 1.125), this.sun, this.sun.target, fill);

        // The ground only shows the shadows falling on it
        this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ color: 0x000000, opacity: 1 }));
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0, 2 * CAMERA_DISTANCE);
        this.camera.rotation.x = -CAMERA_PITCH;
    }

    /**
     * Render an object built in piece coordinates (world pixels, x east, y up, z south). Returns
     * the sprite and shadow images (`scale` image pixels per world pixel) and where their top-left
     * corner is on the map, in world pixels from the piece's origin.
     */
    render(object, { scale }) {
        object.updateMatrixWorld(true);

        const bounds = new THREE.Box3().setFromObject(object);
        const tall = Math.max(0, bounds.max.y);
        const margin = 2;
        const x0 = Math.floor(bounds.min.x - margin);
        const x1 = Math.ceil(bounds.max.x + tall * SHADOW_REACH * 0.7 + margin);
        const y0 = Math.floor(bounds.min.z - tall * COS_PITCH - margin);
        const y1 = Math.ceil(bounds.max.z + tall * SHADOW_REACH * 0.85 + margin);
        const width = x1 - x0;
        const height = y1 - y0;

        // Stretch the ground away from the camera so that the tilted camera sees it 1:1
        const holder = new THREE.Group();

        holder.scale.z = 1 / SIN_PITCH;
        holder.add(object);
        this.scene.add(holder);
        holder.updateMatrixWorld(true);

        this.camera.left = x0;
        this.camera.right = x1;
        this.camera.top = -y0;
        this.camera.bottom = -y1;
        this.camera.position.set(0, CAMERA_DISTANCE * SIN_PITCH, CAMERA_DISTANCE * COS_PITCH);
        this.camera.updateProjectionMatrix();

        // Aim the sun's shadow at the piece
        const centre = new THREE.Box3().setFromObject(holder).getCenter(new THREE.Vector3());
        const reach = new THREE.Box3().setFromObject(holder).getSize(new THREE.Vector3()).length() / 2 + 8;
        const shadowCamera = this.sun.shadow.camera;

        this.sun.target.position.copy(centre);
        this.sun.position.copy(centre).addScaledVector(SUN, 2000);
        shadowCamera.left = -reach;
        shadowCamera.right = reach;
        shadowCamera.top = reach;
        shadowCamera.bottom = -reach;
        shadowCamera.near = 1;
        shadowCamera.far = 4000;
        shadowCamera.updateProjectionMatrix();
        this.sun.target.updateMatrixWorld();

        this.ground.scale.set(width * 4, 1, (height * 4) / SIN_PITCH);
        this.ground.position.set((x0 + x1) / 2, 0, (y0 + y1) / 2 / SIN_PITCH);

        const size = [Math.round(width * scale), Math.round(height * scale)];

        this.renderer.setSize(size[0] * SUPERSAMPLE, size[1] * SUPERSAMPLE, false);

        // The piece itself
        this.ground.visible = false;
        this.renderer.render(this.scene, this.camera);

        const sprite = this.#capture(size);

        // Its shadow on the ground
        const materials = new Map();

        object.traverse((node) => {
            if (node.isMesh) {
                materials.set(node, node.material);
                node.material = HIDDEN;
            }
        });
        this.ground.visible = true;
        this.renderer.render(this.scene, this.camera);

        const shadow = this.#capture(size);

        for (const [node, original] of materials) {
            node.material = original;
        }

        holder.remove(object);
        this.scene.remove(holder);

        return { sprite, shadow, x: x0, y: y0, width, height };
    }

    // Copy the rendering, scaled down to its final size
    #capture([width, height]) {
        const canvas = document.createElement("canvas");

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        context.imageSmoothingQuality = "high";
        context.drawImage(this.canvas, 0, 0, width, height);

        return canvas;
    }
}
