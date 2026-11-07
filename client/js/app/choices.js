// What can go in an Action Bar slot or a wheel's slice, to choose from (app/quicksetup.js,
// app/wheelsetup.js): Nothing first, then each by its icon, its name and whom it's used on
// (wheel.js whomFor); a school's spells as one, its highest tier, with a button to open the
// rest under it (wheel.js pickerEntries: opened of itself while what's typed is one of their
// names, or, unless closed by hand, while one of them is what's there); what can't be used as
// things are (a spell needing a wand
// not in hand, a blow for another weapon) after the rest, greyed. Filtered by what kind of action
// it is (wheel.js ROLES: only the kinds there are, All first) and, on a PC, by what's typed; shown
// bigger the fewer there are.
//
// It only shows and asks: what's chosen is told to `onPick`.

import { actionOf, iconOf, pickerEntries, ROLES, rolesOf, whomFor } from "./wheel.js";

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

// The ring an empty slot's shown by
const NOTHING = '<circle r="15" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4" opacity="0.6"/>';

/** As many as there can be before they're shown smaller (the list as a filter shortens it). */
export const ROOMY = 8;

export class ChoiceList {
    constructor() {
        this.element = element("div", "choices");

        // What kind (tabs), and on a PC a box to type a name in
        this.roles = element("div", "choice-roles");
        this.roles.setAttribute("role", "tablist");
        this.roles.setAttribute("aria-label", "What kind");
        this.search = element("input", "choice-search");
        Object.assign(this.search, { type: "search", placeholder: "Find by name", autocomplete: "off", spellcheck: false });
        this.search.setAttribute("aria-label", "Find by name");
        this.search.addEventListener("input", () => {
            this.query = this.search.value.trim().toLowerCase();
            this.#draw();
        });
        this.list = element("div", "wheels-choices");
        this.list.setAttribute("role", "listbox");
        this.element.append(this.roles, this.search, this.list);

        /** The kind shown (a ROLES id, or "all"), what's typed, and the schools opened or closed by hand (by their highest tier's key). */
        this.role = "all";
        this.query = "";
        this.opened = new Set();
        this.closed = new Set();
        this.options = { keys: [], now: null, unready: [], label: (key) => actionOf(key).label, onPick: () => {} };
    }

    /**
     * Show (or show again) what can go in a slot: `keys` (as wheel.js assignable gives them),
     * `now` what's there (or null), `unready` those that can't be used as things are, each called
     * `label(key)`; `onPick(key)` hears the one chosen (null: Nothing).
     */
    show(options) {
        this.options = { ...this.options, ...options };
        this.#draw();
    }

    #draw() {
        const { keys, now, unready, label, onPick } = this.options;
        const kinds = ROLES.filter(([id]) => keys.some((key) => rolesOf(key).includes(id)));

        if (this.role !== "all" && !kinds.some(([id]) => id === this.role)) {
            this.role = "all";
        }

        // The kinds there are, All first (none, but for one kind)
        this.roles.hidden = kinds.length < 2;
        this.roles.replaceChildren(
            ...[["all", "All"], ...kinds].map(([id, name]) => {
                const tab = element("button", "choice-role", name);

                tab.type = "button";
                tab.dataset.role = id;
                tab.setAttribute("role", "tab");
                tab.setAttribute("aria-selected", String(id === this.role));
                tab.addEventListener("click", () => {
                    this.role = id;
                    this.#draw();
                });

                return tab;
            }),
        );

        // Each that's shown: of the kind, called what's typed (a school by any of its tiers)
        const named = (key) => !this.query || label(key).toLowerCase().includes(this.query);
        const ofKind = (key) => this.role === "all" || rolesOf(key).includes(this.role);
        const entries = pickerEntries(keys).filter(({ key, tiers }) => ofKind(key) && [key, ...tiers].some(named));
        const ready = ({ key }) => !unready.includes(key);
        const choices = [this.#choice(null, { label: "Nothing", now, onPick })];

        for (const { key, tiers } of [...entries.filter(ready), ...entries.filter((entry) => !ready(entry))]) {
            // (Opened by hand, or a lower tier's name typed; or, unless closed by hand, while a lower
            // tier's there)
            const open = tiers.length > 0 && (this.opened.has(key) || Boolean(this.query && !named(key)) || (!this.closed.has(key) && tiers.includes(now)));

            choices.push(this.#choice(key, { label: label(key), now, onPick, unready: unready.includes(key), tiers, open }));

            if (open) {
                choices.push(...tiers.map((tier) => this.#choice(tier, { label: label(tier), now, onPick, unready: unready.includes(tier), tier: true })));
            }
        }

        this.list.replaceChildren(...choices);
        this.list.classList.toggle("roomy", choices.length <= ROOMY);
    }

    // One to choose (`key`, or null: Nothing), by its icon, name (`label`) and whom it's used on;
    // a school's highest tier with a button to open the rest (`tiers`) beside it
    #choice(key, { label, now, onPick, unready = false, tiers = [], open = false, tier = false }) {
        const choice = element("button", "wheels-choice");

        choice.type = "button";
        choice.setAttribute("role", "option");
        choice.setAttribute("aria-selected", String(key === now));
        choice.dataset.action = key ?? "";
        choice.classList.toggle("unready", unready);
        choice.classList.toggle("tier", tier);
        choice.innerHTML = `<svg viewBox="-24 -24 48 48" width="30" height="30" aria-hidden="true">${key ? iconOf(key) : NOTHING}</svg><span><span class="choice-name"></span><small></small></span>`;
        choice.querySelector(".choice-name").textContent = label;
        choice.querySelector("small").textContent = key ? whomFor(key) : "";
        choice.addEventListener("click", () => onPick(key));

        if (!tiers.length) {
            return choice;
        }

        // (The school's other tiers: opened under it, or closed again)
        const group = element("div", "choice-group");
        const opener = element("button", "choice-open", `${tiers.length + 1} tiers`);

        group.setAttribute("role", "presentation");
        opener.type = "button";
        opener.setAttribute("aria-expanded", String(open));
        opener.setAttribute("aria-label", `${open ? "Close" : "Open"} ${label}'s other tiers`);
        opener.addEventListener("click", () => {
            (open ? this.opened : this.closed).delete(key);
            (open ? this.closed : this.opened).add(key);
            this.#draw();
        });
        group.append(choice, opener);

        return group;
    }
}
