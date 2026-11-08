// The scroll a war's messenger carries their word on, floating over their head (core/host.js
// MESSENGER; app/game.js #scrollOver), so it's plain at a glance who they are: a roll of
// parchment, its rods' ends dark wood, a red ribbon and seal round its middle; bobbing up and down
// a little and turning slowly, and glowing faintly, to be seen at dusk. One made for all of them,
// each messenger's its own copy of it, sharing its geometry and materials.

import * as THREE from "three";

/**
 * How it's made and how it floats: its roll's length and radius (metres), how far its rods stand
 * out past it each end; how far over the messenger's head it floats (metres), how far it bobs up
 * and down (metres) and how often (times a second), and how quickly it turns (radians a second);
 * how faintly it glows.
 */
export const SCROLL = Object.freeze({ length: 0.52, radius: 0.08, rods: 0.05, over: 0.5, bob: 0.07, often: 0.9, spin: 0.9, glow: 0.35 });

let made = null;

// The scroll, once: its roll lying across, its rods, ribbon and seal
function scroll() {
    if (made) {
        return made;
    }

    const parchment = new THREE.MeshStandardMaterial({ color: 0xeedcb0, roughness: 0.85, emissive: 0xeedcb0, emissiveIntensity: SCROLL.glow });
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xa8201a, roughness: 0.55, emissive: 0x5a0a08, emissiveIntensity: SCROLL.glow });
    const group = new THREE.Group();
    const across = (mesh) => {
        mesh.rotation.z = Math.PI / 2;

        return mesh;
    };

    group.add(across(new THREE.Mesh(new THREE.CylinderGeometry(SCROLL.radius, SCROLL.radius, SCROLL.length, 16), parchment)));
    group.add(across(new THREE.Mesh(new THREE.CylinderGeometry(SCROLL.radius * 0.28, SCROLL.radius * 0.28, SCROLL.length + SCROLL.rods * 2, 8), wood)));

    for (const end of [-1, 1]) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(SCROLL.radius * 0.42, 8, 6), wood);

        knob.position.x = end * (SCROLL.length / 2 + SCROLL.rods);
        group.add(knob);
    }

    group.add(across(new THREE.Mesh(new THREE.CylinderGeometry(SCROLL.radius * 1.06, SCROLL.radius * 1.06, SCROLL.length * 0.12, 16), red)));

    const seal = new THREE.Mesh(new THREE.CylinderGeometry(SCROLL.radius * 0.55, SCROLL.radius * 0.55, 0.012, 12), red);

    seal.rotation.x = Math.PI / 2;
    seal.position.z = SCROLL.radius * 1.06;
    group.add(seal);
    group.traverse((node) => {
        node.castShadow = false;
        node.receiveShadow = false;
    });
    made = group;

    return made;
}

/** A messenger's scroll: its own copy of the one made (geometry and materials shared). */
export function makeScroll() {
    const copy = scroll().clone();

    copy.name = "scroll";

    return copy;
}

/**
 * The scroll placed over a head `height` metres up (in the messenger's own frame), at `time`
 * seconds: bobbing and turning as it floats.
 */
export function floatScroll(scroll, height, time) {
    scroll.position.set(0, height + SCROLL.over + Math.sin(time * SCROLL.often * Math.PI * 2) * SCROLL.bob, 0);
    scroll.rotation.y = time * SCROLL.spin;
}
