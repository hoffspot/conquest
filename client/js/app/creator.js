// The character maker: the new character stands on a plinth in the 3D view while the panel beside
// it (below it, on an upright phone) shapes the body and face, picks skin, eyes and hair, arms it
// with a starting weapon and names it.
//
//     const hero = await new Creator({ view, kit }).run();   // null if the player went back
//
// Drag across the view to walk round the character; each tab frames what it changes (the face
// close up, the hair head and shoulders). Choosing a weapon shows it held on guard and swung.

import * as THREE from "three";
import { Character } from "../characters/character.js";
import { EQUIPMENT } from "../characters/equipment.js";
import { DETAILS } from "../characters/details.js";
import { BEARDS, HAIRSTYLES } from "../characters/hair.js";
import { HAIR_COLOURS } from "../characters/skin.js";
import { STARTING_WEAPONS, WEAPONS } from "../core/weapons.js";
import { Avatar } from "../world/avatar.js";
import { heroEquipment } from "./game.js";
import { cleanName, defaultHero, HUMAN_TONES, IRIS_COLOURS, randomHero, suggestName } from "./heroes.js";

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

/** Words for a weapon's numbers: damage, reach and speed. */
export function weaponNumbers(weapon) {
    return WEAPONS[weapon].attacks.map(({ kind, damage: [least, most], reach, interval }) => {
        const range = kind === "melee" ? "up close" : `${reach} m`;

        return `${least}–${most} damage · ${range} · ${(1000 / interval).toFixed(1)} a second`;
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
        this.root.hidden = true;
        this.finish(result);
    }

    // --- The stage ---

    #buildStage() {
        const scene = new THREE.Scene();

        scene.background = new THREE.Color(0x17130f);
        scene.fog = new THREE.Fog(0x17130f, 6, 14);
        scene.environment = this.view.scene.environment;
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

        this.avatar?.object.removeFromParent();
        this.avatar?.character.dispose();

        const character = new Character(this.kit, { shape: hero.shape, look: hero.look, equipment: heroEquipment(hero.weapon) });

        this.avatar = new Avatar(character, { guard: WEAPONS[hero.weapon].attacks[0].animation });
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
            character.setEquipment(heroEquipment(hero.weapon));
            avatar.actions.setWeapon(WEAPONS[hero.weapon].attacks[0].animation);
            avatar.actions.setGuard(this.step !== "look");
            this.#swing();
        }

        pending.clear();
    }

    #change(...what) {
        for (const item of what) {
            this.pending.add(item);
        }
    }

    // Show the chosen weapon in use
    #swing() {
        const { animation, hitAt, duration } = WEAPONS[this.hero.weapon].attacks[0];

        this.avatar.actions.startAttack(animation, { hitAt: hitAt / 1000, duration: duration / 1000 });
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
        this.distance += (framing.distance * orbit.zoom * room - this.distance) * ease;
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

    #listen() {
        const canvas = this.view.canvas;
        let drag = null;

        this.listeners = [
            [canvas, "pointerdown", (event) => (drag = { x: event.clientX, angle: this.orbit.target })],
            [window, "pointermove", (event) => {
                if (drag) {
                    this.orbit.target = drag.angle - ((event.clientX - drag.x) / Math.max(200, canvas.clientWidth)) * Math.PI * 2;
                }
            }],
            [window, "pointerup", () => (drag = null)],
            [canvas, "wheel", (event) => {
                this.orbit.zoom = Math.min(1.6, Math.max(0.55, this.orbit.zoom * Math.exp(event.deltaY * 0.001)));
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
            this.#swing();
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
        this.#change("shape", "look");
        this.#refresh();
    }

    #refresh() {
        for (const refresh of this.refreshers) {
            refresh();
        }
    }

    #refreshName() {
        const name = cleanName(this.hero.name);
        const weapon = WEAPONS[this.hero.weapon].label.toLowerCase();

        const kit = heroEquipment(this.hero.weapon).map((id) => EQUIPMENT[id].label.toLowerCase());

        this.root.querySelector("#namesummary").textContent = name ? `${name}, with a ${weapon}. You'll wake in the market square of Pellagos in a ${kit.slice(0, -1).join(", ")} and ${kit.at(-1)}.` : "Every hero needs a name.";
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

        return [
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
            element("div", { class: "group" }, element("h3", {}, "Skin"), this.#swatches("Tone", HUMAN_TONES, look("skin", "tone")), skin("blush", "Redness"), skin("freckles", "Freckles")),
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
                    this.#change("weapon");
                    show();
                },
            },
            element("span", { class: "label" }, weapon.label),
            element("span", { class: "kind" }, weapon.school),
            element("span", { class: "about" }, weapon.about),
            element("span", { class: "numbers" }, weaponNumbers(id)));
        });
        const show = () => {
            for (const card of cards) {
                const chosen = card.dataset.weapon === this.hero.weapon;

                card.setAttribute("aria-checked", String(chosen));
                card.tabIndex = chosen ? 0 : -1;
            }
        };

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
