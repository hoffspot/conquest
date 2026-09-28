// The pack: a panel over the game (opened with its button, or I) showing what the player's grown
// into and what they carry (core/progress.js):
// - their gold;
// - what they carry: a grid of slots, each a stack of things alike with its icon and how many;
// - their gear (weapon, body, shield: armour can be taken off);
// - each skill: its rank and title, how far to the next, what makes it grow, what it's brought.
// Trading with a shopkeeper (their talk's "Show me what you have"), it shows the shop's wares
// too, each to buy, and what they carry can be sold.
//
// A thing in the pack is tapped to see what it is (and buttons for what can be done with it);
// held (or right-clicked), a wheel of what can be done with it opens round it, like the action
// wheel (app/wheel.js): use it (or wield, or wear it), put it on an action wheel, split the
// stack, sell it (trading), throw it away, or drop it. Dragged onto another slot, a stack moves
// there: onto things alike, it's put together with them; onto others, the two swap.
//
// It only shows and asks: what's done is the host's (core/host.js commands), through the game.

import { ICONS, ITEM_ICONS, useDefs } from "./icons.js";
import { ActionWheel, directionOf } from "./wheel.js";

// Holding this long (ms) on a thing opens its wheel; a finger this far (px) from where it went
// down is dragging it (or, with the wheel open, has flicked)
const HOLD_MS = 400;
const DRAG = 8;
const FLICK = 30;

// Where each thing that can be done with something goes on its wheel
const PLACES = { use: "n", onWheel: "ne", split: "e", sell: "se", discard: "s", drop: "w" };

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

function button(text, onClick, { label = text, disabled = false, className = "pack-button" } = {}) {
    const each = element("button", className, text);

    each.type = "button";
    each.disabled = disabled;
    each.setAttribute("aria-label", label);
    each.addEventListener("click", onClick);

    return each;
}

// A thing's icon, as SVG
const icon = (id, size = 40) => `<svg viewBox="-24 -24 48 48" width="${size}" height="${size}" aria-hidden="true">${ITEM_ICONS[id] ?? ""}</svg>`;

export class PackPanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "pack");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-labelledby", "packtitle");

        const header = element("header", "pack-header");

        this.title = element("h2", "pack-title", "Pack");
        this.title.id = "packtitle";
        this.gold = element("p", "pack-gold");
        this.close = element("button", "pack-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Close");
        this.close.title = "Close (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());
        header.append(this.title, this.gold, this.close);

        this.body = element("div", "pack-body");
        this.panel.append(header, this.body);
        root.append(this.panel);

        // A thing's wheel, over the panel (its slices clicked, when it's opened by a click)
        this.wheel = new ActionWheel(root);
        this.wheel.element.classList.add("item-wheel");
        this.wheel.element.addEventListener("click", (event) => {
            const slice = event.target.closest?.(".slice[data-action]");

            if (slice && this.wheel.element.classList.contains("clickable")) {
                this.#choose(slice.dataset.action);
            }
        });

        // How many? (to split off, sell or drop)
        this.ask = element("div", "pack-ask");
        this.ask.hidden = true;
        this.ask.setAttribute("role", "dialog");
        this.ask.setAttribute("aria-label", "How many");
        this.panel.append(this.ask);

        this.view = null;
        this.selected = null;
        this.press = null;
        this.target = null;
        this.asking = null;

        // Clicking away from a wheel opened by a click closes it
        this.away = (event) => {
            if (this.wheel.open && this.wheel.element.classList.contains("clickable") && !this.wheel.element.contains(event.target)) {
                this.#closeWheel();
            }
        };
        document.addEventListener("pointerdown", this.away, { capture: true });

        /**
         * What the player asks (the game does it): a command for the host (core/host.js: equip,
         * unequip, use, buy, sell, arrange, split, discard, drop), a thing to put on an action
         * wheel (its id), and to close.
         */
        this.onCommand = () => {};
        this.onWheel = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /**
     * Show (or show again) what the player has: { gold, skills: [{ tree, name, rank, title, xp,
     * from, to, grows, ability }], gear: [{ slot, label, item }], pack: [a slot each: null, or
     * { id, quality, count, label, about, use ("Drink", "Eat"), equip ("Wield", "Wear"), price
     * (each, sold) }], shop: null or { name, wares: [{ item, label, price, affordable }] } }.
     */
    show(view) {
        const { gold, skills, gear, pack, shop } = view;

        useDefs();
        this.view = view;
        this.title.textContent = shop ? `Trading with ${shop.name}` : "Pack";
        this.gold.textContent = `${gold} gold`;
        this.panel.hidden = false;
        this.panel.classList.toggle("trading", Boolean(shop));

        if (this.selected !== null && !pack[this.selected]) {
            this.selected = null;
        }

        const sections = [];

        if (shop) {
            const list = element("ul", "pack-list wares");

            list.append(
                ...shop.wares.map(({ item, label, price, affordable }) => {
                    const row = element("li", "pack-row");
                    const picture = element("span", "pack-icon");

                    picture.innerHTML = icon(item.id, 28);
                    row.append(picture, element("span", "pack-label", label), element("span", "pack-price", `${price} gold`), button("Buy", () => this.onCommand({ type: "buy", item }), { label: `Buy ${label} for ${price} gold`, disabled: !affordable }));

                    return row;
                }),
            );
            sections.push(this.#section("For sale", list));
        }

        // What they carry: a slot for each stack, and what can be done with the one tapped
        const grid = element("div", "pack-grid carried");

        grid.setAttribute("role", "listbox");
        grid.setAttribute("aria-label", "Carried");
        grid.append(...pack.map((stack, index) => this.#cell(stack, index)));
        this.#listen(grid);
        this.about = element("div", "pack-about");
        this.#describe();
        sections.push(this.#section("Carried", grid, this.about));

        // What they wear and wield
        const worn = element("div", "pack-worn-list gear");

        worn.append(
            ...gear.map(({ slot, label, item }) => {
                const piece = element("div", "pack-worn");

                piece.dataset.slot = slot;
                piece.innerHTML = `<span class="pack-where"></span>${item ? icon(item.id, 34) : '<span class="pack-none"></span>'}<span class="pack-label"></span>`;
                piece.querySelector(".pack-where").textContent = { weapon: "Weapon", body: "Body", shield: "Shield" }[slot];
                piece.querySelector(".pack-label").textContent = item ? label : "—";

                if (item && slot !== "weapon" && !shop) {
                    piece.append(button("Take off", () => this.onCommand({ type: "unequip", slot }), { label: `Take off ${label}` }));
                }

                return piece;
            }),
        );
        sections.push(this.#section("Worn", worn));

        // Their skills
        if (!shop) {
            const list = element("ul", "pack-list skills");

            list.append(
                ...skills.map(({ tree, name, rank, title, xp, from, to, grows, ability }) => {
                    const row = element("li", "pack-skill");
                    const bar = element("div", "pack-bar");
                    const fill = element("div", "pack-fill");

                    row.dataset.tree = tree;
                    fill.style.width = `${to === null ? 100 : Math.round(((xp - from) / (to - from)) * 100)}%`;
                    bar.append(fill);
                    row.append(element("span", "pack-skill-name", name), element("span", "pack-skill-rank", `${title} (${rank})`), bar, element("span", "pack-skill-grows", `Grows by ${grows}${ability ? `. ${ability}` : ""}`));

                    return row;
                }),
            );
            sections.push(this.#section("Skills", list));
        }

        this.body.replaceChildren(...sections);
    }

    hide() {
        this.#closeWheel();
        this.#endAsk(null);
        this.panel.hidden = true;
    }

    /** Take it away (the game's done). */
    dispose() {
        document.removeEventListener("pointerdown", this.away, { capture: true });
        this.panel.remove();
        this.wheel.element.remove();
    }

    // A slot of the pack: its stack's icon, how many, and how well made
    #cell(stack, index) {
        const cell = element("button", `pack-cell${stack ? ` made-${stack.quality}` : " empty"}`);

        cell.type = "button";
        cell.dataset.index = String(index);
        cell.setAttribute("role", "option");
        cell.setAttribute("aria-selected", String(index === this.selected));
        cell.setAttribute("aria-label", stack ? `${stack.label}${stack.count > 1 ? `, ${stack.count}` : ""}` : "Empty");

        if (stack) {
            cell.dataset.item = stack.id;
            cell.innerHTML = `${icon(stack.id)}${stack.count > 1 ? `<span class="pack-count">${stack.count}</span>` : ""}`;
        }

        return cell;
    }

    // What the stack tapped is, and buttons for what can be done with it
    #describe() {
        const stack = this.selected === null ? null : this.view.pack[this.selected];

        if (!stack) {
            this.about.replaceChildren(element("p", "pack-hint", this.view.pack.some(Boolean) ? "Tap something to see it. Hold it (or right-click) for what to do with it; drag it to move it." : "Nothing but lint."));

            return;
        }

        const line = element("p", "pack-what");
        const actions = element("div", "pack-actions");

        line.append(element("strong", "", `${stack.label}${stack.count > 1 ? ` ×${stack.count}` : ""}`), document.createTextNode(` ${stack.about}`));
        actions.append(...this.#actionsFor(stack).map(({ key, label }) => button(label, () => this.#do(key, this.selected), { label: `${label}: ${stack.label}` })));
        this.about.replaceChildren(line, actions);
    }

    // What can be done with a stack: [{ key, label }]
    #actionsFor(stack) {
        const trading = Boolean(this.view.shop);
        const actions = [];

        if ((stack.use || stack.equip) && !trading) {
            actions.push({ key: "use", label: stack.use ?? stack.equip });
        }

        if (stack.use && !trading) {
            actions.push({ key: "onWheel", label: "Put on a wheel" });
        }

        if (stack.count > 1) {
            actions.push({ key: "split", label: "Split" });
        }

        if (trading) {
            actions.push({ key: "sell", label: `Sell (${stack.price} gold${stack.count > 1 ? " each" : ""})` });
        }

        actions.push({ key: "drop", label: "Drop" }, { key: "discard", label: "Throw away" });

        return actions;
    }

    // Something done with the stack in a slot: asked how many first, for some of a stack
    async #do(key, index) {
        const stack = this.view?.pack[index];

        if (!stack) {
            return;
        }

        if (key === "use") {
            this.onCommand(stack.equip ? { type: "equip", index } : { type: "use", index });
        } else if (key === "onWheel") {
            this.onWheel(stack.id);
        } else if (key === "split") {
            const count = await this.#howMany({ title: `Split ${stack.label}`, verb: "Split off", most: stack.count - 1, value: Math.floor(stack.count / 2) });

            if (count) {
                this.onCommand({ type: "split", index, count });
            }
        } else if (key === "sell" || key === "drop") {
            const verb = key === "sell" ? "Sell" : "Drop";
            const count = stack.count > 1 ? await this.#howMany({ title: `${verb} ${stack.label}`, verb, most: stack.count, value: stack.count, price: key === "sell" ? stack.price : null }) : 1;

            if (count) {
                this.onCommand({ type: key, index, count });
            }
        } else if (key === "discard") {
            this.onCommand({ type: "discard", index });
        }
    }

    // --- Tapping, holding and dragging things in the pack ---

    #listen(grid) {
        grid.addEventListener("pointerdown", (event) => {
            const cell = event.target.closest(".pack-cell");

            if (!cell || event.button !== 0 || this.press) {
                return;
            }

            const index = Number(cell.dataset.index);
            const press = { id: event.pointerId, index, cell, x: event.clientX, y: event.clientY, hold: null, mode: null };

            if (this.view.pack[index]) {
                press.hold = setTimeout(() => this.#openWheel(press), HOLD_MS);
            }

            this.press = press;
            cell.setPointerCapture?.(event.pointerId);
        });

        grid.addEventListener("pointermove", (event) => {
            const press = this.press;

            if (!press || press.id !== event.pointerId) {
                return;
            }

            const [dx, dy] = [event.clientX - press.x, event.clientY - press.y];

            if (press.mode === "wheel") {
                this.#steer(press, dx, dy);
            } else if (press.mode === "drag") {
                this.#drag(press, event.clientX, event.clientY);
            } else if (Math.hypot(dx, dy) > DRAG) {
                clearTimeout(press.hold);
                press.mode = this.view.pack[press.index] ? "drag" : "moved";

                if (press.mode === "drag") {
                    this.#drag(press, event.clientX, event.clientY);
                }
            }
        });

        const up = (event) => {
            const press = this.press;

            if (!press || press.id !== event.pointerId) {
                return;
            }

            clearTimeout(press.hold);
            this.press = null;

            if (press.mode === "wheel") {
                if (!press.done) {
                    this.#closeWheel();
                }
            } else if (press.mode === "drag") {
                const to = this.#cellAt(event.clientX, event.clientY);

                press.ghost?.remove();
                this.target?.classList.remove("target");
                this.target = null;

                if (event.type === "pointerup" && to && Number(to.dataset.index) !== press.index) {
                    this.onCommand({ type: "arrange", from: press.index, to: Number(to.dataset.index) });
                }
            } else if (event.type === "pointerup" && !press.mode) {
                this.#select(press.index);
            }
        };

        grid.addEventListener("pointerup", up);
        grid.addEventListener("pointercancel", up);

        // Right-clicked (or the menu key): the wheel, to click on
        grid.addEventListener("contextmenu", (event) => {
            const cell = event.target.closest(".pack-cell");

            event.preventDefault();

            if (cell && this.view.pack[Number(cell.dataset.index)]) {
                this.#openWheel({ index: Number(cell.dataset.index), cell, clicked: true });
            }
        });

        // Enter or Space on a slot: tapped
        grid.addEventListener("keydown", (event) => {
            const cell = event.target.closest(".pack-cell");

            if (cell && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                this.#select(Number(cell.dataset.index));
            }
        });
    }

    #select(index) {
        this.selected = this.view.pack[index] ? index : null;

        for (const cell of this.panel.querySelectorAll(".pack-cell")) {
            cell.setAttribute("aria-selected", String(Number(cell.dataset.index) === this.selected));
        }

        this.#describe();
    }

    // The slot under a point on the screen
    #cellAt(x, y) {
        return document.elementFromPoint(x, y)?.closest?.(".pack-cell") ?? null;
    }

    // A stack dragged: its icon under the finger, the slot it's over lit
    #drag(press, x, y) {
        if (!press.ghost) {
            press.ghost = element("div", "pack-ghost");
            press.ghost.innerHTML = icon(this.view.pack[press.index].id, 44);
            document.body.append(press.ghost);
        }

        press.ghost.style.left = `${x}px`;
        press.ghost.style.top = `${y}px`;

        const over = this.#cellAt(x, y);

        if (over !== this.target) {
            this.target?.classList.remove("target");
            this.target = over;
            over?.classList.add("target");
        }
    }

    // --- A thing's wheel ---

    #openWheel(press) {
        const stack = this.view?.pack[press.index];

        if (!stack) {
            return;
        }

        const slots = {};
        const looks = {};

        for (const { key, label } of this.#actionsFor(stack)) {
            slots[PLACES[key]] = key;
            looks[key] = { label: key === "sell" ? "Sell" : label, icon: key === "use" ? ITEM_ICONS[stack.id] : ICONS[key] };
        }

        const box = press.cell.getBoundingClientRect();

        press.mode = "wheel";
        press.done = false;
        this.wheelFor = press.index;
        this.wheel.show(box.left + box.width / 2, box.top + box.height / 2, stack.id, slots, { looks, hub: ITEM_ICONS[stack.id] });
        this.wheel.element.classList.toggle("clickable", Boolean(press.clicked));
        this.#select(press.index);
        globalThis.navigator?.vibrate?.(12);
    }

    // The finger moves with a thing's wheel open: into a slice, it's done (once)
    #steer(press, dx, dy) {
        if (press.done) {
            return;
        }

        const direction = directionOf(dx, dy, FLICK);
        const key = direction ? this.wheel.actionAt(direction) : null;

        this.wheel.mark(direction, direction ? (key ? "chosen" : "refused") : null);

        if (key) {
            press.done = true;
            this.#choose(key);
        }
    }

    // What's in a slice of a thing's wheel chosen: the wheel closes, and it's done
    #choose(key) {
        const index = this.wheelFor;

        this.wheel.hide({ after: 160 });
        this.wheel.element.classList.remove("clickable");
        this.#do(key, index);
    }

    #closeWheel() {
        if (this.wheel.open) {
            this.wheel.hide();
        }

        this.wheel.element.classList.remove("clickable");
    }

    // --- How many ---

    // Ask how many (1 to `most`, starting at `value`): resolves with it, or null if not
    #howMany({ title, verb, most, value, price = null }) {
        this.#endAsk(null);

        return new Promise((resolve) => {
            const range = Object.assign(document.createElement("input"), { type: "range", min: "1", max: String(most), step: "1", value: String(value) });
            const count = element("output", "pack-ask-count");
            const set = (to) => {
                range.value = String(Math.max(1, Math.min(most, to)));
                count.textContent = price === null ? range.value : `${range.value} (${Number(range.value) * price} gold)`;
            };
            const fewer = button("−", () => set(Number(range.value) - 1), { label: "Fewer", className: "pack-button pack-step" });
            const more = button("+", () => set(Number(range.value) + 1), { label: "More", className: "pack-button pack-step" });
            const row = element("div", "pack-ask-row");
            const buttons = element("div", "pack-ask-buttons");

            range.setAttribute("aria-label", "How many");
            range.addEventListener("input", () => set(Number(range.value)));
            set(value);
            row.append(fewer, range, more);
            buttons.append(button("Cancel", () => this.#endAsk(null)), button(verb, () => this.#endAsk(Number(range.value)), { className: "pack-button primary" }));
            this.ask.replaceChildren(element("h3", "pack-ask-title", title), count, row, buttons);
            this.ask.hidden = false;
            this.asking = resolve;
            range.focus();
        });
    }

    #endAsk(answer) {
        const resolve = this.asking;

        this.asking = null;
        this.ask.hidden = true;
        resolve?.(answer);
    }

    #section(heading, ...content) {
        const section = element("section", "pack-section");

        section.append(element("h3", "pack-heading", heading), ...content);

        return section;
    }
}
