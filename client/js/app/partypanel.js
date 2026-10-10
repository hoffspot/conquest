// The party menu: a panel over the game (opened with its button, or P) listing those with the
// player (core/host.js partyOf): their hired adventurers, the creatures they've called and the dead
// they've raised, in that order. Each with their likeness, what they are (and, a creature called
// or raised, how long it has left), their health, and whether they follow or wait; and buttons to
// tell them to follow, to wait where they are, or to go (asked twice: "Dismiss?"). With no one,
// how to come by some.
//
// It only shows and asks: what's done is the host's (core/host.js "order" commands), through the
// game.

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

/** How long a Dismiss button waits to be pressed again, to be sure (ms). */
export const DISMISS_SURE_MS = 3000;

/** How long's left of something (ms), as minutes and seconds: "4:05". */
export function timeLeft(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * What one of the party is, in words: a hired adventurer by their calling ("Hired warrior"), a
 * creature called or raised by its name and how long it has left ("Called wolf · 4:05 left").
 */
export function memberKind({ kind, calling = null, creature = null, left = null }) {
    const time = left === null ? "" : ` · ${timeLeft(left)} left`;

    if (kind === "adventurer") {
        return `Hired ${calling ?? "adventurer"}`;
    }

    if (kind === "summon") {
        return `Called ${creature ?? "creature"}${time}`;
    }

    if (kind === "risen") {
        return `Risen ${creature ?? "dead"}${time}`;
    }

    return "With you";
}

export class PartyPanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "journal party-panel");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-labelledby", "partytitle");

        const header = element("header", "journal-header");

        this.title = element("h2", "journal-title", "Party");
        this.title.id = "partytitle";
        this.count = element("p", "journal-rank");
        this.close = element("button", "journal-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Close");
        this.close.title = "Close (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());
        header.append(this.title, this.count, this.close);

        this.body = element("div", "journal-body");
        this.list = element("ul", "journal-list party-list");
        this.empty = element("p", "journal-note party-empty");
        this.body.append(this.list, this.empty);
        this.panel.append(header, this.body);
        root.append(this.panel);

        // Each member's row, kept from one showing to the next (by id): { root, canvas, kind,
        // fill, state, follow, wait, dismiss, painted, sure }
        this.rows = new Map();

        /** What the player asks (the game does it): (id, "follow", "wait" or "dismiss"); (id): to help them. */
        this.onOrder = () => {};
        this.onChoose = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /**
     * Show (or show again, as things change) those with the player: { members: [{ id, name, kind
     * ("adventurer", "summon", "risen"), calling, creature, hp, maxHp, waiting, away, left (ms, or
     * null), ally (the one chosen to help), picture (an ImageData, or null) }], most (how many
     * adventurers they can lead) }.
     */
    show({ members = [], most = 1 } = {}) {
        const ids = new Set(members.map(({ id }) => id));

        for (const [id, row] of this.rows) {
            if (!ids.has(id)) {
                clearTimeout(row.sure);
                row.root.remove();
                this.rows.delete(id);
            }
        }

        members.forEach((member, k) => {
            const row = this.rows.get(member.id) ?? this.#row(member.id);

            if (this.list.children[k] !== row.root) {
                this.list.insertBefore(row.root, this.list.children[k] ?? null);
            }

            this.#fill(row, member);
        });

        const hired = members.filter(({ kind }) => kind === "adventurer").length;

        this.count.textContent = members.length ? `${members.length} with you` : "";
        this.empty.textContent = members.length
            ? `You can lead ${most} adventurer${most === 1 ? "" : "s"} (${hired} now). Tap one's icon to help them; hold it for more.`
            : `No one's with you. Adventurers at the guilds will follow you for gold (you can lead ${most}); Summon calls a creature to your side, and Zombify raises the fallen.`;
        this.panel.hidden = false;
    }

    hide() {
        this.panel.hidden = true;
    }

    // A member's row: their likeness (their name's first letter till it's drawn), name, what they
    // are, health, whether they follow; Follow or Wait, and Dismiss
    #row(id) {
        const root = element("li", "party-row");
        const face = element("button", "party-face");
        const canvas = element("canvas", "party-likeness");
        const initial = element("span", "party-initial");
        const text = element("div", "party-text");
        const name = element("span", "party-name");
        const kind = element("span", "party-kind");
        const bar = element("div", "party-bar");
        const fill = element("div", "party-fill");
        const state = element("span", "party-state");
        const actions = element("div", "party-actions");
        const follow = element("button", "journal-button party-follow", "Follow");
        const wait = element("button", "journal-button party-wait", "Wait");
        const dismiss = element("button", "journal-button party-dismiss", "Dismiss");
        const row = { root, canvas, initial, name, kind, fill, state, follow, wait, dismiss, face, painted: false, sure: null };

        root.dataset.id = id;
        face.type = "button";
        face.title = "Help them (your heals and wards go to them)";
        face.append(initial, canvas);
        face.addEventListener("click", () => this.onChoose(id));
        bar.append(fill);
        text.append(name, kind, bar, state);

        for (const button of [follow, wait, dismiss]) {
            button.type = "button";
        }

        follow.addEventListener("click", () => this.onOrder(id, "follow"));
        wait.addEventListener("click", () => this.onOrder(id, "wait"));

        // (Asked twice, to be sure: the first press turns it to "Dismiss?" for a moment)
        dismiss.addEventListener("click", () => {
            if (row.sure) {
                clearTimeout(row.sure);
                row.sure = null;
                this.onOrder(id, "dismiss");

                return;
            }

            dismiss.textContent = "Dismiss?";
            dismiss.classList.add("sure");
            row.sure = setTimeout(() => {
                row.sure = null;
                dismiss.textContent = "Dismiss";
                dismiss.classList.remove("sure");
            }, DISMISS_SURE_MS);
        });

        actions.append(follow, wait, dismiss);
        root.append(face, text, actions);
        this.rows.set(id, row);

        return row;
    }

    // A member's row as they are now
    #fill(row, { name, kind, calling = null, creature = null, hp, maxHp, waiting = false, away = false, left = null, ally = false, picture = null }) {
        const health = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));

        row.root.className = `party-row ${kind}${ally ? " ally" : ""}${away ? " away" : ""}`;
        row.initial.textContent = name.slice(0, 1).toUpperCase();
        row.name.textContent = name;
        row.kind.textContent = memberKind({ kind, calling, creature, left });
        row.fill.style.width = `${Math.round(health * 100)}%`;
        row.state.textContent = `${hp} / ${maxHp}${waiting ? " · Waiting" : " · Following"}${away ? " · Not here" : ""}${ally ? " · Chosen to help" : ""}`;
        row.follow.hidden = !waiting;
        row.wait.hidden = waiting;
        row.face.setAttribute("aria-label", `Help ${name}`);
        row.face.setAttribute("aria-pressed", String(ally));

        if (picture && !row.painted) {
            row.canvas.width = picture.width;
            row.canvas.height = picture.height;
            row.canvas.getContext("2d").putImageData(picture, 0, 0);
            row.painted = true;
            row.face.classList.add("painted");
        }
    }
}
