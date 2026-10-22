// A writing read (core/writings.js): a panel over the game, as an old book lies open, its title
// over it and one of its entries a page at a time: its heading, how it's written (`hand`), its
// paragraphs, and who signed it; how far through it is under it. Its pages turned on and back
// (its buttons, or the arrow keys: app/game.js) and shut (its button, or Escape). Opened at the
// lectern it lies on, or from the journal (app/journal.js *Writings*).
//
// It only shows: what's read is the game's (app/game.js).

import { WRITINGS } from "../core/writings.js";

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

export class ReaderPanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "reader");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-labelledby", "readertitle");

        const header = element("header", "reader-header");

        this.title = element("h2", "reader-title");
        this.title.id = "readertitle";
        this.close = element("button", "reader-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Close");
        this.close.title = "Close (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());
        header.append(this.title, this.close);

        this.page = element("article", "reader-page");

        // (Back a page, how far through it is, and on a page)
        const footer = element("footer", "reader-footer");

        this.back = element("button", "reader-turn reader-back", "Back");
        this.back.type = "button";
        this.back.setAttribute("aria-label", "The page before");
        this.back.addEventListener("click", () => this.turn(-1));
        this.at = element("span", "reader-at");
        this.on = element("button", "reader-turn reader-on", "On");
        this.on.type = "button";
        this.on.setAttribute("aria-label", "The next page");
        this.on.addEventListener("click", () => this.turn(1));
        footer.append(this.back, this.at, this.on);

        this.panel.append(header, this.page, footer);
        root.append(this.panel);

        /** Which writing's open (core/writings.js WRITINGS' id), and which of its pages. */
        this.id = null;
        this.index = 0;

        /** A page turned (the game: its sound), and shut. */
        this.onTurn = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /** Open a writing (WRITINGS' id) at one of its pages (the first, if not said). */
    show(id, index = 0) {
        const writing = WRITINGS[id];

        if (!writing) {
            return;
        }

        this.id = id;
        this.title.textContent = writing.title;
        this.panel.hidden = false;
        this.#page(index);
    }

    /** Turn on (1) or back (-1) a page, if there's one that way. Whether it turned. */
    turn(by) {
        const entries = WRITINGS[this.id]?.entries ?? [];
        const index = this.index + by;

        if (!this.open || index < 0 || index >= entries.length) {
            return false;
        }

        this.#page(index);
        this.onTurn();

        return true;
    }

    hide() {
        this.panel.hidden = true;
    }

    // Show one of the open writing's pages
    #page(index) {
        const { entries } = WRITINGS[this.id];
        const entry = entries[Math.max(0, Math.min(entries.length - 1, index))];

        this.index = entries.indexOf(entry);
        this.page.replaceChildren(
            element("h3", "reader-heading", entry.heading),
            ...(entry.hand ? [element("p", "reader-hand", entry.hand)] : []),
            ...entry.text.map((paragraph) => element("p", "reader-text", paragraph)),
            ...(entry.signed ? [element("p", "reader-signed", entry.signed)] : []),
        );
        this.page.scrollTop = 0;
        this.at.textContent = `${this.index + 1} of ${entries.length}`;
        this.back.disabled = this.index === 0;
        this.on.disabled = this.index === entries.length - 1;
    }
}
