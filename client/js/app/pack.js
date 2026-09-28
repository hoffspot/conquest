// The pack: a panel over the game (opened with its button, or I) showing what the player's grown
// into and what they carry (core/progress.js):
// - their coppers;
// - each skill: its rank and title, how far to the next, what makes it grow, what it's brought;
// - their gear (weapon, body, shield: armour can be taken off);
// - what they carry (to put on, or use).
// Trading with a shopkeeper (their talk's "Show me what you have"), it shows the shop's wares
// too, each to buy, and what they carry can be sold.
//
// It only shows and asks: what's done is the host's (core/host.js commands), through the game.

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

function button(text, onClick, { label = text, disabled = false } = {}) {
    const each = element("button", "pack-button", text);

    each.type = "button";
    each.disabled = disabled;
    each.setAttribute("aria-label", label);
    each.addEventListener("click", onClick);

    return each;
}

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

        /** What the player asks (the game does it): each with what it's for. */
        this.onEquip = () => {};
        this.onUnequip = () => {};
        this.onUse = () => {};
        this.onBuy = () => {};
        this.onSell = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /**
     * Show (or show again) what the player has: { gold, skills: [{ tree, name, rank, title, xp,
     * from, to, grows, ability }], gear: [{ slot, label, item }], pack: [{ label, use, equip }],
     * shop: null or { name, wares: [{ item, label, price, affordable }] } }, their selling
     * prices in `pack[k].price` when trading.
     */
    show(view) {
        const { gold, skills, gear, pack, shop } = view;

        this.title.textContent = shop ? `Trading with ${shop.name}` : "Pack";
        this.gold.textContent = `${gold} coppers`;
        this.panel.hidden = false;
        this.panel.classList.toggle("trading", Boolean(shop));

        const sections = [];

        if (shop) {
            const list = element("ul", "pack-list wares");

            list.append(
                ...shop.wares.map(({ item, label, price, affordable }) => {
                    const row = element("li", "pack-row");

                    row.append(element("span", "pack-label", label), element("span", "pack-price", `${price} coppers`), button("Buy", () => this.onBuy(item), { label: `Buy ${label} for ${price} coppers`, disabled: !affordable }));

                    return row;
                }),
            );
            sections.push(this.#section("For sale", list));
        }

        // What they carry: to put on, use, or (trading) sell
        const carried = element("ul", "pack-list carried");

        carried.append(
            ...pack.map(({ label, use, equip, price }, index) => {
                const row = element("li", "pack-row");

                row.append(element("span", "pack-label", label));

                if (shop) {
                    row.append(element("span", "pack-price", `${price} coppers`), button("Sell", () => this.onSell(index), { label: `Sell ${label} for ${price} coppers` }));
                } else if (equip) {
                    row.append(button(equip === "weapon" ? "Wield" : "Wear", () => this.onEquip(index), { label: `${equip === "weapon" ? "Wield" : "Wear"} ${label}` }));
                } else if (use) {
                    row.append(button("Use", () => this.onUse(index), { label: `Use ${label}` }));
                }

                return row;
            }),
        );

        if (!pack.length) {
            carried.append(element("li", "pack-empty", "Nothing but lint."));
        }

        sections.push(this.#section("Carried", carried));

        // What they wear and wield
        const worn = element("ul", "pack-list gear");

        worn.append(
            ...gear.map(({ slot, label, item }) => {
                const row = element("li", "pack-row");

                row.append(element("span", "pack-slot", { weapon: "Weapon", body: "Body", shield: "Shield" }[slot]), element("span", "pack-label", item ? label : "—"));

                if (item && slot !== "weapon" && !shop) {
                    row.append(button("Take off", () => this.onUnequip(slot), { label: `Take off ${label}` }));
                }

                return row;
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
        this.panel.hidden = true;
    }

    #section(heading, content) {
        const section = element("section", "pack-section");

        section.append(element("h3", "pack-heading", heading), content);

        return section;
    }
}
