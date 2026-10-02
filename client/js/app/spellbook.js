// The spellbook: a panel over the game (opened with its button, or B) showing the player's magic
// (core/spells.js):
// - the wand or grimoire in their hand, and how much it boosts their spells;
// - each school, how far it's grown (its tier, and how much more to the next; an element not yet
//   learnt, the tome that opens it), and each of its spells: known (to put on an action wheel)
//   or still to come, and at what experience (or from what tome);
// - the hexes (Stun; Hold, once Hexes brings it);
// - the spells learnt from tomes (how far each that grows with use has grown), and how many more
//   there are to be found.
//
// It only shows; putting a spell on a wheel is the game's (app/game.js).

import { ICONS } from "./icons.js";

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

// Whom a spell's cast on, in words (spells.js `target`)
const ON = Object.freeze({
    enemy: "on an enemy",
    any: "on anyone",
    friend: "on yourself or a friend",
    self: "on yourself",
    corpse: "on one fallen",
    summon: "a creature, or a player",
    place: "somewhere you've been",
});

// Seconds, briefly: "2.5 s", "5 min"
const seconds = (ms) => (ms >= 60000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 100) / 10} s`);

export class SpellbookPanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "journal spellbook");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-labelledby", "spellbooktitle");

        const header = element("header", "journal-header");

        this.title = element("h2", "journal-title", "Spellbook");
        this.title.id = "spellbooktitle";
        this.boost = element("p", "journal-rank");
        this.close = element("button", "journal-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Close");
        this.close.title = "Close (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());
        header.append(this.title, this.boost, this.close);

        this.body = element("div", "journal-body");
        this.panel.append(header, this.body);
        root.append(this.panel);

        /** What the player asks (the game does it): a spell put on an action wheel (its id). */
        this.onWheel = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /**
     * Show (or show again) the player's magic: { boost ({ label, share }, or null: nothing that
     * boosts spells in hand), schools: [{ id, label, tier, last, xp, from, to, next (the next
     * spell's name, or null), opened (false: an element not learnt yet), tome ({ label, price }:
     * the tome that opens it, if not), spells: [SPELL] }], hexes: [SPELL], tomes: [SPELL], more
     * (how many spells there are still to find in tomes) }, where SPELL is { id, label, about,
     * tier, known, at (the experience it comes at, for a school's not known yet), from (or what
     * it's learnt from: a tome), cooldown, castTime, target, needs, level, growth ({ xp, from, to }
     * for one that grows) }.
     */
    show({ boost, schools, hexes, tomes, more }) {
        this.boost.textContent = boost ? `${boost.label}: +${Math.round(boost.share * 100)}% to spells` : "No wand or grimoire in hand";
        this.panel.hidden = false;

        const scroll = this.body.scrollTop;
        const sections = [];

        for (const school of schools) {
            const growth = element("div", "spellbook-growth");
            const bar = element("div", "journal-bar");
            const fill = element("div", "journal-fill");

            fill.style.width = `${school.to === null ? 100 : Math.round(((school.xp - school.from) / (school.to - school.from)) * 100)}%`;
            bar.append(fill);

            if (school.opened === false) {
                // (An element not yet open: how to open it)
                growth.append(
                    element("p", "journal-line", "Not yet learnt"),
                    element("p", "journal-note", `Read the ${school.tome.label} to learn ${school.spells[0].label} and open ${school.label}: ${school.tome.price} gold at any adventurers' guild. Its other spells come as it grows.`),
                );
            } else {
                growth.append(
                    element("p", "journal-line", `Tier ${school.tier} of ${school.last}`),
                    bar,
                    element("p", "journal-note", school.to === null ? "Mastered: every spell of it's yours." : `${school.to - school.xp} more to ${school.next}: grown by its spells that land, the more for a higher tier.`),
                );
            }

            const list = element("ul", "journal-list spellbook-list");

            list.append(...school.spells.map((spell) => this.#row(spell)));
            sections.push(this.#section(school.label, growth, list));
        }

        const hexList = element("ul", "journal-list spellbook-list");

        hexList.append(...hexes.map((spell) => this.#row(spell)));
        sections.push(this.#section("Hexes", hexList));

        const tomeList = element("ul", "journal-list spellbook-list");

        tomeList.append(
            ...tomes.map((spell) => this.#row(spell)),
            element("li", "journal-empty", more ? `${tomes.length ? `${more} more` : `${more} spells`} to be learnt from tomes: found on those with hands who've been about the wilds a while, or given by the guilds for their harder work.` : "Every tome's spell is yours."),
        );
        sections.push(this.#section("From tomes", tomeList));

        this.body.replaceChildren(...sections);
        this.body.scrollTop = scroll;
    }

    hide() {
        this.panel.hidden = true;
    }

    // A spell: its icon, name and what it does; its cooldown, how long it takes and whom it's cast
    // on; how far it's grown; and to put it on a wheel, or when it comes
    #row({ id, label, about, tier, known, at, from, cooldown, castTime, target, needs, level, growth }) {
        const row = element("li", `spellbook-spell${known ? "" : " unknown"}`);
        const icon = element("span", "spellbook-icon");
        const text = element("div", "spellbook-text");
        const head = element("div", "spellbook-head");

        icon.innerHTML = `<svg viewBox="-24 -24 48 48" aria-hidden="true">${ICONS[id] ?? ""}</svg>`;
        head.append(element("span", "spellbook-name", label), element("span", "spellbook-tier", tier ? `Tier ${tier}` : level ? `Level ${level} of 5` : ""));
        text.append(head, element("p", "spellbook-about", about), element("p", "journal-note", [`Cooldown ${seconds(cooldown)}`, `cast in ${seconds(castTime)}`, ON[target] ?? "", needs ? `needs a ${needs} in hand` : ""].filter(Boolean).join(" · ")));

        if (growth && growth.to !== null) {
            const bar = element("div", "journal-bar");
            const fill = element("div", "journal-fill");

            fill.style.width = `${Math.round(((growth.xp - growth.from) / (growth.to - growth.from)) * 100)}%`;
            bar.append(fill);
            text.append(bar);
        }

        row.append(icon, text);

        if (known) {
            const put = element("button", "journal-button", "Put on a wheel");

            put.type = "button";
            put.setAttribute("aria-label", `Put ${label} on an action wheel`);
            put.addEventListener("click", () => this.onWheel(id));
            row.append(put);
        } else {
            row.append(element("span", "spellbook-at", from ? `From ${from}` : `At ${at}`));
        }

        return row;
    }

    #section(title, ...children) {
        const section = element("section", "journal-section");

        section.append(element("h3", "journal-heading", title), ...children);

        return section;
    }
}
