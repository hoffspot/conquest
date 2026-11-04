// Typing with a game controller (app/padplay.js), which has no keys to type with, and gets no
// keyboard from the browser: an iPhone or iPad brings up its own only for a touch, and a computer
// has none on the screen at all. So the game has its own:
//
//  - a world's four-letter code (Multiplayer, Join a World on another Device) is picked a letter
//    at a time, each turned with the D-pad up and down, left and right going between them
//    (CodePicker);
//  - anything else, a name, a short code, a line to the party, is typed on the game's own keyboard
//    (PadKeyboard), each key gone to with the D-pad or left stick and pressed with Cross; Square
//    deletes, Triangle's a space, L1 is Shift and R1 is done. To the party, a few ready lines
//    stand over the keys (READY_LINES), sent the moment one's chosen.
//
// Either writes into the field it was opened on, as typing there would (its `input` event told),
// and goes when it's done with (`onDone`) or closed (Circle: what's typed kept; the code picker
// puts the code back as it was).

import { KEY_ROWS, keyLetter, nearestThatWay, stepLetter, symbolOf } from "./gamepad.js";

/** Ready lines to the party, chosen rather than typed with a controller in hand. */
export const READY_LINES = Object.freeze(["On my way", "Wait for me", "Help!", "Over here", "Ready", "Thanks!", "Well fought", "Let's go"]);

// What each of the keyboard's own keys shows
const KEY_FACES = Object.freeze({ shift: "⇧ Shift", space: "Space", back: "⌫", done: "Done" });

/**
 * Shown over everything, windows open over the game too: put in the browser's top layer, where it
 * has one (as a popover, raised again over whatever's opened since), or else just shown.
 */
export function raise(el) {
    el.hidden = false;

    if (typeof el.showPopover === "function") {
        try {
            if (el.matches(":popover-open")) {
                el.hidePopover();
            }

            el.showPopover();
        } catch {
            // (A browser without a top layer for it: shown where it is)
        }
    }
}

/** Put away again (raise). */
export function lower(el) {
    if (typeof el.hidePopover === "function") {
        try {
            if (el.matches(":popover-open")) {
                el.hidePopover();
            }
        } catch {
            // (Never raised)
        }
    }

    el.hidden = true;
}

/** Made ready to be raised over everything (raise): a popover, put up and away by the game alone. */
export function raisable(el) {
    if ("popover" in HTMLElement.prototype) {
        el.popover = "manual";
    }

    el.hidden = true;

    return el;
}

function element(tag, className, text) {
    const made = document.createElement(tag);

    made.className = className;

    if (text !== undefined) {
        made.textContent = text;
    }

    return made;
}

// The field's text set, as typing it would (its own `input` event told)
function write(input, value) {
    const most = input.maxLength > 0 ? input.maxLength : Infinity;

    input.value = value.slice(0, most);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The game's own keyboard, over the bottom of the screen, for a field a controller can't type in. */
export class PadKeyboard {
    #at = 0;
    #shift = false;
    #input = null;
    #started = "";

    /** @param {HTMLElement} [parent] - Where it goes (the page). */
    constructor(parent = document.body) {
        this.element = raisable(element("div", "padkeys"));
        this.element.setAttribute("role", "dialog");
        this.element.setAttribute("aria-label", "Keyboard");
        this.text = element("p", "padkeys-text");
        this.lines = element("div", "padkeys-lines");
        this.keys = element("div", "padkeys-keys");
        this.help = element("p", "padkeys-help");

        for (const row of KEY_ROWS) {
            const line = element("div", "padkeys-row");

            for (const key of row) {
                const button = element("button", `padkeys-key${KEY_FACES[key] ? ` padkeys-${key}` : ""}`, KEY_FACES[key] ?? key);

                button.type = "button";
                button.tabIndex = -1;
                button.dataset.key = key;
                button.addEventListener("click", () => this.press(button));
                line.append(button);
            }

            this.keys.append(line);
        }

        this.element.append(this.text, this.lines, this.keys, this.help);
        parent.append(this.element);

        /** Told the field's done with (Done, or a ready line sent): the field. */
        this.onDone = () => {};
    }

    /** Whether it's up. */
    get open() {
        return !this.element.hidden;
    }

    /** The field it's typing into, or null. */
    get input() {
        return this.#input;
    }

    /**
     * Bring it up for a field (`input`), with ready lines over the keys (`lines`: chosen, the
     * field's set to one and done with), and its buttons said in the symbols of the controller in
     * hand (`symbols`: app/gamepad.js SYMBOLS' kinds).
     */
    show(input, { lines = [], symbols = "playstation" } = {}) {
        this.#input = input;
        this.#started = input.value;
        this.#shift = !input.value && input.autocapitalize !== "off" && input.autocapitalize !== "none";
        this.lines.replaceChildren(
            ...lines.map((words) => {
                const button = element("button", "padkeys-line", words);

                button.type = "button";
                button.tabIndex = -1;
                button.dataset.line = words;
                button.addEventListener("click", () => this.press(button));

                return button;
            }),
        );
        this.lines.hidden = lines.length === 0;
        this.help.textContent = `${symbolOf("cross", symbols)} Type   ${symbolOf("square", symbols)} Delete   ${symbolOf("triangle", symbols)} Space   ${symbolOf("l1", symbols)} Shift   ${symbolOf("r1", symbols)} Done   ${symbolOf("circle", symbols)} Close`;
        raise(this.element);
        document.body.classList.add("padkeys-up");
        this.#at = Math.max(0, this.#all().findIndex((button) => button.dataset.key === "q"));
        this.#draw();
    }

    /** Put it away, what's typed kept (`undo`: the field as it was when it came up). */
    hide({ undo = false } = {}) {
        if (undo && this.#input && this.#input.value !== this.#started) {
            write(this.#input, this.#started);
        }

        lower(this.element);
        this.#input = null;
        document.body.classList.remove("padkeys-up");
    }

    /** A key or ready line pressed (with Cross, or tapped). */
    press(button) {
        const input = this.#input;

        if (!input) {
            return;
        }

        if (button.dataset.line) {
            write(input, button.dataset.line);
            this.#done();

            return;
        }

        const key = button.dataset.key;

        if (key === "shift") {
            this.#shift = !this.#shift;
        } else if (key === "back") {
            this.delete();
        } else if (key === "done") {
            this.#done();

            return;
        } else {
            this.type(keyLetter(key, this.#shift));

            // (Shift's for one letter, as a phone's is)
            if (key.length === 1 && /[a-z]/.test(key)) {
                this.#shift = false;
            }
        }

        this.#draw();
    }

    /** A letter (or a space) typed at the end of what's there. */
    type(letter) {
        if (this.#input && letter) {
            write(this.#input, this.#input.value + letter);
            this.#draw();
        }
    }

    /** The last letter typed taken off. */
    delete() {
        if (this.#input?.value) {
            write(this.#input, this.#input.value.slice(0, -1));
            this.#draw();
        }
    }

    /** Shift on or off. */
    toggleShift() {
        this.#shift = !this.#shift;
        this.#draw();
    }

    /** Done with: put away, and told. */
    done() {
        this.#done();
    }

    /** Go to the next key the way pressed ("up", "down", "left" or "right"). */
    move(way) {
        const buttons = this.#all();
        const from = buttons[this.#at];

        if (!from) {
            return;
        }

        const next = nearestThatWay(from.getBoundingClientRect(), buttons.map((button) => button.getBoundingClientRect()), way);

        if (next >= 0) {
            this.#at = next;
            this.#draw();
        }
    }

    /** The key gone to pressed (Cross). */
    pressAt() {
        const button = this.#all()[this.#at];

        if (button) {
            this.press(button);
        }
    }

    #done() {
        const input = this.#input;

        this.hide();

        if (input) {
            input.dispatchEvent(new Event("change", { bubbles: true }));
            this.onDone(input);
        }
    }

    #all() {
        return [...this.lines.querySelectorAll("button"), ...this.keys.querySelectorAll("button")].filter((button) => button.getClientRects().length > 0 || this.element.hidden);
    }

    #draw() {
        const input = this.#input;
        const value = input?.value ?? "";

        this.text.textContent = input?.type === "password" ? "•".repeat(value.length) : value;
        this.text.classList.toggle("empty", !value);
        this.text.dataset.placeholder = input?.placeholder ?? "";
        this.keys.classList.toggle("shifted", this.#shift);

        for (const button of this.keys.querySelectorAll("button")) {
            const key = button.dataset.key;

            if (key.length === 1) {
                button.textContent = this.#shift ? key.toUpperCase() : key;
            }
        }

        this.#all().forEach((button, index) => button.classList.toggle("at", index === this.#at));
    }
}

/** A world's four-letter code picked a letter at a time with a controller. */
export class CodePicker {
    #input = null;
    #letters = [];
    #at = 0;
    #started = "";

    /** @param {HTMLElement} [parent] - Where it goes (the page). */
    constructor(parent = document.body) {
        this.element = raisable(element("div", "padcode"));
        this.element.setAttribute("role", "dialog");
        this.element.setAttribute("aria-label", "The code");
        this.cells = element("div", "padcode-cells");
        this.help = element("p", "padkeys-help");
        this.element.append(this.cells, this.help);
        parent.append(this.element);

        /** Told the code's done with: the field. */
        this.onDone = () => {};
    }

    /** Whether it's up. */
    get open() {
        return !this.element.hidden;
    }

    /** Bring it up for a field of `length` letters, starting from what's in it (A where nothing is). */
    show(input, { length = 4, symbols = "playstation" } = {}) {
        this.#input = input;
        this.#started = input.value;
        this.#letters = Array.from({ length }, (_, index) => {
            const letter = (input.value[index] ?? "").toUpperCase();

            return /^[A-Z]$/.test(letter) ? letter : "A";
        });
        this.#at = 0;
        this.help.textContent = `↑ ↓ Letter   ← → Next   ${symbolOf("cross", symbols)} Done   ${symbolOf("circle", symbols)} Close`;
        this.cells.replaceChildren(...this.#letters.map(() => element("span", "padcode-cell")));
        raise(this.element);
        this.#write();
    }

    /** Put it away (`undo`: the code put back as it was). */
    hide({ undo = false } = {}) {
        if (undo && this.#input) {
            write(this.#input, this.#started);
        }

        lower(this.element);
        this.#input = null;
    }

    /** The D-pad: up and down turn the letter, left and right go between them. */
    move(way) {
        if (way === "up" || way === "down") {
            this.#letters[this.#at] = stepLetter(this.#letters[this.#at], way === "up" ? 1 : -1);
        } else {
            this.#at = Math.max(0, Math.min(this.#letters.length - 1, this.#at + (way === "right" ? 1 : -1)));
        }

        this.#write();
    }

    /** Done: put away, and told. */
    done() {
        const input = this.#input;

        this.hide();

        if (input) {
            input.dispatchEvent(new Event("change", { bubbles: true }));
            this.onDone(input);
        }
    }

    #write() {
        if (this.#input) {
            write(this.#input, this.#letters.join(""));
        }

        [...this.cells.children].forEach((cell, index) => {
            cell.textContent = this.#letters[index];
            cell.classList.toggle("at", index === this.#at);
        });
    }
}
