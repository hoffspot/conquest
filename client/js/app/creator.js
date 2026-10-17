// The character maker: the new character stands on a plinth in the 3D view while the panel beside
// it (below it, on an upright phone) shapes the body and face, picks skin, eyes and hair, arms it
// with a starting weapon and names it.
//
//     const hero = await new Creator({ view, kit }).run();   // null if the player went back
//
// Drag across the view (a finger, or the mouse) to walk round the character, and pinch (or turn the
// mouse wheel) to come nearer or stand further off, never so near the camera cuts into them; each
// tab frames what it changes (the face close up, the hair head and shoulders). Choosing a weapon
// shows it held on guard and swung.

import * as THREE from "three";
import { Character } from "../characters/character.js";
import { EQUIPMENT } from "../characters/equipment.js";
import { DETAILS } from "../characters/details.js";
import { BEARDS, HAIRSTYLES } from "../characters/hair.js";
import { HAIR_COLOURS } from "../characters/skin.js";
import { armsOf, STARTING_WEAPONS, WEAPONS } from "../core/weapons.js";
import { Avatar } from "../world/avatar.js";
import { bakeStudio } from "../world/environment.js";
import { Progress } from "../core/progress.js";
import { Steps } from "../core/steps.js";
import { guardOf, heroEquipment } from "./game.js";
import { cleanName, defaultHero, HERO_PEOPLES, heroOfPeople, IRIS_COLOURS, randomHero, suggestName, tonesOf } from "./heroes.js";

const STEPS = ["look", "weapon", "name"];

// Where the camera looks from for each tab: what it looks at (share of the character's height)
// and from how far (metres)
const FRAMING = {
    body: { at: 0.52, distance: 4.5 },
    face: { at: 0.935, distance: 0.95 },
    colours: { at: 0.86, distance: 1.7 },
    weapon: { at: 0.55, distance: 4.8 },
    name: { at: 0.55, distance: 4.8 },
};

// How much further away the camera stands on an upright screen (the panel takes the lower half)
const UPRIGHT_DISTANCE = 1.6;

// How often the weapon is swung while choosing one (seconds)
const DEMO_EVERY = 3.2;

// A body's shape is rebuilt at most this often while a slider is dragged (ms)
const RESHAPE_EVERY = 90;

// How far a pinch or the mouse wheel takes the camera out, as a share of the distance the tab
// frames the character from (in, as near as NEAREST lets it)
const ZOOM_OUT = 1.6;

/**
 * How near the camera may come to the character (#nearest), so it never cuts into them: along its
 * line to what it looks at, `margin` metres further out than the last of them within `side` metres
 * of that line, as they're shaped, dressed and posed then; and, while it's being turned, further
 * out than that where it's going and `ahead` radians past it, so it eases back before an arm or a
 * shield comes between. Where they are is measured (pointsOf) from every corner of what's drawn of
 * them, each triangle wider than `spacing` metres filled in, a point kept in each `grain`-metre
 * cube, `budget` ms a frame (some 150 ms in all), once they're first drawn and again `settle` ms
 * after they're last changed; till they're first measured, the camera comes no nearer than the tab
 * frames them from. While a weapon's swung, the camera keeps out of its sweep too: as far from
 * what it looks at as `arm` of their height and the longest thing they hold.
 */
const NEAREST = Object.freeze({ margin: 0.1, side: 0.08, ahead: 0.25, spacing: 0.06, grain: 0.02, budget: 4, settle: 300, arm: 0.6 });

// How many points of a character's measured between looks at the time (pointsOf)
const POINTS_A_STEP = 1500;

/**
 * Where a character is as they stand now (`object`), a step at a time (core/steps.js): every
 * corner of each mesh drawn of them, their skin posed by their bones, and points filling in each
 * triangle wider than `spacing` metres, so none can be passed through between its corners; one
 * kept in each `grain`-metre cube (`points`: x, y, z in the world, metres); and the longest thing
 * they hold or wear that isn't skin (`longest`, metres: a weapon, end to end).
 */
function* pointsOf(object, { spacing, grain }) {
    const point = new THREE.Vector3();
    const [a, b, c, ab, ac] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const scale = new THREE.Vector3();
    const points = [];
    const meshes = [];
    const cubes = new Set();
    let longest = 0;
    let counted = 0;
    // (A point kept, unless one's been kept in its cube already: cubes counted from 10 m below,
    // west and north of them, 2,048 a side)
    const keep = ({ x, y, z }) => {
        const cube = Math.floor(x / grain + 1024) + Math.floor(y / grain + 1024) * 2048 + Math.floor(z / grain + 1024) * 2048 * 2048;

        if (!cubes.has(cube)) {
            cubes.add(cube);
            points.push(x, y, z);
        }
    };
    // (Drawn: it and all it's part of shown)
    const shown = (node) => node === object || (node.visible && (!node.parent || shown(node.parent)));

    object.updateMatrixWorld(true);
    object.traverse((mesh) => mesh.isMesh && shown(mesh) && meshes.push(mesh));

    for (const mesh of meshes) {
        const { geometry } = mesh;
        const count = geometry.attributes.position.count;
        const at = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            mesh.getVertexPosition(i, point);

            if (mesh.isSkinnedMesh) {
                mesh.applyBoneTransform(i, point);
            }

            point.applyMatrix4(mesh.matrixWorld).toArray(at, i * 3);
            keep(point);

            if (++counted % POINTS_A_STEP === 0) {
                yield;
            }
        }

        // (Each triangle wider than `spacing` filled in, on a grid as fine)
        const corners = geometry.index?.count ?? count;

        for (let t = 0; t + 2 < corners; t += 3) {
            const [i, j, k] = [t, t + 1, t + 2].map((n) => geometry.index?.getX(n) ?? n);

            a.fromArray(at, i * 3);
            b.fromArray(at, j * 3);
            c.fromArray(at, k * 3);

            const wide = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));

            if (wide > spacing) {
                const n = Math.ceil(wide / spacing);

                ab.subVectors(b, a);
                ac.subVectors(c, a);

                for (let u = 0; u <= n; u++) {
                    for (let v = 0; v <= n - u; v++) {
                        keep(point.copy(a).addScaledVector(ab, u / n).addScaledVector(ac, v / n));
                    }
                }
            }

            if (++counted % POINTS_A_STEP === 0) {
                yield;
            }
        }

        if (!mesh.isSkinnedMesh) {
            geometry.boundingSphere ?? geometry.computeBoundingSphere();
            mesh.matrixWorld.decompose(point, new THREE.Quaternion(), scale);
            longest = Math.max(longest, geometry.boundingSphere.radius * 2 * Math.max(scale.x, scale.y, scale.z));
        }
    }

    return { points: Float32Array.from(points), longest };
}

/**
 * How far from `look` (THREE.Vector3) along the line to a camera round it at `angle` (radians,
 * looking down at `pitch`) the last of `points` (pointsOf's) within `side` metres of that line is
 * (metres; 0 if none are). A pure function.
 */
export function clearAlong(points, look, angle, pitch, side) {
    const [ux, uy, uz] = [Math.sin(angle) * Math.cos(pitch), Math.sin(pitch), Math.cos(angle) * Math.cos(pitch)];
    let last = 0;

    for (let i = 0; i < points.length; i += 3) {
        const [x, y, z] = [points[i] - look.x, points[i + 1] - look.y, points[i + 2] - look.z];
        const along = x * ux + y * uy + z * uz;

        if (along > last && x * x + y * y + z * z - along * along < side * side) {
            last = along;
        }
    }

    return last;
}

const element = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(attributes)) {
        if (key === "class") {
            node.className = value;
        } else if (key.startsWith("on")) {
            node.addEventListener(key.slice(2), value);
        } else if (value !== undefined && value !== false) {
            node.setAttribute(key, value === true ? "" : value);
        }
    }

    node.append(...children.filter((child) => child !== null && child !== undefined && child !== false));

    return node;
};

const title = (text) => text[0].toUpperCase() + text.slice(1).replace(/([A-Z])/g, " $1").toLowerCase();

/**
 * Words for a weapon's numbers: damage, reach and speed; or, with spiked boots too (`boots`), a
 * kick's or the weapon's, and how they mix.
 */
export function weaponNumbers(weapon, boots = false) {
    const range = (least, most) => (least === most ? `${least}` : `${least}–${most}`);

    return armsOf(weapon, boots).map((attack) => {
        const { kind, reach } = attack;
        const { damage: [least, most], interval } = attack.either?.[0] ?? attack;
        const where = kind === "melee" ? "up close" : `${reach} m`;
        const how = attack.either ? " (kicks or the weapon)" : boots && attack.id === "kick" && weapon !== "boots" ? " (kicks)" : "";

        return `${range(least, most)} damage ${where}${how}${attack.either ? "" : ` · ${(1000 / interval).toFixed(1)} a second`}`;
    }).join("; ");
}

export class Creator {
    /**
     * @param {object} options
     * @param {import("../world/view.js").View} options.view - Draws the character (its renderer).
     * @param {object} options.kit - What characters are made from (characters/kit.js).
     * @param {HTMLElement} [options.root] - The #create screen.
     */
    constructor({ view, kit, root = document.querySelector("#create") }) {
        this.view = view;
        this.kit = kit;
        this.root = root;
        this.refreshers = [];
        this.pending = new Set();
        this.lastReshape = 0;
        this.orbit = { angle: 0.35, target: 0.35, pitch: 0.08, zoom: 1 };
        // (Where the character is, pointsOf: measured once they're drawn, `at` then, and as they're
        // being measured; and when they were last changed)
        this.measured = null;
        this.measuring = null;
        this.changedAt = 0;
        this.tab = "body";
        this.step = "look";
        this.demoAt = 0;

        this.#buildStage();
    }

    /**
     * Make a character, starting from `hero` (a new one if not given). Resolves with it, named
     * and armed, or null if the player went back to the title.
     */
    run(hero = defaultHero()) {
        this.hero = structuredClone(hero);
        this.hero.weapon = STARTING_WEAPONS.includes(this.hero.weapon) ? this.hero.weapon : STARTING_WEAPONS[0];
        this.hero.boots = Boolean(this.hero.boots) && this.hero.weapon !== "boots";

        this.#buildCharacter();
        this.#buildPanel();
        this.#goTo("look");
        this.root.hidden = false;
        this.#listen();
        this.lastFrame = performance.now();
        this.view.renderer.setAnimationLoop((now) => this.#frame(now));

        return new Promise((resolve) => (this.finish = resolve));
    }

    #close(result) {
        this.view.renderer.setAnimationLoop(null);

        for (const [target, type, listener] of this.listeners) {
            target.removeEventListener(type, listener);
        }

        this.avatar?.object.removeFromParent();
        this.avatar?.character.dispose();
        this.avatar = null;
        this.studio.dispose();
        this.root.hidden = true;
        this.finish(result);
    }

    // --- The stage ---

    #buildStage() {
        const scene = new THREE.Scene();

        scene.background = new THREE.Color(0x17130f);
        scene.fog = new THREE.Fog(0x17130f, 6, 14);
        // (A studio's light, grey and white, so the colours chosen are seen as they are)
        this.studio = bakeStudio(this.view.renderer);
        scene.environment = this.studio.texture;
        scene.environmentIntensity = 0.55;

        const key = new THREE.DirectionalLight(0xfff0dc, 2.4);

        key.position.set(2.2, 4.5, 3.2);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.bias = -0.0004;
        key.shadow.normalBias = 0.02;
        Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.4, bottom: -0.4, near: 0.5, far: 12 });

        const rim = new THREE.DirectionalLight(0x9fc0ff, 1.3);

        rim.position.set(-2.5, 2.5, -3);
        scene.add(key, rim, new THREE.HemisphereLight(0xd8e4ff, 0x3a2e22, 0.5));

        // A round stone plinth, and a pool of warm light on it
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.14, 64), new THREE.MeshStandardMaterial({ color: 0x5b534a, roughness: 0.85 }));

        plinth.position.y = -0.07;
        plinth.receiveShadow = true;

        const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x241e18, roughness: 1 }));

        floor.position.y = -0.14;
        floor.receiveShadow = true;
        scene.add(plinth, floor);

        this.scene = scene;
        this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
        this.look = new THREE.Vector3(0, 0.9, 0);
        this.distance = FRAMING.body.distance;
    }

    #buildCharacter() {
        const { hero } = this;

        // (Someone new: where they are measured afresh, #nearest)
        this.measured = null;
        this.measuring = null;

        this.avatar?.object.removeFromParent();
        this.avatar?.character.dispose();

        const character = new Character(this.kit, { shape: hero.shape, look: hero.look, equipment: heroEquipment(hero.weapon, new Progress({}, hero).worn(), hero.parts ?? []) });

        this.avatar = new Avatar(character, { guard: guardOf(hero.weapon) });
        this.avatar.place(0, 0, 0);
        this.scene.add(character.object);
    }

    // Apply changes to the character, at most once a frame (and reshaping less often: it's slow)
    #applyChanges(now) {
        const { pending, avatar, hero } = this;

        if (!pending.size || !avatar) {
            return;
        }

        const character = avatar.character;

        if (pending.has("shape")) {
            if (now - this.lastReshape < RESHAPE_EVERY) {
                return;
            }

            this.lastReshape = now;
            character.setShape(hero.shape);
            avatar.walker.measure();
        }

        if (pending.has("look")) {
            character.setLook(hero.look);
        }

        if (pending.has("weapon")) {
            character.setEquipment(heroEquipment(hero.weapon, new Progress({}, hero).worn(), hero.parts ?? []));
            avatar.actions.setWeapon(guardOf(hero.weapon));
            avatar.actions.setGuard(this.step !== "look");
            this.#showDraw();
        }

        // (Measured again once they've settled: #nearest)
        this.changedAt = now;
        pending.clear();
    }

    #change(...what) {
        for (const item of what) {
            this.pending.add(item);
        }
    }

    // Show the chosen weapon drawn, with its flourish, then in use
    #showDraw() {
        const { avatar, hero } = this;

        avatar.character.sheathe(true);

        const took = avatar.actions.draw(guardOf(hero.weapon), true);

        this.kicked = true;
        this.demoAt = performance.now() + (took + 0.6) * 1000;
    }

    // Show the chosen weapon in use (in spiked boots too, a kick every other time)
    #swing() {
        const { weapon, boots } = this.hero;
        const kick = boots && !this.kicked;
        const { animation, hitAt, duration } = (kick ? WEAPONS.boots : WEAPONS[weapon]).attacks[0];

        this.kicked = kick;
        this.avatar.character.sheathe(false);
        this.avatar.actions.startAttack(animation, { hitAt: hitAt / 1000, duration: duration / 1000, arms: !kick || weapon === "gauntlets" });
        this.demoAt = performance.now() + DEMO_EVERY * 1000;
    }

    #frame(now) {
        const dt = Math.min(0.1, (now - this.lastFrame) / 1000);

        this.lastFrame = now;
        this.#applyChanges(now);

        const { avatar, camera, orbit } = this;

        if (!avatar) {
            return;
        }

        if (this.step === "weapon" && now >= this.demoAt && !avatar.actions.attack) {
            this.#swing();
        }

        avatar.update(dt, 0, 0, 0);

        // The camera eases to the tab's framing, and round the character as it's dragged
        const framing = FRAMING[this.step === "look" ? this.tab : this.step];
        const height = avatar.character.height;
        const ease = 1 - Math.exp(-dt * 6);

        // Upright, the character has less than half the screen's height above the panel
        const room = this.view.canvas.clientWidth < this.view.canvas.clientHeight ? UPRIGHT_DISTANCE : 1;

        orbit.angle += (orbit.target - orbit.angle) * ease;
        this.look.y += (height * framing.at - this.look.y) * ease;

        // (Never nearer than the character lets it come, once it's come nearer than the tab frames
        // them from, or the tab frames them close: easing back before an arm or a shield comes
        // between as it's turned, and never cutting into them: #nearest)
        const wanted = framing.distance * orbit.zoom * room;
        const near = orbit.zoom < 1 || framing.distance * room < height;

        this.#measure(now);

        // (Not measured yet, or someone new: back out to where the tab frames them meanwhile)
        const { here, about } = near ? (this.#nearest() ?? { here: 0, about: framing.distance * room }) : { here: 0, about: 0 };

        this.distance = Math.max(here, this.distance + (Math.max(about, wanted) - this.distance) * ease);
        camera.position.set(Math.sin(orbit.angle) * Math.cos(orbit.pitch), Math.sin(orbit.pitch), Math.cos(orbit.angle) * Math.cos(orbit.pitch)).multiplyScalar(this.distance).add(this.look);
        camera.lookAt(this.look);
        this.#fitCamera();
        this.view.render(this.scene, camera);
    }

    // Keep the character in the part of the screen the panel doesn't cover
    #fitCamera() {
        const canvas = this.view.canvas;
        const width = canvas.clientWidth || 1;
        const height = canvas.clientHeight || 1;
        const panel = this.root.querySelector(".creator").getBoundingClientRect();
        const camera = this.camera;
        const upright = width < height;

        camera.aspect = width / height;
        camera.fov = upright ? 40 : 30;

        if (upright) {
            // The panel covers the bottom: centre the character in the space above it
            camera.setViewOffset(width, height, 0, (height - panel.top) / 2, width, height);
        } else {
            camera.setViewOffset(width, height, (width - panel.left) / 2, 0, width, height);
        }

        camera.updateProjectionMatrix();
        this.view.resize();
    }

    // Measure where the character is (pointsOf) once they're first drawn, and again once they've
    // changed since (and settled), or carry on measuring them, NEAREST.budget ms a frame
    #measure(now) {
        const { avatar, measured } = this;

        if (avatar && !this.measuring && (!measured || (measured.at < this.changedAt && now - this.changedAt >= NEAREST.settle))) {
            this.measuring = { steps: new Steps(pointsOf(avatar.object, NEAREST)), at: now };
        }

        if (this.measuring?.steps.take(performance.now() + NEAREST.budget)) {
            this.measured = { ...this.measuring.steps.value, at: this.measuring.at };
            this.measuring = null;
        }
    }

    /**
     * How near the camera may come to what it looks at (`look`: where it looks now, or will once
     * it's eased there; metres), as the character's shaped, dressed and posed (NEAREST): `here`, as
     * it's turned now, never to be come nearer than; `about`, while it's being turned, as it will
     * be (where it's being turned, and a little past it), to ease back to before anything comes
     * between. Null till they're first measured (#measure).
     */
    #nearest(look = this.look) {
        const { avatar, orbit, measured } = this;

        if (!avatar || !measured) {
            return null;
        }

        const { points, longest } = measured;
        const { margin, side, ahead } = NEAREST;
        const along = (angle) => clearAlong(points, look, angle, orbit.pitch, side) + margin;
        // (Swinging: out of reach of their arm and what they hold)
        const sweep = this.step === "weapon" ? avatar.character.height * NEAREST.arm + longest + margin : 0;
        const here = Math.max(sweep, along(orbit.angle));
        // (Being turned: where it's going, and a little past it)
        const turning = orbit.target - orbit.angle;
        const about = Math.abs(turning) < 0.01 ? here : Math.max(here, along(orbit.target), along(orbit.target + Math.sign(turning) * ahead));

        return { here, about };
    }

    // Come nearer the character or stand further off (`zoom`: a share of the distance the tab frames
    // them from), no further than ZOOM_OUT nor nearer than #nearest lets it come to what the tab
    // looks at
    #zoomTo(zoom) {
        const framing = FRAMING[this.step === "look" ? this.tab : this.step];
        const room = this.view.canvas.clientWidth < this.view.canvas.clientHeight ? UPRIGHT_DISTANCE : 1;
        // (As near as it may come to what the tab looks at, once it's eased there from another's;
        // no nearer than the tab frames them from till they're measured)
        const look = new THREE.Vector3(0, (this.avatar?.character.height ?? 0) * framing.at, 0);
        const nearest = this.#nearest(look);
        const least = nearest ? nearest.about / (framing.distance * room) : Math.min(1, this.orbit.zoom);

        this.orbit.zoom = Math.min(Math.max(ZOOM_OUT, least), Math.max(least, zoom));
    }

    // A finger (or the mouse) dragged across the view walks round the character; two pinched
    // together or apart come nearer or stand further off, as the mouse wheel does. Whatever's down
    // is taken afresh as a finger's put down or lifted, so nothing jumps
    #listen() {
        const canvas = this.view.canvas;
        const down = new Map();
        let drag = null;
        let pinch = null;
        const apart = () => {
            const [a, b] = [...down.values()];

            return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        };
        const afresh = () => {
            const [first] = down.values();

            drag = down.size === 1 ? { x: first.x, angle: this.orbit.target } : null;
            pinch = down.size >= 2 ? { apart: apart(), zoom: this.orbit.zoom } : null;
        };
        const lift = (event) => {
            if (down.delete(event.pointerId)) {
                afresh();
            }
        };

        this.listeners = [
            [canvas, "pointerdown", (event) => {
                down.set(event.pointerId, { x: event.clientX, y: event.clientY });
                afresh();
            }],
            [window, "pointermove", (event) => {
                const finger = down.get(event.pointerId);

                if (!finger) {
                    return;
                }

                Object.assign(finger, { x: event.clientX, y: event.clientY });

                if (pinch) {
                    this.#zoomTo(pinch.zoom * (pinch.apart / apart()));
                } else if (drag) {
                    this.orbit.target = drag.angle - ((event.clientX - drag.x) / Math.max(200, canvas.clientWidth)) * Math.PI * 2;
                }
            }],
            [window, "pointerup", lift],
            [window, "pointercancel", lift],
            [canvas, "wheel", (event) => {
                this.#zoomTo(this.orbit.zoom * Math.exp(event.deltaY * 0.001));
            }],
        ];

        for (const [target, type, listener] of this.listeners) {
            target.addEventListener(type, listener);
        }
    }

    // --- The panel ---

    #buildPanel() {
        const tabs = this.root.querySelector("#createtabs");
        const panels = this.root.querySelector("#createpanels");
        const list = [
            ["body", "Body", () => this.#bodyTab()],
            ["face", "Face", () => this.#faceTab()],
            ["colours", "Colours & hair", () => this.#coloursTab()],
        ];

        this.refreshers = [];
        tabs.replaceChildren();
        panels.replaceChildren();

        for (const [id, label, build] of list) {
            const panel = element("div", { role: "tabpanel", id: `create-${id}`, "aria-labelledby": `createtab-${id}` }, ...build());
            const tab = element("button", { type: "button", role: "tab", id: `createtab-${id}`, "aria-controls": `create-${id}`, onclick: () => this.#showTab(id) }, label);

            tabs.append(tab);
            panels.append(panel);
        }

        this.#buildWeapons();

        const name = this.root.querySelector("#nameinput");

        name.value = this.hero.name;
        name.oninput = () => {
            this.hero.name = name.value;
            this.#refreshName();
        };
        this.root.querySelector("#step-name").onsubmit = (event) => {
            event.preventDefault();
            this.#next();
        };
        this.root.querySelector("#suggestname").onclick = () => {
            this.hero.name = suggestName(this.hero, this.hero.name);
            name.value = this.hero.name;
            this.#refreshName();
        };
        this.root.querySelector("#createback").onclick = () => this.#back();
        this.root.querySelector("#createnext").onclick = () => this.#next();
        this.root.querySelector("#randombutton").onclick = () => this.#randomise();
        this.#showTab("body");
    }

    #showTab(id) {
        this.tab = id;

        for (const tab of this.root.querySelectorAll("#createtabs [role=tab]")) {
            const selected = tab.id === `createtab-${id}`;

            tab.setAttribute("aria-selected", String(selected));
            tab.tabIndex = selected ? 0 : -1;
        }

        for (const panel of this.root.querySelectorAll("#createpanels [role=tabpanel]")) {
            panel.hidden = panel.id !== `create-${id}`;
        }
    }

    #goTo(step) {
        this.step = step;
        // (Held on guard, or put away: measured again, #nearest)
        this.changedAt = performance.now();

        for (const name of STEPS) {
            this.root.querySelector(`#step-${name}`).hidden = name !== step;
            this.root.querySelector(`.steps [data-step="${name}"]`).toggleAttribute("aria-current", name === step);

            if (name === step) {
                this.root.querySelector(`.steps [data-step="${name}"]`).setAttribute("aria-current", "step");
            }
        }

        const next = this.root.querySelector("#createnext");

        next.textContent = step === "name" ? "Begin" : step === "look" ? "Next: weapon" : "Next: name";
        this.root.querySelector("#randombutton").hidden = step !== "look";
        this.avatar?.actions.setGuard(step !== "look");

        if (step === "weapon") {
            this.#showDraw();
        }

        if (step === "name") {
            if (!this.hero.name.trim()) {
                this.hero.name = suggestName(this.hero);
                this.root.querySelector("#nameinput").value = this.hero.name;
            }

            this.#refreshName();
            this.root.querySelector("#nameinput").focus();
        }
    }

    #back() {
        const index = STEPS.indexOf(this.step);

        if (index === 0) {
            this.#close(null);
        } else {
            this.#goTo(STEPS[index - 1]);
        }
    }

    #next() {
        const index = STEPS.indexOf(this.step);

        if (index < STEPS.length - 1) {
            this.#goTo(STEPS[index + 1]);

            return;
        }

        const name = cleanName(this.hero.name);

        if (!name) {
            this.root.querySelector("#nameinput").focus();

            return;
        }

        this.#close({ ...this.hero, name });
    }

    #randomise() {
        this.hero = randomHero(this.hero);
        this.#change("shape", "look", "weapon");
        this.#refresh();
    }

    // One of another people (docs/WAR.md M11): looking as one of them, their own parts on (ears,
    // tails, tusks), and the colours to choose from theirs
    #choosePeople(race) {
        if ((this.hero.race ?? "human") === race) {
            return;
        }

        this.hero = heroOfPeople(this.hero, race);
        this.#buildCharacter();
        this.avatar.actions.setGuard(this.step !== "look");
        this.#buildPanel();
    }

    #refresh() {
        for (const refresh of this.refreshers) {
            refresh();
        }
    }

    #refreshName() {
        const name = cleanName(this.hero.name);
        const weapon = WEAPONS[this.hero.weapon].label.toLowerCase();
        const kit = heroEquipment(this.hero.weapon, new Progress({}, this.hero).worn()).map((id) => EQUIPMENT[id].label.toLowerCase());
        const armed = this.hero.weapon === "boots" ? "spiked boots" : this.hero.boots ? `a ${weapon} and spiked boots` : `a ${weapon}`;

        this.root.querySelector("#namesummary").textContent = name ? `${name}, with ${armed}. You'll wake in the market square of Pellagos in a ${kit.slice(0, -1).join(", ")} and ${kit.at(-1)}.` : "Every hero needs a name.";
        this.root.querySelector("#createnext").disabled = this.step === "name" && !name;
    }

    // --- Controls ---

    #slider(label, { min = 0, max = 1, step = 0.01, get, set, format, enabled = () => true }) {
        const id = `createcontrol${this.refreshers.length}`;
        const output = element("output", { for: id });
        const input = element("input", {
            type: "range", id, min, max, step,
            oninput: () => {
                set(Number(input.value));
                show();
            },
        });
        const row = element("div", { class: "row" }, element("label", { for: id }, label), input);
        const show = () => {
            input.value = get();
            input.disabled = !enabled();
            row.classList.toggle("disabled", input.disabled);
            output.textContent = format ? format(get()) : "";
            input.setAttribute("aria-valuetext", format ? format(get()) : String(Math.round(get() * 100)));
        };

        if (format) {
            row.append(output);
        }

        show();
        this.refreshers.push(show);

        return row;
    }

    #swatches(label, colours, { get, set }) {
        const buttons = Object.entries(colours).map(([name, value]) => element("button", {
            type: "button", role: "radio", title: title(name), "aria-label": title(name), style: `background:${value}`, "data-value": value,
            onclick: () => {
                set(value);
                show();
            },
        }));
        const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
        const show = () => {
            for (const button of buttons) {
                button.setAttribute("aria-checked", String(same(button.dataset.value, get())));
            }
        };

        show();
        this.refreshers.push(show);

        return element("div", { class: "row" }, element("span", {}, label), element("div", { class: "swatches", role: "radiogroup", "aria-label": label }, ...buttons));
    }

    #choices(label, options, { get, set }) {
        const buttons = Object.entries(options).map(([id, { label: text }]) => element("button", {
            type: "button", role: "radio", "data-value": id,
            onclick: () => {
                set(id);
                show();
            },
        }, text));
        const show = () => {
            for (const button of buttons) {
                button.setAttribute("aria-checked", String(button.dataset.value === get()));
            }
        };

        show();
        this.refreshers.push(show);

        return element("div", { class: "group" }, element("h3", {}, label), element("div", { class: "choices", role: "radiogroup", "aria-label": label }, ...buttons));
    }

    #macro(key, label, options = {}) {
        return this.#slider(label, {
            ...options,
            get: () => this.hero.shape.macro[key],
            set: (value) => {
                this.hero.shape.macro[key] = value;
                this.#change("shape");

                if (key === "gender") {
                    this.#refresh();
                }
            },
        });
    }

    #heritage(key, label) {
        return this.#slider(label, {
            get: () => this.hero.shape.macro[key],
            set: (value) => {
                // The three shares always add up to 1
                const macro = this.hero.shape.macro;
                const others = ["african", "asian", "caucasian"].filter((other) => other !== key);
                const rest = others.reduce((sum, other) => sum + macro[other], 0);

                macro[key] = value;

                for (const other of others) {
                    macro[other] = rest > 0 ? (macro[other] / rest) * (1 - value) : (1 - value) / 2;
                }

                this.#change("shape");
                this.#refresh();
            },
        });
    }

    #details(group) {
        return DETAILS.filter((detail) => detail.group === group).map(({ id, label, decr }) => this.#slider(label, {
            min: decr.length ? -1 : 0,
            get: () => this.hero.shape.details[id] ?? 0,
            set: (value) => {
                this.hero.shape.details[id] = value;
                this.#change("shape");
            },
        }));
    }

    #bodyTab() {
        const gender = (value) => (value < 0.35 ? "Female" : value > 0.65 ? "Male" : "Between");
        const peoples = Object.fromEntries(HERO_PEOPLES.map(({ id, label }) => [id, { label }]));

        return [
            this.#choices("People", peoples, { get: () => this.hero.race ?? "human", set: (race) => this.#choosePeople(race) }),
            element("div", { class: "group" }, element("h3", {}, "Build"),
                this.#macro("gender", "Body", { format: gender }),
                this.#macro("muscle", "Muscle"),
                this.#macro("weight", "Weight"),
                this.#macro("height", "Height", { format: () => `${Math.round((this.avatar?.character.height ?? 1.7) * 100)} cm` }),
                this.#macro("bust", "Bust", { enabled: () => this.hero.shape.macro.gender < 0.9 })),
            element("div", { class: "group" }, element("h3", {}, "Heritage"), this.#heritage("african", "African"), this.#heritage("asian", "Asian"), this.#heritage("caucasian", "European")),
            element("div", { class: "group" }, element("h3", {}, "Physique"), ...this.#details("body")),
        ];
    }

    #faceTab() {
        return [element("div", { class: "group" }, element("h3", {}, "Face"), ...this.#details("face"))];
    }

    #coloursTab() {
        const look = (part, key, what = "look") => ({
            get: () => this.hero.look[part][key],
            set: (value) => {
                this.hero.look[part][key] = value;
                this.#change(what);
            },
        });
        const skin = (key, label) => this.#slider(label, look("skin", key));

        return [
            element("div", { class: "group" }, element("h3", {}, "Skin"), this.#swatches("Tone", tonesOf(this.hero.race), look("skin", "tone")), skin("blush", "Redness"), skin("freckles", "Freckles")),
            element("div", { class: "group" }, element("h3", {}, "Eyes"), this.#swatches("Colour", IRIS_COLOURS, look("eyes", "iris"))),
            element("div", { class: "group" }, element("h3", {}, "Hair"), this.#swatches("Colour", HAIR_COLOURS, look("hair", "colour")), skin("brows", "Brows")),
            this.#choices("Hairstyle", HAIRSTYLES, look("hair", "style")),
            this.#choices("Beard", BEARDS, look("hair", "beard")),
        ];
    }

    #buildWeapons() {
        const list = this.root.querySelector("#weaponlist");
        const cards = STARTING_WEAPONS.map((id) => {
            const weapon = WEAPONS[id];

            return element("button", {
                type: "button", class: "weapon", role: "radio", "data-weapon": id,
                onclick: () => {
                    this.hero.weapon = id;
                    this.hero.boots &&= id !== "boots";
                    this.#change("weapon");
                    show();
                },
            },
            element("span", { class: "label" }, weapon.label),
            element("span", { class: "kind" }, weapon.school),
            element("span", { class: "about" }, weapon.about),
            element("span", { class: "numbers" }, weaponNumbers(id)));
        });
        // Spiked boots with any other weapon: kicking too
        const numbers = element("span", { class: "numbers" });
        const boots = element("button", {
            type: "button", class: "weapon option", role: "switch", id: "bootstoggle",
            onclick: () => {
                this.hero.boots = !this.hero.boots;
                this.#change("weapon");
                show();
            },
        },
        element("span", { class: "label" }, "And spiked boots"),
        element("span", { class: "kind" }, "Kicks"),
        element("span", { class: "about" }, "Kick as well as fight with your weapon: up close, each blow is a kick or the weapon at random, both doing the damage halfway between the two. With a bow, wand or grimoire, you kick whoever's next to you."),
        numbers);
        const show = () => {
            for (const card of cards) {
                const chosen = card.dataset.weapon === this.hero.weapon;

                card.setAttribute("aria-checked", String(chosen));
                card.tabIndex = chosen ? 0 : -1;
            }

            boots.hidden = this.hero.weapon === "boots";
            boots.setAttribute("aria-checked", String(Boolean(this.hero.boots)));
            numbers.textContent = weaponNumbers(this.hero.weapon, true);
        };

        this.root.querySelector("#bootsoption").replaceChildren(boots);
        list.replaceChildren(...cards);
        list.onkeydown = (event) => {
            const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];

            if (step) {
                event.preventDefault();

                const index = (STARTING_WEAPONS.indexOf(this.hero.weapon) + step + STARTING_WEAPONS.length) % STARTING_WEAPONS.length;

                cards[index].click();
                cards[index].focus();
            }
        };
        show();
        this.refreshers.push(show);
    }
}
