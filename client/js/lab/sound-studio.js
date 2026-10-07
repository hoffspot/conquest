// The sound studio (sound-studio.html): every sound the game makes (audio/catalog.js), each
// described, where it plays and where it comes from (recorded, and by whom: recorded.js; or made
// in code: synth.js), played as the game plays it (audio/sound.js, at the game's own levels, from
// as far off as asked), each of its variants on its own, and a recorded one's made versions to
// compare; the wind; the music in each place. Nothing here but the catalog's words: a sound
// added to the game and described there shows here.
//
// window.soundStudio is there for tests ({ sound, play }).

import { CATALOG, GROUPS, LOOPS, MUSIC } from "../audio/catalog.js";
import { RECORDED, SOURCES } from "../audio/recorded.js";
import { GAITS, Sound } from "../audio/sound.js";
import { SOUNDS } from "../audio/synth.js";

const $ = (selector) => document.querySelector(selector);

// The volumes heard to start with: the game's own for effects and the world, the music off until
// a piece of it is asked for
const VOLUMES = { effects: 0.5, environment: 0.4, music: 0 };
const MUSIC_VOLUME = 0.35;

// A footstep's footing, by its sound (stepGrass → grass), and a creature's feet, by theirs
const SURFACE = (name) => (name.startsWith("step") ? name.slice(4).toLowerCase() : null);
const FEET = Object.fromEntries(Object.entries(GAITS).filter(([, { sound }]) => sound).map(([feet, { sound }]) => [sound, feet]));

// A walk: four footfalls this far apart (s), at this pace (m/s)
const WALK = { steps: 4, apart: 0.5, speed: 1.5 };

const sound = new Sound({ volumes: VOLUMES });

sound.setListener(0, 0);
sound.prepare();

const status = (text) => ($("#status").textContent = text);
const at = () => ({ x: Number($("#distance").value), z: 0 });
const boost = () => ($("#boost").checked ? 4 : 1);

/** Play a sound as the game plays it: a footstep as one (at a walk), anything else as itself. */
function play(name, { variant = null, made = false, delay = 0 } = {}) {
    const surface = SURFACE(name);
    const feet = FEET[name];

    if (surface || feet) {
        return sound.step(surface ?? "dirt", at(), { speed: WALK.speed, feet: feet ?? "feet", variant, made, delay, volume: boost() });
    }

    return sound.play(name, { at: at(), variant, made, delay, volume: boost() });
}

function button(text, onClick, className = "") {
    const element = document.createElement("button");

    element.type = "button";
    element.textContent = text;
    element.className = className;
    element.addEventListener("click", () => {
        sound.unlock();
        onClick();
    });

    return element;
}

function row(label, buttons) {
    const element = document.createElement("div");
    const caption = document.createElement("span");

    element.className = "row";
    caption.className = "label";
    caption.textContent = label;
    element.append(caption, ...buttons);

    return element;
}

// Where a recorded sound's recordings come from, each once
function sourcesOf(name) {
    const ids = [...new Set(RECORDED[name].flatMap(({ from }) => from))];
    const element = document.createElement("p");

    element.className = "source";
    element.append("Recorded: ");
    ids.forEach((id, k) => {
        const { title, by, page, licence } = SOURCES[id];
        const link = document.createElement("a");

        link.href = page;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = title;
        element.append(k ? "; " : "", link, ` by ${by} (${licence})`);
    });

    return element;
}

function card({ name, label, about, plays, recorded = false, made = 0, controls }) {
    const element = document.createElement("article");
    const header = document.createElement("header");
    const title = document.createElement("h3");
    const code = document.createElement("code");
    const badge = document.createElement("span");
    const what = document.createElement("p");
    const when = document.createElement("p");

    element.className = "card";
    element.dataset.name = name;
    element.dataset.words = `${name} ${label} ${about} ${plays}`.toLowerCase();
    title.textContent = label;
    code.textContent = name;
    badge.className = `badge ${recorded ? "recorded" : "made"}`;
    badge.textContent = recorded ? "Recorded" : made ? "Made in code" : "Played";
    what.textContent = about;
    when.className = "plays";
    when.textContent = `Plays: ${plays}`;
    header.append(title, badge);
    element.append(header, code, what, when, ...controls);

    return element;
}

// Each sound's card: played as in the game, each variant, and where it's from
function soundCard(name) {
    const { label, about, plays } = CATALOG[name];
    const recorded = RECORDED[name]?.length ?? 0;
    const made = SOUNDS[name]?.variants ?? 0;
    const walking = SURFACE(name) || FEET[name];
    const controls = [
        row("Hear", [
            button("▶ As in the game", () => play(name), "primary"),
            ...(walking ? [button("A walk", () => Array.from({ length: WALK.steps }, (_, k) => play(name, { delay: k * WALK.apart })))] : []),
        ]),
    ];

    if (recorded) {
        controls.push(row("Recordings", Array.from({ length: recorded }, (_, k) => button(String(k + 1), () => play(name, { variant: k }), "small"))));
    }

    if (made) {
        controls.push(row(recorded ? "Made in code, before" : "Variants", Array.from({ length: made }, (_, k) => button(String(k + 1), () => play(name, { variant: k, made: true }), "small"))));
    }

    if (recorded) {
        controls.push(sourcesOf(name));
    } else {
        const source = document.createElement("p");

        source.className = "source";
        source.textContent = "Made in code: client/js/audio/synth.js.";
        controls.push(source);
    }

    return card({ name, label, about, plays, recorded: Boolean(recorded), made, controls });
}

// The wind's card: started and stopped
function windCard() {
    const { label, about, plays } = LOOPS.wind;
    const toggle = button("▶ Start", () => {
        const on = !sound.ambient;

        sound.setAmbient(on);
        toggle.textContent = on ? "■ Stop" : "▶ Start";
    }, "primary");

    return card({ name: "wind", label, about, plays, made: 1, controls: [row("Hear", [toggle]), Object.assign(document.createElement("p"), { className: "source", textContent: "Made in code: client/js/audio/synth.js (wind)." })] });
}

// The music: each place's, played until stopped
function musicCard(place) {
    const { label, about, plays } = MUSIC[place];
    const start = button("▶ Play", () => {
        sound.setPlace(place);

        if (Number($("#music").value) === 0) {
            $("#music").value = MUSIC_VOLUME;
        }

        sound.setVolume("music", Number($("#music").value));
    }, "primary");
    const stop = button("■ Stop", () => {
        $("#music").value = 0;
        sound.setVolume("music", 0);
    });
    const source = Object.assign(document.createElement("p"), { className: "source", textContent: "Recordings of real instruments: the Versilian Community Sample Library and FreePats (CC0). Score: client/js/audio/score.js and tavern.js." });

    return card({ name: `music:${place}`, label, about, plays, controls: [row("Hear", [start, stop]), source] });
}

function section(id, title, cards) {
    const element = document.createElement("section");
    const heading = document.createElement("h2");
    const grid = document.createElement("div");
    const link = document.createElement("a");

    element.id = id;
    heading.textContent = title;
    grid.className = "grid";
    grid.append(...cards);
    element.append(heading, grid);
    link.href = `#${id}`;
    link.textContent = title;
    $("#groups").append(link);

    return element;
}

function build() {
    const catalog = $("#catalog");

    for (const [k, group] of GROUPS.entries()) {
        const names = Object.keys(CATALOG).filter((name) => CATALOG[name].group === group);
        const cards = names.map(soundCard);

        if (LOOPS.wind.group === group) {
            cards.unshift(windCard());
        }

        catalog.append(section(`group-${k}`, group, cards));
    }

    catalog.append(section("music", "Music", Object.keys(MUSIC).map(musicCard)));
}

function wire() {
    for (const bus of ["effects", "environment", "music"]) {
        const slider = $(`#${bus}`);

        slider.value = VOLUMES[bus];
        slider.addEventListener("input", () => sound.setVolume(bus, Number(slider.value)));
    }

    $("#distance").addEventListener("input", () => ($("#distanceOut").textContent = `${$("#distance").value} m`));
    $("#search").addEventListener("input", () => {
        const words = $("#search").value.trim().toLowerCase();

        for (const element of document.querySelectorAll(".card")) {
            element.hidden = Boolean(words) && !element.dataset.words.includes(words);
        }
    });
    $("#start").addEventListener("click", () => {
        sound.unlock();
        $("#start").hidden = true;
        status("Making the sounds…");
        sound.ready.then(() => status("Downloading the recordings…"));
        Promise.all([sound.ready, sound.downloading]).then(() => status(`Ready: ${Object.keys(CATALOG).length} sounds, ${Object.values(RECORDED).reduce((sum, files) => sum + files.length, 0)} recordings. Tap any to hear it.`));
    });
}

build();
wire();
window.soundStudio = { sound, play };
