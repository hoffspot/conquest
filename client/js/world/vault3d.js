// The doors the rare encounters inside add to a dungeon's floor (core/rare.js VAULT; host.js
// #vaultBuild: the world's links of kind "vault"), on the floor's side: a stone arch against the
// rock where its foe fell, the dark of the way in behind it, and, while it's shut (its key not
// carried), a seal across it, a disc of the uniques' sea-green, breathing. The sealed room behind it
// is drawn as the dungeon's floors are (world/interiors3d.js: it's a map of the dungeon's own look).
// Made once each as its link's come into the world (sync), shown only on the map it's on.

import * as THREE from "three";

// The arch (metres): its opening's width and height, its jambs' and its lintel's thickness, how
// far it stands out from the rock; the seal's radius, how high its middle is, how often a second
// it breathes, and the sea-green it glows (styles.css .rarity-unique)
const ARCH = Object.freeze({ width: 1.1, height: 2.3, jamb: 0.28, lintel: 0.32, out: 0.26 });
const SEAL = Object.freeze({ radius: 0.42, high: 1.25, breath: 0.6, colour: 0x3fe0c0 });

/**
 * Where a link's end on a floor (`end`: { squares: [the rock it's against], arrive: the square
 * before it }) meets the floor, in its map's own metres: { at: [x, z] (the middle of its face),
 * normal: [x, z] (out of the rock, towards whoever would go in), across: [x, z] }.
 */
export function faceOf(end) {
    const [[x, z]] = end.squares;
    const [dx, dz] = [Math.sign(end.arrive[0] - x), Math.sign(end.arrive[1] - z)];
    const normal = Math.abs(dx) >= Math.abs(dz) ? [dx || 1, 0] : [0, dz || 1];

    return { at: [x + 0.5 + normal[0] * 0.5, z + 0.5 + normal[1] * 0.5], normal, across: [-normal[1], normal[0]] };
}

/** The doors the rare encounters inside add to dungeons' floors, drawn. */
export class VaultDoors {
    /**
     * @param {object} world - The world (its maps and links).
     * @param {THREE.Scene} scene - What they're drawn in.
     */
    constructor(world, scene) {
        this.world = world;
        this.object = new THREE.Group();
        this.object.name = "vault-doors";
        scene.add(this.object);

        /** Each drawn, by its link's id: { link, end, group, seal }. */
        this.drawn = new Map();
        this.stone = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.95 });
        this.dark = new THREE.MeshBasicMaterial({ color: 0x050403 });
        this.glow = new THREE.MeshBasicMaterial({ color: SEAL.colour, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    }

    /** Catch up with the world's links: an arch for each vault's door on a floor there's a map for, and none for one gone. */
    sync() {
        const vaults = this.world.links.filter((link) => link.kind === "vault");

        for (const link of vaults) {
            const end = link.ends.find((one) => !this.world.maps[one.map]?.dungeon?.vault);

            if (!this.drawn.has(link.id) && end && this.world.maps[end.map]) {
                this.#add(link, end);
            }
        }

        for (const [id, { group }] of this.drawn) {
            if (!vaults.some((link) => link.id === id)) {
                group.removeFromParent();
                this.drawn.delete(id);
            }
        }
    }

    #add(link, end) {
        const { at, normal, across } = faceOf(end);
        const [ox, oz] = this.world.maps[end.map].origin;
        const group = new THREE.Group();
        const box = (w, h, d, x, y, z, material) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

            mesh.position.set(x, y, z);
            group.add(mesh);

            return mesh;
        };
        const half = ARCH.width / 2 + ARCH.jamb / 2;

        // (Built along x, facing +z, then turned to the face: its jambs, its lintel over them, and the
        // dark of the way in between)
        box(ARCH.jamb, ARCH.height, ARCH.out, -half, ARCH.height / 2, 0, this.stone);
        box(ARCH.jamb, ARCH.height, ARCH.out, half, ARCH.height / 2, 0, this.stone);
        box(ARCH.width + ARCH.jamb * 2 + 0.1, ARCH.lintel, ARCH.out + 0.04, 0, ARCH.height + ARCH.lintel / 2, 0, this.stone);

        const way = new THREE.Mesh(new THREE.PlaneGeometry(ARCH.width, ARCH.height), this.dark);

        way.position.set(0, ARCH.height / 2, -ARCH.out / 2 + 0.01);
        group.add(way);

        const seal = new THREE.Mesh(new THREE.CircleGeometry(SEAL.radius, 28), this.glow);

        seal.position.set(0, SEAL.high, 0.02);
        group.add(seal);
        group.position.set(ox + at[0] + normal[0] * (ARCH.out / 2), 0, oz + at[1] + normal[1] * (ARCH.out / 2));
        group.rotation.y = Math.atan2(normal[0], normal[1]);
        group.userData.across = across;
        group.visible = false;
        group.name = `vault-door-${link.vault}`;
        this.object.add(group);
        this.drawn.set(link.id, { link, end, group, seal });
    }

    /**
     * Show those on `map` (the map the player's on), each one's seal while it's shut to them
     * (`shut`: given its link, whether it is), breathing, at `time` seconds.
     */
    update(time, { map, shut }) {
        const breath = 0.55 + 0.45 * Math.sin(time * Math.PI * 2 * SEAL.breath);

        for (const { link, end, group, seal } of this.drawn.values()) {
            group.visible = end.map === map;
            seal.visible = group.visible && shut(link);

            if (seal.visible) {
                seal.material.opacity = 0.45 + 0.4 * breath;
                seal.scale.setScalar(0.94 + 0.06 * breath);
            }
        }
    }

    dispose() {
        this.object.removeFromParent();

        for (const { group } of this.drawn.values()) {
            group.traverse((part) => part.geometry?.dispose());
        }

        this.drawn.clear();

        for (const material of [this.stone, this.dark, this.glow]) {
            material.dispose();
        }
    }
}
