// Playing with a game controller (a PS5 controller paired over Bluetooth, or any the browser reads
// with its standard layout). The controller's read once a frame (app/gamepad.js says what the
// readings mean) and what it asks for is done here, through the game's own ways in: nothing is
// pretended to be a key or a tap, and nothing new crosses the wire in a world with others.
//
// What the buttons do depends on what's in front of the player:
//
//  - In the world (playing, nothing open over it): the left stick walks and runs (app/steering.js
//    `pad`), the right stick turns and tilts the camera, and the buttons do the game's actions as
//    they're set (app/gamepad.js ACTIONS: Game options, Controls, Bindings). Cross does what's
//    in front of the player (Game padFront: marked, its word beside Cross's symbol); held, Square
//    and Triangle open the wheels, and the trigger held, R2 or L2, turns the face buttons and the
//    D-pad's left and right into an Action Bar's slots, each slot showing its button.
//  - A wheel held open (Square or Triangle held), or the ring of panels (Create held): either
//    stick, pushed towards a slice, picks it (the thumb holding the button can't work the stick
//    beside it, so the other stick does as well).
//  - A window (a dialog, a panel over the world, the title or the character maker): the D-pad or
//    left stick goes from button to button by where they are on the screen (nearestThatWay),
//    Cross presses (or types: app/padkeys.js), Circle goes back as Escape does, L1 and R1 turn its
//    tabs, the right stick scrolls, and Square does what a long press does (an item's wheel).
//    With Cross and Circle swapped (Game options), they're the other way round everywhere.
//
// The moment the controller's used, the page says so (body[data-pad="on"]): the button in focus
// ringed, the controller's prompts shown, the Action Bar's keys its buttons. A touch, a click or
// a key on the keyboard puts it back as it was.
//
// A browser doesn't take a controller's press as the player touching the page, so the sound can't
// start from one (nor full screen, nor copying a link): the sound's tried anyway on a press, and,
// still silent, the player's told to tap the screen once. The controller rumbles (where the
// browser lets it: not on an iPhone or iPad) for a big slam or landing near the player (the
// camera's shake), and as a slow heartbeat while they're low on health. Taken out (or its
// battery flat) mid-game, the game pauses.

import { actionsOf, BAR_SLOTS, barHeld, bindingsOf, buttonsOf, DEAD_ZONE, HEART, HOLD_MS, heartDue, nearestThatWay, PadReader, rumbleAt, sliceOf, swapped, symbolOf, symbolsFor } from "./gamepad.js";
import { CodePicker, lower, PadKeyboard, raisable, raise, READY_LINES } from "./padkeys.js";
import { actionFor, heldBy, keyMap, keyOf, keysOf } from "./keys.js";

// Held, the D-pad (or the left stick pushed over) goes on again after this long (ms), then this
// often; how far the stick's pushed over to count as the D-pad
const REPEAT = Object.freeze({ after: 380, every: 110, stick: 0.5 });

// The right stick scrolls a window this fast, pushed all the way (pixels a second); on the world
// map, the left stick moves over it this fast (pixels a second), and the right zooms it (each
// second, by e to this)
const SCROLL = 1100;
const MAP_PAN = 700;
const MAP_ZOOM = 1.6;

// What can be gone to in a window
const SELECTABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="tab"], [tabindex]:not([tabindex="-1"])';

// The fields typed in (app/padkeys.js), and those whose own picker's the code's
const TYPED = /^(text|search|url|email|password|number|tel)$/;

/**
 * The ring of panels (Create held), clockwise from the top: what each is, and its name. Opened
 * from the ring, the panel's what its button on the screen opens.
 */
export const RING = Object.freeze([
    Object.freeze({ id: "map", name: "World map" }),
    Object.freeze({ id: "journal", name: "Journal" }),
    Object.freeze({ id: "spellbook", name: "Spellbook" }),
    Object.freeze({ id: "chat", name: "Party chat" }),
    Object.freeze({ id: "party", name: "Party" }),
    Object.freeze({ id: "pack", name: "Pack" }),
]);

// The ring held open by a key, not a button (keyRing)
const KEY_RING = "key";

/** What the player's told when the controller's pressed but the sound can't start without a tap. */
export const SOUND_NOTE = "Tap the screen once to turn the sound on";

function element(tag, className, text) {
    const made = document.createElement(tag);

    made.className = className;

    if (text !== undefined) {
        made.textContent = text;
    }

    return made;
}

// A key pressed, as the game's own key handlers hear one (Escape to go back, the arrows to turn a
// book's pages): told to them, not typed. Told from the page's body, as a key pressed with nothing
// in focus is, so a handler that takes it (heard first, on the way down) keeps it from the rest
function key(name) {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: name, code: name, bubbles: true, cancelable: true }));
}

export class PadPlay {
    #reader = new PadReader();
    #index = null;
    #frame = 0;
    #last = 0;
    #ways = new Map();
    #bar = 0;
    #slotted = new Set();
    #flicked = false;
    #walking = false;
    #wheelButton = null;
    #ringButton = null;
    #ringAt = -1;
    #ringWays = new Set();
    #heart = -Infinity;
    #noted = 0;
    #listening = null;
    #seen = null;
    #prompted = null;
    #shake = (amount) => this.shaken(amount);

    /**
     * @param {object} how
     * @param {object} how.settings - The game's settings (app/save.js), read as they are each frame.
     * @param {() => object | null} how.game - The game being played, if any.
     * @param {() => void} how.pause - Pause the game, its menu up (Options).
     * @param {() => void} how.openWorldMap - Open the world map (Create).
     * @param {() => object | null} [how.worldMap] - The world map open (app/worldmap.js), to move over and zoom.
     * @param {() => object | null} [how.sound] - The game's sound (app/audio/sound.js), to start it.
     * @param {(text: string, seconds?: number) => void} [how.message] - Tell the player something.
     * @param {(pad: { id: string } | null) => void} [how.onSeen] - Told a controller's been seen (or let go).
     */
    constructor(how) {
        this.how = how;
        this.keyboard = new PadKeyboard();
        this.picker = new CodePicker();
        this.keyboard.onDone = (input) => this.#typed(input);
        this.picker.onDone = (input) => this.#typed(input);
        this.mark = element("div", "padmark");
        this.mark.hidden = true;
        this.mark.setAttribute("aria-hidden", "true");
        this.prompts = raisable(element("p", "padprompts"));
        this.prompts.setAttribute("aria-hidden", "true");
        this.ring = element("div", "padring");
        this.ring.hidden = true;
        this.ring.setAttribute("role", "menu");
        this.ring.setAttribute("aria-label", "Panels");
        this.ring.append(
            ...RING.map(({ id, name }, index) => {
                const slice = element("span", "padring-slice", name);
                const angle = (index / RING.length) * Math.PI * 2;

                slice.dataset.panel = id;
                slice.style.left = `${50 + Math.sin(angle) * 36}%`;
                slice.style.top = `${50 - Math.cos(angle) * 36}%`;

                return slice;
            }),
        );
        document.body.append(this.mark, this.prompts, this.ring);
    }

    /** Start listening for controllers (and reading any already seen). */
    start() {
        window.addEventListener("gamepadconnected", (event) => this.#connected(event.gamepad));
        window.addEventListener("gamepaddisconnected", (event) => this.#disconnected(event.gamepad));

        // (A touch, a click or a key on a keyboard: the controller's put down, its look gone; not
        // what the game tells itself, nor the keys it presses for the controller)
        for (const type of ["pointerdown", "keydown", "wheel"]) {
            document.addEventListener(type, (event) => event.isTrusted && this.#putDown(), { capture: true, passive: true });
        }

        // (The ring held open by a key: the keys pick from it, keyRing)
        document.addEventListener("keydown", (event) => this.#ringKey(event, true), { capture: true });
        document.addEventListener("keyup", (event) => this.#ringKey(event, false), { capture: true });

        for (const pad of this.#pads()) {
            this.#connected(pad);
        }
    }

    /** Whether the controller's what's being played with now. */
    get active() {
        return document.body.dataset.pad === "on";
    }

    /** The kind of symbols the controller's buttons are shown with (app/gamepad.js SYMBOLS). */
    get symbols() {
        return symbolsFor(this.#seen?.id ?? "", this.how.settings.padSymbols);
    }

    /** The controller seen, if any: { id } as the browser names it. */
    get seen() {
        return this.#seen;
    }

    /** Whether the controller seen can rumble (in this browser). */
    get rumbles() {
        return Boolean(this.#live()?.vibrationActuator?.playEffect);
    }

    /**
     * Listen for the next button pressed (Game options, Controller: a button set), to tell `done`
     * it as app/gamepad.js keeps them ("r1", or "square:hold" if it's held: not for a bar, `bar`),
     * or null if none's pressed in time. Every button's let go of first, so the one that asked
     * isn't taken for the answer.
     */
    listen(done, { bar = false, ms = 8000 } = {}) {
        this.#listening = { done, bar, until: performance.now() + ms, name: null, clear: false };
    }

    /** Stop listening for a button (closed, or tapped elsewhere). */
    stopListening() {
        const listening = this.#listening;

        this.#listening = null;
        listening?.done(null);
    }

    /** A short rumble to feel it by (Game options: Rumble's strength changed). */
    tryRumble() {
        this.#rumble("slam", 0.6);
    }

    #pads() {
        return [...(navigator.getGamepads?.() ?? [])].filter((pad) => pad?.connected !== false && pad);
    }

    // The controller played: the one pressed last, of those connected
    #live() {
        const pads = this.#pads();

        return pads.find((pad) => pad.index === this.#index) ?? pads[0] ?? null;
    }

    #connected(pad) {
        if (!pad) {
            return;
        }

        this.#index ??= pad.index;
        this.#seen = { id: pad.id };
        this.how.onSeen?.(this.#seen);

        if (!this.#frame) {
            this.#last = performance.now();
            this.#frame = requestAnimationFrame((now) => this.#tick(now));
        }
    }

    #disconnected(pad) {
        if (pad?.index !== this.#index) {
            return;
        }

        const game = this.how.game();
        const was = this.active;

        this.#index = null;
        this.#reader.reset();
        this.#letGo(game);

        const left = this.#pads()[0] ?? null;

        this.#seen = left ? { id: left.id } : null;
        this.how.onSeen?.(this.#seen);

        // (Gone mid-game, a flat battery or Bluetooth lost: the game waits for them)
        if (was && document.body.dataset.screen === "hud" && game?.running) {
            this.how.pause();
            this.how.message?.("Your controller's gone, so the game's paused. Connect it again, or carry on by touch.", 6);
        }

        this.#putDown();
    }

    #putDown() {
        if (!this.active) {
            return;
        }

        delete document.body.dataset.pad;
        this.mark.hidden = true;
        this.#unprompt();
        this.how.game()?.quickBar?.padKeys(null);
    }

    #pickUp() {
        if (!this.active) {
            document.body.dataset.pad = "on";
        }
    }

    // Everything held let go of: the player stops, the camera's let go, no bar or wheel held
    #letGo(game) {
        game?.padMove(0, 0);
        game?.padLook(0, 0, 0);

        if (this.#bar) {
            this.#bar = 0;
            game?.padBar(0);
            game?.quickBar?.padKeys(null);
        }

        if (this.#wheelButton) {
            this.#wheelButton = null;
            game?.padWheelShut();
        }

        this.#closeRing();
        this.#slotted.clear();
    }

    #tick(now) {
        const pad = this.#live();

        if (!pad) {
            this.#frame = 0;

            return;
        }

        this.#frame = requestAnimationFrame((next) => this.#tick(next));

        const dt = Math.min(0.1, (now - this.#last) / 1000);
        const settings = this.how.settings;

        this.#last = now;

        if (document.hidden) {
            return;
        }

        const reading = this.#reader.read(pad, now, { dead: settings.padDeadZone ?? DEAD_ZONE });
        const used = reading.pressed.size > 0 || reading.left.far > 0 || reading.right.far > 0;

        if (used) {
            if (pad.index !== this.#index) {
                this.#index = pad.index;
                this.#seen = { id: pad.id };
                this.how.onSeen?.(this.#seen);
            }

            this.#pickUp();
        }

        if (reading.pressed.size > 0) {
            this.#soundOn();
        }

        try {
            this.#work(reading, now, dt);
        } catch (error) {
            // (Whatever the controller asked for that failed, the next frame's read as ever)
            console.error(error);
        }
    }

    #work(reading, now, dt) {
        const game = this.how.game();
        const settings = this.how.settings;
        const buttons = buttonsOf(bindingsOf(settings.padBindings), { swap: settings.padSwap });

        if (this.#listening) {
            this.#listen(reading, now);

            return;
        }

        if (this.keyboard.open || this.picker.open) {
            this.#typing(reading, now);

            return;
        }

        const scope = this.#scope(game);

        if (this.ring.hidden === false) {
            // (Held open by a key, the keys pick from it: keyRing)
            if (this.#ringButton !== KEY_RING) {
                this.#ringWork(reading, game);
            }
        } else if (this.#wheelButton) {
            this.#wheelWork(reading, game);
        } else if (scope) {
            this.#letGo(game);
            this.mark.hidden = true;
            this.#window(scope, reading, now, dt);

            return;
        } else if (document.body.dataset.screen === "hud" && game?.running) {
            this.#unprompt();
            this.#world(game, reading, buttons, now, dt);

            return;
        }

        this.mark.hidden = true;
    }

    // --- In the world ---

    #world(game, reading, buttons, now, dt) {
        const settings = this.how.settings;

        // (The camera shaken, by a slam or a landing near: the controller rumbles with it)
        if (game.onShake !== this.#shake) {
            game.onShake = this.#shake;
        }

        const bar = barHeld(reading, buttons, this.#reader);

        if (bar !== this.#bar) {
            this.#bar = bar;
            game.padBar(bar);
            game.quickBar?.padKeys(bar && this.active ? BAR_SLOTS.map((name) => symbolOf(name, this.symbols)) : null);
        }

        // (A bar's trigger held: its slots' buttons use them, and nothing else, till let go)
        if (bar) {
            for (const name of reading.pressed) {
                const slot = BAR_SLOTS.indexOf(name);

                if (slot >= 0) {
                    this.#slotted.add(name);
                    game.padSlot(slot);
                }
            }
        }

        const plain = {
            pressed: [...reading.pressed].filter((name) => !this.#slotted.has(name)),
            held: [...reading.held].filter((name) => !this.#slotted.has(name)),
            released: reading.released.filter(({ name }) => !this.#slotted.has(name)),
            down: reading.down,
        };

        for (const { name } of reading.released) {
            this.#slotted.delete(name);
        }

        // (A slot held, its trigger too: either stick flicked up or down turns its spell)
        const flicking = bar ? [...this.#slotted].find((name) => reading.down.has(name)) : null;

        if (flicking) {
            const stick = reading.right.far >= reading.left.far ? reading.right : reading.left;

            if (!this.#flicked && stick.far > 0.6 && Math.abs(stick.y) > Math.abs(stick.x)) {
                this.#flicked = true;
                game.padFlick(BAR_SLOTS.indexOf(flicking), stick.y < 0 ? "up" : "down");
            } else if (stick.far < 0.3) {
                this.#flicked = false;
            }

            game.padMove(0, 0);
            game.padLook(0, 0, dt);
        } else {
            game.padMove(-reading.left.y, reading.left.x, this.#walking);
            game.padLook(reading.right.x, reading.right.y, dt, { speed: settings.padSpeed ?? 1, invertX: settings.padInvertX, invertY: settings.padInvertY });
        }

        for (const id of actionsOf(plain, buttons)) {
            this.#do(id, game, buttons);
        }

        this.#markFront(game, buttons, now);
        this.#heartbeat(game, now);
    }

    #do(id, game, buttons) {
        const holding = (action) => Object.keys(buttons).find((name) => buttons[name].hold === action || buttons[name].tap === action) ?? null;

        switch (id) {
            case "do":
                game.padDo();
                break;
            case "stop":
                game.padStop();
                break;
            case "unlock":
                game.padUnlock();
                break;
            case "pack":
                game.togglePack();
                break;
            case "party":
                game.toggleParty();
                break;
            case "selfWheel":
            case "theirWheel":
                if (game.padWheel(id === "selfWheel" ? "own" : "theirs")) {
                    this.#wheelButton = holding(id);
                    game.padMove(0, 0);
                }

                break;
            case "nextFoe":
            case "lastFoe":
                game.cycleTarget(id === "nextFoe" ? 1 : -1, "distance");
                break;
            case "nextListed":
            case "lastListed":
                game.cycleTarget(id === "nextListed" ? 1 : -1, "list");
                break;
            case "zoomIn":
            case "zoomOut":
                game.padZoom(id === "zoomIn" ? 0.8 : 1.25);
                break;
            case "walk":
                this.#walking = !this.#walking;
                game.hud?.message(this.#walking ? "Walking" : "Running", 1);
                break;
            case "recentre":
                game.recentre();
                break;
            case "menu":
                this.#letGo(game);
                this.how.pause();
                break;
            case "map":
                this.#letGo(game);
                this.how.openWorldMap();
                break;
            case "panels":
                this.#openRing(holding(id), game);
                break;
        }
    }

    // What's in front of the player marked, the symbol of the button that does it (Cross, as it
    // comes) and what it'd do beside it
    #markFront(game, buttons, now) {
        const pick = this.active ? game.padFront(now) : null;
        const at = pick ? game.padScreen(pick) : null;

        if (!at || at.x < 0 || at.y < 0 || at.x > innerWidth || at.y > innerHeight) {
            this.mark.hidden = true;

            return;
        }

        const button = Object.keys(buttons).find((name) => buttons[name].tap === "do") ?? "cross";
        const words = `${symbolOf(button, this.symbols)} ${pick.words}`;

        if (this.mark.textContent !== words) {
            this.mark.textContent = words;
        }

        this.mark.dataset.kind = pick.kind;
        this.mark.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px) translate(-50%, -100%)`;
        this.mark.hidden = false;
    }

    // --- Wheels and the ring of panels ---

    #wheelWork(reading, game) {
        if (!game?.padPointer || !reading.down.has(this.#wheelButton)) {
            this.#wheelButton = null;
            game?.padWheelShut();

            return;
        }

        game.padMove(0, 0);
        game.padWheelAim(reading.right.far >= reading.left.far ? reading.right : reading.left);
    }

    /**
     * The ring of panels held open by a key (Game options, Bindings: O, as it comes), or let go of
     * (`game` null): the keys that move pick a slice from it, as a stick does, and it's gone.
     */
    keyRing(game) {
        if (!game) {
            if (this.#ringButton === KEY_RING) {
                this.#closeRing();
            }

            return;
        }

        if (this.ring.hidden === false || !game.running) {
            return;
        }

        this.#ringButton = KEY_RING;
        this.#ringAt = -1;
        this.#ringWays = new Set();
        game.steering?.release();
        this.ring.hidden = false;
        this.#drawRing();
    }

    // A key while the ring's held open by one: a way's (as the player's set them) pointing at a
    // slice, which opens its panel; the menu's putting the ring away. Not walked, nor anything else
    #ringKey(event, down) {
        if (this.#ringButton !== KEY_RING) {
            return;
        }

        const keys = keysOf(this.how.settings.keyBindings);
        const ways = heldBy(keys, event.code).filter((id) => id === "forward" || id === "back" || id === "left" || id === "right");

        if (!ways.length) {
            if (down && actionFor(keyMap(keys, ["world"]), keyOf(event)) === "menu") {
                event.preventDefault();
                event.stopPropagation();
                this.#closeRing();
            }

            return;
        }

        event.preventDefault();
        event.stopPropagation();

        for (const way of ways) {
            if (down) {
                this.#ringWays.add(way);
            } else {
                this.#ringWays.delete(way);
            }
        }

        const x = (this.#ringWays.has("right") ? 1 : 0) - (this.#ringWays.has("left") ? 1 : 0);
        const y = (this.#ringWays.has("back") ? 1 : 0) - (this.#ringWays.has("forward") ? 1 : 0);
        const far = Math.hypot(x, y);
        const slice = far && down ? sliceOf({ x: x / far, y: y / far, far: 1 }, RING.length) : -1;

        if (slice >= 0) {
            const game = this.how.game();

            this.#ringAt = slice;
            this.#drawRing();
            this.#closeRing();

            if (game) {
                this.#openPanel(RING[slice].id, game);
            }
        }
    }

    #openRing(button, game) {
        if (!button || !game?.running) {
            return;
        }

        this.#ringButton = button;
        this.#ringAt = -1;
        game.padMove(0, 0);
        this.ring.hidden = false;
        this.#drawRing();
    }

    #closeRing() {
        this.#ringButton = null;
        this.ring.hidden = true;
    }

    #ringWork(reading, game) {
        if (!reading.down.has(this.#ringButton) || !game?.running) {
            this.#closeRing();

            return;
        }

        game.padMove(0, 0);

        const stick = reading.right.far >= reading.left.far ? reading.right : reading.left;
        const slice = sliceOf(stick, RING.length);

        if (slice >= 0) {
            this.#ringAt = slice;
            this.#drawRing();
            this.#closeRing();
            this.#openPanel(RING[slice].id, game);
        }
    }

    #drawRing() {
        [...this.ring.children].forEach((slice, index) => slice.classList.toggle("at", index === this.#ringAt));
    }

    #openPanel(id, game) {
        if (id === "map") {
            this.#letGo(game);
            this.how.openWorldMap();
        } else if (id === "journal") {
            game.toggleJournal();
        } else if (id === "spellbook") {
            game.toggleSpellbook();
        } else if (id === "chat") {
            game.toggleParty({ chat: true });
        } else if (id === "party") {
            game.toggleParty();
        } else if (id === "pack") {
            game.togglePack();
        }
    }

    // --- Windows ---

    // The window the controller works, if one's up: the dialog in front (the one holding the
    // focus, or else the last opened), the card at a door, a panel over the world, or a screen
    // that isn't the game's (the title, the character maker)
    #scope(game) {
        const dialogs = [...document.querySelectorAll("dialog[open]")];

        if (dialogs.length) {
            return dialogs.find((dialog) => dialog.contains(document.activeElement)) ?? dialogs.at(-1);
        }

        const screen = document.body.dataset.screen;

        if (screen === "hud") {
            const readying = document.getElementById("readying");
            const asked = game?.hud?.choice?.panel;

            // (The card at a door; a choice asked over the game, how long to camp say; a panel)
            return readying && !readying.hidden ? readying : asked?.isConnected ? asked : (game?.padPanel ?? null);
        }

        return screen ? document.getElementById(screen) : null;
    }

    #window(scope, reading, now, dt) {
        const settings = this.how.settings;
        const [confirm, back] = [swapped("cross", settings.padSwap), swapped("circle", settings.padSwap)];
        const ways = this.#waysOf(reading, now, { stick: scope.id !== "worldmap" });
        const asked = ways.length > 0 || reading.pressed.size > 0;
        let focused = asked ? this.#focused(scope) : document.activeElement;
        const book = this.how.game()?.reader?.open;

        for (const way of ways) {
            if (this.#adjust(focused, way)) {
                continue;
            }

            if (book && (way === "left" || way === "right")) {
                this.how.game()?.reader?.turn(way === "left" ? -1 : 1);
                continue;
            }

            focused = this.#move(scope, focused, way) ?? focused;
        }

        if (reading.pressed.has(confirm)) {
            this.#activate(focused);
        } else if (reading.pressed.has(back)) {
            this.#back(scope);
        } else if (reading.pressed.has("l1") || reading.pressed.has("r1")) {
            const step = reading.pressed.has("l1") ? -1 : 1;

            if (book) {
                this.how.game()?.reader?.turn(step);
            } else {
                this.#tab(scope, focused, step);
            }
        } else if (reading.pressed.has("square") && focused) {
            this.#more(focused);
        } else if (reading.pressed.has("options") && (scope.id === "menu" || document.body.dataset.screen === "hud")) {
            this.#back(scope);
        } else if (reading.pressed.has("create") && scope.id === "worldmap") {
            this.#back(scope);
        }

        const map = scope.id === "worldmap" ? this.how.worldMap?.() : null;

        // (On the world map, the left stick moves over it and the right zooms; elsewhere, the
        // right stick scrolls whatever scrolls round what's in focus, or the window)
        if (map) {
            if (reading.left.far > 0) {
                map.pan(reading.left.x * MAP_PAN * dt, reading.left.y * MAP_PAN * dt);
            }

            if (Math.abs(reading.right.y) > 0) {
                map.zoom(Math.exp(reading.right.y * MAP_ZOOM * dt));
            }
        } else if (reading.right.far > 0 && Math.abs(reading.right.y) > Math.abs(reading.right.x) * 0.5) {
            this.#scrolling(focused, scope)?.scrollBy({ top: reading.right.y * SCROLL * dt, behavior: "instant" });
        }

        this.#prompt(scope, focused);
    }

    #unprompt() {
        if (this.#prompted) {
            this.#prompted = null;
            lower(this.prompts);
        }
    }

    #prompt(scope, focused) {
        if (!this.active) {
            this.#unprompt();

            return;
        }

        const kind = this.symbols;
        const settings = this.how.settings;
        const parts = [`${symbolOf(swapped("cross", settings.padSwap), kind)} Choose`, `${symbolOf(swapped("circle", settings.padSwap), kind)} Back`];

        if (this.#tabsOf(scope, focused).length > 1) {
            parts.push(`${symbolOf("l1", kind)} ${symbolOf("r1", kind)} Tabs`);
        }

        if (this.how.game()?.reader?.open) {
            parts.push(`${symbolOf("l1", kind)} ${symbolOf("r1", kind)} Pages`);
        }

        const words = parts.join("   ");

        if (this.prompts.textContent !== words) {
            this.prompts.textContent = words;
        }

        // (Raised over the window again whenever another's in front)
        if (this.#prompted !== scope) {
            this.#prompted = scope;
            raise(this.prompts);
        }
    }

    // The D-pad's ways this frame (and the left stick's, pushed over): each the moment it's
    // pressed, then again and again while it's held
    #waysOf(reading, now, { stick: withStick = true } = {}) {
        const ways = [];
        const stick = withStick && reading.left.far > REPEAT.stick ? (Math.abs(reading.left.x) > Math.abs(reading.left.y) ? (reading.left.x > 0 ? "right" : "left") : reading.left.y > 0 ? "down" : "up") : null;

        for (const way of ["up", "down", "left", "right"]) {
            const held = reading.down.has(way) || stick === way;
            const next = this.#ways.get(way);

            if (!held) {
                this.#ways.delete(way);
            } else if (next === undefined) {
                ways.push(way);
                this.#ways.set(way, now + REPEAT.after);
            } else if (now >= next) {
                ways.push(way);
                this.#ways.set(way, now + REPEAT.every);
            }
        }

        return ways;
    }

    #selectable(el) {
        return !el.disabled && el.tabIndex >= 0 && !el.closest("[hidden], [inert], [aria-hidden='true']") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    }

    #selectables(scope) {
        const dialog = scope instanceof HTMLDialogElement;

        return [...scope.querySelectorAll(SELECTABLE)].filter((el) => this.#selectable(el) && (!dialog || el.closest("dialog") === scope));
    }

    // Where a thing to go to is on the screen: a switch's or slider's whole row, not its box
    #rect(el) {
        const whole = el.matches('input[type="checkbox"], input[type="radio"], input[type="range"]') ? (el.closest("label") ?? el) : el;

        return whole.getBoundingClientRect();
    }

    // What's in focus in the window, or, if nothing in it is, its first button (the one it's
    // asked to start on, or its main one)
    #focused(scope) {
        const active = document.activeElement;

        if (active && active !== document.body && scope.contains(active) && this.#selectable(active)) {
            return active;
        }

        const all = this.#selectables(scope);
        const first = all.find((el) => el.autofocus || el.classList.contains("primary")) ?? all[0] ?? null;

        this.#focus(first);

        return first;
    }

    #focus(el) {
        if (!el) {
            return;
        }

        el.focus({ preventScroll: true, focusVisible: true });
        (el.closest("label") ?? el).scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }

    #move(scope, from, way) {
        const all = this.#selectables(scope).filter((el) => el !== from);

        if (!from) {
            const first = all[0] ?? null;

            this.#focus(first);

            return first;
        }

        const next = all[nearestThatWay(this.#rect(from), all.map((el) => this.#rect(el)), way)] ?? null;

        if (next) {
            this.#focus(next);
        } else if (way === "up" || way === "down") {
            // (Nothing further that way: what's there scrolled on, in case there's more)
            this.#scrolling(from, scope)?.scrollBy({ top: way === "down" ? 120 : -120, behavior: "smooth" });
        }

        return next;
    }

    // A slider moved, or a choice turned, with the D-pad's left and right
    #adjust(el, way) {
        if (!el || (way !== "left" && way !== "right")) {
            return false;
        }

        if (el.matches?.('input[type="range"]')) {
            if (way === "right") {
                el.stepUp();
            } else {
                el.stepDown();
            }

            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));

            return true;
        }

        if (el instanceof HTMLSelectElement) {
            this.#turn(el, way === "right" ? 1 : -1);

            return true;
        }

        return false;
    }

    // A choice turned to the next (or last) that can be chosen, round again at the end
    #turn(select, step) {
        const options = [...select.options];

        for (let tries = 1; tries <= options.length; tries += 1) {
            const at = (((select.selectedIndex + step * tries) % options.length) + options.length) % options.length;

            if (!options[at].disabled) {
                select.selectedIndex = at;
                select.dispatchEvent(new Event("input", { bubbles: true }));
                select.dispatchEvent(new Event("change", { bubbles: true }));

                return;
            }
        }
    }

    #activate(el) {
        if (!el) {
            return;
        }

        if ((el instanceof HTMLInputElement && TYPED.test(el.type)) || el instanceof HTMLTextAreaElement) {
            this.#type(el);
        } else if (el instanceof HTMLSelectElement) {
            this.#turn(el, 1);
        } else if (!el.matches('input[type="range"]')) {
            el.click();
        }
    }

    // A field typed in: a world's code picked a letter at a time; anything else on the keyboard,
    // with ready lines over it for the party
    #type(input) {
        if (input.readOnly || input.disabled) {
            return;
        }

        if (input.classList.contains("code") && input.maxLength === 4) {
            this.picker.show(input, { length: 4, symbols: this.symbols });
        } else {
            this.keyboard.show(input, { lines: input.classList.contains("chat-input") ? READY_LINES : [], symbols: this.symbols });
        }
    }

    // A field done with: a line to the party sent; anything else, on to the next thing below it
    #typed(input) {
        if (input.classList.contains("chat-input") && input.value.trim()) {
            input.form?.requestSubmit();

            return;
        }

        const scope = this.#scope(this.how.game());

        if (scope?.contains(input)) {
            this.#focus(input);
            this.#move(scope, input, "down");
        }
    }

    #typing(reading, now) {
        const settings = this.how.settings;

        this.#unprompt();
        const [confirm, back] = [swapped("cross", settings.padSwap), swapped("circle", settings.padSwap)];
        const ways = this.#waysOf(reading, now);

        if (this.picker.open) {
            ways.forEach((way) => this.picker.move(way));

            if (reading.pressed.has(confirm) || reading.pressed.has("r1") || reading.pressed.has("options")) {
                this.picker.done();
            } else if (reading.pressed.has(back)) {
                this.picker.hide({ undo: true });
            }

            return;
        }

        const keys = this.keyboard;

        ways.forEach((way) => keys.move(way));

        if (reading.pressed.has(confirm)) {
            keys.pressAt();
        } else if (reading.pressed.has(back)) {
            keys.hide();
        } else if (reading.pressed.has("square")) {
            keys.delete();
        } else if (reading.pressed.has("triangle")) {
            keys.type(" ");
        } else if (reading.pressed.has("l1")) {
            keys.toggleShift();
        } else if (reading.pressed.has("r1") || reading.pressed.has("options")) {
            keys.done();
        }
    }

    #back(scope) {
        if (scope instanceof HTMLDialogElement) {
            // (As Escape does: its own cancel told first, which may go back a page instead)
            if (scope.dispatchEvent(new Event("cancel", { cancelable: true }))) {
                scope.close();
            }

            return;
        }

        if (scope.id === "readying") {
            document.getElementById("readyingback")?.click();

            return;
        }

        // (A choice asked over the game: its way out, if it has one)
        if (scope.classList.contains("choice")) {
            scope.querySelector(".choice-cancel")?.click();

            return;
        }

        // (Over the world: as the menu's key does, whatever it's set to: main.js `back`)
        if (document.body.dataset.screen === "hud") {
            if (this.how.back) {
                this.how.back();
            } else {
                key("Escape");
            }

            return;
        }

        const backs = this.#selectables(scope).filter((el) => el.matches("[data-back], .menu-back") || /^(back|cancel|close|not now)$/i.test(el.textContent.trim()));

        backs.at(-1)?.click();
    }

    // The tabs of the window, the set holding what's in focus if it's one of them, or its first
    #tabsOf(scope, focused) {
        const tabs = [...scope.querySelectorAll('[role="tab"]')].filter((tab) => this.#selectable(tab));
        const group = focused?.getAttribute?.("role") === "tab" ? focused.parentElement : tabs[0]?.parentElement;

        return tabs.filter((tab) => tab.parentElement === group);
    }

    #tab(scope, focused, step) {
        const tabs = this.#tabsOf(scope, focused);

        if (tabs.length < 2) {
            return;
        }

        const now = Math.max(0, tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"));
        const next = tabs[(now + step + tabs.length) % tabs.length];

        next.click();
        this.#focus(next);
    }

    // What a long press does (an item's wheel in the Pack), done on what's in focus
    #more(el) {
        const rect = el.getBoundingClientRect();

        el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
    }

    #scrolling(from, scope) {
        for (let el = from ?? scope; el && el !== document.body; el = el.parentElement) {
            const style = getComputedStyle(el);

            if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) {
                return el;
            }

            if (el === scope) {
                break;
            }
        }

        return scope.scrollHeight > scope.clientHeight + 1 ? scope : null;
    }

    // --- Setting a button ---

    #listen(reading, now) {
        const listening = this.#listening;

        if (now > listening.until) {
            this.stopListening();

            return;
        }

        // (Every button let go of first, the one that asked among them)
        if (!listening.clear) {
            listening.clear = reading.down.size === 0;

            return;
        }

        if (!listening.name) {
            const name = [...reading.pressed].find((pressed) => pressed !== "ps");

            if (name) {
                listening.name = name;
                listening.at = now;
            }

            return;
        }

        const up = reading.released.find(({ name }) => name === listening.name);

        if (!listening.bar && reading.held.has(listening.name)) {
            this.#heard(`${listening.name}:hold`);
        } else if (up) {
            this.#heard(listening.name);
        } else if (listening.bar && now - listening.at >= HOLD_MS) {
            this.#heard(listening.name);
        }
    }

    #heard(binding) {
        const listening = this.#listening;

        this.#listening = null;
        listening.done(binding);
    }

    // --- Sound and rumble ---

    // A press: the sound's tried (a browser may let it start), and if it's still silent in the
    // game, the player's told to tap the screen, once in a while
    #soundOn() {
        const sound = this.how.sound?.();

        if (!sound) {
            return;
        }

        sound.unlock?.();

        if (document.body.dataset.screen !== "hud" || !sound.enabled || performance.now() - this.#noted < 60000) {
            return;
        }

        setTimeout(() => {
            if (sound.enabled && !sound.playing && !document.hidden && performance.now() - this.#noted >= 60000) {
                this.#noted = performance.now();
                this.how.message?.(SOUND_NOTE, 4);
            }
        }, 400);
    }

    /** The camera shaken (Game onShake): a big slam or landing near enough rumbles the controller. */
    shaken(amount) {
        if (amount >= 0.2) {
            this.#rumble("slam", Math.min(1, amount / 0.6));
        }
    }

    #heartbeat(game, now) {
        if (!heartDue(game.padHealth(), this.#heart, now)) {
            return;
        }

        this.#heart = now;
        this.#rumble("beat", 1);
        setTimeout(() => this.#rumble("beat", 0.7), HEART.between);
    }

    #rumble(kind, scale) {
        const settings = this.how.settings;
        const effect = settings.padRumble === false ? null : rumbleAt(kind, settings.padStrength ?? 1, scale);
        const actuator = this.active ? this.#live()?.vibrationActuator : null;

        if (effect && actuator?.playEffect) {
            actuator.playEffect("dual-rumble", effect).catch(() => {});
        }
    }
}
