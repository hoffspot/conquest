// The party menu: a panel over the game (opened with its button, or P) listing those with the
// player (core/host.js partyOf): their hired adventurers, the creatures they've called and the dead
// they've raised, in that order. Each with their likeness, what they are (and, a creature called
// or raised, how long it has left), their health, and whether they follow or wait; and buttons to
// tell them to follow, to wait where they are, or to go (asked twice: "Dismiss?"). With no one,
// how to come by some.
//
// Playing together, above them, the players in their party (core/host.js partyFor), its leader
// crowned, each with who's with them; its leader can make another leader or put them out (asked
// twice), and anyone can leave it; and below, the other players in the world, each to be asked to
// it ("Invite"), or said to be asked already.
//
// It only shows and asks: what's done is the host's (core/host.js "order" and "party" commands),
// through the game.

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

        // (Playing together: the party's players, and the others to ask; each shown only then)
        this.playersHeading = element("h3", "journal-heading", "Players");
        this.players = element("ul", "journal-list party-players");
        this.othersHeading = element("h3", "journal-heading", "Ask to your party");
        this.others = element("ul", "journal-list party-others");
        this.unitsHeading = element("h3", "journal-heading", "With you");
        this.list = element("ul", "journal-list party-list");
        this.empty = element("p", "journal-note party-empty");
        this.body.append(this.playersHeading, this.players, this.othersHeading, this.others, this.unitsHeading, this.list, this.empty);
        this.together = null;
        this.panel.append(header, this.body);
        root.append(this.panel);

        // Each member's row, kept from one showing to the next (by id): { root, canvas, kind,
        // fill, state, follow, wait, dismiss, painted, sure }
        this.rows = new Map();

        /**
         * What the player asks (the game does it): (id, "follow", "wait" or "dismiss"); (id): to
         * help them; and of their party of players (what: "invite", "leave", "remove" or
         * "promote", who: a player's id).
         */
        this.onOrder = () => {};
        this.onChoose = () => {};
        this.onParty = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /**
     * Show (or show again, as things change) those with the player: { members: [{ id, name, kind
     * ("adventurer", "summon", "risen"), calling, creature, hp, maxHp, waiting, away, left (ms, or
     * null), ally (the one chosen to help), picture (an ImageData, or null) }], most (how many
     * adventurers they can lead); playing together, `players` (those in their party, they among
     * them, the longest in it first: [{ id, name, leader, me, away, with: [names] }]), `others`
     * (the other players in the world not in it: [{ id, name, asked }]), `leads` (whether they
     * lead it) and `full` (whether it's as many as it can be) }.
     */
    show({ members = [], most = 1, players = [], others = [], leads = false, full = false, together = false } = {}) {
        this.#together({ players, others, leads, full, together });

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

        this.count.textContent = members.length + Math.max(0, players.length - 1) ? `${members.length + Math.max(0, players.length - 1)} with you` : "";
        this.empty.textContent = members.length
            ? `You can lead ${most} adventurer${most === 1 ? "" : "s"} (${hired} now). Tap one's icon to help them; hold it for more.`
            : `No one's with you. Adventurers at the guilds will follow you for gold (you can lead ${most}); Summon calls a creature to your side, and Zombify raises the fallen.`;
        this.panel.hidden = false;
    }

    hide() {
        this.panel.hidden = true;
    }

    // The party's players and the others to ask, made again only when what's shown of them
    // changes (not their buttons under the finger every time it's shown)
    #together({ players, others, leads, full, together }) {
        const shown = JSON.stringify({ players, others, leads, full, together });

        for (const part of [this.playersHeading, this.players, this.othersHeading, this.others, this.unitsHeading]) {
            part.hidden = !together;
        }

        if (shown === this.together) {
            return;
        }

        this.together = shown;
        this.players.replaceChildren(
            ...(players.length
                ? players.map(({ id, name, leader, me, away, with: theirs = [] }) => {
                      const row = element("li", `party-player${leader ? " leader" : ""}${away ? " away" : ""}`);
                      const text = element("div", "party-text");
                      const actions = element("div", "party-actions");

                      row.dataset.id = id;
                      text.append(element("span", "party-name", `${leader ? "♛ " : ""}${me ? `${name} (you)` : name}`), element("span", "party-kind", [leader ? "Leads the party" : "In the party", away ? "Not here" : "", theirs.length ? `With them: ${theirs.join(", ")}` : ""].filter(Boolean).join(" · ")));

                      if (me) {
                          actions.append(this.#sure("Leave party", "Leave?", () => this.onParty("leave", id)));
                      } else if (leads) {
                          const promote = element("button", "journal-button party-promote", "Make leader");

                          promote.type = "button";
                          promote.addEventListener("click", () => this.onParty("promote", id));
                          actions.append(promote, this.#sure("Remove", "Remove?", () => this.onParty("remove", id)));
                      }

                      row.append(text, actions);

                      return row;
                  })
                : [element("li", "journal-empty", "You're in no party. Ask another player to yours below; up to four play together in one.")]),
        );
        this.others.replaceChildren(
            ...(others.length
                ? others.map(({ id, name, asked }) => {
                      const row = element("li", "party-player");
                      const invite = element("button", "journal-button party-invite", asked ? "Asked" : "Invite");

                      row.dataset.id = id;
                      invite.type = "button";
                      invite.disabled = asked || full;
                      invite.addEventListener("click", () => this.onParty("invite", id));
                      row.append(element("span", "party-name", name), invite);

                      return row;
                  })
                : [element("li", "journal-empty", full ? "Your party's full." : players.length ? "Everyone else playing here is in your party." : "No one else is playing in this world.")]),
        );
    }

    // A button pressed twice to be sure: the first press turns it to `sure` a moment
    #sure(label, sure, onSure) {
        const button = element("button", "journal-button party-sure", label);
        let timer = null;

        button.type = "button";
        button.addEventListener("click", () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
                onSure();

                return;
            }

            button.textContent = sure;
            button.classList.add("sure");
            timer = setTimeout(() => {
                timer = null;
                button.textContent = label;
                button.classList.remove("sure");
            }, DISMISS_SURE_MS);
        });

        return button;
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
