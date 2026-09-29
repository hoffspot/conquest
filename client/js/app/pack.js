// The pack: a panel over the game (opened with its button, or I) showing what the player's grown
// into and what they carry (core/progress.js), in two tabs:
// - Gear: a paperdoll, their character (drawn live by the game: `dollView`) with a slot for each
//   part of them round it (core/gear.js GEAR_SLOTS), the off hand greyed out behind a two-handed
//   weapon; the totals of all they wear and have grown into, the sets they wear and who they pass
//   for; and what they carry, two pages of slots, each a stack of things alike, sorted at a tap;
// - Skills: each skill's rank and title, how far to the next, what makes it grow, what it's brought.
// Trading with a shopkeeper (their talk's "Show me what you have"), it shows the shop's wares
// too, each to buy, and what they carry can be sold. Trading with another player (face to face:
// core/host.js), it shows what each offers: what they carry is offered (as many as they like),
// or taken back, and gold; once both agree, it changes hands.
//
// A thing is tapped to see what it is (app/gearinfo.js: its name in the colour of its make, what
// it does, its set; gear in the pack compared with what's worn) with buttons for what can be done
// with it. Held, a piece of gear goes on (or, worn, comes off, back into the pack); anything else
// held (or right-clicked) opens a wheel of what can be done with it, like the action wheel
// (app/wheel.js): use it, put it on an action wheel, split the stack, sell it (trading), throw it
// away, or drop it. Dragged onto another slot of the pack, a stack moves there (onto things
// alike, it's put together with them; onto others, the two swap); a piece of gear dragged onto
// the paperdoll goes on there, and one worn dragged back to the pack comes off. Double-clicked,
// gear goes on or comes off.
//
// It only shows and asks: what's done is the host's (core/host.js commands), through the game.

import { GEAR_SLOTS } from "../core/gear.js";
import { PACK_PAGE, PACK_SIZE } from "../core/progress.js";
import { ICONS, iconOf, ITEM_ICONS, useDefs } from "./icons.js";
import { ActionWheel, directionOf } from "./wheel.js";

// Holding this long (ms) on a thing puts it on or takes it off (or opens its wheel); a finger this
// far (px) from where it went down is dragging it (or, with the wheel open, has flicked)
const HOLD_MS = 400;
const DRAG = 8;
const FLICK = 30;

// Where each thing that can be done with something goes on its wheel
const PLACES = { use: "n", onWheel: "ne", split: "e", sell: "se", offer: "se", discard: "s", drop: "w" };

// Where each slot is round the paperdoll: down its left, down its right, and along its foot
const DOLL = Object.freeze({ left: ["head", "chest", "bracers", "legs", "mainHand"], right: ["amulet", "cloak", "gloves", "belt", "offHand"], foot: ["ring1", "boots", "ring2"] });

// What each slot's called on the paperdoll (short enough for its tile)
const SHORT = Object.freeze({ mainHand: "Weapon" });

// What stands for each slot when nothing's in it, faintly
const PLACEHOLDERS = Object.freeze({ head: "nasalHelm", amulet: "amulet", cloak: "travelCloak", chest: "mail", bracers: "bracers", gloves: "gloves", belt: "belt", legs: "trousers", boots: "leatherBoots", ring1: "ring", ring2: "ring", mainHand: "sword", offHand: "roundShield" });

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

function button(text, onClick, { label = text, disabled = false, className = "pack-button" } = {}) {
    const each = element("button", className, text);

    each.type = "button";
    each.disabled = disabled;
    each.setAttribute("aria-label", label);
    each.addEventListener("click", onClick);

    return each;
}

// A thing's icon, as SVG (a uniform's piece in its people's colours)
const icon = (item, size = 40) => `<svg viewBox="-24 -24 48 48" width="${size}" height="${size}" aria-hidden="true">${typeof item === "string" ? (ITEM_ICONS[item] ?? "") : iconOf(item)}</svg>`;

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
        this.tabs = element("div", "pack-tabs");
        this.tabs.setAttribute("role", "tablist");
        this.gold = element("p", "pack-gold");
        this.close = element("button", "pack-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Close");
        this.close.title = "Close (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());
        header.append(this.title, this.tabs, this.gold, this.close);

        this.body = element("div", "pack-body");
        this.panel.append(header, this.body);
        root.append(this.panel);

        // Where the game draws the player on the paperdoll (dragged, they turn round)
        this.dollView = element("div", "doll-view");
        this.dollView.setAttribute("aria-label", "You, as you're dressed");
        this.dollView.setAttribute("role", "img");
        this.#listenTurning();

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
        this.tab = "gear";
        this.page = 0;
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
         * unequip, use, buy, sell, arrange, sort, split, discard, drop; trading with another
         * player, offer, agree and cancel), a thing to put on an action wheel (its id), the
         * paperdoll turned (by an angle, radians), and to close.
         */
        this.onCommand = () => {};
        this.onWheel = () => {};
        this.onTurn = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /** Whether the paperdoll's showing (the game draws the player in `dollView` while it is). */
    get showingDoll() {
        return this.open && this.dollView.isConnected;
    }

    /**
     * Show (or show again) what the player has: { gold, skills: [{ tree, name, rank, title, xp,
     * from, to, grows, ability }], gear: [{ slot, label, item, info, locked, only }] (a slot each:
     * core/gear.js GEAR_SLOTS; what's in it, and gearinfo.js's description of it; `locked`: the
     * off hand behind a two-handed weapon; `only`: what alone it takes), totals (gearinfo.js
     * totals), pack: [a slot each: null, or { id, quality, count, label, about, use ("Drink",
     * "Eat"), equip ("Wear", "Wield"), takes (the slot a piece goes in), price (each, sold), info }],
     * shop: null or { name, wares: [{ item, label, price, affordable }] }, trade: null or (trading
     * with another player) { name, mine, theirs (what each offers: { gold, items: [{ id, quality,
     * count, label }] }), agreed: { mine, theirs } } }.
     */
    show(view) {
        const { gold, pack, shop, trade = null } = view;

        useDefs();
        this.view = view;
        this.title.textContent = shop ? `Trading with ${shop.name}` : trade ? `Trading with ${trade.name}` : "Pack";
        this.gold.textContent = `${gold} gold`;
        this.panel.hidden = false;
        this.panel.classList.toggle("trading", Boolean(shop || trade));
        this.panel.classList.toggle("bartering", Boolean(trade));

        if (shop || trade) {
            this.tab = "gear";
        }

        if (this.selected?.index !== undefined && !pack[this.selected.index]) {
            this.selected = null;
        }

        if (this.selected?.slot && !view.gear.find(({ slot }) => slot === this.selected.slot)?.item) {
            this.selected = null;
        }

        this.page = Math.max(0, Math.min(Math.ceil(PACK_SIZE / PACK_PAGE) - 1, this.page));
        this.#showTabs();
        this.#render();
    }

    hide() {
        this.#closeWheel();
        this.#endAsk(null);
        this.#endPress();
        this.#dolled(false);
        this.panel.hidden = true;
    }

    // The paperdoll showing (or not): the panel clear round it, and what's under the panel (the
    // minimap) out of sight through it
    #dolled(on) {
        this.panel.classList.toggle("dolled", on);
        this.panel.parentElement?.classList.toggle("pack-dolled", on);
    }

    /** Take it away (the game's done). */
    dispose() {
        document.removeEventListener("pointerdown", this.away, { capture: true });
        this.#endPress();
        this.panel.remove();
        this.wheel.element.remove();
    }

    // The tabs: Gear and Skills (trading, just what's carried)
    #showTabs() {
        const trading = Boolean(this.view.shop || this.view.trade);

        this.tabs.hidden = trading;
        this.tabs.replaceChildren(
            ...[["gear", "Gear"], ["skills", "Skills"]].map(([id, label]) => {
                const tab = button(label, () => {
                    this.tab = id;
                    this.#showTabs();
                    this.#render();
                }, { className: "pack-tab" });

                tab.setAttribute("role", "tab");
                tab.setAttribute("aria-selected", String(this.tab === id));
                tab.dataset.tab = id;

                return tab;
            }),
        );
    }

    #render() {
        const { skills, shop, trade } = this.view;
        const sections = [];

        if (this.tab === "skills" && !shop && !trade) {
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
            this.body.replaceChildren(...sections);
            this.#dolled(false);

            return;
        }

        if (shop) {
            const list = element("ul", "pack-list wares");

            list.append(
                ...shop.wares.map(({ item, label, price, affordable }) => {
                    const row = element("li", `pack-row rarity-${item.quality ?? "common"}`);
                    const picture = element("span", "pack-icon");

                    picture.innerHTML = icon(item, 28);
                    row.append(picture, element("span", "pack-label", label), element("span", "pack-price", `${price} gold`), button("Buy", () => this.onCommand({ type: "buy", item }), { label: `Buy ${label} for ${price} gold`, disabled: !affordable }));

                    return row;
                }),
            );
            sections.push(this.#section("For sale", list));
        }

        // Trading with another player: what they offer, and what the player does
        if (trade) {
            sections.push(this.#section(`${trade.name} offers`, this.#offered(trade.theirs), element("p", `pack-agreed${trade.agreed.theirs ? " yes" : ""}`, trade.agreed.theirs ? `${trade.name} agrees to this.` : `${trade.name} hasn't agreed yet.`)));
            sections.push(this.#section("You offer", this.#offered(trade.mine, { mine: true }), this.#barter(trade, this.view.gold)));
        }

        const main = element("div", "pack-main");

        // The paperdoll (not while trading), and what's carried
        if (!shop && !trade) {
            main.append(this.#doll());
        }

        main.append(this.#carried());
        sections.push(main);
        this.body.replaceChildren(...sections);
        this.#dolled(this.dollView.isConnected);
        this.#listen(main);
    }

    // --- The paperdoll ---

    #doll() {
        const section = element("section", "pack-section doll-section");
        const doll = element("div", "doll gear");
        const slots = new Map(this.view.gear.map((each) => [each.slot, each]));
        const column = (ids, where) => {
            const side = element("div", `doll-side ${where}`);

            side.append(...ids.map((id) => this.#slot(slots.get(id))));

            return side;
        };

        doll.append(column(DOLL.left, "left"), this.dollView, column(DOLL.right, "right"), column(DOLL.foot, "foot"));
        section.append(element("h3", "pack-heading", "Worn"), doll, this.#totals());

        return section;
    }

    // A slot of the paperdoll: what's in it (edged by its make), or a faint picture of what goes there
    #slot({ slot, label, item, locked = false, only = null }) {
        const cell = element("button", `doll-slot pack-worn${item ? ` rarity-${item.quality ?? "common"}` : " empty"}${locked ? " locked" : ""}`);
        const weapon = this.view.gear.find((each) => each.slot === "mainHand")?.item;

        cell.type = "button";
        cell.dataset.slot = slot;
        cell.setAttribute("aria-selected", String(this.selected?.slot === slot));
        cell.setAttribute("aria-label", item ? `${label}: ${item.label}` : locked ? `${label}: taken by the two-handed weapon` : `${label}: nothing${only ? ` (${only.toLowerCase()} only)` : ""}`);
        cell.title = item ? item.label : locked ? "The weapon in hand takes both hands" : label;

        // (The off hand behind a two-handed weapon: its ghost, greyed out, as the old games had it)
        cell.innerHTML = `<span class="pack-where">${SHORT[slot] ?? label}</span>${item ? icon(item, 34) : locked && weapon ? icon(weapon, 34) : icon(PLACEHOLDERS[slot], 34)}<span class="pack-label"></span>`;
        cell.querySelector(".pack-label").textContent = item ? item.label : locked ? "Both hands" : only ?? "—";

        if (item) {
            cell.dataset.item = item.id;
        }

        return cell;
    }

    // The totals of all they wear and have grown into; the sets they wear; who they pass for
    #totals() {
        const { rows, sets, disguise } = this.view.totals;
        const box = element("div", "doll-totals");
        const list = element("dl", "doll-stats");

        for (const { label, value } of rows) {
            list.append(element("dt", "", label), element("dd", "", value));
        }

        box.append(list);

        for (const { name, count, next } of sets) {
            box.append(element("p", "doll-set", `${name}: ${count} worn${next ? `, ${next} for more` : ""}`));
        }

        if (disguise) {
            box.append(element("p", "doll-disguise", `In their uniform, you pass for one of the ${{ human: "humans'", elf: "elves'", darkElf: "dark elves'", cat: "cat folk's", lizard: "lizard folk's", orc: "orcs'" }[disguise] ?? `${disguise}s'`} soldiers.`));
        }

        return box;
    }

    // --- What's carried ---

    #carried() {
        const section = element("section", "pack-section carried-section");
        const pages = Math.ceil(PACK_SIZE / PACK_PAGE);
        const tools = element("div", "pack-pages");

        for (let page = 0; page < pages; page++) {
            const used = this.view.pack.slice(page * PACK_PAGE, (page + 1) * PACK_PAGE).filter(Boolean).length;
            const tab = button(`${page + 1}`, () => this.#turnTo(page), { label: `Page ${page + 1} (${used} of ${PACK_PAGE} full)`, className: "pack-page" });

            tab.dataset.page = String(page);
            tab.setAttribute("aria-pressed", String(page === this.page));
            tools.append(tab);
        }

        if (!this.view.trade) {
            tools.append(button("Sort", () => this.onCommand({ type: "sort" }), { label: "Put the pack in order", className: "pack-button pack-sort" }));
        }

        const grid = element("div", "pack-grid carried");

        grid.setAttribute("role", "listbox");
        grid.setAttribute("aria-label", "Carried");
        this.grid = grid;
        this.#fillGrid();
        this.about = element("div", "pack-about");
        this.#describe();
        section.append(element("h3", "pack-heading", "Carried"), tools, grid, this.about);

        return section;
    }

    // The page of the pack shown: its slots
    #fillGrid() {
        const start = this.page * PACK_PAGE;

        this.grid.replaceChildren(...this.view.pack.slice(start, start + PACK_PAGE).map((stack, k) => this.#cell(stack, start + k)));
    }

    #turnTo(page) {
        if (page === this.page) {
            return;
        }

        this.page = page;

        for (const tab of this.panel.querySelectorAll(".pack-page")) {
            tab.setAttribute("aria-pressed", String(Number(tab.dataset.page) === page));
        }

        this.#fillGrid();
    }

    // A slot of the pack: its stack's icon, how many, and how well made
    #cell(stack, index) {
        const cell = element("button", `pack-cell${stack ? ` made-${stack.quality} rarity-${stack.quality}` : " empty"}`);

        cell.type = "button";
        cell.dataset.index = String(index);
        cell.setAttribute("role", "option");
        cell.setAttribute("aria-selected", String(this.selected?.index === index));
        cell.setAttribute("aria-label", stack ? `${stack.label}${stack.count > 1 ? `, ${stack.count}` : ""}` : "Empty");

        if (stack) {
            cell.dataset.item = stack.id;
            cell.innerHTML = `${icon(stack)}${stack.count > 1 ? `<span class="pack-count">${stack.count}</span>` : ""}`;
            cell.classList.toggle("offered", Boolean(this.#offeredOf(stack)));
        }

        return cell;
    }

    // How many of a kind of thing (as the stack is) the player offers, trading (or none)
    #offeredOf({ id, quality }) {
        return this.view.trade?.mine.items.find((item) => item.id === id && item.quality === quality)?.count ?? 0;
    }

    // What one side of a trade offers: its things and its gold (and, the player's, each to take back)
    #offered({ gold, items }, { mine = false } = {}) {
        const list = element("ul", `pack-list offer${mine ? " mine" : ""}`);
        const rows = items.map(({ id, quality, count, label, people }) => {
            const row = element("li", "pack-row");
            const picture = element("span", "pack-icon");

            picture.innerHTML = icon({ id, people }, 28);
            row.append(picture, element("span", "pack-label", `${label}${count > 1 ? ` ×${count}` : ""}`));

            if (mine) {
                row.append(button("Take back", () => this.#reoffer({ item: { id, quality }, count: 0 }), { label: `Take back ${label}` }));
            }

            return row;
        });

        if (gold) {
            const row = element("li", "pack-row");
            const picture = element("span", "pack-icon");

            picture.innerHTML = icon("gold", 28);
            row.append(picture, element("span", "pack-label", `${gold} gold`));

            if (mine) {
                row.append(button("Take back", () => this.#reoffer({ gold: 0 }), { label: "Take back the gold" }));
            }

            rows.push(row);
        }

        list.append(...(rows.length ? rows : [element("li", "pack-hint", mine ? "Nothing yet: tap something you carry to offer it." : "Nothing yet.")]));

        return list;
    }

    // Trading with another player: gold to offer, agreeing to it, calling it off
    #barter(trade, gold) {
        const actions = element("div", "pack-actions pack-barter");
        const offerGold = async () => {
            const count = await this.#howMany({ title: "Offer gold", verb: "Offer", most: gold, value: trade.mine.gold || Math.min(gold, 10) });

            if (count) {
                this.#reoffer({ gold: count });
            }
        };

        actions.append(
            button(trade.mine.gold ? "Change the gold" : "Offer gold", offerGold, { disabled: !gold }),
            button("Call it off", () => this.onCommand({ type: "cancel" })),
            button(trade.agreed.mine ? "Agreed" : "Agree", () => this.onCommand({ type: "agree" }), { label: trade.agreed.mine ? "You've agreed" : `Agree to trade with ${trade.name}`, disabled: trade.agreed.mine, className: "pack-button primary" }),
        );

        return actions;
    }

    // What the player offers, changed: as many of a kind of thing as `count` (none: taken back),
    // or the gold; the rest as it was
    #reoffer({ item = null, count = 0, gold = null }) {
        const { mine } = this.view.trade;
        const items = mine.items.filter(({ id, quality }) => !(item && id === item.id && quality === item.quality)).map(({ id, quality, count: each }) => ({ id, quality, count: each }));

        if (item && count > 0) {
            items.push({ id: item.id, quality: item.quality, count });
        }

        this.onCommand({ type: "offer", gold: gold ?? mine.gold, items });
    }

    // --- What's tapped, in words ---

    // The thing tapped (in the pack, or worn): what it is, and buttons for what can be done with it
    #describe() {
        if (!this.about) {
            return;
        }

        const worn = this.selected?.slot ? this.view.gear.find(({ slot }) => slot === this.selected.slot) : null;
        const stack = this.selected?.index !== undefined ? this.view.pack[this.selected.index] : null;
        const thing = worn?.item ?? stack;

        if (!thing) {
            const hint = !this.view.pack.some(Boolean) ? "Nothing but lint." : this.view.trade ? "Tap something to see it, and offer it." : "Tap something to see what it does. Hold a piece of gear to put it on or take it off (or drag it); hold anything else (or right-click) for what to do with it.";

            this.about.replaceChildren(element("p", "pack-hint", hint));

            return;
        }

        const info = thing.info ?? null;
        const card = element("div", `pack-card rarity-${thing.quality ?? "common"}`);
        const title = element("p", "pack-what");

        title.append(element("strong", `pack-name rarity-${thing.quality ?? "common"}`, `${thing.label}${stack?.count > 1 ? ` ×${stack.count}` : ""}`));
        card.append(title);

        if (info?.kind) {
            card.append(element("p", "pack-kind", `${info.kind}${thing.quality && thing.quality !== "common" ? ` · ${thing.quality[0].toUpperCase()}${thing.quality.slice(1)}` : ""}`));
        }

        if (info?.lines.length) {
            const lines = element("ul", "pack-lines");

            lines.append(...info.lines.map(({ text, tone }) => element("li", `tone-${tone}`, text)));
            card.append(lines);
        }

        // (Gear in the pack: what putting it on would change)
        if (stack && info?.compare.length) {
            const compare = element("ul", "pack-compare");

            compare.append(element("li", "pack-compare-title", "Put on instead of what's worn:"), ...info.compare.map(({ text, tone }) => element("li", `tone-${tone}`, text)));
            card.append(compare);
        }

        if (info?.price) {
            card.append(element("p", "pack-worth", `Sells for ${info.price} gold${stack?.count > 1 ? " each" : ""}`));
        }

        // (What a thing that isn't gear does: "Healing draught Heals 25 hit points.")
        if (!info?.lines.length && thing.about) {
            title.append(document.createTextNode(` ${thing.about}`));
        }

        const actions = element("div", "pack-actions");

        if (worn) {
            if (!this.view.shop && !this.view.trade) {
                actions.append(button("Take off", () => this.onCommand({ type: "unequip", slot: worn.slot }), { label: `Take off ${thing.label}` }));
            }
        } else {
            actions.append(...this.#actionsFor(stack).map(({ key, label }) => button(label, () => this.#do(key, this.selected.index), { label: `${label}: ${stack.label}` })));
        }

        this.about.replaceChildren(card, actions);
    }

    // What can be done with a stack: [{ key, label }] (trading with another player, only offering it)
    #actionsFor(stack) {
        const trading = Boolean(this.view.shop);
        const actions = [];

        if (this.view.trade) {
            return [{ key: "offer", label: this.#offeredOf(stack) ? "Offer more or fewer" : "Offer" }];
        }

        if ((stack.use || stack.equip) && !trading) {
            actions.push({ key: "use", label: stack.use ?? stack.equip });
        }

        // (A tome's read, not put on a wheel)
        if (stack.use && stack.use !== "Read" && !trading) {
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
        } else if (key === "offer" && this.view.trade) {
            // (As many as they carry of it, of its make, in whichever stacks)
            const most = this.view.pack.reduce((sum, each) => sum + (each?.id === stack.id && each.quality === stack.quality ? each.count : 0), 0);
            const count = most > 1 ? await this.#howMany({ title: `Offer ${stack.label}`, verb: "Offer", most, value: this.#offeredOf(stack) || most }) : 1;

            if (count) {
                this.#reoffer({ item: stack, count });
            }
        }
    }

    // --- Tapping, holding and dragging things in the pack and on the paperdoll ---

    // What's under a pointer: a slot of the pack ({ index, element }), the paperdoll's
    // ({ slot, element }), or a page's tab ({ page, element })
    #under(target) {
        const cell = target?.closest?.(".pack-cell");

        if (cell && this.panel.contains(cell)) {
            return { index: Number(cell.dataset.index), element: cell };
        }

        const slot = target?.closest?.(".doll-slot");

        if (slot && this.panel.contains(slot)) {
            return { slot: slot.dataset.slot, element: slot };
        }

        const page = target?.closest?.(".pack-page");

        return page && this.panel.contains(page) ? { page: Number(page.dataset.page), element: page } : null;
    }

    // What's in a place: a stack in the pack, or a piece worn
    #thingAt(place) {
        return place?.index !== undefined ? this.view.pack[place.index] : place?.slot ? (this.view.gear.find(({ slot }) => slot === place.slot)?.item ?? null) : null;
    }

    #listen(area) {
        area.addEventListener("pointerdown", (event) => {
            const place = this.#under(event.target);

            if (!place || place.page !== undefined || event.button !== 0 || this.press) {
                return;
            }

            const thing = this.#thingAt(place);
            const press = { id: event.pointerId, place, x: event.clientX, y: event.clientY, at: event.timeStamp, hold: null, mode: null };

            // Held: gear goes on or comes off; anything else, its wheel
            if (thing) {
                press.hold = setTimeout(() => this.#held(press), HOLD_MS);
            }

            this.press = press;
            this.moved = (each) => this.#move(each);
            this.upped = (each) => this.#up(each);
            document.addEventListener("pointermove", this.moved);
            document.addEventListener("pointerup", this.upped);
            document.addEventListener("pointercancel", this.upped);
        });

        // Right-clicked (or the menu key): the wheel, to click on
        area.addEventListener("contextmenu", (event) => {
            const place = this.#under(event.target);

            event.preventDefault();

            if (place?.index !== undefined && this.view.pack[place.index]) {
                this.#openWheel({ place, clicked: true });
            }
        });

        // Double-clicked: gear on, or off
        area.addEventListener("dblclick", (event) => {
            const place = this.#under(event.target);

            if (place && !this.view.shop && !this.view.trade) {
                this.#wear(place);
            }
        });

        // Enter or Space on a slot: tapped
        area.addEventListener("keydown", (event) => {
            const place = this.#under(event.target);

            if (place && place.page === undefined && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                this.#select(place);
            }
        });
    }

    #move(event) {
        const press = this.press;

        if (!press || press.id !== event.pointerId) {
            return;
        }

        const [dx, dy] = [event.clientX - press.x, event.clientY - press.y];

        if (press.mode === "wheel") {
            this.#steer(press, dx, dy);
        } else if (press.mode === "drag") {
            this.#drag(press, event.clientX, event.clientY);
        } else if (!press.mode && Math.hypot(dx, dy) > DRAG) {
            clearTimeout(press.hold);
            press.mode = this.#thingAt(press.place) ? "drag" : "moved";

            if (press.mode === "drag") {
                this.#drag(press, event.clientX, event.clientY);
            }
        }
    }

    #up(event) {
        const press = this.press;

        if (!press || press.id !== event.pointerId) {
            return;
        }

        this.#endPress();

        if (press.mode === "wheel") {
            if (!press.done) {
                this.#closeWheel();
            }
        } else if (press.mode === "drag") {
            const to = this.#under(document.elementFromPoint(event.clientX, event.clientY));

            press.ghost?.remove();
            this.#light(null);

            if (event.type === "pointerup" && to) {
                this.#dropOn(press.place, to);
            }
        } else if (event.type === "pointerup" && !press.mode) {
            // (Held long enough, though the page was too busy to notice in time: gear on or off)
            const thing = this.#thingAt(press.place);

            if (event.timeStamp - press.at >= HOLD_MS && thing && (press.place.slot || thing.equip) && !this.view.shop && !this.view.trade) {
                this.#held(press);
            } else {
                this.#select(press.place);
            }
        }
    }

    #endPress() {
        clearTimeout(this.press?.hold);
        this.press?.ghost?.remove();
        this.press = null;
        document.removeEventListener("pointermove", this.moved);
        document.removeEventListener("pointerup", this.upped);
        document.removeEventListener("pointercancel", this.upped);
    }

    // Held: a piece of gear put on (from the pack) or taken off (worn); anything else, its wheel
    #held(press) {
        const thing = this.#thingAt(press.place);

        if (!thing) {
            return;
        }

        if ((press.place.slot || thing.equip) && !this.view.shop && !this.view.trade) {
            press.mode = "held";
            globalThis.navigator?.vibrate?.(18);
            press.place.element.classList.add("worn-now");
            this.#wear(press.place);

            return;
        }

        if (press.place.index !== undefined) {
            this.#openWheel(press);
        }
    }

    // A piece of gear on (from the pack) or off (worn)
    #wear(place) {
        if (place.slot && this.#thingAt(place)) {
            this.onCommand({ type: "unequip", slot: place.slot });
        } else if (place.index !== undefined && this.view.pack[place.index]?.equip) {
            this.onCommand({ type: "equip", index: place.index });
        }
    }

    // Dropped somewhere: in the pack, moved (or, worn, taken off there); on the paperdoll, put on there
    #dropOn(from, to) {
        if (to.index !== undefined) {
            if (from.index !== undefined && from.index !== to.index) {
                this.onCommand({ type: "arrange", from: from.index, to: to.index });
            } else if (from.slot) {
                this.onCommand({ type: "unequip", slot: from.slot, to: to.index });
            }
        } else if (to.slot && from.index !== undefined && this.view.pack[from.index]?.equip) {
            this.onCommand({ type: "equip", index: from.index, to: to.slot });
        }
    }

    #select(place) {
        this.selected = this.#thingAt(place) ? (place.slot ? { slot: place.slot } : { index: place.index }) : null;

        for (const cell of this.panel.querySelectorAll(".pack-cell")) {
            cell.setAttribute("aria-selected", String(Number(cell.dataset.index) === this.selected?.index));
        }

        for (const slot of this.panel.querySelectorAll(".doll-slot")) {
            slot.setAttribute("aria-selected", String(slot.dataset.slot === this.selected?.slot));
        }

        this.#describe();
    }

    // Where a thing dragged would go lit (the slots of the paperdoll a piece of gear would go in,
    // lit too as it's picked up); over a page's tab, that page turned to
    #drag(press, x, y) {
        const thing = this.#thingAt(press.place);

        if (!press.ghost) {
            press.ghost = element("div", "pack-ghost");
            press.ghost.innerHTML = icon(thing, 44);
            document.body.append(press.ghost);

            for (const slot of this.panel.querySelectorAll(".doll-slot")) {
                const takes = GEAR_SLOTS.find(({ id }) => id === slot.dataset.slot)?.takes;

                slot.classList.toggle("can-take", Boolean(thing?.takes) && thing.takes === takes && press.place.index !== undefined);
            }
        }

        press.ghost.style.left = `${x}px`;
        press.ghost.style.top = `${y}px`;

        const over = this.#under(document.elementFromPoint(x, y));

        if (over?.page !== undefined) {
            this.#turnTo(over.page);
        }

        this.#light(over?.page === undefined ? over?.element : null);
    }

    #light(target) {
        if (target !== this.target) {
            this.target?.classList.remove("target");
            this.target = target ?? null;
            this.target?.classList.add("target");
        }

        if (!target && !this.press) {
            for (const slot of this.panel.querySelectorAll(".doll-slot.can-take")) {
                slot.classList.remove("can-take");
            }
        }
    }

    // Dragging across the paperdoll's picture turns the player round (it's beneath the panel's
    // ground, so heard on the panel, where it is)
    #listenTurning() {
        let last = null;

        this.body.addEventListener("pointerdown", (event) => {
            const box = this.dollView.isConnected ? this.dollView.getBoundingClientRect() : null;

            if (box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom && !this.#under(event.target)) {
                last = { id: event.pointerId, x: event.clientX };
                this.body.setPointerCapture?.(event.pointerId);
            }
        });
        this.body.addEventListener("pointermove", (event) => {
            if (last?.id === event.pointerId) {
                this.onTurn(((event.clientX - last.x) / Math.max(80, this.dollView.clientWidth)) * Math.PI * 1.5);
                last.x = event.clientX;
            }
        });

        const end = () => {
            last = null;
        };

        this.body.addEventListener("pointerup", end);
        this.body.addEventListener("pointercancel", end);
    }

    // --- A thing's wheel ---

    #openWheel(press) {
        const stack = this.view?.pack[press.place.index];

        if (!stack) {
            return;
        }

        const slots = {};
        const looks = {};

        for (const { key, label } of this.#actionsFor(stack)) {
            slots[PLACES[key]] = key;
            looks[key] = { label: key === "sell" ? "Sell" : key === "offer" ? "Offer" : label, icon: key === "use" ? iconOf(stack) : ICONS[key] };
        }

        const box = press.place.element.getBoundingClientRect();

        press.mode = "wheel";
        press.done = false;
        this.wheelFor = press.place.index;
        this.wheel.show(box.left + box.width / 2, box.top + box.height / 2, stack.id, slots, { looks, hub: iconOf(stack) });
        this.wheel.element.classList.toggle("clickable", Boolean(press.clicked));
        this.#select(press.place);
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
