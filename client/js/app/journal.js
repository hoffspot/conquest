// The journal: a panel over the game (opened with its button, or J) telling the player where they
// stand with their people (core/standing.js):
// - their rank, how far to the next, and what each opens;
// - their card from the adventurers' guilds (one, good at every branch): its rank, how much more
//   merit to the next, and what each gives;
// - the requests they carry: who asked, what, how far it's come, where to go and how long's left
//   (each can be given up);
// - their people: who rules, whom they're at war with and allied to, how many towns and works
//   they hold, what's in their stores and which of their works others hold (docs/WAR.md *The
//   works*), and how the other peoples regard them (grudges and favours: docs/WAR.md M7);
// - the requests lately done, failed or given up;
// - where their people stand at the war's end: serving another and how near to rising, fallen, or
//   ruling the continent (docs/WAR.md M10);
// - their company: the followers they lead (docs/WAR.md M9), and how many more they could;
// - and, by a button at its top, the last messages they were told across the screen (the HUD's
//   banner: hud.js message), the newest first, and how long ago.
//
// It only shows and asks: what's done is the host's (core/host.js commands), through the game.

const element = (tag, className, text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

// "north-east", from a step [dx, dy] (y south)
const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

/** Which way, and how far, somewhere is from a point: "1.2 km north-east", "here". */
export function bearing(from, to) {
    if (!from || !to) {
        return "";
    }

    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    const distance = Math.hypot(dx, dy);

    if (distance < 60) {
        return "here";
    }

    const way = COMPASS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];

    return `${distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1)} km`} ${way}`;
}

const STATES = Object.freeze({ done: "Done", failed: "Failed", abandoned: "Given up", void: "Came to nothing" });

/**
 * How a people regards the player's, in words, from what it thinks of them (the war's standing:
 * grudges below 0, favours above): { words, tone ("grudge", "favour" or "none") }.
 */
export function regardOf(standing) {
    if (standing <= -30) {
        return { words: "bear you a deep grudge", tone: "grudge" };
    }

    if (standing < -5) {
        return { words: "bear you a grudge", tone: "grudge" };
    }

    if (standing >= 30) {
        return { words: "are much in your debt", tone: "favour" };
    }

    if (standing > 5) {
        return { words: "owe you a favour", tone: "favour" };
    }

    return { words: "think little of you either way", tone: "none" };
}

/** How many of the messages told the player across the screen the journal keeps (the newest). */
export const MESSAGES_KEPT = 10;

/**
 * How long a message must be shown for (s) to be kept: those shown for less, refusals and the like
 * ("Can't do that.", "Out of breath"), aren't news; nor is one shown till the next (0: the picture
 * lost, waiting for it to come back).
 */
export const KEPT_FROM = 2;

/**
 * The messages kept (`log`: [{ text, at (ms since 1970), times }], oldest first) with another told
 * at `at`, shown for `seconds`: the same as the last told again only counted (`times`) and its time
 * moved on, the oldest let go past MESSAGES_KEPT. The log as it was if it isn't kept.
 */
export function keepMessage(log, text, seconds, at) {
    if (!text || !(seconds >= KEPT_FROM)) {
        return log;
    }

    const last = log.at(-1);

    if (last?.text === text) {
        return [...log.slice(0, -1), { text, at, times: last.times + 1 }];
    }

    return [...log, { text, at, times: 1 }].slice(-MESSAGES_KEPT);
}

/** How long ago something was (`at` and `now`: ms since 1970), in words: "just now", "5 min ago", "2 h ago", "3 days ago". */
export function ago(at, now) {
    const minutes = Math.floor((now - at) / 60000);

    if (minutes < 1) {
        return "just now";
    }

    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours} h ago`;
    }

    const days = Math.floor(hours / 24);

    return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export class JournalPanel {
    /** @param {HTMLElement} root - The #hud screen (index.html). */
    constructor(root) {
        this.panel = element("section", "journal");
        this.panel.hidden = true;
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-labelledby", "journaltitle");

        const header = element("header", "journal-header");

        this.title = element("h2", "journal-title", "Journal");
        this.title.id = "journaltitle";
        this.rank = element("p", "journal-rank");
        this.close = element("button", "journal-close");
        this.close.type = "button";
        this.close.setAttribute("aria-label", "Close");
        this.close.title = "Close (Esc)";
        this.close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        this.close.addEventListener("click", () => this.onClose());

        // (The last messages told, or the journal again)
        this.toggle = element("button", "journal-button journal-toggle", "Messages");
        this.toggle.type = "button";
        this.toggle.setAttribute("aria-pressed", "false");
        this.toggle.addEventListener("click", () => {
            this.view = this.view === "messages" ? "journal" : "messages";

            if (this.shown) {
                this.show(this.shown);
            }
        });
        header.append(this.title, this.rank, this.toggle, this.close);

        /** What's shown: the journal, or the last messages told ("messages"). */
        this.view = "journal";
        this.shown = null;

        this.body = element("div", "journal-body");
        this.panel.append(header, this.body);
        root.append(this.panel);

        /** What the player asks (the game does it). */
        this.onAbandon = () => {};
        this.onClose = () => {};
    }

    get open() {
        return !this.panel.hidden;
    }

    /**
     * Show (or show again) where the player stands: { standing: { title, points, from, to, opens,
     * next }, guild (their card from the adventurers' guilds: { title, merit, from, to, opens,
     * next }, or null till they register), requests: [{ id, title, from, text, progress, where, left }], people: { name,
     * ruler, war: [names], allies: [names], towns, regard: [{ name, words, tone }], fate (a line, or
     * null: serving another, fallen, ruling the continent) }, done: [{
     * title, from, state }], messages: the last told, oldest first (keepMessage) }.
     */
    show(shown) {
        const { standing, guild = null, requests, people, done, company = [], most = 1, messages = [] } = shown;

        this.shown = shown;
        this.rank.textContent = `${standing.title}${people ? ` of ${people.name}` : ""}`;
        this.panel.hidden = false;
        this.toggle.textContent = this.view === "messages" ? "Journal" : "Messages";
        this.toggle.setAttribute("aria-pressed", String(this.view === "messages"));

        if (this.view === "messages") {
            this.body.replaceChildren(this.#messages(messages));

            return;
        }

        const sections = [];

        // Their rank, and the next
        const rank = element("div", "journal-standing");
        const bar = element("div", "journal-bar");
        const fill = element("div", "journal-fill");

        fill.style.width = `${standing.to === null ? 100 : Math.round(((standing.points - standing.from) / (standing.to - standing.from)) * 100)}%`;
        bar.append(fill);
        rank.append(
            element("p", "journal-line", `${standing.title}: ${standing.opens}`),
            bar,
            element("p", "journal-note", standing.next ? `${standing.to - standing.points} more standing to ${standing.next.title}: ${standing.next.opens}` : "There's no higher to rise."),
        );
        sections.push(this.#section("Standing", rank));

        // Their rank in the adventurers' guilds, and the next (or how to sign up)
        const card = element("div", "journal-standing journal-guild");

        if (guild) {
            const guildBar = element("div", "journal-bar");
            const guildFill = element("div", "journal-fill");

            guildFill.style.width = `${guild.to === null ? 100 : Math.round(((guild.merit - guild.from) / (guild.to - guild.from)) * 100)}%`;
            guildBar.append(guildFill);
            card.append(
                element("p", "journal-line", `${guild.title} rank: ${guild.opens}`),
                guildBar,
                element("p", "journal-note", guild.next ? `${guild.to - guild.merit} more merit to ${guild.next.title}: ${guild.next.opens}` : "Mithril: there's no higher rank."),
            );
            card.dataset.rank = guild.title.toLowerCase();
        } else {
            card.append(element("p", "journal-note", "Not registered. Any guild's receptionist will sign you up: one card, good at every branch."));
        }

        sections.push(this.#section("Adventurers' Guild", card));

        // What they've been asked
        const list = element("ul", "journal-list requests");

        list.append(
            ...requests.map(({ id, title, from, text, progress, where, left }) => {
                const row = element("li", "journal-request");
                const head = element("div", "journal-request-head");

                head.append(element("span", "journal-request-title", title), element("span", "journal-request-from", from));

                const give = element("button", "journal-button", "Give up");

                give.type = "button";
                give.setAttribute("aria-label", `Give up ${title}`);
                give.addEventListener("click", () => this.onAbandon(id));
                row.append(head, element("p", "journal-request-text", text), element("p", "journal-request-progress", [progress, where, left].filter(Boolean).join(" · ")), give);

                return row;
            }),
        );

        if (!requests.length) {
            list.append(element("li", "journal-empty", "Nothing asked of you. The reeves at the town halls have work for those who want it, and the guilds' boards for adventurers."));
        }

        sections.push(this.#section("Requests", list));

        // Their people
        if (people) {
            const about = element("div", "journal-people");

            // (Serving another, fallen, or ruling the continent: docs/WAR.md M10)
            if (people.fate) {
                about.append(element("p", "journal-line journal-fate", people.fate));
            }

            about.append(
                element("p", "journal-line", `Ruled by ${people.ruler}, from ${people.seat}.`),
                element("p", "journal-line", people.war.length ? `At war with ${people.war.join(", ")}.` : "At peace."),
                element("p", "journal-line", people.allies.length ? `Allied with ${people.allies.join(", ")}.` : "Allied with no one."),
                element("p", "journal-note", `${people.towns} ${people.towns === 1 ? "town" : "towns"} and ${people.works} works held.`),
                element("p", "journal-note", `In their stores: ${people.stores}.`),
                ...(people.lost ?? []).map((line) => element("p", "journal-note journal-lost", line)),
            );

            // (How the peoples they've met regard them)
            if (people.regard?.length) {
                const regard = element("ul", "journal-list regard");

                regard.append(...people.regard.map(({ name, words, tone }) => element("li", `journal-regard ${tone}`, `${name[0].toUpperCase()}${name.slice(1)} ${words}.`)));
                about.append(regard);
            }
            sections.push(this.#section("Your people", about));
        }

        // Their company
        const band = element("ul", "journal-list company");

        band.append(
            ...company.map(({ name, calling, hp, maxHp, waiting }) => {
                const row = element("li", "journal-follower");

                row.append(element("span", "journal-follower-name", name), element("span", "journal-follower-state", `${calling}, ${Math.max(0, Math.round((hp / maxHp) * 100))}%${waiting ? ", waiting" : ""}`));

                return row;
            }),
            element("li", "journal-empty", company.length ? `You can lead ${most} in all.` : `No one follows you. Adventurers at the guilds will, for gold: you can lead ${most}.`),
        );
        sections.push(this.#section("Your company", band));

        // What's been done
        if (done.length) {
            const past = element("ul", "journal-list done");

            past.append(
                ...done.map(({ title, from, state }) => {
                    const row = element("li", `journal-done ${state}`);

                    row.append(element("span", "journal-done-title", title), element("span", "journal-done-state", `${STATES[state] ?? state}${from ? ` (${from})` : ""}`));

                    return row;
                }),
            );
            sections.push(this.#section("Lately", past));
        }

        this.body.replaceChildren(...sections);
    }

    hide() {
        this.panel.hidden = true;
        this.view = "journal";
    }

    // The last messages told, the newest first
    #messages(messages) {
        const list = element("ol", "journal-list messages");
        const now = Date.now();

        list.append(
            ...[...messages].reverse().map(({ text, at, times }) => {
                const row = element("li", "journal-message");

                row.append(element("span", "journal-message-text", text), element("span", "journal-message-when", `${times > 1 ? `${times} times, last ` : ""}${ago(at, now)}`));

                return row;
            }),
        );

        if (!messages.length) {
            list.append(element("li", "journal-empty", "No messages yet. What you're told across the screen is kept here, the last ten."));
        }

        return this.#section(`The last ${MESSAGES_KEPT} messages`, list);
    }

    #section(heading, content) {
        const section = element("section", "journal-section");

        section.append(element("h3", "journal-heading", heading), content);

        return section;
    }
}
